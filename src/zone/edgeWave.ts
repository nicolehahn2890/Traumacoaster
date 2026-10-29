/**
 * Kantenwelle (docs/ZONENEDITOR-PLAN.md, Stufe 5; Plan 4.7 „Kantenwelle: macht die Kontur unregelmäßig wie gemalt; wird
 * beim Kompilieren in die Kontur gebacken“). Die Flächen einer Form werden mit einem ruhigen Rauschfeld verschoben: Jeder
 * Punkt der Ebene wandert ein Stück (höchstens amp, Wellenlänge len), Nachbarpunkte fast gleich. Weil es ein Feld über die
 * ganze Ebene ist, wandern gemeinsame Kanten zweier Flächen und die Enden von Teilungslinien gleich mit; es entstehen keine
 * Spalten. Nur für das Bild (Dreiecke, Kantenabstand); Andockkanten, Freiraum und Pinsel lesen die glatte Form, der
 * Unterschied ist höchstens amp.
 *
 * **Platzhalter:** die Vorgabewerte. Ohne Renderer und DOM.
 */
import type { Face } from './faces';
import type { Poly } from './path';

export interface EdgeWave {
  /** größter Versatz (Meter der Ebene) */
  amp: number;
  /** Wellenlänge (Meter der Ebene) */
  len: number;
  /** Zufallssamen (ganze Zahl) */
  seed: number;
  hidden?: boolean;
}

export const WAVE_DEFAULT: Readonly<EdgeWave> = { amp: 0.25, len: 3, seed: 1 };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Kantenwelle aus der Datei (Versatz höchstens ein Viertel der Wellenlänge, sonst überschlägt sich die Kontur) */
export function parseWave(v: unknown): EdgeWave | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const len = num(o.len) ? clamp(o.len, 0.2, 100) : WAVE_DEFAULT.len;
  const w: EdgeWave = { amp: num(o.amp) ? clamp(o.amp, 0, len / 4) : Math.min(WAVE_DEFAULT.amp, len / 4), len, seed: num(o.seed) ? Math.round(clamp(o.seed, 0, 9999)) : WAVE_DEFAULT.seed };
  if (o.hidden === true) w.hidden = true;
  return w;
}

export function serializeWave(w: EdgeWave): Record<string, unknown> {
  const r3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
  const o: Record<string, unknown> = { amp: r3(w.amp), len: r3(w.len), seed: w.seed };
  if (w.hidden) o.hidden = true;
  return o;
}

/** ganzzahliger Zufall je Gitterpunkt (ohne Sinus) */
function hash(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(s, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** glattes Wertrauschen, −1 bis 1 */
function noise(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Versatz am Punkt (Meter der Ebene): zwei Lagen Rauschen je Richtung, höchstens amp */
export function waveOffset(w: EdgeWave, x: number, y: number): [number, number] {
  const k = 1 / w.len;
  const nx = 0.7 * noise(x * k, y * k, w.seed * 2 + 1) + 0.3 * noise(x * k * 2.3 + 17, y * k * 2.3, w.seed * 2 + 1);
  const ny = 0.7 * noise(x * k + 31, y * k, w.seed * 2 + 2) + 0.3 * noise(x * k * 2.3, y * k * 2.3 + 43, w.seed * 2 + 2);
  return [nx * w.amp, ny * w.amp];
}

/**
 * Fläche mit Kantenwelle (Pfad-Koordinaten wie die Fläche). Das Feld liegt in Metern der Ebene relativ zum Ursprung der
 * Form (sx, sy: Maßstab), so bleibt die Welle beim Verschieben an der Form und beim Skalieren gleich groß
 */
export function wavyFace(face: Face, w: EdgeWave, sx: number, sy: number): Face {
  const ax = Math.abs(sx) || 1;
  const ay = Math.abs(sy) || 1;
  const warp = (poly: Poly): Poly =>
    poly.map(([x, y]) => {
      const [dx, dy] = waveOffset(w, x * sx, y * sy);
      return [x + (dx * Math.sign(sx || 1)) / ax, y + (dy * Math.sign(sy || 1)) / ay];
    });
  return { ...face, outline: warp(face.outline), holes: face.holes.map(warp) };
}

/** zwischengespeichert je Fläche, Welle und Maßstab (Verschieben rechnet nichts neu) */
const cache = new WeakMap<Face, Map<string, Face>>();

export function cachedWavyFace(face: Face, w: EdgeWave, sx: number, sy: number): Face {
  let byKey = cache.get(face);
  if (!byKey) {
    byKey = new Map();
    cache.set(face, byKey);
  }
  const key = `${w.amp},${w.len},${w.seed},${sx.toFixed(4)},${sy.toFixed(4)}`;
  let f = byKey.get(key);
  if (!f) {
    f = wavyFace(face, w, sx, sy);
    if (byKey.size > 3) byKey.clear();
    byKey.set(key, f);
  }
  return f;
}
