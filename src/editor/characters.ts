/**
 * Figuren-Definitionen: Was eine Fahrgast-Figur ausmacht (Auswahl statt Zeichnen).
 * Wird vom Figuren-Editor bearbeitet und vom Renderer gezeichnet.
 */
import { rng } from '@/core/math';

export type HairStyle = 'none' | 'short' | 'spiky' | 'long' | 'bob' | 'curly' | 'bun' | 'mohawk' | 'side' | 'ponytail' | 'afro' | 'bald' | 'buzz' | 'wavy';
export type HeadShape = 'round' | 'tall' | 'square' | 'egg' | 'wide';
export type EyeStyle = 'big' | 'sleepy' | 'wide' | 'small' | 'wink' | 'round';
export type BrowStyle = 'none' | 'thin' | 'thick' | 'angry' | 'raised';
export type GlassesStyle = 'none' | 'round' | 'square' | 'sun' | 'nerd' | 'aviator';
export type BeardStyle = 'none' | 'stubble' | 'goatee' | 'full' | 'mustache' | 'chin';
export type MouthStyle = 'smile' | 'grin' | 'flat' | 'open' | 'smirk';
export type HatStyle = 'none' | 'cap' | 'capBack' | 'beanie' | 'tophat' | 'helmet' | 'crown' | 'bandana';
export type TopStyle = 'tee' | 'hoodie' | 'jacket' | 'shirt' | 'tank' | 'dress' | 'sweater' | 'vest' | 'overall' | 'suit' | 'jersey' | 'raincoat';
export type LogoStyle = 'none' | 'star' | 'heart' | 'skull' | 'bolt' | 'eagle' | 'mountain' | 'smiley' | 'coaster' | 'text';
export type PantsStyle = 'jeans' | 'shorts' | 'cargo' | 'skirt' | 'leggings' | 'chinos';
export type ShoeStyle = 'sneaker' | 'boot' | 'sandal' | 'highTop' | 'loafer' | 'rainbow' | 'bare' | 'heels';

export interface CharacterDef {
  id: string;
  name: string;
  headShape: HeadShape;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  eyes: EyeStyle;
  eyeColor: string;
  brows: BrowStyle;
  glasses: GlassesStyle;
  beard: BeardStyle;
  mouth: MouthStyle;
  hat: HatStyle;
  hatColor: string;
  top: TopStyle;
  topColor: string;
  logo: LogoStyle;
  logoText?: string;
  pants: PantsStyle;
  pantsColor: string;
  shoes: ShoeStyle;
  shoeColor: string;
}

export const SKIN_TONES = ['#ffe0c2', '#f7c9a1', '#e8b184', '#d49a6a', '#b97a4f', '#8f5a3a', '#6b3f28', '#4a2a1c'];
export const HAIR_COLORS = ['#2b1b12', '#5a3a22', '#8a5a2b', '#c98a3c', '#e8c36a', '#d64545', '#a855f7', '#3b82f6', '#22c55e', '#f8f8f8'];
export const PALETTE = [
  '#ff5c8a', '#ff8a5c', '#ffd23f', '#7ee081', '#3ec7c2', '#4f8dff', '#9b6dff', '#ff6ec7',
  '#1b2a4a', '#ffffff', '#c9a36b', '#5b2a86', '#e8d9b5', '#2f7a4a', '#b3321f', '#55596b',
];

export const HAIR_STYLES: HairStyle[] = ['short', 'spiky', 'long', 'bob', 'curly', 'bun', 'mohawk', 'side', 'ponytail', 'afro', 'buzz', 'wavy', 'bald', 'none'];
export const HEAD_SHAPES: HeadShape[] = ['round', 'tall', 'square', 'egg', 'wide'];
export const EYE_STYLES: EyeStyle[] = ['big', 'round', 'wide', 'sleepy', 'small', 'wink'];
export const BROW_STYLES: BrowStyle[] = ['thin', 'thick', 'raised', 'angry', 'none'];
export const GLASSES_STYLES: GlassesStyle[] = ['none', 'round', 'square', 'nerd', 'sun', 'aviator'];
export const BEARD_STYLES: BeardStyle[] = ['none', 'stubble', 'goatee', 'mustache', 'chin', 'full'];
export const MOUTH_STYLES: MouthStyle[] = ['smile', 'grin', 'flat', 'open', 'smirk'];
export const HAT_STYLES: HatStyle[] = ['none', 'cap', 'capBack', 'beanie', 'tophat', 'helmet', 'crown', 'bandana'];
export const TOP_STYLES: TopStyle[] = ['tee', 'hoodie', 'jacket', 'shirt', 'tank', 'dress', 'sweater', 'vest', 'overall', 'suit', 'jersey', 'raincoat'];
export const LOGO_STYLES: LogoStyle[] = ['none', 'star', 'heart', 'skull', 'bolt', 'eagle', 'mountain', 'smiley', 'coaster', 'text'];
export const PANTS_STYLES: PantsStyle[] = ['jeans', 'shorts', 'cargo', 'skirt', 'leggings', 'chinos'];
export const SHOE_STYLES: ShoeStyle[] = ['sneaker', 'highTop', 'boot', 'rainbow', 'sandal', 'loafer', 'heels', 'bare'];

/** Die beiden Figuren aus dem Entwurf (Cap-Typ und Brillen-Typ) als Standard-Fahrgäste. */
export const DEFAULT_CHARACTERS: CharacterDef[] = [
  {
    id: 'capguy', name: 'Ben', headShape: 'tall', skin: '#f7c9a1', hair: 'short', hairColor: '#8a3a4a', eyes: 'big', eyeColor: '#1b2a4a',
    brows: 'thick', glasses: 'none', beard: 'stubble', mouth: 'smile', hat: 'capBack', hatColor: '#3ec7c2', top: 'tee', topColor: '#1b1b1b',
    logo: 'eagle', pants: 'chinos', pantsColor: '#e8d9b5', shoes: 'rainbow', shoeColor: '#ffffff',
  },
  {
    id: 'glassesguy', name: 'Jo', headShape: 'egg', skin: '#ffe0c2', hair: 'long', hairColor: '#b5512a', eyes: 'round', eyeColor: '#1b2a4a',
    brows: 'thin', glasses: 'square', beard: 'stubble', mouth: 'flat', hat: 'none', hatColor: '#ffffff', top: 'jacket', topColor: '#b3321f',
    logo: 'mountain', pants: 'jeans', pantsColor: '#4f8dff', shoes: 'sneaker', shoeColor: '#1b1b1b',
  },
  {
    id: 'mia', name: 'Mia', headShape: 'round', skin: '#e8b184', hair: 'bun', hairColor: '#2b1b12', eyes: 'wide', eyeColor: '#2f7a4a',
    brows: 'raised', glasses: 'none', beard: 'none', mouth: 'grin', hat: 'none', hatColor: '#ffffff', top: 'hoodie', topColor: '#ff5c8a',
    logo: 'star', pants: 'leggings', pantsColor: '#1b2a4a', shoes: 'highTop', shoeColor: '#ffd23f',
  },
  {
    id: 'sam', name: 'Sam', headShape: 'wide', skin: '#b97a4f', hair: 'afro', hairColor: '#2b1b12', eyes: 'big', eyeColor: '#1b2a4a',
    brows: 'thick', glasses: 'round', beard: 'goatee', mouth: 'smirk', hat: 'none', hatColor: '#ffffff', top: 'jersey', topColor: '#7ee081',
    logo: 'bolt', pants: 'shorts', pantsColor: '#ffffff', shoes: 'sandal', shoeColor: '#c9a36b',
  },
];

let counter = 0;
export function randomCharacter(seed = Date.now()): CharacterDef {
  const r = rng(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  counter++;
  const names = ['Lu', 'Kai', 'Nia', 'Tom', 'Ava', 'Leo', 'Zoe', 'Max', 'Ida', 'Noah', 'Emi', 'Finn', 'Lia', 'Paul', 'Mo', 'Elli'];
  return {
    id: `c${seed.toString(36)}${counter}`,
    name: pick(names),
    headShape: pick(HEAD_SHAPES),
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES.filter((h) => h !== 'none')),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYE_STYLES),
    eyeColor: pick(['#1b2a4a', '#2f7a4a', '#5a3a22', '#4f8dff']),
    brows: pick(BROW_STYLES),
    glasses: r() < 0.3 ? pick(GLASSES_STYLES.filter((g) => g !== 'none')) : 'none',
    beard: r() < 0.3 ? pick(BEARD_STYLES.filter((b) => b !== 'none')) : 'none',
    mouth: pick(MOUTH_STYLES),
    hat: r() < 0.35 ? pick(HAT_STYLES.filter((h) => h !== 'none')) : 'none',
    hatColor: pick(PALETTE),
    top: pick(TOP_STYLES),
    topColor: pick(PALETTE),
    logo: pick(LOGO_STYLES.filter((l) => l !== 'text')),
    pants: pick(PANTS_STYLES),
    pantsColor: pick(PALETTE),
    shoes: pick(SHOE_STYLES),
    shoeColor: pick(PALETTE),
  };
}
