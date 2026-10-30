/**
 * Bilder im Zonen-Editor (Stufe 6, Plan 4.8 und 4.10): Malvorlage anlegen, gemaltes Bild einsetzen, Saum anlegen, Umriss
 * aus Bild, Schnittmaske. Die Rechnungen (Rahmen, Vorlage, Passmarken, Fingerabdruck) stehen ohne DOM in
 * `src/zone/template.ts`, `src/zone/rims.ts` und `src/zone/trace.ts`; hier ist, was Zeichenfläche, Dateien und den
 * Dev-Server braucht.
 *
 * Bilder kommen neben die Zonendatei (`/__zonefile`, wie die Skizzen), Vorlagen in den Ordner `vorlagen/` daneben und als
 * Download (zum Weitergeben ans iPad, etwa per AirDrop). Der Dev-Server packt neue Bilder danach als KTX2
 * (`scripts/zone-ktx2.mjs`).
 */
import { uploadZoneFile } from '@/zone/io';
import { faceAt } from '@/zone/faces';
import { fitCurve, type Poly, type ZonePath } from '@/zone/path';
import { findPlane, findShape, isShape, isTemplate, nextNodeId, rectPath, shapeFaces, shapesOf, styleMap, type ZoneNode, type ZonePlane, type ZoneShape, type ZoneTemplate } from '@/zone/nodes';
import { ownPaint, writePaint } from '@/zone/gradients';
import { cloneFill, imageUv, mapFillPoints, MAX_LAYERS, setImageSampler, type ImageFill, type ZoneFill } from '@/zone/paint';
import { nextRimId, RIM_DEFAULT, type RimMode, type ZoneRim } from '@/zone/rims';
import { clipSvg, faceTemplate, fillFromTemplate, importRect, matchTemplate, rimTemplate, slug, templateDrift, templateFile, templateJson, templateSvg, TEMPLATE_MAX, type RawImage, type SharpView, type TemplateDraft } from '@/zone/template';
import { traceAlpha } from '@/zone/trace';

/** was die Befehle vom Editor brauchen */
export interface ImageHost {
  readonly zone: string;
  nodes(): ZoneNode[];
  /** ein Schritt im Arbeitsverlauf */
  edit(fn: () => void): void;
  toast(msg: string): void;
  /** Ansicht, für die Vorlagen scharf sein sollen (Bildwinkel der Zone) */
  sharpView(): SharpView;
}

// ------------------------------------------------------------------ Bildpunkte

/** Bild aus einer Datei oder Adresse als Bitmap und rohe Bildpunkte */
export async function decode(src: Blob | string): Promise<{ bitmap: ImageBitmap; raw: RawImage }> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = c.getContext('2d');
  if (!g) throw new Error('keine Zeichenfläche');
  g.drawImage(bitmap, 0, 0);
  const d = g.getImageData(0, 0, bitmap.width, bitmap.height);
  return { bitmap, raw: { width: d.width, height: d.height, data: d.data } };
}

/** Ausschnitt eines Bilds als PNG in der Größe w × h */
async function cropPng(bitmap: ImageBitmap, r: { x: number; y: number; w: number; h: number }, w: number, h: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) throw new Error('keine Zeichenfläche');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/png' });
}

/** SVG (etwa eine Malvorlage) als PNG */
export async function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d');
    if (!g) throw new Error('keine Zeichenfläche');
    g.drawImage(img, 0, 0, w, h);
    return await c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Datei herunterladen (Mac: in „Downloads“, von dort per AirDrop aufs iPad) */
export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Bildpunkte geladener Bilder für Pipette und Vorschau (setImageSampler): einmal je Bild gelesen, solange der Editor
 * läuft
 */
const pixels = new Map<string, RawImage | null>();
export function startImageSampler(): void {
  setImageSampler((src, u, v) => {
    const img = pixels.get(src);
    if (img === undefined) {
      pixels.set(src, null);
      void decode(src)
        .then(({ raw }) => pixels.set(src, raw))
        .catch(() => pixels.delete(src));
      return null;
    }
    if (!img) return null;
    const x = Math.max(0, Math.min(img.width - 1, Math.floor(u * img.width)));
    const y = Math.max(0, Math.min(img.height - 1, Math.floor((1 - v) * img.height)));
    const i = (y * img.width + x) * 4;
    return [img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255, img.data[i + 3] / 255];
  });
}

// ------------------------------------------------------------------ Malvorlage

/** heute als ISO-Datum */
const today = (): string => new Date().toISOString().slice(0, 10);

/** Vorlage schreiben: PNG, Unterlage (Saum mit Bild), SVG für Illustrator, Begleitdatei; das PNG auch als Download */
async function writeTemplate(host: ImageHost, d: TemplateDraft, plane: ZonePlane, under: string | null): Promise<boolean> {
  const name = templateFile(d.t);
  const full = { w: d.t.w + 2 * d.t.margin, h: d.t.h + 2 * d.t.margin };
  const png = await svgToPng(templateSvg(d, host.zone), full.w, full.h);
  const ok = await uploadZoneFile(host.zone, `vorlagen/${name}.png`, png);
  await uploadZoneFile(host.zone, `vorlagen/${name}.svg`, new Blob([clipSvg(d, `${name}.png`)], { type: 'image/svg+xml' }));
  await uploadZoneFile(host.zone, `vorlagen/${name}.json`, new Blob([templateJson(d, host.zone, plane)], { type: 'application/json' }));
  download(png, `${name}.png`);
  if (under) {
    const { bitmap } = await decode(under);
    const c = new OffscreenCanvas(full.w, full.h);
    c.getContext('2d')?.drawImage(bitmap, d.t.margin, d.t.margin, d.t.w, d.t.h);
    const blob = await c.convertToBlob({ type: 'image/png' });
    await uploadZoneFile(host.zone, `vorlagen/${name}-unterlage.png`, blob);
    download(blob, `${name}-unterlage.png`);
  }
  return !!ok;
}

/**
 * Malvorlage für eine Form, eine ihrer Flächen (face: Punkt in ihr, Pfad-Koordinaten) oder einen Saum (mode: Stück zum
 * Wiederholen oder Streifen für die ganze Kante). Legt den Vorlagen-Knoten an und gibt das Bild als Download
 */
export async function makeTemplate(host: ImageHost, shapeId: string, opts: { face?: [number, number]; rim?: string; mode?: RimMode } = {}): Promise<ZoneTemplate | null> {
  const nodes = host.nodes();
  const shape = findShape(nodes, shapeId);
  const plane = shape ? findPlane(nodes, shape.parent) : undefined;
  if (!shape || !plane) return null;
  const id = nextNodeId(nodes, 'v');
  const rim = opts.rim ? shape.rims?.find((r) => r.id === opts.rim) : undefined;
  const d = rim ? rimTemplate(id, plane, shape, rim, opts.mode ?? rim.mode, today(), host.sharpView()) : faceTemplate(id, plane, shape, opts.face ?? null, today(), host.sharpView());
  if (!d) {
    host.toast('Für diese Form lässt sich keine Malvorlage rechnen');
    return null;
  }
  host.edit(() => host.nodes().push(d.t));
  const ok = await writeTemplate(host, d, plane, rim ? rim.src : null);
  const big = d.t.w >= TEMPLATE_MAX || d.t.h >= TEMPLATE_MAX ? ` (größer als ${TEMPLATE_MAX} px ginge nur unscharf am iPad)` : '';
  host.toast(`Malvorlage ${d.t.id}: ${d.t.w} × ${d.t.h} px, scharf bis Zoom ${String(d.sharp).replace('.', ',')} von ${d.maxZoom}${big}. In „Downloads“${ok ? ` und unter zones/${host.zone}/vorlagen` : ''}. Gemalt zurück: ins Bild ziehen`);
  return d.t;
}

// ------------------------------------------------------------------ Bild einsetzen

/** Platz, an dem ein Bild landet, wenn keine Vorlage passt: auf eine Form (Füllung) oder als Bildschicht in eine Ebene */
export interface DropTarget {
  shape?: string;
  /** Fläche der Form (Punkt in ihr, Pfad-Koordinaten) */
  face?: [number, number];
  /** Ebene und Mitte (Ebenen-Koordinaten) und Breite (Meter) für eine neue Bildschicht */
  plane?: string;
  at?: { x: number; y: number };
  width?: number;
}

/** Bild hochladen (PNG); null ohne Dev-Server */
async function upload(host: ImageHost, blob: Blob, name: string, prefix: 'bild' | 'saum'): Promise<string | null> {
  const file = `${prefix}-${slug(name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 40)}-${Date.now().toString(36)}.png`;
  return uploadZoneFile(host.zone, file, blob);
}

/**
 * Wohin ein gemaltes Bild in den Füllstapel kommt: über die Schichten, die die Fläche färben (Farbe, Verlauf ohne
 * Pünktchen, Farbnebel; sie verdeckt das Bild ohnehin), unter die Wirkungen, die auch auf Gemaltes wirken sollen (Plan 4.8:
 * Lichtkante, Innenschatten, Pünktchen, Papier, Funkeln, Deckkraftverlauf, Verlauf als Pünktchen)
 */
export function imageSlotIn(fills: readonly ZoneFill[]): number {
  let at = 0;
  fills.forEach((x, k) => {
    if (x.type === 'color' || x.type === 'mist' || x.type === 'image' || (x.type === 'gradient' && !x.dots)) at = k + 1;
  });
  return at;
}

/**
 * Bildfüllung über die färbenden Schichten (imageSlotIn); ein früheres Bild derselben Malvorlage wird ersetzt. Ein
 * verknüpfter Stil löst sich dabei (wie beim Verlauf)
 */
function putFill(nodes: readonly ZoneNode[], shape: ZoneShape, face: [number, number] | undefined, f: ImageFill): boolean {
  const faces = shapeFaces(shape);
  const i = face && faces.length > 1 ? faceAt(faces, face[0], face[1]) : -1;
  if (face && faces.length > 1 && i < 0) return false;
  const t = { shape, face: i >= 0 ? faces[i] : null };
  const p = ownPaint(t, styleMap(nodes));
  const list = (p.fills ?? []).filter((x) => !(x.type === 'image' && x.tpl && x.tpl === f.tpl));
  if (list.length >= MAX_LAYERS - 1) return false;
  list.splice(imageSlotIn(list), 0, f);
  p.fills = list;
  writePaint(t, p);
  return true;
}

/**
 * Ein Bild einsetzen. Passt eine Malvorlage (Name …-v12 oder Größe), kommt es genau dorthin, wofür sie angelegt wurde
 * (Fläche: Bildfüllung im Rahmen der Vorlage; Saum: neues Bild des Saums), der Rand fällt weg. Sonst liegt es auf der
 * Form unter dem Zeiger (Füllung, die Form ganz bedeckt) oder wird eine Bildschicht in der Ebene
 */
export async function importImage(host: ImageHost, file: File, target: DropTarget): Promise<void> {
  let img: { bitmap: ImageBitmap; raw: RawImage };
  try {
    img = await decode(file);
  } catch {
    host.toast('Das Bild ließ sich nicht lesen (PNG, JPG oder WebP)');
    return;
  }
  const templates = host.nodes().filter(isTemplate);
  const t = matchTemplate(templates, file.name, img.raw.width, img.raw.height);
  if (t) {
    await importForTemplate(host, file.name, img, t);
    return;
  }
  // ohne Vorlage: höchstens TEMPLATE_MAX Bildpunkte
  const k = Math.min(1, TEMPLATE_MAX / Math.max(img.raw.width, img.raw.height));
  const w = Math.max(1, Math.round(img.raw.width * k));
  const h = Math.max(1, Math.round(img.raw.height * k));
  const src = await upload(host, await cropPng(img.bitmap, { x: 0, y: 0, w: img.raw.width, h: img.raw.height }, w, h), file.name, 'bild');
  if (!src) {
    host.toast('Bilder brauchen den Dev-Server (er legt sie neben die Zonendatei)');
    return;
  }
  const shape = target.shape ? findShape(host.nodes(), target.shape) : undefined;
  if (shape) {
    // die Form ganz bedecken (wie „Füllen“ in Photoshop), Mitte auf der Mitte der Form, Seitenverhältnis bleibt
    const faces = shapeFaces(shape, 1);
    const fi = target.face ? faceAt(faces, target.face[0], target.face[1]) : -1;
    const polys = fi >= 0 ? [faces[fi].outline] : faces.map((f) => f.outline);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of polys)
      for (const [x, y] of p) {
        minX = Math.min(minX, x * shape.sx);
        maxX = Math.max(maxX, x * shape.sx);
        minY = Math.min(minY, y * shape.sy);
        maxY = Math.max(maxY, y * shape.sy);
      }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const scale = Math.max(bw / w, bh / h);
    const fw = w * scale;
    const fh = h * scale;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const f: ImageFill = { type: 'image', src, ox: (cx - fw / 2) / shape.sx, oy: (cy - fh / 2) / shape.sy, ux: fw / shape.sx, uy: 0, vx: 0, vy: fh / shape.sy, blend: 'normal', opacity: 1 };
    let ok = false;
    host.edit(() => (ok = putFill(host.nodes(), shape, fi >= 0 ? target.face : undefined, f)));
    host.toast(ok ? `Bild liegt in ${shape.name} (Schnittmaske: nur innerhalb der Form zu sehen)` : 'Der Füllstapel ist voll');
    return;
  }
  const plane = target.plane ? findPlane(host.nodes(), target.plane) : undefined;
  if (!plane) {
    host.toast('Erst eine Ebene wählen oder das Bild auf eine Form ziehen');
    return;
  }
  addImageLayer(host, plane, src, w / h, target.at ?? { x: 0, y: 0 }, target.width ?? 20, file.name);
}

/** neue Bildschicht: ein Rechteck im Seitenverhältnis des Bilds, das Bild schneidet aus (durchsichtig, wo es durchsichtig ist) */
export function addImageLayer(host: ImageHost, plane: ZonePlane, src: string, aspect: number, at: { x: number; y: number }, width: number, name: string): ZoneShape {
  const nodes = host.nodes();
  const w = width;
  const h = width / aspect;
  const id = nextNodeId(nodes, 's');
  const order = Math.max(0, ...shapesOf(nodes, plane.id).map((s) => s.order)) + 1;
  const shape: ZoneShape = {
    id,
    kind: 'shape',
    parent: plane.id,
    order,
    name: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Bild',
    x: at.x,
    y: at.y,
    sx: 1,
    sy: 1,
    path: rectPath(w, h),
    fill: '#808080',
    fills: [{ type: 'image', src, ox: -w / 2, oy: -h / 2, ux: w, uy: 0, vx: 0, vy: h, mask: true, blend: 'normal', opacity: 1 }],
    material: 'airy',
  };
  host.edit(() => host.nodes().push(shape));
  host.toast('Bildschicht: verschieben und skalieren wie eine Form; „Umriss aus Bild“ gibt ihr die Form des Gemalten');
  return shape;
}

/** Bild zu einer Malvorlage: Rand ab, Lage aus Größe oder Passmarken, dann an ihr Ziel */
async function importForTemplate(host: ImageHost, fileName: string, img: { bitmap: ImageBitmap; raw: RawImage }, t: ZoneTemplate): Promise<void> {
  const shape = findShape(host.nodes(), t.shape);
  if (!shape) {
    host.toast(`Malvorlage ${t.id} gehört zu einer Form, die es nicht mehr gibt`);
    return;
  }
  const r = importRect(t, img.raw);
  // nicht kleiner rechnen, als gemalt (wer doppelt so groß malt, behält die Schärfe), höchstens TEMPLATE_MAX
  const k = Math.min(TEMPLATE_MAX / Math.max(t.w, t.h), Math.max(1, r.w / t.w));
  const w = Math.max(1, Math.round(t.w * k));
  const h = Math.max(1, Math.round(t.h * k));
  const src = await upload(host, await cropPng(img.bitmap, r, w, h), fileName, t.rim ? 'saum' : 'bild');
  if (!src) {
    host.toast('Bilder brauchen den Dev-Server (er legt sie neben die Zonendatei)');
    return;
  }
  const how = r.how === 'exact' ? 'passgenau' : r.how === 'scaled' ? 'passgenau (skaliert)' : r.how === 'marks' ? 'über die Passmarken' : 'gestreckt (Größe passt nicht zur Vorlage, Passmarken fehlen)';
  const drift = templateDrift(t, shape);
  const warn = drift.changed ? ` Achtung: die Form hat sich seit der Vorlage geändert (bis ${Number.isFinite(drift.px) ? drift.px : '?'} px daneben).` : '';
  if (t.rim) {
    const rim = shape.rims?.find((x) => x.id === t.rim);
    if (!rim) {
      host.toast(`Den Saum ${t.rim} der Malvorlage gibt es nicht mehr`);
      return;
    }
    host.edit(() => {
      rim.src = src;
      rim.aspect = w / h;
      rim.mode = t.mode ?? rim.mode;
      if (t.a !== undefined && t.b !== undefined && rim.mode === 'repeat') {
        rim.a = t.a;
        rim.b = t.b;
      }
      rim.tpl = t.id;
    });
    host.toast(`Saum von ${shape.name} hat das gemalte Bild, ${how}.${warn}`);
    return;
  }
  const f = fillFromTemplate(t, src);
  if (!f) return;
  let ok = false;
  host.edit(() => (ok = putFill(host.nodes(), shape, t.face, f)));
  host.toast(ok ? `Gemaltes Bild liegt in ${shape.name}, ${how}.${warn}` : 'Der Füllstapel ist voll');
}

// ------------------------------------------------------------------ Saum

/** neuer Saum an der Form mit diesem Bild (Kanten nach oben, Platzhalter-Höhe; Teilung: ohne Anfang und Ende) */
export async function addRim(host: ImageHost, shapeId: string, file: File): Promise<void> {
  const shape = findShape(host.nodes(), shapeId);
  if (!shape) return;
  let img: { bitmap: ImageBitmap; raw: RawImage };
  try {
    img = await decode(file);
  } catch {
    host.toast('Das Bild ließ sich nicht lesen (PNG, JPG oder WebP)');
    return;
  }
  const t = matchTemplate(host.nodes().filter(isTemplate), file.name, img.raw.width, img.raw.height);
  if (t?.rim && t.shape === shapeId) {
    await importForTemplate(host, file.name, img, t);
    return;
  }
  const k = Math.min(1, TEMPLATE_MAX / Math.max(img.raw.width, img.raw.height));
  const w = Math.max(1, Math.round(img.raw.width * k));
  const h = Math.max(1, Math.round(img.raw.height * k));
  const src = await upload(host, await cropPng(img.bitmap, { x: 0, y: 0, w: img.raw.width, h: img.raw.height }, w, h), file.name, 'saum');
  if (!src) {
    host.toast('Bilder brauchen den Dev-Server (er legt sie neben die Zonendatei)');
    return;
  }
  host.edit(() => {
    const rim: ZoneRim = { id: nextRimId(shape), src, aspect: w / h, ...RIM_DEFAULT, mode: 'repeat', a: 0, b: 1 };
    shape.rims = [...(shape.rims ?? []), rim];
  });
  host.toast(`Saum an ${shape.name}: Kanten nach oben. Im Füllstapel: Höhe, Lage der Kante, Richtung, Anfang und Ende`);
}

// ------------------------------------------------------------------ Umriss aus Bild, Schnittmaske

/** oberste sichtbare Bildfüllung einer Form */
export function topImage(shape: ZoneShape): ImageFill | null {
  const fills = shape.fills ?? [];
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i];
    if (f.type === 'image' && !f.hidden) return f;
  }
  return null;
}

/**
 * Umriss aus Bild (Plan 4.8, `trace.ts`): die Form bekommt den Umriss des Gemalten (Alpha über der Hälfte), als glatte
 * Kurven; das Bild deckt danach (die Kante ist die Form), die Grundfarbe wird das Mittel der Randfarben (gegen Säume an
 * halbdurchsichtigen Rändern). Teilungslinien und Füllpunkte fallen weg (die Flächen gibt es nicht mehr)
 */
export async function traceShape(host: ImageHost, shapeId: string): Promise<void> {
  const shape = findShape(host.nodes(), shapeId);
  const f = shape ? topImage(shape) : null;
  if (!shape || !f) {
    host.toast('Umriss aus Bild: erst eine Form mit Bild wählen');
    return;
  }
  let raw: RawImage;
  try {
    raw = (await decode(f.src)).raw;
  } catch {
    host.toast('Das Bild ließ sich nicht laden');
    return;
  }
  const traced = traceAlpha(raw, { threshold: 128, maxSize: 480, tol: 1.2 });
  if (!traced.length) {
    host.toast('Im Bild ist nichts Deckendes');
    return;
  }
  // Bildpunkte → Pfad-Koordinaten über den Rahmen der Füllung
  const toPath = (p: Poly): Poly => p.map(([x, y]) => {
    const u = x / raw.width;
    const v = 1 - y / raw.height;
    return [f.ox + f.ux * u + f.vx * v, f.oy + f.uy * u + f.vy * v];
  });
  const main = traced[0];
  const tolPath = (Math.hypot(f.ux, f.uy) / raw.width) * 1.5;
  const asPath = (p: Poly): ZonePath => fitCurve(p, tolPath, true);
  const outline = asPath(toPath(main.outline));
  const holes = main.holes.map((h) => asPath(toPath(h)));
  // Grundfarbe: Mittel der deckenden Randpunkte
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of main.outline) {
    const xi = Math.max(0, Math.min(raw.width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(raw.height - 1, Math.round(y)));
    const i = (yi * raw.width + xi) * 4;
    if (raw.data[i + 3] < 64) continue;
    r += raw.data[i];
    g += raw.data[i + 1];
    b += raw.data[i + 2];
    n++;
  }
  const hex = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0');
  host.edit(() => {
    shape.path = outline;
    if (holes.length) shape.holes = holes;
    else delete shape.holes;
    delete shape.cuts;
    delete shape.regions;
    delete f.mask;
    if (n) shape.fill = `#${hex(r)}${hex(g)}${hex(b)}`;
    if (shape.material === 'airy') shape.material = 'dig';
  });
  host.toast(`${shape.name} hat den Umriss des Bilds (${outline.length} Anker${holes.length ? `, ${holes.length} Löcher` : ''}); das Bild deckt jetzt, Material grabbar`);
}

/**
 * Schnittmaske (Cmd+7, Plan 4.8): die vorderste gewählte Form mit Bild gibt ihr Bild an die Form darunter (in derselben
 * Ebene), die Bildschicht fällt weg; das Bild liegt an derselben Stelle der Ebene
 */
export function clipInto(host: ImageHost, shapes: readonly ZoneShape[]): boolean {
  if (shapes.length < 2 || !shapes.every((s) => s.parent === shapes[0].parent)) {
    host.toast('Schnittmaske: eine Form mit Bild und eine Form darunter in derselben Ebene wählen');
    return false;
  }
  const sorted = [...shapes].sort((a, b) => b.order - a.order);
  const src = sorted.find((s) => topImage(s));
  const dst = sorted.find((s) => s !== src && (!src || s.order < src.order));
  const f = src ? topImage(src) : null;
  if (!src || !dst || !f) {
    host.toast('Schnittmaske: die vordere Form braucht ein Bild, die hintere nimmt es auf');
    return false;
  }
  const moved = cloneFill(f) as ImageFill;
  delete moved.mask;
  // Pfad-Koordinaten der Bildschicht → Ebene → Pfad-Koordinaten der Zielform
  mapFillPoints([moved], (x, y) => [(src.x + src.sx * x - dst.x) / dst.sx, (src.y + src.sy * y - dst.y) / dst.sy]);
  let ok = false;
  host.edit(() => {
    ok = putFill(host.nodes(), dst, undefined, moved);
    if (ok) {
      const nodes = host.nodes();
      const i = nodes.indexOf(src);
      if (i >= 0) nodes.splice(i, 1);
    }
  });
  host.toast(ok ? `Das Bild ist jetzt nur innerhalb von ${dst.name} zu sehen (Schnittmaske lösen: Wahl+Cmd+7)` : 'Der Füllstapel ist voll');
  return ok;
}

/** Schnittmaske lösen: das oberste Bild der Form wird wieder eine eigene Bildschicht darüber */
export function releaseClip(host: ImageHost, shape: ZoneShape): ZoneShape | null {
  const f = topImage(shape);
  if (!f) {
    host.toast('Die Form hat kein Bild');
    return null;
  }
  const plane = findPlane(host.nodes(), shape.parent);
  if (!plane) return null;
  const toPlane = (x: number, y: number): [number, number] => [shape.x + shape.sx * x, shape.y + shape.sy * y];
  const o = toPlane(f.ox, f.oy);
  const ou = toPlane(f.ox + f.ux, f.oy + f.uy);
  const ov = toPlane(f.ox + f.vx, f.oy + f.vy);
  const cx = (ou[0] + ov[0]) / 2;
  const cy = (ou[1] + ov[1]) / 2;
  const corner = (x: number, y: number) => ({ x: x - cx, y: y - cy });
  const p0 = corner(o[0], o[1]);
  const p1 = corner(ou[0], ou[1]);
  const p3 = corner(ov[0], ov[1]);
  const p2 = { x: p1.x + p3.x - p0.x, y: p1.y + p3.y - p0.y };
  const nodes = host.nodes();
  const layer: ZoneShape = {
    id: nextNodeId(nodes, 's'),
    kind: 'shape',
    parent: plane.id,
    order: shape.order + 0.5,
    name: `${shape.name} Bild`,
    x: cx,
    y: cy,
    sx: 1,
    sy: 1,
    path: [p0, p1, p2, p3],
    fill: '#808080',
    fills: [{ ...(cloneFill(f) as ImageFill), ox: p0.x, oy: p0.y, ux: p1.x - p0.x, uy: p1.y - p0.y, vx: p3.x - p0.x, vy: p3.y - p0.y, mask: true }],
    material: 'airy',
  };
  host.edit(() => {
    shape.fills = (shape.fills ?? []).filter((x) => x !== f);
    if (!shape.fills.length) delete shape.fills;
    host.nodes().push(layer);
  });
  host.toast('Schnittmaske gelöst: das Bild ist eine eigene Bildschicht über der Form');
  return layer;
}

/** Abweichungen je Pfad-Objekt der Form (bleibt dasselbe Objekt, hat sich der Umriss nicht geändert) */
const driftCache = new WeakMap<object, Map<string, { holes: unknown; cuts: unknown; rims: unknown; sx: number; sy: number; d: { changed: boolean; px: number } }>>();

/** Hinweis zu einer Bildfüllung oder einem Saum mit Malvorlage: hat sich die Form seitdem geändert? */
export function driftNote(nodes: readonly ZoneNode[], shape: ZoneShape, tpl: string | undefined): string | null {
  if (!tpl) return null;
  const t = nodes.find((n): n is ZoneTemplate => isTemplate(n) && n.id === tpl);
  if (!t) return null;
  let byTpl = driftCache.get(shape.path);
  if (!byTpl) {
    byTpl = new Map();
    driftCache.set(shape.path, byTpl);
  }
  const key = `${t.id}|${t.fp}`;
  let hit = byTpl.get(key);
  if (!hit || hit.holes !== shape.holes || hit.cuts !== shape.cuts || hit.rims !== JSON.stringify(shape.rims ?? null) || hit.sx !== shape.sx || hit.sy !== shape.sy) {
    hit = { holes: shape.holes, cuts: shape.cuts, rims: JSON.stringify(shape.rims ?? null), sx: shape.sx, sy: shape.sy, d: templateDrift(t, shape) };
    byTpl.set(key, hit);
  }
  const d = hit.d;
  if (!d.changed || d.px <= 2) return null;
  return Number.isFinite(d.px) ? `Form geändert, bis ${d.px} px daneben` : 'Form geändert';
}

/** Lage im Bild eines Punkts (für Prüfungen): u, v im Rahmen */
export const frameUv = imageUv;

/** alle Formen mit Bild (für die Leistungsanzeige) */
export const imageShapes = (nodes: readonly ZoneNode[]): ZoneShape[] => nodes.filter(isShape).filter((s) => (s.fills ?? []).some((f) => f.type === 'image') || (s.rims?.length ?? 0) > 0);
