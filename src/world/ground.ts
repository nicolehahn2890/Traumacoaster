/**
 * Boden und geschlossener Erdschnitt der Welt (Etappe 1, Schritt 1). Der Boden ist ein Höhenfeld aus dem Terrain des
 * Levels (groundHeight je x und Spur, Spuren fein abgetastet, sodass Hügel je Spur als Terrassen erscheinen wie in der
 * Physik), von einer halben Spur hinter der hintersten bis eine halbe Spur vor der vordersten Spur. An dieser
 * Vorderkante steht der Erdschnitt: eine senkrechte Fläche mit Erdschichten, oben entlang des Bodens, ohne Räume
 * (Paket 2.3: geschlossen, bis der Untergrund freigespielt ist). Beleuchtet wie das Labor (light.ts), unbeschattet bis Schritt 4.
 */
import { BufferGeometry, Float32BufferAttribute, FrontSide, Group, Mesh, ShadowMaterial, type Texture } from 'three';
import { paintedMaterial } from './looks';
import type { Terrain } from '@/physics/terrain';
import { LANE_MAX, LANE_MIN } from '@/track/stage';
import { laneToZ } from './camera';

/** hinterer Rand des Bodens (Spuren) */
export const GROUND_BACK = LANE_MAX + 0.5;
/** Vorderkante des Bodens und Lage des Erdschnitts (Spuren) */
export const GROUND_FRONT = LANE_MIN - 0.5;
/** Boden links und rechts über die Levelbreite hinaus (Meter, wie der Terrain-Renderer der Bühne) */
export const GROUND_MARGIN = 220;
/** Erdschnitt reicht so weit unter die Bodenlinie (Meter): auch weit herausgezoomt (ganze Zone im Bild) endet er nicht sichtbar */
export const EARTH_DEPTH = 200;
/** Abtastung des Höhenfelds */
const X_STEP = 2;
const LANE_STEP = 0.125;
/** Meter je Texturkachel */
const GROUND_TILE = 22;
const STRATA_TILE = 90;

export interface GroundMeshes {
  group: Group;
  ground: Mesh;
  cut: Mesh;
  /** Schattenfänger: zeichnet nur den Schatten, unabhängig von der Lichtstärke (Labor, Richtlinie 5) */
  catcher: Mesh;
  dispose(): void;
}

/** Boden-Höhenfeld und Erdschnitt aus dem Terrain bauen */
export function buildGround(terrain: Terrain, groundTex: Texture, strataTex: Texture): GroundMeshes {
  const x0 = -GROUND_MARGIN;
  const x1 = terrain.width + GROUND_MARGIN;
  const nx = Math.ceil((x1 - x0) / X_STEP) + 1;
  const nz = Math.round((GROUND_BACK - GROUND_FRONT) / LANE_STEP) + 1;

  // Boden: Zeilen von hinten (GROUND_BACK) nach vorn (GROUND_FRONT)
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    const lane = GROUND_BACK - j * LANE_STEP;
    const Z = laneToZ(lane);
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * X_STEP;
      const k = j * nx + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = terrain.groundHeight(x, lane);
      pos[k * 3 + 2] = Z;
      uv[k * 2] = x / GROUND_TILE;
      uv[k * 2 + 1] = Z / GROUND_TILE;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Oberseite nach oben (gegen den Uhrzeigersinn von oben gesehen)
      idx.push(a, c, b, b, c, d);
    }
  }
  const groundGeo = new BufferGeometry();
  groundGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  groundGeo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  groundGeo.setIndex(idx);
  const groundMat = paintedMaterial({ map: groundTex, side: FrontSide });
  const ground = new Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  // Schattenfänger knapp über dem Boden: das schwache Richtungslicht allein ließe den Schatten kaum sehen
  const catcherMat = new ShadowMaterial({ color: 0x0a1a30, opacity: 0.38, transparent: true, depthWrite: false });
  const catcher = new Mesh(groundGeo, catcherMat);
  catcher.position.y = 0.03;
  catcher.receiveShadow = true;
  catcher.renderOrder = 1;

  // Erdschnitt an der Vorderkante: oben der Boden der vordersten Reihe, unten EARTH_DEPTH tiefer
  const Zf = laneToZ(GROUND_FRONT);
  const cpos = new Float32Array(nx * 2 * 3);
  const cuv = new Float32Array(nx * 2 * 2);
  for (let i = 0; i < nx; i++) {
    const x = x0 + i * X_STEP;
    const top = terrain.groundHeight(x, GROUND_FRONT);
    const bottom = -EARTH_DEPTH;
    cpos[i * 6] = x;
    cpos[i * 6 + 1] = top;
    cpos[i * 6 + 2] = Zf;
    cpos[i * 6 + 3] = x;
    cpos[i * 6 + 4] = bottom;
    cpos[i * 6 + 5] = Zf;
    cuv[i * 4] = x / STRATA_TILE;
    cuv[i * 4 + 1] = top / STRATA_TILE;
    cuv[i * 4 + 2] = x / STRATA_TILE;
    cuv[i * 4 + 3] = bottom / STRATA_TILE;
  }
  const cidx: number[] = [];
  for (let i = 0; i < nx - 1; i++) {
    const t0 = i * 2;
    const b0 = t0 + 1;
    const t1 = t0 + 2;
    const b1 = t0 + 3;
    // Vorderseite zum Betrachter
    cidx.push(t0, b0, t1, t1, b0, b1);
  }
  const cutGeo = new BufferGeometry();
  cutGeo.setAttribute('position', new Float32BufferAttribute(cpos, 3));
  cutGeo.setAttribute('uv', new Float32BufferAttribute(cuv, 2));
  cutGeo.setIndex(cidx);
  const cutMat = paintedMaterial({ map: strataTex, side: FrontSide });
  const cut = new Mesh(cutGeo, cutMat);
  cut.receiveShadow = true;

  const group = new Group();
  group.add(ground, catcher, cut);
  return {
    group,
    ground,
    cut,
    catcher,
    dispose() {
      groundGeo.dispose();
      cutGeo.dispose();
      groundMat.dispose();
      cutMat.dispose();
      catcherMat.dispose();
      groundTex.dispose();
      strataTex.dispose();
    },
  };
}
