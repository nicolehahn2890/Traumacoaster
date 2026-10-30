/**
 * Säume im Weltrenderer (Stufe 6, Plan 4.8, `src/zone/rims.ts`): je Bild ein Mesh mit allen Streifen, die es tragen (ein
 * Draw Call je Bild). Ein Streifen liegt in seiner Ebene eine halbe Stufe vor seiner Form, also hinter den Formen, die in
 * der Ebene weiter vorn liegen. Er ist durchsichtig (das Gras ragt über die Kante), schreibt keine Tiefe und zeichnet vor
 * den durchsichtigen Flächen der Ebenen. Farbe wie bei den Flächen: Bild (vormultipliziert) in sRGB, dazu die
 * Luftperspektive seiner Ebene, dann der Nebel der Welt.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type IUniform } from 'three';
import { airAmount, airOf, planesOf, shapesOf, type ZoneNode, type ZonePlane } from '@/zone/nodes';
import { rimStrip } from '@/zone/rims';
import type { ImageCache } from './imageTextures';

const VERTEX = /* glsl */ `
attribute vec2 aMix;
varying vec2 vUv;
varying vec2 vMix;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vMix = aMix;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uAir;
varying vec2 vUv;
varying vec2 vMix;
#include <common>
#include <fog_pars_fragment>
vec3 toLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}
void main() {
  vec4 tx = texture(uMap, vUv);
  float a = tx.a * vMix.y;
  vec3 c = mix(tx.rgb / max(tx.a, 1e-4), uAir, vMix.x);
  gl_FragColor = vec4(toLinear(clamp(c, 0.0, 1.0)), a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

type RimMesh = Mesh<BufferGeometry, ShaderMaterial>;

export class RimLayer {
  readonly group = new Group();
  private readonly meshes = new Map<string, RimMesh>();
  private readonly air = new Vector3(1, 1, 1);
  /** Bilder (Schlüssel wie im ImageCache) der gezeichneten Säume */
  used = new Set<string>();

  constructor(private readonly images: ImageCache) {
    this.group.name = 'saeume';
  }

  /** Luftfarbe der Zone (sRGB, aufgelöst) */
  setAir(rgb: readonly [number, number, number]): void {
    this.air.set(rgb[0], rgb[1], rgb[2]);
  }

  /** geladene Bilder in die Materialien (nach dem Laden oder dem Tausch gegen KTX2) */
  applyTextures(): void {
    for (const [src, m] of this.meshes) m.material.uniforms.uMap.value = this.images.texture(src);
  }

  /**
   * Säume aller sichtbaren Formen zeichnen; step: Abstand zweier Formen einer Ebene in der Tiefe (wie planeMesh).
   * Gibt die Zahl der Säume zurück
   */
  build(nodes: readonly ZoneNode[], show: (plane: ZonePlane) => boolean, airRgb: readonly [number, number, number], step: number): number {
    this.setAir(airRgb);
    const air = airOf(nodes);
    const bySrc = new Map<string, { pos: number[]; uv: number[]; mix: number[]; index: number[] }>();
    let count = 0;
    for (const plane of planesOf(nodes)) {
      if (!show(plane)) continue;
      const airT = airAmount(air, plane);
      shapesOf(nodes, plane.id).forEach((shape, rank) => {
        if (shape.hidden || !shape.rims?.length) return;
        const Z = -plane.z + (rank + 0.5) * step;
        for (const rim of shape.rims) {
          if (rim.hidden) continue;
          const strip = rimStrip(shape, rim);
          if (!strip.index.length) continue;
          count++;
          let g = bySrc.get(rim.src);
          if (!g) {
            g = { pos: [], uv: [], mix: [], index: [] };
            bySrc.set(rim.src, g);
          }
          const first = g.pos.length / 3;
          for (let i = 0; i < strip.pos.length; i += 2) g.pos.push(plane.x + plane.scale * strip.pos[i], plane.y + plane.scale * strip.pos[i + 1], Z);
          for (let i = 0; i < strip.uv.length; i++) g.uv.push(strip.uv[i]);
          for (let i = 0; i < strip.pos.length / 2; i++) g.mix.push(airT, rim.opacity ?? 1);
          for (let i = 0; i < strip.index.length; i++) g.index.push(strip.index[i] + first);
        }
      });
    }
    for (const [src, m] of this.meshes) {
      if (bySrc.has(src)) continue;
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      this.meshes.delete(src);
    }
    for (const [src, g] of bySrc) {
      const geom = new BufferGeometry();
      geom.setAttribute('position', new BufferAttribute(new Float32Array(g.pos), 3));
      geom.setAttribute('uv', new BufferAttribute(new Float32Array(g.uv), 2));
      geom.setAttribute('aMix', new BufferAttribute(new Float32Array(g.mix), 2));
      geom.setIndex(new BufferAttribute(new Uint32Array(g.index), 1));
      geom.computeBoundingSphere();
      let m = this.meshes.get(src);
      if (m) {
        m.geometry.dispose();
        m.geometry = geom;
      } else {
        const uniforms: Record<string, IUniform> = UniformsUtils.merge([UniformsLib.fog]);
        uniforms.uMap = { value: this.images.texture(src) };
        uniforms.uAir = { value: this.air };
        m = new Mesh(geom, new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, fog: true, transparent: true, depthWrite: false }));
        m.name = `saum ${src}`;
        m.frustumCulled = false;
        // vor den durchsichtigen Flächen der Ebenen (renderOrder ab 0)
        m.renderOrder = -1;
        this.meshes.set(src, m);
        this.group.add(m);
      }
    }
    this.used = new Set(bySrc.keys());
    return count;
  }

  /** Meshes der Säume (Prüfungen) */
  get list(): RimMesh[] {
    return [...this.meshes.values()];
  }

  clear(): void {
    for (const m of this.meshes.values()) {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.meshes.clear();
  }
}
