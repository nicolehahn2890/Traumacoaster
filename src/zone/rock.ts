/**
 * Festigkeitsfeld der Zone (Etappe 2, Schritt 5; Plan 5.1, 5.2, Richtlinie 3): Aus den Platzhaltern mit Volumen wird
 * „fester Fels“. Ein Dreiteiler ist Rückwand, Innenraum und Vorderlippe: Rückwand und Lippe (Umriss, je ein schmales Band
 * in der Tiefe) sind fest, die Lippe außer in ihren Öffnungen; der Innenraum dazwischen ist ein freier Kanal und zählt als
 * Tunnel (dort ist die Bahn hinter der Lippe verdeckt, im Fenster sichtbar). Seine Flanken sind offen wie bei den Bergen
 * der Level (dort entsteht der Tunnelmund, wo die Bahn die Silhouette kreuzt); feste Flanken und echte Öffnungsvolumen
 * kommen mit den gemalten Teilen (Plan 8a). Säulen sind Zylinder; Höhlenkästen haben feste Wände, Boden und Decke um
 * einen freien Raum, der vorn offen ist und als Tunnel zählt. Kulissen ohne Volumen (Flächen, Wasser, Wasserfall, Portal)
 * sind kein Fels. Der Pinsel fragt je Linienpunkt die verbotenen Tiefen ab (`spans`), Stützen und Fahrt fragen Weltpunkte
 * (`solid`, `tunnel`). Reine Funktionen, ohne Renderer.
 */
import { LANE_DEPTH, type StagePoint } from '@/track/stage';
import type { ZoneElement } from './types';
import { kindDefaults } from './types';
import { threePartOutline } from './build';

/** verbotener Tiefenbereich in Spuren (vorn klein, hinten groß) */
export interface RockSpan {
  z0: number;
  z1: number;
}

/** Sicherheitsabstand vor und hinter Fels (Spuren): die Bahn streift die Lippe nicht */
export const ROCK_MARGIN = 0.12;
/** Dicke der Wände eines Höhlenkastens (Meter) */
export const CAVE_WALL = 0.6;

interface Slab {
  outline: Array<[number, number]>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zc: number;
  /** halbe Dicke in Spuren */
  half: number;
  openings: Array<{ x: number; y: number; r: number }>;
}
interface Column {
  cx: number;
  zc: number;
  r: number;
  y0: number;
  y1: number;
}
interface Cave {
  x: number;
  y: number;
  zc: number;
  w: number;
  h: number;
  half: number;
}

export function inPolygon(poly: Array<[number, number]>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class RockField {
  private readonly slabs: Slab[] = [];
  private readonly columns: Column[] = [];
  private readonly caves: Cave[] = [];

  /** Elemente der Zone, die bis zur Fortschrittsstufe stage da sind (Infinity: alle) */
  constructor(elements: readonly ZoneElement[], stage = Infinity) {
    for (const el of elements) {
      if ((el.growth ?? 0) > stage) continue;
      const d = el.d ?? kindDefaults(el.kind).d ?? 8;
      if (el.kind === 'threePart') {
        const outline = threePartOutline(el);
        const xs = outline.map((p) => p[0]);
        const ys = outline.map((p) => p[1]);
        this.slabs.push({
          outline,
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          zc: el.z,
          half: d / 2 / LANE_DEPTH,
          openings: (el.openings ?? []).map((o) => ({ x: el.x + o.dx, y: el.y + o.dy, r: o.r })),
        });
      } else if (el.kind === 'column') {
        this.columns.push({ cx: el.x, zc: el.z, r: el.w / 2, y0: el.y, y1: el.y + el.h });
      } else if (el.kind === 'cave') {
        this.caves.push({ x: el.x, y: el.y, zc: el.z, w: el.w, h: el.h, half: d / 2 / LANE_DEPTH });
      }
    }
  }

  get empty(): boolean {
    return !this.slabs.length && !this.columns.length && !this.caves.length;
  }

  private slabHit(s: Slab, x: number, y: number): 'rock' | 'opening' | null {
    if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY || !inPolygon(s.outline, x, y)) return null;
    for (const o of s.openings) if (Math.hypot(x - o.x, y - o.y) <= o.r) return 'opening';
    return 'rock';
  }

  /** Wand, Boden oder Decke eines Höhlenkastens an (x, y)? (der Raum dazwischen ist frei) */
  private caveWall(c: Cave, x: number, y: number): boolean {
    const inBox = Math.abs(x - c.x) <= c.w / 2 + CAVE_WALL && y >= c.y - CAVE_WALL && y <= c.y + c.h + CAVE_WALL;
    const inRoom = Math.abs(x - c.x) < c.w / 2 - CAVE_WALL && y > c.y + CAVE_WALL && y < c.y + c.h - CAVE_WALL;
    return inBox && !inRoom;
  }

  /**
   * Verbotene Tiefen eines Bühnenpunkts (Spuren): je Wand, deren Fläche den Punkt in ihrer Tiefe trifft (Lippe außer in
   * einer Öffnung, Rückwand, Säule, Höhlenwand). toWorld deutet den Bühnenpunkt auf einer Spur (beim Pinsel der Strahl der
   * Kamera).
   */
  spans(p: StagePoint, toWorld: (p: StagePoint, lane: number) => { x: number; y: number }): RockSpan[] {
    const out: RockSpan[] = [];
    for (const s of this.slabs) {
      // Spuren: vorn klein, hinten groß; die Lippe liegt vor der Spur des Elements, die Rückwand dahinter
      const lip = s.zc - s.half;
      const wl = toWorld(p, lip);
      if (this.slabHit(s, wl.x, wl.y) === 'rock') out.push({ z0: lip - ROCK_MARGIN, z1: lip + ROCK_MARGIN });
      const back = s.zc + s.half;
      const wb = toWorld(p, back);
      if (this.slabHit(s, wb.x, wb.y) !== null) out.push({ z0: back - ROCK_MARGIN, z1: back + ROCK_MARGIN });
    }
    for (const c of this.columns) {
      const w = toWorld(p, c.zc);
      if (Math.abs(w.x - c.cx) > c.r || w.y < c.y0 || w.y > c.y1) continue;
      const half = c.r / LANE_DEPTH;
      out.push({ z0: c.zc - half - ROCK_MARGIN, z1: c.zc + half + ROCK_MARGIN });
    }
    for (const c of this.caves) {
      const w = toWorld(p, c.zc);
      if (!this.caveWall(c, w.x, w.y)) continue;
      out.push({ z0: c.zc - c.half - ROCK_MARGIN, z1: c.zc + c.half + ROCK_MARGIN });
    }
    return out;
  }

  /** fester Fels an einem Weltpunkt (x, Höhe, Spur): dort darf kein Stützenfuß stehen und keine Bahn liegen */
  solid(x: number, y: number, lane: number): boolean {
    for (const s of this.slabs) {
      const atLip = Math.abs(lane - (s.zc - s.half)) <= ROCK_MARGIN;
      const atBack = Math.abs(lane - (s.zc + s.half)) <= ROCK_MARGIN;
      if (!atLip && !atBack) continue;
      const hit = this.slabHit(s, x, y);
      if (hit === 'rock' || (hit === 'opening' && atBack)) return true;
    }
    for (const c of this.columns) if (y >= c.y0 && y <= c.y1 && Math.hypot(x - c.cx, (lane - c.zc) * LANE_DEPTH) <= c.r) return true;
    for (const c of this.caves) if (Math.abs(lane - c.zc) <= c.half && this.caveWall(c, x, y)) return true;
    return false;
  }

  /** Innenraum eines Dreiteilers (hinter der Lippe) oder Höhlenraum: dort zählen die Tunnel-Meter der Fahrt (Plan 5.1) */
  tunnel(x: number, y: number, lane: number): boolean {
    for (const s of this.slabs) if (Math.abs(lane - s.zc) < s.half - ROCK_MARGIN && this.slabHit(s, x, y) !== null) return true;
    for (const c of this.caves) {
      if (Math.abs(lane - c.zc) > c.half) continue;
      if (Math.abs(x - c.x) < c.w / 2 - CAVE_WALL && y > c.y + CAVE_WALL && y < c.y + c.h - CAVE_WALL) return true;
    }
    return false;
  }
}
