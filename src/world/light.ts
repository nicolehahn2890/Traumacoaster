/**
 * Licht der Welt (Etappe 1, Schritt 2; Werte aus dem Tiefen-Labor, Richtlinie 5): Die gemalten Flächen bekommen ihre
 * Helligkeit fast nur aus dem Umgebungslicht, das Richtungslicht von hinten oben links ist schwach und dient dem
 * Schatten, der in Schritt 4 mit der Shadow Map dazukommt.
 */
import { AmbientLight, DirectionalLight, Group, HemisphereLight } from 'three';

export function buildLights(): Group {
  const g = new Group();
  g.name = 'lights';
  const ambient = new AmbientLight(0xffffff, 0.92);
  const hemi = new HemisphereLight(0xdfefff, 0x6a7a40, 0.15);
  const dir = new DirectionalLight(0xfff2d0, 0.22);
  dir.position.set(20, 150, -110);
  dir.target.position.set(90, 0, 0);
  g.add(ambient, hemi, dir, dir.target);
  return g;
}
