/**
 * Bahn-Teilung (src/track/pathSplit.ts): de Casteljau ändert die Kurve nicht, nahe an Knoten wird am Knoten geteilt.
 */
import { describe, expect, it } from 'vitest';
import { createNode, emptyPath, type TrackNode, type TrackPath } from '@/track/model';
import { splitPathAt } from '@/track/pathSplit';

/** Punkt der kubischen Kurve von Knoten a nach b bei t */
function bez(a: TrackNode, b: TrackNode, t: number): { x: number; y: number; z: number } {
  const v = 1 - t;
  const w0 = v * v * v;
  const w1 = 3 * v * v * t;
  const w2 = 3 * v * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * (a.x + a.outX) + w2 * (b.x + b.inX) + w3 * b.x,
    y: w0 * a.y + w1 * (a.y + a.outY) + w2 * (b.y + b.inY) + w3 * b.y,
    z: w0 * a.z + w1 * (a.z + a.outZ) + w2 * (b.z + b.inZ) + w3 * b.z,
  };
}

function samplePath(): TrackPath {
  const a = createNode(0, 0, 0, 'station');
  a.outX = 10;
  a.outY = 5;
  const b = createNode(30, 10, 0.5);
  b.inX = -8;
  b.inY = 3;
  b.inZ = -0.1;
  b.outX = 5;
  b.outY = -2;
  const c = createNode(50, 0, 0.2);
  c.inX = -6;
  return { ...emptyPath(), nodes: [a, b, c], closed: false };
}

describe('Bahn-Teilung', () => {
  it('teilt ein Segment, ohne die Kurve zu ändern; Kopf und Schwanz tragen den Teilungsknoten', () => {
    const path = samplePath();
    const [a, b, c] = path.nodes;
    const { head, tail } = splitPathAt(path, 0, 0.4);
    expect(head.length).toBe(2);
    expect(tail.length).toBe(3);
    for (const t of [0.05, 0.25, 0.4, 0.6, 0.95]) {
      const p = bez(a, b, t);
      const q = t <= 0.4 ? bez(head[0], head[1], t / 0.4) : bez(tail[0], tail[1], (t - 0.4) / 0.6);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
      expect(q.z).toBeCloseTo(p.z, 9);
    }
    expect(tail[0]).toEqual(head[1]);
    expect(tail[2]).toEqual(c);
    expect(head[0].kind).toBe('station');
    expect(head[0].inX).toBe(a.inX);
    // die Originale bleiben unberührt
    expect(path.nodes[0].outX).toBe(10);
    expect(path.nodes[1].inX).toBe(-8);
  });

  it('teilt nahe an einem Knoten an diesem Knoten, ohne winziges Segment', () => {
    const path = samplePath();
    const b = path.nodes[1];
    const near1 = splitPathAt(path, 0, 0.995);
    expect(near1.head.length).toBe(2);
    expect(near1.head[1]).toEqual(b);
    expect(near1.tail[0]).toEqual(b);
    expect(near1.tail.length).toBe(2);
    const near0 = splitPathAt(path, 1, 0.01);
    expect(near0.head.length).toBe(2);
    expect(near0.head[1]).toEqual(b);
    expect(near0.tail[0]).toEqual(b);
  });

  it('geschlossene Bahn: auf dem Schlusssegment endet der Schwanz am Teilungsknoten (der Rest ist der Rundenschluss)', () => {
    const path = { ...samplePath(), closed: true };
    const { head, tail } = splitPathAt(path, 2, 0.5);
    expect(head.length).toBe(4);
    expect(tail.length).toBe(1);
    expect(tail[0]).toEqual(head[3]);
    const [, , c] = path.nodes;
    const p = bez(c, path.nodes[0], 0.5);
    expect(head[3].x).toBeCloseTo(p.x, 9);
    expect(head[3].y).toBeCloseTo(p.y, 9);
  });
});
