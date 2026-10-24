/**
 * Weltrenderer (Etappe 1, Richtlinie 2.3): eine Three-Szene im selben WebGL-Kontext wie Pixi, hinter dem Schalter
 * ?world=1. Je Bild zeichnet Pixi zuerst den Himmel, dann Three die Welt (Boden, Erdschnitt; später Bahn, Stützen,
 * Wagen, Kulissen mit Tiefenpuffer), dann Pixi Zeichen-Overlay und HUD darüber. Vor jedem Wechsel setzt der jeweilige
 * Renderer seinen Zustand zurück (resetState), damit keiner die Annahmen des anderen über den Kontext erbt.
 * Three legt den Kontext an (stencil für Pixi-Masken); Pixi bekommt Zeichenfläche und Kontext beim Start (Game.init).
 */
import { Group, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Terrain } from '@/physics/terrain';
import type { WorldDef } from '@/levels/types';
import type { TrackSamples } from '@/track/model';
import type { CarState } from '@/physics/trainSim';
import { mix } from '@/render/paint';
import { WorldCamera, type CameraView } from './camera';
import { buildGround, type GroundMeshes } from './ground';
import { groundBandsTexture, strataTexture } from './textures';
import { buildLights } from './light';
import { trackFrames } from './trackMesh';
import { buildTrack, disposeTrack } from './trackBuilder';
import type { TrackType } from './trackTypes';
import { WorldTrain, type RailFrame } from './train';
import { TerrainFoundation, type Foundation } from './foundations';
import { buildWorldSupports, disposeSupports, planWorldSupports, type SupportStats } from './supports';

export interface WorldRendererOptions {
  /** Kantenglättung des Kontexts (gilt für Three und Pixi); ?aa=0 schaltet sie zum Messen ab */
  antialias?: boolean;
}

export class WorldRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new WorldCamera();
  private level: GroundMeshes | null = null;
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
    this.scene.add(buildLights(), this.train.group);
    this.three = new WebGLRenderer({ canvas: this.canvas, antialias: opts.antialias ?? true, stencil: true, alpha: false, powerPreference: 'high-performance' });
    this.three.outputColorSpace = SRGBColorSpace;
    // Pixi hat den Himmel schon gemalt: Three löscht nur Tiefe und Stencil. Die Löschfarbe bleibt transparent schwarz,
    // denn Pixi nimmt nach resetState genau das an und setzt sie nicht neu (sonst würden seine Filter-Texturen und
    // Masken mit deckendem Schwarz gelöscht)
    this.three.autoClearColor = false;
    this.three.setClearColor(0x000000, 0);
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

  /** Kamera dieses Bildes (aus der Weltansicht) */
  setCamera(view: CameraView): void {
    this.camera.set(view);
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

  /** Boden und Erdschnitt eines Levels aufbauen (ersetzt das vorige Level) */
  showLevel(terrain: Terrain, world: WorldDef): void {
    this.clearLevel();
    const groundTex = groundBandsTexture(world.palette.ground[0], 'rgba(255,245,170,0.55)', world.id);
    const earth = strataTexture(mix('#7a5540', world.palette.ground[1], 0.3), world.id + 100);
    this.level = buildGround(terrain, groundTex, earth);
    this.scene.add(this.level.group);
    this.foundations = [new TerrainFoundation(terrain)];
  }

  /** Level aus der Szene nehmen und seine Geometrie freigeben (mit Bahn und Zug) */
  clearLevel(): void {
    this.clearTrack();
    this.clearTrain();
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
