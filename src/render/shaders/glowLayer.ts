/**
 * Leuchtebene: Leuchtstriche (Coins, Schienenkanten bei Nacht, Laternen) werden in einen eigenen Container
 * gezeichnet, weichgezeichnet und additiv über die Spur gelegt. Halbe Auflösung, zwei Durchgänge.
 */
import { BlurFilter, Container } from 'pixi.js';

export class GlowLayer {
  readonly container = new Container();
  private readonly blur: BlurFilter;

  constructor(strength = 6) {
    this.blur = new BlurFilter({ strength, quality: 2, resolution: 0.5 });
    this.container.filters = [this.blur];
    this.container.blendMode = 'add';
  }

  set enabled(on: boolean) {
    this.container.filters = on ? [this.blur] : [];
    this.container.blendMode = on ? 'add' : 'normal';
  }

  clear(): void {
    this.container.removeChildren();
  }
}
