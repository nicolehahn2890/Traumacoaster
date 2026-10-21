/**
 * Aufklappen der Spurstreifen beim Übergang Karte → Level: Die fünf Spuren der Miniatur liegen flach auf der
 * Scheibe und fächern sich nacheinander auf (hinten zuerst, je Spur rund 60 ms versetzt), bevor das Level-Bild
 * übernimmt. Reine Funktionen in Übergangs-Fortschritt p (0 = Karte, 1 = Level).
 */
import { LANE_MAX, LANE_MIN } from '@/track/stage';

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Beginn des Aufklappens je Spur: hinterste Spur zuerst */
export function unfoldStart(z: number): number {
  return 0.15 + (LANE_MAX - z) * 0.039;
}

/** Klappwinkel 0 … π/2 der Spur z bei Fortschritt p */
export function unfoldAngle(z: number, p: number): number {
  return (Math.PI / 2) * smooth((p - unfoldStart(z)) / 0.4);
}

/**
 * Zusätzliche Höhe (in Spur-Abständen), um die der Streifen z beim Aufklappen vom Boden abhebt: er steigt mit dem
 * Winkel und legt sich am Ende wieder auf das Level-Bild (Hub klingt ab 70 % aus).
 */
export function unfoldLift(z: number, p: number): number {
  const a = unfoldAngle(z, p);
  const settle = 1 - smooth((p - 0.7) / 0.25);
  return (z - LANE_MIN) * Math.sin(a) * settle;
}

/** Breiten-Stauchung des Streifens (0,9 … 1), damit sich die Ebenen beim Aufklappen sichtbar lösen */
export function unfoldSquash(z: number, p: number): number {
  return 0.9 + 0.1 * Math.sin(unfoldAngle(z, p));
}
