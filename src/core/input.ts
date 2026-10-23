/**
 * Eingabe: vereinheitlicht Touch und Maus zu wenigen Gesten.
 * Ein Finger: Ziehen (Zeichnen/Handles), Tippen, Doppeltipp, Langdruck.
 * Zwei Finger: Pan, Pinch, Zwei-Finger-Tipp (Undo). Drei-Finger-Tipp (Redo).
 * Maus: links = Finger, rechts/Mittel/Leertaste+links = Pan, Rad = Zoom, Strg+Z/Y.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface InputHandlers {
  dragStart?: (p: Pt, id: number) => void;
  dragMove?: (p: Pt, id: number) => void;
  dragEnd?: (p: Pt, id: number) => void;
  /** vorhergesagte Fingerposition (nur zum Zeichnen der Spitze, nie für den Strich selbst) */
  dragPredict?: (p: Pt, id: number) => void;
  tap?: (p: Pt) => void;
  doubleTap?: (p: Pt) => void;
  longPress?: (p: Pt) => void;
  panStart?: (center: Pt) => void;
  pan?: (center: Pt, delta: Pt) => void;
  pinch?: (center: Pt, scale: number) => void;
  panEnd?: () => void;
  twoFingerTap?: () => void;
  threeFingerTap?: () => void;
  wheel?: (p: Pt, delta: number) => void;
  key?: (key: string, ev: KeyboardEvent) => void;
}

interface Pointer {
  id: number;
  start: Pt;
  cur: Pt;
  time: number;
  moved: boolean;
}

const TAP_MAX_DIST = 10;
const TAP_MAX_TIME = 300;
const DOUBLE_TAP_TIME = 320;
const LONG_PRESS_TIME = 480;

export class InputManager {
  private pointers = new Map<number, Pointer>();
  private dragging = false;
  private dragId = -1;
  private multi = false;
  private maxPointers = 0;
  private lastDist = 0;
  private lastCenter: Pt = { x: 0, y: 0 };
  private lastTapTime = 0;
  private lastTapPos: Pt = { x: 0, y: 0 };
  private longPressTimer: number | null = null;
  private spaceDown = false;
  private mousePan = false;
  handlers: InputHandlers = {};
  enabled = true;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onUp, { passive: false });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private pos(e: PointerEvent): Pt {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = this.pos(e);
    const isMouse = e.pointerType === 'mouse';
    if (isMouse && (e.button === 1 || e.button === 2 || this.spaceDown)) {
      this.mousePan = true;
      this.lastCenter = p;
      this.handlers.panStart?.(p);
      return;
    }
    this.pointers.set(e.pointerId, { id: e.pointerId, start: p, cur: p, time: performance.now(), moved: false });
    this.maxPointers = Math.max(this.maxPointers, this.pointers.size);
    if (this.pointers.size === 1) {
      this.dragId = e.pointerId;
      this.dragging = false;
      this.clearLongPress();
      this.longPressTimer = window.setTimeout(() => {
        const ptr = this.pointers.get(e.pointerId);
        if (ptr && !ptr.moved && this.pointers.size === 1 && !this.dragging) {
          this.handlers.longPress?.(ptr.cur);
          ptr.moved = true; // kein Tap mehr
          this.dragging = true;
          this.handlers.dragStart?.(ptr.cur, ptr.id);
        }
      }, LONG_PRESS_TIME);
    } else if (this.pointers.size === 2) {
      this.clearLongPress();
      // Einzel-Drag abbrechen, Multi-Touch beginnt
      if (this.dragging) {
        const d = this.pointers.get(this.dragId);
        if (d) this.handlers.dragEnd?.(d.cur, this.dragId);
        this.dragging = false;
      }
      this.multi = true;
      const [a, b] = [...this.pointers.values()];
      this.lastDist = Math.hypot(a.cur.x - b.cur.x, a.cur.y - b.cur.y);
      this.lastCenter = { x: (a.cur.x + b.cur.x) / 2, y: (a.cur.y + b.cur.y) / 2 };
      this.handlers.panStart?.(this.lastCenter);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.pos(e);
    if (this.mousePan) {
      const delta = { x: p.x - this.lastCenter.x, y: p.y - this.lastCenter.y };
      this.lastCenter = p;
      this.handlers.pan?.(p, delta);
      return;
    }
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    ptr.cur = p;
    const dist = Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y);
    if (dist > TAP_MAX_DIST) ptr.moved = true;
    if (this.multi && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.cur.x - b.cur.x, a.cur.y - b.cur.y);
      const c = { x: (a.cur.x + b.cur.x) / 2, y: (a.cur.y + b.cur.y) / 2 };
      const delta = { x: c.x - this.lastCenter.x, y: c.y - this.lastCenter.y };
      if (this.lastDist > 0 && Math.abs(d - this.lastDist) > 0.5) this.handlers.pinch?.(c, d / this.lastDist);
      if (Math.abs(delta.x) + Math.abs(delta.y) > 0) this.handlers.pan?.(c, delta);
      this.lastDist = d;
      this.lastCenter = c;
      return;
    }
    if (this.pointers.size === 1 && e.pointerId === this.dragId) {
      if (!this.dragging && ptr.moved) {
        this.clearLongPress();
        this.dragging = true;
        this.handlers.dragStart?.(ptr.start, ptr.id);
      }
      if (this.dragging) {
        // alle Zwischenpunkte seit dem letzten Bild: Touch tastet oft mit 120–240 Hz ab, pointermove kommt nur einmal
        // je Bild (bei schnellem Zeichnen sonst nur alle paar Millimeter ein Punkt)
        const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        if (list.length > 1) for (const ce of list) this.handlers.dragMove?.(this.pos(ce), ptr.id);
        else this.handlers.dragMove?.(p, ptr.id);
        // die Spitze dort zeichnen, wo der Finger gleich sein wird: ein Bild Verzögerung weniger
        const pred = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
        if (pred.length) this.handlers.dragPredict?.(this.pos(pred[pred.length - 1]), ptr.id);
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.pos(e);
    if (this.mousePan) {
      this.mousePan = false;
      this.handlers.panEnd?.();
      return;
    }
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    this.clearLongPress();
    const now = performance.now();
    if (this.multi) {
      if (this.pointers.size === 0) {
        // Multi-Touch endete: war es ein kurzer Tipp mit 2/3 Fingern?
        const quick = now - ptr.time < TAP_MAX_TIME && !ptr.moved;
        if (quick && this.maxPointers === 2) this.handlers.twoFingerTap?.();
        else if (quick && this.maxPointers >= 3) this.handlers.threeFingerTap?.();
        this.handlers.panEnd?.();
        this.multi = false;
        this.maxPointers = 0;
      }
      return;
    }
    if (e.pointerId === this.dragId) {
      if (this.dragging) {
        this.handlers.dragEnd?.(p, ptr.id);
      } else if (!ptr.moved && now - ptr.time < TAP_MAX_TIME + 200) {
        const dd = Math.hypot(p.x - this.lastTapPos.x, p.y - this.lastTapPos.y);
        if (now - this.lastTapTime < DOUBLE_TAP_TIME && dd < 30) {
          this.handlers.doubleTap?.(p);
          this.lastTapTime = 0;
        } else {
          this.handlers.tap?.(p);
          this.lastTapTime = now;
          this.lastTapPos = p;
        }
      }
      this.dragging = false;
      this.dragId = -1;
    }
    if (this.pointers.size === 0) this.maxPointers = 0;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    this.handlers.wheel?.({ x: e.clientX - r.left, y: e.clientY - r.top }, e.deltaY);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') this.spaceDown = true;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.handlers.threeFingerTap?.();
      else this.handlers.twoFingerTap?.();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.handlers.threeFingerTap?.();
      return;
    }
    this.handlers.key?.(e.key, e);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') this.spaceDown = false;
  };

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
