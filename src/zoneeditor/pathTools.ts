/**
 * Pfad-Werkzeuge des Zonen-Editors (Stufe 2, Plan 4.3 und 4.5): Direktauswahl (A), Zeichenstift (P), Formpinsel (B) und
 * Messer (K). Sie arbeiten auf dem Vektornetz einer Form (src/zone/faces.ts): Umriss, Löcher und Teilungslinien.
 *
 * - Direktauswahl: Anker und Griffe ziehen; Doppeltippen auf eine Linie setzt einen Anker; Tippen in eine Fläche wählt
 *   sie (Farbe, Loch); auf einem runden Anker bewegt sich der gegenüberliegende Griff mit (mit Wahltaste nicht).
 * - Zeichenstift: Tippen gibt eine Ecke, Ziehen eine Kurve; Tippen auf den ersten Anker schließt, auf den letzten oder
 *   Eingabe beendet. Ist eine Form gewählt und berührt der Pfad sie, wird er eine Teilungslinie oder ein Ring in ihr
 *   (seine Enden rasten an ihren Ankern und Kanten ein); sonst entsteht eine neue Form.
 * - Formpinsel: freihand, wird eine glatte Kurve mit wenigen Ankern; geschlossen (Ende nahe am Anfang) oder offen wie
 *   beim Zeichenstift.
 * - Messer: ein Strich quer durch eine Form der aktiven Ebene teilt sie (zwischen erster und letzter Kante).
 */
import { faceAt, type Face } from '@/zone/faces';
import { fitCurve, flattenPath, inPolygon, insideWithHoles, type PathPoint, type Poly, type ZonePath } from '@/zone/path';
import {
  faceFill,
  findPlane,
  getPath,
  insertAnchor,
  planePathToShape,
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

export type PathTool = 'direct' | 'pen' | 'brush' | 'knife';

export interface PathToolHost {
  nodes(): ZoneNode[];
  activePlane(): ZonePlane | undefined;
  selectedShape(): ZoneShape | undefined;
  select(shapeId: string | null): void;
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
  | { kind: 'anchor'; shape: ZoneShape; smooth: boolean; line: PathRef['kind'] }
  | { kind: 'face'; shape: ZoneShape; fill: string | null };

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
  | { kind: 'anchor'; pointerId: number; sel: AnchorSel; start: Pt; orig: ZonePath; glue: Glue[] }
  | { kind: 'knob'; pointerId: number; sel: AnchorSel; side: 'in' | 'out'; orig: ZonePath; mirror: boolean; glue: Glue[] };

interface Pen {
  plane: string;
  into: string | null;
  /** Anker in Ebenen-Koordinaten */
  pts: ZonePath;
  /** Anker, an dem gerade gezogen wird (Griffe), oder null */
  drag: number | null;
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

const DOUBLE_TAP = 380;
/** Formpinsel: Abweichung der Kurve vom Strich (Bildpunkte); Messer etwas genauer */
const BRUSH_TOL = 3;
const KNIFE_TOL = 1.5;

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

const sameRef = (a: PathRef, b: PathRef): boolean => a.kind === b.kind && (a.kind === 'outline' || (a as { i: number }).i === (b as { i: number }).i);

/** nächster Punkt auf dem Stück nach Anker i (Abtasten, dann Dritteln) */
function nearestOnSegment(path: ZonePath, i: number, p: Pt): { t: number; d: number } {
  const dist = (t: number): number => {
    const q = segmentPoint(path, i, t);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  const N = 24;
  let bt = 0;
  let bd = Infinity;
  for (let k = 0; k <= N; k++) {
    const d = dist(k / N);
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
    if (dist(m1) < dist(m2)) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, d: dist(t) };
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
 * Teilungslinie an ihrer Kante bleibt. skip: das gerade gezogene Ende selbst
 */
export function applyGlue(shape: ZoneShape, glue: readonly Glue[], ref: PathRef, skip?: { cut: number; end: 0 | 1 }): void {
  const src = getPath(shape, ref);
  if (!src) return;
  for (const g of glue) {
    if (!sameRef(g.ref, ref) || (skip && skip.cut === g.cut && skip.end === g.end)) continue;
    const cut = shape.cuts?.[g.cut];
    if (!cut || g.i >= (src.closed ? src.path.length : src.path.length - 1)) continue;
    const q = segmentPoint(src.path, g.i, g.t);
    const path = cut.path.map((p) => ({ ...p }));
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
    const path = cut.path.map((p) => ({ ...p }));
    path[k] = { ...path[k], x: round3(best.x), y: round3(best.y) };
    setPath(shape, { kind: 'cut', i: g.cut }, path);
  }
}

export class PathTools {
  tool: PathTool = 'direct';
  private pen: Pen | null = null;
  private stroke: Stroke | null = null;
  private anchor: AnchorSel | null = null;
  private face: { shape: string; x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private hover: Pt | null = null;
  private lastTap = { x: 0, y: 0, t: 0 };

  constructor(private readonly host: PathToolHost) {}

  /** Werkzeug wechseln (null: ein anderes Werkzeug des Editors): ein laufender Pfad wird beendet */
  setTool(t: PathTool | null): void {
    if (this.pen) this.finishPen(false);
    if (this.stroke || this.drag) this.cancelActive();
    if (t !== 'direct') {
      this.anchor = null;
      this.face = null;
    }
    if (t) this.tool = t;
  }

  /** gewählt ist jetzt diese Form: Anker und Fläche einer anderen fallen weg */
  shapeChanged(id: string | null): void {
    if (this.anchor && this.anchor.shape !== id) this.anchor = null;
    if (this.face && this.face.shape !== id) this.face = null;
  }

  get busy(): boolean {
    return !!(this.pen || this.stroke || this.drag);
  }

  /** gewählt ist eine Fläche (Entf macht sie zum Loch) */
  get faceSelected(): boolean {
    return !!this.currentFace();
  }

  // ------------------------------------------------------------------ Hilfen

  private shapeOf(id: string): { shape: ZoneShape; plane: ZonePlane } | null {
    const shape = this.host.nodes().find((n): n is ZoneShape => n.kind === 'shape' && n.id === id);
    const plane = shape ? findPlane(this.host.nodes(), shape.parent) : undefined;
    return shape && plane ? { shape, plane } : null;
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
        const d = s ? Math.hypot(s.x - p.x, s.y - p.y) : Infinity;
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

  // ------------------------------------------------------------------ Zeiger

  down(pointerId: number, p: Pt, mods: { alt: boolean }): void {
    if (this.tool === 'pen') return this.penDown(pointerId, p);
    if (this.tool === 'brush' || this.tool === 'knife') return this.strokeDown(pointerId, p);
    this.directDown(pointerId, p, mods);
  }

  move(pointerId: number, p: Pt, mods: { alt: boolean }): void {
    this.hover = p;
    const pen = this.pen;
    if (pen && pen.pointerId === pointerId && pen.drag !== null) {
      const plane = findPlane(this.host.nodes(), pen.plane);
      const q = plane ? this.host.planePoint(plane, p) : null;
      if (!q) return;
      const a = pen.pts[pen.drag];
      if (Math.hypot(p.x - pen.start.x, p.y - pen.start.y) < 4) pen.pts[pen.drag] = { x: a.x, y: a.y };
      else {
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        // Ziehen gibt eine Kurve mit zwei gleichen Griffen; mit Wahltaste nur der Griff nach vorn (Ecke mit Kurve)
        pen.pts[pen.drag] = mods.alt ? { x: a.x, y: a.y, inX: a.inX, inY: a.inY, outX: dx, outY: dy } : { x: a.x, y: a.y, inX: -dx, inY: -dy, outX: dx, outY: dy };
      }
      this.host.redraw();
      return;
    }
    const st = this.stroke;
    if (st && st.pointerId === pointerId) {
      const last = st.screen[st.screen.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      const plane = findPlane(this.host.nodes(), st.plane);
      const q = plane ? this.host.planePoint(plane, p) : null;
      if (q) {
        st.pts.push(q);
        st.screen.push(p);
      }
      this.host.redraw();
      return;
    }
    const d = this.drag;
    if (!d || d.pointerId !== pointerId) {
      if (this.pen) this.host.redraw();
      return;
    }
    const o = this.shapeOf(d.sel.shape);
    if (!o) return;
    const at = this.local(o.shape, o.plane, p);
    if (!at) return;
    const path = d.orig.map((x) => ({ ...x }));
    const a = path[d.sel.i];
    if (d.kind === 'anchor') {
      a.x = round3(d.orig[d.sel.i].x + (at.x - d.start.x));
      a.y = round3(d.orig[d.sel.i].y + (at.y - d.start.y));
    } else {
      const vx = at.x - a.x;
      const vy = at.y - a.y;
      if (d.side === 'out') {
        a.outX = vx;
        a.outY = vy;
      } else {
        a.inX = vx;
        a.inY = vy;
      }
      // runder Anker: der Griff gegenüber bleibt auf einer Linie, mit seiner Länge
      if (d.mirror && !mods.alt) {
        const len = d.side === 'out' ? Math.hypot(a.inX ?? 0, a.inY ?? 0) : Math.hypot(a.outX ?? 0, a.outY ?? 0);
        const l = Math.hypot(vx, vy) || 1;
        if (d.side === 'out') {
          a.inX = (-vx / l) * len;
          a.inY = (-vy / l) * len;
        } else {
          a.outX = (-vx / l) * len;
          a.outY = (-vy / l) * len;
        }
      }
    }
    setPath(o.shape, d.sel.ref, path);
    applyGlue(o.shape, d.glue, d.sel.ref, this.draggedEnd(d.sel, path.length));
    this.host.changed();
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
    const path = g.path.map((x) => ({ ...x }));
    path[sel.i] = { ...path[sel.i], x: local.x, y: local.y };
    setPath(o.shape, sel.ref, path);
  }

  up(pointerId: number): void {
    if (this.pen && this.pen.pointerId === pointerId) {
      this.pen.drag = null;
      this.host.redraw();
      return;
    }
    if (this.stroke && this.stroke.pointerId === pointerId) {
      this.strokeUp();
      return;
    }
    if (this.drag && this.drag.pointerId === pointerId) {
      const d = this.drag;
      this.drag = null;
      if (d.kind === 'anchor') this.snapEnd(d.sel);
      this.host.commit();
    }
  }

  /** Zeiger ohne Druck (Maus, schwebender Pencil): Gummiband des Zeichenstifts */
  hoverAt(p: Pt | null): void {
    this.hover = p;
    if (this.pen) this.host.redraw();
  }

  /**
   * Was der laufende Zeiger begonnen hat, verwerfen (ein zweiter Finger kam dazu, das System hat abgebrochen): der eben
   * gesetzte Anker des Zeichenstifts, ein Pinsel- oder Messerstrich, ein Ziehen an Ankern
   */
  cancelActive(): void {
    const pen = this.pen;
    if (pen && pen.drag !== null) {
      pen.pts.splice(pen.drag, 1);
      pen.drag = null;
      if (!pen.pts.length) this.cancelPen();
      else this.host.redraw();
      return;
    }
    if (this.stroke || this.drag) {
      this.stroke = null;
      this.drag = null;
      this.host.cancel();
      this.host.redraw();
    }
  }

  // ------------------------------------------------------------------ Direktauswahl

  private directDown(pointerId: number, p: Pt, mods: { alt: boolean }): void {
    const r = this.host.hitRadius();
    const sel = this.host.selectedShape();
    const o = sel ? this.shapeOf(sel.id) : null;
    if (o && !o.shape.locked && !o.plane.locked) {
      const { shape, plane } = o;
      // 1. Griffe des gewählten Ankers
      if (this.anchor && this.anchor.shape === shape.id) {
        const g = getPath(shape, this.anchor.ref);
        const a = g?.path[this.anchor.i];
        if (g && a) {
          for (const side of ['in', 'out'] as const) {
            const hx = side === 'in' ? a.inX : a.outX;
            const hy = side === 'in' ? a.inY : a.outY;
            if (!hx && !hy) continue;
            const s = this.scr(shape, plane, a.x + (hx ?? 0), a.y + (hy ?? 0));
            if (s && Math.hypot(s.x - p.x, s.y - p.y) <= r) {
              const other = side === 'in' ? [a.outX ?? 0, a.outY ?? 0] : [a.inX ?? 0, a.inY ?? 0];
              const mine = [hx ?? 0, hy ?? 0];
              const cross = mine[0] * other[1] - mine[1] * other[0];
              const smooth = Math.hypot(other[0], other[1]) > 1e-6 && Math.abs(cross) < 1e-3 * (Math.hypot(mine[0], mine[1]) * Math.hypot(other[0], other[1]) + 1e-9) && mine[0] * other[0] + mine[1] * other[1] < 0;
              this.host.begin();
              this.drag = { kind: 'knob', pointerId, sel: this.anchor, side, orig: g.path.map((x) => ({ ...x })), mirror: smooth && !mods.alt, glue: glueOf(shape) };
              return;
            }
          }
        }
      }
      // 2. Anker aller Pfade der Form
      let hit: AnchorSel | null = null;
      let hitD = r;
      for (const { ref, path } of shapePaths(shape)) {
        path.forEach((a, i) => {
          const s = this.scr(shape, plane, a.x, a.y);
          const d = s ? Math.hypot(s.x - p.x, s.y - p.y) : Infinity;
          if (d <= hitD) {
            hitD = d;
            hit = { shape: shape.id, ref, i };
          }
        });
      }
      if (hit) {
        const h: AnchorSel = hit;
        this.anchor = h;
        this.face = null;
        const g = getPath(shape, h.ref);
        const at = this.local(shape, plane, p);
        if (g && at) {
          this.host.begin();
          this.drag = { kind: 'anchor', pointerId, sel: h, start: at, orig: g.path.map((x) => ({ ...x })), glue: glueOf(shape) };
        }
        this.host.redraw();
        return;
      }
      // 3. Linien: Doppeltippen setzt einen Anker
      const seg = this.segmentAt(shape, plane, p, r);
      const now = performance.now();
      if (seg) {
        const twice = now - this.lastTap.t < DOUBLE_TAP && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 20;
        this.lastTap = { x: p.x, y: p.y, t: twice ? 0 : now };
        if (twice) {
          this.host.begin();
          setPath(shape, seg.ref, insertAnchor(seg.path, seg.i, seg.t));
          this.anchor = { shape: shape.id, ref: seg.ref, i: seg.i + 1 };
          this.face = null;
          this.host.commit();
          return;
        }
      }
      // 4. Fläche der gewählten Form (auch ein Loch)
      const at = this.local(shape, plane, p);
      if (at && faceAt(shapeFaces(shape), at.x, at.y) >= 0) {
        this.face = { shape: shape.id, x: at.x, y: at.y };
        this.anchor = null;
        this.host.redraw();
        return;
      }
      // einmal auf eine Linie getippt: die Form bleibt gewählt (das zweite Tippen setzt dort einen Anker)
      if (seg) {
        this.anchor = null;
        this.face = null;
        this.host.redraw();
        return;
      }
    }
    // 5. eine andere Form: wählen, mit der Fläche unter dem Zeiger
    const pick = this.host.pick(p);
    if (pick) {
      this.host.select(pick.id);
      const o2 = this.shapeOf(pick.id);
      const at = o2 ? this.local(o2.shape, o2.plane, p) : null;
      this.anchor = null;
      this.face = at ? { shape: pick.id, x: at.x, y: at.y } : null;
      this.host.redraw();
      return;
    }
    this.anchor = null;
    this.face = null;
    this.host.select(null);
  }

  /** Linie der Form unter p (Bildpunkte), mit Stück und Lage auf ihm */
  private segmentAt(shape: ZoneShape, plane: ZonePlane, p: Pt, r: number): { ref: PathRef; path: ZonePath; i: number; t: number } | null {
    let best: { ref: PathRef; path: ZonePath; i: number; t: number } | null = null;
    let bestD = r;
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
              best = { ref, path, i, t: (k - 1 + t) / 16 };
            }
          }
          prev = s;
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
      const sel = this.host.selectedShape();
      const selPlane = sel ? findPlane(this.host.nodes(), sel.parent) : undefined;
      this.host.begin();
      const plane = sel && selPlane && !selPlane.locked && !sel.locked ? selPlane : this.host.ensurePlane();
      if (plane.locked) {
        this.host.cancel();
        this.host.toast('Die aktive Ebene ist gesperrt');
        return;
      }
      this.pen = { plane: plane.id, into: sel && selPlane === plane ? sel.id : null, pts: [], drag: null, pointerId, start: p };
    }
    const pen = this.pen;
    const plane = findPlane(this.host.nodes(), pen.plane);
    if (!plane) return;
    // auf den ersten Anker: schließen; auf den letzten: beenden
    const first = pen.pts[0] ? this.host.screenOf(plane, pen.pts[0]) : null;
    const last = pen.pts.length ? this.host.screenOf(plane, pen.pts[pen.pts.length - 1]) : null;
    if (pen.pts.length >= 3 && first && Math.hypot(first.x - p.x, first.y - p.y) <= r) {
      this.finishPen(true);
      return;
    }
    if (pen.pts.length >= 2 && last && Math.hypot(last.x - p.x, last.y - p.y) <= r) {
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

  /** Zeichenstift beenden: geschlossen oder offen; ohne genug Anker verworfen */
  finishPen(closed: boolean): void {
    const pen = this.pen;
    this.pen = null;
    if (!pen) return;
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
    if (!pen.pts.length) this.cancelPen();
    else this.host.redraw();
    return true;
  }

  /** Pfad (Ebenen-Koordinaten) ablegen: in die Form als Linie oder Ring, sonst als neue Form */
  private addPath(plane: ZonePlane, into: ZoneShape | null, pts: ZonePath, closed: boolean): void {
    if (into) {
      into.cuts = [...(into.cuts ?? []), { path: planePathToShape(into, pts), closed }];
      this.host.select(into.id);
    } else {
      const s = shapeFromPlanePath(this.host.nodes(), plane.id, pts, this.host.fillFor(plane));
      this.host.addShape(s);
      this.host.select(s.id);
    }
    this.host.commit();
  }

  // ------------------------------------------------------------------ Formpinsel und Messer

  private strokeDown(pointerId: number, p: Pt): void {
    const sel = this.host.selectedShape();
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
    for (let i = 1; i < st.screen.length; i++) len += Math.hypot(st.screen[i].x - st.screen[i - 1].x, st.screen[i].y - st.screen[i - 1].y);
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
    const closed = Math.hypot(a.x - b.x, a.y - b.y) < 28 && len > 80;
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
    const sel = this.host.selectedShape();
    const all = shapesOf(this.host.nodes(), plane.id).reverse();
    const candidates = (sel && sel.parent === plane.id ? [sel, ...all.filter((s) => s !== sel)] : all).filter((s) => !s.locked && !s.hidden);
    for (const s of candidates) {
      const local: Poly = line.map(([x, y]) => [(x - s.x) / s.sx, (y - s.y) / s.sy]);
      const params: number[] = [];
      for (const { path, closed } of shapePaths(s)) params.push(...crossParams(local, flattenPath(path, 0.2, closed), closed));
      if (params.length < 2) continue;
      const cut = slicePoly(local, Math.min(...params), Math.max(...params));
      s.cuts = [...(s.cuts ?? []), { path: cut.map(([x, y]) => ({ x: round3(x), y: round3(y) })), closed: false }];
      this.host.select(s.id);
      this.host.commit();
      return;
    }
    this.host.cancel();
    this.host.toast('Das Messer muss eine Form der aktiven Ebene ganz durchqueren');
    this.host.redraw();
  }

  // ------------------------------------------------------------------ Befehle aus der Leiste und Tasten

  /**
   * Eingabe und Esc beenden den Zeichenstift, Entf nimmt seinen letzten Anker zurück, löscht einen gewählten Anker oder
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
      if (this.anchor) this.deleteAnchor();
      else if (this.currentFace()) this.fillFace(null);
      else return false;
      return true;
    }
    if (k === 'escape' && (this.anchor || this.face)) {
      this.anchor = null;
      this.face = null;
      this.host.redraw();
      return true;
    }
    return false;
  }

  toggleAnchor(): void {
    const sel = this.anchor;
    const o = sel ? this.shapeOf(sel.shape) : null;
    const g = sel && o ? getPath(o.shape, sel.ref) : null;
    if (!sel || !o || !g) return;
    this.host.begin();
    const glue = glueOf(o.shape);
    setPath(o.shape, sel.ref, toggleSmooth(g.path, g.closed, sel.i));
    reprojectGlue(o.shape, glue, sel.ref);
    this.host.commit();
  }

  deleteAnchor(): void {
    const sel = this.anchor;
    const o = sel ? this.shapeOf(sel.shape) : null;
    const g = sel && o ? getPath(o.shape, sel.ref) : null;
    if (!sel || !o || !g) return;
    if (g.path.length - 1 < (g.closed ? 3 : 2)) {
      if (sel.ref.kind === 'outline') {
        this.host.toast('Der Umriss braucht mindestens drei Punkte');
        return;
      }
      this.deleteLine();
      return;
    }
    this.host.begin();
    const glue = glueOf(o.shape);
    setPath(o.shape, sel.ref, removeAnchor(g.path, sel.i));
    reprojectGlue(o.shape, glue, sel.ref);
    this.anchor = { ...sel, i: Math.max(0, sel.i - 1) };
    this.host.commit();
  }

  /** Teilungslinie oder Loch des gewählten Ankers ganz entfernen */
  deleteLine(): void {
    const sel = this.anchor;
    const o = sel ? this.shapeOf(sel.shape) : null;
    if (!sel || !o || sel.ref.kind === 'outline') return;
    this.host.begin();
    setPath(o.shape, sel.ref, null);
    this.anchor = null;
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

  context(): PathContext | null {
    if (this.pen) return { kind: 'pen', count: this.pen.pts.length, into: this.pen.into ? (this.shapeOf(this.pen.into)?.shape.name ?? null) : null };
    if (this.anchor) {
      const o = this.shapeOf(this.anchor.shape);
      const g = o ? getPath(o.shape, this.anchor.ref) : null;
      const a = g?.path[this.anchor.i];
      if (o && a) return { kind: 'anchor', shape: o.shape, smooth: !!(a.inX || a.inY || a.outX || a.outY), line: this.anchor.ref.kind };
    }
    const f = this.currentFace();
    if (f) return { kind: 'face', shape: f.shape, fill: faceFill(f.shape, f.face) };
    return null;
  }

  // ------------------------------------------------------------------ Überlagerung

  overlay(st: OverlayState): void {
    const nodes = this.host.nodes();
    // Pfade der gewählten Form; bei der Direktauswahl mit Ankern und den Griffen des gewählten
    const sel = this.host.selectedShape();
    const plane = sel ? findPlane(nodes, sel.parent) : undefined;
    if (sel && plane) {
      for (const { ref, path, closed } of shapePaths(sel)) {
        const pts = flattenPath(path, 0.3, closed)
          .map(([x, y]) => this.scr(sel, plane, x, y))
          .filter((q): q is Pt => !!q);
        if (closed) st.outlines.push(pts);
        else st.lines.push(pts);
        if (this.tool !== 'direct') continue;
        path.forEach((a, i) => {
          const s = this.scr(sel, plane, a.x, a.y);
          if (!s) return;
          const on = !!this.anchor && this.anchor.shape === sel.id && sameRef(this.anchor.ref, ref) && this.anchor.i === i;
          st.anchors.push({ ...s, on });
          if (!on) return;
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
      const f = this.tool === 'direct' ? this.currentFace() : null;
      if (f && f.shape.id === sel.id) st.face = [f.face.outline, ...f.face.holes].map((ring) => ring.map(([x, y]) => this.scr(sel, plane, x, y)).filter((q): q is Pt => !!q));
    }
    // laufender Zeichenstift mit Gummiband
    const pen = this.pen;
    const penPlane = pen ? findPlane(nodes, pen.plane) : undefined;
    if (pen && penPlane) {
      const line = pen.pts.length >= 2 ? flattenPath(pen.pts, 0.3, false) : pen.pts.map((a) => [a.x, a.y] as [number, number]);
      const pts = line.map(([x, y]) => this.host.screenOf(penPlane, { x, y })).filter((q): q is Pt => !!q);
      if (this.hover && pen.drag === null && pts.length) pts.push(this.hover);
      st.lines.push(pts);
      pen.pts.forEach((a, i) => {
        const s = this.host.screenOf(penPlane, a);
        if (!s) return;
        st.anchors.push({ ...s, on: i === 0 });
        if (i !== pen.pts.length - 1 || (!a.outX && !a.outY)) return;
        for (const [hx, hy] of [
          [a.inX ?? 0, a.inY ?? 0],
          [a.outX ?? 0, a.outY ?? 0],
        ]) {
          const k = this.host.screenOf(penPlane, { x: a.x + hx, y: a.y + hy });
          if (k) {
            st.tangents.push([s, k]);
            st.knobs.push(k);
          }
        }
      });
    }
    if (this.stroke) st.stroke = this.stroke.screen;
  }
}
