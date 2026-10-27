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
import { flattenPath, insideWithHoles, simplifyPoly, type Poly, type ZonePath } from './path';
import { computeFaces, type Face } from './faces';
import { cloneFills, mapFillPoints, parseColor, parseFills, samePaint, serializeFill, type Paint, type PaintColor, type ZoneFill, type ZoneStyle, type ZoneSwatch } from './paint';
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
  /** Gruppe in der Ebenenliste (wie ein Ordner in Photoshop); ihre Ebenen liegen in der Tiefe beieinander */
  group?: string;
  /**
   * Ebenenstapel (Stufe 3, Plan 4.4): Füllungen über allen Formen der Ebene (wie eine Schnittmaskengruppe), Verlaufsgriffe
   * in Ebenen-Koordinaten
   */
  fills?: ZoneFill[];
  /** Anteil der Luftperspektive der Zone für diese Ebene (0 bis 1, ohne Angabe 1) */
  air?: number;
}

/**
 * Luftperspektive der Zone (Stufe 3, Plan 4.4): Ebenen nehmen mit der Tiefe die Luftfarbe an, ab near voll bei far
 * (Meter, weich), höchstens amount; je Ebene abschwächbar. Kommt zum Nebel der Welt dazu. Eine je Zone (Kennung air)
 */
export interface ZoneAir {
  id: string;
  kind: 'air';
  color: PaintColor;
  near: number;
  far: number;
  amount: number;
}

/**
 * Gruppe von Ebenen (nach Tor S2, wie ein Ordner in Photoshop): fasst Ebenen zusammen, die in der Tiefe beieinander
 * liegen; ausblenden und sperren gelten für alle, zugeklappt zeigt die Liste nur ihre Kopfzeile. Eine Ebene hat höchstens
 * eine Gruppe (noch keine Gruppen in Gruppen)
 */
export interface ZoneGroup {
  id: string;
  kind: 'group';
  name: string;
  collapsed?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

/**
 * Skizze als Pause-Ebene (Rest von Stufe 2): ein Bild auf einer Ebene, nur im Editor zu sehen, zum Nachzeichnen; das Bild
 * liegt neben der Zonendatei (src), Lage und Größe in Ebenen-Koordinaten (Mitte, Breite, Höhe in Metern)
 */
export interface ZoneSketch {
  id: string;
  kind: 'sketch';
  parent: string;
  name: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  /** normal halbdurchsichtig; sonst multipliziert (weißes Papier wird durchsichtig, Linien dunkeln ab) */
  blend?: 'normal';
  hidden?: boolean;
}

/** Teilungslinie einer Form (Vektornetz, Stufe 2): offen von Kante zu Kante oder geschlossen als Ring in einer Fläche */
export interface ZoneCut {
  path: ZonePath;
  closed: boolean;
}

/**
 * Füllung einer Fläche: gilt für die Fläche, die den Punkt (x, y) in Pfad-Koordinaten enthält; fill null ist ein Loch.
 * So bleibt eine Füllung an „ihrer“ Fläche, auch wenn Linien und Anker sich bewegen (wie Illustrators Interaktiv malen)
 */
/** Material einer Fläche für Bahn, Stützen und Freiraum (Stufe 4, src/zone/dock.ts) */
export type Material = 'solid' | 'dig' | 'airy' | 'free';
export const MATERIALS: readonly Material[] = ['solid', 'dig', 'airy', 'free'];

export interface ZoneRegion extends Paint {
  x: number;
  y: number;
  /** Material dieser Fläche (ohne Angabe das der Form) */
  material?: Material;
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
  /** Teilungslinien und Ringe (Stufe 2): teilen die Form in Flächen */
  cuts?: ZoneCut[];
  /** Füllungen einzelner Flächen; ohne Eintrag gilt der Anstrich der Form */
  regions?: ZoneRegion[];
  /** Grundfarbe aller Flächen ohne eigene (Wert oder Palettenverweis, src/zone/paint.ts) */
  fill: PaintColor;
  /** Füllstapel über der Grundfarbe (Stufe 3), Verlaufsgriffe in Pfad-Koordinaten */
  fills?: ZoneFill[];
  /** verknüpfter Stil (ersetzt Grundfarbe und Füllstapel) */
  style?: string;
  /** Deckkraft der Flächen (unter 1: durchsichtig) */
  opacity?: number;
  /** Material aller Flächen ohne eigenes (Stufe 4; ohne Angabe grabbar) */
  material?: Material;
  /** abgeschaltete Andockkanten: je ein Punkt am Kantenstück (Pfad-Koordinaten) */
  dockOff?: Array<[number, number]>;
  /** Formgruppen, in denen sie liegt, von außen nach innen (src/zone/shapeGroups.ts) */
  groups?: string[];
  hidden?: boolean;
  locked?: boolean;
}

/**
 * Station auf einer Andockkante (Stufe 4, Plan 4.9 „Spielobjekte stehen auf Andockkanten einer Ebene statt auf einer
 * Spur“): Ebene, Lage auf ihr (x in Ebenen-Koordinaten), Fahrtrichtung, Länge des Vorgabestücks. Höhe und Tiefe folgen
 * aus der Kante und der Ebene (src/zone/dock.ts `stationOf`). Eine je Zone (Kennung station)
 */
export interface ZoneStationNode {
  id: string;
  kind: 'station';
  parent: string;
  x: number;
  dir: 1 | -1;
  length: number;
}

/**
 * Feld (Stufe 4, Plan 4.9 „Felder mit Kamerabegrenzung und Rahmen für Hoch- und Querformat“): ein Spielbereich der Zone
 * in Metern der Spur-0-Ebene wie die Felder des Klötzchen-Editors (`ZoneField`): weiche Kamerabegrenzung, Zoom-Grenze
 * „Feld passt ins Bild“, Absperrband an den Rändern. Ziele, Stufen und Schalter des Felds reisen bis zu ihrem Paket
 * unverändert mit (rest, wie in der Zonendatei)
 */
export interface ZoneFieldNode {
  id: string;
  kind: 'field';
  name: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  rest?: Record<string, unknown>;
}

export type ZoneNode = ZonePlane | ZoneShape | ZoneGroup | ZoneSketch | ZoneSwatch | ZoneStyle | ZoneAir | ZoneStationNode | ZoneFieldNode;

export const isPlane = (n: ZoneNode): n is ZonePlane => n.kind === 'plane';
export const isShape = (n: ZoneNode): n is ZoneShape => n.kind === 'shape';
export const isGroup = (n: ZoneNode): n is ZoneGroup => n.kind === 'group';
export const isSketch = (n: ZoneNode): n is ZoneSketch => n.kind === 'sketch';
export const isSwatch = (n: ZoneNode): n is ZoneSwatch => n.kind === 'swatch';
export const isStyle = (n: ZoneNode): n is ZoneStyle => n.kind === 'style';
export const isAir = (n: ZoneNode): n is ZoneAir => n.kind === 'air';
export const isStationNode = (n: ZoneNode): n is ZoneStationNode => n.kind === 'station';
export const isFieldNode = (n: ZoneNode): n is ZoneFieldNode => n.kind === 'field';

/** Felder der Zone in ihrer Reihenfolge */
export function fieldNodesOf(nodes: readonly ZoneNode[]): ZoneFieldNode[] {
  return nodes.filter(isFieldNode);
}

/** kleinstes Feld (Meter) */
export const FIELD_MIN = 10;
/** Seitenverhältnis des Handybilds quer (19,5 : 9 wie die iPhones seit X; Platzhalter, bis es Geräteprofile gibt) */
export const PHONE_ASPECT = 19.5 / 9;

/**
 * Rahmen eines Felds fürs Handy (Plan 4.9 „Rahmen für Hoch- und Querformat“): was die Kamera quer und hoch zeigt, wenn das
 * Feld ganz ins Bild passt (wie `Camera.fitBounds` mit 2 % Rand; weiter heraus zoomt das Spiel im Feld nicht). Meter der
 * Spur-0-Ebene, um die Mitte des Felds
 */
export function fieldFrames(f: { x0: number; x1: number; y0: number; y1: number }, aspect = PHONE_ASPECT, margin = 0.02): Array<{ name: 'quer' | 'hoch'; x0: number; x1: number; y0: number; y1: number }> {
  const w = f.x1 - f.x0;
  const h = f.y1 - f.y0;
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  const k = 1 - 2 * margin;
  return (['quer', 'hoch'] as const).map((name) => {
    // Breite durch Höhe des Bildschirms; der Zoom passt Breite oder Höhe des Felds ein, die andere Richtung zeigt mehr
    const a = name === 'quer' ? aspect : 1 / aspect;
    const vw = Math.max(w / k, (h / k) * a);
    const vh = vw / a;
    return { name, x0: cx - vw / 2, x1: cx + vw / 2, y0: cy - vh / 2, y1: cy + vh / 2 };
  });
}

/** Luftperspektive der Zone, falls gesetzt */
export function airOf(nodes: readonly ZoneNode[]): ZoneAir | undefined {
  return nodes.find(isAir);
}

/** Anteil der Luftfarbe für eine Ebene (weich zwischen near und far, mal Stärke und Anteil der Ebene) */
export function airAmount(air: ZoneAir | undefined, plane: ZonePlane): number {
  if (!air || air.amount <= 0) return 0;
  const t = Math.max(0, Math.min(1, (plane.z - air.near) / Math.max(1e-6, air.far - air.near)));
  return t * t * (3 - 2 * t) * air.amount * (plane.air ?? 1);
}

/** Felder der Zonenpalette in ihrer Reihenfolge, nach Kennung */
export function swatchesOf(nodes: readonly ZoneNode[]): ZoneSwatch[] {
  return nodes.filter(isSwatch);
}

export function swatchMap(nodes: readonly ZoneNode[]): Map<string, ZoneSwatch> {
  return new Map(swatchesOf(nodes).map((s) => [s.id, s]));
}

export function stylesOf(nodes: readonly ZoneNode[]): ZoneStyle[] {
  return nodes.filter(isStyle);
}

export function styleMap(nodes: readonly ZoneNode[]): Map<string, ZoneStyle> {
  return new Map(stylesOf(nodes).map((s) => [s.id, s]));
}

/** Skizzen einer Ebene */
export function sketchesOf(nodes: readonly ZoneNode[], planeId: string): ZoneSketch[] {
  return nodes.filter((n): n is ZoneSketch => isSketch(n) && n.parent === planeId);
}

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

export function findGroup(nodes: readonly ZoneNode[], id: string | null | undefined): ZoneGroup | undefined {
  return id ? (nodes.find((n) => n.id === id && isGroup(n)) as ZoneGroup | undefined) : undefined;
}

export function groupsOf(nodes: readonly ZoneNode[]): ZoneGroup[] {
  return nodes.filter(isGroup);
}

/** Gruppe einer Ebene */
export function groupOf(nodes: readonly ZoneNode[], plane: ZonePlane): ZoneGroup | undefined {
  return findGroup(nodes, plane.group);
}

/** Ebenen einer Gruppe von vorn nach hinten */
export function groupMembers(nodes: readonly ZoneNode[], groupId: string): ZonePlane[] {
  return planesOf(nodes).filter((p) => p.group === groupId);
}

/** ausgeblendet: die Ebene selbst oder ihre Gruppe */
export function planeHidden(nodes: readonly ZoneNode[], plane: ZonePlane): boolean {
  return !!plane.hidden || !!groupOf(nodes, plane)?.hidden;
}

/** gesperrt: die Ebene selbst oder ihre Gruppe */
export function planeLocked(nodes: readonly ZoneNode[], plane: ZonePlane): boolean {
  return !!plane.locked || !!groupOf(nodes, plane)?.locked;
}

/** neue, leere Gruppe */
export function newGroup(nodes: readonly ZoneNode[], name?: string): ZoneGroup {
  const id = nextNodeId(nodes, 'g');
  return { id, kind: 'group', name: name ?? `Gruppe ${id.slice(1)}` };
}

/**
 * nächste freie Kennung mit Vorsilbe (p für Ebenen, s für Formen, g für Gruppen, k für Skizzen, c für Palettenfelder,
 * y für Stile, f für Felder), hochgezählt wie die Kennungen der Zonendatei
 */
export function nextNodeId(nodes: readonly ZoneNode[], prefix: 'p' | 's' | 'g' | 'k' | 'c' | 'y' | 'f'): string {
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

/**
 * Bogen (Portalform, Plan 4.3) im Rahmen w × h um den Ursprung: unten gerade, senkrechte Seiten bis zur Kämpferlinie,
 * oben ein halber Kreis; ist der Rahmen flacher als halb so hoch wie breit, eine halbe Ellipse ohne Seiten
 */
export function archPath(w: number, h: number): ZonePath {
  const a = w / 2;
  const b = h / 2;
  const ry = Math.min(a, h);
  const kx = a * KAPPA;
  const ky = ry * KAPPA;
  const spring = b - ry;
  if (spring <= -b + 1e-6)
    return [
      { x: a, y: -b, outX: 0, outY: ky },
      { x: 0, y: b, inX: kx, inY: 0, outX: -kx, outY: 0 },
      { x: -a, y: -b, inX: 0, inY: ky },
    ];
  return [
    { x: -a, y: -b },
    { x: a, y: -b },
    { x: a, y: spring, outX: 0, outY: ky },
    { x: 0, y: b, inX: kx, inY: 0, outX: -kx, outY: 0 },
    { x: -a, y: spring, inX: 0, inY: ky },
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

interface FaceCache {
  holes: ZonePath[] | undefined;
  cuts: ZoneCut[] | undefined;
  byFineness: Map<number, Face[]>;
}
const faceCache = new WeakMap<ZonePath, FaceCache>();

/**
 * Flächen einer Form in Pfad-Koordinaten (src/zone/faces.ts), zwischengespeichert, solange Umriss, Löcher und
 * Teilungslinien dieselben Objekte bleiben; fine: Feinheit der Glättung (Zweierpotenz, größer = feiner)
 */
export function shapeFaces(shape: ZoneShape, fine = 1): Face[] {
  let entry = faceCache.get(shape.path);
  if (!entry || entry.holes !== shape.holes || entry.cuts !== shape.cuts) {
    entry = { holes: shape.holes, cuts: shape.cuts, byFineness: new Map() };
    faceCache.set(shape.path, entry);
  }
  const hit = entry.byFineness.get(fine);
  if (hit) return hit;
  const step = FLATTEN_STEP / fine;
  const faces = computeFaces(
    flattenPath(shape.path, step),
    (shape.holes ?? []).map((h) => flattenPath(h, step)),
    (shape.cuts ?? []).map((c) => ({ poly: flattenPath(c.path, step, c.closed), closed: c.closed })),
  );
  entry.byFineness.set(fine, faces);
  return faces;
}

/** Anstrich einer Fläche: der Füllpunkt, der in ihr liegt, sonst der der Form */
export function facePaint(shape: ZoneShape, face: Face): Paint {
  for (const r of shape.regions ?? []) if (insideWithHoles(face.outline, face.holes, r.x, r.y)) return r;
  return shape;
}

/** Grundfarbe einer Fläche (null = Loch) */
export function faceFill(shape: ZoneShape, face: Face): PaintColor | null {
  return facePaint(shape, face).fill;
}

/** Anstrich als eigene Kopie (ohne Lage), für Füllpunkte und Zwischenablage */
export function copyPaint(p: Paint): Paint {
  const o: Paint = { fill: p.fill };
  if (p.fills?.length) o.fills = cloneFills(p.fills);
  if (p.style) o.style = p.style;
  if (p.opacity !== undefined && p.opacity < 1) o.opacity = p.opacity;
  return o;
}

/**
 * Anstrich einer Fläche setzen (neue Liste, alte Einträge derselben Fläche fallen weg; gleicht er dem der Form, braucht es
 * keinen); Einträge, deren Punkt in keiner Fläche mehr liegt, räumt das mit auf. Ein Loch trägt nur fill null
 */
export function setFacePaint(shape: ZoneShape, face: Face, paint: Paint): void {
  const faces = shapeFaces(shape);
  // das Material der Fläche bleibt (es steht im selben Füllpunkt)
  const material = (shape.regions ?? []).find((r) => insideWithHoles(face.outline, face.holes, r.x, r.y))?.material;
  // eine Form aus einer einzigen Fläche trägt ihren Anstrich selbst (dann zeigen Leiste und Farbknopf ihn auch)
  if (faces.length === 1 && paint.fill !== null) {
    const own = copyPaint(paint);
    shape.fill = own.fill as PaintColor;
    for (const k of ['fills', 'style', 'opacity'] as const) {
      if (own[k] === undefined) delete shape[k];
    }
    if (own.fills) shape.fills = own.fills;
    if (own.style) shape.style = own.style;
    if (own.opacity !== undefined) shape.opacity = own.opacity;
    delete shape.regions;
    return;
  }
  const live = (r: ZoneRegion) => faces.some((f) => insideWithHoles(f.outline, f.holes, r.x, r.y));
  const rest = (shape.regions ?? []).filter((r) => !insideWithHoles(face.outline, face.holes, r.x, r.y) && live(r));
  const own: Paint & { material?: Material } = paint.fill === null ? { fill: null } : copyPaint(paint);
  if (material && paint.fill !== null) own.material = material;
  const regions = samePaint(own, shape) && !own.material ? rest : [...rest, { x: round(face.inner[0], 3), y: round(face.inner[1], 3), ...own }];
  if (regions.length) shape.regions = regions;
  else delete shape.regions;
}

/**
 * Feld der Zonenpalette auflösen (vor dem Löschen): jede Farbe, die darauf verweist, bekommt seinen Wert (Look Tag)
 */
export function bakeSwatch(nodes: readonly ZoneNode[], id: string): void {
  const sw = nodes.find((n): n is ZoneSwatch => isSwatch(n) && n.id === id);
  if (!sw) return;
  const ref = `@${id}`;
  const fix = (c: PaintColor): PaintColor => (c === ref ? sw.color : c);
  const fixFills = (fills: ZoneFill[] | undefined) => {
    for (const f of fills ?? []) {
      if (f.type === 'color') f.color = fix(f.color);
      else for (const st of f.stops) st.color = fix(st.color);
    }
  };
  for (const n of nodes) {
    if (isShape(n)) {
      n.fill = fix(n.fill);
      fixFills(n.fills);
      for (const r of n.regions ?? []) {
        if (r.fill !== null) r.fill = fix(r.fill);
        fixFills(r.fills);
      }
    } else if (isPlane(n)) fixFills(n.fills);
    else if (isStyle(n)) {
      n.fill = fix(n.fill);
      fixFills(n.fills);
    }
  }
}

/** Grundfarbe einer Fläche setzen; ihr Füllstapel und ihre Deckkraft bleiben (null macht ein Loch) */
export function setFaceFill(shape: ZoneShape, face: Face, fill: PaintColor | null): void {
  const cur = facePaint(shape, face);
  setFacePaint(shape, face, fill === null ? { fill: null } : { ...copyPaint(cur), fill, style: undefined });
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

// ------------------------------------------------------------------ Pfade bearbeiten (Stufe 2)

/** welcher Pfad einer Form: der Umriss, ein Loch oder eine Teilungslinie */
export type PathRef = { kind: 'outline' } | { kind: 'hole'; i: number } | { kind: 'cut'; i: number };

/** alle Pfade einer Form mit ihrem Verweis */
export function shapePaths(shape: ZoneShape): Array<{ ref: PathRef; path: ZonePath; closed: boolean }> {
  return [
    { ref: { kind: 'outline' }, path: shape.path, closed: true },
    ...(shape.holes ?? []).map((path, i) => ({ ref: { kind: 'hole', i } as PathRef, path, closed: true })),
    ...(shape.cuts ?? []).map((c, i) => ({ ref: { kind: 'cut', i } as PathRef, path: c.path, closed: c.closed })),
  ];
}

export function getPath(shape: ZoneShape, ref: PathRef): { path: ZonePath; closed: boolean } | null {
  if (ref.kind === 'outline') return { path: shape.path, closed: true };
  if (ref.kind === 'hole') return shape.holes?.[ref.i] ? { path: shape.holes[ref.i], closed: true } : null;
  const c = shape.cuts?.[ref.i];
  return c ? { path: c.path, closed: c.closed } : null;
}

/** Pfad ersetzen (neue Listen, damit die zwischengespeicherten Flächen neu entstehen); null entfernt Loch oder Linie */
export function setPath(shape: ZoneShape, ref: PathRef, path: ZonePath | null): void {
  if (ref.kind === 'outline') {
    if (path) shape.path = path;
    return;
  }
  if (ref.kind === 'hole') {
    const holes = [...(shape.holes ?? [])];
    if (path) holes[ref.i] = path;
    else holes.splice(ref.i, 1);
    if (holes.length) shape.holes = holes;
    else delete shape.holes;
    return;
  }
  const cuts = [...(shape.cuts ?? [])];
  if (path) cuts[ref.i] = { ...cuts[ref.i], path };
  else cuts.splice(ref.i, 1);
  if (cuts.length) shape.cuts = cuts;
  else delete shape.cuts;
}

/** Punkt der Kurve zwischen Anker i und dem nächsten bei t (Pfad-Koordinaten) */
export function segmentPoint(path: ZonePath, i: number, t: number): { x: number; y: number } {
  const a = path[i];
  const b = path[(i + 1) % path.length];
  const c1x = a.x + (a.outX ?? 0);
  const c1y = a.y + (a.outY ?? 0);
  const c2x = b.x + (b.inX ?? 0);
  const c2y = b.y + (b.inY ?? 0);
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b.y,
  };
}

/** Anker auf dem Stück nach Anker i bei t einfügen, ohne dass sich die Kurve ändert (de Casteljau) */
export function insertAnchor(path: ZonePath, i: number, t: number): ZonePath {
  const a = path[i];
  const j = (i + 1) % path.length;
  const b = path[j];
  const p0 = { x: a.x, y: a.y };
  const p1 = { x: a.x + (a.outX ?? 0), y: a.y + (a.outY ?? 0) };
  const p2 = { x: b.x + (b.inX ?? 0), y: b.y + (b.inY ?? 0) };
  const p3 = { x: b.x, y: b.y };
  const lerp = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const m = lerp(r0, r1);
  const straight = !a.outX && !a.outY && !b.inX && !b.inY;
  const out = path.map((p) => ({ ...p }));
  if (!straight) {
    out[i] = { ...out[i], outX: q0.x - a.x, outY: q0.y - a.y };
    out[j] = { ...out[j], inX: q2.x - b.x, inY: q2.y - b.y };
  }
  const mid: ZonePath[number] = straight ? { x: m.x, y: m.y } : { x: m.x, y: m.y, inX: r0.x - m.x, inY: r0.y - m.y, outX: r1.x - m.x, outY: r1.y - m.y };
  out.splice(i + 1, 0, mid);
  return out;
}

/** Anker i entfernen */
export function removeAnchor(path: ZonePath, i: number): ZonePath {
  return path.filter((_, k) => k !== i).map((p) => ({ ...p }));
}

/** Anker i zwischen Ecke (ohne Griffe) und Rund (Griffe entlang der Nachbarn, ein Drittel des Abstands) umschalten */
export function toggleSmooth(path: ZonePath, closed: boolean, i: number): ZonePath {
  const out = path.map((p) => ({ ...p }));
  const p = out[i];
  if (p.inX || p.inY || p.outX || p.outY) {
    out[i] = { x: p.x, y: p.y };
    return out;
  }
  const n = out.length;
  const prev = closed || i > 0 ? out[(i - 1 + n) % n] : p;
  const next = closed || i < n - 1 ? out[(i + 1) % n] : p;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const kIn = Math.hypot(p.x - prev.x, p.y - prev.y) / 3;
  const kOut = Math.hypot(next.x - p.x, next.y - p.y) / 3;
  out[i] = { x: p.x, y: p.y, inX: (-dx / len) * kIn, inY: (-dy / len) * kIn, outX: (dx / len) * kOut, outY: (dy / len) * kOut };
  return out;
}

/** Pfad in Ebenen-Koordinaten in die Pfad-Koordinaten einer Form umrechnen (Lage und Maßstab der Form) */
export function planePathToShape(shape: ZoneShape, path: ZonePath): ZonePath {
  return path.map((p) => {
    const o: ZonePath[number] = { x: round((p.x - shape.x) / shape.sx, 3), y: round((p.y - shape.y) / shape.sy, 3) };
    if (p.inX || p.inY) {
      o.inX = round((p.inX ?? 0) / shape.sx, 3);
      o.inY = round((p.inY ?? 0) / shape.sy, 3);
    }
    if (p.outX || p.outY) {
      o.outX = round((p.outX ?? 0) / shape.sx, 3);
      o.outY = round((p.outY ?? 0) / shape.sy, 3);
    }
    return o;
  });
}

/** neue Form aus einem geschlossenen Pfad in Ebenen-Koordinaten: Ursprung in der Mitte ihrer Grenzen */
export function shapeFromPlanePath(nodes: readonly ZoneNode[], planeId: string, path: ZonePath, fill: string): ZoneShape {
  const b = polyBoundsOf(flattenPath(path));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const s = newShape(nodes, planeId, [], cx, cy, fill);
  s.path = planePathToShape(s, path);
  return s;
}

function polyBoundsOf(poly: Poly): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Form aus Ebene from in Ebene to übertragen, sodass sie im Spielblick gleich aussieht (Kopieren über Ebenen, „Bild
 * halten“, Befund 11): dieselbe Streckung um den Fußpunkt der Kamera wie beim Verschieben einer Ebene. view null: gleiche
 * Weltlage und Größe in Metern („Welt halten“)
 */
export function transferShape(shape: ZoneShape, from: ZonePlane, to: ZonePlane, view: HoldView | null): ZoneShape {
  const copy = cloneNodes([shape])[0] as ZoneShape;
  copy.parent = to.id;
  // Ursprung der Form in der Welt (Ebene from), dann auf die Ebene to projiziert
  let wx = from.x + from.scale * shape.x;
  let wy = from.y + from.scale * shape.y;
  let k = from.scale;
  if (view) {
    if (Number.isFinite(view.D)) {
      const along = view.D * Math.cos(view.tilt);
      const t = (along + to.z) / (along + from.z);
      const Cy = view.cy + view.D * Math.sin(view.tilt);
      wx = view.cx + t * (wx - view.cx);
      wy = Cy + t * (wy - Cy);
      k *= t;
    } else wy -= (to.z - from.z) * Math.tan(view.tilt);
  }
  copy.x = round((wx - to.x) / to.scale, 3);
  copy.y = round((wy - to.y) / to.scale, 3);
  copy.sx = (shape.sx * k) / to.scale;
  copy.sy = (shape.sy * k) / to.scale;
  return copy;
}

/** Form an der Mitte ihrer Grenzen spiegeln (x: waagrecht, y: senkrecht); Pfade, Löcher, Linien und Füllpunkte mit */
export function flipShape(shape: ZoneShape, axis: 'x' | 'y'): void {
  const b0 = shapeBounds(shape);
  const fx = axis === 'x' ? -1 : 1;
  const fy = axis === 'y' ? -1 : 1;
  const flip = (path: ZonePath): ZonePath =>
    path.map((p) => {
      const o: ZonePath[number] = { x: p.x * fx || 0, y: p.y * fy || 0 };
      if (p.inX || p.inY) {
        o.inX = (p.inX ?? 0) * fx || 0;
        o.inY = (p.inY ?? 0) * fy || 0;
      }
      if (p.outX || p.outY) {
        o.outX = (p.outX ?? 0) * fx || 0;
        o.outY = (p.outY ?? 0) * fy || 0;
      }
      return o;
    });
  shape.path = flip(shape.path);
  if (shape.holes) shape.holes = shape.holes.map(flip);
  if (shape.cuts) shape.cuts = shape.cuts.map((c) => ({ ...c, path: flip(c.path) }));
  if (shape.regions) shape.regions = shape.regions.map((r) => ({ ...r, x: r.x * fx || 0, y: r.y * fy || 0 }));
  if (shape.dockOff) shape.dockOff = shape.dockOff.map(([x, y]) => [x * fx || 0, y * fy || 0]);
  const mirror = (x: number, y: number): [number, number] => [x * fx || 0, y * fy || 0];
  mapFillPoints(shape.fills, mirror);
  for (const r of shape.regions ?? []) mapFillPoints(r.fills, mirror);
  const b1 = shapeBounds(shape);
  shape.x = round(shape.x + (b0.minX + b0.maxX - b1.minX - b1.maxX) / 2, 3);
  shape.y = round(shape.y + (b0.minY + b0.maxY - b1.minY - b1.maxY) / 2, 3);
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

function parsePathList(v: unknown, min = 3): ZonePath | null {
  if (!Array.isArray(v) || v.length < min || v.length > 5000) return null;
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
      if (typeof o.group === 'string' && ID.test(o.group)) p.group = o.group;
      const fills = parseFills(o.fills);
      if (fills) p.fills = fills;
      if (num(o.air) && o.air >= 0 && o.air < 1) p.air = o.air;
      out.push(p);
      ids.add(p.id);
    } else if (o.kind === 'sketch' && typeof o.parent === 'string' && typeof o.src === 'string' && /^\/zones\/[a-z0-9-]{1,40}\/[\w.-]{1,120}$/.test(o.src) && num(o.w) && num(o.h) && o.w > 0 && o.h > 0) {
      const k: ZoneSketch = { id: o.id, kind: 'sketch', parent: o.parent, name, src: o.src, x: num(o.x) ? o.x : 0, y: num(o.y) ? o.y : 0, w: o.w, h: o.h, opacity: num(o.opacity) ? Math.max(0.05, Math.min(1, o.opacity)) : 0.5 };
      if (o.blend === 'normal') k.blend = 'normal';
      if (o.hidden === true) k.hidden = true;
      out.push(k);
      ids.add(k.id);
    } else if (o.kind === 'swatch' && /^c\d{1,6}$/.test(o.id) && typeof o.color === 'string' && COLOR.test(o.color)) {
      const c: ZoneSwatch = { id: o.id, kind: 'swatch', name, color: o.color.toLowerCase() };
      if (o.looks && typeof o.looks === 'object') {
        const looks: Record<string, string> = {};
        for (const [k, v] of Object.entries(o.looks as Record<string, unknown>)) if (LOOK_KEYS.includes(k) && typeof v === 'string' && COLOR.test(v)) looks[k] = v.toLowerCase();
        if (Object.keys(looks).length) c.looks = looks as ZoneSwatch['looks'];
      }
      out.push(c);
      ids.add(c.id);
    } else if (o.kind === 'field' && num(o.x0) && num(o.x1) && num(o.y0) && num(o.y1)) {
      const f: ZoneFieldNode = { id: o.id, kind: 'field', name: typeof o.name === 'string' ? o.name.slice(0, 40) : o.id, x0: Math.min(o.x0, o.x1), x1: Math.max(o.x0, o.x1), y0: Math.min(o.y0, o.y1), y1: Math.max(o.y0, o.y1) };
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) if (!['id', 'kind', 'name', 'x0', 'x1', 'y0', 'y1'].includes(k)) rest[k] = v;
      if (Object.keys(rest).length) f.rest = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
      out.push(f);
      ids.add(f.id);
    } else if (o.kind === 'station' && !out.some(isStationNode) && typeof o.parent === 'string' && num(o.x)) {
      const st: ZoneStationNode = { id: o.id, kind: 'station', parent: o.parent, x: o.x, dir: o.dir === -1 ? -1 : 1, length: num(o.length) && o.length >= 4 && o.length <= 60 ? o.length : 14 };
      out.push(st);
      ids.add(st.id);
    } else if (o.kind === 'air' && !out.some(isAir) && num(o.near) && num(o.far) && num(o.amount)) {
      const color = parseColor(o.color);
      if (!color) continue;
      const a: ZoneAir = { id: o.id, kind: 'air', color, near: o.near, far: Math.max(o.near + 0.1, o.far), amount: Math.max(0, Math.min(1, o.amount)) };
      out.push(a);
      ids.add(a.id);
    } else if (o.kind === 'style' && /^y\d{1,6}$/.test(o.id)) {
      const fill = parseColor(o.fill);
      if (!fill) continue;
      const y: ZoneStyle = { id: o.id, kind: 'style', name, fill };
      const fills = parseFills(o.fills);
      if (fills) y.fills = fills;
      if (num(o.opacity) && o.opacity >= 0 && o.opacity < 1) y.opacity = o.opacity;
      out.push(y);
      ids.add(y.id);
    } else if (o.kind === 'group') {
      const g: ZoneGroup = { id: o.id, kind: 'group', name };
      if (o.collapsed === true) g.collapsed = true;
      if (o.hidden === true) g.hidden = true;
      if (o.locked === true) g.locked = true;
      out.push(g);
      ids.add(g.id);
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
        fill: parseColor(o.fill) ?? '#8aa0b8',
      };
      readPaint(s, o);
      if (Array.isArray(o.holes)) {
        const holes = o.holes.map(parsePathList).filter((h): h is ZonePath => !!h);
        if (holes.length) s.holes = holes;
      }
      if (Array.isArray(o.cuts)) {
        const cuts: ZoneCut[] = [];
        for (const raw2 of o.cuts) {
          const c = raw2 as Record<string, unknown>;
          const path = c ? parsePathList(c.path, 2) : null;
          if (path) cuts.push({ path, closed: c.closed === true && path.length >= 3 });
        }
        if (cuts.length) s.cuts = cuts;
      }
      if (Array.isArray(o.regions)) {
        const regions: ZoneRegion[] = [];
        for (const raw2 of o.regions) {
          const r = raw2 as Record<string, unknown>;
          if (!r || !num(r.x) || !num(r.y)) continue;
          const region: ZoneRegion = { x: r.x, y: r.y, fill: parseColor(r.fill) };
          if (region.fill !== null) readPaint(region, r);
          if ((MATERIALS as readonly string[]).includes(String(r.material))) region.material = r.material as Material;
          regions.push(region);
        }
        if (regions.length) s.regions = regions;
      }
      if (Array.isArray(o.groups)) {
        const groups = o.groups.filter((g): g is string => typeof g === 'string' && /^fg\d{1,6}$/.test(g)).slice(0, 16);
        if (groups.length) s.groups = groups;
      }
      if ((MATERIALS as readonly string[]).includes(String(o.material))) s.material = o.material as Material;
      if (Array.isArray(o.dockOff)) {
        const pts = o.dockOff.filter((q): q is [number, number] => Array.isArray(q) && q.length === 2 && num(q[0]) && num(q[1])).slice(0, 500);
        if (pts.length) s.dockOff = pts.map(([x, y]) => [x, y]);
      }
      if (o.hidden === true) s.hidden = true;
      if (o.locked === true) s.locked = true;
      out.push(s);
      ids.add(s.id);
    }
  }
  const planeIds = new Set(out.filter(isPlane).map((p) => p.id));
  const groupIds = new Set(out.filter(isGroup).map((g) => g.id));
  for (const p of out) if (isPlane(p) && p.group && !groupIds.has(p.group)) delete p.group;
  return out.filter((n) => isPlane(n) || isGroup(n) || isSwatch(n) || isStyle(n) || isAir(n) || isFieldNode(n) || planeIds.has(n.parent));
}

const LOOK_KEYS = ['day', 'dusk', 'night', 'neon'];

/** Füllstapel, Stil und Deckkraft eines Anstrichs aus der Datei */
function readPaint(p: Paint, o: Record<string, unknown>): void {
  const fills = parseFills(o.fills);
  if (fills) p.fills = fills;
  if (typeof o.style === 'string' && /^y\d{1,6}$/.test(o.style)) p.style = o.style;
  if (num(o.opacity) && o.opacity >= 0 && o.opacity < 1) p.opacity = o.opacity;
}

/** Füllstapel, Stil und Deckkraft eines Anstrichs für die Datei */
function writePaint(o: Record<string, unknown>, p: Paint): void {
  if (p.fills?.length) o.fills = p.fills.map(serializeFill);
  if (p.style) o.style = p.style;
  if (p.opacity !== undefined && p.opacity < 1) o.opacity = round(p.opacity, 3);
}

const pathOut = (path: ZonePath): Array<Record<string, number>> =>
  path.map((p) => {
    const o: Record<string, number> = { x: round(p.x, 3), y: round(p.y, 3) };
    if (p.inX || p.inY) {
      o.inX = round(p.inX ?? 0, 3);
      o.inY = round(p.inY ?? 0, 3);
    }
    if (p.outX || p.outY) {
      o.outX = round(p.outX ?? 0, 3);
      o.outY = round(p.outY ?? 0, 3);
    }
    return o;
  });

/** Knoten für die Zonendatei: Ebenen von vorn nach hinten, dahinter ihre Formen in Zeichenreihenfolge; gerundet */
export function serializeNodes(nodes: readonly ZoneNode[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const c of swatchesOf(nodes)) {
    const o: Record<string, unknown> = { id: c.id, kind: 'swatch', name: c.name, color: c.color };
    if (c.looks && Object.keys(c.looks).length) o.looks = { ...c.looks };
    out.push(o);
  }
  for (const y of stylesOf(nodes)) {
    const o: Record<string, unknown> = { id: y.id, kind: 'style', name: y.name, fill: y.fill };
    writePaint(o, y);
    out.push(o);
  }
  const air = airOf(nodes);
  if (air) out.push({ id: air.id, kind: 'air', color: air.color, near: round(air.near, 2), far: round(air.far, 2), amount: round(air.amount, 3) });
  for (const g of groupsOf(nodes)) {
    const o: Record<string, unknown> = { id: g.id, kind: 'group', name: g.name };
    if (g.collapsed) o.collapsed = true;
    if (g.hidden) o.hidden = true;
    if (g.locked) o.locked = true;
    out.push(o);
  }
  for (const p of planesOf(nodes)) {
    const o: Record<string, unknown> = { id: p.id, kind: 'plane', name: p.name, z: round(p.z, 3), x: round(p.x, 3), y: round(p.y, 3), scale: round(p.scale, 5), role: p.role };
    if (p.hidden) o.hidden = true;
    if (p.locked) o.locked = true;
    if (p.group) o.group = p.group;
    if (p.fills?.length) o.fills = p.fills.map(serializeFill);
    if (p.air !== undefined && p.air < 1) o.air = round(p.air, 3);
    out.push(o);
  }
  for (const p of planesOf(nodes)) {
    for (const s of shapesOf(nodes, p.id)) {
      const o: Record<string, unknown> = { id: s.id, kind: 'shape', parent: s.parent, order: round(s.order, 4), name: s.name, x: round(s.x, 3), y: round(s.y, 3), sx: round(s.sx, 4), sy: round(s.sy, 4), fill: s.fill, path: pathOut(s.path) };
      if (s.holes?.length) o.holes = s.holes.map(pathOut);
      if (s.cuts?.length) o.cuts = s.cuts.map((c) => ({ closed: c.closed, path: pathOut(c.path) }));
      writePaint(o, s);
      if (s.material) o.material = s.material;
      if (s.dockOff?.length) o.dockOff = s.dockOff.map(([x, y]) => [round(x, 3), round(y, 3)]);
      if (s.regions?.length)
        o.regions = s.regions.map((r) => {
          const q: Record<string, unknown> = { x: round(r.x, 3), y: round(r.y, 3), fill: r.fill };
          if (r.fill !== null) writePaint(q, r);
          if (r.material) q.material = r.material;
          return q;
        });
      if (s.groups?.length) o.groups = [...s.groups];
      if (s.hidden) o.hidden = true;
      if (s.locked) o.locked = true;
      out.push(o);
    }
  }
  for (const st of nodes.filter(isStationNode)) out.push({ id: st.id, kind: 'station', parent: st.parent, x: round(st.x, 3), dir: st.dir, length: round(st.length, 2) });
  for (const f of fieldNodesOf(nodes)) out.push({ id: f.id, kind: 'field', name: f.name, x0: round(f.x0, 2), x1: round(f.x1, 2), y0: round(f.y0, 2), y1: round(f.y1, 2), ...(f.rest ? JSON.parse(JSON.stringify(f.rest)) : {}) });
  for (const k of nodes.filter(isSketch)) {
    if (!k.src.startsWith('/zones/')) continue;
    const o: Record<string, unknown> = { id: k.id, kind: 'sketch', parent: k.parent, name: k.name, src: k.src, x: round(k.x, 3), y: round(k.y, 3), w: round(k.w, 3), h: round(k.h, 3), opacity: round(k.opacity, 2) };
    if (k.blend) o.blend = k.blend;
    if (k.hidden) o.hidden = true;
    out.push(o);
  }
  return out;
}

/** tiefe Kopie (für den Arbeitsverlauf und das Sichern) */
export function cloneNodes(nodes: readonly ZoneNode[]): ZoneNode[] {
  return nodes.map((n): ZoneNode => {
    if (isGroup(n) || isSketch(n) || isAir(n) || isStationNode(n)) return { ...n };
    if (isFieldNode(n)) return { ...n, ...(n.rest ? { rest: JSON.parse(JSON.stringify(n.rest)) as Record<string, unknown> } : {}) };
    if (isPlane(n)) return { ...n, ...(n.fills ? { fills: cloneFills(n.fills) } : {}) };
    if (isSwatch(n)) return { ...n, ...(n.looks ? { looks: { ...n.looks } } : {}) };
    if (isStyle(n)) return { ...n, ...(n.fills ? { fills: cloneFills(n.fills) } : {}) };
    return {
      ...n,
      path: n.path.map((p) => ({ ...p })),
      ...(n.holes ? { holes: n.holes.map((h) => h.map((p) => ({ ...p }))) } : {}),
      ...(n.cuts ? { cuts: n.cuts.map((c) => ({ closed: c.closed, path: c.path.map((p) => ({ ...p })) })) } : {}),
      ...(n.regions ? { regions: n.regions.map((r) => ({ ...r, ...(r.fills ? { fills: cloneFills(r.fills) } : {}) })) } : {}),
      ...(n.fills ? { fills: cloneFills(n.fills) } : {}),
      ...(n.groups ? { groups: [...n.groups] } : {}),
      ...(n.dockOff ? { dockOff: n.dockOff.map(([x, y]): [number, number] => [x, y]) } : {}),
    };
  });
}
