import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_TILT, LANE_DEPTH, setCameraTilt } from '@/track/stage';
import { WorldCamera } from '@/world/camera';
import { buildSliceStack } from '@/zone/slices';
import { emptyZone, parseZone, serializeZone } from '@/zone/types';
import {
  depthBeside,
  ellipsePath,
  findPlane,
  isPlane,
  isShape,
  newPlane,
  newShape,
  planeToWorld,
  planesOf,
  rectPath,
  setGapBehind,
  shapeToPlane,
  slicesToNodes,
  type HoldView,
  type ZoneNode,
  type ZonePlane,
} from '@/zone/nodes';

const DEG = Math.PI / 180;

function stack(zs: number[]): ZoneNode[] {
  const nodes: ZoneNode[] = [];
  for (const z of zs) nodes.push(newPlane(nodes, z));
  return nodes;
}

const gaps = (nodes: ZoneNode[]): number[] => {
  const p = planesOf(nodes);
  return p.slice(1).map((q, i) => Math.round((q.z - p[i].z) * 1000) / 1000);
};

afterEach(() => setCameraTilt(DEFAULT_CAMERA_TILT));

describe('Ebenen: Abstände', () => {
  it('der Griff zwischen zwei Ebenen schiebt alles dahinter mit, die übrigen Abstände bleiben', () => {
    const nodes = stack([0, 4, 10, 20]);
    const front = planesOf(nodes)[0];
    expect(setGapBehind(nodes, front.id, 6, null)).toBe(6);
    expect(planesOf(nodes).map((p) => p.z)).toEqual([0, 6, 12, 22]);
    expect(gaps(nodes)).toEqual([6, 6, 10]);
  });

  it('der Griff der hintersten Ebene hat keinen Nachbarn', () => {
    const nodes = stack([0, 4]);
    expect(setGapBehind(nodes, planesOf(nodes)[1].id, 8, null)).toBeNull();
  });

  it('eine neue Ebene landet in der Mitte der Lücke oder am Rand des Stapels', () => {
    const nodes = stack([0, 10]);
    const [a, b] = planesOf(nodes);
    expect(depthBeside(nodes, a.id, 'back')).toBe(5);
    expect(depthBeside(nodes, b.id, 'back')).toBe(14);
    expect(depthBeside(nodes, a.id, 'front')).toBe(-4);
    expect(depthBeside([], null, 'back')).toBe(0);
  });
});

describe('Ebenen: Bild halten', () => {
  // Kamera wie im Spiel: Ziel auf der Spur-0-Ebene, 11 px/m, Handy quer
  const cases: Array<{ name: string; tilt: number; persp: boolean; fov: number }> = [
    { name: 'Perspektive 18°, Neigung 12°', tilt: 12, persp: true, fov: 18 },
    { name: 'Perspektive 45°, Neigung 26,6°', tilt: DEFAULT_CAMERA_TILT / DEG, persp: true, fov: 45 },
    { name: 'Bühne ohne Perspektive, Neigung 3°', tilt: 3, persp: false, fov: 18 },
  ];
  for (const c of cases) {
    it(`ein Punkt der verschobenen Ebene bleibt auf demselben Pixel (${c.name})`, () => {
      setCameraTilt(c.tilt * DEG);
      const cam = new WorldCamera();
      cam.set({ cx: 120, cy: 8, zoom: 11, width: 844, height: 390, persp: c.persp, fov: c.fov });
      const hold: HoldView = { cx: 120, cy: 8, D: cam.distance, tilt: c.tilt * DEG };
      const nodes = stack([0, 6, 18]);
      const back = planesOf(nodes)[2];
      back.x = 3;
      back.y = -2;
      back.scale = 1.3;
      const probe = [
        [0, 0],
        [40, 12],
        [-25, -6],
      ];
      const before = probe.map(([px, py]) => {
        const w = planeToWorld(back, px, py);
        return cam.toScreen(w.x, w.y, back.z / LANE_DEPTH);
      });
      setGapBehind(nodes, planesOf(nodes)[0].id, 15, hold);
      const moved = findPlane(nodes, back.id)!;
      expect(moved.z).toBeCloseTo(27, 6);
      probe.forEach(([px, py], i) => {
        const w = planeToWorld(moved, px, py);
        const s = cam.toScreen(w.x, w.y, moved.z / LANE_DEPTH);
        expect(s.x).toBeCloseTo(before[i].x, 4);
        expect(s.y).toBeCloseTo(before[i].y, 4);
      });
      // mit Perspektive wird die hintere Ebene größer, ohne bleibt ihr Maßstab
      if (c.persp) expect(moved.scale).toBeGreaterThan(1.3);
      else expect(moved.scale).toBe(1.3);
    });
  }

  it('„Welt halten“ ändert nur die Tiefe', () => {
    const nodes = stack([0, 5]);
    const back = planesOf(nodes)[1];
    setGapBehind(nodes, planesOf(nodes)[0].id, 9, null);
    expect(back.z).toBe(9);
    expect([back.x, back.y, back.scale]).toEqual([0, 0, 1]);
  });
});

describe('Formen', () => {
  it('Rechteck und Ellipse liegen um ihren Ursprung', () => {
    const r = rectPath(4, 2);
    expect(r.map((p) => [p.x, p.y])).toEqual([
      [-2, -1],
      [2, -1],
      [2, 1],
      [-2, 1],
    ]);
    const e = ellipsePath(3, 1);
    expect(Math.max(...e.map((p) => p.x))).toBe(3);
    expect(Math.min(...e.map((p) => p.y))).toBe(-1);
  });

  it('eine neue Form liegt über den Formen ihrer Ebene, Lage und Maßstab gehen in die Ebene ein', () => {
    const nodes = stack([0]);
    const plane = planesOf(nodes)[0];
    const a = newShape(nodes, plane.id, rectPath(2, 2), 5, 1, '#336699');
    nodes.push(a);
    const b = newShape(nodes, plane.id, rectPath(2, 2), 0, 0, '#336699');
    expect(b.order).toBeGreaterThan(a.order);
    a.sx = 2;
    expect(shapeToPlane(a, 1, 1)).toEqual({ x: 7, y: 2 });
  });
});

describe('Zonendatei mit Ebenen', () => {
  it('Ebenen und Formen überstehen Schreiben und Lesen, Formen ohne Ebene fallen weg', () => {
    const zone = emptyZone('werkstatt');
    const nodes = stack([0, 7.5]);
    const p = planesOf(nodes)[1];
    p.scale = 1.25;
    p.role = 'backdrop';
    const s = newShape(nodes, p.id, ellipsePath(3, 2), 10, 4, '#a1b2c3');
    s.holes = [rectPath(1, 1)];
    nodes.push(s);
    zone.nodes = nodes;
    const text = serializeZone(zone);
    const back = parseZone(JSON.parse(text))!;
    expect(back.nodes?.filter(isPlane).map((x) => x.z)).toEqual([0, 7.5]);
    const p2 = findPlane(back.nodes!, p.id) as ZonePlane;
    expect(p2.scale).toBe(1.25);
    expect(p2.role).toBe('backdrop');
    const s2 = back.nodes!.find(isShape)!;
    expect(s2.fill).toBe('#a1b2c3');
    expect(s2.holes?.length).toBe(1);
    expect(s2.path.length).toBe(4);
    // eine Form, deren Ebene fehlt, wird verworfen
    const raw = JSON.parse(text);
    raw.nodes = raw.nodes.filter((n: { kind: string }) => n.kind === 'shape');
    expect(parseZone(raw)!.nodes).toBeUndefined();
  });

  it('eine Zone ohne Ebenen schreibt kein nodes-Feld', () => {
    expect(serializeZone(emptyZone('leer'))).not.toContain('"nodes"');
  });
});

describe('Probe aus dem Scheibenstapel', () => {
  it('jede Scheibe wird eine Ebene in ihrer Tiefe, ihre Bänder werden Formen', () => {
    const slices = buildSliceStack(300);
    const nodes = slicesToNodes(slices);
    const planes = planesOf(nodes);
    expect(planes.length).toBe(slices.slices.length);
    expect(planes.length).toBeGreaterThanOrEqual(30);
    expect(planes[0].z).toBeCloseTo(Math.min(...slices.slices.map((s) => s.lane)) * LANE_DEPTH, 3);
    const shapes = nodes.filter(isShape);
    expect(shapes.length).toBeGreaterThanOrEqual(planes.length);
    for (const s of shapes) expect(s.path.length).toBeGreaterThanOrEqual(3);
    expect(new Set(planes.map((p) => p.role))).toEqual(new Set(['front', 'play', 'backdrop']));
  });
});
