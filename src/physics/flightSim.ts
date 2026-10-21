/**
 * Freiflug des Zugs nach Entgleisen, Fall aus dem Looping oder am offenen Ende (Absperrband).
 *
 * Jeder Wagen ist ein starrer Körper in der Welt-Ebene (x vorwärts, y oben) mit Neigung (angle, Drehrate omega),
 * dazu Schräglage (bank) und Tiefe (z in Spuren), die beim seitlichen Entgleisen langsam weglaufen. Schwerkraft,
 * Luftwiderstand, Ketten-Federn zwischen den Wagen (Ruhelänge = Wagenlänge), Bodenkontakt an vier Ecken gegen
 * das Gelände (Rückprall 0,25, Reibung, Drehimpuls über den Hebelarm) und Wasser (starke Dämpfung, ein Platsch).
 * Ein Aufprall mit mehr als 3 m/s senkrecht wird gemeldet (die Fahrgäste fliegen dann raus). `settled`, wenn alle
 * Wagen 0,6 s lang fast ruhen.
 */
import type { CarState } from './trainSim';
import type { Terrain } from './terrain';
import { toStage, LANE_DEPTH } from '@/track/stage';

export type FlightKind = 'derail' | 'fall' | 'launch' | 'tip';

export interface FlightBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Neigung in der Welt-Ebene (rad) und Drehrate */
  angle: number;
  omega: number;
  /** Schräglage (rad) und ihre Rate */
  bank: number;
  bankVel: number;
  /** Tiefe in Spuren und seitliche Drift */
  z: number;
  zVel: number;
  /** letzte Beschleunigung (für die Scheinkräfte der Fahrgäste) */
  ax: number;
  ay: number;
  onGround: boolean;
  splashed: boolean;
  impactCooldown: number;
}

export interface FlightOptions {
  terrain: Terrain;
  gravity: number;
  carLength: number;
  kind: FlightKind;
  /** Seite beim Entgleisen: +1 zur Kamera, −1 weg, 0 = keine */
  side: number;
}

export interface ImpactEvent {
  car: number;
  speed: number;
  x: number;
  y: number;
  z: number;
  water: boolean;
}

const HALF_LENGTH = 1.2;
const DRAG = 0.02;
const CHAIN_K = 300;
const CHAIN_C = 20;
const RESTITUTION = 0.25;
const FRICTION = 0.6;
const IMPACT_SPEED = 3;
/** Fahrt beim ersten Aufsetzen (m/s), ab der das Aufsetzen als Aufprall gilt */
const CRASH_SPEED = 8;
const CALM_SECONDS = 0.6;
const FELT_CAP = 60;
/** Abstand, bis zu dem eine Ecke noch als Bodenkontakt zählt (m) */
const CONTACT_MARGIN = 0.03;
/** Stöße unter dieser Geschwindigkeit (m/s) prallen nicht zurück */
const BOUNCE_MIN = 0.5;
const OMEGA_MAX = 6;
/** Drehfeder zur flachen Lage am Boden: Steifigkeit (rad/s² je rad) und Dämpfung (1/s) */
const ALIGN_K = 16;
const ALIGN_C = 6;

export class FlightSim {
  readonly bodies: FlightBody[] = [];
  readonly impacts: ImpactEvent[] = [];
  readonly kind: FlightKind;
  time = 0;
  settled = false;
  private calm = 0;
  private readonly opts: FlightOptions;

  constructor(cars: CarState[], opts: FlightOptions) {
    this.opts = opts;
    this.kind = opts.kind;
    for (const c of cars) {
      const angle = Math.atan2(c.ty, c.tx);
      const b: FlightBody = {
        x: c.x, y: c.y, vx: c.vx, vy: c.vy, angle, omega: 0, bank: c.bank, bankVel: 0, z: c.z, zVel: 0,
        ax: 0, ay: 0, onGround: false, splashed: false, impactCooldown: 0,
      };
      switch (opts.kind) {
        case 'derail':
          // seitlich über die Schiene kippen und langsam aus der Spur driften, dabei leicht nach vorn nicken
          b.omega = -0.6;
          b.bankVel = opts.side * 2.5;
          b.zVel = opts.side * 0.25;
          break;
        case 'fall':
          b.omega = -1.5; // aus dem Looping gefallen: überschlägt sich
          break;
        case 'launch':
          b.omega = -0.6; // vom offenen Ende abgeflogen
          break;
        case 'tip':
          b.omega = -2.5; // kippt über die Vorderkante
          b.vx = Math.max(b.vx, 0.5);
          break;
      }
      this.bodies.push(b);
    }
  }

  step(h: number): void {
    const g = 9.81 * this.opts.gravity;
    const t = this.opts.terrain;
    const bodies = this.bodies;
    for (const b of bodies) {
      const vx0 = b.vx;
      const vy0 = b.vy;
      // Schwerkraft und Luftwiderstand
      b.vy -= g * h;
      const sp = Math.hypot(b.vx, b.vy);
      const dragF = DRAG * sp;
      b.vx -= b.vx * dragF * h;
      b.vy -= b.vy * dragF * h;
      // Wasser: zäh, ein Platsch
      const inWater = t.waterAt(b.x, b.z) && b.y < 0.35;
      if (inWater) {
        const damp = Math.exp(-3 * h);
        b.vx *= damp;
        b.vy *= damp;
        b.omega *= damp;
        if (!b.splashed) {
          b.splashed = true;
          this.impacts.push({ car: bodies.indexOf(b), speed: sp, x: b.x, y: b.y, z: b.z, water: true });
        }
      }
      b.ax = (b.vx - vx0) / h;
      b.ay = (b.vy - vy0) / h;
    }
    // Ketten-Federn zwischen den Wagen (Masse 1 je Wagen)
    for (let i = 0; i + 1 < bodies.length; i++) {
      const a = bodies[i];
      const c = bodies[i + 1];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d;
      const uy = dy / d;
      const stretch = d - this.opts.carLength;
      const relVel = (c.vx - a.vx) * ux + (c.vy - a.vy) * uy;
      const F = CHAIN_K * stretch + CHAIN_C * relVel;
      a.vx += F * ux * h;
      a.vy += F * uy * h;
      c.vx -= F * ux * h;
      c.vy -= F * uy * h;
    }
    // Bewegung, Schräglage, Tiefe
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.omega * h;
      b.bank += b.bankVel * h;
      if (Math.abs(b.bank) >= Math.PI / 2) {
        b.bank = Math.sign(b.bank) * (Math.PI / 2);
        b.bankVel = 0;
      }
      b.z += b.zVel * h;
      b.impactCooldown = Math.max(0, b.impactCooldown - h);
      // Bodenkontakt an vier Ecken (Wagenlänge ±1,2 m, Höhe −0,3 … +0,9 m um die Achse)
      const cosA = Math.cos(b.angle);
      const sinA = Math.sin(b.angle);
      let deepest = -Infinity;
      let deepestLever = 0;
      for (const [a, u] of [[-HALF_LENGTH, -0.3], [HALF_LENGTH, -0.3], [-HALF_LENGTH, 0.9], [HALF_LENGTH, 0.9]] as const) {
        const cx = b.x + a * cosA - u * sinA;
        const cy = b.y + a * sinA + u * cosA;
        const ground = t.surfaceHeight(cx, b.z);
        const pen = ground - cy;
        if (pen > deepest) {
          deepest = pen;
          deepestLever = cx - b.x;
        }
      }
      // Kontakt auch bei winzigem Abstand: ein ruhender Wagen pendelt sonst jeden Schritt zwischen "liegt" und "schwebt"
      const touching = deepest > -CONTACT_MARGIN;
      if (deepest > 0) {
        b.y += deepest;
        const vn = b.vy;
        // Aufprall: hart senkrecht, oder erstes Aufsetzen mit viel Fahrt (der entgleiste Zug rutscht in den Boden)
        const speed = Math.hypot(b.vx, b.vy);
        const hard = -vn > IMPACT_SPEED;
        const crash = !b.onGround && speed > CRASH_SPEED;
        if ((hard || crash) && b.impactCooldown <= 0) {
          this.impacts.push({ car: i, speed: hard ? -vn : speed, x: b.x, y: b.y, z: b.z, water: false });
          b.impactCooldown = 0.5;
        }
        if (vn < 0) {
          // kleine Stöße vollständig schlucken, sonst zittert der liegende Wagen
          b.vy = -vn > BOUNCE_MIN ? -vn * RESTITUTION : 0;
          // Drehimpuls des Stoßes über den Hebelarm der tiefsten Ecke (Ecke vor der Mitte → Nase hoch)
          b.omega += (-vn * (1 + RESTITUTION) * deepestLever) / (HALF_LENGTH * HALF_LENGTH * 2);
          b.omega = Math.max(-OMEGA_MAX, Math.min(OMEGA_MAX, b.omega));
        }
      }
      if (touching) {
        b.vx *= Math.max(0, 1 - FRICTION * h * 4);
        b.zVel *= Math.max(0, 1 - 2 * h); // am Boden endet die seitliche Drift
        // Gedämpfte Drehfeder zur nächstliegenden flachen Lage (Boden oder Dach), damit der Wagen kippt und liegen bleibt
        const slope = Math.atan2(t.surfaceHeight(b.x + 1, b.z) - t.surfaceHeight(b.x - 1, b.z), 2);
        let d = slope - b.angle;
        d -= Math.PI * Math.round(d / Math.PI);
        b.omega += d * ALIGN_K * h;
        b.omega *= Math.max(0, 1 - ALIGN_C * h);
      }
      b.onGround = touching;
    }
    this.time += h;
    const still = bodies.every((b) => Math.hypot(b.vx, b.vy) < 0.3 && Math.abs(b.omega) < 0.2);
    this.calm = still ? this.calm + h : 0;
    if (this.calm > CALM_SECONDS) this.settled = true;
  }

  /** Wagenzustände aus den Körpern schreiben (Rahmen, Geschwindigkeit, Scheinkräfte) */
  writeTo(cars: CarState[]): void {
    const g = 9.81 * this.opts.gravity;
    for (let i = 0; i < cars.length && i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const car = cars[i];
      car.x = b.x;
      car.y = b.y;
      car.z = b.z;
      car.vx = b.vx;
      car.vy = b.vy;
      const cosA = Math.cos(b.angle);
      const sinA = Math.sin(b.angle);
      const cosB = Math.cos(b.bank);
      const sinB = Math.sin(b.bank);
      // T in der Welt-Ebene; U und S um T gedreht (Schräglage)
      car.tx = cosA; car.ty = sinA; car.tz = 0;
      const u0 = { x: -sinA, y: cosA, z: 0 };
      const s0 = { x: 0, y: 0, z: 1 };
      car.upx = u0.x * cosB + s0.x * sinB; car.upy = u0.y * cosB + s0.y * sinB; car.upz = u0.z * cosB + s0.z * sinB;
      car.sx = -u0.x * sinB + s0.x * cosB; car.sy = -u0.y * sinB + s0.y * cosB; car.sz = -u0.z * sinB + s0.z * cosB;
      car.bank = b.bank;
      const p0 = toStage(b.x, b.y, b.z);
      const p1 = toStage(b.x + car.tx, b.y + car.ty, b.z + car.tz / LANE_DEPTH);
      car.angle = Math.atan2(p1.Y - p0.Y, p1.X - p0.X);
      // Scheinkräfte: Beschleunigung des Wagens plus Schwerkraft, im Wagen-Rahmen, begrenzt
      let fx = b.ax;
      let fy = b.ay + g;
      const fm = Math.hypot(fx, fy);
      if (fm > FELT_CAP) {
        fx *= FELT_CAP / fm;
        fy *= FELT_CAP / fm;
      }
      car.feltFwd = fx * car.tx + fy * car.ty;
      car.feltUp = fx * car.upx + fy * car.upy;
      car.feltSide = 0;
      car.gSeat = car.feltUp / 9.81;
      car.gFwd = car.feltFwd / 9.81;
      car.gLat = 0;
      car.inverted = car.upy < -0.2;
      car.inTunnel = false;
    }
  }
}
