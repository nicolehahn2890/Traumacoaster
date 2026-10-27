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

/**
 * Pfad zu einem Polygon: Kurven in Schritte von etwa `step` Metern zerlegt, Geraden bleiben Geraden. closed: false für
 * offene Linien (Teilungslinien im Zonen-Editor), dann ohne Schlussstück und mit dem letzten Anker
 */
export function flattenPath(path: ZonePath, step = 0.4, closed = true): Poly {
  const out: Poly = [];
  const n = path.length;
  if (n < 2) return path.map((p) => [p.x, p.y]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
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
  if (!closed) out.push([path[n - 1].x, path[n - 1].y]);
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

// ------------------------------------------------------------------ Freihand zu Kurven (Formpinsel)

type V2 = [number, number];
const vsub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const vadd = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const vmul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const vdot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
const vlen = (a: V2): number => Math.hypot(a[0], a[1]);
const vnorm = (a: V2): V2 => {
  const l = vlen(a);
  return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
};
type Cubic = [V2, V2, V2, V2];
const bez = (b: Cubic, t: number): V2 => {
  const u = 1 - t;
  return [u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0], u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1]];
};

/** Zug in gleichen Abständen h neu abtasten (Endpunkt bleibt) */
function resample(poly: Poly, h: number): V2[] {
  const out: V2[] = [[poly[0][0], poly[0][1]]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = h - carry;
    while (s <= L) {
      out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]);
      s += h;
    }
    carry = L - (s - h);
  }
  const last = poly[poly.length - 1];
  if (vlen(vsub(out[out.length - 1], [last[0], last[1]])) > h * 0.25) out.push([last[0], last[1]]);
  else out[out.length - 1] = [last[0], last[1]];
  return out;
}

/** ein Stück d[first..last] mit Kurven annähern (Schneider; Fehler als Quadrat des Abstands) */
function fitCubic(d: V2[], first: number, last: number, t1: V2, t2: V2, err2: number, out: Cubic[], depth = 0): void {
  const n = last - first + 1;
  const segLen = vlen(vsub(d[last], d[first]));
  if (n === 2 || depth > 24) {
    const k = segLen / 3;
    out.push([d[first], vadd(d[first], vmul(t1, k)), vadd(d[last], vmul(t2, k)), d[last]]);
    return;
  }
  // Sehnenlängen als Parameter
  let u: number[] = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + vlen(vsub(d[i], d[i - 1])));
  const total = u[u.length - 1] || 1;
  u = u.map((x) => x / total);
  const generate = (uu: number[]): Cubic => {
    let c00 = 0;
    let c01 = 0;
    let c11 = 0;
    let x0 = 0;
    let x1 = 0;
    for (let i = 0; i < n; i++) {
      const t = uu[i];
      const s = 1 - t;
      const a1 = vmul(t1, 3 * t * s * s);
      const a2 = vmul(t2, 3 * t * t * s);
      c00 += vdot(a1, a1);
      c01 += vdot(a1, a2);
      c11 += vdot(a2, a2);
      const tmp = vsub(d[first + i], vadd(vmul(d[first], s * s * s + 3 * t * s * s), vmul(d[last], 3 * t * t * s + t * t * t)));
      x0 += vdot(a1, tmp);
      x1 += vdot(a2, tmp);
    }
    const det = c00 * c11 - c01 * c01;
    let al = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0;
    let ar = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
    // zu kurze oder zu lange Griffe (Schlaufen): Drittel der Sehne
    if (al < 1e-6 * segLen || ar < 1e-6 * segLen || al > segLen * 2 || ar > segLen * 2) al = ar = segLen / 3;
    return [d[first], vadd(d[first], vmul(t1, al)), vadd(d[last], vmul(t2, ar)), d[last]];
  };
  const maxErr = (b: Cubic, uu: number[]): { e: number; at: number } => {
    let e = 0;
    let at = first + (n >> 1);
    for (let i = 1; i < n - 1; i++) {
      const q = vsub(bez(b, uu[i]), d[first + i]);
      const v = vdot(q, q);
      if (v >= e) {
        e = v;
        at = first + i;
      }
    }
    return { e, at };
  };
  let b = generate(u);
  let m = maxErr(b, u);
  if (m.e < err2) {
    out.push(b);
    return;
  }
  if (m.e < err2 * 16) {
    // Parameter nach Newton nachstellen
    for (let it = 0; it < 12; it++) {
      u = u.map((t, i) => {
        const p = d[first + i];
        const q = vsub(bez(b, t), p);
        const s = 1 - t;
        const d1: V2 = vadd(vadd(vmul(vsub(b[1], b[0]), 3 * s * s), vmul(vsub(b[2], b[1]), 6 * s * t)), vmul(vsub(b[3], b[2]), 3 * t * t));
        const d2: V2 = vadd(vmul(vadd(vsub(b[2], vmul(b[1], 2)), b[0]), 6 * s), vmul(vadd(vsub(b[3], vmul(b[2], 2)), b[1]), 6 * t));
        const den = vdot(d1, d1) + vdot(q, d2);
        return den !== 0 ? Math.max(0, Math.min(1, t - vdot(q, d1) / den)) : t;
      });
      b = generate(u);
      m = maxErr(b, u);
      if (m.e < err2) {
        out.push(b);
        return;
      }
    }
  }
  const at = Math.max(first + 1, Math.min(last - 1, m.at));
  const c = vnorm(vsub(d[at - 1], d[at + 1]));
  fitCubic(d, first, at, t1, c, err2, out, depth + 1);
  fitCubic(d, at, last, vmul(c, -1), t2, err2, out, depth + 1);
}

/**
 * Freihandzug zu wenigen kubischen Kurven (Formpinsel; Schneider, „An Algorithm for Automatically Fitting Digitized
 * Curves“, Graphics Gems 1990): Stücke werden geteilt, bis die Abweichung unter tol bleibt; wo der Zug scharf abknickt
 * (über 70°), entsteht eine Ecke. closed: der Zug ist ein Umriss, sein Ende schließt an den Anfang an
 */
export function fitCurve(poly: Poly, tol: number, closed: boolean): ZonePath {
  if (poly.length < 2) return poly.map(([x, y]) => ({ x, y }));
  const h = Math.max(tol, 1e-6);
  const pts = resample(poly, h);
  if (closed && pts.length > 3 && vlen(vsub(pts[pts.length - 1], pts[0])) < h * 1.5) pts.pop();
  const n = pts.length;
  if (n < (closed ? 3 : 2)) return pts.map(([x, y]) => ({ x, y }));
  const at = (i: number): V2 => pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  // Knicke: Winkel zwischen den Richtungen über k Abstände vor und nach dem Punkt, nur das stärkste in der Nähe
  const k = 3;
  const turn = pts.map((_, i) => {
    if (!closed && (i < k || i > n - 1 - k)) return 0;
    const a = vnorm(vsub(at(i), at(i - k)));
    const b = vnorm(vsub(at(i + k), at(i)));
    return Math.acos(Math.max(-1, Math.min(1, vdot(a, b))));
  });
  const corners: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < (70 * Math.PI) / 180) continue;
    let peak = true;
    for (let j = -k; j <= k && peak; j++) if (j && turn[closed ? (((i + j) % n) + n) % n : Math.max(0, Math.min(n - 1, i + j))] > turn[i]) peak = false;
    if (peak && !corners.some((c) => Math.abs(c - i) <= k)) corners.push(i);
  }
  const err2 = tol * tol;
  const cubics: Cubic[] = [];
  const tangentOut = (i: number): V2 => vnorm(vsub(at(i + 2), at(i)));
  const tangentIn = (i: number): V2 => vnorm(vsub(at(i - 2), at(i)));
  if (!closed) {
    const cuts = [0, ...corners, n - 1];
    for (let c = 0; c + 1 < cuts.length; c++) fitCubic(pts, cuts[c], cuts[c + 1], tangentOut(cuts[c]), tangentIn(cuts[c + 1]), err2, cubics);
  } else {
    // ringsum: an einer Ecke beginnen, sonst irgendwo glatt (gleiche Richtung beiderseits der Naht); mindestens drei
    // Stücke, damit kein Stück an seinem eigenen Anfang endet
    const start = corners[0] ?? 0;
    const ring = [...pts.slice(start), ...pts.slice(0, start), pts[start]];
    const m = ring.length - 1;
    const rel = corners.map((c) => (c - start + n) % n).sort((a, b) => a - b);
    const sharp = new Set(rel.length ? [...rel, m] : []);
    const cuts = rel.length ? [...rel, m] : [0, m];
    while (cuts.length < 4) {
      let gi = 0;
      for (let i = 1; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > cuts[gi + 1] - cuts[gi]) gi = i;
      if (cuts[gi + 1] - cuts[gi] < 2) break;
      cuts.splice(gi + 1, 0, (cuts[gi] + cuts[gi + 1]) >> 1);
    }
    const seam: V2 = vnorm(vsub(ring[1], ring[m - 1]));
    const smoothDir = (i: number): V2 => (i === 0 || i === m ? seam : vnorm(vsub(ring[i + 1], ring[i - 1])));
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c];
      const b = cuts[c + 1];
      const t1 = sharp.has(a) || (a === 0 && sharp.size) ? vnorm(vsub(ring[Math.min(m, a + 2)], ring[a])) : smoothDir(a);
      const t2 = sharp.has(b) ? vnorm(vsub(ring[Math.max(0, b - 2)], ring[b])) : vmul(smoothDir(b), -1);
      fitCubic(ring, a, b, t1, t2, err2, cubics);
    }
  }
  // Kurven zu Ankern mit Griffen
  const out: ZonePath = [];
  cubics.forEach((c, i) => {
    const prev = i > 0 ? cubics[i - 1] : closed ? cubics[cubics.length - 1] : null;
    const p: ZonePath[number] = { x: c[0][0], y: c[0][1], outX: c[1][0] - c[0][0], outY: c[1][1] - c[0][1] };
    if (prev) {
      p.inX = prev[2][0] - prev[3][0];
      p.inY = prev[2][1] - prev[3][1];
    }
    out.push(p);
  });
  if (!closed) {
    const c = cubics[cubics.length - 1];
    out.push({ x: c[3][0], y: c[3][1], inX: c[2][0] - c[3][0], inY: c[2][1] - c[3][1] });
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
