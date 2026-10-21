/**
 * Fahrgäste als Ragdolls (Rapier2D).
 *
 * Jeder Wagen ist eine offene Wanne. Die Fahrgäste werden im Bezugssystem des Wagens simuliert:
 * Die Wanne steht still, auf jeden Körper wirkt die Kraft −m·(gefühlte Beschleunigung des Wagens).
 * So halten nur Sitz, Lehne und Wände die Fahrgäste, keine Bügel. Verlässt ein Rumpf die Wanne,
 * wird die Figur in eine Welt-Simulation mit Schwerkraft und Boden übergeben (Flug + Landung).
 */
import RAPIER from '@dimforge/rapier2d-compat';
import type { CarState } from './trainSim';
import type { Terrain } from './terrain';

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export type PartName = 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR';
export const PART_NAMES: PartName[] = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

/** Maße des Rigs in Metern (Chibi-Proportionen, sitzend ca. 1,3 m) */
export const RIG = {
  torso: { hx: 0.17, hy: 0.28 },
  head: { hx: 0.21, hy: 0.17 },
  arm: { hx: 0.05, hy: 0.19 },
  leg: { hx: 0.06, hy: 0.2 },
  seatY: 0.08,
};

export const CAR = {
  length: 2.4,
  halfLength: 1.2,
  floorY: 0,
  rearWallH: 0.95,
  dividerH: 0.6,
  frontWallH: 0.6,
  rows: [-0.55, 0.55],
  /** Abstand der Wagen im lokalen Simulationsraum, damit sie sich nie berühren */
  spacing: 40,
  /** Wannenboden sitzt so hoch über der Schiene */
  railOffset: 0.3,
};

export interface PartPose {
  x: number;
  y: number;
  angle: number;
}

export interface PassengerView {
  index: number;
  car: number;
  row: number;
  /** Lage der Teile im Wagen-System (Meter), oder in Weltkoordinaten wenn ejected */
  parts: Record<PartName, PartPose>;
  /** Lage der Teile vor dem letzten step() (gleiches Bezugssystem wie parts), für die Interpolation beim Rendern */
  prevParts: Record<PartName, PartPose>;
  ejected: boolean;
  /** Welt-Spur (für die Darstellung des Flugs) */
  lane: number;
  /** seitliche Neigung (Radiant) aus den Querkräften */
  lean: number;
  landed: boolean;
}

interface Ragdoll {
  bodies: Record<PartName, RAPIER.RigidBody>;
  joints: RAPIER.ImpulseJoint[];
}

export function emptyParts(): Record<PartName, PartPose> {
  return { torso: { x: 0, y: 0, angle: 0 }, head: { x: 0, y: 0, angle: 0 }, armL: { x: 0, y: 0, angle: 0 }, armR: { x: 0, y: 0, angle: 0 }, legL: { x: 0, y: 0, angle: 0 }, legR: { x: 0, y: 0, angle: 0 } };
}

export function copyParts(src: Record<PartName, PartPose>, dst: Record<PartName, PartPose>): void {
  for (const name of PART_NAMES) {
    const a = src[name];
    const b = dst[name];
    b.x = a.x;
    b.y = a.y;
    b.angle = a.angle;
  }
}

export interface PassengerSimOptions {
  cars: number;
  perCar: number; // 1 oder 2 (Reihen)
  gravityScale: number;
  terrain: Terrain;
  /** Seitliche g, ab der ein Fahrgast über die Bordwand kippt */
  sideEjectG: number;
}

export class PassengerSim {
  readonly local: RAPIER.World;
  readonly world: RAPIER.World;
  readonly views: PassengerView[] = [];
  private dolls: Array<Ragdoll | null> = [];
  private worldDolls: Array<Ragdoll | null> = [];
  private carVel: Array<{ x: number; y: number }> = [];
  private carPrev: Array<{ x: number; y: number } | null> = [];
  private groundBody: RAPIER.RigidBody | null = null;
  private opts: PassengerSimOptions;
  private sideAccum: number[] = [];
  private landTimer: number[] = [];
  /** Fahrgast ist in diesem Schritt in die Welt übergegangen: parts wechseln das Bezugssystem, nicht interpolieren */
  private justEjected: boolean[] = [];
  onEject: ((p: PassengerView, side: boolean) => void) | null = null;

  constructor(opts: PassengerSimOptions) {
    this.opts = opts;
    this.local = new RAPIER.World({ x: 0, y: 0 });
    this.local.timestep = 1 / 60;
    this.world = new RAPIER.World({ x: 0, y: -9.81 * opts.gravityScale });
    this.world.timestep = 1 / 60;
    for (let c = 0; c < opts.cars; c++) {
      this.buildTub(c);
      this.carVel.push({ x: 0, y: 0 });
      this.carPrev.push(null);
      for (let r = 0; r < opts.perCar; r++) {
        const idx = this.views.length;
        const view: PassengerView = {
          index: idx, car: c, row: r, ejected: false, lane: 0, lean: 0, landed: false,
          parts: emptyParts(),
          prevParts: emptyParts(),
        };
        this.views.push(view);
        this.dolls.push(this.buildRagdoll(this.local, c * CAR.spacing + CAR.rows[r] - 0.05, CAR.floorY + RIG.seatY + RIG.torso.hy + 0.02, true));
        this.worldDolls.push(null);
        this.sideAccum.push(0);
        this.landTimer.push(0);
        this.justEjected.push(false);
      }
    }
    this.buildGround();
    // Startpose lesen, damit prevParts/parts vom ersten Frame an stimmen
    for (let i = 0; i < this.views.length; i++) {
      const d = this.dolls[i];
      if (d) this.readPose(this.views[i], d);
      copyParts(this.views[i].parts, this.views[i].prevParts);
    }
  }

  private buildTub(car: number): void {
    const ox = car * CAR.spacing;
    const fixed = this.local.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const mk = (cx: number, cy: number, hx: number, hy: number) => {
      const cd = RAPIER.ColliderDesc.cuboid(hx, hy).setTranslation(ox + cx, cy).setFriction(0.7).setRestitution(0.05);
      this.local.createCollider(cd, fixed);
    };
    // Boden, Heckwand, Trennwand (Lehne Reihe 2), Frontwand
    mk(0, CAR.floorY - 0.05, CAR.halfLength, 0.05);
    mk(-CAR.halfLength - 0.04, CAR.rearWallH / 2, 0.04, CAR.rearWallH / 2);
    mk(0, CAR.dividerH / 2, 0.04, CAR.dividerH / 2);
    mk(CAR.halfLength + 0.04, CAR.frontWallH / 2, 0.04, CAR.frontWallH / 2);
    // Sitzbänke (leicht erhöht)
    for (const r of CAR.rows) mk(r + 0.05, RIG.seatY / 2, 0.42, RIG.seatY / 2);
  }

  private buildRagdoll(w: RAPIER.World, x: number, y: number, seated: boolean): Ragdoll {
    const dyn = (px: number, py: number, rot = 0) =>
      w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py).setRotation(rot).setLinearDamping(0.15).setAngularDamping(0.6).setCcdEnabled(true));
    const box = (b: RAPIER.RigidBody, hx: number, hy: number, density = 1) =>
      w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy).setDensity(density).setFriction(0.6).setRestitution(0.05), b);
    const torso = dyn(x, y);
    box(torso, RIG.torso.hx, RIG.torso.hy, 1.2);
    const head = dyn(x, y + RIG.torso.hy + RIG.head.hy - 0.02);
    box(head, RIG.head.hx, RIG.head.hy, 0.5);
    const armL = dyn(x - RIG.torso.hx - 0.02, y + 0.05, seated ? -0.6 : 0);
    box(armL, RIG.arm.hx, RIG.arm.hy, 0.4);
    const armR = dyn(x + RIG.torso.hx + 0.02, y + 0.05, seated ? -0.6 : 0);
    box(armR, RIG.arm.hx, RIG.arm.hy, 0.4);
    const legL = dyn(x + 0.12, y - RIG.torso.hy - 0.05, seated ? -1.4 : 0);
    box(legL, RIG.leg.hx, RIG.leg.hy, 0.6);
    const legR = dyn(x + 0.2, y - RIG.torso.hy - 0.05, seated ? -1.35 : 0);
    box(legR, RIG.leg.hx, RIG.leg.hy, 0.6);

    const joints: RAPIER.ImpulseJoint[] = [];
    const rev = (a: RAPIER.RigidBody, b: RAPIER.RigidBody, ax: number, ay: number, bx: number, by: number, lo: number, hi: number) => {
      const params = RAPIER.JointData.revolute({ x: ax, y: ay }, { x: bx, y: by });
      params.limitsEnabled = true;
      params.limits = [lo, hi];
      joints.push(w.createImpulseJoint(params, a, b, true));
    };
    // Kopf an der Oberlippe (Nicken ±25°)
    rev(torso, head, 0, RIG.torso.hy - 0.02, 0, -RIG.head.hy + 0.02, -0.45, 0.45);
    // Arme an den Schultern (nach oben frei, nach hinten begrenzt)
    rev(torso, armL, -RIG.torso.hx, RIG.torso.hy - 0.08, 0, RIG.arm.hy - 0.03, -2.9, 0.8);
    rev(torso, armR, RIG.torso.hx, RIG.torso.hy - 0.08, 0, RIG.arm.hy - 0.03, -2.9, 0.8);
    // Beine an der Hüfte (Sitzen = Knie nach vorne)
    rev(torso, legL, -0.06, -RIG.torso.hy + 0.02, 0, RIG.leg.hy - 0.02, -1.8, 0.4);
    rev(torso, legR, 0.08, -RIG.torso.hy + 0.02, 0, RIG.leg.hy - 0.02, -1.8, 0.4);
    return { bodies: { torso, head, armL, armR, legL, legR }, joints };
  }

  private buildGround(): void {
    // Bodenlinie als Polyline über die Levelbreite (Spur 0 als Näherung, plus Berge als Oberfläche)
    const t = this.opts.terrain;
    const pts: number[] = [];
    for (let x = -40; x <= t.width + 40; x += 1.5) {
      pts.push(x, t.surfaceHeight(x, 0));
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.polyline(new Float32Array(pts)).setFriction(0.8), body);
    this.groundBody = body;
  }

  /**
   * Ein Simulationsschritt (1/60 s). Übergibt die Wagenzustände; Kräfte wirken im Wagen-System.
   * carWorldPos: Position der Schiene unter dem Wagen (Welt), für Übergabe in die Welt-Simulation.
   */
  step(cars: CarState[], dt: number, trainSpeed: number, autoSegment: boolean): void {
    // Wagengeschwindigkeit für Übergabe (Welt-2D): echte Wagen-Geschwindigkeit, falls der Zug sie liefert
    for (let c = 0; c < cars.length; c++) {
      const car = cars[c];
      const hasVel = typeof car.vx === 'number' && typeof car.vy === 'number' && (car.vx !== 0 || car.vy !== 0 || trainSpeed === 0);
      this.carVel[c] = hasVel ? { x: car.vx, y: car.vy } : { x: car.tx * trainSpeed, y: car.ty * trainSpeed };
      this.carPrev[c] = { x: car.x, y: car.y };
    }
    for (const v of this.views) copyParts(v.parts, v.prevParts);
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      const doll = this.dolls[i];
      if (!doll || v.ejected) continue;
      const car = cars[v.car];
      if (!car) continue;
      // Kraft = −m·felt (Wagen-System: x vorwärts, y oben)
      for (const name of PART_NAMES) {
        const b = doll.bodies[name];
        b.resetForces(true);
        const m = b.mass();
        b.addForce({ x: -m * car.feltFwd, y: -m * car.feltUp }, true);
      }
      // seitliche Neigung aus Querkraft (gefiltert)
      const target = Math.max(-0.9, Math.min(0.9, car.feltSide / 9.81 * 0.5));
      v.lean += (target - v.lean) * Math.min(1, dt * 6);
      v.lane = car.z;
      // seitlicher Rauswurf: Querkraft über Limit (nicht auf der Bremsstrecke)
      if (!autoSegment && car.gLat > this.opts.sideEjectG) {
        this.sideAccum[i] += dt;
        if (this.sideAccum[i] > 0.15) this.eject(i, cars, true);
      } else {
        this.sideAccum[i] = Math.max(0, this.sideAccum[i] - dt);
      }
    }
    this.local.step();
    this.world.step();
    // Zustände lesen und Rauswurf prüfen
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (v.ejected) {
        const wd = this.worldDolls[i];
        if (wd) {
          this.readPose(v, wd);
          const vel = wd.bodies.torso.linvel();
          if (Math.hypot(vel.x, vel.y) < 0.4) {
            this.landTimer[i] += dt;
            if (this.landTimer[i] > 0.6) v.landed = true;
          } else this.landTimer[i] = 0;
        }
        continue;
      }
      const doll = this.dolls[i];
      if (!doll) continue;
      this.readPose(v, doll);
      const ox = v.car * CAR.spacing;
      const torso = doll.bodies.torso.translation();
      const outTop = torso.y > CAR.rearWallH + 0.75;
      const outSide = Math.abs(torso.x - ox) > CAR.halfLength + 0.7;
      if (outTop || outSide) this.eject(i, cars, false);
    }
    for (let i = 0; i < this.views.length; i++) {
      if (!this.justEjected[i]) continue;
      this.justEjected[i] = false;
      const wd = this.worldDolls[i];
      if (wd) this.readPose(this.views[i], wd);
      copyParts(this.views[i].parts, this.views[i].prevParts);
    }
  }

  private readPose(v: PassengerView, doll: Ragdoll): void {
    const ox = v.ejected ? 0 : v.car * CAR.spacing;
    for (const name of PART_NAMES) {
      const b = doll.bodies[name];
      const p = b.translation();
      v.parts[name].x = p.x - ox;
      v.parts[name].y = p.y;
      v.parts[name].angle = b.rotation();
    }
  }

  /** Übergibt einen Fahrgast in die Welt-Simulation (Flug). */
  private eject(i: number, cars: CarState[], side: boolean, kick = side ? 3 : 1.5): void {
    const v = this.views[i];
    const doll = this.dolls[i];
    if (!doll || v.ejected) return;
    const car = cars[v.car];
    const ox = v.car * CAR.spacing;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const carVel = this.carVel[v.car];
    const toWorld = (lx: number, ly: number) => ({
      x: car.x + (lx * cos - (ly + CAR.railOffset) * sin),
      y: car.y + (lx * sin + (ly + CAR.railOffset) * cos),
    });
    const torsoLocal = doll.bodies.torso.translation();
    const wd = this.buildRagdoll(this.world, 0, 0, false);
    for (const name of PART_NAMES) {
      const lb = doll.bodies[name];
      const lp = lb.translation();
      const lv = lb.linvel();
      const wp = toWorld(lp.x - ox, lp.y);
      const wb = wd.bodies[name];
      wb.setTranslation(wp, true);
      wb.setRotation(lb.rotation() + car.angle, true);
      // Welt-Geschwindigkeit = Wagen + lokale (gedreht) + beim seitlichen Rauswurf ein Schubs nach oben
      const vx = carVel.x + (lv.x * cos - lv.y * sin);
      const vy = carVel.y + (lv.x * sin + lv.y * cos) + kick;
      wb.setLinvel({ x: vx, y: vy }, true);
      wb.setAngvel(lb.angvel() + (side ? 4 : 2), true);
    }
    void torsoLocal;
    // lokale Puppe entfernen
    for (const j of doll.joints) this.local.removeImpulseJoint(j, true);
    for (const name of PART_NAMES) this.local.removeRigidBody(doll.bodies[name]);
    this.dolls[i] = null;
    this.worldDolls[i] = wd;
    v.ejected = true;
    v.lane = car.z;
    this.justEjected[i] = true;
    this.onEject?.(v, side);
  }

  /**
   * Aufprall des Wagens: alle noch sitzenden Fahrgäste dieses Wagens fliegen raus. Der Schubs nach oben wächst
   * mit der Aufprallgeschwindigkeit (1,5 … 6 m/s), damit die Figuren sichtbar aus dem Wrack geworfen werden.
   */
  ejectCar(carIndex: number, cars: CarState[], impactSpeed = 0): number {
    const kick = Math.min(6, 1.5 + impactSpeed * 0.4);
    let n = 0;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (v.car !== carIndex || v.ejected) continue;
      this.eject(i, cars, false, kick);
      n++;
    }
    return n;
  }

  /** Alle Fahrgäste sitzen (keiner draußen)? */
  get allSeated(): boolean {
    return this.views.every((v) => !v.ejected);
  }

  dispose(): void {
    this.local.free();
    this.world.free();
    void this.groundBody;
  }
}
