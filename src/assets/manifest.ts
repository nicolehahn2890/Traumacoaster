/**
 * Asset-Manifest: Namen aller Texturen, die prozedural erzeugt werden.
 * Liegt unter public/art/<name>.png eine echte gemalte Textur, wird sie bevorzugt.
 *
 * Namensschema: <kategorie>_<welt|skin>_<variante>.png
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
        try {
          const tex = await Assets.load<Texture>(`${base}art/${name}.png`);
          overrides.set(name, tex);
        } catch {
          /* fehlende Datei: prozedural */
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

export const ART_NAMES = {
  sky: (world: number) => `sky_w${world}_day`,
  cloud: (variant: number) => `cloud_${String.fromCharCode(97 + variant)}`,
  ground: (world: number, lane: number) => `ground_w${world}_lane${lane}`,
  rail: (skin: string, part: 'rail' | 'tie' | 'strut' | 'post') => `rail_${skin}_${part}`,
  prop: (id: string) => `prop_${id}`,
  paper: () => 'paper_grain',
};
