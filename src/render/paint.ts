/**
 * Prozedurale „handgemalte“ Texturen auf Canvas. Alles deterministisch über Seeds.
 * Jede Textur hat einen Namen im Manifest; liegt unter public/art/<name>.png ein echtes Bild,
 * wird es vom Asset-Loader bevorzugt (siehe assets/manifest.ts).
 */
import { CanvasSource, Texture } from 'pixi.js';
import { noise1, rng } from '@/core/math';

const cache = new Map<string, Texture>();

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Farbe aufhellen (t>0) oder abdunkeln (t<0) */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (t >= 0) return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  return rgbToHex(r * (1 + t), g * (1 + t), b * (1 + t));
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function hexNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function cached(name: string, make: () => HTMLCanvasElement): Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const tex = Texture.from(make());
  cache.set(name, tex);
  return tex;
}

/** Himmel: dreistufiger Verlauf mit gemalten Pinselbändern */
export function skyTexture(name: string, colors: [string, string, string], seed = 1): Texture {
  return cached(`sky_${name}`, () => {
    const [c, ctx] = canvas(64, 512);
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.55, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 512);
    const r = rng(seed);
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) {
      const y = r() * 512;
      ctx.fillStyle = r() < 0.5 ? '#ffffff' : colors[1];
      ctx.fillRect(0, y, 64, 2 + r() * 10);
    }
    ctx.globalAlpha = 1;
    return c;
  });
}

/** Wolke: weiche, gemalte Form mit Schattierung unten */
export function cloudTexture(variant: number, tint = '#ffffff'): Texture {
  return cached(`cloud_${variant}_${tint}`, () => {
    const w = 256;
    const h = 150;
    const [c, ctx] = canvas(w, h);
    const r = rng(100 + variant);
    const blobs = 5 + Math.floor(r() * 4);
    ctx.save();
    // Schattenlage
    for (let pass = 0; pass < 2; pass++) {
      const rr = rng(100 + variant);
      ctx.fillStyle = pass === 0 ? shade(tint, -0.14) : tint;
      const dy = pass === 0 ? 6 : 0;
      for (let i = 0; i < blobs; i++) {
        const x = 40 + rr() * (w - 80);
        const y = 60 + rr() * 40 + dy;
        const rad = 28 + rr() * 38;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      // flacher Boden
      ctx.beginPath();
      ctx.ellipse(w / 2, 108 + dy, w / 2 - 30, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lichtkante oben
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    const rr2 = rng(100 + variant);
    for (let i = 0; i < blobs; i++) {
      const x = 40 + rr2() * (w - 80);
      const y = 60 + rr2() * 40;
      const rad = 28 + rr2() * 38;
      ctx.beginPath();
      ctx.arc(x - 4, y - 8, rad * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return c;
  });
}

/** Papierkorn für den ganzen Bildschirm (Multiply) */
export function paperTexture(): Texture {
  return cached('paper', () => {
    const [c, ctx] = canvas(256, 256);
    const img = ctx.createImageData(256, 256);
    const r = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 238 + r() * 17;
      img.data[i] = v;
      img.data[i + 1] = v - 2;
      img.data[i + 2] = v - 6;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/**
 * Schienenprofil für das Band-Mesh: quer (UV.y) Tinte – Schiene – Lichtkante – Schiene – Tinte, längs (UV.x) kachelbar
 * mit leichter Maserung (bei Holz-Skins zusätzlich die gemalte Holzkachel, multipliziert). 64 × 16 px, wiederholt
 * sich entlang der Bahn, mit Mipmaps gegen Flimmern bei kleinen Zooms.
 */
export function railProfileTexture(key: string, rail: string, light: string, ink: string, grain: CanvasImageSource | null = null, seed = 3): Texture {
  const name = `railprofile_${key}`;
  const hit = cache.get(name);
  if (hit) return hit;
  const w = 64;
  const h = 16;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  // Tinte außen (Rand bleibt halb transparent, wie der alte Kontur-Strich)
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, h - 3, w, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = rail;
  ctx.fillRect(0, 3, w, h - 6);
  if (grain) {
    try {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(grain, 0, 0, (grain as HTMLImageElement).width ?? w, 60, 0, 3, w, h - 6);
    } catch {
      /* Quelle nicht zeichenbar: nur prozedurale Maserung */
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // Maserung längs: kurze dunklere und hellere Striche
  const r = rng(seed);
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const y = 3 + r() * (h - 6);
    const len = 6 + r() * 24;
    ctx.strokeStyle = shade(rail, (r() - 0.5) * 0.3);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
    if (x + len > w) {
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.lineTo(x - w + len, y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = light;
  ctx.fillRect(0, 6, w, 4);
  ctx.globalAlpha = 1;
  const source = new CanvasSource({ resource: c, addressMode: 'repeat', scaleMode: 'linear', autoGenerateMipmaps: true });
  const tex = new Texture({ source });
  cache.set(name, tex);
  return tex;
}

/** Pinselstrich-Streifen (kachelbar in x) für Bodenflächen */
export function brushStripTexture(name: string, base: string, seed = 3): Texture {
  return cached(`strip_${name}`, () => {
    const w = 512;
    const h = 64;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 90; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = 20 + r() * 80;
      const t = (r() - 0.5) * 0.22;
      ctx.strokeStyle = shade(base, t);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2 + r() * 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (r() - 0.5) * 6);
      ctx.stroke();
      // kachelbar: Striche, die rechts rauslaufen, links wiederholen
      if (x + len > w) {
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.lineTo(x - w + len, y + (r() - 0.5) * 6);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return c;
  });
}

/** Glitzer-Stern (für Coins, Handles) */
export function sparkleTexture(): Texture {
  return cached('sparkle', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(32, 2); ctx.lineTo(36, 28); ctx.lineTo(62, 32); ctx.lineTo(36, 36); ctx.lineTo(32, 62); ctx.lineTo(28, 36); ctx.lineTo(2, 32); ctx.lineTo(28, 28);
    ctx.closePath();
    ctx.fill();
    return c;
  });
}

/** Weicher runder Lichtfleck (Partikel) */
export function glowTexture(): Texture {
  return cached('glow', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c;
  });
}

/** Wackelige Linie: Punkte entlang einer Polylinie mit Rauschen versetzen (handgezeichnet) */
export function wobble(points: Array<{ x: number; y: number }>, amount: number, seed = 1, freq = 0.7): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const n = noise1(s * freq + seed * 13.7, seed);
    const m = noise1(s * freq * 1.7 + seed * 3.1, seed + 5);
    out.push({ x: points[i].x + n * amount, y: points[i].y + m * amount });
  }
  return out;
}
