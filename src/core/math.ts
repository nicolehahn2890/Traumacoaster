/** Kleine Mathe-Bibliothek: Vektoren, Interpolation, Bezier. */

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const TAU = Math.PI * 2;
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;

/** Kubischer Bezier: Punkt bei t */
export function bezierPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Kubischer Bezier: erste Ableitung bei t */
export function bezierDerivative(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

/** Kubischer Bezier: zweite Ableitung bei t */
export function bezierSecondDerivative(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
}

/** Vorzeichenbehaftete Krümmung einer ebenen Kurve aus 1. und 2. Ableitung */
export function curvature(d1: Vec2, d2: Vec2): number {
  const l = len(d1);
  if (l < 1e-9) return 0;
  return cross(d1, d2) / (l * l * l);
}

/** Schnittpunkt zweier Strecken (p1→p2, p3→p4). Liefert Parameter t (auf 1) und u (auf 2), oder null. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { t: number; u: number; point: Vec2 } | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) return null;
  const d3 = sub(p3, p1);
  const t = cross(d3, d2) / denom;
  const u = cross(d3, d1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: add(p1, scale(d1, t)) };
}

/** Nächste Punkte zweier Strecken (a auf p1→p2, b auf p3→p4) und ihr Abstand; bei Schnitt d = 0 */
export function segmentDistance(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { d: number; a: Vec2; b: Vec2 } {
  const hit = segmentIntersection(p1, p2, p3, p4);
  if (hit) return { d: 0, a: hit.point, b: hit.point };
  let best = { d: Infinity, a: p1, b: p3 };
  const onSeg = (p: Vec2, a: Vec2, b: Vec2): Vec2 => add(a, scale(sub(b, a), pointSegmentDistance(p, a, b).t));
  const tryPair = (a: Vec2, b: Vec2) => {
    const d = dist(a, b);
    if (d < best.d) best = { d, a, b };
  };
  tryPair(p1, onSeg(p1, p3, p4));
  tryPair(p2, onSeg(p2, p3, p4));
  tryPair(onSeg(p3, p1, p2), p3);
  tryPair(onSeg(p4, p1, p2), p4);
  return best;
}

/** Abstand eines Punktes zu einer Strecke und Fußpunkt-Parameter */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return { d: dist(p, a), t: 0 };
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const q = add(a, scale(ab, t));
  return { d: dist(p, q), t };
}

/** Deterministischer Zufallsgenerator (Mulberry32) für reproduzierbare Texturen */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1D-Wertrauschen (glatt), für wackelige Linien */
export function noise1(x: number, seed = 1): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    let t = (n * 374761393 + seed * 668265263) >>> 0;
    t = (t ^ (t >>> 13)) * 1274126177;
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return lerp(h(i), h(i + 1), smoothstep(f)) * 2 - 1;
}
