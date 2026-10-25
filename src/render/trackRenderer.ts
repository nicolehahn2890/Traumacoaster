/**
 * Schienen, Schwellen, Pfeiler und Elemente in gemaltem Stil, pro Schienen-Skin.
 * Die Schienen liegen in 3D: linke/rechte Schiene = Bahn ± Spurweite · Seitenvektor (mit Schräglage),
 * perspektivisch auf die Bühne projiziert. Die Bahn wird nach Spuren in Stücke geteilt; jedes Stück sind zwei
 * Band-Meshes (StripMesh) mit dem Schienenprofil des Skins als Textur (Tinte – Schiene – Lichtkante), die
 * Schwellen bleiben Striche. Pfeiler kommen aus dem Planer in supports/supportStyle.ts (eine Form je Welt),
 * jeder als eigener Container am Fuß, der nach dem Zeichnen vom Boden hochwächst.
 */
import { Container, Graphics, Texture } from 'pixi.js';
import type { Vec3 } from '@/core/math3';
import type { TrackPath, TrackSamples } from '@/track/model';
import { frameWithBank, railBanksFor, stateAt } from '@/track/model';
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import { laneRatioFor, laneScale, toLaneOf, toStage, viewState, LANE_MIN, LANE_MAX, LANE_DEPTH } from '@/track/stage';
import { findCrossings, type Crossing } from '@/track/crossings';
import { hexNum, mix, railProfileTexture, shade } from './paint';
import { atmosphere } from './terrainRenderer';
import { MGraphics } from './mgraphics';
import { StripMesh, type StripPoint } from './stripMesh';
import { art, ART_NAMES, hasArt } from '@/assets/manifest';
import { buildSupport, planSupports, supportKindFor, type SupportGlow } from './supports/supportStyle';

export interface SkinStyle {
  rail: string;
  railLight: string;
  tie: string;
  post: string;
  brace: string;
  support: 'wood' | 'steel' | 'mine' | 'space' | 'ice' | 'neon' | 'ghost' | 'lava' | 'gold' | 'hybrid';
  glow?: string;
  postSpacing: number;
}

export const SKIN_STYLES: Record<string, SkinStyle> = {
  skinWood: { rail: '#6b4a35', railLight: '#9a6f4e', tie: '#5a3a22', post: '#c9a36b', brace: '#a8865a', support: 'wood', postSpacing: 2.6 },
  skinHybrid: { rail: '#d84a6a', railLight: '#ff8aa8', tie: '#5a3a22', post: '#c9a36b', brace: '#a8865a', support: 'hybrid', glow: '#ffd23f', postSpacing: 2.8 },
  skinMine: { rail: '#4a4a52', railLight: '#8a8a94', tie: '#5a3a22', post: '#8a6a4a', brace: '#6b4a35', support: 'mine', postSpacing: 2.2 },
  skinSteel: { rail: '#2fb8b3', railLight: '#9fe8e3', tie: '#ffffff', post: '#e8f4f4', brace: '#bcd6d6', support: 'steel', postSpacing: 5 },
  skinGold: { rail: '#d9a21b', railLight: '#ffe08a', tie: '#8a5a1a', post: '#f3d27a', brace: '#c9a03a', support: 'gold', glow: '#fff1b8', postSpacing: 4.5 },
  skinNeon: { rail: '#1b1b2b', railLight: '#ff6fae', tie: '#3ec7c2', post: '#33364a', brace: '#55596b', support: 'neon', glow: '#ff6fae', postSpacing: 5 },
  skinIce: { rail: '#9fd8ff', railLight: '#ffffff', tie: '#dff3ff', post: '#bfe6ff', brace: '#e9f7ff', support: 'ice', postSpacing: 4 },
  skinGhost: { rail: '#6b4a3a', railLight: '#a07a5a', tie: '#3a2a22', post: '#4a3a4a', brace: '#3a2a3a', support: 'ghost', glow: '#b48cff', postSpacing: 3 },
  skinLava: { rail: '#2a1612', railLight: '#ff6a2a', tie: '#4a2b22', post: '#3a2420', brace: '#5a2a1a', support: 'lava', glow: '#ff8a3a', postSpacing: 4.5 },
  skinSpace: { rail: '#ffffff', railLight: '#bfe6ff', tie: '#7fd3ff', post: '#7d6fa8', brace: '#a89ad6', support: 'space', glow: '#7fd3ff', postSpacing: 6 },
};

export const GAUGE = 0.55;

export interface TrackLayers {
  /** Pfeiler je Spur: ein Container je Pfeiler (Ursprung am Fuß, Skalierung = Spur · Wachstum) */
  supports: Map<number, Container>;
  /** Schienen je Spur: Schwellen (Graphics) → Band-Meshes → Elemente/Station/Leuchtlinie (Graphics) */
  rails: Map<number, Container>;
  /** Absperrbänder an offenen Enden (flattern, jeden Frame neu) */
  barriers: Map<number, Graphics>;
  coins: Map<number, Container>;
}

/** Absperrband: Fußpunkt, Rahmen (Seite, oben) und Spur */
interface Barrier {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface TunnelPortal {
  x: number;
  y: number;
  z: number;
  dir: number;
}

/** halbe Breite des Schienenbands in Spur-Metern (Tinte außen eingeschlossen) */
const RAIL_HALF = 0.13;
/** ein Durchlauf des Schienenprofils je 3 Bühnen-Meter */
const RAIL_REPEAT = 3;

export class TrackRenderer {
  readonly layers: TrackLayers = { supports: new Map(), rails: new Map(), barriers: new Map(), coins: new Map() };
  private coinSprites: Graphics[] = [];
  private barriers: Barrier[] = [];
  /** Kreuzungen auf gleicher Höhe: rote Marke an der oberen Schiene (dort fährt der Zug auf) */
  private crossMarks: Crossing[] = [];
  /** Leuchtebenen je Spur (von der Weltansicht gesetzt): Leuchtkanten der Schienen und Lichter der Pfeiler */
  glowTargets: Map<number, Container> | null = null;
  private glowGraphics = new Map<number, Graphics>();
  private supportGlowGraphics = new Map<number, Graphics>();
  private world: WorldDef;
  /** Schwellen (unter den Schienen) und Elemente/Station (über den Schienen) je Spur */
  private railUnder = new Map<number, Graphics>();
  private railOver = new Map<number, Graphics>();
  private railMeshLayer = new Map<number, Container>();
  /** Band-Meshes je Spur, wiederverwendet über Zeichnungen hinweg (unbenutzte sind unsichtbar) */
  private railPool = new Map<number, StripMesh[]>();
  private railUsed = new Map<number, number>();
  /** Pfeiler der aktuellen Zeichnung mit ihrer Spur-Skalierung (für das Wachsen) */
  private supportNodes: Array<{ c: Container; k: number; x: number; ground: number; z: number; lane: number }> = [];
  /** letzte Zeichnung (für die Neuprojektion bei Kamerabewegung in Perspektive) */
  private last: { path: TrackPath; samples: TrackSamples; skin: string; preview: boolean } | null = null;
  private supportGlows: Array<SupportGlow & { lane: number; X: number; Y: number; k: number }> = [];
  /** Weltrenderer: Pfeiler (und ihre Lichter) zeichnet die Welt */
  private supportsHidden = false;
  private glowsDrawn = false;
  /** Bahn und Schräglage der Schienen der letzten Zeichnung: Der Wagen fährt mit derselben Schräglage (railFrame) */
  private railSamples: TrackSamples | null = null;
  private railBank: Float64Array = new Float64Array(0);

  constructor(world: WorldDef) {
    this.world = world;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      this.layers.supports.set(z, new Container());
      const rails = new Container();
      const under = new Graphics();
      const meshes = new Container();
      const over = new Graphics();
      rails.addChild(under, meshes, over);
      this.railUnder.set(z, under);
      this.railMeshLayer.set(z, meshes);
      this.railOver.set(z, over);
      this.railPool.set(z, []);
      this.layers.rails.set(z, rails);
      this.layers.barriers.set(z, new Graphics());
      this.layers.coins.set(z, new Container());
    }
  }

  clear(): void {
    this.railSamples = null;
    this.last = null;
    for (const c of this.layers.supports.values()) {
      for (const child of c.removeChildren()) child.destroy({ children: true });
    }
    this.supportNodes = [];
    this.supportGlows = [];
    this.glowsDrawn = false;
    for (const g of this.railUnder.values()) g.clear();
    for (const g of this.railOver.values()) g.clear();
    for (const pool of this.railPool.values()) for (const m of pool) m.hide();
    this.railUsed.clear();
    for (const g of this.layers.barriers.values()) g.clear();
    for (const g of this.glowGraphics.values()) g.clear();
    for (const g of this.supportGlowGraphics.values()) g.clear();
    this.barriers = [];
    this.crossMarks = [];
  }

  /** Grafik in der Leuchtebene einer Spur (bei Bedarf anlegen); null ohne Leuchtebenen */
  private glowGraphic(lane: number, map = this.glowGraphics): Graphics | null {
    const target = this.glowTargets?.get(lane);
    if (!target) return null;
    let g = map.get(lane);
    if (!g) {
      g = new Graphics();
      map.set(lane, g);
      target.addChild(g);
    }
    return g;
  }

  /** nächstes freies Band-Mesh der Spur (bei Bedarf anlegen) */
  private takeRail(lane: number): StripMesh {
    const pool = this.railPool.get(lane)!;
    const used = this.railUsed.get(lane) ?? 0;
    let m = pool[used];
    if (!m) {
      m = new StripMesh(Texture.WHITE);
      pool.push(m);
      this.railMeshLayer.get(lane)!.addChild(m.mesh);
    }
    this.railUsed.set(lane, used + 1);
    return m;
  }

  /** Schienenprofil des Skins für eine Spur (Luftperspektive eingerechnet), Holz-Skins mit gemalter Maserung */
  private railTexture(skin: string, style: SkinStyle, lane: number, sky: string): Texture {
    const rail = atmosphere(style.rail, lane, sky);
    const light = atmosphere(style.railLight, lane, sky);
    const ink = shade(rail, -0.5);
    const woody = style.support === 'wood' || style.support === 'mine' || style.support === 'hybrid' || style.support === 'ghost';
    let grain: CanvasImageSource | null = null;
    if (woody && hasArt(ART_NAMES.wood())) {
      const res = art(ART_NAMES.wood(), () => Texture.EMPTY).source.resource as unknown;
      if (typeof ImageBitmap !== 'undefined' && res instanceof ImageBitmap) grain = res;
      else if (typeof HTMLImageElement !== 'undefined' && res instanceof HTMLImageElement) grain = res;
      else if (typeof HTMLCanvasElement !== 'undefined' && res instanceof HTMLCanvasElement) grain = res;
    }
    return railProfileTexture(`${skin}_${lane}_${sky}_${grain ? 'g' : 'p'}`, rail, light, ink, grain, 3 + lane);
  }

  /** Weltrenderer: Schienen und Schwellen zeichnet die Welt; hier bleiben Elemente, Station und Leuchtlinie */
  setWorldMode(on: boolean): void {
    for (const g of this.railUnder.values()) g.visible = !on;
    for (const c of this.railMeshLayer.values()) c.visible = !on;
    for (const c of this.layers.supports.values()) c.visible = !on;
    this.supportsHidden = on;
    if (on) for (const g of this.supportGlowGraphics.values()) g.clear();
  }

  /** Schräglage der Schienen je Abtastpunkt der letzten Zeichnung (die Welt baut ihre Profile damit) */
  get railBanks(): Float64Array {
    return this.railBank;
  }

  /** Rahmen (vorwärts, oben, seitlich) auf den Schienen bei Bahnlänge s, mit ihrer Schräglage; null ohne Bahn */
  railFrame(s: number): { T: Vec3; U: Vec3; S: Vec3; bank: number } | null {
    const sm = this.railSamples;
    if (!sm || sm.count < 2) return null;
    const L = sm.length;
    const u = (sm.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s))) / sm.step;
    const i = Math.min(sm.count - 1, Math.floor(u));
    const j = sm.closed ? (i + 1) % sm.count : Math.min(sm.count - 1, i + 1);
    const t = Math.min(1, u - i);
    return frameWithBank(stateAt(sm, s), this.railBank[i] * (1 - t) + this.railBank[j] * t);
  }

  draw(path: TrackPath, samples: TrackSamples, skin: string, terrain: Terrain, allowTunnels: boolean, preview = false): TunnelPortal[] {
    this.clear();
    const portals: TunnelPortal[] = [];
    if (samples.count < 2) return portals;
    const style = SKIN_STYLES[skin] ?? SKIN_STYLES.skinWood;
    const sky = this.world.sky[1];
    const banks = railBanksFor(samples);
    this.railSamples = samples;
    this.railBank = banks;
    this.last = { path, samples, skin, preview };

    // Vorschau: Schienen, Schwellen und Station wie fertig, nur Pfeiler und Elemente nicht (die Pfeiler wachsen
    // nach dem Loslassen in 0,3 s hoch, siehe redrawSupports)
    if (!preview) {
      this.drawSupports(samples, style, terrain, sky);
      this.setSupportGrowth(1);
    }
    this.drawRails(path, samples, skin, style, sky, preview);
    const n = samples.count;
    let wasInside = terrain.insideMountain(samples.x[0], samples.y[0], samples.z[0]);
    for (let i = 1; i < n; i++) {
      const inside = terrain.insideMountain(samples.x[i], samples.y[i], samples.z[i]);
      if (inside !== wasInside && allowTunnels) portals.push({ x: samples.x[i], y: samples.y[i], z: samples.z[i], dir: inside ? 1 : -1 });
      wasInside = inside;
    }
    // Offene Bahn: Absperrband am Ende und 3 m hinter der Station (die Fahrt endet hier, kein Rückweg)
    if (!samples.closed && !preview) {
      const end = stateAt(samples, samples.length);
      const fe = frameWithBank(end, 0);
      this.barriers.push({ x: end.x, y: end.y, z: end.z, sx: fe.S.x, sy: fe.S.y, sz: fe.S.z });
      const st0 = stateAt(samples, 0);
      const f0 = frameWithBank(st0, 0);
      this.barriers.push({ x: st0.x - st0.t3x * 3, y: st0.y - st0.t3y * 3, z: st0.z - (st0.t3z * 3) / LANE_DEPTH, sx: f0.S.x, sy: f0.S.y, sz: f0.S.z });
    }
    // Kreuzungen auf gleicher Höhe (auch in der Vorschau, damit man sie beim Zeichnen sieht)
    this.crossMarks = findCrossings(samples);
    this.updateBarriers(0);
    return portals;
  }

  /** Kreuzungen der letzten Zeichnung (für Hinweise) */
  get crossings(): Crossing[] {
    return this.crossMarks;
  }

  /** Absperrbänder zeichnen: zwei Pfosten (1,1 m), drei gelb-schwarze Bänder, die im Wind flattern */
  updateBarriers(time: number): void {
    if (!this.barriers.length && !this.crossMarks.length) return;
    for (const g of this.layers.barriers.values()) g.clear();
    const ink = 0x2a1f3d;
    // Kreuzung: rotes Schild mit ✕ über der oberen Schiene
    for (const c of this.crossMarks) {
      const lane = Math.round(c.z);
      const g = this.layers.barriers.get(lane);
      if (!g) continue;
      const k = laneScale(lane);
      const p = toLaneOf(c.x, Math.max(c.y1, c.y2) + 1.6, c.z, lane);
      const r = 0.75 * k;
      g.circle(p.X, p.Y, r).fill({ color: 0xff4d5e, alpha: 0.95 }).stroke({ width: 0.14 * k, color: ink });
      const a = r * 0.45;
      g.moveTo(p.X - a, p.Y - a).lineTo(p.X + a, p.Y + a).stroke({ width: 0.18 * k, color: 0xffffff, cap: 'round' });
      g.moveTo(p.X - a, p.Y + a).lineTo(p.X + a, p.Y - a).stroke({ width: 0.18 * k, color: 0xffffff, cap: 'round' });
    }
    if (!this.barriers.length) return;
    for (const b of this.barriers) {
      const lane = Math.round(b.z);
      const g = this.layers.barriers.get(lane);
      if (!g) continue;
      const k = laneScale(lane);
      const half = 0.95;
      const l = toLaneOf(b.x - b.sx * half, b.y - b.sy * half, b.z - (b.sz * half) / LANE_DEPTH, lane);
      const r = toLaneOf(b.x + b.sx * half, b.y + b.sy * half, b.z + (b.sz * half) / LANE_DEPTH, lane);
      for (const p of [l, r]) {
        g.moveTo(p.X, p.Y - 0.1 * k).lineTo(p.X, p.Y + 1.1 * k).stroke({ width: 0.14 * k, color: ink, cap: 'round' });
        g.circle(p.X, p.Y + 1.1 * k, 0.1 * k).fill(0xffd23f);
      }
      const segs = 8;
      for (const h of [0.35, 0.65, 0.95]) {
        for (let j = 0; j < segs; j++) {
          const t0 = j / segs;
          const t1 = (j + 1) / segs;
          const flutter = (t: number) => 0.08 * Math.sin(6 * time + b.x + t * 7 + h * 9) * Math.sin(Math.PI * t);
          const x0 = l.X + (r.X - l.X) * t0;
          const y0 = l.Y + (r.Y - l.Y) * t0 + (h + flutter(t0)) * k;
          const x1 = l.X + (r.X - l.X) * t1;
          const y1 = l.Y + (r.Y - l.Y) * t1 + (h + flutter(t1)) * k;
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 0.16 * k, color: j % 2 === 0 ? 0xffd23f : ink, cap: 'butt' });
        }
      }
    }
  }

  /** Pfeiler wachsen lassen, 0 … 1 (vom Boden bis zur Bahn); bei 1 gehen ihre Lichter in die Leuchtebene */
  redrawSupports(growth: number): void {
    this.setSupportGrowth(growth);
  }

  private setSupportGrowth(growth: number): void {
    for (const n of this.supportNodes) {
      n.c.visible = growth > 0.02;
      n.c.scale.y = n.k * Math.max(0.001, growth);
    }
    if (growth >= 1 && !this.glowsDrawn && !this.supportsHidden) {
      this.glowsDrawn = true;
      for (const gl of this.supportGlows) {
        const g = this.glowGraphic(gl.lane, this.supportGlowGraphics);
        if (!g) continue;
        g.circle(gl.X, gl.Y, gl.r * gl.k).fill({ color: hexNum(gl.color), alpha: 0.75 });
      }
    } else if (growth < 1 && this.glowsDrawn) {
      this.glowsDrawn = false;
      for (const g of this.supportGlowGraphics.values()) g.clear();
    }
  }

  /** Pfeiler je Welt: Planer wählt die Fußpunkte, Bauer zeichnet die Form; ein Container je Pfeiler */
  private drawSupports(samples: TrackSamples, style: SkinStyle, terrain: Terrain, sky: string): void {
    const kind = supportKindFor(this.world.id);
    const plans = planSupports(samples, terrain, style.postSpacing, kind);
    const ctx = { style, world: this.world, sky, glows: [] as SupportGlow[] };
    for (const p of plans) {
      const parent = this.layers.supports.get(p.lane);
      if (!parent) continue;
      const k = laneScale(p.z);
      const bot = toLaneOf(p.x, p.ground, p.z, p.lane);
      const c = buildSupport(p, ctx);
      c.position.set(bot.X, bot.Y);
      c.scale.set(k, k);
      parent.addChild(c);
      this.supportNodes.push({ c, k, x: p.x, ground: p.ground, z: p.z, lane: p.lane });
      for (const gl of ctx.glows) this.supportGlows.push({ ...gl, lane: p.lane, X: bot.X + gl.x * k, Y: bot.Y + gl.y * k, k });
      ctx.glows.length = 0;
    }
  }

  /** Schienen, Schwellen, Elemente und Station: 3D-Schienenpunkte je Abtastpunkt in die Spur-Container projiziert */
  private drawRails(path: TrackPath, samples: TrackSamples, skin: string, style: SkinStyle, sky: string, preview: boolean): void {
    const n = samples.count;
    const banks = this.railBank;
    // 3D-Schienenpunkte je Abtastpunkt (links/rechts); projiziert wird je Stück gegen dessen Spur (drawRailChunk)
    const L3 = new Float64Array(n * 3);
    const R3 = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const st = stateAt(samples, samples.s[i]);
      const fr = frameWithBank(st, banks[i]);
      L3[i * 3] = samples.x[i] - fr.S.x * GAUGE;
      L3[i * 3 + 1] = samples.y[i] - fr.S.y * GAUGE;
      L3[i * 3 + 2] = samples.z[i] - (fr.S.z * GAUGE) / LANE_DEPTH;
      R3[i * 3] = samples.x[i] + fr.S.x * GAUGE;
      R3[i * 3 + 1] = samples.y[i] + fr.S.y * GAUGE;
      R3[i * 3 + 2] = samples.z[i] + (fr.S.z * GAUGE) / LANE_DEPTH;
    }
    let chunkStart = 0;
    let chunkLane = Math.round(samples.z[0]);
    const flush = (a: number, b: number, lane: number) => {
      if (!this.layers.rails.has(lane)) return;
      this.drawRailChunk(samples, L3, R3, a, b, lane, skin, style, sky);
    };
    for (let i = 1; i < n; i++) {
      const lane = Math.round(samples.z[i]);
      if (lane !== chunkLane) {
        flush(chunkStart, i, chunkLane);
        chunkStart = Math.max(0, i - 1);
        chunkLane = lane;
      }
    }
    flush(chunkStart, n - 1, chunkLane);
    if (!preview) this.drawElements(path, samples);
    this.drawStation(samples, style, sky);
  }

  /**
   * Perspektive: Nach einer Kamerabewegung liegen Zwischentiefen (Spurwechsel) anders in ihren Spur-Containern.
   * Schienen, Schwellen, Elemente und Station werden neu projiziert, die Pfeiler nur verschoben.
   */
  reproject(): void {
    const d = this.last;
    if (!d || !viewState().persp) return;
    for (const g of this.railUnder.values()) g.clear();
    for (const g of this.railOver.values()) g.clear();
    for (const pool of this.railPool.values()) for (const m of pool) m.hide();
    this.railUsed.clear();
    for (const g of this.glowGraphics.values()) g.clear();
    const style = SKIN_STYLES[d.skin] ?? SKIN_STYLES.skinWood;
    this.drawRails(d.path, d.samples, d.skin, style, this.world.sky[1], d.preview);
    for (const node of this.supportNodes) {
      const bot = toLaneOf(node.x, node.ground, node.z, node.lane);
      node.c.position.set(bot.X, bot.Y);
    }
  }

  private drawRailChunk(s: TrackSamples, L3: Float64Array, R3: Float64Array, a: number, b: number, lane: number, skin: string, style: SkinStyle, sky: string): void {
    const k = laneScale(lane);
    const tie = atmosphere(style.tie, lane, sky);
    const under = this.railUnder.get(lane)!;
    const over = this.railOver.get(lane)!;
    const left: StripPoint[] = [];
    const right: StripPoint[] = [];
    const center: number[] = [];
    // Perspektive: Zwischentiefen gegen die Spur dieses Stücks korrigiert (Lage und Breite), damit das Stück an seiner
    // Grenze nahtlos an das nächste anschließt
    const ratio: number[] = [];
    for (let i = a; i <= b; i++) {
      const pl = toLaneOf(L3[i * 3], L3[i * 3 + 1], L3[i * 3 + 2], lane);
      const pr = toLaneOf(R3[i * 3], R3[i * 3 + 1], R3[i * 3 + 2], lane);
      const pc = toLaneOf(s.x[i], s.y[i], s.z[i], lane);
      left.push({ x: pl.X, y: pl.Y });
      right.push({ x: pr.X, y: pr.Y });
      center.push(pc.X, pc.Y);
      ratio.push(laneRatioFor(s.z[i], lane, s.y[i]));
    }
    // Schwellen zwischen den Schienen
    let nextS = s.s[a];
    const tieSpacing = style.support === 'steel' || style.support === 'space' || style.support === 'neon' ? 1.4 : 0.8;
    const tieW = (style.support === 'wood' || style.support === 'mine' || style.support === 'hybrid' || style.support === 'ghost' ? 0.17 : 0.12) * k;
    for (let i = a; i <= b; i++) {
      if (s.s[i] < nextS) continue;
      nextS = s.s[i] + tieSpacing;
      const l = left[i - a];
      const r = right[i - a];
      const dx = r.x - l.x;
      const dy = r.y - l.y;
      const ext = 0.18;
      under.moveTo(l.x - dx * ext, l.y - dy * ext).lineTo(r.x + dx * ext, r.y + dy * ext).stroke({ width: tieW * ratio[i - a], color: hexNum(tie), cap: 'round' });
    }
    // Schienen als Band-Mesh (Profil: Tinte – Schiene – Lichtkante), UV läuft mit der Bogenlänge weiter
    const tex = this.railTexture(skin, style, lane, sky);
    const uOffset = s.s[a] * k;
    for (const pts of [left, right]) {
      const m = this.takeRail(lane);
      m.texture = tex;
      m.setPath(pts, (_s, i) => RAIL_HALF * k * ratio[i], 1 / (RAIL_REPEAT * k), uOffset);
    }
    if (style.glow) {
      over.poly(center, false).stroke({ width: 0.05 * k, color: hexNum(style.glow), alpha: 0.6, cap: 'round', join: 'round' });
      // Leuchtkante in der additiven Leuchtebene (weichgezeichnet)
      const gg = this.glowGraphic(lane);
      if (gg) gg.poly(center, false).stroke({ width: 0.22 * k, color: hexNum(style.glow), alpha: 0.9, cap: 'round', join: 'round' });
    }
  }

  private drawElements(path: TrackPath, s: TrackSamples): void {
    const Ln = s.length;
    for (const e of path.elements) {
      const color = e.kind === 'booster' || e.kind === 'launchBlock' ? '#ff8a5c' : e.kind === 'brake' ? '#d64545' : e.kind === 'splash' ? '#3ec7c2' : '#9b6dff';
      const idx: number[] = [];
      for (let d = 0; d <= e.length; d += 0.5) {
        const sv = ((e.s + d) % Ln + Ln) % Ln;
        idx.push(Math.min(s.count - 1, Math.round(sv / s.step)));
      }
      const lane = idx.length ? Math.round(s.z[idx[Math.floor(idx.length / 2)]]) : 0;
      const pts: number[] = [];
      for (const i of idx) {
        const p = toLaneOf(s.x[i], s.y[i], s.z[i], lane);
        pts.push(p.X, p.Y);
      }
      const g = this.railOver.get(lane);
      if (!g || pts.length < 4) continue;
      const k = laneScale(lane);
      g.poly(pts, false).stroke({ width: 0.7 * k, color: hexNum(shade(color, -0.4)), cap: 'round', join: 'round' });
      g.poly(pts, false).stroke({ width: 0.5 * k, color: hexNum(color), cap: 'round', join: 'round' });
      for (let j = 0; j + 3 < pts.length; j += 4) g.circle(pts[j], pts[j + 1], 0.12 * k).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  private drawStation(s: TrackSamples, style: SkinStyle, sky: string): void {
    const lane = Math.round(s.z[0]);
    const g = this.railOver.get(lane);
    if (!g) return;
    const k = laneScale(lane);
    const p = toLaneOf(s.x[0], s.y[0], s.z[0], lane);
    const col = atmosphere(style.post, lane, sky);
    g.roundRect(p.X - 3.2 * k, p.Y - 0.9 * k, 6.4 * k, 0.6 * k, 0.2 * k).fill(hexNum(shade(col, -0.1))).stroke({ width: 0.1 * k, color: hexNum(shade(col, -0.5)) });
    for (const dx of [-2.6, 2.6]) g.moveTo(p.X + dx * k, p.Y - 0.3 * k).lineTo(p.X + dx * k, p.Y + 2.8 * k).stroke({ width: 0.2 * k, color: hexNum(col) });
    g.moveTo(p.X - 3.4 * k, p.Y + 2.8 * k).lineTo(p.X, p.Y + 3.6 * k).lineTo(p.X + 3.4 * k, p.Y + 2.8 * k).closePath().fill(hexNum(mix('#ff5c8a', col, 0.3))).stroke({ width: 0.12 * k, color: hexNum(shade(col, -0.5)) });
    g.moveTo(p.X, p.Y + 3.6 * k).lineTo(p.X, p.Y + 4.6 * k).stroke({ width: 0.08 * k, color: 0x2a1f3d });
    g.poly([p.X, p.Y + 4.6 * k, p.X + 1.1 * k, p.Y + 4.25 * k, p.X, p.Y + 3.9 * k]).fill(0xffd23f);
  }

  setCoins(coins: Array<{ x: number; y: number; lane?: number }>): void {
    for (const c of this.layers.coins.values()) c.removeChildren();
    this.coinSprites = [];
    coins.forEach((c, i) => {
      const lane = Math.round(c.lane ?? 0);
      const parent = this.layers.coins.get(lane);
      if (!parent) return;
      const k = laneScale(lane);
      const g = new MGraphics();
      const p = toStage(c.x, c.y, lane);
      g.position.set(p.X, p.Y);
      g.scale.set(k / 100);
      g.circle(0, 0, 0.95).fill({ color: 0xd9a21b, alpha: 0.5 });
      g.circle(0, 0, 0.75).fill(0xffd23f).stroke({ width: 0.1, color: 0xb57a10 });
      g.circle(-0.2, 0.2, 0.28).fill({ color: 0xffffff, alpha: 0.75 });
      g.rect(-0.12, -0.42, 0.24, 0.84).fill({ color: 0xb57a10, alpha: 0.6 });
      parent.addChild(g);
      this.coinSprites[i] = g;
    });
  }

  updateCoins(collected: boolean[], time: number): void {
    this.coinSprites.forEach((g, i) => {
      if (!g) return;
      if (collected[i]) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const k = g.scale.y;
      g.scale.x = k * (0.55 + 0.45 * Math.abs(Math.cos(time * 3 + i)));
    });
  }
}
