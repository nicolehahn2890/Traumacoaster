import { describe, expect, it } from 'vitest';
import { LANE_DEPTH } from '@/track/stage';
import { dockEdges } from '@/zone/dock';
import { cloneNodes, newPlane, newShape, parseNodes, rectPath, serializeNodes, type ZoneNode, type ZonePlane } from '@/zone/nodes';
import { edgeSpan, nearestOnEdges, planePlayObjects, trackLaneOf } from '@/zone/playObjects';
import { DOCK_GAP } from '@/zone/slices';

/** spielbare Ebene in 8,4 m Tiefe, Maßstab 2, mit einem Rechteck: Oberkante bei y = 5 von x = 15 bis 25 (Ebenen-Koordinaten) */
function scene(): { nodes: ZoneNode[]; plane: ZonePlane } {
  const plane = newPlane([], 8.4);
  plane.scale = 2;
  plane.x = 1;
  plane.y = -3;
  const nodes: ZoneNode[] = [plane];
  nodes.push(newShape(nodes, plane.id, rectPath(10, 4), 20, 3, '#445566'));
  return { nodes, plane };
}

describe('Spielobjekte als Knoten', () => {
  it('Schlange, Baustelle und Coins gehen durch Lesen und Schreiben, Unsinn fällt weg oder wird begrenzt', () => {
    const { nodes, plane } = scene();
    nodes.push(
      { id: 'q1', kind: 'queue', parent: plane.id, x0: 22, x1: 17, dir: -1 },
      { id: 'b1', kind: 'site', parent: plane.id, x: 19, variant: 'breakthrough', energy: 12 },
      { id: 'm1', kind: 'coins', parent: plane.id, x: 20, y: 8, shape: 'arc', count: 7, spacing: 1.5 },
    );
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect(back.find((n) => n.id === 'q1')).toEqual({ id: 'q1', kind: 'queue', parent: plane.id, x0: 17, x1: 22, dir: -1 });
    expect(back.find((n) => n.id === 'b1')).toEqual({ id: 'b1', kind: 'site', parent: plane.id, x: 19, variant: 'breakthrough', energy: 12 });
    expect(back.find((n) => n.id === 'm1')).toEqual({ id: 'm1', kind: 'coins', parent: plane.id, x: 20, y: 8, shape: 'arc', count: 7, spacing: 1.5 });
    const odd = parseNodes([...serializeNodes(nodes.slice(0, 1)), { id: 'm2', kind: 'coins', parent: plane.id, x: 0, y: 0, shape: 'stern', count: 99, spacing: 0 }, { id: 'b2', kind: 'site', parent: 'p9', x: 0 }]);
    expect(odd.find((n) => n.id === 'm2')).toMatchObject({ shape: 'row', count: 40, spacing: 0.5 });
    // ohne ihre Ebene fallen Objekte weg
    expect(odd.some((n) => n.id === 'b2')).toBe(false);
    // die Kopie für den Arbeitsverlauf ist unabhängig
    const copy = cloneNodes(nodes);
    (copy.find((n) => n.id === 'q1') as { x0: number }).x0 = 0;
    expect((nodes.find((n) => n.id === 'q1') as { x0: number }).x0).toBe(22);
  });

  it('in der Welt: auf der Kante, in der Spur der Bahn vor der Ebene; Coins in Metern der Welt um ihren Anker', () => {
    const { nodes, plane } = scene();
    nodes.push(
      { id: 'q1', kind: 'queue', parent: plane.id, x0: 17, x1: 22, dir: 1 },
      { id: 'b1', kind: 'site', parent: plane.id, x: 19, variant: 'breakthrough' },
      { id: 'b2', kind: 'site', parent: plane.id, x: 30, variant: 'connect' },
      { id: 'm1', kind: 'coins', parent: plane.id, x: 20, y: 8, shape: 'row', count: 3, spacing: 2 },
    );
    const lane = (8.4 - DOCK_GAP) / LANE_DEPTH;
    expect(trackLaneOf(plane)).toBeCloseTo(lane, 9);
    const o = planePlayObjects(nodes);
    // Welt = Lage + Maßstab · Ebenen-Koordinate: Kante y = 5 → −3 + 2 · 5 = 7
    expect(o.queues).toEqual([{ id: 'ebene-q1', x0: 35, x1: 45, y: 7, z: lane, dir: 1 }]);
    // b2 steht neben dem Rechteck (keine Kante): fällt weg; Durchbruch ohne Angabe 10 m/s
    expect(o.sites).toEqual([{ id: 'ebene-b1', x: 39, y: 7, z: lane, variant: 'breakthrough', energy: 10 }]);
    expect(o.coins).toEqual([{ id: 'ebene-m1', shape: 'row', x: 41, y: 13, z: lane, count: 3, spacing: 2 }]);
  });

  it('Kulisse trägt nichts: Objekte auf einer nicht spielbaren Ebene fallen weg', () => {
    const { nodes, plane } = scene();
    plane.role = 'backdrop';
    nodes.push({ id: 'b1', kind: 'site', parent: plane.id, x: 19, variant: 'connect' }, { id: 'm1', kind: 'coins', parent: plane.id, x: 20, y: 8, shape: 'row', count: 3, spacing: 2 });
    const o = planePlayObjects(nodes);
    expect(o.sites).toEqual([]);
    expect(o.coins).toEqual([]);
  });

  it('nächster Kantenpunkt und Ausdehnung eines Kantenstücks (Setzen und Ziehen im Editor)', () => {
    const { nodes } = scene();
    const edges = dockEdges(nodes);
    const hit = nearestOnEdges(edges, { x: 18, y: 9 });
    expect(hit?.at.x).toBeCloseTo(18, 6);
    expect(hit?.at.y).toBeCloseTo(5, 6);
    expect(hit?.d).toBeCloseTo(4, 6);
    const span = edgeSpan(edges[0]);
    expect(span.lo).toBeCloseTo(15, 6);
    expect(span.hi).toBeCloseTo(25, 6);
    edges[0].off = true;
    expect(nearestOnEdges(edges, { x: 18, y: 9 })).toBeNull();
  });
});
