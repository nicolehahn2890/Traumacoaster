import type { WorldDef } from './types';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Die 10 Welten von Trauma Coaster. Jede Welt hat 15 Level, einen eigenen Look,
 * einen Standard-Schienenstil und eine Himmel-/Bodenpalette (handgemalte Verläufe).
 */
export const WORLDS: WorldDef[] = [
  {
    id: 1,
    name: 'Wiesenland',
    theme: 'Sommerwiese, Holzachterbahn, Lehrgang',
    look: 'Saftig grüne Hügel, Gänseblümchen, pastellblauer Himmel mit dicken gemalten Wolken. Holzschienen mit hellen Streben. Alles weich, rund und freundlich.',
    skin: 'skinWood',
    sky: ['#8fd3ff', '#cdefff', '#fff3c4'],
    ground: ['#7cc242', '#4f9a2e'],
    levels: range(1, 15),
  },
  {
    id: 2,
    name: 'Jahrmarkt',
    theme: 'Kirmes bei Sonnenuntergang, Launch-Start, Lichter',
    look: 'Orange-pinker Abendhimmel, Riesenrad und Buden als Silhouetten, Lichterketten, Zuckerwatte-Wolken. Hybrid-Schienen (Holzgerüst, Stahlschiene) mit bunten Glühbirnen.',
    skin: 'skinHybrid',
    sky: ['#5b2a86', '#ff7eb3', '#ffb17a'],
    ground: ['#c9a36b', '#8d6b3f'],
    levels: range(16, 30),
  },
  {
    id: 3,
    name: 'Minenberg',
    theme: 'Goldmine, Berge, Tunnel, Minenzug',
    look: 'Rostbraune Felsen mit goldenen Adern, Holzstützen in Stollen, Laternen, Staub im Gegenlicht. Minenzug-Schienen auf niedrigen Holzböcken.',
    skin: 'skinMine',
    sky: ['#5c6b8a', '#9aa9c4', '#e8d9b5'],
    ground: ['#a0765a', '#6b4a35'],
    levels: range(31, 45),
  },
  {
    id: 4,
    name: 'Seenland',
    theme: 'Seen, Flüsse, Wasserfälle, Brücken, Splashdown',
    look: 'Türkisblaues Wasser mit gemalten Lichtreflexen, Schilf, Holzstege, Gischt. Erste Stahlschienen in Weiß und Türkis auf schlanken Stützen.',
    skin: 'skinSteel',
    sky: ['#5fb6ff', '#a9e2ff', '#ffffff'],
    ground: ['#5fb86e', '#2f7a4a'],
    levels: range(46, 60),
  },
  {
    id: 5,
    name: 'Schlossreich',
    theme: 'Märchenschloss, Türme, Top Hat, Immelmann',
    look: 'Lila-rosa Himmel, Schloss mit Spitztürmen und Fahnen, Rosenhecken, Goldglitzer. Goldene Stahlschienen mit Ornament-Stützen.',
    skin: 'skinGold',
    sky: ['#a98bff', '#ffc9e6', '#fff1b8'],
    ground: ['#79b85a', '#4a7a3a'],
    levels: range(61, 75),
  },
  {
    id: 6,
    name: 'Großstadt',
    theme: 'Neon-Metropole bei Nacht, Mehrfach-Launch, Helix',
    look: 'Dunkelblauer Nachthimmel, Hochhaus-Silhouetten mit leuchtenden Fenstern, Neon-Reklamen in Pink und Cyan, nasse Straßen mit Spiegelungen. Neon-Stahlschienen.',
    skin: 'skinNeon',
    sky: ['#1a1f4b', '#3a2d7a', '#ff6fae'],
    ground: ['#55596b', '#33364a'],
    levels: range(76, 90),
  },
  {
    id: 7,
    name: 'Eisgipfel',
    theme: 'Gletscher, wenig Reibung, Korkenzieher, Cobra Roll',
    look: 'Hellblaues Eis mit rosa Morgenlicht, Schneeverwehungen, Eiszapfen, Polarlichter. Eis-Schienen mit Frost-Textur, Stützen aus Eiskristallen.',
    skin: 'skinIce',
    sky: ['#bfe6ff', '#e9f7ff', '#ffd9ec'],
    ground: ['#dff3ff', '#9fc9e6'],
    levels: range(91, 105),
  },
  {
    id: 8,
    name: 'Geisterhaus',
    theme: 'Spukvilla, Dark Ride, Drop Track, Rückwärtsfahrt',
    look: 'Tiefviolette Nacht, Nebel, schiefe Villa mit leuchtenden Fenstern, Fledermäuse, Kürbisse, Grabsteine. Rostige Schienen mit Spinnweben, Laternen als Lichtquellen.',
    skin: 'skinGhost',
    sky: ['#0d0b1f', '#2b1b4a', '#6b3fa0'],
    ground: ['#3a3350', '#221c33'],
    levels: range(106, 120),
  },
  {
    id: 9,
    name: 'Vulkaninsel',
    theme: 'Lava, Hydro-Launch, hohe g-Kräfte, Zeitdruck',
    look: 'Glühend roter Himmel, schwarzes Gestein mit Lavaadern, Aschewolken, Funken. Lava-Schienen mit glühenden Streben.',
    skin: 'skinLava',
    sky: ['#3a0d0d', '#b3321f', '#ffb13b'],
    ground: ['#4a2b22', '#2a1612'],
    levels: range(121, 135),
  },
  {
    id: 10,
    name: 'Weltraum',
    theme: 'Raumstation, geringe Schwerkraft, Pendel-Launch, Finale',
    look: 'Tiefes Violett mit Sternen, Planeten und Nebeln, Raumstation-Module, schwebende Asteroiden. Weiß-blaue Space-Schienen mit leuchtenden Magnetstreben.',
    skin: 'skinSpace',
    sky: ['#05010f', '#1b0f3a', '#3d1b6b'],
    ground: ['#7d6fa8', '#4a3d6b'],
    levels: range(136, 150),
  },
];

export function worldOfLevel(levelId: number): WorldDef {
  return WORLDS[Math.min(WORLDS.length - 1, Math.floor((levelId - 1) / 15))];
}
