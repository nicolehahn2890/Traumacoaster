import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics, PassengerSim } from '@/physics/passengers';
import { Terrain } from '@/physics/terrain';
import type { CarState } from '@/physics/trainSim';
import { G } from '@/physics/trainSim';

const terrain = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const car = (feltUp: number, feltFwd = 0, gLat = 0): CarState => ({
  index: 0, s: 0, x: 10, y: 5, z: 0, tx: 1, ty: 0, tz: 0, upx: 0, upy: 1, upz: 0, sx: 0, sy: 0, sz: 1, bank: 0, angle: 0,
  gSeat: feltUp / G, gFwd: feltFwd / G, gLat, feltFwd, feltUp, feltSide: gLat * G, inTunnel: false, inverted: false, vx: 10, vy: 0,
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
  it('wirft beim Aufprall alle Fahrgäste des Wagens raus, die anderen sitzen weiter', () => {
    const sim = new PassengerSim({ cars: 2, perCar: 2, gravityScale: 1, terrain, sideEjectG: 2.5 });
    const cars: CarState[] = [car(G), { ...car(G), index: 1, x: 7.6 }];
    for (let i = 0; i < 30; i++) sim.step(cars, 1 / 60, 10, false);
    const n = sim.ejectCar(1, cars, 8);
    expect(n).toBe(2);
    expect(sim.ejectCar(1, cars, 8)).toBe(0); // schon draußen
    expect(sim.views.filter((v) => v.ejected).map((v) => v.car)).toEqual([1, 1]);
    expect(sim.allSeated).toBe(false);
    for (let i = 0; i < 30; i++) sim.step(cars, 1 / 60, 10, true);
    expect(sim.views.filter((v) => v.car === 0).every((v) => !v.ejected)).toBe(true);
    // der Schubs nach oben wächst mit der Aufprallgeschwindigkeit (hier 4,7 m/s): nach 0,5 s sind die Puppen über dem Wagen
    for (const v of sim.views.filter((p) => p.ejected)) expect(v.parts.torso.y).toBeGreaterThan(cars[1].y + 0.5);
    sim.dispose();
  });
  it('Beckengurt hält bei −0,5 g, reißt bei −1,2 g (danach Rauswurf)', () => {
    const hold = new PassengerSim({ cars: 1, perCar: 2, gravityScale: 1, terrain, belt: 1 });
    let snapped = 0;
    hold.onBeltSnap = () => snapped++;
    for (let i = 0; i < 30; i++) hold.step([car(G)], 1 / 60, 10, false);
    for (let i = 0; i < 240; i++) hold.step([car(-0.5 * G)], 1 / 60, 15, false);
    expect(snapped).toBe(0);
    expect(hold.allSeated).toBe(true);
    for (const v of hold.views) expect(v.beltBroken).toBe(false);
    hold.dispose();
    const snap = new PassengerSim({ cars: 1, perCar: 2, gravityScale: 1, terrain, belt: 1 });
    snap.onBeltSnap = () => snapped++;
    let ejected = 0;
    snap.onEject = () => ejected++;
    for (let i = 0; i < 30; i++) snap.step([car(G)], 1 / 60, 10, false);
    for (let i = 0; i < 240; i++) snap.step([car(-1.2 * G)], 1 / 60, 15, false);
    expect(snapped).toBeGreaterThan(0);
    expect(ejected).toBeGreaterThan(0);
    expect(snap.stats.ejected).toBe(ejected);
    snap.dispose();
  });
  it('Schulterbügel hält auch −2,5 g', () => {
    const sim = new PassengerSim({ cars: 1, perCar: 2, gravityScale: 1, terrain, belt: 3 });
    let snapped = 0;
    sim.onBeltSnap = () => snapped++;
    for (let i = 0; i < 30; i++) sim.step([car(G)], 1 / 60, 10, false);
    for (let i = 0; i < 240; i++) sim.step([car(-2.5 * G)], 1 / 60, 15, false);
    expect(snapped).toBe(0);
    expect(sim.allSeated).toBe(true);
    sim.dispose();
  });
  it('seitlich 2,6 g: mit Bügel (Grenze 2,8 g) bleibt man sitzen, mit Beckengurt (2,2 g) kippt man', () => {
    const bar = new PassengerSim({ cars: 1, perCar: 1, gravityScale: 1, terrain, belt: 2 });
    for (let i = 0; i < 60; i++) bar.step([car(G, 0, 2.6)], 1 / 60, 20, false);
    expect(bar.allSeated).toBe(true);
    bar.dispose();
    const lap = new PassengerSim({ cars: 1, perCar: 1, gravityScale: 1, terrain, belt: 1 });
    let side = false;
    lap.onEject = (_p, s) => (side = s);
    for (let i = 0; i < 60; i++) lap.step([car(G, 0, 2.6)], 1 / 60, 20, false);
    expect(side).toBe(true);
    lap.dispose();
  });
  it('fängt einen Fliegenden wieder ein, wenn ein Wagen unter ihm steht', () => {
    const sim = new PassengerSim({ cars: 2, perCar: 1, gravityScale: 1, terrain, belt: 0 });
    const cars: CarState[] = [car(G), { ...car(G), index: 1, x: 7.6 }];
    for (let i = 0; i < 30; i++) sim.step(cars, 1 / 60, 10, false);
    let caught = 0;
    let caughtCar = -1;
    sim.onCatch = (_p, c) => { caught++; caughtCar = c; };
    const n = sim.ejectCar(0, cars, 6); // Schubs 3,9 m/s nach oben, Wagen fährt 10 m/s
    expect(n).toBe(1);
    const v = sim.views[0];
    // der Wagen bleibt unter dem Fliegenden (gleiche Geschwindigkeit, keine Reibung): nach dem Scheitel fällt er zurück in die Wanne
    const stopped: CarState[] = cars.map((c) => ({ ...c, vx: 10, vy: 0 }));
    for (let i = 0; i < 180 && caught === 0; i++) {
      for (const c of stopped) c.x += 10 / 60;
      sim.step(stopped, 1 / 60, 10, false);
    }
    expect(caught).toBe(1);
    expect(caughtCar).toBe(0);
    expect(v.ejected).toBe(false);
    expect(sim.allSeated).toBe(true);
    expect(sim.stats.caught).toBe(1);
    expect(sim.stats.ejected).toBe(1);
    expect(sim.stats.flightMax).toBeGreaterThan(0);
    // sitzt danach wieder stabil
    for (let i = 0; i < 60; i++) sim.step(stopped, 1 / 60, 10, false);
    expect(sim.allSeated).toBe(true);
    sim.dispose();
  });
});
