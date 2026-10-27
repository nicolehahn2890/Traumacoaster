/**
 * Farbmenü des Zonen-Editors (Stufe 3, Plan 4.2 und 4.6; Vorbild Procreate): Der Farbknopf oben rechts zeigt die
 * aktuelle Farbe; Antippen öffnet das Menü mit Scheibe, Klassisch, Harmonie, Werte und Paletten, darunter die zuletzt
 * benutzten Farben. Der Knopf und jedes Farbfeld lassen sich auf das Bild ziehen (ColorDrop). Ein Feld der Zonenpalette
 * doppelt antippen bearbeitet es: Name und Farbe; alle Flächen mit diesem Feld ändern sich mit (globale Farbe).
 *
 * Diese Datei baut nur das Menü und meldet über `ColorMenuHost`, was gewählt, gezogen oder geändert wurde.
 * Platzhalter: das genaue Aussehen und die Platzhalter-Palette (bis Florian Paletten festlegt).
 */
import { hexToRgb, rgbToHex, type PaintColor, type ZoneSwatch } from '@/zone/paint';

export type PickPhase = 'start' | 'move' | 'end' | 'tap';

export interface ColorMenuHost {
  /** aktuelle Farbe (Wert oder Palettenverweis) */
  current(): PaintColor;
  /** Wert einer Farbe im aktuellen Look */
  resolve(c: PaintColor): string;
  /** Farbe wählen; beim Ziehen im Wähler kommen start, move, end (ein Rückgängig-Schritt), sonst tap */
  pick(c: PaintColor, phase: PickPhase): void;
  /** nur die aktuelle Farbe setzen, ohne die Auswahl zu färben */
  setCurrent(c: PaintColor): void;
  swatches(): readonly ZoneSwatch[];
  /** neues Feld der Zonenpalette mit diesem Wert; gibt seine Kennung */
  addSwatch(hex: string): string | null;
  editSwatch(id: string, patch: { name?: string; color?: string }, phase: PickPhase): void;
  deleteSwatch(id: string): void;
  recent(): readonly PaintColor[];
  /** Stile der Zone mit Vorschau (CSS-Hintergrund) und ob die Auswahl mit ihm verknüpft ist */
  styleList(): Array<{ id: string; name: string; preview: string; on: boolean }>;
  /** Stil verknüpft auf die Auswahl legen */
  applyStyle(id: string): void;
  /** Anstrich der Auswahl als neuen Stil sichern (und verknüpfen); null ohne Auswahl */
  saveStyle(): string | null;
  /** Stil aus der Auswahl neu festlegen: alle verknüpften Flächen ändern sich mit */
  redefineStyle(id: string): void;
  renameStyle(id: string, name: string): void;
  deleteStyle(id: string): void;
  /** gibt es eine Form oder Fläche, die einen Stil bekommen kann? */
  hasSelection(): boolean;
  /** ColorDrop: Zeiger über dem Bild (Bildschirm-Koordinaten), fallen lassen, abgebrochen; ein Stil kommt als `style:y3` */
  dropHover(x: number, y: number): void;
  drop(c: PaintColor, x: number, y: number): void;
  dropEnd(): void;
}

/** Platzhalter-Palette (ruhig, eher Earle als Bonbon), bis Florian Paletten festlegt */
export const PLACEHOLDER_PALETTE = ['#3d5a63', '#5b7f7a', '#8aa58c', '#c9c09a', '#d9a07a', '#a3665a', '#6b5a8a', '#c6d4dc'];

type Mode = 'disc' | 'classic' | 'harmony' | 'values' | 'palettes' | 'styles';
const MODES: readonly Mode[] = ['disc', 'classic', 'harmony', 'values', 'palettes', 'styles'];
const MODE_WORDS: Record<Mode, string> = { disc: 'Scheibe', classic: 'Klassisch', harmony: 'Harmonie', values: 'Werte', palettes: 'Paletten', styles: 'Stile' };
type Harmony = 'complement' | 'split' | 'analog' | 'triad' | 'tetrad';
const HARMONIES: Record<Harmony, { name: string; hues: number[] }> = {
  complement: { name: 'Komplementär', hues: [0, 180] },
  split: { name: 'Geteilt', hues: [0, 150, 210] },
  analog: { name: 'Analog', hues: [-30, 0, 30] },
  triad: { name: 'Triade', hues: [0, 120, 240] },
  tetrad: { name: 'Tetrade', hues: [0, 90, 180, 270] },
};
const MODE_KEY = 'tc.zoneeditor.colormode';

// ------------------------------------------------------------------ Farbräume

/** HSB (Farbton 0 bis 360, Sättigung und Helligkeit 0 bis 1) aus RGB (0 bis 1) */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max > 1e-9 ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

export const hsvToHex = (h: number, s: number, v: number): string => rgbToHex(...hsvToRgb(h, s, v));

/** Farbtöne einer Harmonie zum Farbton h */
export function harmonyHues(h: number, mode: Harmony): number[] {
  return HARMONIES[mode].hues.map((d) => (((h + d) % 360) + 360) % 360);
}

// ------------------------------------------------------------------ Aussehen

export const COLOR_CSS = `
.ze-colorbtn{width:30px;height:30px;min-width:30px;padding:0;margin:0 3px 0 6px;border-radius:50%;border:2px solid rgba(231,229,224,.85);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);cursor:pointer;touch-action:none;flex:none}
.ze-colorbtn.on{border-color:#8db4ff}
@media (pointer:coarse){.ze-colorbtn{width:36px;height:36px}}
.ze-color{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);width:316px;padding:8px;display:none;z-index:3}
@media (pointer:coarse){.ze-color{top:calc(env(safe-area-inset-top,0px) + 72px);width:334px}}
@media (max-width:820px){.ze-color{top:calc(env(safe-area-inset-top,0px) + 116px)}}
.ze-color.open{display:block}
.ze-ctabs{display:flex;gap:2px;margin-bottom:8px}
.ze-ctabs .ze-btn{flex:1;min-width:0;height:28px;padding:0 2px;font-size:11px;color:#bdbab3}
.ze-ctabs .ze-btn.on{color:#e7e5e0}
@media (pointer:coarse){.ze-ctabs .ze-btn{height:34px}}
.ze-cvas{display:block;margin:0 auto;touch-action:none;cursor:crosshair}
.ze-cbar{position:relative;height:22px;border-radius:11px;margin:10px 2px 0;touch-action:none;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}
.ze-cbar .ze-knob{top:2px}
.ze-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0}
.ze-chip{width:26px;height:26px;border-radius:50%;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3);cursor:pointer;touch-action:none;flex:none}
@media (pointer:coarse){.ze-chip{width:32px;height:32px}}
.ze-chip.on{border-color:#e7e5e0}
.ze-chip.add{display:flex;align-items:center;justify-content:center;color:#bdbab3;background:rgba(255,255,255,.06);box-shadow:none;font-size:17px;line-height:1}
.ze-csub{color:#8f8c86;font-size:11px;margin:9px 2px 4px;display:flex;align-items:center;gap:6px}
.ze-crow{display:grid;grid-template-columns:16px 1fr 34px;gap:8px;align-items:center;height:30px}
.ze-crow .ze-cbar{margin:0;height:18px}
.ze-crow .ze-val{font-size:11px}
.ze-hex{display:flex;align-items:center;gap:8px;margin-top:6px;color:#8f8c86}
.ze-hex input,.ze-cedit input{flex:1;min-width:0;font:inherit;color:#e7e5e0;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:5px 7px;user-select:text;-webkit-user-select:text}
.ze-cedit{display:flex;align-items:center;gap:4px;margin-bottom:8px}
.ze-schip{width:44px;height:28px;border-radius:6px;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3);cursor:pointer;touch-action:none;flex:none}
@media (pointer:coarse){.ze-schip{width:50px;height:34px}}
.ze-schip.on{border-color:#e7e5e0}
.ze-schip.add{display:flex;align-items:center;justify-content:center;color:#bdbab3;background:rgba(255,255,255,.06);box-shadow:none;font-size:17px}
.ze-ghost{position:fixed;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.45);pointer-events:none;z-index:60;display:none}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function textButton(label: string, title: string, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `ze-btn ${cls}`.trim(), label);
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

/** Leinwand in Bildschirm-Größe w × h mit Zeichenfläche in Geräte-Pixeln */
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = el('canvas', 'ze-cvas');
  const k = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return c;
}

export class ColorMenu {
  /** Farbknopf (kommt in die Leiste oben rechts) */
  readonly button = el('div', 'ze-colorbtn');
  readonly panel = el('div', 'ze-panel ze-color');
  private readonly ghost = el('div', 'ze-ghost');
  private readonly tabs = el('div', 'ze-ctabs');
  private readonly body = el('div');
  private readonly recentRow = el('div', 'ze-chips');
  private mode: Mode = 'disc';
  private harmony: Harmony = 'complement';
  /** Farbe des Menüs als Farbton, Sättigung, Helligkeit (der Farbton bleibt auch bei Grau erhalten) */
  private hsv: [number, number, number] = [210, 0.4, 0.6];
  /** Feld der Zonenpalette, das gerade bearbeitet wird */
  private editing: string | null = null;
  /** Stil, der gerade bearbeitet wird (Name, neu festlegen, löschen) */
  private editingStyle: string | null = null;
  /** Bearbeiten-Modus der Zonenpalette und der Stile: Antippen öffnet ein Feld oder einen Stil, statt ihn aufzulegen */
  private editMode = false;
  private shownKey = '';
  /** wird gerufen, wenn das Menü aufgeht (andere Bedienfelder an derselben Stelle schließen) */
  onOpen: (() => void) | null = null;

  constructor(private readonly host: ColorMenuHost) {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m && (MODES as readonly string[]).includes(m)) this.mode = m as Mode;
    } catch {
      /* ignore */
    }
    this.button.title = 'Farbe: antippen öffnet das Farbmenü, ziehen füllt eine Fläche (Farbe fallen lassen)';
    this.source(this.button, () => this.host.current(), () => this.toggle());
    for (const m of MODES) this.tabs.append(textButton(MODE_WORDS[m], MODE_WORDS[m], () => this.setMode(m)));
    const recentHead = el('div', 'ze-csub', 'Zuletzt');
    this.panel.append(this.tabs, this.body, recentHead, this.recentRow);
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(this.ghost);
  }

  get open(): boolean {
    return this.panel.classList.contains('open');
  }

  toggle(open = !this.open): void {
    this.panel.classList.toggle('open', open);
    this.button.classList.toggle('on', open);
    if (open) {
      this.onOpen?.();
      this.syncFromHost(true);
      this.render();
    } else {
      this.editing = null;
      this.editingStyle = null;
      this.editMode = false;
    }
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.editMode = false;
    this.editingStyle = null;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    this.render();
  }

  /** Knopf und (offen) Menü nachführen, wenn sich Farbe, Palette oder Zuletzt geändert haben */
  refresh(): void {
    const cur = this.host.current();
    const hex = this.host.resolve(cur);
    this.button.style.background = hex;
    if (!this.open) return;
    const key = `${this.editMode}|${this.editing}|${this.editingStyle}|${cur}|${hex}|${JSON.stringify(this.host.swatches())}|${this.host.recent().join(',')}|${this.mode === 'styles' ? JSON.stringify(this.host.styleList()) + this.host.hasSelection() : ''}`;
    if (key === this.shownKey) return;
    this.syncFromHost(false);
    this.render();
  }

  /** Farbe des Menüs aus der aktuellen Farbe (oder dem bearbeiteten Feld) holen, den Farbton bei Grau behalten */
  private syncFromHost(force: boolean): void {
    const hex = this.editedHex() ?? this.host.resolve(this.host.current());
    if (!force && hsvToHex(...this.hsv) === hex) return;
    const [h, s, v] = rgbToHsv(...hexToRgb(hex));
    this.hsv = [s > 1e-3 && v > 1e-3 ? h : this.hsv[0], s, v];
  }

  private editedHex(): string | null {
    const sw = this.editing ? this.host.swatches().find((s) => s.id === this.editing) : undefined;
    if (this.editing && !sw) this.editing = null;
    return sw ? sw.color : null;
  }

  /** gewählte Farbe weitergeben: an das bearbeitete Feld oder als aktuelle Farbe */
  private emit(hex: string, phase: PickPhase): void {
    if (this.editing) this.host.editSwatch(this.editing, { color: hex }, phase);
    else this.host.pick(hex, phase);
    this.button.style.background = this.host.resolve(this.host.current());
  }

  private setHsv(h: number, s: number, v: number, phase: PickPhase): void {
    this.hsv = [h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, v))];
    this.emit(hsvToHex(...this.hsv), phase);
    this.paint();
  }

  // ------------------------------------------------------------------ Aufbau

  private render(): void {
    const cur = this.host.current();
    this.shownKey = `${this.editMode}|${this.editing}|${this.editingStyle}|${cur}|${this.host.resolve(cur)}|${JSON.stringify(this.host.swatches())}|${this.host.recent().join(',')}|${this.mode === 'styles' ? JSON.stringify(this.host.styleList()) + this.host.hasSelection() : ''}`;
    [...this.tabs.children].forEach((b, i) => b.classList.toggle('on', MODES[i] === this.mode));
    this.body.replaceChildren();
    this.painters = [];
    if (this.editing) this.body.append(this.editHead());
    if (this.mode === 'disc' || this.mode === 'harmony') this.body.append(this.disc(this.mode === 'harmony'));
    else if (this.mode === 'classic') this.body.append(this.classic());
    else if (this.mode === 'values') this.body.append(this.values());
    else if (this.mode === 'styles') this.body.append(this.styles());
    else this.body.append(this.palettes());
    this.recentRow.replaceChildren(...this.host.recent().map((c) => this.chip(c, this.host.resolve(c))));
    this.paint();
  }

  /** alles neu malen, was von der Farbe abhängt (ohne Neuaufbau, damit Ziehen flüssig bleibt) */
  private painters: Array<() => void> = [];
  private paint(): void {
    for (const p of this.painters) p();
  }

  private editHead(): HTMLElement {
    const sw = this.host.swatches().find((s) => s.id === this.editing)!;
    const row = el('div', 'ze-cedit');
    const input = el('input');
    input.value = sw.name;
    input.title = 'Name des Felds';
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('change', () => {
      const name = input.value.trim().slice(0, 40);
      if (name && name !== sw.name) this.host.editSwatch(sw.id, { name }, 'tap');
    });
    row.append(
      input,
      textButton('Löschen', 'Feld aus der Zonenpalette nehmen; Flächen behalten seine Farbe als Wert', () => {
        this.host.deleteSwatch(sw.id);
        this.editing = null;
        this.render();
      }),
      textButton('Fertig', 'Feld fertig bearbeitet', () => {
        this.editing = null;
        this.editMode = false;
        this.syncFromHost(true);
        this.render();
      }),
    );
    return row;
  }

  /** Scheibe (Farbton im Ring, Sättigung und Helligkeit im Quadrat); mit harmony die Harmonie-Farben dazu */
  private disc(harmony: boolean): HTMLElement {
    const S = 228;
    const wrap = el('div');
    const c = canvas(S, S);
    const R = S / 2 - 2;
    const rIn = R - 20;
    const side = Math.floor((rIn - 8) * Math.SQRT2);
    const sq0 = (S - side) / 2;
    let ring: ImageData | null = null;
    const g = c.getContext('2d')!;
    const k = c.width / S;
    const draw = () => {
      const [h, s, v] = this.hsv;
      if (!ring) {
        ring = g.createImageData(c.width, c.height);
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const dx = x / k - S / 2;
            const dy = y / k - S / 2;
            const d = Math.hypot(dx, dy);
            if (d < rIn || d > R) continue;
            const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
            const [r, gg, b] = hsvToRgb(hue, 1, 1);
            const i = (y * c.width + x) * 4;
            ring.data.set([r * 255, gg * 255, b * 255, Math.min(1, R - d, d - rIn) * 255], i);
          }
      }
      g.putImageData(ring, 0, 0);
      // Quadrat: waagrecht Sättigung, senkrecht Helligkeit
      const gs = g.createLinearGradient(sq0 * k, 0, (sq0 + side) * k, 0);
      gs.addColorStop(0, '#ffffff');
      gs.addColorStop(1, hsvToHex(h, 1, 1));
      g.fillStyle = gs;
      g.fillRect(sq0 * k, sq0 * k, side * k, side * k);
      const gv = g.createLinearGradient(0, sq0 * k, 0, (sq0 + side) * k);
      gv.addColorStop(0, 'rgba(0,0,0,0)');
      gv.addColorStop(1, '#000000');
      g.fillStyle = gv;
      g.fillRect(sq0 * k, sq0 * k, side * k, side * k);
      const mark = (x: number, y: number, r: number, fill: string | null) => {
        g.beginPath();
        g.arc(x * k, y * k, r * k, 0, Math.PI * 2);
        if (fill) {
          g.fillStyle = fill;
          g.fill();
        }
        g.lineWidth = 2 * k;
        g.strokeStyle = '#ffffff';
        g.stroke();
        g.lineWidth = 1 * k;
        g.strokeStyle = 'rgba(0,0,0,.5)';
        g.stroke();
      };
      const hues = harmony ? harmonyHues(h, this.harmony) : [h];
      for (const hh of hues) {
        const a = (hh * Math.PI) / 180;
        mark(S / 2 + Math.sin(a) * (R - 10), S / 2 - Math.cos(a) * (R - 10), hh === h ? 8 : 5, hsvToHex(hh, 1, 1));
      }
      mark(sq0 + s * side, sq0 + (1 - v) * side, 7, hsvToHex(h, s, v));
    };
    this.painters.push(draw);
    let part: 'ring' | 'square' | null = null;
    const at = (e: PointerEvent, phase: PickPhase) => {
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * S;
      const y = ((e.clientY - r.top) / r.height) * S;
      if (!part) part = Math.hypot(x - S / 2, y - S / 2) >= rIn - 4 ? 'ring' : 'square';
      const [h, s, v] = this.hsv;
      if (part === 'ring') this.setHsv(((Math.atan2(x - S / 2, -(y - S / 2)) * 180) / Math.PI + 360) % 360, s, v, phase);
      else this.setHsv(h, (x - sq0) / side, 1 - (y - sq0) / side, phase);
    };
    this.dragArea(c, at, () => (part = null));
    wrap.append(c);
    if (harmony) {
      const modes = el('div', 'ze-ctabs');
      modes.style.marginTop = '8px';
      for (const [m, w] of Object.entries(HARMONIES) as Array<[Harmony, { name: string }]>)
        modes.append(
          textButton(w.name, `Harmonie: ${w.name}`, () => {
            this.harmony = m;
            this.render();
          }, m === this.harmony ? 'on' : ''),
        );
      const chips = el('div', 'ze-chips');
      chips.style.justifyContent = 'center';
      const fillChips = () => {
        const [h, s, v] = this.hsv;
        chips.replaceChildren(...harmonyHues(h, this.harmony).map((hh) => this.chip(hsvToHex(hh, s, v), hsvToHex(hh, s, v))));
      };
      this.painters.push(fillChips);
      wrap.append(modes, chips);
    }
    return wrap;
  }

  /** Klassisch: großes Quadrat (Sättigung, Helligkeit), darunter der Farbton */
  private classic(): HTMLElement {
    const W = 244;
    const H = 168;
    const wrap = el('div');
    const c = canvas(W, H);
    const g = c.getContext('2d')!;
    const draw = () => {
      const [h, s, v] = this.hsv;
      const gs = g.createLinearGradient(0, 0, c.width, 0);
      gs.addColorStop(0, '#ffffff');
      gs.addColorStop(1, hsvToHex(h, 1, 1));
      g.fillStyle = gs;
      g.fillRect(0, 0, c.width, c.height);
      const gv = g.createLinearGradient(0, 0, 0, c.height);
      gv.addColorStop(0, 'rgba(0,0,0,0)');
      gv.addColorStop(1, '#000000');
      g.fillStyle = gv;
      g.fillRect(0, 0, c.width, c.height);
      const k = c.width / W;
      g.beginPath();
      g.arc(s * c.width, (1 - v) * c.height, 7 * k, 0, Math.PI * 2);
      g.fillStyle = hsvToHex(h, s, v);
      g.fill();
      g.lineWidth = 2 * k;
      g.strokeStyle = '#ffffff';
      g.stroke();
    };
    this.painters.push(draw);
    this.dragArea(c, (e, phase) => {
      const r = c.getBoundingClientRect();
      this.setHsv(this.hsv[0], (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, phase);
    });
    c.style.borderRadius = '6px';
    wrap.append(c, this.bar('hue', (t, phase) => this.setHsv(t * 360, this.hsv[1], this.hsv[2], phase)));
    return wrap;
  }

  /** Werte: Farbton, Sättigung, Helligkeit, Rot, Grün, Blau als Regler, dazu der Hex-Wert */
  private values(): HTMLElement {
    const wrap = el('div');
    const rgb = () => hsvToRgb(...this.hsv);
    const row = (label: string, kind: string, value: () => number, max: number, set: (t: number, phase: PickPhase) => void) => {
      const r = el('div', 'ze-crow');
      const val = el('span', 'ze-val');
      const b = this.bar(kind, set);
      this.painters.push(() => {
        val.textContent = String(Math.round(value() * max));
      });
      r.append(el('span', 'ze-label', label), b, val);
      return r;
    };
    wrap.append(
      row('H', 'hue', () => this.hsv[0] / 360, 360, (t, p) => this.setHsv(t * 360, this.hsv[1], this.hsv[2], p)),
      row('S', 'sat', () => this.hsv[1], 100, (t, p) => this.setHsv(this.hsv[0], t, this.hsv[2], p)),
      row('B', 'val', () => this.hsv[2], 100, (t, p) => this.setHsv(this.hsv[0], this.hsv[1], t, p)),
      row('R', 'r', () => rgb()[0], 255, (t, p) => this.setRgb(0, t, p)),
      row('G', 'g', () => rgb()[1], 255, (t, p) => this.setRgb(1, t, p)),
      row('B', 'b', () => rgb()[2], 255, (t, p) => this.setRgb(2, t, p)),
    );
    const hex = el('label', 'ze-hex');
    const input = el('input');
    input.inputMode = 'text';
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('change', () => {
      const v = input.value.trim().replace(/^#?/, '#').toLowerCase();
      const full = /^#[0-9a-f]{3}$/.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
      if (!/^#[0-9a-f]{6}$/.test(full)) return;
      const [h, s, b] = rgbToHsv(...hexToRgb(full));
      this.hsv = [s > 1e-3 ? h : this.hsv[0], s, b];
      this.emit(full, 'tap');
      this.paint();
    });
    this.painters.push(() => {
      if (document.activeElement !== input) input.value = hsvToHex(...this.hsv);
    });
    hex.append(el('span', '', 'Hex'), input);
    wrap.append(hex);
    return wrap;
  }

  private setRgb(i: number, t: number, phase: PickPhase): void {
    const c = hsvToRgb(...this.hsv);
    c[i] = Math.max(0, Math.min(1, t));
    const [h, s, v] = rgbToHsv(...c);
    this.hsv = [s > 1e-3 && v > 1e-3 ? h : this.hsv[0], s, v];
    this.emit(rgbToHex(...c), phase);
    this.paint();
  }

  /** Paletten: Zonenpalette (mit +, doppelt tippen bearbeitet ein Feld) und die Platzhalter-Palette */
  private palettes(): HTMLElement {
    const wrap = el('div');
    const zone = el('div', 'ze-chips');
    const cur = this.host.current();
    for (const sw of this.host.swatches()) {
      const chip = this.chip(`@${sw.id}`, sw.color, () => {
        if (this.editMode) {
          this.editing = sw.id;
          this.syncFromHost(true);
          this.render();
          return;
        }
        this.host.pick(`@${sw.id}`, 'tap');
      });
      chip.title = this.editMode ? `${sw.name}: antippen bearbeitet` : sw.name;
      chip.classList.toggle('on', cur === `@${sw.id}` || this.editing === sw.id);
      zone.append(chip);
    }
    const add = el('div', 'ze-chip add', '+');
    add.title = 'Aktuelle Farbe als Feld in die Zonenpalette';
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      // nur anlegen: die Auswahl behält ihre Farben (auf Flächen ziehen oder antippen verknüpft sie)
      const id = this.host.addSwatch(hsvToHex(...this.hsv));
      if (id) this.host.setCurrent(`@${id}`);
      this.render();
    });
    zone.append(add);
    const head = el('div', 'ze-csub', 'Zonenpalette');
    head.title = 'Felder der Zone: Flächen merken sich das Feld, ändert es sich, ändern sie sich mit';
    if (this.host.swatches().length) head.append(this.editToggle());
    const ph = el('div', 'ze-chips');
    ph.append(...PLACEHOLDER_PALETTE.map((c) => this.chip(c, c)));
    wrap.append(head, zone, el('div', 'ze-csub', 'Platzhalter'), ph);
    return wrap;
  }

  /**
   * Stile der Zone: antippen legt den Stil verknüpft auf die Auswahl, ziehen auf eine Fläche ebenso, doppelt tippen
   * bearbeitet ihn (Name, neu aus der Auswahl, löschen); + sichert den Anstrich der Auswahl als neuen Stil
   */
  private styles(): HTMLElement {
    const wrap = el('div');
    const list = this.host.styleList();
    if (this.editingStyle && !list.some((y) => y.id === this.editingStyle)) this.editingStyle = null;
    const edit = list.find((y) => y.id === this.editingStyle);
    if (edit) {
      const row = el('div', 'ze-cedit');
      const input = el('input');
      input.value = edit.name;
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') input.blur();
      });
      input.addEventListener('change', () => {
        const name = input.value.trim().slice(0, 40);
        if (name && name !== edit.name) this.host.renameStyle(edit.id, name);
      });
      row.append(input);
      if (this.host.hasSelection()) row.append(textButton('Neu festlegen', 'Den Stil aus dem Anstrich der Auswahl neu festlegen; alle verknüpften Flächen ändern sich mit', () => this.host.redefineStyle(edit.id)));
      row.append(
        textButton('Löschen', 'Stil löschen; verknüpfte Flächen behalten sein Aussehen', () => {
          this.host.deleteStyle(edit.id);
          this.editingStyle = null;
          this.render();
        }),
        textButton('Fertig', 'Stil fertig bearbeitet', () => {
          this.editingStyle = null;
          this.editMode = false;
          this.render();
        }),
      );
      wrap.append(row);
    }
    const chips = el('div', 'ze-chips');
    for (const y of list) {
      const c = el('div', `ze-schip${y.on || y.id === this.editingStyle ? ' on' : ''}`);
      c.style.background = y.preview;
      c.title = this.editMode ? `${y.name}: antippen bearbeitet` : `${y.name} (antippen: auf die Auswahl, ziehen: auf eine Fläche)`;
      this.source(c, () => `style:${y.id}`, () => {
        if (this.editMode) {
          this.editingStyle = y.id;
          this.render();
          return;
        }
        this.host.applyStyle(y.id);
      }, y.preview);
      chips.append(c);
    }
    const add = el('div', 'ze-schip add', '+');
    add.title = 'Anstrich der Auswahl als Stil sichern (Cmd+Wahl+C kopiert, Cmd+Wahl+V fügt ein)';
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = this.host.saveStyle();
      if (id) this.editingStyle = id;
      this.render();
    });
    chips.append(add);
    const head = el('div', 'ze-csub', 'Stile der Zone');
    head.title = 'Verknüpfte Stile: ändert sich der Stil, ändern sich alle Flächen mit ihm';
    if (list.length) head.append(this.editToggle());
    wrap.append(head, chips);
    if (!list.length) wrap.append(el('div', 'ze-csub', this.host.hasSelection() ? '+ sichert den Anstrich der Auswahl als ersten Stil' : 'Erst eine Form oder Fläche wählen, dann + sichert ihren Anstrich als Stil'));
    return wrap;
  }

  /** Schalter „Bearbeiten“: Antippen eines Felds oder Stils öffnet ihn (Name, Farbe, neu festlegen, löschen) */
  private editToggle(): HTMLElement {
    const b = textButton(this.editMode ? 'Fertig' : 'Bearbeiten', this.editMode ? 'Bearbeiten beenden' : 'Felder und Stile bearbeiten: dann öffnet Antippen statt aufzulegen', () => {
      this.editMode = !this.editMode;
      if (!this.editMode) {
        this.editing = null;
        this.editingStyle = null;
        this.syncFromHost(true);
      }
      this.render();
    }, this.editMode ? 'on' : '');
    b.style.marginLeft = 'auto';
    b.style.height = '24px';
    b.style.fontSize = '11px';
    return b;
  }

  /** Farbfeld: antippen wählt (oder onTap), ziehen lässt die Farbe auf das Bild fallen */
  private chip(value: PaintColor, hex: string, onTap?: () => void): HTMLElement {
    const c = el('div', 'ze-chip');
    c.style.background = hex;
    c.title = hex;
    this.source(c, () => value, onTap ?? (() => this.host.pick(value, 'tap')));
    return c;
  }

  /** Regler mit Farbverlauf als Hintergrund; kind bestimmt den Verlauf */
  private bar(kind: string, set: (t: number, phase: PickPhase) => void): HTMLElement {
    const b = el('div', 'ze-cbar');
    const knob = el('div', 'ze-knob');
    b.append(knob);
    this.painters.push(() => {
      const [h, s, v] = this.hsv;
      const [r, g, bl] = hsvToRgb(h, s, v);
      const hex = (x: number, y: number, z: number) => rgbToHex(x, y, z);
      let bg = '';
      let t = 0;
      if (kind === 'hue') {
        bg = `linear-gradient(90deg,${[0, 60, 120, 180, 240, 300, 360].map((d) => hsvToHex(d, 1, 1)).join(',')})`;
        t = h / 360;
      } else if (kind === 'sat') {
        bg = `linear-gradient(90deg,${hsvToHex(h, 0, v)},${hsvToHex(h, 1, v)})`;
        t = s;
      } else if (kind === 'val') {
        bg = `linear-gradient(90deg,#000000,${hsvToHex(h, s, 1)})`;
        t = v;
      } else {
        const i = kind === 'r' ? 0 : kind === 'g' ? 1 : 2;
        const lo: [number, number, number] = [r, g, bl];
        const hi: [number, number, number] = [r, g, bl];
        lo[i] = 0;
        hi[i] = 1;
        bg = `linear-gradient(90deg,${hex(...lo)},${hex(...hi)})`;
        t = [r, g, bl][i];
      }
      b.style.background = bg;
      knob.style.left = `${(t * 100).toFixed(2)}%`;
    });
    this.dragArea(b, (e, phase) => {
      const r = b.getBoundingClientRect();
      set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), phase);
    });
    return b;
  }

  /** Fläche, auf der Drücken und Ziehen eine Farbe wählt (ein Rückgängig-Schritt je Geste) */
  private dragArea(elm: HTMLElement, at: (e: PointerEvent, phase: PickPhase) => void, done?: () => void): void {
    elm.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      elm.setPointerCapture(e.pointerId);
      at(e, 'start');
      const move = (ev: PointerEvent) => at(ev, 'move');
      const up = (ev: PointerEvent) => {
        elm.removeEventListener('pointermove', move);
        elm.removeEventListener('pointerup', up);
        elm.removeEventListener('pointercancel', up);
        at(ev, 'end');
        done?.();
      };
      elm.addEventListener('pointermove', move);
      elm.addEventListener('pointerup', up);
      elm.addEventListener('pointercancel', up);
    });
  }

  /** Quelle für Ziehen und Fallenlassen (ColorDrop): kurz antippen ruft onTap, ziehen trägt die Farbe auf das Bild */
  private source(elm: HTMLElement, value: () => PaintColor, onTap: () => void, ghost?: string): void {
    elm.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      try {
        elm.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const move = (ev: PointerEvent) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 7) {
          dragging = true;
          this.ghost.style.background = ghost ?? this.host.resolve(value());
          this.ghost.style.display = 'block';
        }
        if (!dragging) return;
        this.ghost.style.left = `${ev.clientX}px`;
        this.ghost.style.top = `${ev.clientY}px`;
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        if (over?.closest('.ze-panel')) this.host.dropEnd();
        else this.host.dropHover(ev.clientX, ev.clientY);
      };
      const up = (ev: PointerEvent) => {
        elm.removeEventListener('pointermove', move);
        elm.removeEventListener('pointerup', up);
        elm.removeEventListener('pointercancel', up);
        if (!dragging) {
          if (ev.type === 'pointerup') onTap();
          return;
        }
        this.ghost.style.display = 'none';
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        if (ev.type === 'pointerup' && !over?.closest('.ze-panel')) this.host.drop(value(), ev.clientX, ev.clientY);
        else this.host.dropEnd();
      };
      elm.addEventListener('pointermove', move);
      elm.addEventListener('pointerup', up);
      elm.addEventListener('pointercancel', up);
    });
  }

  destroy(): void {
    this.ghost.remove();
  }
}
