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
import type { PickPhase } from './colorMenu';

export interface StackRow {
  /** Index im Füllstapel; -1 ist die Grundfarbe (Deckkraft = Deckkraft der Fläche) */
  index: number;
  kind: 'base' | 'color' | 'gradient' | 'fade';
  /** CSS-Hintergrund der Vorschau */
  preview: string;
  blend: BlendMode | null;
  opacity: number;
  hidden: boolean;
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
}

export interface StackActions {
  stackSelect(index: number): void;
  stackOpacity(index: number, v: number, phase: PickPhase): void;
  stackBlend(index: number, mode: BlendMode): void;
  stackHide(index: number): void;
  stackRemove(index: number): void;
  stackMove(index: number, dir: 1 | -1): void;
  stackAdd(kind: 'color' | 'gradient' | 'fade'): void;
  stackGradient(index: number): void;
  /** Luftperspektive: Stärke, ab, voll bei (Zone), Anteil der Ebene; Farbe: die Luft wird Ziel des Farbmenüs */
  stackAir(patch: { amount?: number; near?: number; far?: number; plane?: number; color?: true }, phase: PickPhase): void;
  stackClose(): void;
}

const KIND_WORDS: Record<StackRow['kind'], string> = { base: 'Grundfarbe', color: 'Farbe', gradient: 'Verlauf', fade: 'Deckkraftverlauf' };

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

  constructor(private readonly a: StackActions) {
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(view: StackView | null): void {
    if (this.dragging) return;
    const key = view ? JSON.stringify([view, this.blendOpen]) : '';
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
    }
    if (view.air) this.el.append(this.airRow(view.air));
    const foot = el('div', 'ze-sfoot');
    if (!view.full)
      foot.append(
        btn('+ Farbe', 'Farbe über den Stapel (aktuelle Farbe; Mischmodus und Deckkraft in der Zeile)', () => this.a.stackAdd('color')),
        btn('+ Verlauf', 'Verlauf über den Stapel, danach mit dem Regler (G) einstellen', () => this.a.stackAdd('gradient')),
        btn('+ Deckkraftverlauf', 'Alles darunter läuft durchsichtig aus', () => this.a.stackAdd('fade')),
      );
    else foot.append(el('span', 'ze-label', 'Der Stapel ist voll'));
    this.el.append(foot);
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
    const op = el('span', 'ze-sop', pct(r.opacity));
    op.title = r.kind === 'base' ? 'Deckkraft der Fläche: waagrecht über die Zeile ziehen' : 'Deckkraft: waagrecht über die Zeile ziehen';
    row.append(prev, el('span', 'ze-sname', KIND_WORDS[r.kind]));
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
      row.append(btn('×', 'Füllung entfernen', () => this.a.stackRemove(r.index)));
    }
    // tippen wählt, waagrecht ziehen ändert die Deckkraft (200 Bildpunkte = 100 %)
    row.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('button')) return;
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
