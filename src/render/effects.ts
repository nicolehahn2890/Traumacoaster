/**
 * Partikel-Effekte in Bühnenkoordinaten: Funken, Gischt, Konfetti, Coin-Glitzer, Staub.
 */
import { Container, Sprite } from 'pixi.js';
import { glowTexture, sparkleTexture } from './paint';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  spin: number;
  shrink: boolean;
}

export class Effects {
  readonly container = new Container();
  private particles: Particle[] = [];
  private max = 400;

  private spawn(x: number, y: number, color: number, opts: Partial<Particle> & { size?: number; sparkle?: boolean } = {}): void {
    if (this.particles.length >= this.max) return;
    const sprite = new Sprite(opts.sparkle ? sparkleTexture() : glowTexture());
    sprite.anchor.set(0.5);
    sprite.tint = color;
    const size = opts.size ?? 0.6;
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(x, y);
    this.container.addChild(sprite);
    this.particles.push({ sprite, vx: opts.vx ?? 0, vy: opts.vy ?? 0, life: opts.maxLife ?? 1, maxLife: opts.maxLife ?? 1, gravity: opts.gravity ?? 0, spin: opts.spin ?? 0, shrink: opts.shrink ?? true });
  }

  coin(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      this.spawn(x, y, 0xffd23f, { vx: Math.cos(a) * 4, vy: Math.sin(a) * 4 + 2, maxLife: 0.6, gravity: -6, size: 0.7, sparkle: i % 2 === 0 });
    }
  }
  sparks(x: number, y: number, n = 8): void {
    for (let i = 0; i < n; i++) this.spawn(x, y, 0xffb13b, { vx: (Math.random() - 0.5) * 8, vy: Math.random() * 5, maxLife: 0.4 + Math.random() * 0.4, gravity: -15, size: 0.3 + Math.random() * 0.3 });
  }
  splash(x: number, y: number): void {
    for (let i = 0; i < 24; i++) this.spawn(x + (Math.random() - 0.5) * 2, y, 0xbfefff, { vx: (Math.random() - 0.5) * 10, vy: 4 + Math.random() * 9, maxLife: 0.8 + Math.random() * 0.5, gravity: -14, size: 0.5 + Math.random() * 0.7 });
  }
  confetti(x: number, y: number, n = 60): void {
    const colors = [0xff5c8a, 0xffd23f, 0x3ec7c2, 0x9b6dff, 0x7ee081, 0xff8a5c];
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 6, y, colors[i % colors.length], { vx: (Math.random() - 0.5) * 14, vy: 6 + Math.random() * 12, maxLife: 1.6 + Math.random(), gravity: -9, size: 0.5, spin: (Math.random() - 0.5) * 10, shrink: false, sparkle: i % 3 === 0 });
  }
  dust(x: number, y: number, n = 1): void {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 1.5, y, 0xe8d9b5, { vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), maxLife: 0.7, gravity: 0, size: 0.8 + Math.random() * 0.8 });
    }
  }
  /** Fetzen des Absperrbands (gelb/schwarz) beim Durchbrechen */
  ribbons(x: number, y: number, n = 12): void {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 1.5, y + Math.random(), i % 2 ? 0xffd23f : 0x2a1f3d, { vx: 2 + Math.random() * 6, vy: 2 + Math.random() * 5, maxLife: 1 + Math.random() * 0.6, gravity: -9, size: 0.45, spin: (Math.random() - 0.5) * 12, shrink: false });
  }
  /** Anzahl lebender Partikel (für Tests) */
  get count(): number {
    return this.particles.length;
  }
  glitter(x: number, y: number): void {
    this.spawn(x + (Math.random() - 0.5) * 1.5, y + (Math.random() - 0.5) * 1.5, 0xffffff, { vx: 0, vy: 0.5, maxLife: 0.5, size: 0.35, sparkle: true });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      const f = p.life / p.maxLife;
      p.sprite.alpha = Math.min(1, f * 1.5);
      if (p.shrink) p.sprite.scale.set(p.sprite.scale.x * (0.96 + 0.04 * f));
    }
  }

  clear(): void {
    for (const p of this.particles) p.sprite.destroy();
    this.particles = [];
  }
}
