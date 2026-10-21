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

export class Sky {
  readonly container = new Container();
  private skySprite: Sprite;
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
    this.container.addChild(this.skySprite, this.sun, this.hills, this.cloudLayer);
    this.buildClouds();
    this.drawSun();
  }

  setWorld(world: WorldDef, night = false): void {
    this.world = world;
    this.night = night;
    this.skySprite.texture = art(ART_NAMES.sky(world.id), () => skyTexture(`w${world.id}`, world.sky, world.id));
    this.cloudLayer.removeChildren();
    this.clouds = [];
    this.buildClouds();
    this.drawSun();
    this.resize(this.w, this.h);
  }

  private buildClouds(): void {
    const r = rng(this.world.id * 31 + 5);
    const tint = this.world.id === 6 || this.world.id === 8 || this.world.id === 10 ? shade(this.world.sky[1], 0.25) : this.world.id === 9 ? '#ffd7b0' : '#ffffff';
    const n = this.world.id === 10 ? 4 : 11;
    for (let i = 0; i < n; i++) {
      // gemalte Wolken (drei Formen a–c, weiß, per Tint gefärbt), sonst prozedural (sechs Formen mit eingebackener Tönung)
      const painted = hasArt(ART_NAMES.cloud(i % 3));
      const tex = painted ? art(ART_NAMES.cloud(i % 3), () => cloudTexture(i % 6, tint)) : cloudTexture(i % 6, tint);
      const sprite = new Sprite(tex);
      if (painted) sprite.tint = hexNum(tint);
      sprite.anchor.set(0.5);
      const depth = r();
      // gemalte Kacheln sind größer als die prozedurale (256 px breit): auf dieselbe Bildschirmgröße bringen
      const norm = painted ? 256 / Math.max(1, tex.width) : 1;
      sprite.scale.set((0.5 + (1 - depth) * 0.9) * norm);
      sprite.alpha = 0.55 + (1 - depth) * 0.4;
      this.cloudLayer.addChild(sprite);
      this.clouds.push({ sprite, x: r() * 2000 - 400, y: 40 + r() * 260, depth, speed: 2 + r() * 6 });
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
    this.skySprite.width = w;
    this.skySprite.height = h;
    this.sun.position.set(w * 0.78, h * 0.16);
    this.drawHills();
  }

  update(dt: number, cam: Camera): void {
    this.time += dt;
    // Hügel-Silhouette wandert mit 1/10 der Kamera
    this.hills.position.set(-cam.x * cam.zoom * 0.08, (cam.y * cam.zoom * 0.05) - this.h * 0.08);
    for (const c of this.clouds) {
      c.x += c.speed * dt * (1 - c.depth * 0.7);
      const parallax = 0.12 + (1 - c.depth) * 0.25;
      let sx = (c.x - cam.x * parallax * 4) % 2600;
      if (sx < -500) sx += 2600;
      if (sx > 2100) sx -= 2600;
      const sy = c.y + cam.y * cam.zoom * 0.04 * (1 - c.depth) - (cam.zoom - 12) * 1.5;
      c.sprite.position.set(sx - 300, sy);
    }
  }
}
