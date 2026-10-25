/**
 * Datenmodell der Bahn: geschlossener Pfad kubischer Bezier-Segmente in 3D.
 * Knoten: x (entlang der Bühne), y (Höhe), z (Tiefe in Spuren, kontinuierlich), Handles ebenfalls 3D,
 * dazu ein manueller Rollwinkel (Schräglage) pro Knoten.
 */
import type { Vec3 } from '@/core/math3';
import { bezier3, bezier3d1, bezier3d2, cross3, dot3, normalize3, sub3, len3 } from '@/core/math3';
import { clamp } from '@/core/math';
import { LANE_DEPTH } from './stage';
import { findCrossings } from './crossings';

export type NodeKind = 'normal' | 'loopApex' | 'turn' | 'station' | 'closeTurn' | 'closeReturn';
export type StartType = 'chainlift' | 'launch' | 'hydro' | 'swing' | 'verticalLift';

export interface TrackNode {
  x: number;
  y: number;
  /** Tiefe in Spuren (−2 … 2), kontinuierlich */
  z: number;
  inX: number;
  inY: number;
  inZ: number;
  outX: number;
  outY: number;
  outZ: number;
  /** manueller Rollwinkel (Schräglage) in Radiant; NaN = automatisch */
  roll: number;
  kind: NodeKind;
}

export type ElementKind = 'booster' | 'brake' | 'splash' | 'launchBlock' | 'switch' | 'reverse' | 'tilt' | 'dropTrack';

export interface TrackElement {
  kind: ElementKind;
  s: number;
  length: number;
}

/**
 * Protokoll des Rundenschlusses: Was closePath vom gezeichneten Ende entfernt oder überschrieben hat.
 * Damit lässt sich der Schluss vor jeder Neuberechnung rückgängig machen; closePath ist so wiederholbar
 * (jede Bearbeitung ruft es erneut auf) und öffnet eine von Hand geschlossene Bahn nie wieder.
 */
export interface PathClosure {
  /** Knoten, die der Schluss vom Ende entfernt hat (in ursprünglicher Reihenfolge) */
  trimmed: TrackNode[];
  /** Eingangs-Handle der Station vor dem Schluss */
  firstIn: [number, number, number];
  /** Knoten (Index) und Ausgangs-Handle, die der Schluss überschrieben hat */
  lastOut: { index: number; out: [number, number, number] } | null;
}

export interface TrackPath {
  nodes: TrackNode[];
  elements: TrackElement[];
  startType: StartType;
  templates: Record<string, number>;
  /** false = offene Bahn (Ende noch nicht mit der Station verbunden); fehlt = geschlossen */
  closed?: boolean;
  /** Protokoll des Rundenschlusses (nur bei geschlossener Bahn), siehe PathClosure */
  closure?: PathClosure;
  /** mit dem Pinsel gezeichnet (src/track/brushTrack.ts): Linie = Bahn, kein Rundenschluss der Bühnen-Lesart */
  brush?: boolean;
}

export function cloneClosure(c: PathClosure | undefined): PathClosure | undefined {
  if (!c) return undefined;
  return { trimmed: c.trimmed.map((n) => ({ ...n })), firstIn: [...c.firstIn], lastOut: c.lastOut ? { index: c.lastOut.index, out: [...c.lastOut.out] } : null };
}

export const isClosed = (p: TrackPath): boolean => p.closed !== false;

export function createNode(x: number, y: number, z = 0, kind: NodeKind = 'normal'): TrackNode {
  return { x, y, z, inX: 0, inY: 0, inZ: 0, outX: 0, outY: 0, outZ: 0, roll: NaN, kind };
}

export function emptyPath(): TrackPath {
  return { nodes: [], elements: [], startType: 'chainlift', templates: {}, closed: true };
}

export function clonePath(p: TrackPath): TrackPath {
  const out: TrackPath = { nodes: p.nodes.map((n) => ({ ...n })), elements: p.elements.map((e) => ({ ...e })), startType: p.startType, templates: { ...p.templates }, closed: p.closed !== false };
  const closure = cloneClosure(p.closure);
  if (closure) out.closure = closure;
  if (p.brush) out.brush = true;
  return out;
}

export const isAutoNode = (n: TrackNode): boolean => n.kind === 'closeTurn' || n.kind === 'closeReturn';

/** Knotenposition in Metern (z × LANE_DEPTH) */
export const nodePos = (n: TrackNode): Vec3 => ({ x: n.x, y: n.y, z: n.z * LANE_DEPTH });
export const nodeIn = (n: TrackNode): Vec3 => ({ x: n.x + n.inX, y: n.y + n.inY, z: (n.z + n.inZ) * LANE_DEPTH });
export const nodeOut = (n: TrackNode): Vec3 => ({ x: n.x + n.outX, y: n.y + n.outY, z: (n.z + n.outZ) * LANE_DEPTH });

/** Kontrollpunkte des Segments i (Knoten i → i+1, zyklisch), in Metern */
export function segmentPoints(path: TrackPath, i: number): [Vec3, Vec3, Vec3, Vec3] {
  const n = path.nodes.length;
  const a = path.nodes[i % n];
  const b = path.nodes[(i + 1) % n];
  return [nodePos(a), nodeOut(a), nodeIn(b), nodePos(b)];
}

export interface TrackSamples {
  count: number;
  length: number;
  step: number;
  /** zyklisch (geschlossene Bahn) oder offen bis zum letzten Knoten */
  closed: boolean;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** Tiefe in Spuren */
  z: Float64Array;
  /** 3D-Einheitstangente (z in Metern) */
  t3x: Float64Array;
  t3y: Float64Array;
  t3z: Float64Array;
  /** 3D-Krümmungsvektor (zum Mittelpunkt) */
  k3x: Float64Array;
  k3y: Float64Array;
  k3z: Float64Array;
  /** Krümmung, weit geglättet: Grundlage der automatischen Überhöhung (siehe bankAt) */
  kbx: Float64Array;
  kby: Float64Array;
  kbz: Float64Array;
  /** Oben-Vektor ohne Schräglage */
  upx: Float64Array;
  upy: Float64Array;
  upz: Float64Array;
  /** manueller Rollwinkel (NaN = automatisch) */
  roll: Float64Array;
  seg: Int32Array;
  t: Float64Array;
  auto: Uint8Array;
}

export interface TrackState {
  auto: boolean;
  s: number;
  x: number;
  y: number;
  z: number;
  t3x: number;
  t3y: number;
  t3z: number;
  k3x: number;
  k3y: number;
  k3z: number;
  kbx: number;
  kby: number;
  kbz: number;
  upx: number;
  upy: number;
  upz: number;
  roll: number;
  seg: number;
  t: number;
}

const EMPTY = (): TrackSamples => ({
  count: 0, length: 0, step: 0.25, closed: true, s: new Float64Array(0), x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0),
  t3x: new Float64Array(0), t3y: new Float64Array(0), t3z: new Float64Array(0), k3x: new Float64Array(0), k3y: new Float64Array(0), k3z: new Float64Array(0),
  kbx: new Float64Array(0), kby: new Float64Array(0), kbz: new Float64Array(0),
  upx: new Float64Array(0), upy: new Float64Array(0), upz: new Float64Array(0), roll: new Float64Array(0), seg: new Int32Array(0), t: new Float64Array(0), auto: new Uint8Array(0),
});

/** Halbe Breite (Meter) des Fensters, über das die Krümmung für die automatische Überhöhung geglättet wird */
export const BANK_SMOOTH = 5;

/** Tastet die 3D-Bahn mit festem Schritt ab (geschlossen zyklisch, offen bis zum letzten Knoten). */
export function sampleTrack(path: TrackPath, step = 0.25): TrackSamples {
  const n = path.nodes.length;
  if (n < 2) return EMPTY();
  const closed = isClosed(path);
  const segCount = closed ? n : n - 1;

  // 1) Grobe Abtastung in t
  const raw: Array<{ seg: number; t: number; p: Vec3; d1: Vec3; d2: Vec3; roll: number }> = [];
  for (let i = 0; i < segCount; i++) {
    const [p0, p1, p2, p3] = segmentPoints(path, i);
    const a = path.nodes[i];
    const b = path.nodes[(i + 1) % n];
    const approx = len3(sub3(p1, p0)) + len3(sub3(p2, p1)) + len3(sub3(p3, p2));
    const subdiv = Math.max(8, Math.ceil(approx / (step * 0.5)));
    const ra = Number.isNaN(a.roll) ? NaN : a.roll;
    const rb = Number.isNaN(b.roll) ? NaN : b.roll;
    for (let k = 0; k < subdiv; k++) {
      const t = k / subdiv;
      let roll = NaN;
      if (!Number.isNaN(ra) && !Number.isNaN(rb)) roll = ra + (rb - ra) * t;
      else if (!Number.isNaN(ra)) roll = ra * (1 - t);
      else if (!Number.isNaN(rb)) roll = rb * t;
      raw.push({ seg: i, t, p: bezier3(p0, p1, p2, p3, t), d1: bezier3d1(p0, p1, p2, p3, t), d2: bezier3d2(p0, p1, p2, p3, t), roll });
    }
  }
  if (closed) raw.push({ ...raw[0], seg: n - 1, t: 1 });
  else {
    const [p0, p1, p2, p3] = segmentPoints(path, n - 2);
    const endRoll = Number.isNaN(path.nodes[n - 1].roll) ? NaN : path.nodes[n - 1].roll;
    raw.push({ seg: n - 2, t: 1, p: bezier3(p0, p1, p2, p3, 1), d1: bezier3d1(p0, p1, p2, p3, 1), d2: bezier3d2(p0, p1, p2, p3, 1), roll: endRoll });
  }

  // 2) Bogenlänge
  const cum = new Float64Array(raw.length);
  for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + len3(sub3(raw[i].p, raw[i - 1].p));
  const length = cum[raw.length - 1];
  // letzter Abtastpunkt liegt genau am Ende (offene Bahn endet dort, geschlossene schließt den Kreis)
  const count = Math.max(2, Math.ceil(length / step - 1e-9) + 1);
  const out: TrackSamples = {
    ...EMPTY(), count, length, step, closed,
    s: new Float64Array(count), x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count),
    t3x: new Float64Array(count), t3y: new Float64Array(count), t3z: new Float64Array(count), k3x: new Float64Array(count), k3y: new Float64Array(count), k3z: new Float64Array(count),
    kbx: new Float64Array(count), kby: new Float64Array(count), kbz: new Float64Array(count),
    upx: new Float64Array(count), upy: new Float64Array(count), upz: new Float64Array(count), roll: new Float64Array(count), seg: new Int32Array(count), t: new Float64Array(count), auto: new Uint8Array(count),
  };

  // 3) Resampling
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(length, i * step);
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const a = raw[j];
    const b = raw[j + 1];
    const span = cum[j + 1] - cum[j];
    const f = span > 1e-9 ? (s - cum[j]) / span : 0;
    out.s[i] = s;
    out.x[i] = a.p.x + (b.p.x - a.p.x) * f;
    out.y[i] = a.p.y + (b.p.y - a.p.y) * f;
    out.z[i] = (a.p.z + (b.p.z - a.p.z) * f) / LANE_DEPTH;
    out.roll[i] = Number.isNaN(a.roll) && Number.isNaN(b.roll) ? NaN : Number.isNaN(a.roll) ? b.roll * f : Number.isNaN(b.roll) ? a.roll * (1 - f) : a.roll + (b.roll - a.roll) * f;
    out.seg[i] = a.seg;
    out.t[i] = a.t + (b.t - a.t) * f;
    const na = path.nodes[a.seg % n];
    const nb = path.nodes[(a.seg + 1) % n];
    out.auto[i] = isAutoNode(na) || isAutoNode(nb) ? 1 : 0;
    // Tangente und Krümmung analytisch
    const d1 = { x: a.d1.x + (b.d1.x - a.d1.x) * f, y: a.d1.y + (b.d1.y - a.d1.y) * f, z: a.d1.z + (b.d1.z - a.d1.z) * f };
    const d2 = { x: a.d2.x + (b.d2.x - a.d2.x) * f, y: a.d2.y + (b.d2.y - a.d2.y) * f, z: a.d2.z + (b.d2.z - a.d2.z) * f };
    const l = len3(d1) || 1e-9;
    const T = { x: d1.x / l, y: d1.y / l, z: d1.z / l };
    out.t3x[i] = T.x; out.t3y[i] = T.y; out.t3z[i] = T.z;
    // Krümmungsvektor = (d2 − (d2·T)T) / |d1|²
    const dt = dot3(d2, T);
    out.k3x[i] = (d2.x - dt * T.x) / (l * l);
    out.k3y[i] = (d2.y - dt * T.y) / (l * l);
    out.k3z[i] = (d2.z - dt * T.z) / (l * l);
  }

  // 3b) Krümmung über die Wagenlänge mitteln (±1,2 m): Ein Wagen mit Radstand spürt keine Krümmungsspitzen,
  // die kürzer sind als er selbst; die Bezier-Knoten (nur C1) hätten sonst Sprünge in den g-Kräften.
  const win = Math.max(1, Math.round(1.2 / step));
  const kx = Float64Array.from(out.k3x);
  const ky = Float64Array.from(out.k3y);
  const kz = Float64Array.from(out.k3z);
  for (let i = 0; i < count; i++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let k = -win; k <= win; k++) {
      let j = i + k;
      if (closed) j = ((j % count) + count) % count;
      else if (j < 0 || j >= count) continue;
      sx += kx[j]; sy += ky[j]; sz += kz[j]; n++;
    }
    out.k3x[i] = sx / n; out.k3y[i] = sy / n; out.k3z[i] = sz / n;
  }

  // 3c) Für die Überhöhung die Krümmung weit glätten (Dreiecksfenster ±BANK_SMOOTH): Die Schräglage folgt so dem
  // Bogen, nicht jedem kurzen Haken. Ein enger Spurwechsel (S in der Tiefe) mittelt sich fast weg, statt die
  // Schienen in wenigen Metern hin und her zu verdrehen; Ein- und Ausfahrt einer Kurve rollen weich.
  const bw = Math.max(1, Math.round(BANK_SMOOTH / step));
  for (let i = 0; i < count; i++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let wsum = 0;
    for (let k = -bw; k <= bw; k++) {
      let j = i + k;
      if (closed) j = ((j % count) + count) % count;
      else if (j < 0 || j >= count) continue;
      const w = bw + 1 - Math.abs(k);
      sx += out.k3x[j] * w; sy += out.k3y[j] * w; sz += out.k3z[j] * w; wsum += w;
    }
    // wieder senkrecht zur Tangente: In einer Kehre dreht die Tangente im Fenster, der Mittelwert zeigt sonst
    // teils nach hinten und täuscht eine Kraft aus dem Sitz vor
    sx /= wsum; sy /= wsum; sz /= wsum;
    const d = sx * out.t3x[i] + sy * out.t3y[i] + sz * out.t3z[i];
    out.kbx[i] = sx - d * out.t3x[i]; out.kby[i] = sy - d * out.t3y[i]; out.kbz[i] = sz - d * out.t3z[i];
  }

  // 4) Oben-Vektor: Parallel-Transport, bei waagerechter Bahn zur Welt-Senkrechten zurückgedreht. Kopfüber bleibt
  // der Wagen nur, wo der Transport ihn kopfüber bringt und die Bahn sich nach unten krümmt (oben im Looping: Die
  // Mitte liegt darunter). Sonst dreht er auf flacher Strecke zurück auf die Räder, höchstens ROLL_BACK je Meter.
  // (Früher folgte die Richtung dem Transport: Auf verdrehten 3D-Wegen, etwa einem kleinen Kringel der Pinsel-Bahn,
  // blieb der Zug danach auf ebener Strecke kopfüber liegen.)
  const ROLL_BACK = (24 * Math.PI) / 180;
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
    let px = -ty * tx;
    let py = 1 - ty * ty;
    let pz = -ty * tz;
    const pl = Math.hypot(px, py, pz);
    if (pl > 1e-6) {
      px /= pl; py /= pl; pz /= pl;
      const cur = ux * px + uy * py + uz * pz >= 0 ? 1 : -1;
      const sgn = cur < 0 && out.k3y[i] < -0.02 ? -1 : 1;
      const w = Math.pow(Math.max(0, 1 - Math.abs(ty) * 1.3), 2) * 0.35;
      if (w > 0) {
        // um die Tangente zur Zielrichtung drehen (Anteil w des Winkels): Drehen statt Mischen, so kommt auch ein
        // ganz verdrehter Rahmen zurück (gemischt hebt sich ein entgegengesetzter Vektor nur auf)
        const qx = sgn * px;
        const qy = sgn * py;
        const qz = sgn * pz;
        const cx = uy * qz - uz * qy;
        const cy = uz * qx - ux * qz;
        const cz = ux * qy - uy * qx;
        const lim = ROLL_BACK * step;
        const phi = clamp(Math.atan2(cx * tx + cy * ty + cz * tz, ux * qx + uy * qy + uz * qz) * w, -lim, lim);
        const cs = Math.cos(phi);
        const sn = Math.sin(phi);
        // Rodrigues um T (u steht senkrecht auf T): u' = u·cos + (T × u)·sin
        const rx = ty * uz - tz * uy;
        const ry = tz * ux - tx * uz;
        const rz = tx * uy - ty * ux;
        ux = ux * cs + rx * sn;
        uy = uy * cs + ry * sn;
        uz = uz * cs + rz * sn;
        l = Math.hypot(ux, uy, uz) || 1;
        ux /= l; uy /= l; uz /= l;
      }
    }
    out.upx[i] = ux; out.upy[i] = uy; out.upz[i] = uz;
  }
  return out;
}

export function stateAt(samples: TrackSamples, s: number): TrackState {
  const L = samples.length;
  if (samples.count === 0 || L <= 0) {
    return { auto: false, s: 0, x: 0, y: 0, z: 0, t3x: 1, t3y: 0, t3z: 0, k3x: 0, k3y: 0, k3z: 0, kbx: 0, kby: 0, kbz: 0, upx: 0, upy: 1, upz: 0, roll: NaN, seg: 0, t: 0 };
  }
  let sw = s % L;
  if (sw < 0) sw += L;
  if (!samples.closed) sw = Math.max(0, Math.min(L, s));
  const fi = sw / samples.step;
  const i = Math.min(samples.count - 1, Math.floor(fi));
  const j = samples.closed ? (i + 1) % samples.count : Math.min(samples.count - 1, i + 1);
  const f = Math.min(1, fi - i);
  const lerp = (arr: Float64Array) => arr[i] + (arr[j] - arr[i]) * f;
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
  const ra = samples.roll[i];
  const rb = samples.roll[j];
  const roll = Number.isNaN(ra) && Number.isNaN(rb) ? NaN : Number.isNaN(ra) ? rb : Number.isNaN(rb) ? ra : ra + (rb - ra) * f;
  return {
    auto: samples.auto[i] === 1, s: sw, x: lerp(samples.x), y: lerp(samples.y), z: lerp(samples.z),
    t3x, t3y, t3z, k3x: lerp(samples.k3x), k3y: lerp(samples.k3y), k3z: lerp(samples.k3z), kbx: lerp(samples.kbx), kby: lerp(samples.kby), kbz: lerp(samples.kbz),
    upx, upy, upz, roll, seg: samples.seg[i], t: lerp(samples.t),
  };
}

/** Nächster Abtastpunkt zu einem 3D-Punkt (x, y, z in Spuren) */
export function closestSample(samples: TrackSamples, x: number, y: number, z: number): { index: number; s: number; d: number } {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < samples.count; i++) {
    const d = Math.hypot(samples.x[i] - x, samples.y[i] - y, (samples.z[i] - z) * LANE_DEPTH);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, s: best >= 0 ? samples.s[best] : 0, d: bestD };
}

/**
 * Schräglage an einem Abtastpunkt für Geschwindigkeit v: manuell oder automatisch (bis MAX_BANK), in die Kurve
 * hinein. smooth: weit geglättete Krümmung statt der Krümmung über die Wagenlänge (für die Darstellung der Schienen).
 */
export function bankAt(st: TrackState, v: number, gravity = 9.81, smooth = false): { angle: number; nx: number; ny: number; nz: number } {
  // seitliche Richtung (T × up ohne Schräglage); positive Schräglage neigt den Wagen zur +Seite
  const side = normalize3(cross3({ x: st.t3x, y: st.t3y, z: st.t3z }, { x: st.upx, y: st.upy, z: st.upz }));
  if (!Number.isNaN(st.roll)) {
    return { angle: st.roll, nx: side.x, ny: side.y, nz: side.z };
  }
  // Automatische Überhöhung: die gefühlte Kraft (Fliehkraft v²·k + Schwerkraft) soll durch den Sitz gehen,
  // also keine Querkraft übrig lassen. Dazu wird der Oben-Vektor zur Kraftrichtung gedreht (max. 60°).
  const fx = v * v * (smooth ? st.kbx : st.k3x);
  const fy = v * v * (smooth ? st.kby : st.k3y) + gravity;
  const fz = v * v * (smooth ? st.kbz : st.k3z);
  const fu = fx * st.upx + fy * st.upy + fz * st.upz; // Anteil in Sitzrichtung
  const fs = fx * side.x + fy * side.y + fz * side.z; // Anteil zur Seite
  // Die Schräglage folgt der Kraftrichtung (höchstens MAX_BANK), auch wenn die Kraft quer zum Sitz steht (in
  // einer flachen Kurve kann ein leicht geneigter Oben-Vektor den Anteil in Sitzrichtung fast null machen).
  // Zieht die Kraft deutlich aus dem Sitz (Airtime, zu langsam im Looping), wird nicht geneigt: zwischen 120° und
  // 150° weich auf null, ebenso bei fast schwereloser Fahrt, wo die Kraftrichtung keine Aussage hat. Stetig, damit
  // Schienen und Wagen nicht von einem Abtastpunkt zum nächsten zwischen 0° und 80° springen.
  const phi = Math.atan2(fs, fu);
  const a = Math.abs(phi);
  let angle = Math.sign(phi) * Math.min(a, MAX_BANK);
  if (a > (2 * Math.PI) / 3) angle *= ease01(((5 * Math.PI) / 6 - a) / (Math.PI / 6));
  angle *= ease01(Math.hypot(fu, fs) / 2);
  return { angle, nx: side.x, ny: side.y, nz: side.z };
}

/** weicher Übergang 0 → 1 für t in [0, 1] */
const ease01 = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Maximale automatische Überhöhung (echte Bahnen fahren enge, schnelle Kurven mit 70–90°) */
export const MAX_BANK = (80 * Math.PI) / 180;

/** Wagen-Rahmen (vorwärts, oben, seitlich) inkl. Schräglage */
export function carFrame(st: TrackState, v: number, gravity = 9.81): { T: Vec3; U: Vec3; S: Vec3; bank: number } {
  return frameWithBank(st, bankAt(st, v, gravity).angle);
}

/** Rahmen für eine gegebene Schräglage */
export function frameWithBank(st: TrackState, angle: number): { T: Vec3; U: Vec3; S: Vec3; bank: number } {
  const T = { x: st.t3x, y: st.t3y, z: st.t3z };
  const up0 = { x: st.upx, y: st.upy, z: st.upz };
  const side0 = normalize3(cross3(T, up0));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const U = normalize3({ x: up0.x * c + side0.x * s, y: up0.y * c + side0.y * s, z: up0.z * c + side0.z * s });
  const S = normalize3(cross3(T, U));
  return { T, U, S, bank: angle };
}

/**
 * Schräglage der Schienen je Abtastpunkt für die Darstellung (der Wagen fährt darauf mit): aus der weit geglätteten
 * Krümmung, dann als glatte Kurve mit wenig Rollen (Ausgleich zwischen Abweichung von dieser Schräglage und
 * Rollrate, Länge RAIL_ROLL_SMOOTH). Kurze Haken und S-Kurven in der Tiefe mitteln sich weg, statt die Schienen
 * hin und her zu drehen; lange Bögen erreichen ihre Schräglage. Manuelle Schräglagen bleiben genau. speed(i)
 * liefert das Auslegungstempo.
 */
export function railBanks(samples: TrackSamples, speed: (i: number) => number): Float64Array {
  const n = samples.count;
  const raw = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = bankAt(stateAt(samples, samples.s[i]), speed(i), 9.81, true).angle;
    w[i] = Number.isNaN(samples.roll[i]) ? 1 : 1e6;
  }
  return smoothRoll(raw, w, samples.closed, (RAIL_ROLL_SMOOTH / samples.step) ** 2);
}

/** Länge (Meter), über die die Schräglage der Schienen ausgeglichen wird (siehe railBanks) */
export const RAIL_ROLL_SMOOTH = 9;

/** Auslegungstempo (m/s) für die Schräglage der Schienen: Fall vom höchsten Punkt, gedämpft, plus Grundtempo */
export function designSpeed(samples: TrackSamples, i: number, maxY: number): number {
  return Math.sqrt(Math.max(0, 2 * 9.81 * (maxY - samples.y[i]))) * 0.8 + 2;
}

/** Schräglage der Schienen einer Abtastung mit dem Auslegungstempo: dieselbe Rechnung für Bühne und Welt */
export function railBanksFor(samples: TrackSamples): Float64Array {
  let maxY = 0;
  for (let i = 0; i < samples.count; i++) maxY = Math.max(maxY, samples.y[i]);
  return railBanks(samples, (i) => designSpeed(samples, i, maxY));
}

/**
 * Glatte Folge b zu Werten a: min Σ w·(b − a)² + mu·Σ (b[i+1] − b[i])² (tridiagonal, Thomas-Verfahren). Geschlossen:
 * mit einem Polster aus dem Umlauf auf beiden Seiten gelöst, das weit genug ist, dass die Enden nicht mehr wirken.
 */
function smoothRoll(a: Float64Array, w: Float64Array, closed: boolean, mu: number): Float64Array {
  const n = a.length;
  if (n < 3) return Float64Array.from(a);
  const pad = closed ? Math.min(n, Math.ceil(8 * Math.sqrt(mu))) : 0;
  const m = n + 2 * pad;
  const at = (k: number) => (((k - pad) % n) + n) % n;
  const diag = new Float64Array(m);
  const rhs = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const i = at(k);
    diag[k] = w[i] + (k > 0 ? mu : 0) + (k < m - 1 ? mu : 0);
    rhs[k] = w[i] * a[i];
  }
  // Nebendiagonale überall −mu: vorwärts eliminieren, rückwärts einsetzen
  const c = new Float64Array(m);
  const d = new Float64Array(m);
  c[0] = -mu / diag[0];
  d[0] = rhs[0] / diag[0];
  for (let k = 1; k < m; k++) {
    const piv = diag[k] + mu * c[k - 1];
    c[k] = -mu / piv;
    d[k] = (rhs[k] + mu * d[k - 1]) / piv;
  }
  const b = new Float64Array(m);
  b[m - 1] = d[m - 1];
  for (let k = m - 2; k >= 0; k--) b[k] = d[k] - c[k] * b[k + 1];
  return b.slice(pad, pad + n);
}

export interface TrackStats {
  length: number;
  maxHeight: number;
  loops: number;
  turns: number;
  lanes: number;
  rolls: number;
  maxDrop: number;
  /** Kreuzungen der Bahn mit sich selbst auf gleicher Höhe (dort entgleist der Zug) */
  crossings?: number;
}

/** Kennzahlen: Höhe, Loopings (Inversionen), Kurven (Gierwinkel-Bögen ≥ 60°), Spuren, Schleifen, Drop */
export function trackStats(path: TrackPath, samples: TrackSamples): TrackStats {
  let maxHeight = 0;
  let loops = 0;
  let turns = 0;
  const laneSet = new Set<number>();
  let maxDrop = 0;
  let peak = samples.count ? samples.y[0] : 0;
  let inverted = false;
  let yawAccum = 0;
  let inTurn = false;
  let prevYaw = samples.count ? Math.atan2(samples.t3z[0], samples.t3x[0]) : 0;
  for (let i = 0; i < samples.count; i++) {
    if (samples.auto[i]) {
      inTurn = false;
      yawAccum = 0;
      prevYaw = Math.atan2(samples.t3z[i], samples.t3x[i]);
      continue;
    }
    maxHeight = Math.max(maxHeight, samples.y[i]);
    // Spuren nur dort zählen, wo die Bahn längs der Bühne läuft (nicht mitten im Spurwechsel)
    if (Math.abs(samples.t3z[i]) < 0.3) laneSet.add(Math.round(samples.z[i]));
    const y = samples.y[i];
    if (y > peak) peak = y;
    maxDrop = Math.max(maxDrop, peak - y);
    const inv = samples.upy[i] < -0.5;
    if (inv && !inverted) loops++;
    inverted = inv;
    // Kurven: Gierwinkel-Änderung entlang der Bahn (nur wo die Bahn einigermaßen waagerecht ist)
    const horiz = Math.hypot(samples.t3x[i], samples.t3z[i]);
    const yaw = Math.atan2(samples.t3z[i], samples.t3x[i]);
    let dy = yaw - prevYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    prevYaw = yaw;
    if (horiz < 0.3) continue;
    const rate = Math.abs(dy) / samples.step;
    if (rate > 0.02) {
      // Richtungswechsel (links ↔ rechts) schließt den laufenden Bogen ab
      if (inTurn && Math.sign(dy) !== Math.sign(yawAccum) && Math.abs(yawAccum) > 1e-6) {
        if (Math.abs(yawAccum) >= Math.PI / 3) turns++;
        yawAccum = 0;
      }
      inTurn = true;
      yawAccum += dy;
    } else if (inTurn) {
      if (Math.abs(yawAccum) >= Math.PI / 3) turns++;
      inTurn = false;
      yawAccum = 0;
    }
  }
  if (inTurn && Math.abs(yawAccum) >= Math.PI / 3) turns++;
  // Schleifen: manuelle Rollwinkel, die eine volle Drehung erreichen
  let rolls = 0;
  for (const nd of path.nodes) if (!Number.isNaN(nd.roll) && Math.abs(nd.roll) >= Math.PI * 1.9) rolls++;
  return { length: samples.length, maxHeight, loops, turns, lanes: laneSet.size, rolls, maxDrop, crossings: findCrossings(samples).length };
}
