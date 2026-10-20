/**
 * Terrain eines Levels: Bodenhöhe pro Spur, Berge (tunnelfähig), Wasser, Klippen, Deko.
 * Alle Formen sind weiche Kosinus-Hügel, damit die Bahn sauber darüber gleitet.
 */
import type { LevelDef, TerrainFeature } from '@/levels/types';
import { LANE_MAX, LANE_MIN } from '@/track/stage';

export interface MountainShape {
  x: number;
  width: number;
  height: number;
  lane?: number;
}

export interface WaterRegion {
  x: number;
  width: number;
  lane?: number;
  kind: 'lake' | 'river';
}

const bump = (dx: number, halfWidth: number): number => {
  if (Math.abs(dx) >= halfWidth) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * dx) / halfWidth);
};

export class Terrain {
  readonly width: number;
  readonly features: TerrainFeature[];
  readonly mountains: MountainShape[] = [];
  readonly water: WaterRegion[] = [];
  readonly cliffs: Array<{ x: number; height: number }> = [];
  readonly hills: Array<{ x: number; width: number; height: number; lane?: number }> = [];
  readonly waterfalls: Array<{ x: number; height: number; lane?: number }> = [];
  readonly props: Array<{ x: number; id: string; lane: number }> = [];
  /** Vom Spieler geformte Berge/Täler (Bergbauer) */
  readonly custom: Array<{ x: number; width: number; height: number; lane: number }> = [];

  constructor(level: Pick<LevelDef, 'width' | 'terrain'>) {
    this.width = level.width;
    this.features = level.terrain;
    for (const f of level.terrain) {
      switch (f.kind) {
        case 'hill': this.hills.push({ x: f.x, width: f.width, height: f.height, lane: f.lane }); break;
        case 'valley': this.hills.push({ x: f.x, width: f.width, height: -f.depth, lane: f.lane }); break;
        case 'mountain': this.mountains.push({ x: f.x, width: f.width, height: f.height, lane: f.lane }); break;
        case 'lake': this.water.push({ x: f.x, width: f.width, lane: f.lane, kind: 'lake' }); break;
        case 'river': this.water.push({ x: f.x, width: f.width, kind: 'river' }); break;
        case 'waterfall': this.waterfalls.push({ x: f.x, height: f.height, lane: f.lane }); break;
        case 'cliff': this.cliffs.push({ x: f.x, height: f.height }); break;
        case 'prop': this.props.push({ x: f.x, id: String(f.id), lane: f.lane ?? 2 }); break;
        default: break;
      }
    }
  }

  private laneMatches(lane: number | undefined, z: number): boolean {
    if (lane === undefined) return true;
    return Math.abs(lane - z) < 0.75;
  }

  /** Bodenhöhe (ohne Berge) an x auf Spur z */
  groundHeight(x: number, z: number): number {
    let h = 0;
    for (const c of this.cliffs) {
      // links der Klippe hoch, rechts unten, weicher Übergang über 6 m
      const t = Math.max(0, Math.min(1, (x - (c.x - 3)) / 6));
      h += c.height * (1 - (0.5 - 0.5 * Math.cos(Math.PI * t)));
    }
    for (const hill of this.hills) {
      if (!this.laneMatches(hill.lane, z)) continue;
      h += hill.height * bump(x - hill.x, hill.width / 2);
    }
    for (const c of this.custom) {
      if (!this.laneMatches(c.lane, z)) continue;
      h += c.height * bump(x - c.x, c.width / 2);
    }
    for (const w of this.water) {
      if (w.kind === 'lake' && !this.laneMatches(w.lane, z)) continue;
      // Seebett liegt 2 m tiefer, Wasseroberfläche bei Bodenhöhe 0
      const t = bump(x - w.x, w.width / 2);
      h -= 2 * Math.min(1, t * 3);
    }
    return h;
  }

  /** Höhe des Bergs (Außenlinie) an x auf Spur z, 0 wenn kein Berg */
  mountainHeight(x: number, z: number): number {
    let h = 0;
    for (const m of this.mountains) {
      if (!this.laneMatches(m.lane, z)) continue;
      h = Math.max(h, m.height * bump(x - m.x, m.width / 2));
    }
    return h;
  }

  /** Liegt der Punkt im Berginneren (Tunnel)? */
  insideMountain(x: number, y: number, z: number): boolean {
    const mh = this.mountainHeight(x, z);
    return mh > 0.5 && y < this.groundHeight(x, z) + mh - 0.3;
  }

  /** Höhe, über der die Bahn liegen muss, wenn Tunnel nicht erlaubt sind */
  surfaceHeight(x: number, z: number): number {
    return this.groundHeight(x, z) + this.mountainHeight(x, z);
  }

  /** Ist an x auf Spur z Wasser? */
  waterAt(x: number, z: number): boolean {
    for (const w of this.water) {
      if (w.kind === 'lake' && !this.laneMatches(w.lane, z)) continue;
      if (Math.abs(x - w.x) < w.width / 2 - 1) return true;
    }
    return false;
  }

  /** Formt einen Berg/ein Tal mit dem Finger (Bergbauer) */
  addCustom(x: number, width: number, height: number, lane: number): void {
    this.custom.push({ x, width, height, lane });
  }

  static lanes(): number[] {
    const out: number[] = [];
    for (let z = LANE_MIN; z <= LANE_MAX; z++) out.push(z);
    return out;
  }
}
