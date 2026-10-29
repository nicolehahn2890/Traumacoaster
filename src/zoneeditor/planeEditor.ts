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
import { fieldsOf, fieldToNode, type ZoneFile } from '@/zone/types';
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
  airOf,
  lightOf,
  lightIn,
  LIGHT_DEFAULT,
  bakeSwatch,
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
  setFaceFill,
  slicesToNodes,
  isFieldNode,
  isStationNode,
  styleMap,
  stylesOf,
  swatchesOf,
  swatchMap,
  transferShape,
  worldToPlane,
  type HoldView,
  type ZoneNode,
  type ZonePlane,
  type ZoneShape,
  fieldNodesOf,
  fieldFrames,
  FIELD_MIN,
  type ZoneFieldNode,
} from '@/zone/nodes';
import { History } from './history';
import { EditorOverlay, emptyOverlay } from './overlay';
import { SketchLayer } from './sketches';
import { constrain45, NO_MODS, PathTools, regionRing, regionTest, simplifyShape, type Mods, type PathTool } from './pathTools';
import { booleanShapes, type BoolOp } from '@/zone/pathfinder';
import { evalLayers, gradientT, hexToRgb, isEarle, isGradient, isHex, MAX_LAYERS, MIST_MAX, paintLayers, rampOf, RAMP, resolveColor, rgbToHex, type GradientFill, type GradientStop, type PaintColor, type ZoneFill } from '@/zone/paint';
import { crownFor, earleShape, freshEarle, type EarlePreset } from '@/zone/earle';
import { crownParamsOf, fillParams, setCrownParam, setFillParam, setWaveParam, waveParamsOf } from './fillParams';
import { WAVE_DEFAULT } from '@/zone/edgeWave';

/** Zeilen der Punktkrone und der Kantenwelle im Füllstapel (keine Füllungen, sondern Merkmale der Form) */
const CROWN_ROW = -10;
const WAVE_ROW = -11;
import { addStop, lineT, moveStop, ownPaint, readGradient, removeGradient, removeStop, reverseStops, setMid, targetBox, topGradient, writeGradient, writePaint, type GradKind, type GradLine, type GradTarget } from '@/zone/gradients';
import type { StackAddKind, StackRow, StackView } from './stackPanel';
import { bakeStyle, linkedStyle, linkStyle, paintToStyle, pasteStyle, styleFromClip, unlinkStyle, type StyleClip } from '@/zone/styles';
import { DEFAULT_MATERIAL, dockEdges, faceMaterial, setFaceMaterial, stationOf, toggleDock, type DockEdge } from '@/zone/dock';
import { faceAt, faceBox, type Face } from '@/zone/faces';
import type { ColorMenuHost, PickPhase } from './colorMenu';
import { dotSize, EditorUi, mistSize, type Isolate, type LayerRow, type Tool } from './ui';
import { EditorViews, type ViewMode } from './views';

export interface PlaneEditorHost {
  world: WorldRenderer;
  view: WorldView;
  cameraPanel: CameraTiltPanel | null;
  /** Zeichenfläche des Spiels (#app): ihre Zeiger fängt der Editor beim Bauen ab */
  surface: HTMLElement;
  /** Bedienung des Spiels (HUD, Overlays, Kamera-Panel) zeigen oder verbergen */
  setGameUi(on: boolean): void;
  /** Ebenen haben sich geändert, gleich wird gespielt (Pinsel und Stützen lesen sie neu, Stufe 4) */
  planesChanged?(): void;
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
  | { kind: 'empty'; pointerId: number; start: Pt; last: Pt; orbit: boolean; moved: boolean; add: boolean }
  /** „Weiter füllen“: jede Fläche unter dem Zeiger bekommt die Farbe (Figma: über mehrere Flächen ziehen) */
  | { kind: 'fill'; pointerId: number; done: Set<string> }
  /** Verlauf: neu aufziehen (von a), ein Ende ziehen, einen Stopp schieben (weg von der Linie: löschen), eine Mitte schieben */
  | { kind: 'gradNew'; pointerId: number; plane: string; a: Pt; start: Pt; moved: boolean }
  | { kind: 'gradEnd'; pointerId: number; end: 'a' | 'b' }
  | { kind: 'gradStop'; pointerId: number; index: number; off: boolean }
  | { kind: 'gradMid'; pointerId: number; index: number }
  /** Farbnebel (Stufe 5): Tupfer entlang des Wegs in eine Fläche (at: Punkt der Fläche, wenn die Form mehrere hat) */
  | { kind: 'mist'; pointerId: number; shape: string; at: Pt | null; last: Pt | null; full: boolean }
  /** Punktpinsel (Stufe 5): Punkte entlang des Wegs setzen (auf die Form shape) oder wegnehmen (alle Formen unter dem Pinsel) */
  | { kind: 'dots'; pointerId: number; shape: string | null; last: Pt | null; erase: boolean }
  /** Feld (Stufe 4): verschieben (innen) oder an Kante oder Ecke ziehen; Weg in Metern der Spur-0-Ebene, vom Anfang aus */
  | { kind: 'field'; pointerId: number; id: string; mode: FieldGrip; start: Pt; orig: { x0: number; x1: number; y0: number; y1: number } };

/** Griff eines Felds: innen (verschieben), Kanten n, s, o, w und Ecken (Himmelsrichtungen, n oben) */
type FieldGrip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Ziel des Verlaufswerkzeugs als Verweis: Form (at: Punkt im Pfad einer Fläche) oder Ebene */
type GradRef = { shape: string; at: Pt | null } | { plane: string };

type Nav = { kind: 'touch'; ids: [number, number]; center: Pt; dist: number; count: number; t: number; moved: boolean } | { kind: 'mouse'; pointerId: number; last: Pt; orbit: boolean };

/** Ecken und Kantenmitten des Auswahlrahmens: Gegenstück und Achse je Griff */
const OPPOSITE = [2, 3, 0, 1, 6, 7, 4, 5];
const AXIS: Array<'xy' | 'x' | 'y'> = ['xy', 'xy', 'xy', 'xy', 'y', 'x', 'y', 'x'];
const BACKUP_KEY = (zone: string) => `tc.zoneeditor.${zone}`;
/** zuletzt benutzte Farben (Farbmenü), für alle Zonen */
const RECENT_KEY = 'tc.zoneeditor.recent';
/** so lange hält ein Finger still, bis die Pipette greift (Plan 4.2 Grundsatz 3) */
const HOLD_TIME = 450;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(isHex).slice(0, 10) : [];
  } catch {
    return [];
  }
}
const DEG = Math.PI / 180;
const TAP_TIME = 260;
const TAP_DIST = 12;
/** Luftperspektive, wenn die Zone noch keine hat (Platzhalter: kühles helles Blau, ab 24 m, voll bei 140 m wie der Nebel) */
const AIR_DEFAULT = { color: '#c8d6e2', near: 24, far: 140, amount: 0.5 };
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
  /** aktuelle Farbe (Farbknopf); null: neue Formen bekommen die Platzhalter-Farbe nach Tiefe */
  private color: PaintColor | null = null;
  /** Auswahl, von der die aktuelle Farbe zuletzt geholt wurde */
  private colorSel = '';
  /** zuletzt benutzte Farben, neueste zuerst (Werte) */
  private recentColors: string[] = loadRecent();
  /** „Weiter füllen“ nach dem Fallenlassen einer Farbe */
  private fillMode: PaintColor | null = null;
  /** Fläche, auf die eine gezogene Farbe fiele (Bildpunkt) */
  private dropAt: Pt | null = null;
  /** Pipette mit dem Finger: Zeiger, Zeitgeber, ob sie schon greift; Lupe */
  private fingerHold: { id: number; timer: number; on: boolean } | null = null;
  private loupe: (Pt & { color: string }) | null = null;
  /**
   * Verlaufswerkzeug: Ziele (Formen, eine Fläche über einen Punkt im Pfad, oder eine Ebene), bearbeitete Art, gewählter
   * Stopp, bearbeitete Schicht im Füllstapel (null: der oberste Verlauf der Art)
   */
  private grad: { targets: GradRef[]; kind: GradKind; stop: number | null; layer: number | null } | null = null;
  /** Füllstapel offen: der Auswahl (paint) oder der aktiven Ebene (plane); gewählte Zeile (-1 Grundfarbe, -2 Luftfarbe) */
  private stackOpen: 'paint' | 'plane' | null = null;
  private stackSel: number | null = null;
  /** Ziel, zu dem die gewählte Zeile gehört (wechselt es, gilt sie nicht mehr) */
  private stackKey = '';
  /** Stand der Knoten (zählt bei jeder Änderung hoch; Zwischenspeicher wie die Andockkanten hängen daran) */
  private version = 0;
  private dockCache: { version: number; edges: DockEdge[] } | null = null;
  /** im Werkzeug Andockkanten angetippte Fläche (Form, Punkt im Pfad) */
  private dockFace: { shape: string; at: Pt } | null = null;
  /** Station setzen: die nächste angetippte Andockkante bekommt sie */
  private stationPlacing = false;
  /** gewähltes Feld im Werkzeug Felder */
  private fieldSel: string | null = null;
  /** Spur-0-Ebene als Bezug für Felder (Meter der Bühne, wie die Felder des Klötzchen-Editors) */
  private readonly ground0: ZonePlane = { id: '_feld', kind: 'plane', parent: null, name: '', z: 0, x: 0, y: 0, scale: 1, role: 'play' };
  /** kopierter Anstrich (Cmd+Wahl+C, Pipette mit Wahltaste); mit Kennung, wenn er von einem Stil kam */
  private styleClip: StyleClip | null = null;
  /** Vorschaubilder der Stile (Daten-URL je Inhalt) */
  private readonly stylePreviews = new Map<string, string>();
  /** Farbe fiel auf eine Fläche mit Verlauf: Grundfarbe oder Verlaufsstopp? (Plan 4.6) */
  private dropChoice: { color: PaintColor; shape: string; at: Pt | null; t: number } | null = null;
  private width = 800;
  private height = 600;

  constructor(
    private readonly host: PlaneEditorHost,
    private readonly zone: ZoneFile,
  ) {
    this.nodes = zone.nodes ?? [];
    // Felder des Klötzchen-Editors werden Feldknoten (Stufe 4); die Zonendatei behält sie beim Sichern als Spiegel
    if (!this.nodes.some(isFieldNode) && zone.fields.length) this.nodes.push(...zone.fields.map(fieldToNode));
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
      fillFor: (plane) => this.color ?? placeholderFill(plane.z),
      hitRadius: () => this.overlay.handleSize + 6,
      snapping: () => this.snapOn,
      gridStep: (plane) => (this.gridOn ? this.gridStep(plane) : null),
      visible: (plane) => this.planeShown(plane),
    });
    this.ui = new EditorUi(this.actions(), zone.name, this.overlay.el, this.colorHost());
    // Standbild (Tor S5): ohne Leisten, damit ein Bildschirmfoto vom Handy nur das Spielbild zeigt
    if (this.still) document.head.append(Object.assign(document.createElement('style'), { textContent: '[class^="ze-"],[class*=" ze-"]{display:none!important}' }));
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

  /**
   * Felder der Zonendatei im Gleichschritt mit den Feldknoten (Spiel, Handy und Klötzchen-Editor lesen sie über fieldsOf;
   * ohne Feldknoten fiele es sonst auf die alten Felder zurück, ein entferntes letztes Feld käme wieder)
   */
  private syncFields(): void {
    this.zone.fields = this.nodes.some(isFieldNode) ? fieldsOf(this.zone) : [];
  }

  /** nach jeder Änderung: neu zeichnen, Liste und Leisten nachführen, Sicherungskopie planen */
  private changed(markDirty = true): void {
    // Gruppen bleiben Läufe benachbarter Ebenen; leere fallen weg
    const norm = normalizeGroups(this.nodes);
    if (norm.length !== this.nodes.length) {
      this.nodes = norm;
      this.zone.nodes = norm;
    }
    this.syncFields();
    if (this.groupSel && !findGroup(this.nodes, this.groupSel)) this.groupSel = null;
    normalizeShapeGroups(this.nodes);
    const alive = this.inGroup.findIndex((g) => groupMembersOf(this.nodes, g).length < 2);
    if (alive >= 0) this.inGroup = this.inGroup.slice(0, alive);
    this.meshDirty = true;
    this.uiDirty = true;
    this.ranks = null;
    this.version++;
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
      // Pinsel und Stützen lesen die Ebenen neu (Tiefe aus Ebenen, Andockkanten)
      this.host.planesChanged?.();
    }
    this.uiDirty = true;
  }

  // ------------------------------------------------------------------ Bild

  /**
   * Standbild (Tor S5, `&bild` in der Adresse): die Leisten des Editors sind aus, der Spielblick nimmt den ganzen Bildschirm;
   * Ziehen und Zoomen gehen weiter
   */
  private readonly still = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bild');

  /** freier Bildbereich zwischen den Leisten des Editors (Bildschirm-Pixel); im Standbild der ganze Bildschirm */
  freeRect(): { x0: number; y0: number; x1: number; y1: number } {
    return this.still ? { x0: 0, y0: 0, x1: this.width, y1: this.height } : this.ui.freeRect(this.width, this.height);
  }

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
      filling: this.building && this.fillMode ? this.resolve(this.fillMode) : null,
      grad: this.building && this.tool === 'gradient' && !this.fillMode ? this.gradInfo() : null,
      dotBrush: this.building && this.tool === 'dotbrush' ? { ...this.dotBrush } : null,
      mist: this.building && this.tool === 'mist' ? { ...this.mistBrush, color: this.resolve(this.currentColor()) } : null,
      dropChoice: this.building && this.dropChoice ? this.resolve(this.dropChoice.color) : null,
      material: this.building ? this.selectionMaterial() : null,
      dock: this.building && this.tool === 'dock' && !this.fillMode ? this.dockInfo() : null,
      field: this.building && this.tool === 'field' && !this.fillMode ? this.fieldInfo() : null,
    });
    this.ui.setStack(this.stackView());
    this.syncColorFromSelection();
    this.ui.colorRefresh();
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
    st.loupe = this.loupe;
    if (this.building && this.tool === 'gradient') this.gradOverlay(st);
    if (this.building && this.tool === 'dock') this.dockOverlay(st);
    if (this.building && this.tool === 'field') this.fieldOverlay(st);
    if (this.building && (this.tool === 'mist' || this.tool === 'dotbrush') && this.brushAt) st.brush = this.brushRing(this.brushAt);
    const tf = this.dropAt ? this.faceAtScreen(this.dropAt) : null;
    if (tf) st.target = [tf.face.outline, ...tf.face.holes].map((r) => r.map(([x, y]) => this.screenOf(tf.plane, shapeToPlane(tf.shape, x, y), tf.shape)).filter((q): q is Pt => !!q));
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
      // Rahmen mit Griffen nur dort, wo man ihn greifen kann (nicht beim Verlauf und bei der Pipette)
      const box = this.tool === 'gradient' || this.tool === 'pipette' ? null : this.selectionBox();
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
      fillDone: () => this.endFill(),
      setMaterial: (m) => this.setMaterial(m),
      stationPlace: () => {
        this.stationPlacing = !this.stationPlacing;
        this.uiDirty = true;
      },
      stationFlip: () => this.edit(() => {
        const st = this.nodes.find(isStationNode);
        if (st) st.dir = st.dir === 1 ? -1 : 1;
      }),
      stationRemove: () => {
        this.edit(() => {
          this.nodes = this.nodes.filter((n) => !isStationNode(n));
          this.zone.nodes = this.nodes;
        });
      },
      fieldAdd: () => this.fieldAdd(),
      fieldRename: () => {
        const f = this.nodes.find((n): n is ZoneFieldNode => isFieldNode(n) && n.id === this.fieldSel);
        const name = f ? window.prompt('Name des Felds', f.name) : null;
        if (f && name !== null && name.trim()) this.edit(() => (f.name = name.trim().slice(0, 40)));
      },
      fieldRemove: () => {
        const id = this.fieldSel;
        if (!id) return;
        this.edit(() => {
          this.nodes = this.nodes.filter((n) => n.id !== id);
          this.zone.nodes = this.nodes;
        });
        this.fieldSel = null;
        this.uiDirty = true;
        this.drawOverlay();
      },
      mistBrushSet: (patch) => {
        Object.assign(this.mistBrush, patch);
        this.uiDirty = true;
      },
      dotBrushSet: (patch) => {
        Object.assign(this.dotBrush, patch);
        this.uiDirty = true;
      },
      gradKind: (kind) => {
        if (this.grad) {
          this.grad.kind = kind;
          this.grad.stop = null;
          this.grad.layer = null;
        }
        this.gradKind = kind;
        this.uiDirty = true;
        this.drawOverlay();
      },
      gradRadial: (radial) => this.gradEdit((g) => ({ radial: radial && !g.radial ? true : radial ? undefined : false })),
      gradReverse: () => this.gradEdit((g) => ({ stops: reverseStops(g.stops) })),
      gradStopAlpha: () =>
        this.gradEdit((g) => {
          const i = this.grad?.stop ?? -1;
          if (!g.stops[i]) return {};
          const steps = [1, 0.75, 0.5, 0.25, 0];
          const k = steps.findIndex((v) => Math.abs(v - g.stops[i].a) < 0.01);
          const stops = g.stops.map((x) => ({ ...x }));
          stops[i].a = steps[(k + 1) % steps.length];
          return { stops };
        }),
      gradStopDelete: () => {
        const i = this.grad?.stop ?? -1;
        this.gradEdit((g) => (g.stops.length > 2 && g.stops[i] ? { stops: removeStop(g.stops, i) } : {}));
        if (this.grad) this.grad.stop = null;
      },
      gradRemove: () => {
        const kind = this.grad?.kind ?? 'gradient';
        const layer = this.grad?.layer ?? null;
        const ts = this.gradTargets();
        if (!ts.length) return;
        this.edit(() => {
          const styles = styleMap(this.nodes);
          for (const t of ts) removeGradient(t, kind, styles, layer);
        });
        if (this.grad) {
          this.grad.stop = null;
          this.grad.layer = null;
        }
      },
      dropChoice: (which) => this.resolveDropChoice(which),
      stackOpen: (which) => {
        this.stackOpen = this.stackOpen === which ? null : which;
        this.stackSel = null;
        this.uiDirty = true;
      },
      stackClose: () => {
        this.stackOpen = null;
        this.stackSel = null;
        this.uiDirty = true;
      },
      stackSelect: (i) => {
        this.stackSel = i;
        this.uiDirty = true;
      },
      stackOpacity: (i, v, phase) => i === CROWN_ROW || i === WAVE_ROW ? undefined : this.stackEdit((p) => {
        if (i < 0) p.opacity = v;
        else if (p.fills?.[i]) p.fills[i].opacity = v;
      }, phase),
      stackBlend: (i, m) => this.stackEdit((p) => {
        const f = p.fills?.[i];
        if (f && f.type !== 'fade') f.blend = m;
      }),
      stackHide: (i) => i === CROWN_ROW || i === WAVE_ROW ? this.shapeEdit((s) => { const f = i === CROWN_ROW ? s.crown : s.wave; if (f) { if (f.hidden) delete f.hidden; else f.hidden = true; } }) : this.stackEdit((p) => {
        const f = p.fills?.[i];
        if (!f) return;
        if (f.hidden) delete f.hidden;
        else f.hidden = true;
      }),
      stackRemove: (i) => {
        if (i === CROWN_ROW || i === WAVE_ROW) {
          this.shapeEdit((s) => (i === CROWN_ROW ? delete s.crown : delete s.wave));
          this.stackSel = null;
          return;
        }
        this.stackEdit((p) => {
          p.fills = (p.fills ?? []).filter((_, k) => k !== i);
        });
        this.stackSel = null;
      },
      stackMove: (i, dir) => {
        let to = i;
        this.stackEdit((p) => {
          const fills = p.fills ?? [];
          to = i + dir;
          if (to < 0 || to >= fills.length) return;
          [fills[i], fills[to]] = [fills[to], fills[i]];
        });
        this.stackSel = to;
      },
      stackAdd: (kind) => this.stackAdd(kind),
      stackGradient: (i) => {
        const t = this.stackTarget();
        const f = t ? ownPaint(t, styleMap(this.nodes)).fills?.[i] : undefined;
        if (!t || !f || !isGradient(f)) return;
        this.grad = { targets: [this.gradRefOf(t)], kind: f.type, stop: null, layer: i };
        this.setTool('gradient');
      },
      stackParam: (i, key, v, phase) =>
        i === CROWN_ROW ? this.shapeEdit((s) => s.crown && setCrownParam(s.crown, key, v), phase) : i === WAVE_ROW ? this.shapeEdit((s) => s.wave && setWaveParam(s.wave, key, v), phase) : this.stackParam(i, key, v, phase),
      stackZoneColor: (i) => this.stackEdit((p) => {
        const f = p.fills?.[i];
        if (f && f.type !== 'grain' && isEarle(f)) delete f.color;
      }),
      stackEarle: (preset) => this.stackEarle(preset),
      stackLight: (patch, phase) => this.stackLight(patch, phase),
      stackAir: (patch, phase) => this.stackAir(patch, phase),
      stackStyle: (what) => this.styleCommand(what),
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
    if (this.fillMode) this.endFill();
    if (this.grad) this.grad.stop = null;
    this.stationPlacing = false;
    this.brushAt = null;
    this.paths.setTool(isPathTool(t) ? t : null);
    this.ui.setTool(t);
    this.updateCursor();
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** Mauszeiger: Zeichenstift mit Befehlstaste wie die Direktauswahl, mit Wahltaste das Ankerpunkt-Werkzeug */
  private updateCursor(): void {
    const t = this.tool;
    this.host.surface.style.cursor = this.fillMode ? 'cell' : t === 'select' || t === 'direct' || (t === 'pen' && this.mods.cmd) ? '' : t === 'pen' && this.mods.alt ? 'pointer' : 'crosshair';
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
    // Spiegel für den Klötzchen-Editor und ältere Leser: die Felder auch als Felder der Zonendatei
    this.syncFields();
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
    const nodes = z.nodes ?? [];
    if (!nodes.some(isFieldNode) && z.fields.length) nodes.push(...z.fields.map(fieldToNode));
    this.setNodes(nodes);
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
        this.endHold(false);
        this.cancelGesture();
        const [a, b] = [t[0][1], t[1][1]];
        this.nav = { kind: 'touch', ids: [t[0][0], t[1][0]], center: mid(a, b), dist: dist(a, b), count: t.length, t: Math.min(a.t, b.t), moved: false };
        return;
      }
      // ein einzelner Finger zeichnet nicht, sobald ein Stift im Spiel war; lange halten ist die Pipette
      if (this.penSeen && !this.still) {
        this.startHold(e.pointerId);
        return;
      }
    }
    // Standbild: ein Finger, Stift oder Maus verschiebt nur das Bild, an der Zone ändert sich nichts
    if (this.still) {
      this.nav = { kind: 'mouse', pointerId: e.pointerId, last: p, orbit: false };
      return;
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
    // Größenring der Pinsel folgt Maus und Pencil (unter dem Finger sähe man ihn nicht)
    if (this.tool === 'mist' || this.tool === 'dotbrush') {
      this.brushAt = e.pointerType === 'touch' ? null : this.local(e);
      this.drawOverlay();
    }
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
    if (this.fingerHold?.id === e.pointerId) {
      if (this.fingerHold.on) this.holdSample(p);
      else if (ptr.moved) this.endHold(false);
      return;
    }
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
    if (this.fingerHold?.id === e.pointerId) {
      this.endHold(e.type === 'pointerup');
      return;
    }
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
    if (this.fillMode) {
      this.history.begin(this.nodes);
      this.gesture = { kind: 'fill', pointerId, done: new Set() };
      this.fillAt(this.gesture, p);
      return;
    }
    if (this.tool === 'gradient') {
      this.gradDown(pointerId, p);
      return;
    }
    if (this.tool === 'dock') {
      this.dockDown(p);
      return;
    }
    if (this.tool === 'dotbrush') {
      this.dotDown(pointerId, p);
      return;
    }
    if (this.tool === 'mist') {
      this.mistDown(pointerId, p);
      return;
    }
    if (this.tool === 'field') {
      this.fieldDown(pointerId, p);
      return;
    }
    if (this.tool === 'pipette' && this.mods.alt) {
      // Pipette mit Wahltaste: den ganzen Anstrich aufnehmen (und auf die Auswahl legen, wie in Illustrator)
      const f = this.faceAtScreen(p, true);
      const clip = f ? paintToStyle({ shape: f.shape, face: shapeFaces(f.shape).length > 1 ? f.face : null }, styleMap(this.nodes)) : null;
      if (!clip) return;
      this.styleClip = clip;
      const ts = this.styleTargets().filter((t) => t.shape.id !== f?.shape.id || t.face !== null);
      if (ts.length) {
        this.edit(() => {
          for (const t of ts) pasteStyle(t, clip, styleMap(this.nodes));
        });
        this.ui.toast('Anstrich aufgenommen und auf die Auswahl gelegt');
      } else this.ui.toast('Anstrich aufgenommen (Cmd+Wahl+V fügt ihn ein)');
      return;
    }
    if (this.tool === 'pipette') {
      const c = this.sampleColor(p);
      if (c) {
        this.takeColor(c);
        this.ui.toast(`Farbe aufgenommen: ${c}`);
      }
      return;
    }
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
    if (g.kind === 'fill') {
      this.fillAt(g, p);
      return;
    }
    if (g.kind === 'dots') {
      this.dotDab(g, p);
      return;
    }
    if (g.kind === 'mist') {
      this.mistDab(g, p);
      return;
    }
    if (g.kind === 'field') {
      this.fieldMove(g, p);
      return;
    }
    if (g.kind === 'gradNew' || g.kind === 'gradEnd' || g.kind === 'gradStop' || g.kind === 'gradMid') {
      this.gradMove(g, p);
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
    // (der Punktpinsel setzt noch bis zum Punkt des Loslassens)
    if (g.kind === 'dots') this.dotDab(g, p);
    if (g.kind === 'mist') this.mistDab(g, p);
    if (g.kind === 'fill' || g.kind === 'field' || g.kind === 'dots' || g.kind === 'mist') {
      if (this.history.commit(this.nodes)) this.changed();
      return;
    }
    if (g.kind === 'gradNew' || g.kind === 'gradEnd' || g.kind === 'gradStop' || g.kind === 'gradMid') {
      this.gradUp(g);
      return;
    }
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
        const s = newShape(this.nodes, plane.id, path, cx, cy, this.color ?? placeholderFill(plane.z));
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

  // ------------------------------------------------------------------ Farbe (Stufe 3)

  /** aktuelle Farbe, wie sie der Farbknopf zeigt (ohne gewählte Farbe der Platzhalter der aktiven Ebene) */
  private currentColor(): PaintColor {
    return this.color ?? placeholderFill(this.plane?.z ?? 0);
  }

  /** Wert einer Farbe im aktuellen Look */
  private resolve(c: PaintColor): string {
    return resolveColor(c, swatchMap(this.nodes), this.host.world.currentLook);
  }

  private colorHost(): ColorMenuHost {
    return {
      current: () => this.currentColor(),
      resolve: (c) => this.resolve(c),
      pick: (c, phase) => this.pickColor(c, phase),
      setCurrent: (c) => {
        this.color = c;
        this.uiDirty = true;
      },
      swatches: () => swatchesOf(this.nodes),
      addSwatch: (hex) => {
        let id: string | null = null;
        this.edit(() => {
          id = nextNodeId(this.nodes, 'c');
          this.nodes.push({ id, kind: 'swatch', name: `Farbe ${id.slice(1)}`, color: hex });
        });
        return id;
      },
      editSwatch: (id, patch, phase) => this.editSwatch(id, patch, phase),
      deleteSwatch: (id) => {
        this.edit(() => {
          bakeSwatch(this.nodes, id);
          this.nodes = this.nodes.filter((n) => n.id !== id);
          this.zone.nodes = this.nodes;
        });
        if (this.color === `@${id}`) this.color = null;
        this.ui.toast('Feld gelöscht; Flächen behalten seine Farbe als Wert');
      },
      recent: () => this.recentColors,
      dropHover: (x, y) => {
        const r = this.host.surface.getBoundingClientRect();
        this.dropAt = { x: x - r.left, y: y - r.top };
        this.drawOverlay();
      },
      drop: (c, x, y) => this.dropColor(c, x, y),
      dropEnd: () => {
        this.dropAt = null;
        this.drawOverlay();
      },
      styleList: () => {
        const styles = styleMap(this.nodes);
        const ts = this.styleTargets();
        return stylesOf(this.nodes).map((y) => ({ id: y.id, name: y.name, preview: this.stylePreview(y), on: ts.length > 0 && ts.every((t) => linkedStyle(t, styles) === y.id) }));
      },
      applyStyle: (id) => {
        const style = styleMap(this.nodes).get(id);
        const ts = this.styleTargets();
        if (!style) return;
        if (!ts.length) {
          this.ui.toast('Erst eine Form oder Fläche wählen (oder den Stil auf eine Fläche ziehen)');
          return;
        }
        this.edit(() => {
          for (const t of this.styleTargets()) linkStyle(t, style);
        });
      },
      saveStyle: () => this.saveStyle(),
      redefineStyle: (id) => {
        const t = this.styleTargets()[0];
        const clip = t ? paintToStyle(t, styleMap(this.nodes)) : null;
        if (!clip) return;
        this.edit(() => {
          const y = stylesOf(this.nodes).find((x) => x.id === id);
          if (!y) return;
          const next = styleFromClip(id, y.name, { ...clip, style: undefined });
          Object.assign(y, { fill: next.fill });
          if (next.fills) y.fills = next.fills;
          else delete y.fills;
          if (next.opacity !== undefined) y.opacity = next.opacity;
          else delete y.opacity;
          for (const tt of this.styleTargets()) linkStyle(tt, y);
        });
        this.ui.toast('Stil neu festgelegt: alle verknüpften Flächen zeigen ihn jetzt');
      },
      renameStyle: (id, name) => this.edit(() => {
        const y = stylesOf(this.nodes).find((x) => x.id === id);
        if (y) y.name = name;
      }),
      deleteStyle: (id) => {
        this.edit(() => {
          bakeStyle(this.nodes, id);
          this.nodes = this.nodes.filter((n) => n.id !== id);
          this.zone.nodes = this.nodes;
        });
        this.ui.toast('Stil gelöscht; verknüpfte Flächen behalten sein Aussehen');
      },
      hasSelection: () => this.styleTargets().length > 0,
      previewLook: (look) => {
        const w = this.host.world;
        if (look) {
          if (this.lookBefore === null) this.lookBefore = w.currentLook;
          w.setLook(look);
        } else if (this.lookBefore !== null) {
          w.setLook(this.lookBefore);
          this.lookBefore = null;
        }
        this.meshDirty = true;
        this.uiDirty = true;
      },
    };
  }

  /** Look vor der Vorschau eines Palettenfelds (wird danach wiederhergestellt) */
  private lookBefore: import('@/world/looks').LookName | null = null;

  /** Ziele für Stile: die gewählte Fläche (Direktauswahl) oder die gewählten, nicht gesperrten Formen */
  private styleTargets(): Array<{ shape: ZoneShape; face: Face | null }> {
    const free = (s: ZoneShape) => {
      const pl = findPlane(this.nodes, s.parent);
      return !s.locked && !!pl && !planeLocked(this.nodes, pl);
    };
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    if (face) return free(face.shape) ? [{ shape: face.shape, face: shapeFaces(face.shape).length > 1 ? face.face : null }] : [];
    return this.selectedShapes().filter(free).map((s) => ({ shape: s, face: null }));
  }

  /** Anstrich der Auswahl (erstes Ziel) als neuen Stil sichern und alle Ziele damit verknüpfen */
  private saveStyle(): string | null {
    const t = this.styleTargets()[0];
    const clip = t ? paintToStyle(t, styleMap(this.nodes)) : null;
    if (!clip) {
      this.ui.toast('Erst eine Form oder Fläche wählen, deren Anstrich der Stil werden soll');
      return null;
    }
    let id: string | null = null;
    this.edit(() => {
      id = nextNodeId(this.nodes, 'y');
      const y = styleFromClip(id, `Stil ${id.slice(1)}`, clip);
      this.nodes.push(y);
      for (const tt of this.styleTargets()) linkStyle(tt, y);
    });
    this.ui.toast('Als Stil gesichert und verknüpft (Farbmenü › Stile)');
    return id;
  }

  /** kleines Vorschaubild eines Stils (Füllstapel auf dem Rahmen 0 … 1 ausgewertet), zwischengespeichert */
  private stylePreview(y: import('@/zone/paint').ZoneStyle): string {
    const key = JSON.stringify([y.fill, y.fills, y.opacity, this.host.world.currentLook, swatchesOf(this.nodes)]);
    const hit = this.stylePreviews.get(key);
    if (hit) return hit;
    const pl = paintLayers({ fill: y.fill, fills: y.fills, opacity: y.opacity }, new Map(), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const W = 24;
    const H = 16;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g || !pl) return y.fill;
    const img = g.createImageData(W, H);
    const sw = swatchMap(this.nodes);
    const look = this.host.world.currentLook;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const col = evalLayers(pl.layers, (i + 0.5) / W, 1 - (j + 0.5) / H, sw, look);
        img.data.set([col.rgb[0] * 255, col.rgb[1] * 255, col.rgb[2] * 255, col.a * pl.opacity * 255], (j * W + i) * 4);
      }
    g.putImageData(img, 0, 0);
    const url = `center/cover no-repeat url(${c.toDataURL()})`;
    if (this.stylePreviews.size > 200) this.stylePreviews.clear();
    this.stylePreviews.set(key, url);
    return url;
  }

  /** Farbe als zuletzt benutzt merken (als Wert) */
  private pushRecent(c: PaintColor): void {
    const hex = this.resolve(c);
    this.recentColors = [hex, ...this.recentColors.filter((x) => x !== hex)].slice(0, 10);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(this.recentColors));
    } catch {
      /* ignore */
    }
  }

  /** Farbe aufnehmen (Pipette): wird die aktuelle, ohne die Auswahl zu ändern */
  private takeColor(hex: string): void {
    this.color = hex;
    this.pushRecent(hex);
    this.uiDirty = true;
  }

  /**
   * Farbe im Menü gewählt: wird die aktuelle und geht an die Auswahl (die gewählte Fläche der Direktauswahl oder die
   * gewählten Formen, deren Flächen dann alle diese Grundfarbe tragen; Löcher bleiben Löcher). Ziehen im Wähler ist
   * ein Schritt im Arbeitsverlauf
   */
  private pickColor(c: PaintColor, phase: PickPhase): void {
    this.color = c;
    // gewählte Zeile des Füllstapels (Grundfarbe, Farb-Füllung, Luft): die Farbe geht an sie
    const sc = this.stackColor();
    if (sc) {
      if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
      sc.set(c);
      if (phase === 'end' || phase === 'tap') {
        if (this.history.commit(this.nodes)) this.changed();
        this.pushRecent(c);
      } else this.changed();
      this.colorSel = this.selectionColorKey();
      this.uiDirty = true;
      return;
    }
    // Verlaufswerkzeug mit gewähltem Stopp: die Farbe geht an den Stopp (aller Ziele)
    const gs = this.gradStop();
    if (gs) {
      if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
      const stops = gs.stops.map((x) => ({ ...x }));
      stops[gs.index].color = c;
      this.gradApply({ stops });
      if (phase === 'end' || phase === 'tap') {
        if (this.history.commit(this.nodes)) this.changed();
        this.pushRecent(c);
      } else this.changed();
      this.colorSel = this.selectionColorKey();
      this.uiDirty = true;
      return;
    }
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    const free = (s: ZoneShape) => {
      const pl = findPlane(this.nodes, s.parent);
      return !s.locked && !!pl && !planeLocked(this.nodes, pl);
    };
    const shapes = face ? (free(face.shape) ? [face.shape] : []) : this.selectedShapes().filter(free);
    if (shapes.length) {
      if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
      if (face) setFaceFill(face.shape, face.face, c);
      else
        for (const s of shapes) {
          s.fill = c;
          const holes = s.regions?.filter((r) => r.fill === null);
          if (holes?.length) s.regions = holes;
          else delete s.regions;
        }
      if (phase === 'end' || phase === 'tap') {
        if (this.history.commit(this.nodes)) this.changed();
      } else this.changed();
      // die Auswahl hat jetzt diese Farbe; nicht gleich zurückholen
      this.colorSel = this.selectionColorKey();
    }
    if (phase === 'end' || phase === 'tap') this.pushRecent(c);
    this.uiDirty = true;
  }

  /** Feld der Zonenpalette ändern (Name, Farbe im Look, Look zurück wie Tag); Ziehen im Wähler ist ein Schritt */
  private editSwatch(id: string, patch: { name?: string; color?: string; look?: import('@/world/looks').LookName; clear?: boolean }, phase: PickPhase): void {
    const sw = swatchesOf(this.nodes).find((x) => x.id === id);
    if (!sw) return;
    if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
    if (patch.name) sw.name = patch.name;
    const look = patch.look ?? 'day';
    if (patch.clear && look !== 'day' && sw.looks) {
      delete sw.looks[look];
      if (!Object.keys(sw.looks).length) delete sw.looks;
    } else if (patch.color && look === 'day') sw.color = patch.color;
    else if (patch.color) sw.looks = { ...sw.looks, [look]: patch.color };
    if (phase === 'end' || phase === 'tap') {
      if (this.history.commit(this.nodes)) this.changed();
    } else this.changed();
  }

  /** gewählter Stopp des Verlaufswerkzeugs mit den Stopps des bearbeiteten Verlaufs */
  private gradStop(): { stops: GradientStop[]; index: number } | null {
    if (this.tool !== 'gradient' || this.grad?.stop === null || this.grad?.stop === undefined) return null;
    const st = this.gradState();
    return st && st.g.stops[this.grad.stop] ? { stops: st.g.stops, index: this.grad.stop } : null;
  }

  /** Schlüssel der Auswahl, deren Farbe der Farbknopf zeigt (gewählter Stopp, gewählte Fläche oder Formen) */
  private selectionColorKey(): string {
    if (this.stackOpen && this.stackSel !== null) return `k|${this.stackOpen}|${this.stackKey}|${this.stackSel}`;
    if (this.tool === 'gradient' && this.grad?.stop !== null && this.grad?.stop !== undefined) return `g|${JSON.stringify(this.grad.targets)}|${this.grad.stop}`;
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    return face ? `f|${face.shape.id}|${face.face.inner.join(',')}` : this.selection.join(',');
  }

  /** neue Auswahl: ihre Grundfarbe wird die aktuelle Farbe (wie in Illustrator) */
  private syncColorFromSelection(): void {
    const key = this.selectionColorKey();
    if (key === this.colorSel) return;
    this.colorSel = key;
    const sc = this.stackColor();
    const own = sc?.get();
    if (own) {
      this.color = own;
      return;
    }
    const gs = this.gradStop();
    if (gs) {
      this.color = gs.stops[gs.index].color;
      return;
    }
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    const c = face ? facePaint(face.shape, face.face).fill : this.shape?.fill;
    if (c) this.color = c;
  }

  /** Fläche unter dem Bildpunkt: Form, Ebene, Fläche, Punkt der Ebene und Punkt im Pfad; any: auch gesperrte */
  private faceAtScreen(p: Pt, any = false): { shape: ZoneShape; plane: ZonePlane; face: Face; q: Pt; local: Pt } | null {
    const hit = any ? this.host.world.planes.pick(this.views.rayAt(p.x, p.y)) : this.pickShape(p);
    const shape = hit ? findShape(this.nodes, hit.id) : undefined;
    const plane = shape ? findPlane(this.nodes, shape.parent) : undefined;
    const q = plane ? this.planePoint(plane, p) : null;
    if (!shape || !plane || !q) return null;
    const local = { x: (q.x - shape.x) / shape.sx, y: (q.y - shape.y) / shape.sy };
    const faces = shapeFaces(shape);
    const i = faceAt(faces, local.x, local.y);
    return i >= 0 ? { shape, plane, face: faces[i], q, local } : null;
  }

  /** sichtbare Farbe unter dem Bildpunkt (Füllstapel und Ebenenstapel, ohne Nebel), als Wert */
  private sampleColor(p: Pt): string | null {
    const f = this.faceAtScreen(p, true);
    if (!f) return null;
    const look = this.host.world.currentLook;
    const sw = swatchMap(this.nodes);
    const pl = paintLayers(facePaint(f.shape, f.face), styleMap(this.nodes), faceBox(f.face));
    if (!pl) return null;
    let c = evalLayers(pl.layers, f.local.x, f.local.y, sw, look);
    if (f.plane.fills?.length) c = evalLayers(f.plane.fills, f.q.x, f.q.y, sw, look, c);
    return rgbToHex(...c.rgb);
  }

  /**
   * Farbe fallen lassen (ColorDrop): mit dem Verlaufswerkzeug auf einen Stopp färbt ihn, auf die Linie gibt einen neuen;
   * auf eine Fläche mit Verlauf fragt die Leiste (Grundfarbe oder Verlaufsstopp); sonst füllt sie die Fläche, danach
   * „Weiter füllen“
   */
  private dropColor(c: PaintColor, x: number, y: number): void {
    const r = this.host.surface.getBoundingClientRect();
    const at = { x: x - r.left, y: y - r.top };
    this.dropAt = null;
    // ein Stil aus dem Farbmenü: verknüpft auf die Fläche darunter
    if (c.startsWith('style:')) {
      const style = styleMap(this.nodes).get(c.slice(6));
      const f = this.faceAtScreen(at);
      if (style && f) this.edit(() => linkStyle({ shape: f.shape, face: shapeFaces(f.shape).length > 1 ? f.face : null }, style));
      else this.ui.toast('Dort liegt keine Fläche');
      this.drawOverlay();
      return;
    }
    const hit = this.tool === 'gradient' ? this.gradHit(at) : null;
    const st = hit ? this.gradState() : null;
    if (hit && st && (hit.kind === 'stop' || hit.kind === 'line')) {
      let stops: GradientStop[];
      if (hit.kind === 'stop') {
        stops = st.g.stops.map((s) => ({ ...s }));
        stops[hit.index].color = c;
        if (this.grad) this.grad.stop = hit.index;
      } else {
        const added = addStop(st.g.stops, hit.t, swatchMap(this.nodes), this.host.world.currentLook, c);
        stops = added.stops;
        if (this.grad) this.grad.stop = added.index;
      }
      this.edit(() => this.gradApply({ stops }));
      this.pushRecent(c);
      this.drawOverlay();
      return;
    }
    const f = this.faceAtScreen(at);
    if (!f) {
      this.ui.toast('Dort liegt keine Fläche (gesperrte Ebenen und Formen nehmen keine Farbe)');
      this.drawOverlay();
      return;
    }
    const paint = facePaint(f.shape, f.face);
    const gi = this.tool === 'gradient' || paint.style ? -1 : topGradient(paint.fills, 'gradient');
    if (gi >= 0) {
      const gf = paint.fills![gi] as GradientFill;
      this.dropChoice = { color: c, shape: f.shape.id, at: shapeFaces(f.shape).length > 1 ? { ...f.local } : null, t: gradientT(gf, f.local.x, f.local.y) };
      this.pushRecent(c);
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    this.edit(() => setFaceFill(f.shape, f.face, c));
    this.color = c;
    this.pushRecent(c);
    this.fillMode = c;
    this.updateCursor();
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** „Weiter füllen“: die Fläche unter dem Zeiger füllen, jede höchstens einmal je Geste */
  private fillAt(g: Extract<Gesture, { kind: 'fill' }>, p: Pt): void {
    const f = this.fillMode ? this.faceAtScreen(p) : null;
    if (!f || !this.fillMode) return;
    const key = `${f.shape.id}|${f.face.inner.join(',')}`;
    if (g.done.has(key)) return;
    g.done.add(key);
    setFaceFill(f.shape, f.face, this.fillMode);
    this.meshDirty = true;
    this.uiDirty = true;
  }

  private endFill(): void {
    this.fillMode = null;
    this.updateCursor();
    this.uiDirty = true;
  }

  /** Finger aufgesetzt (Stift war im Spiel): nach HOLD_TIME ohne Bewegung greift die Pipette */
  private startHold(id: number): void {
    this.endHold(false);
    const timer = window.setTimeout(() => {
      const ptr = this.pointers.get(id);
      if (!this.fingerHold || this.fingerHold.id !== id || !ptr || ptr.moved) return;
      this.fingerHold.on = true;
      this.holdSample(ptr);
    }, HOLD_TIME);
    this.fingerHold = { id, timer, on: false };
  }

  private holdSample(p: Pt): void {
    const c = this.sampleColor(p);
    this.loupe = c ? { x: p.x, y: p.y, color: c } : null;
    this.drawOverlay();
  }

  /** Finger ab: hat die Pipette gegriffen, wird ihre Farbe die aktuelle */
  private endHold(take: boolean): void {
    const h = this.fingerHold;
    if (!h) return;
    window.clearTimeout(h.timer);
    this.fingerHold = null;
    if (take && h.on && this.loupe) {
      this.takeColor(this.loupe.color);
      this.ui.toast(`Farbe aufgenommen: ${this.loupe.color}`);
    }
    if (this.loupe) {
      this.loupe = null;
      this.drawOverlay();
    }
  }

  // ------------------------------------------------------------------ Spielangaben (Stufe 4)

  /** Andockkanten aller spielbaren Ebenen, zwischengespeichert bis zur nächsten Änderung */
  private docks(): DockEdge[] {
    if (this.dockCache?.version !== this.version) this.dockCache = { version: this.version, edges: dockEdges(this.nodes) };
    return this.dockCache.edges;
  }

  /** Material der Auswahl: gewählte Fläche, sonst die Formen (gemischt, wenn sie sich unterscheiden) */
  private selectionMaterial(): ReturnType<typeof faceMaterial> | 'mixed' | null {
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    if (face) return faceMaterial(face.shape, face.face);
    const ms = new Set(this.selectedShapes().map((s) => s.material ?? DEFAULT_MATERIAL));
    return ms.size === 1 ? [...ms][0] : ms.size ? 'mixed' : null;
  }

  /** Material setzen: angetippte Fläche (Werkzeug Andockkanten), gewählte Fläche oder alle Flächen der gewählten Formen */
  private setMaterial(m: ReturnType<typeof faceMaterial>): void {
    const df = this.tool === 'dock' ? this.dockTarget() : null;
    const face = df ?? (isPathTool(this.tool) ? this.paths.selectedFace() : null);
    this.edit(() => {
      if (face) {
        setFaceMaterial(face.shape, face.face, m);
        return;
      }
      for (const s of this.selectedShapes()) {
        if (m === DEFAULT_MATERIAL) delete s.material;
        else s.material = m;
        for (const r of s.regions ?? []) delete r.material;
      }
    });
  }

  private dockTarget(): { shape: ZoneShape; face: Face } | null {
    const shape = this.dockFace ? findShape(this.nodes, this.dockFace.shape) : undefined;
    if (!shape || !this.dockFace) return null;
    const faces = shapeFaces(shape);
    const i = faceAt(faces, this.dockFace.at.x, this.dockFace.at.y);
    return i >= 0 ? { shape, face: faces[i] } : null;
  }

  private dockInfo(): NonNullable<import('./ui').ContextExtra['dock']> {
    const e = this.docks();
    const t = this.dockTarget();
    const has = this.nodes.some(isStationNode);
    return { edges: e.length, off: e.filter((x) => x.off).length, face: t ? { name: t.shape.name, material: faceMaterial(t.shape, t.face) } : null, station: { has, placing: this.stationPlacing, ok: !has || !!stationOf(this.nodes) } };
  }

  /** Andockkanten (grün, aus gestrichelt) und Material der Flächen spielbarer Ebenen als Schraffur */
  private dockOverlay(st: ReturnType<typeof emptyOverlay>): void {
    for (const e of this.docks()) {
      const plane = findPlane(this.nodes, e.plane);
      if (!plane) continue;
      const pts = e.pts.map((q) => this.screenOf(plane, q)).filter((q): q is Pt => !!q);
      if (pts.length > 1) st.dock.push({ pts, off: e.off });
    }
    for (const plane of planesOf(this.nodes)) {
      if (plane.role !== 'play' || !this.planeShown(plane)) continue;
      for (const s of shapesOf(this.nodes, plane.id)) {
        if (s.hidden) continue;
        for (const f of shapeFaces(s)) {
          if (facePaint(s, f).fill === null) continue;
          const m = faceMaterial(s, f);
          if (m === 'free') continue;
          const rings = [f.outline, ...f.holes].map((r) => r.map(([x, y]) => this.screenOf(plane, shapeToPlane(s, x, y), s)).filter((q): q is Pt => !!q));
          st.hatch.push({ rings, material: m });
        }
      }
    }
    // Station: Bahnsteig von ihrem Punkt auf der Kante in Fahrtrichtung, 2 m hoch
    const sn = this.nodes.find(isStationNode);
    const sp = sn ? findPlane(this.nodes, sn.parent) : undefined;
    const ws = sn ? stationOf(this.nodes) : null;
    if (sn && sp && ws) {
      const y0 = (ws.y - 1 - sp.y) / sp.scale;
      const x1 = sn.x + (sn.dir * sn.length) / sp.scale;
      const corners = [
        { x: sn.x, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y0 + 2 / sp.scale },
        { x: sn.x, y: y0 + 2 / sp.scale },
      ].map((q) => this.screenOf(sp, q));
      if (corners.every(Boolean)) st.station = corners as Pt[];
    }
    const t = this.dockTarget();
    const tp = t ? findPlane(this.nodes, t.shape.parent) : undefined;
    if (t && tp) st.face = [t.face.outline, ...t.face.holes].map((r) => r.map(([x, y]) => this.screenOf(tp, shapeToPlane(t.shape, x, y), t.shape)).filter((q): q is Pt => !!q));
  }

  /** Werkzeug Andockkanten: Kante antippen schaltet ihr Stück, sonst wird die Fläche darunter angetippt (Material) */
  private dockDown(p: Pt): void {
    const r = this.overlay.handleSize + 6;
    let best: { e: DockEdge; d: number } | null = null;
    for (const e of this.docks()) {
      const plane = findPlane(this.nodes, e.plane);
      if (!plane) continue;
      const pts = e.pts.map((q) => this.screenOf(plane, q)).filter((q): q is Pt => !!q);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
        const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
        if (d <= r && (!best || d < best.d)) best = { e, d };
      }
    }
    // Station setzen: auf die getroffene Kante, an der Stelle unter dem Zeiger
    if (this.stationPlacing) {
      const plane = best ? findPlane(this.nodes, best.e.plane) : undefined;
      const q = plane ? this.planePoint(plane, p) : null;
      if (!best || !plane || !q) {
        this.ui.toast('Eine grüne Andockkante antippen');
        return;
      }
      const old = this.nodes.find(isStationNode);
      this.edit(() => {
        this.nodes = this.nodes.filter((n) => !isStationNode(n));
        this.nodes.push({ id: 'station', kind: 'station', parent: plane.id, x: Math.round(q.x * 1000) / 1000, dir: old?.dir ?? 1, length: old?.length ?? 14 });
        this.zone.nodes = this.nodes;
      });
      this.stationPlacing = false;
      this.ui.toast('Station gesetzt: „Spielen“ zeigt sie mit Vorgabestück');
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    if (best) {
      const shape = findShape(this.nodes, best.e.shape);
      const plane = shape ? findPlane(this.nodes, shape.parent) : undefined;
      if (shape && plane && !shape.locked && !planeLocked(this.nodes, plane)) {
        const e = best.e;
        this.edit(() => toggleDock(shape, e));
        this.ui.toast(e.off ? 'Kantenstück trägt wieder' : 'Kantenstück abgeschaltet: hier steht nichts');
      }
      this.drawOverlay();
      return;
    }
    const f = this.faceAtScreen(p);
    this.dockFace = f ? { shape: f.shape.id, at: { ...f.local } } : null;
    this.uiDirty = true;
    this.drawOverlay();
  }

  // ------------------------------------------------------------------ Felder (Stufe 4)

  private fieldInfo(): NonNullable<import('./ui').ContextExtra['field']> {
    const fs = fieldNodesOf(this.nodes);
    const f = fs.find((x) => x.id === this.fieldSel);
    return { count: fs.length, sel: f ? { name: f.name, w: f.x1 - f.x0, h: f.y1 - f.y0 } : null };
  }

  /** Ecken eines Rechtecks der Spur-0-Ebene im Bild (unten links, unten rechts, oben rechts, oben links) */
  private groundRect(r: { x0: number; x1: number; y0: number; y1: number }): Pt[] | null {
    const pts = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ].map((q) => this.screenOf(this.ground0, q));
    return pts.every(Boolean) ? (pts as Pt[]) : null;
  }

  /** Felder als Rahmen in der Spur-0-Ebene; am gewählten Griffe und die Handy-Rahmen quer und hoch */
  private fieldOverlay(st: ReturnType<typeof emptyOverlay>): void {
    for (const f of fieldNodesOf(this.nodes)) {
      const pts = this.groundRect(f);
      if (!pts) continue;
      const on = f.id === this.fieldSel;
      st.fields.push({ pts, on, name: f.name });
      if (!on) continue;
      for (const fr of fieldFrames(f)) {
        const fp = this.groundRect(fr);
        if (fp) st.frames.push({ pts: fp, name: fr.name === 'quer' ? 'Handy quer' : 'Handy hoch' });
      }
      const [a, b, c, d] = pts;
      const mid = (u: Pt, v: Pt): Pt => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
      st.handles.push(a, b, c, d, mid(a, b), mid(b, c), mid(c, d), mid(d, a));
    }
  }

  /** Werkzeug Felder: Griff des gewählten Felds, sonst ein Feld unter dem Zeiger wählen und verschieben, sonst abwählen */
  private fieldDown(pointerId: number, p: Pt): void {
    const q = this.planePoint(this.ground0, p);
    if (!q) return;
    const fs = fieldNodesOf(this.nodes);
    const r = this.overlay.handleSize + 6;
    let grip: { f: ZoneFieldNode; mode: FieldGrip } | null = null;
    const sel = fs.find((f) => f.id === this.fieldSel);
    const pts = sel ? this.groundRect(sel) : null;
    if (sel && pts) {
      const [a, b, c, d] = pts;
      const mid = (u: Pt, v: Pt): Pt => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
      const near = (u: Pt) => Math.hypot(u.x - p.x, u.y - p.y) <= r;
      const spots: Array<[Pt, FieldGrip]> = [[a, 'sw'], [b, 'se'], [c, 'ne'], [d, 'nw'], [mid(a, b), 's'], [mid(b, c), 'e'], [mid(c, d), 'n'], [mid(d, a), 'w']];
      const hit = spots.find(([u]) => near(u));
      if (hit) grip = { f: sel, mode: hit[1] };
      else {
        // an einer Kante entlang (zwischen den Griffen)
        const seg = (u: Pt, v: Pt) => {
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          const l2 = dx * dx + dy * dy || 1;
          const k = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / l2));
          return Math.hypot(u.x + dx * k - p.x, u.y + dy * k - p.y);
        };
        const edges: Array<[number, FieldGrip]> = [[seg(a, b), 's'], [seg(b, c), 'e'], [seg(c, d), 'n'], [seg(d, a), 'w']];
        const e = edges.filter(([dd]) => dd <= r).sort((x, y) => x[0] - y[0])[0];
        if (e) grip = { f: sel, mode: e[1] };
      }
    }
    if (!grip) {
      // das kleinste Feld unter dem Zeiger (Felder dürfen sich überlappen)
      const inside = fs.filter((f) => q.x >= f.x0 && q.x <= f.x1 && q.y >= f.y0 && q.y <= f.y1).sort((x, y) => (x.x1 - x.x0) * (x.y1 - x.y0) - (y.x1 - y.x0) * (y.y1 - y.y0));
      if (inside.length) grip = { f: inside[0], mode: 'move' };
    }
    if (!grip) {
      this.fieldSel = null;
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    this.fieldSel = grip.f.id;
    this.history.begin(this.nodes);
    this.gesture = { kind: 'field', pointerId, id: grip.f.id, mode: grip.mode, start: q, orig: { x0: grip.f.x0, x1: grip.f.x1, y0: grip.f.y0, y1: grip.f.y1 } };
    this.uiDirty = true;
    this.drawOverlay();
  }

  private fieldMove(g: Extract<Gesture, { kind: 'field' }>, p: Pt): void {
    const f = this.nodes.find((n): n is ZoneFieldNode => isFieldNode(n) && n.id === g.id);
    const q = this.planePoint(this.ground0, p);
    if (!f || !q) return;
    // halbe Meter (Felder sind grob; das Absperrband steht an ihrem Rand)
    const snap = (v: number) => Math.round(v * 2) / 2;
    const dx = q.x - g.start.x;
    const dy = q.y - g.start.y;
    const o = g.orig;
    let { x0, x1, y0, y1 } = o;
    if (g.mode === 'move') {
      x0 = snap(o.x0 + dx);
      y0 = snap(o.y0 + dy);
      x1 = x0 + (o.x1 - o.x0);
      y1 = y0 + (o.y1 - o.y0);
    } else {
      if (g.mode.includes('w')) x0 = Math.min(snap(o.x0 + dx), o.x1 - FIELD_MIN);
      if (g.mode.includes('e')) x1 = Math.max(snap(o.x1 + dx), o.x0 + FIELD_MIN);
      if (g.mode.includes('s')) y0 = Math.min(snap(o.y0 + dy), o.y1 - FIELD_MIN);
      if (g.mode.includes('n')) y1 = Math.max(snap(o.y1 + dy), o.y0 + FIELD_MIN);
    }
    Object.assign(f, { x0, x1, y0, y1 });
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** neues Feld aus dem Bildausschnitt (der freie Bereich zwischen den Leisten, mit Rand), auf halbe Meter */
  private fieldAdd(): void {
    const fr = this.freeRect();
    const a = this.planePoint(this.ground0, { x: fr.x0 + (fr.x1 - fr.x0) * 0.1, y: fr.y1 - (fr.y1 - fr.y0) * 0.1 });
    const b = this.planePoint(this.ground0, { x: fr.x1 - (fr.x1 - fr.x0) * 0.1, y: fr.y0 + (fr.y1 - fr.y0) * 0.1 });
    if (!a || !b) return;
    const snap = (v: number) => Math.round(v * 2) / 2;
    const x0 = snap(Math.min(a.x, b.x));
    const y0 = snap(Math.min(a.y, b.y));
    const x1 = Math.max(snap(Math.max(a.x, b.x)), x0 + FIELD_MIN);
    const y1 = Math.max(snap(Math.max(a.y, b.y)), y0 + FIELD_MIN);
    const id = nextNodeId(this.nodes, 'f');
    this.edit(() => this.nodes.push({ id, kind: 'field', name: `Feld ${id.slice(1)}`, x0, x1, y0, y1 }));
    this.fieldSel = id;
    this.uiDirty = true;
    this.drawOverlay();
    this.ui.toast('Feld angelegt: Ecken und Kanten ziehen, innen verschieben; „Spielen“ fährt darin');
  }

  // ------------------------------------------------------------------ Füllstapel (Stufe 3)

  /** Stil der Auswahl kopieren, einfügen, als Stil sichern, lösen (Leiste des Füllstapels, Cmd+Wahl+C/V) */
  private styleCommand(what: 'copy' | 'paste' | 'save' | 'unlink'): void {
    const styles = styleMap(this.nodes);
    const ts = this.styleTargets();
    if (what === 'save') {
      this.saveStyle();
      return;
    }
    if (!ts.length) {
      this.ui.toast('Erst eine Form oder Fläche wählen');
      return;
    }
    if (what === 'copy') {
      this.styleClip = paintToStyle(ts[0], styles);
      this.uiDirty = true;
      this.ui.toast('Anstrich kopiert');
    } else if (what === 'paste') {
      const clip = this.styleClip;
      if (!clip) {
        this.ui.toast('Erst einen Anstrich kopieren (Cmd+Wahl+C oder Pipette mit Wahltaste)');
        return;
      }
      this.edit(() => {
        for (const t of this.styleTargets()) pasteStyle(t, clip, styleMap(this.nodes));
      });
    } else
      this.edit(() => {
        for (const t of this.styleTargets()) unlinkStyle(t, styleMap(this.nodes));
      });
  }

  /** Ziel des Füllstapels: Ebenenstapel der aktiven Ebene, sonst die gewählte Fläche oder die zuletzt gewählte Form */
  private stackTarget(): GradTarget | null {
    if (this.stackOpen === 'plane') {
      const plane = this.plane;
      return plane ? { plane } : null;
    }
    if (this.stackOpen !== 'paint') return null;
    const face = isPathTool(this.tool) ? this.paths.selectedFace() : null;
    if (face) return { shape: face.shape, face: shapeFaces(face.shape).length > 1 ? face.face : null };
    const s = this.shape;
    return s ? { shape: s, face: null } : null;
  }

  private gradRefOf(t: GradTarget): GradRef {
    return 'plane' in t ? { plane: t.plane.id } : { shape: t.shape.id, at: t.face ? { x: t.face.inner[0], y: t.face.inner[1] } : null };
  }

  /** CSS-Vorschau einer Füllung (Verläufe als linear-gradient, Deckkraft als Weiß) */
  private fillPreview(f: ZoneFill): string {
    const sw = swatchMap(this.nodes);
    const look = this.host.world.currentLook;
    if (f.type === 'color') return resolveColor(f.color, sw, look);
    if (f.type === 'mist') return f.dabs.slice(0, 4).map((d, i) => `radial-gradient(circle at ${20 + i * 20}% ${40 + (i % 2) * 20}%,${resolveColor(d.color, sw, look)} 0 25%,transparent 45%)`).join(',') + ',#4a4f5a';
    if (!isGradient(f)) {
      const light = lightIn(lightOf(this.nodes), look);
      const own = f.type !== 'grain' && f.color ? resolveColor(f.color, sw, look) : null;
      if (f.type === 'light') return `linear-gradient(135deg,${own ?? resolveColor(light.color, sw, look)} 0 35%,#3a3f4a 35%)`;
      if (f.type === 'shade') return `linear-gradient(135deg,#8a8f9a 0 62%,${own ?? resolveColor(light.shade, sw, look)} 62%)`;
      if (f.type === 'dots') return `radial-gradient(circle,${own ?? '#efe6c8'} 0 28%,transparent 32%) 0 0/7px 7px,#4a5060`;
      if (f.type === 'sparkle') return `radial-gradient(circle at 30% 40%,${own ?? '#fffbe6'} 0 1.5px,transparent 2.5px) 0 0/11px 9px,radial-gradient(circle at 70% 70%,${own ?? '#fffbe6'} 0 1px,transparent 2px) 0 0/13px 10px,#3d6f9a`;
      return f.tile === 'gouache' ? 'repeating-linear-gradient(170deg,#8d8a83 0 3px,#a29e96 3px 5px,#7f7c76 5px 8px)' : 'repeating-radial-gradient(circle at 30% 40%,#a9a59c 0 1px,#bdb9b0 1px 3px)';
    }
    const ramp = rampOf(f.stops, sw, look);
    const parts: string[] = [];
    for (let k = 0; k <= 8; k++) {
      const i = Math.round((k / 8) * (RAMP - 1)) * 4;
      const [r, g, b, a] = [ramp[i], ramp[i + 1], ramp[i + 2], ramp[i + 3]];
      parts.push(f.type === 'fade' ? `rgba(255,255,255,${a.toFixed(2)})` : `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a.toFixed(2)})`);
    }
    return `linear-gradient(90deg,${parts.join(',')})`;
  }

  private stackView(): StackView | null {
    if (!this.building || !this.stackOpen) return null;
    const t = this.stackTarget();
    const key = t ? JSON.stringify(this.gradRefOf(t)) : '';
    if (key !== this.stackKey) {
      this.stackKey = key;
      this.stackSel = null;
    }
    if (!t) return null;
    const p = ownPaint(t, styleMap(this.nodes));
    const fills = p.fills ?? [];
    const rows: StackRow[] = [];
    const crown = 'plane' in t ? undefined : t.shape.crown;
    if (crown)
      rows.push({ index: CROWN_ROW, kind: 'crown', preview: 'radial-gradient(circle,#d8e86a 0 30%,transparent 34%) 0 0/8px 7px,#2f5a2a', blend: null, opacity: 1, hidden: !!crown.hidden, params: crownParamsOf(crown) });
    const wave = 'plane' in t ? undefined : t.shape.wave;
    if (wave)
      rows.push({ index: WAVE_ROW, kind: 'wave', preview: 'radial-gradient(circle at 50% 120%,#8d8a83 0 45%,transparent 47%) 0 0/9px 12px,#5b5f6a', blend: null, opacity: 1, hidden: !!wave.hidden, params: waveParamsOf(wave) });
    for (let i = fills.length - 1; i >= 0; i--) {
      const f = fills[i];
      const row: StackRow = { index: i, kind: f.type, preview: this.fillPreview(f), blend: f.type === 'fade' ? null : f.blend, opacity: f.opacity, hidden: !!f.hidden, ...fillParams(f, 'plane' in t ? { sx: 1, sy: 1 } : t.shape) };
      if (f.type !== 'color' && f.type !== 'grain' && f.type !== 'mist' && !isGradient(f)) row.ownColor = !!f.color;
      rows.push(row);
    }
    if (!('plane' in t) && p.fill !== null) rows.push({ index: -1, kind: 'base', preview: this.resolve(p.fill), blend: null, opacity: p.opacity ?? 1, hidden: false });
    const air = airOf(this.nodes);
    const lightNode = lightOf(this.nodes);
    const usesLight = !!crown || fills.some((f) => f.type === 'light' || f.type === 'shade' || f.type === 'dots');
    return {
      title: 'plane' in t ? `Ebenenstapel · ${t.plane.name}` : t.face ? `Füllungen · Fläche von ${t.shape.name}` : `Füllungen · ${t.shape.name}`,
      rows,
      selected: this.stackSel,
      air: 'plane' in t ? { color: this.resolve(air?.color ?? AIR_DEFAULT.color), amount: air?.amount ?? 0, near: air?.near ?? AIR_DEFAULT.near, far: air?.far ?? AIR_DEFAULT.far, plane: t.plane.air ?? 1 } : null,
      light: 'plane' in t || usesLight ? (() => { const l = lightIn(lightNode, this.host.world.currentLook); return { angle: l.angle, color: this.resolve(l.color), shade: this.resolve(l.shade) }; })() : null,
      full: fills.length >= MAX_LAYERS - 1,
      styles: 'plane' in t ? null : { linked: (() => { const id = linkedStyle(t, styleMap(this.nodes)); return id ? (styleMap(this.nodes).get(id)?.name ?? null) : null; })(), canPaste: !!this.styleClip },
    };
  }

  /** Anstrich des Ziels ändern; Ziehen (start, move, end) ist ein Schritt im Arbeitsverlauf */
  private stackEdit(fn: (p: ReturnType<typeof ownPaint>) => void, phase: PickPhase = 'tap'): void {
    const t = this.stackTarget();
    if (!t) return;
    if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
    const p = ownPaint(t, styleMap(this.nodes));
    fn(p);
    writePaint(t, p);
    if (phase === 'end' || phase === 'tap') {
      if (this.history.commit(this.nodes)) this.changed();
    } else this.changed();
    this.uiDirty = true;
  }

  /** neue Füllung oben auf den Stapel: Farbe (aktuelle), Verlauf oder Deckkraftverlauf quer über den Rahmen */
  private stackAdd(kind: StackAddKind): void {
    const t = this.stackTarget();
    if (!t) return;
    if (kind === 'wave') {
      // Kantenwelle auf die ganze Form (Platzhalter-Werte)
      if ('plane' in t || t.shape.wave) return;
      this.history.begin(this.nodes);
      t.shape.wave = { ...WAVE_DEFAULT };
      if (this.history.commit(this.nodes)) this.changed();
      this.stackSel = WAVE_ROW;
      this.uiDirty = true;
      return;
    }
    if (kind === 'crown') {
      // Punktkrone auf die ganze Form, Größe nach ihrem Rahmen (Platzhalter-Werte)
      if ('plane' in t || t.shape.crown) return;
      const b = targetBox({ shape: t.shape, face: null });
      this.history.begin(this.nodes);
      t.shape.crown = crownFor(Math.min((b.maxX - b.minX) * Math.abs(t.shape.sx), (b.maxY - b.minY) * Math.abs(t.shape.sy)));
      if (this.history.commit(this.nodes)) this.changed();
      this.stackSel = CROWN_ROW;
      this.uiDirty = true;
      return;
    }
    let box: { minX: number; minY: number; maxX: number; maxY: number };
    if ('plane' in t) {
      const shapes = shapesOf(this.nodes, t.plane.id);
      box = shapes.length ? unionBounds(shapes) : { minX: -10, minY: -5, maxX: 10, maxY: 5 };
    } else box = targetBox(t);
    const y = (box.minY + box.maxY) / 2;
    let added = -1;
    this.stackEdit((p) => {
      const fills = p.fills ?? [];
      if (fills.length >= MAX_LAYERS - 1) return;
      if (kind === 'color') fills.push({ type: 'color', color: this.color ?? '#ffffff', blend: 'normal', opacity: 1 });
      else if (kind === 'light' || kind === 'shade' || kind === 'dots' || kind === 'grain' || kind === 'sparkle') fills.push(freshEarle(kind));
      else if (kind === 'edge') {
        // Kantenverlauf: 3 m tief (Griff waagrecht in Pfad-Koordinaten), vier Stufen als Ringe
        const sx = 'plane' in t ? 1 : Math.abs(t.shape.sx) || 1;
        fills.push({ type: 'gradient', edge: true, steps: 4, inner: 0.3, stops: this.freshStops(t, 'gradient'), x0: box.minX, y0: y, x1: box.minX + 3 / sx, y1: y, blend: 'normal', opacity: 1 });
      } else fills.push({ type: kind, stops: this.freshStops(t, kind), x0: box.minX, y0: y, x1: box.maxX, y1: y, blend: 'normal', opacity: 1 });
      p.fills = fills;
      added = fills.length - 1;
    });
    if (added >= 0) this.stackSel = added;
  }

  /** Luftperspektive der Zone (wird beim ersten Ändern angelegt) und Anteil der aktiven Ebene */
  private stackAir(patch: { amount?: number; near?: number; far?: number; plane?: number; color?: true }, phase: PickPhase): void {
    if (patch.color) {
      this.stackSel = -2;
      this.uiDirty = true;
      if (!this.ui.colorOpen) this.ui.toast('Luftfarbe: im Farbmenü wählen');
      return;
    }
    if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
    let air = airOf(this.nodes);
    if (!air) {
      air = { id: 'air', kind: 'air', ...AIR_DEFAULT };
      this.nodes.push(air);
    }
    if (patch.amount !== undefined) air.amount = patch.amount;
    if (patch.near !== undefined) air.near = patch.near;
    if (patch.far !== undefined) air.far = Math.max(air.near + 0.1, patch.far);
    const plane = this.plane;
    if (patch.plane !== undefined && plane) {
      if (patch.plane >= 1) delete plane.air;
      else plane.air = patch.plane;
    }
    if (phase === 'end' || phase === 'tap') {
      if (this.history.commit(this.nodes)) this.changed();
    } else this.changed();
    this.uiDirty = true;
  }

  /** Farbe der gewählten Zeile des Füllstapels (Grundfarbe, Farb-Füllung, Luft) lesen und setzen; sonst null */
  private stackColor(): { get(): PaintColor | null; set(c: PaintColor): void } | null {
    if (!this.stackOpen || this.stackSel === null) return null;
    const i = this.stackSel;
    if (i === -3 || i === -4)
      return {
        get: () => {
          const l = lightIn(lightOf(this.nodes), 'day');
          return i === -3 ? l.color : l.shade;
        },
        set: (c) => {
          const light = this.ensureLight();
          if (i === -3) light.color = c;
          else light.shade = c;
        },
      };
    if (i === -2)
      return {
        get: () => airOf(this.nodes)?.color ?? AIR_DEFAULT.color,
        set: (c) => {
          let air = airOf(this.nodes);
          if (!air) {
            air = { id: 'air', kind: 'air', ...AIR_DEFAULT };
            this.nodes.push(air);
          }
          air.color = c;
        },
      };
    const t = this.stackTarget();
    if (!t) return null;
    const p = ownPaint(t, styleMap(this.nodes));
    if (i === -1 && p.fill !== null)
      return {
        get: () => p.fill,
        set: (c) => {
          const q = ownPaint(t, styleMap(this.nodes));
          q.fill = c;
          writePaint(t, q);
        },
      };
    const f = p.fills?.[i];
    if (!f || isGradient(f) || f.type === 'grain' || f.type === 'mist') return null;
    return {
      get: () => f.color ?? null,
      set: (c) => {
        const q = ownPaint(t, styleMap(this.nodes));
        const g = q.fills?.[i];
        if (g && !isGradient(g) && g.type !== 'grain' && g.type !== 'mist') g.color = c;
        writePaint(t, q);
      },
    };
  }

  /** Farbnebel: Halbmesser der Tupfer (Meter der Ebene), Deckkraft je Tupfer */
  private mistBrush = { size: 6, strength: 0.7 };
  /** wo der Zeiger über dem Bild schwebt (Bildpunkte), für den Größenring der Pinsel */
  private brushAt: Pt | null = null;

  /** Ring in Pinselgröße um den Zeiger, auf die Fläche darunter gelegt (Farbnebel: Halbmesser, Punktpinsel: Durchmesser) */
  private brushRing(p: Pt): Pt[] | null {
    const hit = this.faceAtScreen(p, true);
    if (!hit) return null;
    const r = this.tool === 'mist' ? this.mistBrush.size : this.dotBrush.size / 2;
    const pts: Pt[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const s = this.screenOf(hit.plane, { x: hit.q.x + Math.cos(a) * r, y: hit.q.y + Math.sin(a) * r }, hit.shape);
      if (!s) return null;
      pts.push(s);
    }
    return pts;
  }

  /** Farbnebel: in eine Fläche drücken (gesperrte nicht) */
  private mistDown(pointerId: number, p: Pt): void {
    const hit = this.faceAtScreen(p, true);
    if (!hit || hit.shape.locked || planeLocked(this.nodes, hit.plane)) {
      this.ui.toast('Farbnebel: in eine Fläche tupfen oder ziehen');
      return;
    }
    this.history.begin(this.nodes);
    const multi = shapeFaces(hit.shape).length > 1;
    const g: Extract<Gesture, { kind: 'mist' }> = { kind: 'mist', pointerId, shape: hit.shape.id, at: multi ? { x: hit.face.inner[0], y: hit.face.inner[1] } : null, last: null, full: false };
    this.gesture = g;
    this.mistDab(g, p);
  }

  /**
   * Farbnebel bis zum Zeiger: Tupfer in der aktuellen Farbe in festem Abstand entlang des Wegs (0,6 Halbmesser gibt einen
   * glatten Strich, auch wenn der Zeiger schnell zieht). Die Tupfer sammeln sich im obersten Farbnebel der Fläche; ist er
   * voll oder liegt etwas darüber, kommt ein neuer dazu
   */
  private mistDab(g: Extract<Gesture, { kind: 'mist' }>, p: Pt): void {
    if (g.full) return;
    const shape = findShape(this.nodes, g.shape);
    const plane = shape ? findPlane(this.nodes, shape.parent) : undefined;
    const q = shape && plane ? this.planePoint(plane, p) : null;
    if (!shape || !q) return;
    const local = { x: (q.x - shape.x) / shape.sx, y: (q.y - shape.y) / shape.sy };
    const r = this.mistBrush.size / Math.max(1e-6, Math.sqrt(Math.abs(shape.sx * shape.sy)));
    const step = r * 0.6;
    const at: Pt[] = [];
    if (!g.last) at.push(local);
    else {
      const d = Math.hypot(local.x - g.last.x, local.y - g.last.y);
      for (let k = 1; k * step <= d; k++) at.push({ x: g.last.x + ((local.x - g.last.x) * k * step) / d, y: g.last.y + ((local.y - g.last.y) * k * step) / d });
    }
    if (!at.length) return;
    const faces = shapeFaces(shape);
    const fi = g.at ? faceAt(faces, g.at.x, g.at.y) : -1;
    const t: GradTarget = { shape, face: g.at && fi >= 0 ? faces[fi] : null };
    const paint = ownPaint(t, styleMap(this.nodes));
    const fills = paint.fills ?? [];
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    // Tupfer, die die Fläche nicht berühren, verbrauchen keinen Platz im Farbnebel
    const box = faceBox(t.face ?? faces[0]);
    let added = 0;
    for (const c of at) {
      g.last = c;
      if (c.x < box.minX - r || c.x > box.maxX + r || c.y < box.minY - r || c.y > box.maxY + r) continue;
      let top = fills[fills.length - 1];
      if (!top || top.type !== 'mist' || top.dabs.length >= MIST_MAX) {
        if (fills.length >= MAX_LAYERS - 1) {
          if (!g.full) this.ui.toast('Farbnebel: der Füllstapel ist voll');
          g.full = true;
          break;
        }
        top = { type: 'mist', dabs: [], blend: 'normal', opacity: 1 };
        fills.push(top);
      }
      top.dabs.push({ x: r3(c.x), y: r3(c.y), r: r3(r), color: this.currentColor(), a: this.mistBrush.strength });
      added++;
    }
    if (!added) return;
    paint.fills = fills;
    writePaint(t, paint);
    this.changed();
  }

  /** Punktpinsel: Durchmesser (Meter der Ebene), Tonstufe (2 hell wie die Lichtseite der Krone), Wegnehmen */
  private dotBrush = { size: 0.3, tone: 2, erase: false };

  /** Punktpinsel: auf eine Form drücken (eine Fläche unter dem Zeiger, gesperrte nicht) */
  private dotDown(pointerId: number, p: Pt): void {
    const erase = this.dotBrush.erase || this.mods.alt;
    const hit = erase ? null : this.faceAtScreen(p, true);
    if (!erase && (!hit || hit.shape.locked || planeLocked(this.nodes, hit.plane))) {
      this.ui.toast('Punktpinsel: über eine Form ziehen');
      return;
    }
    this.history.begin(this.nodes);
    const g: Extract<Gesture, { kind: 'dots' }> = { kind: 'dots', pointerId, shape: hit?.shape.id ?? null, last: null, erase };
    this.gesture = g;
    this.dotDab(g, p);
  }

  /**
   * Punktpinsel unter dem Zeiger: setzen (dicht an dicht entlang des Wegs, Lücken bei schnellem Ziehen gefüllt) oder
   * wegnehmen (gesetzte Punkte in der Nähe fallen weg, an einer Punktkrone merkt sich die Form die Stelle)
   */
  private dotDab(g: Extract<Gesture, { kind: 'dots' }>, p: Pt): void {
    const size = this.dotBrush.size;
    if (g.erase) {
      // alle sichtbaren, nicht gesperrten Formen mit Punkten: was unter dem Pinsel liegt, fällt weg
      const r = size * 2.2;
      let hit = false;
      for (const plane of planesOf(this.nodes)) {
        if (!this.planeShown(plane) || planeLocked(this.nodes, plane)) continue;
        const q = this.planePoint(plane, p);
        if (!q) continue;
        for (const shape of shapesOf(this.nodes, plane.id)) {
          if (shape.hidden || shape.locked || (!shape.dots?.length && !shape.crown)) continue;
          const at = { x: q.x - shape.x, y: q.y - shape.y };
          if (shape.dots?.length) {
            const kept = shape.dots.filter(([x, y]) => (x - at.x) ** 2 + (y - at.y) ** 2 > r * r);
            if (kept.length !== shape.dots.length) hit = true;
            if (kept.length) shape.dots = kept;
            else delete shape.dots;
          }
          // an einer Punktkrone merkt sich die Form die Stelle, wenn der Pinsel über ihr ist (Rahmen plus Überstand)
          const b = shapeBounds(shape);
          const pad = r + (shape.crown?.out ?? 0);
          if (shape.crown && q.x > b.minX - pad && q.x < b.maxX + pad && q.y > b.minY - pad && q.y < b.maxY + pad) {
            const off = shape.dotsOff ?? [];
            const last = off[off.length - 1];
            if (!last || Math.hypot(last[0] - at.x, last[1] - at.y) > r * 0.5) off.push([Math.round(at.x * 1000) / 1000, Math.round(at.y * 1000) / 1000, Math.round(r * 1000) / 1000]);
            shape.dotsOff = off.slice(-400);
            hit = true;
          }
        }
      }
      if (hit) this.changed();
      return;
    }
    const shape = g.shape ? findShape(this.nodes, g.shape) : undefined;
    const plane = shape ? findPlane(this.nodes, shape.parent) : undefined;
    const q = shape && plane ? this.planePoint(plane, p) : null;
    if (!shape || !q) return;
    const at = { x: q.x - shape.x, y: q.y - shape.y };
    const step = size * 1.2;
    const from = g.last;
    const d = from ? Math.hypot(at.x - from.x, at.y - from.y) : 0;
    if (from && d < step) return;
    const n = from ? Math.min(200, Math.floor(d / step)) : 1;
    const dots = shape.dots ?? [];
    let last = from ?? at;
    for (let i = 1; i <= n; i++) {
      const t = from ? (i * step) / d : 0;
      last = from ? { x: from.x + (at.x - from.x) * t, y: from.y + (at.y - from.y) * t } : at;
      dots.push([Math.round(last.x * 1000) / 1000, Math.round(last.y * 1000) / 1000, size, this.dotBrush.tone]);
    }
    shape.dots = dots.slice(-4000);
    g.last = last;
    this.changed();
  }

  /** Merkmal der Form im Füllstapel ändern (Punktkrone, Kantenwelle; Ziehen: start, move, end ist ein Schritt) */
  private shapeEdit(fn: (shape: ZoneShape) => unknown, phase: PickPhase = 'tap'): void {
    const t = this.stackTarget();
    if (!t || 'plane' in t) return;
    if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
    fn(t.shape);
    if (phase === 'end' || phase === 'tap') {
      if (this.history.commit(this.nodes)) this.changed();
    } else this.changed();
    this.uiDirty = true;
  }

  /** einen Wert der Schicht i ändern (Zahlen gekappt wie beim Lesen der Datei) */
  private stackParam(i: number, key: string, v: number | string, phase: PickPhase): void {
    const t = this.stackTarget();
    this.stackEdit((p) => {
      const f = p.fills?.[i];
      if (f && t) setFillParam(f, key, v, 'plane' in t ? { sx: 1, sy: 1 } : t.shape);
    }, phase);
  }

  /** Licht der Zone (wird beim ersten Ändern angelegt): Richtung; Farben über das Farbmenü (Zeile -3 Licht, -4 Schatten) */
  private stackLight(patch: { angle?: number; color?: true; shade?: true }, phase: PickPhase): void {
    if (patch.color || patch.shade) {
      this.stackSel = patch.color ? -3 : -4;
      this.uiDirty = true;
      if (!this.ui.colorOpen) this.ui.toast(patch.color ? 'Lichtfarbe: im Farbmenü wählen' : 'Schattenfarbe: im Farbmenü wählen');
      return;
    }
    if (phase === 'start' || phase === 'tap') this.history.begin(this.nodes);
    const light = this.ensureLight();
    if (patch.angle !== undefined) light.angle = Math.round(patch.angle * 10) / 10;
    if (phase === 'end' || phase === 'tap') {
      if (this.history.commit(this.nodes)) this.changed();
    } else this.changed();
    this.uiDirty = true;
  }

  private ensureLight(): NonNullable<ReturnType<typeof lightOf>> {
    let light = lightOf(this.nodes);
    if (!light) {
      light = { id: 'light', kind: 'light', ...LIGHT_DEFAULT };
      this.nodes.push(light);
    }
    return light;
  }

  /**
   * Knopf „Earle“: Vorgabe auf die Auswahl (Formen oder die gewählte Fläche); „auto“ wählt je Fläche nach Material und
   * Farbe; „zone“ macht das für alle Flächen aller sichtbaren, nicht gesperrten Ebenen. Ein Schritt im Arbeitsverlauf
   */
  private stackEarle(preset: EarlePreset | 'auto' | 'zone'): void {
    const sw = swatchMap(this.nodes);
    const light = lightIn(lightOf(this.nodes), 'day');
    const resolved = { angle: light.angle, color: resolveColor(light.color, sw, 'day'), shade: resolveColor(light.shade, sw, 'day') };
    const targets: Array<{ shape: ZoneShape; face: Face | null }> = [];
    if (preset === 'zone') {
      for (const plane of planesOf(this.nodes)) {
        if (planeHidden(this.nodes, plane) || planeLocked(this.nodes, plane) || plane.role === 'air') continue;
        for (const shape of shapesOf(this.nodes, plane.id)) if (!shape.locked && !shape.hidden) targets.push({ shape, face: null });
      }
    } else targets.push(...this.styleTargets());
    if (!targets.length) {
      this.ui.toast('Earle: erst Formen oder eine Fläche wählen');
      return;
    }
    this.history.begin(this.nodes);
    let n = 0;
    // jede Fläche für sich (eigene Grundfarbe und eigenes Material); „Krone“ setzt dazu eine Punktkrone
    for (const { shape, face } of targets) n += earleShape(shape, face, preset === 'zone' ? 'auto' : preset, sw, resolved);
    if (this.history.commit(this.nodes)) this.changed();
    this.uiDirty = true;
    this.ui.toast(n ? `Earle auf ${n} ${n === 1 ? 'Fläche' : 'Flächen'} (Platzhalter-Vorgaben)` : 'Earle: keine Fläche ohne Stil gefunden');
  }

  // ------------------------------------------------------------------ Verlauf (Stufe 3)

  /** Art, die das Verlaufswerkzeug ohne Ziel anlegt */
  private gradKind: GradKind = 'gradient';

  /** Ziele des Verlaufswerkzeugs, aufgelöst (eine Fläche über ihren Punkt im Pfad) */
  private gradTargets(): GradTarget[] {
    const out: GradTarget[] = [];
    for (const r of this.grad?.targets ?? []) {
      if ('plane' in r) {
        const plane = findPlane(this.nodes, r.plane);
        if (plane) out.push({ plane });
        continue;
      }
      const shape = findShape(this.nodes, r.shape);
      if (!shape) continue;
      if (!r.at) {
        out.push({ shape, face: null });
        continue;
      }
      const faces = shapeFaces(shape);
      const i = faceAt(faces, r.at.x, r.at.y);
      if (i >= 0) out.push({ shape, face: faces[i] });
    }
    return out;
  }

  /** bearbeiteter Verlauf (vom ersten Ziel) mit Linie in Ebenen-Koordinaten, dazu Ebene und Form */
  private gradState(): { g: GradientFill & { line: GradLine; index: number }; plane: ZonePlane; shape: ZoneShape | undefined; targets: GradTarget[] } | null {
    const targets = this.gradTargets();
    const t = targets[0];
    const plane = !t ? undefined : 'plane' in t ? t.plane : findPlane(this.nodes, t.shape.parent);
    const g = t && this.grad ? readGradient(t, this.grad.kind, styleMap(this.nodes), this.grad.layer) : null;
    return g && plane ? { g, plane, shape: 'plane' in t ? undefined : t.shape, targets } : null;
  }

  /**
   * Bildpunkte des Reglers: Anfang und Ende auf der Linie, Stopps und Mitten in einer Reihe daneben (wie Illustrators
   * Verlaufsregler), damit die Stopps an den Enden nicht auf den Endgriffen liegen
   */
  private gradScreen(st: NonNullable<ReturnType<PlaneEditor['gradState']>>): { a: Pt; b: Pt; stops: Pt[]; mids: Pt[] } | null {
    const l = st.g.line;
    const at = (t: number) => this.screenOf(st.plane, { x: l.x0 + (l.x1 - l.x0) * t, y: l.y0 + (l.y1 - l.y0) * t }, st.shape);
    const a = at(0);
    const b = at(1);
    if (!a || !b) return null;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const off = this.overlay.handleSize + 9;
    const nx = (-(b.y - a.y) / len) * off;
    const ny = ((b.x - a.x) / len) * off;
    const row = (t: number) => {
      const q = at(t);
      return q ? { x: q.x + nx, y: q.y + ny } : null;
    };
    const stops = st.g.stops.map((s) => row(s.t)).filter((q): q is Pt => !!q);
    const mids = st.g.stops.slice(0, -1).map((s, i) => row(s.t + (st.g.stops[i + 1].t - s.t) * (s.mid ?? 0.5))).filter((q): q is Pt => !!q);
    return { a, b, stops, mids };
  }

  /** was am Bildpunkt vom Regler liegt: ein Stopp, eine Mitte, ein Ende oder die Linie */
  private gradHit(p: Pt): { kind: 'stop'; index: number } | { kind: 'mid'; index: number } | { kind: 'end'; end: 'a' | 'b' } | { kind: 'line'; t: number } | null {
    const st = this.gradState();
    const sc = st ? this.gradScreen(st) : null;
    if (!st || !sc) return null;
    const r = this.overlay.handleSize + 6;
    const near = (q: Pt) => Math.hypot(q.x - p.x, q.y - p.y) <= r;
    const si = sc.stops.findIndex(near);
    if (si >= 0) return { kind: 'stop', index: si };
    if (near(sc.b)) return { kind: 'end', end: 'b' };
    if (near(sc.a)) return { kind: 'end', end: 'a' };
    const mi = sc.mids.findIndex(near);
    if (mi >= 0) return { kind: 'mid', index: mi };
    const dx = sc.b.x - sc.a.x;
    const dy = sc.b.y - sc.a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 > 1 ? ((p.x - sc.a.x) * dx + (p.y - sc.a.y) * dy) / len2 : -1;
    if (u > 0 && u < 1 && Math.hypot(sc.a.x + dx * u - p.x, sc.a.y + dy * u - p.y) <= 8) {
      const q = this.planePoint(st.plane, p);
      return { kind: 'line', t: q ? Math.max(0, Math.min(1, lineT(st.g.line, q.x, q.y))) : u };
    }
    return null;
  }

  /** Stopps eines neuen Verlaufs: von der aktuellen Farbe zur Grundfarbe der Fläche (gleich: dunkler); Deckkraft 1 → 0 */
  private freshStops(t: GradTarget, kind: GradKind): GradientStop[] {
    if (kind === 'fade')
      return [
        { t: 0, color: '#000000', a: 1 },
        { t: 1, color: '#000000', a: 0 },
      ];
    // Ebenenstapel: die aktuelle Farbe läuft über die Ebene aus
    if ('plane' in t) {
      const c = this.color ?? '#203040';
      return [
        { t: 0, color: c, a: 1 },
        { t: 1, color: c, a: 0 },
      ];
    }
    const base = (t.face ? facePaint(t.shape, t.face) : t.shape).fill ?? '#808080';
    const from = this.color ?? base;
    let to: PaintColor = base;
    if (this.resolve(from) === this.resolve(to)) {
      const [r, g, b] = hexToRgb(this.resolve(from));
      to = rgbToHex(r * 0.55, g * 0.55, b * 0.55);
    }
    return [
      { t: 0, color: from, a: 1 },
      { t: 1, color: to, a: 1 },
    ];
  }

  /** Verlauf aller Ziele ändern (ein Schritt im Arbeitsverlauf); fn bekommt den Verlauf des ersten */
  private gradEdit(fn: (g: GradientFill) => { line?: GradLine; stops?: GradientStop[]; radial?: boolean }): void {
    const st = this.gradState();
    if (!st || !this.grad) return;
    const patch = fn(st.g);
    if (!Object.keys(patch).length) return;
    const { kind, layer } = this.grad;
    this.edit(() => {
      const styles = styleMap(this.nodes);
      for (const t of this.gradTargets()) writeGradient(t, kind, styles, patch, () => this.freshStops(t, kind), layer);
    });
  }

  /** Verlauf aller Ziele während einer Geste ändern (ohne eigenen Schritt) */
  private gradApply(patch: { line?: GradLine; stops?: GradientStop[]; radial?: boolean }): boolean {
    if (!this.grad) return false;
    const { kind, layer } = this.grad;
    const styles = styleMap(this.nodes);
    let ok = true;
    for (const t of this.gradTargets()) ok = writeGradient(t, kind, styles, patch, () => this.freshStops(t, kind), layer) && ok;
    this.meshDirty = true;
    this.uiDirty = true;
    return ok;
  }

  private gradInfo(): NonNullable<import('./ui').ContextExtra['grad']> {
    const st = this.gradState();
    const kind = this.grad?.kind ?? this.gradKind;
    const stop = st && this.grad?.stop !== null && this.grad?.stop !== undefined ? st.g.stops[this.grad.stop] : undefined;
    return { kind, has: !!st, radial: !!st?.g.radial, stop: stop ? { a: stop.a } : null, stops: st?.g.stops.length ?? 0, targets: this.gradTargets().length };
  }

  /** Regler und Ziele zeichnen */
  private gradOverlay(st: ReturnType<typeof emptyOverlay>): void {
    for (const t of this.gradTargets()) {
      if ('plane' in t) continue;
      const plane = findPlane(this.nodes, t.shape.parent);
      if (!plane) continue;
      const rings = t.face ? [t.face.outline, ...t.face.holes] : [shapeLocalPolys(t.shape).outline];
      const pts = rings.map((r) => r.map(([x, y]) => this.screenOf(plane, shapeToPlane(t.shape, x, y), t.shape)).filter((q): q is Pt => !!q));
      if (t.face) st.face = pts;
      else st.outlines.push(...pts);
    }
    const gs = this.gradState();
    const sc = gs ? this.gradScreen(gs) : null;
    if (!gs || !sc) return;
    const g = this.gesture;
    const sw = swatchMap(this.nodes);
    const look = this.host.world.currentLook;
    st.gradient = {
      a: sc.a,
      b: sc.b,
      radial: !!gs.g.radial,
      stops: sc.stops.map((q, i) => ({ ...q, color: gs.g.type === 'fade' ? `rgba(255,255,255,${gs.g.stops[i].a})` : resolveColor(gs.g.stops[i].color, sw, look), on: this.grad?.stop === i, off: g?.kind === 'gradStop' && g.index === i && g.off })),
      mids: sc.mids,
    };
  }

  /** Verlaufswerkzeug: am Regler greifen, sonst einen neuen Verlauf über die Fläche (oder die gewählten Formen) ziehen */
  private gradDown(pointerId: number, p: Pt): void {
    const hit = this.gradHit(p);
    const st = this.gradState();
    if (hit && st && this.grad) {
      this.history.begin(this.nodes);
      if (hit.kind === 'end') this.gesture = { kind: 'gradEnd', pointerId, end: hit.end };
      else if (hit.kind === 'mid') this.gesture = { kind: 'gradMid', pointerId, index: hit.index };
      else if (hit.kind === 'stop') {
        this.grad.stop = hit.index;
        this.gesture = { kind: 'gradStop', pointerId, index: hit.index, off: false };
      } else {
        const { stops, index } = addStop(st.g.stops, hit.t, swatchMap(this.nodes), this.host.world.currentLook);
        if (index < 0) {
          this.history.cancel();
          this.ui.toast('Höchstens 16 Stopps');
          return;
        }
        this.gradApply({ stops });
        this.grad.stop = index;
        this.gesture = { kind: 'gradStop', pointerId, index, off: false };
      }
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    // Ebenenstapel: Ziehen legt die Linie des Ebenen-Verlaufs neu (Esc beendet)
    const pt = this.grad?.targets.length === 1 && 'plane' in this.grad.targets[0] ? findPlane(this.nodes, this.grad.targets[0].plane) : undefined;
    const pq = pt ? this.planePoint(pt, p) : null;
    if (pt && pq) {
      this.history.begin(this.nodes);
      this.gesture = { kind: 'gradNew', pointerId, plane: pt.id, a: pq, start: p, moved: false };
      return;
    }
    const f = this.faceAtScreen(p);
    if (!f) {
      this.grad = null;
      this.uiDirty = true;
      this.drawOverlay();
      return;
    }
    const free = (s: ZoneShape) => s.parent === f.shape.parent && !s.locked;
    const sel = this.selectedShapes().filter(free);
    const many = sel.some((s) => s.id === f.shape.id) && sel.length > 1;
    const targets = many ? sel.map((s) => ({ shape: s.id, at: null })) : [{ shape: f.shape.id, at: shapeFaces(f.shape).length > 1 ? { ...f.local } : null }];
    this.grad = { targets, kind: this.grad?.kind ?? this.gradKind, stop: null, layer: null };
    this.history.begin(this.nodes);
    this.gesture = { kind: 'gradNew', pointerId, plane: f.plane.id, a: f.q, start: p, moved: false };
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** Richtung rastet nahe an 45°-Schritten ein (Umschalt: immer) */
  private snapDir(a: Pt, q: Pt): Pt {
    const c = constrain45(a, q);
    if (this.shiftDown) return c;
    const t1 = Math.atan2(q.y - a.y, q.x - a.x);
    const t2 = Math.atan2(c.y - a.y, c.x - a.x);
    const d = Math.abs(((t1 - t2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return d < (7 * Math.PI) / 180 ? c : q;
  }

  private gradMove(g: Extract<Gesture, { kind: 'gradNew' | 'gradEnd' | 'gradStop' | 'gradMid' }>, p: Pt): void {
    if (g.kind === 'gradNew') {
      const plane = findPlane(this.nodes, g.plane);
      const q0 = plane ? this.planePoint(plane, p) : null;
      if (!q0 || (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < TAP_DIST)) return;
      g.moved = true;
      const q = this.snapDir(g.a, q0);
      if (!this.gradApply({ line: { x0: g.a.x, y0: g.a.y, x1: q.x, y1: q.y } })) this.ui.toast('Der Füllstapel ist voll (höchstens 8 Schichten)');
      this.drawOverlay();
      return;
    }
    const st = this.gradState();
    if (!st) return;
    const q = this.planePoint(st.plane, p);
    if (!q) return;
    const l = st.g.line;
    if (g.kind === 'gradEnd') {
      const fixed = g.end === 'a' ? { x: l.x1, y: l.y1 } : { x: l.x0, y: l.y0 };
      const m = this.snapDir(fixed, q);
      this.gradApply({ line: g.end === 'a' ? { x0: m.x, y0: m.y, x1: l.x1, y1: l.y1 } : { x0: l.x0, y0: l.y0, x1: m.x, y1: m.y } });
    } else if (g.kind === 'gradMid') this.gradApply({ stops: setMid(st.g.stops, g.index, lineT(l, q.x, q.y)) });
    else {
      // weit weg von der Linie gezogen: der Stopp wird beim Loslassen entfernt (mindestens zwei bleiben)
      const sc = this.gradScreen(st);
      if (sc) {
        const dx = sc.b.x - sc.a.x;
        const dy = sc.b.y - sc.a.y;
        const len = Math.hypot(dx, dy) || 1;
        g.off = st.g.stops.length > 2 && Math.abs((p.x - sc.a.x) * dy - (p.y - sc.a.y) * dx) / len > 40;
      }
      if (!g.off) this.gradApply({ stops: moveStop(st.g.stops, g.index, lineT(l, q.x, q.y)) });
    }
    this.drawOverlay();
  }

  private gradUp(g: Extract<Gesture, { kind: 'gradNew' | 'gradEnd' | 'gradStop' | 'gradMid' }>): void {
    if (g.kind === 'gradStop' && g.off) {
      const st = this.gradState();
      if (st) this.gradApply({ stops: removeStop(st.g.stops, g.index) });
      if (this.grad) this.grad.stop = null;
    }
    if (g.kind === 'gradNew' && !g.moved) this.history.cancel();
    else if (this.history.commit(this.nodes)) this.changed();
    this.uiDirty = true;
    this.drawOverlay();
  }

  /** Antwort auf „Grundfarbe oder Verlaufsstopp?“ */
  private resolveDropChoice(which: 'base' | 'stop' | 'cancel'): void {
    const d = this.dropChoice;
    this.dropChoice = null;
    this.uiDirty = true;
    const shape = d ? findShape(this.nodes, d.shape) : undefined;
    if (!d || !shape || which === 'cancel') return;
    const faces = shapeFaces(shape);
    const fi = d.at ? faceAt(faces, d.at.x, d.at.y) : 0;
    const face = faces[fi];
    if (!face) return;
    if (which === 'base') {
      this.edit(() => setFaceFill(shape, face, d.color));
      return;
    }
    // Stopp in den Verlauf, der die Fläche färbt (der Fläche oder der ganzen Form)
    const own = facePaint(shape, face) !== shape;
    const t: GradTarget = { shape, face: own ? face : null };
    const g = readGradient(t, 'gradient', styleMap(this.nodes));
    if (!g) return;
    const { stops, index } = addStop(g.stops, d.t, swatchMap(this.nodes), this.host.world.currentLook, d.color);
    if (index < 0) return;
    this.edit(() => writeGradient(t, 'gradient', styleMap(this.nodes), { stops }, () => stops));
    this.ui.toast('Stopp in den Verlauf gesetzt (mit dem Verlaufswerkzeug G verschieben)');
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
    // Anstrich kopieren und einfügen wie Figma (Cmd+Wahl+C/V; mit Wahltaste liefert e.key Sonderzeichen, darum e.code)
    else if (cmd && e.altKey && e.code === 'KeyC') this.styleCommand('copy');
    else if (cmd && e.altKey && e.code === 'KeyV') this.styleCommand('paste');
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
    else if (k === 'i') this.setTool('pipette');
    else if (k === 'g') this.setTool('gradient');
    else if (k === 'e') this.setTool('dotbrush');
    else if (k === 'n') this.setTool('mist');
    else if (k === 'd') this.setTool('dock');
    else if (k === 'r') this.setTool('field');
    else if (k === '1') this.setView('game');
    else if (k === '2') this.setView('front');
    else if (k === '3') this.setView('free');
    else if (k === '4') this.setView('side');
    else if (k === 'tab') this.setBuilding(false);
    else if (k === ' ') this.spaceDown = true;
    else if (k === 'escape') {
      if (this.dropChoice) this.resolveDropChoice('cancel');
      else if (this.fillMode) this.endFill();
      else if (this.tool === 'gradient' && this.grad) {
        if (this.grad.stop !== null) this.grad.stop = null;
        else this.grad = null;
        this.uiDirty = true;
        this.drawOverlay();
      }
      else if (this.ui.colorOpen) this.ui.closeColor();
      else this.escape();
    }
    else if (k === 'delete' || k === 'backspace') this.deleteShape();
    else if ((k === ']' || k === '[') && (this.tool === 'mist' || this.tool === 'dotbrush')) {
      const dir = k === ']' ? 1 : -1;
      if (this.tool === 'mist') this.mistBrush.size = mistSize(this.mistBrush.size, dir);
      else this.dotBrush.size = dotSize(this.dotBrush.size, dir);
      this.uiDirty = true;
      this.drawOverlay();
    }
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
