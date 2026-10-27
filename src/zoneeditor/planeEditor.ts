/**
 * Zonen-Editor, Stufe 1 und 2 (docs/ZONENEDITOR-PLAN.md, Abschnitt 6): Gerüst, Ebenen, Kamera; Formen mit Zeichenstift,
 * Direktauswahl, Formpinsel und Messer (src/zoneeditor/pathTools.ts), Kopieren über Ebenen, Spiegeln, SVG-Austausch.
 * Hängt sich wie der Klötzchen-Editor in die Level-Szene einer Zone (`?zone=<name>&editor=2`) und nutzt deren
 * Weltrenderer und Spielkamera, so zeigt er genau das Bild des Spiels. Bauen: Der Editor nimmt Zeiger und Tasten
 * (Werkzeuge, Ebenen, Ansichten); Spielen: Das Level bekommt alles wie sonst (Tab oder der Knopf oben rechts).
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
import { loadZone, onZoneChange, saveZone, uploadZoneFile } from '@/zone/io';
import type { ZoneFile } from '@/zone/types';
import { buildSliceStack } from '@/zone/slices';
import { flattenPath, type ZonePath } from '@/zone/path';
import { planesToSvg, slug, svgToPlanes } from '@/zone/svgPlanes';
import { depthLimits, groupPlanes, normalizeGroups, reorderPlanes, ungroup } from '@/zone/planeGroups';
import { alignShapes, distributeShapes, rotateShape, unionBounds, type AlignMode } from '@/zone/shapeOps';
import { copyGroups, expandToUnits, groupMembersOf, groupShapes, inContext, moveUnit, nextGroupId, normalizeShapeGroups, renumberOrder, ungroupShapes, unitKey, unitShapes, type GroupContext } from '@/zone/shapeGroups';
import {
  cloneNodes,
  depthBeside,
  archPath,
  ellipsePath,
  facePaint,
  findPlane,
  findShape,
  flipShape,
  isPlane,
  movePlaneDepth,
  nearestDepth,
  newPlane,
  newShape,
  nextNodeId,
  parseNodes,
  placeholderFill,
  planePathToShape,
  planesOf,
  findGroup,
  groupMembers,
  sketchesOf,
  type ZoneSketch,
  groupOf,
  planeHidden,
  planeLocked,
  planeToWorld,
  rectPath,
  serializeNodes,
  setGapBehind,
  shapeBounds,
  shapeFromPlanePath,
  shapeFaces,
  shapeLocalPolys,
  shapesOf,
  shapeToPlane,
  slicesToNodes,
  styleMap,
  swatchMap,
  transferShape,
  worldToPlane,
  type HoldView,
  type ZoneNode,
  type ZonePlane,
  type ZoneShape,
} from '@/zone/nodes';
import { History } from './history';
import { EditorOverlay, emptyOverlay } from './overlay';
import { SketchLayer } from './sketches';
import { constrain45, NO_MODS, PathTools, regionRing, regionTest, simplifyShape, type Mods, type PathTool } from './pathTools';
import { booleanShapes, type BoolOp } from '@/zone/pathfinder';
import { evalLayers, paintLayers, rgbToHex } from '@/zone/paint';
import { faceBox } from '@/zone/faces';
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
  /** gewählte Formen verschieben: jede rechnet den Weg des Zeigers in ihrer eigenen Ebene */
  | { kind: 'move'; pointerId: number; start: Pt; orig: Map<string, Pt>; tap: string | null }
  /** gewählte Formen einer Ebene um die Mitte ihres Rahmens drehen (Winkel in Ebenen-Koordinaten, vom Anfang aus) */
  | { kind: 'rotate'; pointerId: number; plane: string; pivot: Pt; a0: number; angle: number; orig: Map<string, ZoneShape> }
  /** gewählte Formen einer Ebene am gemeinsamen Rahmen skalieren */
  | { kind: 'scale'; pointerId: number; plane: string; axis: 'xy' | 'x' | 'y'; anchor: Pt; h0: Pt; orig: Map<string, { x: number; y: number; sx: number; sy: number }> }
  | { kind: 'create'; pointerId: number; plane: string; shape: 'rect' | 'ellipse' | 'arch'; a: Pt; b: Pt }
  /** Skizze anpassen: verschieben (innen) oder an einer Ecke gleichmäßig skalieren (die Ecke gegenüber bleibt) */
  | { kind: 'sketchMove'; pointerId: number; id: string; start: Pt; orig: Pt }
  | { kind: 'sketchScale'; pointerId: number; id: string; anchor: Pt; h0: Pt; orig: { x: number; y: number; w: number; h: number } }
  /** ins Leere: ziehen wählt im Rechteck (in der freien Ansicht: umkreisen), tippen hebt die Auswahl auf */
  | { kind: 'empty'; pointerId: number; start: Pt; last: Pt; orbit: boolean; moved: boolean; add: boolean };

type Nav = { kind: 'touch'; ids: [number, number]; center: Pt; dist: number; count: number; t: number; moved: boolean } | { kind: 'mouse'; pointerId: number; last: Pt; orbit: boolean };

/** Ecken und Kantenmitten des Auswahlrahmens: Gegenstück und Achse je Griff */
const OPPOSITE = [2, 3, 0, 1, 6, 7, 4, 5];
const AXIS: Array<'xy' | 'x' | 'y'> = ['xy', 'xy', 'xy', 'xy', 'y', 'x', 'y', 'x'];
const BACKUP_KEY = (zone: string) => `tc.zoneeditor.${zone}`;
const DEG = Math.PI / 180;
const TAP_TIME = 260;
const TAP_DIST = 12;
const PATH_TOOLS: readonly Tool[] = ['direct', 'lasso', 'pen', 'curve', 'brush', 'band', 'knife'];
const isPathTool = (t: Tool): t is PathTool => PATH_TOOLS.includes(t);

const fmtDeg = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');

/** Pfad einer Grundform im Rahmen w × h um den Ursprung */
function primitivePath(kind: 'rect' | 'ellipse' | 'arch', w: number, h: number): ZonePath {
  if (kind === 'rect') return rectPath(w, h);
  if (kind === 'arch') return archPath(w, h);
  return ellipsePath(w / 2, h / 2);
}

export class PlaneEditor {
  private nodes: ZoneNode[];
  private active: string | null = null;
  /** in der Liste gewählte Ebenen (Umschalt, Befehlstaste, nach rechts wischen); die aktive gehört immer dazu */
  private planeSel: string[] = [];
  /** gewählte Formen, die zuletzt gewählte (Leiste, Griffe) am Ende */
  private selection: string[] = [];
  /** in der Liste gewählte Gruppe (dann sind ihre Ebenen gewählt) */
  private groupSel: string | null = null;
  /** Formgruppen, in die man doppelt tippend hineingegangen ist (von außen nach innen; leer = oberste Stufe) */
  private inGroup: string[] = [];
  /** letzter Treffer der Auswahl (doppelt tippen geht in eine Gruppe) */
  private lastPick: { id: string; t: number; x: number; y: number } | null = null;
  private tool: Tool = 'select';
  private isolate: Isolate = 'off';
  private hold = true;
  /** Skizzen als Pause-Ebenen; die gerade angepasst wird (Rahmen mit Ecken) */
  private readonly sketches = new SketchLayer();
  private sketchEdit: string | null = null;
  /** Einrasten an Ankern und Kanten im Bild; Raster der aktiven Ebene */
  private snapOn = true;
  private gridOn = false;
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
  private readonly paths: PathTools;
  /** kopierte Formen mit ihren Ebenen beim Kopieren (Einfügen in eine andere Ebene hält das Bild) */
  private clip: Array<{ shape: ZoneShape; from: ZonePlane }> = [];
  /** Formgruppen, die beim Kopieren ganz dabei waren (die Kopie wird eine eigene Gruppe) */
  private clipWhole = new Set<string>();
  /** Rang jeder Form in ihrer Ebene (Tiefenversatz der Griffe), nach jeder Änderung neu */
  private ranks: Map<string, number> | null = null;
  /** gedrückte Tasten (Befehl, Wahl, Umschalt) für Zeiger, Zeichenstift und Mauszeiger */
  private mods: Mods = NO_MODS;
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
    host.world.scene.add(this.sketches.group);
    this.paths = new PathTools({
      nodes: () => this.nodes,
      activePlane: () => this.plane,
      selectedShapes: () => this.selectedShapes(),
      setSelection: (ids) => this.setSelection(ids),
      regionPlanes: () => this.regionPlanes(),
      planePoint: (plane, p) => this.planePoint(plane, p),
      screenOf: (plane, q, shape) => this.screenOf(plane, q, shape),
      pick: (p) => this.pickShape(p),
      begin: () => this.history.begin(this.nodes),
      commit: () => {
        if (this.history.commit(this.nodes)) this.changed();
        else this.changed(false);
      },
      cancel: () => this.cancelEdit(),
      changed: () => this.changed(),
      redraw: () => {
        this.uiDirty = true;
        this.drawOverlay();
      },
      toast: (m) => this.ui.toast(m),
      ensurePlane: () => {
        let p = this.plane;
        if (!p) {
          p = newPlane(this.nodes, 0);
          this.nodes.push(p);
          this.active = p.id;
          this.changed();
        }
        return p;
      },
      addShape: (s) => {
        s.order = shapesOf(this.nodes, s.parent).reduce((m, x) => Math.max(m, x.order), 0) + 1;
        this.nodes.push(s);
      },
      fillFor: (plane) => placeholderFill(plane.z),
      hitRadius: () => this.overlay.handleSize + 6,
      snapping: () => this.snapOn,
      gridStep: (plane) => (this.gridOn ? this.gridStep(plane) : null),
      visible: (plane) => this.planeShown(plane),
    });
    this.ui = new EditorUi(this.actions(), zone.name, this.overlay.el);
    this.ui.setTool(this.tool);
    this.ui.setView(this.viewChoice);
    this.ui.setHold(this.hold);
    this.ui.setSnap(this.snapOn, this.gridOn);
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

  /** zuletzt gewählte Form (Leiste, Griffe, Reihenfolge) */
  private get selected(): string | null {
    return this.selection.at(-1) ?? null;
  }

  /** eine Form allein wählen (null: keine), ohne die Ebene zu wechseln */
  private set selected(id: string | null) {
    this.selection = id ? [id] : [];
  }

  private get shape(): ZoneShape | undefined {
    return findShape(this.nodes, this.selected);
  }

  private selectedShapes(): ZoneShape[] {
    return this.selection.map((id) => findShape(this.nodes, id)).filter((s): s is ZoneShape => !!s);
  }

  /** Kontext einer Form: die betretene Gruppe, wenn sie darin liegt, sonst die oberste Stufe */
  private ctxOf(s: ZoneShape): GroupContext {
    return inContext(s, this.inGroup) ? this.inGroup : [];
  }

  /** Einheiten der Auswahl (eine Gruppe oder eine Form, je mit ihren gewählten Formen), hinten zuerst */
  private selectedUnits(): ZoneShape[][] {
    const units = new Map<string, ZoneShape[]>();
    for (const s of this.selectedShapes()) {
      const key = `${s.parent}|${unitKey(s, this.ctxOf(s))}`;
      const u = units.get(key);
      if (u) u.push(s);
      else units.set(key, [s]);
    }
    return [...units.values()].map((u) => u.sort((a, b) => a.order - b.order)).sort((a, b) => a[0].order - b[0].order);
  }

  /** gewählte Formen nach Gruppen: wie viele Einheiten, davon ganze Gruppen, und ob man in einer Gruppe ist */
  private groupInfo(): { units: number; groups: number; inside: boolean } {
    const units = this.selectedUnits();
    const groups = units.filter((u) => {
      const key = unitKey(u[0], this.ctxOf(u[0]));
      return key !== u[0].id && groupMembersOf(this.nodes, key).length === u.length;
    }).length;
    return { units: units.length, groups, inside: this.inGroup.length > 0 };
  }

  /** gewählte Ebenen in der Reihenfolge der Liste (mindestens die aktive; bei einer gewählten Gruppe ihre Ebenen) */
  private selectedPlanes(): ZonePlane[] {
    if (this.groupSel) {
      const members = groupMembers(this.nodes, this.groupSel);
      if (members.length) return members;
    }
    const ids = new Set(this.planeSel.length ? this.planeSel : this.active ? [this.active] : []);
    if (this.active) ids.add(this.active);
    return planesOf(this.nodes).filter((p) => ids.has(p.id));
  }

  /** Ebenen, in denen Rechteck und Lasso wählen: die gewählten */
  private regionPlanes(): ZonePlane[] {
    return this.selectedPlanes();
  }

  private setNodes(nodes: ZoneNode[]): void {
    this.nodes = nodes;
    this.zone.nodes = nodes;
    this.ranks = null;
    this.selection = this.selection.filter((id) => findShape(nodes, id));
    if (!findPlane(nodes, this.active)) this.active = this.shape?.parent ?? planesOf(nodes)[0]?.id ?? null;
    this.planeSel = this.planeSel.filter((id) => findPlane(nodes, id));
    this.changed();
  }

  /** nach jeder Änderung: neu zeichnen, Liste und Leisten nachführen, Sicherungskopie planen */
  private changed(markDirty = true): void {
    // Gruppen bleiben Läufe benachbarter Ebenen; leere fallen weg
    const norm = normalizeGroups(this.nodes);
    if (norm.length !== this.nodes.length) {
      this.nodes = norm;
      this.zone.nodes = norm;
    }
    if (this.groupSel && !findGroup(this.nodes, this.groupSel)) this.groupSel = null;
    normalizeShapeGroups(this.nodes);
    const alive = this.inGroup.findIndex((g) => groupMembersOf(this.nodes, g).length < 2);
    if (alive >= 0) this.inGroup = this.inGroup.slice(0, alive);
    this.meshDirty = true;
    this.uiDirty = true;
    this.ranks = null;
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

  /** Arbeitsschritt verwerfen: den Stand vom Beginn wiederherstellen, wenn sich etwas geändert hat */
  private cancelEdit(): void {
    const before = this.history.cancel();
    if (before && JSON.stringify(serializeNodes(before)) !== JSON.stringify(serializeNodes(this.nodes))) this.setNodes(before);
  }

  /**
   * Auswahl der Formen ersetzen (leer: keine); die Ebene der letzten wird die aktive. Liegt sie nicht unter den gewählten
   * Ebenen, ist sie danach allein gewählt
   */
  private setSelection(ids: readonly string[]): void {
    this.selection = ids.filter((id, i) => ids.indexOf(id) === i && findShape(this.nodes, id));
    const last = this.shape;
    if (last && this.active !== last.parent) {
      this.active = last.parent;
      if (this.isolate !== 'off') this.meshDirty = true;
    }
    if (last && this.planeSel.length && !this.planeSel.includes(last.parent)) this.planeSel = [last.parent];
    this.paths.selectionChanged(this.selection);
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** vorderste Form unter dem Bildpunkt, die nicht gesperrt ist */
  private pickShape(p: Pt): { id: string; face: number } | null {
    return this.host.world.planes.pick(this.views.rayAt(p.x, p.y), (id) => {
      const sh = findShape(this.nodes, id);
      const pl = sh ? findPlane(this.nodes, sh.parent) : undefined;
      return !!sh && !!pl && !sh.locked && !planeLocked(this.nodes, pl);
    });
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
      // ein laufender Pfad wird beendet; das Spiel sieht immer den Spielblick
      this.paths.setTool(null);
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

  /** wird die Ebene gerade gezeichnet? (ausgeblendet, isoliert) */
  private planeShown(p: ZonePlane): boolean {
    const active = this.plane;
    if (this.building && this.isolate === 'only') return p.id === this.active;
    if (planeHidden(this.nodes, p)) return false;
    if (this.building && this.isolate === 'front' && active) return p.z >= active.z - 1e-6;
    return true;
  }

  /** Rasterweite der Ebene: die kleinste aus 0,25 · 2ⁿ bzw. 5er-Stufen, die im Bild mindestens 18 Bildpunkte weit ist */
  private gridStep(plane: ZonePlane): number {
    const c = { x: this.width / 2, y: this.height / 2 };
    const q0 = this.planePoint(plane, c);
    const q1 = this.planePoint(plane, { x: c.x + 10, y: c.y });
    const mpp = q0 && q1 ? Math.hypot(q1.x - q0.x, q1.y - q0.y) / 10 : 0.1;
    return [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100].find((s) => s / mpp >= 18) ?? 100;
  }

  /** Rasterlinien der aktiven Ebene im sichtbaren Ausschnitt (Bildpunkte) */
  private gridLines(): Array<[Pt, Pt]> {
    const plane = this.plane;
    if (!this.gridOn || !plane) return [];
    const corners = [
      { x: 0, y: 0 },
      { x: this.width, y: 0 },
      { x: this.width, y: this.height },
      { x: 0, y: this.height },
    ].map((q) => this.planePoint(plane, q));
    if (corners.some((q) => !q)) return [];
    const xs = corners.map((q) => q!.x);
    const ys = corners.map((q) => q!.y);
    const step = this.gridStep(plane);
    const x0 = Math.floor(Math.min(...xs) / step) * step;
    const x1 = Math.max(...xs);
    const y0 = Math.floor(Math.min(...ys) / step) * step;
    const y1 = Math.max(...ys);
    if ((x1 - x0) / step > 400 || (y1 - y0) / step > 400) return [];
    const out: Array<[Pt, Pt]> = [];
    const seg = (a: Pt, b: Pt) => {
      const sa = this.screenOf(plane, a);
      const sb = this.screenOf(plane, b);
      if (sa && sb) out.push([sa, sb]);
    };
    for (let x = x0; x <= x1; x += step) seg({ x, y: y0 }, { x, y: y1 });
    for (let y = y0; y <= y1; y += step) seg({ x: x0, y }, { x: x1, y });
    return out;
  }

  private rebuildMesh(): void {
    this.host.world.planes.build(this.nodes, { showPlane: (p) => this.planeShown(p) });
    this.sketches.update(this.nodes, this.building, (id) => {
      const p = findPlane(this.nodes, id);
      return !!p && this.planeShown(p);
    });
    // Kein Boden mehr (Befund 16): sobald die Zone Ebenen hat, verschwindet der flache Boden des Levels
    this.host.world.setLevelGroundVisible(!this.nodes.some(isPlane));
    this.drawOverlay();
  }

  private refreshUi(): void {
    const planes = planesOf(this.nodes);
    const rows: LayerRow[] = planes.map((plane, i) => ({ plane, shapes: shapesOf(this.nodes, plane.id), gap: planes[i + 1] ? planes[i + 1].z - plane.z : null, group: groupOf(this.nodes, plane) ?? null }));
    this.ui.setLayers(
      rows,
      this.active,
      this.selectedPlanes().map((p) => p.id),
      this.groupSel,
    );
    this.paths.selectionChanged(this.selection);
    const path = this.building && isPathTool(this.tool) ? this.paths.context() : null;
    const box = this.building ? this.selectionBox() : null;
    const b = box?.bounds;
    this.ui.setContext(this.building ? this.selectedPlanes() : [], this.building ? this.selectedShapes() : [], this.isolate, path, this.clip.length > 0, {
      group: this.building ? (findGroup(this.nodes, this.groupSel) ?? null) : null,
      sketch: this.activeSketch(),
      sketchEdit: !!this.adjusting(),
      units: this.building ? this.groupInfo() : null,
      nums: b && !box.locked ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY } : null,
    });
    const st = this.host.world.planes.stats;
    const tris = st.triangles >= 1000 ? `${(st.triangles / 1000).toFixed(1).replace('.', ',')}k` : String(st.triangles);
    this.ui.setTop(this.dirty, this.history.canUndo, this.history.canRedo, `${planes.length} Ebenen · ${st.shapes} Formen · ${tris} Dreiecke · Welt: ${this.host.world.drawCalls} Draw Call${this.host.world.drawCalls === 1 ? '' : 's'} · ${this.fps.value} fps`);
  }

  /** Vorschaubilder der Ebenen: Formen in ihrer Farbe, eingepasst */
  private drawThumbs(): void {
    const sw = swatchMap(this.nodes);
    const styles = styleMap(this.nodes);
    const look = this.host.world.currentLook;
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
        for (const face of shapeFaces(s)) {
          // Farbe in der Mitte der Fläche (Füllstapel ausgewertet, ohne Ebenenstapel)
          const pl = paintLayers(facePaint(s, face), styles, faceBox(face));
          if (!pl) continue;
          const col = evalLayers(pl.layers, face.inner[0], face.inner[1], sw, look);
          const path = new Path2D();
          for (const ring of [face.outline, ...face.holes]) {
            ring.forEach(([px, py], i) => {
              const q = shapeToPlane(s, px, py);
              const x = ox + (q.x - minX) * k;
              const y = c.height - (oy + (q.y - minY) * k);
              if (i === 0) path.moveTo(x, y);
              else path.lineTo(x, y);
            });
            path.closePath();
          }
          g.fillStyle = rgbToHex(...col.rgb);
          g.globalAlpha = Math.max(0.15, col.a * pl.opacity);
          g.fill(path, 'evenodd');
          g.globalAlpha = 1;
        }
      }
    }
  }

  /** Bildpunkt eines Ebenen-Punkts in der aktuellen Ansicht */
  private screenOf(plane: ZonePlane, q: Pt, shape?: ZoneShape): Pt | null {
    const w = planeToWorld(plane, q.x, q.y);
    if (shape && !this.ranks) {
      this.ranks = new Map();
      for (const p of planesOf(this.nodes)) shapesOf(this.nodes, p.id).forEach((s, i) => this.ranks!.set(s.id, i));
    }
    const rank = shape ? (this.ranks!.get(shape.id) ?? 0) * 0.003 : 0;
    return this.views.toScreen(w.x, w.y, -plane.z + rank);
  }

  /**
   * gemeinsamer Rahmen der gewählten Formen, wenn alle in einer Ebene liegen (dann lassen sie sich zusammen skalieren);
   * locked: eine gesperrt
   */
  private selectionBox(): { plane: ZonePlane; bounds: { minX: number; minY: number; maxX: number; maxY: number }; locked: boolean } | null {
    const shapes = this.selectedShapes();
    const plane = shapes[0] ? findPlane(this.nodes, shapes[0].parent) : undefined;
    if (!plane || shapes.some((s) => s.parent !== plane.id)) return null;
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const s of shapes) {
      const b = shapeBounds(s);
      bounds.minX = Math.min(bounds.minX, b.minX);
      bounds.minY = Math.min(bounds.minY, b.minY);
      bounds.maxX = Math.max(bounds.maxX, b.maxX);
      bounds.maxY = Math.max(bounds.maxY, b.maxY);
    }
    return { plane, bounds, locked: planeLocked(this.nodes, plane) || shapes.some((s) => s.locked) };
  }

  /** Drehgriff: ein Stück über der Mitte der Oberkante des Rahmens (Bildpunkte), mit dem Fußpunkt auf der Kante */
  private rotateHandle(box: { plane: ZonePlane; bounds: { minX: number; minY: number; maxX: number; maxY: number } }): { foot: Pt; knob: Pt } | null {
    const b = box.bounds;
    const mx = (b.minX + b.maxX) / 2;
    const foot = this.screenOf(box.plane, { x: mx, y: b.maxY });
    const mid = this.screenOf(box.plane, { x: mx, y: (b.minY + b.maxY) / 2 });
    if (!foot || !mid) return null;
    let dx = foot.x - mid.x;
    let dy = foot.y - mid.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) [dx, dy] = [0, -1];
    else [dx, dy] = [dx / l, dy / l];
    const off = this.overlay.handleSize + 18;
    return { foot, knob: { x: foot.x + dx * off, y: foot.y + dy * off } };
  }

  /** Rahmen in Ebenen-Koordinaten: vier Ecken, dann vier Kantenmitten */
  private handlePoints(b: { minX: number; minY: number; maxX: number; maxY: number }): Pt[] {
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
    const st = emptyOverlay();
    if (this.building) st.grid = this.gridLines();
    const sk = this.adjusting();
    const skp = sk ? findPlane(this.nodes, sk.parent) : undefined;
    if (sk && skp) {
      const corners = this.sketchCorners(sk).map((q) => this.screenOf(skp, q));
      if (corners.every(Boolean)) {
        st.box = corners as Pt[];
        st.handles = corners as Pt[];
      }
      this.overlay.draw(st);
      return;
    }
    if (this.building && isPathTool(this.tool)) {
      this.paths.selectionChanged(this.selection);
      this.paths.overlay(st);
    } else if (this.building) {
      const inner = this.inGroup.at(-1);
      const members = inner ? groupMembersOf(this.nodes, inner) : [];
      const gp = members.length ? findPlane(this.nodes, members[0].parent) : undefined;
      if (gp) {
        const b = unionBounds(members);
        const pad = 0.4;
        const corners = [
          { x: b.minX - pad, y: b.minY - pad },
          { x: b.maxX + pad, y: b.minY - pad },
          { x: b.maxX + pad, y: b.maxY + pad },
          { x: b.minX - pad, y: b.maxY + pad },
        ].map((q) => this.screenOf(gp, q));
        if (corners.every(Boolean)) st.group = corners as Pt[];
      }
      for (const s of this.selectedShapes()) {
        const p = findPlane(this.nodes, s.parent);
        if (!p) continue;
        const { outline } = shapeLocalPolys(s);
        st.outlines.push(outline.map(([x, y]) => this.screenOf(p, shapeToPlane(s, x, y), s)).filter((q): q is Pt => !!q));
        // Teilungslinien zeigen, wie die Form in Flächen zerfällt
        for (const c of s.cuts ?? []) st.lines.push(flattenPath(c.path, 0.3, c.closed).map(([x, y]) => this.screenOf(p, shapeToPlane(s, x, y), s)).filter((q): q is Pt => !!q));
      }
      const box = this.selectionBox();
      if (box) {
        const hp = this.handlePoints(box.bounds).map((q) => this.screenOf(box.plane, q));
        if (hp.every((q) => !!q)) {
          st.box = (hp as Pt[]).slice(0, 4);
          st.handles = box.locked ? [] : (hp as Pt[]);
        }
        const rh = box.locked ? null : this.rotateHandle(box);
        if (rh) {
          st.tangents.push([rh.foot, rh.knob]);
          st.knobs.push(rh.knob);
        }
      }
      const g = this.gesture;
      if (g?.kind === 'empty' && g.moved && !g.orbit) st.region = regionRing('rect', [g.start, g.last]);
      if (g?.kind === 'create') st.snap = this.paths.snapAt;
      if (g?.kind === 'create') {
        const plane = findPlane(this.nodes, g.plane);
        if (plane) {
          const { a, b } = this.createBox(g);
          const local = primitivePath(g.shape, b.x - a.x || 0.01, b.y - a.y || 0.01);
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
      selectPlane: (id, mode = 'single') => this.selectPlane(id, mode),
      movePlanes: (ids, before, group) => this.movePlanes(ids, before, group),
      selectGroup: (id) => this.selectGroup(id),
      toggleGroup: (id, what) => {
        const g = findGroup(this.nodes, id);
        if (!g) return;
        // Auf- und Zuklappen ist kein Arbeitsschritt, Ausblenden und Sperren schon
        if (what === 'collapsed') {
          g.collapsed = !g.collapsed || undefined;
          this.changed();
        } else
          this.edit(() => {
            g[what] = !g[what] || undefined;
            if (what === 'locked' && g.locked) this.selection = this.selection.filter((sid) => findPlane(this.nodes, findShape(this.nodes, sid)?.parent)?.group !== id);
          });
      },
      renameGroup: (id, name) => this.edit(() => {
        const g = findGroup(this.nodes, id);
        if (g) g.name = name;
      }),
      groupPlanes: () => this.groupSelected(),
      numbers: (field, value, keepRatio) => this.applyNumbers(field, value, keepRatio),
      shapeGroup: () => this.groupShapesSelected(),
      shapeUngroup: () => this.ungroupSelected(),
      leaveGroup: () => {
        const outer = this.inGroup[0];
        this.inGroup = [];
        if (outer) this.setSelection(groupMembersOf(this.nodes, outer).map((s) => s.id));
      },
      ungroup: () => this.ungroupSelected(),
      deleteGroup: () => this.deleteGroup(),
      lassoForm: (form) => this.paths.setLassoForm(form),
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
      depthStart: (id, group) => {
        // eine Gruppe wandert ganz; eine nicht gewählte Ebene allein; gehört sie zur Auswahl, wandern alle gewählten mit
        if (group) this.selectGroup(group);
        else if (!this.selectedPlanes().some((p) => p.id === id)) this.selectPlane(id, 'single');
        this.beginDrag();
      },
      depthChange: (id, z) => {
        this.restoreDragBase();
        const base = this.dragBase?.get(id);
        // nur bis vor die nächste Ebene einer anderen Gruppe (sonst zerrissen Gruppen)
        const lim = depthLimits(
          this.nodes,
          this.selectedPlanes().map((p) => p.id),
        );
        const dz = Math.max(lim.min, Math.min(lim.max, base ? z - base.z : 0));
        for (const p of this.selectedPlanes()) {
          const b = this.dragBase?.get(p.id);
          if (b) movePlaneDepth(p, b.z + dz, this.holdView());
        }
        this.clampDepths();
        this.changed();
      },
      depthEnd: () => this.endDrag(),
      sketchLoad: (file) => void this.loadSketch(file),
      sketchOpacity: () => {
        const k = this.activeSketch();
        if (!k) return;
        const steps = [0.25, 0.5, 0.75, 1];
        this.edit(() => (k.opacity = steps[(steps.findIndex((v) => Math.abs(v - k.opacity) < 0.01) + 1) % steps.length]));
      },
      sketchBlend: () => {
        const k = this.activeSketch();
        if (k) this.edit(() => (k.blend = k.blend ? undefined : 'normal'));
      },
      sketchHide: () => {
        const k = this.activeSketch();
        if (k) this.edit(() => (k.hidden = !k.hidden || undefined));
      },
      sketchAdjust: () => {
        const k = this.activeSketch();
        this.sketchEdit = this.adjusting() || !k ? null : k.id;
        this.uiDirty = true;
        this.drawOverlay();
      },
      sketchRemove: () => {
        const k = this.activeSketch();
        if (!k) return;
        this.sketchEdit = null;
        this.edit(() => {
          this.nodes = this.nodes.filter((n) => n.id !== k.id);
          this.zone.nodes = this.nodes;
        });
      },
      toggleSnap: () => {
        this.snapOn = !this.snapOn;
        this.ui.setSnap(this.snapOn, this.gridOn);
        this.ui.toast(this.snapOn ? 'Einrasten an: Punkte rasten an Ankern und Kanten ein, auch über Ebenen, so wie es im Bild aussieht' : 'Einrasten aus');
      },
      toggleGrid: () => {
        this.gridOn = !this.gridOn;
        this.ui.setSnap(this.snapOn, this.gridOn);
        this.drawOverlay();
      },
      toggleHold: () => {
        this.hold = !this.hold;
        this.ui.setHold(this.hold);
        this.ui.toast(this.hold ? 'Bild halten: Abstände ändern die Tiefe, das Bild im Spielblick bleibt' : 'Welt halten: Ebenen behalten ihre Größe in Metern');
      },
      setRole: (role) => this.edit(() => {
        for (const p of this.selectedPlanes()) p.role = role;
      }),
      setIsolate: (i) => {
        this.isolate = i;
        this.meshDirty = true;
        this.uiDirty = true;
      },
      deletePlane: () => this.deletePlane(),
      fill: (color) => this.edit(() => {
        // die ganzen Formen in einer Farbe; Löcher bleiben Löcher
        for (const s of this.selectedShapes()) {
          s.fill = color;
          const holes = s.regions?.filter((r) => r.fill === null);
          if (holes?.length) s.regions = holes;
          else delete s.regions;
        }
      }),
      duplicate: () => this.duplicate(),
      orderShape: (dir) => this.orderShape(dir),
      deleteShape: () => this.deleteShape(),
      flip: (axis) => this.flip(axis),
      align: (mode) => this.alignSelected(mode),
      combine: (op) => this.booleanSelected(op),
      simplify: () => this.simplifySelected(),
      distribute: (axis) => this.distributeSelected(axis),
      copy: () => this.copy(),
      paste: () => this.paste(),
      penDone: (closed) => this.paths.finishPen(closed),
      penCancel: () => this.paths.cancelPen(),
      anchorSmooth: () => this.paths.toggleAnchor(),
      anchorDelete: () => this.paths.deleteAnchor(),
      lineDelete: () => this.paths.deleteLine(),
      faceFill: (fill) => this.paths.fillFace(fill),
      exportSvg: (scope) => this.exportSvg(scope),
      importSvg: (file) => void this.importSvg(file),
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
    this.sketchEdit = null;
    this.paths.setTool(isPathTool(t) ? t : null);
    this.ui.setTool(t);
    this.updateCursor();
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** Mauszeiger: Zeichenstift mit Befehlstaste wie die Direktauswahl, mit Wahltaste das Ankerpunkt-Werkzeug */
  private updateCursor(): void {
    const t = this.tool;
    this.host.surface.style.cursor = t === 'select' || t === 'direct' || (t === 'pen' && this.mods.cmd) ? '' : t === 'pen' && this.mods.alt ? 'pointer' : 'crosshair';
  }

  /** gedrückte Tasten aus einem Zeiger- oder Tastenereignis übernehmen */
  private setMods(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): void {
    const m: Mods = { cmd: e.metaKey || e.ctrlKey, alt: e.altKey, shift: e.shiftKey };
    this.shiftDown = m.shift;
    if (m.cmd === this.mods.cmd && m.alt === this.mods.alt && m.shift === this.mods.shift) return;
    this.mods = m;
    this.paths.setModifiers(m);
    this.updateCursor();
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
      this.planeSel = [p.id];
      this.selected = null;
    });
  }

  /** Ebene in der Liste wählen: allein, dazu oder heraus, oder alle von der aktiven bis hierher; Formen fallen aus der Wahl */
  private selectPlane(id: string, mode: 'single' | 'toggle' | 'range'): void {
    const planes = planesOf(this.nodes);
    const cur = this.selectedPlanes().map((p) => p.id);
    if (mode === 'toggle') {
      if (cur.includes(id) && cur.length > 1) {
        this.planeSel = cur.filter((x) => x !== id);
        if (this.active === id) this.active = this.planeSel.at(-1) ?? null;
      } else {
        this.planeSel = [...cur.filter((x) => x !== id), id];
        this.active = id;
      }
    } else if (mode === 'range' && this.active) {
      const a = planes.findIndex((p) => p.id === this.active);
      const b = planes.findIndex((p) => p.id === id);
      this.planeSel = planes.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id);
      this.active = id;
    } else {
      this.planeSel = [id];
      this.active = id;
    }
    this.groupSel = null;
    this.selection = [];
    this.paths.selectionChanged([]);
    this.meshDirty = this.isolate !== 'off';
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** Gruppe in der Liste wählen: ihre Ebenen sind gewählt, die vorderste ist aktiv */
  private selectGroup(id: string): void {
    const members = groupMembers(this.nodes, id);
    if (!members.length) return;
    this.groupSel = id;
    this.planeSel = members.map((p) => p.id);
    this.active = members[0].id;
    this.selection = [];
    this.paths.selectionChanged([]);
    this.meshDirty = this.isolate !== 'off';
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** gewählte Ebenen zu einer Gruppe (Cmd+G); nicht benachbarte kommen hinter die vorderste */
  private groupSelected(): void {
    if (this.selection.length) {
      this.groupShapesSelected();
      return;
    }
    const ids = this.selectedPlanes().map((p) => p.id);
    if (!ids.length) return;
    let gid: string | null = null;
    this.edit(() => {
      gid = groupPlanes(this.nodes, ids, this.holdView())?.id ?? null;
    });
    if (gid) {
      this.selectGroup(gid);
      this.ui.toast(`${ids.length} ${ids.length === 1 ? 'Ebene' : 'Ebenen'} gruppiert (Cmd+Shift+G löst die Gruppe auf)`);
    }
  }

  /** gewählte Formen einer Ebene zu einer Formgruppe (Cmd+G, wie in Illustrator) */
  private groupShapesSelected(): void {
    const shapes = this.selectedShapes();
    if (new Set(shapes.map((s) => s.parent)).size > 1) {
      this.ui.toast('Formen verschiedener Ebenen lassen sich nicht gruppieren (Ebenen gruppierst du in der Liste)');
      return;
    }
    if (this.selectedUnits().length < 2) {
      this.ui.toast('Zum Gruppieren mindestens zwei Formen oder Gruppen wählen');
      return;
    }
    let id: string | null = null;
    this.edit(() => {
      id = groupShapes(this.nodes, shapes.map((s) => s.id));
    });
    if (!id) return;
    const members = groupMembersOf(this.nodes, id).map((s) => s.id);
    this.setSelection(members);
    this.ui.toast(`${members.length} Formen gruppiert: Tippen wählt die Gruppe, doppelt tippen geht hinein (Shift+Cmd+G löst sie auf)`);
  }

  /** Gruppe auflösen (Cmd+Shift+G): gewählte Formgruppen, sonst die gewählte Ebenen-Gruppe oder die der aktiven Ebene */
  private ungroupSelected(): void {
    const shapes = this.selectedShapes();
    if (shapes.length) {
      const ctx = shapes.every((s) => inContext(s, this.inGroup)) ? this.inGroup : [];
      let n = 0;
      this.edit(() => {
        n = ungroupShapes(this.nodes, shapes.map((s) => s.id), ctx);
      });
      this.ui.toast(n ? (n === 1 ? 'Gruppe aufgelöst, die Formen bleiben gewählt' : `${n} Gruppen aufgelöst`) : 'Keine Gruppe gewählt');
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    const gid = this.groupSel ?? this.plane?.group ?? null;
    if (!gid) return;
    const members = groupMembers(this.nodes, gid).map((p) => p.id);
    this.edit(() => {
      this.nodes = ungroup(this.nodes, gid);
      this.zone.nodes = this.nodes;
    });
    this.groupSel = null;
    this.planeSel = members;
    this.uiDirty = true;
  }

  /** gewählte Gruppe samt Ebenen und Formen löschen (rückgängig mit Cmd+Z) */
  private deleteGroup(): void {
    const g = findGroup(this.nodes, this.groupSel);
    if (!g) return;
    this.groupSel = null;
    this.deletePlane();
    this.ui.toast(`Gruppe ${g.name} gelöscht (rückgängig mit Cmd+Z oder zwei Fingern)`);
  }

  /**
   * Ebenen in der Liste verschieben (Ziehen): vor die Ebene before (null: ganz nach hinten), in die Gruppe group (null:
   * keine); die Tiefe folgt der Reihenfolge (Plan 4.4, src/zone/planeGroups.ts), mit „Bild halten“ bleibt das Bild jeder
   * verschobenen Ebene
   */
  private movePlanes(ids: string[], before: string | null, group: string | null): void {
    const moving = planesOf(this.nodes).filter((p) => ids.includes(p.id));
    let done = false;
    this.edit(() => {
      done = reorderPlanes(this.nodes, ids, before, group, this.holdView());
      if (done) this.clampDepths();
    });
    if (!done || !moving.length) return;
    const g = findGroup(this.nodes, group);
    const where = g ? ` in ${g.name}` : '';
    this.ui.toast(moving.length > 1 ? `${moving.length} Ebenen verschoben${where}` : `${moving[0].name} verschoben${where}: Tiefe ${moving[0].z.toFixed(1).replace('.', ',')} m`);
  }

  private deletePlane(): void {
    const sel = this.selectedPlanes();
    if (!sel.length) return;
    const planes = planesOf(this.nodes);
    const ids = new Set(sel.map((p) => p.id));
    const last = planes.findIndex((p) => p.id === sel[sel.length - 1].id);
    const nextActive = planes.slice(last + 1).find((p) => !ids.has(p.id)) ?? [...planes.slice(0, last)].reverse().find((p) => !ids.has(p.id));
    this.edit(() => {
      this.nodes = this.nodes.filter((n) => !ids.has(n.id) && !((n.kind === 'shape' || n.kind === 'sketch') && ids.has(n.parent)));
      this.zone.nodes = this.nodes;
      this.active = nextActive?.id ?? null;
      this.planeSel = this.active ? [this.active] : [];
      this.selected = null;
    });
    this.ui.toast(`${sel.length > 1 ? `${sel.length} Ebenen` : sel[0].name} gelöscht (rückgängig mit Cmd+Z oder zwei Fingern)`);
  }

  /**
   * Duplizieren (Cmd+D): jede Kopie liegt gleich vor ihrem Original, 1 m versetzt; eine ganz gewählte Gruppe wird eine
   * eigene Gruppe vor der alten, eine Form aus einer Gruppe bleibt mit ihrer Kopie in der Gruppe
   */
  private duplicate(): void {
    const shapes = this.selectedShapes();
    if (!shapes.length) return;
    // vor dem Einfügen der Kopien prüfen, welche Gruppen ganz gewählt sind (danach gehörten die Kopien dazu)
    const chosen = new Set(shapes.map((s) => s.id));
    const wholeIds = new Set(shapes.flatMap((s) => s.groups ?? []).filter((g) => groupMembersOf(this.nodes, g).every((m) => chosen.has(m.id))));
    const whole = (g: string): boolean => wholeIds.has(g);
    this.edit(() => {
      const copies: ZoneShape[] = [];
      for (const s of shapes) {
        const copy: ZoneShape = { ...cloneNodes([s])[0], id: nextNodeId(this.nodes, 's') } as ZoneShape;
        copy.name = `${s.name} Kopie`;
        copy.x += 1;
        copy.y -= 1;
        const next = shapesOf(this.nodes, s.parent).find((x) => x.order > s.order);
        copy.order = next ? (s.order + next.order) / 2 : s.order + 1;
        this.nodes.push(copy);
        copies.push(copy);
      }
      copyGroups(this.nodes, shapes, copies, true, whole);
      for (const plane of new Set(copies.map((c) => c.parent))) renumberOrder(this.nodes, plane);
      this.selection = copies.map((c) => c.id);
    });
  }

  /**
   * nach vorn (1) oder hinten (−1) in der Ebene: die gewählte Einheit (Form oder Gruppe) an der nächsten vorbei; eine
   * einzelne Form aus einer Gruppe (Direktauswahl) innerhalb ihrer Gruppe
   */
  private orderShape(dir: 1 | -1): void {
    const first = findShape(this.nodes, this.selection[0]);
    if (!first) return;
    const tries: GroupContext[] = [this.ctxOf(first), first.groups ?? []];
    this.edit(() => {
      for (const ctx of tries) if (moveUnit(this.nodes, this.selection, ctx, dir)) break;
    });
  }

  private deleteShape(): void {
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.edit(() => {
      this.nodes = this.nodes.filter((n) => !ids.has(n.id));
      this.zone.nodes = this.nodes;
      this.selected = null;
    });
  }

  /** spiegeln: eine Form an ihrer Mitte; mehrere in einer Ebene am gemeinsamen Rahmen (auch ihre Lage), sonst jede für sich */
  private flip(axis: 'x' | 'y'): void {
    const shapes = this.selectedShapes();
    if (!shapes.length) return;
    const box = shapes.length > 1 ? this.selectionBox() : null;
    this.edit(() => {
      for (const s of shapes) {
        const b0 = shapeBounds(s);
        flipShape(s, axis);
        if (!box) continue;
        // die Mitte der Form spiegelt sich am gemeinsamen Rahmen
        if (axis === 'x') s.x += box.bounds.minX + box.bounds.maxX - (b0.minX + b0.maxX);
        else s.y += box.bounds.minY + box.bounds.maxY - (b0.minY + b0.maxY);
      }
    });
  }

  private copy(cut = false): void {
    const shapes = this.selectedShapes();
    if (!shapes.length) return;
    this.clip = shapes.map((s) => ({ shape: cloneNodes([s])[0] as ZoneShape, from: { ...findPlane(this.nodes, s.parent)! } }));
    const chosen = new Set(shapes.map((s) => s.id));
    this.clipWhole = new Set(shapes.flatMap((s) => s.groups ?? []).filter((g) => groupMembersOf(this.nodes, g).every((m) => chosen.has(m.id))));
    if (cut) this.deleteShape();
    else this.ui.toast(`${shapes.length > 1 ? `${shapes.length} Formen kopiert` : 'Kopiert'}: Einfügen in einer anderen Ebene setzt sie an dieselbe Stelle im Spielblick`);
    this.uiDirty = true;
  }

  /** kopierte Formen in die aktive Ebene; aus einer anderen Ebene so, dass sie im Spielblick gleich aussehen (Bild halten) */
  private paste(): void {
    const to = this.plane;
    if (!this.clip.length) return;
    if (!to) {
      this.ui.toast('Erst eine Ebene wählen');
      return;
    }
    if (planeLocked(this.nodes, to)) {
      this.ui.toast('Die aktive Ebene ist gesperrt');
      return;
    }
    let moved = false;
    // in eine betretene Gruppe dieser Ebene hinein (wie im Isolationsmodus von Illustrator)
    const inner = this.inGroup.at(-1);
    const into = inner && groupMembersOf(this.nodes, inner)[0]?.parent === to.id ? [...this.inGroup] : [];
    this.edit(() => {
      const ids: string[] = [];
      const copies: ZoneShape[] = [];
      // in die Gruppe: zwischen ihre vorderste Form und die nächste dahinter
      const front = into.length ? groupMembersOf(this.nodes, into[into.length - 1]).reduce((m, x) => Math.max(m, x.order), -Infinity) : null;
      const after = front !== null ? (shapesOf(this.nodes, to.id).find((x) => x.order > front)?.order ?? front + 1) : 0;
      for (const c of this.clip) {
        // die Ebene der Vorlage, wie sie jetzt liegt (sie kann seit dem Kopieren in der Tiefe gewandert sein)
        const from = findPlane(this.nodes, c.from.id) ?? c.from;
        const same = from.id === to.id;
        moved ||= !same;
        const copy = same ? (cloneNodes([c.shape])[0] as ZoneShape) : transferShape(c.shape, from, to, this.holdView());
        copy.id = nextNodeId(this.nodes, 's');
        copy.parent = to.id;
        copy.order = front !== null ? front + ((after - front) * (copies.length + 1)) / (this.clip.length + 1) : shapesOf(this.nodes, to.id).reduce((m, x) => Math.max(m, x.order), 0) + 1;
        if (same && findShape(this.nodes, c.shape.id)) {
          copy.x += 1;
          copy.y -= 1;
        }
        this.nodes.push(copy);
        copies.push(copy);
        ids.push(copy.id);
      }
      // ganz kopierte Gruppen werden eigene Gruppen; in eine betretene Gruppe hinein
      copyGroups(this.nodes, this.clip.map((c) => c.shape), copies, false, (g) => this.clipWhole.has(g));
      for (const c of copies) if (into.length) c.groups = [...into, ...(c.groups ?? [])];
      renumberOrder(this.nodes, to.id);
      this.selection = ids;
    });
    if (moved) this.ui.toast(this.hold ? `In ${to.name} eingefügt: gleiche Stelle im Spielblick` : `In ${to.name} eingefügt: gleiche Lage in Metern (Welt halten)`);
  }

  /** Skizze der aktiven Ebene (eine je Ebene) */
  private activeSketch(): ZoneSketch | null {
    return this.active ? (sketchesOf(this.nodes, this.active)[0] ?? null) : null;
  }

  /** Skizze, die gerade angepasst wird: nur die der aktiven Ebene beim Bauen; wechselt die Ebene, endet das Anpassen */
  private adjusting(): ZoneSketch | null {
    const k = this.building && this.sketchEdit ? this.activeSketch() : null;
    if (k?.id !== this.sketchEdit) this.sketchEdit = null;
    return this.sketchEdit ? k : null;
  }

  /** Ecken einer Skizze in Ebenen-Koordinaten (links unten, rechts unten, rechts oben, links oben) */
  private sketchCorners(k: ZoneSketch): Pt[] {
    return [
      { x: k.x - k.w / 2, y: k.y - k.h / 2 },
      { x: k.x + k.w / 2, y: k.y - k.h / 2 },
      { x: k.x + k.w / 2, y: k.y + k.h / 2 },
      { x: k.x - k.w / 2, y: k.y + k.h / 2 },
    ];
  }

  /**
   * Skizze laden: das Bild kommt neben die Zonendatei (Dev-Server) und liegt dann mitten im freien Teil des Bildes auf
   * der aktiven Ebene, so groß, dass es ganz zu sehen ist; eine vorhandene Skizze der Ebene wird ersetzt
   */
  private async loadSketch(file: File): Promise<void> {
    const plane = this.plane;
    if (!plane) {
      this.ui.toast('Erst eine Ebene wählen');
      return;
    }
    let size: { w: number; h: number };
    try {
      const bmp = await createImageBitmap(file);
      size = { w: bmp.width, h: bmp.height };
      bmp.close();
    } catch {
      this.ui.toast('Das Bild ließ sich nicht lesen (PNG, JPG oder WebP)');
      return;
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const id = nextNodeId(this.nodes, 'k');
    const url = await uploadZoneFile(this.zone.name, `skizze-${id}-${Date.now().toString(36)}.${ext}`, file);
    const src = url ?? URL.createObjectURL(file);
    // in den freien Teil des Bildes (nicht unter die Ebenenliste), mit Rand; ein hohes Bild nach der Höhe
    const box = this.host.surface.getBoundingClientRect();
    const free = this.ui.freeSpan();
    const x0 = Math.max(0, free.left - box.left) + 24;
    const x1 = Math.min(this.width, free.right - box.left) - 24;
    const c = { x: (x0 + x1) / 2, y: this.height / 2 };
    const mid = this.planePoint(plane, c);
    const l = this.planePoint(plane, { x: x0 + (x1 - x0) * 0.08, y: c.y });
    const r = this.planePoint(plane, { x: x1 - (x1 - x0) * 0.08, y: c.y });
    const t = this.planePoint(plane, { x: c.x, y: this.height * 0.14 });
    const b = this.planePoint(plane, { x: c.x, y: this.height * 0.84 });
    const byW = l && r ? Math.hypot(r.x - l.x, r.y - l.y) : 20;
    const byH = t && b ? (Math.hypot(t.x - b.x, t.y - b.y) * size.w) / size.h : Infinity;
    const w = Math.max(1, Math.min(byW, byH));
    this.edit(() => {
      this.nodes = this.nodes.filter((n) => !(n.kind === 'sketch' && n.parent === plane.id));
      this.zone.nodes = this.nodes;
      this.nodes.push({ id, kind: 'sketch', parent: plane.id, name: file.name.slice(0, 60) || 'Skizze', src, x: mid?.x ?? 0, y: mid?.y ?? 0, w, h: (w * size.h) / size.w, opacity: 0.5 });
    });
    this.sketchEdit = id;
    this.ui.toast(url ? 'Skizze liegt auf der Ebene: Ecken ziehen skaliert, innen ziehen verschiebt, dann „Fertig“' : 'Skizze nur bis zum Neuladen (ohne Dev-Server lässt sie sich nicht sichern)');
  }

  /**
   * Zahlen der Leiste anwenden (ein Schritt im Verlauf): Mitte verschieben, Breite oder Höhe um die Mitte strecken (mit
   * festem Seitenverhältnis beide), um Grad um die Mitte drehen
   */
  private applyNumbers(field: 'x' | 'y' | 'w' | 'h' | 'angle', value: number, keepRatio: boolean): void {
    const box = this.selectionBox();
    if (!box || box.locked) return;
    const b = box.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const shapes = this.selectedShapes();
    this.edit(() => {
      if (field === 'x' || field === 'y') {
        for (const s of shapes) {
          if (field === 'x') s.x += value - cx;
          else s.y += value - cy;
        }
        return;
      }
      if (field === 'angle') {
        for (const s of shapes) rotateShape(s, cloneNodes([s])[0] as ZoneShape, { x: cx, y: cy }, (value * Math.PI) / 180);
        return;
      }
      if (value < 0.01) return;
      let kx = field === 'w' && w > 1e-6 ? value / w : 1;
      let ky = field === 'h' && h > 1e-6 ? value / h : 1;
      if (keepRatio) {
        if (field === 'w') ky = kx;
        else kx = ky;
      }
      for (const s of shapes) {
        s.x = cx + (s.x - cx) * kx;
        s.y = cy + (s.y - cy) * ky;
        s.sx *= kx;
        s.sy *= ky;
      }
    });
    if (field === 'angle' && value) this.ui.toast(`um ${fmtDeg(value)}° gedreht`);
  }

  /** gewählte Formen einer Ebene am gemeinsamen Rahmen ausrichten */
  private alignSelected(mode: AlignMode): void {
    if (!this.selectionBox()) return;
    this.edit(() => alignShapes(this.selectedUnits(), mode));
  }

  /** gewählte Formen einer Ebene gleichmäßig verteilen (ab drei) */
  private distributeSelected(axis: 'x' | 'y'): void {
    const units = this.selectedUnits();
    if (!this.selectionBox() || units.length < 3) return;
    this.edit(() => distributeShapes(units, axis));
  }

  /**
   * Boolesche Operation über die gewählten Formen einer Ebene (src/zone/pathfinder.ts): sie werden durch das Ergebnis
   * ersetzt; Farbe und Platz in der Reihenfolge von der vordersten, beim Abziehen von der hintersten
   */
  private booleanSelected(op: BoolOp): void {
    const box = this.selectionBox();
    // je Einheit ein Operand: eine Gruppe zählt als ihre Vereinigung
    const sel = this.selectedUnits();
    const units = sel.length === 1 ? sel[0].map((s) => [s]) : sel;
    const shapes = units.flat();
    if (!box || units.length < 2) return;
    const res = booleanShapes(units, op);
    if (!res.length) {
      this.ui.toast(op === 'intersect' ? 'Keine Schnittmenge: die Formen überlappen nicht' : 'Davon bleibt nichts übrig');
      return;
    }
    const base = op === 'minus' ? units[0][0] : units[units.length - 1][units[units.length - 1].length - 1];
    // in einer betretenen Gruppe bleibt das Ergebnis darin; mehrere Teile bleiben als eine Gruppe beisammen
    const keep = shapes.every((s) => inContext(s, this.inGroup)) ? [...this.inGroup] : [];
    if (res.length > 1) keep.push(nextGroupId(this.nodes));
    this.edit(() => {
      const drop = new Set(shapes.map((s) => s.id));
      this.nodes = this.nodes.filter((n) => !drop.has(n.id));
      this.zone.nodes = this.nodes;
      const ids: string[] = [];
      res.forEach((r, i) => {
        const s = shapeFromPlanePath(this.nodes, box.plane.id, r.outline, base.fill);
        if (r.holes.length) s.holes = r.holes.map((h) => planePathToShape(s, h));
        s.name = res.length > 1 ? `${base.name} ${i + 1}` : base.name;
        s.order = base.order + i * 0.001;
        if (keep.length) s.groups = [...keep];
        this.nodes.push(s);
        ids.push(s.id);
      });
      this.selection = ids;
    });
    const word = { unite: 'Vereint', minus: 'Abgezogen', intersect: 'Schnittmenge', exclude: 'Überlappung ausgeschlossen' }[op];
    this.ui.toast(`${word}: ${res.length === 1 ? '1 Form' : `${res.length} Formen als Gruppe`} (Teilungslinien und Flächenfarben fallen dabei weg)`);
  }

  /** gewählte Formen vereinfachen: höchstens 1,5 Bildpunkte daneben, so wie sie gerade zu sehen sind */
  private simplifySelected(): void {
    const shapes = this.selectedShapes().filter((s) => !s.locked);
    if (!shapes.length) return;
    let saved = 0;
    this.edit(() => {
      for (const s of shapes) {
        const plane = findPlane(this.nodes, s.parent);
        const b = shapeBounds(s);
        const c = plane ? this.screenOf(plane, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }) : null;
        const q0 = plane && c ? this.planePoint(plane, c) : null;
        const q1 = plane && c ? this.planePoint(plane, { x: c.x + 10, y: c.y }) : null;
        const mpp = q0 && q1 ? Math.hypot(q1.x - q0.x, q1.y - q0.y) / 10 : 0.05;
        saved += simplifyShape(s, mpp * 1.5);
      }
    });
    this.ui.toast(saved ? `Vereinfacht: ${saved} ${saved === 1 ? 'Anker' : 'Anker'} weniger` : 'Schon einfach: kein Anker zu viel');
  }

  /** alle Formen der gewählten Ebenen wählen (Cmd+A) */
  /** Esc: aus der betretenen Gruppe eine Stufe hinaus (sie bleibt gewählt), sonst die Auswahl aufheben */
  private escape(): void {
    const left = this.inGroup.at(-1);
    if (!left) {
      this.setSelection([]);
      return;
    }
    this.inGroup = this.inGroup.slice(0, -1);
    this.setSelection(groupMembersOf(this.nodes, left).map((s) => s.id));
    this.ui.toast(this.inGroup.length ? 'Eine Gruppe höher' : 'Aus der Gruppe heraus');
  }

  private selectAll(): void {
    const inner = this.inGroup.at(-1);
    if (inner) {
      this.setSelection(groupMembersOf(this.nodes, inner).map((s) => s.id));
      return;
    }
    const ids = this.selectedPlanes()
      .filter((p) => !planeHidden(this.nodes, p) && !planeLocked(this.nodes, p))
      .flatMap((p) => shapesOf(this.nodes, p.id).filter((s) => !s.hidden && !s.locked))
      .map((s) => s.id);
    this.setSelection(ids);
  }

  /** SVG sichern: alle sichtbaren Ebenen oder nur die gewählten (Plan 4.10) */
  private exportSvg(scope: 'all' | 'plane'): void {
    const sel = this.selectedPlanes();
    if (scope === 'plane' && !sel.length) return;
    const svg = planesToSvg(this.nodes, { planes: scope === 'plane' ? sel.map((p) => p.id) : undefined, zoneName: this.zone.name });
    const one = sel.length === 1 ? sel[0] : null;
    const name = `${this.zone.name}-${scope === 'plane' ? (one ? slug(one.name) || one.id : `${sel.length}-ebenen`) : 'ebenen'}.svg`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.ui.toast(`${name} gesichert: je Ebene eine Gruppe, 1 m = 10 px`);
  }

  /** SVG laden: Gruppen mit Ebenen-Kennung ersetzen ihre Ebene, andere werden neue Ebenen (ein Schritt im Verlauf) */
  private async importSvg(file: File): Promise<void> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.ui.toast('Die Datei ließ sich nicht lesen');
      return;
    }
    if (!/<svg[\s>]/i.test(text)) {
      this.ui.toast('Das ist keine SVG-Datei');
      return;
    }
    this.paths.setTool(isPathTool(this.tool) ? this.tool : null);
    const r = svgToPlanes(text, this.nodes);
    this.history.begin(this.nodes);
    this.setNodes(r.nodes);
    if (this.history.commit(this.nodes)) this.changed();
    const parts: string[] = [];
    if (r.replaced) parts.push(`${r.replaced} ${r.replaced === 1 ? 'Ebene' : 'Ebenen'} ersetzt`);
    if (r.added) parts.push(`${r.added} neu`);
    parts.push(`${r.shapes} ${r.shapes === 1 ? 'Form' : 'Formen'}${r.kept ? `, davon ${r.kept} unverändert` : ''}`);
    this.ui.toast(`SVG geladen: ${parts.join(', ')}${r.warnings.length ? `. ${r.warnings.join('. ')}` : ''}`);
  }

  private undo(): void {
    if (this.paths.undoPoint()) return;
    if (this.paths.busy) return;
    const prev = this.history.undo(this.nodes);
    if (prev) this.setNodes(prev);
    else this.ui.toast('Nichts zum Rückgängigmachen');
  }

  private redo(): void {
    if (this.paths.busy) return;
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
    this.setMods(e);
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
    this.toolDown(e.pointerId, p);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.building) return;
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      // ohne Druck: Gummiband des Zeichenstifts (Maus, schwebender Pencil)
      if ((this.tool === 'pen' || this.tool === 'curve') && e.pointerType !== 'touch') this.paths.hoverAt(this.local(e));
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const p = this.local(e);
    ptr.x = p.x;
    ptr.y = p.y;
    this.setMods(e);
    if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) ptr.moved = true;
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
    this.paths.cancelActive();
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

  private toolDown(pointerId: number, p: Pt): void {
    if (this.adjusting() && this.sketchDown(pointerId, p)) return;
    if (isPathTool(this.tool) && this.views.mode !== 'free') {
      this.paths.down(pointerId, p, this.mods);
      return;
    }
    if (this.tool !== 'select' && this.views.mode !== 'free') {
      let plane = this.plane;
      this.history.begin(this.nodes);
      if (!plane || planeLocked(this.nodes, plane)) {
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
      const a = this.paths.snapPoint(plane, p);
      if (!a) {
        this.history.cancel();
        return;
      }
      this.gesture = { kind: 'create', pointerId, plane: plane.id, shape: this.tool === 'ellipse' || this.tool === 'arch' ? this.tool : 'rect', a, b: a };
      return;
    }
    // Auswahl: zuerst Dreh- und Rahmengriffe, dann Formen unter dem Strahl, sonst ins Leere (Rechteck)
    const box = this.selectionBox();
    if (box && !box.locked) {
      const r = this.overlay.handleSize + 6;
      const rh = this.rotateHandle(box);
      const at = this.planePoint(box.plane, p);
      if (rh && at && Math.hypot(rh.knob.x - p.x, rh.knob.y - p.y) <= r) {
        const b = box.bounds;
        const pivot = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
        this.history.begin(this.nodes);
        this.gesture = { kind: 'rotate', pointerId, plane: box.plane.id, pivot, a0: Math.atan2(at.y - pivot.y, at.x - pivot.x), angle: 0, orig: new Map(this.selectedShapes().map((s) => [s.id, cloneNodes([s])[0] as ZoneShape])) };
        return;
      }
      const pts = this.handlePoints(box.bounds);
      const i = pts.findIndex((q) => {
        const sq = this.screenOf(box.plane, q);
        return !!sq && Math.hypot(sq.x - p.x, sq.y - p.y) <= r;
      });
      if (i >= 0) {
        this.history.begin(this.nodes);
        this.gesture = { kind: 'scale', pointerId, plane: box.plane.id, axis: AXIS[i], anchor: pts[OPPOSITE[i]], h0: pts[i], orig: new Map(this.selectedShapes().map((s) => [s.id, { x: s.x, y: s.y, sx: s.sx, sy: s.sy }])) };
        return;
      }
    }
    const hit = this.pickShape(p);
    const shape = hit ? findShape(this.nodes, hit.id) : undefined;
    if (shape) {
      // außerhalb der betretenen Gruppe getippt: hinaus. Zweites Tippen auf eine Gruppe (ohne Ziehen) geht beim
      // Abheben hinein (Isolationsmodus; ein Klick mit gleich folgendem Ziehen bleibt ein Verschieben)
      if (!inContext(shape, this.inGroup)) this.inGroup = [];
      const last = this.lastPick;
      const second = !this.mods.shift && last?.id === shape.id && performance.now() - last.t < 450 && Math.hypot(last.x - p.x, last.y - p.y) < 14 && (shape.groups ?? []).length > this.inGroup.length;
      // gewählt wird die Einheit: im Kontext eine ganze Gruppe der nächsten Stufe oder die Form
      const unit = [...unitShapes(this.nodes, shape, this.inGroup).map((s) => s.id).filter((id) => id !== shape.id), shape.id];
      if (this.mods.shift) {
        // Umschalt: dazu oder heraus, ohne zu ziehen
        const all = unit.every((id) => this.selection.includes(id));
        const rest = this.selection.filter((x) => !unit.includes(x));
        this.setSelection(all ? rest : [...rest, ...unit]);
        return;
      }
      // eine gewählte Einheit zieht alle gewählten mit, eine andere wird allein gewählt
      const kept = unit.every((id) => this.selection.includes(id));
      this.setSelection(kept ? [...this.selection.filter((x) => !unit.includes(x)), ...unit] : unit);
      const movable = this.selectedShapes().filter((s) => { const pl = findPlane(this.nodes, s.parent); return !s.locked && !!pl && !planeLocked(this.nodes, pl); });
      this.history.begin(this.nodes);
      this.gesture = { kind: 'move', pointerId, start: p, orig: new Map(movable.map((s) => [s.id, { x: s.x, y: s.y }])), tap: second ? shape.id : null };
      this.drawOverlay();
      return;
    }
    this.gesture = { kind: 'empty', pointerId, start: p, last: p, orbit: this.views.mode === 'free', moved: false, add: this.mods.shift };
  }

  /** Skizze anpassen: an einer Ecke skalieren, innen verschieben; daneben endet das Anpassen */
  private sketchDown(pointerId: number, p: Pt): boolean {
    const k = this.nodes.find((n) => n.id === this.sketchEdit) as ZoneSketch | undefined;
    const plane = k ? findPlane(this.nodes, k.parent) : undefined;
    const at = plane ? this.planePoint(plane, p) : null;
    if (!k || !plane || !at) return false;
    const corners = this.sketchCorners(k);
    const r = this.overlay.handleSize + 6;
    const i = corners.findIndex((q) => {
      const s = this.screenOf(plane, q);
      return !!s && Math.hypot(s.x - p.x, s.y - p.y) <= r;
    });
    if (i >= 0) {
      this.history.begin(this.nodes);
      this.gesture = { kind: 'sketchScale', pointerId, id: k.id, anchor: corners[(i + 2) % 4], h0: corners[i], orig: { x: k.x, y: k.y, w: k.w, h: k.h } };
      return true;
    }
    if (Math.abs(at.x - k.x) <= k.w / 2 && Math.abs(at.y - k.y) <= k.h / 2) {
      this.history.begin(this.nodes);
      this.gesture = { kind: 'sketchMove', pointerId, id: k.id, start: at, orig: { x: k.x, y: k.y } };
      return true;
    }
    this.sketchEdit = null;
    this.uiDirty = true;
    this.drawOverlay();
    return true;
  }

  /** Rechteck ins Leere gezogen: Formen der gewählten Ebenen, deren Umriss es berührt (wie in Illustrator) */
  private regionSelect(a: Pt, b: Pt, add: boolean): void {
    const inside = regionTest('rect', [a, b]);
    const collect = (planes: readonly ZonePlane[]): string[] =>
      planes
        .filter((pl) => !planeHidden(this.nodes, pl) && !planeLocked(this.nodes, pl))
        .flatMap((pl) =>
          shapesOf(this.nodes, pl.id).filter((s) => {
            if (s.hidden || s.locked) return false;
            for (const ring of [s.path, ...(s.holes ?? [])]) {
              for (const [x, y] of flattenPath(ring, 0.3)) {
                const q = this.screenOf(pl, shapeToPlane(s, x, y), s);
                if (q && inside(q)) return true;
              }
            }
            return false;
          }),
        )
        .map((s) => s.id);
    const planes = this.regionPlanes();
    const found = expandToUnits(this.nodes, collect(planes).filter((id) => { const s = findShape(this.nodes, id); return !!s && inContext(s, this.inGroup); }), this.inGroup);
    if (!found.length) {
      const elsewhere = collect(planesOf(this.nodes).filter((pl) => !planes.includes(pl))).length;
      if (elsewhere) this.ui.toast(`Keine Form in der gewählten Ebene, ${elsewhere} in anderen: in der Liste dazuwählen (Umschalt oder nach rechts wischen)`);
    }
    this.setSelection(add ? [...this.selection.filter((id) => !found.includes(id)), ...found] : found);
  }

  private toolMove(pointerId: number, p: Pt): void {
    const g = this.gesture;
    if (!g || g.pointerId !== pointerId) {
      this.paths.move(pointerId, p, this.mods);
      return;
    }
    if (g.kind === 'empty') {
      if (g.orbit) this.views.orbit(p.x - g.last.x, p.y - g.last.y);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_DIST) g.moved = true;
      g.last = p;
      if (!g.orbit) this.drawOverlay();
      return;
    }
    if (g.kind === 'create') {
      const plane = findPlane(this.nodes, g.plane);
      const b = plane ? this.paths.snapPoint(plane, p) : null;
      if (b) g.b = b;
      this.drawOverlay();
      return;
    }
    if (g.kind === 'sketchMove' || g.kind === 'sketchScale') {
      const k = this.nodes.find((n) => n.id === g.id) as ZoneSketch | undefined;
      const plane = k ? findPlane(this.nodes, k.parent) : undefined;
      const at = plane ? this.planePoint(plane, p) : null;
      if (!k || !at) return;
      if (g.kind === 'sketchMove') {
        k.x = g.orig.x + (at.x - g.start.x);
        k.y = g.orig.y + (at.y - g.start.y);
      } else {
        // gleichmäßig: das Verhältnis bleibt, die Ecke gegenüber steht
        const d0 = Math.hypot(g.h0.x - g.anchor.x, g.h0.y - g.anchor.y) || 1;
        const kk = Math.max(0.05, Math.hypot(at.x - g.anchor.x, at.y - g.anchor.y) / d0);
        k.w = g.orig.w * kk;
        k.h = g.orig.h * kk;
        k.x = g.anchor.x + (g.orig.x - g.anchor.x) * kk;
        k.y = g.anchor.y + (g.orig.y - g.anchor.y) * kk;
      }
      this.changed();
      return;
    }
    if (g.kind === 'rotate') {
      const plane = findPlane(this.nodes, g.plane);
      const at = plane ? this.planePoint(plane, p) : null;
      if (!at) return;
      let a = Math.atan2(at.y - g.pivot.y, at.x - g.pivot.x) - g.a0;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      // mit Umschalt in Schritten von 15°
      if (this.shiftDown) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      g.angle = a;
      for (const [id, o] of g.orig) {
        const s = findShape(this.nodes, id);
        if (s) rotateShape(s, o, g.pivot, a);
      }
    } else if (g.kind === 'move') {
      for (const [id, o] of g.orig) {
        const s = findShape(this.nodes, id);
        const plane = s ? findPlane(this.nodes, s.parent) : undefined;
        const a0 = plane ? this.planePoint(plane, g.start) : null;
        const a1 = plane ? this.planePoint(plane, p) : null;
        if (!s || !a0 || !a1) continue;
        // mit Umschalt waagrecht, senkrecht oder schräg in der Ebene (wie in Illustrator)
        const d = this.shiftDown ? constrain45(a0, a1) : a1;
        s.x = o.x + (d.x - a0.x);
        s.y = o.y + (d.y - a0.y);
      }
    } else {
      const plane = findPlane(this.nodes, g.plane);
      const at = plane ? this.planePoint(plane, p) : null;
      if (!at) return;
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
      for (const [id, o] of g.orig) {
        const s = findShape(this.nodes, id);
        if (!s) continue;
        s.sx = o.sx * kx;
        s.sy = o.sy * ky;
        s.x = g.anchor.x + (o.x - g.anchor.x) * kx;
        s.y = g.anchor.y + (o.y - g.anchor.y) * ky;
      }
    }
    this.changed();
  }

  private toolUp(pointerId: number, p: Pt): void {
    const g = this.gesture;
    if (!g || g.pointerId !== pointerId) {
      this.paths.up(pointerId);
      return;
    }
    this.gesture = null;
    if (g.kind === 'empty') {
      // Rechteck: Formen wählen; Tippen ins Leere hebt die Auswahl auf (die aktive Ebene bleibt); Kreisen nicht
      if (g.moved && !g.orbit) this.regionSelect(g.start, g.last, g.add);
      else if (!g.moved && !g.add) {
        this.inGroup = [];
        if (this.selection.length) this.setSelection([]);
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
          w = g.shape === 'rect' ? 10 : g.shape === 'arch' ? 8 : 9;
          h = g.shape === 'arch' ? 10 : 6;
          cx = g.a.x;
          cy = g.a.y;
        }
        const path = primitivePath(g.shape, Math.max(0.1, w), Math.max(0.1, h));
        const s = newShape(this.nodes, plane.id, path, cx, cy, placeholderFill(plane.z));
        s.name = `${{ rect: 'Rechteck', ellipse: 'Ellipse', arch: 'Bogen' }[g.shape]} ${s.id.slice(1)}`;
        this.nodes.push(s);
        this.selected = s.id;
        this.active = plane.id;
      }
      if (this.history.commit(this.nodes)) this.changed();
      this.drawOverlay();
      return;
    }
    if (g.kind === 'move' && Math.hypot(p.x - g.start.x, p.y - g.start.y) < TAP_DIST) {
      const id = this.pickShape(g.start)?.id ?? null;
      const shape = id ? findShape(this.nodes, id) : undefined;
      if (g.tap && shape && g.tap === shape.id) {
        this.history.cancel();
        this.inGroup = (shape.groups ?? []).slice(0, this.inGroup.length + 1);
        this.lastPick = null;
        this.setSelection([...unitShapes(this.nodes, shape, this.inGroup).map((s) => s.id).filter((x) => x !== shape.id), shape.id]);
        this.ui.toast('In der Gruppe: Formen einzeln wählen; Esc oder ins Leere tippen verlässt sie');
        return;
      }
      this.lastPick = shape ? { id: shape.id, t: performance.now(), x: p.x, y: p.y } : null;
    } else if (g.kind === 'move') this.lastPick = null;
    if (g.kind === 'rotate' && Math.abs(g.angle) > 1e-6) this.ui.toast(`um ${Math.round((g.angle * 180) / Math.PI)}° gedreht (mit Umschalt in 15°-Schritten)`);
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
    this.setMods(e);
    let handled = true;
    if (!cmd && isPathTool(this.tool) && this.paths.key(k)) handled = true;
    else if (cmd && k === 'z') e.shiftKey ? this.redo() : this.undo();
    else if (cmd && k === 'y') this.redo();
    else if (cmd && k === 's') void this.save();
    else if (cmd && k === 'd') this.duplicate();
    else if (cmd && k === 'c') this.copy();
    else if (cmd && k === 'x') this.copy(true);
    else if (cmd && k === 'v') this.paste();
    else if (cmd && k === 'a') this.selectAll();
    else if (cmd && k === 'g') e.shiftKey ? this.ungroupSelected() : this.groupSelected();
    else if (cmd) handled = false;
    else if (e.shiftKey && k === 'h') this.flip('x');
    else if (e.shiftKey && k === 'v') this.flip('y');
    else if (k === 'v') this.setTool('select');
    else if (k === 'a') this.setTool('direct');
    else if (k === 'q') this.setTool('lasso');
    else if (k === 'p') this.setTool(e.shiftKey ? 'curve' : 'pen');
    else if (k === 'o') this.setTool('band');
    else if (k === 'b') this.setTool('brush');
    else if (k === 'k') this.setTool('knife');
    else if (k === 'm') this.setTool('rect');
    else if (k === 'l') this.setTool('ellipse');
    else if (k === 'u') this.setTool(this.tool === 'rect' ? 'ellipse' : this.tool === 'ellipse' ? 'arch' : 'rect');
    else if (k === '1') this.setView('game');
    else if (k === '2') this.setView('front');
    else if (k === '3') this.setView('free');
    else if (k === '4') this.setView('side');
    else if (k === 'tab') this.setBuilding(false);
    else if (k === ' ') this.spaceDown = true;
    else if (k === 'escape') this.escape();
    else if (k === 'delete' || k === 'backspace') this.deleteShape();
    else if (k === ']') this.orderShape(1);
    else if (k === '[') this.orderShape(-1);
    else if (k.startsWith('arrow') && this.selection.length) {
      const step = e.shiftKey ? 1 : 0.1;
      this.edit(() => {
        for (const s of this.selectedShapes()) {
          if (k === 'arrowleft') s.x -= step;
          if (k === 'arrowright') s.x += step;
          if (k === 'arrowup') s.y += step;
          if (k === 'arrowdown') s.y -= step;
        }
      });
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') this.spaceDown = false;
    this.setMods(e);
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
    this.sketches.dispose();
    this.ui.destroy();
  }
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
