/**
 * Strich → Bahn, Version 2 („Bühnen-Zeichnen“).
 *
 * Der Boden ist eine Bühne in Perspektive. Zwei Lesarten, die der Strich selbst wechselt:
 *  - Boden-Modus: Die Höhe im Bild ist die Tiefe (z, kontinuierlich). Alles bleibt am Boden:
 *    Ovale, S-Kurven, Kehren sind flache Kurven. Kreuzungen sind hier keine Loopings.
 *  - Höhen-Modus: Die Höhe im Bild ist die Höhe der Bahn, die Tiefe bleibt eingefroren.
 *    Hierhin wechselt der Strich, wenn er steil ansteigt (im Mittel > 40° über 4 m, ohne dass x in der
 *    Umgebung umkehrt – eine Bodenkehre ist genau dort steil, wo x umkehrt) oder die hintere Bodenlinie nach
 *    oben verlässt. Zurück auf den Boden geht es, wenn die Bahn wieder bis auf den Boden herunterkommt.
 *    Im Höhen-Modus gilt: Kreuzung = Looping, Kehrtwende ohne Kreuzung = Steilkurve in die Nachbarspur
 *    (Rückweg höher im Bild = nach hinten).
 */
import type { Vec2 } from '@/core/math';
import { dist, segmentDistance, segmentIntersection, smoothstep } from '@/core/math';
import type { Vec3 } from '@/core/math3';
import { add3, dist3, normalize3, scale3, sub3 } from '@/core/math3';
import { dedupe, smoothStroke } from '@/core/rdp';
import { fitWithCorners3 } from '@/core/bezierFit3';
import { createNode, emptyPath, isAutoNode, isClosed, nodeIn, nodeOut, nodePos, type PathClosure, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, LANE_RISE, laneRise, laneScale, toStage, type StagePoint } from './stage';

export type StrokeMode = 'floor' | 'height';

export interface StrokeOptions {
  /** Bodenhöhe (Welt) an x, Spur z */
  groundHeight?: (x: number, z: number) => number;
  /** Station auf der Bühne, auf die ein Rundenschluss zielt (Standard: Strichanfang) */
  closeAt?: StagePoint;
  groundClearance?: number;
  maxHeight?: number;
  allowTurns?: boolean;
  allowLoops?: boolean;
  fitError?: number;
  /** Startzustand (Überzeichnen): Tiefe und Modus vorgeben */
  startZ?: number;
  startMode?: StrokeMode;
  /** Ziel-Tiefe am Ende (Überzeichnen): wird über die letzten 25 % eingeblendet */
  endZ?: number;
  /** Tiefenverschiebung je Strichpunkt (Steilkurven, zweiter Durchlauf) */
  zShift?: (index: number) => number;
  /** Offene Bahn sofort mit automatischem Rückweg schließen (Standard: nein, die Bahn bleibt offen) */
  autoClose?: boolean;
  /** Bühnen-Meter: endet der Strich so nah an der Station, wird die Runde geschlossen (Standard 8 m) */
  closeSnap?: number;
  /** Runde Schleifen im rohen Strich (findRoundLoops): ihre Abschnitte werden als Höhe gelesen */
  loopHints?: LoopHint[];
}

/** Runde Schleife im rohen Strich (Bühnenkoordinaten): Indizes wie die Strichpunkte */
export interface LoopHint {
  from: number;
  to: number;
  apex: number;
  cross: Vec2;
  gap?: { dx: number; dy: number };
}

export interface StrokeEvent {
  kind: 'turn' | 'loop';
  index: number;
  dir?: number;
  from?: number;
  to?: number;
  /** Steilkurve: Radius des Halbkreises in Metern (aus der gezeichneten Breite) */
  radius?: number;
  /** Kehre am Boden (Tiefe kommt aus dem Strich, keine zusätzliche Verschiebung) */
  floor?: boolean;
  /** Looping über eine Fast-Kreuzung: Vektor von der Einfahrt zur Ausfahrt an der engsten Stelle */
  gap?: { dx: number; dy: number };
}

export interface InterpretedPoint {
  x: number;
  y: number; // Höhe über Boden-Niveau 0 (vor dem Anheben)
  z: number; // Spuren
  mode: StrokeMode;
}

export interface StrokeResult {
  path: TrackPath;
  events: StrokeEvent[];
  points: InterpretedPoint[];
}

const STEEP_ANGLE = (40 * Math.PI) / 180;
const STEEP_WINDOW = 4; // Bühnen-Meter, über die der Anstieg im Mittel steil sein muss
const REVERSAL_LOOK = 8; // Umgebung eines steilen Fensters: kehrt x darin deutlich um, war es eine Bodenkehre
const REVERSAL_MIN = 0.8;
const RUN_HYSTERESIS = 0.4;
const Z_SMOOTH = 4; // Bühnen-Meter: Tiefe am Boden wird über ±4 m geglättet (Handzittern → keine Querbeschleunigung)
const Z_BLEND = 28; // Bühnen-Meter: weicher Anschluss der Boden-Tiefe an die vorige Tiefe (ein Spurwechsel hat dann rund 15 m Radius)
/** Kehre in der Höhe: Hin- und Rückweg mindestens so lang (kürzer ist Zittern). Eine Umkehr ohne Kreuzung
 *  ist immer eine Steilkurve, nie ein vertikaler Halb-Looping, der den Wagen dauerhaft auf den Kopf stellt. */
const TURN_MIN_WIDTH = 5;
/** Kreuzungen in den ersten/letzten Metern des Strichs sind das Schließen des Kreises, kein Looping */
const CLOSE_ZONE = 8;
/** Steilkurve: Halbkreis in der Horizontalen. Radius aus der gezeichneten Breite, mindestens 1,5 Spuren
 *  (so bleibt eine Kehre nach einem normalen Hügel mit 55 km/h fahrbar), höchstens 3 Spuren. */
const TURN_RADIUS_MIN = LANE_DEPTH / 2; // Halbkreis über eine Spur (nur bei langsamer Fahrt)
const TURN_RADIUS_MAX = 2 * LANE_DEPTH; // … bis vier Spuren (Bühnenbreite)
const TURNAROUND_LANES = 2; // Kehre in die Station bei Ankunft gegen die Fahrtrichtung
/** Spuren, die ein Halbkreis mit Radius r überquert (Durchmesser in Spuren, aufgerundet mit etwas Spiel) */
const lanesForRadius = (r: number): number => Math.max(1, Math.ceil((2 * r) / LANE_DEPTH - 0.15));
/** Radius, den ein Zug mit v² ≈ 2·g·Fallhöhe braucht, damit die Querbeschleunigung unter TURN_G bleibt */
const radiusForDrop = (drop: number): number => (2 * Math.max(0, drop)) / TURN_G;
const turnHalfLength = (radius: number): number => (Math.PI * radius) / 2;
const TURN_G = 2.0; // höchste Querbeschleunigung (in g), für die eine Kehre ausgelegt wird
const TURN_BLEND = 10; // Bühnen-Meter: Anschluss des gezeichneten Rückwegs an den Halbkreis (x)
const TURN_RUNOUT = 6; // Meter eben nach der Kurve, bevor die Höhe auf den gezeichneten Verlauf übergeht (Kuppe nicht in der Schräglage)
const TURN_BLEND_Y = 16; // Bühnen-Meter: Höhe nach der Kurve weich auf die gezeichnete Höhe führen
const RESAMPLE = 0.5;
/** Gauß-Glättung des Strichs (σ in Bühnen-Metern): Zittern weg, Formen ab ~4 m bleiben */
const SMOOTH_SIGMA = 1.5;
/** Rückwärts-Haken bis zu dieser Weite (Bühnen-Meter) sind Zittern und werden entfernt */
const HOOK_MAX = 5;
/** Looping nur, wenn die Schleife klar gezeichnet ist: groß, lang und rund (sonst ist es Handzittern) */
const LOOP_MIN_APEX = 4.5; // Abstand Scheitel–Kreuzung in Metern
const LOOP_MIN_LENGTH = 12; // Strichlänge der Schleife
const LOOP_MIN_ROUNDNESS = 0.4; // 4π·Fläche/Umfang² (Kreis = 1)
/** Fast-Kreuzung: Die Ausfahrt verfehlt die Einfahrt um höchstens so viel (Meter) und die Schleife ist rund genug */
const LOOP_GAP_MAX = 1.5;
const LOOP_MIN_ROUNDNESS_GAP = 0.45;
/** Nach einer Fast-Kreuzung wird die Ausfahrt über diese Strecke (Meter) auf die Einfahrt gezogen, damit sie wirklich kreuzt */
const LOOP_GAP_BLEND = 8;
/** Schleife im rohen Strich (noch ohne Lesart): rund und etwa so hoch wie breit, sonst ist es ein Oval am Boden */
const LOOP_RAW_ROUNDNESS = 0.5;
const LOOP_RAW_ASPECT_MIN = 0.5;
const LOOP_RAW_ASPECT_MAX = 2.0;

/** Bühnen-Y der Bodenlinie an Welt-x und Tiefe z */
function groundY(ground: (x: number, z: number) => number, X: number, z: number): number {
  const k = laneScale(z);
  return ground(X / k, z) * k + laneRise(z);
}

/**
 * Magnetische Spuren: Tiefen nahe einer Spurlinie (±0,2) rasten auf die Spur ein, dazwischen bleibt die
 * Tiefe stetig (Diagonalen über die Bühne sind weiter möglich). So liegt ein Strich entlang einer
 * Bodenlinie trotz Handzittern exakt auf der Spur, und Start und Ende einer Runde treffen sich.
 */
export function magnetLane(z: number): number {
  const n = Math.round(z);
  const d = z - n;
  const dead = 0.2;
  if (Math.abs(d) <= dead) return n;
  return n + Math.sign(d) * ((Math.abs(d) - dead) * (0.5 / (0.5 - dead)));
}

/** Tiefe z aus Bühnen-Y im Boden-Modus (Fixpunkt-Iteration), geklemmt auf die Bühne */
function depthFromY(ground: (x: number, z: number) => number, X: number, Y: number): number {
  let z = Y / LANE_RISE;
  for (let i = 0; i < 40; i++) {
    const k = laneScale(z);
    const g = ground(X / k, z) * k;
    const next = (Y - g) / LANE_RISE;
    // gedämpft, damit die Iteration auch an steilen Hängen konvergiert
    const zn = z + (next - z) * 0.6;
    const done = Math.abs(zn - z) < 1e-3;
    z = zn;
    if (done) break;
  }
  return Math.max(LANE_MIN, Math.min(LANE_MAX, z));
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

/** Monotone Abschnitte des Strichs in Bild-Y (steigend/fallend) mit kleiner Hysterese */
interface StrokeRun {
  start: number;
  end: number;
  rising: boolean;
}

export function splitRuns(pts: Vec2[], hyst = RUN_HYSTERESIS): StrokeRun[] {
  const runs: StrokeRun[] = [];
  if (pts.length < 2) return pts.length ? [{ start: 0, end: 0, rising: false }] : runs;
  let dir = 0;
  let start = 0;
  let extIdx = 0;
  let extY = pts[0].y;
  let loIdx = 0;
  let loY = pts[0].y;
  let hiIdx = 0;
  let hiY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const y = pts[i].y;
    if (dir === 0) {
      // Anfang: erst wenn der Strich deutlich steigt/fällt, beginnt der Abschnitt am letzten Extrem
      if (y <= loY) {
        loY = y;
        loIdx = i;
      }
      if (y >= hiY) {
        hiY = y;
        hiIdx = i;
      }
      if (y > loY + hyst) {
        dir = 1;
        if (loIdx > start) {
          runs.push({ start, end: loIdx, rising: false });
          start = loIdx;
        }
        extIdx = i;
        extY = y;
      } else if (y < hiY - hyst) {
        dir = -1;
        if (hiIdx > start) {
          runs.push({ start, end: hiIdx, rising: false });
          start = hiIdx;
        }
        extIdx = i;
        extY = y;
      }
      continue;
    }
    if ((dir === 1 && y >= extY) || (dir === -1 && y <= extY)) {
      extY = y;
      extIdx = i;
      continue;
    }
    if (Math.abs(y - extY) > hyst) {
      runs.push({ start, end: extIdx, rising: dir === 1 });
      start = extIdx;
      dir = -dir;
      extIdx = i;
      extY = y;
    }
  }
  runs.push({ start, end: pts.length - 1, rising: dir === 1 });
  return runs;
}

/** Kehrt x zwischen den Indizes a..b gegenüber der Richtung dir um mindestens REVERSAL_MIN um? */
function xRetreats(pts: Vec2[], a: number, b: number, dir: number): boolean {
  let best = pts[a].x * dir;
  for (let i = a; i <= b; i++) {
    const v = pts[i].x * dir;
    if (v > best) best = v;
    else if (best - v >= REVERSAL_MIN) return true;
  }
  return false;
}

/**
 * Ist ein steigender Abschnitt ein Anstieg (Höhe) oder eine Bewegung nach hinten (Tiefe)?
 * Anstieg: endet oberhalb der Bühne, oder enthält ein 4-m-Fenster, das im Mittel steiler als 40° ist und in
 * dessen Umgebung (±8 m entlang des Strichs) x nicht umkehrt. Eine Bodenkehre ist genau dort steil, wo x umkehrt.
 */
function isClimb(pts: Vec2[], run: StrokeRun, ground: (x: number, z: number) => number): boolean {
  if (!run.rising || run.end <= run.start) return false;
  const e = pts[run.end];
  // über die Bühne hinaus, ohne dass x umkehrt: ein (auch sanfter) Anstieg in den Himmel.
  // Mit Umkehr ist es das hintere Ende eines großen Ovals, das bleibt am Boden (hinterste Spur).
  const dir0 = Math.sign(e.x - pts[run.start].x) || 1;
  if (e.y > groundY(ground, e.x, LANE_MAX) + 0.6 && !xRetreats(pts, run.start, run.end, dir0)) return true;
  // kumulierte Strichlänge (über den ganzen Strich, für die Umgebung der Fenster)
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  if (cum[run.end] - cum[run.start] < STEEP_WINDOW) return false;
  const ang = (i: number) => Math.atan2(pts[i].y - pts[i - 1].y, Math.abs(pts[i].x - pts[i - 1].x));
  let j = run.start + 1;
  let ws = 0;
  for (let i = run.start + 1; i <= run.end; i++) {
    const li = cum[i] - cum[i - 1];
    ws += li * ang(i);
    while (cum[i] - cum[j - 1] > STEEP_WINDOW + 1e-9 && j < i) {
      ws -= (cum[j] - cum[j - 1]) * ang(j);
      j++;
    }
    const wl = cum[i] - cum[j - 1];
    if (wl < STEEP_WINDOW - 0.6 || ws / wl <= STEEP_ANGLE) continue;
    // Umgebung des Fensters
    let a = j - 1;
    while (a > 0 && cum[j - 1] - cum[a] < REVERSAL_LOOK) a--;
    let b = i;
    while (b < pts.length - 1 && cum[b] - cum[i] < REVERSAL_LOOK) b++;
    const dir = Math.sign(pts[i].x - pts[j - 1].x) || 1;
    if (!xRetreats(pts, a, b, dir)) return true;
  }
  return false;
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

/** Strich aufbereiten: Doppelte raus, gleichmäßig abtasten, Haken entfernen, glätten */
export function prepareStroke(stroke: StagePoint[]): Vec2[] {
  let pts: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  pts = dedupe(pts, 0.15);
  pts = smoothStroke(pts, 5);
  pts = resample(pts, RESAMPLE);
  pts = removeHooks(pts);
  pts = gaussianSmooth(pts);
  return pts;
}

/**
 * Die Interpretation: Bühnenpunkte → (x, Höhe, Tiefe, Modus). Ein Ausgabepunkt je Eingabepunkt.
 */
export function interpretStroke(pts: Vec2[], opts: StrokeOptions): InterpretedPoint[] {
  const ground = opts.groundHeight ?? (() => 0);
  const n = pts.length;
  const out: InterpretedPoint[] = new Array(n);
  if (!n) return out;
  const runs = splitRuns(pts);
  const runOf = new Int32Array(n);
  runs.forEach((r, ri) => {
    for (let i = r.start; i <= r.end; i++) runOf[i] = ri;
  });
  const climb = runs.map((r) => isClimb(pts, r, ground));
  // Eine runde Schleife ist ein Looping, auch wenn sie am Boden beginnt: Ihre steigenden Abschnitte sind
  // Anstiege, nicht Bewegungen in die Tiefe (die Steilheitsprüfung allein hielte den Kreis für eine Bodenkehre)
  for (const h of opts.loopHints ?? []) {
    runs.forEach((r, ri) => {
      if (!climb[ri] && r.rising && r.end > h.from && r.start < h.to) climb[ri] = true;
    });
  }
  const clampZ = (z: number) => Math.max(LANE_MIN, Math.min(LANE_MAX, z));
  const heightPoint = (i: number, z: number): InterpretedPoint => {
    const k = laneScale(z);
    return { x: pts[i].x / k, y: Math.max(0, (pts[i].y - groundY(ground, pts[i].x, z)) / k), z, mode: 'height' };
  };
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const aboveStage = (i: number) => pts[i].y > groundY(ground, pts[i].x, LANE_MAX) + 0.6;
  // Nur der Strichanfang darf „in der Luft“ beginnen; später zählt allein der Anstieg (sonst wäre das
  // hintere Ende eines großen Ovals plötzlich Höhe und der Schluss ein Looping)
  const startsHeight = (i: number) => (i === 0 && aboveStage(i)) || (climb[runOf[i]] && i >= runs[runOf[i]].start);

  let mode: StrokeMode = opts.startMode ?? 'floor';
  let zFrozen = opts.startZ ?? magnetLane(depthFromY(ground, pts[0].x, pts[0].y));
  let zPrev: number | null = opts.startMode === 'height' ? zFrozen : opts.startZ ?? null;
  let shiftBase = opts.zShift ? opts.zShift(0) : 0;
  let climbEnd = -1; // bis hierhin läuft der Anstieg, der den Höhen-Modus begonnen hat
  let i = 0;
  while (i < n) {
    if (mode === 'floor') {
      // Boden-Abschnitt bis zum nächsten Anstieg: Tiefe lesen, glätten, weich an die vorige Tiefe anschließen
      let e = i;
      while (e < n && !startsHeight(e)) e++;
      if (e > i) {
        const raw = new Float64Array(e - i);
        for (let k = i; k < e; k++) raw[k - i] = depthFromY(ground, pts[k].x, pts[k].y);
        for (let k = i; k < e; k++) {
          let sum = 0;
          let w = 0;
          for (let m = i; m < e; m++) {
            const d = Math.abs(cum[m] - cum[k]);
            if (d > Z_SMOOTH) continue;
            const wm = 1 - d / Z_SMOOTH;
            sum += raw[m - i] * wm;
            w += wm;
          }
          let z = w > 0 ? sum / w : raw[k - i];
          if (zPrev !== null) z = zPrev + (z - zPrev) * smoothstep(Math.min(1, (cum[k] - cum[i]) / Z_BLEND));
          z = clampZ(magnetLane(z));
          out[k] = { x: pts[k].x / laneScale(z), y: 0, z, mode: 'floor' };
        }
        zFrozen = out[e - 1].z;
      }
      if (e >= n) break;
      // Wechsel in die Höhe
      if (e === 0 && opts.startZ !== undefined) zFrozen = opts.startZ;
      else if (e === i) zFrozen = aboveStage(e) && !climb[runOf[e]] ? LANE_MAX : magnetLane(depthFromY(ground, pts[e].x, pts[e].y));
      mode = 'height';
      climbEnd = climb[runOf[e]] ? runs[runOf[e]].end : -1;
      shiftBase = opts.zShift ? opts.zShift(e) : 0;
      out[e] = heightPoint(e, zFrozen);
      i = e + 1;
    } else {
      const P = pts[i];
      const z = clampZ(zFrozen + (opts.zShift ? opts.zShift(i) - shiftBase : 0));
      const h = (P.y - groundY(ground, P.x, z)) / laneScale(z);
      const goingDown = i === 0 || P.y - pts[i - 1].y <= 0.05;
      // Innerhalb einer Steilkurve (die Tiefenverschiebung läuft noch) bleibt der Strich in der Höhe, auch
      // wenn die Bodenlinie der neuen Spur über den Strich wandert; shapeTurns setzt dort die Höhe neu
      const ramping = !!opts.zShift && i + 1 < n && Math.abs(opts.zShift(i + 1) - opts.zShift(i)) > 1e-9;
      if (h <= 0.35 && goingDown && i > climbEnd && !ramping) {
        // zurück auf den Boden: der Boden-Abschnitt beginnt hier und schließt an die aktuelle Tiefe an
        mode = 'floor';
        zPrev = z;
        continue;
      }
      out[i] = heightPoint(i, z);
      i++;
    }
  }
  // Übergang zur Ziel-Tiefe (Überzeichnen)
  if (opts.endZ !== undefined && n > 2) {
    const from = Math.floor(n * 0.75);
    const zAtFrom = out[from].z;
    for (let i = from; i < n; i++) {
      const f = (i - from) / Math.max(1, n - 1 - from);
      out[i].z = zAtFrom + (opts.endZ - zAtFrom) * smoothstep(f);
    }
  }
  return out;
}

/**
 * Kreuzungen im Profil (x, y) innerhalb von Höhen-Abschnitten.
 * Ein Looping kreuzt seinen Einstieg in derselben Fahrtrichtung (x). Kreuzen sich zwei Stücke mit
 * entgegengesetzter x-Richtung, ist das der Rückweg einer Kehre, der den Hinweg überquert (Überführung,
 * in der Nachbarspur), kein Looping.
 */
/** Schleifenkörper von der Kreuzung bis zurück: Scheitel, Fläche, Umfang, Rundheit und Seitenverhältnis */
function loopBody(P: (i: number) => Vec2, cum: Float64Array, i: number, j: number, cross: Vec2) {
  let apex = i + 1;
  let best = -1;
  let area = 0;
  let prev: Vec2 = cross;
  let minX = cross.x, maxX = cross.x, minY = cross.y, maxY = cross.y;
  for (let k = i + 1; k <= j; k++) {
    const p = P(k);
    const d = Math.hypot(p.x - cross.x, p.y - cross.y);
    if (d > best) {
      best = d;
      apex = k;
    }
    area += prev.x * p.y - p.x * prev.y;
    prev = p;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  area = Math.abs(area + prev.x * cross.y - cross.x * prev.y) / 2;
  const p1 = P(i + 1);
  const pj = P(j);
  const perimeter = cum[j] - cum[i + 1] + Math.hypot(p1.x - cross.x, p1.y - cross.y) + Math.hypot(pj.x - cross.x, pj.y - cross.y);
  const roundness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  const aspect = maxX - minX > 1e-6 ? (maxY - minY) / (maxX - minX) : 0;
  return { apex, apexDist: best, perimeter, roundness, aspect };
}

/**
 * Runde Schleifen im rohen Strich (Bühnenkoordinaten, noch ohne Lesart). Eine Schleife, die sich kreuzt oder
 * nur knapp verfehlt, groß und rund ist und etwa so hoch wie breit, ist ein Looping, selbst wenn sie direkt am
 * Boden beginnt. Ovale am Boden sind viel breiter als hoch und bleiben Bodenkurven; Kehren mit Rückweg in
 * Gegenrichtung sind keine Schleifen.
 */
export function findRoundLoops(pts: Vec2[]): LoopHint[] {
  const hints: LoopHint[] = [];
  const n = pts.length;
  if (n < 8) return hints;
  const P = (i: number): Vec2 => pts[i];
  const xDir = (i: number): number => Math.sign(pts[i + 1].x - pts[i].x);
  const cum = new Float64Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + dist(pts[k - 1], pts[k]);
  const inHint = (k: number) => hints.some((h) => k >= h.from && k <= h.to);
  const accept = (i: number, j: number, cross: Vec2, gap?: { dx: number; dy: number }): boolean => {
    const b = loopBody(P, cum, i, j, cross);
    if (b.apexDist < LOOP_MIN_APEX || b.perimeter < LOOP_MIN_LENGTH || b.roundness < LOOP_RAW_ROUNDNESS) return false;
    if (b.aspect < LOOP_RAW_ASPECT_MIN || b.aspect > LOOP_RAW_ASPECT_MAX) return false;
    hints.push({ from: i, to: j + 1, apex: b.apex, cross, gap });
    return true;
  };
  // Durchlauf 1: echte Kreuzungen (nicht in den ersten Metern: dort schließt ein Kreis seinen Anfang)
  let i = 0;
  while (i < n - 3) {
    let found = false;
    if (cum[i] >= CLOSE_ZONE) {
      for (let j = i + 2; j < n - 1; j++) {
        if (xDir(i) * xDir(j) < 0) continue;
        const hit = segmentIntersection(P(i), P(i + 1), P(j), P(j + 1));
        if (hit) {
          accept(i, j, hit.point);
          i = j + 1;
          found = true;
          break;
        }
      }
    }
    if (!found) i++;
  }
  // Durchlauf 2: Fast-Kreuzungen außerhalb gefundener Schleifen
  i = 0;
  while (i < n - 3) {
    let found = false;
    if (cum[i] >= CLOSE_ZONE && !inHint(i)) {
      let bestJ = -1;
      let bestD = LOOP_GAP_MAX;
      let bestA: Vec2 = P(i);
      let bestB: Vec2 = P(i);
      for (let j = i + 6; j < n - 1; j++) {
        if (inHint(j)) break;
        if (xDir(i) * xDir(j) < 0) continue;
        const sd = segmentDistance(P(i), P(i + 1), P(j), P(j + 1));
        if (sd.d < bestD) {
          bestD = sd.d;
          bestJ = j;
          bestA = sd.a;
          bestB = sd.b;
        }
      }
      if (bestJ >= 0) {
        const mid = { x: (bestA.x + bestB.x) / 2, y: (bestA.y + bestB.y) / 2 };
        if (accept(i, bestJ, mid, { dx: bestB.x - bestA.x, dy: bestB.y - bestA.y })) {
          i = bestJ + 1;
          found = true;
        }
      }
    }
    if (!found) i++;
  }
  return hints;
}

export function detectLoops(points: InterpretedPoint[], hints: LoopHint[] = []): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  const n = points.length;
  const P = (i: number): Vec2 => ({ x: points[i].x, y: points[i].y });
  const xDir = (i: number): number => Math.sign(points[i + 1].x - points[i].x);
  const cum = new Float64Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  const closing = (k: number) => cum[k] < CLOSE_ZONE;
  // Schleifen aus dem rohen Strich sind schon geprüft (sie beginnen oft am Boden, wo die Lesart den Kreuzungspunkt
  // noch als Boden liest); die Durchläufe unten suchen nur außerhalb davon weiter
  for (const h of hints) if (h.to < n) events.push({ kind: 'loop', index: Math.min(n - 1, h.apex), from: h.from, to: h.to, gap: h.gap });
  const inLoop = (k: number) => events.some((e) => k >= e.from! && k <= e.to!);
  /** Segment j kommt als Ausfahrt zur Einfahrt i in Frage: Höhe, gleiche Tiefe, gleiche x-Richtung, nicht am Anfang */
  const candidate = (i: number, j: number): boolean =>
    points[j].mode === 'height' && Math.abs(points[j].z - points[i].z) <= 0.3 && xDir(i) * xDir(j) >= 0;
  /** Schleife von der (echten oder virtuellen) Kreuzung bis zurück: groß, lang und rund genug? Dann Ereignis. */
  const accept = (i: number, j: number, cross: Vec2, minRoundness: number, gap?: { dx: number; dy: number }): boolean => {
    const b = loopBody(P, cum, i, j, cross);
    if (b.apexDist >= LOOP_MIN_APEX && b.perimeter >= LOOP_MIN_LENGTH && b.roundness >= minRoundness) {
      events.push({ kind: 'loop', index: b.apex, from: i, to: j + 1, gap });
      return true;
    }
    return false;
  };
  // Durchlauf 1: echte Kreuzungen
  let i = 0;
  while (i < n - 3) {
    let found = false;
    if (points[i].mode === 'height' && !closing(i) && !inLoop(i)) {
      for (let j = i + 2; j < n - 1; j++) {
        if (inLoop(j)) break;
        if (!candidate(i, j)) continue;
        const hit = segmentIntersection(P(i), P(i + 1), P(j), P(j + 1));
        if (hit) {
          accept(i, j, hit.point, LOOP_MIN_ROUNDNESS);
          i = j + 1;
          found = true;
          break;
        }
      }
    }
    if (!found) i++;
  }
  // Durchlauf 2: Fast-Kreuzungen außerhalb der erkannten Loopings. Die Hand trifft die Einfahrt nicht genau;
  // verfehlt die Ausfahrt sie nur knapp und die Schleife ist rund, zählt sie trotzdem als Looping (die Ausfahrt
  // wird danach auf die Einfahrt gezogen, siehe shapeLoopCrossing)
  i = 0;
  while (i < n - 3) {
    let found = false;
    if (points[i].mode === 'height' && !closing(i) && !inLoop(i)) {
      let bestJ = -1;
      let bestD = LOOP_GAP_MAX;
      let bestA: Vec2 = P(i);
      let bestB: Vec2 = P(i);
      for (let j = i + 6; j < n - 1; j++) {
        // ein erkannter Looping darf nicht Teil der neuen Schleife sein
        if (inLoop(j)) break;
        if (!candidate(i, j)) continue;
        const sd = segmentDistance(P(i), P(i + 1), P(j), P(j + 1));
        if (sd.d < bestD) {
          bestD = sd.d;
          bestJ = j;
          bestA = sd.a;
          bestB = sd.b;
        }
      }
      if (bestJ >= 0) {
        const mid = { x: (bestA.x + bestB.x) / 2, y: (bestA.y + bestB.y) / 2 };
        if (accept(i, bestJ, mid, LOOP_MIN_ROUNDNESS_GAP, { dx: bestB.x - bestA.x, dy: bestB.y - bestA.y })) {
          i = bestJ + 1;
          found = true;
        }
      }
    }
    if (!found) i++;
  }
  events.sort((a, b) => a.index - b.index);
  return events;
}

/**
 * Looping aus einer Fast-Kreuzung: Die Ausfahrt wird auf die Einfahrt gezogen (plus 0,3 m Überschuss, damit sie
 * wirklich kreuzt). Die Verschiebung wächst vom Scheitel bis zur Ausfahrt an und läuft danach über
 * LOOP_GAP_BLEND Meter wieder aus, so bleibt der Strich stetig.
 */
export function shapeLoopCrossing(points: InterpretedPoint[], loop: StrokeEvent): void {
  const g = loop.gap;
  const to = loop.to;
  if (!g || to === undefined) return;
  const gl = Math.hypot(g.dx, g.dy);
  if (gl < 1e-6) return;
  const sx = -(g.dx + (g.dx / gl) * 0.3);
  const sy = -(g.dy + (g.dy / gl) * 0.3);
  const n = points.length;
  const apex = Math.max(0, Math.min(loop.index, to));
  const seg = (k: number) => Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  // Anlauf vom Scheitel bis zur Ausfahrt
  let inLen = 0;
  for (let k = apex + 1; k <= Math.min(to, n - 1); k++) inLen += seg(k);
  let s = 0;
  for (let k = apex + 1; k <= Math.min(to, n - 1); k++) {
    s += seg(k);
    const f = inLen > 0 ? smoothstep(s / inLen) : 1;
    points[k].x += sx * f;
    points[k].y += sy * f;
  }
  // Auslauf nach der Ausfahrt
  s = 0;
  for (let k = to + 1; k < n; k++) {
    s += seg(k);
    const f = 1 - smoothstep(s / LOOP_GAP_BLEND);
    if (f <= 0) break;
    points[k].x += sx * f;
    points[k].y += sy * f;
  }
}

/**
 * Radius der gezeichneten Kehre: Strichlänge, über die die Richtung von „klar vorwärts“ (dx/ds ≥ 0,7)
 * nach „klar rückwärts“ (dx/ds ≤ −0,7) dreht. Bei einem Kreis sind das 90°, also π/2 · r.
 */
function drawnTurnRadius(points: InterpretedPoint[], apex: number): number {
  const n = points.length;
  const dirAt = (i: number): number => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const l = Math.hypot(dx, b.y - a.y) || 1e-9;
    return dx / l;
  };
  const sign = dirAt(Math.max(0, apex - 3)) >= 0 ? 1 : -1;
  let i0 = apex;
  while (i0 > 0 && dirAt(i0) * sign < 0.7 && points[i0].mode === 'height') i0--;
  let i1 = apex;
  while (i1 < n - 1 && dirAt(i1) * sign > -0.7 && points[i1].mode === 'height') i1++;
  let len = 0;
  for (let i = i0 + 1; i <= i1; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return Math.max(TURN_RADIUS_MIN, Math.min(TURN_RADIUS_MAX, (2 * len) / Math.PI));
}

/**
 * Kehrtwenden (x-Richtung dreht um, ohne Kreuzung). In Höhen-Abschnitten wird daraus eine Steilkurve
 * in die Nachbarspuren (Richtung aus der Höhe des Rückwegs). Am Boden kommt die Tiefe aus dem Strich;
 * die Kehre wird trotzdem als Halbkreis geformt (Radius aus den überquerten Spuren, bei Tempo mehr).
 */
export function detectTurns(points: InterpretedPoint[], loops: StrokeEvent[], mode: StrokeMode = 'height'): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  const inLoop = (i: number) => loops.some((l) => i >= l.from! && i <= l.to!);
  let dir = 0;
  let extremeIdx = 0;
  let extremeX = points.length ? points[0].x : 0;
  let legStartX = extremeX;
  let runStart = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].mode !== mode) {
      dir = 0;
      legStartX = points[i].x;
      extremeX = points[i].x;
      extremeIdx = i;
      runStart = i;
      continue;
    }
    const x = points[i].x;
    if (dir === 0) {
      if (Math.abs(x - legStartX) >= TURN_MIN_WIDTH * 0.25) {
        dir = x > legStartX ? 1 : -1;
        extremeIdx = i;
        extremeX = x;
      }
      continue;
    }
    if ((dir === 1 && x > extremeX) || (dir === -1 && x < extremeX)) {
      extremeX = x;
      extremeIdx = i;
      continue;
    }
    if (Math.abs(extremeX - x) >= TURN_MIN_WIDTH && Math.abs(extremeX - legStartX) >= TURN_MIN_WIDTH) {
      if (!inLoop(extremeIdx) && extremeIdx > runStart) {
        if (mode === 'height') {
          // Höhe des Rückwegs vs. Hinwegs um den Scheitel
          let before = 0;
          let nb = 0;
          let after = 0;
          let na = 0;
          for (let k = Math.max(runStart, extremeIdx - 20); k < extremeIdx - 4; k++) {
            before += points[k].y;
            nb++;
          }
          for (let k = extremeIdx + 4; k < Math.min(points.length, extremeIdx + 20); k++) {
            after += points[k].y;
            na++;
          }
          const b = nb ? before / nb : points[extremeIdx].y;
          const a = na ? after / na : points[Math.min(points.length - 1, extremeIdx + 1)].y;
          events.push({ kind: 'turn', index: extremeIdx, dir: a >= b ? 1 : -1, radius: drawnTurnRadius(points, extremeIdx) });
        } else {
          // Tiefe vor und nach der Kehre (weiter weg vom Scheitel, die Tiefe ändert sich über die ganze Kehre)
          let zb = points[Math.max(runStart, extremeIdx - 30)].z;
          let za = points[Math.min(points.length - 1, extremeIdx + 30)].z;
          for (let k = extremeIdx; k > runStart; k--) if (points[k].mode !== mode) { zb = points[k + 1].z; break; }
          for (let k = extremeIdx; k < Math.min(points.length - 1, extremeIdx + 30); k++) if (points[k].mode !== mode) { za = points[k - 1].z; break; }
          const lanes = Math.max(1, Math.round(Math.abs(za - zb)));
          events.push({ kind: 'turn', index: extremeIdx, dir: za >= zb ? 1 : -1, radius: (lanes * LANE_DEPTH) / 2, floor: true });
        }
      }
      dir = -dir;
      legStartX = extremeX;
      extremeX = x;
      extremeIdx = i;
    }
  }
  return events;
}

/**
 * Steilkurven: Tiefenverschiebung je Strichpunkt (±1 Spur, weich über 16 m um den Scheitel).
 * Die Verschiebung bleibt bis zum nächsten Bodenkontakt erhalten; das löst der zweite Durchlauf
 * von interpretStroke über shiftBase. Kehrt eine Spur am Rand der Bühne, dreht sich die Richtung um.
 */
export function turnShiftProfile(stroke: Vec2[], points: InterpretedPoint[], turns: StrokeEvent[], ground: (x: number, z: number) => number = () => 0): number[] {
  const n = stroke.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(stroke[i], stroke[i - 1]);
  const shift = new Array<number>(n).fill(0);
  const absY = (i: number) => points[i].y + ground(points[i].x, points[i].z);
  let acc = 0;
  let segStart = 0;
  let hMax = 0;
  let hIdx = 0;
  for (const t of [...turns].sort((a, b) => a.index - b.index)) {
    // neuer Höhenabschnitt? dann beginnt die Summe der Verschiebungen wieder bei 0
    for (let i = segStart; i < t.index; i++) if (points[i].mode === 'floor') { acc = 0; segStart = i; }
    // Spuren, die auf der Bühne in Richtung dir noch frei sind
    const roomLanes = (z: number, dir: number) => Math.max(0, Math.round(dir > 0 ? LANE_MAX - z : z - LANE_MIN));
    // Tempo-bewusst: Der Zug kommt mit v² ≈ 2·g·(höchster Punkt davor − Kurvenhöhe) an. Damit die
    // Querbeschleunigung höchstens TURN_G bleibt, braucht die Kurve mindestens R = v²/(TURN_G·g).
    for (; hIdx < t.index; hIdx++) hMax = Math.max(hMax, absY(hIdx));
    // Fallhöhe bis zur Einfahrt in die Kurve (die Kurve wird auf Einfahrtshöhe gehalten, nicht auf der
    // gezeichneten Scheitelhöhe): tiefster Punkt zwischen Kurvenbeginn (zwei Spuren) und Scheitel
    let yEntry = absY(t.index);
    for (let i = t.index; i >= 0 && cum[t.index] - cum[i] <= turnHalfLength(LANE_DEPTH); i--) yEntry = Math.min(yEntry, absY(i));
    const drop = Math.max(0, hMax - yEntry);
    if (t.floor) {
      // Boden-Kehre: Richtung und Tiefe kommen aus dem Strich; der Halbkreis überquert mindestens die
      // gezeichneten Spuren, bei Tempo mehr, und muss auf die Bühne passen
      const d0 = t.dir ?? 1;
      let i0 = t.index;
      while (i0 > 0 && cum[t.index] - cum[i0 - 1] <= turnHalfLength(t.radius ?? TURN_RADIUS_MIN)) i0--;
      // mindestens zwei Spuren (8,4 m), wo die Bühne Platz hat: Mit einer Spur wird der Halbkreis im Bild zur
      // spitzen Nase (die Tiefe ist im Bild nur halb so hoch wie breit); der Rückweg gleitet danach auf seine Spur
      const want = Math.max(2, lanesForRadius(t.radius ?? TURN_RADIUS_MIN), lanesForRadius(radiusForDrop(drop)));
      const lanesF = Math.max(1, Math.min(want, roomLanes(points[i0].z, d0)));
      t.radius = (lanesF * LANE_DEPTH) / 2;
      continue;
    }
    const zAt = points[t.index].z + acc;
    let d = t.dir ?? 1;
    // Tiefenversatz = Durchmesser des Halbkreises in ganzen Spuren (gezeichnete Breite oder Tempo);
    // passt er nicht mehr auf die Bühne, Richtung drehen, sonst so viele Spuren, wie Platz ist (mindestens eine)
    const want = Math.min(lanesForRadius(TURN_RADIUS_MAX), Math.max(lanesForRadius(t.radius ?? TURN_RADIUS_MIN), lanesForRadius(radiusForDrop(drop))));
    if (roomLanes(zAt, d) < want && roomLanes(zAt, -d) > roomLanes(zAt, d)) d = -d;
    const lanes = Math.max(1, Math.min(want, roomLanes(zAt, d)));
    const radius = (lanes * LANE_DEPTH) / 2;
    t.dir = d;
    t.radius = radius;
    const half = turnHalfLength(radius);
    const sApex = cum[t.index];
    for (let i = 0; i < n; i++) {
      const s = cum[i];
      if (s <= sApex - half) continue;
      shift[i] += d * lanes * smoothstep((s - (sApex - half)) / (2 * half));
    }
    acc += d * lanes;
  }
  return shift;
}

/**
 * Steilkurven in der Horizontalen rund machen: Im Kurvenbereich (π·R um den Scheitel) werden x und Tiefe
 * durch einen Halbkreis mit Radius R (aus der gezeichneten Breite) ersetzt, die Höhe wird weich geführt.
 * Die gezeichnete x-Umkehr ist im Seitenriss meist spitz; ohne diesen Schritt entstünde eine Haarnadel
 * mit winzigem Radius. Danach wird der gezeichnete Rückweg über TURN_BLEND Meter angeschlossen.
 */
export function shapeTurns(points: InterpretedPoint[], stroke: Vec2[], turns: StrokeEvent[], ground: (x: number, z: number) => number = () => 0, clearance = 0.6): void {
  const n = points.length;
  if (n < 3) return;
  // Höhen sind relativ zum Boden; beim Verschieben von x/Tiefe muss die absolute Höhe erhalten bleiben
  const absY = (i: number) => points[i].y + ground(points[i].x, points[i].z);
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(stroke[i], stroke[i - 1]);
  let lastEnd = -Infinity;
  let hMax = 0;
  let hIdx = 0;
  for (const t of [...turns].sort((a, b) => a.index - b.index)) {
    const R = t.radius ?? TURN_RADIUS_MIN;
    const half = turnHalfLength(R);
    const sA = cum[t.index];
    const s0 = sA - half;
    const s1 = sA + half;
    if (s0 < lastEnd) continue;
    let i0 = t.index;
    while (i0 > 0 && cum[i0 - 1] >= s0) i0--;
    let i1 = t.index;
    while (i1 < n - 1 && cum[i1 + 1] <= s1) i1++;
    const mode: StrokeMode = t.floor ? 'floor' : 'height';
    let ok = true;
    for (let i = i0; i <= i1; i++) if (points[i].mode !== mode) ok = false;
    if (!ok || i1 <= i0) continue;
    const xA = points[i0].x;
    const zA = points[i0].z;
    const dirX = Math.sign(points[t.index].x - xA) || 1;
    const sgn = t.dir ?? 1;
    const drawnEnd = points[i1].x;
    const drawnEndZ = points[i1].z;
    // Die Kurve selbst bleibt eben (absolut): auf der Einfahrtshöhe, mindestens aber über dem höchsten
    // Gelände unter dem Halbkreis (eine Kurve über einen Hügel wird aufgeständert, statt ihn mitzufahren:
    // Kuppe plus Querkraft wäre bei Tempo nicht fahrbar). Die gezeichnete Bild-Höhe des Rückwegs enthält
    // den Anstieg der Bodenlinie der neuen Spur; der Höhenunterschied wird danach weich abgebaut.
    let yA = t.floor ? ground(points[i0].x, points[i0].z) + clearance : absY(i0);
    for (let i = i0; i <= i1; i++) {
      const th = Math.min(Math.PI, Math.max(0, (cum[i] - s0) / R));
      const x = xA + dirX * R * Math.sin(th);
      const z = Math.max(LANE_MIN, Math.min(LANE_MAX, zA + (sgn * R * (1 - Math.cos(th))) / LANE_DEPTH));
      yA = Math.max(yA, ground(x, z) + clearance);
    }
    for (let i = i0; i <= i1; i++) {
      const th = Math.min(Math.PI, Math.max(0, (cum[i] - s0) / R));
      points[i].x = xA + dirX * R * Math.sin(th);
      points[i].z = Math.max(LANE_MIN, Math.min(LANE_MAX, zA + (sgn * R * (1 - Math.cos(th))) / LANE_DEPTH));
      points[i].y = Math.max(0, yA - ground(points[i].x, points[i].z));
    }
    // Anfahrt: liegt die Kurve höher als der Strich davor (Gelände), die Bahn davor weich anheben; die
    // Länge der Rampe wächst mit dem Tempo (Kuppe am Rampenende, siehe blendY unten)
    for (; hIdx < i0; hIdx++) hMax = Math.max(hMax, absY(hIdx));
    const dIn = Math.max(0, yA - absY(i0));
    const blendIn = Math.max(TURN_BLEND_Y, Math.sqrt(6 * dIn * 1.5 * Math.max(0, hMax - yA)));
    for (let i = i0 - 1; i >= 0; i--) {
      const f = 1 - smoothstep((cum[i0] - cum[i] - TURN_RUNOUT) / blendIn);
      if (f <= 0) break;
      const want = absY(i) + (yA - absY(i)) * f;
      if (want > absY(i)) points[i].y = Math.max(0, want - ground(points[i].x, points[i].z));
    }
    // Anschluss des Rückwegs: x und Tiefe weich auf den gezeichneten Verlauf, Höhe weich von der Kurvenhöhe
    // auf die gezeichnete Höhe (auch wenn der Rückweg am Boden der neuen Spur liegt: dann gleitet die Bahn hinunter)
    const delta = points[i1].x - drawnEnd;
    const deltaZ = points[i1].z - drawnEndZ;
    // Länge des Höhen-Anschlusses nach dem Tempo: Der Zug kommt mit v² ≈ 2·g·Fallhöhe; die Kuppe am Beginn
    // des Gefälles braucht R ≥ v²/(1,2·g), damit die Fahrgäste im Sitz bleiben. Für einen weichen Übergang
    // (Smoothstep) über die Höhe ΔY gilt R ≈ L²/(6·ΔY), also L ≥ √(6·ΔY·R).
    for (; hIdx < t.index; hIdx++) hMax = Math.max(hMax, absY(hIdx));
    const drop = Math.max(0, hMax - yA);
    let dY = 0;
    for (let i = i1 + 1; i < n && cum[i] - cum[i1] <= 2 * TURN_BLEND_Y; i++) dY = Math.max(dY, Math.abs(absY(i) - yA));
    const blendY = Math.max(TURN_BLEND_Y, Math.sqrt(6 * dY * 1.5 * drop));
    for (let i = i1 + 1; i < n; i++) {
      const fx = 1 - smoothstep((cum[i] - cum[i1]) / TURN_BLEND);
      const fz = 1 - smoothstep((cum[i] - cum[i1]) / Z_BLEND);
      const fy = smoothstep((cum[i] - cum[i1] - TURN_RUNOUT) / blendY);
      if (fx <= 0 && fy >= 1 && fz <= 0) break;
      if (fx > 0) points[i].x += delta * fx;
      if (fz > 0) points[i].z = Math.max(LANE_MIN, Math.min(LANE_MAX, points[i].z + deltaZ * fz));
      const yAbs = yA + (absY(i) - yA) * fy;
      points[i].y = Math.max(0, yAbs - ground(points[i].x, points[i].z));
    }
    lastEnd = s1;
  }
}

/** Interpretation mit Ereignissen: erster Durchlauf erkennt Loopings/Kehrtwenden, zweiter wendet die Tiefen der Steilkurven an. */
export function interpretWithEvents(pts: Vec2[], opts: StrokeOptions): { points: InterpretedPoint[]; events: StrokeEvent[] } {
  const hints = opts.allowLoops === false ? [] : opts.loopHints ?? findRoundLoops(pts);
  opts = { ...opts, loopHints: hints };
  let points = interpretStroke(pts, opts);
  if (points.length < 2) return { points, events: [] };
  const loops = opts.allowLoops === false ? [] : detectLoops(points, hints);
  let turns = opts.allowTurns === false ? [] : [...detectTurns(points, loops, 'height'), ...detectTurns(points, loops, 'floor')];
  if (turns.some((t) => t.floor)) {
    // Boden-Kehren brauchen nach dem Scheitel noch Strich für den Halbkreis; und endet der Strich nahe der
    // Station, gehört die Schluss-Kehre dem Rundenschluss (snapEndToStart), nicht der Kehren-Formung
    const n = pts.length;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
    const closeAt = opts.closeAt ?? { X: pts[0].x, Y: pts[0].y };
    const closing = Math.hypot(pts[n - 1].x - closeAt.X, pts[n - 1].y - closeAt.Y) <= (opts.closeSnap ?? CLOSE_SNAP);
    turns = turns.filter((t) => {
      if (!t.floor) return true;
      const tail = cum[n - 1] - cum[t.index];
      if (tail < turnHalfLength(TURN_RADIUS_MIN)) return false;
      return !(closing && tail <= CLOSE_U_REACH);
    });
  }
  if (turns.length) {
    const shift = turnShiftProfile(pts, points, turns, opts.groundHeight ?? (() => 0));
    if (turns.some((t) => !t.floor)) points = interpretStroke(pts, { ...opts, zShift: (i) => shift[Math.max(0, Math.min(shift.length - 1, i))] });
    shapeTurns(points, pts, turns, opts.groundHeight ?? (() => 0), opts.groundClearance ?? 0.6);
  }
  for (const l of loops) shapeLoopCrossing(points, l);
  return { points, events: [...loops, ...turns].sort((a, b) => a.index - b.index) };
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
  const y = Float64Array.from(y0);
  for (let k = 0; k < maxSweeps; k++) {
    let changed = false;
    const step = (i: number, forward: boolean) => {
      const d1 = s[i] - s[i - 1];
      const d2 = s[i + 1] - s[i];
      if (d1 < 1e-6 || d2 < 1e-6) return;
      // Senke: der Punkt darf nicht tiefer liegen als die Parabel durch die Nachbarn
      if (!kept[i]) {
        const mid = y[i - 1] + ((y[i + 1] - y[i - 1]) * d1) / (d1 + d2);
        const lim = mid - (d1 * d2) / (2 * rValley[i]);
        if (y[i] < lim - 1e-6) {
          y[i] = lim;
          changed = true;
        }
      }
      // Kuppe: der nächste Punkt in Laufrichtung darf nicht tiefer liegen als die Fortsetzung der Parabel
      // (Steigung aus dem vorigen Nachbarn, Krümmung −1/R; exakt für Parabeln, auch bei ungleichen Schritten)
      if (forward && !kept[i + 1]) {
        const slope = (y[i] - y[i - 1]) / d1;
        const lim = y[i] + slope * d2 - (d2 * (d1 + d2)) / (2 * rCrest[i]);
        if (y[i + 1] < lim - 1e-6) {
          y[i + 1] = lim;
          changed = true;
        }
      } else if (!forward && !kept[i - 1]) {
        const slope = (y[i + 1] - y[i]) / d2;
        const lim = y[i] - slope * d1 - (d1 * (d1 + d2)) / (2 * rCrest[i]);
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
export function pointsToNodes(points: InterpretedPoint[], opts: StrokeOptions, events: StrokeEvent[]): TrackNode[] {
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
  limitVerticalCurvature(world, inLoop, dist3(world[0], world[world.length - 1]) < 1);
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
  // keine gebrochenen Tangenten aus Strichen (Achterbahnen haben keine Ecken). 0,3 m: Die Linie ist schon geglättet,
  // so entstehen nur die nötigen Knoten (ein Oval braucht rund zehn), Loopings und Halbkreise bleiben rund
  const segments = fitWithCorners3(pts, opts.fitError ?? 0.3, 179);
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
  // Ereignis-Knoten markieren (nächster Knoten zum Scheitelpunkt)
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
  const { points, events } = interpretWithEvents(pts, opts);
  if (points.length < 2) return { path: emptyPath(), events: [], points: [] };
  snapEndToStart(points, opts.groundHeight ?? (() => 0), events, undefined, opts.closeSnap);
  const nodes = pointsToNodes(points, opts, events);
  if (nodes.length < 2) return { path: emptyPath(), events: [], points };
  nodes[0].kind = 'station';
  const path: TrackPath = { ...emptyPath(), nodes };
  closePath(path);
  if (opts.autoClose) closeTrack(path);
  return { path, events, points };
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

/**
 * Bahn am offenen Ende fortsetzen: Der neue Strich beginnt am Endknoten (in dessen Tiefe und Lesart)
 * und wird angehängt. Endet er am Start, schließt sich die Bahn.
 */
export function extendTrack(path: TrackPath, stroke: StagePoint[], opts: StrokeOptions = {}): TrackPath | null {
  if (isClosed(path) || path.nodes.length < 2) return null;
  const pts = prepareStroke(stroke);
  if (pts.length < 2) return null;
  const ground = opts.groundHeight ?? (() => 0);
  const end = path.nodes[path.nodes.length - 1];
  const startMode: StrokeMode = end.y - ground(end.x, end.z) > 1.2 ? 'height' : 'floor';
  const stationStage = toStage(path.nodes[0].x, path.nodes[0].y, path.nodes[0].z);
  const { points, events } = interpretWithEvents(pts, { ...opts, startZ: end.z, startMode, closeAt: stationStage });
  if (points.length < 2) return null;
  const station = path.nodes[0];
  const sp = nodePos(station);
  snapEndToStart(points, ground, events, { pos: sp, dir: sub3(nodeOut(station), sp) }, opts.closeSnap);
  const newNodes = pointsToNodes(points, opts, events);
  if (newNodes.length < 2) return null;
  const out: TrackPath = { nodes: path.nodes.map((n) => ({ ...n })), elements: path.elements.map((e) => ({ ...e })), startType: path.startType, templates: { ...path.templates } };
  const last = out.nodes[out.nodes.length - 1];
  // erster neuer Knoten liegt praktisch auf dem Ende → weglassen
  if (dist3(nodePos(last), nodePos(newNodes[0])) < 1.0) newNodes.shift();
  if (newNodes.length < 1) return null;
  const dirL = normalize3(sub3(nodePos(last), nodeIn(last)));
  const toNext = normalize3(sub3(nodePos(newNodes[0]), nodePos(last)));
  const h = Math.max(1, dist3(nodePos(last), nodePos(newNodes[0])) / 3);
  const outDir = normalize3(add3(scale3(dirL, 0.5), scale3(toNext, 0.5)));
  last.outX = outDir.x * h; last.outY = outDir.y * h; last.outZ = (outDir.z * h) / LANE_DEPTH;
  const first = newNodes[0];
  const dirF = normalize3(sub3(nodeOut(first), nodePos(first)));
  const inDir = normalize3(add3(scale3(dirF, -0.5), scale3(toNext, -0.5)));
  first.inX = inDir.x * h; first.inY = inDir.y * h; first.inZ = (inDir.z * h) / LANE_DEPTH;
  out.nodes.push(...newNodes);
  out.closed = false;
  closePath(out);
  return out;
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
