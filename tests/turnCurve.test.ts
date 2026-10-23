import { describe, expect, it } from 'vitest';
import { turnForwardExtent, turnLength, turnPoint, turnThetaForRetreat } from '@/track/turnCurve';

describe('Wendeform mit Übergangsbögen', () => {
  it('dreht um 180°, versetzt um D und kommt in x auf die Einfahrt zurück', () => {
    const D = 8.4;
    const end = turnPoint(Math.PI, D);
    expect(Math.abs(end.u)).toBeLessThan(0.05);
    expect(end.w).toBeCloseTo(D, 3);
    expect(turnPoint(0, D).u).toBeCloseTo(0, 6);
    expect(turnForwardExtent(D)).toBeGreaterThan(D / 2);
    expect(turnForwardExtent(D)).toBeLessThan(0.75 * D);
    expect(turnLength(D)).toBeGreaterThan((Math.PI * D) / 2);
  });
  it('beginnt und endet ohne Krümmung (weiche Querkraft) und ist in der Mitte am engsten', () => {
    const D = 8.4;
    const pts: Array<{ u: number; w: number }> = [];
    const N = 400;
    for (let k = 0; k <= N; k++) pts.push(turnPoint((Math.PI * k) / N, D));
    const curv = (k: number): number => {
      const a = pts[k - 1];
      const b = pts[k];
      const c = pts[k + 1];
      const d1 = Math.hypot(b.u - a.u, b.w - a.w);
      const d2 = Math.hypot(c.u - b.u, c.w - b.w);
      const h1 = Math.atan2(b.w - a.w, b.u - a.u);
      const h2 = Math.atan2(c.w - b.w, c.u - b.u);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      return Math.abs(dh) / ((d1 + d2) / 2);
    };
    expect(curv(2)).toBeLessThan(curv(N / 2) * 0.25);
    expect(curv(N - 2)).toBeLessThan(curv(N / 2) * 0.25);
    expect(curv(N / 2)).toBeGreaterThan(1 / (D / 2));
  });
  it('findet den Winkel zum Rückweg', () => {
    const D = 8.4;
    expect(turnThetaForRetreat(D, turnForwardExtent(D))).toBeCloseTo(Math.PI, 3);
    const th = turnThetaForRetreat(D, 1.5);
    expect(th).toBeGreaterThan(Math.PI / 2);
    expect(th).toBeLessThan(Math.PI);
    expect(turnPoint(th, D).u).toBeCloseTo(turnForwardExtent(D) - 1.5, 2);
  });
});
