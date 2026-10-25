/**
 * Zonen-Elemente als Klötzchen in der Welt (Schritt 6): jedes Element der Zonendatei wird mit den Platzhalter-Bauern
 * aus `src/world/elements.ts` gebaut. Dreiteiler bekommen vorerst eine Rechteck-Silhouette ohne Öffnung (die Öffnungen
 * und die anderen Metadaten kommen in Schritt 7).
 */
import { Color, DoubleSide, Group, Mesh, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCave, buildColumn, buildFlat, buildPortal, buildThreePart, buildWater, buildWaterfall, type BuiltElement } from '@/world/elements';
import type { Foundation } from '@/world/foundations';
import { paintedMaterial } from '@/world/looks';
import { buildQueuePlaceholder, buildSitePlaceholder, buildStationPlaceholder } from '@/world/stationElements';
import { createNode, type TrackPath } from '@/track/model';
import { coinsOfGroup, type ZoneCoinGroup } from './groups';
import { kindDefaults, type ZoneElement, type ZoneFile, type ZoneQueue, type ZoneSite, type ZoneStation } from './types';

export const buildZoneStation = (s: ZoneStation): BuiltElement => buildStationPlaceholder(s.x, s.y, s.z, s.dir, s.length);
export const buildZoneQueue = (q: ZoneQueue): BuiltElement => buildQueuePlaceholder(q.x0, q.x1, q.y, q.z, q.dir);
export const buildZoneSite = (b: ZoneSite): BuiltElement => buildSitePlaceholder(b.x, b.y, b.z, b.variant);

/** Coin-Gruppe als durchscheinende Kugeln in einer Geometrie (Marke zum Greifen im Editor; die Coins zeichnet die Bühne) */
export function buildZoneCoins(c: ZoneCoinGroup): BuiltElement {
  const m = paintedMaterial({ color: new Color('#ffd23f'), transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
  const parts = coinsOfGroup(c).map((p) => new SphereGeometry(0.7, 10, 8).translate(p.x, p.y, -p.lane * 8.4));
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const g = new Group();
  g.name = 'element-coins';
  g.add(new Mesh(geo, m));
  return {
    kind: 'flat',
    group: g,
    dispose() {
      geo.dispose();
      m.dispose();
    },
  };
}

/** alle Coins der Zone für die Bühne (Fangradius wie heute) */
export function zoneCoins(zone: ZoneFile): Array<{ x: number; y: number; lane: number }> {
  return zone.coinGroups.flatMap((g) => coinsOfGroup(g));
}

/** Position eines Eintrags der Zone (für das Ziehen); Schlange: Mitte des Streifens */
export function itemPosition(item: ZoneElement | ZoneStation | ZoneQueue | ZoneSite | ZoneCoinGroup): { x: number; y: number; z: number } {
  if ('x0' in item) return { x: (item.x0 + item.x1) / 2, y: item.y, z: item.z };
  return { x: item.x, y: item.y, z: item.z };
}

/** gerades Vorgabestück der Station als offene Pinsel-Bahn: Stationsknoten am Anker, Ende dir · length weiter */
export function stationPath(s: ZoneStation): TrackPath {
  const a = createNode(s.x, s.y, s.z, 'station');
  const b = createNode(s.x + s.dir * s.length, s.y, s.z);
  a.outX = (s.dir * s.length) / 3;
  b.inX = (-s.dir * s.length) / 3;
  return { nodes: [a, b], elements: [], startType: 'chainlift', templates: {}, closed: false, brush: true };
}

/** Station, Schlangen, Baustellen und Coin-Gruppen der Zone in die Welt setzen (ohne die Kulissen) */
export function applyZoneExtras(world: { addZoneBuilt(id: string, built: BuiltElement, origin: { x: number; y: number; z: number }): void }, zone: ZoneFile): void {
  for (const s of zone.stations) world.addZoneBuilt(s.id, buildZoneStation(s), itemPosition(s));
  for (const q of zone.queues) world.addZoneBuilt(q.id, buildZoneQueue(q), itemPosition(q));
  for (const b of zone.sites) world.addZoneBuilt(b.id, buildZoneSite(b), itemPosition(b));
  for (const c of zone.coinGroups) world.addZoneBuilt(c.id, buildZoneCoins(c), itemPosition(c));
}

/** Silhouette eines Dreiteiler-Platzhalters: Rechteck mit abgeschrägten Schultern (bis zu den Bildern der Zone) */
export function threePartOutline(el: ZoneElement): Array<[number, number]> {
  return [
    [el.x - el.w / 2, el.y - 1],
    [el.x - el.w / 2, el.y + el.h * 0.7],
    [el.x - el.w * 0.2, el.y + el.h],
    [el.x + el.w * 0.2, el.y + el.h],
    [el.x + el.w / 2, el.y + el.h * 0.7],
    [el.x + el.w / 2, el.y - 1],
  ];
}

/** Oberkante eines Elements bei x (Meter), null außerhalb: Kulisse flach, Dreiteiler mit Schultern */
export function topAt(el: ZoneElement, x: number): number | null {
  if (Math.abs(x - el.x) > el.w / 2) return null;
  if (el.kind !== 'threePart') return el.y + el.h;
  const pts = threePartOutline(el).slice(1, 5);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y0;
  }
  return el.y + el.h;
}

/** tragfähige Oberkante als Fundament: Füße dürfen darauf stehen, wenn die Bahn in der Tiefe nah genug ist (±0,5 Spuren) */
function elementFoundation(el: ZoneElement): Foundation {
  return {
    surfaceBelow(px, py, pz) {
      if (Math.abs(pz - el.z) > 0.5) return null;
      const top = topAt(el, px);
      if (top === null || top >= py) return null;
      return { y: top, kind: 'element' };
    },
  };
}

export function buildZoneElement(el: ZoneElement): BuiltElement {
  const def = kindDefaults(el.kind);
  const color = el.color ?? def.color;
  const d = el.d ?? def.d ?? 8;
  const built = buildRaw(el, color, d);
  if (el.foundation && (el.kind === 'flat' || el.kind === 'threePart' || el.kind === 'column')) built.foundation = elementFoundation(el);
  return built;
}

function buildRaw(el: ZoneElement, color: string, d: number): BuiltElement {
  switch (el.kind) {
    case 'threePart':
      return buildThreePart(threePartOutline(el), el.z, d, (el.openings ?? []).map((o) => ({ x: el.x + o.dx, y: el.y + o.dy, r: o.r })), color);
    case 'column':
      return buildColumn(el.x, el.y, el.z, el.w / 2, el.h, color);
    case 'cave':
      return buildCave(el.x, el.y, el.z, el.w, el.h, d, color);
    case 'water':
      return buildWater(el.x, el.y, el.z, el.w, d, color);
    case 'waterfall':
      return buildWaterfall(el.x, el.y, el.z, el.w, el.h, color);
    case 'portal':
      return buildPortal(el.x, el.y + el.w / 2, el.z, el.w / 2, 0.3, color);
    default:
      return buildFlat(el.x, el.y, el.z, el.w, el.h, color, el.label ?? kindDefaults(el.kind).label);
  }
}
