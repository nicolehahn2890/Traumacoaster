/**
 * Startarten sichtbar (Etappe 2, Schritt 2; Plan 3.5, Richtlinie 3): Platzhalter in den Maßen der Physik, gebaut entlang
 * der Rahmen der Bahn wie das Profil. Kettenzug: Kettenglieder als Instanzen von der Station bis zum Kettenende (dieselbe
 * Suche wie die Fahrt, `liftRange`), Zahnräder an beiden Enden. Launch: farbiges Band mit Lichtern auf den ersten
 * LAUNCH_LENGTH Metern. Hydro: breiteres Band in Wasserfarbe mit Dampf-Marke am Ende. Pendel: Puffer beidseits des
 * Vorgabestücks. Vertikallift: Kette und ein Turm mit Plattform am Kettenende. Alles Platzhalter (Formen, Farben), bis die
 * gemalten Teile kommen; höchstens drei Zeichenaufrufe je Startart. Reine Geometrie ohne WebGL (testbar in Node).
 */
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, Quaternion, SphereGeometry, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StartType } from '@/track/model';
import { LAUNCH_LENGTH } from '@/physics/trainSim';
import { paintedMaterial } from './looks';
import { rect, sweepGeometry, type TrackFrame } from './trackMesh';
import type { TrackType } from './trackTypes';

export interface StartContext {
  type: StartType;
  trackType: TrackType;
  /** Kettenzug: Bogenlänge von … bis (null ohne Anstieg nahe der Station) */
  lift: { start: number; end: number } | null;
  /** Länge des Vorgabestücks der Station (die Puffer des Pendels stehen an seinen Enden) */
  stationLength: number;
  /** Bodenhöhe unter der Station (der Turm des Vertikallifts steht darauf) */
  groundY: number;
}

export interface BuiltStart {
  group: Group;
  dispose(): void;
}

/** Abstand der Kettenglieder (Meter) */
export const CHAIN_LINK_SPACING = 0.5;
/** Abstand der Launch-Lichter (Meter) */
export const LAUNCH_LIGHT_SPACING = 2;
/** Höhe der Kette über der Bahnlinie je Typ (Straße auf der Platte, Stahl und Holz zwischen den Schienen, Hängebahn auf dem Balken) */
export const CHAIN_LIFT: Record<TrackType, number> = { road: 0.1, steel: 0.12, wood: 0.14, hanging: 0.5 };

const CHAIN = paintedMaterial({ color: new Color('#3b3f4a') });
const LAUNCH = paintedMaterial({ color: new Color('#ffb13b'), side: DoubleSide });
const HYDRO = paintedMaterial({ color: new Color('#3ec7c2'), side: DoubleSide });
const LIGHT = paintedMaterial({ color: new Color('#fff6c8'), emissive: new Color('#ffd23f'), emissiveIntensity: 0.8 });
const STEAM = paintedMaterial({ color: new Color('#ffffff'), transparent: true, opacity: 0.45, depthWrite: false });
/** verschmolzene Teile mit Farbe je Ecke (ein Zeichenaufruf) */
const SOLID = paintedMaterial({ vertexColors: true, side: DoubleSide });
const INK = new Color('#1e2a3a');
const YELLOW = new Color('#ffd23f');
const CONCRETE = new Color('#ddd5c3');
const STEEL = new Color('#6f7a8a');
const BRASS = new Color('#c9a24a');

/** erster Rahmen ab der Bogenlänge arc (Rahmen sind nach arc sortiert) */
function frameAt(frames: TrackFrame[], arc: number): TrackFrame {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].arc < arc) lo = mid + 1;
    else hi = mid;
  }
  return frames[lo];
}

/** Geometrie (lokal: x Fahrtrichtung, y oben, z Seite zum Betrachter) an einen Rahmen setzen, mit Versatz entlang, nach oben und zur Seite */
function placed(geo: BufferGeometry, f: TrackFrame, off: { along?: number; up?: number; side?: number } = {}): BufferGeometry {
  const m = new Matrix4().makeBasis(f.t, f.n, f.s);
  const pos = f.p.clone().addScaledVector(f.t, off.along ?? 0).addScaledVector(f.n, off.up ?? 0).addScaledVector(f.s, off.side ?? 0);
  m.setPosition(pos);
  geo.applyMatrix4(m);
  return geo;
}

/** Teil als Instanzen alle `spacing` Meter Bogenlänge zwischen from und to, je Rahmen an mehreren Versätzen (Seite x, oben y) */
function alongArc(frames: TrackFrame[], from: number, to: number, spacing: number, geo: BufferGeometry, mat: Material, offsets: Array<{ x: number; y: number }>): InstancedMesh | null {
  const slots: TrackFrame[] = [];
  let next = from;
  for (const f of frames) {
    if (f.arc < next) continue;
    if (f.arc > to + 1e-6) break;
    slots.push(f);
    next = f.arc + spacing;
  }
  if (!slots.length) return null;
  const im = new InstancedMesh(geo, mat, slots.length * offsets.length);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const basis = new Matrix4();
  const one = new Vector3(1, 1, 1);
  const p = new Vector3();
  let k = 0;
  for (const f of slots) {
    basis.makeBasis(f.t, f.n, f.s);
    q.setFromRotationMatrix(basis);
    for (const o of offsets) {
      p.copy(f.p).addScaledVector(f.s, o.x).addScaledVector(f.n, o.y);
      m4.compose(p, q, one);
      im.setMatrixAt(k++, m4);
    }
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true;
  return im;
}

/** sammelt Teile mit Farbe und verschmilzt sie zu einem Mesh */
class Parts {
  private readonly geos: BufferGeometry[] = [];
  add(geo: BufferGeometry, color: Color): void {
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.geos.push(geo);
  }
  get empty(): boolean {
    return this.geos.length === 0;
  }
  mesh(): Mesh {
    const merged = mergeGeometries(this.geos, false)!;
    for (const g of this.geos) g.dispose();
    const m = new Mesh(merged, SOLID);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/**
 * Platzhalter der Startart für eine Bahn; die Gruppe heißt „start“ und kann leer sein (Kettenzug ohne Anstieg). Geometrien
 * gehören der Gruppe, Materialien sind geteilt.
 */
export function buildStartPlaceholder(frames: TrackFrame[], ctx: StartContext): BuiltStart {
  const g = new Group();
  g.name = 'start';
  const owned: BufferGeometry[] = [];
  const dispose = (): void => {
    for (const geo of owned) geo.dispose();
    g.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry && !owned.includes(m.geometry)) m.geometry.dispose();
    });
  };
  if (frames.length < 2) return { group: g, dispose };
  const top = CHAIN_LIFT[ctx.trackType];
  const last = frames[frames.length - 1].arc;

  const chain = (): void => {
    const lift = ctx.lift;
    if (!lift || lift.end - lift.start < 1) return;
    const link = new BoxGeometry(0.34, 0.09, 0.16);
    owned.push(link);
    const links = alongArc(frames, lift.start, Math.min(lift.end, last), CHAIN_LINK_SPACING, link, CHAIN, [{ x: 0, y: top }]);
    if (links) {
      links.name = 'chain';
      g.add(links);
    }
    // Zahnräder an beiden Enden der Kette (Achse quer zur Bahn)
    const gears = new Parts();
    for (const arc of [lift.start, Math.min(lift.end, last)]) {
      const f = frameAt(frames, arc);
      gears.add(placed(new CylinderGeometry(0.42, 0.42, 0.12, 12).rotateX(Math.PI / 2), f, { up: top - 0.1 }), BRASS);
      gears.add(placed(new CylinderGeometry(0.12, 0.12, 0.3, 8).rotateX(Math.PI / 2), f, { up: top - 0.1 }), INK);
    }
    const m = gears.mesh();
    m.name = 'gears';
    g.add(m);
  };

  switch (ctx.type) {
    case 'chainlift':
      chain();
      break;
    case 'launch':
    case 'hydro': {
      const end = Math.min(last, LAUNCH_LENGTH);
      const sub = frames.filter((f) => f.arc <= end + 1e-6);
      if (sub.length < 2) break;
      const w = ctx.type === 'hydro' ? 1.0 : 0.75;
      const band = sweepGeometry(sub, rect(-w, top, w, top + 0.07), { closed: true, step: 2, uScale: 2 });
      owned.push(band);
      const mesh = new Mesh(band, ctx.type === 'hydro' ? HYDRO : LAUNCH);
      mesh.name = 'band';
      mesh.castShadow = true;
      g.add(mesh);
      const bulb = new SphereGeometry(0.13, 8, 6);
      owned.push(bulb);
      const lights = alongArc(sub, 1, end, LAUNCH_LIGHT_SPACING, bulb, LIGHT, [{ x: -w - 0.12, y: top + 0.16 }, { x: w + 0.12, y: top + 0.16 }]);
      if (lights) {
        lights.name = 'lights';
        g.add(lights);
      }
      if (ctx.type === 'hydro') {
        // Dampf-Marke: vier durchscheinende Kugeln, die zum Bandende hin größer werden und aufsteigen
        const puffs: BufferGeometry[] = [];
        for (let i = 0; i < 4; i++) puffs.push(placed(new SphereGeometry(0.45 + i * 0.18, 10, 8), frameAt(sub, Math.max(0, end - 6 + i * 1.6)), { up: top + 1.0 + i * 0.7 }));
        const steam = mergeGeometries(puffs, false)!;
        for (const p of puffs) p.dispose();
        owned.push(steam);
        const sm = new Mesh(steam, STEAM);
        sm.name = 'steam';
        g.add(sm);
      }
      break;
    }
    case 'swing': {
      // Pendel: Puffer vor dem Anfang und hinter dem Ende des Vorgabestücks (Block quer zur Bahn mit gelber Prallplatte)
      const parts = new Parts();
      const ends: Array<[TrackFrame, number]> = [
        [frames[0], -1],
        [frameAt(frames, Math.min(last, ctx.stationLength)), 1],
      ];
      for (const [f, dir] of ends) {
        parts.add(placed(new BoxGeometry(0.8, 1.6, 2.4), f, { along: dir * 1.6, up: top + 0.8 }), CONCRETE);
        parts.add(placed(new BoxGeometry(0.3, 0.6, 2.4), f, { along: dir * 1.05, up: top + 0.8 }), YELLOW);
        parts.add(placed(new BoxGeometry(0.3, 0.12, 2.4), f, { along: dir * 1.05, up: top + 0.8 }), INK);
      }
      const m = parts.mesh();
      m.name = 'buffers';
      g.add(m);
      break;
    }
    case 'verticalLift': {
      // Aufzug (Schritt 3b): Gerüst aus vier Pfosten um das senkrechte Stück des Vorgabestücks, Riegel auf der
      // Betrachterseite, Maschinenhaus über dem oberen Ende; die Fahrt hebt den Zug auf der Bahn selbst hoch
      const lift = ctx.lift;
      if (!lift) break;
      const f = frameAt(frames, Math.min(lift.end, last));
      const x = f.p.x;
      const z = f.p.z;
      const y0 = ctx.groundY;
      const y1 = f.p.y + 3.2;
      const parts = new Parts();
      for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) parts.add(new BoxGeometry(0.3, y1 - y0, 0.3).translate(x + dx, (y0 + y1) / 2, z + dz), STEEL);
      for (let y = y0 + 2.5; y < y1 - 0.5; y += 3) parts.add(new BoxGeometry(2.9, 0.18, 0.18).translate(x, y, z + 1.3), INK);
      parts.add(new BoxGeometry(3.4, 1.2, 3.4).translate(x, y1 + 0.6, z), CONCRETE);
      parts.add(new BoxGeometry(3.6, 0.2, 3.6).translate(x, y1 + 1.3, z), YELLOW);
      const m = parts.mesh();
      m.name = 'tower';
      g.add(m);
      break;
    }
  }
  return { group: g, dispose };
}
