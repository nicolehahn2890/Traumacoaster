/**
 * Weltrenderer (Etappe 1, Richtlinie 2.3): eine Three-Szene im selben WebGL-Kontext wie Pixi, hinter dem Schalter
 * ?world=1. Je Bild zeichnet Pixi zuerst den Himmel, dann Three die Welt (Boden, Erdschnitt; später Bahn, Stützen,
 * Wagen, Kulissen mit Tiefenpuffer), dann Pixi Zeichen-Overlay und HUD darüber. Vor jedem Wechsel setzt der jeweilige
 * Renderer seinen Zustand zurück (resetState), damit keiner die Annahmen des anderen über den Kontext erbt.
 * Three legt den Kontext an (stencil für Pixi-Masken); Pixi bekommt Zeichenfläche und Kontext beim Start (Game.init).
 * Dazu Licht mit Shadow Map, Nebel und Looks (light.ts, looks.ts) und die Kulissen des Levels (levelElements.ts).
 */
import { Box3, Color, Fog, Group, PCFSoftShadowMap, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type Object3D, BoxGeometry, DoubleSide, Euler, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, type Material, FrontSide } from 'three';
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
import { applyGrade, LOOKS, type LookName, revealMaterial, paintedMaterial, type RevealUniforms } from './looks';
import { elementsFromTerrain, type PortalLike } from './levelElements';
import type { BuiltElement } from './elements';
import { trackFrames } from './trackMesh';
import { buildTrack, disposeTrack, ghostTrack } from './trackBuilder';
import { buildStartPlaceholder, type BuiltStart } from './startElements';
import { carColor } from './train';
import { liftRange } from '@/physics/trainSim';
import type { StartType } from '@/track/model';
import type { GroundHole } from '@/zone/underground';
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

/** Material der Splitter eines Durchbruchs */
const SPLINTER = paintedMaterial({ color: new Color('#7a2a2a') });

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
  private readonly zone = new Map<string, { origin: { x: number; y: number; z: number }; built: BuiltElement; growth: number; openFrom: number }>();
  /** Löcher im Boden und Fenster im Erdschnitt der offenen Räume (Schritt 7) */
  private holes: GroundHole[] = [];
  /** Fortschrittsstufe der Zone im Spiel: Einträge mit höherer Wachstumsstufe sind unsichtbar (Infinity: alle da, Editor) */
  private stage = Infinity;
  private readonly zoneGroup = new Group();
  private selectedId: string | null = null;
  private readonly raycaster = new Raycaster();
  /** Look aus der Adresse überstimmt Tag und Nacht des Levels */
  readonly lookOverride: LookName | null;
  private look: LookName = 'day';
  private track: Group | null = null;
  private supports: Group | null = null;
  /** Platzhalter der Startart (Kette, Launch-Band, Puffer, Turm; Etappe 2, Schritt 2) */
  private start: BuiltStart | null = null;
  /** gedimmte Bahn, nur dort gezeichnet, wo Fels oder Kulisse sie verdecken (Schritt 5; Plan 5.2) */
  private ghost: Group | null = null;
  /** laufende Freilegung (Schritt 6): die Lippe eines Dreiteilers trägt ein Auflöse-Material */
  private revealing: { lip: Mesh; prev: Material | Material[]; mat: MeshLambertMaterial & { reveal: RevealUniforms } } | null = null;
  /** Splitter eines Durchbruchs (Schritt 6): Instanzen mit Geschwindigkeit, kurz animiert */
  private readonly splinters: Array<{ im: InstancedMesh; pos: Vector3[]; vel: Vector3[]; t: number }> = [];
  private lastTick = 0;
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
    this.tickEffects();
    this.three.resetState();
    this.three.render(this.scene, this.camera.active);
  }

  /** Splitter weiterbewegen (Schwerkraft, 1,2 s), dann entfernen */
  private tickEffects(): void {
    const now = performance.now();
    const dt = this.lastTick ? Math.min(0.05, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    if (!this.splinters.length) return;
    const m4 = new Matrix4();
    for (let k = this.splinters.length - 1; k >= 0; k--) {
      const sp = this.splinters[k];
      sp.t += dt;
      for (let i = 0; i < sp.pos.length; i++) {
        sp.vel[i].y -= 9.8 * dt;
        sp.pos[i].addScaledVector(sp.vel[i], dt);
        m4.makeRotationFromEuler(new Euler(sp.t * 4 + i, sp.t * 3, i));
        m4.setPosition(sp.pos[i]);
        sp.im.setMatrixAt(i, m4);
      }
      sp.im.instanceMatrix.needsUpdate = true;
      if (sp.t > 1.2) {
        this.scene.remove(sp.im);
        sp.im.geometry.dispose();
        this.splinters.splice(k, 1);
      }
    }
  }

  /** Freilegung (Schritt 6; Richtlinie 4): die Lippe des Elements löst sich um den Anschlusspunkt mit Radius r auf */
  beginReveal(id: string, center: { x: number; y: number }, radius: number): void {
    this.endReveal();
    const lip = this.zone.get(id)?.built.lip;
    if (!lip) return;
    const base = lip.material as MeshLambertMaterial;
    const mat = revealMaterial({ color: base.color.clone(), side: DoubleSide });
    mat.reveal.uRevealC.value.set(center.x, center.y, 0);
    mat.reveal.uRevealR.value = radius;
    this.revealing = { lip, prev: lip.material, mat };
    lip.material = mat;
  }

  /** Freilegung eines Raums (Schritt 7): der Boden über dem Raum löst sich um den Anschlusspunkt auf (Abstand in der Bodenebene) */
  beginGroundReveal(center: { x: number; z: number }, radius: number): void {
    this.endReveal();
    const ground = this.level?.ground;
    if (!ground) return;
    const base = ground.material as MeshLambertMaterial;
    const mat = revealMaterial({ map: base.map, side: FrontSide });
    mat.reveal.uRevealC.value.set(center.x, 0, laneToZ(center.z));
    mat.reveal.uRevealR.value = radius;
    mat.reveal.uRevealXZ.value = 1;
    this.revealing = { lip: ground, prev: ground.material, mat };
    ground.material = mat;
  }

  setReveal(progress: number): void {
    if (this.revealing) this.revealing.mat.reveal.uReveal.value = progress;
  }

  endReveal(): void {
    const r = this.revealing;
    if (!r) return;
    r.lip.material = r.prev;
    r.mat.dispose();
    this.revealing = null;
  }

  /** Durchbruch (Schritt 6): die Wand der Baustelle verschwindet, Splitter fliegen */
  shatterSite(id: string): void {
    const z = this.zone.get(id);
    if (!z) return;
    const wall = z.built.group.children.find((c) => c.name === 'wall') as Mesh | undefined;
    const origin = wall ? wall.getWorldPosition(new Vector3()) : new Vector3(z.origin.x, z.origin.y + 3, laneToZ(z.origin.z));
    if (wall) wall.visible = false;
    const n = 14;
    const im = new InstancedMesh(new BoxGeometry(0.5, 0.5, 0.3), SPLINTER, n);
    im.castShadow = true;
    const pos: Vector3[] = [];
    const vel: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos.push(origin.clone().add(new Vector3(0, -2.5 + (i % 5) * 1.2, Math.cos(a) * 1.4)));
      vel.push(new Vector3(4 + (i % 3) * 2, 3 + (i % 4) * 1.5, Math.sin(a) * 3));
    }
    this.splinters.push({ im, pos, vel, t: 0 });
    this.scene.add(im);
  }

  /** Zeichenaufrufe des letzten Bildes (nur Three) */
  get drawCalls(): number {
    return this.three.info.render.calls;
  }

  /** Boden, Erdschnitt und Kulissen eines Levels aufbauen (ersetzt das vorige Level); night wählt den Nacht-Look */
  showLevel(terrain: Terrain, world: WorldDef, night = false): void {
    this.clearLevel();
    this.levelData = { terrain, world, night };
    this.buildLevelGround();
    this.buildElements();
    this.setLook(this.lookOverride ?? (night ? 'night' : 'day'));
  }

  /** Boden und Erdschnitt (neu) bauen, mit den Löchern der offenen Räume */
  private buildLevelGround(): void {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
      this.level = null;
    }
    if (!this.levelData) return;
    const { terrain, world } = this.levelData;
    const groundTex = groundBandsTexture(world.palette.ground[0], 'rgba(255,245,170,0.55)', world.id);
    const earth = strataTexture(mix('#7a5540', world.palette.ground[1], 0.3), world.id + 100);
    this.level = buildGround(terrain, groundTex, earth, this.holes);
    this.scene.add(this.level.group);
  }

  /** Löcher im Boden und Fenster im Erdschnitt der offenen Räume setzen (Schritt 7); baut den Boden neu, wenn sie sich ändern */
  setGroundHoles(holes: GroundHole[]): void {
    const key = (h: GroundHole[]) => h.map((x) => `${x.x0},${x.x1},${x.lane0},${x.lane1},${x.y0},${x.y1}`).join('|');
    if (key(holes) === key(this.holes)) return;
    this.holes = holes;
    this.buildLevelGround();
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
    this.addZoneBuilt(el.id, buildZoneElement(el), el, el.growth ?? 0, el.kind === 'cave' ? el.openFrom ?? 0 : 0);
  }

  /** Fortschrittsstufe setzen: Einträge, die erst später wachsen, und Räume, die erst später offen sind, verschwinden (Plan 2.1, 5.2) */
  setStage(stage: number): void {
    this.stage = stage;
    for (const e of this.zone.values()) e.built.group.visible = e.growth <= stage && e.openFrom <= stage;
  }

  updateZoneElement(el: ZoneElement): void {
    this.addZoneElement(el);
  }

  /** beliebigen gebauten Eintrag unter einer Kennung in die Zone setzen (ersetzt einen gleichnamigen) */
  addZoneBuilt(id: string, built: BuiltElement, origin: { x: number; y: number; z: number }, growth = 0, openFrom = 0): void {
    this.removeZoneElement(id);
    built.group.userData.elementId = id;
    built.group.visible = growth <= this.stage && openFrom <= this.stage;
    this.zoneGroup.add(built.group);
    this.zone.set(id, { origin: { x: origin.x, y: origin.y, z: origin.z }, built, growth, openFrom });
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
    this.stage = Infinity;
    this.levelData = null;
    this.portals = [];
    this.holes = [];
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
  setTrack(samples: TrackSamples, banks: Float64Array, type: TrackType, preview: boolean, insideMountain?: (x: number, y: number, z: number) => boolean, start?: { type: StartType; stationLength: number; groundY: number; chainHeight?: number; liftTop?: number }): void {
    this.clearTrack();
    if (samples.count < 2) return;
    this.type = this.trackOverride ?? type;
    const frames = trackFrames(samples, banks);
    this.track = buildTrack(frames, samples.length, this.type);
    this.scene.add(this.track);
    this.ghost = ghostTrack(this.track);
    this.scene.add(this.ghost);
    if (start) {
      // Startart sichtbar (Schritt 2): Kette bis zum Kettenende der Fahrt, Launch-Band, Puffer oder Turm
      const needsLift = start.type === 'chainlift' || start.type === 'verticalLift';
      const lift = needsLift ? liftRange(samples, start.type === 'chainlift' ? start.chainHeight : undefined, start.liftTop) : null;
      this.start = buildStartPlaceholder(frames, { type: start.type, trackType: this.type, lift, stationLength: start.stationLength, groundY: start.groundY });
      this.scene.add(this.start.group);
    }
    if (!preview) {
      const { plans, stats } = planWorldSupports(samples, frames, this.type, this.foundations, insideMountain ?? (() => false));
      this.supportStats = stats;
      this.supports = buildWorldSupports(plans, this.type);
      this.scene.add(this.supports);
    }
  }

  clearTrack(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
    if (this.start) {
      this.scene.remove(this.start.group);
      this.start.dispose();
      this.start = null;
    }
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
  buildTrain(count: number, variant?: string): void {
    this.train.build(count, this.type === 'hanging', carColor(variant));
  }

  /** Wagen je Bild stellen (rail: Schienenrahmen bei s, wenn der Zug auf der Bahn fährt) */
  updateTrain(cars: CarState[], rail: RailFrame | null): void {
    this.train.update(cars, rail);
  }

  clearTrain(): void {
    this.train.clear();
  }
}
