/**
 * Kantenabstand einer Fläche (docs/ZONENEDITOR-PLAN.md, Stufe 5; Plan 3.2 „Kantenabstand (SDF)“): ein Raster mit dem
 * Abstand jeder Zelle zur nächsten Kante der Fläche, innen positiv, außen negativ, in Metern der Ebene (also nach dem
 * Maßstab der Form, vor dem Maßstab der Ebene; mit „Bild halten“ sind das überall gleich große Bildmaße). Lichtkante,
 * Innenschatten, Kantenverlauf und die Pünktchen an Kanten lesen ihn im Shader; `src/world/earleTextures.ts` packt die
 * Raster in einen Atlas.
 *
 * Gerechnet wird genau statt aus einer Maske: Jede Strecke des Umrisses trägt sich in die Zellen ihres Rahmens ein, zwei
 * Durchläufe geben die nächste Strecke an die Nachbarn weiter (Dead Reckoning nach Grevera 2004, mit Strecken statt
 * Punkten), der Abstand ist immer der echte Abstand zur gefundenen Strecke. Darum bleiben auch Ringe weit innen glatt.
 * Das Vorzeichen kommt aus einer Zeilenfüllung (gerade-ungerade, also mit Löchern). Neu gerechnet wird nur, wenn sich
 * Fläche oder Maßstab ändern, nie je Bild. Ohne Renderer und DOM.
 */
import type { Poly } from './path';
import type { Face } from './faces';

/** Wertebereich der Kodierung in Metern: so weit außen, so weit innen (darüber hinaus gekappt) */
export const EDGE_OUT = 2;
export const EDGE_IN = 16;
/** feinste Zelle (Meter) und größte Seite (Zellen, Rand mitgezählt) */
export const EDGE_TEXEL = 0.25;
export const EDGE_MAX = 256;
/** Randzellen um den Umriss (dort ist es außen) */
const MARGIN = 2;

export interface EdgeRaster {
  w: number;
  h: number;
  /** Meter je Zelle */
  texel: number;
  /** Ecke der Zelle (0, 0) in Metern der Ebene, relativ zum Ursprung der Form */
  x0: number;
  y0: number;
  /** kodierter Abstand je Zelle, Zeile für Zeile von unten (encodeEdge) */
  data: Uint8Array;
}

/** Abstand (Meter) → Byte: 0 bei EDGE_OUT außen, 255 bei EDGE_IN innen */
export function encodeEdge(d: number): number {
  return Math.round(Math.max(0, Math.min(1, (d + EDGE_OUT) / (EDGE_IN + EDGE_OUT))) * 255);
}

export function decodeEdge(v: number): number {
  return (v / 255) * (EDGE_IN + EDGE_OUT) - EDGE_OUT;
}

/** Abstand² vom Punkt (px, py) zur Strecke Nummer s in seg */
function segDist2(seg: Float64Array, s: number, px: number, py: number): number {
  const ax = seg[s * 4];
  const ay = seg[s * 4 + 1];
  const dx = seg[s * 4 + 2] - ax;
  const dy = seg[s * 4 + 3] - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Kantenabstand der Fläche (Umriss und Löcher in Pfad-Koordinaten) bei Maßstab sx, sy (Pfad → Meter der Ebene) */
export function edgeRaster(outline: Poly, holes: readonly Poly[], sx: number, sy: number): EdgeRaster {
  const rings = [outline, ...holes].filter((r) => r.length >= 3);
  let n = 0;
  for (const r of rings) n += r.length;
  const seg = new Float64Array(n * 4);
  let k = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const ax = a[0] * sx;
      const ay = a[1] * sy;
      seg[k++] = ax;
      seg[k++] = ay;
      seg[k++] = b[0] * sx;
      seg[k++] = b[1] * sy;
      minX = Math.min(minX, ax);
      minY = Math.min(minY, ay);
      maxX = Math.max(maxX, ax);
      maxY = Math.max(maxY, ay);
    }
  }
  const S = k / 4;
  if (!S) return { w: 1, h: 1, texel: 1, x0: 0, y0: 0, data: new Uint8Array([encodeEdge(-EDGE_OUT)]) };
  const side = Math.max(maxX - minX, maxY - minY, 1e-3);
  const texel = Math.max(EDGE_TEXEL, side / (EDGE_MAX - 2 * MARGIN - 1));
  const w = Math.min(EDGE_MAX, Math.ceil((maxX - minX) / texel) + 2 * MARGIN);
  const h = Math.min(EDGE_MAX, Math.ceil((maxY - minY) / texel) + 2 * MARGIN);
  const x0 = minX - MARGIN * texel;
  const y0 = minY - MARGIN * texel;

  // Vorzeichen: Zeilenfüllung gerade-ungerade an den Zellmitten
  const inside = new Uint8Array(w * h);
  const xs: number[] = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * texel;
    xs.length = 0;
    for (let s = 0; s < S; s++) {
      const ay = seg[s * 4 + 1];
      const by = seg[s * 4 + 3];
      if (ay <= y !== by <= y) {
        const ax = seg[s * 4];
        xs.push(ax + ((y - ay) / (by - ay)) * (seg[s * 4 + 2] - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / texel - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[q + 1] - x0) / texel - 0.5));
      for (let i = i0; i <= i1; i++) inside[j * w + i] = 1;
    }
  }

  // nächste Strecke: jede Strecke in die Zellen ihres Rahmens (plus anderthalb Zellen), dann weitergeben
  const best = new Float64Array(w * h).fill(Infinity);
  const owner = new Int32Array(w * h).fill(-1);
  const pad = 1.5 * texel;
  const col = (x: number) => Math.max(0, Math.min(w - 1, Math.floor((x - x0) / texel)));
  const row = (y: number) => Math.max(0, Math.min(h - 1, Math.floor((y - y0) / texel)));
  for (let s = 0; s < S; s++) {
    const ax = seg[s * 4];
    const ay = seg[s * 4 + 1];
    const bx = seg[s * 4 + 2];
    const by = seg[s * 4 + 3];
    const i0 = col(Math.min(ax, bx) - pad);
    const i1 = col(Math.max(ax, bx) + pad);
    const j0 = row(Math.min(ay, by) - pad);
    const j1 = row(Math.max(ay, by) + pad);
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * texel;
      for (let i = i0; i <= i1; i++) {
        const c = j * w + i;
        const d2 = segDist2(seg, s, x0 + (i + 0.5) * texel, py);
        if (d2 < best[c]) {
          best[c] = d2;
          owner[c] = s;
        }
      }
    }
  }
  const take = (c: number, nb: number, px: number, py: number) => {
    const s = owner[nb];
    if (s < 0 || s === owner[c]) return;
    const d2 = segDist2(seg, s, px, py);
    if (d2 < best[c]) {
      best[c] = d2;
      owner[c] = s;
    }
  };
  // 8SSEDT-Muster: von unten nach oben (links → rechts mit den Nachbarn darunter, dann rechts → links), dann umgekehrt
  for (let j = 0; j < h; j++) {
    const py = y0 + (j + 0.5) * texel;
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      const px = x0 + (i + 0.5) * texel;
      if (i > 0) take(c, c - 1, px, py);
      if (j > 0) {
        take(c, c - w, px, py);
        if (i > 0) take(c, c - w - 1, px, py);
        if (i < w - 1) take(c, c - w + 1, px, py);
      }
    }
    for (let i = w - 2; i >= 0; i--) take(j * w + i, j * w + i + 1, x0 + (i + 0.5) * texel, py);
  }
  for (let j = h - 1; j >= 0; j--) {
    const py = y0 + (j + 0.5) * texel;
    for (let i = w - 1; i >= 0; i--) {
      const c = j * w + i;
      const px = x0 + (i + 0.5) * texel;
      if (i < w - 1) take(c, c + 1, px, py);
      if (j < h - 1) {
        take(c, c + w, px, py);
        if (i < w - 1) take(c, c + w + 1, px, py);
        if (i > 0) take(c, c + w - 1, px, py);
      }
    }
    for (let i = 1; i < w; i++) take(j * w + i, j * w + i - 1, x0 + (i + 0.5) * texel, py);
  }

  const data = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) {
    const d = Number.isFinite(best[c]) ? Math.sqrt(best[c]) : EDGE_IN;
    data[c] = encodeEdge(inside[c] ? d : -d);
  }
  return { w, h, texel, x0, y0, data };
}

/** zwischengespeichert je Fläche und Maßstab (Verschieben rechnet nichts neu, Skalieren schon) */
const cache = new WeakMap<Face, Map<string, EdgeRaster>>();

export function faceEdge(face: Face, sx: number, sy: number): EdgeRaster {
  let byScale = cache.get(face);
  if (!byScale) {
    byScale = new Map();
    cache.set(face, byScale);
  }
  const key = `${sx.toFixed(4)},${sy.toFixed(4)}`;
  let r = byScale.get(key);
  if (!r) {
    r = edgeRaster(face.outline, face.holes, sx, sy);
    // beim Ziehen am Maßstab entstehen viele; nur die letzten behalten
    if (byScale.size > 3) byScale.clear();
    byScale.set(key, r);
  }
  return r;
}

/** Abstand am Punkt (Meter der Ebene relativ zum Ursprung der Form), bilinear wie der Shader; für Tests und Pipette */
export function edgeAtPoint(r: EdgeRaster, x: number, y: number): number {
  const fx = Math.max(0, Math.min(r.w - 1, (x - r.x0) / r.texel - 0.5));
  const fy = Math.max(0, Math.min(r.h - 1, (y - r.y0) / r.texel - 0.5));
  const i = Math.min(r.w - 2, Math.floor(fx));
  const j = Math.min(r.h - 2, Math.floor(fy));
  if (i < 0 || j < 0) return decodeEdge(r.data[0]);
  const u = fx - i;
  const v = fy - j;
  const at = (a: number, b: number) => r.data[b * r.w + a];
  const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
  const bot = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
  return decodeEdge(top * (1 - v) + bot * v);
}
