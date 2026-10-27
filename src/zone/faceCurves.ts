/**
 * Flächen einer geteilten Form als echte Kurven (Zonen-Editor, Stufe 2, für den SVG-Export): src/zone/faces.ts rechnet
 * auf geglätteten Zügen; hier wird jeder Rand einer Fläche wieder den Pfaden der Form zugeordnet (Umriss, Löcher,
 * Teilungslinien) und aus deren Kurvenstücken zusammengesetzt, geteilt an den Kreuzungen (de Casteljau). So kommt eine
 * Fläche als wenige Anker mit Griffen nach Illustrator statt als Vieleck. Was sich nicht zuordnen lässt, bleibt gerade.
 */
import type { Face } from './faces';
import { FLATTEN_STEP, shapePaths, type ZoneShape } from './nodes';
import type { PathPoint, Poly, ZonePath } from './path';

type V = [number, number];
type Cubic = [V, V, V, V];

interface Src {
  path: ZonePath;
  closed: boolean;
  /** Anzahl der Stücke */
  m: number;
  /** Abtastpunkte wie flattenPath, mit Lage g = Stück + Anteil */
  pts: Array<{ x: number; y: number; g: number }>;
}

/** Toleranz der Zuordnung (Meter): das Raster der Flächen rundet auf Millimeter */
const TOL = 0.002;

function segment(path: ZonePath, i: number): Cubic {
  const a = path[i];
  const b = path[(i + 1) % path.length];
  return [
    [a.x, a.y],
    [a.x + (a.outX ?? 0), a.y + (a.outY ?? 0)],
    [b.x + (b.inX ?? 0), b.y + (b.inY ?? 0)],
    [b.x, b.y],
  ];
}

const lerp = (p: V, q: V, t: number): V => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** Kurve zwischen t0 und t1 (0 ≤ t0 < t1 ≤ 1) */
function subCubic(c: Cubic, t0: number, t1: number): Cubic {
  const split = (b: Cubic, t: number): [Cubic, Cubic] => {
    const q0 = lerp(b[0], b[1], t);
    const q1 = lerp(b[1], b[2], t);
    const q2 = lerp(b[2], b[3], t);
    const r0 = lerp(q0, q1, t);
    const r1 = lerp(q1, q2, t);
    const m = lerp(r0, r1, t);
    return [
      [b[0], q0, r0, m],
      [m, r1, q2, b[3]],
    ];
  };
  let right = t0 > 0 ? split(c, t0)[1] : c;
  if (t1 < 1) right = split(right, (t1 - t0) / (1 - t0))[0];
  return right;
}

const reverse = (c: Cubic): Cubic => [c[3], c[2], c[1], c[0]];

/** Abtastung wie flattenPath (gleiche Punkte), mit Lage */
function sample(path: ZonePath, closed: boolean, step: number): Src {
  const n = path.length;
  const m = closed ? n : n - 1;
  const pts: Src['pts'] = [];
  for (let i = 0; i < m; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    pts.push({ x: a.x, y: a.y, g: i });
    if (!a.outX && !a.outY && !b.inX && !b.inY) continue;
    const c = segment(path, i);
    const len = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) + Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]) + Math.hypot(c[3][0] - c[2][0], c[3][1] - c[2][1]);
    const segs = Math.max(2, Math.min(48, Math.ceil(len / step)));
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const u = 1 - t;
      pts.push({ x: u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0], y: u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1], g: i + t });
    }
  }
  // Schluss: geschlossen zurück zum Anfang (Lage m), offen der letzte Anker
  pts.push(closed ? { x: path[0].x, y: path[0].y, g: m } : { x: path[n - 1].x, y: path[n - 1].y, g: m });
  return { path, closed, m, pts };
}

/** Lage des Punkts p auf der Quelle (nächster Sehnenpunkt), wenn er höchstens TOL entfernt ist */
function locate(src: Src, x: number, y: number): number | null {
  let best: number | null = null;
  let bestD = TOL;
  for (let j = 0; j + 1 < src.pts.length; j++) {
    const a = src.pts[j];
    const b = src.pts[j + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
    const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (d <= bestD) {
      bestD = d;
      best = a.g + (b.g - a.g) * t;
    }
  }
  return best;
}

/** Kurvenstücke der Quelle von Lage ga nach gb (rückwärts, wenn gb < ga; geschlossen auch über den Anfang) */
function piece(src: Src, ga: number, gb: number): Cubic[] {
  if (gb < ga) return piece(src, gb, ga).reverse().map(reverse);
  const out: Cubic[] = [];
  for (let i = Math.floor(ga); i < gb; i++) {
    const t0 = Math.max(0, ga - i);
    const t1 = Math.min(1, gb - i);
    if (t1 - t0 < 1e-9) continue;
    const k = src.closed ? ((i % src.m) + src.m) % src.m : i;
    if (k < 0 || k >= src.m) continue;
    out.push(subCubic(segment(src.path, k), t0, t1));
  }
  return out;
}

const straight = (c: Cubic): boolean => {
  // Griffe auf der Sehne und nicht länger als sie: gerade
  const dx = c[3][0] - c[0][0];
  const dy = c[3][1] - c[0][1];
  const L = Math.hypot(dx, dy) || 1;
  const off = (p: V) => Math.abs((p[0] - c[0][0]) * dy - (p[1] - c[0][1]) * dx) / L;
  return off(c[1]) < 1e-6 && off(c[2]) < 1e-6;
};

/** ein Rand der Fläche (Polygon) als Pfad mit den Kurven der Quellen */
function ringCurves(ring: Poly, srcs: Src[]): ZonePath {
  const L = ring.length;
  // je Ecke die Lagen auf allen Quellen
  const locs = ring.map(([x, y]) => srcs.map((s) => locate(s, x, y)));
  // je Kante die Quelle und die Lagen ihrer Enden
  const edges = ring.map((_, k) => {
    const k2 = (k + 1) % L;
    for (let s = 0; s < srcs.length; s++) {
      const g1 = locs[k][s];
      let g2 = locs[k2][s];
      if (g1 === null || g2 === null) continue;
      const src = srcs[s];
      if (src.closed) {
        // über den Anfang hinweg die nähere Schreibweise
        if (g2 - g1 > src.m / 2) g2 -= src.m;
        else if (g1 - g2 > src.m / 2) g2 += src.m;
      }
      if (Math.abs(g2 - g1) > 1 + 1e-9 || g1 === g2) continue;
      // die Mitte der Kante muss auch auf der Quelle liegen (eine gerade Linie zwischen zwei Punkten derselben Kurve ist
      // nicht die Kurve)
      const mx = (ring[k][0] + ring[k2][0]) / 2;
      const my = (ring[k][1] + ring[k2][1]) / 2;
      if (locate(src, mx, my) === null) continue;
      return { s, g1, g2 };
    }
    return null;
  });
  // Läufe: aufeinanderfolgende Kanten derselben Quelle in derselben Richtung
  const same = (a: (typeof edges)[number], b: (typeof edges)[number]): boolean => {
    if (!a || !b || a.s !== b.s) return false;
    if (Math.sign(a.g2 - a.g1) !== Math.sign(b.g2 - b.g1)) return false;
    const src = srcs[a.s];
    const gap = src.closed ? (((b.g1 - a.g2) % src.m) + src.m) % src.m : b.g1 - a.g2;
    return Math.min(Math.abs(gap), src.closed ? Math.abs(src.m - Math.abs(gap)) : Infinity) < 1e-6;
  };
  let start = edges.findIndex((e, k) => !same(edges[(k - 1 + L) % L], e));
  const cubics: Array<{ c: Cubic }> = [];
  if (start < 0) {
    // ein einziger Lauf rundum: die ganze Quelle, wie sie ist (in der Richtung der Fläche)
    const e = edges[0];
    if (e && srcs[e.s].closed) {
      const path = srcs[e.s].path.map((p) => ({ ...p }));
      if (e.g2 > e.g1) return path;
      return path.reverse().map((p) => {
        const o: PathPoint = { x: p.x, y: p.y };
        if (p.outX || p.outY) {
          o.inX = p.outX;
          o.inY = p.outY;
        }
        if (p.inX || p.inY) {
          o.outX = p.inX;
          o.outY = p.inY;
        }
        return o;
      });
    }
    start = 0;
  }
  for (let n = 0; n < L; ) {
    const k = (start + n) % L;
    const e = edges[k];
    if (!e) {
      const a = ring[k];
      const b = ring[(k + 1) % L];
      cubics.push({ c: [[a[0], a[1]], [a[0], a[1]], [b[0], b[1]], [b[0], b[1]]] });
      n++;
      continue;
    }
    // Lauf so weit wie möglich
    let g2 = e.g2;
    let len = 1;
    while (len < L && same(edges[(k + len - 1) % L], edges[(k + len) % L])) {
      const nx = edges[(k + len) % L]!;
      g2 += nx.g2 - nx.g1;
      len++;
    }
    const list = piece(srcs[e.s], e.g1, g2);
    // Anfang und Ende des Laufs genau auf die Ecken der Fläche (Kreuzungen teilen sich so die Punkte)
    if (list.length) {
      const a = ring[k];
      const b = ring[(k + len) % L];
      const first = list[0];
      const dx0 = a[0] - first[0][0];
      const dy0 = a[1] - first[0][1];
      list[0] = [[a[0], a[1]], [first[1][0] + dx0, first[1][1] + dy0], first[2], first[3]];
      const last = list[list.length - 1];
      const dx1 = b[0] - last[3][0];
      const dy1 = b[1] - last[3][1];
      list[list.length - 1] = [last[0], last[1], [last[2][0] + dx1, last[2][1] + dy1], [b[0], b[1]]];
    }
    for (const c of list) cubics.push({ c });
    n += len;
  }
  // Kurven zu Ankern; winzige Stücke fallen weg
  const out: ZonePath = [];
  const kept = cubics.filter(({ c }) => Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]) > 1e-4 || !straight(c));
  kept.forEach(({ c }, i) => {
    const prev = kept[(i - 1 + kept.length) % kept.length].c;
    const p: PathPoint = { x: c[0][0], y: c[0][1] };
    if (!straight(c)) {
      p.outX = c[1][0] - c[0][0];
      p.outY = c[1][1] - c[0][1];
    }
    if (!straight(prev)) {
      p.inX = prev[2][0] - prev[3][0];
      p.inY = prev[2][1] - prev[3][1];
    }
    out.push(p);
  });
  return out;
}

/**
 * ein Rand (Vieleck, dessen Kanten auf den geglätteten Pfaden liegen) als Pfad mit den Kurven dieser Pfade; step: die
 * Glättung, mit der der Rand entstand (für Boolesche Operationen über mehrere Formen)
 */
export function curvesOnPaths(ring: Poly, paths: ReadonlyArray<{ path: ZonePath; closed: boolean }>, step = FLATTEN_STEP): ZonePath {
  return ringCurves(
    ring,
    paths.map(({ path, closed }) => sample(path, closed, step)),
  );
}

/**
 * Fläche einer Form (aus shapeFaces(shape) mit Feinheit 1) als Umriss und Löcher mit Kurven, in Pfad-Koordinaten der
 * Form
 */
export function faceCurves(shape: ZoneShape, face: Face, step = FLATTEN_STEP): { outline: ZonePath; holes: ZonePath[] } {
  const srcs = shapePaths(shape).map(({ path, closed }) => sample(path, closed, step));
  return { outline: ringCurves(face.outline, srcs), holes: face.holes.map((h) => ringCurves(h, srcs)) };
}
