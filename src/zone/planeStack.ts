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
import { LANE_DEPTH, LANE_MAX, LANE_MIN, rayToWorld, toStage, type StagePoint } from '@/track/stage';
import type { Foundation, FootHit } from '@/world/foundations';
import type { Landing } from '@/track/brushTrack';
import { DOCK_GAP, GROUND_COMFORT, LAND_ABOVE, LAND_BELOW } from './slices';
import { dockEdges, faceMaterial, groundAt, isFirm, type DockEdge } from './dock';
import type { FreeInterval, FreeLanes } from './field';
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
 * der vordersten Ebene in der Luft. Mit dem Freiraumfeld aus Flächen zählen Kanten nur an der Ebene der Bahn und knapp
 * dahinter; vor der Stütze liegende Ebenen tragen sie dort, wo sie im Bild hinter ihrer festen Fläche verschwindet (die
 * Kante, gerade nach hinten verlängert, läge im Bild über der sichtbaren Kante, die Stütze endete sichtbar in der Luft).
 * Der höhere Fuß zählt. Sperrt nichts
 */
export class PlaneFoundation implements Foundation {
  constructor(
    private readonly stack: PlaneStack,
    private readonly field: PlaneField | null = null,
  ) {}

  surfaceBelow(x: number, y: number, z: number): FootHit | null {
    const reach = z + (DOCK_GAP + 0.05) / LANE_DEPTH;
    let foot: number | null = null;
    for (let k = this.stack.planes.length - 1; k >= 0; k--) {
      const sp = this.stack.planes[k];
      if (sp.role !== 'play' || sp.lane > reach || (this.field && sp.lane < z - 1e-6)) continue;
      const qx = (x - sp.plane.x) / sp.plane.scale;
      const qy = (y - sp.plane.y) / sp.plane.scale;
      const g = groundAt(sp.docks, qx, qy);
      if (g !== null) {
        foot = sp.plane.y + sp.plane.scale * g;
        break;
      }
    }
    const behind = this.field?.floorBelow(x, y, z) ?? null;
    if (behind !== null && (foot === null || behind > foot)) foot = behind;
    return foot === null ? null : { y: foot, kind: 'element' };
  }

  blocks(): boolean {
    return false;
  }
}

// ------------------------------------------------------------------ Freiraumfeld aus Flächen (Plan 4.9)

/**
 * Dicke der hintersten Fläche an einer Stelle, hinter der keine Ebene mehr kommt (Meter; Plan 4.9 „oder bis zu einer
 * eingestellten Tiefe“; Platzhalter, bis eine Ebene ihre eigene bekommt)
 */
export const PLANE_THICK = 6;
/** Spurschritt der Abtastung am Strahl (wie im Freiraumfeld der Zone) */
const FIELD_STEP = 0.05;
/** Festes bis zu dieser Höhe (Meter) über der Bahn macht die Stelle zum Tunnel (wie `CEILING` im Freiraumfeld der Zone) */
const PLANE_CEILING = 12;

/**
 * Freiraumfeld aus Flächen (Plan 4.9, „fest und grabbar sind fest, luftig und frei sind frei; die Dicke einer Ebene reicht
 * bis zur nächsten Ebene dahinter oder bis zu einer eingestellten Tiefe“), im Bild gedacht wie „Bild halten“: Fest ist ein
 * Punkt, wenn er im Bild hinter einer festen oder grabbaren Fläche einer spielbaren Ebene liegt, und zwar bis zur nächsten
 * Ebene dahinter, die ihn im Bild deckt (die hinterste höchstens PLANE_THICK); eine Kulisse deckt mit allem Gefüllten bis
 * ganz hinten. Luftig und frei sind frei, Vordergrund und Luft zählen nicht. Die Ebenen sind Blätter: Ein Loch ist darum
 * kein Tunnel, und eine Fläche hat keine Oberseite, die die geneigte Kamera sähe (beides zeigte das Bild nicht). Die Bahn
 * kann so nie verdeckt hinter einer festen Fläche liegen, nur vor ihr oder durch eine Öffnung dahinter.
 *
 * Abfragen wie das Freiraumfeld der Zone (`field.ts`), damit Pinsel, Stützen und Fahrt es ebenso lesen: fester Weltpunkt,
 * freie Tiefen-Abschnitte am Strahl eines Bühnenpunkts, Boden unter einem Punkt, Decke darüber (Tunnel). Seine Wände
 * zählen für den Pinsel wie Erde, ohne den Abstand der Elementwände: Die Bahn liegt schon DOCK_GAP vor ihrer Ebene.
 * Höhlen im Sinn des Zonenfelds (Räume, die anziehen) kennt es nicht; wohin ein Strich in eine Öffnung geht, sagt die
 * Landung (`planeLanding`).
 */
export class PlaneField {
  /** spielbare Ebenen und Kulissen von vorn nach hinten */
  private readonly layers: StackPlane[];
  /** hinterste Spur der Abtastung (die tiefste Andockkante, mindestens die Bühne) */
  private readonly laneMax: number;
  /** nichts Festes in der Zone */
  readonly empty: boolean;

  constructor(stack: PlaneStack) {
    this.layers = stack.planes.filter((sp) => sp.role === 'play' || sp.role === 'backdrop');
    this.laneMax = Math.max(LANE_MAX, (planeDeepestDock(stack) + DOCK_GAP) / LANE_DEPTH);
    this.empty = !this.layers.some((sp) => sp.solids.length || (sp.role === 'backdrop' && sp.filled.length));
  }

  /**
   * Bildpunkt in Tiefe d (Meter) fest? Die hinterste Ebene davor, die ihn deckt, entscheidet; sie reicht bis zur nächsten,
   * die ihn deckt, und nur ohne eine solche höchstens PLANE_THICK
   */
  solidAt(p: StagePoint, d: number): boolean {
    let last: StackPlane | null = null;
    let firm = false;
    let k = 0;
    for (; k < this.layers.length; k++) {
      const sp = this.layers[k];
      if (sp.plane.z > d) break;
      const q = planePoint(sp, p);
      if (!inArea(sp.filled, q.x, q.y)) continue;
      last = sp;
      firm = sp.role === 'backdrop' || inArea(sp.solids, q.x, q.y);
    }
    if (!last || !firm) return false;
    if (last.role === 'backdrop' || d < last.plane.z + PLANE_THICK) return true;
    for (; k < this.layers.length; k++) {
      const q = planePoint(this.layers[k], p);
      if (inArea(this.layers[k].filled, q.x, q.y)) return true;
    }
    return false;
  }

  /** fester Weltpunkt (x, Höhe y, Spur) */
  solid(x: number, y: number, lane: number): boolean {
    return this.solidAt(toStage(x, y, lane), lane * LANE_DEPTH);
  }

  /**
   * freie Tiefen-Abschnitte am Strahl des Bühnenpunkts (Spuren): frei ist eine Spur, wenn der Punkt dort und clearance
   * darunter nicht fest ist (die Bahn hält ihre Mindesthöhe über Festem)
   */
  freeLanes(p: StagePoint, toWorld: (p: StagePoint, lane: number) => { x: number; y: number }, clearance: number): FreeLanes {
    const free = (lane: number): boolean => {
      const w = toWorld(p, lane);
      return !this.solid(w.x, w.y, lane) && !this.solid(w.x, w.y - clearance, lane);
    };
    const intervals: FreeInterval[] = [];
    let cur: FreeInterval | null = null;
    let touched = false;
    const count = Math.round((this.laneMax - LANE_MIN) / FIELD_STEP) + 1;
    for (let k = 0; k < count; k++) {
      const lane = LANE_MIN + k * FIELD_STEP;
      if (!free(lane)) {
        touched = true;
        if (cur) cur.bKind = 'earth';
        cur = null;
        continue;
      }
      if (cur) cur.b = lane;
      else {
        cur = { a: lane, b: lane, aKind: k === 0 ? 'edge' : 'earth', bKind: 'edge', cave: null, attract: false };
        intervals.push(cur);
      }
    }
    // Enden zwischen letzter freier und erster fester Spur genau suchen
    const refine = (freeLane: number, blockedLane: number): number => {
      let f = freeLane;
      let bl = blockedLane;
      for (let k = 0; k < 6; k++) {
        const mid = (f + bl) / 2;
        if (free(mid)) f = mid;
        else bl = mid;
      }
      return f;
    };
    for (const iv of intervals) {
      if (iv.aKind !== 'edge') iv.a = refine(iv.a, iv.a - FIELD_STEP);
      if (iv.bKind !== 'edge') iv.b = refine(iv.b, iv.b + FIELD_STEP);
    }
    return { intervals, fallback: null, touched, below: null };
  }

  /** Oberseite des Festen unter dem Punkt (Höhe), null, wenn bis maxDrop darunter nichts kommt */
  floorBelow(x: number, y: number, lane: number, maxDrop = 80): number | null {
    const step = 0.25;
    let prev = y;
    for (let dd = step; dd <= maxDrop; dd += step) {
      const yy = y - dd;
      if (!this.solid(x, yy, lane)) {
        prev = yy;
        continue;
      }
      let lo = yy;
      let hi = prev;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (this.solid(x, mid, lane)) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    return null;
  }

  /** liegt über dem Punkt (bis maxH Meter) Festes? Dann fährt die Bahn dort im Tunnel */
  ceilingAbove(x: number, y: number, lane: number, maxH = PLANE_CEILING): boolean {
    for (let dd = 0.5; dd <= maxH; dd += 0.5) if (this.solid(x, y + dd, lane)) return true;
    return false;
  }
}
