import { describe, expect, it } from 'vitest';
import { LANE_DEPTH, rayToWorld, toView, type StagePoint } from '@/track/stage';
import { planBrushTrack } from '@/track/brushTrack';
import { sampleTrack } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { TrainSim, type TrainSimOptions } from '@/physics/trainSim';
import { RockField, ROCK_MARGIN } from '@/zone/rock';
import { SITE_OPENING_R, SITE_STANDOFF, siteAnchor, siteTarget, siteWalls, withSiteOpenings } from '@/zone/sites';
import { emptyZone, parseZone, serializeZone, type ZoneElement, type ZoneSite } from '@/zone/types';

const slab: ZoneElement = { id: 'e1', kind: 'threePart', x: 85, y: 0, z: 1, w: 24, h: 14, d: 7.5, openings: [{ dx: 0, dy: 4, r: 2.4 }] };
const other: ZoneElement = { id: 'e9', kind: 'threePart', x: 85, y: 0, z: -1, w: 24, h: 14, d: 7.5 };
const flat: ZoneElement = { id: 'e2', kind: 'flat', x: 80, y: 0, z: 1, w: 8, h: 6 };
const connect: ZoneSite = { id: 'b2', x: 80, y: 6, z: 1, variant: 'connect' };
const wallSite: ZoneSite = { id: 'b1', x: 110, y: 1, z: 1, variant: 'breakthrough', energy: 12 };
const half = 7.5 / 2 / LANE_DEPTH;
const flatLine = (Y: number, x0: number, x1: number): StagePoint[] => {
  const out: StagePoint[] = [];
  for (let x = x0; x <= x1; x += 2) out.push({ X: x, Y });
  return out;
};

describe('Baustellen (Etappe 2, Schritt 6)', () => {
  it('Verbinden: Ziel ist der Dreiteiler, der den Punkt enthält und dessen Dicke die Spur trifft, oder der genannte', () => {
    expect(siteTarget([flat, slab, other], connect)?.id).toBe('e1');
    expect(siteTarget([flat, slab, other], { ...connect, z: -1 })?.id).toBe('e9');
    expect(siteTarget([flat, slab], { ...connect, x: 40 })).toBeNull();
    expect(siteTarget([flat, slab, other], { ...connect, target: 'e9' })?.id).toBe('e9');
    expect(siteTarget([flat], connect)).toBeNull();
    // Anschlusspunkt als Bahnende: knapp vor der Lippe
    const a = siteAnchor([slab], connect);
    expect(a.lane).toBeCloseTo(1 - half - SITE_STANDOFF, 6);
    expect(siteAnchor([flat], connect)).toEqual({ x: 80, y: 6, lane: 1 });
  });

  it('nach der Freilegung trägt die Lippe die Öffnung: das Festigkeitsfeld lässt dort durch, die Zonendatei bleibt gleich', () => {
    const before = new RockField([slab]);
    const closedSpans = before.spans(toView(80, 6, 1 - half), (p, lane) => rayToWorld(p, lane));
    expect(closedSpans.some((s) => Math.abs(s.z0 - (1 - half - ROCK_MARGIN)) < 1e-6)).toBe(true);
    const derived = withSiteOpenings([slab, flat], [connect, wallSite], new Set(['b2']));
    expect(derived[0].openings).toHaveLength(2);
    expect(derived[0].openings![1]).toEqual({ dx: -5, dy: 6, r: SITE_OPENING_R });
    expect(derived[1]).toBe(flat);
    expect(slab.openings).toHaveLength(1);
    const after = new RockField(derived);
    const openSpans = after.spans(toView(80, 6, 1 - half), (p, lane) => rayToWorld(p, lane));
    expect(openSpans.some((s) => Math.abs(s.z0 - (1 - half - ROCK_MARGIN)) < 1e-6)).toBe(false);
    expect(withSiteOpenings([slab], [connect], new Set())[0]).toBe(slab);
    // Durchbruch-Wände nur für geschlossene Baustellen
    expect(siteWalls([connect, wallSite], new Set())).toHaveLength(1);
    expect(siteWalls([connect, wallSite], new Set(['b1']))).toHaveLength(0);
    // Ziel und Radius überleben die Zonendatei
    const zone = emptyZone('x');
    zone.sites.push({ ...connect, target: 'e1', r: 3 });
    const back = parseZone(JSON.parse(serializeZone(zone)))!;
    expect(back.sites[0]).toMatchObject({ target: 'e1', r: 3 });
  });

  it('Fang: das Strichende gleitet auf den Anschlusspunkt und hält dort die Spur vor der Lippe', () => {
    const a = siteAnchor([slab], connect);
    const v = toView(a.x, a.y, a.lane);
    const plan = planBrushTrack(flatLine(8.2, 10, 78), { endSnap: { X: v.X, Y: v.Y, lane: a.lane } })!;
    const last = plan.line[plan.line.length - 1];
    expect(Math.hypot(last.X - v.X, last.Y - v.Y)).toBeLessThan(0.6);
    expect(plan.z[plan.z.length - 1] / LANE_DEPTH).toBeCloseTo(a.lane, 1);
    const w = rayToWorld(last, plan.z[plan.z.length - 1] / LANE_DEPTH);
    expect(w.x).toBeCloseTo(80, 0);
    expect(w.y).toBeCloseTo(6, 0);
  });

  it('Durchbruch: schnell genug zersplittert die Wand (Ereignis, Zählung), zu langsam hält sie und die Fahrt endet', () => {
    const plan = planBrushTrack(flatLine(8.2, 10, 180))!;
    const path = { ...plan.path, startType: 'launch' as const };
    const samples = sampleTrack(path);
    const terrain = new Terrain({ width: 220, terrain: [{ kind: 'flat' }] });
    const ride = (energy: number) => {
      const opts: TrainSimOptions = { cars: 2, carLength: 2.4, skin: 'skinSteel', frictionScale: 1, gravityScale: 1, startType: 'launch', coins: [], terrain, allowTunnels: true, checkCrossings: false, walls: siteWalls([{ ...wallSite, energy }], new Set()) };
      const sim = new TrainSim(samples, path, opts);
      for (let i = 0; i < 3000 && sim.phase !== 'failed' && sim.phase !== 'done' && sim.phase !== 'flying'; i++) sim.step(1 / 60);
      return sim;
    };
    const fast = ride(12);
    expect(fast.stats.breakthroughs).toBe(1);
    expect(fast.events.some((e) => e.kind === 'breakthrough' && e.id === 'b1')).toBe(true);
    expect(fast.failReason).not.toBe('wall');
    const slow = ride(40);
    expect(slow.phase).toBe('failed');
    expect(slow.failReason).toBe('wall');
    expect(slow.stats.breakthroughs).toBe(0);
    expect(slow.cars[0].x).toBeLessThan(111);
  });
});
