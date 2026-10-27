/**
 * Pfad-Werkzeuge des Zonen-Editors (Stufe 2, Plan 4.3 und 4.5): Direktauswahl (A), Zeichenstift (P), Formpinsel (B),
 * Messer (K) und Lasso (Q). Sie arbeiten auf dem Vektornetz einer Form (src/zone/faces.ts): Umriss, Löcher und
 * Teilungslinien.
 *
 * - Direktauswahl: Anker und Griffe ziehen, auch mehrere Anker zugleich (Umschalt nimmt einen dazu oder heraus, ein
 *   Rechteck aus dem Leeren oder das Lasso wählt viele); Doppeltippen auf eine Linie setzt einen Anker; Tippen in eine
 *   Fläche wählt sie (Farbe, Loch); an einem runden Anker bewegt sich der Griff gegenüber mit (mit Wahltaste nicht).
 * - Zeichenstift: Tippen gibt eine Ecke, Ziehen eine Kurve; Tippen auf den ersten Anker schließt, Ziehen dabei dreht
 *   seine Griffe; Tippen auf den letzten Anker oder Eingabe beendet. Wie in Illustrator mit Befehlstaste Anker und Griffe
 *   verschieben (Klick ins Leere beendet den Pfad), mit Wahltaste das Ankerpunkt-Werkzeug: Klick auf einen Anker wechselt
 *   Ecke und Rund, Ziehen aus einem Anker zieht neue Griffe heraus, Ziehen an einem Griff bewegt nur diesen. Ist eine Form
 *   gewählt und berührt der Pfad sie, wird er eine Teilungslinie oder ein Ring in ihr (seine Enden rasten an ihren Ankern
 *   und Kanten ein); sonst entsteht eine neue Form.
 * - Formpinsel: freihand, wird eine glatte Kurve mit wenigen Ankern; geschlossen (Ende nahe am Anfang) oder offen wie
 *   beim Zeichenstift.
 * - Messer: ein Strich quer durch eine Form der aktiven Ebene teilt sie (zwischen erster und letzter Kante).
 * - Lasso: freihand oder als Rechteck überall im Bild; wählt die Anker darin (in den gewählten Ebenen) und damit ihre
 *   Formen.
 */
import { faceAt, type Face } from '@/zone/faces';
import { fitCurve, flattenPath, inPolygon, insideWithHoles, type PathPoint, type Poly, type ZonePath } from '@/zone/path';
import {
  faceFill,
  findPlane,
  getPath,
  insertAnchor,
  planePathToShape,
  planesOf,
  removeAnchor,
  segmentPoint,
  setFaceFill,
  setPath,
  shapeFaces,
  shapeFromPlanePath,
  shapePaths,
  shapesOf,
  shapeToPlane,
  toggleSmooth,
  type PathRef,
  type ZoneNode,
  type ZonePlane,
  type ZoneShape,
} from '@/zone/nodes';
import type { OverlayState, Pt } from './overlay';

export type PathTool = 'direct' | 'pen' | 'brush' | 'knife' | 'lasso';
export type RegionForm = 'lasso' | 'rect';

/** gedrückte Tasten beim Zeigen: Befehl (Cmd, Strg), Wahl (Alt), Umschalt */
export interface Mods {
  cmd: boolean;
  alt: boolean;
  shift: boolean;
}
export const NO_MODS: Mods = { cmd: false, alt: false, shift: false };

export interface PathToolHost {
  nodes(): ZoneNode[];
  activePlane(): ZonePlane | undefined;
  /** gewählte Formen, die zuletzt gewählte am Ende */
  selectedShapes(): ZoneShape[];
  /** Auswahl der Formen ersetzen (leer: keine); die Ebene der letzten wird die aktive */
  setSelection(ids: string[]): void;
  /** Ebenen, in denen Rechteck und Lasso wählen: die in der Liste gewählten, sonst die aktive */
  regionPlanes(): ZonePlane[];
  planePoint(plane: ZonePlane, p: Pt): Pt | null;
  screenOf(plane: ZonePlane, q: Pt, shape?: ZoneShape): Pt | null;
  pick(p: Pt): { id: string; face: number } | null;
  /** Arbeitsschritt: beginnen, abschließen, verwerfen (stellt den Stand vom Beginn wieder her) */
  begin(): void;
  commit(): void;
  cancel(): void;
  /** Formen haben sich während eines Ziehens geändert: Welt und Griffe neu zeichnen */
  changed(): void;
  /** nur Griffe und Leisten neu zeichnen (Vorschau, Auswahl) */
  redraw(): void;
  toast(msg: string): void;
  /** aktive Ebene oder eine neue in Tiefe 0 (im laufenden Arbeitsschritt) */
  ensurePlane(): ZonePlane;
  addShape(s: ZoneShape): void;
  fillFor(plane: ZonePlane): string;
  /** Trefferradius in Bildpunkten */
  hitRadius(): number;
}

/** Leiste unten für die Pfad-Werkzeuge */
export type PathContext =
  | { kind: 'pen'; count: number; into: string | null }
  | { kind: 'anchor'; shape: ZoneShape; count: number; smooth: boolean; line: PathRef['kind'] }
  | { kind: 'face'; shape: ZoneShape; fill: string | null }
  | { kind: 'lasso'; form: RegionForm; count: number; smooth: boolean };

interface AnchorSel {
  shape: string;
  ref: PathRef;
  i: number;
}

/** Ende einer Teilungslinie, das auf einem anderen Pfad der Form liegt: Stück und Lage dort */
interface Glue {
  cut: number;
  end: 0 | 1;
  ref: PathRef;
  i: number;
  t: number;
}

type Drag =
  | { kind: 'anchors'; pointerId: number; start: Pt; sels: AnchorSel[]; orig: Map<string, ZonePath>; glue: Map<string, Glue[]> }
  | { kind: 'knob'; pointerId: number; sel: AnchorSel; side: 'in' | 'out'; orig: ZonePath; mirror: boolean; glue: Glue[] }
  | { kind: 'pull'; pointerId: number; sel: AnchorSel; start: Pt; orig: ZonePath; glue: Glue[]; moved: boolean }
  | { kind: 'penAnchor'; pointerId: number; i: number; start: Pt; orig: PathPoint }
  | { kind: 'penKnob'; pointerId: number; i: number; side: 'in' | 'out'; mirror: boolean; orig: PathPoint }
  | { kind: 'penPull'; pointerId: number; i: number; start: Pt; orig: PathPoint; moved: boolean };

interface Pen {
  plane: string;
  into: string | null;
  /** Anker in Ebenen-Koordinaten */
  pts: ZonePath;
  /** Anker, an dem gerade gezogen wird (Griffe), oder null */
  drag: number | null;
  /** beim Schließen mit Ziehen: der erste Anker, wie er vorher war */
  closing: PathPoint | null;
  pointerId: number;
  start: Pt;
}

interface Stroke {
  kind: 'brush' | 'knife';
  plane: string;
  into: string | null;
  pointerId: number;
  /** Punkte in Ebenen-Koordinaten und auf dem Bild */
  pts: Pt[];
  screen: Pt[];
}

/** Auswahlbereich auf dem Bild: Rechteck (Anfang, Ende) oder Lasso (Zug) */
interface Region {
  pointerId: number;
  form: RegionForm;
  pts: Pt[];
  add: boolean;
}

const DOUBLE_TAP = 380;
/** Formpinsel: Abweichung der Kurve vom Strich (Bildpunkte); Messer etwas genauer */
const BRUSH_TOL = 3;
const KNIFE_TOL = 1.5;
/** so weit (Bildpunkte) muss ein Zeiger wandern, bevor aus einem Tippen ein Ziehen wird */
const DRAG_DIST = 4;

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const roundPoint = (p: PathPoint): PathPoint => {
  const o: PathPoint = { x: round3(p.x), y: round3(p.y) };
  if (p.inX || p.inY) {
    o.inX = round3(p.inX ?? 0);
    o.inY = round3(p.inY ?? 0);
  }
  if (p.outX || p.outY) {
    o.outX = round3(p.outX ?? 0);
    o.outY = round3(p.outY ?? 0);
  }
  return o;
};
const copyPath = (path: ZonePath): ZonePath => path.map((x) => ({ ...x }));
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const hasHandles = (a: PathPoint): boolean => !!(a.inX || a.inY || a.outX || a.outY);

/** runder Anker: beide Griffe da, gegenüber und auf einer Linie */
function isSmooth(a: PathPoint): boolean {
  const ix = a.inX ?? 0;
  const iy = a.inY ?? 0;
  const ox = a.outX ?? 0;
  const oy = a.outY ?? 0;
  const li = Math.hypot(ix, iy);
  const lo = Math.hypot(ox, oy);
  return li > 1e-6 && lo > 1e-6 && Math.abs(ix * oy - iy * ox) < 1e-3 * li * lo && ix * ox + iy * oy < 0;
}

/** Griff side setzen; mirror: der andere bleibt auf einer Linie gegenüber, mit seiner Länge */
function setHandle(a: PathPoint, side: 'in' | 'out', vx: number, vy: number, mirror: boolean): PathPoint {
  const o: PathPoint = { ...a };
  if (side === 'out') {
    o.outX = vx;
    o.outY = vy;
  } else {
    o.inX = vx;
    o.inY = vy;
  }
  if (mirror) {
    const len = side === 'out' ? Math.hypot(a.inX ?? 0, a.inY ?? 0) : Math.hypot(a.outX ?? 0, a.outY ?? 0);
    const l = Math.hypot(vx, vy) || 1;
    if (side === 'out') {
      o.inX = (-vx / l) * len;
      o.inY = (-vy / l) * len;
    } else {
      o.outX = (-vx / l) * len;
      o.outY = (-vy / l) * len;
    }
  }
  return o;
}

const segDist = (p: Pt, a: Pt, b: Pt): { d: number; t: number } => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
};

/** Stellen, an denen der offene Zug a den Zug b kreuzt, als Lage auf a (Stück + Anteil) */
export function crossParams(a: Poly, b: Poly, closedB: boolean): number[] {
  const out: number[] = [];
  const m = closedB ? b.length : b.length - 1;
  for (let i = 0; i + 1 < a.length; i++) {
    const [p1x, p1y] = a[i];
    const [p2x, p2y] = a[i + 1];
    for (let j = 0; j < m; j++) {
      const [q1x, q1y] = b[j];
      const [q2x, q2y] = b[(j + 1) % b.length];
      const d = (p2x - p1x) * (q2y - q1y) - (p2y - p1y) * (q2x - q1x);
      if (d === 0) continue;
      const u = ((q1x - p1x) * (q2y - q1y) - (q1y - p1y) * (q2x - q1x)) / d;
      const v = ((q1x - p1x) * (p2y - p1y) - (q1y - p1y) * (p2x - p1x)) / d;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push(i + u);
    }
  }
  return out;
}

/** Stück eines offenen Zugs zwischen den Lagen a und b (Stück + Anteil) */
export function slicePoly(poly: Poly, a: number, b: number): Poly {
  const at = (s: number): [number, number] => {
    const i = Math.min(poly.length - 2, Math.floor(s));
    const t = s - i;
    return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * t, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * t];
  };
  const out: Poly = [at(a)];
  for (let i = Math.floor(a) + 1; i < b; i++) out.push(poly[i]);
  out.push(at(b));
  return out;
}

/** offener Polygonzug vereinfacht (Ramer-Douglas-Peucker), Endpunkte bleiben */
export function rdpOpen(poly: Poly, tol: number): Poly {
  if (poly.length <= 2) return poly.slice();
  const [ax, ay] = poly[0];
  const [bx, by] = poly[poly.length - 1];
  let far = -1;
  let farD = -1;
  for (let i = 1; i < poly.length - 1; i++) {
    const { d } = segDist({ x: poly[i][0], y: poly[i][1] }, { x: ax, y: ay }, { x: bx, y: by });
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  if (farD <= tol) return [poly[0], poly[poly.length - 1]];
  return [...rdpOpen(poly.slice(0, far + 1), tol).slice(0, -1), ...rdpOpen(poly.slice(far), tol)];
}

/** liegt ein Bildpunkt im Auswahlbereich? (Rechteck aus zwei Ecken oder Lasso als Zug) */
export function regionTest(form: RegionForm, pts: readonly Pt[]): (q: Pt) => boolean {
  if (form === 'rect') {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
  }
  const poly: Poly = pts.map((p) => [p.x, p.y]);
  return (q) => poly.length >= 3 && inPolygon(poly, q.x, q.y);
}

/** Umriss des Auswahlbereichs fürs Bild */
export function regionRing(form: RegionForm, pts: readonly Pt[]): Pt[] {
  if (form === 'lasso') return [...pts];
  const [a, b] = [pts[0], pts[pts.length - 1]];
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

/** Ausdehnung eines Bereichs in Bildpunkten (ein Tippen statt eines Ziehens?) */
function regionSize(pts: readonly Pt[]): number {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return Math.max(x1 - x0, y1 - y0);
}

const sameRef = (a: PathRef, b: PathRef): boolean => a.kind === b.kind && (a.kind === 'outline' || (a as { i: number }).i === (b as { i: number }).i);
const sameSel = (a: AnchorSel, b: AnchorSel): boolean => a.shape === b.shape && a.i === b.i && sameRef(a.ref, b.ref);
const refKey = (r: PathRef): string => (r.kind === 'outline' ? 'o' : `${r.kind === 'hole' ? 'h' : 'c'}${r.i}`);

/** nächster Punkt auf dem Stück nach Anker i (Abtasten, dann Dritteln) */
function nearestOnSegment(path: ZonePath, i: number, p: Pt): { t: number; d: number } {
  const dst = (t: number): number => {
    const q = segmentPoint(path, i, t);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  const N = 24;
  let bt = 0;
  let bd = Infinity;
  for (let k = 0; k <= N; k++) {
    const d = dst(k / N);
    if (d < bd) {
      bd = d;
      bt = k / N;
    }
  }
  let lo = Math.max(0, bt - 1 / N);
  let hi = Math.min(1, bt + 1 / N);
  for (let it = 0; it < 30; it++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dst(m1) < dst(m2)) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, d: dst(t) };
}

/** Linienenden gelten bis 3 cm (wie das Einrasten der Flächen) als angeklebt */
const GLUE_DIST = 0.03;

/** Enden offener Teilungslinien, die auf einem anderen Pfad der Form liegen (Pfad-Koordinaten) */
export function glueOf(shape: ZoneShape): Glue[] {
  const out: Glue[] = [];
  (shape.cuts ?? []).forEach((c, j) => {
    if (c.closed || c.path.length < 2) return;
    for (const end of [0, 1] as const) {
      const a = end === 0 ? c.path[0] : c.path[c.path.length - 1];
      let best: Glue | null = null;
      let bestD = GLUE_DIST;
      for (const { ref, path, closed } of shapePaths(shape)) {
        if (ref.kind === 'cut' && ref.i === j) continue;
        const m = closed ? path.length : path.length - 1;
        for (let i = 0; i < m; i++) {
          const { t, d } = nearestOnSegment(path, i, a);
          if (d < bestD) {
            bestD = d;
            best = { cut: j, end, ref, i, t };
          }
        }
      }
      if (best) out.push(best);
    }
  });
  return out;
}

/**
 * Nach dem Ändern des Pfads ref: angeklebte Linienenden wandern mit (an derselben Lage ihres Stücks), damit eine
 * Teilungslinie an ihrer Kante bleibt. skip: Enden, die selbst gezogen werden
 */
export function applyGlue(shape: ZoneShape, glue: readonly Glue[], ref: PathRef, skip: ReadonlyArray<{ cut: number; end: 0 | 1 }> = []): void {
  const src = getPath(shape, ref);
  if (!src) return;
  for (const g of glue) {
    if (!sameRef(g.ref, ref) || skip.some((s) => s.cut === g.cut && s.end === g.end)) continue;
    const cut = shape.cuts?.[g.cut];
    if (!cut || g.i >= (src.closed ? src.path.length : src.path.length - 1)) continue;
    const q = segmentPoint(src.path, g.i, g.t);
    const path = copyPath(cut.path);
    const k = g.end === 0 ? 0 : path.length - 1;
    path[k] = { ...path[k], x: round3(q.x), y: round3(q.y) };
    setPath(shape, { kind: 'cut', i: g.cut }, path);
  }
}

/** nach Änderungen, die die Stücke neu ordnen (Anker löschen, Ecke/Rund): Enden auf den nächsten Punkt des Pfads */
function reprojectGlue(shape: ZoneShape, glue: readonly Glue[], ref: PathRef): void {
  const src = getPath(shape, ref);
  if (!src) return;
  for (const g of glue) {
    if (!sameRef(g.ref, ref)) continue;
    const cut = shape.cuts?.[g.cut];
    if (!cut) continue;
    const k = g.end === 0 ? 0 : cut.path.length - 1;
    const a = cut.path[k];
    let best: Pt | null = null;
    let bestD = Infinity;
    const m = src.closed ? src.path.length : src.path.length - 1;
    for (let i = 0; i < m; i++) {
      const { t, d } = nearestOnSegment(src.path, i, a);
      if (d < bestD) {
        bestD = d;
        best = segmentPoint(src.path, i, t);
      }
    }
    if (!best) continue;
    const path = copyPath(cut.path);
    path[k] = { ...path[k], x: round3(best.x), y: round3(best.y) };
    setPath(shape, { kind: 'cut', i: g.cut }, path);
  }
}

/** Anker nach Form und Pfad gruppiert */
function byPath(sels: readonly AnchorSel[]): Map<string, { shape: string; ref: PathRef; idx: number[] }> {
  const out = new Map<string, { shape: string; ref: PathRef; idx: number[] }>();
  for (const s of sels) {
    const key = `${s.shape}|${refKey(s.ref)}`;
    const e = out.get(key) ?? { shape: s.shape, ref: s.ref, idx: [] };
    e.idx.push(s.i);
    out.set(key, e);
  }
  return out;
}

export class PathTools {
  tool: PathTool = 'direct';
  /** Form des Lassos (Q): freihand oder Rechteck */
  lassoForm: RegionForm = 'lasso';
  private pen: Pen | null = null;
  private stroke: Stroke | null = null;
  /** gewählte Anker, der zuletzt gewählte (mit sichtbaren Griffen) am Ende */
  private anchors: AnchorSel[] = [];
  private face: { shape: string; x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private region: Region | null = null;
  private hover: Pt | null = null;
  private mods: Mods = NO_MODS;
  private lastTap = { x: 0, y: 0, t: 0 };

  constructor(private readonly host: PathToolHost) {}

  /** Werkzeug wechseln (null: ein anderes Werkzeug des Editors): ein laufender Pfad wird beendet */
  setTool(t: PathTool | null): void {
    if (this.pen) this.finishPen(false);
    if (this.stroke || this.drag || this.region) this.cancelActive();
    if (t !== 'direct' && t !== 'lasso') {
      this.anchors = [];
      this.face = null;
    }
    if (t) this.tool = t;
  }

  setLassoForm(form: RegionForm): void {
    this.lassoForm = form;
    this.host.redraw();
  }

  /** gedrückte Tasten (der Zeichenstift zeigt mit Befehls- und Wahltaste die Anker der gewählten Formen) */
  setModifiers(m: Mods): void {
    const changed = m.cmd !== this.mods.cmd || m.alt !== this.mods.alt;
    this.mods = m;
    if (changed && this.tool === 'pen') this.host.redraw();
  }

  /** gewählt sind jetzt diese Formen: Anker und Fläche anderer Formen fallen weg */
  selectionChanged(ids: readonly string[]): void {
    const set = new Set(ids);
    this.anchors = this.anchors.filter((a) => {
      if (!set.has(a.shape)) return false;
      const o = this.shapeOf(a.shape);
      const g = o ? getPath(o.shape, a.ref) : null;
      return !!g && a.i < g.path.length;
    });
    if (this.face && !set.has(this.face.shape)) this.face = null;
  }

  get busy(): boolean {
    return !!(this.pen || this.stroke || this.drag || this.region);
  }

  // ------------------------------------------------------------------ Hilfen

  private shapeOf(id: string): { shape: ZoneShape; plane: ZonePlane } | null {
    const shape = this.host.nodes().find((n): n is ZoneShape => n.kind === 'shape' && n.id === id);
    const plane = shape ? findPlane(this.host.nodes(), shape.parent) : undefined;
    return shape && plane ? { shape, plane } : null;
  }

  /** gewählte Formen, die man bearbeiten darf (nicht gesperrt, nicht ausgeblendet) */
  private editable(): Array<{ shape: ZoneShape; plane: ZonePlane }> {
    const out: Array<{ shape: ZoneShape; plane: ZonePlane }> = [];
    for (const s of this.host.selectedShapes()) {
      const o = this.shapeOf(s.id);
      if (o && !o.shape.locked && !o.shape.hidden && !o.plane.locked) out.push(o);
    }
    return out;
  }

  /** Bildpunkt eines Pfad-Punkts der Form */
  private scr(shape: ZoneShape, plane: ZonePlane, x: number, y: number): Pt | null {
    return this.host.screenOf(plane, shapeToPlane(shape, x, y), shape);
  }

  /** Bildpunkt → Pfad-Koordinate der Form */
  private local(shape: ZoneShape, plane: ZonePlane, p: Pt): Pt | null {
    const q = this.host.planePoint(plane, p);
    return q ? { x: (q.x - shape.x) / shape.sx, y: (q.y - shape.y) / shape.sy } : null;
  }

  /** Ebenen-Meter je Bildpunkt an der Stelle p (für Toleranzen beim Einrasten und Vereinfachen) */
  private metersPerPx(plane: ZonePlane, p: Pt): number {
    const a = this.host.planePoint(plane, p);
    const b = this.host.planePoint(plane, { x: p.x + 10, y: p.y });
    return a && b ? Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y) / 10) : 0.1;
  }

  /** Zeichenstift: Punkt der Ebene unter p, eingerastet an Ankern (zuerst) und Kanten der Form, in die gezeichnet wird */
  private snapped(plane: ZonePlane, into: ZoneShape | null, p: Pt): Pt | null {
    const q = this.host.planePoint(plane, p);
    if (!q || !into) return q;
    const r = this.host.hitRadius();
    let best: Pt | null = null;
    let bestD = r * 1.2;
    for (const { path } of shapePaths(into)) {
      for (const a of path) {
        const s = this.scr(into, plane, a.x, a.y);
        const d = s ? dist(s, p) : Infinity;
        if (d < bestD) {
          bestD = d;
          best = shapeToPlane(into, a.x, a.y);
        }
      }
    }
    if (best) return best;
    const mpp = this.metersPerPx(plane, p);
    bestD = r;
    for (const { path, closed } of shapePaths(into)) {
      const poly = flattenPath(path, 0.2, closed).map(([x, y]) => shapeToPlane(into, x, y));
      const m = closed ? poly.length : poly.length - 1;
      for (let i = 0; i < m; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const { d, t } = segDist(q, a, b);
        if (d / mpp < bestD) {
          bestD = d / mpp;
          best = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
      }
    }
    return best ?? q;
  }

  /** berührt ein Pfad (Ebenen-Koordinaten) die Form: ein Punkt in ihr oder ein Schnitt mit ihrem Umriss? */
  private touches(shape: ZoneShape, pts: ZonePath, closed: boolean): boolean {
    const line = flattenPath(planePathToShape(shape, pts), 0.2, closed);
    const outline = flattenPath(shape.path, 0.2);
    if (line.some(([x, y]) => inPolygon(outline, x, y))) return true;
    return crossParams(closed ? [...line, line[0]] : line, outline, true).length > 0;
  }

  /** nächster Anker der gewählten Formen unter p */
  private anchorHit(p: Pt): AnchorSel | null {
    const r = this.host.hitRadius();
    let hit: AnchorSel | null = null;
    let hitD = r;
    for (const { shape, plane } of this.editable()) {
      for (const { ref, path } of shapePaths(shape)) {
        path.forEach((a, i) => {
          const s = this.scr(shape, plane, a.x, a.y);
          const d = s ? dist(s, p) : Infinity;
          if (d <= hitD) {
            hitD = d;
            hit = { shape: shape.id, ref, i };
          }
        });
      }
    }
    return hit;
  }

  /** Griff des Hauptankers (des zuletzt gewählten) unter p */
  private knobHit(p: Pt): { sel: AnchorSel; side: 'in' | 'out' } | null {
    const main = this.anchors.at(-1);
    const o = main ? this.editable().find((e) => e.shape.id === main.shape) : undefined;
    const g = main && o ? getPath(o.shape, main.ref) : null;
    const a = main && g ? g.path[main.i] : undefined;
    if (!main || !o || !a) return null;
    const r = this.host.hitRadius();
    for (const side of ['in', 'out'] as const) {
      const hx = side === 'in' ? a.inX : a.outX;
      const hy = side === 'in' ? a.inY : a.outY;
      if (!hx && !hy) continue;
      const s = this.scr(o.shape, o.plane, a.x + (hx ?? 0), a.y + (hy ?? 0));
      if (s && dist(s, p) <= r) return { sel: main, side };
    }
    return null;
  }

  /** Anker oder Griff des laufenden Pfads unter p (Griffe nur, wo sie zu sehen sind) */
  private penHit(p: Pt): { i: number; side: 'anchor' | 'in' | 'out' } | null {
    const pen = this.pen;
    const plane = pen ? findPlane(this.host.nodes(), pen.plane) : undefined;
    if (!pen || !plane) return null;
    const r = this.host.hitRadius();
    let best: { i: number; side: 'anchor' | 'in' | 'out' } | null = null;
    let bestD = r;
    pen.pts.forEach((a, i) => {
      const s = this.host.screenOf(plane, a);
      const d = s ? dist(s, p) : Infinity;
      if (d <= bestD) {
        bestD = d;
        best = { i, side: 'anchor' };
      }
      for (const side of ['in', 'out'] as const) {
        const hx = side === 'in' ? a.inX : a.outX;
        const hy = side === 'in' ? a.inY : a.outY;
        if (!hx && !hy) continue;
        const k = this.host.screenOf(plane, { x: a.x + (hx ?? 0), y: a.y + (hy ?? 0) });
        const dk = k ? dist(k, p) : Infinity;
        if (dk < bestD) {
          bestD = dk;
          best = { i, side };
        }
      }
    });
    return best;
  }

  // ------------------------------------------------------------------ Zeiger

  down(pointerId: number, p: Pt, mods: Mods = NO_MODS): void {
    this.mods = mods;
    if (this.tool === 'pen') {
      if (mods.cmd) return this.penCmdDown(pointerId, p, mods);
      if (mods.alt && this.convertDown(pointerId, p)) return;
      return this.penDown(pointerId, p);
    }
    if (this.tool === 'brush' || this.tool === 'knife') return this.strokeDown(pointerId, p);
    if (this.tool === 'lasso') return this.lassoDown(pointerId, p, mods);
    this.directDown(pointerId, p, mods);
  }

  move(pointerId: number, p: Pt, mods: Mods = NO_MODS): void {
    this.hover = p;
    this.mods = mods;
    const pen = this.pen;
    if (pen && pen.drag !== null && pen.pointerId === pointerId) return this.penDragMove(pen, p, mods);
    const st = this.stroke;
    if (st && st.pointerId === pointerId) {
      if (dist(p, st.screen[st.screen.length - 1]) < 2) return;
      const plane = findPlane(this.host.nodes(), st.plane);
      const q = plane ? this.host.planePoint(plane, p) : null;
      if (q) {
        st.pts.push(q);
        st.screen.push(p);
      }
      this.host.redraw();
      return;
    }
    const rg = this.region;
    if (rg && rg.pointerId === pointerId) {
      if (rg.form === 'rect') rg.pts[1] = p;
      else if (dist(rg.pts[rg.pts.length - 1], p) >= 3) rg.pts.push(p);
      this.host.redraw();
      return;
    }
    const d = this.drag;
    if (!d || d.pointerId !== pointerId) {
      if (this.pen) this.host.redraw();
      return;
    }
    if (d.kind === 'anchors') return this.moveAnchors(d, p);
    if (d.kind === 'penAnchor' || d.kind === 'penKnob' || d.kind === 'penPull') return this.penEditMove(d, p);
    const o = this.shapeOf(d.sel.shape);
    if (!o) return;
    const at = this.local(o.shape, o.plane, p);
    if (!at) return;
    const path = copyPath(d.orig);
    const a = path[d.sel.i];
    if (d.kind === 'knob') path[d.sel.i] = setHandle(a, d.side, at.x - a.x, at.y - a.y, d.mirror && !mods.alt);
    else if (dist(p, d.start) < DRAG_DIST && !d.moved) return;
    else {
      // Wahltaste: aus dem Anker neue, gleich lange Griffe ziehen
      d.moved = true;
      const vx = at.x - a.x;
      const vy = at.y - a.y;
      path[d.sel.i] = { x: a.x, y: a.y, inX: -vx, inY: -vy, outX: vx, outY: vy };
    }
    setPath(o.shape, d.sel.ref, path);
    applyGlue(o.shape, d.glue, d.sel.ref);
    this.host.changed();
  }

  /** mehrere Anker zugleich: jede Form rechnet den Weg des Zeigers in ihrer eigenen Ebene */
  private moveAnchors(d: Extract<Drag, { kind: 'anchors' }>, p: Pt): void {
    const groups = byPath(d.sels);
    const shapes = new Set(d.sels.map((s) => s.shape));
    for (const id of shapes) {
      const o = this.shapeOf(id);
      if (!o) continue;
      const a0 = this.local(o.shape, o.plane, d.start);
      const a1 = this.local(o.shape, o.plane, p);
      if (!a0 || !a1) continue;
      const dx = a1.x - a0.x;
      const dy = a1.y - a0.y;
      const refs: PathRef[] = [];
      for (const [key, g] of groups) {
        if (g.shape !== id) continue;
        const base = d.orig.get(key);
        if (!base) continue;
        const path = copyPath(base);
        for (const i of g.idx) {
          path[i].x = round3(base[i].x + dx);
          path[i].y = round3(base[i].y + dy);
        }
        setPath(o.shape, g.ref, path);
        refs.push(g.ref);
      }
      // Linienenden, die selbst mitgezogen werden, kleben nicht
      const skip: Array<{ cut: number; end: 0 | 1 }> = [];
      for (const s of d.sels) {
        if (s.shape !== id || s.ref.kind !== 'cut') continue;
        const n = d.orig.get(`${id}|${refKey(s.ref)}`)?.length ?? 0;
        if (s.i === 0) skip.push({ cut: s.ref.i, end: 0 });
        if (s.i === n - 1) skip.push({ cut: s.ref.i, end: 1 });
      }
      for (const ref of refs) applyGlue(o.shape, d.glue.get(id) ?? [], ref, skip);
    }
    this.host.changed();
  }

  /** Ziehen beim Setzen eines Ankers (Kurve) oder beim Schließen auf dem ersten Anker (dessen Griffe drehen) */
  private penDragMove(pen: Pen, p: Pt, mods: Mods): void {
    const plane = findPlane(this.host.nodes(), pen.plane);
    const q = plane ? this.host.planePoint(plane, p) : null;
    if (!q || pen.drag === null) return;
    const near = dist(p, pen.start) < DRAG_DIST;
    if (pen.closing) {
      const o = pen.closing;
      const dx = q.x - o.x;
      const dy = q.y - o.y;
      // mit Wahltaste nur der Griff zum Schluss hin, sonst beide gleich (der Startpunkt wird rund)
      pen.pts[0] = near ? { ...o } : mods.alt ? { ...o, inX: -dx, inY: -dy } : { x: o.x, y: o.y, inX: -dx, inY: -dy, outX: dx, outY: dy };
    } else {
      const a = pen.pts[pen.drag];
      const dx = q.x - a.x;
      const dy = q.y - a.y;
      // Ziehen gibt eine Kurve mit zwei gleichen Griffen; mit Wahltaste nur der Griff nach vorn (Ecke mit Kurve)
      pen.pts[pen.drag] = near ? { x: a.x, y: a.y } : mods.alt ? { x: a.x, y: a.y, inX: a.inX, inY: a.inY, outX: dx, outY: dy } : { x: a.x, y: a.y, inX: -dx, inY: -dy, outX: dx, outY: dy };
    }
    this.host.redraw();
  }

  /** Befehls- und Wahltaste am laufenden Pfad: Anker verschieben, Griff ziehen, neue Griffe herausziehen */
  private penEditMove(d: Extract<Drag, { kind: 'penAnchor' | 'penKnob' | 'penPull' }>, p: Pt): void {
    const pen = this.pen;
    const plane = pen ? findPlane(this.host.nodes(), pen.plane) : undefined;
    const q = plane ? this.host.planePoint(plane, p) : null;
    if (!pen || !q || !pen.pts[d.i]) return;
    if (d.kind === 'penAnchor') pen.pts[d.i] = { ...d.orig, x: d.orig.x + (q.x - d.start.x), y: d.orig.y + (q.y - d.start.y) };
    else if (d.kind === 'penKnob') pen.pts[d.i] = setHandle(pen.pts[d.i], d.side, q.x - d.orig.x, q.y - d.orig.y, d.mirror && !this.mods.alt);
    else {
      if (!d.moved && dist(p, d.start) < DRAG_DIST) return;
      d.moved = true;
      const vx = q.x - d.orig.x;
      const vy = q.y - d.orig.y;
      // am letzten Anker nur der Griff nach vorn (wie in Illustrator), sonst beide
      const last = d.i === pen.pts.length - 1;
      pen.pts[d.i] = last ? { ...d.orig, outX: vx, outY: vy } : { x: d.orig.x, y: d.orig.y, inX: -vx, inY: -vy, outX: vx, outY: vy };
    }
    this.host.redraw();
  }

  up(pointerId: number): void {
    const pen = this.pen;
    if (pen && pen.drag !== null && pen.pointerId === pointerId) {
      if (pen.closing) {
        pen.closing = null;
        pen.drag = null;
        this.finishPen(true);
        return;
      }
      pen.drag = null;
      this.host.redraw();
      return;
    }
    if (this.stroke && this.stroke.pointerId === pointerId) {
      this.strokeUp();
      return;
    }
    if (this.region && this.region.pointerId === pointerId) {
      this.finishRegion();
      return;
    }
    const d = this.drag;
    if (!d || d.pointerId !== pointerId) return;
    this.drag = null;
    if (d.kind === 'penAnchor' || d.kind === 'penKnob') {
      this.host.redraw();
      return;
    }
    if (d.kind === 'penPull') {
      // Wahltaste und nur getippt: am letzten Anker den Griff nach vorn weg, sonst Ecke und Rund wechseln
      if (!d.moved && pen) pen.pts = d.i === pen.pts.length - 1 ? pen.pts.map((a, i) => (i === d.i ? { x: a.x, y: a.y, inX: a.inX, inY: a.inY } : a)) : toggleSmooth(pen.pts, false, d.i);
      this.host.redraw();
      return;
    }
    if (d.kind === 'pull' && !d.moved) {
      const o = this.shapeOf(d.sel.shape);
      const g = o ? getPath(o.shape, d.sel.ref) : null;
      if (o && g) {
        setPath(o.shape, d.sel.ref, toggleSmooth(d.orig, g.closed, d.sel.i));
        reprojectGlue(o.shape, d.glue, d.sel.ref);
      }
    }
    if (d.kind === 'anchors' && d.sels.length === 1) this.snapEnd(d.sels[0]);
    this.host.commit();
  }

  /** gezogener Anker als Ende einer offenen Teilungslinie (das klebt nicht, es wird gezogen) */
  private draggedEnd(sel: AnchorSel, n: number): { cut: number; end: 0 | 1 } | undefined {
    if (sel.ref.kind !== 'cut') return undefined;
    if (sel.i === 0) return { cut: sel.ref.i, end: 0 };
    if (sel.i === n - 1) return { cut: sel.ref.i, end: 1 };
    return undefined;
  }

  /** losgelassenes Ende einer Teilungslinie rastet an Ankern und Kanten der Form ein (wie beim Zeichenstift) */
  private snapEnd(sel: AnchorSel): void {
    const o = this.shapeOf(sel.shape);
    const g = o ? getPath(o.shape, sel.ref) : null;
    if (!o || !g || g.closed || sel.ref.kind !== 'cut' || !this.draggedEnd(sel, g.path.length)) return;
    const a = g.path[sel.i];
    const p = this.scr(o.shape, o.plane, a.x, a.y);
    if (!p) return;
    // die Linie selbst zählt nicht: kurz ohne sie einrasten
    const cuts = o.shape.cuts ?? [];
    const self = cuts[sel.ref.i];
    const rest = cuts.filter((_, k) => k !== (sel.ref as { i: number }).i);
    const probe: ZoneShape = { ...o.shape, cuts: rest.length ? rest : undefined };
    const q = this.snapped(o.plane, probe, p);
    if (!q || !self) return;
    const local = { x: round3((q.x - o.shape.x) / o.shape.sx), y: round3((q.y - o.shape.y) / o.shape.sy) };
    if (Math.abs(local.x - a.x) < 1e-6 && Math.abs(local.y - a.y) < 1e-6) return;
    const path = copyPath(g.path);
    path[sel.i] = { ...path[sel.i], x: local.x, y: local.y };
    setPath(o.shape, sel.ref, path);
  }

  /** Zeiger ohne Druck (Maus, schwebender Pencil): Gummiband des Zeichenstifts */
  hoverAt(p: Pt | null): void {
    this.hover = p;
    if (this.pen) this.host.redraw();
  }

  /**
   * Was der laufende Zeiger begonnen hat, verwerfen (ein zweiter Finger kam dazu, das System hat abgebrochen): der eben
   * gesetzte Anker des Zeichenstifts, das Schließen, ein Pinsel- oder Messerstrich, ein Auswahlbereich, ein Ziehen
   */
  cancelActive(): void {
    const pen = this.pen;
    if (pen && pen.drag !== null) {
      if (pen.closing) {
        pen.pts[0] = pen.closing;
        pen.closing = null;
        pen.drag = null;
        this.host.redraw();
        return;
      }
      pen.pts.splice(pen.drag, 1);
      pen.drag = null;
      if (!pen.pts.length) this.cancelPen();
      else this.host.redraw();
      return;
    }
    if (this.region) {
      this.region = null;
      this.host.redraw();
      return;
    }
    const d = this.drag;
    if (d && (d.kind === 'penAnchor' || d.kind === 'penKnob' || d.kind === 'penPull')) {
      if (pen && pen.pts[d.i]) pen.pts[d.i] = d.orig;
      this.drag = null;
      this.host.redraw();
      return;
    }
    if (this.stroke || this.drag) {
      this.stroke = null;
      this.drag = null;
      this.host.cancel();
      this.host.redraw();
    }
  }

  // ------------------------------------------------------------------ Direktauswahl und Bereiche

  private directDown(pointerId: number, p: Pt, mods: Mods): void {
    // 1. Griffe des Hauptankers
    const k = this.knobHit(p);
    if (k) {
      const o = this.shapeOf(k.sel.shape);
      const g = o ? getPath(o.shape, k.sel.ref) : null;
      if (!o || !g) return;
      this.host.begin();
      this.drag = { kind: 'knob', pointerId, sel: k.sel, side: k.side, orig: copyPath(g.path), mirror: isSmooth(g.path[k.sel.i]) && !mods.alt, glue: glueOf(o.shape) };
      return;
    }
    // 2. Anker der gewählten Formen: Umschalt nimmt dazu oder heraus, sonst ziehen (gewählte ziehen alle mit)
    const hit = this.anchorHit(p);
    if (hit) {
      this.face = null;
      const at = this.anchors.findIndex((a) => sameSel(a, hit));
      if (mods.shift) {
        if (at >= 0) this.anchors.splice(at, 1);
        else this.anchors.push(hit);
        this.host.redraw();
        return;
      }
      if (at < 0) this.anchors = [hit];
      else this.anchors.push(...this.anchors.splice(at, 1));
      this.startAnchorsDrag(pointerId, p);
      this.host.redraw();
      return;
    }
    const shapes = this.editable();
    // 3. Linien der gewählten Formen: Doppeltippen setzt einen Anker
    const seg = this.segmentAt(shapes, p);
    if (seg) {
      const now = performance.now();
      const twice = now - this.lastTap.t < DOUBLE_TAP && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 20;
      this.lastTap = { x: p.x, y: p.y, t: twice ? 0 : now };
      if (twice) {
        this.host.begin();
        setPath(seg.shape, seg.ref, insertAnchor(seg.path, seg.i, seg.t));
        this.anchors = [{ shape: seg.shape.id, ref: seg.ref, i: seg.i + 1 }];
        this.face = null;
        this.host.commit();
        return;
      }
    }
    // 4. Fläche einer gewählten Form (auch ein Loch), die zuletzt gewählte zuerst
    for (const { shape, plane } of [...shapes].reverse()) {
      const at = this.local(shape, plane, p);
      if (!at || faceAt(shapeFaces(shape), at.x, at.y) < 0) continue;
      this.face = { shape: shape.id, x: at.x, y: at.y };
      this.anchors = [];
      const ids = this.host.selectedShapes().map((s) => s.id);
      if (ids.at(-1) !== shape.id) this.host.setSelection([...ids.filter((x) => x !== shape.id), shape.id]);
      this.host.redraw();
      return;
    }
    // einmal auf eine Linie getippt: die Auswahl bleibt (das zweite Tippen setzt dort einen Anker)
    if (seg) {
      this.anchors = [];
      this.face = null;
      this.host.redraw();
      return;
    }
    // 5. eine andere Form: wählen (Umschalt: dazu), mit der Fläche unter dem Zeiger
    const pick = this.host.pick(p);
    if (pick) {
      const ids = this.host.selectedShapes().map((s) => s.id);
      this.host.setSelection(mods.shift ? [...ids.filter((x) => x !== pick.id), pick.id] : [pick.id]);
      const o2 = this.shapeOf(pick.id);
      const at = o2 ? this.local(o2.shape, o2.plane, p) : null;
      if (!mods.shift) this.anchors = [];
      this.face = at ? { shape: pick.id, x: at.x, y: at.y } : null;
      this.host.redraw();
      return;
    }
    // 6. ins Leere: ein Rechteck wählt Anker, ein Tippen hebt die Auswahl auf
    this.region = { pointerId, form: 'rect', pts: [p, p], add: mods.shift };
    this.host.redraw();
  }

  /** Lasso (Q): ein Bereich überall im Bild; auf gewählten Ankern zieht es sie (wie die Direktauswahl) */
  private lassoDown(pointerId: number, p: Pt, mods: Mods): void {
    const hit = !mods.shift ? this.anchorHit(p) : null;
    if (hit && this.anchors.some((a) => sameSel(a, hit))) {
      this.anchors.push(...this.anchors.splice(this.anchors.findIndex((a) => sameSel(a, hit)), 1));
      this.startAnchorsDrag(pointerId, p);
      this.host.redraw();
      return;
    }
    this.region = { pointerId, form: this.lassoForm, pts: this.lassoForm === 'rect' ? [p, p] : [p], add: mods.shift };
    this.host.redraw();
  }

  private startAnchorsDrag(pointerId: number, p: Pt): void {
    const orig = new Map<string, ZonePath>();
    const glue = new Map<string, Glue[]>();
    for (const a of this.anchors) {
      const o = this.shapeOf(a.shape);
      if (!o) continue;
      const key = `${a.shape}|${refKey(a.ref)}`;
      const g = getPath(o.shape, a.ref);
      if (g && !orig.has(key)) orig.set(key, copyPath(g.path));
      if (!glue.has(a.shape)) glue.set(a.shape, glueOf(o.shape));
    }
    this.host.begin();
    this.drag = { kind: 'anchors', pointerId, start: p, sels: [...this.anchors], orig, glue };
  }

  /** Bereich fertig: Anker darin (in den gewählten Ebenen) wählen, ihre Formen mit; ein Tippen hebt die Auswahl auf */
  private finishRegion(): void {
    const rg = this.region!;
    this.region = null;
    const clear = () => {
      if (rg.add) return;
      this.anchors = [];
      this.face = null;
      this.host.setSelection([]);
    };
    if (regionSize(rg.pts) < 6) {
      clear();
      this.host.redraw();
      return;
    }
    const inside = regionTest(rg.form, rg.pts);
    const collect = (planes: readonly ZonePlane[]): AnchorSel[] => {
      const found: AnchorSel[] = [];
      for (const plane of planes) {
        if (plane.hidden || plane.locked) continue;
        for (const s of shapesOf(this.host.nodes(), plane.id)) {
          if (s.hidden || s.locked) continue;
          for (const { ref, path } of shapePaths(s)) {
            path.forEach((a, i) => {
              const q = this.scr(s, plane, a.x, a.y);
              if (q && inside(q)) found.push({ shape: s.id, ref, i });
            });
          }
        }
      }
      return found;
    };
    const planes = this.host.regionPlanes();
    const found = collect(planes);
    if (!found.length) {
      const elsewhere = collect(planesOf(this.host.nodes()).filter((pl) => !planes.includes(pl))).length;
      clear();
      if (elsewhere) this.host.toast(`Keine Punkte in der gewählten Ebene, ${elsewhere} in anderen: in der Liste dazuwählen (Umschalt oder nach rechts wischen)`);
      this.host.redraw();
      return;
    }
    this.anchors = rg.add ? [...this.anchors.filter((a) => !found.some((f) => sameSel(a, f))), ...found] : found;
    this.face = null;
    // Formen in der Reihenfolge ihres letzten Ankers: die des Hauptankers zuletzt
    const ids = [...new Set(this.anchors.map((a) => a.shape).reverse())].reverse();
    const keep = rg.add ? this.host.selectedShapes().map((s) => s.id).filter((id) => !ids.includes(id)) : [];
    this.host.setSelection([...keep, ...ids]);
    this.host.redraw();
  }

  /** Linie einer der Formen unter p (Bildpunkte), mit Stück und Lage auf ihm */
  private segmentAt(shapes: ReadonlyArray<{ shape: ZoneShape; plane: ZonePlane }>, p: Pt): { shape: ZoneShape; ref: PathRef; path: ZonePath; i: number; t: number } | null {
    let best: { shape: ZoneShape; ref: PathRef; path: ZonePath; i: number; t: number } | null = null;
    let bestD = this.host.hitRadius();
    for (const { shape, plane } of shapes) {
      for (const { ref, path, closed } of shapePaths(shape)) {
        const m = closed ? path.length : path.length - 1;
        for (let i = 0; i < m; i++) {
          let prev: Pt | null = null;
          for (let k = 0; k <= 16; k++) {
            const q = segmentPoint(path, i, k / 16);
            const s = this.scr(shape, plane, q.x, q.y);
            if (s && prev) {
              const { d, t } = segDist(p, prev, s);
              if (d < bestD) {
                bestD = d;
                best = { shape, ref, path, i, t: (k - 1 + t) / 16 };
              }
            }
            prev = s;
          }
        }
      }
    }
    return best;
  }

  /** gewählte Fläche (nach Änderungen an ihrem Punkt neu gesucht) */
  private currentFace(): { shape: ZoneShape; face: Face } | null {
    if (!this.face) return null;
    const o = this.shapeOf(this.face.shape);
    if (!o) return null;
    const faces = shapeFaces(o.shape);
    const i = faceAt(faces, this.face.x, this.face.y);
    return i >= 0 ? { shape: o.shape, face: faces[i] } : null;
  }

  // ------------------------------------------------------------------ Zeichenstift

  private penDown(pointerId: number, p: Pt): void {
    const r = this.host.hitRadius();
    if (!this.pen) {
      const sel = this.host.selectedShapes().at(-1);
      const selPlane = sel ? findPlane(this.host.nodes(), sel.parent) : undefined;
      this.host.begin();
      const plane = sel && selPlane && !selPlane.locked && !sel.locked ? selPlane : this.host.ensurePlane();
      if (plane.locked) {
        this.host.cancel();
        this.host.toast('Die aktive Ebene ist gesperrt');
        return;
      }
      this.pen = { plane: plane.id, into: sel && selPlane === plane ? sel.id : null, pts: [], drag: null, closing: null, pointerId, start: p };
    }
    const pen = this.pen;
    const plane = findPlane(this.host.nodes(), pen.plane);
    if (!plane) return;
    // auf den ersten Anker: schließen (Ziehen dreht dabei seine Griffe); auf den letzten: beenden
    const first = pen.pts[0] ? this.host.screenOf(plane, pen.pts[0]) : null;
    const last = pen.pts.length ? this.host.screenOf(plane, pen.pts[pen.pts.length - 1]) : null;
    if (pen.pts.length >= 3 && first && dist(first, p) <= r) {
      pen.closing = { ...pen.pts[0] };
      pen.drag = 0;
      pen.pointerId = pointerId;
      pen.start = p;
      this.host.redraw();
      return;
    }
    if (pen.pts.length >= 2 && last && dist(last, p) <= r) {
      this.finishPen(false);
      return;
    }
    const into = pen.into ? (this.shapeOf(pen.into)?.shape ?? null) : null;
    const q = this.snapped(plane, into, p);
    if (!q) return;
    pen.pts.push({ x: q.x, y: q.y });
    pen.drag = pen.pts.length - 1;
    pen.pointerId = pointerId;
    pen.start = p;
    this.host.redraw();
  }

  /** Befehlstaste beim Zeichenstift: Anker und Griffe verschieben wie mit der Direktauswahl; Klick ins Leere beendet */
  private penCmdDown(pointerId: number, p: Pt, mods: Mods): void {
    const pen = this.pen;
    if (pen) {
      const h = this.penHit(p);
      if (h) {
        const plane = findPlane(this.host.nodes(), pen.plane);
        const q = plane ? this.host.planePoint(plane, p) : null;
        const a = pen.pts[h.i];
        if (h.side === 'anchor' && q) this.drag = { kind: 'penAnchor', pointerId, i: h.i, start: q, orig: { ...a } };
        else if (h.side !== 'anchor') this.drag = { kind: 'penKnob', pointerId, i: h.i, side: h.side, mirror: isSmooth(a) && !mods.alt, orig: { ...a } };
        this.host.redraw();
        return;
      }
      if (this.knobHit(p) || this.anchorHit(p)) {
        this.directDown(pointerId, p, mods);
        return;
      }
      this.finishPen(false);
      return;
    }
    this.directDown(pointerId, p, mods);
  }

  /**
   * Wahltaste: das Ankerpunkt-Werkzeug. Auf einem Anker tippen wechselt Ecke und Rund (am letzten Anker des laufenden
   * Pfads: der Griff nach vorn fällt weg), aus einem Anker ziehen zieht neue Griffe heraus, an einem Griff ziehen bewegt
   * nur diesen. false, wenn nichts getroffen wurde (dann setzt der Zeichenstift einen Punkt)
   */
  private convertDown(pointerId: number, p: Pt): boolean {
    const pen = this.pen;
    if (pen) {
      const h = this.penHit(p);
      // der erste Anker schließt auch mit Wahltaste (dann dreht das Ziehen nur den Griff zum Schluss)
      if (h && !(h.side === 'anchor' && h.i === 0 && pen.pts.length >= 3)) {
        const a = pen.pts[h.i];
        if (h.side === 'anchor') this.drag = { kind: 'penPull', pointerId, i: h.i, start: p, orig: { ...a }, moved: false };
        else this.drag = { kind: 'penKnob', pointerId, i: h.i, side: h.side, mirror: false, orig: { ...a } };
        this.host.redraw();
        return true;
      }
    }
    const k = this.knobHit(p);
    if (k) {
      const o = this.shapeOf(k.sel.shape);
      const g = o ? getPath(o.shape, k.sel.ref) : null;
      if (!o || !g) return false;
      this.host.begin();
      this.drag = { kind: 'knob', pointerId, sel: k.sel, side: k.side, orig: copyPath(g.path), mirror: false, glue: glueOf(o.shape) };
      return true;
    }
    const a = this.anchorHit(p);
    if (a) {
      const o = this.shapeOf(a.shape);
      const g = o ? getPath(o.shape, a.ref) : null;
      if (!o || !g) return false;
      this.anchors = [a];
      this.face = null;
      this.host.begin();
      this.drag = { kind: 'pull', pointerId, sel: a, start: p, orig: copyPath(g.path), glue: glueOf(o.shape), moved: false };
      this.host.redraw();
      return true;
    }
    return false;
  }

  /** Zeichenstift beenden: geschlossen oder offen; ohne genug Anker verworfen */
  finishPen(closed: boolean): void {
    const pen = this.pen;
    this.pen = null;
    if (!pen) return;
    if (this.drag && (this.drag.kind === 'penAnchor' || this.drag.kind === 'penKnob' || this.drag.kind === 'penPull')) this.drag = null;
    const plane = findPlane(this.host.nodes(), pen.plane);
    const pts = pen.pts;
    let into = pen.into ? (this.shapeOf(pen.into)?.shape ?? null) : null;
    if (into && pts.length >= 2 && !this.touches(into, pts, closed)) into = null;
    // ohne Form zum Teilen ergibt eine offene Linie mit drei Ankern oder mehr eine geschlossene Form
    const close = closed || (!into && pts.length >= 3);
    if (!plane || pts.length < (close ? 3 : 2)) {
      this.host.cancel();
      if (pts.length >= 2 && !into) this.host.toast('Eine offene Linie teilt eine Form: erst die Form wählen, dann hineinzeichnen');
      this.host.redraw();
      return;
    }
    this.addPath(plane, into, pts, close);
  }

  cancelPen(): void {
    if (!this.pen) return;
    this.pen = null;
    this.host.cancel();
    this.host.redraw();
  }

  /** letzten Anker des Zeichenstifts zurücknehmen (Entf, Cmd+Z, zwei Finger tippen); false, wenn kein Pfad läuft */
  undoPoint(): boolean {
    const pen = this.pen;
    if (!pen) return false;
    pen.pts.pop();
    pen.drag = null;
    pen.closing = null;
    if (!pen.pts.length) this.cancelPen();
    else this.host.redraw();
    return true;
  }

  /** Pfad (Ebenen-Koordinaten) ablegen: in die Form als Linie oder Ring, sonst als neue Form */
  private addPath(plane: ZonePlane, into: ZoneShape | null, pts: ZonePath, closed: boolean): void {
    // ein Schritt im Verlauf, auch wenn zwischendurch (Befehlstaste) schon einer abgeschlossen wurde
    this.host.begin();
    if (into) {
      into.cuts = [...(into.cuts ?? []), { path: planePathToShape(into, pts), closed }];
      this.host.setSelection([into.id]);
    } else {
      const s = shapeFromPlanePath(this.host.nodes(), plane.id, pts, this.host.fillFor(plane));
      this.host.addShape(s);
      this.host.setSelection([s.id]);
    }
    this.host.commit();
  }

  // ------------------------------------------------------------------ Formpinsel und Messer

  private strokeDown(pointerId: number, p: Pt): void {
    const sel = this.host.selectedShapes().at(-1);
    const selPlane = sel ? findPlane(this.host.nodes(), sel.parent) : undefined;
    const brush = this.tool === 'brush';
    this.host.begin();
    const plane = brush && sel && selPlane && !selPlane.locked && !sel.locked ? selPlane : (this.host.activePlane() ?? (brush ? this.host.ensurePlane() : undefined));
    if (!plane || plane.locked) {
      this.host.cancel();
      this.host.toast(plane ? 'Die aktive Ebene ist gesperrt' : 'Erst eine Ebene anlegen');
      return;
    }
    const q = this.host.planePoint(plane, p);
    if (!q) {
      this.host.cancel();
      return;
    }
    this.stroke = { kind: brush ? 'brush' : 'knife', plane: plane.id, into: brush && sel && selPlane === plane ? sel.id : null, pointerId, pts: [q], screen: [p] };
    this.host.redraw();
  }

  private strokeUp(): void {
    const st = this.stroke!;
    this.stroke = null;
    const plane = findPlane(this.host.nodes(), st.plane);
    let len = 0;
    for (let i = 1; i < st.screen.length; i++) len += dist(st.screen[i], st.screen[i - 1]);
    if (!plane || len < 14 || st.pts.length < 3) {
      this.host.cancel();
      this.host.redraw();
      return;
    }
    const mpp = this.metersPerPx(plane, st.screen[0]);
    const poly: Poly = st.pts.map((q) => [q.x, q.y]);
    if (st.kind === 'knife') return this.knife(plane, poly, mpp);
    const a = st.screen[0];
    const b = st.screen[st.screen.length - 1];
    const closed = dist(a, b) < 28 && len > 80;
    let into = st.into ? (this.shapeOf(st.into)?.shape ?? null) : null;
    if (into && !this.touches(into, st.pts, closed)) into = null;
    if (!closed && !into) {
      this.host.cancel();
      this.host.toast('Ein offener Strich teilt eine Form: erst die Form wählen, dann hineinmalen');
      this.host.redraw();
      return;
    }
    const line = !closed && into ? this.trimToShape(into, poly) : poly;
    const path = fitCurve(line, mpp * BRUSH_TOL, closed).map(roundPoint);
    if (path.length < (closed ? 3 : 2)) {
      this.host.cancel();
      this.host.redraw();
      return;
    }
    this.addPath(plane, into, path, closed);
  }

  /** offener Strich (Ebenen-Koordinaten): Enden außerhalb der Form bis zur ersten bzw. letzten Kante kürzen */
  private trimToShape(shape: ZoneShape, poly: Poly): Poly {
    const local: Poly = poly.map(([x, y]) => [(x - shape.x) / shape.sx, (y - shape.y) / shape.sy]);
    const params: number[] = [];
    for (const { path, closed } of shapePaths(shape)) params.push(...crossParams(local, flattenPath(path, 0.2, closed), closed));
    if (!params.length) return poly;
    const outline = flattenPath(shape.path, 0.2);
    const holes = (shape.holes ?? []).map((h) => flattenPath(h, 0.2));
    const outside = ([x, y]: [number, number]) => !insideWithHoles(outline, holes, x, y);
    const a = outside(local[0]) ? Math.min(...params) : 0;
    const b = outside(local[local.length - 1]) ? Math.max(...params) : local.length - 1;
    if (b - a < 1e-6) return poly;
    return slicePoly(local, a, b).map(([x, y]) => [shape.x + shape.sx * x, shape.y + shape.sy * y]);
  }

  /** Messer: der Strich wird zwischen erster und letzter Kante eine Teilungslinie der obersten Form, die er kreuzt */
  private knife(plane: ZonePlane, poly: Poly, mpp: number): void {
    const line = rdpOpen(poly, mpp * KNIFE_TOL);
    const sel = this.host.selectedShapes().at(-1);
    const all = shapesOf(this.host.nodes(), plane.id).reverse();
    const candidates = (sel && sel.parent === plane.id ? [sel, ...all.filter((s) => s !== sel)] : all).filter((s) => !s.locked && !s.hidden);
    for (const s of candidates) {
      const local: Poly = line.map(([x, y]) => [(x - s.x) / s.sx, (y - s.y) / s.sy]);
      const params: number[] = [];
      for (const { path, closed } of shapePaths(s)) params.push(...crossParams(local, flattenPath(path, 0.2, closed), closed));
      if (params.length < 2) continue;
      const cut = slicePoly(local, Math.min(...params), Math.max(...params));
      s.cuts = [...(s.cuts ?? []), { path: cut.map(([x, y]) => ({ x: round3(x), y: round3(y) })), closed: false }];
      this.host.setSelection([s.id]);
      this.host.commit();
      return;
    }
    this.host.cancel();
    this.host.toast('Das Messer muss eine Form der aktiven Ebene ganz durchqueren');
    this.host.redraw();
  }

  // ------------------------------------------------------------------ Befehle aus der Leiste und Tasten

  /**
   * Eingabe und Esc beenden den Zeichenstift, Entf nimmt seinen letzten Anker zurück, löscht gewählte Anker oder
   * macht die gewählte Fläche zum Loch; Esc hebt Anker- und Flächenwahl auf. true, wenn verarbeitet
   */
  key(k: string): boolean {
    if (this.pen) {
      if (k === 'enter' || k === 'escape') this.finishPen(false);
      else if (k === 'backspace' || k === 'delete') this.undoPoint();
      else return false;
      return true;
    }
    if (k === 'backspace' || k === 'delete') {
      if (this.anchors.length) this.deleteAnchor();
      else if (this.currentFace()) this.fillFace(null);
      else return false;
      return true;
    }
    if (k === 'escape' && (this.anchors.length || this.face)) {
      this.anchors = [];
      this.face = null;
      this.host.redraw();
      return true;
    }
    return false;
  }

  /** gewählte Anker zwischen Ecke und Rund umschalten; maßgeblich ist der Hauptanker (rund: alle werden Ecken) */
  toggleAnchor(): void {
    const main = this.anchors.at(-1);
    const mo = main ? this.shapeOf(main.shape) : null;
    const ma = main && mo ? getPath(mo.shape, main.ref)?.path[main.i] : undefined;
    if (!main || !ma) return;
    const makeSmooth = !hasHandles(ma);
    this.host.begin();
    const glues = new Map<string, Glue[]>();
    for (const g of byPath(this.anchors).values()) {
      const o = this.shapeOf(g.shape);
      const cur = o ? getPath(o.shape, g.ref) : null;
      if (!o || !cur) continue;
      if (!glues.has(g.shape)) glues.set(g.shape, glueOf(o.shape));
      let path = cur.path;
      for (const i of g.idx) if (path[i] && hasHandles(path[i]) !== makeSmooth) path = toggleSmooth(path, cur.closed, i);
      setPath(o.shape, g.ref, path);
      reprojectGlue(o.shape, glues.get(g.shape)!, g.ref);
    }
    this.host.commit();
  }

  /** gewählte Anker löschen; ein Loch oder eine Linie mit zu wenigen Ankern fällt ganz weg, der Umriss behält drei */
  deleteAnchor(): void {
    if (!this.anchors.length) return;
    this.host.begin();
    let blocked = false;
    const groups = [...byPath(this.anchors).values()];
    for (const id of new Set(groups.map((g) => g.shape))) {
      const o = this.shapeOf(id);
      if (!o) continue;
      const glue = glueOf(o.shape);
      const whole: PathRef[] = [];
      for (const g of groups) {
        if (g.shape !== id) continue;
        const cur = getPath(o.shape, g.ref);
        if (!cur) continue;
        const idx = [...new Set(g.idx)].sort((a, b) => b - a);
        if (cur.path.length - idx.length < (cur.closed ? 3 : 2)) {
          if (g.ref.kind === 'outline') blocked = true;
          else whole.push(g.ref);
          continue;
        }
        let path = cur.path;
        for (const i of idx) path = removeAnchor(path, i);
        setPath(o.shape, g.ref, path);
        reprojectGlue(o.shape, glue, g.ref);
      }
      // ganze Löcher und Linien zuletzt, von hinten, damit die Nummern der anderen stimmen
      whole.sort((a, b) => (a.kind === b.kind ? (b as { i: number }).i - (a as { i: number }).i : a.kind === 'cut' ? -1 : 1));
      for (const ref of whole) setPath(o.shape, ref, null);
    }
    this.anchors = [];
    if (blocked) this.host.toast('Der Umriss braucht mindestens drei Punkte');
    this.host.commit();
  }

  /** Teilungslinie oder Loch des Hauptankers ganz entfernen */
  deleteLine(): void {
    const sel = this.anchors.at(-1);
    const o = sel ? this.shapeOf(sel.shape) : null;
    if (!sel || !o || sel.ref.kind === 'outline') return;
    this.host.begin();
    setPath(o.shape, sel.ref, null);
    this.anchors = [];
    this.host.commit();
  }

  /** Füllung der gewählten Fläche (null = Loch) */
  fillFace(fill: string | null): void {
    const cur = this.currentFace();
    if (!cur) return;
    this.host.begin();
    setFaceFill(cur.shape, cur.face, fill);
    this.host.commit();
  }

  /** Hauptanker für die Leiste: seine Form, ob rund, welcher Pfad */
  private mainAnchor(): { shape: ZoneShape; smooth: boolean; line: PathRef['kind'] } | null {
    const main = this.anchors.at(-1);
    const o = main ? this.shapeOf(main.shape) : null;
    const a = main && o ? getPath(o.shape, main.ref)?.path[main.i] : undefined;
    return main && o && a ? { shape: o.shape, smooth: hasHandles(a), line: main.ref.kind } : null;
  }

  context(): PathContext | null {
    if (this.pen) return { kind: 'pen', count: this.pen.pts.length, into: this.pen.into ? (this.shapeOf(this.pen.into)?.shape.name ?? null) : null };
    const main = this.mainAnchor();
    if (this.tool === 'lasso') return { kind: 'lasso', form: this.lassoForm, count: main ? this.anchors.length : 0, smooth: main?.smooth ?? false };
    if (main) return { kind: 'anchor', shape: main.shape, count: this.anchors.length, smooth: main.smooth, line: main.line };
    const f = this.currentFace();
    if (f) return { kind: 'face', shape: f.shape, fill: faceFill(f.shape, f.face) };
    return null;
  }

  // ------------------------------------------------------------------ Überlagerung

  overlay(st: OverlayState): void {
    const nodes = this.host.nodes();
    // Pfade der gewählten Formen; bei Direktauswahl und Lasso (und Zeichenstift mit Befehls- oder Wahltaste) mit Ankern,
    // dazu die Griffe des Hauptankers
    const showAnchors = this.tool === 'direct' || this.tool === 'lasso' || (this.tool === 'pen' && (this.mods.cmd || this.mods.alt));
    const main = this.anchors.at(-1);
    for (const sel of this.host.selectedShapes()) {
      const plane = findPlane(nodes, sel.parent);
      if (!plane) continue;
      for (const { ref, path, closed } of shapePaths(sel)) {
        const pts = flattenPath(path, 0.3, closed)
          .map(([x, y]) => this.scr(sel, plane, x, y))
          .filter((q): q is Pt => !!q);
        if (closed) st.outlines.push(pts);
        else st.lines.push(pts);
        if (!showAnchors) continue;
        path.forEach((a, i) => {
          const s = this.scr(sel, plane, a.x, a.y);
          if (!s) return;
          const here: AnchorSel = { shape: sel.id, ref, i };
          st.anchors.push({ ...s, on: this.anchors.some((x) => sameSel(x, here)) });
          if (!main || !sameSel(main, here)) return;
          for (const [hx, hy] of [
            [a.inX, a.inY],
            [a.outX, a.outY],
          ]) {
            if (!hx && !hy) continue;
            const k = this.scr(sel, plane, a.x + (hx ?? 0), a.y + (hy ?? 0));
            if (k) {
              st.tangents.push([s, k]);
              st.knobs.push(k);
            }
          }
        });
      }
      const f = this.tool === 'direct' || this.tool === 'lasso' ? this.currentFace() : null;
      if (f && f.shape.id === sel.id) st.face = [f.face.outline, ...f.face.holes].map((ring) => ring.map(([x, y]) => this.scr(sel, plane, x, y)).filter((q): q is Pt => !!q));
    }
    // laufender Zeichenstift mit Gummiband; Griffe am letzten Anker, mit Befehls- oder Wahltaste an allen
    const pen = this.pen;
    const penPlane = pen ? findPlane(nodes, pen.plane) : undefined;
    if (pen && penPlane) {
      const line = pen.pts.length >= 2 ? flattenPath(pen.pts, 0.3, false) : pen.pts.map((a) => [a.x, a.y] as [number, number]);
      const pts = line.map(([x, y]) => this.host.screenOf(penPlane, { x, y })).filter((q): q is Pt => !!q);
      if (this.hover && pen.drag === null && !this.drag && pts.length && !this.mods.cmd && !this.mods.alt) pts.push(this.hover);
      st.lines.push(pts);
      const all = this.mods.cmd || this.mods.alt;
      pen.pts.forEach((a, i) => {
        const s = this.host.screenOf(penPlane, a);
        if (!s) return;
        st.anchors.push({ ...s, on: i === 0 });
        if (!(all || i === pen.pts.length - 1 || (pen.closing && i === 0)) || !hasHandles(a)) return;
        for (const [hx, hy] of [
          [a.inX ?? 0, a.inY ?? 0],
          [a.outX ?? 0, a.outY ?? 0],
        ]) {
          if (!hx && !hy) continue;
          const k = this.host.screenOf(penPlane, { x: a.x + hx, y: a.y + hy });
          if (k) {
            st.tangents.push([s, k]);
            st.knobs.push(k);
          }
        }
      });
    }
    if (this.stroke) st.stroke = this.stroke.screen;
    if (this.region) st.region = regionRing(this.region.form, this.region.pts);
  }
}
