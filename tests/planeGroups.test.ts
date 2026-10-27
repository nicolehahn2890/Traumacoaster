import { describe, expect, it } from 'vitest';
import { cloneNodes, findGroup, groupMembers, newPlane, newShape, parseNodes, planeHidden, planeLocked, planesOf, rectPath, serializeNodes, type ZoneNode, type ZonePlane } from '@/zone/nodes';
import { depthLimits, groupPlanes, listEntries, normalizeGroups, reorderPlanes, ungroup } from '@/zone/planeGroups';
import { PlaneLayer } from '@/world/planeMesh';

/** sechs Ebenen bei 0, 2, 4, 6, 8, 10 m; B, C, D in einer Gruppe */
function stack(): { nodes: ZoneNode[]; P: Record<string, ZonePlane>; g: string } {
  let nodes: ZoneNode[] = [];
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  names.forEach((n, i) => nodes.push(newPlane(nodes, i * 2, n)));
  const P = Object.fromEntries(planesOf(nodes).map((p) => [p.name, p]));
  const g = groupPlanes(nodes, [P.B.id, P.C.id, P.D.id], null, 'Mitte')!;
  nodes = normalizeGroups(nodes);
  return { nodes, P, g: g.id };
}

const names = (nodes: ZoneNode[]) => planesOf(nodes).map((p) => p.name).join('');

describe('Ebenen-Gruppen', () => {
  it('werden gesichert und gelesen, die Liste zeigt die Kopfzeile vor der ersten Ebene', () => {
    const { nodes, g } = stack();
    const again = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect(JSON.stringify(serializeNodes(again))).toBe(JSON.stringify(serializeNodes(nodes)));
    expect(JSON.stringify(serializeNodes(cloneNodes(nodes)))).toBe(JSON.stringify(serializeNodes(nodes)));
    const list = listEntries(again).map((e) => (e.kind === 'group' ? `[${e.group.name}]` : e.plane.name)).join(' ');
    expect(list).toBe('A [Mitte] B C D E F');
    expect(groupMembers(again, g).map((p) => p.name)).toEqual(['B', 'C', 'D']);
  });

  it('Ausblenden und Sperren der Gruppe gelten für ihre Ebenen, auch im Spiel', () => {
    const { nodes, P, g } = stack();
    const grp = findGroup(nodes, g)!;
    grp.hidden = true;
    grp.locked = true;
    expect(planeHidden(nodes, P.C)).toBe(true);
    expect(planeLocked(nodes, P.C)).toBe(true);
    expect(planeHidden(nodes, P.A)).toBe(false);
    nodes.push(newShape(nodes, P.C.id, rectPath(4, 4), 0, 0, '#445566'), newShape(nodes, P.A.id, rectPath(4, 4), 0, 0, '#445566'));
    const layer = new PlaneLayer();
    layer.build(nodes);
    expect(layer.stats.shapes).toBe(1);
  });

  it('aufräumen: eine abgerissene Ebene verlässt die Gruppe, eine leere Gruppe fällt weg', () => {
    const { nodes, P, g } = stack();
    P.D.z = 9;
    const n2 = normalizeGroups(nodes);
    expect(groupMembers(n2, g).map((p) => p.name)).toEqual(['B', 'C']);
    const n3 = normalizeGroups(ungroup(n2, g));
    expect(n3.some((n) => n.kind === 'group')).toBe(false);
    expect(planesOf(n3).every((p) => !p.group)).toBe(true);
  });

  it('Tiefe schieben endet vor der nächsten Ebene einer anderen Gruppe', () => {
    const { nodes, P } = stack();
    // A (ohne Gruppe) kommt nicht in die Gruppe hinein
    expect(depthLimits(nodes, [P.A.id]).max).toBeCloseTo(1.99, 6);
    // C kann innerhalb der Gruppe wandern, aber nicht an E vorbei
    const c = depthLimits(nodes, [P.C.id]);
    expect(c.max).toBeCloseTo(3.99, 6);
    expect(c.min).toBeCloseTo(-3.99, 6);
    // die ganze Gruppe zusammen: bis vor E und bis hinter A
    const all = depthLimits(nodes, [P.B.id, P.C.id, P.D.id]);
    expect(all.max).toBeCloseTo(1.99, 6);
    expect(all.min).toBeCloseTo(-1.99, 6);
  });

  it('Umordnen: in eine Gruppe hinein, aus ihr heraus, eine ganze Gruppe behält ihre Abstände', () => {
    const { nodes, P, g } = stack();
    expect(reorderPlanes(nodes, [P.F.id], P.C.id, g, null)).toBe(true);
    expect(names(nodes)).toBe('ABFCDE');
    expect(P.F.group).toBe(g);
    expect(P.F.z).toBeCloseTo(3, 6);
    expect(reorderPlanes(nodes, [P.F.id], null, null, null)).toBe(true);
    expect(names(nodes)).toBe('ABCDEF');
    expect(P.F.group).toBeUndefined();
    // die ganze Gruppe hinter E: Abstände 2 m bleiben
    const members = groupMembers(nodes, g).map((p) => p.id);
    expect(reorderPlanes(nodes, members, P.F.id, g, null)).toBe(true);
    expect(names(nodes)).toBe('AEBCDF');
    expect(P.C.z - P.B.z).toBeCloseTo(2, 6);
    expect(P.D.z - P.C.z).toBeCloseTo(2, 6);
    expect(P.B.z).toBeGreaterThan(P.E.z);
    expect(P.D.z).toBeLessThan(P.F.z);
    // unverändert: nichts zu tun
    expect(reorderPlanes(nodes, [P.A.id], P.E.id, null, null)).toBe(false);
  });

  it('Gruppieren nicht benachbarter Ebenen holt sie hinter die vorderste', () => {
    let nodes: ZoneNode[] = [];
    ['A', 'B', 'C', 'D'].forEach((n, i) => nodes.push(newPlane(nodes, i * 2, n)));
    const P = Object.fromEntries(planesOf(nodes).map((p) => [p.name, p]));
    const g = groupPlanes(nodes, [P.A.id, P.C.id], null)!;
    nodes = normalizeGroups(nodes);
    expect(names(nodes)).toBe('ACBD');
    expect(groupMembers(nodes, g.id).map((p) => p.name)).toEqual(['A', 'C']);
  });
});
