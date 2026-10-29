/**
 * Oberfläche des Zonen-Editors (Stufe 1, Plan 4.2): HTML über dem Spielbild, so minimalistisch und ruhig wie möglich
 * (Florian, 27.10.2026): dunkle, halbdurchsichtige Flächen, wenige Knöpfe, Bedienfelder nur, solange sie gebraucht
 * werden. Links die Werkzeuge, rechts oben Ansicht und Kamera, rechts die Ebenen mit Vorschau, Abstandspillen und
 * Tiefenleiste, unten die Leiste der Auswahl. Platzhalter: das genaue Aussehen (Farben, Maße, Zeichen).
 *
 * Diese Datei baut nur Elemente und meldet Bedienungen über `UiActions`; was sie bedeuten, entscheidet der Editor.
 */
import { PLANE_ROLE_WORDS, PLANE_ROLES, type Material, type PlaneRole, type ZoneGroup, type ZonePlane, type ZoneShape, type ZoneSketch } from '@/zone/nodes';
import { MATERIAL_WORDS, MATERIALS } from '@/zone/dock';
import type { PathContext } from './pathTools';
import { VIEW_WORDS, type ViewMode } from './views';
import { COLOR_CSS, ColorMenu, type ColorMenuHost } from './colorMenu';
import { STACK_CSS, StackPanel, type StackActions, type StackView } from './stackPanel';

export type Tool = 'select' | 'direct' | 'lasso' | 'pen' | 'curve' | 'brush' | 'band' | 'knife' | 'rect' | 'ellipse' | 'arch' | 'gradient' | 'dotbrush' | 'pipette' | 'dock' | 'field';
export type Isolate = 'off' | 'front' | 'only';
export const ISOLATE_WORDS: Record<Isolate, string> = { off: 'alle Ebenen', front: 'davor ausgeblendet', only: 'nur diese' };

export interface UiActions extends StackActions {
  tool(t: Tool): void;
  /** Füllstapel der Auswahl (paint) oder Ebenenstapel der aktiven Ebene (plane) zeigen */
  stackOpen(which: 'paint' | 'plane'): void;
  view(v: ViewMode | 'side'): void;
  undo(): void;
  redo(): void;
  save(): void;
  toggleBuild(): void;
  addPlane(): void;
  /** Ebene in der Liste wählen: allein, dazu oder heraus (Befehlstaste, nach rechts wischen), bis hierher (Umschalt) */
  selectPlane(id: string, mode?: 'single' | 'toggle' | 'range'): void;
  /** Ebenen in der Liste verschieben: vor die Ebene before (null: ganz nach hinten), in die Gruppe group (null: keine) */
  movePlanes(ids: string[], before: string | null, group: string | null): void;
  /** Gruppen (wie Ordner in Photoshop): wählen, auf- und zuklappen, aus- und einblenden, sperren, umbenennen */
  selectGroup(id: string): void;
  toggleGroup(id: string, what: 'collapsed' | 'hidden' | 'locked'): void;
  renameGroup(id: string, name: string): void;
  /** gewählte Ebenen gruppieren, Gruppe auflösen, Gruppe samt Ebenen löschen */
  groupPlanes(): void;
  ungroup(): void;
  deleteGroup(): void;
  /** Zahlen der Auswahl (Plan 4.2 Grundsatz 1, „Zahlen nur auf Wunsch“): Mitte, Breite, Höhe in Metern, Drehen um Grad */
  numbers(field: 'x' | 'y' | 'w' | 'h' | 'angle', value: number, keepRatio: boolean): void;
  /** Formgruppen in einer Ebene (wie Illustrator): gruppieren, auflösen, aus der betretenen Gruppe heraus */
  shapeGroup(): void;
  shapeUngroup(): void;
  leaveGroup(): void;
  togglePlaneHidden(id: string): void;
  togglePlaneLocked(id: string): void;
  renamePlane(id: string, name: string): void;
  /** Abstandsgriff: Ziehen beginnt, ändert (Meter), endet */
  gapStart(frontId: string): void;
  gapChange(frontId: string, gap: number): void;
  gapEnd(): void;
  /** Tiefe einer Ebene (mit den anderen gewählten) allein schieben: Ziehen an der Tiefe in der Zeile */
  depthStart(id: string, group?: string): void;
  depthChange(id: string, z: number): void;
  depthEnd(): void;
  toggleHold(): void;
  /** Skizze der aktiven Ebene: Bild laden, Deckkraft weiterschalten, aus- und einblenden, anpassen, entfernen */
  sketchLoad(file: File): void;
  sketchOpacity(): void;
  sketchBlend(): void;
  sketchHide(): void;
  sketchAdjust(): void;
  sketchRemove(): void;
  /** Einrasten im Bild und Raster ein- und ausschalten */
  toggleSnap(): void;
  toggleGrid(): void;
  setRole(role: PlaneRole): void;
  setIsolate(i: Isolate): void;
  deletePlane(): void;
  /** „Weiter füllen“ nach dem Fallenlassen einer Farbe beenden */
  fillDone(): void;
  /** Material der Auswahl (Fläche oder Formen) oder der im Werkzeug Andockkanten angetippten Fläche */
  setMaterial(m: Material): void;
  /** Station auf einer Andockkante: setzen (dann eine Kante antippen), Richtung wechseln, entfernen */
  stationPlace(): void;
  stationFlip(): void;
  stationRemove(): void;
  /** Felder (Stufe 4): neues Feld aus dem Bildausschnitt, das gewählte umbenennen oder entfernen */
  fieldAdd(): void;
  fieldRename(): void;
  fieldRemove(): void;
  /** Verlaufswerkzeug: Art (Farbe, Deckkraft), linear oder radial, umkehren, Deckkraft des Stopps, Stopp löschen, Verlauf entfernen */
  gradKind(kind: 'gradient' | 'fade'): void;
  /** Punktpinsel (Stufe 5): Größe, Tonstufe, Wegnehmen */
  dotBrushSet(patch: Partial<{ size: number; tone: number; erase: boolean }>): void;
  gradRadial(radial: boolean): void;
  gradReverse(): void;
  gradStopAlpha(): void;
  gradStopDelete(): void;
  gradRemove(): void;
  /** Farbe fiel auf eine Fläche mit Verlauf: als Grundfarbe, als Verlaufsstopp oder doch nicht */
  dropChoice(which: 'base' | 'stop' | 'cancel'): void;
  duplicate(): void;
  orderShape(dir: 1 | -1): void;
  deleteShape(): void;
  flip(axis: 'x' | 'y'): void;
  /** gewählte Formen einer Ebene ausrichten und verteilen */
  align(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void;
  distribute(axis: 'x' | 'y'): void;
  /** Boolesche Operationen über die gewählten Formen einer Ebene, Vereinfachen */
  combine(op: 'unite' | 'minus' | 'intersect' | 'exclude'): void;
  simplify(): void;
  copy(): void;
  paste(): void;
  /** Zeichenstift: fertig (offen oder geschlossen), abbrechen */
  penDone(closed: boolean): void;
  penCancel(): void;
  /** Direktauswahl: Anker Ecke/Rund, Anker löschen, Loch oder Teilungslinie löschen, Fläche füllen (null = Loch) */
  anchorSmooth(): void;
  anchorDelete(): void;
  lineDelete(): void;
  faceFill(fill: string | null): void;
  exportSvg(scope: 'all' | 'plane'): void;
  lassoForm(form: 'lasso' | 'rect'): void;
  importSvg(file: File): void;
  tilt(deg: number): void;
  fov(deg: number): void;
  addProbe(): void;
  restore(): void;
  discardBackup(): void;
}

/** was die Leiste unten außer Auswahl und Werkzeug noch braucht */
export interface ContextExtra {
  /** in der Liste gewählte Ebenen-Gruppe */
  group?: ZoneGroup | null;
  /** Skizze der aktiven Ebene; wird sie gerade angepasst */
  sketch?: ZoneSketch | null;
  sketchEdit?: boolean;
  /** gewählte Formen nach Einheiten (Formgruppen) */
  units?: { units: number; groups: number; inside: boolean } | null;
  /** gemeinsamer Rahmen der gewählten Formen einer Ebene (Mitte, Breite, Höhe in Metern) */
  nums?: { x: number; y: number; w: number; h: number } | null;
  /** „Weiter füllen“ läuft (Farbe aufgelöst) */
  filling?: string | null;
  /** Verlaufswerkzeug: bearbeitete Art, ob es einen Verlauf gibt, radial, gewählter Stopp (Deckkraft), Stopps, Ziele */
  grad?: { kind: 'gradient' | 'fade'; has: boolean; radial: boolean; stop: { a: number } | null; stops: number; targets: number } | null;
  /** Farbe fiel auf eine Fläche mit Verlauf (Farbe aufgelöst) */
  dropChoice?: string | null;
  /** Punktpinsel: Durchmesser (Meter), Tonstufe 0–2, Wegnehmen */
  dotBrush?: { size: number; tone: number; erase: boolean } | null;
  /** Material der Auswahl (gemischt: null) */
  material?: Material | 'mixed' | null;
  /** Werkzeug Andockkanten: Zahl der Kanten, angetippte Fläche (Name, Material) */
  dock?: { edges: number; off: number; face: { name: string; material: Material } | null; station: { has: boolean; placing: boolean; ok: boolean } } | null;
  /** Werkzeug Felder: Zahl der Felder, das gewählte (Name, Breite, Höhe in Metern) */
  field?: { count: number; sel: { name: string; w: number; h: number } | null } | null;
}

export interface LayerRow {
  plane: ZonePlane;
  shapes: ZoneShape[];
  /** Abstand zur nächsten Ebene dahinter (Meter), null bei der hintersten */
  gap: number | null;
  /** Gruppe der Ebene oder null */
  group: ZoneGroup | null;
}

const CSS = `
.ze-root{position:fixed;inset:0;z-index:30;pointer-events:none;font:13px/1.3 -apple-system,BlinkMacSystemFont,"Helvetica Neue",system-ui,sans-serif;color:#e7e5e0;-webkit-font-smoothing:antialiased}
.ze-root *{box-sizing:border-box}
.ze-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.ze-outline{fill:none;stroke:#8db4ff;stroke-width:1.5}
.ze-box{fill:none;stroke:#8db4ff;stroke-width:1;stroke-dasharray:4 3;opacity:.9}
.ze-preview{fill:rgba(141,180,255,.12);stroke:#8db4ff;stroke-width:1.2}
.ze-handle{fill:#16181c;stroke:#8db4ff;stroke-width:1.5}
.ze-face{fill:rgba(141,180,255,.16);stroke:#8db4ff;stroke-width:1;stroke-dasharray:3 3}
.ze-line{fill:none;stroke:#8db4ff;stroke-width:1.5;stroke-linejoin:round}
.ze-stroke{fill:none;stroke:#e7e5e0;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.ze-tangent{fill:none;stroke:#8db4ff;stroke-width:1;opacity:.8}
.ze-anchor{fill:#16181c;stroke:#8db4ff;stroke-width:1.5}
.ze-anchor.on{fill:#8db4ff}
.ze-cp{fill:#16181c;stroke:#8db4ff;stroke-width:1.2}
.ze-grid{fill:none;stroke:rgba(255,255,255,.16);stroke-width:1}
.ze-snap{fill:none;stroke:#ffd27a;stroke-width:2}
.ze-region{fill:rgba(141,180,255,.08);stroke:#8db4ff;stroke-width:1;stroke-dasharray:4 3}
.ze-groupbox{fill:none;stroke:rgba(255,255,255,.7);stroke-width:1;stroke-dasharray:2 4}
.ze-target{fill:rgba(255,255,255,.14);stroke:#ffffff;stroke-width:2;stroke-dasharray:5 4}
.ze-loupe{stroke:#ffffff;stroke-width:4;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))}
.ze-dock{fill:none;stroke:#7fe08a;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.ze-dock.off{stroke:rgba(255,255,255,.55);stroke-width:2;stroke-dasharray:4 5}
.ze-hatch{stroke:none}
.ze-station{fill:rgba(255,170,70,.35);stroke:#ffaa46;stroke-width:2}
.ze-field{fill:none;stroke:rgba(255,255,255,.75);stroke-width:1.5;stroke-dasharray:7 5;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))}
.ze-field.on{stroke:#ffd166;stroke-width:2.5;stroke-dasharray:none;fill:rgba(255,209,102,.06)}
.ze-frame{fill:none;stroke:rgba(255,209,102,.8);stroke-width:1.2;stroke-dasharray:2 4}
.ze-flabel{font:600 12px system-ui,sans-serif;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px}
.ze-gline-under{stroke:rgba(0,0,0,.55);stroke-width:4;stroke-linecap:round}
.ze-gline{stroke:#ffffff;stroke-width:1.6;stroke-linecap:round}
.ze-gcircle{fill:none;stroke:#ffffff;stroke-width:1;stroke-dasharray:4 4;opacity:.8}
.ze-gstart{fill:#ffffff;stroke:#16181c;stroke-width:2}
.ze-gend{fill:#16181c;stroke:#ffffff;stroke-width:2}
.ze-gmid{fill:#ffffff;stroke:#16181c;stroke-width:1}
.ze-gstop{stroke:#ffffff;stroke-width:2;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.ze-gstop.on{stroke:#8db4ff;stroke-width:3}
.ze-panel{position:absolute;pointer-events:auto;background:rgba(22,24,28,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.07);border-radius:12px;touch-action:none;user-select:none;-webkit-user-select:none}
.ze-btn{appearance:none;border:0;background:transparent;color:inherit;font:inherit;min-width:36px;height:36px;padding:0 10px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.ze-btn:hover{background:rgba(255,255,255,.06)}
.ze-btn.on{background:rgba(255,255,255,.13)}
.ze-btn:disabled{opacity:.35;cursor:default}
.ze-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6}
@media (pointer:coarse){.ze-btn{min-width:44px;height:44px}.ze-stats{top:calc(env(safe-area-inset-top,0px) + 70px)}.ze-toast{bottom:calc(env(safe-area-inset-bottom,0px) + 76px)}}
.ze-top{left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:2px;padding:4px}
.ze-zone{padding:0 8px 0 6px;color:#bdbab3}
.ze-dot{width:7px;height:7px;border-radius:50%;background:#7fc69a;margin-right:4px}
.ze-dot.dirty{background:#e0b25c}
.ze-stats{position:absolute;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 62px);color:rgba(231,229,224,.55);font-size:11px;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.35);pointer-events:none}
.ze-sep{width:1px;height:22px;background:rgba(255,255,255,.08);margin:0 4px}
.ze-views{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:2px;padding:4px}
.ze-cam{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);width:250px;padding:10px 12px;display:none}
@media (pointer:coarse){.ze-cam{top:calc(env(safe-area-inset-top,0px) + 72px)}}
.ze-cam.open{display:block}
.ze-slider{display:grid;grid-template-columns:70px 1fr 38px;align-items:center;gap:8px;height:34px}
.ze-track{position:relative;height:28px;touch-action:none;cursor:pointer}
.ze-track::before{content:"";position:absolute;left:0;right:0;top:13px;height:2px;border-radius:1px;background:rgba(255,255,255,.18)}
.ze-knob{position:absolute;top:5px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#e7e5e0}
.ze-val{text-align:right;color:#bdbab3;font-variant-numeric:tabular-nums}
.ze-tools{left:calc(env(safe-area-inset-left,0px) + 12px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:2px;padding:4px}
.ze-layers{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:264px;display:flex;flex-direction:column;padding:6px}
@media (pointer:coarse){.ze-layers{top:calc(env(safe-area-inset-top,0px) + 72px);width:280px}}
.ze-layers.camopen{top:calc(env(safe-area-inset-top,0px) + 196px)}
.ze-head{display:flex;align-items:center;gap:2px;padding:0 0 4px 8px}
.ze-head .ze-title{flex:1;color:#bdbab3;cursor:pointer;white-space:nowrap}
.ze-layers.collapsed{bottom:auto}
.ze-layers.collapsed .ze-list,.ze-layers.collapsed .ze-foot{display:none}
.ze-hold{font-size:11px;color:#bdbab3}
.ze-list{flex:1;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-right:2px}
.ze-row{display:flex;align-items:center;gap:6px;height:40px;padding:0 4px 0 6px;border-radius:8px;cursor:pointer}
@media (pointer:coarse){.ze-row{height:46px}}
.ze-row.on{background:rgba(255,255,255,.11)}
.ze-row.sel{background:rgba(141,180,255,.1)}
.ze-row.lift{opacity:.45}
.ze-text{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px}
.ze-meta{display:flex;align-items:center;gap:6px;min-width:0}
.ze-z{font-size:11px;color:#bdbab3;padding:0 6px;border-radius:7px;background:rgba(255,255,255,.06);cursor:ew-resize;touch-action:none;font-variant-numeric:tabular-nums;white-space:nowrap}
.ze-z.drag{background:rgba(141,180,255,.25);color:#fff}
.ze-z input{width:48px;font:inherit;color:inherit;background:transparent;border:0;user-select:text;-webkit-user-select:text}
.ze-drop{height:2px;margin:-1px 6px;border-radius:1px;background:#8db4ff}
.ze-drop.in{margin-left:22px}
.ze-row.ze-member{padding-left:14px}
.ze-row.dim{opacity:.5}
.ze-row.ze-ghead .ze-name{font-weight:600}
.ze-gap.ze-member{padding-left:14px}
.ze-fold{width:30px;height:28px;flex:none;display:flex;align-items:center;justify-content:center;color:#bdbab3;touch-action:none;cursor:grab}
.ze-fold svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.5}
.ze-row .ze-btn.ze-disc{min-width:18px;width:18px;padding:0;opacity:.8;margin-left:-4px}
.ze-row canvas{width:48px;height:28px;border-radius:4px;background:rgba(255,255,255,.04);flex:none;touch-action:none;cursor:grab}
.ze-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ze-name input{width:100%;font:inherit;color:inherit;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 5px;user-select:text;-webkit-user-select:text}
.ze-role{color:#8f8c86;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ze-row .ze-btn{min-width:30px;height:30px;padding:0;opacity:.55}
.ze-row .ze-btn.on{background:transparent;opacity:1}
.ze-gap{display:flex;justify-content:center;height:18px;align-items:center}
.ze-pill{font-size:11px;color:#bdbab3;padding:1px 9px;border-radius:9px;background:rgba(255,255,255,.06);cursor:ns-resize;touch-action:none;font-variant-numeric:tabular-nums}
@media (pointer:coarse){.ze-gap{height:24px}.ze-pill{padding:3px 12px}}
.ze-pill.drag{background:rgba(141,180,255,.25);color:#fff}
.ze-num{display:flex;align-items:center;gap:5px;margin:0 3px;color:rgba(231,229,224,.6)}
.ze-num input{width:62px;font:inherit;color:#e7e5e0;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:5px 6px;text-align:right;user-select:text;-webkit-user-select:text}
@media (pointer:coarse){.ze-num input{width:70px;padding:9px 6px}}
.ze-pill input{width:56px;font:inherit;color:inherit;background:transparent;border:0;text-align:center;user-select:text;-webkit-user-select:text}
.ze-foot{display:flex;gap:2px;padding-top:4px;border-top:1px solid rgba(255,255,255,.06);margin-top:4px}
.ze-foot .ze-btn{font-size:11px;color:#8f8c86;height:30px;padding:0 7px}
.ze-context{left:calc(env(safe-area-inset-left,0px) + 64px);right:calc(env(safe-area-inset-right,0px) + 290px);margin:0 auto;width:max-content;max-width:calc(100vw - 354px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:none;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px;padding:4px}
@media (pointer:coarse){.ze-context{right:calc(env(safe-area-inset-right,0px) + 306px);max-width:calc(100vw - 370px)}}
.ze-context.show{display:flex}
.ze-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;margin:0 2px;cursor:pointer;flex:none}
@media (pointer:coarse){.ze-swatch{width:30px;height:30px}}
.ze-swatch.on{border-color:#e7e5e0}
.ze-label{color:#8f8c86;font-size:11px;padding:0 6px 0 8px}
.ze-toast{left:calc(env(safe-area-inset-left,0px) + 12px);bottom:calc(env(safe-area-inset-bottom,0px) + 66px);max-width:min(560px,calc(100vw - 32px));padding:9px 12px;opacity:0;transition:opacity .25s;pointer-events:none}
.ze-toast.show{opacity:1}
.ze-phone{left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);width:min(460px,calc(100vw - 24px));padding:6px 8px 10px;display:none;z-index:4}
.ze-phone.open{display:block}
.ze-phrow{display:flex;align-items:center;gap:6px;padding:4px 2px 4px 8px}
.ze-phrow code{flex:1;min-width:0;font:12px ui-monospace,Menlo,monospace;color:#e7e5e0;user-select:all;-webkit-user-select:all;word-break:break-all}
.ze-phint{color:#8f8c86;font-size:11px;padding:4px 8px 0}
.ze-banner{left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);display:none;align-items:center;gap:4px;padding:4px 4px 4px 12px}
.ze-banner.show{display:flex}
@media (max-width:820px){.ze-views{top:calc(env(safe-area-inset-top,0px) + 64px)}.ze-cam{top:calc(env(safe-area-inset-top,0px) + 116px)}.ze-layers{top:calc(env(safe-area-inset-top,0px) + 116px);width:min(264px,44vw)}.ze-layers.camopen{top:calc(env(safe-area-inset-top,0px) + 248px)}}
@media (max-width:820px) and (pointer:coarse){.ze-views{top:calc(env(safe-area-inset-top,0px) + 72px)}.ze-cam{top:calc(env(safe-area-inset-top,0px) + 132px)}.ze-layers{top:calc(env(safe-area-inset-top,0px) + 132px)}}
@media (max-width:700px){.ze-role{display:none}.ze-row canvas{width:36px}.ze-hold{font-size:10px;padding:0 4px}.ze-toast{bottom:calc(env(safe-area-inset-bottom,0px) + 132px)}.ze-layers{bottom:calc(env(safe-area-inset-bottom,0px) + 128px)}.ze-context{left:calc(env(safe-area-inset-left,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);max-width:none;width:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 8px)}.ze-stats{display:none}}
.ze-root.play .ze-tools,.ze-root.play .ze-layers,.ze-root.play .ze-context,.ze-root.play .ze-cam,.ze-root.play .ze-top,.ze-root.play .ze-overlay,.ze-root.play .ze-viewbtn,.ze-root.play .ze-stats{display:none}
`;

const ICONS: Record<Tool, string> = {
  select: '<svg viewBox="0 0 24 24"><path d="M6 3l12 9-5.5 1.2L15 20l-2.6 1-2.6-6.6L6 18z" fill="currentColor"/></svg>',
  direct: '<svg viewBox="0 0 24 24"><path d="M6 3l12 9-5.5 1.2L15 20l-2.6 1-2.6-6.6L6 18z"/></svg>',
  lasso: '<svg viewBox="0 0 24 24"><path d="M7 16c-3-1.5-4-4-2.5-6.5C7 5 15 4 18.5 7s1 8-5 9c-2 .3-4 .2-5.5-.3" stroke-dasharray="2.5 2"/><path d="M7 16c-1 1.5-.5 3 1 4"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M12 3l6 9-6 9-6-9z"/><path d="M12 3v7"/><circle cx="12" cy="12" r="1.6"/></svg>',
  curve: '<svg viewBox="0 0 24 24"><path d="M3 17c4-10 8 4 12-6 1.5-3.5 4-4 6-4"/><circle cx="3" cy="17" r="1.6"/><circle cx="12" cy="11" r="1.6"/><circle cx="21" cy="7" r="1.6"/></svg>',
  band: '<svg viewBox="0 0 24 24"><path d="M3 18C6 8 18 8 21 18"/><path d="M6.5 18C9 12 15 12 17.5 18" stroke-dasharray="2 2"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M4 17c2-6 6-1 8-6s6-6 8-4"/><path d="M4 20h7"/></svg>',
  knife: '<svg viewBox="0 0 24 24"><path d="M4 20L18 4c1.5 2 1.5 5-1 8l-6 6"/><path d="M11 13l2 2"/></svg>',
  rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8.5" ry="6"/></svg>',
  arch: '<svg viewBox="0 0 24 24"><path d="M5.5 20v-8.5a6.5 6.5 0 0 1 13 0V20z"/></svg>',
  gradient: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 15l10-6"/><circle cx="7" cy="15" r="1.8" fill="#16181c"/><circle cx="17" cy="9" r="1.8" fill="currentColor"/></svg>',
  dotbrush: '<svg viewBox="0 0 24 24"><circle cx="5" cy="17" r="1.8" fill="currentColor"/><circle cx="9.5" cy="13.5" r="1.8" fill="currentColor"/><circle cx="14" cy="11" r="1.8" fill="currentColor"/><circle cx="18.5" cy="9.5" r="1.8" fill="currentColor"/><circle cx="12" cy="18" r="1.2"/></svg>',
  pipette: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5M13 6l5 5-9 9H4v-5z"/><path d="M16.5 2.5a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L19 10"/></svg>',
  dock: '<svg viewBox="0 0 24 24"><path d="M3 13c3-3 6-4 9-4s6 1 9 4" stroke-width="2.4"/><path d="M5 21l2-6M12 21v-8M19 21l-2-6" stroke-width="1.4"/></svg>',
  field: '<svg viewBox="0 0 24 24"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4" stroke-width="2"/><rect x="7" y="8" width="10" height="8" rx="1" stroke-width="1.2" stroke-dasharray="2 2"/></svg>',
};
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1C11 6 11.5 6 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.4-1"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5H11L9 5H4.5A1.5 1.5 0 0 0 3 6.5z"/></svg>';
const MAGNET = '<svg viewBox="0 0 24 24"><path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/></svg>';
const GRID = '<svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/></svg>';
const UNDO = '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12"/></svg>';
const REDO = '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12"/></svg>';

const FLIP_X = '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M9 7L3 17h6z"/><path d="M15 7l6 10h-6z" fill="currentColor"/></svg>';
const ALIGN: Array<[mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom', title: string, icon: string]> = [
  ['left', 'Links ausrichten', '<svg viewBox="0 0 24 24"><path d="M4 3v18"/><rect x="6" y="6" width="12" height="4" rx="1"/><rect x="6" y="14" width="7" height="4" rx="1"/></svg>'],
  ['hcenter', 'Waagrecht mittig', '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/></svg>'],
  ['right', 'Rechts ausrichten', '<svg viewBox="0 0 24 24"><path d="M20 3v18"/><rect x="6" y="6" width="12" height="4" rx="1"/><rect x="11" y="14" width="7" height="4" rx="1"/></svg>'],
  ['top', 'Oben ausrichten', '<svg viewBox="0 0 24 24"><path d="M3 4h18"/><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="6" width="4" height="7" rx="1"/></svg>'],
  ['vcenter', 'Senkrecht mittig', '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/></svg>'],
  ['bottom', 'Unten ausrichten', '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="11" width="4" height="7" rx="1"/></svg>'],
];
const COMBINE: Array<[op: 'unite' | 'minus' | 'intersect' | 'exclude', title: string, icon: string]> = [
  ['unite', 'Vereinen', '<svg viewBox="0 0 24 24"><path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor" stroke="none"/></svg>'],
  ['minus', 'Vordere abziehen (von der hintersten)', '<svg viewBox="0 0 24 24"><path d="M4 4h10v6h-4v4H4z" fill="currentColor" stroke="none"/><path d="M10 10h10v10H10z"/></svg>'],
  ['intersect', 'Schnittmenge', '<svg viewBox="0 0 24 24"><path d="M4 4h10v10H4zM10 10h10v10H10z"/><path d="M10 10h4v4h-4z" fill="currentColor" stroke="none"/></svg>'],
  ['exclude', 'Überlappung ausschließen', '<svg viewBox="0 0 24 24"><path d="M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z" fill="currentColor" stroke="none"/></svg>'],
];
const DIST_X = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/></svg>';
const DIST_Y = '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="4" rx="1"/><rect x="5" y="10" width="14" height="4" rx="1"/><rect x="8" y="17" width="8" height="4" rx="1"/></svg>';
const FORWARD = '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="11" height="11" rx="1"/><rect x="9" y="4" width="11" height="11" rx="1" fill="currentColor"/></svg>';
const BACKWARD = '<svg viewBox="0 0 24 24"><rect x="9" y="4" width="11" height="11" rx="1" fill="currentColor"/><rect x="4" y="9" width="11" height="11" rx="1" fill="#2c2f33"/></svg>';
const CHAIN = '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
const FLIP_Y = '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><path d="M7 9L17 3v6z"/><path d="M7 15l10 6v-6z" fill="currentColor"/></svg>';

const TOOL_TITLES: Record<Tool, string> = {
  select: 'Auswahl (V)',
  direct: 'Direktauswahl (A): Punkte, Griffe und Flächen; Umschalt nimmt dazu, aus dem Leeren ziehen wählt im Rechteck',
  lasso: 'Lasso (Q): freihand oder als Rechteck überall im Bild, wählt Punkte in den gewählten Ebenen',
  pen: 'Zeichenstift (P): tippen gibt eine Ecke, ziehen eine Kurve; Befehlstaste verschiebt, Wahltaste: Ankerpunkt-Werkzeug',
  curve: 'Kurvenstift (Shift+P): jedes Tippen ein Punkt, die Kurve läuft glatt hindurch; doppelt tippen: Ecke oder Rund',
  band: 'Band (O): auf eine Kante der Form drücken und nach innen ziehen, gibt ein Band als eigene Fläche',
  brush: 'Formpinsel (B): freihand, wird eine glatte Kurve',
  knife: 'Messer (K): quer durch eine Form ziehen',
  rect: 'Rechteck (M)',
  ellipse: 'Ellipse (L)',
  arch: 'Bogen (U wechselt Rechteck, Ellipse, Bogen): Portalform, unten gerade, oben rund',
  gradient: 'Verlauf (G): über eine Fläche ziehen; Enden, Stopps und Mitten am Objekt ziehen, auf die Linie tippen gibt einen Stopp',
  dotbrush: 'Punktpinsel (E): über eine Form ziehen setzt Punkte dicht an dicht wie Earles Reihen entlang von Graten; mit Wahltaste oder „Wegnehmen“ Punkte entfernen, auch aus der Punktkrone',
  pipette: 'Pipette (I): Farbe aus dem Bild aufnehmen; am iPad auch mit dem Finger lange halten',
  dock: 'Andockkanten (D): grüne Oberkanten tragen Bahn und Stützen; eine Kante antippen schaltet ihr Stück aus und an, eine Fläche antippen zeigt ihr Material (Schraffur: fest dicht, grabbar weit, luftig gepunktet)',
  field: 'Felder (R): Spielbereich mit Kamerabegrenzung; ein Feld antippen, Ecken und Kanten ziehen, innen verschieben; die Rahmen zeigen, was das Handy quer und hoch höchstens sieht',
};
const TOOL_ORDER: readonly Tool[] = ['select', 'direct', 'lasso', 'pen', 'curve', 'brush', 'band', 'knife', 'rect', 'ellipse', 'arch', 'gradient', 'dotbrush', 'pipette', 'dock', 'field'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function button(label: string, title: string, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `ze-btn ${cls}`.trim(), label);
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

const fmt = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

/** schmaler Regler ohne <input type=range> (auf dem iPad mit touch-action: none zuverlässiger, wie im Kamera-Panel) */
class Slider {
  readonly el = el('div', 'ze-slider');
  private readonly track = el('div', 'ze-track');
  private readonly knob = el('div', 'ze-knob');
  private readonly value = el('span', 'ze-val');

  constructor(
    label: string,
    private readonly min: number,
    private readonly max: number,
    private readonly onChange: (v: number) => void,
  ) {
    this.el.append(el('span', 'ze-label', label), this.track, this.value);
    this.track.append(this.knob);
    const at = (e: PointerEvent) => {
      const r = this.track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.onChange(Math.round((this.min + t * (this.max - this.min)) * 2) / 2);
    };
    this.track.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.track.setPointerCapture(e.pointerId);
      at(e);
    });
    this.track.addEventListener('pointermove', (e) => {
      if (this.track.hasPointerCapture(e.pointerId)) at(e);
    });
  }

  set(v: number): void {
    this.knob.style.left = `${((v - this.min) / (this.max - this.min)) * 100}%`;
    this.value.textContent = `${fmt(v, 0)}°`;
  }
}

export class EditorUi {
  readonly root = el('div', 'ze-root');
  private readonly top = el('div', 'ze-panel ze-top');
  private readonly dot = el('span', 'ze-dot');
  private readonly stats = el('span', 'ze-stats');
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly snapBtn: HTMLButtonElement;
  private readonly gridBtn: HTMLButtonElement;
  private readonly views = el('div', 'ze-panel ze-views');
  private readonly viewBtns = new Map<ViewMode | 'side', HTMLButtonElement>();
  private readonly camBtn: HTMLButtonElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly cam = el('div', 'ze-panel ze-cam');
  private readonly tiltSlider: Slider;
  private readonly fovSlider: Slider;
  private readonly tools = el('div', 'ze-panel ze-tools');
  private readonly toolBtns = new Map<Tool, HTMLButtonElement>();
  private readonly layers = el('div', 'ze-panel ze-layers');
  private readonly holdBtn: HTMLButtonElement;
  private readonly list = el('div', 'ze-list');
  private readonly context = el('div', 'ze-panel ze-context');
  private readonly toastEl = el('div', 'ze-panel ze-toast');
  private readonly banner = el('div', 'ze-panel ze-banner');
  private readonly bannerText = el('span');
  private toastTimer = 0;

  /**
   * freier Bildbereich zwischen den Leisten (Bildschirm-Pixel): rechts von den Werkzeugen, links von der Ebenenliste,
   * unter Kopf- und Ansichtsleiste, über der Leiste unten (ausgeblendete Leisten zählen nicht)
   */
  freeRect(width: number, height: number): { x0: number; y0: number; x1: number; y1: number } {
    const box = (e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' ? r : null;
    };
    const t = box(this.tools);
    const l = box(this.layers);
    const heads = [box(this.top), box(this.views)].filter((r): r is DOMRect => !!r);
    const c = box(this.context);
    return {
      x0: t ? t.right + 12 : 0,
      x1: l ? l.left - 12 : width,
      y0: heads.length ? Math.max(...heads.map((r) => r.bottom)) + 12 : 0,
      y1: c ? c.top - 12 : height,
    };
  }
  /** Zeile, deren Name gerade bearbeitet wird (dann nicht neu aufbauen) */
  private editing: string | null = null;
  /** gerade gezogene Abstandspille, Tiefe oder Zeile (dann nur Zahlen nachführen) */
  private dragging = false;
  /** Tiefe und Auswahl je Ebene beim letzten Nachführen (für Ziehen und Eingabe) */
  private depths = new Map<string, number>();
  private selectedPlanes = new Set<string>();
  /** Zeile oder Gruppe, die gerade gezogen wird (Umordnen), mit der Einfügemarke und dem Ziel */
  private rowDrag: { ids: string[]; group: string | null; mark: HTMLElement; before: string | null; into: string | null } | null = null;
  /** nach Wischen oder Ziehen kommt noch ein click; den schlucken */
  private swallowClick = false;
  /** Leiste unten zeigt für mehrere Formen die Knöpfe zum Ausrichten oder Verbinden, für die Ebene die der Skizze */
  private sub: 'align' | 'combine' | 'sketch' | 'numbers' | 'roles' | 'material' | null = null;
  /** Breite und Höhe in den Zahlen gemeinsam ändern */
  private keepRatio = false;
  /** Bildauswahl für Skizzen */
  private readonly sketchFile = el('input');
  private thumbs = new Map<string, HTMLCanvasElement>();
  /** Farbknopf und Farbmenü, Füllstapel (Stufe 3) */
  private readonly colors: ColorMenu;
  private readonly stack: StackPanel;
  /** Handy-Link (Stufe 4): Adresse der Zone im WLAN */
  private readonly phone = el('div', 'ze-panel ze-phone');
  private isDirty = false;

  constructor(
    private readonly a: UiActions,
    zoneName: string,
    overlay: SVGSVGElement,
    colorHost: ColorMenuHost,
  ) {
    const style = el('style');
    style.textContent = CSS + COLOR_CSS + STACK_CSS;
    this.root.append(style, overlay);
    this.colors = new ColorMenu(colorHost);
    this.stack = new StackPanel(a);
    this.colors.onOpen = () => {
      if (this.cam.classList.contains('open')) this.toggleCam();
    };

    // oben links: Zone, Sicherungsstand, Rückgängig, Sichern, Messwerte
    this.undoBtn = button(UNDO, 'Rückgängig (Cmd+Z, zwei Finger tippen)', () => a.undo());
    this.redoBtn = button(REDO, 'Wiederholen (Shift+Cmd+Z, drei Finger tippen)', () => a.redo());
    const name = el('span', 'ze-zone');
    name.append(this.dot, document.createTextNode(zoneName));
    this.snapBtn = button(MAGNET, 'Einrasten an Ankern und Kanten, auch über Ebenen so, wie es im Bild aussieht', () => a.toggleSnap());
    this.gridBtn = button(GRID, 'Raster der aktiven Ebene (Punkte rasten daran ein)', () => a.toggleGrid());
    this.top.append(name, button('Sichern', 'Sichern (Cmd+S)', () => a.save()), el('span', 'ze-sep'), this.undoBtn, this.redoBtn, el('span', 'ze-sep'), this.snapBtn, this.gridBtn, el('span', 'ze-sep'), button('Handy', 'Am Handy spielen: Adresse im WLAN (mit Bildrate)', () => void this.togglePhone(zoneName)));

    // oben rechts: Ansichten, Kamera, Spielen
    for (const v of ['game', 'front', 'free', 'side'] as const) {
      const b = button(VIEW_WORDS[v], `${VIEW_WORDS[v]} (${['game', 'front', 'free', 'side'].indexOf(v) + 1})`, () => a.view(v), 'ze-viewbtn');
      this.viewBtns.set(v, b);
      this.views.append(b);
    }
    this.camBtn = button('Kamera', 'Neigung und Bildwinkel des Spielblicks', () => this.toggleCam(), 'ze-viewbtn');
    this.modeBtn = button('Spielen', 'Bauen oder Spielen (Tab)', () => a.toggleBuild());
    this.views.append(el('span', 'ze-sep ze-viewbtn'), this.camBtn, this.modeBtn, this.colors.button);
    this.tiltSlider = new Slider('Neigung', 1, 45, (v) => a.tilt(v));
    this.fovSlider = new Slider('Bildwinkel', 5, 50, (v) => a.fov(v));
    this.cam.append(this.tiltSlider.el, this.fovSlider.el);

    // links: Werkzeuge
    for (const t of TOOL_ORDER) {
      const b = button(ICONS[t], TOOL_TITLES[t], () => a.tool(t));
      this.toolBtns.set(t, b);
      this.tools.append(b);
    }

    // rechts: Ebenen
    const head = el('div', 'ze-head');
    this.holdBtn = button('Bild halten', '„Bild halten“: Abstand ändern, ohne dass sich das Bild im Spielblick ändert; sonst „Welt halten“', () => a.toggleHold(), 'ze-hold');
    const title = el('span', 'ze-title', 'Ebenen ▾');
    title.title = 'Liste ein- und ausklappen';
    title.addEventListener('click', () => {
      const c = this.layers.classList.toggle('collapsed');
      title.textContent = c ? 'Ebenen ▸' : 'Ebenen ▾';
    });
    head.append(title, this.holdBtn, button('+', 'Neue Ebene hinter der aktiven', () => a.addPlane()));
    const foot = el('div', 'ze-foot');
    const file = el('input');
    file.type = 'file';
    file.accept = '.svg,image/svg+xml';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) a.importSvg(f);
      file.value = '';
    });
    this.sketchFile.type = 'file';
    this.sketchFile.accept = 'image/png,image/jpeg,image/webp';
    this.sketchFile.style.display = 'none';
    this.sketchFile.addEventListener('change', () => {
      const f = this.sketchFile.files?.[0];
      if (f) a.sketchLoad(f);
      this.sketchFile.value = '';
    });
    this.root.append(this.sketchFile);
    foot.append(
      button('Probe-Stapel', '32 Ebenen aus der Kamerasession einfügen (Last für die Handy-Messung)', () => a.addProbe()),
      button('SVG laden', 'SVG aus Illustrator laden: Gruppen p… ersetzen ihre Ebene, andere Gruppen werden neue Ebenen', () => file.click()),
      button('SVG sichern', 'Alle sichtbaren Ebenen als SVG, je Ebene eine Gruppe von hinten nach vorn', () => a.exportSvg('all')),
      file,
    );
    this.layers.append(head, this.list, foot);

    this.banner.append(this.bannerText, button('Wiederherstellen', '', () => a.restore()), button('Verwerfen', '', () => a.discardBackup()));
    this.root.append(this.top, this.views, this.cam, this.colors.panel, this.phone, this.tools, this.layers, this.stack.el, this.context, this.toastEl, this.banner, this.stats);
    document.body.append(this.root);
    // Klicks auf die Bedienfelder gehen nicht ins Spiel
    for (const p of [this.top, this.views, this.cam, this.phone, this.tools, this.layers, this.context, this.banner]) p.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /**
   * Handy-Link: die Zone im Spiel (mit Bildrate, ?dev=1) unter der Adresse des Macs im WLAN; über HTTP mit der IP (der
   * Dev-Server lässt den Rechnernamen dort nicht zu), über HTTPS mit dem Namen (das Zertifikat gilt für ihn)
   */
  private async togglePhone(zone: string): Promise<void> {
    if (this.phone.classList.toggle('open') === false) return;
    let ips: string[] = [];
    try {
      ips = ((await (await fetch('/__lan')).json()) as { ips?: string[] }).ips ?? [];
    } catch {
      /* gebaut oder ohne Dev-Server */
    }
    const host = location.protocol === 'https:' || !ips.length ? [location.hostname] : ips;
    const urls = host.map((h) => `${location.protocol}//${h}${location.port ? `:${location.port}` : ''}${location.pathname}?zone=${encodeURIComponent(zone)}&dev=1`);
    this.phone.replaceChildren();
    const head = el('div', 'ze-shead');
    head.append(el('span', 'ze-title', 'Am Handy spielen'), button('Schließen', '', () => this.phone.classList.remove('open')));
    this.phone.append(head);
    // zweiter Link: dieselbe Zone mit der Earle-Messung (Stufe 5, src/world/earleMessung.ts)
    for (const u of [...urls, ...urls.map((x) => `${x}&earle=messen`)]) {
      const row = el('div', 'ze-phrow');
      const code = el('code', '', u);
      row.append(
        code,
        button('Kopieren', 'Adresse kopieren', () => {
          void navigator.clipboard?.writeText(u).then(
            () => this.toast('Adresse kopiert'),
            () => this.toast('Kopieren ging nicht; die Adresse markieren und kopieren'),
          );
        }),
      );
      this.phone.append(row);
    }
    this.phone.append(
      el(
        'div',
        'ze-phint',
        `${this.isDirty ? 'Erst sichern: das Handy lädt die Zonendatei, Ungesichertes sieht es nicht. ' : ''}Handy im selben WLAN; oben links zeigt das Spiel die Bildrate${location.protocol === 'https:' ? ' (über HTTPS braucht das Handy das Zertifikat-Profil wie das iPad)' : ''}. Mit „&earle=messen“ misst das Handy, was die Ebenen mit und ohne Earle-Schichten je Bild kosten (rund eine Minute, nichts wird gesichert).`,
      ),
    );
  }

  private toggleCam(): void {
    const open = !this.cam.classList.contains('open');
    if (open && this.colors.open) this.colors.toggle(false);
    this.cam.classList.toggle('open', open);
    this.layers.classList.toggle('camopen', open);
    this.camBtn.classList.toggle('on', open);
  }

  /** Füllstapel zeigen (null: verbergen) */
  setStack(view: StackView | null): void {
    this.stack.set(view);
    this.placeStack();
  }

  /** Füllstapel über die Leiste unten legen, auch wenn sie zweizeilig umbricht */
  private placeStack(): void {
    if (!this.stack.el.classList.contains('show')) return;
    const bar = this.context.getBoundingClientRect();
    this.stack.el.style.bottom = bar.height ? `${Math.round(window.innerHeight - bar.top + 8)}px` : '';
  }

  /** Farbknopf und offenes Farbmenü nachführen */
  colorRefresh(): void {
    this.colors.refresh();
  }

  get colorOpen(): boolean {
    return this.colors.open;
  }

  closeColor(): void {
    this.colors.toggle(false);
  }

  setBuilding(on: boolean): void {
    this.root.classList.toggle('play', !on);
    if (!on && this.colors.open) this.colors.toggle(false);
    this.modeBtn.textContent = on ? 'Spielen' : 'Bauen';
  }

  setTool(t: Tool): void {
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
  }

  setView(v: ViewMode | 'side'): void {
    for (const [k, b] of this.viewBtns) b.classList.toggle('on', k === v);
  }

  setCamera(tilt: number, fov: number): void {
    this.tiltSlider.set(tilt);
    this.fovSlider.set(fov);
  }

  setSnap(snap: boolean, grid: boolean): void {
    this.snapBtn.classList.toggle('on', snap);
    this.gridBtn.classList.toggle('on', grid);
  }

  setHold(on: boolean): void {
    this.holdBtn.textContent = on ? 'Bild halten' : 'Welt halten';
  }

  setTop(dirty: boolean, canUndo: boolean, canRedo: boolean, stats: string): void {
    this.isDirty = dirty;
    this.dot.classList.toggle('dirty', dirty);
    this.dot.title = dirty ? 'Ungesicherte Änderungen' : 'Gesichert';
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
    if (this.stats.textContent !== stats) this.stats.textContent = stats;
  }

  /** freier Teil des Bildes zwischen Werkzeugleiste und Ebenenliste (Bildschirm-Bildpunkte) */
  freeSpan(): { left: number; right: number } {
    const t = this.tools.getBoundingClientRect();
    const l = this.layers.getBoundingClientRect();
    return { left: t.width ? t.right : 0, right: l.width ? l.left : window.innerWidth };
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.placeToast();
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    // lange Meldungen (etwa nach dem Laden einer SVG) bleiben länger stehen
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), Math.max(2600, msg.length * 55));
  }

  /** Meldung über die Leiste unten, auch wenn sie zweizeilig umbricht */
  private placeToast(): void {
    const bar = this.context.getBoundingClientRect();
    this.toastEl.style.bottom = bar.height ? `${Math.round(window.innerHeight - bar.top + 8)}px` : '';
  }

  showBanner(text: string | null): void {
    this.bannerText.textContent = text ?? '';
    this.banner.classList.toggle('show', !!text);
  }

  /** Vorschaubild einer Ebene (Canvas der Zeile); null, solange die Zeile nicht existiert */
  thumb(planeId: string): HTMLCanvasElement | null {
    return this.thumbs.get(planeId) ?? null;
  }

  /**
   * Ebenenliste von vorn nach hinten mit Abstandspillen; je Zeile der Name und darunter die Tiefe (ziehen schiebt nur
   * diese Ebene, mit den anderen gewählten; tippen gibt eine Zahl) und die Rolle. Gruppen stehen als Ordnerzeile vor
   * ihren Ebenen (eingerückt, zuklappbar). Neu aufgebaut wird nur, wenn sich Ebenen, Gruppen, Namen, Rollen oder
   * Schalter ändern; Auswahl, Tiefen und Abstände werden an Ort und Stelle nachgeführt (sonst käme ein Doppeltippen nie an)
   */
  setLayers(rows: LayerRow[], activeId: string | null, selected: readonly string[] = [], groupSel: string | null = null): void {
    const gkey = (g: ZoneGroup | null) => (g ? `${g.id}:${g.name}:${g.collapsed ? 1 : 0}${g.hidden ? 1 : 0}${g.locked ? 1 : 0}` : '');
    const structure = rows.map((r) => `${r.plane.id}|${r.plane.name}|${r.plane.role}|${r.plane.hidden ? 1 : 0}|${r.plane.locked ? 1 : 0}|${r.gap === null ? '-' : '+'}|${gkey(r.group)}`).join(';');
    this.depths = new Map(rows.map((r) => [r.plane.id, r.plane.z]));
    this.selectedPlanes = new Set(selected);
    const mark = () => {
      for (const r of rows) {
        const pill = this.list.querySelector<HTMLElement>(`[data-gap="${r.plane.id}"]`);
        if (pill && r.gap !== null && !pill.querySelector('input')) pill.textContent = `${fmt(r.gap)} m`;
        for (const z of this.list.querySelectorAll<HTMLElement>(`[data-z="${r.plane.id}"]`)) if (!z.querySelector('input')) z.textContent = `${fmt(r.plane.z)} m`;
        const row = this.list.querySelector(`[data-row="${r.plane.id}"]`);
        row?.classList.toggle('on', r.plane.id === activeId && !groupSel);
        row?.classList.toggle('sel', (r.plane.id !== activeId || !!groupSel) && this.selectedPlanes.has(r.plane.id));
      }
      for (const h of this.list.querySelectorAll<HTMLElement>('[data-ghead]')) h.classList.toggle('on', h.dataset.ghead === groupSel);
    };
    if (this.dragging || this.editing || structure === this.structure) {
      mark();
      if (structure === this.structure || this.dragging) this.gaps = new Map(rows.map((r) => [r.plane.id, r.gap ?? 0]));
      return;
    }
    this.structure = structure;
    this.gaps = new Map(rows.map((r) => [r.plane.id, r.gap ?? 0]));
    const scroll = this.list.scrollTop;
    this.list.replaceChildren();
    const keep = new Map<string, HTMLCanvasElement>();
    rows.forEach((r, i) => {
      const p = r.plane;
      const g = r.group;
      const first = !!g && rows[i - 1]?.group?.id !== g.id;
      const last = !!g && rows[i + 1]?.group?.id !== g.id;
      if (first && g) this.list.append(this.groupRow(g, rows.filter((x) => x.group?.id === g.id).map((x) => x.plane)));
      if (g?.collapsed) {
        // zugeklappt: nur der Abstand nach der letzten Ebene der Gruppe
        if (last && r.gap !== null) this.list.append(this.gapPill(p.id));
        return;
      }
      const row = el('div', `ze-row${g ? ' ze-member' : ''}${g?.hidden ? ' dim' : ''}`);
      row.dataset.row = p.id;
      row.dataset.group = g?.id ?? '';
      const thumb = this.thumbs.get(p.id) ?? el('canvas');
      thumb.width = 96;
      thumb.height = 56;
      thumb.title = 'Ziehen: Ebene in der Liste verschieben (die Tiefe folgt), auch in eine Gruppe hinein oder heraus';
      keep.set(p.id, thumb);
      const name = el('span', 'ze-name');
      name.textContent = p.name;
      name.title = 'Doppelt tippen zum Umbenennen';
      this.doubleTap(name, p.id, () => this.rename(name, p.name, (v) => this.a.renamePlane(p.id, v), () => this.a.selectPlane(p.id)));
      const meta = el('div', 'ze-meta');
      meta.append(this.depthChip(p.id, p.z), el('span', 'ze-role', PLANE_ROLE_WORDS[p.role]));
      const text = el('div', 'ze-text');
      text.append(name, meta);
      const eye = button(p.hidden ? EYE_OFF : EYE, p.hidden ? 'Einblenden' : 'Ausblenden', () => this.a.togglePlaneHidden(p.id), p.hidden ? '' : 'on');
      const lock = button(LOCK, p.locked ? 'Entsperren' : 'Sperren', () => this.a.togglePlaneLocked(p.id), p.locked ? 'on' : '');
      row.append(thumb, text, eye, lock);
      row.addEventListener('click', (e) => {
        if (this.swallowClick) {
          this.swallowClick = false;
          return;
        }
        this.a.selectPlane(p.id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single');
      });
      this.rowGestures(row, thumb, { ids: [p.id], group: null, swipe: p.id });
      this.list.append(row);
      if (r.gap !== null) {
        const pill = this.gapPill(p.id);
        if (g && !last) pill.classList.add('ze-member');
        this.list.append(pill);
      }
    });
    this.thumbs = keep;
    this.list.scrollTop = scroll;
    mark();
  }

  /** Ordnerzeile einer Gruppe: aufklappen, Name (doppelt tippen: umbenennen), Tiefe der vordersten Ebene, Augen, Schloss */
  private groupRow(g: ZoneGroup, members: ZonePlane[]): HTMLElement {
    const row = el('div', `ze-row ze-ghead${g.hidden ? ' dim' : ''}`);
    row.dataset.ghead = g.id;
    row.dataset.first = members[0]?.id ?? '';
    row.dataset.collapsed = g.collapsed ? '1' : '';
    const disc = button(g.collapsed ? '▸' : '▾', g.collapsed ? 'Aufklappen' : 'Zuklappen', () => this.a.toggleGroup(g.id, 'collapsed'), 'ze-disc');
    const fold = el('span', 'ze-fold', FOLDER);
    fold.title = 'Ziehen: die ganze Gruppe in der Liste verschieben';
    const name = el('span', 'ze-name');
    name.textContent = g.name;
    name.title = 'Doppelt tippen zum Umbenennen';
    this.doubleTap(name, g.id, () => this.rename(name, g.name, (v) => this.a.renameGroup(g.id, v), () => this.a.selectGroup(g.id)));
    const meta = el('div', 'ze-meta');
    if (members[0]) meta.append(this.depthChip(members[0].id, members[0].z, g.id));
    meta.append(el('span', 'ze-role', `${members.length} ${members.length === 1 ? 'Ebene' : 'Ebenen'}`));
    const text = el('div', 'ze-text');
    text.append(name, meta);
    const eye = button(g.hidden ? EYE_OFF : EYE, g.hidden ? 'Gruppe einblenden' : 'Gruppe ausblenden', () => this.a.toggleGroup(g.id, 'hidden'), g.hidden ? '' : 'on');
    const lock = button(LOCK, g.locked ? 'Gruppe entsperren' : 'Gruppe sperren', () => this.a.toggleGroup(g.id, 'locked'), g.locked ? 'on' : '');
    row.append(disc, fold, text, eye, lock);
    row.addEventListener('click', () => {
      if (this.swallowClick) {
        this.swallowClick = false;
        return;
      }
      this.a.selectGroup(g.id);
    });
    this.rowGestures(row, fold, { ids: members.map((m) => m.id), group: g.id, swipe: null });
    return row;
  }

  /** eigenes Doppeltippen: Safari auf dem iPad meldet dblclick bei touch-action: none nicht zuverlässig */
  private doubleTap(elm: HTMLElement, id: string, fn: () => void): void {
    elm.addEventListener('click', (e) => {
      const now = performance.now();
      if (this.lastNameTap.id === id && now - this.lastNameTap.t < 380) {
        e.stopPropagation();
        this.lastNameTap = { id: '', t: 0 };
        fn();
        return;
      }
      this.lastNameTap = { id, t: now };
    });
  }

  /**
   * Gesten auf einer Zeile: nach rechts wischen (Finger, wie in Procreate) nimmt die Ebene in die Auswahl oder heraus;
   * Ziehen verschiebt sie (oder die ganze Gruppe) in der Liste (Maus überall, Finger und Pencil am Vorschaubild bzw.
   * Ordner, sonst rollt die Liste)
   */
  private rowGestures(row: HTMLElement, handle: HTMLElement, what: { ids: string[]; group: string | null; swipe: string | null }): void {
    let st: { x: number; y: number; pointerId: number; touch: boolean; grip: boolean; mode: 'none' | 'swipe' | 'drag' } | null = null;
    row.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.ze-btn, .ze-z, input')) return;
      const grip = handle.contains(e.target as Node);
      st = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', grip, mode: 'none' };
      if (!st.touch || grip) row.setPointerCapture(e.pointerId);
    });
    row.addEventListener('pointermove', (e) => {
      if (!st || st.pointerId !== e.pointerId) return;
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (st.mode === 'none') {
        if (what.swipe && st.touch && !st.grip && dx > 28 && Math.abs(dy) < 18) {
          st.mode = 'swipe';
          this.swallowClick = true;
          this.a.selectPlane(what.swipe, 'toggle');
          return;
        }
        if ((!st.touch || st.grip) && Math.abs(dy) > 6) {
          st.mode = 'drag';
          this.beginRowDrag(what);
        }
      }
      if (st.mode === 'drag') this.moveRowDrag(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (!st || st.pointerId !== e.pointerId) return;
      const mode = st.mode;
      st = null;
      if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
      if (mode === 'drag') {
        this.swallowClick = true;
        this.endRowDrag(e.type === 'pointerup');
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  }

  private beginRowDrag(what: { ids: string[]; group: string | null }): void {
    let ids = what.ids;
    // eine gewählte Ebene zieht alle gewählten mit (eine Gruppe immer nur sich)
    if (!what.group && ids.length === 1 && this.selectedPlanes.has(ids[0]) && this.selectedPlanes.size > 1) {
      const order = [...this.list.querySelectorAll<HTMLElement>('[data-row]')].map((r) => r.dataset.row!);
      ids = order.filter((x) => this.selectedPlanes.has(x));
    }
    for (const x of ids) this.list.querySelector(`[data-row="${x}"]`)?.classList.add('lift');
    if (what.group) this.list.querySelector(`[data-ghead="${what.group}"]`)?.classList.add('lift');
    this.rowDrag = { ids, group: what.group, mark: el('div', 'ze-drop'), before: null, into: null };
    this.dragging = true;
  }

  /**
   * Einfügemarke vor die erste Zeile, deren Mitte unter dem Zeiger liegt; am Rand der Liste rollt sie mit. Ziel: vor einer
   * Ebene einer Gruppe heißt in die Gruppe; direkt nach der letzten Ebene einer Gruppe entscheidet die Einrückung
   * (Zeiger rechts der Ordner-Spalte: noch in die Gruppe); eine Gruppe kommt nie in eine andere
   */
  private moveRowDrag(clientX: number, clientY: number): void {
    const d = this.rowDrag;
    if (!d) return;
    const box = this.list.getBoundingClientRect();
    if (clientY < box.top + 24) this.list.scrollTop -= 8;
    if (clientY > box.bottom - 24) this.list.scrollTop += 8;
    const rows = [...this.list.querySelectorAll<HTMLElement>('.ze-row')];
    let k = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return clientY < b.top + b.height / 2;
    });
    if (k < 0) k = rows.length;
    let target: HTMLElement | null = rows[k] ?? null;
    const prev = rows[k - 1] ?? null;
    const groupOfRow = (r: HTMLElement | null): string | null => (r ? r.dataset.group || r.dataset.ghead || null : null);
    const planeOfRow = (r: HTMLElement | null): string | null => (r ? (r.dataset.row ?? r.dataset.first ?? null) : null);
    let into: string | null = null;
    if (d.group) {
      // eine Gruppe: nie in eine andere, also vor deren Ordnerzeile
      const tg = target?.dataset.group;
      if (tg && tg !== d.group) target = this.list.querySelector<HTMLElement>(`[data-ghead="${tg}"]`);
      into = d.group;
    } else if (target?.dataset.row && target.dataset.group) into = target.dataset.group;
    else {
      const pg = prev && !prev.dataset.ghead ? groupOfRow(prev) : prev?.dataset.collapsed ? prev.dataset.ghead! : null;
      if (pg && clientX > box.left + 40) into = pg;
    }
    const anchor = target?.previousElementSibling?.classList.contains('ze-gap') ? target.previousElementSibling : target;
    if (anchor) this.list.insertBefore(d.mark, anchor);
    else this.list.append(d.mark);
    d.mark.classList.toggle('in', !!into && !d.group);
    d.before = planeOfRow(target);
    d.into = into;
  }

  private endRowDrag(drop: boolean): void {
    const d = this.rowDrag;
    this.rowDrag = null;
    this.dragging = false;
    if (!d) return;
    d.mark.remove();
    for (const r of this.list.querySelectorAll('.ze-row.lift')) r.classList.remove('lift');
    // die Liste wird mit der neuen Reihenfolge neu aufgebaut
    this.structure = '';
    if (drop && !d.ids.includes(d.before ?? '')) this.a.movePlanes(d.ids, d.before, d.into);
  }

  /** Tiefe in der Zeile: waagrecht ziehen schiebt die Ebene (und die anderen gewählten) allein, tippen gibt eine Zahl */
  private depthChip(id: string, z0: number, group?: string): HTMLElement {
    const chip = el('span', 'ze-z');
    chip.dataset.z = id;
    chip.textContent = `${fmt(z0)} m`;
    chip.title = group ? 'Tiefe der Gruppe (ihrer vordersten Ebene): waagrecht ziehen schiebt die ganze Gruppe' : 'Tiefe: waagrecht ziehen schiebt nur diese Ebene (und die anderen gewählten), tippen für eine Zahl';
    let start: { x: number; z: number; moved: boolean } | null = null;
    chip.addEventListener('pointerdown', (e) => {
      if (chip.querySelector('input')) return;
      e.stopPropagation();
      e.preventDefault();
      chip.setPointerCapture(e.pointerId);
      start = { x: e.clientX, z: this.depths.get(id) ?? z0, moved: false };
    });
    chip.addEventListener('pointermove', (e) => {
      if (!start || !chip.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - start.x;
      if (!start.moved && Math.abs(dx) < 3) return;
      if (!start.moved) {
        start.moved = true;
        this.dragging = true;
        chip.classList.add('drag');
        this.a.depthStart(id, group);
      }
      // 5 cm je Bildpunkt, mit Umschalt 1 cm
      this.a.depthChange(id, start.z + dx * (e.shiftKey ? 0.01 : 0.05));
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      if (chip.hasPointerCapture(e.pointerId)) chip.releasePointerCapture(e.pointerId);
      if (moved) {
        this.dragging = false;
        chip.classList.remove('drag');
        this.a.depthEnd();
      } else if (e.type === 'pointerup') this.editDepth(chip, id, group);
    };
    chip.addEventListener('pointerup', end);
    chip.addEventListener('pointercancel', end);
    chip.addEventListener('click', (e) => e.stopPropagation());
    return chip;
  }

  private editDepth(chip: HTMLElement, id: string, group?: string): void {
    this.editing = id;
    const z = this.depths.get(id) ?? 0;
    const input = el('input');
    input.inputMode = 'decimal';
    input.value = fmt(z);
    chip.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const done = (ok: boolean) => {
      if (this.editing !== id) return;
      this.editing = null;
      chip.textContent = `${fmt(z)} m`;
      const v = Number(input.value.replace(',', '.').replace(/[^\d.-]/g, ''));
      if (ok && Number.isFinite(v) && v !== z) {
        this.a.depthStart(id, group);
        this.a.depthChange(id, v);
        this.a.depthEnd();
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  /** Bauplan der Liste beim letzten Aufbau */
  private structure = '';
  /** Inhalt der Leiste unten beim letzten Aufbau */
  private contextKey = '-';
  /** aktuelle Abstände je vorderer Ebene (die Pillen lesen sie beim Aufsetzen) */
  private gaps = new Map<string, number>();
  private lastNameTap = { id: '', t: 0 };

  /** Name in der Zeile bearbeiten (Ebene oder Gruppe); Eingabe übernimmt, Esc bricht ab */
  private rename(span: HTMLElement, current: string, commit: (v: string) => void, cancel: () => void): void {
    const key = `name:${current}:${performance.now()}`;
    this.editing = key;
    const input = el('input');
    input.value = current;
    span.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const done = (ok: boolean) => {
      if (this.editing !== key) return;
      this.editing = null;
      // die Zeile wird mit dem neuen Namen ohnehin neu aufgebaut; bei Abbruch den alten Namen zurück
      this.structure = '';
      if (ok && input.value.trim()) commit(input.value.trim().slice(0, 60));
      else cancel();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  /** Pille zwischen zwei Ebenen: senkrecht ziehen ändert den Abstand (alles dahinter rückt mit), Tippen gibt eine Zahl ein */
  private gapPill(frontId: string): HTMLElement {
    const wrap = el('div', 'ze-gap');
    const pill = el('span', 'ze-pill');
    pill.dataset.gap = frontId;
    pill.textContent = `${fmt(this.gaps.get(frontId) ?? 0)} m`;
    pill.title = 'Ziehen: Abstand zur Ebene dahinter (alles dahinter rückt mit); Tippen: Zahl eingeben';
    let start: { y: number; gap: number; moved: boolean } | null = null;
    pill.addEventListener('pointerdown', (e) => {
      if (pill.querySelector('input')) return;
      e.stopPropagation();
      e.preventDefault();
      pill.setPointerCapture(e.pointerId);
      start = { y: e.clientY, gap: this.gaps.get(frontId) ?? 1, moved: false };
    });
    pill.addEventListener('pointermove', (e) => {
      if (!start || !pill.hasPointerCapture(e.pointerId)) return;
      const dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dy) < 4) return;
      if (!start.moved) {
        start.moved = true;
        this.dragging = true;
        pill.classList.add('drag');
        this.a.gapStart(frontId);
      }
      // nach unten größer; gleichmäßig über alle Größenordnungen (×2 je 120 px), mit Shift feiner
      const k = e.shiftKey ? 600 : 120;
      this.a.gapChange(frontId, Math.max(0.1, start.gap * Math.pow(2, dy / k)));
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      if (pill.hasPointerCapture(e.pointerId)) pill.releasePointerCapture(e.pointerId);
      if (moved) {
        this.dragging = false;
        pill.classList.remove('drag');
        this.a.gapEnd();
      } else this.editGap(pill, frontId, this.gaps.get(frontId) ?? 1);
    };
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
    wrap.append(pill);
    return wrap;
  }

  private editGap(pill: HTMLElement, frontId: string, gap: number): void {
    this.editing = frontId;
    const input = el('input');
    input.inputMode = 'decimal';
    input.value = fmt(gap);
    pill.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const done = (ok: boolean) => {
      if (this.editing !== frontId) return;
      this.editing = null;
      pill.textContent = `${fmt(gap)} m`;
      const v = Number(input.value.replace(',', '.').replace(/[^\d.]/g, ''));
      if (ok && Number.isFinite(v) && v > 0) {
        this.a.gapStart(frontId);
        this.a.gapChange(frontId, v);
        this.a.gapEnd();
      } else this.a.selectPlane(frontId);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  /**
   * Leiste unten: beim Zeichnen Fertig und Abbrechen, für gewählte Anker, das Lasso oder eine Fläche deren Befehle, für
   * gewählte Formen Farbe und Reihenfolge, sonst für die gewählten Ebenen Rolle und Isolieren
   */
  setContext(planes: readonly ZonePlane[], shapes: readonly ZoneShape[], isolate: Isolate, path: PathContext | null = null, canPaste = false, extra: ContextExtra = {}): void {
    const { group = null, sketch = null, sketchEdit = false, units = null, nums = null, filling = null, grad = null, dropChoice = null, material = null, dock = null, field = null, dotBrush = null } = extra;
    const plane = planes.at(-1) ?? null;
    const shape = shapes.at(-1) ?? null;
    // nur neu aufbauen, wenn sich der Inhalt ändert: sonst verschwände ein Knopf zwischen Aufsetzen und Abheben
    const pk = !path ? '' : path.kind === 'pen' ? `pen|${path.count}|${path.into}` : path.kind === 'anchor' ? `a|${path.shape.id}|${path.count}|${path.smooth}|${path.line}` : path.kind === 'face' ? `f|${path.shape.id}|${path.fill}` : path.kind === 'band' ? `b|${path.shape}` : `l|${path.form}|${path.count}|${path.smooth}`;
    const gi = units ?? { units: shapes.length, groups: 0, inside: false };
    const numKey = this.sub === 'numbers' && nums ? `${[nums.x, nums.y, nums.w, nums.h].map((v) => v.toFixed(2)).join(',')}|${this.keepRatio}` : `${!!nums}`;
    const key = dropChoice ? `drop|${dropChoice}` : filling ? `fill|${filling}` : grad ? `grad|${JSON.stringify(grad)}` : dotBrush ? `dots|${JSON.stringify(dotBrush)}` : dock ? `dock|${JSON.stringify(dock)}|${this.sub}` : field ? `field|${JSON.stringify(field)}` : path ? `${pk}|${material}|${this.sub}` : shape ? `s|${shapes.map((s) => `${s.id}:${s.fill}`).join(',')}|${shape.name}|${gi.units}:${gi.groups}:${gi.inside}|${this.sub}|${numKey}` : plane ? `p|${planes.map((p) => `${p.id}:${p.role}`).join(',')}|${plane.name}|${isolate}|${canPaste}|${group ? `${group.id}:${group.name}` : ''}|${sketch ? `${sketch.id}:${sketch.opacity}:${sketch.blend ?? ''}:${sketch.hidden ? 1 : 0}` : ''}|${sketchEdit}|${this.sub}` : '';
    if (key === this.contextKey) return;
    this.contextKey = key;
    this.context.replaceChildren();
    const anchorButtons = (smooth: boolean, count: number) => {
      this.context.append(
        button('Ecke', 'Ecke ohne Griffe', () => !smooth || this.a.anchorSmooth(), smooth ? '' : 'on'),
        button('Rund', 'Rund mit Griffen', () => smooth || this.a.anchorSmooth(), smooth ? 'on' : ''),
        el('span', 'ze-sep'),
        button(count > 1 ? 'Punkte löschen' : 'Punkt löschen', 'Löschen (Entf)', () => this.a.anchorDelete()),
      );
    };
    if (dropChoice) {
      const dot = el('span', 'ze-swatch');
      dot.style.background = dropChoice;
      this.context.append(
        dot,
        el('span', 'ze-label', 'Die Fläche hat einen Verlauf:'),
        button('Grundfarbe', 'Die Grundfarbe unter dem Verlauf ersetzen', () => this.a.dropChoice('base')),
        button('Als Verlaufsstopp', 'Dort, wo die Farbe fiel, einen Stopp mit dieser Farbe in den Verlauf setzen', () => this.a.dropChoice('stop')),
        button('Abbrechen', 'Nichts ändern (Esc)', () => this.a.dropChoice('cancel')),
      );
    } else if (field) {
      // Werkzeug Felder: das gewählte mit Maßen, sonst ein Hinweis; anlegen immer, umbenennen und entfernen am gewählten
      if (field.sel) this.context.append(el('span', 'ze-label', `${field.sel.name} · ${Math.round(field.sel.w)} × ${Math.round(field.sel.h)} m · Rahmen: quer und hoch auf dem Handy`));
      else this.context.append(el('span', 'ze-label', field.count ? 'Ein Feld antippen: Ecken und Kanten ziehen, innen verschieben' : 'Kein Feld: „Feld anlegen“ rahmt den Bildausschnitt'));
      this.context.append(el('span', 'ze-sep'), button('Feld anlegen', 'Neues Feld aus dem Bildausschnitt', () => this.a.fieldAdd()));
      if (field.sel) this.context.append(button('Umbenennen', 'Name des Felds', () => this.a.fieldRename()), button('Feld entfernen', 'Das gewählte Feld löschen', () => this.a.fieldRemove()));
    } else if (dock) {
      // Werkzeug Andockkanten: Zahlen, und für die angetippte Fläche ihr Material
      if (dock.station.placing) {
        this.context.append(el('span', 'ze-label', 'Station: eine Andockkante antippen, dort beginnt der Bahnsteig'), button('Abbrechen', 'Station nicht setzen', () => this.a.stationPlace(), 'on'));
        this.context.classList.add('show');
        return;
      }
      this.context.append(el('span', 'ze-label', dock.edges ? `${dock.edges} Andockkanten${dock.off ? `, ${dock.off} aus` : ''}: antippen schaltet ein Stück aus und an` : 'Keine Andockkanten: Ebenen mit Rolle „spielbar“ und feste oder grabbare Flächen haben Oberkanten'));
      this.context.append(el('span', 'ze-sep'));
      if (dock.station.has) {
        if (!dock.station.ok) this.context.append(el('span', 'ze-label', 'Station ohne Kante'));
        this.context.append(
          button('Station versetzen', 'Station auf eine andere Andockkante setzen', () => this.a.stationPlace()),
          button('Richtung ⇄', 'Fahrtrichtung der Station wechseln', () => this.a.stationFlip()),
          button('Station entfernen', 'Station aus der Zone nehmen', () => this.a.stationRemove()),
        );
      } else if (dock.edges) this.context.append(button('Station setzen', 'Bahnhof mit Vorgabestück auf eine Andockkante setzen (zum Spielen im Editor)', () => this.a.stationPlace()));
      if (dock.face) {
        this.context.append(el('span', 'ze-sep'), el('span', 'ze-label', dock.face.name));
        for (const m of MATERIALS) this.context.append(button(MATERIAL_WORDS[m], `Material: ${MATERIAL_WORDS[m]}`, () => this.a.setMaterial(m), dock.face.material === m ? 'on' : ''));
      }
    } else if (dotBrush) {
      const TONES = ['dunkel', 'mittel', 'hell'];
      this.context.append(
        el('span', 'ze-label', dotBrush.erase ? 'Punktpinsel: über Punkte ziehen nimmt sie weg' : `Punktpinsel: ${Math.round(dotBrush.size * 100)} cm, Ton ${TONES[dotBrush.tone]}`),
        button('Kleiner', 'Kleinere Punkte', () => this.a.dotBrushSet({ size: Math.max(0.05, Math.round(dotBrush.size * 80) / 100) })),
        button('Größer', 'Größere Punkte', () => this.a.dotBrushSet({ size: Math.min(3, Math.round(dotBrush.size * 125) / 100) })),
        button(`Ton ${TONES[dotBrush.tone]}`, 'Tonstufe der gesetzten Punkte weiterschalten (hell, mittel, dunkel wie in der Punktkrone)', () => this.a.dotBrushSet({ tone: (dotBrush.tone + 2) % 3 })),
        el('span', 'ze-sep'),
        button('Wegnehmen', 'Punkte wegnehmen statt setzen (auch Punkte der Punktkrone); mit Wahltaste geht es auch kurz', () => this.a.dotBrushSet({ erase: !dotBrush.erase }), dotBrush.erase ? 'on' : ''),
      );
    } else if (grad) {
      const word = grad.kind === 'fade' ? 'Deckkraftverlauf' : 'Verlauf';
      if (!grad.targets) this.context.append(el('span', 'ze-label', 'Verlauf: über eine Fläche ziehen; über gewählte Formen gezogen bekommen alle einen gemeinsamen'));
      else this.context.append(el('span', 'ze-label', grad.has ? `${word}${grad.targets > 1 ? ` · ${grad.targets} Formen` : ''}` : `${word}: über die Fläche ziehen`));
      this.context.append(
        button('Farbe', 'Farbverlauf bearbeiten', () => this.a.gradKind('gradient'), grad.kind === 'gradient' ? 'on' : ''),
        button('Deckkraft', 'Deckkraftverlauf: die Fläche läuft durchsichtig aus (Nebel, Licht, weiche Übergänge)', () => this.a.gradKind('fade'), grad.kind === 'fade' ? 'on' : ''),
      );
      if (grad.has) {
        this.context.append(
          el('span', 'ze-sep'),
          button('Linear', 'Linearer Verlauf', () => this.a.gradRadial(false), grad.radial ? '' : 'on'),
          button('Radial', 'Kreisförmig um den Anfang', () => this.a.gradRadial(true), grad.radial ? 'on' : ''),
          button('Umkehren', 'Stopps in umgekehrter Reihenfolge', () => this.a.gradReverse()),
        );
        if (grad.stop) {
          this.context.append(el('span', 'ze-sep'), button(`Stopp ${Math.round(grad.stop.a * 100)} %`, 'Deckkraft des gewählten Stopps weiterschalten (100, 75, 50, 25, 0 %); seine Farbe kommt aus dem Farbmenü', () => this.a.gradStopAlpha()));
          if (grad.stops > 2) this.context.append(button('Stopp löschen', 'Gewählten Stopp entfernen (oder von der Linie wegziehen)', () => this.a.gradStopDelete()));
        }
        this.context.append(el('span', 'ze-sep'), button('Entfernen', `${word} von der Fläche nehmen`, () => this.a.gradRemove()));
      }
    } else if (filling) {
      const dot = el('span', 'ze-swatch');
      dot.style.background = filling;
      this.context.append(
        dot,
        el('span', 'ze-label', 'Weiter füllen: weitere Flächen antippen oder überstreichen'),
        button('Fertig', 'Weiter füllen beenden (Esc)', () => this.a.fillDone()),
      );
    } else if (path?.kind === 'pen') {
      this.context.append(el('span', 'ze-label', `Zeichenstift · ${path.count} ${path.count === 1 ? 'Punkt' : 'Punkte'}${path.into ? ` in ${path.into}` : ''}`));
      if (path.into && path.count >= 3) this.context.append(button('Schließen', 'Als geschlossenen Ring in die Form (oder auf den ersten Punkt tippen)', () => this.a.penDone(true)));
      this.context.append(
        button('Fertig', path.into ? 'Als Teilungslinie in die Form (Eingabe, oder auf den letzten Punkt tippen)' : 'Form schließen (Eingabe)', () => this.a.penDone(false)),
        button('Abbrechen', 'Verwerfen', () => this.a.penCancel()),
      );
    } else if (path?.kind === 'anchor') {
      this.context.append(el('span', 'ze-label', path.count > 1 ? `${path.count} Punkte` : `${path.shape.name} · Punkt`));
      anchorButtons(path.smooth, path.count);
      if (path.count === 1 && path.line !== 'outline') this.context.append(button(path.line === 'hole' ? 'Loch löschen' : 'Linie löschen', 'Den ganzen Pfad dieses Punkts entfernen', () => this.a.lineDelete()));
    } else if (path?.kind === 'lasso') {
      this.context.append(
        el('span', 'ze-label', 'Lasso'),
        button('Freihand', 'Freihand umfahren', () => this.a.lassoForm('lasso'), path.form === 'lasso' ? 'on' : ''),
        button('Rechteck', 'Rechteck aufziehen', () => this.a.lassoForm('rect'), path.form === 'rect' ? 'on' : ''),
      );
      if (path.count) {
        this.context.append(el('span', 'ze-sep'), el('span', 'ze-label', `${path.count} ${path.count === 1 ? 'Punkt' : 'Punkte'}`));
        anchorButtons(path.smooth, path.count);
      }
    } else if (path?.kind === 'band') {
      this.context.append(el('span', 'ze-label', path.shape ? `Band in ${path.shape}: auf eine Kante drücken und nach innen ziehen` : 'Band: erst eine Form wählen, dann auf ihre Kante drücken und nach innen ziehen'));
    } else if (path?.kind === 'face') {
      this.context.append(el('span', 'ze-label', `${path.shape.name} · Fläche`));
      if (this.sub === 'material') {
        for (const m of MATERIALS) this.context.append(button(MATERIAL_WORDS[m], `Material: ${MATERIAL_WORDS[m]} (fest und grabbar tragen, luftig und frei lassen die Bahn durch)`, () => this.a.setMaterial(m), material === m ? 'on' : ''));
        this.context.append(
          el('span', 'ze-sep'),
          button('Fertig', 'Zurück', () => {
            this.sub = null;
            this.contextKey = '-';
            this.setContext(planes, shapes, isolate, path, canPaste, extra);
          }),
        );
        this.context.classList.add('show');
        return;
      }
      this.context.append(button(`Material: ${material && material !== 'mixed' ? MATERIAL_WORDS[material] : 'gemischt'}`, 'Material der Fläche: fest, grabbar, luftig, frei', () => {
        this.sub = 'material';
        this.contextKey = '-';
        this.setContext(planes, shapes, isolate, path, canPaste, extra);
      }));
      this.context.append(button('Füllungen', 'Füllstapel der Fläche: Farben und Verläufe mit Mischmodus und Deckkraft', () => this.a.stackOpen('paint')));
      this.context.append(button('Loch', 'Fläche zum Loch machen (Entf); eine Farbe füllt sie wieder', () => this.a.faceFill(null), path.fill === null ? 'on' : ''));
    } else if (shape && this.sub === 'numbers' && nums) {
      // Zahlen nur auf Wunsch (Plan 4.2 Grundsatz 1): Mitte, Breite, Höhe in Metern der Ebene, Drehen um Grad
      this.context.append(el('span', 'ze-label', gi.groups || shapes.length > 1 ? 'Rahmen' : shape.name));
      const field = (label: string, title: string, value: number, digits: number, apply: (v: number) => void) => {
        const box = el('label', 'ze-num');
        box.title = title;
        const input = el('input');
        input.inputMode = 'decimal';
        input.value = fmt(value, digits);
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        let done = false;
        const commit = (ok: boolean) => {
          if (done) return;
          done = true;
          const v = Number(input.value.replace(',', '.').replace(/[^\d.-]/g, ''));
          if (ok && input.value.trim() && Number.isFinite(v) && fmt(v, digits) !== fmt(value, digits)) apply(v);
          else input.value = fmt(value, digits);
          done = false;
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit(true);
            input.blur();
          }
          if (e.key === 'Escape') {
            input.value = fmt(value, digits);
            input.blur();
          }
        });
        input.addEventListener('change', () => commit(true));
        box.append(el('span', '', label), input);
        this.context.append(box);
      };
      field('X', 'Mitte waagrecht (Meter in der Ebene)', nums.x, 2, (v) => this.a.numbers('x', v, this.keepRatio));
      field('Y', 'Mitte senkrecht (Meter in der Ebene, oben ist größer)', nums.y, 2, (v) => this.a.numbers('y', v, this.keepRatio));
      field('B', 'Breite (Meter)', nums.w, 2, (v) => this.a.numbers('w', v, this.keepRatio));
      field('H', 'Höhe (Meter)', nums.h, 2, (v) => this.a.numbers('h', v, this.keepRatio));
      this.context.append(
        button(CHAIN, 'Breite und Höhe gemeinsam ändern (Seitenverhältnis halten)', () => {
          this.keepRatio = !this.keepRatio;
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }, this.keepRatio ? 'on' : ''),
      );
      field('↻', 'Drehen um so viele Grad um die Mitte (gegen den Uhrzeigersinn)', 0, 0, (v) => this.a.numbers('angle', v, this.keepRatio));
      this.context.append(
        el('span', 'ze-sep'),
        button('Fertig', 'Zurück zur Leiste der Formen', () => {
          this.sub = null;
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }),
      );
    } else if (shape && this.sub === 'material') {
      this.context.append(el('span', 'ze-label', shapes.length > 1 ? `Material von ${shapes.length} Formen` : `Material von ${shape.name}`));
      for (const m of MATERIALS) this.context.append(button(MATERIAL_WORDS[m], `Material: ${MATERIAL_WORDS[m]} (fest und grabbar tragen, luftig und frei lassen die Bahn durch)`, () => this.a.setMaterial(m), material === m ? 'on' : ''));
      this.context.append(
        el('span', 'ze-sep'),
        button('Fertig', 'Zurück zur Leiste der Formen', () => {
          this.sub = null;
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }),
      );
    } else if (shape && this.sub && this.sub !== 'numbers' && shapes.length > 1 && shapes.every((s) => s.parent === shape.parent)) {
      const what = gi.groups ? `${gi.units} Teile` : `${shapes.length} Formen`;
      if (this.sub === 'align') {
        this.context.append(el('span', 'ze-label', `${what} ausrichten`));
        for (const [mode, title, icon] of ALIGN) this.context.append(button(icon, title, () => this.a.align(mode)));
        if (gi.units > 2) this.context.append(el('span', 'ze-sep'), button(DIST_X, 'Waagrecht verteilen', () => this.a.distribute('x')), button(DIST_Y, 'Senkrecht verteilen', () => this.a.distribute('y')));
      } else {
        this.context.append(el('span', 'ze-label', `${gi.units === 1 ? `${shapes.length} Formen der Gruppe` : what} verbinden`));
        for (const [op, title, icon] of COMBINE) this.context.append(button(icon, title, () => this.a.combine(op)));
      }
      this.context.append(
        el('span', 'ze-sep'),
        button('Fertig', 'Zurück zur Leiste der Formen', () => {
          this.sub = null;
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }),
      );
    } else if (shape) {
      const many = shapes.length > 1;
      this.sub = null;
      if (gi.inside) this.context.append(button('Gruppe verlassen', 'Aus der Gruppe heraus (Esc oder ins Leere tippen)', () => this.a.leaveGroup()), el('span', 'ze-sep'));
      const label = gi.groups === 1 && gi.units === 1 ? `Gruppe · ${shapes.length} Formen` : gi.groups ? `${gi.units} Teile · ${shapes.length} Formen` : many ? `${shapes.length} Formen` : shape.name;
      this.context.append(el('span', 'ze-label', label));
      this.context.append(
        button('Duplizieren', 'Duplizieren (Cmd+D)', () => this.a.duplicate()),
        button('Kopieren', 'Kopieren (Cmd+C); in einer anderen Ebene einfügen hält das Bild', () => this.a.copy()),
        button(FLIP_X, 'Waagrecht spiegeln (Shift+H)', () => this.a.flip('x')),
        button(FLIP_Y, 'Senkrecht spiegeln (Shift+V)', () => this.a.flip('y')),
      );
      const open = (sub: 'align' | 'combine' | 'numbers' | 'material') => () => {
        this.sub = sub;
        this.contextKey = '-';
        this.setContext(planes, shapes, isolate, path, canPaste, extra);
      };
      const onePlane = shapes.every((s) => s.parent === shape.parent);
      if (many && onePlane) {
        if (gi.units > 1) this.context.append(button('Ausrichten', 'Ausrichten und verteilen (eine Gruppe als Ganzes)', open('align')));
        this.context.append(button('Verbinden', 'Vereinen, abziehen, Schnittmenge, Überlappung ausschließen (eine Gruppe zählt als eine Form)', open('combine')));
      }
      this.context.append(button('Vereinfachen', 'Weniger Anker, höchstens 1,5 Bildpunkte daneben', () => this.a.simplify()));
      if (nums) this.context.append(button('Zahlen', 'Lage, Größe und Drehung als Zahlen', open('numbers')));
      this.context.append(button('Füllungen', many ? 'Füllstapel der zuletzt gewählten Form' : 'Füllstapel der Form: Farben und Verläufe mit Mischmodus und Deckkraft', () => this.a.stackOpen('paint')));
      this.context.append(button(`Material: ${material && material !== 'mixed' ? MATERIAL_WORDS[material] : 'gemischt'}`, 'Material der Formen: fest, grabbar, luftig, frei (Stufe 4: fest und grabbar tragen Bahn und Stützen)', open('material')));
      if (gi.units > 1 && onePlane) this.context.append(button('Gruppieren', 'Zu einer Gruppe (Cmd+G): Tippen wählt sie ganz, doppelt tippen geht hinein', () => this.a.shapeGroup()));
      if (gi.groups) this.context.append(button('Auflösen', 'Gruppe auflösen, die Formen bleiben (Shift+Cmd+G)', () => this.a.shapeUngroup()));
      if (gi.units === 1) this.context.append(button(FORWARD, 'In der Ebene nach vorn (])', () => this.a.orderShape(1)), button(BACKWARD, 'In der Ebene nach hinten ([)', () => this.a.orderShape(-1)));
      this.context.append(button('Löschen', 'Löschen (Entf)', () => this.a.deleteShape()));
    } else if (plane && sketch && (this.sub === 'sketch' || sketchEdit)) {
      // die Leiste bleibt auch nach dem Anpassen (frisch geladen), bis „Fertig“
      this.sub = 'sketch';
      this.context.append(
        el('span', 'ze-label', `Skizze auf ${plane.name}`),
        button(`Deckkraft ${Math.round(sketch.opacity * 100)} %`, 'Deckkraft weiterschalten (25, 50, 75, 100 %)', () => this.a.sketchOpacity()),
        button('Multiplizieren', 'An: weißes Papier wird durchsichtig, Linien dunkeln ab. Aus: normal halbdurchsichtig', () => this.a.sketchBlend(), sketch.blend ? '' : 'on'),
        button(sketchEdit ? 'Anpassen fertig' : 'Anpassen', 'Ecken ziehen skaliert, innen ziehen verschiebt', () => this.a.sketchAdjust(), sketchEdit ? 'on' : ''),
        button(sketch.hidden ? 'Einblenden' : 'Ausblenden', 'Skizze zeigen oder verbergen', () => this.a.sketchHide()),
        button('Anderes Bild', 'Ein anderes Bild als Skizze laden', () => this.sketchFile.click()),
        button('Entfernen', 'Skizze von der Ebene nehmen', () => this.a.sketchRemove()),
        el('span', 'ze-sep'),
        button('Fertig', 'Zurück zur Leiste der Ebene', () => {
          this.sub = null;
          if (sketchEdit) this.a.sketchAdjust();
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, { ...extra, sketchEdit: false });
        }),
      );
    } else if (plane && this.sub === 'roles') {
      const role = planes.every((p) => p.role === plane.role) ? plane.role : null;
      this.context.append(el('span', 'ze-label', planes.length > 1 ? `Rolle von ${planes.length} Ebenen` : `Rolle von ${plane.name}`));
      for (const r of PLANE_ROLES) this.context.append(button(PLANE_ROLE_WORDS[r], `Rolle: ${PLANE_ROLE_WORDS[r]} (wirkt ab Stufe 4 auf Pinsel und Stützen)`, () => this.a.setRole(r), role === r ? 'on' : ''));
      this.context.append(
        el('span', 'ze-sep'),
        button('Fertig', 'Zurück zur Leiste der Ebene', () => {
          this.sub = null;
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }),
      );
    } else if (plane) {
      const many = planes.length > 1;
      if (this.sub === 'sketch') this.sub = null;
      this.context.append(el('span', 'ze-label', group ? `${group.name} · ${planes.length} ${planes.length === 1 ? 'Ebene' : 'Ebenen'}` : many ? `${planes.length} Ebenen` : plane.name));
      const role = planes.every((p) => p.role === plane.role) ? plane.role : null;
      // die Rolle ändert sich selten: ein Knopf, der die vier Rollen öffnet (hält die Leiste einzeilig)
      this.context.append(
        button(`Rolle: ${role ? PLANE_ROLE_WORDS[role] : 'gemischt'}`, 'Rolle der Ebene wählen (wirkt ab Stufe 4 auf Pinsel und Stützen)', () => {
          this.sub = 'roles';
          this.contextKey = '-';
          this.setContext(planes, shapes, isolate, path, canPaste, extra);
        }),
      );
      this.context.append(el('span', 'ze-sep'));
      if (!many) for (const i of ['off', 'front', 'only'] as const) this.context.append(button(i === 'off' ? 'Alle' : i === 'front' ? 'Davor aus' : 'Nur diese', `Isolieren: ${ISOLATE_WORDS[i]}`, () => this.a.setIsolate(i), isolate === i ? 'on' : ''));
      if (!many) this.context.append(el('span', 'ze-sep'));
      if (!many) this.context.append(button('Ebenenstapel', 'Füllungen über allen Formen der Ebene, Luftperspektive', () => this.a.stackOpen('plane')));
      if (canPaste) this.context.append(button('Einfügen', 'Kopierte Formen in die aktive Ebene, an derselben Stelle im Spielblick (Cmd+V)', () => this.a.paste()));
      this.context.append(group ? button('Auflösen', 'Gruppe auflösen, die Ebenen bleiben (Shift+Cmd+G)', () => this.a.ungroup()) : button('Gruppieren', 'Die gewählten Ebenen zu einer Gruppe (Cmd+G)', () => this.a.groupPlanes()));
      if (!many)
        this.context.append(
          button('Skizze', sketch ? 'Skizze der Ebene: Deckkraft, anpassen, entfernen' : 'Ein Bild (deine Skizze) halbdurchsichtig auf die Ebene legen, zum Nachzeichnen', () => {
            if (!sketch) {
              this.sketchFile.click();
              return;
            }
            this.sub = 'sketch';
            this.contextKey = '-';
            this.setContext(planes, shapes, isolate, path, canPaste, extra);
          }),
        );
      this.context.append(
        button('Als SVG', many ? 'Die gewählten Ebenen als SVG sichern' : 'Nur diese Ebene als SVG sichern', () => this.a.exportSvg('plane')),
        group
          ? button('Gruppe löschen', 'Gruppe mit allen Ebenen und Formen löschen', () => this.a.deleteGroup())
          : button(many ? 'Ebenen löschen' : 'Ebene löschen', many ? 'Die gewählten Ebenen mit allen Formen löschen' : 'Ebene mit allen Formen löschen', () => this.a.deletePlane()),
      );
    }
    this.context.classList.toggle('show', !!(dropChoice || filling || grad || dock || path || shape || plane));
    if (this.toastEl.classList.contains('show')) this.placeToast();
    this.placeStack();
  }

  destroy(): void {
    this.colors.destroy();
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
