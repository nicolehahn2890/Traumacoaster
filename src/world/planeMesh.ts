/**
 * Ebenen des Zonen-Editors im Weltrenderer (docs/ZONENEDITOR-PLAN.md, Stufe 1 und 3): alle sichtbaren Formen aller Ebenen
 * mit **einem Ebenen-Material** (Plan 5.3), unbeleuchtet wie eine gemalte Fläche; der Nebel der Welt gilt
 * (Luftperspektive). Undurchsichtige Flächen sind ein Mesh (ein Draw Call), Flächen, die durchsichtig werden können
 * (Deckkraft, Deckkraftverlauf), ein zweites, von hinten nach vorn sortiert. Die Formen einer Ebene liegen in
 * Zeichenreihenfolge je 3 mm vor der Ebene, damit der Tiefenpuffer nicht flackert.
 *
 * Füllstapel (Stufe 3, `src/zone/paint.ts`): Jede Fläche trägt in einer Ecken-Eigenschaft ihre Zeile in der Stil-Datentextur
 * (Schichten mit Art, Mischmodus, Deckkraft, Farbe oder Verlaufsgriffen) und die Zeile ihrer Ebene (Ebenenstapel); die
 * Verläufe liegen als Farbbänder in einer zweiten Textur. Der Shader rechnet die Schichten wie `evalLayers` (sRGB,
 * W3C-Mischmodi), wandelt dann nach linear und gibt sie dem Nebel. Gleiche Anstriche teilen eine Zeile; Palettenfarben
 * werden erst beim Füllen der Textur aufgelöst, darum tauscht ein Look nur die Texturen.
 *
 * Die Triangulierung je Form wird zwischengespeichert, solange ihr Pfad dasselbe Objekt bleibt: Verschieben, Skalieren
 * und Tiefe ändern rechnen nur die Lage der Ecken neu, so bleibt das Ziehen im Editor auch mit 30 Ebenen flüssig.
 *
 * Earle-Schichten (Stufe 5, Plan 3.2 und 4.7) sind Füllungen wie Farbe und Verlauf: Lichtkante und Innenschatten lesen den
 * Kantenabstand der Fläche (Atlas aus `src/zone/edgeDistance.ts`) um die Lichtrichtung der Zone verschoben, Pünktchen
 * kommen aus einer Rang-Kachel, Papier und Gouache aus einer Kachel, Bänder und Kantenverlauf sind Arten des Verlaufs.
 * Muster haften an ihrer Form (Ebenenstapel: an ihrer Ebene), jede Form und Ebene hat ihren eigenen Versatz, damit die
 * Muster über die Ebenen nicht fluchten (Mangel 3 des Test-Shaders der Kamerasession); Punkte bleiben in ihrer Zelle
 * (Mangel 1), der Zufall kommt ohne Sinus aus (Mangel 2), die Ebenen empfangen keine Schatten (Mangel 4). Den
 * Kantenabstand bekommen nur Flächen, deren Schichten ihn brauchen; Flächen ohne Earle-Schichten rechnen wie vorher.
 */
import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, ShapeUtils, UniformsLib, UniformsUtils, Vector2, Vector3, type IUniform, type Raycaster } from 'three';
import { airAmount, airOf, facePaint, lightIn, lightOf, planeHidden, planesOf, shapeFaces, shapesOf, styleMap, swatchMap, type ZoneLight, type ZoneNode, type ZonePlane, type ZoneShape } from '@/zone/nodes';
import { BLEND_MODES, DOT_SOURCES, MAX_LAYERS, RAMP, hexToRgb, isGradient, layersClear, layersNeedEdge, paintLayers, rampOf, resolveColor, visibleLayers, type Box, type SwatchMap, type ZoneFill } from '@/zone/paint';
import { faceBox, type Face } from '@/zone/faces';
import { EDGE_IN, EDGE_OUT, faceEdge, type EdgeRaster } from '@/zone/edgeDistance';
import { EdgeAtlas, grainTexture, rankTexture, RANK_N } from './earleTextures';
import { cachedCrownPoints, crownColor, CROWN_DEFAULT, CROWN_STRIDE, shapeDots } from '@/zone/crown';
import { cachedWavyFace } from '@/zone/edgeWave';
import { CrownLayer, type CrownDot } from './crownMesh';

/** was eine Punktkrone zum Zeichnen braucht: ihre Punkte (crown.ts), Form, Ebene, Rang, Grundfarbe, Luftanteil, Ton, Wind */
interface CrownInput {
  pts: Float32Array;
  shape: ZoneShape;
  plane: ZonePlane;
  rank: number;
  base: string;
  air: number;
  tone: number;
  wind: number;
}
import type { LookName } from './looks';

/** Abstand zweier Formen derselben Ebene in der Tiefe (Meter, zum Betrachter hin) */
const ORDER_STEP = 0.003;
/** Texel je Schicht in der Stil-Datentextur (A: Art, Mischmodus, Deckkraft, Zusatz; B bis D: Werte der Art) */
const PER_LAYER = 4;
/** Texel je Zeile: Kopf, dann je Schicht PER_LAYER */
const ROW_W = 1 + PER_LAYER * MAX_LAYERS;

/** Arten im Shader (Texel A.x) */
const CODE = { color: 0, linear: 1, radial: 2, fadeLinear: 3, fadeRadial: 4, edge: 5, fadeEdge: 6, light: 7, shade: 8, dots: 9, grain: 10, sparkle: 11 } as const;

interface Triangulated {
  /** Ecken in Pfad-Koordinaten (x, y abwechselnd) */
  pts: Float32Array;
  /** Dreiecke als Eckennummern */
  index: Uint32Array;
}

/** Triangulierung je Fläche; die Flächen selbst speichert shapeFaces zwischen, solange der Pfad derselbe bleibt */
const cache = new WeakMap<Face, Triangulated>();

/** Feinheit der Glättung: bei großem Maßstab feiner, in Zweierpotenzen, damit Ziehen den Zwischenspeicher trifft */
export function fineness(shape: ZoneShape, plane: ZonePlane): number {
  const s = Math.max(Math.abs(shape.sx), Math.abs(shape.sy)) * Math.abs(plane.scale);
  return Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1e-3, s))));
}

/** Triangulierung einer Fläche in Pfad-Koordinaten (zwischengespeichert) */
export function triangulateFace(face: Face): Triangulated {
  const hit = cache.get(face);
  if (hit) return hit;
  const outline = face.outline.map(([x, y]) => new Vector2(x, y));
  const holes = face.holes.map((h) => h.map(([x, y]) => new Vector2(x, y)));
  let tris: number[][] = [];
  if (outline.length >= 3) {
    try {
      tris = ShapeUtils.triangulateShape(outline, holes);
    } catch {
      tris = [];
    }
  }
  const all = [...outline, ...holes.flat()];
  const pts = new Float32Array(all.length * 2);
  all.forEach((v, i) => {
    pts[i * 2] = v.x;
    pts[i * 2 + 1] = v.y;
  });
  const index = new Uint32Array(tris.length * 3);
  tris.forEach((tri, i) => index.set(tri, i * 3));
  const out = { pts, index };
  cache.set(face, out);
  return out;
}

const NO_BOX: Box = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

export interface PlaneBuildOptions {
  /** Ebene zeichnen? (ausgeblendet, isoliert); ohne Angabe alle außer den ausgeblendeten */
  showPlane?: (plane: ZonePlane) => boolean;
}

/**
 * Zeile der Stil-Datentextur: Schichten mit Palettenverweisen (aufgelöst wird beim Füllen der Textur); air: Anteil der
 * Luftfarbe (Zeilen der Ebenen); edgeLen: Tiefe der Kantenverläufe in Metern der Ebene je Schicht (hängt vom Maßstab der
 * Form ab, darum Teil der Zeile)
 */
interface Row {
  layers: readonly ZoneFill[];
  opacity: number;
  air: number;
  edgeLen: readonly number[];
}

/** Versatz der Muster je Form oder Ebene (Meter), aus der Kennung */
function seedOffset(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = (h >>> 0) / 4294967296;
  const b = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) / 4294967296;
  return [Math.round(a * 1024 * 100) / 100, Math.round(b * 1024 * 100) / 100];
}

const VERTEX = /* glsl */ `
uniform highp sampler2D uPaint;
uniform vec3 uAir;
attribute vec2 aLocal;
attribute vec2 aPlane;
attribute vec2 aRows;
attribute vec4 aPat;
attribute vec4 aEdge;
attribute vec4 aEdgeRect;
varying vec2 vLocal;
varying vec2 vPlane;
varying vec4 vPat;
varying vec4 vEdge;
flat varying vec4 vEdgeRect;
flat varying ivec2 vRows;
flat varying vec4 vSolid;
#include <common>
#include <fog_pars_vertex>
void main() {
  vLocal = aLocal;
  vPlane = aPlane;
  vPat = aPat;
  vEdge = aEdge;
  vEdgeRect = aEdgeRect;
  vRows = ivec2(aRows + 0.5);
  // schneller Weg (Leistung am Handy): nur die Grundfarbe, kein Ebenenstapel, deckend; dann liest jede Ecke die Farbe
  // einmal, und der Pixel-Shader braucht keine Textur
  vec4 hf = texelFetch(uPaint, ivec2(0, vRows.x), 0);
  vec4 hp = texelFetch(uPaint, ivec2(0, vRows.y), 0);
  vSolid = vec4(0.0);
  // (eine einzige Schicht, und sie ist eine Farbe: nach dem Kürzen verdeckter Schichten kann es auch ein Verlauf sein)
  if (hf.x < 1.5 && texelFetch(uPaint, ivec2(1, vRows.x), 0).x < 0.5 && hp.x < 0.5 && hf.y > 0.999) vSolid = vec4(mix(texelFetch(uPaint, ivec2(2, vRows.x), 0).rgb, uAir, hp.z), 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const PRELUDE = /* glsl */ `
uniform highp sampler2D uPaint;
uniform highp sampler2D uRamp;
uniform sampler2D uEdge;
uniform highp sampler2D uRank;
uniform sampler2D uGrain;
uniform vec3 uAir;
uniform vec2 uLight;
uniform vec3 uLightColor;
uniform vec3 uShadeColor;
uniform float uTime;
varying vec2 vLocal;
varying vec2 vPlane;
varying vec4 vPat;
varying vec4 vEdge;
flat varying vec4 vEdgeRect;
flat varying ivec2 vRows;
flat varying vec4 vSolid;
#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

vec3 toLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}
float lumOf(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lumOf(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / max(1e-6, l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(1e-6, x - l);
  return c;
}
vec3 softD(vec3 b) { return mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25))); }
// Mischfunktion B(Hintergrund, Quelle), Reihenfolge wie BLEND_MODES
vec3 blendFn(int m, vec3 b, vec3 s) {
  if (m == 1) return b * s;
  if (m == 2) return b + s - b * s;
  if (m == 3) return mix(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, step(b, vec3(0.5)));
  if (m == 4) return mix(b + (2.0 * s - 1.0) * (softD(b) - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), step(s, vec3(0.5)));
  if (m == 5) {
    vec3 r = min(vec3(1.0), b / max(vec3(1e-6), 1.0 - s));
    r = mix(r, vec3(1.0), step(1.0, s));
    return mix(r, vec3(0.0), step(b, vec3(0.0)));
  }
  if (m == 6) return clipColor(s + (lumOf(b) - lumOf(s)));
  return s;
}
vec4 rampAt(int row, float t) {
  float p = clamp(t, 0.0, 1.0) * ${RAMP - 1}.0;
  int i = min(${RAMP - 2}, int(floor(p)));
  return mix(texelFetch(uRamp, ivec2(i, row), 0), texelFetch(uRamp, ivec2(i + 1, row), 0), p - float(i));
}
float gradT(int code, vec4 g, vec2 p) {
  vec2 d = g.zw - g.xy;
  float len2 = dot(d, d);
  if (len2 < 1e-12) return 0.0;
  if (code == ${CODE.radial} || code == ${CODE.fadeRadial}) return length(p - g.xy) / sqrt(len2);
  return dot(p - g.xy, d) / len2;
}
// Zufall ohne Sinus (genau auch bei großen Zellnummern)
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Funkeln: je Zelle höchstens ein Glanzpunkt (Rang-Kachel, Wabenraster), der in eigener Phase kurz als Kreuz aufleuchtet.
// C: Größe, Zelle (× Größe), Dichte, Tempo (je Sekunde); D.x: Samen
float sparkleAt(vec2 pat, vec4 C, vec4 D, float px) {
  float cell = C.x * C.y;
  vec2 q = pat / vec2(cell, cell * 0.866) + floor(vec2(hash12(vec2(D.x, 5.3)), hash12(vec2(D.x, 9.1))) * ${RANK_N}.0);
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 id = floor(q);
  vec4 T = texelFetch(uRank, ivec2(mod(id, ${RANK_N}.0)), 0);
  float r = min(0.43, 0.5 / C.y);
  vec2 f = (q - id - 0.5) * vec2(1.0, 0.866) - T.xy * vec2(0.5 - r, 0.433 - r);
  float pulse = pow(max(0.0, sin((uTime * C.w + T.w) * 6.2832)), 6.0);
  vec2 a = abs(f) / r;
  // zwei schmale Strahlen und ein kleiner Kern
  float star = max(max(1.0 - a.x - 7.0 * a.y, 1.0 - a.y - 7.0 * a.x), 1.0 - length(a) * 2.5);
  float aa = px / (cell * r);
  return step(T.z, C.z) * pulse * smoothstep(-aa, aa, star) * smoothstep(0.35, 0.8, r * cell / max(px, 1e-6));
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Bänder wie bandT in src/zone/paint.ts: Stufe k zeigt den Verlauf bei k / (n − 1), in ihr läuft inner davon weiter
float bandT(float t, float n, float inner) {
  float p = clamp(t, 0.0, 1.0) * n;
  float k = min(n - 1.0, floor(p));
  return clamp((k + inner * (p - k - 0.5)) / (n - 1.0), 0.0, 1.0);
}
// Kantenabstand (Meter der Ebene, innen positiv) am Ort, um off (Meter) verschoben; ohne Raster: tief innen
float edgeAt(vec2 off) {
  if (vEdgeRect.z < vEdgeRect.x) return ${EDGE_IN}.0;
  vec2 uv = clamp(vEdge.xy + off * vEdge.zw, vEdgeRect.xy, vEdgeRect.zw);
  return texture2D(uEdge, uv).r * ${EDGE_IN + EDGE_OUT}.0 - ${EDGE_OUT}.0;
}
// Quelle cs mit Deckkraft as und Mischmodus über acc (vormultipliziert, W3C), cb: Farbe darunter
vec4 over(vec4 acc, vec3 cb, vec3 cs, float as, int mode) {
  vec3 mixed = cs * (1.0 - acc.a) + blendFn(mode, cb, cs) * acc.a;
  return vec4(mixed * as + acc.rgb * (1.0 - as), as + acc.a * (1.0 - as));
}
`;

/** Ende jedes Pixel-Shaders: Farbe c (sRGB) und Deckkraft acc.a nach linear, Nebel, Farbraum, Zittern */
const TAIL = /* glsl */ `
  gl_FragColor = vec4(toLinear(clamp(c, 0.0, 1.0)), acc.a);
#ifdef OPAQUE
  gl_FragColor.a = 1.0;
#endif
  #include <fog_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
`;

/** Ableitungen vor jeder Verzweigung (an Flächengrenzen verzweigen Nachbarpunkte verschieden) */
const DERIVATIVES = /* glsl */ `
  vec2 fdx = dFdx(vPat.xy);
  vec2 fdy = dFdy(vPat.xy);
  vec2 pdx = dFdx(vPat.zw);
  vec2 pdy = dFdy(vPat.zw);
  float px = 0.5 * (abs(fdx.x) + abs(fdy.x) + abs(fdx.y) + abs(fdy.y));
`;

/**
 * Allgemeiner Pixel-Shader: eine Schleife über die Schichten, die Art steht in der Datentextur. Für durchsichtige Flächen
 * und wenn es zu viele Schichtfolgen gibt; alle anderen Flächen bekommen einen Shader je Schichtfolge (specialFragment)
 */
const FRAGMENT = PRELUDE + /* glsl */ `
// Schichten einer Zeile über acc (vormultipliziert). p: Lage für Verlaufsgriffe; pat, dx, dy: Musterlage (Meter) und ihre
// Ableitungen (außerhalb der Verzweigungen gerechnet); px: Meter je Bildpunkt
vec4 layers(int row, int n, vec2 p, vec2 pat, vec2 dx, vec2 dy, float px, vec4 acc) {
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= n) break;
    int base = 1 + ${PER_LAYER} * i;
    vec4 A = texelFetch(uPaint, ivec2(base, row), 0);
    vec4 B = texelFetch(uPaint, ivec2(base + 1, row), 0);
    int code = int(A.x + 0.5);
    vec3 cb = acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0);
    vec3 cs = B.rgb;
    float as = 1.0;
    if (code >= ${CODE.linear} && code <= ${CODE.fadeEdge}) {
      // Verlauf: C = Stufen, Verlauf in der Stufe, Welle, Tiefe des Kantenverlaufs
      vec4 C = texelFetch(uPaint, ivec2(base + 2, row), 0);
      float t = code >= ${CODE.edge} ? edgeAt(vec2(0.0)) / max(C.w, 1e-3) : gradT(code, B, p);
      if (C.x >= 2.0) {
        if (C.z > 0.0) t += C.z / C.x * (0.65 * vnoise(pat * 0.2) + 0.35 * vnoise(pat * 0.6 + 17.0) - 0.5);
        t = bandT(t, C.x, C.y);
      }
      vec4 r = rampAt(int(A.w + 0.5), t);
      cs = r.rgb;
      as = r.a;
      if (code == ${CODE.fadeLinear} || code == ${CODE.fadeRadial} || code == ${CODE.fadeEdge}) {
        acc *= 1.0 - A.z + A.z * as;
        continue;
      }
    } else if (code == ${CODE.light} || code == ${CODE.shade}) {
      // Sichel: der Umriss um die Breite zum Licht (Lichtkante) oder vom Licht weg (Innenschatten) verschoben
      vec4 C = texelFetch(uPaint, ivec2(base + 2, row), 0);
      float s = edgeAt((code == ${CODE.light} ? uLight : -uLight) * C.x);
      as = 1.0 - smoothstep(-px, px + C.y, s);
      if (B.a < 0.5) cs = code == ${CODE.light} ? uLightColor : uShadeColor;
    } else if (code == ${CODE.dots}) {
      // C: Durchmesser, Zelle (× Durchmesser), Dichte, Größenstreuung; D: Ton, Reichweite, Samen
      vec4 C = texelFetch(uPaint, ivec2(base + 2, row), 0);
      vec4 D = texelFetch(uPaint, ivec2(base + 3, row), 0);
      int src = int(A.w + 0.5);
      float k = 1.0;
      if (src == 1) k = 1.0 - smoothstep(0.0, D.y, edgeAt(uLight * D.y));
      else if (src == 2) k = 1.0 - smoothstep(0.0, D.y, edgeAt(-uLight * D.y));
      else if (src == 3) k = 1.0 - smoothstep(0.0, D.y, edgeAt(vec2(0.0)));
      else if (src == 4) k = clamp((0.72 - lumOf(cb)) / 0.55, 0.0, 1.0);
      // Wabenraster: Reihen 0,866 Zellen hoch, jede zweite um eine halbe Zelle versetzt (dicht gepackt wie gemalte Punkte)
      float cell = C.x * C.y;
      vec2 q = pat / vec2(cell, cell * 0.866) + floor(vec2(hash12(vec2(D.z, 3.1)), hash12(vec2(D.z, 7.7))) * ${RANK_N}.0);
      q.x += 0.5 * mod(floor(q.y), 2.0);
      vec2 id = floor(q);
      vec4 T = texelFetch(uRank, ivec2(mod(id, ${RANK_N}.0)), 0);
      // Radius und Versatz in Zellbreiten; der Punkt bleibt in seiner Zelle (auch in der flacheren Reihe)
      float r = min(0.43, 0.5 / C.y) * (1.0 - C.w * T.w);
      vec2 f = (q - id - 0.5) * vec2(1.0, 0.866) - T.xy * vec2(0.5 - r, 0.433 - r);
      float d = length(f);
      float aa = px / cell;
      // Punkte unter etwa einem Bildpunkt blenden aus (sonst flimmern sie bei fahrender Kamera)
      as = step(T.z, C.z * k) * (1.0 - smoothstep(r - aa, r + aa, d)) * smoothstep(0.35, 0.8, r / max(aa, 1e-6));
      // Ton: eine hellere Stufe der eigenen Farbe (Farbton bleibt, warm zum Licht) oder eine tiefere zum Schatten
      if (B.a < 0.5) cs = D.x >= 0.0 ? min(vec3(1.0), cb * (1.0 + 1.6 * D.x) + 0.12 * D.x) * mix(vec3(1.0), uLightColor, 0.6 * D.x) : mix(cb * (1.0 + 0.55 * D.x), uShadeColor, -0.35 * D.x);
    } else if (code == ${CODE.sparkle}) {
      vec4 C = texelFetch(uPaint, ivec2(base + 2, row), 0);
      vec4 D = texelFetch(uPaint, ivec2(base + 3, row), 0);
      as = sparkleAt(pat, C, D, px);
      if (B.a < 0.5) cs = uLightColor;
    } else if (code == ${CODE.grain}) {
      // C: Kachelgröße (Meter), Drehung (Bogenmaß); Rot Papier, Grün Gouache
      vec4 C = texelFetch(uPaint, ivec2(base + 2, row), 0);
      vec2 cr = vec2(cos(C.y), sin(C.y));
      mat2 R = mat2(cr.x, cr.y, -cr.y, cr.x) / C.x;
      vec2 g = textureGrad(uGrain, R * pat, R * dx, R * dy).rg;
      cs = vec3(A.w < 0.5 ? g.r : g.g);
    }
    as *= A.z;
    vec3 mixed = cs * (1.0 - acc.a) + blendFn(int(A.y + 0.5), cb, cs) * acc.a;
    acc = vec4(mixed * as + acc.rgb * (1.0 - as), as + acc.a * (1.0 - as));
  }
  return acc;
}
void main() {
${DERIVATIVES}
  vec4 acc = vec4(vSolid.rgb, 1.0);
  vec3 c = vSolid.rgb;
  if (vSolid.a < 0.5) {
    vec4 hf = texelFetch(uPaint, ivec2(0, vRows.x), 0);
    vec4 hp = texelFetch(uPaint, ivec2(0, vRows.y), 0);
    acc = layers(vRows.x, int(hf.x + 0.5), vLocal, vPat.xy, fdx, fdy, px, vec4(0.0));
    acc = layers(vRows.y, int(hp.x + 0.5), vPlane, vPat.zw, pdx, pdy, px, acc);
    acc *= hf.y;
    // Luftperspektive der Zone (Anteil je Ebene in ihrer Zeile)
    c = mix(acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0), uAir, hp.z);
  }
${TAIL}
}
`;

/**
 * Schichtfolge einer Zeile als Kürzel (je Schicht eins, mit Punkt getrennt): c Farbe; g oder f (Deckkraft) mit l linear,
 * r radial, e Kante, dazu b für Bänder und w für Welle; L Lichtkante, S Innenschatten, D0 bis D4 Pünktchen je Quelle,
 * K Funkeln, P Papier oder Gouache. Was die Folge nicht festlegt (Farben, Griffe, Maße, Mischmodus), steht in der Datentextur
 */
export function layerTokens(layers: readonly ZoneFill[]): string {
  return layers
    .map((f) => {
      if (f.type === 'color') return 'c';
      if (isGradient(f)) return (f.type === 'fade' ? 'f' : 'g') + (f.edge ? 'e' : f.radial ? 'r' : 'l') + (f.steps ? 'b' : '') + (f.steps && f.wave ? 'w' : '');
      if (f.type === 'light') return 'L';
      if (f.type === 'shade') return 'S';
      if (f.type === 'dots') return `D${Math.max(0, DOT_SOURCES.indexOf(f.source))}`;
      if (f.type === 'sparkle') return 'K';
      return 'P';
    })
    .join('.');
}

/** eine Schicht als gerader Code (wie der Rumpf der Schleife in layers, aber nur für ihre Art) */
function layerGlsl(token: string, k: number, row: string, p: string, pat: string, dx: string, dy: string): string {
  const base = 1 + PER_LAYER * k;
  const fetch = (o: number) => `texelFetch(uPaint, ivec2(${base + o}, ${row}), 0)`;
  const head = `A = ${fetch(0)}; cb = acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0);`;
  const done = 'as *= A.z; acc = over(acc, cb, cs, as, int(A.y + 0.5));';
  if (token === 'c') return `{ ${head} cs = ${fetch(1)}.rgb; as = 1.0; ${done} }`;
  if (token[0] === 'g' || token[0] === 'f') {
    let t = '';
    // (genau wie gradT, damit beide Wege dasselbe Bild geben)
    if (token[1] === 'e') t = 't = edgeAt(vec2(0.0)) / max(C.w, 1e-3);';
    else if (token[1] === 'r') t = `{ vec2 d = B.zw - B.xy; float len2 = dot(d, d); t = len2 < 1e-12 ? 0.0 : length(${p} - B.xy) / sqrt(len2); }`;
    else t = `{ vec2 d = B.zw - B.xy; float len2 = dot(d, d); t = len2 < 1e-12 ? 0.0 : dot(${p} - B.xy, d) / len2; }`;
    if (token.includes('w')) t += ` t += C.z / C.x * (0.65 * vnoise(${pat} * 0.2) + 0.35 * vnoise(${pat} * 0.6 + 17.0) - 0.5);`;
    if (token.includes('b')) t += ' t = bandT(t, C.x, C.y);';
    const ramp = 'r = rampAt(int(A.w + 0.5), t); cs = r.rgb; as = r.a;';
    const end = token[0] === 'f' ? 'acc *= 1.0 - A.z + A.z * as;' : done;
    return `{ ${head} B = ${fetch(1)}; C = ${fetch(2)}; ${t} ${ramp} ${end} }`;
  }
  if (token === 'L' || token === 'S') {
    const dir = token === 'L' ? 'uLight' : '-uLight';
    const zone = token === 'L' ? 'uLightColor' : 'uShadeColor';
    return `{ ${head} B = ${fetch(1)}; C = ${fetch(2)}; t = edgeAt(${dir} * C.x); as = 1.0 - smoothstep(-px, px + C.y, t); cs = B.a > 0.5 ? B.rgb : ${zone}; ${done} }`;
  }
  if (token[0] === 'D') {
    const src = Number(token.slice(1));
    const k_ =
      src === 1
        ? 'k = 1.0 - smoothstep(0.0, D.y, edgeAt(uLight * D.y));'
        : src === 2
          ? 'k = 1.0 - smoothstep(0.0, D.y, edgeAt(-uLight * D.y));'
          : src === 3
            ? 'k = 1.0 - smoothstep(0.0, D.y, edgeAt(vec2(0.0)));'
            : src === 4
              ? 'k = clamp((0.72 - lumOf(cb)) / 0.55, 0.0, 1.0);'
              : 'k = 1.0;';
    return `{ ${head} B = ${fetch(1)}; C = ${fetch(2)}; D = ${fetch(3)}; ${k_}
      float cell = C.x * C.y;
      vec2 q = ${pat} / vec2(cell, cell * 0.866) + floor(vec2(hash12(vec2(D.z, 3.1)), hash12(vec2(D.z, 7.7))) * ${RANK_N}.0);
      q.x += 0.5 * mod(floor(q.y), 2.0);
      vec2 id = floor(q);
      vec4 T = texelFetch(uRank, ivec2(mod(id, ${RANK_N}.0)), 0);
      float rr = min(0.43, 0.5 / C.y) * (1.0 - C.w * T.w);
      float aa = px / cell;
      as = step(T.z, C.z * k) * (1.0 - smoothstep(rr - aa, rr + aa, length((q - id - 0.5) * vec2(1.0, 0.866) - T.xy * vec2(0.5 - rr, 0.433 - rr)))) * smoothstep(0.35, 0.8, rr / max(aa, 1e-6));
      cs = B.a > 0.5 ? B.rgb : D.x >= 0.0 ? min(vec3(1.0), cb * (1.0 + 1.6 * D.x) + 0.12 * D.x) * mix(vec3(1.0), uLightColor, 0.6 * D.x) : mix(cb * (1.0 + 0.55 * D.x), uShadeColor, -0.35 * D.x);
      ${done} }`;
  }
  if (token === 'K') return `{ ${head} B = ${fetch(1)}; C = ${fetch(2)}; D = ${fetch(3)}; as = sparkleAt(${pat}, C, D, px); cs = B.a > 0.5 ? B.rgb : uLightColor; ${done} }`;
  // Papier oder Gouache
  return `{ ${head} C = ${fetch(2)}; vec2 cr = vec2(cos(C.y), sin(C.y)); mat2 R = mat2(cr.x, cr.y, -cr.y, cr.x) / C.x; vec2 g = textureGrad(uGrain, R * ${pat}, R * ${dx}, R * ${dy}).rg; cs = vec3(A.w < 0.5 ? g.r : g.g); as = 1.0; ${done} }`;
}

/**
 * Pixel-Shader für eine Schichtfolge „Fläche|Ebene“ (layerTokens): gerader Code ohne Schleife und ohne Arten, die die
 * Folge nicht braucht. Die allgemeine Schleife kostet am Mac in Handy-Auflösung je Schicht rund 2 ms, weil die GPU den
 * ganzen Schleifenrumpf mit allen Arten mitschleppt (Messung scripts/earle-bildzeiten.mjs); so kostet jede Fläche nur,
 * was sie zeigt. Die Folge „c|“ (eine Farbe, kein Ebenenstapel) nimmt die Farbe aus dem Eckenshader
 */
export function specialFragment(sig: string, clear = false): string {
  // (durchsichtige Flächen haben keine Farbe aus dem Eckenshader: der rechnet sie nur für volle Deckkraft)
  if (sig === 'c|' && !clear) return `${PRELUDE}
void main() {
  vec4 acc = vec4(vSolid.rgb, 1.0);
  vec3 c = vSolid.rgb;
${TAIL}
}
`;
  const [face, plane] = sig.split('|');
  const rows = [
    ...(face ? face.split('.').map((tk, k) => layerGlsl(tk, k, 'vRows.x', 'vLocal', 'vPat.xy', 'fdx', 'fdy')) : []),
    ...(plane ? plane.split('.').map((tk, k) => layerGlsl(tk, k, 'vRows.y', 'vPlane', 'vPat.zw', 'pdx', 'pdy')) : []),
  ];
  return `${PRELUDE}
void main() {
${DERIVATIVES}
  vec4 A, B, C, D, r;
  vec3 cb, cs;
  float as, t, k;
  vec4 acc = vec4(0.0);
  ${rows.join('\n  ')}
  acc *= texelFetch(uPaint, ivec2(0, vRows.x), 0).y;
  vec3 c = mix(acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0), uAir, texelFetch(uPaint, ivec2(0, vRows.y), 0).z);
${TAIL}
}
`;
}

function dataTexture(w: number, h: number): DataTexture {
  const t = new DataTexture(new Float32Array(w * h * 4), w, h, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** höchstens so viele Shader je Schichtfolge; seltenere Folgen zeichnet der allgemeine Shader (ein Draw Call mehr) */
const MAX_VARIANTS = 24;

/** Zeilen auf Zweierpotenzen runden, damit die Textur beim Zeichnen selten neu entsteht */
const capacity = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(8, n)));

type PlaneMesh = Mesh<BufferGeometry, ShaderMaterial>;

interface Part {
  shape: ZoneShape;
  plane: ZonePlane;
  rank: number;
  tri: Triangulated;
  face: number;
  row: number;
  planeRow: number;
  /** Kantenabstand, wenn eine Schicht ihn braucht */
  edge: EdgeRaster | null;
}

/** Tiefe der Kantenverläufe je Schicht in Metern der Ebene (Griffe in Pfad-Koordinaten mal Maßstab sx, sy) */
function edgeLengths(layers: readonly ZoneFill[], sx: number, sy: number): number[] {
  return layers.map((f) => (isGradient(f) && f.edge ? Math.hypot(sx * (f.x1 - f.x0), sy * (f.y1 - f.y0)) : 0));
}

export class PlaneLayer {
  readonly group = new Group();
  private readonly uniforms: Record<string, IUniform>;
  /** allgemeiner Shader für deckende Flächen (Folgen über MAX_VARIANTS) und für durchsichtige */
  private readonly opaqueMat: ShaderMaterial;
  private readonly clearMat: ShaderMaterial;
  /** Shader je Schichtfolge (specialFragment), deckend und durchsichtig, zwischengespeichert; Meshes je Folge */
  private readonly special = new Map<string, ShaderMaterial>();
  private readonly solid = new Map<string, PlaneMesh>();
  /** durchsichtige Flächen in Läufen gleicher Folge, in der Reihenfolge von hinten nach vorn */
  private clearRuns: PlaneMesh[] = [];
  /** Form und Fläche je Dreieck (Index in owners), je Mesh */
  private readonly meshOwners = new Map<PlaneMesh, { triOwner: Int32Array; owners: Array<{ id: string; face: number }> }>();
  private rows: Row[] = [];
  private rowsKey = '';
  private swatches: SwatchMap = new Map();
  private look: LookName = 'day';
  private light: ZoneLight | undefined;
  private paintTex = dataTexture(ROW_W, 8);
  private rampTex = dataTexture(RAMP, 8);
  private readonly atlas = new EdgeAtlas();
  /** Punktkronen (Stufe 5): alle Kronenpunkte der Zone in einem Mesh; dazu, was ihre Farben braucht */
  private readonly crowns = new CrownLayer();
  private crownInputs: CrownInput[] = [];
  /** die zuletzt gebauten Knoten (Handy-Messung, `src/world/earleMessung.ts`) */
  lastNodes: readonly ZoneNode[] = [];
  /**
   * Zahlen des letzten Aufbaus (Leistungsanzeige): Ebenen, Formen, Dreiecke, Zeilen, Verläufe, durchsichtige Flächen,
   * Flächen mit Kantenabstand und Höhe des Atlas, Zeit für Kantenabstand und Packen (ms)
   */
  stats = { planes: 0, shapes: 0, triangles: 0, paints: 0, gradients: 0, clear: 0, edges: 0, atlas: 0, edgeMs: 0, variants: 0, crowns: 0 };

  constructor() {
    this.group.name = 'ebenen';
    this.group.add(this.crowns.mesh);
    this.uniforms = UniformsUtils.merge([UniformsLib.fog]);
    this.uniforms.uPaint = { value: this.paintTex };
    this.uniforms.uRamp = { value: this.rampTex };
    this.uniforms.uAir = { value: new Vector3(1, 1, 1) };
    this.uniforms.uEdge = { value: this.atlas.texture };
    // Rang- und Papierkachel erst, wenn eine Fläche sie braucht (die Rangfolge kostet einmal einige zehn ms)
    this.uniforms.uRank = { value: null };
    this.uniforms.uGrain = { value: null };
    this.uniforms.uLight = { value: new Vector2(-0.57, 0.82) };
    this.uniforms.uLightColor = { value: new Vector3(1, 0.95, 0.8) };
    this.uniforms.uShadeColor = { value: new Vector3(0.12, 0.16, 0.36) };
    // Uhr fürs Funkeln (jedes Mesh stellt sie vor dem Zeichnen)
    this.uniforms.uTime = { value: 0 };
    const common = { uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, fog: true, dithering: true };
    // undurchsichtig: Three setzt dafür selbst OPAQUE (Deckkraft 1 im Shader)
    this.opaqueMat = new ShaderMaterial(common);
    this.clearMat = new ShaderMaterial({ ...common, transparent: true, depthWrite: false });
  }

  /** Uhr fürs Funkeln vor dem Zeichnen stellen */
  private readonly tick = (): void => {
    this.uniforms.uTime.value = (performance.now() / 1000) % 3600;
  };

  /** Shader für eine Schichtfolge (alle teilen dieselben Uniforms); „*“ ist der allgemeine; clear: durchsichtig */
  private materialFor(sig: string, clear = false): ShaderMaterial {
    if (sig === '*') return clear ? this.clearMat : this.opaqueMat;
    const key = clear ? `~${sig}` : sig;
    let m = this.special.get(key);
    if (!m) {
      m = new ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: specialFragment(sig, clear), side: DoubleSide, fog: true, dithering: true, ...(clear ? { transparent: true, depthWrite: false } : {}) });
      // beim Bearbeiten entstehen viele Folgen: die ältesten, die gerade niemand zeichnet, wieder freigeben
      if (this.special.size >= 4 * MAX_VARIANTS) {
        const used = new Set([...this.solid.keys(), ...this.clearRuns.map((r) => `~${r.userData.sig as string}`)]);
        for (const [k, old] of this.special) {
          if (used.has(k)) continue;
          old.dispose();
          this.special.delete(k);
          if (this.special.size < 2 * MAX_VARIANTS) break;
        }
      }
      this.special.set(key, m);
    }
    return m;
  }

  /** Look für die Palettenfarben (Palettentausch) und das Licht; tauscht nur Texturen und Uniforms */
  setLook(look: LookName): void {
    if (look === this.look) return;
    this.look = look;
    this.fillTextures();
    this.fillCrowns();
  }

  /** Zahl der Kronenpunkte (Leistungsanzeige, Messung) */
  get crownDots(): number {
    return this.crowns.dots;
  }

  /** Kronenpunkte in die Welt: Lage aus Ebene und Form, Farbe aus Tonstufe, Licht und Luftperspektive der Ebene */
  private fillCrowns(): void {
    const l = lightIn(this.light, this.look);
    const light = hexToRgb(resolveColor(l.color, this.swatches, this.look));
    const air = hexToRgb(resolveColor(this.airColor, this.swatches, this.look));
    const dots: CrownDot[] = [];
    for (const { pts, shape, plane, rank, base, air: airT, tone, wind } of this.crownInputs) {
      const rgb = hexToRgb(resolveColor(base, this.swatches, this.look));
      const steps = [0, 1, 2].map((s) => crownColor(rgb, light, tone, s).map((v, i) => v + (air[i] - v) * airT));
      const Z = -plane.z + rank * ORDER_STEP;
      for (let i = 0; i < pts.length; i += CROWN_STRIDE) {
        const c = steps[pts[i + 3]];
        dots.push({
          x: plane.x + plane.scale * (shape.x + pts[i]),
          y: plane.y + plane.scale * (shape.y + pts[i + 1]),
          z: Z + pts[i + 4],
          phase: pts[i + 5],
          size: pts[i + 2] * Math.abs(plane.scale),
          wind: wind * Math.abs(plane.scale),
          r: c[0],
          g: c[1],
          b: c[2],
        });
      }
    }
    this.crowns.build(dots);
  }

  /** Licht der Zone im aktuellen Look in die Uniforms (Richtung im Bild, Farben in sRGB) */
  private applyLight(): void {
    const l = lightIn(this.light, this.look);
    const a = (l.angle * Math.PI) / 180;
    (this.uniforms.uLight.value as Vector2).set(Math.cos(a), Math.sin(a));
    (this.uniforms.uLightColor.value as Vector3).set(...hexToRgb(resolveColor(l.color, this.swatches, this.look)));
    (this.uniforms.uShadeColor.value as Vector3).set(...hexToRgb(resolveColor(l.shade, this.swatches, this.look)));
  }

  /** alle sichtbaren Formen neu zusammensetzen */
  build(nodes: readonly ZoneNode[], opts: PlaneBuildOptions = {}): void {
    const show = opts.showPlane ?? ((p: ZonePlane) => !planeHidden(nodes, p));
    this.lastNodes = nodes;
    this.swatches = swatchMap(nodes);
    this.light = lightOf(nodes);
    const lightNow = lightIn(this.light, this.look);
    const lightDir: [number, number] = [Math.cos((lightNow.angle * Math.PI) / 180), Math.sin((lightNow.angle * Math.PI) / 180)];
    const crownInputs: CrownInput[] = [];
    const styles = styleMap(nodes);
    const rows: Row[] = [];
    const keys: string[] = [];
    const rowOf = new Map<string, number>();
    const air = airOf(nodes);
    this.airColor = air?.color ?? '#ffffff';
    const addRow = (layers: readonly ZoneFill[], opacity: number, airT = 0, edgeLen: readonly number[] = []): number => {
      const key = JSON.stringify([opacity, airT, layers, edgeLen.some((v) => v > 0) ? edgeLen : 0]);
      let i = rowOf.get(key);
      if (i === undefined) {
        i = rows.push({ layers, opacity, air: airT, edgeLen }) - 1;
        rowOf.set(key, i);
        keys.push(key);
      }
      return i;
    };
    const solid: Part[] = [];
    const clear: Part[] = [];
    let planeCount = 0;
    let edgeMs = 0;
    let rankNeeded = false;
    let grainNeeded = false;
    const note = (layers: readonly ZoneFill[]) => {
      for (const f of layers) {
        if (f.hidden) continue;
        if (f.type === 'dots' || f.type === 'sparkle') rankNeeded = true;
        else if (f.type === 'grain') grainNeeded = true;
      }
    };
    for (const plane of planesOf(nodes)) {
      if (!show(plane)) continue;
      planeCount++;
      const planeLayers = (plane.fills ?? []).filter((f) => !f.hidden).slice(0, MAX_LAYERS);
      note(planeLayers);
      const planeRow = addRow(planeLayers, 1, airAmount(air, plane), edgeLengths(planeLayers, 1, 1));
      const planeClear = layersClear(planeLayers);
      const planeEdge = layersNeedEdge(planeLayers);
      shapesOf(nodes, plane.id).forEach((shape, rank) => {
        if (shape.hidden) return;
        const crownOn = !!shape.crown && !shape.crown.hidden;
        if (crownOn || shape.dots?.length) {
          // Punktkrone über allen gefüllten Flächen der Form (ohne weggenommene Stellen) und die gesetzten Punkte, in
          // der Farbe ihrer Grundfarbe
          const all = shapeFaces(shape, fineness(shape, plane));
          const filled = all.filter((f) => facePaint(shape, f).fill !== null);
          if (filled.length) {
            const crownPts = crownOn && shape.crown ? cachedCrownPoints(filled.length === all.length ? all : filled, shape.sx, shape.sy, shape.crown, lightDir) : null;
            const pts = shapeDots(crownPts, shape.dots, shape.dotsOff);
            crownInputs.push({ pts, shape, plane, rank, base: facePaint(shape, filled[0]).fill ?? shape.fill, air: airAmount(air, plane), tone: shape.crown?.tone ?? CROWN_DEFAULT.tone, wind: crownOn && shape.crown ? shape.crown.wind : 0 });
          }
        }
        shapeFaces(shape, fineness(shape, plane)).forEach((face, fi) => {
          // eine Fläche ohne Füllung ist ein Loch: nichts zu zeichnen
          const paint = facePaint(shape, face);
          const pl = paintLayers(paint, styles, paint.style ? faceBox(face) : NO_BOX);
          if (!pl) return;
          // Kantenwelle: gezeichnet wird die gewellte Fläche (Dreiecke und Kantenabstand), gefüllt wie die glatte
          const shown = shape.wave && !shape.wave.hidden && shape.wave.amp > 0 ? cachedWavyFace(face, shape.wave, shape.sx, shape.sy) : face;
          const tri = triangulateFace(shown);
          if (!tri.index.length) return;
          const layers = visibleLayers(pl.layers);
          note(layers);
          let edge: EdgeRaster | null = null;
          if (planeEdge || layersNeedEdge(layers)) {
            const t0 = performance.now();
            edge = faceEdge(shown, shape.sx, shape.sy);
            edgeMs += performance.now() - t0;
          }
          const part = { shape, plane, rank, tri, face: fi, row: addRow(layers, pl.opacity, 0, edgeLengths(layers, shape.sx, shape.sy)), planeRow, edge };
          (planeClear || layersClear(pl.layers, pl.opacity) ? clear : solid).push(part);
        });
      });
    }
    if (rankNeeded && !this.uniforms.uRank.value) this.uniforms.uRank.value = rankTexture();
    if (grainNeeded && !this.uniforms.uGrain.value) this.uniforms.uGrain.value = grainTexture();
    // durchsichtige von hinten nach vorn: tiefere Ebene zuerst, in der Ebene in Zeichenreihenfolge
    clear.sort((a, b) => b.plane.z - a.plane.z || a.rank - b.rank);
    const all = [...solid, ...clear];
    const t0 = performance.now();
    this.atlas.pack(all.flatMap((p) => (p.edge ? [p.edge] : [])));
    this.uniforms.uEdge.value = this.atlas.texture;
    edgeMs += performance.now() - t0;
    const tris = all.reduce((n, p) => n + p.tri.index.length / 3, 0);
    this.rows = rows;
    const key = keys.join('|');
    if (key !== this.rowsKey || this.swatchesChanged() || this.airColor !== this.airShown || this.lightChanged()) {
      this.rowsKey = key;
      this.fillTextures();
    }
    this.stats = {
      planes: planeCount,
      shapes: new Set(all.map((x) => x.shape.id)).size,
      triangles: tris,
      paints: rows.length,
      gradients: this.stats.gradients,
      clear: clear.length,
      edges: this.atlas.stats.rasters,
      atlas: this.atlas.stats.height,
      edgeMs: Math.round(edgeMs * 10) / 10,
      variants: 0,
      crowns: 0,
    };
    // deckende Flächen nach Schichtfolge (Fläche|Ebene) zusammen; die häufigsten Folgen bekommen ihren eigenen Shader
    const sigOf = (part: Part) => `${layerTokens(rows[part.row].layers)}|${layerTokens(rows[part.planeRow].layers)}`;
    const bySig = new Map<string, Part[]>();
    for (const part of solid) {
      const sig = sigOf(part);
      const list = bySig.get(sig);
      if (list) list.push(part);
      else bySig.set(sig, [part]);
    }
    const groups = new Map<string, Part[]>();
    [...bySig.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([sig, parts], i) => {
        const key = i < MAX_VARIANTS ? sig : '*';
        groups.set(key, [...(groups.get(key) ?? []), ...parts]);
      });
    for (const [sig, mesh] of this.solid) {
      if (groups.has(sig)) continue;
      this.setMesh(mesh, [], this.materialFor(sig), '');
      this.solid.delete(sig);
    }
    for (const [sig, parts] of groups) {
      const mesh = this.setMesh(this.solid.get(sig) ?? null, parts, this.materialFor(sig), `ebenen-formen ${sig}`);
      if (mesh) this.solid.set(sig, mesh);
    }
    // durchsichtige: in der sortierten Reihenfolge Läufe gleicher Folge; die Läufe zeichnen in dieser Reihenfolge
    // (renderOrder), so bleibt hinten vor vorn erhalten. Sehr viele Läufe: alles mit dem allgemeinen Shader in einem
    const runs: Array<{ sig: string; parts: Part[] }> = [];
    for (const part of clear) {
      const sig = sigOf(part);
      const last = runs[runs.length - 1];
      if (last && last.sig === sig) last.parts.push(part);
      else runs.push({ sig, parts: [part] });
    }
    const clearRuns = runs.length > 8 ? [{ sig: '*', parts: clear }] : runs;
    const old = this.clearRuns;
    this.clearRuns = clearRuns.flatMap(({ sig, parts }, i) => {
      const prev = old[i] && old[i].userData.sig === sig ? old[i] : null;
      if (prev) old[i] = null as unknown as PlaneMesh;
      const mesh = this.setMesh(prev, parts, this.materialFor(sig, true), `ebenen-durchsichtig ${sig}`);
      if (!mesh) return [];
      mesh.userData.sig = sig;
      mesh.renderOrder = i * 1e-3;
      return [mesh];
    });
    for (const mesh of old) if (mesh) this.setMesh(mesh, [], this.clearMat, '');
    this.stats.variants = groups.size + this.clearRuns.length;
    this.crownInputs = crownInputs;
    this.fillCrowns();
    this.stats.crowns = this.crowns.dots;
  }

  /** zuletzt aufgelöste Palette, damit eine geänderte Palettenfarbe die Texturen neu füllt */
  private swatchKey = '';
  private swatchesChanged(): boolean {
    const k = JSON.stringify([...this.swatches.values()]);
    if (k === this.swatchKey) return false;
    this.swatchKey = k;
    return true;
  }

  /** zuletzt angewandtes Licht */
  private lightKey = '';
  private lightChanged(): boolean {
    const k = JSON.stringify(this.light ?? null);
    if (k === this.lightKey) return false;
    this.lightKey = k;
    return true;
  }

  /** Luftfarbe der Zone (Palettenverweis möglich) und die zuletzt in den Uniform geschriebene */
  private airColor = '#ffffff';
  private airShown = '';

  /** Stil-Datentextur und Farbbänder aus den Zeilen füllen, Farben im aktuellen Look; dazu das Licht */
  private fillTextures(): void {
    const rows = this.rows;
    this.airShown = this.airColor;
    (this.uniforms.uAir.value as Vector3).set(...hexToRgb(resolveColor(this.airColor, this.swatches, this.look)));
    this.applyLight();
    const h = capacity(rows.length);
    if (this.paintTex.image.height !== h) {
      this.paintTex.dispose();
      this.paintTex = dataTexture(ROW_W, h);
      this.uniforms.uPaint.value = this.paintTex;
    }
    const data = this.paintTex.image.data as Float32Array;
    data.fill(0);
    const ramps: Float32Array[] = [];
    const rampOfKey = new Map<string, number>();
    const rgb = (c: string) => hexToRgb(resolveColor(c, this.swatches, this.look));
    /** Farbe nach B (mit Merker 1) oder ohne Farbe: Merker 0, der Shader nimmt Licht oder Schatten der Zone */
    const own = (b: number, c: string | undefined) => {
      if (!c) return;
      const [cr, cg, cb] = rgb(c);
      data[b] = cr;
      data[b + 1] = cg;
      data[b + 2] = cb;
      data[b + 3] = 1;
    };
    rows.forEach((row, r) => {
      const base = r * ROW_W * 4;
      data[base] = row.layers.length;
      data[base + 1] = row.opacity;
      data[base + 2] = row.air;
      row.layers.forEach((f, i) => {
        const a = base + (1 + PER_LAYER * i) * 4;
        const b = a + 4;
        const c = b + 4;
        const d = c + 4;
        data[a + 1] = Math.max(0, BLEND_MODES.indexOf(f.blend));
        data[a + 2] = f.opacity;
        if (f.type === 'color') {
          data[a] = CODE.color;
          own(b, f.color);
          return;
        }
        if (isGradient(f)) {
          const fade = f.type === 'fade';
          data[a] = f.edge ? (fade ? CODE.fadeEdge : CODE.edge) : f.radial ? (fade ? CODE.fadeRadial : CODE.radial) : fade ? CODE.fadeLinear : CODE.linear;
          const k = JSON.stringify(f.stops);
          let ramp = rampOfKey.get(k);
          if (ramp === undefined) {
            ramp = ramps.push(rampOf(f.stops, this.swatches, this.look)) - 1;
            rampOfKey.set(k, ramp);
          }
          data[a + 3] = ramp;
          data[b] = f.x0;
          data[b + 1] = f.y0;
          data[b + 2] = f.x1;
          data[b + 3] = f.y1;
          data[c] = f.steps ?? 0;
          data[c + 1] = f.inner ?? 0.35;
          data[c + 2] = f.wave ?? 0;
          data[c + 3] = row.edgeLen[i] ?? 0;
          return;
        }
        if (f.type === 'light' || f.type === 'shade') {
          data[a] = f.type === 'light' ? CODE.light : CODE.shade;
          own(b, f.color);
          data[c] = f.width;
          data[c + 1] = f.soft;
          return;
        }
        if (f.type === 'dots') {
          data[a] = CODE.dots;
          data[a + 3] = Math.max(0, DOT_SOURCES.indexOf(f.source));
          own(b, f.color);
          data[c] = f.size;
          data[c + 1] = f.gap;
          data[c + 2] = f.density;
          data[c + 3] = f.jitter;
          data[d] = f.tone;
          data[d + 1] = f.reach;
          data[d + 2] = f.seed;
          return;
        }
        if (f.type === 'sparkle') {
          data[a] = CODE.sparkle;
          own(b, f.color);
          data[c] = f.size;
          data[c + 1] = f.gap;
          data[c + 2] = f.density;
          data[c + 3] = f.speed;
          data[d] = f.seed;
          return;
        }
        if (f.type !== 'grain') return;
        data[a] = CODE.grain;
        data[a + 3] = f.tile === 'gouache' ? 1 : 0;
        data[c] = f.scale;
        data[c + 1] = (f.angle * Math.PI) / 180;
      });
    });
    this.paintTex.needsUpdate = true;
    const rh = capacity(ramps.length);
    if (this.rampTex.image.height !== rh) {
      this.rampTex.dispose();
      this.rampTex = dataTexture(RAMP, rh);
      this.uniforms.uRamp.value = this.rampTex;
    }
    const rd = this.rampTex.image.data as Float32Array;
    rd.fill(0);
    ramps.forEach((ramp, i) => rd.set(ramp, i * RAMP * 4));
    this.rampTex.needsUpdate = true;
    this.stats.gradients = ramps.length;
  }

  private setMesh(mesh: PlaneMesh | null, parts: readonly Part[], material: ShaderMaterial, name: string): PlaneMesh | null {
    if (!parts.length) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshOwners.delete(mesh);
      }
      return null;
    }
    let verts = 0;
    let tris = 0;
    for (const p of parts) {
      verts += p.tri.pts.length / 2;
      tris += p.tri.index.length / 3;
    }
    const pos = new Float32Array(verts * 3);
    const local = new Float32Array(verts * 2);
    const planar = new Float32Array(verts * 2);
    const rowsAttr = new Float32Array(verts * 2);
    const pat = new Float32Array(verts * 4);
    const edge = new Float32Array(verts * 4);
    const edgeRect = new Float32Array(verts * 4);
    const index = new Uint32Array(tris * 3);
    const triOwner = new Int32Array(tris);
    const owners: Array<{ id: string; face: number }> = [];
    const AW = this.atlas.width;
    const AH = this.atlas.height;
    let v = 0;
    let t = 0;
    for (const { shape, plane, rank, tri, face, row, planeRow, edge: raster } of parts) {
      const owner = owners.push({ id: shape.id, face }) - 1;
      const Z = -plane.z + rank * ORDER_STEP;
      const n = tri.pts.length / 2;
      const [fx, fy] = seedOffset(shape.id);
      const [gx, gy] = seedOffset(plane.id);
      const slot = raster ? this.atlas.slot(raster) : undefined;
      for (let i = 0; i < n; i++) {
        const lx = tri.pts[i * 2];
        const ly = tri.pts[i * 2 + 1];
        const rx = shape.sx * lx;
        const ry = shape.sy * ly;
        const px = shape.x + rx;
        const py = shape.y + ry;
        const k = (v + i) * 3;
        pos[k] = plane.x + plane.scale * px;
        pos[k + 1] = plane.y + plane.scale * py;
        pos[k + 2] = Z;
        const j = (v + i) * 2;
        local[j] = lx;
        local[j + 1] = ly;
        planar[j] = px;
        planar[j + 1] = py;
        rowsAttr[j] = row;
        rowsAttr[j + 1] = planeRow;
        const q = (v + i) * 4;
        pat[q] = rx + fx;
        pat[q + 1] = ry + fy;
        pat[q + 2] = px + gx;
        pat[q + 3] = py + gy;
        if (raster && slot) {
          edge[q] = (slot.x + (rx - raster.x0) / raster.texel) / AW;
          edge[q + 1] = (slot.y + (ry - raster.y0) / raster.texel) / AH;
          edge[q + 2] = 1 / (raster.texel * AW);
          edge[q + 3] = 1 / (raster.texel * AH);
          edgeRect[q] = (slot.x + 0.5) / AW;
          edgeRect[q + 1] = (slot.y + 0.5) / AH;
          edgeRect[q + 2] = (slot.x + raster.w - 0.5) / AW;
          edgeRect[q + 3] = (slot.y + raster.h - 0.5) / AH;
        } else {
          // kein Kantenabstand: Rechteck verkehrt herum, der Shader nimmt „tief innen“
          edgeRect[q] = 1;
          edgeRect[q + 2] = 0;
        }
      }
      for (let i = 0; i < tri.index.length; i++) index[t * 3 + i] = tri.index[i] + v;
      triOwner.fill(owner, t, t + tri.index.length / 3);
      v += n;
      t += tri.index.length / 3;
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setAttribute('aLocal', new BufferAttribute(local, 2));
    geom.setAttribute('aPlane', new BufferAttribute(planar, 2));
    geom.setAttribute('aRows', new BufferAttribute(rowsAttr, 2));
    geom.setAttribute('aPat', new BufferAttribute(pat, 4));
    geom.setAttribute('aEdge', new BufferAttribute(edge, 4));
    geom.setAttribute('aEdgeRect', new BufferAttribute(edgeRect, 4));
    geom.setIndex(new BufferAttribute(index, 1));
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geom;
    } else {
      mesh = new Mesh(geom, material);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.onBeforeRender = this.tick;
      this.group.add(mesh);
    }
    this.meshOwners.set(mesh, { triOwner, owners });
    return mesh;
  }

  /** gezeichnete Flächen (Form und Fläche) beider Meshes, für Prüfungen */
  get owners(): Array<{ id: string; face: number }> {
    return [...this.meshOwners.values()].flatMap((m) => m.owners);
  }

  /** vorderste getroffene Form (und ihre Fläche) unter dem Strahl, die accept annimmt (gesperrte überspringt der Editor) */
  pick(raycaster: Raycaster, accept: (id: string) => boolean = () => true): { id: string; face: number; distance: number } | null {
    const meshes = [...this.solid.values(), ...this.clearRuns];
    if (!meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    for (const h of hits) {
      if (h.faceIndex === undefined || h.faceIndex === null) continue;
      const own = this.meshOwners.get(h.object as PlaneMesh);
      const o = own?.owners[own.triOwner[h.faceIndex]];
      if (o && accept(o.id)) return { id: o.id, face: o.face, distance: h.distance };
    }
    return null;
  }

  clear(): void {
    for (const mesh of [...this.solid.values(), ...this.clearRuns]) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      this.meshOwners.delete(mesh);
    }
    this.solid.clear();
    this.clearRuns = [];
  }
}
