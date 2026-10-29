/**
 * Spielobjekte auf den Ebenen (Zonen-Editor, Stufe 4; Plan 4.9 „Sie stehen auf Andockkanten einer Ebene statt auf einer
 * Spur“): Schlange, Baustelle und Coin-Gruppe als Knoten einer spielbaren Ebene, hier in die Einträge der Zonendatei
 * umgerechnet (`ZoneQueue`, `ZoneSite`, `ZoneCoinGroup` in Metern der Welt und Spuren), die Spiel und Welt schon kennen.
 * Höhe und Tiefe folgen aus der Kante und der Ebene wie bei der Station (`stationOf` in dock.ts): Die Bahn liegt
 * DOCK_GAP vor der Ebene, Schlange und Baustelle stehen auf der eingeschalteten Andockkante, Coins schweben in der Tiefe
 * der Bahn. Ohne Renderer und DOM.
 */
import { LANE_DEPTH } from '@/track/stage';
import { dockEdges, groundAt, type DockEdge, type Pt } from './dock';
import type { ZoneCoinGroup } from './groups';
import { findPlane, isCoinNode, isQueueNode, isSiteNode, type ZoneNode, type ZonePlane } from './nodes';
import { DOCK_GAP } from './slices';
import type { ZoneQueue, ZoneSite } from './types';

/** Spur der Bahn vor einer Ebene */
export const trackLaneOf = (plane: ZonePlane): number => (plane.z - DOCK_GAP) / LANE_DEPTH;

/** Andockkanten je Ebene, einmal gerechnet */
function edgesByPlane(nodes: readonly ZoneNode[]): Map<string, DockEdge[]> {
  const out = new Map<string, DockEdge[]>();
  for (const e of dockEdges(nodes)) {
    const list = out.get(e.plane);
    if (list) list.push(e);
    else out.set(e.plane, [e]);
  }
  return out;
}

/** spielbare Ebene eines Objekts, sonst undefined */
function playPlane(nodes: readonly ZoneNode[], id: string): ZonePlane | undefined {
  const p = findPlane(nodes, id);
  return p && p.role === 'play' ? p : undefined;
}

/** Schlangen der Ebenen als Einträge der Zone; ohne Kante unter der Mitte fällt eine weg */
export function planeQueues(nodes: readonly ZoneNode[], edges = edgesByPlane(nodes)): ZoneQueue[] {
  const out: ZoneQueue[] = [];
  for (const q of nodes.filter(isQueueNode)) {
    const plane = playPlane(nodes, q.parent);
    const y = plane ? groundAt(edges.get(plane.id) ?? [], (q.x0 + q.x1) / 2) : null;
    if (!plane || y === null) continue;
    out.push({ id: `ebene-${q.id}`, x0: plane.x + plane.scale * q.x0, x1: plane.x + plane.scale * q.x1, y: plane.y + plane.scale * y, z: trackLaneOf(plane), dir: q.dir });
  }
  return out;
}

/** Baustellen der Ebenen als Einträge der Zone (Anschlusspunkt auf der Kante, Spur der Bahn) */
export function planeSites(nodes: readonly ZoneNode[], edges = edgesByPlane(nodes)): ZoneSite[] {
  const out: ZoneSite[] = [];
  for (const b of nodes.filter(isSiteNode)) {
    const plane = playPlane(nodes, b.parent);
    const y = plane ? groundAt(edges.get(plane.id) ?? [], b.x) : null;
    if (!plane || y === null) continue;
    const site: ZoneSite = { id: `ebene-${b.id}`, x: plane.x + plane.scale * b.x, y: plane.y + plane.scale * y, z: trackLaneOf(plane), variant: b.variant };
    if (b.variant === 'breakthrough') site.energy = b.energy ?? 10;
    out.push(site);
  }
  return out;
}

/** Coin-Gruppen der Ebenen als Einträge der Zone (Anker in der Welt, Spur der Bahn vor der Ebene) */
export function planeCoinGroups(nodes: readonly ZoneNode[]): ZoneCoinGroup[] {
  const out: ZoneCoinGroup[] = [];
  for (const c of nodes.filter(isCoinNode)) {
    const plane = playPlane(nodes, c.parent);
    if (!plane) continue;
    out.push({ id: `ebene-${c.id}`, shape: c.shape, x: plane.x + plane.scale * c.x, y: plane.y + plane.scale * c.y, z: trackLaneOf(plane), count: c.count, spacing: c.spacing });
  }
  return out;
}

/** alle Spielobjekte der Ebenen außer der Station, mit einmal gerechneten Kanten */
export function planePlayObjects(nodes: readonly ZoneNode[]): { queues: ZoneQueue[]; sites: ZoneSite[]; coins: ZoneCoinGroup[] } {
  const edges = edgesByPlane(nodes);
  return { queues: planeQueues(nodes, edges), sites: planeSites(nodes, edges), coins: planeCoinGroups(nodes) };
}

/**
 * Nächster Punkt einer eingeschalteten Andockkante zu einem Punkt der Ebene (Ebenen-Koordinaten), mit Abstand; null ohne
 * Kante. Für das Setzen und Ziehen von Objekten im Editor (dort in Bildschirm-Abständen gewählt)
 */
export function nearestOnEdges(edges: readonly DockEdge[], p: Pt): { edge: DockEdge; at: Pt; d: number } | null {
  let best: { edge: DockEdge; at: Pt; d: number } | null = null;
  for (const e of edges) {
    if (e.off) continue;
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const a = e.pts[i];
      const b = e.pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      const at = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (!best || d < best.d) best = { edge: e, at, d };
    }
  }
  return best;
}

/** waagrechte Ausdehnung eines Kantenstücks (Ebenen-Koordinaten), damit eine Schlange auf ihm bleibt */
export function edgeSpan(edge: DockEdge): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of edge.pts) {
    lo = Math.min(lo, p.x);
    hi = Math.max(hi, p.x);
  }
  return { lo, hi };
}
