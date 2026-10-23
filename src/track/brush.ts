/**
 * Gummiband-Pinsel: Die Pinselspitze hängt an einem Gummiband am Finger. Sie bewegt sich erst, wenn das Band
 * gespannt ist (Finger weiter weg als die Bandlänge), und wird dann in Richtung Finger nachgezogen, wie ein runder
 * Pinsel mit 100 % Glättung (gezogene Schnur). Zittern innerhalb der Bandlänge malt nichts, Ecken werden mit etwa
 * der Bandlänge rund. Beim Loslassen holt die Linie bis zum Finger auf.
 */
import type { StagePoint } from './stage';

/** kleinster Abstand zweier Linienpunkte (Bühnen-Meter) */
const MIN_STEP = 0.05;

export class RubberBrush {
  /** die gemalte Linie (Bühnenkoordinaten), beginnt am Aufsetzpunkt */
  readonly points: StagePoint[];
  /** Fingerposition */
  finger: StagePoint;
  private tip: StagePoint;

  constructor(start: StagePoint, public length: number) {
    this.tip = { X: start.X, Y: start.Y };
    this.finger = { X: start.X, Y: start.Y };
    this.points = [{ X: start.X, Y: start.Y }];
  }

  /** Finger bewegt (Bühne); true, wenn die Linie gewachsen ist */
  move(p: StagePoint): boolean {
    this.finger = { X: p.X, Y: p.Y };
    const dx = p.X - this.tip.X;
    const dy = p.Y - this.tip.Y;
    const d = Math.hypot(dx, dy);
    if (d <= this.length) return false;
    const f = (d - this.length) / d;
    this.tip = { X: this.tip.X + dx * f, Y: this.tip.Y + dy * f };
    const last = this.points[this.points.length - 1];
    if (Math.hypot(this.tip.X - last.X, this.tip.Y - last.Y) < MIN_STEP) return false;
    this.points.push({ ...this.tip });
    return true;
  }

  /** Die Linie wurde von außen gekürzt (Zurückziehen): die Pinselspitze sitzt wieder an ihrem Ende */
  resetTip(): void {
    this.tip = { ...this.points[this.points.length - 1] };
  }

  /** Loslassen: die Linie holt bis zum Finger auf (in kleinen Schritten, damit die Linie gleichmäßig bleibt) */
  finish(): StagePoint[] {
    const d = Math.hypot(this.finger.X - this.tip.X, this.finger.Y - this.tip.Y);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      this.points.push({ X: this.tip.X + (this.finger.X - this.tip.X) * f, Y: this.tip.Y + (this.finger.Y - this.tip.Y) * f });
    }
    this.tip = { ...this.finger };
    return this.points;
  }

  /** Länge der gemalten Linie (Bühnen-Meter) */
  get drawnLength(): number {
    let l = 0;
    for (let i = 1; i < this.points.length; i++) l += Math.hypot(this.points[i].X - this.points[i - 1].X, this.points[i].Y - this.points[i - 1].Y);
    return l;
  }

  /**
   * Das Gummiband als weiche Kurve vom Linienende zum Finger: tritt in Richtung der Linie aus und biegt zum Finger.
   * Liefert Punkte (Linienende zuerst); bei schlaffem Band nur die gerade Verbindung.
   */
  band(samples = 12, finger: StagePoint = this.finger): StagePoint[] {
    const pts = this.points;
    const b = pts[pts.length - 1];
    const f = finger;
    const d = Math.hypot(f.X - b.X, f.Y - b.Y);
    if (d < 1e-6) return [b];
    // Austrittsrichtung: Richtung der letzten Linienmeter
    let i = pts.length - 1;
    let back = 0;
    while (i > 0 && back < 1.5) {
      back += Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y);
      i--;
    }
    let tx = b.X - pts[i].X;
    let ty = b.Y - pts[i].Y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) {
      tx = (f.X - b.X) / d;
      ty = (f.Y - b.Y) / d;
    } else {
      tx /= tl;
      ty /= tl;
    }
    const c = { X: b.X + tx * d * 0.5, Y: b.Y + ty * d * 0.5 };
    const out: StagePoint[] = [];
    for (let k = 0; k <= samples; k++) {
      const t = k / samples;
      const mt = 1 - t;
      out.push({ X: mt * mt * b.X + 2 * mt * t * c.X + t * t * f.X, Y: mt * mt * b.Y + 2 * mt * t * c.Y + t * t * f.Y });
    }
    return out;
  }
}

/** Polylinie gleichmäßig abtasten (Abstand step, Enden bleiben) */
export function resamplePolyline(pts: StagePoint[], step: number): StagePoint[] {
  if (pts.length < 2 || step <= 0) return pts.map((p) => ({ ...p }));
  const out: StagePoint[] = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.X - a.X, b.Y - a.Y);
    if (d < 1e-9) continue;
    let t = step - carry;
    while (t <= d) {
      out.push({ X: a.X + ((b.X - a.X) * t) / d, Y: a.Y + ((b.Y - a.Y) * t) / d });
      t += step;
    }
    carry = d - (t - step);
  }
  const last = pts[pts.length - 1];
  const o = out[out.length - 1];
  if (Math.hypot(o.X - last.X, o.Y - last.Y) > step * 0.3) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

/** Ecken abrunden (Chaikin, ein Durchgang; Anfang und Ende bleiben, wo sie sind) */
export function chaikin(pts: StagePoint[]): StagePoint[] {
  if (pts.length < 3) return pts.map((p) => ({ ...p }));
  const out: StagePoint[] = [{ ...pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ X: 0.75 * a.X + 0.25 * b.X, Y: 0.75 * a.Y + 0.25 * b.Y }, { X: 0.25 * a.X + 0.75 * b.X, Y: 0.25 * a.Y + 0.75 * b.Y });
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}
