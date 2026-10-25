/**
 * Baustellen (Etappe 2, Schritt 6; Plan 5.1, 5.2, Richtlinie 4). Verbinden: Trifft das Strichende den Anschlusspunkt,
 * läuft die Freilegung, und danach trägt die Lippe des Dreiteilers, auf dem die Baustelle sitzt, dort eine Öffnung (nur
 * für diese Sitzung; die Zonendatei bleibt unverändert, „offen ab Stufe“ kommt in Schritt 7). Durchbruch: eine Wand quer
 * zur Bahn, die in der Fahrt bei Mindesttempo zersplittert, sonst hält sie. Reine Daten und Funktionen.
 */
import { LANE_DEPTH } from '@/track/stage';
import { kindDefaults, type ZoneElement, type ZoneSite } from './types';
import { threePartOutline } from './build';
import { inPolygon } from './field';

/** Öffnungsradius einer Freilegung ohne Angabe (Meter) */
export const SITE_OPENING_R = 2.6;
/** Fang: so nah (Bühnen-Meter) muss das Strichende an den Anschlusspunkt, damit es dort einrastet */
export const SITE_REACH = 3.5;
/** Durchbruch-Wand (Meter): Höhe, Breite quer zur Bahn, Dicke in Fahrtrichtung */
export const WALL_H = 6;
export const WALL_W = 4;
export const WALL_T = 0.5;
/** das Bahnende hält so weit (Spuren) vor der Lippe, in der die Öffnung entsteht */
export const SITE_STANDOFF = 0.2;

/**
 * Element, das eine Verbinden-Baustelle öffnet: das genannte (target), sonst der nächste Dreiteiler, dessen Umriss den Punkt
 * enthält und dessen Dicke die Spur trifft, oder der Raum (Höhlenkasten, Schritt 7), über dessen Grundfläche der Punkt liegt
 */
export function siteTarget(elements: readonly ZoneElement[], site: ZoneSite): ZoneElement | null {
  if (site.target) {
    const named = elements.find((e) => e.id === site.target && (e.kind === 'threePart' || e.kind === 'cave'));
    if (named) return named;
  }
  for (const el of elements) {
    if (el.kind !== 'cave') continue;
    const half = (el.d ?? kindDefaults(el.kind).d ?? 8) / 2 / LANE_DEPTH;
    if (Math.abs(site.x - el.x) <= el.w / 2 && Math.abs(site.z - el.z) <= half + 0.3 && site.y >= el.y && site.y <= el.y + el.h + 6) return el;
  }
  let best: ZoneElement | null = null;
  let bestD = Infinity;
  for (const el of elements) {
    if (el.kind !== 'threePart') continue;
    const half = (el.d ?? kindDefaults(el.kind).d ?? 8) / 2 / LANE_DEPTH;
    if (Math.abs(site.z - el.z) > half + 0.6) continue;
    if (!inPolygon(threePartOutline(el), site.x, site.y)) continue;
    const d = Math.abs(site.z - el.z);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}

/** Anschlusspunkt als Bahnende: der Punkt der Baustelle, in der Tiefe knapp vor der Lippe des Ziel-Elements (sonst die Spur der Baustelle) */
export function siteAnchor(elements: readonly ZoneElement[], site: ZoneSite): { x: number; y: number; lane: number } {
  const el = siteTarget(elements, site);
  if (!el) return { x: site.x, y: site.y, lane: site.z };
  const half = (el.d ?? kindDefaults(el.kind).d ?? 8) / 2 / LANE_DEPTH;
  // Raum: der Punkt liegt über dem Raum auf dem Deckel, das Bahnende hält dort die Spur des Raums
  if (el.kind === 'cave') return { x: site.x, y: site.y, lane: Math.max(el.z - half + 0.15, Math.min(el.z + half - 0.15, site.z)) };
  return { x: site.x, y: site.y, lane: el.z - half - SITE_STANDOFF };
}

/** Elemente mit den Öffnungen der offenen Verbinden-Baustellen; unveränderte Elemente bleiben dieselben Objekte */
export function withSiteOpenings(elements: readonly ZoneElement[], sites: readonly ZoneSite[], opened: ReadonlySet<string>): ZoneElement[] {
  const extra = new Map<string, Array<{ dx: number; dy: number; r: number }>>();
  const openedRooms = new Set<string>();
  for (const site of sites) {
    if (site.variant !== 'connect' || !opened.has(site.id)) continue;
    const el = siteTarget(elements, site);
    if (!el) continue;
    if (el.kind === 'cave') {
      // Raum: der Deckel ist weg, der Raum gilt als offen
      openedRooms.add(el.id);
      continue;
    }
    const list = extra.get(el.id) ?? [];
    list.push({ dx: site.x - el.x, dy: site.y - el.y, r: site.r ?? SITE_OPENING_R });
    extra.set(el.id, list);
  }
  if (!extra.size && !openedRooms.size) return [...elements];
  return elements.map((el) => {
    if (openedRooms.has(el.id)) return el.openFrom ? { ...el, openFrom: 0 } : el;
    const add = extra.get(el.id);
    return add ? { ...el, openings: [...(el.openings ?? []), ...add] } : el;
  });
}

export interface SiteWall {
  id: string;
  x: number;
  y: number;
  z: number;
  h: number;
  /** nötiges Tempo (m/s) */
  energy: number;
}

/** Wände der noch geschlossenen Durchbruch-Baustellen für die Fahrt */
export function siteWalls(sites: readonly ZoneSite[], opened: ReadonlySet<string>): SiteWall[] {
  return sites.filter((s) => s.variant === 'breakthrough' && !opened.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, h: WALL_H, energy: s.energy ?? 10 }));
}
