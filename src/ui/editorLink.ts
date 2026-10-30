/**
 * Weg in den Zonen-Editor von überall im Spiel (Florian, 30.10.2026: „Der Editor ist dann die einzige Stelle zum Testen
 * und er muss immer und überall im Game erreichbar sein für mich, mit einem Button aus den Levels und der Map“).
 *
 * Der Editor braucht den Weltrenderer, den das Spiel nur beim Laden mit ?zone= anlegt; deshalb lädt der Weg die Seite
 * neu. Er öffnet die Zone des Levels, sonst die zuletzt bearbeitete Zone, und nimmt die Schalter des Testmenüs aus der
 * letzten Editor-Sitzung mit (src/ui/testMenu.ts).
 */
const ZONE_KEY = 'tc.editor.zone';
const SWITCH_KEY = 'tc.editor.schalter';
/** ohne gemerkte Zone: Szene 06 (Tor S4), die dichte Zone, in der der Strich später neu angegangen wird */
const DEFAULT_ZONE = 'szene-06';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* privater Modus: dann eben ohne Merken */
  }
}

/** der Editor ist offen: Zone und Schalter (Adressteil ohne „?“) für den nächsten Weg hierher merken */
export function rememberEditor(zone: string, switches: string): void {
  write(ZONE_KEY, zone);
  write(SWITCH_KEY, switches);
}

/** Adresse des Zonen-Editors: diese Zone (Level einer Zone), sonst die zuletzt bearbeitete */
export function editorUrl(zone?: string): string {
  const q = new URLSearchParams(read(SWITCH_KEY) ?? '');
  q.set('zone', zone ?? read(ZONE_KEY) ?? DEFAULT_ZONE);
  q.set('editor', '2');
  return `${location.pathname}?${q.toString()}`;
}

export function openEditor(zone?: string): void {
  location.assign(editorUrl(zone));
}

/** vom Editor zurück zur Karte (ohne Weltrenderer, ohne Intro) */
export function openMap(): void {
  location.assign(`${location.pathname}?scene=start`);
}
