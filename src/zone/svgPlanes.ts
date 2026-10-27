/**
 * SVG-Austausch der Ebenen (Zonen-Editor, Stufe 2; Plan 4.10): SVG ist Austauschformat, nie die Quelle. Export je Ebene
 * oder der ganze Stapel als Gruppen von hinten nach vorn, je Form ein Pfad mit Kurven und Grundfarbe; eine geteilte Form
 * wird eine Gruppe ihrer Flächen (Illustrator kennt keine Teilungslinien). Maßstab SVG_SCALE Pixel je Meter in
 * Ebenen-Koordinaten, y nach unten. Kennungen nur `[a-z][a-z0-9-]*` (Illustrator schreibt andere um): Ebenen `p3-name`,
 * Formen `s12`, Flächen `s12-f0`, der Rahmen `rahmen-x…-y…` trägt den Ursprung, falls Illustrator die Datenattribute
 * verliert.
 *
 * Import (Brücke aus Illustrator): Gruppen mit Ebenen-Kennung ersetzen die Formen ihrer Ebene, andere oberste Gruppen
 * werden neue Ebenen hinter dem Stapel. Eine Form, deren Geometrie und Farben unverändert zurückkommen, bleibt wie sie war
 * (mit Teilungslinien); geänderte Flächen kommen als eigene Formen. Gelesen werden Pfade (alle Befehle), Rechtecke (auch
 * abgerundet), Kreise, Ellipsen und Polygone in Gruppen mit Transformationen; Füllungen aus Attributen, Stil und Klassen;
 * Verläufe werden Vollton. Ohne DOM, damit es in Tests gleich läuft.
 */
import { faceCurves } from './faceCurves';
import { cloneNodes, DEFAULT_GAP, faceFill, groupOf, newPlane, nextNodeId, planeHidden, planePathToShape, planesOf, shapeFaces, shapeFromPlanePath, shapesOf, type ZoneNode, type ZonePlane, type ZoneShape } from './nodes';
import { flattenPath, inPolygon, polyArea, type PathPoint, type ZonePath } from './path';
import { parsePathData, parseTransform, SVG_SCALE, svgPathData } from './svg';

type Matrix = ReturnType<typeof parseTransform>;

const f = (v: number): string => {
  const s = (Math.round(v * 100) / 100).toString();
  return s === '-0' ? '0' : s;
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Name als Kennungsteil: klein, Umlaute ausgeschrieben, sonst nur Buchstaben, Ziffern und Bindestriche */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** ganze Zahl als Kennungsteil (m für minus) */
const encInt = (v: number): string => (v < 0 ? `m${-v}` : String(v));

interface Item {
  /** Kennung im SVG: Form `s12` oder Fläche `s12-f0` */
  id: string;
  fill: string;
  /** Ränder in Ebenen-Koordinaten: der erste ist der Umriss, weitere Löcher */
  rings: ZonePath[];
}

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

/** was eine Form im SVG wird: ein Pfad, oder (geteilt) je gefüllte Fläche einer; group: als Gruppe ihrer Flächen */
export function shapeItems(s: ZoneShape): { group: boolean; items: Item[] } {
  const faces = shapeFaces(s);
  if (!s.cuts?.length && faces.length === 1) {
    const fill = faceFill(s, faces[0]);
    return { group: false, items: fill === null ? [] : [{ id: s.id, fill, rings: [toPlane(s, s.path), ...(s.holes ?? []).map((h) => toPlane(s, h))] }] };
  }
  const items: Item[] = [];
  faces.forEach((face, k) => {
    const fill = faceFill(s, face);
    if (fill === null) return;
    const c = faceCurves(s, face);
    items.push({ id: `${s.id}-f${k}`, fill, rings: [toPlane(s, c.outline), ...c.holes.map((h) => toPlane(s, h))] });
  });
  return { group: true, items };
}

/**
 * Ebenen als SVG: die angegebenen (sonst alle sichtbaren), von hinten nach vorn je eine Gruppe; ausgeblendete Formen
 * fehlen. Der Rahmen umfasst alle Formen mit 2 m Rand, auf ganze Meter
 */
export function planesToSvg(nodes: readonly ZoneNode[], opts: { planes?: readonly string[]; zoneName?: string } = {}): string {
  const planes = planesOf(nodes)
    .filter((p) => (opts.planes ? opts.planes.includes(p.id) : !planeHidden(nodes, p)))
    .reverse();
  const groups = planes.map((plane) => ({
    plane,
    shapes: shapesOf(nodes, plane.id)
      .filter((s) => !s.hidden)
      .map((s) => ({ shape: s, ...shapeItems(s) }))
      .filter((x) => x.items.length),
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of groups)
    for (const s of g.shapes)
      for (const it of s.items)
        for (const [x, y] of flattenPath(it.rings[0], 0.5)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 100;
    minY = 0;
    maxY = 50;
  }
  minX = Math.floor(minX) - 2;
  minY = Math.floor(minY) - 2;
  maxX = Math.ceil(maxX) + 2;
  maxY = Math.ceil(maxY) + 2;
  const S = SVG_SCALE;
  const toSvg = (x: number, y: number): [number, number] => [(x - minX) * S, (maxY - y) * S];
  const W = f((maxX - minX) * S);
  const H = f((maxY - minY) * S);
  const zone = opts.zoneName ?? '';
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-zone="${esc(zone)}" data-scale="${S}" data-min-x="${minX}" data-max-y="${maxY}">`);
  lines.push(`  <!-- Trauma Coaster, Zone ${esc(zone)}: je Ebene eine Gruppe, von hinten nach vorn; 1 m = ${S} px; Ursprung x ${minX} m, oben y ${maxY} m. Kennungen (p…, s…, rahmen-…) behalten, dann ordnet der Editor beim Laden alles wieder zu. Zurück mit Exportieren als › SVG. -->`);
  lines.push(`  <rect id="rahmen-x${encInt(minX)}-y${encInt(maxY)}" x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#c8c8c8" stroke-width="1"/>`);
  const d = (rings: ZonePath[]) => rings.map((r) => svgPathData(r, toSvg)).join(' ');
  // Ebenen einer Ebenen-Gruppe stehen in einer Gruppe (in Illustrator ein Ordner mit den Ebenen darin)
  let open: string | null = null;
  for (const g of groups) {
    const grp = groupOf(nodes, g.plane) ?? null;
    if (open && open !== grp?.id) {
      lines.push('  </g>');
      open = null;
    }
    if (grp && open !== grp.id) {
      const gname = slug(grp.name);
      lines.push(`  <g id="${grp.id}${gname ? `-${gname}` : ''}" data-name="${esc(grp.name)}">`);
      open = grp.id;
    }
    const pad = open ? '  ' : '';
    const name = slug(g.plane.name);
    lines.push(`${pad}  <g id="${g.plane.id}${name ? `-${name}` : ''}" data-name="${esc(g.plane.name)}" data-z="${f(g.plane.z)}">`);
    for (const s of g.shapes) {
      if (!s.group) {
        const it = s.items[0];
        lines.push(`${pad}    <path id="${it.id}" d="${d(it.rings)}" fill="${esc(it.fill)}" fill-rule="evenodd"/>`);
        continue;
      }
      lines.push(`${pad}    <g id="${s.shape.id}">`);
      for (const it of s.items) lines.push(`${pad}      <path id="${it.id}" d="${d(it.rings)}" fill="${esc(it.fill)}" fill-rule="evenodd"/>`);
      lines.push(`${pad}    </g>`);
    }
    lines.push(`${pad}  </g>`);
  }
  if (open) lines.push('  </g>');
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ Lesen

interface RawGroup {
  id: string | null;
  name: string | null;
}

interface RawShape {
  id: string | null;
  name: string | null;
  /** umschließende Gruppen, die äußerste zuerst */
  groups: RawGroup[];
  /** Teilpfade in SVG-Pixeln (transformiert) */
  subs: ZonePath[];
  fill: string;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
};

/** Farbe als #rrggbb; null für none oder Unlesbares */
export function parseColor(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`;
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return `#${m[1]}`;
  m = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/.exec(s);
  if (m) {
    const c = [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(x.endsWith('%') ? (parseFloat(x) * 255) / 100 : parseFloat(x)))));
    return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

/** Deklarationen eines style-Attributs oder einer CSS-Regel */
function decls(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

const SKIP = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'marker', 'foreignobject', 'metadata', 'title', 'desc', 'style', 'script']);
const GROUPS = new Set(['g', 'svg', 'switch', 'a']);
const K = 0.5523;

function apply(m: Matrix, p: PathPoint): PathPoint {
  const tx = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const [x, y] = tx(p.x, p.y);
  const o: PathPoint = { x, y };
  if (p.inX || p.inY) {
    const [ix, iy] = tx(p.x + (p.inX ?? 0), p.y + (p.inY ?? 0));
    o.inX = ix - x;
    o.inY = iy - y;
  }
  if (p.outX || p.outY) {
    const [ox, oy] = tx(p.x + (p.outX ?? 0), p.y + (p.outY ?? 0));
    o.outX = ox - x;
    o.outY = oy - y;
  }
  return o;
}

const mul = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

interface Walked {
  shapes: RawShape[];
  frame: { minX: number; maxY: number; x: number; y: number } | null;
  root: Record<string, string>;
  pgf: boolean;
  gradients: number;
  skipped: number;
}

function walk(text: string): Walked {
  const svg = text.replace(/<!--[\s\S]*?-->/g, '');
  // Klassen aus <style> (Illustrator: .st0{fill:#3D5A63;})
  const classes = new Map<string, Record<string, string>>();
  for (const st of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = st[1].replace(/<!\[CDATA\[|\]\]>/g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const d = decls(rule[2]);
      for (const sel of rule[1].split(',')) {
        const m = /^\s*\.([\w-]+)\s*$/.exec(sel);
        if (m) classes.set(m[1], { ...(classes.get(m[1]) ?? {}), ...d });
      }
    }
  }
  // Verläufe: erste Stopp-Farbe als Vollton
  const gradients = new Map<string, string>();
  for (const g of svg.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(g[2])?.[1];
    const stops = [...g[3].matchAll(/<stop\b([^>]*)>/gi)].map((s) => {
      const a = s[1];
      return parseColor(/stop-color\s*[:=]\s*["']?([^"';\s]+)/i.exec(a)?.[1]);
    });
    const c = stops.find((x) => x);
    if (id && c) gradients.set(id, c);
  }
  const out: Walked = { shapes: [], frame: null, root: {}, pgf: /<i:pgf\b|i:pgfRef/.test(svg), gradients: 0, skipped: 0 };
  type Frame = { m: Matrix; fill: string | null; hidden: boolean; group: RawGroup | null; tag: string };
  const stack: Frame[] = [{ m: [1, 0, 0, 1, 0, 0], fill: '#000000', hidden: false, group: null, tag: '' }];
  const tagRe = /<\s*(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  let first = true;
  while ((m = tagRe.exec(svg))) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClose = m[4] === '/';
    if (closing) {
      if (GROUPS.has(name) && stack.length > 1 && stack[stack.length - 1].tag === name) stack.pop();
      continue;
    }
    if (SKIP.has(name) || name.endsWith(':pgf')) {
      if (!selfClose) {
        const end = new RegExp(`<\\s*/\\s*${name.replace(/[.:]/g, '\\$&')}\\s*>`, 'ig');
        end.lastIndex = tagRe.lastIndex;
        if (end.exec(svg)) tagRe.lastIndex = end.lastIndex;
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = (a[3] ?? a[4] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (name === 'svg' && first) out.root = attrs;
    first = false;
    const top = stack[stack.length - 1];
    const style = decls(attrs.style ?? '');
    const cls = (attrs.class ?? '').split(/\s+/).filter(Boolean).reduce<Record<string, string>>((acc, c) => ({ ...acc, ...(classes.get(c) ?? {}) }), {});
    // Vorrang: style-Attribut, Klassen, Attribut, geerbt
    const fillRaw = style.fill ?? cls.fill ?? attrs.fill;
    let fill = top.fill;
    if (fillRaw !== undefined) {
      const url = /url\(\s*#([^)\s]+)\s*\)/.exec(fillRaw);
      if (url) {
        fill = gradients.get(url[1]) ?? '#808080';
        out.gradients++;
      } else fill = parseColor(fillRaw);
    }
    const hidden = top.hidden || (style.display ?? cls.display ?? attrs.display) === 'none' || (style.visibility ?? attrs.visibility) === 'hidden';
    const mat = mul(top.m, parseTransform(attrs.transform));
    if (GROUPS.has(name)) {
      if (!selfClose) stack.push({ m: name === 'svg' ? top.m : mat, fill, hidden, group: name === 'g' || name === 'a' ? { id: attrs.id ?? null, name: attrs['data-name'] ?? null } : null, tag: name });
      continue;
    }
    const num = (k: string, d = 0): number => {
      const v = parseFloat(attrs[k] ?? '');
      return Number.isFinite(v) ? v : d;
    };
    let subs: ZonePath[] = [];
    if (name === 'path') subs = parsePathData(attrs.d ?? '');
    else if (name === 'polygon' || name === 'polyline') {
      const pts = (attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      const p: ZonePath = [];
      for (let k = 0; k + 1 < pts.length; k += 2) p.push({ x: pts[k], y: pts[k + 1] });
      subs = [p];
    } else if (name === 'rect') {
      const x = num('x');
      const y = num('y');
      const w = num('width');
      const h = num('height');
      const frame = /^rahmen-x(m?)(\d+)-y(m?)(\d+)/.exec(attrs.id ?? '');
      if (frame) {
        const [fx, fy] = [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]];
        out.frame = { minX: (frame[1] ? -1 : 1) * Number(frame[2]), maxY: (frame[3] ? -1 : 1) * Number(frame[4]), x: fx, y: fy };
        continue;
      }
      let rx = Math.min(w / 2, num('rx', num('ry')));
      let ry = Math.min(h / 2, num('ry', num('rx')));
      if (rx <= 0 || ry <= 0) rx = ry = 0;
      subs = [
        rx
          ? [
              { x: x + rx, y, inX: -K * rx, inY: 0 },
              { x: x + w - rx, y, outX: K * rx, outY: 0 },
              { x: x + w, y: y + ry, inX: 0, inY: -K * ry },
              { x: x + w, y: y + h - ry, outX: 0, outY: K * ry },
              { x: x + w - rx, y: y + h, inX: K * rx, inY: 0 },
              { x: x + rx, y: y + h, outX: -K * rx, outY: 0 },
              { x, y: y + h - ry, inX: 0, inY: K * ry },
              { x, y: y + ry, outX: 0, outY: -K * ry },
            ]
          : [
              { x, y },
              { x: x + w, y },
              { x: x + w, y: y + h },
              { x, y: y + h },
            ],
      ];
    } else if (name === 'ellipse' || name === 'circle') {
      const cx = num('cx');
      const cy = num('cy');
      const rx = name === 'circle' ? num('r') : num('rx');
      const ry = name === 'circle' ? num('r') : num('ry');
      subs = [
        [
          { x: cx + rx, y: cy, inX: 0, inY: -K * ry, outX: 0, outY: K * ry },
          { x: cx, y: cy + ry, inX: K * rx, inY: 0, outX: -K * rx, outY: 0 },
          { x: cx - rx, y: cy, inX: 0, inY: K * ry, outX: 0, outY: -K * ry },
          { x: cx, y: cy - ry, inX: -K * rx, inY: 0, outX: K * rx, outY: 0 },
        ],
      ];
    } else if (name === 'line') {
      out.skipped++;
      continue;
    } else continue;
    if (hidden) continue;
    if (!fill) {
      out.skipped++;
      continue;
    }
    const groups = stack.map((s) => s.group).filter((g): g is RawGroup => !!g);
    const ok = subs.map((s) => s.map((p) => apply(mat, p))).filter((s) => s.length >= 3);
    if (ok.length) out.shapes.push({ id: attrs.id ?? null, name: attrs['data-name'] ?? null, groups, subs: ok, fill });
  }
  return out;
}

/** Teilpfade zu Umrissen mit Löchern: der größte ist ein Umriss, was in ihm liegt, sein Loch; weitere werden eigene */
function outlines(subs: ZonePath[]): Array<{ outline: ZonePath; holes: ZonePath[] }> {
  const polys = subs.map((s) => flattenPath(s, 0.2));
  const order = subs.map((_, k) => k).sort((a, b) => Math.abs(polyArea(polys[b])) - Math.abs(polyArea(polys[a])));
  const used = new Set<number>();
  const out: Array<{ outline: ZonePath; holes: ZonePath[] }> = [];
  for (const k of order) {
    if (used.has(k)) continue;
    used.add(k);
    const holes: ZonePath[] = [];
    for (const j of order) {
      if (used.has(j)) continue;
      const [px, py] = polys[j][0];
      if (inPolygon(polys[k], px, py)) {
        holes.push(subs[j]);
        used.add(j);
      }
    }
    out.push({ outline: subs[k], holes });
  }
  return out;
}

/** gleiche Geometrie (Ränder in Ebenen-Koordinaten, bis 2 cm und 1 % Fläche)? */
function sameRings(a: ZonePath[], b: ZonePath[]): boolean {
  if (a.length !== b.length) return false;
  const sig = (r: ZonePath) => {
    const p = flattenPath(r, 0.2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of p) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY, area: Math.abs(polyArea(p)) };
  };
  const sa = a.map(sig).sort((x, y) => x.minX - y.minX || x.minY - y.minY);
  const sb = b.map(sig).sort((x, y) => x.minX - y.minX || x.minY - y.minY);
  return sa.every((x, i) => {
    const y = sb[i];
    return Math.abs(x.minX - y.minX) < 0.02 && Math.abs(x.minY - y.minY) < 0.02 && Math.abs(x.maxX - y.maxX) < 0.02 && Math.abs(x.maxY - y.maxY) < 0.02 && Math.abs(x.area - y.area) <= 0.01 * Math.max(x.area, y.area) + 0.01;
  });
}

export interface SvgImport {
  nodes: ZoneNode[];
  /** Ebenen, deren Formen ersetzt wurden, und neue Ebenen */
  replaced: number;
  added: number;
  /** Formen danach in den betroffenen Ebenen, davon unverändert übernommen */
  shapes: number;
  kept: number;
  warnings: string[];
}

/** SVG laden: neue Knotenliste (die alte bleibt unberührt) und was geschah */
export function svgToPlanes(svg: string, nodes: readonly ZoneNode[]): SvgImport {
  const w = walk(svg);
  const out = cloneNodes(nodes);
  const warnings: string[] = [];
  if (w.pgf) warnings.push('Die Datei enthält Illustrator-Bearbeitungsdaten; sie wurden übergangen (besser Exportieren als › SVG)');
  if (w.gradients) warnings.push(`${w.gradients} Verläufe als Vollton übernommen`);
  if (w.skipped) warnings.push(`${w.skipped} Linien ohne Füllung übergangen`);
  // Maßstab und Ursprung: Datenattribute des eigenen Exports, sonst der Rahmen, sonst unten links auf der Zeichenfläche
  const scale = Number(w.root['data-scale']) || SVG_SCALE;
  const vb = (w.root.viewbox ?? '').split(/[\s,]+/).map(Number);
  const vb0 = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, Number(w.root.width) || 0, Number(w.root.height) || 0];
  let minX: number;
  let maxY: number;
  let ox: number;
  let oy: number;
  if (w.root['data-min-x'] !== undefined && w.root['data-max-y'] !== undefined) {
    minX = Number(w.root['data-min-x']);
    maxY = Number(w.root['data-max-y']);
    ox = vb0[0];
    oy = vb0[1];
  } else if (w.frame) {
    ({ minX, maxY } = w.frame);
    ox = w.frame.x;
    oy = w.frame.y;
  } else {
    minX = 0;
    maxY = vb0[3] / scale;
    ox = vb0[0];
    oy = vb0[1];
  }
  const toPlanePt = (p: PathPoint): PathPoint => {
    const o: PathPoint = { x: minX + (p.x - ox) / scale, y: maxY - (p.y - oy) / scale };
    if (p.inX || p.inY) {
      o.inX = (p.inX ?? 0) / scale;
      o.inY = -(p.inY ?? 0) / scale;
    }
    if (p.outX || p.outY) {
      o.outX = (p.outX ?? 0) / scale;
      o.outY = -(p.outY ?? 0) / scale;
    }
    return o;
  };
  // Formen nach Ebene: die äußerste Gruppe mit Ebenen-Kennung, sonst die oberste benannte Gruppe (Illustrator legt
  // namenlose Hüllen um alles), sonst ohne Gruppe
  const byPlane = new Map<string, { group: RawGroup | null; pid: string | null; shapes: RawShape[] }>();
  for (const s of w.shapes) {
    const pg = s.groups.find((g) => g.id && /^p\d+(?:[-_]|$)/.test(g.id));
    const top = s.groups.find((g) => g.id || g.name);
    const key = pg ? /^(p\d+)/.exec(pg.id!)![1] : top ? `g:${top.id ?? top.name}` : 'root';
    const entry = byPlane.get(key) ?? { group: pg ?? top ?? null, pid: pg ? key : null, shapes: [] };
    entry.shapes.push(s);
    byPlane.set(key, entry);
  }
  let replaced = 0;
  let added = 0;
  let shapesTotal = 0;
  let kept = 0;
  const newPlanes: ZonePlane[] = [];
  for (const entry of byPlane.values()) {
    let plane = entry.pid ? out.find((n): n is ZonePlane => n.kind === 'plane' && n.id === entry.pid) : undefined;
    if (!plane) {
      const name = entry.group?.name ?? entry.group?.id?.replace(/_x20_/g, ' ').replace(/_/g, ' ').replace(/^p\d+-/, '') ?? 'SVG';
      plane = newPlane(out, 0, name);
      out.push(plane);
      newPlanes.push(plane);
      added++;
    } else replaced++;
    const target = plane;
    const before = shapesOf(out, target.id).filter((s) => !s.hidden);
    const keepIds = new Set<string>();
    const fresh: ZoneShape[] = [];
    // nach Form gruppieren: Gruppe s12 oder Kennung s12 / s12-f3
    const keyOf = (s: RawShape): string | null => {
      const g = [...s.groups].reverse().find((x) => x.id && /^s\d+$/.test(x.id));
      if (g) return g.id;
      return /^(s\d+)(?:-f\d+)?$/.exec(s.id ?? '')?.[1] ?? null;
    };
    const seen = new Set<string>();
    for (const raw of entry.shapes) {
      const key = keyOf(raw);
      if (key && seen.has(key)) continue;
      const parts = key ? entry.shapes.filter((x) => keyOf(x) === key) : [raw];
      if (key) seen.add(key);
      const old = key ? before.find((s) => s.id === key) : undefined;
      const imported = parts.map((p) => ({ id: p.id, fill: p.fill, rings: p.subs.map((sub) => sub.map(toPlanePt)) }));
      if (old) {
        // unverändert zurück: die Form bleibt, wie sie war (mit Teilungslinien und Füllpunkten)
        const exp = shapeItems(old).items;
        const same = exp.length === imported.length && exp.every((e) => {
          const im = imported.find((i) => i.id === e.id);
          return !!im && parseColor(im.fill) === parseColor(e.fill) && sameRings(e.rings, im.rings);
        });
        if (same) {
          keepIds.add(old.id);
          fresh.push(old);
          kept++;
          continue;
        }
      }
      for (const im of imported) {
        outlines(im.rings).forEach(({ outline, holes }, k) => {
          const s = shapeFromPlanePath(out, target.id, outline, im.fill);
          if (holes.length) s.holes = holes.map((h) => planePathToShape(s, h));
          // die erste Form übernimmt Kennung und Namen der alten, wenn es eine einzelne war
          if (old && k === 0 && imported.length === 1 && !keepIds.has(old.id)) {
            s.id = old.id;
            s.name = old.name;
            keepIds.add(old.id);
          } else {
            const nm = im.id && !/^s\d+(?:-f\d+)?$/.test(im.id) ? (raw.name ?? im.id.replace(/_x20_/g, ' ').replace(/_/g, ' ')) : null;
            if (nm) s.name = nm;
          }
          out.push(s);
          fresh.push(s);
        });
      }
    }
    // ersetzte Ebene: die alten sichtbaren Formen, die nicht zurückkamen, fallen weg; ausgeblendete bleiben
    const drop = new Set(before.filter((s) => !fresh.includes(s)).map((s) => s.id));
    const keptOut = out.filter((n) => !(n.kind === 'shape' && drop.has(n.id) && !fresh.some((x) => x === n)));
    out.length = 0;
    out.push(...keptOut);
    // Reihenfolge wie im SVG (hinten zuerst); stimmt sie schon, bleiben die Zahlen (unverändert heißt unverändert)
    const inOrder = fresh.every((s, i) => i === 0 || s.order > fresh[i - 1].order);
    if (!inOrder || fresh.some((s) => !before.includes(s))) fresh.forEach((s, i) => (s.order = i + 1));
    shapesTotal += fresh.length;
  }
  // neue Ebenen hinter den Stapel, in der Reihenfolge des SVG (die erste Gruppe ist die hinterste)
  const old = planesOf(out).filter((p) => !newPlanes.includes(p));
  const base = old.length ? Math.max(...old.map((p) => p.z)) + DEFAULT_GAP : 0;
  newPlanes.forEach((p, i) => (p.z = base + (newPlanes.length - 1 - i) * DEFAULT_GAP));
  // eindeutige Kennungen (eine übernommene Kennung kann mit einer neuen zusammenfallen)
  const ids = new Set<string>();
  for (const n of out) {
    if (n.kind !== 'shape') continue;
    if (ids.has(n.id)) n.id = nextNodeId(out, 's');
    ids.add(n.id);
  }
  return { nodes: out, replaced, added, shapes: shapesTotal, kept, warnings };
}
