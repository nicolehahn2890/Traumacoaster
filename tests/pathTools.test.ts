import { describe, expect, it } from 'vitest';
import { applyGlue, crossParams, glueOf, PathTools, rdpOpen, slicePoly, type PathToolHost } from '@/zoneeditor/pathTools';
import { faceFill, findShape, flipShape, newPlane, newShape, rectPath, setPath, shapeFaces, shapesOf, shapeToPlane, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { faceAt } from '@/zone/faces';

/** Bild = Ebene mal 10 Pixel je Meter, y nach unten; Ursprung der Ebene in der Bildmitte (400, 300) */
const toScreen = (q: { x: number; y: number }) => ({ x: 400 + q.x * 10, y: 300 - q.y * 10 });
const toPlane = (p: { x: number; y: number }) => ({ x: (p.x - 400) / 10, y: (300 - p.y) / 10 });

function setup(opts: { snap?: boolean; grid?: number | null } = {}): { nodes: ZoneNode[]; tools: PathTools; selected: () => ZoneShape | undefined; select: (id: string | null) => void; toasts: string[]; commits: () => number } {
  const nodes: ZoneNode[] = [];
  let selection: string[] = [];
  let commits = 0;
  const toasts: string[] = [];
  const host: PathToolHost = {
    nodes: () => nodes,
    activePlane: () => nodes.find((n): n is ZonePlane => n.kind === 'plane'),
    selectedShapes: () => selection.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s),
    setSelection: (ids) => {
      selection = [...ids];
    },
    regionPlanes: () => nodes.filter((n): n is ZonePlane => n.kind === 'plane'),
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
    snapping: () => !!opts.snap,
    gridStep: () => opts.grid ?? null,
    visible: () => true,
  };
  return { nodes, tools: new PathTools(host), selected: () => findShape(nodes, selection.at(-1) ?? null), select: (id) => (selection = id ? [id] : []), toasts, commits: () => commits };
}

const M = { cmd: false, alt: false, shift: false };
const CMD = { ...M, cmd: true };
const ALT = { ...M, alt: true };
const SHIFT = { ...M, shift: true };

const tap = (t: PathTools, x: number, y: number, mods = M, id = 1) => {
  t.down(id, { x, y }, mods);
  t.up(id);
};
const stroke = (t: PathTools, pts: Array<[number, number]>, mods = M, id = 1) => {
  t.down(id, { x: pts[0][0], y: pts[0][1] }, mods);
  for (const [x, y] of pts.slice(1)) t.move(id, { x, y }, mods);
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

/** Rechteck 20 × 20 m um die Bildmitte (Ecken bei 300/500 px), gezeichnet mit dem Zeichenstift */
function square(t: ReturnType<typeof setup>): ZoneShape {
  t.tools.setTool('pen');
  for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400], [301, 201]]) tap(t.tools, x, y);
  return t.selected()!;
}

describe('Zeichenstift wie in Illustrator', () => {
  it('Schließen mit Ziehen dreht die Griffe des Startpunkts (beide gleich, mit Wahltaste nur der zum Schluss)', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400]]) tap(t.tools, x, y);
    t.tools.down(1, { x: 300, y: 200 }, M);
    t.tools.move(1, { x: 310, y: 230 }, M);
    t.tools.move(1, { x: 320, y: 260 }, M);
    t.tools.up(1);
    const s = t.selected()!;
    expect(s.path.length).toBe(3);
    const a = s.path[0];
    // Ziehen um (20, 60) Bildpunkte = (2, -6) Meter: Griff nach vorn so, der zum Schluss entgegen
    expect(a.outX).toBeCloseTo(2, 2);
    expect(a.outY).toBeCloseTo(-6, 2);
    expect(a.inX).toBeCloseTo(-2, 2);
    expect(a.inY).toBeCloseTo(6, 2);

    const t2 = setup();
    t2.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400]]) tap(t2.tools, x, y);
    t2.tools.down(1, { x: 300, y: 200 }, ALT);
    t2.tools.move(1, { x: 320, y: 260 }, ALT);
    t2.tools.up(1);
    const b = t2.selected()!.path[0];
    expect(b.inX).toBeCloseTo(-2, 2);
    expect(b.outX ?? 0).toBe(0);
  });

  it('Befehlstaste: einen Anker des laufenden Pfads verschieben, Klick ins Leere beendet', () => {
    const t = setup();
    t.tools.setTool('pen');
    for (const [x, y] of [[300, 200], [500, 200], [500, 400]]) tap(t.tools, x, y);
    t.tools.down(1, { x: 500, y: 200 }, CMD);
    t.tools.move(1, { x: 540, y: 200 }, CMD);
    t.tools.up(1);
    expect(t.tools.context()).toEqual({ kind: 'pen', count: 3, into: null });
    tap(t.tools, 700, 700, CMD);
    const s = t.selected()!;
    expect(s).toBeTruthy();
    // der zweite Anker liegt 4 m weiter rechts (Pfad-Koordinaten relativ zur Mitte der Form)
    const xs = s.path.map((a) => a.x + s.x).sort((a, b) => a - b);
    expect(xs.at(-1)).toBeCloseTo(14, 3);
  });

  it('Wahltaste: Klick auf den letzten Anker nimmt den Griff nach vorn weg, Ziehen aus einem Anker zieht Griffe heraus', () => {
    const t = setup();
    t.tools.setTool('pen');
    tap(t.tools, 300, 200);
    t.tools.down(1, { x: 500, y: 200 }, M);
    t.tools.move(1, { x: 540, y: 240 }, M);
    t.tools.up(1);
    tap(t.tools, 500, 200, ALT);
    t.tools.down(1, { x: 300, y: 200 }, ALT);
    t.tools.move(1, { x: 300, y: 260 }, ALT);
    t.tools.up(1);
    tap(t.tools, 400, 400);
    t.tools.key('enter');
    const s = t.selected()!;
    const second = s.path[1];
    expect(second.inX).toBeCloseTo(-4, 2);
    expect(second.outX ?? 0).toBe(0);
    const first = s.path[0];
    expect(first.outY).toBeCloseTo(-6, 2);
    expect(first.inY).toBeCloseTo(6, 2);
  });

  it('Wahltaste auf einem Anker der gewählten Form wechselt Ecke und Rund', () => {
    const t = setup();
    const s = square(t);
    tap(t.tools, 500, 200, ALT);
    const a = s.path.find((p) => Math.abs(p.x + s.x - 10) < 1e-6 && Math.abs(p.y + s.y - 10) < 1e-6)!;
    expect(a.outX || a.outY).toBeTruthy();
  });
});

describe('Mehrfachauswahl von Punkten', () => {
  it('Umschalt nimmt Anker dazu, Ziehen bewegt alle gewählten', () => {
    const t = setup();
    const s = square(t);
    t.tools.setTool('direct');
    tap(t.tools, 300, 200);
    tap(t.tools, 500, 200, SHIFT);
    expect(t.tools.context()).toMatchObject({ kind: 'anchor', count: 2 });
    t.tools.down(1, { x: 500, y: 200 }, M);
    t.tools.move(1, { x: 500, y: 160 }, M);
    t.tools.up(1);
    const top = s.path.map((p) => p.y + s.y).sort((a, b) => b - a);
    expect(top[0]).toBeCloseTo(14, 3);
    expect(top[1]).toBeCloseTo(14, 3);
    expect(top[2]).toBeCloseTo(-10, 3);
  });

  it('Rechteck aus dem Leeren (Direktauswahl) und Lasso wählen Anker; Entf löscht sie, der Umriss behält drei', () => {
    const t = setup();
    const s = square(t);
    t.tools.setTool('direct');
    stroke(t.tools, [[280, 180], [420, 260], [520, 240]]);
    expect(t.tools.context()).toMatchObject({ kind: 'anchor', count: 2 });
    t.tools.setTool('lasso');
    t.tools.setLassoForm('lasso');
    stroke(t.tools, [[280, 380], [320, 380], [330, 420], [280, 420]]);
    expect(t.tools.context()).toMatchObject({ kind: 'lasso', count: 1 });
    stroke(t.tools, [[480, 380], [520, 380], [520, 420], [480, 420]], SHIFT);
    expect(t.tools.context()).toMatchObject({ kind: 'lasso', count: 2 });
    // zwei von vier Ankern des Umrisses löschen ließe zwei übrig: abgelehnt
    t.tools.key('delete');
    expect(s.path.length).toBe(4);
    expect(t.toasts.at(-1)).toMatch(/drei/);
    // einer allein geht
    stroke(t.tools, [[480, 380], [520, 380], [520, 420], [480, 420]]);
    t.tools.key('delete');
    expect(s.path.length).toBe(3);
  });

  it('das Lasso im Rechteck wählt über ganzen Formen hinweg, Ecke/Rund gilt für alle gewählten', () => {
    const t = setup();
    const s = square(t);
    t.tools.setTool('lasso');
    t.tools.setLassoForm('rect');
    stroke(t.tools, [[290, 190], [400, 300], [510, 210]]);
    expect(t.tools.context()).toMatchObject({ kind: 'lasso', form: 'rect', count: 2, smooth: false });
    t.tools.toggleAnchor();
    const topCorners = s.path.filter((p) => p.y + s.y > 9);
    expect(topCorners.every((p) => p.outX || p.outY)).toBe(true);
  });
});

describe('Vereinfachen', () => {
  it('ein Kreis aus vielen Ecken wird eine glatte Form mit wenigen Ankern; ein Rechteck bleibt, wie es ist', async () => {
    const { simplifyShape } = await import('@/zoneeditor/pathTools');
    const { newPlane: np, newShape: ns, rectPath: rp } = await import('@/zone/nodes');
    const nodes: ZoneNode[] = [np([], 0)];
    const many = Array.from({ length: 60 }, (_, k) => ({ x: 5 * Math.cos((k / 60) * 2 * Math.PI), y: 5 * Math.sin((k / 60) * 2 * Math.PI) }));
    const c = ns(nodes, 'p1', many, 0, 0, '#445566');
    const saved = simplifyShape(c, 0.05);
    expect(saved).toBeGreaterThan(50);
    expect(c.path.length).toBeLessThanOrEqual(8);
    const r = ns(nodes, 'p1', rp(4, 2), 0, 0, '#445566');
    expect(simplifyShape(r, 0.05)).toBe(0);
    expect(r.path.length).toBe(4);
  });
});

describe('Kurvenstift und Band', () => {
  it('Kurvenstift: drei Tipps und der erste schließen eine glatte Form; doppelt tippen macht eine Ecke', () => {
    const t = setup();
    t.tools.setTool('curve');
    for (const [x, y] of [[300, 300], [400, 200], [500, 300], [400, 400]]) tap(t.tools, x, y);
    // den zweiten Punkt doppelt antippen: Ecke
    tap(t.tools, 400, 200);
    tap(t.tools, 400, 200);
    tap(t.tools, 300, 300);
    const s = t.selected()!;
    expect(s.path.length).toBe(4);
    const top = s.path.find((p) => p.y + s.y > 9)!;
    expect(top.inX ?? 0).toBe(0);
    expect(s.path.filter((p) => p.outX || p.outY || p.inX || p.inY).length).toBe(3);
  });

  it('Band: an der Oberkante eines Rechtecks nach innen ziehen gibt eine Teilungslinie von Kante zu Kante und eine eigene Fläche', () => {
    const t = setup();
    const s = square(t);
    t.tools.setTool('band');
    t.tools.down(1, { x: 400, y: 200 }, M);
    t.tools.move(1, { x: 400, y: 220 }, M);
    t.tools.move(1, { x: 400, y: 230 }, M);
    t.tools.up(1);
    expect(s.cuts?.length).toBe(1);
    const cut = s.cuts![0].path;
    // drei Meter unter der Oberkante, von der linken bis zur rechten Kante
    expect(Math.min(...cut.map((p) => p.x))).toBeCloseTo(-10, 1);
    expect(Math.max(...cut.map((p) => p.x))).toBeCloseTo(10, 1);
    expect(cut.every((p) => Math.abs(p.y - 7) < 0.05)).toBe(true);
    expect(shapeFaces(s).length).toBe(2);
    expect(t.tools.context()?.kind).toBe('face');
  });

  it('Band an einer Ellipse: am Umriss ein Bogen (nicht ringsum), an einem Loch der ganze Rand', async () => {
    const t = setup();
    const { ellipsePath: ep, newShape: ns } = await import('@/zone/nodes');
    const p = newPlane(t.nodes, 0);
    t.nodes.push(p);
    const e = ns(t.nodes, p.id, ep(10, 6), 0, 0, '#445566');
    t.nodes.push(e);
    t.select(e.id);
    t.tools.setTool('band');
    // rechts außen nach innen ziehen
    t.tools.down(1, { x: 500, y: 300 }, M);
    t.tools.move(1, { x: 480, y: 300 }, M);
    t.tools.up(1);
    expect(e.cuts?.[0]?.closed).toBe(false);
    expect(shapeFaces(e).length).toBe(2);
    // Form mit einem Loch: am Lochrand nach außen ziehen gibt einen Ring um das Loch
    const h = ns(t.nodes, p.id, ep(20, 12), 0, 0, '#445566');
    h.holes = [ep(4, 3)];
    t.nodes.push(h);
    t.select(h.id);
    t.tools.down(1, { x: 440, y: 300 }, M);
    t.tools.move(1, { x: 460, y: 300 }, M);
    t.tools.up(1);
    expect(h.cuts?.[0]?.closed).toBe(true);
    expect(shapeFaces(h).length).toBe(2);
  });
});

describe('Einrasten', () => {
  it('ein neuer Punkt rastet an einem Anker einer anderen Form ein, sonst am Raster', () => {
    const t = setup({ snap: true });
    const a = square(t);
    t.select(null);
    t.tools.setTool('pen');
    // knapp neben der rechten oberen Ecke (500, 200) der ersten Form
    for (const [x, y] of [[506, 196], [700, 200], [700, 400]]) tap(t.tools, x, y);
    t.tools.key('enter');
    const b = t.selected()!;
    expect(b.id).not.toBe(a.id);
    const xs = b.path.map((p) => p.x + b.x);
    const ys = b.path.map((p) => p.y + b.y);
    expect(xs.some((x, i) => Math.abs(x - 10) < 1e-6 && Math.abs(ys[i] - 10) < 1e-6)).toBe(true);

    const g = setup({ grid: 1 });
    g.tools.setTool('pen');
    for (const [x, y] of [[303, 297], [447, 204], [512, 361]]) tap(g.tools, x, y);
    g.tools.key('enter');
    const s = g.selected()!;
    for (const p of s.path) {
      expect(Math.abs(p.x + s.x - Math.round(p.x + s.x))).toBeLessThan(1e-6);
      expect(Math.abs(p.y + s.y - Math.round(p.y + s.y))).toBeLessThan(1e-6);
    }
  });

  it('ein gezogener Anker rastet an der Kante einer anderen Form ein', () => {
    const t = setup({ snap: true });
    const a = square(t);
    t.select(null);
    t.tools.setTool('pen');
    for (const [x, y] of [[600, 250], [700, 250], [700, 350], [600, 350], [601, 251]]) tap(t.tools, x, y);
    const b = t.selected()!;
    t.tools.setTool('direct');
    // linken oberen Anker von b auf die rechte Kante von a ziehen (x = 500), knapp daneben loslassen
    t.tools.down(1, { x: 600, y: 250 }, M);
    t.tools.move(1, { x: 550, y: 255 }, M);
    t.tools.move(1, { x: 505, y: 260 }, M);
    t.tools.up(1);
    const moved = b.path.find((p) => Math.abs(p.x + b.x - 10) < 1e-6);
    expect(moved).toBeTruthy();
    expect(a.path.length).toBe(4);
  });
});
