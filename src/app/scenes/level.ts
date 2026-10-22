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
import { DEV_SKINS, devSkin, unlockAll } from '@/core/dev';
import { clamp } from '@/core/math';
import { bezier3, lerp3 } from '@/core/math3';
import { LEVELS, getLevel, unlockedUpTo } from '@/levels/levels';
import { WORLDS, worldOfLevel } from '@/levels/worlds';
import type { ElementId, LevelDef, WorldDef } from '@/levels/types';
import { goalLabel, ELEMENT_NAMES } from '@/levels/goalLabels';
import { evaluate, type Evaluation, hasNegativeGoals } from '@/levels/evaluator';
import { Terrain } from '@/physics/terrain';
import { TrainSim, simOptionsForLevel, type CarState, type FailReason } from '@/physics/trainSim';
import { carFrame, stateAt } from '@/track/model';
import { PassengerSim, initPhysics, emptyParts, seatedPose, type PassengerView } from '@/physics/passengers';
import { restraintFor } from '@/physics/belts';
import { audio } from '@/core/audio';
import { lerpCar, lerpParts } from '@/physics/interpolate';
import {
  clonePath, closestSample, createNode, emptyPath, isAutoNode, isClosed, nodeIn, nodeOut, sampleTrack, segmentPoints, trackStats,
  type ElementKind, type StartType, type TrackNode, type TrackPath, type TrackSamples, type TrackStats,
} from '@/track/model';
import { strokeToTrack, closePath, extendTrack, interpretStroke, type InterpretedPoint, type StrokeMode } from '@/track/strokeToTrack';
import { bendSegment } from '@/track/edit';
import { MeasureOverlay } from '@/render/measureOverlay';
import { applyOverdraw, nearestOnTrack } from '@/track/overdraw';
import { laneRise, laneScale, nearestLane, toStage, toWorld, type StagePoint, LANE_MIN, LANE_MAX, LANE_DEPTH, LANE_RISE } from '@/track/stage';
import { WorldView } from '@/render/worldView';
import { Button, Toast, Sticker, label, INK, PAPER, PINK, paintRect, goalIcon, beltIcon, check, star, iconBack, iconUndo, iconRedo, iconPlay, iconStop, iconShelf, iconSave, iconTrash } from '@/ui/widgets';
import { hexNum, shade } from '@/render/paint';
import { StartScene } from './start';
import { MyTracksScene } from './myTracks';
import { captureLevel, type LevelLayers } from '../mapTransition';
import type { SkyState } from '@/render/sky';

export interface SandboxConfig {
  world: number;
  width: number;
  saved?: SavedTrack;
}

type Mode = 'draw' | 'ride' | 'result';
type StrokeKind = 'new' | 'overdraw' | 'terrain' | 'extend';

/** Worauf die Kamera in der Zeitlupen-Regie schaut */
interface CameraFocus {
  kind: 'car' | 'passenger';
  index: number;
}

interface DragState {
  kind: 'node' | 'handleIn' | 'handleOut' | 'depth' | 'roll' | 'shelf' | 'stroke' | 'segment' | 'trackPending' | 'none';
  node?: number;
  element?: ElementKind;
  ghost?: Graphics;
  startY?: number;
  startVal?: number;
  /** Segment-Ziehen: Segment, Parameter und feste Tiefe (Spuren) des angefassten Punkts */
  seg?: number;
  t?: number;
  z?: number;
  /** Anfasspunkt (Bildschirm und Bühne) und Bahnrichtung dort (Bildschirm, normiert), für die Entscheidung
   *  quer (biegen) oder längs (überzeichnen) */
  startPt?: Pt;
  startSt?: StagePoint;
  tangent?: Pt;
}

const START_ORDER: StartType[] = ['chainlift', 'launch', 'hydro', 'swing', 'verticalLift'];
const START_UNLOCK: Record<StartType, ElementId> = { chainlift: 'chainlift', launch: 'launch', hydro: 'hydroLaunch', swing: 'swingLaunch', verticalLift: 'verticalLift' };
const SHELF_ELEMENTS: Array<{ kind: ElementKind; unlock: ElementId; color: string; length: number }> = [
  { kind: 'booster', unlock: 'booster', color: '#ff8a5c', length: 10 },
  { kind: 'brake', unlock: 'brake', color: '#d64545', length: 8 },
  { kind: 'splash', unlock: 'splash', color: '#3ec7c2', length: 8 },
  { kind: 'launchBlock', unlock: 'doubleLaunch', color: '#ffd23f', length: 14 },
];
/** Bühnen-Meter Tinte hinter dem Finger (die Bahn selbst ist die Vorschau) */
const INK_TAIL = 1.5;
/** Knotenwahl beim Zeichnen: Scheitel-Semantik (Standard) oder der alte Schneider-Fit zum Vergleich (?fit=legacy) */
const FIT_MODE: 'apex' | 'legacy' = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fit') === 'legacy' ? 'legacy' : 'apex';

/** Trefferradius für Knoten und Handles (Bildschirm-Pixel); eng liegende Knoten werden für den Treffer auseinandergeschoben */
const HIT_R = 32;
/** so nah (Pixel) an der Bahn greift der Finger das Segment statt einen neuen Strich zu beginnen */
const SEGMENT_HIT_PX = 24;
/** Knoten-Menü: Bogen um den gewählten Knoten (Radius in Pixeln) mit Tiefe, Schräglage und Löschen */
const MENU_R = 64;
const MENU_HIT = 32;

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
  /** Knoten mit Profi-Handles (nach Langdruck); −1 = keiner */
  private proNode = -1;
  /** Langdruck hat gerade einen Knoten gewählt: der folgende dragStart darf keinen Strich beginnen */
  private longPressArmed = false;
  private mode: Mode = 'draw';
  private stroke: StagePoint[] | null = null;
  private strokeKind: StrokeKind = 'new';
  private strokeModes: StrokeMode[] = [];
  /** Spur und Lesart am Ende des Strichs (aus der letzten Vorschau), für die Spur-Anzeige */
  private strokeLane: { lane: number; mode: StrokeMode } | null = null;
  private previewTimer = 0;
  /** Dauer der letzten Vorschau in Sekunden: der Takt passt sich an (mindestens 40 ms, sonst das Anderthalbfache) */
  private previewCost = 0;
  /** Strichpunkte, die die letzte Vorschau schon als Bahn zeigt; die Tinte zeigt nur den Rest hinter dem Finger */
  private previewedCount = 0;
  /** Streben wachsen nach dem Loslassen von 0 auf 1 (0,3 s) */
  private supportGrow = 1;
  private drag: DragState = { kind: 'none' };
  private sim: TrainSim | null = null;
  private passengers: PassengerSim | null = null;
  private rideTime = 0;
  private cameraPhase: 'overview' | 'follow' | 'finale' = 'overview';
  private timeScale = 1;
  /** Zeitlupen-Regie: Faktor, Ende (Fahrtzeit) und Kamera-Fokus */
  private slow: { factor: number; until: number; focus: CameraFocus | null } = { factor: 1, until: 0, focus: null };
  /** Render-Puffer: zwischen Vor- und Jetzt-Zustand der Physik interpoliert (glatt bei jedem Tempo) */
  private renderCars: CarState[] = [];
  private renderViews: PassengerView[] = [];
  private lastEjected = -1;
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
  /** Geister-Schiene (vorgeschlagene Schlussverbindung) und Looping-Marker während des Strichs */
  private ghost = new Graphics();
  /** Markierung des offenen Endes (pulsiert) */
  private endMarker = new Graphics();
  /** Spur-Anzeige unten rechts: fünf Ebenen wie die Bühne, die aktive leuchtet (grün Boden, pink Höhe) */
  private laneHud = new Container();
  private laneHudG = new Graphics();
  private laneHudState: { lane: number | null; mode: StrokeMode } = { lane: NaN, mode: 'floor' };
  private chipLayer = new Container();
  private gizmoLayer = new Container();
  private goalsBar = new Container();
  /** Zellen der Zielleiste (einmal gebaut); refreshGoals setzt nur die Haken */
  private goalCells: Array<{ check: Graphics; pop: Container; done: boolean; x: number; y: number }> = [];
  private goalsBuiltFor = '';
  private measure = new MeasureOverlay();
  private liveGoalTimer = 0;
  private hint = label('', 17, INK, false, { stroke: { color: '#ffffff', width: 4 }, wordWrap: true, wordWrapWidth: 360 });
  private levelTitle = label('', 16, '#ffffff', true, { stroke: { color: INK, width: 4 } });
  /** Gurt-Abzeichen (Stufe der Welt bzw. des Levels); beim Reißen roter Pop */
  private beltBadge = new Container();
  private beltIconG = new Graphics();
  private beltText = label('', 12, '#ffffff', true, { stroke: { color: INK, width: 3 } });
  private beltPop = 0;
  /** Sticker-Einblendung („Entgleist!“, „Gefangen!“) */
  private sticker = new Sticker();
  /** Stehender Zug in der Station (Zeichenmodus): Wagenzustände und Sitzposen */
  private standCars: CarState[] = [];
  private standViews: PassengerView[] = [];
  /** Ohnmacht je Fahrgast (Fahrtzeit, bis zu der das Gesicht ohnmächtig bleibt) und schon gemeldete Landungen */
  private faintUntil = new Map<number, number>();
  private landedSeen = new Set<number>();
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
  /** Dev-Modus: Bahntyp durchschalten */
  private skinBtn = new Button('DEV', { width: 150, height: 40, size: 15, color: '#2a1f3d' });
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
    if (unlockAll()) this.unlocked = unlockedUpTo(150);
    this.terrain = new Terrain(this.level);
    this.skin = this.pickSkin();
  }

  private pickSkin(): string {
    const forced = devSkin();
    if (forced) return forced;
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
    this.view.overlay.addChild(this.ink, this.ghost, this.overlay, this.endMarker);
    this.container.addChild(this.view.root, this.ui);
    this.laneHud.addChild(this.laneHudG);
    this.ui.addChild(this.measure.container, this.chipLayer, this.gizmoLayer, this.goalsBar, this.levelTitle, this.beltBadge, this.sticker, this.hint, this.speedText, this.rollText, this.laneHud, this.shelf, this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn, this.toast);
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn];
    this.speedBtn.visible = false;
    this.skinBtn.visible = unlockAll();
    this.skinBtn.setText(`DEV · ${ELEMENT_NAMES[this.skin as ElementId] ?? this.skin}`);
    this.skinBtn.onTap = () => this.cycleDevSkin();
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
    this.beltBadge.addChild(this.beltIconG, this.beltText);
    this.beltText.anchor.set(0.5, 0);
    this.beltText.position.set(0, 18);
    this.refreshBeltBadge(false);
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
    this.refreshLaneHud();
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

  /** Wolkenlage der Karte übernehmen, damit der erste Level-Frame nahtlos an den letzten Karten-Frame anschließt */
  adoptSky(state: SkyState): void {
    this.view.sky.importState(state);
  }

  /** Ebenen und Kamera für den Übergang von der Karte und zu ihr */
  transitionLayers(): LevelLayers {
    return { sky: this.view.sky, world: this.view.world, ui: this.ui, camera: this.view.camera };
  }

  /** Dev-Modus: nächster Bahntyp (nach dem letzten wieder der der Welt); gilt für alle Level */
  private cycleDevSkin(): void {
    if (this.mode !== 'draw') return;
    const order = ['', ...DEV_SKINS];
    const next = order[(order.indexOf(storage.settings.devSkin) + 1) % order.length];
    storage.updateSettings({ devSkin: next });
    this.skin = this.pickSkin();
    this.view.trainR.setSkin(this.skin);
    this.redrawTrack();
    const name = ELEMENT_NAMES[this.skin as ElementId] ?? this.skin;
    this.skinBtn.setText(`DEV · ${name}`);
    this.toast.show(next ? `Bahntyp: ${name}` : `Bahntyp der Welt: ${name}`, 1.4);
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
      if (this.longPressArmed) {
        // Langdruck hat den Knoten gewählt und die Profi-Handles gezeigt; der Finger liegt noch auf dem Knoten.
        // Von hier aus beginnt kein Strich und kein Knoten-Zug: erst loslassen, dann Handle greifen.
        this.longPressArmed = false;
        return;
      }
      if (this.path && this.selected >= 0) {
        const hit = this.hitGizmo(p);
        if (hit && hit !== 'delete') {
          this.pushHistory();
          const n = this.path.nodes[this.selected];
          this.drag = { kind: hit, node: this.selected, startY: st.Y, startVal: hit === 'depth' ? n.z : Number.isNaN(n.roll) ? 0 : n.roll };
          return;
        }
        if (hit === 'delete') return;
      }
      // Offenes Ende: Fortsetzen hat Vorrang vor Knoten-Zug und Segment-Griff (der Anschlusspunkt leuchtet)
      const extendHere = (): boolean => {
        if (!this.path || isClosed(this.path)) return false;
        const endNode = this.path.nodes[this.path.nodes.length - 1];
        const endS = toStage(endNode.x, endNode.y, endNode.z);
        return Math.hypot(endS.X - st.X, endS.Y - st.Y) * this.view.camera.zoom < 56;
      };
      const nodeIdx = this.path && !extendHere() ? this.hitNode(p) : -1;
      if (nodeIdx >= 0 && this.unlocked.has('handles')) {
        this.pushHistory();
        this.selected = nodeIdx;
        this.proNode = -1;
        this.drag = { kind: 'node', node: nodeIdx };
        this.drawOverlay();
        return;
      }
      // Finger auf der Bahn: Segment anfassen. Ob gebogen (quer zur Bahn) oder überzeichnet wird (längs der
      // Bahn), entscheidet die erste Bewegung (siehe dragMove, 'trackPending').
      if (this.path && this.samples && this.unlocked.has('handles') && !extendHere()) {
        const near = nearestOnTrack(this.samples, st);
        if (near.index >= 0 && near.d * this.view.camera.zoom < SEGMENT_HIT_PX) {
          const seg = this.samples.seg[near.index];
          const nodes = this.path.nodes;
          const a = nodes[seg % nodes.length];
          const b = nodes[(seg + 1) % nodes.length];
          if (!isAutoNode(a) && !isAutoNode(b)) {
            const i0 = Math.max(0, near.index - 2);
            const i1 = Math.min(this.samples.count - 1, near.index + 2);
            const sa = toStage(this.samples.x[i0], this.samples.y[i0], this.samples.z[i0]);
            const sb = toStage(this.samples.x[i1], this.samples.y[i1], this.samples.z[i1]);
            const tl = Math.hypot(sb.X - sa.X, sb.Y - sa.Y) || 1;
            // Bühne → Bildschirm: Y gespiegelt
            const tangent = { x: (sb.X - sa.X) / tl, y: -(sb.Y - sa.Y) / tl };
            this.drag = { kind: 'trackPending', seg, t: this.samples.t[near.index], z: this.samples.z[near.index], startPt: p, startSt: st, tangent };
            this.selected = -1;
            this.proNode = -1;
            this.drawOverlay();
            return;
          }
        }
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
        if (!isClosed(this.path) && endPx < 56) {
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
      this.proNode = -1;
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
        case 'trackPending': {
          const d = this.drag;
          const dx = p.x - d.startPt!.x;
          const dy = p.y - d.startPt!.y;
          const len = Math.hypot(dx, dy);
          if (len < 12) break;
          const along = Math.abs(dx * d.tangent!.x + dy * d.tangent!.y) / len;
          if (along < 0.6) {
            // quer zur Bahn: Segment biegen
            this.pushHistory();
            this.drag = { ...d, kind: 'segment' };
            this.bendTo(st);
          } else {
            // längs der Bahn: überzeichnen, der Strich beginnt am Anfasspunkt
            this.stroke = [d.startSt!, { X: st.X, Y: st.Y }];
            this.strokeModes = [];
            this.strokeKind = 'overdraw';
            this.drag = { kind: 'stroke' };
            this.drawInk();
          }
          break;
        }
        case 'segment': this.bendTo(st); break;
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
        case 'node': case 'handleIn': case 'handleOut': case 'depth': case 'roll': case 'segment': this.afterEdit(); break;
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
      if (this.standCars.length) {
        const hitRider = this.view.trainR.hitPassenger(st.X, st.Y);
        if (hitRider >= 0) {
          this.view.trainR.playOn(hitRider, 'scared');
          return;
        }
      }
      if (this.path && this.samples) {
        if (this.selected >= 0 && this.hitGizmo(p) === 'delete') {
          this.deleteNode(this.selected);
          return;
        }
        const el = this.hitElement(st);
        if (el >= 0) {
          this.pushHistory();
          this.path.elements.splice(el, 1);
          this.afterEdit();
          return;
        }
        const n = this.hitNode(p);
        if (n >= 0 && this.unlocked.has('handles')) {
          if (this.selected !== n) this.proNode = -1;
          this.selected = n;
          this.drawOverlay();
          this.refreshLaneHud();
          return;
        }
      }
      this.selected = -1;
      this.proNode = -1;
      this.drawOverlay();
      this.refreshLaneHud();
    };
    H.longPress = (p) => {
      if (this.mode !== 'draw' || this.isOverUI(p) || !this.path || !this.unlocked.has('handles')) return;
      const n = this.hitNode(p);
      if (n < 0) return;
      // Profi-Modus: Langdruck auf einen Knoten zeigt seine Tangenten-Handles
      this.selected = n;
      this.proNode = n;
      this.longPressArmed = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
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
  /**
   * Trefferflächen der Knoten (Bildschirm): eng liegende Knoten werden unsichtbar auseinandergeschoben, damit
   * jeder mit dem Finger greifbar bleibt (drei Runden Verdrängung auf 2·HIT_R Abstand).
   */
  private nodeHitCenters(): Array<{ i: number; x: number; y: number }> {
    const out: Array<{ i: number; x: number; y: number }> = [];
    if (!this.path) return out;
    this.path.nodes.forEach((n, i) => {
      if (isAutoNode(n)) return;
      const sp = this.nodeScreen(n);
      out.push({ i, x: sp.x, y: sp.y });
    });
    for (let round = 0; round < 3; round++) {
      for (let a = 0; a < out.length; a++) {
        for (let b = a + 1; b < out.length; b++) {
          const dx = out[b].x - out[a].x;
          const dy = out[b].y - out[a].y;
          const d = Math.hypot(dx, dy);
          if (d >= 2 * HIT_R) continue;
          const push = (2 * HIT_R - d) / 2;
          const ux = d > 1e-3 ? dx / d : 1;
          const uy = d > 1e-3 ? dy / d : 0;
          out[a].x -= ux * push; out[a].y -= uy * push;
          out[b].x += ux * push; out[b].y += uy * push;
        }
      }
    }
    return out;
  }
  private hitNode(p: Pt): number {
    let best = -1;
    let bestD = HIT_R;
    for (const c of this.nodeHitCenters()) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c.i;
      }
    }
    return best;
  }
  /**
   * Positionen der Gizmo-Teile des ausgewählten Knotens (Bildschirm): Tangenten-Handles nur im Profi-Modus
   * (Langdruck), dazu das Bogenmenü über dem Knoten mit Tiefe (links), Schräglage (oben) und Löschen (rechts).
   */
  private gizmoPositions(): { in: Pt | null; out: Pt | null; depth: Pt; roll: Pt; delete: Pt } | null {
    if (!this.path || this.selected < 0 || this.selected >= this.path.nodes.length) return null;
    const n = this.path.nodes[this.selected];
    const c = this.nodeScreen(n);
    const onArc = (deg: number): Pt => ({ x: c.x + MENU_R * Math.cos((deg * Math.PI) / 180), y: c.y - MENU_R * Math.sin((deg * Math.PI) / 180) });
    let inP: Pt | null = null;
    let outP: Pt | null = null;
    if (this.proNode === this.selected) {
      const a = nodeIn(n);
      const b = nodeOut(n);
      const sa = toStage(a.x, a.y, a.z / LANE_DEPTH);
      const sb = toStage(b.x, b.y, b.z / LANE_DEPTH);
      inP = this.view.toScreen(sa.X, sa.Y);
      outP = this.view.toScreen(sb.X, sb.Y);
    }
    return { in: inP, out: outP, depth: onArc(150), roll: onArc(90), delete: onArc(30) };
  }
  private hitGizmo(p: Pt): 'handleIn' | 'handleOut' | 'depth' | 'roll' | 'delete' | null {
    const g = this.gizmoPositions();
    if (!g) return null;
    const d = (q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
    if (g.in && d(g.in) < HIT_R) return 'handleIn';
    if (g.out && d(g.out) < HIT_R) return 'handleOut';
    if (this.gizmo3D && d(g.depth) < MENU_HIT) return 'depth';
    if (this.gizmoRoll && d(g.roll) < MENU_HIT) return 'roll';
    if (this.canDelete(this.selected) && d(g.delete) < MENU_HIT) return 'delete';
    return null;
  }
  private canDelete(i: number): boolean {
    if (!this.path || i < 0 || i >= this.path.nodes.length) return false;
    const real = this.path.nodes.filter((n) => !isAutoNode(n)).length;
    return real > 3 && this.path.nodes[i].kind !== 'station';
  }
  /** Segment-Ziehen: die Bahn läuft am Anfasspunkt genau durch den Finger (feste Tiefe), Knoten bleiben */
  private bendTo(st: StagePoint): void {
    if (!this.path || this.drag.kind !== 'segment') return;
    const z = this.drag.z ?? 0;
    const w = toWorld(st.X, st.Y, z);
    let y = Math.max(this.groundAt(w.x, z) + 0.6, w.y);
    if (this.level.maxHeight) y = Math.min(y, this.level.maxHeight);
    bendSegment(this.path, this.drag.seg ?? 0, this.drag.t ?? 0.5, { x: w.x, y, z: z * LANE_DEPTH });
    this.redrawTrack();
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
      fit: FIT_MODE,
      groundHeight: ground,
      groundClearance: 0.8,
      maxHeight: this.level.maxHeight ?? 0,
      allowTurns: this.unlocked.has('turn'),
      allowLoops: this.unlocked.has('loop'),
      // Rundenschluss ab 8 m Bühne oder 60 px, je nachdem, was weiter ist (weit herausgezoomt trifft der Finger gröber)
      closeSnap: Math.max(8, 60 / this.view.camera.zoom),
    };
  }

  /**
   * Vorschau während des Strichs: Looping-Scheitel als Ring und, sobald das Strichende nah genug an der Station
   * ist, ein feiner gestrichelter Hinweis zur Station. Der Rundenschluss selbst kommt erst beim Loslassen, damit
   * die Bahn während des Ziehens nicht in die Station springt.
   */
  private drawGhost(path: TrackPath): void {
    const g = this.ghost;
    g.clear();
    const zs = 1 / Math.max(0.35, this.view.camera.zoom / 12);
    for (const n of path.nodes) {
      if (n.kind !== 'loopApex') continue;
      const sp = toStage(n.x, n.y, n.z);
      const k = laneScale(n.z);
      g.circle(sp.X, sp.Y, 0.9 * k * zs).stroke({ width: 0.16 * k * zs, color: 0x9b6dff, alpha: 0.9 });
    }
    if (!this.stroke || this.stroke.length < 2 || isClosed(path) || path.nodes.length < 2) return;
    const st0 = path.nodes[0];
    const sp = toStage(st0.x, st0.y, st0.z);
    const e = this.stroke[this.stroke.length - 1];
    const d = Math.hypot(sp.X - e.X, sp.Y - e.Y);
    const snap = Math.max(8, 60 / this.view.camera.zoom);
    if (d > snap || d < 0.5) return;
    const dash = 0.7 * zs;
    const period = dash + 0.5 * zs;
    const offset = (this.time * 2.5) % period;
    for (let a = -offset; a < d; a += period) {
      const s0 = Math.max(0, a) / d;
      const s1 = Math.min(d, a + dash) / d;
      if (s1 <= s0) continue;
      g.moveTo(e.X + (sp.X - e.X) * s0, e.Y + (sp.Y - e.Y) * s0).lineTo(e.X + (sp.X - e.X) * s1, e.Y + (sp.Y - e.Y) * s1).stroke({ width: 0.28 * zs, color: 0xffffff, alpha: 0.75, cap: 'round' });
    }
    g.circle(sp.X, sp.Y, 0.55 * zs).stroke({ width: 0.16 * zs, color: 0xffffff, alpha: 0.75 });
  }

  private drawInk(): void {
    const g = this.ink;
    g.clear();
    if (!this.stroke || this.stroke.length < 2) return;
    if (this.strokeKind === 'terrain') {
      g.poly(this.stroke.flatMap((p) => [p.X, p.Y]), false).stroke({ width: 0.6, color: 0xc9a36b, alpha: 0.95, cap: 'round', join: 'round' });
      return;
    }
    // Die Bahn selbst ist die Vorschau; die Tinte zeigt nur den Rest hinter dem Finger: alles, was die letzte
    // Vorschau noch nicht als Bahn zeigt, mindestens die letzten 1,5 Bühnen-Meter
    const n = this.stroke.length;
    let i = n - 1;
    let len = 0;
    while (i > 0 && len < INK_TAIL) {
      len += Math.hypot(this.stroke[i].X - this.stroke[i - 1].X, this.stroke[i].Y - this.stroke[i - 1].Y);
      i--;
    }
    i = Math.max(0, Math.min(i, this.previewedCount - 1));
    const seg = this.stroke.slice(i).flatMap((p) => [p.X, p.Y]);
    if (seg.length < 4) return;
    const modes = this.strokeModes;
    const mode = modes.length ? modes[modes.length - 1] : undefined;
    const color = this.strokeKind === 'overdraw' ? 0xffd23f : mode === 'height' ? 0xff5c8a : 0x7ee081;
    g.poly(seg, false).stroke({ width: 0.5, color: 0xffffff, alpha: 0.35, cap: 'round', join: 'round' });
    g.poly(seg, false).stroke({ width: 0.25, color, alpha: 0.55, cap: 'round', join: 'round' });
  }

  private previewStroke(): void {
    if (!this.stroke || this.stroke.length < 4) return;
    if (this.strokeKind === 'terrain') return;
    const opts = { ...this.strokeOptions(), preview: true };
    const count = this.stroke.length;
    const last = this.stroke[count - 1];
    const laneOf = (points: { z: number; mode: StrokeMode }[] | undefined) => {
      const p = points && points.length ? points[points.length - 1] : null;
      this.strokeLane = p ? { lane: p.z, mode: p.mode } : { lane: nearestLane(last.Y), mode: 'floor' };
      this.refreshLaneHud();
    };
    if (this.strokeKind === 'overdraw' && this.path && this.samples) {
      const merged = applyOverdraw(this.path, this.stroke, { ...opts, snapDistance: 30 / this.view.camera.zoom });
      this.ghost.clear();
      laneOf(undefined);
      if (merged) {
        const sm = sampleTrack(merged, 0.5);
        this.view.setTrack(merged, sm, this.skin, this.terrain, this.allowTunnels, true);
        this.previewedCount = count;
        this.drawInk();
        this.liveFeedback(merged, sm, trackStats(merged, sm));
      }
      return;
    }
    if (this.strokeKind === 'extend' && this.path) {
      const out: { points?: InterpretedPoint[] } = {};
      const ext = extendTrack(this.path, this.stroke, opts, out);
      if (ext) {
        this.strokeModes = out.points?.map((p) => p.mode) ?? [];
        laneOf(out.points);
        const sm = sampleTrack(ext, 0.5);
        this.view.setTrack(ext, sm, this.skin, this.terrain, this.allowTunnels, true);
        this.previewedCount = count;
        this.drawInk();
        this.drawGhost(ext);
        this.liveFeedback(ext, sm, trackStats(ext, sm));
      }
      return;
    }
    const r = strokeToTrack(this.stroke, opts);
    this.strokeModes = r.points.map((p) => p.mode);
    laneOf(r.points);
    if (r.path.nodes.length >= 2) this.previewedCount = count;
    this.drawInk();
    if (r.path.nodes.length >= 2) {
      const sm = sampleTrack(r.path, 0.5);
      this.view.setTrack(r.path, sm, this.skin, this.terrain, this.allowTunnels, true);
      this.drawGhost(r.path);
      this.liveFeedback(r.path, sm, trackStats(r.path, sm));
    } else this.ghost.clear();
  }

  private finishStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    this.strokeModes = [];
    this.strokeLane = null;
    this.previewedCount = 0;
    this.previewCost = 0;
    this.ink.clear();
    this.ghost.clear();
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
    this.proNode = -1;
    this.redrawTrack();
    this.updateUndoButtons();
    if (!path) {
      this.view.terrainR.setTunnelPortals([]);
      this.measure.clear();
      this.updateGoals();
      this.updateHint();
      if (!this.sandbox) storage.saveDraft(this.level.id, emptyPath());
      return;
    }
    if (animate && this.samples) {
      const n = path.nodes[0];
      const s = toStage(n.x, n.y, n.z);
      for (let i = 0; i < 6; i++) this.view.effects.glitter(s.X, s.Y + 1);
      // Streben wachsen vom Boden hoch
      this.supportGrow = 0;
      this.view.growSupports(0);
    }
    this.updateGoals();
    this.updateHint();
    if (this.samples && this.stats) this.measure.show(path, this.samples, this.stats, (x, z) => this.terrain.groundHeight(x, z));
    if (!this.sandbox) storage.saveDraft(this.level.id, path);
  }

  private redrawTrack(): void {
    if (!this.path || this.path.nodes.length < 2) {
      this.samples = null;
      this.stats = null;
      this.view.trackR.clear();
      this.drawOverlay();
      this.refreshLaneHud();
      return;
    }
    this.samples = sampleTrack(this.path, 0.25);
    this.stats = trackStats(this.path, this.samples);
    this.view.setTrack(this.path, this.samples, this.skin, this.terrain, this.allowTunnels, false);
    this.drawOverlay();
    this.refreshLaneHud();
    if (this.mode === 'draw') this.buildStandingTrain();
    if (this.drag.kind !== 'none' && this.drag.kind !== 'stroke') this.liveFeedback(this.path, this.samples, this.stats);
  }

  /**
   * Zug wartet in der Station (Zeichenmodus): Wagen 0 am Start, die anderen dahinter (auf geschlossenen Bahnen am
   * Ende der Runde, sonst entlang der Stationsgeraden nach hinten verlängert), Fahrgäste sitzen und tuscheln.
   */
  private buildStandingTrain(): void {
    if (!this.path || !this.samples || this.samples.count < 2) {
      this.standCars = [];
      this.standViews = [];
      this.view.trainR.clear();
      return;
    }
    const opts = simOptionsForLevel(this.level, this.path, this.terrain, this.skin, this.allowTunnels);
    const perCar = 2;
    const belt = restraintFor(this.level, this.world);
    if (this.standCars.length !== opts.cars) {
      const riders = storage.ridersFor(opts.cars * perCar);
      this.view.buildTrain(opts.cars, riders, perCar);
      this.standViews = [];
      for (let c = 0; c < opts.cars; c++) {
        for (let r = 0; r < perCar; r++) {
          const pose = seatedPose(r);
          this.standViews.push({ index: this.standViews.length, car: c, row: r, parts: pose, prevParts: seatedPose(r), ejected: false, lane: 0, lean: 0, landed: false, belt, beltBroken: false, face: 'normal' });
        }
      }
    }
    const g = 9.81 * opts.gravityScale;
    const s0 = stateAt(this.samples, 0);
    this.standCars = [];
    for (let c = 0; c < opts.cars; c++) {
      const back = c * opts.carLength;
      let st = s0;
      if (this.samples.closed) st = stateAt(this.samples, -back);
      else st = { ...s0, x: s0.x - s0.t3x * back, y: s0.y - s0.t3y * back, z: s0.z - (s0.t3z * back) / LANE_DEPTH };
      const fr = carFrame(st, 0, g);
      const p0 = toStage(st.x, st.y, st.z);
      const p1 = toStage(st.x + st.t3x, st.y + st.t3y, st.z + st.t3z / LANE_DEPTH);
      this.standCars.push({
        index: c, s: 0, x: st.x, y: st.y, z: st.z, tx: fr.T.x, ty: fr.T.y, tz: fr.T.z, upx: fr.U.x, upy: fr.U.y, upz: fr.U.z, sx: fr.S.x, sy: fr.S.y, sz: fr.S.z,
        bank: fr.bank, angle: Math.atan2(p1.Y - p0.Y, p1.X - p0.X), gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: g, feltSide: 0, inTunnel: false, inverted: false, vx: 0, vy: 0,
      });
    }
    this.view.trainR.setStanding(true);
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

  // ------------------------------------------------------------------ Spur-Anzeige
  /**
   * Welche Ebene gerade gilt: beim Zeichnen die Spur am Strichende, sonst der gewählte Knoten, das offene Ende
   * oder die Station. Nur im Zeichenmodus und bei geschlossenem Regal sichtbar.
   */
  private refreshLaneHud(): void {
    let lane: number | null = null;
    let mode: StrokeMode = 'floor';
    if (this.strokeLane) ({ lane, mode } = this.strokeLane);
    else if (this.path && this.selected >= 0 && this.selected < this.path.nodes.length) {
      const n = this.path.nodes[this.selected];
      lane = n.z;
      mode = n.y - this.groundAt(n.x, n.z) > 1.5 ? 'height' : 'floor';
    } else if (this.path && this.path.nodes.length) {
      const n = isClosed(this.path) ? this.path.nodes[0] : this.path.nodes[this.path.nodes.length - 1];
      lane = n.z;
      mode = n.y - this.groundAt(n.x, n.z) > 1.5 ? 'height' : 'floor';
    }
    this.laneHud.visible = this.mode === 'draw' && !this.shelfOpen;
    const st = this.laneHudState;
    const same = (st.lane === null && lane === null) || (st.lane !== null && lane !== null && Math.round(st.lane) === Math.round(lane));
    if (same && st.mode === mode) return;
    this.laneHudState = { lane, mode };
    this.drawLaneHud();
  }
  private drawLaneHud(): void {
    const g = this.laneHudG;
    g.clear();
    const { lane, mode } = this.laneHudState;
    const ink = hexNum(INK);
    // fünf Ebenen wie die Bühne: hinten (oben) schmaler und heller, vorne (unten) breiter und satter
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      const row = LANE_MAX - z;
      const w = 24 + row * 4;
      const y = -22 + row * 11;
      const active = lane !== null && Math.round(lane) === z;
      const fill = active ? (mode === 'height' ? 0xff5c8a : 0x7ee081) : hexNum(PAPER);
      g.roundRect(-w / 2, y - 3.5, w, 7, 3.5).fill({ color: fill, alpha: active ? 1 : 0.7 - row * 0.05 }).stroke({ width: 2, color: ink, alpha: active ? 1 : 0.55 });
      if (!active) continue;
      // Marke: Punkt = am Boden dieser Ebene, Pfeil = in der Höhe über dieser Ebene
      if (mode === 'height') g.poly([-4, y + 2, 0, y - 3, 4, y + 2]).fill(0xffffff).stroke({ width: 1, color: ink });
      else g.circle(0, y, 2.2).fill(0xffffff).stroke({ width: 1, color: ink });
    }
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
      // um den eigenen Ursprung gezeichnet, damit der Anschlusspunkt in update() atmen kann
      this.endMarker.position.set(se.X, se.Y);
      this.endMarker.circle(0, 0, 1.1 * ke * zs).fill({ color: 0xffd23f, alpha: 0.25 }).stroke({ width: 0.18 * ke * zs, color: 0xffd23f });
      this.endMarker.circle(0, 0, 0.45 * ke * zs).fill(0xffd23f).stroke({ width: 0.12 * ke, color: hexNum(INK) });
    }
    const zoomScale = 1 / Math.max(0.35, this.view.camera.zoom / 12);
    // Looping-Scheitel sind immer markiert (auch ohne Handles): So sieht man sofort, dass die Schleife erkannt wurde
    for (const n of nodes) {
      if (n.kind !== 'loopApex') continue;
      const sp = toStage(n.x, n.y, n.z);
      const k = laneScale(n.z);
      g.circle(sp.X, sp.Y, 0.9 * k * zoomScale).stroke({ width: 0.16 * k * zoomScale, color: 0x9b6dff, alpha: 0.9 });
    }
    if (!this.unlocked.has('handles')) return;
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
      const gp = this.gizmoPositions()!;
      // Tangenten-Handles nur im Profi-Modus (Langdruck auf den Knoten)
      if (gp.in && gp.out) {
        const a = nodeIn(n);
        const b = nodeOut(n);
        const sa = toStage(a.x, a.y, a.z / LANE_DEPTH);
        const sb = toStage(b.x, b.y, b.z / LANE_DEPTH);
        const rr = 0.5 * k * zoomScale;
        g.moveTo(sa.X, sa.Y).lineTo(c.X, c.Y).lineTo(sb.X, sb.Y).stroke({ width: 0.12 * k, color: hexNum(INK), alpha: 0.8 });
        g.circle(sa.X, sa.Y, rr).fill(0x3ec7c2).stroke({ width: 0.12 * k, color: hexNum(INK) });
        g.circle(sb.X, sb.Y, rr).fill(0x3ec7c2).stroke({ width: 0.12 * k, color: hexNum(INK) });
      }
      // Bogenmenü in Bildschirm-Pixeln über dem Knoten: Tiefe (links), Schräglage (oben), Löschen (rechts)
      const gz = new Graphics();
      const sc = this.nodeScreen(n);
      const arcFrom = (deg: number) => (deg * Math.PI) / 180;
      gz.arc(sc.x, sc.y, MENU_R, -arcFrom(150), -arcFrom(30)).stroke({ width: 2, color: hexNum(INK), alpha: 0.25 });
      const button = (q: Pt, fill: number) => gz.circle(q.x, q.y, 22).fill(fill).stroke({ width: 3, color: hexNum(INK) });
      if (this.gizmo3D) {
        button(gp.depth, 0x9b6dff);
        gz.moveTo(gp.depth.x, gp.depth.y - 10).lineTo(gp.depth.x, gp.depth.y + 10).moveTo(gp.depth.x - 6, gp.depth.y - 4).lineTo(gp.depth.x, gp.depth.y - 10).lineTo(gp.depth.x + 6, gp.depth.y - 4)
          .moveTo(gp.depth.x - 6, gp.depth.y + 4).lineTo(gp.depth.x, gp.depth.y + 10).lineTo(gp.depth.x + 6, gp.depth.y + 4).stroke({ width: 3, color: 0xffffff, cap: 'round', join: 'round' });
      }
      const auto = Number.isNaN(n.roll);
      if (this.gizmoRoll) {
        button(gp.roll, auto ? hexNum(PAPER) : 0xff8a5c);
        const ang = auto ? 0 : n.roll;
        gz.moveTo(gp.roll.x - 13 * Math.cos(ang), gp.roll.y - 13 * Math.sin(ang)).lineTo(gp.roll.x + 13 * Math.cos(ang), gp.roll.y + 13 * Math.sin(ang)).stroke({ width: 3.5, color: hexNum(INK), cap: 'round' });
        gz.circle(gp.roll.x, gp.roll.y, 3).fill(hexNum(INK));
        if (!auto) this.rollText.text = `${Math.round((n.roll * 180) / Math.PI)}°`;
        this.rollText.position.set(gp.roll.x + 40, gp.roll.y);
      }
      if (this.canDelete(this.selected)) {
        button(gp.delete, 0xd64545);
        gz.moveTo(gp.delete.x - 8, gp.delete.y - 8).lineTo(gp.delete.x + 8, gp.delete.y + 8).moveTo(gp.delete.x + 8, gp.delete.y - 8).lineTo(gp.delete.x - 8, gp.delete.y + 8).stroke({ width: 3.5, color: 0xffffff, cap: 'round' });
      }
      this.gizmoLayer.addChild(gz);
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
    this.refreshLaneHud();
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
    if (this.sandbox) {
      // Sandkasten: das Maßband zeigt Länge, Höhe, Loopings und Kehren dauerhaft
      this.goalsBar.removeChildren();
      this.goalCells = [];
      this.goalsBuiltFor = '';
      this.measure.pin(true);
      if (this.path && this.samples && this.stats) this.measure.show(this.path, this.samples, this.stats, (x, z) => this.terrain.groundHeight(x, z));
      else this.measure.clear();
      return;
    }
    const ts = this.stats ?? { length: 0, maxHeight: 0, loops: 0, turns: 0, lanes: 0, rolls: 0, maxDrop: 0 };
    const ride = this.sim?.stats ?? null;
    const finished = this.sim?.phase === 'done';
    const ev = this.path ? evaluate(this.level, this.path, ts, ride, finished, this.passengers?.allSeated ?? true) : null;
    this.buildGoalsBar();
    this.refreshGoals(ev, false);
  }

  /** Zielleiste einmal je Level und Format bauen (Zellen bleiben, nur die Haken ändern sich) */
  private buildGoalsBar(): void {
    const portrait = this.h > this.w;
    const key = `${this.level.id}:${portrait ? 'p' : 'l'}:${this.w}`;
    if (this.goalsBuiltFor === key) return;
    this.goalsBuiltFor = key;
    this.goalsBar.removeChildren();
    this.goalCells = [];
    const goals = this.level.goals;
    const perRow = portrait ? 3 : 6;
    const cellW = portrait ? Math.min(126, (this.w - 24) / perRow) : 150;
    goals.forEach((goal, i) => {
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
      const pop = new Container();
      pop.position.set(bgW / 2 - 14, 0);
      const ck = new Graphics();
      check(ck, 0, 0, 9, false);
      pop.addChild(ck);
      c.addChild(pop);
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = Math.min(perRow, goals.length - row * perRow);
      c.position.set((col - (rowCount - 1) / 2) * cellW, row * 46);
      this.goalsBar.addChild(c);
      this.goalCells.push({ check: ck, pop, done: false, x: c.position.x + pop.position.x, y: c.position.y });
    });
  }

  /** Haken setzen; ein neu erreichtes Ziel ploppt (Skalierung 1 → 1,3 → 1) und glitzert */
  private refreshGoals(ev: Evaluation | null, animate: boolean): void {
    this.goalCells.forEach((cell, i) => {
      const done = !!ev?.goals[i]?.done;
      if (done === cell.done) return;
      cell.done = done;
      cell.check.clear();
      check(cell.check, 0, 0, 9, done);
      if (done && animate) {
        cell.pop.scale.set(1.3);
        const bar = this.goalsBar.position;
        for (let k = 0; k < 4; k++) this.view.effects.glitter(...(() => { const st = this.view.camera.toStage(bar.x + cell.x, bar.y + cell.y); return [st.X, st.Y] as [number, number]; })());
      }
    });
    for (const cell of this.goalCells) if (cell.pop.scale.x > 1) cell.pop.scale.set(Math.max(1, cell.pop.scale.x - 0.02));
  }

  /**
   * Live-Ziele und Maßband während Strich und Drag (höchstens alle 100 ms): die Zielleiste hakt, sobald die
   * Bahn ein Ziel erfüllt, noch bevor der Finger loslässt
   */
  private liveFeedback(path: TrackPath, samples: TrackSamples, stats: TrackStats, force = false): void {
    const now = performance.now();
    if (!force && now - this.liveGoalTimer < 100) return;
    this.liveGoalTimer = now;
    if (!this.sandbox) {
      this.buildGoalsBar();
      this.refreshGoals(evaluate(this.level, path, stats, null, false, true), true);
    }
    this.measure.show(path, samples, stats, (x, z) => this.terrain.groundHeight(x, z));
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
    // Offene Bahn: kein automatischer Rückweg mehr; die Fahrt endet am Absperrband (Abflug oder Kippen)
    const ridePath = this.path;
    const rideSamples = this.samples;
    const opts = simOptionsForLevel(this.level, ridePath, this.terrain, this.skin, this.allowTunnels);
    this.sim = new TrainSim(rideSamples, ridePath, opts);
    const perCar = 2;
    const riders = storage.ridersFor(opts.cars * perCar);
    const belt = restraintFor(this.level, this.world);
    const negative = hasNegativeGoals(this.level);
    this.passengers = new PassengerSim({ cars: opts.cars, perCar, gravityScale: opts.gravityScale, terrain: this.terrain, belt });
    this.refreshBeltBadge(false);
    this.renderCars = this.sim.cars.map((c) => ({ ...c }));
    this.renderViews = this.passengers.views.map((v) => ({ ...v, parts: emptyParts(), prevParts: emptyParts() }));
    this.lastEjected = -1;
    this.faintUntil.clear();
    this.landedSeen.clear();
    this.passengers.onEject = (pv, side) => {
      const name = riders[pv.index]?.name ?? 'Jemand';
      this.failName = name;
      this.lastEjected = pv.index;
      audio.play('eject');
      // In Leveln mit negativen Zielen (Abflug, Fangen, Flugweite) ist der Rauswurf gewollt: Zeitlupe auf den Fliegenden
      if (negative) {
        this.setSlow(0.25, 1.2, { kind: 'passenger', index: pv.index });
        this.sticker.show(t('sticker.eject', { name }), '#7ee081');
      } else this.sim?.fail(side ? 'ejectSide' : 'eject', pv.car);
      const car = this.sim?.cars[pv.car];
      if (car) {
        const s = toStage(car.x, car.y, car.z);
        this.view.effects.sparks(s.X, s.Y, 6);
      }
    };
    this.passengers.onBeltSnap = (pv) => {
      const name = riders[pv.index]?.name ?? 'Jemand';
      this.beltPop = 1;
      this.refreshBeltBadge(true);
      this.sticker.show(t('sticker.beltSnap'), '#ff8a5c');
      this.toast.show(t('beltSnap', { name }), 1.6);
      audio.play('beltSnap');
    };
    this.passengers.onCatch = (pv, car) => {
      const name = riders[pv.index]?.name ?? 'Jemand';
      const c = this.sim?.cars[car];
      if (c) {
        const s = toStage(c.x, c.y, c.z);
        this.view.effects.confetti(s.X, s.Y + 2, 30);
      }
      this.setSlow(0.35, 1.0, { kind: 'car', index: car });
      this.sticker.show(t('sticker.catch'), '#7ee081');
      this.toast.show(t('caught', { name }), 1.6);
      audio.play('catch');
    };
    this.view.buildTrain(opts.cars, riders, perCar);
    this.standCars = [];
    this.standViews = [];
    this.view.trainR.setStanding(false);
    this.view.trackR.updateCoins(this.sim.collected, 0);
    this.rideTime = 0;
    this.cameraPhase = 'overview';
    this.timeScale = 1;
    this.slow = { factor: 1, until: 0, focus: null };
    this.resultShown = false;
    this.finaleTimer = 0;
    this.physicsAccum = 0;
    this.fitCamera(false);
    this.swapPlayIcon(true);
    this.hint.visible = false;
    this.shelfBtn.visible = false;
    this.speedBtn.visible = true;
    this.laneHud.visible = false;
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
    this.standCars = [];
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
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn];
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
        case 'wheelLock': this.view.effects.sparks(s.X, s.Y - 0.3, 16); this.view.camera.shake(0.25, 0.3); audio.play('wheelLock'); break;
        case 'splash': this.view.effects.splash(s.X, s.Y - 0.5); break;
        case 'peak': this.setSlow(0.6, 0.5, { kind: 'car', index: 0 }); break;
        case 'inversion': this.view.effects.glitter(s.X, s.Y); break;
        case 'fail': {
          this.view.effects.sparks(s.X, s.Y, 20);
          this.view.camera.shake(0.6, 0.3);
          if (e.reason === 'openEnd') this.view.effects.ribbons(s.X, s.Y + 0.5, 12);
          if (e.reason) this.sticker.show(t('sticker.' + e.reason, { name: this.failName }), e.reason === 'water' ? '#bfefff' : '#ffd23f');
          audio.play(e.reason === 'derail' ? 'derail' : 'impact');
          // Rauswurf: Zeitlupe mit Blick auf den Fliegenden; sonst auf den betroffenen Wagen
          const ejectReason = e.reason === 'eject' || e.reason === 'ejectSide';
          const focus: CameraFocus = ejectReason && this.lastEjected >= 0 ? { kind: 'passenger', index: this.lastEjected } : { kind: 'car', index: e.car ?? 0 };
          this.setSlow(ejectReason ? 0.25 : 0.35, 1.2, focus);
          break;
        }
        case 'finish': this.cameraPhase = 'finale'; this.view.effects.confetti(s.X, s.Y + 3, 80); break;
        default: break;
      }
    }
  }

  /** Mimik aus der Fahrt: über 7 g ohnmächtig (2 s), nach der Landung benommen; Staub beim Aufsetzen */
  private updateFaces(): void {
    if (!this.sim || !this.passengers) return;
    for (const v of this.passengers.views) {
      if (v.ejected) {
        if (v.landed && !this.landedSeen.has(v.index)) {
          this.landedSeen.add(v.index);
          const tp = v.parts.torso;
          const ls = toStage(tp.x, tp.y, v.lane);
          this.view.effects.dust(ls.X, ls.Y - 0.3, 6);
        }
        v.face = v.landed ? 'dizzy' : 'normal';
        continue;
      }
      const car = this.sim.cars[v.car];
      if (car && car.gSeat > 7) this.faintUntil.set(v.index, this.rideTime + 2);
      v.face = (this.faintUntil.get(v.index) ?? -1) > this.rideTime ? 'faint' : 'normal';
    }
  }

  /** Aufprall im Freiflug: die Fahrgäste des Wagens fliegen raus, Staub oder Platsch am Aufschlagpunkt */
  private processImpacts(): void {
    if (!this.sim || !this.passengers) return;
    const flight = this.sim.flight;
    if (!flight || !flight.impacts.length) return;
    for (const imp of flight.impacts) {
      const thrown = this.passengers.ejectCar(imp.car, this.sim.cars, imp.speed);
      const s = toStage(imp.x, imp.y, imp.z);
      if (imp.water) {
        this.view.effects.splash(s.X, s.Y - 0.5);
      } else {
        this.view.effects.dust(s.X, s.Y, 10);
        if (thrown > 0 || imp.speed > 6) this.view.effects.sparks(s.X, s.Y, 8);
      }
      this.view.camera.shake(Math.min(0.8, 0.15 + imp.speed * 0.05), 0.25);
    }
    flight.impacts.length = 0;
  }

  /** Zeitlupe für secs Sekunden (Echtzeit) mit Kamera-Fokus; ein laufender Fokus auf einen Fliegenden bleibt */
  private setSlow(factor: number, secs: number, focus: CameraFocus): void {
    const keep = this.slow.focus?.kind === 'passenger' && focus.kind !== 'passenger';
    this.slow = { factor, until: this.rideTime + secs, focus: keep ? this.slow.focus : focus };
  }

  /** Render-Puffer aus Vor- und Jetzt-Zustand füllen (alpha = Anteil des nächsten Schritts, der schon vergangen ist) */
  private interpolateRender(alpha: number): void {
    if (!this.sim || !this.passengers) return;
    for (let c = 0; c < this.renderCars.length; c++) lerpCar(this.sim.prevCars[c], this.sim.cars[c], alpha, this.renderCars[c]);
    for (let i = 0; i < this.renderViews.length; i++) {
      const v = this.passengers.views[i];
      const r = this.renderViews[i];
      r.ejected = v.ejected;
      r.landed = v.landed;
      r.lane = v.lane;
      r.lean = v.lean;
      r.face = v.face;
      r.car = v.car;
      r.belt = v.belt;
      r.beltBroken = v.beltBroken;
      lerpParts(v.prevParts, v.parts, alpha, r.parts);
    }
  }

  private updateRide(dt: number): void {
    if (!this.sim || !this.passengers) return;
    this.rideTime += dt;
    const inSlow = this.rideTime < this.slow.until;
    this.timeScale = inSlow ? this.slow.factor : storage.settings.rideSpeed || 3;
    const simDt = dt * this.timeScale;
    const h = 1 / 60;
    if (this.cameraPhase === 'overview' && this.rideTime < 1.2) {
      // Übersicht vor der Abfahrt: die Fahrgäste winken (Cut-out-Clip), die Physik übernimmt danach
      if (this.rideTime - dt <= 0) {
        this.view.trainR.setStanding(true);
        this.view.updateStandingTrain(this.sim.cars, this.passengers.views, 0);
        this.view.trainR.playAll('wave');
      }
      this.view.trainR.idleUpdate(dt);
    }
    if (!(this.cameraPhase === 'overview' && this.rideTime < 1.2)) {
      if (this.cameraPhase === 'overview') {
        this.cameraPhase = 'follow';
        this.view.trainR.setStanding(false);
      }
      // Zug und Fahrgäste im Gleichschritt (1/60 s): Die Fahrgäste müssen die Kräfte jedes Teilschritts
      // spüren. Würde der Zug erst um den ganzen Frame vorrücken, bekämen sie den Endzustand für den ganzen
      // Frame, bei Zeitraffer also eine kurze Spitze als lange Kraft (und würden grundlos herausfliegen).
      this.physicsAccum += simDt;
      let steps = 0;
      while (this.physicsAccum >= h && steps < 120) {
        this.physicsAccum -= h;
        steps++;
        this.sim.step(h);
        const auto = this.sim.samples.auto[Math.min(this.sim.samples.count - 1, Math.round(this.sim.cars[0].s / this.sim.samples.step))] === 1;
        this.passengers.step(this.sim.cars, h, this.sim.v, auto || this.sim.finished);
        this.processImpacts();
      }
      if (steps >= 120) this.physicsAccum = 0;
    }
    this.processEvents();
    this.updateFaces();
    // Gezeichnet wird der Zwischenstand zwischen dem vorigen und dem aktuellen Physik-Schritt: In Zeitlupe
    // vergehen mehrere Bilder pro Schritt, ohne Interpolation würde der Zug stottern.
    this.interpolateRender(clamp(this.physicsAccum / h, 0, 1));
    this.view.updateTrain(this.renderCars, this.renderViews, simDt);
    this.view.trackR.updateCoins(this.sim.collected, this.time);
    if (this.sim.wheelLock > 0) {
      // blockierte Räder vor dem Absperrband: Funkenspur unter dem ersten Wagen
      const fc = this.renderCars[0];
      const fs = toStage(fc.x, fc.y, fc.z);
      this.view.effects.sparks(fs.X, fs.Y - 0.2, 2);
    }
    const cam = this.view.camera;
    const front = this.renderCars[0];
    const portrait = this.h > this.w;
    if (this.cameraPhase === 'follow' || this.cameraPhase === 'overview') {
      const s = toStage(front.x, front.y, front.z);
      const v = Math.abs(this.sim.v);
      const look = 0.5 * v;
      const zoomBase = portrait ? 24 : 21;
      const zoom = clamp(zoomBase - v * 0.45, portrait ? 9 : 8, portrait ? 26 : 22) * (inSlow ? 1.2 : 1);
      cam.setTarget(s.X + Math.cos(front.angle) * look, s.Y + Math.sin(front.angle) * look * 0.5 + (portrait ? 1.5 : 2.5), zoom);
      cam.smoothing = this.cameraPhase === 'overview' ? 2 : 4;
      const focus = this.slow.focus;
      const flyer = focus?.kind === 'passenger' ? this.renderViews[focus.index] : null;
      if (flyer?.ejected) {
        // Regie: der Fliegende bleibt im Bild, bis er gelandet ist
        const tp = flyer.parts.torso;
        const fs = toStage(tp.x, tp.y, flyer.lane);
        cam.setTarget(fs.X, fs.Y + 1, inSlow ? 18 : 14);
      } else if (this.sim.phase === 'failed' || this.sim.phase === 'flying') {
        // Fehlschlag und Freiflug: Blick auf den betroffenen Wagen, bis das Ergebnis kommt
        const c = (focus?.kind === 'car' ? this.renderCars[focus.index] : null) ?? front;
        const cs = toStage(c.x, c.y, c.z);
        cam.setTarget(cs.X, cs.Y + 2, 14);
      }
    } else if (this.cameraPhase === 'finale') {
      this.fitCamera(false);
      cam.smoothing = 2;
    }
    this.speedText.text = `${Math.round(this.sim.kmh)} km/h   ${front.gSeat.toFixed(1)} g${Math.abs(front.bank) > 0.05 ? `   ${Math.round((front.bank * 180) / Math.PI)}°` : ''}`;
    if (this.sim.finished && !this.resultShown) {
      const wait = this.sim.phase === 'failed' ? 2.2 : 1.6;
      // Fliegende Fahrgäste dürfen landen (höchstens 6 s), damit Flugweite und Landung im Ergebnis stimmen
      const flying = this.passengers.views.some((v) => v.ejected && !v.landed);
      if (this.sim.phase === 'flying') {
        // Freiflug: Ergebnis, sobald das Wrack liegt (frühestens nach 1,2 s), spätestens nach 6 s Simulationszeit
        const settled = this.sim.flight?.settled ?? true;
        if (this.sim.sinceFail > 1.2 && ((settled && !flying) || this.sim.sinceFail > 6)) this.showResult();
      } else if (this.sim.phase === 'failed') {
        if (this.sim.sinceFail > wait && (!flying || this.sim.sinceFail > 6)) this.showResult();
      } else {
        this.finaleTimer += dt;
        if (this.finaleTimer > wait && (!flying || this.finaleTimer > 6)) this.showResult();
      }
    }
  }

  private showResult(): void {
    if (!this.sim || !this.path || !this.stats || this.resultShown) return;
    this.resultShown = true;
    this.mode = 'result';
    const finished = this.sim.phase === 'done';
    const allSeated = this.passengers?.allSeated ?? true;
    // Rauswurf, Fang und Flugweite kommen aus der Fahrgast-Simulation
    if (this.passengers) Object.assign(this.sim.stats, this.passengers.stats);
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
    const seatedOk = hasNegativeGoals(this.level) || (this.passengers?.allSeated ?? true);
    const msg = label(finished && seatedOk ? (success || this.sandbox ? '' : t('goalsMissing')) : this.failMessage(sim.failReason), 16, INK, false, { wordWrap: true, wordWrapWidth: w - 50 });
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
    const extra = st.ejected > 0 ? ` · ${t('stats.ejected')} ${st.ejected}${st.caught > 0 ? ` · ${t('stats.caught')} ${st.caught}` : ''} · ${t('stats.flight')} ${st.flightMax.toFixed(1)} m` : '';
    const statLine = label(`${t('stats.speed')} ${Math.round(st.maxSpeed * 3.6)} km/h · ${t('stats.maxG')} ${st.maxG.toFixed(1)} · ${t('stats.airtime')} ${st.airtime.toFixed(1)} s · ${t('stats.coins')} ${st.coins}/${this.level.coins?.length ?? 0} · ${t('stats.time')} ${st.time.toFixed(1)} s${extra}`, 13, '#7a6f8f', false, { wordWrap: true, wordWrapWidth: w - 50 });
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
    this.skinBtn.position.set(88, h - 50);
    if (portrait) {
      this.levelTitle.position.set(w / 2, safeTop + 72);
      this.goalsBar.position.set(w / 2, safeTop + 112);
    } else {
      this.levelTitle.position.set(w / 2, safeTop + 12);
      this.goalsBar.position.set(w / 2, safeTop + 56);
    }
    this.beltBadge.position.set(w - 64, safeTop + 78);
    this.sticker.position.set(w / 2, h * 0.36);
    this.playBtn.position.set(w / 2, h - (portrait ? 64 : 56));
    this.shelfBtn.position.set(w - 46, h - 50);
    this.speedBtn.position.set(w - 46, h - 50);
    this.laneHud.position.set(w - 46, h - 120);
    this.shelf.position.set(w - 10, h - 120);
    this.hint.position.set(w / 2, h - 178);
    this.hint.style.wordWrapWidth = Math.min(380, w - 40);
    this.speedText.position.set(w / 2, h - (portrait ? 120 : 108));
    this.toast.position.set(w / 2, h * 0.42);
    this.resultPanel?.position.set(w / 2, h / 2);
    if (this.mode === 'draw') {
      this.goalsBuiltFor = '';
      this.updateGoals();
    }
  }

  update(dt: number): void {
    if (!this.view) return;
    this.time += dt;
    if (this.mode === 'draw') {
      if (this.stroke) {
        this.previewTimer += dt;
        if (this.previewTimer > Math.max(0.04, 1.5 * this.previewCost)) {
          this.previewTimer = 0;
          const t0 = performance.now();
          this.previewStroke();
          this.previewCost = (performance.now() - t0) / 1000;
        }
      }
      if (this.supportGrow < 1) {
        this.supportGrow = Math.min(1, this.supportGrow + dt / 0.3);
        this.view.growSupports(1 - (1 - this.supportGrow) ** 2);
      }
      this.measure.update(dt, (X, Y) => this.view.toScreen(X, Y));
      for (const cell of this.goalCells) if (cell.pop.scale.x > 1) cell.pop.scale.set(Math.max(1, cell.pop.scale.x - dt * 1.5));
      this.renderChips();
      // Anschlusspunkt atmet (Alpha und Größe), damit das offene Ende als Startpunkt für den nächsten Strich auffällt
      this.endMarker.alpha = 0.55 + 0.45 * Math.sin(this.time * 5);
      this.endMarker.scale.set(1 + 0.15 * Math.sin(this.time * 5));
      if (this.selected >= 0 && this.drag.kind === 'none') this.drawOverlay();
      if (this.standCars.length) this.view.updateStandingTrain(this.standCars, this.standViews, dt);
      this.view.camera.clampTo({ minX: -40, maxX: this.level.width + 40, minY: -30, maxY: 160 });
    } else if (this.mode === 'ride') {
      this.updateRide(dt);
    } else if (this.mode === 'result') {
      if (this.sim && this.passengers && this.renderCars.length) this.view.updateTrain(this.renderCars, this.renderViews, dt);
    }
    if (this.beltPop > 0) {
      this.beltPop = Math.max(0, this.beltPop - dt * 4);
      this.beltBadge.scale.set(1 + 0.6 * this.beltPop);
    }
    this.sticker.update(dt);
    this.view.update(dt);
    this.toast.update(dt);
  }

  /** Gurt-Abzeichen neu zeichnen: Stufe des Levels (oder der Welt), rot durchgestrichen, wenn ein Gurt gerissen ist */
  private refreshBeltBadge(broken: boolean): void {
    const level = restraintFor(this.level, this.world);
    this.beltIconG.clear();
    beltIcon(this.beltIconG, level, 30, broken);
    this.beltText.text = t(`belt.${level}`);
    this.beltBadge.visible = !this.sandbox || level > 0;
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
