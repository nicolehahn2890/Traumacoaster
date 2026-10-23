/**
 * Der rohe Strich beim Ziehen ist ein Puffer, der nicht nur wächst: Läuft der Zeiger auf der eigenen Linie zurück,
 * wird der Strich bis dorthin ausradiert (kleine Korrekturen ohne Loslassen); stößt die Lesart am Spurende an, wird
 * der Strich am Scheitel abgeschnitten, damit die Bahn dort stehen bleibt, statt vom Finger wegzuspringen.
 */
import { pointSegmentDistance } from '@/core/math';
import type { StagePoint } from './stage';

/** Zurückziehen: so genau entgegen der Linie muss die Bewegung laufen (cos, Winkel über rund 150°) */
export const RETRACT_COS = -0.85;

/**
 * Zurückziehen: Index, bis zu dem der Strich erhalten bleibt (der Zeiger wird das neue Ende), oder −1.
 * Bedingung: der Zeiger liegt näher als tol an einem Stück des Strichs und bewegt sich fast genau entgegen dessen
 * Richtung (Winkel über 150°). Gesucht wird vom Ende aus über reach Bühnen-Meter: Ein Rückzug beginnt immer am
 * Ende und bleibt dort, weil der Zeiger nach jedem Schnitt das Ende ist. Ein Strich, der seine Linie nur kreuzt
 * (Looping, Acht, Rückweg über einen Hügel), läuft schräg oder quer zu ihr; eine Kehre liegt eine Spur neben der
 * Anfahrt: beides bleibt.
 */
export function retractIndex(stroke: StagePoint[], p: StagePoint, motion: { X: number; Y: number }, tol: number, reach: number): number {
  const n = stroke.length;
  if (n < 3) return -1;
  const ml = Math.hypot(motion.X, motion.Y);
  if (ml < 1e-6) return -1;
  const pv = { x: p.X, y: p.Y };
  let walked = 0;
  for (let i = n - 2; i >= 1 && walked < reach; i--) {
    const a = stroke[i];
    const b = stroke[i + 1];
    const tx = b.X - a.X;
    const ty = b.Y - a.Y;
    const tl = Math.hypot(tx, ty);
    walked += tl;
    if (tl < 1e-6) continue;
    if ((motion.X * tx + motion.Y * ty) / (ml * tl) > RETRACT_COS) continue;
    let best = pointSegmentDistance(pv, { x: a.X, y: a.Y }, { x: b.X, y: b.Y }).d;
    if (best > tol) continue;
    // das nächstgelegene Stück: weiter zurück, solange der Abstand noch kleiner wird und die Richtung passt
    let k = i;
    while (k > 1) {
      const c = stroke[k - 1];
      const e = stroke[k];
      const ux = e.X - c.X;
      const uy = e.Y - c.Y;
      const ul = Math.hypot(ux, uy);
      if (ul > 1e-6 && (motion.X * ux + motion.Y * uy) / (ml * ul) > RETRACT_COS) break;
      const d = pointSegmentDistance(pv, { x: c.X, y: c.Y }, { x: e.X, y: e.Y }).d;
      if (d > best) break;
      best = d;
      k--;
    }
    return k;
  }
  return -1;
}

/**
 * Index des Strichpunkts, der dem Punkt at am nächsten liegt (vom Ende her gesucht, bis der Abstand wieder deutlich
 * wächst), oder −1, wenn keiner näher als maxDist liegt.
 */
export function cutIndexNear(stroke: StagePoint[], at: { x: number; y: number }, maxDist: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = stroke.length - 1; i >= 1; i--) {
    const d = Math.hypot(stroke[i].X - at.x, stroke[i].Y - at.y);
    if (d < bd) {
      bd = d;
      best = i;
    } else if (d > bd + 15) break;
  }
  return bd <= maxDist ? best : -1;
}
