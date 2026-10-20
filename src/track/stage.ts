/**
 * Die Bühne: fünf Tiefenspuren (z = -2..2). Projektion von Weltkoordinaten (x, Höhe y, Tiefe z)
 * auf die Bühnenebene (X, Y in Metern), die dann von der Kamera in Pixel umgerechnet wird.
 *
 *   X = x * k(z)
 *   Y = y * k(z) + rise(z)
 *   k(z) = LANE_SCALE ^ z          (hinten kleiner)
 *   rise(z) = z * LANE_RISE        (hinten höher im Bild)
 */
import { clamp } from '@/core/math';

export const LANE_MIN = -2;
export const LANE_MAX = 2;
export const LANE_COUNT = 5;
/** Tiefenabstand zwischen zwei Spuren in Metern (für die horizontale Krümmung der Kurven) */
export const LANE_DEPTH = 7;
/** Perspektivische Skalierung pro Spur */
export const LANE_SCALE = 0.88;
/** Anhebung der Bodenlinie pro Spur in Bühnen-Metern */
export const LANE_RISE = 4.2;

export const laneScale = (z: number): number => Math.pow(LANE_SCALE, z);
export const laneRise = (z: number): number => z * LANE_RISE;

export interface StagePoint {
  X: number;
  Y: number;
}

/** Welt → Bühne */
export function toStage(x: number, y: number, z: number): StagePoint {
  const k = laneScale(z);
  return { X: x * k, Y: y * k + laneRise(z) };
}

/** Bühne → Welt bei bekannter Tiefe z */
export function toWorld(X: number, Y: number, z: number): { x: number; y: number } {
  const k = laneScale(z);
  return { x: X / k, y: (Y - laneRise(z)) / k };
}

/** Nächste Spur zu einer Bühnen-Höhe Y (Bodenlinien liegen bei rise(z)). */
export function nearestLane(Y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let z = LANE_MIN; z <= LANE_MAX; z++) {
    const d = Math.abs(Y - laneRise(z));
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export const clampLane = (z: number): number => clamp(Math.round(z), LANE_MIN, LANE_MAX);

/** Luftperspektive: 0 vorne (satt) → 1 hinten (hell) */
export const laneAtmosphere = (z: number): number => (z - LANE_MIN) / (LANE_MAX - LANE_MIN);
