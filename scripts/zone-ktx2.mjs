/**
 * KTX2 beim Kompilieren (docs/ZONENEDITOR-PLAN.md, Stufe 6; Plan 4.11 „Bilder im Atlas (KTX2)“):
 * `node scripts/zone-ktx2.mjs <zone> [<zone> …]` oder `--all` (npm run kompilieren).
 *
 * Packt jedes Bild, das eine Zone als Bildfüllung oder Saum trägt, als KTX2 (Basis Universal UASTC mit Mipmaps und
 * Zstandard) neben das Original und schreibt `public/zones/<zone>/ktx2.json` (Bild → KTX2-Datei, Größe, Grafikspeicher,
 * Prüfsumme des Originals). Das Spiel lädt dann die KTX2-Fassung (`src/world/imageTextures.ts`): Am Handy liegt sie gepackt
 * auf der Grafikkarte (ASTC, ETC2 oder BC7, ein Byte je Bildpunkt statt vier). Unveränderte Bilder (gleiche Prüfsumme)
 * werden übersprungen. Der Dev-Server ruft das Skript nach jedem Hochladen eines Bilds für dessen Zone auf.
 *
 * Vor dem Packen: Kanten auf Vielfache von 4 (Blockgröße), vormultipliziertes Alpha (Mipmaps ohne dunkle Ränder an
 * durchsichtigen Stellen; die Shader teilen wieder durch Alpha), Zeilen von unten nach oben wie bei PNG-Texturen.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zonesDir = join(root, 'public/zones');

/** Bilder einer Zone (Dateinamen neben zone.json), die Bildfüllungen und Säume tragen */
function imagesOf(zone) {
  const file = join(zonesDir, zone, 'zone.json');
  if (!existsSync(file)) return [];
  const z = JSON.parse(readFileSync(file, 'utf8'));
  const out = new Set();
  const take = (src) => {
    const m = typeof src === 'string' ? /^\/zones\/([a-z0-9-]+)\/([\w.-]+\.(?:png|webp|jpe?g))$/.exec(src) : null;
    if (m && m[1] === zone) out.add(m[2]);
  };
  const fills = (list) => (Array.isArray(list) ? list : []).forEach((f) => f && f.type === 'image' && take(f.src));
  for (const n of z.nodes ?? []) {
    if (n.kind === 'plane') fills(n.fills);
    if (n.kind === 'style') fills(n.fills);
    if (n.kind !== 'shape') continue;
    fills(n.fills);
    for (const r of n.regions ?? []) fills(r.fills);
    for (const r of n.rims ?? []) take(r.src);
  }
  return [...out].sort();
}

const up4 = (v) => Math.max(4, Math.ceil(v / 4) * 4);

/** ein Bild packen: Rohdaten vormultipliziert und gespiegelt an den Encoder */
async function encode(path) {
  const meta = await sharp(path).metadata();
  const w = up4(meta.width ?? 4);
  const h = up4(meta.height ?? 4);
  const { data } = await sharp(path).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    px[i] = Math.round(px[i] * a);
    px[i + 1] = Math.round(px[i + 1] * a);
    px[i + 2] = Math.round(px[i + 2] * a);
  }
  const ktx = await encodeToKTX2(new Uint8Array(1), {
    enableDebug: false,
    isUASTC: true,
    generateMipmap: true,
    isYFlip: true,
    needSupercompression: true,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: false,
    imageDecoder: async () => ({ data: px, width: w, height: h }),
  });
  return { ktx, w, h };
}

async function compile(zone) {
  const dir = join(zonesDir, zone);
  const manFile = join(dir, 'ktx2.json');
  const before = existsSync(manFile) ? JSON.parse(readFileSync(manFile, 'utf8')) : {};
  const man = {};
  let made = 0;
  for (const name of imagesOf(zone)) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const sha1 = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 16);
    const file = name.replace(/\.(png|webp|jpe?g)$/, '.ktx2');
    const old = before[name];
    if (old && old.sha1 === sha1 && existsSync(join(dir, old.file))) {
      man[name] = old;
      continue;
    }
    const t0 = Date.now();
    const { ktx, w, h } = await encode(path);
    writeFileSync(join(dir, file), ktx);
    man[name] = { file, w, h, gpu: Math.round(w * h * (4 / 3)), sha1 };
    made++;
    console.log(`${zone}/${name} → ${file}: ${w} × ${h}, ${(ktx.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
  }
  const text = JSON.stringify(man, null, 2) + '\n';
  if (Object.keys(man).length || existsSync(manFile)) {
    if (!existsSync(manFile) || readFileSync(manFile, 'utf8') !== text) writeFileSync(manFile, text);
  }
  return made;
}

const args = process.argv.slice(2);
const zones = args.includes('--all') ? readdirSync(zonesDir).filter((d) => existsSync(join(zonesDir, d, 'zone.json'))) : args.filter((a) => /^[a-z0-9-]{1,40}$/.test(a));
if (!zones.length) {
  console.error('Aufruf: node scripts/zone-ktx2.mjs <zone> … | --all');
  process.exit(2);
}
let total = 0;
for (const z of zones) total += await compile(z);
console.log(`KTX2: ${total} Bild${total === 1 ? '' : 'er'} neu gepackt`);
