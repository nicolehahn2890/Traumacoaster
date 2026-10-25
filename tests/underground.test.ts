import { describe, expect, it } from 'vitest';
import { LANE_DEPTH } from '@/track/stage';
import { Terrain } from '@/physics/terrain';
import { CanvasTexture } from 'three';
import { buildGround } from '@/world/ground';
import { RockField } from '@/zone/rock';
import { siteTarget, withSiteOpenings } from '@/zone/sites';
import { emptyZone, parseZone, serializeZone, type ZoneElement, type ZoneSite } from '@/zone/types';
import { groundHoles, groundWithRooms, openRooms, roomAt, roomLanes, roomOpen } from '@/zone/underground';
import { rayToWorld, toStage, type StagePoint } from '@/track/stage';
import { planBrushTrack } from '@/track/brushTrack';

const room: ZoneElement = { id: 'e4', kind: 'cave', x: 140, y: -14, z: -1, w: 24, h: 10, d: 12, openFrom: 2 };
const always: ZoneElement = { id: 'e5', kind: 'cave', x: 60, y: -12, z: 0, w: 20, h: 8, d: 10 };
const slab: ZoneElement = { id: 'e1', kind: 'threePart', x: 85, y: 0, z: 1, w: 24, h: 14, d: 7.5 };
const half = 12 / 2 / LANE_DEPTH;

describe('Untergrund: Räume offen ab Stufe, Looks je Stufe (Etappe 2, Schritt 7)', () => {
  it('ein Raum ist ab seiner Stufe offen, ohne Angabe immer; offene Räume kennen Grundfläche, Boden und Decke', () => {
    expect(roomOpen(room, 1)).toBe(false);
    expect(roomOpen(room, 2)).toBe(true);
    expect(roomOpen(always, 0)).toBe(true);
    expect(roomOpen(slab, 9)).toBe(false);
    expect(openRooms([room, always, slab], 1).map((r) => r.id)).toEqual(['e5']);
    const rooms = openRooms([room, always, slab], 2);
    expect(rooms.map((r) => r.id)).toEqual(['e4', 'e5']);
    expect(rooms[0]).toMatchObject({ x0: 128, x1: 152, y0: -14, y1: -4 });
    expect(rooms[0].lane0).toBeCloseTo(-1 - half, 6);
    expect(rooms[0].lane1).toBeCloseTo(-1 + half, 6);
    expect(roomAt(rooms, 140, -1)?.id).toBe('e4');
    expect(roomAt(rooms, 140, 1)).toBeNull();
    expect(roomAt(rooms, 100, -1)).toBeNull();
    // Boden des Pinsels: über dem Raum der Raumboden, sonst der Boden der Welt
    const ground = groundWithRooms(() => 0, rooms);
    expect(ground(140, -1)).toBeCloseTo(-13.95, 6);
    expect(ground(100, -1)).toBe(0);
    expect(groundWithRooms(() => 3, [])(1, 1)).toBe(3);
    // Löcher nur für Räume unter dem Boden, Fenster bis knapp unter die Oberfläche
    const holes = groundHoles(rooms);
    expect(holes).toHaveLength(2);
    expect(holes[0]).toMatchObject({ x0: 128, x1: 152, y0: -14, y1: -4 });
    const high: ZoneElement = { ...always, id: 'e6', y: 0 };
    expect(groundHoles(openRooms([high], 0))).toHaveLength(0);
  });

  it('Zonendatei: openFrom nur beim Raum, Looks je Stufe; Unsinn fällt weg', () => {
    const zone = emptyZone('x');
    zone.elements.push({ ...room }, { ...slab, openFrom: 3 });
    zone.looks = ['day', 'dusk', 'night'];
    const text = serializeZone(zone);
    const back = parseZone(JSON.parse(text))!;
    expect(back.elements.find((e) => e.id === 'e4')!.openFrom).toBe(2);
    expect(back.elements.find((e) => e.id === 'e1')!.openFrom).toBeUndefined();
    expect(back.looks).toEqual(['day', 'dusk', 'night']);
    expect(serializeZone(back)).toBe(text);
    const odd = parseZone({ version: 1, name: 'x', looks: ['day', 'disco', 'neon'], elements: [{ id: 'e1', kind: 'cave', x: 0, y: -10, z: 0, w: 10, h: 6, openFrom: -1 }] })!;
    expect(odd.looks).toEqual(['day', 'neon']);
    expect(odd.elements[0].openFrom).toBeUndefined();
    expect(serializeZone(emptyZone('leer'))).not.toContain('"looks"');
  });

  it('Festigkeitsfeld: ein geschlossener Raum fehlt, ein offener hat Wände und Boden, aber keine Decke (Deckel weg)', () => {
    expect(new RockField([room], 1).empty).toBe(true);
    const open = new RockField([room], 2);
    expect(open.empty).toBe(false);
    expect(open.solid(128, -9, -1)).toBe(true);
    expect(open.solid(140, -14, -1)).toBe(true);
    expect(open.solid(140, -4.2, -1)).toBe(false);
    expect(open.solid(140, -9, -1)).toBe(false);
    expect(open.tunnel(140, -9, -1)).toBe(true);
  });

  it('eine Verbinden-Baustelle über einem Raum zielt auf den Raum; offen nimmt sie ihm den Deckel', () => {
    const site: ZoneSite = { id: 'b3', x: 140, y: 0, z: -1, variant: 'connect' };
    expect(siteTarget([slab, room], site)?.id).toBe('e4');
    const derived = withSiteOpenings([slab, room], [site], new Set(['b3']));
    expect(derived[1].openFrom).toBe(0);
    expect(room.openFrom).toBe(2);
    expect(openRooms(derived, 1).map((r) => r.id)).toEqual(['e4']);
    expect(withSiteOpenings([slab, room], [site], new Set())[1]).toBe(room);
  });

  it('der Pinsel taucht in einen offenen Raum ab: unter der Oberfläche über dem Raum bleibt die Tiefe in dessen Spuren', () => {
    const rooms = openRooms([room], 2);
    const toWorld = (p: StagePoint, lane: number) => rayToWorld(p, lane);
    const surface = () => 0;
    // ein Punkt 9 m unter dem Boden über dem Raum: nur Spuren des Raums kommen infrage
    const inRoom = roomLanes(rooms, toStage(140, -9, -1), toWorld, surface)!;
    expect(inRoom).not.toBeNull();
    expect(inRoom.z0).toBeGreaterThanOrEqual(-1 - half);
    expect(inRoom.z1).toBeLessThanOrEqual(-1 + half);
    expect(roomLanes(rooms, toStage(140, 5, -1), toWorld, surface)).toBeNull();
    expect(roomLanes(rooms, toStage(100, -9, -1), toWorld, surface)).toBeNull();
    // Strich: flach über dem Boden, dann hinab in den Raum und darin weiter
    const pts: StagePoint[] = [];
    for (let x = 60; x <= 120; x += 2) pts.push(toStage(x, 3, -1));
    for (let k = 1; k <= 10; k++) pts.push(toStage(120 + k * 1.4, 3 - k * 1.2, -1));
    for (let x = 136; x <= 150; x += 2) pts.push(toStage(x, -9, -1));
    const plan = planBrushTrack(pts, { ground: groundWithRooms(() => 0, rooms), underground: (p) => roomLanes(rooms, p, toWorld, surface) })!;
    expect(plan.rock).toEqual([]);
    let inside = 0;
    plan.pts.forEach((p) => {
      if (p.x < 137 || p.x > 150) return;
      inside++;
      const lane = p.z / LANE_DEPTH;
      expect(lane).toBeGreaterThanOrEqual(-1 - half - 1e-6);
      expect(lane).toBeLessThanOrEqual(-1 + half + 1e-6);
      expect(p.y).toBeLessThan(-4);
      expect(p.y).toBeGreaterThan(-14);
    });
    expect(inside).toBeGreaterThan(3);
  });

  it('Boden und Erdschnitt bekommen über und vor offenen Räumen Löcher und Fenster', () => {
    const terrain = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] });
    const tex = () => new CanvasTexture({ width: 2, height: 2 } as unknown as HTMLCanvasElement);
    const closed = buildGround(terrain, tex(), tex());
    const rooms = openRooms([room], 2);
    const holed = buildGround(terrain, tex(), tex(), groundHoles(rooms));
    expect(holed.ground.geometry.getIndex()!.count).toBeLessThan(closed.ground.geometry.getIndex()!.count);
    expect(holed.cut.geometry.getAttribute('position').count).toBeGreaterThan(closed.cut.geometry.getAttribute('position').count);
    closed.dispose();
    holed.dispose();
  });
});
