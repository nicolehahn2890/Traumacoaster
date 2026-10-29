import { describe, expect, it } from 'vitest';
import { cachedWavyFace, parseWave, serializeWave, waveOffset, wavyFace, WAVE_DEFAULT } from '@/zone/edgeWave';
import { newPlane, newShape, planesOf, rectPath, shapeFaces, type ZoneNode } from '@/zone/nodes';

function area(poly: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

describe('Kantenwelle', () => {
  it('liest und schreibt; der Versatz bleibt unter einem Viertel der Wellenlänge', () => {
    expect(parseWave(JSON.parse(JSON.stringify(serializeWave({ amp: 0.3, len: 4, seed: 2 }))))).toEqual({ amp: 0.3, len: 4, seed: 2 });
    expect(parseWave({ amp: 5, len: 2 })).toMatchObject({ amp: 0.5, len: 2 });
    expect(parseWave(undefined)).toBeUndefined();
  });

  it('der Versatz ist höchstens amp, glatt, und am selben Punkt immer gleich (gemeinsame Kanten bleiben beisammen)', () => {
    const w = { ...WAVE_DEFAULT, amp: 0.3 };
    let max = 0;
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) * 0.7 - 3;
      const y = Math.floor(i / 20) * 0.9 - 4;
      const [dx, dy] = waveOffset(w, x, y);
      max = Math.max(max, Math.abs(dx), Math.abs(dy));
      const [ex, ey] = waveOffset(w, x + 0.01, y);
      expect(Math.hypot(ex - dx, ey - dy)).toBeLessThan(0.02);
    }
    expect(max).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(max).toBeGreaterThan(0.05);
    expect(waveOffset(w, 1.234, -5.6)).toEqual(waveOffset(w, 1.234, -5.6));
  });

  it('eine gewellte Fläche behält ungefähr ihre Größe; geteilte Flächen bleiben lückenlos aneinander', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, planesOf(nodes)[0].id, rectPath(10, 6), 0, 0, '#445566');
    s.cuts = [{ closed: false, path: [{ x: 0, y: -4 }, { x: 0, y: 4 }] }];
    const faces = shapeFaces(s);
    expect(faces).toHaveLength(2);
    const w = { ...WAVE_DEFAULT, amp: 0.25, len: 2 };
    const wavy = faces.map((f) => wavyFace(f, w, 1, 1));
    wavy.forEach((f, i) => expect(Math.abs(area(f.outline) / area(faces[i].outline) - 1)).toBeLessThan(0.1));
    // ein Punkt der Teilungslinie liegt in beiden Flächen und wandert in beiden gleich
    const shared = faces[0].outline.findIndex(([x]) => Math.abs(x) < 1e-6);
    const p = faces[0].outline[shared];
    const j = faces[1].outline.findIndex(([x, y]) => Math.abs(x - p[0]) < 1e-6 && Math.abs(y - p[1]) < 1e-6);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(wavy[1].outline[j]).toEqual(wavy[0].outline[shared]);
    expect(cachedWavyFace(faces[0], w, 1, 1)).toBe(cachedWavyFace(faces[0], w, 1, 1));
  });
});
