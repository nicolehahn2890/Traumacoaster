import { describe, expect, it } from 'vitest';
import { TrackInspector } from '@/track/inspect';
import { createNode, emptyPath, sampleTrack, type TrackPath, type TrackSamples } from '@/track/model';
import { TrainSim } from '@/physics/trainSim';
import { Terrain } from '@/physics/terrain';

const flat = new Terrain({ width: 300, terrain: [{ kind: 'flat' }] } as never);
const probe = (path: TrackPath, samples: TrackSamples) =>
  new TrainSim(samples, path, { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'chainlift', coins: [], terrain: flat, allowTunnels: true, lateralLimit: Infinity, checkCrossings: false });

/** offene Bahn durch Punkte (x, Höhe) auf Spur 0, Tangenten aus den Nachbarn */
function track(pts: Array<[number, number]>): TrackPath {
  const nodes = pts.map(([x, y], i) => {
    const n = createNode(x, y, 0);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const h = 0.33 * Math.min(i > 0 ? x - a[0] : Infinity, i < pts.length - 1 ? b[0] - x : Infinity);
    n.outX = ((b[0] - a[0]) / l) * h;
    n.outY = ((b[1] - a[1]) / l) * h;
    n.inX = -n.outX;
    n.inY = -n.outY;
    return n;
  });
  nodes[0].kind = 'station';
  return { ...emptyPath(), nodes, closed: false, startType: 'chainlift' };
}

function inspect(path: TrackPath) {
  const ins = new TrackInspector(path, sampleTrack(path, 0.25), probe, 3.0);
  for (let i = 0; i < 2000 && !ins.run(50); i++);
  return ins;
}

describe('Schwachstellen der Bahn', () => {
  it('findet keine bei einem sanften Hügel (offenes Ende zählt nicht)', () => {
    const ins = inspect(track([[0, 0.8], [15, 0.8], [30, 14], [45, 0.8], [80, 0.8]]));
    expect(ins.done).toBe(true);
    expect(ins.spots).toEqual([]);
  });

  it('meldet die Stelle, an der der Zug stehen bleibt', () => {
    // zweiter Hügel deutlich höher als der Lifthügel
    const ins = inspect(track([[0, 0.8], [15, 0.8], [30, 12], [45, 0.8], [65, 0.8], [85, 25], [105, 0.8], [130, 0.8]]));
    const stall = ins.spots.find((s) => s.reason === 'stall');
    expect(stall).toBeDefined();
    expect(stall!.s).toBeGreaterThan(60);
  });
});
