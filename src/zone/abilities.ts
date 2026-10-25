/**
 * Fähigkeiten der Bahn als Schalter (Etappe 2, Schritt 1; Plan 3.1, 2.4, 2.1): Die Basiszone kann alles, ein Feld
 * schaltet je Level um. Die Aufwertungsstufen aus 2.4 sind eine Tabelle der Zone (Stufe → Satz von Schaltern mit Gurt,
 * Kettenzugstärke und Wagenvariante), die das Leveldesign später füllt; ein Feld wählt eine Stufe, kann einzelne
 * Schalter überschreiben und trägt Streckenbudget und Höhenlimit. Ohne Tabelle gilt die Vorbelegung unten, ein
 * Platzhalter. Reine Daten und Funktionen, ohne Renderer (testbar in Node).
 */
import type { BeltLevel, ElementId } from '@/levels/types';

/** Schalter nach Plan 3.1: Startarten, Streckenelemente, Rolle (Schrauben), Tunnel erlaubt */
export type ZoneAbility = 'chainlift' | 'launch' | 'hydro' | 'swing' | 'verticalLift' | 'booster' | 'brake' | 'splash' | 'launchBlock' | 'roll' | 'tunnel';
export const ZONE_ABILITIES: readonly ZoneAbility[] = ['chainlift', 'launch', 'hydro', 'swing', 'verticalLift', 'booster', 'brake', 'splash', 'launchBlock', 'roll', 'tunnel'];
/** Startarten unter den Schaltern (gleiche Namen wie `TrackPath.startType`) */
export const START_ABILITIES: readonly ZoneAbility[] = ['chainlift', 'launch', 'hydro', 'swing', 'verticalLift'];

/** Wörter der Schalterzeile im Editor (das erste ist das Schreibwort); die Kennung selbst gilt immer */
export const ABILITY_WORDS: Record<ZoneAbility, readonly string[]> = {
  chainlift: ['kettenzug'],
  launch: ['launch'],
  hydro: ['hydro'],
  swing: ['pendel'],
  verticalLift: ['vertikallift', 'lift'],
  booster: ['booster'],
  brake: ['bremse'],
  splash: ['splash'],
  launchBlock: ['launchblock', 'block'],
  roll: ['rolle', 'schraube'],
  tunnel: ['tunnel'],
};

/** Freischaltung im heutigen Level-Modell, die der Schalter steuert */
export const ABILITY_UNLOCK: Record<ZoneAbility, ElementId> = {
  chainlift: 'chainlift',
  launch: 'launch',
  hydro: 'hydroLaunch',
  swing: 'swingLaunch',
  verticalLift: 'verticalLift',
  booster: 'booster',
  brake: 'brake',
  splash: 'splash',
  launchBlock: 'doubleLaunch',
  roll: 'roll',
  tunnel: 'tunnel',
};

/** eine Aufwertungsstufe der Zone (Plan 2.4): benannter Satz von Schaltern */
export interface ZoneUpgrade {
  name?: string;
  abilities: ZoneAbility[];
  /** Gurtstufe 0 bis 4 (src/physics/belts.ts) */
  belt: BeltLevel;
  /** Kettenzugstärke: Höhe über der Station (Meter), bis zu der die Kette zieht; ohne Angabe unbegrenzt */
  chain?: number;
  /** Wagenvariante (Platzhalter: eine Farbe für die Klötzchen-Wagen) */
  car?: string;
  /** Hubhöhe des Aufzugs (Vertikallift, Meter über der Station); ohne Angabe LIFT_HEIGHT_DEFAULT */
  lift?: number;
}

/** was ein Feld an seiner Stufe ändert (Plan 3.1: der Editor schaltet je Level um), dazu seine Grenzen (Plan 2.1) */
export interface FieldAbilityOverrides {
  /** zusätzlich an */
  on?: ZoneAbility[];
  /** aus, auch wenn die Stufe sie hat */
  off?: ZoneAbility[];
  /** Gurtstufe statt der der Stufe */
  belt?: BeltLevel;
  /** Kettenzugstärke statt der der Stufe (Meter) */
  chain?: number;
  /** Streckenbudget (Meter), ohne Angabe keins */
  budget?: number;
  /** Höhenlimit (Meter), ohne Angabe keins */
  maxHeight?: number;
  /** Hubhöhe des Aufzugs statt der der Stufe (Meter) */
  lift?: number;
}

/** Hubhöhe des Aufzugs, wenn weder Stufe noch Feld eine nennen (Meter) */
export const LIFT_HEIGHT_DEFAULT = 20;

/**
 * Vorbelegung der Stufen (Platzhalter, bis das Leveldesign die Tabelle füllt): Stufe i hat den Gurt i, so bedeutet die
 * Aufwertungsstufe eines Felds aus Etappe 1 (damals die Gurtstufe) weiter dasselbe. Stufe 4 „Alles“ ist die Basiszone.
 */
export const DEFAULT_UPGRADES: readonly ZoneUpgrade[] = [
  { name: 'Anfang', abilities: ['chainlift'], belt: 0, chain: 16 },
  { name: 'Beckengurt', abilities: ['chainlift', 'booster', 'brake'], belt: 1, chain: 24 },
  { name: 'Bügel', abilities: ['chainlift', 'booster', 'brake', 'launch', 'splash', 'tunnel'], belt: 2, chain: 32 },
  { name: 'Schulterbügel', abilities: ['chainlift', 'booster', 'brake', 'launch', 'splash', 'tunnel', 'hydro', 'launchBlock', 'roll'], belt: 3, chain: 45 },
  { name: 'Alles', abilities: [...ZONE_ABILITIES], belt: 4 },
];

/** die Tabelle der Zone oder die Vorbelegung */
export function zoneUpgrades(zone: { upgrades?: ZoneUpgrade[] }): readonly ZoneUpgrade[] {
  return zone.upgrades?.length ? zone.upgrades : DEFAULT_UPGRADES;
}

/** was in einem Feld gilt */
export interface ResolvedAbilities {
  abilities: Set<ZoneAbility>;
  /** Gurtstufe; ohne Angabe die der Welt */
  belt?: BeltLevel;
  /** Kettenzugstärke (Meter über der Station); ohne Angabe unbegrenzt */
  chain?: number;
  car?: string;
  /** Streckenbudget (Meter), 0 = keins */
  budget: number;
  /** Höhenlimit (Meter), 0 = keins */
  maxHeight: number;
  /** Hubhöhe des Aufzugs (Meter über der Station) */
  lift: number;
  /** die gewählte Stufe der Tabelle, wenn das Feld eine nennt */
  stage?: ZoneUpgrade;
  stageIndex?: number;
}

/**
 * Schalter eines Felds: ohne Feld (ganze Zone) alles; mit Feld die gewählte Stufe (ohne Stufe alles), darüber die
 * Überschreibungen des Felds
 */
export function resolveAbilities(zone: { upgrades?: ZoneUpgrade[] }, field: (FieldAbilityOverrides & { upgrade?: number }) | null): ResolvedAbilities {
  if (!field) return { abilities: new Set(ZONE_ABILITIES), budget: 0, maxHeight: 0, lift: LIFT_HEIGHT_DEFAULT };
  const table = zoneUpgrades(zone);
  const stageIndex = field.upgrade === undefined ? undefined : Math.max(0, Math.min(table.length - 1, Math.floor(field.upgrade)));
  const stage = stageIndex === undefined ? undefined : table[stageIndex];
  const abilities = new Set<ZoneAbility>(stage ? stage.abilities : ZONE_ABILITIES);
  for (const a of field.on ?? []) abilities.add(a);
  for (const a of field.off ?? []) abilities.delete(a);
  const lift = field.lift ?? stage?.lift;
  const out: ResolvedAbilities = { abilities, budget: field.budget ?? 0, maxHeight: field.maxHeight ?? 0, lift: lift !== undefined && lift > 0 ? lift : LIFT_HEIGHT_DEFAULT };
  const belt = field.belt ?? stage?.belt;
  if (belt !== undefined) out.belt = belt;
  const chain = field.chain ?? stage?.chain;
  if (chain !== undefined && chain > 0) out.chain = chain;
  if (stage?.car) out.car = stage.car;
  if (stage) {
    out.stage = stage;
    out.stageIndex = stageIndex;
  }
  return out;
}

/** Freischaltungen der Zone: alles Freigespielte außer „Boden formen“ (Plan 7.5) und den Fähigkeiten, die das Feld aus hat */
export function zoneUnlocks(all: Iterable<ElementId>, res: ResolvedAbilities): Set<ElementId> {
  const out = new Set<ElementId>(all);
  out.delete('mountain');
  for (const a of ZONE_ABILITIES) if (!res.abilities.has(a)) out.delete(ABILITY_UNLOCK[a]);
  return out;
}

/** Startarten, die ein Feld erlaubt, in der Reihenfolge des Knopfs */
export function allowedStarts(res: ResolvedAbilities): ZoneAbility[] {
  return START_ABILITIES.filter((s) => res.abilities.has(s));
}

// ------------------------------------------------------------------ Schalterzeile (Editor)

const abilityOf = (word: string): ZoneAbility | null => {
  const w = word.toLowerCase();
  for (const a of ZONE_ABILITIES) if (a.toLowerCase() === w || ABILITY_WORDS[a].includes(w)) return a;
  return null;
};

type ParamKey = 'belt' | 'chain' | 'car' | 'budget' | 'maxHeight' | 'name' | 'lift';
const PARAM_WORDS: Record<string, ParamKey> = { gurt: 'belt', kette: 'chain', wagen: 'car', budget: 'budget', höhe: 'maxHeight', hoehe: 'maxHeight', name: 'name', hub: 'lift', aufzug: 'lift' };
const PARAM_WORD: Record<ParamKey, string> = { belt: 'gurt', chain: 'kette', car: 'wagen', budget: 'budget', maxHeight: 'höhe', name: 'name', lift: 'hub' };

interface Tokens {
  on: ZoneAbility[];
  off: ZoneAbility[];
  belt?: BeltLevel;
  /** 0 = frei (unbegrenzt) */
  chain?: number;
  car?: string;
  budget?: number;
  maxHeight?: number;
  lift?: number;
  name?: string;
  unknown: string[];
}

/** Wörter lesen: `+wort` an, `-wort` aus (ohne Zeichen an), `gurt 2`, `kette 30` oder `kette frei`, `wagen rot`, `budget 400`, `höhe 40`, `name Anfang` */
function tokenize(text: string): Tokens {
  const out: Tokens = { on: [], off: [], unknown: [] };
  const words = text.split(/[,;\s]+/).filter((w) => w.length);
  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const key = PARAM_WORDS[raw.toLowerCase()];
    if (key) {
      const next = words[i + 1];
      if (next === undefined) {
        out.unknown.push(raw);
        continue;
      }
      i++;
      if (key === 'car' || key === 'name') {
        out[key] = next.slice(0, key === 'car' ? 20 : 40);
        continue;
      }
      if (key === 'chain' && /^(frei|unbegrenzt|-)$/i.test(next)) {
        out.chain = 0;
        continue;
      }
      const n = Number(next.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) {
        out.unknown.push(`${raw} ${next}`);
        continue;
      }
      if (key === 'belt') out.belt = Math.min(4, Math.floor(n)) as BeltLevel;
      else out[key] = n;
      continue;
    }
    const sign = raw[0] === '-' || raw[0] === '−' ? -1 : 1;
    const a = abilityOf(raw.replace(/^[+\-−]/, ''));
    if (!a) {
      out.unknown.push(raw);
      continue;
    }
    if (sign < 0) {
      if (!out.off.includes(a)) out.off.push(a);
    } else if (!out.on.includes(a)) out.on.push(a);
  }
  return out;
}

/** Zeile einer Stufe lesen: genannte Schalter an, alle anderen aus; `kette frei` löscht die Grenze */
export function parseStageLine(text: string, base?: ZoneUpgrade): { upgrade: ZoneUpgrade; unknown: string[] } {
  const t = tokenize(text);
  const upgrade: ZoneUpgrade = { abilities: t.on.filter((a) => !t.off.includes(a)), belt: t.belt ?? base?.belt ?? 0 };
  const name = t.name ?? base?.name;
  if (name) upgrade.name = name;
  const chain = t.chain ?? base?.chain;
  if (chain !== undefined && chain > 0) upgrade.chain = chain;
  const car = t.car ?? base?.car;
  if (car) upgrade.car = car;
  const lift = t.lift ?? base?.lift;
  if (lift !== undefined && lift > 0) upgrade.lift = lift;
  return { upgrade, unknown: t.unknown };
}

/** Zeile einer Stufe schreiben (Umkehrung von parseStageLine) */
export function formatStageLine(u: ZoneUpgrade): string {
  const parts = [u.abilities.map((a) => ABILITY_WORDS[a][0]).join(' ') || '(keine Schalter)', `gurt ${u.belt}`, `kette ${u.chain !== undefined && u.chain > 0 ? u.chain : 'frei'}`];
  if (u.car) parts.push(`wagen ${u.car}`);
  if (u.lift !== undefined && u.lift > 0) parts.push(`hub ${u.lift}`);
  // der Name ist ein Wort (Platzhalter-Namen; mit Leerzeichen bliebe er beim Lesen zurück)
  if (u.name && !/\s/.test(u.name)) parts.push(`name ${u.name}`);
  return parts.join(', ');
}

/** Zeile eines Felds lesen: `+wort` an, `-wort` aus, dazu Gurt, Kette, Budget und Höhe als Überschreibungen (0 löscht) */
export function parseFieldLine(text: string): { overrides: FieldAbilityOverrides; unknown: string[] } {
  const t = tokenize(text);
  const o: FieldAbilityOverrides = {};
  if (t.on.length) o.on = t.on;
  if (t.off.length) o.off = t.off.filter((a) => !t.on.includes(a));
  if (o.off && !o.off.length) delete o.off;
  if (t.belt !== undefined) o.belt = t.belt;
  if (t.chain !== undefined && t.chain > 0) o.chain = t.chain;
  if (t.budget !== undefined && t.budget > 0) o.budget = t.budget;
  if (t.maxHeight !== undefined && t.maxHeight > 0) o.maxHeight = t.maxHeight;
  if (t.lift !== undefined && t.lift > 0) o.lift = t.lift;
  return { overrides: o, unknown: t.unknown };
}

/** Zeile eines Felds schreiben (Umkehrung von parseFieldLine) */
export function formatFieldLine(o: FieldAbilityOverrides): string {
  const parts: string[] = [];
  for (const a of o.on ?? []) parts.push(`+${ABILITY_WORDS[a][0]}`);
  for (const a of o.off ?? []) parts.push(`-${ABILITY_WORDS[a][0]}`);
  if (o.belt !== undefined) parts.push(`${PARAM_WORD.belt} ${o.belt}`);
  if (o.chain !== undefined) parts.push(`${PARAM_WORD.chain} ${o.chain}`);
  if (o.budget !== undefined) parts.push(`${PARAM_WORD.budget} ${o.budget}`);
  if (o.maxHeight !== undefined) parts.push(`${PARAM_WORD.maxHeight} ${o.maxHeight}`);
  if (o.lift !== undefined) parts.push(`${PARAM_WORD.lift} ${o.lift}`);
  return parts.join(', ');
}

/** Satz von Schaltern lesbar: „kettenzug launch booster“ */
export function describeAbilities(abilities: Iterable<ZoneAbility>): string {
  const words = ZONE_ABILITIES.filter((a) => new Set(abilities).has(a)).map((a) => ABILITY_WORDS[a][0]);
  return words.length ? words.join(' ') : 'keine';
}
