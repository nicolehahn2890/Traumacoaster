import { describe, expect, it } from 'vitest';
import { closeTrack, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack } from '@/track/model';
import { TrainSim, type TrainSimOptions } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import type { StagePoint } from '@/track/stage';

const flat = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });

/** Offene Bahn (kein Rückweg): die Fahrt endet am Absperrband */
function openSim(stroke: StagePoint[], over: Partial<TrainSimOptions> = {}) {
  const r = strokeToTrack(stroke);
  expect(r.path.closed).toBe(false);
  r.path.startType = 'chainlift';
  const samples = sampleTrack(r.path);
  expect(samples.closed).toBe(false);
  const sim = new TrainSim(samples, r.path, {
    cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true, ...over,
  });
  return { sim, samples, r };
}
const run = (sim: TrainSim, seconds = 60) => {
  for (let i = 0; i < 60 * seconds && !sim.finished; i++) sim.step(1 / 60);
};

describe('Offenes Ende (Absperrband)', () => {
  it('fliegt mit Tempo ab: Räder blockieren kurz, dann openEnd und Freiflug', () => {
    // Hügel 15 m, der Strich endet 70 m weit draußen knapp über dem Boden: der Zug kommt mit über 6 m/s an
    const { sim, samples } = openSim(stageCurve(0, 70, 140, (x) => 15 * Math.exp(-((x - 25) ** 2) / 60)));
    let maxV = 0;
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) {
      sim.step(1 / 60);
      maxV = Math.max(maxV, sim.v);
    }
    expect(maxV).toBeGreaterThan(10);
    expect(sim.failReason).toBe('openEnd');
    expect(sim.phase).toBe('flying');
    expect(sim.finished).toBe(true);
    const lock = sim.events.find((e) => e.kind === 'wheelLock');
    expect(lock).toBeDefined();
    expect(sim.events.some((e) => e.kind === 'finish')).toBe(false);
    // der Zug verlässt die Bahn nach vorn, mit Fahrt, nicht rückwärts
    const b = sim.flight!.bodies[0];
    expect(b.vx).toBeGreaterThan(2);
    expect(b.x).toBeGreaterThan(samples.x[samples.count - 1] - 1);
    for (let i = 0; i < 60 * 8 && !sim.flight!.settled; i++) sim.step(1 / 60);
    expect(sim.flight!.settled).toBe(true);
    expect(sim.cars[0].x).toBeGreaterThan(samples.x[samples.count - 1] + 2);
  });

  it('kippt langsam über die Kante, wenn der Zug fast ohne Tempo ankommt', () => {
    // 12 m ebene Gerade: der Stationsschub (2 m/s) reicht knapp bis zum Ende
    const { sim, samples } = openSim(stageCurve(0, 12, 24, () => 0));
    run(sim, 30);
    expect(sim.failReason).toBe('openEnd');
    expect(sim.phase).toBe('flying');
    expect(sim.events.some((e) => e.kind === 'wheelLock')).toBe(false);
    const endX = samples.x[samples.count - 1];
    for (let i = 0; i < 60 * 8 && !sim.flight!.settled; i++) sim.step(1 / 60);
    expect(sim.flight!.settled).toBe(true);
    // liegt vor dem Ende der Bahn am Boden
    expect(sim.cars[0].x).toBeGreaterThan(endX);
    expect(sim.cars[0].y).toBeLessThan(samples.y[samples.count - 1]);
  });

  it('derselbe Strich kommt an, sobald der Rückweg da ist (closeTrack als Werkzeug)', () => {
    const stroke = stageCurve(0, 70, 140, (x) => 15 * Math.exp(-((x - 25) ** 2) / 60));
    const open = openSim(stroke).sim;
    run(open);
    expect(open.failReason).toBe('openEnd');
    const r = strokeToTrack(stroke);
    closeTrack(r.path);
    r.path.startType = 'chainlift';
    const samples = sampleTrack(r.path);
    expect(samples.closed).toBe(true);
    const closed = new TrainSim(samples, r.path, {
      cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true,
    });
    run(closed);
    expect(closed.phase).toBe('done');
    expect(closed.events.some((e) => e.kind === 'wheelLock')).toBe(false);
  });
});
