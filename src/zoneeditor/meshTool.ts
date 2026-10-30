/**
 * Netz-Werkzeug (W) wie in Spine (Florian, 30.10.2026: „ein Mesh um ein Bild zeichnen und dieses dann verzerren“), Rechnung
 * in src/zone/mesh.ts. Es arbeitet an der zuletzt gewählten Form.
 *
 * - Netz anlegen: „Netz automatisch“ legt die Hülle auf den Umriss und füllt innen ein Wabenraster (Spines „Generate“);
 *   „Netz zeichnen“: die Form steht unverzerrt, Hüllpunkte um das Bild tippen, auf den ersten Punkt oder Eingabe schließt,
 *   Rücktaste nimmt den letzten, Esc bricht ab.
 * - Verformen: Punkte antippen (Umschalt nimmt dazu), aus dem Leeren ziehen wählt im Rechteck, gewählte Punkte ziehen;
 *   G, R, S bewegen wie in Blender, O schaltet den Einflusskreis ein (src/zoneeditor/xform.ts); das Bild verzerrt sich mit.
 * - Bearbeiten: die Form steht unverzerrt; Punkte verschieben ändert, wo sie im Bild sitzen (das Bild bleibt stehen),
 *   Tippen ins Netz setzt einen Punkt, Tippen auf die Hülle einen Hüllpunkt; Wahltaste auf einen Punkt oder Entf löscht.
 *
 * Platzhalter: Aussehen der Punkte und Kanten, Dichte des Rasters (wenige, mittel, viele).
 */
import { addMeshPoint, autoMesh, cloneMesh, inPoly, MESH_MAX_POINTS, meshDeformed, meshEdges, meshFrom, meshPath, meshValid, nearestHullEdge, refillMesh, removeMeshPoints, resetDeform, restHull, retriangulate, type MeshDensity } from '@/zone/mesh';
import { findPlane, planeLocked, shapeLocalPolys, shapeToPlane, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { selfIntersections, type Poly } from '@/zone/path';
import { applyXform, weights } from '@/zone/proportional';
import type { OverlayState, Pt } from './overlay';
import type { Mods } from './pathTools';
import type { XformTarget } from './xform';

export type MeshMode = 'deform' | 'edit';

export interface MeshToolHost {
  nodes(): ZoneNode[];
  selectedShapes(): ZoneShape[];
  setSelection(ids: string[]): void;
  planePoint(plane: ZonePlane, p: Pt): Pt | null;
  screenOf(plane: ZonePlane, q: Pt, shape?: ZoneShape): Pt | null;
  pick(p: Pt): { id: string; face: number } | null;
  /** Arbeitsschritt: beginnen, abschließen */
  begin(): void;
  commit(): void;
  redraw(): void;
  toast(msg: string): void;
  /** Trefferradius in Bildpunkten */
  hitRadius(): number;
  /** Formen, die ohne Verzerrung gezeichnet werden (Bearbeiten, Zeichnen) */
  setRest(ids: ReadonlySet<string>): void;
  /** gewählte Punkte mit dem Zeiger ziehen: wie G in Blender (mit Einflusskreis, wenn O an ist) */
  grab(pointerId: number, p: Pt): void;
}

/** was die Leiste unten zeigt */
export interface MeshContext {
  /** Name der Form, an der gearbeitet wird */
  shape: string | null;
  has: boolean;
  mode: MeshMode;
  points: number;
  sel: number;
  deformed: boolean;
  /** Netz zeichnen läuft: so viele Hüllpunkte */
  drawing: number | null;
  density: MeshDensity;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export class MeshTool {
  mode: MeshMode = 'deform';
  density: MeshDensity = 'mid';
  private active = false;
  /** gewählte Punkte (Nummern im Netz) der Form selShape */
  private sel = new Set<number>();
  private selShape: string | null = null;
  /** Netz zeichnen: Form und Hüllpunkte in Pfad-Koordinaten */
  private drawing: { shape: string; pts: Pt[] } | null = null;
  private hover: Pt | null = null;
  /** Druck ins Leere: Rechteck oder Tippen */
  private press: { pointerId: number; start: Pt; last: Pt; moved: boolean; add: boolean } | null = null;
  private restKey = '';

  constructor(private readonly host: MeshToolHost) {}

  /** Werkzeug an oder aus; aus: Zeichnen endet, die Form steht wieder verzerrt */
  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.drawing = null;
      this.press = null;
    }
    this.syncRest();
  }

  get busy(): boolean {
    return !!(this.drawing || this.press);
  }

  /** Form, an der gearbeitet wird: die zuletzt gewählte, wenn man sie bearbeiten darf */
  private target(): { shape: ZoneShape; plane: ZonePlane } | null {
    const shape = this.host.selectedShapes().at(-1);
    const plane = shape ? findPlane(this.host.nodes(), shape.parent) : undefined;
    if (!shape || !plane || shape.locked || shape.hidden || planeLocked(this.host.nodes(), plane)) return null;
    if (this.selShape !== shape.id) {
      this.selShape = shape.id;
      this.sel = new Set();
    }
    const n = shape.mesh?.pts.length ?? 0;
    for (const i of this.sel) if (i >= n) this.sel.delete(i);
    return { shape, plane };
  }

  private shapeOf(id: string): { shape: ZoneShape; plane: ZonePlane } | null {
    const shape = this.host.nodes().find((n): n is ZoneShape => n.kind === 'shape' && n.id === id);
    const plane = shape ? findPlane(this.host.nodes(), shape.parent) : undefined;
    return shape && plane ? { shape, plane } : null;
  }

  /** Bearbeiten und Zeichnen zeigen die Form unverzerrt (wie Spines Bearbeiten) */
  private syncRest(): void {
    const t = this.active ? this.target() : null;
    const id = this.drawing?.shape ?? (t?.shape.mesh && this.mode === 'edit' ? t.shape.id : null);
    const key = id ?? '';
    if (key === this.restKey) return;
    this.restKey = key;
    this.host.setRest(new Set(id ? [id] : []));
  }

  setMode(mode: MeshMode): void {
    this.mode = mode;
    this.syncRest();
    this.host.redraw();
  }

  /** andere Formen gewählt (oder Knoten neu): Auswahl der Punkte nachführen */
  selectionChanged(): void {
    if (!this.active) return;
    this.target();
    this.syncRest();
  }

  /** Bildpunkt → Pfad-Koordinate der Form */
  private local(shape: ZoneShape, plane: ZonePlane, p: Pt): Pt | null {
    const q = this.host.planePoint(plane, p);
    return q ? { x: (q.x - shape.x) / shape.sx, y: (q.y - shape.y) / shape.sy } : null;
  }

  /** Ebenen-Meter je Bildpunkt an der Stelle p */
  private metersPerPx(plane: ZonePlane, p: Pt): number {
    const a = this.host.planePoint(plane, p);
    const b = this.host.planePoint(plane, { x: p.x + 10, y: p.y });
    return a && b ? Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y) / 10) : 0.1;
  }

  /** Bildpunkte der Netzpunkte, ohne Verzerrung oder verzerrt */
  private screenPts(shape: ZoneShape, plane: ZonePlane, rest: boolean): Array<Pt | null> {
    return (shape.mesh?.pts ?? []).map((q) => this.host.screenOf(plane, shapeToPlane(shape, rest ? q.rx : q.x, rest ? q.ry : q.y), shape));
  }

  private pointAt(t: { shape: ZoneShape; plane: ZonePlane }, p: Pt): number {
    let best = -1;
    let bd = this.host.hitRadius();
    this.screenPts(t.shape, t.plane, this.mode === 'edit').forEach((q, i) => {
      const d = q ? dist(q, p) : Infinity;
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  // ------------------------------------------------------------------ Zeiger

  down(pointerId: number, p: Pt, mods: Mods): void {
    if (this.drawing) {
      this.drawDown(p);
      return;
    }
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m) {
      // eine (andere) Form wählen; ohne Netz zeigt die Leiste, wie man eins anlegt
      const pick = this.host.pick(p);
      if (pick && pick.id !== t?.shape.id) this.host.setSelection([pick.id]);
      else if (t) this.host.toast('Diese Form hat noch kein Netz: „Netz automatisch“ oder „Netz zeichnen“ in der Leiste');
      this.host.redraw();
      return;
    }
    const edit = this.mode === 'edit';
    const i = this.pointAt(t, p);
    if (i >= 0) {
      if (mods.alt) {
        this.removePoints(new Set([i]));
        return;
      }
      if (mods.shift) {
        if (this.sel.has(i)) this.sel.delete(i);
        else this.sel.add(i);
        this.host.redraw();
        return;
      }
      if (!this.sel.has(i)) this.sel = new Set([i]);
      this.host.redraw();
      this.host.grab(pointerId, p);
      return;
    }
    // Bearbeiten: Tippen auf die Hülle setzt dort einen Hüllpunkt
    const at = edit ? this.local(t.shape, t.plane, p) : null;
    if (at) {
      const e = nearestHullEdge(m, at.x, at.y, true, t.shape.sx, t.shape.sy);
      if (e.d <= this.host.hitRadius() * this.metersPerPx(t.plane, p)) {
        this.host.begin();
        const k = addMeshPoint(m, at.x, at.y, { after: e.after, t: e.t });
        if (k >= 0) {
          t.shape.path = meshPath(m);
          this.sel = new Set([k]);
        } else this.host.toast(`Höchstens ${MESH_MAX_POINTS} Punkte`);
        this.host.commit();
        return;
      }
    }
    this.press = { pointerId, start: p, last: p, moved: false, add: mods.shift };
    this.host.redraw();
  }

  move(pointerId: number, p: Pt): void {
    const pr = this.press;
    if (!pr || pr.pointerId !== pointerId) return;
    pr.last = p;
    if (dist(p, pr.start) > 4) pr.moved = true;
    this.host.redraw();
  }

  up(pointerId: number, p: Pt): void {
    const pr = this.press;
    if (!pr || pr.pointerId !== pointerId) return;
    this.press = null;
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m) return;
    if (pr.moved) {
      // Rechteck: Punkte darin wählen (Umschalt: dazu)
      const x0 = Math.min(pr.start.x, pr.last.x);
      const x1 = Math.max(pr.start.x, pr.last.x);
      const y0 = Math.min(pr.start.y, pr.last.y);
      const y1 = Math.max(pr.start.y, pr.last.y);
      if (!pr.add) this.sel = new Set();
      this.screenPts(t.shape, t.plane, this.mode === 'edit').forEach((q, i) => {
        if (q && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) this.sel.add(i);
      });
      this.host.redraw();
      return;
    }
    // Bearbeiten: Tippen ins Netz setzt einen Punkt
    const at = this.mode === 'edit' ? this.local(t.shape, t.plane, p) : null;
    if (at && inPoly(restHull(m), at.x, at.y)) {
      this.host.begin();
      const k = addMeshPoint(m, at.x, at.y);
      if (k >= 0) {
        t.shape.path = meshPath(m);
        this.sel = new Set([k]);
      } else this.host.toast(`Höchstens ${MESH_MAX_POINTS} Punkte`);
      this.host.commit();
      return;
    }
    // Tippen daneben: eine andere Form wählen, sonst die Auswahl der Punkte aufheben
    const pick = this.host.pick(p);
    if (pick && pick.id !== t.shape.id) {
      this.host.setSelection([pick.id]);
      return;
    }
    if (!pr.add) this.sel = new Set();
    this.host.redraw();
  }

  /** Zeiger ohne Druck: Gummiband beim Zeichnen */
  hoverAt(p: Pt | null): void {
    this.hover = p;
    if (this.drawing) this.host.redraw();
  }

  /** was der Zeiger begonnen hat, verwerfen */
  cancelActive(): void {
    if (!this.press) return;
    this.press = null;
    this.host.redraw();
  }

  // ------------------------------------------------------------------ Netz anlegen, zeichnen, ändern

  /** Netz automatisch (Spines „Generate“) für die gewählte Form */
  autoCreate(): void {
    const t = this.target();
    if (!t) {
      this.host.toast('Erst eine Form wählen (am besten mit Bild)');
      return;
    }
    const m = autoMesh(t.shape.path, t.shape.sx, t.shape.sy, this.density);
    if (!m) {
      this.host.toast('Aus diesem Umriss geht kein Netz (er kreuzt sich): „Netz zeichnen“');
      return;
    }
    this.host.begin();
    t.shape.mesh = m;
    t.shape.path = meshPath(m);
    this.sel = new Set();
    this.host.commit();
    this.syncRest();
    this.host.toast(`Netz mit ${m.pts.length} Punkten: Punkte wählen und ziehen, G/R/S bewegen, O Einflusskreis`);
  }

  /** Netz zeichnen beginnen: die Form steht unverzerrt, Hüllpunkte tippen */
  startDraw(): void {
    const t = this.target();
    if (!t) {
      this.host.toast('Erst eine Form wählen (am besten mit Bild)');
      return;
    }
    this.drawing = { shape: t.shape.id, pts: [] };
    this.syncRest();
    this.host.redraw();
  }

  private drawDown(p: Pt): void {
    const d = this.drawing;
    const o = d ? this.shapeOf(d.shape) : null;
    if (!d || !o) {
      this.drawing = null;
      return;
    }
    // auf den ersten Punkt: schließen
    const f = d.pts.length >= 3 ? this.host.screenOf(o.plane, shapeToPlane(o.shape, d.pts[0].x, d.pts[0].y), o.shape) : null;
    if (f && dist(f, p) <= this.host.hitRadius()) {
      this.finishDraw();
      return;
    }
    const at = this.local(o.shape, o.plane, p);
    if (at) d.pts.push(at);
    this.host.redraw();
  }

  /** Hülle schließen: neues Netz (ohne innere Punkte), ins Bearbeiten */
  finishDraw(): void {
    const d = this.drawing;
    const o = d ? this.shapeOf(d.shape) : null;
    if (!d || !o) return;
    if (d.pts.length < 3) {
      this.host.toast('Die Hülle braucht mindestens drei Punkte');
      return;
    }
    const hull: Poly = d.pts.map((q) => [round3(q.x), round3(q.y)]);
    if (selfIntersections(hull) > 0) {
      this.host.toast('Die Hülle kreuzt sich: Rücktaste nimmt den letzten Punkt');
      return;
    }
    this.host.begin();
    const m = meshFrom(hull);
    o.shape.mesh = m;
    o.shape.path = meshPath(m);
    this.drawing = null;
    this.sel = new Set();
    this.mode = 'edit';
    this.host.commit();
    this.syncRest();
    this.host.toast('Netz steht: ins Netz tippen setzt Punkte, „Punkte innen“ füllt es; dann „Verformen“');
  }

  cancelDraw(): void {
    this.drawing = null;
    this.syncRest();
    this.host.redraw();
  }

  /** innere Punkte neu im Raster (Dichte d); die Verzerrung bleibt */
  refill(d: MeshDensity): void {
    this.density = d;
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m) return;
    this.host.begin();
    refillMesh(m, t.shape.sx, t.shape.sy, d);
    this.sel = new Set();
    this.host.commit();
  }

  /** Verzerrung zurücknehmen: der gewählten Punkte, ohne Auswahl aller */
  reset(): void {
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m) return;
    this.host.begin();
    resetDeform(m, this.sel.size ? this.sel : undefined);
    t.shape.path = meshPath(m);
    this.host.commit();
  }

  /** Netz entfernen: die Form bleibt mit der Hülle ohne Verzerrung als Umriss */
  remove(): void {
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m) return;
    this.host.begin();
    resetDeform(m);
    t.shape.path = meshPath(m);
    delete t.shape.mesh;
    this.sel = new Set();
    this.host.commit();
    this.syncRest();
  }

  private removePoints(idx: ReadonlySet<number>): void {
    const t = this.target();
    const m = t?.shape.mesh;
    if (!t || !m || !idx.size) return;
    this.host.begin();
    if (removeMeshPoints(m, idx)) {
      t.shape.path = meshPath(m);
      this.sel = new Set();
    } else this.host.toast('Die Hülle braucht mindestens drei Punkte');
    this.host.commit();
  }

  selectAll(): void {
    const m = this.target()?.shape.mesh;
    if (!m) return;
    this.sel = new Set(m.pts.map((_, i) => i));
    this.host.redraw();
  }

  /** Tasten des Werkzeugs (ohne Befehlstaste); true, wenn behandelt */
  key(k: string): boolean {
    if (this.drawing) {
      if (k === 'enter') this.finishDraw();
      else if (k === 'escape') this.cancelDraw();
      else if (k === 'backspace' || k === 'delete') {
        this.drawing.pts.pop();
        this.host.redraw();
      } else return false;
      return true;
    }
    if (k === 'backspace' || k === 'delete') {
      // ohne gewählte Punkte löscht Entf hier nicht die ganze Form
      if (this.sel.size) this.removePoints(this.sel);
      else if (this.target()?.shape.mesh) this.host.toast('Erst Netzpunkte wählen (Entf löscht sie)');
      else return false;
      return true;
    }
    if (k === 'escape' && this.sel.size) {
      this.sel = new Set();
      this.host.redraw();
      return true;
    }
    return false;
  }

  /**
   * Gewählte Punkte für G, R, S (src/zoneeditor/xform.ts): Verformen bewegt die verzerrte Lage, Bearbeiten die Lage ohne
   * Verzerrung (die Verzerrung des Punkts bleibt, die Dreiecke werden neu gerechnet)
   */
  xformTarget(): XformTarget | null {
    const t = this.target();
    const m0 = t?.shape.mesh;
    if (!t || !m0 || !this.sel.size) return null;
    const { shape, plane } = t;
    const edit = this.mode === 'edit';
    const orig = cloneMesh(m0);
    const xy: number[] = [];
    for (const q of orig.pts) xy.push(shape.x + shape.sx * (edit ? q.rx : q.x), shape.y + shape.sy * (edit ? q.ry : q.y));
    const sel = new Set(this.sel);
    let px = 0;
    let py = 0;
    for (const i of sel) {
      px += xy[i * 2];
      py += xy[i * 2 + 1];
    }
    return {
      plane,
      pivot: { x: px / sel.size, y: py / sel.size },
      apply: (xf, prop) => {
        const w = weights(xy, sel, prop);
        const m = cloneMesh(orig);
        m.pts.forEach((q, i) => {
          if (w[i] <= 0) return;
          const [X, Y] = applyXform(xy[i * 2], xy[i * 2 + 1], w[i], xf);
          const x = (X - shape.x) / shape.sx;
          const y = (Y - shape.y) / shape.sy;
          if (edit) {
            q.x = x + (q.x - q.rx);
            q.y = y + (q.y - q.ry);
            q.rx = x;
            q.ry = y;
          } else {
            q.x = x;
            q.y = y;
          }
        });
        if (edit) retriangulate(m);
        shape.mesh = m;
        shape.path = meshPath(m);
      },
      check: () => (edit && shape.mesh && !meshValid(shape.mesh) ? 'So überschnitte sich das Netz (oder ein Punkt läge außerhalb der Hülle): zurückgenommen' : null),
    };
  }

  // ------------------------------------------------------------------ Leiste und Überlagerung

  context(): MeshContext {
    const d = this.drawing;
    const t = this.target();
    const m = t?.shape.mesh;
    return {
      shape: t?.shape.name ?? null,
      has: !!m,
      mode: this.mode,
      points: m?.pts.length ?? 0,
      sel: this.sel.size,
      deformed: m ? meshDeformed(m) : false,
      drawing: d ? d.pts.length : null,
      density: this.density,
    };
  }

  overlay(st: OverlayState): void {
    const d = this.drawing;
    if (d) {
      const o = this.shapeOf(d.shape);
      if (!o) return;
      const pts = d.pts.map((q) => this.host.screenOf(o.plane, shapeToPlane(o.shape, q.x, q.y), o.shape)).filter((q): q is Pt => !!q);
      st.lines.push(this.hover ? [...pts, this.hover] : pts);
      st.anchors.push(...pts.map((q, i) => ({ ...q, on: i === 0 })));
      return;
    }
    const t = this.target();
    if (!t) return;
    const { shape, plane } = t;
    const m = shape.mesh;
    if (!m) {
      // ohne Netz: der Umriss der Form, damit man sieht, woran das Werkzeug arbeitet
      st.outlines.push(shapeLocalPolys(shape).outline.map(([x, y]) => this.host.screenOf(plane, shapeToPlane(shape, x, y), shape)).filter((q): q is Pt => !!q));
      return;
    }
    const pts = this.screenPts(shape, plane, this.mode === 'edit');
    const edges: Array<[Pt, Pt]> = [];
    for (const [a, b] of meshEdges(m)) {
      const pa = pts[a];
      const pb = pts[b];
      if (pa && pb) edges.push([pa, pb]);
    }
    const hull = pts.slice(0, m.hull).filter((q): q is Pt => !!q);
    st.outlines.push(hull);
    st.mesh = { edges, pts: pts.flatMap((q, i) => (q ? [{ ...q, on: this.sel.has(i), hull: i < m.hull }] : [])) };
    const pr = this.press;
    if (pr?.moved) {
      const a = pr.start;
      const b = pr.last;
      st.region = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    }
  }
}
