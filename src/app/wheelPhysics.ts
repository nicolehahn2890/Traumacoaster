/**
 * Glücksrad-Physik der Karte: Die Scheibe dreht frei mit Reibung (zäh + trocken), wird unterhalb einer
 * Geschwindigkeit vom nächsten Rastpunkt in Fahrtrichtung eingefangen (gedämpfte Feder mit leichtem
 * Überschwingen) und hängt an den Enden an einem Gummiband. Positionen in Karten-Pixeln entlang des Bogens.
 */
import { clamp, lerp } from '@/core/math';

/** Reibung frei: zäh (1/s) und trocken (px/s²) */
const VISCOUS = 0.8;
const COULOMB = 350;
/** unter diesem Tempo (px/s) rastet die Scheibe ein */
const CAPTURE_SPEED = 420;
/** Feder beim Einrasten: ω0 = √55, Dämpfung ζ = 0,7 (leichtes Überschwingen) */
const OMEGA = Math.sqrt(55);
const ZETA = 0.7;
/** Gummiband über die Enden hinaus: weichere Feder, und der Finger zieht die Scheibe dort nur gedämpft */
const RUBBER_K = 120;
const RUBBER_DRAG = 0.35;
const MAX_SPEED = 3500;

export interface WheelStep {
  /** Rastpunkte, über die der Fokus in diesem Schritt gelaufen ist (jeder höchstens einmal je Überfahrt) */
  passed: number[];
  /** Scheibe liegt still auf einem Rastpunkt */
  settled: boolean;
}

export class WheelPhysics {
  focus = 0;
  velocity = 0;
  /** Ziel-Rastpunkt (Position) oder null = freie Drehung */
  target: number | null = null;
  targetIndex = 0;
  dragging = false;
  private positions: number[] = [];
  private lastX = 0;
  private lastT = 0;
  private dragFrom = 0;
  /** Rastpunkt, auf dem die Scheibe schon ruhend gemeldet wurde (das Einrasten zählt nur einmal) */
  private settledOn: number | null = null;
  /** Hat sich die Scheibe seit dem letzten Einrasten bewegt? Sonst klickt es nicht (z. B. beim Szenenstart) */
  private moved = false;

  constructor(positions: number[], focus = 0) {
    this.setPositions(positions);
    this.focus = focus;
  }

  setPositions(positions: number[]): void {
    this.positions = positions.slice();
  }

  get first(): number {
    return this.positions.length ? this.positions[0] : 0;
  }
  get last(): number {
    return this.positions.length ? this.positions[this.positions.length - 1] : 0;
  }

  /** Index des Rastpunkts, der p am nächsten liegt */
  nearest(p: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.positions.length; i++) {
      const d = Math.abs(this.positions[i] - p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Rastpunkt wählen (Tipp, Taste): die Feder zieht hin, der laufende Schwung bleibt */
  select(index: number): void {
    if (!this.positions.length) return;
    const idx = clamp(index, 0, this.positions.length - 1);
    if (idx !== this.targetIndex) this.settledOn = null;
    this.targetIndex = idx;
    this.target = this.positions[this.targetIndex];
  }

  dragStart(x: number, timeMs: number): void {
    this.dragging = true;
    this.lastX = x;
    this.lastT = timeMs;
    this.dragFrom = this.focus;
    this.velocity = 0;
    this.target = null;
    this.settledOn = null;
  }

  /** Finger bewegt sich; scale = Bildschirm-Pixel je Karten-Pixel */
  dragMove(x: number, timeMs: number, scale = 1): void {
    if (!this.dragging) return;
    const dx = x - this.lastX;
    const dt = Math.max(1, timeMs - this.lastT) / 1000;
    this.lastX = x;
    this.lastT = timeMs;
    const over = this.focus < this.first || this.focus > this.last;
    const d = (-dx / scale) * (over ? RUBBER_DRAG : 1);
    this.focus += d;
    if (d !== 0) this.moved = true;
    this.velocity = lerp(this.velocity, d / dt, 0.6);
  }

  dragEnd(timeMs: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    // Finger lag vor dem Loslassen still (mit Spielraum für einen langsamen Frame): kein Schwung
    if (timeMs - this.lastT > 250) this.velocity = 0;
    this.velocity = clamp(this.velocity, -MAX_SPEED, MAX_SPEED);
    if (Math.abs(this.velocity) >= CAPTURE_SPEED) return;
    // langsam losgelassen: ein deutlicher Schub (über 60 px) geht einen Rastpunkt weiter in Wischrichtung,
    // ein kleiner Ruck rastet beim nächsten ein
    const moved = this.focus - this.dragFrom;
    if (Math.abs(moved) > 60) {
      const start = this.nearest(this.dragFrom);
      const ahead = moved > 0 ? this.positions.findIndex((p) => p > this.focus) : this.positions.length - 1 - [...this.positions].reverse().findIndex((p) => p < this.focus);
      this.select(ahead >= 0 && ahead < this.positions.length ? ahead : start);
    } else this.capture();
  }

  private capture(): void {
    this.select(this.nearest(this.focus + this.velocity * 0.2));
  }

  step(dt: number): WheelStep {
    if (this.dragging || dt <= 0) return { passed: [], settled: false };
    const before = this.focus;
    if (this.target === null && (this.focus < this.first || this.focus > this.last)) {
      // über das Ende hinaus: das Gummiband zieht zum letzten Rastpunkt zurück
      this.select(this.focus < this.first ? 0 : this.positions.length - 1);
    }
    if (this.target === null) {
      // frei: zähe und trockene Reibung
      const a = -VISCOUS * this.velocity - COULOMB * Math.sign(this.velocity);
      const v0 = this.velocity;
      this.velocity = clamp(this.velocity + a * dt, -MAX_SPEED, MAX_SPEED);
      // trockene Reibung bremst bis null, nicht darüber hinaus
      if (v0 !== 0 && Math.sign(this.velocity) !== Math.sign(v0)) this.velocity = 0;
      if (this.velocity !== 0) this.moved = true;
      this.focus += this.velocity * dt;
      if (Math.abs(this.velocity) < CAPTURE_SPEED) this.capture();
      return { passed: this.passedBetween(before, this.focus, null), settled: false };
    }
    // Feder zum Ziel (Gummiband an den Enden ist dieselbe Feder, nur weiter weg)
    const k = this.focus < this.first || this.focus > this.last ? RUBBER_K : OMEGA * OMEGA;
    const c = 2 * ZETA * Math.sqrt(k);
    const a = k * (this.target - this.focus) - c * this.velocity;
    this.velocity += a * dt;
    this.focus += this.velocity * dt;
    if (Math.abs(this.focus - before) > 0.01) this.moved = true;
    if (Math.abs(this.target - this.focus) < 0.2 && Math.abs(this.velocity) < 2) {
      this.focus = this.target;
      this.velocity = 0;
      const passed = this.passedBetween(before, this.focus, this.targetIndex);
      if (this.settledOn !== this.targetIndex) {
        if (this.moved) passed.push(this.targetIndex);
        this.settledOn = this.targetIndex;
        this.moved = false;
      }
      return { passed, settled: true };
    }
    this.settledOn = null;
    return { passed: this.passedBetween(before, this.focus, this.targetIndex), settled: false };
  }

  /**
   * Rastpunkte, deren Position zwischen a (exklusiv) und b (inklusiv) liegt, in Laufrichtung; das Ziel selbst zählt
   * nicht beim Überschwingen, sondern erst beim Einrasten (sonst klickte es beim Hin und Her doppelt)
   */
  private passedBetween(a: number, b: number, skip: number | null): number[] {
    const out: number[] = [];
    if (a === b) return out;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = 0; i < this.positions.length; i++) {
      if (i === skip) continue;
      const p = this.positions[i];
      const crossed = b > a ? p > lo && p <= hi : p >= lo && p < hi;
      if (crossed) out.push(i);
    }
    if (b < a) out.reverse();
    return out;
  }
}
