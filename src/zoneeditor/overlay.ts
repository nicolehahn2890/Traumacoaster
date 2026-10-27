/**
 * Griffe und Umrisse des Zonen-Editors als SVG über dem Spielbild (Stufe 1 und 2, Plan 5.1): scharf in jeder Auflösung,
 * ohne die Welt neu zu zeichnen. Der Editor rechnet die Bildpunkte (aus der Kamera der Ansicht) und reicht sie hierher.
 */
const NS = 'http://www.w3.org/2000/svg';

export interface Pt {
  x: number;
  y: number;
}

export interface OverlayState {
  /** geschlossene Umrisse (Bildpunkte), etwa die gewählte Form */
  outlines: Pt[][];
  /** offene Linien: Teilungslinien der gewählten Form, Vorschau des Zeichenstifts */
  lines: Pt[][];
  /** gewählte Fläche (halbdurchsichtig gefüllt, mit Löchern) */
  face: Pt[][] | null;
  /** Rahmen der Auswahl als Viereck (vier Ecken), oder null */
  box: Pt[] | null;
  /** Griffe des Rahmens (Quadrate) */
  handles: Pt[];
  /** Anker der Pfade (kleine Quadrate); on: gewählt */
  anchors: Array<Pt & { on?: boolean }>;
  /** Griff-Linien vom Anker zum Kontrollpunkt */
  tangents: Array<[Pt, Pt]>;
  /** Kontrollpunkte (Kreise) */
  knobs: Pt[];
  /** Vorschau beim Aufziehen einer Grundform */
  preview: Pt[] | null;
  /** Freihandstrich (Formpinsel, Messer) */
  stroke: Pt[] | null;
}

export const emptyOverlay = (): OverlayState => ({ outlines: [], lines: [], face: null, box: null, handles: [], anchors: [], tangents: [], knobs: [], preview: null, stroke: null });

const ring = (pts: Pt[]): string => (pts.length ? `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z` : '');
const open = (pts: Pt[]): string => (pts.length > 1 ? `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}` : '');

export class EditorOverlay {
  readonly el = document.createElementNS(NS, 'svg');
  private readonly facePath = document.createElementNS(NS, 'path');
  private readonly outlinePath = document.createElementNS(NS, 'path');
  private readonly linePath = document.createElementNS(NS, 'path');
  private readonly boxPath = document.createElementNS(NS, 'path');
  private readonly previewPath = document.createElementNS(NS, 'path');
  private readonly strokePath = document.createElementNS(NS, 'path');
  private readonly tangentPath = document.createElementNS(NS, 'path');
  private readonly anchorGroup = document.createElementNS(NS, 'g');
  private readonly knobGroup = document.createElementNS(NS, 'g');
  private readonly handleGroup = document.createElementNS(NS, 'g');
  /** Kantenlänge der Rahmen-Griffe (Pixel); auf Touch-Geräten größer */
  handleSize = 9;

  constructor() {
    this.el.setAttribute('class', 'ze-overlay');
    this.facePath.setAttribute('class', 'ze-face');
    this.facePath.setAttribute('fill-rule', 'evenodd');
    this.outlinePath.setAttribute('class', 'ze-outline');
    this.linePath.setAttribute('class', 'ze-line');
    this.boxPath.setAttribute('class', 'ze-box');
    this.previewPath.setAttribute('class', 'ze-preview');
    this.strokePath.setAttribute('class', 'ze-stroke');
    this.tangentPath.setAttribute('class', 'ze-tangent');
    this.el.append(this.facePath, this.outlinePath, this.linePath, this.boxPath, this.previewPath, this.strokePath, this.tangentPath, this.anchorGroup, this.knobGroup, this.handleGroup);
  }

  set visible(on: boolean) {
    this.el.style.display = on ? '' : 'none';
  }

  /** Anzahl Kindelemente einer Gruppe angleichen */
  private pool(g: SVGGElement, n: number, tag: 'rect' | 'circle', cls: string): void {
    while (g.childNodes.length > n) g.lastChild!.remove();
    while (g.childNodes.length < n) {
      const r = document.createElementNS(NS, tag);
      r.setAttribute('class', cls);
      g.append(r);
    }
  }

  draw(s: OverlayState): void {
    this.facePath.setAttribute('d', s.face ? s.face.map(ring).join('') : '');
    this.outlinePath.setAttribute('d', s.outlines.map(ring).join(''));
    this.linePath.setAttribute('d', s.lines.map(open).join(''));
    this.boxPath.setAttribute('d', s.box ? ring(s.box) : '');
    this.previewPath.setAttribute('d', s.preview ? ring(s.preview) : '');
    this.strokePath.setAttribute('d', s.stroke ? open(s.stroke) : '');
    this.tangentPath.setAttribute('d', s.tangents.map(([a, b]) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join(''));
    const h = this.handleSize;
    this.pool(this.handleGroup, s.handles.length, 'rect', 'ze-handle');
    s.handles.forEach((p, i) => {
      const r = this.handleGroup.childNodes[i] as SVGRectElement;
      r.setAttribute('x', (p.x - h / 2).toFixed(1));
      r.setAttribute('y', (p.y - h / 2).toFixed(1));
      r.setAttribute('width', String(h));
      r.setAttribute('height', String(h));
    });
    const a = Math.max(6, h - 3);
    this.pool(this.anchorGroup, s.anchors.length, 'rect', 'ze-anchor');
    s.anchors.forEach((p, i) => {
      const r = this.anchorGroup.childNodes[i] as SVGRectElement;
      r.setAttribute('x', (p.x - a / 2).toFixed(1));
      r.setAttribute('y', (p.y - a / 2).toFixed(1));
      r.setAttribute('width', String(a));
      r.setAttribute('height', String(a));
      r.setAttribute('class', p.on ? 'ze-anchor on' : 'ze-anchor');
    });
    this.pool(this.knobGroup, s.knobs.length, 'circle', 'ze-cp');
    s.knobs.forEach((p, i) => {
      const c = this.knobGroup.childNodes[i] as SVGCircleElement;
      c.setAttribute('cx', p.x.toFixed(1));
      c.setAttribute('cy', p.y.toFixed(1));
      c.setAttribute('r', String(Math.max(3.5, a / 2)));
    });
  }
}
