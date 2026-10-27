/**
 * Ebenen-Probe (Plan Paket 5, von Florian am 25.10.2026 freigegeben): baut die Zone „ebenen“ aus den gemalten Körpern des
 * Parallax-Baukastens nach dessen Szene 06 „Kathedrale im Fels“. Je Ebene: Umriss aus dem Alphakanal (Marching Squares,
 * vereinfacht, geglättet), Löcher aus der Öffnungsmaske, Bild auf die Grenzen des Umrisses geschnitten und für das Handy
 * verkleinert (WebP, höchstens 1024 px breit). Fernen, Füllungen und Säume sind Bildebenen ohne Festes (Rechteck).
 * Fortschritt „mehr Ebenen bei gleichem Blick“: Stufe 1 der Bogen mit geschlossenem Deckel, Stufe 2 die Grotte offen,
 * Stufe 3 die Terrasse und der Farn dazu.
 *
 *   npx tsx scripts/ebenen-zone.ts
 *
 * Quelle: refs/traumacoaster-gpt explore/parallax baukasten test/ (lokal, nicht im Repository). Ziel: public/zones/ebenen/.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { traceAlpha } from '../src/zone/trace';
import { cleanPath, flattenPath, polyBounds, polyTopAt, selfIntersections, simplifyPoly, smoothPath, type Poly, type ZonePath } from '../src/zone/path';
import { emptyZone, fitBodyBounds, serializeZone, type ZoneBodyRole, type ZoneElement } from '../src/zone/types';

const KIT = '/Users/bsw/Projekte/playground/traumacoaster/refs/traumacoaster-gpt explore/parallax baukasten test';
const OUT = join(process.cwd(), 'public', 'zones', 'ebenen');
/** Leinwand der Szene (Pixel) und Meter je Pixel */
const CW = 1920;
const CH = 1200;
const M = 0.05;
const MAX_W = 1024;

interface Layer {
  id: string;
  asset: string;
  /** Lage auf der Leinwand als Anteile (wie im Rezept der Szene); h nur für Flächen, die nicht gleichmäßig skaliert sind */
  x: number;
  y: number;
  w: number;
  h?: number;
  lane: number;
  role: ZoneBodyRole;
  trace: 'alpha' | 'rect';
  holeMask?: string;
  d?: number;
  room?: number;
  ground?: boolean;
  openFrom?: number;
  growth?: number;
  color: string;
  label: string;
}

/** Szene 06: Tiefe 0 fern … 1 nah → Spur 2 … −2; Lagen wie im Rezept, Spuren so, dass Grotte und Raum frei bleiben */
const LAYERS: Layer[] = [
  { id: 'k1', asset: 'assets/alt/env_snow_ridge_a.png', x: -0.13, y: -0.24, w: 1.35, lane: 1.6, role: 'fill', trace: 'rect', color: '#dfe8f0', label: 'Schneekamm' },
  { id: 'k2', asset: 'assets/alt/env_lake_field.png', x: -0.15, y: 0.37, w: 1.3, lane: 1.28, role: 'fill', trace: 'rect', color: '#9fd8d0', label: 'See' },
  { id: 'k3', asset: 'assets/meadow_s_mass.png', x: -0.2, y: -0.04, w: 1.4, lane: 0.9, role: 'fill', trace: 'alpha', color: '#9ccb4b', label: 'Wiesenmasse' },
  { id: 'k4', asset: 'assets/alt/cave_fill_sunwell.png', x: 0, y: 0.26, w: 1, h: 0.78, lane: 0.3, role: 'fill', trace: 'rect', color: '#e9c76a', label: 'Sonnenschacht' },
  { id: 'k5', asset: 'assets/grand_s_arch.png', x: -0.27, y: -0.045, w: 1.48, lane: -1.2, role: 'front', trace: 'alpha', holeMask: 'assets/abgeleitet/grand_s_arch-oeffnung.png', d: 10, room: 8, ground: true, openFrom: 2, color: '#8aa0b8', label: 'Großer S-Bogen' },
  { id: 'k6', asset: 'assets/alt/bush_alpine_fan.png', x: -0.11, y: -0.02, w: 0.46, lane: -1.9, role: 'rim', trace: 'rect', color: '#6fae3c', label: 'Busch' },
  { id: 'k7', asset: 'assets/cave_s_terrace.png', x: -0.1, y: 0.88, w: 1.2, lane: -1.52, role: 'front', trace: 'alpha', d: 8, ground: true, growth: 3, color: '#7d94b0', label: 'Höhlenterrasse' },
  { id: 'k8', asset: 'assets/alt/fern_cave_glow.png', x: 0.81, y: 0.87, w: 0.08, lane: -1.6, role: 'rim', trace: 'rect', growth: 3, color: '#7fd9c8', label: 'Farn' },
];

async function raw(file: string): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

async function main(): Promise<void> {
  if (!existsSync(KIT)) throw new Error(`Baukasten nicht gefunden: ${KIT}`);
  mkdirSync(OUT, { recursive: true });
  const zone = emptyZone('ebenen', 120, 'steel');
  zone.looks = ['day', 'day', 'day', 'dusk'];
  const log: string[] = [];
  for (const L of LAYERS) {
    const file = join(KIT, L.asset);
    const meta = await sharp(file).metadata();
    const iw = meta.width!;
    const ih = meta.height!;
    // Lage auf der Leinwand in Pixeln: gleichmäßig skaliert (k) oder mit eigener Höhe (Füllung)
    const x0 = L.x * CW;
    const y0 = L.y * CH;
    const w = L.w * CW;
    const h = L.h !== undefined ? L.h * CH : (w * ih) / iw;
    const kx = w / iw;
    const ky = h / ih;
    const toWorld = (ix: number, iy: number): [number, number] => [(x0 + ix * kx) * M, (CH - (y0 + iy * ky)) * M];
    let path: ZonePath;
    let holes: ZonePath[] = [];
    let crop = { left: 0, top: 0, width: iw, height: ih };
    if (L.trace === 'rect') {
      path = [toWorld(0, ih), toWorld(iw, ih), toWorld(iw, 0), toWorld(0, 0)].map(([x, y]) => ({ x, y }));
    } else {
      const img = await raw(file);
      const shapes = traceAlpha(img, { maxSize: 420, tol: 2, threshold: 110 });
      if (!shapes.length) throw new Error(`${L.asset}: kein Umriss`);
      const main = shapes[0];
      const toPath = (poly: Poly): ZonePath => smoothPath(simplifyPoly(poly.map(([ix, iy]) => toWorld(ix, iy)), 0.35));
      path = toPath(main.outline);
      // Löcher: aus der Öffnungsmaske, wenn es eine gibt (der gemalte Innenraum ist im Bild halbdurchsichtig und ergäbe
      // ein zweites, überlappendes Loch; zwei überlappende Löcher zerreißen die Fläche), sonst aus dem Alphakanal;
      // Krümel unter einem Prozent der Umrissfläche fallen weg
      const minArea = main.area * 0.01;
      if (L.holeMask) {
        const mask = await raw(join(KIT, L.holeMask));
        const mw = mask.width / iw;
        const mh = mask.height / ih;
        for (const s of traceAlpha(mask, { maxSize: 420, tol: 2, threshold: 110 })) {
          if (s.area * mw * mh < minArea) continue;
          holes.push(toPath(s.outline.map(([ix, iy]) => [ix / mw, iy / mh] as [number, number])));
        }
      } else {
        for (const h of main.holes) {
          const area = Math.abs(h.reduce((a, [x, y], i) => a + x * h[(i + 1) % h.length][1] - h[(i + 1) % h.length][0] * y, 0) / 2);
          if (area >= minArea) holes.push(toPath(h));
        }
      }
      // Bild auf die Grenzen der Kurve schneiden, damit es genau auf dem Umriss liegt
      const b = polyBounds(flattenPath(path, 0.2));
      const px = (X: number) => (X / M - x0) / kx;
      const py = (Y: number) => (CH - Y / M - y0) / ky;
      const left = Math.max(0, Math.floor(px(b.minX)));
      const right = Math.min(iw, Math.ceil(px(b.maxX)));
      const top = Math.max(0, Math.floor(py(b.maxY)));
      const bottom = Math.min(ih, Math.ceil(py(b.minY)));
      crop = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
      // Kurve exakt auf den Schnitt legen (Rundung der Pixel)
      const fix = (p: ZonePath): ZonePath => p;
      path = fix(path);
      // die Grenzen des Pfads nach dem Schnitt: Pixelkanten zurück in Meter
      const [bx0, by1] = toWorld(left, top);
      const [bx1, by0] = toWorld(right, bottom);
      const sx = (bx1 - bx0) / (b.maxX - b.minX);
      const sy = (by1 - by0) / (b.maxY - b.minY);
      const stretch = (p: ZonePath): ZonePath => p.map((q) => ({ x: bx0 + (q.x - b.minX) * sx, y: by0 + (q.y - b.minY) * sy, inX: q.inX === undefined ? undefined : q.inX * sx, inY: q.inY === undefined ? undefined : q.inY * sy, outX: q.outX === undefined ? undefined : q.outX * sx, outY: q.outY === undefined ? undefined : q.outY * sy }));
      path = stretch(path);
      holes = holes.map(stretch);
    }
    // Bild schreiben
    const outName = `${L.id}-${L.asset.split('/').pop()!.replace(/\.png$/i, '')}.webp`;
    const targetW = Math.min(MAX_W, crop.width);
    await sharp(file).extract(crop).resize({ width: targetW }).webp({ quality: 80 }).toFile(join(OUT, outName));
    const bb = polyBounds(flattenPath(path, 0.2));
    const ex = Math.round(bb.minX * 100) / 100;
    const ey = Math.round(bb.minY * 100) / 100;
    const rel = (p: ZonePath): ZonePath => cleanPath(p.map((q) => ({ ...q, x: q.x - ex, y: q.y - ey })));
    const el: ZoneElement = { id: L.id, kind: 'body', x: ex, y: ey, z: L.lane, w: 1, h: 1, color: L.color, label: L.label, path: rel(path), role: L.role, image: `zones/ebenen/${outName}` };
    if (holes.length) el.holes = holes.map(rel);
    if (L.d !== undefined) el.d = L.d;
    if (L.room) el.room = L.room;
    if (L.ground) el.ground = true;
    if (L.openFrom) el.openFrom = L.openFrom;
    if (L.growth) el.growth = L.growth;
    fitBodyBounds(el);
    const knots = selfIntersections(flattenPath(el.path!, 0.2)) + (el.holes ?? []).reduce((a, h) => a + selfIntersections(flattenPath(h, 0.2)), 0);
    if (knots) log.push(`  ${L.id}: ${knots} Selbstschnitte in der Form!`);
    zone.elements.push(el);
    log.push(`${L.id} ${L.label}: ${el.path!.length} Punkte, ${el.holes?.length ?? 0} Löcher, ${el.w} × ${el.h} m bei x ${el.x}, y ${el.y}, Spur ${el.z}; Bild ${outName} ${crop.width}×${crop.height} → ${targetW} px`);
  }
  // Station auf der Oberkante des Bogens links
  const arch = zone.elements.find((e) => e.id === 'k5')!;
  const archPoly = flattenPath(arch.path!, 0.2).map(([x, y]) => [x + arch.x, y + arch.y] as [number, number]);
  const sx = 10;
  const top = polyTopAt(archPoly, sx + 7) ?? polyTopAt(archPoly, sx) ?? 40;
  zone.stations.push({ id: 's1', x: sx, y: Math.round((top + 0.4) * 100) / 100, z: arch.z, dir: 1, length: 14 });
  zone.queues.push({ id: 'q1', x0: sx - 14, x1: sx - 1, y: zone.stations[0].y, z: arch.z, dir: 1 });
  const rect = { x0: 0, x1: 96, y0: -12, y1: 66 };
  zone.fields.push(
    { id: 'f1', name: 'Oben', ...rect, stage: 1, goals: [{ type: 'finish' }, { type: 'height', value: 12 }] },
    { id: 'f2', name: 'Grotte', ...rect, stage: 2, goals: [{ type: 'finish' }, { type: 'tunnels', value: 1 }] },
    { id: 'f3', name: 'Terrasse', ...rect, stage: 3, goals: [{ type: 'finish' }, { type: 'tunnels', value: 1 }, { type: 'length', value: 200 }] },
  );
  writeFileSync(join(OUT, 'zone.json'), serializeZone(zone));
  console.log(log.join('\n'));
  console.log(`Station bei x ${sx}, Höhe ${zone.stations[0].y} auf Spur ${arch.z}; Zone geschrieben: ${join(OUT, 'zone.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
