import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, toStage, type StagePoint } from '@/track/stage';
import { planBrushTrack, previewBrushTrack } from '@/track/brushTrack';
import { sampleTrack } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { TrainSim, type TrainSimOptions } from '@/physics/trainSim';
import { CAVE_WALL, ROCK_MARGIN, RockField } from '@/zone/rock';
import type { ZoneElement } from '@/zone/types';

/** Dreiteiler wie in der Prüfzone: 24 × 14 m, 7,5 m dick auf Spur 1, Fenster bei 4 m Höhe */
const slab: ZoneElement = { id: 'e1', kind: 'threePart', x: 85, y: 0, z: 1, w: 24, h: 14, d: 7.5, openings: [{ dx: 0, dy: 4, r: 2.4 }] };
const column: ZoneElement = { id: 'e2', kind: 'column', x: 50, y: 0, z: 0, w: 2, h: 10 };
const cave: ZoneElement = { id: 'e3', kind: 'cave', x: 140, y: 0, z: -1, w: 30, h: 12, d: 14 };
const flat: ZoneElement = { id: 'e4', kind: 'flat', x: 20, y: 0, z: 2, w: 8, h: 6 };

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

describe('Festigkeitsfeld der Zone (Etappe 2, Schritt 5)', () => {
  it('Dreiteiler: Lippe und Rückwand fest, Fenster in der Lippe frei, Innenraum frei und Tunnel; Säule, Höhle, Fläche', () => {
    const rock = new RockField([slab, column, cave, flat]);
    expect(rock.empty).toBe(false);
    expect(rock.solid(85, 8, lip)).toBe(true);
    expect(rock.solid(85, 4, lip)).toBe(false);
    expect(rock.solid(85, 4, back)).toBe(true);
    expect(rock.solid(85, 8, 1)).toBe(false);
    expect(rock.tunnel(85, 8, 1)).toBe(true);
    expect(rock.tunnel(85, 4, 1)).toBe(true);
    expect(rock.tunnel(85, 8, lip - 0.3)).toBe(false);
    // außerhalb des Umrisses und über dem Berg frei
    expect(rock.solid(60, 8, lip)).toBe(false);
    expect(rock.solid(85, 15, lip)).toBe(false);
    expect(rock.tunnel(60, 8, 1)).toBe(false);
    // Säule: Radius 1 m, 10 m hoch
    expect(rock.solid(50, 5, 0)).toBe(true);
    expect(rock.solid(50.8, 5, 0)).toBe(true);
    expect(rock.solid(51.5, 5, 0)).toBe(false);
    expect(rock.solid(50, 11, 0)).toBe(false);
    // Höhle: Wand, Boden und Decke fest, Raum frei und Tunnel
    expect(rock.solid(140 - 15, 6, -1)).toBe(true);
    expect(rock.solid(140, 12, -1)).toBe(true);
    expect(rock.solid(140, 6, -1)).toBe(false);
    expect(rock.tunnel(140, 6, -1)).toBe(true);
    expect(rock.tunnel(140, 6, 1)).toBe(false);
    expect(rock.solid(140, CAVE_WALL / 2, -1)).toBe(true);
    // Kulisse ohne Volumen
    expect(rock.solid(20, 3, 2)).toBe(false);
    expect(new RockField([flat]).empty).toBe(true);
    // Fortschrittsstufe: ein Element späterer Wachstumsstufe fehlt
    expect(new RockField([{ ...slab, growth: 2 }], 1).empty).toBe(true);
    expect(new RockField([{ ...slab, growth: 2 }], 2).empty).toBe(false);
  });

  it('Spannen je Bühnenpunkt: Lippe und Rückwand als schmale Bänder, im Fenster nur die Rückwand', () => {
    const rock = new RockField([slab]);
    const both = rock.spans(toStage(85, 10, 1), toWorld);
    expect(both).toHaveLength(2);
    expect(both[0].z0).toBeCloseTo(lip - ROCK_MARGIN, 6);
    expect(both[0].z1).toBeCloseTo(lip + ROCK_MARGIN, 6);
    expect(both[1].z0).toBeCloseTo(back - ROCK_MARGIN, 6);
    // Punkt, der an der Lippe genau im Fenster liegt
    const window = rock.spans(toStage(85, 4, lip), toWorld);
    expect(window).toHaveLength(1);
    expect(window[0].z0).toBeCloseTo(back - ROCK_MARGIN, 6);
    expect(rock.spans(toStage(40, 8, 1), toWorld)).toHaveLength(0);
  });

  it('der Pinsel bleibt vor oder hinter der Lippe statt in ihr; im Innenraum fährt er frei durch den Berg', () => {
    const rock = new RockField([slab]);
    const opts = { rock: (p: StagePoint) => rock.spans(p, toWorld) };
    // ohne Fels landet die Linie mit Bildhöhe 4 + 4,2 · 0,55 genau in der Lippe (Spur 0,55 vor der Spur 1 des Dreiteilers)
    const Y = 4 + 4.2 * 0.55;
    const free = planBrushTrack(flatLine(Y, 30, 140))!;
    const at = (plan: typeof free, x: number) => plan.line.findIndex((p) => Math.abs(p.X - x) < 1.5);
    const inLip = (lane: number) => lane > lip - ROCK_MARGIN + 1e-3 && lane < lip + ROCK_MARGIN - 1e-3;
    expect(inLip(free.z[at(free, 78)] / LANE_DEPTH)).toBe(true);
    const plan = planBrushTrack(flatLine(Y, 30, 140), opts)!;
    expect(plan.rock).toEqual([]);
    expect(plan.rockCut).toBe(false);
    let checked = 0;
    plan.line.forEach((p, i) => {
      // links und rechts vom Fenster: nie in der Lippe
      if (Math.abs(p.X - 85) > 10 || Math.abs(p.X - 85) < 3) return;
      checked++;
      expect(inLip(plan.z[i] / LANE_DEPTH)).toBe(false);
    });
    expect(checked).toBeGreaterThan(4);
    // Innenraum: Bildhöhe 8,2 → Spur 1 in 4 m Höhe, mitten zwischen Rückwand und Lippe: kein Fels, keine Blockade
    const inside = planBrushTrack(flatLine(8.2, 30, 140), opts)!;
    expect(inside.rock).toEqual([]);
    expect(Math.abs(inside.z[at(inside, 85)] / LANE_DEPTH - 1)).toBeLessThan(half - ROCK_MARGIN);
  });

  it('ohne freie Seite ist der Strich blockiert: Vorschau markiert rot, beim Loslassen endet die Bahn davor', () => {
    // eine Säule über alle Spuren: nirgends vorbei
    const wall: ZoneElement = { ...column, x: 85, w: 60 };
    const rock = new RockField([wall]);
    const opts = { rock: (p: StagePoint) => rock.spans(p, toWorld) };
    const pv = previewBrushTrack(flatLine(8.2, 30, 140), opts, null)!;
    expect(pv.rock.length).toBeGreaterThan(5);
    const plan = planBrushTrack(flatLine(8.2, 30, 140), opts)!;
    expect(plan.rockCut).toBe(true);
    expect(plan.rock).toEqual([]);
    const lastX = plan.line[plan.line.length - 1].X;
    expect(lastX).toBeLessThan(85 - 28);
    expect(lastX).toBeGreaterThan(40);
  });

  it('Tunnel-Meter der Fahrt zählen im Innenraum des Dreiteilers', () => {
    const rock = new RockField([slab]);
    const plan = planBrushTrack(flatLine(8.2, 10, 160), { rock: (p: StagePoint) => rock.spans(p, toWorld) })!;
    const path = { ...plan.path, startType: 'launch' as const };
    const samples = sampleTrack(path);
    const terrain = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] });
    const opts: TrainSimOptions = { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'launch', coins: [], terrain, allowTunnels: true, checkCrossings: false, insideRock: (x, y, z) => rock.tunnel(x, y, z) };
    const sim = new TrainSim(samples, path, opts);
    for (let i = 0; i < 3000 && sim.phase !== 'failed' && sim.phase !== 'done' && sim.phase !== 'flying'; i++) sim.step(1 / 60);
    expect(sim.stats.tunnels).toBe(1);
    const without = new TrainSim(samples, path, { ...opts, insideRock: undefined });
    for (let i = 0; i < 3000 && without.phase !== 'failed' && without.phase !== 'done' && without.phase !== 'flying'; i++) without.step(1 / 60);
    expect(without.stats.tunnels).toBe(0);
  });
});
