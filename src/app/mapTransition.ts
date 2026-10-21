/**
 * Übergang Karte ↔ Level: Das Level wird in drei Ebenen fotografiert (Himmel, Bühne, Bedienelemente).
 * Die Karte biegt die Bühne auf die Drehscheibe oder von ihr herunter und blendet Himmel und Knöpfe über
 * (siehe StartScene). Die Kamera hält fest, wie Bühnen-Meter auf dem Bildschirm liegen.
 */
import type { Container, RenderTexture } from 'pixi.js';
import type { Camera } from '@/render/camera';
import type { Game } from './game';

export interface LevelLayers {
  sky: Container;
  world: Container;
  ui: Container;
  camera: Camera;
}

export interface LevelSnapshot {
  levelId: number;
  sky: RenderTexture;
  world: RenderTexture;
  ui: RenderTexture;
  /** Kamera des Levels im Moment des Fotos */
  cam: { x: number; y: number; zoom: number; width: number; height: number };
}

export function captureLevel(game: Game, levelId: number, layers: LevelLayers): LevelSnapshot {
  const c = layers.camera;
  return {
    levelId,
    sky: game.snapshot(layers.sky),
    world: game.snapshot(layers.world),
    ui: game.snapshot(layers.ui),
    cam: { x: c.x, y: c.y, zoom: c.zoom, width: c.width, height: c.height },
  };
}

export function releaseSnapshot(s: LevelSnapshot): void {
  s.sky.destroy(true);
  s.world.destroy(true);
  s.ui.destroy(true);
}
