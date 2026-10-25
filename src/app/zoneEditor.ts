/**
 * Klötzchen-Editor (Etappe 1, Schritt 6; Plan Paket 2.2, Stufe 1): Florian baut die Basiszone am Mac mit Maus und
 * Tastatur, ohne Politur. Links eine Palette der Platzhalter (Plan 8a.1); ein Klick auf einen Typ und dann in die Welt
 * setzt das Element auf der gewählten Spur, Ziehen verschiebt es in seiner Spur-Ebene (der Strahl durch den Mauszeiger
 * trifft die Ebene wie beim Pinsel), Tasten schieben es in der Tiefe und ändern seine Maße, Löschen entfernt es.
 * Speichern schreibt die Zonendatei über den Dev-Server, Hot-Reload holt sie bei jeder Änderung auf der Platte zurück.
 * Tab wechselt zwischen Bauen (der Editor nimmt die Eingabe) und Spielen (normales Zeichnen und Fahren). Alles hier
 * sind Werkzeuge; die Elemente sind Platzhalter, bis die Grafiken der Zone sie ersetzen.
 *
 * Tasten im Bauen: 1 bis 5 Spur für neue Einträge (vorn bis hinten), Bild auf und Bild ab (oder ] und [) Tiefe des
 * gewählten Eintrags (mit Shift fein), Pfeiltasten Maße (Shift+Pfeile links/rechts: Dicke des Volumens), Entf löschen,
 * Esc abwählen, T Bahntyp der Zone, Cmd/Strg+S speichern; Element: M Fundament, O Öffnung (Alt+Pfeile verschieben sie,
 * Plus und Minus ändern den Radius), A Anker, G Stufe, R Rolle; Station und Schlange: D Richtung; Baustelle:
 * V Variante; Coins: C Form. Felder (Werkzeug „Feld“, aufziehen): Enter aktiv, N Name, Z Ziele (Zeile „finish, height 20,
 * *coins 5“; Stern = Bonus), G Fortschrittsstufe der Zone, U Aufwertung (Gurtstufe), Entf löschen. Der Knopf „Testfahrt“
 * schaltet das gewählte Feld aktiv, wechselt ins Spielen und lässt die Bahn fahren (Schritt 9).
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
import { KIND_DEFAULTS, ZONE_ANCHORS, ZONE_DEPTH_ROLES, ZONE_GOAL_TYPES, formatGoals, newCoinGroup, newElement, newField, newQueue, newSite, newStation, parseGoals, round, type ZoneCoinGroup, type ZoneElement, type ZoneElementKind, type ZoneField, type ZoneFile, type ZoneQueue, type ZoneSite, type ZoneStation } from '@/zone/types';
import { applyZoneExtras, buildZoneCoins, buildZoneQueue, buildZoneSite, buildZoneStation, itemPosition } from '@/zone/build';
import { COIN_SHAPES } from '@/zone/groups';
import { toView } from '@/track/stage';

/** Werkzeuge der Palette: Platzhalter-Typen, Feld, Station, Schlange, Baustelle, Coin-Gruppe */
type Tool = ZoneElementKind | 'field' | 'station' | 'queue' | 'site' | 'coins';
/** gewählter Eintrag der Zone, an der Kennung erkannt (e…, s…, q…, b…, c…) */
type Item = { kind: 'element'; el: ZoneElement } | { kind: 'station'; st: ZoneStation } | { kind: 'queue'; q: ZoneQueue } | { kind: 'site'; b: ZoneSite } | { kind: 'coins'; c: ZoneCoinGroup };

export interface ZoneEditorHost {
  view: WorldView;
  world: WorldRenderer;
  toast: Toast;
  /** Bahn nach einem Typwechsel neu zeichnen */
  redrawTrack(): void;
  /** Feld aktiv schalten (Kamerabegrenzung, Zoom-Grenze, Absperrband) oder null für die ganze Zone */
  setActiveField(field: ZoneField | null): void;
  /** Coins der Zone neu in die Bühne setzen */
  refreshCoins(): void;
  /** Vorgabestück der Station neu setzen (wenn noch nichts gezeichnet ist) */
  refreshStation(): void;
  /** Testfahrt: die Bahn fahren lassen (wie der Fahren-Knopf des Levels) */
  startRide(): void;
}

const ANCHOR_NAMES = { station: 'Station', tunnel: 'Tunnelachse', waterfall: 'Wasserfallquelle' } as const;
const ROLE_NAMES = { back: 'Rückwand', mid: 'Mitte', front: 'Vorderlippe' } as const;
const SHAPE_NAMES = { row: 'Reihe', arc: 'Bogen', ring: 'Ring', column: 'Säule' } as const;
/** Gurtstufen der Aufwertung (src/physics/belts.ts) */
const BELT_NAMES = ['ohne Gurt', 'Beckengurt', 'Bügel', 'Schulterbügel', 'Rennsitz'] as const;
const EXTRA_TOOLS: Array<{ kind: Tool; label: string }> = [
  { kind: 'field', label: 'Feld' },
  { kind: 'station', label: 'Station' },
  { kind: 'queue', label: 'Schlange' },
  { kind: 'site', label: 'Baustelle' },
  { kind: 'coins', label: 'Coins' },
];

const TYPE_NAMES: Record<TrackType, string> = { road: 'Straße', steel: 'Stahl', wood: 'Holz', hanging: 'Hängebahn' };
const BTN = { width: 118, height: 30, size: 13, color: PAPER, textColor: INK };

export class ZoneEditor {
  readonly hud = new Container();
  /** Knöpfe, über denen kein Strich und kein Setzen beginnt (die Level-Szene nimmt sie in ihre Liste auf) */
  readonly buttons: Button[] = [];
  zone: ZoneFile;
  mode: 'build' | 'play' = 'build';
  private tool: Tool | null = null;
  private selectedId: string | null = null;
  /** gewähltes Feld und das aktive Feld (Kamera, Absperrband) */
  private selectedFieldId: string | null = null;
  private activeFieldId: string | null = null;
  private placeLane = 0;
  private drag: { id: string; dx: number; dy: number } | null = null;
  /** Feld aufziehen: erste Ecke (Welt, Spur 0) und aktuelle Ecke */
  private fieldDrag: { ax: number; ay: number; bx: number; by: number } | null = null;
  private dirty = false;
  private readonly palette: Array<{ kind: Tool; label: string; btn: Button }> = [];
  private readonly modeBtn = new Button('', BTN);
  private readonly saveBtn = new Button('Speichern', BTN);
  private readonly typeBtn = new Button('', BTN);
  private readonly rideBtn = new Button('Testfahrt', BTN);
  private readonly status = label('', 14, INK, false, { wordWrap: true, wordWrapWidth: 520 });
  /** Auswahlrahmen um das gewählte Element (Bildschirm-Kasten der Welt, je Bild neu) */
  private readonly frame = new Graphics();
  private readonly hint = label('', 12, INK, false, { wordWrap: true, wordWrapWidth: 520 });
  /** Oberkante der Statuszeile und Hochformat (aus resize); im Spielen mit Zielen rückt die Zeile unter die Zielleiste */
  private statusTop = 76;
  private portrait = false;

  constructor(private readonly host: ZoneEditorHost, zone: ZoneFile) {
    this.zone = zone;
    for (const def of [...KIND_DEFAULTS.map((d) => ({ kind: d.kind as Tool, label: d.label })), ...EXTRA_TOOLS]) {
      const btn = new Button(def.label, BTN);
      btn.onTap = () => this.chooseTool(def.kind);
      this.palette.push({ kind: def.kind, label: def.label, btn });
      this.hud.addChild(btn);
      this.buttons.push(btn);
    }
    this.modeBtn.onTap = () => this.toggleMode();
    this.saveBtn.onTap = () => void this.save();
    this.typeBtn.onTap = () => this.cycleType();
    this.rideBtn.onTap = () => this.testRide();
    this.hud.addChild(this.frame, this.modeBtn, this.saveBtn, this.typeBtn, this.rideBtn, this.status, this.hint);
    this.buttons.push(this.modeBtn, this.saveBtn, this.typeBtn, this.rideBtn);
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
    applyZoneExtras(this.host.world, this.zone);
    this.host.world.selectZoneElement(this.selectedId && this.item(this.selectedId) ? this.selectedId : null);
  }

  private find(id: string): ZoneElement | undefined {
    return this.zone.elements.find((e) => e.id === id);
  }

  /** Eintrag der Zone zu einer Kennung */
  private item(id: string): Item | null {
    const z = this.zone;
    const el = z.elements.find((e) => e.id === id);
    if (el) return { kind: 'element', el };
    const st = z.stations.find((s) => s.id === id);
    if (st) return { kind: 'station', st };
    const q = z.queues.find((x) => x.id === id);
    if (q) return { kind: 'queue', q };
    const b = z.sites.find((x) => x.id === id);
    if (b) return { kind: 'site', b };
    const c = z.coinGroups.find((x) => x.id === id);
    if (c) return { kind: 'coins', c };
    return null;
  }

  private get selected(): ZoneElement | undefined {
    return this.selectedId ? this.find(this.selectedId) : undefined;
  }

  private get selectedItem(): Item | null {
    return this.selectedId ? this.item(this.selectedId) : null;
  }

  /** Lage eines Eintrags (Schlange: Mitte des Streifens) */
  private posOf(item: Item): { x: number; y: number; z: number } {
    return itemPosition(item.kind === 'element' ? item.el : item.kind === 'station' ? item.st : item.kind === 'queue' ? item.q : item.kind === 'site' ? item.b : item.c);
  }

  private idOf(item: Item): string {
    return item.kind === 'element' ? item.el.id : item.kind === 'station' ? item.st.id : item.kind === 'queue' ? item.q.id : item.kind === 'site' ? item.b.id : item.c.id;
  }

  /** Eintrag verschieben (x, y) und in der Tiefe (z) */
  private moveItem(item: Item, x: number, y: number, z: number): void {
    switch (item.kind) {
      case 'element':
        Object.assign(item.el, { x, y, z });
        break;
      case 'station':
        Object.assign(item.st, { x, y, z });
        break;
      case 'queue': {
        const half = (item.q.x1 - item.q.x0) / 2;
        Object.assign(item.q, { x0: round(x - half), x1: round(x + half), y, z });
        break;
      }
      case 'site':
        Object.assign(item.b, { x, y, z });
        break;
      default:
        Object.assign(item.c, { x, y, z });
    }
  }

  /** Eintrag neu bauen, Datei als geändert merken, Bühne nachziehen (Coins, Vorgabestück) */
  private commitItem(item: Item): void {
    const w = this.host.world;
    switch (item.kind) {
      case 'element':
        w.updateZoneElement(item.el);
        break;
      case 'station':
        w.addZoneBuilt(item.st.id, buildZoneStation(item.st), itemPosition(item.st));
        this.host.refreshStation();
        break;
      case 'queue':
        w.addZoneBuilt(item.q.id, buildZoneQueue(item.q), itemPosition(item.q));
        break;
      case 'site':
        w.addZoneBuilt(item.b.id, buildZoneSite(item.b), itemPosition(item.b));
        break;
      default:
        w.addZoneBuilt(item.c.id, buildZoneCoins(item.c), itemPosition(item.c));
        this.host.refreshCoins();
    }
    this.dirty = true;
    this.refreshLabels();
  }

  private removeItem(item: Item): void {
    const id = this.idOf(item);
    const z = this.zone;
    if (item.kind === 'element') z.elements = z.elements.filter((e) => e.id !== id);
    else if (item.kind === 'station') z.stations = z.stations.filter((e) => e.id !== id);
    else if (item.kind === 'queue') z.queues = z.queues.filter((e) => e.id !== id);
    else if (item.kind === 'site') z.sites = z.sites.filter((e) => e.id !== id);
    else z.coinGroups = z.coinGroups.filter((e) => e.id !== id);
    this.host.world.removeZoneElement(id);
    if (item.kind === 'coins') this.host.refreshCoins();
    if (item.kind === 'station') this.host.refreshStation();
    this.dirty = true;
    this.select(null);
  }

  // ------------------------------------------------------------------ Bedienung
  private chooseTool(kind: Tool): void {
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
    this.saveBtn.visible = this.typeBtn.visible = this.rideBtn.visible = this.mode === 'build';
    this.applyActiveField();
    this.refreshLabels();
  }

  /** Testfahrt (Schritt 9): das gewählte Feld wird aktiv, der Editor wechselt ins Spielen, die Bahn fährt; Tab führt zurück */
  private testRide(): void {
    if (this.selectedFieldId) this.activeFieldId = this.selectedFieldId;
    if (this.mode === 'build') this.toggleMode();
    this.host.startRide();
  }

  /** Texteingabe über den Browser-Dialog (Editor am Mac); null, wenn abgebrochen oder nicht möglich */
  private ask(question: string, current: string): string | null {
    try {
      return window.prompt(question, current);
    } catch {
      return null;
    }
  }

  /** Feld geändert: Datei als geändert merken; ist es das aktive Feld, gelten Ziele und Stufen sofort */
  private commitField(field: ZoneField): void {
    this.dirty = true;
    if (field.id === this.activeFieldId) this.applyActiveField();
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

  /** Klick: Eintrag setzen (mit Werkzeug), Eintrag wählen, sonst ein Feld unter dem Zeiger; true = verbraucht */
  tap(p: Pt): boolean {
    if (!this.active || this.overHud(p)) return false;
    if (this.tool && this.tool !== 'field') {
      const w = this.worldAt(p, this.placeLane);
      const id = this.place(this.tool, w.x, w.y, this.placeLane);
      this.dirty = true;
      this.tool = null;
      this.selectField(null);
      this.select(id);
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

  /** neuen Eintrag eines Werkzeugs setzen; liefert seine Kennung */
  private place(tool: Exclude<Tool, 'field'>, x: number, y: number, z: number): string {
    const w = this.host.world;
    switch (tool) {
      case 'station': {
        const st = newStation(this.zone, x, y, z);
        this.zone.stations.push(st);
        w.addZoneBuilt(st.id, buildZoneStation(st), itemPosition(st));
        this.host.refreshStation();
        return st.id;
      }
      case 'queue': {
        const q = newQueue(this.zone, x, y, z);
        this.zone.queues.push(q);
        w.addZoneBuilt(q.id, buildZoneQueue(q), itemPosition(q));
        return q.id;
      }
      case 'site': {
        const b = newSite(this.zone, x, y, z);
        this.zone.sites.push(b);
        w.addZoneBuilt(b.id, buildZoneSite(b), itemPosition(b));
        return b.id;
      }
      case 'coins': {
        const c = newCoinGroup(this.zone, x, y, z);
        this.zone.coinGroups.push(c);
        w.addZoneBuilt(c.id, buildZoneCoins(c), itemPosition(c));
        this.host.refreshCoins();
        return c.id;
      }
      default: {
        const el = newElement(this.zone, tool, x, y, z);
        this.zone.elements.push(el);
        w.addZoneElement(el);
        return el.id;
      }
    }
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
    const item = id ? this.item(id) : null;
    if (!id || !item) return true;
    const pos = this.posOf(item);
    const w = this.worldAt(p, pos.z);
    this.drag = { id, dx: w.x - pos.x, dy: w.y - pos.y };
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
    const item = this.item(this.drag.id);
    if (!item) return true;
    const pos = this.posOf(item);
    const w = this.worldAt(p, pos.z);
    const x = round(w.x - this.drag.dx);
    const y = round(w.y - this.drag.dy);
    this.host.world.nudgeZoneElement(this.drag.id, x, y, pos.z);
    this.status.text = `${this.describeItem(item)} → x ${x} m · Höhe ${y} m`;
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
    const item = this.item(this.drag.id);
    if (item) {
      const pos = this.posOf(item);
      const w = this.worldAt(p, pos.z);
      this.moveItem(item, round(w.x - this.drag.dx), round(w.y - this.drag.dy), pos.z);
      this.commitItem(item);
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
      const lower = k.toLowerCase();
      if (lower === 'n') {
        const name = this.ask('Name des Felds', field.name ?? '');
        if (name === null) return true;
        if (name.trim()) field.name = name.trim().slice(0, 40);
        else delete field.name;
        this.commitField(field);
        return true;
      }
      if (lower === 'z') {
        // Ziele als Zeile „Typ Wert, Typ Wert“, Stern vor dem Typ = Bonusziel (Katalog v1: Zieltypen des Prüfers)
        const text = this.ask(`Ziele des Felds, mit Komma getrennt: Typ und Wert, Stern = Bonus. Typen: ${ZONE_GOAL_TYPES.join(', ')}`, formatGoals(field.goals ?? []));
        if (text === null) return true;
        const goals = parseGoals(text);
        if (goals.length) field.goals = goals;
        else delete field.goals;
        const dropped = text.split(/[,;\n]+/).filter((s) => s.trim()).length - goals.length;
        if (dropped > 0) this.host.toast.show(`${dropped} ${dropped === 1 ? 'Ziel' : 'Ziele'} nicht verstanden (Typ unbekannt)`, 2.5);
        this.commitField(field);
        return true;
      }
      if (lower === 'g') {
        // Fortschrittsstufe der Zone in diesem Level: alle Elemente → 0 → 1 → 2 → 3 → alle
        const next = field.stage === undefined ? 0 : field.stage + 1;
        if (next > 3) delete field.stage;
        else field.stage = next;
        this.commitField(field);
        return true;
      }
      if (lower === 'u') {
        // Aufwertung der Bahn, heute die Gurtstufe: wie die Welt → ohne → Beckengurt → Bügel → Schulterbügel → Rennsitz → wie die Welt
        const next = field.upgrade === undefined ? 0 : field.upgrade + 1;
        if (next > 4) delete field.upgrade;
        else field.upgrade = next;
        this.commitField(field);
        return true;
      }
      return false;
    }
    const item = this.selectedItem;
    if (!item) return false;
    if (k === 'Delete' || k === 'Backspace') {
      this.removeItem(item);
      return true;
    }
    const fineStep = ev.shiftKey;
    if (k === '[' || k === ']' || k === 'PageUp' || k === 'PageDown') {
      ev.preventDefault();
      const step = fineStep ? 0.1 : 0.5;
      const back = k === ']' || k === 'PageUp';
      const pos = this.posOf(item);
      this.moveItem(item, pos.x, pos.y, round(Math.max(-2.5, Math.min(2.5, pos.z + (back ? step : -step)))));
      this.commitItem(item);
      return true;
    }
    if (item.kind !== 'element') {
      const lower = k.toLowerCase();
      const arrow = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
      const vert = k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0;
      if (arrow || vert) ev.preventDefault();
      if (item.kind === 'station') {
        if (lower === 'd') item.st.dir = item.st.dir === 1 ? -1 : 1;
        else if (arrow) item.st.length = round(Math.max(6, item.st.length + arrow * 2));
        else return false;
      } else if (item.kind === 'queue') {
        if (lower === 'd') item.q.dir = item.q.dir === 1 ? -1 : 1;
        else if (arrow) item.q.x0 = round(Math.min(item.q.x1 - 2, item.q.x0 - arrow * 2));
        else return false;
      } else if (item.kind === 'site') {
        if (lower === 'v') item.b.variant = item.b.variant === 'connect' ? 'breakthrough' : 'connect';
        else if (vert) item.b.energy = round(Math.max(2, (item.b.energy ?? 10) + vert * 2));
        else return false;
      } else {
        if (lower === 'c') item.c.shape = COIN_SHAPES[(COIN_SHAPES.indexOf(item.c.shape) + 1) % COIN_SHAPES.length];
        else if (vert) item.c.count = Math.max(1, Math.min(40, item.c.count + vert));
        else if (arrow) item.c.spacing = round(Math.max(0.5, item.c.spacing + arrow * 0.5));
        else return false;
      }
      this.commitItem(item);
      return true;
    }
    const el = item.el;
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
    const arrow = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
    const vert = k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0;
    if ((arrow || vert) && ev.altKey) {
      // Alt+Pfeile: Öffnung verschieben (relativ zum Fuß; sie bleibt im Element), mit Shift fein
      ev.preventDefault();
      const o = el.openings?.[0];
      if (!o) {
        this.host.toast.show('Erst mit O eine Öffnung machen', 1.8);
        return true;
      }
      const step = ev.shiftKey ? 0.1 : 0.5;
      o.dx = round(Math.max(-el.w / 2 + o.r, Math.min(el.w / 2 - o.r, o.dx + arrow * step)));
      o.dy = round(Math.max(o.r, Math.min(Math.max(o.r, el.h - o.r), o.dy + vert * step)));
      this.commit(el);
      return true;
    }
    if ((k === '+' || k === '-') && el.openings?.[0]) {
      // Plus und Minus: Radius der Öffnung
      const o = el.openings[0];
      o.r = round(Math.max(0.8, Math.min(Math.min(el.w, el.h) / 2, o.r + (k === '+' ? 0.2 : -0.2))));
      this.commit(el);
      return true;
    }
    if (arrow && ev.shiftKey && el.d !== undefined) {
      // Shift+Pfeile links/rechts: Dicke, die Ausdehnung des Volumens in der Tiefe (Dreiteiler, Höhlenkasten, Wasser)
      ev.preventDefault();
      el.d = round(Math.max(0.5, Math.min(40, el.d + arrow * 0.5)));
      this.commit(el);
      return true;
    }
    if (arrow) {
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
    if (!this.selectedId) return;
    const b = this.host.world.zoneElementScreenBox(this.selectedId);
    if (!b) return;
    const pad = 4;
    g.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 4, color: 0x2a1f3d, alpha: 0.5 });
    g.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad).stroke({ width: 2, color: 0xffd23f });
    // Fundament: grüne Oberkante; Anker: Punkt am Fuß
    const el = this.selected;
    if (!el) return;
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
    if (el.openings?.length) meta.push(`Öffnung bei ${el.openings[0].dx} m / ${el.openings[0].dy} m hoch, r ${el.openings[0].r} m`);
    if (el.anchor) meta.push(`Anker ${ANCHOR_NAMES[el.anchor]}`);
    if (el.growth) meta.push(`ab Stufe ${el.growth}`);
    if (el.depthRole) meta.push(`Rolle ${ROLE_NAMES[el.depthRole]}`);
    return `${def?.label ?? el.kind} ${el.id} · x ${el.x} m · Höhe ${el.y} m · Spur ${el.z > 0 ? '+' : ''}${el.z} · ${size}${meta.length ? ' · ' + meta.join(' · ') : ''}`;
  }

  private describeItem(item: Item): string {
    switch (item.kind) {
      case 'element':
        return this.describe(item.el);
      case 'station':
        return `Station ${item.st.id} · x ${item.st.x} m · Höhe ${item.st.y} m · Spur ${item.st.z} · Richtung ${item.st.dir === 1 ? 'rechts' : 'links'} · Vorgabestück ${item.st.length} m`;
      case 'queue':
        return `Schlange ${item.q.id} · x ${item.q.x0} bis ${item.q.x1} m · Höhe ${item.q.y} m · Spur ${item.q.z} · Eingang ${item.q.dir === 1 ? 'rechts' : 'links'} · Freiraum 5 m`;
      case 'site':
        return `Baustelle ${item.b.id} · x ${item.b.x} m · Höhe ${item.b.y} m · Spur ${item.b.z} · ${item.b.variant === 'connect' ? 'Verbinden' : `Durchbruch ab ${item.b.energy ?? 10} m/s`}`;
      default:
        return `Coins ${item.c.id} · ${SHAPE_NAMES[item.c.shape]} · ${item.c.count} Stück im Abstand ${item.c.spacing} m · x ${item.c.x} m · Höhe ${item.c.y} m · Spur ${item.c.z}`;
    }
  }

  private describeField(f: ZoneField): string {
    const meta = [
      f.goals?.length ? `Ziele ${formatGoals(f.goals)}` : 'keine Ziele (Sandkasten)',
      f.stage === undefined ? 'Stufe: alle Elemente' : `Stufe ${f.stage}`,
      f.upgrade === undefined ? 'Gurt wie die Welt' : `Gurt: ${BELT_NAMES[f.upgrade] ?? f.upgrade}`,
    ];
    return `Feld ${f.id}${f.name ? ` „${f.name}“` : ''} · x ${f.x0} bis ${f.x1} m · Höhe ${f.y0} bis ${f.y1} m · ${meta.join(' · ')}${f.id === this.activeFieldId ? ' · aktiv' : ''}`;
  }

  private refreshLabels(): void {
    for (const p of this.palette) p.btn.setText(this.tool === p.kind ? `▸ ${p.label}` : p.label);
    this.modeBtn.setText(this.mode === 'build' ? 'Bauen ▸ Spielen' : 'Spielen ▸ Bauen');
    this.typeBtn.setText(`Bahn: ${TYPE_NAMES[this.zone.trackType]}`);
    this.saveBtn.setText(this.dirty ? 'Speichern •' : 'Speichern');
    const el = this.selected;
    const item = this.selectedItem;
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
      this.hint.text = `Ziehen verschiebt · Bild auf/ab (oder [ ]) Tiefe, Shift fein · Pfeile Breite und Höhe${el.d !== undefined ? ' · Shift+Pfeile links/rechts Dicke' : ''} · M Fundament · O Öffnung${el.openings?.length ? ' (Alt+Pfeile verschieben, + − Radius)' : ''} · A Anker · G Stufe · R Rolle · Entf löschen · Esc abwählen · Cmd+S speichern`;
    } else if (item) {
      this.status.text = this.describeItem(item);
      this.hint.text = item.kind === 'station' ? 'Ziehen verschiebt · Bild auf/ab Tiefe · D Richtung · Pfeile links/rechts Länge · Entf löschen'
        : item.kind === 'queue' ? 'Ziehen verschiebt · Bild auf/ab Tiefe · D Eingang · Pfeile links/rechts Länge · Entf löschen'
        : item.kind === 'site' ? 'Ziehen verschiebt · Bild auf/ab Tiefe · V Verbinden/Durchbruch · Pfeile auf/ab Tempo · Entf löschen'
        : 'Ziehen verschiebt · Bild auf/ab Tiefe · C Form · Pfeile auf/ab Zahl, links/rechts Abstand · Entf löschen';
    } else if (field) {
      this.status.text = this.describeField(field);
      this.hint.text = 'Enter aktiv schalten (im Spielen hält die Kamera das Feld, Absperrband an den Rändern) · N Name · Z Ziele · G Stufe · U Gurt · Testfahrt fährt im Feld · Entf löschen · Esc abwählen';
    } else {
      this.status.text = `Bauen · Zone ${this.zone.name} · ${this.zone.elements.length} Elemente · ${this.zone.fields.length} Felder · ${this.zone.stations.length} Stationen · ${this.zone.coinGroups.length} Coin-Gruppen · Spur für Neues: ${lane}`;
      this.hint.text = 'Typ links wählen, dann in die Welt klicken · Klick wählt Element oder Feld · T Bahntyp · Testfahrt fährt die Bahn · Tab Spielen';
    }
    this.status.visible = this.hint.visible = true;
    this.placeStatus();
  }

  /** Statuszeile und Hinweis setzen: unter die Zielleiste, wenn im Spielen Ziele des aktiven Felds oben stehen */
  private placeStatus(): void {
    const f = this.mode === 'play' && this.activeFieldId ? this.zone.fields.find((x) => x.id === this.activeFieldId) : undefined;
    this.status.y = this.statusTop + (f?.goals?.length ? (this.portrait ? 116 : 60) : 0);
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
    y += 34;
    this.rideBtn.position.set(x, y);
    this.statusTop = top + 62;
    this.portrait = h > w;
    this.status.x = this.hint.x = safe.left + 148;
    this.status.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    this.hint.style.wordWrapWidth = Math.max(240, w - safe.left - safe.right - 320);
    this.placeStatus();
  }
}
