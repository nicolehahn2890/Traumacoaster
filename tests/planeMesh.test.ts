import { describe, expect, it } from 'vitest';
import { Raycaster, Vector2 } from 'three';
import { WorldCamera } from '@/world/camera';
import { PlaneLayer, triangulateShape } from '@/world/planeMesh';
import { ellipsePath, newPlane, newShape, planesOf, rectPath, slicesToNodes, type ZoneNode } from '@/zone/nodes';
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
    expect(layer.group.children.length).toBe(1);
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
    const t1 = triangulateShape(shape);
    shape.x += 5;
    shape.sx = 1.2;
    expect(triangulateShape(shape)).toBe(t1);
    shape.path = rectPath(10, 10);
    expect(triangulateShape(shape)).not.toBe(t1);
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
