/**
 * Karte: eine Drehscheibe, auf der jedes Level als Miniatur seiner Bühne steht, mit der Bahn, die dort gebaut
 * wurde, und dem Zug in der Station. Die zehn Welten sind große Zonen auf der Scheibe, jede beginnt mit einem
 * Tor. Wischen dreht die Scheibe, sie rastet auf dem nächsten Level ein; Antippen der Mitte oder „Spielen“
 * öffnet es: Die gebogene Scheibe biegt sich gerade und wird zur Bühne des Levels. Zurück krümmt sich der
 * Boden wieder zur Drehscheibe (das Level übergibt dafür ein Foto seiner Ebenen, siehe mapTransition).
 */
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers, Pt } from '@/core/input';
import { Button, label, INK, PAPER, iconGear, iconPerson, star, paintRect, Toast } from '@/ui/widgets';
import { WORLDS } from '@/levels/worlds';
import { LEVELS } from '@/levels/levels';
import type { LevelDef, WorldDef } from '@/levels/types';
import { Sky, type SkyView } from '@/render/sky';
import { Terrain } from '@/physics/terrain';
import { storage } from '@/core/storage';
import { unlockAll } from '@/core/dev';
import { t } from '@/core/i18n';
import { hexNum, shade, mix, paperTexture } from '@/render/paint';
import { art, ART_NAMES } from '@/assets/manifest';
import { atmosphere } from '@/render/terrainRenderer';
import { laneRise, laneScale, LANE_MIN, LANE_MAX } from '@/track/stage';
import { BentSheet, bendAngle, bendPoint, type BendFrame, type XY } from '@/render/bend';
import { HORIZON_Y, cachedMiniature, getMiniature, levelDraft, miniBounds, renderLanes, type LaneMiniature, type MiniBounds } from '@/render/miniature';
import { unfoldAngle, unfoldLift, unfoldSquash } from '@/render/unfold';
import { LANE_RISE } from '@/track/stage';
import { captureLevel, releaseSnapshot, type LevelSnapshot } from '../mapTransition';
import { LevelScene } from './level';
import { MyTracksScene } from './myTracks';
import { EditorScene } from './editor';
import { SplashScene } from './splash';
import { clamp, lerp, smoothstep } from '@/core/math';
import { WheelPhysics } from '../wheelPhysics';
import { haptics } from '@/platform/haptics';
import { safeArea } from '@/platform/safeArea';
import { drawProp } from '@/render/props';

/** Ein Level auf der Scheibe */
interface Spot {
  id: number;
  world: number;
  level: LevelDef;
  /** Ausschnitt der Miniatur in Bühnen-Metern */
  bounds: MiniBounds;
  /** Karten-Pixel pro Bühnen-Meter */
  m: number;
  /** Mitte und Breite auf dem Bogen (Karten-Pixel) */
  pos: number;
  width: number;
  sheet: BentSheet | null;
  /** Einblenden nach dem Rendern der Miniatur */
  fade: number;
  badge: Container | null;
  badgeScale: number;
  /** Hüpfer der Miniatur nach dem Überfahren des Rastpunkts (1 → 0) */
  bob: number;
}

/** Eine Welt als Zone der Scheibe */
interface Zone {
  world: number;
  start: number;
  /** Mitte des Tors */
  gate: number;
  sign: Container;
}

/** Farben der Bodenstreifen wie im Level (hinterste Spur zuerst), damit die Miniaturen nahtlos aufliegen */
interface Palette {
  lanes: Array<{ base: string; top: string; line: string }>;
}

interface Transition {
  /** 1: Karte → Level, −1: Level → Karte */
  dir: 1 | -1;
  t: number;
  dur: number;
  spot: Spot;
  level: LevelScene | null;
  snap: LevelSnapshot;
  /** Mitte der Miniatur in Bühnen-Metern */
  xc: number;
  /** Zoom vom Karten- zum Level-Maßstab */
  S: number;
  F0: XY;
  F1: XY;
  ui: Sprite;
  world: BentSheet;
  /** Spurstreifen der Ziel-Miniatur, die sich beim Übergang aufklappen (null, wenn nicht renderbar) */
  lanes: { sheets: BentSheet[]; mini: LaneMiniature } | null;
}


/** Nachtwelten (wie im Level: Geister, Vulkan, Weltraum) */
const isNightWorld = (wd: WorldDef): boolean => wd.id === 6 || wd.id === 8 || wd.id === 10;

function palette(wd: WorldDef): Palette {
  const sky = wd.sky[1];
  const lanes: Palette['lanes'] = [];
  for (let z = LANE_MAX; z >= LANE_MIN; z--) {
    const front = shade(wd.ground[0], (z - LANE_MIN) * 0.04);
    const base = atmosphere(z >= 0 ? wd.ground[1] : wd.ground[0], z, sky);
    lanes.push({ base, top: atmosphere(shade(front, 0.1), z, sky), line: shade(base, -0.35) });
  }
  return { lanes };
}

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return { lanes: a.lanes.map((l, i) => ({ base: mix(l.base, b.lanes[i].base, t), top: mix(l.top, b.lanes[i].top, t), line: mix(l.line, b.lanes[i].line, t) })) };
}

const easeInOutCubic = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeInOutSine = (p: number): number => -(Math.cos(Math.PI * p) - 1) / 2;
/** weicher Anstieg von 0 auf 1 zwischen a und b */
const ramp = (p: number, a: number, b: number): number => smoothstep((p - a) / (b - a));

export class StartScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  /** Derselbe Himmel wie im Level (Wolken, Sonne, Hügel-Silhouette); beim Übergang wandert die Wolkenlage mit */
  private skyR: Sky | null = null;
  /** Papierkorn wie im Level, dauerhaft (so fehlt beim Übergang nichts, das einblenden müsste) */
  private paper: TilingSprite | null = null;
  private globe = new Container();
  private ground = new Graphics();
  private sheets = new Container();
  private levelWorldLayer = new Container();
  private gates = new Container();
  private badges = new Container();
  private overLayer = new Container();
  private title = label('Trauma Coaster', 44, '#ffffff', true, { stroke: { color: INK, width: 6 } });
  private worldName = label('', 30, '#ffffff', true, { stroke: { color: INK, width: 5 } });
  private worldInfo = label('', 18, '#ffffff', false, { stroke: { color: INK, width: 4 } });
  private playBtn = new Button(t('play'), { width: 230, height: 64, size: 28 });
  private tracksBtn = new Button(t('myTracks'), { width: 190, height: 50, size: 20, color: '#3ec7c2' });
  private gearBtn = new Button('', { width: 54, round: true, color: '#9b6dff', icon: iconGear });
  private peopleBtn = new Button('', { width: 54, round: true, color: '#ffd23f', icon: iconPerson });
  /** Dev-Modus an/aus: alle Welten, Level, Elemente und Bahntypen zum Testen */
  private devBtn = new Button('DEV', { width: 50, round: true, color: '#bfb7cc', size: 14 });
  private hud: Container[] = [];
  private toast = new Toast();
  private settingsOpen: Container | null = null;

  private spots: Spot[] = [];
  private zones: Zone[] = [];
  private palettes = WORLDS.map(palette);
  private w = 800;
  private h = 600;
  /** Radius der Scheibe und Lage ihrer Oberkante */
  private R = 600;
  private surfaceY = 450;
  private gateW = 200;
  /** Drehscheibe als Glücksrad: Fokus (Bogenposition in der Bildmitte), Schwung, Rasten, Gummiband */
  private wheel = new WheelPhysics([]);
  private cur = 0;
  private shownWorld = -1;
  private frame: BendFrame = { fx: 400, fy: 450, s: 1, k: 1 / 600 };
  private groundKey = '';
  private time = 0;
  private trans: Transition | null = null;
  private opening: { spot: Spot; level: LevelScene | null } | null = null;
  private readonly from: LevelSnapshot | null;
  private readonly tmp: XY = { x: 0, y: 0 };

  /** @param from Foto des Levels, aus dem man zurückkommt: Dann krümmt sich dessen Bühne zur Scheibe */
  constructor(from: LevelSnapshot | null = null) {
    this.from = from;
  }

  enter(game: Game): void {
    this.game = game;
    this.hud = [this.title, this.worldName, this.worldInfo, this.playBtn, this.tracksBtn, this.gearBtn, this.peopleBtn, this.devBtn];
    const startId = this.from?.levelId ?? clamp(storage.progress.current, 1, LEVELS.length);
    this.cur = startId - 1;
    const startWorld = WORLDS[LEVELS[this.cur].world - 1];
    this.skyR = new Sky(startWorld, isNightWorld(startWorld));
    // resize lief schon vor enter (da gab es den Himmel noch nicht): sonst bliebe er 64 px schmal
    this.skyR.resize(this.w, this.h);
    this.shownWorld = startWorld.id - 1;
    if (this.from) this.skyR.importState(this.from.skyState);
    this.paper = new TilingSprite({ texture: art(ART_NAMES.paper(), paperTexture), width: this.w, height: this.h });
    this.paper.blendMode = 'multiply';
    this.paper.alpha = 0.5;
    this.container.addChild(this.skyR.container, this.globe, this.paper, this.overLayer, ...this.hud, this.toast);
    this.globe.addChild(this.ground, this.sheets, this.levelWorldLayer, this.gates, this.badges);
    this.buildSpots();
    this.layout();
    this.focus = this.spots[this.cur].pos;
    this.playBtn.onTap = () => !this.busy && this.openSpot(this.spots[this.cur]);
    this.tracksBtn.onTap = () => !this.busy && this.game.goto(() => new MyTracksScene());
    this.gearBtn.onTap = () => !this.busy && this.toggleSettings();
    this.peopleBtn.onTap = () => !this.busy && this.game.goto(() => new EditorScene());
    this.devBtn.onTap = () => !this.busy && this.toggleDevMode();
    this.devBtn.setColor(storage.settings.devMode ? '#7ee081' : '#bfb7cc');
    this.setupInput();
    this.updateTexts();
    if (this.from) {
      // Die Miniatur des Levels (mit der eben gebauten Bahn) gleich rendern; die Nachbarn folgen, während die
      // Knöpfe des Levels ausblenden und bevor sich die Bühne sichtbar zur Scheibe krümmt.
      getMiniature(this.game.app.renderer, this.spots[this.cur].id);
      this.startTransition(-1, this.spots[this.cur], this.from, null);
    }
    this.update(0);
  }

  exit(): void {
    if (this.trans) this.endTransition();
    if (this.opening?.level) this.opening.level.exit();
    this.opening = null;
    for (const sp of this.spots) {
      sp.sheet?.destroy();
      sp.sheet = null;
    }
  }

  /** Während eines Übergangs (oder des Öffnens) keine Eingaben */
  private get busy(): boolean {
    return !!this.trans || !!this.opening;
  }

  /** Bogenposition in der Bildmitte (Karten-Pixel) */
  private get focus(): number {
    return this.wheel.focus;
  }
  private set focus(v: number) {
    this.wheel.focus = v;
  }
  private get velocity(): number {
    return this.wheel.velocity;
  }
  private get dragging(): boolean {
    return this.wheel.dragging;
  }

  // ------------------------------------------------------------------ Aufbau
  private buildSpots(): void {
    this.spots = LEVELS.map((level) => {
      const path = levelDraft(level.id);
      return {
        id: level.id, world: level.world - 1, level, bounds: miniBounds(level, new Terrain(level), path),
        m: 1, pos: 0, width: 0, sheet: null, fade: 0, badge: null, badgeScale: 1, bob: 0,
      };
    });
    this.zones = WORLDS.map((wd, i) => ({ world: i, start: 0, gate: 0, sign: this.makeGate(wd, i) }));
    for (const z of this.zones) this.gates.addChild(z.sign);
  }

  /** Tor einer Zone: Hügel in Weltfarbe mit dem Wahrzeichen der Welt, Nummer und Name */
  private makeGate(wd: WorldDef, i: number): Container {
    const c = new Container();
    const g = new Graphics();
    const col = wd.ground[0];
    g.ellipse(0, 12, 120, 30).fill({ color: hexNum(shade(INK, 0.1)), alpha: 0.18 });
    g.moveTo(-120, 14).bezierCurveTo(-80, -50, 80, -50, 120, 14).closePath().fill(hexNum(col)).stroke({ width: 3, color: hexNum(shade(col, -0.45)) });
    g.moveTo(-95, 4).bezierCurveTo(-55, -34, 55, -34, 95, 4).closePath().fill({ color: hexNum(shade(col, 0.18)), alpha: 0.8 });
    c.addChild(g);
    const prop = new Container();
    prop.scale.set(6.5, -6.5);
    prop.position.set(0, -18);
    const propId = ['house', 'ferris', 'headframe', 'tree', 'castle', 'tower', 'tree', 'ghostHouse', 'tree', 'spaceBuilding'][i];
    drawProp(prop, propId, wd, 0);
    c.addChild(prop);
    const num = label(`${i + 1}`, 22, '#ffffff', true, { stroke: { color: INK, width: 4 } });
    num.position.set(0, 34);
    c.addChild(num);
    const name = label(wd.name, 17, '#ffffff', true, { stroke: { color: INK, width: 4 } });
    name.position.set(0, -92);
    c.addChild(name);
    return c;
  }

  /** Schild über einer Miniatur: Levelnummer und Sterne (oder Schloss) */
  private makeBadge(sp: Spot): Container {
    const c = new Container();
    const g = new Graphics();
    const p = storage.progress;
    const stars = p.stars[sp.id] ?? 0;
    const locked = !this.worldUnlocked(sp.world);
    const open = sp.id <= p.highest + 1 || unlockAll();
    // Papier für spielbare Level (goldene Sterne heben sich ab), blasser noch nicht erreichte, grau gesperrte
    const col = locked ? '#bfb7cc' : open ? PAPER : '#e6def0';
    g.poly([-7, 12, 7, 12, 0, 21]).fill(hexNum(col)).stroke({ width: 2.5, color: hexNum(INK), join: 'round' });
    paintRect(g, -46, -15, 92, 30, col, INK, 15, sp.id, 1);
    if (locked) {
      g.roundRect(9, -4, 18, 13, 3).fill(hexNum(INK));
      g.arc(18, -4, 6, Math.PI, 0).stroke({ width: 3, color: hexNum(INK) });
    } else {
      for (let i = 0; i < 3; i++) star(g, i * 16, 0, 6.5, i < stars);
    }
    c.addChild(g);
    const num = label(`${sp.id}`, 17, INK, true);
    num.position.set(-27, 0);
    c.addChild(num);
    return c;
  }

  /**
   * Lage aller Level auf dem Bogen. Jede Miniatur bekommt ihren eigenen Maßstab, damit breite und hohe Bahnen
   * genauso in den Blick passen wie kleine; zwischen den Miniaturen wechselt der Maßstab weich.
   */
  private layout(): void {
    const { w, h } = this;
    const portrait = h > w;
    this.R = portrait ? Math.max(w * 0.95, h * 0.55) : Math.max(w * 0.6, h * 0.9);
    // Scheibe höher im Bild: die Miniatur bekommt mehr Raum, „Spielen“ liegt in beiden Formaten mittig darunter
    this.surfaceY = portrait ? h * 0.56 : h * 0.74;
    const textBottom = portrait ? 176 : 88;
    const maxH = Math.max(60, this.surfaceY - textBottom - 52);
    const targetW = portrait ? w * 0.92 : Math.min(w * 0.46, 520);
    const gap = targetW * 0.16;
    this.gateW = Math.max(220, targetW * 0.7);
    let x = 0;
    let world = -1;
    for (const sp of this.spots) {
      if (sp.world !== world) {
        world = sp.world;
        const z = this.zones[world];
        z.start = x;
        z.gate = x + this.gateW / 2;
        x += this.gateW;
      }
      const bw = sp.bounds.maxX - sp.bounds.minX;
      sp.m = Math.min(targetW / bw, maxH / Math.max(10, sp.bounds.maxY - HORIZON_Y), (targetW / 70) * 1.1);
      sp.width = bw * sp.m;
      sp.pos = x + sp.width / 2;
      x += sp.width + gap;
    }
    this.wheel.setPositions(this.spots.map((sp) => sp.pos));
  }

  /** Maßstab an einer Bogenposition (zwischen den Miniaturen linear) */
  private mAt(p: number): number {
    const s = this.spots;
    if (p <= s[0].pos) return s[0].m;
    if (p >= s[s.length - 1].pos) return s[s.length - 1].m;
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].pos <= p) lo = mid;
      else hi = mid;
    }
    const t = (p - s[lo].pos) / (s[hi].pos - s[lo].pos);
    return lerp(s[lo].m, s[hi].m, smoothstep(t));
  }

  private nearest(p: number): number {
    return this.wheel.nearest(p);
  }

  // ------------------------------------------------------------------ Eingabe
  private setupInput(): void {
    this.handlers.dragStart = (pt) => {
      if (this.settingsOpen || this.busy) return;
      this.wheel.dragStart(pt.x, performance.now());
    };
    this.handlers.dragMove = (pt) => {
      if (!this.dragging) return;
      this.wheel.dragMove(pt.x, performance.now(), this.frame.s);
    };
    this.handlers.dragEnd = () => {
      if (!this.dragging) return;
      // Loslassen: mit Schwung dreht die Scheibe frei aus und rastet in Fahrtrichtung ein (Glücksrad)
      this.wheel.dragEnd(performance.now());
    };
    this.handlers.tap = (pt) => {
      if (this.settingsOpen) {
        // Zahnrad und Panel-Knöpfe verarbeitet schon der Pixi-Button (er feuert vor diesem Handler);
        // nur ein Tipp daneben schließt das Panel, sonst ginge es im selben Tipp wieder zu.
        if (!this.hits(this.settingsOpen, pt) && !this.hits(this.gearBtn, pt)) this.toggleSettings();
        return;
      }
      if (this.busy) return;
      if ([this.playBtn, this.tracksBtn, this.gearBtn, this.peopleBtn, this.devBtn].some((b) => this.hits(b, pt))) return;
      const sp = this.spotAt(pt);
      if (sp) {
        // Mitte antippen öffnet, ein Nachbar dreht sich erst in die Mitte
        if (sp === this.spots[this.cur] && Math.abs(sp.pos - this.focus) < sp.width * 0.25) this.openSpot(sp);
        else this.selectSpot(this.spots.indexOf(sp));
        return;
      }
      const z = this.gateAt(pt);
      if (z) this.selectSpot(z.world * 15);
    };
    this.handlers.key = (k) => {
      if (this.busy || this.settingsOpen) return;
      // vom Ziel aus weiterzählen, falls die Scheibe noch dreht
      const from = this.wheel.target !== null ? this.wheel.targetIndex : this.cur;
      if (k === 'ArrowLeft') this.selectSpot(from - 1);
      if (k === 'ArrowRight') this.selectSpot(from + 1);
      if (k === 'Enter') this.openSpot(this.spots[this.cur]);
    };
  }

  private selectSpot(i: number): void {
    this.wheel.select(i);
  }

  /** Liegt der Punkt (Bildschirm-Pixel) in den Grenzen des Containers? */
  private hits(c: Container, pt: { x: number; y: number }): boolean {
    const b = c.getBounds();
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
  }

  /** Bildschirmpunkt → flache Koordinaten auf der ruhenden Scheibe */
  private toFlat(pt: Pt): { u: number; v: number } {
    const f = this.frame;
    const cx = f.fx;
    const cy = f.fy + f.s / f.k;
    const dx = pt.x - cx;
    const dy = cy - pt.y;
    return { u: Math.atan2(dx, dy) / f.k, v: Math.hypot(dx, dy) / f.s - 1 / f.k };
  }

  private spotAt(pt: Pt): Spot | null {
    const { u, v } = this.toFlat(pt);
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const sp of this.spots) {
      const du = Math.abs(u - (sp.pos - this.focus));
      if (du > sp.width / 2 + 10) continue;
      const top = (sp.bounds.maxY - HORIZON_Y) * sp.m + 48;
      if (v < -(HORIZON_Y - laneRise(LANE_MIN)) * sp.m - 10 || v > top) continue;
      if (du < bestD) {
        bestD = du;
        best = sp;
      }
    }
    return best;
  }

  private gateAt(pt: Pt): Zone | null {
    const { u, v } = this.toFlat(pt);
    for (const z of this.zones) {
      if (Math.abs(u - (z.gate - this.focus)) < this.gateW * 0.4 && v > -40 && v < 110) return z;
    }
    return null;
  }

  private worldUnlocked(w: number): boolean {
    if (w === 0) return true;
    const p = storage.progress;
    // Welt frei, wenn mindestens 10 Level der vorherigen Welt geschafft sind
    const prevFirst = (w - 1) * 15 + 1;
    let done = 0;
    for (let id = prevFirst; id < prevFirst + 15; id++) if (p.stars[id] > 0) done++;
    return done >= 10 || unlockAll();
  }

  // ------------------------------------------------------------------ Level öffnen
  private openSpot(sp: Spot): void {
    if (this.busy) return;
    if (!this.worldUnlocked(sp.world)) {
      this.toast.show(t('worldLocked', { n: sp.world }));
      return;
    }
    if (this.settingsOpen) this.toggleSettings();
    storage.setCurrent(sp.id);
    this.selectSpot(this.spots.indexOf(sp));
    this.wheel.velocity = 0;
    const level = new LevelScene(sp.id);
    const opening: { spot: Spot; level: LevelScene | null } = { spot: sp, level: null };
    this.opening = opening;
    this.game
      .prepare(level)
      .then(() => {
        if (this.opening === opening) opening.level = level;
        else level.exit();
      })
      .catch((err) => {
        console.error(err);
        if (this.opening === opening) this.opening = null;
        this.game.goto(() => new LevelScene(sp.id));
      });
  }

  /** Level ist vorbereitet und die Miniatur steht in der Mitte: Foto machen und losbiegen */
  private launchOpening(): void {
    const op = this.opening;
    if (!op?.level || Math.abs(this.focus - op.spot.pos) > 0.75) return;
    this.wheel.focus = op.spot.pos;
    this.wheel.target = null;
    this.wheel.velocity = 0;
    const level = op.level;
    level.update(0);
    const snap = captureLevel(this.game, op.spot.id, level.transitionLayers());
    this.opening = null;
    this.startTransition(1, op.spot, snap, level);
  }

  private startTransition(dir: 1 | -1, sp: Spot, snap: LevelSnapshot, level: LevelScene | null): void {
    const cam = snap.cam;
    const xc = (sp.bounds.minX + sp.bounds.maxX) / 2;
    const ui = new Sprite(snap.ui);
    const world = new BentSheet(snap.world, 32, 18);
    this.levelWorldLayer.addChild(world.mesh);
    this.overLayer.addChild(ui);
    // Spurstreifen der Miniatur (fünf Texturen, nur für diesen Übergang)
    let lanes: Transition['lanes'] = null;
    try {
      const mini = renderLanes(this.game.app.renderer, sp.id);
      const sheets = mini.textures.map((tex) => new BentSheet(tex, 20, 8));
      for (const sh of sheets) this.sheets.addChild(sh.mesh);
      lanes = { sheets, mini };
    } catch (err) {
      console.warn('Spurstreifen nicht renderbar', err);
    }
    this.trans = {
      dir, t: 0, dur: dir === 1 ? 1.55 : 1.35, spot: sp, level, snap, xc,
      S: cam.zoom / sp.m,
      F0: { x: this.w / 2, y: this.surfaceY },
      F1: { x: (xc - cam.x) * cam.zoom + cam.width / 2, y: cam.height / 2 - (HORIZON_Y - cam.y) * cam.zoom },
      ui, world, lanes,
    };
    this.wheel.dragging = false;
  }

  private endTransition(): void {
    const tr = this.trans;
    if (!tr) return;
    this.trans = null;
    tr.ui.destroy();
    tr.world.destroy();
    if (tr.lanes) {
      for (const sh of tr.lanes.sheets) sh.destroy();
      for (const tex of tr.lanes.mini.textures) tex.destroy(true);
    }
    releaseSnapshot(tr.snap);
  }

  /**
   * Spurstreifen der Ziel-Miniatur im Übergang: jede Spur klappt (hinten zuerst) etwas vom Boden ab und wird dabei
   * leicht gestaucht, bis das Level-Bild übernimmt; auf dem Rückweg läuft es rückwärts.
   */
  private updateLaneSheets(sp: Spot, p: number): void {
    const tr = this.trans;
    if (!tr?.lanes) return;
    const f = this.frame;
    const bb = tr.lanes.mini.bounds;
    const xc = (bb.minX + bb.maxX) / 2;
    const u0 = sp.pos - this.focus;
    const alpha = 1 - ramp(p, 0.6, 0.9);
    tr.lanes.sheets.forEach((sh, i) => {
      const z = tr.lanes!.mini.lanes[i];
      const squash = unfoldSquash(z, p);
      const lift = unfoldLift(z, p) * LANE_RISE * 0.5 * sp.m;
      sh.update((tu, tv, out) => {
        const X = xc + (bb.minX + tu * (bb.maxX - bb.minX) - xc) * squash;
        const Y = bb.maxY - tv * (bb.maxY - bb.minY);
        bendPoint(f, u0 + (X - xc) * sp.m, (Y - HORIZON_Y) * sp.m + lift, out);
      });
      sh.mesh.alpha = alpha;
      sh.mesh.visible = alpha > 0.005;
    });
    void unfoldAngle;
  }

  /** Blick für den gemeinsamen Himmel: auf der Karte ruhig (Wolken 0,3×), im Übergang zur Level-Kamera hin */
  private skyView(p: number): SkyView {
    const mx = this.focus / 5;
    const rest: SkyView = { x: mx, y: 10, zoom: 12, parallax: 0.3 };
    const cam = this.trans?.snap.cam;
    if (!cam) return rest;
    const q = ramp(p, 0.2, 0.9);
    return { x: lerp(mx, cam.x, q), y: lerp(10, cam.y, q), zoom: lerp(12, cam.zoom, q), parallax: lerp(0.3, 1, q) };
  }

  /** Fortschritt des Übergangs: 0 = Karte in Ruhe, 1 = Level */
  private get progress(): number {
    const tr = this.trans;
    if (!tr) return 0;
    const q = clamp(tr.t / tr.dur, 0, 1);
    return tr.dir === 1 ? q : 1 - q;
  }

  private updateFrame(): void {
    const k0 = 1 / this.R;
    const tr = this.trans;
    if (!tr) {
      this.frame = { fx: this.w / 2, fy: this.surfaceY, s: 1, k: k0 };
      return;
    }
    const p = this.progress;
    // Zoom gleichmäßig im Logarithmus; der Fokus wandert so, als zoomte man um einen festen Punkt
    const e = easeInOutCubic(p);
    const s = Math.exp(Math.log(tr.S) * e);
    const w = Math.abs(tr.S - 1) > 1e-3 ? (s - 1) / (tr.S - 1) : e;
    // Der Boden biegt sich etwas früher gerade, als der Zoom ankommt
    const c = easeInOutSine(clamp(p / 0.9, 0, 1));
    this.frame = { fx: lerp(tr.F0.x, tr.F1.x, w), fy: lerp(tr.F0.y, tr.F1.y, w), s, k: k0 * (1 - c) };
  }

  // ------------------------------------------------------------------ Loop
  update(dt: number): void {
    if (!this.spots.length) return;
    this.time += dt;
    if (this.trans) {
      this.trans.t += dt;
      if (this.trans.t >= this.trans.dur) {
        const tr = this.trans;
        if (tr.dir === 1 && tr.level) {
          // Bild und Level sind jetzt deckungsgleich: Wolkenlage übergeben, Level übernehmen (räumt diese Szene ab)
          if (this.skyR) tr.level.adoptSky(this.skyR.exportState());
          this.game.adopt(tr.level);
          return;
        }
        this.endTransition();
      }
    } else {
      this.updateScroll(dt);
      if (this.opening) this.launchOpening();
    }
    const cur = clamp(this.nearest(this.focus), 0, this.spots.length - 1);
    if (cur !== this.cur) {
      this.cur = cur;
      this.updateTexts();
    }
    this.updateFrame();
    const p = this.progress;
    // Boden nur neu zeichnen, wenn sich Scheibe oder Übergang bewegt haben
    const f = this.frame;
    const key = `${this.focus.toFixed(2)}|${f.fx.toFixed(2)}|${f.fy.toFixed(2)}|${f.s.toFixed(5)}|${f.k.toExponential(5)}|${p.toFixed(4)}|${this.w}x${this.h}`;
    if (key !== this.groundKey) {
      this.groundKey = key;
      this.drawGround(p);
    }
    this.updateSpots(dt, p);
    this.updateGates(p);
    this.updateTransitionLayers(p);
    // Derselbe Himmel wie im Level: Wolken wandern mit der Scheibe (gedämpft) und im Übergang zur Level-Kamera hin
    this.skyR?.update(dt, this.skyView(p));
    const hudA = 1 - ramp(p, 0, 0.3);
    for (const el of this.hud) {
      el.alpha = hudA;
      el.visible = hudA > 0.01;
    }
    this.toast.update(dt);
  }

  private updateScroll(dt: number): void {
    const { passed } = this.wheel.step(dt);
    // jeder überfahrene Rastpunkt klickt: Haptik, Schild hüpft, Miniatur wippt
    for (const i of passed) {
      const sp = this.spots[i];
      if (!sp) continue;
      sp.badgeScale = 1.3;
      sp.bob = 1;
      haptics.selection();
    }
  }

  /** Sichtbarer Bogenbereich (Bogenpositionen) */
  private visibleArc(): [number, number] {
    const f = this.frame;
    let U = (Math.hypot(this.w, this.h) * 1.1) / f.s;
    if (f.k > 0) U = Math.min(U, (Math.PI / 2 + 0.3) / f.k);
    return [this.focus - U, this.focus + U];
  }

  /**
   * Boden der Scheibe: fünf Spurstreifen wie im Level (Farbe der Zone, im Torbereich gemischt), darunter
   * der Körper in der Farbe der vordersten Spur. Die Streifen sind so breit wie die Spuren der Miniatur an
   * dieser Stelle, damit Miniatur und Boden ineinander übergehen.
   */
  private drawGround(p: number): void {
    const g = this.ground;
    g.clear();
    g.alpha = 1 - ramp(p, 0.82, 1);
    if (g.alpha <= 0) return;
    const [a, b] = this.visibleArc();
    for (let i = 0; i < this.zones.length; i++) {
      const zs = i === 0 ? -1e9 : this.zones[i].start;
      const ze = i === this.zones.length - 1 ? 1e9 : this.zones[i + 1].start;
      const pal = this.palettes[i];
      let solidFrom = zs;
      if (i > 0) {
        const prev = this.palettes[i - 1];
        const n = 6;
        for (let j = 0; j < n; j++) {
          const p0 = zs + (this.gateW * j) / n;
          const p1 = zs + (this.gateW * (j + 1)) / n;
          this.groundRun(Math.max(a, p0), Math.min(b, p1 + 0.5), mixPalette(prev, pal, smoothstep((j + 0.5) / n)), p);
        }
        solidFrom = zs + this.gateW;
      }
      this.groundRun(Math.max(a, solidFrom), Math.min(b, ze), pal, p);
    }
  }

  private groundRun(p0: number, p1: number, pal: Palette, p: number): void {
    if (p1 <= p0) return;
    const g = this.ground;
    const f = this.frame;
    const n = Math.max(2, Math.ceil((p1 - p0) / 10) + 1);
    const ps: number[] = [];
    const ms: number[] = [];
    for (let i = 0; i < n; i++) {
      const q = p0 + ((p1 - p0) * i) / (n - 1);
      ps.push(q);
      ms.push(this.mAt(q));
    }
    const depth = 0.97 * this.R;
    const edge = (vOf: (m: number) => number, reverse: boolean, out: number[]) => {
      for (let j = 0; j < n; j++) {
        const i = reverse ? n - 1 - j : j;
        bendPoint(f, ps[i] - this.focus, vOf(ms[i]), this.tmp);
        out.push(this.tmp.x, this.tmp.y);
      }
    };
    // Schatten über dem Rand der Scheibe
    const rim: number[] = [];
    edge(() => 6, false, rim);
    edge(() => 0, true, rim);
    g.poly(rim).fill({ color: hexNum(INK), alpha: 0.2 * (1 - ramp(p, 0, 0.5)) });
    for (let li = 0; li < pal.lanes.length; li++) {
      const z = LANE_MAX - li;
      const lane = pal.lanes[li];
      const k = laneScale(z);
      const vTop = (m: number) => (laneRise(z) - HORIZON_Y) * m;
      const vBot = z > LANE_MIN ? (m: number) => (laneRise(z - 1) - HORIZON_Y) * m : () => -depth;
      const band: number[] = [];
      edge(vTop, false, band);
      edge(vBot, true, band);
      g.poly(band).fill(hexNum(lane.base));
      const light: number[] = [];
      edge(vTop, false, light);
      edge((m) => vTop(m) - 1.1 * k * m, true, light);
      g.poly(light).fill({ color: hexNum(lane.top), alpha: 0.85 });
      const line: number[] = [];
      edge(vTop, false, line);
      g.poly(line, false).stroke({ width: Math.max(0.8, 0.22 * k * ms[0] * f.s), color: hexNum(lane.line), alpha: 0.6, join: 'round', cap: 'round' });
    }
    // Kontur der Scheibe (verschwindet, wenn sie zur Bühne wird)
    const outline: number[] = [];
    edge(() => 0, false, outline);
    g.poly(outline, false).stroke({ width: 3, color: hexNum(shade(pal.lanes[0].base, -0.45)), alpha: 1 - ramp(p, 0, 0.6), join: 'round', cap: 'round' });
  }

  /** Miniaturen und Schilder der sichtbaren Level biegen; fehlende Miniaturen nach und nach rendern */
  private updateSpots(dt: number, p: number): void {
    const f = this.frame;
    const [a, b] = this.visibleArc();
    const tr = this.trans;
    const visible: Spot[] = [];
    for (const sp of this.spots) {
      const inView = sp.pos + sp.width / 2 > a && sp.pos - sp.width / 2 < b;
      if (!inView) {
        // Die Textur bleibt im Speicher der Miniaturen, nur das Gitter geht
        sp.sheet?.destroy();
        sp.sheet = null;
        if (sp.badge) sp.badge.visible = false;
        continue;
      }
      visible.push(sp);
    }
    // Miniaturen: höchstens eine neue pro Bild, die nächste zuerst. Nicht beim schnellen Drehen und nicht,
    // während sich der Boden biegt (nur ganz am Anfang des Rückwegs, solange das Level-Bild noch alles deckt).
    visible.sort((x, y) => Math.abs(x.pos - this.focus) - Math.abs(y.pos - this.focus));
    let budget = tr ? 0 : Math.abs(this.velocity) < 900 ? 1 : 0;
    if (tr?.dir === -1 && p > 0.75) {
      const i = this.spots.indexOf(tr.spot);
      const next = [this.spots[i - 1], this.spots[i + 1]].find((n) => n && !cachedMiniature(n.id));
      if (next) getMiniature(this.game.app.renderer, next.id);
    }
    const others = 1 - ramp(p, 0.45, 0.85);
    const badgeA = 1 - ramp(p, 0.05, 0.4);
    for (const sp of visible) {
      if (!sp.sheet) {
        let mini = cachedMiniature(sp.id);
        if (!mini && budget > 0) {
          budget--;
          mini = getMiniature(this.game.app.renderer, sp.id);
          sp.fade = 0;
        } else if (mini) sp.fade = 1;
        if (mini) {
          sp.sheet = new BentSheet(mini.texture, 20, 8);
          if (!this.worldUnlocked(sp.world)) sp.sheet.mesh.tint = 0xb4adc0;
          this.sheets.addChild(sp.sheet.mesh);
        }
      }
      const isTarget = tr?.spot === sp;
      if (sp.sheet) {
        sp.fade = Math.min(1, sp.fade + dt * 3);
        const bb = sp.bounds;
        const xc = (bb.minX + bb.maxX) / 2;
        const u0 = sp.pos - this.focus;
        // Miniaturen wippen leicht (Parallaxe-Leben), ein überfahrener Rastpunkt lässt sie kurz hüpfen
        const wobble = tr ? 0 : 1.5 * Math.sin(this.time * 1.3 + sp.id) + 6 * sp.bob * (1 - sp.bob);
        sp.sheet.update((tu, tv, out) => {
          const X = bb.minX + tu * (bb.maxX - bb.minX);
          const Y = bb.maxY - tv * (bb.maxY - bb.minY);
          bendPoint(f, u0 + (X - xc) * sp.m, (Y - HORIZON_Y) * sp.m + wobble, out);
        });
        const locked = !this.worldUnlocked(sp.world);
        const base = sp.fade * (locked ? 0.6 : 1);
        // Ziel des Übergangs: statt der flachen Miniatur klappen ihre Spurstreifen auf (wenn vorhanden)
        const hasLanes = isTarget && !!tr?.lanes;
        sp.sheet.mesh.alpha = hasLanes ? 0 : isTarget ? base * (1 - ramp(p, 0.8, 0.95)) : base * others;
        sp.sheet.mesh.visible = sp.sheet.mesh.alpha > 0.005;
        if (hasLanes) this.updateLaneSheets(sp, p);
      }
      // Schild über der Miniatur
      if (!sp.badge) {
        sp.badge = this.makeBadge(sp);
        this.badges.addChild(sp.badge);
      }
      const isCur = this.spots[this.cur] === sp;
      sp.bob = Math.max(0, sp.bob - dt * 4);
      sp.badgeScale = lerp(sp.badgeScale, isCur && !tr ? 1.14 : 1, Math.min(1, dt * 10));
      const u = sp.pos - this.focus;
      bendPoint(f, u, (sp.bounds.maxY - HORIZON_Y) * sp.m + 26, this.tmp);
      sp.badge.position.set(this.tmp.x, this.tmp.y);
      sp.badge.rotation = bendAngle(f, u);
      sp.badge.scale.set(sp.badgeScale * f.s);
      sp.badge.alpha = badgeA;
      sp.badge.visible = badgeA > 0.01;
    }
  }

  private updateGates(p: number): void {
    const f = this.frame;
    const [a, b] = this.visibleArc();
    const base = this.h > this.w ? 0.8 : 1;
    const alpha = 1 - ramp(p, 0.05, 0.4);
    for (const z of this.zones) {
      const vis = z.gate > a - this.gateW && z.gate < b + this.gateW && alpha > 0.01;
      z.sign.visible = vis;
      if (!vis) continue;
      const u = z.gate - this.focus;
      bendPoint(f, u, 0, this.tmp);
      z.sign.position.set(this.tmp.x, this.tmp.y);
      z.sign.rotation = bendAngle(f, u);
      z.sign.scale.set(base * f.s);
      z.sign.alpha = alpha;
    }
  }

  /** Level-Ebenen im Übergang: Himmel und Knöpfe blenden über, die Bühne liegt gebogen auf der Scheibe */
  private updateTransitionLayers(p: number): void {
    const tr = this.trans;
    if (!tr) return;
    const f = this.frame;
    const cam = tr.snap.cam;
    const sp = tr.spot;
    const u0 = sp.pos - this.focus;
    tr.world.update((tu, tv, out) => {
      const X = (tu * cam.width - cam.width / 2) / cam.zoom + cam.x;
      const Y = (cam.height / 2 - tv * cam.height) / cam.zoom + cam.y;
      bendPoint(f, u0 + (X - tr.xc) * sp.m, (Y - HORIZON_Y) * sp.m, out);
    });
    tr.world.mesh.alpha = tr.lanes ? ramp(p, 0.6, 0.9) : ramp(p, 0.4, 0.8);
    tr.ui.alpha = ramp(p, 0.82, 1);
  }

  private updateTexts(): void {
    const sp = this.spots[this.cur];
    const wd = WORLDS[sp.world];
    this.worldName.text = `${t('world', { n: wd.id })}: ${wd.name}`;
    const locked = !this.worldUnlocked(sp.world);
    this.worldInfo.text = `${t('level', { n: sp.id })} · ${sp.level.name}${locked ? '  ·  ' + t('locked') : ''}`;
    if (sp.world !== this.shownWorld) {
      // Himmel der Zone weich überblenden (derselbe Himmel wie im Level dieser Welt)
      this.shownWorld = sp.world;
      this.skyR?.setWorld(wd, isNightWorld(wd), 0.6);
    }
  }

  /** Dev-Modus umschalten; Schilder und Miniaturen (Schloss, Bahntyp) bauen sich neu auf */
  private toggleDevMode(): void {
    const on = !storage.settings.devMode;
    storage.updateSettings({ devMode: on });
    this.devBtn.setColor(on ? '#7ee081' : '#bfb7cc');
    this.toast.show(on ? 'Dev-Modus an: alle Welten, Level, Elemente und Bahntypen frei' : 'Dev-Modus aus', 2.2);
    for (const sp of this.spots) {
      sp.sheet?.destroy();
      sp.sheet = null;
      sp.badge?.destroy({ children: true });
      sp.badge = null;
    }
    this.updateTexts();
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
    paintRect(g, -150, -150, 300, 300, PAPER, INK, 24, 4);
    c.addChild(g);
    const title = label(t('settings'), 26, INK, true);
    title.position.set(0, -115);
    c.addChild(title);
    const s = storage.settings;
    const sound = new Button(`${t('sound')}: ${s.sound ? 'An' : 'Aus'}`, { width: 240, height: 46, size: 18, color: s.sound ? '#7ee081' : '#bfb7cc' });
    sound.position.set(0, -62);
    sound.onTap = () => {
      storage.updateSettings({ sound: !storage.settings.sound });
      this.toggleSettings();
      this.toggleSettings();
    };
    const lang = new Button(`${t('language')}: ${s.language.toUpperCase()}`, { width: 240, height: 46, size: 18, color: '#4f8dff' });
    lang.position.set(0, -6);
    lang.onTap = () => {
      storage.updateSettings({ language: storage.settings.language === 'de' ? 'en' : 'de' });
      location.reload();
    };
    // Intro (illudiy-Splash) erneut abspielen; das Logo liegt nach dem ersten Mal im Cache
    const intro = new Button(t('replayIntro'), { width: 240, height: 46, size: 18, color: '#3ec7c2' });
    intro.position.set(0, 50);
    intro.onTap = () => {
      this.toggleSettings();
      void SplashScene.preload().then((tex) => this.game.goto(() => new SplashScene(tex)));
    };
    const reset = new Button('Spielstand löschen', { width: 240, height: 46, size: 18, color: '#d64545' });
    reset.position.set(0, 106);
    reset.onTap = () => {
      if (confirm('Spielstand wirklich löschen?')) {
        storage.reset();
        location.reload();
      }
    };
    c.addChild(sound, lang, intro, reset);
    c.position.set(this.w / 2, this.h / 2);
    c.eventMode = 'static';
    this.container.addChild(c);
    this.settingsOpen = c;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.skyR?.resize(w, h);
    if (this.paper) {
      this.paper.width = w;
      this.paper.height = h;
    }
    const portrait = h > w;
    // Vollbild: Bedienelemente weichen Kerbe und Home-Leiste aus, die Scheibe liegt darunter
    const safe = safeArea();
    // Texte oben kompakt, „Spielen“ in beiden Formaten mittig unter der Scheibe
    this.title.position.set(w / 2, (portrait ? 96 : 30) + safe.top);
    this.title.style.fontSize = portrait ? 36 : 26;
    this.worldName.position.set(w / 2, (portrait ? 140 : 58) + safe.top);
    this.worldName.style.fontSize = portrait ? 26 : 20;
    this.worldInfo.position.set(w / 2, this.worldName.y + (portrait ? 30 : 22));
    this.worldInfo.style.fontSize = portrait ? 17 : 14;
    this.playBtn.position.set(w / 2, (portrait ? h - 70 : h - 46) - safe.bottom);
    this.tracksBtn.position.set(w - safe.right - (portrait ? 105 : 115), 44 + safe.top);
    this.gearBtn.position.set(safe.left + 44, 44 + safe.top);
    this.peopleBtn.position.set(safe.left + 110, 44 + safe.top);
    this.devBtn.position.set(safe.left + 40, h - safe.bottom - 40);
    this.toast.position.set(w / 2, h * 0.5);
    this.settingsOpen?.position.set(w / 2, h / 2);
    if (!this.spots.length) return;
    // Ein laufender Übergang endet sofort, sonst passten Foto und Bildschirm nicht mehr zusammen
    if (this.trans) this.trans.t = this.trans.dur;
    const id = this.spots[this.cur].id;
    this.layout();
    this.wheel.focus = this.spots[id - 1].pos;
    this.wheel.target = null;
    this.wheel.velocity = 0;
  }
}
