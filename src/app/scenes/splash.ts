/**
 * Splash im illudiy-Design: Logo-Sticker (Maskottchen + Schriftzug), „präsentiert“,
 * Spieltitel in Lobster mit pinker Extrusion, weiche Brand-Blobs und Sterne, dazu ein
 * Sticker-Zug mit hartem Offset-Schatten auf einer handgezeichneten Schiene.
 * Bewegung kurz und springig (Overshoot wie --ease-bounce), keine langen Blenden.
 */
import { Assets, Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers } from '@/core/input';
import { label, FONT_BRAND } from '@/ui/widgets';
import { StartScene } from './start';
import { hexNum } from '@/render/paint';
import { clamp, noise1 } from '@/core/math';
import { t } from '@/core/i18n';
import { BRAND, BRAND_OUTLINE as OUTLINE } from '@/ui/brand';

const LOGO_URL = `${import.meta.env.BASE_URL ?? './'}brand/illudiy-logo.webp`;
const LOGO_ASPECT = 1024 / 1223; // Breite ÷ Höhe der Logodatei
const DURATION = 2.8; // Sekunden bis zum automatischen Weiter
const SHADOW = 4; // harter Offset-Schatten (--shadow-pop: 4/4)

/** Overshoot-Easing, entspricht --ease-bounce cubic-bezier(.34,1.56,.64,1) */
function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(p, 0, 1) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}
/** Weiches Auslaufen, entspricht --ease-out */
function easeOut(p: number): number {
  const x = 1 - clamp(p, 0, 1);
  return 1 - x * x * x;
}
/** Fortschritt 0–1 eines Einblendens, das bei `start` beginnt und `dur` Sekunden dauert */
function phase(time: number, start: number, dur: number): number {
  return clamp((time - start) / dur, 0, 1);
}

/** Organischer Blob um (0,0), wie die handgeschnittenen Farbflecken der Palette */
function drawBlob(g: Graphics, r: number, seed: number, color: string, alpha: number): void {
  const pts: number[] = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.13 * Math.sin(a * 2 + seed) + 0.07 * Math.sin(a * 3 + seed * 2.3) + 0.04 * Math.cos(a * 5 + seed));
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.92);
  }
  g.poly(pts).fill({ color: hexNum(color), alpha });
}

/** Fünfzackiger Stern um (0,0) mit Sticker-Kontur */
function drawStar(g: Graphics, r: number, color: string): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.poly(pts).fill(hexNum(color)).stroke({ width: 2, color: hexNum(OUTLINE), join: 'round' });
}

/** Drei Wagen (Teal, Pink, Violett) mit weißen Fahrgästen und hartem Offset-Schatten; Räder stehen bei y = 20 */
function drawTrain(g: Graphics): void {
  g.clear();
  const cars = [BRAND.teal, BRAND.pink, BRAND.violetPop];
  const ink = hexNum(OUTLINE);
  const carX = (i: number) => -i * 58;
  // Schatten: die Silhouette um 4/4 versetzt, ungeblurrt
  for (let i = 0; i < cars.length; i++) {
    const x = carX(i) + SHADOW;
    const y = SHADOW;
    g.circle(x - 8, y - 18, 7).fill(ink);
    g.circle(x + 8, y - 18, 7).fill(ink);
    g.roundRect(x - 24, y - 14, 48, 26, 9).fill(ink);
    g.circle(x - 14, y + 14, 6).fill(ink);
    g.circle(x + 14, y + 14, 6).fill(ink);
  }
  for (let i = 0; i < cars.length; i++) {
    const x = carX(i);
    if (i > 0) g.rect(x + 22, -3, 14, 6).fill(ink); // Kupplung
    // Fahrgäste: weiß mit Kontur, wie die Sterne im Logo
    g.circle(x - 8, -18, 7).fill(0xffffff).stroke({ width: 2, color: ink });
    g.circle(x + 8, -18, 7).fill(0xffffff).stroke({ width: 2, color: ink });
    // Wagen
    g.roundRect(x - 24, -14, 48, 26, 9).fill(hexNum(cars[i])).stroke({ width: 2.5, color: ink });
    g.roundRect(x - 18, -10, 36, 7, 3).fill({ color: 0xffffff, alpha: 0.35 }); // Glanzkante
    // Räder
    g.circle(x - 14, 14, 6).fill(ink);
    g.circle(x + 14, 14, 6).fill(ink);
    g.circle(x - 14, 14, 2.2).fill(hexNum(BRAND.tealPop));
    g.circle(x + 14, 14, 2.2).fill(hexNum(BRAND.tealPop));
  }
}

interface Blob {
  g: Graphics;
  rx: number;
  ry: number;
  r: number;
  seed: number;
  color: string;
  delay: number;
}
interface Star {
  g: Graphics;
  dx: number;
  dy: number;
  delay: number;
  phase: number;
}

export class SplashScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private t = 0;
  private done = false;
  private w = 800;
  private h = 600;
  private reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private bg = new Graphics();
  private blobLayer = new Container();
  private blobs: Blob[] = [];
  private rail = new Graphics();
  private train = new Graphics();
  /** Logo-Sticker (Sprite) oder, falls das Bild fehlt, die Wortmarke in Lobster; Anker in der Mitte */
  private logo = new Container();
  private logoSprite: Sprite | null = null;
  private logoFallback: Text | null = null;
  private logoH = 300;
  private starLayer = new Container();
  private stars: Star[] = [];
  private sub = label(t('presents'), 20, BRAND.muted);
  private title = label('Trauma Coaster', 44, BRAND.white, false, {
    fontFamily: FONT_BRAND,
    fontWeight: '400',
    stroke: { color: OUTLINE, width: 4, join: 'round' },
    dropShadow: { color: BRAND.pink, alpha: 1, blur: 0, distance: 5, angle: Math.PI / 4 },
  });
  /** Zielpositionen aus dem Layout; die Animation setzt darauf auf */
  private pos = { logo: { x: 0, y: 0 }, sub: { x: 0, y: 0 }, title: { x: 0, y: 0 }, railY: 0 };

  constructor(private logoTexture: Texture | null = null) {}

  /** Lädt das illudiy-Logo (gedeckelt, damit der Start nie am Logo hängt). */
  static preload(timeoutMs = 2500): Promise<Texture | null> {
    const load = Assets.load<Texture>(LOGO_URL).catch((err: unknown) => {
      console.warn('illudiy-Logo konnte nicht geladen werden', err);
      return null;
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([load, timeout]);
  }

  enter(game: Game): void {
    this.game = game;
    this.container.addChild(this.bg, this.blobLayer, this.rail, this.train, this.logo, this.starLayer, this.sub, this.title);
    const blobDefs: Array<Omit<Blob, 'g'>> = [
      { rx: 0.16, ry: 0.2, r: 0.3, seed: 1.3, color: BRAND.tealMist, delay: 0 },
      { rx: 0.84, ry: 0.72, r: 0.34, seed: 4.1, color: BRAND.pinkMist, delay: 0.08 },
      { rx: 0.8, ry: 0.16, r: 0.18, seed: 2.6, color: BRAND.violetMist, delay: 0.16 },
      { rx: 0.14, ry: 0.84, r: 0.14, seed: 5.2, color: BRAND.violetMist, delay: 0.22 },
    ];
    this.blobs = blobDefs.map((d) => {
      const g = new Graphics();
      g.scale.set(0);
      this.blobLayer.addChild(g);
      return { ...d, g };
    });
    const starDefs: Array<{ dx: number; dy: number; r: number; color: string; delay: number }> = [
      { dx: -0.5, dy: -0.3, r: 9, color: BRAND.pinkPop, delay: 0.62 },
      { dx: 0.5, dy: -0.4, r: 7, color: BRAND.violetPop, delay: 0.7 },
      { dx: -0.46, dy: 0.32, r: 6, color: BRAND.teal, delay: 0.8 },
      { dx: 0.52, dy: 0.2, r: 8, color: BRAND.pink, delay: 0.76 },
      { dx: 0.08, dy: -0.6, r: 6, color: BRAND.violetPop, delay: 0.9 },
      { dx: -0.56, dy: -0.02, r: 5, color: BRAND.violet, delay: 0.86 },
    ];
    this.stars = starDefs.map((d, i) => {
      const g = new Graphics();
      drawStar(g, d.r, d.color);
      g.scale.set(0);
      this.starLayer.addChild(g);
      return { g, dx: d.dx, dy: d.dy, delay: d.delay, phase: i * 1.7 };
    });
    drawTrain(this.train);
    this.sub.alpha = 0;
    this.title.scale.set(0);
    this.logo.scale.set(0);
    if (this.logoTexture) this.setLogo(this.logoTexture);
    else {
      this.showFallbackWordmark();
      // Zweiter Versuch im Hintergrund (Assets dedupliziert laufende Ladevorgänge)
      void SplashScene.preload(6000).then((tex) => {
        if (tex && !this.done) this.setLogo(tex);
      });
    }
    this.handlers.tap = () => this.finish();
    this.handlers.key = (k) => {
      if (k === 'Enter' || k === ' ' || k === 'Escape') this.finish();
    };
    this.resize(this.w, this.h);
  }

  exit(): void {}

  private setLogo(tex: Texture): void {
    this.logoTexture = tex;
    if (this.logoFallback) {
      this.logo.removeChild(this.logoFallback);
      this.logoFallback.destroy();
      this.logoFallback = null;
    }
    if (!this.logoSprite) {
      this.logoSprite = new Sprite(tex);
      this.logoSprite.anchor.set(0.5);
      this.logo.addChild(this.logoSprite);
    } else this.logoSprite.texture = tex;
    this.applyLogoSize();
  }

  /** Falls das Bild fehlt: Wortmarke in Lobster mit Kontur und pinker Extrusion (das Maskottchen wird nie nachgezeichnet) */
  private showFallbackWordmark(): void {
    if (this.logoFallback) return;
    this.logoFallback = label('illudiy', 80, BRAND.white, false, {
      fontFamily: FONT_BRAND,
      fontWeight: '400',
      stroke: { color: OUTLINE, width: 5, join: 'round' },
      dropShadow: { color: BRAND.pink, alpha: 1, blur: 0, distance: 6, angle: Math.PI / 4 },
    });
    this.logo.addChild(this.logoFallback);
    this.applyLogoSize();
  }

  private applyLogoSize(): void {
    if (this.logoSprite) {
      this.logoSprite.height = this.logoH;
      this.logoSprite.width = this.logoH * LOGO_ASPECT;
    }
    if (this.logoFallback) this.logoFallback.style.fontSize = Math.round(this.logoH * 0.3);
  }

  private drawRail(): void {
    const g = this.rail;
    g.clear();
    const n = 48;
    const span = this.w + 40;
    g.moveTo(-20, noise1(0, 9) * 2);
    for (let i = 1; i <= n; i++) g.lineTo(-20 + (span * i) / n, noise1(i * 0.6, 9) * 2.2);
    g.stroke({ width: 3.5, color: hexNum(OUTLINE), cap: 'round', join: 'round' });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const portrait = h > w;
    const s = Math.min(w, h);
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill(hexNum(BRAND.page));
    for (const b of this.blobs) {
      b.g.position.set(b.rx * w, b.ry * h);
      b.g.clear();
      drawBlob(b.g, b.r * s, b.seed, b.color, 0.55);
    }
    if (portrait) {
      // Hochformat: Logo oben, Text darunter, Zug unten
      this.logoH = Math.min(h * 0.4, (w * 0.74) / LOGO_ASPECT);
      this.pos.logo = { x: w / 2, y: h * 0.4 };
      this.pos.sub = { x: w / 2, y: this.pos.logo.y + this.logoH / 2 + 34 };
      this.title.style.fontSize = Math.round(clamp(w * 0.115, 34, 52));
      this.pos.title = { x: w / 2, y: this.pos.sub.y + 48 };
      this.pos.railY = clamp(h * 0.86, this.pos.title.y + 64, h - 28);
    } else {
      // Querformat: Logo links, Text rechts daneben, Zug unten
      this.logoH = Math.min(h * 0.54, (w * 0.4) / LOGO_ASPECT);
      this.pos.logo = { x: w * 0.36, y: h * 0.47 };
      this.pos.sub = { x: w * 0.7, y: h * 0.4 };
      this.title.style.fontSize = Math.round(clamp(w * 0.05, 34, 60));
      this.pos.title = { x: w * 0.7, y: h * 0.52 };
      this.pos.railY = h * 0.9;
    }
    this.applyLogoSize();
    this.logo.position.set(this.pos.logo.x, this.pos.logo.y);
    this.sub.position.set(this.pos.sub.x, this.pos.sub.y);
    this.title.position.set(this.pos.title.x, this.pos.title.y);
    for (const st of this.stars) {
      st.g.position.set(clamp(this.pos.logo.x + st.dx * this.logoH, 16, w - 16), clamp(this.pos.logo.y + st.dy * this.logoH, 16, h - 16));
    }
    this.drawRail();
    this.rail.position.set(0, this.pos.railY);
  }

  update(dt: number): void {
    this.t += dt;
    // Bei „Bewegung reduzieren“ steht alles sofort, nur der Zug fährt
    const a = this.reduceMotion ? 10 : this.t;
    const live = this.reduceMotion ? 0 : 1;
    for (const b of this.blobs) b.g.scale.set(easeOutBack(phase(a, b.delay, 0.36)));
    // Logo springt herein, danach schwebt der Sticker ganz leicht
    this.logo.scale.set(easeOutBack(phase(a, 0.12, 0.42)));
    this.logo.position.set(this.pos.logo.x, this.pos.logo.y + Math.sin(this.t * 2.2) * 3 * live);
    this.logo.rotation = Math.sin(this.t * 1.6) * 0.015 * live;
    // „präsentiert“ kommt kurz von unten
    const sp = easeOut(phase(a, 0.5, 0.24));
    this.sub.alpha = sp;
    this.sub.position.set(this.pos.sub.x, this.pos.sub.y + (1 - sp) * 10);
    // Titel springt herein
    this.title.scale.set(easeOutBack(phase(a, 0.6, 0.4)));
    // Sterne springen herein und funkeln
    for (const st of this.stars) {
      const p = easeOutBack(phase(a, st.delay, 0.3));
      const twinkle = 1 - 0.25 * (0.5 + 0.5 * Math.sin(this.t * 3.2 + st.phase)) * live;
      st.g.scale.set(p * twinkle);
      st.g.rotation = Math.sin(this.t * 1.2 + st.phase) * 0.2 * live;
    }
    // Zug: fährt nach einem kurzen Moment los und läuft durch
    const x = -160 + ((Math.max(0, this.t - 0.25) * 240) % (this.w + 340));
    const bob = Math.sin(this.t * 14) * 1.5 * live;
    this.train.position.set(x, this.pos.railY - 19 + bob);
    if (this.t > DURATION) this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.game.goto(() => new StartScene());
  }
}
