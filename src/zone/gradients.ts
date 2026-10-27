/**
 * Verläufe bearbeiten (Stufe 3, Verlaufswerkzeug G; Plan 4.6, Vorbild Illustrators Verlaufsregler und Bild 5): Ziel ist
 * der Anstrich einer Form (alle Flächen ohne eigenen) oder einer Fläche. Bearbeitet wird der oberste Verlauf der
 * gewählten Art im Füllstapel; fehlt er, legt das Ziehen einen an. Griffe liegen in Pfad-Koordinaten der Form, das
 * Werkzeug rechnet in Ebenen-Koordinaten (ein Verlauf über mehrere Formen liegt in jeder an derselben Stelle der Ebene,
 * wie in Illustrator; verschiebt man eine Form, nimmt sie ihren Verlauf mit). Ohne DOM.
 */
import type { Face } from './faces';
import { faceBox } from './faces';
import { copyPaint, facePaint, setFacePaint, shapeFaces, type ZoneShape } from './nodes';
import { cloneFills, colorAt, fillsInBox, MAX_LAYERS, MAX_STOPS, type GradientFill, type GradientStop, type Paint, type PaintColor, type SwatchMap, type ZoneFill, type ZoneStyle } from './paint';
import type { LookName } from '@/world/looks';

export type GradKind = 'gradient' | 'fade';

/** Ziel: eine Form (face null) oder eine ihrer Flächen */
export interface GradTarget {
  shape: ZoneShape;
  face: Face | null;
}

/** Griffe in Ebenen-Koordinaten */
export interface GradLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** oberster sichtbarer Verlauf der Art kind im Füllstapel (Index), sonst -1 */
export function topGradient(fills: readonly ZoneFill[] | undefined, kind: GradKind): number {
  if (!fills) return -1;
  for (let i = fills.length - 1; i >= 0; i--) if (fills[i].type === kind && !fills[i].hidden) return i;
  return -1;
}

/** Rahmen des Ziels in Pfad-Koordinaten (für Stile mit Griffen am Rahmen) */
function targetBox(t: GradTarget): { minX: number; minY: number; maxX: number; maxY: number } {
  if (t.face) return faceBox(t.face);
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const f of shapeFaces(t.shape)) {
    const fb = faceBox(f);
    b.minX = Math.min(b.minX, fb.minX);
    b.minY = Math.min(b.minY, fb.minY);
    b.maxX = Math.max(b.maxX, fb.maxX);
    b.maxY = Math.max(b.maxY, fb.maxY);
  }
  return b;
}

/**
 * Anstrich des Ziels als eigene Kopie; ein verknüpfter Stil wird dabei aufgelöst (wer den Verlauf einer Fläche ändert,
 * löst sie vom Stil, wie in Illustrator)
 */
export function ownPaint(t: GradTarget, styles: ReadonlyMap<string, ZoneStyle>): Paint {
  const p = t.face ? facePaint(t.shape, t.face) : t.shape;
  const style = p.style ? styles.get(p.style) : undefined;
  if (!style) {
    const o = copyPaint(p);
    delete o.style;
    return o;
  }
  const o: Paint = { fill: style.fill };
  const fills = fillsInBox(style.fills, targetBox(t));
  if (fills?.length) o.fills = fills;
  if (style.opacity !== undefined && style.opacity < 1) o.opacity = style.opacity;
  return o;
}

/** Anstrich des Ziels schreiben (eine Form trägt ihn selbst, eine Fläche über ihren Füllpunkt) */
export function writePaint(t: GradTarget, p: Paint): void {
  if (t.face) {
    setFacePaint(t.shape, t.face, p);
    return;
  }
  const s = t.shape;
  s.fill = p.fill ?? s.fill;
  if (p.fills?.length) s.fills = p.fills;
  else delete s.fills;
  if (p.opacity !== undefined && p.opacity < 1) s.opacity = p.opacity;
  else delete s.opacity;
  delete s.style;
}

const toPlane = (s: ZoneShape, x: number, y: number): [number, number] => [s.x + s.sx * x, s.y + s.sy * y];
const toPath = (s: ZoneShape, x: number, y: number): [number, number] => [(x - s.x) / s.sx, (y - s.y) / s.sy];

/** der bearbeitete Verlauf des Ziels mit Griffen in Ebenen-Koordinaten, oder null */
export function readGradient(t: GradTarget, kind: GradKind, styles: ReadonlyMap<string, ZoneStyle>): (GradientFill & { line: GradLine }) | null {
  const p = ownPaint(t, styles);
  const i = topGradient(p.fills, kind);
  if (i < 0) return null;
  const g = p.fills![i] as GradientFill;
  const [x0, y0] = toPlane(t.shape, g.x0, g.y0);
  const [x1, y1] = toPlane(t.shape, g.x1, g.y1);
  return { ...g, line: { x0, y0, x1, y1 } };
}

/**
 * Verlauf auf das Ziel legen: den obersten der Art kind ändern oder (wenn keiner da ist und Platz ist) neu anlegen.
 * line in Ebenen-Koordinaten; stops und radial nur, wenn angegeben. Gibt false, wenn der Füllstapel voll ist
 */
export function writeGradient(t: GradTarget, kind: GradKind, styles: ReadonlyMap<string, ZoneStyle>, patch: { line?: GradLine; stops?: GradientStop[]; radial?: boolean }, fresh: () => GradientStop[]): boolean {
  const p = ownPaint(t, styles);
  const fills = p.fills ?? [];
  let i = topGradient(fills, kind);
  if (i < 0) {
    if (fills.length >= MAX_LAYERS - 1) return false;
    fills.push({ type: kind, stops: fresh(), x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 });
    i = fills.length - 1;
  }
  const g = fills[i] as GradientFill;
  if (patch.line) {
    [g.x0, g.y0] = toPath(t.shape, patch.line.x0, patch.line.y0);
    [g.x1, g.y1] = toPath(t.shape, patch.line.x1, patch.line.y1);
  }
  if (patch.stops) g.stops = patch.stops.map((s) => ({ ...s }));
  if (patch.radial !== undefined) {
    if (patch.radial) g.radial = true;
    else delete g.radial;
  }
  p.fills = fills;
  writePaint(t, p);
  return true;
}

/** obersten Verlauf der Art kind vom Ziel nehmen */
export function removeGradient(t: GradTarget, kind: GradKind, styles: ReadonlyMap<string, ZoneStyle>): void {
  const p = ownPaint(t, styles);
  const i = topGradient(p.fills, kind);
  if (i < 0) return;
  p.fills = cloneFills(p.fills)!.filter((_, k) => k !== i);
  writePaint(t, p);
}

// ------------------------------------------------------------------ Stopps

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** neuer Stopp bei t mit der Farbe, die der Verlauf dort hat (oder color); gibt Stopps und den Index des neuen */
export function addStop(stops: readonly GradientStop[], t: number, sw: SwatchMap, look: LookName, color?: PaintColor): { stops: GradientStop[]; index: number } {
  if (stops.length >= MAX_STOPS) return { stops: stops.map((s) => ({ ...s })), index: -1 };
  const here = colorAt(stops, t, sw, look);
  const s: GradientStop = { t: clamp01(t), color: color ?? here.color, a: here.a };
  const out = [...stops.map((x) => ({ ...x })), s].sort((a, b) => a.t - b.t);
  return { stops: out, index: out.indexOf(s) };
}

/** Stopp i nach t schieben (die Reihenfolge bleibt; er kommt nicht an seinen Nachbarn vorbei) */
export function moveStop(stops: readonly GradientStop[], i: number, t: number): GradientStop[] {
  const out = stops.map((s) => ({ ...s }));
  const lo = i > 0 ? out[i - 1].t : 0;
  const hi = i < out.length - 1 ? out[i + 1].t : 1;
  out[i].t = Math.max(lo, Math.min(hi, clamp01(t)));
  return out;
}

/** Stopp i entfernen (mindestens zwei bleiben) */
export function removeStop(stops: readonly GradientStop[], i: number): GradientStop[] {
  if (stops.length <= 2) return stops.map((s) => ({ ...s }));
  return stops.filter((_, k) => k !== i).map((s) => ({ ...s }));
}

/** Mitte zwischen Stopp i und i + 1 auf die Lage t (im ganzen Verlauf) setzen */
export function setMid(stops: readonly GradientStop[], i: number, t: number): GradientStop[] {
  const out = stops.map((s) => ({ ...s }));
  const a = out[i];
  const b = out[i + 1];
  if (!a || !b || b.t - a.t < 1e-6) return out;
  const m = Math.max(0.05, Math.min(0.95, (t - a.t) / (b.t - a.t)));
  if (Math.abs(m - 0.5) < 0.01) delete a.mid;
  else a.mid = Math.round(m * 1000) / 1000;
  return out;
}

/** Verlauf umkehren: Lage und Mitten spiegeln */
export function reverseStops(stops: readonly GradientStop[]): GradientStop[] {
  const out = stops.map((s) => ({ ...s, t: 1 - s.t })).reverse();
  // die Mitte gehört zum Stopp davor: nach dem Umkehren zum Stopp, der jetzt davor liegt
  const mids = stops.map((s) => s.mid);
  out.forEach((s, k) => {
    const m = mids[stops.length - 2 - k];
    if (m === undefined || k === out.length - 1) delete s.mid;
    else s.mid = Math.round((1 - m) * 1000) / 1000;
  });
  return out;
}

/** Lage eines Ebenen-Punkts auf der Linie (0 am Anfang, 1 am Ende, nicht begrenzt) */
export function lineT(l: GradLine, x: number, y: number): number {
  const dx = l.x1 - l.x0;
  const dy = l.y1 - l.y0;
  const len2 = dx * dx + dy * dy;
  return len2 < 1e-12 ? 0 : ((x - l.x0) * dx + (y - l.y0) * dy) / len2;
}
