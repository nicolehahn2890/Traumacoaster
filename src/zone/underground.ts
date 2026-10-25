/**
 * Untergrund (Etappe 2, Schritt 7; Plan 5.2, 2.1, 2.3, Richtlinie 4): Räume sind Höhlenkästen unter dem Boden. Ein Raum
 * ist „offen ab Stufe“ (`openFrom`); davor liegt der Deckel geschlossen (der Raum ist unsichtbar, nicht im
 * Festigkeitsfeld, der Boden darüber geschlossen). Ab der Stufe, oder nach einer Freilegung durch eine Baustelle in
 * dieser Sitzung, ist der Deckel weg: Loch im Boden über dem Raum, Fenster im Erdschnitt davor, die Bahn darf über den
 * Raum hinab und der Pinsel sieht dort den Raumboden als Boden. Reine Daten und Funktionen.
 */
import { LANE_DEPTH, type StagePoint } from '@/track/stage';
import { ROOM_DIVE, ROOM_MARGIN, type RoomHit } from '@/track/brushTrack';
import { kindDefaults, type ZoneElement } from './types';

/** offener Raum mit seiner Ausdehnung (x, Spuren) und Boden/Decke (Höhe) */
export interface Room {
  id: string;
  x0: number;
  x1: number;
  lane0: number;
  lane1: number;
  /** Boden und Decke (Meter) */
  y0: number;
  y1: number;
}

/** Loch im Boden und Fenster im Erdschnitt für einen offenen Raum */
export interface GroundHole {
  x0: number;
  x1: number;
  lane0: number;
  lane1: number;
  y0: number;
  y1: number;
}

/** ist der Raum zur Fortschrittsstufe offen (ohne Angabe: immer) */
export const roomOpen = (el: ZoneElement, stage: number): boolean => el.kind === 'cave' && (el.openFrom ?? 0) <= stage;

/** offene Räume der Zone zur Fortschrittsstufe (Infinity: alle) */
export function openRooms(elements: readonly ZoneElement[], stage: number): Room[] {
  const out: Room[] = [];
  for (const el of elements) {
    if (!roomOpen(el, stage)) continue;
    const d = el.d ?? kindDefaults(el.kind).d ?? 8;
    const half = d / 2 / LANE_DEPTH;
    out.push({ id: el.id, x0: el.x - el.w / 2, x1: el.x + el.w / 2, lane0: el.z - half, lane1: el.z + half, y0: el.y, y1: el.y + el.h });
  }
  return out;
}

/** Raum, dessen Grundfläche (x, Spur) den Punkt enthält, sonst null */
export function roomAt(rooms: readonly Room[], x: number, lane: number): Room | null {
  for (const r of rooms) if (x >= r.x0 && x <= r.x1 && lane >= r.lane0 && lane <= r.lane1) return r;
  return null;
}

/** Bodenhöhe für den Pinsel: über einem offenen Raum der Raumboden, sonst der Boden der Welt */
export function groundWithRooms(base: (x: number, lane: number) => number, rooms: readonly Room[]): (x: number, lane: number) => number {
  if (!rooms.length) return base;
  return (x, lane) => {
    const r = roomAt(rooms, x, lane);
    return r ? r.y0 + 0.05 : base(x, lane);
  };
}

/**
 * Treffer eines Bühnenpunkts über der Grundfläche eines offenen Raums unter dem Boden (Tor 2b): Liegt der Strahl auf der
 * Raummitte unter der Oberfläche, taucht die Bahn in den Raum, und z0 … z1 sind die Spuren, in denen sie zwischen Raumboden
 * (1 m darüber) und Oberfläche bleibt (der Deckel ist weg, der Raum ist bis zur Oberfläche offen; `ROOM_MARGIN` Abstand zu den Wänden); ist der Strich unter dem
 * Raumboden gemalt, sind es alle Spuren des Raums (den Boden hebt der Pinsel an). Darüber fährt die Bahn über das Loch.
 * null über keinem Raum; ein Kasten über dem Boden ist kein Loch und zählt nicht.
 */
export function roomLanes(rooms: readonly Room[], p: StagePoint, toWorld: (p: StagePoint, lane: number) => { x: number; y: number }, surface: (x: number, lane: number) => number): RoomHit | null {
  for (const r of rooms) {
    const center = (r.lane0 + r.lane1) / 2;
    const mid = toWorld(p, center);
    if (mid.x < r.x0 || mid.x > r.x1) continue;
    const s = surface(mid.x, center);
    if (r.y1 > s + 0.5) continue;
    const h = mid.y - s;
    let z0 = r.lane0 + ROOM_MARGIN;
    let z1 = Math.max(z0, r.lane1 - ROOM_MARGIN);
    if (h < -ROOM_DIVE) {
      let a = Infinity;
      let b = -Infinity;
      for (let lane = z0; lane <= z1 + 1e-9; lane += 0.05) {
        const w = toWorld(p, lane);
        if (w.y < r.y0 + 1 || w.y > s - ROOM_DIVE) continue;
        a = Math.min(a, lane);
        b = Math.max(b, lane);
      }
      if (a <= b) {
        z0 = a;
        z1 = b;
      }
    }
    return { z0, z1, center, h, floor: r.y0 + 0.05, surface: s };
  }
  return null;
}

/** Löcher im Boden und Fenster im Erdschnitt der offenen Räume, die unter dem Boden liegen */
export function groundHoles(rooms: readonly Room[], groundY: (x: number) => number = () => 0): GroundHole[] {
  return rooms
    .filter((r) => r.y1 <= groundY((r.x0 + r.x1) / 2) + 0.5)
    .map((r) => ({ x0: r.x0, x1: r.x1, lane0: r.lane0, lane1: r.lane1, y0: r.y0, y1: Math.min(r.y1, groundY((r.x0 + r.x1) / 2) - 0.3) }));
}
