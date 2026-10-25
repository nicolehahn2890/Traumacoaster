/**
 * Wagen-Platzhalter des Weltrenderers (Etappe 1, Schritt 2; Plan 3.2 Stufe 1): je Wagen eine offene Wanne mit Boden,
 * Heck, Front, Seitenwänden, Trennwand, zwei Sitzreihen und vier Rädern in den Maßen der Physik (CAR), der erste Wagen
 * mit Nase und Lampe, Kupplungen dazwischen. Lage und Rahmen kommen je Bild aus dem Wagenzustand, auf der Bahn mit der
 * Schräglage der Schienen (railFrame), damit der Wagen auf den Schienen liegt wie in der Bühnendarstellung. Die
 * Fahrgäste bleiben Cut-outs in Pixi. Jeder Wagen ist eine Geometrie mit Farbe je Ecke: ein Zeichenaufruf je Wagen.
 */
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '@/core/math3';
import type { CarState } from '@/physics/trainSim';
import { CAR } from '@/physics/passengers';
import { laneToZ } from './camera';
import { HANG_DROP } from './trackTypes';
import { paintedMaterial } from './looks';

/** Wagenfarben wie in der Bühnendarstellung: erster Wagen rosa, dann im Wechsel */
const BODY = ['#ffd23f', '#3ec7c2', '#9b6dff', '#7ee081', '#ff8a5c'];
const FIRST = '#ff5c8a';
const INK = new Color(0x2a1f3d);
const LAMP = new Color(0xffd23f);

export type RailFrame = (s: number) => { T: Vec3; U: Vec3; S: Vec3; bank: number } | null;

/** ein Material für alle Wagen: die Farbe steckt je Ecke in der Geometrie (ein Zeichenaufruf je Wagen) */
const CAR_MATERIAL = paintedMaterial({ vertexColors: true });

const shaded = (hex: string, k: number): Color => new Color(hex).multiplyScalar(k);

/** Teil mit Farbe je Ecke an seinen Platz schieben (lokal: x Fahrtrichtung, y oben, z Seite) */
function part(geo: BufferGeometry, color: Color, x: number, y: number, z: number): BufferGeometry {
  geo.translate(x, y, z);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return geo;
}

/**
 * ein Wagen als eine Geometrie in lokalen Koordinaten: x Fahrtrichtung, y oben, z Seite (Betrachterseite positiv);
 * hanging: Gondel ohne Räder, mit zwei Hängern und Laufwerk am Tragbalken, der HANG_DROP über der Gondel liegt
 */
function carMesh(index: number, total: number, hanging: boolean): Mesh {
  const body = index === 0 ? FIRST : BODY[index % BODY.length];
  const hl = CAR.halfLength;
  const hw = 0.6;
  const y0 = CAR.railOffset;
  const side = shaded(body, 1);
  const dark = shaded(body, 0.55);
  const floor = shaded(body, 0.45);
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, color: Color, x: number, y: number, z: number): void => {
    parts.push(part(new BoxGeometry(w, h, d), color, x, y, z));
  };
  box(CAR.length, 0.08, hw * 2, floor, 0, y0 + 0.04, 0); // Boden
  box(0.08, CAR.rearWallH, hw * 2, dark, -hl + 0.04, y0 + CAR.rearWallH / 2, 0); // Heck
  box(0.08, CAR.frontWallH, hw * 2, dark, hl - 0.04, y0 + CAR.frontWallH / 2, 0); // Front
  for (const z of [-hw + 0.04, hw - 0.04]) box(CAR.length, CAR.frontWallH, 0.08, side, 0, y0 + CAR.frontWallH / 2, z); // Seiten
  box(0.06, CAR.dividerH, hw * 2 - 0.16, dark, 0, y0 + CAR.dividerH / 2, 0); // Trennwand (Lehne Reihe 2)
  for (const row of CAR.rows) for (const z of [-0.28, 0.28]) box(0.5, 0.12, 0.46, floor, row, y0 + 0.14, z); // Sitze
  if (hanging) {
    const top = y0 + CAR.rearWallH;
    for (const a of [-0.6, 0.6]) box(0.14, HANG_DROP - top + 0.2, 0.14, INK, a, (top + HANG_DROP + 0.2) / 2, 0); // Hänger
    box(1.6, 0.3, 0.9, INK, 0, HANG_DROP + 0.15, 0); // Laufwerk am Tragbalken
  } else {
    for (const a of [-0.8, 0.8]) for (const z of [-hw * 0.8, hw * 0.8]) parts.push(part(new CylinderGeometry(0.2, 0.2, 0.1, 10).rotateX(Math.PI / 2), INK, a, 0.12, z)); // Räder
  }
  if (index === 0) {
    box(0.4, 0.16, hw * 1.4, side, hl + 0.2, y0 + 0.08, 0); // Nase
    box(0.1, 0.1, 0.2, LAMP, hl + 0.4, y0 + 0.2, 0); // Lampe
  }
  if (index < total - 1) box(0.5, 0.06, 0.06, INK, -hl - 0.25, y0 + 0.2, 0); // Kupplung
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  const m = new Mesh(merged, CAR_MATERIAL);
  m.castShadow = true;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

export class WorldTrain {
  readonly group = new Group();
  private cars: Mesh[] = [];
  /** Hängebahn: die Gondeln hängen HANG_DROP unter der Bahnlinie */
  private hanging = false;

  build(count: number, hanging = false): void {
    this.clear();
    this.hanging = hanging;
    for (let i = 0; i < count; i++) {
      const car = carMesh(i, count, hanging);
      car.visible = false;
      this.cars.push(car);
      this.group.add(car);
    }
  }

  clear(): void {
    for (const car of this.cars) {
      this.group.remove(car);
      car.geometry.dispose();
    }
    this.cars = [];
  }

  /** Wagen stellen: auf der Bahn mit dem Schienenrahmen bei s, im Flug mit dem Rahmen des Wagenzustands */
  update(cars: CarState[], rail: RailFrame | null): void {
    const t = new Vector3();
    const n = new Vector3();
    const s = new Vector3();
    const m = new Matrix4();
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const st = cars[i];
      if (!st) {
        car.visible = false;
        continue;
      }
      const fr = rail?.(st.s);
      if (fr) {
        t.set(fr.T.x, fr.T.y, -fr.T.z);
        n.set(fr.U.x, fr.U.y, -fr.U.z);
      } else {
        t.set(st.tx, st.ty, -st.tz);
        n.set(st.upx, st.upy, -st.upz);
      }
      t.normalize();
      n.normalize();
      s.crossVectors(t, n).normalize();
      m.makeBasis(t, n, s);
      const drop = this.hanging ? HANG_DROP : 0;
      m.setPosition(st.x - n.x * drop, st.y - n.y * drop, laneToZ(st.z) - n.z * drop);
      car.matrix.copy(m);
      car.matrixWorldNeedsUpdate = true;
      car.visible = true;
    }
  }
}
