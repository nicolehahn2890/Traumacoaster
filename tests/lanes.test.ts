import { describe, expect, it } from 'vitest';
import { lanesTrack } from '@/track/strokeToTrack';
import { sampleTrack } from '@/track/model';
import { LANE_RISE, type StagePoint } from '@/track/stage';
import type { BlockedInfo } from '@/track/gesture';

/** dichter Strich durch Stützpunkte (Bühnen-Meter), gerade Stücke */
function stroke(ctrl: Array<[number, number]>, step = 0.3): StagePoint[] {
  const out: StagePoint[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [a, b] = [ctrl[i], ctrl[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push({ X: a[0] + ((b[0] - a[0]) * k) / n, Y: a[1] + ((b[1] - a[1]) * k) / n });
  }
  const l = ctrl[ctrl.length - 1];
  out.push({ X: l[0], Y: l[1] });
  return out;
}

const opts = { groundHeight: () => 0, groundClearance: 0.8, allowLoops: true };

describe('Lesart „Ebenen“: gezeichnet wird auf der gewählten Ebene, Kurven nur über die Ebenenwahl', () => {
  // Hügel auf Ebene 0 (Bodenlinie Y = 0), endet nach rechts fahrend
  const hill = stroke([[0, 0.5], [12, 0.5], [20, 8], [26, 10], [32, 6], [44, 1], [60, 1]]);

  it('legt die Station und den ersten Strich auf die gewählte Ebene', () => {
    const p = lanesTrack(null, hill, opts, 1)!;
    expect(p).not.toBeNull();
    expect(Math.round(p.nodes[0].z)).toBe(1);
    // auf Ebene 1 liegt die Bodenlinie 4,2 m höher im Bild: der Hügel ist dort 4,2 m niedriger
    const s = sampleTrack(p, 0.5);
    for (let i = 0; i < s.count; i++) expect(Math.abs(s.z[i] - 1)).toBeLessThan(1e-6);
    const top = Math.max(...Array.from(s.y));
    expect(top).toBeGreaterThan(10 - LANE_RISE - 1.5);
    expect(top).toBeLessThan(10 - LANE_RISE + 1.5);
  });

  it('ohne gewählte Ebene ist eine Wende keine Kurve: die Bahn bleibt am Scheitel stehen', () => {
    const base = lanesTrack(null, hill, opts, 0)!;
    const out: { blocked?: BlockedInfo } = {};
    // vom Ende weiter nach rechts und dann zurück nach links
    const back = stroke([[60, 1], [70, 1], [75, 1.5], [70, 2], [50, 2], [40, 2]]);
    lanesTrack(base, back, opts, null, out);
    expect(out.blocked?.dir).toBe(0);
  });

  it('gewählte Ebene und Strich zurück: Halbkreis dorthin, dann auf ihr weiter', () => {
    const base = lanesTrack(null, hill, opts, 0)!;
    const out: { connector?: boolean } = {};
    const back = stroke([[60, 1 + 2 * LANE_RISE], [40, 1 + 2 * LANE_RISE], [20, 1 + 2 * LANE_RISE]]);
    const p = lanesTrack(base, back, opts, 2, out)!;
    expect(out.connector).toBe(true);
    expect(p.nodes.some((n) => n.kind === 'turn')).toBe(true);
    const last = p.nodes[p.nodes.length - 1];
    expect(Math.round(last.z)).toBe(2);
    expect(last.x).toBeLessThan(40);
  });

  it('gewählte Ebene und Strich weiter vorwärts: Spurwechsel ohne Kehre', () => {
    const base = lanesTrack(null, hill, opts, 0)!;
    const fwd = stroke([[60, 1 - LANE_RISE], [80, 1 - LANE_RISE], [100, 1 - LANE_RISE]]);
    const p = lanesTrack(base, fwd, opts, -1)!;
    expect(p.nodes.some((n) => n.kind === 'turn')).toBe(false);
    const last = p.nodes[p.nodes.length - 1];
    expect(Math.round(last.z)).toBe(-1);
    expect(last.x).toBeGreaterThan(90);
  });

  it('setzt die Bahn fort, auch wenn der Strich weit vom Bahnende beginnt', () => {
    const base = lanesTrack(null, hill, opts, 0)!;
    const far = stroke([[64, 9], [80, 9.5], [100, 9.5]]);
    const p = lanesTrack(base, far, opts, null)!;
    expect(p.nodes.length).toBeGreaterThan(base.nodes.length);
    expect(p.nodes[0].x).toBeCloseTo(base.nodes[0].x, 6);
    expect(p.nodes[p.nodes.length - 1].x).toBeGreaterThan(95);
  });

  it('Auto: Eine Rückkurve im Strich führt von selbst auf die nächste Ebene, am Bühnenrand warnt sie', () => {
    const base = lanesTrack(null, hill, opts, 0)!;
    // weiter nach rechts, dann zurück, der Rückweg eine Ebene höher im Bild (= hinten)
    const back = stroke([[60, 1], [72, 1], [78, 3], [74, 1 + LANE_RISE], [55, 1 + LANE_RISE], [35, 1 + LANE_RISE]]);
    const p = lanesTrack(base, back, opts, null, undefined, true)!;
    expect(p.nodes.some((n) => n.kind === 'turn')).toBe(true);
    expect(Math.round(p.nodes[p.nodes.length - 1].z)).toBe(1);
    // auf der hintersten Ebene noch weiter nach hinten: keine Ebene mehr, Warnung wie bei „Bühne“
    const top = lanesTrack(null, hill, opts, 2)!;
    const out: { blocked?: BlockedInfo } = {};
    const beyond = stroke([[60, 1 + 2 * LANE_RISE], [72, 1 + 2 * LANE_RISE], [78, 3 + 2 * LANE_RISE], [74, 1 + 3 * LANE_RISE], [55, 1 + 3 * LANE_RISE], [35, 1 + 3 * LANE_RISE]]);
    lanesTrack(top, beyond, opts, null, out, true);
    expect(out.blocked?.dir).toBe(1);
  });

  it('ein Kreis im Strich bleibt ein Looping', () => {
    const loop: StagePoint[] = [];
    for (let x = 0; x <= 20; x += 0.3) loop.push({ X: x, Y: 0.5 });
    for (let a = 0; a <= Math.PI * 2 + 0.3; a += 0.05) loop.push({ X: 20 + 7 * Math.sin(a), Y: 7.5 - 7 * Math.cos(a) });
    for (let x = 22; x <= 40; x += 0.3) loop.push({ X: x, Y: 0.5 });
    const p = lanesTrack(null, loop, opts, 0)!;
    expect(p.nodes.some((n) => n.kind === 'loopApex')).toBe(true);
  });
});
