/**
 * Malvorlagen für gemalte Teile (docs/ZONENEDITOR-PLAN.md, Stufe 6; Plan 4.10 „Malvorlage für gemalte Teile: je Fläche oder
 * Ebene ein PNG mit Alphakanal in der Zielgröße (aus Tiefe und größtem Zoom), dazu eine SVG mit Schnittpfad und Bild … und
 * eine kleine Begleitdatei mit Lage, Tiefe und Fingerabdruck der Form“; Risiko „Gemalte Teile passen nicht mehr nach
 * Formänderungen“).
 *
 * Eine Vorlage ist ein Bild aus **Malbereich** und **Rand**. Im Malbereich liegt die Form als halbdurchsichtige Silhouette
 * mit Umriss (eine Fläche: dazu die Linien der anderen Flächen), mit einem Streifen Überstand rundum, damit kleine
 * Formänderungen und die Kante Farbe haben; ein Saum zeigt den geraden Streifen mit der Lage der Kante und der Teilung
 * Anfang | Mitte | Ende. Im Rand stehen vier **Passmarken** (Magenta-Kreuze) und eine Zeile mit Name, Größe, Bildpunkten je
 * Meter, Schärfe und Fingerabdruck. Florian malt in Procreate auf einer Ebene darüber, blendet die Vorlage aus und teilt
 * als PNG (Florian, 30.10.2026: „PNG reicht“). Der Import erkennt die Vorlage am Namen (…-v12) oder an der Größe, schneidet
 * den Rand ab und setzt das Bild genau in den Rahmen der Vorlage. Hat jemand die Leinwand verkleinert oder vergrößert, gilt
 * das Seitenverhältnis; ist sie beschnitten, finden die Passmarken (wenn sie mit im Bild sind) die Lage.
 *
 * Der **Fingerabdruck** ist ein Prüfwert über den Umriss (Pfad-Koordinaten, auf Zentimeter): Verschieben und Skalieren der
 * Form ändern ihn nicht (das Bild geht mit), Anker und Kurven schon. Weicht er ab, misst `templateDrift` wie weit
 * (Bildpunkte der Vorlage) und der Editor warnt.
 *
 * Ohne Renderer und DOM: das SVG rastert der Editor (Zeichenfläche) oder ein Skript (sharp).
 */
import { faceAt } from './faces';
import { flattenPath, simplifyPoly, type Poly } from './path';
import { shapeFaces, shapeLocalPolys, type ZonePlane, type ZoneShape, type ZoneTemplate } from './nodes';
import { rimLengths, type ZoneRim } from './rims';
import type { ImageFill } from './paint';

/** Rand mit Passmarken (Bildpunkte) */
export const TEMPLATE_MARGIN = 64;
/** längste Seite des Malbereichs (Procreate und iPad-Speicher; Plan 3.3: Bilder im Editor sonst höchstens 2048) */
export const TEMPLATE_MAX = 4096;
/** Farbe der Passmarken (kommt in gemalten Bildern nicht vor) */
export const MARK_COLOR = '#ff00ff';

/** Ansicht, für die eine Vorlage scharf sein soll: größter Zoom (CSS-Bildpunkte je Meter auf Spur 0), Auflösung, Bildschirmhöhe, Bildwinkel */
export interface SharpView {
  maxZoom: number;
  dpr: number;
  height: number;
  fov: number;
}

/** Platzhalter: das Handy quer (390 CSS-Bildpunkte hoch), Auflösung 2 wie das Spiel, größter Zoom der Spielkamera, 18° */
export const PHONE_VIEW: SharpView = { maxZoom: 60, dpr: 2, height: 390, fov: 18 };

/**
 * Bildpunkte je Meter der Ebene, die eine Ebene beim größten Zoom braucht: Zoom mal Auflösung mal der Verkleinerung in der
 * Tiefe (Abstand der Kamera zur Spur 0 durch Abstand zur Ebene) mal dem Maßstab der Ebene („Bild halten“)
 */
export function neededPpm(plane: ZonePlane, v: SharpView = PHONE_VIEW): number {
  const D = v.height / 2 / v.maxZoom / Math.tan((v.fov * Math.PI) / 360);
  return v.maxZoom * v.dpr * (D / Math.max(0.5, D + plane.z)) * Math.abs(plane.scale);
}

/** bis zu welchem Zoom ein Bild mit ppm Bildpunkten je Meter der Ebene scharf ist */
export function sharpZoom(plane: ZonePlane, ppm: number, v: SharpView = PHONE_VIEW): number {
  // die Verkleinerung hängt selbst vom Zoom ab; in kleinen Schritten suchen
  let z = v.maxZoom;
  while (z > 1 && neededPpm(plane, { ...v, maxZoom: z }) > ppm * 1.001) z *= 0.97;
  return Math.round(Math.max(1, Math.min(v.maxZoom, z)) * 10) / 10;
}

/** Prüfwert über Polygone (Zentimeter), 8 Hex-Zeichen */
export function fingerprint(polys: readonly Poly[]): string {
  let h = 2166136261;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v & 0xffff), 16777619);
    h = Math.imul(h ^ ((v >>> 16) & 0xffff), 16777619);
  };
  for (const p of polys) {
    mix(p.length);
    for (const [x, y] of p) {
      mix(Math.round(x * 100) | 0);
      mix(Math.round(y * 100) | 0);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Umriss und Löcher des Ziels in Pfad-Koordinaten: die ganze Form oder die Fläche am Punkt face */
export function targetPolys(shape: ZoneShape, face?: readonly [number, number]): { outline: Poly; holes: Poly[] } | null {
  if (!face) {
    const { outline, holes } = shapeLocalPolys({ ...shape, sx: 1, sy: 1 });
    return outline.length >= 3 ? { outline, holes } : null;
  }
  const faces = shapeFaces(shape, 1);
  const i = faceAt(faces, face[0], face[1]);
  return i >= 0 ? { outline: faces[i].outline, holes: faces[i].holes } : null;
}

/** Fingerabdruck des Ziels einer Vorlage (Fläche: Umriss und Löcher; Saum gestreckt: Längen der Kantenstücke) */
export function targetFingerprint(shape: ZoneShape, t: Pick<ZoneTemplate, 'face' | 'rim' | 'mode'>): string {
  if (t.rim) {
    const rim = shape.rims?.find((r) => r.id === t.rim);
    if (!rim) return '';
    return t.mode === 'stretch' ? fingerprint([rimLengths(shape, rim).map((l): [number, number] => [l, 0])]) : 'saum';
  }
  const tp = targetPolys(shape, t.face);
  return tp ? fingerprint([tp.outline, ...tp.holes]) : '';
}

/** Rahmen eines Bilds (wie ImageFill) */
export interface Frame {
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/** was eine Vorlage zum Zeichnen braucht: Datensatz und Linien in Bildpunkten des Malbereichs (y nach unten) */
export interface TemplateDraft {
  t: ZoneTemplate;
  /** Fläche: Silhouette (Umriss und Löcher) und weitere Linien (andere Flächen der Form) */
  silhouette?: Poly[];
  lines?: Poly[];
  /** Saum: Lage der Kante (Bildpunkte von oben), Grenzen Anfang | Mitte | Ende (Bildpunkte von links) */
  edgeY?: number;
  caps?: [number, number];
  /** bis zu welchem Zoom der Malbereich scharf ist, und der größte Zoom */
  sharp: number;
  maxZoom: number;
}

/** Punkt in Pfad-Koordinaten → Bildpunkt im Malbereich (x nach rechts, y nach unten) */
function toPx(f: Frame, w: number, h: number): (x: number, y: number) => [number, number] {
  const det = f.ux * f.vy - f.vx * f.uy || 1e-12;
  return (x, y) => {
    const qx = x - f.ox;
    const qy = y - f.oy;
    const u = (f.vy * qx - f.vx * qy) / det;
    const v = (-f.uy * qx + f.ux * qy) / det;
    return [Math.round(u * w * 10) / 10, Math.round((1 - v) * h * 10) / 10];
  };
}

/** Name für Dateien: klein, ohne Umlaute und Leerzeichen */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'teil'
  );
}

/** Dateiname einer Vorlage (ohne Endung); die Kennung am Ende findet der Import wieder */
export const templateFile = (t: ZoneTemplate): string => `vorlage-${slug(t.name)}-${t.id}`;

/**
 * Vorlage für eine Form oder eine ihrer Flächen: Rahmen um das Ziel plus Überstand (3 % der größeren Seite, mindestens
 * 0,4 m), Bildpunkte je Meter aus Tiefe und größtem Zoom, die längste Seite höchstens TEMPLATE_MAX
 */
export function faceTemplate(id: string, plane: ZonePlane, shape: ZoneShape, face: [number, number] | null, made: string, v: SharpView = PHONE_VIEW, max = TEMPLATE_MAX): TemplateDraft | null {
  const tp = targetPolys(shape, face ?? undefined);
  if (!tp) return null;
  const sx = shape.sx;
  const sy = shape.sy;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of tp.outline) {
    minX = Math.min(minX, x * sx);
    maxX = Math.max(maxX, x * sx);
    minY = Math.min(minY, y * sy);
    maxY = Math.max(maxY, y * sy);
  }
  const bleed = Math.max(0.4, 0.03 * Math.max(maxX - minX, maxY - minY));
  const wm = maxX - minX + 2 * bleed;
  const hm = maxY - minY + 2 * bleed;
  const need = neededPpm(plane, v);
  const ppm = Math.min(need, max / Math.max(wm, hm));
  const frame: Frame = { ox: (minX - bleed) / sx, oy: (minY - bleed) / sy, ux: wm / sx, uy: 0, vx: 0, vy: hm / sy };
  const w = Math.max(1, Math.round(wm * ppm));
  const h = Math.max(1, Math.round(hm * ppm));
  const px = toPx(frame, w, h);
  // Umriss für die Abweichung: 1 Bildpunkt Toleranz, bei großen Formen gröber, bis höchstens 200 Punkte bleiben
  let tol = 1 / ppm / Math.max(1e-6, Math.max(Math.abs(sx), Math.abs(sy)));
  let ref = simplifyPoly(tp.outline, tol);
  while (ref.length > 200) ref = simplifyPoly(tp.outline, (tol *= 1.5));
  const t: ZoneTemplate = {
    id,
    kind: 'template',
    name: face ? `${shape.name} Fläche` : shape.name,
    shape: shape.id,
    w,
    h,
    margin: TEMPLATE_MARGIN,
    ppm: Math.round(ppm * 1000) / 1000,
    ...frame,
    fp: fingerprint([tp.outline, ...tp.holes]),
    ref: ref.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]),
    made,
  };
  if (face) t.face = face;
  // die anderen Flächen der Form als Linien (beim Malen sieht man die Teilung)
  const lines: Poly[] = [];
  if (!face && (shape.cuts?.length ?? 0) > 0) for (const c of shape.cuts ?? []) lines.push(flattenPath(c.path, 0.25, c.closed).map(([x, y]) => px(x, y)));
  return { t, silhouette: [tp.outline, ...tp.holes].map((p) => p.map(([x, y]) => px(x, y))), lines, sharp: sharpZoom(plane, ppm, v), maxZoom: v.maxZoom };
}

/**
 * Vorlage für einen Saum: wiederholen gibt ein Stück aus Anfang, Mitte und Ende im Seitenverhältnis seines Bilds (mit dessen
 * Teilung); strecken einen Streifen so lang wie das längste Kantenstück. Höhe aus der Höhe des Saums, die längste Seite
 * höchstens TEMPLATE_MAX
 */
export function rimTemplate(id: string, plane: ZonePlane, shape: ZoneShape, rim: ZoneRim, mode: ZoneRim['mode'], made: string, v: SharpView = PHONE_VIEW, max = TEMPLATE_MAX): TemplateDraft | null {
  const lens = rimLengths(shape, rim);
  const wm = mode === 'stretch' ? Math.max(rim.width, ...lens) : rim.width * rim.aspect;
  const hm = rim.width;
  if (!(wm > 0) || !(hm > 0)) return null;
  const need = neededPpm(plane, v);
  const ppm = Math.min(need, max / Math.max(wm, hm));
  const w = Math.max(1, Math.round(wm * ppm));
  const h = Math.max(1, Math.round(hm * ppm));
  const t: ZoneTemplate = {
    id,
    kind: 'template',
    name: `${shape.name} Saum ${mode === 'stretch' ? 'Streifen' : 'Stück'}`,
    shape: shape.id,
    rim: rim.id,
    w,
    h,
    margin: TEMPLATE_MARGIN,
    ppm: Math.round(ppm * 1000) / 1000,
    mode,
    a: mode === 'stretch' ? 0 : rim.a,
    b: mode === 'stretch' ? 1 : rim.b,
    fp: mode === 'stretch' ? fingerprint([lens.map((l): [number, number] => [l, 0])]) : 'saum',
    made,
  };
  if (mode === 'stretch') t.lens = lens.map((l) => Math.round(l * 1000) / 1000);
  return { t, edgeY: Math.round((1 - rim.base) * h), caps: mode === 'stretch' ? undefined : [Math.round(rim.a * w), Math.round(rim.b * w)], sharp: sharpZoom(plane, ppm, v), maxZoom: v.maxZoom };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pathD = (polys: readonly Poly[], dx: number, dy: number): string => polys.map((p) => `M${p.map(([x, y]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`).join('L')}Z`).join('');
const fmt = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

/** Mitten der vier Passmarken im ganzen Bild (Malbereich plus Rand): oben links, oben rechts, unten links, unten rechts */
export function markCenters(t: Pick<ZoneTemplate, 'w' | 'h' | 'margin'>): Array<[number, number]> {
  const m = t.margin / 2;
  return [
    [m, m],
    [t.w + t.margin * 1.5, m],
    [m, t.h + t.margin * 1.5],
    [t.w + t.margin * 1.5, t.h + t.margin * 1.5],
  ];
}

/**
 * Das Vorlagenbild als SVG in Bildpunkten (Malbereich plus Rand, Hintergrund durchsichtig). Platzhalter: Farben, Strichstärken
 * und Wortlaut der Zeile
 */
export function templateSvg(d: TemplateDraft, zoneName: string): string {
  const { t } = d;
  const m = t.margin;
  const W = t.w + 2 * m;
  const H = t.h + 2 * m;
  const sw = Math.max(1.5, Math.min(6, Math.max(t.w, t.h) / 800));
  const parts: string[] = [];
  parts.push(`<rect x="${m}" y="${m}" width="${t.w}" height="${t.h}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1" stroke-dasharray="8 6"/>`);
  if (d.silhouette) {
    parts.push(`<path d="${pathD(d.silhouette, m, m)}" fill="rgba(120,120,120,0.35)" fill-rule="evenodd" stroke="rgba(25,25,25,0.9)" stroke-width="${sw}" stroke-linejoin="round"/>`);
    for (const l of d.lines ?? []) parts.push(`<polyline points="${l.map(([x, y]) => `${(x + m).toFixed(1)},${(y + m).toFixed(1)}`).join(' ')}" fill="none" stroke="rgba(25,25,25,0.6)" stroke-width="${sw * 0.6}" stroke-dasharray="${sw * 4} ${sw * 3}"/>`);
  }
  if (d.edgeY !== undefined) {
    // Saum: der Streifen, die Kante (die Form liegt darunter), Anfang | Mitte | Ende
    parts.push(`<rect x="${m}" y="${m + d.edgeY}" width="${t.w}" height="${t.h - d.edgeY}" fill="rgba(120,120,120,0.25)"/>`);
    parts.push(`<line x1="${m}" y1="${m + d.edgeY}" x2="${m + t.w}" y2="${m + d.edgeY}" stroke="rgba(25,25,25,0.9)" stroke-width="${sw}"/>`);
    const fs = Math.max(12, Math.min(28, t.h / 10));
    parts.push(`<text x="${m + 8}" y="${m + d.edgeY - 8}" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="rgba(25,25,25,0.8)">Kante der Form (darunter liegt die Fläche)</text>`);
    if (d.caps) {
      for (const x of d.caps) parts.push(`<line x1="${m + x}" y1="${m}" x2="${m + x}" y2="${m + t.h}" stroke="rgba(25,25,25,0.7)" stroke-width="${sw}" stroke-dasharray="${sw * 5} ${sw * 4}"/>`);
      const label = (x0: number, x1: number, s: string) => (x1 - x0 > fs * 3 ? `<text x="${m + (x0 + x1) / 2}" y="${m + fs * 1.4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="rgba(25,25,25,0.8)">${s}</text>` : '');
      parts.push(label(0, d.caps[0], 'Anfang'), label(d.caps[0], d.caps[1], 'Mitte: wiederholt sich, links und rechts nahtlos'), label(d.caps[1], t.w, 'Ende'));
    }
  }
  const r = m * 0.28;
  for (const [x, y] of markCenters(t)) {
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${MARK_COLOR}"/>`);
    parts.push(`<path d="M${x - r * 1.6},${y}H${x + r * 1.6}M${x},${y - r * 1.6}V${y + r * 1.6}" stroke="${MARK_COLOR}" stroke-width="${Math.max(2, r / 4)}"/>`);
  }
  const info = `Malvorlage ${zoneName} · ${t.name} · ${t.w} × ${t.h} px · ${fmt(t.ppm)} px/m · scharf bis Zoom ${fmt(d.sharp, 0)} von ${d.maxZoom} · Fingerabdruck ${t.fp} · ${t.id}`;
  parts.push(`<text x="${m}" y="${m * 0.62}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(m * 0.32)}" fill="rgba(25,25,25,0.85)">${esc(info)}</text>`);
  parts.push(`<text x="${m}" y="${t.h + m + m * 0.62}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(m * 0.26)}" fill="rgba(25,25,25,0.7)">${esc('Auf einer Ebene darüber malen, über den Umriss hinaus bis an den gestrichelten Rand. Vorlage ausblenden, als PNG teilen, Größe nicht ändern.')}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

/**
 * SVG für Illustrator (Plan 4.10 „eine SVG mit Schnittpfad und Bild (wird in Illustrator eine Schnittgruppe)“): das Bild
 * (die Vorlage oder das gemalte Bild) in der Größe des Malbereichs, beschnitten mit der Silhouette
 */
export function clipSvg(d: TemplateDraft, href: string): string {
  const { t } = d;
  const clip = d.silhouette ? `<clipPath id="form"><path d="${pathD(d.silhouette, 0, 0)}" clip-rule="evenodd"/></clipPath>` : '';
  const img = `<image href="${esc(href)}" x="0" y="0" width="${t.w}" height="${t.h}"${d.silhouette ? ' clip-path="url(#form)"' : ''}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${t.w}" height="${t.h}" viewBox="0 0 ${t.w} ${t.h}"><defs>${clip}</defs><g id="${esc(t.id)}">${img}</g></svg>`;
}

/** Begleitdatei (Paket 8b, andere Werkzeuge): Lage, Größe, Tiefe und Fingerabdruck */
export function templateJson(d: TemplateDraft, zoneName: string, plane: ZonePlane): string {
  const { t } = d;
  return JSON.stringify({ zone: zoneName, vorlage: t.id, name: t.name, form: t.shape, flaeche: t.face ?? null, saum: t.rim ?? null, art: t.mode ?? null, malbereich: { w: t.w, h: t.h }, rand: t.margin, pxJeMeter: t.ppm, scharfBisZoom: d.sharp, groessterZoom: d.maxZoom, ebene: { id: plane.id, name: plane.name, tiefe: plane.z, massstab: plane.scale }, rahmen: t.ox !== undefined ? { ox: t.ox, oy: t.oy, ux: t.ux, uy: t.uy, vx: t.vx, vy: t.vy } : null, teilung: t.a !== undefined ? [t.a, t.b] : null, fingerabdruck: t.fp, angelegt: t.made }, null, 2);
}

// ------------------------------------------------------------------ Import

/** ein Bild als rohe Bildpunkte (RGBA, 4 Bytes je Punkt) */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** die Vorlage zu einem Bild: am Namen (…-v12), sonst an der Größe (mit oder ohne Rand, gleiches Seitenverhältnis) */
export function matchTemplate(templates: readonly ZoneTemplate[], fileName: string, w: number, h: number): ZoneTemplate | null {
  const m = /(?:^|[^a-z0-9])v(\d{1,6})(?=[^0-9]|$)/i.exec(fileName.replace(/\.[a-z0-9]+$/i, ''));
  if (m) {
    const t = templates.find((x) => x.id === `v${m[1]}`);
    if (t) return t;
  }
  const same = (a: number, b: number) => Math.abs(a / b - 1) < 0.004;
  const exact = templates.filter((t) => (w === t.w + 2 * t.margin && h === t.h + 2 * t.margin) || (w === t.w && h === t.h));
  if (exact.length) return exact[exact.length - 1];
  const ratio = templates.filter((t) => same(w / h, (t.w + 2 * t.margin) / (t.h + 2 * t.margin)) || same(w / h, t.w / t.h));
  return ratio.length ? ratio[ratio.length - 1] : null;
}

/** Mitten magentafarbener Flecken in den vier Ecken (Passmarken), null für eine Ecke ohne */
export function findMarks(img: RawImage): Array<[number, number] | null> {
  const { width: W, height: H, data } = img;
  const box = (x0: number, y0: number, x1: number, y1: number): [number, number] | null => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 160));
    for (let y = y0; y < y1; y += step)
      for (let x = x0; x < x1; x += step) {
        const i = (y * W + x) * 4;
        if (data[i + 3] > 160 && data[i] > 200 && data[i + 2] > 200 && data[i + 1] < 90) {
          sx += x;
          sy += y;
          n++;
        }
      }
    return n >= 3 ? [sx / n, sy / n] : null;
  };
  const cw = Math.max(8, Math.floor(W * 0.2));
  const ch = Math.max(8, Math.floor(H * 0.2));
  return [box(0, 0, cw, ch), box(W - cw, 0, W, ch), box(0, H - ch, cw, H), box(W - cw, H - ch, W, H)];
}

/**
 * Wo im Bild der Malbereich einer Vorlage liegt (x, y, Breite, Höhe in Bildpunkten des Bilds) und wie genau: exakt (gleiche
 * Größe mit oder ohne Rand), skaliert (gleiches Seitenverhältnis), Passmarken (mindestens zwei gegenüberliegende Ecken),
 * gestreckt (nichts passt: das ganze Bild, mit Warnung)
 */
export function importRect(t: ZoneTemplate, img: RawImage): { x: number; y: number; w: number; h: number; how: 'exact' | 'scaled' | 'marks' | 'stretched' } {
  const W = img.width;
  const H = img.height;
  const fullW = t.w + 2 * t.margin;
  const fullH = t.h + 2 * t.margin;
  if (W === fullW && H === fullH) return { x: t.margin, y: t.margin, w: t.w, h: t.h, how: 'exact' };
  if (W === t.w && H === t.h) return { x: 0, y: 0, w: W, h: H, how: 'exact' };
  const same = (a: number, b: number) => Math.abs(a / b - 1) < 0.004;
  if (same(W / H, fullW / fullH)) {
    const k = W / fullW;
    return { x: t.margin * k, y: t.margin * k, w: t.w * k, h: t.h * k, how: 'scaled' };
  }
  if (same(W / H, t.w / t.h)) return { x: 0, y: 0, w: W, h: H, how: 'scaled' };
  const marks = findMarks(img);
  const want = markCenters(t);
  // zwei gegenüberliegende Marken genügen für Maßstab und Lage
  for (const [a, b] of [[0, 3], [1, 2]] as const) {
    const pa = marks[a];
    const pb = marks[b];
    if (!pa || !pb) continue;
    const kx = (pb[0] - pa[0]) / (want[b][0] - want[a][0]);
    const ky = (pb[1] - pa[1]) / (want[b][1] - want[a][1]);
    if (!(kx > 0) || !(ky > 0)) continue;
    const x = pa[0] + (t.margin - want[a][0]) * kx;
    const y = pa[1] + (t.margin - want[a][1]) * ky;
    return { x, y, w: t.w * kx, h: t.h * ky, how: 'marks' };
  }
  return { x: 0, y: 0, w: W, h: H, how: 'stretched' };
}

/** Bildfüllung aus einer Flächen-Vorlage (Rahmen der Vorlage, Malvorlage gemerkt) */
export function fillFromTemplate(t: ZoneTemplate, src: string): ImageFill | null {
  if (t.ox === undefined || t.oy === undefined || t.ux === undefined || t.uy === undefined || t.vx === undefined || t.vy === undefined) return null;
  return { type: 'image', src, ox: t.ox, oy: t.oy, ux: t.ux, uy: t.uy, vx: t.vx, vy: t.vy, blend: 'normal', opacity: 1, tpl: t.id };
}

/** Abstand eines Punkts zu einem geschlossenen Polygon */
function distToPoly(p: Poly, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i];
    const [bx, by] = p[(i + 1) % p.length];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-18 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/**
 * Hat sich das Ziel seit der Vorlage geändert, und wie weit (Bildpunkte der Vorlage, größter Abstand der Umrisse in beide
 * Richtungen)? Ein Saum zum Wiederholen passt immer; gestreckt zählt die Länge der Kantenstücke (in Bildpunkten)
 */
export function templateDrift(t: ZoneTemplate, shape: ZoneShape): { changed: boolean; px: number } {
  const fp = targetFingerprint(shape, t);
  if (fp === t.fp) return { changed: false, px: 0 };
  if (t.rim) {
    const rim = shape.rims?.find((r) => r.id === t.rim);
    if (!rim) return { changed: true, px: Infinity };
    if (t.mode !== 'stretch') return { changed: false, px: 0 };
    const now = rimLengths(shape, rim);
    const before = t.lens ?? [];
    let px = Math.abs(now.length - before.length) > 0 ? Infinity : 0;
    for (let i = 0; i < Math.min(now.length, before.length); i++) px = Math.max(px, Math.abs(now[i] - before[i]) * t.ppm);
    return { changed: true, px: Math.round(px) };
  }
  const tp = targetPolys(shape, t.face);
  if (!tp || !t.ref || t.ref.length < 3) return { changed: true, px: Infinity };
  const s = Math.max(Math.abs(shape.sx), Math.abs(shape.sy));
  let d = 0;
  for (const [x, y] of t.ref) d = Math.max(d, distToPoly(tp.outline, x, y));
  for (const [x, y] of tp.outline) d = Math.max(d, distToPoly(t.ref, x, y));
  return { changed: true, px: Math.round(d * s * t.ppm) };
}

/** Umriss der Vorlage (beim Anlegen) für die Überlagerung im Editor: Pfad-Koordinaten */
export function templateOutline(t: ZoneTemplate): Poly | null {
  if (!t.ref || t.ref.length < 3) return null;
  return t.ref.map(([x, y]): [number, number] => [x, y]);
}
