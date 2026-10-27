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
 * abgerundet), Kreise, Ellipsen und Polygone in Gruppen mit Transformationen; Füllungen aus Attributen, Stil und Klassen.
 * Ohne DOM, damit es in Tests gleich läuft.
 *
 * Füllstapel (Stufe 3): Ein Verlauf geht als SVG-Verlauf hinaus (`<defs>`, in Bildpunkten); weitere Füllungen werden
 * eigene Pfade derselben Form (`s12-L1`) mit Deckkraft und `mix-blend-mode`. Steht über der Grundfarbe nur ein deckender
 * Verlauf, trägt der Pfad ihn selbst (wie in Illustrator). Herein kommen SVG-Verläufe (linear und radial, in Bildpunkten
 * oder am Rahmen, mit gradientTransform und Stopps über xlink:href) als Verlaufsfüllung, `-L`-Pfade als Füllungen ihrer
 * Form. Nicht im SVG: Deckkraftverläufe, Verlaufsmitten, Ebenenstapel und Luftperspektive.
 */
import { faceCurves } from './faceCurves';
import { cloneNodes, DEFAULT_GAP, facePaint, groupOf, newPlane, nextNodeId, planeHidden, planePathToShape, planesOf, shapeFaces, shapeFromPlanePath, shapesOf, styleMap, swatchMap, type ZoneNode, type ZonePlane, type ZoneShape } from './nodes';
import { faceBox } from './faces';
import { paintLayers, resolveColor, type BlendMode, type GradientStop, type SwatchMap, type ZoneFill, type ZoneStyle } from './paint';
import { flattenPath, inPolygon, polyArea, type PathPoint, type ZonePath } from './path';
import { GROUP_ID, nextGroupId } from './shapeGroups';
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

/** Füllung über der Grundfarbe im SVG: Farbe oder Verlauf (Griffe in Ebenen-Koordinaten), Farben als Wert */
type ExportLayer =
  | { kind: 'color'; color: string; blend: BlendMode; opacity: number }
  | { kind: 'gradient'; radial: boolean; stops: Array<{ t: number; color: string; a: number }>; x0: number; y0: number; x1: number; y1: number; blend: BlendMode; opacity: number };

interface Item {
  /** Kennung im SVG: Form `s12` oder Fläche `s12-f0` */
  id: string;
  fill: string;
  /** Ränder in Ebenen-Koordinaten: der erste ist der Umriss, weitere Löcher */
  rings: ZonePath[];
  /** Füllungen über der Grundfarbe (ohne Deckkraftverläufe) */
  layers: ExportLayer[];
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
/** Vergleichsschlüssel der Füllungen (Rundlauf: kommt dasselbe zurück, bleibt die Form) */
const layersKey = (layers: readonly ExportLayer[]): string =>
  JSON.stringify(
    layers.map((l) =>
      l.kind === 'color'
        ? ['c', l.color, l.blend, r2(l.opacity)]
        : ['g', l.radial, l.blend, r2(l.opacity), ...[l.x0, l.y0, l.x1, l.y1].map((v) => Math.round(v * 20) / 20), ...l.stops.map((st) => [Math.round(st.t * 1000) / 1000, st.color, r2(st.a)])],
    ),
  );

/** ein deckender Verlauf ohne Mischmodus allein über der Grundfarbe: der Pfad trägt ihn selbst */
const ownGradient = (it: Item): Extract<ExportLayer, { kind: 'gradient' }> | null => {
  const l = it.layers.length === 1 ? it.layers[0] : null;
  return l && l.kind === 'gradient' && l.blend === 'normal' && l.opacity >= 1 && l.stops.every((st) => st.a >= 1) ? l : null;
};

/** Füllungen einer Fläche für das SVG (Griffe von Pfad- in Ebenen-Koordinaten) */
function exportLayers(s: ZoneShape, face: ReturnType<typeof shapeFaces>[number], sw: SwatchMap, styles: ReadonlyMap<string, ZoneStyle>): { fill: string | null; layers: ExportLayer[] } {
  const pl = paintLayers(facePaint(s, face), styles, faceBox(face));
  if (!pl) return { fill: null, layers: [] };
  const base = pl.layers[0];
  const out: ExportLayer[] = [];
  for (const f of pl.layers.slice(1) as ZoneFill[]) {
    if (f.type === 'color') out.push({ kind: 'color', color: resolveColor(f.color, sw), blend: f.blend, opacity: f.opacity });
    else if (f.type === 'gradient')
      out.push({
        kind: 'gradient',
        radial: !!f.radial,
        stops: f.stops.map((st) => ({ t: st.t, color: resolveColor(st.color, sw), a: st.a })),
        x0: s.x + s.sx * f.x0,
        y0: s.y + s.sy * f.y0,
        x1: s.x + s.sx * f.x1,
        y1: s.y + s.sy * f.y1,
        blend: f.blend,
        opacity: f.opacity,
      });
  }
  return { fill: base.type === 'color' ? resolveColor(base.color, sw) : '#808080', layers: out };
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

/**
 * was eine Form im SVG wird: ein Pfad, oder (geteilt) je gefüllte Fläche einer; group: als Gruppe ihrer Flächen.
 * Palettenfarben gehen als ihr Wert hinaus (Look Tag)
 */
export function shapeItems(s: ZoneShape, sw: SwatchMap = new Map(), styles: ReadonlyMap<string, ZoneStyle> = new Map()): { group: boolean; items: Item[] } {
  const faces = shapeFaces(s);
  if (!s.cuts?.length && faces.length === 1) {
    const { fill, layers } = exportLayers(s, faces[0], sw, styles);
    return { group: false, items: fill === null ? [] : [{ id: s.id, fill, rings: [toPlane(s, s.path), ...(s.holes ?? []).map((h) => toPlane(s, h))], layers }] };
  }
  const items: Item[] = [];
  faces.forEach((face, k) => {
    const { fill, layers } = exportLayers(s, face, sw, styles);
    if (fill === null) return;
    const c = faceCurves(s, face);
    items.push({ id: `${s.id}-f${k}`, fill, rings: [toPlane(s, c.outline), ...c.holes.map((h) => toPlane(s, h))], layers });
  });
  return { group: true, items };
}

const CSS_BLEND: Record<BlendMode, string> = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', softLight: 'soft-light', colorDodge: 'color-dodge', color: 'color' };

/**
 * Ebenen als SVG: die angegebenen (sonst alle sichtbaren), von hinten nach vorn je eine Gruppe; ausgeblendete Formen
 * fehlen. Der Rahmen umfasst alle Formen mit 2 m Rand, auf ganze Meter
 */
export function planesToSvg(nodes: readonly ZoneNode[], opts: { planes?: readonly string[]; zoneName?: string } = {}): string {
  const sw = swatchMap(nodes);
  const styles = styleMap(nodes);
  const planes = planesOf(nodes)
    .filter((p) => (opts.planes ? opts.planes.includes(p.id) : !planeHidden(nodes, p)))
    .reverse();
  const groups = planes.map((plane) => ({
    plane,
    shapes: shapesOf(nodes, plane.id)
      .filter((s) => !s.hidden)
      .map((s) => ({ shape: s, ...shapeItems(s, sw, styles) }))
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
  // Verläufe in <defs> (in Bildpunkten, userSpaceOnUse); sie kommen vor die Ebenen
  const defs: string[] = [];
  const defsAt = lines.length;
  const gradientDef = (l: Extract<ExportLayer, { kind: 'gradient' }>): string => {
    const id = `v${defs.length + 1}`;
    const [ax, ay] = toSvg(l.x0, l.y0);
    const [bx, by] = toSvg(l.x1, l.y1);
    const stops = l.stops.map((st) => `<stop offset="${f(st.t)}" stop-color="${st.color}"${st.a < 1 ? ` stop-opacity="${f(st.a)}"` : ''}/>`).join('');
    defs.push(
      l.radial
        ? `    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(ax)}" cy="${f(ay)}" r="${f(Math.hypot(bx - ax, by - ay))}">${stops}</radialGradient>`
        : `    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}">${stops}</linearGradient>`,
    );
    return `url(#${id})`;
  };
  /** Pfad einer Fläche mit ihren Füllungen: ein Pfad mit eigenem Verlauf, sonst Grundfarbe und je Füllung ein Pfad */
  const itemPaths = (it: Item, indent: string): void => {
    const own = ownGradient(it);
    lines.push(`${indent}<path id="${it.id}" d="${d(it.rings)}" fill="${own ? gradientDef(own) : esc(it.fill)}" fill-rule="evenodd"/>`);
    if (own) return;
    it.layers.forEach((l, k) => {
      const fill = l.kind === 'color' ? l.color : gradientDef(l);
      const extra = `${l.opacity < 1 ? ` opacity="${f(l.opacity)}"` : ''}${l.blend !== 'normal' ? ` style="mix-blend-mode:${CSS_BLEND[l.blend]}"` : ''}`;
      lines.push(`${indent}<path id="${it.id}-L${k + 1}" d="${d(it.rings)}" fill="${fill}" fill-rule="evenodd"${extra}/>`);
    });
  };
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
    // Formgruppen als verschachtelte Gruppen fg… (sie hängen in der Zeichenreihenfolge zusammen)
    const stack: string[] = [];
    const ind = () => `${pad}    ${'  '.repeat(stack.length)}`;
    for (const s of g.shapes) {
      const path = s.shape.groups ?? [];
      let common = 0;
      while (common < stack.length && stack[common] === path[common]) common++;
      while (stack.length > common) {
        stack.pop();
        lines.push(`${ind()}</g>`);
      }
      while (stack.length < path.length) {
        lines.push(`${ind()}<g id="${path[stack.length]}">`);
        stack.push(path[stack.length]);
      }
      if (!s.group) {
        itemPaths(s.items[0], ind());
        continue;
      }
      lines.push(`${ind()}<g id="${s.shape.id}">`);
      for (const it of s.items) itemPaths(it, `${ind()}  `);
      lines.push(`${ind()}</g>`);
    }
    while (stack.length) {
      stack.pop();
      lines.push(`${ind()}</g>`);
    }
    lines.push(`${pad}  </g>`);
  }
  if (open) lines.push('  </g>');
  lines.push('</svg>');
  if (defs.length) lines.splice(defsAt, 0, '  <defs>', ...defs, '  </defs>');
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ Lesen

interface RawGroup {
  id: string | null;
  name: string | null;
}

/** SVG-Verlauf: linear oder radial, in Bildpunkten (user) oder am Rahmen des Elements (box), Stopps */
interface GradDef {
  radial: boolean;
  units: 'user' | 'box';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  r: number;
  transform: Matrix;
  stops: Array<{ t: number; color: string; a: number }>;
}

interface RawShape {
  id: string | null;
  name: string | null;
  /** umschließende Gruppen, die äußerste zuerst */
  groups: RawGroup[];
  /** Teilpfade in SVG-Pixeln (transformiert) */
  subs: ZonePath[];
  fill: string;
  /** Verlauf der Füllung mit der Matrix des Elements und seinem Rahmen (vor der Matrix) */
  grad: { def: GradDef; m: Matrix; box: [number, number, number, number] } | null;
  opacity: number;
  blend: BlendMode;
}

/** Zahl oder Prozent (am Rahmen: Anteil) */
const unit = (v: string | undefined, d: number): number => {
  if (v === undefined || v.trim() === '') return d;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return d;
  return v.trim().endsWith('%') ? n / 100 : n;
};

/** alle Verläufe der Datei; Stopps auch über xlink:href (Illustrator verweist so auf gemeinsame Stopps) */
function parseGradients(svg: string): Map<string, GradDef> {
  const raw = new Map<string, { attrs: Record<string, string>; stops: GradDef['stops']; radial: boolean }>();
  for (const g of svg.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of g[2].matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? '';
    const stops: GradDef['stops'] = [];
    for (const st of (g[4] ?? '').matchAll(/<stop\b([^>]*)>/gi)) {
      const sa: Record<string, string> = {};
      for (const a of st[1].matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) sa[a[1].toLowerCase()] = a[3] ?? a[4] ?? '';
      const style = decls(sa.style ?? '');
      const color = parseColor(style['stop-color'] ?? sa['stop-color']) ?? '#000000';
      const op = parseFloat(style['stop-opacity'] ?? sa['stop-opacity'] ?? '1');
      stops.push({ t: Math.max(0, Math.min(1, unit(sa.offset, 0))), color, a: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1 });
    }
    if (attrs.id) raw.set(attrs.id, { attrs, stops, radial: g[1].toLowerCase() === 'radialgradient' });
  }
  const out = new Map<string, GradDef>();
  for (const [id, g] of raw) {
    let stops = g.stops;
    let href = (g.attrs['xlink:href'] ?? g.attrs.href ?? '').replace(/^#/, '');
    for (let k = 0; !stops.length && href && k < 8; k++) {
      const next = raw.get(href);
      if (!next) break;
      stops = next.stops;
      href = (next.attrs['xlink:href'] ?? next.attrs.href ?? '').replace(/^#/, '');
    }
    if (stops.length < 2) continue;
    const a = g.attrs;
    out.set(id, {
      radial: g.radial,
      units: a.gradientunits === 'userSpaceOnUse' || a.gradientunits === 'userspaceonuse' ? 'user' : 'box',
      x1: unit(a.x1, 0),
      y1: unit(a.y1, 0),
      x2: unit(a.x2, 1),
      y2: unit(a.y2, 0),
      cx: unit(a.cx, 0.5),
      cy: unit(a.cy, 0.5),
      r: unit(a.r, 0.5),
      transform: parseTransform(a.gradienttransform),
      stops: [...stops].sort((p, q) => p.t - q.t),
    });
  }
  return out;
}

const BLEND_OF: Record<string, BlendMode> = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'softLight', 'color-dodge': 'colorDodge', color: 'color' };

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
  // Verläufe: als Verlauf übernommen (die Form bekommt die erste Stopp-Farbe als Grundfarbe)
  const gradients = parseGradients(svg);
  const out: Walked = { shapes: [], frame: null, root: {}, pgf: /<i:pgf\b|i:pgfRef/.test(svg), gradients: 0, skipped: 0 };
  type Frame = { m: Matrix; fill: string | null; grad: GradDef | null; hidden: boolean; group: RawGroup | null; tag: string };
  const stack: Frame[] = [{ m: [1, 0, 0, 1, 0, 0], fill: '#000000', grad: null, hidden: false, group: null, tag: '' }];
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
    let grad = top.grad;
    if (fillRaw !== undefined) {
      const url = /url\(\s*#([^)\s]+)\s*\)/.exec(fillRaw);
      grad = null;
      if (url) {
        grad = gradients.get(url[1]) ?? null;
        fill = grad?.stops[0].color ?? '#808080';
        if (!grad) out.gradients++;
      } else fill = parseColor(fillRaw);
    }
    const hidden = top.hidden || (style.display ?? cls.display ?? attrs.display) === 'none' || (style.visibility ?? attrs.visibility) === 'hidden';
    const mat = mul(top.m, parseTransform(attrs.transform));
    if (GROUPS.has(name)) {
      if (!selfClose) stack.push({ m: name === 'svg' ? top.m : mat, fill, grad, hidden, group: name === 'g' || name === 'a' ? { id: attrs.id ?? null, name: attrs['data-name'] ?? null } : null, tag: name });
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
    // Rahmen vor der Matrix (für Verläufe am Rahmen), Deckkraft und Mischmodus des Elements
    const pts = subs.flat();
    const box: [number, number, number, number] = pts.length ? [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))] : [0, 0, 1, 1];
    const op = parseFloat(style.opacity ?? cls.opacity ?? attrs.opacity ?? '1') * parseFloat(style['fill-opacity'] ?? cls['fill-opacity'] ?? attrs['fill-opacity'] ?? '1');
    const blend = BLEND_OF[(style['mix-blend-mode'] ?? cls['mix-blend-mode'] ?? '').trim()] ?? 'normal';
    if (ok.length) out.shapes.push({ id: attrs.id ?? null, name: attrs['data-name'] ?? null, groups, subs: ok, fill, grad: grad ? { def: grad, m: mat, box } : null, opacity: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1, blend });
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
  if (w.gradients) warnings.push(`${w.gradients} Verläufe nicht lesbar, als Grau übernommen`);
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
  // Formgruppen: Gruppen unter der Ebenen-Gruppe (ohne die Hülle einer geteilten Form s…); fg-Kennungen bleiben, wenn
  // keine andere Ebene sie trägt, andere Gruppen (etwa aus Illustrator) bekommen neue
  const gmap = new Map<RawGroup, string>();
  let gnext = Number(nextGroupId(out).slice(2));
  const chainOf = (raw: RawShape, owner: RawGroup | null, planeId: string, all: readonly RawShape[]): string[] => {
    const from = owner ? raw.groups.indexOf(owner) + 1 : 0;
    return raw.groups
      .slice(from)
      // ohne Hüllen geteilter Formen und ohne fremde Hüllen um alles (Illustrator legt sie gern an)
      .filter((g) => !(g.id && /^s\d+$/.test(g.id)) && ((g.id && GROUP_ID.test(g.id)) || all.some((x) => !x.groups.includes(g))))
      .map((g) => {
        let id = gmap.get(g);
        if (!id) {
          const own = g.id && GROUP_ID.test(g.id) && ![...gmap.values()].includes(g.id) && !out.some((n) => n.kind === 'shape' && n.parent !== planeId && n.groups?.includes(g.id!));
          id = own ? g.id! : `fg${gnext++}`;
          if (own) gnext = Math.max(gnext, Number(id.slice(2)) + 1);
          gmap.set(g, id);
        }
        return id;
      });
  };
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
    // nach Form gruppieren: Gruppe s12 oder Kennung s12 / s12-f3 / s12-f3-L1 (Füllung über der Grundfarbe)
    const keyOf = (s: RawShape): string | null => {
      const g = [...s.groups].reverse().find((x) => x.id && /^s\d+$/.test(x.id));
      if (g) return g.id;
      return /^(s\d+)(?:-f\d+)?(?:-L\d+)?$/.exec(s.id ?? '')?.[1] ?? null;
    };
    /** Verlauf eines Elements in Ebenen-Koordinaten (gradientTransform, Rahmen, Matrix des Elements, Ursprung) */
    const gradLayer = (g: NonNullable<RawShape['grad']>, blend: BlendMode, opacity: number): ExportLayer => {
      const d = g.def;
      const [bx0, by0, bx1, by1] = g.box;
      const P = (x: number, y: number): PathPoint => {
        const t = d.transform;
        let qx = t[0] * x + t[2] * y + t[4];
        let qy = t[1] * x + t[3] * y + t[5];
        if (d.units === 'box') {
          qx = bx0 + qx * (bx1 - bx0);
          qy = by0 + qy * (by1 - by0);
        }
        return toPlanePt(apply(g.m, { x: qx, y: qy }));
      };
      const a = d.radial ? P(d.cx, d.cy) : P(d.x1, d.y1);
      const b = d.radial ? P(d.cx + d.r, d.cy) : P(d.x2, d.y2);
      return { kind: 'gradient', radial: d.radial, stops: d.stops.map((st) => ({ ...st })), x0: a.x, y0: a.y, x1: b.x, y1: b.y, blend, opacity };
    };
    /** Füllungen in Pfad-Koordinaten einer neuen Form */
    const toFills = (layers: readonly ExportLayer[], sh: ZoneShape): ZoneFill[] =>
      layers.map((l) =>
        l.kind === 'color'
          ? { type: 'color', color: l.color, blend: l.blend, opacity: l.opacity }
          : { type: 'gradient', ...(l.radial ? { radial: true } : {}), stops: l.stops.map((st): GradientStop => ({ t: st.t, color: st.color, a: st.a })), x0: (l.x0 - sh.x) / sh.sx, y0: (l.y0 - sh.y) / sh.sy, x1: (l.x1 - sh.x) / sh.sx, y1: (l.y1 - sh.y) / sh.sy, blend: l.blend, opacity: l.opacity },
      );
    const seen = new Set<string>();
    for (const raw of entry.shapes) {
      const key = keyOf(raw);
      if (key && seen.has(key)) continue;
      const parts = key ? entry.shapes.filter((x) => keyOf(x) === key) : [raw];
      if (key) seen.add(key);
      const chain = chainOf(raw, entry.group, target.id, entry.shapes);
      const setChain = (s: ZoneShape) => {
        if (chain.length) s.groups = [...chain];
        else delete s.groups;
      };
      const old = key ? before.find((s) => s.id === key) : undefined;
      // Füllungs-Pfade (-L1 …) gehören zum Pfad ihrer Fläche; ein Verlauf auf dem Pfad selbst ist seine erste Füllung
      const isLayer = (p: RawShape) => /-L\d+$/.test(p.id ?? '');
      const imported = parts
        .filter((p) => !isLayer(p))
        .map((p) => {
          const layers: ExportLayer[] = [];
          if (p.grad) layers.push(gradLayer(p.grad, p.blend, p.opacity));
          for (const q of parts.filter((x) => isLayer(x) && x.id!.replace(/-L\d+$/, '') === p.id))
            layers.push(q.grad ? gradLayer(q.grad, q.blend, q.opacity) : { kind: 'color', color: q.fill, blend: q.blend, opacity: q.opacity });
          return { id: p.id, fill: p.fill, rings: p.subs.map((sub) => sub.map(toPlanePt)), layers };
        });
      if (old) {
        // unverändert zurück: die Form bleibt, wie sie war (mit Teilungslinien, Füllpunkten und Verlaufsmitten)
        const exp = shapeItems(old, swatchMap(nodes), styleMap(nodes)).items;
        const same = exp.length === imported.length && exp.every((e) => {
          const im = imported.find((i) => i.id === e.id);
          const own = ownGradient(e);
          return !!im && parseColor(im.fill) === parseColor(own ? own.stops[0].color : e.fill) && sameRings(e.rings, im.rings) && layersKey(im.layers) === layersKey(e.layers);
        });
        if (same) {
          keepIds.add(old.id);
          setChain(old);
          fresh.push(old);
          kept++;
          continue;
        }
      }
      for (const im of imported) {
        outlines(im.rings).forEach(({ outline, holes }, k) => {
          const s = shapeFromPlanePath(out, target.id, outline, im.fill);
          if (holes.length) s.holes = holes.map((h) => planePathToShape(s, h));
          if (im.layers.length) s.fills = toFills(im.layers, s);
          // die erste Form übernimmt Kennung und Namen der alten, wenn es eine einzelne war
          if (old && k === 0 && imported.length === 1 && !keepIds.has(old.id)) {
            s.id = old.id;
            s.name = old.name;
            keepIds.add(old.id);
          } else {
            const nm = im.id && !/^s\d+(?:-f\d+)?$/.test(im.id) ? (raw.name ?? im.id.replace(/_x20_/g, ' ').replace(/_/g, ' ')) : null;
            if (nm) s.name = nm;
          }
          setChain(s);
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
