/**
 * Startscreen: drehbare Halbkugel mit den zehn Welten als Inseln, Level-Fahnen,
 * Wolken mit Parallaxe, „Spielen“ und „Meine Bahnen“.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers } from '@/core/input';
import { Button, label, INK, iconGear, iconPerson, star, paintRect, PAPER, Toast } from '@/ui/widgets';
import { WORLDS } from '@/levels/worlds';
import { storage } from '@/core/storage';
import { t } from '@/core/i18n';
import { hexNum, shade, cloudTexture, skyTexture, mix } from '@/render/paint';
import { LevelScene } from './level';
import { MyTracksScene } from './myTracks';
import { EditorScene } from './editor';
import { clamp, noise1 } from '@/core/math';
import { drawProp } from '@/render/props';

const WORLD_ANGLE = Math.PI / 5.5; // Winkelabstand der Inseln auf der Kugel

export class StartScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private sky = new Sprite();
  private clouds: Array<{ s: Sprite; depth: number; x: number; y: number; speed: number }> = [];
  private cloudLayer = new Container();
  private globe = new Container();
  private globeBody = new Graphics();
  private islands = new Container();
  private flags = new Container();
  private title = label('Trauma Coaster', 44, '#ffffff', true, { stroke: { color: INK, width: 6 } });
  private worldName = label('', 30, '#ffffff', true, { stroke: { color: INK, width: 5 } });
  private worldInfo = label('', 18, '#ffffff', false, { stroke: { color: INK, width: 4 } });
  private playBtn = new Button(t('play'), { width: 230, height: 64, size: 28 });
  private tracksBtn = new Button(t('myTracks'), { width: 190, height: 50, size: 20, color: '#3ec7c2' });
  private gearBtn = new Button('', { width: 54, round: true, color: '#9b6dff', icon: iconGear });
  private peopleBtn = new Button('', { width: 54, round: true, color: '#ffd23f', icon: iconPerson });
  private toast = new Toast();
  private rotation = 0;
  private velocity = 0;
  private dragging = false;
  private lastDragX = 0;
  private w = 800;
  private h = 600;
  private radius = 600;
  private currentWorld = 0;
  private time = 0;
  private settingsOpen: Container | null = null;

  enter(game: Game): void {
    this.game = game;
    const p = storage.progress;
    this.currentWorld = clamp(Math.floor((p.current - 1) / 15), 0, 9);
    this.rotation = -this.currentWorld * WORLD_ANGLE;
    this.container.addChild(this.sky, this.cloudLayer, this.globe, this.title, this.worldName, this.worldInfo, this.playBtn, this.tracksBtn, this.gearBtn, this.peopleBtn, this.toast);
    this.globe.addChild(this.globeBody, this.islands, this.flags);
    this.buildClouds();
    this.buildIslands();
    this.playBtn.onTap = () => this.openLevel(this.nextLevelOfWorld(this.currentWorld));
    this.tracksBtn.onTap = () => this.game.goto(() => new MyTracksScene());
    this.gearBtn.onTap = () => this.toggleSettings();
    this.peopleBtn.onTap = () => this.game.goto(() => new EditorScene());
    this.handlers.dragStart = (pt) => {
      if (this.settingsOpen) return;
      this.dragging = true;
      this.lastDragX = pt.x;
      this.velocity = 0;
    };
    this.handlers.dragMove = (pt) => {
      if (!this.dragging) return;
      const dx = pt.x - this.lastDragX;
      this.lastDragX = pt.x;
      const d = dx / this.radius;
      this.rotation += d;
      this.velocity = d / (1 / 60);
    };
    this.handlers.dragEnd = () => {
      this.dragging = false;
    };
    this.handlers.tap = (pt) => {
      if (this.settingsOpen) {
        this.toggleSettings();
        return;
      }
      // Fahne getroffen?
      for (const f of this.flags.children) {
        const b = f.getBounds();
        if (pt.x >= b.x - 14 && pt.x <= b.x + b.width + 14 && pt.y >= b.y - 14 && pt.y <= b.y + b.height + 14) {
          const id = (f as Container & { levelId?: number }).levelId;
          if (id) this.openLevel(id);
          return;
        }
      }
      // Insel getroffen → Welt wählen
      for (const isl of this.islands.children) {
        const b = isl.getBounds();
        if (pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
          const idx = (isl as Container & { worldIndex?: number }).worldIndex ?? 0;
          this.currentWorld = idx;
          this.velocity = 0;
          return;
        }
      }
    };
    this.handlers.key = (k) => {
      if (k === 'ArrowLeft') this.currentWorld = Math.max(0, this.currentWorld - 1);
      if (k === 'ArrowRight') this.currentWorld = Math.min(9, this.currentWorld + 1);
      if (k === 'Enter') this.openLevel(this.nextLevelOfWorld(this.currentWorld));
    };
    this.updateWorldTexts();
  }

  exit(): void {}

  private nextLevelOfWorld(w: number): number {
    const p = storage.progress;
    const first = w * 15 + 1;
    for (let id = first; id < first + 15; id++) if (!(p.stars[id] > 0)) return id;
    return first;
  }

  private worldUnlocked(w: number): boolean {
    if (w === 0) return true;
    const p = storage.progress;
    // Welt frei, wenn mindestens 10 Level der vorherigen Welt geschafft sind
    const prevFirst = (w - 1) * 15 + 1;
    let done = 0;
    for (let id = prevFirst; id < prevFirst + 15; id++) if (p.stars[id] > 0) done++;
    return done >= 10 || import.meta.env.VITE_UNLOCK_ALL === '1';
  }

  private openLevel(id: number): void {
    const w = Math.floor((id - 1) / 15);
    if (!this.worldUnlocked(w)) {
      this.toast.show(t('worldLocked', { n: w }));
      return;
    }
    storage.setCurrent(id);
    this.game.goto(() => new LevelScene(id));
  }

  private buildClouds(): void {
    this.cloudLayer.removeChildren();
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(cloudTexture(i % 6));
      s.anchor.set(0.5);
      const depth = (i % 5) / 5;
      s.scale.set(0.45 + (1 - depth) * 0.8);
      s.alpha = 0.6 + (1 - depth) * 0.35;
      this.cloudLayer.addChild(s);
      this.clouds.push({ s, depth, x: (i * 251) % 1400, y: 40 + ((i * 97) % 220), speed: 4 + (i % 3) * 3 });
    }
  }

  private buildIslands(): void {
    this.islands.removeChildren();
    this.flags.removeChildren();
    WORLDS.forEach((wd, i) => {
      const isl = new Container() as Container & { worldIndex?: number };
      isl.worldIndex = i;
      const g = new Graphics();
      // Insel: Hügel in Weltfarbe mit Deko-Prop
      const col = wd.ground[0];
      g.ellipse(0, 12, 120, 30).fill({ color: hexNum(shade(INK, 0.1)), alpha: 0.18 });
      g.moveTo(-120, 14).bezierCurveTo(-80, -50, 80, -50, 120, 14).closePath().fill(hexNum(col)).stroke({ width: 3, color: hexNum(shade(col, -0.45)) });
      g.moveTo(-95, 4).bezierCurveTo(-55, -34, 55, -34, 95, 4).closePath().fill({ color: hexNum(shade(col, 0.18)), alpha: 0.8 });
      isl.addChild(g);
      const prop = new Container();
      prop.scale.set(6.5, -6.5);
      prop.position.set(0, -18);
      const propId = ['house', 'ferris', 'headframe', 'tree', 'castle', 'tower', 'tree', 'ghostHouse', 'tree', 'spaceBuilding'][i];
      drawProp(prop, propId, wd, 0);
      isl.addChild(prop);
      const name = label(`${i + 1}`, 22, '#ffffff', true, { stroke: { color: INK, width: 4 } });
      name.position.set(0, 34);
      isl.addChild(name);
      this.islands.addChild(isl);
    });
  }

  private rebuildFlags(): void {
    this.flags.removeChildren();
    const wd = WORLDS[this.currentWorld];
    const p = storage.progress;
    wd.levels.forEach((id, k) => {
      const f = new Container() as Container & { levelId?: number };
      f.levelId = id;
      const g = new Graphics();
      const stars = p.stars[id] ?? 0;
      const open = id <= p.highest + 1 || import.meta.env.VITE_UNLOCK_ALL === '1';
      const col = stars > 0 ? 0xffd23f : open ? 0xff5c8a : 0xbfb7cc;
      g.moveTo(0, 0).lineTo(0, -26).stroke({ width: 3, color: hexNum(INK) });
      g.poly([0, -26, 20, -20, 0, -13]).fill(col).stroke({ width: 2, color: hexNum(INK) });
      if (stars > 0) star(g, 11, -19, 4, true);
      f.addChild(g);
      const num = label(`${k + 1}`, 12, INK, false);
      num.position.set(1, 6);
      f.addChild(num);
      this.flags.addChild(f);
    });
  }

  private updateWorldTexts(): void {
    const wd = WORLDS[this.currentWorld];
    const p = storage.progress;
    let got = 0;
    for (const id of wd.levels) got += p.stars[id] ?? 0;
    this.worldName.text = `${t('world', { n: wd.id })}: ${wd.name}`;
    const done = wd.levels.filter((id) => (p.stars[id] ?? 0) > 0).length;
    this.worldInfo.text = `${t('progress', { done, total: 15 })}  ·  ★ ${got}/45${this.worldUnlocked(this.currentWorld) ? '' : '  ·  ' + t('locked')}`;
    this.sky.texture = skyTexture(`start_w${wd.id}`, wd.sky, wd.id + 50);
    this.sky.width = this.w;
    this.sky.height = this.h;
    this.rebuildFlags();
    this.playBtn.setText(t('play'));
  }

  private toggleSettings(): void {
    if (this.settingsOpen) {
      this.container.removeChild(this.settingsOpen);
      this.settingsOpen.destroy({ children: true });
      this.settingsOpen = null;
      return;
    }
    const c = new Container();
    const g = new Graphics();
    paintRect(g, -150, -120, 300, 240, PAPER, INK, 24, 4);
    c.addChild(g);
    const title = label(t('settings'), 26, INK, true);
    title.position.set(0, -85);
    c.addChild(title);
    const s = storage.settings;
    const sound = new Button(`${t('sound')}: ${s.sound ? 'An' : 'Aus'}`, { width: 240, height: 46, size: 18, color: s.sound ? '#7ee081' : '#bfb7cc' });
    sound.position.set(0, -30);
    sound.onTap = () => {
      storage.updateSettings({ sound: !storage.settings.sound });
      this.toggleSettings();
      this.toggleSettings();
    };
    const lang = new Button(`${t('language')}: ${s.language.toUpperCase()}`, { width: 240, height: 46, size: 18, color: '#4f8dff' });
    lang.position.set(0, 26);
    lang.onTap = () => {
      storage.updateSettings({ language: storage.settings.language === 'de' ? 'en' : 'de' });
      location.reload();
    };
    const reset = new Button('Spielstand löschen', { width: 240, height: 46, size: 18, color: '#d64545' });
    reset.position.set(0, 82);
    reset.onTap = () => {
      if (confirm('Spielstand wirklich löschen?')) {
        storage.reset();
        location.reload();
      }
    };
    c.addChild(sound, lang, reset);
    c.position.set(this.w / 2, this.h / 2);
    c.eventMode = 'static';
    this.container.addChild(c);
    this.settingsOpen = c;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.sky.width = w;
    this.sky.height = h;
    const portrait = h > w;
    this.radius = portrait ? Math.max(w * 0.95, h * 0.55) : Math.max(w * 0.6, h * 0.9);
    const cy = portrait ? h * 0.78 + this.radius : h * 0.72 + this.radius;
    this.globe.position.set(w / 2, cy);
    this.globeBody.clear();
    const wd = WORLDS[this.currentWorld];
    const col = mix(wd.ground[0], '#7cc242', 0.5);
    this.globeBody.circle(0, 0, this.radius + 6).fill({ color: hexNum(INK), alpha: 0.25 });
    this.globeBody.circle(0, 0, this.radius).fill(hexNum(col)).stroke({ width: 5, color: hexNum(shade(col, -0.45)) });
    // Streifen (Wiesen-Patches)
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (i - 20) * 0.08 + noise1(i, 3) * 0.03;
      const r = this.radius - 30 - Math.abs(noise1(i * 1.3, 4)) * 80;
      this.globeBody.circle(Math.cos(a) * r, Math.sin(a) * r, 18 + Math.abs(noise1(i * 2.1, 5)) * 30).fill({ color: hexNum(shade(col, 0.15)), alpha: 0.5 });
    }
    this.title.position.set(w / 2, portrait ? 118 : 54);
    this.title.style.fontSize = portrait ? 38 : 46;
    this.worldName.position.set(w / 2, portrait ? h * 0.78 - 118 : h * 0.72 - 110);
    this.worldInfo.position.set(w / 2, this.worldName.y + 34);
    this.playBtn.position.set(w / 2, portrait ? h - 70 : h - 54);
    this.tracksBtn.position.set(w - (portrait ? 105 : 115), 44);
    this.gearBtn.position.set(44, 44);
    this.peopleBtn.position.set(110, 44);
    this.toast.position.set(w / 2, h * 0.5);
    this.settingsOpen?.position.set(w / 2, h / 2);
  }

  update(dt: number): void {
    this.time += dt;
    // Trägheit + Einrasten auf die nächste Welt
    if (!this.dragging) {
      const target = -this.currentWorld * WORLD_ANGLE;
      if (Math.abs(this.velocity) > 0.3) {
        this.rotation += this.velocity * dt;
        this.velocity *= Math.exp(-3 * dt);
        this.currentWorld = clamp(Math.round(-this.rotation / WORLD_ANGLE), 0, 9);
      } else {
        this.velocity = 0;
        this.rotation += (target - this.rotation) * Math.min(1, dt * 8);
      }
    } else {
      this.currentWorld = clamp(Math.round(-this.rotation / WORLD_ANGLE), 0, 9);
    }
    const prevName = this.worldName.text;
    const wd = WORLDS[this.currentWorld];
    if (!prevName.includes(wd.name)) {
      this.updateWorldTexts();
      this.resize(this.w, this.h);
    }
    // Inseln auf der Kugel positionieren
    this.islands.children.forEach((isl, i) => {
      const a = -Math.PI / 2 + this.rotation + i * WORLD_ANGLE;
      const r = this.radius - 10;
      isl.position.set(Math.cos(a) * r, Math.sin(a) * r);
      isl.rotation = a + Math.PI / 2;
      const side = Math.cos(a); // 0 oben auf der Kugel, ±1 an den Seiten
      isl.visible = Math.sin(a) < 0.2;
      isl.alpha = clamp(1 - Math.abs(side) * 0.8, 0.3, 1);
      const sc = clamp(1 - Math.abs(side) * 0.45, 0.55, 1) * (this.h > this.w ? 0.75 : 1);
      isl.scale.set(sc);
    });
    // Fahnen der aktuellen Welt entlang der Kugel
    const base = -Math.PI / 2 + this.rotation + this.currentWorld * WORLD_ANGLE;
    this.flags.children.forEach((f, k) => {
      const a = base + (k - 7) * 0.052;
      const r = this.radius + 14;
      f.position.set(Math.cos(a) * r, Math.sin(a) * r);
      f.rotation = a + Math.PI / 2;
    });
    // Wolken
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      const par = 60 + (1 - c.depth) * 220;
      let sx = (c.x + this.rotation * par) % 1600;
      if (sx < -200) sx += 1600;
      c.s.position.set(sx - 200, c.y + Math.sin(this.time * 0.4 + c.x) * 4);
    }
    this.toast.update(dt);
  }
}
