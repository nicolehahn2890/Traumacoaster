/**
 * Kamera: Bühnen-Meter ↔ Bildschirm-Pixel. Y zeigt in der Bühne nach oben.
 * Folgt dem Zug mit Vorhalt und tempoabhängigem Zoom, oder zeigt die ganze Bahn.
 */
import { clamp, lerp } from '@/core/math';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class Camera {
  /** Mittelpunkt in Bühnen-Metern */
  x = 30;
  y = 10;
  /** Pixel pro Meter */
  zoom = 12;
  width = 800;
  height = 600;
  minZoom = 3;
  maxZoom = 60;
  /** Zielwerte für weiche Bewegung */
  private tx = 30;
  private ty = 10;
  private tz = 12;
  smoothing = 6;
  /** während Pan/Pinch keine Glättung */
  direct = false;
  /** Wackeln (Bühnen-Meter), klingt linear ab; die Weltansicht addiert ox/oy auf die Position */
  ox = 0;
  oy = 0;
  private shakeAmp = 0;
  private shakeLeft = 0;
  private shakeDur = 0;
  private shakeTime = 0;
  /**
   * Weiche Begrenzung (Feld eines Levels, Plan 2.3): Beim Ziehen darf die Kamera etwas über den Rand hinaus, danach
   * federt sie zurück; die Zielwerte bleiben immer im Rand. null = keine Begrenzung.
   */
  softBounds: Bounds | null = null;

  shake(amp = 0.6, dur = 0.3): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeLeft / Math.max(1e-6, this.shakeDur)), amp);
    this.shakeLeft = dur;
    this.shakeDur = dur;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  toScreen(X: number, Y: number): { x: number; y: number } {
    return { x: (X - this.x) * this.zoom + this.width / 2, y: this.height / 2 - (Y - this.y) * this.zoom };
  }
  toStage(sx: number, sy: number): { X: number; Y: number } {
    return { X: (sx - this.width / 2) / this.zoom + this.x, Y: (this.height / 2 - sy) / this.zoom + this.y };
  }

  /** sichtbarer Bereich in Bühnen-Metern */
  get view(): Bounds {
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
  }

  /** Zielposition und -zoom (die Kamera gleitet dorthin) */
  get target(): { x: number; y: number; zoom: number } {
    return { x: this.tx, y: this.ty, zoom: this.tz };
  }

  setTarget(x: number, y: number, zoom?: number): void {
    this.tx = x;
    this.ty = y;
    if (zoom !== undefined) this.tz = clamp(zoom, this.minZoom, this.maxZoom);
  }
  snap(): void {
    this.x = this.tx;
    this.y = this.ty;
    this.zoom = this.tz;
  }
  /** Sofort setzen (Pan/Pinch) */
  set(x: number, y: number, zoom?: number): void {
    this.x = this.tx = x;
    this.y = this.ty = y;
    if (zoom !== undefined) this.zoom = this.tz = clamp(zoom, this.minZoom, this.maxZoom);
  }
  /** Zoom um einen Bildschirmpunkt herum */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toStage(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.toStage(sx, sy);
    this.x += before.X - after.X;
    this.y += before.Y - after.Y;
    this.tx = this.x;
    this.ty = this.y;
    this.tz = this.zoom;
  }
  panBy(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
    this.tx = this.x;
    this.ty = this.y;
  }

  /** Ziel: Bereich komplett sichtbar, mit Rand (Anteil) */
  fitBounds(b: Bounds, margin = 0.12, maxZoom = this.maxZoom): void {
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const zx = (this.width * (1 - margin * 2)) / w;
    const zy = (this.height * (1 - margin * 2)) / h;
    this.setTarget((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.min(zx, zy, maxZoom));
  }

  update(dt: number): void {
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this.shakeTime += dt;
      const k = this.shakeAmp * (this.shakeLeft / Math.max(1e-6, this.shakeDur));
      this.ox = k * Math.sin(this.shakeTime * 47);
      this.oy = k * Math.cos(this.shakeTime * 53);
      if (this.shakeLeft <= 0) {
        this.ox = 0;
        this.oy = 0;
        this.shakeAmp = 0;
      }
    }
    if (this.softBounds) this.applySoftBounds(dt);
    if (this.direct) return;
    const k = 1 - Math.exp(-this.smoothing * dt);
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    this.zoom = lerp(this.zoom, this.tz, k);
  }

  /** Rand der weichen Begrenzung in Bühnen-Metern (die halbe Sicht bleibt innerhalb des Felds) */
  private softLimits(): Bounds {
    const b = this.softBounds!;
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    const minX = Math.min(b.minX + hw, b.maxX - hw);
    const maxX = Math.max(b.minX + hw, b.maxX - hw);
    const minY = Math.min(b.minY + hh, b.maxY - hh);
    const maxY = Math.max(b.minY + hh, b.maxY - hh);
    return { minX, maxX, minY, maxY };
  }

  private applySoftBounds(dt: number): void {
    const l = this.softLimits();
    // Ziele hart im Rand (Autoscroll, Folgen des Zugs), die Lage beim Ziehen bis zu einem Viertel der Sicht darüber hinaus
    this.tx = clamp(this.tx, l.minX, l.maxX);
    this.ty = clamp(this.ty, l.minY, l.maxY);
    if (this.direct) {
      const ox = this.width / 4 / this.zoom;
      const oy = this.height / 4 / this.zoom;
      this.x = clamp(this.x, l.minX - ox, l.maxX + ox);
      this.y = clamp(this.y, l.minY - oy, l.maxY + oy);
      return;
    }
    // losgelassen: zurückfedern
    const k = 1 - Math.exp(-8 * dt);
    this.x = lerp(this.x, clamp(this.x, l.minX, l.maxX), k);
    this.y = lerp(this.y, clamp(this.y, l.minY, l.maxY), k);
  }

  /** Zoom, bei dem ein Bereich gerade ins Bild passt (Zoom-Grenze „Feld passt ins Bild“) */
  fitZoom(b: Bounds): number {
    return Math.min(this.width / Math.max(1, b.maxX - b.minX), this.height / Math.max(1, b.maxY - b.minY));
  }

  /** Begrenzt das Ziel so, dass die Kamera nicht zu weit aus dem Level fliegt */
  clampTo(b: Bounds): void {
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    this.tx = clamp(this.tx, b.minX + hw * 0.5, b.maxX - hw * 0.5);
    this.ty = clamp(this.ty, b.minY + hh * 0.3, b.maxY);
  }
}
