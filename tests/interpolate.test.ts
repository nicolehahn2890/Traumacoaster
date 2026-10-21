import { describe, expect, it } from 'vitest';
import { lerpAngle, lerpCar, lerpParts } from '@/physics/interpolate';
import { emptyParts } from '@/physics/passengers';
import type { CarState } from '@/physics/trainSim';

const car = (over: Partial<CarState>): CarState => ({
  index: 0, s: 0, x: 0, y: 0, z: 0, tx: 1, ty: 0, tz: 0, upx: 0, upy: 1, upz: 0, sx: 0, sy: 0, sz: 1, bank: 0, angle: 0,
  gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: 9.81, feltSide: 0, inTunnel: false, inverted: false, vx: 0, vy: 0, ...over,
});

describe('Interpolation der Physik-Zustände', () => {
  it('interpoliert Winkel auf dem kürzesten Weg über ±π', () => {
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 9);
    // von 170° nach −170° geht es über 180°, nicht über 0°
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    const m = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.atan2(Math.sin(m - Math.PI), Math.cos(m - Math.PI)))).toBeLessThan(1e-9);
  });
  it('liefert bei t = 0 den alten und bei t = 1 den neuen Wagenzustand', () => {
    const a = car({ x: 10, y: 2, z: 0, tx: 1, ty: 0, bank: 0.1, gSeat: 1.2, inverted: false });
    const b = car({ x: 12, y: 3, z: 0.5, tx: 0.6, ty: 0.8, bank: 0.3, gSeat: 0.4, inverted: true, s: 7 });
    const out = car({});
    lerpCar(a, b, 0, out);
    expect(out.x).toBe(10);
    expect(out.bank).toBeCloseTo(0.1, 9);
    expect(out.inverted).toBe(true); // Flags kommen immer aus dem neuen Zustand
    lerpCar(a, b, 1, out);
    expect(out.x).toBe(12);
    expect(out.z).toBe(0.5);
    expect(out.gSeat).toBeCloseTo(0.4, 9);
    expect(out.s).toBe(7);
  });
  it('hält den Rahmen normiert', () => {
    const a = car({ tx: 1, ty: 0, tz: 0 });
    const b = car({ tx: 0, ty: 1, tz: 0 });
    const out = car({});
    lerpCar(a, b, 0.5, out);
    expect(Math.hypot(out.tx, out.ty, out.tz)).toBeCloseTo(1, 9);
    expect(out.tx).toBeCloseTo(Math.SQRT1_2, 9);
  });
  it('interpoliert alle Teile der Fahrgäste', () => {
    const a = emptyParts();
    const b = emptyParts();
    b.head.x = 2;
    b.head.y = 4;
    b.head.angle = 1;
    const out = emptyParts();
    lerpParts(a, b, 0.25, out);
    expect(out.head.x).toBeCloseTo(0.5, 9);
    expect(out.head.y).toBeCloseTo(1, 9);
    expect(out.head.angle).toBeCloseTo(0.25, 9);
    expect(out.torso.x).toBe(0);
  });
});
