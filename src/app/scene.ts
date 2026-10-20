import type { Container } from 'pixi.js';
import type { InputHandlers } from '@/core/input';
import type { Game } from './game';

/** Eine Szene besitzt einen Container, Eingabe-Handler und einen Update-Loop. */
export interface Scene {
  readonly container: Container;
  readonly handlers: InputHandlers;
  enter(game: Game): void | Promise<void>;
  exit(): void;
  update(dt: number): void;
  resize(w: number, h: number): void;
}
