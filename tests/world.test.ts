import { afterEach, describe, expect, it } from 'vitest';
import { WorldCamera } from '@/world/camera';
import { Camera } from '@/render/camera';
import { LANE_MAX, LANE_MIN, rayToWorld, setPerspective, setView, tagRay, toStage, toView, viewDistance, viewScale } from '@/track/stage';

/** deterministische Zufallszahlen */
function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Bühnenkamera (Pixel je Meter um das Ziel) wie die Weltansicht */
function stageCamera(cx: number, cy: number, zoom: number, w: number, h: number): Camera {
  const c = new Camera();
  c.resize(w, h);
  c.set(cx, cy, zoom);
  c.snap();
  return c;
}

afterEach(() => setPerspective(false));

describe('Weltrenderer: 100-Punkte-Test (Richtlinie 2.1, Paket 1)', () => {
  it('Bühne: die geneigte Ortho-Kamera der Welt trifft die Bühnenformel Y = y + 0,5·Tiefe auf 100 Punkten', () => {
    const r = lcg(11);
    const world = new WorldCamera();
    for (let k = 0; k < 5; k++) {
      const cx = r() * 200;
      const cy = r() * 30 - 5;
      const zoom = 3 + r() * 40;
      const w = 600 + Math.round(r() * 800);
      const h = 400 + Math.round(r() * 600);
      const stage = stageCamera(cx, cy, zoom, w, h);
      world.set({ cx, cy, zoom, width: w, height: h, persp: false, fov: 18 });
      for (let i = 0; i < 20; i++) {
        const x = r() * 240 - 20;
        const y = r() * 40 - 5;
        const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
        const s = toStage(x, y, z);
        const a = stage.toScreen(s.X, s.Y);
        const b = world.toScreen(x, y, z);
        expect(b.x).toBeCloseTo(a.x, 4);
        expect(b.y).toBeCloseTo(a.y, 4);
      }
    }
  });

  it('Perspektive 18°: die Three-Kamera projiziert wie toView, und der Strahl aus dem Bild führt zurück (100 Punkte)', () => {
    const r = lcg(23);
    const world = new WorldCamera();
    setPerspective(true, 18);
    for (let k = 0; k < 5; k++) {
      const cx = r() * 200;
      const cy = r() * 30 - 5;
      const zoom = 3 + r() * 40;
      const w = 600 + Math.round(r() * 800);
      const h = 400 + Math.round(r() * 600);
      const stage = stageCamera(cx, cy, zoom, w, h);
      setView(cx, cy, viewDistance(zoom, h, 18));
      world.set({ cx, cy, zoom, width: w, height: h, persp: true, fov: 18 });
      for (let i = 0; i < 20; i++) {
        const x = r() * 240 - 20;
        const y = r() * 40 - 5;
        const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
        // Bild der Welt = Bild der Bühnen-Ansicht
        const v = toView(x, y, z);
        const a = stage.toScreen(v.X, v.Y);
        const b = world.toScreen(x, y, z);
        expect(b.x).toBeCloseTo(a.x, 4);
        expect(b.y).toBeCloseTo(a.y, 4);
        // Strahl durch diesen Bildpunkt auf der Spur z trifft wieder den Weltpunkt: die Bahn liegt auf dem Strich
        const wpt = rayToWorld(tagRay(stage.toStage(b.x, b.y)), z);
        expect(wpt.x).toBeCloseTo(x, 6);
        expect(wpt.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('Perspektive: Spurmaßstab wie im Tiefen-Labor (22° bei 8 px/m: Spur −2 8,76 px/m, Spur +2 7,36 px/m)', () => {
    const world = new WorldCamera();
    const cx = 90;
    const cy = 8;
    setPerspective(true, 22);
    setView(cx, cy, viewDistance(8, 540, 22));
    world.set({ cx, cy, zoom: 8, width: 1170, height: 540, persp: true, fov: 22 });
    for (const lane of [-2, 0, 2]) {
      const o = world.toScreen(cx, cy, lane);
      const ox = world.toScreen(cx + 1, cy, lane);
      const oy = world.toScreen(cx, cy + 1, lane);
      // waagerechter Meter auf Zielhöhe: genau der Container-Maßstab; der senkrechte Meter ist dank Streckung am Ziel
      // gleich lang und auf den anderen Spuren bis auf wenige Prozent (er liegt im Bild über oder unter dem Ziel)
      expect(Math.hypot(ox.x - o.x, ox.y - o.y)).toBeCloseTo(8 * viewScale(lane), 6);
      const vertical = Math.hypot(oy.x - o.x, oy.y - o.y);
      // auch am Ziel liegt das obere Ende des Meters der Kamera etwas näher: ein Viertelprozent
      if (lane === 0) expect(Math.abs(vertical - 8)).toBeLessThan(0.05);
      else expect(Math.abs(vertical / (8 * viewScale(lane)) - 1)).toBeLessThan(0.03);
    }
    expect(8 * viewScale(-2)).toBeCloseTo(8.76, 1);
    expect(8 * viewScale(2)).toBeCloseTo(7.36, 1);
    // Zoom als Kamerafahrt: näher heran, stärkere Perspektive (Spur −2 gegen Spur +2)
    const spread = (zoom: number): number => {
      setView(cx, cy, viewDistance(zoom, 540, 22));
      world.set({ cx, cy, zoom, width: 1170, height: 540, persp: true, fov: 22 });
      const a = world.toScreen(cx + 10, cy, -2).x - world.toScreen(cx, cy, -2).x;
      const b = world.toScreen(cx + 10, cy, 2).x - world.toScreen(cx, cy, 2).x;
      return a / b;
    };
    expect(spread(14)).toBeGreaterThan(spread(7));
  });

  it('Bühne gegen Perspektive: die Perspektive verschiebt ferne Punkte um Pixel, nahe am Ziel kaum (Labor 2.2)', () => {
    const world = new WorldCamera();
    const cx = 90;
    const cy = 8;
    const stage = stageCamera(cx, cy, 8, 1170, 540);
    world.set({ cx, cy, zoom: 8, width: 1170, height: 540, persp: true, fov: 22 });
    let maxFar = 0;
    let maxNear = 0;
    const r = lcg(5);
    for (let i = 0; i < 100; i++) {
      const far = i < 50;
      const x = cx + (far ? (r() - 0.5) * 200 : (r() - 0.5) * 10);
      const y = cy + (far ? (r() - 0.5) * 40 : (r() - 0.5) * 4);
      const z = far ? LANE_MIN + r() * (LANE_MAX - LANE_MIN) : (r() - 0.5) * 0.2;
      const s = toStage(x, y, z);
      const a = stage.toScreen(s.X, s.Y);
      const b = world.toScreen(x, y, z);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (far) maxFar = Math.max(maxFar, d);
      else maxNear = Math.max(maxNear, d);
    }
    expect(maxFar).toBeGreaterThan(10);
    expect(maxFar).toBeLessThan(90);
    expect(maxNear).toBeLessThan(1.5);
  });
});
