/**
 * Kurvenpfade der Körper (Ebenen-Probe, Plan Paket 5 und 0 „Referenzen als Essenz“): Ein Körper ist eine gemalte Ebene
 * mit einer organischen Form. Die Form ist ein geschlossener Pfad aus Ankerpunkten mit Griffen (kubische Kurven, wie
 * Pfade in Illustrator), lokal in Metern um den Fußpunkt des Elements; Löcher sind weitere geschlossene Pfade. Hier
 * stehen die reinen Geometrie-Helfer: Pfad glätten zu einem Polygon, Grenzen, Punkt-im-Polygon, Oberkante, Vereinfachen,
 * ein Polygon zu einem weichen Pfad machen (Umriss aus Bild), Vorgabeformen. Ohne Renderer, ohne DOM.
 */

/** Ankerpunkt mit Griffen relativ zum Anker (fehlende Griffe: Ecke) */
export interface PathPoint {
  x: number;
  y: number;
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}
/** geschlossener Pfad (der letzte Punkt verbindet sich mit dem ersten) */
export type ZonePath = PathPoint[];
export type Poly = Array<[number, number]>;

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Pfad zu einem Polygon: Kurven in Schritte von etwa `step` Metern zerlegt, Geraden bleiben Geraden */
export function flattenPath(path: ZonePath, step = 0.4): Poly {
  const out: Poly = [];
  const n = path.length;
  if (n < 2) return path.map((p) => [p.x, p.y]);
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const c1x = a.x + (a.outX ?? 0);
    const c1y = a.y + (a.outY ?? 0);
    const c2x = b.x + (b.inX ?? 0);
    const c2y = b.y + (b.inY ?? 0);
    out.push([a.x, a.y]);
    const straight = !a.outX && !a.outY && !b.inX && !b.inY;
    if (straight) continue;
    const len = Math.hypot(c1x - a.x, c1y - a.y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(b.x - c2x, b.y - c2y);
    const segs = Math.max(2, Math.min(48, Math.ceil(len / step)));
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b.y;
      out.push([x, y]);
    }
  }
  return out;
}

export function polyBounds(poly: Poly): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

export const pathBounds = (path: ZonePath): Bounds => polyBounds(flattenPath(path));

export function inPolygon(poly: Poly, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** im Umriss, aber in keinem Loch */
export function insideWithHoles(outline: Poly, holes: readonly Poly[], x: number, y: number): boolean {
  if (!inPolygon(outline, x, y)) return false;
  for (const h of holes) if (inPolygon(h, x, y)) return false;
  return true;
}

/** höchster Punkt des Polygons auf der Senkrechten x (Oberkante), null außerhalb */
export function polyTopAt(poly: Poly, x: number): number | null {
  let top: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (xi === xj) continue;
    if (x < Math.min(xi, xj) || x > Math.max(xi, xj)) continue;
    const y = yi + ((yj - yi) * (x - xi)) / (xj - xi);
    if (top === null || y > top) top = y;
  }
  return top;
}

/** Fläche mit Vorzeichen (positiv gegen den Uhrzeigersinn in einem y-nach-oben-System) */
export function polyArea(poly: Poly): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}

/** Polygon vereinfachen (Douglas-Peucker für einen geschlossenen Zug), Abstandstoleranz in Metern */
export function simplifyPoly(poly: Poly, tol: number): Poly {
  if (poly.length <= 4) return poly.slice();
  // Start am Punkt, der am weitesten vom ersten entfernt ist, damit der Schluss sauber bleibt
  let far = 0;
  let farD = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = [...poly.slice(0, far + 1)];
  const b = [...poly.slice(far), poly[0]];
  const out = [...rdp(a, tol), ...rdp(b, tol).slice(1, -1)];
  return out.length >= 3 ? out : poly.slice();
}

function rdp(pts: Poly, tol: number): Poly {
  if (pts.length < 3) return pts.slice();
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let best = 0;
  let bestD = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    let d: number;
    if (l2 === 0) d = Math.hypot(px - x0, py - y0);
    else {
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
      d = Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
    }
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  if (bestD <= tol) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, best + 1), tol);
  const right = rdp(pts.slice(best), tol);
  return [...left.slice(0, -1), ...right];
}

/**
 * Polygon zu einem weichen Pfad: jeder Eckpunkt wird ein Anker mit Griffen entlang der Sehne seiner Nachbarn
 * (Catmull-Rom, Spannung `tension`); so entstehen bearbeitbare Kurven, etwa aus einem Umriss aus dem Bild
 */
export function smoothPath(poly: Poly, tension = 1 / 6): ZonePath {
  const n = poly.length;
  if (n < 3) return poly.map(([x, y]) => ({ x, y }));
  const out: ZonePath = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = poly[(i - 1 + n) % n];
    const [x, y] = poly[i];
    const [nx, ny] = poly[(i + 1) % n];
    let tx = (nx - px) * tension;
    let ty = (ny - py) * tension;
    // Griffe höchstens 40 % der kürzeren Nachbarsehne lang, sonst schlägt die Kurve an spitzen Ecken Schlaufen (und die
    // Fläche zerreißt beim Triangulieren)
    const len = Math.hypot(tx, ty);
    const cap = 0.4 * Math.min(Math.hypot(x - px, y - py), Math.hypot(nx - x, ny - y));
    if (len > cap && len > 0) {
      tx *= cap / len;
      ty *= cap / len;
    }
    out.push({ x, y, inX: -tx, inY: -ty, outX: tx, outY: ty });
  }
  return out;
}

/** Schnittpunkte eines Polygons mit sich selbst (0 für eine einfache Fläche) */
export function selfIntersections(poly: Poly): number {
  let count = 0;
  const n = poly.length;
  const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
    const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
    const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) count++;
    }
  }
  return count;
}

export function translatePath(path: ZonePath, dx: number, dy: number): ZonePath {
  return path.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

export function scalePath(path: ZonePath, sx: number, sy = sx): ZonePath {
  const s = (v: number | undefined, f: number) => (v === undefined ? undefined : v * f);
  return path.map((p) => ({ x: p.x * sx, y: p.y * sy, inX: s(p.inX, sx), inY: s(p.inY, sy), outX: s(p.outX, sx), outY: s(p.outY, sy) })).map(stripZero);
}

/** Pfad auf 2 Nachkommastellen runden und leere Griffe weglassen (für die Zonendatei) */
export function cleanPath(path: ZonePath, digits = 2): ZonePath {
  const r = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  return path.map((p) => stripZero({ x: r(p.x), y: r(p.y), inX: p.inX === undefined ? undefined : r(p.inX), inY: p.inY === undefined ? undefined : r(p.inY), outX: p.outX === undefined ? undefined : r(p.outX), outY: p.outY === undefined ? undefined : r(p.outY) }));
}

function stripZero(p: PathPoint): PathPoint {
  const out: PathPoint = { x: p.x, y: p.y };
  if (p.inX || p.inY) {
    out.inX = p.inX ?? 0;
    out.inY = p.inY ?? 0;
  }
  if (p.outX || p.outY) {
    out.outX = p.outX ?? 0;
    out.outY = p.outY ?? 0;
  }
  return out;
}

export type PresetShape = 'blob' | 'arch' | 'hill' | 'bank' | 'ring';

/**
 * Vorgabeformen für neue Körper (Breite w, Höhe h, Fußpunkt unten links bei 0,0): Blob (organischer Hügel), Bogen
 * (Fels mit großem Loch), Hügel (weiche Kuppe mit flachem Fuß), Bank (geschwungene Wiesenbank), Ring (Portal)
 */
export function presetPath(shape: PresetShape, w: number, h: number): { path: ZonePath; holes: ZonePath[] } {
  const k = 0.5523;
  if (shape === 'ring') {
    const outer = ellipse(w / 2, h / 2, w / 2, h / 2, k);
    const inner = ellipse(w / 2, h / 2, w * 0.3, h * 0.3, k).reverse().map(flipHandles);
    return { path: outer, holes: [inner] };
  }
  if (shape === 'arch') {
    const path: ZonePath = [
      { x: 0, y: 0, outX: -0.05 * w, outY: 0.35 * h },
      { x: 0.12 * w, y: 0.82 * h, inX: -0.08 * w, inY: -0.2 * h, outX: 0.1 * w, outY: 0.14 * h },
      { x: 0.5 * w, y: h, inX: -0.2 * w, inY: 0, outX: 0.22 * w, outY: 0 },
      { x: 0.9 * w, y: 0.78 * h, inX: -0.08 * w, inY: 0.16 * h, outX: 0.08 * w, outY: -0.22 * h },
      { x: w, y: 0, inX: 0.03 * w, inY: 0.3 * h },
    ];
    const hole: ZonePath = [
      { x: 0.3 * w, y: 0, outX: -0.02 * w, outY: 0.3 * h },
      { x: 0.5 * w, y: 0.62 * h, inX: -0.16 * w, inY: 0, outX: 0.16 * w, outY: 0 },
      { x: 0.72 * w, y: 0, inX: 0.02 * w, inY: 0.3 * h },
    ];
    return { path, holes: [hole] };
  }
  if (shape === 'hill') {
    return {
      path: [
        { x: 0, y: 0, outX: 0.1 * w, outY: 0.15 * h },
        { x: 0.45 * w, y: h, inX: -0.22 * w, inY: 0, outX: 0.2 * w, outY: 0 },
        { x: w, y: 0, inX: -0.12 * w, inY: 0.2 * h },
      ],
      holes: [],
    };
  }
  if (shape === 'bank') {
    return {
      path: [
        { x: 0, y: 0.55 * h, outX: 0.12 * w, outY: 0.25 * h },
        { x: 0.38 * w, y: h, inX: -0.14 * w, inY: 0, outX: 0.16 * w, outY: 0 },
        { x: 0.72 * w, y: 0.86 * h, inX: -0.1 * w, inY: 0.06 * h, outX: 0.12 * w, outY: -0.08 * h },
        { x: w, y: 0.6 * h, inX: -0.06 * w, inY: 0.08 * h, outX: 0.02 * w, outY: -0.2 * h },
        { x: 0.86 * w, y: 0, inX: 0.06 * w, inY: 0.12 * h, outX: -0.3 * w, outY: 0 },
        { x: 0.1 * w, y: 0.1 * h, inX: 0.2 * w, inY: -0.04 * h, outX: -0.08 * w, outY: 0.1 * h },
      ],
      holes: [],
    };
  }
  // blob
  return {
    path: [
      { x: 0.08 * w, y: 0, outX: -0.1 * w, outY: 0.3 * h },
      { x: 0.2 * w, y: 0.9 * h, inX: -0.1 * w, inY: -0.15 * h, outX: 0.1 * w, outY: 0.14 * h },
      { x: 0.6 * w, y: h, inX: -0.14 * w, inY: 0.02 * h, outX: 0.18 * w, outY: -0.02 * h },
      { x: w, y: 0.55 * h, inX: 0.02 * w, inY: 0.2 * h, outX: -0.02 * w, outY: -0.25 * h },
      { x: 0.8 * w, y: 0, inX: 0.12 * w, inY: 0.1 * h, outX: -0.2 * w, outY: 0 },
    ],
    holes: [],
  };
}

function ellipse(cx: number, cy: number, rx: number, ry: number, k: number): ZonePath {
  return [
    { x: cx + rx, y: cy, inX: 0, inY: -k * ry, outX: 0, outY: k * ry },
    { x: cx, y: cy + ry, inX: k * rx, inY: 0, outX: -k * rx, outY: 0 },
    { x: cx - rx, y: cy, inX: 0, inY: k * ry, outX: 0, outY: -k * ry },
    { x: cx, y: cy - ry, inX: -k * rx, inY: 0, outX: k * rx, outY: 0 },
  ];
}

const flipHandles = (p: PathPoint): PathPoint => ({ x: p.x, y: p.y, inX: p.outX, inY: p.outY, outX: p.inX, outY: p.inY });
