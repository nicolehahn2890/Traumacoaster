/**
 * Netz um ein Bild wie in Spine (Florian, 30.10.2026: „wie bei Spine 3D … ein Mesh um ein Bild zeichnen und dieses dann
 * verzerren“). Spine-Handbuch (Meshes): ein Netz ist ein Vieleck, die **Hülle**, mit Punkten im Inneren; die Dreiecke
 * entstehen automatisch, keine Kante kreuzt die Hülle, keine Löcher. Beim Bearbeiten liegen die Punkte über dem
 * unverzerrten Bild (verschieben ändert, wo der Punkt im Bild sitzt); beim Verformen bewegen sich die Punkte, und das Bild
 * verzerrt sich mit den Dreiecken.
 *
 * Hier hat jeder Punkt zwei Lagen in Pfad-Koordinaten der Form: ohne Verzerrung (rx, ry) und verzerrt (x, y). Die Form
 * wird in der Lage ohne Verzerrung gemalt (Bild, Verläufe, Kantenabstand, Muster) und mit den Dreiecken an die verzerrte
 * Lage gelegt, so verzerrt sich alles, was in der Form gemalt ist, wie ein Bild in Spine. Die ersten `hull` Punkte sind die
 * Hülle in ihrer Reihenfolge; der Umriss der Form ist immer die verzerrte Hülle (`meshPath`), so tragen Andockkanten,
 * Freiraum und Säume die Kante, die man sieht. Die Dreiecke rechnet `triangulate` aus der Lage ohne Verzerrung
 * (eingeschränkte Delaunay-Triangulierung: Ohren der Hülle, innere Punkte einsetzen, Kanten nach Lawson umklappen,
 * Hüllkanten bleiben); Verformen ändert sie nicht.
 *
 * Ohne Renderer und DOM.
 */
import { computeFaces, type Face } from './faces';
import { flattenPath, selfIntersections, simplifyPoly, type Poly, type ZonePath } from './path';

export interface MeshPoint {
  /** Lage ohne Verzerrung */
  rx: number;
  ry: number;
  /** verzerrte Lage */
  x: number;
  y: number;
}

export interface ZoneMesh {
  pts: MeshPoint[];
  /** die ersten hull Punkte bilden die Hülle, in Reihenfolge */
  hull: number;
  /** Dreiecke als Punktnummern, je drei, gegen den Uhrzeigersinn in der Lage ohne Verzerrung */
  tris: number[];
}

export const MESH_DENSITIES = ['few', 'mid', 'many'] as const;
export type MeshDensity = (typeof MESH_DENSITIES)[number];
export const DENSITY_WORDS: Record<MeshDensity, string> = { few: 'wenige', mid: 'mittel', many: 'viele' };
/** Abstand der inneren Punkte als Teil der größeren Seite. Platzhalter */
const DENSITY_DIV: Record<MeshDensity, number> = { few: 4, mid: 7, many: 11 };
/** höchstens so viele Punkte (Datei, Überlagerung, Neurechnen beim Bearbeiten) */
export const MESH_MAX_POINTS = 1500;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;

// ------------------------------------------------------------------ Datei

/** Netz aus der Datei: Punkte als eine Zeile „rx,ry,x,y …“, Dreiecke „a,b,c …“; fehlen sie oder sind kaputt, neu gerechnet */
export function parseMesh(v: unknown): ZoneMesh | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.v !== 'string' || !num(o.hull)) return undefined;
  const pts: MeshPoint[] = [];
  for (const q of o.v.trim().split(/\s+/)) {
    const [rx, ry, x, y] = q.split(',').map(Number);
    if (![rx, ry, x, y].every(Number.isFinite)) return undefined;
    pts.push({ rx, ry, x, y });
  }
  const hull = Math.round(o.hull);
  if (hull < 3 || hull > pts.length || pts.length > MESH_MAX_POINTS) return undefined;
  let tris: number[] = [];
  if (typeof o.t === 'string' && o.t.trim()) tris = o.t.trim().split(/\s+/).flatMap((q) => q.split(',').map(Number));
  const ok = tris.length > 0 && tris.length % 3 === 0 && tris.every((i) => Number.isInteger(i) && i >= 0 && i < pts.length);
  const m: ZoneMesh = { pts, hull, tris: ok ? tris : [] };
  if (!ok) retriangulate(m);
  return m;
}

export function serializeMesh(m: ZoneMesh): Record<string, unknown> {
  const t: string[] = [];
  for (let i = 0; i < m.tris.length; i += 3) t.push(`${m.tris[i]},${m.tris[i + 1]},${m.tris[i + 2]}`);
  return { hull: m.hull, v: m.pts.map((p) => `${r3(p.rx)},${r3(p.ry)},${r3(p.x)},${r3(p.y)}`).join(' '), t: t.join(' ') };
}

export const cloneMesh = (m: ZoneMesh): ZoneMesh => ({ pts: m.pts.map((p) => ({ ...p })), hull: m.hull, tris: [...m.tris] });

// ------------------------------------------------------------------ Lagen

/** Umriss der Form aus der verzerrten Hülle (Ecken ohne Griffe) */
export function meshPath(m: ZoneMesh): ZonePath {
  return m.pts.slice(0, m.hull).map((p) => ({ x: r3(p.x), y: r3(p.y) }));
}

/** Hülle ohne Verzerrung */
export const restHull = (m: ZoneMesh): Poly => m.pts.slice(0, m.hull).map((p): [number, number] => [p.rx, p.ry]);
/** verzerrte Hülle */
export const deformedHull = (m: ZoneMesh): Poly => m.pts.slice(0, m.hull).map((p): [number, number] => [p.x, p.y]);

const restFaces = new Map<string, Face>();
/**
 * Fläche ohne Verzerrung (Umriss gegen den Uhrzeigersinn): in ihr wird die Form gemalt. Gleiche Hülle, gleiches Objekt,
 * so trifft der Zwischenspeicher des Kantenabstands auch beim Verformen
 */
export function meshRestFace(m: ZoneMesh): Face | null {
  const hull = restHull(m);
  const key = hull.map(([x, y]) => `${r3(x)},${r3(y)}`).join(' ');
  let face = restFaces.get(key);
  if (!face) {
    face = computeFaces(hull, [], [])[0];
    if (!face) return null;
    restFaces.set(key, face);
    if (restFaces.size > 64) restFaces.delete(restFaces.keys().next().value as string);
  }
  return face;
}

/** ist das Netz verzerrt (ein Punkt mehr als 1 mm neben seiner Lage ohne Verzerrung)? */
export const meshDeformed = (m: ZoneMesh): boolean => m.pts.some((p) => Math.hypot(p.x - p.rx, p.y - p.ry) > 1e-3);

/** Verzerrung zurücknehmen (alle Punkte oder die in only) */
export function resetDeform(m: ZoneMesh, only?: ReadonlySet<number>): void {
  m.pts.forEach((p, i) => {
    if (only && !only.has(i)) return;
    p.x = p.rx;
    p.y = p.ry;
  });
}

/** beide Lagen abbilden (Drehen, Spiegeln der Form) */
export function mapMeshPoints(m: ZoneMesh, fn: (x: number, y: number) => [number, number]): void {
  for (const p of m.pts) {
    [p.rx, p.ry] = fn(p.rx, p.ry);
    [p.x, p.y] = fn(p.x, p.y);
  }
}

// ------------------------------------------------------------------ Geometrie

const orient = (a: readonly number[], b: readonly number[], c: readonly number[]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** positiv, wenn d im Umkreis des Dreiecks a, b, c (gegen den Uhrzeigersinn) liegt */
function inCircle(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): number {
  const adx = a[0] - d[0];
  const ady = a[1] - d[1];
  const bdx = b[0] - d[0];
  const bdy = b[1] - d[1];
  const cdx = c[0] - d[0];
  const cdy = c[1] - d[1];
  return (adx * adx + ady * ady) * (bdx * cdy - bdy * cdx) - (bdx * bdx + bdy * bdy) * (adx * cdy - ady * cdx) + (cdx * cdx + cdy * cdy) * (adx * bdy - ady * bdx);
}

/** Schwerpunktskoordinaten von p im Dreieck a, b, c (entartet: alle −1) */
export function barycentric(p: readonly number[], a: readonly number[], b: readonly number[], c: readonly number[]): [number, number, number] {
  const d = orient(a, b, c);
  if (Math.abs(d) < 1e-18) return [-1, -1, -1];
  const l1 = orient(p, b, c) / d;
  const l2 = orient(a, p, c) / d;
  return [l1, l2, 1 - l1 - l2];
}

/** liegt p im Vieleck (gerade-ungerade)? */
export function inPoly(poly: ReadonlyArray<readonly number[]>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** nächste Stelle auf einer Strecke: Lage t (0 bis 1) und Abstand (mit Maßstab sx, sy) */
function onSegment(a: readonly number[], b: readonly number[], x: number, y: number, sx = 1, sy = 1): { t: number; d: number } {
  const dx = (b[0] - a[0]) * sx;
  const dy = (b[1] - a[1]) * sy;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 1e-18 ? Math.max(0, Math.min(1, ((x - a[0]) * sx * dx + (y - a[1]) * sy * dy) / l2)) : 0;
  return { t, d: Math.hypot((x - a[0]) * sx - t * dx, (y - a[1]) * sy - t * dy) };
}

/** Abstand eines Punkts zum Rand eines Vielecks (sx, sy: Maßstab, Ergebnis in Metern der Ebene) */
export function distToPolyEdge(poly: ReadonlyArray<readonly number[]>, x: number, y: number, sx = 1, sy = 1): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, onSegment(poly[i], poly[(i + 1) % poly.length], x, y, sx, sy).d);
  return best;
}

/** Ohren abschneiden: Dreiecke eines einfachen Vielecks (Nummern in ring, gegen den Uhrzeigersinn) */
function earClip(P: ReadonlyArray<readonly number[]>, ring0: readonly number[]): number[] {
  const out: number[] = [];
  const ring = [...ring0];
  while (ring.length > 3) {
    let cut = false;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k + ring.length - 1) % ring.length];
      const b = ring[k];
      const c = ring[(k + 1) % ring.length];
      if (orient(P[a], P[b], P[c]) <= 1e-14) continue;
      let empty = true;
      for (const j of ring) {
        if (j === a || j === b || j === c) continue;
        const [l1, l2, l3] = barycentric(P[j], P[a], P[b], P[c]);
        if (l1 >= -1e-12 && l2 >= -1e-12 && l3 >= -1e-12) {
          empty = false;
          break;
        }
      }
      if (!empty) continue;
      out.push(a, b, c);
      ring.splice(k, 1);
      cut = true;
      break;
    }
    // ohne Ohr (entartete Hülle): den Rest als Fächer
    if (!cut) {
      for (let k = 1; k + 1 < ring.length; k++) if (orient(P[ring[0]], P[ring[k]], P[ring[k + 1]]) > 1e-14) out.push(ring[0], ring[k], ring[k + 1]);
      return out;
    }
  }
  if (ring.length === 3 && orient(P[ring[0]], P[ring[1]], P[ring[2]]) > 1e-14) out.push(ring[0], ring[1], ring[2]);
  return out;
}

const ekey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * Eingeschränkte Delaunay-Triangulierung: die ersten hull Punkte sind ein einfaches Vieleck (die Hülle), die übrigen
 * liegen darin. Ohren der Hülle und nach Lawson umklappen, bis jede Kante (außer der Hülle) lokal Delaunay ist; dann jeden
 * inneren Punkt in sein Dreieck setzen (liegt er auf einer Kante, teilt er beide Dreiecke daran) und die Kanten gegenüber
 * prüfen und umklappen, bis wieder alle Delaunay sind. Hüllkanten klappen nie. Punkte außerhalb der Hülle und doppelte
 * bleiben ohne Dreieck
 */
export function triangulate(P: ReadonlyArray<readonly [number, number]>, hull: number): number[] {
  if (hull < 3 || P.length < hull) return [];
  let area = 0;
  for (let i = 0; i < hull; i++) {
    const a = P[i];
    const b = P[(i + 1) % hull];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ring = Array.from({ length: hull }, (_, i) => i);
  if (area < 0) ring.reverse();
  const tris = earClip(P, ring);
  const hullPoly = ring.map((i) => P[i]);
  let scale = 1e-9;
  for (const p of P) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]));
  const tiny = 1e-18 * scale ** 4;
  const N = P.length;
  // gerichtete Kante a → b: Dreieck (Platz), in dem sie gegen den Uhrzeigersinn liegt
  const owner = new Map<number, number>();
  const dk = (a: number, b: number): number => a * N + b;
  const uk = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  const constrained = new Set<number>();
  for (let i = 0; i < hull; i++) constrained.add(uk(i, (i + 1) % hull));
  const put = (s: number, a: number, b: number, c: number): void => {
    tris[s * 3] = a;
    tris[s * 3 + 1] = b;
    tris[s * 3 + 2] = c;
    owner.set(dk(a, b), s);
    owner.set(dk(b, c), s);
    owner.set(dk(c, a), s);
  };
  const third = (s: number, a: number, b: number): number => {
    for (let q = 0; q < 3; q++) {
      const x = tris[s * 3 + q];
      if (x !== a && x !== b) return x;
    }
    return -1;
  };
  for (let s = 0; s < tris.length / 3; s++) put(s, tris[s * 3], tris[s * 3 + 1], tris[s * 3 + 2]);
  // Lawson mit Stapel: Kante a → b prüfen, umklappen, die vier äußeren Kanten des Vierecks nachprüfen
  const stack: number[] = [];
  let budget = 200 * (tris.length + 3 * N);
  const legalize = (): void => {
    while (stack.length && budget-- > 0) {
      const b = stack.pop() as number;
      const a = stack.pop() as number;
      if (constrained.has(uk(a, b))) continue;
      const s1 = owner.get(dk(a, b));
      const s2 = owner.get(dk(b, a));
      if (s1 === undefined || s2 === undefined) continue;
      const c = third(s1, a, b);
      const d = third(s2, a, b);
      if (c < 0 || d < 0 || inCircle(P[a], P[b], P[c], P[d]) <= tiny) continue;
      // nur ein konvexes Viereck lässt sich umklappen
      if (orient(P[a], P[d], P[c]) <= 1e-14 || orient(P[d], P[b], P[c]) <= 1e-14) continue;
      owner.delete(dk(a, b));
      owner.delete(dk(b, a));
      put(s1, a, d, c);
      put(s2, d, b, c);
      stack.push(a, d, d, b, b, c, c, a);
    }
    stack.length = 0;
  };
  for (let s = 0; s < tris.length / 3; s++) stack.push(tris[s * 3], tris[s * 3 + 1], tris[s * 3 + 1], tris[s * 3 + 2], tris[s * 3 + 2], tris[s * 3]);
  legalize();
  const EPS = 1e-9;
  for (let i = hull; i < N; i++) {
    const p = P[i];
    if (!inPoly(hullPoly, p[0], p[1])) continue;
    let dup = false;
    for (let j = 0; j < i && !dup; j++) dup = Math.abs(P[j][0] - p[0]) + Math.abs(P[j][1] - p[1]) < 1e-7 * scale;
    if (dup) continue;
    let at = -1;
    let l: number[] = [];
    for (let s = 0; s < tris.length / 3 && at < 0; s++) {
      l = barycentric(p, P[tris[s * 3]], P[tris[s * 3 + 1]], P[tris[s * 3 + 2]]);
      if (l[0] >= -EPS && l[1] >= -EPS && l[2] >= -EPS) at = s;
    }
    if (at < 0) continue;
    const tri = [tris[at * 3], tris[at * 3 + 1], tris[at * 3 + 2]];
    const k = l.findIndex((x) => Math.abs(x) <= EPS);
    if (k < 0) {
      const [a, b, c] = tri;
      put(at, a, b, i);
      put(tris.length / 3, b, c, i);
      put(tris.length / 3, c, a, i);
      stack.push(a, b, b, c, c, a);
    } else {
      // auf der Kante a → b gegenüber von c: dieses Dreieck und das Nachbardreieck (b, a, d) teilen
      const c = tri[k];
      const a = tri[(k + 1) % 3];
      const b = tri[(k + 2) % 3];
      const s2 = owner.get(dk(b, a));
      owner.delete(dk(a, b));
      owner.delete(dk(b, a));
      put(at, a, i, c);
      put(tris.length / 3, i, b, c);
      stack.push(c, a, b, c);
      if (s2 !== undefined) {
        const d = third(s2, a, b);
        put(s2, b, i, d);
        put(tris.length / 3, i, a, d);
        stack.push(d, b, a, d);
      }
    }
    legalize();
  }
  return tris;
}

/** Dreiecke neu rechnen (nach Ändern der Lagen ohne Verzerrung oder der Punkte) */
export function retriangulate(m: ZoneMesh): void {
  m.tris = triangulate(
    m.pts.map((p): [number, number] => [p.rx, p.ry]),
    m.hull,
  );
}

/** ist das Netz in Ordnung? Hülle ohne Kreuzung, jeder innere Punkt in ihr, jeder Punkt an einem Dreieck */
export function meshValid(m: ZoneMesh): boolean {
  if (m.hull < 3 || m.hull > m.pts.length) return false;
  const hull = restHull(m);
  if (selfIntersections(hull) > 0) return false;
  for (let i = m.hull; i < m.pts.length; i++) if (!inPoly(hull, m.pts[i].rx, m.pts[i].ry)) return false;
  const used = new Uint8Array(m.pts.length);
  for (const i of m.tris) used[i] = 1;
  return used.every((u) => u === 1);
}

// ------------------------------------------------------------------ Netze anlegen und ändern

/** Netz aus Hülle und inneren Punkten (Pfad-Koordinaten), noch ohne Verzerrung */
export function meshFrom(hull: Poly, interior: Poly = []): ZoneMesh {
  const m: ZoneMesh = { pts: [...hull, ...interior].map(([x, y]) => ({ rx: x, ry: y, x, y })), hull: hull.length, tris: [] };
  retriangulate(m);
  return m;
}

/** Kanten der Hülle unterteilen, bis keine länger als step ist (Meter der Ebene; sx, sy: Maßstab der Form) */
function densify(hull: Poly, step: number, sx: number, sy: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    out.push(a);
    const n = Math.floor(Math.hypot((b[0] - a[0]) * sx, (b[1] - a[1]) * sy) / step);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / (n + 1), a[1] + ((b[1] - a[1]) * k) / (n + 1)]);
  }
  return out;
}

/** Abstand der inneren Punkte (Meter der Ebene) für eine Hülle und Dichte */
export function meshStep(hull: Poly, sx: number, sy: number, density: MeshDensity): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of hull) {
    minX = Math.min(minX, x * Math.abs(sx));
    maxX = Math.max(maxX, x * Math.abs(sx));
    minY = Math.min(minY, y * Math.abs(sy));
    maxY = Math.max(maxY, y * Math.abs(sy));
  }
  return Math.max(maxX - minX, maxY - minY, 1e-3) / DENSITY_DIV[density];
}

/** innere Punkte im Wabenraster (Abstand step in Metern der Ebene), mindestens einen halben Abstand vom Rand */
export function gridInside(hull: Poly, step: number, sx = 1, sy = 1): Poly {
  const ax = Math.max(1e-6, Math.abs(sx));
  const ay = Math.max(1e-6, Math.abs(sy));
  const P = hull.map(([x, y]) => [x * ax, y * ay]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of P) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const out: Poly = [];
  const dy = step * 0.866;
  const rows = Math.max(1, Math.round((maxY - minY) / dy));
  const y0 = minY + (maxY - minY - (rows - 1) * dy) / 2;
  for (let row = 0; row < rows; row++) {
    const y = y0 + row * dy;
    for (let x = minX + (row % 2 ? step : step / 2); x < maxX; x += step) {
      if (!inPoly(P, x, y) || distToPolyEdge(P, x, y) < step * 0.5) continue;
      out.push([x / ax, y / ay]);
      if (out.length >= MESH_MAX_POINTS / 2) return out;
    }
  }
  return out;
}

/**
 * Hülle aus dem Umriss einer Form (Spines „Generate“): geglättet, vereinfacht auf höchstens 48 Ecken ohne Kreuzung, lange
 * Kanten unterteilt. null, wenn sich keine einfache Hülle findet
 */
export function hullFromPath(path: ZonePath, sx: number, sy: number, step: number): Poly | null {
  const k = Math.max(0.05, Math.max(Math.abs(sx), Math.abs(sy)));
  const flat = flattenPath(path, 0.25 / k);
  if (flat.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of flat) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let tol = Math.max(maxX - minX, maxY - minY) / 400;
  for (let tries = 0; tries < 30; tries++, tol *= 1.4) {
    const hull = simplifyPoly(flat, tol);
    if (hull.length > 48 || hull.length < 3) continue;
    if (selfIntersections(hull) > 0) continue;
    return densify(hull, step, Math.abs(sx), Math.abs(sy));
  }
  return null;
}

/** Netz für eine Form (Spines „Generate“): Hülle aus ihrem Umriss, innen ein Wabenraster; null ohne einfache Hülle */
export function autoMesh(path: ZonePath, sx: number, sy: number, density: MeshDensity = 'mid'): ZoneMesh | null {
  const step = meshStep(flattenPath(path, 1), sx, sy, density);
  const hull = hullFromPath(path, sx, sy, step);
  return hull ? meshFrom(hull, gridInside(hull, step, sx, sy)) : null;
}

/** Dreieck (Nummer des ersten Index) und Schwerpunktskoordinaten einer Stelle, in der Lage ohne Verzerrung oder verzerrt */
export function triangleAt(m: ZoneMesh, x: number, y: number, rest: boolean): { t: number; l: [number, number, number] } | null {
  const P = (i: number): [number, number] => (rest ? [m.pts[i].rx, m.pts[i].ry] : [m.pts[i].x, m.pts[i].y]);
  for (let t = 0; t < m.tris.length; t += 3) {
    const l = barycentric([x, y], P(m.tris[t]), P(m.tris[t + 1]), P(m.tris[t + 2]));
    if (Math.min(...l) >= -1e-9) return { t, l };
  }
  return null;
}

/** verzerrte Stelle → Stelle ohne Verzerrung (für Pipette und Treffer im Bild); außerhalb des Netzes null */
export function restFromDeformed(m: ZoneMesh, x: number, y: number): [number, number] | null {
  const hit = triangleAt(m, x, y, false);
  if (!hit) return null;
  let rx = 0;
  let ry = 0;
  for (let k = 0; k < 3; k++) {
    const p = m.pts[m.tris[hit.t + k]];
    rx += hit.l[k] * p.rx;
    ry += hit.l[k] * p.ry;
  }
  return [rx, ry];
}

/** Verzerrung (verzerrt minus ohne) an einer Stelle ohne Verzerrung: aus dem Dreieck dort, sonst vom nächsten Punkt */
function displacementAt(m: ZoneMesh, x: number, y: number): [number, number] {
  const hit = triangleAt(m, x, y, true);
  if (hit) {
    let dx = 0;
    let dy = 0;
    for (let k = 0; k < 3; k++) {
      const p = m.pts[m.tris[hit.t + k]];
      dx += hit.l[k] * (p.x - p.rx);
      dy += hit.l[k] * (p.y - p.ry);
    }
    return [dx, dy];
  }
  let best: MeshPoint | null = null;
  let bestD = Infinity;
  for (const p of m.pts) {
    const d = Math.hypot(p.rx - x, p.ry - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? [best.x - best.rx, best.y - best.ry] : [0, 0];
}

/** nächste Hüllkante an einer Stelle: Kante nach Hüllpunkt `after`, Lage t, Abstand in Metern der Ebene */
export function nearestHullEdge(m: ZoneMesh, x: number, y: number, rest: boolean, sx = 1, sy = 1): { after: number; t: number; d: number } {
  let best = { after: 0, t: 0, d: Infinity };
  const P = (i: number): [number, number] => (rest ? [m.pts[i].rx, m.pts[i].ry] : [m.pts[i].x, m.pts[i].y]);
  for (let i = 0; i < m.hull; i++) {
    const s = onSegment(P(i), P((i + 1) % m.hull), x, y, sx, sy);
    if (s.d < best.d) best = { after: i, t: s.t, d: s.d };
  }
  return best;
}

/**
 * Punkt einsetzen an einer Stelle ohne Verzerrung: innen, oder mit `onHull` auf die Hüllkante nach Hüllpunkt
 * onHull.after an der Lage onHull.t. Er übernimmt die Verzerrung der Stelle, das Bild bleibt, wie es war. Gibt die Nummer
 * des neuen Punkts, −1 außerhalb der Hülle oder über der Höchstzahl
 */
export function addMeshPoint(m: ZoneMesh, x: number, y: number, onHull: { after: number; t: number } | null = null): number {
  if (m.pts.length >= MESH_MAX_POINTS) return -1;
  let at: number;
  if (onHull) {
    const a = m.pts[onHull.after];
    const b = m.pts[(onHull.after + 1) % m.hull];
    const t = Math.max(0.02, Math.min(0.98, onHull.t));
    const p = { rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    at = onHull.after + 1;
    m.pts.splice(at, 0, p);
    m.hull++;
  } else {
    if (!inPoly(restHull(m), x, y)) return -1;
    const [dx, dy] = displacementAt(m, x, y);
    at = m.pts.push({ rx: x, ry: y, x: x + dx, y: y + dy }) - 1;
  }
  retriangulate(m);
  return at;
}

/** Punkte entfernen (die Hülle behält mindestens drei); neu trianguliert; false, wenn das nicht geht */
export function removeMeshPoints(m: ZoneMesh, idx: ReadonlySet<number>): boolean {
  const hullLeft = m.pts.slice(0, m.hull).filter((_, i) => !idx.has(i)).length;
  if (hullLeft < 3) return false;
  m.pts = m.pts.filter((_, i) => !idx.has(i));
  m.hull = hullLeft;
  retriangulate(m);
  return true;
}

/**
 * Innere Punkte neu im Wabenraster (Spines „Generate“ bei bestehender Hülle); jeder neue übernimmt die Verzerrung an
 * seiner Stelle
 */
export function refillMesh(m: ZoneMesh, sx: number, sy: number, density: MeshDensity): void {
  const old = cloneMesh(m);
  const hull = restHull(m);
  const inner = gridInside(hull, meshStep(hull, sx, sy, density), sx, sy).map(([x, y]) => {
    const [dx, dy] = displacementAt(old, x, y);
    return { rx: x, ry: y, x: x + dx, y: y + dy };
  });
  m.pts = [...m.pts.slice(0, m.hull), ...inner];
  retriangulate(m);
}

/** was der Renderer braucht: Ecken (verzerrt, mit rest ohne Verzerrung), Lagen ohne Verzerrung, Dreiecke */
export function meshTriangles(m: ZoneMesh, rest = false): { pts: Float32Array; local: Float32Array; index: Uint32Array } {
  const pts = new Float32Array(m.pts.length * 2);
  const local = new Float32Array(m.pts.length * 2);
  m.pts.forEach((p, i) => {
    pts[i * 2] = rest ? p.rx : p.x;
    pts[i * 2 + 1] = rest ? p.ry : p.y;
    local[i * 2] = p.rx;
    local[i * 2 + 1] = p.ry;
  });
  return { pts, local, index: Uint32Array.from(m.tris) };
}

/** Kanten des Netzes (je einmal) für die Überlagerung */
export function meshEdges(m: ZoneMesh): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let t = 0; t < m.tris.length; t += 3)
    for (let q = 0; q < 3; q++) {
      const a = m.tris[t + q];
      const b = m.tris[t + ((q + 1) % 3)];
      const key = ekey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  return out;
}
