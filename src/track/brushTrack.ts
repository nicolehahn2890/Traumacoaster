/**
 * Pinsel-Bahn („intelligente Bahn“): Die gemalte Linie ist die Bahn, so wie man sie in der festen Ansicht sieht.
 * Die Ansicht zeigt Tiefe nur als Versatz nach oben (Bildhöhe Y = Höhe + Tiefe · LANE_RISE / LANE_DEPTH, ohne
 * Verkleinerung nach hinten). Was das Bild nicht festlegt, wählt die Bahn selbst:
 *  - Tiefe je Stelle (planBrushTrack): Lange Wellen der Bildhöhe werden Tiefe, kurze werden Höhe über dem Boden
 *    (Wunschhöhe). Nie unter dem Boden, nie aus der Bühne, an Kreuzungen getrennt (später Gezeichnetes liegt vorne),
 *    Fliehkräfte über die Tiefe weicher (je schneller der Zug dort, desto stärker).
 *  - Probefahrten (BrushRefiner): An der ersten Problemstelle bessert die Bahn nach (Fliehkraft weicher, Höhe halten
 *    statt kopfüber, Kuppe nach hinten, Linie innerhalb einer kleinen Toleranz runder). Was dann noch scheitert, liegt
 *    am Strich und bleibt so: Das ist das Spiel.
 */
import type { Vec3 } from '@/core/math3';
import { createNode, emptyPath, sampleTrack, type TrackPath, type TrackSamples } from './model';
import { reduceNodes } from './reduceNodes';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, LANE_RISE, type StagePoint } from './stage';

/** Bildhöhe je Meter Tiefe */
const C = LANE_RISE / LANE_DEPTH;
const Z_MIN = LANE_MIN * LANE_DEPTH;
const Z_MAX = LANE_MAX * LANE_DEPTH;
/** Abstand der Linienpunkte (Bühnen-Meter) */
const STEP = 1;
/** Wunschhöhe über dem Boden, wo die Tiefe frei ist */
const H_COMFORT = 4;
/** Bildhöhen-Wellen, die länger sind, werden Tiefe; kürzere werden Höhe (Glättung zweiter Ordnung) */
const CUTOFF = 40;
const LAMBDA = (CUTOFF / (2 * Math.PI)) ** 4;
/** Gewicht der Fliehkraft (Tempo² · Krümmung) bei der Tiefenwahl */
const KAPPA = 4;
/** Abstand der Stränge an einer Kreuzung (3D) */
const SEPARATION = 3.2;
const SEP_DEPTH = SEPARATION / Math.sqrt(1 + C * C);
const G = 9.81;
const PIN_W = 1e4;
/** so weit (m) um die Station bleibt die Bahn in deren Tiefe; danach wird die Wunschhöhe über STATION_RAMP m eingeblendet */
const STATION_CALM = 12;
const STATION_RAMP = 20;
/** Steilheit des Strichs (Bild), ab der die Wunschhöhe nachlässt bzw. kaum noch zieht */
const STEEP_FROM = (15 * Math.PI) / 180;
const STEEP_TO = (40 * Math.PI) / 180;
const STEEP_WH = 0.03;
/** Gewicht, mit dem die Tiefe an der Station festgehalten wird */
const CALM_WH = 50;

export interface BrushOptions {
  /** Bodenhöhe (Welt) an x und Tiefe z (Spuren) */
  ground?: (x: number, z: number) => number;
  /** Mindesthöhe über dem Boden */
  clearance?: number;
  /** endet die Linie so nah an ihrem Anfang (Bühnen-Meter), schließt sich die Runde */
  closeSnap?: number;
  /** so weit (Bühnen-Meter) darf die Linie beim Nachbessern nachgeben */
  tolerance?: number;
}

interface Opts {
  ground: (x: number, z: number) => number;
  clearance: number;
  closeSnap: number;
  tolerance: number;
}

const withDefaults = (o: BrushOptions): Opts => ({
  ground: o.ground ?? (() => 0),
  clearance: o.clearance ?? 0.8,
  closeSnap: o.closeSnap ?? 8,
  tolerance: o.tolerance ?? 1,
});

export interface LineCrossing {
  /** früherer und späterer Strichpunkt an der Kreuzung */
  i: number;
  j: number;
  /** liegt der später gezeichnete Strang vorne? */
  laterFront?: boolean;
}

export interface BrushPlan {
  /** Linie, wie gezeichnet (Bühne, 1 m Abstand) */
  drawn: StagePoint[];
  /** Linie der Bahn (nach dem Nachbessern höchstens tolerance von drawn entfernt) */
  line: StagePoint[];
  closed: boolean;
  crossings: LineCrossing[];
  /** Tiefe je Linienpunkt (Meter, vorne negativ) */
  z: Float64Array;
  /** Bahnpunkte in der Welt (x, Höhe, Tiefe in Metern), je Linienpunkt */
  pts: Vec3[];
  path: TrackPath;
  /** Steuergrößen der Tiefenwahl, die das Nachbessern verändert: Gewicht der Wunschhöhe, Faktor auf die
   *  Fliehkraft, untere Schranke der Tiefe (Kuppe nach hinten) */
  wH: Float64Array;
  wMul: Float64Array;
  lower: Float64Array;
  /** 1 an der Station (Tiefe bleibt die der Station), 0 auf freier Strecke */
  calm: Float64Array;
}

// ------------------------------------------------------------------ Linie

function resampleLine(pts: StagePoint[], step: number): StagePoint[] {
  const out: StagePoint[] = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.X - a.X, b.Y - a.Y);
    if (d < 1e-9) continue;
    let t = step - carry;
    while (t <= d) {
      out.push({ X: a.X + ((b.X - a.X) * t) / d, Y: a.Y + ((b.Y - a.Y) * t) / d });
      t += step;
    }
    carry = d - (t - step);
  }
  const last = pts[pts.length - 1];
  const o = out[out.length - 1];
  if (Math.hypot(o.X - last.X, o.Y - last.Y) > step * 0.3) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

/** Gauß-Glättung entlang gleichmäßig abgetasteter Punkte, Enden bleiben fest */
function smoothLine(pts: StagePoint[], sigma: number, step: number): StagePoint[] {
  const r = Math.ceil((3 * sigma) / step);
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -r; k <= r; k++) {
      const q = pts[Math.max(0, Math.min(pts.length - 1, i + k))];
      const w = Math.exp(-((k * step) ** 2) / (2 * sigma * sigma));
      sx += q.X * w;
      sy += q.Y * w;
      sw += w;
    }
    return { X: sx / sw, Y: sy / sw };
  });
}

/** Richtung der Linie am Anfang (+1) oder Ende (−1), über rund zwei Meter */
function endDirection(line: StagePoint[], atStart: boolean): StagePoint {
  const n = line.length;
  const a = atStart ? line[0] : line[Math.max(0, n - 3)];
  const b = atStart ? line[Math.min(n - 1, 2)] : line[n - 1];
  const l = Math.hypot(b.X - a.X, b.Y - a.Y) || 1;
  return { X: (b.X - a.X) / l, Y: (b.Y - a.Y) / l };
}

/** Linienlänge (Bühnen-Meter) */
export function lineLength(pts: StagePoint[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y);
  return l;
}

/**
 * Gemalte Pinsellinie aufbereiten: gleichmäßig abtasten, Fingerknicke wegglätten, auf 1 m Abstand bringen. Endet sie
 * nah an ihrem Anfang, wird die Runde mit einem weichen Bogen geschlossen.
 */
export function prepareBrushLine(points: StagePoint[], closeSnap = 8): { line: StagePoint[]; closed: boolean } | null {
  if (points.length < 2 || lineLength(points) < 6) return null;
  let line = resampleLine(smoothLine(resampleLine(points, 0.25), 0.5, 0.25), STEP);
  if (line.length < 7) return null;
  const a = line[0];
  const b = line[line.length - 1];
  const gap = Math.hypot(b.X - a.X, b.Y - a.Y);
  if (gap > closeSnap || lineLength(line) < 40) return { line, closed: false };
  // Rundenschluss: kubischer Bogen vom Ende (in seiner Richtung) in den Anfang (in dessen Richtung)
  const te = endDirection(line, false);
  const ts = endDirection(line, true);
  const h = Math.max(1.5, gap / 3);
  const p1 = { X: b.X + te.X * h, Y: b.Y + te.Y * h };
  const p2 = { X: a.X - ts.X * h, Y: a.Y - ts.Y * h };
  const m = Math.max(4, Math.ceil(gap * 2));
  const conn: StagePoint[] = [];
  for (let k = 1; k <= m; k++) {
    const t = k / m;
    const mt = 1 - t;
    conn.push({
      X: mt * mt * mt * b.X + 3 * mt * mt * t * p1.X + 3 * mt * t * t * p2.X + t * t * t * a.X,
      Y: mt * mt * mt * b.Y + 3 * mt * mt * t * p1.Y + 3 * mt * t * t * p2.Y + t * t * t * a.Y,
    });
  }
  line = resampleLine([...line, ...conn], STEP);
  line[line.length - 1] = { ...a };
  return { line, closed: true };
}

/** Kreuzungen der Linie mit sich selbst (Strichpunkt-Paare, der spätere zuletzt) */
export function findLineCrossings(line: StagePoint[], closed: boolean): LineCrossing[] {
  const n = line.length;
  const out: LineCrossing[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const minX = Math.min(a.X, b.X);
    const maxX = Math.max(a.X, b.X);
    const minY = Math.min(a.Y, b.Y);
    const maxY = Math.max(a.Y, b.Y);
    for (let j = i + 8; j < n - 1; j++) {
      if (closed && i < 4 && j > n - 6) continue;
      const c = line[j];
      const d = line[j + 1];
      if (Math.max(c.X, d.X) < minX || Math.min(c.X, d.X) > maxX || Math.max(c.Y, d.Y) < minY || Math.min(c.Y, d.Y) > maxY) continue;
      const rx = b.X - a.X;
      const ry = b.Y - a.Y;
      const sx = d.X - c.X;
      const sy = d.Y - c.Y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.X - a.X) * sy - (c.Y - a.Y) * sx) / den;
      const u = ((c.X - a.X) * ry - (c.Y - a.Y) * rx) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push({ i: t < 0.5 ? i : i + 1, j: u < 0.5 ? j : j + 1 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ Tiefe

/** vorkonditioniertes CG für das symmetrische System A·x = b */
function pcg(apply: (x: Float64Array, out: Float64Array) => void, b: Float64Array, x: Float64Array, diag: Float64Array, maxIt = 2000): void {
  const n = b.length;
  const r = new Float64Array(n);
  const zv = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);
  apply(x, Ap);
  let bb = 0;
  for (let i = 0; i < n; i++) {
    r[i] = b[i] - Ap[i];
    zv[i] = r[i] / diag[i];
    p[i] = zv[i];
    bb += b[i] * b[i];
  }
  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * zv[i];
  const tol = 1e-12 * Math.max(1, bb);
  for (let it = 0; it < maxIt; it++) {
    apply(p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (Math.abs(pAp) < 1e-30) break;
    const alpha = rz / pAp;
    let rr = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
      rr += r[i] * r[i];
    }
    if (rr < tol) break;
    let rz2 = 0;
    for (let i = 0; i < n; i++) {
      zv[i] = r[i] / diag[i];
      rz2 += r[i] * zv[i];
    }
    const beta = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < n; i++) p[i] = zv[i] + beta * p[i];
  }
}

/**
 * Tiefe je Linienpunkt: min Σ wH·(z − Ziel)² + Σ λ_i·(Δ²z)² + Σ wK·[(Y'' − c·z'')² + z''²]
 * mit Ziel = Tiefe, bei der die Bahn auf Wunschhöhe läge, λ für die Grenzwellenlänge, wK = Fliehkraft-Gewicht aus dem
 * geschätzten Tempo. Schranken (aktiv gesetzt, sobald verletzt): Boden, Bühne, untere Schranke (Nachbessern),
 * Kreuzungen. Die Station (Anfang) steht auf dem Boden, bei geschlossener Runde auch das Ende.
 */
function solveDepth(line: StagePoint[], closed: boolean, crossings: LineCrossing[], wH: Float64Array, wMul: Float64Array, lower: Float64Array, calm: Float64Array, o: Opts): Float64Array {
  const n = line.length;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - H_COMFORT) / C));
  const target = new Float64Array(n);
  const upper = new Float64Array(n);
  const low = new Float64Array(n);
  const ypp = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) ypp[i] = line[i - 1].Y - 2 * line[i].Y + line[i + 1].Y;
  const bounds = () => {
    for (let i = 0; i < n; i++) {
      const g = o.ground(line[i].X, z[i] / LANE_DEPTH);
      target[i] = (line[i].Y - g - H_COMFORT) / C;
      // unter der vordersten Bodenlinie gezeichnet: ganz vorne bleiben (die Höhe wird dort angehoben)
      upper[i] = Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - g - o.clearance) / C));
      low[i] = Math.min(upper[i], Math.max(Z_MIN, lower[i]));
    }
    for (let i = 0; i < n; i++) if (calm[i] > 0) target[i] = calm[i] * upper[0] + (1 - calm[i]) * target[i];
  };
  bounds();
  const pins = new Map<number, number>();
  const pinStation = () => {
    pins.set(0, upper[0]);
    if (closed) pins.set(n - 1, upper[0]);
  };
  pinStation();
  const wK = new Float64Array(n);
  const active: Array<{ i: number; j: number; v: number }> = [];
  const lam = new Float64Array(n);
  // Schranken-Gewicht: deutlich steifer als der Rest des Systems (das Fliehkraft-Gewicht kann groß werden)
  let pinW = PIN_W;
  const apply = (x: Float64Array, out: Float64Array) => {
    for (let i = 0; i < n; i++) out[i] = wH[i] * x[i];
    for (let i = 1; i < n - 1; i++) {
      const d2 = lam[i] * (x[i - 1] - 2 * x[i] + x[i + 1]);
      out[i - 1] += d2;
      out[i] -= 2 * d2;
      out[i + 1] += d2;
    }
    for (const [i] of pins) out[i] += pinW * x[i];
    for (const c of active) {
      const d = pinW * (x[c.j] - x[c.i]);
      out[c.j] += d;
      out[c.i] -= d;
    }
  };
  const solveOnce = () => {
    for (let i = 1; i < n - 1; i++) lam[i] = LAMBDA + (1 + C * C) * wK[i];
    const b = new Float64Array(n);
    const diag = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      b[i] = wH[i] * target[i];
      diag[i] = wH[i];
    }
    for (let i = 1; i < n - 1; i++) {
      const q = C * wK[i] * ypp[i];
      b[i - 1] += q;
      b[i] -= 2 * q;
      b[i + 1] += q;
      diag[i - 1] += lam[i];
      diag[i] += 4 * lam[i];
      diag[i + 1] += lam[i];
    }
    let maxD = 0;
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, diag[i]);
    pinW = Math.max(PIN_W, 1e3 * maxD);
    for (const [i, v] of pins) {
      b[i] += pinW * v;
      diag[i] += pinW;
    }
    for (const c of active) {
      // z_j − z_i = −v (später vorne: v > 0)
      b[c.j] -= pinW * c.v;
      b[c.i] += pinW * c.v;
      diag[c.j] += pinW;
      diag[c.i] += pinW;
    }
    pcg(apply, b, z, diag);
  };
  const settle = () => {
    for (let round = 0; round < 30; round++) {
      solveOnce();
      let added = 0;
      for (let i = 0; i < n; i++) {
        if (pins.has(i)) continue;
        if (z[i] > upper[i] + 1e-3) {
          pins.set(i, upper[i]);
          added++;
        } else if (z[i] < low[i] - 1e-3) {
          pins.set(i, low[i]);
          added++;
        }
      }
      for (const c of crossings) {
        if (active.some((a) => a.i === c.i && a.j === c.j)) continue;
        const v = c.laterFront ? SEP_DEPTH : -SEP_DEPTH;
        if ((c.laterFront && z[c.j] > z[c.i] - SEP_DEPTH + 1e-3) || (!c.laterFront && z[c.j] < z[c.i] + SEP_DEPTH - 1e-3)) {
          active.push({ i: c.i, j: c.j, v });
          added++;
        }
      }
      if (!added) break;
    }
  };
  // erste Lösung ohne Kreuzungen und Fliehkraft: daraus die Reihenfolge an den Kreuzungen (später Gezeichnetes vorne,
  // außer der frühere Strang liegt schon ganz vorne)
  const order = crossings.filter((c) => c.laterFront === undefined);
  if (order.length) {
    const saved = crossings.splice(0, crossings.length);
    settle();
    crossings.push(...saved);
    for (const c of order) c.laterFront = z[c.i] - SEP_DEPTH >= Z_MIN + 0.5 || z[c.i] + SEP_DEPTH > upper[c.j];
  }
  // Fliehkraft-Gewichte aus dem Tempo der jeweils letzten Lösung (Fallhöhe seit dem höchsten Punkt davor)
  for (let outer = 0; outer < 3; outer++) {
    let hMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = line[i].Y - C * z[i];
      hMax = Math.max(hMax, y);
      const v2 = Math.max(36, 2 * G * (hMax - y));
      wK[i] = KAPPA * (v2 / G) ** 2 * wMul[i];
    }
    // Boden an der neuen Tiefe; die Schranken bilden sich in settle neu
    bounds();
    pins.clear();
    pinStation();
    settle();
  }
  // Reste der weichen Schranken abschneiden: nie unter den Boden, nie aus der Bühne
  for (let i = 0; i < n; i++) z[i] = Math.min(upper[i], Math.max(low[i], z[i]));
  return z;
}

// ------------------------------------------------------------------ Bahn

/** Weltpunkte je Linienpunkt: x wie gezeichnet, Höhe = Bildhöhe − Tiefe · c (nie unter der halben Mindesthöhe) */
function worldPoints(line: StagePoint[], z: Float64Array, closed: boolean, o: Opts): Vec3[] {
  const pts = line.map((p, i) => {
    const g = o.ground(p.X, z[i] / LANE_DEPTH);
    return { x: p.X, y: Math.max(p.Y - C * z[i], g + o.clearance * 0.5), z: z[i] };
  });
  if (closed) pts[pts.length - 1] = { ...pts[0] };
  return pts;
}

/** Knoten aus den Weltpunkten: so wenige wie nötig (Scheitel-Knoten, siehe reduceNodes) */
export function pathFromPoints(pts: Vec3[], closed: boolean): TrackPath {
  const segs = reduceNodes(pts, [], {}).segments;
  const mk = (p: Vec3) => createNode(p.x, p.y, p.z / LANE_DEPTH);
  const nodes = segs.map((seg, i) => {
    const nd = mk(seg.p0);
    nd.outX = seg.p1.x - seg.p0.x;
    nd.outY = seg.p1.y - seg.p0.y;
    nd.outZ = (seg.p1.z - seg.p0.z) / LANE_DEPTH;
    if (i > 0 || closed) {
      const prev = segs[(i - 1 + segs.length) % segs.length];
      nd.inX = prev.p2.x - prev.p3.x;
      nd.inY = prev.p2.y - prev.p3.y;
      nd.inZ = (prev.p2.z - prev.p3.z) / LANE_DEPTH;
    }
    return nd;
  });
  if (!closed && segs.length) {
    const last = segs[segs.length - 1];
    const end = mk(last.p3);
    end.inX = last.p2.x - last.p3.x;
    end.inY = last.p2.y - last.p3.y;
    end.inZ = (last.p2.z - last.p3.z) / LANE_DEPTH;
    nodes.push(end);
  }
  if (nodes.length) nodes[0].kind = 'station';
  return { ...emptyPath(), nodes, closed, brush: true };
}

function replan(plan: BrushPlan, o: Opts): void {
  plan.z = solveDepth(plan.line, plan.closed, plan.crossings, plan.wH, plan.wMul, plan.lower, plan.calm, o);
  plan.pts = worldPoints(plan.line, plan.z, plan.closed, o);
  plan.path = pathFromPoints(plan.pts, plan.closed);
}

/** Aus der gemalten Pinsellinie die Bahn: Linie aufbereiten, Kreuzungen, Tiefe, Knoten. null bei zu kurzem Strich. */
export function planBrushTrack(points: StagePoint[], options: BrushOptions = {}): BrushPlan | null {
  const o = withDefaults(options);
  const prep = prepareBrushLine(points, o.closeSnap);
  if (!prep) return null;
  const n = prep.line.length;
  // An der Station zieht die Tiefe zur Tiefe der Station statt zur Wunschhöhe: Die Bahn bleibt dort am Boden und
  // folgt der Bildhöhe, bis der Strich steigt. Sonst entstünde direkt nach der Station ein kleiner Buckel, an dem
  // der Kettenzug schon endet.
  const calm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const fromStation = Math.min(i, prep.closed ? n - 1 - i : Infinity) * STEP;
    calm[i] = 1 - Math.min(1, Math.max(0, (fromStation - STATION_CALM) / STATION_RAMP));
  }
  // Steil gezeichnet ist Höhe: Dort zieht die Wunschhöhe kaum (unter 15° voll, ab 40° fast nicht). Ein steiler
  // Strich wird so ein Anstieg, statt erst nach hinten zu wandern und dann umso steiler zu steigen.
  const wH = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = prep.line[Math.max(0, i - 2)];
    const b = prep.line[Math.min(n - 1, i + 2)];
    const angle = Math.atan2(Math.abs(b.Y - a.Y), Math.abs(b.X - a.X) + 1e-9);
    wH[i] = Math.max(STEEP_WH, Math.min(1, (STEEP_TO - angle) / (STEEP_TO - STEEP_FROM)));
    // an der Station hält die Tiefe fest (die Glättung der Tiefe zöge sie sonst schon zum Rest der Bahn)
    wH[i] = Math.max(wH[i], CALM_WH * calm[i]);
  }
  const plan: BrushPlan = {
    drawn: prep.line.map((p) => ({ ...p })),
    line: prep.line,
    closed: prep.closed,
    crossings: findLineCrossings(prep.line, prep.closed),
    z: new Float64Array(n),
    pts: [],
    path: emptyPath(),
    wH,
    calm,
    wMul: new Float64Array(n).fill(1),
    lower: new Float64Array(n).fill(-Infinity),
  };
  replan(plan, o);
  return plan;
}

/** Anfang und Ende einer Linie weich auf zwei Punkte gleiten lassen (je über blend Bühnen-Meter) */
function blendInto(mid: StagePoint[], start: StagePoint | null, end: StagePoint | null, blend = 5): StagePoint[] {
  const n = mid.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(mid[i].X - mid[i - 1].X, mid[i].Y - mid[i - 1].Y));
  const total = cum[n - 1];
  const ds = start ? { X: start.X - mid[0].X, Y: start.Y - mid[0].Y } : null;
  const de = end ? { X: end.X - mid[n - 1].X, Y: end.Y - mid[n - 1].Y } : null;
  return mid.map((p, i) => {
    let X = p.X;
    let Y = p.Y;
    if (ds) {
      const f = Math.max(0, 1 - cum[i] / blend);
      X += ds.X * f;
      Y += ds.Y * f;
    }
    if (de) {
      const f = Math.max(0, 1 - (total - cum[i]) / blend);
      X += de.X * f;
      Y += de.Y * f;
    }
    return { X, Y };
  });
}

/** Fortsetzen: Die neue Linie schließt an das Ende der alten an (ihr Anfang gleitet auf das alte Ende) */
export function joinLines(base: StagePoint[], add: StagePoint[]): StagePoint[] {
  if (!base.length) return add;
  return [...base, ...blendInto(add, base[base.length - 1], null).slice(1)];
}

/**
 * Überzeichnen: Der neue Strich ersetzt die alte Linie zwischen der Stelle, an der er beginnt, und der, an der er
 * endet (gegen die Fahrtrichtung gezeichnet wird er umgedreht). Endet er nicht an der Linie (weiter als snap), geht
 * die Bahn ab seinem Anfang im neuen Strich weiter.
 */
export function spliceLine(base: StagePoint[], add: StagePoint[], snap: number): StagePoint[] {
  const nearest = (p: StagePoint) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < base.length; i++) {
      const d = Math.hypot(base[i].X - p.X, base[i].Y - p.Y);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return { i: bi, d: bd };
  };
  const a = nearest(add[0]);
  const b = nearest(add[add.length - 1]);
  if (b.d > snap) return joinLines(base.slice(0, a.i + 1), add);
  let from = a.i;
  let to = b.i;
  let mid = add;
  if (from > to) {
    [from, to] = [to, from];
    mid = [...add].reverse();
  }
  return [...base.slice(0, from + 1), ...blendInto(mid, base[from], base[to]).slice(1, -1), ...base.slice(to)];
}

/** Bildschirmlinie einer vorhandenen Bahn (Bühne, 1 m Abstand), zum Fortsetzen und Überzeichnen */
export function trackLine(samples: TrackSamples): StagePoint[] {
  const pts: StagePoint[] = [];
  for (let i = 0; i < samples.count; i++) pts.push({ X: samples.x[i], Y: samples.y[i] + C * samples.z[i] * LANE_DEPTH });
  return pts.length >= 2 ? resampleLine(pts, STEP) : pts;
}

// ------------------------------------------------------------------ Probefahrten

/** was der Nachbesserer von einer Fahrt braucht (TrainSim erfüllt das) */
export interface ProbeSim {
  step(dt: number): void;
  readonly finished: boolean;
  readonly phase: string;
  readonly failReason: string | null;
  readonly cars: ReadonlyArray<{ s: number; gLat: number }>;
}
/** Probefahrt ohne Entgleis-Grenze (die Querkraft wird je Ort mitgeschrieben und hier bewertet) */
export type ProbeFactory = (path: TrackPath, samples: TrackSamples) => ProbeSim;

export interface AcceptedSpot {
  /** Bogenlänge der Bahn */
  s: number;
  reason: string;
  /** Linienpunkt */
  f: number;
}

type Lever = 'soften' | 'flatten' | 'pushBack' | 'relax';

/**
 * Nachbessern in Zeitscheiben: Tiefe lösen, Bahn bauen, Probefahrt; an der ersten Problemstelle einen Hebel
 * ansetzen und von vorn. Problemstellen: Querkraft über der Grenze, Fahrgäste fallen (kopfüber zu langsam),
 * Stillstand. Ein Hebel, der die Bahn auf langen Stücken verdreht (Wagen-Rahmen kippt), wird zurückgenommen.
 */
export class BrushRefiner {
  readonly accepted: AcceptedSpot[] = [];
  repaired = 0;
  steps = 0;
  private stage: 'build' | 'ride' | 'done' = 'build';
  private o: Opts;
  private sim: ProbeSim | null = null;
  private samples: TrackSamples | null = null;
  private lat = new Float64Array(0);
  /** Linienpunkt je Abtastpunkt der aktuellen Bahn (−1 = noch nicht gesucht) */
  private lineIdx = new Int32Array(0);
  /** Steuergrößen geändert: vor der nächsten Probefahrt neu planen */
  private dirty = false;
  private baseInverted = -1;
  private tries = new Map<number, number>();
  private snapshot: { wH: Float64Array; wMul: Float64Array; lower: Float64Array; line: StagePoint[]; key: number; skipTo: number } | null = null;
  /** zuletzt gebaute Bahn, die die Probefahrt bestanden hat oder deren Problemstellen hingenommen sind */
  best: TrackPath;

  constructor(readonly plan: BrushPlan, options: BrushOptions, private probe: ProbeFactory, private latLimit: number, private maxSteps = 24) {
    this.o = withDefaults(options);
    this.best = plan.path;
  }

  get done(): boolean {
    return this.stage === 'done';
  }

  /** höchstens budgetMs arbeiten; true, wenn fertig */
  run(budgetMs: number): boolean {
    const t0 = performance.now();
    while (this.stage !== 'done' && performance.now() - t0 < budgetMs) {
      if (this.stage === 'build') this.build();
      else this.ride(t0, budgetMs);
    }
    return this.stage === 'done';
  }

  private inverted(s: TrackSamples): number {
    let k = 0;
    for (let i = 0; i < s.count; i++) if (s.upy[i] < 0.35) k++;
    return k / Math.max(1, s.count);
  }

  private build(): void {
    if (this.dirty) replan(this.plan, this.o);
    this.dirty = false;
    const samples = sampleTrack(this.plan.path, 0.25);
    const inv = this.inverted(samples);
    if (this.baseInverted < 0) this.baseInverted = inv;
    if (this.snapshot && inv > this.baseInverted + 0.05) {
      // der Hebel hat die Bahn verdreht: zurücknehmen, an dieser Stelle ist er verbraucht
      const s = this.snapshot;
      this.plan.wH = s.wH;
      this.plan.wMul = s.wMul;
      this.plan.lower = s.lower;
      this.plan.line = s.line;
      this.tries.set(s.key, Math.max(this.tries.get(s.key) ?? 0, s.skipTo));
      this.repaired--;
      this.snapshot = null;
      this.dirty = true;
      return;
    }
    this.snapshot = null;
    this.samples = samples;
    this.lat = new Float64Array(samples.count);
    this.lineIdx = new Int32Array(samples.count).fill(-1);
    this.sim = this.probe(this.plan.path, samples);
    this.stage = 'ride';
  }

  private ride(t0: number, budgetMs: number): void {
    const sim = this.sim!;
    const S = this.samples!;
    const L = S.length;
    while (!sim.finished && performance.now() - t0 < budgetMs) {
      for (let k = 0; k < 15 && !sim.finished; k++) {
        sim.step(1 / 60);
        for (const c of sim.cars) {
          const s = S.closed ? ((c.s % L) + L) % L : Math.max(0, Math.min(L, c.s));
          const i = Math.min(S.count - 1, Math.round(s / S.step));
          if (c.gLat > this.lat[i]) this.lat[i] = c.gLat;
        }
      }
      const prob = this.firstProblem(false);
      if (prob) {
        this.handle(prob);
        return;
      }
    }
    if (!sim.finished) return;
    const prob = this.firstProblem(true);
    if (prob) this.handle(prob);
    else this.finish();
  }

  /** erste Problemstelle: Querkraft über der Grenze (nicht hingenommen) oder Fehlschlag der Fahrt */
  private firstProblem(final: boolean): { idx: number; reason: string } | null {
    const S = this.samples!;
    for (let i = 0; i < S.count; i++) {
      if (this.lat[i] > this.latLimit && !this.isAccepted(this.lineIndex(i))) return { idx: i, reason: 'derail' };
    }
    if (!final) return null;
    const sim = this.sim!;
    if (sim.phase === 'failed' || sim.phase === 'flying') {
      const r = sim.failReason ?? 'fail';
      if (r === 'openEnd') return null;
      const L = S.length;
      const s0 = S.closed ? ((sim.cars[0].s % L) + L) % L : Math.max(0, Math.min(L, sim.cars[0].s));
      return { idx: Math.min(S.count - 1, Math.round(s0 / S.step)), reason: r };
    }
    return null;
  }

  private isAccepted(f: number): boolean {
    return this.accepted.some((a) => Math.abs(a.f - f) <= 20);
  }

  /** Linienpunkt, der einem Abtastpunkt der Bahn am nächsten liegt */
  private lineIndex(sampleIdx: number): number {
    const cached = this.lineIdx[sampleIdx];
    if (cached >= 0) return cached;
    const S = this.samples!;
    const q = { x: S.x[sampleIdx], y: S.y[sampleIdx], z: S.z[sampleIdx] * LANE_DEPTH };
    let best = 0;
    let bd = Infinity;
    const pts = this.plan.pts;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - q.x) ** 2 + (pts[i].y - q.y) ** 2 + (pts[i].z - q.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.lineIdx[sampleIdx] = best;
    return best;
  }

  private handle(prob: { idx: number; reason: string }): void {
    const f = this.lineIndex(prob.idx);
    const key = Math.round(f / 12);
    const k = (this.tries.get(key) ?? 0) + 1;
    this.tries.set(key, k);
    const lever = this.pickLever(prob.reason, k);
    if (!lever || this.steps >= this.maxSteps) {
      // liegt am Strich: hinnehmen. Bei Querkraft fährt die Probefahrt weiter, sonst endet sie hier.
      this.accepted.push({ s: this.samples!.s[prob.idx], reason: prob.reason, f });
      if (this.steps >= this.maxSteps || prob.reason !== 'derail') this.finish();
      return;
    }
    const p = this.plan;
    this.snapshot = { wH: Float64Array.from(p.wH), wMul: Float64Array.from(p.wMul), lower: Float64Array.from(p.lower), line: p.line.map((q) => ({ ...q })), key, skipTo: lever === 'soften' || lever === 'flatten' ? 3 : 6 };
    this.apply(lever, f);
    this.repaired++;
    this.steps++;
    this.dirty = true;
    this.stage = 'build';
  }

  private pickLever(reason: string, k: number): Lever | null {
    if (reason === 'stall') return k <= 4 ? 'pushBack' : null;
    if (reason === 'fall') return k <= 3 ? 'flatten' : k <= 6 ? 'relax' : null;
    if (reason === 'derail') return k <= 4 ? 'soften' : k <= 7 ? 'relax' : null;
    return null;
  }

  private apply(lever: Lever, f: number): void {
    const p = this.plan;
    const n = p.line.length;
    const range = (half: number, fn: (i: number) => void) => {
      for (let i = Math.max(1, f - half); i <= Math.min(n - 2, f + half); i++) fn(i);
    };
    if (lever === 'soften') {
      // Fliehkraft hier stärker gewichten und die Wunschhöhe lockern: die Tiefe darf die Kurve weiten
      range(25, (i) => {
        p.wMul[i] *= 8;
        p.wH[i] = Math.max(0.05, p.wH[i] * 0.3);
      });
    } else if (lever === 'flatten') {
      // kopfüber zu langsam: Höhe halten (Tiefe folgt der Bildhöhe), aus dem Looping wird eine flache Kurve
      range(30, (i) => {
        p.wH[i] = Math.min(400, p.wH[i] * 8);
        p.wMul[i] *= 0.2;
      });
    } else if (lever === 'pushBack') {
      // Zug bleibt hängen: die Kuppe davor nach hinten legen (= tiefer)
      let crest = f;
      for (let i = f; i < Math.min(n - 1, f + 50); i++) if (p.pts[i].y > p.pts[crest].y) crest = i;
      for (let i = Math.max(1, crest - 14); i <= Math.min(n - 2, crest + 14); i++) p.lower[i] = Math.max(p.lower[i], p.z[i] + 3);
    } else {
      p.line = relaxLine(p.line, p.drawn, f, 18, this.o.tolerance);
    }
  }

  private finish(): void {
    this.stage = 'done';
    this.best = this.plan.path;
    this.sim = null;
  }
}

/**
 * Linie an einer engen Stelle runder ziehen: geglättete Linie mit Kosinus-Fenster eingeblendet, als Ganzes so weit
 * skaliert, dass kein Punkt mehr als tol von der gezeichneten Linie abweicht (keine Dellen an den Fenstergrenzen).
 */
function relaxLine(line: StagePoint[], drawn: StagePoint[], f: number, half: number, tol: number): StagePoint[] {
  const n = line.length;
  const a = Math.max(1, f - half);
  const b = Math.min(n - 2, f + half);
  const upd: Array<{ i: number; dx: number; dy: number }> = [];
  for (let i = a; i <= b; i++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -9; k <= 9; k++) {
      const q = line[Math.max(0, Math.min(n - 1, i + k))];
      const w = Math.exp(-(k * k) / 18);
      sx += q.X * w;
      sy += q.Y * w;
      sw += w;
    }
    const w = 0.5 * (1 + Math.cos((Math.PI * (i - f)) / (half + 1)));
    upd.push({ i, dx: (sx / sw - line[i].X) * w, dy: (sy / sw - line[i].Y) * w });
  }
  const ok = (t: number) => upd.every((u) => Math.hypot(line[u.i].X + t * u.dx - drawn[u.i].X, line[u.i].Y + t * u.dy - drawn[u.i].Y) <= tol + 1e-9);
  let lo = 0;
  let hi = 1;
  if (ok(1)) lo = 1;
  else {
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2;
      if (ok(m)) lo = m;
      else hi = m;
    }
  }
  const out = line.map((p) => ({ ...p }));
  for (const u of upd) out[u.i] = { X: line[u.i].X + lo * u.dx, Y: line[u.i].Y + lo * u.dy };
  return out;
}
