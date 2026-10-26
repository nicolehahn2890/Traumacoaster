/**
 * Ebenen-Test (Platzhalter): der Scheibenstapel aus src/zone/slices.ts als ein einziges Mesh (ein Zeichenaufruf). Jede
 * Scheibe ist eine senkrechte Fläche an ihrer Tiefe, in Spalten trianguliert (Oberkante, Saum, Fläche, Fuß), mit
 * Farbverlauf als Eckfarben und Punktschattierung im Shader (Punkte in Weltmetern: hinten kleiner, nach unten dichter),
 * dazu ein heller Saum an der Oberkante. Deckend mit Tiefenpuffer: Verdecktes rechnet die GPU nicht.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshLambertMaterial } from 'three';
import type { BuiltElement } from './elements';
import { laneToZ } from './camera';
import { SliceFoundation, type SliceStack } from '@/zone/slices';

/** Zeilen je Spalte: Abstand unter der Oberkante (m; Infinity = Unterkante), Farbe (0 Saum … 1 Fuß), Punktdichte */
const ROWS: Array<{ below: number; tone: number; shade: number }> = [
  { below: 0, tone: 0, shade: 0 },
  { below: 0.5, tone: 0.18, shade: 0.04 },
  { below: 3.5, tone: 0.24, shade: 0.2 },
  { below: 10, tone: 0.75, shade: 0.6 },
  { below: Infinity, tone: 1, shade: 1 },
];

function sliceMaterial(): MeshLambertMaterial {
  // ohne Szenen-Nebel: jede Scheibe trägt ihren Dunst schon in der Farbe (der Nebel schluckte die Berge ab 244 m)
  const m = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, fog: false });
  m.customProgramCacheKey = () => 'slices';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shade;\nattribute float dotSize;\nvarying float vShade;\nvarying float vDot;\nvarying vec2 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShade = shade;\n  vDot = dotSize;\n  vWorld = (modelMatrix * vec4(position, 1.0)).xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;\nvarying float vDot;\nvarying vec2 vWorld;\nfloat hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  // Punktschattierung: ein Punkt je Zelle, leicht versetzt, Radius wächst mit der Schattierung (Saum fast ohne Punkte)
  vec2 cell = vWorld / max(vDot, 0.01);
  vec2 id = floor(cell);
  float h = hash2(id);
  vec2 f = fract(cell) - 0.5 + (vec2(h, hash2(id + 7.1)) - 0.5) * 0.45;
  float r = 0.42 * sqrt(clamp((vShade - 0.12) * (0.5 + 0.8 * h), 0.0, 1.0));
  float aa = fwidth(length(cell)) * 0.9 + 0.02;
  float dotMask = vDot > 0.0 ? 1.0 - smoothstep(r - aa, r + aa, length(f)) : 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.74, dotMask * 0.8);
  // heller Saum direkt unter der Oberkante
  diffuseColor.rgb += vec3(0.10, 0.10, 0.06) * (1.0 - smoothstep(0.0, 0.06, vShade));`,
      );
  };
  return m;
}

/** der Stapel als Element der Zone: ein Mesh, Fundament auf den Kanten */
export function buildSliceElement(stack: SliceStack): BuiltElement {
  const pos: number[] = [];
  const col: number[] = [];
  const shade: number[] = [];
  const dot: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  const tmp = new Color();
  for (const s of stack.slices) {
    const Z = laneToZ(s.lane);
    const rim = new Color(s.colors.rim);
    const top = new Color(s.colors.top);
    const bottom = new Color(s.colors.bottom);
    const n = s.top.length;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = s.x0 + i * s.step;
      const t = s.top[i];
      const l = s.low[i];
      for (const row of ROWS) {
        const y = Math.max(l, row.below === Infinity ? l : t - row.below);
        pos.push(x, y, Z);
        if (row.tone <= 0.18) c.copy(rim).lerp(top, row.tone / 0.18);
        else c.copy(top).lerp(tmp.copy(bottom), (row.tone - 0.18) / 0.82);
        col.push(c.r, c.g, c.b);
        shade.push(row.shade);
        dot.push(s.dot);
      }
    }
    const R = ROWS.length;
    for (let i = 0; i < n - 1; i++) {
      for (let r = 0; r < R - 1; r++) {
        const a = base + i * R + r;
        const b = base + (i + 1) * R + r;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('shade', new BufferAttribute(new Float32Array(shade), 1));
  g.setAttribute('dotSize', new BufferAttribute(new Float32Array(dot), 1));
  const normals = new Float32Array(pos.length);
  for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setIndex(pos.length / 3 > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
  const material = sliceMaterial();
  const mesh = new Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const group = new Group();
  group.add(mesh);
  return {
    kind: 'flat',
    group,
    foundation: new SliceFoundation(stack),
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}

/** Ecken und Dreiecke des Stapels (für die Messung) */
export function sliceStats(stack: SliceStack): { slices: number; vertices: number; triangles: number } {
  let v = 0;
  for (const s of stack.slices) v += s.top.length * ROWS.length;
  let t = 0;
  for (const s of stack.slices) t += (s.top.length - 1) * (ROWS.length - 1) * 2;
  return { slices: stack.slices.length, vertices: v, triangles: t };
}

