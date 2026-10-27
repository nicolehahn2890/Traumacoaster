/**
 * Ebenen des Zonen-Editors im Weltrenderer (docs/ZONENEDITOR-PLAN.md, Stufe 1): alle sichtbaren Formen aller Ebenen als
 * ein Mesh (ein Draw Call), Vollton je Form als Eckfarbe, unbeleuchtet wie eine gemalte Fläche; der Nebel der Welt gilt
 * (Luftperspektive). Die Formen einer Ebene liegen in Zeichenreihenfolge je 3 mm vor der Ebene, damit der Tiefenpuffer
 * nicht flackert (Stufe 3 zerlegt sie beim Kompilieren überlappungsfrei). Platzhalter: Vollton statt Füllstapel und
 * Earle-Schichten (Stufe 3 und 5).
 *
 * Die Triangulierung je Form wird zwischengespeichert, solange ihr Pfad dasselbe Objekt bleibt: Verschieben, Skalieren
 * und Tiefe ändern rechnen nur die Lage der Ecken neu, so bleibt das Ziehen im Editor auch mit 30 Ebenen flüssig.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, ShapeUtils, Vector2, type Raycaster } from 'three';
import { faceFill, planeHidden, planesOf, shapeFaces, shapesOf, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import type { Face } from '@/zone/faces';

/** Abstand zweier Formen derselben Ebene in der Tiefe (Meter, zum Betrachter hin) */
const ORDER_STEP = 0.003;

interface Triangulated {
  /** Ecken in Pfad-Koordinaten (x, y abwechselnd) */
  pts: Float32Array;
  /** Dreiecke als Eckennummern */
  index: Uint32Array;
}

/** Triangulierung je Fläche; die Flächen selbst speichert shapeFaces zwischen, solange der Pfad derselbe bleibt */
const cache = new WeakMap<Face, Triangulated>();

/** Feinheit der Glättung: bei großem Maßstab feiner, in Zweierpotenzen, damit Ziehen den Zwischenspeicher trifft */
export function fineness(shape: ZoneShape, plane: ZonePlane): number {
  const s = Math.max(Math.abs(shape.sx), Math.abs(shape.sy)) * Math.abs(plane.scale);
  return Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1e-3, s))));
}

/** Triangulierung einer Fläche in Pfad-Koordinaten (zwischengespeichert) */
export function triangulateFace(face: Face): Triangulated {
  const hit = cache.get(face);
  if (hit) return hit;
  const outline = face.outline.map(([x, y]) => new Vector2(x, y));
  const holes = face.holes.map((h) => h.map(([x, y]) => new Vector2(x, y)));
  let tris: number[][] = [];
  if (outline.length >= 3) {
    try {
      tris = ShapeUtils.triangulateShape(outline, holes);
    } catch {
      tris = [];
    }
  }
  const all = [...outline, ...holes.flat()];
  const pts = new Float32Array(all.length * 2);
  all.forEach((v, i) => {
    pts[i * 2] = v.x;
    pts[i * 2 + 1] = v.y;
  });
  const index = new Uint32Array(tris.length * 3);
  tris.forEach((tri, i) => index.set(tri, i * 3));
  const out = { pts, index };
  cache.set(face, out);
  return out;
}

export interface PlaneBuildOptions {
  /** Ebene zeichnen? (ausgeblendet, isoliert); ohne Angabe alle außer den ausgeblendeten */
  showPlane?: (plane: ZonePlane) => boolean;
}

export class PlaneLayer {
  readonly group = new Group();
  private mesh: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private readonly material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: true });
  /** Form und Fläche je Dreieck (Index in owners) */
  private triOwner = new Int32Array(0);
  private owners: Array<{ id: string; face: number }> = [];
  /** Zahlen des letzten Aufbaus (Leistungsanzeige) */
  stats = { planes: 0, shapes: 0, triangles: 0 };

  constructor() {
    this.group.name = 'ebenen';
  }

  /** alle sichtbaren Formen neu zusammensetzen */
  build(nodes: readonly ZoneNode[], opts: PlaneBuildOptions = {}): void {
    const show = opts.showPlane ?? ((p: ZonePlane) => !planeHidden(nodes, p));
    const parts: Array<{ shape: ZoneShape; plane: ZonePlane; rank: number; tri: Triangulated; fill: string; face: number }> = [];
    let verts = 0;
    let tris = 0;
    let planeCount = 0;
    for (const plane of planesOf(nodes)) {
      if (!show(plane)) continue;
      planeCount++;
      shapesOf(nodes, plane.id).forEach((shape, rank) => {
        if (shape.hidden) return;
        shapeFaces(shape, fineness(shape, plane)).forEach((face, fi) => {
          // eine Fläche ohne Füllung ist ein Loch: nichts zu zeichnen
          const fill = faceFill(shape, face);
          if (fill === null) return;
          const tri = triangulateFace(face);
          if (!tri.index.length) return;
          parts.push({ shape, plane, rank, tri, fill, face: fi });
          verts += tri.pts.length / 2;
          tris += tri.index.length / 3;
        });
      });
    }
    this.stats = { planes: planeCount, shapes: new Set(parts.map((x) => x.shape.id)).size, triangles: tris };
    if (!parts.length) {
      this.clear();
      return;
    }
    const pos = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    const index = new Uint32Array(tris * 3);
    const triOwner = new Int32Array(tris);
    const owners: Array<{ id: string; face: number }> = [];
    const c = new Color();
    let v = 0;
    let t = 0;
    for (const { shape, plane, rank, tri, fill, face } of parts) {
      c.set(fill);
      const owner = owners.push({ id: shape.id, face }) - 1;
      const Z = -plane.z + rank * ORDER_STEP;
      const n = tri.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const px = shape.x + shape.sx * tri.pts[i * 2];
        const py = shape.y + shape.sy * tri.pts[i * 2 + 1];
        const k = (v + i) * 3;
        pos[k] = plane.x + plane.scale * px;
        pos[k + 1] = plane.y + plane.scale * py;
        pos[k + 2] = Z;
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
      for (let i = 0; i < tri.index.length; i++) index[t * 3 + i] = tri.index[i] + v;
      triOwner.fill(owner, t, t + tri.index.length / 3);
      v += n;
      t += tri.index.length / 3;
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setAttribute('color', new BufferAttribute(col, 3));
    geom.setIndex(new BufferAttribute(index, 1));
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geom;
    } else {
      this.mesh = new Mesh(geom, this.material);
      this.mesh.name = 'ebenen-formen';
      this.mesh.frustumCulled = false;
      this.group.add(this.mesh);
    }
    this.triOwner = triOwner;
    this.owners = owners;
  }

  /** vorderste getroffene Form (und ihre Fläche) unter dem Strahl, die accept annimmt (gesperrte überspringt der Editor) */
  pick(raycaster: Raycaster, accept: (id: string) => boolean = () => true): { id: string; face: number; distance: number } | null {
    if (!this.mesh) return null;
    const hits = raycaster.intersectObject(this.mesh, false);
    for (const h of hits) {
      if (h.faceIndex === undefined || h.faceIndex === null) continue;
      const o = this.owners[this.triOwner[h.faceIndex]];
      if (o && accept(o.id)) return { id: o.id, face: o.face, distance: h.distance };
    }
    return null;
  }

  clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.triOwner = new Int32Array(0);
    this.owners = [];
  }
}
