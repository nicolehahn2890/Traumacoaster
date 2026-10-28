/**
 * Pinsel-Studie (28.10.2026): Prototyp „Strich 2“ hinter dem Schalter `&strich=2` (docs/PINSEL-STUDIE.md, Abschnitt 6).
 * Der heutige Pinsel (brushTrack.ts) bleibt unverändert; dieser Strich liest dieselben Ebenen-Abfragen (BrushOptions:
 * depthAt, groundAt, field), entscheidet aber anders:
 *
 *  - **Kausal mit kurzem Vorlauf:** Die Tiefe eines Linienpunkts wird gelöst, solange er höchstens FREEZE Meter hinter
 *    der Spitze liegt; danach ist sie fest und ändert sich nie mehr, weder bei der nächsten Vorschau noch beim Loslassen
 *    noch durch Probefahrten. Der Sprung beim Loslassen ist damit null, die Linie im Bild bleibt genau der Strich.
 *    Der Vorlauf wächst, solange der Strich steil ist (Florians „der schwarze Strich wird länger“): Ein steiles Stück
 *    ist erst Höhe oder Tiefe, wenn es sich erklärt hat, als Hügel (wieder flach, ohne Umkehr: die Tiefe läuft gerade von
 *    Fuß zu Fuß) oder als Kehre (die Bildrichtung in x kehrt um: ein Halbkreis durch die Tiefe, nach oben gezeichnet nach
 *    hinten). Erst dann friert das Stück ein.
 *  - **Konstante Arbeit je Vorschau:** Nur das freie Stück (FREEZE Meter plus BORDER feste Punkte als Rand) wird gelöst;
 *    die Abfragen an Ebenen und Freiraumfeld sind je Punkt gemerkt. Die Linie selbst wächst nur am Ende (Abtastung
 *    0,25 m, Gauß 0,5 m, 1-m-Punkte), was weiter als das Glättungsfenster zurückliegt, wird nicht neu gerechnet.
 *  - **Einfacher Löser:** min Σ w·(z − Ziel)² + λ·Σ(Δ²z)² + Σ wL·(Δz − ΔY/c)² an Wenden, mit Schranken aus dem Freiraum
 *    (Flächen der Ebenen) und aus Kreuzungen mit dem schon festen Teil, als kleines dichtes System (Cholesky) mit
 *    aktiver Menge. Steil Gezeichnetes ist Höhe (das Ziel zieht dort kaum), flach Gezeichnetes landet auf Kanten oder
 *    nimmt die Bodenhöhe der Ebenen; an einer Wende nimmt die Tiefe die Bildbewegung, damit die Bahn dort flach bleibt.
 *  - **Knoten ohne Fit:** alle NODE_STEP Linienpunkte ein Knoten mit Catmull-Rom-Tangenten, feste Knoten bleiben.
 *  - **Rundenschluss** nur als neuer Weg ab dem festen Ende (Dubins-Bögen aus brushTrack), der gezeichnete Teil bleibt.
 *
 * Platzhalter (nur im Bericht als Entwurf): Tunnel-Lippen, Höhlenmeter, Markierungen im Editor, Stützenvarianten,
 * Überzeichnen, Kreuzungs-Chips, Fels-Abschneiden (blockierte Punkte werden nur markiert).
 */
import type { Vec3 } from '@/core/math3';
import type { FreeLanes } from '@/zone/field';
import { dubinsPaths, type BrushOptions, type BrushPreview, type Landing } from './brushTrack';

/** Vorschau von Strich 2: wie BrushPreview, dazu die Linie (1-m-Punkte, Bühne) je Tiefe */
export type Strich2Preview = BrushPreview & { line: StagePoint[] };
import { createNode, emptyPath, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, TILT_TAN, mixPoint, rayToWorld, type StagePoint } from './stage';

/** so weit (m) hinter der Spitze ist die Tiefe noch frei; davor fest */
export const FREEZE = 12;
/** so viele feste Punkte nimmt der Löser als Rand mit (Lage, Neigung und Krümmung schließen stetig an) */
const BORDER = 3;
const STEP = 1;
const FINE = 0.25;
const SIGMA = 0.5;
/** Glättungsfenster der Linie in feinen Punkten (3σ) */
const SMOOTH_R = Math.ceil((3 * SIGMA) / FINE);
/** alle so viele Linienpunkte ein Knoten */
const NODE_STEP = 3;
/** Grenzwellenlänge (m) der Tiefenglättung; kürzer als beim heutigen Pinsel (40 m), weil die Ebenen Terrassen von 10–20 m haben */
const CUTOFF = 20;
const LAMBDA = (CUTOFF / (2 * Math.PI)) ** 4;
/** Strafe auf die Neigung der Tiefe (je Meter), damit Stufen der Ebenen zu Rampen unter MAX_SLOPE werden */
const MU = 40;
/** steil: Gewicht der Wunschtiefe unter dieser Schwelle (rund 25°) */
const STEEP_LIMIT = 0.5;
/** so viele flache Punkte nach einem steilen Lauf erklären ihn (Hügel); so viele klare Punkte nach dem Scheitel eine Kehre */
const RESOLVE_RUN = 3;
/** Kehre: Tiefe mindestens PASS_SIDE + 0,4 (die Schenkel müssen aneinander vorbei), höchstens drei Spuren, sonst die doppelte Weite des U im Bild */
const KEHRE_MIN = PASS_SIDE_CONST();
const KEHRE_MAX_LANES = 3;
function PASS_SIDE_CONST(): number {
  return 2.6;
}
/** längster Vorlauf (Punkte): ein steiles Stück, das sich so lange nicht erklärt, friert trotzdem ein (als Höhe) */
const FREEZE_MAX = 90;
/** Gewicht der Wunschtiefe: flach gelandet, in einer Höhle, Boden der Ebenen; steil fast nichts */
const W_LAND = 2;
const W_CAVE = 4;
const STEEP_FROM = (15 * Math.PI) / 180;
const STEEP_TO = (40 * Math.PI) / 180;
const STEEP_W = 0.03;
/** flacher als das (Bildhöhe je Bildbreite) landet der Strich auf einer Kante */
const LAND_SLOPE = 0.25;
/** so viele Meter am Stück auf derselben Kante, bis die Landung voll zieht */
const LAND_RUN = 4;
/** Wenden: Gewicht, mit dem die Tiefe am Scheitel die Bildbewegung nimmt, und wie weit (Punkte) die Richtung gesucht wird */
const W_LEVEL = 400;
const TURN_SPAN = 12;
/** Kreuzungsregel wie in brushTrack: seitlich mindestens PASS_SIDE auseinander oder in der Höhe PASS_OVER */
const PASS_SIDE = 2.2;
const PASS_OVER = 3.5;
const NEIGHBOR = 8;
/** an der Station bleibt die Tiefe so lange (m) die der Station */
const STATION_CALM = 12;
/** Schranken-Feder (Vielfaches der größten Diagonale) */
const PIN_K = 1e3;
/** Rundenschluss: Bogenradien (m), gerade Einfahrt (m) und höchste Drehung (Grad) */
const CLOSE_RADII = [6, 10, 16];
const CLOSE_ENTRY = 3;
const CLOSE_TURN = 240;

type Pose = { X: number; Y: number; th: number };

export interface Strich2Result {
  path: TrackPath;
  line: StagePoint[];
  z: Float64Array;
  pts: Vec3[];
  closed: boolean;
  /** Läufe blockierter Linienpunkte (kein freier Abschnitt, der an den vorigen anschließt) */
  rock: Array<[number, number]>;
}

export interface Strich2Stats {
  /** Linienpunkte gesamt und davon fest */
  n: number;
  frozen: number;
  /** Dauer der letzten Vorschau (ms) und darin die Abfragen an Ebenen und Feld */
  ms: number;
  queryMs: number;
}

/** je Linienpunkt gemerkt: Abfragen und Lösung */
interface Pt {
  p: StagePoint;
  land: Landing | number | null;
  ground: number;
  lanes: FreeLanes | null;
  /** 1 flach gezeichnet (Landung erlaubt), Steilheit als Gewicht */
  flat: boolean;
  wh: number;
  /** Lauf gelandeter Punkte auf derselben Kante bis hierher (Meter) */
  run: number;
  /** Richtung der Linie in x (−1 … 1) */
  dirX: number;
  z: number;
  frozen: boolean;
  blocked: boolean;
  cave: boolean;
  /** Weltpunkt mit Hub über die tragende Fläche (gilt für die Tiefe wpLane) */
  wp: Vec3 | null;
  wpLane: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** kleines dichtes symmetrisches System lösen (Cholesky mit etwas Regularisierung) */
function solveSym(A: Float64Array, k: number, b: Float64Array): Float64Array<ArrayBuffer> {
  let maxDiag = 0;
  for (let i = 0; i < k; i++) maxDiag = Math.max(maxDiag, A[i * k + i]);
  const eps = 1e-10 * maxDiag + 1e-300;
  const L = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * k + j];
      for (let m = 0; m < j; m++) s -= L[i * k + m] * L[j * k + m];
      if (i === j) L[i * k + i] = Math.sqrt(Math.max(s, 0) + eps);
      else L[i * k + j] = s / L[j * k + j];
    }
  }
  const x = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    let s = b[i];
    for (let m = 0; m < i; m++) s -= L[i * k + m] * x[m];
    x[i] = s / L[i * k + i];
  }
  for (let i = k - 1; i >= 0; i--) {
    let s = x[i];
    for (let m = i + 1; m < k; m++) s -= L[m * k + i] * x[m];
    x[i] = s / L[i * k + i];
  }
  return x;
}

export class Strich2 {
  /** Pinselpunkte, wie zuletzt übergeben (nach dem Anschluss an die alte Bahn verschoben) und unverschoben zum Vergleich */
  private raw: StagePoint[] = [];
  private rawIn: StagePoint[] = [];
  private rawCum: number[] = [0];
  /** Anschluss an die alte Bahn: Versatz des ersten Pinselpunkts, über BLEND m abgebaut */
  private blend: { dx: number; dy: number } | null = null;
  /** feine Abtastung (FINE m) des Pinsels, nur wachsend; Cursor in raw */
  private fine: StagePoint[] = [];
  private fineNext = 0;
  private fineSeg = 0;
  /** geglättete feine Punkte; die ersten smoothFinal sind endgültig */
  private smooth: StagePoint[] = [];
  private smoothFinal = 0;
  private smoothCum: number[] = [];
  /** 1-m-Linie: Punkte, davon die ersten lineFinal endgültig; baseLen Punkte der alten Bahn davor */
  private pts: Pt[] = [];
  private lineFinal = 0;
  private readonly baseLen: number;
  /** Knoten je Linienpunkt-Index (alle NODE_STEP), feste gemerkt */
  private nodes: TrackNode[] = [];
  private nodesFrozen = 0;
  /** Seite je Kreuzung (Schlüssel: Bündel des späteren und des früheren Punkts), bleibt */
  private sides = new Map<string, number>();
  /** feste Punkte nach x-Zelle für die Kreuzungssuche */
  private xCells = new Map<number, number[]>();
  private readonly startZ: number;
  private readonly tsX: number;
  stats: Strich2Stats = { n: 0, frozen: 0, ms: 0, queryMs: 0 };
  private queryMs = 0;

  /**
   * base: alte Bahn (Linie mit Tiefe je Punkt), an die der Strich anschließt; startZ: Tiefe am Anfang eines neuen
   * Strichs (Landung oder Bodenhöhe der Ebenen); closeSnap: so nah muss das Ende dem Anfang kommen, damit die Runde
   * schließt
   */
  constructor(
    private readonly options: () => BrushOptions,
    base: { line: StagePoint[]; z: Float64Array } | null,
    startZ: number,
    private readonly closeSnap: number,
  ) {
    if (base && base.line.length >= 2) {
      base.line.forEach((p, i) => this.pts.push(this.newPt({ ...p }, base.z[i])));
      for (const q of this.pts) {
        q.frozen = true;
        this.indexX(this.pts.indexOf(q));
      }
      this.baseLen = this.pts.length;
      this.lineFinal = this.baseLen;
      this.startZ = base.z[0];
      const a = base.line[0];
      const b = base.line[Math.min(base.line.length - 1, 4)];
      this.tsX = Math.sign(b.X - a.X) || 1;
    } else {
      this.baseLen = 0;
      this.startZ = Number.isFinite(startZ) ? startZ : 0;
      this.tsX = 0;
    }
  }

  private newPt(p: StagePoint, z: number): Pt {
    return { p, land: null, ground: NaN, lanes: null, flat: true, wh: 1, run: 0, dirX: 0, z, frozen: false, blocked: false, cave: false, wp: null, wpLane: NaN };
  }

  private indexX(i: number): void {
    const c = Math.floor(this.pts[i].p.X);
    const l = this.xCells.get(c);
    if (l) l.push(i);
    else this.xCells.set(c, [i]);
  }

  // ------------------------------------------------------------------ Linie (nur wachsend)

  /** Pinselpunkte übernehmen: gewachsen am Ende, oder gekürzt (Zurückziehen): dann fällt alles dahinter weg */
  private feed(points: StagePoint[]): void {
    let common = 0;
    while (common < this.rawIn.length && common < points.length && this.rawIn[common].X === points[common].X && this.rawIn[common].Y === points[common].Y) common++;
    if (common < this.raw.length) this.truncateRaw(common);
    if (!this.raw.length && points.length) {
      const base = this.baseLen ? this.pts[this.baseLen - 1].p : null;
      this.blend = base ? { dx: base.X - points[0].X, dy: base.Y - points[0].Y } : null;
    }
    for (let i = this.raw.length; i < points.length; i++) {
      const b = this.blendAt(i, points);
      const p: StagePoint = { ...points[i], X: points[i].X + b.dx, Y: points[i].Y + b.dy };
      if (i > 0) this.rawCum.push(this.rawCum[i - 1] + Math.hypot(p.X - this.raw[i - 1].X, p.Y - this.raw[i - 1].Y));
      this.raw.push(p);
      this.rawIn.push({ X: points[i].X, Y: points[i].Y });
    }
    this.extendFine();
    this.extendSmooth();
    this.extendLine();
  }

  /** Versatz des Anschlusses für Pinselpunkt i (über 5 m Pinsellinie abgebaut) */
  private blendAt(i: number, points: StagePoint[] = this.raw): { dx: number; dy: number } {
    if (!this.blend) return { dx: 0, dy: 0 };
    let cum = 0;
    if (i < this.rawCum.length) cum = this.rawCum[i];
    else {
      cum = this.rawCum[this.rawCum.length - 1];
      for (let k = this.rawCum.length; k <= i && k < points.length; k++) cum += Math.hypot(points[k].X - points[k - 1].X, points[k].Y - points[k - 1].Y);
    }
    const f = Math.max(0, 1 - cum / 5);
    return { dx: this.blend.dx * f, dy: this.blend.dy * f };
  }

  /** Zurückziehen: alles ab Pinselpunkt common verwerfen (auch feste Linienpunkte, die daraus entstanden) */
  private truncateRaw(common: number): void {
    this.raw.length = common;
    this.rawIn.length = common;
    this.rawCum.length = Math.max(1, common);
    // feine Punkte bis zur Länge des verbleibenden Pinsels
    const len = common ? this.rawCum[common - 1] : 0;
    let fineKeep = 0;
    while (fineKeep < this.fine.length && fineKeep * FINE <= len) fineKeep++;
    this.fine.length = fineKeep;
    this.fineNext = fineKeep;
    this.fineSeg = 0;
    // Cursor neu an die passende Stelle setzen
    const target = fineKeep * FINE;
    while (this.fineSeg + 1 < this.raw.length && this.rawCum[this.fineSeg + 1] < target) this.fineSeg++;
    const sKeep = Math.max(0, Math.min(this.smooth.length, fineKeep - SMOOTH_R));
    this.smooth.length = sKeep;
    this.smoothCum.length = sKeep;
    this.smoothFinal = Math.min(this.smoothFinal, Math.max(0, sKeep - SMOOTH_R));
    const lineLen = sKeep ? this.smoothCum[sKeep - 1] : 0;
    let keep = this.baseLen;
    while (keep < this.pts.length && (keep - this.baseLen) * STEP <= lineLen - 2 * STEP) keep++;
    keep = Math.max(this.baseLen, Math.min(keep, this.pts.length));
    this.dropFrom(keep);
  }

  /** Linienpunkte ab from verwerfen (fest oder nicht) */
  private dropFrom(from: number): void {
    if (from >= this.pts.length) return;
    this.pts.length = from;
    this.lineFinal = Math.min(this.lineFinal, from);
    this.xCells = new Map();
    for (let i = 0; i < from; i++) if (this.pts[i].frozen) this.indexX(i);
    const nodesKeep = Math.max(0, Math.floor((from - 1) / NODE_STEP) - 1);
    this.nodes.length = Math.min(this.nodes.length, nodesKeep);
    this.nodesFrozen = Math.min(this.nodesFrozen, nodesKeep);
  }

  /** feine Punkte an Vielfachen von FINE entlang des Pinsels nachziehen (der Cursor läuft nur vorwärts) */
  private extendFine(): void {
    const n = this.raw.length;
    if (n < 2) return;
    const total = this.rawCum[n - 1];
    while (this.fineNext * FINE <= total) {
      const s = this.fineNext * FINE;
      while (this.fineSeg + 1 < n - 1 && this.rawCum[this.fineSeg + 1] <= s) this.fineSeg++;
      const a = this.raw[this.fineSeg];
      const b = this.raw[this.fineSeg + 1];
      const d = this.rawCum[this.fineSeg + 1] - this.rawCum[this.fineSeg];
      const f = d > 1e-9 ? clamp((s - this.rawCum[this.fineSeg]) / d, 0, 1) : 0;
      this.fine.push(mixPoint(a, b, f));
      this.fineNext++;
    }
  }

  /** Gauß über ±SMOOTH_R feine Punkte; endgültig, sobald das Fenster ganz im Vorrat liegt */
  private extendSmooth(): void {
    const n = this.fine.length;
    const from = this.smoothFinal;
    for (let i = from; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      let scx = 0;
      let scy = 0;
      let sc = 0;
      for (let k = -SMOOTH_R; k <= SMOOTH_R; k++) {
        const q = this.fine[clamp(i + k, 0, n - 1)];
        const w = Math.exp(-((k * FINE) ** 2) / (2 * SIGMA * SIGMA));
        sx += q.X * w;
        sy += q.Y * w;
        sw += w;
        if (q.cx !== undefined && q.cy !== undefined) {
          scx += q.cx * w;
          scy += q.cy * w;
          sc += w;
        }
      }
      const out: StagePoint = i === 0 ? { ...this.fine[0] } : { X: sx / sw, Y: sy / sw };
      if (i > 0 && sc > 0) {
        out.cx = scx / sc;
        out.cy = scy / sc;
      }
      this.smooth[i] = out;
      this.smoothCum[i] = i ? this.smoothCum[i - 1] + Math.hypot(out.X - this.smooth[i - 1].X, out.Y - this.smooth[i - 1].Y) : 0;
    }
    this.smooth.length = n;
    this.smoothCum.length = n;
    this.smoothFinal = Math.max(0, n - SMOOTH_R);
  }

  /** 1-m-Punkte an Vielfachen von STEP entlang der geglätteten Linie; endgültig bis zur Länge des endgültigen Teils */
  private extendLine(): void {
    const n = this.smooth.length;
    if (n < 2) return;
    const total = this.smoothCum[n - 1];
    const finalLen = this.smoothFinal ? this.smoothCum[this.smoothFinal - 1] : 0;
    // vorläufige Linienpunkte neu, endgültige bleiben
    const keep = this.lineFinal;
    this.pts.length = Math.max(this.baseLen, keep);
    let seg = 0;
    const first = this.baseLen === 0 ? 0 : 1;
    for (let k = this.pts.length - this.baseLen + first; ; k++) {
      const s = k * STEP;
      if (s > total) break;
      while (seg + 1 < n - 1 && this.smoothCum[seg + 1] <= s) seg++;
      const d = this.smoothCum[seg + 1] - this.smoothCum[seg];
      const f = d > 1e-9 ? clamp((s - this.smoothCum[seg]) / d, 0, 1) : 0;
      const p = mixPoint(this.smooth[seg], this.smooth[seg + 1], f);
      const zPrev = this.pts.length ? this.pts[this.pts.length - 1].z : this.startZ;
      this.pts.push(this.newPt(p, zPrev));
      if (s <= finalLen) this.lineFinal = this.pts.length;
    }
    this.stats.n = this.pts.length;
  }

  // ------------------------------------------------------------------ Abfragen und Ziele

  /** Ebenen und Feld je freiem Punkt lesen (feste Punkte behalten ihre Werte) */
  private query(o: BrushOptions, from: number): void {
    const n = this.pts.length;
    const t0 = performance.now();
    for (let i = Math.max(from, this.baseLen); i < n; i++) {
      const q = this.pts[i];
      if (q.frozen) continue;
      q.land = o.depthAt ? o.depthAt(q.p) : null;
      q.ground = o.groundAt ? o.groundAt(q.p) : NaN;
      q.lanes = o.field ? o.field.free(q.p) : null;
    }
    this.queryMs += performance.now() - t0;
    for (let i = Math.max(from, this.baseLen, 1); i < n; i++) {
      const q = this.pts[i];
      if (q.frozen) continue;
      const a = this.pts[Math.max(0, i - 2)].p;
      const b = this.pts[Math.min(n - 1, i + 2)].p;
      const dX = Math.abs(b.X - a.X);
      const dY = Math.abs(b.Y - a.Y);
      q.flat = dY <= LAND_SLOPE * dX;
      const angle = Math.atan2(dY, dX + 1e-9);
      q.wh = Math.max(STEEP_W, Math.min(1, (STEEP_TO - angle) / (STEEP_TO - STEEP_FROM)));
      const a1 = this.pts[Math.max(0, i - 1)].p;
      const b1 = this.pts[Math.min(n - 1, i + 1)].p;
      q.dirX = (b1.X - a1.X) / (Math.hypot(b1.X - a1.X, b1.Y - a1.Y) || 1);
      const prev = this.pts[i - 1];
      const id = q.land !== null && typeof q.land === 'object' ? q.land.id : NaN;
      const prevId = prev.land !== null && typeof prev.land === 'object' ? prev.land.id : NaN;
      q.run = Number.isNaN(id) ? 0 : id === prevId ? prev.run + STEP : STEP;
    }
  }

  /** Wunschtiefe und Gewicht eines Punkts (ohne Schranken) */
  private target(q: Pt, i: number): { t: number; w: number } {
    if (i < this.baseLen) return { t: q.z, w: 1 };
    // Station: die ersten Meter eines neuen Strichs bleiben auf der Starttiefe
    if (!this.baseLen && i * STEP < STATION_CALM) return { t: this.startZ, w: 50 };
    const l = q.land;
    if (l !== null) {
      const z = typeof l === 'number' ? l : l.z;
      const cave = typeof l === 'object' && !!l.cave;
      if (cave) return { t: z, w: W_CAVE };
      if (q.flat) return { t: z, w: W_LAND * Math.min(1, q.run / LAND_RUN) + STEEP_W };
      return { t: z, w: STEEP_W };
    }
    if (Number.isFinite(q.ground)) return { t: q.ground, w: q.wh };
    return { t: q.z, w: 0 };
  }

  /**
   * Schranken aus dem Freiraum: der Abschnitt, der an den des Vorgängers anschließt und dem Ziel am nächsten liegt
   * (mit allen berührenden Nachbarn als Spielraum); keiner → blockiert, der vorige bleibt
   */
  private bounds(q: Pt, prev: Pt | null, t: number, zMin: number, zMax: number): { lo: number; hi: number; mid: number; cave: boolean; blocked: boolean } {
    const l = q.lanes;
    if (!l || !l.intervals.length) return { lo: zMin, hi: zMax, mid: NaN, cave: false, blocked: false };
    const iv = l.intervals.map((v) => ({ a: v.a * LANE_DEPTH, b: v.b * LANE_DEPTH, cave: !!v.cave && v.attract }));
    const zPrev = prev ? prev.z : t;
    const touch = (a: { a: number; b: number }, b: { a: number; b: number }) => Math.min(a.b, b.b) - Math.max(a.a, b.a) >= -0.06 * LANE_DEPTH;
    const prevIv = { a: zPrev - 0.03 * LANE_DEPTH, b: zPrev + 0.03 * LANE_DEPTH };
    const dist = (v: { a: number; b: number }, z: number) => (z < v.a ? v.a - z : z > v.b ? z - v.b : 0);
    let best = -1;
    let bestCost = Infinity;
    for (let k = 0; k < iv.length; k++) {
      if (!touch(iv[k], prevIv)) continue;
      const c = dist(iv[k], t) - (iv[k].cave ? 0.3 * LANE_DEPTH : 0);
      if (c < bestCost) {
        bestCost = c;
        best = k;
      }
    }
    if (best < 0) {
      // nichts schließt an: blockiert; die Tiefe bleibt, wo sie war
      return { lo: zPrev, hi: zPrev, mid: NaN, cave: false, blocked: true };
    }
    let lo = iv[best].a;
    let hi = iv[best].b;
    for (let k = best - 1; k >= 0 && touch(iv[k], iv[k + 1]); k--) lo = Math.min(lo, iv[k].a);
    for (let k = best + 1; k < iv.length && touch(iv[k - 1], iv[k]); k++) hi = Math.max(hi, iv[k].b);
    return { lo: Math.max(zMin, lo), hi: Math.min(zMax, hi), mid: (iv[best].a + iv[best].b) / 2, cave: iv[best].cave, blocked: false };
  }

  /**
   * Kreuzung mit einem früheren Punkt (fest, oder frei mit der Tiefe der letzten Lösung): verbotener Tiefenunterschied,
   * die Seite bleibt je Kreuzung
   */
  private crossBounds(i: number, t: number, lo: number, hi: number, closing = false): { lo: number; hi: number } {
    const q = this.pts[i];
    const n = this.pts.length;
    const cx = Math.floor(q.p.X);
    for (let c = cx - 1; c <= cx + 1; c++) {
      const list = this.xCells.get(c);
      if (!list) continue;
      for (const j of list) {
        if (j > i - NEIGHBOR) continue;
        // Rundenschluss: die Naht an der Station ist keine Kreuzung
        if (closing && n - i + j < NEIGHBOR + 3) continue;
        const r = this.pts[j];
        const dX = q.p.X - r.p.X;
        if (Math.abs(dX) >= PASS_SIDE) continue;
        const dY = q.p.Y - r.p.Y;
        const w = Math.sqrt(PASS_SIDE * PASS_SIDE - dX * dX);
        const fLo = Math.max(-w, (dY - PASS_OVER) / TILT_TAN);
        const fHi = Math.min(w, (dY + PASS_OVER) / TILT_TAN);
        if (fLo >= fHi) continue;
        const key = `${Math.floor(i / 12)}:${Math.floor(j / 12)}`;
        let side = this.sides.get(key) ?? 0;
        if (!side) {
          // nahe am Ziel; sonst später Gezeichnetes vorne
          side = t - r.z >= (fLo + fHi) / 2 ? 1 : -1;
          const fits = (s: number) => (s > 0 ? hi >= r.z + fHi : lo <= r.z + fLo);
          if (!fits(side) && fits(-side)) side = -side;
          this.sides.set(key, side);
        }
        if (side > 0) lo = Math.max(lo, r.z + fHi);
        else hi = Math.min(hi, r.z + fLo);
      }
    }
    return { lo, hi };
  }

  // ------------------------------------------------------------------ Formen (Hügel, Kehren) und Vorlauf

  /**
   * Steile Läufe ab from: je Lauf, ob er sich erklärt hat (Hügel: danach RESOLVE_RUN flache Punkte ohne Umkehr in x;
   * Kehre: die klare Richtung in x kehrt um und hält RESOLVE_RUN Punkte) und seine Füße a (letzter flacher Punkt davor)
   * und b (erster flacher Punkt danach, −1 offen)
   */
  private shapes(from: number): Array<{ a: number; b: number; kind: 'hill' | 'kehre' | 'open'; apex: number }> {
    const n = this.pts.length;
    const steep = (i: number) => this.pts[i].wh < STEEP_LIMIT;
    const clear = (i: number) => (Math.abs(this.pts[i].dirX) > 0.4 ? Math.sign(this.pts[i].dirX) : 0);
    const out: Array<{ a: number; b: number; kind: 'hill' | 'kehre' | 'open'; apex: number }> = [];
    for (let i = Math.max(1, from); i < n; i++) {
      if (!steep(i)) continue;
      const a = i - 1;
      let e = i;
      while (e + 1 < n && steep(e + 1)) e++;
      // klare Richtung vor dem Lauf und die erste danach
      let before = 0;
      for (let s = a; s >= Math.max(0, a - TURN_SPAN) && !before; s--) before = clear(s);
      let after = 0;
      let afterAt = -1;
      for (let s = e + 1; s < n && !after; s++) {
        after = clear(s);
        afterAt = s;
      }
      let kind: 'hill' | 'kehre' | 'open' = 'open';
      let b = -1;
      if (before && after && before * after < 0) {
        // Kehre: erklärt, sobald die Gegenrichtung RESOLVE_RUN Punkte hält
        let hold = 0;
        for (let s = afterAt; s < n && clear(s) === after; s++) hold++;
        if (hold >= RESOLVE_RUN) {
          kind = 'kehre';
          b = afterAt + RESOLVE_RUN - 1;
        }
      } else if (e + RESOLVE_RUN < n) {
        let flat = 0;
        for (let s = e + 1; s < n && !steep(s); s++) flat++;
        if (flat >= RESOLVE_RUN) {
          kind = 'hill';
          b = e + 1;
        }
      }
      // Scheitel: der Punkt mit der kleinsten |Richtung in x| zwischen den Füßen
      let apex = e;
      let best = Infinity;
      for (let s = a; s <= (b < 0 ? e : b); s++) {
        const v = Math.abs(this.pts[s].dirX);
        if (v < best) {
          best = v;
          apex = s;
        }
      }
      out.push({ a, b, kind, apex });
      i = b < 0 ? e : b;
    }
    return out;
  }

  /** bis zu welchem Index (ausschließlich) eingefroren werden darf: FREEZE hinter der Spitze, aber nie in ein offenes steiles Stück hinein */
  private freezeLimit(final = false): number {
    const n = this.pts.length;
    let limit = Math.min(this.lineFinal, n - Math.round(FREEZE / STEP));
    if (final) return limit;
    let first = this.baseLen;
    while (first < n && this.pts[first].frozen) first++;
    for (const sh of this.shapes(first)) {
      if (sh.kind !== 'open') continue;
      // offen: nur, wenn der Lauf nicht schon länger als FREEZE_MAX ist (dann bleibt er Höhe)
      if (n - sh.a > FREEZE_MAX) continue;
      limit = Math.min(limit, sh.a);
      break;
    }
    return limit;
  }

  // ------------------------------------------------------------------ Löser

  /** Tiefe des freien Stücks lösen (feste Punkte als Rand); endZ: Tiefe am letzten Punkt (Rundenschluss) */
  private solve(o: BrushOptions, endZ = NaN): void {
    const n = this.pts.length;
    let free = this.baseLen;
    while (free < n && this.pts[free].frozen) free++;
    if (free >= n) return;
    const a = Math.max(0, free - BORDER);
    const k = n - a;
    const zMin = LANE_MIN * LANE_DEPTH;
    const zMax = Math.max(LANE_MAX * LANE_DEPTH, o.zMax ?? -Infinity);
    const T = new Float64Array(k);
    const W = new Float64Array(k);
    const LO = new Float64Array(k).fill(zMin);
    const HI = new Float64Array(k).fill(zMax);
    const level = new Float64Array(k);
    const dirX = (i: number) => this.pts[clamp(i, 0, n - 1)].dirX;
    const clear = (i: number) => (Math.abs(dirX(i)) > 0.4 ? Math.sign(dirX(i)) : 0);
    // freie Punkte vorübergehend in die x-Zellen (Kreuzungen innerhalb des Vorlaufs, etwa in einem Looping)
    const tempCells: Array<[number, number]> = [];
    for (let m = 0; m < k; m++) {
      const i = a + m;
      if (this.pts[i].frozen) continue;
      const c = Math.floor(this.pts[i].p.X);
      const l = this.xCells.get(c);
      if (l) l.push(i);
      else this.xCells.set(c, [i]);
      tempCells.push([c, i]);
    }
    for (let m = 0; m < k; m++) {
      const i = a + m;
      const q = this.pts[i];
      const { t, w } = this.target(q, i);
      T[m] = t;
      W[m] = w;
      if (q.frozen) continue;
      const b = this.bounds(q, i > 0 ? this.pts[i - 1] : null, t, zMin, zMax);
      q.blocked = b.blocked;
      q.cave = b.cave;
      let lo = b.lo;
      let hi = b.hi;
      if (b.cave && !Number.isNaN(b.mid)) {
        T[m] = b.mid;
        W[m] = W_CAVE;
      }
      ({ lo, hi } = this.crossBounds(i, T[m], lo, hi, Number.isFinite(endZ)));
      if (lo > hi) lo = hi = (lo + hi) / 2;
      LO[m] = lo;
      HI[m] = hi;
      T[m] = clamp(T[m], lo, hi);
      // Wende: deutliche Richtung in x davor und danach entgegengesetzt
      let before = 0;
      let after = 0;
      for (let s = i; s >= Math.max(0, i - TURN_SPAN) && !before; s--) before = clear(s);
      for (let s = i; s <= Math.min(n - 1, i + TURN_SPAN) && !after; s++) after = clear(s);
      if (before * after < 0) level[m] = (1 - Math.abs(dirX(i))) ** 2;
    }
    for (const [c, i] of tempCells) {
      const l = this.xCells.get(c)!;
      l.splice(l.indexOf(i), 1);
      if (!l.length) this.xCells.delete(c);
    }
    // festes: Rand und Tiefe der alten Bahn; Rundenschluss: Ende auf der Starttiefe
    const pinned = new Float64Array(k).fill(NaN);
    for (let m = 0; m < k; m++) if (this.pts[a + m].frozen) pinned[m] = this.pts[a + m].z;
    if (Number.isFinite(endZ)) for (let m = Math.max(0, k - 3); m < k; m++) pinned[m] = endZ;
    const A = new Float64Array(k * k);
    const b = new Float64Array(k);
    const add = (i: number, j: number, v: number) => {
      A[i * k + j] += v;
    };
    // Formen im Fenster: Hügel laufen gerade von Fuß zu Fuß, Kehren als Halbkreis durch die Tiefe
    for (const sh of this.shapes(a + 1)) {
      if (sh.kind === 'open' || sh.b < 0) continue;
      const ma = sh.a - a;
      const mb = sh.b - a;
      if (sh.kind === 'hill') {
        const za = this.pts[sh.a].frozen ? this.pts[sh.a].z : T[Math.max(0, ma)];
        const zb = T[Math.min(k - 1, mb)];
        for (let m = Math.max(1, ma + 1); m < Math.min(k, mb); m++) {
          if (this.pts[a + m].frozen) continue;
          T[m] = za + ((zb - za) * (m - ma)) / (mb - ma);
          W[m] = W_LAND;
          level[m] = 0;
        }
      } else {
        // Weite des U im Bild und Richtung: nach oben gezeichnet nach hinten
        const A = this.pts[sh.a].p;
        let ext = A.X;
        const s0 = Math.sign(this.pts[sh.a].dirX) || 1;
        for (let s = sh.a; s <= sh.b; s++) ext = s0 > 0 ? Math.max(ext, this.pts[s].p.X) : Math.min(ext, this.pts[s].p.X);
        const width = Math.abs(ext - A.X);
        const dz = clamp(2 * width, KEHRE_MIN, KEHRE_MAX_LANES * LANE_DEPTH);
        const base = this.pts[sh.a].frozen ? this.pts[sh.a].z : T[Math.max(0, ma)];
        let sgn = Math.sign(this.pts[sh.b].p.Y - A.Y) || 1;
        if (base + sgn * dz > zMax || base + sgn * dz < zMin) sgn = -sgn;
        const span = Math.max(1, mb - ma);
        for (let m = Math.max(1, ma + 1); m <= Math.min(k - 1, mb); m++) {
          if (this.pts[a + m].frozen) continue;
          const u = (m - ma) / span;
          T[m] = clamp(base + (sgn * dz * (1 - Math.cos(Math.PI * u))) / 2, LO[m], HI[m]);
          W[m] = W_LAND;
          level[m] = 0;
        }
      }
    }
    for (let m = 0; m < k; m++) {
      add(m, m, W[m]);
      b[m] += W[m] * T[m];
    }
    for (let m = 1; m < k; m++) {
      // μ·(z[m] − z[m−1])²
      add(m - 1, m - 1, MU);
      add(m, m, MU);
      add(m - 1, m, -MU);
      add(m, m - 1, -MU);
    }
    for (let m = 1; m < k - 1; m++) {
      // λ·(z[m−1] − 2 z[m] + z[m+1])²
      const l = LAMBDA;
      add(m - 1, m - 1, l);
      add(m, m, 4 * l);
      add(m + 1, m + 1, l);
      add(m - 1, m, -2 * l);
      add(m, m - 1, -2 * l);
      add(m, m + 1, -2 * l);
      add(m + 1, m, -2 * l);
      add(m - 1, m + 1, l);
      add(m + 1, m - 1, l);
      // Wende: (z[m+1] − z[m−1] − g)² mit g = (Y[m+1] − Y[m−1]) / c
      const wl = W_LEVEL * level[m];
      if (wl > 0) {
        const g = (this.pts[a + m + 1].p.Y - this.pts[a + m - 1].p.Y) / TILT_TAN;
        add(m + 1, m + 1, wl);
        add(m - 1, m - 1, wl);
        add(m + 1, m - 1, -wl);
        add(m - 1, m + 1, -wl);
        b[m + 1] += wl * g;
        b[m - 1] -= wl * g;
      }
    }
    let maxDiag = 0;
    for (let m = 0; m < k; m++) maxDiag = Math.max(maxDiag, A[m * k + m]);
    const pinW = PIN_K * maxDiag;
    const pins = new Map<number, number>();
    for (let m = 0; m < k; m++) if (!Number.isNaN(pinned[m])) pins.set(m, pinned[m]);
    let z: Float64Array<ArrayBuffer> = new Float64Array(k);
    for (let round = 0; round < 24; round++) {
      const A2 = Float64Array.from(A);
      const b2 = Float64Array.from(b);
      for (const [m, v] of pins) {
        A2[m * k + m] += pinW;
        b2[m] += pinW * v;
      }
      z = solveSym(A2, k, b2);
      let changed = 0;
      // Schranken loslassen, die nach innen ziehen; verletzte setzen
      for (const [m, v] of pins) {
        if (!Number.isNaN(pinned[m])) continue;
        if (v === HI[m] ? z[m] < v - 1e-4 : z[m] > v + 1e-4) {
          pins.delete(m);
          changed++;
        }
      }
      for (let m = 0; m < k; m++) {
        if (pins.has(m)) continue;
        if (z[m] > HI[m] + 1e-4) {
          pins.set(m, HI[m]);
          changed++;
        } else if (z[m] < LO[m] - 1e-4) {
          pins.set(m, LO[m]);
          changed++;
        }
      }
      if (!changed) break;
    }
    for (let m = 0; m < k; m++) {
      const q = this.pts[a + m];
      if (q.frozen) continue;
      q.z = Number.isFinite(z[m]) ? clamp(z[m], LO[m], HI[m]) : q.z;
    }
  }

  // ------------------------------------------------------------------ Bahn

  /** Weltpunkt eines Linienpunkts (Hub über die tragende Fläche), gemerkt je Tiefe */
  private worldPoint(o: BrushOptions, q: Pt): Vec3 {
    const lane = q.z / LANE_DEPTH;
    if (q.wp && Math.abs(q.wpLane - lane) < 0.02) return q.wp;
    const w = rayToWorld(q.p, lane);
    let y = w.y;
    const t0 = performance.now();
    if (o.field && !o.field.solid(w.x, w.y, lane)) {
      const floor = o.field.floor(w.x, w.y, lane);
      if (floor !== null) y = Math.max(y, floor + (o.clearance ?? 0.8) * 0.5);
    }
    this.queryMs += performance.now() - t0;
    q.wp = { x: w.x, y, z: q.z };
    q.wpLane = lane;
    return q.wp;
  }

  /** Knoten alle NODE_STEP Linienpunkte (Catmull-Rom-Tangenten); feste bleiben, das Ende wird neu gesetzt */
  private buildNodes(o: BrushOptions, closed: boolean): TrackNode[] {
    const n = this.pts.length;
    const idx: number[] = [];
    for (let i = 0; i < n; i += NODE_STEP) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) {
      if (n - 1 - idx[idx.length - 1] < NODE_STEP * 0.4 && idx.length > 1) idx.pop();
      idx.push(n - 1);
    }
    const pos = (i: number) => this.worldPoint(o, this.pts[i]);
    const nodes: TrackNode[] = [];
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      // feste Knoten (ihre Nachbarn sind auch fest) bleiben dieselben Objekte
      if (k < this.nodesFrozen && this.nodes[k]) {
        nodes.push(this.nodes[k]);
        continue;
      }
      const p = pos(i);
      const a = pos(Math.max(0, i - 1));
      const b = pos(Math.min(n - 1, i + 1));
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tz = b.z - a.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const nd = createNode(p.x, p.y, p.z / LANE_DEPTH);
      const prev = k > 0 ? pos(idx[k - 1]) : null;
      const next = k < idx.length - 1 ? pos(idx[k + 1]) : null;
      const lIn = prev ? Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / 3 : 0;
      const lOut = next ? Math.hypot(next.x - p.x, next.y - p.y, next.z - p.z) / 3 : 0;
      nd.inX = (-tx / tl) * lIn;
      nd.inY = (-ty / tl) * lIn;
      nd.inZ = ((-tz / tl) * lIn) / LANE_DEPTH;
      nd.outX = (tx / tl) * lOut;
      nd.outY = (ty / tl) * lOut;
      nd.outZ = ((tz / tl) * lOut) / LANE_DEPTH;
      nodes.push(nd);
    }
    if (closed && nodes.length > 2) {
      // der letzte Punkt ist die Station: Schluss über die gemeinsame Tangente des ersten Knotens
      const last = nodes.pop()!;
      nodes[0].inX = last.inX;
      nodes[0].inY = last.inY;
      nodes[0].inZ = last.inZ;
    }
    nodes[0].kind = 'station';
    // Knoten, deren Umgebung fest ist, merken (bis zwei vor dem Ende)
    let frozenNodes = 0;
    while (frozenNodes < idx.length - 2 && this.pts[Math.min(n - 1, idx[frozenNodes] + 1)].frozen && this.pts[idx[frozenNodes + 1]].frozen) frozenNodes++;
    this.nodes = nodes.slice();
    this.nodesFrozen = closed ? 0 : frozenNodes;
    return nodes;
  }

  /** Punkte älter als FREEZE Meter hinter der Spitze einfrieren */
  private freeze(o: BrushOptions, final = false): void {
    const limit = this.freezeLimit(final);
    for (let i = this.baseLen; i < limit; i++) {
      const q = this.pts[i];
      if (q.frozen) continue;
      q.frozen = true;
      this.worldPoint(o, q);
      this.indexX(i);
    }
    this.stats.frozen = this.pts.filter((q) => q.frozen).length;
  }

  private rockRuns(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < this.pts.length; i++) {
      if (!this.pts[i].blocked) continue;
      let j = i;
      while (j + 1 < this.pts.length && this.pts[j + 1].blocked) j++;
      out.push([i, j]);
      i = j;
    }
    return out;
  }

  private preview(o: BrushOptions, closed: boolean): Strich2Preview {
    const nodes = this.buildNodes(o, closed);
    const n = this.pts.length;
    const z = new Float64Array(n);
    const cave = new Uint8Array(n);
    const rock: StagePoint[] = [];
    for (let i = 0; i < n; i++) {
      z[i] = this.pts[i].z;
      cave[i] = this.pts[i].cave ? 1 : 0;
      if (this.pts[i].blocked) rock.push(this.pts[i].p);
    }
    return { path: { ...emptyPath(), nodes, closed, brush: true }, z, rock, cave, crossings: [], line: this.pts.map((q) => q.p) };
  }

  /** Länge der Linie bis zum letzten festen Punkt (Bühnen-Meter, ohne alte Bahn): bis hierher sind die Schienen endgültig */
  get frozenLength(): number {
    let l = 0;
    for (let i = this.baseLen + 1; i < this.pts.length && this.pts[i].frozen; i++) l += Math.hypot(this.pts[i].p.X - this.pts[i - 1].p.X, this.pts[i].p.Y - this.pts[i - 1].p.Y);
    return l;
  }

  /** Vorschau beim Malen: Pinselpunkte übernehmen, freies Stück lösen, Punkte hinter dem Vorlauf einfrieren */
  update(points: StagePoint[]): Strich2Preview | null {
    const t0 = performance.now();
    this.queryMs = 0;
    const o = this.options();
    const before = this.pts.length;
    this.feed(points);
    if (this.pts.length - this.baseLen < 6) return null;
    this.query(o, Math.min(before, this.lineFinal) - 2);
    this.solve(o);
    this.freeze(o);
    const pv = this.preview(o, false);
    this.stats.ms = performance.now() - t0;
    this.stats.queryMs = this.queryMs;
    return pv;
  }

  /**
   * Loslassen: die ganze Pinsellinie übernehmen, den Rest lösen; endet sie nah am Anfang, ein neuer Weg ab dem festen
   * Ende in die Station (der gezeichnete Teil bleibt). Danach ist alles fest.
   */
  finish(points: StagePoint[]): Strich2Result | null {
    const o = this.options();
    const before = this.pts.length;
    this.feed(points);
    if (this.pts.length - this.baseLen < 6) return null;
    this.query(o, Math.min(before, this.lineFinal) - 2);
    this.solve(o);
    // beim Loslassen ist ein noch offenes steiles Stück Höhe: alles bis FREEZE vor dem Ende wird fest
    this.freeze(o, true);
    let closed = false;
    const n = this.pts.length;
    const p0 = this.pts[0].p;
    const end = this.pts[n - 1].p;
    const gap = Math.hypot(end.X - p0.X, end.Y - p0.Y);
    if (gap <= this.closeSnap && (n - 1) * STEP >= 40) {
      const ring = this.closeRing();
      if (ring) {
        this.dropFrom(ring.from);
        for (const p of ring.pts) this.pts.push(this.newPt(p, this.pts[this.pts.length - 1].z));
        this.lineFinal = this.pts.length;
        this.query(o, ring.from);
        this.solve(o, this.startZ);
        closed = true;
      }
    }
    for (let i = this.baseLen; i < this.pts.length; i++) {
      const q = this.pts[i];
      q.frozen = true;
      this.worldPoint(o, q);
    }
    const pv = this.preview(o, closed);
    const pts = this.pts.map((q) => this.worldPoint(o, q));
    if (closed) pts[pts.length - 1] = { ...pts[0] };
    return { path: pv.path, line: this.pts.map((q) => q.p), z: pv.z, pts, closed, rock: this.rockRuns() };
  }

  /**
   * Neuer Weg ab dem letzten festen Punkt in die Station: Dubins-Bögen (Radien CLOSE_RADII) bis zum Beginn einer geraden
   * Einfahrt, dann gerade in die Station; die kürzeste Art, die nicht weiter als CLOSE_TURN dreht. from: erster Index,
   * der ersetzt wird
   */
  private closeRing(): { from: number; pts: StagePoint[] } | null {
    const n = this.pts.length;
    let f = n - 1;
    while (f > this.baseLen && !this.pts[f].frozen) f--;
    if (f < Math.max(this.baseLen, 2) + 6) return null;
    const P0 = this.pts[0].p;
    const tsX = this.tsX || Math.sign(this.pts[Math.min(n - 1, 4)].p.X - P0.X) || 1;
    const thS = Math.atan2(0, tsX);
    const A = this.pts[f].p;
    const B = this.pts[f - 2].p;
    const start: Pose = { X: A.X, Y: A.Y, th: Math.atan2(A.Y - B.Y, A.X - B.X) };
    const goal: Pose = { X: P0.X - tsX * CLOSE_ENTRY, Y: P0.Y, th: thS };
    let best: { pts: StagePoint[]; cost: number } | null = null;
    for (const R of CLOSE_RADII) {
      for (const path of dubinsPaths(start, goal, R, 0.5)) {
        let turn = 0;
        let prev = start.th;
        let len = 0;
        let last: StagePoint = A;
        for (const p of path) {
          const th = Math.atan2(p.Y - last.Y, p.X - last.X);
          let d = th - prev;
          d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
          turn += Math.abs(d);
          prev = th;
          len += Math.hypot(p.X - last.X, p.Y - last.Y);
          last = p;
        }
        if (turn > (CLOSE_TURN * Math.PI) / 180) continue;
        const cost = len + turn * 4 * (16 / R);
        if (!best || cost < best.cost) best = { pts: path, cost };
      }
    }
    if (!best) return null;
    // auf STEP neu abtasten, dann die Einfahrt bis zur Station
    const entry: StagePoint[] = [];
    for (let d = CLOSE_ENTRY - 1; d > 1e-9; d -= 1) entry.push({ X: P0.X - tsX * d, Y: P0.Y, cx: P0.cx, cy: P0.cy });
    entry.push({ ...P0 });
    const all = [A, ...best.pts, ...entry];
    const out: StagePoint[] = [];
    let carry = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      const d = Math.hypot(b.X - a.X, b.Y - a.Y);
      if (d < 1e-9) continue;
      let t = STEP - carry;
      while (t <= d) {
        out.push(mixPoint(a, b, t / d));
        t += STEP;
      }
      carry = d - (t - STEP);
    }
    out.push({ ...P0 });
    // Strahlen: Punkte ohne Kamera bekommen die des festen Endes
    for (const p of out) {
      if (p.cx === undefined && A.cx !== undefined) {
        p.cx = A.cx;
        p.cy = A.cy;
      }
    }
    return { from: f + 1, pts: out };
  }
}
