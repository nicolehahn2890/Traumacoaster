/**
 * Punktkronen (docs/ZONENEDITOR-PLAN.md, Stufe 5; Plan 4.7 „Punktkrone“ und 3.2 „Kronenpunkte“): Eine Form wird zur
 * Baumkrone aus echten Punkten wie Florians Bild 6. Die Punkte liegen als Poisson-Scheibe (Bridson) in der Form und ein
 * Stück über ihren Rand hinaus, so bekommt die Krone einen gebuckelten Umriss aus Punkten statt einer glatten Kante. Dicht
 * sind sie an der Kante zum Licht, zur Schattenseite werden sie spärlich (Earle: nur die lichtzugewandte Kante trägt helle
 * Punkte). Jeder Punkt hat eine von drei Tonstufen (je näher an der Lichtkante, desto heller), einen Versatz in der Tiefe
 * (echte Tiefe beim Schwenken) und eine Phase für den Wind. Die Krone selbst bleibt eine gewöhnliche Form darunter.
 *
 * Gerechnet wird beim Aufbau, nicht je Bild, und zwischengespeichert, solange Form, Maßstab, Werte und Lichtrichtung gleich
 * bleiben. **Platzhalter:** die Vorgabewerte. Ohne Renderer und DOM.
 */
import type { Face } from './faces';
import { edgeAtPoint, faceEdge, type EdgeRaster } from './edgeDistance';

export interface CrownParams {
  /** Durchmesser der Punkte (Meter der Ebene) */
  size: number;
  /** Mindestabstand der Mitten als Vielfaches des Durchmessers (1 = berühren sich) */
  gap: number;
  /** so weit von der Lichtkante sind die Punkte dicht (Meter), danach dünnen sie aus */
  reach: number;
  /** Anteil der Punkte, die bleiben, wo die Lichtkante voll wirkt (0 bis 1); auf der Schattenseite knapp die Hälfte davon */
  density: number;
  /** Helligkeit der hellsten Stufe: hellere Stufe der Kronenfarbe, warm zum Licht (0 bis 1) */
  tone: number;
  /** Ausschlag im Wind (Meter) */
  wind: number;
  /** so weit dürfen Punkte über den Rand hinausstehen (Meter) */
  out: number;
  /** Zufallssamen (ganze Zahl) */
  seed: number;
  hidden?: boolean;
}

/** Platzhalter-Vorgabe einer Punktkrone */
export const CROWN_DEFAULT: Readonly<CrownParams> = { size: 0.3, gap: 1.06, reach: 2.4, density: 1, tone: 0.8, wind: 0.05, out: 0.15, seed: 1 };

/** Werte je Punkt in crownPoints: Lage x, y (Meter der Ebene relativ zum Ursprung der Form), Durchmesser, Stufe 0–2, Tiefe, Phase */
export const CROWN_STRIDE = 6;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Punktkrone aus der Datei, Kaputtes gekappt; keine Krone: undefined */
export function parseCrown(v: unknown): CrownParams | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const d = CROWN_DEFAULT;
  const c: CrownParams = {
    size: num(o.size) ? clamp(o.size, 0.05, 10) : d.size,
    gap: num(o.gap) ? clamp(o.gap, 0.8, 4) : d.gap,
    reach: num(o.reach) ? clamp(o.reach, 0.1, 40) : d.reach,
    density: num(o.density) ? clamp(o.density, 0, 1) : d.density,
    tone: num(o.tone) ? clamp(o.tone, 0, 1) : d.tone,
    wind: num(o.wind) ? clamp(o.wind, 0, 2) : d.wind,
    out: num(o.out) ? clamp(o.out, 0, 5) : d.out,
    seed: num(o.seed) ? Math.round(clamp(o.seed, 0, 9999)) : d.seed,
  };
  if (o.hidden === true) c.hidden = true;
  return c;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000 || 0;

export function serializeCrown(c: CrownParams): Record<string, unknown> {
  const o: Record<string, unknown> = { size: r3(c.size), gap: r3(c.gap), reach: r3(c.reach), density: r3(c.density), tone: r3(c.tone), wind: r3(c.wind), out: r3(c.out), seed: c.seed };
  if (c.hidden) o.hidden = true;
  return o;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Punkte einer Krone: faces in Pfad-Koordinaten, Maßstab sx, sy (Pfad → Meter der Ebene), light: Richtung zum Licht
 * (Einheitsvektor im Bild). Ergebnis: CROWN_STRIDE Werte je Punkt
 */
export function crownPoints(faces: readonly Face[], sx: number, sy: number, p: CrownParams, light: readonly [number, number]): Float32Array {
  const rasters: EdgeRaster[] = faces.map((f) => faceEdge(f, sx, sy));
  if (!rasters.length) return new Float32Array(0);
  // Abstand zur Kante der Krone (alle Flächen der Form zusammen: innen in irgendeiner Fläche zählt)
  const edge = (x: number, y: number) => {
    let d = -Infinity;
    for (const r of rasters) d = Math.max(d, edgeAtPoint(r, x, y));
    return d;
  };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of faces)
    for (const [x, y] of f.outline) {
      minX = Math.min(minX, x * sx);
      maxX = Math.max(maxX, x * sx);
      minY = Math.min(minY, y * sy);
      maxY = Math.max(maxY, y * sy);
    }
  // gespiegelte Formen: Rahmen richtig herum
  [minX, maxX] = [Math.min(minX, maxX), Math.max(minX, maxX)];
  [minY, maxY] = [Math.min(minY, maxY), Math.max(minY, maxY)];
  minX -= p.out;
  minY -= p.out;
  maxX += p.out;
  maxY += p.out;
  const r = Math.max(0.02, p.size * p.gap);
  const cell = r / Math.SQRT2;
  const gw = Math.max(1, Math.ceil((maxX - minX) / cell));
  const gh = Math.max(1, Math.ceil((maxY - minY) / cell));
  // zu große Kronen: lieber gröber als Millionen Punkte (höchstens rund 20 000)
  if (gw * gh > 40000) return crownPoints(faces, sx, sy, { ...p, size: p.size * Math.sqrt((gw * gh) / 40000) }, light);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: number[] = [];
  const rnd = mulberry32(0x9e3779b9 ^ (p.seed * 7919));
  const inside = (x: number, y: number) => edge(x, y) >= -p.out;
  const put = (x: number, y: number) => {
    const i = pts.length / 2;
    pts.push(x, y);
    grid[Math.floor((y - minY) / cell) * gw + Math.floor((x - minX) / cell)] = i;
    return i;
  };
  const far = (x: number, y: number) => {
    const gx = Math.floor((x - minX) / cell);
    const gy = Math.floor((y - minY) / cell);
    for (let j = Math.max(0, gy - 2); j <= Math.min(gh - 1, gy + 2); j++)
      for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const k = grid[j * gw + i];
        if (k >= 0 && (pts[k * 2] - x) ** 2 + (pts[k * 2 + 1] - y) ** 2 < r * r) return false;
      }
    return true;
  };
  // Bridson: von Startpunkten aus Ringe von Kandidaten; Starts auf einem groben Raster (wo noch nichts liegt), damit
  // auch getrennte Teile der Form Punkte bekommen
  const active: number[] = [];
  for (let s = 0; s < 400; s++) {
    const x = minX + ((s % 20) + rnd()) * ((maxX - minX) / 20);
    const y = minY + (Math.floor(s / 20) + rnd()) * ((maxY - minY) / 20);
    if (inside(x, y) && far(x, y)) active.push(put(x, y));
    while (active.length) {
      const k = active[Math.floor(rnd() * active.length)];
      const px = pts[k * 2];
      const py = pts[k * 2 + 1];
      let placed = false;
      for (let t = 0; t < 24; t++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (1 + rnd());
        const qx = px + Math.cos(a) * d;
        const qy = py + Math.sin(a) * d;
        if (qx < minX || qy < minY || qx >= maxX || qy >= maxY) continue;
        if (!far(qx, qy) || !inside(qx, qy)) continue;
        active.push(put(qx, qy));
        placed = true;
        break;
      }
      if (!placed) active.splice(active.indexOf(k), 1);
    }
  }
  // ausdünnen nach der Lichtkante, Stufe, Tiefe, Phase
  const out: number[] = [];
  const [lx, ly] = light;
  for (let i = 0; i < pts.length / 2; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const k = 1 - smooth(0, p.reach, edge(x + lx * p.reach, y + ly * p.reach));
    // wie Florians Bild 6: die ganze Krone aus Punkten, zur Schattenseite lichter und dunkler
    if (rnd() > p.density * (0.45 + 0.55 * k)) continue;
    const step = k > 0.66 ? 2 : k > 0.33 ? 1 : 0;
    out.push(x, y, p.size * (0.85 + 0.3 * rnd()), step, 0.03 + 0.4 * rnd(), rnd() * Math.PI * 2);
  }
  return new Float32Array(out);
}

/**
 * Farbe einer Tonstufe (sRGB 0–1): Stufe 0 etwas dunkler als die Krone (Schattenseite), Stufe 1 und 2 heller und zum Licht
 * hin wärmer, bis gelbgrün wie in Florians Bild 6 (Platzhalter-Regel)
 */
export function crownColor(base: readonly [number, number, number], light: readonly [number, number, number], tone: number, step: number): [number, number, number] {
  const s = Math.max(0, Math.min(2, step));
  if (s === 0) return [base[0] * 0.82, base[1] * 0.86, base[2] * 0.82];
  const t = tone * (s === 1 ? 0.5 : 1);
  // heller, dazu ein warmer Zug ins Gelbe (Rot und Grün mehr als Blau), dann zur Lichtfarbe getönt
  const warm = [0.3, 0.22, 0.02];
  return [0, 1, 2].map((i) => Math.min(1, base[i] * (1 + 1.4 * t) + warm[i] * t) * (1 + (light[i] - 1) * 0.5 * t)) as [number, number, number];
}

/** zwischengespeichert je Fläche (Form unverändert), Maßstab, Werten und Lichtrichtung */
const cache = new WeakMap<readonly Face[], Map<string, Float32Array>>();

export function cachedCrownPoints(faces: readonly Face[], sx: number, sy: number, p: CrownParams, light: readonly [number, number]): Float32Array {
  let byKey = cache.get(faces);
  if (!byKey) {
    byKey = new Map();
    cache.set(faces, byKey);
  }
  const key = JSON.stringify([sx.toFixed(4), sy.toFixed(4), serializeCrown(p), light[0].toFixed(3), light[1].toFixed(3)]);
  let pts = byKey.get(key);
  if (!pts) {
    pts = crownPoints(faces, sx, sy, p, light);
    if (byKey.size > 3) byKey.clear();
    byKey.set(key, pts);
  }
  return pts;
}

/** gesetzter Punkt des Punktpinsels: Lage (Meter der Ebene relativ zum Ursprung der Form), Durchmesser, Tonstufe 0–2 */
export type SetDot = [x: number, y: number, size: number, step: number];
/** weggenommene Stelle: Mitte und Halbmesser (Meter der Ebene relativ zum Ursprung der Form) */
export type DotOff = [x: number, y: number, r: number];

/** fester Zufall je Lage (Tiefe und Windphase gesetzter Punkte bleiben beim Neuaufbau gleich) */
function spot(x: number, y: number, k: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Punkte einer Form zum Zeichnen: Punkte der Krone (ohne die weggenommenen Stellen) und die mit dem Punktpinsel
 * gesetzten, im Format von crownPoints (CROWN_STRIDE je Punkt)
 */
export function shapeDots(crown: Float32Array | null, set: readonly SetDot[] | undefined, off: readonly DotOff[] | undefined): Float32Array {
  const out: number[] = [];
  if (crown) {
    for (let i = 0; i < crown.length; i += CROWN_STRIDE) {
      const x = crown[i];
      const y = crown[i + 1];
      if (off?.some(([ox, oy, r]) => (x - ox) ** 2 + (y - oy) ** 2 < r * r)) continue;
      for (let k = 0; k < CROWN_STRIDE; k++) out.push(crown[i + k]);
    }
  }
  for (const [x, y, size, step] of set ?? []) out.push(x, y, size, Math.max(0, Math.min(2, Math.round(step))), 0.04 + 0.3 * spot(x, y, 1), spot(x, y, 2) * Math.PI * 2);
  return new Float32Array(out);
}

/** gesetzte Punkte aus der Datei (höchstens 4000), Kaputtes fällt weg */
export function parseSetDots(v: unknown): SetDot[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((q): q is number[] => Array.isArray(q) && q.length === 4 && q.every((x) => num(x)))
    .slice(0, 4000)
    .map(([x, y, s, k]): SetDot => [x, y, clamp(s, 0.03, 10), Math.max(0, Math.min(2, Math.round(k)))]);
  return out.length ? out : undefined;
}

/** weggenommene Stellen aus der Datei (höchstens 400) */
export function parseDotsOff(v: unknown): DotOff[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((q): q is number[] => Array.isArray(q) && q.length === 3 && q.every((x) => num(x)))
    .slice(0, 400)
    .map(([x, y, r]): DotOff => [x, y, clamp(r, 0.01, 40)]);
  return out.length ? out : undefined;
}
