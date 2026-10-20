import { describe, expect, it } from 'vitest';
import { simplifyRDP, smoothStroke } from '@/core/rdp';
import { fitCurve } from '@/core/bezierFit';
import { bezierPoint } from '@/core/math';
import { assignDepth, detectLoops, detectTurns, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack, stateAt, trackStats } from '@/track/model';
import { applyOverdraw } from '@/track/overdraw';
import { laneRise, nearestLane, toStage, toWorld } from '@/track/stage';

/** Hilfsfunktion: Punkte einer Funktion y(x) als Bühnenstrich */
const curve = (x0: number, x1: number, n: number, f: (x: number) => number, lane = 0) =>
  Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    return { X: x, Y: f(x) + laneRise(lane) };
  });

describe('RDP und Glättung', () => {
  it('vereinfacht eine Gerade auf zwei Punkte', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0.01 * Math.sin(i) }));
    expect(simplifyRDP(pts, 0.5).length).toBe(2);
  });
  it('behält Endpunkte beim Glätten', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: (i % 2) * 2 }));
    const s = smoothStroke(pts, 5);
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[pts.length - 1]);
  });
});

describe('Bezier-Fit', () => {
  it('passt einen Halbkreis mit kleinem Fehler', () => {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const t = (Math.PI * i) / 39;
      return { x: 10 * Math.cos(t), y: 10 * Math.sin(t) };
    });
    const segs = fitCurve(pts, 0.2);
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs.length).toBeLessThanOrEqual(6);
    // Jeder Originalpunkt liegt nahe an einem Segment
    for (const p of pts) {
      let best = Infinity;
      for (const s of segs) {
        for (let k = 0; k <= 40; k++) {
          const q = bezierPoint(s.p0, s.p1, s.p2, s.p3, k / 40);
          best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
        }
      }
      expect(best).toBeLessThan(0.35);
    }
  });
});

describe('Bühne', () => {
  it('projiziert hin und zurück', () => {
    const w = { x: 12.5, y: 7.25, z: 1 };
    const s = toStage(w.x, w.y, w.z);
    const back = toWorld(s.X, s.Y, w.z);
    expect(back.x).toBeCloseTo(w.x, 6);
    expect(back.y).toBeCloseTo(w.y, 6);
  });
  it('findet die nächste Spur', () => {
    expect(nearestLane(laneRise(2) + 0.5)).toBe(2);
    expect(nearestLane(laneRise(-1) - 0.3)).toBe(-1);
    expect(nearestLane(0)).toBe(0);
  });
});

describe('Ereignis-Erkennung', () => {
  it('erkennt eine Kehrtwende nach hinten (Rückweg höher)', () => {
    const pts = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: i * 2, y: 0 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 38 - i * 2, y: 3 })),
    ];
    const t = detectTurns(pts, 12, []);
    expect(t.length).toBe(1);
    expect(t[0].dir).toBe(1);
  });
  it('erkennt eine Kehrtwende nach vorne (Rückweg tiefer)', () => {
    const pts = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: i * 2, y: 5 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 38 - i * 2, y: 1 })),
    ];
    const t = detectTurns(pts, 12, []);
    expect(t.length).toBe(1);
    expect(t[0].dir).toBe(-1);
  });
  it('ignoriert Zittern', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: i * 2 + (i % 3 === 0 ? -1 : 0), y: 0 }));
    expect(detectTurns(pts, 12, []).length).toBe(0);
  });
  it('erkennt eine Schleife als Looping', () => {
    const pts: { x: number; y: number }[] = [];
    for (let x = 0; x <= 20; x += 2) pts.push({ x, y: 0 });
    for (let i = 1; i < 24; i++) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / 24;
      pts.push({ x: 20 + 8 * Math.cos(a) + i * 0.2, y: 8 + 8 * Math.sin(a) });
    }
    for (let x = 26; x <= 50; x += 2) pts.push({ x, y: 0 });
    const loops = detectLoops(pts);
    expect(loops.length).toBe(1);
  });
  it('weist Tiefe zu und bleibt innerhalb der Spuren', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0 }));
    const z = assignDepth(pts, 2, [{ kind: 'turn', index: 20, dir: 1 }, { kind: 'turn', index: 45, dir: 1 }], 5);
    expect(z[0]).toBe(2);
    expect(z[32]).toBe(1); // erste Kehrtwende an der letzten Spur: Richtung dreht sich um
    expect(z[59]).toBe(2); // zweite Kehrtwende wieder nach hinten
  });
});

describe('Strich → Bahn', () => {
  it('erzeugt eine geschlossene Bahn mit Höhe', () => {
    const stroke = curve(0, 60, 80, (x) => 15 * Math.exp(-((x - 30) ** 2) / 120));
    const r = strokeToTrack(stroke);
    expect(r.path.nodes.length).toBeGreaterThan(3);
    expect(r.path.nodes[0].kind).toBe('station');
    const samples = sampleTrack(r.path);
    const stats = trackStats(r.path, samples);
    expect(stats.maxHeight).toBeGreaterThan(13);
    expect(stats.maxHeight).toBeLessThan(16.5);
    expect(stats.loops).toBe(0);
    // geschlossen: Anfang und Ende der Abtastung sind gleich
    const a = stateAt(samples, 0);
    const b = stateAt(samples, samples.length - 0.01);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
    // offener Strich → automatischer Rückweg über die Nachbarspur, der nicht als Kurve zählt
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(true);
    expect(stats.turns).toBe(0);
    expect(stats.lanes).toBe(1);
  });
  it('zählt Kurven und Spuren', () => {
    const stroke = [
      ...curve(0, 40, 40, () => 2, 0),
      ...curve(40, 2, 40, () => 2 + 0.01, 0).map((p) => ({ X: p.X, Y: p.Y + 3 })),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'turn').length).toBe(1);
    const stats = trackStats(r.path, sampleTrack(r.path));
    expect(stats.turns).toBeGreaterThanOrEqual(1);
    expect(stats.lanes).toBe(2);
  });
  it('zählt einen Looping', () => {
    const stroke: { X: number; Y: number }[] = [];
    for (let x = 0; x <= 30; x += 1) stroke.push({ X: x, Y: 1 });
    for (let i = 1; i < 40; i++) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / 40;
      stroke.push({ X: 30 + 10 * Math.cos(a) + i * 0.15, Y: 11 + 10 * Math.sin(a) });
    }
    for (let x = 36; x <= 70; x += 1) stroke.push({ X: x, Y: 1 });
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(1);
    const stats = trackStats(r.path, sampleTrack(r.path));
    expect(stats.loops).toBe(1);
  });
  it('hebt die Bahn über das Terrain', () => {
    const stroke = curve(0, 60, 60, () => 0.2);
    // weicher Hügel von x=20 bis 40, 5 m hoch
    const ground = (x: number) => (x > 20 && x < 40 ? 5 * Math.sin(((x - 20) / 20) * Math.PI) : 0);
    const r = strokeToTrack(stroke, { groundHeight: ground, groundClearance: 0.8 });
    const s = sampleTrack(r.path);
    let minClearance = Infinity;
    for (let i = 0; i < s.count; i++) {
      if (s.z[i] > 0.5) continue; // Rückweg auf der Nachbarspur ignorieren
      minClearance = Math.min(minClearance, s.y[i] - ground(s.x[i]));
    }
    // Fit-Toleranz 0,45 m: Die Bahn darf nie unter den Boden
    expect(minClearance).toBeGreaterThan(0.2);
    let maxY = 0;
    for (let i = 0; i < s.count; i++) if (s.z[i] < 0.5) maxY = Math.max(maxY, s.y[i]);
    expect(maxY).toBeGreaterThan(5.2);
  });
});

describe('Überzeichnen', () => {
  it('ersetzt nur den überzeichneten Abschnitt', () => {
    const base = strokeToTrack(curve(0, 80, 100, () => 0.4)).path;
    const before = sampleTrack(base);
    // neuer Strich: Hügel zwischen x=30 und x=50 auf der Bahn beginnend und endend
    const stroke = curve(30, 50, 40, (x) => 0.6 + 10 * Math.sin(((x - 30) / 20) * Math.PI));
    const merged = applyOverdraw(base, stroke);
    expect(merged).not.toBeNull();
    const after = sampleTrack(merged!);
    const stats = trackStats(merged!, after);
    expect(stats.maxHeight).toBeGreaterThan(10);
    // außerhalb des Bereichs bleibt die Höhe niedrig
    let maxOutside = 0;
    for (let i = 0; i < after.count; i++) if (after.x[i] < 25 || after.x[i] > 55) maxOutside = Math.max(maxOutside, after.y[i]);
    expect(maxOutside).toBeLessThan(3);
    expect(after.length).toBeGreaterThan(before.length);
  });
  it('lehnt einen Strich fern der Bahn ab', () => {
    const base = strokeToTrack(curve(0, 80, 100, () => 0.4)).path;
    const stroke = curve(30, 50, 20, () => 40);
    expect(applyOverdraw(base, stroke)).toBeNull();
  });
});
