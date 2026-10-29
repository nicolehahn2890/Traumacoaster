/**
 * Pinsel-Studie (28.10.2026): Florians aufgenommene Striche so nachspielen, wie die Level-Szene sie beim Malen
 * verarbeitet (Gummiband, Live-Vorschau im Takt der Aufnahme, Loslassen, Probefahrten), und dabei messen:
 *
 *  a) Leistung: Zeit je Vorschau über der Linienlänge, getrennt nach Linie, Kreuzungen, Tiefenwahl (Löser) und den
 *     Abfragen an Ebenen und Freiraumfeld (depthAt, groundAt, free, solid, floor), dazu Knoten und Abtastung, Bahnprofil
 *     (Mesh) und beim Loslassen Plan, Probefahrten und Stützen.
 *  b) Sprung beim Loslassen: letzte Vorschau gegen fertige Bahn (vor und nach den Probefahrten) in Bildpixeln, Metern
 *     der Welt, Tiefe und Rollwinkel.
 *  c) Ablenkung beim Zeichnen: Abstand der sichtbaren Bahn (Vorschau, mit der Kamera des Augenblicks) vom gemalten
 *     Strich im Bild, nach Nähe zum Festen und entlang des Strichs; Bewegung der schon gezeigten Bahn von Vorschau zu
 *     Vorschau.
 *  d) Fertige Bahn: Knicke, Rollrate, Tiefenwechsel, Fahrt, Stützen ohne Fuß.
 *
 *   npx tsx scripts/pinsel-messung.ts <strokes.jsonl> [--heute] [--tag JJJJ-MM-TT] [--alt] [--last N] [--skip N] [--json datei] [--strich 2] [--fest N] [--vorlauf M] [--tol F] [--even 0|1] [--span M] [--turn G]
 *
 *   --heute: die Striche vom 28.10.2026 in den Testszenen (Satz des Berichts); --tag: Striche eines anderen Tages in Zonen
 *
 * Nur lesend auf der Aufnahme. Zonen aus public/zones/<zone>/zone.json; Striche in test-boegen mit Feld f2 laufen in der
 * Kopie von Florians geändertem Bogenland (test-boegen-f2).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { getLevel } from '../src/levels/levels';
import { worldOfLevel } from '../src/levels/worlds';
import type { LevelDef } from '../src/levels/types';
import { Terrain } from '../src/physics/terrain';
import { RIDE_TUNING, SKIN_PHYSICS, TrainSim, simOptionsForLevel } from '../src/physics/trainSim';
import { MAX_BANK, railBanksFor, sampleTrack, trackStats, type TrackPath, type TrackSamples } from '../src/track/model';
import type { Vec3 } from '../src/core/math3';
import { RubberBrush } from '../src/track/brush';
import { BrushRefiner, findElements, findLineCrossings, joinLines, lineLength, pathFromPoints, planBrushTrack, prepareBrushLine, previewBrushTrack, trackLineWithDepth, type BrushField, type BrushOptions, type BrushPreview } from '../src/track/brushTrack';
import { LANE_DEPTH, rayToWorld, setPerspective, setView, toView, viewDistance, type StagePoint } from '../src/track/stage';
import { parseZone, type ZoneFile } from '../src/zone/types';
import { cachedFreeLanes } from '../src/zone/field';
import { buildPlaneStack, PlaneField, PlaneFoundation, planeDeepestDock, planeGroundDepth, planeLanding, type PlaneStack } from '../src/zone/planeStack';
import { trackFrames } from '../src/world/trackMesh';
import { buildTrack } from '../src/world/trackBuilder';
import { planWorldSupports } from '../src/world/supports';
import { trackTypeForSkin } from '../src/world/trackTypes';
import { FIT_TUNING, FIX_BEHIND, FREEZE, LOOK_TUNING, LOOP_TUNING, Strich2, type Strich2Preview } from '../src/track/strich2';
import { resolveAbilities } from '../src/zone/abilities';
import { findCrossings } from '../src/track/crossings';

interface Rec {
  at: string;
  level: number;
  reading: string;
  kind: 'new' | 'extend' | 'overdraw';
  zoom: number;
  screen: [number, number];
  dpr?: number;
  persp?: number;
  zone?: string;
  field?: string;
  points: Array<[number, number, number] | [number, number, number, number, number]>;
  before: TrackPath | null;
  result: { nodes: number; closed: boolean; length: number } | null;
}

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string): string | null => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const file = args.find((a, i) => !a.startsWith('--') && !['--last', '--json', '--strich', '--nur', '--debug', '--skip', '--fest', '--vorlauf', '--tag', '--tol', '--even', '--span', '--turn', '--freezemax', '--lookstart', '--fahrt', '--antrieb', '--loopaspect', '--loopr', '--schleifen'].includes(args[i - 1])) ?? 'recordings/strokes.jsonl';
const LAST = Number(opt('--last') ?? 0);
/** so viele der jüngsten Striche weglassen (ein älterer Satz bleibt vergleichbar, wenn neue dazukamen) */
const SKIP = Number(opt('--skip') ?? 0);
const JSON_OUT = opt('--json');
const STRICH = Number(opt('--strich') ?? 1);
const NUR = opt('--nur');
const DEBUG = Number(opt('--debug') ?? -1);
/** Strich 2: Meter hinter dem festen Ende, ab denen ein Bahn-Segment fest wird (FIX_BEHIND) */
const FEST = Number(opt('--fest') ?? FIX_BEHIND);
/** Strich 2: Vorlauf in Metern hinter der Spitze, ab dem die Tiefe fest wird (FREEZE) */
const VORLAUF = Number(opt('--vorlauf') ?? FREEZE);
// Strich 2, Knoten-Fit zum Ausprobieren (siehe FIT_TUNING): --tol 2 --even 0 --span 150 --turn 180
if (opt('--tol') !== null) FIT_TUNING.tolScale = Number(opt('--tol'));
if (opt('--even') !== null) FIT_TUNING.even = Number(opt('--even')) !== 0;
if (opt('--span') !== null) FIT_TUNING.evenSpan = Number(opt('--span'));
if (opt('--turn') !== null) FIT_TUNING.evenTurn = Number(opt('--turn'));
// offenes steiles Stück: ab so vielen Metern Höhe und fest (--freezemax), freie Meter nach dem Anschluss (--lookstart)
if (opt('--freezemax') !== null) LOOK_TUNING.freezeMax = Number(opt('--freezemax'));
if (opt('--lookstart') !== null) LOOK_TUNING.lookStart = Number(opt('--lookstart'));
// Fahrregeln (Paket 2): --fahrt strict|drive (Vorgabe wie im Spiel: drive), --antrieb Mindesttempo des Antriebs in m/s
if (opt('--fahrt') !== null) RIDE_TUNING.rules = opt('--fahrt') === 'strict' ? 'strict' : 'drive';
if (opt('--antrieb') !== null) RIDE_TUNING.driveSpeed = Number(opt('--antrieb'));
// Schleifen (Paket 3): --loopaspect Höhe/Breite ab der eine Schleife ein Looping ist, --loopr Mindestradius; --ohnekette ohne Kettenlinie als Deckel
if (opt('--schleifen') !== null) LOOP_TUNING.on = opt('--schleifen') !== '0';
if (opt('--loopaspect') !== null) LOOP_TUNING.aspect = Number(opt('--loopaspect'));
if (opt('--loopr') !== null) LOOP_TUNING.minR = Number(opt('--loopr'));
const OHNE_KETTE = flag('--ohnekette');
/** wie in der Level-Szene: Band 22 px, Vorschau höchstens alle 50 ms, sonst nach dem 1,5-Fachen ihrer Dauer */
const BAND_PX = 22;
const PREVIEW_MIN_S = 0.05;
const PREVIEW_COST_FACTOR = 1.5;
const BRUSH_LAG = 0.14;
const BRUSH_TAIL_PX = 200;
const NO_GROUND = -500;
const SLICE_PHYSICS_D = 70;
const CLEARANCE = 0.8;

const fixNaN = (p: TrackPath | null): TrackPath | null => {
  if (!p) return p;
  for (const n of p.nodes) if (n.roll === null || n.roll === undefined) n.roll = NaN;
  return p;
};

let recs: Rec[] = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Rec);
recs = recs.filter((r) => r.reading === 'brush' && r.kind !== 'overdraw');
if (flag('--heute')) recs = recs.filter((r) => r.at.startsWith('2026-10-28') && r.zone);
const TAG = opt('--tag');
if (TAG) recs = recs.filter((r) => r.at.startsWith(TAG) && r.zone);
if (SKIP) recs = recs.slice(0, Math.max(0, recs.length - SKIP));
if (flag('--alt')) recs = recs.filter((r) => !r.zone && r.at < '2026-10-28' && r.at >= '2026-10-23');
if (NUR) recs = recs.filter((r) => r.zone === NUR);
if (LAST > 0) recs = recs.slice(-LAST);

// ------------------------------------------------------------------ Hilfen

const q = (a: number[], f: number): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * f))];
};
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const mx = (a: number[]): number => {
  let m = 0;
  for (const v of a) if (v > m) m = v;
  return m;
};
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '–');
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** Zeitmesser um eine Funktion: Summe der Zeit und Zahl der Aufrufe */
function timed<A extends unknown[], R>(fn: (...a: A) => R, acc: { ms: number; n: number }): (...a: A) => R {
  return (...a: A) => {
    const t = performance.now();
    const r = fn(...a);
    acc.ms += performance.now() - t;
    acc.n++;
    return r;
  };
}

const segDist = (q: StagePoint, a: StagePoint, b: StagePoint): number => {
  const dx = b.X - a.X;
  const dy = b.Y - a.Y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / l2)) : 0;
  return Math.hypot(q.X - (a.X + dx * t), q.Y - (a.Y + dy * t));
};

/** Polylinie in einem Raster (Zellen von cell Bühnen-Metern): Abstand eines Punkts zur Linie ohne Suche über alle Stücke */
class PolyGrid {
  private readonly cells = new Map<string, number[]>();
  constructor(
    private readonly line: StagePoint[],
    private readonly cell = 2,
  ) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i];
      const b = line[i + 1];
      const x0 = Math.floor(Math.min(a.X, b.X) / cell);
      const x1 = Math.floor(Math.max(a.X, b.X) / cell);
      const y0 = Math.floor(Math.min(a.Y, b.Y) / cell);
      const y1 = Math.floor(Math.max(a.Y, b.Y) / cell);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = `${x}|${y}`;
          const l = this.cells.get(k);
          if (l) l.push(i);
          else this.cells.set(k, [i]);
        }
    }
  }

  /** kleinster Abstand (Bühnen-Meter), gesucht in wachsenden Ringen um die Zelle des Punkts (höchstens maxRings Zellen weit) */
  dist(p: StagePoint, maxRings = 8): number {
    if (this.line.length < 2) return Infinity;
    const cx = Math.floor(p.X / this.cell);
    const cy = Math.floor(p.Y / this.cell);
    let best = Infinity;
    for (let r = 0; r <= maxRings; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const l = this.cells.get(`${x}|${y}`);
          if (!l) continue;
          for (const i of l) best = Math.min(best, segDist(p, this.line[i], this.line[i + 1]));
        }
      // alles außerhalb des Rings liegt mindestens r Zellen weit weg
      if (best <= r * this.cell) break;
    }
    return best;
  }
}

/** Zone laden (Striche mit Feld f2 in Bogenland: Florians geänderte Fassung) */
const zoneCache = new Map<string, { zone: ZoneFile; stack: PlaneStack; field: PlaneField | null } | null>();
function loadZone(rec: Rec) {
  if (!rec.zone) return null;
  const name = rec.zone === 'test-boegen' && rec.field === 'f2' ? 'test-boegen-f2' : rec.zone;
  if (zoneCache.has(name)) return zoneCache.get(name)!;
  let out: { zone: ZoneFile; stack: PlaneStack; field: PlaneField | null } | null = null;
  try {
    const zone = parseZone(JSON.parse(readFileSync(`public/zones/${name}/zone.json`, 'utf8')));
    const stack = zone?.nodes?.length ? buildPlaneStack(zone.nodes) : null;
    if (zone && stack) {
      const field = new PlaneField(stack);
      out = { zone, stack, field: field.empty ? null : field };
    }
  } catch (e) {
    console.error(`Zone ${name}: ${(e as Error).message}`);
  }
  zoneCache.set(name, out);
  return out;
}

function levelOf(rec: Rec, zone: ZoneFile | null): { level: LevelDef; skin: string } {
  try {
    if (rec.level > 0) return { level: getLevel(rec.level), skin: worldOfLevel(rec.level).skin };
  } catch {
    /* Sandbox */
  }
  return { level: { id: 0, world: 1, name: 'Sandbox', hook: '', goals: [], width: zone?.width ?? 200, terrain: [{ kind: 'flat' }], cars: 3, passengers: 6 } as unknown as LevelDef, skin: zone?.trackType === 'steel' ? 'skinSteel' : 'skinWood' };
}

interface Counters {
  depthAt: { ms: number; n: number };
  groundAt: { ms: number; n: number };
  free: { ms: number; n: number };
  solid: { ms: number; n: number };
  floor: { ms: number; n: number };
  ground: { ms: number; n: number };
}
const newCounters = (): Counters => ({ depthAt: { ms: 0, n: 0 }, groundAt: { ms: 0, n: 0 }, free: { ms: 0, n: 0 }, solid: { ms: 0, n: 0 }, floor: { ms: 0, n: 0 }, ground: { ms: 0, n: 0 } });
const sumCounters = (c: Counters) => c.depthAt.ms + c.groundAt.ms + c.free.ms + c.solid.ms + c.floor.ms + c.ground.ms;
const diffCounters = (a: Counters, b: Counters): Counters => ({
  depthAt: { ms: a.depthAt.ms - b.depthAt.ms, n: a.depthAt.n - b.depthAt.n },
  groundAt: { ms: a.groundAt.ms - b.groundAt.ms, n: a.groundAt.n - b.groundAt.n },
  free: { ms: a.free.ms - b.free.ms, n: a.free.n - b.free.n },
  solid: { ms: a.solid.ms - b.solid.ms, n: a.solid.n - b.solid.n },
  floor: { ms: a.floor.ms - b.floor.ms, n: a.floor.n - b.floor.n },
  ground: { ms: a.ground.ms - b.ground.ms, n: a.ground.n - b.ground.n },
});
const snap = (c: Counters): Counters => JSON.parse(JSON.stringify(c));

/** Pinsel-Optionen wie `LevelScene.brushOptions` in einer Ebenen-Zone („Ebenen: Bodenhöhe“) bzw. im Level (Bildhöhe) */
/** Kettenlinie als Deckel (Paket 3): Höhe der Station des Felds plus Kettenzugstärke der aufgelösten Fähigkeiten; undefined ohne Kette */
function chainTopOf(rec: Rec, z: ReturnType<typeof loadZone>): number | undefined {
  if (!z || OHNE_KETTE) return undefined;
  const zone = z.zone;
  const fld = zone.fields.find((f) => f.id === rec.field) ?? null;
  const ab = resolveAbilities(zone, fld);
  const st = (fld && zone.stations.find((s) => s.x >= fld.x0 && s.x <= fld.x1 && s.y >= fld.y0 && s.y <= fld.y1)) ?? zone.stations[0];
  return ab.chain && st ? st.y + ab.chain : undefined;
}

function brushOptionsFor(rec: Rec, z: ReturnType<typeof loadZone>, terrain: Terrain, holdZ: number, counters: Counters): BrushOptions {
  const closeSnap = Math.max(8, 60 / rec.zoom);
  const tolerance = Math.max(0.4, 8 / rec.zoom);
  if (!z) {
    return { ground: timed((x: number, lane: number) => terrain.groundHeight(x, lane), counters.ground), clearance: CLEARANCE, closeSnap, tolerance };
  }
  const { stack, field } = z;
  const freeRaw = field ? cachedFreeLanes(field, (p, lane) => rayToWorld(p, lane), CLEARANCE) : null;
  const bf: BrushField | undefined = field && freeRaw ? { free: timed(freeRaw, counters.free), solid: timed((x: number, y: number, lane: number) => field.solid(x, y, lane), counters.solid), floor: timed((x: number, y: number, lane: number) => field.floorBelow(x, y, lane, 40), counters.floor) } : undefined;
  const base: BrushOptions = {
    ground: timed(() => NO_GROUND, counters.ground),
    clearance: CLEARANCE,
    closeSnap,
    tolerance,
    field: bf,
    holdLane: true,
    holdDepth: holdZ,
    depthAt: timed((p: StagePoint) => planeLanding(stack, p), counters.depthAt),
    zMax: planeDeepestDock(stack),
    groundAt: timed((p: StagePoint) => planeGroundDepth(stack, p), counters.groundAt),
    chainTop: chainTopOf(rec, z),
  };
  return base;
}

interface PreviewRow {
  t: number;
  n: number;
  lineM: number;
  ms: number;
  calls: Counters;
  prepareMs: number;
  crossingsMs: number;
  sampleMs: number;
  meshMs: number;
  statsMs: number;
  /** Ablenkung im Bild (px): Median, 90 %, Maximum, getrennt nach Nähe zum Festen */
  devAll: number[];
  devTouched: number[];
  devFree: number[];
  devTipFar: number[];
  /** Bewegung der schon gezeigten Bahn seit der letzten Vorschau (Punkte älter als 15 m): Tiefe (m) und Bild (px) */
  moveZ: number[];
  movePx: number[];
  /** Bewegung der letzten 15 m (vorläufiger Teil) seit der letzten Vorschau: Tiefe (m) */
  tailZ: number[];
  /** Rückstand des gezeigten Bahnendes hinter dem Finger (px) */
  tipLagPx: number;
  /** Atmen: größte Bewegung (px) der schon gezeigten Schienen (bis zum festen Ende) gegenüber der letzten Vorschau; NaN ohne Vergleich */
  breathPx: number;
  /** Strich 2: Anteile der Vorschau (ms) und Schranken-Konflikte */
  s2SolveMs: number;
  s2CrossMs: number;
  s2FitMs: number;
  s2QueryMs: number;
  s2Conflicts: number;
  /** Strich 2: feste neue Linienpunkte (ohne alte Bahn), feste Linienmeter, Meter der alten Bahn in der Linie (Band = lineM − s2BaseM − s2FrozenM) */
  s2Frozen: number;
  s2FrozenM: number;
  s2BaseM: number;
}

interface StrokeResult {
  idx: number;
  at: string;
  zone: string | null;
  field: string | null;
  device: string;
  zoom: number;
  fov: number | null;
  points: number;
  seconds: number;
  drawnM: number;
  camMove: number;
  fingerPx: number;
  previews: PreviewRow[];
  release: {
    planMs: number;
    planCalls: Counters;
    refineMs: number;
    refineSteps: number;
    repaired: number;
    meshMs: number;
    supportsMs: number;
    supports: number;
    floating: number;
    nodes: number;
    /** Knoten eines Fits über die ganze fertige Linie ohne Kreuzungs-Toleranz (Vergleich: was das stückweise Festwerden kostet) */
    nodesGlobal: number;
    /** Strich 2: Linienpunkte mit Kreuzungsschranke (dort gilt die enge Knoten-Toleranz) */
    nearPts: number;
    lengthM: number;
    closed: boolean;
    /** Sprung letzte Vorschau → Plan und → nach Probefahrten */
    jumpPlan: Jump;
    jumpBest: Jump;
    knicke: number;
    rollRate: number;
    rollPer100: number;
    depthSpan: number;
    depthFlips: number;
    ride: string;
    rideOk: boolean;
    /** Zahlen der Fahrt (Paket 2): Inversionen, Querkraft, Antrieb, Schräglage am Anschlag */
    rideStats: RideNumbers;
    /** Selbstkreuzungen des Strichs im Bild (grob) */
    loopsDrawn: number;
    /** Strich 2: erkannte Loopings (davon aufgeweitet), Bodenschleifen, Punkte über der Kettenlinie; Kettenlinie und höchster Bahnpunkt (Welt) */
    s2Loops: number;
    s2LoopsWidened: number;
    s2LoopsFlat: number;
    /** Schleifen von Strich 2: Linienindex Einfahrt i, Ausfahrt j, Looping, Aufweitung */
    s2LoopList: Array<{ i: number; j: number; vertical: boolean; scale: number }>;
    /** Knicke der Bahn: Bogenlänge und nächster Linienindex */
    knickeAt: number[];
    knickeLine: number[];
    s2Capped: number;
    chainTop: number;
    maxHeightM: number;
    /** gezeichnete Schleifen nach findElements: Loopings (hoch, nach oben) und Bodenschleifen; Radius-Schätzung je Looping (Bühnen-Meter) */
    loopsV: number;
    loopsFlat: number;
    loopRadii: number[];
    /** Inversionen der Fahrt nach Lage: im Looping, in einer Bodenschleife, an einer Kehre (Umkehr in x), sonst; je sonst/Kehre: Höhen- und Tiefenspanne ±15 m */
    invInLoop: number;
    invInFlat: number;
    invHairpin: number;
    invOther: number;
    invShapes: Array<{ k: number; kind: string; dy: number; dz: number }>;
    crossings?: Array<{ i1: number; i2: number; s1: number; s2: number; along: number; dy: number; zTrack: number; z1Line: number; z2Line: number; dzLine: number; near1: boolean | null; near2: boolean | null }>;
    accepted: string[];
  } | null;
}

interface Jump {
  px50: number;
  px90: number;
  pxMax: number;
  m50: number;
  mMax: number;
  z50: number;
  zMax: number;
  roll50: number;
  rollMax: number;
  /** nur Punkte, die mehr als 15 m vor der Spitze lagen */
  pxMaxFar: number;
  zMaxFar: number;
}

/** Projektion eines Weltpunkts auf den Bildschirm (px) mit Kamera cx, cy, zoom, screen */
function screenOf(x: number, y: number, z: number, cam: { cx: number; cy: number }, zoom: number, screen: [number, number]): { x: number; y: number } {
  const v = toView(x, y, z / LANE_DEPTH);
  return { x: (v.X - cam.cx) * zoom + screen[0] / 2, y: screen[1] / 2 - (v.Y - cam.cy) * zoom };
}

/** Sprung zwischen zwei Bahnen: je Linienpunkt der Vorschau die Verschiebung im Bild, in der Welt, der Tiefe und im Rollwinkel */
function jumpOf(pv: { pts: { x: number; y: number; z: number }[]; z: Float64Array; path: TrackPath }, fin: { pts: { x: number; y: number; z: number }[]; z: Float64Array; path: TrackPath }, cam: { cx: number; cy: number }, zoom: number, screen: [number, number]): Jump {
  const n = Math.min(pv.z.length, fin.z.length) - 4;
  const px: number[] = [];
  const m: number[] = [];
  const dz: number[] = [];
  const roll: number[] = [];
  const far: number[] = [];
  const farZ: number[] = [];
  const sPv = sampleTrack(pv.path, 0.25);
  const sFin = sampleTrack(fin.path, 0.25);
  const bPv = railBanksFor(sPv);
  const bFin = railBanksFor(sFin);
  const nearest = (s: TrackSamples, p: { x: number; y: number; z: number }, hint: number): number => {
    let best = 0;
    let bd = Infinity;
    const a = Math.max(0, hint - 80);
    const b = Math.min(s.count - 1, hint + 80);
    for (let i = a; i <= b; i++) {
      const d = (s.x[i] - p.x) ** 2 + (s.y[i] - p.y) ** 2 + (s.z[i] * LANE_DEPTH - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  let hintA = 0;
  let hintB = 0;
  for (let i = 0; i < n; i++) {
    const a = pv.pts[i];
    const b = fin.pts[i];
    const pa = screenOf(a.x, a.y, a.z, cam, zoom, screen);
    const pb = screenOf(b.x, b.y, b.z, cam, zoom, screen);
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    px.push(d);
    m.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    dz.push(Math.abs(a.z - b.z));
    hintA = nearest(sPv, a, hintA + 4);
    hintB = nearest(sFin, b, hintB + 4);
    roll.push((Math.abs(bPv[hintA] - bFin[hintB]) * 180) / Math.PI);
    if (i < pv.z.length - 15) {
      far.push(d);
      farZ.push(Math.abs(a.z - b.z));
    }
  }
  return { px50: q(px, 0.5), px90: q(px, 0.9), pxMax: mx(px), m50: q(m, 0.5), mMax: mx(m), z50: q(dz, 0.5), zMax: mx(dz), roll50: q(roll, 0.5), rollMax: mx(roll), pxMaxFar: mx(far), zMaxFar: mx(farZ) };
}

/** Knicke (Krümmungsradius unter 4 m außerhalb von Loopings), Rollrate (°/m, 90 %), Rollen je 100 m, Tiefenspanne und -umkehrungen */
function shapeStats(path: TrackPath, samples: TrackSamples): { knicke: number; knickeAt: number[]; rollRate: number; rollPer100: number; depthSpan: number; depthFlips: number } {
  const banks = railBanksFor(samples);
  let knicke = 0;
  const knickeAt: number[] = [];
  const rates: number[] = [];
  let rollSum = 0;
  for (let i = 1; i < samples.count; i++) {
    const k = Math.hypot(samples.k3x[i], samples.k3y[i], samples.k3z[i]);
    if (k > 0.25 && samples.upy[i] > 0.35) {
      knicke++;
      knickeAt.push(+samples.s[i].toFixed(1));
    }
    const dr = (Math.abs(banks[i] - banks[i - 1]) * 180) / Math.PI;
    rates.push(dr / samples.step);
    rollSum += dr;
  }
  let lo = Infinity;
  let hi = -Infinity;
  let flips = 0;
  let dir = 0;
  let ref = samples.z[0];
  for (let i = 0; i < samples.count; i++) {
    const z = samples.z[i] * LANE_DEPTH;
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
    // Umkehr der Tiefenrichtung mit mindestens 1 m Hub
    if (dir >= 0 && z > ref + 1) {
      if (dir < 0) flips++;
      dir = 1;
      ref = z;
    } else if (dir <= 0 && z < ref - 1) {
      if (dir > 0) flips++;
      dir = -1;
      ref = z;
    } else if (dir > 0 && z > ref) ref = z;
    else if (dir < 0 && z < ref) ref = z;
    else if (dir > 0 && z < ref - 1) {
      flips++;
      dir = -1;
      ref = z;
    } else if (dir < 0 && z > ref + 1) {
      flips++;
      dir = 1;
      ref = z;
    }
  }
  return { knicke, knickeAt, rollRate: q(rates, 0.9), rollPer100: (rollSum / Math.max(1, samples.length)) * 100, depthSpan: hi - lo, depthFlips: flips };
}

interface RideNumbers {
  inversions: number;
  maxLatG: number;
  kmh: number;
  /** Meter, die der Antrieb geschoben hat, und wo er zuerst eingriff (−1 = nie) */
  driveM: number;
  driveFirstM: number;
  /** Zeitanteile im Rollen: Schräglage am Anschlag (MAX_BANK), Querkraft über 1,5 g */
  bankCap: number;
  lat15: number;
  timeS: number;
  fail: string | null;
  failAtM: number;
  /** Stellen der Inversionen (Bogenlänge und Weltpunkt des ersten Wagens) */
  invAt: Array<{ s: number; x: number; y: number; z: number }>;
}

function ride(path: TrackPath, level: LevelDef, terrain: Terrain, skin: string, field: PlaneField | null, slices: boolean): { ok: boolean; text: string; stats: RideNumbers } {
  path.startType ||= 'chainlift';
  const samples = sampleTrack(path, 0.25);
  const sim = new TrainSim(samples, path, { ...simOptionsForLevel(level, path, terrain, skin, true), ...(field ? { insideRock: (x: number, y: number, z: number) => field.ceilingAbove(x, y, z) } : {}), ...(slices ? { depthPerspective: SLICE_PHYSICS_D } : {}) });
  let steps = 0;
  let capSteps = 0;
  let latSteps = 0;
  let driveFirst = -1;
  const invAt: Array<{ s: number; x: number; y: number; z: number }> = [];
  // bis 400 s Spielzeit: mit Antrieb kriecht ein langer Strich notfalls mit 4 m/s durch
  for (let i = 0; i < 60 * 400 && !sim.finished; i++) {
    sim.step(1 / 60);
    if (sim.stats.inversions > invAt.length) {
      const c = sim.cars[0];
      invAt.push({ s: sim.s, x: c.x, y: c.y, z: c.z });
    }
    if (sim.phase === 'coast') {
      steps++;
      if (Math.abs(sim.cars[0].bank) >= MAX_BANK - 0.02) capSteps++;
      if (sim.cars[0].gLat > 1.5) latSteps++;
    }
    if (driveFirst < 0 && sim.stats.driveM > 0) driveFirst = sim.s;
  }
  const kmh = Math.round(sim.stats.maxSpeed * 3.6);
  const lat = sim.stats.maxLatG.toFixed(1);
  const at = Math.round(((sim.cars[0].s % samples.length) + samples.length) % samples.length);
  // angekommen: Runde zu Ende (geschlossene Bahn) oder das offene Ende des Strichs erreicht (die Bahn hat kein Ziel)
  const arrived = sim.phase === 'done' || sim.failReason === 'openEnd';
  const stats: RideNumbers = {
    inversions: sim.stats.inversions, maxLatG: sim.stats.maxLatG, kmh, driveM: sim.stats.driveM, driveFirstM: driveFirst,
    bankCap: steps ? capSteps / steps : 0, lat15: steps ? latSteps / steps : 0, timeS: sim.t, fail: arrived ? null : sim.failReason ?? 'Zeit um', failAtM: at, invAt,
  };
  const drive = sim.stats.driveM > 0 ? `, Antrieb ${Math.round(sim.stats.driveM)} m ab ${Math.round(driveFirst)} m` : '';
  if (arrived) return { ok: true, text: `${sim.phase === 'done' ? 'geschafft' : `Ende erreicht bei ${at} m`}, ${kmh} km/h, ${lat} g quer, ${sim.stats.inversions} kopfüber${drive}`, stats };
  return { ok: false, text: `${sim.failReason ?? 'Zeit um'} bei ${at} m, ${kmh} km/h, ${lat} g quer${drive}`, stats };
}

// ------------------------------------------------------------------ Nachspielen

function replay(rec: Rec, idx: number): StrokeResult {
  const z = loadZone(rec);
  const { level, skin } = levelOf(rec, z?.zone ?? null);
  const terrain = new Terrain(level);
  const pts = rec.points;
  // Kamera je Punkt (Autoscroll-Punkte tragen keine: die des letzten Punkts davor gilt), ohne Kamera der Strichmittelpunkt
  let meanCx = 0;
  let meanCy = 0;
  for (const r of pts) {
    meanCx += r[0] / pts.length;
    meanCy += r[1] / pts.length;
  }
  const cams: Array<{ cx: number; cy: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    cams.push(p.length >= 5 ? { cx: p[3] as number, cy: p[4] as number } : i > 0 ? cams[i - 1] : { cx: meanCx, cy: meanCy });
  }
  const camAt = (i: number): { cx: number; cy: number } => cams[i];
  const fov = rec.persp ?? (rec.zone ? 18 : null);
  const persp = fov !== null;
  const D = persp ? viewDistance(rec.zoom, rec.screen[1], fov!) : Infinity;
  const setCam = (i: number) => {
    const c = camAt(i);
    setPerspective(persp, fov ?? 18);
    if (persp) setView(c.cx, c.cy, D);
  };
  const stage = (i: number): StagePoint => {
    const p = pts[i];
    const c = camAt(i);
    return persp ? { X: p[0], Y: p[1], cx: c.cx, cy: c.cy } : { X: p[0], Y: p[1] };
  };
  setCam(0);
  // Kamerabewegung während des Strichs (Bühnen-Meter) und Fingertempo (px/s, 90 %)
  let camMove = 0;
  const speeds: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = camAt(i - 1);
    const b = camAt(i);
    camMove += Math.hypot(b.cx - a.cx, b.cy - a.cy);
    const dt = (pts[i][2] - pts[i - 1][2]) / 1000;
    if (dt > 0.004) speeds.push((Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * rec.zoom) / dt);
  }
  const counters = newCounters();
  const before = fixNaN(rec.before);
  let base: { line: StagePoint[]; z: Float64Array; nodes?: TrackPath['nodes'] } | null = null;
  // Fortsetzen: Strich 2 behält die Knoten der alten Bahn wörtlich (nodes), der heutige Pinsel liest nur Linie und Tiefe
  if (before && rec.kind === 'extend') base = { ...trackLineWithDepth(sampleTrack(before, 0.25)), nodes: before.nodes };
  const holdZ = base?.z.length ? base.z[base.z.length - 1] : z ? (planeLanding(z.stack, stage(0))?.z ?? planeGroundDepth(z.stack, stage(0))) : NaN;
  const opts = brushOptionsFor(rec, z, terrain, holdZ, counters);
  // Strich 2: eigener Läufer mit festem Vorlauf; der nimmt die ganze Pinsellinie (keine Schleppe)
  const s2 = STRICH >= 2 ? new Strich2(() => opts, base, holdZ, Math.max(8, 60 / rec.zoom), FEST, VORLAUF) : null;
  const brush = new RubberBrush(stage(0), BAND_PX / rec.zoom);
  const previews: PreviewRow[] = [];
  let pv: BrushPreview | null = null;
  let pvPts: { x: number; y: number; z: number }[] = [];
  /** Abtastung der letzten Vorschau bis zu ihrem festen Ende (Welt), für das Atmen der Schienen */
  let pvShown: { x: number; y: number; z: number }[] = [];
  let lastPreviewT = -Infinity;
  let cost = 0;
  let shown = 0;
  let tPrev = pts[0][2] / 1000;
  let lastDebug: string[] = [];
  const solidLine = (): StagePoint[] => {
    const p = brush.points;
    const out: StagePoint[] = [p[0]];
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i].X - p[i - 1].X, p[i].Y - p[i - 1].Y);
      if (acc + d >= shown) {
        const f = d > 1e-9 ? (shown - acc) / d : 0;
        out.push({ ...p[i - 1], X: p[i - 1].X + (p[i].X - p[i - 1].X) * f, Y: p[i - 1].Y + (p[i].Y - p[i - 1].Y) * f });
        return out;
      }
      out.push(p[i]);
      acc += d;
    }
    return out;
  };
  const linePts = (line: StagePoint[], zs: Float64Array) => line.map((p, i) => {
    const w = rayToWorld(p, zs[i] / LANE_DEPTH);
    return { x: w.x, y: w.y, z: zs[i] };
  });
  for (let i = 1; i < pts.length; i++) {
    const t = pts[i][2] / 1000;
    const dt = Math.max(0, t - tPrev);
    tPrev = t;
    brush.move(stage(i));
    // Bahn holt zäh auf (advanceBrush)
    const total = brush.drawnLength;
    shown = Math.max(Math.min(total, shown + (total - shown) * (1 - Math.exp(-dt / BRUSH_LAG))), total - BRUSH_TAIL_PX / rec.zoom);
    if (t - lastPreviewT < Math.max(PREVIEW_MIN_S, PREVIEW_COST_FACTOR * cost)) continue;
    setCam(i);
    const solid = solidLine();
    let line = solid;
    let keep: ArrayLike<number> | undefined;
    if (base) {
      line = joinLines(base.line, solid);
      keep = base.z;
    } else if (lineLength(solid) < 6) continue;
    const c0 = snap(counters);
    const t0 = performance.now();
    // Strich 2 wie im Spiel (&vorlauf=1): die Vorschau-Bahn endet am festen Teil, Linie und Tiefe reichen bis zur Spitze
    const next: (BrushPreview & { line?: StagePoint[] }) | null = s2 ? s2.update(brush.points, true) : previewBrushTrack(line, opts, pv, keep);
    const ms = performance.now() - t0;
    cost = ms / 1000;
    lastPreviewT = t;
    if (!next || next.path.nodes.length < 2) continue;
    const calls = diffCounters(counters, c0);
    // Einzelposten noch einmal für sich (zusätzlich zur Gesamtzeit)
    let t1 = performance.now();
    const prep = s2 ? { line: next.line!, closed: false } : prepareBrushLine(line, -1);
    const prepareMs = performance.now() - t1;
    t1 = performance.now();
    if (prep) findLineCrossings(prep.line, false);
    const crossingsMs = performance.now() - t1;
    t1 = performance.now();
    const sm = sampleTrack(next.path, 0.5);
    const sampleMs = performance.now() - t1;
    t1 = performance.now();
    const banks = railBanksFor(sm);
    const frames = trackFrames(sm, banks);
    buildTrack(frames, sm.length, trackTypeForSkin(skin));
    const meshMs = performance.now() - t1;
    t1 = performance.now();
    trackStats(next.path, sm);
    const statsMs = performance.now() - t1;
    // Ablenkung: Vorschau-Bahn (Welt) mit der Kamera jetzt ins Bild, Abstand zur gemalten Linie (Bühne) in px
    const lineNow = prep?.line ?? line;
    const nPts = linePts(lineNow, next.z);
    const devAll: number[] = [];
    const devTouched: number[] = [];
    const devFree: number[] = [];
    const devTipFar: number[] = [];
    const debugLines: string[] = [];
    const brushLine = brush.points;
    const grid = new PolyGrid(brushLine);
    const tipLen = lineLength(lineNow);
    // nur der neue Teil (die alte Bahn ist keine Tinte); die Pinsellinie braucht zwei Punkte
    const baseLen = base ? Math.min(nPts.length, base.line.length) : 0;
    let cum = 0;
    for (let k = 0; k < nPts.length; k++) {
      if (k > 0) cum += Math.hypot(lineNow[k].X - lineNow[k - 1].X, lineNow[k].Y - lineNow[k - 1].Y);
      if (k < baseLen || brushLine.length < 2) continue;
      const v = toView(nPts[k].x, nPts[k].y, nPts[k].z / LANE_DEPTH);
      const d = grid.dist(v) * rec.zoom;
      if (DEBUG === idx && d > 10) {
        // woher die Abweichung kommt: Strahl des Punkts gegen die Kamera jetzt, Hub über die tragende Fläche, fest?
        const w = rayToWorld(lineNow[k], nPts[k].z / LANE_DEPTH);
        const cam = camAt(i);
        const sol = opts.field ? opts.field.solid(w.x, w.y, nPts[k].z / LANE_DEPTH) : false;
        const fl = opts.field ? opts.field.floor(w.x, w.y, nPts[k].z / LANE_DEPTH) : null;
        debugLines.push(`      k ${k}/${nPts.length}: ${d.toFixed(1)} px, z ${nPts[k].z.toFixed(1)} m, Punkt-Kamera (${lineNow[k].cx?.toFixed(1)}, ${lineNow[k].cy?.toFixed(1)}) jetzt (${cam.cx.toFixed(1)}, ${cam.cy.toFixed(1)}), Welt y ${w.y.toFixed(1)} → ${nPts[k].y.toFixed(1)}, fest ${sol}, Boden ${fl === null ? '–' : fl.toFixed(1)}, Strahl X ${lineNow[k].X.toFixed(1)} Y ${lineNow[k].Y.toFixed(1)} → Bild X ${v.X.toFixed(1)} Y ${v.Y.toFixed(1)}`);
      }
      devAll.push(d);
      if (tipLen - cum > 15) devTipFar.push(d);
      const touched = z?.field && opts.field ? opts.field.free(lineNow[k]).touched : false;
      (touched ? devTouched : devFree).push(d);
    }
    // Bewegung der schon gezeigten Bahn gegenüber der letzten Vorschau (Punkte älter als 15 m)
    const moveZ: number[] = [];
    const movePx: number[] = [];
    const tailZ: number[] = [];
    const tipNow = toView(nPts[nPts.length - 1].x, nPts[nPts.length - 1].y, nPts[nPts.length - 1].z / LANE_DEPTH);
    const tipLagPx = Math.hypot(tipNow.X - brush.finger.X, tipNow.Y - brush.finger.Y) * rec.zoom;
    if (pv && pvPts.length) {
      const m = Math.min(pvPts.length, nPts.length) - 15;
      const cam = camAt(i);
      for (let k = Math.max(0, m); k < Math.min(pvPts.length, nPts.length); k++) tailZ.push(Math.abs(nPts[k].z - pvPts[k].z));
      for (let k = 0; k < m; k++) {
        moveZ.push(Math.abs(nPts[k].z - pvPts[k].z));
        const a = screenOf(pvPts[k].x, pvPts[k].y, pvPts[k].z, cam, rec.zoom, rec.screen);
        const b = screenOf(nPts[k].x, nPts[k].y, nPts[k].z, cam, rec.zoom, rec.screen);
        movePx.push(Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    // Atmen der Schienen: die Abtastung der letzten Vorschau bis zu deren festem Ende gegen die Abtastung jetzt (nächster
    // Punkt im Fenster ±40 Proben), in px der Kamera jetzt. Strich 2: nur der Fit des letzten, noch nicht festen Stücks
    // bewegt sich; heutiger Pinsel: alles (Tiefe und Fit neu). Für den heutigen Pinsel gilt als „gezeigt“ alles bis 15 m
    // vor der Spitze
    let breathPx = NaN;
    const shownNow: { x: number; y: number; z: number }[] = [];
    {
      const fw = s2 ? (next as Strich2Preview).frozenWorld : null;
      let cut = sm.count;
      if (s2) {
        cut = 0;
        if (fw) {
          let bestD = Infinity;
          for (let k = 0; k < sm.count; k++) {
            const d = Math.hypot(sm.x[k] - fw.x, sm.y[k] - fw.y, sm.z[k] * LANE_DEPTH - fw.z);
            if (d < bestD) {
              bestD = d;
              cut = k + 1;
            }
          }
        }
      } else cut = Math.max(0, sm.count - Math.round(15 / sm.step));
      for (let k = 0; k < cut; k++) shownNow.push({ x: sm.x[k], y: sm.y[k], z: sm.z[k] * LANE_DEPTH });
      if (pvShown.length && shownNow.length) {
        const cam = camAt(i);
        breathPx = 0;
        for (let k = 0; k < pvShown.length; k++) {
          const a = pvShown[k];
          // in px: Punkt und Bild des nächsten Punkts
          const sa = screenOf(a.x, a.y, a.z, cam, rec.zoom, rec.screen);
          let mBest = Math.min(shownNow.length - 1, k);
          let dBest = Infinity;
          for (let m = Math.max(0, k - 40); m < Math.min(shownNow.length, k + 40); m++) {
            const b = shownNow[m];
            const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            if (d < dBest) {
              dBest = d;
              mBest = m;
            }
          }
          const b = shownNow[mBest];
          const sb = screenOf(b.x, b.y, b.z, cam, rec.zoom, rec.screen);
          breathPx = Math.max(breathPx, Math.hypot(sa.x - sb.x, sa.y - sb.y));
        }
      }
    }
    previews.push({ t, n: next.z.length, lineM: tipLen, ms, calls, prepareMs, crossingsMs, sampleMs, meshMs, statsMs, devAll, devTouched, devFree, devTipFar, moveZ, movePx, tailZ, tipLagPx, breathPx, s2SolveMs: s2?.stats.solveMs ?? NaN, s2CrossMs: s2?.stats.crossMs ?? NaN, s2FitMs: s2?.stats.fitMs ?? NaN, s2QueryMs: s2?.stats.queryMs ?? NaN, s2Conflicts: s2?.stats.conflicts ?? NaN, s2Frozen: s2 ? (next as Strich2Preview).frozen - (base ? base.line.length : 0) : NaN, s2FrozenM: s2 ? s2.frozenLength : NaN, s2BaseM: s2 && base ? lineLength(base.line) : 0 });
    lastDebug = debugLines;
    pv = next;
    pvPts = nPts;
    pvShown = shownNow;
  }
  if (DEBUG === idx) console.log(`   Abweichungen über 10 px in der letzten Vorschau (${lastDebug.length}):\n${lastDebug.slice(0, 40).join('\n')}`);
  const result: StrokeResult = { idx, at: rec.at, zone: rec.zone ?? null, field: rec.field ?? null, device: rec.screen[0] < 700 ? 'Handy' : 'Mac', zoom: rec.zoom, fov, points: pts.length, seconds: pts[pts.length - 1][2] / 1000, drawnM: brush.drawnLength, camMove, fingerPx: q(speeds, 0.9), previews, release: null };
  // Loslassen
  setCam(pts.length - 1);
  const drawn = brush.finish();
  let line = drawn;
  let keep: ArrayLike<number> | undefined;
  if (base) {
    line = joinLines(base.line, drawn);
    keep = base.z;
  } else if (lineLength(drawn) < 6) return result;
  const c0 = snap(counters);
  let t0 = performance.now();
  let planPts: Vec3[];
  let planZ: Float64Array;
  let planPath: TrackPath;
  let planMs: number;
  let refineMs = 0;
  let refineSteps = 0;
  let repaired = 0;
  let accepted: string[] = [];
  let best: TrackPath;
  let bestPts: Vec3[];
  let bestZ: Float64Array;
  let s2Line: StagePoint[] | null = null;
  if (s2) {
    const r = s2.finish(drawn);
    planMs = performance.now() - t0;
    if (!r || r.path.nodes.length < 2) return result;
    s2Line = r.line;
    planPts = r.pts;
    planZ = r.z;
    planPath = r.path;
    best = r.path;
    bestPts = r.pts;
    bestZ = r.z;
  } else {
    const plan = planBrushTrack(line, opts, keep, pv);
    planMs = performance.now() - t0;
    if (!plan || plan.path.nodes.length < 2) return result;
    planPts = plan.pts.map((p) => ({ ...p }));
    planZ = Float64Array.from(plan.z);
    planPath = plan.path;
    const limit = (SKIN_PHYSICS[skin] ?? SKIN_PHYSICS.skinWood).lateralLimit;
    t0 = performance.now();
    const ref = new BrushRefiner(plan, opts, (path, samples) => new TrainSim(samples, path, { ...simOptionsForLevel(level, path, terrain, skin, true), lateralLimit: Infinity, checkCrossings: false, ...(z ? { depthPerspective: SLICE_PHYSICS_D } : {}) }), limit);
    while (!ref.run(1000));
    refineMs = performance.now() - t0;
    refineSteps = ref.steps;
    repaired = ref.repaired;
    accepted = ref.accepted.map((a) => `${Math.round(a.s)} m ${a.reason}`);
    best = ref.best;
    bestPts = ref.plan.pts;
    bestZ = ref.plan.z;
  }
  const planCalls = diffCounters(counters, c0);
  const bestSamples = sampleTrack(best, 0.25);
  t0 = performance.now();
  const banks = railBanksFor(bestSamples);
  const frames = trackFrames(bestSamples, banks);
  buildTrack(frames, bestSamples.length, trackTypeForSkin(skin));
  const meshMs = performance.now() - t0;
  t0 = performance.now();
  const foundation = z ? new PlaneFoundation(z.stack, z.field) : null;
  const { plans, stats } = planWorldSupports(bestSamples, frames, trackTypeForSkin(skin), foundation ? [foundation] : [], (x, y, zz) => (z?.field ? z.field.solid(x, y, zz) : false));
  const supportsMs = performance.now() - t0;
  const cam = camAt(pts.length - 1);
  const pvFin = pv && pvPts.length ? { pts: pvPts, z: pv.z, path: pv.path } : null;
  const empty: Jump = { px50: NaN, px90: NaN, pxMax: NaN, m50: NaN, mMax: NaN, z50: NaN, zMax: NaN, roll50: NaN, rollMax: NaN, pxMaxFar: NaN, zMaxFar: NaN };
  const jumpPlan = pvFin ? jumpOf(pvFin, { pts: planPts, z: planZ, path: planPath }, cam, rec.zoom, rec.screen) : empty;
  const jumpBest = pvFin ? jumpOf(pvFin, { pts: bestPts, z: bestZ, path: best }, cam, rec.zoom, rec.screen) : empty;
  const shape = shapeStats(best, bestSamples);
  const r = ride(best, level, terrain, skin, z?.field ?? null, !!z);
  // gezeichnete Schleifen (Linie von Strich 2, sonst die Pinsellinie) und Lage der Inversionen
  const loopLine = s2Line ?? line;
  const loopPts = s2Line ? bestPts : null;
  const els = findElements(loopLine, findLineCrossings(loopLine, !!best.closed));
  const loopRadii = els.loops.filter((l) => l.vertical).map((l) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = l.i; k <= l.j && k < loopLine.length; k++) { x0 = Math.min(x0, loopLine[k].X); x1 = Math.max(x1, loopLine[k].X); y0 = Math.min(y0, loopLine[k].Y); y1 = Math.max(y1, loopLine[k].Y); }
    return (x1 - x0 + (y1 - y0)) / 4;
  });
  let invInLoop = 0, invInFlat = 0, invHairpin = 0, invOther = 0;
  const invShapes: Array<{ k: number; kind: string; dy: number; dz: number }> = [];
  if (loopPts && loopPts.length === loopLine.length) {
    for (const inv of r.stats.invAt) {
      let k = 0, bd = Infinity;
      for (let m = 0; m < loopPts.length; m++) { const d = Math.hypot(loopPts[m].x - inv.x, loopPts[m].y - inv.y, loopPts[m].z - inv.z); if (d < bd) { bd = d; k = m; } }
      const inV = els.loops.some((l) => l.vertical && k >= l.i - 4 && k <= l.j + 4);
      const inF = !inV && els.loops.some((l) => !l.vertical && k >= l.i - 4 && k <= l.j + 4);
      let dy = 0, dz = 0, kind = 'sonst';
      if (!inV && !inF) {
        const a = Math.max(0, k - 15), b = Math.min(loopLine.length - 1, k + 15);
        let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, pos = false, neg = false;
        for (let m = a; m <= b; m++) { y0 = Math.min(y0, loopPts[m].y); y1 = Math.max(y1, loopPts[m].y); z0 = Math.min(z0, loopPts[m].z); z1 = Math.max(z1, loopPts[m].z); if (m > a) { const dx = loopLine[m].X - loopLine[m - 1].X; if (dx > 0.3) pos = true; if (dx < -0.3) neg = true; } }
        dy = y1 - y0; dz = z1 - z0; kind = pos && neg ? 'kehre' : 'sonst';
        invShapes.push({ k, kind, dy: Math.round(dy * 10) / 10, dz: Math.round(dz * 10) / 10 });
      }
      if (inV) invInLoop++; else if (inF) invInFlat++; else if (kind === 'kehre') invHairpin++; else invOther++;
    }
  }
  result.release = {
    planMs,
    planCalls,
    refineMs,
    refineSteps,
    repaired,
    meshMs,
    supportsMs,
    supports: plans.length,
    floating: stats.floating,
    nodes: best.nodes.length,
    nodesGlobal: pathFromPoints(bestPts, !!best.closed).nodes.length,
    nearPts: s2 ? ((s2 as unknown as { pts: Array<{ near: boolean }> }).pts.filter((q) => q.near).length) : NaN,
    s2Loops: s2?.stats.loops ?? NaN,
    s2LoopsWidened: s2?.stats.loopsWidened ?? NaN,
    s2LoopsFlat: s2?.stats.loopsFlat ?? NaN,
    s2LoopList: s2 ? ((s2 as unknown as { loops: Array<{ i: number; j: number; vertical: boolean; scale: number }> }).loops.map((l) => ({ i: l.i, j: l.j, vertical: l.vertical, scale: +l.scale.toFixed(2) }))) : [],
    knickeLine: shape.knickeAt.map((sv) => { let k = 0; while (k + 1 < bestSamples.count && bestSamples.s[k + 1] < sv) k++; const wx = bestSamples.x[k], wy = bestSamples.y[k], wz = bestSamples.z[k] * LANE_DEPTH; let bi = -1, bd = Infinity; for (let i = 0; i < bestPts.length; i++) { const d = Math.hypot(bestPts[i].x - wx, bestPts[i].y - wy, bestPts[i].z - wz); if (d < bd) { bd = d; bi = i; } } return bi; }),
    s2Capped: s2?.stats.capped ?? NaN,
    chainTop: opts.chainTop ?? NaN,
    maxHeightM: bestPts.reduce((m, p) => Math.max(m, p.y), -Infinity),
    lengthM: bestSamples.length,
    closed: !!best.closed,
    jumpPlan,
    jumpBest,
    ...shape,
    ride: r.text,
    rideOk: r.ok,
    rideStats: r.stats,
    loopsDrawn: findLineCrossings(line, !!best.closed).length,
    loopsV: els.loops.filter((l) => l.vertical).length,
    loopsFlat: els.loops.filter((l) => !l.vertical).length,
    loopRadii,
    invInLoop, invInFlat, invHairpin, invOther, invShapes,
    accepted,
    // Kreuzungen auf gleicher Höhe (wie die Fahrt sie zählt): Zahl und je Stelle die Bogenlängen, der Abstand auf der
    // Bahn (klein = Schleife des Strichs selbst) und der Höhenunterschied
    crossings: findCrossings(bestSamples).map((c) => {
      // Strich 2: die Linienpunkte (1 m) an beiden Stellen, über die Bildlage der Bahnprobe gesucht (die Bogenlänge der
      // Bahn weicht vom Linienindex ab): war die Linie dort getrennt (dzLine) und galt die Regel (near)?
      const lp = s2 ? (s2 as unknown as { pts: Array<{ p: StagePoint; z: number; near: boolean }> }).pts : null;
      const sampleAt = (sv: number) => { let k = 0; while (k + 1 < bestSamples.count && bestSamples.s[k + 1] < sv) k++; return k; };
      const lineNear = (sv: number) => {
        if (!lp) return null;
        const k = sampleAt(sv);
        // in der Welt (x, Höhe, Tiefe) suchen: im Bild liegen beide Stränge an der Kreuzung aufeinander
        const wx = bestSamples.x[k];
        const wy = bestSamples.y[k];
        const wz = bestSamples.z[k] * LANE_DEPTH;
        let bi = -1;
        let bd = Infinity;
        for (let i = 0; i < lp.length; i++) {
          const w = rayToWorld(lp[i].p, lp[i].z / LANE_DEPTH);
          const d = Math.hypot(w.x - wx, w.y - wy, lp[i].z - wz);
          if (d < bd) { bd = d; bi = i; }
        }
        return bi >= 0 ? { q: lp[bi], i: bi, d: bd } : null;
      };
      const a = lineNear(c.s1);
      const b = lineNear(c.s2);
      return { s1: +c.s1.toFixed(1), s2: +c.s2.toFixed(1), along: +(c.s2 - c.s1).toFixed(1), dy: +Math.abs(c.y1 - c.y2).toFixed(2), zTrack: +(c.z * LANE_DEPTH).toFixed(2), z1Line: a ? +a.q.z.toFixed(2) : NaN, z2Line: b ? +b.q.z.toFixed(2) : NaN, dzLine: a && b ? +(b.q.z - a.q.z).toFixed(2) : NaN, near1: a?.q.near ?? null, near2: b?.q.near ?? null, i1: a?.i ?? -1, i2: b?.i ?? -1, dPick: a && b ? +Math.max(a.d, b.d).toFixed(2) : NaN };
    }),
  };
  return result;
}

// ------------------------------------------------------------------ Ausgabe

const results: StrokeResult[] = [];
recs.forEach((rec, k) => {
  const r = replay(rec, k);
  results.push(r);
  const pvs = r.previews;
  const msAll = pvs.map((p) => p.ms);
  const last = pvs[pvs.length - 1];
  const rel = r.release;
  const dev = pvs.flatMap((p) => p.devAll);
  const devT = pvs.flatMap((p) => p.devTouched);
  const devF = pvs.flatMap((p) => p.devFree);
  const mv = pvs.flatMap((p) => p.movePx);
  console.log(
    `#${k + 1} ${r.at.slice(5, 19).replace('T', ' ')} ${r.zone ?? `Level ${rec.level}`}${r.field ? ' ' + r.field : ''} ${r.device} zoom ${f1(r.zoom)} fov ${r.fov ?? '–'} · ${r.points} Punkte, ${f1(r.seconds)} s, ${Math.round(r.drawnM)} m Linie, Kamera ${f1(r.camMove)} m, Finger ${Math.round(r.fingerPx)} px/s` +
      `\n   Vorschau: ${pvs.length}×, ms Median ${f1(q(msAll, 0.5))}, max ${f1(mx(msAll))}${last ? ` (letzte: ${last.n} Pkt ${f1(last.ms)} ms; Abfragen ${f1(sumCounters(last.calls))} ms: depthAt ${f1(last.calls.depthAt.ms)}/${last.calls.depthAt.n}, groundAt ${f1(last.calls.groundAt.ms)}, free ${f1(last.calls.free.ms)}/${last.calls.free.n}, solid ${f1(last.calls.solid.ms)}/${last.calls.solid.n}, floor ${f1(last.calls.floor.ms)}/${last.calls.floor.n}; Linie ${f1(last.prepareMs)}, Kreuzungen ${f1(last.crossingsMs)}, Abtastung ${f1(last.sampleMs)}, Mesh ${f1(last.meshMs)}, Stats ${f1(last.statsMs)} ms)` : ''}` +
      `\n   Ablenkung im Bild: Median ${f1(q(dev, 0.5))} px, 90 % ${f1(q(dev, 0.9))}, max ${f1(mx(dev))} (nahe Festem ${f1(q(devT, 0.5))}/${f1(q(devT, 0.9))} px bei ${devT.length} Pkt, frei ${f1(q(devF, 0.5))}/${f1(q(devF, 0.9))} px); Bewegung gezeigter Bahn je Vorschau: 90 % ${f1(q(mv, 0.9))} px, max ${f1(mx(mv))} px` +
      (rel
        ? `\n   Loslassen: Plan ${f1(rel.planMs)} ms (Abfragen ${f1(sumCounters(rel.planCalls))}), Probefahrten ${Math.round(rel.refineMs)} ms (${rel.refineSteps} Schritte, ${rel.repaired} Hebel), Mesh ${f1(rel.meshMs)}, Stützen ${f1(rel.supportsMs)} ms (${rel.supports}, schwebend ${rel.floating}) · ${rel.nodes} Knoten, ${Math.round(rel.lengthM)} m, ${rel.closed ? 'geschlossen' : 'offen'}` +
          `\n   Sprung Vorschau→Plan: Bild Median ${f1(rel.jumpPlan.px50)} px, 90 % ${f1(rel.jumpPlan.px90)}, max ${f1(rel.jumpPlan.pxMax)} (weit vor der Spitze max ${f1(rel.jumpPlan.pxMaxFar)}); Welt max ${f1(rel.jumpPlan.mMax)} m; Tiefe max ${f1(rel.jumpPlan.zMax)} m (weit vor der Spitze ${f1(rel.jumpPlan.zMaxFar)}); Roll max ${f1(rel.jumpPlan.rollMax)}°` +
          `\n   Sprung Vorschau→nach Probefahrten: Bild 90 % ${f1(rel.jumpBest.px90)}, max ${f1(rel.jumpBest.pxMax)} px; Tiefe max ${f1(rel.jumpBest.zMax)} m; Roll max ${f1(rel.jumpBest.rollMax)}°` +
          `\n   Bahn: Knicke ${rel.knicke}, Rollrate 90 % ${f1(rel.rollRate)} °/m, ${Math.round(rel.rollPer100)}° je 100 m, Tiefenspanne ${f1(rel.depthSpan)} m, Tiefenumkehr ${rel.depthFlips}× · Fahrt: ${rel.ride}${rel.accepted.length ? ` · hingenommen: ${rel.accepted.join(', ')}` : ''}`
        : '\n   keine Bahn'),
  );
});

// Zusammenfassung
const allPv = results.flatMap((r) => r.previews);
const byLen = new Map<number, number[]>();
for (const p of allPv) {
  const b = Math.floor(p.lineM / 100) * 100;
  byLen.set(b, [...(byLen.get(b) ?? []), p.ms]);
}
console.log(`\n== Zusammenfassung über ${results.length} Striche (${allPv.length} Vorschauen) ==`);
console.log('Vorschau-Dauer nach Linienlänge (ms: Median / 90 % / max; Anteil Abfragen Ebenen+Feld; Mesh):');
for (const [b, ms] of [...byLen.entries()].sort((a, c) => a[0] - c[0])) {
  const rows = allPv.filter((p) => Math.floor(p.lineM / 100) * 100 === b);
  const calls = rows.map((p) => sumCounters(p.calls));
  const mesh = rows.map((p) => p.meshMs);
  const solve = rows.map((p) => p.ms - sumCounters(p.calls) - p.prepareMs - p.crossingsMs);
  console.log(`  ${String(b).padStart(4)}–${b + 99} m: ${f1(q(ms, 0.5)).padStart(6)} / ${f1(q(ms, 0.9)).padStart(6)} / ${f1(mx(ms)).padStart(6)}  Abfragen ${f1(q(calls, 0.5))} ms (${Math.round((100 * mean(calls)) / Math.max(1e-9, mean(ms)))} %), Linie ${f1(q(rows.map((p) => p.prepareMs), 0.5))}, Kreuzungen ${f1(q(rows.map((p) => p.crossingsMs), 0.5))}, Löser-Rest ${f1(q(solve, 0.5))}, Mesh ${f1(q(mesh, 0.5))}, Stats ${f1(q(rows.map((p) => p.statsMs), 0.5))}  (${rows.length})`);
}
const rels = results.map((r) => r.release).filter((r): r is NonNullable<StrokeResult['release']> => !!r);
if (rels.length) {
  console.log(`Loslassen: Plan Median ${f1(q(rels.map((r) => r.planMs), 0.5))} ms (max ${f1(Math.max(...rels.map((r) => r.planMs)))}), Probefahrten Median ${Math.round(q(rels.map((r) => r.refineMs), 0.5))} ms (max ${Math.round(Math.max(...rels.map((r) => r.refineMs)))}), Stützen Median ${f1(q(rels.map((r) => r.supportsMs), 0.5))} ms`);
  console.log(`Sprung beim Loslassen (Vorschau→Plan): Bild 90 % Median ${f1(q(rels.map((r) => r.jumpPlan.px90), 0.5))} px, max-Median ${f1(q(rels.map((r) => r.jumpPlan.pxMax), 0.5))} px, größtes max ${f1(Math.max(...rels.map((r) => r.jumpPlan.pxMax)))} px; weit vor der Spitze max-Median ${f1(q(rels.map((r) => r.jumpPlan.pxMaxFar), 0.5))} px; Tiefe max-Median ${f1(q(rels.map((r) => r.jumpPlan.zMax), 0.5))} m; Roll max-Median ${f1(q(rels.map((r) => r.jumpPlan.rollMax), 0.5))}°`);
  console.log(`Sprung beim Loslassen (Vorschau→nach Probefahrten): Bild max-Median ${f1(q(rels.map((r) => r.jumpBest.pxMax), 0.5))} px, größtes ${f1(Math.max(...rels.map((r) => r.jumpBest.pxMax)))} px; Tiefe max-Median ${f1(q(rels.map((r) => r.jumpBest.zMax), 0.5))} m; Roll max-Median ${f1(q(rels.map((r) => r.jumpBest.rollMax), 0.5))}°; nachgebessert bei ${rels.filter((r) => r.repaired > 0).length} von ${rels.length}`);
  const dev = allPv.flatMap((p) => p.devAll);
  const devT = allPv.flatMap((p) => p.devTouched);
  const devF = allPv.flatMap((p) => p.devFree);
  const far = allPv.flatMap((p) => p.devTipFar);
  const mv = allPv.flatMap((p) => p.movePx);
  const mz = allPv.flatMap((p) => p.moveZ);
  console.log(`Ablenkung im Bild (alle Vorschau-Punkte): Median ${f1(q(dev, 0.5))} px, 90 % ${f1(q(dev, 0.9))}, 99 % ${f1(q(dev, 0.99))}; nahe Festem (${devT.length}): Median ${f1(q(devT, 0.5))}, 90 % ${f1(q(devT, 0.9))}; frei (${devF.length}): Median ${f1(q(devF, 0.5))}, 90 % ${f1(q(devF, 0.9))}; weiter als 15 m vor der Spitze: 90 % ${f1(q(far, 0.9))}`);
  console.log(`Bewegung schon gezeigter Bahn je Vorschau (Punkte älter als 15 m): Bild 90 % ${f1(q(mv, 0.9))} px, 99 % ${f1(q(mv, 0.99))}, max ${f1(mx(mv))}; Tiefe 90 % ${f2(q(mz, 0.9))} m, max ${f2(mx(mz))} m`);
  const tz = allPv.flatMap((p) => p.tailZ);
  const lag = allPv.map((p) => p.tipLagPx);
  console.log(`Vorläufiger Teil (letzte 15 m) je Vorschau: Tiefe Median ${f2(q(tz, 0.5))} m, 90 % ${f2(q(tz, 0.9))}, max ${f2(mx(tz))}; Rückstand des Bahnendes hinter dem Finger: Median ${f1(q(lag, 0.5))} px, 90 % ${f1(q(lag, 0.9))}, max ${f1(mx(lag))}`);
  console.log(`Bahn: Knicke je Strich Median ${q(rels.map((r) => r.knicke), 0.5)} (Summe ${rels.reduce((a, r) => a + r.knicke, 0)}), Rollrate 90 % Median ${f1(q(rels.map((r) => r.rollRate), 0.5))} °/m, Rollen je 100 m Median ${Math.round(q(rels.map((r) => r.rollPer100), 0.5))}°, Tiefenspanne Median ${f1(q(rels.map((r) => r.depthSpan), 0.5))} m, Tiefenumkehr je Strich Median ${q(rels.map((r) => r.depthFlips), 0.5)}; Fahrt geschafft ${rels.filter((r) => r.rideOk).length} von ${rels.length}; Stützen ${rels.reduce((a, r) => a + r.supports, 0)}, davon schwebend ${rels.reduce((a, r) => a + r.floating, 0)}`);
  const rs = rels.map((r) => r.rideStats);
  console.log(`Fahrt (${RIDE_TUNING.rules}, Antrieb ${RIDE_TUNING.driveSpeed} m/s): geschafft ${rels.filter((r) => r.rideOk).length} von ${rels.length}; Antrieb-Meter je Strich Median ${Math.round(q(rs.map((x) => x.driveM), 0.5))}, max ${Math.round(mx(rs.map((x) => x.driveM)))}, Striche mit Antrieb ${rs.filter((x) => x.driveM > 0).length}; kopfüber Summe ${rs.reduce((a, x) => a + x.inversions, 0)} bei gezeichneten Schleifen ${rels.reduce((a, r) => a + r.loopsDrawn, 0)}; Querkraft max Median ${f1(q(rs.map((x) => x.maxLatG), 0.5))} g, Zeitanteil über 1,5 g Median ${Math.round(100 * q(rs.map((x) => x.lat15), 0.5))} %, Schräglage am Anschlag Median ${Math.round(100 * q(rs.map((x) => x.bankCap), 0.5))} %; Fahrzeit Median ${Math.round(q(rs.map((x) => x.timeS), 0.5))} s`);
  const radii = rels.flatMap((r) => r.loopRadii);
  console.log(`Schleifen gezeichnet: Loopings ${rels.reduce((a, r) => a + r.loopsV, 0)} (Radius Median ${f1(q(radii, 0.5))} m, 10 % ${f1(q(radii, 0.1))} m, unter 4 m: ${radii.filter((v) => v < 4).length}), Bodenschleifen ${rels.reduce((a, r) => a + r.loopsFlat, 0)}; kopfüber nach Lage: im Looping ${rels.reduce((a, r) => a + r.invInLoop, 0)}, in Bodenschleife ${rels.reduce((a, r) => a + r.invInFlat, 0)}, an Kehre ${rels.reduce((a, r) => a + r.invHairpin, 0)}, sonst ${rels.reduce((a, r) => a + r.invOther, 0)}`);
  const withChain = rels.filter((r) => Number.isFinite(r.chainTop));
  console.log(`Strich 2 Schleifen: Loopings ${rels.reduce((a, r) => a + (r.s2Loops || 0), 0)} (aufgeweitet ${rels.reduce((a, r) => a + (r.s2LoopsWidened || 0), 0)}), Bodenschleifen ${rels.reduce((a, r) => a + (r.s2LoopsFlat || 0), 0)}; Kettenlinie: ${withChain.length} Striche mit Kette, Punkte darüber (nicht zu halten) Summe ${withChain.reduce((a, r) => a + (r.s2Capped || 0), 0)}, Striche über der Linie ${withChain.filter((r) => r.maxHeightM > r.chainTop + 0.6).length}, höchster Punkt über der Linie max ${f1(mx(withChain.map((r) => r.maxHeightM - r.chainTop)))} m`);
}
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(results.map((r) => ({ ...r, previews: r.previews.map((p) => ({ ...p, devAll: undefined, devTouched: undefined, devFree: undefined, devTipFar: undefined, moveZ: undefined, movePx: undefined, dev50: q(p.devAll, 0.5), dev90: q(p.devAll, 0.9), devMax: mx(p.devAll), move90: q(p.movePx, 0.9), moveMax: mx(p.movePx), tailZ: undefined, tail90: q(p.tailZ, 0.9), tailMax: mx(p.tailZ) })) })), null, 1));
  console.log(`\nJSON: ${JSON_OUT}`);
}
