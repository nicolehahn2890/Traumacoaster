/**
 * Zonendatei (Etappe 1, Schritt 6 und 7; Plan Paket 2.1): Eine Zone ist ein riesiges Level, aus dem Felder als Level
 * ausgeschnitten werden. Version 1 kennt Maße, den Bahntyp, die Platzhalter-Elemente (Plan 8a.1) mit ihren Metadaten
 * (Fundament, Öffnungen, Anschluss, Wachstumsstufe, Tiefenrolle) und die Felder (Rechtecke in Zonenkoordinaten mit
 * Kamerabegrenzung, Absperrband und Zoom-Grenze „Feld passt ins Bild“); Station, Schlangenbereich, Baustellen, Coins
 * und Ziele je Feld kommen in den Schritten 8 und 9 dazu. Der Editor im Spiel schreibt die Datei nach
 * `public/zones/<name>/zone.json`, das Spiel liest sie von dort (auch auf dem Handy). Etappe 2, Schritt 1: Aufwertungsstufen
 * als Tabelle der Zone und Fähigkeiten als Schalter je Feld (`./abilities.ts`, Plan 3.1 und 2.4).
 */
import { parseTrackType, type TrackType } from '@/world/trackTypes';
import type { BeltLevel, GoalType } from '@/levels/types';
import { COIN_SHAPES, type ZoneCoinGroup } from './groups';
import { ZONE_ABILITIES, type FieldAbilityOverrides, type ZoneAbility, type ZoneUpgrade } from './abilities';
export type { FieldAbilityOverrides, ZoneAbility, ZoneUpgrade } from './abilities';

/** Zielarten, die ein Feld heute eintragen kann (Katalog v1 aus Paket 4.1, soweit der Prüfer sie schon kennt) */
export const ZONE_GOAL_TYPES: readonly GoalType[] = ['finish', 'height', 'coins', 'loops', 'turns', 'tunnels', 'launch', 'chainlift', 'boosters', 'airtime', 'speed', 'length', 'maxLength', 'time', 'maxTime', 'rolls', 'maxG', 'minG', 'splash', 'lanes', 'noBrakes', 'drop', 'eject', 'catch', 'flight'];

export interface ZoneGoal {
  type: GoalType;
  value?: number;
  bonus?: boolean;
}

export type { ZoneCoinGroup } from './groups';

export type ZoneElementKind = 'flat' | 'threePart' | 'column' | 'cave' | 'water' | 'waterfall' | 'portal';
export const ZONE_KINDS: readonly ZoneElementKind[] = ['flat', 'threePart', 'column', 'cave', 'water', 'waterfall', 'portal'];

export interface ZoneElement {
  /** kurz und eindeutig in der Zone (e1, e2, …) */
  id: string;
  kind: ZoneElementKind;
  /** Fußpunkt: x entlang der Bühne, y Höhe (Meter) */
  x: number;
  y: number;
  /** Tiefe in Spuren (−2 vorn … 2 hinten, kontinuierlich) */
  z: number;
  /** Breite und Höhe (Meter); Säule und Portal: w ist der Durchmesser */
  w: number;
  h: number;
  /** Tiefe in Metern (Dreiteiler, Höhlenkasten, Wasser) */
  d?: number;
  color?: string;
  label?: string;
  /** Metadaten (Plan 2.1, 8a.1): tragfähige Oberkante (Stützen dürfen darauf stehen) */
  foundation?: boolean;
  /** Öffnungen in der Vorderlippe (Dreiteiler), relativ zum Fußpunkt, Radius in Metern: dort darf die Bahn hindurch */
  openings?: ZoneOpening[];
  /** Anschlusspunkt des Elements (am Fußpunkt): Station, Tunnelachse, Wasserfallquelle */
  anchor?: ZoneAnchor;
  /** Wachstumsstufe: ab dieser Fortschrittsstufe der Zone ist das Element da (0 = immer) */
  growth?: number;
  /** Tiefenrolle einer Kulisse: Rückwand (hinter der Bahn), Mitte, Vorderlippe (vor der Bahn) */
  depthRole?: ZoneDepthRole;
}

export interface ZoneOpening {
  dx: number;
  dy: number;
  r: number;
}
export type ZoneAnchor = 'station' | 'tunnel' | 'waterfall';
export const ZONE_ANCHORS: readonly ZoneAnchor[] = ['station', 'tunnel', 'waterfall'];
export type ZoneDepthRole = 'back' | 'mid' | 'front';
export const ZONE_DEPTH_ROLES: readonly ZoneDepthRole[] = ['back', 'mid', 'front'];

/** Feld: Rechteck in Zonenkoordinaten (x von x0 bis x1, Höhe von y0 bis y1), aus dem ein Level wird (Plan 2.1, 2.3) */
export interface ZoneField extends FieldAbilityOverrides {
  id: string;
  name?: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Ziele des Levels (höchstens drei Pflicht, Plan 4) */
  goals?: ZoneGoal[];
  /** Fortschrittsstufe der Zone in diesem Level: Elemente mit höherer Wachstumsstufe fehlen; ohne Angabe ist alles da (Plan 2.1) */
  stage?: number;
  /**
   * Aufwertungsstufe der Zone (Index in `upgrades`, Plan 2.4): Satz von Schaltern mit Gurt und Kettenzugstärke; ohne Angabe
   * kann das Feld alles, Gurt wie die Welt. Einzelne Schalter, Gurt, Kette, Budget und Höhenlimit überschreibt das Feld
   * selbst (Plan 3.1, 2.1: FieldAbilityOverrides)
   */
  upgrade?: number;
}

/** Zielzeile „Typ Wert, Typ Wert“ lesen (Editor); unbekannte Typen fallen weg */
export function parseGoals(text: string): ZoneGoal[] {
  const out: ZoneGoal[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const m = /^\s*(\*?)([a-zA-Z]+)\s*([\d.]+)?\s*$/.exec(part);
    if (!m || !(ZONE_GOAL_TYPES as readonly string[]).includes(m[2])) continue;
    const g: ZoneGoal = { type: m[2] as GoalType };
    if (m[3] !== undefined && m[3] !== '') g.value = Number(m[3]);
    if (m[1]) g.bonus = true;
    out.push(g);
  }
  return out.slice(0, 6);
}

/** Zielzeile aus Zielen (Umkehrung von parseGoals): Bonusziele mit Stern */
export function formatGoals(goals: ZoneGoal[]): string {
  return goals.map((g) => `${g.bonus ? '*' : ''}${g.type}${g.value !== undefined ? ` ${g.value}` : ''}`).join(', ');
}

/** Stationsanker (Plan 3.3): Anfang des geraden Vorgabestücks auf der Bahnlinie, Richtung und Länge */
export interface ZoneStation {
  id: string;
  x: number;
  y: number;
  z: number;
  /** 1: Fahrt nach rechts, −1: nach links */
  dir: 1 | -1;
  /** Länge des Vorgabestücks (Meter, Start 14) */
  length: number;
}

/** Schlangenbereich (Plan 6.3): Streifen auf dem Boden mit Reihenfolge (Eingang am Ende in Richtung dir) und Freiraum darüber */
export interface ZoneQueue {
  id: string;
  x0: number;
  x1: number;
  y: number;
  z: number;
  dir: 1 | -1;
}

/** Baustelle (Plan 5.1): Anschlusspunkt, Variante Verbinden oder Durchbruch (mit Mindesttempo) */
export interface ZoneSite {
  id: string;
  x: number;
  y: number;
  z: number;
  variant: 'connect' | 'breakthrough';
  /** Durchbruch: nötiges Tempo (m/s) */
  energy?: number;
}

export interface ZoneFile {
  version: 1;
  name: string;
  /** Breite der Zone in Metern (x von 0 bis width) */
  width: number;
  trackType: TrackType;
  /** Aufwertungsstufen (Plan 2.4): Stufe → Satz von Schaltern; ohne Angabe die Vorbelegung DEFAULT_UPGRADES (abilities.ts) */
  upgrades?: ZoneUpgrade[];
  elements: ZoneElement[];
  fields: ZoneField[];
  stations: ZoneStation[];
  queues: ZoneQueue[];
  sites: ZoneSite[];
  coinGroups: ZoneCoinGroup[];
}

export interface KindDefaults {
  kind: ZoneElementKind;
  /** Beschriftung in der Palette */
  label: string;
  w: number;
  h: number;
  d?: number;
  color: string;
}

/** Platzhalter-Maße je Typ (Plan 8a.1, Richtwerte der Alpen-Visuals) */
export const KIND_DEFAULTS: readonly KindDefaults[] = [
  { kind: 'flat', label: 'Kulisse', w: 8, h: 6, color: '#7cc242' },
  { kind: 'threePart', label: 'Dreiteiler', w: 24, h: 14, d: 7.5, color: '#a0765a' },
  { kind: 'column', label: 'Säule', w: 2, h: 10, color: '#8a5f2a' },
  { kind: 'cave', label: 'Höhlenkasten', w: 30, h: 12, d: 14, color: '#5a4a3a' },
  { kind: 'water', label: 'Wasser', w: 30, h: 0, d: 8, color: '#3ec7c2' },
  { kind: 'waterfall', label: 'Wasserfall', w: 2.2, h: 10, color: '#bfefff' },
  { kind: 'portal', label: 'Portal', w: 4.8, h: 4.8, color: '#b8ae9c' },
];

export function kindDefaults(kind: ZoneElementKind): KindDefaults {
  return KIND_DEFAULTS.find((k) => k.kind === kind) ?? KIND_DEFAULTS[0];
}

export function emptyZone(name: string, width = 300, trackType: TrackType = 'road'): ZoneFile {
  return { version: 1, name, width, trackType, elements: [], fields: [], stations: [], queues: [], sites: [], coinGroups: [] };
}

/** nächste freie Kennung mit Präfix (s1, q1, b1, c1, …) */
export function nextId(prefix: string, taken: Array<{ id: string }>): string {
  const ids = new Set(taken.map((t) => t.id));
  let n = taken.length + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function newStation(zone: ZoneFile, x: number, y: number, z: number): ZoneStation {
  return { id: nextId('s', zone.stations), x: round(x), y: round(y), z: round(z), dir: 1, length: 14 };
}

export function newQueue(zone: ZoneFile, x: number, y: number, z: number): ZoneQueue {
  return { id: nextId('q', zone.queues), x0: round(x - 10), x1: round(x), y: round(y), z: round(z), dir: 1 };
}

export function newSite(zone: ZoneFile, x: number, y: number, z: number): ZoneSite {
  return { id: nextId('b', zone.sites), x: round(x), y: round(y), z: round(z), variant: 'connect' };
}

export function newCoinGroup(zone: ZoneFile, x: number, y: number, z: number): ZoneCoinGroup {
  return { id: nextId('c', zone.coinGroups), shape: 'row', x: round(x), y: round(y), z: round(z), count: 5, spacing: 2 };
}

/** nächste freie Feldkennung f1, f2, … */
export function newFieldId(zone: ZoneFile): string {
  let n = zone.fields.length + 1;
  const ids = new Set(zone.fields.map((f) => f.id));
  while (ids.has(`f${n}`)) n++;
  return `f${n}`;
}

/** kleinstes Feld (Meter): schmaler oder niedriger lässt sich kein Level zeichnen */
export const FIELD_MIN_W = 20;
export const FIELD_MIN_H = 12;

/** neues Feld aus zwei Ecken (beliebige Reihenfolge), auf die Mindestmaße gebracht */
export function newField(zone: ZoneFile, ax: number, ay: number, bx: number, by: number): ZoneField {
  const x0 = round(Math.min(ax, bx));
  const y0 = round(Math.min(ay, by));
  return { id: newFieldId(zone), x0, y0, x1: round(Math.max(x0 + FIELD_MIN_W, Math.max(ax, bx))), y1: round(Math.max(y0 + FIELD_MIN_H, Math.max(ay, by))) };
}

/** nächste freie Kennung e1, e2, … */
export function newElementId(zone: ZoneFile): string {
  let n = zone.elements.length + 1;
  const ids = new Set(zone.elements.map((e) => e.id));
  while (ids.has(`e${n}`)) n++;
  return `e${n}`;
}

/** neues Element eines Typs am Fußpunkt (x, y) auf Spur z mit den Platzhalter-Maßen */
export function newElement(zone: ZoneFile, kind: ZoneElementKind, x: number, y: number, z: number): ZoneElement {
  const d = kindDefaults(kind);
  const el: ZoneElement = { id: newElementId(zone), kind, x: round(x, 2), y: round(y, 2), z: round(z, 2), w: d.w, h: d.h, color: d.color };
  if (d.d !== undefined) el.d = d.d;
  return el;
}

export const round = (v: number, digits = 2): number => Math.round(v * 10 ** digits) / 10 ** digits;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Zonendatei prüfen: unbekannte Felder bleiben erhalten, falsche Elemente fallen weg; null, wenn die Datei keine Zone ist */
export function parseZone(json: unknown): ZoneFile | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.version !== 1 || typeof o.name !== 'string' || !/^[a-z0-9-]{1,40}$/.test(o.name)) return null;
  const width = num(o.width) && o.width > 0 ? o.width : 300;
  const trackType = parseTrackType(typeof o.trackType === 'string' ? o.trackType : null) ?? 'road';
  const beltOf = (v: unknown): BeltLevel | undefined => (num(v) ? (Math.max(0, Math.min(4, Math.floor(v))) as BeltLevel) : undefined);
  const abilityList = (v: unknown): ZoneAbility[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v.filter((a, i, arr) => (ZONE_ABILITIES as readonly string[]).includes(String(a)) && arr.indexOf(a) === i) as ZoneAbility[];
    return out.length ? out : undefined;
  };
  // Aufwertungsstufen (Etappe 2, Schritt 1): Tabelle Stufe → Schalter; fehlt sie, gilt die Vorbelegung
  let upgrades: ZoneUpgrade[] | undefined;
  if (Array.isArray(o.upgrades)) {
    const list: ZoneUpgrade[] = [];
    for (const raw of o.upgrades) {
      if (!raw || typeof raw !== 'object') continue;
      const u = raw as Record<string, unknown>;
      const up: ZoneUpgrade = { abilities: abilityList(u.abilities) ?? [], belt: beltOf(u.belt) ?? 0 };
      if (typeof u.name === 'string' && u.name.trim()) up.name = u.name.trim().slice(0, 40);
      if (num(u.chain) && u.chain > 0) up.chain = u.chain;
      if (typeof u.car === 'string' && u.car.trim()) up.car = u.car.trim().slice(0, 20);
      list.push(up);
    }
    if (list.length) upgrades = list.slice(0, 10);
  }
  const elements: ZoneElement[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(o.elements) ? o.elements : []) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || ids.has(e.id)) continue;
    if (!(ZONE_KINDS as readonly string[]).includes(String(e.kind))) continue;
    if (!num(e.x) || !num(e.y) || !num(e.z) || !num(e.w) || !num(e.h)) continue;
    const el: ZoneElement = { id: e.id, kind: e.kind as ZoneElementKind, x: e.x, y: e.y, z: Math.max(-2.5, Math.min(2.5, e.z)), w: Math.max(0.2, e.w), h: Math.max(0, e.h) };
    if (num(e.d)) el.d = Math.max(0.2, e.d);
    if (typeof e.color === 'string') el.color = e.color;
    if (typeof e.label === 'string') el.label = e.label.slice(0, 40);
    if (e.foundation === true) el.foundation = true;
    if (Array.isArray(e.openings)) {
      const openings: ZoneOpening[] = [];
      for (const raw2 of e.openings) {
        const op = raw2 as Record<string, unknown>;
        if (op && num(op.dx) && num(op.dy) && num(op.r) && op.r > 0) openings.push({ dx: op.dx, dy: op.dy, r: op.r });
      }
      if (openings.length) el.openings = openings;
    }
    if ((ZONE_ANCHORS as readonly string[]).includes(String(e.anchor))) el.anchor = e.anchor as ZoneAnchor;
    if (num(e.growth) && e.growth > 0) el.growth = Math.floor(e.growth);
    if ((ZONE_DEPTH_ROLES as readonly string[]).includes(String(e.depthRole))) el.depthRole = e.depthRole as ZoneDepthRole;
    ids.add(el.id);
    elements.push(el);
  }
  const fields: ZoneField[] = [];
  const fieldIds = new Set<string>();
  for (const raw of Array.isArray(o.fields) ? o.fields : []) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.id !== 'string' || fieldIds.has(f.id) || !num(f.x0) || !num(f.x1) || !num(f.y0) || !num(f.y1)) continue;
    const field: ZoneField = { id: f.id, x0: Math.min(f.x0, f.x1), x1: Math.max(f.x0, f.x1), y0: Math.min(f.y0, f.y1), y1: Math.max(f.y0, f.y1) };
    if (typeof f.name === 'string') field.name = f.name.slice(0, 40);
    if (Array.isArray(f.goals)) {
      const goals: ZoneGoal[] = [];
      for (const raw2 of f.goals) {
        const g = raw2 as Record<string, unknown>;
        if (!g || !(ZONE_GOAL_TYPES as readonly string[]).includes(String(g.type))) continue;
        const goal: ZoneGoal = { type: g.type as GoalType };
        if (num(g.value)) goal.value = g.value;
        if (g.bonus === true) goal.bonus = true;
        goals.push(goal);
      }
      if (goals.length) field.goals = goals.slice(0, 6);
    }
    if (num(f.stage) && f.stage >= 0) field.stage = Math.min(9, Math.floor(f.stage));
    if (num(f.upgrade) && f.upgrade >= 0) field.upgrade = Math.min(9, Math.floor(f.upgrade));
    // Überschreibungen des Felds (Plan 3.1, 2.1)
    const on = abilityList(f.on);
    if (on) field.on = on;
    const off = abilityList(f.off);
    if (off) field.off = off;
    const belt = beltOf(f.belt);
    if (belt !== undefined) field.belt = belt;
    if (num(f.chain) && f.chain > 0) field.chain = f.chain;
    if (num(f.budget) && f.budget > 0) field.budget = f.budget;
    if (num(f.maxHeight) && f.maxHeight > 0) field.maxHeight = f.maxHeight;
    fieldIds.add(field.id);
    fields.push(field);
  }
  const dirOf = (v: unknown): 1 | -1 => (v === -1 ? -1 : 1);
  const list = <T extends { id: string }>(key: string, make: (r: Record<string, unknown>) => T | null): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(o[key]) ? (o[key] as unknown[]) : []) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.id !== 'string' || seen.has(r.id)) continue;
      const item = make(r);
      if (!item) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  };
  const stations = list<ZoneStation>('stations', (r) => (num(r.x) && num(r.y) && num(r.z) ? { id: r.id as string, x: r.x, y: r.y, z: r.z, dir: dirOf(r.dir), length: num(r.length) && r.length >= 6 ? r.length : 14 } : null));
  const queues = list<ZoneQueue>('queues', (r) => (num(r.x0) && num(r.x1) && num(r.y) && num(r.z) ? { id: r.id as string, x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), y: r.y, z: r.z, dir: dirOf(r.dir) } : null));
  const sites = list<ZoneSite>('sites', (r) => {
    if (!num(r.x) || !num(r.y) || !num(r.z)) return null;
    const site: ZoneSite = { id: r.id as string, x: r.x, y: r.y, z: r.z, variant: r.variant === 'breakthrough' ? 'breakthrough' : 'connect' };
    if (num(r.energy) && r.energy > 0) site.energy = r.energy;
    return site;
  });
  const coinGroups = list<ZoneCoinGroup>('coinGroups', (r) => (num(r.x) && num(r.y) && num(r.z) ? { id: r.id as string, shape: (COIN_SHAPES as readonly string[]).includes(String(r.shape)) ? (r.shape as ZoneCoinGroup['shape']) : 'row', x: r.x, y: r.y, z: r.z, count: num(r.count) ? Math.max(1, Math.min(40, Math.round(r.count))) : 5, spacing: num(r.spacing) ? Math.max(0.5, r.spacing) : 2 } : null));
  return { version: 1, name: o.name, width, trackType, ...(upgrades ? { upgrades } : {}), elements, fields, stations, queues, sites, coinGroups };
}

/** Datei deterministisch schreiben: feste Feldreihenfolge, Elemente nach Kennung sortiert, zwei Nachkommastellen */
export function serializeZone(zone: ZoneFile): string {
  const elements = [...zone.elements]
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    .map((e) => {
      const out: Record<string, unknown> = { id: e.id, kind: e.kind, x: round(e.x), y: round(e.y), z: round(e.z), w: round(e.w), h: round(e.h) };
      if (e.d !== undefined) out.d = round(e.d);
      if (e.color) out.color = e.color;
      if (e.label) out.label = e.label;
      if (e.foundation) out.foundation = true;
      if (e.openings?.length) out.openings = e.openings.map((o) => ({ dx: round(o.dx), dy: round(o.dy), r: round(o.r) }));
      if (e.anchor) out.anchor = e.anchor;
      if (e.growth) out.growth = e.growth;
      if (e.depthRole) out.depthRole = e.depthRole;
      return out;
    });
  const fields = [...zone.fields]
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    .map((f) => {
      const out: Record<string, unknown> = { id: f.id };
      if (f.name) out.name = f.name;
      Object.assign(out, { x0: round(f.x0), x1: round(f.x1), y0: round(f.y0), y1: round(f.y1) });
      if (f.goals?.length) out.goals = f.goals.map((g) => ({ type: g.type, ...(g.value !== undefined ? { value: g.value } : {}), ...(g.bonus ? { bonus: true } : {}) }));
      if (f.stage !== undefined) out.stage = f.stage;
      if (f.upgrade !== undefined) out.upgrade = f.upgrade;
      if (f.on?.length) out.on = [...f.on];
      if (f.off?.length) out.off = [...f.off];
      if (f.belt !== undefined) out.belt = f.belt;
      if (f.chain !== undefined) out.chain = round(f.chain);
      if (f.budget !== undefined) out.budget = round(f.budget);
      if (f.maxHeight !== undefined) out.maxHeight = round(f.maxHeight);
      return out;
    });
  const upgrades = zone.upgrades?.length
    ? zone.upgrades.map((u) => {
        const out: Record<string, unknown> = {};
        if (u.name) out.name = u.name;
        out.abilities = [...u.abilities];
        out.belt = u.belt;
        if (u.chain !== undefined) out.chain = round(u.chain);
        if (u.car) out.car = u.car;
        return out;
      })
    : undefined;
  const byId = <T extends { id: string }>(items: T[]): T[] => [...items].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const stations = byId(zone.stations).map((s) => ({ id: s.id, x: round(s.x), y: round(s.y), z: round(s.z), dir: s.dir, length: round(s.length) }));
  const queues = byId(zone.queues).map((q) => ({ id: q.id, x0: round(q.x0), x1: round(q.x1), y: round(q.y), z: round(q.z), dir: q.dir }));
  const sites = byId(zone.sites).map((b) => {
    const out: Record<string, unknown> = { id: b.id, x: round(b.x), y: round(b.y), z: round(b.z), variant: b.variant };
    if (b.energy) out.energy = round(b.energy);
    return out;
  });
  const coinGroups = byId(zone.coinGroups).map((c) => ({ id: c.id, shape: c.shape, x: round(c.x), y: round(c.y), z: round(c.z), count: c.count, spacing: round(c.spacing) }));
  return JSON.stringify({ version: 1, name: zone.name, width: round(zone.width), trackType: zone.trackType, ...(upgrades ? { upgrades } : {}), elements, fields, stations, queues, sites, coinGroups }, null, 2) + '\n';
}
