import { describe, expect, it } from 'vitest';
import { createNode, liftTopArc, sampleTrack, type TrackPath } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { TrainSim, liftRange, type TrainSimOptions } from '@/physics/trainSim';
import { LIFT_BEND, stationPath } from '@/zone/build';
import { LIFT_HEIGHT_DEFAULT, formatFieldLine, formatStageLine, parseFieldLine, parseStageLine, resolveAbilities } from '@/zone/abilities';
import { emptyZone, newField, parseZone, serializeZone } from '@/zone/types';
import { evaluateGoal } from '@/levels/evaluator';
import { trackFrames } from '@/world/trackMesh';
import { buildStartPlaceholder } from '@/world/startElements';
import type { Mesh } from 'three';
import { Box3 } from 'three';

const st = { id: 's1', x: 10, y: 1, z: 0, dir: 1 as const, length: 14 };

/** Vorgabestück mit Aufzug und danach ein flacher Auslauf nach rechts (wie ein Strich ab dem oberen Ende) */
function elevatorPath(height: number): TrackPath {
  const p = stationPath(st, height);
  const top = p.nodes[p.nodes.length - 1];
  const out = createNode(top.x + 30, top.y - 2, 0);
  top.outY = 4;
  out.inX = -10;
  p.nodes.push(out);
  return p;
}

describe('Vertikallift als Aufzug (Etappe 2, Schritt 3b)', () => {
  it('Vorgabestück mit Hubhöhe: Bahnsteig, Viertelkreis, senkrecht hoch, oben der Knoten „lift“', () => {
    const p = stationPath(st, 12);
    expect(p.nodes).toHaveLength(4);
    expect(p.startType).toBe('verticalLift');
    const [a, b, c, d] = p.nodes;
    expect(a.kind).toBe('station');
    expect(b.x).toBeCloseTo(10 + 14 - LIFT_BEND, 9);
    expect(c.x).toBeCloseTo(24, 9);
    expect(c.y).toBeCloseTo(1 + LIFT_BEND, 9);
    expect(d.kind).toBe('lift');
    expect(d.x).toBeCloseTo(24, 9);
    expect(d.y).toBeCloseTo(13, 9);
    expect(d.inY).toBeLessThan(0);
    // ohne Hubhöhe wie bisher gerade
    expect(stationPath(st).nodes).toHaveLength(2);
    expect(stationPath(st, 0).nodes).toHaveLength(2);
    // die Abtastung steigt am Ende senkrecht
    const samples = sampleTrack(p);
    const i = samples.count - 2;
    expect(Math.abs(samples.t3x[i])).toBeLessThan(0.05);
    expect(samples.t3y[i]).toBeGreaterThan(0.99);
  });

  it('die Fahrt des Lifts endet am oberen Ende des Aufzugs, auch wenn die Bahn danach weiter steigt', () => {
    const p = elevatorPath(12);
    const samples = sampleTrack(p);
    const topArc = liftTopArc(p, samples)!;
    expect(topArc).toBeGreaterThan(11 + (Math.PI / 2) * LIFT_BEND + 9 - 1);
    expect(topArc).toBeLessThan(11 + (Math.PI / 2) * LIFT_BEND + 9 + 1);
    // ohne Deckel liefe die Kette weiter (die Bahn steigt nach dem Aufzug zuerst noch); mit Deckel endet sie oben
    const free = liftRange(samples)!;
    expect(free.end).toBeGreaterThan(topArc);
    const capped = liftRange(samples, undefined, topArc)!;
    expect(capped.end).toBeCloseTo(topArc, 6);
    expect(capped.limited).toBe(false);
    // die Fahrt nutzt den Deckel von selbst (Knoten „lift“ im Pfad), die Kettenzugstärke gilt dem Aufzug nicht
    const terrain = new Terrain({ width: 120, terrain: [{ kind: 'flat' }] });
    const opts: TrainSimOptions = { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'verticalLift', coins: [], terrain, allowTunnels: false, checkCrossings: false, chainHeight: 4 };
    const sim = new TrainSim(samples, p, opts);
    expect(sim.liftEnd).toBeCloseTo(topArc, 6);
    expect(liftTopArc(stationPath(st), sampleTrack(stationPath(st)))).toBeNull();
  });

  it('Hubhöhe: Wert der Stufe oder des Felds, sonst die Vorgabe; Zeilen lesen und schreiben sie', () => {
    const zone = emptyZone('basiszone');
    expect(resolveAbilities(zone, null).lift).toBe(LIFT_HEIGHT_DEFAULT);
    zone.upgrades = [{ abilities: ['verticalLift'], belt: 0, lift: 15 }];
    const f = newField(zone, 0, 0, 100, 40);
    f.upgrade = 0;
    expect(resolveAbilities(zone, f).lift).toBe(15);
    f.lift = 25;
    expect(resolveAbilities(zone, f).lift).toBe(25);
    expect(parseStageLine('vertikallift, hub 18').upgrade.lift).toBe(18);
    expect(formatStageLine({ abilities: ['verticalLift'], belt: 1, lift: 18 })).toBe('vertikallift, gurt 1, kette frei, hub 18');
    expect(parseFieldLine('aufzug 22').overrides).toEqual({ lift: 22 });
    expect(formatFieldLine({ lift: 22 })).toBe('hub 22');
    const back = parseZone(JSON.parse(serializeZone({ ...zone, fields: [f] })))!;
    expect(back.upgrades![0].lift).toBe(15);
    expect(back.fields[0].lift).toBe(25);
  });

  it('Zielarten „Aufzug-Start“ und „Pendel-Start“ zählen die gewählte Startart (Florian, 25.10.)', () => {
    const ts = { length: 0, maxHeight: 0, loops: 0, turns: 0, lanes: 0, rolls: 0, maxDrop: 0 } as Parameters<typeof evaluateGoal>[2];
    const lift = elevatorPath(10);
    expect(evaluateGoal({ type: 'verticalLift' }, lift, ts, null, false).done).toBe(true);
    expect(evaluateGoal({ type: 'swingLaunch' }, lift, ts, null, false).done).toBe(false);
    const swing = { ...stationPath(st), startType: 'swing' as const };
    expect(evaluateGoal({ type: 'swingLaunch' }, swing, ts, null, false).done).toBe(true);
    expect(evaluateGoal({ type: 'verticalLift' }, swing, ts, null, false).done).toBe(false);
    // der Aufzug zählt weiter als Kettenzug-Start, das Pendel als Launch
    expect(evaluateGoal({ type: 'chainlift' }, lift, ts, null, false).done).toBe(true);
    expect(evaluateGoal({ type: 'launch' }, swing, ts, null, false).done).toBe(true);
  });

  it('Gerüst des Aufzugs steht um das senkrechte Stück, vom Boden bis über das obere Ende', () => {
    const p = elevatorPath(12);
    const samples = sampleTrack(p);
    const frames = trackFrames(samples, new Float64Array(samples.count));
    const topArc = liftTopArc(p, samples)!;
    const built = buildStartPlaceholder(frames, { type: 'verticalLift', trackType: 'road', lift: liftRange(samples, undefined, topArc), stationLength: 14, groundY: 1 });
    const tower = built.group.children.find((c) => c.name === 'tower') as Mesh;
    expect(tower).toBeDefined();
    expect(built.group.children.find((c) => c.name === 'chain')).toBeUndefined();
    const box = new Box3().setFromObject(tower);
    expect(box.min.y).toBeCloseTo(1, 1);
    expect(box.max.y).toBeGreaterThan(13 + 3);
    expect(Math.abs((box.min.x + box.max.x) / 2 - 24)).toBeLessThan(0.5);
    built.dispose();
  });
});
