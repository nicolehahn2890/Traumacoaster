/**
 * Kulissen eines heutigen Levels als Platzhalter (Etappe 1, Schritt 4): Berge werden Dreiteiler je Spur mit
 * Tunnelöffnungen, wo die Bahn dieser Spur hinein- und herausfährt (die Bahn fährt hinter der Lippe ihrer Scheibe und
 * ist dort verdeckt); ein Berg ohne feste Spur steht wie auf der Bühne gestaffelt auf allen fünf Spuren (Tor 1a: als ein
 * 41 m tiefer Klotz lag seine Vorderseite im geneigten Bild zehn Meter unter der Rückseite, die Bahn schwebte sichtbar
 * dazwischen). Seen und Flüsse werden Wasserflächen, Wasserfälle Bänder, Deko-Bauten beschriftete Flächen. Die
 * Basiszone beschreibt ihre Elemente später selbst (Zonendatei, Schritt 6); diese Abbildung gilt für `src/levels`.
 */
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import { LANE_DEPTH, LANE_MAX, LANE_MIN } from '@/track/stage';
import { buildFlat, buildMountainStack, buildPortal, buildWater, buildWaterfall, type BuiltElement, type MountainLayer, type Opening } from './elements';

/** Felsfarbe je Welt wie in der Bühnendarstellung */
const ROCK: Record<number, string> = { 6: '#55596b', 7: '#dff3ff', 8: '#3a3350', 9: '#3a2420', 10: '#8b7fb5' };
/** halbe Dicke eines Bergs um seine Spur (Spuren): Rückwand dahinter, Lippe davor */
export const MOUNTAIN_HALF = 0.45;
/** Radius der Tunnelöffnung (Meter), wie der Platzhalter-Kreis der Bühne */
export const PORTAL_R = 2.0;

export interface PortalLike {
  x: number;
  y: number;
  z: number;
}

export function elementsFromTerrain(terrain: Terrain, world: WorldDef, portals: PortalLike[]): BuiltElement[] {
  const out: BuiltElement[] = [];
  const rock = ROCK[world.id] ?? '#a0765a';
  for (const m of terrain.mountains) {
    const lanes: number[] = m.lane === undefined ? [] : [m.lane];
    if (m.lane === undefined) for (let lane = LANE_MIN; lane <= LANE_MAX; lane++) lanes.push(lane);
    const left = m.x - m.width / 2;
    const right = m.x + m.width / 2;
    const layers: MountainLayer[] = [];
    for (const lane of lanes) {
      const outline: Array<[number, number]> = [];
      for (let x = left; x <= right; x += 1) outline.push([x, terrain.groundHeight(x, lane) + terrain.mountainHeight(x, lane)]);
      outline.push([right, terrain.groundHeight(right, lane) - 1], [left, terrain.groundHeight(left, lane) - 1]);
      // Öffnungen dieser Scheibe: Portale der Bahn auf dieser Spur (wie die Platzhalter-Kreise der Bühne, ±0,6 Spuren)
      const openings: Opening[] = [];
      for (const p of portals) {
        if (p.x < left || p.x > right || Math.abs(p.z - lane) > 0.6) continue;
        if (openings.some((o) => Math.hypot(o.x - p.x, o.y - (p.y + 0.7)) < PORTAL_R)) continue;
        openings.push({ x: p.x, y: p.y + 0.7, r: PORTAL_R });
      }
      layers.push({ outline, z: lane, openings });
    }
    out.push(buildMountainStack(layers, 2 * MOUNTAIN_HALF * LANE_DEPTH, rock));
    for (const layer of layers) for (const o of layer.openings) out.push(buildPortal(o.x, o.y, layer.z - MOUNTAIN_HALF - 0.03, o.r + 0.15, 0.25, rock));
  }
  const water = world.id === 9 ? '#ff6a2a' : '#3ec7c2';
  for (const w of terrain.water) {
    const banded = w.kind === 'lake' && w.lane !== undefined;
    const front = banded ? w.lane! - 0.5 : LANE_MIN - 0.5;
    const back = banded ? w.lane! + 0.5 : LANE_MAX + 0.5;
    out.push(buildWater(w.x, 0.05, (front + back) / 2, Math.max(2, w.width - 3), (back - front) * LANE_DEPTH, water));
  }
  for (const wf of terrain.waterfalls) {
    const lane = wf.lane ?? 0;
    const top = terrain.groundHeight(wf.x - 4, lane);
    const bottom = terrain.groundHeight(wf.x + 6, lane);
    out.push(buildWaterfall(wf.x + 2, bottom, lane, 2.2, Math.max(1.5, top - bottom + 1), '#bfefff'));
  }
  for (const p of terrain.props) out.push(buildFlat(p.x, terrain.groundHeight(p.x, p.lane), p.lane, 3.5, 4.5, world.palette.accent, p.id));
  return out;
}
