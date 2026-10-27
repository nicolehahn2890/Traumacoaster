/**
 * Umriss aus Bild (Ebenen-Probe): aus dem Alphakanal eines gemalten Teils (etwa der Körper des Parallax-Baukastens)
 * werden Umriss und Löcher als Polygone gewonnen (Marching Squares auf einem verkleinerten Raster, Segmente zu
 * geschlossenen Zügen verkettet, vereinfacht), damit ein Körper die Form seines Bildes bekommt und die Form dann im Editor
 * weiter bearbeitet werden kann. Läuft auf rohen Pixeln (Breite, Höhe, RGBA), im Browser aus einer Zeichenfläche, in
 * Skripten aus einem Bildwerkzeug; ohne DOM.
 */
import { inPolygon, polyArea, simplifyPoly, type Poly } from './path';

export interface AlphaImage {
  width: number;
  height: number;
  /** RGBA, 4 Bytes je Pixel */
  data: Uint8Array | Uint8ClampedArray;
}

export interface TracedShape {
  /** Umriss und Löcher in Pixeln des Bilds (x nach rechts, y nach unten), gegen den Uhrzeigersinn im Bildsystem */
  outline: Poly;
  holes: Poly[];
  area: number;
}

/**
 * Konturen des Alphakanals: alle Pixel mit alpha ≥ threshold sind „drin“. Das Bild wird auf höchstens `maxSize` Pixel
 * Kantenlänge verkleinert, die Konturen kommen in den Pixeln des Originals zurück. `tol` ist die Vereinfachung in
 * Originalpixeln, `minArea` lässt Krümel weg (Anteil der größten Fläche)
 */
export function traceAlpha(img: AlphaImage, opts: { threshold?: number; maxSize?: number; tol?: number; minArea?: number } = {}): TracedShape[] {
  const threshold = opts.threshold ?? 96;
  const maxSize = opts.maxSize ?? 320;
  const scale = Math.max(1, Math.max(img.width, img.height) / maxSize);
  const w = Math.max(2, Math.round(img.width / scale));
  const h = Math.max(2, Math.round(img.height / scale));
  // Raster mit Rand aus Luft, damit jede Kontur geschlossen ist
  const W = w + 2;
  const H = h + 2;
  const grid = new Uint8Array(W * H);
  for (let gy = 0; gy < h; gy++) {
    const y0 = Math.floor(gy * scale);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((gy + 1) * scale)));
    for (let gx = 0; gx < w; gx++) {
      const x0 = Math.floor(gx * scale);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((gx + 1) * scale)));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        sum += img.data[(y * img.width + x) * 4 + 3];
        n++;
      }
      grid[(gy + 1) * W + gx + 1] = sum / n >= threshold ? 1 : 0;
    }
  }
  // Marching Squares: je Zelle (Ecken oben links, oben rechts, unten rechts, unten links) Kantensegmente
  const segs = new Map<string, Array<[number, number, number, number]>>();
  const key = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const list = segs.get(key(ax, ay)) ?? [];
    list.push([ax, ay, bx, by]);
    segs.set(key(ax, ay), list);
  };
  const at = (x: number, y: number) => grid[y * W + x];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      // Kantenmitten: oben, rechts, unten, links
      const T: [number, number] = [x + 0.5, y];
      const R: [number, number] = [x + 1, y + 0.5];
      const B: [number, number] = [x + 0.5, y + 1];
      const L: [number, number] = [x, y + 0.5];
      // Segmente so gerichtet, dass das Innere links liegt (im Bildsystem mit y nach unten: im Uhrzeigersinn um das Innere)
      const pairs: Array<[[number, number], [number, number]]> = [];
      switch (code) {
        case 1: pairs.push([L, B]); break;
        case 2: pairs.push([B, R]); break;
        case 3: pairs.push([L, R]); break;
        case 4: pairs.push([R, T]); break;
        case 5: pairs.push([L, T], [R, B]); break;
        case 6: pairs.push([B, T]); break;
        case 7: pairs.push([L, T]); break;
        case 8: pairs.push([T, L]); break;
        case 9: pairs.push([T, B]); break;
        case 10: pairs.push([T, R], [B, L]); break;
        case 11: pairs.push([T, R]); break;
        case 12: pairs.push([R, L]); break;
        case 13: pairs.push([R, B]); break;
        case 14: pairs.push([B, L]); break;
      }
      for (const [a, b] of pairs) add(a[0], a[1], b[0], b[1]);
    }
  }
  // Segmente verketten
  const loops: Poly[] = [];
  const used = new Set<string>();
  for (const [k, list] of segs) {
    for (let si = 0; si < list.length; si++) {
      const id = `${k}#${si}`;
      if (used.has(id)) continue;
      used.add(id);
      let [ax, ay, bx, by] = list[si];
      const loop: Poly = [[ax, ay]];
      let guard = 0;
      while (guard++ < 1e6) {
        loop.push([bx, by]);
        const next = segs.get(key(bx, by));
        if (!next) break;
        let found = -1;
        for (let j = 0; j < next.length; j++) if (!used.has(`${key(bx, by)}#${j}`)) {
          found = j;
          break;
        }
        if (found < 0) break;
        used.add(`${key(bx, by)}#${found}`);
        [ax, ay, bx, by] = next[found];
        if (Math.abs(bx - loop[0][0]) < 1e-6 && Math.abs(by - loop[0][1]) < 1e-6) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  // zurück in Originalpixel (Rand abziehen), vereinfachen
  const tol = (opts.tol ?? 1.5) / scale;
  const polys = loops.map((l) => simplifyPoly(l.map(([x, y]) => [(x - 1) * scale, (y - 1) * scale] as [number, number]), tol * scale)).filter((p) => p.length >= 3);
  // Umrisse und Löcher: im Bildsystem (y nach unten) laufen Umrisse mit negativer Fläche (Inneres links), Löcher positiv
  const shapes: TracedShape[] = [];
  const outlines = polys.filter((p) => polyArea(p) < 0).sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
  const holes = polys.filter((p) => polyArea(p) > 0);
  const biggest = outlines.length ? Math.abs(polyArea(outlines[0])) : 0;
  const minArea = (opts.minArea ?? 0.002) * biggest;
  for (const o of outlines) {
    const area = Math.abs(polyArea(o));
    if (area < minArea) continue;
    const mine = holes.filter((hh) => Math.abs(polyArea(hh)) >= minArea && inPolygon(o, hh[0][0], hh[0][1]));
    shapes.push({ outline: o, holes: mine, area });
  }
  return shapes;
}
