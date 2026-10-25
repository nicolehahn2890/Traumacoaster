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
import { KIND_DEFAULTS, newElement, round, type ZoneElement, type ZoneElementKind, type ZoneFile } from '@/zone/types';

export interface ZoneEditorHost {
  view: WorldView;
  world: WorldRenderer;
  toast: Toast;
  /** Bahn nach einem Typwechsel neu zeichnen */
  redrawTrack(): void;
}

const TYPE_NAMES: Record<TrackType, string> = { road: 'Straße', steel: 'Stahl', wood: 'Holz', hanging: 'Hängebahn' };
const BTN = { width: 118, height: 30, size: 13, color: PAPER, textColor: INK };

export class ZoneEditor {
  readonly hud = new Container();
  /** Knöpfe, über denen kein Strich und kein Setzen beginnt (die Level-Szene nimmt sie in ihre Liste auf) */
  readonly buttons: Button[] = [];
  zone: ZoneFile;
  mode: 'build' | 'play' = 'build';
  private tool: ZoneElementKind | null = null;
  private selectedId: string | null = null;
  private placeLane = 0;
  private drag: { id: string; dx: number; dy: number } | null = null;
  private dirty = false;
  private readonly palette: Array<{ kind: ZoneElementKind; label: string; btn: Button }> = [];
  private readonly modeBtn = new Button('', BTN);
  private readonly saveBtn = new Button('Speichern', BTN);
  private readonly typeBtn = new Button('', BTN);
  private readonly status = label('', 14, INK, false, { wordWrap: true, wordWrapWidth: 520 });
  /** Auswahlrahmen um das gewählte Element (Bildschirm-Kasten der Welt, je Bild neu) */
  private readonly frame = new Graphics();
  private readonly hint = label('', 12, INK, false, { wordWrap: true, wordWrapWidth: 520 });

  constructor(private readonly host: ZoneEditorHost, zone: ZoneFile) {
    this.zone = zone;
    for (const def of KIND_DEFAULTS) {
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
  private chooseTool(kind: ZoneElementKind): void {
    this.tool = this.tool === kind ? null : kind;
    this.refreshLabels();
  }

  private toggleMode(): void {
    this.mode = this.mode === 'build' ? 'play' : 'build';
    this.tool = null;
    this.drag = null;
    for (const p of this.palette) p.btn.visible = this.mode === 'build';
    this.saveBtn.visible = this.typeBtn.visible = this.mode === 'build';
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

  /** Klick: Element setzen (mit Werkzeug) oder wählen; true = verbraucht */
  tap(p: Pt): boolean {
    if (!this.active || this.overHud(p)) return false;
    if (this.tool) {
      const w = this.worldAt(p, this.placeLane);
      const el = newElement(this.zone, this.tool, w.x, w.y, this.placeLane);
      this.zone.elements.push(el);
      this.host.world.addZoneElement(el);
      this.dirty = true;
      this.tool = null;
      this.select(el.id);
      return true;
    }
    this.select(this.pick(p));
    return true;
  }

  dragStart(p: Pt): boolean {
    if (!this.active || this.overHud(p)) return false;
    if (this.tool) return true;
    const id = this.pick(p);
    this.select(id);
    if (!id) return true;
    const el = this.find(id)!;
    const w = this.worldAt(p, el.z);
    this.drag = { id, dx: w.x - el.x, dy: w.y - el.y };
    return true;
  }

  dragMove(p: Pt): boolean {
    if (!this.active) return false;
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
      else this.select(null);
      this.refreshLabels();
      return true;
    }
    if (k.toLowerCase() === 't') {
      this.cycleType();
      return true;
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
    this.applyZone();
    this.host.redrawTrack();
    this.refreshLabels();
    this.host.toast.show('Zone neu geladen', 1.5);
  }

  // ------------------------------------------------------------------ Anzeige
  /** je Bild: Auswahlrahmen um das gewählte Element (folgt Kamera und Zug) */
  update(): void {
    this.frame.clear();
    if (!this.active || !this.selectedId) return;
    const b = this.host.world.zoneElementScreenBox(this.selectedId);
    if (!b) return;
    const pad = 4;
    this.frame.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 4, color: 0x2a1f3d, alpha: 0.5 });
    this.frame.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 2, color: 0xffd23f });
  }

  private describe(el: ZoneElement): string {
    const def = KIND_DEFAULTS.find((d) => d.kind === el.kind);
    const size = el.kind === 'water' ? `${el.w} × ${el.d ?? 0} m` : `${el.w} × ${el.h} m${el.d !== undefined ? `, Tiefe ${el.d} m` : ''}`;
    return `${def?.label ?? el.kind} ${el.id} · x ${el.x} m · Höhe ${el.y} m · Spur ${el.z > 0 ? '+' : ''}${el.z} · ${size}`;
  }

  private refreshLabels(): void {
    for (const p of this.palette) p.btn.setText(this.tool === p.kind ? `▸ ${p.label}` : p.label);
    this.modeBtn.setText(this.mode === 'build' ? 'Bauen ▸ Spielen' : 'Spielen ▸ Bauen');
    this.typeBtn.setText(`Bahn: ${TYPE_NAMES[this.zone.trackType]}`);
    this.saveBtn.setText(this.dirty ? 'Speichern •' : 'Speichern');
    const el = this.selected;
    const lane = this.placeLane > 0 ? `+${this.placeLane}` : `${this.placeLane}`;
    if (this.mode === 'play') {
      this.status.text = `Spielen · Zone ${this.zone.name} · ${this.zone.elements.length} Elemente`;
      this.hint.text = 'Tab: zurück zum Bauen';
    } else if (this.tool) {
      const def = KIND_DEFAULTS.find((d) => d.kind === this.tool);
      this.status.text = `Setzen: ${def?.label} auf Spur ${lane} (Tasten 1 bis 5), Klick in die Welt`;
      this.hint.text = 'Esc: Werkzeug weg';
    } else {
      this.status.text = el ? this.describe(el) : `Bauen · Zone ${this.zone.name} · ${this.zone.elements.length} Elemente · Spur für Neues: ${lane}`;
      this.hint.text = el
        ? 'Ziehen verschiebt · Bild auf/ab (oder [ ]) Tiefe, Shift fein · Pfeile Breite und Höhe · Entf löschen · Esc abwählen · Cmd+S speichern'
        : 'Typ links wählen, dann in die Welt klicken · Klick auf ein Element wählt es · T Bahntyp · Tab Spielen';
    }
    this.status.visible = this.hint.visible = true;
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
    this.hint.position.set(safe.left + 148, top + 84);
    this.status.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    this.hint.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    void h;
  }
}
