/**
 * Interpolation zwischen zwei Physik-Zuständen (fester Schritt, variable Bildrate).
 * Das Rendering zeigt nie den rohen Schritt-Zustand, sondern einen Zwischenstand bei alpha ∈ [0, 1];
 * so bleibt die Bewegung auch in Zeitlupe (wenige Schritte pro Bild) und im Zeitraffer glatt.
 */
import type { CarState } from './trainSim';
import type { PartName, PartPose } from './passengers';
import { PART_NAMES } from './passengers';

/** Winkel auf dem kürzesten Weg interpolieren (über ±π hinweg) */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

const lin = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpUnit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): [number, number, number] {
  const x = lin(ax, bx, t);
  const y = lin(ay, by, t);
  const z = lin(az, bz, t);
  const l = Math.hypot(x, y, z);
  return l > 1e-9 ? [x / l, y / l, z / l] : [bx, by, bz];
}

/** Wagenzustand bei alpha zwischen a (vorher) und b (jetzt) nach out schreiben. Flags und Index kommen aus b. */
export function lerpCar(a: CarState, b: CarState, t: number, out: CarState): CarState {
  out.index = b.index;
  out.s = b.s;
  out.x = lin(a.x, b.x, t);
  out.y = lin(a.y, b.y, t);
  out.z = lin(a.z, b.z, t);
  [out.tx, out.ty, out.tz] = lerpUnit(a.tx, a.ty, a.tz, b.tx, b.ty, b.tz, t);
  [out.upx, out.upy, out.upz] = lerpUnit(a.upx, a.upy, a.upz, b.upx, b.upy, b.upz, t);
  [out.sx, out.sy, out.sz] = lerpUnit(a.sx, a.sy, a.sz, b.sx, b.sy, b.sz, t);
  out.bank = lerpAngle(a.bank, b.bank, t);
  out.angle = lerpAngle(a.angle, b.angle, t);
  out.gSeat = lin(a.gSeat, b.gSeat, t);
  out.gFwd = lin(a.gFwd, b.gFwd, t);
  out.gLat = lin(a.gLat, b.gLat, t);
  out.feltFwd = lin(a.feltFwd, b.feltFwd, t);
  out.feltUp = lin(a.feltUp, b.feltUp, t);
  out.feltSide = lin(a.feltSide, b.feltSide, t);
  out.vx = lin(a.vx, b.vx, t);
  out.vy = lin(a.vy, b.vy, t);
  out.inTunnel = b.inTunnel;
  out.inverted = b.inverted;
  return out;
}

/** Teile-Posen bei alpha zwischen a (vorher) und b (jetzt) nach out schreiben */
export function lerpParts(a: Record<PartName, PartPose>, b: Record<PartName, PartPose>, t: number, out: Record<PartName, PartPose>): void {
  for (const name of PART_NAMES) {
    const pa = a[name];
    const pb = b[name];
    const po = out[name];
    po.x = lin(pa.x, pb.x, t);
    po.y = lin(pa.y, pb.y, t);
    po.angle = lerpAngle(pa.angle, pb.angle, t);
  }
}
