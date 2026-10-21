import { describe, expect, it } from 'vitest';
import { approach } from '@/render/measureOverlay';

describe('Maßband: weiches Nachlaufen', () => {
  it('nähert sich dem Ziel unabhängig von der Framerate gleich schnell', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 10, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 10, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(9.99);
  });
  it('bleibt auf dem Ziel, wenn es erreicht ist, und läuft nie darüber hinaus', () => {
    expect(approach(5, 5, 0.1)).toBe(5);
    let v = 0;
    for (let i = 0; i < 20; i++) {
      v = approach(v, 3, 0.05);
      expect(v).toBeLessThanOrEqual(3);
    }
  });
});
