import type { Container } from 'pixi.js';
import type { InputHandlers } from '@/core/input';
import type { Game } from './game';

/** Eine Szene besitzt einen Container, Eingabe-Handler und einen Update-Loop. */
export interface Scene {
  readonly container: Container;
  readonly handlers: InputHandlers;
  /** Container, der mit dem Weltrenderer vor der Three-Welt gezeichnet wird (der Himmel); sonst nichts */
  readonly background?: Container;
  enter(game: Game): void | Promise<void>;
  exit(): void;
  update(dt: number): void;
  resize(w: number, h: number): void;
}
