/**
 * Griffe und Umrisse des Zonen-Editors als SVG über dem Spielbild (Stufe 1, Plan 5.1): scharf in jeder Auflösung, ohne
 * die Welt neu zu zeichnen. Der Editor rechnet die Bildpunkte (aus der Kamera der Ansicht) und reicht sie hierher.
 */
const NS = 'http://www.w3.org/2000/svg';

export interface OverlayHandle {
  x: number;
  y: number;
}

export interface OverlayState {
  /** geschlossene Umrisse (Bildpunkte), etwa die gewählte Form */
  outlines: Array<Array<{ x: number; y: number }>>;
  /** Rahmen der Auswahl als Viereck (vier Ecken), oder null */
  box: Array<{ x: number; y: number }> | null;
  handles: OverlayHandle[];
  /** Vorschau beim Aufziehen einer Grundform */
  preview: Array<{ x: number; y: number }> | null;
}

export class EditorOverlay {
  readonly el = document.createElementNS(NS, 'svg');
  private readonly outlinePath = document.createElementNS(NS, 'path');
  private readonly boxPath = document.createElementNS(NS, 'path');
  private readonly previewPath = document.createElementNS(NS, 'path');
  private readonly handleGroup = document.createElementNS(NS, 'g');
  /** Kantenlänge der Griffe (Pixel); auf Touch-Geräten größer */
  handleSize = 9;

  constructor() {
    this.el.setAttribute('class', 'ze-overlay');
    this.outlinePath.setAttribute('class', 'ze-outline');
    this.boxPath.setAttribute('class', 'ze-box');
    this.previewPath.setAttribute('class', 'ze-preview');
    this.el.append(this.outlinePath, this.boxPath, this.previewPath, this.handleGroup);
  }

  set visible(on: boolean) {
    this.el.style.display = on ? '' : 'none';
  }

  draw(s: OverlayState): void {
    const ring = (pts: Array<{ x: number; y: number }>): string => (pts.length ? `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z` : '');
    this.outlinePath.setAttribute('d', s.outlines.map(ring).join(''));
    this.boxPath.setAttribute('d', s.box ? ring(s.box) : '');
    this.previewPath.setAttribute('d', s.preview ? ring(s.preview) : '');
    const h = this.handleSize;
    while (this.handleGroup.childNodes.length > s.handles.length) this.handleGroup.lastChild!.remove();
    while (this.handleGroup.childNodes.length < s.handles.length) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', 'ze-handle');
      this.handleGroup.append(r);
    }
    s.handles.forEach((p, i) => {
      const r = this.handleGroup.childNodes[i] as SVGRectElement;
      r.setAttribute('x', (p.x - h / 2).toFixed(1));
      r.setAttribute('y', (p.y - h / 2).toFixed(1));
      r.setAttribute('width', String(h));
      r.setAttribute('height', String(h));
    });
  }
}
