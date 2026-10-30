/**
 * Bewegen wie in Blender (G, R, S mit Einflusskreis) an Ankern der Direktauswahl und an Punkten des Netz-Werkzeugs
 * (src/zoneeditor/xform.ts, pathTools.ts, meshTool.ts), Florian 30.10.2026
 */
import { describe, expect, it } from 'vitest';
import { PathTools, type PathToolHost } from '@/zoneeditor/pathTools';
import { MeshTool, type MeshToolHost } from '@/zoneeditor/meshTool';
import { findShape, newPlane, newShape, rectPath, shapeFaces, syncMesh, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { faceAt } from '@/zone/faces';
import { meshFrom, meshValid } from '@/zone/mesh';
import { targetPolys } from '@/zone/template';
import type { Proportional } from '@/zone/proportional';

/** Bild = Ebene mal 10 Pixel je Meter, y nach unten; Ursprung der Ebene in der Bildmitte (400, 300) */
const toScreen = (q: { x: number; y: number }) => ({ x: 400 + q.x * 10, y: 300 - q.y * 10 });
const toPlane = (p: { x: number; y: number }) => ({ x: (p.x - 400) / 10, y: (300 - p.y) / 10 });
const M = { cmd: false, alt: false, shift: false };

/** eine Ebene mit einem Rechteck 20 × 10 m um (0, 0), gewählt */
function scene(): { nodes: ZoneNode[]; shape: ZoneShape; selection: string[] } {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  const plane = nodes[0] as ZonePlane;
  const shape = newShape(nodes, plane.id, rectPath(20, 10), 0, 0, '#557744');
  nodes.push(shape);
  return { nodes, shape, selection: [shape.id] };
}

const pick = (nodes: ZoneNode[]) => (p: { x: number; y: number }) => {
  const q = toPlane(p);
  for (const s of [...nodes].reverse()) {
    if (s.kind !== 'shape') continue;
    const f = faceAt(shapeFaces(s), (q.x - s.x) / s.sx, (q.y - s.y) / s.sy);
    if (f >= 0) return { id: s.id, face: f };
  }
  return null;
};

function pathTools(nodes: ZoneNode[], selection: string[]): PathTools {
  const host: PathToolHost = {
    nodes: () => nodes,
    activePlane: () => nodes.find((n): n is ZonePlane => n.kind === 'plane'),
    selectedShapes: () => selection.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s),
    setSelection: () => {},
    regionPlanes: () => nodes.filter((n): n is ZonePlane => n.kind === 'plane'),
    planePoint: (_plane, p) => toPlane(p),
    screenOf: (_plane, q) => toScreen(q),
    pick: pick(nodes),
    begin: () => {},
    commit: () => {},
    cancel: () => {},
    changed: () => {},
    redraw: () => {},
    toast: () => {},
    ensurePlane: () => nodes[0] as ZonePlane,
    addShape: () => {},
    fillFor: () => '#000000',
    hitRadius: () => 15,
    snapping: () => false,
    gridStep: () => null,
    visible: () => true,
    propDrag: () => false,
  };
  return new PathTools(host);
}

function meshTool(nodes: ZoneNode[], selection: string[], toasts: string[] = []): MeshTool {
  const host: MeshToolHost = {
    nodes: () => nodes,
    selectedShapes: () => selection.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s),
    setSelection: () => {},
    planePoint: (_plane, p) => toPlane(p),
    screenOf: (_plane, q) => toScreen(q),
    pick: pick(nodes),
    begin: () => {},
    commit: () => {},
    redraw: () => {},
    toast: (m) => toasts.push(m),
    hitRadius: () => 8,
    setRest: () => {},
    grab: () => {},
  };
  const t = new MeshTool(host);
  t.setActive(true);
  return t;
}

const linear = (radius: number): Proportional => ({ on: true, radius, falloff: 'linear' });

describe('Anker bewegen (Direktauswahl)', () => {
  it('G mit Einflusskreis: der gewählte Anker ganz, die Nachbarn nach Abstand, ferne nicht', () => {
    const { nodes, shape, selection } = scene();
    const tools = pathTools(nodes, selection);
    // Anker rechts oben (10, 5) antippen
    tools.down(1, toScreen({ x: 10, y: 5 }), M);
    tools.up(1);
    const t = tools.xformTarget()!;
    expect(t.pivot).toEqual({ x: 10, y: 5 });
    t.apply({ kind: 'grab', dx: 2, dy: 0 }, linear(12));
    expect(shape.path[2]).toMatchObject({ x: 12, y: 5 });
    // (10, −5) ist 10 m weg: 1 − 10/12 = 1/6 des Wegs
    expect(shape.path[1].x).toBeCloseTo(10 + 2 / 6, 3);
    // (−10, 5) ist 20 m weg: bleibt
    expect(shape.path[3]).toMatchObject({ x: -10, y: 5 });
    // ohne Kreis: nur der gewählte; immer vom Anfang aus gerechnet
    t.apply({ kind: 'grab', dx: 1, dy: 1 }, null);
    expect(shape.path[2]).toMatchObject({ x: 11, y: 6 });
    expect(shape.path[1]).toMatchObject({ x: 10, y: -5 });
  });

  it('R dreht um die Mitte der Auswahl, Griffe drehen mit', () => {
    const { nodes, shape, selection } = scene();
    shape.path[2] = { x: 10, y: 5, inX: 0, inY: -2, outX: -2, outY: 0 };
    const tools = pathTools(nodes, selection);
    tools.down(1, toScreen({ x: 10, y: 5 }), M);
    tools.up(1);
    tools.down(1, toScreen({ x: 10, y: -5 }), { ...M, shift: true });
    tools.up(1);
    const t = tools.xformTarget()!;
    expect(t.pivot).toEqual({ x: 10, y: 0 });
    t.apply({ kind: 'rotate', px: 10, py: 0, angle: Math.PI / 2 }, null);
    expect(shape.path[2].x).toBeCloseTo(5, 3);
    expect(shape.path[2].y).toBeCloseTo(0, 3);
    expect(shape.path[1].x).toBeCloseTo(15, 3);
    expect(shape.path[2].outX).toBeCloseTo(0, 3);
    expect(shape.path[2].outY).toBeCloseTo(-2, 3);
    expect(shape.path[2].inX).toBeCloseTo(2, 3);
  });

  it('ohne gewählte Anker gibt es nichts zu bewegen', () => {
    const { nodes, selection } = scene();
    expect(pathTools(nodes, selection).xformTarget()).toBeNull();
  });
});

describe('Netzpunkte bewegen (Netz-Werkzeug)', () => {
  function meshScene() {
    const s = scene();
    s.shape.mesh = meshFrom(
      s.shape.path.map((p): [number, number] => [p.x, p.y]),
      [
        [0, 0],
        [5, 0],
      ],
    );
    return s;
  }

  it('Verformen: der Punkt wandert, seine Lage im Bild bleibt; der Umriss ist die verzerrte Hülle', () => {
    const { nodes, shape, selection } = meshScene();
    const tool = meshTool(nodes, selection);
    tool.down(1, toScreen({ x: 10, y: 5 }), M);
    const t = tool.xformTarget()!;
    t.apply({ kind: 'grab', dx: 1, dy: 2 }, null);
    expect(shape.mesh!.pts[2]).toMatchObject({ rx: 10, ry: 5, x: 11, y: 7 });
    expect(shape.path[2]).toEqual({ x: 11, y: 7 });
    expect(t.check?.() ?? null).toBeNull();
  });

  it('Verformen mit Einflusskreis: innere Punkte gehen nach Abstand mit', () => {
    const { nodes, shape, selection } = meshScene();
    const tool = meshTool(nodes, selection);
    tool.down(1, toScreen({ x: 5, y: 0 }), M);
    tool.xformTarget()!.apply({ kind: 'grab', dx: 0, dy: 3 }, linear(10));
    expect(shape.mesh!.pts[5].y).toBeCloseTo(3, 6);
    // (0, 0) ist 5 m weg: die Hälfte
    expect(shape.mesh!.pts[4].y).toBeCloseTo(1.5, 6);
    expect(shape.mesh!.pts[4].ry).toBe(0);
  });

  it('Bearbeiten: der Punkt sitzt woanders im Bild, die Verzerrung bleibt; über die Hülle hinaus geht nicht', () => {
    const { nodes, shape, selection } = meshScene();
    shape.mesh!.pts[4].x = 0.5;
    const tool = meshTool(nodes, selection);
    tool.setMode('edit');
    tool.down(1, toScreen({ x: 0, y: 0 }), M);
    const t = tool.xformTarget()!;
    t.apply({ kind: 'grab', dx: -2, dy: 1 }, null);
    expect(shape.mesh!.pts[4]).toMatchObject({ rx: -2, ry: 1, x: -1.5, y: 1 });
    expect(meshValid(shape.mesh!)).toBe(true);
    t.apply({ kind: 'grab', dx: -30, dy: 0 }, null);
    expect(t.check?.()).toMatch(/überschnitte/);
  });

  it('Bearbeiten: Tippen ins Netz setzt einen Punkt, auf die Hülle einen Hüllpunkt; Wahltaste löscht', () => {
    const { nodes, shape, selection } = meshScene();
    const tool = meshTool(nodes, selection);
    tool.setMode('edit');
    tool.down(1, toScreen({ x: -5, y: 2 }), M);
    tool.up(1, toScreen({ x: -5, y: 2 }));
    expect(shape.mesh!.pts.length).toBe(7);
    tool.down(1, toScreen({ x: 0, y: 5 }), M);
    expect(shape.mesh!.hull).toBe(5);
    expect(shape.path.length).toBe(5);
    tool.down(1, toScreen({ x: -5, y: 2 }), { ...M, alt: true });
    expect(shape.mesh!.pts.length).toBe(7);
    expect(meshValid(shape.mesh!)).toBe(true);
  });

  it('Netz zeichnen: Hüllpunkte tippen, auf den ersten schließt; eine kreuzende Hülle geht nicht', () => {
    const { nodes, shape, selection } = scene();
    const toasts: string[] = [];
    const tool = meshTool(nodes, selection, toasts);
    tool.startDraw();
    for (const q of [
      { x: -8, y: -4 },
      { x: 8, y: -4 },
      { x: 8, y: 4 },
      { x: -8, y: 4 },
      { x: -8, y: -4 },
    ])
      tool.down(1, toScreen(q), M);
    expect(shape.mesh!.hull).toBe(4);
    expect(shape.path[0]).toEqual({ x: -8, y: -4 });
    expect(tool.mode).toBe('edit');
    const s2 = scene();
    const tool2 = meshTool(s2.nodes, s2.selection, toasts);
    tool2.startDraw();
    for (const q of [
      { x: -8, y: -4 },
      { x: 8, y: 4 },
      { x: 8, y: -4 },
      { x: -8, y: 4 },
    ])
      tool2.down(1, toScreen(q), M);
    tool2.finishDraw();
    expect(s2.shape.mesh).toBeUndefined();
    expect(toasts.at(-1)).toMatch(/kreuzt/);
  });
});

describe('Netzform mit anderen Werkzeugen', () => {
  it('Umriss gleich lang: die verzerrte Hülle folgt; anders lang: das Netz fällt weg', () => {
    const { shape } = scene();
    shape.mesh = meshFrom(shape.path.map((p): [number, number] => [p.x, p.y]));
    shape.path = shape.path.map((p, i) => (i === 0 ? { x: -12, y: -6, outX: 1, outY: 0 } : p));
    expect(syncMesh(shape)).toBe(true);
    expect(shape.mesh!.pts[0]).toMatchObject({ rx: -10, ry: -5, x: -12, y: -6 });
    expect(shape.path[0]).toEqual({ x: -12, y: -6 });
    expect(syncMesh(shape)).toBe(false);
    shape.path = [...shape.path, { x: 0, y: 8 }];
    expect(syncMesh(shape)).toBe(true);
    expect(shape.mesh).toBeUndefined();
  });

  it('Malvorlage einer Netzform: der Umriss ohne Verzerrung (dort wird gemalt)', () => {
    const { shape } = scene();
    shape.mesh = meshFrom(shape.path.map((p): [number, number] => [p.x, p.y]));
    shape.mesh.pts[2].x = 14;
    shape.path = shape.path.map((p, i) => (i === 2 ? { x: 14, y: 5 } : p));
    const tp = targetPolys(shape)!;
    expect(Math.max(...tp.outline.map(([x]) => x))).toBe(10);
  });
});
