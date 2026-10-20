import { describe, expect, it } from 'vitest';
import { closeTrack, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack, trackStats } from '@/track/model';
import { TrainSim, G, type TrainSimOptions } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';
import { laneRise, type StagePoint } from '@/track/stage';

const flatTerrain = new Terrain({ width: 100, terrain: [{ kind: 'flat' }] });
const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });

function simFor(stroke: StagePoint[], over: Partial<TrainSimOptions> = {}, startType: TrainSimOptions['startType'] = 'chainlift') {
  const r = strokeToTrack(stroke);
  closeTrack(r.path); // offene Striche bekommen für die Fahrt den automatischen Rückweg
  r.path.startType = startType;
  const samples = sampleTrack(r.path);
  const sim = new TrainSim(samples, r.path, {
    cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType, coins: [], terrain: flatTerrain, allowTunnels: true, ...over,
  });
  return { sim, samples, r };
}

/** Steiler Hügel (Höhe h) kurz nach der Station */
const hill = (h: number) => stageCurve(0, 70, 140, (x) => h * Math.exp(-((x - 25) ** 2) / 60));

const run = (sim: TrainSim, seconds = 60) => {
  for (let i = 0; i < 60 * seconds && !sim.finished; i++) sim.step(1 / 60);
};

describe('Zug-Simulation', () => {
  it('rollt auf ebener Strecke ein paar Meter aus und bleibt stehen', () => {
    const { sim } = simFor(stageCurve(0, 80, 100, () => 0));
    expect(sim.liftStart).toBeLessThan(0); // kein Anstieg → kein Kettenzug
    run(sim, 30);
    expect(sim.phase).toBe('failed');
    expect(sim.failReason).toBe('stall');
    expect(sim.stats.distance).toBeGreaterThan(2);
    expect(sim.stats.distance).toBeLessThan(25);
  });
  it('zieht den Zug nur am Anstieg hoch und erreicht danach etwa sqrt(2gh)', () => {
    const { sim, samples, r } = simFor(hill(15), { frictionScale: 0 });
    expect(sim.liftStart).toBeGreaterThanOrEqual(0);
    let vmax = 0;
    let liftEnded = false;
    for (let i = 0; i < 60 * 40 && !sim.finished; i++) {
      sim.step(1 / 60);
      if (sim.events.some((e) => e.kind === 'liftEnd')) liftEnded = true;
      if (liftEnded) vmax = Math.max(vmax, sim.v);
    }
    const h = trackStats(r.path, samples).maxHeight - r.path.nodes[0].y;
    expect(h).toBeGreaterThan(13);
    // der Kettenzug übergibt den Zug mit 6 m/s an der Kuppe
    const expected = Math.sqrt(2 * G * h + 6 * 6);
    expect(liftEnded).toBe(true);
    expect(vmax).toBeGreaterThan(expected * 0.85);
    expect(vmax).toBeLessThan(expected * 1.02);
  });
  it('kommt mit Reibung in der Station an', () => {
    const { sim } = simFor(hill(15));
    run(sim);
    expect(sim.phase).toBe('done');
    expect(sim.stats.maxSpeed).toBeGreaterThan(10);
    expect(sim.stats.maxG).toBeGreaterThan(1);
  });
  it('erzeugt Airtime auf einem schnellen Hügel', () => {
    const stroke = stageCurve(0, 120, 240, (x) => 25 * Math.exp(-((x - 20) ** 2) / 60) + 6 * Math.exp(-((x - 70) ** 2) / 20));
    const { sim } = simFor(stroke);
    run(sim);
    expect(sim.stats.minG).toBeLessThan(0);
    expect(sim.stats.airtime).toBeGreaterThan(0.1);
  });
  it('bleibt am zu hohen zweiten Hügel stehen (Rückroller)', () => {
    const stroke = stageCurve(0, 120, 240, (x) => 10 * Math.exp(-((x - 20) ** 2) / 60) + 20 * Math.exp(-((x - 70) ** 2) / 80));
    const { sim } = simFor(stroke, { skin: 'skinWood' });
    run(sim);
    expect(sim.phase).toBe('failed');
    expect(sim.failReason).toBe('stall');
  });
  it('sammelt Coins ein', () => {
    const r = strokeToTrack(hill(12));
    closeTrack(r.path);
    const samples = sampleTrack(r.path);
    const i = Math.floor(samples.count * 0.2);
    const sim = new TrainSim(samples, r.path, {
      cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift',
      coins: [{ x: samples.x[i], y: samples.y[i], lane: 0 }, { x: 10, y: 40, lane: 0 }], terrain: flatTerrain, allowTunnels: true,
    });
    run(sim);
    expect(sim.stats.coins).toBe(1);
  });
  it('kommt mit Launch-Start ohne Lifthügel in Fahrt', () => {
    // steiler Hügel (sonst wäre die sanfte Welle eine Bewegung in die Tiefe)
    const stroke = stageCurve(0, 80, 160, (x) => 14 * Math.exp(-((x - 55) ** 2) / 80));
    const { sim } = simFor(stroke, { cars: 2 }, 'launch');
    run(sim);
    expect(sim.stats.maxSpeed * 3.6).toBeGreaterThan(60);
    expect(sim.phase).toBe('done');
  });
  it('fährt einen von Hand geschlossenen Rundkurs bis in die Station', () => {
    // Hügel, kurze Kehre am Ende, Rückweg oberhalb zurück und von oben in die Station (gegen die Abfahrtsrichtung)
    const stroke = [
      ...param(20, (t) => [t * 8, 0]),
      ...param(30, (t) => [8 + t * 10, 16 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(30, (t) => [18 + t * 14, 16 - 12 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(20, (t) => [32 + t * 10, 4]),
      ...param(16, (t) => [42 + 3 * Math.sin(Math.PI * t), 4 + 3 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [42 - t * 36, 7]),
      ...param(20, (t) => [6 - t * 6, 7 - 7 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ];
    const { sim, r } = simFor(stroke, { skin: 'skinWood' });
    expect(r.path.nodes.some((n) => n.kind === 'closeTurn')).toBe(true);
    run(sim);
    expect(sim.phase).toBe('done');
    expect(sim.stats.minG).toBeGreaterThan(-1.6); // Airtime an der Kuppe des Teststrichs ist ok, die Fahrt kommt an
  });
  it('fährt eine flache Bodenkurve mit Schräglage und ohne Entgleisen', () => {
    // Lifthügel, dann Oval am Boden zurück zur Station; die Kehren sind 20 m breit (enge Haarnadeln
    // wären bei 60 km/h wie in echt zu eng)
    const R = laneRise(1);
    const W = 10;
    const stroke = [
      ...stageCurve(0, 40, 80, (x) => 14 * Math.exp(-((x - 18) ** 2) / 50)),
      ...param(40, (t) => [40 + W * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(50, (t) => [40 - t * 40, 2 * R]),
      ...param(40, (t) => [-W * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
    ];
    const { sim, samples } = simFor(stroke);
    let maxBank = 0;
    let maxLat = 0;
    let minUp = 1;
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) {
      sim.step(1 / 60);
      maxBank = Math.max(maxBank, Math.abs(sim.cars[0].bank));
      maxLat = Math.max(maxLat, sim.cars[0].gLat);
      minUp = Math.min(minUp, sim.cars[0].upy);
    }
    expect(samples.length).toBeGreaterThan(80);
    expect(sim.phase).toBe('done');
    expect(maxBank).toBeGreaterThan(0.2); // Wagen legt sich in die Kurve
    expect(maxLat).toBeLessThan(3.0);
    expect(minUp).toBeGreaterThan(-0.1); // nie kopfüber (steile Abfahrt kippt den Oben-Vektor mit)
  });
});
