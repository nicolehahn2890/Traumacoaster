import { describe, expect, it } from 'vitest';
import { findCrossings } from '@/track/crossings';
import { pointsToNodes, strokeToTrack, type InterpretedPoint } from '@/track/strokeToTrack';
import { emptyPath, sampleTrack, trackStats, type TrackPath } from '@/track/model';
import { TrainSim } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import type { StagePoint } from '@/track/stage';

const flat = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });

/** Offene Bahn aus Boden-Punkten (x, Spur), Höhe h über dem Boden */
function floorPath(pts: Array<[number, number]>, h = 0.8): TrackPath {
  const points: InterpretedPoint[] = pts.map(([x, z], i) => ({ x, y: h, z, mode: 'floor', s: i }));
  const nodes = pointsToNodes(points, {}, []);
  nodes[0].kind = 'station';
  return { ...emptyPath(), nodes, closed: false };
}
/** Boden-„8“: gerade nach rechts, Bogen nach hinten, zurück, schräg nach vorn über die eigene Spur, weiter */
function figureEight(): TrackPath {
  const pts: Array<[number, number]> = [];
  for (let x = 0; x <= 30; x += 1) pts.push([x, 0]);
  for (let t = 0.1; t <= 1; t += 0.1) pts.push([30 + 8 * Math.sin(Math.PI * t), 1 - Math.cos(Math.PI * t)]);
  for (let x = 29; x >= 22; x -= 1) pts.push([x, 2]);
  for (let t = 0.1; t <= 1; t += 0.1) pts.push([22 - 12 * t, 2 - 4 * t]);
  for (let x = 9; x >= 0; x -= 1) pts.push([x, -2]);
  return floorPath(pts);
}
const sim = (path: TrackPath) => {
  const samples = sampleTrack(path);
  return { samples, sim: new TrainSim(samples, path, { cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'launch', coins: [], terrain: flat, allowTunnels: true }) };
};

describe('Kreuzungen auf gleicher Höhe', () => {
  it('findet die Kreuzung einer Boden-8 und lässt den Zug dort auffahren', () => {
    const path = figureEight();
    const samples = sampleTrack(path);
    const cs = findCrossings(samples);
    expect(cs.length).toBe(1);
    expect(Math.abs(cs[0].y1 - cs[0].y2)).toBeLessThan(0.5);
    expect(cs[0].s1).toBeGreaterThan(5);
    expect(cs[0].s1).toBeLessThan(30);
    expect(trackStats(path, samples).crossings).toBe(1);
    const { sim: s } = sim(path);
    for (let i = 0; i < 60 * 30 && !s.finished; i++) s.step(1 / 60);
    expect(s.failReason).toBe('crossing');
    expect(s.phase).toBe('flying');
    // an der ersten der beiden Stellen
    expect(Math.abs(s.events.find((e) => e.kind === 'fail')!.time - s.t)).toBeLessThan(1e-6);
    expect(s.s).toBeGreaterThan(cs[0].s1 - 0.5);
    expect(s.s).toBeLessThan(cs[0].s2);
  });
  it('erlaubt die Kreuzung, wenn eine Schiene hoch genug über der anderen liegt', () => {
    const pts: Array<[number, number]> = [];
    for (let x = 0; x <= 30; x += 1) pts.push([x, 0]);
    for (let t = 0.1; t <= 1; t += 0.1) pts.push([30 + 8 * Math.sin(Math.PI * t), 1 - Math.cos(Math.PI * t)]);
    for (let x = 29; x >= 22; x -= 1) pts.push([x, 2]);
    for (let t = 0.1; t <= 1; t += 0.1) pts.push([22 - 12 * t, 2 - 4 * t]);
    for (let x = 9; x >= 0; x -= 1) pts.push([x, -2]);
    const points: InterpretedPoint[] = pts.map(([x, z], i) => ({ x, y: i > 38 ? 6 : 0.8, z, mode: 'floor', s: i }));
    const nodes = pointsToNodes(points, {}, []);
    nodes[0].kind = 'station';
    const path: TrackPath = { ...emptyPath(), nodes, closed: false };
    expect(findCrossings(sampleTrack(path)).length).toBe(0);
  });
  it('zählt die Kreuzung eines Loopings mit sich selbst nicht', () => {
    const stroke = [
      ...param(20, (t) => [t * 10, 0]),
      ...param(30, (t) => [10 + t * 12, 20 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [22 + t * 28, 20]),
      ...param(40, (t) => {
        const a = -Math.PI / 2 + Math.PI * 2 * t;
        return [50 + 2.5 * Math.cos(a) + t * 1.2, 22.5 + 2.5 * Math.sin(a)];
      }),
      ...param(40, (t) => [51.2 + t * 30, 20 - t * 20]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(1);
    expect(findCrossings(sampleTrack(r.path)).length).toBe(0);
  });
});
