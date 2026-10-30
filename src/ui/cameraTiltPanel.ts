/**
 * Kamerawinkel und Tiefen-Lesart des Pinsels (aus dem Kamerawinkel-Test, Zweig test-kamerawinkel): Neigung der Kamera
 * und Bildwinkel im Weltrenderer, je Gerät gemerkt (localStorage), per Adresse vorgebbar (?tilt=15&fov=24).
 *
 * Die eigene Anzeige im Spiel („Kamera 26,6° · Ebenen: Bodenhöhe ▾“) ist seit 30.10.2026 entfernt (Florian: „die
 * Kamerawinkelanzeige im Game raus“): Neigung und Bildwinkel stellt der Zonen-Editor mit seinen eigenen Reglern, die
 * vier Tiefen-Lesarten wählt das Testmenü im Editor (src/ui/testMenu.ts). Der Name der Klasse ist geblieben.
 */
import { CAMERA_TILT, DEFAULT_CAMERA_TILT, setCameraTilt, setPerspective, viewState } from '@/track/stage';

const DEG = Math.PI / 180;
const TILT_MIN = 1;
const TILT_MAX = 45;
const FOV_MIN = 5;
const FOV_MAX = 50;
const DEFAULT_TILT_DEG = DEFAULT_CAMERA_TILT / DEG;
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

/** Tiefen-Lesart des Pinsels: Tiefe aus der Bildhöhe, Spur halten (für flache Kamera), Ebenen; Adresse ?hold=1 vor Gemerktem */
export type BrushMode = 'bild' | 'halten' | 'ebenen' | 'boden';
export const BRUSH_MODES: readonly BrushMode[] = ['bild', 'halten', 'ebenen', 'boden'];
export const BRUSH_NAMES: Record<BrushMode, string> = { bild: 'Tiefe aus Bildhöhe', halten: 'Spur halten', ebenen: 'Ebenen: landen', boden: 'Ebenen: Bodenhöhe' };
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

/** die gewählte Tiefen-Lesart */
export const brushModeNow = (): BrushMode => brushMode;

/** Tiefen-Lesart wählen (Testmenü im Editor); gilt ab dem nächsten Strich, die gezeichnete Bahn bleibt */
export function setBrushMode(m: BrushMode): void {
  brushMode = m;
  writeStored({ ...readStored(), brush: m, v: 2 });
}

/** Neigung (Grad) zum Start eines Levels: Adresse vor Gemerktem vor Standard */
export function initialTiltDeg(): number {
  return clamp(urlNum('tilt') ?? readStored().tilt ?? DEFAULT_TILT_DEG, TILT_MIN, TILT_MAX);
}

/** Bildwinkel (Grad) zum Start: Adresse vor Gemerktem vor fallback (?fov= liest das Level schon selbst) */
export function initialFov(fallback: number): number {
  return clamp(urlNum('fov') ?? readStored().fov ?? fallback, FOV_MIN, FOV_MAX);
}

/** Neigung und Bildwinkel setzen und merken (die Regler dazu zeigt der Zonen-Editor) */
export class CameraTiltPanel {
  private tiltDeg = CAMERA_TILT / DEG;
  private fov = viewState().fov;

  /** persp: Perspektive an (sonst wirkt der Bildwinkel nicht) */
  constructor(private readonly persp: boolean) {}

  private store(): void {
    writeStored({ ...readStored(), tilt: this.tiltDeg, fov: this.fov, brush: brushMode, v: 2 });
  }

  /** Neigung in Grad setzen (Regler des Zonen-Editors) */
  setTilt(deg: number): void {
    this.tiltDeg = clamp(deg, TILT_MIN, TILT_MAX);
    setCameraTilt(this.tiltDeg * DEG);
    this.store();
  }

  /** Bildwinkel in Grad setzen (nur mit Perspektive wirksam) */
  setFov(fov: number): void {
    this.fov = clamp(fov, FOV_MIN, FOV_MAX);
    if (this.persp) setPerspective(true, this.fov);
    this.store();
  }
}
