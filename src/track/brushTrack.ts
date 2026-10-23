/**
 * Pinsel-Bahn („intelligente Bahn“): Die gemalte Linie ist die Bahn, so wie man sie in der festen Ansicht sieht.
 * Die Ansicht zeigt Tiefe nur als Versatz nach oben (Bildhöhe Y = Höhe + Tiefe · LANE_RISE / LANE_DEPTH, ohne
 * Verkleinerung nach hinten). Was das Bild nicht festlegt, wählt die Bahn selbst:
 *  - Tiefe je Stelle (planBrushTrack): Lange Wellen der Bildhöhe werden Tiefe, kurze werden Höhe über dem Boden
 *    (Wunschhöhe). Nie unter dem Boden, nie aus der Bühne, wo Stränge sich kreuzen oder nahekommen so weit getrennt,
 *    dass der Zug durchpasst (später Gezeichnetes liegt vorne), Fliehkräfte über die Tiefe weicher (je schneller der
 *    Zug dort, desto stärker).
 *  - Probefahrten (BrushRefiner): An der ersten Problemstelle bessert die Bahn nach (Fliehkraft weicher, Höhe halten
 *    statt kopfüber, Kuppe nach hinten, Linie innerhalb einer kleinen Toleranz runder). Was dann noch scheitert, liegt
 *    am Strich und bleibt so: Das ist das Spiel.
 */
import type { Vec3 } from '@/core/math3';
import { findCrossings } from './crossings';
import { createNode, emptyPath, sampleTrack, type TrackPath, type TrackSamples } from './model';
import { reduceNodes } from './reduceNodes';
import { previewNodes } from './strokeToTrack';
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
/**
 * Kreuzungsregel der Fahrt: Kommen sich zwei Bahnstellen in der Draufsicht näher als 1 m, muss eine 3,2 m über der
 * anderen liegen. Die Tiefe hält sie mit Spiel ein (Linienpunkte liegen 1 m auseinander, die Knoten weichen etwas
 * ab): seitlich mindestens PASS_SIDE auseinander oder in der Höhe mindestens PASS_OVER.
 */
const PASS_SIDE = 2.2;
const PASS_OVER = 3.5;
/** so viele Linienpunkte (je 1 m) auseinander sind zwei Stellen keine Nachbarn mehr (wie in der Fahrt) */
const NEIGHBOR = 8;
/** Paare, die auf beiden Strängen höchstens so weit (Linienpunkte) auseinanderliegen, bilden eine Engstelle */
const CLUSTER = 12;
/** zu nahe Paare in einer Engstelle, an der schon ein Paar festgehalten wird, kommen erst ab dieser Verletzung dazu */
const NEAR_TOL = 0.1;
/** höchstens so viele festgehaltene Paare je Engstelle */
const CLUSTER_MAX = 8;
/** bleibt ein festgehaltenes Paar um so viel (m) zu nah, kämpft es gegen andere Schranken: Engstelle aufgeben */
const GIVE_UP = 0.5;
/** Knoten-Toleranz (m) an Stellen, die einer anderen Stelle nahekommen (sonst bis 1,2 m auf Geraden) */
const TIGHT_TOL = 0.12;
/**
 * Einrastende Tiefen: Liegt die Bahn höchstens SNAP_RANGE vor oder hinter einer der fünf Bodenlinien (Spuren), zieht
 * sie dorthin (Gewicht bis SNAP_W, quadratisch nach innen), aber nur, wo flach und gerade gezeichnet ist (steil ist
 * Höhe, in Kringeln und Bögen entscheidet die Fahrt) und nicht an der Station. So liegt sie in der Draufsicht auf
 * Spuren; dazwischen wechselt sie weich. Das Bild ändert das nicht (Höhe und Tiefe zusammen bleiben die Linie).
 */
const SNAP_W = 2;
const SNAP_RANGE = 3;
/**
 * Elemente im Strich (findElements): Eine umlaufende Schleife, die mindestens LOOP_ASPECT mal so hoch wie breit ist
 * und nach oben geht, wird ein senkrechter Looping; flachere bleiben Bodenschleifen (die Tiefe darf sie in die Fläche
 * legen). Ein Hügel (mindestens HILL_RISE über beiden Füßen, ohne Umkehr in x, höchstens HILL_WIDE breit) bleibt
 * gerade. Beide werden zur Rampe: Die Wunschtiefe läuft gerade von der Tiefe am einen Fuß zu der am anderen (statt
 * mit der Bildhöhe nach hinten), die Tiefe ist steifer und die Fliehkraft biegt sie kaum. Der Lifthügel an der Station
 * und ein Anstieg am Ende der Linie bleiben ganz auf der Tiefe ihres ersten Fußes.
 */
const LOOP_ASPECT = 0.9;
const LOOP_TURN = (200 * Math.PI) / 180;
const HILL_RISE = 5;
const HILL_WIDE = 140;
/** Steifigkeit der Tiefe (Vielfaches der Glättung) in einem Looping und in einem Hügel */
const LOOP_FLAT = 30;
const HILL_FLAT = 6;
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
  /** Tiefe, die bleibt (NaN = frei): beim Fortsetzen die alte Bahn */
  fixed: Float64Array | null;
  /** Tiefe, an der die Bahn weich hängt (NaN = keine), und wie stark: die zuletzt gezeigte Live-Vorschau */
  hold: Float64Array | null;
  holdW: Float64Array | null;
  /** Steifigkeit der Tiefe je Linienpunkt (Vielfaches der Glättung): in Loopings und Hügeln höher */
  flat: Float64Array;
  /** Loopings und Hügel im Strich, und wo die Wunschtiefe deshalb gerade läuft */
  elements: BrushElements;
  ramps: Ramp[];
}

export interface BrushElements {
  /** Schleifen: Linienpunkte der Kreuzung (Einfahrt i, Ausfahrt j); senkrecht = Looping, sonst Bodenschleife */
  loops: Array<{ i: number; j: number; vertical: boolean }>;
  /** Hügel: Fuß links, Kuppe, Fuß rechts (Linienpunkte); open: Die Linie endet im Anstieg */
  hills: Array<{ a: number; top: number; b: number; open: boolean }>;
}

/** Bereich, in dem die Wunschtiefe gerade von der Tiefe bei a zu der bei b läuft (keep: bleibt auf der bei a) */
interface Ramp {
  a: number;
  b: number;
  keep: boolean;
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

/**
 * Loopings, Bodenschleifen und Hügel im Strich (Linie mit 1 m Abstand, Kreuzungen aus findLineCrossings). Eine Schleife
 * ist eine Kreuzung, zwischen deren Stellen die Linie einmal herum dreht (mindestens LOOP_TURN, 12 bis 160 m); hoch
 * und nach oben gezeichnet ist sie ein Looping. Ein Hügel ist eine Kuppe mindestens HILL_RISE über beiden Füßen, ohne Umkehr in x
 * und nicht in einem Looping; endet die Linie im Anstieg, zählt der Anstieg mit (die Vorschau sieht den Hügel so
 * schon, bevor er wieder herunterkommt).
 */
export function findElements(line: StagePoint[], crossings: LineCrossing[]): BrushElements {
  const n = line.length;
  const out: BrushElements = { loops: [], hills: [] };
  if (n < 4) return out;
  const head = (k: number) => Math.atan2(line[k + 1].Y - line[k].Y, line[k + 1].X - line[k].X);
  for (const c of crossings) {
    if (c.j - c.i < 12 || c.j - c.i > 160) continue;
    let turn = 0;
    for (let k = c.i; k < Math.min(c.j, n - 2); k++) {
      let d = head(k + 1) - head(k);
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      turn += d;
    }
    if (Math.abs(turn) < LOOP_TURN) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = c.i; k <= c.j; k++) {
      x0 = Math.min(x0, line[k].X);
      x1 = Math.max(x1, line[k].X);
      y0 = Math.min(y0, line[k].Y);
      y1 = Math.max(y1, line[k].Y);
    }
    const h = y1 - y0;
    const vertical = h >= LOOP_ASPECT * (x1 - x0) && y1 - line[c.i].Y > 0.6 * h;
    out.loops.push({ i: c.i, j: c.j, vertical });
  }
  const inLoop = (k: number) => out.loops.some((l) => l.vertical && k >= l.i - 4 && k <= l.j + 4);
  // Täler und Kuppen der Reihe nach (Zickzack mit 1 m Hysterese in der Bildhöhe)
  const Y = (k: number) => line[k].Y;
  const ext: Array<{ k: number; max: boolean }> = [];
  let mode = 0;
  let hi = 0;
  let lo = 0;
  for (let k = 1; k < n; k++) {
    if (mode >= 0 && Y(k) > Y(hi)) hi = k;
    if (mode <= 0 && Y(k) < Y(lo)) lo = k;
    if (mode === 0) {
      if (Y(hi) - Y(lo) > 1) {
        mode = lo < hi ? 1 : -1;
        ext.push(lo < hi ? { k: lo, max: false } : { k: hi, max: true });
      }
    } else if (mode === 1 && Y(hi) - Y(k) > 1) {
      ext.push({ k: hi, max: true });
      mode = -1;
      lo = k;
    } else if (mode === -1 && Y(k) - Y(lo) > 1) {
      ext.push({ k: lo, max: false });
      mode = 1;
      hi = k;
    }
  }
  // die Linie endet im Anstieg (oder oben): das Ende zählt als vorläufige Kuppe
  if (mode === 1) ext.push({ k: hi, max: true });
  else if (mode === -1) ext.push({ k: lo, max: false });
  for (let e = 0; e < ext.length; e++) {
    if (!ext[e].max) continue;
    const top = ext[e].k;
    const open = e === ext.length - 1;
    let a = e > 0 ? ext[e - 1].k : 0;
    let b = open ? n - 1 : ext[e + 1].k;
    if (Y(top) - Y(a) < HILL_RISE || (!open && Y(top) - Y(b) < HILL_RISE)) continue;
    // Füße: wo der Anstieg beginnt und der Abstieg endet (ein langes Tal davor gehört nicht dazu)
    const ya = Y(a);
    for (let k = top; k > a; k--) {
      if (Y(k) <= ya + 1) {
        a = Math.max(a, k - 5);
        break;
      }
    }
    if (!open) {
      const yb = Y(b);
      for (let k = top; k < b; k++) {
        if (Y(k) <= yb + 1) {
          b = Math.min(b, k + 5);
          break;
        }
      }
    }
    if (b - a > HILL_WIDE) continue;
    // ohne Umkehr in x (sonst Kehre oder Schleife), nicht im Looping
    const sx = Math.sign(line[Math.max(b, top)].X - line[a].X) || 1;
    let ok = true;
    for (let k = a; k < b && ok; k++) if ((line[k + 1].X - line[k].X) * sx < -0.2 || inLoop(k)) ok = false;
    if (ok) out.hills.push({ a, top, b, open });
  }
  return out;
}

/** Elemente in die Tiefenwahl übertragen: Fliehkraft-Gewicht und Steifigkeit je Punkt, Rampen der Wunschtiefe */
function applyElements(el: BrushElements, wMul: Float64Array, flat: Float64Array, calm: Float64Array): Ramp[] {
  const n = wMul.length;
  const ramps: Ramp[] = [];
  for (const h of el.hills) {
    for (let k = h.a; k <= h.b; k++) {
      wMul[k] *= 0.3;
      flat[k] = Math.max(flat[k], HILL_FLAT);
    }
    ramps.push({ a: h.a, b: h.b, keep: h.open || calm[h.a] > 0.5 });
  }
  for (const l of el.loops) {
    if (!l.vertical) continue;
    const a = Math.max(0, l.i - 4);
    const b = Math.min(n - 1, l.j + 4);
    for (let k = a; k <= b; k++) {
      wMul[k] = 0;
      flat[k] = Math.max(flat[k], LOOP_FLAT);
    }
    ramps.push({ a, b, keep: false });
  }
  return ramps;
}

// ------------------------------------------------------------------ Tiefe

/**
 * Symmetrische, positiv definite Bandmatrix mit Bandbreite 2, wie sie aus Wunschtiefe, Glättung zweiter Ordnung und
 * festgehaltenen Stellen entsteht (d0 Diagonale, d1 und d2 die Einträge (i, i+1) und (i, i+2)). Zerlegt als L·D·Lᵀ
 * und direkt gelöst: kein Iterieren, auch mit sehr steifen Schranken genau.
 */
class Band2 {
  readonly d0: Float64Array;
  readonly d1: Float64Array;
  readonly d2: Float64Array;
  private readonly D: Float64Array;
  private readonly a1: Float64Array;
  private readonly a2: Float64Array;

  constructor(readonly n: number) {
    this.d0 = new Float64Array(n);
    this.d1 = new Float64Array(n);
    this.d2 = new Float64Array(n);
    this.D = new Float64Array(n);
    this.a1 = new Float64Array(n);
    this.a2 = new Float64Array(n);
  }

  factor(): void {
    const { n, d0, d1, d2, D, a1, a2 } = this;
    for (let i = 0; i < n; i++) {
      let d = d0[i];
      if (i >= 1) d -= a1[i - 1] * a1[i - 1] * D[i - 1];
      if (i >= 2) d -= a2[i - 2] * a2[i - 2] * D[i - 2];
      D[i] = d;
      a1[i] = i + 1 < n ? (d1[i] - (i >= 1 ? a2[i - 1] * a1[i - 1] * D[i - 1] : 0)) / d : 0;
      a2[i] = i + 2 < n ? d2[i] / d : 0;
    }
  }

  /** x = B⁻¹·f (x darf f sein) */
  solve(f: Float64Array, x: Float64Array): void {
    const { n, D, a1, a2 } = this;
    for (let i = 0; i < n; i++) x[i] = f[i] - (i >= 1 ? a1[i - 1] * x[i - 1] : 0) - (i >= 2 ? a2[i - 2] * x[i - 2] : 0);
    for (let i = 0; i < n; i++) x[i] /= D[i];
    for (let i = n - 1; i >= 0; i--) x[i] -= (i + 1 < n ? a1[i] * x[i + 1] : 0) + (i + 2 < n ? a2[i] * x[i + 2] : 0);
  }
}

/** S·x = r für ein kleines dichtes symmetrisches System (Cholesky; etwas Regularisierung gegen abhängige Paare) */
function solveDense(S: Float64Array, k: number, r: Float64Array): Float64Array {
  let maxDiag = 0;
  for (let i = 0; i < k; i++) maxDiag = Math.max(maxDiag, S[i * k + i]);
  const eps = 1e-9 * maxDiag + 1e-300;
  const L = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = S[i * k + j];
      for (let m = 0; m < j; m++) s -= L[i * k + m] * L[j * k + m];
      if (i === j) L[i * k + i] = Math.sqrt(Math.max(s, 0) + eps);
      else L[i * k + j] = s / L[j * k + j];
    }
  }
  const x = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    let s = r[i];
    for (let m = 0; m < i; m++) s -= L[i * k + m] * x[m];
    x[i] = s / L[i * k + i];
  }
  for (let i = k - 1; i >= 0; i--) {
    let s = x[i];
    for (let m = i + 1; m < k; m++) s -= L[m * k + i] * x[m];
    x[i] = s / L[i * k + i];
  }
  return x;
}

/**
 * Zwei Linienpunkte, die sich auf dem Bild so nahe kommen, dass die Tiefe sie trennen muss: Für den Tiefenunterschied
 * dz = z_j − z_i ist das offene Intervall (lo, hi) verboten, dort lägen sie in der Draufsicht näher als PASS_SIDE und
 * in der Höhe näher als PASS_OVER beieinander.
 */
interface NearPair {
  i: number;
  j: number;
  lo: number;
  hi: number;
}

/** Paare von Stellen, die auf der Linie keine Nachbarn sind (bei einer Runde auch über die Station hinweg gezählt) */
function nearPairs(line: StagePoint[], closed: boolean, fixed: Float64Array | null = null): NearPair[] {
  // bei einer Runde ist der letzte Punkt die Station
  const m = closed ? line.length - 1 : line.length;
  const out: NearPair[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = i + NEIGHBOR; j < m; j++) {
      if (closed && m - (j - i) < NEIGHBOR) continue;
      // zwei feste Stellen kann die Tiefe nicht mehr trennen
      if (fixed && !Number.isNaN(fixed[i]) && !Number.isNaN(fixed[j])) continue;
      const dX = line[j].X - line[i].X;
      if (Math.abs(dX) >= PASS_SIDE) continue;
      const dY = line[j].Y - line[i].Y;
      // seitlich zu nah: |dz| < w; in der Höhe zu nah: |dY − c·dz| < PASS_OVER
      const w = Math.sqrt(PASS_SIDE * PASS_SIDE - dX * dX);
      const lo = Math.max(-w, (dY - PASS_OVER) / C);
      const hi = Math.min(w, (dY + PASS_OVER) / C);
      if (lo < hi) out.push({ i, j, lo, hi });
    }
  }
  return out;
}

/**
 * Tiefe je Linienpunkt: min Σ wH·(z − Ziel)² + Σ λ_i·(Δ²z)² + Σ wK·[(Y'' − c·z'')² + z''²]
 * mit Ziel = Tiefe, bei der die Bahn auf Wunschhöhe läge, λ für die Grenzwellenlänge, wK = Fliehkraft-Gewicht aus dem
 * geschätzten Tempo. Schranken, gesetzt sobald verletzt und losgelassen sobald sie nach außen ziehen: Boden, Bühne,
 * untere Schranke (Nachbessern) als steife Federn, der Mindestabstand an Engstellen als exakte Bedingung je Paar
 * (Kraft je Paar aus dem Gleichungssystem). Die Station (Anfang) steht auf dem Boden, bei geschlossener Runde auch das
 * Ende. Dazu je Linienpunkt die Knoten-Toleranz (eng, wo die Bahn einer anderen Stelle nahekommt).
 */
function solveDepth(line: StagePoint[], closed: boolean, crossings: LineCrossing[], wH: Float64Array, wMul: Float64Array, lower: Float64Array, calm: Float64Array, o: Opts, fixed: Float64Array | null = null, hold: Float64Array | null = null, holdW: Float64Array | null = null, flat: Float64Array | null = null, ramps: Ramp[] = []): { z: Float64Array; tol: Float64Array } {
  const n = line.length;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - H_COMFORT) / C));
  const target = new Float64Array(n);
  const upper = new Float64Array(n);
  const low = new Float64Array(n);
  const ypp = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) ypp[i] = line[i - 1].Y - 2 * line[i].Y + line[i + 1].Y;
  let solved = false;
  const bounds = () => {
    for (let i = 0; i < n; i++) {
      const g = o.ground(line[i].X, z[i] / LANE_DEPTH);
      target[i] = (line[i].Y - g - H_COMFORT) / C;
      // unter der vordersten Bodenlinie gezeichnet: ganz vorne bleiben (die Höhe wird dort angehoben)
      upper[i] = Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - g - o.clearance) / C));
      low[i] = Math.min(upper[i], Math.max(Z_MIN, lower[i]));
    }
    for (let i = 0; i < n; i++) if (calm[i] > 0) target[i] = calm[i] * upper[0] + (1 - calm[i]) * target[i];
    // Looping und Hügel: Wunschtiefe gerade von Fuß zu Fuß (Tiefe der letzten Lösung, vor der ersten die Wunschtiefe)
    for (const r of ramps) {
      const za = solved ? z[r.a] : target[r.a];
      const zb = r.keep ? za : solved ? z[r.b] : target[r.b];
      for (let i = r.a + 1; i < r.b; i++) target[i] = za + ((zb - za) * (i - r.a)) / (r.b - r.a);
      if (r.keep) target[r.b] = za;
    }
  };
  bounds();
  const pins = new Map<number, number>();
  // fest: die Station und was die Tiefe behalten soll (alte Bahn beim Fortsetzen, ruhiger Teil der Live-Vorschau)
  const isFixed = (i: number) => !!fixed && !Number.isNaN(fixed[i]);
  const station = (i: number) => i === 0 || (closed && i === n - 1) || isFixed(i);
  const fixedAt = (i: number) => (isFixed(i) ? fixed![i] : upper[0]);
  const pinStation = () => {
    pins.set(0, fixedAt(0));
    if (closed) pins.set(n - 1, fixedAt(0));
    if (fixed) for (let i = 0; i < n; i++) if (isFixed(i)) pins.set(i, fixed[i]);
  };
  pinStation();
  const wK = new Float64Array(n);
  // Spur-Magnete (ab dem zweiten Durchgang aus der vorigen Lösung), nur wo die Linie über ±3 m kaum dreht
  const magW = new Float64Array(n);
  const magZ = new Float64Array(n);
  const straight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 3)];
    const m = line[i];
    const c = line[Math.min(n - 1, i + 3)];
    const turn = Math.abs(Math.atan2((m.X - a.X) * (c.Y - m.Y) - (m.Y - a.Y) * (c.X - m.X), (m.X - a.X) * (c.X - m.X) + (m.Y - a.Y) * (c.Y - m.Y)));
    straight[i] = Math.max(0, 1 - turn / ((25 * Math.PI) / 180));
  }
  // Engstellen: je Paar die gewählte Seite (+1: j liegt hinten, dz ≥ hi; −1: j vorne, dz ≤ lo), ob es gerade auf dem
  // Rand des verbotenen Bereichs gehalten wird (seit welcher Runde, mit welcher Kraft) oder aufgegeben ist
  const near = nearPairs(line, closed, fixed);
  const side = new Int8Array(near.length);
  const held: number[] = [];
  const isHeld = new Uint8Array(near.length);
  const heldRound = new Int32Array(near.length);
  const given = new Uint8Array(near.length);
  let force: Float64Array = new Float64Array(0);
  let roundNo = 0;
  const edge = (p: number) => (side[p] > 0 ? near[p].hi : near[p].lo);
  const B = new Band2(n);
  // Schranken-Feder: deutlich steifer als der Rest des Systems (das Fliehkraft-Gewicht kann groß werden)
  let pinW = PIN_W;
  const solveOnce = () => {
    const { d0, d1, d2 } = B;
    d1.fill(0);
    d2.fill(0);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      d0[i] = wH[i] + magW[i];
      b[i] = wH[i] * target[i] + magW[i] * magZ[i];
      if (hold && holdW && !Number.isNaN(hold[i])) {
        d0[i] += holdW[i];
        b[i] += holdW[i] * hold[i];
      }
    }
    for (let i = 1; i < n - 1; i++) {
      const l = LAMBDA * (flat ? flat[i] : 1) + (1 + C * C) * wK[i];
      d0[i - 1] += l;
      d0[i] += 4 * l;
      d0[i + 1] += l;
      d1[i - 1] -= 2 * l;
      d1[i] -= 2 * l;
      d2[i - 1] += l;
      const q = C * wK[i] * ypp[i];
      b[i - 1] += q;
      b[i] -= 2 * q;
      b[i + 1] += q;
    }
    let maxD = 0;
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, d0[i]);
    pinW = Math.max(PIN_W, 1e3 * maxD);
    for (const [i, v] of pins) {
      d0[i] += pinW;
      b[i] += pinW * v;
    }
    B.factor();
    B.solve(b, z);
    solved = true;
    // gehaltene Paare exakt (z_j − z_i = Rand): z = z0 − Y·f mit Y = B⁻¹·U, (Uᵀ·Y)·f = Uᵀ·z0 − Rand
    const k = held.length;
    force = new Float64Array(k);
    if (!k) return;
    const Y: Float64Array[] = [];
    const u = new Float64Array(n);
    for (const p of held) {
      u[near[p].j] = 1;
      u[near[p].i] = -1;
      const y = new Float64Array(n);
      B.solve(u, y);
      u[near[p].j] = 0;
      u[near[p].i] = 0;
      Y.push(y);
    }
    const S = new Float64Array(k * k);
    const r = new Float64Array(k);
    for (let a = 0; a < k; a++) {
      const q = near[held[a]];
      r[a] = z[q.j] - z[q.i] - edge(held[a]);
      for (let c = 0; c <= a; c++) S[a * k + c] = S[c * k + a] = Y[c][q.j] - Y[c][q.i];
    }
    force = solveDense(S, k, r);
    for (let a = 0; a < k; a++) {
      const y = Y[a];
      const f = force[a];
      for (let i = 0; i < n; i++) z[i] -= f * y[i];
    }
  };
  const inCluster = (a: { i: number; j: number }, b: { i: number; j: number }) => Math.abs(a.i - b.i) <= CLUSTER && Math.abs(a.j - b.j) <= CLUSTER;
  // Seite eines Paars: wie die Engstelle, in der schon ein Paar gehalten wird; sonst wie zuletzt; an einer Kreuzung wie
  // dort gewählt; sonst die nähere. Geht sie wegen Boden, Bühne oder Station nicht, die andere.
  const sideOf = (p: number, dz: number): number => {
    const q = near[p];
    for (const h of held) if (inCluster(q, near[h])) return side[h];
    const lowAt = (i: number) => (station(i) ? fixedAt(i) : low[i]);
    const upAt = (i: number) => (station(i) ? fixedAt(i) : upper[i]);
    const fits = (s: number) => (s > 0 ? upAt(q.j) - lowAt(q.i) >= q.hi : lowAt(q.j) - upAt(q.i) <= q.lo);
    let s = side[p];
    if (!s) for (const c of crossings) if (c.laterFront !== undefined && inCluster(q, c)) s = c.laterFront ? -1 : 1;
    if (!s) s = dz >= (q.lo + q.hi) / 2 ? 1 : -1;
    return fits(s) || !fits(-s) ? s : -s;
  };
  const release = (a: number) => {
    isHeld[held[a]] = 0;
    held.splice(a, 1);
  };
  // gehaltene Paare, deren Kraft die Stränge zusammenzieht, loslassen (sie lägen von selbst weiter auseinander)
  const releasePulling = (): number => {
    let k = 0;
    for (let a = held.length - 1; a >= 0; a--) {
      if (side[held[a]] * force[a] > 1e-6 * pinW) {
        release(a);
        k++;
      }
    }
    return k;
  };
  // Widersprüche (Knäuel aus vielen Strängen, Station, Bühnenrand): Ein gehaltenes Paar drückt eine festgehaltene
  // Stelle weit über ihre Schranke. Diese Engstelle bleibt so, am Ende meldet sie sich als Kreuzung.
  const giveUp = (): number => {
    let k = 0;
    for (let a = held.length - 1; a >= 0; a--) {
      if (a >= held.length) continue;
      const q = near[held[a]];
      const over = (i: number) => {
        const v = pins.get(i);
        if (v === undefined) return 0;
        return station(i) ? Math.abs(z[i] - v) : v === upper[i] ? z[i] - v : v - z[i];
      };
      if (Math.max(over(q.i), over(q.j)) <= GIVE_UP) continue;
      for (let r = 0; r < near.length; r++) if (inCluster(near[r], q)) given[r] = 1;
      for (let m = held.length - 1; m >= 0; m--) {
        if (given[held[m]]) {
          release(m);
          k++;
        }
      }
    }
    return k;
  };
  // zu nahe Paare auf den Rand setzen. Je Runde und Engstelle kommt nur das am stärksten verletzte dazu, weitere erst,
  // wenn sie danach noch deutlich zu nah sind (die Tiefe ist glatt, meist trägt ein Paar die ganze Engstelle)
  const holdNew = (): number => {
    const cand: Array<{ p: number; v: number }> = [];
    for (let p = 0; p < near.length; p++) {
      if (isHeld[p] || given[p]) continue;
      const q = near[p];
      const dz = z[q.j] - z[q.i];
      if (dz <= q.lo + 1e-3 || dz >= q.hi - 1e-3) continue;
      cand.push({ p, v: sideOf(p, dz) > 0 ? q.hi - dz : dz - q.lo });
    }
    cand.sort((a, b) => b.v - a.v);
    let k = 0;
    for (const { p, v } of cand) {
      const q = near[p];
      let inIt = 0;
      let skip = false;
      for (const h of held) {
        if (!inCluster(q, near[h])) continue;
        inIt++;
        if (heldRound[h] === roundNo || v < NEAR_TOL || inIt >= CLUSTER_MAX) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      side[p] = sideOf(p, z[q.j] - z[q.i]);
      held.push(p);
      isHeld[p] = 1;
      heldRound[p] = roundNo;
      k++;
    }
    return k;
  };
  const settle = (withNear: boolean) => {
    for (let round = 0; round < 40; round++) {
      solveOnce();
      roundNo++;
      // Loslassen zuerst: Was nach außen zieht, verfälscht die Lösung, also danach keine Widersprüche suchen
      let released = withNear ? releasePulling() : 0;
      for (const [i, v] of pins) {
        if (station(i) || upper[i] - low[i] < 1e-6) continue;
        if (v === upper[i] ? z[i] < v - 1e-3 : z[i] > v + 1e-3) {
          pins.delete(i);
          released++;
        }
      }
      let changed = released;
      if (withNear && !released) changed += giveUp();
      for (let i = 0; i < n; i++) {
        if (pins.has(i)) continue;
        if (z[i] > upper[i] + 1e-3) {
          pins.set(i, upper[i]);
          changed++;
        } else if (z[i] < low[i] - 1e-3) {
          pins.set(i, low[i]);
          changed++;
        }
      }
      if (withNear) changed += holdNew();
      if (!changed) break;
    }
  };
  // erste Lösung ohne Engstellen und Fliehkraft: daraus die Reihenfolge an den Kreuzungen (später Gezeichnetes vorne,
  // außer der frühere Strang liegt schon ganz vorne)
  const order = crossings.filter((c) => c.laterFront === undefined);
  if (order.length) {
    settle(false);
    for (const c of order) c.laterFront = z[c.i] - PASS_SIDE >= Z_MIN + 0.5 || z[c.i] + PASS_SIDE > upper[c.j];
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
    if (outer > 0) {
      for (let i = 0; i < n; i++) {
        magW[i] = 0;
        if (station(i)) continue;
        // nächste Spur, die Boden und Bühne zulassen
        let k = Math.round(z[i] / LANE_DEPTH);
        if (k * LANE_DEPTH > upper[i]) k = Math.floor(upper[i] / LANE_DEPTH);
        if (k * LANE_DEPTH < low[i]) k = Math.ceil(low[i] / LANE_DEPTH);
        const zl = k * LANE_DEPTH;
        const d = Math.abs(z[i] - zl);
        if (zl > upper[i] + 1e-9 || zl < low[i] - 1e-9 || d >= SNAP_RANGE) continue;
        magW[i] = SNAP_W * (1 - d / SNAP_RANGE) ** 2 * Math.min(1, wH[i]) * (1 - calm[i]) * straight[i];
        magZ[i] = zl;
      }
    }
    pins.clear();
    pinStation();
    settle(true);
  }
  // Reste der Schranken-Federn abschneiden: nie unter den Boden, nie aus der Bühne (Festes bleibt genau)
  for (let i = 0; i < n; i++) z[i] = isFixed(i) ? fixed![i] : Math.min(upper[i], Math.max(low[i], z[i]));
  // Knoten-Toleranz: eng, wo zwei Stellen sich nahekommen (die Knoten dürfen den Abstand dort nicht auffressen)
  const tol = new Float64Array(n).fill(Infinity);
  for (const q of near) {
    const dz = z[q.j] - z[q.i];
    if (Math.hypot(line[q.j].X - line[q.i].X, dz) > PASS_SIDE + 0.6 && Math.abs(line[q.j].Y - line[q.i].Y - C * dz) > PASS_OVER + 0.6) continue;
    for (const c of [q.i, q.j]) for (let k = Math.max(0, c - 1); k <= Math.min(n - 1, c + 1); k++) tol[k] = TIGHT_TOL;
  }
  return { z, tol };
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
export function pathFromPoints(pts: Vec3[], closed: boolean, tolAt?: ArrayLike<number>): TrackPath {
  const segs = reduceNodes(pts, [], { tolAt, even: true }).segments;
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
  const { z, tol } = solveDepth(plan.line, plan.closed, plan.crossings, plan.wH, plan.wMul, plan.lower, plan.calm, o, plan.fixed, plan.hold, plan.holdW, plan.flat, plan.ramps);
  plan.z = z;
  plan.pts = worldPoints(plan.line, plan.z, plan.closed, o);
  plan.path = pathFromPoints(plan.pts, plan.closed, tol);
}

/**
 * Gewichte der Tiefenwahl je Linienpunkt. An der Station zieht die Tiefe zur Tiefe der Station statt zur Wunschhöhe:
 * Die Bahn bleibt dort am Boden und folgt der Bildhöhe, bis der Strich steigt (sonst entstünde direkt nach der Station
 * ein kleiner Buckel, an dem der Kettenzug schon endet). Steil gezeichnet ist Höhe: Dort zieht die Wunschhöhe kaum
 * (unter 15° voll, ab 40° fast nicht); ein steiler Strich wird so ein Anstieg, statt erst nach hinten zu wandern und
 * dann umso steiler zu steigen.
 */
function depthWeights(line: StagePoint[], closed: boolean): { calm: Float64Array; wH: Float64Array } {
  const n = line.length;
  const calm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const fromStation = Math.min(i, closed ? n - 1 - i : Infinity) * STEP;
    calm[i] = 1 - Math.min(1, Math.max(0, (fromStation - STATION_CALM) / STATION_RAMP));
  }
  const wH = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 2)];
    const b = line[Math.min(n - 1, i + 2)];
    const angle = Math.atan2(Math.abs(b.Y - a.Y), Math.abs(b.X - a.X) + 1e-9);
    wH[i] = Math.max(STEEP_WH, Math.min(1, (STEEP_TO - angle) / (STEEP_TO - STEEP_FROM)));
    // an der Station hält die Tiefe fest (die Glättung der Tiefe zöge sie sonst schon zum Rest der Bahn)
    wH[i] = Math.max(wH[i], CALM_WH * calm[i]);
  }
  return { calm, wH };
}

/** feste Tiefe je Linienpunkt aus einer Tiefe je Meter vom Anfang (die letzten zwei bleiben frei: weicher Anschluss) */
function keptDepth(n: number, keepDepth?: ArrayLike<number>): Float64Array | null {
  if (!keepDepth || keepDepth.length < 3) return null;
  const fixed = new Float64Array(n).fill(NaN);
  for (let i = 0; i < Math.min(n - 2, keepDepth.length - 2); i++) fixed[i] = keepDepth[i];
  return fixed;
}

/**
 * Aus der gemalten Pinsellinie die Bahn: Linie aufbereiten, Kreuzungen, Tiefe, Knoten. null bei zu kurzem Strich.
 * keepDepth: Tiefe je Meter vom Anfang an, die bleibt (Fortsetzen: Die alte Bahn ändert sich nicht). shownPreview:
 * die zuletzt gezeigte Live-Vorschau; die Bahn hängt weich an ihrer Tiefe und übernimmt die Reihenfolge an ihren
 * Kreuzungen, damit beim Loslassen nichts springt.
 */
export function planBrushTrack(points: StagePoint[], options: BrushOptions = {}, keepDepth?: ArrayLike<number>, shownPreview?: BrushPreview | null): BrushPlan | null {
  const shown = shownPreview?.z;
  const o = withDefaults(options);
  const prep = prepareBrushLine(points, o.closeSnap);
  if (!prep) return null;
  const n = prep.line.length;
  const { calm, wH } = depthWeights(prep.line, prep.closed);
  const crossings = findLineCrossings(prep.line, prep.closed);
  const elements = findElements(prep.line, crossings);
  const wMul = new Float64Array(n).fill(1);
  const flat = new Float64Array(n).fill(1);
  const ramps = applyElements(elements, wMul, flat, calm);
  let hold: Float64Array | null = null;
  let holdW: Float64Array | null = null;
  if (shown && shown.length > 3) {
    hold = new Float64Array(n).fill(NaN);
    holdW = new Float64Array(n);
    for (let i = 0; i < Math.min(n, shown.length - 3); i++) {
      hold[i] = shown[i];
      // vor dem Rundenschluss ausblenden: das Ende muss in die Station
      holdW[i] = PREVIEW_HOLD * (prep.closed ? Math.min(1, (n - 1 - i) / RING_FADE) : 1);
    }
  }
  const plan: BrushPlan = {
    drawn: prep.line.map((p) => ({ ...p })),
    line: prep.line,
    closed: prep.closed,
    crossings,
    z: new Float64Array(n),
    pts: [],
    path: emptyPath(),
    wH,
    calm,
    wMul,
    lower: new Float64Array(n).fill(-Infinity),
    fixed: keptDepth(n, keepDepth),
    hold,
    holdW,
    flat,
    elements,
    ramps,
  };
  keepOrder(plan.crossings, shownPreview?.crossings);
  replan(plan, o);
  return plan;
}

/**
 * Reihenfolge an einer Kreuzung tauschen (der vordere Strang geht nach hinten) und die Tiefe neu wählen. Die Tiefe der
 * Vorschau hält dann nicht mehr (sie hätte die alte Reihenfolge festgehalten). Danach am besten neu probefahren.
 */
export function swapCrossing(plan: BrushPlan, k: number, options: BrushOptions = {}): void {
  const c = plan.crossings[k];
  if (!c) return;
  c.laterFront = !c.laterFront;
  plan.hold = null;
  plan.holdW = null;
  replan(plan, withDefaults(options));
}

/** so viele Linienpunkte (je 1 m) am Ende bleiben in der Live-Vorschau frei; davor gilt die Tiefe der letzten Vorschau */
const PREVIEW_FREE = 45;
/**
 * Gewicht, mit dem die fertige Bahn an der Tiefe der zuletzt gezeigten Vorschau hängt (so springt beim Loslassen
 * nichts). Wo die Probefahrten nachbessern, lockert es sich; vor dem Rundenschluss blendet es über RING_FADE m aus.
 */
const PREVIEW_HOLD = 20;
const RING_FADE = 40;

export interface BrushPreview {
  path: TrackPath;
  /** Tiefe je Linienpunkt, für die nächste Vorschau */
  z: Float64Array;
  /** Kreuzungen mit der gewählten Reihenfolge (bleibt von Vorschau zu Vorschau und beim Loslassen gleich) */
  crossings: LineCrossing[];
}

/** Reihenfolge an Kreuzungen übernehmen, die es schon gab (Linienpunkte höchstens 3 auseinander) */
function keepOrder(crossings: LineCrossing[], from: LineCrossing[] | undefined): void {
  if (!from) return;
  for (const c of crossings) {
    const o = from.find((q) => q.laterFront !== undefined && Math.abs(q.i - c.i) <= 3 && Math.abs(q.j - c.j) <= 3);
    if (o) c.laterFront = o.laterFront;
  }
}

/**
 * Live-Vorschau beim Malen: dieselbe Tiefenwahl wie beim Loslassen, aber ruhig und schnell. Was mehr als PREVIEW_FREE
 * Meter vor dem Linienende liegt, behält die Tiefe der letzten Vorschau (dort bewegt sich nichts mehr), Engstellen
 * zählen nur, wo der freie Teil beteiligt ist, Knoten ohne Fit (alle 2,5 m), kein Rundenschluss (der kommt beim
 * Loslassen). keepDepth wie bei planBrushTrack.
 */
export function previewBrushTrack(points: StagePoint[], options: BrushOptions, prev: BrushPreview | null, keepDepth?: ArrayLike<number>): BrushPreview | null {
  const o = withDefaults(options);
  const prep = prepareBrushLine(points, -1);
  if (!prep) return null;
  const n = prep.line.length;
  const { calm, wH } = depthWeights(prep.line, false);
  const fixed = keptDepth(n, keepDepth) ?? new Float64Array(n).fill(NaN);
  if (prev) for (let i = 0; i < Math.min(n - PREVIEW_FREE, prev.z.length - 3); i++) if (Number.isNaN(fixed[i])) fixed[i] = prev.z[i];
  const crossings = findLineCrossings(prep.line, false);
  keepOrder(crossings, prev?.crossings);
  const wMul = new Float64Array(n).fill(1);
  const flat = new Float64Array(n).fill(1);
  const ramps = applyElements(findElements(prep.line, crossings), wMul, flat, calm);
  const { z } = solveDepth(prep.line, false, crossings, wH, wMul, new Float64Array(n).fill(-Infinity), calm, o, fixed, null, null, flat, ramps);
  const nodes = previewNodes(worldPoints(prep.line, z, false, o), []);
  if (nodes.length) nodes[0].kind = 'station';
  return { path: { ...emptyPath(), nodes, closed: false, brush: true }, z, crossings };
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

/** Bildschirmlinie einer vorhandenen Bahn (Bühne, 1 m Abstand) mit der Tiefe je Punkt (Meter), zum Fortsetzen */
export function trackLineWithDepth(samples: TrackSamples): { line: StagePoint[]; z: Float64Array } {
  const line: StagePoint[] = [];
  const zs: number[] = [];
  if (!samples.count) return { line, z: new Float64Array(0) };
  const at = (i: number) => ({ X: samples.x[i], Y: samples.y[i] + C * samples.z[i] * LANE_DEPTH });
  let prev = at(0);
  line.push(prev);
  zs.push(samples.z[0] * LANE_DEPTH);
  let carry = 0;
  for (let i = 1; i < samples.count; i++) {
    const cur = at(i);
    const d = Math.hypot(cur.X - prev.X, cur.Y - prev.Y);
    if (d < 1e-9) continue;
    let t = STEP - carry;
    while (t <= d) {
      const f = t / d;
      line.push({ X: prev.X + (cur.X - prev.X) * f, Y: prev.Y + (cur.Y - prev.Y) * f });
      zs.push((samples.z[i - 1] + (samples.z[i] - samples.z[i - 1]) * f) * LANE_DEPTH);
      t += STEP;
    }
    carry = d - (t - STEP);
    prev = cur;
  }
  return { line, z: Float64Array.from(zs) };
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
/** Probefahrt ohne Entgleis-Grenze (die Querkraft wird je Ort mitgeschrieben und hier bewertet) und ohne
 *  Kreuzungsprüfung (die macht der Nachbesserer am Ende selbst) */
export type ProbeFactory = (path: TrackPath, samples: TrackSamples) => ProbeSim;

export interface AcceptedSpot {
  /** Bogenlänge der Bahn */
  s: number;
  reason: string;
  /** Linienpunkt */
  f: number;
}

type Lever = 'soften' | 'flatten' | 'pushBack' | 'relax' | 'unramp';

/**
 * Nachbessern in Zeitscheiben: Tiefe lösen, Bahn bauen, Probefahrt; an der ersten Problemstelle einen Hebel
 * ansetzen und von vorn. Problemstellen: Querkraft über der Grenze, Fahrgäste fallen (kopfüber zu langsam),
 * Stillstand. Ein Hebel, der die Bahn auf langen Stücken verdreht (Wagen-Rahmen kippt) oder neue Kreuzungen auf
 * gleicher Höhe schafft, wird zurückgenommen.
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
  /** Kreuzungen auf gleicher Höhe der ersten Bahn: Ein Hebel, der neue schafft, wird zurückgenommen */
  private baseCrossings = -1;
  private tries = new Map<number, number>();
  private snapshot: { lever: Lever; wH: Float64Array; wMul: Float64Array; lower: Float64Array; holdW: Float64Array | null; flat: Float64Array; ramps: Ramp[]; line: StagePoint[]; key: number; skipTo: number } | null = null;
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
    const cross = findCrossings(samples).length;
    if (this.baseCrossings < 0) this.baseCrossings = cross;
    // Ein gerader Hügel, der wieder nach hinten darf, ist die Bahn ohne Hügel-Erkennung: Verdrehte Stellen, die dabei
    // auftauchen (Haken über Kopf), hätte sie auch so gehabt. Sie werden ab da der Maßstab.
    const freed = this.snapshot?.lever === 'unramp';
    // die Tiefenwahl kann bei sehr ungleichen Gewichten numerisch scheitern: dann wie ein verdrehender Hebel
    const broken = !this.plan.z.every(Number.isFinite);
    if (this.snapshot && ((inv > this.baseInverted + 0.05 && !freed) || cross > this.baseCrossings || broken)) {
      // der Hebel hat die Bahn verdreht oder Stränge aufeinandergeschoben: zurücknehmen, an dieser Stelle ist er
      // verbraucht
      const s = this.snapshot;
      this.plan.wH = s.wH;
      this.plan.wMul = s.wMul;
      this.plan.lower = s.lower;
      this.plan.holdW = s.holdW;
      this.plan.flat = s.flat;
      this.plan.ramps = s.ramps;
      this.plan.line = s.line;
      this.tries.set(s.key, Math.max(this.tries.get(s.key) ?? 0, s.skipTo));
      this.repaired--;
      this.snapshot = null;
      this.dirty = true;
      return;
    }
    if (freed) this.baseInverted = Math.max(this.baseInverted, inv);
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
    const lever = this.pickLever(prob.reason, k, f);
    if (!lever || this.steps >= this.maxSteps) {
      // liegt am Strich: hinnehmen. Bei Querkraft fährt die Probefahrt weiter, sonst endet sie hier.
      this.accepted.push({ s: this.samples!.s[prob.idx], reason: prob.reason, f });
      if (this.steps >= this.maxSteps || prob.reason !== 'derail') this.finish();
      return;
    }
    const p = this.plan;
    this.snapshot = { lever, wH: Float64Array.from(p.wH), wMul: Float64Array.from(p.wMul), lower: Float64Array.from(p.lower), holdW: p.holdW ? Float64Array.from(p.holdW) : null, flat: Float64Array.from(p.flat), ramps: p.ramps.slice(), line: p.line.map((q) => ({ ...q })), key, skipTo: lever === 'unramp' ? 1 : lever === 'soften' || lever === 'flatten' ? 3 : 6 };
    this.apply(lever, f);
    this.repaired++;
    this.steps++;
    this.dirty = true;
    this.stage = 'build';
  }

  /** gerader Hügel, den der Zug an Linienpunkt f hinauffährt (Index in plan.ramps, −1 = keiner) */
  private hillAt(f: number): number {
    const p = this.plan;
    return p.ramps.findIndex((r) => p.elements.hills.some((h) => h.a === r.a && h.b === r.b) && f >= r.a - 10 && f <= r.b);
  }

  private pickLever(reason: string, k: number, f = -1): Lever | null {
    // im Looping hilft kein Hebel, ohne ihn plattzudrücken: Er bleibt, wie gezeichnet (zu langsam ist Spiel)
    if (this.plan.elements.loops.some((l) => l.vertical && f >= l.i - 4 && f <= l.j + 4)) return null;
    // gerade nur, wenn es passt: Kommt der Zug nicht hinauf, darf der Hügel zuerst wieder nach hinten
    if (reason === 'stall') return k === 1 && this.hillAt(f) >= 0 ? 'unramp' : k <= 5 ? 'pushBack' : null;
    if (reason === 'fall') return k <= 3 ? 'flatten' : k <= 6 ? 'relax' : null;
    if (reason === 'derail') return k <= 4 ? 'soften' : k <= 7 ? 'relax' : null;
    return null;
  }

  private apply(lever: Lever, f: number): void {
    const p = this.plan;
    const n = p.line.length;
    const loops = p.elements.loops.filter((l) => l.vertical);
    const range = (half: number, fn: (i: number) => void) => {
      for (let i = Math.max(1, f - half); i <= Math.min(n - 2, f + half); i++) if (!loops.some((l) => i >= l.i - 4 && i <= l.j + 4)) fn(i);
    };
    // wo nachgebessert wird, hängt die Bahn nicht mehr an der Vorschau
    if (p.holdW) range(40, (i) => (p.holdW![i] = 0));
    if (lever === 'soften') {
      // Fliehkraft hier stärker gewichten und die Wunschhöhe lockern: die Tiefe darf die Kurve weiten
      range(25, (i) => {
        p.wMul[i] = Math.min(p.wMul[i] * 8, 1000);
        p.wH[i] = Math.max(0.05, p.wH[i] * 0.3);
      });
    } else if (lever === 'flatten') {
      // kopfüber zu langsam: Höhe halten (Tiefe folgt der Bildhöhe), aus dem Looping wird eine flache Kurve
      range(30, (i) => {
        p.wH[i] = Math.min(400, p.wH[i] * 8);
        p.wMul[i] *= 0.2;
      });
    } else if (lever === 'unramp') {
      const r = p.ramps[this.hillAt(f)];
      p.ramps = p.ramps.filter((q) => q !== r);
      for (let i = r.a; i <= r.b; i++) {
        p.wMul[i] /= 0.3;
        p.flat[i] = 1;
      }
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
    // Kreuzungen auf gleicher Höhe, die die Tiefe nicht trennen konnte (Knäuel aus vielen Strängen): Dort endet die
    // Fahrt. Die Probefahrten fahren durch, damit die Stellen dahinter auch nachgebessert werden.
    const S = this.samples;
    if (S) for (const c of findCrossings(S)) this.accepted.push({ s: c.s1, reason: 'crossing', f: this.lineIndex(Math.min(S.count - 1, Math.round(c.s1 / S.step))) });
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
