import { describe, expect, it } from 'vitest';
import { FlightSim } from '@/physics/flightSim';
import { Terrain } from '@/physics/terrain';
import { G, type CarState } from '@/physics/trainSim';

const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] });
const lake = new Terrain({ width: 200, terrain: [{ kind: 'flat' }, { kind: 'lake', x: 60, width: 30 }] });

const car = (x: number, y: number, vx: number, vy: number, index = 0): CarState => ({
  index, s: 0, x, y, z: 0, tx: 1, ty: 0, tz: 0, upx: 0, upy: 1, upz: 0, sx: 0, sy: 0, sz: 1, bank: 0, angle: 0,
  gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: G, feltSide: 0, inTunnel: false, inverted: false, vx, vy,
});

const run = (sim: FlightSim, seconds: number, each?: () => void) => {
  const h = 1 / 120;
  for (let i = 0; i < seconds * 120; i++) {
    sim.step(h);
    each?.();
  }
};

describe('Freiflug (FlightSim)', () => {
  it('fliegt hoch über dem Boden eine Wurfparabel', () => {
    const sim = new FlightSim([car(0, 60, 10, 5)], { terrain: flat, gravity: 1, carLength: 2.4, kind: 'launch', side: 1 });
    const b = sim.bodies[0];
    run(sim, 0.5);
    expect(b.y).toBeGreaterThan(60.8); // steigt noch (5 m/s − g·t)
    expect(b.vy).toBeLessThan(0.6);
    run(sim, 1.5);
    // nach 2 s: y ≈ 60 + 5·2 − ½·g·4 (der Luftwiderstand bremst leicht), x ≈ 20 abzüglich Widerstand
    expect(b.y).toBeGreaterThan(46);
    expect(b.y).toBeLessThan(55);
    expect(b.x).toBeGreaterThan(14);
    expect(b.x).toBeLessThan(20.5);
    expect(b.onGround).toBe(false);
    expect(sim.impacts).toHaveLength(0);
    expect(sim.settled).toBe(false);
  });

  it('landet, meldet den Aufprall und kommt ohne Durchfallen zur Ruhe', () => {
    const sim = new FlightSim([car(20, 8, 6, 0)], { terrain: flat, gravity: 1, carLength: 2.4, kind: 'fall', side: 1 });
    const b = sim.bodies[0];
    let minY = Infinity;
    run(sim, 5, () => (minY = Math.min(minY, b.y)));
    expect(sim.impacts.length).toBeGreaterThanOrEqual(1);
    expect(sim.impacts[0].speed).toBeGreaterThan(8); // Fall aus 8 m
    expect(sim.impacts[0].water).toBe(false);
    expect(minY).toBeGreaterThan(0.2); // die Achse bleibt über dem Boden (Ecken liegen 0,3 m darunter)
    expect(sim.settled).toBe(true);
    expect(b.onGround).toBe(true);
    expect(Math.abs(b.angle)).toBeLessThan(0.2); // liegt flach auf ebenem Boden
  });

  it('hält die Wagen an der Kette zusammen', () => {
    const cars = [car(30, 12, 8, 2, 0), car(27.6, 12.4, 8, 2, 1), car(25.2, 12.8, 8, 2, 2)];
    const sim = new FlightSim(cars, { terrain: flat, gravity: 1, carLength: 2.4, kind: 'derail', side: 1 });
    let minD = Infinity;
    let maxD = 0;
    run(sim, 6, () => {
      for (let i = 0; i + 1 < sim.bodies.length; i++) {
        const a = sim.bodies[i];
        const c = sim.bodies[i + 1];
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        minD = Math.min(minD, d);
        maxD = Math.max(maxD, d);
      }
    });
    expect(minD).toBeGreaterThan(1.8);
    expect(maxD).toBeLessThan(3.2);
    expect(sim.settled).toBe(true);
  });

  it('kippt beim Entgleisen zur Seite und driftet aus der Spur', () => {
    const sim = new FlightSim([car(10, 30, 15, 0)], { terrain: flat, gravity: 1, carLength: 2.4, kind: 'derail', side: -1 });
    run(sim, 2);
    const b = sim.bodies[0];
    expect(b.bank).toBeCloseTo(-Math.PI / 2, 2); // voll zur Seite gekippt (Anschlag)
    expect(b.z).toBeCloseTo(-0.5, 1); // 0,25 Spuren pro Sekunde weg von der Kamera
    const out: CarState[] = [car(0, 0, 0, 0)];
    sim.writeTo(out);
    const c = out[0];
    expect(Math.hypot(c.upx, c.upy, c.upz)).toBeCloseTo(1, 6);
    expect(Math.hypot(c.sx, c.sy, c.sz)).toBeCloseTo(1, 6);
    expect(Math.abs(c.upz)).toBeGreaterThan(0.99); // "oben" zeigt jetzt in die Tiefe
    expect(c.gLat).toBe(0);
    expect(c.x).toBeCloseTo(b.x, 9);
    expect(c.z).toBeCloseTo(b.z, 9);
  });

  it('platscht im See und wird dort stark gebremst', () => {
    const sim = new FlightSim([car(60, 10, 3, 0)], { terrain: lake, gravity: 1, carLength: 2.4, kind: 'launch', side: 1 });
    run(sim, 3);
    expect(sim.impacts.some((i) => i.water)).toBe(true);
    const b = sim.bodies[0];
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(1);
    expect(b.y).toBeLessThan(0.5); // liegt im Wasser
  });
});
