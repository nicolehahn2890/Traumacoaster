import { describe, expect, it } from 'vitest';
import { strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack } from '@/track/model';
import { TrainSim, G } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import { laneRise } from '@/track/stage';

const curve = (x0: number, x1: number, n: number, f: (x: number) => number, lane = 0) =>
  Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    return { X: x, Y: f(x) + laneRise(lane) };
  });

const flatTerrain = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });

function hillSim(height: number, friction = 0) {
  const stroke = curve(0, 70, 90, (x) => 0.4 + height * Math.exp(-((x - 25) ** 2) / 60));
  const r = strokeToTrack(stroke);
  const samples = sampleTrack(r.path);
  const sim = new TrainSim(samples, r.path, {
    cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: friction, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flatTerrain, allowTunnels: true,
  });
  return { sim, samples, r };
}

describe('Zug-Simulation', () => {
  it('erreicht nach dem Hügel etwa sqrt(2gh) ohne Reibung', () => {
    const h = 15;
    const { sim } = hillSim(h, 0);
    let vmax = 0;
    let liftEnded = false;
    for (let i = 0; i < 60 * 40 && !sim.finished; i++) {
      sim.step(1 / 60);
      if (sim.events.some((e) => e.kind === 'liftEnd')) liftEnded = true;
      if (liftEnded) vmax = Math.max(vmax, sim.v);
    }
    const expected = Math.sqrt(2 * G * (h - 0.4));
    expect(liftEnded).toBe(true);
    // Reibung 0, aber Luftwiderstand bleibt: etwas unter dem Idealwert
    expect(vmax).toBeGreaterThan(expected * 0.85);
    expect(vmax).toBeLessThan(expected * 1.02);
  });
  it('kommt mit Reibung in der Station an', () => {
    const { sim } = hillSim(15, 1);
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('done');
    expect(sim.stats.maxSpeed).toBeGreaterThan(10);
    expect(sim.stats.maxG).toBeGreaterThan(1);
  });
  it('erzeugt Airtime auf einem schnellen Hügel', () => {
    // großer Starthügel, dann kleiner schneller Hügel
    const stroke = curve(0, 120, 160, (x) => 0.4 + 25 * Math.exp(-((x - 20) ** 2) / 60) + 6 * Math.exp(-((x - 70) ** 2) / 20));
    const r = strokeToTrack(stroke);
    const sim = new TrainSim(sampleTrack(r.path), r.path, {
      cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flatTerrain, allowTunnels: true,
    });
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) sim.step(1 / 60);
    expect(sim.stats.minG).toBeLessThan(0);
    expect(sim.stats.airtime).toBeGreaterThan(0.1);
  });
  it('bleibt am zu hohen zweiten Hügel stehen (Rückroller)', () => {
    const stroke = curve(0, 120, 160, (x) => 0.4 + 10 * Math.exp(-((x - 20) ** 2) / 60) + 20 * Math.exp(-((x - 70) ** 2) / 80));
    const r = strokeToTrack(stroke);
    const sim = new TrainSim(sampleTrack(r.path), r.path, {
      cars: 1, carLength: 2.4, skin: 'skinWood', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flatTerrain, allowTunnels: true,
    });
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('failed');
    expect(sim.failReason).toBe('stall');
  });
  it('sammelt Coins ein', () => {
    const stroke = curve(0, 70, 90, (x) => 0.4 + 12 * Math.exp(-((x - 25) ** 2) / 60));
    const r = strokeToTrack(stroke);
    const samples = sampleTrack(r.path);
    // Coin genau auf die Bahn setzen
    const i = Math.floor(samples.count * 0.2);
    const sim = new TrainSim(samples, r.path, {
      cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift',
      coins: [{ x: samples.x[i], y: samples.y[i], lane: 0 }, { x: 10, y: 40, lane: 0 }], terrain: flatTerrain, allowTunnels: true,
    });
    for (let k = 0; k < 60 * 60 && !sim.finished; k++) sim.step(1 / 60);
    expect(sim.stats.coins).toBe(1);
  });
  it('kommt mit Launch-Start ohne Lifthügel in Fahrt', () => {
    const stroke = curve(0, 80, 100, (x) => 0.4 + 8 * Math.exp(-((x - 55) ** 2) / 60));
    const r = strokeToTrack(stroke);
    r.path.startType = 'launch';
    const sim = new TrainSim(sampleTrack(r.path), r.path, {
      cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'launch', coins: [], terrain: flatTerrain, allowTunnels: true,
    });
    for (let k = 0; k < 60 * 60 && !sim.finished; k++) sim.step(1 / 60);
    expect(sim.stats.maxSpeed * 3.6).toBeGreaterThan(60);
    expect(sim.phase).toBe('done');
  });
});
