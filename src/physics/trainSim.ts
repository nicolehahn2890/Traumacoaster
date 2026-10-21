/**
 * Zug-Simulation entlang der Bogenlänge der 3D-Bahn.
 * - Station gibt nur einen kleinen Schubs; auf ebener Strecke rollt der Zug aus und bleibt stehen.
 * - Kettenzug greift nur an einem Anstieg nahe der Station, Launch beschleunigt auf dem ersten Stück.
 * - Kurven werden automatisch überhöht (Schräglage aus Tempo und Radius) oder manuell per Roll-Handle.
 * - g-Kräfte im Wagen-System (vorwärts, oben, seitlich) für Fahrgäste, Entgleisen und Ziele.
 */
import type { CoinSpec, LevelDef } from '@/levels/types';
import type { TrackPath, TrackSamples, TrackState } from '@/track/model';
import { carFrame, stateAt } from '@/track/model';
import { LANE_DEPTH, toStage } from '@/track/stage';
import type { Terrain } from './terrain';
import { FlightSim, type FlightKind } from './flightSim';

export const G = 9.81;

export interface SkinPhysics {
  friction: number;
  lateralLimit: number;
}

export const SKIN_PHYSICS: Record<string, SkinPhysics> = {
  skinWood: { friction: 0.015, lateralLimit: 2.0 },
  skinHybrid: { friction: 0.013, lateralLimit: 2.4 },
  skinMine: { friction: 0.016, lateralLimit: 2.2 },
  skinSteel: { friction: 0.01, lateralLimit: 3.0 },
  skinGold: { friction: 0.01, lateralLimit: 3.0 },
  skinNeon: { friction: 0.01, lateralLimit: 3.2 },
  skinIce: { friction: 0.004, lateralLimit: 2.6 },
  skinGhost: { friction: 0.014, lateralLimit: 2.3 },
  skinLava: { friction: 0.011, lateralLimit: 3.0 },
  skinSpace: { friction: 0.008, lateralLimit: 3.5 },
};

export type RidePhase = 'lift' | 'launch' | 'coast' | 'done' | 'failed' | 'flying';
export type FailReason = 'derail' | 'fall' | 'stall' | 'eject' | 'water' | 'ejectSide' | 'openEnd';

export interface CarState {
  index: number;
  s: number;
  x: number;
  y: number;
  z: number; // Spuren
  /** 3D-Rahmen: vorwärts, oben (mit Schräglage), seitlich */
  tx: number; ty: number; tz: number;
  upx: number; upy: number; upz: number;
  sx: number; sy: number; sz: number;
  /** Schräglage (Radiant) */
  bank: number;
  /** Winkel der projizierten Fahrtrichtung auf der Bühne (für Billboards) */
  angle: number;
  gSeat: number;
  gFwd: number;
  gLat: number;
  feltFwd: number;
  feltUp: number;
  feltSide: number;
  inTunnel: boolean;
  inverted: boolean;
  /** Geschwindigkeit des Wagens in der Welt (x, y in m/s), für Übergaben an die Fahrgäste und die Darstellung */
  vx: number;
  vy: number;
}

/** Flache Kopie eines Wagenzustands (für Vorzustände und Render-Puffer) */
export function copyCar(src: CarState, dst: CarState): CarState {
  return Object.assign(dst, src);
}

export interface RideStats {
  time: number;
  maxSpeed: number;
  maxG: number;
  minG: number;
  maxLatG: number;
  airtime: number;
  coins: number;
  tunnels: number;
  boosters: number;
  splashes: number;
  inversions: number;
  blackout: boolean;
  brakesUsed: boolean;
  distance: number;
}

export interface RideEvent {
  kind: 'coin' | 'tunnelEnter' | 'tunnelExit' | 'booster' | 'brake' | 'splash' | 'liftStart' | 'liftEnd' | 'launchEnd' | 'peak' | 'fail' | 'finish' | 'inversion' | 'wheelLock';
  time: number;
  car?: number;
  index?: number;
  reason?: FailReason;
  x?: number;
  y?: number;
  z?: number;
}

export interface TrainSimOptions {
  cars: number;
  carLength: number;
  skin: string;
  frictionScale: number;
  gravityScale: number;
  startType: TrackPath['startType'];
  coins: CoinSpec[];
  terrain: Terrain;
  allowTunnels: boolean;
}

const STATION_PUSH = 2.0; // m/s: rollt auf ebener Strecke gut 10 m aus und bleibt stehen
const LIFT_SPEED = 6.0; // zügiger Kettenzug, damit der Start nicht zäh wirkt
const VERTICAL_LIFT_SPEED = 5.5;
const LIFT_SEARCH = 30; // m: so weit nach der Station darf der Anstieg beginnen
const LIFT_MIN_SLOPE = 0.06;
const LAUNCH_LENGTH = 26;
const LAUNCH_ACCEL = 12;
/** Offenes Ende (Absperrband): ab diesem Tempo blockieren die Räder auf den letzten Metern und der Zug fliegt ab, darunter kippt er */
const OPEN_END_FLY_SPEED = 6;
const WHEEL_LOCK_SECONDS = 0.3;
const WHEEL_LOCK_DECEL = 25;
/** unter dieses Tempo bremst die Blockade nicht (der Zug soll über die Kante, nicht davor stehen bleiben) */
const WHEEL_LOCK_FLOOR = 2;
const HYDRO_ACCEL = 24;
const SWING_ACCEL = 16;
const BOOSTER_ACCEL = 8;
const BRAKE_TARGET = 4;
const RETURN_SPEED_LIMIT = 8;
const RETURN_LOOKAHEAD = 14;
const DRAG = 0.0008;
const MAX_CURVATURE = 1 / 2.5;
const BLACKOUT_G = 7;

export class TrainSim {
  readonly samples: TrackSamples;
  readonly path: TrackPath;
  readonly opts: TrainSimOptions;
  readonly cars: CarState[] = [];
  /** Wagenzustände vor dem letzten step(): Das Rendering interpoliert zwischen prevCars und cars */
  readonly prevCars: CarState[] = [];
  readonly events: RideEvent[] = [];
  readonly stats: RideStats = {
    time: 0, maxSpeed: 0, maxG: 1, minG: 1, maxLatG: 0, airtime: 0, coins: 0, tunnels: 0, boosters: 0, splashes: 0, inversions: 0, blackout: false, brakesUsed: false, distance: 0,
  };
  readonly collected: boolean[];
  phase: RidePhase = 'coast';
  failReason: FailReason | null = null;
  /** Freiflug nach Entgleisen, Fall oder offenem Ende (Phase 'flying') */
  flight: FlightSim | null = null;
  /** Restzeit der Radblockade vor dem offenen Ende (Funken), 0 = keine */
  wheelLock = 0;
  private lockArmed = false;
  s = 0;
  v = 0;
  t = 0;
  sinceFail = 0;
  liftStart = -1;
  liftEnd = -1;
  private liftActive = false;
  private wasInTunnel: boolean[] = [];
  private passedElements = new Set<number>();
  private invertedPrev = false;
  private fallTimer = 0;
  private stallTimer = 0;
  private lapDone = false;
  private peakReported = false;
  /** Tangentialbeschleunigung des Zugs im letzten Teilschritt (Kettenzug, Launch, Bremse, Reibung, Hangabtrieb) */
  private aTangential = 0;

  constructor(samples: TrackSamples, path: TrackPath, opts: TrainSimOptions) {
    this.samples = samples;
    this.path = path;
    this.opts = opts;
    this.collected = opts.coins.map(() => false);
    for (let i = 0; i < opts.cars; i++) {
      this.cars.push({ index: i, s: 0, x: 0, y: 0, z: 0, tx: 1, ty: 0, tz: 0, upx: 0, upy: 1, upz: 0, sx: 0, sy: 0, sz: 1, bank: 0, angle: 0, gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: G, feltSide: 0, inTunnel: false, inverted: false, vx: 0, vy: 0 });
      this.wasInTunnel.push(false);
    }
    const launch = opts.startType === 'launch' || opts.startType === 'hydro' || opts.startType === 'swing';
    if (!launch) this.findLift();
    this.phase = launch ? 'launch' : 'coast';
    this.v = launch ? 0.5 : STATION_PUSH;
    this.updateCars();
    for (const c of this.cars) this.prevCars.push({ ...c });
  }

  /** Anstieg nahe der Station suchen: Lift von dessen Beginn bis zum ersten Scheitel */
  private findLift(): void {
    const sm = this.samples;
    let start = -1;
    for (let i = 1; i < sm.count; i++) {
      if (sm.s[i] > LIFT_SEARCH && start < 0) break;
      if (start < 0 && sm.t3y[i] > LIFT_MIN_SLOPE) start = i;
      if (start >= 0 && sm.t3y[i] <= 0 && sm.s[i] - sm.s[start] > 1) {
        this.liftStart = sm.s[start];
        this.liftEnd = sm.s[i];
        return;
      }
    }
    if (start >= 0) {
      this.liftStart = sm.s[start];
      this.liftEnd = sm.length * 0.5;
    }
  }

  get skinPhysics(): SkinPhysics {
    return SKIN_PHYSICS[this.opts.skin] ?? SKIN_PHYSICS.skinWood;
  }
  get finished(): boolean {
    return this.phase === 'done' || this.phase === 'failed' || this.phase === 'flying';
  }
  get kmh(): number {
    return Math.abs(this.v) * 3.6;
  }

  step(dt: number): void {
    for (let i = 0; i < this.cars.length; i++) copyCar(this.cars[i], this.prevCars[i]);
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.substep(h);
  }

  private substep(h: number): void {
    if (this.phase === 'flying' && this.flight) {
      this.sinceFail += h;
      this.flight.step(h);
      this.flight.writeTo(this.cars);
      // Tempo des ersten Wagens für die Anzeige (vorzeichenlos, die Bahn spielt keine Rolle mehr)
      this.v = Math.hypot(this.cars[0].vx, this.cars[0].vy);
      return;
    }
    if (this.phase === 'failed') {
      this.sinceFail += h;
      this.integrate(h, true);
      this.updateCars();
      return;
    }
    if (this.phase === 'done') return;
    this.integrate(h, false);
    this.updateCars();
    this.t += h;
    this.stats.time = this.t;
    this.checkEvents(h);
  }

  private integrate(h: number, afterFail: boolean): void {
    const g = G * this.opts.gravityScale;
    const mu = this.skinPhysics.friction * this.opts.frictionScale;
    const L = this.samples.length;
    let aGrav = 0;
    let anyAuto = false;
    for (let c = 0; c < this.opts.cars; c++) {
      const st = stateAt(this.samples, this.s - c * this.opts.carLength);
      aGrav += -g * st.t3y;
      if (st.auto) anyAuto = true;
    }
    aGrav /= this.opts.cars;
    const vSign = this.v > 0 ? 1 : this.v < 0 ? -1 : 0;
    let a = aGrav - mu * g * vSign - DRAG * this.v * Math.abs(this.v);

    if (!afterFail) {
      // Kettenzug: nur am Anstieg
      if (this.liftStart >= 0 && this.s >= this.liftStart && this.s < this.liftEnd && this.phase !== 'launch') {
        const liftSpeed = this.opts.startType === 'verticalLift' ? VERTICAL_LIFT_SPEED : LIFT_SPEED;
        if (!this.liftActive) {
          this.liftActive = true;
          this.phase = 'lift';
          this.events.push({ kind: 'liftStart', time: this.t });
        }
        // Kette hält das Tempo (auch wenn der Zug genau Kettentempo fährt): sonst wechselte die
        // Tangentialbeschleunigung in jedem Teilschritt zwischen Hang und Kette, und die Fahrgäste würden zittern
        if (this.v <= liftSpeed + 1e-9) {
          this.v = liftSpeed;
          a = Math.max(a, 0);
        }
      } else if (this.liftActive) {
        this.liftActive = false;
        this.phase = 'coast';
        this.events.push({ kind: 'liftEnd', time: this.t });
      }
      if (this.phase === 'launch') {
        const accel = this.opts.startType === 'hydro' ? HYDRO_ACCEL : this.opts.startType === 'swing' ? SWING_ACCEL : LAUNCH_ACCEL;
        if (this.s < LAUNCH_LENGTH) a += accel;
        else {
          this.phase = 'coast';
          this.events.push({ kind: 'launchEnd', time: this.t });
        }
      }
      // Elemente
      for (let i = 0; i < this.path.elements.length; i++) {
        const e = this.path.elements[i];
        const ds = ((this.s - e.s) % L + L) % L;
        if (ds >= 0 && ds < e.length) {
          if (e.kind === 'booster' || e.kind === 'launchBlock') {
            a += e.kind === 'launchBlock' ? LAUNCH_ACCEL : BOOSTER_ACCEL;
            if (!this.passedElements.has(i)) {
              this.passedElements.add(i);
              this.stats.boosters++;
              this.events.push({ kind: 'booster', time: this.t, index: i });
            }
          } else if (e.kind === 'brake') {
            if (this.v > BRAKE_TARGET) a -= 10;
            if (!this.passedElements.has(i)) {
              this.passedElements.add(i);
              this.stats.brakesUsed = true;
              this.events.push({ kind: 'brake', time: this.t, index: i });
            }
          } else if (e.kind === 'splash') {
            a -= 3.5;
            if (!this.passedElements.has(i)) {
              this.passedElements.add(i);
              this.stats.splashes++;
              this.events.push({ kind: 'splash', time: this.t, index: i });
            }
          }
        }
      }
      const ahead = stateAt(this.samples, this.s + RETURN_LOOKAHEAD);
      if ((anyAuto || ahead.auto) && this.v > RETURN_SPEED_LIMIT) a -= 7;
      // Offenes Ende (Absperrband): kommt der Zug mit Tempo an, blockieren die Räder auf den letzten Metern
      // (Funken), so dass die Blockade genau an der Kante endet; danach fliegt er ab (fail 'openEnd' in checkEvents)
      if (!this.samples.closed) {
        if (!this.lockArmed && this.v > OPEN_END_FLY_SPEED) {
          const vEnd = Math.max(WHEEL_LOCK_FLOOR, this.v - WHEEL_LOCK_DECEL * WHEEL_LOCK_SECONDS);
          const lockDist = (WHEEL_LOCK_SECONDS * (this.v + vEnd)) / 2;
          if (this.s >= L - lockDist) {
            this.lockArmed = true;
            this.wheelLock = WHEEL_LOCK_SECONDS;
            this.events.push({ kind: 'wheelLock', time: this.t, car: 0 });
          }
        }
        if (this.wheelLock > 0) {
          this.wheelLock = Math.max(0, this.wheelLock - h);
          if (this.v > WHEEL_LOCK_FLOOR) a -= WHEEL_LOCK_DECEL;
        }
      }
    }

    // Die Fahrgäste spüren die echte Beschleunigung des Zugs: am Kettenzug (a ≥ 0 trotz Hang) drückt der Hang
    // sie in die Lehne, der Launch presst sie in den Sitz, die Bremse wirft sie nach vorn. Die Sprünge der
    // Geschwindigkeit beim Einklinken der Kette sind nicht enthalten (die Kette greift weich).
    this.aTangential = a;
    this.v += a * h;
    if (this.wheelLock > 0 && this.v < WHEEL_LOCK_FLOOR) this.v = WHEEL_LOCK_FLOOR;
    // Stillstand: auf ebener Strecke oder am Berg → nicht geschafft
    if (!afterFail && this.phase === 'coast' && this.v <= 0.03) {
      this.stallTimer += h;
      if (this.stallTimer > 0.4 || aGrav < -0.05) {
        this.fail('stall');
        this.v = Math.min(this.v, -0.02);
      }
    } else this.stallTimer = 0;
    this.s += this.v * h;
    this.stats.distance += Math.abs(this.v) * h;
    if (!afterFail && this.samples.closed && this.s >= L && this.phase === 'coast') this.lapDone = true;
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, Math.abs(this.v));
  }

  private updateCars(): void {
    const g = G * this.opts.gravityScale;
    const L = this.samples.length;
    for (const car of this.cars) {
      const s = this.s - car.index * this.opts.carLength;
      const st: TrackState = stateAt(this.samples, s);
      car.s = ((s % L) + L) % L;
      car.x = st.x;
      car.y = st.y;
      car.z = st.z;
      const frame = carFrame(st, Math.abs(this.v), g);
      car.tx = frame.T.x; car.ty = frame.T.y; car.tz = frame.T.z;
      car.upx = frame.U.x; car.upy = frame.U.y; car.upz = frame.U.z;
      car.sx = frame.S.x; car.sy = frame.S.y; car.sz = frame.S.z;
      car.bank = frame.bank;
      // projizierte Fahrtrichtung auf der Bühne
      const p0 = toStage(st.x, st.y, st.z);
      const p1 = toStage(st.x + st.t3x, st.y + st.t3y, st.z + st.t3z / LANE_DEPTH);
      car.angle = Math.atan2(p1.Y - p0.Y, p1.X - p0.X);
      car.vx = st.t3x * this.v;
      car.vy = st.t3y * this.v;
      // Beschleunigung: Normalanteil v²·k (Mindestradius 2,5 m) + Tangentialbeschleunigung des Zugs
      const v2 = this.v * this.v;
      const aTan = this.aTangential;
      const kMag = Math.hypot(st.k3x, st.k3y, st.k3z);
      const kScale = kMag > MAX_CURVATURE ? MAX_CURVATURE / kMag : 1;
      const fx = v2 * st.k3x * kScale + aTan * st.t3x;
      const fy = v2 * st.k3y * kScale + aTan * st.t3y + g;
      const fz = v2 * st.k3z * kScale + aTan * st.t3z;
      car.feltFwd = fx * car.tx + fy * car.ty + fz * car.tz;
      car.feltUp = fx * car.upx + fy * car.upy + fz * car.upz;
      car.feltSide = fx * car.sx + fy * car.sy + fz * car.sz;
      car.gSeat = car.feltUp / G;
      car.gFwd = car.feltFwd / G;
      car.gLat = Math.abs(car.feltSide) / G;
      car.inverted = car.upy < -0.2;
      car.inTunnel = this.opts.terrain.insideMountain(st.x, st.y, st.z);
    }
  }

  private checkEvents(h: number): void {
    const front = this.cars[0];
    const L = this.samples.length;
    this.stats.maxG = Math.max(this.stats.maxG, front.gSeat);
    this.stats.minG = Math.min(this.stats.minG, front.gSeat);
    this.stats.maxLatG = Math.max(this.stats.maxLatG, front.gLat);
    if (front.gSeat < 0) this.stats.airtime += h;
    if (front.gSeat > BLACKOUT_G) this.stats.blackout = true;
    if (front.inverted && !this.invertedPrev) {
      this.stats.inversions++;
      this.events.push({ kind: 'inversion', time: this.t, car: 0 });
    }
    this.invertedPrev = front.inverted;
    if (!this.peakReported && this.phase === 'coast') {
      const next = stateAt(this.samples, this.s + 1);
      if (next.y < front.y - 0.05 && front.y > 3) {
        this.peakReported = true;
        this.events.push({ kind: 'peak', time: this.t, x: front.x, y: front.y, z: front.z });
      }
    }
    for (let i = 0; i < this.opts.coins.length; i++) {
      if (this.collected[i]) continue;
      const c = this.opts.coins[i];
      const lane = c.lane ?? 0;
      for (const car of this.cars) {
        if (Math.abs(car.z - lane) > 0.5) continue;
        if (Math.hypot(car.x - c.x, car.y - c.y) < 2.0) {
          this.collected[i] = true;
          this.stats.coins++;
          this.events.push({ kind: 'coin', time: this.t, index: i, car: car.index });
          break;
        }
      }
    }
    for (const car of this.cars) {
      const was = this.wasInTunnel[car.index];
      if (car.inTunnel && !was && car.index === 0) {
        this.stats.tunnels++;
        this.events.push({ kind: 'tunnelEnter', time: this.t, car: 0 });
      } else if (!car.inTunnel && was && car.index === 0) this.events.push({ kind: 'tunnelExit', time: this.t, car: 0 });
      this.wasInTunnel[car.index] = car.inTunnel;
    }
    const st = stateAt(this.samples, this.s);
    // Offenes Ende erreicht: Absperrband, der Zug fliegt ab (Räder waren blockiert) oder kippt über die Kante
    if (!this.samples.closed && this.v > 0 && this.s >= L - 0.05) {
      this.fail('openEnd', 0);
      return;
    }
    if (!st.auto) {
      for (const car of this.cars) {
        if (car.gLat > this.skinPhysics.lateralLimit) {
          this.fail('derail', car.index);
          return;
        }
      }
    }
    if (front.inverted && front.gSeat < -0.15) {
      this.fallTimer += h;
      if (this.fallTimer > 0.12) {
        this.fail('fall', 0);
        return;
      }
    } else this.fallTimer = 0;
    if (!st.auto && this.opts.terrain.waterAt(front.x, front.z) && front.y < 0.35) {
      const onSplash = this.path.elements.some((e) => e.kind === 'splash' && ((this.s - e.s) % L + L) % L < e.length + 2);
      if (!onSplash) {
        this.fail('water', 0);
        return;
      }
    }
    if (this.lapDone && this.s >= L + this.opts.cars * this.opts.carLength) {
      this.phase = 'done';
      this.events.push({ kind: 'finish', time: this.t });
    }
  }

  fail(reason: FailReason, car = 0): void {
    if (this.phase === 'failed' || this.phase === 'flying') return;
    this.phase = 'failed';
    this.failReason = reason;
    this.events.push({ kind: 'fail', time: this.t, reason, car });
    // Entgleisen und Fall: der Zug verlässt die Schiene und fliegt (zur Kamera oder von ihr weg, je nach Querkraft)
    if (reason === 'derail' || reason === 'fall') {
      const c = this.cars[car] ?? this.cars[0];
      const side = c.feltSide > 0 ? 1 : c.feltSide < 0 ? -1 : 1;
      this.startFlight(reason === 'derail' ? 'derail' : 'fall', side);
    } else if (reason === 'openEnd') {
      // mit Tempo (Räder waren blockiert) fliegt der Zug ab, sonst kippt er langsam über die Kante
      this.wheelLock = 0;
      this.startFlight(this.lockArmed ? 'launch' : 'tip', 1);
    }
  }

  /** Zug in den Freiflug übergeben (die Wagenzustände liefern Lage und Geschwindigkeit) */
  startFlight(kind: FlightKind, side = 1): void {
    this.flight = new FlightSim(this.cars, { terrain: this.opts.terrain, gravity: this.opts.gravityScale, carLength: this.opts.carLength, kind, side });
    this.phase = 'flying';
  }
}

export function simOptionsForLevel(level: LevelDef, path: TrackPath, terrain: Terrain, skin: string, allowTunnels: boolean): TrainSimOptions {
  return {
    cars: level.cars ?? 2, carLength: 2.4, skin, frictionScale: level.physics?.friction ?? 1, gravityScale: level.physics?.gravity ?? 1,
    startType: path.startType, coins: level.coins ?? [], terrain, allowTunnels,
  };
}
