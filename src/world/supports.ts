/**
 * Stützen des Weltrenderers (Etappe 1, Schritt 3; Richtlinie 3 und 3a, Plan 3.4 Weg C als Grundlage): Der Planer setzt
 * alle SUPPORT_SPACING Meter einen Anschlusspunkt unter (bei der Hängebahn über) die Bahn, sucht darunter die höchste
 * Fundamentfläche (foundations.ts) und lässt Stellen aus, die kopfüber, im Berg, zu niedrig, zu dicht an einer anderen
 * Stütze oder über einem tieferen Bahnstück liegen. Jede Familie (Beton, Rohrpylon, Holzbock, Betonportal) besteht aus
 * wenigen Grundformen (Kasten, Rohr, Kegelstumpf), die als Instanzen gezeichnet werden: eine Familie kostet höchstens
 * fünf Zeichenaufrufe, egal wie viele Stützen (im Labor hatte der Holzbock 469 als Einzelteile). Die Formen sind die
 * ruhigen Varianten des Labors; der „Verrückt“-Regler und die gemalten Teile kommen mit der Stützen-Werkstatt (E4).
 */
import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import type { TrackSamples } from '@/track/model';
import { ATTACH, MAT, SUPPORT_SPACING } from './trackBuilder';
import type { TrackFrame } from './trackMesh';
import { HANG_DROP, type TrackType } from './trackTypes';
import { footBelow, type FootKind, type Foundation } from './foundations';
import { zToLane } from './camera';

export interface SupportPlan3D {
  /** Anschlusspunkt an der Bahn (Welt) */
  A: Vector3;
  /** Fußpunkt auf dem Fundament (Welt) */
  F: Vector3;
  /** Höhe vom Fuß zum Anschluss */
  h: number;
  kind: FootKind;
  /** Hängebahn: Pfeiler abwechselnd hinter (−1) und vor (+1) der Bahn */
  side: 1 | -1;
  seed: number;
}

export interface SupportStats {
  ground: number;
  rock: number;
  element: number;
  cave: number;
  /** nichts Tragendes darunter (Wasser, Leere) */
  floating: number;
  /** Bahn zu dicht über dem Fuß */
  skipped: number;
}

/** Mindesthöhe einer Stütze (Meter) */
export const SUPPORT_MIN_H = 1.3;
/** Draufsicht-Abstand (Meter), unter dem eine Stütze ein anderes Bahnstück durchstieße bzw. zu dicht stünde */
const PIERCE_DIST = 1.8;
const CROWD_DIST = 2.6;

/** Stützen entlang der Bahn planen (deterministisch) */
export function planWorldSupports(samples: TrackSamples, frames: TrackFrame[], type: TrackType, foundations: readonly Foundation[], insideMountain: (x: number, y: number, z: number) => boolean): { plans: SupportPlan3D[]; stats: SupportStats } {
  const plans: SupportPlan3D[] = [];
  const stats: SupportStats = { ground: 0, rock: 0, element: 0, cave: 0, floating: 0, skipped: 0 };
  const n = frames.length;
  const L = samples.length;
  if (n < 2 || L <= 0) return { plans, stats };
  const spacing = SUPPORT_SPACING[type];
  const attach = ATTACH[type];
  const hanging = type === 'hanging';
  let side: 1 | -1 = -1;
  // ein anderes Bahnstück (mindestens 10 m entfernt auf der Bahn) zwischen Fuß und Anschluss: die Stütze ginge hindurch
  const pierces = (i: number, A: Vector3, footY: number): boolean => {
    for (let j = 0; j < n; j += 2) {
      let ds = Math.abs(samples.s[j] - samples.s[i]);
      if (samples.closed) ds = Math.min(ds, L - ds);
      if (ds < 10) continue;
      const yj = frames[j].p.y;
      if (yj >= A.y - 0.5 || yj <= footY + 0.3) continue;
      if (Math.hypot(frames[j].p.x - A.x, frames[j].p.z - A.z) < PIERCE_DIST) return true;
    }
    return false;
  };
  for (let arc = 3; arc < L; arc += spacing) {
    const i = Math.min(n - 1, Math.round((arc / L) * (n - 1)));
    const f = frames[i];
    if (f.n.y < 0.35) continue; // kopfüber oder steil: keine Stütze
    const laneHere = zToLane(f.p.z);
    if (insideMountain(f.p.x, f.p.y, laneHere)) continue; // Tunnel
    const A = f.p.clone().addScaledVector(f.n, attach);
    // Fuß unter der Bahnlinie suchen (nicht unter dem Anschluss: bei niedriger Bahn läge der schon im Boden, und die
    // Stelle zählt dann als zu kurz, nicht als schwebend); Hängebahn: unter der Gondel, der Pfeiler steht neben der Bahn
    const probeZ = hanging ? A.z + 2.4 * side : A.z;
    const probeY = hanging ? f.p.y - HANG_DROP + 0.5 : f.p.y + 0.5;
    const hit = footBelow(foundations, A.x, probeY, zToLane(probeZ));
    if (!hit) {
      stats.floating++;
      continue;
    }
    const F = new Vector3(A.x, hit.y, A.z);
    const h = A.y - F.y;
    if (h < SUPPORT_MIN_H) {
      stats.skipped++;
      continue;
    }
    if (plans.some((p) => Math.hypot(p.F.x - F.x, p.F.z - F.z) < CROWD_DIST)) continue;
    if (pierces(i, A, F.y)) continue;
    stats[hit.kind]++;
    plans.push({ A, F, h, kind: hit.kind, side, seed: i });
    side = side === 1 ? -1 : 1;
  }
  return { plans, stats };
}

// ------------------------------------------------------------------ Grundformen und Instanzen
const UP = new Vector3(0, 1, 0);
/** Einheitskasten (1 × 1 × 1, Mitte im Ursprung) */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
/** Einheitsrohr (Radius 1, Länge 1 entlang y, Mitte im Ursprung) */
const UNIT_TUBE = new CylinderGeometry(1, 1, 1, 8);
/** Scheibe (Radius 1, Dicke 1 entlang z): Fenster der Betonpfeiler */
const UNIT_DISC = new CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
/** Kegelstumpf-Kasten: unten 1 breit, oben 0,6 breit, Fuß bei y = 0, Höhe 1, Tiefe 1 */
const UNIT_TAPER = (() => {
  const g = new BoxGeometry(1, 1, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 0.6);
    pos.setY(i, pos.getY(i) + 0.5);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
})();

class Batch {
  readonly items: Matrix4[] = [];
  constructor(readonly geo: BufferGeometry, readonly mat: Material) {}
  mesh(): InstancedMesh | null {
    if (!this.items.length) return null;
    const im = new InstancedMesh(this.geo, this.mat, this.items.length);
    for (let i = 0; i < this.items.length; i++) im.setMatrixAt(i, this.items[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }
}

/** Teile einer Stütze in ihrem lokalen Raum (Fuß im Ursprung, y nach oben, x entlang der Bühne, z zum Betrachter) */
class Parts {
  constructor(private readonly base: Matrix4) {}
  private place(batch: Batch, pos: Vector3, q: Quaternion, scale: Vector3): void {
    const m = new Matrix4().compose(pos, q, scale);
    batch.items.push(m.premultiply(this.base));
  }
  block(batch: Batch, w: number, h: number, d: number, x: number, y: number, z: number): void {
    this.place(batch, new Vector3(x, y, z), new Quaternion(), new Vector3(w, h, d));
  }
  /** Stab von a nach b: Kasten (thick × len × depth) oder Rohr (Radius thick) */
  bar(batch: Batch, a: Vector3, b: Vector3, thick: number, depth = thick): void {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-6) return;
    const q = new Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    this.place(batch, a.clone().addScaledVector(d, 0.5), q, new Vector3(thick, len, depth));
  }
  /** Kegelstumpf mit Fuß bei (x, y, z): unten bottomW breit, oben 0,6 · bottomW, Höhe h */
  taper(batch: Batch, bottomW: number, h: number, depth: number, x: number, y: number, z: number): void {
    this.place(batch, new Vector3(x, y, z), new Quaternion(), new Vector3(bottomW, h, depth));
  }
  disc(batch: Batch, r: number, thick: number, x: number, y: number, z: number): void {
    this.place(batch, new Vector3(x, y, z), new Quaternion(), new Vector3(r, r, thick));
  }
}

/** Straße: brutalistischer Betonpfeiler, konisch, ab 7 m mit rundem Fenster, Kapitell und Fundamentplatte */
function concrete(p: Parts, h: number, b: { taper: Batch; box: Batch; disc: Batch }): void {
  const w = 1.3 + Math.min(1.3, h * 0.07);
  p.taper(b.taper, 1.7 * w, h, 1.4, 0, 0, 0);
  if (h > 7) p.disc(b.disc, Math.min(w * 0.42, h * 0.18), 1.5, 0, h * 0.45, 0); // Fenster (dunkle Scheibe)
  p.block(b.box, w * 1.4 + 0.4, 0.45, 1.9, 0, h - 0.2, 0); // Kapitell
  p.block(b.box, w * 1.7, 0.4, 1.8, 0, 0.1, 0); // Fundamentplatte
}

/** Holz: Bock aus zwei oder drei schrägen Pfosten mit Riegeln, Diagonalen, Laschen und Steinfüßen */
function wood(p: Parts, h: number, b: { tube: Batch; dark: Batch; light: Batch; iron: Batch; stone: Batch }): void {
  const spread = Math.min(3.4, 0.7 + h * 0.16);
  const posts = h > 9 ? 3 : 2;
  const feet = posts === 3 ? [-spread, 0, spread] : [-spread, spread];
  const heads = posts === 3 ? [-0.8, 0, 0.8] : [-0.8, 0.8];
  for (let i = 0; i < posts; i++) {
    p.bar(b.tube, new Vector3(feet[i], 0, 0), new Vector3(heads[i], h, 0), 0.19);
    p.block(b.stone, 0.75, 0.45, 0.85, feet[i], 0.12, 0);
  }
  p.block(b.dark, 2.4, 0.3, 2.5, 0, h - 0.15, 0); // Kappe unter den Schwellen
  const levels = Math.max(1, Math.floor(h / 3.6));
  for (let l = 1; l <= levels; l++) {
    const y = (h * l) / (levels + 1);
    const k = y / h;
    const x0 = -spread * (1 - k) - 0.8 * k;
    const x1 = spread * (1 - k) + 0.8 * k;
    if (x1 - x0 <= 0.8) continue;
    p.bar(b.dark, new Vector3(x0, y, 0), new Vector3(x1, y, 0), 0.14, 0.18); // Riegel
    p.bar(b.light, new Vector3(x0, y, 0.12), new Vector3(x1 * 0.9, Math.min(h - 0.4, y + 3.0), 0.12), 0.1); // Diagonale
    p.block(b.iron, 0.42, 0.42, 0.1, x0, y, 0.2);
    p.block(b.iron, 0.42, 0.42, 0.1, x1, y, 0.2);
  }
  p.block(b.iron, 0.5, 0.5, 0.12, -0.8, h - 0.3, 0.22);
  p.block(b.iron, 0.5, 0.5, 0.12, 0.8, h - 0.3, 0.22);
}

/** Stahl: schlanker Rohrpylon mit Gabel, ab 10 m als A-Bock mit Querriegel */
function steel(p: Parts, h: number, b: { tube: Batch; box: Batch; plate: Batch; light: Batch }): void {
  if (h < 10) {
    const head = new Vector3(0, h - 1.0, 0);
    p.bar(b.tube, new Vector3(0, 0, 0), head, 0.3);
    for (const x of [-0.6, 0.6]) p.bar(b.box, head, new Vector3(x, h, 0), 0.16);
  } else {
    const sp = 0.8 + h * 0.11;
    for (const s of [-1, 1]) {
      p.bar(b.tube, new Vector3(s * sp, 0, 0), new Vector3(s * 0.55, h, 0), 0.26);
      p.block(b.plate, 1.1, 0.3, 1.1, s * sp, 0.1, 0);
    }
    p.bar(b.light, new Vector3(-sp * 0.55, h * 0.45, 0), new Vector3(sp * 0.55, h * 0.45, 0), 0.14);
  }
  p.block(b.plate, 1.3, 0.3, 1.3, 0, 0.1, 0);
}

/** Hängebahn: Betonpfeiler neben der Bahn, dessen Arm über den Tragbalken greift */
function gantry(p: Parts, h: number, side: number, b: { taper: Batch; arm: Batch; plate: Batch }): void {
  const back = 2.4 * side;
  const top = h + 2.2;
  p.taper(b.taper, 2.0, top, 1.3, 0, 0, back);
  const knee = new Vector3(0, top + 0.9, back * 0.45);
  p.bar(b.arm, new Vector3(0, top - 0.4, back), knee, 0.55);
  p.bar(b.arm, knee, new Vector3(0, h + 0.1, 0), 0.55);
  p.block(b.plate, 2.2, 0.4, 2.2, 0, 0.1, back);
}

/** Stützen einer Bahn als Gruppe aus Instanzen (eine Familie je Bahntyp) */
export function buildWorldSupports(plans: SupportPlan3D[], type: TrackType): Group {
  const g = new Group();
  g.name = `supports-${type}`;
  const batches: Batch[] = [];
  const batch = (geo: BufferGeometry, mat: Material): Batch => {
    const b = new Batch(geo, mat);
    batches.push(b);
    return b;
  };
  const fam =
    type === 'road'
      ? { taper: batch(UNIT_TAPER, MAT.concrete), box: batch(UNIT_BOX, MAT.concreteDark), disc: batch(UNIT_DISC, MAT.ink) }
      : type === 'wood'
        ? { tube: batch(UNIT_TUBE, MAT.wood), dark: batch(UNIT_BOX, MAT.woodDark), light: batch(UNIT_BOX, MAT.wood), iron: batch(UNIT_BOX, MAT.iron), stone: batch(UNIT_BOX, MAT.stone) }
        : type === 'hanging'
          ? { taper: batch(UNIT_TAPER, MAT.concrete), arm: batch(UNIT_TUBE, MAT.concrete), plate: batch(UNIT_BOX, MAT.concreteDark) }
          : { tube: batch(UNIT_TUBE, MAT.steelBlue), box: batch(UNIT_BOX, MAT.steelBlue), plate: batch(UNIT_BOX, MAT.concreteDark), light: batch(UNIT_BOX, MAT.steelLight) };
  for (const plan of plans) {
    // Fuß im Ursprung, zum Anschluss gekippt (wie alignY im Labor); x bleibt entlang der Bühne
    const d = plan.A.clone().sub(plan.F);
    const q = new Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const base = new Matrix4().compose(plan.F, q, new Vector3(1, 1, 1));
    const p = new Parts(base);
    if (type === 'road') concrete(p, plan.h, fam as { taper: Batch; box: Batch; disc: Batch });
    else if (type === 'wood') wood(p, plan.h, fam as { tube: Batch; dark: Batch; light: Batch; iron: Batch; stone: Batch });
    else if (type === 'hanging') gantry(p, plan.h, plan.side, fam as { taper: Batch; arm: Batch; plate: Batch });
    else steel(p, plan.h, fam as { tube: Batch; box: Batch; plate: Batch; light: Batch });
  }
  for (const b of batches) {
    const m = b.mesh();
    if (m) g.add(m);
  }
  return g;
}

/** Instanz-Meshes einer Stützengruppe freigeben (Grundformen und Materialien bleiben geteilt) */
export function disposeSupports(g: Group): void {
  g.traverse((o) => {
    const im = o as InstancedMesh;
    if (im.isInstancedMesh) im.dispose();
  });
}
