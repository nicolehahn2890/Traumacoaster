/**
 * Texturen der Earle-Schichten (docs/ZONENEDITOR-PLAN.md, Stufe 5; Plan 3.2):
 *
 * - **Kantenabstand im Atlas:** die Raster aus `src/zone/edgeDistance.ts` in einer Textur (ein Byte je Zelle, bilinear),
 *   in Regalen gepackt. Neu gepackt wird nur, wenn sich die Menge der Raster ändert (Verschieben ändert nichts).
 * - **Rang-Kachel der Pünktchen:** 64 × 64 Zellen mit Versatz, Rang und Größenzufall. Die Ränge sind blau verteilt
 *   (immer die Zelle, die am weitesten von allen bisher gewählten liegt), darum verteilt sich jede Dichte gleichmäßig,
 *   und mehr Dichte fügt Punkte hinzu, ohne vorhandene zu verschieben.
 * - **Papier und Gouache:** zwei kachelbare Grauwert-Kacheln (Rot Papier, Grün Gouache). **Platzhalter:** erzeugt aus
 *   Rauschen, bis Florian sein Papier und seine Gouache scannt (Plan 4.7).
 *
 * Alles deterministisch, damit Spiel, Editor und Messungen dasselbe Muster sehen.
 */
import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RedFormat, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import type { EdgeRaster } from '@/zone/edgeDistance';

/** Breite des Atlas; die Höhe wächst in Zweierpotenzen bis ATLAS_MAX */
const ATLAS_W = 2048;
const ATLAS_MAX = 4096;

/** Lage eines Rasters im Atlas (Zellen) */
export interface AtlasSlot {
  x: number;
  y: number;
}

export class EdgeAtlas {
  texture: DataTexture = EdgeAtlas.blank(ATLAS_W, 64);
  private slots = new Map<EdgeRaster, AtlasSlot>();
  private key: EdgeRaster[] = [];
  /** Zahlen für die Leistungsanzeige */
  stats = { rasters: 0, height: 64, overflow: 0 };

  private static blank(w: number, h: number): DataTexture {
    const t = new DataTexture(new Uint8Array(w * h), w, h, RedFormat, UnsignedByteType);
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  }

  get width(): number {
    return this.texture.image.width;
  }

  get height(): number {
    return this.texture.image.height;
  }

  /** Lage eines Rasters nach dem letzten pack, oder undefined (kein Platz) */
  slot(r: EdgeRaster): AtlasSlot | undefined {
    return this.slots.get(r);
  }

  /** Raster packen (gleiche Menge in gleicher Reihenfolge: nichts zu tun); gibt true, wenn die Textur neu ist */
  pack(rasters: readonly EdgeRaster[]): boolean {
    const list = [...new Set(rasters)];
    if (list.length === this.key.length && list.every((r, i) => r === this.key[i])) return false;
    this.key = list;
    // Regale: höchste zuerst, links nach rechts
    const order = [...list].sort((a, b) => b.h - a.h || b.w - a.w);
    const slots = new Map<EdgeRaster, AtlasSlot>();
    let x = 0;
    let y = 0;
    let shelf = 0;
    let overflow = 0;
    for (const r of order) {
      if (x + r.w > ATLAS_W) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      if (y + r.h > ATLAS_MAX) {
        overflow++;
        continue;
      }
      slots.set(r, { x, y });
      x += r.w;
      shelf = Math.max(shelf, r.h);
    }
    const need = y + shelf;
    const h = Math.min(ATLAS_MAX, 2 ** Math.ceil(Math.log2(Math.max(64, need))));
    if (this.texture.image.height !== h) {
      this.texture.dispose();
      this.texture = EdgeAtlas.blank(ATLAS_W, h);
    }
    const data = this.texture.image.data as Uint8Array;
    data.fill(0);
    for (const [r, s] of slots) for (let j = 0; j < r.h; j++) data.set(r.data.subarray(j * r.w, (j + 1) * r.w), (s.y + j) * ATLAS_W + s.x);
    this.texture.needsUpdate = true;
    this.slots = slots;
    this.stats = { rasters: slots.size, height: h, overflow };
    return true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

// ------------------------------------------------------------------ Rang-Kachel

export const RANK_N = 64;

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

/**
 * Rang-Kachel: je Zelle Versatz x, y (−1 bis 1; der Shader begrenzt ihn so, dass der Punkt in der Zelle bleibt), Rang
 * (0 bis 1, blau verteilt) und Größenzufall (0 bis 1)
 */
export function rankTile(n = RANK_N, seed = 20261029): Float32Array {
  const rnd = mulberry32(seed);
  const N = n * n;
  const out = new Float32Array(N * 4);
  const px = new Float64Array(N);
  const py = new Float64Array(N);
  for (let c = 0; c < N; c++) {
    const ox = rnd() * 2 - 1;
    const oy = rnd() * 2 - 1;
    out[c * 4] = ox;
    out[c * 4 + 1] = oy;
    out[c * 4 + 3] = rnd();
    // Lage für die Rangfolge: Zellmitte plus ein typischer Versatz
    px[c] = (c % n) + 0.5 + ox * 0.2;
    py[c] = Math.floor(c / n) + 0.5 + oy * 0.2;
  }
  // weitester Punkt zuerst (auf dem Torus), Gleichstand per Zufall
  const minD = new Float64Array(N).fill(Infinity);
  const tie = new Float64Array(N);
  for (let c = 0; c < N; c++) tie[c] = rnd() * 1e-6;
  for (let k = 0; k < N; k++) {
    let pick = 0;
    let far = -1;
    for (let c = 0; c < N; c++) {
      const v = minD[c] + tie[c];
      if (minD[c] >= 0 && v > far) {
        far = v;
        pick = c;
      }
    }
    out[pick * 4 + 2] = (k + 0.5) / N;
    minD[pick] = -1;
    const x = px[pick];
    const y = py[pick];
    for (let c = 0; c < N; c++) {
      if (minD[c] < 0) continue;
      let dx = Math.abs(px[c] - x);
      let dy = Math.abs(py[c] - y);
      if (dx > n / 2) dx = n - dx;
      if (dy > n / 2) dy = n - dy;
      const d = dx * dx + dy * dy;
      if (d < minD[c]) minD[c] = d;
    }
  }
  return out;
}

let rankTex: DataTexture | null = null;

export function rankTexture(): DataTexture {
  if (rankTex) return rankTex;
  const t = new DataTexture(rankTile(), RANK_N, RANK_N, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  rankTex = t;
  return t;
}

// ------------------------------------------------------------------ Papier und Gouache (Platzhalter)

export const GRAIN_N = 256;

/** kachelbares Wertrauschen: Gitter mit Periode p (Zellen über die ganze Kachel) */
function tileNoise(rnd: () => number, n: number, p: number): Float32Array {
  const lattice = new Float32Array(p * p);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const out = new Float32Array(n * n);
  const s = (v: number) => v * v * (3 - 2 * v);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * p;
    const y0 = Math.floor(fy);
    const ty = s(fy - y0);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * p;
      const x0 = Math.floor(fx);
      const tx = s(fx - x0);
      const at = (i: number, j: number) => lattice[(j % p) * p + (i % p)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * n + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** auf Mittelwert 0,5 und eine Streuung bringen */
function normalize(v: Float32Array, spread: number): Float32Array {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let dev = 0;
  for (const x of v) dev += (x - mean) ** 2;
  dev = Math.sqrt(dev / v.length) || 1;
  return v.map((x) => Math.max(0, Math.min(1, 0.5 + ((x - mean) / dev) * spread)));
}

/** Rot Papier (feines Korn, einzelne Fasern), Grün Gouache (Flecken und Pinselzüge), je 0,5 im Mittel */
export function grainTiles(n = GRAIN_N, seed = 1029): Uint8Array {
  const rnd = mulberry32(seed);
  const paper = new Float32Array(n * n);
  [
    [8, 0.25],
    [32, 0.3],
    [64, 0.25],
    [128, 0.2],
  ].forEach(([p, w]) => tileNoise(rnd, n, p).forEach((v, i) => (paper[i] += v * w)));
  // Fasern: kurze, helle und dunkle Striche
  for (let f = 0; f < 140; f++) {
    let x = rnd() * n;
    let y = rnd() * n;
    const a = rnd() * Math.PI;
    const len = 6 + rnd() * 18;
    const v = (rnd() - 0.5) * 0.35;
    for (let s = 0; s < len; s++) {
      const i = ((Math.round(y) % n) + n) % n;
      const j = ((Math.round(x) % n) + n) % n;
      paper[i * n + j] += v;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const gouache = new Float32Array(n * n);
  const blot = tileNoise(rnd, n, 4);
  const blot2 = tileNoise(rnd, n, 8);
  // Pinselzüge: waagrecht gestrecktes Rauschen (Periode 32 quer, 4 längs)
  const lat = new Float32Array(32 * 4).map(() => rnd());
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * 4;
      const fy = (y / n) * 32;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const at = (i: number, j: number) => lat[(j % 32) * 4 + (i % 4)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      const streak = a + (b - a) * (ty * ty * (3 - 2 * ty));
      gouache[y * n + x] = blot[y * n + x] * 0.45 + blot2[y * n + x] * 0.25 + streak * 0.3;
    }
  }
  const p = normalize(paper, 0.11);
  const g = normalize(gouache, 0.09);
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = Math.round(p[i] * 255);
    out[i * 4 + 1] = Math.round(g[i] * 255);
    out[i * 4 + 2] = 128;
    out[i * 4 + 3] = 255;
  }
  return out;
}

let grainTex: DataTexture | null = null;

export function grainTexture(): DataTexture {
  if (grainTex) return grainTex;
  const t = new DataTexture(grainTiles(), GRAIN_N, GRAIN_N, RGBAFormat, UnsignedByteType);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  grainTex = t;
  return t;
}
