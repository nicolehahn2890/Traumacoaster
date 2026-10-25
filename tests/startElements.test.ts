import { describe, expect, it } from 'vitest';
import type { InstancedMesh, Mesh } from 'three';
import { Box3 } from 'three';
import { createNode, sampleTrack, type TrackPath, type StartType } from '@/track/model';
import { LAUNCH_LENGTH, liftRange } from '@/physics/trainSim';
import { trackFrames } from '@/world/trackMesh';
import { CHAIN_LINK_SPACING, LAUNCH_LIGHT_SPACING, buildStartPlaceholder } from '@/world/startElements';

/** offene Pinsel-Bahn aus Stützpunkten (x, y) auf Spur 0 mit weichen Tangenten in x */
function pathOf(points: Array<[number, number]>): TrackPath {
  const nodes = points.map(([x, y], i) => createNode(x, y, 0, i === 0 ? 'station' : 'normal'));
  nodes.forEach((n, i) => {
    if (i > 0) n.inX = -(n.x - nodes[i - 1].x) / 3;
    if (i + 1 < nodes.length) n.outX = (nodes[i + 1].x - n.x) / 3;
  });
  return { nodes, elements: [], startType: 'chainlift', templates: {}, closed: false, brush: true };
}

const hill = pathOf([[0, 2], [20, 2], [45, 18], [70, 18], [100, 2], [130, 2]]);
const flat = pathOf([[0, 2], [14, 2]]);

function build(path: TrackPath, type: StartType, trackType: 'road' | 'steel' | 'wood' | 'hanging' = 'steel') {
  const samples = sampleTrack(path);
  const frames = trackFrames(samples, new Float64Array(samples.count));
  const lift = liftRange(samples);
  return { samples, frames, lift, built: buildStartPlaceholder(frames, { type, trackType, lift, stationLength: 14, groundY: 0 }) };
}

const childNamed = (built: ReturnType<typeof build>['built'], name: string) => built.group.children.find((c) => c.name === name);

describe('Startarten sichtbar (Etappe 2, Schritt 2)', () => {
  it('Kettenzug: die Kette reicht von der Station bis zum Gipfel des ersten Anstiegs, mit Zahnrädern an beiden Enden', () => {
    const { samples, lift, built } = build(hill, 'chainlift');
    expect(lift).not.toBeNull();
    // Gipfel: das Plateau bei 18 m endet, wo die Bahn danach fällt
    const i = samples.s.findIndex((s) => s >= lift!.end);
    expect(samples.y[i]).toBeCloseTo(18, 0);
    expect(samples.x[i]).toBeGreaterThan(60);
    const chain = childNamed(built, 'chain') as InstancedMesh;
    expect(chain).toBeDefined();
    expect(Math.abs(chain.count - lift!.end / CHAIN_LINK_SPACING)).toBeLessThanOrEqual(2);
    const gears = childNamed(built, 'gears') as Mesh;
    expect(gears.geometry.getAttribute('position').count).toBeGreaterThan(0);
    // die Glieder liegen auf der Bahn: die erste Instanz nahe der Station, knapp über der Bahnlinie
    const box = new Box3().setFromObject(chain);
    expect(box.min.y).toBeGreaterThan(1.5);
    expect(box.max.y).toBeLessThan(19);
    built.dispose();
  });

  it('ohne Anstieg nahe der Station gibt es keine Kette (flaches Vorgabestück)', () => {
    const { lift, built } = build(flat, 'chainlift');
    expect(lift).toBeNull();
    expect(built.group.children).toHaveLength(0);
  });

  it('Launch: Band mit Lichtern auf den ersten Metern der Physik; Hydro breiter mit Dampf-Marke', () => {
    const { built, frames } = build(hill, 'launch');
    const band = childNamed(built, 'band') as Mesh;
    expect(band).toBeDefined();
    const box = new Box3().setFromObject(band);
    expect(box.max.x).toBeLessThanOrEqual(LAUNCH_LENGTH + 0.5);
    expect(box.max.x).toBeGreaterThan(LAUNCH_LENGTH - 1.5);
    const lights = childNamed(built, 'lights') as InstancedMesh;
    const slots = Math.floor((LAUNCH_LENGTH - 1) / LAUNCH_LIGHT_SPACING) + 1;
    expect(Math.abs(lights.count - slots * 2)).toBeLessThanOrEqual(2);
    expect(childNamed(built, 'steam')).toBeUndefined();
    expect(frames[0].arc).toBe(0);
    const hydro = buildStartPlaceholder(frames, { type: 'hydro', trackType: 'steel', lift: null, stationLength: 14, groundY: 0 });
    expect(childNamed(hydro, 'steam')).toBeDefined();
    const hb = new Box3().setFromObject(childNamed(hydro, 'band') as Mesh);
    expect(hb.max.z - hb.min.z).toBeGreaterThan(box.max.z - box.min.z);
    built.dispose();
    hydro.dispose();
  });

  it('Pendel: Puffer vor dem Anfang und hinter dem Ende des Vorgabestücks', () => {
    const { built } = build(hill, 'swing');
    const buffers = childNamed(built, 'buffers') as Mesh;
    const box = new Box3().setFromObject(buffers);
    expect(box.min.x).toBeLessThan(0);
    expect(box.max.x).toBeGreaterThan(14);
    expect(box.max.x).toBeLessThan(18);
    built.dispose();
  });

  it('Vertikallift: Kette und ein Turm neben dem Kettenende vom Boden bis über die Bahn', () => {
    const { built, lift, samples } = build(hill, 'verticalLift', 'road');
    expect(childNamed(built, 'chain')).toBeDefined();
    const tower = childNamed(built, 'tower') as Mesh;
    const box = new Box3().setFromObject(tower);
    expect(box.min.y).toBeCloseTo(0, 1);
    const i = samples.s.findIndex((s) => s >= lift!.end);
    expect(box.max.y).toBeGreaterThan(samples.y[i]);
    built.dispose();
  });
});
