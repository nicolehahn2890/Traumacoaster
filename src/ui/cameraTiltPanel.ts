/**
 * Kamerawinkel-Test (Zweig test-kamerawinkel, kein Teil des Plans): Regler für die Neigung der Kamera und den Bildwinkel
 * im Weltrenderer, zum Vergleichen auf dem Handy. Die Werte gelten sofort für Bild, Bühne und Pinsel (setCameraTilt),
 * werden je Gerät gemerkt (localStorage) und lassen sich per Adresse vorgeben (?tilt=15&fov=24).
 *
 * Als DOM-Element über der Zeichenfläche, damit Berührungen auf dem Regler nicht ins Spiel gehen; eigener Regler statt
 * <input type="range">, weil dessen Griff auf dem iPhone klein ist und body touch-action: none trägt.
 */
import { CAMERA_TILT, DEFAULT_CAMERA_TILT, LANE_MAX, LANE_MIN, LANE_RISE, setCameraTilt, setPerspective, toView, viewScale, viewState } from '@/track/stage';
import { FONT_TEXT, INK, PAPER, PINK } from './widgets';

const DEG = Math.PI / 180;
const TILT_MIN = 1;
const TILT_MAX = 45;
const FOV_MIN = 5;
const FOV_MAX = 50;
const DEFAULT_TILT_DEG = DEFAULT_CAMERA_TILT / DEG;
const DEFAULT_FOV = 18;
const TILT_PRESETS = [3, 8, 12, 16, 20, DEFAULT_TILT_DEG, 35];
const FOV_PRESETS = [10, 18, 30, 45];
const STORE_KEY = 'tc.kamerawinkel';

interface Stored {
  tilt?: number;
  fov?: number;
  hold?: boolean;
  /** Pinsel-Art (ersetzt hold): Tiefe aus der Bildhöhe, Spur halten, Tiefe aus Ebenen */
  brush?: BrushMode;
  /** Stand der gemerkten Pinsel-Wahl (2: mit „Ebenen: Bodenhöhe“) */
  v?: number;
}

function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

function writeStored(s: Stored): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* privater Modus: dann eben ohne Merken */
  }
}

const urlNum = (key: string): number | null => {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get(key);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? v : null;
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const fmt = (v: number, digits = 1): string => v.toFixed(digits).replace('.', ',');

/** Pinsel „Spur halten“ (für flache Kamera) statt Tiefe aus der Bildhöhe; Adresse ?hold=1 vor Gemerktem */
export type BrushMode = 'bild' | 'halten' | 'ebenen' | 'boden';
const BRUSH_NAMES: Record<BrushMode, string> = { bild: 'Tiefe aus Bildhöhe', halten: 'Spur halten', ebenen: 'Ebenen: landen', boden: 'Ebenen: Bodenhöhe' };
let brushMode: BrushMode = (() => {
  const s = readStored();
  if (urlNum('hold') !== null) return urlNum('hold') === 1 ? 'halten' : 'bild';
  return s.brush ?? (s.hold ? 'halten' : 'bild');
})();
/** Spur halten oder Tiefe aus Ebenen: beide halten die Tiefe in der Luft (brushTrack holdLane) */
export const brushHoldsLane = (): boolean => brushMode !== 'bild';
/** Tiefe aus dem Scheibenstapel (nur, wo es einen gibt) */
export const brushUsesSlices = (): boolean => brushMode === 'ebenen' || brushMode === 'boden';
/** Mischung: Bodenhöhe aus den Scheiben wie beim Bildhöhen-Pinsel, Landungen und Höhlen gehen vor */
export const brushUsesSliceGround = (): boolean => brushMode === 'boden';
/** Ebenen-Zone: einmal je Laden auf „Tiefe aus Ebenen“ stellen, solange nichts anderes gewählt wurde */
export function preferSliceBrush(): void {
  // einmalig auf die Mischung (Stand 2), danach gilt die eigene Wahl
  const s = readStored();
  if (!s.brush || (s.v ?? 1) < 2) {
    brushMode = 'boden';
    writeStored({ ...s, brush: brushMode, v: 2 });
  }
}

/** Neigung (Grad) zum Start eines Levels: Adresse vor Gemerktem vor Standard */
export function initialTiltDeg(): number {
  return clamp(urlNum('tilt') ?? readStored().tilt ?? DEFAULT_TILT_DEG, TILT_MIN, TILT_MAX);
}

/** Bildwinkel (Grad) zum Start: Adresse vor Gemerktem vor fallback (?fov= liest das Level schon selbst) */
export function initialFov(fallback: number): number {
  return clamp(urlNum('fov') ?? readStored().fov ?? fallback, FOV_MIN, FOV_MAX);
}

/** eigener Regler: Spur mit Griff, ganze Breite greifbar */
class Slider {
  readonly el = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly knob = document.createElement('div');
  private dragging = false;

  constructor(
    private readonly min: number,
    private readonly max: number,
    private readonly step: number,
    private readonly onChange: (v: number) => void,
  ) {
    this.el.style.cssText = 'position:relative;height:30px;touch-action:none;cursor:pointer;';
    const track = document.createElement('div');
    track.style.cssText = `position:absolute;left:12px;right:12px;top:13px;height:5px;border-radius:3px;background:rgba(42,31,61,.18);`;
    this.fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:${PINK};`;
    this.knob.style.cssText = `position:absolute;top:-8px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:${PAPER};border:3px solid ${INK};box-sizing:border-box;`;
    track.append(this.fill, this.knob);
    this.el.append(track);
    const fromEvent = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      const t = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
      const v = Math.round((this.min + t * (this.max - this.min)) / this.step) * this.step;
      this.onChange(clamp(v, this.min, this.max));
    };
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dragging = true;
      this.el.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) fromEvent(e);
    });
    const end = () => (this.dragging = false);
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  set(v: number): void {
    const t = clamp((v - this.min) / (this.max - this.min), 0, 1) * 100;
    this.fill.style.width = `${t}%`;
    this.knob.style.left = `${t}%`;
  }
}

export class CameraTiltPanel {
  private readonly root = document.createElement('div');
  private readonly pill = document.createElement('button');
  private readonly body = document.createElement('div');
  private readonly tiltValue = document.createElement('span');
  private readonly fovValue = document.createElement('span');
  private readonly readout = document.createElement('div');
  private readonly tiltSlider: Slider;
  private readonly fovSlider: Slider;
  /** Knöpfe mit Auswahlzustand: leuchtet, wenn on() stimmt */
  private readonly chips: Array<{ el: HTMLButtonElement; on: () => boolean }> = [];
  private open = false;
  private tiltDeg: number;
  private fov: number;
  private timer: number;

  /** zoom: aktueller Maßstab (px je Bühnen-Meter); persp: Perspektive an; ground: Bodenhöhe (x, Spur) für die Bodenlinien */
  constructor(
    private readonly zoom: () => number,
    private readonly persp: boolean,
    private readonly ground: (x: number, z: number) => number = () => 0,
  ) {
    this.tiltDeg = CAMERA_TILT / DEG;
    this.fov = viewState().fov;
    const r = this.root;
    r.style.cssText = `position:fixed;z-index:20;top:calc(env(safe-area-inset-top, 0px) + 12px);left:calc(env(safe-area-inset-left, 0px) + 188px);font:700 13px ${FONT_TEXT};color:${INK};touch-action:none;user-select:none;-webkit-user-select:none;`;
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.pill.style.cssText = `font:800 13px ${FONT_TEXT};color:${INK};background:${PAPER};border:3px solid ${INK};border-radius:18px;padding:6px 12px;cursor:pointer;`;
    this.pill.addEventListener('click', () => this.toggle());
    this.body.style.cssText = `display:none;margin-top:5px;width:min(360px, calc(100vw - 200px));min-width:270px;background:rgba(255,248,236,.9);border:3px solid ${INK};border-radius:14px;padding:4px 8px 7px;box-sizing:border-box;`;

    this.tiltSlider = new Slider(TILT_MIN, TILT_MAX, 0.5, (v) => this.setTilt(v));
    this.fovSlider = new Slider(FOV_MIN, FOV_MAX, 1, (v) => this.setFov(v));
    // eine Zeile je Regler: Name, Regler, Wert
    const row = (name: string, slider: Slider, value: HTMLElement) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:grid;grid-template-columns:62px 1fr 42px;align-items:center;';
      const n = document.createElement('span');
      n.textContent = name;
      value.style.cssText = `font-weight:800;color:${PINK};text-align:right;`;
      d.append(n, slider.el, value);
      return d;
    };
    const chipRow = () => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:-2px 0 3px;';
      return d;
    };
    const chip = (text: string, pick: () => void, dark = false, on?: () => boolean) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = `font:800 11px ${FONT_TEXT};color:${dark ? '#fff' : INK};background:${dark ? INK : '#fff'};border:2px solid ${INK};border-radius:11px;padding:2px 6px;cursor:pointer;`;
      b.addEventListener('click', pick);
      if (on) this.chips.push({ el: b, on });
      return b;
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 0.26;
    const tiltChips = chipRow();
    for (const v of TILT_PRESETS) tiltChips.append(chip(`${fmt(v, v % 1 ? 1 : 0)}°`, () => this.setTilt(v), false, () => near(this.tiltDeg, v)));
    const fovChips = chipRow();
    for (const v of FOV_PRESETS) fovChips.append(chip(`${v}°`, () => this.setFov(v), false, () => near(this.fov, v)));
    fovChips.append(
      chip('Standard', () => {
        this.setTilt(DEFAULT_TILT_DEG);
        this.setFov(DEFAULT_FOV);
        this.setBrush('bild');
      }, true),
    );
    // Pinsel: Tiefe aus der Bildhöhe (heute) oder „Spur halten“ (Vorschlag für flache Kamera, Platzhalter-Stand)
    const brushRow = chipRow();
    brushRow.style.alignItems = 'center';
    brushRow.style.margin = '2px 0 4px';
    const brushName = document.createElement('span');
    brushName.textContent = 'Pinsel';
    brushName.style.width = '58px';
    brushRow.append(
      brushName,
      ...(['bild', 'halten', 'ebenen', 'boden'] as BrushMode[]).map((m) => chip(BRUSH_NAMES[m], () => this.setBrush(m), false, () => brushMode === m)),
    );
    this.readout.style.cssText = 'font-weight:600;font-size:11px;line-height:1.3;opacity:.85;';
    this.body.append(row('Neigung', this.tiltSlider, this.tiltValue), tiltChips, row('Bildwinkel', this.fovSlider, this.fovValue), fovChips, brushRow, this.readout);
    r.append(this.pill, this.body);
    document.body.append(r);
    this.refresh();
    // Spurabstand in Pixeln hängt am Zoom: Anzeige nachführen, solange das Feld offen ist
    this.timer = window.setInterval(() => this.open && this.refresh(), 300);
  }

  private toggle(): void {
    this.open = !this.open;
    this.body.style.display = this.open ? 'block' : 'none';
    this.refresh();
  }

  private store(): void {
    writeStored({ tilt: this.tiltDeg, fov: this.fov, brush: brushMode, v: 2 });
  }

  private setTilt(deg: number): void {
    this.tiltDeg = clamp(deg, TILT_MIN, TILT_MAX);
    setCameraTilt(this.tiltDeg * DEG);
    this.store();
    this.refresh();
  }

  private setFov(fov: number): void {
    this.fov = clamp(fov, FOV_MIN, FOV_MAX);
    if (this.persp) setPerspective(true, this.fov);
    this.store();
    this.refresh();
  }

  /** gilt ab dem nächsten Strich (die gezeichnete Bahn bleibt) */
  private setBrush(m: BrushMode): void {
    brushMode = m;
    this.store();
    this.refresh();
  }

  private refresh(): void {
    const tilt = this.tiltDeg;
    this.pill.textContent = `Kamera ${fmt(tilt)}°${brushMode !== 'bild' ? ` · ${BRUSH_NAMES[brushMode]}` : ''} ${this.open ? '▴' : '▾'}`;
    for (const c of this.chips) {
      const on = c.on();
      c.el.style.background = on ? PINK : '#fff';
      c.el.style.color = on ? '#fff' : INK;
    }
    this.tiltValue.textContent = `${fmt(tilt)}°`;
    this.fovValue.textContent = this.persp ? `${fmt(this.fov, 0)}°` : '–';
    this.tiltSlider.set(tilt);
    this.fovSlider.set(this.fov);
    if (!this.open) return;
    // Spurabstand auf dem Bild (Bühnen-Meter und Pixel), Größenunterschied vorne/hinten, senkrechte Streckung
    // Bodenlinien vorderste → hinterste Spur in der Bildmitte, wie sie wirklich im Bild liegen: Anteil der Neigung plus
    // Perspektive (der Boden unter der Augenhöhe der Kamera steigt nach hinten an, umso mehr, je größer der Bildwinkel)
    const v = viewState();
    const zoom = this.zoom();
    const a = toView(v.cx, this.ground(v.cx, LANE_MIN), LANE_MIN);
    const b = toView(v.cx, this.ground(v.cx, LANE_MAX), LANE_MAX);
    const span = (b.Y - a.Y) * zoom;
    const fromTilt = (LANE_MAX - LANE_MIN) * LANE_RISE * zoom;
    const back = this.persp ? (1 - viewScale(LANE_MAX) / viewScale(LANE_MIN)) * 100 : 0;
    const stretch = (1 / Math.cos(tilt * DEG) - 1) * 100;
    // Blickwinkel auf einen Boden am unteren Bildrand: Neigung plus halber Bildwinkel
    const edge = tilt + (this.persp ? this.fov / 2 : 0);
    this.readout.innerHTML =
      `Boden vorne→hinten im Bild ${fmt(span, 0)} px (Neigung ${fmt(fromTilt, 0)} px, Rest Perspektive)` +
      (this.persp ? ` · hinterste Spur ${fmt(back, 0)} % kleiner` : ' · Bühne ohne Perspektive') +
      `<br>Boden am unteren Rand unter ${fmt(edge, 0)}° gesehen · Höhen +${fmt(stretch, 0)} % gestreckt`;
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.root.remove();
  }
}
