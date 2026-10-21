/**
 * Band-Mesh: eine Textur entlang einer Polylinie (Schienen, Geländer, Pfeiler-Stämme), wie die „Friezes“ in
 * Rayman Legends. Die Breite darf entlang des Bands variieren; UV.x ist die Bogenlänge (die Textur wiederholt
 * sich mit uScale je Meter), UV.y 0 … 1 über die Breite.
 */
import { Mesh, MeshGeometry, Texture } from 'pixi.js';

export interface StripPoint {
  x: number;
  y: number;
}

export interface StripGeometry {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/** Gitter aus 2n Punkten (links/rechts der Linie) mit Normalen senkrecht zur Richtung */
export function buildStrip(points: StripPoint[], halfWidth: number | ((s: number, i: number) => number), uScale = 1): StripGeometry {
  const n = points.length;
  const positions = new Float32Array(Math.max(0, n) * 4);
  const uvs = new Float32Array(Math.max(0, n) * 4);
  const indices = new Uint32Array(Math.max(0, n - 1) * 6);
  if (n < 2) return { positions, uvs, indices };
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i > 0) s += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    // Richtung: Mittel aus Vor- und Nachsegment (an den Enden einseitig)
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const hw = typeof halfWidth === 'function' ? halfWidth(s, i) : halfWidth;
    positions[i * 4] = p.x + nx * hw;
    positions[i * 4 + 1] = p.y + ny * hw;
    positions[i * 4 + 2] = p.x - nx * hw;
    positions[i * 4 + 3] = p.y - ny * hw;
    uvs[i * 4] = s * uScale;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = s * uScale;
    uvs[i * 4 + 3] = 1;
    if (i < n - 1) {
      const k = i * 6;
      const l0 = i * 2;
      const r0 = i * 2 + 1;
      const l1 = l0 + 2;
      const r1 = r0 + 2;
      indices[k] = l0; indices[k + 1] = r0; indices[k + 2] = l1;
      indices[k + 3] = r0; indices[k + 4] = r1; indices[k + 5] = l1;
    }
  }
  return { positions, uvs, indices };
}

export class StripMesh {
  readonly mesh: Mesh;

  constructor(texture: Texture) {
    const geometry = new MeshGeometry({ positions: new Float32Array(8), uvs: new Float32Array(8), indices: new Uint32Array(6) });
    this.mesh = new Mesh({ geometry, texture });
    this.mesh.visible = false;
  }

  setPath(points: StripPoint[], halfWidth: number | ((s: number, i: number) => number), uScale = 1): void {
    const g = buildStrip(points, halfWidth, uScale);
    if (points.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const geometry = this.mesh.geometry;
    const pos = geometry.getBuffer('aPosition');
    const uv = geometry.getBuffer('aUV');
    const idx = geometry.getIndex();
    pos.data = g.positions;
    uv.data = g.uvs;
    idx.data = g.indices;
    pos.update();
    uv.update();
    idx.update();
  }

  destroy(): void {
    const geometry = this.mesh.geometry;
    this.mesh.destroy();
    geometry.destroy(true);
  }
}
