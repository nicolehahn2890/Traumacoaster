import { describe, expect, it } from 'vitest';
import { bendSegment } from '@/track/edit';
import { stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { clonePath, nodeIn, nodeOut, nodePos, sampleTrack, segmentPoints, trackStats } from '@/track/model';
import { add3, bezier3, cross3, dist3, dot3, len3, sub3 } from '@/core/math3';

const hill = () => strokeToTrack(stageCurve(0, 70, 140, (x) => 15 * Math.exp(-((x - 25) ** 2) / 60))).path;

describe('Segment ziehen (bendSegment)', () => {
  it('führt die Kurve beim Parameter t genau durch den Zielpunkt und lässt die Knoten stehen', () => {
    const path = hill();
    const seg = 1;
    const t = 0.4;
    const [p0, p1, p2, p3] = segmentPoints(path, seg);
    const before = bezier3(p0, p1, p2, p3, t);
    const target = add3(before, { x: 1, y: 3, z: 0 });
    const nodesBefore = path.nodes.map((n) => ({ ...n }));
    bendSegment(path, seg, t, target);
    const [q0, q1, q2, q3] = segmentPoints(path, seg);
    expect(dist3(bezier3(q0, q1, q2, q3, t), target)).toBeLessThan(1e-6);
    path.nodes.forEach((n, i) => {
      expect(n.x).toBe(nodesBefore[i].x);
      expect(n.y).toBe(nodesBefore[i].y);
      expect(n.z).toBe(nodesBefore[i].z);
    });
    expect(path.nodes.length).toBe(nodesBefore.length);
  });
  it('hält G1 an beiden Knoten (gegenüberliegende Handles bleiben entgegengesetzt, Länge bleibt)', () => {
    const path = hill();
    const seg = 1;
    const a = path.nodes[seg];
    const b = path.nodes[seg + 1];
    const inLenA = dist3(nodeIn(a), nodePos(a));
    const outLenB = dist3(nodeOut(b), nodePos(b));
    const [p0, p1, p2, p3] = segmentPoints(path, seg);
    bendSegment(path, seg, 0.5, add3(bezier3(p0, p1, p2, p3, 0.5), { x: 0, y: 2.5, z: 0 }));
    for (const n of [a, b]) {
      const vin = sub3(nodePos(n), nodeIn(n));
      const vout = sub3(nodeOut(n), nodePos(n));
      expect(len3(cross3(vin, vout))).toBeLessThan(1e-6 * len3(vin) * len3(vout) + 1e-9);
      expect(dot3(vin, vout)).toBeGreaterThan(0);
    }
    expect(dist3(nodeIn(a), nodePos(a))).toBeCloseTo(inLenA, 6);
    expect(dist3(nodeOut(b), nodePos(b))).toBeCloseTo(outLenB, 6);
  });
  it('begrenzt t nahe den Knoten, damit die Handles nicht explodieren', () => {
    const path = hill();
    const seg = 1;
    const [p0, p1, p2, p3] = segmentPoints(path, seg);
    const target = add3(bezier3(p0, p1, p2, p3, 0.08), { x: 0, y: 1, z: 0 });
    const copy = clonePath(path);
    bendSegment(path, seg, 0.001, target);
    bendSegment(copy, seg, 0.08, target);
    expect(path.nodes[seg].outX).toBeCloseTo(copy.nodes[seg].outX, 9);
    expect(len3({ x: path.nodes[seg].outX, y: path.nodes[seg].outY, z: 0 })).toBeLessThan(200);
  });
  it('erhöht die Bahn, wenn ein Segment nach oben gezogen wird, ohne neue Knoten', () => {
    const path = hill();
    const n0 = path.nodes.length;
    const h0 = trackStats(path, sampleTrack(path)).maxHeight;
    const seg = 1;
    const [p0, p1, p2, p3] = segmentPoints(path, seg);
    bendSegment(path, seg, 0.5, add3(bezier3(p0, p1, p2, p3, 0.5), { x: 0, y: 6, z: 0 }));
    const h1 = trackStats(path, sampleTrack(path)).maxHeight;
    expect(path.nodes.length).toBe(n0);
    expect(h1).toBeGreaterThan(h0 - 0.01);
    const [q0, q1, q2, q3] = segmentPoints(path, seg);
    expect(bezier3(q0, q1, q2, q3, 0.5).y).toBeCloseTo(bezier3(p0, p1, p2, p3, 0.5).y + 6, 6);
  });
});
