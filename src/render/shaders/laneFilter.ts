/**
 * Spur-Filter (ein Durchgang je Spur): Earle-Stippling auf dunklen Pixeln über ein Hash-Raster in
 * Bildschirmpixeln (Punkte bleiben bei jedem Zoom ein bis drei Pixel groß) und, wahlweise, eine gestufte
 * Luftperspektive (Mischung zum Himmel in zwei harten Stufen). Läuft in halber Auflösung.
 */
import { Filter, GlProgram } from 'pixi.js';
import { hexToRgb } from '../paint';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
precision mediump float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec3 uStipple;
uniform vec3 uSky;
uniform float uDepth;
uniform float uThreshold;
uniform float uDotSize;
uniform float uDensity;

/** Hash eines Rasterfelds (deterministisch, ohne Textur) */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a < 0.01) {
    finalColor = c;
    return;
  }
  vec3 rgb = c.rgb / max(c.a, 0.001);
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  // Schattenseite: je dunkler, desto dichter die Punkte (zur Lichtseite hin dünner)
  float dark = clamp((uThreshold - lum) / max(uThreshold, 0.001), 0.0, 1.0);
  vec2 cell = floor(gl_FragCoord.xy / uDotSize);
  float h = hash(cell);
  vec2 inCell = fract(gl_FragCoord.xy / uDotSize) - 0.5;
  float dot1 = step(length(inCell), 0.28);
  float on = step(1.0 - dark * uDensity, h) * dot1;
  rgb = mix(rgb, uStipple, on * 0.85);
  // Luftperspektive in zwei harten Stufen
  float steps = floor(uDepth * 2.0 + 0.5) / 2.0;
  rgb = mix(rgb, uSky, steps * 0.45);
  finalColor = vec4(rgb * c.a, c.a);
}
`;

export interface LaneFilterOptions {
  stipple: string;
  sky: string;
  /** 0 (vorne) … 1 (hinten) */
  depth?: number;
  /** Helligkeit, unter der getupft wird */
  threshold?: number;
  /** Rasterweite in Bildschirmpixeln */
  dotSize?: number;
  /** Anteil der Felder mit Punkt bei voller Dunkelheit */
  density?: number;
}

export class LaneFilter extends Filter {
  constructor(opts: LaneFilterOptions) {
    const s = hexToRgb(opts.stipple).map((v) => v / 255);
    const k = hexToRgb(opts.sky).map((v) => v / 255);
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'lane-stipple' }),
      resources: {
        laneUniforms: {
          uStipple: { value: new Float32Array(s), type: 'vec3<f32>' },
          uSky: { value: new Float32Array(k), type: 'vec3<f32>' },
          uDepth: { value: opts.depth ?? 0, type: 'f32' },
          uThreshold: { value: opts.threshold ?? 0.42, type: 'f32' },
          uDotSize: { value: opts.dotSize ?? 4, type: 'f32' },
          uDensity: { value: opts.density ?? 0.55, type: 'f32' },
        },
      },
      resolution: 0.5,
      antialias: 'off',
    });
  }

  set depth(v: number) {
    (this.resources.laneUniforms as { uniforms: { uDepth: number } }).uniforms.uDepth = v;
  }
}
