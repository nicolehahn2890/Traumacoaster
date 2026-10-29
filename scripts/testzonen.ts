/**
 * Testszenen für den Zonen-Editor (Florian, 27.10.2026: „2–3 Testszenen mit organischen verschachtelten Ebenen, dann muss
 * ich nicht immer alles selbst erstellen“). Drei Zonen nur aus Formen auf Ebenen, nach den Referenzen gebaut:
 *
 * - test-huegel: Hügelwellen in drei spielbaren Tiefen vor See und Bergen (Baukasten-Szenen 01 und 02, Visuals 14, 50, 52)
 * - test-grotte: Felsmassiv mit Höhlenmund, dahinter verschachtelte Bögen bis zur Höhlenwand (Baukasten 03, 05, 06, 10,
 *   Montagen „Wald und Grotte“ und „Große Bögen“)
 * - test-boegen: Plateau auf Bögen über einer Unterwelt, Überhang, schwebende Insel, Wasserfall (Visuals 21, 27, 31, 33, 35,
 *   Baukasten 07 und 09)
 * - tor-s5: Tor S5 (Stufe 5), ein Satz Körper im Earle-Look: Wiese, Bogen, Baum (Earles Favoriten 01, 03, 05, Florians
 *   Bilder 6 bis 8, Baukasten 05 und 06, Visuals 14 und 43); die Earle-Vorgaben liegen schon auf den Formen. Vorschlag:
 *   Formen, Farben und die Wahl der Vorgaben sind nicht festgelegt
 *
 * Platzhalter: alle Formen, Farben, Tiefen; Testgrundlage, kein Inhalt (Tor S4 baut Szene 06 eigens nach). Jede Ebene ist
 * mit „Bild halten“ so gesetzt, dass sie in der Startansicht des Editors (ganze Zonenbreite) aussieht wie hier gezeichnet:
 * Formen in Bildkoordinaten der Spur-0-Ebene.
 *
 *   npx tsx scripts/testzonen.ts [zone …]     (ohne Namen alle Zonen)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPath, flattenPath, smoothPath, translatePath, type Poly, type ZonePath } from '../src/zone/path';
import { holdPicture, LIGHT_DEFAULT, swatchMap, type HoldView, type Material, type PlaneRole, type ZoneAir, type ZoneFieldNode, type ZoneGroup, type ZoneNode, type ZonePlane, type ZoneShape, type ZoneStationNode } from '../src/zone/nodes';
import { earleShape, type EarlePreset } from '../src/zone/earle';
import type { DotsFill, GradientFill, ZoneSwatch } from '../src/zone/paint';
import { dockEdges, stationOf } from '../src/zone/dock';
import { emptyZone, parseZone, serializeZone } from '../src/zone/types';
import { DEFAULT_CAMERA_TILT } from '../src/track/stage';

type Pt = [number, number];

// ------------------------------------------------------------------ Palette (gemeinsam, je Zone als Palettenfelder)

const PALETTE: Array<[string, string]> = [
  ['Wiese hell', '#cfe05c'],
  ['Wiese', '#8fc24a'],
  ['Wiese dunkel', '#4f8f3c'],
  ['Wald', '#2c6650'],
  ['Sandstein hell', '#f4e7c8'],
  ['Sandstein', '#e3c995'],
  ['Ocker', '#c99b5c'],
  ['Fels blau hell', '#b6cee0'],
  ['Fels blau', '#6f9cc4'],
  ['Fels blau tief', '#3a6396'],
  ['Höhle tief', '#1c3866'],
  ['Wasser', '#3fc2c4'],
  ['Wasser hell', '#aaece4'],
  ['Schnee', '#f6f8fc'],
  ['Berg Schatten', '#8fa8d8'],
  ['Berg', '#5873b0'],
  ['Wolke', '#fff8ea'],
  ['Busch', '#2d5739'],
  ['Gold', '#e2cf5e'],
  ['Wiese fern', '#9cc18a'],
  ['Dunst', '#c9d8ee'],
];
const C = Object.fromEntries(PALETTE.map(([name], i) => [name, `@c${i + 1}`])) as Record<string, string>;

// ------------------------------------------------------------------ Formen

let seed = 7;
const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** organischer Umriss um (cx, cy): n Punkte auf einer Ellipse, Radius um ±wob verwackelt */
function blob(cx: number, cy: number, rx: number, ry: number, n = 10, wob = 0.1, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const k = 1 + (rnd() * 2 - 1) * wob;
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** Band: Oberkante durch die Punkte (links nach rechts), unten bis bottom */
const band = (top: Pt[], bottom = -70): Pt[] => [[top[0][0], bottom], ...top, [top[top.length - 1][0], bottom]];

/** Streifen unter einer Oberkante (Earles Bänder): von d0 bis d1 Meter darunter */
const stripe = (top: Pt[], d0: number, d1: number): Pt[] => [...top.map(([x, y]): Pt => [x, y - d0]), ...[...top].reverse().map(([x, y]): Pt => [x, y - d1])];

/** Punkte um (cx, cy) strecken */
const grow = (pts: Pt[], cx: number, cy: number, kx: number, ky = kx): Pt[] => pts.map(([x, y]) => [cx + (x - cx) * kx, cy + (y - cy) * ky]);

interface Grad {
  stops: Array<[string, number]>;
  from: Pt;
  to: Pt;
  radial?: boolean;
  opacity?: number;
}

interface ShapeSpec {
  name: string;
  outline: Pt[];
  holes?: Pt[][];
  fill: string;
  grad?: Grad;
  material?: Material;
  opacity?: number;
  /** Earle-Vorgabe der Form, wenn die Szene Earle trägt (sonst „Automatisch“ wie der Knopf; none: keine) */
  earle?: EarlePreset | 'auto' | 'none';
  /** Nachschliff nach der Earle-Vorgabe (Werte der Schichten), wie von Hand in der Wertezeile */
  look?: (shape: ZoneShape) => void;
}

interface PlaneSpec {
  name: string;
  z: number;
  role: PlaneRole;
  shapes: ShapeSpec[];
  group?: string;
  /** Anteil der Luftperspektive (Höhlen ohne) */
  air?: number;
}

interface SceneSpec {
  name: string;
  groups: string[];
  planes: PlaneSpec[];
  station: { plane: string; x: number };
  /** Earle-Look schon in der Datei (Knopf „Earle“ je Form, Licht der Zone wie vorgegeben) */
  earle?: boolean;
  /** Name des Felds */
  field?: string;
  /** eigene Palettenfelder der Szene (nach den gemeinsamen, Kennungen ab c22) */
  swatches?: Array<[string, string]>;
}

/** Umriss gegen den Uhrzeigersinn (y nach oben, wie presetPath), Löcher mit ihm */
function oriented(pts: Pt[], ccw: boolean): Pt[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a > 0 === ccw ? pts : [...pts].reverse();
}

/**
 * lange Strecken (Ränder, Seiten, Horizont) vor dem Glätten unterteilen: Catmull-Rom wölbt sonst eine 100 m lange Gerade
 * zwischen zwei Ecken um Meter auf (die Oberkante der hinteren Bögen ragte so über das Plateau)
 */
function densify(pts: Pt[], longer = 30, step = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= longer) continue;
    const n = Math.ceil(len / step);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

function makeShape(spec: ShapeSpec, id: string, parent: string, order: number): ZoneShape {
  const outline = smoothPath(densify(oriented(spec.outline, true)) as Poly);
  const holes = (spec.holes ?? []).map((h) => smoothPath(densify(oriented(h, false)) as Poly));
  // Ursprung in die Mitte der Form, damit Griffe und Spiegeln im Editor um die Mitte arbeiten
  const poly = flattenPath(outline);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const cx = round((Math.min(...xs) + Math.max(...xs)) / 2);
  const cy = round((Math.min(...ys) + Math.max(...ys)) / 2);
  const local = (p: ZonePath): ZonePath => cleanPath(translatePath(p, -cx, -cy), 2);
  const shape: ZoneShape = { id, kind: 'shape', parent, order, name: spec.name, x: cx, y: cy, sx: 1, sy: 1, path: local(outline), fill: spec.fill, material: spec.material ?? 'dig' };
  if (holes.length) shape.holes = holes.map(local);
  if (spec.opacity !== undefined) shape.opacity = spec.opacity;
  if (spec.grad) {
    const g = spec.grad;
    const fill: GradientFill = {
      type: 'gradient',
      blend: 'normal',
      opacity: g.opacity ?? 1,
      stops: g.stops.map(([color, t]) => ({ t, color, a: 1 })),
      x0: round(g.from[0] - cx),
      y0: round(g.from[1] - cy),
      x1: round(g.to[0] - cx),
      y1: round(g.to[1] - cy),
    };
    if (g.radial) fill.radial = true;
    shape.fills = [fill];
  }
  return shape;
}

const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Kamera, für die die Bilder stimmen: der Startblick auf das Feld (Kamera.fitBounds mit 2 % Rand, 1280 × 800 px;
 * auf größeren Fenstern ist der Abstand etwas kleiner, die Ebenen verschieben sich dann leicht gegeneinander)
 */
const fieldView = (): HoldView => {
  const zoom = Math.min((1280 * 0.96) / (FIELD.x1 - FIELD.x0), (800 * 0.96) / (FIELD.y1 - FIELD.y0));
  return { cx: (FIELD.x0 + FIELD.x1) / 2, cy: (FIELD.y0 + FIELD.y1) / 2, D: 800 / 2 / zoom / Math.tan((18 * Math.PI) / 360), tilt: DEFAULT_CAMERA_TILT };
};

function build(scene: SceneSpec): ZoneNode[] {
  const nodes: ZoneNode[] = [];
  [...PALETTE, ...(scene.swatches ?? [])].forEach(([name, color], i) => nodes.push({ id: `c${i + 1}`, kind: 'swatch', name, color } satisfies ZoneSwatch));
  const air: ZoneAir = { id: 'air', kind: 'air', color: '#d8ebf6', near: 15, far: 130, amount: 0.55 };
  nodes.push(air);
  const groupIds = new Map<string, string>();
  scene.groups.forEach((name, i) => {
    const g: ZoneGroup = { id: `g${i + 1}`, kind: 'group', name };
    groupIds.set(name, g.id);
    nodes.push(g);
  });
  const view = fieldView();
  const planeIds = new Map<string, string>();
  let shapeNo = 0;
  const looks: Array<[ZoneShape, EarlePreset | 'auto' | 'none', ShapeSpec['look']]> = [];
  // vorne zuerst (die Liste zeigt die Ebenen nach Tiefe; die Reihenfolge hier ist nur für die Kennungen)
  [...scene.planes]
    .sort((a, b) => a.z - b.z)
    .forEach((spec, i) => {
      const plane: ZonePlane = { id: `p${i + 1}`, kind: 'plane', parent: null, name: spec.name, z: 0, x: 0, y: 0, scale: 1, role: spec.role };
      holdPicture(plane, 0, spec.z, view);
      plane.x = round(plane.x, 3);
      plane.y = round(plane.y, 3);
      plane.scale = round(plane.scale, 5);
      if (spec.group) plane.group = groupIds.get(spec.group);
      if (spec.air !== undefined) plane.air = spec.air;
      planeIds.set(spec.name, plane.id);
      nodes.push(plane);
      spec.shapes.forEach((s, k) => {
        const shape = makeShape(s, `s${++shapeNo}`, plane.id, k + 1);
        nodes.push(shape);
        if (scene.earle && spec.role !== 'air') looks.push([shape, s.earle ?? 'auto', s.look]);
      });
    });
  // Earle-Look wie der Knopf „Earle“ je Form (Luft-Ebenen nicht), mit dem vorgegebenen Licht der Zone
  const sw = swatchMap(nodes);
  for (const [shape, preset, look] of looks) {
    if (preset !== 'none') earleShape(shape, null, preset, sw, LIGHT_DEFAULT);
    look?.(shape);
  }
  const st = planeIds.get(scene.station.plane);
  if (!st) throw new Error(`Station: Ebene ${scene.station.plane} fehlt`);
  nodes.push({ id: 'station', kind: 'station', parent: st, x: scene.station.x, dir: 1, length: 14 } satisfies ZoneStationNode);
  nodes.push({ id: 'f1', kind: 'field', name: scene.field ?? 'Test', ...FIELD } satisfies ZoneFieldNode);
  return nodes;
}

// ------------------------------------------------------------------ Bausteine der Kulisse

function mountains(peaks: Array<[number, number]>, x0 = -60, x1 = 220, base = -20): ShapeSpec[] {
  const out: ShapeSpec[] = [];
  const ridge: Pt[] = [[x0, base], [x0, base + 18]];
  for (const [px, py] of peaks) ridge.push([px - 26, py - 26], [px - 9, py - 6], [px, py], [px + 10, py - 8], [px + 28, py - 28]);
  ridge.push([x1, base + 14], [x1, base]);
  const top = Math.max(...peaks.map((p) => p[1]));
  out.push({ name: 'Berge', outline: ridge, fill: C['Berg Schatten'], material: 'solid', grad: { stops: [[C['Berg'], 0], [C['Berg Schatten'], 0.45], [C['Dunst'], 1]], from: [0, top], to: [0, top - 30] } });
  peaks.forEach(([px, py], i) =>
    out.push({ name: `Schnee ${i + 1}`, outline: [[px - 10, py - 7], [px - 4, py - 2.5], [px, py + 0.3], [px + 5, py - 3], [px + 11, py - 8], [px + 6, py - 6.5], [px + 2, py - 9], [px - 3, py - 6], [px - 6, py - 8.5]], fill: C['Schnee'], material: 'solid' }),
  );
  return out;
}

/** ferne Hügel vor den Bergen (Kulisse): Band in Dunstgrün */
const farHills = (top: Pt[]): ShapeSpec => ({ name: 'Hügel fern', outline: band(top, -30), fill: C['Wiese fern'], material: 'solid', grad: { stops: [[C['Wiese fern'], 0], [C['Wiese'], 1]], from: [0, Math.max(...top.map((p) => p[1]))], to: [0, Math.max(...top.map((p) => p[1])) - 14] } });

const lake = (horizon: number): ShapeSpec => ({ name: 'See', outline: [[-60, -30], [-60, horizon], [60, horizon + 0.4], [220, horizon], [220, -30]], fill: C['Wasser'], material: 'free', grad: { stops: [[C['Wasser hell'], 0], [C['Wasser'], 1]], from: [0, horizon], to: [0, horizon - 12] } });

const cloud = (cx: number, cy: number, w: number): ShapeSpec => ({
  name: 'Wolke',
  outline: [[cx - w / 2, cy], [cx - w * 0.35, cy + 2.2], [cx - w * 0.12, cy + 3.4], [cx + w * 0.05, cy + 2.4], [cx + w * 0.22, cy + 3.8], [cx + w * 0.42, cy + 2.4], [cx + w / 2, cy + 0.6], [cx + w * 0.3, cy - 0.8], [cx - w * 0.2, cy - 0.6]],
  fill: C['Wolke'],
  material: 'free',
});

const hillGrad = (top: number, light: string, dark: string): Grad => ({ stops: [[light, 0], [dark, 1]], from: [0, top], to: [0, top - 28] });

// ------------------------------------------------------------------ Szenen (Bildkoordinaten im Feld x 0–120, y −10–55)

/** Feld aller drei Szenen: Bildausschnitt beim Start (Kamera auf das Feld) und Rand der Fahrt */
const FIELD = { x0: 0, x1: 120, y0: -10, y1: 55 };

function huegel(): SceneSpec {
  const h1: Pt[] = [[-60, 3], [-30, 4.5], [-10, 5.6], [0, 6], [8, 6], [16, 6], [24, 6.2], [32, 7.4], [42, 10.2], [52, 11.2], [62, 8.6], [72, 6.6], [82, 8.4], [92, 11.6], [104, 9.6], [116, 7.6], [140, 10], [190, 9]];
  const h2: Pt[] = [[-60, 13], [-30, 14.5], [-8, 16.5], [10, 19], [26, 17.4], [44, 21.2], [60, 17], [78, 20.4], [96, 17.8], [114, 21], [140, 18.6], [190, 17]];
  const h3: Pt[] = [[-60, 19], [-30, 21], [-6, 23.6], [14, 26.2], [34, 24.4], [54, 28.4], [74, 25], [94, 27.8], [114, 24.6], [140, 26.4], [190, 24]];
  const bush = (name: string, cx: number, cy: number, rx: number, ry: number): ShapeSpec => ({ name, outline: blob(cx, cy, rx, ry, 11, 0.12), fill: C['Busch'], grad: { stops: [[C['Wiese dunkel'], 0], [C['Busch'], 1]], from: [cx, cy + ry], to: [cx, cy - ry * 0.4] } });
  const tree = (cx: number, base: number, h: number, r: number): ShapeSpec[] => [
    { name: 'Baumstamm', outline: [[cx - 0.5, base - 2], [cx - 0.8, base + h * 0.5], [cx - 1.3, base + h * 0.9], [cx - 0.5, base + h + 0.6], [cx + 0.9, base + h + 0.6], [cx + 1.4, base + h * 0.9], [cx + 0.8, base + h * 0.5], [cx + 0.6, base - 2]], fill: C['Wald'], material: 'airy' },
    { name: 'Baumkrone', outline: blob(cx, base + h + r * 0.45, r, r * 0.46, 12, 0.08), fill: C['Wald'], material: 'airy', grad: { stops: [[C['Wiese dunkel'], 0], [C['Wald'], 1]], from: [cx, base + h + r * 0.9], to: [cx, base + h] } },
  ];
  return {
    name: 'test-huegel',
    groups: ['Hügel', 'Kulisse'],
    station: { plane: 'Hügel 1 vorn', x: 7 },
    planes: [
      { name: 'Vorn Büsche', z: -6, role: 'front', shapes: [bush('Busch links', 2, -12, 13, 9), bush('Busch rechts', 92, -13, 15, 9)] },
      {
        name: 'Hügel 1 vorn',
        z: 4,
        role: 'play',
        group: 'Hügel',
        shapes: [
          { name: 'Hügel 1', outline: band(h1), fill: C['Wiese'], grad: hillGrad(11, C['Wiese hell'], C['Wiese dunkel']) },
          { name: 'Band 1', outline: stripe(h1.slice(1, -1), 5, 8), fill: C['Wiese dunkel'], opacity: 0.35 },
        ],
      },
      {
        name: 'Hügel 2',
        z: 14,
        role: 'play',
        group: 'Hügel',
        shapes: [
          { name: 'Hügel 2', outline: band(h2), fill: C['Gold'], grad: hillGrad(21, C['Gold'], C['Wiese']) },
          { name: 'Band 2', outline: stripe(h2.slice(1, -1), 4, 6), fill: C['Wiese'], opacity: 0.45 },
          ...tree(78, 20.4, 7, 7.5),
        ],
      },
      {
        name: 'Hügel 3',
        z: 26,
        role: 'play',
        group: 'Hügel',
        shapes: [
          { name: 'Hügel 3', outline: band(h3), fill: C['Wiese'], grad: hillGrad(28, C['Wiese hell'], C['Wiese fern']) },
          ...tree(34, 24.4, 4.5, 4.6),
        ],
      },
      { name: 'See', z: 60, role: 'backdrop', group: 'Kulisse', shapes: [lake(36)] },
      { name: 'Wolke', z: 80, role: 'air', group: 'Kulisse', shapes: [cloud(70, 50, 28)] },
      { name: 'Hügel fern', z: 90, role: 'backdrop', group: 'Kulisse', shapes: [farHills([[-60, 37], [-20, 39.5], [12, 41.2], [40, 39], [66, 42], [96, 40], [130, 41.6], [190, 39]])] },
      { name: 'Berge', z: 120, role: 'backdrop', group: 'Kulisse', shapes: mountains([[24, 51], [88, 48]]) },
    ],
  };
}

function grotte(): SceneSpec {
  // Felsmassiv mit Höhlenmund; die Bögen dahinter sind das Massiv, verkleinert um die Mitte des Munds, mit kleineren,
  // versetzten Öffnungen (verschachtelt wie die Ringe der Baukasten-Szenen 05 und 06)
  const M: Pt = [64, 15];
  const top: Pt[] = [[24, 8], [27, 17], [32, 26], [39, 34], [50, 40], [63, 42.4], [76, 41.4], [88, 43.4], [100, 39.6], [108, 31], [112, 21], [114, 11]];
  const massif: Pt[] = [[21, -70], [22, -14], [23, 0], ...top, [116, 0], [118, -14], [120, -70]];
  const mouth: Pt[] = [[38, 10], [40, 21], [46, 28.6], [56, 32.6], [68, 33.4], [79, 31], [87, 24.5], [91, 15], [90, 5.5], [84.5, -0.6], [72, -3], [58, -3.2], [46, -1.2], [39.2, 3.2]];
  const grass: Pt[] = [...top.slice(1, -1).map(([x, y]): Pt => [x, y + 1.2]), ...top.slice(1, -1).reverse().map(([x, y], i): Pt => [x + (i % 2 ? 0.8 : -0.6), y - 3.4])];
  const inner = (k: number): Pt[] => grow(massif, M[0], M[1], k);
  const hole = (k: number, dx: number, dy: number): Pt[] => grow(mouth, M[0], M[1], k).map(([x, y]): Pt => [x + dx + (rnd() - 0.5) * 1.2, y + dy + (rnd() - 0.5) * 1.2]);
  const floor: Pt[] = [[26, 3], [38, 4], [48, 6], [56, 5], [64, 7], [72, 5.6], [82, 7.4], [94, 5], [106, 4]];
  // Sandstein in waagrechten Schichten (harte Verlaufsstopps statt eigener Formen)
  const strata: Grad = { stops: [[C['Sandstein hell'], 0], [C['Sandstein hell'], 0.34], [C['Sandstein'], 0.35], [C['Sandstein'], 0.62], [C['Ocker'], 0.63], [C['Ocker'], 1]], from: [64, 44], to: [64, -10] };
  return {
    name: 'test-grotte',
    groups: ['Grotte', 'Kulisse'],
    station: { plane: 'Fels vorn', x: 6 },
    planes: [
      { name: 'Vorn Farn', z: -6, role: 'front', shapes: [{ name: 'Farn', outline: blob(2, -10, 12, 8, 11, 0.14), fill: C['Busch'], grad: { stops: [[C['Wiese dunkel'], 0], [C['Busch'], 1]], from: [2, -2], to: [2, -14] } }] },
      {
        name: 'Wasserfall',
        z: 2,
        role: 'air',
        shapes: [
          { name: 'Wasserfall', outline: [[93.4, 41.4], [96.4, 41.8], [97, 26], [98.2, 8], [99.4, -12], [93.8, -12], [93.2, 8], [92.8, 26]], fill: C['Wasser hell'], material: 'free', opacity: 0.92, grad: { stops: [[C['Wasser hell'], 0], [C['Wasser'], 1]], from: [95, 38], to: [95, -10] } },
          { name: 'Gischt', outline: blob(96.6, -10, 7, 2.6, 10, 0.15), fill: C['Wolke'], material: 'free', opacity: 0.9 },
        ],
      },
      {
        name: 'Fels vorn',
        z: 6,
        role: 'play',
        group: 'Grotte',
        shapes: [
          { name: 'Wiese links', outline: band([[-60, 5], [-30, 5.8], [-12, 6.6], [0, 7], [6, 7], [14, 7.1], [22, 7.4], [28, 9.4]]), fill: C['Wiese'], grad: hillGrad(9, C['Wiese hell'], C['Wiese dunkel']) },
          { name: 'Fels', outline: massif, holes: [mouth], fill: C['Sandstein hell'], material: 'solid', grad: strata },
          { name: 'Rand', outline: grow(mouth, M[0], M[1], 1.12, 1.14), holes: [mouth], fill: C['Sandstein'], material: 'solid', grad: { stops: [[C['Ocker'], 0.62], [C['Sandstein'], 1]], from: M, to: [M[0] + 30, M[1]], radial: true } },
          { name: 'Grasdecke', outline: grass, fill: C['Wiese'], grad: hillGrad(45, C['Wiese hell'], C['Wiese']) },
        ],
      },
      {
        name: 'Bogen Mitte',
        z: 11,
        role: 'play',
        group: 'Grotte',
        air: 0,
        shapes: [{ name: 'Bogen Mitte', outline: inner(0.9), holes: [hole(0.8, -2, -1.5)], fill: C['Fels blau hell'], material: 'solid', grad: { stops: [[C['Fels blau'], 0.5], [C['Fels blau hell'], 1]], from: [62, 13.5], to: [62 + 30, 13.5], radial: true } }],
      },
      {
        name: 'Bogen tief',
        z: 16,
        role: 'play',
        group: 'Grotte',
        air: 0,
        shapes: [{ name: 'Bogen tief', outline: inner(0.82), holes: [hole(0.62, 2.5, -2.5)], fill: C['Fels blau'], material: 'solid', grad: { stops: [[C['Fels blau tief'], 0.45], [C['Fels blau'], 1]], from: [66.5, 12.5], to: [66.5 + 26, 12.5], radial: true } }],
      },
      {
        name: 'Höhlenboden',
        z: 20,
        role: 'play',
        group: 'Grotte',
        air: 0,
        shapes: [
          { name: 'Höhlenboden', outline: band(floor, -30), fill: C['Fels blau tief'], material: 'solid', grad: { stops: [[C['Fels blau'], 0], [C['Höhle tief'], 1]], from: [0, 7], to: [0, -8] } },
          { name: 'Höhlensee', outline: [[56, 6.2], [60, 6.9], [68, 7], [76, 6.6], [80, 5.9], [76, 3.6], [68, 3], [59, 3.6]], fill: C['Wasser'], material: 'free', grad: { stops: [[C['Wasser hell'], 0], [C['Wasser'], 1]], from: [68, 7], to: [68, 3] } },
        ],
      },
      {
        name: 'Höhlenwand',
        z: 25,
        role: 'play',
        group: 'Grotte',
        air: 0,
        shapes: [{ name: 'Rückwand', outline: inner(0.74), fill: C['Höhle tief'], material: 'solid', grad: { stops: [[C['Fels blau tief'], 0], [C['Höhle tief'], 1]], from: [66, 16], to: [66 + 24, 16], radial: true } }],
      },
      { name: 'See', z: 60, role: 'backdrop', group: 'Kulisse', shapes: [lake(30)] },
      { name: 'Wolke', z: 80, role: 'air', group: 'Kulisse', shapes: [cloud(20, 49, 24)] },
      { name: 'Hügel fern', z: 90, role: 'backdrop', group: 'Kulisse', shapes: [farHills([[-60, 31], [-20, 33.4], [10, 35], [40, 33.6], [80, 36], [120, 34], [190, 33]])] },
      { name: 'Berge', z: 115, role: 'backdrop', group: 'Kulisse', shapes: mountains([[8, 49], [104, 52]]) },
    ],
  };
}

function boegen(): SceneSpec {
  const top: Pt[] = [[-60, 26], [-30, 26.6], [-8, 27], [4, 27], [14, 27.2], [24, 28], [36, 29.2], [50, 28.6], [64, 30], [76, 29.2], [86, 30], [92, 30.8]];
  // rechts der Überhang über dem Abbruch, dann senkrecht hinunter
  const cliff: Pt[] = [[97, 30.6], [99.4, 28.6], [97.6, 25.8], [92, 24.6], [88, 22.4], [86.6, 16], [87, 4], [87.4, -70], [-60, -70]];
  // Bögen als Fenster mit flacher Schwelle (der untere Rand ist eine Andockkante, durch die Öffnung geht der Pinsel nach hinten)
  const win = (x0: number, x1: number, sill: number, h: number): Pt[] => {
    const w = x1 - x0;
    return [[x0, sill + 0.6], [x0 + 0.02 * w, sill + 0.45 * h], [x0 + 0.13 * w, sill + 0.78 * h], [x0 + w / 2, sill + h], [x1 - 0.13 * w, sill + 0.78 * h], [x1 - 0.02 * w, sill + 0.45 * h], [x1, sill + 0.6], [x1 - 0.25 * w, sill], [x0 + 0.25 * w, sill]];
  };
  const grass: Pt[] = [...top.map(([x, y]): Pt => [x, y + 1.1]), [97.6, 31.6], [99.6, 30], ...[...top].reverse().map(([x, y], i): Pt => [x + (i % 2 ? 0.8 : -0.6), y - 3])];
  const floor: Pt[] = [[-60, 2.6], [-24, 3.4], [0, 4.4], [20, 5.2], [40, 4.4], [58, 3.2], [74, 4.6], [90, 5.6], [108, 4.2], [126, 3.2], [190, 3.6]];
  const recess = (x0: number, x1: number, h: number): Pt[] => win(x0, x1, -4, h + 4);
  const strata: Grad = { stops: [[C['Sandstein hell'], 0], [C['Sandstein hell'], 0.2], [C['Sandstein'], 0.21], [C['Sandstein'], 0.5], [C['Ocker'], 0.51], [C['Ocker'], 1]], from: [0, 29], to: [0, -4] };
  return {
    name: 'test-boegen',
    groups: ['Unterwelt', 'Kulisse'],
    station: { plane: 'Plateau', x: 6 },
    planes: [
      { name: 'Vorn Busch', z: -8, role: 'front', shapes: [{ name: 'Busch', outline: blob(6, -9, 12, 7, 11, 0.12), fill: C['Busch'], grad: { stops: [[C['Wiese dunkel'], 0], [C['Busch'], 1]], from: [6, -2], to: [6, -12] } }] },
      {
        name: 'Plateau',
        z: 6,
        role: 'play',
        shapes: [
          { name: 'Plateau', outline: [...top, ...cliff], holes: [win(16, 36, 1, 15.4), win(44, 66, 1, 16.6), win(71, 84, 1.2, 12)], fill: C['Sandstein'], material: 'solid', grad: strata },
          { name: 'Wiese oben', outline: grass, fill: C['Wiese'], grad: hillGrad(31, C['Wiese hell'], C['Wiese']) },
        ],
      },
      {
        name: 'Insel',
        z: 10,
        role: 'play',
        shapes: [
          { name: 'Insel', outline: [[52, 43], [57, 45.6], [65, 46.4], [73, 45.6], [78, 43], [74, 39], [68, 35.8], [62, 36.2], [56, 38.6]], fill: C['Sandstein'], material: 'solid', grad: { stops: [[C['Sandstein'], 0], [C['Ocker'], 1]], from: [65, 45], to: [65, 36] } },
          { name: 'Insel Wiese', outline: [[51.4, 43.2], [57, 46.6], [65, 47.6], [73, 46.6], [78.6, 43.2], [73.6, 43.6], [65, 44.4], [57, 43.8]], fill: C['Wiese hell'] },
        ],
      },
      {
        name: 'Wasserfall',
        z: 12,
        role: 'air',
        shapes: [
          { name: 'Wasserfall', outline: [[89.6, 25], [93, 25], [93.6, 16], [94.4, 5], [88.6, 5], [89.2, 16]], fill: C['Wasser hell'], material: 'free', opacity: 0.92, grad: { stops: [[C['Wasser hell'], 0], [C['Wasser'], 1]], from: [91, 24], to: [91, 5] } },
          { name: 'Gischt', outline: blob(91.6, 5, 5.5, 1.8, 10, 0.15), fill: C['Wolke'], material: 'free', opacity: 0.9 },
        ],
      },
      {
        name: 'Unterwelt Boden',
        z: 14,
        role: 'play',
        group: 'Unterwelt',
        air: 0,
        shapes: [{ name: 'Boden', outline: band(floor), fill: C['Fels blau'], material: 'solid', grad: { stops: [[C['Fels blau hell'], 0], [C['Fels blau tief'], 1]], from: [0, 5], to: [0, -12] } }],
      },
      {
        name: 'Unterwelt Wand',
        z: 24,
        role: 'play',
        group: 'Unterwelt',
        air: 0,
        shapes: [
          { name: 'Wand', outline: band([[-60, 21.4], [-20, 22], [20, 21.6], [60, 22.2], [100, 21.6], [140, 22], [190, 21.6]], -40), fill: C['Fels blau tief'], material: 'solid', grad: { stops: [[C['Fels blau'], 0], [C['Fels blau tief'], 1]], from: [0, 22], to: [0, 4] } },
          { name: 'Nische links', outline: recess(19, 33, 11), fill: C['Höhle tief'], material: 'solid' },
          { name: 'Nische Mitte', outline: recess(46, 62, 13), fill: C['Höhle tief'], material: 'solid' },
          { name: 'Nische rechts', outline: recess(96, 110, 12), fill: C['Höhle tief'], material: 'solid' },
          { name: 'Licht', outline: blob(54, 6, 6, 5, 10, 0.08), fill: C['Fels blau hell'], material: 'solid', opacity: 0.35 },
          { name: 'Licht rechts', outline: blob(103, 5.4, 4.6, 4, 10, 0.08), fill: C['Fels blau hell'], material: 'solid', opacity: 0.3 },
        ],
      },
      { name: 'Hügel fern', z: 75, role: 'backdrop', group: 'Kulisse', shapes: [farHills([[-60, 30], [-20, 32.4], [12, 34], [44, 32.4], [76, 35], [110, 33.2], [190, 32]])] },
      { name: 'Wolke', z: 90, role: 'air', group: 'Kulisse', shapes: [cloud(22, 50, 26)] },
      { name: 'Berge', z: 120, role: 'backdrop', group: 'Kulisse', shapes: mountains([[36, 49], [92, 52]]) },
    ],
  };
}

/** Palettenfelder nur der Szene Tor S5: die Tiefen für mehr Tonwert-Kontrast (Vorschlag) */
const S5_SWATCHES: Array<[string, string]> = [
  ['Wiese tief', '#2e5f2a'],
  ['Ocker tief', '#a8722a'],
  ['Nachtblau', '#14244a'],
  ['Berg tief', '#2f4b8a'],
  ['Creme', '#fbf3dc'],
];
const X = Object.fromEntries(S5_SWATCHES.map(([name], i) => [name, `@c${PALETTE.length + i + 1}`])) as Record<string, string>;

/** Ast als spitz zulaufender Bogen von a nach b: Breite w0 bis w1, Biegung bend (Meter quer zur Richtung, links positiv) */
function branch(a: Pt, b: Pt, w0: number, w1: number, bend: number, n = 6): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bend * 4 * t * (1 - t);
    const cx = a[0] + dx * t + nx * off;
    const cy = a[1] + dy * t + ny * off;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push([cx + nx * w, cy + ny * w]);
    right.push([cx - nx * w, cy - ny * w]);
  }
  return [...left, ...right.reverse()];
}

/** Punkt auf dem Bogen von branch (Mittellinie) bei t */
function along(a: Pt, b: Pt, bend: number, t: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const off = bend * 4 * t * (1 - t);
  return [a[0] + dx * t + (-dy / len) * off, a[1] + dy * t + (dx / len) * off];
}

/** Nachschliff: der Verlauf der Vorgabe wird zum Kantenverlauf (Bänder folgen dem Umriss, geschwungen), depth in Metern */
const contourBands = (depth: number, steps: number, wave: number) => (s: ZoneShape): void => {
  const g = [...(s.fills ?? [])].reverse().find((f): f is GradientFill => f.type === 'gradient' && !f.edge);
  if (!g) return;
  const x = Math.min(g.x0, g.x1);
  Object.assign(g, { edge: true, steps, inner: 0.3, wave, x0: x, y0: g.y1, x1: x + depth / Math.abs(s.sx), y1: g.y1 });
};

/** Nachschliff: Pünktchen dichter und feiner (Bild 8: dichte Punktbänder an den Kanten) */
const denseDots = (o: Partial<DotsFill>) => (s: ZoneShape): void => {
  for (const f of s.fills ?? []) if (f.type === 'dots') Object.assign(f, o);
};

/** Nachschliff: Innenschatten kräftiger */
const deeperShade = (opacity: number) => (s: ZoneShape): void => {
  for (const f of s.fills ?? []) if (f.type === 'shade') f.opacity = opacity;
};

/**
 * Tor S5 (Stufe 5): ein Satz Körper im Earle-Look. Vorn eine Wiese mit der Station, in der Mitte eine goldgrüne Wiese mit
 * einem großen Baum (Stamm, vier Äste und feine Zweige unter einer Schirmkrone mit Punktkrone: Florians Bild 6, Earle 03),
 * rechts ein Felsbogen aus Sandstein mit Grasdecke, innen schräg verzogene Ringe in Blau und Creme bis ins Nachtblau mit
 * dichten Kantenpünktchen (Bild 8, Baukasten 05 und 06), durch ihn eine helle Wiese mit Baumgruppen, dahinter dunklere
 * Hügel, blaue Berge und eine Wolke. Die Wiesenbänder folgen dem Umriss, dazu S-förmige Bänder (Bild 7). Nachgeschärft auf
 * Florians Wunsch (29.10.2026): mehr Tonwert-Kontrast, dichtere Kantenpünktchen, geschwungenere Bänder, feinere Äste.
 * Vorschlag: Formen, Farben, die Wahl der Vorgaben und der Nachschliff sind nicht festgelegt
 */
function torS5(): SceneSpec {
  const front: Pt[] = [[-60, 3], [-24, 4.6], [-4, 6], [6, 6.2], [14, 6.6], [24, 8.6], [34, 12], [44, 12.4], [56, 9.2], [68, 8], [80, 10.6], [92, 13], [104, 11], [116, 8.6], [140, 9.4], [190, 9]];
  const mid: Pt[] = [[-60, 12], [-24, 13.6], [0, 15.6], [14, 17.6], [26, 18.2], [38, 16.6], [50, 19.6], [62, 21], [74, 18], [86, 17.2], [98, 19.8], [110, 21.4], [124, 18.6], [190, 17]];
  const back: Pt[] = [[-60, 20], [-20, 21.6], [10, 23.4], [36, 22.6], [58, 25.2], [76, 23.8], [92, 26], [112, 24.4], [140, 25.6], [190, 24]];
  /** Schirmkrone: gewölbt oben, flacher, leicht gewellter Boden (Bild 6) */
  const dome = (cx: number, y0: number, rx: number, ry: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const k = 1 + (rnd() * 2 - 1) * 0.05;
      out.push([cx + Math.cos(a) * rx * k, y0 + Math.sin(a) * ry * k]);
    }
    out.push([cx - rx * 0.8, y0 - ry * 0.12], [cx - rx * 0.45, y0 - ry * 0.2], [cx - rx * 0.1, y0 - ry * 0.14], [cx + rx * 0.3, y0 - ry * 0.22], [cx + rx * 0.7, y0 - ry * 0.12]);
    return out;
  };
  // Baum: Stamm bis zur Gabel, vier Äste, an jedem ein bis zwei feine Zweige bis in die Krone (Bild 6)
  const trunk: Pt[] = [[24.2, 14.6], [24.8, 19], [24.9, 23.6], [24.6, 26.4], [25.4, 27.8], [26.8, 27.8], [27.6, 26.2], [27.2, 23.6], [27.2, 19], [28.2, 14.6]];
  const limbs: Array<[Pt, Pt, number, number, number]> = [
    [[25, 26.4], [11, 34.6], 1.5, 0.35, 1.2],
    [[25.6, 27], [19, 35.4], 1.2, 0.3, 0.6],
    [[26.6, 27], [32, 35.6], 1.2, 0.3, -0.6],
    [[27.2, 26.4], [41.5, 34.4], 1.5, 0.35, -1.2],
  ];
  const twigs: Array<[number, number, Pt, number]> = [
    [0, 0.45, [15.2, 35.6], 0.4],
    [0, 0.75, [8.6, 34.4], -0.3],
    [1, 0.5, [22.8, 36], -0.3],
    [2, 0.5, [28.4, 36], 0.3],
    [3, 0.45, [37.4, 35.8], -0.4],
    [3, 0.75, [44, 34.6], 0.3],
    [1, 0.3, [16.4, 33.2], 0.2],
    [2, 0.3, [35.6, 33.4], -0.2],
  ];
  const navy = { fill: X['Nachtblau'], material: 'airy' as Material, earle: 'none' as const };
  const tree: ShapeSpec[] = [
    // (flach wie die Äste: ein Kantenring auf dem Stamm zeichnete an der Gabel eine helle Naht)
    { name: 'Stamm', outline: trunk, ...navy },
    ...limbs.map(([a, b, w0, w1, bend], i): ShapeSpec => ({ name: `Ast ${i + 1}`, outline: branch(a, b, w0, w1, bend), ...navy })),
    ...twigs.map(([k, t, end, bend], i): ShapeSpec => {
      const [a, b, , , lb] = limbs[k];
      return { name: `Zweig ${i + 1}`, outline: branch(along(a, b, lb, t), end, 0.38, 0.12, bend, 5), ...navy };
    }),
    { name: 'Krone', outline: dome(26, 35, 18, 11), fill: C['Wiese'], material: 'airy', grad: { stops: [[C['Wiese hell'], 0], [C['Wiese'], 0.45], [X['Wiese tief'], 1]], from: [26, 46], to: [26, 33] }, earle: 'crown', look: deeperShade(0.7) },
  ];
  // Felsbogen: außen heller Sandstein mit Grasdecke; innen Ringe in Hellblau, Creme und Nachtblau, schräg verzogen
  // (oben nach rechts geneigt), damit die Bänder ungleich breit schwingen wie in Bild 8
  const archTop: Pt[] = [[55.4, 20], [58.6, 29.6], [64.4, 37.6], [72.6, 43], [82, 46], [92.6, 46.6], [101.6, 44], [108.6, 38.4], [112.8, 30], [114.6, 20]];
  const archOuter: Pt[] = [[54, -40], [55.6, 0], [54.4, 10], ...archTop, [115, 8], [116, -40]];
  const archGrass: Pt[] = [...archTop.slice(1, -1).map(([x, y]): Pt => [x, y + 0.9]), ...archTop.slice(1, -1).reverse().map(([x, y], i): Pt => [x + (i % 2 ? 0.6 : -0.5), y - 2.8])];
  const archHole: Pt[] = [[69.6, 4], [69.2, 14], [70.8, 22.8], [74.8, 29.6], [81, 33.8], [88.4, 35.4], [95.6, 33.6], [100.4, 27.8], [102.6, 19.4], [102.8, 9.4], [102, 3], [86, 2.2], [74, 2.8]];
  const M: Pt = [86.5, 18];
  const at = (pts: Pt[], k: number, dx: number, dy: number, ky = k): Pt[] => grow(pts, M[0], M[1], k, ky).map(([x, y]): Pt => [x + dx, y + dy]);
  const lean = (pts: Pt[], k: number): Pt[] => pts.map(([x, y]): Pt => [x + (y - M[1]) * k, y]);
  const rockDots = denseDots({ density: 1, gap: 1.3, size: 0.16, reach: 2.8, jitter: 0.45, tone: 0.6 });
  // (die Ringe sind schmal: die Punkte bleiben an ihren Kanten, die Mitte der Bänder bleibt frei)
  const ringDots = denseDots({ density: 1, gap: 1.3, size: 0.15, reach: 1.1, jitter: 0.45, tone: 0.6 });
  const grove = (cx: number, cy: number, rx: number, ry: number): ShapeSpec => ({ name: 'Baumgruppe', outline: blob(cx, cy, rx, ry, 11, 0.1), fill: C['Wald'], material: 'airy', grad: { stops: [[C['Wiese dunkel'], 0], [X['Wiese tief'], 1]], from: [cx, cy + ry], to: [cx, cy - ry] }, earle: 'crown' });
  // S-förmige Bänder in den Wiesen (Bild 7), ganz unter der Oberkante
  const swoosh = (pts: Pt[], d: number): Pt[] => stripe(pts, 0, d);
  return {
    name: 'tor-s5',
    groups: ['Wiese', 'Bogen', 'Kulisse'],
    station: { plane: 'Wiese vorn', x: 7 },
    earle: true,
    field: 'Tor S5 (Vorschlag)',
    swatches: S5_SWATCHES,
    planes: [
      { name: 'Vorn Busch', z: -6, role: 'front', shapes: [{ name: 'Busch', outline: blob(106, -11, 14, 8, 11, 0.12), fill: C['Busch'], material: 'airy', grad: { stops: [[C['Wiese dunkel'], 0], [X['Wiese tief'], 1]], from: [106, -3], to: [106, -15] }, earle: 'crown', look: deeperShade(0.7) }] },
      {
        name: 'Wiese vorn',
        z: 4,
        role: 'play',
        group: 'Wiese',
        shapes: [
          { name: 'Wiese vorn', outline: band(front), fill: C['Wiese'], grad: { stops: [[C['Wiese hell'], 0], [C['Wiese'], 0.4], [X['Wiese tief'], 1]], from: [0, 13], to: [0, -10] }, earle: 'hill', look: contourBands(14, 5, 0.7) },
          { name: 'Band vorn', outline: swoosh([[30, 4.4], [44, 7], [58, 5.2], [72, 3.4], [86, 5], [100, 7.2], [114, 5.4], [130, 4.6]], 2.6), fill: X['Wiese tief'], opacity: 0.55, earle: 'none' },
        ],
      },
      {
        name: 'Wiese Mitte',
        z: 12,
        role: 'play',
        group: 'Wiese',
        shapes: [
          { name: 'Wiese Mitte', outline: band(mid), fill: C['Gold'], grad: { stops: [[C['Gold'], 0], [C['Ocker'], 0.5], [X['Ocker tief'], 1]], from: [0, 21], to: [0, 4] }, earle: 'hill', look: contourBands(10, 4, 0.7) },
          { name: 'Band Mitte', outline: swoosh([[40, 14.6], [52, 16.2], [64, 14.6], [76, 12.6], [88, 13.2], [100, 15.4], [114, 14], [130, 13.4]], 2.2), fill: X['Ocker tief'], opacity: 0.5, earle: 'none' },
          ...tree,
        ],
      },
      {
        name: 'Bogen',
        z: 22,
        role: 'play',
        group: 'Bogen',
        shapes: [
          { name: 'Bogen', outline: archOuter, holes: [archHole], fill: C['Sandstein hell'], material: 'solid', grad: { stops: [[X['Creme'], 0], [C['Sandstein'], 0.5], [C['Ocker'], 1]], from: [86, 46], to: [86, 0] }, earle: 'rock', look: rockDots },
          { name: 'Grasdecke', outline: archGrass, fill: C['Wiese'], grad: hillGrad(47, C['Wiese hell'], C['Wiese dunkel']), earle: 'meadow' },
        ],
      },
      {
        name: 'Bogen Ring 1',
        z: 25,
        role: 'play',
        group: 'Bogen',
        shapes: [{ name: 'Ring hellblau', outline: at(archHole, 1.1, 0, 0, 1.06), holes: [lean(at(archHole, 0.78, 2, 0.4, 0.76), 0.1)], fill: C['Fels blau'], material: 'solid', grad: { stops: [[C['Fels blau hell'], 0], [C['Fels blau'], 0.5], [C['Fels blau tief'], 1]], from: [86, 36], to: [86, 2] }, earle: 'rock', look: ringDots }],
      },
      {
        name: 'Bogen Creme',
        z: 27,
        role: 'play',
        group: 'Bogen',
        shapes: [{ name: 'Band Creme', outline: lean(at(archHole, 0.8, 2, 0.4, 0.78), 0.1), holes: [lean(at(archHole, 0.63, 3.6, 0.6, 0.61), 0.2)], fill: X['Creme'], material: 'solid', earle: 'rock', look: ringDots }],
      },
      {
        name: 'Bogen Ring 2',
        z: 29,
        role: 'play',
        group: 'Bogen',
        shapes: [{ name: 'Ring Nachtblau', outline: lean(at(archHole, 0.65, 3.6, 0.6, 0.63), 0.2), holes: [lean(at(archHole, 0.46, 5.4, 0.8, 0.44), 0.3)], fill: X['Nachtblau'], material: 'solid', grad: { stops: [[C['Höhle tief'], 0], [X['Nachtblau'], 1]], from: [88, 30], to: [88, 4] }, earle: 'rock', look: ringDots }],
      },
      {
        name: 'Wiese hinten',
        z: 40,
        role: 'backdrop',
        group: 'Kulisse',
        shapes: [
          { name: 'Wiese hinten', outline: band(back, -30), fill: C['Wiese hell'], grad: hillGrad(26, C['Wiese hell'], C['Wiese']), earle: 'meadow' },
          grove(44, 23.2, 3.2, 2.6),
          grove(50.4, 24.4, 2.6, 2.2),
          grove(85, 25.6, 3, 2.4),
          grove(95.5, 26.6, 2.4, 2),
        ],
      },
      // (Kulisse näher als in den Testzonen: der Nebel der Welt beginnt 24 m hinter der Bühne und deckt bei 140 m ganz, die
      // Berge bei 120 m waren darin fast weiß)
      { name: 'Wolke', z: 65, role: 'air', group: 'Kulisse', shapes: [cloud(40, 51, 24)] },
      { name: 'Hügel fern', z: 55, role: 'backdrop', group: 'Kulisse', air: 0.45, shapes: [{ ...farHills([[-60, 30], [-20, 32], [12, 33.6], [44, 32], [76, 34.4], [110, 33], [190, 32]]), fill: C['Wiese dunkel'], grad: { stops: [[C['Wiese'], 0], [C['Wiese dunkel'], 1]], from: [0, 34.4], to: [0, 22] }, earle: 'meadow' }] },
      {
        name: 'Berge',
        z: 70,
        role: 'backdrop',
        group: 'Kulisse',
        air: 0.25,
        shapes: mountains([[64, 50], [118, 47]]).map((s): ShapeSpec => (s.name === 'Berge' ? { ...s, fill: X['Berg tief'], grad: { stops: [[X['Berg tief'], 0], [C['Berg'], 0.55], [C['Berg Schatten'], 1]], from: [0, 50], to: [0, 20] }, earle: 'hill' } : { ...s, earle: 'meadow' })),
      },
    ],
  };
}

// ------------------------------------------------------------------ schreiben und prüfen

// alle Szenen bauen (der Zufall läuft in dieser Reihenfolge), nur die genannten schreiben
const only = process.argv.slice(2);
for (const scene of [huegel(), grotte(), boegen(), torS5()].filter((s) => !only.length || only.includes(s.name))) {
  seed = 7;
  const nodes = build(scene);
  // das Feld als Feldknoten (Zonen-Editor) und als Spiegel in den Feldern der Zonendatei (Klötzchen-Editor)
  const zone = { ...emptyZone(scene.name, FIELD.x1 - FIELD.x0, 'steel'), fields: [{ id: 'f1', name: scene.field ?? 'Test', ...FIELD }], nodes };
  const text = serializeZone(zone);
  const back = parseZone(JSON.parse(text));
  if (!back || (back.nodes?.length ?? 0) !== nodes.length) throw new Error(`${scene.name}: Zonendatei liest sich nicht zurück (${back?.nodes?.length} von ${nodes.length} Knoten)`);
  const edges = dockEdges(back.nodes!);
  const perPlane = new Map<string, number>();
  for (const e of edges) perPlane.set(e.plane, (perPlane.get(e.plane) ?? 0) + 1);
  const station = stationOf(back.nodes!);
  if (!station) throw new Error(`${scene.name}: Station steht auf keiner Andockkante`);
  const dir = join(process.cwd(), 'public', 'zones', scene.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'zone.json'), text.endsWith('\n') ? text : text + '\n');
  const planes = back.nodes!.filter((n): n is ZonePlane => n.kind === 'plane');
  const shapes = back.nodes!.filter((n) => n.kind === 'shape').length;
  console.log(`${scene.name}: ${planes.length} Ebenen, ${shapes} Formen, Station x ${station.x.toFixed(1)} y ${station.y.toFixed(1)} Spur ${station.z.toFixed(2)}`);
  for (const p of planes) console.log(`  ${p.name.padEnd(20)} z ${String(p.z).padStart(5)}  ${p.role.padEnd(8)} Andockkanten ${perPlane.get(p.id) ?? 0}`);
}
