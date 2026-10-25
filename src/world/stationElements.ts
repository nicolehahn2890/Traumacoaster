/**
 * Platzhalter für Station, Schlangenbereich und Baustelle (Etappe 1, Schritt 8; Plan 3.3, 3.5, 6.3, 5.1, 8a.1) als
 * Klötzchen in der Welt: Bahnsteig-Kasten mit Richtungspfeil, Häuschen-Kasten mit Drehkreuz-Pfosten und Geländer, Hebel
 * für die Startart; Streifen der Schlange mit Platzhalter-Figuren und durchscheinendem Freiraum-Volumen (fünf Meter);
 * Baustelle als zwei Pfosten mit gelb-schwarzem Band, beim Durchbruch mit einer Wand dahinter. Jeder Platzhalter ist
 * eine Geometrie mit Farbe je Ecke (ein Zeichenaufruf, plus einer je durchscheinendem Teil); als Einzelteile kosteten
 * vier Platzhalter mit Schatten über hundert Aufrufe. Alles Platzhalter mit richtigen Maßen, bis die gemalten Teile und
 * 3D-Modelle kommen (Paket 8b, Stilprobe E4).
 */
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, ShapeGeometry, Shape, SphereGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { laneToZ } from './camera';
import type { BuiltElement } from './elements';
import { paintedMaterial } from './looks';

const INK = new Color('#1e2a3a');
const CONCRETE = new Color('#ddd5c3');
const CONCRETE_DARK = new Color('#b8ae9c');
const PINK = new Color('#ff5c8a');
const YELLOW = new Color('#ffd23f');
const SKIN = new Color('#ffe0c0');
const SHIRT = new Color('#ff8a5c');

/** ein Material für alle verschmolzenen Platzhalter: die Farbe steckt je Ecke in der Geometrie */
const SOLID = paintedMaterial({ vertexColors: true, side: DoubleSide });

/** sammelt Teile mit Farbe und verschmilzt sie zu einem Mesh */
class Merged {
  private parts: BufferGeometry[] = [];
  private paint(geo: BufferGeometry, color: Color): void {
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.parts.push(geo);
  }
  box(w: number, h: number, d: number, color: Color, x: number, y: number, z: number): void {
    this.paint(new BoxGeometry(w, h, d).translate(x, y, z), color);
  }
  sphere(r: number, color: Color, x: number, y: number, z: number): void {
    this.paint(new SphereGeometry(r, 10, 8).translate(x, y, z), color);
  }
  disc(r: number, thick: number, color: Color, x: number, y: number, z: number): void {
    this.paint(new CylinderGeometry(r, r, thick, 12).translate(x, y, z), color);
  }
  /** flache Form waagerecht auf dem Boden (Pfeil), x gespiegelt für Richtung −1 */
  flat(shape: Shape, color: Color, x: number, y: number, z: number, dir: 1 | -1): void {
    const g = new ShapeGeometry(shape);
    g.scale(dir, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    this.paint(g, color);
  }
  mesh(): Mesh {
    const merged = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    const m = new Mesh(merged, SOLID);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

function finish(group: Group, materials: Material[]): BuiltElement {
  group.name = 'element-flat';
  return {
    kind: 'flat',
    group,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      for (const m of materials) m.dispose();
    },
  };
}

/** gelb-schwarzes Absperrband aus abwechselnden Stücken */
function tape(m: Merged, length: number, x: number, y: number, z: number): void {
  const n = Math.max(2, Math.round(length / 0.4));
  const seg = length / n;
  for (let i = 0; i < n; i++) m.box(seg, 0.25, 0.04, i % 2 ? INK : YELLOW, x - length / 2 + seg * (i + 0.5), y, z);
}

/**
 * Station: Bahnsteig entlang des Vorgabestücks (Länge in Fahrtrichtung dir), Pfeil darauf, Häuschen mit Drehkreuz und
 * Geländer hinter dem Anfang, Hebel am Bahnsteig vorn (Startart-Wahl, Plan 3.3). (x, y, z) ist der Anker: Anfang des
 * Vorgabestücks auf der Bahnlinie.
 */
export function buildStationPlaceholder(x: number, y: number, z: number, dir: 1 | -1, length: number): BuiltElement {
  const Z = laneToZ(z);
  const m = new Merged();
  const mid = x + (dir * length) / 2;
  m.box(length, 0.4, 3.2, CONCRETE, mid, y - 0.55, Z); // Bahnsteig unter der Bahn
  const arrow = new Shape();
  arrow.moveTo(-1.2, -0.5);
  arrow.lineTo(0.6, -0.5);
  arrow.lineTo(0.6, -1.0);
  arrow.lineTo(1.6, 0);
  arrow.lineTo(0.6, 1.0);
  arrow.lineTo(0.6, 0.5);
  arrow.lineTo(-1.2, 0.5);
  arrow.closePath();
  m.flat(arrow, INK, mid, y - 0.34, Z + 1.1, dir); // Pfeil in Fahrtrichtung
  const hx = x - dir * 4.5;
  m.box(3.2, 3.0, 3.0, CONCRETE_DARK, hx, y + 1.5, Z - 0.3); // Häuschen
  m.box(3.8, 0.3, 3.6, PINK, hx, y + 3.15, Z - 0.3); // Dach
  for (const dz of [-1.2, 1.2]) m.box(0.12, 1.0, 0.12, INK, hx + dir * 1.9, y + 0.5, Z + dz); // Drehkreuz-Pfosten
  m.box(length, 0.08, 0.08, INK, mid, y + 0.9, Z + 1.55); // Geländer vorn
  for (let k = 0; k <= Math.floor(length / 2); k++) m.box(0.08, 0.9, 0.08, INK, x + dir * (k * 2 + 0.1), y + 0.45, Z + 1.55);
  m.box(0.14, 1.3, 0.14, INK, x + dir * 2.2, y + 0.65, Z + 2.0); // Hebel
  m.sphere(0.28, PINK, x + dir * 2.2, y + 1.4, Z + 2.0);
  const g = new Group();
  g.add(m.mesh());
  return finish(g, []);
}

/**
 * Schlangenbereich: Streifen von x0 bis x1 auf Spur z (Boden y) mit Platzhalter-Figuren in Reihe (Eingang am Ende in
 * Richtung dir) und dem Freiraum-Volumen fünf Meter hoch (Plan 6.3: die Bahn wird dort angehoben, Stützen stehen außerhalb)
 */
export function buildQueuePlaceholder(x0: number, x1: number, y: number, z: number, dir: 1 | -1, figures = 6): BuiltElement {
  const Z = laneToZ(z);
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const len = Math.max(2, right - left);
  const m = new Merged();
  m.box(len, 0.12, 1.6, CONCRETE_DARK, (left + right) / 2, y + 0.06, Z);
  const start = dir === 1 ? right - 0.8 : left + 0.8;
  for (let i = 0; i < Math.min(12, figures); i++) {
    const fx = start - dir * i * 1.0;
    if (fx < left + 0.3 || fx > right - 0.3) break;
    m.box(0.5, 1.2, 0.3, SHIRT, fx, y + 0.72, Z);
    m.sphere(0.22, SKIN, fx, y + 1.5, Z);
  }
  const clearance = paintedMaterial({ color: YELLOW, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide });
  const vol = new Mesh(new BoxGeometry(len, 5, 1.6), clearance);
  vol.position.set((left + right) / 2, y + 2.6, Z);
  const g = new Group();
  g.add(m.mesh(), vol);
  return finish(g, [clearance]);
}

/**
 * Baustelle: zwei Pfosten mit gelb-schwarzem Band um den Anschlusspunkt (x, y) auf Spur z; beim Durchbruch steht
 * dahinter eine Wand, die in der Fahrt mit Mindesttempo zersplittert (Plan 5.1, Verhalten in E2 und E3)
 */
export function buildSitePlaceholder(x: number, y: number, z: number, variant: 'connect' | 'breakthrough'): BuiltElement {
  const Z = laneToZ(z);
  const m = new Merged();
  for (const dx of [-1.3, 1.3]) m.box(0.14, 1.4, 0.14, INK, x + dx, y + 0.7, Z + 0.8);
  tape(m, 2.6, x, y + 1.1, Z + 0.8);
  tape(m, 2.6, x, y + 0.5, Z + 0.8);
  m.disc(0.5, 0.1, YELLOW, x, y + 0.05, Z);
  const g = new Group();
  g.add(m.mesh());
  const mats: Material[] = [];
  if (variant === 'breakthrough') {
    const wallMat = paintedMaterial({ color: new Color('#7a2a2a'), transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
    const wall = new Mesh(new BoxGeometry(4, 6, 0.4), wallMat);
    wall.position.set(x, y + 3, Z);
    g.add(wall);
    mats.push(wallMat);
  }
  return finish(g, mats);
}
