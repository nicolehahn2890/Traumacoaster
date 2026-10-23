/**
 * Kreuzungen der Bahn mit sich selbst. Zwei Stellen, an denen die Schienen sich in der Draufsicht (x, Tiefe)
 * schneiden, sind nur fahrbar, wenn eine deutlich höher liegt als die andere (ein Zug braucht Luft unter der
 * kreuzenden Schiene). Liegen beide auf gleicher Höhe, fährt der Zug an der ersten Stelle auf die andere Schiene
 * auf (Entgleisung „Kreuzung“). Ausgenommen ist die Kreuzung eines Loopings mit sich selbst: Ein- und Ausfahrt
 * kreuzen sich dort absichtlich (wie bei einem echten Looping liegt die Ausfahrt leicht versetzt).
 */
import { segmentDistance } from '@/core/math';
import { SegmentGrid } from '@/core/segmentGrid';
import type { TrackSamples } from './model';
import { LANE_DEPTH } from './stage';

export interface Crossing {
  /** Bogenlängen der beiden Stellen (s1 < s2) */
  s1: number;
  s2: number;
  /** Weltposition der Kreuzung (x, Tiefe in Spuren) und die Höhen der beiden Schienen dort */
  x: number;
  z: number;
  y1: number;
  y2: number;
}

/** Höhenabstand (m), ab dem ein Zug unter einer kreuzenden Schiene hindurchpasst */
export const CROSS_CLEARANCE = 3.2;
/** Seitlicher Abstand (m), unter dem zwei Schienen in der Draufsicht ineinanderlaufen (Überlappung statt Schnitt) */
export const OVERLAP_DIST = 1.0;
/** m Bahn zwischen den beiden Stellen: Nachbarabschnitte kreuzen sich nicht, sie berühren sich */
const CROSS_MIN_SEP = 8;
/** längster Looping (Umfang bei R = 25 m) plus Spiel: so weit auseinander dürfen die Stellen einer Looping-Kreuzung liegen */
const LOOP_SPAN = 2 * Math.PI * 25 + 20;

/** Kreuzungen auf gleicher Höhe (|y1 − y2| < clearance), aufsteigend nach s1 */
export function findCrossings(samples: TrackSamples, clearance = CROSS_CLEARANCE): Crossing[] {
  const out: Crossing[] = [];
  const n = samples.count;
  if (n < 4) return out;
  const pts = new Array(n);
  for (let i = 0; i < n; i++) pts[i] = { x: samples.x[i], y: samples.z[i] * LANE_DEPTH };
  const grid = new SegmentGrid(pts, 4);
  const near = (s1: number, s2: number): boolean => out.some((c) => Math.abs(c.s1 - s1) < 6 && Math.abs(c.s2 - s2) < 6);
  const minSep = Math.max(2, Math.ceil(CROSS_MIN_SEP / Math.max(1e-6, samples.step)));
  // Anzahl der Abtastpunkte kopfüber bis i (Präfixsumme): liegt zwischen zwei Stellen eine Inversion, ist es ein Looping
  const inv = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) inv[i + 1] = inv[i] + (samples.upy[i] < -0.5 ? 1 : 0);
  const segs = n - 1;
  for (let i = 0; i < segs; i++) {
    const ax = pts[i].x;
    const ay = pts[i].y;
    const bx = pts[i + 1].x - ax;
    const by = pts[i + 1].y - ay;
    for (const j of grid.near(i, OVERLAP_DIST, i + minSep, segs)) {
      // bei geschlossener Bahn sind auch Anfang und Ende Nachbarn
      if (samples.closed && n - 1 - j + i < minSep) continue;
      const cx = pts[j].x;
      const cy = pts[j].y;
      const dx = pts[j + 1].x - cx;
      const dy = pts[j + 1].y - cy;
      const den = bx * dy - by * dx;
      let u: number;
      let v: number;
      if (Math.abs(den) < 1e-9) {
        u = NaN;
        v = NaN;
      } else {
        u = ((cx - ax) * dy - (cy - ay) * dx) / den;
        v = ((cx - ax) * by - (cy - ay) * bx) / den;
      }
      if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) {
        // kein Schnitt: laufen die Schienen ineinander (seitlich näher als OVERLAP_DIST)? Dann gilt die nächste Stelle
        const sd = segmentDistance({ x: ax, y: ay }, { x: ax + bx, y: ay + by }, { x: cx, y: cy }, { x: cx + dx, y: cy + dy });
        if (sd.d >= OVERLAP_DIST) continue;
        const l1 = Math.hypot(bx, by);
        const l2 = Math.hypot(dx, dy);
        u = l1 > 1e-9 ? ((sd.a.x - ax) * bx + (sd.a.y - ay) * by) / (l1 * l1) : 0;
        v = l2 > 1e-9 ? ((sd.b.x - cx) * dx + (sd.b.y - cy) * dy) / (l2 * l2) : 0;
      }
      const y1 = samples.y[i] + (samples.y[i + 1] - samples.y[i]) * u;
      const y2 = samples.y[j] + (samples.y[j + 1] - samples.y[j]) * v;
      if (Math.abs(y1 - y2) >= clearance) continue;
      if (inv[j + 1] - inv[i] > 0 && samples.s[j] - samples.s[i] < LOOP_SPAN) continue; // Looping kreuzt sich selbst
      const s1 = samples.s[i] + (samples.s[i + 1] - samples.s[i]) * u;
      const s2 = samples.s[j] + (samples.s[j + 1] - samples.s[j]) * v;
      if (near(s1, s2)) continue; // dieselbe Stelle, Nachbarsegment (oder eine lange Überlappung: eine Marke)
      out.push({ s1, s2, x: ax + bx * u, z: (ay + by * u) / LANE_DEPTH, y1, y2 });
    }
  }
  return out;
}
