/**
 * Boolesche Operationen über Formen einer Ebene (Zonen-Editor, Rest von Stufe 2; Plan 4.3 „Vereinen, Abziehen,
 * Schnittmenge“, wie Illustrators Pathfinder): Alle Pfade der Formen kommen in ein gemeinsames Vektornetz
 * (src/zone/faces.ts); jede Fläche des Netzes weiß über ihren inneren Punkt, in welchen Formen sie liegt (Löcher und zu
 * Löchern gemachte Flächen zählen nicht). Die Flächen des Ergebnisses verschmelzen, indem gemeinsame Kanten wegfallen;
 * die übrigen Kanten ergeben die Ränder, und die bekommen ihre Kurven von den Pfaden zurück (src/zone/faceCurves.ts).
 * Ohne DOM.
 */
import { computeFaces, faceAt } from './faces';
import { curvesOnPaths } from './faceCurves';
import { faceFill, shapeFaces, shapePaths, type ZoneShape } from './nodes';
import { flattenPath, inPolygon, type PathPoint, type Poly, type ZonePath } from './path';

export type BoolOp = 'unite' | 'minus' | 'intersect' | 'exclude';

/** Ergebnis: ein Umriss mit Löchern, in Ebenen-Koordinaten */
export interface BoolRegion {
  outline: ZonePath;
  holes: ZonePath[];
}

/** feine Glättung für die Kreuzungen (Meter): die Kurven kommen ohnehin von den Pfaden zurück */
const STEP = 0.05;

/** Pfad einer Form in Ebenen-Koordinaten */
function toPlane(s: ZoneShape, path: ZonePath): ZonePath {
  return path.map((p) => {
    const o: PathPoint = { x: s.x + s.sx * p.x, y: s.y + s.sy * p.y };
    if (p.inX || p.inY) {
      o.inX = s.sx * (p.inX ?? 0);
      o.inY = s.sy * (p.inY ?? 0);
    }
    if (p.outX || p.outY) {
      o.outX = s.sx * (p.outX ?? 0);
      o.outY = s.sy * (p.outY ?? 0);
    }
    return o;
  });
}

/** liegt der Punkt (Ebenen-Koordinaten) in einer gefüllten Fläche der Form? */
function inside(s: ZoneShape, x: number, y: number): boolean {
  const faces = shapeFaces(s);
  const i = faceAt(faces, (x - s.x) / s.sx, (y - s.y) / s.sy);
  return i >= 0 && faceFill(s, faces[i]) !== null;
}

const key = (x: number, y: number): string => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

/** Fläche mit Vorzeichen: gegen den Uhrzeigersinn positiv */
function area(r: Poly): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/**
 * Boolesche Operation: unite (alles, was in einer Form liegt), minus (die hinterste ohne die anderen), intersect (was in
 * allen liegt), exclude (was in einer ungeraden Zahl liegt). shapes: Formen einer Ebene in Zeichenreihenfolge (die
 * hinterste zuerst). Leer, wenn nichts übrig bleibt
 */
export function booleanShapes(shapes: readonly ZoneShape[], op: BoolOp): BoolRegion[] {
  if (shapes.length < 2) return [];
  // alle Pfade in Ebenen-Koordinaten: Linien des Netzes und Quellen der Kurven
  const sources: Array<{ path: ZonePath; closed: boolean }> = [];
  for (const s of shapes) for (const { path, closed } of shapePaths(s)) sources.push({ path: toPlane(s, path), closed });
  const lines = sources.map(({ path, closed }) => ({ poly: flattenPath(path, STEP, closed), closed }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of lines)
    for (const [x, y] of l.poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const frame: Poly = [
    [minX - 1, minY - 1],
    [maxX + 1, minY - 1],
    [maxX + 1, maxY + 1],
    [minX - 1, maxY + 1],
  ];
  const faces = computeFaces(frame, [], lines);
  const keep = faces.filter((f) => {
    const [x, y] = f.inner;
    const ins = shapes.map((s) => inside(s, x, y));
    const n = ins.filter(Boolean).length;
    if (op === 'unite') return n > 0;
    if (op === 'intersect') return n === shapes.length;
    if (op === 'exclude') return n % 2 === 1;
    return ins[0] && n === 1;
  });
  if (!keep.length) return [];
  // gerichtete Kanten der behaltenen Flächen (Fläche links); gemeinsame Kanten zweier Flächen heben sich auf
  const edges = new Map<string, { a: [number, number]; b: [number, number] }>();
  const addRing = (ring: Poly, ccw: boolean) => {
    const pts = area(ring) > 0 === ccw ? ring : [...ring].reverse();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const k = `${key(a[0], a[1])}>${key(b[0], b[1])}`;
      const back = `${key(b[0], b[1])}>${key(a[0], a[1])}`;
      if (edges.has(back)) edges.delete(back);
      else edges.set(k, { a, b });
    }
  };
  for (const f of keep) {
    addRing(f.outline, true);
    for (const h of f.holes) addRing(h, false);
  }
  // Ränder ablaufen; an einem Berührpunkt die Kante mit der stärksten Linkskurve (die Fläche bleibt links, Ringe einfach)
  const out = new Map<string, Array<{ a: [number, number]; b: [number, number] }>>();
  for (const e of edges.values()) {
    const k = key(e.a[0], e.a[1]);
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  const rings: Poly[] = [];
  const used = new Set<{ a: [number, number]; b: [number, number] }>();
  for (const start of edges.values()) {
    if (used.has(start)) continue;
    const ring: Poly = [];
    let e = start;
    for (let guard = 0; guard < 1e6; guard++) {
      used.add(e);
      ring.push(e.a);
      const cand = (out.get(key(e.b[0], e.b[1])) ?? []).filter((c) => !used.has(c));
      if (!cand.length) break;
      const din = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      let best = cand[0];
      let bestTurn = -Infinity;
      for (const c of cand) {
        let t = Math.atan2(c.b[1] - c.a[1], c.b[0] - c.a[0]) - din;
        while (t <= -Math.PI) t += 2 * Math.PI;
        while (t > Math.PI) t -= 2 * Math.PI;
        if (t > bestTurn) {
          bestTurn = t;
          best = c;
        }
      }
      e = best;
      if (e === start) break;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  // Außenränder gegen den Uhrzeigersinn, Löcher im Uhrzeigersinn; ein Loch gehört zum kleinsten Rand, der es enthält
  const outers = rings.filter((r) => area(r) > 0).sort((a, b) => area(a) - area(b));
  const holes = rings.filter((r) => area(r) < 0);
  const regions = outers.map((r) => ({ ring: r, holes: [] as Poly[] }));
  for (const h of holes) {
    const host = regions.find((g) => inPolygon(g.ring, h[0][0], h[0][1]));
    host?.holes.push(h);
  }
  return regions
    .sort((a, b) => area(b.ring) - area(a.ring))
    .map((g) => ({ outline: curvesOnPaths(g.ring, sources, STEP), holes: g.holes.map((h) => curvesOnPaths(h, sources, STEP)) }));
}
