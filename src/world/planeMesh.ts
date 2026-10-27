/**
 * Ebenen des Zonen-Editors im Weltrenderer (docs/ZONENEDITOR-PLAN.md, Stufe 1 und 3): alle sichtbaren Formen aller Ebenen
 * mit **einem Ebenen-Material** (Plan 5.3), unbeleuchtet wie eine gemalte Fläche; der Nebel der Welt gilt
 * (Luftperspektive). Undurchsichtige Flächen sind ein Mesh (ein Draw Call), Flächen, die durchsichtig werden können
 * (Deckkraft, Deckkraftverlauf), ein zweites, von hinten nach vorn sortiert. Die Formen einer Ebene liegen in
 * Zeichenreihenfolge je 3 mm vor der Ebene, damit der Tiefenpuffer nicht flackert.
 *
 * Füllstapel (Stufe 3, `src/zone/paint.ts`): Jede Fläche trägt in einer Ecken-Eigenschaft ihre Zeile in der Stil-Datentextur
 * (Schichten mit Art, Mischmodus, Deckkraft, Farbe oder Verlaufsgriffen) und die Zeile ihrer Ebene (Ebenenstapel); die
 * Verläufe liegen als Farbbänder in einer zweiten Textur. Der Shader rechnet die Schichten wie `evalLayers` (sRGB,
 * W3C-Mischmodi), wandelt dann nach linear und gibt sie dem Nebel. Gleiche Anstriche teilen eine Zeile; Palettenfarben
 * werden erst beim Füllen der Textur aufgelöst, darum tauscht ein Look nur die Texturen.
 *
 * Die Triangulierung je Form wird zwischengespeichert, solange ihr Pfad dasselbe Objekt bleibt: Verschieben, Skalieren
 * und Tiefe ändern rechnen nur die Lage der Ecken neu, so bleibt das Ziehen im Editor auch mit 30 Ebenen flüssig.
 * Platzhalter: noch keine Earle-Schichten (Stufe 5).
 */
import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, ShapeUtils, UniformsLib, UniformsUtils, Vector2, type IUniform, type Raycaster } from 'three';
import { facePaint, planeHidden, planesOf, shapeFaces, shapesOf, styleMap, swatchMap, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { BLEND_MODES, MAX_LAYERS, RAMP, hexToRgb, layersClear, paintLayers, rampOf, resolveColor, type Box, type SwatchMap, type ZoneFill } from '@/zone/paint';
import { faceBox, type Face } from '@/zone/faces';
import type { LookName } from './looks';

/** Abstand zweier Formen derselben Ebene in der Tiefe (Meter, zum Betrachter hin) */
const ORDER_STEP = 0.003;
/** Texel je Zeile der Stil-Datentextur: Kopf, dann je Schicht zwei */
const ROW_W = 1 + 2 * MAX_LAYERS;

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

const NO_BOX: Box = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

export interface PlaneBuildOptions {
  /** Ebene zeichnen? (ausgeblendet, isoliert); ohne Angabe alle außer den ausgeblendeten */
  showPlane?: (plane: ZonePlane) => boolean;
}

/** Zeile der Stil-Datentextur: Schichten mit Palettenverweisen (aufgelöst wird beim Füllen der Textur) */
interface Row {
  layers: readonly ZoneFill[];
  opacity: number;
}

const VERTEX = /* glsl */ `
uniform highp sampler2D uPaint;
attribute vec2 aLocal;
attribute vec2 aPlane;
attribute vec2 aRows;
varying vec2 vLocal;
varying vec2 vPlane;
flat varying ivec2 vRows;
flat varying vec4 vSolid;
#include <common>
#include <fog_pars_vertex>
void main() {
  vLocal = aLocal;
  vPlane = aPlane;
  vRows = ivec2(aRows + 0.5);
  // schneller Weg (Leistung am Handy): nur die Grundfarbe, kein Ebenenstapel, deckend; dann liest jede Ecke die Farbe
  // einmal, und der Pixel-Shader braucht keine Textur
  vec4 hf = texelFetch(uPaint, ivec2(0, vRows.x), 0);
  vec4 hp = texelFetch(uPaint, ivec2(0, vRows.y), 0);
  vSolid = vec4(0.0);
  if (hf.x < 1.5 && hp.x < 0.5 && hf.y > 0.999) vSolid = vec4(texelFetch(uPaint, ivec2(2, vRows.x), 0).rgb, 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform highp sampler2D uPaint;
uniform highp sampler2D uRamp;
varying vec2 vLocal;
varying vec2 vPlane;
flat varying ivec2 vRows;
flat varying vec4 vSolid;
#include <common>
#include <fog_pars_fragment>

vec3 toLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}
float lumOf(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lumOf(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / max(1e-6, l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(1e-6, x - l);
  return c;
}
vec3 softD(vec3 b) { return mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25))); }
// Mischfunktion B(Hintergrund, Quelle), Reihenfolge wie BLEND_MODES
vec3 blendFn(int m, vec3 b, vec3 s) {
  if (m == 1) return b * s;
  if (m == 2) return b + s - b * s;
  if (m == 3) return mix(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, step(b, vec3(0.5)));
  if (m == 4) return mix(b + (2.0 * s - 1.0) * (softD(b) - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), step(s, vec3(0.5)));
  if (m == 5) {
    vec3 r = min(vec3(1.0), b / max(vec3(1e-6), 1.0 - s));
    r = mix(r, vec3(1.0), step(1.0, s));
    return mix(r, vec3(0.0), step(b, vec3(0.0)));
  }
  if (m == 6) return clipColor(s + (lumOf(b) - lumOf(s)));
  return s;
}
vec4 rampAt(int row, float t) {
  float p = clamp(t, 0.0, 1.0) * ${RAMP - 1}.0;
  int i = min(${RAMP - 2}, int(floor(p)));
  return mix(texelFetch(uRamp, ivec2(i, row), 0), texelFetch(uRamp, ivec2(i + 1, row), 0), p - float(i));
}
float gradT(int code, vec4 g, vec2 p) {
  vec2 d = g.zw - g.xy;
  float len2 = dot(d, d);
  if (len2 < 1e-12) return 0.0;
  if (code == 2 || code == 4) return length(p - g.xy) / sqrt(len2);
  return dot(p - g.xy, d) / len2;
}
// Schichten einer Zeile über acc (vormultipliziert); Art 0 Farbe, 1/2 Verlauf linear/radial, 3/4 Deckkraftverlauf
vec4 layers(int row, int n, vec2 p, vec4 acc) {
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= n) break;
    vec4 A = texelFetch(uPaint, ivec2(1 + 2 * i, row), 0);
    vec4 B = texelFetch(uPaint, ivec2(2 + 2 * i, row), 0);
    int code = int(A.x + 0.5);
    vec3 cs = B.rgb;
    float as = 1.0;
    if (code != 0) {
      vec4 r = rampAt(int(A.w + 0.5), gradT(code, B, p));
      cs = r.rgb;
      as = r.a;
    }
    if (code >= 3) {
      acc *= 1.0 - A.z + A.z * as;
      continue;
    }
    as *= A.z;
    vec3 cb = acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0);
    vec3 mixed = cs * (1.0 - acc.a) + blendFn(int(A.y + 0.5), cb, cs) * acc.a;
    acc = vec4(mixed * as + acc.rgb * (1.0 - as), as + acc.a * (1.0 - as));
  }
  return acc;
}
void main() {
  vec4 acc = vec4(vSolid.rgb, 1.0);
  if (vSolid.a < 0.5) {
    vec4 hf = texelFetch(uPaint, ivec2(0, vRows.x), 0);
    acc = layers(vRows.x, int(hf.x + 0.5), vLocal, vec4(0.0));
    acc = layers(vRows.y, int(texelFetch(uPaint, ivec2(0, vRows.y), 0).x + 0.5), vPlane, acc);
    acc *= hf.y;
  }
  vec3 c = acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0);
  gl_FragColor = vec4(toLinear(clamp(c, 0.0, 1.0)), acc.a);
#ifdef OPAQUE
  gl_FragColor.a = 1.0;
#endif
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

function dataTexture(w: number, h: number): DataTexture {
  const t = new DataTexture(new Float32Array(w * h * 4), w, h, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Zeilen auf Zweierpotenzen runden, damit die Textur beim Zeichnen selten neu entsteht */
const capacity = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(8, n)));

type PlaneMesh = Mesh<BufferGeometry, ShaderMaterial>;

interface Part {
  shape: ZoneShape;
  plane: ZonePlane;
  rank: number;
  tri: Triangulated;
  face: number;
  row: number;
  planeRow: number;
}

export class PlaneLayer {
  readonly group = new Group();
  private readonly uniforms: Record<string, IUniform>;
  private readonly opaqueMat: ShaderMaterial;
  private readonly clearMat: ShaderMaterial;
  private opaque: PlaneMesh | null = null;
  private clear_: PlaneMesh | null = null;
  /** Form und Fläche je Dreieck (Index in owners), je Mesh */
  private readonly meshOwners = new Map<PlaneMesh, { triOwner: Int32Array; owners: Array<{ id: string; face: number }> }>();
  private rows: Row[] = [];
  private rowsKey = '';
  private swatches: SwatchMap = new Map();
  private look: LookName = 'day';
  private paintTex = dataTexture(ROW_W, 8);
  private rampTex = dataTexture(RAMP, 8);
  /** Zahlen des letzten Aufbaus (Leistungsanzeige): Ebenen, Formen, Dreiecke, Zeilen, Verläufe, durchsichtige Flächen */
  stats = { planes: 0, shapes: 0, triangles: 0, paints: 0, gradients: 0, clear: 0 };

  constructor() {
    this.group.name = 'ebenen';
    this.uniforms = UniformsUtils.merge([UniformsLib.fog]);
    this.uniforms.uPaint = { value: this.paintTex };
    this.uniforms.uRamp = { value: this.rampTex };
    const common = { uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, fog: true };
    // undurchsichtig: Three setzt dafür selbst OPAQUE (Deckkraft 1 im Shader)
    this.opaqueMat = new ShaderMaterial(common);
    this.clearMat = new ShaderMaterial({ ...common, transparent: true, depthWrite: false });
  }

  /** Look für die Palettenfarben (Palettentausch); tauscht nur die Texturen */
  setLook(look: LookName): void {
    if (look === this.look) return;
    this.look = look;
    this.fillTextures();
  }

  /** alle sichtbaren Formen neu zusammensetzen */
  build(nodes: readonly ZoneNode[], opts: PlaneBuildOptions = {}): void {
    const show = opts.showPlane ?? ((p: ZonePlane) => !planeHidden(nodes, p));
    this.swatches = swatchMap(nodes);
    const styles = styleMap(nodes);
    const rows: Row[] = [];
    const keys: string[] = [];
    const rowOf = new Map<string, number>();
    const addRow = (layers: readonly ZoneFill[], opacity: number): number => {
      const key = JSON.stringify([opacity, layers]);
      let i = rowOf.get(key);
      if (i === undefined) {
        i = rows.push({ layers, opacity }) - 1;
        rowOf.set(key, i);
        keys.push(key);
      }
      return i;
    };
    const solid: Part[] = [];
    const clear: Part[] = [];
    let planeCount = 0;
    for (const plane of planesOf(nodes)) {
      if (!show(plane)) continue;
      planeCount++;
      const planeLayers = (plane.fills ?? []).filter((f) => !f.hidden).slice(0, MAX_LAYERS);
      const planeRow = addRow(planeLayers, 1);
      const planeClear = layersClear(planeLayers);
      shapesOf(nodes, plane.id).forEach((shape, rank) => {
        if (shape.hidden) return;
        shapeFaces(shape, fineness(shape, plane)).forEach((face, fi) => {
          // eine Fläche ohne Füllung ist ein Loch: nichts zu zeichnen
          const paint = facePaint(shape, face);
          const pl = paintLayers(paint, styles, paint.style ? faceBox(face) : NO_BOX);
          if (!pl) return;
          const tri = triangulateFace(face);
          if (!tri.index.length) return;
          const part = { shape, plane, rank, tri, face: fi, row: addRow(pl.layers, pl.opacity), planeRow };
          (planeClear || layersClear(pl.layers, pl.opacity) ? clear : solid).push(part);
        });
      });
    }
    // durchsichtige von hinten nach vorn: tiefere Ebene zuerst, in der Ebene in Zeichenreihenfolge
    clear.sort((a, b) => b.plane.z - a.plane.z || a.rank - b.rank);
    const all = [...solid, ...clear];
    const tris = all.reduce((n, p) => n + p.tri.index.length / 3, 0);
    this.rows = rows;
    const key = keys.join('|');
    if (key !== this.rowsKey || this.swatchesChanged()) {
      this.rowsKey = key;
      this.fillTextures();
    }
    this.stats = { planes: planeCount, shapes: new Set(all.map((x) => x.shape.id)).size, triangles: tris, paints: rows.length, gradients: this.stats.gradients, clear: clear.length };
    this.opaque = this.setMesh(this.opaque, solid, this.opaqueMat, 'ebenen-formen');
    this.clear_ = this.setMesh(this.clear_, clear, this.clearMat, 'ebenen-durchsichtig');
  }

  /** zuletzt aufgelöste Palette, damit eine geänderte Palettenfarbe die Texturen neu füllt */
  private swatchKey = '';
  private swatchesChanged(): boolean {
    const k = JSON.stringify([...this.swatches.values()]);
    if (k === this.swatchKey) return false;
    this.swatchKey = k;
    return true;
  }

  /** Stil-Datentextur und Farbbänder aus den Zeilen füllen, Farben im aktuellen Look */
  private fillTextures(): void {
    const rows = this.rows;
    const h = capacity(rows.length);
    if (this.paintTex.image.height !== h) {
      this.paintTex.dispose();
      this.paintTex = dataTexture(ROW_W, h);
      this.uniforms.uPaint.value = this.paintTex;
    }
    const data = this.paintTex.image.data as Float32Array;
    data.fill(0);
    const ramps: Float32Array[] = [];
    const rampOfKey = new Map<string, number>();
    const rgb = (c: string) => hexToRgb(resolveColor(c, this.swatches, this.look));
    rows.forEach((row, r) => {
      const base = r * ROW_W * 4;
      data[base] = row.layers.length;
      data[base + 1] = row.opacity;
      row.layers.forEach((f, i) => {
        const a = base + (1 + 2 * i) * 4;
        const b = a + 4;
        data[a + 1] = Math.max(0, BLEND_MODES.indexOf(f.blend));
        data[a + 2] = f.opacity;
        if (f.type === 'color') {
          data[a] = 0;
          const [cr, cg, cb] = rgb(f.color);
          data[b] = cr;
          data[b + 1] = cg;
          data[b + 2] = cb;
          data[b + 3] = 1;
          return;
        }
        data[a] = (f.type === 'fade' ? 3 : 1) + (f.radial ? 1 : 0);
        const k = JSON.stringify(f.stops);
        let ramp = rampOfKey.get(k);
        if (ramp === undefined) {
          ramp = ramps.push(rampOf(f.stops, this.swatches, this.look)) - 1;
          rampOfKey.set(k, ramp);
        }
        data[a + 3] = ramp;
        data[b] = f.x0;
        data[b + 1] = f.y0;
        data[b + 2] = f.x1;
        data[b + 3] = f.y1;
      });
    });
    this.paintTex.needsUpdate = true;
    const rh = capacity(ramps.length);
    if (this.rampTex.image.height !== rh) {
      this.rampTex.dispose();
      this.rampTex = dataTexture(RAMP, rh);
      this.uniforms.uRamp.value = this.rampTex;
    }
    const rd = this.rampTex.image.data as Float32Array;
    rd.fill(0);
    ramps.forEach((ramp, i) => rd.set(ramp, i * RAMP * 4));
    this.rampTex.needsUpdate = true;
    this.stats.gradients = ramps.length;
  }

  private setMesh(mesh: PlaneMesh | null, parts: readonly Part[], material: ShaderMaterial, name: string): PlaneMesh | null {
    if (!parts.length) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshOwners.delete(mesh);
      }
      return null;
    }
    let verts = 0;
    let tris = 0;
    for (const p of parts) {
      verts += p.tri.pts.length / 2;
      tris += p.tri.index.length / 3;
    }
    const pos = new Float32Array(verts * 3);
    const local = new Float32Array(verts * 2);
    const planar = new Float32Array(verts * 2);
    const rowsAttr = new Float32Array(verts * 2);
    const index = new Uint32Array(tris * 3);
    const triOwner = new Int32Array(tris);
    const owners: Array<{ id: string; face: number }> = [];
    let v = 0;
    let t = 0;
    for (const { shape, plane, rank, tri, face, row, planeRow } of parts) {
      const owner = owners.push({ id: shape.id, face }) - 1;
      const Z = -plane.z + rank * ORDER_STEP;
      const n = tri.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const lx = tri.pts[i * 2];
        const ly = tri.pts[i * 2 + 1];
        const px = shape.x + shape.sx * lx;
        const py = shape.y + shape.sy * ly;
        const k = (v + i) * 3;
        pos[k] = plane.x + plane.scale * px;
        pos[k + 1] = plane.y + plane.scale * py;
        pos[k + 2] = Z;
        const j = (v + i) * 2;
        local[j] = lx;
        local[j + 1] = ly;
        planar[j] = px;
        planar[j + 1] = py;
        rowsAttr[j] = row;
        rowsAttr[j + 1] = planeRow;
      }
      for (let i = 0; i < tri.index.length; i++) index[t * 3 + i] = tri.index[i] + v;
      triOwner.fill(owner, t, t + tri.index.length / 3);
      v += n;
      t += tri.index.length / 3;
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setAttribute('aLocal', new BufferAttribute(local, 2));
    geom.setAttribute('aPlane', new BufferAttribute(planar, 2));
    geom.setAttribute('aRows', new BufferAttribute(rowsAttr, 2));
    geom.setIndex(new BufferAttribute(index, 1));
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geom;
    } else {
      mesh = new Mesh(geom, material);
      mesh.name = name;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.meshOwners.set(mesh, { triOwner, owners });
    return mesh;
  }

  /** gezeichnete Flächen (Form und Fläche) beider Meshes, für Prüfungen */
  get owners(): Array<{ id: string; face: number }> {
    return [...this.meshOwners.values()].flatMap((m) => m.owners);
  }

  /** vorderste getroffene Form (und ihre Fläche) unter dem Strahl, die accept annimmt (gesperrte überspringt der Editor) */
  pick(raycaster: Raycaster, accept: (id: string) => boolean = () => true): { id: string; face: number; distance: number } | null {
    const meshes = [this.opaque, this.clear_].filter((m): m is PlaneMesh => !!m);
    if (!meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    for (const h of hits) {
      if (h.faceIndex === undefined || h.faceIndex === null) continue;
      const own = this.meshOwners.get(h.object as PlaneMesh);
      const o = own?.owners[own.triOwner[h.faceIndex]];
      if (o && accept(o.id)) return { id: o.id, face: o.face, distance: h.distance };
    }
    return null;
  }

  clear(): void {
    for (const mesh of [this.opaque, this.clear_]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      this.meshOwners.delete(mesh);
    }
    this.opaque = null;
    this.clear_ = null;
  }
}
