/**
 * Punktkronen im Weltrenderer (docs/ZONENEDITOR-PLAN.md, Stufe 5; Punkte aus `src/zone/crown.ts`): alle Kronenpunkte der
 * Zone als Instanzen eines Achtecks in einem Mesh (ein Draw Call). Deckend und ohne discard, damit die GPU am Handy
 * Verdecktes weiter vor dem Shader verwirft (die Kanten glättet das Multisampling des Renderers). Jeder Punkt schaut zur
 * Kamera, schwingt im Wind (Phase je Punkt, Zeit aus der Uhr) und fällt unter etwa einem Bildpunkt Größe weg, damit er bei
 * fahrender Kamera nicht flimmert. Farbe je Punkt kommt fertig (Tonstufe, Luftperspektive der Ebene); den Nebel der Welt
 * rechnet der Shader.
 */
import { BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type WebGLRenderer } from 'three';

/** Ecken des Achtecks */
const SIDES = 8;

const VERTEX = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iData;
attribute vec3 iColor;
uniform float uTime;
uniform float uHalfH;
varying vec3 vColor;
#include <common>
#include <fog_pars_vertex>
void main() {
  // Wind: zwei langsame Schwingungen mit eigener Phase je Punkt (iPos.w), Ausschlag iData.y
  float sway = (sin(uTime * 1.1 + iPos.w) * 0.6 + sin(uTime * 0.47 + iPos.w * 2.3) * 0.4) * iData.y;
  vec4 mvPosition = modelViewMatrix * vec4(iPos.x + sway, iPos.y, iPos.z, 1.0);
  float r = iData.x * 0.5;
  // Halbmesser in Bildpunkten (perspektivisch mit dem Abstand, orthografisch ohne); unter etwa einem fällt er weg
  float rpx = r * projectionMatrix[1][1] * uHalfH / (isPerspectiveMatrix(projectionMatrix) ? max(1e-3, -mvPosition.z) : 1.0);
  r *= smoothstep(0.35, 0.8, rpx);
  mvPosition.xy += position.xy * r;
  gl_Position = projectionMatrix * mvPosition;
  vColor = iColor;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
#include <common>
#include <fog_pars_fragment>
vec3 toLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}
void main() {
  gl_FragColor = vec4(toLinear(clamp(vColor, 0.0, 1.0)), 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

/** ein Punkt für den Aufbau: Welt-Lage, Phase, Durchmesser (Welt), Windausschlag (Welt), Farbe (sRGB) */
export interface CrownDot {
  x: number;
  y: number;
  z: number;
  phase: number;
  size: number;
  wind: number;
  r: number;
  g: number;
  b: number;
}

export class CrownLayer {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly uniforms = UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uHalfH: { value: 400 } }]);
  private capacity = 0;
  /** Zahl der Punkte des letzten Aufbaus (Leistungsanzeige) */
  dots = 0;

  constructor() {
    const geom = new InstancedBufferGeometry();
    const pos = new Float32Array((SIDES + 1) * 3);
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      pos[(i + 1) * 3] = Math.cos(a);
      pos[(i + 1) * 3 + 1] = Math.sin(a);
    }
    const index: number[] = [];
    for (let i = 0; i < SIDES; i++) index.push(0, i + 1, ((i + 1) % SIDES) + 1);
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setIndex(index);
    this.ensure(geom, 64);
    geom.instanceCount = 0;
    const material = new ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, fog: true });
    this.mesh = new Mesh(geom, material);
    this.mesh.name = 'ebenen-kronen';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const size = new Vector2();
    this.mesh.onBeforeRender = (renderer: WebGLRenderer) => {
      this.uniforms.uTime.value = performance.now() / 1000;
      this.uniforms.uHalfH.value = renderer.getDrawingBufferSize(size).y / 2;
    };
  }

  /** Platz für n Punkte (in Zweierpotenzen, damit Bearbeiten selten neu anlegt) */
  private ensure(geom: InstancedBufferGeometry, n: number): void {
    if (n <= this.capacity) return;
    const cap = 2 ** Math.ceil(Math.log2(Math.max(64, n)));
    geom.setAttribute('iPos', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geom.setAttribute('iData', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geom.setAttribute('iColor', new InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    this.capacity = cap;
  }

  /** alle Punkte der Zone neu setzen */
  build(dots: readonly CrownDot[]): void {
    const geom = this.mesh.geometry;
    this.ensure(geom, dots.length);
    const pos = (geom.getAttribute('iPos') as InstancedBufferAttribute).array as Float32Array;
    const data = (geom.getAttribute('iData') as InstancedBufferAttribute).array as Float32Array;
    const col = (geom.getAttribute('iColor') as InstancedBufferAttribute).array as Float32Array;
    dots.forEach((d, i) => {
      pos.set([d.x, d.y, d.z, d.phase], i * 4);
      data.set([d.size, d.wind, 0, 0], i * 4);
      col.set([d.r, d.g, d.b], i * 3);
    });
    for (const k of ['iPos', 'iData', 'iColor']) (geom.getAttribute(k) as InstancedBufferAttribute).needsUpdate = true;
    geom.instanceCount = dots.length;
    this.mesh.visible = dots.length > 0;
    this.dots = dots.length;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
