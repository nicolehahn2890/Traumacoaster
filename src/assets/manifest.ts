/**
 * Asset-Manifest: Namen aller Texturen, die prozedural erzeugt werden.
 * Liegt unter public/art/<name>.webp (oder .png) eine echte gemalte Textur, wird sie bevorzugt.
 * public/art/manifest.json listet die vorhandenen Kacheln; scripts/art-prep.mjs erzeugt beides aus art-src/.
 *
 * Namensschema: <kategorie>_<welt|skin>_<variante>
 */
import { Assets, Texture } from 'pixi.js';

const overrides = new Map<string, Texture>();
let checked = false;

/** Prüft einmalig, welche Drop-in-Texturen vorhanden sind (public/art/manifest.json listet sie). */
export async function loadArtOverrides(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const base = import.meta.env.BASE_URL ?? './';
    const res = await fetch(`${base}art/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const names = (await res.json()) as string[];
    await Promise.all(
      names.map(async (name) => {
        for (const ext of ['webp', 'png']) {
          try {
            const tex = await Assets.load<Texture>(`${base}art/${name}.${ext}`);
            overrides.set(name, tex);
            break;
          } catch {
            /* nächstes Format, sonst prozedural */
          }
        }
      }),
    );
  } catch {
    /* kein Manifest: alles prozedural */
  }
}

/** Liefert die Drop-in-Textur, falls vorhanden, sonst die prozedurale. */
export function art(name: string, fallback: () => Texture): Texture {
  return overrides.get(name) ?? fallback();
}

/** Gibt es für diesen Namen eine echte gemalte Textur? */
export function hasArt(name: string): boolean {
  return overrides.has(name);
}

export const ART_NAMES = {
  sky: (world: number) => `sky_w${world}_day`,
  /** drei gemalte Wolkenformen a, b, c (docs/ART-PROMPTS.md) */
  cloud: (variant: number) => `cloud_${String.fromCharCode(97 + variant)}`,
  ground: (world: number, lane: number) => `ground_w${world}_lane${lane}`,
  rail: (skin: string, part: 'rail' | 'tie' | 'strut' | 'post') => `rail_${skin}_${part}`,
  prop: (id: string) => `prop_${id}`,
  paper: () => 'paper_grain',
  grass: (variant: number) => `grass_brush_${String.fromCharCode(97 + variant)}`,
  rock: (variant: number) => `rock_${String.fromCharCode(97 + variant)}`,
  wood: () => 'wood_beam',
  steel: () => 'steel',
  stipple: () => 'stipple_sheet',
  leafDot: () => 'leaf_dot',
  glow: () => 'glow',
  tree: (kind: 'ball' | 'fan') => `tree_${kind}`,
  firDots: () => 'fir_dots',
  portal: () => 'portal_arch',
  crystal: () => 'crystal',
  lantern: () => 'lantern',
  water: () => 'water_band',
  snow: () => 'snow_field',
  neon: () => 'neon_sign',
  sticker: () => 'sticker_paper',
};
