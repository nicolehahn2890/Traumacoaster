/**
 * Gebogener Boden: Die Karte ist eine Drehscheibe, das Level ist flach. Beides ist derselbe Boden mit
 * unterschiedlicher Krümmung. Flache Koordinaten (u = Bogenlänge ab dem Fokus, v = Höhe über dem Boden,
 * beides in Karten-Pixeln) werden auf einen Kreis mit Krümmung k gelegt; k = 0 ist der flache Boden.
 * Der Übergang zwischen Karte und Level dreht nur an k, am Maßstab und am Fokus.
 */
import { Mesh, MeshGeometry, type Texture } from 'pixi.js';

export interface BendFrame {
  /** Bildschirmposition des Fokus (Boden bei u = 0) */
  fx: number;
  fy: number;
  /** Bildschirm-Pixel pro Karten-Pixel */
  s: number;
  /** Krümmung des Bodens (1 / Radius in Karten-Pixeln), 0 = flach */
  k: number;
}

export interface XY {
  x: number;
  y: number;
}

/** Flacher Punkt (u, v) → Bildschirm. Numerisch stabil bis k → 0. */
export function bendPoint(f: BendFrame, u: number, v: number, out: XY): XY {
  let dx: number;
  let dy: number;
  if (f.k === 0) {
    dx = u;
    dy = -v;
  } else {
    // Kreis mit Mittelpunkt 1/k unter dem Fokus: (1/k + v)·sin a, 1/k − (1/k + v)·cos a
    const a = u * f.k;
    const sa = Math.sin(a);
    const h = Math.sin(a / 2);
    dx = sa / f.k + v * sa;
    dy = (2 * h * h) / f.k - v * Math.cos(a);
  }
  out.x = f.fx + f.s * dx;
  out.y = f.fy + f.s * dy;
  return out;
}

/** Neigung des Bodens an der Stelle u (Rotation für Dinge, die auf dem Boden stehen) */
export const bendAngle = (f: BendFrame, u: number): number => u * f.k;

/**
 * Textur auf einem Gitter, dessen Punkte frei gesetzt werden. Auf der Karte liegen so die Miniaturen
 * gebogen auf der Drehscheibe, im Übergang das Level-Bild.
 */
export class BentSheet {
  readonly mesh: Mesh;
  private readonly nx: number;
  private readonly ny: number;
  private readonly tmp: XY = { x: 0, y: 0 };

  constructor(texture: Texture, nx = 24, ny = 8) {
    this.nx = nx;
    this.ny = ny;
    const count = (nx + 1) * (ny + 1);
    const positions = new Float32Array(count * 2);
    const uvs = new Float32Array(count * 2);
    const indices = new Uint32Array(nx * ny * 6);
    let k = 0;
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        uvs[k++] = i / nx;
        uvs[k++] = j / ny;
      }
    }
    k = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = c;
        indices[k++] = b; indices[k++] = d; indices[k++] = c;
      }
    }
    this.mesh = new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices }), texture });
  }

  set texture(t: Texture) {
    this.mesh.texture = t;
  }

  /** Jeden Gitterpunkt neu setzen: map(tu, tv) bekommt Texturkoordinaten 0..1 und schreibt die Bildschirmposition */
  update(map: (tu: number, tv: number, out: XY) => void): void {
    const buf = this.mesh.geometry.getBuffer('aPosition');
    const pos = buf.data as Float32Array;
    let k = 0;
    for (let j = 0; j <= this.ny; j++) {
      for (let i = 0; i <= this.nx; i++) {
        map(i / this.nx, j / this.ny, this.tmp);
        pos[k++] = this.tmp.x;
        pos[k++] = this.tmp.y;
      }
    }
    buf.update();
  }

  /** Gitter freigeben; die Textur gehört dem Aufrufer */
  destroy(): void {
    const geometry = this.mesh.geometry;
    this.mesh.destroy();
    geometry.destroy(true);
  }
}
