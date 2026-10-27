import { describe, expect, it } from 'vitest';
import { newPlane, newShape, parseNodes, rectPath, serializeNodes, shapeFaces, styleMap, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { bakeStyle, linkedStyle, linkStyle, paintToStyle, pasteStyle, styleFromClip, unlinkStyle } from '@/zone/styles';
import { paintLayers, type GradientFill } from '@/zone/paint';

function scene(): { nodes: ZoneNode[]; a: ZoneShape; b: ZoneShape } {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  const a = newShape(nodes, 'p1', rectPath(4, 2), 0, 0, '#204060');
  a.fills = [{ type: 'gradient', stops: [{ t: 0, color: '#ffffff', a: 1 }, { t: 1, color: '#000000', a: 1 }], x0: -2, y0: 0, x1: 2, y1: 0, blend: 'multiply', opacity: 0.8 }];
  nodes.push(a);
  const b = newShape(nodes, 'p1', rectPath(10, 6), 20, 0, '#888888');
  nodes.push(b);
  return { nodes, a, b };
}

describe('Stile', () => {
  it('als Stil sichern: Griffe als Anteil am Rahmen; verknüpft auf eine größere Form passen sie zu ihr', () => {
    const { nodes, a, b } = scene();
    const clip = paintToStyle({ shape: a, face: null }, styleMap(nodes))!;
    expect(clip.fills?.[0]).toMatchObject({ x0: 0, y0: 0.5, x1: 1, y1: 0.5 });
    const y = styleFromClip('y1', 'Höhle', clip);
    nodes.push(y);
    linkStyle({ shape: b, face: null }, y);
    expect(b.style).toBe('y1');
    expect(b.fill).toBe('#204060');
    // Rückfall-Kopie und gezeichnete Schichten liegen auf dem Rahmen von b (-5 … 5)
    expect(b.fills?.[0]).toMatchObject({ x0: -5, x1: 5 });
    const pl = paintLayers(b, styleMap(nodes), { minX: -5, minY: -3, maxX: 5, maxY: 3 })!;
    expect(pl.layers[1]).toMatchObject({ x0: -5, x1: 5, blend: 'multiply' });
    expect(linkedStyle({ shape: b, face: null }, styleMap(nodes))).toBe('y1');
    // Stil ändern: die verknüpfte Form zeigt es sofort
    y.fill = '#ff0000';
    expect(paintLayers(b, styleMap(nodes), { minX: -5, minY: -3, maxX: 5, maxY: 3 })!.layers[0]).toMatchObject({ color: '#ff0000' });
    // überlebt die Zonendatei
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect((back.find((n) => n.id === b.id) as ZoneShape).style).toBe('y1');
  });

  it('lösen und löschen: die Form behält, was der Stil zeigte', () => {
    const { nodes, a, b } = scene();
    const y = styleFromClip('y1', 'Höhle', paintToStyle({ shape: a, face: null }, styleMap(nodes))!);
    y.fill = '#00ff00';
    nodes.push(y);
    linkStyle({ shape: b, face: null }, y);
    unlinkStyle({ shape: b, face: null }, styleMap(nodes));
    expect(b.style).toBeUndefined();
    expect(b.fill).toBe('#00ff00');
    linkStyle({ shape: b, face: null }, y);
    y.fill = '#0000ff';
    bakeStyle(nodes, 'y1');
    expect(b.style).toBeUndefined();
    expect(b.fill).toBe('#0000ff');
    expect((b.fills?.[0] as GradientFill).x1).toBe(5);
  });

  it('einfügen: ein Anstrich ohne Stil wird eine Kopie, einer mit Stil verknüpft; auch auf eine Fläche', () => {
    const { nodes, a, b } = scene();
    b.cuts = [{ path: [{ x: -5, y: 0 }, { x: 5, y: 0 }], closed: false }];
    const [top] = shapeFaces(b).sort((p, q) => q.inner[1] - p.inner[1]);
    const clip = paintToStyle({ shape: a, face: null }, styleMap(nodes))!;
    pasteStyle({ shape: b, face: top }, clip, styleMap(nodes));
    expect(b.regions?.length).toBe(1);
    expect(b.regions?.[0].fills?.[0]).toMatchObject({ x0: -5, x1: 5 });
    expect(b.regions?.[0].style).toBeUndefined();
    const y = styleFromClip('y1', 'Höhle', clip);
    nodes.push(y);
    pasteStyle({ shape: b, face: null }, { ...clip, style: 'y1' }, styleMap(nodes));
    expect(b.style).toBe('y1');
  });
});
