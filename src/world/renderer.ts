/**
 * Weltrenderer (Etappe 1, Richtlinie 2.3): eine Three-Szene im selben WebGL-Kontext wie Pixi, hinter dem Schalter
 * ?world=1. Je Bild zeichnet Pixi zuerst den Himmel, dann Three die Welt (Boden, Erdschnitt; später Bahn, Stützen,
 * Wagen, Kulissen mit Tiefenpuffer), dann Pixi Zeichen-Overlay und HUD darüber. Vor jedem Wechsel setzt der jeweilige
 * Renderer seinen Zustand zurück (resetState), damit keiner die Annahmen des anderen über den Kontext erbt.
 * Three legt den Kontext an (stencil für Pixi-Masken); Pixi bekommt Zeichenfläche und Kontext beim Start (Game.init).
 * Dazu Licht mit Shadow Map, Nebel und Looks (light.ts, looks.ts) und die Kulissen des Levels (levelElements.ts).
 */
import { Box3, Color, Fog, Group, PCFSoftShadowMap, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type Object3D } from 'three';
import type { ZoneElement } from '@/zone/types';
import { buildZoneElement } from '@/zone/build';
import { laneToZ, zToLane } from './camera';
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import type { TrackSamples } from '@/track/model';
import type { CarState } from '@/physics/trainSim';
import { mix } from '@/render/paint';
import { WorldCamera, type CameraView } from './camera';
import { buildGround, type GroundMeshes } from './ground';
import { groundBandsTexture, strataTexture } from './textures';
import { WorldLights } from './light';
import { applyGrade, LOOKS, type LookName } from './looks';
import { elementsFromTerrain, type PortalLike } from './levelElements';
import type { BuiltElement } from './elements';
import { trackFrames } from './trackMesh';
import { buildTrack, disposeTrack } from './trackBuilder';
import type { TrackType } from './trackTypes';
import { WorldTrain, type RailFrame } from './train';
import { TerrainFoundation, type Foundation } from './foundations';
import { buildWorldSupports, disposeSupports, planWorldSupports, type SupportStats } from './supports';

export interface WorldRendererOptions {
  /** Kantenglättung des Kontexts (gilt für Three und Pixi); ?aa=0 schaltet sie zum Messen ab */
  antialias?: boolean;
  /** Shadow Map (1024²); ?shadow=0 schaltet sie ab */
  shadows?: boolean;
  /** Look erzwingen (?look=), sonst Tag oder Nacht nach dem Level */
  look?: LookName | null;
}

export class WorldRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new WorldCamera();
  readonly lights: WorldLights;
  private readonly fog = new Fog(0xffffff, 200, 400);
  private level: GroundMeshes | null = null;
  private levelData: { terrain: Terrain; world: WorldDef; night: boolean } | null = null;
  private elements: BuiltElement[] = [];
  private portals: PortalLike[] = [];
  /** Einträge der Zonendatei (Editor): gebaut je Kennung mit Ursprung (für das Ziehen), in einer eigenen Gruppe für Treffer */
  private readonly zone = new Map<string, { origin: { x: number; y: number; z: number }; built: BuiltElement }>();
  private readonly zoneGroup = new Group();
  private selectedId: string | null = null;
  private readonly raycaster = new Raycaster();
  /** Look aus der Adresse überstimmt Tag und Nacht des Levels */
  readonly lookOverride: LookName | null;
  private look: LookName = 'day';
  private track: Group | null = null;
  private supports: Group | null = null;
  private readonly train = new WorldTrain();
  /** Bahntyp aus der Adresse (?track=) überstimmt den Typ des Skins (zum Vergleich der vier Typen) */
  trackOverride: TrackType | null = null;
  /** Bahntyp der letzten Bahn (für den Zug) */
  private type: TrackType = 'steel';
  /** Fundamente des Levels (Boden und Berge; später Kulissen und Höhlenböden) */
  private foundations: Foundation[] = [];
  /** Zählung der letzten Stützenplanung (Dev-Anzeige, Replay) */
  supportStats: SupportStats | null = null;

  constructor(opts: WorldRendererOptions = {}) {
    this.canvas = document.createElement('canvas');
    this.zoneGroup.name = 'zone';
    this.scene.add(this.train.group, this.zoneGroup);
    this.three = new WebGLRenderer({ canvas: this.canvas, antialias: opts.antialias ?? true, stencil: true, alpha: false, powerPreference: 'high-performance' });
    this.three.outputColorSpace = SRGBColorSpace;
    // Pixi hat den Himmel schon gemalt: Three löscht nur Tiefe und Stencil. Die Löschfarbe bleibt transparent schwarz,
    // denn Pixi nimmt nach resetState genau das an und setzt sie nicht neu (sonst würden seine Filter-Texturen und
    // Masken mit deckendem Schwarz gelöscht)
    this.three.autoClearColor = false;
    this.three.setClearColor(0x000000, 0);
    this.three.shadowMap.enabled = opts.shadows ?? true;
    this.three.shadowMap.type = PCFSoftShadowMap;
    this.lights = new WorldLights(opts.shadows ?? true);
    this.lookOverride = opts.look ?? null;
    this.scene.add(this.lights.group);
    this.scene.fog = this.fog;
    this.setLook('day');
  }

  /** Look setzen: Licht, Umfärben, Nebel (die Nebelfarbe mischt sich mit dem Himmel der Welt) */
  setLook(name: LookName): void {
    this.look = name;
    const look = LOOKS[name];
    applyGrade(look);
    this.lights.apply(look);
    const sky = this.levelData?.world.palette.sky[1] ?? look.background;
    this.fog.color.set(look.fog).lerp(new Color(sky), 0.4);
  }

  get currentLook(): LookName {
    return this.look;
  }

  /** Bahntyp der letzten Bahn (Adresse vor Skin) */
  get currentType(): TrackType {
    return this.type;
  }

  /** der geteilte WebGL-Kontext (für Pixi) */
  get context(): WebGL2RenderingContext {
    return this.three.getContext() as WebGL2RenderingContext;
  }

  /** Größe in CSS-Pixeln und Auflösung wie Pixi; die Zeichenfläche selbst bemisst Pixi */
  resize(width: number, height: number, resolution: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.three.setPixelRatio(resolution);
    this.three.setSize(width, height, false);
    // Three rundet die Zeichenfläche ab, Pixi auf: Pixis Maß gilt, sonst springt sie bei jedem Resize um ein Pixel
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Kamera dieses Bildes (aus der Weltansicht); Licht, Schattenkasten und Nebel folgen dem Ziel */
  setCamera(view: CameraView): void {
    this.camera.set(view);
    this.lights.follow(view.cx);
    // Nebelweiten relativ zum Kameraabstand: Luftperspektive beginnt hinter der Bühne (Labor)
    const D = Number.isFinite(this.camera.distance) ? this.camera.distance : 300;
    this.fog.near = D + 24;
    this.fog.far = D + 140;
  }

  /** Welt zeichnen (zwischen Pixi-Himmel und Pixi-HUD) */
  render(): void {
    this.three.resetState();
    this.three.render(this.scene, this.camera.active);
  }

  /** Zeichenaufrufe des letzten Bildes (nur Three) */
  get drawCalls(): number {
    return this.three.info.render.calls;
  }

  /** Boden, Erdschnitt und Kulissen eines Levels aufbauen (ersetzt das vorige Level); night wählt den Nacht-Look */
  showLevel(terrain: Terrain, world: WorldDef, night = false): void {
    this.clearLevel();
    this.levelData = { terrain, world, night };
    const groundTex = groundBandsTexture(world.palette.ground[0], 'rgba(255,245,170,0.55)', world.id);
    const earth = strataTexture(mix('#7a5540', world.palette.ground[1], 0.3), world.id + 100);
    this.level = buildGround(terrain, groundTex, earth);
    this.scene.add(this.level.group);
    this.buildElements();
    this.setLook(this.lookOverride ?? (night ? 'night' : 'day'));
  }

  /** Kulissen des Levels (Berge als Dreiteiler mit Tunnelöffnungen, Wasser, Wasserfälle, Deko) und Fundamente neu bauen */
  private buildElements(): void {
    for (const e of this.elements) {
      this.scene.remove(e.group);
      e.dispose();
    }
    this.elements = [];
    if (!this.levelData) return;
    const { terrain, world } = this.levelData;
    this.elements = elementsFromTerrain(terrain, world, this.portals);
    for (const e of this.elements) this.scene.add(e.group);
    this.refreshFoundations();
  }

  /** Fundamente: Terrain, Kulissen des Levels und Elemente der Zone (Höhlenböden tragen, Wasser sperrt) */
  private refreshFoundations(): void {
    const t = this.levelData ? [new TerrainFoundation(this.levelData.terrain)] : [];
    const fromElements = (list: Iterable<BuiltElement>): Foundation[] => [...list].flatMap((e) => (e.foundation ? [e.foundation] : []));
    this.foundations = [...t, ...fromElements(this.elements), ...fromElements([...this.zone.values()].map((z) => z.built))];
  }

  // ------------------------------------------------------------------ Zone (Editor)
  /** alle Elemente der Zone neu bauen (Station, Schlange, Baustelle und Coins setzt der Editor über addZoneBuilt) */
  setZone(elements: ZoneElement[]): void {
    this.clearZone();
    for (const el of elements) this.addZoneElement(el);
  }

  addZoneElement(el: ZoneElement): void {
    this.addZoneBuilt(el.id, buildZoneElement(el), el);
  }

  updateZoneElement(el: ZoneElement): void {
    this.addZoneElement(el);
  }

  /** beliebigen gebauten Eintrag unter einer Kennung in die Zone setzen (ersetzt einen gleichnamigen) */
  addZoneBuilt(id: string, built: BuiltElement, origin: { x: number; y: number; z: number }): void {
    this.removeZoneElement(id);
    built.group.userData.elementId = id;
    this.zoneGroup.add(built.group);
    this.zone.set(id, { origin: { x: origin.x, y: origin.y, z: origin.z }, built });
    this.refreshFoundations();
  }

  removeZoneElement(id: string): void {
    const z = this.zone.get(id);
    if (!z) return;
    this.zoneGroup.remove(z.built.group);
    z.built.dispose();
    this.zone.delete(id);
    this.refreshFoundations();
    if (this.selectedId === id) this.selectZoneElement(null);
  }

  /** Element beim Ziehen nur verschieben (ohne Neubau); am Ende des Zugs baut updateZoneElement neu */
  nudgeZoneElement(id: string, x: number, y: number, z: number): void {
    const e = this.zone.get(id);
    if (!e) return;
    e.built.group.position.set(x - e.origin.x, y - e.origin.y, laneToZ(z) - laneToZ(e.origin.z));
    e.built.group.updateMatrixWorld(true);
  }

  /** Bildschirm-Kasten (Pixel) um ein Element der Zone, für den Auswahlrahmen des Editors; null ohne Element */
  zoneElementScreenBox(id: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const e = this.zone.get(id);
    if (!e) return null;
    e.built.group.updateMatrixWorld(true);
    const box = new Box3().setFromObject(e.built.group);
    if (box.isEmpty()) return null;
    const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const c = new Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const p = this.camera.toScreen(c.x, c.y, zToLane(c.z));
      out.minX = Math.min(out.minX, p.x);
      out.maxX = Math.max(out.maxX, p.x);
      out.minY = Math.min(out.minY, p.y);
      out.maxY = Math.max(out.maxY, p.y);
    }
    return out;
  }

  clearZone(): void {
    for (const id of [...this.zone.keys()]) this.removeZoneElement(id);
    this.selectZoneElement(null);
  }

  /** gewähltes Element (null: keines); den Rahmen zeichnet der Editor in Pixi aus zoneElementScreenBox */
  selectZoneElement(id: string | null): void {
    this.selectedId = id && this.zone.has(id) ? id : null;
  }

  /** Element unter einem Bildpunkt (NDC −1 … 1), sonst null */
  pickZoneElement(nx: number, ny: number): string | null {
    if (!this.zone.size) return null;
    this.raycaster.setFromCamera(new Vector2(nx, ny), this.camera.active);
    const hits = this.raycaster.intersectObjects(this.zoneGroup.children, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o) {
        if (typeof o.userData.elementId === 'string') return o.userData.elementId;
        o = o.parent;
      }
    }
    return null;
  }

  /** Tunnelportale der aktuellen Bahn (Ein- und Austritte in Berge): die Berge bekommen dort ihre Öffnungen */
  setTunnelPortals(portals: PortalLike[]): void {
    const same = portals.length === this.portals.length && portals.every((p, i) => Math.abs(p.x - this.portals[i].x) < 0.01 && Math.abs(p.y - this.portals[i].y) < 0.01 && Math.abs(p.z - this.portals[i].z) < 0.01);
    if (same) return;
    this.portals = portals.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    this.buildElements();
  }

  /** Level aus der Szene nehmen und seine Geometrie freigeben (mit Bahn und Zug) */
  clearLevel(): void {
    this.clearTrack();
    this.clearTrain();
    this.clearZone();
    this.levelData = null;
    this.portals = [];
    this.buildElements();
    if (!this.level) return;
    this.scene.remove(this.level.group);
    this.level.dispose();
    this.level = null;
  }

  /**
   * Bahn als Profil aus den Abtastpunkten und der Schräglage der Bühnen-Schienen bauen (auch für die Vorschau); nach dem
   * Loslassen (keine Vorschau) dazu die Stützen auf den Fundamenten des Levels
   */
  setTrack(samples: TrackSamples, banks: Float64Array, type: TrackType, preview: boolean, insideMountain?: (x: number, y: number, z: number) => boolean): void {
    this.clearTrack();
    if (samples.count < 2) return;
    this.type = this.trackOverride ?? type;
    const frames = trackFrames(samples, banks);
    this.track = buildTrack(frames, samples.length, this.type);
    this.scene.add(this.track);
    if (!preview) {
      const { plans, stats } = planWorldSupports(samples, frames, this.type, this.foundations, insideMountain ?? (() => false));
      this.supportStats = stats;
      this.supports = buildWorldSupports(plans, this.type);
      this.scene.add(this.supports);
    }
  }

  clearTrack(): void {
    if (this.track) {
      this.scene.remove(this.track);
      disposeTrack(this.track);
      this.track = null;
    }
    if (this.supports) {
      this.scene.remove(this.supports);
      disposeSupports(this.supports);
      this.supports = null;
    }
  }

  /** Zug mit count Wagen als Platzhalter-Körper anlegen (Gondeln mit Hänger bei der Hängebahn) */
  buildTrain(count: number): void {
    this.train.build(count, this.type === 'hanging');
  }

  /** Wagen je Bild stellen (rail: Schienenrahmen bei s, wenn der Zug auf der Bahn fährt) */
  updateTrain(cars: CarState[], rail: RailFrame | null): void {
    this.train.update(cars, rail);
  }

  clearTrain(): void {
    this.train.clear();
  }
}
