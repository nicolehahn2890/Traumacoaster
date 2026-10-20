import type { ElementId, Goal, GoalType } from './types';

/** Deutsche Namen der Elemente (für Regal, Freischalt-Screen und GDD). */
export const ELEMENT_NAMES: Record<ElementId, string> = {
  draw: 'Zeichnen',
  handles: 'Bezier-Handles',
  chainlift: 'Kettenzug',
  turn: 'Kurve (Spurwechsel)',
  loop: 'Looping',
  coins: 'Coins',
  tunnel: 'Tunnelbauer',
  launch: 'Launch-Start',
  booster: 'Booster',
  brake: 'Bremse',
  roll: 'Schleife (Roll-Handle)',
  mountain: 'Bergbauer',
  lake: 'See',
  waterfall: 'Wasserfall',
  splash: 'Splashdown',
  hydroLaunch: 'Hydro-Launch',
  doubleLaunch: 'Doppel-Launch',
  verticalLift: 'Vertikallift',
  dropTrack: 'Fallschacht',
  switchTrack: 'Weiche',
  helix: 'Helix-Vorlage',
  corkscrew: 'Korkenzieher-Vorlage',
  cobraRoll: 'Cobra-Roll-Vorlage',
  immelmann: 'Immelmann-Vorlage',
  topHat: 'Top-Hat-Vorlage',
  reverse: 'Rückwärts-Weiche',
  swingLaunch: 'Pendel-Launch',
  tilt: 'Kippschiene',
  bridge: 'Holzbrücke',
  house: 'Häuser',
  castle: 'Schloss',
  spaceBuilding: 'Raumstation',
  ghostHouse: 'Geisterhaus',
  mineProps: 'Minen-Deko',
  iceProps: 'Eis-Deko',
  volcanoProps: 'Vulkan-Deko',
  cityProps: 'Stadt-Deko',
  skinWood: 'Holzbahn',
  skinSteel: 'Stahlbahn',
  skinMine: 'Minenzug',
  skinHybrid: 'Hybridbahn',
  skinSpace: 'Space-Bahn',
  skinGhost: 'Geisterbahn',
  skinIce: 'Eisbahn',
  skinLava: 'Lavabahn',
  skinNeon: 'Neonbahn',
  skinGold: 'Goldbahn',
  secondTrain: 'Zweiter Zug',
  longTrain: 'Langer Zug',
  nightMode: 'Nachtmodus',
  fireworks: 'Feuerwerk',
};

const UNIT: Partial<Record<GoalType, string>> = {
  height: 'm', drop: 'm', length: 'm', maxLength: 'm', speed: 'km/h', airtime: 's', time: 's', maxTime: 's', maxG: 'g', minG: 'g',
};

/** Kurzer deutscher Text für ein Ziel, z. B. „Höhe ≥ 15 m“. */
export function goalLabel(goal: Goal): string {
  const v = goal.value ?? 0;
  const u = UNIT[goal.type] ? ` ${UNIT[goal.type]}` : '';
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : `${n}`.replace('.', ','));
  switch (goal.type) {
    case 'finish': return 'Zug kommt heil an';
    case 'height': return `Höhe ≥ ${fmt(v)}${u}`;
    case 'coins': return `${fmt(v)} Coins`;
    case 'loops': return `${fmt(v)} Looping${v === 1 ? '' : 's'}`;
    case 'turns': return `${fmt(v)} Kurve${v === 1 ? '' : 'n'}`;
    case 'tunnels': return `${fmt(v)} Tunnel`;
    case 'launch': return 'Launch-Start';
    case 'chainlift': return 'Kettenzug';
    case 'boosters': return `${fmt(v)} Booster`;
    case 'airtime': return `Airtime ≥ ${fmt(v)}${u}`;
    case 'speed': return `Tempo ≥ ${fmt(v)}${u}`;
    case 'length': return `Strecke ≥ ${fmt(v)}${u}`;
    case 'maxLength': return `Strecke ≤ ${fmt(v)}${u}`;
    case 'time': return `Fahrzeit ≥ ${fmt(v)}${u}`;
    case 'maxTime': return `Fahrzeit ≤ ${fmt(v)}${u}`;
    case 'rolls': return `${fmt(v)} Schleife${v === 1 ? '' : 'n'}`;
    case 'maxG': return `max. ${fmt(v)}${u}`;
    case 'minG': return `min. ${fmt(v)}${u}`;
    case 'splash': return `${fmt(v)} Splash${v === 1 ? '' : 'es'}`;
    case 'lanes': return `${fmt(v)} Spuren`;
    case 'noBrakes': return 'Ohne Bremse';
    case 'drop': return `Drop ≥ ${fmt(v)}${u}`;
    case 'element': return `${ELEMENT_NAMES[goal.element!]}${v > 1 ? ` ×${v}` : ''}`;
  }
}
