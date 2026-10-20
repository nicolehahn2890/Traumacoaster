import type { CoinSpec, ElementId, Goal, GoalType, LevelDef, TerrainFeature } from './types';

/* ----------------------------------------------------------------------------
 * Hilfsfunktionen, damit die 150 Level kompakt und lesbar bleiben.
 * ------------------------------------------------------------------------- */

const g = (type: GoalType, value?: number): Goal => ({ type, value });
const bonus = (type: GoalType, value?: number): Goal => ({ type, value, bonus: true });
const el = (element: ElementId, value = 1, isBonus = false): Goal => ({ type: 'element', element, value, bonus: isBonus || undefined });

/** Coins in einer Reihe */
const row = (x0: number, x1: number, y: number, n: number, lane = 0): CoinSpec[] =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y, lane }));
/** Coins als Bogen (Hügelform) */
const arc = (cx: number, baseY: number, r: number, n: number, lane = 0): CoinSpec[] =>
  Array.from({ length: n }, (_, i) => {
    const t = Math.PI - (Math.PI * i) / Math.max(1, n - 1);
    return { x: cx + Math.cos(t) * r, y: baseY + Math.sin(t) * r * 0.6, lane };
  });
/** Coins als Ring (für Loopings) */
const ring = (cx: number, cy: number, r: number, n: number, lane = 0): CoinSpec[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * 2 * i) / n;
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, lane };
  });
/** Coins senkrecht übereinander */
const col = (x: number, y0: number, y1: number, n: number, lane = 0): CoinSpec[] =>
  Array.from({ length: n }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / Math.max(1, n - 1), lane }));

const flat: TerrainFeature[] = [{ kind: 'flat' }];
const hill = (x: number, width: number, height: number, lane?: number): TerrainFeature => ({ kind: 'hill', x, width, height, lane });
const valley = (x: number, width: number, depth: number, lane?: number): TerrainFeature => ({ kind: 'valley', x, width, depth, lane });
const mountain = (x: number, width: number, height: number, lane?: number): TerrainFeature => ({ kind: 'mountain', x, width, height, lane });
const lake = (x: number, width: number, lane?: number): TerrainFeature => ({ kind: 'lake', x, width, lane });
const river = (x: number, width: number): TerrainFeature => ({ kind: 'river', x, width });
const waterfall = (x: number, height: number, lane?: number): TerrainFeature => ({ kind: 'waterfall', x, height, lane });
const cliff = (x: number, height: number): TerrainFeature => ({ kind: 'cliff', x, height });
const prop = (x: number, id: ElementId | string, lane?: number): TerrainFeature => ({ kind: 'prop', x, id, lane });

interface LevelInput extends Omit<LevelDef, 'id' | 'world' | 'terrain' | 'width'> {
  terrain?: TerrainFeature[];
  width?: number;
}

let nextId = 1;
const L = (name: string, hook: string, input: LevelInput): LevelDef => {
  const id = nextId++;
  return {
    id,
    world: Math.floor((id - 1) / 15) + 1,
    name,
    hook,
    width: input.width ?? 80,
    terrain: input.terrain ?? flat,
    ...input,
  };
};

/* ----------------------------------------------------------------------------
 * Welt 1 – Wiesenland (Level 1–15): Grundlagen, Holzachterbahn
 * Freischaltungen: Handles, Coins, Kurve, Looping, Bremse, Häuser
 * ------------------------------------------------------------------------- */
const W1: LevelDef[] = [
  L('Erster Hügel', 'Zeichne einen Hügel. Der Zug fährt los, sobald du auf Play drückst.', {
    goals: [g('height', 10)], unlocks: ['handles'], width: 60, passengers: 2, cars: 1,
  }),
  L('Feinschliff', 'Tippe die Bahn an und zieh an den Handles, bis der Hügel 12 Meter hoch ist.', {
    goals: [g('height', 12), bonus('maxLength', 90)], unlocks: ['coins'], width: 60, passengers: 2, cars: 1,
  }),
  L('Goldregen', 'Coins liegen in der Luft. Führe die Bahn hindurch.', {
    goals: [g('coins', 5), bonus('coins', 6)], width: 70, coins: arc(35, 4, 14, 6),
  }),
  L('Hoch hinaus', 'Höher bauen heißt schneller fahren. Sammle dabei die Coins.', {
    goals: [g('height', 18), g('coins', 4)], unlocks: ['turn'], width: 70, terrain: [hill(50, 20, 4)], coins: col(20, 6, 16, 4),
  }),
  L('Die erste Kurve', 'Dreh den Strich um, ohne ihn zu kreuzen: Die Bahn wechselt in die hintere Spur.', {
    goals: [g('turns', 1), g('height', 12), bonus('coins', 5)], width: 70, coins: row(20, 50, 5, 5, 1),
  }),
  L('Hin und zurück', 'Zwei Kurven bringen dich wieder nach vorne. Die Coins liegen auf drei Spuren.', {
    goals: [g('turns', 2), g('coins', 6)], width: 80, coins: [...row(15, 40, 6, 3, 0), ...row(15, 40, 6, 3, 1)],
  }),
  L('Tal der Wiesen', 'Ein Tal in der Mitte: Nutze es für einen großen Drop.', {
    goals: [g('height', 20), g('drop', 15)], unlocks: ['loop'], width: 90, terrain: [valley(45, 30, 8)], coins: arc(45, 2, 10, 5),
  }),
  L('Looping!', 'Kreuze deinen Strich: Daraus wird ein Looping. Genug Tempo mitnehmen!', {
    goals: [g('loops', 1), g('height', 15), bonus('speed', 50)], width: 90, coins: ring(55, 9, 5, 6),
  }),
  L('Doppelt hält besser', 'Zwei Loopings hintereinander. Der zweite braucht noch Schwung.', {
    goals: [g('loops', 2), g('coins', 6)], width: 100, coins: [...ring(45, 9, 5, 4), ...ring(70, 8, 4, 4)],
  }),
  L('Kurvenkönig', 'Drei Kurven, drei Spuren. Die Bühne gehört dir.', {
    goals: [g('turns', 3), g('lanes', 3)], unlocks: ['brake'], width: 90, coins: [...row(20, 60, 5, 4, 0), ...row(20, 60, 5, 4, 2)],
  }),
  L('Sanfte Landung', 'Komfort zählt: Höchstens 3,5 g. Die Bremse hilft, aber ohne gibt es den Bonus.', {
    goals: [g('height', 20), g('maxG', 3.5), bonus('noBrakes')], width: 90,
  }),
  L('Airtime-Hügel', 'Kleine, schnelle Hügel heben die Fahrgäste aus dem Sitz. Aber nicht zu sehr!', {
    goals: [g('airtime', 1), g('height', 18)], width: 100, terrain: [hill(35, 16, 3), hill(65, 16, 3)], coins: [...arc(35, 5, 8, 4), ...arc(65, 5, 8, 4)],
  }),
  L('Tempo', 'Sechzig Stundenkilometer. Höhe ist Geschwindigkeit.', {
    goals: [g('speed', 60), g('height', 25)], width: 100, coins: col(60, 3, 20, 5),
  }),
  L('Wiesen-Tour', 'Eine lange Runde über die ganze Wiese mit Coins auf dem Weg.', {
    goals: [g('length', 150), g('coins', 8), g('turns', 2)], unlocks: ['house'], width: 110, coins: [...row(10, 100, 7, 5, 0), ...row(20, 90, 7, 4, 1)],
  }),
  L('Großes Wiesenfest', 'Finale: Alles, was du gelernt hast, in einer Bahn. Die Dorfbewohner schauen zu.', {
    goals: [g('height', 25), g('loops', 1), g('turns', 2), g('coins', 10), bonus('airtime', 1.5)],
    width: 120, terrain: [prop(15, 'house', 1), prop(100, 'house', 1), hill(60, 24, 4)],
    coins: [...arc(30, 6, 12, 5), ...ring(80, 10, 5, 5)], passengers: 6, cars: 3,
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 2 – Jahrmarkt (16–30): Launch-Start, Booster, Nachtfahrt, Hybrid-Schienen
 * ------------------------------------------------------------------------- */
const W2: LevelDef[] = [
  L('Lichter an', 'Willkommen auf dem Jahrmarkt. Die Lichterketten sind deine Coins.', {
    goals: [g('coins', 8), g('height', 20), bonus('turns', 2)], unlocks: ['launch'], width: 100,
    terrain: [prop(10, 'ferris', 2), prop(90, 'booth', 1)], coins: [...row(15, 85, 9, 5), ...row(25, 75, 14, 3)],
  }),
  L('Launch!', 'Tippe den Start-Chip und wähle Launch. Flach losfahren, Tempo mitnehmen.', {
    goals: [g('launch'), g('speed', 60)], width: 100, coins: row(30, 80, 4, 5),
  }),
  L('Katapult', 'Mit Launch kannst du vom Boden aus hoch hinaus. Baue den Hügel nach dem Start.', {
    goals: [g('launch'), g('height', 25)], unlocks: ['longTrain'], width: 110, coins: col(70, 5, 22, 5),
  }),
  L('Volle Wagen', 'Vier Wagen, acht Fahrgäste. Mehr Masse, gleiche Physik, mehr Verantwortung.', {
    goals: [g('height', 20), g('maxG', 4)], width: 110, passengers: 8, cars: 4, coins: arc(55, 4, 18, 6),
  }),
  L('Riesenrad-Runde', 'Vier Kurven um das Riesenrad herum. Drei Spuren, viele Coins.', {
    goals: [g('turns', 4), g('lanes', 3), g('coins', 10)], unlocks: ['booster'], width: 110,
    terrain: [prop(55, 'ferris', 2)], coins: [...row(20, 90, 6, 4, 0), ...row(20, 90, 6, 3, 1), ...row(30, 80, 6, 3, 2)],
  }),
  L('Nachschub', 'Zieh einen Booster aus dem Regal auf eine gerade Strecke. Er schiebt den Zug an.', {
    goals: [g('boosters', 1), g('speed', 80)], width: 120, coins: row(60, 110, 5, 5),
  }),
  L('Zuckerwatte-Looping', 'Zwei Loopings mit Launch-Start. Wolken aus Zuckerwatte inklusive.', {
    goals: [g('loops', 2), g('launch'), bonus('coins', 10)], unlocks: ['fireworks'], width: 120,
    coins: [...ring(50, 10, 6, 5), ...ring(85, 9, 5, 5)],
  }),
  L('Feuerwerk', 'Je höher, desto näher am Feuerwerk. 35 Meter und 85 km/h.', {
    goals: [g('height', 35), g('speed', 85), bonus('airtime', 2)], width: 120, coins: col(60, 10, 32, 6),
  }),
  L('Achterbahn-Rallye', 'Eine lange Fahrt: mindestens 25 Sekunden und 220 Meter Strecke.', {
    goals: [g('time', 25), g('length', 220)], width: 130, coins: row(10, 120, 8, 8),
  }),
  L('Nachtfahrt', 'Die Kirmes bei Nacht. Nur die Coins leuchten den Weg.', {
    goals: [g('coins', 12), g('turns', 3)], unlocks: ['nightMode'], width: 120,
    coins: [...row(15, 105, 7, 6, 0), ...row(25, 95, 12, 6, 1)],
  }),
  L('Spiegelkabinett', 'Vier Spuren, fünf Kurven. Verliere nicht die Orientierung.', {
    goals: [g('lanes', 4), g('turns', 5)], width: 120, coins: [...row(20, 100, 5, 3, -1), ...row(20, 100, 5, 3, 2)],
  }),
  L('Sparfuchs', 'Material ist teuer: höchstens 160 Meter Schiene für 25 Meter Höhe und einen Looping.', {
    goals: [g('maxLength', 160), g('height', 25), g('loops', 1)], unlocks: ['skinHybrid'], width: 100, trackBudget: 160,
  }),
  L('Kirmes-Express', 'Zwei Booster, 90 km/h, und das Ganze in unter 30 Sekunden.', {
    goals: [g('speed', 90), g('boosters', 2), bonus('maxTime', 30)], width: 130, coins: row(20, 120, 4, 8),
  }),
  L('Schausteller-Prüfung', 'Die Prüfung: Loopings, Kurven, Airtime und Coins in einer Bahn.', {
    goals: [g('loops', 2), g('turns', 3), g('airtime', 1.5), g('coins', 12)], width: 130,
    terrain: [hill(40, 14, 3), hill(95, 14, 3)], coins: [...ring(65, 10, 6, 6), ...row(20, 120, 6, 6, 1)],
  }),
  L('Die große Kirmesbahn', 'Finale: 40 Meter hoch, zwei Loopings, vier Kurven, Launch. Das Feuerwerk wartet.', {
    goals: [g('height', 40), g('loops', 2), g('turns', 4), g('launch'), g('coins', 15), bonus('speed', 100)],
    width: 150, terrain: [prop(20, 'ferris', 2), prop(130, 'booth', 1), hill(75, 20, 4)], passengers: 8, cars: 4,
    coins: [...col(75, 8, 36, 6), ...ring(40, 10, 6, 5), ...row(90, 140, 6, 4, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 3 – Minenberg (31–45): Berge, Tunnel, Minenzug, Helix, Vertikallift, Fallschacht
 * ------------------------------------------------------------------------- */
const W3: LevelDef[] = [
  L('Erste Schürfung', 'Ein Berg versperrt den Weg. Noch musst du drüber. Bald geht es hindurch.', {
    goals: [g('height', 20), g('coins', 6)], unlocks: ['tunnel'], width: 110, terrain: [mountain(55, 30, 14)], coins: arc(55, 16, 10, 6),
  }),
  L('Durch den Berg', 'Der Tunnelbauer ist frei: Zeichne die Bahn mitten durch den Fels.', {
    goals: [g('tunnels', 1)], width: 110, terrain: [mountain(55, 34, 18)], coins: row(45, 65, 4, 3),
  }),
  L('Stollenlicht', 'Zwei Tunnel, und die Coins liegen im Dunkeln.', {
    goals: [g('tunnels', 2), g('coins', 8)], unlocks: ['skinMine'], width: 130,
    terrain: [mountain(35, 26, 14), mountain(95, 26, 16)], coins: [...row(28, 42, 4, 4), ...row(88, 102, 4, 4)],
  }),
  L('Goldader', 'Die Goldader läuft hinter dem Berg entlang. Zwei Kurven führen dich hin.', {
    goals: [g('coins', 12), g('turns', 2)], width: 130, terrain: [mountain(65, 40, 20, 0)],
    coins: [...row(40, 90, 5, 6, 2), ...row(20, 110, 6, 6, -1)],
  }),
  L('Minenschacht', 'Ein Abhang von 25 Metern. Der Zug muss unten ankommen, nicht die Fahrgäste.', {
    goals: [g('drop', 25)], unlocks: ['mountain'], width: 120, terrain: [cliff(60, 22)], coins: col(70, 2, 20, 5),
  }),
  L('Bergbauer', 'Du bist jetzt Bergbauer: Tippe und zieh auf den Boden, um einen Berg zu formen. Dann hindurch.', {
    goals: [g('tunnels', 1), g('height', 30), el('mountain', 1)], width: 120, coins: arc(60, 5, 20, 6),
  }),
  L('Staub und Funken', 'Schnell durch zwei Stollen. 80 km/h im Dunkeln.', {
    goals: [g('speed', 80), g('tunnels', 2)], unlocks: ['mineProps'], width: 140,
    terrain: [mountain(45, 28, 16), mountain(105, 28, 20)], coins: row(60, 90, 5, 4),
  }),
  L('Spirale', 'Vier Kurven auf vier Spuren: eine Spirale um den Förderturm.', {
    goals: [g('lanes', 4), g('turns', 4)], unlocks: ['helix'], width: 130, terrain: [prop(65, 'headframe', 2)],
    coins: [...row(30, 100, 6, 4, -1), ...row(30, 100, 6, 4, 1)],
  }),
  L('Helix im Fels', 'Die Helix-Vorlage macht sechs Kurven zu einer Spirale. Sammle die Coins auf jeder Ebene.', {
    goals: [g('turns', 6), g('coins', 10)], width: 140, coins: [...row(40, 100, 5, 5, -2), ...row(40, 100, 9, 5, 2)],
  }),
  L('Kippgefahr', 'Vier Kurven mit 70 km/h, aber höchstens 4 g. Zu schnell, und der Minenzug kippt.', {
    goals: [g('maxG', 4), g('turns', 4), g('speed', 70)], unlocks: ['verticalLift'], width: 140, coins: row(20, 120, 6, 6, 1),
  }),
  L('Senkrecht hoch', 'Der Vertikallift zieht den Zug gerade nach oben. 45 Meter, dann 40 Meter Drop.', {
    goals: [g('height', 45), g('drop', 40)], width: 140, coins: col(50, 10, 42, 7),
  }),
  L('Doppelstollen', 'Drei Tunnel und ein Looping im Berginneren.', {
    goals: [g('tunnels', 3), g('loops', 1)], unlocks: ['dropTrack'], width: 150,
    terrain: [mountain(40, 30, 18), mountain(90, 36, 26), mountain(135, 20, 12)], coins: ring(90, 12, 6, 6),
  }),
  L('Fallschacht', 'Das Fallschacht-Element lässt ein Schienenstück senkrecht abstürzen. Airtime garantiert.', {
    goals: [g('drop', 35), g('airtime', 2), el('dropTrack', 1)], width: 140, terrain: [cliff(70, 30)], coins: col(80, 2, 28, 6),
  }),
  L('Goldrausch', 'Zwanzig Coins, zwei Tunnel, drei Kurven. Unter 40 Sekunden gibt es den Bonus.', {
    goals: [g('coins', 20), g('tunnels', 2), g('turns', 3), bonus('maxTime', 40)], width: 150,
    terrain: [mountain(50, 30, 18), mountain(110, 30, 18)], coins: [...row(10, 140, 5, 8, 0), ...row(20, 130, 9, 6, 1), ...row(30, 120, 7, 6, -1)],
  }),
  L('Der große Durchbruch', 'Finale: Drei Tunnel, 45 Meter Höhe, zwei Loopings, vier Kurven. Die Mine gehört dir.', {
    goals: [g('tunnels', 3), g('height', 45), g('loops', 2), g('turns', 4), g('coins', 15)],
    width: 170, terrain: [mountain(45, 34, 22), mountain(110, 40, 30), mountain(155, 24, 14), prop(20, 'headframe', 2)],
    coins: [...ring(80, 14, 7, 6), ...col(110, 32, 44, 4), ...row(20, 160, 6, 5, 1)], passengers: 8, cars: 4,
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 4 – Seenland (46–60): Seen, Brücken, Wasserfälle, Splashdown, Stahlschienen, zwei Züge
 * ------------------------------------------------------------------------- */
const W4: LevelDef[] = [
  L('Über den See', 'Wasser trägt keine Stützen. Baue die Bahn hoch genug über den See.', {
    goals: [g('length', 120), g('coins', 6)], unlocks: ['bridge'], width: 120, terrain: [lake(60, 40)], coins: row(45, 75, 8, 6),
  }),
  L('Brückenbauer', 'Die Holzbrücke trägt die Bahn über das Wasser. Nimm eine Kurve am Ufer mit.', {
    goals: [g('turns', 1), g('height', 20), el('bridge', 1)], width: 130, terrain: [lake(65, 50)], coins: arc(65, 6, 16, 6),
  }),
  L('Wasserspiegel', 'Flach über dem Wasser mit Airtime. Die Coins spiegeln sich.', {
    goals: [g('airtime', 2), g('coins', 10)], unlocks: ['waterfall'], width: 130, terrain: [lake(40, 30), lake(95, 30)],
    coins: [...arc(40, 3, 10, 5), ...arc(95, 3, 10, 5)],
  }),
  L('Wasserfall', 'Ein Wasserfall stürzt von der Klippe. Deine Bahn stürzt mit: 35 Meter hoch bauen.', {
    goals: [g('height', 35)], width: 130, terrain: [cliff(60, 28), waterfall(60, 28), lake(80, 30)], coins: col(70, 4, 30, 6),
  }),
  L('Gischt', 'Neunzig km/h und ein 30-Meter-Drop in die Gischt.', {
    goals: [g('speed', 90), g('drop', 30)], unlocks: ['splash'], width: 140, terrain: [waterfall(50, 24), cliff(50, 24), lake(75, 40)],
    coins: row(60, 110, 3, 6),
  }),
  L('Splashdown', 'Zieh das Splash-Element auf eine Stelle über dem See: Die Flossen tauchen ein.', {
    goals: [g('splash', 1)], width: 130, terrain: [lake(65, 50)], coins: row(50, 80, 2, 4),
  }),
  L('Doppelter Splash', 'Zwei Mal eintauchen, zwei Kurven. Das Wasser bremst, also Schwung holen.', {
    goals: [g('splash', 2), g('turns', 2)], unlocks: ['skinSteel'], width: 150, terrain: [lake(40, 36), lake(110, 36)],
    coins: [...row(30, 50, 2, 3), ...row(100, 120, 2, 3)],
  }),
  L('Stahlzeit', 'Stahlschienen erlauben engere Kurven und mehr g. Zwei Loopings bei 100 km/h.', {
    goals: [g('loops', 2), g('speed', 100)], width: 150, terrain: [lake(75, 30)], coins: [...ring(45, 11, 6, 6), ...ring(110, 10, 6, 6)],
  }),
  L('Flussfahrt', 'Der Fluss zieht sich über alle Spuren. Fünf Kurven, vier Spuren, zwölf Coins.', {
    goals: [g('lanes', 4), g('turns', 5), g('coins', 12)], width: 150, terrain: [river(75, 20)],
    coins: [...row(20, 130, 5, 4, -1), ...row(20, 130, 5, 4, 0), ...row(20, 130, 5, 4, 1)],
  }),
  L('Inselhüpfen', 'Eine Insel mit Berg im See: Tunnel durch die Insel, Splash daneben.', {
    goals: [g('tunnels', 1), g('splash', 1), g('coins', 10)], unlocks: ['secondTrain'], width: 150,
    terrain: [lake(40, 30), mountain(75, 24, 14), lake(110, 30)], coins: [...row(30, 50, 2, 3), ...row(100, 120, 2, 3), ...arc(75, 15, 8, 4)],
  }),
  L('Zwei Züge', 'Zwei Züge auf einer Bahn: Die Blockbremse hält den zweiten, bis der erste durch ist.', {
    goals: [g('height', 40), el('secondTrain', 1)], width: 160, passengers: 12, cars: 6, terrain: [lake(80, 40)], coins: arc(80, 10, 20, 7),
  }),
  L('Seerosen', 'Sanft wie eine Seerose: Höchstens 3,5 g, aber 3 Sekunden Airtime.', {
    goals: [g('maxG', 3.5), g('airtime', 3), g('coins', 14)], width: 160, terrain: [lake(50, 30), lake(110, 30)],
    coins: [...arc(50, 4, 12, 7), ...arc(110, 4, 12, 7)],
  }),
  L('Wellenritt', 'Bunny Hops: Viele kleine Hügel, vier Sekunden Airtime insgesamt.', {
    goals: [g('airtime', 4), g('speed', 80)], width: 170, terrain: [hill(40, 12, 2), hill(70, 12, 2), hill(100, 12, 2), hill(130, 12, 2)],
    coins: [...arc(40, 4, 6, 3), ...arc(70, 4, 6, 3), ...arc(100, 4, 6, 3), ...arc(130, 4, 6, 3)],
  }),
  L('Regenbogen', 'Drei Loopings und ein Splash. Wo Gischt ist, ist ein Regenbogen.', {
    goals: [g('loops', 3), g('splash', 1), bonus('coins', 15)], width: 170, terrain: [lake(85, 40)],
    coins: [...ring(40, 11, 6, 5), ...ring(85, 12, 7, 5), ...ring(130, 11, 6, 5)],
  }),
  L('Seenland-Finale', 'Finale: 50 Meter hoch, zwei Loopings, zwei Splashes, vier Kurven. Eine Bahn wie ein Gemälde.', {
    goals: [g('height', 50), g('loops', 2), g('splash', 2), g('turns', 4), g('coins', 18), bonus('length', 300)],
    width: 190, terrain: [cliff(40, 30), waterfall(40, 30), lake(70, 40), lake(140, 36)], passengers: 8, cars: 4,
    coins: [...col(50, 6, 46, 6), ...ring(105, 12, 7, 6), ...row(60, 170, 7, 6, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 5 – Schlossreich (61–75): Schloss, Top Hat, Schleife (Roll), Doppel-Launch, Immelmann, Gold
 * ------------------------------------------------------------------------- */
const W5: LevelDef[] = [
  L('Schlosstor', 'Das Schloss liegt im Hintergrund. Deine Bahn muss über das Tor hinweg.', {
    goals: [g('height', 45), g('coins', 10)], unlocks: ['castle'], width: 150, terrain: [prop(75, 'castle', 2), hill(75, 30, 10)],
    coins: [...arc(75, 14, 18, 6), ...row(20, 130, 6, 4, 1)],
  }),
  L('Turmhoch', 'Höher als der höchste Turm: 60 Meter.', {
    goals: [g('height', 60)], unlocks: ['topHat'], width: 150, terrain: [prop(120, 'castle', 2)], coins: col(60, 10, 56, 8),
  }),
  L('Top Hat', 'Launch, dann senkrecht hoch und über den Top Hat. 55 Meter hoch, 50 Meter Drop.', {
    goals: [g('launch'), g('height', 55), g('drop', 50), el('topHat', 1)], width: 160, coins: [...col(70, 10, 50, 6), ...row(80, 140, 4, 5)],
  }),
  L('Hofknicks', 'Zwei Loopings und drei Kurven, elegant wie ein Knicks vor dem König.', {
    goals: [g('loops', 2), g('turns', 3)], unlocks: ['roll'], width: 160, coins: [...ring(50, 11, 6, 6), ...ring(110, 11, 6, 6)],
  }),
  L('Die Schleife', 'Neu: Das dritte Handle dreht die Schiene um die Fahrtrichtung. Eine volle Schleife bitte.', {
    goals: [g('rolls', 1), g('height', 30)], width: 150, coins: row(60, 110, 8, 5),
  }),
  L('Doppelschleife', 'Zwei Schleifen bei 90 km/h. Die Fahrgäste hängen kopfüber, also nicht zu langsam.', {
    goals: [g('rolls', 2), g('speed', 90)], unlocks: ['doubleLaunch'], width: 160, coins: row(40, 130, 10, 7),
  }),
  L('Zwei Launches', 'Der zweite Launch sitzt mitten in der Bahn. 120 km/h sind drin.', {
    goals: [g('launch'), g('boosters', 1), g('speed', 120), el('doubleLaunch', 1)], width: 170, coins: row(20, 160, 5, 8),
  }),
  L('Ritterturnier', 'Drei Loopings, eine Schleife, fünfzehn Coins. Das Turnier beginnt.', {
    goals: [g('loops', 3), g('rolls', 1), g('coins', 15)], unlocks: ['immelmann'], width: 170,
    coins: [...ring(40, 11, 6, 5), ...ring(85, 11, 6, 5), ...ring(130, 11, 6, 5)],
  }),
  L('Immelmann', 'Halber Looping, halbe Schleife, Kurve: Die Immelmann-Vorlage aus dem Regal.', {
    goals: [el('immelmann', 1), g('speed', 100)], width: 160, coins: arc(80, 10, 20, 7),
  }),
  L('Königliche Parade', 'Eine lange Parade: 350 Meter, 45 Sekunden, 20 Coins.', {
    goals: [g('length', 350), g('time', 45), g('coins', 20)], width: 190, terrain: [prop(95, 'castle', 2)],
    coins: [...row(10, 180, 6, 8, 0), ...row(20, 170, 10, 6, 1), ...row(30, 160, 6, 6, -1)],
  }),
  L('Drachenflug', 'Wie ein Drache: 60 Meter hoch, vier Sekunden Airtime, höchstens 4,5 g.', {
    goals: [g('airtime', 4), g('height', 60), g('maxG', 4.5)], width: 180, terrain: [hill(60, 20, 6), hill(120, 20, 6)],
    coins: [...arc(60, 8, 12, 5), ...arc(120, 8, 12, 5)],
  }),
  L('Goldene Schienen', '130 km/h und 55 Meter Drop. Danach glänzt die Bahn golden.', {
    goals: [g('speed', 130), g('drop', 55)], unlocks: ['skinGold'], width: 180, coins: col(80, 8, 52, 8),
  }),
  L('Thronsaal', 'Durch den Thronsaal: Fünf Spuren, sechs Kurven, ein Tunnel durch das Schloss.', {
    goals: [g('lanes', 5), g('turns', 6), g('tunnels', 1)], width: 180, terrain: [mountain(90, 36, 22), prop(90, 'castle', 2)],
    coins: [...row(20, 160, 5, 4, -2), ...row(20, 160, 5, 4, 2)],
  }),
  L('Krönung', 'Drei Loopings, zwei Schleifen, Launch und 18 Coins. Fast gekrönt.', {
    goals: [g('loops', 3), g('rolls', 2), g('launch'), g('coins', 18)], width: 190,
    coins: [...ring(45, 12, 7, 6), ...ring(95, 12, 7, 6), ...ring(145, 12, 7, 6)],
  }),
  L('Schloss-Finale', 'Finale: 70 Meter, drei Loopings, zwei Schleifen, vier Kurven, 20 Coins. Der König applaudiert.', {
    goals: [g('height', 70), g('loops', 3), g('rolls', 2), g('turns', 4), g('coins', 20), bonus('airtime', 3)],
    width: 210, terrain: [prop(105, 'castle', 2), hill(105, 40, 12)], passengers: 8, cars: 4,
    coins: [...col(105, 20, 66, 6), ...ring(50, 12, 7, 6), ...ring(160, 12, 7, 6), ...row(30, 180, 8, 4, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 6 – Großstadt (76–90): Neon, Mehrfach-Launch, Helix, Korkenzieher, U-Bahn-Tunnel
 * ------------------------------------------------------------------------- */
const W6: LevelDef[] = [
  L('Skyline', 'Zwischen den Hochhäusern hindurch: 60 Meter hoch, zwei Kurven.', {
    goals: [g('height', 60), g('coins', 12), g('turns', 2)], unlocks: ['cityProps'], width: 170,
    terrain: [prop(30, 'tower', 2), prop(140, 'tower', 2)], coins: [...col(85, 10, 56, 6), ...row(20, 150, 8, 6, 1)],
  }),
  L('Neonlichter', 'Zwanzig Neon-Coins bei 100 km/h.', {
    goals: [g('coins', 20), g('speed', 100)], unlocks: ['skinNeon'], width: 180,
    coins: [...row(10, 170, 6, 8, 0), ...row(20, 160, 12, 6, 1), ...row(30, 150, 18, 6, -1)],
  }),
  L('Dreifach-Launch', 'Launch plus zwei Booster: 140 km/h.', {
    goals: [g('boosters', 2), g('launch'), g('speed', 140)], width: 190, coins: row(20, 170, 4, 10),
  }),
  L('Parkhaus-Helix', 'Acht Kurven auf fünf Spuren, wie die Rampe im Parkhaus.', {
    goals: [g('turns', 8), g('lanes', 5)], unlocks: ['corkscrew'], width: 180, terrain: [prop(90, 'garage', 2)],
    coins: [...row(30, 150, 5, 5, -2), ...row(30, 150, 9, 5, 0), ...row(30, 150, 13, 5, 2)],
  }),
  L('Korkenzieher', 'Die Korkenzieher-Vorlage: Looping und Schleife in einem. 110 km/h.', {
    goals: [el('corkscrew', 1), g('speed', 110)], width: 180, coins: ring(90, 12, 7, 8),
  }),
  L('Rush Hour', 'Schnell durch die Stadt: 300 Meter in höchstens 35 Sekunden, 15 Coins.', {
    goals: [g('maxTime', 35), g('length', 300), g('coins', 15)], width: 200, coins: [...row(10, 190, 5, 9, 0), ...row(20, 180, 9, 6, 1)],
  }),
  L('U-Bahn', 'Drei Tunnel unter der Stadt bei 120 km/h.', {
    goals: [g('tunnels', 3), g('speed', 120)], width: 200, terrain: [mountain(50, 30, 14), mountain(110, 34, 16), mountain(165, 30, 14)],
    coins: [...row(40, 60, 4, 3), ...row(100, 120, 4, 3), ...row(155, 175, 4, 3)],
  }),
  L('Dachgarten', 'Über die Dächer mit vier Sekunden Airtime, aber höchstens 4 g.', {
    goals: [g('airtime', 4), g('height', 50), g('maxG', 4)], width: 200, terrain: [hill(60, 24, 8), hill(140, 24, 8), prop(100, 'tower', 2)],
    coins: [...arc(60, 10, 12, 5), ...arc(140, 10, 12, 5)],
  }),
  L('Hochhaus-Sprint', 'Vom Dach in die Tiefe: 70 Meter Drop, 150 km/h.', {
    goals: [g('drop', 70), g('speed', 150)], width: 200, terrain: [cliff(80, 40), prop(60, 'tower', 2)], coins: col(90, 4, 60, 8),
  }),
  L('Nachtschicht', 'Vier Loopings mit zwei Boostern, damit der Schwung nie ausgeht.', {
    goals: [g('loops', 4), g('boosters', 2)], width: 210,
    coins: [...ring(40, 12, 7, 5), ...ring(90, 12, 7, 5), ...ring(140, 12, 7, 5), ...ring(190, 12, 7, 5)],
  }),
  L('Verkehrschaos', 'Sechs Kurven, zwei Tunnel, zwei Loopings, zwanzig Coins.', {
    goals: [g('turns', 6), g('tunnels', 2), g('loops', 2), g('coins', 20)], width: 210,
    terrain: [mountain(70, 30, 16), mountain(150, 30, 16)], coins: [...row(10, 200, 6, 8, 0), ...row(20, 190, 6, 6, 2), ...ring(110, 12, 7, 6)],
  }),
  L('Leuchtreklame', 'Drei Schleifen vor der Leuchtreklame, 18 Coins.', {
    goals: [g('rolls', 3), g('coins', 18)], width: 200, terrain: [prop(100, 'billboard', 2)],
    coins: [...row(20, 180, 10, 9, 0), ...row(30, 170, 14, 9, 1)],
  }),
  L('Sparplan', 'Budget: 220 Meter Schiene für 55 Meter Höhe und zwei Loopings.', {
    goals: [g('maxLength', 220), g('height', 55), g('loops', 2)], width: 180, trackBudget: 220,
  }),
  L('Metropolen-Marathon', '500 Meter Strecke, 60 Sekunden Fahrt, 25 Coins.', {
    goals: [g('length', 500), g('time', 60), g('coins', 25)], width: 240,
    coins: [...row(10, 230, 6, 10, 0), ...row(20, 220, 10, 8, 1), ...row(30, 210, 14, 7, -1)],
  }),
  L('Großstadt-Finale', 'Finale: 80 Meter, vier Loopings, zwei Schleifen, zwei Booster, sechs Kurven, 25 Coins.', {
    goals: [g('height', 80), g('loops', 4), g('rolls', 2), g('boosters', 2), g('turns', 6), g('coins', 25), bonus('speed', 160)],
    width: 250, terrain: [prop(40, 'tower', 2), prop(210, 'tower', 2), mountain(125, 30, 16)], passengers: 12, cars: 6,
    coins: [...col(125, 20, 76, 7), ...ring(60, 12, 7, 6), ...ring(190, 12, 7, 6), ...row(30, 220, 8, 6, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 7 – Eisgipfel (91–105): wenig Reibung, Cobra Roll, Weichen, Kippschiene
 * ------------------------------------------------------------------------- */
const ice = { friction: 0.4 };
const W7: LevelDef[] = [
  L('Glatteis', 'Auf Eis rollt der Zug fast ohne Reibung. 120 km/h bei 50 Metern Höhe, höchstens 4 g.', {
    goals: [g('speed', 120), g('height', 50), g('maxG', 4)], unlocks: ['iceProps'], width: 180, physics: ice, coins: col(90, 10, 46, 6),
  }),
  L('Eiszapfen', 'Die Coins hängen wie Eiszapfen. Drei Kurven.', {
    goals: [g('coins', 15), g('turns', 3)], width: 180, physics: ice, coins: [...col(50, 8, 24, 5), ...col(90, 8, 24, 5, 1), ...col(130, 8, 24, 5)],
  }),
  L('Gletscherspalte', '60 Meter Drop in die Spalte, Tunnel durch die Eishöhle.', {
    goals: [g('drop', 60), g('tunnels', 1)], unlocks: ['skinIce'], width: 190, physics: ice,
    terrain: [cliff(70, 36), mountain(140, 34, 20)], coins: col(80, 4, 34, 6),
  }),
  L('Schneesturm', 'Drei Loopings, zwei Schleifen, 130 km/h. Im Schneesturm.', {
    goals: [g('loops', 3), g('rolls', 2), g('speed', 130)], width: 200, physics: ice,
    coins: [...ring(50, 12, 7, 5), ...ring(110, 12, 7, 5), ...ring(170, 12, 7, 5)],
  }),
  L('Cobra Roll', 'Die Cobra-Roll-Vorlage: zwei halbe Loopings, zwei halbe Schleifen, Rückkehr in Gegenrichtung.', {
    goals: [el('cobraRoll', 1), g('speed', 110)], unlocks: ['cobraRoll'], width: 200, physics: ice, coins: arc(100, 12, 24, 8),
  }),
  L('Polarlicht', 'Unter dem Polarlicht: fünf Sekunden Airtime bei 60 Metern Höhe.', {
    goals: [g('airtime', 5), g('height', 60)], width: 210, physics: ice,
    terrain: [hill(60, 24, 6), hill(120, 24, 6), hill(180, 24, 6)], coins: [...arc(60, 8, 12, 5), ...arc(120, 8, 12, 5), ...arc(180, 8, 12, 5)],
  }),
  L('Lawine', 'Schneller als die Lawine: 280 Meter in 30 Sekunden bei 140 km/h.', {
    goals: [g('maxTime', 30), g('length', 280), g('speed', 140)], unlocks: ['switchTrack'], width: 210, physics: ice, coins: row(20, 190, 5, 9),
  }),
  L('Weichenstellung', 'Die Weiche schickt den Zug mal links, mal rechts. Fünf Spuren, sieben Kurven.', {
    goals: [g('lanes', 5), g('turns', 7), el('switchTrack', 1)], width: 210, physics: ice,
    coins: [...row(30, 180, 5, 5, -2), ...row(30, 180, 5, 5, 2)],
  }),
  L('Eisbrecher', 'Zwei Splashes im Eiswasser, zwei Loopings.', {
    goals: [g('splash', 2), g('loops', 2)], width: 210, physics: ice, terrain: [lake(60, 36), lake(150, 36)],
    coins: [...ring(105, 12, 7, 6), ...row(50, 70, 2, 3), ...row(140, 160, 2, 3)],
  }),
  L('Hundert', 'Level 100: Dreißig Coins, 70 Meter, drei Loopings. Ein Fest aus Eis.', {
    goals: [g('coins', 30), g('height', 70), g('loops', 3)], unlocks: ['tilt'], width: 230, physics: ice,
    coins: [...row(10, 220, 6, 10, 0), ...row(20, 210, 12, 8, 1), ...ring(115, 14, 8, 6), ...col(60, 20, 60, 6)],
  }),
  L('Kipplage', 'Die Kippschiene neigt den Zug vor dem Drop. 5 g und 65 Meter Drop.', {
    goals: [g('maxG', 5), g('drop', 65), el('tilt', 1)], width: 220, physics: ice, terrain: [cliff(100, 40)], coins: col(110, 4, 60, 8),
  }),
  L('Frostbeulen', 'Acht Kurven, zwei Tunnel, zwei Schleifen. Kalt, aber schnell.', {
    goals: [g('turns', 8), g('tunnels', 2), g('rolls', 2)], width: 230, physics: ice,
    terrain: [mountain(70, 30, 18), mountain(160, 30, 18)], coins: [...row(20, 210, 6, 8, 1), ...row(20, 210, 6, 8, -1)],
  }),
  L('Gipfelsturm', '90 Meter hoch, 150 km/h. Der Gipfel ruft.', {
    goals: [g('height', 90), g('speed', 150)], width: 230, physics: ice, terrain: [mountain(115, 60, 40)], coins: col(115, 44, 86, 7),
  }),
  L('Eiskristall', 'Fünf Loopings und 25 Coins, wie die Spitzen eines Eiskristalls.', {
    goals: [g('loops', 5), g('coins', 25)], width: 250, physics: ice,
    coins: [...ring(40, 12, 7, 5), ...ring(85, 12, 7, 5), ...ring(130, 12, 7, 5), ...ring(175, 12, 7, 5), ...ring(220, 12, 7, 5)],
  }),
  L('Eisgipfel-Finale', 'Finale: 90 Meter, vier Loopings, drei Schleifen, sechs Kurven, zwei Tunnel, 30 Coins.', {
    goals: [g('height', 90), g('loops', 4), g('rolls', 3), g('turns', 6), g('tunnels', 2), g('coins', 30)],
    width: 270, physics: ice, terrain: [mountain(80, 40, 24), mountain(200, 40, 24), cliff(135, 30)], passengers: 12, cars: 6,
    coins: [...col(135, 20, 86, 8), ...ring(40, 12, 7, 6), ...ring(240, 12, 7, 6), ...row(20, 250, 8, 10, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 8 – Geisterhaus (106–120): Dark Ride, Fallschacht, Rückwärtsfahrt, Pendel-Launch
 * ------------------------------------------------------------------------- */
const W8: LevelDef[] = [
  L('Spukvilla', 'Durch die Villa hindurch: Zwei Tunnel im Dunkeln, zwölf Coins.', {
    goals: [g('tunnels', 2), g('coins', 12)], unlocks: ['ghostHouse'], width: 190,
    terrain: [mountain(60, 40, 22), mountain(140, 40, 22), prop(60, 'ghostHouse', 1)], coins: [...row(45, 75, 5, 5), ...row(125, 155, 5, 5), ...row(80, 120, 10, 2)],
  }),
  L('Fledermausflug', 'Wie eine Fledermaus: vier Sekunden Airtime, vier Kurven.', {
    goals: [g('airtime', 4), g('turns', 4)], width: 200, terrain: [hill(50, 20, 5), hill(110, 20, 5), hill(170, 20, 5)],
    coins: [...arc(50, 7, 10, 4), ...arc(110, 7, 10, 4), ...arc(170, 7, 10, 4)],
  }),
  L('Friedhofsrunde', 'Drei Loopings über den Grabsteinen bei 110 km/h.', {
    goals: [g('loops', 3), g('speed', 110), g('coins', 15)], unlocks: ['skinGhost'], width: 210, terrain: [prop(100, 'graveyard', 1)],
    coins: [...ring(50, 12, 7, 5), ...ring(110, 12, 7, 5), ...ring(170, 12, 7, 5)],
  }),
  L('Fallgrube', 'Der Fallschacht öffnet sich ins Nichts: 50 Meter Drop, drei Sekunden Airtime.', {
    goals: [g('drop', 50), g('airtime', 3), el('dropTrack', 1)], width: 200, terrain: [cliff(90, 34)], coins: col(100, 4, 30, 6),
  }),
  L('Spiegelwelt', 'Fünf Spuren, acht Kurven. Die Spiegel lügen.', {
    goals: [g('lanes', 5), g('turns', 8)], unlocks: ['reverse'], width: 210,
    coins: [...row(30, 180, 5, 5, -2), ...row(30, 180, 5, 5, -1), ...row(30, 180, 5, 5, 1), ...row(30, 180, 5, 5, 2)],
  }),
  L('Rückwärts!', 'Die Rückwärts-Weiche schickt den Zug ein Stück zurück. Nutze sie einmal.', {
    goals: [el('reverse', 1), g('height', 50)], width: 200, coins: arc(100, 8, 24, 7),
  }),
  L('Kerzenschein', 'Nachtmodus: Nur Kerzen und Coins leuchten. Drei Tunnel, zwanzig Coins.', {
    goals: [g('coins', 20), g('tunnels', 3)], unlocks: ['swingLaunch'], width: 220,
    terrain: [mountain(50, 30, 18), mountain(110, 30, 18), mountain(170, 30, 18)],
    coins: [...row(40, 60, 4, 4), ...row(100, 120, 4, 4), ...row(160, 180, 4, 4), ...row(20, 200, 10, 8, 1)],
  }),
  L('Pendel', 'Pendel-Launch: Der Zug schwingt mehrmals durch die Station und wird jedes Mal schneller. 120 km/h.', {
    goals: [el('swingLaunch', 1), g('speed', 120)], width: 220, coins: [...col(60, 8, 40, 5), ...col(180, 8, 40, 5)],
  }),
  L('Geisterstunde', 'In 40 Sekunden: vier Loopings und zwei Schleifen.', {
    goals: [g('maxTime', 40), g('loops', 4), g('rolls', 2)], width: 230,
    coins: [...ring(40, 12, 7, 5), ...ring(100, 12, 7, 5), ...ring(160, 12, 7, 5), ...ring(215, 12, 7, 5)],
  }),
  L('Knochenbrecher', 'Intensität: Mindestens 4,5 g irgendwo auf der Strecke, drei Loopings.', {
    goals: [g('minG', 4.5), g('loops', 3)], width: 220, coins: [...ring(60, 10, 6, 6), ...ring(160, 10, 6, 6)],
  }),
  L('Nebelfahrt', 'Sechs Kurven, drei Tunnel, vier Spuren im Nebel.', {
    goals: [g('turns', 6), g('tunnels', 3), g('lanes', 4)], width: 230,
    terrain: [mountain(60, 30, 18), mountain(120, 30, 18), mountain(180, 30, 18)], coins: [...row(20, 210, 6, 8, 2), ...row(20, 210, 6, 8, -1)],
  }),
  L('Grabesstille', 'Ganz sanft: höchstens 3 g, aber vier Sekunden Airtime und 20 Coins.', {
    goals: [g('maxG', 3), g('airtime', 4), g('coins', 20)], width: 230, terrain: [hill(60, 24, 5), hill(120, 24, 5), hill(180, 24, 5)],
    coins: [...arc(60, 7, 12, 6), ...arc(120, 7, 12, 6), ...arc(180, 7, 12, 6), ...row(30, 210, 4, 2, 1)],
  }),
  L('Hexenkessel', 'Cobra Roll und Immelmann in einer Bahn, dazu zwei Loopings.', {
    goals: [el('cobraRoll', 1), el('immelmann', 1), g('loops', 2)], width: 240, coins: [...arc(70, 12, 20, 6), ...arc(170, 12, 20, 6)],
  }),
  L('Dämmerung', '450 Meter, 55 Sekunden, 25 Coins. Die Nacht ist lang.', {
    goals: [g('length', 450), g('time', 55), g('coins', 25)], width: 250,
    coins: [...row(10, 240, 6, 10, 0), ...row(20, 230, 10, 8, 1), ...row(30, 220, 14, 7, -1)],
  }),
  L('Geisterhaus-Finale', 'Finale: 85 Meter, vier Loopings, drei Schleifen, drei Tunnel, Rückwärts-Weiche, 30 Coins.', {
    goals: [g('height', 85), g('loops', 4), g('rolls', 3), g('tunnels', 3), el('reverse', 1), g('coins', 30)],
    width: 270, terrain: [mountain(60, 40, 24), mountain(135, 40, 24), mountain(210, 40, 24), prop(135, 'ghostHouse', 1)], passengers: 12, cars: 6,
    coins: [...col(100, 20, 80, 7), ...ring(40, 12, 7, 6), ...ring(240, 12, 7, 6), ...row(20, 250, 8, 10, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 9 – Vulkaninsel (121–135): Lava, Hydro-Launch, hohe g, Zeitdruck
 * ------------------------------------------------------------------------- */
const W9: LevelDef[] = [
  L('Lavastrom', 'Ein Lavafluss in der Mitte. 60 Meter hoch darüber, 15 Coins.', {
    goals: [g('height', 60), g('coins', 15)], unlocks: ['volcanoProps'], width: 200, terrain: [river(100, 30)],
    coins: [...arc(100, 14, 26, 7), ...row(20, 180, 6, 8, 1)],
  }),
  L('Asche', '140 km/h durch zwei Aschetunnel.', {
    goals: [g('speed', 140), g('tunnels', 2)], width: 210, terrain: [mountain(70, 34, 20), mountain(150, 34, 20)], coins: [...row(60, 80, 5, 3), ...row(140, 160, 5, 3)],
  }),
  L('Krater', '80 Meter Drop in den Krater mit drei Sekunden Airtime.', {
    goals: [g('drop', 80), g('airtime', 3)], unlocks: ['skinLava'], width: 220, terrain: [cliff(100, 50), valley(140, 40, 10)], coins: col(110, 6, 70, 8),
  }),
  L('Magmakammer', 'Vier Loopings in der Magmakammer, zwei Tunnel, 20 Coins.', {
    goals: [g('loops', 4), g('tunnels', 2), g('coins', 20)], unlocks: ['hydroLaunch'], width: 240,
    terrain: [mountain(60, 40, 26), mountain(180, 40, 26)], coins: [...ring(30, 12, 7, 5), ...ring(120, 14, 8, 6), ...ring(210, 12, 7, 5), ...row(20, 220, 6, 4, 1)],
  }),
  L('Hydro-Launch', 'Der Hydro-Launch ist der stärkste Start im Spiel: 180 km/h in Sekunden.', {
    goals: [el('hydroLaunch', 1), g('speed', 180)], width: 240, coins: row(30, 210, 5, 10),
  }),
  L('Eruption', '100 Meter hoch wie die Eruption, mit Launch und 170 km/h.', {
    goals: [g('height', 100), g('launch'), g('speed', 170)], width: 240, terrain: [mountain(120, 70, 50)], coins: col(120, 54, 96, 7),
  }),
  L('Glutnester', 'Dreißig glühende Coins über sechs Kurven.', {
    goals: [g('coins', 30), g('turns', 6)], width: 240,
    coins: [...row(10, 230, 6, 10, 0), ...row(20, 220, 8, 8, 1), ...row(20, 220, 8, 8, -1), ...row(30, 210, 12, 4, 2)],
  }),
  L('Hitzewelle', 'Intensiv, aber nicht tödlich: mindestens 4 g, höchstens 5 g, drei Loopings.', {
    goals: [g('maxG', 5), g('minG', 4), g('loops', 3)], width: 230, coins: [...ring(60, 11, 6, 6), ...ring(120, 11, 6, 6), ...ring(180, 11, 6, 6)],
  }),
  L('Feuerspucker', 'Vier Schleifen bei 150 km/h.', {
    goals: [g('rolls', 4), g('speed', 150)], width: 240, coins: row(30, 210, 12, 10),
  }),
  L('Inselumrundung', 'Einmal um die Insel: acht Kurven, fünf Spuren, 500 Meter.', {
    goals: [g('turns', 8), g('lanes', 5), g('length', 500)], width: 260, terrain: [mountain(130, 60, 36)],
    coins: [...row(20, 240, 6, 8, -2), ...row(20, 240, 6, 8, 2)],
  }),
  L('Schwefelnebel', 'Vier Tunnel und drei Loopings im Schwefelnebel.', {
    goals: [g('tunnels', 4), g('loops', 3)], width: 260,
    terrain: [mountain(40, 30, 18), mountain(100, 30, 18), mountain(160, 30, 18), mountain(220, 30, 18)],
    coins: [...ring(70, 12, 7, 5), ...ring(130, 12, 7, 5), ...ring(190, 12, 7, 5)],
  }),
  L('Gegen die Zeit', '400 Meter in höchstens 35 Sekunden, 20 Coins.', {
    goals: [g('maxTime', 35), g('length', 400), g('coins', 20)], width: 260, coins: [...row(10, 250, 5, 12, 0), ...row(20, 240, 9, 8, 1)],
  }),
  L('Lavabrücke', 'Top Hat über die Lavabrücke, 90 Meter hoch, ein Splash im See.', {
    goals: [el('topHat', 1), g('height', 90), g('splash', 1)], width: 260, terrain: [river(100, 30), lake(200, 40)],
    coins: [...col(100, 30, 86, 7), ...row(190, 210, 2, 3)],
  }),
  L('Ausbruch', '110 Meter, 100 Meter Drop, 190 km/h. Der Vulkan bricht aus.', {
    goals: [g('height', 110), g('drop', 100), g('speed', 190)], width: 270, terrain: [mountain(135, 80, 60)], coins: col(135, 64, 106, 7),
  }),
  L('Vulkan-Finale', 'Finale: 110 Meter, fünf Loopings, drei Schleifen, sechs Kurven, drei Tunnel, Hydro-Launch, 35 Coins.', {
    goals: [g('height', 110), g('loops', 5), g('rolls', 3), g('turns', 6), g('tunnels', 3), el('hydroLaunch', 1), g('coins', 35)],
    width: 300, terrain: [mountain(70, 44, 26), mountain(150, 80, 60), mountain(240, 44, 26), river(200, 20)], passengers: 12, cars: 6,
    coins: [...col(150, 64, 106, 7), ...ring(40, 12, 7, 6), ...ring(110, 12, 7, 6), ...ring(200, 12, 7, 6), ...ring(270, 12, 7, 6), ...row(20, 280, 8, 11, 1)],
  }),
];

/* ----------------------------------------------------------------------------
 * Welt 10 – Weltraum (136–150): geringe Schwerkraft, Raumstation, Finale
 * ------------------------------------------------------------------------- */
const space = { gravity: 0.6 };
const W10: LevelDef[] = [
  L('Startrampe', 'Im Weltraum wiegt alles weniger. Launch und 80 Meter Höhe bei 120 km/h.', {
    goals: [g('height', 80), g('launch'), g('speed', 120)], unlocks: ['spaceBuilding'], width: 220, physics: space, coins: col(110, 10, 76, 8),
  }),
  L('Schwerelos', 'Acht Sekunden Airtime. Hier schweben die Fahrgäste gern.', {
    goals: [g('airtime', 8), g('coins', 20)], width: 230, physics: space, terrain: [hill(50, 24, 6), hill(115, 24, 6), hill(180, 24, 6)],
    coins: [...arc(50, 8, 14, 6), ...arc(115, 8, 14, 6), ...arc(180, 8, 14, 6), ...row(30, 200, 4, 2, 1)],
  }),
  L('Raumstation', 'Durch die Module der Raumstation: zwei Tunnel, vier Kurven.', {
    goals: [g('tunnels', 2), g('turns', 4)], unlocks: ['skinSpace'], width: 230, physics: space,
    terrain: [mountain(70, 36, 20), mountain(160, 36, 20), prop(115, 'spaceBuilding', 2)], coins: [...row(60, 80, 5, 3), ...row(150, 170, 5, 3), ...row(20, 210, 10, 6, 1)],
  }),
  L('Asteroidengürtel', 'Dreißig Coins auf fünf Spuren zwischen den Asteroiden.', {
    goals: [g('coins', 30), g('lanes', 5)], width: 240, physics: space,
    coins: [...row(20, 220, 6, 6, -2), ...row(20, 220, 8, 6, -1), ...row(20, 220, 10, 6, 0), ...row(20, 220, 8, 6, 1), ...row(20, 220, 6, 6, 2)],
  }),
  L('Orbit', 'Fünf Loopings und drei Schleifen wie ein Orbit.', {
    goals: [g('loops', 5), g('rolls', 3)], width: 250, physics: space,
    coins: [...ring(40, 12, 7, 5), ...ring(90, 12, 7, 5), ...ring(140, 12, 7, 5), ...ring(190, 12, 7, 5), ...ring(235, 12, 7, 5)],
  }),
  L('Andocken', 'Präzision: höchstens 300 Meter Schiene für 70 Meter Höhe und zwei Loopings.', {
    goals: [g('maxLength', 300), g('height', 70), g('loops', 2)], width: 220, physics: space, trackBudget: 300,
  }),
  L('Sonnensturm', '200 km/h mit drei Boostern.', {
    goals: [g('speed', 200), g('boosters', 3)], width: 260, physics: space, coins: row(20, 240, 5, 12),
  }),
  L('Mondlandung', 'Sanft landen: höchstens 3 g trotz 90 Meter Drop und sechs Sekunden Airtime.', {
    goals: [g('maxG', 3), g('drop', 90), g('airtime', 6)], width: 260, physics: space, terrain: [cliff(110, 56)], coins: col(120, 6, 80, 8),
  }),
  L('Wurmloch', 'Vier Tunnel, Rückwärts-Weiche, drei Loopings. Raum und Zeit verbiegen sich.', {
    goals: [g('tunnels', 4), el('reverse', 1), g('loops', 3)], width: 270, physics: space,
    terrain: [mountain(40, 30, 18), mountain(105, 30, 18), mountain(170, 30, 18), mountain(235, 30, 18)],
    coins: [...ring(72, 12, 7, 5), ...ring(137, 12, 7, 5), ...ring(202, 12, 7, 5)],
  }),
  L('Sternenstaub', 'Vierzig Coins über acht Kurven.', {
    goals: [g('coins', 40), g('turns', 8)], width: 270, physics: space,
    coins: [...row(10, 260, 6, 10, 0), ...row(20, 250, 9, 8, 1), ...row(20, 250, 9, 8, -1), ...row(30, 240, 12, 7, 2), ...row(30, 240, 12, 7, -2)],
  }),
  L('Supernova', 'Mindestens 5 g, sechs Loopings, 180 km/h. Explosiv.', {
    goals: [g('minG', 5), g('loops', 6), g('speed', 180)], width: 280, physics: space,
    coins: [...ring(40, 11, 6, 4), ...ring(85, 11, 6, 4), ...ring(130, 11, 6, 4), ...ring(175, 11, 6, 4), ...ring(220, 11, 6, 4), ...ring(265, 11, 6, 4)],
  }),
  L('Galaxie-Tour', '700 Meter in 80 Sekunden: die längste Fahrt des Spiels.', {
    goals: [g('length', 700), g('time', 80)], width: 300, physics: space, coins: [...row(10, 290, 6, 12, 0), ...row(20, 280, 12, 10, 1)],
  }),
  L('Schwarzes Loch', 'Zwei Cobra Rolls, zwei Immelmanns, vier Schleifen.', {
    goals: [el('cobraRoll', 2), el('immelmann', 2), g('rolls', 4)], width: 290, physics: space, coins: [...arc(70, 12, 24, 7), ...arc(220, 12, 24, 7)],
  }),
  L('Raketenstart', 'Hydro-Launch, drei Booster, 120 Meter, 220 km/h.', {
    goals: [el('hydroLaunch', 1), g('boosters', 3), g('height', 120), g('speed', 220)], width: 300, physics: space, coins: col(150, 20, 116, 9),
  }),
  L('Trauma Coaster', 'Das Finale: 130 Meter, sechs Loopings, vier Schleifen, acht Kurven, vier Tunnel, Splash, Launch, 50 Coins. Die Bahn aller Bahnen.', {
    goals: [g('height', 130), g('loops', 6), g('rolls', 4), g('turns', 8), g('tunnels', 4), g('splash', 1), g('launch'), g('coins', 50), bonus('speed', 230), bonus('airtime', 8)],
    width: 340, physics: space, passengers: 16, cars: 8,
    terrain: [mountain(50, 40, 24), mountain(130, 40, 24), mountain(210, 40, 24), mountain(290, 40, 24), lake(170, 30), prop(170, 'spaceBuilding', 2)],
    coins: [...col(170, 40, 126, 9), ...ring(30, 12, 7, 5), ...ring(90, 12, 7, 5), ...ring(170, 12, 7, 5), ...ring(250, 12, 7, 5), ...ring(320, 12, 7, 5),
      ...row(10, 330, 8, 12, 1), ...row(10, 330, 8, 12, -1)],
  }),
];

export const LEVELS: LevelDef[] = [...W1, ...W2, ...W3, ...W4, ...W5, ...W6, ...W7, ...W8, ...W9, ...W10];

if (LEVELS.length !== 150) {
  throw new Error(`Erwartet 150 Level, gefunden: ${LEVELS.length}`);
}

export function getLevel(id: number): LevelDef {
  const lvl = LEVELS[id - 1];
  if (!lvl || lvl.id !== id) throw new Error(`Level ${id} nicht gefunden`);
  return lvl;
}

/** Alle Elemente, die bis einschließlich Level `id` freigeschaltet sind (Grundausstattung inklusive). */
export function unlockedUpTo(highestCompleted: number): Set<ElementId> {
  const set = new Set<ElementId>(['draw', 'chainlift', 'skinWood']);
  for (const lvl of LEVELS) {
    if (lvl.id > highestCompleted) break;
    lvl.unlocks?.forEach((u) => set.add(u));
  }
  return set;
}
