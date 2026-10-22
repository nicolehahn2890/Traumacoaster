/**
 * Gesten-Interpreter (Bühnen-Zeichnen v3).
 *
 * Der vorbereitete Strich (Bühnenkoordinaten, gleichmäßig 0,5 m) wird von vorn nach hinten gelesen und in
 * Abschnitte zerlegt, die je eine Absicht der Hand tragen:
 *  - Spur:        Fahrt entlang einer der fünf Bodenlinien (Spur ganzzahlig, Tiefe fest).
 *  - Spurwechsel: Die Hand wandert in eine andere Spur (Hysterese + Entprellen); daraus wird eine S-Kurve,
 *                 deren Länge mit dem Tempo wächst.
 *  - Höhe:        Steiler Anstieg (über 40° auf 4 m, ohne dass x umkehrt) oder über die Bühne hinaus; die Spur
 *                 bleibt eingefroren, die Bildhöhe ist die Höhe. Landet der Strich wieder auf einer Bodenlinie,
 *                 ist er dort am Boden (auch auf einer anderen Spur als der des Anstiegs).
 *  - Kehre:       x kehrt um. Am Boden wie in der Höhe ein Halbkreis in die Nachbarspuren (mindestens eine
 *                 Spur, bei Tempo mehr); Richtung aus der gezeichneten Spur des Rückwegs.
 *  - Looping:     In der Höhe dreht die Richtung um eine volle Runde (ab 300°): ein Kreis in der Spur, Radius aus
 *                 der gezeichneten Schleife (mindestens 3,5 m), nie plattgezogen.
 *
 * Jede Entscheidung fällt mit begrenztem Vorausblick (Anstieg 8 m, Kehre 5 m Rückweg) und wird danach nicht
 * mehr geändert: Beim Ziehen bleibt die gezeichnete Bahn stabil, nur die letzten Meter hinter dem Finger sind
 * noch in Bewegung. Schleifen oder Schrauben entstehen nie aus dem Strich (nur ein klarer Looping).
 */
import type { Vec2 } from '@/core/math';
import { smoothstep } from '@/core/math';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, LANE_RISE, laneRise, laneScale, nearestLane } from './stage';

export type StrokeMode = 'floor' | 'height';

export interface InterpretedPoint {
  x: number;
  /** Höhe über dem Boden der Spur (vor dem Anheben auf die Mindesthöhe) */
  y: number;
  /** Tiefe in Spuren */
  z: number;
  mode: StrokeMode;
  /** Bogenlänge des Strichs (Bühnen-Meter), aus der der Punkt stammt */
  s?: number;
}

export interface StrokeEvent {
  kind: 'turn' | 'loop';
  index: number;
  dir?: number;
  from?: number;
  to?: number;
  /** Kehre: Radius des Halbkreises in Metern */
  radius?: number;
  /** Kehre am Boden */
  floor?: boolean;
  gap?: { dx: number; dy: number };
}

export interface GestureOptions {
  /** Bodenhöhe (Welt) an x, Spur z */
  ground?: (x: number, z: number) => number;
  groundClearance?: number;
  /** Startzustand (Fortsetzen, Überzeichnen) */
  startZ?: number;
  startMode?: StrokeMode;
  allowLoops?: boolean;
  /** Vorschau: eine noch offene Kehre in der Höhe wird roh gezeigt (Profil wie gezeichnet) statt festgelegt */
  preview?: boolean;
  /** Bühnen-Meter am Anfang, die nicht umgeformt werden (Einlauf beim Fortsetzen) */
  lockLength?: number;
  /** Station auf der Bühne: endet der Strich dort (closeSnap), zielt die letzte Boden-Kehre auf die Spur der Station */
  closeAt?: { X: number; Y: number };
  closeSnap?: number;
}

export interface GestureResult {
  points: InterpretedPoint[];
  events: StrokeEvent[];
}

const LEG_MIN = 1.5; // m in x, bevor die Richtung eines Schenkels feststeht
const TURN_DETECT = 2.5; // m Rückweg in x: Umkehr (weniger ist Zittern, x bleibt monoton)
const TURN_COMMIT = 5; // m Rückweg, bevor die Kehre festgelegt wird
const TURN_STRAIGHT_WINDOW = 5; // m: über diese Länge wird die Krümmung des Rückwegs mit der Beuge verglichen
const TURN_STRAIGHT_RATE = 0.03; // rad/m: darunter ist ein Rückweg in jedem Fall gerade (8,6° auf 5 m)
const TURN_STRAIGHT_RATIO = 0.4; // Rückweg gerade, wenn er sich weniger als 40 % so stark krümmt wie die Beuge
const TURN_WATCH = 5; // m Vorwärtslauf nach einer festgelegten Kehre, in denen sie noch zum Looping werden kann
const LOOP_CLOSE = (330 * Math.PI) / 180; // Drehung, bei der die Schleife geschlossen ist
const LOOP_ASPECT_MIN = 0.45; // Schleife in der Höhe: Höhe/Breite mindestens …
const LOOP_ASPECT_FLOOR = 0.7; // … vom Boden aus (ein flaches Oval über zwei Spuren hat 0,6 und weniger)
const LOOP_ASPECT_MAX = 2.5;
const REVERSAL_MIN = 0.8; // m Rückweg, der einen Anstiegs-Kandidaten zur Bodenkehre macht
const STEEP_ANGLE = (40 * Math.PI) / 180;
const STEEP_WINDOW = 4; // Bühnen-Meter, über die der Anstieg im Mittel steil sein muss
const CLIMB_LOOK = 8; // Bühnen-Meter Vorausblick: kehrt x darin nicht um, war es ein Anstieg
const CLIMB_RISE_SURE = 2.2 * LANE_RISE; // so hoch über dem Fuß ohne Umkehr: sicher ein Anstieg (keine Kehre reicht so weit)
const ABOVE_STAGE = 0.6;
const LAND_BAND = 0.9; // Bühnen-Meter um die eigene Bodenlinie: Landung
const LAND_BAND_FLAT = 1.5; // … bei flachem Strich
const LAND_BAND_OTHER = 0.5; // … um eine fremde Bodenlinie (dort muss der Strich der Linie folgen)
const LAND_OTHER_RUN = 3; // m entlang der fremden Linie, bevor dort gelandet wird
const LAND_ANGLE = (25 * Math.PI) / 180;
const LAND_BLEND = 20; // m: Spurwechsel in der Abfahrt auf eine andere Spur
const SWITCH_MARGIN = 1.0; // Bühnen-Meter über die Mitte zwischen zwei Spuren hinaus (Hysterese)
const SWITCH_DEBOUNCE = 2; // m Strich auf der neuen Seite (Entprellen)
const LANE_CHANGE_MIN = 14; // m: kürzeste S-Kurve eines Spurwechsels
const LANE_CHANGE_MAX = 40;
const LOOP_TURN = (300 * Math.PI) / 180; // Drehung, ab der eine Schleife ein Looping ist
const LOOP_MIN_PERIMETER = 7; // m Strich (weniger ist Zittern)
const LOOP_R_MIN = 3.5; // m: kleinster Looping (ein Wagen passt hindurch)
const LOOP_R_MAX = 25;
const LOOP_BLEND = 10;
const LOOP_FORWARD = Math.cos((20 * Math.PI) / 180); // Looping beginnt, wo die Richtung zuletzt fast vorwärts war
const TURN_G = 2.0; // höchste Querbeschleunigung (g), für die eine Kehre ausgelegt wird
const TURN_RADIUS_MIN = LANE_DEPTH / 2;
const TURN_RADIUS_MAX = 2 * LANE_DEPTH;
const TURN_BLEND = 10; // m: Versatz in x nach einer Kehre weich abbauen
const TURN_RUNOUT = 6; // m eben nach der Kurve
const TURN_BLEND_Y = 16; // m: Höhe nach der Kurve weich auf den gezeichneten Verlauf
const CIRCLE_STEP = 0.5;
const CLOSE_SNAP = 8; // Bühnen-Meter: so nah an der Station endet der Strich für den Rundenschluss
const CLOSE_U_REACH = 40; // m: so weit vor dem Ende gehört eine Boden-Kehre zum Rundenschluss

/** Spuren, die ein Halbkreis mit Radius r überquert (Durchmesser in Spuren, aufgerundet mit etwas Spiel) */
export const lanesForRadius = (r: number): number => Math.max(1, Math.ceil((2 * r) / LANE_DEPTH - 0.15));
/** Radius, den ein Zug mit v² ≈ 2·g·Fallhöhe braucht, damit die Querbeschleunigung unter TURN_G bleibt */
export const radiusForDrop = (drop: number): number => (2 * Math.max(0, drop)) / TURN_G;
/** Länge der S-Kurve eines Spurwechsels über dz Spuren bei einer Fallhöhe drop (Kuppenradius-Regel R ≈ L²/(6·Δ)) */
export function laneChangeLength(dz: number, drop: number): number {
  const R = Math.max(6, radiusForDrop(drop));
  return Math.min(LANE_CHANGE_MAX, Math.max(LANE_CHANGE_MIN, Math.sqrt(6 * Math.abs(dz) * LANE_DEPTH * R)));
}

type FloorSection = { kind: 'floor'; i0: number; i1: number; lane: number; dir: number; switches: Array<{ i: number; lane: number; hMax: number }> };
type HeightSection = { kind: 'height'; i0: number; i1: number; lane: number; dir: number; landLane: number | null; rawFrom: number };
type TurnSection = { kind: 'turn'; i0: number; i1: number; apex: number; laneFrom: number; laneTo: number; dirX: number; floor: boolean; R: number; thetaEnd: number };
type LoopSection = { kind: 'loop'; i0: number; i1: number; lane: number; sign: number; R: number; dir: number };
type Section = FloorSection | HeightSection | TurnSection | LoopSection;

const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

class Scanner {
  readonly n: number;
  readonly X: Float64Array;
  readonly Y: Float64Array;
  readonly cum: Float64Array;
  /** Richtungswinkel des Segments i → i+1 (letzter wiederholt) */
  readonly ang: Float64Array;
  /** aufsummierte Drehung bis Segment i */
  readonly theta: Float64Array;
  readonly sections: Section[] = [];
  readonly ground: (x: number, z: number) => number;
  readonly clearance: number;
  mode: StrokeMode;
  lane: number;
  dir = 0;
  hMax: number;
  lockIdx = 0;
  allowLoops: boolean;
  preview: boolean;
  /** Der Strich endet an der Station: Spur der Station, sonst null */
  closeLane: number | null = null;

  constructor(pts: Vec2[], opts: GestureOptions) {
    const n = pts.length;
    this.n = n;
    this.X = Float64Array.from(pts, (p) => p.x);
    this.Y = Float64Array.from(pts, (p) => p.y);
    this.cum = new Float64Array(n);
    this.ang = new Float64Array(n);
    this.theta = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      this.cum[i] = this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      this.ang[i - 1] = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    }
    if (n >= 2) this.ang[n - 1] = this.ang[n - 2];
    for (let i = 1; i < n; i++) this.theta[i] = this.theta[i - 1] + wrapAngle(this.ang[i] - this.ang[i - 1]);
    this.ground = opts.ground ?? (() => 0);
    this.clearance = opts.groundClearance ?? 0.6;
    this.allowLoops = opts.allowLoops !== false;
    this.preview = !!opts.preview;
    if (opts.lockLength) {
      let k = 0;
      while (k < n - 1 && this.cum[k] < opts.lockLength) k++;
      this.lockIdx = k;
    }
    if (opts.closeAt && n > 1) {
      const d = Math.hypot(this.X[n - 1] - opts.closeAt.X, this.Y[n - 1] - opts.closeAt.Y);
      if (d <= (opts.closeSnap ?? CLOSE_SNAP)) this.closeLane = nearestLane(opts.closeAt.Y);
    }
    const above = n > 0 && this.aboveStage(0);
    this.mode = opts.startMode ?? (above ? 'height' : 'floor');
    const startZ = opts.startZ ?? (above && !opts.startMode ? LANE_MAX : n ? this.nearest(0).lane : 0);
    // am Boden ganze Spuren (eine krumme Start-Tiefe blendet die Geometrie auf die Spur), in der Höhe bleibt die Tiefe, wie sie ist
    this.lane = this.mode === 'floor' ? Math.max(LANE_MIN, Math.min(LANE_MAX, Math.round(startZ))) : startZ;
    this.hMax = n ? (this.mode === 'height' ? this.absHeight(0, this.lane) : this.ground(this.X[0] / laneScale(this.lane), this.lane) + this.clearance) : 0;
  }

  // ------------------------------------------------------------------ Geometrie-Helfer
  /** Bühnen-Y der Bodenlinie von Spur z an Bühnen-X */
  groundY(X: number, z: number): number {
    const k = laneScale(z);
    return this.ground(X / k, z) * k + laneRise(z);
  }
  distTo(i: number, z: number): number {
    return Math.abs(this.Y[i] - this.groundY(this.X[i], z));
  }
  nearest(i: number): { lane: number; d: number } {
    let lane = 0;
    let best = Infinity;
    for (let z = LANE_MIN; z <= LANE_MAX; z++) {
      const d = this.distTo(i, z);
      if (d < best) {
        best = d;
        lane = z;
      }
    }
    return { lane, d: best };
  }
  aboveStage(i: number): boolean {
    return this.Y[i] > this.groundY(this.X[i], LANE_MAX) + ABOVE_STAGE;
  }
  /** Höhe über dem Boden der Spur z (Welt) */
  heightAt(i: number, z: number): number {
    return Math.max(0, (this.Y[i] - this.groundY(this.X[i], z)) / laneScale(z));
  }
  absHeight(i: number, z: number): number {
    return this.heightAt(i, z) + this.ground(this.X[i] / laneScale(z), z);
  }
  /** Steigungswinkel des Segments i−1 → i gegenüber |dx| */
  slope(i: number): number {
    const a = Math.max(1, i);
    return Math.atan2(this.Y[a] - this.Y[a - 1], Math.abs(this.X[a] - this.X[a - 1]));
  }
  /** Beginn eines 4-m-Fensters, das bei i endet und im Mittel steiler als 40° ist, sonst −1 */
  steepWindow(i: number, limit: number): number {
    let j = i;
    while (j > limit && this.cum[i] - this.cum[j] < STEEP_WINDOW) j--;
    if (this.cum[i] - this.cum[j] < STEEP_WINDOW - 0.6) return -1;
    let ws = 0;
    let wl = 0;
    for (let m = j + 1; m <= i; m++) {
      const l = this.cum[m] - this.cum[m - 1];
      ws += l * this.slope(m);
      wl += l;
    }
    return wl > 0 && ws / wl > STEEP_ANGLE ? j : -1;
  }
  /** Fuß eines Anstiegs: so weit vor j zurück, wie der Strich schon stieg (ebene Stücke bleiben Boden) */
  footBefore(j: number, limit: number): number {
    let k = j;
    while (k > limit && this.Y[k - 1] < this.Y[k] - 0.02) k--;
    return k;
  }
  /** Steigt der Strich über die letzten 4 m spürbar (mehr als 1 m)? */
  rising(i: number, limit: number): boolean {
    let j = i;
    while (j > limit && this.cum[i] - this.cum[j] < STEEP_WINDOW) j--;
    return this.Y[i] - this.Y[j] >= 1.0;
  }
  /**
   * Läuft der Rückweg über die letzten len Meter vor i gerade? Gerade heißt: deutlich weniger gekrümmt als die
   * Beuge davor (ein Looping krümmt sich weiter wie die Beuge) oder praktisch ohne Drehung.
   */
  straightBefore(i: number, len: number, bendRate: number): boolean {
    let j = i;
    while (j > 0 && this.cum[i] - this.cum[j] < len) j--;
    const l = this.cum[i] - this.cum[j];
    if (l < 1e-6) return false;
    const rate = Math.abs(this.theta[i] - this.theta[j]) / l;
    return rate < Math.max(TURN_STRAIGHT_RATE, TURN_STRAIGHT_RATIO * bendRate);
  }

  // ------------------------------------------------------------------ Abtastung
  run(): void {
    if (this.n < 2) return;
    let i = 0;
    let guard = 0;
    while (i < this.n - 1 && guard++ < 10000) i = this.mode === 'floor' ? this.scanFloor(i) : this.scanHeight(i);
  }

  private laneAt(sec: FloorSection, i: number): number {
    let lane = sec.lane;
    for (const sw of sec.switches) if (sw.i <= i) lane = sw.lane;
    return lane;
  }

  /** Boden-Abschnitt ab i0 bis zum nächsten Anstieg oder zur nächsten Kehre */
  private scanFloor(i0: number): number {
    return this.scanFloorSection({ kind: 'floor', i0, i1: this.n - 1, lane: this.lane, dir: this.dir, switches: [] }, i0 + 1);
  }
  private scanFloorSection(sec: FloorSection, from: number): number {
    const { n, X, Y, cum } = this;
    const i0 = sec.i0;
    let dir = sec.dir;
    let extIdx = i0;
    let extX = X[i0];
    for (let k = i0 + 1; k < from; k++) if (dir === 0 || (X[k] - extX) * dir >= 0) { extX = X[k]; extIdx = k; }
    let pendingSwitch: { i: number; lane: number } | null = null;
    let climb: { foot: number; decideAt: number } | null = null;
    const commitClimb = (): number => {
      const foot = climb!.foot;
      sec.i1 = foot;
      sec.switches = sec.switches.filter((s) => s.i <= foot);
      this.lane = this.laneAt(sec, foot);
      this.dir = dir;
      this.mode = 'height';
      this.sections.push(sec);
      return foot;
    };
    for (let i = from; i < n; i++) {
      if (dir === 0) {
        if (Math.abs(X[i] - X[i0]) >= LEG_MIN) {
          dir = Math.sign(X[i] - X[i0]);
          sec.dir = dir;
          extIdx = i;
          extX = X[i];
        }
      } else if ((X[i] - extX) * dir >= 0) {
        extIdx = i;
        extX = X[i];
      }
      const retreat = dir ? (extX - X[i]) * dir : 0;
      if (climb) {
        if (retreat >= REVERSAL_MIN) climb = null; // Bodenkehre: der Strich kehrt um
        else if (cum[i] >= climb.decideAt || Y[i] - Y[climb.foot] >= CLIMB_RISE_SURE) return commitClimb();
      }
      if (retreat >= TURN_DETECT) {
        sec.i1 = extIdx;
        this.sections.push(sec);
        return this.scanTurn(sec, extIdx, dir, i);
      }
      if (!climb && retreat < REVERSAL_MIN) {
        const w = this.steepWindow(i, i0);
        if (w >= 0 || (this.aboveStage(i) && this.rising(i, i0))) climb = { foot: this.footBefore(w >= 0 ? w : i, i0), decideAt: cum[i] + CLIMB_LOOK };
      }
      // Spurwechsel: Hysterese über die Spurmitte hinaus und Entprellen
      const lane = this.laneAt(sec, i);
      const { lane: c } = this.nearest(i);
      if (c !== lane && this.distTo(i, c) < this.distTo(i, lane) - SWITCH_MARGIN) {
        if (!pendingSwitch || pendingSwitch.lane !== c) pendingSwitch = { i, lane: c };
        else if (cum[i] - cum[pendingSwitch.i] >= SWITCH_DEBOUNCE) {
          sec.switches.push({ i: pendingSwitch.i, lane: c, hMax: this.hMax });
          pendingSwitch = null;
        }
      } else if (pendingSwitch) pendingSwitch = null;
    }
    if (climb) return commitClimb(); // noch unentschieden: vorläufig Höhe
    // Am Strichende zählt schon ein halbes Entprellen: Die Spur unter dem Finger soll die Spur der Bahn sein
    if (pendingSwitch && cum[n - 1] - cum[pendingSwitch.i] >= SWITCH_DEBOUNCE * 0.4) sec.switches.push({ i: pendingSwitch.i, lane: pendingSwitch.lane, hMax: this.hMax });
    sec.i1 = n - 1;
    this.lane = this.laneAt(sec, n - 1);
    this.dir = dir;
    this.sections.push(sec);
    return n;
  }

  /** Höhen-Abschnitt ab i0 bis zur Landung oder zur nächsten Kehre */
  private scanHeight(i0: number): number {
    return this.scanHeightSection({ kind: 'height', i0, i1: this.n - 1, lane: this.lane, dir: this.dir, landLane: null, rawFrom: this.n }, i0 + 1);
  }
  private scanHeightSection(sec: HeightSection, from: number): number {
    const { n, X, Y, cum } = this;
    const i0 = sec.i0;
    const lane = sec.lane;
    sec.rawFrom = n;
    let dir = sec.dir;
    let extIdx = i0;
    let extX = X[i0];
    for (let k = i0 + 1; k < from; k++) if (dir === 0 || (X[k] - extX) * dir >= 0) { extX = X[k]; extIdx = k; }
    let yMax = Y[i0];
    let otherSince = -1;
    let otherLane = lane;
    for (let i = from; i < n; i++) {
      if (dir === 0) {
        if (Math.abs(X[i] - X[i0]) >= LEG_MIN) {
          dir = Math.sign(X[i] - X[i0]);
          sec.dir = dir;
          extIdx = i;
          extX = X[i];
        }
      } else if ((X[i] - extX) * dir >= 0) {
        extIdx = i;
        extX = X[i];
      }
      const retreat = dir ? (extX - X[i]) * dir : 0;
      if (retreat >= TURN_DETECT) {
        sec.i1 = extIdx;
        this.sections.push(sec);
        return this.scanTurn(sec, extIdx, dir, i);
      }
      yMax = Math.max(yMax, Y[i]);
      this.hMax = Math.max(this.hMax, this.absHeight(i, lane));
      // Landung: flach auf einer Bodenlinie, nachdem der Strich herunterkam (oder lange flach dicht an der Linie)
      const flat = Math.abs(this.slope(i)) < LAND_ANGLE;
      const descending = Y[i] <= Y[i - 1] + 1e-6;
      const dOwn = this.distTo(i, lane);
      const below = Y[i] < this.groundY(X[i], lane);
      const cameDown = yMax - Y[i] >= 1.0 || cum[i] - cum[i0] >= 6;
      const land = (target: number): number => {
        sec.i1 = i;
        sec.landLane = target;
        this.sections.push(sec);
        this.mode = 'floor';
        this.lane = target;
        this.dir = dir;
        return i;
      };
      if (flat && cameDown && ((dOwn <= LAND_BAND && descending) || (dOwn <= LAND_BAND_FLAT && (below || descending)))) return land(Math.round(lane));
      const { lane: c, d } = this.nearest(i);
      if (c !== Math.round(lane) && d <= LAND_BAND_OTHER && flat && cameDown) {
        if (otherSince < 0 || otherLane !== c) {
          otherSince = i;
          otherLane = c;
        } else if (cum[i] - cum[otherSince] >= LAND_OTHER_RUN) return land(c);
      } else otherSince = -1;
    }
    sec.i1 = n - 1;
    this.dir = dir;
    this.sections.push(sec);
    return n;
  }

  /**
   * Umkehr von x am Scheitel apex (Rückweg schon ≥ TURN_DETECT). Liest weiter, bis klar ist, was gemeint ist:
   * ein Looping (Drehung ≥ 300° in der Höhe, auch vom Boden aus), oder eine Kehre (Rückweg ≥ 5 m und gerade).
   * prev ist der Abschnitt davor (schon abgelegt); er wird bis zur Kurveneinfahrt gekürzt.
   */
  private scanTurn(prev: FloorSection | HeightSection, apex: number, dirX: number, i: number): number {
    const { n, X, cum, ang, theta } = this;
    const forward = (m: number): number => Math.cos(ang[Math.max(0, Math.min(n - 1, m))]) * dirX;
    // Beginn der Beuge: zuletzt klar vorwärts
    let bend = apex;
    while (bend > prev.i0 && forward(bend - 1) < LOOP_FORWARD) bend--;
    const extX = X[apex];
    const floorMode = prev.kind === 'floor';
    const laneApex = prev.kind === 'floor' ? this.laneAt(prev, apex) : prev.lane;
    const bendRate = 1 / this.drawnRadius(prev, apex, dirX, n - 1, true);
    const snapshot = { i1: prev.i1, switches: prev.kind === 'floor' ? prev.switches.slice() : [] };
    let turnEnd = -1;
    for (let j = i; j < n; j++) {
      const retreat = (extX - X[j]) * dirX;
      if (turnEnd < 0 && retreat < 0) {
        // Haken: der Strich läuft wieder über den Scheitel hinaus; die Umkehr war keine Kehre, der Abschnitt geht weiter
        this.sections.pop();
        prev.i1 = n - 1;
        return prev.kind === 'floor' ? this.scanFloorSection(prev, j) : this.scanHeightSection(prev, j);
      }
      const turning = Math.abs(theta[j] - theta[bend]);
      if (turning >= LOOP_TURN && cum[j] - cum[bend] >= LOOP_MIN_PERIMETER && this.loopShaped(bend, j, floorMode)) {
        if (turnEnd >= 0) {
          // die eben festgelegte Kehre war der Anfang eines Loopings: zurücknehmen
          this.sections.pop();
          prev.i1 = snapshot.i1;
          if (prev.kind === 'floor') prev.switches = snapshot.switches;
        }
        return this.commitLoop(prev, bend, j, laneApex, dirX);
      }
      if (turnEnd >= 0) {
        // Kehre steht; nur noch beobachten, ob der Strich doch zur Schleife weiterdreht
        let minX = X[turnEnd];
        for (let m = turnEnd; m <= j; m++) if ((X[m] - minX) * dirX < 0) minX = X[m];
        if ((X[j] - minX) * dirX >= TURN_WATCH) break;
        continue;
      }
      if (retreat >= TURN_COMMIT && this.straightBefore(j, TURN_STRAIGHT_WINDOW, bendRate)) turnEnd = this.commitTurn(prev, apex, bend, dirX, j, floorMode);
    }
    if (turnEnd >= 0) return turnEnd;
    // Strich endet, solange die Umkehr noch offen ist
    if (!floorMode && this.preview) {
      // Vorschau: Profil roh zeigen (wird beim Loslassen zur Kehre oder zum Looping)
      (prev as HeightSection).i1 = n - 1;
      (prev as HeightSection).rawFrom = apex;
      return n;
    }
    return this.commitTurn(prev, apex, bend, dirX, n - 1, floorMode);
  }

  /**
   * Ist der Strich von bend bis j als Schleife geformt? Ovale am Boden sind viel breiter als hoch (ein Oval über
   * zwei Spuren ist 8,4 m hoch); eine Schleife ist etwa so hoch wie breit. Vom Boden aus muss sie runder sein.
   */
  private loopShaped(bend: number, j: number, floorMode: boolean): boolean {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let m = bend; m <= j; m++) {
      minX = Math.min(minX, this.X[m]); maxX = Math.max(maxX, this.X[m]);
      minY = Math.min(minY, this.Y[m]); maxY = Math.max(maxY, this.Y[m]);
    }
    const aspect = maxX - minX > 1e-6 ? (maxY - minY) / (maxX - minX) : 0;
    return aspect >= (floorMode ? LOOP_ASPECT_FLOOR : LOOP_ASPECT_MIN) && aspect <= LOOP_ASPECT_MAX;
  }

  private commitLoop(prev: FloorSection | HeightSection, bend: number, j: number, laneApex: number, dirX: number): number {
    const { n, cum, theta } = this;
    const sign = Math.sign(theta[j] - theta[bend]) || 1;
    // Die Schleife endet, wo der Strich wieder in Einfahrtsrichtung läuft (330°, die Einfahrt beginnt ab 20°) oder sich
    // nicht mehr in ihrem Sinn weiterdreht (Ausfahrt taucht ab); ein sanfter Bogen danach gehört nicht mehr dazu
    const turn = (m: number) => sign * (theta[m] - theta[bend]);
    let i1 = j;
    const ahead = (m: number): number => {
      let best = -Infinity;
      for (let k = m + 1; k <= Math.min(n - 1, m + 4); k++) best = Math.max(best, turn(k));
      return best;
    };
    while (i1 < n - 1 && turn(i1) < LOOP_CLOSE && ahead(i1) > turn(i1) + 1e-9) i1++;
    const start = Math.max(bend, prev.i0, this.lockIdx);
    prev.i1 = start;
    if (prev.kind === 'floor') prev.switches = prev.switches.filter((s) => s.i <= start);
    const lane = prev.kind === 'floor' ? this.laneAt(prev, start) : laneApex;
    if (!this.allowLoops) {
      // Looping nicht freigeschaltet: die Schleife wird übersprungen, der Strich geht dahinter weiter
      this.lane = lane;
      this.dir = dirX;
      return i1;
    }
    const turningEnd = Math.abs(theta[i1] - theta[bend]) || 2 * Math.PI;
    const laneR = Math.round(lane);
    const R = Math.max(LOOP_R_MIN, Math.min(LOOP_R_MAX, (cum[i1] - cum[bend]) / laneScale(laneR) / turningEnd));
    this.sections.push({ kind: 'loop', i0: start, i1, lane: laneR, sign, R, dir: dirX });
    this.mode = 'height';
    this.lane = laneR;
    this.dir = dirX;
    this.hMax = Math.max(this.hMax, this.absHeight(start, laneR) + 2 * R);
    return i1;
  }

  /** Radius der gezeichneten Beuge: Strichlänge, über die die Richtung von klar vorwärts nach klar rückwärts dreht */
  private drawnRadius(prev: Section, apex: number, dirX: number, until: number, raw = false): number {
    const { ang, cum } = this;
    const dirAt = (m: number) => Math.cos(ang[Math.max(0, Math.min(this.n - 1, m))]) * dirX;
    let a = apex;
    while (a > prev.i0 && dirAt(a - 1) < 0.7) a--;
    let b = apex;
    while (b < until && dirAt(b) > -0.7) b++;
    const r = (2 * (cum[b] - cum[a])) / Math.PI;
    if (raw) return Math.max(0.5, r);
    return Math.max(TURN_RADIUS_MIN, Math.min(TURN_RADIUS_MAX, r));
  }

  private commitTurn(prev: FloorSection | HeightSection, apex: number, bend: number, dirX: number, j: number, floorMode: boolean): number {
    const { n, X, Y, cum } = this;
    const laneRead = this.nearest(j).lane;
    // Spur der Einfahrt: die Spur vor der Beuge (ein Spurwechsel mitten in der Beuge zählt nicht)
    let laneFrom = Math.round(prev.kind === 'floor' ? this.laneAt(prev, Math.min(bend, apex)) : prev.lane);
    // Richtung in die Tiefe, wenn der Rückweg keine andere Spur erreicht: aus seiner Bildhöhe (höher = hinten)
    let before = 0;
    let nb = 0;
    for (let k = bend; k >= prev.i0 && cum[bend] - cum[k] <= 5; k--) {
      before += Y[k];
      nb++;
    }
    let after = 0;
    let na = 0;
    for (let k = apex + 1; k <= j; k++) {
      after += Y[k];
      na++;
    }
    const yDir = na && nb && after / na < before / nb ? -1 : 1;
    const yEntry = floorMode ? this.ground(X[apex] / laneScale(laneFrom), laneFrom) + this.clearance : this.absHeight(apex, laneFrom);
    const speedLanes = lanesForRadius(radiusForDrop(this.hMax - yEntry));
    const drawnR = floorMode ? 0 : this.drawnRadius(prev, apex, dirX, j);
    // Schluss-Kehre: der Strich endet an der Station, die Kehre liegt kurz davor → sie zielt auf die Spur der Station
    const closing = floorMode && this.closeLane !== null && cum[n - 1] - cum[apex] <= CLOSE_U_REACH;
    // Spurenzahl und Richtung des Halbkreises von einer Einfahrtsspur aus: gezeichnete Spuren (Boden) bzw. gezeichnete
    // Weite (Höhe), bei Tempo mehr, mindestens eine Spur, höchstens die Bühne; ohne Platz dreht die Richtung
    const pick = (lf: number): { laneTo: number; R: number } => {
      if (closing && this.closeLane !== lf) return { laneTo: this.closeLane!, R: (Math.abs(this.closeLane! - lf) * LANE_DEPTH) / 2 };
      let dirZ = laneRead !== lf ? Math.sign(laneRead - lf) : yDir;
      const drawnLanes = floorMode ? Math.abs(laneRead - lf) : lanesForRadius(drawnR);
      let lanes = Math.min(lanesForRadius(TURN_RADIUS_MAX), Math.max(1, drawnLanes, speedLanes));
      // Die gezeichnete Richtung gilt; nur ohne jeden Platz dreht sie. Reicht der Platz nicht für den Tempo-Radius,
      // wird die Kehre so weit wie möglich und der Spieler sieht es in der Fahrt (oder schiebt die Spur mit dem Handle)
      const room = (d: number) => Math.max(0, Math.round(d > 0 ? LANE_MAX - lf : lf - LANE_MIN));
      if (room(dirZ) === 0 && room(-dirZ) > 0) dirZ = -dirZ;
      lanes = Math.max(1, Math.min(lanes, room(dirZ)));
      const laneTo = Math.max(LANE_MIN, Math.min(LANE_MAX, lf + dirZ * lanes));
      return { laneTo, R: (Math.abs(laneTo - lf) * LANE_DEPTH) / 2 };
    };
    let { laneTo, R } = pick(laneFrom);
    // Einfahrt: so weit vor dem Scheitel, wie der Halbkreis weit ist
    const entryLimit = Math.max(prev.i0, this.lockIdx);
    let i0 = apex;
    while (i0 > entryLimit && (X[apex] - X[i0 - 1]) * dirX <= R * laneScale(laneFrom)) i0--;
    if (prev.kind === 'floor') {
      prev.switches = prev.switches.filter((s) => s.i <= i0);
      const laneEntry = this.laneAt(prev, i0);
      if (laneEntry !== laneFrom) {
        // Die Einfahrt liegt noch vor einem Spurwechsel: Kehre von dort aus
        laneFrom = laneEntry;
        ({ laneTo, R } = pick(laneFrom));
      }
    }
    prev.i1 = i0;
    // Ausfahrt: der Rückweg ist um die Kurvenweite zurück; läuft der Strich vorher wieder vorwärts oder endet er,
    // bleibt der Bogen ein Teilbogen
    const rk = R * laneScale(laneTo);
    let maxRetreat = 0;
    for (let m = apex; m <= j; m++) maxRetreat = Math.max(maxRetreat, (X[apex] - X[m]) * dirX);
    let i1 = j;
    let full = false;
    for (let m = j; m < n; m++) {
      const retreat = (X[apex] - X[m]) * dirX;
      maxRetreat = Math.max(maxRetreat, retreat);
      i1 = m;
      if (retreat >= rk - 1e-6) {
        full = true;
        break;
      }
      if (maxRetreat - retreat >= TURN_DETECT) break;
    }
    const thetaEnd = full ? Math.PI : Math.PI - Math.asin(Math.max(-1, Math.min(1, 1 - maxRetreat / rk)));
    this.sections.push({ kind: 'turn', i0, i1, apex, laneFrom, laneTo, dirX, floor: floorMode, R, thetaEnd });
    this.lane = laneTo;
    this.dir = -dirX;
    this.mode = floorMode ? 'floor' : 'height';
    if (floorMode) this.hMax = Math.max(this.hMax, yEntry);
    return i1;
  }
}

// ---------------------------------------------------------------------- Geometrie

interface Transition {
  s0: number;
  s1: number;
  zFrom: number;
  zTo: number;
}

/** Tiefenverlauf eines Boden-Abschnitts: S-Kurven an den Spurwechseln, überlappende werden verschmolzen */
function buildTransitions(sc: Scanner, sec: FloorSection, zStart: number): Transition[] {
  const sA = sc.cum[sec.i0];
  const sB = sc.cum[sec.i1];
  const list: Transition[] = [];
  const push = (center: number, L: number, zFrom: number, zTo: number, fromStart: boolean) => {
    // Passt die S-Kurve nicht in den Abschnitt, wird sie beschnitten, nicht verschoben: Was schon gezeichnet ist,
    // bleibt, wo es ist (eine spätere Kehre darf den Anfang eines Spurwechsels nicht mehr bewegen)
    const s0 = Math.max(sA, fromStart ? center : center - L / 2);
    const s1 = Math.min(sB, fromStart ? center + L : center + L / 2);
    if (s1 <= s0) return;
    const last = list[list.length - 1];
    if (last && s0 < last.s1) {
      last.zTo = zTo;
      last.s1 = Math.min(sB, Math.max(last.s1, s1));
    } else list.push({ s0, s1, zFrom, zTo });
  };
  let z = zStart;
  if (Math.abs(sec.lane - zStart) > 1e-6) {
    push(sA, laneChangeLength(sec.lane - zStart, sc.hMax), zStart, sec.lane, true);
    z = sec.lane;
  }
  for (const sw of sec.switches) {
    if (sw.lane === z) continue;
    const drop = sw.hMax - (sc.ground(sc.X[sw.i], z) + sc.clearance);
    push(sc.cum[sw.i], laneChangeLength(sw.lane - z, drop), z, sw.lane, false);
    z = sw.lane;
  }
  return list;
}

function zOfTransitions(list: Transition[], zStart: number, s: number): number {
  let z = zStart;
  for (const t of list) {
    if (s <= t.s0) return z;
    if (s < t.s1) return t.zFrom + (t.zTo - t.zFrom) * smoothstep((s - t.s0) / Math.max(1e-6, t.s1 - t.s0));
    z = t.zTo;
  }
  return z;
}

/** Nach einer Kehre oder einem Looping: Versatz in x und Höhe, die über die folgenden Meter abgebaut werden */
interface Carry {
  xShift: number;
  yAbs: number;
  runout: number;
  blendY: number;
  blendX: number;
  /** Bogenlänge des Strichs am Bogenende */
  s0: number;
}

export function interpretGesture(pts: Vec2[], opts: GestureOptions = {}): GestureResult {
  const sc = new Scanner(pts, opts);
  sc.run();
  const { X, Y, cum, ang } = sc;
  const ground = sc.ground;
  const clearance = sc.clearance;
  const out: InterpretedPoint[] = [];
  const events: StrokeEvent[] = [];
  let lastSrc = -1;
  let carry: Carry | null = null;
  const lastP = (): InterpretedPoint | null => out[out.length - 1] ?? null;
  const push = (p: InterpretedPoint): number => {
    if (carry) {
      const d = (p.s ?? carry.s0) - carry.s0;
      const fx = 1 - smoothstep(d / carry.blendX);
      if (fx > 0) p.x += carry.xShift * fx;
      const fy = smoothstep((d - carry.runout) / carry.blendY);
      const yAbsRead = p.y + ground(p.x, p.z);
      const yAbs = carry.yAbs + (yAbsRead - carry.yAbs) * fy;
      p.y = Math.max(0, yAbs - ground(p.x, p.z));
      if (fx <= 0 && fy >= 1) carry = null;
    }
    out.push(p);
    return out.length - 1;
  };
  let zPrev = opts.startZ ?? (sc.sections.length ? sectionStartLane(sc.sections[0]) : sc.lane);
  for (const sec of sc.sections) {
    if (sec.kind === 'floor') {
      const trans = buildTransitions(sc, sec, zPrev);
      let ext = X[sec.i0];
      for (let i = sec.i0; i <= sec.i1; i++) {
        if (i === lastSrc) continue;
        if (sec.dir === 0 || (X[i] - ext) * sec.dir >= 0) ext = X[i];
        const z = zOfTransitions(trans, zPrev, cum[i]);
        push({ x: ext / laneScale(z), y: 0, z, mode: 'floor', s: cum[i] });
        lastSrc = i;
      }
      zPrev = zOfTransitions(trans, zPrev, cum[sec.i1]);
    } else if (sec.kind === 'height') {
      const lane = sec.lane;
      const landLane = sec.landLane;
      const sLand = cum[sec.i1];
      const blend = landLane !== null && landLane !== lane ? Math.min(LAND_BLEND, 0.6 * (sLand - cum[sec.i0])) : 0;
      let ext = X[sec.i0];
      for (let i = sec.i0; i <= sec.i1; i++) {
        if (i === lastSrc) continue;
        const raw = i >= sec.rawFrom;
        if (!raw && (sec.dir === 0 || (X[i] - ext) * sec.dir >= 0)) ext = X[i];
        const xs = raw ? X[i] : ext;
        let z = lane;
        if (blend > 0 && cum[i] > sLand - blend) z = lane + (landLane! - lane) * smoothstep((cum[i] - (sLand - blend)) / blend);
        const k = laneScale(z);
        const gY = ground(xs / k, z) * k + laneRise(z);
        push({ x: xs / k, y: Math.max(0, (Y[i] - gY) / k), z, mode: 'height', s: cum[i] });
        lastSrc = i;
      }
      zPrev = landLane ?? lane;
    } else if (sec.kind === 'turn') {
      const l = lastP();
      const xE = l ? l.x : X[sec.i0] / laneScale(sec.laneFrom);
      const zE = sec.laneFrom;
      const yEntryAbs = l ? l.y + ground(l.x, l.z) : ground(xE, zE);
      // Die Kurve liegt eben: auf Einfahrtshöhe, mindestens über dem höchsten Gelände unter dem Bogen
      const steps = Math.max(6, Math.ceil((sec.thetaEnd * sec.R) / CIRCLE_STEP));
      const arcX = (th: number) => xE + sec.dirX * sec.R * Math.sin(th);
      const arcZ = (th: number) => zE + ((sec.laneTo - zE) * (1 - Math.cos(th))) / 2;
      let yA = sec.floor ? ground(xE, zE) + clearance : yEntryAbs;
      for (let k = 0; k <= steps; k++) {
        const th = (sec.thetaEnd * k) / steps;
        yA = Math.max(yA, ground(arcX(th), arcZ(th)) + clearance);
      }
      // Anfahrt anheben, wenn die Kurve höher liegt als der Strich davor (Gelände): 6 m eben, dann über 16 m
      // (Abstand waagerecht gemessen, die angehobenen Punkte selbst dürfen die Rampe nicht verkürzen)
      if (out.length && yA > yEntryAbs + 1e-6) {
        let d = 0;
        for (let m = out.length - 1; m > 0; m--) {
          const a = out[m];
          const b = out[m - 1];
          d += Math.hypot(a.x - b.x, (a.z - b.z) * LANE_DEPTH);
          const f = 1 - smoothstep((d - TURN_RUNOUT) / TURN_BLEND_Y);
          if (f <= 0) break;
          const abs = b.y + ground(b.x, b.z);
          const want = abs + (yA - abs) * f;
          if (want > abs) b.y = want - ground(b.x, b.z);
        }
        if (l) l.y = Math.max(l.y, yA - ground(l.x, l.z));
      }
      const mid = Math.max(1, Math.round((steps * Math.min(Math.PI / 2, sec.thetaEnd)) / sec.thetaEnd));
      let apexIdx = -1;
      const sA = cum[sec.i0];
      const sB = cum[sec.i1];
      for (let k = 1; k <= steps; k++) {
        const th = (sec.thetaEnd * k) / steps;
        const x = arcX(th);
        const z = arcZ(th);
        const idx = push({ x, y: Math.max(0, yA - ground(x, z)), z, mode: sec.floor ? 'floor' : 'height', s: sA + ((sB - sA) * k) / steps });
        if (k === mid) apexIdx = idx;
      }
      if (apexIdx >= 0) events.push({ kind: 'turn', index: apexIdx, dir: Math.sign(sec.laneTo - sec.laneFrom) || 1, radius: sec.R, floor: sec.floor });
      lastSrc = sec.i1;
      zPrev = sec.laneTo;
      if (sec.thetaEnd >= Math.PI - 1e-6) {
        const end = lastP()!;
        const xNext = X[sec.i1] / laneScale(sec.laneTo);
        const drop = Math.max(0, sc.hMax - yA);
        // Versatz in x (Perspektive: hinten ist x = X/k größer) so lang abbauen, dass die Bahn dabei nie rückwärts läuft
        const xShift = end.x - xNext;
        carry = { xShift, yAbs: yA, runout: TURN_RUNOUT, blendY: Math.max(TURN_BLEND_Y, Math.sqrt(6 * 4 * 1.5 * drop)), blendX: Math.max(TURN_BLEND, 2 * Math.abs(xShift)), s0: sB };
      }
    } else {
      // Looping: Kreis in der Spur ab dem Einfahrtspunkt, Tangente aus dem Strich, leicht versetzte Ausfahrt
      const l = lastP();
      const lane = sec.lane;
      const k = laneScale(lane);
      const xE = l ? l.x : X[sec.i0] / k;
      const yE = l ? l.y + ground(l.x, l.z) : ground(xE, lane);
      const a = ang[Math.max(0, Math.min(sc.n - 1, sec.i0))];
      const tx = Math.cos(a);
      const ty = Math.sin(a);
      const nx = -sec.sign * ty;
      const ny = sec.sign * tx;
      const R = sec.R;
      const cx = xE + R * nx;
      const cy = yE + R * ny;
      const drift = Math.max(1.2, 0.2 * R);
      const steps = Math.max(12, Math.ceil((2 * Math.PI * R) / CIRCLE_STEP));
      const from = out.length - 1;
      let apexIdx = -1;
      let exitIdx = -1;
      for (let m = 1; m <= steps; m++) {
        const th = (2 * Math.PI * m) / steps;
        const x = cx - R * nx * Math.cos(th) + R * tx * Math.sin(th) + (drift * th) / (2 * Math.PI) * tx;
        const y = cy - R * ny * Math.cos(th) + R * ty * Math.sin(th) + (drift * th) / (2 * Math.PI) * ty;
        const idx = push({ x, y: Math.max(0, y - ground(x, lane)), z: lane, mode: 'height', s: cum[sec.i0] + ((cum[sec.i1] - cum[sec.i0]) * m) / steps });
        if (m === Math.round(steps / 2)) apexIdx = idx;
        exitIdx = idx;
      }
      events.push({ kind: 'loop', index: apexIdx, from: Math.max(0, from), to: exitIdx });
      lastSrc = sec.i1;
      zPrev = lane;
      const end = lastP()!;
      const xShift = end.x - X[sec.i1] / k;
      carry = { xShift, yAbs: end.y + ground(end.x, end.z), runout: 0, blendY: LOOP_BLEND, blendX: Math.max(LOOP_BLEND, 2 * Math.abs(xShift)), s0: cum[sec.i1] };
    }
  }
  if (!out.length && sc.n) {
    const z = sc.lane;
    push({ x: X[0] / laneScale(z), y: sc.mode === 'height' ? sc.heightAt(0, z) : 0, z, mode: sc.mode, s: 0 });
  }
  events.sort((a, b) => a.index - b.index);
  return { points: out, events };
}

function sectionStartLane(sec: Section): number {
  switch (sec.kind) {
    case 'floor': case 'height': case 'loop': return sec.lane;
    case 'turn': return sec.laneFrom;
  }
}

/** Diagnose: die Abschnitte, die der Interpreter aus dem Strich liest (für scripts/debug-stroke.ts) */
export function scanSections(pts: Vec2[], opts: GestureOptions = {}): Array<Record<string, unknown>> {
  const sc = new Scanner(pts, opts);
  sc.run();
  return sc.sections.map((s) => ({ ...s }));
}
