/**
 * Testszenen für den Zonen-Editor (Florian, 27.10.2026: „2–3 Testszenen mit organischen verschachtelten Ebenen, dann muss
 * ich nicht immer alles selbst erstellen“). Drei Zonen nur aus Formen auf Ebenen, nach den Referenzen gebaut:
 *
 * - test-huegel: Hügelwellen in drei spielbaren Tiefen vor See und Bergen (Baukasten-Szenen 01 und 02, Visuals 14, 50, 52)
 * - test-grotte: Felsmassiv mit Höhlenmund, dahinter verschachtelte Bögen bis zur Höhlenwand (Baukasten 03, 05, 06, 10,
 *   Montagen „Wald und Grotte“ und „Große Bögen“)
 * - test-boegen: Plateau auf Bögen über einer Unterwelt, Überhang, schwebende Insel, Wasserfall (Visuals 21, 27, 31, 33, 35,
 *   Baukasten 07 und 09)
 *
 * Platzhalter: alle Formen, Farben, Tiefen; Testgrundlage, kein Inhalt (Tor S4 baut Szene 06 eigens nach). Jede Ebene ist
 * mit „Bild halten“ so gesetzt, dass sie in der Startansicht des Editors (ganze Zonenbreite) aussieht wie hier gezeichnet:
 * Formen in Bildkoordinaten der Spur-0-Ebene.
 *
 *   npx tsx scripts/testzonen.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPath, flattenPath, smoothPath, translatePath, type Poly, type ZonePath } from '../src/zone/path';
import { holdPicture, type HoldView, type Material, type PlaneRole, type ZoneAir, type ZoneFieldNode, type ZoneGroup, type ZoneNode, type ZonePlane, type ZoneShape, type ZoneStationNode } from '../src/zone/nodes';
import type { GradientFill, ZoneSwatch } from '../src/zone/paint';
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
  PALETTE.forEach(([name, color], i) => nodes.push({ id: `c${i + 1}`, kind: 'swatch', name, color } satisfies ZoneSwatch));
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
      spec.shapes.forEach((s, k) => nodes.push(makeShape(s, `s${++shapeNo}`, plane.id, k + 1)));
    });
  const st = planeIds.get(scene.station.plane);
  if (!st) throw new Error(`Station: Ebene ${scene.station.plane} fehlt`);
  nodes.push({ id: 'station', kind: 'station', parent: st, x: scene.station.x, dir: 1, length: 14 } satisfies ZoneStationNode);
  nodes.push({ id: 'f1', kind: 'field', name: 'Test', ...FIELD } satisfies ZoneFieldNode);
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

// ------------------------------------------------------------------ schreiben und prüfen

for (const scene of [huegel(), grotte(), boegen()]) {
  seed = 7;
  const nodes = build(scene);
  // das Feld als Feldknoten (Zonen-Editor) und als Spiegel in den Feldern der Zonendatei (Klötzchen-Editor)
  const zone = { ...emptyZone(scene.name, FIELD.x1 - FIELD.x0, 'steel'), fields: [{ id: 'f1', name: 'Test', ...FIELD }], nodes };
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
