import { describe, expect, it } from 'vitest';
import { cutIndexNear, retractIndex } from '@/track/strokeBuffer';
import type { StagePoint } from '@/track/stage';

const line = (n: number, f: (i: number) => [number, number]): StagePoint[] => Array.from({ length: n }, (_, i) => ({ X: f(i)[0], Y: f(i)[1] }));

describe('Strich-Puffer: Zurückziehen und Abschneiden', () => {
  it('radiert den Strich, wenn der Zeiger auf der Linie zurückläuft', () => {
    const s = line(41, (i) => [i * 0.5, 0]); // 0 … 20 m nach rechts
    const keep = retractIndex(s, { X: 15.2, Y: 0.3 }, { X: -1, Y: 0 }, 1.0, 150);
    expect(keep).toBeGreaterThanOrEqual(29);
    expect(keep).toBeLessThanOrEqual(31);
  });
  it('lässt einen Strich stehen, der vorwärts läuft oder seine Linie nur kreuzt', () => {
    const s = line(41, (i) => [i * 0.5, 0]);
    expect(retractIndex(s, { X: 20.4, Y: 0.1 }, { X: 1, Y: 0 }, 1.0, 150)).toBe(-1); // weiter vorwärts
    expect(retractIndex(s, { X: 10, Y: 0.2 }, { X: 0, Y: -1 }, 1.0, 150)).toBe(-1); // quer über die Linie (Looping)
  });
  it('lässt eine Kehre stehen, deren Rückweg eine Spur neben der Anfahrt liegt', () => {
    const s = [...line(41, (i) => [i * 0.5, 0]), ...line(10, (i) => [20 + 2 * Math.sin((Math.PI * i) / 9), 2.1 - 2.1 * Math.cos((Math.PI * i) / 9)])];
    expect(retractIndex(s, { X: 17, Y: 4.2 }, { X: -1, Y: 0 }, 1.0, 150)).toBe(-1);
  });
  it('findet den Scheitel zum Abschneiden', () => {
    const s = [...line(41, (i) => [i * 0.5, 0]), ...line(10, (i) => [20 - i * 0.5, 0.4])];
    const cut = cutIndexNear(s, { x: 20, y: 0.1 }, 4);
    expect(cut).toBe(40);
    expect(cutIndexNear(s, { x: 50, y: 0 }, 4)).toBe(-1);
  });
});
