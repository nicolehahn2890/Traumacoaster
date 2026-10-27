import { describe, expect, it } from 'vitest';
import { applyGlue, crossParams, glueOf, PathTools, rdpOpen, slicePoly, type PathToolHost } from '@/zoneeditor/pathTools';
import { faceFill, findShape, flipShape, newPlane, newShape, rectPath, setPath, shapeFaces, shapesOf, shapeToPlane, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { faceAt } from '@/zone/faces';

/** Bild = Ebene mal 10 Pixel je Meter, y nach unten; Ursprung der Ebene in der Bildmitte (400, 300) */
const toScreen = (q: { x: number; y: number }) => ({ x: 400 + q.x * 10, y: 300 - q.y * 10 });
const toPlane = (p: { x: number; y: number }) => ({ x: (p.x - 400) / 10, y: (300 - p.y) / 10 });

function setup(): { nodes: ZoneNode[]; tools: PathTools; selected: () => ZoneShape | undefined; select: (id: string | null) => void; toasts: string[]; commits: () => number } {
  const nodes: ZoneNode[] = [];
  let selected: string | null = null;
  let commits = 0;
  const toasts: string[] = [];
  const host: PathToolHost = {
    nodes: () => nodes,
    activePlane: () => nodes.find((n): n is ZonePlane => n.kind === 'plane'),
    selectedShape: () => findShape(nodes, selected),
    select: (id) => {
      selected = id;
    },
    planePoint: (_plane, p) => toPlane(p),
    screenOf: (_plane, q) => toScreen(q),
    pick: (p) => {
      const q = toPlane(p);
      for (const s of [...nodes].reverse()) {
        if (s.kind !== 'shape') continue;
        const f = faceAt(shapeFaces(s), (q.x - s.x) / s.sx, (q.y - s.y) / s.sy);
        if (f >= 0) return { id: s.id, face: f };
      }
      return null;
    },
    begin: () => {},
    commit: () => {
      commits++;
    },
    cancel: () => {},
    changed: () => {},
    redraw: () => {},
    toast: (m) => toasts.push(m),
    ensurePlane: () => {
      let p = nodes.find((n): n is ZonePlane => n.kind === 'plane');
      if (!p) {
        p = newPlane(nodes, 0);
        nodes.push(p);
      }
      return p;
    },
    addShape: (s) => {
      nodes.push(s);
    },
    fillFor: () => '#3d5a63',
    hitRadius: () => 15,
  };
  return { nodes, tools: new PathTools(host), selected: () => findShape(nodes, selected), select: (id) => (selected = id), toasts, commits: () => commits };
}

const tap = (t: PathTools, x: number, y: number, id = 1) => {
  t.down(id, { x, y }, { alt: false });
  t.up(id);
};
const stroke = (t: PathTools, pts: Array<[number, number]>, id = 1) => {
  t.down(id, { x: pts[0][0], y: pts[0][1] }, { alt: false });
  for (const [x, y] of pts.slice(1)) t.move(id, { x, y }, { alt: false });
  t.up(id);
};

describe('Hilfen der Pfad-Werkzeuge', () => {
  it('Kreuzungen, Ausschnitt und Vereinfachen offener Züge', () => {
    const line: Array<[number, number]> = [[-2, 0], [5, 0], [12, 0]];
    const sq: Array<[number, number]> = [[0, -5], [10, -5], [10, 5], [0, 5]];
    const ps = crossParams(line, sq, true).sort((a, b) => a - b);
    expect(ps.length).toBe(2);
    const cut = slicePoly(line, ps[0], ps[1]);
    expect(cut[0][0]).toBeCloseTo(0, 9);
    expect(cut[cut.length - 1][0]).toBeCloseTo(10, 9);
    expect(rdpOpen([[0, 0], [1, 0.001], [2, 0], [3, 2]], 0.01).length).toBe(3);
  });

  it('angeklebte Linienenden wandern mit, wenn der Umriss gezogen wird; die Form bleibt geteilt', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, 'p1', rectPath(20, 10), 0, 0, '#445566');
    s.cuts = [{ path: [{ x: -10, y: 1 }, { x: 10, y: -1 }], closed: false }];
    expect(shapeFaces(s).length).toBe(2);
    const glue = glueOf(s);
    expect(glue.length).toBe(2);
    // linke obere Ecke weit nach links ziehen: die linke Kante wird schräg
    const path = s.path.map((p) => ({ ...p }));
    const k = path.findIndex((p) => p.x < 0 && p.y > 0);
    path[k] = { x: -16, y: 9 };
    setPath(s, { kind: 'outline' }, path);
    // ohne Kleben hinge das linke Ende in der Luft
    expect(shapeFaces(s).length).toBe(1);
    applyGlue(s, glue, { kind: 'outline' });
    expect(shapeFaces(s).length).toBe(2);
    expect(s.cuts![0].path[0].x).toBeLessThan(-10);
  });

  it('Spiegeln hält die Mitte, Linien und Füllpunkte spiegeln mit', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, 'p1', [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -3, y: 5 }], 10, 2, '#445566');
    s.cuts = [{ path: [{ x: -5, y: 0 }, { x: 5, y: 3 }], closed: false }];
    const faces = shapeFaces(s);
    const upper = faces.find((f) => f.inner[1] > 1.5)!;
    s.regions = [{ x: upper.inner[0], y: upper.inner[1], fill: '#ff0000' }];
    const before = shapeToPlane(s, s.path[0].x, s.path[0].y);
    flipShape(s, 'x');
    const red = shapeFaces(s).filter((f) => faceFill(s, f) === '#ff0000');
    expect(red.length).toBe(1);
    expect(red[0].inner[1]).toBeGreaterThan(1.5);
    // linke untere Ecke (-5, -5) liegt nach dem Spiegeln rechts unten: Ebenen-x 10 - (-5 - (-1)) …
    const after = shapeToPlane(s, s.path[0].x, s.path[0].y);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.x).toBeGreaterThan(before.x);
  });
});

describe('Pfad-Werkzeuge mit einem Bild ohne Kamera', () => {
  it('Zeichenstift: vier Ecken und Tippen auf den ersten Anker ergeben eine neue Form auf einer neuen Ebene', () => {
    const t = setup();
    t.tools.setTool('pen');
    tap(t.tools, 300, 200);
    tap(t.tools, 500, 200);
    tap(t.tools, 500, 400);
    tap(t.tools, 300, 400);
    expect(t.tools.context()).toEqual({ kind: 'pen', count: 4, into: null });
    tap(t.tools, 302, 201);
    const shapes = t.nodes.filter((n) => n.kind === 'shape');
    expect(shapes.length).toBe(1);
    expect(shapeFaces(shapes[0] as ZoneShape)[0].area).toBeCloseTo(400, 6);
    expect(t.selected()?.id).toBe(shapes[0].id);
  });

  it('Zeichenstift in eine gewählte Form: die Enden rasten an den Kanten ein, die Form zerfällt in zwei Flächen', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400], [301, 201]]) tap(t.tools, x, y);
    const s = t.selected()!;
    // knapp neben den Kanten anfangen und aufhören (8 px)
    tap(t.tools, 292, 300);
    tap(t.tools, 400, 330);
    tap(t.tools, 508, 280);
    t.tools.key('enter');
    expect(s.cuts?.length).toBe(1);
    expect(shapeFaces(s).length).toBe(2);
    expect(shapesOf(t.nodes, s.parent).length).toBe(1);
  });

  it('ein Pfad, der die gewählte Form nicht berührt, wird eine eigene Form', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [400, 200], [400, 300], [300, 300], [301, 201]]) tap(t.tools, x, y);
    const first = t.selected()!;
    for (const [x, y] of [[600, 200], [700, 200], [650, 300], [601, 201]]) tap(t.tools, x, y);
    expect(first.cuts).toBeUndefined();
    expect(t.nodes.filter((n) => n.kind === 'shape').length).toBe(2);
  });

  it('Direktauswahl: Fläche wählen, färben, zum Loch machen (Entf)', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400], [301, 201]]) tap(t.tools, x, y);
    for (const [x, y] of [[300, 300], [500, 300]]) tap(t.tools, x, y);
    t.tools.key('enter');
    const s = t.selected()!;
    t.tools.setTool('direct');
    tap(t.tools, 400, 250);
    expect(t.tools.context()?.kind).toBe('face');
    t.tools.fillFace('#ff0000');
    tap(t.tools, 400, 350);
    expect(t.tools.key('delete')).toBe(true);
    const fills = shapeFaces(s).map((f) => faceFill(s, f));
    expect(fills.sort()).toEqual(['#ff0000', null].sort());
  });

  it('Formpinsel: ein geschlossener Freihandkreis wird eine glatte Form mit wenigen Ankern', () => {
    const t = setup();
    t.tools.setTool('brush');
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 64; k++) pts.push([400 + 100 * Math.cos((k / 64) * 2 * Math.PI), 300 + 80 * Math.sin((k / 64) * 2 * Math.PI)]);
    stroke(t.tools, pts);
    const s = t.nodes.find((n): n is ZoneShape => n.kind === 'shape')!;
    expect(s).toBeTruthy();
    expect(s.path.length).toBeLessThan(20);
    expect(shapeFaces(s)[0].area).toBeCloseTo(Math.PI * 10 * 8, -0.5);
  });

  it('Messer: ein Strich quer durch die Form teilt sie zwischen erster und letzter Kante', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400], [301, 201]]) tap(t.tools, x, y);
    const s = t.selected()!;
    t.select(null);
    t.tools.setTool('knife');
    stroke(t.tools, [[250, 260], [350, 280], [450, 300], [560, 320]]);
    expect(s.cuts?.length).toBe(1);
    const cut = s.cuts![0].path;
    expect(cut[0].x).toBeCloseTo(-10, 3);
    expect(cut[cut.length - 1].x).toBeCloseTo(10, 3);
    expect(shapeFaces(s).length).toBe(2);
    // ein Strich daneben trifft nichts
    stroke(t.tools, [[600, 100], [700, 120], [760, 140]]);
    expect(t.toasts.at(-1)).toMatch(/Messer/);
  });
});

describe('Freihand zu Kurven', () => {
  it('ein Kreis aus vielen Punkten wird eine glatte Form mit drei bis sechs Ankern, nah am Strich', async () => {
    const { fitCurve, flattenPath } = await import('@/zone/path');
    const poly: Array<[number, number]> = [];
    for (let k = 0; k < 120; k++) poly.push([10 * Math.cos((k / 120) * 2 * Math.PI) + 0.03 * Math.sin(k * 7), 6 * Math.sin((k / 120) * 2 * Math.PI)]);
    const path = fitCurve(poly, 0.25, true);
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path.length).toBeLessThanOrEqual(6);
    // jeder Punkt der Kurve liegt nah an der Ellipse
    for (const [x, y] of flattenPath(path, 0.1)) expect(Math.abs(Math.hypot(x / 10, y / 6) - 1)).toBeLessThan(0.06);
  });

  it('ein Strich mit einem scharfen Knick behält dort eine Ecke', async () => {
    const { fitCurve } = await import('@/zone/path');
    const poly: Array<[number, number]> = [];
    for (let k = 0; k <= 40; k++) poly.push([k * 0.25, 0]);
    for (let k = 1; k <= 40; k++) poly.push([10, k * 0.25]);
    const path = fitCurve(poly, 0.1, false);
    const corner = path.find((p) => Math.abs(p.x - 10) < 0.3 && Math.abs(p.y) < 0.3);
    expect(corner).toBeTruthy();
    // Griffe an der Ecke zeigen in verschiedene Richtungen (keine Rundung)
    const dirIn = Math.atan2(corner!.inY ?? 0, corner!.inX ?? 0);
    const dirOut = Math.atan2(corner!.outY ?? 0, corner!.outX ?? 0);
    expect(Math.abs(Math.abs(dirIn - dirOut) - Math.PI)).toBeGreaterThan(0.5);
    expect(path.length).toBeLessThanOrEqual(5);
  });
});

describe('Formpinsel in eine Form', () => {
  it('ein offener Strich quer durch die gewählte Form wird eine Teilungslinie von Kante zu Kante', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400], [301, 201]]) tap(t.tools, x, y);
    const s = t.selected()!;
    t.tools.setTool('brush');
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 40; k++) pts.push([260 + k * 7, 300 + 15 * Math.sin(k / 6)]);
    stroke(t.tools, pts);
    expect(s.cuts?.length).toBe(1);
    const cut = s.cuts![0].path;
    expect(cut[0].x).toBeCloseTo(-10, 2);
    expect(cut[cut.length - 1].x).toBeCloseTo(10, 2);
    expect(shapeFaces(s).length).toBe(2);
  });
});
