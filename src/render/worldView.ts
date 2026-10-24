/**
 * WorldView: setzt Himmel, Terrain, Bahn, Zug und Effekte in Tiefenreihenfolge zusammen
 * und wendet die Kamera an. Alles innerhalb von `world` ist in Bühnen-Metern (Y nach oben).
 */
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { WorldDef } from '@/levels/types';
import type { Terrain } from '@/physics/terrain';
import type { TrackPath, TrackSamples } from '@/track/model';
import type { CarState } from '@/physics/trainSim';
import type { PassengerView } from '@/physics/passengers';
import type { CharacterDef } from '@/editor/characters';
import { LANE_MAX, LANE_MIN, setView, viewDistance, viewScale, viewState } from '@/track/stage';
import type { CameraView } from '@/world/camera';
import type { WorldRenderer } from '@/world/renderer';
import { trackTypeForSkin } from '@/world/trackTypes';
import { Camera } from './camera';
import { Sky } from './sky';
import { GlowLayer } from './shaders/glowLayer';
import { fxEnabled } from '@/core/fx';
import { TerrainRenderer } from './terrainRenderer';
import { TrackRenderer } from './trackRenderer';
import { TrainRenderer } from './trainRenderer';
import { paperTexture } from './paint';
import { art, ART_NAMES } from '@/assets/manifest';
import { Effects } from './effects';

export class WorldView {
  readonly root = new Container();
  readonly sky: Sky;
  readonly world = new Container();
  /** Ebene über der Welt, aber in Bühnenkoordinaten (Handles, Strich-Vorschau) */
  readonly overlay = new Container();
  readonly camera = new Camera();
  readonly terrainR: TerrainRenderer;
  readonly trackR: TrackRenderer;
  readonly trainR: TrainRenderer;
  readonly effects: Effects;
  private paper: TilingSprite;
  private laneContainers = new Map<number, Container>();
  /** Leuchtebene je Spur (additiv, weichgezeichnet) */
  private glows = new Map<number, GlowLayer>();
  private fxOn = false;
  private time = 0;
  /** letzte Kameralage, für die die Bahn in Perspektive projiziert wurde */
  private lastView = { x: NaN, y: NaN, zoom: NaN, persp: false };
  /** Perspektive: die Kamera hat sich in diesem Bild bewegt, Ansichts-Overlays (Griffe) müssen neu gezeichnet werden */
  viewMoved = false;
  private worldDef: WorldDef;
  private night: boolean;
  /** Weltrenderer (?world=1): Himmel wird vor der Three-Welt gezeichnet; Boden, Schienen und Wagen kommen aus der Welt */
  private worldMode = false;
  private worldR: WorldRenderer | null = null;

  constructor(worldDef: WorldDef, terrain: Terrain, skin: string, night = false, fx: boolean | null = null) {
    this.worldDef = worldDef;
    this.fxOn = fx ?? fxEnabled();
    this.night = night;
    this.sky = new Sky(worldDef, night);
    this.terrainR = new TerrainRenderer(terrain, worldDef);
    this.trackR = new TrackRenderer(worldDef);
    this.trainR = new TrainRenderer(skin);
    this.effects = new Effects();
    this.paper = new TilingSprite({ texture: art(ART_NAMES.paper(), paperTexture), width: 100, height: 100 });
    this.paper.blendMode = 'multiply';
    this.paper.alpha = 0.5;
    this.root.addChild(this.sky.container, this.world, this.paper);
    // Tiefenreihenfolge: hinten → vorne
    for (let z = LANE_MAX; z >= LANE_MIN; z--) {
      const lane = new Container();
      const glow = new GlowLayer(6);
      this.glows.set(z, glow);
      lane.addChild(
        this.terrainR.layers.strip.get(z)!,
        this.trackR.layers.supports.get(z)!,
        this.trackR.layers.rails.get(z)!,
        this.trackR.layers.barriers.get(z)!,
        this.trackR.layers.coins.get(z)!,
        glow.container,
        this.trainR.layers.get(z)!,
        this.terrainR.layers.cover.get(z)!,
      );
      this.laneContainers.set(z, lane);
      this.world.addChild(lane);
    }
    this.trackR.glowTargets = new Map([...this.glows].map(([z, g]) => [z, g.container]));
    this.applyFx();
    this.world.addChild(this.effects.container, this.overlay);
    // Nacht: dunkler Schleier über der Welt
    if (night) {
      const veil = new Graphics();
      veil.rect(-2000, -2000, 4000, 4000).fill({ color: 0x0d0b1f, alpha: 0.25 });
      this.world.addChild(veil);
    }
  }

  get isNight(): boolean {
    return this.night;
  }

  /**
   * Weltrenderer an: Der Himmel verlässt die Bühne und wird als Hintergrund vor der Three-Welt gezeichnet
   * (Scene.background); Bodenstreifen, Berge, Wasser und Deko der Spuren bleiben aus, denn Boden und Kulissen zeichnet
   * die Welt.
   */
  setWorldMode(world: WorldRenderer | null): void {
    const on = !!world;
    this.worldMode = on;
    this.worldR = world;
    if (on) this.root.removeChild(this.sky.container);
    else if (!this.sky.container.parent) this.root.addChildAt(this.sky.container, 0);
    for (const g of this.terrainR.layers.strip.values()) g.visible = !on;
    for (const c of this.terrainR.layers.cover.values()) c.visible = !on;
    this.trackR.setWorldMode(on);
    this.trainR.setWorldMode(on);
  }

  /** Hintergrund hinter der Three-Welt (nur mit Weltrenderer): der Himmel */
  get background(): Container | undefined {
    return this.worldMode ? this.sky.container : undefined;
  }

  /** Kameralage dieses Bildes für den Weltrenderer: Ziel mit Wackeln, Zoom, Bildgröße, Perspektive */
  cameraView(): CameraView {
    const c = this.camera;
    const v = viewState();
    return { cx: c.x + c.ox, cy: c.y + c.oy, zoom: c.zoom, width: c.width, height: c.height, persp: v.persp, fov: v.fov };
  }
  get def(): WorldDef {
    return this.worldDef;
  }

  setTrack(path: TrackPath, samples: TrackSamples, skin: string, terrain: Terrain, allowTunnels: boolean, preview = false): void {
    const portals = this.trackR.draw(path, samples, skin, terrain, allowTunnels, preview);
    if (!preview) this.terrainR.setTunnelPortals(portals);
    // Weltrenderer: Profil aus denselben Abtastpunkten und derselben Schräglage wie die Schienen der Bühne; die Berge
    // bekommen an den Portalen ihre Öffnungen
    if (!preview) this.worldR?.setTunnelPortals(portals);
    this.worldR?.setTrack(samples, this.trackR.railBanks, trackTypeForSkin(skin), preview, (x, y, z) => terrain.insideMountain(x, y, z));
  }

  /** Bahn löschen (Bühne und Welt) */
  clearTrack(): void {
    this.trackR.clear();
    this.worldR?.clearTrack();
  }

  /** Zug entfernen (Bühne und Welt) */
  clearTrain(): void {
    this.trainR.clear();
    this.worldR?.clearTrain();
  }

  /** Streben wachsen (0 … 1) nach dem Loslassen des Strichs */
  growSupports(growth: number): void {
    this.trackR.redrawSupports(growth);
  }

  buildTrain(cars: number, riders: CharacterDef[], perCar: number): void {
    this.trainR.build(cars, riders, perCar);
    this.worldR?.buildTrain(cars);
  }

  /** onRails: Der Zug fährt auf der Bahn (nicht im Flug nach einem Fehlschlag); die Wagen liegen dann auf den Schienen */
  updateTrain(cars: CarState[], passengers: PassengerView[], dt: number, onRails = true): void {
    const rail = onRails ? (s: number) => this.trackR.railFrame(s) : undefined;
    this.trainR.update(cars, passengers, dt, rail);
    this.worldR?.updateTrain(cars, rail ?? null);
  }

  /** Effekte an/aus (Dev-Overlay, Einstellung): Leuchtebenen (der Spur-Filter mit Punktraster ist seit Etappe 1 weg) */
  setFx(on: boolean): void {
    this.fxOn = on;
    this.applyFx();
  }

  get fx(): boolean {
    return this.fxOn;
  }

  private applyFx(): void {
    for (const g of this.glows.values()) g.enabled = this.fxOn;
  }

  /** Nur die Spur z sichtbar lassen (alles andere in der Welt aus), null = alles sichtbar; für Spurstreifen-Texturen */
  showOnlyLane(z: number | null): void {
    for (const child of this.world.children) {
      let isLane = false;
      let lane = 0;
      for (const [lz, c] of this.laneContainers) {
        if (c === child) {
          isLane = true;
          lane = lz;
        }
      }
      child.visible = z === null ? true : isLane && lane === z;
    }
  }

  /** Stehender Zug (Zeichenmodus): Pose setzen und Cut-out-Clips fortschreiben */
  updateStandingTrain(cars: CarState[], passengers: PassengerView[], dt: number): void {
    const rail = (s: number) => this.trackR.railFrame(s);
    this.trainR.update(cars, passengers, dt, rail);
    this.trainR.idleUpdate(dt);
    this.worldR?.updateTrain(cars, rail);
  }

  resize(w: number, h: number): void {
    this.camera.resize(w, h);
    this.sky.resize(w, h);
    this.paper.width = w;
    this.paper.height = h;
  }

  update(dt: number): void {
    this.time += dt;
    this.trackR.updateBarriers(this.time);
    this.camera.update(dt);
    const c = this.camera;
    this.world.scale.set(c.zoom, -c.zoom);
    this.world.position.set(c.width / 2 - (c.x + c.ox) * c.zoom, c.height / 2 + (c.y + c.oy) * c.zoom);
    // Perspektive (?persp=1): Kameraziel und -abstand für die Projektion; jeder Spur-Container skaliert um das Ziel.
    // Zwischentiefen (Bahn, Zug) korrigieren die Renderer über toLane; die Bahn wird bei Kamerabewegung neu projiziert.
    const persp = viewState().persp;
    const vx = c.x + c.ox;
    const vy = c.y + c.oy;
    setView(vx, vy, viewDistance(c.zoom, c.height));
    for (const [z, lane] of this.laneContainers) {
      const s = persp ? viewScale(z) : 1;
      lane.scale.set(s, s);
      lane.position.set(vx * (1 - s), vy * (1 - s));
    }
    const lv = this.lastView;
    const moved = persp && (lv.x !== vx || lv.y !== vy || lv.zoom !== c.zoom || !lv.persp);
    this.lastView = { x: vx, y: vy, zoom: c.zoom, persp };
    this.viewMoved = moved;
    if (moved) this.trackR.reproject();
    this.sky.update(dt, c);
    this.effects.update(dt);
  }

  /** Bühnenpunkt → Bildschirm */
  toScreen(X: number, Y: number): { x: number; y: number } {
    return this.camera.toScreen(X, Y);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** kleiner Helfer: Sprite aus Textur mit Mittelpunkt-Anker */
export function centered(sprite: Sprite): Sprite {
  sprite.anchor.set(0.5);
  return sprite;
}
