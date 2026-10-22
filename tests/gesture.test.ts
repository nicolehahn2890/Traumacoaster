import { describe, expect, it } from 'vitest';
import { interpretGesture, laneChangeLength, scanSections } from '@/track/gesture';
import { extendTrack, prepareStroke, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { nodeIn, nodeOut, nodePos, sampleTrack, trackStats } from '@/track/model';
import { laneRise, toStage, type StagePoint } from '@/track/stage';
import { normalize3, sub3 } from '@/core/math3';

const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });
const R = laneRise(1);
/** Hügel, Spurwechsel nach hinten, Boden-Kehre, Rückweg: alle Gesten in einem Strich */
const tour = (): StagePoint[] => [
  ...param(20, (t) => [t * 10, 0]),
  ...param(30, (t) => [10 + t * 12, 16 * (1 - Math.cos(Math.PI * t)) * 0.5]),
  ...param(30, (t) => [22 + t * 14, 16 - 16 * (1 - Math.cos(Math.PI * t)) * 0.5]),
  ...param(30, (t) => [36 + t * 14, 0]),
  ...param(30, (t) => [50 + t * 16, R * (1 - Math.cos(Math.PI * t)) * 0.5]),
  ...param(20, (t) => [66 + t * 10, R]),
  ...param(30, (t) => [76 + 6 * Math.sin(Math.PI * t), R + R * (1 - Math.cos(Math.PI * t))]),
  ...param(40, (t) => [76 - t * 40, 3 * R]),
];

describe('Gesten-Interpreter: feste Spuren', () => {
  it('hält einen zittrigen Strich entlang einer Bodenlinie exakt auf der Spur', () => {
    const pts = stageCurve(0, 60, 240, (x) => 0.8 * Math.sin(x * 1.7)).map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretGesture(pts);
    expect(r.points.every((p) => p.mode === 'floor' && p.z === 0)).toBe(true);
    expect(r.events.length).toBe(0);
  });
  it('liest eine Diagonale in die nächste Spur als einen S-förmigen Spurwechsel von mindestens 14 m', () => {
    const pts = stageCurve(0, 60, 120, (x) => (x < 20 ? 0 : x > 32 ? R : ((x - 20) / 12) * R)).map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretGesture(pts);
    const z = r.points.map((p) => p.z);
    expect(z[0]).toBe(0);
    expect(z[z.length - 1]).toBe(1);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThanOrEqual(z[i - 1] - 1e-9);
    const first = r.points.findIndex((p) => p.z > 0.01);
    const last = r.points.findIndex((p) => p.z > 0.99);
    expect(r.points[last].x - r.points[first].x).toBeGreaterThanOrEqual(13);
    expect(laneChangeLength(1, 0)).toBeGreaterThanOrEqual(14);
    expect(laneChangeLength(1, 20)).toBeGreaterThan(laneChangeLength(1, 0));
  });
  it('lässt einen Hügel auf der Bodenlinie einer anderen Spur landen', () => {
    // Anstieg auf Spur 0, Abfahrt bis auf die Linie von Spur 1, dort weiter
    const stroke = [
      ...param(20, (t) => [t * 10, 0]),
      ...param(30, (t) => [10 + t * 12, 18 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [22 + t * 20, 18 - (18 - R) * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(30, (t) => [42 + t * 20, R]),
    ];
    const r = strokeToTrack(stroke);
    const end = r.points[r.points.length - 1];
    expect(end.mode).toBe('floor');
    expect(end.z).toBe(1);
    const top = r.points.reduce((a, b) => (b.y > a.y ? b : a));
    expect(top.mode).toBe('height');
    expect(top.y).toBeGreaterThan(16);
    expect(Math.abs(top.z)).toBeLessThan(0.05);
    expect(trackStats(r.path, sampleTrack(r.path)).lanes).toBe(2);
  });
  it('formt eine Boden-Kehre immer über mindestens eine Spur, ohne Knick', () => {
    const stroke = [...param(40, (t) => [t * 30, 0]), ...param(20, (t) => [30 + 2 * Math.sin(Math.PI * t), 0.6 * (1 - Math.cos(Math.PI * t))]), ...param(40, (t) => [30 - t * 30, 1.2])];
    const r = strokeToTrack(stroke);
    const turns = r.events.filter((e) => e.kind === 'turn');
    expect(turns.length).toBe(1);
    expect(turns[0].radius).toBeGreaterThanOrEqual(4.2);
    const s = sampleTrack(r.path);
    // Krümmung nirgends enger als der Halbkreis (plus etwas Spiel für den Fit)
    let maxK = 0;
    for (let i = 0; i < s.count; i++) if (!s.auto[i]) maxK = Math.max(maxK, Math.hypot(s.k3x[i], s.k3y[i], s.k3z[i]));
    expect(maxK).toBeLessThan(1 / 3.5);
    expect(trackStats(r.path, s).lanes).toBe(2);
  });
});

describe('Gesten-Interpreter: Loopings', () => {
  const climb = (): StagePoint[] => [...param(20, (t) => [t * 10, 0]), ...param(30, (t) => [10 + t * 12, 20 * (1 - Math.cos(Math.PI * t)) * 0.5]), ...param(40, (t) => [22 + t * 28, 20])];
  it('zieht einen klein gezeichneten Looping nicht platt, sondern macht einen fahrbaren Kreis daraus', () => {
    const stroke = [
      ...climb(),
      ...param(40, (t) => {
        const a = -Math.PI / 2 + Math.PI * 2 * t;
        return [50 + 2.5 * Math.cos(a) + t * 1.2, 22.5 + 2.5 * Math.sin(a)];
      }),
      ...param(40, (t) => [51.2 + t * 30, 20 - t * 20]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(1);
    const s = sampleTrack(r.path);
    const st = trackStats(r.path, s);
    expect(st.loops).toBe(1);
    expect(st.maxHeight).toBeGreaterThan(20 + 2 * 3.5 - 0.5);
  });
  it('liest ein breites, flaches Oval am Boden nie als Looping, auch wenn es sich voll dreht', () => {
    const stroke = [...param(40, (t) => [t * 30, 0]), ...param(30, (t) => [30 + R * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]), ...param(40, (t) => [30 - t * 30, 2 * R]), ...param(30, (t) => [-R * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)])];
    const sections = scanSections(prepareStroke(stroke));
    expect(sections.some((s) => s.kind === 'loop')).toBe(false);
    expect(sections.filter((s) => s.kind === 'turn').length).toBe(2);
  });
  it('erkennt ein breites Oval in der Luft noch als Looping, nachdem es zunächst wie eine Kehre aussah', () => {
    // 16 m breit, 10 m hoch: oben so flach, dass die Umkehr erst eine Kehre zu sein scheint
    const stroke = [
      ...climb(),
      ...param(60, (t) => {
        const a = -Math.PI / 2 + Math.PI * 2 * t;
        return [50 + 8 * Math.cos(a) + t * 1.5, 25 + 5 * Math.sin(a)];
      }),
      ...param(40, (t) => [51.5 + t * 30, 20 - t * 20]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(1);
    expect(r.events.filter((e) => e.kind === 'turn').length).toBe(0);
  });
});

describe('Gesten-Interpreter: stabil beim Ziehen', () => {
  it('ändert beim Weiterzeichnen nichts an der Bahn, die weiter als 30 m hinter dem Finger liegt', () => {
    const full = tour();
    const fullPts = prepareStroke(full);
    const ref = interpretGesture(fullPts, { preview: true, closeAt: { X: 0, Y: 0 } }).points;
    const sAt = (pts: { x: number; y: number }[]) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      return cum;
    };
    const total = sAt(fullPts)[fullPts.length - 1];
    let worst = 0;
    for (let cut = Math.floor(full.length * 0.35); cut < full.length; cut += 7) {
      const part = prepareStroke(full.slice(0, cut));
      const partLen = sAt(part)[part.length - 1];
      const got = interpretGesture(part, { preview: true, closeAt: { X: 0, Y: 0 } }).points;
      const limit = partLen - 30;
      if (limit <= 5) continue;
      for (const p of got) {
        if ((p.s ?? 0) > limit) break;
        // Referenzpunkt mit gleicher Strichlänge
        let best = Infinity;
        for (const q of ref) if (Math.abs((q.s ?? 0) - (p.s ?? 0)) < 0.6) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y, (q.z - p.z) * 8.4));
        worst = Math.max(worst, best);
      }
    }
    expect(total).toBeGreaterThan(140);
    expect(worst).toBeLessThan(1.0);
  });
  it('schließt die Runde in der Vorschau nicht, sondern erst beim Loslassen', () => {
    const oval = [...param(40, (t) => [t * 30, 0]), ...param(30, (t) => [30 + R * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]), ...param(40, (t) => [30 - t * 30, 2 * R]), ...param(30, (t) => [-R * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)])];
    expect(strokeToTrack(oval.slice(0, oval.length - 3), { preview: true }).path.closed).toBe(false);
    expect(strokeToTrack(oval, { preview: true }).path.closed).toBe(false);
    expect(strokeToTrack(oval).path.closed).toBe(true);
  });
  it('führt die Schluss-Kehre auf die Spur der Station, auch mit Tempo', () => {
    const W = 10;
    const stroke = [
      ...stageCurve(0, 40, 80, (x) => 14 * Math.exp(-((x - 18) ** 2) / 50)),
      ...param(40, (t) => [40 + W * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(50, (t) => [40 - t * 40, 2 * R]),
      ...param(40, (t) => [-W * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.path.closed).toBe(true);
    expect(Math.abs(r.points[r.points.length - 1].z)).toBeLessThan(0.05);
    expect(trackStats(r.path, sampleTrack(r.path)).lanes).toBe(2);
  });
});

describe('Fortsetzen am offenen Ende', () => {
  it('schließt einen schräg ansetzenden Strich ohne Knick an (G1 am Ende, kein enger Radius an der Naht)', () => {
    const base = strokeToTrack(stageCurve(0, 30, 60, (x) => 12 * Math.exp(-((x - 15) ** 2) / 40))).path;
    expect(base.closed).toBe(false);
    const end = base.nodes[base.nodes.length - 1];
    const se = toStage(end.x, end.y, end.z);
    // der Finger trifft das Ende 1,5 m daneben und zieht in 30° nach oben weg
    const ext = extendTrack(base, param(40, (t) => [se.X + 1.5 + t * 30, se.Y + 1 + t * 30 * Math.tan(Math.PI / 6)]), { groundClearance: 0.8 });
    expect(ext).not.toBeNull();
    const n = base.nodes.length - 1;
    const joint = ext!.nodes[n];
    expect(joint.x).toBeCloseTo(end.x, 6);
    const din = normalize3(sub3(nodePos(joint), nodeIn(joint)));
    const dout = normalize3(sub3(nodeOut(joint), nodePos(joint)));
    expect(din.x * dout.x + din.y * dout.y + din.z * dout.z).toBeGreaterThan(0.999);
    const s = sampleTrack(ext!);
    let maxK = 0;
    for (let i = 0; i < s.count; i++) {
      if (Math.abs(s.x[i] - end.x) > 12) continue;
      maxK = Math.max(maxK, Math.hypot(s.k3x[i], s.k3y[i], s.k3z[i]));
    }
    expect(maxK).toBeLessThan(1 / 4);
    expect(ext!.nodes.length).toBeGreaterThan(base.nodes.length);
  });
});
