import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { FIELD_MIN_H, FIELD_MIN_W, KIND_DEFAULTS, ZONE_GOAL_TYPES, ZONE_KINDS, emptyZone, formatGoals, newElement, newElementId, newField, parseGoals, parseZone, serializeZone, type ZoneFile } from '@/zone/types';
import { buildZoneCoins, buildZoneElement, buildZoneQueue, buildZoneSite, buildZoneStation, stationPath, topAt, zoneCoins } from '@/zone/build';
import { coinsOfGroup } from '@/zone/groups';
import { newCoinGroup, newQueue, newSite, newStation } from '@/zone/types';

describe('Zonendatei (Schritt 6)', () => {
  it('leere Zone, neue Elemente mit Platzhalter-Maßen und eindeutigen Kennungen', () => {
    const zone = emptyZone('basiszone');
    expect(zone.version).toBe(1);
    expect(zone.elements).toEqual([]);
    const a = newElement(zone, 'threePart', 40.123, 0.4, 1);
    zone.elements.push(a);
    const b = newElement(zone, 'water', 80, 0, -1);
    zone.elements.push(b);
    expect(a.id).toBe('e1');
    expect(b.id).toBe('e2');
    expect(a.x).toBe(40.12);
    expect(a.w).toBe(KIND_DEFAULTS.find((k) => k.kind === 'threePart')!.w);
    expect(a.d).toBe(7.5);
    expect(b.d).toBe(8);
    zone.elements = [{ ...a, id: 'e2' }, b];
    expect(newElementId(zone)).toBe('e3');
  });

  it('serialisiert deterministisch und liest sich selbst wieder', () => {
    const zone = emptyZone('alpen', 240, 'wood');
    for (const [kind, x, y, z] of [['cave', 100, -20, 0], ['flat', 10, 0, 2], ['portal', 50, 3, -1]] as const) zone.elements.push(newElement(zone, kind, x, y, z));
    zone.elements[1].label = 'Haus';
    const text = serializeZone(zone);
    expect(text.endsWith('\n')).toBe(true);
    expect(serializeZone(zone)).toBe(text);
    const back = parseZone(JSON.parse(text));
    expect(back).not.toBeNull();
    expect(back!.trackType).toBe('wood');
    expect(back!.width).toBe(240);
    expect(back!.elements.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(back!.elements[1].label).toBe('Haus');
    // die Reihenfolge in der Datei folgt der Kennung, egal wie die Liste sortiert war
    const shuffled: ZoneFile = { ...zone, elements: [...zone.elements].reverse() };
    expect(serializeZone(shuffled)).toBe(text);
  });

  it('weist Fremdes zurück und lässt kaputte Elemente weg', () => {
    expect(parseZone(null)).toBeNull();
    expect(parseZone({ version: 2, name: 'x' })).toBeNull();
    expect(parseZone({ version: 1, name: 'Böse Zone' })).toBeNull();
    const z = parseZone({ version: 1, name: 'test', width: -5, trackType: 'quatsch', elements: [{ id: 'a', kind: 'flat', x: 1, y: 2, z: 9, w: 3, h: 4 }, { id: 'a', kind: 'flat', x: 1, y: 2, z: 0, w: 3, h: 4 }, { id: 'b', kind: 'ufo', x: 1, y: 2, z: 0, w: 3, h: 4 }, { id: 'c', kind: 'water', x: 1, y: 'hoch', z: 0, w: 3, h: 4 }] });
    expect(z).not.toBeNull();
    expect(z!.width).toBe(300);
    expect(z!.trackType).toBe('road');
    expect(z!.elements.length).toBe(1);
    expect(z!.elements[0].z).toBe(2.5);
  });

  it('jeder Typ wird zu einem Klötzchen in der Welt', () => {
    const zone = emptyZone('basiszone');
    for (const kind of ZONE_KINDS) {
      const el = newElement(zone, kind, 20, 0, 0);
      zone.elements.push(el);
      const built = buildZoneElement(el);
      let meshes = 0;
      built.group.traverse((o) => {
        if ((o as Mesh).geometry) meshes++;
      });
      expect(meshes).toBeGreaterThan(0);
      expect(built.group.userData).toBeDefined();
      if (kind === 'cave') expect(built.foundation!.surfaceBelow(20, 5, 0)).toEqual({ y: 0, kind: 'cave' });
      if (kind === 'water') expect(built.foundation!.blocks!(20, 0)).toBe(true);
      built.dispose();
    }
  });
});

describe('Zonendatei: Metadaten und Felder (Schritt 7)', () => {
  it('Metadaten überleben Schreiben und Lesen, Unsinn fällt weg', () => {
    const zone = emptyZone('basiszone');
    const el = newElement(zone, 'threePart', 50, 0, 1);
    el.foundation = true;
    el.openings = [{ dx: 0, dy: 3, r: 2.4 }];
    el.anchor = 'tunnel';
    el.growth = 2;
    el.depthRole = 'front';
    zone.elements.push(el);
    const back = parseZone(JSON.parse(serializeZone(zone)))!;
    expect(back.elements[0]).toMatchObject({ foundation: true, openings: [{ dx: 0, dy: 3, r: 2.4 }], anchor: 'tunnel', growth: 2, depthRole: 'front' });
    const bad = parseZone({ version: 1, name: 'x', elements: [{ id: 'e1', kind: 'flat', x: 0, y: 0, z: 0, w: 4, h: 4, anchor: 'ufo', growth: -2, depthRole: 'oben', openings: [{ dx: 1 }] }] })!;
    expect(bad.elements[0].anchor).toBeUndefined();
    expect(bad.elements[0].growth).toBeUndefined();
    expect(bad.elements[0].depthRole).toBeUndefined();
    expect(bad.elements[0].openings).toBeUndefined();
  });

  it('Felder: Mindestmaße, Ecken in beliebiger Reihenfolge, Kennungen f1, f2', () => {
    const zone = emptyZone('basiszone');
    const a = newField(zone, 100, 30, 40, -5);
    zone.fields.push(a);
    expect(a).toMatchObject({ id: 'f1', x0: 40, x1: 100, y0: -5, y1: 30 });
    const b = newField(zone, 10, 10, 12, 11);
    zone.fields.push(b);
    expect(b.id).toBe('f2');
    expect(b.x1 - b.x0).toBe(FIELD_MIN_W);
    expect(b.y1 - b.y0).toBe(FIELD_MIN_H);
    const back = parseZone(JSON.parse(serializeZone(zone)))!;
    expect(back.fields.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(parseZone({ version: 1, name: 'x', fields: [{ id: 'f1', x0: 'a' }] })!.fields).toEqual([]);
  });

  it('Öffnungen kommen in die Lippe, ein Fundament trägt auf der Oberkante', () => {
    const zone = emptyZone('basiszone');
    const el = newElement(zone, 'threePart', 50, 0, 0);
    const solid = buildZoneElement(el);
    el.openings = [{ dx: 0, dy: 4, r: 2.4 }];
    el.foundation = true;
    const holed = buildZoneElement(el);
    const lipVerts = (b: typeof solid) => (b.group.children[1] as Mesh).geometry.getAttribute('position').count;
    expect(lipVerts(holed)).toBeGreaterThan(lipVerts(solid));
    expect(holed.openings).toEqual([{ x: 50, y: 4, r: 2.4 }]);
    expect(holed.foundation!.surfaceBelow(50, 30, 0)).toEqual({ y: 14, kind: 'element' });
    expect(holed.foundation!.surfaceBelow(50, 30, 1)).toBeNull();
    expect(holed.foundation!.surfaceBelow(50, 5, 0)).toBeNull();
    expect(topAt(el, 50)).toBe(14);
    expect(topAt(el, 38.1)).toBeCloseTo(9.86, 1);
    expect(topAt(el, 70)).toBeNull();
    solid.dispose();
    holed.dispose();
  });
});

describe('Zonendatei: Station, Schlange, Baustelle, Coins (Schritt 8)', () => {
  it('Einträge mit eigenen Kennungen überleben Schreiben und Lesen', () => {
    const zone = emptyZone('basiszone');
    const st = newStation(zone, 20, 0, 0);
    zone.stations.push(st);
    st.dir = -1;
    st.length = 18;
    zone.queues.push(newQueue(zone, 40, 0, -1));
    const site = newSite(zone, 90, 2, 1);
    site.variant = 'breakthrough';
    site.energy = 12;
    zone.sites.push(site);
    const c = newCoinGroup(zone, 60, 3, 0);
    c.shape = 'arc';
    zone.coinGroups.push(c);
    expect([st.id, zone.queues[0].id, site.id, c.id]).toEqual(['s1', 'q1', 'b1', 'c1']);
    const back = parseZone(JSON.parse(serializeZone(zone)))!;
    expect(back.stations[0]).toEqual({ id: 's1', x: 20, y: 0, z: 0, dir: -1, length: 18 });
    expect(back.queues[0]).toEqual({ id: 'q1', x0: 30, x1: 40, y: 0, z: -1, dir: 1 });
    expect(back.sites[0]).toEqual({ id: 'b1', x: 90, y: 2, z: 1, variant: 'breakthrough', energy: 12 });
    expect(back.coinGroups[0]).toEqual({ id: 'c1', shape: 'arc', x: 60, y: 3, z: 0, count: 5, spacing: 2 });
    // alte Dateien ohne diese Listen lesen sich leer
    const old = parseZone({ version: 1, name: 'alt', elements: [] })!;
    expect(old.stations).toEqual([]);
    expect(old.coinGroups).toEqual([]);
  });

  it('Coin-Gruppen: Reihe, Bogen, Ring und Säule liefern ihre Zahl an Coins auf der Spur der Gruppe', () => {
    const base = { id: 'c1', x: 50, y: 3, z: 1, count: 5, spacing: 2 } as const;
    const row = coinsOfGroup({ ...base, shape: 'row' });
    expect(row.length).toBe(5);
    expect(row.map((c) => c.x)).toEqual([46, 48, 50, 52, 54]);
    expect(row.every((c) => c.y === 3 && c.lane === 1)).toBe(true);
    const arc = coinsOfGroup({ ...base, shape: 'arc' });
    expect(arc[2].y).toBeCloseTo(5, 6);
    expect(arc[0].y).toBeCloseTo(3, 6);
    const ring = coinsOfGroup({ ...base, shape: 'ring' });
    expect(ring.length).toBe(5);
    for (const c of ring) expect(Math.hypot(c.x - 50, c.y - 5)).toBeCloseTo(2, 1);
    const col = coinsOfGroup({ ...base, shape: 'column' });
    expect(col.map((c) => c.y)).toEqual([3, 5, 7, 9, 11]);
    const zone = emptyZone('basiszone');
    zone.coinGroups.push({ ...base, shape: 'row' }, { ...base, id: 'c2', shape: 'column', count: 2 });
    expect(zoneCoins(zone).length).toBe(7);
  });

  it('Vorgabestück: offene Pinsel-Bahn vom Stationsknoten gerade in Fahrtrichtung', () => {
    const st = { id: 's1', x: 20, y: 1, z: 0.5, dir: -1 as const, length: 14 };
    const p = stationPath(st);
    expect(p.nodes.length).toBe(2);
    expect(p.nodes[0].kind).toBe('station');
    expect(p.nodes[1].x).toBe(6);
    expect(p.nodes[1].y).toBe(1);
    expect(p.nodes[1].z).toBe(0.5);
    expect(p.nodes[0].outX).toBeCloseTo(-14 / 3, 9);
    expect(p.nodes[1].inX).toBeCloseTo(14 / 3, 9);
    expect(p.closed).toBe(false);
    expect(p.brush).toBe(true);
  });

  it('Platzhalter für Station, Schlange, Baustelle und Coins sind Gruppen mit Teilen', () => {
    const zone = emptyZone('basiszone');
    const parts = (b: { group: { traverse(cb: (o: unknown) => void): void } }): number => {
      let n = 0;
      b.group.traverse((o) => {
        if ((o as Mesh).geometry) n++;
      });
      return n;
    };
    // verschmolzen: ein Mesh je Platzhalter, plus eins je durchscheinendem Teil (Freiraum, Durchbruchwand)
    expect(parts(buildZoneStation(newStation(zone, 20, 0, 0)))).toBe(1);
    expect(parts(buildZoneQueue(newQueue(zone, 40, 0, 0)))).toBe(2);
    expect(parts(buildZoneSite({ ...newSite(zone, 60, 0, 0), variant: 'breakthrough' }))).toBe(2);
    expect(parts(buildZoneSite(newSite(zone, 60, 0, 0)))).toBe(1);
    expect(parts(buildZoneCoins(newCoinGroup(zone, 80, 2, 0)))).toBe(1);
    const st = buildZoneStation(newStation(zone, 20, 0, 0));
    expect((st.group.children[0] as Mesh).geometry.getAttribute('position').count).toBeGreaterThan(200);
  });
});

describe('Zonendatei: Ziele, Stufen und Prüfzone (Schritt 9)', () => {
  it('Zielzeile: Typ und Wert, Stern für Bonus, Unbekanntes fällt weg, Umkehrung stimmt', () => {
    expect(ZONE_GOAL_TYPES).toContain('finish');
    expect(ZONE_GOAL_TYPES).not.toContain('element');
    const goals = parseGoals(' finish, height 20 ,*coins 5; quatsch 3, loops');
    expect(goals).toEqual([{ type: 'finish' }, { type: 'height', value: 20 }, { type: 'coins', value: 5, bonus: true }, { type: 'loops' }]);
    expect(formatGoals(goals)).toBe('finish, height 20, *coins 5, loops');
    expect(parseGoals(formatGoals(goals))).toEqual(goals);
    expect(parseGoals('')).toEqual([]);
    // höchstens sechs Ziele
    expect(parseGoals('finish, finish, finish, finish, finish, finish, finish')).toHaveLength(6);
  });

  it('Ziele, Fortschrittsstufe 0 und Gurtstufe eines Felds überleben Schreiben und Lesen, Unsinn fällt weg', () => {
    const zone = emptyZone('basiszone');
    const f = newField(zone, 10, 0, 80, 30);
    f.goals = [{ type: 'finish' }, { type: 'coins', value: 5, bonus: true }];
    f.stage = 0;
    f.upgrade = 4;
    zone.fields.push(f);
    const text = serializeZone(zone);
    const back = parseZone(JSON.parse(text))!;
    expect(back.fields[0].goals).toEqual(f.goals);
    expect(back.fields[0].stage).toBe(0);
    expect(back.fields[0].upgrade).toBe(4);
    expect(serializeZone(back)).toBe(text);
    // ohne Angabe: keine Schlüssel in der Datei
    const plain = emptyZone('basiszone');
    plain.fields.push(newField(plain, 10, 0, 80, 30));
    expect(serializeZone(plain)).not.toContain('"stage"');
    expect(serializeZone(plain)).not.toContain('"goals"');
    // Unsinn: unbekannter Zieltyp fällt weg, die Aufwertungsstufe wird auf 9 begrenzt (Index in die Tabelle), negative Stufe fällt weg
    const raw = JSON.parse(text) as { fields: Array<Record<string, unknown>> };
    raw.fields[0].goals = [{ type: 'quatsch', value: 1 }, { type: 'height', value: 'hoch' }, { type: 'loops', value: 2 }];
    raw.fields[0].upgrade = 12;
    raw.fields[0].stage = -1;
    const odd = parseZone(raw)!;
    expect(odd.fields[0].goals).toEqual([{ type: 'height' }, { type: 'loops', value: 2 }]);
    expect(odd.fields[0].upgrade).toBe(9);
    expect(odd.fields[0].stage).toBeUndefined();
  });

  it('Prüfzone: die Datei liest sich und schreibt sich Zeichen für Zeichen gleich (deterministisches Laden)', () => {
    const text = readFileSync(new URL('../public/zones/probe/zone.json', import.meta.url), 'utf8');
    const zone = parseZone(JSON.parse(text));
    expect(zone).not.toBeNull();
    expect(serializeZone(zone!)).toBe(text);
    expect(zone!.elements.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(zone!.elements[1].growth).toBe(2);
    const f = zone!.fields[0];
    expect(f.goals).toHaveLength(3);
    expect(f.stage).toBe(1);
    expect(f.upgrade).toBe(2);
    // Etappe 2, Schritt 1: eigene Stufentabelle und Überschreibungen des Felds
    expect(zone!.upgrades).toHaveLength(3);
    expect(zone!.upgrades![2].belt).toBe(2);
    expect(f.off).toEqual(['tunnel']);
    expect(f.budget).toBe(400);
    expect(f.maxHeight).toBe(40);
    expect(f.chain).toBe(20);
    expect(zone!.upgrades![2].lift).toBe(15);
    expect([zone!.stations.length, zone!.queues.length, zone!.sites.length, zone!.coinGroups.length]).toEqual([1, 1, 2, 1]);
    expect(zone!.sites[1]).toMatchObject({ variant: 'connect', target: 'e1', r: 2.6 });
  });
});
