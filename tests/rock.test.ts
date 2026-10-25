import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, type StagePoint } from '@/track/stage';
import { planBrushTrack, previewBrushTrack, swapCrossing } from '@/track/brushTrack';
import { sampleTrack } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { TrainSim, type TrainSimOptions } from '@/physics/trainSim';
import { FreeField, WALL_HALF } from '@/zone/field';
import type { ZoneElement } from '@/zone/types';

/** Dreiteiler wie in der Prüfzone: 24 × 14 m, 7,5 m dick auf Spur 1, Fenster bei 4 m Höhe */
const slab: ZoneElement = { id: 'e1', kind: 'threePart', x: 85, y: 0, z: 1, w: 24, h: 14, d: 7.5, openings: [{ dx: 0, dy: 4, r: 2.4 }] };
const column: ZoneElement = { id: 'e2', kind: 'column', x: 50, y: 0, z: 0, w: 2, h: 10 };

const toWorld = (p: StagePoint, lane: number) => rayToWorld(p, lane);
/** flache Linie auf fester Bildhöhe Y (der Pinsel legt sie auf Komforthöhe 4 m und wählt die Tiefe dazu: Spur = (Y − 4) / 4,2) */
const flatLine = (Y: number, x0: number, x1: number): StagePoint[] => {
  const out: StagePoint[] = [];
  for (let x = x0; x <= x1; x += 2) out.push({ X: x, Y });
  return out;
};
const half = 7.5 / 2 / LANE_DEPTH;
/** Spuren: vorn klein. Die Lippe liegt vor der Spur 1 des Dreiteilers, die Rückwand dahinter */
const lip = 1 - half;
const back = 1 + half;

/** Pinsel-Optionen mit dem Freiraumfeld (flache Erde bei 0) */
const fieldOpts = (field: FreeField) => ({ field: { free: (p: StagePoint) => field.freeLanes(p, toWorld, 0.8), solid: (x: number, y: number, lane: number) => field.solid(x, y, lane), floor: (x: number, y: number, lane: number) => field.floorBelow(x, y, lane, 40)?.y ?? null } });
/** Dreiteiler mit Ein- und Ausfahrt: zwei Fenster in der Lippe */
const tunnel: ZoneElement = { ...slab, openings: [{ dx: -6, dy: 4, r: 2.4 }, { dx: 6, dy: 4, r: 2.4 }] };
const at = (plan: { line: StagePoint[] }, x: number) => plan.line.findIndex((p) => Math.abs(p.X - x) < 1.5);
/** in der Wand selbst (den weichen Abstand davor hält FIELD_GAP, die harte Schranke liegt knapp vor der Wand) */
const inWall = (lane: number, face: number) => lane > face - WALL_HALF + 1e-3 && lane < face + WALL_HALF - 1e-3;
const maxStep = (plan: { z: Float64Array; line: StagePoint[] }, x0: number, x1: number) => {
  let m = 0;
  for (let i = 1; i < plan.z.length; i++) if (plan.line[i].X >= x0 && plan.line[i].X <= x1) m = Math.max(m, Math.abs(plan.z[i] - plan.z[i - 1]) / LANE_DEPTH);
  return m;
};

describe('Pinsel im Freiraumfeld (Tor 2b, Plan Paket 5)', () => {
  it('ein Strich an der Lippe zieht es in den Innenraum (Magnet an der offenen Flanke), nie in eine Wand; weit davor bleibt er davor', () => {
    const field = new FreeField([slab], 0, () => 0);
    const opts = fieldOpts(field);
    // ohne Feld landet die Linie mit Bildhöhe 4 + 4,2 · 0,55 genau in der Lippe (Spur 0,55 vor der Spur 1 des Dreiteilers)
    const Y = 4 + 4.2 * 0.55;
    const free = planBrushTrack(flatLine(Y, 30, 140))!;
    expect(inWall(free.z[at(free, 78)] / LANE_DEPTH, lip)).toBe(true);
    // mit Feld: der Innenraum liegt in Reichweite des Magneten, die Bahn fährt durch den Berg, glatt und nie in einer Wand
    const plan = planBrushTrack(flatLine(Y, 30, 140), opts)!;
    expect(plan.rock).toEqual([]);
    expect(plan.rockCut).toBe(false);
    plan.line.forEach((p, i) => {
      if (Math.abs(p.X - 85) > 11) return;
      expect(inWall(plan.z[i] / LANE_DEPTH, lip)).toBe(false);
      expect(inWall(plan.z[i] / LANE_DEPTH, back)).toBe(false);
    });
    expect(Math.abs(plan.z[at(plan, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    expect(maxStep(plan, 55, 115)).toBeLessThan(0.12);
    // Bildhöhe 4,8 (Spur 0,2 in Komforthöhe): zu weit vor der Lippe für den Magneten, die Bahn bleibt davor
    const front = planBrushTrack(flatLine(4 + 4.2 * 0.2, 30, 140), opts)!;
    expect(front.rock).toEqual([]);
    front.line.forEach((p, i) => {
      if (Math.abs(p.X - 85) > 11) return;
      expect(front.z[i] / LANE_DEPTH).toBeLessThan(lip - WALL_HALF);
    });
    expect(maxStep(front, 55, 115)).toBeLessThan(0.12);
    // Bildhöhe 10,5: die erste Lösung liegt in der Rückwand, der Innenraum ist näher als dahinter: hindurch
    const over = planBrushTrack(flatLine(10.5, 30, 140), opts)!;
    expect(over.rock).toEqual([]);
    expect(Math.abs(over.z[at(over, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    expect(maxStep(over, 55, 115)).toBeLessThan(0.12);
  });

  it('mit Ein- und Ausfahrt führt der Strich an der Lippe durch den Berg: davor vor der Lippe, dazwischen im Innenraum, ohne Knick', () => {
    const opts = fieldOpts(new FreeField([tunnel], 0, () => 0));
    // die Linie beginnt bei x 0, damit die Station (ruhige Tiefe über die ersten 32 m) den Vergleich bei x 45 nicht stört
    const plan = planBrushTrack(flatLine(4 + 4.2 * 0.55, 0, 140), opts)!;
    expect(plan.rock).toEqual([]);
    expect(plan.rockCut).toBe(false);
    // weit vor dem Berg die Lesung (Spur 0,55), die Einfahrt in den Innenraum beginnt weich schon davor
    expect(Math.abs(plan.z[at(plan, 45)] / LANE_DEPTH - 0.55)).toBeLessThan(0.15);
    expect(Math.abs(plan.z[at(plan, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    plan.line.forEach((p, i) => {
      if (Math.abs(p.X - 85) > 11 || Math.abs(p.X - 79) < 3.5 || Math.abs(p.X - 91) < 3.5) return;
      expect(inWall(plan.z[i] / LANE_DEPTH, lip)).toBe(false);
      expect(inWall(plan.z[i] / LANE_DEPTH, back)).toBe(false);
    });
    expect(maxStep(plan, 60, 110)).toBeLessThan(0.12);
  });

  it('ohne freie Tiefe ist der Strich blockiert: Vorschau markiert rot, beim Loslassen endet die Bahn davor', () => {
    // eine hohe Säule über alle Spuren: nirgends vorbei
    const wall: ZoneElement = { ...column, x: 85, w: 60, h: 40 };
    const opts = fieldOpts(new FreeField([wall], 0, () => 0));
    const pv = previewBrushTrack(flatLine(8.2, 30, 140), opts, null)!;
    expect(pv.rock.length).toBeGreaterThan(5);
    const plan = planBrushTrack(flatLine(8.2, 30, 140), opts)!;
    expect(plan.rockCut).toBe(true);
    expect(plan.rock).toEqual([]);
    const lastX = plan.line[plan.line.length - 1].X;
    expect(lastX).toBeLessThanOrEqual(85 - 25);
    expect(lastX).toBeGreaterThan(40);
  });

  it('die Tiefe bleibt über Vorschauen und beim Loslassen; am Berg springt nichts, kein Knick', () => {
    const opts = fieldOpts(new FreeField([slab], 0, () => 0));
    const Y = 8 + 4.2 * 0.5;
    const pts = flatLine(Y, 30, 150);
    let pv: ReturnType<typeof previewBrushTrack> = null;
    let jump = 0;
    for (let k = 20; k <= pts.length; k += 4) {
      const next = previewBrushTrack(pts.slice(0, k), opts, pv);
      if (next && pv) for (let i = 0; i < Math.min(next.z.length - 15, pv.z.length); i++) jump = Math.max(jump, Math.abs(next.z[i] - pv.z[i]) / LANE_DEPTH);
      if (next) pv = next;
    }
    expect(pv).not.toBeNull();
    expect(jump).toBeLessThan(0.5);
    const plan = planBrushTrack(pts, opts, undefined, pv!)!;
    expect(plan.rock).toEqual([]);
    const m = Math.min(plan.z.length, pv!.z.length);
    for (let i = 0; i < m; i++) if (Math.abs(plan.line[i].X - 85) < 20) expect(Math.abs(plan.z[i] - pv!.z[i]) / LANE_DEPTH).toBeLessThan(0.3);
    expect(maxStep(plan, 55, 115)).toBeLessThan(0.12);
  });

  it('beim Malen zieht die Einfahrt den Strich hinein, sobald er sie erreicht; was davor gezeigt war, bleibt vor der Lippe, beim Loslassen springt nichts', () => {
    const opts = fieldOpts(new FreeField([tunnel], 0, () => 0));
    const pts = flatLine(4 + 4.2 * 0.5, 0, 140);
    let pv: ReturnType<typeof previewBrushTrack> = null;
    let beforeWindow: Float64Array | null = null;
    for (let k = 20; k <= pts.length; k += 2) {
      pv = previewBrushTrack(pts.slice(0, k), opts, pv);
      if (pts[k - 1].X < 77 && pv) beforeWindow = pv.z;
    }
    // die Vorschau rechnet auf der Linie mit 1 m Abstand ab x 0: Index = X
    expect(Math.abs(beforeWindow![50] / LANE_DEPTH - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(pv!.z[85] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    const plan = planBrushTrack(pts, opts, undefined, pv!)!;
    expect(plan.rock).toEqual([]);
    expect(Math.abs(plan.z[at(plan, 50)] / LANE_DEPTH - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(plan.z[at(plan, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    const m = Math.min(plan.z.length, pv!.z.length);
    for (let i = 0; i < m; i++) if (Math.abs(plan.line[i].X - 85) < 20) expect(Math.abs(plan.z[i] - pv!.z[i]) / LANE_DEPTH).toBeLessThan(0.3);
    expect(maxStep(plan, 55, 115)).toBeLessThan(0.12);
  });

  it('Nachbessern: der Hebel „nach hinten legen“ drückt die Bahn nicht in die Lippe, der Fels bleibt frei', () => {
    const opts = fieldOpts(new FreeField([slab], 0, () => 0));
    const Y = 8 + 4.2 * 0.5;
    const plan = planBrushTrack(flatLine(Y, 30, 150), opts)!;
    // wie der Hebel: Mindesttiefe am Berg 3 m hinter die Lösung legen, dann neu wählen
    for (let i = 0; i < plan.z.length; i++) if (Math.abs(plan.line[i].X - 85) < 14) plan.lower[i] = plan.z[i] + 3;
    swapCrossing(plan, -1, opts);
    expect(plan.rock).toEqual([]);
    plan.line.forEach((p, i) => {
      if (Math.abs(p.X - 85) > 10) return;
      expect(inWall(plan.z[i] / LANE_DEPTH, lip)).toBe(false);
      expect(inWall(plan.z[i] / LANE_DEPTH, back)).toBe(false);
    });
  });

  it('Tunnel-Meter der Fahrt zählen im Innenraum des Dreiteilers (Einfahrt durch das Fenster, Ausfahrt durch ein zweites)', () => {
    // Strich durch die Mitte der Fenster (der Strahl der Lippe liegt auf 4 m): dort ist die Öffnung am breitesten
    const two = tunnel;
    const field = new FreeField([two], 0, () => 0);
    const plan = planBrushTrack(flatLine(4 + 4.2 * 0.554, 10, 160), fieldOpts(field))!;
    expect(plan.rock).toEqual([]);
    expect(plan.rockCut).toBe(false);
    expect(Math.abs(plan.z[at(plan, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - WALL_HALF);
    expect(maxStep(plan, 60, 110)).toBeLessThan(0.12);
    const path = { ...plan.path, startType: 'launch' as const };
    const samples = sampleTrack(path);
    const terrain = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] });
    const opts: TrainSimOptions = { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'launch', coins: [], terrain, allowTunnels: true, checkCrossings: false, insideRock: (x, y, z) => field.ceilingAbove(x, y, z) };
    const sim = new TrainSim(samples, path, opts);
    for (let i = 0; i < 3000 && sim.phase !== 'failed' && sim.phase !== 'done' && sim.phase !== 'flying'; i++) sim.step(1 / 60);
    expect(sim.stats.tunnels).toBe(1);
    const without = new TrainSim(samples, path, { ...opts, insideRock: undefined });
    for (let i = 0; i < 3000 && without.phase !== 'failed' && without.phase !== 'done' && without.phase !== 'flying'; i++) without.step(1 / 60);
    expect(without.stats.tunnels).toBe(0);
  });
});
