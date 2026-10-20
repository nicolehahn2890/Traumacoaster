/**
 * Terrain-Darstellung: fünf gemalte Bodenstreifen (Spuren), Berge mit Tunnelportalen, Wasser, Deko.
 * Alles in Bühnen-Metern (Y nach oben) innerhalb des Welt-Containers.
 */
import { Container, Graphics } from 'pixi.js';
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import { laneAtmosphere, laneRise, laneScale, toStage, LANE_MIN, LANE_MAX } from '@/track/stage';
import { hexNum, mix, shade, wobble } from './paint';
import { noise1, rng } from '@/core/math';
import { drawProp } from './props';

export interface TerrainLayerSet {
  /** Bodenstreifen pro Spur (z → Graphics), bereits in der Reihenfolge hinten→vorne */
  strip: Map<number, Graphics>;
  /** Berge/Wasser/Deko pro Spur (werden NACH der Bahn gezeichnet: Tunnel-Effekt) */
  cover: Map<number, Container>;
}

/** Farbe mit Luftperspektive: hinten heller und Richtung Himmel */
export function atmosphere(color: string, z: number, sky: string): string {
  const a = laneAtmosphere(z);
  return mix(color, sky, a * 0.45);
}

export class TerrainRenderer {
  readonly layers: TerrainLayerSet = { strip: new Map(), cover: new Map() };
  private terrain: Terrain;
  private world: WorldDef;
  private trackEntries: Array<{ x: number; y: number; z: number; dir: number }> = [];

  constructor(terrain: Terrain, world: WorldDef) {
    this.terrain = terrain;
    this.world = world;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      this.layers.strip.set(z, new Graphics());
      this.layers.cover.set(z, new Container());
    }
    this.redraw();
  }

  /** Tunnelportale: Stellen, an denen die Bahn in einen Berg eintritt/austritt */
  setTunnelPortals(entries: Array<{ x: number; y: number; z: number; dir: number }>): void {
    this.trackEntries = entries;
    this.redraw();
  }

  redraw(): void {
    const t = this.terrain;
    const sky = this.world.sky[1];
    const x0 = -220;
    const x1 = t.width + 220;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      const g = this.layers.strip.get(z)!;
      g.clear();
      const cover = this.layers.cover.get(z)!;
      cover.removeChildren();
      const k = laneScale(z);
      const front = shade(this.world.ground[0], (z - LANE_MIN) * 0.04);
      const base = atmosphere(z >= 0 ? this.world.ground[1] : this.world.ground[0], z, sky);
      const top = atmosphere(shade(front, 0.1), z, sky);
      // Oberkante
      const topPts: Array<{ x: number; y: number }> = [];
      for (let x = x0; x <= x1; x += 2) {
        const p = toStage(x, t.groundHeight(x, z), z);
        topPts.push({ x: p.X, y: p.Y });
      }
      const wob = wobble(topPts, 0.12 * k, z + 11, 0.9);
      const bottomY = z > LANE_MIN ? laneRise(z - 1) - 6 : laneRise(z) - 60;
      const poly: number[] = [];
      for (const p of wob) poly.push(p.x, p.y);
      poly.push(wob[wob.length - 1].x, bottomY, wob[0].x, bottomY);
      g.poly(poly).fill(hexNum(base));
      // Lichtband oben (gemalte Grasnarbe / Kante)
      const band: number[] = [];
      for (const p of wob) band.push(p.x, p.y);
      for (let i = wob.length - 1; i >= 0; i--) band.push(wob[i].x, wob[i].y - 1.1 * k - Math.abs(noise1(i * 0.3, z)) * 0.6 * k);
      g.poly(band).fill({ color: hexNum(top), alpha: 0.85 });
      // Kontur
      g.poly(wob.flatMap((p) => [p.x, p.y]), false).stroke({ width: 0.22 * k, color: hexNum(shade(base, -0.35)), alpha: 0.6, join: 'round', cap: 'round' });
      // Tupfer (Blumen/Steine) je Welt
      this.dots(g, z, x0, x1);

      // Wasser
      for (const w of t.water) {
        if (w.kind === 'lake' && w.lane !== undefined && Math.abs(w.lane - z) >= 0.75) continue;
        this.drawWater(cover, w.x, w.width, z);
      }
      // Berge (mit Tunnelportalen)
      for (const m of t.mountains) {
        if (m.lane !== undefined && Math.abs(m.lane - z) >= 0.75) continue;
        this.drawMountain(cover, m.x, m.width, m.height, z);
      }
      // Wasserfälle
      for (const wf of t.waterfalls) {
        if (wf.lane !== undefined && Math.abs(wf.lane - z) >= 0.75) continue;
        this.drawWaterfall(cover, wf.x, wf.height, z);
      }
      // Deko
      for (const p of t.props) {
        if (Math.round(p.lane) !== z) continue;
        const c = new Container();
        const st = toStage(p.x, t.groundHeight(p.x, z), z);
        c.position.set(st.X, st.Y);
        c.scale.set(k);
        drawProp(c, p.id, this.world, z);
        cover.addChild(c);
      }
    }
  }

  private dots(g: Graphics, z: number, x0: number, x1: number): void {
    const r = rng(z * 17 + this.world.id * 3);
    const k = laneScale(z);
    const t = this.terrain;
    const palette = this.world.id === 1 || this.world.id === 4 || this.world.id === 5 ? ['#ffffff', '#ffd23f', '#ff6ec7', '#8fd3ff'] : this.world.id === 7 ? ['#ffffff', '#dff3ff'] : this.world.id === 10 ? ['#c4b5fd', '#ffffff'] : ['#5a3a22', '#8a5a2b', '#3a2a1a'];
    const count = Math.floor((x1 - x0) / 5);
    for (let i = 0; i < count; i++) {
      const x = x0 + r() * (x1 - x0);
      const gh = t.groundHeight(x, z);
      if (t.waterAt(x, z)) continue;
      const p = toStage(x, gh - 0.2 - r() * 1.5, z);
      const col = palette[Math.floor(r() * palette.length)];
      g.circle(p.X, p.Y, (0.12 + r() * 0.16) * k).fill({ color: hexNum(col), alpha: 0.7 });
    }
  }

  private drawWater(parent: Container, cx: number, width: number, z: number): void {
    const g = new Graphics();
    const k = laneScale(z);
    const t = this.terrain;
    const sky = this.world.sky[1];
    const water = atmosphere(this.world.id === 9 ? '#ff6a2a' : '#3ec7c2', z, sky);
    const deep = shade(water, -0.25);
    const left = cx - width / 2 + 1.5;
    const right = cx + width / 2 - 1.5;
    const top: Array<{ x: number; y: number }> = [];
    for (let x = left; x <= right; x += 1.5) {
      const p = toStage(x, 0.05 + noise1(x * 0.5, 3) * 0.08, z);
      top.push({ x: p.X, y: p.Y });
    }
    const bottomPts: number[] = [];
    for (let x = right; x >= left; x -= 1.5) {
      const p = toStage(x, t.groundHeight(x, z) - 0.3, z);
      bottomPts.push(p.X, p.Y);
    }
    g.poly([...top.flatMap((p) => [p.x, p.y]), ...bottomPts]).fill(hexNum(deep));
    // Oberfläche: hellere Lage mit Glanzstrichen
    const surf: number[] = [];
    for (const p of top) surf.push(p.x, p.y);
    for (let i = top.length - 1; i >= 0; i--) surf.push(top[i].x, top[i].y - 0.9 * k);
    g.poly(surf).fill({ color: hexNum(water), alpha: 0.95 });
    const r = rng(Math.round(cx) + z);
    for (let i = 0; i < width / 3; i++) {
      const x = left + 2 + r() * (width - 7);
      const p = toStage(x, -0.1 - r() * 1.2, z);
      g.moveTo(p.X, p.Y).lineTo(p.X + (1.5 + r() * 3) * k, p.Y).stroke({ width: 0.14 * k, color: 0xffffff, alpha: 0.55, cap: 'round' });
    }
    parent.addChild(g);
  }

  private drawMountain(parent: Container, cx: number, width: number, height: number, z: number): void {
    const g = new Graphics();
    const k = laneScale(z);
    const t = this.terrain;
    const sky = this.world.sky[1];
    const rock = this.world.id === 7 ? '#dff3ff' : this.world.id === 10 ? '#8b7fb5' : this.world.id === 9 ? '#3a2420' : this.world.id === 6 ? '#55596b' : this.world.id === 8 ? '#3a3350' : '#a0765a';
    const base = atmosphere(rock, z, sky);
    const light = shade(base, 0.22);
    const dark = shade(base, -0.3);
    const left = cx - width / 2;
    const right = cx + width / 2;
    const outline: Array<{ x: number; y: number }> = [];
    for (let x = left; x <= right; x += 1) {
      const p = toStage(x, t.groundHeight(x, z) + t.mountainHeight(x, z), z);
      outline.push({ x: p.X, y: p.Y });
    }
    const wob = wobble(outline, 0.25 * k, Math.round(cx), 0.8);
    const poly: number[] = wob.flatMap((p) => [p.x, p.y]);
    const pl = toStage(left, t.groundHeight(left, z) - 1, z);
    const pr = toStage(right, t.groundHeight(right, z) - 1, z);
    poly.push(pr.X, pr.Y, pl.X, pl.Y);
    g.poly(poly).fill(hexNum(base));
    // Lichtseite (links oben) und Schattenseite
    const lightPoly: number[] = [];
    for (let i = 0; i < Math.floor(wob.length * 0.55); i++) lightPoly.push(wob[i].x, wob[i].y);
    const mid = toStage(cx, t.groundHeight(cx, z) + height * 0.1, z);
    lightPoly.push(mid.X, mid.Y, pl.X, pl.Y);
    g.poly(lightPoly).fill({ color: hexNum(light), alpha: 0.5 });
    const shadowPoly: number[] = [];
    for (let i = Math.floor(wob.length * 0.6); i < wob.length; i++) shadowPoly.push(wob[i].x, wob[i].y);
    shadowPoly.push(pr.X, pr.Y, mid.X, mid.Y);
    g.poly(shadowPoly).fill({ color: hexNum(dark), alpha: 0.35 });
    // Felsstriche
    const r = rng(Math.round(cx * 7) + z);
    for (let i = 0; i < width / 2; i++) {
      const x = left + 2 + r() * (width - 4);
      const yy = t.groundHeight(x, z) + t.mountainHeight(x, z) * (0.2 + r() * 0.7);
      const p = toStage(x, yy, z);
      g.moveTo(p.X, p.Y).lineTo(p.X + (1 + r() * 3) * k * (r() < 0.5 ? -1 : 1), p.Y - (0.3 + r() * 1.2) * k).stroke({ width: 0.16 * k, color: hexNum(dark), alpha: 0.5, cap: 'round' });
    }
    g.poly(wob.flatMap((p) => [p.x, p.y]), false).stroke({ width: 0.26 * k, color: hexNum(shade(base, -0.45)), alpha: 0.8, join: 'round', cap: 'round' });
    // Schnee / Lavaglut oben
    if (this.world.id === 7 || this.world.id === 3) {
      const snow: number[] = [];
      const start = Math.floor(wob.length * 0.3);
      const end = Math.floor(wob.length * 0.7);
      for (let i = start; i <= end; i++) snow.push(wob[i].x, wob[i].y);
      for (let i = end; i >= start; i--) snow.push(wob[i].x, wob[i].y - (1.5 + Math.abs(noise1(i, 4)) * 1.5) * k);
      g.poly(snow).fill({ color: this.world.id === 7 ? 0xffffff : 0xe8d9b5, alpha: 0.9 });
    }
    // Tunnelportale
    for (const e of this.trackEntries) {
      if (Math.abs(e.z - z) > 0.6 || e.x < left || e.x > right) continue;
      const p = toStage(e.x, e.y, e.z);
      const pr2 = 1.6 * laneScale(e.z);
      g.circle(p.X, p.Y + 0.7 * k, pr2 * 1.25).fill(hexNum(shade(base, -0.5)));
      g.circle(p.X, p.Y + 0.7 * k, pr2).fill(0x14101a);
      g.circle(p.X, p.Y + 0.7 * k, pr2 * 1.25).stroke({ width: 0.2 * k, color: hexNum(shade(base, 0.2)) });
    }
    parent.addChild(g);
  }

  private drawWaterfall(parent: Container, x: number, height: number, z: number): void {
    const g = new Graphics();
    const k = laneScale(z);
    const t = this.terrain;
    const top = toStage(x + 1, t.groundHeight(x - 4, z), z);
    const bottom = toStage(x + 3, t.groundHeight(x + 6, z), z);
    const w = 2.2 * k;
    g.moveTo(top.X - w / 2, top.Y).bezierCurveTo(top.X + w, top.Y - height * 0.3 * k, bottom.X - w, bottom.Y + 2 * k, bottom.X, bottom.Y)
      .lineTo(bottom.X + w, bottom.Y).bezierCurveTo(bottom.X, bottom.Y + 2 * k, top.X + w * 1.5, top.Y - height * 0.3 * k, top.X + w / 2, top.Y).closePath()
      .fill({ color: 0xbfefff, alpha: 0.85 });
    for (let i = 0; i < 6; i++) {
      const f = i / 6;
      const yy = top.Y - (top.Y - bottom.Y) * f;
      g.moveTo(top.X + f * (bottom.X - top.X) - w * 0.3, yy).lineTo(top.X + f * (bottom.X - top.X) + w * 0.1, yy - 1.2 * k).stroke({ width: 0.18 * k, color: 0xffffff, alpha: 0.8, cap: 'round' });
    }
    // Gischt unten
    for (let i = 0; i < 7; i++) g.circle(bottom.X - 2 * k + i * 0.7 * k, bottom.Y + 0.3 * k + (i % 2) * 0.4 * k, (0.5 + (i % 3) * 0.2) * k).fill({ color: 0xffffff, alpha: 0.6 });
    parent.addChild(g);
  }
}
