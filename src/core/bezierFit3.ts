/**
 * Bezier-Fit in 3D nach Schneider (Graphics Gems 1990), dimensionsneutral formuliert.
 */
import type { Vec3 } from './math3';
import { add3, bezier3, dist3, dot3, normalize3, scale3, sub3 } from './math3';

export interface CubicSegment3 {
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;
  p3: Vec3;
}

export function fitCurve3(points: Vec3[], error: number): CubicSegment3[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    const d = scale3(sub3(points[1], points[0]), 1 / 3);
    return [{ p0: points[0], p1: add3(points[0], d), p2: sub3(points[1], d), p3: points[1] }];
  }
  const tHat1 = normalize3(sub3(points[1], points[0]));
  const tHat2 = normalize3(sub3(points[points.length - 2], points[points.length - 1]));
  const out: CubicSegment3[] = [];
  fitCubic(points, 0, points.length - 1, tHat1, tHat2, error, out, 0);
  return out;
}

/** Fit mit Ecken: scharfe Knicke teilen die Punktfolge, der Knoten bekommt gebrochene Tangenten. */
export function fitWithCorners3(points: Vec3[], error: number, cornerDeg = 60): CubicSegment3[] {
  if (points.length < 3) return fitCurve3(points, error);
  const cosLimit = Math.cos((cornerDeg * Math.PI) / 180);
  const cuts: number[] = [0];
  for (let i = 1; i < points.length - 1; i++) {
    const a = sub3(points[i], points[i - 1]);
    const b = sub3(points[i + 1], points[i]);
    const la = Math.hypot(a.x, a.y, a.z);
    const lb = Math.hypot(b.x, b.y, b.z);
    if (la < 0.5 || lb < 0.5) continue;
    if (dot3(a, b) / (la * lb) < cosLimit) cuts.push(i);
  }
  cuts.push(points.length - 1);
  const out: CubicSegment3[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const slice = points.slice(cuts[k], cuts[k + 1] + 1);
    if (slice.length >= 2) out.push(...fitCurve3(slice, error));
  }
  return out;
}

function fitCubic(pts: Vec3[], first: number, last: number, tHat1: Vec3, tHat2: Vec3, error: number, out: CubicSegment3[], depth: number): void {
  const nPts = last - first + 1;
  if (nPts === 2 || depth > 40) {
    const d = dist3(pts[last], pts[first]) / 3;
    out.push({ p0: pts[first], p1: add3(pts[first], scale3(tHat1, d)), p2: add3(pts[last], scale3(tHat2, d)), p3: pts[last] });
    return;
  }
  let u = chordLengthParameterize(pts, first, last);
  let bez = generateBezier(pts, first, last, u, tHat1, tHat2);
  let { maxError, splitPoint } = computeMaxError(pts, first, last, bez, u);
  if (maxError < error) {
    out.push(bez);
    return;
  }
  if (maxError < error * error) {
    for (let i = 0; i < 4; i++) {
      const uPrime = reparameterize(pts, first, last, u, bez);
      bez = generateBezier(pts, first, last, uPrime, tHat1, tHat2);
      const r = computeMaxError(pts, first, last, bez, uPrime);
      if (r.maxError < error) {
        out.push(bez);
        return;
      }
      u = uPrime;
      maxError = r.maxError;
      splitPoint = r.splitPoint;
    }
  }
  const tHatCenter = computeCenterTangent(pts, splitPoint);
  fitCubic(pts, first, splitPoint, tHat1, tHatCenter, error, out, depth + 1);
  fitCubic(pts, splitPoint, last, scale3(tHatCenter, -1), tHat2, error, out, depth + 1);
}

function generateBezier(pts: Vec3[], first: number, last: number, u: number[], tHat1: Vec3, tHat2: Vec3): CubicSegment3 {
  const nPts = last - first + 1;
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0; i < nPts; i++) {
    const A0 = scale3(tHat1, B1(u[i]));
    const A1 = scale3(tHat2, B2(u[i]));
    C[0][0] += dot3(A0, A0);
    C[0][1] += dot3(A0, A1);
    C[1][0] = C[0][1];
    C[1][1] += dot3(A1, A1);
    const tmp = sub3(pts[first + i], add3(scale3(pts[first], B0(u[i]) + B1(u[i])), scale3(pts[last], B2(u[i]) + B3(u[i]))));
    X[0] += dot3(A0, tmp);
    X[1] += dot3(A1, tmp);
  }
  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];
  let alphaL = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_X_C1 / det_C0_C1;
  let alphaR = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_C0_X / det_C0_C1;
  const segLength = dist3(pts[first], pts[last]);
  const epsilon = 1e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon || alphaL > segLength * 1.6 || alphaR > segLength * 1.6) {
    alphaL = alphaR = segLength / 3;
  }
  return { p0: pts[first], p1: add3(pts[first], scale3(tHat1, alphaL)), p2: add3(pts[last], scale3(tHat2, alphaR)), p3: pts[last] };
}

function reparameterize(pts: Vec3[], first: number, last: number, u: number[], bez: CubicSegment3): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(newtonRaphson(bez, pts[i], u[i - first]));
  return out;
}

function newtonRaphson(Q: CubicSegment3, P: Vec3, u: number): number {
  const Q_u = bezier3(Q.p0, Q.p1, Q.p2, Q.p3, u);
  const Q1 = [sub3(Q.p1, Q.p0), sub3(Q.p2, Q.p1), sub3(Q.p3, Q.p2)].map((d) => scale3(d, 3));
  const Q2 = [sub3(Q1[1], Q1[0]), sub3(Q1[2], Q1[1])].map((d) => scale3(d, 2));
  const Q1_u = add3(add3(scale3(Q1[0], (1 - u) * (1 - u)), scale3(Q1[1], 2 * (1 - u) * u)), scale3(Q1[2], u * u));
  const Q2_u = add3(scale3(Q2[0], 1 - u), scale3(Q2[1], u));
  const diff = sub3(Q_u, P);
  const numerator = dot3(diff, Q1_u);
  const denominator = dot3(Q1_u, Q1_u) + dot3(diff, Q2_u);
  if (Math.abs(denominator) < 1e-12) return u;
  return u - numerator / denominator;
}

function chordLengthParameterize(pts: Vec3[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[i - first - 1] + dist3(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function computeMaxError(pts: Vec3[], first: number, last: number, bez: CubicSegment3, u: number[]): { maxError: number; splitPoint: number } {
  let splitPoint = Math.floor((last - first + 1) / 2) + first;
  let maxDist = 0;
  for (let i = first + 1; i < last; i++) {
    const P = bezier3(bez.p0, bez.p1, bez.p2, bez.p3, u[i - first]);
    const d = sub3(P, pts[i]);
    const dd = dot3(d, d);
    if (dd >= maxDist) {
      maxDist = dd;
      splitPoint = i;
    }
  }
  return { maxError: Math.sqrt(maxDist), splitPoint };
}

function computeCenterTangent(pts: Vec3[], center: number): Vec3 {
  const V1 = sub3(pts[center - 1], pts[center]);
  const V2 = sub3(pts[center], pts[center + 1]);
  return normalize3(scale3(add3(V1, V2), 0.5));
}

const B0 = (u: number) => (1 - u) * (1 - u) * (1 - u);
const B1 = (u: number) => 3 * u * (1 - u) * (1 - u);
const B2 = (u: number) => 3 * u * u * (1 - u);
const B3 = (u: number) => u * u * u;
