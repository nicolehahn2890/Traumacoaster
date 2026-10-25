/**
 * Klötzchen-Editor (Etappe 1, Schritt 6; Plan Paket 2.2, Stufe 1): Florian baut die Basiszone am Mac mit Maus und
 * Tastatur, ohne Politur. Links eine Palette der Platzhalter (Plan 8a.1); ein Klick auf einen Typ und dann in die Welt
 * setzt das Element auf der gewählten Spur, Ziehen verschiebt es in seiner Spur-Ebene (der Strahl durch den Mauszeiger
 * trifft die Ebene wie beim Pinsel), Tasten schieben es in der Tiefe und ändern seine Maße, Löschen entfernt es.
 * Speichern schreibt die Zonendatei über den Dev-Server, Hot-Reload holt sie bei jeder Änderung auf der Platte zurück.
 * Tab wechselt zwischen Bauen (der Editor nimmt die Eingabe) und Spielen (normales Zeichnen und Fahren). Alles hier
 * sind Werkzeuge; die Elemente sind Platzhalter, bis die Grafiken der Zone sie ersetzen.
 *
 * Tasten im Bauen: 1 bis 5 Spur für neue Elemente (vorn bis hinten), Bild auf und Bild ab (oder ] und [) Tiefe des
 * gewählten Elements (mit Shift fein), Pfeiltasten Breite und Höhe, Entf löschen, Esc abwählen, T Bahntyp der Zone,
 * Cmd/Strg+S speichern.
 */
import { Container, Graphics } from 'pixi.js';
import type { Pt } from '@/core/input';
import { safeArea } from '@/platform/safeArea';
import { rayToWorld, tagRay } from '@/track/stage';
import { Button, INK, PAPER, Toast, label } from '@/ui/widgets';
import type { WorldRenderer } from '@/world/renderer';
import type { WorldView } from '@/render/worldView';
import { TRACK_TYPES, type TrackType } from '@/world/trackTypes';
import { loadZone, onZoneChange, saveZone } from '@/zone/io';
import { KIND_DEFAULTS, ZONE_ANCHORS, ZONE_DEPTH_ROLES, newElement, newField, round, type ZoneElement, type ZoneElementKind, type ZoneField, type ZoneFile } from '@/zone/types';
import { toView } from '@/track/stage';

export interface ZoneEditorHost {
  view: WorldView;
  world: WorldRenderer;
  toast: Toast;
  /** Bahn nach einem Typwechsel neu zeichnen */
  redrawTrack(): void;
  /** Feld aktiv schalten (Kamerabegrenzung, Zoom-Grenze, Absperrband) oder null für die ganze Zone */
  setActiveField(field: ZoneField | null): void;
}

const ANCHOR_NAMES = { station: 'Station', tunnel: 'Tunnelachse', waterfall: 'Wasserfallquelle' } as const;
const ROLE_NAMES = { back: 'Rückwand', mid: 'Mitte', front: 'Vorderlippe' } as const;

const TYPE_NAMES: Record<TrackType, string> = { road: 'Straße', steel: 'Stahl', wood: 'Holz', hanging: 'Hängebahn' };
const BTN = { width: 118, height: 30, size: 13, color: PAPER, textColor: INK };

export class ZoneEditor {
  readonly hud = new Container();
  /** Knöpfe, über denen kein Strich und kein Setzen beginnt (die Level-Szene nimmt sie in ihre Liste auf) */
  readonly buttons: Button[] = [];
  zone: ZoneFile;
  mode: 'build' | 'play' = 'build';
  private tool: ZoneElementKind | 'field' | null = null;
  private selectedId: string | null = null;
  /** gewähltes Feld und das aktive Feld (Kamera, Absperrband) */
  private selectedFieldId: string | null = null;
  private activeFieldId: string | null = null;
  private placeLane = 0;
  private drag: { id: string; dx: number; dy: number } | null = null;
  /** Feld aufziehen: erste Ecke (Welt, Spur 0) und aktuelle Ecke */
  private fieldDrag: { ax: number; ay: number; bx: number; by: number } | null = null;
  private dirty = false;
  private readonly palette: Array<{ kind: ZoneElementKind | 'field'; label: string; btn: Button }> = [];
  private readonly modeBtn = new Button('', BTN);
  private readonly saveBtn = new Button('Speichern', BTN);
  private readonly typeBtn = new Button('', BTN);
  private readonly status = label('', 14, INK, false, { wordWrap: true, wordWrapWidth: 520 });
  /** Auswahlrahmen um das gewählte Element (Bildschirm-Kasten der Welt, je Bild neu) */
  private readonly frame = new Graphics();
  private readonly hint = label('', 12, INK, false, { wordWrap: true, wordWrapWidth: 520 });

  constructor(private readonly host: ZoneEditorHost, zone: ZoneFile) {
    this.zone = zone;
    for (const def of [...KIND_DEFAULTS.map((d) => ({ kind: d.kind as ZoneElementKind | 'field', label: d.label })), { kind: 'field' as const, label: 'Feld' }]) {
      const btn = new Button(def.label, BTN);
      btn.onTap = () => this.chooseTool(def.kind);
      this.palette.push({ kind: def.kind, label: def.label, btn });
      this.hud.addChild(btn);
      this.buttons.push(btn);
    }
    this.modeBtn.onTap = () => this.toggleMode();
    this.saveBtn.onTap = () => void this.save();
    this.typeBtn.onTap = () => this.cycleType();
    this.hud.addChild(this.frame, this.modeBtn, this.saveBtn, this.typeBtn, this.status, this.hint);
    this.buttons.push(this.modeBtn, this.saveBtn, this.typeBtn);
    this.status.anchor.set(0, 0);
    this.hint.anchor.set(0, 0);
    this.hint.alpha = 0.8;
    this.applyZone();
    this.refreshLabels();
    onZoneChange((name) => {
      if (name === this.zone.name) void this.reload();
    });
  }

  /** Bauen: Der Editor nimmt Zeiger und Tasten; Spielen: die Level-Szene */
  get active(): boolean {
    return this.mode === 'build';
  }

  private applyZone(): void {
    this.host.world.setZone(this.zone.elements);
    this.host.world.selectZoneElement(this.selectedId && this.find(this.selectedId) ? this.selectedId : null);
  }

  private find(id: string): ZoneElement | undefined {
    return this.zone.elements.find((e) => e.id === id);
  }

  private get selected(): ZoneElement | undefined {
    return this.selectedId ? this.find(this.selectedId) : undefined;
  }

  // ------------------------------------------------------------------ Bedienung
  private chooseTool(kind: ZoneElementKind | 'field'): void {
    this.tool = this.tool === kind ? null : kind;
    this.refreshLabels();
  }

  private get selectedField(): ZoneField | undefined {
    return this.selectedFieldId ? this.zone.fields.find((f) => f.id === this.selectedFieldId) : undefined;
  }

  private selectField(id: string | null): void {
    this.selectedFieldId = id;
    if (id) this.select(null);
    this.refreshLabels();
  }

  /** Feld aktiv schalten: im Spielen hält die Kamera es, das Absperrband steht an seinen Rändern; im Bauen bleibt die Kamera frei */
  private activateField(id: string | null): void {
    this.activeFieldId = id;
    this.applyActiveField();
    this.refreshLabels();
  }

  private applyActiveField(): void {
    const f = this.mode === 'play' && this.activeFieldId ? this.zone.fields.find((x) => x.id === this.activeFieldId) ?? null : null;
    this.host.setActiveField(f);
  }

  /** Feld unter einem Weltpunkt (Spur 0), das zuoberst liegt (kleinstes zuerst) */
  private fieldAt(x: number, y: number): ZoneField | undefined {
    return [...this.zone.fields].filter((f) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
  }

  private toggleMode(): void {
    this.mode = this.mode === 'build' ? 'play' : 'build';
    this.tool = null;
    this.drag = null;
    this.fieldDrag = null;
    for (const p of this.palette) p.btn.visible = this.mode === 'build';
    this.saveBtn.visible = this.typeBtn.visible = this.mode === 'build';
    this.applyActiveField();
    this.refreshLabels();
  }

  private cycleType(): void {
    const i = TRACK_TYPES.indexOf(this.zone.trackType);
    this.zone.trackType = TRACK_TYPES[(i + 1) % TRACK_TYPES.length];
    this.host.world.trackOverride = this.zone.trackType;
    this.dirty = true;
    this.host.redrawTrack();
    this.refreshLabels();
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.host.world.selectZoneElement(id);
    this.refreshLabels();
  }

  /** Weltpunkt unter dem Zeiger auf der Spur-Ebene z (Strahl wie beim Pinsel) */
  private worldAt(p: Pt, z: number): { x: number; y: number } {
    return rayToWorld(tagRay(this.host.view.camera.toStage(p.x, p.y)), z);
  }

  private overHud(p: Pt): boolean {
    for (const b of this.buttons) {
      if (!b.visible) continue;
      const r = b.getBounds();
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return true;
    }
    return false;
  }

  private pick(p: Pt): string | null {
    const c = this.host.view.camera;
    return this.host.world.pickZoneElement((p.x / c.width) * 2 - 1, 1 - (p.y / c.height) * 2);
  }

  /** Klick: Element setzen (mit Werkzeug), Element wählen, sonst ein Feld unter dem Zeiger; true = verbraucht */
  tap(p: Pt): boolean {
    if (!this.active || this.overHud(p)) return false;
    if (this.tool && this.tool !== 'field') {
      const w = this.worldAt(p, this.placeLane);
      const el = newElement(this.zone, this.tool, w.x, w.y, this.placeLane);
      this.zone.elements.push(el);
      this.host.world.addZoneElement(el);
      this.dirty = true;
      this.tool = null;
      this.selectField(null);
      this.select(el.id);
      return true;
    }
    if (this.tool === 'field') return true;
    const id = this.pick(p);
    if (id) {
      this.selectField(null);
      this.select(id);
      return true;
    }
    this.select(null);
    const w = this.worldAt(p, 0);
    this.selectField(this.fieldAt(w.x, w.y)?.id ?? null);
    return true;
  }

  dragStart(p: Pt): boolean {
    if (!this.active || this.overHud(p)) return false;
    if (this.tool === 'field') {
      const w = this.worldAt(p, 0);
      this.fieldDrag = { ax: w.x, ay: w.y, bx: w.x, by: w.y };
      return true;
    }
    if (this.tool) return true;
    const id = this.pick(p);
    this.selectField(null);
    this.select(id);
    if (!id) return true;
    const el = this.find(id)!;
    const w = this.worldAt(p, el.z);
    this.drag = { id, dx: w.x - el.x, dy: w.y - el.y };
    return true;
  }

  dragMove(p: Pt): boolean {
    if (!this.active) return false;
    if (this.fieldDrag) {
      const w = this.worldAt(p, 0);
      this.fieldDrag.bx = w.x;
      this.fieldDrag.by = w.y;
      this.status.text = `Feld aufziehen: ${round(Math.abs(w.x - this.fieldDrag.ax), 0)} × ${round(Math.abs(w.y - this.fieldDrag.ay), 0)} m`;
      return true;
    }
    if (!this.drag) return true;
    const el = this.find(this.drag.id);
    if (!el) return true;
    const w = this.worldAt(p, el.z);
    const x = round(w.x - this.drag.dx);
    const y = round(w.y - this.drag.dy);
    this.host.world.nudgeZoneElement(el.id, x, y, el.z);
    this.status.text = this.describe({ ...el, x, y });
    return true;
  }

  dragEnd(p: Pt): boolean {
    if (!this.active) return false;
    if (this.fieldDrag) {
      const w = this.worldAt(p, 0);
      const d = this.fieldDrag;
      this.fieldDrag = null;
      this.tool = null;
      if (Math.abs(w.x - d.ax) >= 4 && Math.abs(w.y - d.ay) >= 3) {
        const field = newField(this.zone, d.ax, d.ay, w.x, w.y);
        this.zone.fields.push(field);
        this.dirty = true;
        this.selectField(field.id);
      } else this.refreshLabels();
      return true;
    }
    if (!this.drag) return true;
    const el = this.find(this.drag.id);
    if (el) {
      const w = this.worldAt(p, el.z);
      el.x = round(w.x - this.drag.dx);
      el.y = round(w.y - this.drag.dy);
      this.commit(el);
    }
    this.drag = null;
    return true;
  }

  /** Taste; true = verbraucht. Tab wechselt auch im Spielen zurück ins Bauen */
  key(k: string, ev: KeyboardEvent): boolean {
    if (k === 'Tab') {
      ev.preventDefault();
      this.toggleMode();
      return true;
    }
    if (!this.active) return false;
    if ((ev.metaKey || ev.ctrlKey) && k.toLowerCase() === 's') {
      ev.preventDefault();
      void this.save();
      return true;
    }
    if (k >= '1' && k <= '5') {
      this.placeLane = Number(k) - 3;
      this.refreshLabels();
      return true;
    }
    if (k === 'Escape') {
      if (this.tool) this.tool = null;
      else {
        this.select(null);
        this.selectField(null);
      }
      this.refreshLabels();
      return true;
    }
    if (k.toLowerCase() === 't') {
      this.cycleType();
      return true;
    }
    const field = this.selectedField;
    if (field && !this.selected) {
      if (k === 'Delete' || k === 'Backspace') {
        this.zone.fields = this.zone.fields.filter((f) => f.id !== field.id);
        if (this.activeFieldId === field.id) this.activateField(null);
        this.dirty = true;
        this.selectField(null);
        return true;
      }
      if (k === 'Enter') {
        this.activateField(this.activeFieldId === field.id ? null : field.id);
        return true;
      }
      return false;
    }
    const el = this.selected;
    if (!el) return false;
    if (k === 'Delete' || k === 'Backspace') {
      this.zone.elements = this.zone.elements.filter((e) => e.id !== el.id);
      this.host.world.removeZoneElement(el.id);
      this.dirty = true;
      this.select(null);
      return true;
    }
    // Metadaten (Plan 2.1, 8a.1)
    const lower = k.toLowerCase();
    if (lower === 'm') {
      el.foundation = !el.foundation || undefined;
      this.commit(el);
      return true;
    }
    if (lower === 'o') {
      if (el.kind !== 'threePart') {
        this.host.toast.show('Öffnungen gibt es nur beim Dreiteiler', 1.8);
        return true;
      }
      if (el.openings?.length) delete el.openings;
      else el.openings = [{ dx: 0, dy: Math.max(2.6, round(el.h * 0.3)), r: 2.4 }];
      this.commit(el);
      return true;
    }
    if (lower === 'a') {
      const i = el.anchor ? ZONE_ANCHORS.indexOf(el.anchor) : -1;
      const next = ZONE_ANCHORS[i + 1];
      if (next) el.anchor = next;
      else delete el.anchor;
      this.commit(el);
      return true;
    }
    if (lower === 'g') {
      el.growth = ((el.growth ?? 0) + 1) % 4 || undefined;
      this.commit(el);
      return true;
    }
    if (lower === 'r') {
      const i = el.depthRole ? ZONE_DEPTH_ROLES.indexOf(el.depthRole) : -1;
      const next = ZONE_DEPTH_ROLES[i + 1];
      if (next) el.depthRole = next;
      else delete el.depthRole;
      this.commit(el);
      return true;
    }
    const fine = ev.shiftKey;
    if (k === '[' || k === ']' || k === 'PageUp' || k === 'PageDown') {
      ev.preventDefault();
      const step = fine ? 0.1 : 0.5;
      const back = k === ']' || k === 'PageUp';
      el.z = round(Math.max(-2.5, Math.min(2.5, el.z + (back ? step : -step))));
      this.commit(el);
      return true;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      ev.preventDefault();
      el.w = round(Math.max(0.2, el.w * (k === 'ArrowRight' ? 1.1 : 1 / 1.1)));
      this.commit(el);
      return true;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      ev.preventDefault();
      el.h = round(Math.max(0, el.h * (k === 'ArrowUp' ? 1.1 : 1 / 1.1)));
      this.commit(el);
      return true;
    }
    return false;
  }

  private commit(el: ZoneElement): void {
    this.host.world.updateZoneElement(el);
    this.dirty = true;
    this.refreshLabels();
  }

  // ------------------------------------------------------------------ Datei
  async save(): Promise<void> {
    const ok = await saveZone(this.zone);
    if (ok) {
      this.dirty = false;
      this.host.toast.show(`Zone gespeichert: public/zones/${this.zone.name}/zone.json`, 2.5);
    } else this.host.toast.show('Speichern geht nur im Dev-Server am Mac (npm run dev)', 3);
    this.refreshLabels();
  }

  /** Hot-Reload: Datei auf der Platte hat sich geändert */
  private async reload(): Promise<void> {
    const zone = await loadZone(this.zone.name);
    if (!zone) return;
    this.zone = zone;
    this.host.world.trackOverride = zone.trackType;
    this.dirty = false;
    this.drag = null;
    this.fieldDrag = null;
    if (this.selectedFieldId && !zone.fields.some((f) => f.id === this.selectedFieldId)) this.selectedFieldId = null;
    if (this.activeFieldId && !zone.fields.some((f) => f.id === this.activeFieldId)) this.activeFieldId = null;
    this.applyZone();
    this.applyActiveField();
    this.host.redrawTrack();
    this.refreshLabels();
    this.host.toast.show('Zone neu geladen', 1.5);
  }

  // ------------------------------------------------------------------ Anzeige
  /** je Bild: Felder, Auswahlrahmen um das gewählte Element, Anker- und Fundament-Marken (folgen der Kamera) */
  update(): void {
    const g = this.frame;
    g.clear();
    if (!this.active) return;
    // Felder als Rahmen auf Spur 0: gewählt gelb, aktiv kräftig, sonst zart; das aufgezogene gestrichelt
    const screen = (x: number, y: number): Pt => {
      const v = toView(x, y, 0);
      return this.host.view.toScreen(v.X, v.Y);
    };
    const rectOf = (x0: number, y0: number, x1: number, y1: number, color: number, width: number, alpha: number): void => {
      const a = screen(x0, y0);
      const b = screen(x1, y1);
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)).stroke({ width, color, alpha });
    };
    for (const f of this.zone.fields) {
      const active = f.id === this.activeFieldId;
      const sel = f.id === this.selectedFieldId;
      rectOf(f.x0, f.y0, f.x1, f.y1, sel ? 0xffd23f : 0x2a1f3d, active ? 3 : 2, sel ? 1 : active ? 0.8 : 0.35);
    }
    if (this.fieldDrag) rectOf(this.fieldDrag.ax, this.fieldDrag.ay, this.fieldDrag.bx, this.fieldDrag.by, 0xffd23f, 2, 0.9);
    const el = this.selected;
    if (!el) return;
    const b = this.host.world.zoneElementScreenBox(el.id);
    if (!b) return;
    const pad = 4;
    g.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 4, color: 0x2a1f3d, alpha: 0.5 });
    g.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 2, color: 0xffd23f });
    // Fundament: grüne Oberkante; Anker: Punkt am Fuß
    if (el.foundation) g.moveTo(b.minX, b.minY - pad).lineTo(b.maxX, b.minY - pad).stroke({ width: 4, color: 0x5ad85a });
    if (el.anchor) {
      const a = screen(el.x, el.y);
      g.circle(a.x, a.y, 7).fill({ color: el.anchor === 'station' ? 0xff5c8a : el.anchor === 'tunnel' ? 0x14101a : 0x5fb6ff }).stroke({ width: 2, color: 0xffffff });
    }
  }

  private describe(el: ZoneElement): string {
    const def = KIND_DEFAULTS.find((d) => d.kind === el.kind);
    const size = el.kind === 'water' ? `${el.w} × ${el.d ?? 0} m` : `${el.w} × ${el.h} m${el.d !== undefined ? `, Tiefe ${el.d} m` : ''}`;
    const meta: string[] = [];
    if (el.foundation) meta.push('Fundament');
    if (el.openings?.length) meta.push(`Öffnung r ${el.openings[0].r} m`);
    if (el.anchor) meta.push(`Anker ${ANCHOR_NAMES[el.anchor]}`);
    if (el.growth) meta.push(`ab Stufe ${el.growth}`);
    if (el.depthRole) meta.push(`Rolle ${ROLE_NAMES[el.depthRole]}`);
    return `${def?.label ?? el.kind} ${el.id} · x ${el.x} m · Höhe ${el.y} m · Spur ${el.z > 0 ? '+' : ''}${el.z} · ${size}${meta.length ? ' · ' + meta.join(' · ') : ''}`;
  }

  private describeField(f: ZoneField): string {
    return `Feld ${f.id}${f.name ? ` „${f.name}“` : ''} · x ${f.x0} bis ${f.x1} m · Höhe ${f.y0} bis ${f.y1} m${f.id === this.activeFieldId ? ' · aktiv' : ''}`;
  }

  private refreshLabels(): void {
    for (const p of this.palette) p.btn.setText(this.tool === p.kind ? `▸ ${p.label}` : p.label);
    this.modeBtn.setText(this.mode === 'build' ? 'Bauen ▸ Spielen' : 'Spielen ▸ Bauen');
    this.typeBtn.setText(`Bahn: ${TYPE_NAMES[this.zone.trackType]}`);
    this.saveBtn.setText(this.dirty ? 'Speichern •' : 'Speichern');
    const el = this.selected;
    const field = this.selectedField;
    const lane = this.placeLane > 0 ? `+${this.placeLane}` : `${this.placeLane}`;
    const activeField = this.activeFieldId ? this.zone.fields.find((f) => f.id === this.activeFieldId) : undefined;
    if (this.mode === 'play') {
      this.status.text = `Spielen · Zone ${this.zone.name} · ${this.zone.elements.length} Elemente${activeField ? ` · Feld ${activeField.id} (Kamera und Absperrband)` : ' · ganze Zone'}`;
      this.hint.text = 'Tab: zurück zum Bauen';
    } else if (this.tool === 'field') {
      this.status.text = 'Feld aufziehen: in der Welt ziehen (Rechteck in x und Höhe, mindestens 20 × 12 m)';
      this.hint.text = 'Esc: Werkzeug weg';
    } else if (this.tool) {
      const def = KIND_DEFAULTS.find((d) => d.kind === this.tool);
      this.status.text = `Setzen: ${def?.label} auf Spur ${lane} (Tasten 1 bis 5), Klick in die Welt`;
      this.hint.text = 'Esc: Werkzeug weg';
    } else if (el) {
      this.status.text = this.describe(el);
      this.hint.text = 'Ziehen verschiebt · Bild auf/ab (oder [ ]) Tiefe, Shift fein · Pfeile Breite und Höhe · M Fundament · O Öffnung · A Anker · G Stufe · R Rolle · Entf löschen · Esc abwählen · Cmd+S speichern';
    } else if (field) {
      this.status.text = this.describeField(field);
      this.hint.text = 'Enter aktiv schalten (im Spielen hält die Kamera das Feld, Absperrband an den Rändern) · Entf löschen · Esc abwählen';
    } else {
      this.status.text = `Bauen · Zone ${this.zone.name} · ${this.zone.elements.length} Elemente · ${this.zone.fields.length} Felder · Spur für Neues: ${lane}`;
      this.hint.text = 'Typ links wählen, dann in die Welt klicken · Klick wählt Element oder Feld · T Bahntyp · Tab Spielen';
    }
    this.status.visible = this.hint.visible = true;
    this.hint.y = this.status.y + this.status.height + 4;
  }

  resize(w: number, h: number): void {
    const safe = safeArea();
    const top = Math.max(14, safe.top + 6);
    const x = safe.left + 72;
    let y = top + 72;
    this.modeBtn.position.set(x, y);
    y += 40;
    for (const p of this.palette) {
      p.btn.position.set(x, y);
      y += 34;
    }
    y += 6;
    this.typeBtn.position.set(x, y);
    y += 34;
    this.saveBtn.position.set(x, y);
    this.status.position.set(safe.left + 148, top + 62);
    this.status.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    this.hint.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    this.hint.position.set(safe.left + 148, this.status.y + this.status.height + 4);
    void h;
  }
}
