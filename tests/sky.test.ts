import { describe, expect, it } from 'vitest';
import { cloudScreenX, cloudScreenY, type SkyView } from '@/render/skyMath';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

describe('Gemeinsamer Himmel (Karte ↔ Level)', () => {
  it('Wolken springen beim Übergang nicht: pro Frame unter 3 px, wenn Blick und Parallaxe weich interpolieren', () => {
    // Karte ruht bei Fokus 1200 Karten-Pixel (x = 240 m, Parallaxe 0,3), Level-Kamera bei x = 48 m, Zoom 14
    const map: SkyView = { x: 240, y: 10, zoom: 12, parallax: 0.3 };
    const cam: SkyView = { x: 48, y: 12, zoom: 14, parallax: 1 };
    const clouds = [0.1, 0.4, 0.7, 0.95].map((depth, i) => ({ x: 300 + i * 500, y: 60 + i * 40, depth }));
    const dur = 1.55;
    const frames = Math.round(dur * 60);
    for (const c of clouds) {
      let prevX = cloudScreenX(c.x, c.depth, map);
      let prevY = cloudScreenY(c.y, c.depth, map);
      for (let f = 1; f <= frames; f++) {
        const p = f / frames;
        const q = smooth((p - 0.2) / 0.7);
        const view: SkyView = { x: lerp(map.x, cam.x, q), y: lerp(map.y, cam.y, q), zoom: lerp(map.zoom, cam.zoom, q), parallax: lerp(0.3, 1, q) };
        const sx = cloudScreenX(c.x, c.depth, view);
        const sy = cloudScreenY(c.y, c.depth, view);
        expect(Math.abs(sx - prevX)).toBeLessThan(3);
        expect(Math.abs(sy - prevY)).toBeLessThan(3);
        prevX = sx;
        prevY = sy;
      }
      // am Ende exakt der Blick der Level-Kamera
      expect(prevX).toBeCloseTo(cloudScreenX(c.x, c.depth, cam), 9);
    }
  });
  it('die Formel wiederholt sich über das Wolkenband, ohne sichtbare Lücke am Rand', () => {
    const view: SkyView = { x: 0, y: 0, zoom: 12 };
    expect(cloudScreenX(100, 0.5, view)).toBe(cloudScreenX(100 + 2600, 0.5, view));
    expect(cloudScreenX(-450, 0.5, view)).toBeGreaterThanOrEqual(-800);
    expect(cloudScreenX(2050, 0.5, view)).toBeLessThanOrEqual(1800);
  });
});
