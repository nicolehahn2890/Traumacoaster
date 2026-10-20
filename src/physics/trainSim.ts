/**
 * Zug-Simulation entlang der Bogenlänge der Bahn.
 * Energie-Modell: Schwerkraft entlang der Tangente, Rollreibung, Luftwiderstand,
 * Kettenzug/Launch am Start, Booster/Bremsen als Elemente, automatische Bremsstrecke auf dem Rückweg.
 * Liefert pro Wagen Position, Ausrichtung und die gefühlten g-Kräfte (Sitz und seitlich).
 */
import type { CoinSpec, LevelDef } from '@/levels/types';
import type { TrackPath, TrackSamples, TrackState } from '@/track/model';
import { stateAt } from '@/track/model';
import type { Terrain } from './terrain';

export const G = 9.81;

export interface SkinPhysics {
  friction: number;
  lateralLimit: number;
}

/** Reibung und Querkraft-Grenze pro Schienenstil */
export const SKIN_PHYSICS: Record<string, SkinPhysics> = {
  skinWood: { friction: 0.015, lateralLimit: 2.5 },
  skinHybrid: { friction: 0.013, lateralLimit: 3.0 },
  skinMine: { friction: 0.016, lateralLimit: 2.6 },
  skinSteel: { friction: 0.01, lateralLimit: 3.5 },
  skinGold: { friction: 0.01, lateralLimit: 3.5 },
  skinNeon: { friction: 0.01, lateralLimit: 3.6 },
  skinIce: { friction: 0.004, lateralLimit: 3.0 },
  skinGhost: { friction: 0.014, lateralLimit: 2.8 },
  skinLava: { friction: 0.011, lateralLimit: 3.5 },
  skinSpace: { friction: 0.008, lateralLimit: 4.0 },
};

export type RidePhase = 'lift' | 'launch' | 'coast' | 'done' | 'failed';
export type FailReason = 'derail' | 'fall' | 'stall' | 'eject' | 'water' | 'ejectSide';

export interface CarState {
  index: number;
  s: number;
  x: number;
  y: number;
  z: number;
  /** Fahrtrichtung in der Profil-Ebene (Einheitsvektor, für die Darstellung) */
  tx: number;
  ty: number;
  /** Oben-Vektor des Wagens in 3D inkl. Roll */
  upx: number;
  upy: number;
  upz: number;
  roll: number;
  /** Winkel der Profil-Tangente */
  angle: number;
  /** gefühlte g in den Sitz (positiv = gedrückt, negativ = Airtime) */
  gSeat: number;
  /** gefühlte g nach vorne (Beschleunigung) */
  gFwd: number;
  /** seitliche g (Betrag, nach automatischer Überhöhung) */
  gLat: number;
  /** gefühlte Beschleunigung im Wagen-System (m/s²): vorwärts, oben, seitlich. Fahrgast-Kraft = −m·felt */
  feltFwd: number;
  feltUp: number;
  feltSide: number;
  inTunnel: boolean;
  inverted: boolean;
}

export interface RideStats {
  time: number;
  maxSpeed: number; // m/s
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
  kind: 'coin' | 'tunnelEnter' | 'tunnelExit' | 'booster' | 'brake' | 'splash' | 'liftEnd' | 'launchEnd' | 'peak' | 'fail' | 'finish' | 'inversion';
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

const LIFT_SPEED = 2.6;
const VERTICAL_LIFT_SPEED = 4.0;
const LAUNCH_LENGTH = 26;
const LAUNCH_ACCEL = 12;
const HYDRO_ACCEL = 24;
const SWING_ACCEL = 16;
const BOOSTER_ACCEL = 8;
const BRAKE_TARGET = 4;
const RETURN_SPEED_LIMIT = 8;
const RETURN_LOOKAHEAD = 14;
const DRAG = 0.0008;
const BANKING = 0.6; // automatische Überhöhung senkt die seitlichen g

export class TrainSim {
  readonly samples: TrackSamples;
  readonly path: TrackPath;
  readonly opts: TrainSimOptions;
  readonly cars: CarState[] = [];
  readonly events: RideEvent[] = [];
  readonly stats: RideStats = {
    time: 0, maxSpeed: 0, maxG: 1, minG: 1, maxLatG: 0, airtime: 0, coins: 0, tunnels: 0, boosters: 0, splashes: 0, inversions: 0,
    blackout: false, brakesUsed: false, distance: 0,
  };
  readonly collected: boolean[];
  phase: RidePhase = 'coast';
  failReason: FailReason | null = null;
  /** Bogenlänge des vorderen Wagens */
  s = 0;
  v = 0;
  t = 0;
  /** Zeit seit Fehlschlag (für Nachlauf-Animation) */
  sinceFail = 0;
  private liftEnd = 0;
  private wasInTunnel: boolean[] = [];
  private passedElements = new Set<number>();
  private invertedPrev = false;
  private fallTimer = 0;
  private lapDone = false;
  private peakReported = false;

  constructor(samples: TrackSamples, path: TrackPath, opts: TrainSimOptions) {
    this.samples = samples;
    this.path = path;
    this.opts = opts;
    this.collected = opts.coins.map(() => false);
    for (let i = 0; i < opts.cars; i++) {
      this.cars.push({ index: i, s: 0, x: 0, y: 0, z: 0, tx: 1, ty: 0, upx: 0, upy: 1, upz: 0, roll: 0, angle: 0, gSeat: 1, gFwd: 0, gLat: 0, feltFwd: 0, feltUp: G, feltSide: 0, inTunnel: false, inverted: false });
      this.wasInTunnel.push(false);
    }
    this.liftEnd = this.findLiftEnd();
    this.phase = opts.startType === 'launch' || opts.startType === 'hydro' || opts.startType === 'swing' ? 'launch' : 'lift';
    this.v = this.phase === 'lift' ? LIFT_SPEED : 0.5;
    this.updateCars(0);
  }

  /** Ende des ersten Anstiegs (erster Scheitel nach der Station) */
  private findLiftEnd(): number {
    const sm = this.samples;
    let climbing = false;
    for (let i = 1; i < sm.count; i++) {
      if (sm.ty[i] > 0.02) climbing = true;
      if (climbing && sm.ty[i] <= 0) return sm.s[i];
    }
    return climbing ? sm.length * 0.5 : 0;
  }

  get skinPhysics(): SkinPhysics {
    return SKIN_PHYSICS[this.opts.skin] ?? SKIN_PHYSICS.skinWood;
  }

  get finished(): boolean {
    return this.phase === 'done' || this.phase === 'failed';
  }

  /** Simulationsschritt mit festem Teilschritt */
  step(dt: number): void {
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.substep(h);
  }

  private substep(h: number): void {
    if (this.phase === 'failed') {
      this.sinceFail += h;
      // Nachlauf: Zug rollt weiter bzw. zurück, Reibung bremst
      this.integrate(h, true);
      this.updateCars(h);
      return;
    }
    if (this.phase === 'done') return;
    this.integrate(h, false);
    this.updateCars(h);
    this.t += h;
    this.stats.time = this.t;
    this.checkEvents(h);
  }

  private integrate(h: number, afterFail: boolean): void {
    const g = G * this.opts.gravityScale;
    const mu = this.skinPhysics.friction * this.opts.frictionScale;
    const L = this.samples.length;
    // mittlere Hangabtriebskraft über alle Wagen
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
      // Startphasen
      if (this.phase === 'lift') {
        const liftSpeed = this.opts.startType === 'verticalLift' ? VERTICAL_LIFT_SPEED : LIFT_SPEED;
        if (this.s < this.liftEnd) {
          if (this.v < liftSpeed) {
            this.v = liftSpeed;
            a = Math.max(a, 0);
          }
        } else {
          this.phase = 'coast';
          this.events.push({ kind: 'liftEnd', time: this.t });
        }
      } else if (this.phase === 'launch') {
        const accel = this.opts.startType === 'hydro' ? HYDRO_ACCEL : this.opts.startType === 'swing' ? SWING_ACCEL : LAUNCH_ACCEL;
        if (this.s < LAUNCH_LENGTH) {
          a += accel;
        } else {
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
      // automatische Bremsstrecke auf dem Rückweg (bremst schon vor der Kehre ab)
      const ahead = stateAt(this.samples, this.s + RETURN_LOOKAHEAD);
      if ((anyAuto || ahead.auto) && this.v > RETURN_SPEED_LIMIT) a -= 7;
    }

    // symplektischer Euler
    this.v += a * h;
    // Stillstand am Berg → Rückroller
    if (!afterFail && this.phase === 'coast' && this.v <= 0.02 && aGrav < -0.05) {
      this.fail('stall');
      this.v = -0.05;
    }
    this.s += this.v * h;
    this.stats.distance += Math.abs(this.v) * h;
    if (!afterFail && this.s >= L && this.phase === 'coast') {
      this.lapDone = true;
    }
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, Math.abs(this.v));
  }

  private updateCars(h: number): void {
    const g = G * this.opts.gravityScale;
    const L = this.samples.length;
    for (const car of this.cars) {
      const s = this.s - car.index * this.opts.carLength;
      const st: TrackState = stateAt(this.samples, s);
      car.s = ((s % L) + L) % L;
      car.x = st.x;
      car.y = st.y;
      car.z = st.z;
      car.tx = st.tx;
      car.ty = st.ty;
      car.roll = st.roll;
      car.angle = Math.atan2(st.ty, st.tx);
      // Seitenvektor = T × up, dann Roll um die Tangente
      const sx0 = st.t3y * st.upz - st.t3z * st.upy;
      const sy0 = st.t3z * st.upx - st.t3x * st.upz;
      const sz0 = st.t3x * st.upy - st.t3y * st.upx;
      const cr = Math.cos(st.roll);
      const sr = Math.sin(st.roll);
      const upx = st.upx * cr + sx0 * sr;
      const upy = st.upy * cr + sy0 * sr;
      const upz = st.upz * cr + sz0 * sr;
      const sx = sx0 * cr - st.upx * sr;
      const sy = sy0 * cr - st.upy * sr;
      const sz = sz0 * cr - st.upz * sr;
      car.upx = upx; car.upy = upy; car.upz = upz;
      // Beschleunigung des Wagens: Normalanteil v²·k + Tangentialanteil (Hangabtrieb)
      const v2 = this.v * this.v;
      const aTan = -g * st.t3y;
      const ax = v2 * st.k3x + aTan * st.t3x;
      const ay = v2 * st.k3y + aTan * st.t3y;
      const az = v2 * st.k3z + aTan * st.t3z;
      // gefühlt = a − g_vec, g_vec = (0, −g, 0)
      const fx = ax;
      const fy = ay + g;
      const fz = az;
      car.feltFwd = fx * st.t3x + fy * st.t3y + fz * st.t3z;
      car.feltUp = fx * upx + fy * upy + fz * upz;
      const side = fx * sx + fy * sy + fz * sz;
      // automatische Überhöhung: Teil der Querkraft wird in Sitzdruck umgewandelt
      car.feltSide = side * (1 - BANKING);
      car.feltUp += Math.abs(side) * BANKING * 0.5;
      car.gSeat = car.feltUp / G;
      car.gFwd = car.feltFwd / G;
      car.gLat = Math.abs(car.feltSide) / G;
      car.inverted = upy < -0.2;
      car.inTunnel = this.opts.terrain.insideMountain(st.x, st.y, st.z);
    }
    void h;
  }

  private checkEvents(h: number): void {
    const front = this.cars[0];
    const L = this.samples.length;
    // Statistik
    this.stats.maxG = Math.max(this.stats.maxG, front.gSeat);
    this.stats.minG = Math.min(this.stats.minG, front.gSeat);
    this.stats.maxLatG = Math.max(this.stats.maxLatG, front.gLat);
    if (front.gSeat < 0) this.stats.airtime += h;
    if (front.gSeat > 6) this.stats.blackout = true;
    if (front.inverted && !this.invertedPrev) {
      this.stats.inversions++;
      this.events.push({ kind: 'inversion', time: this.t, car: 0 });
    }
    this.invertedPrev = front.inverted;

    // Scheitel (höchster Punkt) melden
    if (!this.peakReported && this.phase === 'coast') {
      const stNext = stateAt(this.samples, this.s + 1);
      if (stNext.y < front.y - 0.05 && front.y > 3) {
        this.peakReported = true;
        this.events.push({ kind: 'peak', time: this.t, x: front.x, y: front.y, z: front.z });
      }
    }

    // Coins: jeder Wagen sammelt
    for (let i = 0; i < this.opts.coins.length; i++) {
      if (this.collected[i]) continue;
      const c = this.opts.coins[i];
      const lane = c.lane ?? 0;
      for (const car of this.cars) {
        if (Math.abs(car.z - lane) > 0.5) continue;
        const d = Math.hypot(car.x - c.x, car.y - c.y);
        if (d < 2.0) {
          this.collected[i] = true;
          this.stats.coins++;
          this.events.push({ kind: 'coin', time: this.t, index: i, car: car.index });
          break;
        }
      }
    }

    // Tunnel
    for (const car of this.cars) {
      const was = this.wasInTunnel[car.index];
      if (car.inTunnel && !was) {
        if (car.index === 0) {
          this.stats.tunnels++;
          this.events.push({ kind: 'tunnelEnter', time: this.t, car: 0 });
        }
      } else if (!car.inTunnel && was && car.index === 0) {
        this.events.push({ kind: 'tunnelExit', time: this.t, car: 0 });
      }
      this.wasInTunnel[car.index] = car.inTunnel;
    }

    // Entgleisen: seitliche g über dem Limit (nicht auf der Bremsstrecke)
    const st = stateAt(this.samples, this.s);
    if (!st.auto) {
      for (const car of this.cars) {
        if (car.gLat > this.skinPhysics.lateralLimit) {
          this.fail('derail', car.index);
          return;
        }
      }
    }
    // Aus dem Looping fallen: kopfüber und keine Andruckkraft
    if (front.inverted && front.gSeat < -0.15) {
      this.fallTimer += h;
      if (this.fallTimer > 0.12) {
        this.fail('fall', 0);
        return;
      }
    } else {
      this.fallTimer = 0;
    }
    // Wasser ohne Splash-Element
    if (!st.auto && this.opts.terrain.waterAt(front.x, front.z) && front.y < 0.35) {
      const onSplash = this.path.elements.some((e) => e.kind === 'splash' && ((this.s - e.s) % L + L) % L < e.length + 2);
      if (!onSplash) {
        this.fail('water', 0);
        return;
      }
    }
    // Ziel: eine volle Runde, alle Wagen zurück in der Station
    if (this.lapDone && this.s >= L + this.opts.cars * this.opts.carLength) {
      this.phase = 'done';
      this.events.push({ kind: 'finish', time: this.t });
    }
  }

  fail(reason: FailReason, car = 0): void {
    if (this.phase === 'failed') return;
    this.phase = 'failed';
    this.failReason = reason;
    this.events.push({ kind: 'fail', time: this.t, reason, car });
  }

  /** Geschwindigkeit in km/h */
  get kmh(): number {
    return Math.abs(this.v) * 3.6;
  }
}

/** Baut die Sim-Optionen aus einem Level. */
export function simOptionsForLevel(level: LevelDef, path: TrackPath, terrain: Terrain, skin: string, allowTunnels: boolean): TrainSimOptions {
  return {
    cars: level.cars ?? 2,
    carLength: 2.4,
    skin,
    frictionScale: level.physics?.friction ?? 1,
    gravityScale: level.physics?.gravity ?? 1,
    startType: path.startType,
    coins: level.coins ?? [],
    terrain,
    allowTunnels,
  };
}
