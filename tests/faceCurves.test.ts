import { describe, expect, it } from 'vitest';
import { faceCurves } from '@/zone/faceCurves';
import { ellipsePath, newPlane, newShape, rectPath, shapeFaces, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { flattenPath, type Poly, type ZonePath } from '@/zone/path';

function shape(path: ZonePath): ZoneShape {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  return newShape(nodes, 'p1', path, 0, 0, '#445566');
}

/** Abstand eines Punkts zum Rand eines Polygons */
function distToRing(ring: Poly, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return best;
}

/** die Kurven liegen auf dem Rand der Fläche und umgekehrt (bis auf die Glättung) */
function expectSameRing(curve: ZonePath, ring: Poly, tol: number): void {
  const flat = flattenPath(curve, 0.05);
  for (const [x, y] of flat) expect(distToRing(ring, x, y)).toBeLessThan(tol);
  for (const [x, y] of ring) expect(distToRing(flat, x, y)).toBeLessThan(tol);
}

describe('Flächen als Kurven (SVG-Export)', () => {
  it('ein Rechteck mit gerader Teilungslinie: zwei Flächen mit je vier geraden Ecken', () => {
    const s = shape(rectPath(20, 10));
    s.cuts = [{ path: [{ x: -10, y: 1 }, { x: 10, y: -1 }], closed: false }];
    const faces = shapeFaces(s);
    expect(faces.length).toBe(2);
    for (const f of faces) {
      const c = faceCurves(s, f);
      expect(c.outline.length).toBe(4);
      expect(c.outline.every((p) => !p.inX && !p.outX && !p.inY && !p.outY)).toBe(true);
      expectSameRing(c.outline, f.outline, 0.003);
    }
  });

  it('eine Ellipse mit gerader Teilungslinie: Bogen mit Griffen und eine gerade Kante, wenige Anker', () => {
    const s = shape(ellipsePath(10, 6));
    s.cuts = [{ path: [{ x: -12, y: 2 }, { x: 12, y: 2 }], closed: false }];
    const faces = shapeFaces(s);
    expect(faces.length).toBe(2);
    for (const f of faces) {
      const c = faceCurves(s, f);
      expect(c.outline.length).toBeLessThanOrEqual(5);
      expect(c.outline.some((p) => p.outX || p.inX)).toBe(true);
      // Kreuzungen liegen auf Sehnen der Glättung: die Kurve weicht dort um deren Pfeilhöhe ab (unter 1 cm)
      expectSameRing(c.outline, f.outline, 0.012);
    }
  });

  it('ein Ring in einer Form: die Innenfläche ist der Ring, die äußere Fläche hat ihn als Loch', () => {
    const s = shape(rectPath(20, 20));
    s.cuts = [{ path: ellipsePath(4, 4), closed: true }];
    const faces = shapeFaces(s);
    expect(faces.length).toBe(2);
    const inner = faces.find((f) => !f.holes.length)!;
    const outer = faces.find((f) => f.holes.length)!;
    const ci = faceCurves(s, inner);
    expect(ci.outline.length).toBe(4);
    expectSameRing(ci.outline, inner.outline, 0.012);
    const co = faceCurves(s, outer);
    expect(co.outline.length).toBe(4);
    expect(co.holes.length).toBe(1);
    expect(co.holes[0].length).toBe(4);
    expectSameRing(co.holes[0], outer.holes[0], 0.012);
  });

  it('eine gebogene Teilungslinie bleibt eine Kurve mit ihren Griffen', () => {
    const s = shape(rectPath(20, 10));
    s.cuts = [{ path: [{ x: -10, y: 0 }, { x: 0, y: -3, inX: -4, inY: 0, outX: 4, outY: 0 }, { x: 10, y: 0 }], closed: false }];
    const faces = shapeFaces(s);
    expect(faces.length).toBe(2);
    for (const f of faces) {
      const c = faceCurves(s, f);
      expect(c.outline.length).toBeLessThanOrEqual(6);
      expect(c.outline.some((p) => p.outX || p.inX)).toBe(true);
      expectSameRing(c.outline, f.outline, 0.012);
    }
  });
});
