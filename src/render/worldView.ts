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
import { LANE_MAX, LANE_MIN } from '@/track/stage';
import { Camera } from './camera';
import { Sky } from './sky';
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
  private time = 0;
  private worldDef: WorldDef;
  private night: boolean;

  constructor(worldDef: WorldDef, terrain: Terrain, skin: string, night = false) {
    this.worldDef = worldDef;
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
      lane.addChild(
        this.terrainR.layers.strip.get(z)!,
        this.trackR.layers.supports.get(z)!,
        this.trackR.layers.rails.get(z)!,
        this.trackR.layers.barriers.get(z)!,
        this.trackR.layers.coins.get(z)!,
        this.trainR.layers.get(z)!,
        this.terrainR.layers.cover.get(z)!,
      );
      this.laneContainers.set(z, lane);
      this.world.addChild(lane);
    }
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
  get def(): WorldDef {
    return this.worldDef;
  }

  setTrack(path: TrackPath, samples: TrackSamples, skin: string, terrain: Terrain, allowTunnels: boolean, preview = false): void {
    const portals = this.trackR.draw(path, samples, skin, terrain, allowTunnels, preview);
    if (!preview) this.terrainR.setTunnelPortals(portals);
  }

  /** Streben wachsen (0 … 1) nach dem Loslassen des Strichs */
  growSupports(growth: number): void {
    this.trackR.redrawSupports(growth);
  }

  buildTrain(cars: number, riders: CharacterDef[], perCar: number): void {
    this.trainR.build(cars, riders, perCar);
  }

  updateTrain(cars: CarState[], passengers: PassengerView[], dt: number): void {
    this.trainR.update(cars, passengers, dt);
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
    this.trainR.update(cars, passengers, dt);
    this.trainR.idleUpdate(dt);
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
