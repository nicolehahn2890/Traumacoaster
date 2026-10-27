import { describe, expect, it } from 'vitest';
import { cloneNodes, facePaint, flipShape, newPlane, newShape, parseNodes, rectPath, serializeNodes, setFaceFill, setFacePaint, shapeFaces, swatchMap, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { evalLayers, fillsInBox, fillsToBox, gradientT, MAX_LAYERS, paintLayers, parseFill, rampOf, RAMP, resolveColor, serializeFill, visibleLayers, type GradientFill, type ZoneFill, type ZoneStyle, type ZoneSwatch } from '@/zone/paint';
import { rotateShape } from '@/zone/shapeOps';

const grad = (a: string, b: string, extra: Partial<GradientFill> = {}): GradientFill => ({ type: 'gradient', stops: [{ t: 0, color: a, a: 1 }, { t: 1, color: b, a: 1 }], x0: -1, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1, ...extra });
const to255 = (rgb: number[]): number[] => rgb.map((v) => Math.round(v * 255));
const none = new Map<string, ZoneSwatch>();

function scene(): { nodes: ZoneNode[]; s: ZoneShape } {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  const s = newShape(nodes, 'p1', rectPath(4, 2), 0, 0, '#445566');
  nodes.push(s);
  return { nodes, s };
}

describe('Füllungen lesen und schreiben', () => {
  it('Verlauf und Farbe kommen gerundet zurück, Stopps sortiert; Kaputtes fällt weg', () => {
    const f = grad('#FF0000', '#0000ff', { radial: true, blend: 'overlay', opacity: 0.55555, stops: [{ t: 1, color: '#0000FF', a: 0.5 }, { t: 0, color: '@c2', a: 1, mid: 0.3 }] });
    const back = parseFill(JSON.parse(JSON.stringify(serializeFill(f)))) as GradientFill;
    expect(back.type).toBe('gradient');
    expect(back.radial).toBe(true);
    expect(back.blend).toBe('overlay');
    expect(back.opacity).toBe(0.556);
    expect(back.stops.map((s) => [s.t, s.color, s.a, s.mid])).toEqual([
      [0, '@c2', 1, 0.3],
      [1, '#0000ff', 0.5, undefined],
    ]);
    expect(parseFill({ type: 'gradient', stops: [{ t: 0, color: '#000000' }], x0: 0, y0: 0, x1: 1, y1: 0 })).toBeNull();
    expect(parseFill({ type: 'color', color: 'rot' })).toBeNull();
    expect(parseFill({ type: 'color', color: '#AbCdEf', blend: 'wild' })).toEqual({ type: 'color', color: '#abcdef', blend: 'normal', opacity: 1 });
  });

  it('Formen, Füllpunkte, Ebenenstapel, Palette und Stile laufen durch die Zonendatei und werden tief kopiert', () => {
    const { nodes, s } = scene();
    nodes.push({ id: 'c1', kind: 'swatch', name: 'Fels', color: '#aa3355', looks: { night: '#112244' } } as ZoneSwatch);
    nodes.push({ id: 'y1', kind: 'style', name: 'Höhle', fill: '@c1', fills: [grad('#ffffff', '#000000', { x0: 0, y0: 0, x1: 1, y1: 1 })] } as ZoneStyle);
    s.fill = '@c1';
    s.fills = [grad('#ff0000', '#00ff00')];
    s.opacity = 0.5;
    s.regions = [{ x: 1, y: 0, fill: '#123456', fills: [{ type: 'color', color: '#ffffff', blend: 'screen', opacity: 0.25 }], style: 'y1' }];
    (nodes[0] as { fills?: ZoneFill[] }).fills = [{ type: 'fade', stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#000000', a: 0 }], x0: 0, y0: 0, x1: 0, y1: 10, blend: 'normal', opacity: 1 }];
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect(JSON.stringify(serializeNodes(back))).toBe(JSON.stringify(serializeNodes(nodes)));
    const shape = back.find((n) => n.id === s.id) as ZoneShape;
    expect(shape.fill).toBe('@c1');
    expect(shape.regions?.[0].style).toBe('y1');
    expect(swatchMap(back).get('c1')?.looks?.night).toBe('#112244');
    const copy = cloneNodes(back);
    ((copy.find((n) => n.id === s.id) as ZoneShape).fills![0] as GradientFill).stops[0].color = '#000000';
    expect((shape.fills![0] as GradientFill).stops[0].color).toBe('#ff0000');
  });
});

describe('Farben und Verläufe', () => {
  it('Palettenverweise lösen je Look auf, fehlende geben Grau', () => {
    const sw = new Map([['c1', { id: 'c1', kind: 'swatch', name: 'Fels', color: '#aa3355', looks: { night: '#112244' } } as ZoneSwatch]]);
    expect(resolveColor('@c1', sw, 'day')).toBe('#aa3355');
    expect(resolveColor('@c1', sw, 'night')).toBe('#112244');
    expect(resolveColor('@c1', sw, 'dusk')).toBe('#aa3355');
    expect(resolveColor('@c9', sw)).toBe('#808080');
    expect(resolveColor('#010203', sw)).toBe('#010203');
  });

  it('Farbband: Enden wie die Stopps, die Mitte verschiebt den halben Weg', () => {
    const r = rampOf([{ t: 0.2, color: '#000000', a: 1, mid: 0.25 }, { t: 1, color: '#ffffff', a: 0 }], none);
    expect(r[0]).toBe(0);
    expect(r[(RAMP - 1) * 4]).toBeCloseTo(1);
    expect(r[(RAMP - 1) * 4 + 3]).toBeCloseTo(0);
    // halber Farbweg bei 0,2 + 0,25 · 0,8 = 0,4
    const at = Math.round(0.4 * (RAMP - 1)) * 4;
    expect(r[at]).toBeCloseTo(0.5, 1);
  });

  it('Lage im Verlauf: linear entlang der Linie, radial als Abstand, außerhalb gleichbleibend', () => {
    const f = grad('#000000', '#ffffff', { x0: 0, y0: 0, x1: 10, y1: 0 });
    expect(gradientT(f, 5, 3)).toBeCloseTo(0.5);
    expect(gradientT(f, -4, 0)).toBe(0);
    expect(gradientT({ ...f, radial: true }, 0, 5)).toBeCloseTo(0.5);
  });
});

describe('Schichten auswerten (wie der Shader)', () => {
  const base = (c: string): ZoneFill => ({ type: 'color', color: c, blend: 'normal', opacity: 1 });

  it('Mischmodi nach W3C: Multiplizieren mit halber Deckkraft, Farbe, Negativ multiplizieren', () => {
    expect(to255(evalLayers([base('#808080'), { type: 'color', color: '#ff8040', blend: 'multiply', opacity: 0.5 }], 0, 0, none).rgb)).toEqual([128, 96, 80]);
    expect(to255(evalLayers([base('#c0c0c0'), { type: 'color', color: '#3060ff', blend: 'color', opacity: 1 }], 0, 0, none).rgb)).toEqual([171, 191, 255]);
    expect(to255(evalLayers([base('#404040'), { type: 'color', color: '#404040', blend: 'screen', opacity: 1 }], 0, 0, none).rgb)).toEqual([112, 112, 112]);
  });

  it('ein Verlauf mit Deckkraft in den Stopps lässt die Grundfarbe durchscheinen, bleibt aber deckend', () => {
    const g = grad('#ff0000', '#ff0000', { stops: [{ t: 0, color: '#ff0000', a: 1 }, { t: 1, color: '#ff0000', a: 0 }] });
    const left = evalLayers([base('#0000ff'), g], -1, 0, none);
    const right = evalLayers([base('#0000ff'), g], 1, 0, none);
    expect(to255(left.rgb)).toEqual([255, 0, 0]);
    expect(to255(right.rgb)).toEqual([0, 0, 255]);
    expect(right.a).toBe(1);
  });

  it('ein Deckkraftverlauf nimmt dem Ergebnis darunter die Deckkraft', () => {
    const fade: ZoneFill = { type: 'fade', stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#000000', a: 0 }], x0: -1, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 };
    const mid = evalLayers([base('#ffffff'), fade], 0, 0, none);
    expect(mid.a).toBeCloseTo(0.5, 2);
    expect(to255(mid.rgb)).toEqual([255, 255, 255]);
    expect(evalLayers([base('#ffffff'), fade], 1, 0, none).a).toBeCloseTo(0, 5);
  });

  it('Schichten einer Fläche: Loch gibt nichts, ein Stil ersetzt alles und bekommt den Rahmen, Verstecktes fällt weg', () => {
    const style: ZoneStyle = { id: 'y1', kind: 'style', name: 'Höhle', fill: '#111111', fills: [grad('#ffffff', '#000000', { x0: 0, y0: 0, x1: 1, y1: 0 })], opacity: 0.5 };
    const styles = new Map([['y1', style]]);
    const box = { minX: 10, minY: 0, maxX: 30, maxY: 4 };
    expect(paintLayers({ fill: null }, styles, box)).toBeNull();
    const linked = paintLayers({ fill: '#ff0000', style: 'y1' }, styles, box)!;
    expect(linked.opacity).toBe(0.5);
    expect(linked.layers[0]).toMatchObject({ type: 'color', color: '#111111' });
    expect(linked.layers[1]).toMatchObject({ x0: 10, x1: 30 });
    const own = paintLayers({ fill: '#ff0000', fills: [{ ...grad('#000000', '#ffffff'), hidden: true }, ...Array.from({ length: 12 }, () => base('#00ff00'))] }, styles, box)!;
    expect(own.layers.length).toBe(MAX_LAYERS);
    expect(own.layers.every((f) => !f.hidden)).toBe(true);
    // Rahmen hin und zurück
    const rel = fillsToBox([grad('#000000', '#ffffff', { x0: 15, y0: 1, x1: 25, y1: 3 })], box)!;
    expect(rel[0]).toMatchObject({ x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 });
    expect(fillsInBox(rel, box)![0]).toMatchObject({ x0: 15, y0: 1, x1: 25, y1: 3 });
  });
});

describe('Leistung: verdeckte Schichten', () => {
  it('unter einer deckenden Füllung wird nichts gerechnet; durchscheinende und gemischte zählen nicht als deckend', () => {
    const base = { type: 'color' as const, color: '#000000', blend: 'normal' as const, opacity: 1 };
    const opaque = grad('#ff0000', '#00ff00');
    const thin = { ...grad('#ff0000', '#00ff00'), opacity: 0.5 };
    const mul = { ...base, color: '#ffffff', blend: 'multiply' as const };
    expect(visibleLayers([base, opaque, mul])).toEqual([opaque, mul]);
    expect(visibleLayers([base, thin])).toEqual([base, thin]);
    expect(visibleLayers([base, { ...opaque, stops: [{ t: 0, color: '#ff0000', a: 1 }, { t: 1, color: '#00ff00', a: 0.2 }] }]).length).toBe(2);
    // das Ergebnis bleibt gleich
    const sw = new Map<string, ZoneSwatch>();
    expect(evalLayers(visibleLayers([base, opaque, mul]), 0.3, 0, sw)).toEqual(evalLayers([base, opaque, mul], 0.3, 0, sw));
  });
});

describe('Anstrich an Flächen', () => {
  it('Grundfarbe setzen behält den Füllstapel der Fläche; gleicher Anstrich wie die Form braucht keinen Füllpunkt', () => {
    const { s } = scene();
    s.cuts = [{ path: [{ x: 0, y: -2 }, { x: 0, y: 2 }], closed: false }];
    const [a, b] = shapeFaces(s);
    setFacePaint(s, a, { fill: '#ff0000', fills: [grad('#000000', '#ffffff')] });
    setFaceFill(s, a, '#00ff00');
    expect(facePaint(s, a).fill).toBe('#00ff00');
    expect(facePaint(s, a).fills?.length).toBe(1);
    expect(facePaint(s, b).fill).toBe('#445566');
    setFacePaint(s, a, { fill: '#445566' });
    expect(s.regions).toBeUndefined();
    setFaceFill(s, b, null);
    expect(facePaint(s, b)).toMatchObject({ fill: null });
    expect(facePaint(s, b).fills).toBeUndefined();
  });

  it('Spiegeln und Drehen nehmen die Verlaufsgriffe mit', () => {
    const { s } = scene();
    s.fills = [grad('#000000', '#ffffff', { x0: -2, y0: 0, x1: 2, y1: 1 })];
    flipShape(s, 'x');
    expect(s.fills[0]).toMatchObject({ x0: 2, y0: 0, x1: -2, y1: 1 });
    const orig = cloneNodes([s])[0] as ZoneShape;
    rotateShape(s, orig, { x: 0, y: 0 }, Math.PI / 2);
    expect(s.fills![0]).toMatchObject({ x0: 0, y0: 2, x1: -1, y1: -2 });
    rotateShape(s, orig, { x: 0, y: 0 }, 0);
    expect(s.fills![0]).toMatchObject({ x0: 2, y0: 0, x1: -2, y1: 1 });
  });
});
