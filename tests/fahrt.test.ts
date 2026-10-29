import { describe, expect, it } from 'vitest';
import { closeTrack, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack } from '@/track/model';
import { pathFromPoints } from '@/track/brushTrack';
import { RIDE_TUNING, TrainSim, type TrainSimOptions } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import { laneRise, type StagePoint } from '@/track/stage';
import type { Vec3 } from '@/core/math3';

/**
 * Fahrregeln 'drive' (Pinsel-Studie, Paket 2): Stützräder und Antrieb. Der Zug entgleist nicht, fällt nicht aus dem
 * Looping, bleibt nicht stehen und fährt an Kreuzungen auf gleicher Höhe durch; unter das Mindesttempo fällt er nie.
 * Die strenge Fahrt bleibt als Regelsatz 'strict' (Tests in physics, chain, crossings, inspect, slices, brush).
 */

const flat = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const base: TrainSimOptions = { cars: 1, carLength: 2.4, skin: 'skinWood', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true };
const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });

/** fährt bis zu seconds Spielzeit; liefert das kleinste Tempo im Rollen */
const run = (sim: TrainSim, seconds = 120): number => {
  let vMin = Infinity;
  for (let i = 0; i < 60 * seconds && !sim.finished; i++) {
    sim.step(1 / 60);
    if (sim.phase === 'coast') vMin = Math.min(vMin, sim.v);
  }
  return vMin;
};

/** geschlossene Bahn aus einem Bühnen-Strich (automatischer Rückweg), Kettenzug */
function fromStroke(stroke: StagePoint[], over: Partial<TrainSimOptions> = {}): TrainSim {
  const r = strokeToTrack(stroke);
  closeTrack(r.path);
  r.path.startType = 'chainlift';
  return new TrainSim(sampleTrack(r.path), r.path, { ...base, ...over });
}

/** 10-m-Hügel, dann ein 20-m-Hügel, den der Schwung nicht schafft (wie der Rückroller-Test der strengen Fahrt) */
const twoHills = stageCurve(0, 120, 240, (x) => 10 * Math.exp(-((x - 20) ** 2) / 60) + 20 * Math.exp(-((x - 70) ** 2) / 80));

/** 42-m-Lifthügel und eine 4 m enge Kehre am Boden: knapp 3 g quer, auf Holz ein Entgleisen der strengen Fahrt */
function hairpin(): StagePoint[] {
  const R = laneRise(1);
  const W = 4;
  return [
    ...stageCurve(0, 40, 80, (x) => 42 * Math.exp(-((x - 18) ** 2) / 50)),
    ...param(40, (t) => [40 + W * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
    ...param(50, (t) => [40 - t * 40, 2 * R]),
    ...param(40, (t) => [-W * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
  ];
}

/** offene Weltbahn: 12-m-Kettenhügel, Abfahrt auf 1 m, senkrechter Looping mit 7 m Radius (Scheitel 15 m, höher als der Hügel), Auslauf */
function slowLoop(): { sim: TrainSim; length: number } {
  const pts: Vec3[] = [];
  for (let x = 0; x <= 10; x += 1) pts.push({ x, y: 0.8, z: 0 });
  for (let x = 11; x <= 40; x += 1) pts.push({ x, y: 0.8 + 11.2 * 0.5 * (1 - Math.cos((Math.PI * (x - 10)) / 30)), z: 0 });
  for (let x = 41; x <= 70; x += 1) pts.push({ x, y: 12 - 11 * 0.5 * (1 - Math.cos((Math.PI * (x - 40)) / 30)), z: 0 });
  for (let x = 71; x <= 76; x += 1) pts.push({ x, y: 1, z: 0 });
  const r = 7;
  const n = 48;
  for (let k = 1; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push({ x: 76 + r * Math.sin(a), y: 1 + r - r * Math.cos(a), z: 0.6 * Math.sin(a / 2) });
  }
  for (let x = 77; x <= 130; x += 1) pts.push({ x, y: 1, z: 0 });
  const path = pathFromPoints(pts, false);
  path.startType = 'chainlift';
  const samples = sampleTrack(path);
  return { sim: new TrainSim(samples, path, { ...base, skin: 'skinSteel' }), length: samples.length };
}

describe('Fahrregeln drive: Antrieb und Stützräder', () => {
  it('ist die Vorgabe; die Fahrt kann sie einzeln überschreiben', () => {
    expect(RIDE_TUNING.rules).toBe('drive');
    expect(fromStroke(twoHills).rules).toBe('drive');
    expect(fromStroke(twoHills, { rules: 'strict' }).rules).toBe('strict');
  });

  it('kriecht mit dem Antrieb über den zu hohen zweiten Hügel, statt zurückzurollen', () => {
    const strict = fromStroke(twoHills, { rules: 'strict' });
    run(strict);
    expect(strict.failReason).toBe('stall');

    const sim = fromStroke(twoHills);
    const vMin = run(sim);
    expect(sim.failReason).toBeNull();
    expect(sim.phase).toBe('done');
    expect(sim.stats.driveM).toBeGreaterThan(5);
    expect(vMin).toBeGreaterThanOrEqual(RIDE_TUNING.driveSpeed - 1e-9);
    const kinds = sim.events.map((e) => e.kind);
    expect(kinds).toContain('driveStart');
    // hinter der Kuppe nimmt der Zug wieder Fahrt auf: der Antrieb meldet sich ab
    expect(kinds.indexOf('driveEnd')).toBeGreaterThan(kinds.indexOf('driveStart'));
  });

  it('bleibt auf ebener Strecke nicht stehen und kommt in der Station an', () => {
    const sim = fromStroke(stageCurve(0, 80, 100, () => 0));
    run(sim, 60);
    expect(sim.phase).toBe('done');
    expect(sim.failReason).toBeNull();
    expect(sim.stats.distance).toBeGreaterThan(25);
  });

  it('nimmt das Mindesttempo aus der Einstellung', () => {
    const sim = fromStroke(twoHills, { driveSpeed: 6 });
    const vMin = run(sim);
    expect(sim.phase).toBe('done');
    expect(vMin).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('entgleist in der engen Kehre nicht; die Querkraft steht nur noch in den Werten', () => {
    const strict = fromStroke(hairpin(), { rules: 'strict', cars: 2 });
    run(strict, 60);
    expect(strict.failReason).toBe('derail');

    const sim = fromStroke(hairpin(), { cars: 2 });
    run(sim, 60);
    expect(sim.failReason).toBeNull();
    expect(sim.phase).toBe('done');
    expect(sim.stats.maxLatG).toBeGreaterThan(2);
  });

  it('fällt im zu langsamen Looping nicht, sondern hängt kopfüber und wird über den Scheitel geschoben', () => {
    const strict = slowLoop();
    strict.sim = new TrainSim(sampleTrack(strict.sim.path), strict.sim.path, { ...base, skin: 'skinSteel', rules: 'strict' });
    run(strict.sim, 60);
    expect(strict.sim.failReason).toBe('fall');

    const { sim, length } = slowLoop();
    run(sim, 120);
    // die offene Bahn endet am Auslauf: der Zug hat alles befahren
    expect(sim.failReason).toBe('openEnd');
    expect(sim.stats.distance).toBeGreaterThan(length - 5);
    expect(sim.stats.inversions).toBeGreaterThanOrEqual(1);
    expect(sim.stats.driveM).toBeGreaterThan(2);
  });
});
