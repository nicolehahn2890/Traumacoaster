/**
 * MGraphics: Graphics, die in Metern beschrieben, aber intern in Zentimetern tesselliert wird.
 * Pixi berechnet die Segmentzahl von Kreisen/Bögen aus den lokalen Einheiten. Kleine Formen in Metern
 * (z. B. ein Auge mit r = 0,08) würden zu Vielecken. Diese Klasse skaliert alle Koordinaten mit U = 100
 * und setzt die eigene Skalierung auf 1/U, so dass Kurven glatt bleiben.
 */
import { Graphics, type FillInput, type StrokeInput } from 'pixi.js';

const U = 100;

export class MGraphics extends Graphics {
  constructor() {
    super();
    this.scale.set(1 / U);
  }
  /**
   * Größe setzen wie mit scale (1 = wie beschrieben). Nie scale direkt setzen: Das hebt die interne 1/U auf, und
   * die Form wird hundertmal so groß (so geschehen mit den Pupillen beim Schreck und den Lidern beim Blinzeln).
   */
  setSize(sx: number, sy = sx): this {
    this.scale.set(sx / U, sy / U);
    return this;
  }
  override circle(x: number, y: number, r: number): this {
    return super.circle(x * U, y * U, r * U);
  }
  override ellipse(x: number, y: number, hw: number, hh: number): this {
    return super.ellipse(x * U, y * U, hw * U, hh * U);
  }
  override rect(x: number, y: number, w: number, h: number): this {
    return super.rect(x * U, y * U, w * U, h * U);
  }
  override roundRect(x: number, y: number, w: number, h: number, r?: number): this {
    return super.roundRect(x * U, y * U, w * U, h * U, (r ?? 0) * U);
  }
  override moveTo(x: number, y: number): this {
    return super.moveTo(x * U, y * U);
  }
  override lineTo(x: number, y: number): this {
    return super.lineTo(x * U, y * U);
  }
  override quadraticCurveTo(cx: number, cy: number, x: number, y: number, smoothness?: number): this {
    return super.quadraticCurveTo(cx * U, cy * U, x * U, y * U, smoothness);
  }
  override bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number, smoothness?: number): this {
    return super.bezierCurveTo(c1x * U, c1y * U, c2x * U, c2y * U, x * U, y * U, smoothness);
  }
  override arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): this {
    return super.arc(x * U, y * U, r * U, start, end, ccw);
  }
  // poly akzeptiert number[] (x,y,x,y...) oder Punkt-Objekte
  override poly(points: number[] | Array<{ x: number; y: number }>, close?: boolean): this {
    if (points.length && typeof points[0] === 'number') return super.poly((points as number[]).map((v) => v * U), close);
    return super.poly((points as Array<{ x: number; y: number }>).map((p) => ({ x: p.x * U, y: p.y * U })), close);
  }
  override stroke(style?: StrokeInput): this {
    if (style && typeof style === 'object' && 'width' in style && typeof style.width === 'number') {
      return super.stroke({ ...style, width: style.width * U });
    }
    return super.stroke(style);
  }
  override fill(style?: FillInput): this {
    return super.fill(style);
  }
}
