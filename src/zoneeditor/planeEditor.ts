/**
 * Zonen-Editor, Stufe 1 (docs/ZONENEDITOR-PLAN.md, Abschnitt 6): Gerüst, Ebenen, Kamera. Hängt sich wie der
 * Klötzchen-Editor in die Level-Szene einer Zone (`?zone=<name>&editor=2`) und nutzt deren Weltrenderer und Spielkamera,
 * so zeigt er genau das Bild des Spiels. Bauen: Der Editor nimmt Zeiger und Tasten (Werkzeuge, Ebenen, Ansichten);
 * Spielen: Das Level bekommt alles wie sonst (Tab oder der Knopf oben rechts).
 *
 * Eingabe nach Plan 3.3 und 4.2: Stift und Maus führen die Werkzeuge; zwei Finger schwenken und zoomen; ein einzelner
 * Finger wird ignoriert, sobald ein Stift im Spiel war (ohne Stift zeichnet der Finger); zwei Finger tippen =
 * rückgängig, drei = wiederholen; Leertaste oder rechte Maustaste schwenken, das Rad zoomt.
 *
 * Gesichert wird über den Dev-Server in die Zonendatei (Cmd+S oder Knopf); jede Änderung liegt zusätzlich als
 * Sicherungskopie im Browser, bis sie gesichert ist. Platzhalter: Aussehen der Oberfläche, Füllfarben der Formen.
 */
import type { WorldRenderer } from '@/world/renderer';
import type { WorldView } from '@/render/worldView';
import type { CameraTiltPanel } from '@/ui/cameraTiltPanel';
import { CAMERA_TILT, viewState } from '@/track/stage';
import { loadZone, onZoneChange, saveZone } from '@/zone/io';
import type { ZoneFile } from '@/zone/types';
import { buildSliceStack } from '@/zone/slices';
import {
  cloneNodes,
  depthBeside,
  ellipsePath,
  findPlane,
  findShape,
  isPlane,
  movePlaneDepth,
  nearestDepth,
  newPlane,
  newShape,
  nextNodeId,
  parseNodes,
  placeholderFill,
  planesOf,
  planeToWorld,
  rectPath,
  serializeNodes,
  setGapBehind,
  shapeBounds,
  shapeLocalPolys,
  shapesOf,
  shapeToPlane,
  slicesToNodes,
  worldToPlane,
  type HoldView,
  type ZoneNode,
  type ZonePlane,
  type ZoneShape,
} from '@/zone/nodes';
import { History } from './history';
import { EditorOverlay, type OverlayState } from './overlay';
import { EditorUi, type Isolate, type LayerRow, type Tool } from './ui';
import { EditorViews, type ViewMode } from './views';

export interface PlaneEditorHost {
  world: WorldRenderer;
  view: WorldView;
  cameraPanel: CameraTiltPanel | null;
  /** Zeichenfläche des Spiels (#app): ihre Zeiger fängt der Editor beim Bauen ab */
  surface: HTMLElement;
  /** Bedienung des Spiels (HUD, Overlays, Kamera-Panel) zeigen oder verbergen */
  setGameUi(on: boolean): void;
}

interface Pt {
  x: number;
  y: number;
}

interface Pointer extends Pt {
  type: string;
  sx: number;
  sy: number;
  t: number;
  moved: boolean;
}

type Gesture =
  | { kind: 'move'; pointerId: number; id: string; start: Pt; orig: Pt }
  | { kind: 'scale'; pointerId: number; id: string; axis: 'xy' | 'x' | 'y'; anchor: Pt; h0: Pt; orig: { x: number; y: number; sx: number; sy: number } }
  | { kind: 'create'; pointerId: number; plane: string; shape: 'rect' | 'ellipse'; a: Pt; b: Pt }
  | { kind: 'empty'; pointerId: number; start: Pt; last: Pt; orbit: boolean; moved: boolean };

type Nav = { kind: 'touch'; ids: [number, number]; center: Pt; dist: number; count: number; t: number; moved: boolean } | { kind: 'mouse'; pointerId: number; last: Pt; orbit: boolean };

/** Ecken und Kantenmitten des Auswahlrahmens: Gegenstück und Achse je Griff */
const OPPOSITE = [2, 3, 0, 1, 6, 7, 4, 5];
const AXIS: Array<'xy' | 'x' | 'y'> = ['xy', 'xy', 'xy', 'xy', 'y', 'x', 'y', 'x'];
const BACKUP_KEY = (zone: string) => `tc.zoneeditor.${zone}`;
const DEG = Math.PI / 180;
const TAP_TIME = 260;
const TAP_DIST = 12;

export class PlaneEditor {
  private nodes: ZoneNode[];
  private active: string | null = null;
  private selected: string | null = null;
  private tool: Tool = 'select';
  private isolate: Isolate = 'off';
  private hold = true;
  building = true;
  private dirty = false;
  private meshDirty = true;
  private uiDirty = true;
  private thumbTimer = 0;
  private backupTimer = 0;
  private readonly history = new History();
  private readonly views: EditorViews;
  private readonly overlay = new EditorOverlay();
  private readonly ui: EditorUi;
  private readonly pointers = new Map<number, Pointer>();
  private penSeen = false;
  private gesture: Gesture | null = null;
  private nav: Nav | null = null;
  private spaceDown = false;
  private shiftDown = false;
  private lastSaveAt = -1e9;
  private destroyed = false;
  private viewChoice: ViewMode | 'side' = 'game';
  /** Ebenen-Lagen beim Beginn eines Abstands- oder Tiefen-Ziehens (es rechnet immer vom Anfang aus) */
  private dragBase: Map<string, { z: number; x: number; y: number; scale: number }> | null = null;
  private lastCam = '';
  private fps = { frames: 0, t: 0, value: 0 };
  private width = 800;
  private height = 600;

  constructor(
    private readonly host: PlaneEditorHost,
    private readonly zone: ZoneFile,
  ) {
    this.nodes = zone.nodes ?? [];
    zone.nodes = this.nodes;
    this.active = planesOf(this.nodes)[0]?.id ?? null;
    this.views = new EditorViews(host.world);
    this.ui = new EditorUi(this.actions(), zone.name, this.overlay.el);
    this.ui.setTool(this.tool);
    this.ui.setView(this.viewChoice);
    this.ui.setHold(this.hold);
    this.syncCameraUi();
    const s = host.surface;
    s.addEventListener('pointerdown', this.onDown, true);
    s.addEventListener('pointermove', this.onMove, true);
    s.addEventListener('pointerup', this.onUp, true);
    s.addEventListener('pointercancel', this.onUp, true);
    s.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    s.addEventListener('contextmenu', this.onContext, true);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    document.addEventListener('gesturestart', this.onGesture);
    onZoneChange((name) => {
      if (!this.destroyed && name === this.zone.name) void this.reloadFromDisk();
    });
    this.checkBackup();
    this.setBuilding(true);
    this.changed(false);
  }

  // ------------------------------------------------------------------ Zustand

  private get plane(): ZonePlane | undefined {
    return findPlane(this.nodes, this.active);
  }

  private get shape(): ZoneShape | undefined {
    return findShape(this.nodes, this.selected);
  }

  private setNodes(nodes: ZoneNode[]): void {
    this.nodes = nodes;
    this.zone.nodes = nodes;
    if (!findShape(nodes, this.selected)) this.selected = null;
    if (!findPlane(nodes, this.active)) this.active = this.shape?.parent ?? planesOf(nodes)[0]?.id ?? null;
    this.changed();
  }

  /** nach jeder Änderung: neu zeichnen, Liste und Leisten nachführen, Sicherungskopie planen */
  private changed(markDirty = true): void {
    this.meshDirty = true;
    this.uiDirty = true;
    window.clearTimeout(this.thumbTimer);
    this.thumbTimer = window.setTimeout(() => this.drawThumbs(), 180);
    if (markDirty) {
      this.dirty = true;
      window.clearTimeout(this.backupTimer);
      this.backupTimer = window.setTimeout(() => this.writeBackup(), 700);
    }
  }

  /** ein Befehl als ein Schritt im Arbeitsverlauf */
  private edit(fn: () => void): void {
    this.history.begin(this.nodes);
    fn();
    if (this.history.commit(this.nodes)) this.changed();
    else this.changed(false);
  }

  /** Spielblick als Kamera für „Bild halten“ und die Tiefengrenze */
  private gameView(): HoldView {
    const v = this.host.view.cameraView();
    return { cx: v.cx, cy: v.cy, D: viewState().persp ? this.host.world.camera.distance : Infinity, tilt: CAMERA_TILT };
  }

  /** Kamera, für die „Bild halten“ rechnet (immer der Spielblick), null bei „Welt halten“ */
  private holdView(): HoldView | null {
    return this.hold ? this.gameView() : null;
  }

  // ------------------------------------------------------------------ Bauen und Spielen

  private setBuilding(on: boolean): void {
    this.building = on;
    this.ui.setBuilding(on);
    this.host.setGameUi(!on);
    this.meshDirty = true;
    if (!on) {
      // das Spiel sieht immer den Spielblick
      this.views.setMode('game', 0, { min: 0, max: 0 });
      this.viewChoice = 'game';
      this.ui.setView('game');
      this.gesture = null;
      this.nav = null;
      this.pointers.clear();
    }
    this.uiDirty = true;
  }

  // ------------------------------------------------------------------ Bild

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.views.resize(w, h);
    this.overlay.handleSize = matchMedia('(pointer: coarse)').matches ? 16 : 9;
  }

  /** je Bild nach der Spielkamera: Ansicht stellen, Ebenen neu bauen, Griffe und Leisten nachführen */
  update(): void {
    this.views.update();
    if (this.meshDirty) {
      this.meshDirty = false;
      this.rebuildMesh();
    }
    const t = performance.now();
    this.fps.frames++;
    if (t - this.fps.t > 500) {
      this.fps.value = Math.round((this.fps.frames * 1000) / (t - this.fps.t));
      this.fps = { frames: 0, t, value: this.fps.value };
      this.uiDirty = true;
    }
    if (this.uiDirty) {
      this.uiDirty = false;
      this.refreshUi();
    }
    // Griffe wandern mit der Kamera: nur neu zeichnen, wenn sich Ansicht oder Auswahl bewegt haben
    const cam = this.views.camera;
    const key = `${cam.matrixWorld.elements.join(',')}|${this.width}x${this.height}`;
    if (key !== this.lastCam || this.gesture) {
      this.lastCam = key;
      this.drawOverlay();
    }
  }

  private rebuildMesh(): void {
    const active = this.plane;
    const show = (p: ZonePlane): boolean => {
      if (this.building && this.isolate === 'only') return p.id === this.active;
      if (p.hidden) return false;
      if (this.building && this.isolate === 'front' && active) return p.z >= active.z - 1e-6;
      return true;
    };
    this.host.world.planes.build(this.nodes, { showPlane: show });
    // Kein Boden mehr (Befund 16): sobald die Zone Ebenen hat, verschwindet der flache Boden des Levels
    this.host.world.setLevelGroundVisible(!this.nodes.some(isPlane));
    this.drawOverlay();
  }

  private refreshUi(): void {
    const planes = planesOf(this.nodes);
    const rows: LayerRow[] = planes.map((plane, i) => ({ plane, shapes: shapesOf(this.nodes, plane.id), gap: planes[i + 1] ? planes[i + 1].z - plane.z : null }));
    this.ui.setLayers(rows, this.active);
    this.ui.setContext(this.building ? (this.plane ?? null) : null, this.building ? (this.shape ?? null) : null, this.isolate);
    const st = this.host.world.planes.stats;
    const tris = st.triangles >= 1000 ? `${(st.triangles / 1000).toFixed(1).replace('.', ',')}k` : String(st.triangles);
    this.ui.setTop(this.dirty, this.history.canUndo, this.history.canRedo, `${planes.length} Ebenen · ${st.shapes} Formen · ${tris} Dreiecke · Welt: ${this.host.world.drawCalls} Draw Call${this.host.world.drawCalls === 1 ? '' : 's'} · ${this.fps.value} fps`);
  }

  /** Vorschaubilder der Ebenen: Formen in ihrer Farbe, eingepasst */
  private drawThumbs(): void {
    for (const plane of planesOf(this.nodes)) {
      const c = this.ui.thumb(plane.id);
      const g = c?.getContext('2d');
      if (!c || !g) continue;
      g.clearRect(0, 0, c.width, c.height);
      const shapes = shapesOf(this.nodes, plane.id).filter((s) => !s.hidden);
      if (!shapes.length) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const s of shapes) {
        const b = shapeBounds(s);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }
      const k = Math.min((c.width - 8) / Math.max(1e-3, maxX - minX), (c.height - 8) / Math.max(1e-3, maxY - minY));
      const ox = (c.width - (maxX - minX) * k) / 2;
      const oy = (c.height - (maxY - minY) * k) / 2;
      for (const s of shapes) {
        const { outline, holes } = shapeLocalPolys(s);
        const path = new Path2D();
        for (const ring of [outline, ...holes]) {
          ring.forEach(([px, py], i) => {
            const q = shapeToPlane(s, px, py);
            const x = ox + (q.x - minX) * k;
            const y = c.height - (oy + (q.y - minY) * k);
            if (i === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
          });
          path.closePath();
        }
        g.fillStyle = s.fill;
        g.fill(path, 'evenodd');
      }
    }
  }

  /** Bildpunkt eines Ebenen-Punkts in der aktuellen Ansicht */
  private screenOf(plane: ZonePlane, q: Pt, shape?: ZoneShape): Pt | null {
    const w = planeToWorld(plane, q.x, q.y);
    const rank = shape ? shapesOf(this.nodes, plane.id).indexOf(shape) * 0.003 : 0;
    return this.views.toScreen(w.x, w.y, -plane.z + rank);
  }

  /** Rahmen der gewählten Form in Ebenen-Koordinaten: vier Ecken, dann vier Kantenmitten */
  private handlePoints(s: ZoneShape): Pt[] {
    const b = shapeBounds(s);
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    return [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
      { x: mx, y: b.minY },
      { x: b.maxX, y: my },
      { x: mx, y: b.maxY },
      { x: b.minX, y: my },
    ];
  }

  private drawOverlay(): void {
    const st: OverlayState = { outlines: [], box: null, handles: [], preview: null };
    if (this.building) {
      const s = this.shape;
      const p = s ? findPlane(this.nodes, s.parent) : undefined;
      if (s && p) {
        const { outline } = shapeLocalPolys(s);
        const ring = outline.map(([x, y]) => this.screenOf(p, shapeToPlane(s, x, y), s)).filter((q): q is Pt => !!q);
        st.outlines.push(ring);
        const hp = this.handlePoints(s).map((q) => this.screenOf(p, q, s));
        if (hp.every((q) => !!q)) {
          st.box = (hp as Pt[]).slice(0, 4);
          st.handles = s.locked || p.locked ? [] : (hp as Pt[]);
        }
      }
      const g = this.gesture;
      if (g?.kind === 'create') {
        const plane = findPlane(this.nodes, g.plane);
        if (plane) {
          const { a, b } = this.createBox(g);
          const local = g.shape === 'rect' ? rectPath(b.x - a.x || 0.01, b.y - a.y || 0.01) : ellipsePath(Math.max(0.01, (b.x - a.x) / 2), Math.max(0.01, (b.y - a.y) / 2));
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const tmp: ZoneShape = { id: '_', kind: 'shape', parent: plane.id, order: 0, name: '', x: cx, y: cy, sx: 1, sy: 1, path: local, fill: '#000000' };
          st.preview = shapeLocalPolys(tmp).outline.map(([x, y]) => this.screenOf(plane, { x: cx + x, y: cy + y })).filter((q): q is Pt => !!q);
        }
      }
    }
    this.overlay.draw(st);
  }

  // ------------------------------------------------------------------ Bedienfelder

  private actions(): ConstructorParameters<typeof EditorUi>[0] {
    return {
      tool: (t) => this.setTool(t),
      view: (v) => this.setView(v),
      undo: () => this.undo(),
      redo: () => this.redo(),
      save: () => void this.save(),
      toggleBuild: () => this.setBuilding(!this.building),
      addPlane: () => this.addPlane(),
      selectPlane: (id) => {
        this.active = id;
        this.selected = null;
        this.meshDirty = this.isolate !== 'off';
        this.uiDirty = true;
        this.drawOverlay();
      },
      togglePlaneHidden: (id) => this.edit(() => {
        const p = findPlane(this.nodes, id);
        if (p) p.hidden = !p.hidden || undefined;
      }),
      togglePlaneLocked: (id) => this.edit(() => {
        const p = findPlane(this.nodes, id);
        if (p) p.locked = !p.locked || undefined;
        if (p?.locked && this.shape?.parent === id) this.selected = null;
      }),
      renamePlane: (id, name) => this.edit(() => {
        const p = findPlane(this.nodes, id);
        if (p) p.name = name;
      }),
      gapStart: () => this.beginDrag(),
      gapChange: (frontId, gap) => {
        this.restoreDragBase();
        setGapBehind(this.nodes, frontId, gap, this.holdView());
        this.clampDepths();
        this.changed();
      },
      gapEnd: () => this.endDrag(),
      depthStart: (id) => {
        this.active = id;
        this.beginDrag();
      },
      depthChange: (id, z) => {
        this.restoreDragBase();
        const p = findPlane(this.nodes, id);
        if (p) movePlaneDepth(p, z, this.holdView());
        this.clampDepths();
        this.changed();
      },
      depthEnd: () => this.endDrag(),
      toggleHold: () => {
        this.hold = !this.hold;
        this.ui.setHold(this.hold);
        this.ui.toast(this.hold ? 'Bild halten: Abstände ändern die Tiefe, das Bild im Spielblick bleibt' : 'Welt halten: Ebenen behalten ihre Größe in Metern');
      },
      setRole: (role) => this.edit(() => {
        const p = this.plane;
        if (p) p.role = role;
      }),
      setIsolate: (i) => {
        this.isolate = i;
        this.meshDirty = true;
        this.uiDirty = true;
      },
      deletePlane: () => this.deletePlane(),
      fill: (color) => this.edit(() => {
        const s = this.shape;
        if (s) s.fill = color;
      }),
      duplicate: () => this.duplicate(),
      orderShape: (dir) => this.orderShape(dir),
      deleteShape: () => this.deleteShape(),
      tilt: (deg) => {
        this.host.cameraPanel?.setTilt(deg);
        this.syncCameraUi();
      },
      fov: (deg) => {
        this.host.cameraPanel?.setFov(deg);
        this.syncCameraUi();
      },
      addProbe: () => {
        this.edit(() => {
          this.nodes = slicesToNodes(buildSliceStack(this.zone.width), this.nodes);
          this.zone.nodes = this.nodes;
        });
        this.ui.toast('Scheiben-Stapel der Kamerasession eingefügt (Platzhalter-Formen, Last für die Handy-Messung)');
      },
      restore: () => this.restoreBackup(),
      discardBackup: () => {
        this.clearBackup();
        this.ui.showBanner(null);
      },
    };
  }

  private syncCameraUi(): void {
    this.ui.setCamera(CAMERA_TILT / DEG, viewState().fov);
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.ui.setTool(t);
    this.host.surface.style.cursor = t === 'select' ? '' : 'crosshair';
  }

  private setView(v: ViewMode | 'side'): void {
    const zs = planesOf(this.nodes).map((p) => p.z);
    this.views.setMode(v === 'side' ? 'side' : v, this.plane?.z ?? 0, { min: Math.min(0, ...zs), max: Math.max(0, ...zs) });
    this.viewChoice = v;
    this.ui.setView(v);
    if (v !== 'game' && this.tool !== 'select' && v !== 'front') this.setTool('select');
    this.drawOverlay();
  }

  private beginDrag(): void {
    this.history.begin(this.nodes);
    this.dragBase = new Map(planesOf(this.nodes).map((p) => [p.id, { z: p.z, x: p.x, y: p.y, scale: p.scale }]));
  }

  private restoreDragBase(): void {
    if (!this.dragBase) return;
    for (const p of planesOf(this.nodes)) {
      const b = this.dragBase.get(p.id);
      if (b) Object.assign(p, b);
    }
  }

  private endDrag(): void {
    this.dragBase = null;
    if (this.history.commit(this.nodes)) this.changed();
    this.uiDirty = true;
  }

  /** keine Ebene vor die Kamera des Spielblicks schieben (dort hätte sie kein Bild) */
  private clampDepths(): void {
    const near = nearestDepth(this.gameView());
    for (const p of planesOf(this.nodes)) if (p.z < near) p.z = near;
  }

  private addPlane(): void {
    this.edit(() => {
      const p = newPlane(this.nodes, depthBeside(this.nodes, this.active, 'back'));
      this.nodes.push(p);
      this.active = p.id;
      this.selected = null;
    });
  }

  private deletePlane(): void {
    const p = this.plane;
    if (!p) return;
    const planes = planesOf(this.nodes);
    const i = planes.indexOf(p);
    this.edit(() => {
      this.nodes = this.nodes.filter((n) => n.id !== p.id && !(n.kind === 'shape' && n.parent === p.id));
      this.zone.nodes = this.nodes;
      this.active = (planes[i + 1] ?? planes[i - 1])?.id ?? null;
      this.selected = null;
    });
    this.ui.toast(`${p.name} gelöscht (rückgängig mit Cmd+Z oder zwei Fingern)`);
  }

  private duplicate(): void {
    const s = this.shape;
    if (!s) return;
    this.edit(() => {
      const copy: ZoneShape = { ...cloneNodes([s])[0], id: nextNodeId(this.nodes, 's') } as ZoneShape;
      copy.name = `${s.name} Kopie`;
      copy.x += 1;
      copy.y -= 1;
      copy.order = shapesOf(this.nodes, s.parent).reduce((m, x) => Math.max(m, x.order), 0) + 1;
      this.nodes.push(copy);
      this.selected = copy.id;
    });
  }

  private orderShape(dir: 1 | -1): void {
    const s = this.shape;
    if (!s) return;
    const list = shapesOf(this.nodes, s.parent);
    const i = list.indexOf(s);
    const other = list[i + dir];
    if (!other) return;
    this.edit(() => {
      const o = s.order;
      s.order = other.order;
      other.order = o;
    });
  }

  private deleteShape(): void {
    const s = this.shape;
    if (!s) return;
    this.edit(() => {
      this.nodes = this.nodes.filter((n) => n.id !== s.id);
      this.zone.nodes = this.nodes;
      this.selected = null;
    });
  }

  private undo(): void {
    const prev = this.history.undo(this.nodes);
    if (prev) this.setNodes(prev);
    else this.ui.toast('Nichts zum Rückgängigmachen');
  }

  private redo(): void {
    const next = this.history.redo(this.nodes);
    if (next) this.setNodes(next);
  }

  // ------------------------------------------------------------------ Sichern

  private async save(): Promise<void> {
    this.zone.nodes = this.nodes;
    const ok = await saveZone(this.zone);
    if (ok) {
      this.lastSaveAt = performance.now();
      this.dirty = false;
      this.clearBackup();
      this.ui.toast('Gesichert');
    } else this.ui.toast('Sichern ging nicht: läuft der Dev-Server am Mac?');
    this.uiDirty = true;
  }

  private writeBackup(): void {
    if (!this.dirty) return;
    try {
      localStorage.setItem(BACKUP_KEY(this.zone.name), JSON.stringify({ t: Date.now(), nodes: serializeNodes(this.nodes) }));
    } catch {
      /* Speicher voll oder gesperrt: dann eben ohne Sicherungskopie */
    }
  }

  private clearBackup(): void {
    try {
      localStorage.removeItem(BACKUP_KEY(this.zone.name));
    } catch {
      /* ignore */
    }
  }

  private readBackup(): { t: number; nodes: ZoneNode[] } | null {
    try {
      const raw = localStorage.getItem(BACKUP_KEY(this.zone.name));
      if (!raw) return null;
      const o = JSON.parse(raw) as { t?: number; nodes?: unknown };
      return { t: Number(o.t) || 0, nodes: parseNodes(o.nodes) };
    } catch {
      return null;
    }
  }

  /** beim Start: liegt eine Sicherungskopie vor, die von der Datei abweicht, wird sie angeboten */
  private checkBackup(): void {
    const b = this.readBackup();
    if (!b) return;
    if (JSON.stringify(serializeNodes(b.nodes)) === JSON.stringify(serializeNodes(this.nodes))) {
      this.clearBackup();
      return;
    }
    const time = new Date(b.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    this.ui.showBanner(`Ungesicherte Änderungen von ${time} gefunden`);
  }

  private restoreBackup(): void {
    const b = this.readBackup();
    this.ui.showBanner(null);
    if (!b) return;
    this.history.begin(this.nodes);
    this.setNodes(b.nodes);
    this.history.commit(this.nodes);
    this.dirty = true;
    this.ui.toast('Wiederhergestellt; Sichern schreibt es in die Datei');
  }

  /** die Datei wurde auf der Platte geändert (zweite Sitzung, von Hand): ohne eigene Änderungen neu laden */
  private async reloadFromDisk(): Promise<void> {
    if (performance.now() - this.lastSaveAt < 2500) return;
    const z = await loadZone(this.zone.name);
    if (!z || this.destroyed) return;
    if (this.dirty) {
      this.ui.toast('Die Zonendatei wurde außen geändert; Sichern überschreibt sie');
      return;
    }
    this.history.reset();
    this.setNodes(z.nodes ?? []);
    this.dirty = false;
    this.ui.toast('Zonendatei neu geladen');
  }

  // ------------------------------------------------------------------ Eingabe

  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.host.surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private touches(): Array<[number, Pointer]> {
    return [...this.pointers].filter(([, p]) => p.type === 'touch');
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.building) return;
    e.stopPropagation();
    e.preventDefault();
    const p = this.local(e);
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType, sx: p.x, sy: p.y, t: performance.now(), moved: false });
    try {
      this.host.surface.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (e.pointerType === 'pen') this.penSeen = true;
    if (e.pointerType === 'touch') {
      const t = this.touches();
      if (t.length >= 2) {
        // zweiter Finger: was der erste begonnen hat, war Navigation
        this.cancelGesture();
        const [a, b] = [t[0][1], t[1][1]];
        this.nav = { kind: 'touch', ids: [t[0][0], t[1][0]], center: mid(a, b), dist: dist(a, b), count: t.length, t: Math.min(a.t, b.t), moved: false };
        return;
      }
      if (this.penSeen) return;
    }
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || this.spaceDown)) {
      this.nav = { kind: 'mouse', pointerId: e.pointerId, last: p, orbit: e.button === 2 && this.views.mode === 'free' };
      return;
    }
    this.toolDown(e.pointerId, p, e.shiftKey);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.building) return;
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.stopPropagation();
    e.preventDefault();
    const p = this.local(e);
    ptr.x = p.x;
    ptr.y = p.y;
    if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) ptr.moved = true;
    this.shiftDown = e.shiftKey;
    const nav = this.nav;
    if (nav?.kind === 'touch') {
      const a = this.pointers.get(nav.ids[0]);
      const b = this.pointers.get(nav.ids[1]);
      if (!a || !b) return;
      const c = mid(a, b);
      const d = dist(a, b);
      if (a.moved || b.moved) nav.moved = true;
      this.panView(c.x - nav.center.x, c.y - nav.center.y);
      if (nav.dist > 0 && d > 0) this.zoomView(c.x, c.y, d / nav.dist);
      nav.center = c;
      nav.dist = d;
      return;
    }
    if (nav?.kind === 'mouse' && nav.pointerId === e.pointerId) {
      if (nav.orbit) this.views.orbit(p.x - nav.last.x, p.y - nav.last.y);
      else this.panView(p.x - nav.last.x, p.y - nav.last.y);
      nav.last = p;
      return;
    }
    this.toolMove(e.pointerId, p);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.building) return;
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.stopPropagation();
    e.preventDefault();
    this.pointers.delete(e.pointerId);
    const nav = this.nav;
    if (nav?.kind === 'touch') {
      // Tippen mit zwei oder drei Fingern: rückgängig, wiederholen
      if (this.touches().length === 0) {
        const quick = performance.now() - nav.t < TAP_TIME + 120;
        if (quick && !nav.moved && e.type === 'pointerup') {
          if (nav.count >= 3) this.redo();
          else this.undo();
        }
        this.endNav();
      } else nav.count = Math.max(nav.count, this.touches().length + 1);
      return;
    }
    if (nav?.kind === 'mouse' && nav.pointerId === e.pointerId) {
      this.endNav();
      return;
    }
    if (e.type === 'pointercancel') this.cancelGesture();
    else this.toolUp(e.pointerId, this.local(e));
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.building) return;
    e.stopPropagation();
    e.preventDefault();
    const p = this.local(e);
    // Trackpad-Spreizen kommt als Rad mit Strg; die Maus dreht in Stufen
    const k = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomView(p.x, p.y, k);
  };

  private onContext = (e: Event): void => {
    if (!this.building) return;
    e.preventDefault();
    e.stopPropagation();
  };

  private onGesture = (e: Event): void => {
    if (this.building) e.preventDefault();
  };

  private panView(dx: number, dy: number): void {
    if (!dx && !dy) return;
    if (this.views.mode === 'game') {
      const cam = this.host.view.camera;
      cam.direct = true;
      cam.panBy(dx, dy);
    } else this.views.pan(dx, dy);
  }

  /** Schwenken vorbei: die Spielkamera folgt wieder weich ihrem Ziel */
  private endNav(): void {
    this.nav = null;
    this.host.view.camera.direct = false;
  }

  private zoomView(x: number, y: number, k: number): void {
    if (Math.abs(k - 1) < 1e-4) return;
    if (this.views.mode === 'game') this.host.view.camera.zoomAt(x, y, k);
    else this.views.zoomAt(x, y, k);
  }

  private cancelGesture(): void {
    if (!this.gesture) return;
    const before = this.history.cancel();
    if (before && this.gesture.kind !== 'create' && this.gesture.kind !== 'empty') this.setNodes(before);
    this.gesture = null;
    this.drawOverlay();
  }

  /** Punkt der Ebene unter dem Bildpunkt (Ebenen-Koordinaten) */
  private planePoint(plane: ZonePlane, p: Pt): Pt | null {
    const w = this.views.pointOnDepth(p.x, p.y, plane.z);
    return w ? worldToPlane(plane, w.x, w.y) : null;
  }

  private toolDown(pointerId: number, p: Pt, shift: boolean): void {
    this.shiftDown = shift;
    if (this.tool !== 'select' && this.views.mode !== 'free') {
      let plane = this.plane;
      this.history.begin(this.nodes);
      if (!plane || plane.locked) {
        if (!plane) {
          plane = newPlane(this.nodes, 0);
          this.nodes.push(plane);
          this.active = plane.id;
          this.changed();
        } else {
          this.history.cancel();
          this.ui.toast('Die aktive Ebene ist gesperrt');
          return;
        }
      }
      const a = this.planePoint(plane, p);
      if (!a) {
        this.history.cancel();
        return;
      }
      this.gesture = { kind: 'create', pointerId, plane: plane.id, shape: this.tool === 'rect' ? 'rect' : 'ellipse', a, b: a };
      return;
    }
    // Auswahl: zuerst die Griffe der gewählten Form, dann Formen unter dem Strahl
    const s = this.shape;
    const sp = s ? findPlane(this.nodes, s.parent) : undefined;
    if (s && sp && !s.locked && !sp.locked) {
      const hits = this.handlePoints(s).map((q) => this.screenOf(sp, q, s));
      const r = this.overlay.handleSize + 6;
      const i = hits.findIndex((q) => q && Math.hypot(q.x - p.x, q.y - p.y) <= r);
      const at = this.planePoint(sp, p);
      if (i >= 0 && at) {
        const pts = this.handlePoints(s);
        this.history.begin(this.nodes);
        this.gesture = { kind: 'scale', pointerId, id: s.id, axis: AXIS[i], anchor: pts[OPPOSITE[i]], h0: pts[i], orig: { x: s.x, y: s.y, sx: s.sx, sy: s.sy } };
        return;
      }
    }
    const hit = this.host.world.planes.pick(this.views.rayAt(p.x, p.y), (id) => {
      const sh = findShape(this.nodes, id);
      const pl = sh ? findPlane(this.nodes, sh.parent) : undefined;
      return !!sh && !!pl && !sh.locked && !pl.locked;
    });
    const shape = hit ? findShape(this.nodes, hit.id) : undefined;
    const plane = shape ? findPlane(this.nodes, shape.parent) : undefined;
    if (shape && plane) {
      if (this.selected !== shape.id || this.active !== plane.id) {
        this.selected = shape.id;
        this.active = plane.id;
        this.uiDirty = true;
        if (this.isolate !== 'off') this.meshDirty = true;
      }
      const start = this.planePoint(plane, p);
      if (start) {
        this.history.begin(this.nodes);
        this.gesture = { kind: 'move', pointerId, id: shape.id, start, orig: { x: shape.x, y: shape.y } };
      }
      this.drawOverlay();
      return;
    }
    this.gesture = { kind: 'empty', pointerId, start: p, last: p, orbit: this.views.mode === 'free', moved: false };
  }

  private toolMove(pointerId: number, p: Pt): void {
    const g = this.gesture;
    if (!g || g.pointerId !== pointerId) return;
    if (g.kind === 'empty') {
      if (g.orbit) this.views.orbit(p.x - g.last.x, p.y - g.last.y);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_DIST) g.moved = true;
      g.last = p;
      return;
    }
    if (g.kind === 'create') {
      const plane = findPlane(this.nodes, g.plane);
      const b = plane ? this.planePoint(plane, p) : null;
      if (b) g.b = b;
      this.drawOverlay();
      return;
    }
    const s = findShape(this.nodes, g.id);
    const plane = s ? findPlane(this.nodes, s.parent) : undefined;
    const at = plane ? this.planePoint(plane, p) : null;
    if (!s || !at) return;
    if (g.kind === 'move') {
      s.x = g.orig.x + (at.x - g.start.x);
      s.y = g.orig.y + (at.y - g.start.y);
    } else {
      const ex = g.h0.x - g.anchor.x;
      const ey = g.h0.y - g.anchor.y;
      let kx = g.axis !== 'y' && Math.abs(ex) > 1e-6 ? (at.x - g.anchor.x) / ex : 1;
      let ky = g.axis !== 'x' && Math.abs(ey) > 1e-6 ? (at.y - g.anchor.y) / ey : 1;
      if (this.shiftDown && g.axis === 'xy') {
        const k = Math.max(Math.abs(kx), Math.abs(ky));
        kx = Math.sign(kx || 1) * k;
        ky = Math.sign(ky || 1) * k;
      }
      const clampK = (k: number) => (Math.abs(k) < 0.02 ? 0.02 * Math.sign(k || 1) : k);
      kx = clampK(kx);
      ky = clampK(ky);
      s.sx = g.orig.sx * kx;
      s.sy = g.orig.sy * ky;
      s.x = g.anchor.x + (g.orig.x - g.anchor.x) * kx;
      s.y = g.anchor.y + (g.orig.y - g.anchor.y) * ky;
    }
    this.changed();
  }

  private toolUp(pointerId: number, p: Pt): void {
    const g = this.gesture;
    if (!g || g.pointerId !== pointerId) return;
    this.gesture = null;
    if (g.kind === 'empty') {
      // Tippen ins Leere hebt die Auswahl auf (die aktive Ebene bleibt); Kreisen in der freien Ansicht nicht
      if (!g.moved && this.selected) {
        this.selected = null;
        this.uiDirty = true;
      }
      this.drawOverlay();
      return;
    }
    if (g.kind === 'create') {
      const plane = findPlane(this.nodes, g.plane);
      if (plane) {
        const { a, b } = this.createBox(g);
        let w = b.x - a.x;
        let h = b.y - a.y;
        let cx = (a.x + b.x) / 2;
        let cy = (a.y + b.y) / 2;
        // nur getippt: eine Form in Vorgabegröße (Meter im Bild etwa so groß wie ein Wagen mal drei)
        if (w < 0.3 && h < 0.3) {
          w = g.shape === 'rect' ? 10 : 9;
          h = 6;
          cx = g.a.x;
          cy = g.a.y;
        }
        const path = g.shape === 'rect' ? rectPath(Math.max(0.1, w), Math.max(0.1, h)) : ellipsePath(Math.max(0.05, w / 2), Math.max(0.05, h / 2));
        const s = newShape(this.nodes, plane.id, path, cx, cy, placeholderFill(plane.z));
        s.name = `${g.shape === 'rect' ? 'Rechteck' : 'Ellipse'} ${s.id.slice(1)}`;
        this.nodes.push(s);
        this.selected = s.id;
        this.active = plane.id;
      }
      if (this.history.commit(this.nodes)) this.changed();
      this.drawOverlay();
      return;
    }
    if (this.history.commit(this.nodes)) this.changed();
    else this.uiDirty = true;
    this.drawOverlay();
  }

  /** Rahmen einer aufgezogenen Form (mit Umschalt quadratisch bzw. kreisrund), a links unten, b rechts oben */
  private createBox(g: Extract<Gesture, { kind: 'create' }>): { a: Pt; b: Pt } {
    let dx = g.b.x - g.a.x;
    let dy = g.b.y - g.a.y;
    if (this.shiftDown) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m;
      dy = Math.sign(dy || 1) * m;
    }
    const x2 = g.a.x + dx;
    const y2 = g.a.y + dy;
    return { a: { x: Math.min(g.a.x, x2), y: Math.min(g.a.y, y2) }, b: { x: Math.max(g.a.x, x2), y: Math.max(g.a.y, y2) } };
  }

  // ------------------------------------------------------------------ Tasten

  private onKeyDown = (e: KeyboardEvent): void => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (typing) return;
    if (!this.building) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.setBuilding(true);
      }
      return;
    }
    // beim Bauen geht keine Taste ins Spiel (Leertaste würde sonst losfahren, Esc das Level verlassen)
    e.stopPropagation();
    const cmd = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    this.shiftDown = e.shiftKey;
    let handled = true;
    if (cmd && k === 'z') e.shiftKey ? this.redo() : this.undo();
    else if (cmd && k === 'y') this.redo();
    else if (cmd && k === 's') void this.save();
    else if (cmd && k === 'd') this.duplicate();
    else if (cmd) handled = false;
    else if (k === 'v') this.setTool('select');
    else if (k === 'm') this.setTool('rect');
    else if (k === 'l') this.setTool('ellipse');
    else if (k === 'u') this.setTool(this.tool === 'rect' ? 'ellipse' : 'rect');
    else if (k === '1') this.setView('game');
    else if (k === '2') this.setView('front');
    else if (k === '3') this.setView('free');
    else if (k === '4') this.setView('side');
    else if (k === 'tab') this.setBuilding(false);
    else if (k === ' ') this.spaceDown = true;
    else if (k === 'escape') {
      this.selected = null;
      this.uiDirty = true;
      this.drawOverlay();
    } else if (k === 'delete' || k === 'backspace') this.deleteShape();
    else if (k === ']') this.orderShape(1);
    else if (k === '[') this.orderShape(-1);
    else if (k.startsWith('arrow') && this.shape) {
      const step = e.shiftKey ? 1 : 0.1;
      const s = this.shape;
      this.edit(() => {
        if (k === 'arrowleft') s.x -= step;
        if (k === 'arrowright') s.x += step;
        if (k === 'arrowup') s.y += step;
        if (k === 'arrowdown') s.y -= step;
      });
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') this.spaceDown = false;
    this.shiftDown = e.shiftKey;
    if (this.building && !(e.target instanceof HTMLInputElement)) e.stopPropagation();
  };

  destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.thumbTimer);
    window.clearTimeout(this.backupTimer);
    this.writeBackup();
    const s = this.host.surface;
    s.removeEventListener('pointerdown', this.onDown, true);
    s.removeEventListener('pointermove', this.onMove, true);
    s.removeEventListener('pointerup', this.onUp, true);
    s.removeEventListener('pointercancel', this.onUp, true);
    s.removeEventListener('wheel', this.onWheel, true);
    s.removeEventListener('contextmenu', this.onContext, true);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    document.removeEventListener('gesturestart', this.onGesture);
    s.style.cursor = '';
    this.host.world.viewCamera = null;
    this.host.world.viewFog = null;
    this.ui.destroy();
  }
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
