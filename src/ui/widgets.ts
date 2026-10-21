/**
 * UI-Bausteine in gemaltem Stil: Buttons, Pills, Panels, Icons. Alles in Bildschirm-Pixeln.
 */
import { Container, Graphics, Text, TextStyle, type TextStyleOptions } from 'pixi.js';
import { hexNum, shade } from '@/render/paint';
import { noise1 } from '@/core/math';

export const FONT_DISPLAY = '"Fredoka", "Baloo 2", "Nunito", "Segoe UI", sans-serif';
export const FONT_TEXT = '"Nunito", "Fredoka", "Segoe UI", sans-serif';
/** Offizielle illudiy-Markenschrift (nur Gewicht 400, nie in Großbuchstaben), lokal unter public/fonts */
export const FONT_BRAND = '"Lobster", "Brush Script MT", cursive';
export const INK = '#2a1f3d';
export const PINK = '#ff5c8a';
export const PAPER = '#fff8ec';

export function textStyle(size: number, color = INK, display = false, extra: Partial<TextStyleOptions> = {}): TextStyle {
  return new TextStyle({
    fontFamily: display ? FONT_DISPLAY : FONT_TEXT,
    fontSize: size,
    fontWeight: display ? '700' : '700',
    fill: color,
    align: 'center',
    ...extra,
  });
}

export function label(txt: string, size: number, color = INK, display = false, extra: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({ text: txt, style: textStyle(size, color, display, extra) });
  t.anchor.set(0.5);
  t.resolution = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  return t;
}

/** Wackelige abgerundete Fläche (handgezeichnet) */
export function paintRect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, stroke = INK, radius = 18, seed = 1, alpha = 1): Graphics {
  const pts: number[] = [];
  const steps = 10;
  const r = Math.min(radius, w / 2, h / 2);
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = a0 + (Math.PI / 2) * (i / 5);
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const n = noise1(f * 6 + seed * 11 + x0 * 0.01, seed) * 1.2;
      pts.push(x0 + (x1 - x0) * f + n * (y1 !== y0 ? 1 : 0), y0 + (y1 - y0) * f + n * (x1 !== x0 ? 1 : 0));
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  edge(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  edge(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  edge(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI);
  edge(x + r, y, x + w - r, y);
  g.poly(pts).fill({ color: hexNum(fill), alpha }).stroke({ width: 3, color: hexNum(stroke), alpha: 0.9, join: 'round' });
  return g;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: string;
  textColor?: string;
  size?: number;
  display?: boolean;
  round?: boolean;
  icon?: (g: Graphics, size: number) => void;
  seed?: number;
}

export class Button extends Container {
  private bg = new Graphics();
  private txt: Text | null = null;
  private opts: Required<Pick<ButtonOptions, 'width' | 'height' | 'color' | 'textColor' | 'size' | 'display' | 'round' | 'seed'>> & { icon?: ButtonOptions['icon'] };
  private pressed = false;
  onTap: (() => void) | null = null;
  enabledState = true;

  constructor(text: string, opts: ButtonOptions = {}) {
    super();
    this.opts = {
      width: opts.width ?? 180, height: opts.height ?? 56, color: opts.color ?? PINK, textColor: opts.textColor ?? '#ffffff', size: opts.size ?? 24,
      display: opts.display ?? true, round: opts.round ?? false, seed: opts.seed ?? Math.floor(Math.random() * 100), icon: opts.icon,
    };
    this.addChild(this.bg);
    if (text) {
      this.txt = label(text, this.opts.size, this.opts.textColor, this.opts.display);
      this.addChild(this.txt);
    }
    this.draw();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => {
      this.pressed = true;
      this.scale.set(0.94);
    });
    const up = () => {
      this.pressed = false;
      this.scale.set(1);
    };
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
    this.on('pointertap', () => {
      if (this.enabledState) this.onTap?.();
    });
  }

  setText(t: string): void {
    if (this.txt) this.txt.text = t;
  }

  setEnabled(v: boolean): void {
    this.enabledState = v;
    this.alpha = v ? 1 : 0.45;
    this.cursor = v ? 'pointer' : 'default';
  }

  setColor(c: string): void {
    this.opts.color = c;
    this.draw();
  }

  private draw(): void {
    const { width, height, color, round, seed } = this.opts;
    this.bg.clear();
    // Schatten
    if (round) {
      this.bg.circle(2, 4, width / 2).fill({ color: hexNum(INK), alpha: 0.18 });
      this.bg.circle(0, 0, width / 2).fill(hexNum(color)).stroke({ width: 3, color: hexNum(INK) });
      this.bg.circle(-width * 0.12, -width * 0.14, width * 0.2).fill({ color: 0xffffff, alpha: 0.28 });
    } else {
      paintRect(this.bg, -width / 2 + 2, -height / 2 + 4, width, height, shade(INK, 0.1), INK, 18, seed + 1, 0.18);
      paintRect(this.bg, -width / 2, -height / 2, width, height, color, INK, 18, seed);
      this.bg.roundRect(-width / 2 + 10, -height / 2 + 6, width - 20, height * 0.28, 8).fill({ color: 0xffffff, alpha: 0.22 });
    }
    if (this.opts.icon) this.opts.icon(this.bg, round ? width : height);
    void this.pressed;
  }
}

/** Panel mit Papier-Hintergrund */
export function panel(w: number, h: number, color = PAPER, seed = 3): Graphics {
  const g = new Graphics();
  paintRect(g, -w / 2 + 3, -h / 2 + 6, w, h, INK, INK, 24, seed + 2, 0.15);
  paintRect(g, -w / 2, -h / 2, w, h, color, INK, 24, seed);
  return g;
}

/** Stern (gefüllt oder leer) */
export function star(g: Graphics, cx: number, cy: number, r: number, filled: boolean): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.poly(pts).fill(filled ? 0xffd23f : 0xffffff).stroke({ width: Math.max(2, r * 0.12), color: hexNum(INK), join: 'round' });
}

/** Icons für Ziele (einfache Vektorformen) */
export function goalIcon(g: Graphics, type: string, s: number): void {
  const ink = hexNum(INK);
  const half = s / 2;
  switch (type) {
    case 'height': case 'drop':
      g.moveTo(0, half).lineTo(0, -half).stroke({ width: 3, color: ink, cap: 'round' });
      if (type === 'height') g.moveTo(-half * 0.6, -half * 0.3).lineTo(0, -half).lineTo(half * 0.6, -half * 0.3).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
      else g.moveTo(-half * 0.6, half * 0.3).lineTo(0, half).lineTo(half * 0.6, half * 0.3).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
      break;
    case 'coins': g.circle(0, 0, half * 0.8).fill(0xffd23f).stroke({ width: 2.5, color: ink }); g.rect(-2, -half * 0.45, 4, half * 0.9).fill({ color: 0xb57a10, alpha: 0.6 }); break;
    case 'loops': g.circle(0, 0, half * 0.75).stroke({ width: 3.5, color: ink }); g.moveTo(-half, half * 0.9).lineTo(-half * 0.3, half * 0.55).stroke({ width: 3.5, color: ink, cap: 'round' }); break;
    case 'turns': g.moveTo(-half, half * 0.6).lineTo(half * 0.3, half * 0.6).arc(half * 0.3, 0, half * 0.6, Math.PI / 2, -Math.PI / 2, true).lineTo(-half * 0.4, -half * 0.6).stroke({ width: 3.5, color: ink, cap: 'round', join: 'round' }); break;
    case 'tunnels': g.moveTo(-half, half * 0.7).lineTo(-half, 0).arc(0, 0, half, Math.PI, 0).lineTo(half, half * 0.7).stroke({ width: 3.5, color: ink, cap: 'round' }); g.rect(-half * 0.5, 0, half, half * 0.7).fill(ink); break;
    case 'launch': case 'boosters': g.poly([-half * 0.3, -half, half * 0.5, -half * 0.1, 0, -half * 0.1, half * 0.3, half, -half * 0.5, 0.1 * half, 0, 0.1 * half]).fill(0xffb13b).stroke({ width: 2, color: ink, join: 'round' }); break;
    case 'chainlift': g.moveTo(-half, half * 0.8).lineTo(half, -half * 0.8).stroke({ width: 4, color: ink, cap: 'round' }); for (let i = 0; i < 4; i++) g.circle(-half + (i * 2 * half) / 3, half * 0.8 - (i * 1.6 * half) / 3, 3).fill(0xffd23f); break;
    case 'airtime': g.ellipse(0, half * 0.2, half, half * 0.55).fill(0xffffff).stroke({ width: 2.5, color: ink }); g.moveTo(-half * 0.3, -half * 0.3).lineTo(0, -half).lineTo(half * 0.3, -half * 0.3).stroke({ width: 3, color: ink, cap: 'round', join: 'round' }); break;
    case 'speed': g.circle(0, 0, half * 0.85).stroke({ width: 3, color: ink }); g.moveTo(0, 0).lineTo(half * 0.5, -half * 0.5).stroke({ width: 3, color: 0xff5c8a, cap: 'round' }); break;
    case 'length': case 'maxLength': g.moveTo(-half, 0).lineTo(half, 0).stroke({ width: 3.5, color: ink, cap: 'round' }); g.moveTo(-half * 0.6, -half * 0.4).lineTo(-half, 0).lineTo(-half * 0.6, half * 0.4).moveTo(half * 0.6, -half * 0.4).lineTo(half, 0).lineTo(half * 0.6, half * 0.4).stroke({ width: 3, color: ink, cap: 'round', join: 'round' }); break;
    case 'time': case 'maxTime': g.circle(0, 0, half * 0.85).stroke({ width: 3, color: ink }); g.moveTo(0, -half * 0.5).lineTo(0, 0).lineTo(half * 0.4, half * 0.2).stroke({ width: 3, color: ink, cap: 'round' }); break;
    case 'rolls': g.ellipse(-half * 0.45, 0, half * 0.5, half * 0.35).stroke({ width: 3, color: ink }); g.ellipse(half * 0.45, 0, half * 0.5, half * 0.35).stroke({ width: 3, color: ink }); break;
    case 'maxG': case 'minG': g.circle(0, half * 0.2, half * 0.5).fill(0x9b6dff).stroke({ width: 2.5, color: ink }); g.moveTo(-half * 0.4, -half * 0.8).lineTo(0, -half * 0.35).lineTo(half * 0.4, -half * 0.8).stroke({ width: 3, color: ink, cap: 'round', join: 'round' }); break;
    case 'splash': for (let i = 0; i < 3; i++) g.moveTo(-half, -half * 0.5 + i * half * 0.5).quadraticCurveTo(-half * 0.5, -half * 0.9 + i * half * 0.5, 0, -half * 0.5 + i * half * 0.5).quadraticCurveTo(half * 0.5, -half * 0.1 + i * half * 0.5, half, -half * 0.5 + i * half * 0.5).stroke({ width: 3, color: 0x3ec7c2, cap: 'round' }); break;
    case 'lanes': for (let i = 0; i < 3; i++) g.moveTo(-half + i * 4, -half * 0.6 + i * half * 0.6).lineTo(half - i * 4, -half * 0.6 + i * half * 0.6).stroke({ width: 3, color: ink, cap: 'round' }); break;
    case 'noBrakes': g.circle(0, 0, half * 0.8).stroke({ width: 3, color: 0xd64545 }); g.moveTo(-half * 0.55, -half * 0.55).lineTo(half * 0.55, half * 0.55).stroke({ width: 3, color: 0xd64545, cap: 'round' }); break;
    case 'element': g.roundRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6, 4).fill(0x9b6dff).stroke({ width: 2.5, color: ink }); g.moveTo(-half * 0.3, 0).lineTo(half * 0.3, 0).moveTo(0, -half * 0.3).lineTo(0, half * 0.3).stroke({ width: 3, color: 0xffffff, cap: 'round' }); break;
    // negative Ziele: Figur fliegt aus der Wanne (eject), fällt in die Wanne (catch), Flugbogen mit Weite (flight)
    case 'eject': g.moveTo(-half, half * 0.3).lineTo(-half, half * 0.9).lineTo(half * 0.2, half * 0.9).lineTo(half * 0.2, half * 0.3).stroke({ width: 3, color: ink, join: 'round' }); g.circle(half * 0.45, -half * 0.55, half * 0.28).fill(0xffd9b3).stroke({ width: 2, color: ink }); g.moveTo(-half * 0.4, 0).quadraticCurveTo(0, -half, half * 0.45, -half * 0.2).stroke({ width: 2.5, color: 0xff5c8a, cap: 'round' }); break;
    case 'catch': g.moveTo(-half * 0.8, -half * 0.1).lineTo(-half * 0.8, half * 0.9).lineTo(half * 0.8, half * 0.9).lineTo(half * 0.8, -half * 0.1).stroke({ width: 3, color: ink, join: 'round' }); g.circle(0, -half * 0.55, half * 0.28).fill(0xffd9b3).stroke({ width: 2, color: ink }); g.moveTo(0, -half * 0.2).lineTo(0, half * 0.5).stroke({ width: 2.5, color: 0x7ee081, cap: 'round' }); g.moveTo(-half * 0.25, half * 0.2).lineTo(0, half * 0.5).lineTo(half * 0.25, half * 0.2).stroke({ width: 2.5, color: 0x7ee081, cap: 'round', join: 'round' }); break;
    case 'flight': g.moveTo(-half, half * 0.6).quadraticCurveTo(0, -half * 1.2, half, half * 0.6).stroke({ width: 3, color: ink, cap: 'round' }); g.moveTo(-half, half * 0.9).lineTo(half, half * 0.9).stroke({ width: 2.5, color: 0xff5c8a, cap: 'round' }); g.moveTo(half * 0.6, half * 0.6).lineTo(half, half * 0.9).lineTo(half * 0.6, half * 1.2).stroke({ width: 2.5, color: 0xff5c8a, cap: 'round', join: 'round' }); break;
    default: g.circle(0, 0, half * 0.6).fill(0x7ee081).stroke({ width: 2.5, color: ink }); g.moveTo(-half * 0.35, 0).lineTo(-half * 0.05, half * 0.3).lineTo(half * 0.4, -half * 0.35).stroke({ width: 3, color: ink, cap: 'round', join: 'round' });
  }
}

/** Gurt-Abzeichen: Sitz mit Gurtstufe 0–4 (ohne, Beckengurt, Bügel, Schulterbügel, Rennsitz); broken = gerissen */
export function beltIcon(g: Graphics, level: number, s: number, broken = false): void {
  const ink = hexNum(INK);
  const half = s / 2;
  const strap = broken ? 0xd64545 : 0x4a4458;
  // Sitz: Lehne links, Sitzfläche unten
  g.roundRect(-half * 0.9, -half * 0.9, half * 0.35, half * 1.5, 3).fill(0x9b6dff).stroke({ width: 2, color: ink });
  g.roundRect(-half * 0.9, half * 0.3, half * 1.7, half * 0.35, 3).fill(0x9b6dff).stroke({ width: 2, color: ink });
  if (level === 1) {
    g.moveTo(-half * 0.45, half * 0.1).lineTo(half * 0.55, half * 0.1).stroke({ width: 3, color: strap, cap: 'round' });
  } else if (level === 2) {
    g.roundRect(-half * 0.45, -half * 0.05, half * 1.1, half * 0.3, 3).fill(0xc9c4d6).stroke({ width: 1.5, color: ink });
  } else if (level >= 3) {
    g.moveTo(-half * 0.5, -half * 0.75).lineTo(half * 0.15, half * 0.15).moveTo(-half * 0.2, -half * 0.75).lineTo(half * 0.5, half * 0.15).stroke({ width: level === 4 ? 4 : 3, color: strap, cap: 'round' });
    if (level === 4) g.roundRect(half * 0.55, -half * 0.9, half * 0.3, half * 1.2, 3).fill(0x2f2a3d).stroke({ width: 1.5, color: ink });
  }
  if (broken) g.moveTo(-half * 0.2, -half * 0.3).lineTo(half * 0.5, half * 0.4).moveTo(half * 0.5, -half * 0.3).lineTo(-half * 0.2, half * 0.4).stroke({ width: 3, color: 0xd64545, cap: 'round' });
}

/** Haken (grün) oder Kreuz (rot) */
export function check(g: Graphics, cx: number, cy: number, r: number, ok: boolean): void {
  g.circle(cx, cy, r).fill(ok ? 0x7ee081 : 0xffffff).stroke({ width: 2, color: hexNum(INK) });
  if (ok) g.moveTo(cx - r * 0.5, cy).lineTo(cx - r * 0.1, cy + r * 0.45).lineTo(cx + r * 0.55, cy - r * 0.45).stroke({ width: 2.5, color: hexNum(INK), cap: 'round', join: 'round' });
}

export function iconBack(g: Graphics, s: number): void {
  const h = s * 0.22;
  g.moveTo(h * 0.5, -h).lineTo(-h * 0.5, 0).lineTo(h * 0.5, h).stroke({ width: 4, color: 0xffffff, cap: 'round', join: 'round' });
}
export function iconUndo(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.arc(0, 2, r, Math.PI * 0.1, Math.PI * 1.55, false).stroke({ width: 4, color: 0xffffff, cap: 'round' });
  g.poly([-r - 6, -r * 0.4, -r + 4, -r * 0.3, -r - 2, -r - 6]).fill(0xffffff);
}
export function iconRedo(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.arc(0, 2, r, Math.PI * 0.9, -Math.PI * 0.55, true).stroke({ width: 4, color: 0xffffff, cap: 'round' });
  g.poly([r + 6, -r * 0.4, r - 4, -r * 0.3, r + 2, -r - 6]).fill(0xffffff);
}
export function iconPlay(g: Graphics, s: number): void {
  const r = s * 0.22;
  g.poly([-r * 0.7, -r, r, 0, -r * 0.7, r]).fill(0xffffff).stroke({ width: 3, color: hexNum(INK), join: 'round' });
}
export function iconStop(g: Graphics, s: number): void {
  const r = s * 0.18;
  g.roundRect(-r, -r, r * 2, r * 2, 4).fill(0xffffff).stroke({ width: 3, color: hexNum(INK) });
}
export function iconGear(g: Graphics, s: number): void {
  const r = s * 0.2;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    g.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6).lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1).stroke({ width: 5, color: 0xffffff, cap: 'round' });
  }
  g.circle(0, 0, r * 0.65).fill(0xffffff);
  g.circle(0, 0, r * 0.25).fill(hexNum(INK));
}
export function iconTrash(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.roundRect(-r * 0.7, -r * 0.5, r * 1.4, r * 1.4, 3).fill(0xffffff);
  g.rect(-r, -r * 0.8, r * 2, r * 0.3).fill(0xffffff);
}
export function iconSave(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.roundRect(-r, -r, r * 2, r * 2, 3).fill(0xffffff);
  g.rect(-r * 0.5, -r, r, r * 0.6).fill(hexNum(INK));
  g.rect(-r * 0.6, r * 0.1, r * 1.2, r * 0.7).fill(hexNum(INK));
}
export function iconPlus(g: Graphics, s: number): void {
  const r = s * 0.22;
  g.moveTo(-r, 0).lineTo(r, 0).moveTo(0, -r).lineTo(0, r).stroke({ width: 5, color: 0xffffff, cap: 'round' });
}
export function iconShelf(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.roundRect(-r, -r, r * 0.85, r * 0.85, 3).fill(0xffffff);
  g.roundRect(r * 0.15, -r, r * 0.85, r * 0.85, 3).fill(0xffffff);
  g.roundRect(-r, r * 0.15, r * 0.85, r * 0.85, 3).fill(0xffffff);
  g.roundRect(r * 0.15, r * 0.15, r * 0.85, r * 0.85, 3).fill(0xffd23f);
}
export function iconPerson(g: Graphics, s: number): void {
  const r = s * 0.2;
  g.circle(0, -r * 0.45, r * 0.45).fill(0xffffff);
  g.roundRect(-r * 0.8, r * 0.1, r * 1.6, r * 0.9, r * 0.4).fill(0xffffff);
}

/**
 * Sticker: zwei schräg liegende Papierkarten mit großem Text („Entgleist!“, „Gefangen!“), knallt rein
 * (1,6 → 1 in 0,18 s), bleibt kurz stehen und blendet aus.
 */
export class Sticker extends Container {
  private back = new Graphics();
  private front = new Graphics();
  private txt: Text;
  private timer = 0;
  private slam = 0;
  constructor() {
    super();
    this.txt = label('', 34, INK, true);
    this.addChild(this.back, this.front, this.txt);
    this.visible = false;
  }
  show(text: string, color = '#ffd23f', seconds = 1.6): void {
    this.txt.text = text;
    const w = this.txt.width + 56;
    const h = this.txt.height + 28;
    this.back.clear();
    this.front.clear();
    paintRect(this.back, -w / 2, -h / 2, w, h, '#ffffff', INK, 14, 9);
    this.back.rotation = 0.07;
    paintRect(this.front, -w / 2, -h / 2, w, h, color, INK, 14, 4);
    this.front.rotation = -0.07;
    this.txt.rotation = -0.07;
    this.visible = true;
    this.alpha = 1;
    this.timer = seconds;
    this.slam = 0.18;
    this.scale.set(1.6);
  }
  update(dt: number): void {
    if (!this.visible) return;
    if (this.slam > 0) {
      this.slam = Math.max(0, this.slam - dt);
      const k = 1 - this.slam / 0.18;
      this.scale.set(1.6 - 0.6 * (1 - (1 - k) * (1 - k)));
    }
    this.timer -= dt;
    if (this.timer < 0.4) this.alpha = Math.max(0, this.timer / 0.4);
    if (this.timer <= 0) this.visible = false;
  }
}

/** Toast-Hinweis unten */
export class Toast extends Container {
  private bg = new Graphics();
  private txt: Text;
  private timer = 0;
  constructor() {
    super();
    this.txt = label('', 18, INK, false, { wordWrap: true, wordWrapWidth: 420 });
    this.addChild(this.bg, this.txt);
    this.visible = false;
  }
  show(msg: string, seconds = 3): void {
    this.txt.text = msg;
    const w = Math.min(460, this.txt.width + 44);
    const h = this.txt.height + 24;
    this.bg.clear();
    paintRect(this.bg, -w / 2, -h / 2, w, h, PAPER, INK, 16, 5, 0.95);
    this.visible = true;
    this.alpha = 1;
    this.timer = seconds;
  }
  update(dt: number): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer < 0.5) this.alpha = Math.max(0, this.timer / 0.5);
    if (this.timer <= 0) this.visible = false;
  }
}
