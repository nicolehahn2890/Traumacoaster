import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { FIELD_MIN_H, FIELD_MIN_W, KIND_DEFAULTS, ZONE_KINDS, emptyZone, newElement, newElementId, newField, parseZone, serializeZone, type ZoneFile } from '@/zone/types';
import { buildZoneElement, topAt } from '@/zone/build';

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
