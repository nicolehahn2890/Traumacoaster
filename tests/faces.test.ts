import { describe, expect, it } from 'vitest';
import { computeFaces, faceAt, innerPoint } from '@/zone/faces';
import { flattenPath, type Poly } from '@/zone/path';
import { ellipsePath } from '@/zone/nodes';

const square = (s: number, x = 0, y = 0): Poly => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];
const total = (faces: { area: number }[]): number => faces.reduce((a, f) => a + f.area, 0);

describe('Flächen aus Linien (Vektornetz)', () => {
  it('ohne Linien ist die Form eine Fläche', () => {
    const f = computeFaces(square(10), [], []);
    expect(f.length).toBe(1);
    expect(f[0].area).toBeCloseTo(100, 6);
  });

  it('eine Linie von Kante zu Kante teilt die Form in zwei Flächen', () => {
    const f = computeFaces(square(10), [], [{ poly: [[0, 4], [10, 4]], closed: false }]);
    expect(f.length).toBe(2);
    expect(f.map((x) => Math.round(x.area)).sort((a, b) => a - b)).toEqual([40, 60]);
  });

  it('eine Linie, die über die Kanten hinausragt, teilt genauso', () => {
    const f = computeFaces(square(10), [], [{ poly: [[-3, 2], [5, 6], [13, 9]], closed: false }]);
    expect(f.length).toBe(2);
    expect(total(f)).toBeCloseTo(100, 3);
  });

  it('eine Linie, die knapp (2 cm) vor der Kante endet, rastet ein und teilt', () => {
    const f = computeFaces(square(10), [], [{ poly: [[0.02, 5], [9.98, 5]], closed: false }]);
    expect(f.length).toBe(2);
  });

  it('eine Linie, deren Enden genau auf schrägen Kanten liegen (wie der Zeichenstift sie einrasten lässt), teilt', () => {
    // Trapez wie ein Rechteck im geneigten Spielblick; die Enden liegen auf den Kanten bis auf Rundung im Millimeter
    const trap: Poly = [[-28.425, 17.886], [28.519, 17.886], [28.719, -17.892], [-28.726, -17.892]];
    const f = computeFaces(trap, [], [{ poly: [[-28.569, 0.785], [0.013, -6.375], [28.631, -2.077]], closed: false }]);
    expect(f.length).toBe(2);
    expect(total(f)).toBeCloseTo(computeFaces(trap, [], [])[0].area, 1);
  });

  it('eine Linie mitten in der Fläche, die nichts umschließt, ändert nichts', () => {
    const f = computeFaces(square(10), [], [{ poly: [[3, 3], [7, 6]], closed: false }]);
    expect(f.length).toBe(1);
    expect(f[0].area).toBeCloseTo(100, 3);
  });

  it('ein geschlossener Ring macht eine Innenfläche, die äußere Fläche bekommt ein Loch', () => {
    const ring = flattenPath(ellipsePath(2, 2)).map(([x, y]) => [x + 5, y + 5] as [number, number]);
    const f = computeFaces(square(10), [], [{ poly: ring, closed: true }]);
    expect(f.length).toBe(2);
    const inner = f.reduce((a, b) => (a.area < b.area ? a : b));
    const outer = f.reduce((a, b) => (a.area > b.area ? a : b));
    expect(inner.area).toBeCloseTo(Math.PI * 4, 0);
    expect(outer.holes.length).toBe(1);
    expect(total(f)).toBeCloseTo(100, 2);
    // der Punkt in der Mitte gehört zur Innenfläche, der Punkt am Rand zur äußeren
    expect(f[faceAt(f, 5, 5)]).toBe(inner);
    expect(f[faceAt(f, 0.5, 0.5)]).toBe(outer);
  });

  it('Florians Bild 2: Umriss, eine Teilungslinie oben und zwei Ringe der Höhle ergeben vier Flächen', () => {
    const outline: Poly = [
      [0, 0],
      [30, 0],
      [30, 14],
      [0, 14],
    ];
    const band: Poly = [
      [-1, 11],
      [12, 12],
      [31, 11.5],
    ];
    const ringA = flattenPath(ellipsePath(6, 4)).map(([x, y]) => [x + 15, y + 5] as [number, number]);
    const ringB = flattenPath(ellipsePath(4.5, 2.8)).map(([x, y]) => [x + 15, y + 5] as [number, number]);
    const f = computeFaces(outline, [], [
      { poly: band, closed: false },
      { poly: ringA, closed: true },
      { poly: ringB, closed: true },
    ]);
    expect(f.length).toBe(4);
    expect(total(f)).toBeCloseTo(30 * 14, 1);
    // Rand oben, Vorderfläche (mit Loch), Höhlenrand (Ring, mit Loch), Höhleninneres
    expect(f.filter((x) => x.holes.length === 1).length).toBe(2);
  });

  it('zwei kreuzende Linien ergeben vier Flächen', () => {
    const f = computeFaces(square(10), [], [
      { poly: [[0, 5], [10, 5]], closed: false },
      { poly: [[5, 0], [5, 10]], closed: false },
    ]);
    expect(f.length).toBe(4);
    for (const x of f) expect(x.area).toBeCloseTo(25, 3);
  });

  it('ein Loch der Form bleibt Loch, eine Linie durch das Loch teilt nur die Fläche drumherum', () => {
    const hole = square(2, 4, 4);
    const f = computeFaces(square(10), [hole], [{ poly: [[0, 5], [10, 5]], closed: false }]);
    expect(f.length).toBe(2);
    expect(total(f)).toBeCloseTo(100 - 4, 2);
    expect(faceAt(f, 5, 5)).toBe(-1);
  });

  it('der innere Punkt liegt auch in schmalen, gebogenen Bändern innen', () => {
    // C-förmiges Band: der Schwerpunkt läge außerhalb
    const c: Poly = [
      [0, 0],
      [10, 0],
      [10, 1],
      [1, 1],
      [1, 9],
      [10, 9],
      [10, 10],
      [0, 10],
    ];
    const [x, y] = innerPoint(c, []);
    expect(computeFaces(c, [], []).length).toBe(1);
    expect(faceAt(computeFaces(c, [], []), x, y)).toBe(0);
  });
});
