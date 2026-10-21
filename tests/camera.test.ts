import { describe, expect, it } from 'vitest';
import { Camera } from '@/render/camera';

describe('Kamera-Wackeln', () => {
  it('klingt in der angegebenen Dauer ab und lässt keinen Versatz zurück', () => {
    const cam = new Camera();
    cam.shake(0.6, 0.3);
    let maxOff = 0;
    for (let i = 0; i < 10; i++) {
      cam.update(0.02);
      maxOff = Math.max(maxOff, Math.hypot(cam.ox, cam.oy));
    }
    expect(maxOff).toBeGreaterThan(0.05);
    expect(maxOff).toBeLessThanOrEqual(0.6 * Math.SQRT2 + 1e-9);
    for (let i = 0; i < 10; i++) cam.update(0.02);
    expect(cam.ox).toBe(0);
    expect(cam.oy).toBe(0);
  });
  it('ein stärkeres Wackeln überschreibt ein schwächeres, ein schwächeres nicht das laufende starke', () => {
    const cam = new Camera();
    cam.shake(0.2, 0.3);
    cam.shake(0.8, 0.3);
    cam.update(0.01);
    const strong = Math.hypot(cam.ox, cam.oy);
    const cam2 = new Camera();
    cam2.shake(0.8, 0.3);
    cam2.shake(0.2, 0.3);
    cam2.update(0.01);
    expect(Math.hypot(cam2.ox, cam2.oy)).toBeCloseTo(strong, 6);
  });
});
