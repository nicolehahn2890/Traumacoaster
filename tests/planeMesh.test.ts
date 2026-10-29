import { describe, expect, it } from 'vitest';
import { Raycaster, Vector2 } from 'three';
import { WorldCamera } from '@/world/camera';
import { PlaneLayer, triangulateFace } from '@/world/planeMesh';
import { ellipsePath, newPlane, newShape, planesOf, rectPath, setFaceFill, shapeFaces, slicesToNodes, type ZoneNode } from '@/zone/nodes';
import { buildSliceStack } from '@/zone/slices';
import { LANE_DEPTH } from '@/track/stage';

function scene(): { nodes: ZoneNode[]; front: string; back: string; a: string; b: string } {
  const nodes: ZoneNode[] = [];
  nodes.push(newPlane(nodes, 0));
  nodes.push(newPlane(nodes, 12));
  const [front, back] = planesOf(nodes);
  const a = newShape(nodes, back.id, rectPath(40, 20), 100, 10, '#445566');
  nodes.push(a);
  const b = newShape(nodes, front.id, ellipsePath(4, 3), 100, 10, '#ccbbaa');
  nodes.push(b);
  return { nodes, front: front.id, back: back.id, a: a.id, b: b.id };
}

/** Strahl durch die Bildmitte einer Spielkamera, die auf (100, 10) schaut */
function centerRay(): Raycaster {
  const cam = new WorldCamera();
  cam.set({ cx: 100, cy: 10, zoom: 11, width: 844, height: 390, persp: true, fov: 18 });
  const r = new Raycaster();
  r.setFromCamera(new Vector2(0, 0), cam.active);
  return r;
}

describe('Ebenen im Weltrenderer', () => {
  it('alle Formen werden ein Mesh, die vordere Form wird getroffen', () => {
    const s = scene();
    const layer = new PlaneLayer();
    layer.build(s.nodes);
    expect(layer.stats.planes).toBe(2);
    expect(layer.stats.shapes).toBe(2);
    expect(layer.stats.triangles).toBeGreaterThan(4);
    // (die Gruppe hat dazu immer das Mesh der Punktkronen, ohne Kronen unsichtbar)
    expect(layer.group.children.filter((c) => c.name.startsWith('ebenen-formen')).length).toBe(1);
    expect(layer.group.children.find((c) => c.name === 'ebenen-kronen')?.visible).toBe(false);
    expect(layer.pick(centerRay())?.id).toBe(s.b);
  });

  it('eine ausgeblendete Ebene wird nicht gezeichnet und nicht getroffen', () => {
    const s = scene();
    const layer = new PlaneLayer();
    layer.build(s.nodes, { showPlane: (p) => p.id !== s.front });
    expect(layer.stats.shapes).toBe(1);
    expect(layer.pick(centerRay())?.id).toBe(s.a);
  });

  it('Verschieben trianguliert nicht neu, solange der Pfad bleibt', () => {
    const s = scene();
    const shape = s.nodes.find((n) => n.id === s.a)!;
    if (shape.kind !== 'shape') throw new Error('Form erwartet');
    const f1 = shapeFaces(shape)[0];
    const t1 = triangulateFace(f1);
    shape.x += 5;
    shape.sx = 1.2;
    expect(shapeFaces(shape)[0]).toBe(f1);
    expect(triangulateFace(shapeFaces(shape)[0])).toBe(t1);
    shape.path = rectPath(10, 10);
    expect(shapeFaces(shape)[0]).not.toBe(f1);
  });

  it('eine Teilungslinie macht zwei Flächen mit eigener Farbe, ein Loch wird nicht gezeichnet und nicht getroffen', () => {
    const s = scene();
    const shape = s.nodes.find((n) => n.id === s.a)!;
    if (shape.kind !== 'shape') throw new Error('Form erwartet');
    shape.cuts = [{ path: [{ x: -30, y: 2 }, { x: 30, y: 2 }], closed: false }];
    const faces = shapeFaces(shape);
    expect(faces.length).toBe(2);
    const upper = faces.find((f) => f.inner[1] > 2)!;
    setFaceFill(shape, upper, '#ff0000');
    const layer = new PlaneLayer();
    layer.build(s.nodes, { showPlane: (p) => p.id !== s.front });
    expect(layer.pick(centerRay())?.id).toBe(s.a);
    // die untere Fläche (Mitte des Bildes liegt in ihr) zum Loch machen: der Strahl geht durch
    const lower = faces.find((f) => f.inner[1] < 2)!;
    setFaceFill(shape, lower, null);
    layer.build(s.nodes, { showPlane: (p) => p.id !== s.front });
    expect(layer.pick(centerRay())).toBeNull();
    expect(shape.regions?.map((r) => r.fill).sort()).toEqual(['#ff0000', null].sort());
  });

  it('der Scheibenstapel der Kamerasession wird als Ebenen ein Mesh mit vertretbar vielen Dreiecken', () => {
    const nodes = slicesToNodes(buildSliceStack(300));
    const layer = new PlaneLayer();
    const t0 = performance.now();
    layer.build(nodes);
    const first = performance.now() - t0;
    expect(layer.stats.planes).toBeGreaterThanOrEqual(30);
    expect(layer.stats.triangles).toBeLessThan(200_000);
    // zweiter Aufbau aus dem Zwischenspeicher (wie beim Ziehen im Editor)
    const t1 = performance.now();
    layer.build(nodes);
    const again = performance.now() - t1;
    expect(again).toBeLessThan(Math.max(30, first));
    // die hinterste Ebene liegt in ihrer Tiefe
    const back = planesOf(nodes).at(-1)!;
    expect(back.z).toBeGreaterThan(5 * LANE_DEPTH);
  });
});
