/**
 * Bearbeiten der Bahn ohne Handles: am Segment ziehen.
 *
 * bendSegment verschiebt die beiden inneren Kontrollpunkte eines kubischen Segments so, dass die Kurve beim
 * Parameter t genau durch den Zielpunkt läuft (kleinste Änderung der Kontrollpunkte, Bernstein-Gewichte), und hält
 * an beiden Knoten G1: Das gegenüberliegende Handle dreht mit und behält seine Länge. Knoten selbst bleiben.
 */
import type { Vec3 } from '@/core/math3';
import { add3, bezier3, len3, scale3, sub3 } from '@/core/math3';
import { segmentPoints, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH } from './stage';

function setOut(n: TrackNode, v: Vec3): void {
  n.outX = v.x;
  n.outY = v.y;
  n.outZ = v.z / LANE_DEPTH;
}
function setIn(n: TrackNode, v: Vec3): void {
  n.inX = v.x;
  n.inY = v.y;
  n.inZ = v.z / LANE_DEPTH;
}
const outOf = (n: TrackNode): Vec3 => ({ x: n.outX, y: n.outY, z: n.outZ * LANE_DEPTH });
const inOf = (n: TrackNode): Vec3 => ({ x: n.inX, y: n.inY, z: n.inZ * LANE_DEPTH });

/** G1 am Knoten: das andere Handle zeigt genau entgegen, mit seiner bisherigen Länge */
export function alignOpposite(n: TrackNode, changed: 'in' | 'out'): void {
  const ref = changed === 'in' ? inOf(n) : outOf(n);
  const other = changed === 'in' ? outOf(n) : inOf(n);
  const l = len3(ref);
  if (l < 1e-9) return;
  const keep = len3(other) || l;
  const v = scale3(ref, -keep / l);
  if (changed === 'in') setOut(n, v);
  else setIn(n, v);
}

/**
 * Segment seg (Knoten seg → seg+1) so biegen, dass es bei t durch target läuft. t wird auf [0,08; 0,92] begrenzt
 * (nahe den Knoten würden winzige Gewichte die Handles ins Unendliche schieben).
 */
export function bendSegment(path: TrackPath, seg: number, t: number, target: Vec3): void {
  const n = path.nodes.length;
  if (n < 2) return;
  const a = path.nodes[seg % n];
  const b = path.nodes[(seg + 1) % n];
  const tt = Math.max(0.08, Math.min(0.92, t));
  const [p0, p1, p2, p3] = segmentPoints(path, seg);
  const cur = bezier3(p0, p1, p2, p3, tt);
  const d = sub3(target, cur);
  const w1 = 3 * tt * (1 - tt) * (1 - tt);
  const w2 = 3 * tt * tt * (1 - tt);
  const ww = w1 * w1 + w2 * w2;
  const q1 = add3(p1, scale3(d, w1 / ww));
  const q2 = add3(p2, scale3(d, w2 / ww));
  setOut(a, sub3(q1, p0));
  setIn(b, sub3(q2, p3));
  alignOpposite(a, 'out');
  alignOpposite(b, 'in');
}
