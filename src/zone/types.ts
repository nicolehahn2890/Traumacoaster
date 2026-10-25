/**
 * Zonendatei (Etappe 1, Schritt 6; Plan Paket 2.1): Eine Zone ist ein riesiges Level, aus dem später Felder als Level
 * ausgeschnitten werden. Version 1 kennt Maße, den Bahntyp und die Platzhalter-Elemente (Plan 8a.1); Felder, Station,
 * Schlangenbereich, Baustellen, Coins und Metadaten je Element kommen in den Schritten 7 bis 9 dazu. Der Editor im
 * Spiel schreibt die Datei nach `public/zones/<name>/zone.json`, das Spiel liest sie von dort (auch auf dem Handy).
 */
import { parseTrackType, type TrackType } from '@/world/trackTypes';

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
}

export interface ZoneFile {
  version: 1;
  name: string;
  /** Breite der Zone in Metern (x von 0 bis width) */
  width: number;
  trackType: TrackType;
  elements: ZoneElement[];
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
  return { version: 1, name, width, trackType, elements: [] };
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
    ids.add(el.id);
    elements.push(el);
  }
  return { version: 1, name: o.name, width, trackType, elements };
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
      return out;
    });
  return JSON.stringify({ version: 1, name: zone.name, width: round(zone.width), trackType: zone.trackType, elements }, null, 2) + '\n';
}
