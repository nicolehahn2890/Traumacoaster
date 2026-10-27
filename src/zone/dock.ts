/**
 * Spielangaben der Ebenen (Zonen-Editor, Stufe 4; Plan 4.9 und Befund 15): **Material** je Fläche (fest, grabbar, luftig,
 * frei) und **Andockkanten**: Oberkanten fester und grabbarer Flächen spielbarer Ebenen bis etwa 35° Neigung, über denen
 * in derselben Ebene nichts Festes liegt. Nur sie zählen für Pinsel, Stützen und Spielobjekte als Boden; Kulisse,
 * Vordergrund und Luft zählen nicht. Jedes Kantenstück (ein Lauf zwischen Ecken, die nicht mehr passen) lässt sich
 * abschalten; die Form merkt sich dafür einen Punkt am Stück (`dockOff`, Pfad-Koordinaten), so bleibt es auch nach
 * kleinen Änderungen aus. Ohne Renderer und DOM.
 */
import { faceBox, type Face } from './faces';
import { insideWithHoles, type Poly } from './path';
import { copyPaint, facePaint, findPlane, isStationNode, MATERIALS, planeHidden, planesOf, shapeFaces, shapesOf, type Material, type ZoneNode, type ZonePlane, type ZoneRegion, type ZoneShape } from './nodes';
import type { ZoneStation } from './types';
import { LANE_DEPTH } from '@/track/stage';

/** so weit (m) liegt die Bahn vor der Ebene, an der sie andockt (wie DOCK_GAP der Scheiben) */
const STATION_GAP = 1;
/** Schienen der Station über der Kante (m), wie die Stationen des Klötzchen-Editors über dem Boden */
const STATION_RISE = 1;

export { MATERIALS, type Material };
export const MATERIAL_WORDS: Record<Material, string> = { solid: 'fest', dig: 'grabbar', airy: 'luftig', free: 'frei' };
/** Vorgabe für neue Flächen (Platzhalter; Florian, 27.10.: „grabbar wird gebaut, dann schauen wir“, Entscheidung B2) */
export const DEFAULT_MATERIAL: Material = 'dig';
/** steiler als das ist keine Oberkante mehr (Grad) */
export const DOCK_SLOPE = 35;
/** so nah (Meter in der Ebene) muss ein Schalter-Punkt an einem Kantenstück liegen */
const OFF_NEAR = 0.6;

/** fest oder grabbar: trägt Bahn und Stützen, die Bahn läuft nicht hindurch */
export const isFirm = (m: Material): boolean => m === 'solid' || m === 'dig';

/** Material einer Fläche: ihr Füllpunkt, sonst die Form, sonst die Vorgabe */
export function faceMaterial(shape: ZoneShape, face: Face): Material {
  const p = facePaint(shape, face) as Partial<ZoneRegion>;
  return p.material ?? shape.material ?? DEFAULT_MATERIAL;
}

/** Material einer Fläche setzen (eine Form aus einer Fläche trägt es selbst; ein Füllpunkt behält den Anstrich) */
export function setFaceMaterial(shape: ZoneShape, face: Face, m: Material): void {
  const faces = shapeFaces(shape);
  if (faces.length === 1) {
    if (m === DEFAULT_MATERIAL) delete shape.material;
    else shape.material = m;
    return;
  }
  const regions = shape.regions ?? [];
  const r = regions.find((x) => insideWithHoles(face.outline, face.holes, x.x, x.y));
  const own = shape.material ?? DEFAULT_MATERIAL;
  if (r) {
    if (m === own) delete r.material;
    else r.material = m;
    return;
  }
  if (m === own) return;
  const paint = copyPaint(facePaint(shape, face));
  shape.regions = [...regions, { x: Math.round(face.inner[0] * 1000) / 1000, y: Math.round(face.inner[1] * 1000) / 1000, ...paint, material: m }];
}

// ------------------------------------------------------------------ Andockkanten

export interface Pt {
  x: number;
  y: number;
}

export interface DockEdge {
  plane: string;
  shape: string;
  /** Polylinie in Ebenen-Koordinaten, in Richtung des Rands (Fläche links) */
  pts: Pt[];
  /** Punkt in der Mitte des Stücks (Ebenen-Koordinaten) */
  mid: Pt;
  off: boolean;
}

/** Ring in Ebenen-Koordinaten; ccw: Umriss gegen den Uhrzeigersinn, sonst (Loch) mit ihm */
function planeRing(shape: ZoneShape, ring: Poly, ccw: boolean): Pt[] {
  const pts = ring.map(([x, y]) => ({ x: shape.x + shape.sx * x, y: shape.y + shape.sy * y }));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return (a >= 0) === ccw ? pts : pts.reverse();
}

interface Solid {
  outline: Poly;
  holes: Poly[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

/** feste und grabbare Flächen einer Ebene in Ebenen-Koordinaten (für „liegt darüber etwas Festes?“) */
function solidsOf(shapes: readonly ZoneShape[]): Solid[] {
  const out: Solid[] = [];
  for (const s of shapes) {
    if (s.hidden) continue;
    for (const f of shapeFaces(s)) {
      if (facePaint(s, f).fill === null || !isFirm(faceMaterial(s, f))) continue;
      const tr = (r: Poly): Poly => r.map(([x, y]) => [s.x + s.sx * x, s.y + s.sy * y]);
      const b = faceBox(f);
      const xs = [s.x + s.sx * b.minX, s.x + s.sx * b.maxX];
      const ys = [s.y + s.sy * b.minY, s.y + s.sy * b.maxY];
      out.push({ outline: tr(f.outline), holes: f.holes.map(tr), box: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } });
    }
  }
  return out;
}

const inSolid = (solids: readonly Solid[], x: number, y: number): boolean => solids.some((s) => x >= s.box.minX && x <= s.box.maxX && y >= s.box.minY && y <= s.box.maxY && insideWithHoles(s.outline, s.holes, x, y));

/** kleinster Abstand eines Punkts zu einer Polylinie */
function distTo(pts: readonly Pt[], p: Pt): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}

/** Punkt in der Mitte einer Polylinie (nach Länge) */
function midOf(pts: readonly Pt[]): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let half = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i] && lens[i] > 0) {
      const t = half / lens[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    half -= lens[i];
  }
  return pts[Math.floor(pts.length / 2)];
}

/** Andockkanten einer Form in ihrer Ebene (solids: alle festen Flächen der Ebene) */
function shapeDock(plane: ZonePlane, s: ZoneShape, solids: readonly Solid[]): DockEdge[] {
  const out: DockEdge[] = [];
  const cos = Math.cos((DOCK_SLOPE * Math.PI) / 180);
  const markers = (s.dockOff ?? []).map(([x, y]) => ({ x: s.x + s.sx * x, y: s.y + s.sy * y }));
  for (const f of shapeFaces(s)) {
    if (facePaint(s, f).fill === null || !isFirm(faceMaterial(s, f))) continue;
    const rings = [planeRing(s, f.outline, true), ...f.holes.map((h) => planeRing(s, h, false))];
    for (const ring of rings) {
      const n = ring.length;
      if (n < 3) continue;
      // je Kante: Oberkante (Normale nach oben, flacher als DOCK_SLOPE) und darüber frei
      const up = ring.map((a, i) => {
        const b = ring[(i + 1) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return false;
        const nx = dy / len;
        const ny = -dx / len;
        if (ny < cos) return false;
        return !inSolid(solids, (a.x + b.x) / 2 + nx * 0.05, (a.y + b.y) / 2 + ny * 0.05);
      });
      if (!up.some(Boolean)) continue;
      // Läufe zusammenhängender Kanten (der Ring ist geschlossen: an einer Lücke anfangen)
      const start = up.every(Boolean) ? 0 : up.findIndex((v, i) => v && !up[(i - 1 + n) % n]);
      let run: Pt[] = [];
      const flush = () => {
        if (run.length >= 2) {
          const mid = midOf(run);
          out.push({ plane: plane.id, shape: s.id, pts: run, mid, off: markers.some((m) => distTo(run, m) <= OFF_NEAR) });
        }
        run = [];
      };
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (!up[i]) {
          flush();
          continue;
        }
        if (!run.length) run.push(ring[i]);
        run.push(ring[(i + 1) % n]);
      }
      flush();
    }
  }
  return out;
}

/** alle Andockkanten der spielbaren, sichtbaren Ebenen (abgeschaltete mit off) */
export function dockEdges(nodes: readonly ZoneNode[], planeIds?: ReadonlySet<string>): DockEdge[] {
  const out: DockEdge[] = [];
  for (const plane of planesOf(nodes)) {
    if (plane.role !== 'play' || planeHidden(nodes, plane) || (planeIds && !planeIds.has(plane.id))) continue;
    const shapes = shapesOf(nodes, plane.id).filter((s) => !s.hidden);
    const solids = solidsOf(shapes);
    for (const s of shapes) out.push(...shapeDock(plane, s, solids));
  }
  return out;
}

/** Kantenstück an- oder abschalten: ein Schalter-Punkt in der Form (Pfad-Koordinaten) kommt dazu oder fällt weg */
export function toggleDock(shape: ZoneShape, edge: DockEdge): void {
  const toPath = (p: Pt): [number, number] => [Math.round(((p.x - shape.x) / shape.sx) * 1000) / 1000, Math.round(((p.y - shape.y) / shape.sy) * 1000) / 1000];
  if (edge.off) {
    const rest = (shape.dockOff ?? []).filter(([x, y]) => distTo(edge.pts, { x: shape.x + shape.sx * x, y: shape.y + shape.sy * y }) > OFF_NEAR);
    if (rest.length) shape.dockOff = rest;
    else delete shape.dockOff;
    return;
  }
  shape.dockOff = [...(shape.dockOff ?? []), toPath(edge.mid)];
}

/**
 * Station der Zone aus ihrem Knoten (Stufe 4): auf der eingeschalteten Andockkante ihrer Ebene an x, die Schienen
 * STATION_RISE darüber, die Tiefe STATION_GAP vor der Ebene; null ohne Knoten oder ohne Kante an der Stelle
 */
export function stationOf(nodes: readonly ZoneNode[]): ZoneStation | null {
  const n = nodes.find(isStationNode);
  const plane = n ? findPlane(nodes, n.parent) : undefined;
  if (!n || !plane || plane.role !== 'play') return null;
  const y = groundAt(dockEdges(nodes, new Set([plane.id])), n.x);
  if (y === null) return null;
  return { id: 'station-ebene', x: plane.x + plane.scale * n.x, y: plane.y + plane.scale * y + STATION_RISE, z: (plane.z - STATION_GAP) / LANE_DEPTH, dir: n.dir, length: n.length };
}

/**
 * Höhe des Bodens unter x auf einer Ebene: die höchste eingeschaltete Andockkante, die x überspannt und höchstens bis
 * maxY reicht (Ebenen-Koordinaten); null, wenn dort keine liegt
 */
export function groundAt(edges: readonly DockEdge[], x: number, maxY = Infinity): number | null {
  let best: number | null = null;
  for (const e of edges) {
    if (e.off) continue;
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const a = e.pts[i];
      const b = e.pts[i + 1];
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo || x > hi || hi - lo < 1e-9) continue;
      const y = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (y <= maxY + 1e-9 && (best === null || y > best)) best = y;
    }
  }
  return best;
}
