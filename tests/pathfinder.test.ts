import { describe, expect, it } from 'vitest';
import { ellipsePath, newPlane, newShape, rectPath, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { booleanShapes } from '@/zone/pathfinder';
import { flattenPath, type ZonePath } from '@/zone/path';

function shape(path: ZonePath, x: number, y: number): ZoneShape {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  return newShape(nodes, 'p1', path, x, y, '#445566');
}

/** Fläche eines Pfads (gegen den Uhrzeigersinn positiv), über die Glättung */
function areaOf(path: ZonePath): number {
  const r = flattenPath(path, 0.02);
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return Math.abs(a / 2);
}

describe('Boolesche Operationen (Pathfinder)', () => {
  const a = () => shape(rectPath(4, 4), 0, 0);
  const b = () => shape(rectPath(4, 4), 2, 2);

  it('vereinen, abziehen, Schnittmenge, ausschließen zweier Quadrate', () => {
    const u = booleanShapes([a(), b()], 'unite');
    expect(u.length).toBe(1);
    expect(areaOf(u[0].outline)).toBeCloseTo(28, 2);
    expect(u[0].outline.length).toBe(8);
    const m = booleanShapes([a(), b()], 'minus');
    expect(m.length).toBe(1);
    expect(areaOf(m[0].outline)).toBeCloseTo(12, 2);
    const i = booleanShapes([a(), b()], 'intersect');
    expect(i.length).toBe(1);
    expect(areaOf(i[0].outline)).toBeCloseTo(4, 2);
    expect(i[0].outline.length).toBe(4);
    const x = booleanShapes([a(), b()], 'exclude');
    expect(x.length).toBe(2);
    expect(x.reduce((s, r) => s + areaOf(r.outline), 0)).toBeCloseTo(24, 2);
  });

  it('ein Kreis aus einem Quadrat gestanzt gibt ein Loch mit echten Kurven', () => {
    const sq = shape(rectPath(10, 10), 0, 0);
    const c = shape(ellipsePath(2, 2), 0, 0);
    const r = booleanShapes([sq, c], 'minus');
    expect(r.length).toBe(1);
    expect(r[0].holes.length).toBe(1);
    expect(r[0].holes[0].length).toBe(4);
    expect(r[0].holes[0].some((p) => p.outX || p.inX)).toBe(true);
    expect(areaOf(r[0].outline) - areaOf(r[0].holes[0])).toBeCloseTo(100 - Math.PI * 4, 1);
  });

  it('Kreise vereinen: der Rand ist aus Kurvenstücken, nicht aus einem Vieleck', () => {
    const r = booleanShapes([shape(ellipsePath(3, 3), 0, 0), shape(ellipsePath(3, 3), 4, 0)], 'unite');
    expect(r.length).toBe(1);
    expect(r[0].outline.length).toBeLessThanOrEqual(10);
    expect(r[0].outline.filter((p) => p.outX || p.inX).length).toBeGreaterThan(4);
  });

  it('ohne Überlappung gibt die Schnittmenge nichts', () => {
    expect(booleanShapes([shape(rectPath(2, 2), 0, 0), shape(rectPath(2, 2), 10, 0)], 'intersect')).toEqual([]);
  });
});
