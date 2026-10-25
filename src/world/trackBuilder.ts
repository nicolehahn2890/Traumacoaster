/**
 * Die Bahnprofile der vier Typen (Richtlinie 3a, Tiefen-Labor) als Meshes entlang der Rahmen des Bahnmodells.
 * Straße: Betonplatte, Asphalt, helle Ränder, Mittelstreifen, Brüstung hinten. Stahl: zwei cremefarbene Rohre, blaues
 * Rückgrat, orange Schwellen, Streben. Holz: Schichtholzstapel unter Flachstahl-Schienen, Schwellen, Laschen, Handlauf
 * hinten mit Pfosten. Hängebahn: Tragbalken mit Rippen auf der Bahnlinie (dem Strich), die Gondeln hängen HANG_DROP
 * darunter (train.ts). Farben sind Platzhalter aus dem Labor; Umfärben per Shader kommt mit den Looks (Schritt 4).
 * Materialien werden geteilt und nie freigegeben, Geometrien je Bahn.
 */
import { BoxGeometry, CanvasTexture, ClampToEdgeWrapping, DoubleSide, Group, Mesh, RepeatWrapping, SRGBColorSpace, type MeshLambertMaterial } from 'three';
import { paintedMaterial } from './looks';
import { alongTrack, rect, ring, sweepGeometry, type TrackFrame } from './trackMesh';
import type { TrackType } from './trackTypes';

const lam = (color: number): MeshLambertMaterial => paintedMaterial({ color, side: DoubleSide });

/** Platzhalter-Farben wie im Labor */
export const MAT = {
  asphalt: lam(0x3a3f4a),
  concrete: lam(0xddd5c3),
  concreteDark: lam(0xb8ae9c),
  cream: lam(0xf5e6b8),
  ink: lam(0x1e2a3a),
  steelBlue: lam(0x2f4f72),
  steelLight: lam(0x4f7aa8),
  orange: lam(0xe8703a),
  wood: lam(0xcf9a44),
  woodDark: lam(0x8a5f2a),
  iron: lam(0x34414f),
  stone: lam(0xcfc6b2),
};

let dashMat: MeshLambertMaterial | null = null;
/** gestrichelte Mittellinie der Straße (Kachel entlang der Bahn); ohne Zeichenfläche (Replay) einfarbig */
function dashMaterial(): MeshLambertMaterial {
  if (dashMat) return dashMat;
  if (typeof document === 'undefined') return (dashMat = MAT.cream);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 16);
  g.fillStyle = '#fff6dc';
  g.fillRect(0, 2, 128, 12);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  return (dashMat = paintedMaterial({ map: t, transparent: true, side: DoubleSide, depthWrite: false }));
}

/** Anschlusshöhe der Stützen relativ zur Bahnmitte je Typ (Meter): unter der Bahn, bei der Hängebahn über dem Balken */
export const ATTACH: Record<TrackType, number> = { road: -0.58, steel: -0.92, wood: -0.66, hanging: 0.58 };
/** Abstand der Stützen entlang der Bahn je Typ (Meter) */
export const SUPPORT_SPACING: Record<TrackType, number> = { road: 9, steel: 7, wood: 5.4, hanging: 10 };

function sweep(g: Group, frames: TrackFrame[], profile: ReturnType<typeof rect>, mat: MeshLambertMaterial, opts: { closed?: boolean; uScale?: number } = {}): void {
  const m = new Mesh(sweepGeometry(frames, profile, opts), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
}

function buildRoad(g: Group, frames: TrackFrame[]): void {
  const W = 1.7;
  const D = 0.55;
  sweep(g, frames, rect(-W, -D, W, 0), MAT.concrete, { closed: true, uScale: 4 }); // Betonplatte
  sweep(g, frames, [{ x: -1.45, y: 0.03 }, { x: 1.45, y: 0.03 }], MAT.asphalt, { uScale: 4 }); // Asphalt
  sweep(g, frames, [{ x: -W, y: 0.035 }, { x: -1.45, y: 0.035 }], MAT.cream); // helle Ränder
  sweep(g, frames, [{ x: 1.45, y: 0.035 }, { x: W, y: 0.035 }], MAT.cream);
  sweep(g, frames, [{ x: -0.13, y: 0.05 }, { x: 0.13, y: 0.05 }], dashMaterial(), { uScale: 6 }); // Mittelstreifen
  sweep(g, frames, rect(-W, 0.03, -W + 0.16, 0.3), MAT.concreteDark, { closed: true }); // Brüstung hinten
}

function buildSteel(g: Group, frames: TrackFrame[], length: number): void {
  for (const x of [-0.55, 0.55]) sweep(g, frames, ring(x, 0, 0.24, 7), MAT.cream, { closed: true }); // Rohre
  sweep(g, frames, ring(0, -0.64, 0.27, 7), MAT.steelBlue, { closed: true }); // Rückgrat
  g.add(alongTrack(frames, length, new BoxGeometry(0.34, 0.12, 1.5), MAT.orange, 1.1, { x: 0, y: -0.06 })); // Schwellen
  // Streben zum Rückgrat, abwechselnd nach vorn und hinten
  g.add(alongTrack(frames, length, new BoxGeometry(0.1, 0.68, 0.1).rotateX(0.62).translate(0, -0.34, 0.2), MAT.steelLight, 2.2, { x: 0, y: -0.02 }));
  g.add(alongTrack(frames, length, new BoxGeometry(0.1, 0.68, 0.1).rotateX(-0.62).translate(0, -0.34, -0.2), MAT.steelLight, 2.2, { x: 0, y: -0.02 }, 1.1));
}

function buildWood(g: Group, frames: TrackFrame[], length: number): void {
  for (const x of [-0.55, 0.55]) {
    sweep(g, frames, rect(x - 0.2, -0.64, x + 0.2, -0.02), MAT.wood, { closed: true, uScale: 2 }); // Schichtholzstapel
    sweep(g, frames, ring(x, 0.06, 0.09, 6), MAT.cream, { closed: true }); // Flachstahl-Schiene
  }
  g.add(alongTrack(frames, length, new BoxGeometry(0.28, 0.14, 2.3), MAT.woodDark, 1.0, { x: 0, y: -0.1 })); // Schwellen
  g.add(alongTrack(frames, length, new BoxGeometry(0.5, 0.1, 0.12), MAT.iron, 3.0, { x: -0.8, y: -0.34 })); // Laschen
  sweep(g, frames, rect(-1.25, 0.55, -1.13, 0.67), MAT.wood, { closed: true }); // Handlauf hinten
  g.add(alongTrack(frames, length, new BoxGeometry(0.1, 1.2, 0.1), MAT.wood, 2.0, { x: -1.19, y: 0.0 })); // Geländerpfosten
}

function buildHanging(g: Group, frames: TrackFrame[], length: number): void {
  sweep(g, frames, rect(-0.32, 0, 0.32, 0.56), MAT.steelBlue, { closed: true, uScale: 3 }); // Tragbalken auf dem Strich
  sweep(g, frames, [{ x: -0.36, y: 0.57 }, { x: 0.36, y: 0.57 }], MAT.cream); // helle Oberkante
  g.add(alongTrack(frames, length, new BoxGeometry(0.12, 0.72, 0.92), MAT.ink, 2.0, { x: 0, y: 0.28 })); // Rippen
}

/** Bahn eines Typs als Gruppe (Schienen, Schwellen, Streben) */
export function buildTrack(frames: TrackFrame[], length: number, type: TrackType): Group {
  const g = new Group();
  g.name = `track-${type}`;
  if (frames.length < 2) return g;
  switch (type) {
    case 'road':
      buildRoad(g, frames);
      break;
    case 'wood':
      buildWood(g, frames, length);
      break;
    case 'hanging':
      buildHanging(g, frames, length);
      break;
    default:
      buildSteel(g, frames, length);
  }
  return g;
}

/** Geometrien einer Bahn freigeben (Materialien sind geteilt) */
export function disposeTrack(g: Group): void {
  g.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
