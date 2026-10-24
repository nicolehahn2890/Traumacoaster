/**
 * Looks des Weltrenderers (Etappe 1, Schritt 4; Richtlinie 6, Tiefen-Labor): Ein Look ist ein Satz aus Lichtfarben und
 * -stärken, Nebelfarbe und Umfärbe-Werten (Farbtondrehung, Sättigung, Helligkeit, Gradient-Map, Tönung), der auf alle
 * gemalten Flächen wirkt, ohne neue Grafiken je Zone. Vier Presets aus dem Labor: Tag, Abend, Nacht, Neon. Die Zone
 * wählt den Look je Fortschrittsstufe (Paket 2); `?look=day|dusk|night|neon` erzwingt einen zum Vergleich. Der
 * Umfärbe-Shader hängt sich an Lambert-Materialien (`paintedMaterial`), alle Flächen teilen dieselben Uniforms.
 */
import { Color, MeshLambertMaterial, type MeshLambertMaterialParameters } from 'three';

export type LookName = 'day' | 'dusk' | 'night' | 'neon';
export const LOOK_NAMES: readonly LookName[] = ['day', 'dusk', 'night', 'neon'];

export interface Look {
  /** Farbtondrehung (Radiant), Sättigung, Helligkeit, Anteil der Gradient-Map und ihre drei Farben (dunkel, mittel, hell), Tönung */
  hue: number;
  sat: number;
  bright: number;
  gradeMix: number;
  gradeA: string;
  gradeB: string;
  gradeC: string;
  tint: string;
  /** Umgebungslicht und Richtungslicht (Stärke, Farbe) */
  ambient: number;
  sun: number;
  sunColor: string;
  /** Nebelfarbe; sie wird mit dem Himmel der Welt gemischt */
  fog: string;
  /** Hintergrund des Looks (solange der Himmel in Pixi liegt, nur für die Nebelmischung) */
  background: string;
}

export const LOOKS: Record<LookName, Look> = {
  day: { hue: 0, sat: 1, bright: 1, gradeMix: 0, gradeA: '#1a1f3a', gradeB: '#5a6aa0', gradeC: '#fff2c8', tint: '#ffffff', ambient: 0.92, sun: 0.22, sunColor: '#fff2d0', fog: '#fff6dc', background: '#9fd8ff' },
  dusk: { hue: -0.12, sat: 1.15, bright: 0.95, gradeMix: 0.35, gradeA: '#2a1a3e', gradeB: '#c25a4a', gradeC: '#ffd9a0', tint: '#ffe6d0', ambient: 0.78, sun: 0.2, sunColor: '#ffb070', fog: '#ffb080', background: '#ff9a6a' },
  night: { hue: 0.1, sat: 0.72, bright: 0.58, gradeMix: 0.5, gradeA: '#0a0f2a', gradeB: '#2c4680', gradeC: '#b4d2ff', tint: '#c0ccff', ambient: 0.5, sun: 0.12, sunColor: '#8fa8ff', fog: '#6a8aff', background: '#0a1030' },
  neon: { hue: 2.4, sat: 1.5, bright: 0.8, gradeMix: 0.5, gradeA: '#140428', gradeB: '#8a1aa0', gradeC: '#5cf0ff', tint: '#ffffff', ambient: 0.55, sun: 0.12, sunColor: '#ff5cf0', fog: '#ff3cc8', background: '#120626' },
};

export function parseLook(s: string | null | undefined): LookName | null {
  return (LOOK_NAMES as readonly string[]).includes(s ?? '') ? (s as LookName) : null;
}

/** Umfärbe-Uniforms, geteilt von allen gemalten Materialien */
export const grade = {
  uHue: { value: 0 },
  uSat: { value: 1 },
  uBright: { value: 1 },
  uGradeMix: { value: 0 },
  uGradeA: { value: new Color('#1a1f3a') },
  uGradeB: { value: new Color('#5a6aa0') },
  uGradeC: { value: new Color('#fff2c8') },
  uTint: { value: new Color('#ffffff') },
};

/** Umfärbe-Werte eines Looks setzen (wirkt sofort auf alle gemalten Materialien) */
export function applyGrade(look: Look): void {
  grade.uHue.value = look.hue;
  grade.uSat.value = look.sat;
  grade.uBright.value = look.bright;
  grade.uGradeMix.value = look.gradeMix;
  grade.uGradeA.value.set(look.gradeA);
  grade.uGradeB.value.set(look.gradeB);
  grade.uGradeC.value.set(look.gradeC);
  grade.uTint.value.set(look.tint);
}

const GLSL = `
uniform float uHue, uSat, uBright, uGradeMix;
uniform vec3 uGradeA, uGradeB, uGradeC, uTint;
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float cosA = cos(a), sinA = sin(a);
  return c * cosA + cross(k, c) * sinA + k * dot(k, c) * (1.0 - cosA);
}
vec3 recolor(vec3 c) {
  c = hueShift(c, uHue);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  vec3 g = l < 0.5 ? mix(uGradeA, uGradeB, l * 2.0) : mix(uGradeB, uGradeC, (l - 0.5) * 2.0);
  c = mix(c, g, uGradeMix);
  return c * uBright * uTint;
}
`;

/** Lambert-Material, das der Look umfärbt (Farbe oder Textur, vor dem Licht) */
export function paintedMaterial(params: MeshLambertMaterialParameters = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial(params);
  m.customProgramCacheKey = () => 'painted';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grade);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = recolor(diffuseColor.rgb);');
  };
  return m;
}
