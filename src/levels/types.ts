/**
 * Datentypen für Level, Welten, Ziele und Freischaltungen.
 * Diese Datei ist die gemeinsame Quelle für Spiel UND GDD (Level-Tabelle wird daraus generiert).
 */

/** Zieltypen, die der Prototyp auswerten kann. */
export type GoalType =
  | 'finish' // Zug kommt wieder in der Station an, niemand fällt raus
  | 'height' // maximale Höhe der Bahn in Metern
  | 'coins' // Anzahl eingesammelter Coins (alle oder mindestens n)
  | 'loops' // Anzahl Loopings (Selbstkreuzung)
  | 'turns' // Anzahl Kurven (Spurwechsel)
  | 'tunnels' // Anzahl Tunnel-Durchfahrten
  | 'launch' // Launch-Start verwendet
  | 'chainlift' // Kettenzug verwendet
  | 'boosters' // Anzahl Booster auf der Strecke
  | 'airtime' // Sekunden mit negativen g (Airtime) insgesamt
  | 'speed' // Höchstgeschwindigkeit in km/h
  | 'length' // Streckenlänge in Metern (mindestens)
  | 'maxLength' // Streckenlänge in Metern (höchstens) = Material sparen
  | 'time' // Fahrzeit in Sekunden (mindestens)
  | 'maxTime' // Fahrzeit in Sekunden (höchstens)
  | 'rolls' // Anzahl Schleifen (Heartline-Rolle über Roll-Handle)
  | 'maxG' // Höchstens x g (Komfortziel)
  | 'minG' // Mindestens x g irgendwo (Intensitätsziel)
  | 'splash' // Wasserdurchfahrt (Splashdown)
  | 'lanes' // Anzahl verschiedener Spuren, die befahren werden
  | 'noBrakes' // keine Bremse eingesetzt
  | 'drop' // Höhe des größten Drops in Metern
  | 'element'; // ein bestimmtes Element (Vorlage/Sonderteil) mindestens n-mal eingebaut

export interface Goal {
  type: GoalType;
  /** Zielwert; bei Booleschen Zielen (launch, chainlift, noBrakes) ignoriert */
  value?: number;
  /** Nur bei type 'element': welches Element */
  element?: ElementId;
  /** Optional: Bonusziel (zählt für den 2./3. Stern statt Pflicht) */
  bonus?: boolean;
}

/** Physik-Abweichungen einer Welt/eines Levels (1 = Standard). */
export interface PhysicsTweaks {
  /** Reibungsfaktor (Eis: 0.4) */
  friction?: number;
  /** Schwerkraftfaktor (Weltraum: 0.6) */
  gravity?: number;
}

/** Elemente, die freigespielt werden und im Element-Regal erscheinen. */
export type ElementId =
  | 'draw' // Grundzeichnen (immer da)
  | 'handles' // Bezier-Handles
  | 'chainlift'
  | 'turn' // Spurwechsel-Kurve
  | 'loop'
  | 'coins'
  | 'tunnel' // Tunnelbauer
  | 'launch'
  | 'booster'
  | 'brake'
  | 'roll' // Roll-Handle (Schleife)
  | 'mountain' // Bergbauer (Terrain anheben)
  | 'lake' // See/Fluss
  | 'waterfall'
  | 'splash' // Splashdown-Element
  | 'hydroLaunch'
  | 'doubleLaunch'
  | 'verticalLift'
  | 'dropTrack'
  | 'switchTrack'
  | 'helix' // Mehrfach-Spurwechsel-Spirale (Helix-Vorlage)
  | 'corkscrew' // Korkenzieher-Vorlage (Loop + Roll)
  | 'cobraRoll'
  | 'immelmann'
  | 'topHat'
  | 'reverse' // Rückwärtsfahrt-Weiche
  | 'swingLaunch'
  | 'tilt'
  | 'bridge' // Holzbrücke über Wasser
  | 'house'
  | 'castle'
  | 'spaceBuilding'
  | 'ghostHouse'
  | 'mineProps'
  | 'iceProps'
  | 'volcanoProps'
  | 'cityProps'
  | 'skinWood'
  | 'skinSteel'
  | 'skinMine'
  | 'skinHybrid'
  | 'skinSpace'
  | 'skinGhost'
  | 'skinIce'
  | 'skinLava'
  | 'skinNeon'
  | 'skinGold'
  | 'secondTrain'
  | 'longTrain'
  | 'nightMode'
  | 'fireworks';

/** Terrain-Bausteine, die ein Level vorgibt (werden prozedural gezeichnet). */
export type TerrainFeature =
  | { kind: 'flat' }
  | { kind: 'hill'; x: number; width: number; height: number; lane?: number }
  | { kind: 'valley'; x: number; width: number; depth: number; lane?: number }
  | { kind: 'mountain'; x: number; width: number; height: number; lane?: number } // tunnelfähig
  | { kind: 'lake'; x: number; width: number; lane?: number }
  | { kind: 'river'; x: number; width: number }
  | { kind: 'waterfall'; x: number; height: number; lane?: number }
  | { kind: 'cliff'; x: number; height: number }
  | { kind: 'prop'; x: number; id: ElementId | string; lane?: number };

export interface CoinSpec {
  x: number;
  y: number; // Höhe über Boden in Metern
  lane?: number; // Spur (-2..2), Standard 0
}

export interface LevelDef {
  id: number; // 1..150
  world: number; // 1..10
  name: string;
  /** Kurze Beschreibung/Story-Hook (ein Satz) */
  hook: string;
  /** Pflichtziele (alle nötig für den 1. Stern) + Bonusziele (2./3. Stern) */
  goals: Goal[];
  /** Was dieses Level neu freischaltet (nach Abschluss) */
  unlocks?: ElementId[];
  /** Spielfeldbreite in Metern (Zeichenbereich) */
  width: number;
  /** Höhenlimit in Metern (0 = kein Limit) */
  maxHeight?: number;
  /** Terrain-Bausteine */
  terrain: TerrainFeature[];
  coins?: CoinSpec[];
  /** Erlaubte Start-Typen (Standard: alles Freigeschaltete) */
  startTypes?: Array<'gravity' | 'chainlift' | 'launch' | 'hydro'>;
  /** Anzahl Fahrgäste (2 pro Wagen) */
  passengers?: number;
  /** Zugwagen */
  cars?: number;
  /** Zeichenbudget: maximale Schienenlänge in Metern (0 = unbegrenzt) */
  trackBudget?: number;
  /** Physik-Abweichungen (Eis, Weltraum) */
  physics?: PhysicsTweaks;
}

/**
 * Farb-Tokens einer Welt (Stil-Bibel: docs/ART.md). Flächen bekommen drei harte Töne (hell, mittel, dunkel)
 * aus `ground`, die Luftperspektive stuft nach hinten in Richtung `sky[1]`, Leuchten nur auf Interaktivem.
 */
export interface WorldPalette {
  /** Himmel von oben nach unten: Zenit, Mitte, Horizont */
  sky: [string, string, string];
  /** Boden: Licht- und Schattenton (vorne satt, hinten entsättigt) */
  ground: [string, string];
  /** Akzent der Welt (Chips, Ziele, Sticker, Leuchtkanten) */
  accent: string;
  /** Kontur-Tinte: dunkler Ton der Welt, nie reines Schwarz, außer bei Earle-Stämmen */
  ink: string;
  /** Leuchtfarbe (Coins, Schienenkante bei Nacht, Laternen) */
  glow: string;
  /** Punktraster (Stippling) auf Schattenflächen */
  stipple: string;
}

export interface WorldDef {
  id: number;
  name: string;
  theme: string;
  /** Beschreibung der Optik und Stimmung */
  look: string;
  /** Standard-Schienenstil dieser Welt */
  skin: ElementId;
  /** Himmel-Palette (hand-painted Gradient); identisch mit palette.sky, bleibt für bestehende Aufrufer */
  sky: [string, string, string];
  /** Bodenfarben pro Spur (vorne → hinten); identisch mit palette.ground */
  ground: [string, string];
  /** Alle Farb-Tokens der Welt */
  palette: WorldPalette;
  levels: number[]; // Level-IDs
}
