/**
 * Bezier-Fit nach Philip J. Schneider („An Algorithm for Automatically Fitting Digitized Curves“,
 * Graphics Gems 1990). Passt eine Punktfolge durch kubische Bezier-Segmente mit Fehlertoleranz.
 */
import type { Vec2 } from './math';
import { add, bezierPoint, dist, dot, normalize, scale, sub } from './math';

export interface CubicSegment {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
}

/**
 * Fit mit Ecken: An scharfen Knicken (Winkel > cornerDeg) wird die Punktfolge geteilt und
 * stückweise gefittet, so dass der Knoten dort gebrochene Tangenten bekommt (kein Überschwingen).
 */
export function fitWithCorners(points: Vec2[], error: number, cornerDeg = 60): CubicSegment[] {
  if (points.length < 3) return fitCurve(points, error);
  const cosLimit = Math.cos((cornerDeg * Math.PI) / 180);
  const cuts: number[] = [0];
  for (let i = 1; i < points.length - 1; i++) {
    const a = sub(points[i], points[i - 1]);
    const b = sub(points[i + 1], points[i]);
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la < 0.5 || lb < 0.5) continue;
    const c = (a.x * b.x + a.y * b.y) / (la * lb);
    if (c < cosLimit) cuts.push(i);
  }
  cuts.push(points.length - 1);
  const out: CubicSegment[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const slice = points.slice(cuts[k], cuts[k + 1] + 1);
    if (slice.length >= 2) out.push(...fitCurve(slice, error));
  }
  return out;
}

export function fitCurve(points: Vec2[], error: number): CubicSegment[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    const d = scale(sub(points[1], points[0]), 1 / 3);
    return [{ p0: points[0], p1: add(points[0], d), p2: sub(points[1], d), p3: points[1] }];
  }
  const tHat1 = computeLeftTangent(points, 0);
  const tHat2 = computeRightTangent(points, points.length - 1);
  const out: CubicSegment[] = [];
  fitCubic(points, 0, points.length - 1, tHat1, tHat2, error, out);
  return out;
}

function fitCubic(pts: Vec2[], first: number, last: number, tHat1: Vec2, tHat2: Vec2, error: number, out: CubicSegment[]): void {
  const nPts = last - first + 1;
  if (nPts === 2) {
    const d = dist(pts[last], pts[first]) / 3;
    out.push({ p0: pts[first], p1: add(pts[first], scale(tHat1, d)), p2: add(pts[last], scale(tHat2, d)), p3: pts[last] });
    return;
  }
  let u = chordLengthParameterize(pts, first, last);
  let bez = generateBezier(pts, first, last, u, tHat1, tHat2);
  let { maxError, splitPoint } = computeMaxError(pts, first, last, bez, u);
  if (maxError < error) {
    out.push(bez);
    return;
  }
  const iterationError = error * error;
  if (maxError < iterationError) {
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
  fitCubic(pts, first, splitPoint, tHat1, tHatCenter, error, out);
  fitCubic(pts, splitPoint, last, scale(tHatCenter, -1), tHat2, error, out);
}

function generateBezier(pts: Vec2[], first: number, last: number, u: number[], tHat1: Vec2, tHat2: Vec2): CubicSegment {
  const nPts = last - first + 1;
  const A: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < nPts; i++) {
    A.push([scale(tHat1, B1(u[i])), scale(tHat2, B2(u[i]))]);
  }
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0; i < nPts; i++) {
    C[0][0] += dot(A[i][0], A[i][0]);
    C[0][1] += dot(A[i][0], A[i][1]);
    C[1][0] = C[0][1];
    C[1][1] += dot(A[i][1], A[i][1]);
    const tmp = sub(
      pts[first + i],
      add(
        add(scale(pts[first], B0(u[i])), scale(pts[first], B1(u[i]))),
        add(scale(pts[last], B2(u[i])), scale(pts[last], B3(u[i]))),
      ),
    );
    X[0] += dot(A[i][0], tmp);
    X[1] += dot(A[i][1], tmp);
  }
  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];
  let alphaL = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_X_C1 / det_C0_C1;
  let alphaR = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_C0_X / det_C0_C1;
  const segLength = dist(pts[first], pts[last]);
  const epsilon = 1e-6 * segLength;
  // Überlange Handles (Schleifen zwischen spärlichen Punkten) auf die Chord-Heuristik zurückfallen lassen
  if (alphaL < epsilon || alphaR < epsilon || alphaL > segLength * 1.6 || alphaR > segLength * 1.6) {
    const d = segLength / 3;
    alphaL = d;
    alphaR = d;
  }
  return {
    p0: pts[first],
    p1: add(pts[first], scale(tHat1, alphaL)),
    p2: add(pts[last], scale(tHat2, alphaR)),
    p3: pts[last],
  };
}

function reparameterize(pts: Vec2[], first: number, last: number, u: number[], bez: CubicSegment): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(newtonRaphsonRootFind(bez, pts[i], u[i - first]));
  return out;
}

function newtonRaphsonRootFind(Q: CubicSegment, P: Vec2, u: number): number {
  const Q_u = bezierPoint(Q.p0, Q.p1, Q.p2, Q.p3, u);
  const Q1 = [sub(Q.p1, Q.p0), sub(Q.p2, Q.p1), sub(Q.p3, Q.p2)].map((d) => scale(d, 3));
  const Q2 = [sub(Q1[1], Q1[0]), sub(Q1[2], Q1[1])].map((d) => scale(d, 2));
  const Q1_u = add(add(scale(Q1[0], (1 - u) * (1 - u)), scale(Q1[1], 2 * (1 - u) * u)), scale(Q1[2], u * u));
  const Q2_u = add(scale(Q2[0], 1 - u), scale(Q2[1], u));
  const numerator = (Q_u.x - P.x) * Q1_u.x + (Q_u.y - P.y) * Q1_u.y;
  const denominator = Q1_u.x * Q1_u.x + Q1_u.y * Q1_u.y + (Q_u.x - P.x) * Q2_u.x + (Q_u.y - P.y) * Q2_u.y;
  if (Math.abs(denominator) < 1e-12) return u;
  return u - numerator / denominator;
}

function chordLengthParameterize(pts: Vec2[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[i - first - 1] + dist(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function computeMaxError(pts: Vec2[], first: number, last: number, bez: CubicSegment, u: number[]): { maxError: number; splitPoint: number } {
  let splitPoint = Math.floor((last - first + 1) / 2) + first;
  let maxDist = 0;
  for (let i = first + 1; i < last; i++) {
    const P = bezierPoint(bez.p0, bez.p1, bez.p2, bez.p3, u[i - first]);
    const d = sub(P, pts[i]);
    const dd = d.x * d.x + d.y * d.y;
    if (dd >= maxDist) {
      maxDist = dd;
      splitPoint = i;
    }
  }
  return { maxError: Math.sqrt(maxDist), splitPoint };
}

function computeLeftTangent(pts: Vec2[], end: number): Vec2 {
  return normalize(sub(pts[end + 1], pts[end]));
}
function computeRightTangent(pts: Vec2[], end: number): Vec2 {
  return normalize(sub(pts[end - 1], pts[end]));
}
function computeCenterTangent(pts: Vec2[], center: number): Vec2 {
  const V1 = sub(pts[center - 1], pts[center]);
  const V2 = sub(pts[center], pts[center + 1]);
  return normalize({ x: (V1.x + V2.x) / 2, y: (V1.y + V2.y) / 2 });
}

const B0 = (u: number) => (1 - u) * (1 - u) * (1 - u);
const B1 = (u: number) => 3 * u * (1 - u) * (1 - u);
const B2 = (u: number) => 3 * u * u * (1 - u);
const B3 = (u: number) => u * u * u;
