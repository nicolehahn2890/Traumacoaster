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
import { dist, segmentIntersection, smoothstep } from '@/core/math';
import type { Vec3 } from '@/core/math3';
import { add3, dist3, normalize3, scale3, sub3 } from '@/core/math3';
import { dedupe, smoothStroke } from '@/core/rdp';
import { fitWithCorners3 } from '@/core/bezierFit3';
import { createNode, emptyPath, isAutoNode, nodeIn, nodeOut, nodePos, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, LANE_RISE, laneRise, laneScale, type StagePoint } from './stage';

export type StrokeMode = 'floor' | 'height';

export interface StrokeOptions {
  /** Bodenhöhe (Welt) an x, Spur z */
  groundHeight?: (x: number, z: number) => number;
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
}

export interface StrokeEvent {
  kind: 'turn' | 'loop';
  index: number;
  dir?: number;
  from?: number;
  to?: number;
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
const Z_BLEND = 6; // Bühnen-Meter: weicher Anschluss der Boden-Tiefe an die vorige Tiefe
const TURN_MIN_WIDTH = 10;
/** Steilkurve: Halbkreis in der Horizontalen mit dem halben Spurabstand als Radius */
const TURN_RADIUS = LANE_DEPTH / 2;
const TURN_HALF_LENGTH = (Math.PI * TURN_RADIUS) / 2;
const TURN_BLEND = 10; // Bühnen-Meter: Anschluss des gezeichneten Rückwegs an den Halbkreis
const RESAMPLE = 0.5;

/** Bühnen-Y der Bodenlinie an Welt-x und Tiefe z */
function groundY(ground: (x: number, z: number) => number, X: number, z: number): number {
  const k = laneScale(z);
  return ground(X / k, z) * k + laneRise(z);
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
  if (e.y > groundY(ground, e.x, LANE_MAX) + 0.6) return true;
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
  const clampZ = (z: number) => Math.max(LANE_MIN, Math.min(LANE_MAX, z));
  const heightPoint = (i: number, z: number): InterpretedPoint => {
    const k = laneScale(z);
    return { x: pts[i].x / k, y: Math.max(0, (pts[i].y - groundY(ground, pts[i].x, z)) / k), z, mode: 'height' };
  };
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const aboveStage = (i: number) => pts[i].y > groundY(ground, pts[i].x, LANE_MAX) + 0.6;
  const startsHeight = (i: number) => aboveStage(i) || (climb[runOf[i]] && i >= runs[runOf[i]].start);

  let mode: StrokeMode = opts.startMode ?? 'floor';
  let zFrozen = opts.startZ ?? depthFromY(ground, pts[0].x, pts[0].y);
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
          z = clampZ(z);
          out[k] = { x: pts[k].x / laneScale(z), y: 0, z, mode: 'floor' };
        }
        zFrozen = out[e - 1].z;
      }
      if (e >= n) break;
      // Wechsel in die Höhe
      if (e === 0 && opts.startZ !== undefined) zFrozen = opts.startZ;
      else if (e === i) zFrozen = aboveStage(e) && !climb[runOf[e]] ? LANE_MAX : depthFromY(ground, pts[e].x, pts[e].y);
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
      if (h <= 0.35 && goingDown && i > climbEnd) {
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
export function detectLoops(points: InterpretedPoint[]): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  const n = points.length;
  const P = (i: number): Vec2 => ({ x: points[i].x, y: points[i].y });
  const xDir = (i: number): number => Math.sign(points[i + 1].x - points[i].x);
  let i = 0;
  while (i < n - 3) {
    let found = false;
    if (points[i].mode === 'height') {
      for (let j = i + 2; j < n - 1; j++) {
        if (points[j].mode !== 'height' || Math.abs(points[j].z - points[i].z) > 0.3) continue;
        if (xDir(i) * xDir(j) < 0) continue;
        const hit = segmentIntersection(P(i), P(i + 1), P(j), P(j + 1));
        if (hit) {
          let apex = i + 1;
          let best = -1;
          for (let k = i + 1; k <= j; k++) {
            const d = Math.hypot(points[k].x - hit.point.x, points[k].y - hit.point.y);
            if (d > best) {
              best = d;
              apex = k;
            }
          }
          if (best > 2.5) events.push({ kind: 'loop', index: apex, from: i, to: j + 1 });
          i = j + 1;
          found = true;
          break;
        }
      }
    }
    if (!found) i++;
  }
  return events;
}

/** Kehrtwenden in Höhen-Abschnitten (x-Richtung dreht um, ohne Kreuzung) */
export function detectTurns(points: InterpretedPoint[], loops: StrokeEvent[]): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  const inLoop = (i: number) => loops.some((l) => i >= l.from! && i <= l.to!);
  let dir = 0;
  let extremeIdx = 0;
  let extremeX = points.length ? points[0].x : 0;
  let legStartX = extremeX;
  let runStart = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].mode !== 'height') {
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
        events.push({ kind: 'turn', index: extremeIdx, dir: a >= b ? 1 : -1 });
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
export function turnShiftProfile(stroke: Vec2[], points: InterpretedPoint[], turns: StrokeEvent[]): number[] {
  const n = stroke.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(stroke[i], stroke[i - 1]);
  const shift = new Array<number>(n).fill(0);
  let acc = 0;
  let segStart = 0;
  for (const t of [...turns].sort((a, b) => a.index - b.index)) {
    // neuer Höhenabschnitt? dann beginnt die Summe der Verschiebungen wieder bei 0
    for (let i = segStart; i < t.index; i++) if (points[i].mode === 'floor') { acc = 0; segStart = i; }
    const zAt = points[t.index].z + acc;
    let d = t.dir ?? 1;
    if (zAt + d > LANE_MAX + 1e-6 || zAt + d < LANE_MIN - 1e-6) {
      d = -d;
      t.dir = d;
    }
    const sApex = cum[t.index];
    for (let i = 0; i < n; i++) {
      const s = cum[i];
      if (s <= sApex - TURN_HALF_LENGTH) continue;
      shift[i] += d * smoothstep((s - (sApex - TURN_HALF_LENGTH)) / (2 * TURN_HALF_LENGTH));
    }
    acc += d;
  }
  return shift;
}

/**
 * Steilkurven in der Horizontalen rund machen: Im Kurvenbereich (π·R um den Scheitel) werden x und Tiefe
 * durch einen Halbkreis mit Radius R = halber Spurabstand ersetzt (die Höhe bleibt wie gezeichnet).
 * Die gezeichnete x-Umkehr ist im Seitenriss meist spitz; ohne diesen Schritt entstünde eine Haarnadel
 * mit winzigem Radius. Danach wird der gezeichnete Rückweg über TURN_BLEND Meter angeschlossen.
 */
export function shapeTurns(points: InterpretedPoint[], stroke: Vec2[], turns: StrokeEvent[]): void {
  const n = points.length;
  if (n < 3) return;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(stroke[i], stroke[i - 1]);
  const R = TURN_RADIUS;
  let lastEnd = -Infinity;
  for (const t of [...turns].sort((a, b) => a.index - b.index)) {
    const sA = cum[t.index];
    const s0 = sA - TURN_HALF_LENGTH;
    const s1 = sA + TURN_HALF_LENGTH;
    if (s0 < lastEnd) continue;
    let i0 = t.index;
    while (i0 > 0 && cum[i0 - 1] >= s0) i0--;
    let i1 = t.index;
    while (i1 < n - 1 && cum[i1 + 1] <= s1) i1++;
    let ok = true;
    for (let i = i0; i <= i1; i++) if (points[i].mode !== 'height') ok = false;
    if (!ok || i1 <= i0) continue;
    const xA = points[i0].x;
    const zA = points[i0].z;
    const yA = points[i0].y;
    const yB = points[i1].y;
    const dirX = Math.sign(points[t.index].x - xA) || 1;
    const sgn = t.dir ?? 1;
    const drawnEnd = points[i1].x;
    for (let i = i0; i <= i1; i++) {
      const th = Math.min(Math.PI, Math.max(0, (cum[i] - s0) / R));
      points[i].x = xA + dirX * R * Math.sin(th);
      points[i].z = Math.max(LANE_MIN, Math.min(LANE_MAX, zA + (sgn * R * (1 - Math.cos(th))) / LANE_DEPTH));
      // Höhe weich durch die Kurve: Die gezeichnete Bild-Höhe enthält den Anstieg der Bodenlinie der neuen
      // Spur; was davon übrig bleibt, wäre ein Buckel genau im Scheitel (Airtime in der Steilkurve).
      points[i].y = yA + (yB - yA) * smoothstep((cum[i] - cum[i0]) / Math.max(1e-6, cum[i1] - cum[i0]));
    }
    const delta = points[i1].x - drawnEnd;
    for (let i = i1 + 1; i < n && points[i].mode === 'height'; i++) {
      const f = 1 - (cum[i] - cum[i1]) / TURN_BLEND;
      if (f <= 0) break;
      points[i].x += delta * f;
    }
    lastEnd = s1;
  }
}

/** Interpretation mit Ereignissen: erster Durchlauf erkennt Loopings/Kehrtwenden, zweiter wendet die Tiefen der Steilkurven an. */
export function interpretWithEvents(pts: Vec2[], opts: StrokeOptions): { points: InterpretedPoint[]; events: StrokeEvent[] } {
  let points = interpretStroke(pts, opts);
  if (points.length < 2) return { points, events: [] };
  const loops = opts.allowLoops === false ? [] : detectLoops(points);
  const turns = opts.allowTurns === false ? [] : detectTurns(points, loops);
  if (turns.length) {
    const shift = turnShiftProfile(pts, points, turns);
    points = interpretStroke(pts, { ...opts, zShift: (i) => shift[Math.max(0, Math.min(shift.length - 1, i))] });
    shapeTurns(points, pts, turns);
  }
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

/** Interpretierte Punkte → Knoten (Anheben über Terrain, Ecken runden, 3D-Fit) */
export function pointsToNodes(points: InterpretedPoint[], opts: StrokeOptions, events: StrokeEvent[]): TrackNode[] {
  const ground = opts.groundHeight ?? (() => 0);
  const clearance = opts.groundClearance ?? 0.6;
  const world: Vec3[] = points.map((p) => {
    const g = ground(p.x, p.z);
    // p.y ist die Höhe über dem Boden der Spur; Welt-Höhe = Boden + p.y, nie unter die Mindesthöhe
    let y = p.mode === 'floor' ? g + clearance : Math.max(g + clearance, g + p.y);
    if (opts.maxHeight && opts.maxHeight > 0) y = Math.min(y, opts.maxHeight);
    return { x: p.x, y, z: p.z * LANE_DEPTH };
  });
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
  const segments = fitWithCorners3(pts, opts.fitError ?? 0.45);
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
    const apex = world[Math.min(world.length - 1, e.index)];
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
  let pts: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  pts = dedupe(pts, 0.15);
  pts = smoothStroke(pts, 5);
  pts = resample(pts, RESAMPLE);
  if (pts.length < 2) return { path: emptyPath(), events: [], points: [] };
  const { points, events } = interpretWithEvents(pts, opts);
  if (points.length < 2) return { path: emptyPath(), events: [], points: [] };
  const nodes = pointsToNodes(points, opts, events);
  if (nodes.length < 2) return { path: emptyPath(), events: [], points };
  nodes[0].kind = 'station';
  const path: TrackPath = { ...emptyPath(), nodes };
  closePath(path);
  return { path, events, points };
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
 * Schließt den Pfad (3D).
 * - Ende nahe am Start: direkte weiche Verbindung.
 * - Sonst: automatischer Rückweg mit zwei Halbkreis-Kehren über die Nachbarspur (Bremsstrecke).
 */
export function closePath(path: TrackPath, returnHeight = 0.7): void {
  const nodes = path.nodes;
  if (nodes.length < 2) return;
  for (let i = nodes.length - 1; i >= 0; i--) if (isAutoNode(nodes[i])) nodes.splice(i, 1);
  if (nodes.length < 2) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (dist3(nodePos(first), nodePos(last)) < 1.5 && nodes.length > 2) {
    // Strichende liegt auf dem Start: Eingangs-Handle übernehmen, Endknoten verwerfen → geschlossen
    first.inX = last.inX; first.inY = last.inY; first.inZ = last.inZ;
    nodes.pop();
    first.kind = 'station';
    return;
  }
  const pf = nodePos(first);
  const pl = nodePos(last);
  const gap = dist3(pf, pl);
  const endDir = normalize3(sub3(pl, nodeIn(last)));
  const startDir = normalize3(sub3(nodeOut(first), pf));

  if (gap <= 10) {
    const h = Math.max(1.5, gap / 3);
    const toStart = normalize3(sub3(pf, pl));
    const outDir = normalize3(add3(scale3(endDir, 0.5), scale3(toStart, 0.5)));
    const inDir = normalize3(add3(scale3(startDir, -0.5), scale3(toStart, -0.5)));
    last.outX = outDir.x * h; last.outY = outDir.y * h; last.outZ = (outDir.z * h) / LANE_DEPTH;
    first.inX = inDir.x * h; first.inY = inDir.y * h; first.inZ = (inDir.z * h) / LANE_DEPTH;
    nodes[0].kind = 'station';
    return;
  }

  const z0 = Math.round(first.z);
  const ze = Math.round(last.z);
  // Rückweg-Spur: eine Spur neben dem Start (und neben dem Ende), bevorzugt hinten
  let zr = z0 + 1 <= LANE_MAX ? z0 + 1 : z0 - 1;
  if (zr === ze) zr = z0 - 1 >= LANE_MIN ? z0 - 1 : z0 + 1;
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
  const a0 = arcEnd[0];
  const lo = Math.max(1, dist3(nodePos(a0), pl) / 3);
  last.outX = endDir.x * lo; last.outY = endDir.y * lo; last.outZ = (endDir.z * lo) / LANE_DEPTH;
  const aN = arcStart[arcStart.length - 1];
  const li = Math.max(1, dist3(pf, nodePos(aN)) / 3);
  first.inX = -startDir.x * li; first.inY = -startDir.y * li; first.inZ = (-startDir.z * li) / LANE_DEPTH;
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
