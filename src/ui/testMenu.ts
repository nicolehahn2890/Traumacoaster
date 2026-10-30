/**
 * Testmenü im Zonen-Editor (Florian, 30.10.2026): ein kleines, verstecktes Menü mit allen Strichen und Lesarten, die es
 * heute gibt, in jeder Kombination, damit er sie vor dem neuen Anlauf auf den Strich ausgiebig vergleichen kann. Es
 * bündelt die Schalter der Pinsel-Studie (bisher nur per Adresse), die vier Tiefen-Lesarten des alten Kameramenüs, die
 * alten Lesarten und die Zeichengrößen. Nach der Entscheidung über den Strich kommt es wieder heraus.
 * Platzhalter: Aussehen, Ort und Wortlaut des Menüs.
 *
 * Die Strich-Schalter liest das Level beim Laden aus der Adresse, genau so, wie die Studie sie gemessen hat; das Menü
 * schreibt sie in die Adresse und lädt neu. Die Tiefen-Lesart gilt sofort ab dem nächsten Strich.
 */
import { RIDE_TUNING } from '@/physics/trainSim';
import { FIT_TUNING, FIX_BEHIND, FREEZE, LOOK_TUNING, LOOP_TUNING } from '@/track/strich2';
import { BRUSH_MODES, BRUSH_NAMES, brushModeNow, setBrushMode, type BrushMode } from './cameraTiltPanel';
import { openMap } from './editorLink';
import { FONT_TEXT, INK, PAPER, PINK } from './widgets';

interface Choice {
  label: string;
  /** Wert in der Adresse; null: Schalter fehlt (Vorgabe) */
  value: string | null;
  /** weitere Adresswerte, die dasselbe bedeuten */
  same?: string[];
}

interface ChipSwitch {
  key: string;
  label: string;
  /** die erste Wahl ist die Vorgabe */
  choices: Choice[];
}

interface NumSwitch {
  key: string;
  label: string;
  def: number;
}

/** die alten Lesarten stehen als Schalter ohne Wert in der Adresse (?stage, ?single, ?lanes; ?brush ist die Vorgabe) */
const LESART = 'lesart';
const LESART_FLAGS = ['stage', 'single', 'lanes', 'brush'];

// Vorgaben der Studien-Werte, bevor das Level sie beim Laden aus der Adresse überschreibt (dieses Modul wird als Import
// des Levels vor dessen Rumpf ausgewertet)
const FIT0 = { ...FIT_TUNING };
const LOOK0 = { ...LOOK_TUNING };
const LOOP0 = { ...LOOP_TUNING };
const RIDE0 = { ...RIDE_TUNING };

const STRICH: ChipSwitch = { key: 'strich', label: 'Strich', choices: [{ label: 'Strich 2', value: null, same: ['0', '2'] }, { label: 'Strich 1 (heutiger Pinsel)', value: '1' }] };

const SECTIONS: Array<{ title: string; chips: ChipSwitch[]; nums?: NumSwitch[] }> = [
  {
    title: 'Strich 2 (Pinsel-Studie)',
    chips: [
      { key: 'vorlauf', label: 'Vorlauf', choices: [{ label: 'als Tinte', value: null, same: ['1'] }, { label: 'als Schienen', value: '2' }] },
      { key: 'schleifen', label: 'Schleifen', choices: [{ label: 'lesen', value: null, same: ['1'] }, { label: 'nicht lesen', value: '0' }] },
      { key: 'even', label: 'Knoten', choices: [{ label: 'gleich verteilt', value: null, same: ['1'] }, { label: 'ohne Gleichverteilung', value: '0' }] },
    ],
    nums: [
      { key: 'vorlaufm', label: 'Vorlauf, bis die Tiefe fest ist (m)', def: FREEZE },
      { key: 'fest', label: 'fest hinter dem Ende (m)', def: FIX_BEHIND },
      { key: 'freezemax', label: 'steiles offenes Stück bleibt Höhe ab (m)', def: LOOK0.freezeMax },
      { key: 'lookstart', label: 'Vorschau ab (m)', def: LOOK0.lookStart },
      { key: 'tol', label: 'Fit-Toleranz (Faktor)', def: FIT0.tolScale },
      { key: 'span', label: 'Gleichverteilung: Spanne (m)', def: FIT0.evenSpan },
      { key: 'turn', label: 'Gleichverteilung: Winkel (°)', def: FIT0.evenTurn },
      { key: 'loopaspect', label: 'Looping ab Höhe/Breite', def: LOOP0.aspect },
      { key: 'loopr', label: 'Looping-Mindestradius (m)', def: LOOP0.minR },
    ],
  },
  {
    title: 'Schienen und Fahrt',
    chips: [
      { key: 'rahmen', label: 'Schienen', choices: [{ label: 'aufrecht (Studie 17)', value: null, same: ['2'] }, { label: 'bisheriger Oben-Vektor', value: '1' }] },
      { key: 'fahrt', label: 'Fahrt', choices: [{ label: 'Antrieb und Stützräder', value: null, same: ['2'] }, { label: 'streng', value: '1' }] },
    ],
    nums: [{ key: 'antrieb', label: 'Antrieb: Mindesttempo (m/s)', def: RIDE0.driveSpeed }],
  },
  {
    title: 'Alte Lesarten',
    chips: [
      { key: LESART, label: 'Lesart', choices: [{ label: 'Pinsel', value: null }, { label: 'Bühne', value: 'stage' }, { label: 'Ein Strich', value: 'single' }, { label: 'Spuren', value: 'lanes' }] },
      { key: 'fit', label: 'Fit', choices: [{ label: 'Scheitel', value: null, same: ['apex'] }, { label: 'alter Fit', value: 'legacy' }] },
    ],
  },
  {
    title: 'Zeichnen',
    chips: [],
    // Vorgaben wie in src/app/scenes/level.ts
    nums: [
      { key: 'tip', label: 'Tropfen unter dem Finger (px)', def: 17 },
      { key: 'tipr', label: 'Strichspitze alte Lesarten (px)', def: 13 },
      { key: 'line', label: 'gemalte Linie (px)', def: 9 },
      { key: 'band', label: 'Gummiband (px)', def: 22 },
      { key: 'dzoom', label: 'Zeichen-Zoom am Handy (px/m)', def: 7 },
    ],
  },
];

const ALL_CHIPS = [STRICH, ...SECTIONS.flatMap((s) => s.chips)];
const ALL_NUMS = SECTIONS.flatMap((s) => s.nums ?? []);

function getVal(q: URLSearchParams, key: string): string | null {
  if (key === LESART) return LESART_FLAGS.find((f) => f !== 'brush' && q.has(f)) ?? null;
  return q.get(key);
}

function setVal(q: URLSearchParams, key: string, v: string | null): void {
  if (key === LESART) {
    for (const f of LESART_FLAGS) q.delete(f);
    if (v) q.set(v, '');
  } else if (v === null) q.delete(key);
  else q.set(key, v);
}

/** gewählte Wahl eines Schalters (Index), -1 bei einem Wert, den das Menü nicht kennt */
function chosen(s: ChipSwitch, q: URLSearchParams): number {
  const raw = getVal(q, s.key);
  return s.choices.findIndex((c) => c.value === raw || (raw !== null && !!c.same?.includes(raw)));
}

/** nur die Strich-Schalter einer Adresse (für den Weg zurück in den Editor, src/ui/editorLink.ts) */
export function switchQuery(q: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const s of ALL_CHIPS) setVal(out, s.key, getVal(q, s.key));
  for (const n of ALL_NUMS) if (q.has(n.key)) out.set(n.key, q.get(n.key)!);
  return out.toString();
}

const fmt = (v: number): string => String(Math.round(v * 1000) / 1000).replace('.', ',');

export class TestMenu {
  private readonly root = document.createElement('div');
  private readonly pill = document.createElement('button');
  private readonly body = document.createElement('div');
  private readonly now = document.createElement('div');
  private readonly applyBtn = document.createElement('button');
  /** Knöpfe mit Auswahlzustand: leuchtet, wenn on() stimmt */
  private readonly chips: Array<{ el: HTMLButtonElement; on: () => boolean }> = [];
  private readonly inputs: Array<{ el: HTMLInputElement; key: string }> = [];
  /** Adresse, wie sie nach „Anwenden“ aussähe */
  private pending = new URLSearchParams(location.search);
  private open = false;

  /** beforeLeave: vor dem Neuladen (der Editor schreibt seine Sicherungskopie) */
  constructor(private readonly beforeLeave: () => void) {
    const r = this.root;
    // Vorgabewerte in den Zahlenfeldern blass, damit sie nicht wie gesetzte Werte aussehen
    const style = document.createElement('style');
    style.textContent = '.tc-testmenu input::placeholder { color: rgba(42, 31, 61, 0.35); }';
    r.className = 'tc-testmenu';
    r.append(style);
    r.style.cssText =`position:fixed;z-index:40;top:calc(env(safe-area-inset-top, 0px) + 12px);left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font:700 12px ${FONT_TEXT};color:${INK};touch-action:none;user-select:none;-webkit-user-select:none;`;
    // weder der Editor noch das Spiel sollen Tipps und Tasten im Menü sehen (Leertaste startete sonst die Fahrt)
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('keydown', (e) => e.stopPropagation());
    r.addEventListener('keyup', (e) => e.stopPropagation());
    this.pill.style.cssText = `font:800 12px ${FONT_TEXT};color:${INK};background:${PAPER};border:2px solid ${INK};border-radius:14px;padding:3px 10px;cursor:pointer;opacity:.75;`;
    this.pill.addEventListener('click', () => this.toggle());
    this.body.style.cssText = `display:none;margin-top:5px;width:min(440px, calc(100vw - 32px));max-height:calc(100vh - 140px);overflow-y:auto;background:rgba(255,248,236,.96);border:3px solid ${INK};border-radius:14px;padding:6px 10px 9px;box-sizing:border-box;touch-action:pan-y;`;
    this.now.style.cssText = 'font-weight:800;line-height:1.35;margin:2px 0 4px;';
    const note = document.createElement('div');
    note.textContent = 'Strich-Schalter gelten nach „Anwenden“ (lädt neu, ungesicherte Änderungen bietet der Editor danach an). Tiefe und Höhe gilt sofort.';
    note.style.cssText = 'font-weight:600;font-size:11px;line-height:1.3;opacity:.8;margin-bottom:4px;';

    const depth = this.section('Tiefe und Höhe (sofort)');
    depth.append(this.chipRow('Lesung', BRUSH_MODES.map((m) => this.chip(BRUSH_NAMES[m], () => this.pickBrush(m), () => brushModeNow() === m))));
    const strich = this.section('Strich');
    strich.append(this.switchRow(STRICH));
    const parts = [this.now, note, strich, depth];
    for (const s of SECTIONS) {
      const sec = this.section(s.title);
      for (const c of s.chips) sec.append(this.switchRow(c));
      for (const n of s.nums ?? []) sec.append(this.numRow(n));
      parts.push(sec);
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
    this.applyBtn.textContent = 'Anwenden (lädt neu)';
    this.applyBtn.addEventListener('click', () => this.apply());
    actions.append(
      this.applyBtn,
      this.button('Alles auf Vorgabe', () => this.reset()),
      this.button('Zur Karte', () => {
        this.beforeLeave();
        openMap();
      }),
    );
    parts.push(actions);
    this.body.append(...parts);
    r.append(this.pill, this.body);
    document.body.append(r);
    this.refresh();
  }

  private section(title: string): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = `border-top:2px solid rgba(42,31,61,.15);margin-top:5px;padding-top:4px;`;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:800;font-size:12px;margin-bottom:2px;';
    d.append(h);
    return d;
  }

  private chipRow(label: string, chips: HTMLButtonElement[]): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:2px 0;';
    const n = document.createElement('span');
    n.textContent = label;
    n.style.cssText = 'width:70px;font-weight:600;';
    d.append(n, ...chips);
    return d;
  }

  private chip(text: string, pick: () => void, on: () => boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `font:800 11px ${FONT_TEXT};border:2px solid ${INK};border-radius:11px;padding:2px 7px;cursor:pointer;`;
    b.addEventListener('click', pick);
    this.chips.push({ el: b, on });
    return b;
  }

  private button(text: string, click: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `font:800 12px ${FONT_TEXT};color:${INK};background:#fff;border:2px solid ${INK};border-radius:12px;padding:4px 10px;cursor:pointer;`;
    b.addEventListener('click', click);
    return b;
  }

  private switchRow(s: ChipSwitch): HTMLDivElement {
    return this.chipRow(
      s.label,
      s.choices.map((c, i) =>
        this.chip(
          c.label,
          () => {
            setVal(this.pending, s.key, c.value);
            this.refresh();
          },
          () => chosen(s, this.pending) === i,
        ),
      ),
    );
  }

  private numRow(n: NumSwitch): HTMLLabelElement {
    const d = document.createElement('label');
    d.style.cssText = 'display:grid;grid-template-columns:1fr 74px;align-items:center;gap:6px;margin:2px 0;font-weight:600;';
    const t = document.createElement('span');
    t.textContent = n.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.placeholder = fmt(n.def);
    input.style.cssText = `font:700 12px ${FONT_TEXT};color:${INK};border:2px solid ${INK};border-radius:8px;padding:2px 5px;width:100%;box-sizing:border-box;user-select:text;-webkit-user-select:text;`;
    input.addEventListener('input', () => {
      const v = Number(input.value);
      // das Level nimmt nur Werte über 0 an (sonst gilt die Vorgabe)
      setVal(this.pending, n.key, input.value !== '' && Number.isFinite(v) && v > 0 ? String(v) : null);
      this.refresh(false);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.apply();
    });
    this.inputs.push({ el: input, key: n.key });
    d.append(t, input);
    return d;
  }

  private toggle(): void {
    this.open = !this.open;
    this.body.style.display = this.open ? 'block' : 'none';
    this.refresh();
  }

  private pickBrush(m: BrushMode): void {
    setBrushMode(m);
    this.refresh();
  }

  /** Vorgabe für alle Strich-Schalter; Tiefe und Höhe wie in Ebenen-Zonen vorgegeben („Ebenen: Bodenhöhe“) */
  private reset(): void {
    for (const s of ALL_CHIPS) setVal(this.pending, s.key, null);
    for (const n of ALL_NUMS) this.pending.delete(n.key);
    setBrushMode('boden');
    this.refresh();
  }

  private changed(): boolean {
    return switchQuery(this.pending) !== switchQuery(new URLSearchParams(location.search));
  }

  private apply(): void {
    if (!this.changed()) return;
    this.beforeLeave();
    location.replace(`${location.pathname}?${this.pending.toString()}`);
  }

  /** Zusammenfassung der geltenden Wahl (aus der Adresse, nicht der noch nicht angewendeten) */
  private summary(): { text: string; plain: boolean } {
    const q = new URLSearchParams(location.search);
    const parts = [STRICH.choices[Math.max(0, chosen(STRICH, q))].label.replace(/ \(.*\)$/, ''), BRUSH_NAMES[brushModeNow()]];
    let plain = brushModeNow() === 'boden' && chosen(STRICH, q) === 0;
    for (const s of SECTIONS.flatMap((x) => x.chips)) {
      const i = chosen(s, q);
      if (i === 0) continue;
      plain = false;
      parts.push(i > 0 ? `${s.label}: ${s.choices[i].label}` : `${s.key}=${getVal(q, s.key)}`);
    }
    for (const n of ALL_NUMS) {
      if (!q.has(n.key)) continue;
      plain = false;
      parts.push(`${n.key}=${q.get(n.key)}`);
    }
    return { text: parts.join(' · '), plain };
  }

  /** syncInputs: Zahlenfelder aus der Wahl nachführen (nicht, während eins davon getippt wird) */
  private refresh(syncInputs = true): void {
    const s = this.summary();
    this.pill.textContent = `Test${s.plain ? '' : ' •'} ${this.open ? '▴' : '▾'}`;
    this.now.textContent = `Jetzt: ${s.text}`;
    for (const c of this.chips) {
      const on = c.on();
      c.el.style.background = on ? PINK : '#fff';
      c.el.style.color = on ? '#fff' : INK;
    }
    if (syncInputs) for (const i of this.inputs) i.el.value = this.pending.get(i.key) ?? '';
    const dirty = this.changed();
    this.applyBtn.disabled = !dirty;
    this.applyBtn.style.cssText = `font:800 12px ${FONT_TEXT};color:${dirty ? '#fff' : INK};background:${dirty ? PINK : '#fff'};border:2px solid ${INK};border-radius:12px;padding:4px 10px;cursor:${dirty ? 'pointer' : 'default'};opacity:${dirty ? 1 : 0.5};`;
  }

  destroy(): void {
    this.root.remove();
  }
}
