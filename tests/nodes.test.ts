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

describe('Pfade bearbeiten (Stufe 2)', () => {
  it('ein eingefügter Anker ändert die Kurve nicht', async () => {
    const { insertAnchor, segmentPoint } = await import('@/zone/nodes');
    const path = ellipsePath(5, 3);
    const split = insertAnchor(path, 1, 0.37);
    expect(split.length).toBe(5);
    // derselbe Punkt der Kurve: alt Stück 1 bei t, neu Anker 2
    const a = segmentPoint(path, 1, 0.37);
    expect(split[2].x).toBeCloseTo(a.x, 9);
    expect(split[2].y).toBeCloseTo(a.y, 9);
    // Hälften: Stück 1 neu bei 0,5 entspricht Stück 1 alt bei 0,37·0,5 (gleiche Kurve, neu parametriert)
    const b = segmentPoint(split, 1, 1);
    expect(b.x).toBeCloseTo(a.x, 9);
    const c = segmentPoint(split, 2, 1);
    const d = segmentPoint(path, 1, 1);
    expect(c.x).toBeCloseTo(d.x, 9);
    expect(c.y).toBeCloseTo(d.y, 9);
  });

  it('Anker löschen und zwischen Ecke und Rund umschalten', async () => {
    const { removeAnchor, toggleSmooth } = await import('@/zone/nodes');
    const r = rectPath(4, 2);
    expect(removeAnchor(r, 1).length).toBe(3);
    const smooth = toggleSmooth(r, true, 0);
    expect(smooth[0].outX).toBeDefined();
    expect(toggleSmooth(smooth, true, 0)[0].outX).toBeUndefined();
  });

  it('ein Pfad aus der Ebene wird eine Form mit Ursprung in ihrer Mitte', async () => {
    const { shapeFromPlanePath } = await import('@/zone/nodes');
    const nodes = stack([0]);
    const plane = planesOf(nodes)[0];
    const s = shapeFromPlanePath(nodes, plane.id, rectPath(4, 2).map((p) => ({ x: p.x + 10, y: p.y + 6 })), '#123456');
    expect([s.x, s.y]).toEqual([10, 6]);
    expect(s.path[0]).toEqual({ x: -2, y: -1 });
  });

  it('Linie entfernen und Löcher ersetzen über setPath', async () => {
    const { setPath } = await import('@/zone/nodes');
    const nodes = stack([0]);
    const s = newShape(nodes, planesOf(nodes)[0].id, rectPath(4, 4), 0, 0, '#000000');
    s.cuts = [{ path: [{ x: -3, y: 0 }, { x: 3, y: 0 }], closed: false }];
    const before = s.cuts;
    setPath(s, { kind: 'cut', i: 0 }, [{ x: -3, y: 1 }, { x: 3, y: 1 }]);
    expect(s.cuts).not.toBe(before);
    expect(s.cuts?.[0].path[0].y).toBe(1);
    setPath(s, { kind: 'cut', i: 0 }, null);
    expect(s.cuts).toBeUndefined();
  });

  it('Kopieren in eine andere Ebene mit „Bild halten“: kein Punkt wandert im Spielblick', async () => {
    const { transferShape } = await import('@/zone/nodes');
    setCameraTilt(12 * DEG);
    const cam = new WorldCamera();
    cam.set({ cx: 50, cy: 5, zoom: 11, width: 844, height: 390, persp: true, fov: 18 });
    const hold: HoldView = { cx: 50, cy: 5, D: cam.distance, tilt: 12 * DEG };
    const nodes = stack([2, 30]);
    const [a, b] = planesOf(nodes);
    b.x = 4;
    b.scale = 1.4;
    const s = newShape(nodes, a.id, ellipsePath(3, 2), 47, 9, '#000000');
    s.sx = 1.3;
    const c = transferShape(s, a, b, hold);
    expect(c.parent).toBe(b.id);
    for (const p of s.path) {
      const wa = planeToWorld(a, s.x + s.sx * p.x, s.y + s.sy * p.y);
      const wb = planeToWorld(b, c.x + c.sx * p.x, c.y + c.sy * p.y);
      const sa = cam.toScreen(wa.x, wa.y, a.z / LANE_DEPTH);
      const sb = cam.toScreen(wb.x, wb.y, b.z / LANE_DEPTH);
      expect(sb.x).toBeCloseTo(sa.x, 2);
      expect(sb.y).toBeCloseTo(sa.y, 2);
    }
  });
});

describe('Skizzen als Pause-Ebenen', () => {
  it('werden mit Ebene, Lage, Größe, Deckkraft und Mischung gesichert; nur Bilder neben der Zone, eine verwaiste fällt weg', async () => {
    const { parseNodes: parse, serializeNodes: ser, newPlane: np, cloneNodes: clone } = await import('@/zone/nodes');
    const nodes: import('@/zone/nodes').ZoneNode[] = [np([], 0)];
    nodes.push({ id: 'k1', kind: 'sketch', parent: 'p1', name: 'Bild 2', src: '/zones/werkstatt/skizze-k1.png', x: 3, y: 4, w: 40, h: 30, opacity: 0.5, blend: 'normal' });
    nodes.push({ id: 'k2', kind: 'sketch', parent: 'p1', name: 'flüchtig', src: 'blob:abc', x: 0, y: 0, w: 10, h: 10, opacity: 0.5 });
    const out = ser(nodes);
    expect(out.filter((o) => o.kind === 'sketch').length).toBe(1);
    const back = parse(JSON.parse(JSON.stringify([...out, { id: 'k9', kind: 'sketch', parent: 'p9', name: 'x', src: '/zones/a/skizze-x.png', x: 0, y: 0, w: 1, h: 1, opacity: 1 }])));
    expect(back.filter((n) => n.kind === 'sketch').map((n) => n.id)).toEqual(['k1']);
    expect(back.find((n) => n.id === 'k1')).toMatchObject({ blend: 'normal', opacity: 0.5, w: 40 });
    expect(JSON.stringify(ser(clone(back)))).toBe(JSON.stringify(out));
  });
});

describe('Grundform Bogen', () => {
  it('unten gerade, senkrechte Seiten, oben ein Halbkreis; flach eine halbe Ellipse', async () => {
    const { archPath: arch, shapeLocalPolys: polys, newPlane: np, newShape: ns } = await import('@/zone/nodes');
    const p = arch(8, 10);
    expect(p.length).toBe(5);
    const ys = p.map((a) => a.y);
    expect(Math.min(...ys)).toBe(-5);
    expect(Math.max(...ys)).toBe(5);
    // Fläche: 8 × 6 Rechteck plus Halbkreis mit Radius 4
    const s = ns([np([], 0)], 'p1', p, 0, 0, '#445566');
    const ring = polys(s).outline;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    expect(a / 2).toBeCloseTo(48 + (Math.PI * 16) / 2, 0);
    expect(arch(8, 3).length).toBe(3);
  });
});

