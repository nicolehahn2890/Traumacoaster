/**
 * Figuren-Editor: Auswahl statt Zeichnen. Live-Vorschau mit Blinzeln, Kategorien als Tabs,
 * Varianten als Reihe, Farbpalette. Figuren werden lokal gespeichert und fahren mit.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers } from '@/core/input';
import { t } from '@/core/i18n';
import { storage } from '@/core/storage';
import { Button, label, INK, PAPER, paintRect, iconBack, iconPlus, iconTrash } from '@/ui/widgets';
import { CharacterSprite } from '@/render/characterSprite';
import {
  type CharacterDef, randomCharacter, HAIR_STYLES, HEAD_SHAPES, EYE_STYLES, BROW_STYLES, GLASSES_STYLES, BEARD_STYLES, MOUTH_STYLES, HAT_STYLES,
  TOP_STYLES, LOGO_STYLES, PANTS_STYLES, SHOE_STYLES, SKIN_TONES, HAIR_COLORS, PALETTE,
} from '@/editor/characters';
import { skyTexture, hexNum } from '@/render/paint';
import { StartScene } from './start';
import { RIG } from '@/physics/passengers';

type Category = { key: string; label: string; field: keyof CharacterDef; options?: readonly string[]; colorField?: keyof CharacterDef; colors?: readonly string[] };

const CATEGORIES: Category[] = [
  { key: 'skin', label: 'paint.skin', field: 'skin', colors: SKIN_TONES, colorField: 'skin' },
  { key: 'head', label: 'paint.head', field: 'headShape', options: HEAD_SHAPES },
  { key: 'hair', label: 'paint.hair', field: 'hair', options: HAIR_STYLES, colorField: 'hairColor', colors: HAIR_COLORS },
  { key: 'eyes', label: 'paint.eyes', field: 'eyes', options: EYE_STYLES, colorField: 'eyeColor', colors: ['#1b2a4a', '#2f7a4a', '#5a3a22', '#4f8dff', '#9b6dff'] },
  { key: 'brows', label: 'paint.brows', field: 'brows', options: BROW_STYLES },
  { key: 'glasses', label: 'paint.glasses', field: 'glasses', options: GLASSES_STYLES },
  { key: 'beard', label: 'paint.beard', field: 'beard', options: BEARD_STYLES },
  { key: 'mouth', label: 'paint.mouth', field: 'mouth', options: MOUTH_STYLES },
  { key: 'hat', label: 'paint.hat', field: 'hat', options: HAT_STYLES, colorField: 'hatColor', colors: PALETTE },
  { key: 'top', label: 'paint.top', field: 'top', options: TOP_STYLES, colorField: 'topColor', colors: PALETTE },
  { key: 'logo', label: 'paint.logo', field: 'logo', options: LOGO_STYLES },
  { key: 'pants', label: 'paint.pants', field: 'pants', options: PANTS_STYLES, colorField: 'pantsColor', colors: PALETTE },
  { key: 'shoes', label: 'paint.shoes', field: 'shoes', options: SHOE_STYLES, colorField: 'shoeColor', colors: PALETTE },
];

export class EditorScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private sky = new Sprite();
  private preview = new Container();
  private sprite: CharacterSprite | null = null;
  private def: CharacterDef;
  private tabs = new Container();
  private options = new Container();
  private roster = new Container();
  private title = label(t('characterEditor'), 30, '#ffffff', true, { stroke: { color: INK, width: 5 } });
  private nameLabel = label('', 22, INK, true);
  private backBtn = new Button('', { width: 48, round: true, color: '#9b6dff', icon: iconBack });
  private saveBtn = new Button(t('save'), { width: 140, height: 46, size: 18, color: '#7ee081' });
  private randomBtn = new Button(t('randomCharacter'), { width: 120, height: 46, size: 16, color: '#ffd23f', textColor: INK });
  private newBtn = new Button('', { width: 46, round: true, color: '#4f8dff', icon: iconPlus });
  private delBtn = new Button('', { width: 46, round: true, color: '#d64545', icon: iconTrash });
  private category = 0;
  private time = 0;
  private w = 800;
  private h = 600;
  private previewBg = new Graphics();

  constructor() {
    const chars = storage.characters;
    this.def = { ...(chars[0] ?? randomCharacter()) };
  }

  enter(game: Game): void {
    this.game = game;
    this.sky.texture = skyTexture('editor', ['#a98bff', '#ffc9e6', '#fff1b8'], 88);
    this.container.addChild(this.sky, this.previewBg, this.preview, this.title, this.nameLabel, this.tabs, this.options, this.roster, this.backBtn, this.saveBtn, this.randomBtn, this.newBtn, this.delBtn);
    this.backBtn.onTap = () => this.game.goto(() => new StartScene());
    this.saveBtn.onTap = () => this.save();
    this.randomBtn.onTap = () => {
      const r = randomCharacter();
      this.def = { ...r, id: this.def.id, name: this.def.name };
      this.refresh();
    };
    this.newBtn.onTap = () => {
      const r = randomCharacter();
      let name = r.name;
      try {
        name = prompt(t('paint.name'), r.name) || r.name;
      } catch {
        name = r.name;
      }
      this.def = { ...r, name };
      this.refresh();
    };
    this.delBtn.onTap = () => {
      if (storage.characters.length <= 1) return;
      if (confirm(`${t('delete')}: ${this.def.name}?`)) {
        storage.deleteCharacter(this.def.id);
        this.def = { ...storage.characters[0] };
        this.refresh();
      }
    };
    this.handlers.tap = (p) => {
      // Name ändern bei Tipp auf den Namen
      const b = this.nameLabel.getBounds();
      if (p.x >= b.x - 10 && p.x <= b.x + b.width + 10 && p.y >= b.y - 10 && p.y <= b.y + b.height + 10) {
        const name = prompt(t('paint.name'), this.def.name);
        if (name) {
          this.def.name = name;
          this.refresh();
        }
      }
    };
    this.refresh();
  }
  exit(): void {}

  private save(): void {
    storage.saveCharacter({ ...this.def });
    const riders = storage.riders;
    if (!riders.includes(this.def.id)) storage.setRiders([...riders, this.def.id]);
    this.buildRoster();
  }

  private refresh(): void {
    this.preview.removeChildren();
    this.sprite = new CharacterSprite(this.def);
    // Standpose
    const pose = {
      torso: { x: 0, y: 0, angle: 0 },
      head: { x: 0, y: RIG.torso.hy + RIG.head.hy - 0.02, angle: 0 },
      armL: { x: -RIG.torso.hx - 0.04, y: 0.02, angle: 0.12 },
      armR: { x: RIG.torso.hx + 0.04, y: 0.02, angle: -0.12 },
      legL: { x: -0.08, y: -RIG.torso.hy - RIG.leg.hy + 0.02, angle: 0 },
      legR: { x: 0.08, y: -RIG.torso.hy - RIG.leg.hy + 0.02, angle: 0 },
    };
    this.sprite.setPose(pose, 0);
    this.preview.addChild(this.sprite.container);
    this.nameLabel.text = this.def.name;
    this.buildTabs();
    this.buildOptions();
    this.buildRoster();
    this.layout();
  }

  private buildTabs(): void {
    this.tabs.removeChildren();
    CATEGORIES.forEach((cat, i) => {
      const b = new Button(t(cat.label), { width: 92, height: 36, size: 13, color: i === this.category ? '#ff5c8a' : PAPER, textColor: i === this.category ? '#ffffff' : INK, seed: i });
      b.onTap = () => {
        this.category = i;
        this.buildTabs();
        this.buildOptions();
        this.layout();
      };
      this.tabs.addChild(b);
    });
  }

  private buildOptions(): void {
    this.options.removeChildren();
    const cat = CATEGORIES[this.category];
    if (cat.options) {
      cat.options.forEach((opt, i) => {
        const active = this.def[cat.field] === opt;
        const b = new Button(opt, { width: 86, height: 36, size: 12, color: active ? '#3ec7c2' : '#ffffff', textColor: INK, seed: i + 20 });
        b.onTap = () => {
          (this.def as unknown as Record<string, string>)[cat.field] = opt;
          this.refresh();
        };
        b.name = 'opt';
        this.options.addChild(b);
      });
    }
    if (cat.colors && cat.colorField) {
      cat.colors.forEach((col, i) => {
        const g = new Graphics();
        const active = this.def[cat.colorField!] === col;
        g.circle(0, 0, 16).fill(hexNum(col)).stroke({ width: active ? 4 : 2, color: hexNum(active ? '#ff5c8a' : INK) });
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointertap', () => {
          (this.def as unknown as Record<string, string>)[cat.colorField!] = col;
          this.refresh();
        });
        g.name = 'col';
        this.options.addChild(g);
        void i;
      });
    }
  }

  private buildRoster(): void {
    this.roster.removeChildren();
    const chars = storage.characters;
    const riders = storage.riders;
    const header = label(t('whoRides'), 16, INK, true);
    header.name = 'header';
    this.roster.addChild(header);
    chars.forEach((c) => {
      const rides = riders.includes(c.id);
      const b = new Button(`${rides ? '✓ ' : ''}${c.name}`, { width: 110, height: 34, size: 13, color: c.id === this.def.id ? '#ffd23f' : rides ? '#7ee081' : '#ffffff', textColor: INK, seed: c.id.length });
      b.onTap = () => {
        if (c.id === this.def.id) {
          // mitfahren umschalten
          const r = storage.riders;
          storage.setRiders(rides ? r.filter((x) => x !== c.id) : [...r, c.id]);
        } else this.def = { ...c };
        this.refresh();
      };
      b.name = 'char';
      this.roster.addChild(b);
    });
  }

  private layout(): void {
    const w = this.w;
    const h = this.h;
    const portrait = h > w;
    const previewX = portrait ? w / 2 : w * 0.27;
    const previewY = portrait ? h * 0.3 : h * 0.5;
    const scale = portrait ? Math.min(w, h) * 0.26 : h * 0.3;
    this.preview.position.set(previewX, previewY + scale * 0.4);
    this.preview.scale.set(scale, -scale);
    this.previewBg.clear();
    paintRect(this.previewBg, previewX - scale * 0.9, previewY - scale * 0.95, scale * 1.8, scale * 1.9, '#ffffff', INK, 30, 2, 0.75);
    this.nameLabel.position.set(previewX, previewY + scale * 0.85);
    this.title.position.set(w / 2, 40);
    this.backBtn.position.set(36, 40);
    // Tabs
    const tabX0 = portrait ? 12 : w * 0.52;
    const tabY0 = portrait ? h * 0.3 + scale * 1.0 + 20 : 90;
    const tabW = portrait ? w - 24 : w * 0.46;
    const perRow = Math.max(3, Math.floor(tabW / 98));
    this.tabs.children.forEach((c, i) => {
      c.position.set(tabX0 + 48 + (i % perRow) * 98, tabY0 + Math.floor(i / perRow) * 42);
    });
    const tabRows = Math.ceil(this.tabs.children.length / perRow);
    // Optionen
    const optY = tabY0 + tabRows * 42 + 16;
    const opts = this.options.children.filter((c) => c.name === 'opt');
    const cols = this.options.children.filter((c) => c.name === 'col');
    const optPerRow = Math.max(3, Math.floor(tabW / 92));
    opts.forEach((c, i) => c.position.set(tabX0 + 45 + (i % optPerRow) * 92, optY + Math.floor(i / optPerRow) * 42));
    const optRows = Math.ceil(opts.length / optPerRow);
    const colY = optY + optRows * 42 + 20;
    const colPerRow = Math.max(4, Math.floor(tabW / 40));
    cols.forEach((c, i) => c.position.set(tabX0 + 24 + (i % colPerRow) * 40, colY + Math.floor(i / colPerRow) * 40));
    const colRows = Math.ceil(cols.length / colPerRow);
    // Buttons
    const btnY = portrait ? h - 40 : h - 44;
    this.saveBtn.position.set(w / 2 + 70, btnY);
    this.randomBtn.position.set(w / 2 - 70, btnY);
    this.newBtn.position.set(w / 2 + 180, btnY);
    this.delBtn.position.set(w / 2 - 180, btnY);
    // Kader
    const rosterY = portrait ? colY + colRows * 40 + 20 : Math.max(colY + colRows * 40 + 20, h - 150);
    const rx = portrait ? 12 : w * 0.52;
    const header = this.roster.children.find((c) => c.name === 'header');
    header?.position.set(rx + 60, rosterY);
    const chars = this.roster.children.filter((c) => c.name === 'char');
    const cPerRow = Math.max(2, Math.floor(tabW / 116));
    chars.forEach((c, i) => c.position.set(rx + 56 + (i % cPerRow) * 116, rosterY + 30 + Math.floor(i / cPerRow) * 40));
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.sky.width = w;
    this.sky.height = h;
    this.layout();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.sprite) {
      // Figur schaut leicht umher und blinzelt
      const fwd = Math.sin(this.time * 0.7) * 3;
      this.sprite.update(dt, fwd, 9.81 + Math.sin(this.time * 1.3) * 1.5, 1);
      this.sprite.container.rotation = Math.sin(this.time * 1.1) * 0.03;
    }
  }
}
