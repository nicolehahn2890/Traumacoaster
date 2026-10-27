import { describe, expect, it } from 'vitest';
import { dockEdges, faceMaterial, groundAt, setFaceMaterial, toggleDock } from '@/zone/dock';
import { ellipsePath, flipShape, newPlane, newShape, parseNodes, rectPath, serializeNodes, setFacePaint, shapeFaces, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';

function plane(role: ZonePlane['role'] = 'play'): ZoneNode[] {
  const p = newPlane([], 0);
  p.role = role;
  return [p];
}

describe('Material je Fläche', () => {
  it('eine Fläche: an der Form; geteilt: am Füllpunkt, und ein neuer Anstrich behält es', () => {
    const nodes = plane();
    const s = newShape(nodes, 'p1', rectPath(10, 4), 0, 0, '#445566');
    nodes.push(s);
    expect(faceMaterial(s, shapeFaces(s)[0])).toBe('dig');
    setFaceMaterial(s, shapeFaces(s)[0], 'solid');
    expect(s.material).toBe('solid');
    s.cuts = [{ path: [{ x: -5, y: 1 }, { x: 5, y: 1 }], closed: false }];
    const [a, b] = shapeFaces(s).sort((p, q) => q.inner[1] - p.inner[1]);
    setFaceMaterial(s, a, 'airy');
    expect(faceMaterial(s, a)).toBe('airy');
    expect(faceMaterial(s, b)).toBe('solid');
    setFacePaint(s, a, { fill: '#ff0000' });
    expect(faceMaterial(s, a)).toBe('airy');
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    const t = back.find((n) => n.id === s.id) as ZoneShape;
    expect(t.material).toBe('solid');
    expect(t.regions?.[0].material).toBe('airy');
  });
});

describe('Andockkanten', () => {
  it('Oberkante eines Rechtecks; Unterkante und Seiten nicht; Kulisse zählt nicht', () => {
    const nodes = plane();
    const s = newShape(nodes, 'p1', rectPath(10, 4), 20, 3, '#445566');
    nodes.push(s);
    const e = dockEdges(nodes);
    expect(e.length).toBe(1);
    expect(e[0].pts.every((p) => Math.abs(p.y - 5) < 1e-6)).toBe(true);
    expect(e[0].mid.x).toBeCloseTo(20, 6);
    expect(groundAt(e, 22)).toBeCloseTo(5, 6);
    expect(groundAt(e, 40)).toBeNull();
    expect(groundAt(e, 22, 4)).toBeNull();
    (nodes[0] as ZonePlane).role = 'backdrop';
    expect(dockEdges(nodes).length).toBe(0);
  });

  it('Höhle: der Boden eines Lochs trägt, die Decke nicht', () => {
    const nodes = plane();
    const s = newShape(nodes, 'p1', rectPath(20, 12), 0, 0, '#445566');
    s.holes = [ellipsePath(5, 3)];
    nodes.push(s);
    const e = dockEdges(nodes);
    // die Oberkante oben und der untere Bogen des Lochs (flacher als 35°)
    expect(groundAt(e, 0, 0)).toBeCloseTo(-3, 1);
    expect(groundAt(e, 0)).toBeCloseTo(6, 6);
    expect(e.some((x) => x.pts.some((p) => p.y > 0 && p.y < 4))).toBe(false);
  });

  it('eine Teilungslinie trägt nur, wenn darüber nichts Festes liegt', () => {
    const nodes = plane();
    const s = newShape(nodes, 'p1', rectPath(10, 4), 0, 0, '#445566');
    s.cuts = [{ path: [{ x: -5, y: 1 }, { x: 5, y: 1 }], closed: false }];
    nodes.push(s);
    expect(groundAt(dockEdges(nodes), 0)).toBeCloseTo(2, 6);
    const upper = shapeFaces(s).find((f) => f.inner[1] > 1)!;
    setFaceMaterial(s, upper, 'airy');
    expect(groundAt(dockEdges(nodes), 0)).toBeCloseTo(1, 6);
  });

  it('Neigung: 30° trägt, 40° nicht', () => {
    const tri = (deg: number) => {
      const h = 5 * Math.tan((deg * Math.PI) / 180);
      return [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: h },
      ];
    };
    const nodes = plane();
    nodes.push(newShape(nodes, 'p1', tri(30), 0, 0, '#445566'));
    expect(dockEdges(nodes).length).toBeGreaterThan(0);
    const steep = plane();
    steep.push(newShape(steep, 'p1', tri(40), 0, 0, '#445566'));
    expect(dockEdges(steep).length).toBe(0);
  });

  it('Kantenstück abschalten und wieder an; der Schalter wandert beim Spiegeln mit', () => {
    const nodes = plane();
    const s = newShape(nodes, 'p1', rectPath(10, 4), 20, 3, '#445566');
    nodes.push(s);
    toggleDock(s, dockEdges(nodes)[0]);
    expect(dockEdges(nodes)[0].off).toBe(true);
    expect(groundAt(dockEdges(nodes), 22)).toBeNull();
    flipShape(s, 'x');
    expect(dockEdges(nodes)[0].off).toBe(true);
    toggleDock(s, dockEdges(nodes)[0]);
    expect(s.dockOff).toBeUndefined();
    expect(dockEdges(nodes)[0].off).toBe(false);
  });
});
