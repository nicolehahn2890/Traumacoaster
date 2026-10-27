/**
 * Tiefe aus Ebenen (Zonen-Editor, Stufe 4; Plan 4.9): Der Pinsel liest seine Tiefe aus den Ebenen des Editors, mit den
 * Regeln, die die Kamerasession für den Scheibenstapel gefunden hat (`src/zone/slices.ts`: landen statt kleben,
 * Bodenhöhe, Höhlen gehen vor, Stützen auf der Kante davor). Statt eines Höhenbands je Scheibe zählen die Andockkanten
 * (`src/zone/dock.ts`): Oberkanten fester und grabbarer Flächen spielbarer Ebenen, je Kantenstück abschaltbar.
 *
 * - **Rollen:** spielbar trägt; Kulisse verdeckt (dahinter landet nichts); Vordergrund und Luft sind für den Pinsel
 *   durchsichtig (Büsche vor der Bahn).
 * - **Höhle:** Liegt der Strichpunkt auf einer spielbaren Ebene in einer Öffnung (Loch oder freie Fläche innerhalb einer
 *   Form) und verdeckt dahinter eine spielbare Ebene den Punkt, landet die Bahn dort, wie in der Höhlenrückwand der
 *   Kamerasession.
 * - **Tiefe:** Die Bahn liegt DOCK_GAP vor der Ebene, an der sie andockt. Ebenen-Tiefe z (Meter) = Spur · LANE_DEPTH.
 *
 * Ohne Renderer und DOM; Weltpunkte kommen über `rayToWorld` aus der Bühne, Ebenen-Punkte über Lage und Maßstab der Ebene.
 */
import { LANE_DEPTH, rayToWorld, type StagePoint } from '@/track/stage';
import type { Foundation, FootHit } from '@/world/foundations';
import type { Landing } from '@/track/brushTrack';
import { DOCK_GAP, GROUND_COMFORT, LAND_ABOVE, LAND_BELOW } from './slices';
import { dockEdges, faceMaterial, groundAt, isFirm, type DockEdge } from './dock';
import { flattenPath, insideWithHoles, type Poly } from './path';
import { facePaint, FLATTEN_STEP, planeHidden, planesOf, shapeFaces, shapesOf, type PlaneRole, type ZoneNode, type ZonePlane, type ZoneShape } from './nodes';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Area {
  outline: Poly;
  holes: Poly[];
  box: Box;
}

interface StackPlane {
  plane: ZonePlane;
  /** Tiefe in Spuren */
  lane: number;
  role: PlaneRole;
  /** feste und grabbare Flächen (verdecken und tragen), in Ebenen-Koordinaten */
  solids: Area[];
  /** alle gefüllten Flächen außer freien (verdecken für die Höhlen-Prüfung) */
  filled: Area[];
  /** Umrisse der Formen mit Löchern oder freien Flächen (eine Öffnung darin ist ein Höhlenmund) */
  shells: Area[];
  /** eingeschaltete Andockkanten */
  docks: DockEdge[];
}

export interface PlaneStack {
  /** sichtbare Ebenen von vorn nach hinten */
  planes: StackPlane[];
}

const boxOf = (poly: Poly): Box => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of poly) {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
};

const inBox = (b: Box, x: number, y: number): boolean => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
const inArea = (areas: readonly Area[], x: number, y: number): boolean => areas.some((a) => inBox(a.box, x, y) && insideWithHoles(a.outline, a.holes, x, y));

/** Fläche einer Form in Ebenen-Koordinaten */
function toPlane(s: ZoneShape, poly: Poly): Poly {
  return poly.map(([x, y]) => [s.x + s.sx * x, s.y + s.sy * y]);
}

/** Stapel aus den Ebenen (null ohne spielbare Ebene): Flächen, Öffnungen und Andockkanten je Ebene */
export function buildPlaneStack(nodes: readonly ZoneNode[]): PlaneStack | null {
  const planes: StackPlane[] = [];
  const docks = dockEdges(nodes);
  for (const plane of planesOf(nodes)) {
    if (planeHidden(nodes, plane)) continue;
    const solids: Area[] = [];
    const filled: Area[] = [];
    const shells: Area[] = [];
    for (const s of shapesOf(nodes, plane.id)) {
      if (s.hidden) continue;
      const faces = shapeFaces(s);
      let opening = !!s.holes?.length;
      for (const f of faces) {
        const paint = facePaint(s, f);
        const m = faceMaterial(s, f);
        if (paint.fill === null || m === 'free') {
          opening = true;
          continue;
        }
        const outline = toPlane(s, f.outline);
        const area = { outline, holes: f.holes.map((h) => toPlane(s, h)), box: boxOf(outline) };
        filled.push(area);
        if (isFirm(m)) solids.push(area);
      }
      // eine Form mit Loch oder freier Fläche: innerhalb ihres Umrisses ist eine Öffnung ein Höhlenmund
      if (opening) {
        const outline = toPlane(s, flattenPath(s.path, FLATTEN_STEP));
        if (outline.length >= 3) shells.push({ outline, holes: [], box: boxOf(outline) });
      }
    }
    planes.push({ plane, lane: plane.z / LANE_DEPTH, role: plane.role, solids, filled, shells, docks: docks.filter((d) => d.plane === plane.id && !d.off) });
  }
  return planes.some((p) => p.role === 'play') ? { planes } : null;
}

/** Ebenen-Punkt einer Ebene zum Strichpunkt (Strahl der Kamera durch den Bildpunkt auf die Tiefe der Ebene) */
function planePoint(sp: StackPlane, p: StagePoint): { x: number; y: number } {
  const w = rayToWorld(p, sp.lane);
  return { x: (w.x - sp.plane.x) / sp.plane.scale, y: (w.y - sp.plane.y) / sp.plane.scale };
}

/** Tiefe (Meter) der Bahn vor einer Ebene */
const dockDepth = (sp: StackPlane): number => sp.lane * LANE_DEPTH - DOCK_GAP;

/** durchsichtig für den Pinsel: Vordergrund und Luft */
const seeThrough = (sp: StackPlane): boolean => sp.role === 'front' || sp.role === 'air';

/** Oberkante über einem Punkt in der Fläche (die niedrigste Andockkante, die ihn überspannt und über ihm liegt) */
function edgeAbove(docks: readonly DockEdge[], x: number, y: number): number | null {
  let best: number | null = null;
  for (const e of docks)
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const a = e.pts[i];
      const b = e.pts[i + 1];
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo || x > hi || hi - lo < 1e-9) continue;
      const ey = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (ey >= y - 1e-9 && (best === null || ey < best)) best = ey;
    }
  return best;
}

/**
 * Landung (wie `landingAt` der Scheiben): durch eine Höhlenöffnung gezeichnet die Ebene dahinter (Vorrang); sonst von
 * vorn nach hinten die erste Ebene, auf deren Fläche der Punkt knapp unter der Oberkante liegt (LAND_BELOW) oder über der
 * er knapp über einer Andockkante schwebt (LAND_ABOVE); mitten auf einer Fläche, über einer Kulisse oder in der Luft null
 */
export function planeLanding(stack: PlaneStack, p: StagePoint): Landing | null {
  const at = (k: number, off: number): Landing => ({ z: dockDepth(stack.planes[k]), id: k, off });
  // Höhle: erst eine Öffnung in einer spielbaren Ebene, dann die nächste spielbare Ebene, die den Punkt verdeckt
  let opening = false;
  for (const [k, sp] of stack.planes.entries()) {
    if (seeThrough(sp)) continue;
    const q = planePoint(sp, p);
    if (inArea(sp.filled, q.x, q.y)) {
      if (opening && sp.role === 'play' && inArea(sp.solids, q.x, q.y)) return { ...at(k, 0), cave: true };
      break;
    }
    if (sp.role === 'play' && inArea(sp.shells, q.x, q.y)) opening = true;
  }
  for (const [k, sp] of stack.planes.entries()) {
    if (seeThrough(sp)) continue;
    const q = planePoint(sp, p);
    const scale = sp.plane.scale;
    if (inArea(sp.filled, q.x, q.y)) {
      if (sp.role !== 'play' || !inArea(sp.solids, q.x, q.y)) return null;
      const top = edgeAbove(sp.docks, q.x, q.y);
      return top !== null && (top - q.y) * scale <= LAND_BELOW ? at(k, (q.y - top) * scale) : null;
    }
    if (sp.role !== 'play') continue;
    // knapp über einer Andockkante; über unruhigen Kanten zählt die Hüllkurve der Nachbarn (wie über Baumspitzen)
    let env: number | null = null;
    for (const dx of [0, -2.5, -1.25, 1.25, 2.5]) {
      const g = groundAt(sp.docks, q.x + dx / scale, q.y);
      if (g !== null && (env === null || g > env)) env = g;
    }
    if (env !== null && (q.y - env) * scale <= LAND_ABOVE) return at(k, (q.y - env) * scale);
  }
  return null;
}

/**
 * Bodenhöhe aus den Ebenen (wie `groundDepth` der Scheiben, Florians Modus „Ebenen: Bodenhöhe“): Wunschtiefe ist die
 * Tiefe, in der der Strichpunkt GROUND_COMFORT über der Oberkante liegt; zwischen den zwei Ebenen, wo er sie
 * unterschreitet, gemittelt. Über allen Kanten die hinterste, unter allen die vorderste
 */
export function planeGroundDepth(stack: PlaneStack, p: StagePoint): number {
  let prev: { d: number; h: number } | null = null;
  for (const sp of stack.planes) {
    if (sp.role !== 'play') continue;
    const q = planePoint(sp, p);
    const top = groundAt(sp.docks, q.x);
    if (top === null) continue;
    const d = dockDepth(sp);
    const h = (q.y - top) * sp.plane.scale;
    if (h < GROUND_COMFORT) {
      if (!prev) return d;
      return prev.d + ((d - prev.d) * (prev.h - GROUND_COMFORT)) / Math.max(1e-6, prev.h - h);
    }
    prev = { d, h };
  }
  return prev ? prev.d : 0;
}

/** tiefste Tiefe (Meter), an der die Bahn andocken kann */
export function planeDeepestDock(stack: PlaneStack): number {
  let d = -Infinity;
  for (const sp of stack.planes) if (sp.role === 'play' && sp.docks.length) d = Math.max(d, dockDepth(sp));
  return Number.isFinite(d) ? d : 0;
}

/**
 * Fundament (wie `SliceFoundation`): der Fuß steht auf der Andockkante der hintersten spielbaren Ebene, an der die Bahn
 * andockt oder die vor ihr liegt, und die unter dem Anschlusspunkt eine Kante hat; die Kante verdeckt ihn. Anders als im
 * dichten Scheibenstapel zählt auch die Ebene, an der die Bahn andockt (DOCK_GAP dahinter), sonst stünde eine Bahn auf
 * der vordersten Ebene in der Luft. Sperrt nichts
 */
export class PlaneFoundation implements Foundation {
  constructor(private readonly stack: PlaneStack) {}

  surfaceBelow(x: number, y: number, z: number): FootHit | null {
    const reach = z + (DOCK_GAP + 0.05) / LANE_DEPTH;
    for (let k = this.stack.planes.length - 1; k >= 0; k--) {
      const sp = this.stack.planes[k];
      if (sp.role !== 'play' || sp.lane > reach) continue;
      const qx = (x - sp.plane.x) / sp.plane.scale;
      const qy = (y - sp.plane.y) / sp.plane.scale;
      const g = groundAt(sp.docks, qx, qy);
      if (g !== null) return { y: sp.plane.y + sp.plane.scale * g, kind: 'element' };
    }
    return null;
  }

  blocks(): boolean {
    return false;
  }
}
