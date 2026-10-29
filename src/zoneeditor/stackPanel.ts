/**
 * Füllstapel als kleine Liste über der Leiste unten (Stufe 3, Plan 4.2 und 4.6): oben die oberste Füllung, unten die
 * Grundfarbe. Je Zeile ein Auge, eine Vorschau, der Name, der Mischmodus als Buchstabe (wie das „N“ in Procreate) und
 * die Deckkraft; waagrecht über die Zeile ziehen ändert die Deckkraft. Die gewählte Zeile bekommt ihre Farbe aus dem
 * Farbmenü, ein Verlauf öffnet den Regler (Werkzeug G). Für eine Ebene derselbe Stapel ohne Grundfarbe (Ebenenstapel)
 * und dazu die Luftperspektive der Zone.
 *
 * Diese Datei baut nur die Liste und meldet Bedienungen über `StackActions`. Platzhalter: das genaue Aussehen.
 */
import { BLEND_MODES, BLEND_WORDS, type BlendMode } from '@/zone/paint';
import { EARLE_PRESETS, EARLE_WORDS, type EarlePreset } from '@/zone/earle';
import type { PickPhase } from './colorMenu';

/** ein Wert der gewählten Schicht: Zahl (waagrecht ziehen oder eintippen) oder Auswahl (antippen schaltet weiter) */
export interface StackParam {
  key: string;
  label: string;
  title: string;
  value: number | string;
  /** Zahl: Änderung je Bildpunkt beim Ziehen, Grenzen, Nachkommastellen */
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  /** Auswahl: Werte mit Wort */
  options?: Array<{ value: string; word: string }>;
}

export interface StackRow {
  /** Index im Füllstapel; -1 ist die Grundfarbe (Deckkraft = Deckkraft der Fläche) */
  index: number;
  kind: 'base' | 'color' | 'gradient' | 'fade' | 'light' | 'shade' | 'dots' | 'grain' | 'sparkle' | 'crown' | 'wave';
  /** Name statt des Worts der Art (Kantenverlauf, Bänder, Papier, Gouache) */
  name?: string;
  /** CSS-Hintergrund der Vorschau */
  preview: string;
  blend: BlendMode | null;
  opacity: number;
  hidden: boolean;
  /** Werte der Schicht (die gewählte Zeile zeigt sie darunter) */
  params?: StackParam[];
  /** Earle-Schicht mit Farbe: eigene (true) oder die der Zone (false) */
  ownColor?: boolean;
}

/** Licht der Zone im Füllstapel: Richtung (Grad), Licht- und Schattenfarbe (CSS) */
export interface StackLight {
  angle: number;
  color: string;
  shade: string;
}

export interface StackView {
  title: string;
  /** von oben (oberste Füllung) nach unten */
  rows: StackRow[];
  selected: number | null;
  /** nur im Ebenenstapel: Luftperspektive der Zone und Anteil dieser Ebene */
  air?: { color: string; amount: number; near: number; far: number; plane: number } | null;
  /** Füllstapel voll (höchstens 7 Füllungen über der Grundfarbe) */
  full: boolean;
  /** Stile (nicht im Ebenenstapel): Name des verknüpften Stils, ob ein kopierter Stil bereitliegt */
  styles?: { linked: string | null; canPaste: boolean } | null;
  /** Licht der Zone (Ebenenstapel, und wo eine Schicht es nutzt) */
  light?: StackLight | null;
}

export interface StackActions {
  stackSelect(index: number): void;
  stackOpacity(index: number, v: number, phase: PickPhase): void;
  stackBlend(index: number, mode: BlendMode): void;
  stackHide(index: number): void;
  stackRemove(index: number): void;
  stackMove(index: number, dir: 1 | -1): void;
  stackAdd(kind: StackAddKind): void;
  stackGradient(index: number): void;
  /** einen Wert der Schicht ändern (Ziehen: start, move, end ist ein Schritt im Arbeitsverlauf) */
  stackParam(index: number, key: string, value: number | string, phase: PickPhase): void;
  /** Earle-Schicht wieder mit der Licht- bzw. Schattenfarbe der Zone */
  stackZoneColor(index: number): void;
  /** Knopf „Earle“: Vorgabe auf die Auswahl, automatisch je Fläche, oder automatisch auf die ganze Zone */
  stackEarle(preset: EarlePreset | 'auto' | 'zone'): void;
  /** Licht der Zone: Richtung; Farben: Licht bzw. Schatten wird Ziel des Farbmenüs */
  stackLight(patch: { angle?: number; color?: true; shade?: true }, phase: PickPhase): void;
  /** Luftperspektive: Stärke, ab, voll bei (Zone), Anteil der Ebene; Farbe: die Luft wird Ziel des Farbmenüs */
  stackAir(patch: { amount?: number; near?: number; far?: number; plane?: number; color?: true }, phase: PickPhase): void;
  stackClose(): void;
  /** Stil des Ziels kopieren, einfügen, als neuen Stil sichern, vom verknüpften Stil lösen */
  stackStyle(what: 'copy' | 'paste' | 'save' | 'unlink'): void;
}

export type StackAddKind = 'color' | 'gradient' | 'fade' | 'edge' | 'light' | 'shade' | 'dots' | 'grain' | 'sparkle' | 'crown' | 'wave';

const KIND_WORDS: Record<StackRow['kind'], string> = { base: 'Grundfarbe', color: 'Farbe', gradient: 'Verlauf', fade: 'Deckkraftverlauf', light: 'Lichtkante', shade: 'Innenschatten', dots: 'Pünktchen', grain: 'Papier', sparkle: 'Funkeln', crown: 'Punktkrone', wave: 'Kantenwelle' };

export const STACK_CSS = `
.ze-stack{left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 66px);width:344px;padding:6px;display:none;z-index:2}
@media (pointer:coarse){.ze-stack{bottom:calc(env(safe-area-inset-bottom,0px) + 74px);width:372px}}
.ze-stack.show{display:block}
.ze-shead{display:flex;align-items:center;gap:4px;padding:2px 2px 6px 8px;color:#bdbab3}
.ze-shead .ze-title{flex:1}
.ze-srow{display:flex;align-items:center;gap:6px;height:36px;padding:0 4px;border-radius:8px;cursor:pointer;touch-action:none}
@media (pointer:coarse){.ze-srow{height:42px}}
.ze-srow.on{background:rgba(141,180,255,.14)}
.ze-srow.dim{opacity:.45}
.ze-sprev{width:34px;height:20px;border-radius:4px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
.ze-sname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ze-sop{width:42px;text-align:right;color:#bdbab3;font-variant-numeric:tabular-nums;cursor:ew-resize}
.ze-srow .ze-btn{min-width:28px;height:28px;padding:0 6px}
.ze-blends{display:flex;flex-wrap:wrap;gap:2px;padding:2px 4px 6px 44px}
.ze-blends .ze-btn{height:28px;font-size:12px;padding:0 8px}
.ze-sfoot{display:flex;gap:2px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.06);margin-top:4px;padding-top:4px}
.ze-sfoot .ze-btn{font-size:12px}
.ze-sair{display:flex;align-items:center;gap:6px;padding:4px 4px;color:#bdbab3;flex-wrap:wrap}
.ze-sair .ze-num input{width:52px}
.ze-sparams{display:flex;flex-wrap:wrap;gap:4px 8px;padding:2px 4px 6px 44px;color:#bdbab3}
.ze-sparams .ze-num input{width:46px}
.ze-sparams .ze-num>span{cursor:ew-resize;touch-action:none}
.ze-sparams .ze-btn{height:26px;font-size:12px;padding:0 8px}
.ze-sun{width:30px;height:30px;flex:none}
.ze-sun line{stroke:#e8e4da;stroke-width:2;stroke-linecap:round}
.ze-sun .knob{fill:#e8e4da}
.ze-sun .ring{fill:none;stroke:rgba(232,228,218,.3);stroke-width:1}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function btn(label: string, title: string, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `ze-btn ${cls}`.trim());
  b.innerHTML = label;
  b.title = title;
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1C11 6 11.5 6 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.4-1"/></svg>';
const pct = (v: number): string => `${Math.round(v * 100)} %`;

export class StackPanel {
  readonly el = el('div', 'ze-panel ze-stack');
  private key = '';
  /** Zeile, deren Mischmodi gerade aufgeklappt sind */
  private blendOpen: number | null = null;
  /** Deckkraft wird gerade gezogen (dann nicht neu aufbauen) */
  private dragging = false;
  /** Zeile mit den Earle-Knöpfen aufgeklappt */
  private earleOpen = false;

  constructor(private readonly a: StackActions) {
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(view: StackView | null): void {
    if (this.dragging) return;
    const key = view ? JSON.stringify([view, this.blendOpen, this.earleOpen]) : '';
    if (key === this.key) return;
    this.key = key;
    this.el.classList.toggle('show', !!view);
    this.el.replaceChildren();
    if (!view) {
      this.blendOpen = null;
      return;
    }
    const head = el('div', 'ze-shead');
    head.append(el('span', 'ze-title', view.title), btn('Fertig', 'Liste schließen', () => this.a.stackClose()));
    this.el.append(head);
    if (view.styles) {
      const bar = el('div', 'ze-sfoot');
      bar.style.borderTop = '0';
      bar.style.marginTop = '0';
      bar.style.paddingTop = '0';
      if (view.styles.linked) bar.append(el('span', 'ze-label', `Stil „${view.styles.linked}“`), btn('Lösen', 'Vom Stil lösen: die Fläche behält ihr Aussehen, der Stil ändert sie nicht mehr', () => this.a.stackStyle('unlink')));
      bar.append(
        btn('Stil kopieren', 'Anstrich kopieren (Cmd+Wahl+C)', () => this.a.stackStyle('copy')),
        Object.assign(btn('Einfügen', 'Kopierten Anstrich einfügen (Cmd+Wahl+V)', () => this.a.stackStyle('paste')), { disabled: !view.styles.canPaste }),
        btn('Als Stil', 'Als neuen Stil der Zone sichern und verknüpfen (Farbmenü › Stile)', () => this.a.stackStyle('save')),
      );
      this.el.append(bar);
    }
    for (const r of view.rows) {
      this.el.append(this.row(r, view.selected === r.index, view.rows));
      if (this.blendOpen === r.index && r.blend) {
        const list = el('div', 'ze-blends');
        for (const m of BLEND_MODES)
          list.append(
            btn(BLEND_WORDS[m].name, `Mischmodus: ${BLEND_WORDS[m].name}`, () => {
              this.blendOpen = null;
              this.a.stackBlend(r.index, m);
            }, m === r.blend ? 'on' : ''),
          );
        this.el.append(list);
      }
      if (view.selected === r.index && r.params?.length) this.el.append(this.params(r));
    }
    if (view.light) this.el.append(this.lightRow(view.light));
    if (view.air) this.el.append(this.airRow(view.air));
    const foot = el('div', 'ze-sfoot');
    if (!view.full)
      foot.append(
        btn('+ Farbe', 'Farbe über den Stapel (aktuelle Farbe; Mischmodus und Deckkraft in der Zeile)', () => this.a.stackAdd('color')),
        btn('+ Verlauf', 'Verlauf über den Stapel, danach mit dem Regler (G) einstellen', () => this.a.stackAdd('gradient')),
        btn('+ Deckkraftverlauf', 'Alles darunter läuft durchsichtig aus', () => this.a.stackAdd('fade')),
      );
    else foot.append(el('span', 'ze-label', 'Der Stapel ist voll'));
    foot.append(
      btn('Earle …', 'Earle-Schichten: Lichtkante, Innenschatten, Pünktchen, Papier, Kantenverlauf und der Knopf „Earle“', () => {
        this.earleOpen = !this.earleOpen;
        this.key = '';
        this.set(view);
      }, this.earleOpen ? 'on' : ''),
    );
    this.el.append(foot);
    if (this.earleOpen) {
      const add = el('div', 'ze-sfoot');
      if (!view.full)
        add.append(
          btn('+ Lichtkante', 'Helle Sichel an den Kanten zum Licht der Zone', () => this.a.stackAdd('light')),
          btn('+ Innenschatten', 'Dunkle Sichel an den Kanten vom Licht weg', () => this.a.stackAdd('shade')),
          btn('+ Pünktchen', 'Punkte aus einer Rang-Kachel; Dichte an Kanten, im Schatten oder gleichmäßig', () => this.a.stackAdd('dots')),
          btn('+ Papier', 'Papier- oder Gouache-Korn (Platzhalter-Kachel bis zu Florians Scans)', () => this.a.stackAdd('grain')),
          btn('+ Kantenverlauf', 'Verlauf vom Rand nach innen, mit Stufen als Ringe', () => this.a.stackAdd('edge')),
          btn('+ Funkeln', 'Glanzpunkte, die in eigener Phase aufleuchten (für Wasser, Schnee, Kristalle, Coins)', () => this.a.stackAdd('sparkle')),
        );
      if (!view.rows.some((r) => r.kind === 'crown') && view.styles) add.append(btn('+ Punktkrone', 'Echte Punkte über der ganzen Form, dicht an der Lichtkante, mit Wind (Bäume wie Bild 6)', () => this.a.stackAdd('crown')));
      if (!view.rows.some((r) => r.kind === 'wave') && view.styles) add.append(btn('+ Kantenwelle', 'Kontur der ganzen Form unregelmäßig wie gemalt (nur im Bild; Stützen stehen auf der glatten Kante)', () => this.a.stackAdd('wave')));
      const pre = el('div', 'ze-sfoot');
      pre.append(el('span', 'ze-label', 'Earle'));
      pre.append(btn('Automatisch', 'Je Fläche eine Vorgabe nach Material und Farbe (Platzhalter-Regel)', () => this.a.stackEarle('auto')));
      for (const p of EARLE_PRESETS) pre.append(btn(EARLE_WORDS[p], `Vorgabe ${EARLE_WORDS[p]} auf die Auswahl (Platzhalter)`, () => this.a.stackEarle(p)));
      pre.append(btn('Ganze Zone', 'Automatisch auf alle Flächen aller Ebenen (ein Schritt, rückgängig machbar)', () => this.a.stackEarle('zone')));
      this.el.append(add, pre);
    }
  }

  /** Werte der gewählten Schicht: Zahlen (Wort waagrecht ziehen oder Zahl eintippen) und Auswahlen (antippen) */
  private params(r: StackRow): HTMLElement {
    const wrap = el('div', 'ze-sparams');
    for (const p of r.params ?? []) {
      if (p.options) {
        const i = Math.max(0, p.options.findIndex((o) => o.value === p.value));
        const next = p.options[(i + 1) % p.options.length];
        wrap.append(btn(`${p.label} ${p.options[i]?.word ?? ''}`, p.title, () => this.a.stackParam(r.index, p.key, next.value, 'tap')));
        continue;
      }
      wrap.append(this.scrub(p, (v, phase) => this.a.stackParam(r.index, p.key, v, phase)));
    }
    if (r.ownColor) wrap.append(btn('Zonenfarbe', 'Eigene Farbe weg: wieder die Licht- bzw. Schattenfarbe der Zone', () => this.a.stackZoneColor(r.index)));
    return wrap;
  }

  /** Zahlenfeld mit ziehbarem Wort (step je Bildpunkt) */
  private scrub(p: StackParam, apply: (v: number, phase: PickPhase) => void): HTMLElement {
    const box = el('label', 'ze-num');
    box.title = p.title;
    const word = el('span', '', p.label);
    const input = el('input');
    input.inputMode = 'decimal';
    const digits = p.digits ?? 1;
    const show = (v: number) => (input.value = String(Math.round(v * 10 ** digits) / 10 ** digits).replace('.', ','));
    const clamp = (v: number) => Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, v));
    const v0 = typeof p.value === 'number' ? p.value : 0;
    show(v0);
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('change', () => {
      const v = Number(input.value.replace(',', '.').replace(/[^\d.-]/g, ''));
      if (Number.isFinite(v)) apply(clamp(v), 'tap');
    });
    word.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const x0 = e.clientX;
      let moved = false;
      word.setPointerCapture(e.pointerId);
      const at = (ev: PointerEvent) => clamp(v0 + (ev.clientX - x0) * (p.step ?? 0.01));
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - x0) < 3) return;
        if (!moved) {
          moved = true;
          this.dragging = true;
          apply(v0, 'start');
        }
        show(at(ev));
        apply(at(ev), 'move');
      };
      const up = (ev: PointerEvent) => {
        word.removeEventListener('pointermove', move);
        word.removeEventListener('pointerup', up);
        word.removeEventListener('pointercancel', up);
        if (!moved) {
          input.focus();
          input.select();
          return;
        }
        this.dragging = false;
        apply(at(ev), 'end');
        this.key = '';
      };
      word.addEventListener('pointermove', move);
      word.addEventListener('pointerup', up);
      word.addEventListener('pointercancel', up);
    });
    box.append(word, input);
    return box;
  }

  /** Licht der Zone: Richtung (Pfeil zeigt, woher es kommt; Grad ziehen oder eintippen), Licht- und Schattenfarbe */
  private lightRow(l: StackLight): HTMLElement {
    const wrap = el('div', 'ze-sair');
    const chip = (color: string, title: string, onTap: () => void) => {
      const c = el('span', 'ze-sprev');
      c.style.background = color;
      c.style.cursor = 'pointer';
      c.title = title;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        onTap();
      });
      return c;
    };
    const sun = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sun.setAttribute('viewBox', '-10 -10 20 20');
    sun.classList.add('ze-sun');
    const draw = (deg: number) => {
      const b = (deg * Math.PI) / 180;
      sun.innerHTML = `<circle class="ring" cx="0" cy="0" r="9"/><line x1="0" y1="0" x2="${(Math.cos(b) * 7).toFixed(2)}" y2="${(-Math.sin(b) * 7).toFixed(2)}"/><circle class="knob" cx="${(Math.cos(b) * 7).toFixed(2)}" cy="${(-Math.sin(b) * 7).toFixed(2)}" r="2.6"/>`;
    };
    draw(l.angle);
    // Griff: die Sonne um ihre Mitte ziehen dreht das Licht (Richtung, aus der es kommt)
    sun.style.cursor = 'grab';
    sun.style.touchAction = 'none';
    (sun as unknown as HTMLElement).title = 'Sonne ziehen: Licht drehen';
    sun.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const box = sun.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const at = (ev: PointerEvent) => ((Math.round((Math.atan2(-(ev.clientY - cy), ev.clientX - cx) * 180) / Math.PI) % 360) + 360) % 360;
      sun.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.a.stackLight({ angle: at(e) }, 'start');
      draw(at(e));
      const move = (ev: PointerEvent) => {
        draw(at(ev));
        this.a.stackLight({ angle: at(ev) }, 'move');
      };
      const up = (ev: PointerEvent) => {
        sun.removeEventListener('pointermove', move);
        sun.removeEventListener('pointerup', up);
        sun.removeEventListener('pointercancel', up);
        this.dragging = false;
        this.a.stackLight({ angle: at(ev) }, 'end');
        this.key = '';
      };
      sun.addEventListener('pointermove', move);
      sun.addEventListener('pointerup', up);
      sun.addEventListener('pointercancel', up);
    });
    wrap.append(
      chip(l.color, 'Lichtfarbe der Zone: antippen, dann im Farbmenü wählen', () => this.a.stackLight({ color: true }, 'tap')),
      chip(l.shade, 'Schattenfarbe der Zone: antippen, dann im Farbmenü wählen', () => this.a.stackLight({ shade: true }, 'tap')),
      el('span', '', 'Licht'),
      sun,
      this.scrub({ key: 'angle', label: 'aus', title: 'Richtung, aus der das Licht kommt (Grad: 0 von rechts, 90 von oben)', value: l.angle, step: 1, digits: 0 }, (v, phase) => this.a.stackLight({ angle: ((v % 360) + 360) % 360 }, phase)),
    );
    return wrap;
  }

  private row(r: StackRow, on: boolean, all: readonly StackRow[]): HTMLElement {
    const row = el('div', `ze-srow${on ? ' on' : ''}${r.hidden ? ' dim' : ''}`);
    if (r.kind !== 'base') row.append(btn(r.hidden ? EYE_OFF : EYE, r.hidden ? 'Einblenden' : 'Ausblenden', () => this.a.stackHide(r.index)));
    else {
      const gap = el('span');
      gap.style.width = '28px';
      gap.style.flex = 'none';
      row.append(gap);
    }
    const prev = el('span', 'ze-sprev');
    prev.style.background = r.preview;
    const op = el('span', 'ze-sop', r.kind === 'crown' || r.kind === 'wave' ? '' : pct(r.opacity));
    op.title = r.kind === 'base' ? 'Deckkraft der Fläche: waagrecht über die Zeile ziehen' : 'Deckkraft: waagrecht über die Zeile ziehen';
    row.append(prev, el('span', 'ze-sname', r.name ?? KIND_WORDS[r.kind]));
    if (r.blend) {
      row.append(
        btn(BLEND_WORDS[r.blend].letter, `Mischmodus: ${BLEND_WORDS[r.blend].name}`, () => {
          this.blendOpen = this.blendOpen === r.index ? null : r.index;
          this.key = '';
          this.a.stackSelect(r.index);
        }),
      );
    }
    row.append(op);
    if (on && r.kind !== 'base') {
      const i = all.findIndex((x) => x.index === r.index);
      if (i > 0) row.append(btn('↑', 'Eine Füllung höher', () => this.a.stackMove(r.index, 1)));
      if (i < all.length - 1 && all[i + 1].kind !== 'base') row.append(btn('↓', 'Eine Füllung tiefer', () => this.a.stackMove(r.index, -1)));
      if (r.kind === 'gradient' || r.kind === 'fade') row.append(btn('Regler', 'Verlauf am Objekt bearbeiten (Werkzeug G)', () => this.a.stackGradient(r.index)));
      if (r.kind === 'crown' || r.kind === 'wave') {
        // Punktkrone und Kantenwelle sind Merkmale der Form, keine Füllungen: kein Verschieben
        for (const b of [...row.querySelectorAll('button')].filter((x) => x.textContent === '↑' || x.textContent === '↓')) b.remove();
      }
      row.append(btn('×', 'Füllung entfernen', () => this.a.stackRemove(r.index)));
    }
    // tippen wählt, waagrecht ziehen ändert die Deckkraft (200 Bildpunkte = 100 %)
    row.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('button')) return;
      if (r.kind === 'crown' || r.kind === 'wave') {
        this.a.stackSelect(r.index);
        return;
      }
      const x0 = e.clientX;
      const v0 = r.opacity;
      let moved = false;
      row.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - x0) < 5) return;
        if (!moved) {
          moved = true;
          this.dragging = true;
          this.a.stackOpacity(r.index, v0, 'start');
        }
        const v = Math.max(0, Math.min(1, v0 + (ev.clientX - x0) / 200));
        op.textContent = pct(v);
        this.a.stackOpacity(r.index, v, 'move');
      };
      const up = (ev: PointerEvent) => {
        row.removeEventListener('pointermove', move);
        row.removeEventListener('pointerup', up);
        row.removeEventListener('pointercancel', up);
        if (moved) {
          this.dragging = false;
          this.a.stackOpacity(r.index, Math.max(0, Math.min(1, v0 + (ev.clientX - x0) / 200)), 'end');
          this.key = '';
        } else this.a.stackSelect(r.index);
      };
      row.addEventListener('pointermove', move);
      row.addEventListener('pointerup', up);
      row.addEventListener('pointercancel', up);
    });
    return row;
  }

  /** Luftperspektive: Farbe (antippen: Farbmenü färbt die Luft), Stärke, ab, voll bei, Anteil dieser Ebene */
  private airRow(air: NonNullable<StackView['air']>): HTMLElement {
    const wrap = el('div', 'ze-sair');
    const chip = el('span', 'ze-sprev');
    chip.style.background = air.color;
    chip.style.cursor = 'pointer';
    chip.title = 'Luftfarbe: antippen, dann im Farbmenü wählen';
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.a.stackAir({ color: true }, 'tap');
    });
    const field = (label: string, title: string, value: number, apply: (v: number) => void) => {
      const box = el('label', 'ze-num');
      box.title = title;
      const input = el('input');
      input.inputMode = 'decimal';
      input.value = String(Math.round(value * 10) / 10).replace('.', ',');
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') input.blur();
      });
      input.addEventListener('change', () => {
        const v = Number(input.value.replace(',', '.').replace(/[^\d.-]/g, ''));
        if (Number.isFinite(v)) apply(v);
      });
      box.append(el('span', '', label), input);
      return box;
    };
    wrap.append(
      chip,
      el('span', '', 'Luft'),
      field('%', 'Stärke der Luftperspektive (Zone)', air.amount * 100, (v) => this.a.stackAir({ amount: Math.max(0, Math.min(100, v)) / 100 }, 'tap')),
      field('ab', 'ab dieser Tiefe (Meter, Zone)', air.near, (v) => this.a.stackAir({ near: v }, 'tap')),
      field('bis', 'voll bei dieser Tiefe (Meter, Zone)', air.far, (v) => this.a.stackAir({ far: v }, 'tap')),
      field('Ebene %', 'Anteil dieser Ebene', air.plane * 100, (v) => this.a.stackAir({ plane: Math.max(0, Math.min(100, v)) / 100 }, 'tap')),
    );
    return wrap;
  }
}
