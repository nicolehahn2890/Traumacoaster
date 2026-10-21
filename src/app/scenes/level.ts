/**
 * Level-Szene: Bühnen-Zeichnen (Boden = Tiefe, steil = Höhe), 3D-Knoten mit Tangenten-, Tiefen- und
 * Roll-Handle, Chips, Element-Regal, Fahrt mit Kamera, Ergebnis. Auch Sandbox („Meine Bahnen“).
 */
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../scene';
import type { Game } from '../game';
import type { InputHandlers, Pt } from '@/core/input';
import { t } from '@/core/i18n';
import { storage, type SavedTrack } from '@/core/storage';
import { clamp } from '@/core/math';
import { bezier3, lerp3 } from '@/core/math3';
import { LEVELS, getLevel, unlockedUpTo } from '@/levels/levels';
import { WORLDS, worldOfLevel } from '@/levels/worlds';
import type { ElementId, LevelDef, WorldDef } from '@/levels/types';
import { goalLabel, ELEMENT_NAMES } from '@/levels/goalLabels';
import { evaluate, type Evaluation } from '@/levels/evaluator';
import { Terrain } from '@/physics/terrain';
import { TrainSim, simOptionsForLevel, type FailReason } from '@/physics/trainSim';
import { PassengerSim, initPhysics } from '@/physics/passengers';
import {
  clonePath, closestSample, createNode, emptyPath, isAutoNode, isClosed, nodeIn, nodeOut, sampleTrack, segmentPoints, trackStats,
  type ElementKind, type StartType, type TrackNode, type TrackPath, type TrackSamples, type TrackStats,
} from '@/track/model';
import { strokeToTrack, closePath, closeTrack, extendTrack, interpretStroke, type StrokeMode } from '@/track/strokeToTrack';
import { applyOverdraw, nearestOnTrack } from '@/track/overdraw';
import { laneRise, laneScale, toStage, toWorld, type StagePoint, LANE_MIN, LANE_MAX, LANE_DEPTH, LANE_RISE } from '@/track/stage';
import { WorldView } from '@/render/worldView';
import { Button, Toast, label, INK, PAPER, PINK, paintRect, goalIcon, check, star, iconBack, iconUndo, iconRedo, iconPlay, iconStop, iconShelf, iconSave, iconTrash } from '@/ui/widgets';
import { hexNum, shade } from '@/render/paint';
import { StartScene } from './start';
import { MyTracksScene } from './myTracks';
import { captureLevel, type LevelLayers } from '../mapTransition';

export interface SandboxConfig {
  world: number;
  width: number;
  saved?: SavedTrack;
}

type Mode = 'draw' | 'ride' | 'result';
type StrokeKind = 'new' | 'overdraw' | 'terrain' | 'extend';

interface DragState {
  kind: 'node' | 'handleIn' | 'handleOut' | 'depth' | 'roll' | 'shelf' | 'stroke' | 'none';
  node?: number;
  element?: ElementKind;
  ghost?: Graphics;
  startY?: number;
  startVal?: number;
}

const START_ORDER: StartType[] = ['chainlift', 'launch', 'hydro', 'swing', 'verticalLift'];
const START_UNLOCK: Record<StartType, ElementId> = { chainlift: 'chainlift', launch: 'launch', hydro: 'hydroLaunch', swing: 'swingLaunch', verticalLift: 'verticalLift' };
const SHELF_ELEMENTS: Array<{ kind: ElementKind; unlock: ElementId; color: string; length: number }> = [
  { kind: 'booster', unlock: 'booster', color: '#ff8a5c', length: 10 },
  { kind: 'brake', unlock: 'brake', color: '#d64545', length: 8 },
  { kind: 'splash', unlock: 'splash', color: '#3ec7c2', length: 8 },
  { kind: 'launchBlock', unlock: 'doubleLaunch', color: '#ffd23f', length: 14 },
];
const HIT_R = 26;

export class LevelScene implements Scene {
  readonly container = new Container();
  readonly handlers: InputHandlers = {};
  private game!: Game;
  private level: LevelDef;
  private world: WorldDef;
  private terrain: Terrain;
  private view!: WorldView;
  private skin: string;
  private unlocked: Set<ElementId>;
  private sandbox: SandboxConfig | null;
  private path: TrackPath | null = null;
  private samples: TrackSamples | null = null;
  private stats: TrackStats | null = null;
  private history: TrackPath[] = [];
  private future: TrackPath[] = [];
  private selected = -1;
  private mode: Mode = 'draw';
  private stroke: StagePoint[] | null = null;
  private strokeKind: StrokeKind = 'new';
  private strokeModes: StrokeMode[] = [];
  private previewTimer = 0;
  private drag: DragState = { kind: 'none' };
  private sim: TrainSim | null = null;
  private passengers: PassengerSim | null = null;
  private rideTime = 0;
  private cameraPhase: 'overview' | 'follow' | 'finale' = 'overview';
  private timeScale = 1;
  private slowMo = 0;
  private resultShown = false;
  private finaleTimer = 0;
  private failName = '';
  private time = 0;
  private w = 800;
  private h = 600;
  private physicsAccum = 0;

  // UI
  private ui = new Container();
  private overlay = new Graphics();
  private ink = new Graphics();
  /** Markierung des offenen Endes (pulsiert) */
  private endMarker = new Graphics();
  private chipLayer = new Container();
  private gizmoLayer = new Container();
  private goalsBar = new Container();
  private hint = label('', 17, INK, false, { stroke: { color: '#ffffff', width: 4 }, wordWrap: true, wordWrapWidth: 360 });
  private levelTitle = label('', 16, '#ffffff', true, { stroke: { color: INK, width: 4 } });
  private speedText = label('', 18, '#ffffff', true, { stroke: { color: INK, width: 4 } });
  private rollText = label('', 14, INK, true, { stroke: { color: '#ffffff', width: 3 } });
  private backBtn = new Button('', { width: 48, round: true, color: '#9b6dff', icon: iconBack });
  private undoBtn = new Button('', { width: 48, round: true, color: '#4f8dff', icon: iconUndo });
  private redoBtn = new Button('', { width: 48, round: true, color: '#4f8dff', icon: iconRedo });
  private clearBtn = new Button('', { width: 48, round: true, color: '#d64545', icon: iconTrash });
  private playBtn = new Button('', { width: 78, round: true, color: PINK, icon: iconPlay });
  private shelfBtn = new Button('', { width: 54, round: true, color: '#ffd23f', icon: iconShelf });
  /** Zeitraffer der Fahrt (1×, 2×, 3×), sitzt während der Fahrt an der Stelle des Regal-Knopfs */
  private speedBtn = new Button(`${storage.settings.rideSpeed || 3}×`, { width: 54, round: true, color: '#4f8dff', size: 20 });
  private saveBtn = new Button('', { width: 48, round: true, color: '#7ee081', icon: iconSave });
  private shelf = new Container();
  private shelfOpen = false;
  private toast = new Toast();
  private resultPanel: Container | null = null;
  private uiButtons: Button[] = [];

  constructor(levelId: number, sandbox: SandboxConfig | null = null) {
    this.sandbox = sandbox;
    if (sandbox) {
      this.world = WORLDS[clamp(sandbox.world - 1, 0, 9)];
      this.level = {
        id: 0, world: this.world.id, name: t('sandbox'), hook: '', goals: [], width: sandbox.width,
        terrain: [{ kind: 'hill', x: sandbox.width * 0.3, width: 30, height: 5 }, { kind: 'mountain', x: sandbox.width * 0.62, width: 40, height: 22 }, { kind: 'lake', x: sandbox.width * 0.85, width: 30 }],
        cars: 3, passengers: 6,
      };
      this.unlocked = unlockedUpTo(storage.progress.highest);
    } else {
      this.level = getLevel(levelId);
      this.world = worldOfLevel(levelId);
      this.unlocked = unlockedUpTo(Math.max(storage.progress.highest, levelId - 1));
    }
    if (import.meta.env.VITE_UNLOCK_ALL === '1') this.unlocked = unlockedUpTo(150);
    this.terrain = new Terrain(this.level);
    this.skin = this.pickSkin();
  }

  private pickSkin(): string {
    if (this.unlocked.has(this.world.skin)) return this.world.skin;
    const order: ElementId[] = ['skinSpace', 'skinLava', 'skinGhost', 'skinIce', 'skinNeon', 'skinGold', 'skinSteel', 'skinMine', 'skinHybrid', 'skinWood'];
    return order.find((s) => this.unlocked.has(s)) ?? 'skinWood';
  }
  get allowTunnels(): boolean {
    return this.unlocked.has('tunnel');
  }
  /** Tiefen- und Roll-Handle ab der Kurven-Freischaltung */
  /** Tiefen-Handle (Spur nachträglich ändern): sobald Handles freigeschaltet sind */
  get gizmo3D(): boolean {
    return this.unlocked.has('handles');
  }
  /** Roll-Handle (Schraube/Heartline-Roll): eigene Freischaltung */
  get gizmoRoll(): boolean {
    return this.unlocked.has('roll');
  }

  async enter(game: Game): Promise<void> {
    this.game = game;
    await initPhysics();
    const night = this.world.id === 6 || this.world.id === 8 || this.world.id === 10 || (this.unlocked.has('nightMode') && this.level.id === 25);
    this.view = new WorldView(this.world, this.terrain, this.skin, night);
    this.view.overlay.addChild(this.ink, this.overlay, this.endMarker);
    this.container.addChild(this.view.root, this.ui);
    this.ui.addChild(this.chipLayer, this.gizmoLayer, this.goalsBar, this.levelTitle, this.hint, this.speedText, this.rollText, this.shelf, this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.toast);
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn];
    this.speedBtn.visible = false;
    this.saveBtn.visible = !!this.sandbox;
    this.backBtn.onTap = () => this.leave();
    this.undoBtn.onTap = () => this.undo();
    this.redoBtn.onTap = () => this.redo();
    this.clearBtn.onTap = () => this.clearTrack();
    this.playBtn.onTap = () => (this.mode === 'draw' ? this.startRide() : this.stopRide());
    this.shelfBtn.onTap = () => this.toggleShelf();
    this.speedBtn.onTap = () => this.cycleRideSpeed();
    this.saveBtn.onTap = () => this.saveSandbox();
    this.levelTitle.text = this.sandbox ? `${t('sandbox')} · ${this.world.name}` : `${t('level', { n: this.level.id })} · ${this.level.name}`;
    this.view.trackR.setCoins(this.level.coins ?? []);
    this.buildShelf();
    this.setupInput();
    const draft = this.sandbox?.saved?.path ?? (this.sandbox ? undefined : storage.draft(this.level.id));
    if (draft && draft.nodes.length >= 2 && 'inZ' in draft.nodes[0]) this.setPath(clonePath(draft), false);
    this.resize(game.width, game.height);
    this.fitCamera(true);
    this.updateGoals();
    this.updateHint();
    this.updateUndoButtons();
  }

  exit(): void {
    this.stopRide();
    if (this.path && !this.sandbox) storage.saveDraft(this.level.id, this.path);
    this.view.destroy();
  }

  private leave(): void {
    if (this.sandbox) {
      this.game.goto(() => new MyTracksScene());
      return;
    }
    // Zurück zur Karte: Die Bühne krümmt sich wieder zur Drehscheibe (die Karte biegt das Foto der Ebenen)
    const snap = captureLevel(this.game, this.level.id, this.transitionLayers());
    this.game.goto(() => new StartScene(snap), true);
  }

  /** Ebenen und Kamera für den Übergang von der Karte und zu ihr */
  transitionLayers(): LevelLayers {
    return { sky: this.view.sky.container, world: this.view.world, ui: this.ui, camera: this.view.camera };
  }

  // ------------------------------------------------------------------ Eingabe
  private isOverUI(p: Pt): boolean {
    if (this.resultPanel) return true;
    for (const b of this.uiButtons) {
      if (!b.visible) continue;
      const r = b.getBounds();
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return true;
    }
    if (this.shelfOpen) {
      const r = this.shelf.getBounds();
      if (p.x >= r.x - 10 && p.x <= r.x + r.width + 10 && p.y >= r.y - 10 && p.y <= r.y + r.height + 10) return true;
    }
    return false;
  }

  private setupInput(): void {
    const H = this.handlers;
    H.dragStart = (p) => {
      if (this.mode !== 'draw') return;
      if (this.shelfOpen) {
        const item = this.shelfItemAt(p);
        if (item) {
          this.drag = { kind: 'shelf', element: item.kind, ghost: this.makeGhost(item.color) };
          this.ui.addChild(this.drag.ghost!);
          this.drag.ghost!.position.set(p.x, p.y);
          return;
        }
      }
      if (this.isOverUI(p)) return;
      const st = this.view.camera.toStage(p.x, p.y);
      if (this.path && this.selected >= 0) {
        const hit = this.hitGizmo(p);
        if (hit) {
          this.pushHistory();
          const n = this.path.nodes[this.selected];
          this.drag = { kind: hit, node: this.selected, startY: st.Y, startVal: hit === 'depth' ? n.z : Number.isNaN(n.roll) ? 0 : n.roll };
          return;
        }
      }
      const nodeIdx = this.path ? this.hitNode(p) : -1;
      if (nodeIdx >= 0 && this.unlocked.has('handles')) {
        this.pushHistory();
        this.selected = nodeIdx;
        this.drag = { kind: 'node', node: nodeIdx };
        this.drawOverlay();
        return;
      }
      this.stroke = [{ X: st.X, Y: st.Y }];
      this.strokeModes = [];
      this.drag = { kind: 'stroke' };
      if (!this.path) this.strokeKind = 'new';
      else {
        const near = this.samples ? nearestOnTrack(this.samples, st) : null;
        const nearPx = near ? near.d * this.view.camera.zoom : Infinity;
        const endNode = this.path.nodes[this.path.nodes.length - 1];
        const endS = toStage(endNode.x, endNode.y, endNode.z);
        const endPx = Math.hypot(endS.X - st.X, endS.Y - st.Y) * this.view.camera.zoom;
        if (!isClosed(this.path) && endPx < 40) {
          this.strokeKind = 'extend';
          this.toast.show(t('extendHint'), 1.2);
        } else if (near && nearPx < 30) this.strokeKind = 'overdraw';
        else if (this.onStage(st) && this.unlocked.has('mountain') && this.terrainEditable() && !this.nearStation(st)) this.strokeKind = 'terrain';
        else {
          this.strokeKind = 'new';
          this.toast.show(t('newStrokeHint'), 2.2);
        }
      }
      this.selected = -1;
      this.drawOverlay();
    };
    H.dragMove = (p) => {
      if (this.mode !== 'draw') return;
      const st = this.view.camera.toStage(p.x, p.y);
      switch (this.drag.kind) {
        case 'stroke':
          if (this.stroke) {
            this.stroke.push({ X: st.X, Y: st.Y });
            this.drawInk();
          }
          break;
        case 'node': this.moveNode(this.drag.node!, st); break;
        case 'handleIn': this.moveHandle(this.drag.node!, st, true); break;
        case 'handleOut': this.moveHandle(this.drag.node!, st, false); break;
        case 'depth': this.dragDepth(this.drag.node!, st.Y - (this.drag.startY ?? st.Y), this.drag.startVal ?? 0); break;
        case 'roll': this.dragRoll(this.drag.node!, st.Y - (this.drag.startY ?? st.Y), this.drag.startVal ?? 0); break;
        case 'shelf': this.drag.ghost?.position.set(p.x, p.y); break;
        default: break;
      }
    };
    H.dragEnd = (p) => {
      if (this.mode !== 'draw') return;
      const st = this.view.camera.toStage(p.x, p.y);
      switch (this.drag.kind) {
        case 'stroke': this.finishStroke(); break;
        case 'node': case 'handleIn': case 'handleOut': case 'depth': case 'roll': this.afterEdit(); break;
        case 'shelf': {
          this.drag.ghost?.destroy();
          if (this.path && this.samples && this.drag.element) this.placeElement(this.drag.element, st);
          break;
        }
        default: break;
      }
      this.drag = { kind: 'none' };
    };
    H.tap = (p) => {
      if (this.isOverUI(p)) return;
      if (this.mode === 'ride') {
        this.stopRide();
        return;
      }
      if (this.mode !== 'draw') return;
      const chip = this.hitChip(p);
      if (chip) {
        chip.action();
        return;
      }
      if (this.shelfOpen) {
        this.toggleShelf();
        return;
      }
      const st = this.view.camera.toStage(p.x, p.y);
      if (this.path && this.samples) {
        const el = this.hitElement(st);
        if (el >= 0) {
          this.pushHistory();
          this.path.elements.splice(el, 1);
          this.afterEdit();
          return;
        }
        const n = this.hitNode(p);
        if (n >= 0 && this.unlocked.has('handles')) {
          this.selected = n;
          this.drawOverlay();
          return;
        }
      }
      this.selected = -1;
      this.drawOverlay();
    };
    H.doubleTap = (p) => {
      if (this.mode !== 'draw' || this.isOverUI(p)) return;
      const st = this.view.camera.toStage(p.x, p.y);
      if (this.path && this.samples && this.unlocked.has('handles')) {
        if (this.selected >= 0 && this.hitGizmo(p) === 'roll') {
          this.pushHistory();
          this.path.nodes[this.selected].roll = NaN;
          this.afterEdit();
          return;
        }
        const n = this.hitNode(p);
        if (n >= 0) {
          this.deleteNode(n);
          return;
        }
        const near = nearestOnTrack(this.samples, st);
        if (near.d * this.view.camera.zoom < 30) {
          this.insertNode(near.s);
          return;
        }
      }
      this.fitCamera(false);
    };
    H.panStart = () => {
      this.view.camera.direct = true;
    };
    H.pan = (_c, d) => {
      if (this.mode === 'ride') return;
      this.view.camera.panBy(d.x, d.y);
    };
    H.pinch = (c, s) => {
      if (this.mode === 'ride') return;
      this.view.camera.zoomAt(c.x, c.y, s);
    };
    H.panEnd = () => {
      this.view.camera.direct = false;
    };
    H.wheel = (p, d) => {
      if (this.mode === 'ride') return;
      this.view.camera.zoomAt(p.x, p.y, d > 0 ? 0.9 : 1.1);
    };
    H.twoFingerTap = () => this.undo();
    H.threeFingerTap = () => this.redo();
    H.key = (k) => {
      if (k === ' ') this.mode === 'draw' ? this.startRide() : this.stopRide();
      if (k === 'Escape') this.mode === 'draw' ? this.leave() : this.stopRide();
      if ((k === 'Delete' || k === 'Backspace') && this.selected >= 0) this.deleteNode(this.selected);
    };
  }

  // ------------------------------------------------------------------ Treffer-Tests
  private nodeScreen(n: TrackNode): Pt {
    const s = toStage(n.x, n.y, n.z);
    return this.view.toScreen(s.X, s.Y);
  }
  private hitNode(p: Pt): number {
    if (!this.path) return -1;
    let best = -1;
    let bestD = HIT_R;
    this.path.nodes.forEach((n, i) => {
      if (isAutoNode(n)) return;
      const sp = this.nodeScreen(n);
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
  /** Positionen der Gizmo-Teile des ausgewählten Knotens (Bildschirm) */
  private gizmoPositions(): { in: Pt; out: Pt; depth: Pt; roll: Pt } | null {
    if (!this.path || this.selected < 0 || this.selected >= this.path.nodes.length) return null;
    const n = this.path.nodes[this.selected];
    const a = nodeIn(n);
    const b = nodeOut(n);
    const sa = toStage(a.x, a.y, a.z / LANE_DEPTH);
    const sb = toStage(b.x, b.y, b.z / LANE_DEPTH);
    const c = this.nodeScreen(n);
    return { in: this.view.toScreen(sa.X, sa.Y), out: this.view.toScreen(sb.X, sb.Y), depth: { x: c.x, y: c.y + 44 }, roll: { x: c.x + 44, y: c.y } };
  }
  private hitGizmo(p: Pt): 'handleIn' | 'handleOut' | 'depth' | 'roll' | null {
    const g = this.gizmoPositions();
    if (!g) return null;
    const d = (q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
    if (d(g.in) < HIT_R) return 'handleIn';
    if (d(g.out) < HIT_R) return 'handleOut';
    if (this.gizmo3D && d(g.depth) < HIT_R) return 'depth';
    if (this.gizmoRoll && d(g.roll) < HIT_R) return 'roll';
    return null;
  }
  private onStage(st: StagePoint): boolean {
    const z = clamp(st.Y / LANE_RISE, LANE_MIN - 0.5, LANE_MAX + 0.5);
    return z >= LANE_MIN - 0.4 && z <= LANE_MAX + 0.4 && Math.abs(st.Y - laneRise(clamp(Math.round(z), LANE_MIN, LANE_MAX))) < LANE_RISE;
  }
  private nearStation(st: StagePoint): boolean {
    if (!this.path) return false;
    const n = this.path.nodes[0];
    const s = toStage(n.x, n.y, n.z);
    return Math.hypot(s.X - st.X, s.Y - st.Y) < 6;
  }
  private terrainEditable(): boolean {
    return !!this.sandbox || this.level.id >= 36;
  }
  private hitElement(st: StagePoint): number {
    if (!this.path || !this.samples) return -1;
    const L = this.samples.length;
    for (let i = 0; i < this.path.elements.length; i++) {
      const e = this.path.elements[i];
      const mid = ((e.s + e.length / 2) % L + L) % L;
      const idx = Math.min(this.samples.count - 1, Math.round(mid / this.samples.step));
      const s = toStage(this.samples.x[idx], this.samples.y[idx], this.samples.z[idx]);
      if (Math.hypot(s.X - st.X, s.Y - st.Y) < 2.5) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------------ Strich → Bahn
  private strokeOptions() {
    const ground = (x: number, z: number) => (this.allowTunnels ? this.terrain.groundHeight(x, z) : this.terrain.surfaceHeight(x, z));
    return {
      groundHeight: ground,
      groundClearance: 0.8,
      maxHeight: this.level.maxHeight ?? 0,
      allowTurns: this.unlocked.has('turn'),
      allowLoops: this.unlocked.has('loop'),
    };
  }

  private drawInk(): void {
    const g = this.ink;
    g.clear();
    if (!this.stroke || this.stroke.length < 2) return;
    if (this.strokeKind === 'terrain') {
      g.poly(this.stroke.flatMap((p) => [p.X, p.Y]), false).stroke({ width: 0.6, color: 0xc9a36b, alpha: 0.95, cap: 'round', join: 'round' });
      return;
    }
    // Tinte je Modus färben: Boden (Tiefe) grün, Höhe pink
    const modes = this.strokeModes;
    const n = this.stroke.length;
    let runStart = 0;
    const colorFor = (m: StrokeMode | undefined) => (m === 'height' ? 0xff5c8a : 0x7ee081);
    for (let i = 1; i <= n; i++) {
      const mi = modes[Math.min(modes.length - 1, Math.floor((i / n) * Math.max(1, modes.length)))];
      const mPrev = modes[Math.min(modes.length - 1, Math.floor(((i - 1) / n) * Math.max(1, modes.length)))];
      if (i === n || mi !== mPrev) {
        const seg = this.stroke.slice(runStart, Math.min(n, i + 1)).flatMap((p) => [p.X, p.Y]);
        if (seg.length >= 4) {
          g.poly(seg, false).stroke({ width: 0.9, color: 0xffffff, alpha: 0.5, cap: 'round', join: 'round' });
          g.poly(seg, false).stroke({ width: 0.45, color: this.strokeKind === 'overdraw' ? 0xffd23f : colorFor(mPrev), alpha: 0.95, cap: 'round', join: 'round' });
        }
        runStart = i;
      }
    }
  }

  private previewStroke(): void {
    if (!this.stroke || this.stroke.length < 4) return;
    if (this.strokeKind === 'terrain') return;
    if (this.strokeKind === 'overdraw' && this.path && this.samples) {
      const merged = applyOverdraw(this.path, this.stroke, { ...this.strokeOptions(), snapDistance: 30 / this.view.camera.zoom });
      if (merged) this.view.setTrack(merged, sampleTrack(merged, 0.5), this.skin, this.terrain, this.allowTunnels, true);
      return;
    }
    if (this.strokeKind === 'extend' && this.path) {
      const ext = extendTrack(this.path, this.stroke, this.strokeOptions());
      if (ext) {
        this.strokeModes = [];
        this.drawInk();
        this.view.setTrack(ext, sampleTrack(ext, 0.5), this.skin, this.terrain, this.allowTunnels, true);
      }
      return;
    }
    const r = strokeToTrack(this.stroke, this.strokeOptions());
    this.strokeModes = r.points.map((p) => p.mode);
    this.drawInk();
    if (r.path.nodes.length >= 2) this.view.setTrack(r.path, sampleTrack(r.path, 0.5), this.skin, this.terrain, this.allowTunnels, true);
  }

  private finishStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    this.strokeModes = [];
    this.ink.clear();
    if (!stroke || stroke.length < 3) {
      this.redrawTrack();
      return;
    }
    if (this.strokeKind === 'terrain') {
      this.sculptTerrain(stroke);
      return;
    }
    if (this.strokeKind === 'overdraw' && this.path && this.samples) {
      const merged = applyOverdraw(this.path, stroke, { ...this.strokeOptions(), snapDistance: 30 / this.view.camera.zoom });
      if (merged) {
        this.pushHistory();
        this.setPath(merged, true);
        return;
      }
      this.toast.show(t('overdrawHint'), 2.5);
      this.redrawTrack();
      return;
    }
    if (this.strokeKind === 'extend' && this.path) {
      const ext = extendTrack(this.path, stroke, this.strokeOptions());
      if (ext) {
        this.pushHistory();
        this.setPath(ext, true);
        return;
      }
      this.redrawTrack();
      return;
    }
    const len = stroke.reduce((acc, p, i) => (i ? acc + Math.hypot(p.X - stroke[i - 1].X, p.Y - stroke[i - 1].Y) : 0), 0);
    if (len < 6) {
      this.redrawTrack();
      return;
    }
    const r = strokeToTrack(stroke, this.strokeOptions());
    if (r.path.nodes.length < 2) {
      this.redrawTrack();
      return;
    }
    this.pushHistory();
    r.path.startType = this.path?.startType ?? 'chainlift';
    this.setPath(r.path, true);
  }

  private sculptTerrain(stroke: StagePoint[]): void {
    const z = clamp(Math.round(stroke[0].Y / LANE_RISE), LANE_MIN, LANE_MAX);
    let maxH = 0;
    let minH = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of stroke) {
      const w = toWorld(p.X, p.Y, z);
      const h = w.y - this.terrain.groundHeight(w.x, z);
      maxH = Math.max(maxH, h);
      minH = Math.min(minH, h);
      x0 = Math.min(x0, w.x);
      x1 = Math.max(x1, w.x);
    }
    const width = Math.max(8, x1 - x0);
    if (maxH > 2) {
      this.terrain.mountains.push({ x: (x0 + x1) / 2, width, height: Math.min(60, maxH), lane: z });
      if (this.path) this.path.templates.mountain = (this.path.templates.mountain ?? 0) + 1;
    } else if (minH < -1.5 && this.unlocked.has('lake')) {
      this.terrain.water.push({ x: (x0 + x1) / 2, width, lane: z, kind: 'lake' });
    } else {
      this.redrawTrack();
      return;
    }
    this.view.terrainR.redraw();
    this.afterEdit();
  }

  // ------------------------------------------------------------------ Bahn-Zustand
  private setPath(path: TrackPath | null, animate: boolean): void {
    this.path = path;
    this.selected = -1;
    this.redrawTrack();
    this.updateUndoButtons();
    if (!path) {
      this.view.terrainR.setTunnelPortals([]);
      this.updateGoals();
      this.updateHint();
      if (!this.sandbox) storage.saveDraft(this.level.id, emptyPath());
      return;
    }
    if (animate && this.samples) {
      const n = path.nodes[0];
      const s = toStage(n.x, n.y, n.z);
      for (let i = 0; i < 6; i++) this.view.effects.glitter(s.X, s.Y + 1);
    }
    this.updateGoals();
    this.updateHint();
    if (!this.sandbox) storage.saveDraft(this.level.id, path);
  }

  private redrawTrack(): void {
    if (!this.path || this.path.nodes.length < 2) {
      this.samples = null;
      this.stats = null;
      this.view.trackR.clear();
      this.drawOverlay();
      return;
    }
    this.samples = sampleTrack(this.path, 0.25);
    this.stats = trackStats(this.path, this.samples);
    this.view.setTrack(this.path, this.samples, this.skin, this.terrain, this.allowTunnels, false);
    this.drawOverlay();
  }

  private afterEdit(): void {
    if (!this.path) return;
    closePath(this.path);
    this.redrawTrack();
    this.updateGoals();
    if (!this.sandbox) storage.saveDraft(this.level.id, this.path);
  }

  private clearTrack(): void {
    if (this.mode !== 'draw' || !this.path) return;
    this.pushHistory();
    this.setPath(null, false);
    this.toast.show(t('clear'), 1.2);
  }

  private pushHistory(): void {
    this.history.push(this.path ? clonePath(this.path) : emptyPath());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    this.updateUndoButtons();
  }
  private undo(): void {
    if (this.mode !== 'draw') return;
    const prev = this.history.pop();
    if (!prev) return;
    this.future.push(this.path ? clonePath(this.path) : emptyPath());
    this.setPath(prev.nodes.length >= 2 ? prev : null, false);
    this.updateUndoButtons();
  }
  private redo(): void {
    if (this.mode !== 'draw') return;
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.path ? clonePath(this.path) : emptyPath());
    this.setPath(next.nodes.length >= 2 ? next : null, false);
    this.updateUndoButtons();
  }
  private updateUndoButtons(): void {
    this.undoBtn.setEnabled(this.history.length > 0);
    this.redoBtn.setEnabled(this.future.length > 0);
    this.clearBtn.setEnabled(!!this.path);
  }

  // ------------------------------------------------------------------ Knoten-Editing (3D)
  private groundAt(x: number, z: number): number {
    return this.allowTunnels ? this.terrain.groundHeight(x, z) : this.terrain.surfaceHeight(x, z);
  }
  private moveNode(i: number, st: StagePoint): void {
    if (!this.path) return;
    const n = this.path.nodes[i];
    const w = toWorld(st.X, st.Y, n.z);
    n.x = w.x;
    n.y = Math.max(this.groundAt(w.x, n.z) + 0.6, w.y);
    if (this.level.maxHeight) n.y = Math.min(n.y, this.level.maxHeight);
    this.redrawTrack();
  }
  private moveHandle(i: number, st: StagePoint, isIn: boolean): void {
    if (!this.path) return;
    const n = this.path.nodes[i];
    const hz = isIn ? n.inZ : n.outZ;
    const w = toWorld(st.X, st.Y, n.z + hz);
    const dx = w.x - n.x;
    const dy = w.y - n.y;
    const dz = hz * LANE_DEPTH;
    const len = Math.hypot(dx, dy, dz) || 0.01;
    if (isIn) {
      n.inX = dx; n.inY = dy;
      const ol = Math.hypot(n.outX, n.outY, n.outZ * LANE_DEPTH) || len;
      n.outX = (-dx / len) * ol; n.outY = (-dy / len) * ol; n.outZ = ((-dz / len) * ol) / LANE_DEPTH;
    } else {
      n.outX = dx; n.outY = dy;
      const il = Math.hypot(n.inX, n.inY, n.inZ * LANE_DEPTH) || len;
      n.inX = (-dx / len) * il; n.inY = (-dy / len) * il; n.inZ = ((-dz / len) * il) / LANE_DEPTH;
    }
    this.redrawTrack();
  }
  /** Tiefen-Handle: vertikal ziehen verschiebt den Knoten in der Tiefe (eine Spur = LANE_RISE Bühnen-Meter) */
  private dragDepth(i: number, dY: number, startZ: number): void {
    if (!this.path) return;
    const n = this.path.nodes[i];
    n.z = clamp(startZ + dY / LANE_RISE, LANE_MIN, LANE_MAX);
    n.y = Math.max(this.groundAt(n.x, n.z) + 0.6, n.y);
    this.redrawTrack();
    this.rollText.text = `${t('lane.back')}: ${n.z.toFixed(1)}`;
  }
  /** Roll-Handle: vertikal ziehen stellt die Schräglage ein (manuell); Doppeltipp = automatisch */
  private dragRoll(i: number, dY: number, startRoll: number): void {
    if (!this.path) return;
    const n = this.path.nodes[i];
    n.roll = clamp(startRoll + dY * 0.25, -Math.PI, Math.PI);
    this.redrawTrack();
    this.rollText.text = `${Math.round((n.roll * 180) / Math.PI)}°`;
  }
  private deleteNode(i: number): void {
    if (!this.path) return;
    const real = this.path.nodes.filter((n) => !isAutoNode(n)).length;
    if (real <= 3) return;
    const n = this.path.nodes[i];
    if (n.kind === 'station') return;
    this.pushHistory();
    this.path.nodes.splice(i, 1);
    this.selected = -1;
    this.afterEdit();
  }
  /** Knoten bei Bogenlänge s einfügen (de Casteljau in 3D) */
  private insertNode(s: number): void {
    if (!this.path || !this.samples) return;
    const idx = Math.min(this.samples.count - 1, Math.round(s / this.samples.step));
    const seg = this.samples.seg[idx];
    const tt = clamp(this.samples.t[idx], 0.05, 0.95);
    const nodes = this.path.nodes;
    const a = nodes[seg];
    const b = nodes[(seg + 1) % nodes.length];
    if (isAutoNode(a) || isAutoNode(b)) return;
    const [p0, p1, p2, p3] = segmentPoints(this.path, seg);
    const p01 = lerp3(p0, p1, tt);
    const p12 = lerp3(p1, p2, tt);
    const p23 = lerp3(p2, p3, tt);
    const p012 = lerp3(p01, p12, tt);
    const p123 = lerp3(p12, p23, tt);
    const mid = bezier3(p0, p1, p2, p3, tt);
    this.pushHistory();
    const nn: TrackNode = createNode(mid.x, mid.y, mid.z / LANE_DEPTH);
    nn.inX = p012.x - mid.x; nn.inY = p012.y - mid.y; nn.inZ = (p012.z - mid.z) / LANE_DEPTH;
    nn.outX = p123.x - mid.x; nn.outY = p123.y - mid.y; nn.outZ = (p123.z - mid.z) / LANE_DEPTH;
    a.outX = p01.x - p0.x; a.outY = p01.y - p0.y; a.outZ = (p01.z - p0.z) / LANE_DEPTH;
    b.inX = p23.x - p3.x; b.inY = p23.y - p3.y; b.inZ = (p23.z - p3.z) / LANE_DEPTH;
    nodes.splice(seg + 1, 0, nn);
    this.selected = seg + 1;
    this.redrawTrack();
    this.updateGoals();
  }
  /** Kurvenrichtung umschalten: Tiefe der folgenden Knoten spiegeln */
  private toggleTurn(i: number): void {
    if (!this.path) return;
    const nodes = this.path.nodes;
    const zPrev = nodes[Math.max(0, i - 1)].z;
    const mirrored = nodes.map((n, k) => (k >= i && !isAutoNode(n) ? 2 * zPrev - n.z : n.z));
    if (mirrored.some((z) => z < LANE_MIN - 0.01 || z > LANE_MAX + 0.01)) {
      this.toast.show('Keine Spur mehr in dieser Richtung', 1.5);
      return;
    }
    this.pushHistory();
    nodes.forEach((n, k) => {
      if (k >= i && !isAutoNode(n)) {
        n.z = mirrored[k];
        n.inZ = -n.inZ;
        n.outZ = -n.outZ;
      }
    });
    this.afterEdit();
  }
  private cycleStart(): void {
    if (!this.path) return;
    const available = START_ORDER.filter((s) => this.unlocked.has(START_UNLOCK[s]));
    const idx = available.indexOf(this.path.startType);
    this.pushHistory();
    this.path.startType = available[(idx + 1) % available.length];
    this.redrawTrack();
    this.updateGoals();
    this.toast.show(`${t('startType')}: ${t('start.' + this.path.startType)}`, 1.5);
  }
  private placeElement(kind: ElementKind, st: StagePoint): void {
    if (!this.path || !this.samples) return;
    const near = nearestOnTrack(this.samples, st);
    if (near.d > 4) return;
    const def = SHELF_ELEMENTS.find((e) => e.kind === kind)!;
    this.pushHistory();
    this.path.elements.push({ kind, s: near.s - def.length / 2, length: def.length });
    this.afterEdit();
  }

  // ------------------------------------------------------------------ Overlay (Knoten, Handles, Gizmo)
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    this.endMarker.clear();
    this.gizmoLayer.removeChildren();
    this.rollText.text = '';
    if (!this.path || this.mode !== 'draw') return;
    const nodes = this.path.nodes;
    if (!isClosed(this.path) && nodes.length >= 2) {
      const e = nodes[nodes.length - 1];
      const se = toStage(e.x, e.y, e.z);
      const ke = laneScale(e.z);
      const zs = 1 / Math.max(0.35, this.view.camera.zoom / 12);
      this.endMarker.circle(se.X, se.Y, 1.1 * ke * zs).fill({ color: 0xffd23f, alpha: 0.25 }).stroke({ width: 0.18 * ke * zs, color: 0xffd23f });
      this.endMarker.circle(se.X, se.Y, 0.45 * ke * zs).fill(0xffd23f).stroke({ width: 0.12 * ke, color: hexNum(INK) });
    }
    if (!this.unlocked.has('handles')) return;
    const zoomScale = 1 / Math.max(0.35, this.view.camera.zoom / 12);
    nodes.forEach((n, i) => {
      if (isAutoNode(n)) return;
      const s = toStage(n.x, n.y, n.z);
      const k = laneScale(n.z);
      const r = (i === this.selected ? 0.55 : 0.38) * k * zoomScale;
      const col = n.kind === 'turn' ? 0x3ec7c2 : n.kind === 'loopApex' ? 0x9b6dff : 0xffffff;
      g.circle(s.X, s.Y, r).fill(i === this.selected ? 0xffd23f : col).stroke({ width: 0.12 * k, color: hexNum(INK) });
      // Tiefen-Linie zum Boden (zeigt die Spur)
      if (i === this.selected) {
        const gnd = toStage(n.x, this.terrain.groundHeight(n.x, n.z), n.z);
        g.moveTo(s.X, s.Y).lineTo(gnd.X, gnd.Y).stroke({ width: 0.08 * k, color: hexNum(INK), alpha: 0.5 });
        g.ellipse(gnd.X, gnd.Y, 0.9 * k, 0.3 * k).stroke({ width: 0.1 * k, color: hexNum(INK), alpha: 0.6 });
      }
    });
    if (this.selected >= 0 && this.selected < nodes.length) {
      const n = nodes[this.selected];
      const k = laneScale(n.z);
      const c = toStage(n.x, n.y, n.z);
      const a = nodeIn(n);
      const b = nodeOut(n);
      const sa = toStage(a.x, a.y, a.z / LANE_DEPTH);
      const sb = toStage(b.x, b.y, b.z / LANE_DEPTH);
      const rr = 0.5 * k * zoomScale;
      g.moveTo(sa.X, sa.Y).lineTo(c.X, c.Y).lineTo(sb.X, sb.Y).stroke({ width: 0.12 * k, color: hexNum(INK), alpha: 0.8 });
      g.circle(sa.X, sa.Y, rr).fill(0x3ec7c2).stroke({ width: 0.12 * k, color: hexNum(INK) });
      g.circle(sb.X, sb.Y, rr).fill(0x3ec7c2).stroke({ width: 0.12 * k, color: hexNum(INK) });
      // Gizmo in Bildschirm-Pixeln: Tiefen-Handle (Quadrat unten) und Roll-Handle (Ring rechts)
      if (this.gizmo3D) {
        const gp = this.gizmoPositions()!;
        const gz = new Graphics();
        gz.roundRect(gp.depth.x - 13, gp.depth.y - 13, 26, 26, 6).fill(0x9b6dff).stroke({ width: 3, color: hexNum(INK) });
        gz.moveTo(gp.depth.x, gp.depth.y - 8).lineTo(gp.depth.x, gp.depth.y + 8).moveTo(gp.depth.x - 5, gp.depth.y - 3).lineTo(gp.depth.x, gp.depth.y - 8).lineTo(gp.depth.x + 5, gp.depth.y - 3)
          .moveTo(gp.depth.x - 5, gp.depth.y + 3).lineTo(gp.depth.x, gp.depth.y + 8).lineTo(gp.depth.x + 5, gp.depth.y + 3).stroke({ width: 2.5, color: 0xffffff, cap: 'round', join: 'round' });
        const auto = Number.isNaN(n.roll);
        if (this.gizmoRoll) {
          gz.circle(gp.roll.x, gp.roll.y, 14).fill(auto ? hexNum(PAPER) : 0xff8a5c).stroke({ width: 3, color: hexNum(INK) });
          const ang = auto ? 0 : n.roll;
          gz.moveTo(gp.roll.x - 9 * Math.cos(ang), gp.roll.y - 9 * Math.sin(ang)).lineTo(gp.roll.x + 9 * Math.cos(ang), gp.roll.y + 9 * Math.sin(ang)).stroke({ width: 3, color: hexNum(INK), cap: 'round' });
          gz.circle(gp.roll.x, gp.roll.y, 2.5).fill(hexNum(INK));
          if (!auto) this.rollText.text = `${Math.round((n.roll * 180) / Math.PI)}°`;
          this.rollText.position.set(gp.roll.x + 36, gp.roll.y);
        }
        this.gizmoLayer.addChild(gz);
      }
    }
  }

  private chips(): Array<{ x: number; y: number; r: number; action: () => void; draw: (g: Graphics) => void }> {
    const out: Array<{ x: number; y: number; r: number; action: () => void; draw: (g: Graphics) => void }> = [];
    if (!this.path || this.mode !== 'draw') return out;
    const nodes = this.path.nodes;
    const sp = this.nodeScreen(nodes[0]);
    const type = this.path.startType;
    out.push({
      x: sp.x, y: sp.y - 46, r: 22, action: () => this.cycleStart(),
      draw: (g) => {
        g.circle(0, 0, 20).fill(hexNum(PAPER)).stroke({ width: 3, color: hexNum(INK) });
        const ink = hexNum(INK);
        if (type === 'chainlift') for (let i = 0; i < 4; i++) g.circle(-9 + i * 6, 6 - i * 4, 2.6).fill(ink);
        else if (type === 'launch' || type === 'hydro') g.poly([-3, -11, 6, -1, 1, -1, 3, 11, -6, 1, -1, 1]).fill(type === 'hydro' ? 0x3ec7c2 : 0xffb13b).stroke({ width: 1.5, color: ink });
        else if (type === 'swing') { g.moveTo(0, -10).lineTo(-6, 6).stroke({ width: 2.5, color: ink }); g.circle(-6, 7, 3.5).fill(0xffd23f).stroke({ width: 1.5, color: ink }); }
        else { g.moveTo(0, 9).lineTo(0, -9).stroke({ width: 3, color: ink, cap: 'round' }); g.moveTo(-6, -3).lineTo(0, -9).lineTo(6, -3).stroke({ width: 3, color: ink, cap: 'round', join: 'round' }); }
      },
    });
    if (this.unlocked.has('turn')) {
      nodes.forEach((n, i) => {
        if (n.kind !== 'turn') return;
        const p = this.nodeScreen(n);
        const next = nodes[Math.min(nodes.length - 1, i + 2)];
        const dir = next.z > nodes[Math.max(0, i - 2)].z ? 1 : -1;
        out.push({
          x: p.x, y: p.y - 40, r: 20, action: () => this.toggleTurn(i),
          draw: (g) => {
            g.circle(0, 0, 18).fill(hexNum(PAPER)).stroke({ width: 3, color: hexNum(INK) });
            const ink = hexNum(INK);
            if (dir > 0) g.moveTo(0, 8).lineTo(0, -8).moveTo(-6, -2).lineTo(0, -8).lineTo(6, -2).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
            else g.moveTo(0, -8).lineTo(0, 8).moveTo(-6, 2).lineTo(0, 8).lineTo(6, 2).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
          },
        });
      });
    }
    return out;
  }
  private hitChip(p: Pt): { action: () => void } | null {
    for (const c of this.chips()) if (Math.hypot(c.x - p.x, c.y - p.y) < c.r + 6) return c;
    return null;
  }
  private renderChips(): void {
    this.chipLayer.removeChildren();
    for (const c of this.chips()) {
      const g = new Graphics();
      c.draw(g);
      g.position.set(c.x, c.y);
      this.chipLayer.addChild(g);
    }
  }

  // ------------------------------------------------------------------ Regal
  private buildShelf(): void {
    this.shelf.removeChildren();
    const items = SHELF_ELEMENTS.filter((e) => this.unlocked.has(e.unlock));
    const w = Math.max(120, items.length * 74 + 20);
    const bg = new Graphics();
    paintRect(bg, -w, -40, w, 80, PAPER, INK, 18, 7, 0.96);
    this.shelf.addChild(bg);
    items.forEach((it, i) => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-26, -26, 52, 52, 12).fill(hexNum(it.color)).stroke({ width: 3, color: hexNum(INK) });
      g.circle(0, 0, 6).fill(0xffffff);
      c.addChild(g);
      const tx = label(t('element.' + it.kind), 11, INK);
      tx.position.set(0, 34);
      c.addChild(tx);
      c.position.set(-w + 46 + i * 74, -6);
      (c as Container & { kind?: ElementKind; color?: string }).kind = it.kind;
      (c as Container & { kind?: ElementKind; color?: string }).color = it.color;
      this.shelf.addChild(c);
    });
    if (!items.length) {
      const tx = label(t('comingSoon'), 14, INK);
      tx.position.set(-w / 2, 0);
      this.shelf.addChild(tx);
    }
    this.shelf.visible = false;
  }
  private toggleShelf(): void {
    this.shelfOpen = !this.shelfOpen;
    this.shelf.visible = this.shelfOpen;
  }
  private shelfItemAt(p: Pt): { kind: ElementKind; color: string } | null {
    for (const c of this.shelf.children) {
      const k = (c as Container & { kind?: ElementKind; color?: string }).kind;
      if (!k) continue;
      const b = c.getBounds();
      if (p.x >= b.x - 6 && p.x <= b.x + b.width + 6 && p.y >= b.y - 6 && p.y <= b.y + b.height + 6) return { kind: k, color: (c as Container & { color?: string }).color ?? PINK };
    }
    return null;
  }
  private makeGhost(color: string): Graphics {
    const g = new Graphics();
    g.roundRect(-22, -22, 44, 44, 10).fill({ color: hexNum(color), alpha: 0.85 }).stroke({ width: 3, color: hexNum(INK) });
    return g;
  }

  // ------------------------------------------------------------------ Ziele / Hinweise
  private updateGoals(): void {
    this.goalsBar.removeChildren();
    if (this.sandbox) {
      if (this.stats) {
        const txt = label(`${Math.round(this.stats.length)} m · ↑ ${this.stats.maxHeight.toFixed(0)} m · ${this.stats.loops} ◎ · ${this.stats.turns} ↻`, 16, '#ffffff', false, { stroke: { color: INK, width: 4 } });
        this.goalsBar.addChild(txt);
      }
      return;
    }
    const ts = this.stats ?? { length: 0, maxHeight: 0, loops: 0, turns: 0, lanes: 0, rolls: 0, maxDrop: 0 };
    const ride = this.sim?.stats ?? null;
    const finished = this.sim?.phase === 'done';
    const ev = this.path ? evaluate(this.level, this.path, ts, ride, finished, this.passengers?.allSeated ?? true) : null;
    const goals = this.level.goals;
    const portrait = this.h > this.w;
    const perRow = portrait ? 3 : 6;
    const cellW = portrait ? Math.min(126, (this.w - 24) / perRow) : 150;
    goals.forEach((goal, i) => {
      const r = ev?.goals[i];
      const c = new Container();
      const g = new Graphics();
      const bgW = cellW - 8;
      paintRect(g, -bgW / 2, -20, bgW, 40, goal.bonus ? '#fff1b8' : PAPER, INK, 12, i + 3, 0.93);
      c.addChild(g);
      const ic = new Graphics();
      goalIcon(ic, goal.type, 22);
      ic.position.set(-bgW / 2 + 20, 0);
      c.addChild(ic);
      const txt = label(goalLabel(goal), 13, INK, false, { wordWrap: true, wordWrapWidth: bgW - 60 });
      txt.anchor.set(0, 0.5);
      txt.position.set(-bgW / 2 + 36, 0);
      c.addChild(txt);
      const ck = new Graphics();
      check(ck, bgW / 2 - 14, 0, 9, !!r?.done);
      c.addChild(ck);
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = Math.min(perRow, goals.length - row * perRow);
      c.position.set((col - (rowCount - 1) / 2) * cellW, row * 46);
      this.goalsBar.addChild(c);
    });
  }

  private updateHint(): void {
    let msg = '';
    if (!this.path) msg = this.level.id === 1 ? t('tutorial.l1') : t('drawHint');
    else if (!isClosed(this.path)) msg = t('openHint');
    else if (this.level.id === 2 && this.history.length <= 1) msg = t('tutorial.l2');
    else if (this.level.id === 5 && (this.stats?.turns ?? 0) === 0) msg = t('tutorial.l5');
    else if (this.level.id === 8 && (this.stats?.loops ?? 0) === 0) msg = t('tutorial.l8');
    this.hint.text = msg;
    this.hint.visible = !!msg && this.mode === 'draw';
  }

  // ------------------------------------------------------------------ Kamera
  private levelBounds() {
    const z0 = laneScale(0);
    const maxY = Math.max(30, (this.stats?.maxHeight ?? 20) + 10);
    return { minX: -6 * z0, maxX: (this.level.width + 6) * z0, minY: -8, maxY };
  }
  private fitCamera(instant: boolean): void {
    const cam = this.view.camera;
    if (this.samples && this.samples.count) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < this.samples.count; i++) {
        const s = toStage(this.samples.x[i], this.samples.y[i], this.samples.z[i]);
        minX = Math.min(minX, s.X); maxX = Math.max(maxX, s.X); minY = Math.min(minY, s.Y); maxY = Math.max(maxY, s.Y);
      }
      cam.fitBounds({ minX: minX - 6, maxX: maxX + 6, minY: Math.min(minY, laneRise(LANE_MIN)) - 6, maxY: maxY + 8 }, 0.1, 30);
    } else {
      const b = this.levelBounds();
      cam.fitBounds({ minX: b.minX, maxX: b.maxX, minY: -4, maxY: Math.min(b.maxY, this.level.width * 0.55) }, 0.08, 30);
    }
    if (instant) cam.snap();
  }

  // ------------------------------------------------------------------ Fahrt
  private startRide(): void {
    if (!this.path || !this.samples || this.mode !== 'draw') {
      if (!this.path) this.toast.show(t('drawHint'), 2);
      return;
    }
    this.mode = 'ride';
    this.selected = -1;
    this.shelfOpen = false;
    this.shelf.visible = false;
    this.drawOverlay();
    this.chipLayer.removeChildren();
    // Offene Bahn: Rückweg nur für die Fahrt auf einer Kopie ergänzen; die Zeichnung bleibt, wie sie ist
    let ridePath = this.path;
    let rideSamples = this.samples;
    if (!isClosed(this.path)) {
      ridePath = clonePath(this.path);
      closeTrack(ridePath);
      rideSamples = sampleTrack(ridePath, 0.25);
      this.view.setTrack(ridePath, rideSamples, this.skin, this.terrain, this.allowTunnels, false);
      this.toast.show(t('autoReturn'), 2);
    }
    const opts = simOptionsForLevel(this.level, ridePath, this.terrain, this.skin, this.allowTunnels);
    this.sim = new TrainSim(rideSamples, ridePath, opts);
    const perCar = 2;
    const riders = storage.ridersFor(opts.cars * perCar);
    this.passengers = new PassengerSim({ cars: opts.cars, perCar, gravityScale: opts.gravityScale, terrain: this.terrain, sideEjectG: 2.2 });
    this.passengers.onEject = (pv, side) => {
      const name = riders[pv.index]?.name ?? 'Jemand';
      this.failName = name;
      this.sim?.fail(side ? 'ejectSide' : 'eject', pv.car);
      const car = this.sim?.cars[pv.car];
      if (car) {
        const s = toStage(car.x, car.y, car.z);
        this.view.effects.sparks(s.X, s.Y, 6);
      }
    };
    this.view.buildTrain(opts.cars, riders, perCar);
    this.view.trackR.updateCoins(this.sim.collected, 0);
    this.rideTime = 0;
    this.cameraPhase = 'overview';
    this.timeScale = 1;
    this.slowMo = 0;
    this.resultShown = false;
    this.finaleTimer = 0;
    this.physicsAccum = 0;
    this.fitCamera(false);
    this.swapPlayIcon(true);
    this.hint.visible = false;
    this.shelfBtn.visible = false;
    this.speedBtn.visible = true;
    this.updateGoals();
  }

  /** Fahrttempo 1× → 2× → 3× → 1× */
  private cycleRideSpeed(): void {
    const cur = storage.settings.rideSpeed || 3;
    const next = cur >= 5 ? 1 : cur >= 3 ? 5 : cur + 1;
    storage.updateSettings({ rideSpeed: next });
    this.speedBtn.setText(`${next}×`);
    this.toast.show(t('ride.speed', { n: String(next) }), 1.2);
  }

  private stopRide(): void {
    if (this.mode === 'draw') return;
    this.mode = 'draw';
    this.sim = null;
    this.passengers?.dispose();
    this.passengers = null;
    this.view.trainR.clear();
    this.view.effects.clear();
    this.view.trackR.updateCoins([], 0);
    if (this.resultPanel) {
      this.ui.removeChild(this.resultPanel);
      this.resultPanel.destroy({ children: true });
      this.resultPanel = null;
    }
    this.swapPlayIcon(false);
    this.timeScale = 1;
    this.speedText.text = '';
    this.speedBtn.visible = false;
    this.shelfBtn.visible = true;
    this.redrawTrack();
    this.fitCamera(false);
    this.updateGoals();
    this.updateHint();
    this.drawOverlay();
  }

  private swapPlayIcon(riding: boolean): void {
    const old = this.playBtn;
    const btn = new Button('', { width: 78, round: true, color: riding ? '#d64545' : PINK, icon: riding ? iconStop : iconPlay });
    btn.position.copyFrom(old.position);
    btn.onTap = () => (this.mode === 'draw' ? this.startRide() : this.stopRide());
    this.ui.addChild(btn);
    this.ui.removeChild(old);
    old.destroy({ children: true });
    this.playBtn = btn;
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn];
    this.ui.addChild(this.toast);
  }

  private processEvents(): void {
    if (!this.sim) return;
    const ev = this.sim.events;
    while (ev.length) {
      const e = ev.shift()!;
      const car = this.sim.cars[e.car ?? 0];
      const s = car ? toStage(car.x, car.y, car.z) : { X: 0, Y: 0 };
      switch (e.kind) {
        case 'coin': {
          const c = this.level.coins?.[e.index ?? 0];
          if (c) {
            const cs = toStage(c.x, c.y, c.lane ?? 0);
            this.view.effects.coin(cs.X, cs.Y);
          }
          this.view.trackR.updateCoins(this.sim.collected, this.time);
          break;
        }
        case 'booster': this.view.effects.sparks(s.X, s.Y, 12); break;
        case 'splash': this.view.effects.splash(s.X, s.Y - 0.5); break;
        case 'peak': this.slowMo = 0.35; break;
        case 'inversion': this.view.effects.glitter(s.X, s.Y); break;
        case 'fail': this.view.effects.sparks(s.X, s.Y, 20); this.slowMo = 1.4; break;
        case 'finish': this.cameraPhase = 'finale'; this.view.effects.confetti(s.X, s.Y + 3, 80); break;
        default: break;
      }
    }
  }

  private updateRide(dt: number): void {
    if (!this.sim || !this.passengers) return;
    this.rideTime += dt;
    if (this.slowMo > 0) {
      this.slowMo -= dt;
      this.timeScale = 0.45;
    } else this.timeScale = storage.settings.rideSpeed || 3;
    const simDt = dt * this.timeScale;
    if (!(this.cameraPhase === 'overview' && this.rideTime < 1.2)) {
      if (this.cameraPhase === 'overview') this.cameraPhase = 'follow';
      // Zug und Fahrgäste im Gleichschritt (1/60 s): Die Fahrgäste müssen die Kräfte jedes Teilschritts
      // spüren. Würde der Zug erst um den ganzen Frame vorrücken, bekämen sie den Endzustand für den ganzen
      // Frame, bei Zeitraffer also eine kurze Spitze als lange Kraft (und würden grundlos herausfliegen).
      this.physicsAccum += simDt;
      const h = 1 / 60;
      let steps = 0;
      while (this.physicsAccum >= h && steps < 120) {
        this.physicsAccum -= h;
        steps++;
        this.sim.step(h);
        const auto = this.sim.samples.auto[Math.min(this.sim.samples.count - 1, Math.round(this.sim.cars[0].s / this.sim.samples.step))] === 1;
        this.passengers.step(this.sim.cars, h, this.sim.v, auto || this.sim.phase === 'failed');
      }
      if (steps >= 120) this.physicsAccum = 0;
    }
    this.processEvents();
    this.view.updateTrain(this.sim.cars, this.passengers.views, simDt);
    this.view.trackR.updateCoins(this.sim.collected, this.time);
    const cam = this.view.camera;
    const front = this.sim.cars[0];
    const portrait = this.h > this.w;
    if (this.cameraPhase === 'follow' || this.cameraPhase === 'overview') {
      const s = toStage(front.x, front.y, front.z);
      const v = Math.abs(this.sim.v);
      const look = 0.5 * v;
      const zoomBase = portrait ? 24 : 21;
      const zoom = clamp(zoomBase - v * 0.45, portrait ? 9 : 8, portrait ? 26 : 22) * (this.slowMo > 0 ? 1.2 : 1);
      cam.setTarget(s.X + Math.cos(front.angle) * look, s.Y + Math.sin(front.angle) * look * 0.5 + (portrait ? 1.5 : 2.5), zoom);
      cam.smoothing = this.cameraPhase === 'overview' ? 2 : 4;
      if (this.sim.phase === 'failed') cam.setTarget(s.X, s.Y + 2, 14);
    } else if (this.cameraPhase === 'finale') {
      this.fitCamera(false);
      cam.smoothing = 2;
    }
    this.speedText.text = `${Math.round(this.sim.kmh)} km/h   ${front.gSeat.toFixed(1)} g${Math.abs(front.bank) > 0.05 ? `   ${Math.round((front.bank * 180) / Math.PI)}°` : ''}`;
    if (this.sim.finished && !this.resultShown) {
      const wait = this.sim.phase === 'failed' ? 2.2 : 1.6;
      if (this.sim.phase === 'failed') {
        if (this.sim.sinceFail > wait) this.showResult();
      } else {
        this.finaleTimer += dt;
        if (this.finaleTimer > wait) this.showResult();
      }
    }
  }

  private showResult(): void {
    if (!this.sim || !this.path || !this.stats || this.resultShown) return;
    this.resultShown = true;
    this.mode = 'result';
    const finished = this.sim.phase === 'done';
    const allSeated = this.passengers?.allSeated ?? true;
    const ev = evaluate(this.level, this.path, this.stats, this.sim.stats, finished, allSeated);
    this.updateGoals();
    const success = !this.sandbox && ev.requiredDone;
    let unlockedNow: ElementId[] = [];
    if (success) {
      const before = unlockedUpTo(storage.progress.highest);
      storage.setStars(this.level.id, ev.stars);
      const after = unlockedUpTo(storage.progress.highest);
      unlockedNow = [...after].filter((u) => !before.has(u));
      this.unlocked = unlockedUpTo(Math.max(storage.progress.highest, this.level.id));
    }
    this.buildResultPanel(ev, finished, unlockedNow, success);
  }

  private failMessage(reason: FailReason | null): string {
    if (!reason) return t('goalsMissing');
    if (reason === 'eject' || reason === 'ejectSide') return t('fail.' + reason, { name: this.failName });
    return t('fail.' + reason);
  }

  private buildResultPanel(ev: Evaluation, finished: boolean, unlockedNow: ElementId[], success: boolean): void {
    const sim = this.sim!;
    const c = new Container();
    const portrait = this.h > this.w;
    const w = Math.min(this.w - 24, portrait ? 360 : 520);
    const goalsCount = this.sandbox ? 0 : this.level.goals.length;
    const hasNext = success && !this.sandbox && this.level.id < LEVELS.length;
    const h = Math.min(this.h - 20, 300 + goalsCount * 26 + (unlockedNow.length ? 40 : 0) + (hasNext ? 60 : 0));
    c.addChild(panelBg(w, h));
    let y = -h / 2 + 40;
    const title = label(this.sandbox ? t('ride') : success ? t('success') : t('failed'), 32, success ? '#2f7a4a' : '#d64545', true);
    title.position.set(0, y);
    c.addChild(title);
    y += 36;
    if (!this.sandbox) {
      const sg = new Graphics();
      for (let i = 0; i < 3; i++) star(sg, (i - 1) * 46, y + 6, 18, i < ev.stars);
      c.addChild(sg);
      y += 40;
    }
    const msg = label(finished && (this.passengers?.allSeated ?? true) ? (success || this.sandbox ? '' : t('goalsMissing')) : this.failMessage(sim.failReason), 16, INK, false, { wordWrap: true, wordWrapWidth: w - 50 });
    msg.position.set(0, y + 6);
    c.addChild(msg);
    y += msg.text ? msg.height + 14 : 4;
    if (!this.sandbox) {
      ev.goals.forEach((r) => {
        const g = new Graphics();
        check(g, -w / 2 + 34, y, 9, r.done);
        c.addChild(g);
        const txt = label(`${goalLabel(r.goal)}${r.goal.bonus ? ' (Bonus)' : ''}`, 15, INK);
        txt.anchor.set(0, 0.5);
        txt.position.set(-w / 2 + 52, y);
        c.addChild(txt);
        const val = label(fmtValue(r.goal.type, r.value), 14, '#7a6f8f');
        val.anchor.set(1, 0.5);
        val.position.set(w / 2 - 28, y);
        c.addChild(val);
        y += 26;
      });
    }
    const st = sim.stats;
    const statLine = label(`${t('stats.speed')} ${Math.round(st.maxSpeed * 3.6)} km/h · ${t('stats.maxG')} ${st.maxG.toFixed(1)} · ${t('stats.airtime')} ${st.airtime.toFixed(1)} s · ${t('stats.coins')} ${st.coins}/${this.level.coins?.length ?? 0} · ${t('stats.time')} ${st.time.toFixed(1)} s`, 13, '#7a6f8f', false, { wordWrap: true, wordWrapWidth: w - 50 });
    statLine.position.set(0, y + 10);
    c.addChild(statLine);
    y += statLine.height + 16;
    if (unlockedNow.length) {
      const u = label(`${t('unlocked')}: ${unlockedNow.map((x) => ELEMENT_NAMES[x]).join(', ')}`, 15, '#2f7a4a', true, { wordWrap: true, wordWrapWidth: w - 50 });
      u.position.set(0, y + 8);
      c.addChild(u);
    }
    // Knöpfe: Nochmal · Neu zeichnen · Menü in einer Reihe; „Weiter“ bekommt bei Erfolg eine eigene Reihe darunter
    const by = h / 2 - 40 - (hasNext ? 60 : 0);
    const bw = Math.min(108, (w - 40) / 3);
    const retry = new Button(t('retry'), { width: bw, height: 48, size: 16, color: '#4f8dff' });
    retry.position.set(-bw - 10, by);
    retry.onTap = () => this.stopRide();
    c.addChild(retry);
    // Bahn wegräumen und neu anfangen, direkt aus dem Ergebnis heraus
    const clear = new Button(t('clear'), { width: bw, height: 48, size: 15, color: '#d64545' });
    clear.position.set(0, by);
    clear.onTap = () => {
      this.stopRide();
      this.clearTrack();
    };
    c.addChild(clear);
    const menu = new Button(t('menu'), { width: bw, height: 48, size: 16, color: '#9b6dff' });
    menu.position.set(bw + 10, by);
    menu.onTap = () => this.leave();
    c.addChild(menu);
    if (hasNext) {
      const next = new Button(t('next'), { width: Math.min(220, w - 60), height: 48, size: 18, color: '#7ee081' });
      next.position.set(0, by + 60);
      next.onTap = () => {
        storage.setCurrent(this.level.id + 1);
        this.game.goto(() => new LevelScene(this.level.id + 1));
      };
      c.addChild(next);
    }
    c.position.set(this.w / 2, this.h / 2);
    c.eventMode = 'static';
    this.ui.addChild(c);
    this.resultPanel = c;
    this.ui.addChild(this.toast);
  }

  private saveSandbox(): void {
    if (!this.path) {
      this.toast.show(t('drawHint'), 2);
      return;
    }
    const fallback = this.sandbox?.saved?.name ?? `${this.world.name} ${new Date().toLocaleDateString()}`;
    let name = fallback;
    try {
      name = prompt(t('paint.name'), fallback) || fallback;
    } catch {
      name = fallback;
    }
    const track: SavedTrack = {
      id: this.sandbox?.saved?.id ?? `t${Date.now().toString(36)}`,
      name, world: this.world.id, created: Date.now(), path: clonePath(this.path), width: this.level.width,
    };
    storage.saveTrack(track);
    if (this.sandbox) this.sandbox.saved = track;
    this.toast.show(`${t('save')}: ${name}`, 2);
  }

  // ------------------------------------------------------------------ Layout / Loop
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (!this.view) return;
    this.view.resize(w, h);
    const portrait = h > w;
    const safeTop = 14;
    this.backBtn.position.set(36, safeTop + 26);
    this.undoBtn.position.set(96, safeTop + 26);
    this.redoBtn.position.set(152, safeTop + 26);
    this.clearBtn.position.set(w - 36, safeTop + 26);
    this.saveBtn.position.set(w - 92, safeTop + 26);
    if (portrait) {
      this.levelTitle.position.set(w / 2, safeTop + 72);
      this.goalsBar.position.set(w / 2, safeTop + 112);
    } else {
      this.levelTitle.position.set(w / 2, safeTop + 12);
      this.goalsBar.position.set(w / 2, safeTop + 56);
    }
    this.playBtn.position.set(w / 2, h - (portrait ? 64 : 56));
    this.shelfBtn.position.set(w - 46, h - 50);
    this.speedBtn.position.set(w - 46, h - 50);
    this.shelf.position.set(w - 10, h - 120);
    this.hint.position.set(w / 2, h - 178);
    this.hint.style.wordWrapWidth = Math.min(380, w - 40);
    this.speedText.position.set(w / 2, h - (portrait ? 120 : 108));
    this.toast.position.set(w / 2, h * 0.42);
    this.resultPanel?.position.set(w / 2, h / 2);
    if (this.mode === 'draw') this.updateGoals();
  }

  update(dt: number): void {
    if (!this.view) return;
    this.time += dt;
    if (this.mode === 'draw') {
      if (this.stroke) {
        this.previewTimer += dt;
        if (this.previewTimer > 0.08) {
          this.previewTimer = 0;
          this.previewStroke();
        }
      }
      this.renderChips();
      this.endMarker.alpha = 0.55 + 0.45 * Math.sin(this.time * 5);
      if (this.selected >= 0 && this.drag.kind === 'none') this.drawOverlay();
      this.view.camera.clampTo({ minX: -40, maxX: this.level.width + 40, minY: -30, maxY: 160 });
    } else if (this.mode === 'ride') {
      this.updateRide(dt);
    } else if (this.mode === 'result') {
      if (this.sim && this.passengers) this.view.updateTrain(this.sim.cars, this.passengers.views, dt);
    }
    this.view.update(dt);
    this.toast.update(dt);
  }
}

function panelBg(w: number, h: number): Graphics {
  const g = new Graphics();
  paintRect(g, -w / 2 + 3, -h / 2 + 6, w, h, INK, INK, 24, 12, 0.18);
  paintRect(g, -w / 2, -h / 2, w, h, PAPER, INK, 24, 11);
  g.roundRect(-w / 2 + 14, -h / 2 + 10, w - 28, 10, 5).fill({ color: hexNum(shade(PINK, 0.2)), alpha: 0.5 });
  return g;
}

function fmtValue(type: string, v: number): string {
  switch (type) {
    case 'height': case 'drop': case 'length': case 'maxLength': return `${v.toFixed(1)} m`;
    case 'speed': return `${Math.round(v)} km/h`;
    case 'airtime': case 'time': case 'maxTime': return `${v.toFixed(1)} s`;
    case 'maxG': case 'minG': return `${v.toFixed(1)} g`;
    case 'launch': case 'chainlift': case 'noBrakes': case 'finish': return v ? '✓' : '–';
    default: return `${Math.round(v)}`;
  }
}

export { interpretStroke, closestSample };
