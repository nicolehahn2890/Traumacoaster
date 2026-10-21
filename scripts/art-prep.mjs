/**
 * Texturen aufbereiten: art-src/<name>.(png|jpg|webp) → public/art/<name>.webp + manifest.json.
 * Regeln je Kachel aus scripts/art-kit.json:
 *   size       Zielgröße [Breite, Höhe]; Höhe 0 = aus dem Seitenverhältnis (nur mit fit "width")
 *   key        Hintergrundfarbe → Alpha (Farbsaum herausgerechnet), danach auf den Inhalt zugeschnitten
 *   fit        "inside" (Standard bei key: passt in size, Seitenverhältnis bleibt) oder "width" (Breite fest, Höhe folgt)
 *   shadow     Key-farbige dunkle Bereiche (gemalter Schlagschatten auf dem Key) werden zu halbtransparentem Dunkel
 *   despill    Key-Farbstich in halbdurchsichtigen Pixeln entfernen (für dünne, getupfte Motive ohne Key-ähnliche Farben)
 *   seamless   "x" oder "xy": Ränder mit dem um die halbe Kachel verschobenen Bild überblendet
 *   procedural "glow" | "stipple": ohne Quelle erzeugt
 *   node       Knoten in der Figma-Datei (figmaFile), aus der die Quelle exportiert wurde
 *   node scripts/art-prep.mjs            alle Kacheln
 *   node scripts/art-prep.mjs cloud_a    nur diese
 */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KIT = JSON.parse(await readFile(new URL('./art-kit.json', import.meta.url), 'utf8'));
const SRC = 'art-src';
const OUT = 'public/art';
const ONLY = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const c255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Hintergrundfarbe zu Alpha: nah an der Key-Farbe → durchsichtig, Übergang weich, Farbsaum herausgerechnet */
export function chromaKey(data, w, h, keyHex, shadow = false, despill = false) {
  const [kr, kg, kb] = hexRgb(keyHex);
  const t0 = 36; // ab hier (RGB-Abstand) beginnt die Deckung
  const t1 = 120; // ab hier voll deckend
  // Key-Farbton (normiert) für die Schatten-Regel: dunkle Pixel mit dem Farbton des Keys sind gemalter Schatten
  const kl = Math.hypot(kr, kg, kb) || 1;
  const kn = [kr / kl, kg / kl, kb / kl];
  const strong = [kr, kg, kb].map((v) => v > 128); // Kanäle, die der Key stark hat (Magenta: R und B)
  for (let i = 0; i < w * h * 4; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.hypot(r - kr, g - kg, b - kb);
    const a = smooth((d - t0) / (t1 - t0));
    if (a <= 0) { data[i + 3] = 0; continue; }
    if (shadow) {
      const l = Math.hypot(r, g, b) || 1;
      const cos = (r * kn[0] + g * kn[1] + b * kn[2]) / l;
      if (cos > 0.97 && l < kl * 0.92) {
        // gleicher Farbton wie der Key, aber dunkler → Schlagschatten: dunkel und halb durchsichtig
        const depth = clamp01(1 - l / kl); // 0 = Key-Helligkeit, 1 = schwarz
        data[i] = 24; data[i + 1] = 10; data[i + 2] = 36;
        data[i + 3] = c255(255 * Math.min(0.55, depth * 1.6));
        continue;
      }
    }
    if (a < 1) {
      // Mischung aus Objektfarbe und Key: Objektfarbe = (c − (1−a)·key) / a
      data[i] = c255((r - (1 - a) * kr) / a);
      data[i + 1] = c255((g - (1 - a) * kg) / a);
      data[i + 2] = c255((b - (1 - a) * kb) / a);
    }
    if (despill) {
      // Rest-Farbstich des Keys: die starken Key-Kanäle dürfen den schwächsten anderen Kanal nicht übersteigen
      const v = [data[i], data[i + 1], data[i + 2]];
      let lo = Infinity, hi = Infinity;
      for (let c = 0; c < 3; c++) strong[c] ? (hi = Math.min(hi, v[c])) : (lo = Math.min(lo, v[c]));
      const spill = hi - lo;
      if (spill > 0) for (let c = 0; c < 3; c++) if (strong[c]) data[i + c] = c255(v[c] - spill);
    }
    data[i + 3] = c255(a * 255);
  }
  return data;
}

/** Bounding-Box der sichtbaren Pixel (Alpha > 8), mit Rand */
export function alphaBox(data, w, h, margin = 2) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { left: 0, top: 0, width: w, height: h };
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  x1 = Math.min(w - 1, x1 + margin); y1 = Math.min(h - 1, y1 + margin);
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Kachelbar: Ränder mit dem um die halbe Kachel verschobenen Bild überblenden (Mitte bleibt original) */
export function seamless(data, w, h, mode) {
  const out = Buffer.from(data);
  const bx = Math.max(1, Math.round(w * 0.12));
  const by = Math.max(1, Math.round(h * 0.12));
  const sx = Math.floor(w / 2);
  const sy = mode === 'xy' ? Math.floor(h / 2) : 0;
  for (let y = 0; y < h; y++) {
    const ey = mode === 'xy' ? Math.min(y, h - 1 - y) : Infinity;
    for (let x = 0; x < w; x++) {
      const ex = Math.min(x, w - 1 - x);
      const e = Math.min(ex / bx, ey / by);
      const m = 1 - smooth(e); // 1 am Rand, 0 ab der Blendbreite
      if (m <= 0) continue;
      const xs = (x + sx) % w;
      const ys = (y + sy) % h;
      const i = (y * w + x) * 4;
      const j = (ys * w + xs) * 4;
      for (let c = 0; c < 4; c++) out[i + c] = Math.round(data[i + c] * (1 - m) + data[j + c] * m);
    }
  }
  return out;
}

/** Deterministischer Zufall (Mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weißer radialer Schein, Alpha fällt weich nach außen ab */
function glowSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/>
    <stop offset="0.3" stop-color="#fff" stop-opacity="0.8"/>
    <stop offset="0.6" stop-color="#fff" stop-opacity="0.32"/>
    <stop offset="0.85" stop-color="#fff" stop-opacity="0.07"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
</svg>`;
}

/** Stipple-Bogen: unregelmäßige schwarze Tupfen in vier Größen, gleichmäßig gestreut, an den Rändern umgebrochen */
function stippleSvg(w, h) {
  const rand = rng(7);
  const cell = 16;
  const radii = [1.6, 2.4, 3.3, 4.6];
  const parts = [];
  for (let gy = 0; gy < h / cell; gy++) {
    for (let gx = 0; gx < w / cell; gx++) {
      if (rand() < 0.12) continue; // kleine Lücken, damit es nicht wie ein Raster wirkt
      const x = (gx + 0.15 + rand() * 0.7) * cell;
      const y = (gy + 0.15 + rand() * 0.7) * cell;
      const r = radii[Math.floor(rand() * radii.length)] * (0.85 + rand() * 0.3);
      const ry = r * (0.78 + rand() * 0.22);
      const rot = Math.round(rand() * 180);
      // Kopien über die Ränder hinaus, damit die Kachel ohne Naht wiederholt
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        const px = x + dx, py = y + dy;
        if (px < -8 || py < -8 || px > w + 8 || py > h + 8) continue;
        parts.push(`<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${r.toFixed(2)}" ry="${ry.toFixed(2)}" transform="rotate(${rot} ${px.toFixed(1)} ${py.toFixed(1)})" fill="#000"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`;
}

async function procedural(a) {
  const [w, h] = a.size;
  const svg = a.procedural === 'glow' ? glowSvg(w, h) : stippleSvg(w, h);
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function fromSource(a, src) {
  const [tw, th] = a.size;
  if (!a.key) {
    // Fläche: zentriert auf Zielgröße beschneiden
    return sharp(src).ensureAlpha().resize(tw, th, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  }
  // Freisteller: Key in voller Auflösung → Zuschnitt auf den Inhalt → passend skalieren
  const full = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyed = chromaKey(full.data, full.info.width, full.info.height, a.key, a.shadow === true, a.despill === true);
  const box = alphaBox(keyed, full.info.width, full.info.height);
  let img = sharp(keyed, { raw: { width: full.info.width, height: full.info.height, channels: 4 } }).extract(box);
  if (a.fit === 'width') img = img.resize({ width: tw, kernel: 'lanczos3' });
  else img = img.resize(tw, th, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
  return img.raw().toBuffer({ resolveWithObject: true });
}

const done = [];
for (const a of KIT.assets) {
  if (ONLY.length && !ONLY.includes(a.name)) continue;
  let result;
  if (a.procedural) {
    result = await procedural(a);
  } else {
    const src = ['png', 'jpg', 'jpeg', 'webp'].map((e) => `${SRC}/${a.name}.${e}`).find((p) => existsSync(p));
    if (!src) {
      console.log('fehlt:', a.name);
      continue;
    }
    result = await fromSource(a, src);
  }
  let { data: px, info } = result;
  if (a.seamless) px = seamless(px, info.width, info.height, a.seamless);
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 86, alphaQuality: 92, effort: 5 })
    .toFile(`${OUT}/${a.name}.webp`);
  done.push(a.name);
  console.log('ok:', a.name, `${info.width}×${info.height}`, a.key ? 'alpha' : '', a.seamless ? `seamless ${a.seamless}` : '', a.procedural ? `prozedural ${a.procedural}` : '');
}
// Manifest: alle vorhandenen Kacheln (auch die, die dieser Lauf nicht angefasst hat)
const all = KIT.assets.map((a) => a.name).filter((n) => existsSync(`${OUT}/${n}.webp`));
await writeFile(`${OUT}/manifest.json`, JSON.stringify(all, null, 2) + '\n');
console.log(`manifest: ${all.length} Kacheln`);
