/**
 * Farbwerkzeuge für den Earle-Stil (docs/ART.md): harte Tonstufen statt weicher Verläufe,
 * gestufte Luftperspektive, Leuchten. Alles reine Funktionen auf Hex-Farben.
 */
import { hexToRgb, mix, rgbToHex, shade } from './paint';

/** Relative Leuchtdichte (0–1) einer Hex-Farbe */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Drei (oder n) harte Töne einer Fläche: hell, mittel, dunkel. Der mittlere Ton ist die Farbe selbst,
 * die Stufen liegen symmetrisch darum (Earle: Licht-, Mittel- und Schattenfläche mit scharfer Kante).
 */
export function tones(base: string, n = 3, spread = 0.28): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1 … 1
    out.push(shade(base, -t * spread));
  }
  return out;
}

/**
 * Luftperspektive als Farbstufe: Spur z (−2 vorne … 2 hinten) mischt die Farbe stufenweise in den Himmel.
 * Keine lineare Mischung: vorne satt, hinten in zwei klaren Schritten heller und kühler.
 */
export function atmosphereStep(color: string, z: number, skyMid: string): string {
  const step = Math.max(0, Math.round(z) + 2); // 0 … 4
  const amount = [0, 0.06, 0.16, 0.3, 0.45][Math.min(4, step)];
  return mix(color, skyMid, amount);
}

/** Leuchtfarbe: Farbe aufgehellt und Richtung Weiß gezogen, für Kanten und Coins */
export function glowOf(color: string, strength = 0.35): string {
  const [r, g, b] = hexToRgb(shade(color, strength));
  return rgbToHex(Math.min(255, r * 1.05), Math.min(255, g * 1.05), Math.min(255, b * 1.05));
}

/** Gültige Hex-Farbe (#rgb oder #rrggbb)? */
export function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}
