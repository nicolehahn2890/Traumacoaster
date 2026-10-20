/**
 * Datenmodell der Bahn und Bogenlängen-Abtastung.
 * Die Bahn ist ein geschlossener Pfad kubischer Bezier-Segmente in der Profil-Ebene (x, y),
 * jeder Knoten trägt zusätzlich eine Tiefe z (Spur) und einen Rollwinkel.
 */
import type { Vec2 } from '@/core/math';
import { bezierDerivative, bezierPoint, smoothstep, TAU } from '@/core/math';
import { LANE_DEPTH } from './stage';

export type NodeKind = 'normal' | 'loopApex' | 'turn' | 'station' | 'closeTurn' | 'closeReturn';
export type StartType = 'chainlift' | 'launch' | 'hydro' | 'swing' | 'verticalLift';

export interface TrackNode {
  x: number;
  y: number;
  /** Tiefe (Spur), kann in Kurven zwischen zwei Spuren liegen */
  z: number;
  /** Handles relativ zum Knoten */
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  /** Rollwinkel in Radiant (Schleife) */
  roll: number;
  kind: NodeKind;
}

export type ElementKind = 'booster' | 'brake' | 'splash' | 'launchBlock' | 'switch' | 'reverse' | 'tilt' | 'dropTrack';

export interface TrackElement {
  kind: ElementKind;
  /** Position als Bogenlänge auf der Bahn */
  s: number;
  length: number;
}

export interface TrackPath {
  nodes: TrackNode[];
  elements: TrackElement[];
  startType: StartType;
  /** Nummer von Vorlagen, die eingebaut wurden (für Element-Ziele) */
  templates: Record<string, number>;
}

export function createNode(x: number, y: number, z = 0, kind: NodeKind = 'normal'): TrackNode {
  return { x, y, z, inX: 0, inY: 0, outX: 0, outY: 0, roll: 0, kind };
}

export function emptyPath(): TrackPath {
  return { nodes: [], elements: [], startType: 'chainlift', templates: {} };
}

export function clonePath(p: TrackPath): TrackPath {
  return {
    nodes: p.nodes.map((n) => ({ ...n })),
    elements: p.elements.map((e) => ({ ...e })),
    startType: p.startType,
    templates: { ...p.templates },
  };
}

/** Kontrollpunkte des Segments i (von Knoten i nach i+1, zyklisch). */
export function segmentPoints(path: TrackPath, i: number): [Vec2, Vec2, Vec2, Vec2] {
  const n = path.nodes.length;
  const a = path.nodes[i % n];
  const b = path.nodes[(i + 1) % n];
  return [
    { x: a.x, y: a.y },
    { x: a.x + a.outX, y: a.y + a.outY },
    { x: b.x + b.inX, y: b.y + b.inY },
    { x: b.x, y: b.y },
  ];
}

/**
 * Abgetastete Bahn: alle Werte pro Abtastpunkt in Float64Arrays.
 * Die Bahn ist eine 3D-Kurve: x (entlang der Bühne), y (Höhe), z (Tiefe in Spuren; Meter = z·LANE_DEPTH).
 */
export interface TrackSamples {
  count: number;
  length: number;
  step: number;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** Einheitstangente in der Profil-Ebene (für die Darstellung) */
  tx: Float64Array;
  ty: Float64Array;
  /** 3D-Einheitstangente (z in Metern) */
  t3x: Float64Array;
  t3y: Float64Array;
  t3z: Float64Array;
  /** 3D-Krümmungsvektor (zeigt zum Krümmungsmittelpunkt) */
  k3x: Float64Array;
  k3y: Float64Array;
  k3z: Float64Array;
  /** „Oben“-Vektor des Wagens in 3D (Parallel-Transport, ohne Roll) */
  upx: Float64Array;
  upy: Float64Array;
  upz: Float64Array;
  roll: Float64Array;
  /** Segmentindex und lokaler Parameter */
  seg: Int32Array;
  t: Float64Array;
  /** 1 = automatischer Rückweg (Bremsstrecke, zählt nicht für Ziele) */
  auto: Uint8Array;
}

export interface TrackState {
  auto: boolean;
  s: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  t3x: number;
  t3y: number;
  t3z: number;
  k3x: number;
  k3y: number;
  k3z: number;
  upx: number;
  upy: number;
  upz: number;
  roll: number;
  seg: number;
  t: number;
}

const EMPTY = (): TrackSamples => ({
  count: 0, length: 0, step: 0.25, s: new Float64Array(0), x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0),
  tx: new Float64Array(0), ty: new Float64Array(0), t3x: new Float64Array(0), t3y: new Float64Array(0), t3z: new Float64Array(0),
  k3x: new Float64Array(0), k3y: new Float64Array(0), k3z: new Float64Array(0), upx: new Float64Array(0), upy: new Float64Array(0), upz: new Float64Array(0),
  roll: new Float64Array(0), seg: new Int32Array(0), t: new Float64Array(0), auto: new Uint8Array(0),
});

/**
 * Tastet die geschlossene Bahn mit festem Schritt ab.
 * Tiefe z wird pro Segment mit smoothstep zwischen den Knoten interpoliert (weiche Kurve).
 */
export function sampleTrack(path: TrackPath, step = 0.25): TrackSamples {
  const n = path.nodes.length;
  if (n < 2) return EMPTY();
  const isAutoNode = (nd: TrackNode) => nd.kind === 'closeTurn' || nd.kind === 'closeReturn';

  // 1) Grobe Abtastung in t, um Bogenlängen zu messen (z linear pro Segment, wird später geglättet)
  const raw: Array<{ seg: number; t: number; x: number; y: number; z: number; roll: number; d1: Vec2 }> = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = segmentPoints(path, i);
    const a = path.nodes[i];
    const b = path.nodes[(i + 1) % n];
    const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y) + Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const subdiv = Math.max(8, Math.ceil(chord / (step * 0.5)));
    let dRoll = b.roll - a.roll;
    while (dRoll > Math.PI) dRoll -= TAU;
    while (dRoll < -Math.PI) dRoll += TAU;
    for (let k = 0; k < subdiv; k++) {
      const t = k / subdiv;
      const p = bezierPoint(p0, p1, p2, p3, t);
      const d1 = bezierDerivative(p0, p1, p2, p3, t);
      raw.push({ seg: i, t, x: p.x, y: p.y, z: a.z + (b.z - a.z) * t, roll: a.roll + dRoll * smoothstep(t), d1 });
    }
  }
  const first = raw[0];
  raw.push({ ...first, seg: n - 1, t: 1 });

  // 2) kumulierte Bogenlänge in 3D
  const cum = new Float64Array(raw.length);
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i];
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, (b.z - a.z) * LANE_DEPTH);
  }
  const length = cum[raw.length - 1];
  const count = Math.max(2, Math.floor(length / step) + 1);

  const out: TrackSamples = {
    ...EMPTY(), count, length, step,
    s: new Float64Array(count), x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count),
    tx: new Float64Array(count), ty: new Float64Array(count), t3x: new Float64Array(count), t3y: new Float64Array(count), t3z: new Float64Array(count),
    k3x: new Float64Array(count), k3y: new Float64Array(count), k3z: new Float64Array(count),
    upx: new Float64Array(count), upy: new Float64Array(count), upz: new Float64Array(count),
    roll: new Float64Array(count), seg: new Int32Array(count), t: new Float64Array(count), auto: new Uint8Array(count),
  };

  // 3) Resampling bei gleichmäßigem s
  let j = 0;
  let ptx = 1;
  let pty = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(length, i * step);
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const a = raw[j];
    const b = raw[j + 1];
    const span = cum[j + 1] - cum[j];
    const f = span > 1e-9 ? (s - cum[j]) / span : 0;
    out.s[i] = s;
    out.x[i] = a.x + (b.x - a.x) * f;
    out.y[i] = a.y + (b.y - a.y) * f;
    out.z[i] = a.z + (b.z - a.z) * f;
    out.roll[i] = a.roll + (b.roll - a.roll) * f;
    out.seg[i] = a.seg;
    out.t[i] = a.t + (b.t - a.t) * f;
    const na = path.nodes[a.seg % n];
    const nb = path.nodes[(a.seg + 1) % n];
    out.auto[i] = isAutoNode(na) || isAutoNode(nb) ? 1 : 0;
    const d1x = a.d1.x + (b.d1.x - a.d1.x) * f;
    const d1y = a.d1.y + (b.d1.y - a.d1.y) * f;
    const l = Math.hypot(d1x, d1y);
    if (l > 1e-6) {
      ptx = d1x / l;
      pty = d1y / l;
    }
    out.tx[i] = ptx;
    out.ty[i] = pty;
  }

  // 4) Tiefe glätten (gleitender Mittelwert über ±3 m), damit Kurven keine Knicke haben
  const win = Math.max(1, Math.round(3 / step));
  const zs = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    let w = 0;
    for (let k = -win; k <= win; k++) {
      const idx = (i + k + count) % count;
      const wk = win + 1 - Math.abs(k);
      sum += out.z[idx] * wk;
      w += wk;
    }
    zs[i] = sum / w;
  }
  out.z = zs;

  // 5) 3D-Tangente und -Krümmung numerisch (zentrale Differenzen, zyklisch)
  const P = (i: number, c: 0 | 1 | 2): number => {
    const idx = (i + count) % count;
    return c === 0 ? out.x[idx] : c === 1 ? out.y[idx] : out.z[idx] * LANE_DEPTH;
  };
  for (let i = 0; i < count; i++) {
    let dx = P(i + 1, 0) - P(i - 1, 0);
    let dy = P(i + 1, 1) - P(i - 1, 1);
    let dz = P(i + 1, 2) - P(i - 1, 2);
    const l = Math.hypot(dx, dy, dz) || 1e-9;
    dx /= l; dy /= l; dz /= l;
    out.t3x[i] = dx; out.t3y[i] = dy; out.t3z[i] = dz;
  }
  for (let i = 0; i < count; i++) {
    const ip = (i + 1) % count;
    const im = (i - 1 + count) % count;
    const h = 2 * step;
    out.k3x[i] = (out.t3x[ip] - out.t3x[im]) / h;
    out.k3y[i] = (out.t3y[ip] - out.t3y[im]) / h;
    out.k3z[i] = (out.t3z[ip] - out.t3z[im]) / h;
  }

  // 6) Oben-Vektor: Parallel-Transport (für Loopings), aber bei waagerechter Bahn stetig zur
  //    projizierten Welt-Senkrechten zurückgezogen (vorzeichenrichtig), damit Kurven keinen Roll aufbauen.
  let ux = 0;
  let uy = 1;
  let uz = 0;
  for (let i = 0; i < count; i++) {
    const tx = out.t3x[i];
    const ty = out.t3y[i];
    const tz = out.t3z[i];
    let d = ux * tx + uy * ty + uz * tz;
    ux -= d * tx; uy -= d * ty; uz -= d * tz;
    let l = Math.hypot(ux, uy, uz);
    if (l < 1e-6) {
      ux = -ty; uy = tx; uz = 0;
      l = Math.hypot(ux, uy, uz) || 1;
    }
    ux /= l; uy /= l; uz /= l;
    // projizierte Welt-Senkrechte, Vorzeichen wie der transportierte Vektor
    let px = -ty * tx;
    let py = 1 - ty * ty;
    let pz = -ty * tz;
    const pl = Math.hypot(px, py, pz);
    if (pl > 1e-6) {
      px /= pl; py /= pl; pz /= pl;
      const sgn = ux * px + uy * py + uz * pz >= 0 ? 1 : -1;
      const w = Math.pow(Math.max(0, 1 - Math.abs(ty) * 1.3), 2) * 0.35;
      ux = ux * (1 - w) + sgn * px * w;
      uy = uy * (1 - w) + sgn * py * w;
      uz = uz * (1 - w) + sgn * pz * w;
      d = ux * tx + uy * ty + uz * tz;
      ux -= d * tx; uy -= d * ty; uz -= d * tz;
      l = Math.hypot(ux, uy, uz) || 1;
      ux /= l; uy /= l; uz /= l;
    }
    out.upx[i] = ux; out.upy[i] = uy; out.upz[i] = uz;
  }
  return out;
}

/** Zustand bei Bogenlänge s (zyklisch), linear interpoliert. */
export function stateAt(samples: TrackSamples, s: number): TrackState {
  const L = samples.length;
  if (samples.count === 0 || L <= 0) {
    return { auto: false, s: 0, x: 0, y: 0, z: 0, tx: 1, ty: 0, t3x: 1, t3y: 0, t3z: 0, k3x: 0, k3y: 0, k3z: 0, upx: 0, upy: 1, upz: 0, roll: 0, seg: 0, t: 0 };
  }
  let sw = s % L;
  if (sw < 0) sw += L;
  const fi = sw / samples.step;
  const i = Math.min(samples.count - 1, Math.floor(fi));
  const j = (i + 1) % samples.count;
  const f = fi - i;
  const lerp = (arr: Float64Array) => arr[i] + (arr[j] - arr[i]) * f;
  const tx = lerp(samples.tx);
  const ty = lerp(samples.ty);
  const tl = Math.hypot(tx, ty) || 1;
  let t3x = lerp(samples.t3x);
  let t3y = lerp(samples.t3y);
  let t3z = lerp(samples.t3z);
  const l3 = Math.hypot(t3x, t3y, t3z) || 1;
  t3x /= l3; t3y /= l3; t3z /= l3;
  let upx = lerp(samples.upx);
  let upy = lerp(samples.upy);
  let upz = lerp(samples.upz);
  const lu = Math.hypot(upx, upy, upz) || 1;
  upx /= lu; upy /= lu; upz /= lu;
  return {
    auto: samples.auto[i] === 1,
    s: sw, x: lerp(samples.x), y: lerp(samples.y), z: lerp(samples.z),
    tx: tx / tl, ty: ty / tl, t3x, t3y, t3z,
    k3x: lerp(samples.k3x), k3y: lerp(samples.k3y), k3z: lerp(samples.k3z),
    upx, upy, upz, roll: lerp(samples.roll), seg: samples.seg[i], t: lerp(samples.t),
  };
}

/** Nächster Punkt auf der Bahn zu (x, y) in der Profil-Ebene (optional mit Tiefe). */
export function closestSample(samples: TrackSamples, x: number, y: number, z?: number): { index: number; s: number; d: number } {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < samples.count; i++) {
    const dz = z === undefined ? 0 : (samples.z[i] - z) * LANE_DEPTH * 0.5;
    const d = Math.hypot(samples.x[i] - x, samples.y[i] - y, dz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, s: best >= 0 ? samples.s[best] : 0, d: bestD };
}

/** Kennzahlen der Bahn für Ziele: Höhe, Loopings, Kurven, Spuren, Länge, Drop. */
export interface TrackStats {
  length: number;
  maxHeight: number;
  loops: number;
  turns: number;
  lanes: number;
  rolls: number;
  maxDrop: number;
}

export function trackStats(path: TrackPath, samples: TrackSamples): TrackStats {
  let maxHeight = 0;
  for (let i = 0; i < samples.count; i++) if (!samples.auto[i]) maxHeight = Math.max(maxHeight, samples.y[i]);
  const loops = path.nodes.filter((n) => n.kind === 'loopApex').length;
  // Kurven: Zählen der Spurwechsel zwischen aufeinanderfolgenden Knoten mit ganzzahliger Spur
  // Automatische Rückweg-Knoten (closeTurn/closeReturn) zählen nicht.
  let turns = 0;
  const laneSet = new Set<number>();
  const nodes = path.nodes;
  const isAuto = (n: TrackNode) => n.kind === 'closeTurn' || n.kind === 'closeReturn';
  for (let i = 0; i < nodes.length; i++) {
    const na = nodes[i];
    const nb = nodes[(i + 1) % nodes.length];
    if (isAuto(na) || isAuto(nb)) continue;
    const a = Math.round(na.z);
    const b = Math.round(nb.z);
    laneSet.add(a);
    laneSet.add(b);
    if (a !== b) turns += Math.abs(b - a);
  }
  // Schleifen: volle Umdrehungen des Rollwinkels
  let rollTotal = 0;
  for (let i = 1; i < samples.count; i++) rollTotal += Math.abs(samples.roll[i] - samples.roll[i - 1]);
  const rolls = Math.floor(rollTotal / TAU + 1e-6);
  // größter Drop: größter Höhenverlust zwischen lokalem Maximum und folgendem Minimum
  let maxDrop = 0;
  let peak = samples.count ? samples.y[0] : 0;
  for (let i = 1; i < samples.count; i++) {
    const y = samples.y[i];
    if (y > peak) peak = y;
    maxDrop = Math.max(maxDrop, peak - y);
  }
  return { length: samples.length, maxHeight, loops, turns, lanes: laneSet.size, rolls, maxDrop };
}
