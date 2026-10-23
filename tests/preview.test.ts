import { describe, expect, it } from 'vitest';
import { stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack, trackStats } from '@/track/model';
import { laneRise, type StagePoint } from '@/track/stage';

const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });
const R = laneRise(1);
const hill = stageCurve(0, 70, 140, (x) => 15 * Math.exp(-((x - 25) ** 2) / 60));
const hairpin = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 18], [24, 14], [30, 10], [40, 10], [46, 10.2], [50, 12], [46, 13.8], [40, 14], [26, 14], [18, 13.2], [10, 10], [2, 6], [-4, R + 0.3], [-12, R]].map(([X, Y]) => ({ X, Y }));
const loop = [
  ...param(20, (t) => [t * 10, 0]),
  ...param(30, (t) => [10 + t * 12, 20 * (1 - Math.cos(Math.PI * t)) * 0.5]),
  ...param(40, (t) => [22 + t * 28, 20]),
  ...param(50, (t) => {
    const a = -Math.PI / 2 + Math.PI * 2 * t;
    return [50 + 7 * Math.cos(a) + t * 2, 27 + 7 * Math.sin(a)];
  }),
  ...param(40, (t) => [52 + t * 30, 20 - t * 20]),
  ...param(20, (t) => [82 + t * 10, 0]),
];

describe('Vorschau während des Strichs', () => {
  it.each([
    ['Hügel', hill],
    ['Steilkurve', hairpin],
    ['Looping', loop],
  ])('liest %s in der Vorschau wie die fertige Bahn (Höhe ±0,5 m, gleiche Ereignisse, kaum mehr Knoten)', (_name, stroke) => {
    const full = strokeToTrack(stroke);
    const prev = strokeToTrack(stroke, { preview: true });
    const sf = trackStats(full.path, sampleTrack(full.path));
    const sp = trackStats(prev.path, sampleTrack(prev.path, 0.5));
    expect(Math.abs(sf.maxHeight - sp.maxHeight)).toBeLessThan(0.5);
    expect(sp.loops).toBe(sf.loops);
    expect(prev.events.map((e) => e.kind)).toEqual(full.events.map((e) => e.kind));
    expect(sp.lanes).toBe(sf.lanes);
    // Vorschau-Knoten liegen alle 2,5 m direkt auf der Linie (kein Fit, der von Takt zu Takt anders einrastet)
    expect(prev.path.nodes.length).toBeGreaterThan(full.path.nodes.length);
  });
  it('ist in der Vorschau nicht langsamer als die fertige Lesart', () => {
    const t = (opts: { preview?: boolean }) => {
      const t0 = performance.now();
      for (let i = 0; i < 5; i++) strokeToTrack(loop, opts);
      return (performance.now() - t0) / 5;
    };
    t({}); // warm
    const full = t({});
    const prev = t({ preview: true });
    expect(prev).toBeLessThanOrEqual(full * 1.2 + 2);
  });
});
