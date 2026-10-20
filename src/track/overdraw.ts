/**
 * Überzeichnen (Illustrator-Stift): Ein Strich, der nahe an der Bahn beginnt und endet,
 * ersetzt nur den Abschnitt dazwischen. Nahtstellen werden weich verbunden.
 * Der Strich wird mit derselben Lesart interpretiert (Boden = Tiefe, steil = Höhe), startet aber
 * im Zustand der Bahn am Anfangspunkt und blendet am Ende auf die Tiefe der Bahn zurück.
 */
import type { Vec2 } from '@/core/math';
import { dist } from '@/core/math';
import { add3, dist3, normalize3, scale3, sub3 } from '@/core/math3';
import { dedupe, smoothStroke } from '@/core/rdp';
import { closestSample, isAutoNode, nodeIn, nodeOut, nodePos, sampleTrack, type TrackNode, type TrackPath, type TrackSamples } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, toWorld, type StagePoint } from './stage';
import { closePath, interpretWithEvents, pointsToNodes, type StrokeOptions } from './strokeToTrack';

export interface Anchors {
  s1: number;
  s2: number;
  z1: number;
  z2: number;
  y1: number;
  y2: number;
  reversed: boolean;
}

/** Bogenlänge jedes Knotens */
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

/** Bühnenpunkt → nächster Punkt auf der Bahn (über alle Tiefen probiert) */
export function nearestOnTrack(samples: TrackSamples, p: StagePoint): { s: number; d: number; index: number } {
  let best = { s: 0, d: Infinity, index: -1 };
  for (let z = LANE_MIN; z <= LANE_MAX; z += 0.25) {
    const w = toWorld(p.X, p.Y, z);
    const c = closestSample(samples, w.x, w.y, z);
    if (c.d < best.d) best = { s: c.s, d: c.d, index: c.index };
  }
  return best;
}

export function overdrawAnchors(samples: TrackSamples, stroke: StagePoint[], snapDistance = 3): Anchors | null {
  if (stroke.length < 2 || samples.count === 0) return null;
  const a = nearestOnTrack(samples, stroke[0]);
  const b = nearestOnTrack(samples, stroke[stroke.length - 1]);
  if (a.d > snapDistance || b.d > snapDistance) return null;
  if (Math.abs(a.s - b.s) < 2) return null;
  const L = samples.length;
  let forward = b.s - a.s;
  if (forward < 0) forward += L;
  let backward = a.s - b.s;
  if (backward < 0) backward += L;
  const reversed = backward < forward;
  const A = reversed ? b : a;
  const B = reversed ? a : b;
  return { s1: A.s, s2: B.s, z1: samples.z[A.index], z2: samples.z[B.index], y1: samples.y[A.index], y2: samples.y[B.index], reversed };
}

export function applyOverdraw(path: TrackPath, stroke: StagePoint[], opts: StrokeOptions & { snapDistance?: number } = {}): TrackPath | null {
  const samples = sampleTrack(path, 0.25);
  const anchors = overdrawAnchors(samples, stroke, opts.snapDistance ?? 3);
  if (!anchors) return null;
  const { s1, s2, z1, z2, y1, reversed } = anchors;

  let pts: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  if (reversed) pts.reverse();
  pts = dedupe(pts, 0.15);
  pts = smoothStroke(pts, 5);
  // gleichmäßig verdichten
  const dense: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 1; k <= n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const ground = opts.groundHeight ?? (() => 0);
  const clearance = opts.groundClearance ?? 0.6;
  // Der Strich wird auf der sichtbaren Bahn gezeichnet, die um die Mindesthöhe über dem Boden liegt:
  // Boden für die Lesart entsprechend anheben, damit „auf der Bahn“ = „am Boden der Spur“ gilt.
  const raised = (x: number, z: number) => ground(x, z) + clearance;
  const startMode = y1 - ground(samples.x[Math.round(s1 / samples.step) % samples.count], z1) > 1.2 ? 'height' : 'floor';
  const readOpts: StrokeOptions = { ...opts, groundHeight: raised, groundClearance: 0, startZ: z1, startMode, endZ: z2 };
  const { points, events } = interpretWithEvents(dense, readOpts);
  if (points.length < 2) return null;
  const newNodes = pointsToNodes(points, readOpts, events);
  if (newNodes.length < 2) return null;

  // alte Knoten im Bereich (s1, s2) entfernen
  const sNodes = nodeArcLengths(path, samples);
  const gap = 1.0;
  const inSpan = (s: number) => (s2 >= s1 ? s > s1 + gap && s < s2 - gap : s > s1 + gap || s < s2 - gap);
  const n = path.nodes.length;
  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    if (sNodes[i] >= s2 - gap) {
      startIdx = i;
      break;
    }
  }
  const kept: TrackNode[] = [];
  for (let k = 0; k < n; k++) {
    const i = (startIdx + k) % n;
    if (!inSpan(sNodes[i]) && !isAutoNode(path.nodes[i])) kept.push({ ...path.nodes[i] });
  }
  if (!kept.length) return null;
  const result: TrackNode[] = [...kept, ...newNodes];
  smoothJoin(result[kept.length - 1], result[kept.length]);
  // Station bleibt Knoten 0
  const station = path.nodes[0];
  let sIdx = 0;
  let sD = Infinity;
  result.forEach((nd, i) => {
    const d = dist3(nodePos(nd), nodePos(station));
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
  // Schluss neu bilden: direkte Verbindung oder automatischer Rückweg wie bei einem neuen Strich
  closePath(newPath);
  return newPath;
}

/** Zwei Knoten weich verbinden (3D) */
function smoothJoin(a: TrackNode, b: TrackNode): void {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const d = dist3(pa, pb);
  const h = Math.max(1, d / 3);
  const dirA = normalize3(sub3(pa, nodeIn(a)));
  const dirB = normalize3(sub3(nodeOut(b), pb));
  const ab = normalize3(sub3(pb, pa));
  const hasA = Math.hypot(dirA.x, dirA.y, dirA.z) > 0.5;
  const hasB = Math.hypot(dirB.x, dirB.y, dirB.z) > 0.5;
  const outDir = normalize3(add3(scale3(hasA ? dirA : ab, 0.5), scale3(ab, 0.5)));
  const inDir = normalize3(add3(scale3(hasB ? dirB : ab, -0.5), scale3(ab, -0.5)));
  a.outX = outDir.x * h; a.outY = outDir.y * h; a.outZ = (outDir.z * h) / LANE_DEPTH;
  b.inX = inDir.x * h; b.inY = inDir.y * h; b.inZ = (inDir.z * h) / LANE_DEPTH;
}
