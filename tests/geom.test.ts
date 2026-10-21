import { describe, expect, it } from 'vitest';
import { insetPolygon, selfIntersects, signedArea } from '@/render/geom';
import { buildStrip } from '@/render/stripMesh';

describe('Inset-Polygon (Konturbänder)', () => {
  it('versetzt eine Hügel-Silhouette nach innen, ohne Selbstschnitte, mit kleinerer Fläche', () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = i * 2;
      pts.push({ x, y: 8 * Math.sin((Math.PI * i) / 40) + 2 * Math.sin(i * 0.7) });
    }
    pts.push({ x: 80, y: -2 }, { x: 0, y: -2 });
    const a0 = Math.abs(signedArea(pts));
    for (const d of [1, 2, 3]) {
      const inner = insetPolygon(pts, d);
      expect(inner.length).toBeGreaterThan(10);
      expect(selfIntersects(inner)).toBe(false);
      expect(Math.abs(signedArea(inner))).toBeLessThan(a0);
    }
  });
  it('liefert bei zu großem Abstand kein kaputtes Polygon', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    const inner = insetPolygon(square, 1);
    expect(inner).toHaveLength(4);
    expect(Math.abs(signedArea(inner))).toBeCloseTo(4, 6);
    const gone = insetPolygon(square, 3);
    expect(gone.length === 0 || !selfIntersects(gone)).toBe(true);
  });
});

describe('Band-Mesh', () => {
  it('erzeugt 2n Punkte, UV.x wächst mit der Bogenlänge, Normalen stehen senkrecht', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }, { x: 30, y: 5 }];
    const g = buildStrip(pts, 0.5, 0.25);
    expect(g.positions.length).toBe(pts.length * 4);
    expect(g.indices.length).toBe((pts.length - 1) * 6);
    for (let i = 1; i < pts.length; i++) expect(g.uvs[i * 4]).toBeGreaterThan(g.uvs[(i - 1) * 4]);
    expect(g.uvs[4]).toBeCloseTo(2.5, 6); // 10 m · 0,25
    // erstes Segment waagerecht: links/rechts liegen genau über/unter dem Punkt
    expect(g.positions[0]).toBeCloseTo(0, 6);
    expect(Math.abs(g.positions[1])).toBeCloseTo(0.5, 6);
    expect(g.positions[2]).toBeCloseTo(0, 6);
    expect(g.positions[1]).toBeCloseTo(-g.positions[3], 6);
  });
  it('variable Breite folgt der Bogenlänge', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const g = buildStrip(pts, (s) => 1 + s * 0.1, 1);
    expect(Math.abs(g.positions[1])).toBeCloseTo(1, 6);
    expect(Math.abs(g.positions[9])).toBeCloseTo(2, 6);
  });
});
