import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, toStage } from '@/track/stage';
import { buildPlaneStack, PlaneFoundation, planeDeepestDock, planeGroundDepth, planeLanding } from '@/zone/planeStack';
import { DOCK_GAP } from '@/zone/slices';
import { ellipsePath, newPlane, newShape, rectPath, type PlaneRole, type ZoneNode } from '@/zone/nodes';

/** Ebene in Tiefe lane (Spuren) mit Rolle und einem Rechteck: Mitte (x, y), Breite, Höhe */
function addPlane(nodes: ZoneNode[], lane: number, role: PlaneRole, rect: [number, number, number, number], hole?: [number, number]): string {
  const p = newPlane(nodes, lane * LANE_DEPTH);
  p.role = role;
  nodes.push(p);
  const [x, y, w, h] = rect;
  const s = newShape(nodes, p.id, rectPath(w, h), x, y, '#445566');
  if (hole) s.holes = [ellipsePath(hole[0], hole[1])];
  nodes.push(s);
  return p.id;
}

describe('Tiefe aus Ebenen', () => {
  it('ohne spielbare Ebene kein Stapel', () => {
    const nodes: ZoneNode[] = [];
    addPlane(nodes, 1, 'backdrop', [0, 0, 20, 10]);
    expect(buildPlaneStack(nodes)).toBeNull();
  });

  it('Landung knapp über und knapp unter der Oberkante, nicht mitten in der Fläche, nicht hoch in der Luft', () => {
    const nodes: ZoneNode[] = [];
    addPlane(nodes, 1, 'play', [0, 0, 20, 10]);
    const st = buildPlaneStack(nodes)!;
    const z = 1 * LANE_DEPTH - DOCK_GAP;
    const above = planeLanding(st, toStage(0, 5.5, 1))!;
    expect(above.z).toBeCloseTo(z, 6);
    expect(above.off).toBeCloseTo(0.5, 6);
    expect(planeLanding(st, toStage(0, 3.5, 1))?.off).toBeCloseTo(-1.5, 6);
    expect(planeLanding(st, toStage(0, -2, 1))).toBeNull();
    expect(planeLanding(st, toStage(0, 9, 1))).toBeNull();
    expect(planeDeepestDock(st)).toBeCloseTo(z, 6);
  });

  it('Kulisse verdeckt, Vordergrund ist durchsichtig', () => {
    const blocked: ZoneNode[] = [];
    addPlane(blocked, 0.5, 'backdrop', [0, 0, 40, 30]);
    addPlane(blocked, 1, 'play', [0, 0, 20, 10]);
    expect(planeLanding(buildPlaneStack(blocked)!, toStage(0, 5.5, 1))).toBeNull();
    const bush: ZoneNode[] = [];
    addPlane(bush, 0.5, 'front', [0, 0, 40, 30]);
    addPlane(bush, 1, 'play', [0, 0, 20, 10]);
    expect(planeLanding(buildPlaneStack(bush)!, toStage(0, 5.5, 1))?.z).toBeCloseTo(LANE_DEPTH - DOCK_GAP, 6);
  });

  it('durch einen Höhlenmund gezeichnet landet die Bahn auf der Ebene dahinter', () => {
    const nodes: ZoneNode[] = [];
    addPlane(nodes, 0.5, 'play', [0, 0, 40, 20], [6, 4]);
    addPlane(nodes, 1.5, 'play', [0, 0, 80, 40]);
    const st = buildPlaneStack(nodes)!;
    const l = planeLanding(st, toStage(0, 0, 0.5))!;
    expect(l.cave).toBe(true);
    expect(l.z).toBeCloseTo(1.5 * LANE_DEPTH - DOCK_GAP, 6);
    // neben dem Mund mitten in der Fläche: keine Landung
    expect(planeLanding(st, toStage(14, 0, 0.5))).toBeNull();
  });

  it('Bodenhöhe: über der vorderen Kante vorn, hoch darüber weiter hinten', () => {
    const nodes: ZoneNode[] = [];
    addPlane(nodes, 0.5, 'play', [0, -3, 60, 10]);
    addPlane(nodes, 2, 'play', [0, 0, 60, 20]);
    const st = buildPlaneStack(nodes)!;
    const front = 0.5 * LANE_DEPTH - DOCK_GAP;
    const back = 2 * LANE_DEPTH - DOCK_GAP;
    expect(planeGroundDepth(st, toStage(0, 3, 0.5))).toBeCloseTo(front, 6);
    expect(planeGroundDepth(st, toStage(0, 40, 0.5))).toBeCloseTo(back, 6);
    const mid = planeGroundDepth(st, toStage(0, 8, 0.5));
    expect(mid).toBeGreaterThan(front);
    expect(mid).toBeLessThanOrEqual(back);
  });

  it('Stützen stehen auf der Andockkante der Ebene, an der die Bahn andockt, oder der nächsten davor', () => {
    const nodes: ZoneNode[] = [];
    addPlane(nodes, 0.5, 'play', [0, -3, 60, 10]);
    addPlane(nodes, 2, 'play', [0, 0, 60, 20]);
    const f = new PlaneFoundation(buildPlaneStack(nodes)!);
    expect(f.surfaceBelow(0, 20, 1.5)?.y).toBeCloseTo(2, 6);
    expect(f.surfaceBelow(0, 20, 2.5)?.y).toBeCloseTo(10, 6);
    // die Ebene, an der die Bahn andockt (1 m dahinter), trägt auch
    const docked = 2 - DOCK_GAP / LANE_DEPTH;
    expect(f.surfaceBelow(0, 20, docked)?.y).toBeCloseTo(10, 6);
    expect(f.surfaceBelow(0, 20, 0.5 - DOCK_GAP / LANE_DEPTH)?.y).toBeCloseTo(2, 6);
    expect(f.surfaceBelow(0, 20, 0.2)).toBeNull();
    expect(f.blocks()).toBe(false);
  });
});
