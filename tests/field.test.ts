import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, toStage, type StagePoint } from '@/track/stage';
import { BOX_WALL, FIELD_MARGIN, FreeField, ROOF, WALL_HALF } from '@/zone/field';
import type { ZoneElement } from '@/zone/types';

/** Dreiteiler wie in der Prüfzone: 24 × 14 m, 7,5 m dick auf Spur 1, Fenster bei 4 m Höhe */
const slab: ZoneElement = { id: 'e1', kind: 'threePart', x: 85, y: 0, z: 1, w: 24, h: 14, d: 7.5, openings: [{ dx: 0, dy: 4, r: 2.4 }] };
const column: ZoneElement = { id: 'e2', kind: 'column', x: 50, y: 0, z: 0, w: 2, h: 10 };
const room: ZoneElement = { id: 'e4', kind: 'cave', x: 140, y: -14, z: -1, w: 24, h: 10, d: 12, openFrom: 2 };
const box: ZoneElement = { id: 'e5', kind: 'cave', x: 200, y: 0, z: 0, w: 20, h: 8, d: 10 };
const flat: ZoneElement = { id: 'e6', kind: 'flat', x: 20, y: 0, z: 2, w: 8, h: 6 };
const toWorld = (p: StagePoint, lane: number) => rayToWorld(p, lane);
const half = 7.5 / 2 / LANE_DEPTH;
const lip = 1 - half;
const back = 1 + half;

describe('Freiraumfeld (Tor 2b, Plan Paket 5)', () => {
  it('Erde ist fest, Luft frei; ein offener Raum ist frei bis zur Oberfläche, ein geschlossener bleibt Erde', () => {
    const open = new FreeField([room], 2, () => 0);
    expect(open.solid(140, -1, -1)).toBe(false);
    expect(open.solid(140, -9, -1)).toBe(false);
    expect(open.solid(140, -14.5, -1)).toBe(true);
    expect(open.solid(127, -9, -1)).toBe(true);
    expect(open.solid(140, -9, 0.5)).toBe(true);
    expect(open.solid(100, 2, 0)).toBe(false);
    expect(open.solid(100, -0.5, 0)).toBe(true);
    expect(open.solidKind(100, -0.5, 0)).toBe('earth');
    expect(open.caveAt(140, -9, -1)).toEqual({ id: 'e4', center: -1 });
    expect(open.caveAt(140, 1, -1)).toBeNull();
    const closed = new FreeField([room], 1, () => 0);
    expect(closed.solid(140, -9, -1)).toBe(true);
    expect(closed.empty).toBe(true);
    expect(new FreeField([flat], 0, () => 0).empty).toBe(true);
  });

  it('Dreiteiler: Lippe, Rückwand und Dach fest, Innenraum frei und Höhle (Flanken offen), Fenster frei; Säule und Kasten', () => {
    const f = new FreeField([slab, column, box], 0, () => 0);
    expect(f.solid(85, 8, lip)).toBe(true);
    expect(f.solid(85, 4, lip)).toBe(false);
    expect(f.solid(85, 4, back)).toBe(true);
    expect(f.solid(85, 8, 1)).toBe(false);
    expect(f.solidKind(85, 8, 1)).toBe('none');
    expect(f.caveAt(85, 8, 1)).toEqual({ id: 'e1', center: 1 });
    // Dach (2 m unter der Oberkante) ist fest, die Flanken sind offen (Platzhalter wie bei den Bergen der Level)
    expect(f.solid(73.5, 8, 1)).toBe(false);
    expect(f.solid(85, 14 - ROOF + 0.5, 1)).toBe(true);
    expect(f.solid(85, 14 - ROOF - 0.5, 1)).toBe(false);
    // außerhalb des Umrisses und der Dicke frei
    expect(f.solid(60, 8, lip)).toBe(false);
    expect(f.solid(85, 15, 1)).toBe(false);
    expect(f.solid(85, 8, lip - WALL_HALF - 0.05)).toBe(false);
    expect(f.solid(85, 8, back + WALL_HALF + 0.05)).toBe(false);
    // Säule: Radius 1 m, 10 m hoch
    expect(f.solid(50, 5, 0)).toBe(true);
    expect(f.solid(51.5, 5, 0)).toBe(false);
    expect(f.solid(50, 11, 0)).toBe(false);
    // Höhlenkasten über dem Boden: Seitenwände und Boden fest, Raum frei, Decke offen
    expect(f.solid(200 - 10, 4, 0)).toBe(true);
    expect(f.solid(200, BOX_WALL / 2, 0)).toBe(true);
    expect(f.solid(200, 4, 0)).toBe(false);
    expect(f.solid(200, 9, 0)).toBe(false);
  });

  it('freie Abschnitte am Strahl: vor dem Berg frei, im Fenster der Innenraum als anziehende Höhle, im Fels nichts', () => {
    const f = new FreeField([slab], 0, () => 0);
    // Strahl durch das Fenster (Bildhöhe 8 bei x 85): Luft davor, Innenraum (Höhle, zieht an), Rückwand, Luft dahinter, Erde
    const win = f.freeLanes(toStage(85, 8, 0), toWorld, 0.8);
    expect(win.touched).toBe(true);
    expect(win.fallback).toBeNull();
    expect(win.intervals.length).toBe(3);
    expect(win.intervals[0].cave).toBeNull();
    expect(win.intervals[0].a).toBeCloseTo(-2, 6);
    expect(win.intervals[0].b).toBeLessThan(lip + WALL_HALF + 0.06);
    expect(win.intervals[1].cave).toBe('e1');
    expect(win.intervals[1].attract).toBe(true);
    expect(win.intervals[1].a).toBeGreaterThan(lip + WALL_HALF - 0.06);
    expect(win.intervals[1].b).toBeLessThan(back - WALL_HALF + 0.06);
    expect(win.intervals[2].cave).toBeNull();
    expect(win.intervals[2].a).toBeGreaterThan(back + WALL_HALF - 0.06);
    // Strahl über dem Fenster (Bildhöhe 10,5): die Lippe trennt Luft und Innenraum
    const over = f.freeLanes(toStage(85, 10.5, 0), toWorld, 0.8);
    expect(over.intervals.length).toBe(3);
    expect(over.intervals[0].b).toBeLessThan(lip - WALL_HALF + 0.06);
    expect(over.intervals[1].a).toBeGreaterThan(lip + WALL_HALF - 0.06);
    // weit vor dem Berg: ein Abschnitt bis zur Erde
    const free = f.freeLanes(toStage(40, 8, 0), toWorld, 0.8);
    expect(free.touched).toBe(false);
    expect(free.intervals.length).toBe(1);
    expect(free.intervals[0].a).toBeCloseTo(-2, 6);
    // knapp unter der vordersten Bodenlinie gemalt: vorn noch frei (die Bahn wird angehoben), weiter hinten Erde
    const low = f.freeLanes(toStage(40, -0.5, -2), toWorld, 0.8);
    expect(low.intervals.length).toBe(1);
    expect(low.intervals[0].a).toBeCloseTo(-2, 6);
    expect(low.intervals[0].b).toBeLessThan(-1.5);
    // tief unter der vordersten Bodenlinie: kein freier Abschnitt, Notspur vorn
    const deep = f.freeLanes(toStage(40, -3, -2), toWorld, 0.8);
    expect(deep.intervals).toEqual([]);
    expect(deep.fallback).toBeCloseTo(-2, 6);
    // im Fels einer hohen Säule über alle Spuren: nichts frei und keine Notspur (blockiert)
    const wall = new FreeField([{ ...column, x: 85, w: 60, h: 40 }], 0, () => 0);
    const blocked = wall.freeLanes(toStage(85, 5, 0), toWorld, 0.8);
    expect(blocked.intervals).toEqual([]);
    expect(blocked.fallback).toBeNull();
  });

  it('Raum: über dem Loch ist der Strahl frei (Brücke, Höhle darunter gemeldet), tief genug liegt er in der Höhle', () => {
    const f = new FreeField([room], 2, () => 0);
    const bridge = f.freeLanes(toStage(140, 3, -1), toWorld, 0.8);
    expect(bridge.intervals.some((iv) => iv.cave)).toBe(false);
    expect(bridge.below).not.toBeNull();
    expect(bridge.below!.center).toBe(-1);
    expect(bridge.below!.h).toBeCloseTo(3, 6);
    const dive = f.freeLanes(toStage(140, -9, -1), toWorld, 0.8);
    const cave = dive.intervals.find((iv) => iv.cave === 'e4')!;
    expect(cave).toBeDefined();
    expect(cave.attract).toBe(true);
    expect(cave.a).toBeGreaterThanOrEqual(-1 - 12 / 2 / LANE_DEPTH - 1e-6);
    expect(cave.b).toBeLessThanOrEqual(-1 + 12 / 2 / LANE_DEPTH + 1e-6);
    expect(dive.below).toBeNull();
    // knapp unter der Oberfläche: der Abschnitt davor (Luft über dem Boden) grenzt an die Höhle, dort kann die Kette wechseln
    const edge = f.freeLanes(toStage(140, -1.8, -1), toWorld, 0.8);
    const edgeCave = edge.intervals.find((iv) => iv.cave === 'e4')!;
    expect(edgeCave.attract).toBe(true);
    expect(edge.intervals[0].cave).toBeNull();
    expect(edge.intervals[0].b).toBeCloseTo(edgeCave.a - 0.05, 6);
    expect(FIELD_MARGIN).toBeGreaterThan(0);
  });

  it('tragende Fläche unter einem Punkt und Decke darüber', () => {
    const f = new FreeField([slab, room], 2, () => 0);
    expect(f.floorBelow(40, 8, 0)).toMatchObject({ y: expect.closeTo(0, 1), kind: 'ground' });
    expect(f.floorBelow(85, 20, 1)).toMatchObject({ y: expect.closeTo(14, 1), kind: 'rock' });
    expect(f.floorBelow(140, -6, -1)).toMatchObject({ y: expect.closeTo(-14, 1), kind: 'cave' });
    expect(f.floorBelow(140, 3, 0.5)).toMatchObject({ kind: 'ground' });
    expect(f.ceilingAbove(85, 6, 1)).toBe(true);
    expect(f.ceilingAbove(40, 6, 0)).toBe(false);
    expect(f.ceilingAbove(140, -9, -1)).toBe(false);
  });
});
