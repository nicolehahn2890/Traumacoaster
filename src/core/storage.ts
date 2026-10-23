/**
 * Lokaler Spielstand (localStorage). Alle Zugriffe sind abgesichert, damit das Spiel auch
 * in privaten Fenstern ohne Speicher läuft.
 */
import type { CharacterDef } from '@/editor/characters';
import { DEFAULT_CHARACTERS } from '@/editor/characters';
import type { TrackPath } from '@/track/model';

export interface Progress {
  /** Sterne pro Level-ID */
  stars: Record<number, number>;
  /** höchstes abgeschlossenes Level */
  highest: number;
  /** zuletzt geöffnetes Level */
  current: number;
  /** gespeicherte Bahn pro Level (zum Weiterbauen) */
  drafts: Record<number, TrackPath>;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  language: 'de' | 'en';
  shakeUndo: boolean;
  seenSplash: boolean;
  /** Zeitraffer der Fahrt (1, 2, 3 oder 5) */
  rideSpeed: number;
  /** Dev-Modus: alles frei (siehe core/dev.ts) */
  devMode: boolean;
  /** im Dev-Modus gewählter Bahntyp ('' = der Welt) */
  devSkin: string;
  /** Grafikeffekte (Shader): auto = nach Gerät, high = an, low = aus */
  fx: 'auto' | 'high' | 'low';
  /** Lesart des Strichs: 'stage' (Boden = Tiefe, steil = Höhe) oder 'single' (alles Höhe, nur Wenden wechseln die Ebene) */
  strokeMode?: 'stage' | 'single';
}

export interface SavedTrack {
  id: string;
  name: string;
  world: number;
  created: number;
  path: TrackPath;
  width: number;
}

const KEY = 'traumacoaster.v1';

interface Store {
  progress: Progress;
  settings: Settings;
  tracks: SavedTrack[];
  characters: CharacterDef[];
  riders: string[]; // IDs der Figuren, die mitfahren
}

function defaults(): Store {
  return {
    progress: { stars: {}, highest: 0, current: 1, drafts: {} },
    settings: { sound: true, music: true, language: 'de', shakeUndo: true, seenSplash: false, rideSpeed: 3, devMode: false, devSkin: '', fx: 'auto', strokeMode: 'stage' },
    tracks: [],
    characters: DEFAULT_CHARACTERS.map((c) => ({ ...c })),
    riders: DEFAULT_CHARACTERS.map((c) => c.id),
  };
}

let cache: Store | null = null;

/**
 * JSON kennt kein NaN: Die automatische Schräglage (roll = NaN) käme nach dem Neuladen als null zurück und würde
 * als manuelle Schräglage 0 gelesen, die Bahn läge dann überall flach. Beim Laden wieder auf NaN setzen.
 */
function restoreAutoRoll(path: TrackPath | undefined): void {
  for (const n of path?.nodes ?? []) if (typeof n.roll !== 'number') n.roll = NaN;
}

function load(): Store {
  if (cache) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      cache = { ...defaults(), ...parsed, progress: { ...defaults().progress, ...(parsed.progress ?? {}) }, settings: { ...defaults().settings, ...(parsed.settings ?? {}) } };
      for (const d of Object.values(cache.progress.drafts)) restoreAutoRoll(d);
      for (const t of cache.tracks) restoreAutoRoll(t.path);
      return cache;
    }
  } catch {
    /* kein Speicher verfügbar */
  }
  cache = defaults();
  return cache;
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(cache ?? defaults()));
  } catch {
    /* ignorieren */
  }
}

export const storage = {
  get progress(): Progress {
    return load().progress;
  },
  get settings(): Settings {
    return load().settings;
  },
  get tracks(): SavedTrack[] {
    return load().tracks;
  },
  get characters(): CharacterDef[] {
    return load().characters;
  },
  get riders(): string[] {
    return load().riders;
  },
  setStars(level: number, stars: number): void {
    const p = load().progress;
    p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
    if (stars > 0) p.highest = Math.max(p.highest, level);
    save();
  },
  setCurrent(level: number): void {
    load().progress.current = level;
    save();
  },
  saveDraft(level: number, path: TrackPath): void {
    load().progress.drafts[level] = path;
    save();
  },
  draft(level: number): TrackPath | undefined {
    return load().progress.drafts[level];
  },
  updateSettings(patch: Partial<Settings>): void {
    Object.assign(load().settings, patch);
    save();
  },
  saveTrack(track: SavedTrack): void {
    const list = load().tracks;
    const i = list.findIndex((t) => t.id === track.id);
    if (i >= 0) list[i] = track;
    else list.unshift(track);
    while (list.length > 50) list.pop();
    save();
  },
  deleteTrack(id: string): void {
    const s = load();
    s.tracks = s.tracks.filter((t) => t.id !== id);
    save();
  },
  saveCharacter(c: CharacterDef): void {
    const list = load().characters;
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c;
    else list.push(c);
    while (list.length > 16) list.shift();
    save();
  },
  deleteCharacter(id: string): void {
    const s = load();
    s.characters = s.characters.filter((c) => c.id !== id);
    s.riders = s.riders.filter((r) => r !== id);
    save();
  },
  setRiders(ids: string[]): void {
    load().riders = ids;
    save();
  },
  /** Figuren in Fahrreihenfolge (wiederholt, falls weniger Figuren als Sitze) */
  ridersFor(count: number): CharacterDef[] {
    const s = load();
    const chars = s.riders.map((id) => s.characters.find((c) => c.id === id)).filter((c): c is CharacterDef => !!c);
    const pool = chars.length ? chars : DEFAULT_CHARACTERS;
    return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
  },
  reset(): void {
    cache = defaults();
    save();
  },
};
