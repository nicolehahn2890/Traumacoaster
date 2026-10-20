/**
 * Splash: illudiy-Logo, handgemalt, ein kleiner Zug fährt durch den Schriftzug.
 */
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers } from '@/core/input';
import { label, INK, paintRect } from '@/ui/widgets';
import { StartScene } from './start';
import { hexNum } from '@/render/paint';

export class SplashScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private t = 0;
  private train = new Graphics();
  private bg = new Graphics();
  private card = new Graphics();
  private logo = label('illudiy', 72, INK, true);
  private sub = label('präsentiert', 20, '#7a6f8f');
  private done = false;
  private w = 800;
  private h = 600;

  enter(game: Game): void {
    this.game = game;
    this.container.addChild(this.bg, this.card, this.logo, this.sub, this.train);
    this.handlers.tap = () => this.finish();
    this.drawTrain();
  }
  exit(): void {}

  private drawTrain(): void {
    const g = this.train;
    g.clear();
    const colors = [0xff5c8a, 0xffd23f, 0x3ec7c2];
    for (let i = 0; i < 3; i++) {
      const x = -i * 54;
      g.roundRect(x - 24, -14, 48, 26, 8).fill(colors[i]).stroke({ width: 3, color: hexNum(INK) });
      g.circle(x - 14, 14, 6).fill(hexNum(INK));
      g.circle(x + 14, 14, 6).fill(hexNum(INK));
      g.circle(x - 8, -18, 7).fill(0xffe0c2).stroke({ width: 2, color: hexNum(INK) });
      g.circle(x + 8, -18, 7).fill(0xf7c9a1).stroke({ width: 2, color: hexNum(INK) });
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill(0xfff8ec);
    this.card.clear();
    paintRect(this.card, w / 2 - 170, h / 2 - 90, 340, 170, '#ffffff', INK, 28, 9);
    this.logo.position.set(w / 2, h / 2 - 10);
    this.sub.position.set(w / 2, h / 2 + 50);
  }

  update(dt: number): void {
    this.t += dt;
    const x = -120 + ((this.t * 260) % (this.w + 300));
    const bob = Math.sin(this.t * 12) * 2;
    this.train.position.set(x, this.h / 2 + 95 + bob);
    this.logo.scale.set(1 + Math.sin(this.t * 3) * 0.02);
    if (this.t > 2.4) this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.game.goto(() => new StartScene());
  }
}
