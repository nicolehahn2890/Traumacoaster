/**
 * Tor S6 vorbereiten (docs/ZONENEDITOR-PLAN.md, Stufe 6): `npx tsx scripts/tor-s6.ts`
 *
 * 1. **Grasnarbe als Platzhalter-Saum** (Florian, 30.10.2026: „nimm eine existierende vorlage aus dem ordner. es gibt
 *    bereits grasnarben oder? du kannst sie ja zerteilen“): `grass_rim_trim.png` aus dem Elemente-Bogen unter `refs/` wird
 *    in Anfang (die linke Locke), Mitte und Ende (die rechte Locke) zerteilt. Die Mitte ist ein Stück, dessen Ränder fast
 *    gleich hoch liegen; ihr Anfang wird über die Fortsetzung hinter ihrem Ende überblendet, so wiederholt sie sich ohne
 *    Naht. Das Ende rückt so weit hoch, dass es an die Mitte anschließt (im Original fällt das Band nach rechts ab). Das
 *    Ergebnis liegt als Saum auf der Grasdecke von Szene 06. **Vor einem Push klären:** das Bild stammt aus `refs/`.
 * 2. **Malvorlagen** (Florian: „mach beides, bogen und grasnarbe“, Saum „beides“): Grasnarbe als Stück zum Wiederholen und
 *    als Streifen für die ganze Kante (je mit der zerteilten Grasnarbe als Unterlage), der große Bogen und die Rückwand der
 *    Höhle. Alles in `public/zones/szene-06/vorlagen/` (PNG, SVG für Illustrator, Begleitdatei), die Vorlagen-Knoten in der
 *    Zonendatei.
 *
 * Läuft mehrmals ohne Schaden: Saum und Vorlagen werden ersetzt, nicht verdoppelt.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findPlane, findShape, isTemplate, type ZoneShape, type ZoneTemplate } from '../src/zone/nodes';
import type { ZoneRim } from '../src/zone/rims';
import { clipSvg, faceTemplate, rimTemplate, templateFile, templateJson, templateSvg, type TemplateDraft } from '../src/zone/template';
import { parseZone, serializeZone } from '../src/zone/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = 'szene-06';
const MADE = '2026-10-30';

/** refs/ liegt nur im Haupt-Checkout: aufwärts suchen wie der Dev-Server */
function upwards(rel: string): string | null {
  let dir = root;
  for (let i = 0; i < 8; i++) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** Spalten mit Deckung: oberste und unterste Zeile mit alpha über 128 */
function columnSpan(data: Buffer, W: number, H: number, x: number): [number, number] {
  let t = -1;
  let b = -1;
  for (let y = 0; y < H; y++)
    if (data[(y * W + x) * 4 + 3] > 128) {
      if (t < 0) t = y;
      b = y;
    }
  return [t, b];
}

/** Grasnarbe zerteilen: Anfang | Mitte (nahtlos) | Ende, Rückgabe PNG und Teilung */
async function cutGrass(file: string): Promise<{ png: Buffer; w: number; h: number; a: number; b: number; base: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  // Grenzen nach dem Spaltenprofil (gemessen am 30.10.: links die Locke bis 300, das Band 300–660 fast waagrecht, rechts
  // die Locke ab 1380): die Mitte beginnt und endet auf gleicher Höhe
  const capL = 300;
  const mid0 = 300;
  const mid1 = 660;
  const capR0 = 1380;
  const fade = 48;
  const [endTop] = columnSpan(data, W, H, mid1 - 1);
  const [capTop] = columnSpan(data, W, H, capR0);
  const dy = capTop - endTop;
  const midW = mid1 - mid0;
  const capRW = W - capR0;
  const outW = capL + midW + capRW;
  const out = Buffer.alloc(outW * H * 4);
  const px = (x: number, y: number): [number, number, number, number] => {
    if (y < 0 || y >= H || x < 0 || x >= W) return [0, 0, 0, 0];
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const put = (x: number, y: number, c: readonly number[]) => out.set(c.map((v) => Math.round(v)), (y * outW + x) * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < capL; x++) put(x, y, px(x, y));
    for (let x = 0; x < midW; x++) {
      const own = px(mid0 + x, y);
      if (x >= fade) {
        put(capL + x, y, own);
        continue;
      }
      // Anfang der Mitte aus der Fortsetzung hinter ihrem Ende überblenden (vormultipliziert, damit keine Ränder entstehen)
      const t = x / fade;
      const next = px(mid1 + x, y);
      const a = next[3] * (1 - t) + own[3] * t;
      const c = [0, 1, 2].map((k) => (a > 0 ? (next[k] * next[3] * (1 - t) + own[k] * own[3] * t) / a : 0));
      put(capL + x, y, [...c, a]);
    }
    for (let x = 0; x < capRW; x++) put(capL + midW + x, y, px(capR0 + x, y + dy));
  }
  // senkrecht auf die Deckung zuschneiden
  let top = H;
  let bottom = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < outW; x++)
      if (out[(y * outW + x) * 4 + 3] > 8) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  const h = bottom - top + 1;
  const png = await sharp(out, { raw: { width: outW, height: H, channels: 4 } })
    .extract({ left: 0, top, width: outW, height: h })
    .png()
    .toBuffer();
  // die Kante der Form: im unteren Drittel des Bands der Mitte (das Band ragt darüber hinaus)
  const [mt, mb] = columnSpan(data, W, H, mid0 + midW / 2);
  const edge = mt + (mb - mt) * 0.7 - top;
  return { png, w: outW, h, a: capL / outW, b: (capL + midW) / outW, base: 1 - edge / h };
}

/** Vorlage als PNG (aus dem SVG), SVG für Illustrator, Begleitdatei; dazu eine Unterlage (Bild im Malbereich) */
async function writeTemplate(dir: string, d: TemplateDraft, under: Buffer | null): Promise<void> {
  const base = join(dir, templateFile(d.t));
  const svg = templateSvg(d, ZONE);
  await sharp(Buffer.from(svg)).png().toFile(`${base}.png`);
  writeFileSync(`${base}.svg`, clipSvg(d, `${templateFile(d.t)}.png`));
  if (under) {
    const m = d.t.margin;
    await sharp(under)
      .resize(d.t.w, d.t.h, { fit: 'fill' })
      .extend({ top: m, bottom: m, left: m, right: m, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(`${base}-unterlage.png`);
  }
}

async function main(): Promise<void> {
  const zoneDir = join(root, 'public/zones', ZONE);
  const zone = parseZone(JSON.parse(readFileSync(join(zoneDir, 'zone.json'), 'utf8')));
  if (!zone?.nodes) throw new Error(`Zone ${ZONE} fehlt`);
  const nodes = zone.nodes;
  const grasdecke = findShape(nodes, 's6');
  const bogen = findShape(nodes, 's5');
  const wand = findShape(nodes, 's9');
  if (!grasdecke || !bogen || !wand) throw new Error('Formen s5, s6, s9 fehlen');

  // 1. Grasnarbe zerteilen
  const trim = upwards('refs/traumacoaster-gpt explore/elements_png/grass_rim_trim.png');
  if (!trim) throw new Error('refs/…/grass_rim_trim.png nicht gefunden (refs/ liegt nur im Haupt-Checkout)');
  const grass = await cutGrass(trim);
  const grassName = 'saum-grasnarbe-platzhalter.png';
  writeFileSync(join(zoneDir, grassName), grass.png);
  const rim: ZoneRim = { id: 'r1', src: `/zones/${ZONE}/${grassName}`, aspect: grass.w / grass.h, width: 4.5, base: Math.round(grass.base * 1000) / 1000, dir: 90, spread: 50, mode: 'repeat', a: grass.a, b: grass.b };
  grasdecke.rims = [rim];
  console.log(`Saum: ${grass.w} × ${grass.h} px, Anfang bis ${(grass.a * 100).toFixed(1)} %, Ende ab ${(grass.b * 100).toFixed(1)} %, Kante bei ${(grass.base * 100).toFixed(0)} % von unten`);

  // 2. Malvorlagen
  const vdir = join(zoneDir, 'vorlagen');
  mkdirSync(vdir, { recursive: true });
  const keep = nodes.filter((n) => !(isTemplate(n) && ['v1', 'v2', 'v3', 'v4'].includes(n.id)));
  const drafts: Array<{ d: TemplateDraft; under: Buffer | null }> = [];
  const plane = (s: ZoneShape) => {
    const p = findPlane(nodes, s.parent);
    if (!p) throw new Error(`Ebene von ${s.id} fehlt`);
    return p;
  };
  const piece = rimTemplate('v1', plane(grasdecke), grasdecke, rim, 'repeat', MADE);
  const strip = rimTemplate('v2', plane(grasdecke), grasdecke, rim, 'stretch', MADE);
  const arch = faceTemplate('v3', plane(bogen), bogen, null, MADE);
  const back = faceTemplate('v4', plane(wand), wand, null, MADE);
  if (!piece || !strip || !arch || !back) throw new Error('Vorlage nicht möglich');
  drafts.push({ d: piece, under: grass.png }, { d: strip, under: grass.png }, { d: arch, under: null }, { d: back, under: null });
  for (const { d, under } of drafts) {
    await writeTemplate(vdir, d, under);
    writeFileSync(join(vdir, `${templateFile(d.t)}.json`), templateJson(d, ZONE, plane(findShape(nodes, d.t.shape) as ZoneShape)) + '\n');
    console.log(`${d.t.id} ${d.t.name}: ${d.t.w} × ${d.t.h} px, ${d.t.ppm} px/m, scharf bis Zoom ${d.sharp}`);
  }
  zone.nodes = [...keep, ...drafts.map(({ d }) => d.t as ZoneTemplate)];
  const text = serializeZone(zone);
  writeFileSync(join(zoneDir, 'zone.json'), text.endsWith('\n') ? text : text + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
