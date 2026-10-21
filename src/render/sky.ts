/**
 * Himmel, Sonne/Mond, Wolken mit Parallaxe und ferne Hügel-Silhouette. Alles in Bildschirm-Pixeln,
 * verschiebt sich mit der Kamera nur zu einem Bruchteil.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { WorldDef } from '@/levels/types';
import { art, ART_NAMES, hasArt } from '@/assets/manifest';
import { cloudTexture, hexNum, mix, shade, skyTexture } from './paint';
import type { Camera } from './camera';
import { noise1, rng } from '@/core/math';

interface Cloud {
  sprite: Sprite;
  x: number; // Bühnen-Meter (virtuell)
  y: number;
  depth: number; // 0 nah … 1 fern
  speed: number;
}

import { cloudScreenX, cloudScreenY, type SkyView } from './skyMath';

export type { SkyView } from './skyMath';

/** Übergabe-Zustand zwischen Karte und Level, damit Wolken beim Szenenwechsel nicht springen */
export interface SkyState {
  worldId: number;
  time: number;
  clouds: Array<{ x: number; y: number; depth: number; speed: number }>;
}

export class Sky {
  readonly container = new Container();
  private skySprite: Sprite;
  /** alter Himmel, der beim Weltwechsel ausblendet */
  private skyOld: Sprite;
  private fadeLeft = 0;
  private fadeDur = 0.6;
  private sun = new Graphics();
  private hills = new Graphics();
  private cloudLayer = new Container();
  private clouds: Cloud[] = [];
  private world: WorldDef;
  private night = false;
  private time = 0;
  private w = 800;
  private h = 600;

  constructor(world: WorldDef, night = false) {
    this.world = world;
    this.night = night;
    this.skySprite = new Sprite(art(ART_NAMES.sky(world.id), () => skyTexture(`w${world.id}`, world.sky, world.id)));
    this.skyOld = new Sprite(this.skySprite.texture);
    this.skyOld.alpha = 0;
    this.container.addChild(this.skySprite, this.skyOld, this.sun, this.hills, this.cloudLayer);
    this.buildClouds();
    this.drawSun();
  }

  get worldId(): number {
    return this.world.id;
  }

  /** Welt wechseln; der alte Himmel blendet in fade Sekunden aus, die Wolken behalten ihre Lage (nur neue Tönung) */
  setWorld(world: WorldDef, night = false, fade = 0.6): void {
    if (world.id === this.world.id && night === this.night) return;
    const sameCloudCount = this.cloudCount(world) === this.clouds.length;
    this.skyOld.texture = this.skySprite.texture;
    this.skyOld.alpha = fade > 0 ? 1 : 0;
    this.fadeLeft = fade;
    this.fadeDur = Math.max(1e-6, fade);
    this.world = world;
    this.night = night;
    this.skySprite.texture = art(ART_NAMES.sky(world.id), () => skyTexture(`w${world.id}`, world.sky, world.id));
    if (sameCloudCount) this.retintClouds();
    else {
      this.cloudLayer.removeChildren();
      this.clouds = [];
      this.buildClouds();
    }
    this.drawSun();
    this.resize(this.w, this.h);
  }

  /** Wolkenlage und Zeit für die Übergabe (Karte ↔ Level) */
  exportState(): SkyState {
    return { worldId: this.world.id, time: this.time, clouds: this.clouds.map((c) => ({ x: c.x, y: c.y, depth: c.depth, speed: c.speed })) };
  }

  /** Wolkenlage übernehmen (gleiche Welt vorausgesetzt; sonst nur so viele Wolken, wie beide haben) */
  importState(st: SkyState): void {
    this.time = st.time;
    const n = Math.min(st.clouds.length, this.clouds.length);
    for (let i = 0; i < n; i++) {
      const c = this.clouds[i];
      const o = st.clouds[i];
      c.x = o.x;
      c.y = o.y;
      c.depth = o.depth;
      c.speed = o.speed;
      this.applyCloudLook(c, i);
    }
  }

  private cloudCount(world: WorldDef): number {
    return world.id === 10 ? 4 : 11;
  }

  private cloudTint(): string {
    return this.world.id === 6 || this.world.id === 8 || this.world.id === 10 ? shade(this.world.sky[1], 0.25) : this.world.id === 9 ? '#ffd7b0' : '#ffffff';
  }

  /** Größe und Deckkraft einer Wolke aus ihrer Tiefe (gemalte Kacheln auf die Breite der prozeduralen normiert) */
  private applyCloudLook(c: Cloud, i: number): void {
    const tint = this.cloudTint();
    const painted = hasArt(ART_NAMES.cloud(i % 3));
    const tex = painted ? art(ART_NAMES.cloud(i % 3), () => cloudTexture(i % 6, tint)) : cloudTexture(i % 6, tint);
    c.sprite.texture = tex;
    c.sprite.tint = painted ? hexNum(tint) : 0xffffff;
    const norm = painted ? 256 / Math.max(1, tex.width) : 1;
    c.sprite.scale.set((0.5 + (1 - c.depth) * 0.9) * norm);
    c.sprite.alpha = 0.55 + (1 - c.depth) * 0.4;
  }

  private retintClouds(): void {
    this.clouds.forEach((c, i) => this.applyCloudLook(c, i));
  }

  private buildClouds(): void {
    const r = rng(this.world.id * 31 + 5);
    const n = this.cloudCount(this.world);
    for (let i = 0; i < n; i++) {
      // gemalte Wolken (drei Formen a–c, weiß, per Tint gefärbt), sonst prozedural (sechs Formen mit eingebackener Tönung)
      const sprite = new Sprite(cloudTexture(i % 6, '#ffffff'));
      sprite.anchor.set(0.5);
      const depth = r();
      this.cloudLayer.addChild(sprite);
      const c: Cloud = { sprite, x: r() * 2000 - 400, y: 40 + r() * 260, depth, speed: 2 + r() * 6 };
      this.applyCloudLook(c, i);
      this.clouds.push(c);
    }
  }

  private drawSun(): void {
    const g = this.sun;
    g.clear();
    const col = this.night ? '#fff6d5' : this.world.id === 2 || this.world.id === 9 ? '#ffb13b' : '#fff1a8';
    const r = this.world.id === 2 ? 70 : 46;
    g.circle(0, 0, r * 1.9).fill({ color: hexNum(col), alpha: 0.12 });
    g.circle(0, 0, r * 1.35).fill({ color: hexNum(col), alpha: 0.18 });
    g.circle(0, 0, r).fill({ color: hexNum(col), alpha: 0.95 });
    if (this.night) {
      g.circle(r * 0.35, r * 0.1, r * 0.8).fill({ color: hexNum(this.world.sky[0]), alpha: 0.9 });
    }
  }

  private drawHills(): void {
    const g = this.hills;
    g.clear();
    const base = mix(this.world.sky[1], this.world.ground[1], 0.35);
    for (let layer = 0; layer < 2; layer++) {
      const col = shade(base, layer === 0 ? 0.18 : 0.02);
      const pts: number[] = [];
      const baseY = this.h * (0.62 + layer * 0.06);
      pts.push(-50, this.h + 50);
      for (let x = -50; x <= this.w + 50; x += 12) {
        const n = noise1(x * 0.004 + layer * 10 + this.world.id, layer + 2) * 60 + noise1(x * 0.015, layer + 9) * 18;
        pts.push(x, baseY + n - layer * 20);
      }
      pts.push(this.w + 50, this.h + 50);
      g.poly(pts).fill({ color: hexNum(col), alpha: 0.9 });
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    for (const sp of [this.skySprite, this.skyOld]) {
      sp.width = w;
      sp.height = h;
    }
    this.sun.position.set(w * 0.78, h * 0.16);
    this.drawHills();
  }

  update(dt: number, view: Camera | SkyView): void {
    this.time += dt;
    if (this.fadeLeft > 0) {
      this.fadeLeft = Math.max(0, this.fadeLeft - dt);
      this.skyOld.alpha = this.fadeLeft / this.fadeDur;
    }
    const par = (view as SkyView).parallax ?? 1;
    const px = view.x * par;
    // Hügel-Silhouette wandert mit 1/10 der Kamera
    this.hills.position.set(-px * view.zoom * 0.08, (view.y * view.zoom * 0.05) - this.h * 0.08);
    for (const c of this.clouds) {
      c.x += c.speed * dt * (1 - c.depth * 0.7);
      c.sprite.position.set(cloudScreenX(c.x, c.depth, view), cloudScreenY(c.y, c.depth, view));
    }
  }
}
