import { describe, expect, it } from 'vitest';
import { evaluate } from '@/levels/evaluator';
import { LEVELS, getLevel, unlockedUpTo } from '@/levels/levels';
import { WORLDS } from '@/levels/worlds';
import { restraintFor } from '@/physics/belts';
import { hasNegativeGoals } from '@/levels/evaluator';
import { trackStats, sampleTrack } from '@/track/model';
import { closeTrack, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { emptyPath } from '@/track/model';
import type { RideStats } from '@/physics/trainSim';

const ride = (over: Partial<RideStats> = {}): RideStats => ({
  time: 20, maxSpeed: 15, maxG: 3, minG: 0.5, maxLatG: 1, airtime: 0.5, coins: 0, tunnels: 0, boosters: 0, splashes: 0, inversions: 0,
  blackout: false, brakesUsed: false, distance: 100, ejected: 0, caught: 0, flightMax: 0, ...over,
});

describe('Level-Daten', () => {
  it('hat 150 Level in 10 Welten mit je 15 Leveln', () => {
    expect(LEVELS.length).toBe(150);
    expect(WORLDS.length).toBe(10);
    for (const w of WORLDS) expect(w.levels.length).toBe(15);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });
  it('schaltet Elemente in sinnvoller Reihenfolge frei (Ziel braucht freigeschaltetes Element)', () => {
    for (const l of LEVELS) {
      const unlocked = unlockedUpTo(l.id - 1);
      for (const g of l.goals) {
        if (g.type === 'turns' || g.type === 'lanes') expect(unlocked.has('turn'), `Level ${l.id}: Kurve`).toBe(true);
        if (g.type === 'loops') expect(unlocked.has('loop'), `Level ${l.id}: Looping`).toBe(true);
        if (g.type === 'tunnels') expect(unlocked.has('tunnel'), `Level ${l.id}: Tunnel`).toBe(true);
        if (g.type === 'launch') expect(unlocked.has('launch'), `Level ${l.id}: Launch`).toBe(true);
        if (g.type === 'boosters') expect(unlocked.has('booster') || unlocked.has('doubleLaunch'), `Level ${l.id}: Booster`).toBe(true);
        if (g.type === 'rolls') expect(unlocked.has('roll'), `Level ${l.id}: Schleife`).toBe(true);
        if (g.type === 'splash') expect(unlocked.has('splash'), `Level ${l.id}: Splash`).toBe(true);
        if (g.type === 'coins') expect(unlocked.has('coins'), `Level ${l.id}: Coins`).toBe(true);
        if (g.type === 'element' && g.element) expect(unlocked.has(g.element), `Level ${l.id}: ${g.element}`).toBe(true);
      }
      if (l.coins?.length) expect(l.coins.length, `Level ${l.id}: genug Coins für das Ziel`).toBeGreaterThanOrEqual(Math.max(0, ...l.goals.filter((g) => g.type === 'coins').map((g) => g.value ?? 0)));
    }
  });
});

describe('Zielauswertung', () => {
  it('bewertet Level 1 mit einem Hügel als geschafft', () => {
    const level = getLevel(1);
    const path = emptyPath();
    const ts = { length: 120, maxHeight: 11, loops: 0, turns: 0, lanes: 1, rolls: 0, maxDrop: 10 };
    const ev = evaluate(level, path, ts, ride({ maxG: 2.5 }), true, true);
    expect(ev.requiredDone).toBe(true);
    expect(ev.stars).toBeGreaterThanOrEqual(1);
    const fail = evaluate(level, path, ts, ride(), false, true);
    expect(fail.requiredDone).toBe(false);
  });
  it('erkennt Bonusziele und saubere Fahrt', () => {
    const level = getLevel(2); // Höhe 12, Bonus Strecke ≤ 90
    const path = emptyPath();
    const good = evaluate(level, path, { length: 80, maxHeight: 12.5, loops: 0, turns: 0, lanes: 1, rolls: 0, maxDrop: 11 }, ride(), true, true);
    expect(good.stars).toBe(3);
    const long = evaluate(level, path, { length: 150, maxHeight: 12.5, loops: 0, turns: 0, lanes: 1, rolls: 0, maxDrop: 11 }, ride(), true, true);
    expect(long.stars).toBe(1);
    const braked = evaluate(level, path, { length: 80, maxHeight: 12.5, loops: 0, turns: 0, lanes: 1, rolls: 0, maxDrop: 11 }, ride({ brakesUsed: true }), true, true);
    expect(braked.stars).toBe(2);
  });
  it('wertet Fahrtziele erst nach erfolgreicher Fahrt', () => {
    const level = getLevel(3); // 5 Coins
    const path = emptyPath();
    const ts = { length: 100, maxHeight: 8, loops: 0, turns: 0, lanes: 1, rolls: 0, maxDrop: 7 };
    const noRide = evaluate(level, path, ts, null, false, true);
    expect(noRide.goals[0].done).toBe(false);
    const withRide = evaluate(level, path, ts, ride({ coins: 5 }), true, true);
    expect(withRide.goals[0].done).toBe(true);
    const ejected = evaluate(level, path, ts, ride({ coins: 5 }), true, false);
    expect(ejected.requiredDone).toBe(false);
  });
});

describe('Gurte und negative Ziele', () => {
  it('Gurtstufen wachsen mit den Welten, einzelne Level weichen ab', () => {
    const w = (id: number) => WORLDS[id - 1];
    expect(restraintFor(getLevel(1), w(1))).toBe(0);
    expect(restraintFor(getLevel(12), w(1))).toBe(1); // Airtime-Hügel mit Beckengurt
    expect(restraintFor(getLevel(13), w(1))).toBe(0); // Abflug ohne Gurt
    expect(restraintFor(getLevel(16), w(2))).toBe(1);
    expect(restraintFor(getLevel(19), w(2))).toBe(0); // Rückfänger ohne Gurt
    expect(restraintFor(getLevel(50), w(4))).toBe(2);
    expect(restraintFor(getLevel(80), w(6))).toBe(3);
    expect(restraintFor(getLevel(140), w(10))).toBe(4);
    for (const l of LEVELS) expect([0, 1, 2, 3, 4]).toContain(restraintFor(l, w(l.world)));
  });
  it('in Leveln mit negativen Zielen ist der Rauswurf erlaubt, sonst nicht', () => {
    expect(hasNegativeGoals(getLevel(13))).toBe(true);
    expect(hasNegativeGoals(getLevel(19))).toBe(true);
    expect(hasNegativeGoals(getLevel(23))).toBe(true);
    expect(hasNegativeGoals(getLevel(1))).toBe(false);
    const r = strokeToTrack(stageCurve(0, 70, 140, (x) => 22 * Math.exp(-((x - 25) ** 2) / 60)));
    closeTrack(r.path);
    const ts = trackStats(r.path, sampleTrack(r.path));
    // Level 13 (Abflug): einer fliegt raus, der Zug kommt an → geschafft, Bonus bei 15 m Flug
    const abflug = evaluate(getLevel(13), r.path, ts, ride({ ejected: 1, flightMax: 16 }), true, false);
    expect(abflug.requiredDone).toBe(true);
    expect(abflug.bonusDone).toBe(true);
    const kurz = evaluate(getLevel(13), r.path, ts, ride({ ejected: 1, flightMax: 4 }), true, false);
    expect(kurz.requiredDone).toBe(true);
    expect(kurz.bonusDone).toBe(false);
    const keiner = evaluate(getLevel(13), r.path, ts, ride({ ejected: 0 }), true, true);
    expect(keiner.requiredDone).toBe(false);
    // Level 1: ein Rauswurf bleibt ein Fehlschlag
    const normal = evaluate(getLevel(1), r.path, ts, ride({ ejected: 1 }), true, false);
    expect(normal.requiredDone).toBe(false);
    // Level 19 (Rückfänger): gefangen zählt
    const fang = evaluate(getLevel(19), r.path, ts, ride({ ejected: 2, caught: 1, maxG: 3.5 }), true, false);
    expect(fang.requiredDone).toBe(true);
  });
});
