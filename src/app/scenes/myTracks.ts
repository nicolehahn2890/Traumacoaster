/**
 * Meine Bahnen: gespeicherte Bahnen als Karten, neue Bahn in einer freigeschalteten Welt bauen.
 */
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers } from '@/core/input';
import { t } from '@/core/i18n';
import { storage } from '@/core/storage';
import { unlockAll } from '@/core/dev';
import { Button, label, INK, PAPER, paintRect, iconBack, iconTrash } from '@/ui/widgets';
import { WORLDS } from '@/levels/worlds';
import { safeArea } from '@/platform/safeArea';
import { skyTexture, hexNum, shade } from '@/render/paint';
import { Sprite } from 'pixi.js';
import { LevelScene } from './level';
import { StartScene } from './start';
import { sampleTrack } from '@/track/model';
import { toStage } from '@/track/stage';

export class MyTracksScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private sky = new Sprite();
  private list = new Container();
  private title = label(t('myTracks'), 36, '#ffffff', true, { stroke: { color: INK, width: 6 } });
  private backBtn = new Button('', { width: 48, round: true, color: '#9b6dff', icon: iconBack });
  private newBtns: Button[] = [];
  private scroll = 0;
  private w = 800;
  private h = 600;

  enter(game: Game): void {
    this.game = game;
    this.sky.texture = skyTexture('tracks', ['#5b2a86', '#ff7eb3', '#ffb17a'], 77);
    this.container.addChild(this.sky, this.list, this.title, this.backBtn);
    this.backBtn.onTap = () => this.game.goto(() => new StartScene());
    this.handlers.pan = (_c, d) => {
      this.scroll = Math.min(0, this.scroll + d.y);
      this.layout();
    };
    this.handlers.wheel = (_p, d) => {
      this.scroll = Math.min(0, this.scroll - d * 0.5);
      this.layout();
    };
    this.handlers.dragMove = () => {};
    this.build();
  }
  exit(): void {}

  private unlockedWorlds(): number[] {
    const p = storage.progress;
    const out: number[] = [1];
    for (let w = 2; w <= 10; w++) {
      const prevFirst = (w - 2) * 15 + 1;
      let done = 0;
      for (let id = prevFirst; id < prevFirst + 15; id++) if (p.stars[id] > 0) done++;
      if (done >= 10 || unlockAll()) out.push(w);
    }
    return out;
  }

  private build(): void {
    this.list.removeChildren();
    this.newBtns = [];
    // Neue Bahn pro freigeschalteter Welt
    const worlds = this.unlockedWorlds();
    const header = label(t('newTrack'), 22, '#ffffff', true, { stroke: { color: INK, width: 4 } });
    header.name = 'header';
    this.list.addChild(header);
    worlds.forEach((wid) => {
      const wd = WORLDS[wid - 1];
      const b = new Button(`${wd.id} · ${wd.name}`, { width: 200, height: 46, size: 16, color: wd.ground[0], textColor: INK, seed: wid });
      b.onTap = () => this.game.goto(() => new LevelScene(0, { world: wid, width: 220 }));
      this.list.addChild(b);
      this.newBtns.push(b);
    });
    // Gespeicherte Bahnen
    const tracks = storage.tracks;
    tracks.forEach((tr) => {
      const card = new Container();
      card.name = 'card';
      const g = new Graphics();
      paintRect(g, -150, -60, 300, 120, PAPER, INK, 18, tr.created % 50);
      card.addChild(g);
      // Mini-Vorschau der Bahn
      const pv = new Graphics();
      try {
        const s = sampleTrack(tr.path, 1);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const pts: number[] = [];
        for (let i = 0; i < s.count; i++) {
          const st = toStage(s.x[i], s.y[i], s.z[i]);
          pts.push(st.X, st.Y);
          minX = Math.min(minX, st.X); maxX = Math.max(maxX, st.X); minY = Math.min(minY, st.Y); maxY = Math.max(maxY, st.Y);
        }
        const sc = Math.min(130 / Math.max(1, maxX - minX), 80 / Math.max(1, maxY - minY));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const scaled = [];
        for (let i = 0; i < pts.length; i += 2) scaled.push((pts[i] - cx) * sc, -(pts[i + 1] - cy) * sc);
        pv.poly(scaled, false).stroke({ width: 3, color: hexNum(shade(WORLDS[tr.world - 1].ground[1], -0.2)), cap: 'round', join: 'round' });
      } catch {
        /* defekte Bahn */
      }
      pv.position.set(-70, 0);
      card.addChild(pv);
      const name = label(tr.name, 18, INK, true, { wordWrap: true, wordWrapWidth: 130 });
      name.position.set(60, -22);
      card.addChild(name);
      const info = label(`${WORLDS[tr.world - 1].name} · ${new Date(tr.created).toLocaleDateString()}`, 12, '#7a6f8f');
      info.position.set(60, 6);
      card.addChild(info);
      const open = new Button(t('load'), { width: 90, height: 36, size: 15, color: '#7ee081' });
      open.position.set(35, 38);
      open.onTap = () => this.game.goto(() => new LevelScene(0, { world: tr.world, width: tr.width, saved: tr }));
      card.addChild(open);
      const del = new Button('', { width: 36, round: true, color: '#d64545', icon: iconTrash });
      del.position.set(110, 38);
      del.onTap = () => {
        if (confirm(`${t('delete')}: ${tr.name}?`)) {
          storage.deleteTrack(tr.id);
          this.build();
          this.layout();
        }
      };
      card.addChild(del);
      this.list.addChild(card);
    });
    this.layout();
  }

  private layout(): void {
    const portrait = this.h > this.w;
    let y = 110 + this.scroll;
    const header = this.list.children.find((c) => c.name === 'header');
    header?.position.set(this.w / 2, y);
    y += 40;
    const perRow = Math.max(1, Math.floor((this.w - 40) / 210));
    this.newBtns.forEach((b, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const count = Math.min(perRow, this.newBtns.length - row * perRow);
      b.position.set(this.w / 2 + (col - (count - 1) / 2) * 210, y + row * 56);
    });
    y += Math.ceil(this.newBtns.length / perRow) * 56 + 30;
    const cards = this.list.children.filter((c) => c.name === 'card');
    const cols = portrait ? 1 : Math.max(1, Math.floor((this.w - 40) / 320));
    cards.forEach((c, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const count = Math.min(cols, cards.length - row * cols);
      c.position.set(this.w / 2 + (col - (count - 1) / 2) * 320, y + row * 140 + 60);
    });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.sky.width = w;
    this.sky.height = h;
    const safe = safeArea();
    this.title.position.set(w / 2, 50 + safe.top);
    this.backBtn.position.set(safe.left + 36, 40 + safe.top);
    this.layout();
  }
  update(): void {}
}
