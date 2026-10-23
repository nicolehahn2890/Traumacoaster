/**
 * Form einer Kehre: eine Halbwende (180°) mit Übergangsbögen. Ein reiner Halbkreis springt an Ein- und Ausfahrt
 * von Krümmung 0 auf 1/R (die Querkraft setzt schlagartig ein, und die Schiene knickt sichtbar an den Nahtstellen).
 * Hier steigt die Krümmung über die ersten 20 % der Bogenlänge weich an (Smoothstep), bleibt dann konstant und
 * fällt über die letzten 20 % wieder ab. Die Wende dreht um 180° und versetzt die Bahn seitlich um D Meter; sie
 * ist dafür etwas weiter (Vorwärts-Ausladung rund 0,69·D statt 0,5·D) und länger (rund 1,93·D statt 1,57·D) als
 * ein Halbkreis, der engste Radius in der Mitte bleibt fast D/2. Alles ist aus einer Einheitskurve tabelliert und wird nur mit D skaliert.
 */
import { smoothstep } from '@/core/math';

const RAMP = 0.2;
const N = 512;
const psi = new Float64Array(N + 1);
const U = new Float64Array(N + 1);
const W = new Float64Array(N + 1);
let uMaxUnit = 0;
let kMax = 0;
(() => {
  const e = (t: number): number => (t < RAMP ? smoothstep(t / RAMP) : t > 1 - RAMP ? smoothstep((1 - t) / RAMP) : 1);
  const dt = 1 / N;
  let area = 0;
  for (let k = 0; k < N; k++) area += e((k + 0.5) * dt) * dt;
  const c = Math.PI / area;
  for (let k = 1; k <= N; k++) {
    psi[k] = psi[k - 1] + c * e((k - 0.5) * dt) * dt;
    const mid = (psi[k - 1] + psi[k]) / 2;
    U[k] = U[k - 1] + Math.cos(mid) * dt;
    W[k] = W[k - 1] + Math.sin(mid) * dt;
    if (U[k] > uMaxUnit) {
      uMaxUnit = U[k];
      kMax = k;
    }
  }
})();
/** Skalierung der Einheitskurve auf einen seitlichen Versatz D */
const scaleFor = (D: number): number => D / W[N];

/** Vorwärts-Ausladung (m) einer Wende mit seitlichem Versatz D */
export const turnForwardExtent = (D: number): number => uMaxUnit * scaleFor(D);
/** Bogenlänge (m) der ganzen Wende */
export const turnLength = (D: number): number => scaleFor(D);

/** Punkt der Wende bei Richtungswinkel theta (0 … π): u vorwärts, w seitlich (0 … D), beides in Metern */
export function turnPoint(theta: number, D: number): { u: number; w: number } {
  const th = Math.max(0, Math.min(Math.PI, theta));
  // psi ist monoton: binäre Suche nach dem Tabellenintervall
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (psi[m] <= th) lo = m;
    else hi = m;
  }
  const span = psi[hi] - psi[lo];
  const f = span > 1e-12 ? (th - psi[lo]) / span : 0;
  const s = scaleFor(D);
  return { u: (U[lo] + (U[hi] - U[lo]) * f) * s, w: (W[lo] + (W[hi] - W[lo]) * f) * s };
}

/**
 * Richtungswinkel auf dem Rückweg der Wende, an dem die Bahn um `retreat` Meter hinter die Ausladung zurückgekommen
 * ist (Teilbogen, wenn der Strich die Wende noch nicht zu Ende gezeichnet hat); bei vollem Rückweg π.
 */
export function turnThetaForRetreat(D: number, retreat: number): number {
  const s = scaleFor(D);
  const target = uMaxUnit - retreat / s;
  if (target <= U[N]) return Math.PI;
  if (target >= uMaxUnit) return psi[kMax];
  let k = kMax;
  while (k < N && U[k + 1] > target) k++;
  const span = U[k] - U[k + 1];
  const f = span > 1e-12 ? (U[k] - target) / span : 0;
  return psi[k] + (psi[k + 1] - psi[k]) * f;
}
