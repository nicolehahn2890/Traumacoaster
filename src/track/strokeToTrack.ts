/**
 * Strich → Bahn, Version 3 („Bühnen-Zeichnen“ mit Gesten-Interpreter).
 *
 * Der Boden ist eine Bühne in Perspektive mit fünf Spuren. Die Lesart des Strichs steht in `gesture.ts`:
 * Am Boden ist oben gleich hinten, aber die Spuren sind fest (die Bahn liegt genau auf der Spur, dazwischen nur
 * geformte Übergänge); steil hoch ist Höhe; Kehren werden Halbkreise in die Nachbarspuren, eine volle Drehung in
 * der Höhe ein Looping. Diese Datei bereitet den Strich vor (Glätten), macht die gelesene Linie fahrbar
 * (Mindesthöhe, Kuppen- und Talradien, Knotenwahl) und kümmert sich um Rundenschluss, Fortsetzen und Schließen.
 */
import type { Vec2 } from '@/core/math';
import { dist, smoothstep } from '@/core/math';
import type { Vec3 } from '@/core/math3';
import { add3, dist3, len3, normalize3, scale3, sub3 } from '@/core/math3';
import { dedupe, smoothStroke } from '@/core/rdp';
import { fitWithCorners3 } from '@/core/bezierFit3';
import { reduceNodes, type ApexHint } from './reduceNodes';
import { alignOpposite } from './edit';
import { interpretGesture, lanesForRadius, radiusForDrop, type BlockedInfo, type InterpretedPoint, type StrokeEvent, type StrokeMode } from './gesture';
import { createNode, emptyPath, isAutoNode, isClosed, nodeIn, nodeOut, nodePos, type PathClosure, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, laneRise, laneScale, toStage, type StagePoint } from './stage';

export type { BlockedInfo, InterpretedPoint, StrokeEvent, StrokeMode } from './gesture';

export interface StrokeOptions {
  /** Bodenhöhe (Welt) an x, Spur z */
  groundHeight?: (x: number, z: number) => number;
  /** Station auf der Bühne, auf die ein Rundenschluss zielt (Standard: Strichanfang) */
  closeAt?: StagePoint;
  groundClearance?: number;
  maxHeight?: number;
  /** Kehren sind immer möglich (eine Umkehr des Strichs ist nichts anderes); die Option bleibt für die Level-Daten */
  allowTurns?: boolean;
  allowLoops?: boolean;
  fitError?: number;
  /** Startzustand (Überzeichnen, Fortsetzen): Tiefe und Lesart vorgeben */
  startZ?: number;
  startMode?: StrokeMode;
  /** Ziel-Tiefe am Ende (Überzeichnen): wird über die letzten 25 % eingeblendet */
  endZ?: number;
  /** Offene Bahn sofort mit automatischem Rückweg schließen (Standard: nein, die Bahn bleibt offen) */
  autoClose?: boolean;
  /** Bühnen-Meter: endet der Strich so nah an der Station, wird die Runde geschlossen (Standard 8 m) */
  closeSnap?: number;
  /** Knotenwahl: 'apex' (Standard, Scheitel-Semantik, wenige Knoten) oder 'legacy' (Schneider-Fit mit 0,3 m) */
  fit?: 'apex' | 'legacy';
  /** Vorschau während des Strichs: weniger Glättungs-Durchläufe, doppelte Fit-Toleranz, kein Rundenschluss,
   *  offene Kehre in der Höhe roh (die Bahn springt nicht zwischen Lesarten) */
  preview?: boolean;
  /** Bühnen-Meter am Anfang, die nicht umgeformt werden (Einlauf beim Fortsetzen) */
  lockLength?: number;
}

export interface StrokeResult {
  path: TrackPath;
  events: StrokeEvent[];
  points: InterpretedPoint[];
  /** Der Strich wollte am Spurende in eine Richtung ohne Spur: die Bahn endet am Scheitel (siehe gesture.ts) */
  blocked?: BlockedInfo;
}

const TURNAROUND_LANES = 2; // Kehre in die Station bei Ankunft gegen die Fahrtrichtung
const Z_BLEND = 28; // Meter: Rückweg vor der Schluss-Kehre eine Spur nach außen führen
const RESAMPLE = 0.5;
/** Gauß-Glättung des Strichs (σ in Bühnen-Metern): Zittern weg, Formen ab ~4 m bleiben */
const SMOOTH_SIGMA = 1.5;
/** Rückwärts-Haken bis zu dieser Weite (Bühnen-Meter) gelten in removeHooks als Zittern */
const HOOK_MAX = 5;

/**
 * Magnetische Spuren (Bearbeitung): Tiefen nahe einer Spurlinie (±0,2) rasten auf die Spur ein, dazwischen bleibt
 * die Tiefe stetig. Der Strich selbst liest seit v3 nur noch ganze Spuren (siehe gesture.ts).
 */
export function magnetLane(z: number): number {
  const n = Math.round(z);
  const d = z - n;
  const dead = 0.2;
  if (Math.abs(d) <= dead) return n;
  return n + Math.sign(d) * ((Math.abs(d) - dead) * (0.5 / (0.5 - dead)));
}

/** Resampling einer Punktfolge auf gleichmäßigen Abstand */
function resample(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = dist(a, b);
    if (d < 1e-9) continue;
    let t = (step - carry) / d;
    while (t <= 1) {
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      t += step / d;
    }
    carry = d - (t - step / d) * d;
    carry = ((d - (t - step / d) * d) % step + step) % step;
  }
  const last = points[points.length - 1];
  const o = out[out.length - 1];
  if (dist(o, last) > step * 0.3) out.push(last);
  return out;
}

/** Kleine Rückwärts-Haken (x kehrt um weniger als minRetreat um und läuft dann weiter) sind Handzittern,
 *  keine Kehren: Ohne diesen Filter würden sie zu Spitzen oder Mini-Schleifen in der Bahn. */
export function removeHooks(pts: Vec2[], minRetreat = HOOK_MAX): Vec2[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: Vec2[] = [pts[0]];
  let dir = 0;
  let ext = pts[0].x;
  let i = 1;
  while (i < n) {
    const x = pts[i].x;
    if (dir === 0) {
      if (Math.abs(x - out[0].x) > 0.5) dir = Math.sign(x - out[0].x);
      ext = x;
      out.push(pts[i]);
      i++;
      continue;
    }
    if ((x - ext) * dir >= 0) {
      ext = x;
      out.push(pts[i]);
      i++;
      continue;
    }
    // Rückwärts: wie weit, bevor der Strich wieder über das bisherige Extrem hinausläuft?
    let j = i;
    let retreat = 0;
    while (j < n && (pts[j].x - ext) * dir < 0) {
      retreat = Math.max(retreat, (ext - pts[j].x) * dir);
      j++;
    }
    if (retreat >= minRetreat || j >= n) {
      // echte Kehre (oder der Strich endet rückwärts): Richtung wechseln
      dir = -dir;
      ext = x;
      out.push(pts[i]);
      i++;
      continue;
    }
    // kleiner Haken: Punkte i..j−1 fallen weg
    i = j;
  }
  return out;
}

/**
 * Gauß-Glättung entlang des (gleichmäßig abgetasteten) Strichs. Fingerzittern von einigen Dezimetern
 * verschwindet, Formen ab einigen Metern bleiben. Die Enden werden linear gespiegelt, damit Anfang und
 * Ende (Station, Strichende) an Ort und Stelle bleiben.
 */
export function gaussianSmooth(pts: Vec2[], sigma = SMOOTH_SIGMA, step = RESAMPLE): Vec2[] {
  const n = pts.length;
  if (n < 3 || sigma <= 0) return pts.slice();
  const r = Math.max(1, Math.ceil((3 * sigma) / step));
  const w: number[] = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-((k * step) ** 2) / (2 * sigma * sigma)));
  const at = (i: number): Vec2 => {
    if (i < 0) return { x: 2 * pts[0].x - pts[-i].x, y: 2 * pts[0].y - pts[-i].y };
    if (i >= n) return { x: 2 * pts[n - 1].x - pts[2 * n - 2 - i].x, y: 2 * pts[n - 1].y - pts[2 * n - 2 - i].y };
    return pts[i];
  };
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < -(n - 1) || j > 2 * n - 2) continue;
      const p = at(j);
      const wk = w[k + r];
      sx += p.x * wk;
      sy += p.y * wk;
      sw += wk;
    }
    out.push({ x: sx / sw, y: sy / sw });
  }
  out[0] = pts[0];
  out[n - 1] = pts[n - 1];
  return out;
}

/**
 * Gauß-Glättung einer 3D-Punktfolge entlang ihrer Bogenlänge (Punktabstand beliebig). Enden gespiegelt,
 * Anfangs- und Endpunkt bleiben fest (Station, Anschluss beim Überzeichnen).
 */
export function smoothPolyline3(pts: Vec3[], sigma: number): Vec3[] {
  const n = pts.length;
  if (n < 3 || sigma <= 0) return pts.slice();
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist3(pts[i - 1], pts[i]);
  const reach = 3 * sigma;
  const mirror = (i: number, about: number): Vec3 => ({ x: 2 * pts[about].x - pts[i].x, y: 2 * pts[about].y - pts[i].y, z: 2 * pts[about].z - pts[i].z });
  const out: Vec3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sw = 0;
    const add = (p: Vec3, d: number) => {
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      sx += p.x * w; sy += p.y * w; sz += p.z * w; sw += w;
    };
    for (let j = i; j >= 0 && cum[i] - cum[j] <= reach; j--) add(pts[j], cum[i] - cum[j]);
    for (let j = i + 1; j < n && cum[j] - cum[i] <= reach; j++) add(pts[j], cum[j] - cum[i]);
    // Spiegelung über den Anfang (Abstand wächst weiter nach außen)
    for (let j = 1; j < n && cum[i] + cum[j] <= reach; j++) add(mirror(j, 0), cum[i] + cum[j]);
    for (let j = n - 2; j >= 0 && cum[n - 1] - cum[i] + (cum[n - 1] - cum[j]) <= reach; j--) add(mirror(j, n - 1), cum[n - 1] - cum[i] + (cum[n - 1] - cum[j]));
    out[i] = sw > 0 ? { x: sx / sw, y: sy / sw, z: sz / sw } : pts[i];
  }
  out[0] = pts[0];
  out[n - 1] = pts[n - 1];
  return out;
}

/** Strich aufbereiten: Doppelte raus, gleichmäßig abtasten, glätten (Haken bügelt der Interpreter selbst aus) */
export function prepareStroke(stroke: StagePoint[]): Vec2[] {
  let pts: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  pts = dedupe(pts, 0.15);
  pts = smoothStroke(pts, 5);
  pts = resample(pts, RESAMPLE);
  pts = gaussianSmooth(pts);
  return pts;
}

const gestureOptions = (opts: StrokeOptions) => ({
  ground: opts.groundHeight,
  groundClearance: opts.groundClearance,
  startZ: opts.startZ,
  startMode: opts.startMode,
  allowLoops: opts.allowLoops,
  preview: opts.preview,
  lockLength: opts.lockLength,
  closeAt: opts.closeAt,
  closeSnap: opts.closeSnap,
});

/** Die Lesart: Bühnenpunkte → (x, Höhe, Spur, Modus), siehe gesture.ts */
export function interpretStroke(pts: Vec2[], opts: StrokeOptions): InterpretedPoint[] {
  return interpretGesture(pts, gestureOptions(opts)).points;
}

/** Lesart mit Ereignissen (Kehren, Loopings); beim Überzeichnen blendet das Ende auf die Ziel-Tiefe */
export function interpretWithEvents(pts: Vec2[], opts: StrokeOptions): { points: InterpretedPoint[]; events: StrokeEvent[]; blocked?: BlockedInfo } {
  const r = interpretGesture(pts, gestureOptions(opts));
  const n = r.points.length;
  if (opts.endZ !== undefined && n > 2) {
    const from = Math.floor(n * 0.75);
    const zAtFrom = r.points[from].z;
    for (let i = from; i < n; i++) {
      const f = (i - from) / Math.max(1, n - 1 - from);
      r.points[i].z = zAtFrom + (opts.endZ - zAtFrom) * smoothstep(f);
    }
  }
  return r;
}

/** Scharfe Knicke mit kleinem Bogen abrunden (3D) */
export function roundCorners3(points: Vec3[], radius = 5, minAngleDeg = 35): Vec3[] {
  if (points.length < 3) return points.slice();
  const cosLimit = Math.cos((minAngleDeg * Math.PI) / 180);
  const out: Vec3[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = sub3(p, points[i - 1]);
    const b = sub3(points[i + 1], p);
    const la = Math.hypot(a.x, a.y, a.z);
    const lb = Math.hypot(b.x, b.y, b.z);
    if (la < 1e-6 || lb < 1e-6) continue;
    const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
    if (c >= cosLimit) {
      out.push(p);
      continue;
    }
    const r = Math.min(radius, la * 0.45, lb * 0.45);
    const p0 = add3(p, scale3(normalize3(scale3(a, -1)), r));
    const p1 = add3(p, scale3(normalize3(b), r));
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const mt = 1 - t;
      out.push({ x: mt * mt * p0.x + 2 * mt * t * p.x + t * t * p1.x, y: mt * mt * p0.y + 2 * mt * t * p.y + t * t * p1.y, z: mt * mt * p0.z + 2 * mt * t * p.z + t * t * p1.z });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Ramer-Douglas-Peucker in 3D, liefert behaltene Indizes */
export function simplify3(points: Vec3[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, i) => i);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const segDist = (p: Vec3, a: Vec3, b: Vec3): number => {
    const ab = sub3(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    if (l2 < 1e-12) return dist3(p, a);
    const ap = sub3(p, a);
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / l2));
    return dist3(p, add3(a, scale3(ab, t)));
  };
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
  return out;
}

const RAISE_MAX = 30; // Meter: so weit darf der Begrenzer einen Punkt höchstens über die gezeichnete Höhe heben (Sicherung)
const KEPT_REACH = 30; // Meter um einen Looping, in denen das Gefälle für den Begrenzer aus der gezeichneten Höhe kommt
const CREST_G = 2.0; // Kuppen: höchstens 2 g nach oben (mit Sicherheitsfaktor 1,4: g im Sitz etwa −0,4, Floater-Airtime)
const VALLEY_G = 3.0; // Täler: höchstens 3 g zusätzlich in den Sitz
const LIFT_V2 = 36; // kleinstes Tempo-Quadrat (Kettenzug 6 m/s)
const CURVE_R_MIN = 3;

/** 3D-Linie gleichmäßig abtasten (lineare Interpolation entlang der Bogenlänge), Anfang und Ende bleiben */
export function resample3(pts: Vec3[], step: number): Vec3[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out: Vec3[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = dist3(a, b);
    if (len < 1e-9) continue;
    let t = step - carry;
    while (t <= len) {
      out.push(add3(a, scale3(sub3(b, a), t / len)));
      t += step;
    }
    carry = len - (t - step);
  }
  const last = pts[n - 1];
  if (dist3(out[out.length - 1], last) < step * 0.25 && out.length > 1) out[out.length - 1] = last;
  else out.push(last);
  return out;
}

/**
 * Kuppen und Täler auf tempo-gerechte Radien bringen, wie es ein Bahnplaner tut: Das Tempo wird aus der
 * Fallhöhe seit dem höchsten Punkt davor geschätzt (v² ≈ 2·g·Δh, mindestens Liftgeschwindigkeit). Eine
 * Kuppe braucht R ≥ v²/(CREST_G·g), sonst hebt es die Fahrgäste aus dem Sitz; ein Tal R ≥ v²/(VALLEY_G·g).
 * Die Bahn wird dabei nur angehoben (Schultern an Kuppen, Talsohlen), nie abgesenkt: Hügel behalten ihre
 * Höhe, das Gelände wird überbrückt statt nachgefahren.
 *
 * Rechnung: örtliche Bedingung an die zweite Differenz je Punkt (mit dem Radius dieses Punkts), gelöst
 * durch Durchläufe vor und zurück: Eine zu scharfe Kuppe setzt den nächsten Punkt in Laufrichtung auf die
 * Fortsetzung der erlaubten Parabel (das pflanzt sich wie eine Parabel fort, bis sie die Bahn wieder
 * trifft), eine zu scharfe Senke hebt den Punkt selbst. Beides nur anheben. Die Enden bleiben während der
 * Rechnung frei (ein festgehaltenes Ende neben einer Stufe würde die Parabel endlos rückwärts treiben) und
 * werden danach gesetzt: Anfang immer, Ende bei geschlossener Runde; dort ist die Bahn ohnehin eben
 * (Einfahrt), es entsteht keine Stufe. Loopings bleiben unangetastet (dort ist der Wagen kopfüber, die
 * Kuppe ist gewollt). Erwartet gleichmäßig abgetastete Punkte (resample3).
 */
export function limitVerticalCurvature(world: Vec3[], keep: (i: number) => boolean = () => false, pinEnd = false, maxSweeps = 400): void {
  const n = world.length;
  if (n < 3) return;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + dist3(world[i - 1], world[i]);
  const y0 = Float64Array.from(world, (p) => p.y);
  const g = 9.81;
  const rCrest = new Float64Array(n);
  const rValley = new Float64Array(n);
  let hMax = y0[0];
  for (let i = 0; i < n; i++) {
    hMax = Math.max(hMax, y0[i]);
    const v2 = Math.max(LIFT_V2, 2 * g * (hMax - y0[i]));
    // Sicherheitsfaktor: Der Bezier-Fit (Toleranz 0,3 m) überzeichnet Krümmungen örtlich etwas
    rCrest[i] = Math.max(CURVE_R_MIN, (1.4 * v2) / (CREST_G * g));
    rValley[i] = Math.max(CURVE_R_MIN, v2 / (VALLEY_G * g));
  }
  const kept = new Uint8Array(n);
  for (let i = 0; i < n; i++) kept[i] = keep(i) ? 1 : 0;
  // Punkte im Umkreis von KEPT_REACH Metern um festgehaltene Punkte
  const nearKept = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!kept[i]) continue;
    for (let j = i; j >= 0 && s[i] - s[j] <= KEPT_REACH; j--) nearKept[j] = 1;
    for (let j = i; j < n && s[j] - s[i] <= KEPT_REACH; j++) nearKept[j] = 1;
  }
  const y = Float64Array.from(y0);
  for (let k = 0; k < maxSweeps; k++) {
    let changed = false;
    const step = (i: number, forward: boolean) => {
      const d1 = s[i] - s[i - 1];
      const d2 = s[i + 1] - s[i];
      if (d1 < 1e-6 || d2 < 1e-6) return;
      // Die Tests messen die Sehnenhöhe senkrecht; auf einem Gefälle ist die Sehnenhöhe quer zur Bahn um den
      // Kosinus des Gefälles größer. Ohne den Faktor ließ der Begrenzer an steilen Flanken (Auslauf eines Drops)
      // bis zu doppelt so enge Radien durch, und der Wagen spürte 6 g statt der 4 g, für die das Tal ausgelegt ist.
      // Nahe festgehaltener Punkte (Looping) kommt das Gefälle aus der gezeichneten Höhe (y0): Mit dem laufenden
      // Gefälle schrumpfte der Faktor, je steiler die Regeln die Bahn hoben, und hinter dem festen Punkt
      // schaukelten sich Vorwärts- und Rückwärtsregel bis in den Himmel auf.
      const src = nearKept[i] ? y0 : y;
      const sinA = Math.max(-1, Math.min(1, (src[i + 1] - src[i - 1]) / (d1 + d2)));
      const cosA = Math.max(0.3, Math.sqrt(1 - sinA * sinA));
      // Senke: der Punkt darf nicht tiefer liegen als die Parabel durch die Nachbarn
      if (!kept[i]) {
        const mid = y[i - 1] + ((y[i + 1] - y[i - 1]) * d1) / (d1 + d2);
        const lim = Math.min(y0[i] + RAISE_MAX, mid - ((d1 * d2) / (2 * rValley[i])) * cosA);
        if (y[i] < lim - 1e-6) {
          y[i] = lim;
          changed = true;
        }
      }
      // Kuppe: der nächste Punkt in Laufrichtung darf nicht tiefer liegen als die Fortsetzung der Parabel
      // (Steigung aus dem vorigen Nachbarn, Krümmung −1/R; exakt für Parabeln, auch bei ungleichen Schritten).
      // Nie über RAISE_MAX hinaus: Hinter einem festgehaltenen Punkt (Looping) können sich Vorwärts- und
      // Rückwärtsregel sonst gegenseitig hochschaukeln, bis die Bahn senkrecht in den Himmel läuft.
      if (forward && !kept[i + 1]) {
        const slope = (y[i] - y[i - 1]) / d1;
        const lim = Math.min(y0[i + 1] + RAISE_MAX, y[i] + slope * d2 - ((d2 * (d1 + d2)) / (2 * rCrest[i])) * cosA);
        if (y[i + 1] < lim - 1e-6) {
          y[i + 1] = lim;
          changed = true;
        }
      } else if (!forward && !kept[i - 1]) {
        const slope = (y[i + 1] - y[i]) / d2;
        const lim = Math.min(y0[i - 1] + RAISE_MAX, y[i] - slope * d1 - ((d1 * (d1 + d2)) / (2 * rCrest[i])) * cosA);
        if (y[i - 1] < lim - 1e-6) {
          y[i - 1] = lim;
          changed = true;
        }
      }
    };
    for (let i = 1; i < n - 1; i++) step(i, true);
    for (let i = n - 2; i >= 1; i--) step(i, false);
    if (!changed) break;
  }
  for (let i = 0; i < n; i++) world[i].y = i === 0 || (pinEnd && i === n - 1) || kept[i] ? y0[i] : Math.max(y0[i], y[i]);
}

/** Interpretierte Punkte → Knoten (Anheben über Terrain, Ecken runden, 3D-Fit) */
/**
 * Gelesene Punkte → dichte Weltpunktfolge (Meter, z in Metern), fahrbar gemacht: Mindesthöhe, Bodenhöhe,
 * geglättet, Kuppen/Täler auf fahrbare Radien, Ecken gerundet, max. 1 m Punktabstand. Dazu die Scheitel der
 * Ereignisse (Looping, Kehre) als Hinweise für die Knotenwahl.
 */
export function densePolyline(points: InterpretedPoint[], opts: StrokeOptions, events: StrokeEvent[]): { pts: Vec3[]; hints: ApexHint[] } {
  const ground = opts.groundHeight ?? (() => 0);
  const clearance = opts.groundClearance ?? 0.6;
  // Höhe über dem Boden der Spur (nie unter der Mindesthöhe); die Bodenhöhe kommt erst nach dem Glätten dazu,
  // damit die Bahn dem Gelände folgt und trotzdem keine Knicke an der Mindesthöhe entstehen
  const rel: Vec3[] = points.map((p) => ({ x: p.x, y: Math.max(clearance, p.y), z: p.z * LANE_DEPTH }));
  // Der Strich ist schon geglättet; hier verschwinden die Knicke, die erst beim Lesen entstehen
  // (Anheben auf die Mindesthöhe am Fuß eines Hügels, Anschluss der Steilkurven, Spurwechsel)
  const read: Vec3[] = smoothPolyline3(rel, SMOOTH_SIGMA).map((p) => ({ x: p.x, y: p.y + ground(p.x, p.z / LANE_DEPTH), z: p.z }));
  // Scheitelpunkte der Ereignisse und Bogenlängen der Loopings merken (die Punktfolge wird gleich neu abgetastet)
  const cumRead = new Float64Array(read.length);
  for (let i = 1; i < read.length; i++) cumRead[i] = cumRead[i - 1] + dist3(read[i - 1], read[i]);
  const apexOf = (e: StrokeEvent): Vec3 => read[Math.max(0, Math.min(read.length - 1, e.index))];
  const loopRanges = events.filter((e) => e.kind === 'loop').map((e) => [cumRead[Math.max(0, e.from ?? e.index)], cumRead[Math.min(read.length - 1, e.to ?? e.index)]] as const);
  // Kuppen und Täler (auch die des Geländes) auf fahrbare Radien bringen; Loopings bleiben, wie gezeichnet
  const world = resample3(read, RESAMPLE);
  const cumW = new Float64Array(world.length);
  for (let i = 1; i < world.length; i++) cumW[i] = cumW[i - 1] + dist3(world[i - 1], world[i]);
  const inLoop = (i: number) => loopRanges.some(([a, b]) => cumW[i] >= a - 1 && cumW[i] <= b + 1);
  // Der Bahnplaner (Kuppen- und Talradien) greift erst beim Loslassen: Während des Strichs folgt die Bahn der Hand
  if (!opts.preview) limitVerticalCurvature(world, inLoop, dist3(world[0], world[world.length - 1]) < 1);
  if (opts.maxHeight && opts.maxHeight > 0) for (const p of world) p.y = Math.min(p.y, opts.maxHeight);
  let pts = roundCorners3(world);
  const keep = simplify3(pts, 0.04);
  pts = keep.map((i) => pts[i]);
  // wieder verdichten (max. 1 m Abstand), damit der Fit auch auf geraden Stücken Überschwinger erkennt
  const dense: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(dist3(a, b) / 1.0));
    for (let k = 1; k <= n; k++) dense.push(add3(a, scale3(sub3(b, a), k / n)));
  }
  pts = dense;
  const hints: ApexHint[] = events.map((e) => ({ pos: apexOf(e), kind: e.kind === 'loop' ? 'loopApex' : 'turn' }));
  return { pts, hints };
}

/**
 * Vorschau-Knoten: alle PREVIEW_NODE_STEP Meter ein Knoten genau auf der Punktfolge, Tangenten aus den Nachbarn
 * (Catmull-Rom). Kein Fit, also nichts, was von Vorschau zu Vorschau anders einrastet; die Scheitel der Ereignisse
 * bekommen ihre Knotenart (Looping-Ring in der Vorschau).
 */
function previewNodes(pts: Vec3[], hints: ApexHint[]): TrackNode[] {
  const n = pts.length;
  if (n < 2) return [];
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist3(pts[i - 1], pts[i]);
  const idx: number[] = [0];
  let next = PREVIEW_NODE_STEP;
  for (let i = 1; i < n - 1; i++) {
    if (cum[i] >= next) {
      idx.push(i);
      next = cum[i] + PREVIEW_NODE_STEP;
    }
  }
  if (cum[n - 1] - cum[idx[idx.length - 1]] < PREVIEW_NODE_STEP * 0.4 && idx.length > 1) idx.pop();
  idx.push(n - 1);
  const nodes: TrackNode[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const t = normalize3(sub3(b, a));
    const nd = createNode(p.x, p.y, p.z / LANE_DEPTH);
    const lIn = k > 0 ? (cum[i] - cum[idx[k - 1]]) / 3 : 0;
    const lOut = k < idx.length - 1 ? (cum[idx[k + 1]] - cum[i]) / 3 : 0;
    nd.inX = -t.x * lIn; nd.inY = -t.y * lIn; nd.inZ = (-t.z * lIn) / LANE_DEPTH;
    nd.outX = t.x * lOut; nd.outY = t.y * lOut; nd.outZ = (t.z * lOut) / LANE_DEPTH;
    nodes.push(nd);
  }
  for (const h of hints) {
    let best = -1;
    let bestD = Infinity;
    nodes.forEach((nd, i) => {
      const d = dist3(nodePos(nd), h.pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best > 0 && nodes[best].kind === 'normal') nodes[best].kind = h.kind;
  }
  return nodes;
}
const PREVIEW_NODE_STEP = 2.5;

export function pointsToNodes(points: InterpretedPoint[], opts: StrokeOptions, events: StrokeEvent[]): TrackNode[] {
  const { pts, hints } = densePolyline(points, opts, events);
  if (opts.preview) return previewNodes(pts, hints);
  // Knoten an den Scheiteln (Kuppen, Täler, Kurven, Loopings) mit festen Tangenten, dazwischen so wenige
  // Segmente wie nötig (reduceNodes); 'legacy': Schneider-Fit ohne Ecken mit 0,3 m (ein Oval braucht rund zehn Knoten)
  const legacy = opts.fit === 'legacy';
  const reduced = legacy ? null : reduceNodes(pts, hints, { ...(opts.fitError ? { tolTight: opts.fitError, tolLoose: opts.fitError * 3 } : {}), tolScale: opts.preview ? 2 : 1 });
  const segments = reduced ? reduced.segments : fitWithCorners3(pts, opts.fitError ?? 0.3, 179);
  const nodes: TrackNode[] = [];
  const mk = (p: Vec3): TrackNode => createNode(p.x, p.y, p.z / LANE_DEPTH);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const nd = mk(seg.p0);
    nd.outX = seg.p1.x - seg.p0.x; nd.outY = seg.p1.y - seg.p0.y; nd.outZ = (seg.p1.z - seg.p0.z) / LANE_DEPTH;
    if (i > 0) {
      const prev = segments[i - 1];
      nd.inX = prev.p2.x - prev.p3.x; nd.inY = prev.p2.y - prev.p3.y; nd.inZ = (prev.p2.z - prev.p3.z) / LANE_DEPTH;
    }
    nodes.push(nd);
  }
  if (segments.length) {
    const last = segments[segments.length - 1];
    const end = mk(last.p3);
    end.inX = last.p2.x - last.p3.x; end.inY = last.p2.y - last.p3.y; end.inZ = (last.p2.z - last.p3.z) / LANE_DEPTH;
    nodes.push(end);
  }
  // Ereignis-Knoten markieren: aus der Scheitelwahl, sonst (legacy) der nächste Knoten zum Scheitelpunkt
  if (reduced) {
    reduced.kinds.forEach((k, i) => {
      if (k !== 'normal' && nodes[i] && nodes[i].kind === 'normal') nodes[i].kind = k;
    });
    return nodes;
  }
  const apexOf = (e: StrokeEvent): Vec3 => hints[events.indexOf(e)]?.pos ?? { x: 0, y: 0, z: 0 };
  for (const e of events) {
    const apex = apexOf(e);
    let best = -1;
    let bestD = Infinity;
    nodes.forEach((nd, i) => {
      const d = dist3(nodePos(nd), apex);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && nodes[best].kind === 'normal') nodes[best].kind = e.kind === 'loop' ? 'loopApex' : 'turn';
  }
  return nodes;
}

/** Die vollständige Pipeline für einen neuen Strich (Bühnenkoordinaten). */
export function strokeToTrack(stroke: StagePoint[], opts: StrokeOptions = {}): StrokeResult {
  const pts = prepareStroke(stroke);
  if (pts.length < 2) return { path: emptyPath(), events: [], points: [] };
  // Ein neuer Strich beginnt an der Station: dorthin zielt der Rundenschluss
  const { points, events, blocked } = interpretWithEvents(pts, { ...opts, closeAt: opts.closeAt ?? { X: pts[0].x, Y: pts[0].y } });
  if (points.length < 2) return { path: emptyPath(), events: [], points: [], blocked };
  // Rundenschluss erst beim Loslassen: Während des Strichs springt die Bahn nicht in die Station
  if (!opts.preview) snapEndToStart(points, opts.groundHeight ?? (() => 0), events, undefined, opts.closeSnap);
  const nodes = pointsToNodes(points, opts, events);
  if (nodes.length < 2) return { path: emptyPath(), events: [], points, blocked };
  nodes[0].kind = 'station';
  const path: TrackPath = { ...emptyPath(), nodes };
  // In der Vorschau bleibt die Bahn offen (nur ein Hinweis zur Station); geschlossen wird beim Loslassen
  if (opts.preview) path.closed = false;
  else closePath(path);
  if (opts.autoClose) closeTrack(path);
  return { path, events, points, blocked };
}

const CLOSE_SNAP = 8; // Bühnen-Meter: endet der Strich so nah an seinem Start, wird die Runde geschlossen
const CLOSE_APPROACH = 14; // Meter: über diese Strecke wird das Ende auf die gerade Einfahrt in die Station geführt
const CLOSE_U_REACH = 40; // Meter: so weit vor dem Ende darf die Schluss-Kehre beginnen

/** Ziel des Rundenschlusses: Position (Welt, Tiefe in Metern) und Abfahrtsrichtung der Station */
export interface CloseTarget {
  pos: Vec3;
  dir: Vec3;
}

/**
 * Rundenschluss von Hand. Endet der Strich (auf der Bühne) nahe der Station, wird das Ende sauber in die
 * Station geführt. Zwei Fälle:
 * - Schluss-Kehre: Der Strich kommt gegen die Abfahrtsrichtung an der Station vorbei und dreht dahinter
 *   zur Station um (Oval, Rundkurs). Die gezeichnete Kehre wird durch einen Halbkreis ersetzt, dessen
 *   Mitte auf der Station liegt: Radius aus den Spuren zwischen Rückweg und Station, Höhe gleitet mit.
 * - Einfahrt: Der Strich kommt in Abfahrtsrichtung an. Die letzten Meter werden weich auf die gerade
 *   Einfahrt gelegt (gleiche Spur, Höhe und Richtung wie die Abfahrt).
 * Die Hand trifft die Station nie genau; ohne diesen Schritt entstünde am Schluss ein Schlenker oder eine
 * S-Kurve mit winzigem Radius. Kommt der Strich gegen die Abfahrtsrichtung auf derselben Spur an, bleibt
 * es bei closePath (Kehre in die Nachbarspur).
 */
export function snapEndToStart(points: InterpretedPoint[], ground: (x: number, z: number) => number, events: StrokeEvent[] = [], target?: CloseTarget, snap = CLOSE_SNAP): boolean {
  const n = points.length;
  if (n < 20) return false;
  const W = (p: InterpretedPoint): Vec3 => ({ x: p.x, y: p.y + ground(p.x, p.z), z: p.z * LANE_DEPTH });
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist3(W(points[i - 1]), W(points[i]));
  const total = cum[n - 1];
  if (!target && total < 3 * CLOSE_APPROACH) return false;
  let k = 1;
  while (k < n - 1 && cum[k] < 3) k++;
  const start = target ? target.pos : W(points[0]);
  const startDir = target ? normalize3(target.dir) : normalize3(sub3(W(points[k]), start));
  const end = W(points[n - 1]);
  const sStart = toStage(start.x, start.y, start.z / LANE_DEPTH);
  const sEnd = toStage(end.x, end.y, end.z / LANE_DEPTH);
  if (Math.hypot(sStart.X - sEnd.X, sStart.Y - sEnd.Y) > snap) return false;
  const dx = Math.sign(startDir.x) || 1;

  // Schluss-Kehre: zuletzt lief der Strich hinter der Station gegen die Abfahrtsrichtung
  let e = n - 1;
  while (e > 0 && (points[e - 1].x - points[e].x) * dx <= 0.05) e--;
  if ((start.x - points[e].x) * dx >= 1.5 && total - cum[e] <= CLOSE_U_REACH) {
    let c = e;
    while (c > 0 && (points[c].x - start.x) * dx < 0 && total - cum[c] <= CLOSE_U_REACH) c--;
    if ((points[c].x - start.x) * dx >= 0 && c > 0) {
      const wc = W(points[c]);
      let lanes = Math.abs(wc.z - start.z) / LANE_DEPTH;
      if (lanes >= 0.75) {
        // Rückweg nur eine Spur neben der Station, aber Tempo (Fallhöhe seit dem höchsten Punkt): die letzten
        // Meter des Rückwegs eine Spur weiter nach außen führen, damit der Halbkreis zwei Spuren bekommt
        let hMax = 0;
        for (let i = 0; i <= c; i++) hMax = Math.max(hMax, W(points[i]).y);
        if (lanes < 1.75 && lanesForRadius(radiusForDrop(hMax - wc.y)) >= 2) {
          const side = Math.sign(wc.z - start.z) || 1;
          const zTarget = start.z / LANE_DEPTH + 2 * side;
          if (zTarget >= LANE_MIN && zTarget <= LANE_MAX) {
            const zc = points[c].z;
            for (let i = c; i >= 0; i--) {
              const back = cum[c] - cum[i];
              if (back >= Z_BLEND) break;
              const f = smoothstep(1 - back / Z_BLEND);
              points[i].z = zc + (zTarget - zc) * f;
              points[i].y = Math.max(0, W(points[i]).y - ground(points[i].x, points[i].z));
            }
            wc.z = points[c].z * LANE_DEPTH;
            lanes = Math.abs(wc.z - start.z) / LANE_DEPTH;
          }
        }
        const R = (lanes * LANE_DEPTH) / 2;
        const m = Math.max(8, Math.ceil((Math.PI * R) / RESAMPLE));
        const arc: InterpretedPoint[] = [];
        for (let j = 1; j <= m; j++) {
          const th = (Math.PI * j) / m;
          const f = (1 - Math.cos(th)) / 2;
          const x = start.x - dx * R * Math.sin(th);
          const z = (wc.z + (start.z - wc.z) * f) / LANE_DEPTH;
          const yAbs = wc.y + (start.y - wc.y) * f;
          const g = ground(x, z);
          arc.push({ x, y: Math.max(0, yAbs - g), z, mode: yAbs - g < 0.35 ? 'floor' : 'height' });
        }
        points.splice(c + 1, n - c - 1, ...arc);
        for (let i = events.length - 1; i >= 0; i--) if (events[i].index > c) events.splice(i, 1);
        return true;
      }
    }
  }

  // Einfahrt in Abfahrtsrichtung
  let mIdx = n - 2;
  while (mIdx > 0 && total - cum[mIdx] < 4) mIdx--;
  const endDir = normalize3(sub3(end, W(points[mIdx])));
  if (endDir.x * startDir.x + endDir.z * startDir.z < 0.2) return false;
  const L = Math.min(CLOSE_APPROACH, total / 3);
  for (let i = n - 1; i >= 0; i--) {
    const d = total - cum[i];
    if (d >= L) break;
    const f = smoothstep(1 - d / L);
    const ideal = sub3(start, scale3(startDir, d));
    const w = W(points[i]);
    const x = w.x + (ideal.x - w.x) * f;
    const y = w.y + (ideal.y - w.y) * f;
    const z = w.z + (ideal.z - w.z) * f;
    points[i].x = x;
    points[i].z = Math.max(LANE_MIN, Math.min(LANE_MAX, z / LANE_DEPTH));
    points[i].y = Math.max(0, y - ground(x, points[i].z));
  }
  return true;
}

const LEAD_IN = 6; // Meter: Einlauf entlang der Endtangente, damit der neue Strich tangential anschließt

/**
 * Bahn am offenen Ende fortsetzen. Der neue Strich beginnt genau am Endknoten (der Finger trifft das leuchtende
 * Ende nur ungefähr; der Versatz wird über die ersten 6 m abgebaut) und wird zusammen mit einem geraden Einlauf
 * entlang der Endtangente gelesen: Glättung und Lesart laufen so über die Nahtstelle hinweg, die neue Bahn
 * verlässt das Ende ohne Knick. Der Endknoten übernimmt die Tangente des neuen Stücks (G1 zur bisherigen Bahn).
 * Endet der Strich an der Station, schließt sich die Bahn (beim Loslassen, nicht in der Vorschau).
 */
export function extendTrack(path: TrackPath, stroke: StagePoint[], opts: StrokeOptions = {}, out?: { points?: InterpretedPoint[]; blocked?: BlockedInfo }): TrackPath | null {
  if (isClosed(path) || path.nodes.length < 2 || stroke.length < 2) return null;
  const ground = opts.groundHeight ?? (() => 0);
  const clearance = opts.groundClearance ?? 0.6;
  const nodes = path.nodes;
  const end = nodes[nodes.length - 1];
  const pe = nodePos(end);
  let dirE = normalize3(sub3(pe, nodeIn(end)));
  if (len3(dirE) < 0.5) dirE = normalize3(sub3(pe, nodePos(nodes[nodes.length - 2])));
  if (len3(dirE) < 0.5) dirE = { x: 1, y: 0, z: 0 };
  const stageOf = (p: Vec3): StagePoint => toStage(p.x, p.y, p.z / LANE_DEPTH);
  const endSt = stageOf(pe);
  const lead: StagePoint[] = [];
  for (let d = LEAD_IN; d > 0.01; d -= RESAMPLE) lead.push(stageOf(sub3(pe, scale3(dirE, d))));
  let leadLen = 0;
  for (let i = 1; i < lead.length; i++) leadLen += Math.hypot(lead[i].X - lead[i - 1].X, lead[i].Y - lead[i - 1].Y);
  leadLen += Math.hypot(endSt.X - lead[lead.length - 1].X, endSt.Y - lead[lead.length - 1].Y);
  const off = { X: endSt.X - stroke[0].X, Y: endSt.Y - stroke[0].Y };
  let s = 0;
  const moved: StagePoint[] = stroke.map((p, i) => {
    if (i) s += Math.hypot(p.X - stroke[i - 1].X, p.Y - stroke[i - 1].Y);
    const f = 1 - smoothstep(s / LEAD_IN);
    return { X: p.X + off.X * f, Y: p.Y + off.Y * f };
  });
  const pts = prepareStroke([...lead, endSt, ...moved]);
  if (pts.length < 3) return null;
  // Lesart ab dem Ende: Boden um die Mindesthöhe angehoben (die Bahn liegt darüber), Spur und Lesart vom Ende
  const raised = (x: number, z: number) => ground(x, z) + clearance;
  const zEnd = pe.z / LANE_DEPTH;
  const startMode: StrokeMode = pe.y - raised(pe.x, zEnd) > 1.0 ? 'height' : 'floor';
  const station = nodes[0];
  const sp = nodePos(station);
  const readOpts: StrokeOptions = { ...opts, groundHeight: raised, groundClearance: 0, startZ: zEnd, startMode, closeAt: stageOf(sp), lockLength: leadLen };
  const { points, events, blocked } = interpretWithEvents(pts, readOpts);
  if (out) out.blocked = blocked;
  // Einlauf abschneiden: die bisherige Bahn bleibt, der neue Teil beginnt genau am Ende
  let cut = 0;
  while (cut < points.length - 1 && (points[cut].s ?? 0) < leadLen - 1e-6) cut++;
  const kept = points.slice(cut).map((p) => ({ ...p }));
  if (kept.length < 2) return null;
  kept[0] = { x: pe.x, y: Math.max(0, pe.y - raised(pe.x, zEnd)), z: zEnd, mode: startMode, s: kept[0].s };
  const ev = events
    .filter((e) => e.index >= cut)
    .map((e) => ({ ...e, index: e.index - cut, from: e.from !== undefined ? Math.max(0, e.from - cut) : undefined, to: e.to !== undefined ? e.to - cut : undefined }));
  if (out) out.points = kept;
  if (!opts.preview) snapEndToStart(kept, raised, ev, { pos: sp, dir: sub3(nodeOut(station), sp) }, opts.closeSnap);
  const newNodes = pointsToNodes(kept, readOpts, ev);
  if (newNodes.length < 2) return null;
  const result: TrackPath = { nodes: nodes.map((n) => ({ ...n })), elements: path.elements.map((e) => ({ ...e })), startType: path.startType, templates: { ...path.templates } };
  const last = result.nodes[result.nodes.length - 1];
  // Der erste neue Knoten liegt auf dem Ende: das Ende übernimmt seine Ausgangs-Tangente, ausgerichtet an der Einfahrt
  const first = newNodes.shift()!;
  last.outX = first.outX; last.outY = first.outY; last.outZ = first.outZ;
  alignOpposite(last, 'in');
  result.nodes.push(...newNodes);
  result.closed = false;
  if (!opts.preview) closePath(result);
  return result;
}

/** Halbkreis-Kehre in der x/z-Ebene (3D-Knoten mit Handles). dir = ±1 in x. */
export function buildTurnArc(xCenter: number, dir: number, yFrom: number, yTo: number, zFrom: number, zTo: number): TrackNode[] {
  const R = (Math.abs(zTo - zFrom) * LANE_DEPTH) / 2;
  const zc = (zFrom + zTo) / 2;
  const sgn = zTo >= zFrom ? 1 : -1;
  const steps = 4;
  const out: TrackNode[] = [];
  for (let k = 0; k <= steps; k++) {
    const th = (Math.PI * k) / steps;
    const f = k / steps;
    const x = xCenter + dir * R * Math.sin(th);
    const y = yFrom + (yTo - yFrom) * f;
    const zMeters = zc * LANE_DEPTH - sgn * R * Math.cos(th);
    const nd = createNode(x, y, zMeters / LANE_DEPTH, 'closeTurn');
    const dTh = Math.PI / steps / 3;
    // Tangente: d/dθ (x, y, z) = (dir·R·cosθ, (yTo−yFrom)/π, sgn·R·sinθ)
    const hx = dir * R * Math.cos(th) * dTh;
    const hy = ((yTo - yFrom) / Math.PI) * dTh;
    const hz = (sgn * R * Math.sin(th) * dTh) / LANE_DEPTH;
    nd.outX = hx; nd.outY = hy; nd.outZ = hz;
    nd.inX = -hx; nd.inY = -hy; nd.inZ = -hz;
    out.push(nd);
  }
  return out;
}

/**
 * Verbindet das Ende mit dem Start, wenn der Spieler die Bahn selbst dorthin gezeichnet hat (3D):
 * - Ende auf dem Start: direkt geschlossen (bei Ankunft gegen die Fahrtrichtung mit Kehre in die Station).
 * - Ende nahe am Start (≤ 6 m): weiche Verbindung.
 * - Sonst bleibt die Bahn offen (closed = false). Den automatischen Rückweg ergänzt erst closeTrack.
 */
/**
 * Rundenschluss rückgängig machen: automatische Knoten entfernen, vom Schluss entfernte Knoten wieder
 * anhängen und überschriebene Handles zurücksetzen. Danach ist die Bahn wieder so, wie sie gezeichnet
 * (bzw. zuletzt bearbeitet) wurde, und closePath kann den Schluss neu berechnen.
 */
export function restoreClosure(path: TrackPath): void {
  const nodes = path.nodes;
  for (let i = nodes.length - 1; i >= 0; i--) if (isAutoNode(nodes[i])) nodes.splice(i, 1);
  const c = path.closure;
  if (!c) return;
  if (c.lastOut && c.lastOut.index < nodes.length) {
    const n = nodes[c.lastOut.index];
    [n.outX, n.outY, n.outZ] = c.lastOut.out;
  }
  if (nodes.length) [nodes[0].inX, nodes[0].inY, nodes[0].inZ] = c.firstIn;
  nodes.push(...c.trimmed.map((n) => ({ ...n })));
  delete path.closure;
}

/** Protokoll anlegen: Stations-Eingang sichern, bevor der Schluss ihn überschreibt */
function startClosure(first: TrackNode): PathClosure {
  return { trimmed: [], firstIn: [first.inX, first.inY, first.inZ], lastOut: null };
}

/**
 * Bahn schließen (wiederholbar). Zuerst wird ein früherer Schluss zurückgenommen (restoreClosure), dann:
 * - Ende auf dem Start: direkt geschlossen (bei Ankunft gegen die Fahrtrichtung mit Kehre in die Station).
 * - Ende nahe am Start (≤ 6 m): weiche Verbindung.
 * - Sonst bleibt die Bahn offen (closed = false). Den automatischen Rückweg ergänzt erst closeTrack.
 * Alles, was der Schluss entfernt oder überschreibt, steht im Protokoll path.closure.
 */
export function closePath(path: TrackPath): void {
  restoreClosure(path);
  const nodes = path.nodes;
  if (nodes.length < 2) return;
  path.closed = true;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const pf = nodePos(first);
  const pl = nodePos(last);
  const gap = dist3(pf, pl);
  // Abstand in der Bühnenebene und in Spuren getrennt: Ein Rückweg, der hinter der Station eine Spur
  // weiter hinten ankommt, ist von Hand geschlossen (die Hand trifft die Spur nicht genau)
  const gapXY = Math.hypot(pf.x - pl.x, pf.y - pl.y);
  const gapLanes = Math.abs(first.z - last.z);
  const endDir = normalize3(sub3(pl, nodeIn(last)));
  const startDir = normalize3(sub3(nodeOut(first), pf));
  const closure = startClosure(first);

  // Ende am Start, aber Ankunft gegen die Abfahrtsrichtung der Station (Rundkurs von Hand geschlossen,
  // Rückweg hinter der Station): ohne Kehre gäbe es eine Spitzkehre an der Station. Die letzten Knoten,
  // die schon im Bereich der Kehre liegen, werden durch einen Halbkreis in die Station ersetzt.
  if (gapXY <= 6 && gapLanes <= 1.2 && endDir.x * startDir.x < -0.2) {
    const l2Z = nodes[nodes.length - 1].z;
    const R = Math.max((TURNAROUND_LANES * LANE_DEPTH) / 2, (Math.abs(l2Z - first.z) * LANE_DEPTH) / 2);
    while (nodes.length > 3 && Math.abs(nodes[nodes.length - 1].x - first.x) < 2 * R) closure.trimmed.unshift(nodes.pop()!);
    const l2 = nodes[nodes.length - 1];
    const zTo = first.z;
    let zFrom = l2.z;
    if (Math.abs(zFrom - zTo) < TURNAROUND_LANES) {
      const up = zTo + TURNAROUND_LANES;
      zFrom = up <= LANE_MAX ? up : zTo - TURNAROUND_LANES;
    }
    const d = startDir.x >= 0 ? -1 : 1;
    const arc = buildTurnArc(first.x, d, l2.y, first.y, zFrom, zTo);
    // Der Bogen endet auf der Station: sein letzter Knoten entfällt, die Station übernimmt seine Tangente
    const aN = arc.pop()!;
    nodes.push(...arc);
    const dirL = normalize3(sub3(nodePos(l2), nodeIn(l2)));
    const lo = Math.max(1, dist3(nodePos(arc[0]), nodePos(l2)) / 3);
    closure.lastOut = { index: nodes.indexOf(l2), out: [l2.outX, l2.outY, l2.outZ] };
    l2.outX = dirL.x * lo; l2.outY = dirL.y * lo; l2.outZ = (dirL.z * lo) / LANE_DEPTH;
    first.inX = aN.inX; first.inY = aN.inY; first.inZ = aN.inZ;
    nodes[0].kind = 'station';
    path.closure = closure;
    return;
  }

  if (gap < 1.5 && nodes.length > 2) {
    // Strichende liegt auf dem Start: Endknoten verwerfen, Ankunft in Abfahrtsrichtung der Station
    // (sonst kommt der Strich z. B. von oben herab und die Bahn macht an der Station einen Schlenker)
    const len = Math.max(1.5, Math.hypot(last.inX, last.inY, last.inZ * LANE_DEPTH));
    closure.trimmed.unshift(nodes.pop()!);
    first.inX = -startDir.x * len; first.inY = -startDir.y * len; first.inZ = (-startDir.z * len) / LANE_DEPTH;
    first.kind = 'station';
    path.closure = closure;
    return;
  }

  if (gap <= 6) {
    const h = Math.max(1.5, gap / 3);
    const toStart = normalize3(sub3(pf, pl));
    const outDir = normalize3(add3(scale3(endDir, 0.5), scale3(toStart, 0.5)));
    const inDir = normalize3(add3(scale3(startDir, -0.5), scale3(toStart, -0.5)));
    closure.lastOut = { index: nodes.length - 1, out: [last.outX, last.outY, last.outZ] };
    last.outX = outDir.x * h; last.outY = outDir.y * h; last.outZ = (outDir.z * h) / LANE_DEPTH;
    first.inX = inDir.x * h; first.inY = inDir.y * h; first.inZ = (inDir.z * h) / LANE_DEPTH;
    nodes[0].kind = 'station';
    path.closure = closure;
    return;
  }

  // offen lassen: der Spieler zeichnet weiter oder Play ergänzt den Rückweg
  nodes[0].kind = 'station';
  path.closed = false;
}

/**
 * Automatischer Rückweg für eine offene Bahn (nur für die Fahrt): zwei Halbkreis-Kehren über die
 * Nachbarspur und eine Bremsstrecke zurück zur Station. Geschlossene Bahnen bleiben unverändert.
 */
export function closeTrack(path: TrackPath, returnHeight = 0.7): void {
  if (isClosed(path)) return;
  restoreClosure(path);
  const nodes = path.nodes;
  if (nodes.length < 2) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const pf = nodePos(first);
  const pl = nodePos(last);
  const endDir = normalize3(sub3(pl, nodeIn(last)));
  const startDir = normalize3(sub3(nodeOut(first), pf));
  path.closed = true;
  const closure = startClosure(first);
  closure.lastOut = { index: nodes.length - 1, out: [last.outX, last.outY, last.outZ] };
  path.closure = closure;

  const z0 = Math.round(first.z);
  const ze = Math.round(last.z);
  // Rückweg-Spur: möglichst zwei Spuren neben Start und Ende (Halbkreise mit Radius LANE_DEPTH), bevorzugt hinten
  let zr = z0 + 2 <= LANE_MAX ? z0 + 2 : z0 - 2;
  let bestScore = -Infinity;
  for (let z = LANE_MAX; z >= LANE_MIN; z--) {
    if (z === z0 || z === ze) continue;
    const score = Math.min(2, Math.abs(z - z0), Math.abs(z - ze)) * 10 - Math.abs(z - z0) - Math.abs(z - ze);
    if (score > bestScore) {
      bestScore = score;
      zr = z;
    }
  }
  const d = endDir.x >= 0 ? 1 : -1;
  const ds = startDir.x >= 0 ? 1 : -1;
  const yEnd = Math.max(returnHeight, Math.min(last.y, returnHeight + 2));
  const yStart = Math.max(returnHeight, Math.min(first.y, returnHeight + 2));
  const arcEnd = buildTurnArc(last.x + 2 * d, d, yEnd, returnHeight, last.z, zr);
  const r1 = createNode(last.x - 1 * d, returnHeight, zr, 'closeReturn');
  const r2 = createNode(first.x + 1 * ds, returnHeight, zr, 'closeReturn');
  const arcStart = buildTurnArc(first.x - 2 * ds, -ds, returnHeight, yStart, zr, first.z);
  nodes.push(...arcEnd, r1, r2, ...arcStart);
  const back = -d;
  const retLen = Math.max(1, Math.abs(r2.x - r1.x) / 3);
  r1.inX = -back * Math.min(retLen, 3); r1.inY = 0; r1.inZ = 0; r1.outX = back * retLen; r1.outY = 0; r1.outZ = 0;
  r2.inX = -back * retLen; r2.inY = 0; r2.inZ = 0; r2.outX = back * Math.min(retLen, 3); r2.outY = 0; r2.outZ = 0;
  // Anschlüsse: Handles auf ein Drittel der kurzen Verbindungsstücke kürzen (die Bogen-Handles sind für
  // 45°-Stücke ausgelegt und wären hier zu lang: Schlenker direkt an der Station)
  const a0 = arcEnd[0];
  const lo = Math.max(0.5, dist3(nodePos(a0), pl) / 3);
  last.outX = endDir.x * lo; last.outY = endDir.y * lo; last.outZ = (endDir.z * lo) / LANE_DEPTH;
  const a0l = Math.hypot(a0.inX, a0.inY, a0.inZ * LANE_DEPTH) || 1;
  a0.inX *= lo / a0l; a0.inY *= lo / a0l; a0.inZ *= lo / a0l;
  const aN = arcStart[arcStart.length - 1];
  const li = Math.max(0.5, dist3(pf, nodePos(aN)) / 3);
  first.inX = -startDir.x * li; first.inY = -startDir.y * li; first.inZ = (-startDir.z * li) / LANE_DEPTH;
  const aNl = Math.hypot(aN.outX, aN.outY, aN.outZ * LANE_DEPTH) || 1;
  aN.outX *= li / aNl; aN.outY *= li / aNl; aN.outZ *= li / aNl;
  nodes[0].kind = 'station';
}

/** Hilfsfunktion für Tests: Bühnenpunkte eines Profils y(x) auf Spur z */
export function stageCurve(x0: number, x1: number, n: number, f: (x: number) => number, lane = 0): StagePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    const k = laneScale(lane);
    return { X: x * k, Y: f(x) * k + laneRise(lane) };
  });
}
