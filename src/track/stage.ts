/**
 * Die Bühne: fünf Tiefenspuren (z = -2..2). Projektion von Weltkoordinaten (x, Höhe y, Tiefe z)
 * auf die Bühnenebene (X, Y in Metern), die dann von der Kamera in Pixel umgerechnet wird.
 *
 *   X = x * k(z)
 *   Y = y * k(z) + rise(z)
 *   k(z) = LANE_SCALE ^ z          (hinten kleiner)
 *   rise(z) = z * LANE_RISE        (hinten höher im Bild)
 */
import { clamp } from '@/core/math';

export const LANE_MIN = -2;
export const LANE_MAX = 2;
export const LANE_COUNT = 5;
/**
 * Tiefenabstand zwischen zwei Spuren in Metern: das Doppelte der Bodenlinien-Anhebung (LANE_RISE),
 * also eine Schrägsicht von 30° auf die Bühne. Damit hat eine Kehre über zwei Spuren 8,4 m Radius
 * (bei 60 km/h rund 2,7 g, mit Schräglage fahrbar) und über vier Spuren 16,8 m.
 * Kehren am Boden werden deshalb nicht roh aus dem Strich gelesen (die Tiefe wäre gegenüber der Bühne
 * doppelt gestreckt, mit engen Radien an Ein- und Ausfahrt), sondern wie Steilkurven als Halbkreise geformt.
 */
export const LANE_DEPTH = 8.4;
/**
 * Skalierung pro Spur. 1 = keine Verkleinerung nach hinten: Die Tiefe läuft auf dem Bild gerade nach oben, überall
 * im Level gleich (Pinsel-Zeichnen, Linie = Bahn). Mit 0,94 rückte alles nach hinten Fahrende zum linken
 * Levelrand (x = 0): „gerade nach hinten“ lief bei 60 m schon 42°, bei 120 m 61° schräg über das Bild.
 */
export const LANE_SCALE = 1;
/** Anhebung der Bodenlinie pro Spur in Bühnen-Metern */
export const LANE_RISE = 4.2;

export const laneScale = (z: number): number => Math.pow(LANE_SCALE, z);
export const laneRise = (z: number): number => z * LANE_RISE;

export interface StagePoint {
  X: number;
  Y: number;
  /** Kamera-Ziel beim Aufsetzen (nur mit Perspektive): macht den Punkt zum Strahl, der je Spur anders landet */
  cx?: number;
  cy?: number;
}

/** Welt → Bühne */
export function toStage(x: number, y: number, z: number): StagePoint {
  const k = laneScale(z);
  return { X: x * k, Y: y * k + laneRise(z) };
}

/** Bühne → Welt bei bekannter Tiefe z */
export function toWorld(X: number, Y: number, z: number): { x: number; y: number } {
  const k = laneScale(z);
  return { x: X / k, y: (Y - laneRise(z)) / k };
}

/** Nächste Spur zu einer Bühnen-Höhe Y (Bodenlinien liegen bei rise(z)). */
export function nearestLane(Y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let z = LANE_MIN; z <= LANE_MAX; z++) {
    const d = Math.abs(Y - laneRise(z));
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export const clampLane = (z: number): number => clamp(Math.round(z), LANE_MIN, LANE_MAX);

/** Luftperspektive: 0 vorne (satt) → 1 hinten (hell) */
export const laneAtmosphere = (z: number): number => (z - LANE_MIN) / (LANE_MAX - LANE_MIN);

// ------------------------------------------------------------------ Perspektive (Richtlinie, Schritt 1; Kamera exakt seit Etappe 1)
/**
 * Hinter einem Schalter (?persp=1; mit dem Weltrenderer ?world=1 Standard): Die Bühne ist das Ortho-Bild einer um
 * CAMERA_TILT = atan(LANE_RISE / LANE_DEPTH) = 26,57° nach unten geneigten Kamera, senkrecht um 1/cos gestreckt, damit
 * ein senkrechter Meter so lang bleibt wie ein waagerechter (Richtlinie 2.1). Mit Perspektive steht dieselbe Kamera im
 * Abstand D vor dem Kameraziel (cx, cy) auf der Spur-0-Ebene und fährt beim Zoomen heran (Kamerafahrt:
 * D = halbe Bildhöhe in Metern / tan(fov/2)). Ein Weltpunkt (x, y, z) erscheint um das Ziel mit dem Faktor D / W
 * skaliert; W ist seine Tiefe entlang der Blickrichtung: W = D + DEPTH_VIEW·z − (y − cy)·sin(Neigung). Spuren rücken je
 * DEPTH_VIEW nach hinten, was über dem Ziel liegt, rückt der geneigten Kamera näher. Das ist genau die Projektion des
 * Weltrenderers (src/world/camera.ts, Test tests/world.test.ts); die Spur-Container der Bühnendarstellung skalieren
 * einheitlich mit dem Maßstab auf Zielhöhe (viewScale) und korrigieren jeden Punkt über toLaneOf nach. Ohne Perspektive
 * ist D unendlich, und alles hier fällt auf toStage/toWorld zurück.
 */
export const CAMERA_TILT = Math.atan(LANE_RISE / LANE_DEPTH);
const TILT_SIN = Math.sin(CAMERA_TILT);
/** Spurabstand entlang der Blickrichtung der geneigten Kamera (Meter) */
export const DEPTH_VIEW = LANE_DEPTH * Math.cos(CAMERA_TILT);

export interface ViewState {
  persp: boolean;
  /** Bildwinkel (Grad, senkrecht) */
  fov: number;
  /** Kameraabstand zur Spur-0-Ebene in Metern (Infinity = Bühne) */
  D: number;
  /** Kameraziel auf der Bühne (Spur 0) */
  cx: number;
  cy: number;
}

const view: ViewState = { persp: false, fov: 18, D: Infinity, cx: 0, cy: 0 };

export function setPerspective(on: boolean, fov = view.fov): void {
  view.persp = on;
  view.fov = fov;
}

/** je Bild von der Weltansicht gesetzt: Kameraziel und Abstand */
export function setView(cx: number, cy: number, D: number): void {
  view.cx = cx;
  view.cy = cy;
  view.D = D;
}

export function viewState(): Readonly<ViewState> {
  return view;
}

/** Kameraabstand (Meter) für Zoom (px/m) und Bildhöhe (px) bei Bildwinkel fov (Grad): Kamerafahrt */
export function viewDistance(zoom: number, screenHeight: number, fov = view.fov): number {
  return screenHeight / 2 / zoom / Math.tan((fov * Math.PI) / 360);
}

const perspOn = (): boolean => view.persp && Number.isFinite(view.D);

/** Tiefe eines Weltpunkts (Höhe y, Tiefe z in Spuren) entlang der Blickrichtung, von der Kamera aus (Meter) */
export function viewDepth(y: number, z: number): number {
  return view.D + DEPTH_VIEW * z - (y - view.cy) * TILT_SIN;
}

/** Maßstab eines Weltpunkts relativ zum Kameraziel (1 am Ziel, kleiner hinten und unten) */
export function pointScale(y: number, z: number): number {
  if (!perspOn()) return 1;
  return view.D / viewDepth(y, z);
}

/** Maßstab einer Spur-Ebene z auf Zielhöhe (y = cy) relativ zur Spur 0: der Maßstab der Spur-Container */
export function viewScale(z: number): number {
  if (!perspOn()) return 1;
  return view.D / (view.D + DEPTH_VIEW * z);
}

/**
 * Maßstab einer Zwischentiefe z (auf Höhe y, sonst auf Zielhöhe) relativ zum Spur-Container lane (der selbst
 * viewScale(lane) trägt)
 */
export function laneRatioFor(z: number, lane: number, y = view.cy): number {
  if (!perspOn()) return 1;
  return pointScale(y, z) / viewScale(lane);
}

/** Maßstab einer Zwischentiefe relativ zu ihrem nächsten Spur-Container */
export function laneRatio(z: number): number {
  return laneRatioFor(z, clampLane(z));
}

/**
 * Welt → Koordinaten im Spur-Container lane: Zwischentiefen werden um das Kameraziel nachkorrigiert. Alle Punkte eines
 * Stücks müssen gegen dieselbe Spur korrigiert werden (die des Containers), sonst reißt die Bahn an Spurgrenzen auf,
 * wo linke und rechte Schiene verschieden runden.
 */
export function toLaneOf(x: number, y: number, z: number, lane: number): StagePoint {
  const p = toStage(x, y, z);
  if (!perspOn()) return p;
  const r = laneRatioFor(z, lane, y);
  return { X: view.cx + (p.X - view.cx) * r, Y: view.cy + (p.Y - view.cy) * r };
}

/** Welt → Bühne der Ansicht: wie toStage, um das Kameraziel mit dem Maßstab des Punkts skaliert (Griffe, Treffer, Effekte) */
export function toView(x: number, y: number, z: number): StagePoint {
  const p = toStage(x, y, z);
  if (!perspOn()) return p;
  const s = pointScale(y, z);
  return { X: view.cx + (p.X - view.cx) * s, Y: view.cy + (p.Y - view.cy) * s };
}

/** Welt → Koordinaten im nächsten Spur-Container (round z) */
export function toLane(x: number, y: number, z: number): StagePoint {
  return toLaneOf(x, y, z, clampLane(z));
}

/** Bühnenpunkt der Ansicht zum Strahl machen (Kameraziel beim Aufsetzen merken) */
export function tagRay(p: StagePoint): StagePoint {
  return view.persp ? { X: p.X, Y: p.Y, cx: view.cx, cy: view.cy } : { X: p.X, Y: p.Y };
}

/**
 * Strahl auf Tiefe z (Spuren) → Welt: Der Strahl durch den Bildpunkt schneidet die senkrechte Spur-Ebene z. Aus
 * Yi·W = (dy + rise(z))·D (Yi Bildhöhe über dem Ziel, dy Höhe über dem Ziel) folgt dy, daraus W und die Breite.
 * Ohne Strahl oder Perspektive wie toWorld.
 */
export function rayToWorld(p: StagePoint, z: number): { x: number; y: number } {
  if (!perspOn() || p.cx === undefined || p.cy === undefined) return toWorld(p.X, p.Y, z);
  const D = view.D;
  const Yi = p.Y - p.cy;
  const dy = (Yi * (D + DEPTH_VIEW * z) - laneRise(z) * D) / (D + Yi * TILT_SIN);
  const W = D + DEPTH_VIEW * z - dy * TILT_SIN;
  return toWorld(p.cx + ((p.X - p.cx) * W) / D, p.cy + dy + laneRise(z), z);
}

/** Zwischenpunkt zweier Strahlen (Lage und Kamera linear) */
export function mixPoint(a: StagePoint, b: StagePoint, t: number): StagePoint {
  const p: StagePoint = { X: a.X + (b.X - a.X) * t, Y: a.Y + (b.Y - a.Y) * t };
  const ac = a.cx !== undefined && a.cy !== undefined;
  const bc = b.cx !== undefined && b.cy !== undefined;
  if (ac && bc) {
    p.cx = a.cx! + (b.cx! - a.cx!) * t;
    p.cy = a.cy! + (b.cy! - a.cy!) * t;
  } else if (ac) {
    p.cx = a.cx;
    p.cy = a.cy;
  } else if (bc) {
    p.cx = b.cx;
    p.cy = b.cy;
  }
  return p;
}

/** Punkte ohne Strahl (erzeugte Bögen, Rundenschluss) bekommen den Strahl des nächsten getaggten Nachbarn */
export function fillRays(pts: StagePoint[]): void {
  let last: StagePoint | null = null;
  for (const p of pts) {
    if (p.cx !== undefined) last = p;
    else if (last) {
      p.cx = last.cx;
      p.cy = last.cy;
    }
  }
  let next: StagePoint | null = null;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    if (p.cx !== undefined) next = p;
    else if (next) {
      p.cx = next.cx;
      p.cy = next.cy;
    }
  }
}
