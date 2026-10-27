/**
 * Farbe, Verläufe, Füllstapel, Stile und Palette (docs/ZONENEDITOR-PLAN.md, Stufe 3; Plan 4.6 und 5.2). Eine Fläche zeigt
 * ihre **Grundfarbe** und darüber ihren **Füllstapel** (von unten nach oben): Farben und Verläufe mit Mischmodus und
 * Deckkraft, dazu Deckkraftverläufe, die alles darunter durchsichtig auslaufen lassen (Nebel, Licht, weiche Übergänge).
 * Eine Farbe ist ein Wert (`#rrggbb`) oder ein Verweis auf ein Feld der Zonenpalette (`@c3`); Looks tauschen die
 * Palettenfarben. Ein **Stil** ist ein gespeicherter Füllstapel mit Namen; eine Fläche kann ihn verknüpft tragen.
 *
 * Gerechnet wird wie in Illustrator und Photoshop im sRGB-Raum (Verläufe und Mischmodi nach W3C Compositing). Der
 * Shader im Weltrenderer (`src/world/planeMesh.ts`) rechnet dasselbe; `evalLayers` hier ist die Vorlage für Pipette,
 * Vorschaubilder und Tests. Ohne Renderer und DOM.
 */
import type { LookName } from '@/world/looks';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'softLight' | 'colorDodge' | 'color';
export const BLEND_MODES: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'softLight', 'colorDodge', 'color'];
/** Buchstabe (wie das „N“ in Procreate) und Name; Platzhalter: die Buchstaben */
export const BLEND_WORDS: Record<BlendMode, { letter: string; name: string }> = {
  normal: { letter: 'N', name: 'Normal' },
  multiply: { letter: 'M', name: 'Multiplizieren' },
  screen: { letter: 'Nm', name: 'Negativ multiplizieren' },
  overlay: { letter: 'I', name: 'Ineinanderkopieren' },
  softLight: { letter: 'W', name: 'Weiches Licht' },
  colorDodge: { letter: 'A', name: 'Farbig abwedeln' },
  color: { letter: 'F', name: 'Farbe' },
};

/** Farbe: Wert `#rrggbb` oder Verweis `@c3` auf ein Feld der Zonenpalette */
export type PaintColor = string;

/** Verlaufsstopp: Lage t (0 bis 1), Farbe, Deckkraft a; mid ist die Mitte zum nächsten Stopp (Anteil, 0,5 ohne Angabe) */
export interface GradientStop {
  t: number;
  color: PaintColor;
  a: number;
  mid?: number;
}

interface FillBase {
  blend: BlendMode;
  /** Deckkraft der Füllung (0 bis 1) */
  opacity: number;
  hidden?: boolean;
}

export interface ColorFill extends FillBase {
  type: 'color';
  color: PaintColor;
}

/**
 * Verlauf (`gradient`) oder Deckkraftverlauf (`fade`, nur die Deckkraft der Stopps zählt: was darunter liegt, läuft
 * durchsichtig aus). Anfang (x0, y0) und Ende (x1, y1), radial Mitte und Rand: in Pfad-Koordinaten der Form (Füllung
 * einer Form oder Fläche), in Ebenen-Koordinaten (Ebenenstapel) oder als Anteil am Rahmen der Fläche (Stil, 0 bis 1).
 */
export interface GradientFill extends FillBase {
  type: 'gradient' | 'fade';
  radial?: boolean;
  stops: GradientStop[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type ZoneFill = ColorFill | GradientFill;

/** höchstens so viele Schichten je Fläche (Grundfarbe mitgezählt; der Shader hat feste Plätze) */
export const MAX_LAYERS = 8;
export const MAX_STOPS = 16;

/**
 * Was eine Fläche zeigt: Grundfarbe (null = Loch), darüber der Füllstapel, die Deckkraft der ganzen Fläche; mit style
 * gilt statt dessen der verknüpfte Stil (fill und fills bleiben als Rückfall, falls der Stil fehlt)
 */
export interface Paint {
  fill: PaintColor | null;
  fills?: ZoneFill[];
  style?: string;
  opacity?: number;
}

/** Feld der Zonenpalette (Plan 4.6): Name, Farbe, Farben je Look (Palettentausch, Paket 2 und Paket 0 Regel 9) */
export interface ZoneSwatch {
  id: string;
  kind: 'swatch';
  name: string;
  color: string;
  looks?: Partial<Record<LookName, string>>;
}

/** gespeicherter Füllstapel mit Namen; Verlaufsgriffe als Anteil am Rahmen der Fläche, damit er auf jede Fläche passt */
export interface ZoneStyle {
  id: string;
  kind: 'style';
  name: string;
  fill: PaintColor;
  fills?: ZoneFill[];
  opacity?: number;
}

// ------------------------------------------------------------------ Farben

const HEX = /^#[0-9a-f]{6}$/;
const REF = /^@c\d{1,6}$/;

export const isHex = (c: unknown): c is string => typeof c === 'string' && HEX.test(c);
export const isRef = (c: unknown): c is string => typeof c === 'string' && REF.test(c);

/** Farbe aus der Datei: Wert (klein geschrieben) oder Palettenverweis, sonst null */
export function parseColor(v: unknown): PaintColor | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  return HEX.test(s) || REF.test(s) ? s : null;
}

/** Palettenfelder nach Kennung */
export type SwatchMap = ReadonlyMap<string, ZoneSwatch>;

/** Wert einer Farbe im Look (Palettenfeld: Farbe des Looks, sonst die Grundfarbe; fehlt das Feld: mittleres Grau) */
export function resolveColor(c: PaintColor, swatches: SwatchMap, look: LookName = 'day'): string {
  if (c[0] !== '@') return c;
  const s = swatches.get(c.slice(1));
  return s ? (s.looks?.[look] ?? s.color) : '#808080';
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ------------------------------------------------------------------ Lesen, Schreiben, Kopieren

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;
const r4 = (v: number): number => Math.round(v * 10000) / 10000 || 0;

function parseStops(v: unknown): GradientStop[] | null {
  if (!Array.isArray(v)) return null;
  const out: GradientStop[] = [];
  for (const raw of v.slice(0, MAX_STOPS)) {
    const o = raw as Record<string, unknown>;
    const color = o ? parseColor(o.color) : null;
    if (!o || !num(o.t) || !color) continue;
    const s: GradientStop = { t: clamp01(o.t), color, a: num(o.a) ? clamp01(o.a) : 1 };
    if (num(o.mid) && Math.abs(o.mid - 0.5) > 1e-4) s.mid = Math.max(0.02, Math.min(0.98, o.mid));
    out.push(s);
  }
  out.sort((a, b) => a.t - b.t);
  return out.length >= 2 ? out : null;
}

/** eine Füllung aus der Datei, Kaputtes gibt null */
export function parseFill(v: unknown): ZoneFill | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const blend = (BLEND_MODES as readonly string[]).includes(String(o.blend)) ? (o.blend as BlendMode) : 'normal';
  const opacity = num(o.opacity) ? clamp01(o.opacity) : 1;
  const hidden = o.hidden === true;
  let f: ZoneFill | null = null;
  if (o.type === 'color') {
    const color = parseColor(o.color);
    if (color) f = { type: 'color', color, blend, opacity };
  } else if (o.type === 'gradient' || o.type === 'fade') {
    const stops = parseStops(o.stops);
    if (stops && num(o.x0) && num(o.y0) && num(o.x1) && num(o.y1)) {
      f = { type: o.type, stops, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, blend: o.type === 'fade' ? 'normal' : blend, opacity };
      if (o.radial === true) f.radial = true;
    }
  }
  if (f && hidden) f.hidden = true;
  return f;
}

export function parseFills(v: unknown): ZoneFill[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map(parseFill)
    .filter((f): f is ZoneFill => !!f)
    .slice(0, MAX_LAYERS - 1);
  return out.length ? out : undefined;
}

/** Füllung für die Zonendatei, gerundet */
export function serializeFill(f: ZoneFill): Record<string, unknown> {
  const o: Record<string, unknown> = { type: f.type };
  if (f.type === 'color') o.color = f.color;
  else {
    if (f.radial) o.radial = true;
    o.x0 = r3(f.x0);
    o.y0 = r3(f.y0);
    o.x1 = r3(f.x1);
    o.y1 = r3(f.y1);
    o.stops = f.stops.map((s) => {
      const q: Record<string, unknown> = { t: r4(s.t), color: s.color };
      if (s.a < 1) q.a = r3(s.a);
      if (s.mid !== undefined) q.mid = r3(s.mid);
      return q;
    });
  }
  if (f.type !== 'fade') o.blend = f.blend;
  o.opacity = r3(f.opacity);
  if (f.hidden) o.hidden = true;
  return o;
}

export function cloneFill(f: ZoneFill): ZoneFill {
  return f.type === 'color' ? { ...f } : { ...f, stops: f.stops.map((s) => ({ ...s })) };
}

export const cloneFills = (fills: readonly ZoneFill[] | undefined): ZoneFill[] | undefined => (fills ? fills.map(cloneFill) : undefined);

/** Anfang und Ende jedes Verlaufs abbilden (Drehen, Spiegeln, Umrechnen zwischen Formen); ändert in place */
export function mapFillPoints(fills: readonly ZoneFill[] | undefined, fn: (x: number, y: number) => [number, number]): void {
  for (const f of fills ?? []) {
    if (f.type === 'color') continue;
    [f.x0, f.y0] = fn(f.x0, f.y0);
    [f.x1, f.y1] = fn(f.x1, f.y1);
    f.x0 = r3(f.x0);
    f.y0 = r3(f.y0);
    f.x1 = r3(f.x1);
    f.y1 = r3(f.y1);
  }
}

/** gleicher Anstrich (für das Aufräumen der Füllpunkte) */
export function samePaint(a: Paint, b: Paint): boolean {
  return a.fill === b.fill && (a.style ?? '') === (b.style ?? '') && (a.opacity ?? 1) === (b.opacity ?? 1) && JSON.stringify((a.fills ?? []).map(serializeFill)) === JSON.stringify((b.fills ?? []).map(serializeFill));
}

// ------------------------------------------------------------------ Schichten: was der Shader zeichnet

/** Rahmen in Pfad-Koordinaten (Stile rechnen ihre Griffe darauf um) */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Füllungen eines Stils (Griffe am Rahmen) auf einen Rahmen bringen */
export function fillsInBox(fills: readonly ZoneFill[] | undefined, box: Box): ZoneFill[] | undefined {
  const out = cloneFills(fills);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  mapFillPoints(out, (u, v) => [box.minX + u * w, box.minY + v * h]);
  return out;
}

/** umgekehrt: Füllungen einer Fläche als Stil (Griffe als Anteil am Rahmen) */
export function fillsToBox(fills: readonly ZoneFill[] | undefined, box: Box): ZoneFill[] | undefined {
  const out = cloneFills(fills);
  const w = Math.max(1e-6, box.maxX - box.minX);
  const h = Math.max(1e-6, box.maxY - box.minY);
  mapFillPoints(out, (x, y) => [(x - box.minX) / w, (y - box.minY) / h]);
  return out;
}

/**
 * Schichten einer Fläche: die Grundfarbe als unterste Schicht, darüber die sichtbaren Füllungen; ein verknüpfter Stil
 * (in styles) ersetzt Grundfarbe, Füllungen und Deckkraft, seine Griffe kommen auf den Rahmen box. null bei einem Loch
 */
export function paintLayers(paint: Paint, styles: ReadonlyMap<string, ZoneStyle>, box: Box): { layers: ZoneFill[]; opacity: number } | null {
  if (paint.fill === null) return null;
  const style = paint.style ? styles.get(paint.style) : undefined;
  const fill = style ? style.fill : paint.fill;
  const fills = style ? fillsInBox(style.fills, box) : paint.fills;
  const layers: ZoneFill[] = [{ type: 'color', color: fill, blend: 'normal', opacity: 1 }];
  for (const f of fills ?? []) if (!f.hidden && layers.length < MAX_LAYERS) layers.push(f);
  return { layers, opacity: clamp01((style ? style.opacity : paint.opacity) ?? 1) };
}

/**
 * Schichten ab der obersten, die alles darunter verdeckt (deckende Farbe oder deckender Verlauf, Mischmodus normal,
 * volle Deckkraft): was darunter liegt, ist nicht zu sehen und braucht keine Rechnung (Leistung am Handy)
 */
export function visibleLayers(layers: readonly ZoneFill[]): ZoneFill[] {
  let from = 0;
  layers.forEach((f, i) => {
    if (f.hidden || f.type === 'fade' || f.blend !== 'normal' || f.opacity < 1) return;
    if (f.type === 'color' || f.stops.every((st) => st.a >= 1)) from = i;
  });
  return layers.slice(from);
}

/** kann die Fläche durchsichtig werden (Deckkraft unter 1 oder ein Deckkraftverlauf)? */
export function layersClear(layers: readonly ZoneFill[], opacity = 1): boolean {
  return opacity < 1 || layers.some((f) => f.type === 'fade');
}

// ------------------------------------------------------------------ Verlauf als Farbband

export const RAMP = 256;

/**
 * Farbband eines Verlaufs (RAMP Werte r, g, b, a in sRGB, 0 bis 1): zwischen zwei Stopps linear, die Mitte mid
 * verschiebt den halben Weg (wie Illustrators Mittelpunkt); vor dem ersten und nach dem letzten Stopp gleichbleibend
 */
export function rampOf(stops: readonly GradientStop[], swatches: SwatchMap, look: LookName = 'day'): Float32Array {
  const out = new Float32Array(RAMP * 4);
  const rgb = stops.map((s) => hexToRgb(resolveColor(s.color, swatches, look)));
  for (let i = 0; i < RAMP; i++) {
    const t = i / (RAMP - 1);
    let k = 0;
    while (k < stops.length - 1 && stops[k + 1].t < t) k++;
    const a = stops[k];
    const b = stops[Math.min(k + 1, stops.length - 1)];
    let u = b.t > a.t ? clamp01((t - a.t) / (b.t - a.t)) : t < a.t ? 0 : 1;
    if (t <= stops[0].t) u = 0;
    const m = a.mid ?? 0.5;
    if (u > 0 && u < 1) u = u < m ? (0.5 * u) / m : 0.5 + (0.5 * (u - m)) / (1 - m);
    const ca = rgb[k];
    const cb = rgb[Math.min(k + 1, stops.length - 1)];
    const j = i * 4;
    out[j] = ca[0] + (cb[0] - ca[0]) * u;
    out[j + 1] = ca[1] + (cb[1] - ca[1]) * u;
    out[j + 2] = ca[2] + (cb[2] - ca[2]) * u;
    out[j + 3] = a.a + (b.a - a.a) * u;
  }
  return out;
}

/** Lage im Verlauf (0 bis 1) am Punkt (x, y): linear entlang Anfang → Ende, radial als Abstand zur Mitte */
export function gradientT(f: GradientFill, x: number, y: number): number {
  const dx = f.x1 - f.x0;
  const dy = f.y1 - f.y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0;
  if (f.radial) return clamp01(Math.hypot(x - f.x0, y - f.y0) / Math.sqrt(len2));
  return clamp01(((x - f.x0) * dx + (y - f.y0) * dy) / len2);
}

// ------------------------------------------------------------------ Mischmodi (W3C Compositing, wie der Shader)

type RGB = [number, number, number];

const lum = (c: RGB): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let out: RGB = [...c];
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / Math.max(1e-6, l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / Math.max(1e-6, x - l)) as RGB;
  return out;
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

function softD(b: number): number {
  return b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
}

/** Mischfunktion B(Hintergrund, Quelle) je Kanal oder ganz (Farbe) */
export function blendRgb(mode: BlendMode, cb: RGB, cs: RGB): RGB {
  const ch = (f: (b: number, s: number) => number): RGB => [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
  switch (mode) {
    case 'multiply':
      return ch((b, s) => b * s);
    case 'screen':
      return ch((b, s) => b + s - b * s);
    case 'overlay':
      return ch((b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)));
    case 'softLight':
      return ch((b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (softD(b) - b)));
    case 'colorDodge':
      return ch((b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))));
    case 'color':
      return setLum(cs, lum(cb));
    default:
      return [...cs];
  }
}

/**
 * Schichten am Punkt auswerten wie der Shader: von unten nach oben über „nichts“ (durchsichtig), je Schicht Mischmodus
 * und Deckkraft (W3C: Quelle mit dem gemischten Wert über den Hintergrund); ein Deckkraftverlauf nimmt dem bisherigen
 * Ergebnis Deckkraft. Ergebnis: Farbe (sRGB, nicht vormultipliziert) und Deckkraft
 */
export function evalLayers(layers: readonly ZoneFill[], x: number, y: number, swatches: SwatchMap, look: LookName = 'day', below: { rgb: RGB; a: number } = { rgb: [0, 0, 0], a: 0 }): { rgb: RGB; a: number } {
  // vormultipliziert
  let pr: RGB = [below.rgb[0] * below.a, below.rgb[1] * below.a, below.rgb[2] * below.a];
  let pa = below.a;
  for (const f of layers) {
    if (f.hidden) continue;
    let cs: RGB;
    let as: number;
    if (f.type === 'color') {
      cs = hexToRgb(resolveColor(f.color, swatches, look));
      as = 1;
    } else {
      const ramp = rampOf(f.stops, swatches, look);
      const p = gradientT(f, x, y) * (RAMP - 1);
      const i = Math.min(RAMP - 2, Math.floor(p));
      const u = p - i;
      const at = (k: number) => ramp[i * 4 + k] + (ramp[(i + 1) * 4 + k] - ramp[i * 4 + k]) * u;
      cs = [at(0), at(1), at(2)];
      as = at(3);
    }
    if (f.type === 'fade') {
      const m = 1 - f.opacity + f.opacity * as;
      pr = [pr[0] * m, pr[1] * m, pr[2] * m];
      pa *= m;
      continue;
    }
    as *= f.opacity;
    const cb: RGB = pa > 1e-6 ? [pr[0] / pa, pr[1] / pa, pr[2] / pa] : [0, 0, 0];
    const B = blendRgb(f.blend, cb, cs);
    const mixed: RGB = [cs[0] * (1 - pa) + B[0] * pa, cs[1] * (1 - pa) + B[1] * pa, cs[2] * (1 - pa) + B[2] * pa];
    pr = [mixed[0] * as + pr[0] * (1 - as), mixed[1] * as + pr[1] * (1 - as), mixed[2] * as + pr[2] * (1 - as)];
    pa = as + pa * (1 - as);
  }
  return { rgb: pa > 1e-6 ? [pr[0] / pa, pr[1] / pa, pr[2] / pa] : [0, 0, 0], a: pa };
}

// ------------------------------------------------------------------ Vorgaben

/** zwei Stopps von a nach b */
export function twoStops(a: PaintColor, b: PaintColor): GradientStop[] {
  return [
    { t: 0, color: a, a: 1 },
    { t: 1, color: b, a: 1 },
  ];
}

/** Farbe eines Stopps an der Stelle t (für einen neuen Stopp auf der Linie) */
export function colorAt(stops: readonly GradientStop[], t: number, swatches: SwatchMap, look: LookName = 'day'): { color: string; a: number } {
  const ramp = rampOf(stops, swatches, look);
  const i = Math.round(clamp01(t) * (RAMP - 1)) * 4;
  return { color: rgbToHex(ramp[i], ramp[i + 1], ramp[i + 2]), a: ramp[i + 3] };
}
