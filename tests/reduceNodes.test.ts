import { describe, expect, it } from 'vitest';
import { curvatureProfile, pickApexIndices, reduceNodes } from '@/track/reduceNodes';
import { stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack, trackStats } from '@/track/model';
import { laneRise, type StagePoint } from '@/track/stage';
import { bezier3, cross3, dist3, dot3, len3, sub3, type Vec3 } from '@/core/math3';
import { rng } from '@/core/math';

const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });
const R = laneRise(1);
const climb = (): StagePoint[] => [...param(20, (t) => [t * 10, 0]), ...param(30, (t) => [10 + t * 12, 20 * (1 - Math.cos(Math.PI * t)) * 0.5]), ...param(40, (t) => [22 + t * 28, 20])];
const oval = (): StagePoint[] => [
  ...param(40, (t) => [t * 30, 0]),
  ...param(30, (t) => [30 + R * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
  ...param(40, (t) => [30 - t * 30, 2 * R]),
  ...param(30, (t) => [-R * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
];
const hill = (h: number): StagePoint[] => stageCurve(0, 70, 140, (x) => h * Math.exp(-((x - 25) ** 2) / 60));
const twoHills = (): StagePoint[] => stageCurve(0, 120, 240, (x) => 25 * Math.exp(-((x - 20) ** 2) / 60) + 6 * Math.exp(-((x - 70) ** 2) / 20));
const loop = (): StagePoint[] => [
  ...climb(),
  ...param(50, (t) => {
    const a = -Math.PI / 2 + Math.PI * 2 * t;
    return [50 + 7 * Math.cos(a) + t * 2, 27 + 7 * Math.sin(a)];
  }),
  ...param(40, (t) => [52 + t * 30, 20 - t * 20]),
  ...param(20, (t) => [82 + t * 10, 0]),
];
/** Handzittern: ±0,35 m auf dicht abgetasteten Punkten, wie ein echter Finger */
function jitter(stroke: StagePoint[], seed = 3): StagePoint[] {
  const rand = rng(seed);
  const out: StagePoint[] = [];
  for (let i = 0; i < stroke.length - 1; i++) {
    const a = stroke[i];
    const b = stroke[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.X - a.X, b.Y - a.Y) / 0.4));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ X: a.X + (b.X - a.X) * t + (rand() - 0.5) * 0.7, Y: a.Y + (b.Y - a.Y) * t + (rand() - 0.5) * 0.7 });
    }
  }
  out.push(stroke[stroke.length - 1]);
  return out;
}
/** größter Abstand der Punkte zur Segmentfolge (Abtastung mit 60 Schritten je Segment) */
function maxDeviation(pts: Vec3[], segments: { p0: Vec3; p1: Vec3; p2: Vec3; p3: Vec3 }[]): number {
  const samples: Vec3[] = [];
  for (const s of segments) for (let i = 0; i <= 60; i++) samples.push(bezier3(s.p0, s.p1, s.p2, s.p3, i / 60));
  let worst = 0;
  for (const p of pts) {
    let best = Infinity;
    for (const q of samples) best = Math.min(best, dist3(p, q));
    worst = Math.max(worst, best);
  }
  return worst;
}
const arc = (r: number, from: number, to: number, n = 80): Vec3[] => Array.from({ length: n }, (_, i) => {
  const a = from + ((to - from) * i) / (n - 1);
  return { x: r * Math.cos(a), y: r * Math.sin(a), z: 0 };
});

describe('Knotenreduktion mit Scheitel-Semantik', () => {
  it('misst die Krümmung eines Kreises als 1/R', () => {
    const prof = curvatureProfile(arc(8, 0, Math.PI, 120));
    for (let i = 10; i < prof.length - 10; i++) expect(prof[i]).toBeCloseTo(1 / 8, 2);
  });
  it('setzt auf einem gleichmäßigen Bogen keinen Scheitel, auf einer Kuppe genau einen', () => {
    const bogen = arc(8, 0, Math.PI, 120);
    expect(pickApexIndices(bogen, curvatureProfile(bogen), []).indices).toEqual([0, bogen.length - 1]);
    const kuppe: Vec3[] = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.5, y: 10 * Math.exp(-((i * 0.5 - 25) ** 2) / 30), z: 0 }));
    const picked = [...pickApexIndices(kuppe, curvatureProfile(kuppe), []).protectedIdx].sort((a, b) => a - b);
    expect(picked).toContain(50); // Scheitel bei x = 25
    expect(picked.length).toBeLessThanOrEqual(5); // Anfang, Fuß, Kuppe, Fuß, Ende
  });
  it('bildet einen Halbkreis mit einem Segment und bleibt innerhalb der Toleranz', () => {
    const pts = arc(8, 0, Math.PI, 100);
    const r = reduceNodes(pts);
    expect(r.segments.length).toBeLessThanOrEqual(2);
    expect(maxDeviation(pts, r.segments)).toBeLessThan(0.3);
  });
  it('bleibt bei einer S-Kurve innerhalb der Toleranz und bleibt G1', () => {
    const pts: Vec3[] = Array.from({ length: 160 }, (_, i) => ({ x: i * 0.5, y: 6 * Math.tanh((i * 0.5 - 40) / 8), z: 0 }));
    const r = reduceNodes(pts);
    expect(maxDeviation(pts, r.segments)).toBeLessThan(1.3);
    for (let i = 1; i < r.segments.length; i++) {
      const a = r.segments[i - 1];
      const b = r.segments[i];
      const tIn = sub3(a.p3, a.p2);
      const tOut = sub3(b.p1, b.p0);
      expect(len3(cross3(tIn, tOut))).toBeLessThan(1e-6 * len3(tIn) * len3(tOut) + 1e-9);
      expect(dot3(tIn, tOut)).toBeGreaterThan(0);
    }
  });
  it.each([
    ['Oval', oval, 8],
    ['Hügel', () => hill(15), 6],
    ['zwei Hügel', twoHills, 11],
    ['Looping', loop, 11],
  ])('braucht für %s höchstens so viele Knoten wie erlaubt und nie mehr als der alte Fit', (_name, make, limit) => {
    const stroke = make();
    const neu = strokeToTrack(stroke);
    const alt = strokeToTrack(stroke, { fit: 'legacy' });
    expect(neu.path.nodes.length).toBeLessThanOrEqual(limit);
    // Kehren mit Übergangsbögen brauchen je einen Knoten mehr als ein Halbkreis (Oval: zwei)
    expect(neu.path.nodes.length).toBeLessThanOrEqual(alt.path.nodes.length + 2);
    // dieselbe Bahn: Loopings, Kehren, Spuren und Höhe wie beim alten Fit
    const sNeu = trackStats(neu.path, sampleTrack(neu.path));
    const sAlt = trackStats(alt.path, sampleTrack(alt.path));
    expect(sNeu.loops).toBe(sAlt.loops);
    expect(sNeu.turns).toBe(sAlt.turns);
    expect(sNeu.lanes).toBe(sAlt.lanes);
    expect(Math.abs(sNeu.maxHeight - sAlt.maxHeight)).toBeLessThan(0.3);
  });
  it('kommt mit Handzittern nicht auf mehr Knoten als sauber gezeichnet plus zwei', () => {
    for (const make of [oval, () => hill(15), loop]) {
      const sauber = strokeToTrack(make()).path.nodes.length;
      const zittrig = strokeToTrack(jitter(make())).path.nodes.length;
      expect(zittrig).toBeLessThanOrEqual(sauber + 2);
    }
  });
  it('markiert Looping-Scheitel und Kehren als Knotenart', () => {
    expect(strokeToTrack(loop()).path.nodes.filter((n) => n.kind === 'loopApex').length).toBe(1);
    expect(strokeToTrack(oval()).path.nodes.some((n) => n.kind === 'turn')).toBe(true);
  });
  it('findet die Scheitel eines Hügels (Fuß, Kuppe, Fuß) für Maßband und Bearbeitung', () => {
    const r = strokeToTrack(hill(15));
    const s = sampleTrack(r.path);
    const pts: Vec3[] = Array.from({ length: s.count }, (_, i) => ({ x: s.x[i], y: s.y[i], z: s.z[i] })).filter((_, i) => !s.auto[i]);
    const picked = [...pickApexIndices(pts, curvatureProfile(pts), []).protectedIdx].sort((a, b) => a - b).map((i) => pts[i]);
    const top = picked.reduce((a, b) => (b.y > a.y ? b : a));
    expect(top.y).toBeGreaterThan(13.5);
    expect(Math.abs(top.x - 25)).toBeLessThan(1.5);
    expect(picked.length).toBeLessThanOrEqual(6);
  });
  it('legt mit snapApex einen Knoten auf die Kuppe, ohne bleibt die Kuppe im Segment', () => {
    const r = strokeToTrack(hill(15));
    const s = sampleTrack(r.path);
    const pts: Vec3[] = Array.from({ length: s.count }, (_, i) => ({ x: s.x[i], y: s.y[i], z: s.z[i] })).filter((_, i) => !s.auto[i]);
    const snapped = reduceNodes(pts, [], { snapApex: true });
    expect(snapped.indices.some((i) => Math.abs(pts[i].x - 25) < 1.5 && pts[i].y > 13.5)).toBe(true);
    const plain = reduceNodes(pts, []);
    expect(plain.segments.length).toBeLessThanOrEqual(snapped.segments.length + 1);
  });

});
