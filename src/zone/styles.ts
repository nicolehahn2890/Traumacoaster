/**
 * Stile (Stufe 3, Plan 4.6; Vorbild Illustrators Grafikstile und Figmas Eigenschaften kopieren): Ein Stil ist ein
 * gespeicherter Anstrich (Grundfarbe, Füllstapel, Deckkraft) mit Namen; Verlaufsgriffe liegen als Anteil am Rahmen der
 * Fläche, damit er auf jede Fläche passt. Verknüpft trägt eine Fläche nur seine Kennung (und eine Kopie als Rückfall):
 * ändert sich der Stil, ändern sich alle Flächen mit; wer ihren Füllstapel bearbeitet, löst sie. Ohne DOM.
 */
import { faceAt, faceBox } from './faces';
import { ownPaint, targetBox, writePaint, type GradTarget } from './gradients';
import { copyPaint, facePaint, isShape, setFacePaint, shapeFaces, styleMap, type ZoneNode } from './nodes';
import { cloneFills, fillsInBox, fillsToBox, type Paint, type ZoneFill, type ZoneStyle } from './paint';

/** Anstrich als Stil-Inhalt (Griffe am Rahmen) und die Kennung eines verknüpften Stils */
export interface StyleClip {
  fill: string;
  fills?: ZoneFill[];
  opacity?: number;
  style?: string;
}

type ShapeTarget = Extract<GradTarget, { shape: unknown }>;

/** Inhalt des Anstrichs eines Ziels als Stil (Grundfarbe, Füllungen mit Griffen am Rahmen, Deckkraft) */
export function paintToStyle(t: ShapeTarget, styles: ReadonlyMap<string, ZoneStyle>): StyleClip | null {
  const p = ownPaint(t, styles);
  if (p.fill === null) return null;
  const out: StyleClip = { fill: p.fill };
  const fills = fillsToBox(p.fills, targetBox(t));
  if (fills?.length) out.fills = fills;
  if (p.opacity !== undefined && p.opacity < 1) out.opacity = p.opacity;
  const linked = linkedStyle(t, styles);
  if (linked) out.style = linked;
  return out;
}

/** verknüpften Stil des Ziels (Kennung), wenn es einen gibt und er existiert */
export function linkedStyle(t: ShapeTarget, styles: ReadonlyMap<string, ZoneStyle>): string | null {
  const p: Paint = t.face ? facePaint(t.shape, t.face) : t.shape;
  return p.style && styles.has(p.style) ? p.style : null;
}

/** Ziel mit einem Stil verknüpfen (als Rückfall bekommt es eine Kopie seines Inhalts) */
export function linkStyle(t: ShapeTarget, style: ZoneStyle): void {
  const fills = fillsInBox(style.fills, targetBox(t));
  const p: Paint = { fill: style.fill, style: style.id };
  if (fills?.length) p.fills = fills;
  if (style.opacity !== undefined && style.opacity < 1) p.opacity = style.opacity;
  if (t.face) {
    setFacePaint(t.shape, t.face, p);
    return;
  }
  const s = t.shape;
  s.fill = style.fill;
  if (p.fills) s.fills = p.fills;
  else delete s.fills;
  if (p.opacity !== undefined) s.opacity = p.opacity;
  else delete s.opacity;
  s.style = style.id;
}

/** Ziel vom Stil lösen: es behält, was der Stil gerade zeigt */
export function unlinkStyle(t: ShapeTarget, styles: ReadonlyMap<string, ZoneStyle>): void {
  writePaint(t, ownPaint(t, styles));
}

/** eingefügten Stil-Inhalt auf das Ziel legen: verknüpft, wenn er von einem vorhandenen Stil kam */
export function pasteStyle(t: ShapeTarget, clip: StyleClip, styles: ReadonlyMap<string, ZoneStyle>): void {
  const linked = clip.style ? styles.get(clip.style) : undefined;
  if (linked) {
    linkStyle(t, linked);
    return;
  }
  const p: Paint = { fill: clip.fill };
  const fills = fillsInBox(clip.fills, targetBox(t));
  if (fills?.length) p.fills = fills;
  if (clip.opacity !== undefined) p.opacity = clip.opacity;
  writePaint(t, p);
}

/** neuer Stil aus dem Inhalt (ohne Verknüpfung) */
export function styleFromClip(id: string, name: string, clip: StyleClip): ZoneStyle {
  const y: ZoneStyle = { id, kind: 'style', name, fill: clip.fill };
  if (clip.fills?.length) y.fills = cloneFills(clip.fills);
  if (clip.opacity !== undefined && clip.opacity < 1) y.opacity = clip.opacity;
  return y;
}

/**
 * Stil auflösen (vor dem Löschen): jede verknüpfte Form und Fläche behält, was er zeigt, als eigenen Anstrich
 */
export function bakeStyle(nodes: readonly ZoneNode[], id: string): void {
  const styles = styleMap(nodes);
  const style = styles.get(id);
  if (!style) return;
  for (const s of nodes) {
    if (!isShape(s)) continue;
    if (s.style === id) unlinkStyle({ shape: s, face: null }, styles);
    if (!s.regions?.some((r) => r.style === id)) continue;
    const faces = shapeFaces(s);
    s.regions = s.regions.map((r) => {
      if (r.style !== id) return r;
      const i = faceAt(faces, r.x, r.y);
      const box = i >= 0 ? faceBox(faces[i]) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      const o = copyPaint({ fill: style.fill, fills: fillsInBox(style.fills, box), opacity: style.opacity });
      return { x: r.x, y: r.y, ...o };
    });
  }
}
