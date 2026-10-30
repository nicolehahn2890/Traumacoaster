/**
 * Säume (docs/ZONENEDITOR-PLAN.md, Stufe 6; Plan 4.8 „Saum: einen gemalten Streifen (etwa grass_rim_trim.png) auf eine
 * Kante ziehen; er folgt der Kante, auch wenn die Form sich ändert“). Nach UbiArts Frisen und Unitys Sprite Shape: Ein
 * gemalter Streifen läuft an den Kanten einer Form entlang, die in eine Richtung zeigen (oben Gras, an steilen Stellen
 * Fels, unten Wurzeln: je Richtung ein Saum). Das Bild ist gerade gemalt und wird entlang der Kante gebogen.
 *
 * Zwei Arten: **wiederholen** teilt das Bild in Anfang | Mitte | Ende (Anteile a und b der Bildbreite); Anfang und Ende
 * sitzen an den Enden jedes Kantenstücks, die Mitte wiederholt sich dazwischen (ganzzahlig oft, leicht gestreckt, damit
 * kein Stück abgeschnitten wird). **strecken** legt das ganze Bild einmal über jedes Kantenstück. Ein ganz umlaufender
 * Saum (alle Kanten in der Spanne) hat weder Anfang noch Ende.
 *
 * Der Saum gehört zur Form (wie Punktkrone und Kantenwelle): Kopieren, Spiegeln, Löschen nehmen ihn mit. Die Richtung
 * zählt in der Ebene, nicht in der Form: ein gedrehter Hügel trägt das Gras weiter oben. Mit Kantenwelle folgt er der
 * gewellten Kante. Ohne Renderer und DOM.
 *
 * **Platzhalter:** Vorgaben für Breite, Lage der Kante im Streifen, Spanne.
 */
import { flattenPath, polyArea, type Poly } from './path';
import { waveOffset } from './edgeWave';
import { IMAGE_SRC } from './paint';
import type { ZoneShape } from './nodes';

export type RimMode = 'repeat' | 'stretch';

export interface ZoneRim {
  /** Kennung in der Form (r1, r2 …) */
  id: string;
  /** Streifenbild neben der Zonendatei (`/zones/<zone>/saum-….png`), gerade gemalt, unten liegt in der Fläche */
  src: string;
  /** Seitenverhältnis des Bilds (Breite durch Höhe), beim Einsetzen gemerkt: die Geometrie rechnet ohne das Bild */
  aspect: number;
  /** Höhe des Streifens (Meter der Ebene) */
  width: number;
  /** Lage der Kante im Streifen, Anteil von unten (0 bis 1): so viel vom Streifen liegt in der Fläche */
  base: number;
  /** Richtung der Kanten (Grad in der Ebene, 0 nach rechts, 90 nach oben) und Spanne darum (± Grad, 180 ist rundum) */
  dir: number;
  spread: number;
  mode: RimMode;
  /** Anfang | Mitte | Ende: Grenzen als Anteile der Bildbreite (0 ≤ a < b ≤ 1; 0 und 1: nur Mitte) */
  a: number;
  b: number;
  /** auch an den Rändern der Löcher (etwa ein Höhlenboden) */
  holes?: boolean;
  opacity?: number;
  hidden?: boolean;
  /** Malvorlage, nach der das Bild gemalt wurde (src/zone/template.ts) */
  tpl?: string;
}

/** Vorgaben eines neuen Saums. Platzhalter: 1,6 m hoch, Kante bei 30 %, nach oben ± 50° */
export const RIM_DEFAULT = { width: 1.6, base: 0.3, dir: 90, spread: 50 } as const;

export const RIM_MODES: readonly RimMode[] = ['repeat', 'stretch'];
export const RIM_MODE_WORDS: Record<RimMode, string> = { repeat: 'wiederholen', stretch: 'strecken' };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;

export function parseRims(v: unknown): ZoneRim[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ZoneRim[] = [];
  const ids = new Set<string>();
  for (const raw of v.slice(0, 8)) {
    const o = raw as Record<string, unknown>;
    if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !/^r\d{1,4}$/.test(o.id) || ids.has(o.id)) continue;
    if (typeof o.src !== 'string' || !IMAGE_SRC.test(o.src) || !num(o.aspect) || o.aspect <= 0) continue;
    let a = num(o.a) ? clamp(o.a, 0, 1) : 0;
    let b = num(o.b) ? clamp(o.b, 0, 1) : 1;
    if (b - a < 0.02) [a, b] = [0, 1];
    const r: ZoneRim = {
      id: o.id,
      src: o.src,
      aspect: clamp(o.aspect, 0.01, 200),
      width: num(o.width) ? clamp(o.width, 0.05, 60) : RIM_DEFAULT.width,
      base: num(o.base) ? clamp(o.base, 0, 1) : RIM_DEFAULT.base,
      dir: num(o.dir) ? ((o.dir % 360) + 360) % 360 : RIM_DEFAULT.dir,
      spread: num(o.spread) ? clamp(o.spread, 1, 180) : RIM_DEFAULT.spread,
      mode: o.mode === 'stretch' ? 'stretch' : 'repeat',
      a,
      b,
    };
    if (o.holes === true) r.holes = true;
    if (num(o.opacity) && o.opacity < 1) r.opacity = clamp(o.opacity, 0, 1);
    if (o.hidden === true) r.hidden = true;
    if (typeof o.tpl === 'string' && /^v\d{1,6}$/.test(o.tpl)) r.tpl = o.tpl;
    ids.add(r.id);
    out.push(r);
  }
  return out.length ? out : undefined;
}

export function serializeRim(r: ZoneRim): Record<string, unknown> {
  const o: Record<string, unknown> = { id: r.id, src: r.src, aspect: r3(r.aspect), width: r3(r.width), base: r3(r.base), dir: r3(r.dir), spread: r3(r.spread), mode: r.mode, a: r3(r.a), b: r3(r.b) };
  if (r.holes) o.holes = true;
  if (r.opacity !== undefined && r.opacity < 1) o.opacity = r3(r.opacity);
  if (r.hidden) o.hidden = true;
  if (r.tpl) o.tpl = r.tpl;
  return o;
}

/** nächste freie Kennung eines Saums in der Form */
export function nextRimId(shape: ZoneShape): string {
  const ids = new Set((shape.rims ?? []).map((r) => r.id));
  let n = 1;
  while (ids.has(`r${n}`)) n++;
  return `r${n}`;
}

// ------------------------------------------------------------------ Kantenstücke

/** ein Kantenstück in Ebenen-Koordinaten: Punkte, Außennormalen (geglättet), Bogenlänge; closed: läuft ganz herum */
export interface RimRun {
  pts: Array<[number, number]>;
  normals: Array<[number, number]>;
  s: number[];
  closed: boolean;
}

/** Winkelabstand zweier Richtungen in Grad (0 bis 180) */
const angleGap = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
};

/** Polygon gleichmäßig neu abtasten (geschlossen), Schritt in denselben Einheiten */
function resample(poly: Poly, step: number): Poly {
  const n = poly.length;
  if (n < 3) return poly;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
  const count = Math.max(8, Math.min(4000, Math.round(total / step)));
  const d = total / count;
  const out: Poly = [];
  let i = 0;
  let pos = 0;
  let segLen = Math.hypot(poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]);
  for (let k = 0; k < count; k++) {
    const want = k * d;
    while (pos + segLen < want && i < n - 1) {
      pos += segLen;
      i++;
      segLen = Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
    }
    const t = segLen > 1e-12 ? (want - pos) / segLen : 0;
    const a = poly[i];
    const b = poly[(i + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Ränder der Form in Ebenen-Koordinaten (mit Kantenwelle), Umriss gegen, Löcher mit dem Uhrzeigersinn (Außennormale rechts) */
function rimLoops(shape: ZoneShape, holes: boolean): Poly[] {
  const sx = shape.sx;
  const sy = shape.sy;
  const step = 0.25 / Math.max(0.05, Math.max(Math.abs(sx), Math.abs(sy)));
  const wave = shape.wave && !shape.wave.hidden && shape.wave.amp > 0 ? shape.wave : null;
  const toPlane = (poly: Poly): Poly =>
    poly.map(([x, y]) => {
      let px = sx * x;
      let py = sy * y;
      if (wave) {
        const [dx, dy] = waveOffset(wave, px, py);
        px += dx;
        py += dy;
      }
      return [shape.x + px, shape.y + py];
    });
  // (polyArea ist gegen den Uhrzeigersinn negativ)
  const loops: Poly[] = [];
  const outline = toPlane(flattenPath(shape.path, step));
  if (outline.length >= 3) loops.push(polyArea(outline) > 0 ? outline.reverse() : outline);
  if (holes)
    for (const h of shape.holes ?? []) {
      const p = toPlane(flattenPath(h, step));
      if (p.length >= 3) loops.push(polyArea(p) < 0 ? p.reverse() : p);
    }
  return loops;
}

/**
 * Kantenstücke eines Saums: die Ränder der Form, gleichmäßig abgetastet, mit geglätteten Außennormalen; ein Punkt gehört
 * dazu, wenn seine Normale höchstens spread von dir abweicht. Stücke kürzer als die halbe Streifenhöhe fallen weg
 */
export function rimRuns(shape: ZoneShape, rim: ZoneRim): RimRun[] {
  const runs: RimRun[] = [];
  const step = Math.max(0.08, Math.min(0.5, rim.width / 3));
  for (const loop of rimLoops(shape, !!rim.holes)) {
    const pts = resample(loop, step);
    const n = pts.length;
    if (n < 3) continue;
    // Normale je Punkt aus den Nachbarn in einem Fenster von etwa der halben Streifenhöhe (ruhige Entscheidung)
    const reach = Math.max(1, Math.round(rim.width / 2 / step));
    const normals: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      normals.push([ty, -tx]);
    }
    const smooth: Array<[number, number]> = normals.map((_, i) => {
      let x = 0;
      let y = 0;
      for (let k = -reach; k <= reach; k++) {
        const q = normals[(i + k + n) % n];
        const w = 1 - Math.abs(k) / (reach + 1);
        x += q[0] * w;
        y += q[1] * w;
      }
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    });
    const inside = smooth.map(([x, y]) => angleGap((Math.atan2(y, x) * 180) / Math.PI, rim.dir) <= rim.spread + 1e-6);
    // Glättung der Normalen am Stück selbst schwächer (die Ecken bleiben scharf genug für den Streifen)
    const local = normals.map((_, i) => {
      let x = 0;
      let y = 0;
      for (let k = -1; k <= 1; k++) {
        const q = normals[(i + k + n) % n];
        x += q[0];
        y += q[1];
      }
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l] as [number, number];
    });
    if (inside.every(Boolean)) {
      runs.push(makeRun([...pts, pts[0]], [...local, local[0]], true));
      continue;
    }
    // Läufe von drinnen, über den Anfang des Rings hinweg verbunden
    const start = inside.findIndex((v) => !v);
    let cur: number[] = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (inside[i]) cur.push(i);
      if ((!inside[i] || k === n) && cur.length) {
        if (cur.length >= 2) runs.push(makeRun(cur.map((j) => pts[j]), cur.map((j) => local[j]), false));
        cur = [];
      }
    }
  }
  return runs.filter((r) => r.closed || r.s[r.s.length - 1] >= rim.width * 0.5);
}

function makeRun(pts: Array<[number, number]>, normals: Array<[number, number]>, closed: boolean): RimRun {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, normals, s, closed };
}

// ------------------------------------------------------------------ Streifen

/** Abschnitt eines Kantenstücks mit seinem Stück des Bilds (u0 bis u1 in der Bildbreite) */
export interface RimPiece {
  s0: number;
  s1: number;
  u0: number;
  u1: number;
}

/**
 * Teilung eines Kantenstücks der Länge L: wiederholen gibt Anfang, n Mitten und Ende (die Mitte ganzzahlig oft, leicht
 * gestreckt; ist das Stück kürzer als Anfang und Ende, schrumpfen beide), ein umlaufendes Stück nur Mitten; strecken gibt
 * ein Stück über alles
 */
export function rimPieces(rim: ZoneRim, L: number, closed: boolean): RimPiece[] {
  if (L <= 1e-6) return [];
  if (rim.mode === 'stretch') return [{ s0: 0, s1: L, u0: 0, u1: 1 }];
  const nat = rim.width * rim.aspect;
  const a = rim.a;
  const b = rim.b;
  const mid = Math.max(1e-3, (b - a) * nat);
  let capL = closed ? 0 : a * nat;
  let capR = closed ? 0 : (1 - b) * nat;
  const pieces: RimPiece[] = [];
  if (capL + capR > L * 0.999) {
    const k = L / Math.max(1e-6, capL + capR);
    capL *= k;
    capR *= k;
    if (capL > 1e-6) pieces.push({ s0: 0, s1: capL, u0: 0, u1: a });
    if (capR > 1e-6) pieces.push({ s0: capL, s1: L, u0: b, u1: 1 });
    return pieces;
  }
  const rest = L - capL - capR;
  const n = Math.max(1, Math.round(rest / mid));
  const m = rest / n;
  if (capL > 1e-6) pieces.push({ s0: 0, s1: capL, u0: 0, u1: a });
  for (let j = 0; j < n; j++) pieces.push({ s0: capL + j * m, s1: capL + (j + 1) * m, u0: a, u1: b });
  if (capR > 1e-6) pieces.push({ s0: L - capR, s1: L, u0: b, u1: 1 });
  return pieces;
}

/** Dreiecke eines Saums: Ecken in Ebenen-Koordinaten (x, y), Bildlage (u, v; v unten 0, oben 1), Dreiecke */
export interface RimStrip {
  pos: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

/** Punkt und Normale eines Kantenstücks an der Bogenlänge s (linear zwischen den Abtastpunkten) */
function runAt(run: RimRun, s: number, hint: number): { p: [number, number]; n: [number, number]; i: number } {
  let i = Math.max(0, Math.min(run.s.length - 2, hint));
  while (i < run.s.length - 2 && run.s[i + 1] < s) i++;
  while (i > 0 && run.s[i] > s) i--;
  const s0 = run.s[i];
  const s1 = run.s[i + 1];
  const t = s1 - s0 > 1e-9 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0;
  const a = run.pts[i];
  const b = run.pts[i + 1];
  const na = run.normals[i];
  const nb = run.normals[i + 1];
  let nx = na[0] + (nb[0] - na[0]) * t;
  let ny = na[1] + (nb[1] - na[1]) * t;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], n: [nx, ny], i };
}

/**
 * Streifen eines Saums über alle Kantenstücke: je Abschnitt (rimPieces) ein eigener Streifen mit Ecken an seinen Grenzen
 * und an allen Abtastpunkten dazwischen; oben die Normale mal (1 − base) · Breite, unten base · Breite in die Fläche
 */
export function rimStrip(shape: ZoneShape, rim: ZoneRim): RimStrip {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const up = rim.width * (1 - rim.base);
  const down = rim.width * rim.base;
  for (const run of rimRuns(shape, rim)) {
    const L = run.s[run.s.length - 1];
    let hint = 0;
    for (const piece of rimPieces(rim, L, run.closed)) {
      const cuts = [piece.s0];
      for (let i = 0; i < run.s.length; i++) if (run.s[i] > piece.s0 + 1e-6 && run.s[i] < piece.s1 - 1e-6) cuts.push(run.s[i]);
      cuts.push(piece.s1);
      const first = pos.length / 2;
      for (const s of cuts) {
        const at = runAt(run, s, hint);
        hint = at.i;
        const u = piece.u0 + ((s - piece.s0) / Math.max(1e-9, piece.s1 - piece.s0)) * (piece.u1 - piece.u0);
        pos.push(at.p[0] - at.n[0] * down, at.p[1] - at.n[1] * down, at.p[0] + at.n[0] * up, at.p[1] + at.n[1] * up);
        uv.push(u, 0, u, 1);
      }
      for (let k = 0; k < cuts.length - 1; k++) {
        const v = first + k * 2;
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index: new Uint32Array(index) };
}

/** Länge der Kantenstücke eines Saums (Meter der Ebene), für Malvorlage und Anzeige */
export function rimLengths(shape: ZoneShape, rim: ZoneRim): number[] {
  return rimRuns(shape, rim).map((r) => r.s[r.s.length - 1]);
}
