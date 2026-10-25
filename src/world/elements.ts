/**
 * Kulissen-Platzhalter (Etappe 1, Schritt 4; Plan 8a.1): Klötzchen mit richtigen Maßen und ihren Metadaten, die der
 * Editor setzt (Schritt 6) und die später gemalte Bilder ersetzen. Die Verdeckung kommt aus dem Tiefenpuffer: jede
 * Fläche schreibt Tiefe, die Bahn fährt mit ihrer echten Tiefe dazwischen (Richtlinie 3). Typen: Kulisse (Fläche mit
 * Beschriftung), Dreiteiler (Rückwand, Innenraum, Vorderlippe mit Öffnungen), Säule (Zylinder, auch nur als
 * Tiefenvolumen), Höhlenkasten (offene Front, Boden tragfähig), Wasserfläche (Stützen verboten), Wasserfall (Band),
 * Portal (Ring um eine Öffnung). Koordinaten: x entlang der Bühne, y Höhe, z Tiefe in Spuren.
 */
import { BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshLambertMaterial, Path, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace, TorusGeometry, type Material, type MeshLambertMaterialParameters } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE_DEPTH } from '@/track/stage';
import { laneToZ } from './camera';
import type { Foundation, FootHit } from './foundations';
import { paintedMaterial } from './looks';

export type ElementKind = 'flat' | 'threePart' | 'column' | 'cave' | 'water' | 'waterfall' | 'portal';

/** Öffnung in einer Vorderlippe (Welt-Koordinaten, Radius in Metern) */
export interface Opening {
  x: number;
  y: number;
  r: number;
}

export interface BuiltElement {
  kind: ElementKind;
  group: Group;
  /** tragfähige Fläche des Elements (Höhlenboden) oder Sperre (Wasser) */
  foundation?: Foundation;
  /** Öffnungen, durch die die Bahn darf (Fels-Regeln, Paket 5) */
  openings?: Opening[];
  /** Vorderlippe des Dreiteilers (die Freilegung löst sie um den Anschlusspunkt auf, Schritt 6) */
  lip?: Mesh;
  dispose(): void;
}

const INK = '#1e2a3a';

function mat(color: string, extra: Partial<MeshLambertMaterialParameters> = {}): MeshLambertMaterial {
  return paintedMaterial({ color: new Color(color), side: DoubleSide, ...extra });
}

function finish(kind: ElementKind, group: Group, materials: Material[], extra: Partial<BuiltElement> = {}): BuiltElement {
  group.name = `element-${kind}`;
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.geometry) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return {
    kind,
    group,
    ...extra,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      for (const m of materials) m.dispose();
    },
  };
}

/** Beschriftung als Textur auf einer farbigen Fläche (nur mit Zeichenfläche; im Replay ohne) */
function labelTexture(text: string, color: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = INK;
  g.font = 'bold 36px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Silhouette (Welt-XY) als Shape, wahlweise mit runden Öffnungen */
function shapeOf(points: Array<[number, number]>, holes: Opening[] = []): Shape {
  const s = new Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  for (const h of holes) {
    const p = new Path();
    p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  return s;
}

/** Kulisse: senkrechte farbige Fläche w × h mit Beschriftung, Fuß bei (x, y) auf Spur z */
export function buildFlat(x: number, y: number, z: number, w: number, h: number, color: string, label = ''): BuiltElement {
  const tex = label ? labelTexture(label, color) : null;
  const m = tex ? mat('#ffffff', { map: tex }) : mat(color);
  const mesh = new Mesh(new PlaneGeometry(w, h), m);
  mesh.position.set(x, y + h / 2, laneToZ(z));
  const g = new Group();
  g.add(mesh);
  return finish('flat', g, [m]);
}

/**
 * Dreiteiler: Rückwand depth/2 hinter und Vorderlippe mit Öffnungen depth/2 vor der Spur z, dazwischen der dunkle
 * Innenraum (Boden). Die Bahn fährt durch die Öffnungen hinter die Lippe und ist dort verdeckt: Tunnel ohne Maske.
 */
export function buildThreePart(outline: Array<[number, number]>, z: number, depth: number, openings: Opening[], color: string, interior = '#14101a'): BuiltElement {
  const Zc = laneToZ(z);
  const back = new Mesh(new ShapeGeometry(shapeOf(outline)), mat(new Color(color).multiplyScalar(0.7).getStyle()));
  back.position.z = Zc - depth / 2;
  const lipMat = mat(color);
  const lip = new Mesh(new ShapeGeometry(shapeOf(outline, openings)), lipMat);
  lip.position.z = Zc + depth / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [px, py] of outline) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  // Innenraum: dunkler Boden zwischen Rückwand und Lippe (Seitenwände gibt es nicht: die Silhouette läuft an ihren
  // Rändern auf den Boden aus, eine Wand dort ragte als dunkle Klinge über den Berg)
  const dark = mat(interior);
  const floor = new Mesh(new BoxGeometry(maxX - minX, 0.2, depth), dark);
  floor.position.set((minX + maxX) / 2, minY + 0.1, Zc);
  void maxY;
  const g = new Group();
  g.add(back, lip, floor);
  return finish('threePart', g, [back.material as Material, lipMat, dark], { openings: [...openings], lip });
}

/** eine Scheibe eines Bergstapels: Silhouette (Welt-XY) auf Spur z mit ihren Öffnungen */
export interface MountainLayer {
  outline: Array<[number, number]>;
  z: number;
  openings: Opening[];
}

/**
 * Bergstapel: ein Dreiteiler je Spur, hintereinander gestaffelt wie die Silhouetten der Bühne (ein Berg ohne feste Spur
 * steht auf allen fünf); Rückwände, Lippen und Böden aller Scheiben sind zu je einer Geometrie verschmolzen, also drei
 * Zeichenaufrufe für den ganzen Berg. Die Bahn jeder Spur verschwindet hinter der Lippe ihrer Scheibe und tritt an den
 * Öffnungen dieser Scheibe aus; die Scheiben davor verdecken sie zusätzlich, wo ihre Silhouette hoch genug ist.
 */
export function buildMountainStack(layers: MountainLayer[], thickness: number, color: string, interior = '#14101a'): BuiltElement {
  const backs: ShapeGeometry[] = [];
  const lips: ShapeGeometry[] = [];
  const floors: BoxGeometry[] = [];
  const openings: Opening[] = [];
  for (const layer of layers) {
    const Zc = laneToZ(layer.z);
    backs.push(new ShapeGeometry(shapeOf(layer.outline)).translate(0, 0, Zc - thickness / 2) as ShapeGeometry);
    lips.push(new ShapeGeometry(shapeOf(layer.outline, layer.openings)).translate(0, 0, Zc + thickness / 2) as ShapeGeometry);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const [px, py] of layer.outline) {
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
    }
    floors.push(new BoxGeometry(maxX - minX, 0.2, thickness).translate((minX + maxX) / 2, minY + 0.1, Zc) as BoxGeometry);
    openings.push(...layer.openings);
  }
  const g = new Group();
  const mats: Material[] = [];
  const add = (parts: BufferGeometryLike[], material: MeshLambertMaterial): void => {
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) return;
    g.add(new Mesh(merged, material));
    mats.push(material);
  };
  add(backs, mat(new Color(color).multiplyScalar(0.7).getStyle()));
  add(lips, mat(color));
  add(floors, mat(interior));
  return finish('threePart', g, mats, { openings });
}

type BufferGeometryLike = ShapeGeometry | BoxGeometry;

/** Säule oder Stamm: Zylinder mit Fuß bei (x, y); depthOnly schreibt nur Tiefe (unsichtbares Volumen hinter einem gemalten Stamm) */
export function buildColumn(x: number, y: number, z: number, r: number, h: number, color: string, depthOnly = false): BuiltElement {
  const m = depthOnly ? new MeshLambertMaterial({ colorWrite: false }) : mat(color);
  const mesh = new Mesh(new CylinderGeometry(r, r, h, 12), m);
  mesh.position.set(x, y + h / 2, laneToZ(z));
  const g = new Group();
  g.add(mesh);
  const built = finish('column', g, [m]);
  if (depthOnly) mesh.castShadow = false;
  return built;
}

/** Höhlenkasten: Rückwand, Boden, Decke und Seiten um die Mitte (x, Spur z), Front offen; der Boden trägt Stützen */
export function buildCave(x: number, y: number, z: number, w: number, h: number, d: number, color: string): BuiltElement {
  const Zc = laneToZ(z);
  const wall = mat(color);
  const floorMat = mat(new Color(color).multiplyScalar(0.85).getStyle());
  const back = new Mesh(new PlaneGeometry(w, h), wall);
  back.position.set(x, y + h / 2, Zc - d / 2);
  const floor = new Mesh(new PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, y, Zc);
  const ceiling = new Mesh(new PlaneGeometry(w, d), wall);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(x, y + h, Zc);
  const g = new Group();
  g.add(back, floor, ceiling);
  for (const sx of [x - w / 2, x + w / 2]) {
    const side = new Mesh(new PlaneGeometry(d, h), wall);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx, y + h / 2, Zc);
    g.add(side);
  }
  const foundation: Foundation = {
    surfaceBelow(px: number, py: number, pz: number): FootHit | null {
      if (Math.abs(px - x) > w / 2 || Math.abs(laneToZ(pz) - Zc) > d / 2 || py <= y) return null;
      return { y, kind: 'cave' };
    },
  };
  return finish('cave', g, [wall, floorMat], { foundation });
}

/** Wasserfläche: waagerechte blaue Fläche w (Bühne) × d (Tiefe, Meter) um (x, Spur z) auf Höhe y; Stützen verboten */
export function buildWater(x: number, y: number, z: number, w: number, d: number, color: string): BuiltElement {
  const m = mat(color, { transparent: true, opacity: 0.78, depthWrite: false });
  const mesh = new Mesh(new PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, laneToZ(z));
  const g = new Group();
  g.add(mesh);
  const Zc = laneToZ(z);
  const foundation: Foundation = {
    surfaceBelow: () => null,
    blocks: (px: number, pz: number) => Math.abs(px - x) <= w / 2 && Math.abs(laneToZ(pz) - Zc) <= d / 2,
  };
  const built = finish('water', g, [m], { foundation });
  mesh.castShadow = false;
  return built;
}

/** Wasserfall: senkrechtes helles Band w × h ab der Unterkante (x, yBottom) auf Spur z */
export function buildWaterfall(x: number, yBottom: number, z: number, w: number, h: number, color: string): BuiltElement {
  const m = mat(color, { transparent: true, opacity: 0.85, depthWrite: false });
  const mesh = new Mesh(new PlaneGeometry(w, h), m);
  mesh.position.set(x, yBottom + h / 2, laneToZ(z));
  const g = new Group();
  g.add(mesh);
  const built = finish('waterfall', g, [m]);
  mesh.castShadow = false;
  return built;
}

/**
 * Portal, Tunnelmund: Ring um die Öffnung (x, y) auf Spur z, dahinter eine dunkle Scheibe als Mund (so liest sich die
 * Öffnung als Loch, nicht als Delle); die Anschlussachse der Bahn läuft durch den Ring hinter die Lippe
 */
export function buildPortal(x: number, y: number, z: number, r: number, thickness: number, color: string, mouth = true): BuiltElement {
  const m = mat(color);
  const mesh = new Mesh(new TorusGeometry(r, thickness, 8, 24), m);
  mesh.position.set(x, y, laneToZ(z));
  const g = new Group();
  g.add(mesh);
  const mats: Material[] = [m];
  if (mouth) {
    const dark = mat('#0b0910');
    const disc = new Mesh(new CircleGeometry(r, 24), dark);
    disc.position.set(x, y, laneToZ(z) - 0.6);
    g.add(disc);
    mats.push(dark);
  }
  const built = finish('portal', g, mats, { openings: [{ x, y, r }] });
  for (const c of g.children) if (c !== mesh) (c as Mesh).castShadow = false;
  return built;
}

/** Spurabstand in Metern (für Maße in der Tiefe) */
export const LANE_M = LANE_DEPTH;
