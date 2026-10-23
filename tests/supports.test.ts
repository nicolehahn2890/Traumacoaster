import { describe, expect, it } from 'vitest';
import type { TrackSamples } from '@/track/model';
import { footOffsets, planSupports, supportKindFor, SUPPORT_KINDS, SUPPORT_MIN_HEIGHT, SUPPORT_THIN, type SupportKind, type TerrainLike } from '@/render/supports/supportStyle';

/** Abtastung einer Bahn aus (x, y, z, upy)-Punkten im Abstand 0,5 m (nur die Felder, die der Planer liest) */
function samplesOf(pts: Array<[number, number, number, number?]>): TrackSamples {
  const n = pts.length;
  const s = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const upy = new Float64Array(n);
  pts.forEach(([px, py, pz, up], i) => {
    s[i] = i * 0.5;
    x[i] = px;
    y[i] = py;
    z[i] = pz;
    upy[i] = up ?? 1;
  });
  return { count: n, s, x, y, z, upy, length: (n - 1) * 0.5, step: 0.5 } as unknown as TrackSamples;
}

const flat: TerrainLike = { groundHeight: () => 0, mountainHeight: () => 0, insideMountain: () => false };

describe('Pfeiler-Planer', () => {
  it('setzt alle spacing · SUPPORT_THIN Meter einen Pfeiler, nicht unter der Mindesthöhe', () => {
    const pts: Array<[number, number, number, number?]> = [];
    for (let i = 0; i <= 80; i++) pts.push([i * 0.5, 6, 0]);
    const plans = planSupports(samplesOf(pts), flat, 2.6, 'trestle');
    expect(plans.length).toBeGreaterThanOrEqual(Math.floor(40 / (2.6 * SUPPORT_THIN)));
    for (let i = 1; i < plans.length; i++) expect(plans[i].x - plans[i - 1].x).toBeGreaterThanOrEqual(2.6 * SUPPORT_THIN - 1e-9);
    for (const p of plans) {
      expect(p.h).toBeCloseTo(6, 9);
      expect(p.ground).toBe(0);
      expect(p.lane).toBe(0);
      expect(p.kind).toBe('trestle');
    }
    const low = planSupports(samplesOf(pts.map(([x, , z]) => [x, SUPPORT_MIN_HEIGHT - 0.1, z])), flat, 2.6, 'trestle');
    expect(low).toHaveLength(0);
  });
  it('setzt in einer Spirale keine Pfeiler durch die tiefere Bahn und keine dicht nebeneinander', () => {
    // hin auf 3 m Höhe, zurück auf 9 m Höhe genau darüber (wie in einer Schneckennudel)
    const pts: Array<[number, number, number, number?]> = [];
    for (let i = 0; i <= 80; i++) pts.push([i * 0.5, 3, 0]);
    for (let i = 0; i <= 20; i++) pts.push([40 + 4 * Math.sin((i / 20) * Math.PI), 3 + 6 * (i / 20), 0]);
    for (let i = 0; i <= 80; i++) pts.push([40 - i * 0.5, 9, 0]);
    const plans = planSupports(samplesOf(pts), flat, 2.6, 'tree');
    // oben über der unteren Bahn (x unter 38) steht keiner: er ginge durch die untere hindurch
    expect(plans.filter((p) => p.y > 8 && p.x < 38)).toEqual([]);
    for (let a = 0; a < plans.length; a++) for (let b = a + 1; b < plans.length; b++) expect(Math.hypot(plans[a].x - plans[b].x, (plans[a].z - plans[b].z) * 8.4)).toBeGreaterThan(2.5);
  });
  it('lässt kopfüber liegende Abschnitte und Bergtunnel aus, steht auf Berg und Hügel', () => {
    const pts: Array<[number, number, number, number?]> = [];
    for (let i = 0; i <= 80; i++) pts.push([i * 0.5, 12, 0, i >= 20 && i <= 40 ? -0.5 : 1]);
    const inverted = planSupports(samplesOf(pts), flat, 2, 'tree');
    expect(inverted.every((p) => p.x < 10 || p.x > 20)).toBe(true);
    const mountain: TerrainLike = {
      groundHeight: (x) => (x > 30 ? 3 : 0),
      mountainHeight: (x) => (x >= 10 && x <= 20 ? 20 : 0),
      insideMountain: (x, y) => x >= 10 && x <= 20 && y < 20,
    };
    const plans = planSupports(samplesOf(pts.map(([x, , z]) => [x, 12, z])), mountain, 2, 'tree');
    expect(plans.every((p) => p.x < 10 || p.x > 20)).toBe(true);
    const onHill = plans.find((p) => p.x > 30)!;
    expect(onHill.ground).toBe(3);
    expect(onHill.h).toBeCloseTo(9, 9);
  });
  it('ist deterministisch und ordnet jede Spur über die gerundete Tiefe zu', () => {
    const pts: Array<[number, number, number, number?]> = [];
    for (let i = 0; i <= 40; i++) pts.push([i * 0.5, 5, 1.4]);
    const a = planSupports(samplesOf(pts), flat, 3, 'pylon');
    const b = planSupports(samplesOf(pts), flat, 3, 'pylon');
    expect(a).toEqual(b);
    expect(a.every((p) => p.lane === 1)).toBe(true);
    expect(a.map((p) => p.seed)).toEqual([...new Set(a.map((p) => p.seed))]);
  });
});

describe('Pfeilerformen', () => {
  it('jede Welt hat eine Form, Fußpunkte liegen symmetrisch zur Bahnachse', () => {
    const kinds = new Set<SupportKind>();
    for (let w = 1; w <= 10; w++) kinds.add(supportKindFor(w));
    expect(kinds.size).toBe(10);
    expect(supportKindFor(99)).toBe('trestle');
    for (const kind of Object.values(SUPPORT_KINDS)) {
      for (const h of [2, 8, 20]) {
        const feet = footOffsets(kind, h);
        expect(feet.length).toBeGreaterThan(0);
        const sum = feet.reduce((acc, v) => acc + v, 0);
        expect(Math.abs(sum)).toBeLessThan(1e-9);
        for (const f of feet) expect(feet.some((g) => Math.abs(g + f) < 1e-9)).toBe(true);
      }
    }
    expect(footOffsets('trestle', 5)).toEqual([-0.7, 0.7]);
    expect(footOffsets('pole', 3)).toEqual([0]);
    expect(footOffsets('pole', 9)).toEqual([-0.7, 0.7]);
  });
});
