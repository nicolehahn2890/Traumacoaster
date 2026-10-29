/**
 * Knopf „Earle“ (docs/ZONENEDITOR-PLAN.md, Stufe 5; Plan 4.7): legt auf eine Fläche je nach Vorgabe Bänder, Lichtkante,
 * Innenschatten, Pünktchen und Papier oder Gouache, abgeleitet aus ihrer Grundfarbe und dem Licht der Zone. Danach ist
 * jede Schicht eine gewöhnliche Füllung im Füllstapel und einzeln änderbar. Ein zweiter Druck ersetzt die Earle-Schichten,
 * statt sie zu verdoppeln; eigene Verläufe bekommen höchstens Stufen dazu.
 *
 * **Platzhalter:** alle Vorgaben, Zahlen und Farbregeln, und welche Vorgabe „Automatisch“ wählt, bis die Stilprobe sie
 * bestätigt (Tor S5). Richtschnur bis dahin: harte Stufe, Verlauf in der Stufe; helle Punkte an der Lichtkante (Earles
 * Kronen, Florians Bild 6 und 8); keine Umrisslinien, Kanten nur aus Wertsprüngen. Ohne Renderer und DOM.
 */
import { hexToRgb, isEarle, isGradient, MAX_LAYERS, resolveColor, rgbToHex, type DotsFill, type EdgeFill, type GradientFill, type GrainFill, type Paint, type PaintColor, type SwatchMap, type ZoneFill } from './paint';
import type { LightValues, Material } from './nodes';

export type EarlePreset = 'hill' | 'rock' | 'meadow' | 'crown' | 'water';
export const EARLE_PRESETS: readonly EarlePreset[] = ['hill', 'rock', 'meadow', 'crown', 'water'];
export const EARLE_WORDS: Record<EarlePreset, string> = { hill: 'Hügel', rock: 'Fels', meadow: 'Wiese', crown: 'Krone', water: 'Wasser' };

/** neue Earle-Schicht mit Vorgaben (Platzhalter-Werte) */
export function freshEarle(kind: 'light' | 'shade' | 'dots' | 'grain'): EdgeFill | DotsFill | GrainFill {
  if (kind === 'light') return { type: 'light', width: 0.6, soft: 0, blend: 'screen', opacity: 0.55 };
  if (kind === 'shade') return { type: 'shade', width: 2, soft: 0, blend: 'multiply', opacity: 0.45 };
  if (kind === 'dots') return { type: 'dots', size: 0.28, gap: 1.8, density: 0.7, jitter: 0.35, source: 'light', reach: 2.5, tone: 0.5, seed: 1, blend: 'normal', opacity: 1 };
  return { type: 'grain', tile: 'paper', scale: 6, angle: 0, blend: 'softLight', opacity: 0.45 };
}

/** Farbe a zu b mischen (sRGB, wie die Vorschau) */
function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Farbton (Grad) und Sättigung einer Farbe */
function hueSat(hex: string): { h: number; s: number } {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0 };
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / Math.max(1e-6, mx) };
}

/** Vorgabe für „Automatisch“: nach Material, blaue Flächen werden Wasser (Platzhalter-Regel) */
export function autoPreset(material: Material, base: string): EarlePreset {
  const { h, s } = hueSat(base);
  if (s > 0.25 && h >= 180 && h <= 250 && material !== 'solid') return 'water';
  if (material === 'solid') return 'rock';
  if (material === 'airy') return 'crown';
  if (material === 'free') return 'meadow';
  return 'hill';
}

export interface EarleContext {
  /** Rahmen der Fläche in Pfad-Koordinaten (für die Griffe der Bänder) */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** Grundfarbe der Fläche (aufgelöst, #rrggbb) */
  base: string;
  /** Licht der Zone (aufgelöst) */
  light: LightValues;
  /** Maßstab der Form (Pfad → Meter der Ebene), für Tiefen in Metern */
  sx: number;
  sy: number;
}

/** Schichten einer Vorgabe über der Grundfarbe (von unten nach oben) */
export function presetLayers(preset: EarlePreset, c: EarleContext): ZoneFill[] {
  const { box, base, light } = c;
  const hi = mixHex(base, light.color, 0.32);
  const lo = mixHex(base, light.shade, 0.38);
  const cx = (box.minX + box.maxX) / 2;
  // Breiten gehen mit der Größe der Fläche (kürzere Seite in Metern der Ebene), in Grenzen
  const size = Math.min((box.maxX - box.minX) * Math.abs(c.sx), (box.maxY - box.minY) * Math.abs(c.sy));
  const rel = (k: number, lo_: number, hi_: number) => Math.round(Math.max(lo_, Math.min(hi_, k * size)) * 100) / 100;
  // senkrecht: oben hell, unten tief (in Pfad-Koordinaten zeigt y nach oben)
  const vertical = (stops: GradientFill['stops'], extra: Partial<GradientFill> = {}): GradientFill => ({ type: 'gradient', stops, x0: cx, y0: box.maxY, x1: cx, y1: box.minY, blend: 'normal', opacity: 1, ...extra });
  /** Tiefe eines Kantenverlaufs: so viele Meter der Ebene, als Griff in Pfad-Koordinaten (waagrecht) */
  const edgeDepth = (m: number): Pick<GradientFill, 'x0' | 'y0' | 'x1' | 'y1'> => ({ x0: cx, y0: box.minY, x1: cx + m / Math.max(1e-6, Math.abs(c.sx)), y1: box.minY });
  const light_ = (o: Partial<EdgeFill> = {}): EdgeFill => ({ ...(freshEarle('light') as EdgeFill), ...o });
  const shade = (o: Partial<EdgeFill> = {}): EdgeFill => ({ ...(freshEarle('shade') as EdgeFill), ...o });
  const dots = (o: Partial<DotsFill> = {}): DotsFill => ({ ...(freshEarle('dots') as DotsFill), ...o });
  const grain = (o: Partial<GrainFill> = {}): GrainFill => ({ ...(freshEarle('grain') as GrainFill), ...o });
  switch (preset) {
    case 'hill':
      return [
        vertical([{ t: 0, color: hi, a: 1 }, { t: 1, color: lo, a: 1 }], { steps: 4, inner: 0.35, wave: 0.35 }),
        shade({ width: rel(0.2, 0.8, 3), opacity: 0.42 }),
        light_({ width: rel(0.06, 0.3, 0.8), opacity: 0.5 }),
        dots({ source: 'light', reach: rel(0.1, 0.5, 1.6), size: 0.22, gap: 2, density: 0.55, tone: 0.45 }),
        grain({ tile: 'paper', opacity: 0.4 }),
      ];
    case 'rock':
      return [
        { type: 'gradient', edge: true, steps: 4, inner: 0.3, stops: [{ t: 0, color: hi, a: 1 }, { t: 1, color: lo, a: 1 }], ...edgeDepth(rel(0.25, 1, 6)), blend: 'normal', opacity: 1 },
        shade({ width: rel(0.15, 0.6, 2.4), opacity: 0.5 }),
        dots({ source: 'edge', reach: rel(0.08, 0.4, 1.4), size: 0.2, gap: 2.2, density: 0.5, tone: 0.45, seed: 3 }),
        grain({ tile: 'gouache', scale: 9, opacity: 0.3 }),
      ];
    case 'meadow':
      return [
        vertical([{ t: 0, color: hi, a: 1 }, { t: 1, color: base, a: 1 }]),
        light_({ width: rel(0.05, 0.25, 0.6), opacity: 0.55 }),
        dots({ source: 'even', size: 0.2, gap: 2.6, density: 0.15, tone: 0.3, seed: 5 }),
        grain({ tile: 'paper', opacity: 0.35 }),
      ];
    case 'crown':
      return [
        shade({ width: rel(0.3, 0.6, 4), opacity: 0.55 }),
        dots({ source: 'light', reach: rel(0.25, 0.6, 4), size: rel(0.05, 0.2, 0.5), gap: 1.3, density: 0.95, jitter: 0.45, tone: 0.6, seed: 7 }),
        grain({ tile: 'gouache', scale: 5, opacity: 0.25 }),
      ];
    case 'water':
      return [
        vertical([{ t: 0, color: hi, a: 1 }, { t: 1, color: lo, a: 1 }], { steps: 5, inner: 0.5, wave: 0.6 }),
        light_({ width: rel(0.03, 0.2, 0.5), opacity: 0.45 }),
        grain({ tile: 'gouache', scale: 12, angle: 0, opacity: 0.2 }),
      ];
  }
}

/**
 * Vorgabe auf einen Anstrich legen (ändert paint.fills): vorhandene Earle-Schichten fallen weg; Bänder gehen an den
 * obersten eigenen Verlauf (er bekommt Stufen), sonst kommt der Verlauf der Vorgabe dazu. Was nicht mehr in den Stapel
 * passt, fällt von oben weg
 */
export function applyPreset(paint: Paint, preset: EarlePreset, c: EarleContext): void {
  const own = (paint.fills ?? []).filter((f) => !isEarle(f));
  const layers = presetLayers(preset, c);
  const bands = layers[0] && isGradient(layers[0]) ? (layers[0] as GradientFill) : null;
  const rest = bands ? layers.slice(1) : layers;
  const top = [...own].reverse().find((f): f is GradientFill => f.type === 'gradient' && !f.hidden);
  if (bands && top && !bands.edge && !top.edge) {
    if (bands.steps) top.steps = bands.steps;
    if (bands.inner !== undefined) top.inner = bands.inner;
    if (bands.wave) top.wave = bands.wave;
  } else if (bands) own.push(bands);
  const fills = [...own, ...rest].slice(0, MAX_LAYERS - 1);
  if (fills.length) paint.fills = fills;
  else delete paint.fills;
}

/** Grundfarbe eines Anstrichs als #rrggbb im Look Tag (für die Ableitung der Vorgaben) */
export function baseHex(fill: PaintColor, swatches: SwatchMap): string {
  return resolveColor(fill, swatches, 'day');
}
