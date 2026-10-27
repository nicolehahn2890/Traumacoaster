import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, toStage, type StagePoint } from '@/track/stage';
import { planBrushTrack } from '@/track/brushTrack';
import { flattenPath, inPolygon, pathBounds, polyTopAt, presetPath, simplifyPoly, smoothPath } from '@/zone/path';
import { applySvgBodies, parsePathData, parseSvgShapes, svgToBodies, zoneToSvg } from '@/zone/svg';
import { traceAlpha } from '@/zone/trace';
import { BODY_DEPTH, FreeField, ROOM_WALL } from '@/zone/field';
import { emptyZone, fitBodyBounds, newElement, parseZone, serializeZone, type ZoneElement } from '@/zone/types';
import { buildBody } from '@/world/elements';

const toWorld = (p: StagePoint, lane: number) => rayToWorld(p, lane);

/** Bogen 40 × 20 m mit Loch, Fußpunkt x 60, Spur 0, 8 m dick, Raum 12 m dahinter, offen ab Stufe 2 */
const arch = (): ZoneElement => {
  const preset = presetPath('arch', 40, 20);
  const el: ZoneElement = { id: 'k1', kind: 'body', x: 60, y: 0, z: 0, w: 40, h: 20, d: 8, path: preset.path, holes: preset.holes, role: 'front', ground: true, room: 12, openFrom: 2 };
  fitBodyBounds(el);
  return el;
};

describe('Kurvenpfade (Ebenen-Probe)', () => {
  it('Geraden bleiben Geraden, Kurven werden fein, Vorgabeformen haben ihre Maße', () => {
    const square = flattenPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
    expect(square).toHaveLength(4);
    const blob = presetPath('blob', 24, 12);
    const b = pathBounds(blob.path);
    expect(b.maxX - b.minX).toBeGreaterThan(20);
    expect(b.maxX - b.minX).toBeLessThanOrEqual(26);
    expect(b.maxY - b.minY).toBeGreaterThan(10);
    expect(flattenPath(blob.path).length).toBeGreaterThan(20);
    const ring = presetPath('ring', 10, 10);
    expect(ring.holes).toHaveLength(1);
    const outer = flattenPath(ring.path);
    const inner = flattenPath(ring.holes[0]);
    expect(inPolygon(outer, 5, 5)).toBe(true);
    expect(inPolygon(inner, 5, 5)).toBe(true);
    expect(inPolygon(inner, 5, 9.5)).toBe(false);
    expect(polyTopAt(outer, 5)).toBeCloseTo(10, 1);
    expect(polyTopAt(outer, 20)).toBeNull();
  });

  it('Vereinfachen hält die Form, Glätten gibt Griffe entlang der Nachbarn', () => {
    const noisy: Array<[number, number]> = [];
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      const r = 10 + (i % 2 ? 0.05 : -0.05);
      noisy.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const simple = simplifyPoly(noisy, 0.3);
    expect(simple.length).toBeLessThan(40);
    expect(simple.length).toBeGreaterThan(8);
    const path = smoothPath(simple);
    expect(path[0].outX).toBeDefined();
    const back = flattenPath(path);
    for (const [x, y] of back) expect(Math.hypot(x, y)).toBeCloseTo(10, 0);
  });
});

describe('SVG-Austausch der Körper', () => {
  it('Pfaddaten: absolute und relative Befehle, glatte Kurven, Bögen, Rechteck und Ellipse, Gruppen-Transformation', () => {
    const subs = parsePathData('M0 0 L10 0 l0 10 H0 Z');
    expect(subs).toHaveLength(1);
    expect(subs[0]).toHaveLength(4);
    const circle = parsePathData('M0 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z');
    const cb = pathBounds(circle[0]);
    expect(cb.maxX - cb.minX).toBeCloseTo(10, 0);
    expect(cb.maxY - cb.minY).toBeCloseTo(10, 0);
    const smooth = parsePathData('M0 0 C2 4 6 4 8 0 S14 -4 16 0 Z');
    expect(smooth[0][1].inX).toBeDefined();
    expect(smooth[0][1].outX).toBeCloseTo(2, 6);
    const shapes = parseSvgShapes('<svg><g transform="translate(10 20) scale(2)"><rect id="r" x="1" y="1" width="3" height="2"/><ellipse id="e" cx="0" cy="0" rx="4" ry="2"/></g><defs><path d="M0 0 L1 1 L0 1 Z"/></defs></svg>');
    expect(shapes.map((s) => s.id)).toEqual(['r', 'e']);
    const rb = pathBounds(shapes[0].subs[0]);
    expect(rb.minX).toBeCloseTo(12, 6);
    expect(rb.maxX).toBeCloseTo(18, 6);
    expect(rb.minY).toBeCloseTo(22, 6);
    const eb = pathBounds(shapes[1].subs[0]);
    expect(eb.maxX - eb.minX).toBeCloseTo(16, 1);
  });

  it('Export und Import erhalten Form, Löcher, Tiefe, Dicke, Rolle und Raum; gleiche Kennung ersetzt die Form', () => {
    const zone = emptyZone('probe-svg');
    zone.fields.push({ id: 'f1', x0: 0, x1: 200, y0: -10, y1: 60, goals: [] });
    const el = arch();
    zone.elements.push(el);
    const svg = zoneToSvg(zone);
    expect(svg).toContain('id="k1"');
    expect(svg).toContain('data-role="front"');
    const bodies = svgToBodies(svg);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].id).toBe('k1');
    expect(bodies[0].holes).toHaveLength(1);
    expect(bodies[0].z).toBe(0);
    expect(bodies[0].d).toBe(8);
    expect(bodies[0].room).toBe(12);
    const want = flattenPath(el.path!).map(([x, y]) => [x + el.x, y + el.y]);
    const got = flattenPath(bodies[0].path);
    expect(got.length).toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      expect(got[i][0]).toBeCloseTo(want[i][0], 1);
      expect(got[i][1]).toBeCloseTo(want[i][1], 1);
    }
    // verschoben zurückspielen: Form folgt, Rolle und Bild bleiben
    el.image = 'zones/x/bogen.webp';
    const moved = svg.replace('<path id="k1"', '<path transform="translate(50 0)" id="k1"');
    const changed = applySvgBodies(zone, svgToBodies(moved), () => 'k9');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toBe(el);
    // der Fußpunkt wandert auf die linke untere Ecke der Grenzen (die Kurve bauchte links über den alten Fußpunkt hinaus)
    expect(el.x).toBeCloseTo(65 + pathBounds(arch().path!).minX, 1);
    expect(el.image).toBe('zones/x/bogen.webp');
    expect(el.role).toBe('front');
    // neue Form ohne Kennung wird ein neuer Körper
    const added = applySvgBodies(zone, svgToBodies('<svg width="100" height="100" viewBox="0 0 100 100"><path d="M10 90 L40 90 L40 60 L10 60 Z"/></svg>', { scale: 10, minX: 0, maxY: 10 }), () => 'k2');
    expect(added[0].id).toBe('k2');
    expect(added[0].x).toBeCloseTo(1, 6);
    expect(added[0].y).toBeCloseTo(1, 6);
    expect(added[0].w).toBeCloseTo(3, 6);
    expect(zone.elements).toHaveLength(2);
  });
});

describe('Umriss aus Bild', () => {
  it('ein Ring im Alphakanal wird Umriss mit einem Loch, in Pixeln des Bilds', () => {
    const W = 128;
    const data = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - 64, y - 64);
      data[(y * W + x) * 4 + 3] = r <= 40 && r >= 15 ? 255 : 0;
    }
    const shapes = traceAlpha({ width: W, height: W, data }, { maxSize: 128, tol: 1 });
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    const o = shapes[0].outline;
    const xs = o.map((p) => p[0]);
    const ys = o.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(24, -1);
    expect(Math.max(...xs)).toBeCloseTo(104, -1);
    expect(Math.min(...ys)).toBeCloseTo(24, -1);
    const h = shapes[0].holes[0];
    const hx = h.map((p) => p[0]);
    expect(Math.max(...hx) - Math.min(...hx)).toBeCloseTo(30, -1);
  });
});

describe('Körper in Zonendatei und Feld', () => {
  it('Zonendatei: Pfad, Löcher, Rolle, Raum, Bild und Boden überleben; Maße folgen dem Pfad; Vorgabe ist ein Blob', () => {
    const zone = emptyZone('k');
    const el = arch();
    el.image = 'zones/k/bogen.webp';
    zone.elements.push(el);
    const text = serializeZone(zone);
    const back = parseZone(JSON.parse(text))!;
    const b = back.elements[0];
    expect(b.kind).toBe('body');
    expect(b.path).toHaveLength(5);
    expect(b.holes).toHaveLength(1);
    expect(b.room).toBe(12);
    expect(b.image).toBe('zones/k/bogen.webp');
    expect(b.ground).toBe(true);
    expect(b.openFrom).toBe(2);
    expect(b.w).toBeCloseTo(el.w, 1);
    expect(serializeZone(back)).toBe(text);
    const blob = newElement(zone, 'body', 100, 5, -1);
    expect(blob.path!.length).toBeGreaterThan(3);
    expect(blob.role).toBe('front');
    expect(blob.ground).toBe(true);
    expect(blob.x).toBeCloseTo(88, 1);
    // kaputte Pfade fallen weg
    expect(parseZone(JSON.parse(text.replace('"path"', '"pfad"')))!.elements).toHaveLength(0);
  });

  it('Feld: Körper fest, Loch und Raum ab der Öffnungsstufe frei und Höhle, Rückwand fest, Oberkante ist Boden, Säume nicht fest', () => {
    const el = arch();
    const closed = new FreeField([el], 1, () => 0);
    const open = new FreeField([el], 2, () => 0);
    expect(closed.empty).toBe(false);
    // im Bogen selbst: fest (als Erde, er ist Boden); im Loch: zu vor Stufe 2, danach frei und Höhle
    expect(open.solidKind(65, 10, 0)).toBe('earth');
    expect(closed.solidKind(80, 5, 0)).toBe('earth');
    expect(open.solidKind(80, 5, 0)).toBe('none');
    expect(open.caveAt(80, 5, 0)).toMatchObject({ id: 'k1' });
    const half = 8 / 2 / LANE_DEPTH;
    const roomBack = half + 12 / LANE_DEPTH;
    // Raum dahinter: frei und Höhle mit der Raummitte, dann die Rückwand
    expect(open.solidKind(70, 12, half + 0.3)).toBe('none');
    expect(open.caveAt(70, 12, half + 0.3)?.center).toBeCloseTo(12 / 2 / LANE_DEPTH, 6);
    expect(open.solidKind(70, 12, roomBack + ROOM_WALL / LANE_DEPTH / 2)).toBe('element');
    expect(closed.solidKind(70, 12, half + 0.3)).toBe('none');
    expect(closed.caveAt(70, 12, half + 0.3)).toBeNull();
    // außerhalb der Dicke frei, außerhalb des Umrisses frei
    expect(open.solidKind(65, 10, -1)).toBe('none');
    expect(open.solidKind(120, 10, 0)).toBe('none');
    // Oberkante als Boden für den Pinsel
    expect(open.surfaceAt(80, 0)).toBeCloseTo(20, 0);
    expect(open.surfaceAt(80, 1.5)).toBe(0);
    expect(open.floorBelow(80, 25, 0)).toMatchObject({ y: expect.closeTo(20, 0), kind: 'ground' });
    // Saum und Füllung sind keine Körper des Feldes
    const rim: ZoneElement = { ...el, id: 'k2', role: 'rim', room: undefined };
    expect(new FreeField([rim], 2, () => 0).empty).toBe(true);
    expect(BODY_DEPTH).toBe(6);
  });

  it('der Pinsel fährt durch das offene Loch in den Raum und weicht vor der Öffnungsstufe aus', () => {
    const el = arch();
    const mk = (field: FreeField) => ({ field: { free: (p: StagePoint) => field.freeLanes(p, toWorld, 0.8), solid: (x: number, y: number, lane: number) => field.solid(x, y, lane), floor: (x: number, y: number, lane: number) => field.floorBelow(x, y, lane, 40)?.y ?? null }, ground: (x: number, lane: number) => field.surfaceAt(x, lane) });
    const open = new FreeField([el], 2, () => 0);
    // Strich in Höhe des Lochs (Loch zwischen x 72 und 89, bis 12 m hoch), auf der Mitte des Lochs samt Raum gelesen
    const center = 12 / 2 / LANE_DEPTH;
    const pts: StagePoint[] = [];
    for (let x = 20; x <= 140; x += 2) pts.push(toStage(x, 5, center));
    const plan = planBrushTrack(pts, mk(open))!;
    expect(plan.rock).toEqual([]);
    expect(plan.rockCut).toBe(false);
    const at = (x: number) => plan.line.findIndex((p) => Math.abs(p.X - x) < 1.5);
    const lane80 = plan.z[at(80)] / LANE_DEPTH;
    expect(lane80).toBeGreaterThan(-8 / 2 / LANE_DEPTH);
    expect(lane80).toBeLessThan(8 / 2 / LANE_DEPTH + 12 / LANE_DEPTH);
    let maxStep = 0;
    for (let i = 1; i < plan.z.length; i++) maxStep = Math.max(maxStep, Math.abs(plan.z[i] - plan.z[i - 1]) / LANE_DEPTH);
    expect(maxStep).toBeLessThan(0.15);
    // vor der Öffnungsstufe ist der Deckel zu: die Bahn bleibt vor oder hinter dem Bogen
    const closed = new FreeField([el], 1, () => 0);
    const plan2 = planBrushTrack(pts, mk(closed))!;
    expect(plan2.rock).toEqual([]);
    const l2 = plan2.z[plan2.line.findIndex((p) => Math.abs(p.X - 80) < 1.5)] / LANE_DEPTH;
    expect(l2 < -8 / 2 / LANE_DEPTH || l2 > 8 / 2 / LANE_DEPTH).toBe(true);
  });

  it('Welt: ein Körper mit Loch und Raum bekommt Körper, Deckel und Rückwand; Licht wirft keinen Schatten', () => {
    const el = arch();
    const built = buildBody({ x: el.x, y: el.y, z: el.z, path: el.path!, holes: el.holes!, d: 8, role: 'front', room: 12, color: '#8aa0b8', openFrom: 2 });
    expect(built.kind).toBe('body');
    expect(built.lid).toBeDefined();
    expect(built.lidFrom).toBe(2);
    expect(built.group.getObjectByName('room-wall')).toBeDefined();
    expect(built.group.getObjectByName('body')).toBeDefined();
    const light = buildBody({ x: 0, y: 0, z: 1, path: presetPath('blob', 10, 5).path, holes: [], d: 0, role: 'light', room: 0, color: '#fff3c0', openFrom: 0 });
    expect(light.lid).toBeUndefined();
    expect(light.group.getObjectByName('body')!.castShadow).toBe(false);
    built.dispose();
    light.dispose();
  });
});
