import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { KIND_DEFAULTS, ZONE_KINDS, emptyZone, newElement, newElementId, parseZone, serializeZone, type ZoneFile } from '@/zone/types';
import { buildZoneElement } from '@/zone/build';

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
