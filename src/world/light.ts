/**
 * Licht und Schatten der Welt (Etappe 1, Schritt 4; Richtlinie 5, Tiefen-Labor): Die gemalten Flächen bekommen ihre
 * Helligkeit fast nur aus dem Umgebungslicht, das Richtungslicht von hinten oben links ist schwach und dient dem
 * Schatten, der nach vorn auf den Boden fällt, wo man ihn sieht. Eine Shadow Map (1024², weich), deren Kasten dem
 * Kameraziel folgt; `?shadow=0` schaltet sie ab (Messung auf schwachen Geräten). Der Look setzt Farben und Stärken.
 */
import { AmbientLight, DirectionalLight, Group, HemisphereLight } from 'three';
import type { Look } from './looks';

/** Lage des Richtungslichts relativ zum Kameraziel (Meter): hinten oben links */
const SUN_OFFSET = { x: -70, y: 150, z: -110 };
/** halbe Kantenlänge des Schattenkastens (Meter) */
const SHADOW_HALF = 90;

export class WorldLights {
  readonly group = new Group();
  readonly ambient = new AmbientLight(0xffffff, 0.92);
  readonly hemi = new HemisphereLight(0xdfefff, 0x6a7a40, 0.15);
  readonly sun = new DirectionalLight(0xfff2d0, 0.22);

  constructor(shadows: boolean) {
    this.group.name = 'lights';
    this.sun.castShadow = shadows;
    const sh = this.sun.shadow;
    sh.mapSize.set(1024, 1024);
    sh.camera.left = -SHADOW_HALF;
    sh.camera.right = SHADOW_HALF;
    sh.camera.top = SHADOW_HALF;
    sh.camera.bottom = -SHADOW_HALF;
    sh.camera.near = 20;
    sh.camera.far = 600;
    sh.bias = -0.0008;
    sh.normalBias = 0.6;
    this.follow(90);
    this.group.add(this.ambient, this.hemi, this.sun, this.sun.target);
  }

  /** Licht und Schattenkasten folgen dem Kameraziel entlang der Bühne */
  follow(cx: number): void {
    this.sun.target.position.set(cx, 0, 0);
    this.sun.position.set(cx + SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
  }

  apply(look: Look): void {
    this.ambient.intensity = look.ambient;
    this.hemi.intensity = look.ambient * 0.2;
    this.sun.intensity = look.sun;
    this.sun.color.set(look.sunColor);
  }

  set shadows(on: boolean) {
    this.sun.castShadow = on;
  }
  get shadows(): boolean {
    return this.sun.castShadow;
  }
}
