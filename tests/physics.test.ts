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
  it('lässt die Fahrgäste den Launch als Beschleunigung spüren', () => {
    const stroke = stageCurve(0, 80, 160, (x) => 14 * Math.exp(-((x - 55) ** 2) / 80));
    const { sim } = simFor(stroke, { cars: 1 }, 'launch');
    let maxFwd = 0;
    for (let i = 0; i < 30; i++) {
      sim.step(1 / 60);
      maxFwd = Math.max(maxFwd, sim.cars[0].feltFwd);
    }
    // 12 m/s² Launch minus Reibung und Luftwiderstand
    expect(maxFwd).toBeGreaterThan(11);
    expect(maxFwd).toBeLessThan(12.5);
  });
  it('drückt die Fahrgäste am Kettenzug in die Lehne (Hangabtrieb ohne Beschleunigung)', () => {
    const { sim } = simFor(hill(15), { frictionScale: 0 });
    let checked = 0;
    let sumDiff = 0;
    let maxDiff = 0;
    for (let i = 0; i < 60 * 20 && !sim.events.some((e) => e.kind === 'liftEnd'); i++) {
      sim.step(1 / 60);
      const c = sim.cars[0];
      if (sim.phase === 'lift' && c.ty > 0.3) {
        // Hangabtrieb g·sin α in die Lehne; kleine Abweichung aus der über ±1,2 m gemittelten Krümmung
        const d = Math.abs(c.feltFwd - G * c.ty);
        sumDiff += d;
        maxDiff = Math.max(maxDiff, d);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
    // im Mittel Hangabtrieb; an der Kuppe weicht die über ±1,2 m gemittelte Krümmung kurz ab (bis ~1,3 m/s²)
    expect(sumDiff / checked).toBeLessThan(0.25);
    expect(maxDiff).toBeLessThan(2);
  });
  it('hält den Zustand vor dem Schritt für die Interpolation bereit', () => {
    const { sim } = simFor(hill(15));
    sim.step(1 / 60);
    sim.step(1 / 60);
    expect(sim.prevCars[0].s).toBeLessThan(sim.cars[0].s);
    expect(sim.prevCars[0].s).toBeGreaterThan(0);
  });
  it('hält ein schnelles Tal nach einem 30-m-Drop bei rund 4 g (Begrenzer rechnet das Gefälle ein)', () => {
    // Drop von 30 m in einen Auslauf: Das Tal ist auf VALLEY_G = 3 g zusätzlich ausgelegt. Der Begrenzer misst die
    // Sehnenhöhe senkrecht; ohne den Gefälle-Faktor ließ er auf der steilen Flanke bis zu doppelt so enge Radien
    // durch (6 g statt 4 g). Toleranz für den Bezier-Fit: eine halbe g.
    const stroke = stageCurve(0, 160, 320, (x) => 30 * Math.exp(-((x - 20) ** 2) / 80) + 22 * Math.exp(-((x - 90) ** 2) / 300));
    for (const fit of ['legacy', 'apex'] as const) {
      const r = strokeToTrack(stroke, { fit });
      closeTrack(r.path);
      r.path.startType = 'chainlift';
      const samples = sampleTrack(r.path);
      const sim = new TrainSim(samples, r.path, { cars: 1, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flatTerrain, allowTunnels: true });
      run(sim);
      expect(sim.stats.maxSpeed).toBeGreaterThan(20);
      expect(sim.stats.maxG).toBeLessThan(4.8);
    }
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
  it('entgleist auf Holz in der engen Kehre bei fast 90 km/h und fliegt sichtbar davon', () => {
    // 42-m-Lifthügel, dann eine 4 m enge Kehre am Boden: knapp 3 g quer trotz voller Schräglage
    const R = laneRise(1);
    const W = 4;
    const stroke = [
      ...stageCurve(0, 40, 80, (x) => 42 * Math.exp(-((x - 18) ** 2) / 50)),
      ...param(40, (t) => [40 + W * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(50, (t) => [40 - t * 40, 2 * R]),
      ...param(40, (t) => [-W * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
    ];
    // Ohne Verkleinerung nach hinten (LANE_SCALE 1) wird diese Kehre der Bühnen-Lesart rund 4 g eng; früher hielt die
    // Weltraum-Bahn (3,5 g) sie noch, das gilt seitdem nicht mehr
    const wood = simFor(stroke, { skin: 'skinWood', cars: 2 }).sim;
    let maxV = 0;
    for (let i = 0; i < 60 * 60 && wood.phase !== 'flying'; i++) {
      wood.step(1 / 60);
      maxV = Math.max(maxV, wood.v);
    }
    expect(wood.failReason).toBe('derail');
    expect(wood.phase).toBe('flying');
    expect(wood.finished).toBe(true);
    expect(maxV * 3.6).toBeGreaterThan(80);
    const z0 = wood.cars[0].z;
    const railY = wood.cars[0].y;
    // Flug: der Wagen kippt bis zum Anschlag zur Seite, driftet aus der Spur und bleibt am Boden liegen
    for (let i = 0; i < 60 * 8 && !wood.flight!.settled; i++) wood.step(1 / 60);
    expect(wood.flight!.settled).toBe(true);
    expect(wood.flight!.impacts.length).toBeGreaterThan(0);
    expect(Math.abs(wood.cars[0].bank)).toBeCloseTo(Math.PI / 2, 1);
    expect(Math.abs(wood.cars[0].z - z0)).toBeGreaterThan(0.2);
    expect(wood.cars[0].y).toBeLessThan(railY + 0.5);
    expect(wood.cars[0].y).toBeGreaterThan(0.2); // nicht durch den Boden gefallen
    expect(wood.sinceFail).toBeLessThan(8);
  });
});
