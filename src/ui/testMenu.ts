/**
 * Testmenü im Zonen-Editor (Florian, 30.10.2026): ein kleines, verstecktes Menü mit allen Strichen und Lesarten, die es
 * heute gibt, in jeder Kombination, damit er sie vor dem neuen Anlauf auf den Strich ausgiebig vergleichen kann. Es
 * bündelt die Schalter der Pinsel-Studie (bisher nur per Adresse), die vier Tiefen-Lesarten des alten Kameramenüs, die
 * alten Lesarten und die Zeichengrößen, geordnet danach, für welchen Strich sie gelten. Nach der Entscheidung über den
 * Strich kommt es wieder heraus. Platzhalter: Aussehen, Ort und Wortlaut des Menüs.
 *
 * Die Strich-Schalter liest das Level beim Laden aus der Adresse, genau so, wie die Studie sie gemessen hat; das Menü
 * schreibt sie in die Adresse und lädt neu. Die Tiefen-Lesart gilt sofort ab dem nächsten Strich.
 */
import { RIDE_TUNING } from '@/physics/trainSim';
import { FIT_TUNING, FIX_BEHIND, FREEZE, LOOK_TUNING, LOOP_TUNING } from '@/track/strich2';
import { BRUSH_MODES, BRUSH_NAMES, brushModeNow, setBrushMode, type BrushMode } from './cameraTiltPanel';
import { openMap } from './editorLink';
import { FONT_TEXT, INK, PAPER, PINK } from './widgets';

/** die Striche: der Pinsel als Strich 2 (Vorgabe in Ebenen-Zonen) oder Strich 1, oder eine der alten Lesarten */
type StrokeId = 's2' | 's1' | 'stage' | 'single' | 'lanes';
const STROKES: Array<{ id: StrokeId; label: string }> = [
  { id: 's2', label: 'Strich 2' },
  { id: 's1', label: 'Strich 1 (heutiger Pinsel)' },
  { id: 'stage', label: 'Bühne (alt)' },
  { id: 'single', label: 'Ein Strich (alt)' },
  { id: 'lanes', label: 'Spuren (alt)' },
];
/** die alten Lesarten stehen als Schalter ohne Wert in der Adresse (?stage, ?single, ?lanes; ?brush ist der Pinsel) */
const LESART_FLAGS = ['stage', 'single', 'lanes', 'brush'];
const isBrush = (s: StrokeId): boolean => s === 's1' || s === 's2';

/** welcher Strich gilt: eine alte Lesart geht vor (wie im Level), sonst &strich=1 Strich 1, sonst Strich 2 */
function strokeOf(q: URLSearchParams): StrokeId {
  const old = (['stage', 'single', 'lanes'] as const).find((f) => q.has(f));
  return old ?? (q.get('strich') === '1' ? 's1' : 's2');
}

function setStroke(q: URLSearchParams, s: StrokeId): void {
  for (const f of LESART_FLAGS) q.delete(f);
  q.delete('strich');
  if (s === 's1') q.set('strich', '1');
  else if (!isBrush(s)) q.set(s, '');
}

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

interface Section {
  title: string;
  /** für welchen Strich der Abschnitt gilt (sonst blass) */
  applies: (s: StrokeId) => boolean;
  chips: ChipSwitch[];
  nums?: NumSwitch[];
}

// Vorgaben der Studien-Werte, bevor das Level sie beim Laden aus der Adresse überschreibt (dieses Modul wird als Import
// des Levels vor dessen Rumpf ausgewertet)
const FIT0 = { ...FIT_TUNING };
const LOOK0 = { ...LOOK_TUNING };
const LOOP0 = { ...LOOP_TUNING };
const RIDE0 = { ...RIDE_TUNING };

const SECTIONS: Section[] = [
  {
    title: 'Für alle Striche',
    applies: () => true,
    chips: [
      { key: 'rahmen', label: 'Schienen', choices: [{ label: 'aufrecht (Studie 17)', value: null, same: ['2'] }, { label: 'bisheriger Oben-Vektor', value: '1' }] },
      { key: 'fahrt', label: 'Fahrt', choices: [{ label: 'Antrieb und Stützräder', value: null, same: ['2'] }, { label: 'streng', value: '1' }] },
    ],
    nums: [
      { key: 'antrieb', label: 'Antrieb: Mindesttempo (m/s)', def: RIDE0.driveSpeed },
      // Vorgabe wie in src/app/scenes/level.ts
      { key: 'dzoom', label: 'Zeichen-Zoom am Handy (px/m)', def: 7 },
    ],
  },
  {
    title: 'Nur Strich 2 (Pinsel-Studie)',
    applies: (s) => s === 's2',
    chips: [
      { key: 'vorlauf', label: 'Vorlauf', choices: [{ label: 'als Tinte', value: null, same: ['1'] }, { label: 'als Schienen', value: '2' }] },
      { key: 'schleifen', label: 'Schleifen', choices: [{ label: 'lesen', value: null, same: ['1'] }, { label: 'nicht lesen', value: '0' }] },
      { key: 'even', label: 'Knoten', choices: [{ label: 'gleich verteilt', value: null, same: ['1'] }, { label: 'ohne Gleichverteilung', value: '0' }] },
    ],
    nums: [
      { key: 'vorlaufm', label: 'Vorlauf, bis die Tiefe fest ist (m)', def: FREEZE },
      { key: 'fest', label: 'fest hinter dem Ende (m)', def: FIX_BEHIND },
      { key: 'freezemax', label: 'steiles offenes Stück bleibt Höhe ab (m)', def: LOOK0.freezeMax },
      { key: 'lookstart', label: 'nach dem Anschluss gleich fest (m)', def: LOOK0.lookStart },
      { key: 'tol', label: 'Fit-Toleranz (Faktor)', def: FIT0.tolScale },
      { key: 'span', label: 'Gleichverteilung: Spanne (m)', def: FIT0.evenSpan },
      { key: 'turn', label: 'Gleichverteilung: Winkel (°)', def: FIT0.evenTurn },
      { key: 'loopaspect', label: 'Looping ab Höhe/Breite', def: LOOP0.aspect },
      { key: 'loopr', label: 'Looping-Mindestradius (m)', def: LOOP0.minR },
    ],
  },
  {
    title: 'Nur Pinsel (Strich 1 und 2): Zeichnen',
    applies: isBrush,
    chips: [],
    // Vorgaben wie in src/app/scenes/level.ts
    nums: [
      { key: 'tip', label: 'Tropfen unter dem Finger (px)', def: 17 },
      { key: 'line', label: 'gemalte Linie (px)', def: 9 },
      { key: 'band', label: 'Gummiband (px)', def: 22 },
    ],
  },
  {
    title: 'Nur alte Lesarten (Bühne, Ein Strich, Spuren)',
    applies: (s) => !isBrush(s),
    chips: [{ key: 'fit', label: 'Fit', choices: [{ label: 'Scheitel', value: null, same: ['apex'] }, { label: 'alter Fit', value: 'legacy' }] }],
    nums: [{ key: 'tipr', label: 'Strichspitze (px)', def: 13 }],
  },
];

const ALL_CHIPS = SECTIONS.flatMap((s) => s.chips);
const ALL_NUMS = SECTIONS.flatMap((s) => s.nums ?? []);

function setVal(q: URLSearchParams, key: string, v: string | null): void {
  if (v === null) q.delete(key);
  else q.set(key, v);
}

/** gewählte Wahl eines Schalters (Index), -1 bei einem Wert, den das Menü nicht kennt */
function chosen(s: ChipSwitch, q: URLSearchParams): number {
  const raw = q.get(s.key);
  return s.choices.findIndex((c) => c.value === raw || (raw !== null && !!c.same?.includes(raw)));
}

/** nur die Strich-Schalter einer Adresse (für den Weg zurück in den Editor, src/ui/editorLink.ts) */
export function switchQuery(q: URLSearchParams): string {
  const out = new URLSearchParams();
  setStroke(out, strokeOf(q));
  for (const s of ALL_CHIPS) setVal(out, s.key, q.get(s.key));
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
  /** Abschnitte, die für den gewählten Strich nicht gelten, werden blass */
  private readonly sections: Array<{ el: HTMLDivElement; applies: (s: StrokeId) => boolean }> = [];
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
    r.style.cssText = `position:fixed;z-index:40;top:calc(env(safe-area-inset-top, 0px) + 12px);left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font:700 12px ${FONT_TEXT};color:${INK};touch-action:none;user-select:none;-webkit-user-select:none;`;
    // weder der Editor noch das Spiel sollen Tipps und Tasten im Menü sehen (Leertaste startete sonst die Fahrt)
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('keydown', (e) => e.stopPropagation());
    r.addEventListener('keyup', (e) => e.stopPropagation());
    this.pill.style.cssText = `font:800 12px ${FONT_TEXT};color:${INK};background:${PAPER};border:2px solid ${INK};border-radius:14px;padding:3px 10px;cursor:pointer;opacity:.75;`;
    this.pill.addEventListener('click', () => this.toggle());
    this.body.style.cssText = `display:none;margin-top:5px;width:min(440px, calc(100vw - 32px));max-height:calc(100vh - 140px);overflow-y:auto;background:rgba(255,248,236,.96);border:3px solid ${INK};border-radius:14px;padding:6px 10px 9px;box-sizing:border-box;touch-action:pan-y;`;
    this.now.style.cssText = 'font-weight:800;line-height:1.35;margin:2px 0 4px;';
    const note = this.note('Strich-Schalter gelten nach „Anwenden“ (lädt neu, ungesicherte Änderungen bietet der Editor danach an). Tiefe und Höhe gilt sofort. Blasse Abschnitte wirken beim gewählten Strich nicht.');

    const stroke = this.section('Strich', () => true);
    stroke.append(
      this.chipRow(
        'Strich',
        STROKES.map((s) =>
          this.chip(
            s.label,
            () => {
              setStroke(this.pending, s.id);
              this.refresh();
            },
            () => strokeOf(this.pending) === s.id,
          ),
        ),
      ),
    );
    const depth = this.section('Tiefe und Höhe (sofort)', () => true);
    depth.append(
      this.chipRow('Lesung', BRUSH_MODES.map((m) => this.chip(BRUSH_NAMES[m], () => this.pickBrush(m), () => brushModeNow() === m))),
      this.note('Strich 1: alle vier verschieden. Strich 2 liest die Ebenen nur mit „Ebenen: landen“ und „Ebenen: Bodenhöhe“; „Tiefe aus Bildhöhe“ und „Spur halten“ sind bei ihm gleich. Alte Lesarten: nur, ob es in Ebenen-Zonen einen Boden gibt.'),
    );
    const parts: HTMLElement[] = [this.now, note, stroke, depth];
    for (const s of SECTIONS) {
      const sec = this.section(s.title, s.applies);
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

  private note(text: string): HTMLDivElement {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'font-weight:600;font-size:11px;line-height:1.3;opacity:.8;margin:2px 0 4px;';
    return d;
  }

  private section(title: string, applies: (s: StrokeId) => boolean): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = `border-top:2px solid rgba(42,31,61,.15);margin-top:5px;padding-top:4px;`;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:800;font-size:12px;margin-bottom:2px;';
    d.append(h);
    this.sections.push({ el: d, applies });
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
    setStroke(this.pending, 's2');
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
    const stroke = strokeOf(q);
    const parts = [STROKES.find((s) => s.id === stroke)!.label.replace(/ \(.*\)$/, ''), BRUSH_NAMES[brushModeNow()]];
    let plain = stroke === 's2' && brushModeNow() === 'boden';
    for (const s of ALL_CHIPS) {
      const i = chosen(s, q);
      if (i === 0) continue;
      plain = false;
      parts.push(i > 0 ? `${s.label}: ${s.choices[i].label}` : `${s.key}=${q.get(s.key)}`);
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
    const stroke = strokeOf(this.pending);
    for (const sec of this.sections) sec.el.style.opacity = sec.applies(stroke) ? '1' : '0.4';
    if (syncInputs) for (const i of this.inputs) i.el.value = this.pending.get(i.key) ?? '';
    const dirty = this.changed();
    this.applyBtn.disabled = !dirty;
    this.applyBtn.style.cssText = `font:800 12px ${FONT_TEXT};color:${dirty ? '#fff' : INK};background:${dirty ? PINK : '#fff'};border:2px solid ${INK};border-radius:12px;padding:4px 10px;cursor:${dirty ? 'pointer' : 'default'};opacity:${dirty ? 1 : 0.5};`;
  }

  destroy(): void {
    this.root.remove();
  }
}
