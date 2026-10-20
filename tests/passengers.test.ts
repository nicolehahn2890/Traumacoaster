import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics, PassengerSim } from '@/physics/passengers';
import { Terrain } from '@/physics/terrain';
import type { CarState } from '@/physics/trainSim';
import { G } from '@/physics/trainSim';

const terrain = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const car = (feltUp: number, feltFwd = 0, gLat = 0): CarState => ({
  index: 0, s: 0, x: 10, y: 5, z: 0, tx: 1, ty: 0, tz: 0, upx: 0, upy: 1, upz: 0, sx: 0, sy: 0, sz: 1, bank: 0, angle: 0,
  gSeat: feltUp / G, gFwd: feltFwd / G, gLat, feltFwd, feltUp, feltSide: gLat * G, inTunnel: false, inverted: false,
});

describe('Fahrgäste (Rapier)', () => {
  beforeAll(async () => {
    await initPhysics();
  });
  it('bleiben bei 1 g im Wagen sitzen', () => {
    const sim = new PassengerSim({ cars: 1, perCar: 2, gravityScale: 1, terrain, sideEjectG: 2.5 });
    const c = car(G);
    for (let i = 0; i < 180; i++) sim.step([c], 1 / 60, 10, false);
    expect(sim.allSeated).toBe(true);
    for (const v of sim.views) {
      expect(v.parts.torso.y).toBeGreaterThan(0.1);
      expect(v.parts.torso.y).toBeLessThan(0.8);
    }
    sim.dispose();
  });
  it('fliegen bei starker negativer g aus dem Wagen', () => {
    const sim = new PassengerSim({ cars: 1, perCar: 2, gravityScale: 1, terrain, sideEjectG: 2.5 });
    let ejected = 0;
    sim.onEject = () => ejected++;
    const normal = car(G);
    const airtime = car(-1.5 * G);
    for (let i = 0; i < 30; i++) sim.step([normal], 1 / 60, 10, false);
    for (let i = 0; i < 240; i++) sim.step([airtime], 1 / 60, 15, false);
    expect(ejected).toBeGreaterThan(0);
    expect(sim.allSeated).toBe(false);
    for (let i = 0; i < 600; i++) sim.step([normal], 1 / 60, 15, false);
    const v = sim.views.find((p) => p.ejected)!;
    expect(v.parts.torso.y).toBeLessThan(6);
    sim.dispose();
  });
  it('kippen bei zu hoher Querkraft über die Bordwand', () => {
    const sim = new PassengerSim({ cars: 1, perCar: 1, gravityScale: 1, terrain, sideEjectG: 2.5 });
    let side = false;
    sim.onEject = (_p, s) => (side = s);
    for (let i = 0; i < 60; i++) sim.step([car(G, 0, 3.2)], 1 / 60, 20, false);
    expect(side).toBe(true);
    sim.dispose();
  });
});
