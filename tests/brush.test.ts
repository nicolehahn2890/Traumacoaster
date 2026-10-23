import { describe, expect, it } from 'vitest';
import { RubberBrush } from '@/track/brush';
import { BrushRefiner, planBrushTrack, type BrushPlan } from '@/track/brushTrack';
import { sampleTrack } from '@/track/model';
import { TrainSim } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import { LANE_DEPTH, toStage, type StagePoint } from '@/track/stage';

const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] } as never);

/** Catmull-Rom durch Stützpunkte, dicht wie ein Finger (Bühnen-Meter) */
function stroke(ctrl: Array<[number, number]>, step = 0.2): StagePoint[] {
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  const out: StagePoint[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ X: f(p0[0], p1[0], p2[0], p3[0]), Y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const l = ctrl[ctrl.length - 1];
  out.push({ X: l[0], Y: l[1] });
  return out;
}

/** größter Abstand (Bühne) der Bahn auf dem Bild von der Linie des Plans */
function screenDeviation(plan: BrushPlan): number {
  const s = sampleTrack(plan.path, 0.25);
  const proj: StagePoint[] = [];
  for (let i = 0; i < s.count; i++) proj.push(toStage(s.x[i], s.y[i], s.z[i]));
  let worst = 0;
  for (const p of plan.line) {
    let d = Infinity;
    for (const q of proj) d = Math.min(d, Math.hypot(p.X - q.X, p.Y - q.Y));
    worst = Math.max(worst, d);
  }
  return worst;
}

const probe = (path: Parameters<typeof sampleTrack>[0], samples: ReturnType<typeof sampleTrack>) =>
  new TrainSim(samples, path, { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true, lateralLimit: Infinity });

describe('Gummiband-Pinsel', () => {
  it('malt nichts, solange der Finger im Band zittert', () => {
    const b = new RubberBrush({ X: 0, Y: 0 }, 1);
    for (let i = 0; i < 50; i++) b.move({ X: 0.6 * Math.sin(i), Y: 0.6 * Math.cos(i * 1.3) });
    expect(b.points.length).toBe(1);
  });
  it('zieht die Linie eine Bandlänge hinter dem Finger her und holt beim Loslassen auf', () => {
    const b = new RubberBrush({ X: 0, Y: 0 }, 1);
    for (let x = 0.1; x <= 10.0001; x += 0.1) b.move({ X: x, Y: 0 });
    const last = b.points[b.points.length - 1];
    expect(last.X).toBeGreaterThan(8.9);
    expect(last.X).toBeLessThan(9.05);
    b.finish();
    expect(b.points[b.points.length - 1].X).toBeCloseTo(10, 5);
    // das Band tritt in Linienrichtung aus und endet am Finger
    b.move({ X: 10, Y: 0.5 });
    const band = b.band();
    expect(band[band.length - 1].Y).toBeCloseTo(0.5, 5);
  });
});

describe('Pinsel-Bahn: Linie = Bahn, Tiefe frei gewählt', () => {
  const hill = stroke([[0, 0], [8, 0.4], [16, 8], [22, 15], [28, 15], [34, 8], [42, 1], [52, 0.5], [62, 1]]);

  it('folgt auf dem Bild der gezeichneten Linie und bleibt über dem Boden', () => {
    const plan = planBrushTrack(hill, { ground: () => 0, clearance: 0.8 })!;
    expect(plan).not.toBeNull();
    expect(plan.closed).toBe(false);
    expect(plan.path.brush).toBe(true);
    expect(screenDeviation(plan)).toBeLessThan(0.45);
    const s = sampleTrack(plan.path, 0.25);
    for (let i = 0; i < s.count; i++) expect(s.y[i]).toBeGreaterThan(0.35);
    // Station am Anfang steht auf dem Boden
    expect(plan.path.nodes[0].kind).toBe('station');
    expect(plan.path.nodes[0].y).toBeLessThan(1.5);
    // Knoten: so wenige wie nötig
    expect(plan.path.nodes.length).toBeLessThan(14);
  });

  it('trennt Kreuzungen in der Tiefe (später Gezeichnetes vorne)', () => {
    // flach nach rechts, oben im Bogen zurück und abwärts durch den eigenen Anfang
    const cross = stroke([[0, 0], [15, 0], [30, 0], [42, 2], [46, 7], [38, 11], [26, 8], [20, 2], [16, -4], [6, -6], [-6, -6]]);
    const plan = planBrushTrack(cross, { ground: () => 0 })!;
    expect(plan.crossings.length).toBeGreaterThanOrEqual(1);
    for (const c of plan.crossings) {
      const a = plan.pts[c.i];
      const b = plan.pts[c.j];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(2.8);
      if (c.laterFront) expect(b.z).toBeLessThan(a.z);
    }
    expect(screenDeviation(plan)).toBeLessThan(0.5);
  });

  it('schließt die Runde, wenn der Strich an der Station endet', () => {
    const oval = stroke([[0, 0], [20, 0], [40, 0], [48, 3], [44, 7], [30, 7.5], [10, 7.5], [-4, 6], [-6, 2], [-1, 0.2]]);
    const plan = planBrushTrack(oval, { ground: () => 0 })!;
    expect(plan.closed).toBe(true);
    const s = sampleTrack(plan.path, 0.25);
    expect(s.closed).toBe(true);
    // Tiefe bleibt auf der Bühne
    for (let i = 0; i < s.count; i++) expect(Math.abs(s.z[i])).toBeLessThanOrEqual(2 + 1e-6);
  });

  it('bessert mit Probefahrten nach und fährt einen sanften Hügel ohne Problemstelle', () => {
    const plan = planBrushTrack(hill, { ground: () => 0 })!;
    const ref = new BrushRefiner(plan, { ground: () => 0 }, probe, 3.0);
    for (let i = 0; i < 200 && !ref.run(50); i++);
    expect(ref.done).toBe(true);
    expect(ref.accepted.length).toBe(0);
    const s = sampleTrack(ref.best, 0.25);
    const sim = new TrainSim(s, ref.best, { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true });
    for (let i = 0; i < 60 * 90 && !sim.finished; i++) sim.step(1 / 60);
    // offene Bahn: Ende am Absperrband, unterwegs nichts
    expect(sim.failReason).toBe('openEnd');
  });

  it('fährt einen Kringel am Boden ohne Problemstelle', () => {
    const curl = stroke([[0, 0], [10, 1], [18, 14], [26, 20], [34, 14], [42, 3], [50, 1], [54, 2.5], [52, 4.5], [49, 3], [52, 1], [60, 0.6], [75, 0.6]]);
    const plan = planBrushTrack(curl, { ground: () => 0 })!;
    const ref = new BrushRefiner(plan, { ground: () => 0 }, probe, 3.0);
    for (let i = 0; i < 400 && !ref.run(50); i++);
    expect(ref.done).toBe(true);
    expect(ref.accepted.length).toBe(0);
  });

  it('versucht es an einer unmöglichen Stelle mit Tiefe und Linie und nimmt sie dann hin', () => {
    // nach dem Lifthügel (18 m) ein zweiter Hügel, der viel höher ist (34 m): auch ganz nach hinten gelegt bleibt er
    // höher als der Lift, dort bleibt jeder Zug stehen
    const hook = stroke([[0, 0], [8, 1], [16, 14], [22, 18], [28, 14], [34, 6], [40, 6], [48, 22], [54, 34], [60, 30], [66, 14], [74, 2], [90, 1]]);
    const plan = planBrushTrack(hook, { ground: () => 0 })!;
    const ref = new BrushRefiner(plan, { ground: () => 0 }, probe, 3.0);
    for (let i = 0; i < 400 && !ref.run(50); i++);
    expect(ref.done).toBe(true);
    expect(ref.steps).toBeGreaterThan(0);
    expect(ref.accepted.map((a) => a.reason)).toContain('stall');
    // die Linie gibt beim Nachbessern höchstens die Toleranz nach
    for (let i = 0; i < plan.line.length; i++) expect(Math.hypot(plan.line[i].X - plan.drawn[i].X, plan.line[i].Y - plan.drawn[i].Y)).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.max(...Array.from(plan.z, Math.abs))).toBeLessThanOrEqual(2 * LANE_DEPTH + 1e-6);
  });
});
