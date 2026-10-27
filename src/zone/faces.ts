/**
 * Flächen einer Form als Vektornetz (Zonen-Editor, Stufe 2; Plan 4.5, Befund 2, Florians Bild 2): Umriss, Löcher und
 * Teilungslinien werden geglättet, an allen Kreuzungen geteilt und zu einem ebenen Graphen verbunden; seine
 * beschränkten Flächen innerhalb des Umrisses und außerhalb der Löcher sind die Flächen der Form. Eine Linie von Kante zu
 * Kante teilt eine Fläche, ein geschlossener Ring in einer Fläche macht eine Innenfläche (die zum Loch werden kann),
 * Linien, die nichts umschließen, ändern nichts. Enden offener Linien, die knapp vor einer Kante aufhören, rasten auf ihr
 * ein.
 *
 * Gerechnet wird auf einem Millimeter-Raster in ganzen Zahlen, damit Kreuzungen und Berührungen eindeutig sind. Ohne
 * Renderer und DOM.
 */
import { insideWithHoles, type Poly } from './path';

/** Raster: Einheiten je Meter (1 mm) */
const GRID = 1000;
/** offene Linien rasten so nah an einer Kante ein (Raster-Einheiten, 3 cm) */
const SNAP = 30;

export interface Face {
  /** Umriss gegen den Uhrzeigersinn (Meter) */
  outline: Poly;
  holes: Poly[];
  /** Fläche in Quadratmetern */
  area: number;
  /** ein Punkt sicher im Innern (für Füllungen und Treffer) */
  inner: [number, number];
}

export interface Line {
  poly: Poly;
  closed: boolean;
}

type Seg = [number, number, number, number];

const signedArea = (pts: Array<[number, number]>): number => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
};

function inRing(ring: Array<[number, number]>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt (px, py) auf der Strecke s? (Raster, kollinear vorausgesetzt) */
const onSeg = (px: number, py: number, s: Seg): boolean => px >= Math.min(s[0], s[2]) && px <= Math.max(s[0], s[2]) && py >= Math.min(s[1], s[3]) && py <= Math.max(s[1], s[3]);

/** nächster Punkt auf der Strecke s zu (px, py) */
function closestOnSeg(px: number, py: number, s: Seg): [number, number, number] {
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / L)) : 0;
  const x = Math.round(s[0] + t * dx);
  const y = Math.round(s[1] + t * dy);
  return [x, y, Math.hypot(px - x, py - y)];
}

/**
 * ein Punkt sicher im Innern eines Polygons mit Löchern: auf der waagrechten Linie durch mehrere Höhen das breiteste
 * Stück im Innern, dessen Mitte (robust auch für schmale, gebogene Bänder)
 */
export function innerPoint(outline: Poly, holes: readonly Poly[]): [number, number] {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of outline) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let best: [number, number] = outline[0] ? [outline[0][0], outline[0][1]] : [0, 0];
  let bestW = -1;
  const rings = [outline, ...holes];
  for (let k = 1; k <= 9; k++) {
    const y = minY + ((maxY - minY) * k) / 10 + (maxY - minY) * 1e-7;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > bestW) {
        bestW = w;
        best = [(xs[i] + xs[i + 1]) / 2, y];
      }
    }
  }
  return best;
}

/**
 * Flächen aus Umriss, Löchern und Linien (alles in Metern, Umriss und Löcher geschlossen). Ohne Linien ist es eine
 * Fläche: der Umriss mit seinen Löchern.
 */
export function computeFaces(outline: Poly, holes: readonly Poly[], lines: readonly Line[]): Face[] {
  if (outline.length < 3) return [];
  if (!lines.length) {
    const a = Math.abs(signedArea(outline));
    return [{ outline: signedArea(outline) >= 0 ? outline : [...outline].reverse(), holes: [...holes], area: a - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0), inner: innerPoint(outline, holes) }];
  }
  // 1. Strecken im Raster; offene Linien merken ihre Endstücke zum Einrasten
  const segs: Seg[] = [];
  const ends: Array<{ seg: number; at: 0 | 1 }> = [];
  const add = (poly: Poly, closed: boolean): void => {
    const pts = poly.map(([x, y]) => [Math.round(x * GRID), Math.round(y * GRID)] as [number, number]);
    const m = closed ? pts.length : pts.length - 1;
    let first = -1;
    let last = -1;
    for (let i = 0; i < m; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      segs.push([a[0], a[1], b[0], b[1]]);
      if (first < 0) first = segs.length - 1;
      last = segs.length - 1;
    }
    if (!closed && first >= 0) ends.push({ seg: first, at: 0 }, { seg: last, at: 1 });
  };
  add(outline, true);
  for (const h of holes) add(h, true);
  for (const l of lines) if (l.poly.length >= 2) add(l.poly, l.closed);

  // 2. Enden offener Linien, die knapp vor einer anderen Strecke enden, auf diese ziehen
  const extra = new Map<number, Array<[number, number]>>();
  const push = (i: number, p: [number, number]) => {
    const list = extra.get(i);
    if (list) list.push(p);
    else extra.set(i, [p]);
  };
  for (const e of ends) {
    const s = segs[e.seg];
    const px = e.at === 0 ? s[0] : s[2];
    const py = e.at === 0 ? s[1] : s[3];
    let best = -1;
    let bestP: [number, number] = [px, py];
    let bestD = SNAP;
    segs.forEach((t, i) => {
      if (i === e.seg) return;
      // die Nachbarstrecke derselben Linie zählt nicht (sie beginnt im selben Punkt)
      if ((t[0] === px && t[1] === py) || (t[2] === px && t[3] === py)) return;
      // auch d = 0: ein Ende genau auf der Kante (der Zeichenstift rastet so ein) muss die Kante dort teilen
      const [x, y, d] = closestOnSeg(px, py, t);
      if (d < bestD) {
        bestD = d;
        best = i;
        bestP = [x, y];
      }
    });
    if (best >= 0) {
      if (e.at === 0) {
        s[0] = bestP[0];
        s[1] = bestP[1];
      } else {
        s[2] = bestP[0];
        s[3] = bestP[1];
      }
      push(best, bestP);
    }
  }

  // 3. alle Kreuzungen (Sortieren nach x, dann nur überlappende Nachbarn prüfen)
  const order = segs.map((_, i) => i).sort((a, b) => Math.min(segs[a][0], segs[a][2]) - Math.min(segs[b][0], segs[b][2]));
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const s = segs[i];
    const sMaxX = Math.max(s[0], s[2]);
    const sMinY = Math.min(s[1], s[3]);
    const sMaxY = Math.max(s[1], s[3]);
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      const t = segs[j];
      if (Math.min(t[0], t[2]) > sMaxX) break;
      if (Math.max(t[1], t[3]) < sMinY || Math.min(t[1], t[3]) > sMaxY) continue;
      const rx = s[2] - s[0];
      const ry = s[3] - s[1];
      const qx = t[2] - t[0];
      const qy = t[3] - t[1];
      const den = rx * qy - ry * qx;
      const px = t[0] - s[0];
      const py = t[1] - s[1];
      if (den === 0) {
        if (px * ry - py * rx !== 0) continue;
        // kollinear: Endpunkte, die auf der anderen Strecke liegen, teilen sie
        for (const p of [[t[0], t[1]], [t[2], t[3]]] as Array<[number, number]>) if (onSeg(p[0], p[1], s)) push(i, p);
        for (const p of [[s[0], s[1]], [s[2], s[3]]] as Array<[number, number]>) if (onSeg(p[0], p[1], t)) push(j, p);
        continue;
      }
      const u = (px * qy - py * qx) / den;
      const v = (px * ry - py * rx) / den;
      if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue;
      const p: [number, number] = [Math.round(s[0] + u * rx), Math.round(s[1] + u * ry)];
      push(i, p);
      push(j, p);
    }
  }

  // 4. Strecken an ihren Punkten teilen, Kanten ohne Doppel
  const vid = new Map<string, number>();
  const verts: Array<[number, number]> = [];
  const vertex = (x: number, y: number): number => {
    const k = `${x},${y}`;
    let id = vid.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push([x, y]);
      vid.set(k, id);
    }
    return id;
  };
  const adj: Array<Set<number>> = [];
  const link = (a: number, b: number): void => {
    if (a === b) return;
    (adj[a] ??= new Set()).add(b);
    (adj[b] ??= new Set()).add(a);
  };
  segs.forEach((s, i) => {
    const pts: Array<[number, number]> = [[s[0], s[1]], [s[2], s[3]], ...(extra.get(i) ?? [])];
    const dx = s[2] - s[0];
    const dy = s[3] - s[1];
    pts.sort((a, b) => (a[0] - s[0]) * dx + (a[1] - s[1]) * dy - ((b[0] - s[0]) * dx + (b[1] - s[1]) * dy));
    let prev = vertex(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) {
      const cur = vertex(pts[k][0], pts[k][1]);
      link(prev, cur);
      prev = cur;
    }
  });

  // 5. lose Enden abschneiden (sie umschließen nichts)
  const deg = verts.map((_, i) => adj[i]?.size ?? 0);
  const queue = deg.map((d, i) => (d <= 1 ? i : -1)).filter((i) => i >= 0);
  while (queue.length) {
    const v = queue.pop()!;
    for (const w of adj[v] ?? []) {
      adj[w].delete(v);
      if (--deg[w] === 1) queue.push(w);
    }
    adj[v]?.clear();
    deg[v] = 0;
  }

  // 6. Flächen ablaufen: an jedem Punkt die Nachbarn nach Winkel, weiter mit dem nächsten im Uhrzeigersinn
  const sorted: number[][] = verts.map((p, i) => [...(adj[i] ?? [])].sort((a, b) => Math.atan2(verts[a][1] - p[1], verts[a][0] - p[0]) - Math.atan2(verts[b][1] - p[1], verts[b][0] - p[0])));
  const seen = new Set<string>();
  const rings: Array<{ pts: Array<[number, number]>; area: number }> = [];
  for (let u = 0; u < verts.length; u++) {
    for (const v0 of sorted[u]) {
      if (seen.has(`${u}>${v0}`)) continue;
      const ring: Array<[number, number]> = [];
      let a = u;
      let b = v0;
      let guard = 0;
      while (!seen.has(`${a}>${b}`) && guard++ < 1e6) {
        seen.add(`${a}>${b}`);
        ring.push(verts[a]);
        const nb = sorted[b];
        const k = nb.indexOf(a);
        const c = nb[(k - 1 + nb.length) % nb.length];
        a = b;
        b = c;
      }
      if (ring.length >= 3) rings.push({ pts: ring, area: signedArea(ring) });
    }
  }

  // 7. Außenränder der Teile (negative Flächen) werden Löcher der kleinsten Fläche eines anderen Teils, die sie enthält
  const bounded = rings.filter((r) => r.area > 1);
  const outer = rings.filter((r) => r.area < -1);
  const holesOf = new Map<number, Array<Array<[number, number]>>>();
  for (const o of outer) {
    const probe = o.pts[0];
    let host = -1;
    let hostArea = Infinity;
    bounded.forEach((f, i) => {
      // Flächen desselben Teils teilen Punkte mit seinem Außenrand und enthalten ihn nie
      if (f.area >= hostArea || f.pts.includes(probe)) return;
      if (inRing(f.pts, probe[0], probe[1])) {
        host = i;
        hostArea = f.area;
      }
    });
    if (host >= 0) {
      const list = holesOf.get(host);
      const hole = [...o.pts].reverse();
      if (list) list.push(hole);
      else holesOf.set(host, [hole]);
    }
  }

  // 8. nur Flächen innerhalb des Umrisses und außerhalb der Löcher, zurück in Meter
  const toM = (pts: Array<[number, number]>): Poly => pts.map(([x, y]) => [x / GRID, y / GRID]);
  const faces: Face[] = [];
  bounded.forEach((f, i) => {
    const out = toM(f.pts);
    const hs = (holesOf.get(i) ?? []).map(toM);
    const inner = innerPoint(out, hs);
    if (!insideWithHoles(outline, holes, inner[0], inner[1])) return;
    const area = (f.area - (holesOf.get(i) ?? []).reduce((s, h) => s + Math.abs(signedArea(h)), 0)) / (GRID * GRID);
    faces.push({ outline: out, holes: hs, area, inner });
  });
  return faces;
}

/** Fläche, die den Punkt (x, y) enthält (Index), oder −1 */
export function faceAt(faces: readonly Face[], x: number, y: number): number {
  for (let i = 0; i < faces.length; i++) if (insideWithHoles(faces[i].outline, faces[i].holes, x, y)) return i;
  return -1;
}
