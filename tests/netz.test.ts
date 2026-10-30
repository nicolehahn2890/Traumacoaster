/**
 * Netz um ein Bild wie in Spine (src/zone/mesh.ts) und proportionales Bearbeiten wie in Blender (src/zone/proportional.ts),
 * Florian 30.10.2026
 */
import { describe, expect, it } from 'vitest';
import { cloneNodes, ellipsePath, flipShape, newPlane, newShape, parseNodes, planesOf, rectPath, serializeNodes, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { rotateShape } from '@/zone/shapeOps';
import { PlaneLayer } from '@/world/planeMesh';
import type { BufferGeometry, Mesh } from 'three';
import { addMeshPoint, autoMesh, barycentric, cloneMesh, inPoly, meshDeformed, meshEdges, meshFrom, meshPath, meshRestFace, meshTriangles, meshValid, parseMesh, refillMesh, removeMeshPoints, restFromDeformed, resetDeform, serializeMesh, triangulate } from '@/zone/mesh';
import { applyXform, applyXformVector, falloff, FALLOFFS, stepRadius, weights, xformFrom, xformLabel, type Proportional } from '@/zone/proportional';
import type { Poly } from '@/zone/path';

const orient = (a: readonly number[], b: readonly number[], c: readonly number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (poly: Poly) => Math.abs(poly.reduce((s, [x, y], i) => s + x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y, 0) / 2);

/** Prüft eine Triangulierung: alle Dreiecke gegen den Uhrzeigersinn, Schwerpunkte in der Hülle, Fläche gleich, Delaunay innen */
function checkTris(P: Poly, hull: number, tris: number[]): void {
  const hullPoly = P.slice(0, hull);
  let sum = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [P[tris[t]], P[tris[t + 1]], P[tris[t + 2]]];
    expect(orient(a, b, c)).toBeGreaterThan(0);
    sum += orient(a, b, c) / 2;
    expect(inPoly(hullPoly, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)).toBe(true);
  }
  expect(sum).toBeCloseTo(area(hullPoly), 6);
  // Delaunay: kein Gegenpunkt über einer inneren Kante liegt deutlich im Umkreis
  const hullEdge = (a: number, b: number) => a < hull && b < hull && (Math.abs(a - b) === 1 || Math.abs(a - b) === hull - 1);
  const byEdge = new Map<string, number[]>();
  for (let t = 0; t < tris.length; t += 3)
    for (let q = 0; q < 3; q++) {
      const a = tris[t + q];
      const b = tris[t + ((q + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      byEdge.set(key, [...(byEdge.get(key) ?? []), t]);
    }
  for (const [key, ts] of byEdge) {
    const [a, b] = key.split(',').map(Number);
    if (ts.length !== 2 || hullEdge(a, b)) continue;
    const [t1, t2] = ts;
    const t1v = [tris[t1], tris[t1 + 1], tris[t1 + 2]];
    const k = t1v.findIndex((x, q) => (x === a || x === b) && (t1v[(q + 1) % 3] === a || t1v[(q + 1) % 3] === b));
    const [ea, eb, c] = [t1v[k], t1v[(k + 1) % 3], t1v[(k + 2) % 3]];
    const d = [tris[t2], tris[t2 + 1], tris[t2 + 2]].find((x) => x !== a && x !== b)!;
    // Umkreis von (a, b, c) gegen den Uhrzeigersinn
    const [A, B, C] = t1v.map((i) => P[i]);
    const D = P[d];
    const m = [
      [A[0] - D[0], A[1] - D[1], (A[0] - D[0]) ** 2 + (A[1] - D[1]) ** 2],
      [B[0] - D[0], B[1] - D[1], (B[0] - D[0]) ** 2 + (B[1] - D[1]) ** 2],
      [C[0] - D[0], C[1] - D[1], (C[0] - D[0]) ** 2 + (C[1] - D[1]) ** 2],
    ];
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    // nur prüfen, wenn das Viereck konvex ist (sonst lässt sich nicht umklappen)
    const convex = orient(P[ea], P[d], P[c]) > 1e-9 && orient(P[d], P[eb], P[c]) > 1e-9;
    if (convex) expect(det).toBeLessThan(1e-6);
  }
}

const square: Poly = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];
const lShape: Poly = [
  [0, 0],
  [6, 0],
  [6, 2],
  [2, 2],
  [2, 6],
  [0, 6],
];

describe('Triangulierung (eingeschränkt Delaunay)', () => {
  it('Quadrat mit einem Punkt innen: vier Dreiecke um ihn, Fläche voll', () => {
    const P: Poly = [...square, [1.5, 2.2]];
    const tris = triangulate(P, 4);
    expect(tris.length / 3).toBe(4);
    expect(tris.filter((i) => i === 4).length).toBe(4);
    checkTris(P, 4, tris);
  });

  it('L-Form mit Raster: kein Dreieck außerhalb, Hüllkanten bleiben, innen Delaunay', () => {
    const inner: Poly = [];
    for (let x = 0.5; x < 6; x += 1) for (let y = 0.5; y < 6; y += 1) if (inPoly(lShape, x, y)) inner.push([x, y]);
    const P = [...lShape, ...inner];
    const tris = triangulate(P, lShape.length);
    checkTris(P, lShape.length, tris);
    // jeder Punkt hängt an einem Dreieck
    const used = new Set(tris);
    expect(used.size).toBe(P.length);
  });

  it('Punkte genau auf einer Kante (Rasterzeile) teilen beide Dreiecke, nichts bleibt flach oder übrig', () => {
    const P: Poly = [...square, [1, 2], [2, 2], [3, 2], [2, 1], [2, 3]];
    const tris = triangulate(P, 4);
    checkTris(P, 4, tris);
    expect(new Set(tris).size).toBe(P.length);
  });

  it('Hülle im Uhrzeigersinn geht auch; Punkte außerhalb bleiben ohne Dreieck', () => {
    const cw = [...square].reverse() as Poly;
    const P: Poly = [...cw, [2, 2], [9, 9]];
    const tris = triangulate(P, 4);
    expect(tris.includes(5)).toBe(false);
    expect(tris.includes(4)).toBe(true);
  });

  it('Schwerpunktskoordinaten summieren sich zu 1', () => {
    const l = barycentric([1, 1], [0, 0], [4, 0], [0, 4]);
    expect(l[0] + l[1] + l[2]).toBeCloseTo(1, 12);
    expect(l[1]).toBeCloseTo(0.25, 12);
  });
});

describe('Netz anlegen und ändern', () => {
  it('automatisch aus einer Ellipse: gültig, Hülle auf dem Umriss, innen ein Raster; Dichte zählt', () => {
    const path = ellipsePath(10, 6);
    const few = autoMesh(path, 1, 1, 'few')!;
    const many = autoMesh(path, 1, 1, 'many')!;
    expect(meshValid(few)).toBe(true);
    expect(meshValid(many)).toBe(true);
    expect(many.pts.length).toBeGreaterThan(few.pts.length);
    for (const p of few.pts.slice(0, few.hull)) expect(Math.abs((p.rx / 10) ** 2 + (p.ry / 6) ** 2 - 1)).toBeLessThan(0.05);
    expect(few.pts.length - few.hull).toBeGreaterThan(2);
    expect(meshDeformed(few)).toBe(false);
  });

  it('Form mit Maßstab: Abstand der Punkte in Metern der Ebene', () => {
    const a = autoMesh(ellipsePath(10, 6), 1, 1, 'mid')!;
    const b = autoMesh(ellipsePath(10, 6), 3, 3, 'mid')!;
    // gleiche Form größer: gleich viele innere Punkte (Abstand wächst mit)
    expect(Math.abs(b.pts.length - b.hull - (a.pts.length - a.hull))).toBeLessThanOrEqual(2);
  });

  it('neuer Punkt innen übernimmt die Verzerrung an seiner Stelle, das Bild bleibt', () => {
    const m = meshFrom(square, [[2, 2]]);
    for (const p of m.pts) {
      p.x = p.rx * 2 + 1;
      p.y = p.ry + 0.5;
    }
    const i = addMeshPoint(m, 1, 1);
    expect(i).toBe(5);
    expect(m.pts[i].x).toBeCloseTo(3, 9);
    expect(m.pts[i].y).toBeCloseTo(1.5, 9);
    expect(meshValid(m)).toBe(true);
    expect(addMeshPoint(m, 9, 9)).toBe(-1);
  });

  it('Punkt auf der Hülle: zwischen die Nachbarn, Hülle wächst, Form bleibt gleich', () => {
    const m = meshFrom(square, [[2, 2]]);
    const i = addMeshPoint(m, 2, 0, { after: 0, t: 0.5 });
    expect(i).toBe(1);
    expect(m.hull).toBe(5);
    expect(m.pts[1]).toMatchObject({ rx: 2, ry: 0, x: 2, y: 0 });
    expect(meshValid(m)).toBe(true);
    expect(meshPath(m).length).toBe(5);
  });

  it('Punkte entfernen: die Hülle behält mindestens drei', () => {
    const m = meshFrom(square, [[2, 2]]);
    expect(removeMeshPoints(m, new Set([4]))).toBe(true);
    expect(m.pts.length).toBe(4);
    expect(m.tris.length).toBe(6);
    expect(removeMeshPoints(m, new Set([0, 1]))).toBe(false);
    expect(removeMeshPoints(m, new Set([0]))).toBe(true);
    expect(m.hull).toBe(3);
  });

  it('kommt unverändert aus der Datei zurück; kaputte Dreiecke werden neu gerechnet', () => {
    const m = autoMesh(ellipsePath(8, 4), 1, 1, 'few')!;
    m.pts[m.hull].x += 0.5;
    const back = parseMesh(JSON.parse(JSON.stringify(serializeMesh(m))))!;
    expect(back.hull).toBe(m.hull);
    expect(back.tris).toEqual(m.tris);
    back.pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(m.pts[i].x, 3);
      expect(p.rx).toBeCloseTo(m.pts[i].rx, 3);
    });
    const broken = parseMesh({ ...serializeMesh(m), t: '0,1,999' })!;
    expect(broken.tris.length).toBeGreaterThan(0);
    expect(meshValid(broken)).toBe(true);
    expect(parseMesh({ hull: 2, v: '0,0,0,0 1,0,1,0' })).toBeUndefined();
    expect(parseMesh({ hull: 3, v: '0,0,0,0 1,x,1,0 0,1,0,1' })).toBeUndefined();
  });

  it('verzerrte Stelle zurück in die Lage ohne Verzerrung', () => {
    const m = meshFrom(square, [[2, 2]]);
    for (const p of m.pts) {
      p.x = p.rx * 1.5 + 2;
      p.y = p.ry * 0.5 - 1;
    }
    const r = restFromDeformed(m, 1 * 1.5 + 2, 3 * 0.5 - 1)!;
    expect(r[0]).toBeCloseTo(1, 9);
    expect(r[1]).toBeCloseTo(3, 9);
    expect(restFromDeformed(m, -50, 0)).toBeNull();
  });

  it('Fläche ohne Verzerrung bleibt dasselbe Objekt, solange die Hülle ohne Verzerrung bleibt', () => {
    const m = meshFrom(square, [[2, 2]]);
    const a = meshRestFace(m);
    m.pts[4].x += 1;
    m.pts[0].y -= 1;
    expect(meshRestFace(cloneMesh(m))).toBe(a);
    m.pts[0].rx -= 0.5;
    expect(meshRestFace(m)).not.toBe(a);
  });

  it('Renderer bekommt verzerrte Ecken und Lagen ohne Verzerrung; Zurücksetzen nimmt die Verzerrung', () => {
    const m = meshFrom(square, [[2, 2]]);
    m.pts[4].x = 3;
    const t = meshTriangles(m);
    expect(t.pts[8]).toBe(3);
    expect(t.local[8]).toBe(2);
    expect(meshTriangles(m, true).pts[8]).toBe(2);
    expect(meshEdges(m).length).toBe(8);
    expect(meshDeformed(m)).toBe(true);
    resetDeform(m);
    expect(meshDeformed(m)).toBe(false);
  });

  it('innen neu füllen: Hülle bleibt, neue Punkte übernehmen die Verzerrung', () => {
    const m = autoMesh(ellipsePath(10, 6), 1, 1, 'few')!;
    for (const p of m.pts) p.x = p.rx + 2;
    const hull = m.pts.slice(0, m.hull).map((p) => ({ ...p }));
    refillMesh(m, 1, 1, 'many');
    expect(m.pts.slice(0, m.hull)).toEqual(hull);
    for (const p of m.pts) expect(p.x - p.rx).toBeCloseTo(2, 6);
    expect(meshValid(m)).toBe(true);
  });
});

describe('Proportionales Bearbeiten (Blender)', () => {
  it('Abfallkurven: 1 an der Auswahl, 0 am Rand, dazwischen steigend', () => {
    for (const k of FALLOFFS) {
      expect(falloff(k, 1)).toBeCloseTo(1, 9);
      if (k !== 'constant') expect(falloff(k, 0)).toBeCloseTo(0, 9);
      let last = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const v = falloff(k, t);
        expect(v).toBeGreaterThanOrEqual(last - 1e-12);
        last = v;
      }
    }
    expect(falloff('smooth', 0.5)).toBeCloseTo(0.5, 9);
    expect(falloff('linear', 0.25)).toBeCloseTo(0.25, 9);
  });

  it('Gewichte: gewählt 1, im Kreis nach Abstand, außerhalb 0; ohne Kreis nur die Auswahl', () => {
    const pts = [0, 0, 1, 0, 2, 0, 5, 0];
    const prop: Proportional = { on: true, radius: 2, falloff: 'linear' };
    const w = weights(pts, new Set([0]), prop);
    expect([...w]).toEqual([1, 0.5, 0, 0]);
    expect([...weights(pts, new Set([0]), { ...prop, on: false })]).toEqual([1, 0, 0, 0]);
    // Abstand zum nächsten gewählten Punkt
    expect(weights(pts, new Set([0, 3]), { ...prop, radius: 4 })[2]).toBeCloseTo(0.5, 6);
  });

  it('Verschieben, Drehen, Skalieren mit Gewicht', () => {
    expect(applyXform(1, 1, 0.5, { kind: 'grab', dx: 2, dy: -2 })).toEqual([2, 0]);
    const [x, y] = applyXform(2, 0, 1, { kind: 'rotate', px: 1, py: 0, angle: Math.PI / 2 });
    expect(x).toBeCloseTo(1, 9);
    expect(y).toBeCloseTo(1, 9);
    expect(applyXform(3, 1, 0.5, { kind: 'scale', px: 1, py: 1, sx: 3, sy: 1 })).toEqual([5, 1]);
    expect(applyXform(3, 1, 0, { kind: 'scale', px: 1, py: 1, sx: 3, sy: 1 })).toEqual([3, 1]);
    // Griffe drehen und strecken mit, Verschieben lässt sie
    expect(applyXformVector(1, 0, 1, { kind: 'grab', dx: 5, dy: 5 })).toEqual([1, 0]);
    const [vx, vy] = applyXformVector(1, 0, 1, { kind: 'rotate', px: 9, py: 9, angle: Math.PI });
    expect(vx).toBeCloseTo(-1, 9);
    expect(vy).toBeCloseTo(0, 9);
  });

  it('Bewegung aus Zeigerlagen, mit Achse; Radius per Mausrad', () => {
    const r = xformFrom('rotate', { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 });
    expect(r.kind === 'rotate' && r.angle).toBeCloseTo(Math.PI / 2, 9);
    const s = xformFrom('scale', { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }, 'x');
    expect(s).toEqual({ kind: 'scale', px: 0, py: 0, sx: 3, sy: 1 });
    expect(xformFrom('grab', { x: 1, y: 1 }, { x: 4, y: 5 }, { x: 0, y: 0 }, 'y')).toEqual({ kind: 'grab', dx: 0, dy: 4 });
    expect(stepRadius(10, 1)).toBeCloseTo(11, 9);
    expect(stepRadius(11, -1)).toBeCloseTo(10, 9);
    expect(stepRadius(0.02, -1)).toBe(0.02);
    expect(xformLabel(r, { on: true, radius: 3, falloff: 'smooth' }, null)).toContain('Einfluss 3,0 m');
  });
});

describe('Netz in Form und Renderer', () => {
  /** Rechteck 20 × 10 m bei (2, 1) mit Bild, Netz aus den Ecken und einem Punkt in der Mitte, der verzerrt ist */
  function meshScene(): { nodes: ZoneNode[]; shape: ZoneShape } {
    const nodes: ZoneNode[] = [newPlane([], 8)];
    const plane = planesOf(nodes)[0];
    const shape = newShape(nodes, plane.id, rectPath(20, 10), 2, 1, '#557744');
    nodes.push(shape);
    shape.fills = [{ type: 'image', src: '/zones/probe/bild-a.png', ox: -10, oy: -5, ux: 20, uy: 0, vx: 0, vy: 10, blend: 'normal', opacity: 1 }];
    shape.mesh = meshFrom(
      shape.path.map((p): [number, number] => [p.x, p.y]),
      [[0, 0]],
    );
    shape.mesh.pts[4].x = 3;
    shape.mesh.pts[4].y = 2;
    return { nodes, shape };
  }

  it('kommt mit der Form aus der Datei zurück, der Umriss ist die verzerrte Hülle; die Kopie ist eigen', () => {
    const { nodes, shape } = meshScene();
    shape.mesh!.pts[0].x = -12;
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes)))).find((n) => n.id === shape.id) as ZoneShape;
    expect(back.mesh!.pts[4]).toEqual({ rx: 0, ry: 0, x: 3, y: 2 });
    expect(back.path[0]).toEqual({ x: -12, y: -5 });
    const copy = cloneNodes([shape])[0] as ZoneShape;
    copy.mesh!.pts[4].x = 9;
    expect(shape.mesh!.pts[4].x).toBe(3);
  });

  it('Spiegeln und Drehen nehmen beide Lagen mit', () => {
    const { shape } = meshScene();
    flipShape(shape, 'x');
    expect(shape.mesh!.pts[4]).toMatchObject({ rx: 0, x: -3, y: 2 });
    expect(shape.path.map((p) => p.x).sort((a, b) => a - b)).toEqual([-10, -10, 10, 10]);
    const orig = cloneNodes([shape])[0] as ZoneShape;
    rotateShape(shape, orig, { x: orig.x, y: orig.y }, Math.PI / 2);
    expect(shape.mesh!.pts[4].x).toBeCloseTo(-2, 6);
    expect(shape.mesh!.pts[4].y).toBeCloseTo(-3, 6);
    expect(shape.path[0].x).toBeCloseTo(shape.mesh!.pts[0].x, 3);
  });

  it('Renderer: Ecken an der verzerrten Lage, gemalt in der Lage ohne Verzerrung; Bearbeiten zeichnet ohne Verzerrung', () => {
    const { nodes, shape } = meshScene();
    const layer = new PlaneLayer();
    layer.build(nodes);
    const geom = () => (layer.group.children.find((c) => c.name.startsWith('ebenen-formen')) as Mesh<BufferGeometry>).geometry;
    const pos = geom().getAttribute('position');
    const local = geom().getAttribute('aLocal');
    expect(pos.count).toBe(5);
    expect(geom().getIndex()!.count).toBe(12);
    expect([pos.getX(4), pos.getY(4)]).toEqual([5, 3]);
    expect([local.getX(4), local.getY(4)]).toEqual([0, 0]);
    layer.restMeshes = new Set([shape.id]);
    layer.build(nodes);
    expect([geom().getAttribute('position').getX(4), geom().getAttribute('position').getY(4)]).toEqual([2, 1]);
  });
});
