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

// ------------------------------------------------------------------ Perspektive (Richtlinie, Schritt 1)
/**
 * Hinter einem Schalter (?persp=1): Die Spur-Ebenen bleiben bildparallel wie auf der Bühne, bekommen aber je Tiefe
 * einen Maßstab s(z) = D / (D + DEPTH_VIEW · z) um das Kameraziel herum. D ist der Kameraabstand in Metern, der
 * beim Zoomen mitfährt (Kamerafahrt: D = halbe Bildhöhe in Metern / tan(fov/2)). DEPTH_VIEW ist der Spurabstand
 * entlang der Blickrichtung der um atan(LANE_RISE/LANE_DEPTH) geneigten Kamera, deren Ortho-Bild die Bühne ist.
 * Ohne Perspektive ist s = 1 und alles hier fällt auf toStage/toWorld zurück.
 */
export const DEPTH_VIEW = LANE_DEPTH * Math.cos(Math.atan(LANE_RISE / LANE_DEPTH));

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

/** Maßstab einer Tiefe z (Spuren) relativ zur Spur 0 */
export function viewScale(z: number): number {
  if (!view.persp || !Number.isFinite(view.D)) return 1;
  return view.D / (view.D + DEPTH_VIEW * z);
}

/** Maßstab einer Zwischentiefe relativ zu ihrem Spur-Container (der selbst viewScale(round z) trägt) */
export function laneRatio(z: number): number {
  if (!view.persp) return 1;
  return viewScale(z) / viewScale(clampLane(z));
}

/** Welt → Bühne der Ansicht: wie toStage, um das Kameraziel mit s(z) skaliert (Griffe, Treffer, Effekte) */
export function toView(x: number, y: number, z: number): StagePoint {
  const p = toStage(x, y, z);
  if (!view.persp) return p;
  const s = viewScale(z);
  return { X: view.cx + (p.X - view.cx) * s, Y: view.cy + (p.Y - view.cy) * s };
}

/** Welt → Koordinaten im Spur-Container von round(z): Zwischentiefen werden um das Kameraziel nachkorrigiert */
export function toLane(x: number, y: number, z: number): StagePoint {
  const p = toStage(x, y, z);
  if (!view.persp) return p;
  const r = laneRatio(z);
  return { X: view.cx + (p.X - view.cx) * r, Y: view.cy + (p.Y - view.cy) * r };
}

/** Bühnenpunkt der Ansicht zum Strahl machen (Kameraziel beim Aufsetzen merken) */
export function tagRay(p: StagePoint): StagePoint {
  return view.persp ? { X: p.X, Y: p.Y, cx: view.cx, cy: view.cy } : { X: p.X, Y: p.Y };
}

/** Strahl auf Tiefe z (Spuren) → Welt; ohne Strahl oder Perspektive wie toWorld */
export function rayToWorld(p: StagePoint, z: number): { x: number; y: number } {
  if (!view.persp || p.cx === undefined || p.cy === undefined) return toWorld(p.X, p.Y, z);
  const s = viewScale(z);
  return toWorld(p.cx + (p.X - p.cx) / s, p.cy + (p.Y - p.cy) / s, z);
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
