/**
 * Schwachstellen einer Bahn (für die Marker im DEV-Modus): eine Probefahrt in Zeitscheiben, ohne Entgleis-Grenze und
 * ohne Kreuzungsprüfung, die die Querkraft je Stelle mitschreibt. Schwachstellen sind Stellen über der Querkraft-Grenze
 * des Schienentyps (je 20 m eine), die Stelle, an der die Fahrt scheitert (Fahrgäste fallen, Stillstand, Rauswurf …),
 * und Kreuzungen auf gleicher Höhe. Für jede Lesart gleich; nach jeder Änderung der Bahn neu.
 */
import { findCrossings } from './crossings';
import type { TrackPath, TrackSamples } from './model';
import type { ProbeFactory, ProbeSim } from './brushTrack';

export interface WeakSpot {
  /** Bogenlänge auf der Bahn */
  s: number;
  reason: string;
}

/** Querkraft-Spitzen, die näher als so viele Meter beieinanderliegen, sind eine Schwachstelle */
const MERGE = 20;

export class TrackInspector {
  readonly spots: WeakSpot[] = [];
  private sim: ProbeSim;
  private lat: Float64Array;
  private finished = false;
  private steps = 0;

  constructor(readonly path: TrackPath, private samples: TrackSamples, probe: ProbeFactory, private latLimit: number) {
    this.sim = probe(path, samples);
    this.lat = new Float64Array(samples.count);
  }

  get done(): boolean {
    return this.finished;
  }

  /** höchstens budgetMs rechnen; true, wenn fertig (die Fahrt endet nach spätestens drei Minuten Spielzeit) */
  run(budgetMs: number): boolean {
    if (this.finished) return true;
    const t0 = performance.now();
    const S = this.samples;
    const L = S.length;
    while (!this.sim.finished && this.steps <= 60 * 180 && performance.now() - t0 < budgetMs) {
      for (let k = 0; k < 15 && !this.sim.finished; k++, this.steps++) {
        this.sim.step(1 / 60);
        for (const c of this.sim.cars) {
          const s = S.closed ? ((c.s % L) + L) % L : Math.max(0, Math.min(L, c.s));
          const i = Math.min(S.count - 1, Math.round(s / S.step));
          if (c.gLat > this.lat[i]) this.lat[i] = c.gLat;
        }
      }
    }
    if (!this.sim.finished && this.steps <= 60 * 180) return false;
    this.collect();
    this.finished = true;
    return true;
  }

  private collect(): void {
    const S = this.samples;
    let last = -Infinity;
    for (let i = 0; i < S.count; i++) {
      if (this.lat[i] <= this.latLimit || S.s[i] - last < MERGE) continue;
      // die stärkste Stelle in der Umgebung
      let best = i;
      for (let k = i; k < S.count && S.s[k] - S.s[i] < MERGE; k++) if (this.lat[k] > this.lat[best]) best = k;
      this.spots.push({ s: S.s[best], reason: 'derail' });
      last = S.s[best];
    }
    const sim = this.sim;
    if ((sim.phase === 'failed' || sim.phase === 'flying') && sim.failReason && sim.failReason !== 'openEnd') {
      const L = S.length;
      const s0 = S.closed ? ((sim.cars[0].s % L) + L) % L : Math.max(0, Math.min(L, sim.cars[0].s));
      this.spots.push({ s: s0, reason: sim.failReason });
    }
    for (const c of findCrossings(S)) this.spots.push({ s: c.s1, reason: 'crossing' });
  }
}
