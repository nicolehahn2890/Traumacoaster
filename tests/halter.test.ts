import { describe, expect, it } from 'vitest';
import type { InstancedMesh } from 'three';
import { LANE_DEPTH } from '@/track/stage';
import { railBanksFor, sampleTrack, createNode, type TrackPath } from '@/track/model';
import { trackFrames } from '@/world/trackMesh';
import { holderAt } from '@/world/foundations';
import { buildWorldSupports, planWorldSupports } from '@/world/supports';
import { buildPlaneStack, PlaneFoundation } from '@/zone/planeStack';
import { DOCK_GAP } from '@/zone/slices';
import { newPlane, newShape, rectPath, type ZoneNode } from '@/zone/nodes';

/** spielbare Ebene in Tiefe z (Meter) mit Rechtecken [Mitte x, Mitte y, Breite, Höhe, Material] */
function plane(nodes: ZoneNode[], z: number, rects: Array<[number, number, number, number, ('solid' | 'free')?]>): void {
  const p = newPlane(nodes, z);
  nodes.push(p);
  for (const [x, y, w, h, m] of rects) {
    const s = newShape(nodes, p.id, rectPath(w, h), x, y, '#445566');
    if (m) s.material = m;
    nodes.push(s);
  }
}

/** Spur der Bahn vor einer Ebene in Tiefe z */
const laneBefore = (z: number) => (z - DOCK_GAP) / LANE_DEPTH;

describe('Halter (Stufe 4)', () => {
  // Wand: Fels von y −40 bis 30 zwischen x 0 und 40 (Oberkante bei 30, darunter keine Kante); rechts ein Überhang von
  // x 60 bis 100, Unterseite bei 20, darunter ein See (frei)
  const nodes: ZoneNode[] = [];
  plane(nodes, 6, [
    [20, -5, 40, 70],
    [80, 25, 40, 10],
    [80, -20, 40, 30, 'free'],
  ]);
  const f = new PlaneFoundation(buildPlaneStack(nodes)!);
  const lane = laneBefore(6);

  it('vor der Wand: kein Fuß, aber eine Wand 1 m dahinter; die Konsole hält 2,6 m tiefer im Festen', () => {
    expect(f.surfaceBelow(20, 12.5, lane)).toBeNull();
    const w = f.wallAnchor(20, 12, lane);
    expect(w?.z).toBeCloseTo(6 / LANE_DEPTH, 9);
    expect(w?.y).toBeCloseTo(12 - 2.6, 6);
    // eine Wand, die erst 3 m unter dem Anschluss beginnt, trägt noch; 5 m darunter nicht mehr
    expect(f.wallAnchor(20, 33, lane)?.y).toBeLessThan(30);
    expect(f.wallAnchor(20, 35, lane)).toBeNull();
    // zu weit vor der Wand (6 m): keine Konsole
    expect(f.wallAnchor(20, 12, laneBefore(6) - 6 / LANE_DEPTH)).toBeNull();
  });

  it('unter dem Überhang: keine Wand, eine Decke mit Platz für den Zug, sonst nichts', () => {
    expect(f.surfaceBelow(80, 10.5, lane)).toBeNull();
    expect(f.wallAnchor(80, 10, lane)).toBeNull();
    expect(f.ceilingAnchor(80, 10, lane)?.y).toBeCloseTo(20, 0);
    // zu dicht unter der Decke (2 m): kein Hänger, der Zug stieße an
    expect(f.ceilingAnchor(80, 18, lane)).toBeNull();
    // zu hoch (über 12 m): kein Hänger
    expect(f.ceilingAnchor(80, 2, lane)).toBeNull();
    const h = holderAt([f], 80, 10, lane);
    expect(h?.kind).toBe('ceiling');
    expect(holderAt([f], 20, 12, lane)?.kind).toBe('wall');
  });

  it('eine Kante etwas weiter hinter der Bahn trägt eine gewöhnliche Stütze (vor der Wand)', () => {
    const more: ZoneNode[] = [];
    plane(more, 6, [[0, -10, 40, 20]]);
    const g = new PlaneFoundation(buildPlaneStack(more)!);
    // die Bahn 2,5 m vor der Ebene: außerhalb von DOCK_GAP, also kein Fuß; footBehind findet die Oberkante bei y 0
    const front = (6 - 2.5) / LANE_DEPTH;
    expect(g.surfaceBelow(0, 6, front)).toBeNull();
    expect(g.footBehind(0, 6, front)?.y).toBeCloseTo(0, 6);
    expect(holderAt([g], 0, 6, front)).toMatchObject({ kind: 'foot', y: 0 });
  });

  it('Planer: vor der Wand Konsolen, unter dem Überhang Hänger, nichts schwebt; Varianten je Lauf, Teile der Familie', () => {
    const z = lane;
    const a = createNode(4, 8, z, 'station');
    const b = createNode(36, 26, z);
    const c = createNode(60, 10, z);
    const d = createNode(98, 10, z);
    a.outX = 10;
    b.inX = -10;
    b.outX = 8;
    c.inX = -8;
    c.outX = 12;
    d.inX = -12;
    const path: TrackPath = { nodes: [a, b, c, d], elements: [], startType: 'chainlift', templates: {}, closed: false, brush: true };
    const samples = sampleTrack(path, 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    const { plans, stats } = planWorldSupports(samples, frames, 'steel', [f], () => false);
    expect(stats.wall).toBeGreaterThan(0);
    expect(stats.ceiling).toBeGreaterThan(0);
    for (const p of plans.filter((q) => q.holder === 'wall')) {
      expect(p.F.y).toBeLessThan(p.A.y);
      expect(p.F.z).toBeCloseTo(-6, 6);
    }
    for (const p of plans.filter((q) => q.holder === 'ceiling')) expect(p.F.y).toBeGreaterThan(p.A.y + 3);
    // zwei Läufe (Wand, dann Decke): verschiedene Varianten
    const wallVar = new Set(plans.filter((q) => q.holder === 'wall').map((q) => q.variant));
    const ceilVar = new Set(plans.filter((q) => q.holder === 'ceiling').map((q) => q.variant));
    expect(wallVar.size).toBe(1);
    expect(ceilVar.size).toBe(1);
    expect([...wallVar][0]).not.toBe([...ceilVar][0]);
    // Halter zeichnen mit den Teilen der Familie: höchstens fünf Zeichenaufrufe, alle Matrizen endlich
    for (const variant of [0, 1, 2]) {
      const g = buildWorldSupports(plans.map((p) => ({ ...p, variant })), 'steel');
      const meshes: InstancedMesh[] = [];
      g.traverse((o) => {
        if ((o as InstancedMesh).isInstancedMesh) meshes.push(o as InstancedMesh);
      });
      expect(meshes.length).toBeLessThanOrEqual(5);
      for (const m of meshes) expect(Array.from(m.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    }
  });
});
