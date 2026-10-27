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
  /** Auswahlbereich (Rechteck oder Lasso), gestrichelt */
  region: Pt[] | null;
  /** Rahmen der Formgruppe, in die man hineingegangen ist (fein gestrichelt) */
  group: Pt[] | null;
  /** wo gerade eingerastet wird (Ring) */
  snap: Pt | null;
  /** Rasterlinien der aktiven Ebene */
  grid: Array<[Pt, Pt]>;
  /** Fläche, auf die eine gezogene Farbe fiele (ColorDrop), mit Löchern */
  target: Pt[][] | null;
  /** Lupe der Pipette: Stelle und aufgenommene Farbe */
  loupe: (Pt & { color: string }) | null;
  /** Verlaufsregler am Objekt (Bild 5): Anfang, Ende, Stopps mit ihrer Farbe, Mitten; radial mit Kreis */
  gradient: { a: Pt; b: Pt; radial: boolean; stops: Array<Pt & { color: string; on: boolean; off: boolean }>; mids: Pt[] } | null;
}

export const emptyOverlay = (): OverlayState => ({ outlines: [], lines: [], face: null, box: null, handles: [], anchors: [], tangents: [], knobs: [], preview: null, stroke: null, region: null, group: null, snap: null, grid: [], target: null, loupe: null, gradient: null });

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
  private readonly regionPath = document.createElementNS(NS, 'path');
  private readonly groupPath = document.createElementNS(NS, 'path');
  private readonly gridPath = document.createElementNS(NS, 'path');
  private readonly snapRing = document.createElementNS(NS, 'circle');
  private readonly tangentPath = document.createElementNS(NS, 'path');
  private readonly anchorGroup = document.createElementNS(NS, 'g');
  private readonly knobGroup = document.createElementNS(NS, 'g');
  private readonly handleGroup = document.createElementNS(NS, 'g');
  private readonly targetPath = document.createElementNS(NS, 'path');
  private readonly loupeRing = document.createElementNS(NS, 'circle');
  private readonly gradGroup = document.createElementNS(NS, 'g');
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
    this.regionPath.setAttribute('class', 'ze-region');
    this.groupPath.setAttribute('class', 'ze-groupbox');
    this.gridPath.setAttribute('class', 'ze-grid');
    this.snapRing.setAttribute('class', 'ze-snap');
    this.snapRing.setAttribute('r', '7');
    this.tangentPath.setAttribute('class', 'ze-tangent');
    this.targetPath.setAttribute('class', 'ze-target');
    this.targetPath.setAttribute('fill-rule', 'evenodd');
    this.loupeRing.setAttribute('class', 'ze-loupe');
    this.loupeRing.setAttribute('r', '26');
    this.el.append(this.targetPath, this.gradGroup, this.loupeRing, this.gridPath, this.groupPath, this.facePath, this.outlinePath, this.linePath, this.boxPath, this.previewPath, this.strokePath, this.regionPath, this.tangentPath, this.anchorGroup, this.knobGroup, this.handleGroup, this.snapRing);
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

  /** Verlaufsregler: Linie doppelt (dunkel unter hell), Anfang als offener Kreis, Ende als Punkt, Stopps als Farbfelder */
  private drawGradient(g: OverlayState['gradient']): void {
    this.gradGroup.replaceChildren();
    if (!g) return;
    const add = (tag: string, attrs: Record<string, string | number>, cls: string) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v);
      e.setAttribute('class', cls);
      this.gradGroup.append(e);
      return e;
    };
    if (g.radial) add('circle', { cx: g.a.x, cy: g.a.y, r: Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) }, 'ze-gcircle');
    add('line', { x1: g.a.x, y1: g.a.y, x2: g.b.x, y2: g.b.y }, 'ze-gline-under');
    add('line', { x1: g.a.x, y1: g.a.y, x2: g.b.x, y2: g.b.y }, 'ze-gline');
    for (const m of g.mids) add('rect', { x: m.x - 3.5, y: m.y - 3.5, width: 7, height: 7, transform: `rotate(45 ${m.x.toFixed(1)} ${m.y.toFixed(1)})` }, 'ze-gmid');
    add('circle', { cx: g.a.x, cy: g.a.y, r: 6 }, 'ze-gstart');
    add('circle', { cx: g.b.x, cy: g.b.y, r: 6 }, 'ze-gend');
    for (const st of g.stops) {
      const r = st.on ? 9 : 7;
      const e = add('rect', { x: st.x - r, y: st.y - r, width: r * 2, height: r * 2, rx: 3 }, st.on ? 'ze-gstop on' : 'ze-gstop');
      e.style.fill = st.color;
      if (st.off) e.style.opacity = '0.35';
    }
  }

  draw(s: OverlayState): void {
    this.facePath.setAttribute('d', s.face ? s.face.map(ring).join('') : '');
    this.targetPath.setAttribute('d', s.target ? s.target.map(ring).join('') : '');
    this.drawGradient(s.gradient);
    this.loupeRing.style.display = s.loupe ? '' : 'none';
    if (s.loupe) {
      // über dem Finger, damit er die Farbe nicht verdeckt
      this.loupeRing.setAttribute('cx', s.loupe.x.toFixed(1));
      this.loupeRing.setAttribute('cy', (s.loupe.y - 70).toFixed(1));
      this.loupeRing.style.fill = s.loupe.color;
    }
    this.outlinePath.setAttribute('d', s.outlines.map(ring).join(''));
    this.linePath.setAttribute('d', s.lines.map(open).join(''));
    this.boxPath.setAttribute('d', s.box ? ring(s.box) : '');
    this.previewPath.setAttribute('d', s.preview ? ring(s.preview) : '');
    this.strokePath.setAttribute('d', s.stroke ? open(s.stroke) : '');
    this.regionPath.setAttribute('d', s.region && s.region.length > 1 ? ring(s.region) : '');
    this.groupPath.setAttribute('d', s.group ? ring(s.group) : '');
    this.gridPath.setAttribute('d', s.grid.map(([a, b]) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join(''));
    this.snapRing.style.display = s.snap ? '' : 'none';
    if (s.snap) {
      this.snapRing.setAttribute('cx', s.snap.x.toFixed(1));
      this.snapRing.setAttribute('cy', s.snap.y.toFixed(1));
    }
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
