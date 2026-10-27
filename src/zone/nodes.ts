/**
 * Ebenen und Formen des Zonen-Editors (docs/ZONENEDITOR-PLAN.md, Stufe 1; Datenmodell 3.4 und 5.2): Knoten mit einer Lage
 * relativ zu ihrem Elternteil. Stufe 1 kennt zwei Arten: die **Ebene** (parallel zum Bild, Tiefe z in Metern, hinten
 * positiv, Welt-Z = −z) und die **Form** (geschlossener Kurvenpfad in ihrer Ebene, Vollton als Platzhalter-Füllung). Die
 * Tiefe ordnet die Ebenen, `order` die Formen einer Ebene (größer = weiter vorn). Spätere Stufen bringen Baugruppen,
 * Bilder, Säume und Füllstapel als weitere Arten.
 *
 * Abstand ändern (Befund 1, Entscheidung A1): Der Griff zwischen zwei Ebenen schiebt alles dahinter mit; „Bild halten“
 * vergrößert und versetzt jede verschobene Ebene so, dass sie im Spielblick gleich aussieht. Zwischen parallelen Ebenen
 * ist die Zentralprojektion eine Streckung um den Fußpunkt der Kamera, darum genügt dafür der Maßstab der Ebene.
 *
 * Ohne Renderer und DOM, damit Spiel, Editor und Tests dasselbe rechnen.
 */
import { flattenPath, simplifyPoly, type Poly, type ZonePath } from './path';
import { LANE_DEPTH } from '@/track/stage';
import type { SliceRole, SliceStack } from './slices';

/** Rolle einer Ebene für Pinsel und Stützen (Befund 15); in Stufe 1 nur Merkmal, Stufe 4 wertet sie aus */
export type PlaneRole = 'play' | 'backdrop' | 'front' | 'air';
export const PLANE_ROLES: readonly PlaneRole[] = ['play', 'backdrop', 'front', 'air'];
export const PLANE_ROLE_WORDS: Record<PlaneRole, string> = { play: 'spielbar', backdrop: 'Kulisse', front: 'Vordergrund', air: 'Luft' };

export interface ZonePlane {
  id: string;
  kind: 'plane';
  /** Elternknoten (Baugruppe, ab Stufe 8); in Stufe 1 immer null */
  parent: null;
  name: string;
  /** Tiefe in Metern, hinten positiv (Welt-Z = −z); negativ liegt vor der Spur-0-Ebene */
  z: number;
  /** Lage und Maßstab des Inhalts in der Welt: Welt = (x, y) + scale · Ebenen-Koordinate */
  x: number;
  y: number;
  scale: number;
  role: PlaneRole;
  hidden?: boolean;
  locked?: boolean;
}

export interface ZoneShape {
  id: string;
  kind: 'shape';
  /** Kennung der Ebene */
  parent: string;
  /** Zeichenreihenfolge in der Ebene (größer = weiter vorn) */
  order: number;
  name: string;
  /** Lage in der Ebene (Meter) und Maßstab des Pfads je Achse (breiter, höher) */
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Umriss um den eigenen Ursprung (Anker mit Griffen wie in Illustrator), Löcher als weitere Pfade */
  path: ZonePath;
  holes?: ZonePath[];
  /** Platzhalter-Füllung (Vollton); der Füllstapel kommt mit Stufe 3 */
  fill: string;
  hidden?: boolean;
  locked?: boolean;
}

export type ZoneNode = ZonePlane | ZoneShape;

export const isPlane = (n: ZoneNode): n is ZonePlane => n.kind === 'plane';
export const isShape = (n: ZoneNode): n is ZoneShape => n.kind === 'shape';

/** Ebenen von vorn nach hinten */
export function planesOf(nodes: readonly ZoneNode[]): ZonePlane[] {
  return nodes.filter(isPlane).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** Formen einer Ebene von hinten nach vorn (Zeichenreihenfolge) */
export function shapesOf(nodes: readonly ZoneNode[], planeId: string): ZoneShape[] {
  return nodes.filter((n): n is ZoneShape => isShape(n) && n.parent === planeId).sort((a, b) => a.order - b.order);
}

export function findPlane(nodes: readonly ZoneNode[], id: string | null | undefined): ZonePlane | undefined {
  return id ? (nodes.find((n) => n.id === id && isPlane(n)) as ZonePlane | undefined) : undefined;
}

export function findShape(nodes: readonly ZoneNode[], id: string | null | undefined): ZoneShape | undefined {
  return id ? (nodes.find((n) => n.id === id && isShape(n)) as ZoneShape | undefined) : undefined;
}

/** nächste freie Kennung mit Vorsilbe (p für Ebenen, s für Formen), hochgezählt wie die Kennungen der Zonendatei */
export function nextNodeId(nodes: readonly ZoneNode[], prefix: 'p' | 's'): string {
  const ids = new Set(nodes.map((n) => n.id));
  let n = nodes.filter((x) => x.id.startsWith(prefix)).length + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Abstand einer neuen Ebene zur Nachbarebene, wenn nichts anderes bekannt ist (Meter) */
export const DEFAULT_GAP = 4;

/** neue Ebene in Tiefe z */
export function newPlane(nodes: readonly ZoneNode[], z: number, name?: string): ZonePlane {
  const id = nextNodeId(nodes, 'p');
  return { id, kind: 'plane', parent: null, name: name ?? `Ebene ${id.slice(1)}`, z: round(z, 3), x: 0, y: 0, scale: 1, role: 'play' };
}

/**
 * Tiefe für eine neue Ebene direkt vor (front) oder hinter der Ebene ref: in der Mitte der Lücke zum Nachbarn, am Rand
 * des Stapels DEFAULT_GAP weiter; ohne Ebenen bei 0
 */
export function depthBeside(nodes: readonly ZoneNode[], refId: string | null, side: 'front' | 'back'): number {
  const planes = planesOf(nodes);
  if (!planes.length) return 0;
  const i = Math.max(0, planes.findIndex((p) => p.id === refId));
  const ref = planes[refId ? i : side === 'front' ? 0 : planes.length - 1];
  const j = planes.indexOf(ref) + (side === 'front' ? -1 : 1);
  const other = planes[j];
  if (!other) return ref.z + (side === 'front' ? -DEFAULT_GAP : DEFAULT_GAP);
  return (ref.z + other.z) / 2;
}

/** Kamera, für die „Bild halten“ rechnet: Ziel (Spur-0-Ebene), Abstand D (Infinity ohne Perspektive), Neigung */
export interface HoldView {
  cx: number;
  cy: number;
  D: number;
  tilt: number;
}

/**
 * Ebene von Tiefe z0 nach z1 bringen, ohne dass sich ihr Bild in der Kamera view ändert: Mit Perspektive streckt die
 * Zentralprojektion um den Fußpunkt der Kamera (cx, cy + D·sin Neigung) mit t = (D·cos + z1) / (D·cos + z0); ohne
 * Perspektive verschiebt sie nur um die Anhebung der Tiefe (Δz · tan Neigung). Ändert die Ebene in place.
 */
export function holdPicture(plane: ZonePlane, z0: number, z1: number, view: HoldView): void {
  if (Number.isFinite(view.D)) {
    const along = view.D * Math.cos(view.tilt);
    // eine Ebene hinter der Kamera hat kein Bild; dann bleibt der Maßstab (der Editor verhindert das ohnehin)
    if (along + z0 <= 1e-6 || along + z1 <= 1e-6) {
      plane.z = z1;
      return;
    }
    const t = (along + z1) / (along + z0);
    const Cx = view.cx;
    const Cy = view.cy + view.D * Math.sin(view.tilt);
    plane.x = Cx + t * (plane.x - Cx);
    plane.y = Cy + t * (plane.y - Cy);
    plane.scale *= t;
  } else {
    plane.y -= (z1 - z0) * Math.tan(view.tilt);
  }
  plane.z = z1;
}

/** vorderste erlaubte Tiefe einer Ebene in einer Kamera (knapp vor der Bildebene der Kamera) */
export function nearestDepth(view: HoldView): number {
  return Number.isFinite(view.D) ? -view.D * Math.cos(view.tilt) * 0.8 : -Infinity;
}

/**
 * Abstand zwischen der Ebene frontId und der nächsten dahinter auf gap setzen; alle Ebenen dahinter rücken mit (ihre
 * Abstände bleiben). hold: „Bild halten“ in dieser Kamera, sonst „Welt halten“. Gibt die neue Tiefe der Ebene direkt
 * dahinter zurück, null ohne solche Ebene.
 */
export function setGapBehind(nodes: ZoneNode[], frontId: string, gap: number, hold: HoldView | null): number | null {
  const planes = planesOf(nodes);
  const i = planes.findIndex((p) => p.id === frontId);
  if (i < 0 || i >= planes.length - 1) return null;
  const delta = Math.max(0.05, gap) - (planes[i + 1].z - planes[i].z);
  for (let j = i + 1; j < planes.length; j++) {
    const p = planes[j];
    const z1 = round(p.z + delta, 3);
    if (hold) holdPicture(p, p.z, z1, hold);
    else p.z = z1;
  }
  return planes[i + 1].z;
}

/** eine einzelne Ebene in die Tiefe z1 schieben (Nachbarn bleiben), mit oder ohne „Bild halten“ */
export function movePlaneDepth(plane: ZonePlane, z1: number, hold: HoldView | null): void {
  const z = round(z1, 3);
  if (hold) holdPicture(plane, plane.z, z, hold);
  else plane.z = z;
}

// ------------------------------------------------------------------ Formen

const KAPPA = 0.5523;

/** Rechteck w × h um den Ursprung (vier Ecken) */
export function rectPath(w: number, h: number): ZonePath {
  const a = w / 2;
  const b = h / 2;
  return [
    { x: -a, y: -b },
    { x: a, y: -b },
    { x: a, y: b },
    { x: -a, y: b },
  ];
}

/** Ellipse mit Halbachsen rx, ry um den Ursprung (vier Anker mit Griffen, gegen den Uhrzeigersinn) */
export function ellipsePath(rx: number, ry: number): ZonePath {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { x: rx, y: 0, inX: 0, inY: -ky, outX: 0, outY: ky },
    { x: 0, y: ry, inX: kx, inY: 0, outX: -kx, outY: 0 },
    { x: -rx, y: 0, inX: 0, inY: ky, outX: 0, outY: -ky },
    { x: 0, y: -ry, inX: -kx, inY: 0, outX: kx, outY: 0 },
  ];
}

/** neue Form in einer Ebene, über allen Formen dieser Ebene */
export function newShape(nodes: readonly ZoneNode[], planeId: string, path: ZonePath, x: number, y: number, fill: string, name?: string): ZoneShape {
  const id = nextNodeId(nodes, 's');
  const top = shapesOf(nodes, planeId).reduce((m, s) => Math.max(m, s.order), 0);
  return { id, kind: 'shape', parent: planeId, order: top + 1, name: name ?? `Form ${id.slice(1)}`, x: round(x), y: round(y), sx: 1, sy: 1, path, fill };
}

/** Ebenen-Koordinate → Welt (x, Höhe y) */
export function planeToWorld(plane: ZonePlane, px: number, py: number): { x: number; y: number } {
  return { x: plane.x + plane.scale * px, y: plane.y + plane.scale * py };
}

/** Welt (x, Höhe y) → Ebenen-Koordinate */
export function worldToPlane(plane: ZonePlane, x: number, y: number): { x: number; y: number } {
  return { x: (x - plane.x) / plane.scale, y: (y - plane.y) / plane.scale };
}

/** Pfad-Koordinate einer Form → Ebenen-Koordinate */
export function shapeToPlane(shape: ZoneShape, px: number, py: number): { x: number; y: number } {
  return { x: shape.x + shape.sx * px, y: shape.y + shape.sy * py };
}

/** Schrittweite beim Glätten der Kurven (Meter im Pfad), vom Maßstab unabhängig grob genug für das Spiel */
export const FLATTEN_STEP = 0.4;

/** Umriss und Löcher einer Form als Polygone in Pfad-Koordinaten (für Triangulierung und Treffer) */
export function shapeLocalPolys(shape: ZoneShape): { outline: Poly; holes: Poly[] } {
  const step = FLATTEN_STEP / Math.max(0.05, Math.max(Math.abs(shape.sx), Math.abs(shape.sy)));
  return { outline: flattenPath(shape.path, step), holes: (shape.holes ?? []).map((h) => flattenPath(h, step)) };
}

/** Grenzen einer Form in Ebenen-Koordinaten */
export function shapeBounds(shape: ZoneShape): { minX: number; minY: number; maxX: number; maxY: number } {
  const { outline } = shapeLocalPolys(shape);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of outline) {
    const q = shapeToPlane(shape, px, py);
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Platzhalter-Farbe einer neuen Form nach der Tiefe ihrer Ebene: vorn satt und dunkel, hinten hell und kühl (Paket 0,
 * Regel 6); Stufe 3 ersetzt das durch Palette und Füllstapel
 */
export function placeholderFill(z: number): string {
  const t = Math.max(0, Math.min(1, (z + 20) / 140));
  const a = [0x3d, 0x5a, 0x63];
  const b = [0xc6, 0xd4, 0xdc];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------ Probe aus der Kamerasession

const SLICE_ROLE: Record<SliceRole, PlaneRole> = { front: 'front', play: 'play', cave: 'play', deep: 'play', far: 'backdrop' };

/**
 * Scheibenstapel der Kamerasession (src/zone/slices.ts) als Ebenen mit Formen: je Scheibe eine Ebene in ihrer Tiefe,
 * je zusammenhängendes Stück ihres Höhenbands eine Form (Oberkante hin, Unterkante zurück, vereinfacht). Platzhalter:
 * Formen erzeugt, Farbe nur die Fläche oben; dient als Last für die Handy-Messung mit 30 Ebenen (Tor S1).
 */
export function slicesToNodes(stack: SliceStack, start: readonly ZoneNode[] = []): ZoneNode[] {
  const out: ZoneNode[] = [...start];
  for (const s of stack.slices) {
    const plane = newPlane(out, s.lane * LANE_DEPTH, `Scheibe ${out.filter(isPlane).length + 1}`);
    plane.role = SLICE_ROLE[s.role];
    out.push(plane);
    // zusammenhängende Läufe, in denen das Band Fläche hat
    let run: number[] = [];
    const runs: number[][] = [];
    for (let i = 0; i < s.top.length; i++) {
      const ok = Number.isFinite(s.top[i]) && Number.isFinite(s.low[i]) && s.top[i] - s.low[i] > 0.02;
      if (ok) run.push(i);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (r.length < 2) continue;
      const poly: Poly = [];
      for (const i of r) poly.push([s.x0 + i * s.step, s.top[i]]);
      for (let k = r.length - 1; k >= 0; k--) poly.push([s.x0 + r[k] * s.step, s.low[r[k]]]);
      const simple = simplifyPoly(poly, 0.06);
      if (simple.length < 3) continue;
      const path: ZonePath = simple.map(([x, y]) => ({ x: round(x), y: round(y) }));
      out.push(newShape(out, plane.id, path, 0, 0, s.colors.top));
    }
  }
  return out;
}

// ------------------------------------------------------------------ Datei

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z][a-z0-9-]{0,39}$/;

function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function parsePathList(v: unknown): ZonePath | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > 5000) return null;
  const out: ZonePath = [];
  for (const raw of v) {
    const p = raw as Record<string, unknown>;
    if (!p || !num(p.x) || !num(p.y)) return null;
    const q: ZonePath[number] = { x: p.x, y: p.y };
    if (num(p.inX) && num(p.inY)) {
      q.inX = p.inX;
      q.inY = p.inY;
    }
    if (num(p.outX) && num(p.outY)) {
      q.outX = p.outX;
      q.outY = p.outY;
    }
    out.push(q);
  }
  return out;
}

/** Knoten aus der Zonendatei lesen: Unbekanntes und Kaputtes fällt weg, Formen ohne ihre Ebene auch */
export function parseNodes(v: unknown): ZoneNode[] {
  if (!Array.isArray(v)) return [];
  const out: ZoneNode[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID.test(o.id) || ids.has(o.id)) continue;
    const name = typeof o.name === 'string' ? o.name.slice(0, 60) : o.id;
    if (o.kind === 'plane' && num(o.z)) {
      const p: ZonePlane = {
        id: o.id,
        kind: 'plane',
        parent: null,
        name,
        z: o.z,
        x: num(o.x) ? o.x : 0,
        y: num(o.y) ? o.y : 0,
        scale: num(o.scale) && o.scale > 1e-4 ? o.scale : 1,
        role: (PLANE_ROLES as readonly string[]).includes(String(o.role)) ? (o.role as PlaneRole) : 'play',
      };
      if (o.hidden === true) p.hidden = true;
      if (o.locked === true) p.locked = true;
      out.push(p);
      ids.add(p.id);
    } else if (o.kind === 'shape' && typeof o.parent === 'string') {
      const path = parsePathList(o.path);
      if (!path) continue;
      const s: ZoneShape = {
        id: o.id,
        kind: 'shape',
        parent: o.parent,
        order: num(o.order) ? o.order : 0,
        name,
        x: num(o.x) ? o.x : 0,
        y: num(o.y) ? o.y : 0,
        sx: num(o.sx) && Math.abs(o.sx) > 1e-4 ? o.sx : 1,
        sy: num(o.sy) && Math.abs(o.sy) > 1e-4 ? o.sy : 1,
        path,
        fill: typeof o.fill === 'string' && COLOR.test(o.fill) ? o.fill.toLowerCase() : '#8aa0b8',
      };
      if (Array.isArray(o.holes)) {
        const holes = o.holes.map(parsePathList).filter((h): h is ZonePath => !!h);
        if (holes.length) s.holes = holes;
      }
      if (o.hidden === true) s.hidden = true;
      if (o.locked === true) s.locked = true;
      out.push(s);
      ids.add(s.id);
    }
  }
  const planeIds = new Set(out.filter(isPlane).map((p) => p.id));
  return out.filter((n) => isPlane(n) || planeIds.has(n.parent));
}

const pathOut = (path: ZonePath): Array<Record<string, number>> =>
  path.map((p) => {
    const o: Record<string, number> = { x: round(p.x), y: round(p.y) };
    if (p.inX || p.inY) {
      o.inX = round(p.inX ?? 0);
      o.inY = round(p.inY ?? 0);
    }
    if (p.outX || p.outY) {
      o.outX = round(p.outX ?? 0);
      o.outY = round(p.outY ?? 0);
    }
    return o;
  });

/** Knoten für die Zonendatei: Ebenen von vorn nach hinten, dahinter ihre Formen in Zeichenreihenfolge; gerundet */
export function serializeNodes(nodes: readonly ZoneNode[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const p of planesOf(nodes)) {
    const o: Record<string, unknown> = { id: p.id, kind: 'plane', name: p.name, z: round(p.z, 3), x: round(p.x, 3), y: round(p.y, 3), scale: round(p.scale, 5), role: p.role };
    if (p.hidden) o.hidden = true;
    if (p.locked) o.locked = true;
    out.push(o);
  }
  for (const p of planesOf(nodes)) {
    for (const s of shapesOf(nodes, p.id)) {
      const o: Record<string, unknown> = { id: s.id, kind: 'shape', parent: s.parent, order: round(s.order, 4), name: s.name, x: round(s.x, 3), y: round(s.y, 3), sx: round(s.sx, 4), sy: round(s.sy, 4), fill: s.fill, path: pathOut(s.path) };
      if (s.holes?.length) o.holes = s.holes.map(pathOut);
      if (s.hidden) o.hidden = true;
      if (s.locked) o.locked = true;
      out.push(o);
    }
  }
  return out;
}

/** tiefe Kopie (für den Arbeitsverlauf und das Sichern) */
export function cloneNodes(nodes: readonly ZoneNode[]): ZoneNode[] {
  return nodes.map((n) => (isPlane(n) ? { ...n } : { ...n, path: n.path.map((p) => ({ ...p })), ...(n.holes ? { holes: n.holes.map((h) => h.map((p) => ({ ...p }))) } : {}) }));
}
