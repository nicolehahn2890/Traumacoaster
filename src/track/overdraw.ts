/**
 * Überzeichnen wie der Illustrator-Stift: Ein neuer Strich, der nahe an der Bahn beginnt und endet,
 * ersetzt nur den Abschnitt dazwischen. Die Nahtstellen werden weich verbunden.
 */
import type { Vec2 } from '@/core/math';
import { add, dist, normalize, scale, sub } from '@/core/math';
import { dedupe, simplifyRDP, smoothStroke } from '@/core/rdp';
import { fitWithCorners } from '@/core/bezierFit';
import { closestSample, createNode, sampleTrack, type TrackNode, type TrackPath, type TrackSamples } from './model';
import { toWorld, type StagePoint } from './stage';
import { assignDepth, detectLoops, detectTurns, liftOverGround, roundCorners } from './strokeToTrack';

export interface OverdrawOptions {
  /** Max. Abstand (Welt-Meter) von Strichanfang/-ende zur Bahn */
  snapDistance?: number;
  fitError?: number;
  simplifyTolerance?: number;
  minTurnWidth?: number;
  turnHalfLength?: number;
  groundHeight?: (x: number, z: number) => number;
  groundClearance?: number;
  maxHeight?: number;
  allowTurns?: boolean;
  allowLoops?: boolean;
}

/** Bogenlänge jedes Knotens (Index → s) aus der Abtastung. */
export function nodeArcLengths(path: TrackPath, samples: TrackSamples): number[] {
  const out = new Array<number>(path.nodes.length).fill(0);
  let seg = -1;
  for (let i = 0; i < samples.count; i++) {
    if (samples.seg[i] !== seg) {
      seg = samples.seg[i];
      if (seg < out.length) out[seg] = samples.s[i];
    }
  }
  return out;
}

/** Prüft, ob ein Strich (Bühnenkoordinaten) als Überzeichnen gilt, und liefert die Fußpunkte. */
export function overdrawAnchors(
  path: TrackPath,
  samples: TrackSamples,
  stroke: StagePoint[],
  snapDistance = 3,
): { s1: number; s2: number; z1: number; z2: number; reversed: boolean } | null {
  if (stroke.length < 2 || path.nodes.length < 3 || samples.count === 0) return null;
  const first = stroke[0];
  const last = stroke[stroke.length - 1];
  const find = (p: StagePoint) => {
    // Bühne → Welt ist von z abhängig; wir probieren alle Spuren und nehmen den besten Treffer
    let best: { s: number; d: number; z: number } | null = null;
    for (let z = -2; z <= 2; z += 0.5) {
      const w = toWorld(p.X, p.Y, z);
      const c = closestSample(samples, w.x, w.y, z);
      if (!best || c.d < best.d) best = { s: c.s, d: c.d, z: samples.z[c.index] };
    }
    return best!;
  };
  const a = find(first);
  const b = find(last);
  if (a.d > snapDistance || b.d > snapDistance) return null;
  if (Math.abs(a.s - b.s) < 2) return null;
  // Strichrichtung gegen Bahnrichtung? Dann Strich umdrehen.
  const L = samples.length;
  let forward = b.s - a.s;
  if (forward < 0) forward += L;
  let backward = a.s - b.s;
  if (backward < 0) backward += L;
  const reversed = backward < forward;
  return reversed ? { s1: b.s, s2: a.s, z1: b.z, z2: a.z, reversed } : { s1: a.s, s2: b.s, z1: a.z, z2: b.z, reversed };
}

/** Führt das Überzeichnen aus und liefert den neuen Pfad (der alte bleibt unverändert). */
export function applyOverdraw(path: TrackPath, stroke: StagePoint[], opts: OverdrawOptions = {}): TrackPath | null {
  const samples = sampleTrack(path, 0.25);
  const anchors = overdrawAnchors(path, samples, stroke, opts.snapDistance ?? 3);
  if (!anchors) return null;
  const { s1, s2, z1, reversed } = anchors;
  const L = samples.length;

  // Strich vorbereiten
  let pts: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  if (reversed) pts.reverse();
  pts = dedupe(pts, 0.15);
  pts = smoothStroke(pts, 5);
  pts = simplifyRDP(pts, opts.simplifyTolerance ?? 0.6);
  pts = roundCorners(pts);
  if (pts.length < 2) return null;

  const loops = opts.allowLoops === false ? [] : detectLoops(pts);
  const turns = opts.allowTurns === false ? [] : detectTurns(pts, opts.minTurnWidth ?? 12, loops.map((l) => [l.from!, l.to!] as [number, number]));
  const zRaw = assignDepth(pts, Math.round(z1), turns, opts.turnHalfLength ?? 8);
  const lifted = liftOverGround(pts, zRaw, opts.groundHeight, opts.groundClearance ?? 0.6, opts.maxHeight ?? 0);
  const world: Vec2[] = lifted.points;
  const z = lifted.z;
  const segments = fitWithCorners(world, opts.fitError ?? 0.45);
  if (!segments.length) return null;

  const zAt = (p: Vec2): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < world.length; i++) {
      const d = dist(world[i], p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return z[best];
  };
  const newNodes: TrackNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const n = createNode(seg.p0.x, seg.p0.y, zAt(seg.p0));
    n.outX = seg.p1.x - seg.p0.x;
    n.outY = seg.p1.y - seg.p0.y;
    if (i > 0) {
      n.inX = segments[i - 1].p2.x - segments[i - 1].p3.x;
      n.inY = segments[i - 1].p2.y - segments[i - 1].p3.y;
    }
    newNodes.push(n);
  }
  const lastSeg = segments[segments.length - 1];
  const endNode = createNode(lastSeg.p3.x, lastSeg.p3.y, zAt(lastSeg.p3));
  endNode.inX = lastSeg.p2.x - lastSeg.p3.x;
  endNode.inY = lastSeg.p2.y - lastSeg.p3.y;
  newNodes.push(endNode);
  for (const l of loops) {
    const apex = world[l.index];
    let best = -1;
    let bestD = Infinity;
    newNodes.forEach((n, i) => {
      const d = Math.hypot(n.x - apex.x, n.y - apex.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) newNodes[best].kind = 'loopApex';
  }
  for (const t of turns) {
    const apex = world[t.index];
    let best = -1;
    let bestD = Infinity;
    newNodes.forEach((n, i) => {
      const d = Math.hypot(n.x - apex.x, n.y - apex.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && newNodes[best].kind === 'normal') newNodes[best].kind = 'turn';
  }

  // Alte Knoten im Bereich (s1, s2) entfernen. Bereich kann über die Station wickeln.
  const sNodes = nodeArcLengths(path, samples);
  const gap = 1.0;
  const inSpan = (s: number) => {
    if (s2 >= s1) return s > s1 + gap && s < s2 - gap;
    return s > s1 + gap || s < s2 - gap;
  };
  // Knoten in Reihenfolge ab dem ersten Knoten nach s2 sammeln (damit die Einfügestelle eindeutig ist)
  const n = path.nodes.length;
  const order: number[] = [];
  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    if (sNodes[i] >= s2 - gap) {
      startIdx = i;
      break;
    }
  }
  for (let k = 0; k < n; k++) order.push((startIdx + k) % n);
  const kept: TrackNode[] = [];
  for (const i of order) if (!inSpan(sNodes[i])) kept.push({ ...path.nodes[i] });
  if (kept.length === 0) return null;

  // Reihenfolge: kept beginnt nach s2 und endet vor s1 → neue Knoten hinten anhängen
  const result: TrackNode[] = [...kept, ...newNodes];
  // Nahtstellen weich: letzter kept → erster neu, letzter neu → erster kept
  smoothJoin(result[kept.length - 1], result[kept.length]);
  smoothJoin(result[result.length - 1], result[0]);

  // Station wieder an Index 0: der Knoten, der der alten Station am nächsten liegt
  const station = path.nodes[0];
  let sIdx = 0;
  let sD = Infinity;
  result.forEach((nd, i) => {
    const d = Math.hypot(nd.x - station.x, nd.y - station.y);
    if (d < sD) {
      sD = d;
      sIdx = i;
    }
  });
  const rotated = [...result.slice(sIdx), ...result.slice(0, sIdx)];
  rotated.forEach((nd) => {
    if (nd.kind === 'station') nd.kind = 'normal';
  });
  rotated[0].kind = 'station';

  const newPath: TrackPath = { nodes: rotated, elements: path.elements.map((e) => ({ ...e })), startType: path.startType, templates: { ...path.templates } };
  // Elemente, die außerhalb der neuen Länge liegen, zurückholen
  const newLen = sampleTrack(newPath, 0.5).length;
  for (const e of newPath.elements) e.s = ((e.s % newLen) + newLen) % newLen;
  void L;
  return newPath;
}

/** Verbindet zwei Knoten weich: Out-Handle von a und In-Handle von b zeigen entlang der Verbindung. */
function smoothJoin(a: TrackNode, b: TrackNode): void {
  const pa = { x: a.x, y: a.y };
  const pb = { x: b.x, y: b.y };
  const d = dist(pa, pb);
  const h = Math.max(1, d / 3);
  const dirA = normalize({ x: -a.inX, y: -a.inY });
  const dirB = normalize({ x: b.outX, y: b.outY });
  const ab = normalize(sub(pb, pa));
  const outDir = normalize(add(scale(dirA.x || dirA.y ? dirA : ab, 0.5), scale(ab, 0.5)));
  const inDir = normalize(add(scale(dirB.x || dirB.y ? dirB : ab, -0.5), scale(ab, -0.5)));
  a.outX = outDir.x * h;
  a.outY = outDir.y * h;
  b.inX = inDir.x * h;
  b.inY = inDir.y * h;
}
