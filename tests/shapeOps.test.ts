import { describe, expect, it } from 'vitest';
import { cloneNodes, faceFill, newPlane, newShape, rectPath, shapeBounds, shapeFaces, shapeToPlane, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { alignShapes, distributeShapes, rotateShape } from '@/zone/shapeOps';

function shape(w: number, h: number, x: number, y: number): ZoneShape {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  return newShape(nodes, 'p1', rectPath(w, h), x, y, '#445566');
}

describe('Formen umformen', () => {
  it('drehen um 90° um die Mitte: Ecken, Maßstab, Linien und Füllpunkte drehen mit', () => {
    const s = shape(4, 2, 10, 5);
    s.sx = 2;
    s.cuts = [{ path: [{ x: 0, y: -1 }, { x: 0, y: 1 }], closed: false }];
    const right = shapeFaces(s).find((f) => f.inner[0] > 0)!;
    s.regions = [{ x: right.inner[0], y: right.inner[1], fill: '#ff0000' }];
    const orig = cloneNodes([s])[0] as ZoneShape;
    rotateShape(s, orig, { x: 10, y: 5 }, Math.PI / 2);
    const b = shapeBounds(s);
    // 8 × 2 m wird 2 × 8 m um dieselbe Mitte
    expect(b.maxX - b.minX).toBeCloseTo(2, 3);
    expect(b.maxY - b.minY).toBeCloseTo(8, 3);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(10, 3);
    expect(s.sx).toBe(1);
    // die rote Fläche lag rechts, jetzt oben
    const red = shapeFaces(s).find((f) => faceFill(s, f) === '#ff0000')!;
    expect(shapeToPlane(s, red.inner[0], red.inner[1]).y).toBeGreaterThan(5);
    // zurück auf 0: genau wie vorher
    rotateShape(s, orig, { x: 10, y: 5 }, 0);
    expect(JSON.stringify(s)).toBe(JSON.stringify(orig));
  });

  it('drehen um einen fremden Punkt verschiebt auch die Lage', () => {
    const s = shape(2, 2, 10, 0);
    const orig = cloneNodes([s])[0] as ZoneShape;
    rotateShape(s, orig, { x: 0, y: 0 }, Math.PI);
    expect(s.x).toBeCloseTo(-10, 6);
    expect(s.y).toBeCloseTo(0, 6);
  });

  it('ausrichten und verteilen am gemeinsamen Rahmen', () => {
    const a = shape(2, 2, 0, 0);
    const b = shape(4, 2, 10, 3);
    const c = shape(2, 6, 4, -2);
    alignShapes([a, b, c], 'left');
    expect([a, b, c].map((s) => shapeBounds(s).minX)).toEqual([-1, -1, -1]);
    alignShapes([a, b, c], 'top');
    expect([a, b, c].map((s) => shapeBounds(s).maxY)).toEqual([4, 4, 4]);
    a.x = 0;
    b.x = 3;
    c.x = 10;
    distributeShapes([c, a, b], 'x');
    const mids = [a, b, c].map((s) => (shapeBounds(s).minX + shapeBounds(s).maxX) / 2);
    expect(mids[1] - mids[0]).toBeCloseTo(mids[2] - mids[1], 6);
  });
});
