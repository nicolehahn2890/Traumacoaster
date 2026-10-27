/**
 * SVG-Austausch der Körper (Ebenen-Probe; Florians Wunsch vom 25.10.2026: Formen wie in Illustrator bearbeiten oder
 * erstellen und als Formvorlagen für die gemalten Elemente nutzen). Export: jeder Körper wird ein `<path>` mit seiner
 * Kennung, Tiefe, Dicke und Rolle als Datenattribute, Maßstab SVG_SCALE Pixel je Meter, y nach unten wie in SVG.
 * Import: `<path>`, `<polygon>`, `<rect>`, `<ellipse>` und `<circle>` (auch in Gruppen mit translate, scale und
 * matrix) werden Körper; zusammengesetzte Pfade ergeben Umriss und Löcher; ein Pfad mit der Kennung eines bestehenden
 * Körpers ersetzt dessen Form und behält Tiefe, Dicke, Rolle und Bild. Ohne DOM, damit es im Spiel, im Nachspielen und
 * in Tests gleich läuft.
 */
import { cleanPath, flattenPath, inPolygon, pathBounds, polyArea, type PathPoint, type ZonePath } from './path';
import type { ZoneElement, ZoneFile } from './types';

/** Pixel je Meter in der SVG-Datei */
export const SVG_SCALE = 10;

export interface SvgBody {
  id: string | null;
  /** Pfade in Welt-Metern (y nach oben), der erste ist der Umriss, weitere Löcher */
  path: ZonePath;
  holes: ZonePath[];
  /** Datenattribute, wenn vorhanden */
  z?: number;
  d?: number;
  role?: string;
  room?: number;
}

/** Zahl in SVG-Schreibweise */
const f = (v: number): string => {
  const s = (Math.round(v * 100) / 100).toString();
  return s === '-0' ? '0' : s;
};

/** Pfaddaten eines geschlossenen Pfads in SVG-Pixeln (y nach unten); world→svg über toSvg */
export function svgPathData(path: ZonePath, toSvg: (x: number, y: number) => [number, number]): string {
  if (!path.length) return '';
  const parts: string[] = [];
  const [sx, sy] = toSvg(path[0].x, path[0].y);
  parts.push(`M${f(sx)} ${f(sy)}`);
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const straight = !a.outX && !a.outY && !b.inX && !b.inY;
    const [bx, by] = toSvg(b.x, b.y);
    if (straight) {
      if (i < path.length - 1) parts.push(`L${f(bx)} ${f(by)}`);
      continue;
    }
    const [c1x, c1y] = toSvg(a.x + (a.outX ?? 0), a.y + (a.outY ?? 0));
    const [c2x, c2y] = toSvg(b.x + (b.inX ?? 0), b.y + (b.inY ?? 0));
    parts.push(`C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(bx)} ${f(by)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** alle Körper der Zone als SVG; Rahmen aus den Feldern und Körpern, 1 m = SVG_SCALE px */
export function zoneToSvg(zone: ZoneFile): string {
  const bodies = zone.elements.filter((e) => e.kind === 'body' && e.path);
  let minX = 0;
  let maxX = zone.width;
  let minY = -10;
  let maxY = 60;
  for (const fld of zone.fields) {
    minX = Math.min(minX, fld.x0);
    maxX = Math.max(maxX, fld.x1);
    minY = Math.min(minY, fld.y0);
    maxY = Math.max(maxY, fld.y1);
  }
  for (const b of bodies) {
    const bb = pathBounds(b.path!);
    minX = Math.min(minX, b.x + bb.minX);
    maxX = Math.max(maxX, b.x + bb.maxX);
    minY = Math.min(minY, b.y + bb.minY);
    maxY = Math.max(maxY, b.y + bb.maxY);
  }
  const toSvg = (x: number, y: number): [number, number] => [(x - minX) * SVG_SCALE, (maxY - y) * SVG_SCALE];
  const W = f((maxX - minX) * SVG_SCALE);
  const H = f((maxY - minY) * SVG_SCALE);
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-zone="${esc(zone.name)}" data-scale="${SVG_SCALE}" data-min-x="${f(minX)}" data-max-y="${f(maxY)}">`);
  lines.push(`  <!-- Trauma Coaster, Zone ${esc(zone.name)}: 1 m = ${SVG_SCALE} px, Ursprung x ${f(minX)} m, oben y ${f(maxY)} m. Pfade bearbeiten, Kennung behalten, zurück importieren. -->`);
  lines.push(`  <rect id="rahmen" x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#999" stroke-width="1"/>`);
  for (const fld of [...zone.fields].sort((a, b) => a.id.localeCompare(b.id))) {
    const [x0, y1] = toSvg(fld.x0, fld.y1);
    const [x1, y0] = toSvg(fld.x1, fld.y0);
    lines.push(`  <rect id="feld-${esc(fld.id)}" x="${f(x0)}" y="${f(y1)}" width="${f(x1 - x0)}" height="${f(y0 - y1)}" fill="none" stroke="#39f" stroke-dasharray="6 4" stroke-width="1"/>`);
  }
  for (const b of [...bodies].sort((a, c) => a.id.localeCompare(c.id, 'en', { numeric: true }))) {
    const local = (p: ZonePath): ZonePath => p.map((q) => ({ ...q, x: q.x + b.x, y: q.y + b.y }));
    const dParts = [svgPathData(local(b.path!), toSvg), ...(b.holes ?? []).map((h) => svgPathData(local(h), toSvg))];
    const attrs = [`id="${esc(b.id)}"`, `d="${dParts.join(' ')}"`, `fill="${esc(b.color ?? '#8aa0b8')}"`, `fill-opacity="0.6"`, `fill-rule="evenodd"`, `stroke="#223"`, `stroke-width="1"`, `data-z="${f(b.z)}"`, `data-d="${f(b.d ?? 0)}"`, `data-role="${esc(b.role ?? 'front')}"`];
    if (b.room) attrs.push(`data-room="${f(b.room)}"`);
    if (b.label) attrs.push(`data-label="${esc(b.label)}"`);
    lines.push(`  <path ${attrs.join(' ')}/>`);
  }
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

type Matrix = [number, number, number, number, number, number];
const IDENT: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** transform-Attribut (translate, scale, matrix, rotate um den Ursprung) als Matrix */
export function parseTransform(s: string | null | undefined): Matrix {
  let m: Matrix = IDENT;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(s))) {
    const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENT;
    if (r[1] === 'matrix' && a.length === 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (r[1] === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (r[1] === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (r[1] === 'rotate') {
      const rad = ((a[0] ?? 0) * Math.PI) / 180;
      const rot: Matrix = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
      t = a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1], a[2]], rot), [1, 0, 0, 1, -a[1], -a[2]]) : rot;
    }
    m = mul(m, t);
  }
  return m;
}

/** Pfaddaten (d-Attribut) in geschlossene Teilpfade aus Ankern mit Griffen (SVG-Pixel) */
export function parsePathData(d: string): ZonePath[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: ZonePath[] = [];
  let cur: ZonePath = [];
  let cmd = '';
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  const num = (): number => Number(tokens[i++]);
  const close = () => {
    if (cur.length >= 2) {
      // schließt der letzte Punkt auf dem ersten, fällt er weg; seine Griffe wandern zum ersten
      const a = cur[0];
      const b = cur[cur.length - 1];
      if (cur.length >= 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) {
        a.inX = b.inX;
        a.inY = b.inY;
        cur.pop();
      }
      subs.push(cur);
    }
    cur = [];
    x = startX;
    y = startY;
  };
  const setOut = (ox: number, oy: number) => {
    const p = cur[cur.length - 1];
    if (p) {
      p.outX = ox - p.x;
      p.outY = oy - p.y;
    }
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        close();
        lastC = lastQ = null;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        if (cur.length) close();
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        x = startX = nx;
        y = startY = ny;
        cur.push({ x, y });
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'L': {
        x = num() + (rel ? x : 0);
        y = num() + (rel ? y : 0);
        cur.push({ x, y });
        lastC = lastQ = null;
        break;
      }
      case 'H': {
        x = num() + (rel ? x : 0);
        cur.push({ x, y });
        lastC = lastQ = null;
        break;
      }
      case 'V': {
        y = num() + (rel ? y : 0);
        cur.push({ x, y });
        lastC = lastQ = null;
        break;
      }
      case 'C': {
        const c1x = num() + (rel ? x : 0);
        const c1y = num() + (rel ? y : 0);
        const c2x = num() + (rel ? x : 0);
        const c2y = num() + (rel ? y : 0);
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        setOut(c1x, c1y);
        cur.push({ x: nx, y: ny, inX: c2x - nx, inY: c2y - ny });
        x = nx;
        y = ny;
        lastC = [c2x, c2y];
        lastQ = null;
        break;
      }
      case 'S': {
        const c2x = num() + (rel ? x : 0);
        const c2y = num() + (rel ? y : 0);
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        const c1x = lastC ? 2 * x - lastC[0] : x;
        const c1y = lastC ? 2 * y - lastC[1] : y;
        setOut(c1x, c1y);
        cur.push({ x: nx, y: ny, inX: c2x - nx, inY: c2y - ny });
        x = nx;
        y = ny;
        lastC = [c2x, c2y];
        lastQ = null;
        break;
      }
      case 'Q':
      case 'T': {
        let qx: number;
        let qy: number;
        if (cmd.toUpperCase() === 'Q') {
          qx = num() + (rel ? x : 0);
          qy = num() + (rel ? y : 0);
        } else {
          qx = lastQ ? 2 * x - lastQ[0] : x;
          qy = lastQ ? 2 * y - lastQ[1] : y;
        }
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        // quadratisch zu kubisch
        setOut(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y));
        cur.push({ x: nx, y: ny, inX: (2 / 3) * (qx - nx), inY: (2 / 3) * (qy - ny) });
        x = nx;
        y = ny;
        lastQ = [qx, qy];
        lastC = null;
        break;
      }
      case 'A': {
        const rx = Math.abs(num());
        const ry = Math.abs(num());
        const rot = (num() * Math.PI) / 180;
        const large = num() !== 0;
        const sweep = num() !== 0;
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        for (const seg of arcToCubics(x, y, rx, ry, rot, large, sweep, nx, ny)) {
          setOut(seg[0], seg[1]);
          cur.push({ x: seg[4], y: seg[5], inX: seg[2] - seg[4], inY: seg[3] - seg[5] });
        }
        x = nx;
        y = ny;
        lastC = lastQ = null;
        break;
      }
      default:
        i++;
    }
  }
  if (cur.length) close();
  return subs.filter((p) => p.length >= 2);
}

/** elliptischer Bogen als kubische Kurven [c1x, c1y, c2x, c2y, x, y] */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    lambda = Math.sqrt(lambda);
    rx *= lambda;
    ry *= lambda;
  }
  const sign = large === sweep ? -1 : 1;
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const d = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return d;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const out: number[][] = [];
  const delta = dt / segs;
  const k = (4 / 3) * Math.tan(delta / 4);
  let a = t1;
  for (let s = 0; s < segs; s++) {
    const b = a + delta;
    const p = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
    const dp = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
    const [ax, ay] = p(a);
    const [bx, by] = p(b);
    const [dax, day] = dp(a);
    const [dbx, dby] = dp(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
    a = b;
  }
  return out;
}

interface SvgShape {
  id: string | null;
  subs: ZonePath[];
  data: Record<string, string>;
}

/** Formen einer SVG-Datei (Pfade, Polygone, Rechtecke, Ellipsen, Kreise) in SVG-Pixeln, Gruppen-Transformationen eingerechnet */
export function parseSvgShapes(svg: string): SvgShape[] {
  const out: SvgShape[] = [];
  const stack: Matrix[] = [IDENT];
  const tagRe = /<\s*(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  const attr = (attrs: string, name: string): string | null => {
    const r = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
    return r ? (r[2] ?? r[3] ?? '') : null;
  };
  const dataOf = (attrs: string): Record<string, string> => {
    const data: Record<string, string> = {};
    const re = /data-([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(attrs))) data[r[1]] = r[3] ?? r[4] ?? '';
    return data;
  };
  const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  while ((m = tagRe.exec(svg))) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3];
    const selfClose = m[4] === '/';
    if (name === 'defs' || name === 'clippath' || name === 'mask' || name === 'symbol') {
      if (!closing && !selfClose) {
        // Inhalt überspringen
        const end = new RegExp(`<\\s*/\\s*${name}\\s*>`, 'ig');
        end.lastIndex = tagRe.lastIndex;
        const e = end.exec(svg);
        if (e) tagRe.lastIndex = end.lastIndex;
      }
      continue;
    }
    if (name === 'g' || name === 'svg') {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        const t = mul(stack[stack.length - 1], parseTransform(attr(attrs, 'transform')));
        if (!selfClose) stack.push(t);
      }
      continue;
    }
    if (closing) continue;
    const base = mul(stack[stack.length - 1], parseTransform(attr(attrs, 'transform')));
    let subs: ZonePath[] = [];
    if (name === 'path') {
      const d = attr(attrs, 'd');
      if (!d) continue;
      subs = parsePathData(unescape(d));
    } else if (name === 'polygon' || name === 'polyline') {
      const pts = (attr(attrs, 'points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      const p: ZonePath = [];
      for (let k = 0; k + 1 < pts.length; k += 2) p.push({ x: pts[k], y: pts[k + 1] });
      subs = [p];
    } else if (name === 'rect') {
      const x = Number(attr(attrs, 'x') ?? 0);
      const y = Number(attr(attrs, 'y') ?? 0);
      const w = Number(attr(attrs, 'width') ?? 0);
      const h = Number(attr(attrs, 'height') ?? 0);
      subs = [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]];
    } else if (name === 'ellipse' || name === 'circle') {
      const cx = Number(attr(attrs, 'cx') ?? 0);
      const cy = Number(attr(attrs, 'cy') ?? 0);
      const rx = Number(attr(attrs, name === 'circle' ? 'r' : 'rx') ?? 0);
      const ry = Number(attr(attrs, name === 'circle' ? 'r' : 'ry') ?? 0);
      const k = 0.5523;
      subs = [[
        { x: cx + rx, y: cy, inX: 0, inY: -k * ry, outX: 0, outY: k * ry },
        { x: cx, y: cy + ry, inX: k * rx, inY: 0, outX: -k * rx, outY: 0 },
        { x: cx - rx, y: cy, inX: 0, inY: k * ry, outX: 0, outY: -k * ry },
        { x: cx, y: cy - ry, inX: -k * rx, inY: 0, outX: k * rx, outY: 0 },
      ]];
    } else continue;
    const id = attr(attrs, 'id');
    if (id && /^(rahmen|feld-)/.test(id)) continue;
    const tp = (p: PathPoint): PathPoint => {
      const [x, y] = apply(base, p.x, p.y);
      const o: PathPoint = { x, y };
      if (p.inX !== undefined || p.inY !== undefined) {
        const [ix, iy] = apply(base, p.x + (p.inX ?? 0), p.y + (p.inY ?? 0));
        o.inX = ix - x;
        o.inY = iy - y;
      }
      if (p.outX !== undefined || p.outY !== undefined) {
        const [ox, oy] = apply(base, p.x + (p.outX ?? 0), p.y + (p.outY ?? 0));
        o.outX = ox - x;
        o.outY = oy - y;
      }
      return o;
    };
    out.push({ id, subs: subs.map((s) => s.map(tp)).filter((s) => s.length >= 3), data: dataOf(attrs) });
  }
  return out;
}

/**
 * Körper aus einer SVG-Datei: Pixel → Meter (scale px/m, Ursprung minX, oben maxY wie beim Export; ohne Datenattribute
 * der Datei gelten die übergebenen Werte), y nach oben. Teilpfade: der größte ist der Umriss, Teilpfade in ihm sind
 * Löcher, weitere große Teilpfade werden eigene Körper (Kennung mit Zusatz)
 */
export function svgToBodies(svg: string, opts: { scale?: number; minX?: number; maxY?: number } = {}): SvgBody[] {
  const head = /<svg[^>]*>/i.exec(svg)?.[0] ?? '';
  const dataNum = (name: string): number | undefined => {
    const r = new RegExp(`data-${name}\\s*=\\s*"([^"]*)"`).exec(head);
    return r ? Number(r[1]) : undefined;
  };
  const scale = opts.scale ?? dataNum('scale') ?? SVG_SCALE;
  const minX = opts.minX ?? dataNum('min-x') ?? 0;
  const maxY = opts.maxY ?? dataNum('max-y') ?? (() => {
    const vb = /viewBox\s*=\s*"([^"]*)"/.exec(head)?.[1].split(/[\s,]+/).map(Number);
    const h = vb && vb.length === 4 ? vb[3] : Number(/height\s*=\s*"([\d.]+)/.exec(head)?.[1] ?? 0);
    return h / scale;
  })();
  const toWorld = (p: PathPoint): PathPoint => {
    const o: PathPoint = { x: minX + p.x / scale, y: maxY - p.y / scale };
    if (p.inX !== undefined || p.inY !== undefined) {
      o.inX = (p.inX ?? 0) / scale;
      o.inY = -(p.inY ?? 0) / scale;
    }
    if (p.outX !== undefined || p.outY !== undefined) {
      o.outX = (p.outX ?? 0) / scale;
      o.outY = -(p.outY ?? 0) / scale;
    }
    return o;
  };
  const out: SvgBody[] = [];
  for (const shape of parseSvgShapes(svg)) {
    const subs = shape.subs.map((s) => s.map(toWorld));
    if (!subs.length) continue;
    const polys = subs.map((s) => flattenPath(s));
    const areas = polys.map((p) => Math.abs(polyArea(p)));
    const order = subs.map((_, k) => k).sort((a, b) => areas[b] - areas[a]);
    const used = new Set<number>();
    let n = 0;
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
      const body: SvgBody = { id: shape.id ? (n === 0 ? shape.id : `${shape.id}-${n + 1}`) : null, path: cleanPath(subs[k]), holes: holes.map((h) => cleanPath(h)) };
      const z = Number(shape.data.z);
      const d = Number(shape.data.d);
      const room = Number(shape.data.room);
      if (Number.isFinite(z)) body.z = z;
      if (Number.isFinite(d)) body.d = d;
      if (shape.data.role) body.role = shape.data.role;
      if (Number.isFinite(room) && room > 0) body.room = room;
      out.push(body);
      n++;
    }
  }
  return out;
}

/**
 * Importierte Körper in die Zone übernehmen: gleiche Kennung ersetzt die Form (Tiefe, Dicke, Rolle, Bild bleiben, wenn
 * die Datei nichts anderes sagt), neue Kennungen werden neue Körper. Gibt die geänderten und neuen Elemente zurück
 */
export function applySvgBodies(zone: ZoneFile, bodies: SvgBody[], newId: () => string): ZoneElement[] {
  const changed: ZoneElement[] = [];
  for (const b of bodies) {
    const bb = pathBounds(b.path);
    const x = Math.round(bb.minX * 100) / 100;
    const y = Math.round(bb.minY * 100) / 100;
    const rel = (p: ZonePath): ZonePath => cleanPath(p.map((q) => ({ ...q, x: q.x - x, y: q.y - y })));
    const existing = b.id ? zone.elements.find((e) => e.id === b.id && e.kind === 'body') : undefined;
    const el: ZoneElement = existing ?? { id: b.id && !zone.elements.some((e) => e.id === b.id) ? b.id : newId(), kind: 'body', x, y, z: b.z ?? 0, w: 1, h: 1, d: b.d ?? 4, role: 'front', color: '#8aa0b8' };
    el.x = x;
    el.y = y;
    el.path = rel(b.path);
    el.holes = b.holes.length ? b.holes.map(rel) : undefined;
    el.w = Math.round((bb.maxX - bb.minX) * 100) / 100;
    el.h = Math.round((bb.maxY - bb.minY) * 100) / 100;
    if (b.z !== undefined) el.z = b.z;
    if (b.d !== undefined) el.d = b.d;
    if (b.role) el.role = b.role as ZoneElement['role'];
    if (b.room !== undefined) el.room = b.room;
    if (!existing) zone.elements.push(el);
    changed.push(el);
  }
  return changed;
}
