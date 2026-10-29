/**
 * Bahn an einer Probe teilen (Überzeichnen und Fortsetzen mit Strich 2, Pinsel-Studie Stufe P1): de Casteljau auf dem
 * Segment seg bei t. Die Kurve bleibt dieselbe, nur ein Knoten kommt dazu. Kopf = Knoten bis zur Teilung, Schwanz = ab
 * der Teilung; beide tragen den Teilungsknoten als eigene Kopie, damit sie getrennt weiterleben können (der Kopf wird
 * die feste alte Bahn von Strich 2, der Schwanz wird hinter dem neuen Stück wieder angehängt). Liegt t dicht an einem
 * Knoten (TAU), wird an diesem Knoten geteilt, damit kein winziges Segment entsteht.
 */
import type { TrackNode, TrackPath } from './model';

export interface PathSplit {
  head: TrackNode[];
  tail: TrackNode[];
}

type P = { x: number; y: number; z: number };

/** so nah (Parameter) an einem Knoten wird an ihm selbst geteilt */
const TAU = 0.02;

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const copy = (n: TrackNode): TrackNode => ({ ...n });

/**
 * Teilt die Bahn auf Segment seg (von Knoten seg zu Knoten seg + 1, bei geschlossener Bahn vom letzten zum ersten) an
 * der Parameterstelle t. Knoten-Tiefen und Griffe bleiben in Spuren wie im Modell.
 */
export function splitPathAt(path: TrackPath, seg: number, t: number): PathSplit {
  const nodes = path.nodes;
  const n = nodes.length;
  if (n < 2) return { head: nodes.map(copy), tail: nodes.map(copy) };
  const closed = !!path.closed && n >= 3;
  const segCount = closed ? n : n - 1;
  const k = Math.max(0, Math.min(segCount - 1, Math.floor(seg)));
  const next = closed ? (k + 1) % n : k + 1;
  const u = Math.max(0, Math.min(1, t));
  if (u <= TAU) return { head: nodes.slice(0, k + 1).map(copy), tail: nodes.slice(k).map(copy) };
  if (u >= 1 - TAU) {
    if (closed && next === 0) return { head: nodes.map(copy), tail: [copy(nodes[0])] };
    return { head: nodes.slice(0, next + 1).map(copy), tail: nodes.slice(next).map(copy) };
  }
  const a = nodes[k];
  const b = nodes[next];
  const p0: P = { x: a.x, y: a.y, z: a.z };
  const p1: P = { x: a.x + a.outX, y: a.y + a.outY, z: a.z + a.outZ };
  const p2: P = { x: b.x + b.inX, y: b.y + b.inY, z: b.z + b.inZ };
  const p3: P = { x: b.x, y: b.y, z: b.z };
  const q0 = lerp(p0, p1, u);
  const q1 = lerp(p1, p2, u);
  const q2 = lerp(p2, p3, u);
  const r0 = lerp(q0, q1, u);
  const r1 = lerp(q1, q2, u);
  const m = lerp(r0, r1, u);
  const headA = copy(a);
  headA.outX = q0.x - p0.x;
  headA.outY = q0.y - p0.y;
  headA.outZ = q0.z - p0.z;
  const mid: TrackNode = { x: m.x, y: m.y, z: m.z, inX: r0.x - m.x, inY: r0.y - m.y, inZ: r0.z - m.z, outX: r1.x - m.x, outY: r1.y - m.y, outZ: r1.z - m.z, roll: NaN, kind: 'normal' };
  const tailB = copy(b);
  tailB.inX = q2.x - p3.x;
  tailB.inY = q2.y - p3.y;
  tailB.inZ = q2.z - p3.z;
  const head = [...nodes.slice(0, k).map(copy), headA, mid];
  const tail = closed && next === 0 ? [copy(mid)] : [copy(mid), tailB, ...nodes.slice(next + 1).map(copy)];
  return { head, tail };
}
