/**
 * Oberfläche des Zonen-Editors (Stufe 1, Plan 4.2): HTML über dem Spielbild, so minimalistisch und ruhig wie möglich
 * (Florian, 27.10.2026): dunkle, halbdurchsichtige Flächen, wenige Knöpfe, Bedienfelder nur, solange sie gebraucht
 * werden. Links die Werkzeuge, rechts oben Ansicht und Kamera, rechts die Ebenen mit Vorschau, Abstandspillen und
 * Tiefenleiste, unten die Leiste der Auswahl. Platzhalter: das genaue Aussehen (Farben, Maße, Zeichen).
 *
 * Diese Datei baut nur Elemente und meldet Bedienungen über `UiActions`; was sie bedeuten, entscheidet der Editor.
 */
import { PLANE_ROLE_WORDS, PLANE_ROLES, type PlaneRole, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { VIEW_WORDS, type ViewMode } from './views';

export type Tool = 'select' | 'rect' | 'ellipse';
export type Isolate = 'off' | 'front' | 'only';
export const ISOLATE_WORDS: Record<Isolate, string> = { off: 'alle Ebenen', front: 'davor ausgeblendet', only: 'nur diese' };

/** Platzhalter-Farben bis zur Palette der Stufe 3 (ruhig, eher Earle als Bonbon) */
export const SWATCHES = ['#3d5a63', '#5b7f7a', '#8aa58c', '#c9c09a', '#d9a07a', '#a3665a', '#6b5a8a', '#c6d4dc'];

export interface UiActions {
  tool(t: Tool): void;
  view(v: ViewMode | 'side'): void;
  undo(): void;
  redo(): void;
  save(): void;
  toggleBuild(): void;
  addPlane(): void;
  selectPlane(id: string): void;
  togglePlaneHidden(id: string): void;
  togglePlaneLocked(id: string): void;
  renamePlane(id: string, name: string): void;
  /** Abstandsgriff: Ziehen beginnt, ändert (Meter), endet */
  gapStart(frontId: string): void;
  gapChange(frontId: string, gap: number): void;
  gapEnd(): void;
  /** Tiefenleiste: eine Ebene allein in der Tiefe schieben */
  depthStart(id: string): void;
  depthChange(id: string, z: number): void;
  depthEnd(): void;
  toggleHold(): void;
  setRole(role: PlaneRole): void;
  setIsolate(i: Isolate): void;
  deletePlane(): void;
  fill(color: string): void;
  duplicate(): void;
  orderShape(dir: 1 | -1): void;
  deleteShape(): void;
  tilt(deg: number): void;
  fov(deg: number): void;
  addProbe(): void;
  restore(): void;
  discardBackup(): void;
}

export interface LayerRow {
  plane: ZonePlane;
  shapes: ZoneShape[];
  /** Abstand zur nächsten Ebene dahinter (Meter), null bei der hintersten */
  gap: number | null;
}

const CSS = `
.ze-root{position:fixed;inset:0;z-index:30;pointer-events:none;font:13px/1.3 -apple-system,BlinkMacSystemFont,"Helvetica Neue",system-ui,sans-serif;color:#e7e5e0;-webkit-font-smoothing:antialiased}
.ze-root *{box-sizing:border-box}
.ze-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.ze-outline{fill:none;stroke:#8db4ff;stroke-width:1.5}
.ze-box{fill:none;stroke:#8db4ff;stroke-width:1;stroke-dasharray:4 3;opacity:.9}
.ze-preview{fill:rgba(141,180,255,.12);stroke:#8db4ff;stroke-width:1.2}
.ze-handle{fill:#16181c;stroke:#8db4ff;stroke-width:1.5}
.ze-panel{position:absolute;pointer-events:auto;background:rgba(22,24,28,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.07);border-radius:12px;touch-action:none;user-select:none;-webkit-user-select:none}
.ze-btn{appearance:none;border:0;background:transparent;color:inherit;font:inherit;min-width:36px;height:36px;padding:0 10px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.ze-btn:hover{background:rgba(255,255,255,.06)}
.ze-btn.on{background:rgba(255,255,255,.13)}
.ze-btn:disabled{opacity:.35;cursor:default}
.ze-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6}
@media (pointer:coarse){.ze-btn{min-width:44px;height:44px}.ze-stats{top:calc(env(safe-area-inset-top,0px) + 70px)}}
.ze-top{left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:2px;padding:4px}
.ze-zone{padding:0 8px 0 6px;color:#bdbab3}
.ze-dot{width:7px;height:7px;border-radius:50%;background:#7fc69a;margin-right:4px}
.ze-dot.dirty{background:#e0b25c}
.ze-stats{position:absolute;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 62px);color:rgba(231,229,224,.55);font-size:11px;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.35);pointer-events:none}
.ze-sep{width:1px;height:22px;background:rgba(255,255,255,.08);margin:0 4px}
.ze-views{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:2px;padding:4px}
.ze-cam{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);width:250px;padding:10px 12px;display:none}
@media (pointer:coarse){.ze-cam{top:calc(env(safe-area-inset-top,0px) + 72px)}}
.ze-cam.open{display:block}
.ze-slider{display:grid;grid-template-columns:70px 1fr 38px;align-items:center;gap:8px;height:34px}
.ze-track{position:relative;height:28px;touch-action:none;cursor:pointer}
.ze-track::before{content:"";position:absolute;left:0;right:0;top:13px;height:2px;border-radius:1px;background:rgba(255,255,255,.18)}
.ze-knob{position:absolute;top:5px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#e7e5e0}
.ze-val{text-align:right;color:#bdbab3;font-variant-numeric:tabular-nums}
.ze-tools{left:calc(env(safe-area-inset-left,0px) + 12px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:2px;padding:4px}
.ze-layers{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:264px;display:flex;flex-direction:column;padding:6px}
@media (pointer:coarse){.ze-layers{top:calc(env(safe-area-inset-top,0px) + 72px);width:280px}}
.ze-layers.camopen{top:calc(env(safe-area-inset-top,0px) + 196px)}
.ze-head{display:flex;align-items:center;gap:2px;padding:0 0 4px 8px}
.ze-head .ze-title{flex:1;color:#bdbab3;cursor:pointer;white-space:nowrap}
.ze-layers.collapsed{bottom:auto}
.ze-layers.collapsed .ze-depth,.ze-layers.collapsed .ze-list,.ze-layers.collapsed .ze-foot{display:none}
.ze-hold{font-size:11px;color:#bdbab3}
.ze-depth{position:relative;height:26px;margin:2px 6px 6px;touch-action:none}
.ze-depth::before{content:"";position:absolute;left:0;right:0;top:12px;height:2px;background:rgba(255,255,255,.1);border-radius:1px}
.ze-tick{position:absolute;top:4px;width:3px;height:18px;margin-left:-1.5px;border-radius:2px;background:rgba(255,255,255,.35);cursor:ew-resize}
.ze-tick.on{background:#8db4ff;width:4px}
.ze-tick::after{content:"";position:absolute;left:-8px;right:-8px;top:-4px;bottom:-4px}
.ze-list{flex:1;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-right:2px}
.ze-row{display:flex;align-items:center;gap:6px;height:40px;padding:0 4px 0 6px;border-radius:8px;cursor:pointer}
@media (pointer:coarse){.ze-row{height:46px}}
.ze-row.on{background:rgba(255,255,255,.09)}
.ze-row canvas{width:48px;height:28px;border-radius:4px;background:rgba(255,255,255,.04);flex:none}
.ze-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ze-name input{width:100%;font:inherit;color:inherit;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 5px;user-select:text;-webkit-user-select:text}
.ze-role{color:#8f8c86;font-size:11px}
.ze-row .ze-btn{min-width:30px;height:30px;padding:0;opacity:.55}
.ze-row .ze-btn.on{background:transparent;opacity:1}
.ze-gap{display:flex;justify-content:center;height:18px;align-items:center}
.ze-pill{font-size:11px;color:#bdbab3;padding:1px 9px;border-radius:9px;background:rgba(255,255,255,.06);cursor:ns-resize;touch-action:none;font-variant-numeric:tabular-nums}
@media (pointer:coarse){.ze-gap{height:24px}.ze-pill{padding:3px 12px}}
.ze-pill.drag{background:rgba(141,180,255,.25);color:#fff}
.ze-pill input{width:56px;font:inherit;color:inherit;background:transparent;border:0;text-align:center;user-select:text;-webkit-user-select:text}
.ze-foot{display:flex;gap:2px;padding-top:4px;border-top:1px solid rgba(255,255,255,.06);margin-top:4px}
.ze-foot .ze-btn{font-size:11px;color:#8f8c86;height:30px}
.ze-context{left:calc(env(safe-area-inset-left,0px) + 64px);right:calc(env(safe-area-inset-right,0px) + 290px);margin:0 auto;width:max-content;max-width:calc(100vw - 354px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:none;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px;padding:4px}
@media (pointer:coarse){.ze-context{right:calc(env(safe-area-inset-right,0px) + 306px);max-width:calc(100vw - 370px)}}
.ze-context.show{display:flex}
.ze-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;margin:0 2px;cursor:pointer;flex:none}
@media (pointer:coarse){.ze-swatch{width:30px;height:30px}}
.ze-swatch.on{border-color:#e7e5e0}
.ze-label{color:#8f8c86;font-size:11px;padding:0 6px 0 8px}
.ze-toast{left:calc(env(safe-area-inset-left,0px) + 12px);bottom:calc(env(safe-area-inset-bottom,0px) + 32px);padding:9px 12px;opacity:0;transition:opacity .25s;pointer-events:none}
.ze-toast.show{opacity:1}
.ze-banner{left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);display:none;align-items:center;gap:4px;padding:4px 4px 4px 12px}
.ze-banner.show{display:flex}
@media (max-width:820px){.ze-views{top:calc(env(safe-area-inset-top,0px) + 64px)}.ze-cam{top:calc(env(safe-area-inset-top,0px) + 116px)}.ze-layers{top:calc(env(safe-area-inset-top,0px) + 116px);width:min(264px,44vw)}.ze-layers.camopen{top:calc(env(safe-area-inset-top,0px) + 248px)}}
@media (max-width:820px) and (pointer:coarse){.ze-views{top:calc(env(safe-area-inset-top,0px) + 72px)}.ze-cam{top:calc(env(safe-area-inset-top,0px) + 132px)}.ze-layers{top:calc(env(safe-area-inset-top,0px) + 132px)}}
@media (max-width:700px){.ze-role{display:none}.ze-row canvas{width:36px}.ze-hold{font-size:10px;padding:0 4px}.ze-toast{bottom:calc(env(safe-area-inset-bottom,0px) + 132px)}.ze-layers{bottom:calc(env(safe-area-inset-bottom,0px) + 128px)}.ze-context{left:calc(env(safe-area-inset-left,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);max-width:none;width:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 8px)}.ze-stats{display:none}}
.ze-root.play .ze-tools,.ze-root.play .ze-layers,.ze-root.play .ze-context,.ze-root.play .ze-cam,.ze-root.play .ze-top,.ze-root.play .ze-overlay,.ze-root.play .ze-viewbtn,.ze-root.play .ze-stats{display:none}
`;

const ICONS: Record<Tool, string> = {
  select: '<svg viewBox="0 0 24 24"><path d="M6 3l12 9-5.5 1.2L15 20l-2.6 1-2.6-6.6L6 18z"/></svg>',
  rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8.5" ry="6"/></svg>',
};
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1C11 6 11.5 6 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.4-1"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const UNDO = '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12"/></svg>';
const REDO = '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12"/></svg>';

const TOOL_TITLES: Record<Tool, string> = { select: 'Auswahl (V)', rect: 'Rechteck (M)', ellipse: 'Ellipse (L)' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function button(label: string, title: string, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `ze-btn ${cls}`.trim(), label);
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

const fmt = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

/** schmaler Regler ohne <input type=range> (auf dem iPad mit touch-action: none zuverlässiger, wie im Kamera-Panel) */
class Slider {
  readonly el = el('div', 'ze-slider');
  private readonly track = el('div', 'ze-track');
  private readonly knob = el('div', 'ze-knob');
  private readonly value = el('span', 'ze-val');

  constructor(
    label: string,
    private readonly min: number,
    private readonly max: number,
    private readonly onChange: (v: number) => void,
  ) {
    this.el.append(el('span', 'ze-label', label), this.track, this.value);
    this.track.append(this.knob);
    const at = (e: PointerEvent) => {
      const r = this.track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.onChange(Math.round((this.min + t * (this.max - this.min)) * 2) / 2);
    };
    this.track.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.track.setPointerCapture(e.pointerId);
      at(e);
    });
    this.track.addEventListener('pointermove', (e) => {
      if (this.track.hasPointerCapture(e.pointerId)) at(e);
    });
  }

  set(v: number): void {
    this.knob.style.left = `${((v - this.min) / (this.max - this.min)) * 100}%`;
    this.value.textContent = `${fmt(v, 0)}°`;
  }
}

export class EditorUi {
  readonly root = el('div', 'ze-root');
  private readonly top = el('div', 'ze-panel ze-top');
  private readonly dot = el('span', 'ze-dot');
  private readonly stats = el('span', 'ze-stats');
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly views = el('div', 'ze-panel ze-views');
  private readonly viewBtns = new Map<ViewMode | 'side', HTMLButtonElement>();
  private readonly camBtn: HTMLButtonElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly cam = el('div', 'ze-panel ze-cam');
  private readonly tiltSlider: Slider;
  private readonly fovSlider: Slider;
  private readonly tools = el('div', 'ze-panel ze-tools');
  private readonly toolBtns = new Map<Tool, HTMLButtonElement>();
  private readonly layers = el('div', 'ze-panel ze-layers');
  private readonly holdBtn: HTMLButtonElement;
  private readonly depth = el('div', 'ze-depth');
  private readonly list = el('div', 'ze-list');
  private readonly context = el('div', 'ze-panel ze-context');
  private readonly toastEl = el('div', 'ze-panel ze-toast');
  private readonly banner = el('div', 'ze-panel ze-banner');
  private readonly bannerText = el('span');
  private toastTimer = 0;
  /** Zeile, deren Name gerade bearbeitet wird (dann nicht neu aufbauen) */
  private editing: string | null = null;
  /** gerade gezogene Abstandspille oder Tiefenmarke (dann nur Zahlen nachführen) */
  private dragging = false;
  private thumbs = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly a: UiActions,
    zoneName: string,
    overlay: SVGSVGElement,
  ) {
    const style = el('style');
    style.textContent = CSS;
    this.root.append(style, overlay);

    // oben links: Zone, Sicherungsstand, Rückgängig, Sichern, Messwerte
    this.undoBtn = button(UNDO, 'Rückgängig (Cmd+Z, zwei Finger tippen)', () => a.undo());
    this.redoBtn = button(REDO, 'Wiederholen (Shift+Cmd+Z, drei Finger tippen)', () => a.redo());
    const name = el('span', 'ze-zone');
    name.append(this.dot, document.createTextNode(zoneName));
    this.top.append(name, button('Sichern', 'Sichern (Cmd+S)', () => a.save()), el('span', 'ze-sep'), this.undoBtn, this.redoBtn);

    // oben rechts: Ansichten, Kamera, Spielen
    for (const v of ['game', 'front', 'free', 'side'] as const) {
      const b = button(VIEW_WORDS[v], `${VIEW_WORDS[v]} (${['game', 'front', 'free', 'side'].indexOf(v) + 1})`, () => a.view(v), 'ze-viewbtn');
      this.viewBtns.set(v, b);
      this.views.append(b);
    }
    this.camBtn = button('Kamera', 'Neigung und Bildwinkel des Spielblicks', () => this.toggleCam(), 'ze-viewbtn');
    this.modeBtn = button('Spielen', 'Bauen oder Spielen (Tab)', () => a.toggleBuild());
    this.views.append(el('span', 'ze-sep ze-viewbtn'), this.camBtn, this.modeBtn);
    this.tiltSlider = new Slider('Neigung', 1, 45, (v) => a.tilt(v));
    this.fovSlider = new Slider('Bildwinkel', 5, 50, (v) => a.fov(v));
    this.cam.append(this.tiltSlider.el, this.fovSlider.el);

    // links: Werkzeuge
    for (const t of ['select', 'rect', 'ellipse'] as const) {
      const b = button(ICONS[t], TOOL_TITLES[t], () => a.tool(t));
      this.toolBtns.set(t, b);
      this.tools.append(b);
    }

    // rechts: Ebenen
    const head = el('div', 'ze-head');
    this.holdBtn = button('Bild halten', '„Bild halten“: Abstand ändern, ohne dass sich das Bild im Spielblick ändert; sonst „Welt halten“', () => a.toggleHold(), 'ze-hold');
    const title = el('span', 'ze-title', 'Ebenen ▾');
    title.title = 'Liste ein- und ausklappen';
    title.addEventListener('click', () => {
      const c = this.layers.classList.toggle('collapsed');
      title.textContent = c ? 'Ebenen ▸' : 'Ebenen ▾';
    });
    head.append(title, this.holdBtn, button('+', 'Neue Ebene hinter der aktiven', () => a.addPlane()));
    const foot = el('div', 'ze-foot');
    foot.append(button('Probe: Scheiben-Stapel', '32 Ebenen aus der Kamerasession einfügen (Last für die Handy-Messung)', () => a.addProbe()));
    this.layers.append(head, this.depth, this.list, foot);

    this.banner.append(this.bannerText, button('Wiederherstellen', '', () => a.restore()), button('Verwerfen', '', () => a.discardBackup()));
    this.root.append(this.top, this.views, this.cam, this.tools, this.layers, this.context, this.toastEl, this.banner, this.stats);
    document.body.append(this.root);
    // Klicks auf die Bedienfelder gehen nicht ins Spiel
    for (const p of [this.top, this.views, this.cam, this.tools, this.layers, this.context, this.banner]) p.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private toggleCam(): void {
    const open = !this.cam.classList.contains('open');
    this.cam.classList.toggle('open', open);
    this.layers.classList.toggle('camopen', open);
    this.camBtn.classList.toggle('on', open);
  }

  setBuilding(on: boolean): void {
    this.root.classList.toggle('play', !on);
    this.modeBtn.textContent = on ? 'Spielen' : 'Bauen';
  }

  setTool(t: Tool): void {
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
  }

  setView(v: ViewMode | 'side'): void {
    for (const [k, b] of this.viewBtns) b.classList.toggle('on', k === v);
  }

  setCamera(tilt: number, fov: number): void {
    this.tiltSlider.set(tilt);
    this.fovSlider.set(fov);
  }

  setHold(on: boolean): void {
    this.holdBtn.textContent = on ? 'Bild halten' : 'Welt halten';
  }

  setTop(dirty: boolean, canUndo: boolean, canRedo: boolean, stats: string): void {
    this.dot.classList.toggle('dirty', dirty);
    this.dot.title = dirty ? 'Ungesicherte Änderungen' : 'Gesichert';
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
    if (this.stats.textContent !== stats) this.stats.textContent = stats;
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  showBanner(text: string | null): void {
    this.bannerText.textContent = text ?? '';
    this.banner.classList.toggle('show', !!text);
  }

  /** Vorschaubild einer Ebene (Canvas der Zeile); null, solange die Zeile nicht existiert */
  thumb(planeId: string): HTMLCanvasElement | null {
    return this.thumbs.get(planeId) ?? null;
  }

  /**
   * Ebenenliste von vorn nach hinten mit Abstandspillen. Neu aufgebaut wird nur, wenn sich Ebenen, Namen, Rollen oder
   * Schalter ändern; Auswahl und Abstände werden an Ort und Stelle nachgeführt (sonst käme ein Doppeltippen nie an)
   */
  setLayers(rows: LayerRow[], activeId: string | null): void {
    this.renderDepth(rows, activeId);
    const structure = rows.map((r) => `${r.plane.id}|${r.plane.name}|${r.plane.role}|${r.plane.hidden ? 1 : 0}|${r.plane.locked ? 1 : 0}|${r.gap === null ? '-' : '+'}`).join(';');
    if (this.dragging || this.editing || structure === this.structure) {
      for (const r of rows) {
        const pill = this.list.querySelector<HTMLElement>(`[data-gap="${r.plane.id}"]`);
        if (pill && r.gap !== null && !pill.querySelector('input')) pill.textContent = `${fmt(r.gap)} m`;
        this.list.querySelector(`[data-row="${r.plane.id}"]`)?.classList.toggle('on', r.plane.id === activeId);
      }
      if (structure === this.structure || this.dragging) this.gaps = new Map(rows.map((r) => [r.plane.id, r.gap ?? 0]));
      return;
    }
    this.structure = structure;
    this.gaps = new Map(rows.map((r) => [r.plane.id, r.gap ?? 0]));
    const scroll = this.list.scrollTop;
    this.list.replaceChildren();
    const keep = new Map<string, HTMLCanvasElement>();
    for (const r of rows) {
      const p = r.plane;
      const row = el('div', `ze-row${p.id === activeId ? ' on' : ''}`);
      row.dataset.row = p.id;
      const thumb = this.thumbs.get(p.id) ?? el('canvas');
      thumb.width = 96;
      thumb.height = 56;
      keep.set(p.id, thumb);
      const name = el('span', 'ze-name');
      name.textContent = p.name;
      name.title = 'Doppelt tippen zum Umbenennen';
      name.addEventListener('click', (e) => {
        // eigenes Doppeltippen: Safari auf dem iPad meldet dblclick bei touch-action: none nicht zuverlässig
        const now = performance.now();
        if (this.lastNameTap.id === p.id && now - this.lastNameTap.t < 380) {
          e.stopPropagation();
          this.lastNameTap = { id: '', t: 0 };
          this.rename(name, p);
          return;
        }
        this.lastNameTap = { id: p.id, t: now };
      });
      const role = el('span', 'ze-role', PLANE_ROLE_WORDS[p.role]);
      const eye = button(p.hidden ? EYE_OFF : EYE, p.hidden ? 'Einblenden' : 'Ausblenden', () => this.a.togglePlaneHidden(p.id), p.hidden ? '' : 'on');
      const lock = button(LOCK, p.locked ? 'Entsperren' : 'Sperren', () => this.a.togglePlaneLocked(p.id), p.locked ? 'on' : '');
      row.append(thumb, name, role, eye, lock);
      row.addEventListener('click', () => this.a.selectPlane(p.id));
      this.list.append(row);
      if (r.gap !== null) this.list.append(this.gapPill(p.id));
    }
    this.thumbs = keep;
    this.list.scrollTop = scroll;
  }

  /** Bauplan der Liste beim letzten Aufbau */
  private structure = '';
  /** aktuelle Abstände je vorderer Ebene (die Pillen lesen sie beim Aufsetzen) */
  private gaps = new Map<string, number>();
  private lastNameTap = { id: '', t: 0 };

  private rename(span: HTMLElement, p: ZonePlane): void {
    this.editing = p.id;
    const input = el('input');
    input.value = p.name;
    span.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('click', (e) => e.stopPropagation());
    const done = (ok: boolean) => {
      if (this.editing !== p.id) return;
      this.editing = null;
      // die Zeile wird mit dem neuen Namen ohnehin neu aufgebaut; bei Abbruch den alten Namen zurück
      this.structure = '';
      if (ok && input.value.trim()) this.a.renamePlane(p.id, input.value.trim().slice(0, 60));
      else this.a.selectPlane(p.id);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  /** Pille zwischen zwei Ebenen: senkrecht ziehen ändert den Abstand (alles dahinter rückt mit), Tippen gibt eine Zahl ein */
  private gapPill(frontId: string): HTMLElement {
    const wrap = el('div', 'ze-gap');
    const pill = el('span', 'ze-pill');
    pill.dataset.gap = frontId;
    pill.textContent = `${fmt(this.gaps.get(frontId) ?? 0)} m`;
    pill.title = 'Ziehen: Abstand zur Ebene dahinter (alles dahinter rückt mit); Tippen: Zahl eingeben';
    let start: { y: number; gap: number; moved: boolean } | null = null;
    pill.addEventListener('pointerdown', (e) => {
      if (pill.querySelector('input')) return;
      e.stopPropagation();
      e.preventDefault();
      pill.setPointerCapture(e.pointerId);
      start = { y: e.clientY, gap: this.gaps.get(frontId) ?? 1, moved: false };
    });
    pill.addEventListener('pointermove', (e) => {
      if (!start || !pill.hasPointerCapture(e.pointerId)) return;
      const dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dy) < 4) return;
      if (!start.moved) {
        start.moved = true;
        this.dragging = true;
        pill.classList.add('drag');
        this.a.gapStart(frontId);
      }
      // nach unten größer; gleichmäßig über alle Größenordnungen (×2 je 120 px), mit Shift feiner
      const k = e.shiftKey ? 600 : 120;
      this.a.gapChange(frontId, Math.max(0.1, start.gap * Math.pow(2, dy / k)));
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      if (pill.hasPointerCapture(e.pointerId)) pill.releasePointerCapture(e.pointerId);
      if (moved) {
        this.dragging = false;
        pill.classList.remove('drag');
        this.a.gapEnd();
      } else this.editGap(pill, frontId, this.gaps.get(frontId) ?? 1);
    };
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
    wrap.append(pill);
    return wrap;
  }

  private editGap(pill: HTMLElement, frontId: string, gap: number): void {
    this.editing = frontId;
    const input = el('input');
    input.inputMode = 'decimal';
    input.value = fmt(gap);
    pill.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const done = (ok: boolean) => {
      if (this.editing !== frontId) return;
      this.editing = null;
      pill.textContent = `${fmt(gap)} m`;
      const v = Number(input.value.replace(',', '.').replace(/[^\d.]/g, ''));
      if (ok && Number.isFinite(v) && v > 0) {
        this.a.gapStart(frontId);
        this.a.gapChange(frontId, v);
        this.a.gapEnd();
      } else this.a.selectPlane(frontId);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  /** Tiefenleiste: der Stapel von der Seite, vorn links, hinten rechts; eine Marke ziehen schiebt nur diese Ebene */
  private renderDepth(rows: LayerRow[], activeId: string | null): void {
    const zs = rows.map((r) => r.plane.z);
    const min = Math.min(0, ...zs);
    const max = Math.max(min + 10, ...zs);
    const w = () => this.depth.getBoundingClientRect().width || 240;
    const pos = (z: number) => ((z - min) / (max - min)) * 100;
    if (this.dragging) {
      for (const r of rows) {
        const t = this.depth.querySelector<HTMLElement>(`[data-tick="${r.plane.id}"]`);
        if (t) t.style.left = `${pos(r.plane.z)}%`;
      }
      return;
    }
    this.depth.replaceChildren();
    for (const r of rows) {
      const t = el('div', `ze-tick${r.plane.id === activeId ? ' on' : ''}`);
      t.dataset.tick = r.plane.id;
      t.style.left = `${pos(r.plane.z)}%`;
      t.title = `${r.plane.name}: ${fmt(r.plane.z)} m`;
      let start: { x: number; z: number; moved: boolean } | null = null;
      t.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        t.setPointerCapture(e.pointerId);
        start = { x: e.clientX, z: r.plane.z, moved: false };
      });
      t.addEventListener('pointermove', (e) => {
        if (!start || !t.hasPointerCapture(e.pointerId)) return;
        const dx = e.clientX - start.x;
        if (!start.moved && Math.abs(dx) < 3) return;
        if (!start.moved) {
          start.moved = true;
          this.dragging = true;
          this.a.depthStart(r.plane.id);
        }
        this.a.depthChange(r.plane.id, start.z + (dx / w()) * (max - min));
      });
      const end = (e: PointerEvent) => {
        if (!start) return;
        const moved = start.moved;
        start = null;
        if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
        if (moved) {
          this.dragging = false;
          this.a.depthEnd();
        } else this.a.selectPlane(r.plane.id);
      };
      t.addEventListener('pointerup', end);
      t.addEventListener('pointercancel', end);
      this.depth.append(t);
    }
  }

  /** Leiste unten: für eine gewählte Form Farbe und Reihenfolge, sonst für die aktive Ebene Rolle und Isolieren */
  setContext(plane: ZonePlane | null, shape: ZoneShape | null, isolate: Isolate): void {
    this.context.replaceChildren();
    if (shape) {
      this.context.append(el('span', 'ze-label', shape.name));
      for (const c of SWATCHES) {
        const s = el('span', `ze-swatch${shape.fill === c ? ' on' : ''}`);
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', (e) => {
          e.stopPropagation();
          this.a.fill(c);
        });
        this.context.append(s);
      }
      this.context.append(
        el('span', 'ze-sep'),
        button('Duplizieren', 'Duplizieren (Cmd+D)', () => this.a.duplicate()),
        button('Nach vorn', 'In der Ebene nach vorn (])', () => this.a.orderShape(1)),
        button('Nach hinten', 'In der Ebene nach hinten ([)', () => this.a.orderShape(-1)),
        button('Löschen', 'Löschen (Entf)', () => this.a.deleteShape()),
      );
    } else if (plane) {
      this.context.append(el('span', 'ze-label', plane.name));
      for (const r of PLANE_ROLES) this.context.append(button(PLANE_ROLE_WORDS[r], `Rolle: ${PLANE_ROLE_WORDS[r]} (wirkt ab Stufe 4 auf Pinsel und Stützen)`, () => this.a.setRole(r), plane.role === r ? 'on' : ''));
      this.context.append(el('span', 'ze-sep'));
      for (const i of ['off', 'front', 'only'] as const) this.context.append(button(i === 'off' ? 'Alle' : i === 'front' ? 'Davor aus' : 'Nur diese', `Isolieren: ${ISOLATE_WORDS[i]}`, () => this.a.setIsolate(i), isolate === i ? 'on' : ''));
      this.context.append(el('span', 'ze-sep'), button('Ebene löschen', 'Ebene mit allen Formen löschen', () => this.a.deletePlane()));
    }
    this.context.classList.toggle('show', !!(shape || plane));
  }

  destroy(): void {
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
