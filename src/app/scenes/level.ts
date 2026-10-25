/**
 * Level-Szene: Bühnen-Zeichnen (Boden = Tiefe, steil = Höhe), 3D-Knoten mit Tangenten-, Tiefen- und
 * Roll-Handle, Chips, Element-Regal, Fahrt mit Kamera, Ergebnis. Auch Sandbox („Meine Bahnen“).
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
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
import type { BeltLevel, ElementId, LevelDef, WorldDef } from '@/levels/types';
import { goalLabel, ELEMENT_NAMES } from '@/levels/goalLabels';
import { evaluate, type Evaluation, hasNegativeGoals } from '@/levels/evaluator';
import { Terrain } from '@/physics/terrain';
import { SKIN_PHYSICS, TrainSim, simOptionsForLevel, type CarState, type FailReason, type TrainSimOptions } from '@/physics/trainSim';
import { carFrame, stateAt } from '@/track/model';
import { PassengerSim, initPhysics, emptyParts, seatedPose, type PassengerView } from '@/physics/passengers';
import { restraintFor } from '@/physics/belts';
import { audio } from '@/core/audio';
import { lerpCar, lerpParts } from '@/physics/interpolate';
import {
  clonePath, closestSample, createNode, emptyPath, isAutoNode, isClosed, nodeIn, nodeOut, sampleTrack, segmentPoints, trackStats,
  type ElementKind, type StartType, type TrackNode, type TrackPath, type TrackSamples, type TrackStats,
} from '@/track/model';
import { strokeToTrack, closePath, extendTrack, interpretStroke, lanesTrack, type BlockedInfo, type InterpretedPoint, type StrokeMode } from '@/track/strokeToTrack';
import { bendSegment } from '@/track/edit';
import { RubberBrush, chaikin, resamplePolyline } from '@/track/brush';
import { BrushRefiner, joinLines, lineLength, planBrushTrack, previewBrushTrack, spliceLine, swapCrossing, trackLine, trackLineWithDepth, type BrushPlan, type BrushPreview } from '@/track/brushTrack';
import { TrackInspector, type WeakSpot } from '@/track/inspect';
import { findCrossings } from '@/track/crossings';
import { MeasureOverlay } from '@/render/measureOverlay';
import { safeArea } from '@/platform/safeArea';
import { applyOverdraw, nearestOnTrack } from '@/track/overdraw';
import { cutIndexNear, retractIndex } from '@/track/strokeBuffer';
import { laneRise, laneScale, nearestLane, rayToWorld, setPerspective, tagRay, toStage, toView, viewState, type StagePoint, LANE_MIN, LANE_MAX, LANE_DEPTH, LANE_RISE } from '@/track/stage';
import { WorldView } from '@/render/worldView';
import { HANG_DROP, trackTypeForSkin, type TrackType } from '@/world/trackTypes';
import type { ZoneElement, ZoneField, ZoneFile, ZoneSite, ZoneStation } from '@/zone/types';
import { LIFT_HEIGHT_DEFAULT, allowedStarts, resolveAbilities, zoneUnlocks, type ResolvedAbilities } from '@/zone/abilities';
import { RockField } from '@/zone/rock';
import { SITE_OPENING_R, SITE_REACH, siteAnchor, siteTarget, siteWalls, withSiteOpenings } from '@/zone/sites';
import { applyZoneExtras, stationPath, zoneCoins } from '@/zone/build';
import { ZoneEditor } from '@/app/zoneEditor';
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
  /** Zone aus der Zonendatei: flacher Boden, alles freigeschaltet, Elemente aus der Datei (mit ?editor=1 der Editor) */
  zone?: ZoneFile;
}

type Mode = 'draw' | 'ride' | 'result';
type StrokeKind = 'new' | 'overdraw' | 'terrain' | 'extend';
/** Lesart des Strichs: Pinsel (Linie = Bahn), Bühne (Boden = Tiefe, steil = Höhe) oder Ein Strich (alles Höhe) */
type StrokeReading = 'brush' | 'stage' | 'single' | 'lanes';

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
/** Symbol der Startart im Chip oder im großen Knopf (k: Maßstab) */
function drawStartIcon(g: Graphics, type: StartType, k: number): void {
  const ink = hexNum(INK);
  if (type === 'chainlift') for (let i = 0; i < 4; i++) g.circle((-9 + i * 6) * k, (6 - i * 4) * k, 2.6 * k).fill(ink);
  else if (type === 'launch' || type === 'hydro') g.poly([-3, -11, 6, -1, 1, -1, 3, 11, -6, 1, -1, 1].map((v) => v * k)).fill(type === 'hydro' ? 0x3ec7c2 : 0xffb13b).stroke({ width: 1.5 * k, color: ink });
  else if (type === 'swing') {
    g.moveTo(0, -10 * k).lineTo(-6 * k, 6 * k).stroke({ width: 2.5 * k, color: ink });
    g.circle(-6 * k, 7 * k, 3.5 * k).fill(0xffd23f).stroke({ width: 1.5 * k, color: ink });
  } else {
    g.moveTo(0, 9 * k).lineTo(0, -9 * k).stroke({ width: 3 * k, color: ink, cap: 'round' });
    g.moveTo(-6 * k, -3 * k).lineTo(0, -9 * k).lineTo(6 * k, -3 * k).stroke({ width: 3 * k, color: ink, cap: 'round', join: 'round' });
  }
}
/** Bühnen-Meter Tinte hinter dem Finger (die Bahn selbst ist die Vorschau) */
const INK_TAIL = 1.5;
/** Zurückziehen des Strichs: so nah (px) an der eigenen Linie und entgegen ihrer Richtung radiert der Zeiger den Strich */
const RETRACT_PX = 10;
/** … und so weit (Bühnen-Meter) hinter dem Ende wird dafür gesucht (ein Rückzug beginnt immer am Ende) */
const RETRACT_REACH = 6;
/** … und so weit (Bühnen-Meter) muss der Zeiger erst zurücklaufen, bevor radiert wird (ein Kreuzen der eigenen Linie bleibt) */
const RETRACT_MIN = 1.0;
/** Spurende: so lange (s) nach dem letzten Anstoßen bleibt die Tinte rot */
const BLOCKED_SHOW = 0.6;
/**
 * Autoscroll beim Zeichnen (siehe autoscroll): Randzone als Anteil der Bildschirmseite (waagrecht, senkrecht; mit
 * Unter- und Obergrenze in px) und Tempo am Rand als Anteil der Bildschirmseite je Sekunde (Grenzen in px/s)
 */
const SCROLL_ZONE = { x: 0.3, y: 0.18, min: 70, max: 300 };
const SCROLL_MAX = { x: 0.75, y: 0.5, min: 220, max: 760 };
/** Anteil des Fingertempos Richtung Rand, mit dem die Kamera mitzieht */
const SCROLL_FOLLOW = 0.8;
/** zieht der Finger schneller als das vom Rand weg (px/s), bremst die Kamera */
const SCROLL_AWAY = 60;
/** so schnell folgt das Kameratempo dem Wunschtempo (1/s; 7 heißt rund 0,15 s) */
const SCROLL_RESPONSE = 7;
/** Autoscroll erst, wenn der Finger seit dem Aufsetzen so weit (px) gezogen hat */
const SCROLL_AFTER = 12;
/**
 * Größen zum Ausprobieren auf dem Handy per Adresse: ?tip=24 (Tropfen unter dem Finger), ?line=14 (gemalte Linie),
 * ?band=30 (Gummiband), ?dzoom=10 (Zeichen-Zoom in px/m), ?tipr=18 (Strichspitze der anderen Lesarten)
 */
const urlNum = (key: string, fallback: number): number => {
  if (typeof location === 'undefined') return fallback;
  const v = Number(new URLSearchParams(location.search).get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
/** Strichspitze: dicker Punkt unter dem Finger (Radius px) und ein sich verjüngender Schweif (Länge px) entlang des Strichs */
const TIP_RADIUS_PX = urlNum('tipr', 13);
const TIP_TAIL_PX = 110;
/** Knotenwahl beim Zeichnen: Scheitel-Semantik (Standard) oder der alte Schneider-Fit zum Vergleich (?fit=legacy) */
const FIT_MODE: 'apex' | 'legacy' = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fit') === 'legacy' ? 'legacy' : 'apex';
/** Lesart per Adresse erzwingen (?brush, ?stage, ?single, ?lanes), sonst gilt die Einstellung (Knopf unten links) */
const STROKE_MODE_URL: StrokeReading | null = (() => {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  return q.has('brush') ? 'brush' : q.has('stage') ? 'stage' : q.has('single') ? 'single' : q.has('lanes') ? 'lanes' : null;
})();
/** ?persp=1: Perspektive (Richtlinie, Schritt 1: Spur-Ebenen um das Kameraziel skaliert, Strich als Strahl je Spur gedeutet), ?fov=18 Bildwinkel in Grad */
const PERSP_URL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('persp') === '1';
/** mit dem Weltrenderer (?world=1) ist die Perspektive Standard; ?persp=0 zeigt dort zum Vergleich die Bühne */
const PERSP_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('persp') === '0';
const FOV_URL = urlNum('fov', 18);
/** ?editor=1: Klötzchen-Editor der Zone (nur mit ?zone=, am Mac) */
const EDITOR_URL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('editor') === '1';
/** ?scroll=0: kein Autoscroll beim Zeichnen (automatische Tests zeichnen in festen Bildschirmkoordinaten) */
const AUTOSCROLL = typeof location === 'undefined' || new URLSearchParams(location.search).get('scroll') !== '0';
/** Zeichen-Zoom auf dem Handy: mindestens so viele Pixel pro Bühnen-Meter (eine Spur rund 5 mm); der Rest des Levels
 *  über Autoscroll am Rand oder Wischen, Doppeltipp auf freie Fläche wechselt zur Übersicht */
const DRAW_ZOOM_MIN = urlNum('dzoom', 7);
/** Zeichen-Zoom nur, wenn die kürzere Bildschirmseite schmaler ist (Handys) */
const DRAW_ZOOM_SCREEN = 600;
/** Gummiband zwischen Finger und Linienende (Bildschirm-Pixel) */
const BAND_PX = urlNum('band', 22);
/** Tropfen unter dem Finger (Radius, Bildschirm-Pixel) */
const TIP_PX = urlNum('tip', 17);
/** Breite der gemalten Linie (Bildschirm-Pixel, mindestens 0,6 Bühnen-Meter) */
const BRUSH_LINE_PX = urlNum('line', 9);
/**
 * Pinsel wie mit einem sehr langen Pinsel mit biegsamer Spitze: Die gemalte Bahn folgt der Gummiband-Spitze zäh
 * (Zeitkonstante in s, also umso weiter hinterher, je schneller der Finger zieht), höchstens BRUSH_TAIL_PX. Der
 * Rückstand ist die rosa Schleppe, die sich vom Tropfen unter dem Finger zum Ende der Bahn verjüngt. Die Linie selbst
 * (und damit die Bahn nach dem Loslassen) ändert das nicht.
 */
const BRUSH_LAG = 0.14;
const BRUSH_TAIL_PX = 200;
/** Tropfen: so weit (s) wird der Finger vorausgeschätzt, wenn der Browser keine Vorhersage liefert (Bildlatenz) */
const BRUSH_PREDICT = 0.02;
/** so viele Millisekunden je Bild rechnen die Probefahrten nach dem Loslassen */
const REFINE_SLICE_MS = 6;

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
  /** Pinsel des laufenden Strichs (Pinsel-Zeichnen); die gemalte Linie ist dann this.stroke */
  private brush: RubberBrush | null = null;
  /** Probefahrten der zuletzt gemalten Bahn (laufen nach dem Loslassen in Zeitscheiben) */
  private refiner: BrushRefiner | null = null;
  /** die Bahn, die die Probefahrten verbessern (nur sie wird ersetzt) */
  private refining: TrackPath | null = null;
  /** Stellen, die die Bahn nach den Probefahrten hingenommen hat (Anzeige im Dev-Modus) */
  /** Schwachstellen der aktuellen Bahn (DEV: rote Ringe), nach jeder Änderung neu geprüft (TrackInspector) */
  private weakSpots: WeakSpot[] = [];
  private inspector: TrackInspector | null = null;
  private inspectAt = -1;
  private spotLayer = new Graphics();
  /** vorhergesagte Fingerposition (Bühne) für die Strichspitze, null = keine Vorhersage */
  private predicted: StagePoint | null = null;
  /** Pinsel: so weit (Bühnen-Meter entlang der Linie) ist die Bahn schon gemalt, der Rest ist Schleppe */
  private brushShown = 0;
  /** Pinsel: letzte Live-Vorschau (ihre Tiefe hält den ruhigen Teil fest) und beim Fortsetzen die alte Bahn mit Tiefe */
  private brushPreview: BrushPreview | null = null;
  /** so weit (Bühnen-Meter entlang der Linie) zeigt die letzte Vorschau die Bahn schon als Schienen */
  private brushPreviewedLen = 0;
  private brushBase: { line: StagePoint[]; z: Float64Array } | null = null;
  /** Plan der aktuellen Pinsel-Bahn (Kreuzungen zum Tauschen) und der Stand der Bahn, zu dem er passt */
  private brushPlan: BrushPlan | null = null;
  private brushPlanStamp = 0;
  /** Handy: Übersicht statt Zeichen-Zoom (Doppeltipp auf freie Fläche schaltet um) */
  private overview = false;
  /** rohe Fingerpunkte des laufenden Strichs (Bühne X, Y, Millisekunden seit Strichbeginn) für den Strich-Rekorder */
  private rawStroke: number[][] = [];
  private rawStart = 0;
  private strokeKind: StrokeKind = 'new';
  private strokeModes: StrokeMode[] = [];
  /** Spur und Lesart am Ende des Strichs (aus der letzten Vorschau), für die Spur-Anzeige */
  private strokeLane: { lane: number; mode: StrokeMode } | null = null;
  /** letzte Zeigerpositionen (Bühne) über rund einen Meter: Bewegungsrichtung für das Zurückziehen */
  private pointerTrail: StagePoint[] = [];
  /** letzte Zeigerposition auf dem Bildschirm während eines Strichs (Autoscroll am Bildrand) */
  private pointerScreen: Pt | null = null;
  /** Autoscroll: Fingertempo auf dem Bildschirm (px/s, geglättet), Kameratempo (px/s), Fingerweg seit dem Aufsetzen */
  private fingerV: Pt = { x: 0, y: 0 };
  private scrollV: Pt = { x: 0, y: 0 };
  private scrollFrom: Pt | null = null;
  private strokeTravel = 0;
  /** Zurückziehen läuft (nach RETRACT_MIN auf der Linie zurück); davor zählt retractDist den Weg */
  private retracting = false;
  private retractDist = 0;
  /** Spurende: Zeitpunkt des letzten Anstoßens (Kehre in eine Richtung ohne Spur) und gewünschte Richtung */
  private blockedAt = -10;
  private blockedDir = 0;
  /** Strichindex, an dem der Strich für eine Kehre ohne Spur abgeschnitten wurde (0: noch nicht) */
  private blockedCut = 0;
  private blockedToastAt = -10;
  private previewTimer = 0;
  /** Dauer der letzten Vorschau in Sekunden: der Takt passt sich an (jeden Frame, sonst das 1,25-Fache der Dauer) */
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
  /** Bedienung, die beim Zeichnen zurücktritt (ausgeblendet, solange der Finger zeichnet): fast alles außer dem Hinweis */
  private hud = new Container();
  private overlay = new Graphics();
  private ink = new Graphics();
  /** Leichter Schein auf der Bodenlinie der Spur, auf der gerade gezeichnet wird */
  private laneGlow = new Graphics();
  private laneGlowState: { lane: number; mode: StrokeMode; blocked: boolean } = { lane: NaN, mode: 'floor', blocked: false };
  /** Geister-Schiene (vorgeschlagene Schlussverbindung) und Looping-Marker während des Strichs */
  private ghost = new Graphics();
  /** Markierung des offenen Endes (pulsiert) */
  private endMarker = new Graphics();
  /** Spur-Anzeige unten rechts: fünf Ebenen wie die Bühne, die aktive leuchtet (grün Boden, pink Höhe) */
  private laneHud = new Container();
  private laneHudG = new Graphics();
  private laneHudState: { lane: number | null; mode: StrokeMode; blocked: number } = { lane: NaN, mode: 'floor', blocked: 0 };
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
  /** Umschalter der Lesart (Bühne / Ein Strich), zum Ausprobieren */
  /** Lesart „Ebenen“: Ebenenleiste links (hinten oben, vorne unten) und die für den nächsten Strich gewählte Ebene */
  private lanePanel = new Container();
  private laneBtns: Array<{ lane: number; btn: Button }> = [];
  /** Auto: Rückkurve im Strich führt von selbst auf die nächste Ebene (Einstellung lanesAuto) */
  private laneAutoBtn = new Button('', { width: 64, height: 32, size: 13, color: '#fff8ec', textColor: INK });
  private armedLane: number | null = null;
  /** gewählte Ebene beim Aufsetzen des Strichs (für den Strich-Rekorder) */
  private strokeArmed: number | null = null;
  private lanePanelKey = '';
  /** Streckenlänge: Anzeige unten links (Tipp öffnet den Regler), Regler für das Budget, gemessene Länge (m) */
  private lengthPill = new Container();
  private lengthBg = new Graphics();
  private lengthText = label('', 15, INK, true);
  private lengthSlider = new Container();
  private sliderBar = new Graphics();
  private sliderText = label('', 15, INK, true);
  private sliderDrag = false;
  private lengthKey = '';
  private liveLength = 0;
  private overBudgetToast = false;
  private shelf = new Container();
  private shelfOpen = false;
  private toast = new Toast();
  private resultPanel: Container | null = null;
  private uiButtons: Button[] = [];
  /** Klötzchen-Editor der Zone (?zone=…&editor=1) */
  private zoneEditor: ZoneEditor | null = null;
  /** aktives Feld der Zone: Kamera bleibt darin (weich), Zoom höchstens „Feld passt ins Bild“, Absperrband an den Rändern */
  private activeField: ZoneField | null = null;
  /** Schalter, Gurt, Kettenzugstärke und Grenzen des aktiven Felds (Etappe 2, Schritt 1; ohne Feld: alles) */
  private abilities: ResolvedAbilities | null = null;
  /** Festigkeitsfeld der Zone (Etappe 2, Schritt 5): fester Fels aus den Elementen bis zur Fortschrittsstufe; null ohne Zone */
  private rock: RockField | null = null;
  private rockToastAt = -10;
  /** offene Baustellen dieser Sitzung (Etappe 2, Schritt 6): Verbinden nach der Freilegung, Durchbruch nach dem Zersplittern */
  private readonly openedSites = new Set<string>();
  /** laufende Freilegung: Ping, Kamera heraus, Lippe löst sich auf, Staub, Öffnung, Kamera zurück */
  private reveal: { site: ZoneSite; el: ZoneElement; t: number; cam: { x: number; y: number; zoom: number }; dusted: boolean } | null = null;
  private fxLayer = new Graphics();
  private fieldTape = new Graphics();
  /** Kettenzuglinie (Etappe 2, Schritt 3): gestrichelt in der Höhe, bis zu der die Kette des Felds zieht, mit Beschriftung im HUD */
  private chainLine = new Graphics();
  private chainLabel = label('', 13, INK, true);

  constructor(levelId: number, sandbox: SandboxConfig | null = null) {
    this.sandbox = sandbox;
    if (sandbox?.zone) {
      // Zone: flacher Boden, die Kulissen kommen aus der Zonendatei; die Basiszone kann alles
      this.world = WORLDS[clamp(sandbox.world - 1, 0, 9)];
      this.level = { id: 0, world: this.world.id, name: sandbox.zone.name, hook: '', goals: [], width: sandbox.zone.width, terrain: [{ kind: 'flat' }], cars: 3, passengers: 6 };
      // Fähigkeiten als Schalter (Etappe 2, Schritt 1): ohne Feld kann die Zone alles, nur „Boden formen“ nicht (Plan 7.5);
      // die Schalter des aktiven Felds setzt setActiveField
      this.unlocked = zoneUnlocks(unlockedUpTo(150), resolveAbilities(sandbox.zone, null));
    } else if (sandbox) {
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
    if (unlockAll() && !sandbox?.zone) this.unlocked = unlockedUpTo(150);
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
    // Weltrenderer: Boden und Erdschnitt aus dem Terrain, Himmel vor der Welt; Perspektive dort Standard
    if (game.world) {
      this.view.setWorldMode(game.world);
      game.world.showLevel(this.terrain, this.world, night);
      const zone = this.sandbox?.zone;
      if (zone) {
        // Zone: Bahntyp der Datei (die Adresse ?track= geht vor), Elemente in die Welt, mit ?editor=1 der Editor
        game.world.trackOverride = game.world.trackOverride ?? zone.trackType;
        game.world.setZone(zone.elements);
        applyZoneExtras(game.world, zone);
        this.level.coins = zoneCoins(zone);
        this.refreshRock();
        if (EDITOR_URL) {
          this.zoneEditor = new ZoneEditor(
            {
              view: this.view,
              world: game.world,
              toast: this.toast,
              redrawTrack: () => this.redrawTrack(),
              setActiveField: (f) => this.setActiveField(f),
              refreshCoins: () => {
                this.level.coins = zoneCoins(zone);
                this.view.trackR.setCoins(this.level.coins);
              },
              refreshStation: () => this.resetStationPiece(),
              refreshRock: () => this.refreshRock(),
              startRide: () => this.startRide(),
            },
            zone,
          );
          this.ui.addChild(this.zoneEditor.hud);
        } else {
          // ohne Editor (Handy): ?field=<Kennung> wählt ein Feld der Zone, sonst das erste
          const want = new URLSearchParams(location.search).get('field');
          this.setActiveField(zone.fields.find((f) => f.id === want) ?? zone.fields[0] ?? null);
        }
      }
    }
    this.view.overlay.addChild(this.fieldTape, this.chainLine, this.fxLayer);
    setPerspective(game.world ? !PERSP_OFF : PERSP_URL, FOV_URL);
    this.view.overlay.addChild(this.laneGlow, this.spotLayer, this.ink, this.ghost, this.overlay, this.endMarker);
    this.container.addChild(this.view.root, this.ui);
    this.laneHud.addChild(this.laneHudG);
    this.hud.addChild(this.measure.container, this.chipLayer, this.gizmoLayer, this.chainLabel, this.goalsBar, this.levelTitle, this.beltBadge, this.sticker, this.hint, this.speedText, this.rollText, this.shelf, this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn);
    this.ui.addChild(this.hud, this.laneHud, this.toast);
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn, ...this.laneBtns.map((l) => l.btn), ...(this.zoneEditor?.buttons ?? [])];
    this.speedBtn.visible = false;
    this.buildLanePanel();
    this.buildLengthUI();
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
    this.levelTitle.text = this.sandbox?.zone ? `Zone ${this.sandbox.zone.name}` : this.sandbox ? `${t('sandbox')} · ${this.world.name}` : `${t('level', { n: this.level.id })} · ${this.level.name}`;
    this.beltBadge.addChild(this.beltIconG, this.beltText);
    this.beltText.anchor.set(0.5, 0);
    this.beltText.position.set(0, 18);
    this.refreshBeltBadge(false);
    this.view.trackR.setCoins(this.level.coins ?? []);
    this.buildShelf();
    this.setupInput();
    const draft = this.sandbox?.saved?.path ?? (this.sandbox ? undefined : storage.draft(this.level.id));
    if (draft && draft.nodes.length >= 2 && 'inZ' in draft.nodes[0]) this.setPath(clonePath(draft), false);
    else this.resetStationPiece();
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
    setPerspective(false);
    this.game.world?.clearLevel();
    this.view.destroy();
  }

  /** Hintergrund vor der Three-Welt (Weltrenderer): der Himmel */
  get background(): Container | undefined {
    return this.view?.background;
  }

  /** Ziele im Spiel: im Level immer, in der Zone sobald das aktive Feld welche einträgt (sonst Sandkasten mit Maßband) */
  private get hasGoals(): boolean {
    return !this.sandbox || this.level.goals.length > 0;
  }

  /** Station der Zone für die Bahn: die im aktiven Feld, sonst die erste; null ohne Station */
  private zoneStation(): ZoneStation | null {
    const zone = this.sandbox?.zone;
    if (!zone || !zone.stations.length) return null;
    const f = this.activeField;
    return (f && zone.stations.find((s) => s.x >= f.x0 && s.x <= f.x1 && s.y >= f.y0 && s.y <= f.y1)) ?? zone.stations[0];
  }

  /** Ist die Bahn nur das Vorgabestück der Station (noch nichts gezeichnet)? Gerade (zwei Knoten) oder mit Aufzug (vier, der letzte „lift“) */
  private isStationPieceOnly(): boolean {
    const p = this.path;
    if (!p || p.nodes[0]?.kind !== 'station' || p.closed !== false || !p.brush) return false;
    return p.nodes.length === 2 || (p.nodes.length === 4 && p.nodes[3].kind === 'lift');
  }

  /** Festigkeitsfeld neu aus den Elementen der Zone (nach Änderungen im Editor und beim Feldwechsel: die Stufe blendet Elemente aus) */
  private refreshRock(): void {
    const zone = this.sandbox?.zone;
    this.rock = zone ? new RockField(this.derivedElements(), this.activeField?.stage ?? Infinity) : null;
    this.view.rock = this.rock;
  }

  /** Elemente der Zone mit den Öffnungen der offenen Verbinden-Baustellen (Schritt 6; die Zonendatei bleibt unverändert) */
  private derivedElements(): ZoneElement[] {
    const zone = this.sandbox?.zone;
    return zone ? withSiteOpenings(zone.elements, zone.sites, this.openedSites) : [];
  }

  /** Verbinden-Baustelle, an deren Anschlusspunkt das Strichende einrastet (Fang wie beim Rundenschluss), sonst null */
  private siteSnap(drawn: StagePoint[]): { site: ZoneSite; el: ZoneElement; X: number; Y: number; lane: number } | null {
    const zone = this.sandbox?.zone;
    if (!zone || drawn.length < 2) return null;
    const e = drawn[drawn.length - 1];
    const reach = Math.max(SITE_REACH, 40 / this.view.camera.zoom);
    let best: { site: ZoneSite; el: ZoneElement; X: number; Y: number; lane: number } | null = null;
    let bestD = reach;
    for (const site of zone.sites) {
      if (site.variant !== 'connect' || this.openedSites.has(site.id)) continue;
      const el = siteTarget(zone.elements, site);
      if (!el) continue;
      const a = siteAnchor(zone.elements, site);
      const v = toView(a.x, a.y, a.lane);
      const d = Math.hypot(v.X - e.X, v.Y - e.Y);
      if (d < bestD) {
        bestD = d;
        best = { site, el, X: v.X, Y: v.Y, lane: a.lane };
      }
    }
    return best;
  }

  /** Freilegung starten (Richtlinie 4): Ping am Punkt, Kamera fährt heraus, die Lippe löst sich auf, Staub, dann ist die Öffnung da */
  private startReveal(site: ZoneSite, el: ZoneElement): void {
    const cam = this.view.camera.target;
    this.reveal = { site, el, t: 0, cam: { x: cam.x, y: cam.y, zoom: cam.zoom }, dusted: false };
    this.game.world?.beginReveal(el.id, { x: site.x, y: site.y }, (site.r ?? SITE_OPENING_R) + 0.8);
    this.toast.show(t('site.reveal'), 1.2);
    audio.play('impact');
  }

  private stepReveal(dt: number): void {
    const r = this.reveal;
    if (!r) return;
    r.t += dt;
    const world = this.game.world;
    const v = toView(r.site.x, r.site.y, r.el.z);
    const g = this.fxLayer;
    g.clear();
    const zs = 1 / Math.max(0.35, this.view.camera.zoom / 12);
    if (r.t < 0.6) {
      // Ping: ein wachsender Ring am Anschlusspunkt
      const k = r.t / 0.6;
      g.circle(v.X, v.Y, (1 + 5 * k) * zs).stroke({ width: 0.35 * zs, color: 0xffd23f, alpha: 1 - k });
    }
    if (r.t < 1.0) this.view.camera.setTarget(r.site.x, r.site.y + 3, r.cam.zoom * 0.8);
    const p = Math.max(0, Math.min(1, (r.t - 0.7) / 2.0));
    world?.setReveal(p * p * (3 - 2 * p));
    if (r.t > 1.1 && !r.dusted) {
      r.dusted = true;
      this.view.effects.dust(v.X, v.Y, 6);
      this.view.camera.shake(0.3, 0.3);
    }
    if (r.t >= 2.9) {
      // Öffnung ist da: Festigkeitsfeld und Welt neu, Kamera zurück
      this.openedSites.add(r.site.id);
      world?.endReveal();
      const derived = this.derivedElements().find((e) => e.id === r.el.id);
      if (derived) world?.updateZoneElement(derived);
      this.refreshRock();
      // das Bahnende rutscht durch die Öffnung in den Innenraum: Der nächste Strich beginnt hinter der Lippe (Plan 5.2)
      const end = this.path?.nodes[this.path.nodes.length - 1];
      if (this.path && end && !isClosed(this.path) && Math.hypot(end.x - r.site.x, end.y - r.site.y) < 2) {
        const half = (r.el.d ?? 7.5) / 2 / LANE_DEPTH;
        end.z = r.el.z - half + 0.25;
        this.redrawTrack();
      }
      this.view.camera.setTarget(r.cam.x, r.cam.y, r.cam.zoom);
      this.reveal = null;
      g.clear();
      this.toast.show(t('site.open'), 2);
    }
  }

  /** Hubhöhe des Aufzugs im Feld (Etappe 2, Schritt 3b) */
  private elevatorHeight(): number {
    return this.abilities?.lift ?? LIFT_HEIGHT_DEFAULT;
  }

  /**
   * Vorgabestück der Station setzen (Plan 3.3: Bahnstart vorgegeben, gerade, 14 m): beim Betreten, nach dem Löschen und
   * wenn der Editor die Station verschiebt, solange noch nichts gezeichnet ist
   */
  private resetStationPiece(type: StartType = this.path?.startType ?? 'chainlift'): void {
    const st = this.zoneStation();
    if (!st) return;
    this.view.stationLength = st.length;
    if (!this.path || this.isStationPieceOnly()) {
      // Startart bleibt (oder die erste erlaubte); beim Aufzug trägt das Vorgabestück den senkrechten Lift (Schritt 3b)
      const allowed = this.abilities ? (allowedStarts(this.abilities) as StartType[]) : [];
      const start = allowed.length && !allowed.includes(type) ? allowed[0] : type;
      const piece = stationPath(st, start === 'verticalLift' ? this.elevatorHeight() : 0);
      piece.startType = start;
      this.setPath(piece, false);
    }
    this.ensureStartAllowed();
  }

  /** Feld der Zone aktiv schalten (null: ganze Zone): Kamera weich begrenzt, Zoom-Grenze „Feld passt ins Bild“, Absperrband */
  private setActiveField(field: ZoneField | null): void {
    this.activeField = field;
    // Ziele, Fortschritts- und Aufwertungsstufe des Felds gelten für dieses Level (Schritt 9): die Zielleiste wertet
    // sie wie im Level aus, die Gurtstufe gilt für die Fahrt, Elemente späterer Wachstumsstufen fehlen in der Welt
    this.level.goals = (field?.goals ?? []).map((g) => ({ type: g.type, ...(g.value !== undefined ? { value: g.value } : {}), ...(g.bonus ? { bonus: true } : {}) }));
    // Fähigkeiten als Schalter (Etappe 2, Schritt 1): Stufe der Zone plus Überschreibungen des Felds → Freischaltungen
    // (Regal, Startarten, Rolle, Tunnel), Gurt, Streckenbudget und Höhenlimit; die Kettenzugstärke nutzt Schritt 3
    const zone = this.sandbox?.zone;
    if (zone) {
      const res = resolveAbilities(zone, field);
      this.abilities = res;
      this.unlocked = zoneUnlocks(unlockedUpTo(150), res);
      this.level.restraint = res.belt;
      this.level.trackBudget = res.budget || undefined;
      this.level.maxHeight = res.maxHeight || undefined;
      this.view.chainHeight = res.chain;
      this.shelfOpen = false;
      this.buildShelf();
    }
    this.game.world?.setStage(field?.stage ?? Infinity);
    this.refreshRock();
    this.goalsBuiltFor = '';
    this.refreshBeltBadge(false);
    this.updateGoals();
    this.resetStationPiece();
    const cam = this.view.camera;
    if (field) {
      const b = { minX: field.x0, maxX: field.x1, minY: field.y0, maxY: field.y1 };
      cam.softBounds = b;
      cam.minZoom = Math.max(1, cam.fitZoom(b));
      cam.fitBounds(b, 0.02, 30);
    } else {
      cam.softBounds = null;
      cam.minZoom = 3;
    }
    this.drawFieldTape();
  }

  /** Absperrband an den Rändern des aktiven Felds (links, rechts, oben), in der Ansicht auf Spur 0 */
  private drawFieldTape(): void {
    this.drawChainLine();
    const g = this.fieldTape;
    g.clear();
    const f = this.activeField;
    if (!f) return;
    const corners = [toView(f.x0, f.y0, 0), toView(f.x0, f.y1, 0), toView(f.x1, f.y1, 0), toView(f.x1, f.y0, 0)];
    const edge = (a: { X: number; Y: number }, b: { X: number; Y: number }) => {
      const len = Math.hypot(b.X - a.X, b.Y - a.Y);
      const n = Math.max(2, Math.round(len / 2.5));
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        g.moveTo(a.X + (b.X - a.X) * t0, a.Y + (b.Y - a.Y) * t0).lineTo(a.X + (b.X - a.X) * t1, a.Y + (b.Y - a.Y) * t1).stroke({ width: 0.5, color: i % 2 ? 0x2a1f3d : 0xffd23f, alpha: 0.9 });
      }
    };
    edge(corners[0], corners[1]);
    edge(corners[1], corners[2]);
    edge(corners[2], corners[3]);
  }

  /**
   * Kettenzuglinie (Etappe 2, Schritt 3; Plan 2.4, 7.4): Zieht in der Zone eine Kette mit begrenzter Stärke, zeigt eine
   * gestrichelte Linie auf der Spur der Station die Höhe, bis zu der sie zieht; der erste Hügel darf nicht höher sein.
   */
  private drawChainLine(): void {
    const g = this.chainLine;
    g.clear();
    this.chainLabel.visible = false;
    const st = this.zoneStation();
    const chain = this.abilities?.chain;
    const type = this.path?.startType ?? 'chainlift';
    if (!st || !chain || this.mode !== 'draw' || type !== 'chainlift') return;
    const f = this.activeField;
    const x0 = f ? f.x0 : st.x - 60;
    const x1 = f ? f.x1 : st.x + 120;
    const y = st.y + chain;
    const a = toView(x0, y, st.z);
    const b = toView(x1, y, st.z);
    const len = Math.hypot(b.X - a.X, b.Y - a.Y);
    const n = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n;
      const t1 = Math.min(1, (i + 1) / n);
      g.moveTo(a.X + (b.X - a.X) * t0, a.Y + (b.Y - a.Y) * t0).lineTo(a.X + (b.X - a.X) * t1, a.Y + (b.Y - a.Y) * t1).stroke({ width: 0.4, color: 0x3b3f4a, alpha: 0.85 });
    }
    // Beschriftung am linken Ende der Linie, aber immer im Bild (nah gezoomt liegt die Linie oft über dem oberen Rand)
    const p = this.view.toScreen(a.X, a.Y);
    this.chainLabel.text = t('chain.line', { n: String(chain) });
    const half = this.chainLabel.width / 2;
    const above = p.y < safeArea().top + 90;
    this.chainLabel.text = above ? `↑ ${t('chain.line', { n: String(chain) })}` : t('chain.line', { n: String(chain) });
    this.chainLabel.position.set(Math.max(12 + half, Math.min(this.w - 12 - half, p.x + 12 + half)), Math.max(safeArea().top + 96, Math.min(this.h - 30, p.y - 16)));
    this.chainLabel.visible = true;
  }

  /** Kamera im Level halten: im aktiven Feld weich, sonst die harten Grenzen des Levels */
  private clampCamera(): void {
    if (this.activeField) return;
    this.view.camera.clampTo({ minX: -40, maxX: this.level.width + 40, minY: -30, maxY: 160 });
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
    for (const c of [this.lengthPill, this.lengthSlider]) {
      if (!c.visible) continue;
      const r = c.getBounds();
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return true;
    }
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
      if (this.zoneEditor?.dragStart(p)) return;
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
      const st = tagRay(this.view.camera.toStage(p.x, p.y));
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
        const endS = toView(endNode.x, endNode.y, endNode.z);
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
            const sa = toView(this.samples.x[i0], this.samples.y[i0], this.samples.z[i0]);
            const sb = toView(this.samples.x[i1], this.samples.y[i1], this.samples.z[i1]);
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
      this.stroke = [{ ...st }];
      this.beginRaw(st);
      this.strokeModes = [];
      this.pointerTrail = [{ X: st.X, Y: st.Y }];
      this.retracting = false;
      this.retractDist = 0;
      this.blockedAt = -10;
      this.blockedCut = 0;
      this.resetAutoscroll();
      this.drag = { kind: 'stroke' };
      if (!this.path) this.strokeKind = 'new';
      else {
        const near = this.samples ? nearestOnTrack(this.samples, st) : null;
        const nearPx = near ? near.d * this.view.camera.zoom : Infinity;
        const endNode = this.path.nodes[this.path.nodes.length - 1];
        const endS = toView(endNode.x, endNode.y, endNode.z);
        const endPx = Math.hypot(endS.X - st.X, endS.Y - st.Y) * this.view.camera.zoom;
        if (!isClosed(this.path) && endPx < 56) {
          this.strokeKind = 'extend';
          this.toast.show(t('extendHint'), 1.2);
        } else if (near && nearPx < 30) this.strokeKind = 'overdraw';
        else if ((this.reading === 'lanes' || this.zoneStation()) && !isClosed(this.path)) {
          // Ebenen und Zone mit Station: jeder Strich setzt die offene Bahn fort (wie im Bahnbau-Labor), auch wenn er
          // sonstwo beginnt; er wird an das Bahnende gezogen
          this.strokeKind = 'extend';
          this.toast.show(t('extendHint'), 1.2);
        } else if (this.zoneStation()) {
          // Zone mit Station: Die Bahn beginnt immer am Vorgabestück; eine fertige Runde wird nicht ersetzt, sondern gelöscht
          this.toast.show('Die Bahn beginnt an der Station: Löschen setzt das Vorgabestück zurück', 2.2);
          this.stroke = null;
          this.drag = { kind: 'none' };
          return;
        } else if (this.onStage(st) && this.unlocked.has('mountain') && this.terrainEditable() && !this.nearStation(st)) this.strokeKind = 'terrain';
        else {
          this.strokeKind = 'new';
          this.toast.show(t('newStrokeHint'), 2.2);
        }
      }
      // Länge für das Budget: ein neuer Strich ersetzt die Bahn, Fortsetzen und Überzeichnen bauen auf ihr auf
      this.liveLength = this.strokeKind === 'new' ? 0 : (this.samples?.length ?? 0);
      this.strokeArmed = this.armedLane;
      if (this.brushMode && this.strokeKind !== 'terrain') {
        this.refiner = null;
        this.brush = new RubberBrush(st, BAND_PX / this.view.camera.zoom);
        this.stroke = this.brush.points;
        this.startBrushStroke();
      }
      this.selected = -1;
      this.proNode = -1;
      this.drawOverlay();
    };
    H.dragMove = (p) => {
      if (this.zoneEditor?.dragMove(p)) return;
      if (this.mode !== 'draw') return;
      const st = tagRay(this.view.camera.toStage(p.x, p.y));
      switch (this.drag.kind) {
        case 'stroke':
          this.pointerScreen = { x: p.x, y: p.y };
          this.predicted = null;
          this.appendStrokePoint(st);
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
            this.beginRaw(d.startSt!);
            if (this.brushMode) {
              this.refiner = null;
              this.brush = new RubberBrush(d.startSt!, BAND_PX / this.view.camera.zoom);
              this.brush.move(st);
              this.stroke = this.brush.points;
              this.startBrushStroke();
            } else this.stroke = [d.startSt!, { X: st.X, Y: st.Y }];
            this.strokeModes = [];
            this.strokeKind = 'overdraw';
            this.resetAutoscroll();
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
      if (this.zoneEditor?.dragEnd(p)) return;
      const st = this.view.camera.toStage(p.x, p.y);
      this.pointerScreen = null;
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
      if (this.mode === 'draw' && this.zoneEditor?.tap(p)) return;
      if (this.mode === 'ride') {
        this.stopRide();
        return;
      }
      if (this.mode !== 'draw') return;
      // DEV: Gurt-Abzeichen antippen wählt die Gurtstufe
      if (unlockAll() && this.beltBadge.visible && Math.hypot(p.x - this.beltBadge.x, p.y - (this.beltBadge.y + 10)) < 36) {
        this.cycleDevBelt();
        return;
      }
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
      if (Math.min(this.w, this.h) < DRAW_ZOOM_SCREEN) {
        this.overview = !this.overview;
        this.toast.show(t(this.overview ? 'view.overview' : 'view.draw'), 1.4);
      }
      this.fitCamera(false);
    };
    H.dragPredict = (p) => {
      if (this.mode !== 'draw' || this.drag.kind !== 'stroke' || !this.stroke) return;
      const st = this.view.camera.toStage(p.x, p.y);
      this.predicted = { X: st.X, Y: st.Y };
      if (!this.brush) this.drawInk();
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
    H.key = (k, ev) => {
      if (this.mode === 'draw' && this.zoneEditor?.key(k, ev)) return;
      if (k === ' ') this.mode === 'draw' ? this.startRide() : this.stopRide();
      if (k === 'Escape') this.mode === 'draw' ? this.leave() : this.stopRide();
      if ((k === 'Delete' || k === 'Backspace') && this.selected >= 0) this.deleteNode(this.selected);
    };
  }

  // ------------------------------------------------------------------ Treffer-Tests
  private nodeScreen(n: TrackNode): Pt {
    const s = toView(n.x, n.y, n.z);
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
      const sa = toView(a.x, a.y, a.z / LANE_DEPTH);
      const sb = toView(b.x, b.y, b.z / LANE_DEPTH);
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
    const w = rayToWorld(tagRay(st), z);
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
    const s = toView(n.x, n.y, n.z);
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
      const s = toView(this.samples.x[idx], this.samples.y[idx], this.samples.z[idx]);
      if (Math.hypot(s.X - st.X, s.Y - st.Y) < 2.5) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------------ Strich → Bahn
  /** Lesart (Einstellung, Umschalter unten links; die Adresse kann sie erzwingen) */
  /** Bahntyp der Welt (Adresse vor Skin); ohne Weltrenderer der des Skins */
  private get trackType(): TrackType {
    return this.game?.world?.trackOverride ?? trackTypeForSkin(this.skin);
  }

  /** Mindesthöhe des Strichs über dem Boden: bei der Hängebahn hängt die Gondel HANG_DROP unter dem Strich */
  private get groundClearance(): number {
    return this.trackType === 'hanging' ? HANG_DROP + 0.8 : 0.8;
  }

  /** Lesart: Pinsel; ?stage, ?single und ?lanes erzwingen die alten Lesarten (Szenarien, Replay-Vergleiche) */
  private get reading(): StrokeReading {
    return STROKE_MODE_URL ?? 'brush';
  }
  private get singleStroke(): boolean {
    return this.reading === 'single';
  }
  private get brushMode(): boolean {
    return this.reading === 'brush';
  }
  /** Lesart „Ebenen“: fünf Knöpfe links (hinten oben), Tipp wählt die Ebene für den nächsten Strich */
  private buildLanePanel(): void {
    const top = label(t('lanes.back'), 12, INK, true);
    top.position.set(0, -LANE_MAX * 46 - 34);
    const bottom = label(t('lanes.front'), 12, INK, true);
    bottom.position.set(0, -LANE_MIN * 46 + 34);
    this.lanePanel.addChild(top, bottom);
    for (let lane = LANE_MAX; lane >= LANE_MIN; lane--) {
      const btn = new Button(lane > 0 ? `+${lane}` : lane < 0 ? `−${-lane}` : '0', { width: 52, height: 38, size: 16, color: '#cfe8b8', textColor: INK });
      btn.position.set(0, -lane * 46);
      btn.onTap = () => this.armLane(lane);
      this.lanePanel.addChild(btn);
      this.laneBtns.push({ lane, btn });
    }
    this.laneAutoBtn.setText(t('lanes.auto'));
    this.laneAutoBtn.position.set(0, -LANE_MIN * 46 + 72);
    this.laneAutoBtn.onTap = () => {
      const on = !storage.settings.lanesAuto;
      storage.updateSettings({ lanesAuto: on });
      this.toast.show(t(on ? 'lanes.autoOn' : 'lanes.autoOff'), 2.2);
      this.lanePanelKey = '';
      this.refreshLanePanel();
    };
    this.lanePanel.addChild(this.laneAutoBtn);
    this.hud.addChild(this.lanePanel);
    this.uiButtons.push(...this.laneBtns.map((l) => l.btn), this.laneAutoBtn);
    this.refreshLanePanel();
  }

  /** Ebene des Bahnendes (dort geht der nächste Strich weiter), ohne offene Bahn null */
  private endLane(): number | null {
    if (!this.path || isClosed(this.path) || !this.path.nodes.length) return null;
    return Math.round(this.path.nodes[this.path.nodes.length - 1].z);
  }

  private armLane(lane: number): void {
    if (this.mode !== 'draw') return;
    const end = this.endLane();
    this.armedLane = this.armedLane === lane || (end !== null && lane === end) ? null : lane;
    if (this.armedLane !== null) this.toast.show(t('lanes.armed', { n: lane > 0 ? `+${lane}` : String(lane) }), 1.6);
    this.refreshLanePanel();
  }

  /**
   * Hinweistext unten mittig. Schmal: über der Längenanzeige (sie stieße sonst an die letzte Zeile) und, solange die
   * Ebenen-Leiste links steht, rechts neben ihr (ihr Auto-Knopf läge sonst auf dem Text).
   */
  private placeHint(): void {
    const { w, h } = this;
    const narrow = w < 520;
    const left = narrow && this.lanePanel.visible ? 76 : 0;
    this.hint.position.set(left + (w - left) / 2, h - (narrow ? 214 : 178));
    this.hint.style.wordWrapWidth = Math.min(380, w - left - 40);
  }

  /** Leiste nur in der Lesart „Ebenen“; gewählte Ebene gelb, die Ebene des Bahnendes mit pinkem Punkt */
  private refreshLanePanel(): void {
    const show = this.reading === 'lanes' && this.mode === 'draw';
    if (this.lanePanel.visible !== show) {
      this.lanePanel.visible = show;
      this.placeHint();
    }
    for (const l of this.laneBtns) l.btn.visible = show;
    this.laneAutoBtn.visible = show;
    const end = this.endLane();
    const auto = !!storage.settings.lanesAuto;
    const key = `${show}|${this.armedLane}|${end}|${auto}`;
    if (key === this.lanePanelKey) return;
    this.lanePanelKey = key;
    for (const { lane, btn } of this.laneBtns) {
      btn.setColor(this.armedLane === lane ? '#ffd23f' : lane === end ? '#ff9ab8' : '#cfe8b8');
    }
    this.laneAutoBtn.setColor(auto ? '#3ec7c2' : '#fff8ec');
  }

  // ------------------------------------------------------------------ Streckenlänge
  /** Budget in Metern (0 = unbegrenzt): Das Level gibt es vor, sonst der Regler */
  private get budget(): number {
    return this.level.trackBudget || storage.settings.trackBudget || 0;
  }
  /** Ist das Budget erreicht, wächst der Strich nicht weiter (Zurückziehen gibt Strecke frei) */
  private get overBudget(): boolean {
    return this.budget > 0 && !!this.stroke && this.liveLength >= this.budget;
  }

  /** Anzeige der Streckenlänge (immer sichtbar beim Zeichnen) und der Regler für das Budget (Tipp auf die Anzeige) */
  private buildLengthUI(): void {
    this.lengthText.anchor.set(0, 0.5);
    this.lengthText.position.set(14, -2);
    this.lengthPill.addChild(this.lengthBg, this.lengthText);
    this.lengthPill.eventMode = 'static';
    this.lengthPill.cursor = 'pointer';
    this.lengthPill.on('pointertap', () => {
      if (this.level.trackBudget) {
        this.toast.show(t('length.levelBudget', { n: String(this.level.trackBudget) }), 1.8);
        return;
      }
      this.lengthSlider.visible = !this.lengthSlider.visible;
      this.drawSlider();
    });
    const bg = new Graphics();
    paintRect(bg, 0, -34, 280, 68, PAPER, INK, 16, 11, 0.97);
    const title = label(t('length.budget'), 13, INK, true);
    title.anchor.set(0, 0.5);
    title.position.set(14, -20);
    this.sliderText.anchor.set(1, 0.5);
    this.sliderText.position.set(266, -20);
    this.sliderBar.eventMode = 'static';
    this.sliderBar.cursor = 'pointer';
    this.sliderBar.hitArea = new Rectangle(4, -2, 272, 34);
    const setFrom = (gx: number, gy: number) => {
      const lx = this.sliderBar.toLocal({ x: gx, y: gy }).x;
      const f = clamp((lx - 20) / 240, 0, 1);
      // ganz rechts: unbegrenzt, sonst 50 bis 1000 m in 10-m-Schritten
      const v = f >= 0.97 ? 0 : Math.round((50 + (f / 0.97) * 950) / 10) * 10;
      if (v !== (storage.settings.trackBudget ?? 0)) storage.updateSettings({ trackBudget: v });
      this.drawSlider();
      this.refreshLengthUI(true);
    };
    this.sliderBar.on('pointerdown', (e) => {
      this.sliderDrag = true;
      setFrom(e.global.x, e.global.y);
    });
    this.sliderBar.on('globalpointermove', (e) => {
      if (this.sliderDrag) setFrom(e.global.x, e.global.y);
    });
    this.sliderBar.on('pointerup', () => (this.sliderDrag = false));
    this.sliderBar.on('pointerupoutside', () => (this.sliderDrag = false));
    this.lengthSlider.addChild(bg, title, this.sliderText, this.sliderBar);
    this.lengthSlider.visible = false;
    this.hud.addChild(this.lengthSlider);
    this.ui.addChild(this.lengthPill);
    this.drawSlider();
    this.refreshLengthUI(true);
  }

  private drawSlider(): void {
    const v = storage.settings.trackBudget ?? 0;
    const f = v > 0 ? ((v - 50) / 950) * 0.97 : 1;
    const g = this.sliderBar;
    g.clear();
    g.roundRect(20, 9, 240, 8, 4).fill({ color: hexNum(INK), alpha: 0.18 });
    g.roundRect(20, 9, 240 * f, 8, 4).fill(hexNum('#3ec7c2'));
    g.circle(20 + 240 * f, 13, 11).fill(hexNum(PAPER)).stroke({ width: 3, color: hexNum(INK) });
    this.sliderText.text = v > 0 ? `${v} m` : t('length.unlimited');
  }

  /** Länge der Bahn (beim Zeichnen die der Vorschau) und Budget; neu gezeichnet nur, wenn sich etwas ändert */
  private refreshLengthUI(force = false): void {
    const show = this.mode === 'draw';
    this.lengthPill.visible = show;
    if (!show) this.lengthSlider.visible = false;
    if (!this.stroke) this.liveLength = this.samples?.length ?? 0;
    const len = Math.round(this.liveLength);
    const b = this.budget;
    const over = b > 0 && this.liveLength >= b;
    const key = `${len}|${b}|${over}|${!!this.level.trackBudget}`;
    if (!force && key === this.lengthKey) return;
    this.lengthKey = key;
    this.lengthText.text = b > 0 ? t('length.ofBudget', { n: String(len), b: String(b) }) : t('length.only', { n: String(len) });
    const w = Math.max(132, this.lengthText.width + 30);
    const g = this.lengthBg;
    g.clear();
    paintRect(g, 0, -19, w, 38, over ? '#ffd0d4' : PAPER, INK, 14, 5, 0.96);
    if (b > 0) {
      const f = clamp(this.liveLength / b, 0, 1);
      g.roundRect(10, 10, (w - 20) * f, 4, 2).fill(hexNum(f >= 1 ? '#d64545' : f > 0.85 ? '#ffb13b' : '#3ec7c2'));
    }
  }

  /** Neuer Strichpunkt (Bühne) aus Zeigerbewegung oder Autoscroll: Zurückziehen prüfen, anhängen, Tinte */
  private appendStrokePoint(st: StagePoint): void {
    if (!this.stroke) return;
    const np: StagePoint = { ...st };
    const ms = performance.now() - this.rawStart;
    this.rawStroke.push(st.cx !== undefined && st.cy !== undefined ? [st.X, st.Y, ms, st.cx, st.cy] : [st.X, st.Y, ms]);
    if (this.brush) {
      // Pinsel: Zurückziehen radiert die gemalte Linie (this.stroke ist die Linie des Pinsels), danach zieht das
      // Gummiband die Linie weiter
      const before = this.stroke.length;
      this.retractStroke(np);
      if (this.stroke.length !== before) this.brush.resetTip();
      // Budget erreicht: Die Linie wächst nicht weiter (der Finger zieht nur noch das Band)
      if (this.overBudget && this.stroke.length === before) this.budgetReached();
      else this.brush.move(np);
      // gezeichnet wird einmal je Bild (advanceBrush), nicht je Zeiger-Ereignis
      return;
    }
    const before = this.stroke.length;
    this.retractStroke(np);
    if (this.overBudget && this.stroke.length === before) this.budgetReached();
    else this.stroke.push(np);
    this.drawInk();
  }

  private budgetReached(): void {
    if (this.overBudgetToast) return;
    this.overBudgetToast = true;
    this.toast.show(t('length.used', { n: String(this.budget) }), 1.8);
  }

  /**
   * Autoscroll beim Zeichnen. In einer Randzone (30 % der Breite, 18 % der Höhe, je 70 bis 300 px) schiebt die
   * Kamera in Richtung des Rands, je näher, desto schneller (Nähe hoch 1,6; am Rand drei Viertel der Breite bzw. die
   * halbe Höhe je Sekunde). Zieht der Finger schnell auf den Rand zu, zieht die Kamera mit bis zu 80 % seines Tempos
   * mit: Ein schneller Strich bekommt sofort Platz, ein langsamer kriecht. Zieht er vom Rand weg (auch beim
   * Zurückziehen), bremst sie. Das Tempo folgt weich (rund 0,15 s), aber ohne Wartezeit; ein Aufsetzen am Rand
   * scrollt erst nach 12 px Fingerweg. Der Strich wächst unter dem stehenden Finger weiter, an der Levelgrenze
   * bleibt die Kamera stehen. (Randzone mit Nähe 0 bis 1 wie dnd-kit/tldraw, Tempo auch aus dem Fingertempo wie bei
   * Raymond Chens Autoscroll, weich folgend wie eine Spielkamera; siehe docs/TECH.md 4b.)
   */
  private autoscroll(dt: number): void {
    const p = this.pointerScreen;
    if (!AUTOSCROLL || !p || this.drag.kind !== 'stroke' || !this.stroke || this.strokeKind === 'terrain') {
      this.scrollV = { x: 0, y: 0 };
      this.scrollFrom = null;
      return;
    }
    const step = Math.min(dt, 0.05);
    // Fingertempo auf dem Bildschirm (die Kamera verschiebt den Finger dort nicht)
    if (this.scrollFrom && step > 0) {
      const a = 1 - Math.exp(-step / 0.1);
      this.fingerV.x += ((p.x - this.scrollFrom.x) / step - this.fingerV.x) * a;
      this.fingerV.y += ((p.y - this.scrollFrom.y) / step - this.fingerV.y) * a;
      this.strokeTravel += Math.hypot(p.x - this.scrollFrom.x, p.y - this.scrollFrom.y);
    }
    this.scrollFrom = { x: p.x, y: p.y };
    const want = (pos: number, size: number, v: number, axis: 'x' | 'y'): number => {
      if (this.strokeTravel < SCROLL_AFTER) return 0;
      const zone = clamp(size * SCROLL_ZONE[axis], SCROLL_ZONE.min, SCROLL_ZONE.max);
      const dir = pos > size - zone ? 1 : pos < zone ? -1 : 0;
      if (!dir) return 0;
      const toward = v * dir;
      if (toward < -SCROLL_AWAY) return 0;
      // Nähe 0 an der Zonengrenze bis 1 kurz vor dem Rand (ein Finger erreicht die letzte Pixelreihe kaum)
      const prox = clamp((dir > 0 ? pos - (size - zone) : zone - pos) / (zone * 0.85), 0, 1);
      const maxV = clamp(size * SCROLL_MAX[axis], SCROLL_MAX.min, SCROLL_MAX.max);
      return dir * Math.max(maxV * prox ** 1.6, Math.min(maxV * 1.4, Math.max(0, toward) * SCROLL_FOLLOW * prox));
    };
    const k = 1 - Math.exp(-SCROLL_RESPONSE * step);
    this.scrollV.x += (want(p.x, this.w, this.fingerV.x, 'x') - this.scrollV.x) * k;
    this.scrollV.y += (want(p.y, this.h, this.fingerV.y, 'y') - this.scrollV.y) * k;
    if (Math.abs(this.scrollV.x) < 2 && Math.abs(this.scrollV.y) < 2) return;
    const cam = this.view.camera;
    const x0 = cam.x;
    const y0 = cam.y;
    // panBy nimmt die Fingerbewegung: Zeiger am rechten Rand heißt Welt nach links schieben
    cam.panBy(-this.scrollV.x * step, -this.scrollV.y * step);
    this.clampCamera();
    cam.snap();
    // an der Levelgrenze steht die Kamera: dort kein Tempo ansammeln
    if (Math.abs(cam.x - x0) < 1e-6) this.scrollV.x = 0;
    if (Math.abs(cam.y - y0) < 1e-6) this.scrollV.y = 0;
    if (cam.x === x0 && cam.y === y0) return;
    const st = cam.toStage(p.x, p.y);
    const last = this.stroke[this.stroke.length - 1];
    if (Math.hypot(st.X - last.X, st.Y - last.Y) >= 0.15) this.appendStrokePoint(st);
  }

  private resetAutoscroll(): void {
    this.overBudgetToast = false;
    this.fingerV = { x: 0, y: 0 };
    this.scrollV = { x: 0, y: 0 };
    this.scrollFrom = null;
    this.strokeTravel = 0;
  }

  private strokeOptions() {
    const ground = (x: number, z: number) => (this.allowTunnels ? this.terrain.groundHeight(x, z) : this.terrain.surfaceHeight(x, z));
    return {
      single: this.singleStroke,
      fit: FIT_MODE,
      groundHeight: ground,
      groundClearance: this.groundClearance,
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
      const sp = toView(n.x, n.y, n.z);
      const k = laneScale(n.z);
      g.circle(sp.X, sp.Y, 0.9 * k * zs).stroke({ width: 0.16 * k * zs, color: 0x9b6dff, alpha: 0.9 });
    }
    // Fels ohne freie Seite (Schritt 5): rote Marken auf der Linie, dazu einmal je Strich der Hinweis
    const rock = this.brushPreview?.rock;
    if (rock?.length && this.stroke) {
      for (const p of rock) g.circle(p.X, p.Y, 0.55 * zs).fill({ color: 0xff4d5e, alpha: 0.8 });
      if (this.time - this.rockToastAt > 3) {
        this.rockToastAt = this.time;
        this.toast.show(t('rock.blocked'), 1.6);
      }
    }
    if (!this.stroke || this.stroke.length < 2 || isClosed(path) || path.nodes.length < 2) return;
    const st0 = path.nodes[0];
    const sp = toView(st0.x, st0.y, st0.z);
    const e = this.stroke[this.stroke.length - 1];
    const d = Math.hypot(sp.X - e.X, sp.Y - e.Y);
    const snap = Math.max(8, 60 / this.view.camera.zoom);
    // Pinsel: Ziel-Radius um die Station, sobald das Ende in seine Nähe kommt (darin abgesetzt schließt ein Tipp)
    const reach = this.closeReach();
    if (this.brush && d < 2.5 * reach) {
      const inside = d <= reach;
      const n = 28;
      const spin = (this.time * 0.4) % ((2 * Math.PI) / n);
      for (let k = 0; k < n; k++) {
        const a0 = spin + (k * 2 * Math.PI) / n;
        const a1 = a0 + (Math.PI / n) * 1.1;
        g.moveTo(sp.X + Math.cos(a0) * reach, sp.Y + Math.sin(a0) * reach)
          .arc(sp.X, sp.Y, reach, a0, a1)
          .stroke({ width: (inside ? 0.26 : 0.18) * zs, color: 0xffffff, alpha: inside ? 0.85 : 0.4, cap: 'round' });
      }
    }
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
    if (this.brush) {
      this.drawBrushInk();
      return;
    }
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
    i = Math.max(0, Math.min(i, Math.min(this.previewedCount, n) - 1));
    const seg = this.stroke.slice(i).flatMap((p) => [p.X, p.Y]);
    if (seg.length < 4) return;
    const modes = this.strokeModes;
    const mode = modes.length ? modes[modes.length - 1] : undefined;
    const blocked = this.time - this.blockedAt < BLOCKED_SHOW || this.overBudget;
    const color = blocked ? 0xff4d5e : this.strokeKind === 'overdraw' ? 0xffd23f : mode === 'height' ? 0xff5c8a : 0x7ee081;
    g.poly(seg, false).stroke({ width: 0.5, color: 0xffffff, alpha: 0.35, cap: 'round', join: 'round' });
    g.poly(seg, false).stroke({ width: 0.25, color, alpha: 0.55, cap: 'round', join: 'round' });
    this.drawTip(color);
  }

  /**
   * Strichspitze als Tropfen: ein dicker Punkt unter dem Finger (auf dem Handy verdeckt der Finger die dünne Linie)
   * und von dort ein Schweif, der entlang der letzten Strichmeter dünner wird und sich mit der Kurve biegt.
   */
  private drawTip(color: number): void {
    const s = this.stroke;
    if (!s || s.length < 2) return;
    const g = this.ink;
    const zoom = this.view.camera.zoom;
    const r0 = TIP_RADIUS_PX / zoom;
    const tail = TIP_TAIL_PX / zoom;
    const tip = this.predicted ?? s[s.length - 1];
    // Punkte vom Finger rückwärts bis zur Schweiflänge, mit Abstand vom Finger
    const pts: Array<{ X: number; Y: number; d: number }> = [{ X: tip.X, Y: tip.Y, d: 0 }];
    let d = 0;
    for (let i = s.length - 2; i >= 0 && d < tail; i--) {
      const a = pts[pts.length - 1];
      const step = Math.hypot(s[i].X - a.X, s[i].Y - a.Y);
      if (step < 0.05) continue;
      d += step;
      if (d > tail) {
        const f = (tail - (d - step)) / step;
        pts.push({ X: a.X + (s[i].X - a.X) * f, Y: a.Y + (s[i].Y - a.Y) * f, d: tail });
        break;
      }
      pts.push({ X: s[i].X, Y: s[i].Y, d });
    }
    g.circle(tip.X, tip.Y, r0).fill({ color, alpha: 0.92 });
    if (pts.length < 2) return;
    const width = (dd: number): number => Math.max(0.08 / zoom, r0 * Math.pow(1 - dd / tail, 1.6));
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.Y - a.Y);
      let ny = b.X - a.X;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const w = width(p.d);
      left.push(p.X + nx * w, p.Y + ny * w);
      right.push(p.X - nx * w, p.Y - ny * w);
    }
    const poly: number[] = [...left];
    for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
    g.poly(poly, true).fill({ color, alpha: 0.92 });
  }

  /**
   * Zurückziehen: Läuft der Zeiger auf dem schon gezeichneten Strich zurück (nah an der Linie und entgegen ihrer
   * Richtung), wird der Strich bis dorthin wieder ausradiert. So lassen sich beim Ziehen kleine Korrekturen machen,
   * und am Spurende folgt die Bahn dem Finger zurück, statt wegzuspringen. Ein Strich, der seine eigene Linie nur
   * kreuzt (Looping, Acht), läuft quer zu ihr und bleibt; eine Kehre liegt eine Spur neben der Anfahrt und bleibt auch.
   */
  private retractStroke(p: StagePoint): void {
    const s = this.stroke;
    const trail = this.pointerTrail;
    // Bewegungsrichtung über rund einen Meter (ein einzelner Schritt zittert)
    trail.push(p);
    while (trail.length > 2 && Math.hypot(p.X - trail[1].X, p.Y - trail[1].Y) >= 1.0) trail.shift();
    if (!s || s.length < 3) return;
    const ref = trail[0];
    const motion = { X: p.X - ref.X, Y: p.Y - ref.Y };
    if (Math.hypot(motion.X, motion.Y) < 0.2) return;
    const keep = retractIndex(s, p, motion, Math.max(0.8, RETRACT_PX / this.view.camera.zoom), RETRACT_REACH);
    if (keep < 0) {
      this.retracting = false;
      this.retractDist = 0;
      return;
    }
    // erst nach einem Meter auf der Linie zurück radieren: ein kurzes Kreuzen der eigenen Linie bleibt stehen
    if (!this.retracting) {
      const last = s[s.length - 1];
      this.retractDist += Math.hypot(p.X - last.X, p.Y - last.Y);
      if (this.retractDist < RETRACT_MIN) return;
      this.retracting = true;
    }
    s.length = keep + 1;
    this.previewedCount = Math.min(this.previewedCount, s.length);
  }

  /**
   * Spurende: Der Strich wollte eine Kehre in eine Richtung, in der keine Spur mehr ist. Die Bahn bleibt am Scheitel
   * stehen, der Strich dahinter wird abgeschnitten (der Zeiger kann von dort neu ansetzen), die Tinte wird kurz rot,
   * und ein dezenter Hinweis erscheint (höchstens alle 2,5 s).
   */
  private applyBlocked(b: BlockedInfo | undefined): void {
    if (!b || !this.stroke) return;
    const s = this.stroke;
    let best = cutIndexNear(s, b.at, 4);
    if (best < 1) return;
    // Läuft der Finger hinter dem Scheitel weiter zurück, fände jede Vorschau den Scheitel ein Stück früher und
    // schnitte den Strich Stück für Stück weg: Einmal am Scheitel geschnitten, bleibt er dort.
    best = Math.max(best, Math.min(this.blockedCut, s.length - 1));
    this.blockedCut = best;
    if (best < s.length - 1) {
      s.length = best + 1;
      this.previewedCount = Math.min(this.previewedCount, s.length);
    }
    this.blockedAt = this.time;
    this.blockedDir = b.dir;
    if (this.time - this.blockedToastAt > 2.5) {
      this.blockedToastAt = this.time;
      this.toast.show(t(b.dir === 0 ? 'lanes.pick' : 'laneEnd'), b.dir === 0 ? 2.4 : 1.2);
    }
  }

  /** Leichter Schein auf der Bodenlinie der Spur, auf der gerade gezeichnet wird (grün am Boden, pink in der Höhe, rot am Spurende) */
  private drawLaneGlow(): void {
    const g = this.laneGlow;
    const sl = this.strokeLane;
    if (!sl) {
      if (!Number.isNaN(this.laneGlowState.lane)) {
        g.clear();
        this.laneGlowState = { lane: NaN, mode: 'floor', blocked: false };
      }
      return;
    }
    const lane = Math.round(clamp(sl.lane, LANE_MIN, LANE_MAX));
    const blocked = this.time - this.blockedAt < BLOCKED_SHOW;
    const st = this.laneGlowState;
    if (lane === st.lane && sl.mode === st.mode && blocked === st.blocked) return;
    this.laneGlowState = { lane, mode: sl.mode, blocked };
    g.clear();
    const k = laneScale(lane);
    const color = blocked ? 0xff4d5e : sl.mode === 'height' ? 0xff5c8a : 0x7ee081;
    const pts: number[] = [];
    for (let x = -20; x <= this.level.width + 20; x += 2) {
      const p = toView(x, this.groundAt(x, lane), lane);
      pts.push(p.X, p.Y);
    }
    g.poly(pts, false).stroke({ width: 1.6 * k, color, alpha: 0.16, cap: 'round', join: 'round' });
    g.poly(pts, false).stroke({ width: 0.5 * k, color, alpha: 0.35, cap: 'round', join: 'round' });
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
      this.drawLaneGlow();
    };
    if (this.strokeKind === 'overdraw' && this.path && this.samples) {
      const merged = applyOverdraw(this.path, this.stroke, { ...opts, snapDistance: 30 / this.view.camera.zoom });
      this.ghost.clear();
      laneOf(undefined);
      if (merged) {
        const sm = sampleTrack(merged, 0.5);
        this.liveLength = sm.length;
        this.view.setTrack(merged, sm, this.skin, this.terrain, this.allowTunnels, true);
        this.previewedCount = count;
        this.drawInk();
        this.liveFeedback(merged, sm, trackStats(merged, sm));
      }
      return;
    }
    if (this.reading === 'lanes') {
      const out: { points?: InterpretedPoint[]; blocked?: BlockedInfo } = {};
      const p = lanesTrack(this.strokeKind === 'extend' ? this.path : null, this.stroke, opts, this.armedLane, out, !!storage.settings.lanesAuto);
      this.applyBlocked(out.blocked);
      this.strokeModes = out.points?.map((q) => q.mode) ?? [];
      laneOf(out.points);
      this.drawInk();
      if (p && p.nodes.length >= 2) {
        this.previewedCount = count;
        const sm = sampleTrack(p, 0.5);
        this.liveLength = sm.length;
        this.view.setTrack(p, sm, this.skin, this.terrain, this.allowTunnels, true);
        this.drawGhost(p);
        this.liveFeedback(p, sm, trackStats(p, sm));
      }
      return;
    }
    if (this.strokeKind === 'extend' && this.path) {
      const out: { points?: InterpretedPoint[]; blocked?: BlockedInfo } = {};
      const ext = extendTrack(this.path, this.stroke, opts, out);
      this.applyBlocked(out.blocked);
      if (ext) {
        this.strokeModes = out.points?.map((p) => p.mode) ?? [];
        laneOf(out.points);
        const sm = sampleTrack(ext, 0.5);
        this.liveLength = sm.length;
        this.view.setTrack(ext, sm, this.skin, this.terrain, this.allowTunnels, true);
        this.previewedCount = count;
        this.drawInk();
        this.drawGhost(ext);
        this.liveFeedback(ext, sm, trackStats(ext, sm));
      }
      return;
    }
    const r = strokeToTrack(this.stroke, opts);
    this.applyBlocked(r.blocked);
    this.strokeModes = r.points.map((p) => p.mode);
    laneOf(r.points);
    if (r.path.nodes.length >= 2) this.previewedCount = count;
    this.drawInk();
    if (r.path.nodes.length >= 2) {
      const sm = sampleTrack(r.path, 0.5);
      this.liveLength = sm.length;
      this.view.setTrack(r.path, sm, this.skin, this.terrain, this.allowTunnels, true);
      this.drawGhost(r.path);
      this.liveFeedback(r.path, sm, trackStats(r.path, sm));
    } else this.ghost.clear();
  }

  private finishStroke(): void {
    const raw = this.rawStroke;
    const kind = this.strokeKind;
    const before = kind === 'new' || !this.path ? null : clonePath(this.path);
    this.rawStroke = [];
    if (this.brush) this.finishBrush();
    else this.finishReadStroke();
    this.recordStroke(raw, kind, before);
  }

  private beginRaw(st: StagePoint): void {
    this.rawStart = performance.now();
    this.rawStroke = [st.cx !== undefined && st.cy !== undefined ? [st.X, st.Y, 0, st.cx, st.cy] : [st.X, st.Y, 0]];
  }

  /**
   * Strich-Rekorder (nur im Dev-Server): fertigen Strich mit rohen Fingerpunkten, Lesart, Zoom und Ergebnis an
   * /__strokes schicken (landet in recordings/strokes.jsonl, nachspielen mit npm run strokes:replay)
   */
  private recordStroke(raw: number[][], kind: StrokeKind, before: TrackPath | null): void {
    if (!import.meta.env.DEV || raw.length < 3 || kind === 'terrain') return;
    const rec = {
      at: new Date().toISOString(),
      level: this.level.id,
      reading: this.reading,
      kind,
      armed: this.reading === 'lanes' ? this.strokeArmed : undefined,
      auto: this.reading === 'lanes' ? !!storage.settings.lanesAuto : undefined,
      zoom: +this.view.camera.zoom.toFixed(3),
      screen: [this.w, this.h],
      dpr: window.devicePixelRatio,
      persp: viewState().persp ? viewState().fov : undefined,
      points: raw.map(([X, Y, ms, cx, cy]) => (cx === undefined ? [+X.toFixed(3), +Y.toFixed(3), Math.round(ms)] : [+X.toFixed(3), +Y.toFixed(3), Math.round(ms), +cx.toFixed(3), +cy.toFixed(3)])),
      before,
      result: this.path ? { nodes: this.path.nodes.length, closed: isClosed(this.path), length: Math.round(this.samples?.length ?? 0), brush: !!this.path.brush } : null,
    };
    void fetch('/__strokes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) }).catch(() => undefined);
  }

  /** Strich fertig in der Bühnen- oder Ein-Strich-Lesart */
  private finishReadStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    this.predicted = null;
    this.strokeModes = [];
    this.strokeLane = null;
    this.pointerTrail = [];
    this.retracting = false;
    this.retractDist = 0;
    this.blockedAt = -10;
    this.blockedCut = 0;
    this.previewedCount = 0;
    this.previewCost = 0;
    this.ink.clear();
    this.ghost.clear();
    this.drawLaneGlow();
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
    if (this.reading === 'lanes' && this.strokeKind !== 'overdraw') {
      const out: { connector?: boolean } = {};
      const p = lanesTrack(this.strokeKind === 'extend' ? this.path : null, stroke, this.strokeOptions(), this.armedLane, out, !!storage.settings.lanesAuto);
      if (!p || p.nodes.length < 2) {
        this.redrawTrack();
        return;
      }
      this.pushHistory();
      p.startType = this.path?.startType ?? 'chainlift';
      this.setPath(p, true);
      // die gewählte Ebene ist mit der Kurve bzw. dem Spurwechsel verbraucht
      if (out.connector || this.strokeKind !== 'extend') this.armedLane = null;
      this.refreshLanePanel();
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

  // ------------------------------------------------------------------ Pinsel: Linie = Bahn
  /**
   * Solange der Finger zeichnet, tritt die Bedienung zurück, damit sie dem Strich nicht im Weg ist: Knöpfe, Ziele,
   * Titel, Hinweistext, Chips und Leisten blenden in rund 0,1 s aus und danach wieder ein. Es bleiben der Toast
   * (Warnungen wie „Strecke aufgebraucht“), die Streckenanzeige, wenn ein Budget gilt, und die Spur-Anzeige außer beim
   * Pinsel (in den anderen Lesarten zeigt sie beim Zeichnen die Spur).
   */
  private fadeHud(dt: number): void {
    const drawing = this.mode === 'draw' && this.drag.kind === 'stroke' && !!this.stroke;
    const k = Math.min(1, dt / 0.1);
    const to = (o: Container, target: number) => (o.alpha += (target - o.alpha) * k);
    to(this.hud, drawing ? 0 : 1);
    this.hud.eventMode = drawing ? 'none' : 'passive';
    to(this.lengthPill, drawing ? (this.budget ? 0.75 : 0) : 1);
    to(this.laneHud, drawing && this.brushMode ? 0 : 1);
  }

  /** Ziel-Radius um die Station (Bühnen-Meter): Endet die Pinsel-Bahn darin, schließt ein Tipp auf die Station die Runde */
  private closeReach(): number {
    return Math.max(20, 150 / this.view.camera.zoom);
  }

  private brushOptions() {
    return {
      ground: (x: number, z: number) => (this.allowTunnels ? this.terrain.groundHeight(x, z) : this.terrain.surfaceHeight(x, z)),
      clearance: this.groundClearance,
      // Rundenschluss ab 8 m Bühne oder 60 px, je nachdem, was weiter ist
      closeSnap: Math.max(8, 60 / this.view.camera.zoom),
      // beim Nachbessern gibt die Linie höchstens 8 Bildschirm-Pixel nach
      tolerance: Math.max(0.4, 8 / this.view.camera.zoom),
      // Fels der Zone (Schritt 5): verbotene Tiefen je Linienpunkt, gedeutet mit dem Strahl der Kamera
      rock: this.rock && !this.rock.empty ? (p: StagePoint) => this.rock!.spans(p, (q, lane) => rayToWorld(q, lane)) : undefined,
    };
  }

  /** Pinsel-Strich: gemalte Linie, das Gummiband zum Finger und der Tropfen unter dem Finger */
  private drawBrushInk(): void {
    const g = this.ink;
    g.clear();
    const b = this.brush;
    if (!b) return;
    const zoom = this.view.camera.zoom;
    const w = Math.max(0.6, BRUSH_LINE_PX / zoom);
    const r = TIP_PX / zoom;
    // Budget erreicht: Schleppe und Tropfen rot
    const pink = this.overBudget ? 0xff4d5e : hexNum(PINK);
    // Bis brushShown ist die Linie schon Bahn, dahinter Schleppe. Was die Live-Vorschau schon als Schienen zeigt,
    // braucht keine Tinte; Tinte nur für das Stück, das sie noch nicht hat
    const pts = b.points;
    const at = (len: number): { i: number; p: StagePoint } => {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y);
        if (acc + d >= len) {
          const f = d > 1e-9 ? (len - acc) / d : 0;
          return { i, p: { X: pts[i - 1].X + (pts[i].X - pts[i - 1].X) * f, Y: pts[i - 1].Y + (pts[i].Y - pts[i - 1].Y) * f } };
        }
        acc += d;
      }
      return { i: pts.length, p: pts[pts.length - 1] };
    };
    const { i: cut, p: cutPt } = at(this.brushShown);
    const from = this.brushPreview ? at(Math.min(this.brushPreviewedLen, this.brushShown)) : { i: 1, p: pts[0] };
    // zum Zeichnen reicht ein Punkt je 1,5 px (die Linie liegt alle 5 cm)
    const solid = resamplePolyline([from.p, ...pts.slice(from.i, cut), cutPt], 1.5 / zoom);
    if (solid.length >= 2) {
      const flat = solid.flatMap((p) => [p.X, p.Y]);
      g.poly(flat, false).stroke({ width: w + 4 / zoom, color: 0xffffff, alpha: 0.6, cap: 'round', join: 'round' });
      g.poly(flat, false).stroke({ width: w, color: hexNum(INK), alpha: 0.95, cap: 'round', join: 'round' });
    }
    // Schleppe: vom Ende der Bahn über den Weg der Gummiband-Spitze und das Band bis zum Tropfen unter dem Finger,
    // geglättet und zum Finger hin breiter (dünn wie die Linie an der Bahn, am Tropfen fast so breit wie er)
    const f = this.brushFinger();
    const raw = [cutPt, ...pts.slice(cut), ...b.band(10, f).slice(1)];
    const tail = chaikin(resamplePolyline(raw, 3 / zoom));
    let total = 0;
    for (let i = 1; i < tail.length; i++) total += Math.hypot(tail[i].X - tail[i - 1].X, tail[i].Y - tail[i - 1].Y);
    if (tail.length >= 2 && total > 1e-6) {
      const left: number[] = [];
      const right: number[] = [];
      let s = 0;
      for (let i = 0; i < tail.length; i++) {
        if (i > 0) s += Math.hypot(tail[i].X - tail[i - 1].X, tail[i].Y - tail[i - 1].Y);
        const a = tail[Math.max(0, i - 1)];
        const c = tail[Math.min(tail.length - 1, i + 1)];
        let nx = -(c.Y - a.Y);
        let ny = c.X - a.X;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        // am Bahnende etwas dünner als die Linie, zum Tropfen hin erst spät breit (Tropfenform)
        const half = w * 0.4 + (r * 0.85 - w * 0.4) * (s / total) ** 2.6;
        left.push(tail[i].X + nx * half, tail[i].Y + ny * half);
        right.push(tail[i].X - nx * half, tail[i].Y - ny * half);
      }
      const poly = [...left];
      for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
      g.poly(poly, true).fill({ color: pink, alpha: 0.9 });
    }
    g.circle(f.X, f.Y, r).fill({ color: pink, alpha: 0.92 });
    g.circle(f.X, f.Y, r).stroke({ width: 2 / zoom, color: 0xffffff, alpha: 0.85 });
  }

  /** Pinsel-Strich beginnt: Bahn noch leer, Mauszeiger aus (der Tropfen ist der Zeiger) */
  private startBrushStroke(): void {
    this.brushShown = 0;
    this.brushPreview = null;
    this.brushPreviewedLen = 0;
    this.brushBase = this.strokeKind === 'extend' && this.samples ? trackLineWithDepth(this.samples) : null;
    this.previewTimer = 0;
    this.setDrawCursor(true);
  }

  /** die schon gemalte Bahn des Pinsels (bis brushShown, ohne Schleppe) */
  private brushSolidLine(): StagePoint[] {
    const pts = this.brush!.points;
    const out: StagePoint[] = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y);
      if (acc + d >= this.brushShown) {
        const f = d > 1e-9 ? (this.brushShown - acc) / d : 0;
        out.push({ X: pts[i - 1].X + (pts[i].X - pts[i - 1].X) * f, Y: pts[i - 1].Y + (pts[i].Y - pts[i - 1].Y) * f });
        return out;
      }
      out.push(pts[i]);
      acc += d;
    }
    return out;
  }

  /**
   * Live-Schienen beim Pinsel: die schon gemalte Bahn mit derselben Tiefenwahl wie beim Loslassen, ruhig (was weiter
   * zurückliegt, behält seine Tiefe) und ohne Streben. Fortsetzen: Die alte Bahn bleibt, wie sie ist. Überzeichnen
   * zeigt nur die Tinte (die Bahn ändert sich erst beim Loslassen).
   */
  private previewBrush(): void {
    if (this.strokeKind === 'overdraw' || this.strokeKind === 'terrain') return;
    const solid = this.brushSolidLine();
    let line = solid;
    let keep: ArrayLike<number> | undefined;
    if (this.strokeKind === 'extend' && this.brushBase) {
      line = joinLines(this.brushBase.line, solid);
      keep = this.brushBase.z;
    } else if (lineLength(solid) < 6) return;
    const pv = previewBrushTrack(line, this.brushOptions(), this.brushPreview, keep);
    if (!pv || pv.path.nodes.length < 2) return;
    pv.path.startType = this.path?.startType ?? 'chainlift';
    this.brushPreview = pv;
    this.brushPreviewedLen = lineLength(solid);
    const sm = sampleTrack(pv.path, 0.5);
    // gemessen: die Vorschau plus die Schleppe (auf dem Bild gemessen, im Verhältnis der Vorschau)
    const tail = Math.max(0, this.brush!.drawnLength - this.brushShown);
    this.liveLength = sm.length + tail * Math.max(1, sm.length / Math.max(1, lineLength(line)));
    this.view.setTrack(pv.path, sm, this.skin, this.terrain, this.allowTunnels, true);
    this.drawGhost(pv.path);
    this.liveFeedback(pv.path, sm, trackStats(pv.path, sm));
  }

  /** Bahn holt zäh zur Spitze auf (Zeitkonstante BRUSH_LAG), höchstens BRUSH_TAIL_PX hinterher */
  private advanceBrush(dt: number): void {
    const b = this.brush!;
    const total = b.drawnLength;
    const k = 1 - Math.exp(-dt / BRUSH_LAG);
    let shown = this.brushShown + (total - this.brushShown) * k;
    shown = Math.max(shown, total - BRUSH_TAIL_PX / this.view.camera.zoom);
    this.brushShown = Math.min(total, Math.max(0, shown));
    this.drawInk();
  }

  /** Tropfen-Position: Vorhersage des Browsers, sonst kurz in Bewegungsrichtung vorausgeschätzt (Bildlatenz) */
  private brushFinger(): StagePoint {
    const b = this.brush!;
    if (this.predicted) return this.predicted;
    const zoom = this.view.camera.zoom;
    let dx = this.fingerV.x * BRUSH_PREDICT;
    let dy = this.fingerV.y * BRUSH_PREDICT;
    const d = Math.hypot(dx, dy);
    if (d > 24) {
      dx *= 24 / d;
      dy *= 24 / d;
    }
    return { X: b.finger.X + dx / zoom, Y: b.finger.Y - dy / zoom };
  }

  /** Mauszeiger beim Malen ausblenden (der Tropfen zeigt, wo der Finger ist) und danach wieder zeigen */
  private setDrawCursor(hidden: boolean): void {
    const events = this.game.app.renderer.events;
    events.cursorStyles.default = hidden ? 'none' : 'inherit';
    this.game.app.canvas.style.cursor = hidden ? 'none' : '';
  }

  /**
   * Pinsel-Strich fertig: Die Linie holt bis zum Finger auf, wird an die Bahn angeschlossen (Fortsetzen,
   * Überzeichnen) und ist dann die Bahn. Tiefe und Physik wählt die Bahn selbst; danach laufen Probefahrten in
   * Zeitscheiben, die an Problemstellen nachbessern.
   */
  private finishBrush(): void {
    const brush = this.brush!;
    this.brush = null;
    this.predicted = null;
    this.setDrawCursor(false);
    this.stroke = null;
    this.strokeModes = [];
    this.strokeLane = null;
    this.pointerTrail = [];
    this.retracting = false;
    this.retractDist = 0;
    this.ink.clear();
    this.ghost.clear();
    const drawn = brush.finish();
    let line = drawn;
    let keep: ArrayLike<number> | undefined;
    const kind = this.strokeKind;
    const base = this.brushBase;
    const shown = this.brushPreview;
    this.brushBase = null;
    this.brushPreview = null;
    if (kind === 'extend' && base) {
      // Fortsetzen: die alte Bahn behält ihre Tiefe, nur das neue Stück wählt sie
      line = joinLines(base.line, drawn);
      keep = base.z;
    } else if (kind === 'overdraw' && this.path && this.samples) {
      line = spliceLine(trackLine(this.samples), drawn, Math.max(2, 30 / this.view.camera.zoom));
    } else if (lineLength(drawn) < 6) {
      this.redrawTrack();
      return;
    }
    // Verbinden-Baustelle (Schritt 6): endet der Strich nah am Anschlusspunkt, rastet das Ende dort ein und die Freilegung läuft
    const snap = kind === 'overdraw' ? null : this.siteSnap(drawn);
    const plan = planBrushTrack(line, { ...this.brushOptions(), ...(snap ? { endSnap: { X: snap.X, Y: snap.Y, lane: snap.lane } } : {}) }, keep, kind === 'overdraw' ? undefined : shown);
    if (!plan || plan.path.nodes.length < 2) {
      this.redrawTrack();
      return;
    }
    if (plan.rockCut) this.toast.show(t('rock.cut'), 2.4);
    if (snap && !plan.rockCut) this.startReveal(snap.site, snap.el);
    this.pushHistory();
    plan.path.startType = this.path?.startType ?? 'chainlift';
    this.setPath(plan.path, true);
    this.startRefine(plan);
    // offen, aber nah an der Station: Hinweis auf den Ziel-Radius
    if (!plan.closed) {
      const a = plan.line[0];
      const b = plan.line[plan.line.length - 1];
      if (Math.hypot(a.X - b.X, a.Y - b.Y) <= this.closeReach()) this.toast.show(t('closeOffer'), 2.2);
    }
  }

  /**
   * Kreuzung antippen: Der vordere Strang geht nach hinten (und umgekehrt). Die Tiefe wird neu gewählt, danach laufen
   * die Probefahrten noch einmal.
   */
  private swapBrushCrossing(k: number): void {
    const plan = this.brushPlan;
    if (!plan || !this.path || !this.samples) return;
    const crossingsBefore = findCrossings(this.samples).length;
    const keep = { startType: this.path.startType, elements: this.path.elements };
    // erst zur Probe tauschen: Treffen sich die Stränge so herum (die Tiefe kann sie nicht trennen), bleibt es
    const trial: BrushPlan = { ...plan, crossings: plan.crossings.map((c) => ({ ...c })) };
    swapCrossing(trial, k, this.brushOptions());
    if (findCrossings(sampleTrack(trial.path, 0.25)).length > crossingsBefore) {
      this.toast.show(t('crossingNoSwap'), 2);
      return;
    }
    Object.assign(plan, trial);
    this.pushHistory();
    plan.path.startType = keep.startType;
    plan.path.elements = keep.elements;
    this.setPath(plan.path, false);
    this.startRefine(plan);
    this.toast.show(t('crossingSwapped'), 1.4);
    if (!this.sandbox) storage.saveDraft(this.level.id, plan.path);
  }

  /**
   * Rundenschluss auf Tipp: Das Ende der Pinsel-Bahn wird ohne Knick in die Station geführt, wie beim Loslassen nahe
   * der Station, nur aus größerem Abstand (Ziel-Radius). Was vor dem Ende liegt, behält seine Tiefe.
   */
  private closeBrushTrack(): void {
    const plan = this.brushPlan;
    if (!plan || !this.path || isClosed(this.path)) return;
    const keep = plan.z.length > 80 ? Array.from(plan.z.subarray(0, plan.z.length - 60)) : undefined;
    const next = planBrushTrack(plan.line, { ...this.brushOptions(), closeReach: this.closeReach() }, keep);
    if (!next || !next.closed || next.path.nodes.length < 2) {
      this.toast.show(t('closeFailed'), 2);
      return;
    }
    this.pushHistory();
    next.path.startType = this.path.startType;
    this.setPath(next.path, true);
    this.startRefine(next);
    this.toast.show(t('closeDone'), 1.4);
  }

  /** grober Fingerabdruck der Knoten: ändert sich die Bahn von Hand, passt der Pinsel-Plan nicht mehr */
  private pathStamp(path: TrackPath | null): number {
    if (!path) return 0;
    let h = path.nodes.length;
    path.nodes.forEach((n, i) => (h += (i + 1) * (n.x * 1.3 + n.y * 2.7 + n.z * 5.1 + n.outX * 0.7 + n.outY * 0.9 + n.outZ * 1.1)));
    return h;
  }

  private startRefine(plan: BrushPlan): void {
    this.brushPlan = plan;
    this.brushPlanStamp = this.pathStamp(plan.path);
    const limit = (SKIN_PHYSICS[this.skin] ?? SKIN_PHYSICS.skinWood).lateralLimit;
    const probe = (path: TrackPath, samples: TrackSamples) =>
      new TrainSim(samples, path, { ...simOptionsForLevel(this.level, path, this.terrain, this.skin, this.allowTunnels), lateralLimit: Infinity, checkCrossings: false });
    this.refiner = new BrushRefiner(plan, this.brushOptions(), probe, limit);
    this.refining = plan.path;
  }

  /** Probefahrten weiterrechnen (höchstens budgetMs); sind sie fertig, übernimmt die Szene die bessere Bahn */
  private stepRefine(budgetMs: number): void {
    const r = this.refiner;
    if (!r || !r.run(budgetMs)) return;
    this.refiner = null;
    this.scheduleInspect();
    if (!this.path || this.path !== this.refining) return;
    this.refining = null;
    if (r.best !== this.path) {
      const next = r.best;
      next.startType = this.path.startType;
      next.elements = this.path.elements;
      this.path = next;
      this.brushPlanStamp = this.pathStamp(next);
      this.redrawTrack();
      // die Pfeiler setzen sich neu (die Tiefe hat sich verschoben)
      this.supportGrow = 0.5;
      this.view.growSupports(0.5);
      this.updateGoals();
      if (this.samples && this.stats) this.measure.show(next, this.samples, this.stats, (x, z) => this.terrain.groundHeight(x, z));
      if (!this.sandbox) storage.saveDraft(this.level.id, next);
    }
  }

  /** Bahn geändert: Marker weg, kurz danach (wenn nichts mehr gezogen wird) neu prüfen */
  private scheduleInspect(): void {
    this.inspector = null;
    this.weakSpots = [];
    this.spotLayer.clear();
    this.inspectAt = this.time + 0.3;
  }

  /** Probefahrt für die Schwachstellen in Zeitscheiben (nur im DEV-Modus, nur ohne laufenden Strich oder Zug) */
  private stepInspect(): void {
    if (this.inspectAt < 0 || this.time < this.inspectAt || this.stroke || this.refiner || this.drag.kind !== 'none') return;
    if (!unlockAll() || !this.path || !this.samples) {
      this.inspectAt = -1;
      return;
    }
    if (!this.inspector) {
      const probe = (path: TrackPath, samples: TrackSamples) =>
        new TrainSim(samples, path, { ...this.simOptions(path), lateralLimit: Infinity, checkCrossings: false });
      this.inspector = new TrackInspector(this.path, this.samples, probe, (SKIN_PHYSICS[this.skin] ?? SKIN_PHYSICS.skinWood).lateralLimit);
    }
    if (this.inspector.path !== this.path) {
      this.scheduleInspect();
      return;
    }
    if (!this.inspector.run(REFINE_SLICE_MS)) return;
    this.weakSpots = this.inspector.spots;
    this.inspector = null;
    this.inspectAt = -1;
    this.drawWeakSpots();
    // Zone: eine zu kurze Kette meldet die Probefahrt als Hinweis (Etappe 2, Schritt 3)
    if (this.sandbox?.zone && this.weakSpots.some((w) => w.reason === 'chain')) this.toast.show(t('chain.hint'), 2.2);
  }

  /** Dev-Modus: Schwachstellen der aktuellen Bahn (zu eng, zu langsam, Kreuzung) als rote Ringe */
  private drawWeakSpots(): void {
    const g = this.spotLayer;
    g.clear();
    if (!unlockAll() || !this.samples || !this.weakSpots.length) return;
    const zs = 1 / Math.max(0.35, this.view.camera.zoom / 12);
    for (const spot of this.weakSpots) {
      const i = Math.min(this.samples.count - 1, Math.max(0, Math.round(spot.s / this.samples.step)));
      const p = toView(this.samples.x[i], this.samples.y[i], this.samples.z[i]);
      g.circle(p.X, p.Y, 1.6 * zs).stroke({ width: 0.3 * zs, color: 0xff4d5e, alpha: 0.9 });
    }
  }

  private sculptTerrain(stroke: StagePoint[]): void {
    const z = clamp(Math.round(stroke[0].Y / LANE_RISE), LANE_MIN, LANE_MAX);
    let maxH = 0;
    let minH = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of stroke) {
      const w = rayToWorld(p, z);
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
    // Weltrenderer: Boden und Erdschnitt folgen dem geformten Gelände
    this.game.world?.showLevel(this.terrain, this.world);
    this.afterEdit();
  }

  // ------------------------------------------------------------------ Bahn-Zustand
  private setPath(path: TrackPath | null, animate: boolean): void {
    this.refiner = null;
    this.brushPlan = null;
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
      const s = toView(n.x, n.y, n.z);
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
      this.scheduleInspect();
      this.view.clearTrack();
      this.drawOverlay();
      this.refreshLaneHud();
      return;
    }
    this.samples = sampleTrack(this.path, 0.25);
    this.stats = trackStats(this.path, this.samples);
    this.view.setTrack(this.path, this.samples, this.skin, this.terrain, this.allowTunnels, false);
    this.scheduleInspect();
    this.drawOverlay();
    this.refreshLaneHud();
    this.drawChainLine();
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
      this.view.clearTrain();
      return;
    }
    const opts = this.simOptions(this.path);
    const perCar = 2;
    const belt = this.belt();
    if (this.standCars.length !== opts.cars) {
      const riders = storage.ridersFor(opts.cars * perCar);
      this.view.buildTrain(opts.cars, riders, perCar, this.abilities?.car);
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
      const p0 = toView(st.x, st.y, st.z);
      const p1 = toView(st.x + st.t3x, st.y + st.t3y, st.z + st.t3z / LANE_DEPTH);
      this.standCars.push({
        index: c, s: 0, x: st.x, y: st.y, z: st.z, tx: fr.T.x, ty: fr.T.y, tz: fr.T.z, upx: fr.U.x, upy: fr.U.y, upz: fr.U.z, sx: fr.S.x, sy: fr.S.y, sz: fr.S.z,
        bank: fr.bank, angle: Math.atan2(p1.Y - p0.Y, p1.X - p0.X), gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: g, feltSide: 0, inTunnel: false, inverted: false, vx: 0, vy: 0,
      });
    }
    this.view.trainR.setStanding(true);
  }

  private afterEdit(): void {
    if (!this.path) return;
    if (!this.path.brush) closePath(this.path);
    this.redrawTrack();
    this.updateGoals();
    if (!this.sandbox) storage.saveDraft(this.level.id, this.path);
  }

  private clearTrack(): void {
    if (this.mode !== 'draw' || !this.path) return;
    const start = this.path.startType;
    this.pushHistory();
    this.setPath(null, false);
    // Zone mit Station: das Vorgabestück bleibt, mit der gewählten Startart (Aufzug inklusive)
    this.resetStationPiece(start);
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
    const w = rayToWorld(tagRay(st), n.z);
    n.x = w.x;
    n.y = Math.max(this.groundAt(w.x, n.z) + 0.6, w.y);
    if (this.level.maxHeight) n.y = Math.min(n.y, this.level.maxHeight);
    this.redrawTrack();
  }
  private moveHandle(i: number, st: StagePoint, isIn: boolean): void {
    if (!this.path) return;
    const n = this.path.nodes[i];
    const hz = isIn ? n.inZ : n.outZ;
    const w = rayToWorld(tagRay(st), n.z + hz);
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
      this.toast.show(t('laneEnd'), 1.5);
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
    const unlockedStarts = START_ORDER.filter((s) => this.unlocked.has(START_UNLOCK[s]));
    // Aufzug nur, solange die Bahn das Vorgabestück ist: Er verlängert es um den senkrechten Lift (Schritt 3b)
    const pieceOnly = this.isStationPieceOnly();
    const available = unlockedStarts.filter((s) => s !== 'verticalLift' || pieceOnly || this.path!.startType === 'verticalLift');
    if (!available.length) return;
    const idx = available.indexOf(this.path.startType);
    const next = available[(idx + 1) % available.length];
    const skipped = unlockedStarts.includes('verticalLift') && !available.includes('verticalLift') && unlockedStarts[(unlockedStarts.indexOf(this.path.startType) + 1) % unlockedStarts.length] === 'verticalLift';
    this.pushHistory();
    this.path.startType = next;
    if (pieceOnly) this.resetStationPiece(next);
    this.redrawTrack();
    this.updateGoals();
    if (skipped) this.toast.show(t('lift.onlyEmpty'), 2);
    // Zone: der Name kurz groß als Sticker (Plan 3.3), im Level der Toast wie bisher
    if (this.sandbox?.zone) this.sticker.show(t('start.' + this.path.startType), '#ffd23f', 1.2);
    else this.toast.show(`${t('startType')}: ${t('start.' + this.path.startType)}`, 1.5);
  }
  /**
   * Optionen der Fahrt für diese Bahn, in der Zone mit der Kettenzugstärke des Felds (Etappe 2, Schritt 3). Die Probefahrten
   * des Pinsels (BrushRefiner) laufen ohne sie: Sie bessern die Linie nach, eine zu kurze Kette können sie nicht beheben.
   */
  private simOptions(path: TrackPath): TrainSimOptions {
    const chain = this.abilities?.chain;
    const rock = this.rock;
    const zone = this.sandbox?.zone;
    return { ...simOptionsForLevel(this.level, path, this.terrain, this.skin, this.allowTunnels), ...(chain ? { chainHeight: chain } : {}), ...(rock && !rock.empty ? { insideRock: (x: number, y: number, z: number) => rock.tunnel(x, y, z) } : {}), ...(zone ? { walls: siteWalls(zone.sites, this.openedSites) } : {}) };
  }

  /** Startart im Feld (Etappe 2, Schritt 1): erlaubt die Stufe die gewählte nicht, nimmt die Bahn die erste erlaubte */
  private ensureStartAllowed(): void {
    if (!this.path || !this.abilities) return;
    const allowed = allowedStarts(this.abilities) as StartType[];
    if (!allowed.length || allowed.includes(this.path.startType)) return;
    this.path.startType = allowed[0];
    if (this.samples) this.redrawTrack();
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
    const blocked = this.strokeLane && this.time - this.blockedAt < BLOCKED_SHOW ? this.blockedDir : 0;
    const st = this.laneHudState;
    const same = (st.lane === null && lane === null) || (st.lane !== null && lane !== null && Math.round(st.lane) === Math.round(lane));
    if (same && st.mode === mode && st.blocked === blocked) return;
    this.laneHudState = { lane, mode, blocked };
    this.drawLaneHud();
  }
  private drawLaneHud(): void {
    const g = this.laneHudG;
    g.clear();
    const { lane, mode, blocked } = this.laneHudState;
    const ink = hexNum(INK);
    // Spurende: roter Riegel über der hintersten bzw. unter der vordersten Ebene (dorthin geht es nicht weiter)
    if (blocked) {
      const y = blocked > 0 ? -22 - 11 : -22 + (LANE_MAX - LANE_MIN) * 11 + 11;
      g.roundRect(-14, y - 2.5, 28, 5, 2.5).fill({ color: 0xff4d5e }).stroke({ width: 2, color: ink });
    }
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
      const se = toView(e.x, e.y, e.z);
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
      const sp = toView(n.x, n.y, n.z);
      const k = laneScale(n.z);
      g.circle(sp.X, sp.Y, 0.9 * k * zoomScale).stroke({ width: 0.16 * k * zoomScale, color: 0x9b6dff, alpha: 0.9 });
    }
    if (!this.unlocked.has('handles')) return;
    nodes.forEach((n, i) => {
      if (isAutoNode(n)) return;
      const s = toView(n.x, n.y, n.z);
      const k = laneScale(n.z);
      const r = (i === this.selected ? 0.55 : 0.38) * k * zoomScale;
      const col = n.kind === 'turn' ? 0x3ec7c2 : n.kind === 'loopApex' ? 0x9b6dff : 0xffffff;
      g.circle(s.X, s.Y, r).fill(i === this.selected ? 0xffd23f : col).stroke({ width: 0.12 * k, color: hexNum(INK) });
      // Tiefen-Linie zum Boden (zeigt die Spur)
      if (i === this.selected) {
        const gnd = toView(n.x, this.terrain.groundHeight(n.x, n.z), n.z);
        g.moveTo(s.X, s.Y).lineTo(gnd.X, gnd.Y).stroke({ width: 0.08 * k, color: hexNum(INK), alpha: 0.5 });
        g.ellipse(gnd.X, gnd.Y, 0.9 * k, 0.3 * k).stroke({ width: 0.1 * k, color: hexNum(INK), alpha: 0.6 });
      }
    });
    if (this.selected >= 0 && this.selected < nodes.length) {
      const n = nodes[this.selected];
      const k = laneScale(n.z);
      const c = toView(n.x, n.y, n.z);
      const gp = this.gizmoPositions()!;
      // Tangenten-Handles nur im Profi-Modus (Langdruck auf den Knoten)
      if (gp.in && gp.out) {
        const a = nodeIn(n);
        const b = nodeOut(n);
        const sa = toView(a.x, a.y, a.z / LANE_DEPTH);
        const sb = toView(b.x, b.y, b.z / LANE_DEPTH);
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
    const type = this.path.startType;
    // Zone: großer Startart-Knopf am Hebel des Häuschens (Etappe 2, Schritt 2; Plan 3.3: das kleine Symbol über dem
    // ersten Knoten wurde nicht als Knopf erkannt), sonst der Chip über dem ersten Knoten
    const st = this.zoneStation();
    const lever = st ? toView(st.x + st.dir * 2.2, st.y + 1.4, st.z - 2.0 / LANE_DEPTH) : null;
    const sp = lever ? this.view.toScreen(lever.X, lever.Y) : this.nodeScreen(nodes[0]);
    const k = lever ? 1.5 : 1;
    out.push({
      x: sp.x, y: sp.y - (lever ? 44 : 46), r: 22 * k, action: () => this.cycleStart(),
      draw: (g) => {
        const ink = hexNum(INK);
        if (lever) g.moveTo(0, 18 * k).lineTo(0, 44).stroke({ width: 6, color: ink, cap: 'round' });
        g.circle(0, 0, 20 * k).fill(hexNum(lever ? '#ffd23f' : PAPER)).stroke({ width: 3, color: ink });
        drawStartIcon(g, type, k);
      },
    });
    // Pinsel-Bahn: Kreuzungen antippen tauscht, welcher Strang vorne liegt (nur solange die Bahn zum Plan passt)
    const plan = this.brushPlan;
    if (plan && !this.stroke && this.path.brush && this.pathStamp(this.path) === this.brushPlanStamp) {
      const cam = this.view.camera;
      plan.crossings.forEach((c, k) => {
        const q = plan.line[c.i];
        const p = cam.toScreen(q.X, q.Y);
        out.push({
          x: p.x, y: p.y, r: 13, action: () => this.swapBrushCrossing(k),
          draw: (g) => {
            const ink = hexNum(INK);
            g.circle(0, 0, 12).fill({ color: hexNum(PAPER), alpha: 0.92 }).stroke({ width: 2.5, color: ink });
            // zwei Pfeile gegeneinander: vorne ⇄ hinten
            g.moveTo(-4, -6).lineTo(-4, 6).moveTo(-7, 3).lineTo(-4, 6).lineTo(-1, 3).stroke({ width: 2, color: ink, cap: 'round', join: 'round' });
            g.moveTo(4, 6).lineTo(4, -6).moveTo(1, -3).lineTo(4, -6).lineTo(7, -3).stroke({ width: 2, color: ink, cap: 'round', join: 'round' });
          },
        });
      });
    }
    // Pinsel-Bahn offen und ihr Ende im Ziel-Radius: Tipp auf die Station schließt die Runde sauber
    if (plan && !this.stroke && this.path.brush && !isClosed(this.path) && nodes.length > 1 && this.pathStamp(this.path) === this.brushPlanStamp) {
      const a = toView(nodes[0].x, nodes[0].y, nodes[0].z);
      const end = nodes[nodes.length - 1];
      const b = toView(end.x, end.y, end.z);
      const reach = this.closeReach();
      if (Math.hypot(a.X - b.X, a.Y - b.Y) <= reach) {
        const rpx = reach * this.view.camera.zoom;
        const spin = (this.time * 0.4) % ((2 * Math.PI) / 36);
        out.push({
          x: sp.x, y: sp.y, r: 24, action: () => this.closeBrushTrack(),
          draw: (g) => {
            const ink = hexNum(INK);
            for (let k = 0; k < 36; k++) {
              const a0 = spin + (k * 2 * Math.PI) / 36;
              g.moveTo(Math.cos(a0) * rpx, Math.sin(a0) * rpx).arc(0, 0, rpx, a0, a0 + Math.PI / 36).stroke({ width: 3, color: 0xffffff, alpha: 0.8, cap: 'round' });
            }
            g.circle(0, 0, 21).fill({ color: hexNum(PAPER), alpha: 0.95 }).stroke({ width: 3, color: ink });
            // Pfeil im Kreis: zurück zum Anfang
            g.moveTo(Math.cos(-0.6) * 10, Math.sin(-0.6) * 10).arc(0, 0, 10, -0.6, Math.PI * 1.35).stroke({ width: 3, color: ink, cap: 'round' });
            const ax = Math.cos(-0.6) * 10;
            const ay = Math.sin(-0.6) * 10;
            g.moveTo(ax - 6, ay - 1).lineTo(ax, ay).lineTo(ax + 1, ay + 6).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
          },
        });
      }
    }
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
    if (!this.hasGoals) {
      // Sandkasten: das Maßband zeigt Länge, Höhe, Loopings und Kehren dauerhaft
      this.goalsBar.removeChildren();
      this.goalCells = [];
      this.goalsBuiltFor = '';
      this.measure.pin(true);
      if (this.path && this.samples && this.stats) this.measure.show(this.path, this.samples, this.stats, (x, z) => this.terrain.groundHeight(x, z));
      else this.measure.clear();
      return;
    }
    // Zone mit Zielen: das Maßband nur noch während des Strichs (wie im Level)
    if (this.sandbox) this.measure.pin(false);
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
    const key = `${this.level.id}:${this.activeField?.id ?? ''}:${portrait ? 'p' : 'l'}:${this.w}`;
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
    if (this.hasGoals) {
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
    // Handy: zum Zeichen nicht weiter herauszoomen als DRAW_ZOOM_MIN, damit Spuren und Kringel fingergroß bleiben.
    // Die Kamera beginnt dann an der Station (bzw. am linken Levelrand) und lässt die Höhe, wie sie war.
    const t = cam.target;
    if (this.mode === 'draw' && !this.overview && Math.min(this.w, this.h) < DRAW_ZOOM_SCREEN && t.zoom < DRAW_ZOOM_MIN) {
      const b = this.levelBounds();
      const halfW = this.w / 2 / DRAW_ZOOM_MIN;
      const st = this.path?.nodes[0];
      const anchor = st ? toStage(st.x, st.y, st.z).X : b.minX;
      const x = Math.max(b.minX + halfW, Math.min(b.maxX - halfW, anchor + halfW * 0.6));
      cam.setTarget(x, t.y, DRAW_ZOOM_MIN);
    }
    if (instant) cam.snap();
  }

  // ------------------------------------------------------------------ Fahrt
  private startRide(): void {
    if (this.refiner && this.mode === 'draw') this.stepRefine(400);
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
    const opts = this.simOptions(ridePath);
    this.sim = new TrainSim(rideSamples, ridePath, opts);
    const perCar = 2;
    const riders = storage.ridersFor(opts.cars * perCar);
    const belt = this.belt();
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
        const s = toView(car.x, car.y, car.z);
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
        const s = toView(c.x, c.y, c.z);
        this.view.effects.confetti(s.X, s.Y + 2, 30);
      }
      this.setSlow(0.35, 1.0, { kind: 'car', index: car });
      this.sticker.show(t('sticker.catch'), '#7ee081');
      this.toast.show(t('caught', { name }), 1.6);
      audio.play('catch');
    };
    this.view.buildTrain(opts.cars, riders, perCar, this.abilities?.car);
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
    this.refreshLanePanel();
    this.refreshLengthUI(true);
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
    this.view.clearTrain();
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
    this.refreshLanePanel();
    this.refreshLengthUI(true);
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
    this.hud.addChild(btn);
    this.hud.removeChild(old);
    old.destroy({ children: true });
    this.playBtn = btn;
    this.uiButtons = [this.backBtn, this.undoBtn, this.redoBtn, this.clearBtn, this.playBtn, this.shelfBtn, this.speedBtn, this.saveBtn, this.skinBtn, ...this.laneBtns.map((l) => l.btn)];
    this.ui.addChild(this.toast);
  }

  private processEvents(): void {
    if (!this.sim) return;
    const ev = this.sim.events;
    while (ev.length) {
      const e = ev.shift()!;
      const car = this.sim.cars[e.car ?? 0];
      const s = car ? toView(car.x, car.y, car.z) : { X: 0, Y: 0 };
      switch (e.kind) {
        case 'coin': {
          const c = this.level.coins?.[e.index ?? 0];
          if (c) {
            const cs = toView(c.x, c.y, c.lane ?? 0);
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
          audio.play(e.reason === 'derail' || e.reason === 'crossing' ? 'derail' : 'impact');
          // Rauswurf: Zeitlupe mit Blick auf den Fliegenden; sonst auf den betroffenen Wagen
          const ejectReason = e.reason === 'eject' || e.reason === 'ejectSide';
          const focus: CameraFocus = ejectReason && this.lastEjected >= 0 ? { kind: 'passenger', index: this.lastEjected } : { kind: 'car', index: e.car ?? 0 };
          this.setSlow(ejectReason ? 0.25 : 0.35, 1.2, focus);
          break;
        }
        case 'finish': this.cameraPhase = 'finale'; this.view.effects.confetti(s.X, s.Y + 3, 80); break;
        case 'breakthrough': {
          // Durchbruch (Schritt 6): Wand weg, Splitter, Sticker; die Baustelle bleibt in dieser Sitzung offen
          this.view.effects.sparks(s.X, s.Y, 24);
          this.view.camera.shake(0.45, 0.3);
          this.sticker.show(t('site.breakthrough'), '#ffd23f', 1.4);
          audio.play('impact');
          if (e.id) {
            this.game.world?.shatterSite(e.id);
            this.openedSites.add(e.id);
          }
          break;
        }
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
          const ls = toView(tp.x, tp.y, v.lane);
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
      const s = toView(imp.x, imp.y, imp.z);
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
    this.view.updateTrain(this.renderCars, this.renderViews, simDt, this.sim.phase !== 'flying');
    this.view.trackR.updateCoins(this.sim.collected, this.time);
    if (this.sim.wheelLock > 0) {
      // blockierte Räder vor dem Absperrband: Funkenspur unter dem ersten Wagen
      const fc = this.renderCars[0];
      const fs = toView(fc.x, fc.y, fc.z);
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
    const success = this.hasGoals && ev.requiredDone;
    let unlockedNow: ElementId[] = [];
    if (success && !this.sandbox) {
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
    const goalsCount = this.hasGoals ? this.level.goals.length : 0;
    const hasNext = success && !this.sandbox && this.level.id < LEVELS.length;
    const h = Math.min(this.h - 20, 300 + goalsCount * 26 + (unlockedNow.length ? 40 : 0) + (hasNext ? 60 : 0));
    c.addChild(panelBg(w, h));
    let y = -h / 2 + 40;
    const title = label(!this.hasGoals ? t('ride') : success ? t('success') : t('failed'), 32, success ? '#2f7a4a' : '#d64545', true);
    title.position.set(0, y);
    c.addChild(title);
    y += 36;
    if (this.hasGoals) {
      const sg = new Graphics();
      for (let i = 0; i < 3; i++) star(sg, (i - 1) * 46, y + 6, 18, i < ev.stars);
      c.addChild(sg);
      y += 40;
    }
    const seatedOk = hasNegativeGoals(this.level) || (this.passengers?.allSeated ?? true);
    const msg = label(finished && seatedOk ? (success || !this.hasGoals ? '' : t('goalsMissing')) : this.failMessage(sim.failReason), 16, INK, false, { wordWrap: true, wordWrapWidth: w - 50 });
    msg.position.set(0, y + 6);
    c.addChild(msg);
    y += msg.text ? msg.height + 14 : 4;
    if (this.hasGoals) {
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
    // Vollbild: Die Bühne liegt unter Kerbe und Home-Leiste, die Bedienelemente weichen dem sicheren Bereich aus
    const safe = safeArea();
    const L = safe.left;
    const R = safe.right;
    const B = safe.bottom;
    const safeTop = Math.max(14, safe.top + 6);
    this.backBtn.position.set(L + 36, safeTop + 26);
    this.undoBtn.position.set(L + 96, safeTop + 26);
    this.redoBtn.position.set(L + 152, safeTop + 26);
    this.clearBtn.position.set(w - R - 36, safeTop + 26);
    this.saveBtn.position.set(w - R - 92, safeTop + 26);
    this.skinBtn.position.set(L + 88, h - B - 50);
    this.lanePanel.position.set(L + 36, h * 0.52);
    // schmaler Bildschirm: über der Höhe des Play-Knopfs (sonst stieße die Anzeige an ihn)
    const pillY = h - B - (this.skinBtn.visible ? 142 : w < 520 ? 150 : 96);
    this.lengthPill.position.set(L + 12, pillY);
    this.lengthSlider.position.set(L + 12, pillY - 64);
    if (portrait) {
      this.levelTitle.position.set(w / 2, safeTop + 72);
      this.goalsBar.position.set(w / 2, safeTop + 112);
    } else {
      this.levelTitle.position.set(w / 2, safeTop + 12);
      this.goalsBar.position.set(w / 2, safeTop + 56);
    }
    this.beltBadge.position.set(w - R - 64, safeTop + 78);
    this.sticker.position.set(w / 2, h * 0.36);
    this.playBtn.position.set(w / 2, h - B - (portrait ? 64 : 56));
    this.shelfBtn.position.set(w - R - 46, h - B - 50);
    this.speedBtn.position.set(w - R - 46, h - B - 50);
    this.laneHud.position.set(w - R - 46, h - B - 120);
    this.shelf.position.set(w - R - 10, h - B - 120);
    this.placeHint();
    this.zoneEditor?.resize(w, h);
    this.speedText.position.set(w / 2, h - B - (portrait ? 120 : 108));
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
    this.stepReveal(dt);
    this.fadeHud(dt);
    if (this.mode === 'draw') {
      if (this.refiner && !this.stroke) this.stepRefine(REFINE_SLICE_MS);
      else this.stepInspect();
      this.spotLayer.visible = !this.stroke;
      if (this.stroke) {
        this.autoscroll(dt);
        if (this.brush) this.advanceBrush(dt);
        if (this.brush) {
          // Live-Schienen des Pinsels: höchstens alle 50 ms, bei teurer Vorschau seltener
          this.previewTimer += dt;
          if (this.previewTimer > Math.max(0.05, 1.5 * this.previewCost)) {
            this.previewTimer = 0;
            const t0 = performance.now();
            this.previewBrush();
            this.previewCost = (performance.now() - t0) / 1000;
          }
        } else {
          this.previewTimer += dt;
          if (this.previewTimer > Math.max(0.012, 1.25 * this.previewCost)) {
            this.previewTimer = 0;
            const t0 = performance.now();
            this.previewStroke();
            this.previewCost = (performance.now() - t0) / 1000;
          }
        }
      }
      if (this.supportGrow < 1) {
        this.supportGrow = Math.min(1, this.supportGrow + dt / 0.3);
        this.view.growSupports(1 - (1 - this.supportGrow) ** 2);
      }
      this.measure.update(dt, (X, Y) => this.view.toScreen(X, Y));
      for (const cell of this.goalCells) if (cell.pop.scale.x > 1) cell.pop.scale.set(Math.max(1, cell.pop.scale.x - dt * 1.5));
      this.renderChips();
      this.refreshLanePanel();
      this.refreshLengthUI();
      // Anschlusspunkt atmet (Alpha und Größe), damit das offene Ende als Startpunkt für den nächsten Strich auffällt
      this.endMarker.alpha = 0.55 + 0.45 * Math.sin(this.time * 5);
      this.endMarker.scale.set(1 + 0.15 * Math.sin(this.time * 5));
      if (this.selected >= 0 && this.drag.kind === 'none') this.drawOverlay();
      if (this.standCars.length) this.view.updateStandingTrain(this.standCars, this.standViews, dt);
      this.clampCamera();
    } else if (this.mode === 'ride') {
      this.spotLayer.visible = false;
      this.updateRide(dt);
    } else if (this.mode === 'result') {
      if (this.sim && this.passengers && this.renderCars.length) this.view.updateTrain(this.renderCars, this.renderViews, dt, this.sim.phase !== 'flying');
    }
    if (this.beltPop > 0) {
      this.beltPop = Math.max(0, this.beltPop - dt * 4);
      this.beltBadge.scale.set(1 + 0.6 * this.beltPop);
    }
    this.sticker.update(dt);
    this.view.update(dt);
    this.game.world?.setCamera(this.view.cameraView());
    this.zoneEditor?.update();
    if (this.view.viewMoved) this.drawFieldTape();
    // Perspektive: Griffe, Ende-Marker, Spur-Schein und Schwachstellen liegen in der Ansicht und wandern mit der Kamera
    if (this.view.viewMoved && this.mode === 'draw') {
      this.drawOverlay();
      this.laneGlowState = { lane: NaN, mode: 'floor', blocked: false };
      this.drawLaneGlow();
      if (this.weakSpots.length) this.drawWeakSpots();
    }
    this.toast.update(dt);
  }

  /** Gurt-Abzeichen neu zeichnen: Stufe des Levels (oder der Welt), rot durchgestrichen, wenn ein Gurt gerissen ist */
  private refreshBeltBadge(broken: boolean): void {
    const level = this.belt();
    const dev = unlockAll() && storage.settings.devBelt != null;
    this.beltIconG.clear();
    beltIcon(this.beltIconG, level, 30, broken);
    this.beltText.text = dev ? `${t(`belt.${level}`)} · DEV` : t(`belt.${level}`);
    // im DEV-Modus immer sichtbar: Antippen wählt die Gurtstufe
    this.beltBadge.visible = !this.sandbox || level > 0 || unlockAll();
  }

  /** Gurtstufe der Fahrt: im DEV-Modus die dort gewählte, sonst die des Levels (oder seiner Welt) */
  private belt(): BeltLevel {
    const dev = storage.settings.devBelt;
    return unlockAll() && dev != null ? dev : restraintFor(this.level, this.world);
  }

  /** DEV: Gurtstufe durchschalten (wie im Level → ohne → Beckengurt → Bügel → Schulterbügel → Rennsitz → wie im Level) */
  private cycleDevBelt(): void {
    const cur = storage.settings.devBelt;
    const next = cur == null ? 0 : cur >= 4 ? null : ((cur + 1) as BeltLevel);
    storage.updateSettings({ devBelt: next });
    const belt = this.belt();
    for (const v of this.standViews) v.belt = belt;
    this.refreshBeltBadge(false);
    this.beltPop = 1;
    this.toast.show(next == null ? t('belt.devDefault', { name: t(`belt.${belt}`) }) : t('belt.devSet', { name: t(`belt.${next}`) }), 1.8);
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
