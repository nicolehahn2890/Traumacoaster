import { describe, expect, it } from 'vitest';
import { ABILITY_UNLOCK, DEFAULT_UPGRADES, START_ABILITIES, ZONE_ABILITIES, allowedStarts, describeAbilities, formatFieldLine, formatStageLine, parseFieldLine, parseStageLine, resolveAbilities, zoneUnlocks, zoneUpgrades } from '@/zone/abilities';
import { emptyZone, newField, parseZone, serializeZone } from '@/zone/types';
import { unlockedUpTo } from '@/levels/levels';

describe('Fähigkeiten als Schalter (Etappe 2, Schritt 1)', () => {
  it('Vorbelegung: fünf Stufen, Stufe i hat den Gurt i (die Aufwertungsstufe aus Etappe 1 bedeutet dasselbe), die letzte kann alles', () => {
    expect(DEFAULT_UPGRADES).toHaveLength(5);
    DEFAULT_UPGRADES.forEach((u, i) => expect(u.belt).toBe(i));
    expect([...DEFAULT_UPGRADES[4].abilities].sort()).toEqual([...ZONE_ABILITIES].sort());
    expect(DEFAULT_UPGRADES[4].chain).toBeUndefined();
    expect(DEFAULT_UPGRADES[0].abilities).toEqual(['chainlift']);
    // jede Fähigkeit steuert genau eine Freischaltung des Level-Modells
    expect(new Set(Object.values(ABILITY_UNLOCK)).size).toBe(ZONE_ABILITIES.length);
    expect(zoneUpgrades(emptyZone('x'))).toBe(DEFAULT_UPGRADES);
  });

  it('ohne Feld kann die Zone alles; ein Feld nimmt seine Stufe und überschreibt einzelne Schalter', () => {
    const zone = emptyZone('basiszone');
    const all = resolveAbilities(zone, null);
    expect(all.abilities.size).toBe(ZONE_ABILITIES.length);
    expect(all.belt).toBeUndefined();
    expect(all.chain).toBeUndefined();
    expect(all.budget).toBe(0);
    const f = newField(zone, 0, 0, 100, 40);
    f.upgrade = 1;
    f.on = ['launch'];
    f.off = ['brake'];
    f.budget = 400;
    f.maxHeight = 35;
    const res = resolveAbilities(zone, f);
    expect([...res.abilities].sort()).toEqual(['booster', 'chainlift', 'launch']);
    expect(res.belt).toBe(1);
    expect(res.chain).toBe(24);
    expect(res.stageIndex).toBe(1);
    expect(res.budget).toBe(400);
    expect(res.maxHeight).toBe(35);
    // Gurt und Kette des Felds gehen vor der Stufe; eine Stufe jenseits der Tabelle ist die letzte
    f.belt = 4;
    f.chain = 60;
    f.upgrade = 99;
    const top = resolveAbilities(zone, f);
    expect(top.stageIndex).toBe(4);
    expect(top.belt).toBe(4);
    expect(top.chain).toBe(60);
    expect(top.abilities.has('brake')).toBe(false);
    // Feld ohne Stufe: alles, Gurt wie die Welt
    const free = resolveAbilities(zone, newField(zone, 0, 0, 100, 40));
    expect(free.abilities.size).toBe(ZONE_ABILITIES.length);
    expect(free.belt).toBeUndefined();
  });

  it('Freischaltungen der Zone: nie „Boden formen“, aus geschaltete Fähigkeiten fehlen, Startarten in Knopf-Reihenfolge', () => {
    const zone = emptyZone('basiszone');
    const everything = unlockedUpTo(150);
    expect(everything.has('mountain')).toBe(true);
    const all = zoneUnlocks(everything, resolveAbilities(zone, null));
    expect(all.has('mountain')).toBe(false);
    expect(all.has('tunnel')).toBe(true);
    expect(all.has('draw')).toBe(true);
    const f = newField(zone, 0, 0, 100, 40);
    f.upgrade = 0;
    f.on = ['hydro'];
    const res = resolveAbilities(zone, f);
    const some = zoneUnlocks(everything, res);
    expect(some.has('chainlift')).toBe(true);
    expect(some.has('hydroLaunch')).toBe(true);
    expect(some.has('launch')).toBe(false);
    expect(some.has('tunnel')).toBe(false);
    expect(some.has('roll')).toBe(false);
    expect(some.has('doubleLaunch')).toBe(false);
    expect(allowedStarts(res)).toEqual(['chainlift', 'hydro']);
    expect(START_ABILITIES).toEqual(['chainlift', 'launch', 'hydro', 'swing', 'verticalLift']);
  });

  it('Zeile einer Stufe: genannte Schalter an, Gurt, Kette (oder frei), Wagen, Name; Umkehrung stimmt, Unbekanntes wird gemeldet', () => {
    const { upgrade, unknown } = parseStageLine('kettenzug Launch booster bremse, gurt 2, kette 32, wagen rot, name Bügel, quatsch');
    expect(upgrade).toEqual({ name: 'Bügel', abilities: ['chainlift', 'launch', 'booster', 'brake'], belt: 2, chain: 32, car: 'rot' });
    expect(unknown).toEqual(['quatsch']);
    expect(parseStageLine(formatStageLine(upgrade)).upgrade).toEqual(upgrade);
    // kette frei löscht die Grenze, die Vorlage liefert Name und Gurt, wenn die Zeile sie nicht nennt
    const free = parseStageLine('kettenzug pendel lift block rolle tunnel, kette frei', DEFAULT_UPGRADES[2]).upgrade;
    expect(free.chain).toBeUndefined();
    expect(free.belt).toBe(2);
    expect(free.name).toBe('Bügel');
    expect(free.abilities).toEqual(['chainlift', 'swing', 'verticalLift', 'launchBlock', 'roll', 'tunnel']);
    expect(formatStageLine(free)).toBe('kettenzug pendel vertikallift launchblock rolle tunnel, gurt 2, kette frei, name Bügel');
    expect(parseStageLine('').upgrade).toEqual({ abilities: [], belt: 0 });
    expect(parseStageLine('gurt 9').upgrade.belt).toBe(4);
  });

  it('Zeile eines Felds: +wort an, -wort aus (an gewinnt), Gurt, Kette, Budget, Höhe; Umkehrung stimmt', () => {
    const { overrides, unknown } = parseFieldLine('+launch -tunnel -launch hydro, gurt 3, kette 40, budget 400, höhe 35, kette2');
    expect(overrides).toEqual({ on: ['launch', 'hydro'], off: ['tunnel'], belt: 3, chain: 40, budget: 400, maxHeight: 35 });
    expect(unknown).toEqual(['kette2']);
    const line = formatFieldLine({ on: ['launch'], off: ['tunnel', 'roll'], belt: 1, chain: 20, budget: 300, maxHeight: 25 });
    expect(line).toBe('+launch, -tunnel, -rolle, gurt 1, kette 20, budget 300, höhe 25');
    expect(parseFieldLine(line).overrides).toEqual({ on: ['launch'], off: ['tunnel', 'roll'], belt: 1, chain: 20, budget: 300, maxHeight: 25 });
    // leer und Nullen löschen die Überschreibungen
    expect(parseFieldLine('').overrides).toEqual({});
    expect(parseFieldLine('budget 0, höhe 0, kette 0').overrides).toEqual({});
    expect(parseFieldLine('hoehe 12').overrides).toEqual({ maxHeight: 12 });
    expect(describeAbilities(['tunnel', 'chainlift'])).toBe('kettenzug tunnel');
    expect(describeAbilities([])).toBe('keine');
  });

  it('Tabelle und Überschreibungen überleben Schreiben und Lesen der Zonendatei, Unsinn fällt weg, ohne Tabelle kein Schlüssel', () => {
    const zone = emptyZone('basiszone');
    zone.upgrades = [
      { name: 'Anfang', abilities: ['chainlift'], belt: 0, chain: 14 },
      { abilities: ['chainlift', 'launch', 'booster'], belt: 2, car: 'rot' },
    ];
    const f = newField(zone, 0, 0, 100, 40);
    f.upgrade = 1;
    f.on = ['hydro'];
    f.off = ['booster'];
    f.belt = 3;
    f.chain = 30;
    f.budget = 500;
    f.maxHeight = 45;
    zone.fields.push(f);
    const text = serializeZone(zone);
    const back = parseZone(JSON.parse(text))!;
    expect(back.upgrades).toEqual(zone.upgrades);
    expect(back.fields[0]).toMatchObject({ upgrade: 1, on: ['hydro'], off: ['booster'], belt: 3, chain: 30, budget: 500, maxHeight: 45 });
    expect(serializeZone(back)).toBe(text);
    expect(text.indexOf('"upgrades"')).toBeLessThan(text.indexOf('"elements"'));
    const raw = JSON.parse(text) as { upgrades: Array<Record<string, unknown>>; fields: Array<Record<string, unknown>> };
    raw.upgrades[0].abilities = ['chainlift', 'ufo', 'chainlift'];
    raw.upgrades[0].belt = 9;
    raw.upgrades[0].chain = -1;
    raw.fields[0].on = ['quatsch'];
    raw.fields[0].belt = -3;
    raw.fields[0].budget = 'viel';
    const odd = parseZone(raw)!;
    expect(odd.upgrades![0]).toEqual({ name: 'Anfang', abilities: ['chainlift'], belt: 4 });
    expect(odd.fields[0].on).toBeUndefined();
    expect(odd.fields[0].belt).toBe(0);
    expect(odd.fields[0].budget).toBeUndefined();
    expect(serializeZone(emptyZone('leer'))).not.toContain('"upgrades"');
  });
});
