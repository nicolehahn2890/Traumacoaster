/**
 * Bahn als Profil entlang des Bahnmodells (Etappe 1, Schritt 2; aus dem Tiefen-Labor). `sampleTrack` liefert je
 * 0,25 m Lage, Tangente und Oben-Vektor, `railBanksFor` die Schräglage der Schienen (dieselbe wie in der
 * Bühnendarstellung, damit Wagen und Schienen zusammenpassen). Daraus entsteht je Abtastpunkt ein Rahmen in
 * Welt-Koordinaten: t Fahrtrichtung, n oben (mit Schräglage), s = t × n zur Seite (zeigt zum Betrachter, wenn die
 * Bahn nach rechts fährt). Ein Profil (Punkte in Seite × Oben um die Bahnmitte, Meter; x positiv = Betrachterseite)
 * wird entlang dieser Rahmen gezogen (`sweepGeometry`), wiederholte Teile sitzen als Instanzen (`alongTrack`).
 * Reine Geometrie ohne WebGL: läuft auch im Replay.
 */
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry as Geo, type Material } from 'three';
import type { TrackSamples } from '@/track/model';
import { frameWithBank, stateAt } from '@/track/model';
import { laneToZ } from './camera';

export interface TrackFrame {
  p: Vector3;
  t: Vector3;
  n: Vector3;
  s: Vector3;
  /** Bogenlänge (Meter) */
  arc: number;
}

export interface ProfilePoint {
  x: number;
  y: number;
}

/** Rahmen je Abtastpunkt in Welt-Koordinaten (Z nach vorn, Spuren hinten negativ) */
export function trackFrames(samples: TrackSamples, banks: Float64Array): TrackFrame[] {
  const out: TrackFrame[] = [];
  for (let i = 0; i < samples.count; i++) {
    const st = stateAt(samples, samples.s[i]);
    const fr = frameWithBank(st, banks[i] ?? 0);
    const t = new Vector3(fr.T.x, fr.T.y, -fr.T.z).normalize();
    const n = new Vector3(fr.U.x, fr.U.y, -fr.U.z).normalize();
    const s = new Vector3().crossVectors(t, n).normalize();
    out.push({ p: new Vector3(samples.x[i], samples.y[i], laneToZ(samples.z[i])), t, n, s, arc: samples.s[i] });
  }
  return out;
}

/** Rechteck-Profil (geschlossen) */
export const rect = (x0: number, y0: number, x1: number, y1: number): ProfilePoint[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Ring-Profil (geschlossen) mit k Ecken */
export const ring = (cx: number, cy: number, r: number, k: number): ProfilePoint[] =>
  Array.from({ length: k }, (_, i) => ({ x: cx + Math.cos((i / k) * Math.PI * 2) * r, y: cy + Math.sin((i / k) * Math.PI * 2) * r }));

export interface SweepOptions {
  /** Profil geschlossen (Rohr, Platte) oder offen (Streifen) */
  closed?: boolean;
  /** Meter je Texturdurchlauf entlang der Bahn */
  uScale?: number;
  /** jeder wievielte Rahmen (2 = alle 0,5 m) */
  step?: number;
}

/** Profil entlang der Rahmen ziehen: nicht indizierte Dreiecke, Normalen je Fläche (für Licht und Schatten) */
export function sweepGeometry(frames: TrackFrame[], profile: ProfilePoint[], opts: SweepOptions = {}): BufferGeometry {
  const closed = !!opts.closed;
  const uScale = opts.uScale ?? 3;
  const step = Math.max(1, opts.step ?? 2);
  const segs = closed ? profile.length : profile.length - 1;
  const picks: number[] = [];
  for (let i = 0; i < frames.length; i += step) picks.push(i);
  if (picks[picks.length - 1] !== frames.length - 1) picks.push(frames.length - 1);
  const quads = Math.max(0, picks.length - 1) * segs;
  const pos = new Float32Array(quads * 18);
  const uv = new Float32Array(quads * 12);
  const v = new Vector3();
  let pi = 0;
  let ui = 0;
  const vtx = (f: TrackFrame, k: number): Vector3 => {
    const q = profile[k % profile.length];
    return v.copy(f.p).addScaledVector(f.s, q.x).addScaledVector(f.n, q.y);
  };
  const put = (f: TrackFrame, k: number, u: number, w: number): void => {
    const p = vtx(f, k);
    pos[pi++] = p.x;
    pos[pi++] = p.y;
    pos[pi++] = p.z;
    uv[ui++] = u;
    uv[ui++] = w;
  };
  for (let j = 0; j + 1 < picks.length; j++) {
    const f0 = frames[picks[j]];
    const f1 = frames[picks[j + 1]];
    const u0 = f0.arc / uScale;
    const u1 = f1.arc / uScale;
    for (let k = 0; k < segs; k++) {
      const w0 = k / segs;
      const w1 = (k + 1) / segs;
      put(f0, k, u0, w0);
      put(f1, k, u1, w0);
      put(f1, k + 1, u1, w1);
      put(f0, k, u0, w0);
      put(f1, k + 1, u1, w1);
      put(f0, k + 1, u0, w1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Wiederholtes Teil (Schwelle, Rippe, Strebe) entlang der Bahn als Instanzen: lokal x = Fahrtrichtung, y = oben,
 * z = Seite (Betrachterseite positiv); off versetzt zur Seite (x) und nach oben (y), phase den Start (Meter)
 */
export function alongTrack(frames: TrackFrame[], length: number, geo: Geo, mat: Material, spacing: number, off = { x: 0, y: 0 }, phase = 0): InstancedMesh {
  const n = frames.length;
  const count = Math.max(0, Math.floor(length / spacing));
  const im = new InstancedMesh(geo, mat, count);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const basis = new Matrix4();
  const one = new Vector3(1, 1, 1);
  const p = new Vector3();
  for (let k = 0; k < count; k++) {
    const f = frames[Math.min(n - 1, Math.round(((k * spacing + phase) / length) * (n - 1)))];
    basis.makeBasis(f.t, f.n, f.s);
    q.setFromRotationMatrix(basis);
    p.copy(f.p).addScaledVector(f.s, off.x).addScaledVector(f.n, off.y);
    m4.compose(p, q, one);
    im.setMatrixAt(k, m4);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}
