/**
 * Freiraumfeld (Tor 2b, Florians Leitsätze; Plan Paket 5 „Freiraumfeld statt Sonderregeln“): ein Feld „fest oder frei“
 * über die ganze Welt, aus dem Pinsel, Stützen und Fahrt ihre Regeln lesen, statt je Form eine eigene zu haben.
 *
 * Fest sind: die Erde unter der Oberfläche (außer in offenen Räumen, die bis zur Oberfläche offen sind, weil der Deckel
 * weg ist), Dreiteiler (Umriss × Dicke: Lippe und Rückwand als Wände in der Tiefe, das Dach als Wand unter der Oberkante,
 * dazwischen ein freier Innenraum; seine Flanken sind offen wie bei den Bergen der Level, feste Flanken und echte
 * Öffnungsvolumen kommen mit den gemalten Teilen, Plan 8a), Säulen (Zylinder) und die Wände und Böden von Höhlenkästen
 * über dem Boden. Alles andere ist frei. Kulissen ohne Volumen (Flächen, Wasser, Wasserfall, Portal) sind kein Festes;
 * Durchbruch-Wände gehören der Fahrt (Baustellen), nicht dem Feld.
 *
 * Höhlen sind Freiräume, die von Festem umschlossen oder unter der Oberfläche liegen (offener Raum, Innenraum eines
 * Dreiteilers). Sie ziehen den Strich an, der sie erreicht (Florians Magnet), und in ihnen liest der Pinsel keine Höhe
 * über dem Boden mehr, er hält die Spur und meidet die Wände.
 *
 * Abfragen: `solid` (Punkt fest?), `freeLanes` (freie Tiefen-Abschnitte am Strahl eines Bühnenpunkts, für den Pinsel),
 * `floorBelow` (tragende Fläche unter einem Punkt, für Stützen), `ceilingAbove` (Decke über einem Punkt, Tunnel-Meter der
 * Fahrt). Reine Daten und Funktionen, ohne Renderer.
 */
import { LANE_DEPTH, LANE_MAX, LANE_MIN, type StagePoint } from '@/track/stage';
import { kindDefaults, type ZoneElement } from './types';
import { threePartOutline, topAt } from './build';

/** Sicherheitsabstand der Bahn zu Festem in der Tiefe (Spuren): die Bahn streift keine Wand */
export const FIELD_MARGIN = 0.12;
/** halbe Dicke der Wände eines Dreiteilers in der Tiefe (Spuren, um die Lippen- und Rückwandfläche) */
export const WALL_HALF = 0.12;
/** Dach eines Dreiteilers (Meter unter der Oberkante): darüber ist Fels, darunter der Innenraum */
export const ROOF = 2;
/** Dicke der Wände eines Höhlenkastens über dem Boden (Meter) */
export const BOX_WALL = 0.6;
/** so tief (Meter) unter der Oberfläche beginnt eine Höhle für den Pinsel */
export const CAVE_DIVE = 0.3;
/**
 * Nahe einer Höhle (bis LIFT_REACH Meter vor und hinter ihrer Grundfläche) darf ein Strich bis LIFT_MAX Meter in die Erde
 * reichen und gilt noch als frei: die Bahn wird dort auf die Oberfläche angehoben, so reißt die Kette am Lochrand nicht.
 * Überall sonst gilt die Mindesthöhe über der Erde hart wie in den Levels (unten gezeichnet heißt vorn), tiefer bleibt nur
 * die Notspur mit der kleinsten nötigen Anhebung. Elemente sperren immer hart
 */
export const LIFT_MAX = 2;
export const LIFT_REACH = 6;
/** Spurschritt der Abtastung am Strahl */
const STEP = 0.05;
/** eine Decke bis zu dieser Höhe (Meter) über einem Punkt macht ihn zum Tunnel */
export const CEILING = 12;

/** was einen freien Abschnitt am Strahl begrenzt: die Erde (Mindesthöhe über dem Boden), ein Element, der Bühnenrand */
export type WallKind = 'earth' | 'element' | 'edge';

/** freier Tiefen-Abschnitt am Strahl (Spuren, vorn klein) */
export interface FreeInterval {
  a: number;
  b: number;
  /** was den Abschnitt vorn (a) und hinten (b) begrenzt */
  aKind: WallKind;
  bKind: WallKind;
  /** Höhle: unter der Oberfläche oder im Innenraum eines Dreiteilers (Kennung des Raums oder Elements) */
  cave: string | null;
  /** die Höhle zieht an: der Strahl liegt auch auf ihrer mittleren Spur in ihr (der Strich ist hinein gemalt) */
  attract: boolean;
}

export interface FreeLanes {
  intervals: FreeInterval[];
  /**
   * kein freier Abschnitt: die Spur mit der kleinsten Eindringtiefe in die Erde (die Bahn wird dort angehoben), null,
   * wenn der Strahl überall in Festem liegt, das nicht Erde ist (dann ist der Punkt blockiert)
   */
  fallback: number | null;
  /** ein Element oder eine Höhle beschränkt den Strahl (Maße) */
  touched: boolean;
  /** Höhle unter dem Strahl, in die der Strich noch nicht hinein reicht: Mitte (Spur) und Höhe des Strahls dort über der Oberfläche (Meter) */
  below: { center: number; h: number } | null;
}

/** was an einem Punkt fest ist */
export type SolidKind = 'none' | 'earth' | 'element';

/** Erde: die Höhe, unter der der Boden fest ist (Boden ohne Berge, wenn Tunnel erlaubt sind, sonst mit) */
export type EarthHeight = (x: number, lane: number) => number;

interface Slab {
  el: ZoneElement;
  outline: Array<[number, number]>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zc: number;
  half: number;
  openings: Array<{ x: number; y: number; r: number }>;
}
interface Column {
  id: string;
  cx: number;
  zc: number;
  r: number;
  y0: number;
  y1: number;
}
interface Box {
  id: string;
  cx: number;
  zc: number;
  w: number;
  half: number;
  y0: number;
  y1: number;
}
/** offener Raum unter der Oberfläche: Freiraum in der Erde vom Raumboden bis zur Oberfläche */
export interface Cavity {
  id: string;
  x0: number;
  x1: number;
  lane0: number;
  lane1: number;
  floor: number;
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

export class FreeField {
  private readonly slabs: Slab[] = [];
  private readonly columns: Column[] = [];
  private readonly boxes: Box[] = [];
  readonly cavities: Cavity[] = [];

  /**
   * elements: Elemente der Zone (mit den Öffnungen der Sitzung), die bis zur Fortschrittsstufe stage da sind; earth: Höhe,
   * unter der die Erde fest ist; ohne Elemente ist das Feld nur die Erde
   */
  constructor(elements: readonly ZoneElement[], stage: number, readonly earth: EarthHeight) {
    for (const el of elements) {
      if ((el.growth ?? 0) > stage) continue;
      const d = el.d ?? kindDefaults(el.kind).d ?? 8;
      const half = d / 2 / LANE_DEPTH;
      if (el.kind === 'threePart') {
        const outline = threePartOutline(el);
        const xs = outline.map((p) => p[0]);
        const ys = outline.map((p) => p[1]);
        this.slabs.push({
          el,
          outline,
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          zc: el.z,
          half,
          openings: (el.openings ?? []).map((o) => ({ x: el.x + o.dx, y: el.y + o.dy, r: o.r })),
        });
      } else if (el.kind === 'column') {
        this.columns.push({ id: el.id, cx: el.x, zc: el.z, r: el.w / 2, y0: el.y, y1: el.y + el.h });
      } else if (el.kind === 'cave') {
        // Räume „offen ab Stufe“ (Schritt 7): davor liegt der Raum in der Erde, die Erde ist dort fest wie überall
        if ((el.openFrom ?? 0) > stage) continue;
        if (el.y + el.h <= earth(el.x, el.z) + 0.5) this.cavities.push({ id: el.id, x0: el.x - el.w / 2, x1: el.x + el.w / 2, lane0: el.z - half, lane1: el.z + half, floor: el.y });
        else this.boxes.push({ id: el.id, cx: el.x, zc: el.z, w: el.w, half, y0: el.y, y1: el.y + el.h });
      }
    }
  }

  /** gibt es außer der Erde etwas Festes oder einen Raum? */
  get empty(): boolean {
    return !this.slabs.length && !this.columns.length && !this.boxes.length && !this.cavities.length;
  }

  /** offener Raum, in dem der Punkt liegt (unter der Oberfläche, über dem Raumboden), sonst null */
  cavityAt(x: number, y: number, lane: number): Cavity | null {
    for (const c of this.cavities) if (x >= c.x0 && x <= c.x1 && lane >= c.lane0 && lane <= c.lane1 && y >= c.floor) return c;
    return null;
  }

  private slabSolid(s: Slab, x: number, y: number, lane: number): boolean {
    if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY) return false;
    const dl = lane - s.zc;
    if (Math.abs(dl) > s.half + WALL_HALF) return false;
    if (!inPolygon(s.outline, x, y)) return false;
    if (this.slabInner(s, x, y, lane)) return false;
    // Öffnung in der Lippe: ein Zylinder quer durch die Lippenwand
    if (dl < 0) for (const o of s.openings) if (Math.hypot(x - o.x, y - o.y) <= o.r) return false;
    return true;
  }

  /** Innenraum eines Dreiteilers: hinter der Lippe, vor der Rückwand, unter dem Dach (die Flanken sind offen) */
  private slabInner(s: Slab, x: number, y: number, lane: number): boolean {
    if (Math.abs(lane - s.zc) >= s.half - WALL_HALF) return false;
    if (y < s.minY) return false;
    const top = topAt(s.el, x);
    return top !== null && y < top - ROOF;
  }

  /** Innenraum eines Dreiteilers (Höhle), in dem der Punkt liegt, sonst null */
  private slabCaveAt(x: number, y: number, lane: number): Slab | null {
    for (const s of this.slabs) if (x >= s.minX && x <= s.maxX && y >= s.minY && y <= s.maxY && inPolygon(s.outline, x, y) && this.slabInner(s, x, y, lane)) return s;
    return null;
  }

  /** was am Weltpunkt (x, Höhe, Spur) fest ist */
  solidKind(x: number, y: number, lane: number): SolidKind {
    for (const s of this.slabs) if (this.slabSolid(s, x, y, lane)) return 'element';
    for (const c of this.columns) if (y >= c.y0 && y <= c.y1 && Math.hypot(x - c.cx, (lane - c.zc) * LANE_DEPTH) <= c.r) return 'element';
    for (const b of this.boxes) {
      if (Math.abs(lane - b.zc) > b.half) continue;
      const dx = Math.abs(x - b.cx);
      if (dx >= b.w / 2 - BOX_WALL && dx <= b.w / 2 + BOX_WALL && y >= b.y0 - BOX_WALL && y <= b.y1) return 'element';
      if (dx <= b.w / 2 + BOX_WALL && y >= b.y0 - BOX_WALL && y <= b.y0 + BOX_WALL) return 'element';
    }
    if (y < this.earth(x, lane) && !this.cavityAt(x, y, lane)) return 'earth';
    return 'none';
  }

  /** fester Punkt: dort liegt keine Bahn und steht kein Stützenfuß */
  solid(x: number, y: number, lane: number): boolean {
    return this.solidKind(x, y, lane) !== 'none';
  }

  /** Höhle am Punkt: offener Raum unter der Oberfläche oder Innenraum eines Dreiteilers; Kennung und mittlere Spur */
  caveAt(x: number, y: number, lane: number): { id: string; center: number } | null {
    if (y < this.earth(x, lane) - CAVE_DIVE) {
      const c = this.cavityAt(x, y, lane);
      if (c) return { id: c.id, center: (c.lane0 + c.lane1) / 2 };
    }
    const s = this.slabCaveAt(x, y, lane);
    return s ? { id: s.el.id, center: s.zc } : null;
  }

  /**
   * Freie Tiefen-Abschnitte am Strahl eines Bühnenpunkts (Spuren). toWorld deutet den Punkt auf einer Spur (der Strahl
   * der Kamera). Frei ist eine Spur, wenn der Punkt dort in keinem Element liegt, bis clearance Meter darunter kein
   * Element und keine Erde ist (Mindesthöhe über dem Boden wie in den Levels); nahe einer Höhle zählt Erde bis LIFT_MAX
   * unter der Oberfläche als frei (die Bahn wird angehoben). Abschnitte in einer Höhle sind eigene Abschnitte, mit
   * `attract`, wenn der Strahl auch auf der mittleren Spur der Höhle in ihr liegt; die Enden nennen, was sie begrenzt.
   */
  freeLanes(p: StagePoint, toWorld: (p: StagePoint, lane: number) => { x: number; y: number }, clearance: number): FreeLanes {
    const count = Math.round((LANE_MAX - LANE_MIN) / STEP) + 1;
    let touched = false;
    let bestPen = Infinity;
    let fallback: number | null = null;
    const caves = new Map<string, { center: number; hit: boolean }>();
    const belowCaves = new Map<string, number>();
    /** frei an dieser Spur? sonst, was sperrt */
    const probe = (lane: number): { free: boolean; blocker: WallKind; cave: { id: string; center: number } | null } => {
      const w = toWorld(p, lane);
      const kind = this.solidKind(w.x, w.y, lane);
      if (kind === 'element') return { free: false, blocker: 'element', cave: null };
      const below = this.solidKind(w.x, w.y - clearance, lane);
      if (below === 'element') return { free: false, blocker: 'element', cave: null };
      if (kind === 'earth' || below === 'earth') {
        const top = this.earth(w.x, lane);
        const need = top + clearance - w.y;
        const liftable = this.solidKind(w.x, top + clearance * 0.5, lane) !== 'element';
        const nearCave = this.cavities.some((c) => w.x >= c.x0 - LIFT_REACH && w.x <= c.x1 + LIFT_REACH && lane >= c.lane0 - 0.35 && lane <= c.lane1 + 0.35);
        if (!(nearCave && liftable && top - w.y <= LIFT_MAX)) {
          if (liftable && need < bestPen) {
            bestPen = need;
            fallback = lane;
          }
          return { free: false, blocker: 'earth', cave: null };
        }
      }
      return { free: true, blocker: 'edge', cave: this.caveAt(w.x, w.y, lane) };
    };
    const intervals: FreeInterval[] = [];
    let cur: FreeInterval | null = null;
    let lastBlocker: WallKind = 'edge';
    for (let k = 0; k < count; k++) {
      const lane = LANE_MIN + k * STEP;
      const r = probe(lane);
      if (r.blocker === 'element') touched = true;
      if (!r.free) {
        if (cur) cur.bKind = r.blocker;
        cur = null;
        lastBlocker = r.blocker;
        continue;
      }
      const w = toWorld(p, lane);
      const id = r.cave?.id ?? null;
      if (r.cave) {
        touched = true;
        const entry = caves.get(r.cave.id) ?? { center: r.cave.center, hit: false };
        if (Math.abs(lane - r.cave.center) < STEP * 0.6) entry.hit = true;
        caves.set(r.cave.id, entry);
      } else {
        // Höhle unter dem Strahl, deren Grundfläche der Punkt trifft, der Strich aber noch darüber liegt
        const c = this.cavities.find((q) => w.x >= q.x0 && w.x <= q.x1 && lane >= q.lane0 && lane <= q.lane1);
        if (c && !belowCaves.has(c.id)) belowCaves.set(c.id, (c.lane0 + c.lane1) / 2);
      }
      if (cur && cur.cave === id) cur.b = lane;
      else {
        cur = { a: lane, b: lane, aKind: cur ? 'edge' : lastBlocker, bKind: 'edge', cave: id, attract: false };
        intervals.push(cur);
      }
    }
    // Enden genau suchen (zwischen letzter freier und erster gesperrter Spur), damit die Schranke am Boden exakt die
    // Mindesthöhe ist wie in den Levels und nicht eine Abtastung davor
    const refine = (freeLane: number, blockedLane: number): number => {
      let f = freeLane;
      let bl = blockedLane;
      for (let k = 0; k < 6; k++) {
        const mid = (f + bl) / 2;
        if (probe(mid).free) f = mid;
        else bl = mid;
      }
      return f;
    };
    for (const iv of intervals) {
      if (iv.aKind !== 'edge' && iv.a - STEP >= LANE_MIN - 1e-9) iv.a = refine(iv.a, iv.a - STEP);
      if (iv.bKind !== 'edge' && iv.b + STEP <= LANE_MAX + 1e-9) iv.b = refine(iv.b, iv.b + STEP);
      if (iv.cave) iv.attract = caves.get(iv.cave)?.hit ?? false;
    }
    // Höhle unter dem Strahl ohne Abschnitt in ihr, oder mit Abschnitt, der nicht anzieht: Mitte und Höhe darüber
    let below: FreeLanes['below'] = null;
    for (const [id, center] of belowCaves) {
      if (intervals.some((iv) => iv.cave === id && iv.attract)) continue;
      const w = toWorld(p, center);
      below = { center, h: w.y - this.earth(w.x, center) };
      break;
    }
    return { intervals, fallback: intervals.length ? null : fallback, touched, below };
  }

  /** tragende Fläche unter dem Punkt: Höhe und Art des Festen (Erde, Fels, Raumboden), null im Leeren */
  floorBelow(x: number, y: number, lane: number, maxDrop = 80): { y: number; kind: 'ground' | 'rock' | 'cave' } | null {
    const step = 0.25;
    let prev = y;
    for (let d = step; d <= maxDrop; d += step) {
      const yy = y - d;
      const kind = this.solidKind(x, yy, lane);
      if (kind === 'none') {
        prev = yy;
        continue;
      }
      // Kante feiner suchen
      let lo = yy;
      let hi = prev;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (this.solidKind(x, mid, lane) === 'none') hi = mid;
        else lo = mid;
      }
      if (kind === 'element') return { y: hi, kind: 'rock' };
      return { y: hi, kind: this.cavityAt(x, hi + 0.01, lane) ? 'cave' : 'ground' };
    }
    return null;
  }

  /** liegt über dem Punkt (bis maxH Meter) Festes? Dann fährt die Bahn dort im Tunnel */
  ceilingAbove(x: number, y: number, lane: number, maxH = CEILING): boolean {
    for (let d = 0.5; d <= maxH; d += 0.5) if (this.solidKind(x, y + d, lane) !== 'none') return true;
    return false;
  }
}

/** freie Abschnitte je Bühnenpunkt, gemerkt je Punkt (die Linie wächst beim Malen nur am Ende) */
export function cachedFreeLanes(field: FreeField, toWorld: (p: StagePoint, lane: number) => { x: number; y: number }, clearance: number): ((p: StagePoint) => FreeLanes) & { clear(): void } {
  const cache = new Map<string, FreeLanes>();
  const fn = ((p: StagePoint) => {
    const key = `${p.X.toFixed(3)}|${p.Y.toFixed(3)}`;
    let v = cache.get(key);
    if (!v) {
      v = field.freeLanes(p, toWorld, clearance);
      if (cache.size > 20000) cache.clear();
      cache.set(key, v);
    }
    return v;
  }) as ((p: StagePoint) => FreeLanes) & { clear(): void };
  fn.clear = () => cache.clear();
  return fn;
}
