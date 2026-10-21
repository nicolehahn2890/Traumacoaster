import { describe, expect, it } from 'vitest';
import { unfoldAngle, unfoldLift, unfoldSquash, unfoldStart } from '@/render/unfold';
import { LANE_MAX, LANE_MIN } from '@/track/stage';

describe('Aufklappen der Spurstreifen', () => {
  it('ist je Spur monoton, beginnt hinten zuerst (rund 60 ms Versatz bei 1,55 s) und endet bei π/2', () => {
    for (let z = LANE_MIN; z <= LANE_MAX; z++) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const a = unfoldAngle(z, i / 100);
        expect(a).toBeGreaterThanOrEqual(prev);
        prev = a;
      }
      expect(unfoldAngle(z, 0)).toBe(0);
      expect(unfoldAngle(z, 1)).toBeCloseTo(Math.PI / 2, 9);
    }
    const stagger = (unfoldStart(LANE_MAX - 1) - unfoldStart(LANE_MAX)) * 1.55;
    expect(stagger).toBeGreaterThan(0.05);
    expect(stagger).toBeLessThan(0.07);
    expect(unfoldStart(LANE_MIN)).toBeGreaterThan(unfoldStart(LANE_MAX));
  });
  it('hebt die Streifen zwischendurch ab und legt sie am Ende wieder deckungsgleich auf das Level', () => {
    expect(unfoldLift(LANE_MAX, 0)).toBe(0);
    expect(unfoldLift(LANE_MAX, 1)).toBe(0);
    expect(unfoldLift(LANE_MIN, 0.5)).toBe(0); // vorderste Spur bleibt am Boden
    expect(unfoldLift(LANE_MAX, 0.5)).toBeGreaterThan(1);
    expect(unfoldSquash(LANE_MAX, 0)).toBeCloseTo(0.9, 9);
    expect(unfoldSquash(LANE_MAX, 1)).toBeCloseTo(1, 9);
  });
});
