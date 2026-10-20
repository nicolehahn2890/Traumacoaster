import type { Vec2 } from './math';
import { pointSegmentDistance } from './math';

/** Ramer-Douglas-Peucker: vereinfacht eine Punktfolge, behält die Form. */
export function simplifyRDP(points: Vec2[], tolerance: number): Vec2[] {
  const idx = simplifyRDPIndices(points, tolerance);
  return idx.map((i) => points[i]);
}

/** Wie simplifyRDP, liefert aber die Indizes der behaltenen Punkte. */
export function simplifyRDPIndices(points: Vec2[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, i) => i);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const { d } = pointSegmentDistance(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
  return out;
}

/** Gleitender Mittelwert (Streamline) über ein Fenster, Endpunkte bleiben fix. */
export function smoothStroke(points: Vec2[], window = 5): Vec2[] {
  if (points.length <= window) return points.slice();
  const half = Math.floor(window / 2);
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i < half || i >= points.length - half) {
      out.push(points[i]);
      continue;
    }
    let sx = 0;
    let sy = 0;
    for (let k = -half; k <= half; k++) {
      sx += points[i + k].x;
      sy += points[i + k].y;
    }
    out.push({ x: sx / window, y: sy / window });
  }
  return out;
}

/** Entfernt Punkte, die näher als minDist am Vorgänger liegen (Zitter-Filter). */
export function dedupe(points: Vec2[], minDist: number): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  if (out.length > 1 && points.length > 1) {
    const last = points[points.length - 1];
    const o = out[out.length - 1];
    if (o.x !== last.x || o.y !== last.y) out[out.length - 1] = last;
  }
  return out;
}
