import { describe, expect, it } from 'vitest';
import { RubberBrush } from '@/track/brush';
import { BrushRefiner, dubinsPaths, findElements, findLineCrossings, planBrushTrack, prepareBrushLine, type BrushPlan } from '@/track/brushTrack';
import { findCrossings } from '@/track/crossings';
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
  new TrainSim(samples, path, { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true, lateralLimit: Infinity, checkCrossings: false });

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

  it('hält die Kreuzungsregel der Fahrt ein, auch wo Stränge dicht nebeneinander laufen', () => {
    // Acht mit zwei Kreuzungen
    const eight = stroke([[0, 0], [14, 0.5], [26, 3], [34, 9], [32, 15], [24, 16], [18, 11], [20, 5], [28, 1], [40, 1.5], [50, 6], [48, 12], [40, 13], [36, 8], [42, 2], [56, 0.5], [70, 0.5]]);
    // Rückweg knapp über dem Hinweg (auf dem Bild 1,5 m darüber)
    const hairpin = stroke([[0, 0], [20, 0.5], [40, 1.5], [52, 3], [54, 5], [46, 6], [30, 3.5], [12, 2.5], [-4, 3], [-10, 8]]);
    for (const s of [eight, hairpin]) {
      const plan = planBrushTrack(s, { ground: () => 0 })!;
      expect(findCrossings(sampleTrack(plan.path, 0.25))).toEqual([]);
      expect(screenDeviation(plan)).toBeLessThan(0.5);
    }
    expect(planBrushTrack(eight, { ground: () => 0 })!.crossings.length).toBeGreaterThanOrEqual(2);
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

describe('Pinsel-Bahn: Loopings und gerade Hügel', () => {
  /** Lifthügel, dann eine Schleife (x = 60 + a·t + b·sin t, Höhe c·(1 − cos t)), dann flach weiter */
  function withLoop(a: number, b: number, c: number, lift = 22): StagePoint[] {
    const pts = stroke([[0, 0], [8, 0.4], [16, lift * 0.5], [22, lift], [28, lift], [36, lift * 0.4], [44, 1], [52, 0.5], [60, 0.5]]);
    for (let t = 0.05; t <= 2 * Math.PI; t += 0.02) pts.push({ X: 60 + a * t + b * Math.sin(t), Y: 0.5 + c * (1 - Math.cos(t)) });
    const end = 60 + a * 2 * Math.PI;
    for (let x = end + 0.3; x <= end + 30; x += 0.3) pts.push({ X: x, Y: 0.5 });
    return pts;
  }
  const refine = (plan: BrushPlan) => {
    const ref = new BrushRefiner(plan, { ground: () => 0 }, probe, 3.0);
    for (let i = 0; i < 400 && !ref.run(50); i++);
    return ref;
  };

  it('macht aus einer hohen Schleife einen senkrechten Looping, aus einer flachen eine Bodenschleife', () => {
    const tall = planBrushTrack(withLoop(1.5, 5, 8), { ground: () => 0 })!;
    expect(tall.elements.loops.map((l) => l.vertical)).toEqual([true]);
    const flatLoop = planBrushTrack(withLoop(4, 12, 2.2), { ground: () => 0 })!;
    expect(flatLoop.elements.loops.map((l) => l.vertical)).toEqual([false]);
    // Looping: Die Tiefe bleibt fast gleich, nur so weit versetzt, dass Ein- und Ausfahrt aneinander vorbeikommen
    const l = tall.elements.loops[0];
    const z = Array.from(tall.z.slice(l.i, l.j + 1));
    expect(Math.max(...z) - Math.min(...z)).toBeLessThan(3.5);
    expect(Math.abs(tall.z[l.j] - tall.z[l.i])).toBeGreaterThan(2);
    // der Zug fährt über Kopf durch und kommt heil heraus
    const ref = refine(tall);
    expect(ref.accepted).toEqual([]);
    const s = sampleTrack(ref.best, 0.25);
    expect(Array.from(s.upy).some((u) => u < -0.9)).toBe(true);
  });

  it('lässt einen Looping stehen, auch wenn der Schwung nicht reicht (der Strich entscheidet)', () => {
    const plan = planBrushTrack(withLoop(1.5, 5, 8, 9), { ground: () => 0 })!;
    expect(plan.elements.loops[0]?.vertical).toBe(true);
    const ref = refine(plan);
    expect(ref.accepted.length).toBeGreaterThan(0);
    const s = sampleTrack(ref.best, 0.25);
    expect(Array.from(s.upy).some((u) => u < -0.9)).toBe(true);
  });

  it('baut Hügel gerade: Die Kuppe weicht nicht nach hinten aus', () => {
    const two = stroke([[0, 0], [8, 0.4], [16, 10], [22, 20], [28, 20], [36, 8], [44, 1], [52, 0.5], [60, 6], [66, 12], [72, 12], [78, 6], [86, 1], [100, 1]]);
    const plan = planBrushTrack(two, { ground: () => 0 })!;
    expect(plan.elements.hills.length).toBe(2);
    for (const h of plan.elements.hills) {
      // Tiefe über dem Hügel: höchstens wenig neben der Geraden zwischen den Füßen
      for (let i = h.a; i <= h.b; i++) {
        const t = (i - h.a) / (h.b - h.a);
        expect(Math.abs(plan.z[i] - (plan.z[h.a] + (plan.z[h.b] - plan.z[h.a]) * t))).toBeLessThan(1.5);
      }
    }
    // der Lifthügel an der Station bleibt ganz auf ihrer Tiefe
    const lift = plan.elements.hills[0];
    for (let i = lift.a; i <= lift.top; i++) expect(Math.abs(plan.z[i] - plan.z[lift.a])).toBeLessThan(0.6);
  });

  it('legt einen Hügel doch nach hinten, wenn der Zug sonst nicht hinaufkommt', () => {
    // kleiner Lifthügel (8 m), dann ein Hügel, der gerade 12 m hoch wäre
    const steps = stroke([[0, 0], [6, 0.4], [12, 8], [16, 8], [22, 1], [32, 0.5], [40, 6], [46, 12], [52, 12], [58, 6], [66, 1], [80, 1]]);
    const plan = planBrushTrack(steps, { ground: () => 0 })!;
    expect(plan.elements.hills.length).toBe(2);
    const second = plan.elements.hills[1];
    const before = plan.pts[second.top].y;
    const ref = refine(plan);
    expect(ref.accepted).toEqual([]);
    expect(plan.pts[second.top].y).toBeLessThan(before - 1);
  });

  it('erkennt Elemente auch an der Linie allein (Vorschau: Anstieg am Ende zählt als Hügel)', () => {
    const line: StagePoint[] = [];
    for (let i = 0; i <= 40; i++) line.push({ X: i, Y: i < 10 ? 0.5 : 0.5 + (i - 10) * 0.6 });
    const el = findElements(line, findLineCrossings(line, false));
    expect(el.hills).toEqual([{ a: expect.any(Number), top: 40, b: 40, open: true }]);
  });
});

describe('Pinsel-Bahn: Rundenschluss', () => {
  /** Winkel (Grad) zwischen ankommender und abfahrender Richtung am Stationsknoten */
  const stationKink = (plan: BrushPlan): number => {
    const s0 = plan.path.nodes[0];
    const a = [-s0.inX, -s0.inY, -s0.inZ * LANE_DEPTH];
    const o = [s0.outX, s0.outY, s0.outZ * LANE_DEPTH];
    const c = (a[0] * o[0] + a[1] * o[1] + a[2] * o[2]) / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(o[0], o[1], o[2]));
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  };
  /** kleinster Bildradius des Rundenschlusses (ab seinem Anschluss an den Strich bis in die Station) */
  const closureRadius = (points: StagePoint[], closeSnap: number, closeReach = 0): number => {
    const prep = prepareBrushLine(points, closeSnap, closeReach)!;
    const L = prep.line;
    let k = 0;
    for (let i = Math.max(1, (prep.closeFrom ?? L.length) - 3); i < L.length - 1; i++) {
      const [p, q, r] = [L[i - 1], L[i], L[i + 1]];
      const cr = Math.abs((q.X - p.X) * (r.Y - q.Y) - (q.Y - p.Y) * (r.X - q.X));
      const den = Math.hypot(q.X - p.X, q.Y - p.Y) * Math.hypot(r.X - q.X, r.Y - q.Y) * Math.hypot(r.X - p.X, r.Y - p.Y);
      if (den > 1e-12) k = Math.max(k, (2 * cr) / den);
    }
    return 1 / Math.max(k, 1e-9);
  };

  it('findet immer einen Dubins-Weg, der genau in der Zielrichtung ankommt', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 300; k++) {
      const a = { X: rnd() * 40 - 20, Y: rnd() * 40 - 20, th: rnd() * 6.28 };
      const b = { X: rnd() * 40 - 20, Y: rnd() * 40 - 20, th: rnd() * 6.28 };
      const paths = dubinsPaths(a, b, 6, 0.5);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(Math.hypot(p[p.length - 1].X - b.X, p[p.length - 1].Y - b.Y)).toBeLessThan(0.15);
    }
  });

  it('schließt eine Runde, die über die Station hinaus gezeichnet ist, ohne Knick und ohne enge Kurve', () => {
    // Oval, das Ende läuft 1,5 m über den Anfang hinaus (wie oft von Hand)
    const oval: StagePoint[] = [];
    for (let x = 0; x <= 40; x += 0.3) oval.push({ X: x, Y: 0 });
    for (let a = 0; a <= Math.PI; a += 0.04) oval.push({ X: 40 + 7 * Math.sin(a), Y: 7 - 7 * Math.cos(a) });
    for (let x = 40; x >= -5; x -= 0.3) oval.push({ X: x, Y: 14 });
    for (let a = 0; a <= Math.PI; a += 0.04) oval.push({ X: -5 - 7 * Math.sin(a), Y: 7 + 7 * Math.cos(a) });
    for (let x = -5; x <= 1.5; x += 0.3) oval.push({ X: x, Y: 0 });
    const plan = planBrushTrack(oval, { ground: () => 0 })!;
    expect(plan.closed).toBe(true);
    expect(stationKink(plan)).toBeLessThan(1);
    expect(closureRadius(oval, 8)).toBeGreaterThan(4.5);
    expect(findCrossings(sampleTrack(plan.path, 0.25))).toEqual([]);
  });

  it('wendet, wenn das Ende entgegen der Stationsrichtung ankommt, und kreuzt dabei nichts', () => {
    // nach rechts hinaus, oben zurück und von rechts kommend knapp über der Station enden (Richtung entgegen)
    const back = stroke([[0, 0], [20, 0], [40, 0], [50, 5], [40, 10], [20, 10], [8, 6], [4, 2.5]]);
    const plan = planBrushTrack(back, { ground: () => 0, closeSnap: 8 })!;
    expect(plan.closed).toBe(true);
    expect(stationKink(plan)).toBeLessThan(1);
    expect(closureRadius(back, 8)).toBeGreaterThan(4.5);
  });

  it('schließt auf Wunsch auch mit größerem Abstand (Tipp auf die Station)', () => {
    const open = stroke([[0, 0], [20, 0], [40, 0], [50, 4], [44, 9], [30, 9.5], [10, 9.5], [-8, 9], [-16, 6]]);
    expect(planBrushTrack(open, { ground: () => 0, closeSnap: 8 })!.closed).toBe(false);
    const plan = planBrushTrack(open, { ground: () => 0, closeSnap: 8, closeReach: 25 })!;
    expect(plan.closed).toBe(true);
    expect(stationKink(plan)).toBeLessThan(1);
    expect(closureRadius(open, 8, 25)).toBeGreaterThan(4.5);
  });
});
