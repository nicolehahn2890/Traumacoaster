import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, toStage, type StagePoint } from '@/track/stage';
import { buildPlaneStack, PLANE_THICK, PlaneField, PlaneFoundation, planeDeepestDock, planeGroundDepth, planeLanding } from '@/zone/planeStack';
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

describe('Freiraumfeld aus Flächen', () => {
  it('fest ist, was im Bild hinter einer festen Fläche liegt, bis zur nächsten Ebene, die es deckt; die hinterste höchstens PLANE_THICK', () => {
    const nodes: ZoneNode[] = [];
    // vorn ein Hügel (Rechteck bis y 5), dahinter ein höherer (bis y 10)
    addPlane(nodes, 1, 'play', [0, -5, 40, 20]);
    addPlane(nodes, 1.5, 'play', [0, 0, 40, 20]);
    const f = new PlaneField(buildPlaneStack(nodes)!);
    // Bildpunkt (0, 0) auf Spur 1: vor dem vorderen Hügel frei, dahinter fest (er deckt ihn), bis hinter den zweiten
    const p = toStage(0, 0, 1);
    expect(f.solidAt(p, 1 * LANE_DEPTH - 0.5)).toBe(false);
    expect(f.solidAt(p, 1 * LANE_DEPTH + 0.5)).toBe(true);
    expect(f.solidAt(p, 1.5 * LANE_DEPTH + PLANE_THICK - 0.5)).toBe(true);
    expect(f.solidAt(p, 1.5 * LANE_DEPTH + PLANE_THICK + 0.5)).toBe(false);
    // eine Ebene weit dahinter, die den Punkt deckt: die vordere reicht bis zu ihr, auch über PLANE_THICK hinaus
    const far: ZoneNode[] = [];
    addPlane(far, 1, 'play', [0, -5, 40, 20]);
    addPlane(far, 3, 'play', [0, 0, 200, 120]);
    const ff = new PlaneField(buildPlaneStack(far)!);
    expect(ff.solidAt(p, 1 * LANE_DEPTH + PLANE_THICK + 2)).toBe(true);
    // Bildpunkt über dem vorderen Hügel, im hinteren: frei bis zu dessen Ebene
    const q = toStage(0, 8, 1.5);
    expect(f.solidAt(q, 1.5 * LANE_DEPTH - 0.5)).toBe(false);
    expect(f.solidAt(q, 1.5 * LANE_DEPTH + 0.5)).toBe(true);
    // Weltpunkt: dasselbe über toStage
    expect(f.solid(0, 8, 1.4)).toBe(false);
    expect(f.solid(0, 8, 1.6)).toBe(true);
  });

  it('luftig ist frei, eine Kulisse deckt bis ganz hinten', () => {
    const airy: ZoneNode[] = [];
    addPlane(airy, 1, 'play', [0, 0, 20, 10]);
    (airy.find((n) => n.kind === 'shape') as { material?: string }).material = 'airy';
    addPlane(airy, 3, 'play', [50, 0, 10, 10]);
    expect(new PlaneField(buildPlaneStack(airy)!).solidAt(toStage(0, 0, 1), 1.5 * LANE_DEPTH)).toBe(false);
    const back: ZoneNode[] = [];
    addPlane(back, 1, 'play', [50, 0, 10, 10]);
    addPlane(back, 2, 'backdrop', [0, 0, 40, 40]);
    const fb = new PlaneField(buildPlaneStack(back)!);
    const p = toStage(0, 0, 2);
    expect(fb.solidAt(p, 1.9 * LANE_DEPTH)).toBe(false);
    expect(fb.solidAt(p, 2.1 * LANE_DEPTH)).toBe(true);
    expect(fb.solidAt(p, 400)).toBe(true);
  });

  it('ein Loch ist kein Tunnel: frei bis zur Wand dahinter; daneben frei nur vor der Platte; Boden und Decke im Bild', () => {
    const nodes: ZoneNode[] = [];
    // eine Platte mit Loch, die Wand 16,8 m dahinter
    addPlane(nodes, 1, 'play', [0, 0, 40, 20], [6, 5]);
    addPlane(nodes, 3, 'play', [0, 0, 120, 80]);
    const f = new PlaneField(buildPlaneStack(nodes)!);
    const toWorld = (p: StagePoint, lane: number) => rayToWorld(p, lane);
    const inHole = f.freeLanes(toStage(0, 0, 1), toWorld, 0.8);
    expect(inHole.intervals.length).toBe(1);
    expect(inHole.intervals[0].aKind).toBe('edge');
    expect(inHole.intervals[0].b).toBeGreaterThan(2.9);
    expect(inHole.intervals[0].b).toBeLessThan(3.01);
    const beside = f.freeLanes(toStage(14, 0, 1), toWorld, 0.8);
    expect(beside.intervals[0].b).toBeLessThan(1.01);
    expect(beside.touched).toBe(true);
    // Boden: hinter der Platte (Spur 1,25) dort, wo der Punkt im Bild unter ihre Oberkante (y 10) sinkt; Decke ebenso
    const lift = rayToWorld(toStage(14, 0, 1.25), 1).y - 0;
    expect(f.floorBelow(14, 15, 1.25)).toBeCloseTo(10 - lift, 1);
    expect(f.ceilingAbove(14, 5, 1.25)).toBe(true);
    expect(f.ceilingAbove(14, 12, 1.25)).toBe(false);
  });

  it('eine Stütze hinter einer Fläche endet dort, wo sie im Bild hinter ihr verschwindet', () => {
    const nodes: ZoneNode[] = [];
    // Hügel vorn mit Oberkante y 5, weit dahinter ein zweiter (außer Reichweite der Stütze)
    addPlane(nodes, 1, 'play', [0, -5, 40, 20]);
    addPlane(nodes, 2.5, 'play', [0, -5, 40, 20]);
    const st = buildPlaneStack(nodes)!;
    // Anschluss hinter dem vorderen Hügel (Spur 1,5) in 4 m Höhe: in der Welt unter seiner Kante, im Bild darüber
    expect(new PlaneFoundation(st).surfaceBelow(0, 4, 1.5)).toBeNull();
    const lift = rayToWorld(toStage(0, 0, 1.5), 1).y;
    const hit = new PlaneFoundation(st, new PlaneField(st)).surfaceBelow(0, 4, 1.5);
    expect(hit?.y).toBeCloseTo(5 - lift, 1);
  });
});

