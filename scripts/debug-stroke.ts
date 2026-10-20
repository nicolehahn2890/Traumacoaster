/* Debug-Helfer: Strich interpretieren, Bahn abtasten und Fahrt simulieren; Ausgabe als Text. */
import { stageCurve, strokeToTrack } from '../src/track/strokeToTrack';
import { sampleTrack, trackStats } from '../src/track/model';
import { TrainSim } from '../src/physics/trainSim';
import { Terrain } from '../src/physics/terrain';
import { laneRise, type StagePoint } from '../src/track/stage';

const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });
const flatTerrain = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const hill = (h: number) => stageCurve(0, 70, 140, (x) => h * Math.exp(-((x - 25) ** 2) / 60));

const CARS = Number(process.env.CARS ?? '1') || 1;
function report(name: string, stroke: StagePoint[], startType: 'chainlift' | 'launch' = 'chainlift', skin = 'skinSteel') {
  const r = strokeToTrack(stroke);
  r.path.startType = startType;
  const s = sampleTrack(r.path);
  const st = trackStats(r.path, s);
  console.log(`\n=== ${name}: nodes=${r.path.nodes.length} len=${s.length.toFixed(1)} events=${JSON.stringify(r.events)} stats=${JSON.stringify(st)}`);
  console.log('modes:', r.points.map((p) => (p.mode === 'floor' ? 'f' : 'H')).join(''));
  console.log('nodes:', r.path.nodes.map((n) => `${n.kind[0]}(${n.x.toFixed(1)},${n.y.toFixed(1)},${n.z.toFixed(2)})`).join(' '));
  const sim = new TrainSim(s, r.path, { cars: CARS, carLength: 2.4, skin, frictionScale: 1, gravityScale: 1, startType, coins: [], terrain: flatTerrain, allowTunnels: true });
  console.log(`lift ${sim.liftStart.toFixed(1)}..${sim.liftEnd.toFixed(1)}`);
  let last = -1;
  const ring: string[] = [];
  for (let i = 0; i < 60 * 60 && !sim.finished; i++) {
    sim.step(1 / 60);
    const c = sim.cars[0];
    {
      const idx = Math.min(s.count - 1, Math.round(c.s / s.step));
      const kk = Math.hypot(s.k3x[idx], s.k3y[idx], s.k3z[idx]);
      ring.push(`  t=${sim.t.toFixed(2)} s=${c.s.toFixed(1)} v=${sim.v.toFixed(1)} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} z=${c.z.toFixed(2)} gSeat=${c.gSeat.toFixed(2)} gLat=${c.gLat.toFixed(2)} bank=${((c.bank * 180) / Math.PI).toFixed(0)} k=${kk.toFixed(3)} kz=${s.k3z[idx].toFixed(3)} auto=${s.auto[idx]}`);
      if (ring.length > 24) ring.shift();
    }
    const sec = Math.floor(sim.t * 2);
    if (sec !== last) {
      last = sec;
      const k = Math.hypot(s.k3x[Math.min(s.count - 1, Math.round(c.s / s.step))], s.k3y[Math.min(s.count - 1, Math.round(c.s / s.step))], s.k3z[Math.min(s.count - 1, Math.round(c.s / s.step))]);
      console.log(`t=${sim.t.toFixed(1)} s=${c.s.toFixed(1)} v=${sim.v.toFixed(1)} y=${c.y.toFixed(1)} z=${c.z.toFixed(2)} gSeat=${c.gSeat.toFixed(2)} gLat=${c.gLat.toFixed(2)} bank=${((c.bank * 180) / Math.PI).toFixed(0)} upy=${c.upy.toFixed(2)} k=${k.toFixed(3)} phase=${sim.phase}`);
    }
  }
  console.log(`END phase=${sim.phase} reason=${sim.failReason} t=${sim.t.toFixed(1)} maxSpeed=${(sim.stats.maxSpeed * 3.6).toFixed(0)} maxG=${sim.stats.maxG.toFixed(1)} maxLat=${sim.stats.maxLatG.toFixed(2)} dist=${sim.stats.distance.toFixed(1)}`);
  if (sim.phase === 'failed') console.log(ring.join('\n'));
  const c = sim.cars[0];
  console.log(`last car s=${c.s.toFixed(1)} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} z=${c.z.toFixed(2)} gLat=${c.gLat.toFixed(2)}`);
}

const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'hill') report('hill15', hill(15));
if (which === 'all' || which === 'launch') report('launch', stageCurve(0, 80, 160, (x) => 12 * Math.exp(-((x - 55) ** 2) / 40)), 'launch');
if (which === 'all' || which === 'stall') report('stall', stageCurve(0, 120, 240, (x) => 10 * Math.exp(-((x - 20) ** 2) / 60) + 20 * Math.exp(-((x - 70) ** 2) / 80)), 'chainlift', 'skinWood');
if (which === 'all' || which === 'oval') {
  const R = laneRise(1);
  report('oval', [
    ...stageCurve(0, 40, 80, (x) => 14 * Math.exp(-((x - 18) ** 2) / 50)),
    ...param(40, (t) => [40 + 10 * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
    ...param(50, (t) => [40 - t * 40, 2 * R]),
    ...param(40, (t) => [-10 * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
  ]);
}
if (which === 'hairpin') {
  const R = laneRise(1);
  const pts: Array<[number, number]> = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 18], [24, 14], [30, 10], [40, 10], [46, 10.2], [50, 12], [46, 13.8], [40, 14], [26, 14], [16, 12], [10, R + 2], [4, R], [-4, R], [-10, R]];
  // Catmull-Rom wie im Szenario
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const stroke: StagePoint[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let s = 1; s <= 10; s++) {
      const t = s / 10; const t2 = t * t; const t3 = t2 * t;
      stroke.push({
        X: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        Y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  report('hairpin', stroke, 'chainlift', 'skinWood');
}
if (which === 'circuit') {
  report('circuit', [
    ...param(20, (t) => [t * 8, 0]),
    ...param(30, (t) => [8 + t * 10, 16 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ...param(30, (t) => [18 + t * 14, 16 - 12 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ...param(20, (t) => [32 + t * 10, 4]),
    ...param(16, (t) => [42 + 3 * Math.sin(Math.PI * t), 4 + 3 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ...param(40, (t) => [42 - t * 36, 7]),
    ...param(20, (t) => [6 - t * 6, 7 - 7 * (1 - Math.cos(Math.PI * t)) * 0.5]),
  ], 'chainlift', 'skinWood');
}
if (which === 'hairpin2') {
  // aktueller Szenario-Strich auf Level 8 (Terrain-Hügel bei x=50), 2 Wagen, Holz
  const R = laneRise(1);
  const pts: Array<[number, number]> = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 18], [24, 14], [30, 10], [40, 10], [46, 10.2], [50, 12], [46, 13.8], [40, 14], [26, 14], [18, 13.2], [10, 10], [2, 6], [-4, R + 0.3], [-12, R]];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const stroke: StagePoint[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let s = 1; s <= 10; s++) {
      const t = s / 10; const t2 = t * t; const t3 = t2 * t;
      stroke.push({
        X: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        Y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  const terrain8 = new Terrain({ width: 70, terrain: [{ kind: 'hill', x: 50, width: 20, height: 4 }] as never });
  const r = strokeToTrack(stroke, { groundHeight: (x, z) => terrain8.surfaceHeight(x, z), groundClearance: 0.8 });
  const s = sampleTrack(r.path);
  console.log('nodes:', r.path.nodes.map((n) => `${n.kind[0]}(${n.x.toFixed(1)},${n.y.toFixed(1)},${n.z.toFixed(2)})`).join(' '));
  const sim = new TrainSim(s, r.path, { cars: 2, carLength: 2.4, skin: 'skinWood', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: terrain8, allowTunnels: false });
  const ring: string[] = [];
  for (let i = 0; i < 60 * 60 && !sim.finished; i++) {
    sim.step(1 / 60);
    for (const c of sim.cars) {
      const idx = Math.min(s.count - 1, Math.round(c.s / s.step));
      ring.push(`  car${c.index} t=${sim.t.toFixed(2)} s=${c.s.toFixed(1)} v=${sim.v.toFixed(1)} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} z=${c.z.toFixed(2)} gSeat=${c.gSeat.toFixed(2)} gLat=${c.gLat.toFixed(2)} bank=${((c.bank * 180) / Math.PI).toFixed(0)} k=${Math.hypot(s.k3x[idx], s.k3y[idx], s.k3z[idx]).toFixed(3)}`);
    }
    if (ring.length > 30) ring.splice(0, ring.length - 30);
  }
  console.log(`END phase=${sim.phase} reason=${sim.failReason} t=${sim.t.toFixed(1)} maxLat=${sim.stats.maxLatG.toFixed(2)}`);
  if (sim.phase === 'failed') console.log(ring.join('\n'));
}
