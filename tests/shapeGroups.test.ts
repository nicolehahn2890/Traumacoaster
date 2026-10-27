import { describe, expect, it } from 'vitest';
import { cloneNodes, newPlane, newShape, parseNodes, rectPath, serializeNodes, shapesOf, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { copyGroups, expandToUnits, groupShapes, moveUnit, normalizeShapeGroups, ungroupShapes, unitKey, unitsOf } from '@/zone/shapeGroups';

/** eine Ebene mit vier Formen a, b, c, d (hinten nach vorn) */
function scene(): { nodes: ZoneNode[]; a: ZoneShape; b: ZoneShape; c: ZoneShape; d: ZoneShape } {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  const add = (x: number): ZoneShape => {
    const s = newShape(nodes, 'p1', rectPath(2, 2), x, 0, '#445566');
    nodes.push(s);
    return s;
  };
  const [a, b, c, d] = [add(0), add(3), add(6), add(9)];
  return { nodes, a, b, c, d };
}

const order = (nodes: readonly ZoneNode[]): string => shapesOf(nodes, 'p1').map((s) => s.id).join(' ');

describe('Formgruppen', () => {
  it('gruppieren: die Formen rücken zusammen, dorthin, wo die vorderste lag; Tippen wählt die ganze Gruppe', () => {
    const { nodes, a, b, c } = scene();
    expect(order(nodes)).toBe('s1 s2 s3 s4');
    const g = groupShapes(nodes, [a.id, c.id]);
    expect(g).toBe('fg1');
    expect(a.groups).toEqual(['fg1']);
    // b rückt hinter die Gruppe, die Gruppe liegt, wo c lag
    expect(order(nodes)).toBe('s2 s1 s3 s4');
    expect(expandToUnits(nodes, [a.id], [])).toEqual([a.id, c.id]);
    expect(expandToUnits(nodes, [b.id], [])).toEqual([b.id]);
    // im Kontext der Gruppe ist jede Form ihre eigene Einheit
    expect(expandToUnits(nodes, [a.id], ['fg1'])).toEqual([a.id]);
  });

  it('geschachtelt: eine Gruppe mit einer Form gruppieren, hineingehen, auflösen', () => {
    const { nodes, a, b, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    const outer = groupShapes(nodes, [a.id, c.id, b.id])!;
    expect(a.groups).toEqual([outer, 'fg1']);
    expect(b.groups).toEqual([outer]);
    expect(unitKey(a, [])).toBe(outer);
    expect(unitKey(a, [outer])).toBe('fg1');
    expect(unitKey(b, [outer])).toBe(b.id);
    expect(unitsOf(nodes, 'p1', [outer]).map((u) => u.map((s) => s.id).join('+'))).toEqual(['s2', 's1+s3']);
    // äußere Gruppe auflösen: die innere bleibt
    expect(ungroupShapes(nodes, [a.id, b.id, c.id], [])).toBe(1);
    expect(a.groups).toEqual(['fg1']);
    expect(b.groups).toBeUndefined();
  });

  it('aus einer teilweise gewählten Gruppe wird die Form herausgenommen; die Restgruppe mit einer Form fällt weg', () => {
    const { nodes, a, b, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    const g = groupShapes(nodes, [c.id, b.id])!;
    expect(c.groups).toEqual([g]);
    expect(b.groups).toEqual([g]);
    expect(a.groups).toBeUndefined();
  });

  it('eine ganz gewählte Gruppe noch einmal gruppieren ändert nichts', () => {
    const { nodes, a, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    expect(groupShapes(nodes, [a.id, c.id])).toBeNull();
    expect(a.groups).toEqual(['fg1']);
  });

  it('Ordnung: fremde, doppelte und verwaiste Kennungen fallen weg, ebenso eine Gruppe so groß wie ihre Eltern', () => {
    const { nodes, a, b, c, d } = scene();
    a.groups = ['fg1', 'fg2'];
    b.groups = ['fg1', 'fg2'];
    c.groups = ['fg3'];
    d.groups = ['fg4', 'fg4'];
    expect(normalizeShapeGroups(nodes)).toBe(true);
    expect(a.groups).toEqual(['fg1']);
    expect(b.groups).toEqual(['fg1']);
    expect(c.groups).toBeUndefined();
    expect(d.groups).toBeUndefined();
    expect(normalizeShapeGroups(nodes)).toBe(false);
  });

  it('nach vorn und hinten bewegt die Gruppe als Block an der nächsten Einheit vorbei', () => {
    const { nodes, a, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    expect(order(nodes)).toBe('s2 s1 s3 s4');
    expect(moveUnit(nodes, [a.id, c.id], [], 1)).toBe(true);
    expect(order(nodes)).toBe('s2 s4 s1 s3');
    expect(moveUnit(nodes, [a.id, c.id], [], 1)).toBe(false);
    expect(moveUnit(nodes, [a.id, c.id], [], -1)).toBe(true);
    expect(moveUnit(nodes, [a.id, c.id], [], -1)).toBe(true);
    expect(order(nodes)).toBe('s1 s3 s2 s4');
    // nur ein Teil der Gruppe: keine Einheit
    expect(moveUnit(nodes, [a.id], [], 1)).toBe(false);
    expect(moveUnit(nodes, [a.id], ['fg1'], 1)).toBe(true);
    expect(order(nodes)).toBe('s3 s1 s2 s4');
  });

  it('kopieren: eine ganz kopierte Gruppe wird eine eigene, eine teilweise bleibt in der Ebene und fällt in einer anderen weg', () => {
    const { nodes, a, b, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    const whole = (gid: string) => gid === 'fg1';
    const ca = { ...a, id: 'x1' };
    const cc = { ...c, id: 'x2' };
    copyGroups(nodes, [a, c], [ca, cc], true, whole);
    expect(ca.groups).toEqual(['fg2']);
    expect(cc.groups).toEqual(['fg2']);
    const one = { ...a, id: 'x3' };
    copyGroups(nodes, [a], [one], true, () => false);
    expect(one.groups).toEqual(['fg1']);
    const other = { ...a, id: 'x4' };
    copyGroups(nodes, [a], [other], false, () => false);
    expect(other.groups).toBeUndefined();
    expect(b.groups).toBeUndefined();
  });

  it('werden gesichert und tief kopiert', () => {
    const { nodes, a, c } = scene();
    groupShapes(nodes, [a.id, c.id]);
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect((back.find((n) => n.id === a.id) as ZoneShape).groups).toEqual(['fg1']);
    const copy = cloneNodes(nodes);
    (copy.find((n) => n.id === a.id) as ZoneShape).groups!.push('fg9');
    expect(a.groups).toEqual(['fg1']);
  });
});
