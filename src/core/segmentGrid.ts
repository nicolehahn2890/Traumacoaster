/**
 * Raster über die Segmente einer Polylinie: Welche Segmente j liegen in der Nähe von Segment i?
 * Für Kreuzungs- und Fast-Kreuzungs-Suchen, die sonst jedes Paar prüfen müssten (O(n²); bei 400 Punkten
 * 160 000 Strecken-Abstände, rund 150 ms, zu langsam für die Vorschau beim Zeichnen).
 */
import type { Vec2 } from './math';

export class SegmentGrid {
  private cells = new Map<number, number[]>();
  private stamp: Int32Array;
  private tick = 0;
  private readonly count: number;

  constructor(
    private readonly pts: Vec2[],
    private readonly cell = 2,
  ) {
    this.count = Math.max(0, pts.length - 1);
    this.stamp = new Int32Array(this.count);
    for (let k = 0; k < this.count; k++) this.forCells(k, 0, (key) => {
      let list = this.cells.get(key);
      if (!list) {
        list = [];
        this.cells.set(key, list);
      }
      list.push(k);
    });
  }

  private forCells(k: number, pad: number, fn: (key: number) => void): void {
    const a = this.pts[k];
    const b = this.pts[k + 1];
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / this.cell);
    const x1 = Math.floor((Math.max(a.x, b.x) + pad) / this.cell);
    const y0 = Math.floor((Math.min(a.y, b.y) - pad) / this.cell);
    const y1 = Math.floor((Math.max(a.y, b.y) + pad) / this.cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) fn(cx * 73856093 + cy * 19349663);
  }

  /**
   * Segmente j (aufsteigend), deren Rechteck das um pad erweiterte Rechteck von Segment i überlappt,
   * beschränkt auf from ≤ j < to.
   */
  near(i: number, pad: number, from: number, to: number): number[] {
    const out: number[] = [];
    if (i < 0 || i >= this.count) return out;
    this.tick++;
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const minX = Math.min(a.x, b.x) - pad;
    const maxX = Math.max(a.x, b.x) + pad;
    const minY = Math.min(a.y, b.y) - pad;
    const maxY = Math.max(a.y, b.y) + pad;
    this.forCells(i, pad, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      for (const j of list) {
        if (j < from || j >= to || this.stamp[j] === this.tick) continue;
        this.stamp[j] = this.tick;
        const c = this.pts[j];
        const d = this.pts[j + 1];
        if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX || Math.max(c.y, d.y) < minY || Math.min(c.y, d.y) > maxY) continue;
        out.push(j);
      }
    });
    out.sort((p, q) => p - q);
    return out;
  }
}
