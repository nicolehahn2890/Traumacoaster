/**
 * Schienen, Schwellen, Streben und Elemente in gemaltem Stil, pro Schienen-Skin.
 * Die Bahn wird nach Spuren in Stücke geteilt, damit sie in der richtigen Tiefenebene liegt.
 */
import { Container, Graphics } from 'pixi.js';
import { MGraphics } from './mgraphics';
import type { TrackPath, TrackSamples } from '@/track/model';
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import { laneScale, toStage, LANE_MIN, LANE_MAX } from '@/track/stage';
import { hexNum, mix, shade } from './paint';
import { noise1 } from '@/core/math';
import { atmosphere } from './terrainRenderer';

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

export interface TrackLayers {
  supports: Map<number, Graphics>;
  rails: Map<number, Graphics>;
  coins: Map<number, Container>;
}

export interface TunnelPortal {
  x: number;
  y: number;
  z: number;
  dir: number;
}

export class TrackRenderer {
  readonly layers: TrackLayers = { supports: new Map(), rails: new Map(), coins: new Map() };
  private coinSprites: Graphics[] = [];
  private world: WorldDef;

  constructor(world: WorldDef) {
    this.world = world;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      this.layers.supports.set(z, new Graphics());
      this.layers.rails.set(z, new Graphics());
      this.layers.coins.set(z, new Container());
    }
  }

  clear(): void {
    for (const g of this.layers.supports.values()) g.clear();
    for (const g of this.layers.rails.values()) g.clear();
  }

  /** Zeichnet die Bahn komplett neu. Liefert die Tunnelportale (Ein-/Austritte in Berge). */
  draw(path: TrackPath, samples: TrackSamples, skin: string, terrain: Terrain, allowTunnels: boolean, preview = false): TunnelPortal[] {
    this.clear();
    const portals: TunnelPortal[] = [];
    if (samples.count < 2) return portals;
    const style = SKIN_STYLES[skin] ?? SKIN_STYLES.skinWood;
    const sky = this.world.sky[1];

    // Streben
    if (!preview) this.drawSupports(samples, style, terrain, sky);

    // Schienen in Stücken je Spur
    const n = samples.count;
    let chunkStart = 0;
    let chunkLane = Math.round(samples.z[0]);
    const flush = (a: number, b: number, lane: number) => {
      const g = this.layers.rails.get(lane);
      if (!g) return;
      this.drawRailChunk(g, samples, a, b, lane, style, sky, preview);
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

    // Elemente
    if (!preview) this.drawElements(path, samples, style);

    // Tunnelportale
    let wasInside = terrain.insideMountain(samples.x[0], samples.y[0], samples.z[0]);
    for (let i = 1; i < n; i++) {
      const inside = terrain.insideMountain(samples.x[i], samples.y[i], samples.z[i]);
      if (inside !== wasInside && allowTunnels) portals.push({ x: samples.x[i], y: samples.y[i], z: samples.z[i], dir: inside ? 1 : -1 });
      wasInside = inside;
    }
    // Station
    if (!preview) this.drawStation(samples, style, sky);
    return portals;
  }

  private drawSupports(samples: TrackSamples, style: SkinStyle, terrain: Terrain, sky: string): void {
    let nextS = 0;
    const spacing = style.postSpacing;
    for (let i = 0; i < samples.count; i++) {
      const s = samples.s[i];
      if (s < nextS) continue;
      nextS = s + spacing;
      const x = samples.x[i];
      const y = samples.y[i];
      const z = samples.z[i];
      const lane = Math.round(z);
      const g = this.layers.supports.get(lane);
      if (!g) continue;
      // keine Stützen kopfüber, im Berg, auf der Bremsstrecke-Kehre oder dicht am Boden
      if (samples.upy[i] < 0.35) continue;
      if (terrain.insideMountain(x, y, z)) continue;
      const ground = terrain.groundHeight(x, z) + terrain.mountainHeight(x, z);
      const h = y - ground;
      if (h < 1.0) continue;
      const k = laneScale(z);
      const top = toStage(x, y - 0.25, z);
      const bot = toStage(x, ground, z);
      const post = atmosphere(style.post, z, sky);
      const brace = atmosphere(style.brace, z, sky);
      const ink = shade(post, -0.45);
      const w = (style.support === 'steel' || style.support === 'neon' ? 0.32 : 0.26) * k;
      const wob = (seed: number) => noise1(seed * 0.37 + i, 3) * 0.12 * k;
      switch (style.support) {
        case 'wood':
        case 'hybrid':
        case 'mine':
        case 'ghost': {
          // zwei Pfosten + Querriegel + Kreuzstreben
          const dx = 0.7 * k;
          const lean = style.support === 'ghost' ? wob(i) * 3 : 0;
          for (const sx of [-dx, dx]) {
            g.moveTo(top.X + sx * 0.6, top.Y).lineTo(bot.X + sx + lean, bot.Y).stroke({ width: w, color: hexNum(post), cap: 'round' });
            g.moveTo(top.X + sx * 0.6, top.Y).lineTo(bot.X + sx + lean, bot.Y).stroke({ width: w * 0.35, color: hexNum(ink), alpha: 0.35, cap: 'round' });
          }
          const levels = Math.max(1, Math.floor((top.Y - bot.Y) / (3 * k)));
          for (let l = 0; l <= levels; l++) {
            const f = l / (levels + 0.001);
            const yy = bot.Y + (top.Y - bot.Y) * f;
            const sxl = -dx + (-dx * 0.6 + dx) * f;
            const sxr = dx - (dx - dx * 0.6) * f;
            g.moveTo(top.X + sxl + wob(l), yy).lineTo(top.X + sxr + wob(l + 7), yy).stroke({ width: w * 0.7, color: hexNum(brace), cap: 'round' });
            if (l < levels) {
              const yy2 = bot.Y + (top.Y - bot.Y) * ((l + 1) / (levels + 0.001));
              g.moveTo(top.X + sxl, yy).lineTo(top.X + sxr, yy2).stroke({ width: w * 0.45, color: hexNum(brace), alpha: 0.9, cap: 'round' });
              g.moveTo(top.X + sxr, yy).lineTo(top.X + sxl, yy2).stroke({ width: w * 0.45, color: hexNum(brace), alpha: 0.9, cap: 'round' });
            }
          }
          if (style.support === 'hybrid' || style.support === 'ghost') {
            // Lichterkette / Laterne
            const col = style.glow ?? '#ffd23f';
            g.circle(top.X, top.Y - 0.9 * k, 0.22 * k).fill({ color: hexNum(col), alpha: 0.9 });
          }
          break;
        }
        case 'steel':
        case 'gold':
        case 'neon':
        case 'lava': {
          const lean = 0.25 * k * (i % 2 === 0 ? 1 : -1);
          g.moveTo(top.X, top.Y).lineTo(bot.X + lean, bot.Y).stroke({ width: w, color: hexNum(post), cap: 'round' });
          g.moveTo(top.X - w * 0.3, top.Y).lineTo(bot.X + lean - w * 0.3, bot.Y).stroke({ width: w * 0.3, color: hexNum(shade(post, 0.3)), alpha: 0.7, cap: 'round' });
          // Fuß
          g.ellipse(bot.X + lean, bot.Y, 0.7 * k, 0.22 * k).fill(hexNum(shade(post, -0.2)));
          if (style.glow) g.moveTo(top.X, top.Y).lineTo(bot.X + lean, bot.Y).stroke({ width: w * 0.2, color: hexNum(style.glow), alpha: 0.8 });
          if (style.support === 'gold') g.circle(top.X, top.Y - 0.5 * k, 0.3 * k).fill(hexNum('#fff1b8'));
          break;
        }
        case 'ice': {
          // Eiskristall: zwei schräge Stäbe
          g.moveTo(top.X, top.Y).lineTo(bot.X - 0.5 * k, bot.Y).lineTo(bot.X + 0.5 * k, bot.Y).closePath().fill({ color: hexNum(post), alpha: 0.85 }).stroke({ width: 0.12 * k, color: 0xffffff, alpha: 0.9 });
          g.moveTo(top.X - 0.15 * k, top.Y).lineTo(bot.X - 0.2 * k, bot.Y).stroke({ width: 0.08 * k, color: 0xffffff, alpha: 0.7 });
          break;
        }
        case 'space': {
          // schwebende Magnetplatte unter der Schiene
          g.roundRect(top.X - 0.8 * k, top.Y - 0.9 * k, 1.6 * k, 0.35 * k, 0.15 * k).fill(hexNum(post));
          g.moveTo(top.X, top.Y).lineTo(top.X, top.Y - 0.6 * k).stroke({ width: 0.15 * k, color: hexNum(style.glow ?? '#7fd3ff'), alpha: 0.8 });
          g.circle(top.X, top.Y - 1.3 * k, 0.25 * k).fill({ color: hexNum(style.glow ?? '#7fd3ff'), alpha: 0.5 });
          break;
        }
      }
    }
  }

  private drawRailChunk(g: Graphics, s: TrackSamples, a: number, b: number, lane: number, style: SkinStyle, sky: string, preview: boolean): void {
    const k = laneScale(lane);
    const rail = atmosphere(style.rail, lane, sky);
    const light = atmosphere(style.railLight, lane, sky);
    const tie = atmosphere(style.tie, lane, sky);
    const ink = shade(rail, -0.5);
    const gauge = 0.22 * k;
    const left: number[] = [];
    const right: number[] = [];
    const center: number[] = [];
    for (let i = a; i <= b; i++) {
      const p = toStage(s.x[i], s.y[i], s.z[i]);
      const nx = -s.ty[i];
      const ny = s.tx[i];
      left.push(p.X + nx * gauge, p.Y + ny * gauge);
      right.push(p.X - nx * gauge, p.Y - ny * gauge);
      center.push(p.X, p.Y);
    }
    if (preview) {
      g.poly(center, false).stroke({ width: 0.5 * k, color: hexNum(light), alpha: 0.9, cap: 'round', join: 'round' });
      g.poly(center, false).stroke({ width: 0.2 * k, color: 0xffffff, alpha: 0.8, cap: 'round', join: 'round' });
      return;
    }
    // Schwellen
    let nextS = s.s[a];
    const tieSpacing = style.support === 'steel' || style.support === 'space' || style.support === 'neon' ? 1.4 : 0.8;
    for (let i = a; i <= b; i++) {
      if (s.s[i] < nextS) continue;
      nextS = s.s[i] + tieSpacing;
      const p = toStage(s.x[i], s.y[i], s.z[i]);
      const nx = -s.ty[i];
      const ny = s.tx[i];
      const len = (style.support === 'wood' || style.support === 'mine' || style.support === 'hybrid' || style.support === 'ghost' ? 0.46 : 0.34) * k;
      const w = noise1(i * 0.5, 2) * 0.03 * k;
      g.moveTo(p.X + nx * len + w, p.Y + ny * len).lineTo(p.X - nx * len, p.Y - ny * len - w).stroke({ width: 0.17 * k, color: hexNum(tie), cap: 'round' });
    }
    // Schienen: Kontur, Körper, Glanz
    g.poly(left, false).stroke({ width: 0.28 * k, color: hexNum(ink), alpha: 0.7, cap: 'round', join: 'round' });
    g.poly(right, false).stroke({ width: 0.28 * k, color: hexNum(ink), alpha: 0.7, cap: 'round', join: 'round' });
    g.poly(left, false).stroke({ width: 0.17 * k, color: hexNum(rail), cap: 'round', join: 'round' });
    g.poly(right, false).stroke({ width: 0.17 * k, color: hexNum(rail), cap: 'round', join: 'round' });
    g.poly(left, false).stroke({ width: 0.06 * k, color: hexNum(light), alpha: 0.9, cap: 'round', join: 'round' });
    g.poly(right, false).stroke({ width: 0.06 * k, color: hexNum(light), alpha: 0.9, cap: 'round', join: 'round' });
    if (style.glow) {
      g.poly(center, false).stroke({ width: 0.05 * k, color: hexNum(style.glow), alpha: 0.6, cap: 'round', join: 'round' });
    }
  }

  private drawElements(path: TrackPath, s: TrackSamples, style: SkinStyle): void {
    const L = s.length;
    for (const e of path.elements) {
      const color = e.kind === 'booster' || e.kind === 'launchBlock' ? '#ff8a5c' : e.kind === 'brake' ? '#d64545' : e.kind === 'splash' ? '#3ec7c2' : '#9b6dff';
      const pts: number[] = [];
      let lane = 0;
      for (let d = 0; d <= e.length; d += 0.5) {
        const sv = ((e.s + d) % L + L) % L;
        const i = Math.min(s.count - 1, Math.round(sv / s.step));
        const p = toStage(s.x[i], s.y[i], s.z[i]);
        pts.push(p.X, p.Y);
        lane = Math.round(s.z[i]);
      }
      const g = this.layers.rails.get(lane);
      if (!g || pts.length < 4) continue;
      const k = laneScale(lane);
      g.poly(pts, false).stroke({ width: 0.7 * k, color: hexNum(shade(color, -0.4)), cap: 'round', join: 'round' });
      g.poly(pts, false).stroke({ width: 0.5 * k, color: hexNum(color), cap: 'round', join: 'round' });
      // Pfeile/Streifen
      for (let j = 0; j + 3 < pts.length; j += 4) {
        g.circle(pts[j], pts[j + 1], 0.12 * k).fill({ color: 0xffffff, alpha: 0.9 });
      }
      void style;
    }
  }

  private drawStation(s: TrackSamples, style: SkinStyle, sky: string): void {
    const lane = Math.round(s.z[0]);
    const g = this.layers.rails.get(lane);
    if (!g) return;
    const k = laneScale(lane);
    const p = toStage(s.x[0], s.y[0], s.z[0]);
    const col = atmosphere(style.post, lane, sky);
    // Bahnsteig + Dach
    g.roundRect(p.X - 3.2 * k, p.Y - 0.9 * k, 6.4 * k, 0.6 * k, 0.2 * k).fill(hexNum(shade(col, -0.1))).stroke({ width: 0.1 * k, color: hexNum(shade(col, -0.5)) });
    for (const dx of [-2.6, 2.6]) g.moveTo(p.X + dx * k, p.Y - 0.3 * k).lineTo(p.X + dx * k, p.Y + 2.8 * k).stroke({ width: 0.2 * k, color: hexNum(col) });
    g.moveTo(p.X - 3.4 * k, p.Y + 2.8 * k).lineTo(p.X, p.Y + 3.6 * k).lineTo(p.X + 3.4 * k, p.Y + 2.8 * k).closePath().fill(hexNum(mix('#ff5c8a', col, 0.3))).stroke({ width: 0.12 * k, color: hexNum(shade(col, -0.5)) });
    // Fähnchen
    g.moveTo(p.X, p.Y + 3.6 * k).lineTo(p.X, p.Y + 4.6 * k).stroke({ width: 0.08 * k, color: 0x2a1f3d });
    g.poly([p.X, p.Y + 4.6 * k, p.X + 1.1 * k, p.Y + 4.25 * k, p.X, p.Y + 3.9 * k]).fill(0xffd23f);
  }

  /** Coins: pro Spur in einem Container; collected[] blendet eingesammelte aus */
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
      g.rotation = 0;
      const k = g.scale.y;
      g.scale.x = k * (0.55 + 0.45 * Math.abs(Math.cos(time * 3 + i)));
    });
  }
}
