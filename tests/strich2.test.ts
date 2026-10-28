/**
 * Pinsel-Studie: Strich 2 (src/track/strich2.ts). Ohne Perspektive liest sich die Bühne direkt: Höhe = Y − 0,5·Tiefe.
 */
import { describe, expect, it } from 'vitest';
import type { BrushOptions, Landing } from '@/track/brushTrack';
import { FREEZE, Strich2 } from '@/track/strich2';
import { LANE_DEPTH, setPerspective, type StagePoint } from '@/track/stage';
import type { FreeLanes } from '@/zone/field';

setPerspective(false);

/** Linie aus Stützpunkten, alle step Bühnen-Meter ein Punkt */
function polyline(pts: Array<[number, number]>, step = 0.2): StagePoint[] {
  const out: StagePoint[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(d / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push({ X: ax + ((bx - ax) * k) / n, Y: ay + ((by - ay) * k) / n });
  }
  return out;
}

/** Ebenen-Ersatz: Boden-Tiefe als Stufe bei X = stepAt (vorn 4 m, dahinter 14 m), Landungen keine */
function stepOptions(stepAt: number, counters?: { ground: number }): BrushOptions {
  return {
    ground: () => -500,
    clearance: 0.8,
    holdLane: true,
    depthAt: () => null,
    groundAt: (p) => {
      if (counters) counters.ground++;
      return p.X < stepAt ? 4 : 14;
    },
    zMax: 40,
  };
}

/** Talblick: Terrassen in jeder Tiefe auf Höhe 6; ein Punkt liegt 4 m über der Terrasse, die bei Tiefe (Y − 10) / 0,5 liegt */
function valleyOptions(): BrushOptions {
  return { ground: () => -500, clearance: 0.8, holdLane: true, depthAt: () => null, groundAt: (p) => Math.max(0, (p.Y - 10) / 0.5), zMax: 60 };
}

/** schrittweise füttern (alle every Punkte eine Vorschau) und je Vorschau die Tiefen merken */
function run(s: Strich2, pts: StagePoint[], every = 5): Float64Array[] {
  const zs: Float64Array[] = [];
  for (let n = 6; n <= pts.length; n += every) {
    const pv = s.update(pts.slice(0, n));
    if (pv) zs.push(Float64Array.from(pv.z));
  }
  return zs;
}

describe('Strich 2: kausal mit festem Vorlauf', () => {
  it('ändert eine Tiefe nie mehr, sobald sie fest ist, und springt beim Loslassen nicht', () => {
    const pts = polyline([[0, 10], [60, 10], [120, 10]]);
    const s = new Strich2(() => stepOptions(50), null, 4, 8);
    const zs = run(s, pts);
    expect(zs.length).toBeGreaterThan(5);
    // je Vorschau: alle Punkte, die weiter als FREEZE hinter der Spitze liegen, haben dieselbe Tiefe wie in der letzten
    // (auf der flachen Linie wächst der Vorlauf nicht)
    for (let k = 1; k < zs.length; k++) {
      const prev = zs[k - 1];
      const cur = zs[k];
      const frozen = prev.length - FREEZE - 2;
      for (let i = 0; i < frozen && i < cur.length; i++) expect(cur[i]).toBe(prev[i]);
    }
    const last = zs[zs.length - 1];
    const frozen = s.stats.frozen;
    expect(frozen).toBeGreaterThan(last.length - FREEZE - 3);
    const r = s.finish(pts)!;
    expect(r).not.toBeNull();
    for (let i = 0; i < frozen; i++) expect(r.z[i]).toBe(last[i]);
    // die Stufe der Bodenhöhe wird ein weicher Übergang: von 4 m nach 14 m, nie steiler als 1 m je Meter
    expect(r.z[5]).toBeCloseTo(4, 0);
    expect(r.z[r.z.length - 1]).toBeCloseTo(14, 0);
    let maxStep = 0;
    for (let i = 1; i < r.z.length; i++) maxStep = Math.max(maxStep, Math.abs(r.z[i] - r.z[i - 1]));
    expect(maxStep).toBeLessThan(1);
    // die Linie im Bild ist der Strich: Weltpunkt zurück ins Bild = Linienpunkt
    for (let i = 0; i < r.pts.length; i++) {
      expect(r.pts[i].x).toBeCloseTo(r.line[i].X, 6);
      expect(r.pts[i].y + 0.5 * r.pts[i].z).toBeCloseTo(r.line[i].Y, 6);
    }
  });

  it('liest steil Gezeichnetes als Höhe: die Tiefe folgt dort nicht der Bodenhöhe', () => {
    // flach bis 60 m, dann 45° steil hinauf, dahinter will der Boden 14 m Tiefe
    const pts = polyline([[0, 10], [60, 10], [90, 40]]);
    const s = new Strich2(() => stepOptions(50), null, 4, 8);
    run(s, pts);
    const r = s.finish(pts)!;
    const n = r.z.length;
    // am Fuß des Anstiegs (x ≈ 60) hat die Stufe (bei 50) schon gezogen; auf der Rampe wandert die Tiefe kaum weiter
    let foot = 0;
    for (let i = 0; i < n; i++) if (r.line[i].X <= 60) foot = i;
    const drift = Math.abs(r.z[n - 1] - r.z[foot]);
    expect(drift).toBeLessThan(3);
  });

  it('trennt einen zweiten Strang vom festen ersten (Kreuzungsregel)', () => {
    // hin auf Y = 10, zurück auf Y = 11 über dieselben x: im Bild liegen die Stränge übereinander
    const pts = polyline([[0, 10], [80, 10], [80, 11], [0, 11]]);
    const s = new Strich2(() => stepOptions(1000), null, 4, 8);
    run(s, pts);
    const r = s.finish(pts)!;
    const n = r.z.length;
    // Punkte des Rückwegs gegen den Hinweg an gleichem x (Mitte des Strichs, fern der Wende)
    let checked = 0;
    for (let j = 0; j < n; j++) {
      if (r.line[j].Y < 10.9 || r.line[j].X < 20 || r.line[j].X > 60) continue;
      for (let i = 0; i < n; i++) {
        if (r.line[i].Y > 10.1 || Math.abs(r.line[i].X - r.line[j].X) > 0.5) continue;
        const dz = Math.abs(r.pts[j].z - r.pts[i].z);
        const dy = Math.abs(r.pts[j].y - r.pts[i].y);
        expect(dz >= 2.2 - 0.3 || dy >= 3.5 - 0.3).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('liest eine Kehre als Halbkreis durch die Tiefe (die Bahn bleibt dort flach)', () => {
    // Haarnadel im Talblick: hin nach rechts, 12 m hoch, zurück nach links; dort liegen die Terrassen tiefer im Bild
    const pts = polyline([[0, 10], [60, 10], [66, 16], [60, 22], [0, 22]]);
    const s = new Strich2(() => valleyOptions(), null, 0, 8);
    run(s, pts);
    const r = s.finish(pts)!;
    const n = r.z.length;
    // Rückweg liegt 12 m höher im Bild: im Talblick ist das Tiefe (dz ≈ 12 / 0,5 = 24 m), die Höhe bleibt gleich
    let a = -1;
    let b = -1;
    for (let i = 0; i < n; i++) {
      if (a < 0 && r.line[i].X >= 30) a = i;
      if (i > a && a >= 0 && r.line[i].X <= 30 && r.line[i].Y > 20) b = i;
    }
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(r.pts[b].z - r.pts[a].z).toBeGreaterThan(15);
    expect(Math.abs(r.pts[b].y - r.pts[a].y)).toBeLessThan(5);
    // die Kehre selbst: zwischen den Füßen wandert die Tiefe, ohne dass die Bahn auf dem Scheitel senkrecht steht
    let maxStep = 0;
    for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(r.z[i] - r.z[i - 1]));
    expect(maxStep).toBeLessThan(2.5);
  });

  it('verwirft beim Zurückziehen, was hinter dem Schnitt lag', () => {
    const pts = polyline([[0, 10], [120, 10]]);
    const s = new Strich2(() => stepOptions(50), null, 4, 8);
    const pv1 = s.update(pts)!;
    const n1 = pv1.z.length;
    const pv2 = s.update(pts.slice(0, Math.floor(pts.length / 2)))!;
    expect(pv2.z.length).toBeLessThan(n1 - 40);
    const pv3 = s.update(pts)!;
    expect(pv3.z.length).toBeGreaterThanOrEqual(n1 - 2);
  });

  it('schließt die Runde mit einem neuen Weg ab dem festen Ende, ohne den Strich zu verformen', () => {
    // Rechteck zurück zum Anfang (von links kommend)
    const pts = polyline([[0, 10], [80, 10], [80, 40], [0, 40], [-6, 25], [-4, 12]]);
    const s = new Strich2(() => stepOptions(1000), null, 4, 8);
    const zs = run(s, pts);
    const last = zs[zs.length - 1];
    const frozen = s.stats.frozen;
    const r = s.finish(pts)!;
    expect(r.closed).toBe(true);
    // Anfang und Ende fallen zusammen, die Tiefe auch
    expect(r.pts[r.pts.length - 1].x).toBeCloseTo(r.pts[0].x, 6);
    expect(Math.abs(r.z[r.z.length - 1] - r.z[0])).toBeLessThan(0.5);
    // der feste Teil der letzten Vorschau ist unverändert
    expect(frozen).toBeGreaterThan(40);
    for (let i = 0; i < frozen; i++) expect(r.z[i]).toBe(last[i]);
  });

  it('fragt je Vorschau nur das freie Ende ab (konstante Arbeit, unabhängig von der Länge)', () => {
    const pts = polyline([[0, 10], [400, 10], [400, 20], [0, 20], [0, 30], [400, 30]]);
    const counters = { ground: 0 };
    const s = new Strich2(() => stepOptions(1000, counters), null, 4, 8);
    const calls: number[] = [];
    for (let n = 6; n <= pts.length; n += 10) {
      counters.ground = 0;
      s.update(pts.slice(0, n));
      calls.push(counters.ground);
    }
    const late = calls.slice(Math.floor(calls.length / 2));
    expect(Math.max(...late)).toBeLessThan(60);
    // die Linie ist über 1000 m lang, die Abfragen bleiben bei rund zwei je neuem Meter
    expect(s.stats.n).toBeGreaterThan(1000);
  });

  it('übernimmt die alte Bahn als festen Anfang und setzt dahinter an', () => {
    const base = { line: polyline([[0, 10], [14, 10]], 1), z: new Float64Array(15).fill(4) };
    const pts = polyline([[14.5, 10.3], [60, 10], [120, 10]]);
    const landing: Landing = { z: 14, id: 1, off: 0 };
    const opts: BrushOptions = { ...stepOptions(50), depthAt: (p) => (p.X > 80 ? landing : null) };
    const s = new Strich2(() => opts, base, NaN, 8);
    run(s, pts);
    const r = s.finish(pts)!;
    for (let i = 0; i < 15; i++) expect(r.z[i]).toBe(4);
    expect(r.z[r.z.length - 1]).toBeGreaterThan(12);
    // der Anschluss gleitet auf das alte Ende
    expect(r.line[15].X).toBeGreaterThan(14);
    expect(Math.abs(r.line[15].Y - 10)).toBeLessThan(0.3);
  });

  it('hält sich mit Freiraumfeld aus dem Festen und meldet Blockiertes', () => {
    // Freiraum: nur Spuren 0 … 1 (0 … 8,4 m), bei X > 60 nur noch 2 … 3 (nicht anschließend → blockiert)
    const free = (p: StagePoint): FreeLanes => ({ intervals: p.X > 60 ? [{ a: 2, b: 3, aKind: 'earth', bKind: 'edge', cave: null, attract: false }] : [{ a: 0, b: 1, aKind: 'edge', bKind: 'earth', cave: null, attract: false }], fallback: null, touched: true, below: null });
    const opts: BrushOptions = { ...stepOptions(1000), field: { free, solid: () => false, floor: () => null } };
    const pts = polyline([[0, 10], [100, 10]]);
    const s = new Strich2(() => opts, null, 4, 8);
    run(s, pts);
    const r = s.finish(pts)!;
    for (let i = 0; i < r.z.length; i++) if (r.line[i].X <= 60) expect(r.z[i]).toBeLessThanOrEqual(LANE_DEPTH + 1e-6);
    expect(r.rock.length).toBeGreaterThan(0);
    expect(r.line[r.rock[0][0]].X).toBeGreaterThan(60);
  });

  it('setzt Knoten nur, wo die Form sie braucht, lässt feste Knoten stehen und schließt G1 an ihnen an', () => {
    // 120 m gerade, dann ein weiter Bogen: wenige Knoten (der heutige Pinsel braucht hier auch nur eine Handvoll)
    const arc: Array<[number, number]> = [];
    for (let k = 0; k <= 12; k++) arc.push([120 + 40 * Math.sin((k / 12) * Math.PI * 0.5), 10 + 40 * (1 - Math.cos((k / 12) * Math.PI * 0.5))]);
    const pts = polyline([[0, 10], [120, 10], ...arc.slice(1)]);
    const s = new Strich2(() => stepOptions(1000), null, 4, 8);
    let prevNodes: { x: number; y: number; z: number; outX: number }[] = [];
    for (let n = 6; n <= pts.length; n += 5) {
      const pv = s.update(pts.slice(0, n));
      if (!pv) continue;
      const nodes = pv.path.nodes;
      // feste Knoten (ihr Segment endet weit hinter dem Vorlauf) stehen genau da, wo sie in der Vorschau davor standen,
      // mit derselben Tangente (auf der Geraden wächst das erste Segment bis zum Bogen, sein Knoten bleibt derselbe Punkt)
      const tip = pv.line[pv.line.length - 1];
      for (let k = 0; k + 1 < Math.min(prevNodes.length, nodes.length); k++) {
        if (Math.hypot(prevNodes[k + 1].x - tip.X, prevNodes[k + 1].y - tip.Y) < FREEZE + 20) break;
        expect(nodes[k].x).toBe(prevNodes[k].x);
        expect(nodes[k].y).toBe(prevNodes[k].y);
        expect(nodes[k].z).toBe(prevNodes[k].z);
        expect(nodes[k].outX).toBe(prevNodes[k].outX);
      }
      // G1: an jedem inneren Knoten zeigen in- und out-Tangente entgegengesetzt
      for (let k = 1; k < nodes.length - 1; k++) {
        const nd = nodes[k];
        const li = Math.hypot(nd.inX, nd.inY, nd.inZ);
        const lo = Math.hypot(nd.outX, nd.outY, nd.outZ);
        if (li < 1e-6 || lo < 1e-6) continue;
        const cos = -(nd.inX * nd.outX + nd.inY * nd.outY + nd.inZ * nd.outZ) / (li * lo);
        expect(cos).toBeGreaterThan(0.999);
      }
      prevNodes = nodes.map((nd) => ({ x: nd.x, y: nd.y, z: nd.z, outX: nd.outX }));
    }
    const r = s.finish(pts)!;
    expect(r.path.nodes.length).toBeLessThanOrEqual(10);
    expect(r.path.nodes.length).toBeGreaterThanOrEqual(3);
  });
});
