import { describe, expect, it } from 'vitest';
import { createNode, sampleTrack, type TrackPath } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { TrainSim, liftRange, type TrainSimOptions } from '@/physics/trainSim';
import { CAR_WORDS, carColor } from '@/world/train';

/** offene Pinsel-Bahn aus Stützpunkten (x, y) auf Spur 0 mit weichen Tangenten in x */
function pathOf(points: Array<[number, number]>): TrackPath {
  const nodes = points.map(([x, y], i) => createNode(x, y, 0, i === 0 ? 'station' : 'normal'));
  nodes.forEach((n, i) => {
    if (i > 0) n.inX = -(n.x - nodes[i - 1].x) / 3;
    if (i + 1 < nodes.length) n.outX = (nodes[i + 1].x - n.x) / 3;
  });
  return { nodes, elements: [], startType: 'chainlift', templates: {}, closed: false, brush: true };
}

const hill = pathOf([[0, 2], [20, 2], [45, 18], [70, 18], [100, 2], [200, 2]]);
const terrain = new Terrain({ width: 220, terrain: [{ kind: 'flat' }] });
const opts = (chainHeight?: number): TrainSimOptions => ({
  cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain, allowTunnels: false,
  checkCrossings: false, ...(chainHeight ? { chainHeight } : {}),
});

function ride(o: TrainSimOptions): TrainSim {
  const samples = sampleTrack(hill);
  const sim = new TrainSim(samples, hill, o);
  for (let i = 0; i < 4000 && sim.phase !== 'failed' && sim.phase !== 'done' && sim.phase !== 'flying'; i++) sim.step(1 / 60);
  return sim;
}

describe('Kettenzugstärke (Etappe 2, Schritt 3)', () => {
  it('ohne Grenze zieht die Kette bis zum Gipfel, mit Grenze nur bis zur erlaubten Höhe über der Station', () => {
    const samples = sampleTrack(hill);
    const free = liftRange(samples)!;
    expect(free.limited).toBe(false);
    const topIdx = samples.s.findIndex((s) => s >= free.end);
    expect(samples.y[topIdx]).toBeCloseTo(18, 0);
    const short = liftRange(samples, 8)!;
    expect(short.limited).toBe(true);
    expect(short.end).toBeLessThan(free.end);
    const i = samples.s.findIndex((s) => s >= short.end);
    // Station liegt auf 2 m: die Kette endet, wo die Bahn 10 m erreicht
    expect(samples.y[i]).toBeGreaterThanOrEqual(10 - 0.3);
    expect(samples.y[i]).toBeLessThan(11.5);
    // eine Grenze über dem Gipfel ändert nichts
    const tall = liftRange(samples, 40)!;
    expect(tall.end).toBeCloseTo(free.end, 6);
    expect(tall.limited).toBe(false);
  });

  it('reicht die Kette nicht bis zum Gipfel, rollt der Zug zurück und der Fehlgrund heißt „chain“; mit Kette bis oben kommt er über den Hügel', () => {
    const short = ride(opts(8));
    expect(short.phase).toBe('failed');
    expect(short.failReason).toBe('chain');
    const far = ride(opts());
    // ohne Grenze fährt der Zug über den Hügel bis ans offene Ende (dort endet die Fahrt am Absperrband)
    expect(far.failReason).not.toBe('chain');
    expect(far.failReason).not.toBe('stall');
    expect(far.stats.maxSpeed).toBeGreaterThan(12);
  });

  it('Wagenvariante: Farbwort oder Hex-Wert, sonst keine Farbe', () => {
    expect(carColor('rot')).toBe(CAR_WORDS.rot);
    expect(carColor(' Blau ')).toBe(CAR_WORDS.blau);
    expect(carColor('#A1B2C3')).toBe('#a1b2c3');
    expect(carColor('karo')).toBeNull();
    expect(carColor(undefined)).toBeNull();
  });
});
