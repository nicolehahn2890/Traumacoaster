import { describe, expect, it } from 'vitest';
import { simplifyRDP, smoothStroke } from '@/core/rdp';
import { fitCurve } from '@/core/bezierFit';
import { bezierPoint } from '@/core/math';
import { closeTrack, detectLoops, detectTurns, extendTrack, interpretStroke, interpretWithEvents, magnetLane, removeHooks, stageCurve, strokeToTrack } from '@/track/strokeToTrack';
import { sampleTrack, stateAt, trackStats, type TrackSamples } from '@/track/model';
import { applyOverdraw } from '@/track/overdraw';
import { laneRise, laneScale, nearestLane, toStage, toWorld, type StagePoint } from '@/track/stage';

/** Bühnenpunkte entlang einer Parameterkurve */
const param = (n: number, f: (t: number) => [number, number]): StagePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [X, Y] = f(i / (n - 1));
    return { X, Y };
  });

/** Kleinster Oben-Vektor (y-Anteil) über alle Nicht-Auto-Abtastpunkte */
const minUpY = (s: TrackSamples): number => {
  let m = Infinity;
  for (let i = 0; i < s.count; i++) if (!s.auto[i]) m = Math.min(m, s.upy[i]);
  return m;
};

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

describe('Lesart des Strichs (Boden = Tiefe, steil = Höhe)', () => {
  it('liest einen flachen Strich als Boden auf Spur 0', () => {
    const pts = stageCurve(0, 40, 80, () => 0).map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretStroke(pts, {});
    expect(r.every((p) => p.mode === 'floor')).toBe(true);
    expect(Math.max(...r.map((p) => Math.abs(p.z)))).toBeLessThan(0.05);
  });
  it('liest einen sanften Anstieg (25°) als Bewegung nach hinten', () => {
    const pts = stageCurve(0, 36, 80, (x) => (x < 20 ? 0 : (x - 20) * Math.tan((25 * Math.PI) / 180))).map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretStroke(pts, {});
    expect(r.every((p) => p.mode === 'floor')).toBe(true);
    expect(r[r.length - 1].z).toBeGreaterThan(1.5);
  });
  it('liest einen steilen Hügel als Höhe auf der Startspur', () => {
    const pts = stageCurve(0, 60, 120, (x) => 15 * Math.exp(-((x - 30) ** 2) / 120)).map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretStroke(pts, {});
    const top = r.reduce((a, b) => (b.y > a.y ? b : a));
    expect(top.mode).toBe('height');
    expect(top.y).toBeGreaterThan(13.5);
    expect(Math.abs(top.z)).toBeLessThan(0.3);
    // nach dem Hügel wieder am Boden
    expect(r[r.length - 1].mode).toBe('floor');
  });
  it('liest ein Oval am Boden als flache Kurve, nicht als Anstieg', () => {
    // Stadion: nach rechts auf Spur 0, Halbkreis hoch auf Spur 2, zurück nach links
    const R = laneRise(1);
    const pts = [
      ...param(40, (t) => [t * 30, 0]),
      ...param(30, (t) => [30 + R * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(40, (t) => [30 - t * 30, 2 * R]),
    ].map((p) => ({ x: p.X, y: p.Y }));
    const r = interpretStroke(pts, {});
    expect(r.every((p) => p.mode === 'floor')).toBe(true);
    expect(r[r.length - 1].z).toBeCloseTo(2, 1);
    expect(detectLoops(r).length).toBe(0);
    expect(detectTurns(r, []).length).toBe(0);
  });
  it('erkennt eine Kreuzung am Boden nicht als Looping', () => {
    // liegende Acht am Boden
    const pts = param(120, (t) => {
      const a = t * Math.PI * 2;
      return [20 * Math.sin(a), 4 * Math.sin(2 * a) + 4];
    }).map((p) => ({ x: p.X, y: p.Y }));
    const { events } = interpretWithEvents(pts, {});
    expect(events.filter((e) => e.kind === 'loop').length).toBe(0);
  });
});

describe('Ereignisse in der Höhe', () => {
  /** Hügel-Auffahrt: Boden, steil hoch auf 20 m, dann waagerecht nach rechts bis x=50 */
  const climb = (): StagePoint[] => [
    ...param(20, (t) => [t * 10, 0]),
    ...param(30, (t) => [10 + t * 12, 20 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ...param(40, (t) => [22 + t * 28, 20]),
  ];
  it('erkennt eine Kehrtwende in der Höhe als Steilkurve nach hinten', () => {
    const stroke = [
      ...climb(),
      // Kehre: Rückweg 4 m höher, dann zurück nach links und auf der Bodenlinie der Spur 1 landen
      ...param(20, (t) => [50 + 6 * Math.sin(Math.PI * t), 20 + 4 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [50 - t * 30, 24]),
      ...param(30, (t) => [20 - t * 10, 24 - (24 - laneRise(1)) * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(20, (t) => [10 - t * 8, laneRise(1)]),
    ];
    const r = strokeToTrack(stroke);
    const turns = r.events.filter((e) => e.kind === 'turn');
    expect(turns.length).toBe(1);
    expect(turns[0].dir).toBe(1);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(0);
    // schmale Kehre ohne Tempo (oben am Hügel): eine Spur weiter hinten, danach landet der Strich am Boden
    const maxZ = Math.max(...r.points.map((p) => p.z));
    expect(maxZ).toBeGreaterThan(0.9);
    expect(maxZ).toBeLessThan(1.1);
    expect(r.points[r.points.length - 1].mode).toBe('floor');
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.loops).toBe(0);
    expect(stats.turns).toBeGreaterThanOrEqual(1);
    expect(stats.lanes).toBeGreaterThanOrEqual(2);
    // der Wagen steht nach der Kurve nicht Kopf (steile Abfahrt kippt den Oben-Vektor mit, aber nie unter null)
    expect(minUpY(s)).toBeGreaterThan(-0.1);
    expect(r.path.nodes.some((n) => n.kind === 'turn')).toBe(true);
  });
  it('liest eine Kehre, deren Rückweg den Hinweg überquert, als Steilkurve (Überführung), nicht als Looping', () => {
    // Lifthügel, Drop auf 10 m, Kehre (Rückweg 2 m höher), Rückweg kreuzt auf dem Bildschirm die Abfahrt
    const stroke = [
      ...param(20, (t) => [t * 10, 0]),
      ...param(30, (t) => [10 + t * 8, 18 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(30, (t) => [18 + t * 12, 18 - 8 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(30, (t) => [30 + t * 16, 10]),
      ...param(20, (t) => [46 + 4 * Math.sin(Math.PI * t), 10 + 4 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [46 - t * 30, 14]),
      ...param(30, (t) => [16 - t * 12, 14 - (14 - laneRise(1)) * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(20, (t) => [4 - t * 12, laneRise(1)]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(0);
    expect(r.events.filter((e) => e.kind === 'turn').length).toBe(1);
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.loops).toBe(0);
    expect(stats.lanes).toBeGreaterThanOrEqual(2);
    // steile Abfahrt (Oben-Vektor kippt mit), aber nie kopfüber
    expect(minUpY(s)).toBeGreaterThan(-0.1);
  });
  it('macht aus einer kleinen Schleife keinen Looping', () => {
    const stroke = [
      ...climb(),
      ...param(30, (t) => {
        const a = -Math.PI / 2 + Math.PI * 2 * t;
        return [50 + 2 * Math.cos(a) + t * 1.5, 22 + 2 * Math.sin(a)];
      }),
      ...param(40, (t) => [52 + t * 30, 20 - t * 20]),
      ...param(20, (t) => [82 + t * 10, 0]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(0);
    const s = sampleTrack(r.path);
    expect(trackStats(r.path, s).loops).toBe(0);
    expect(minUpY(s)).toBeGreaterThan(0.3);
  });
  it('erkennt eine Schleife in der Luft als Looping', () => {
    const stroke = [
      ...climb(),
      ...param(50, (t) => {
        const a = -Math.PI / 2 + Math.PI * 2 * t;
        return [50 + 7 * Math.cos(a) + t * 2, 27 + 7 * Math.sin(a)];
      }),
      ...param(40, (t) => [52 + t * 30, 20 - t * 20]),
      ...param(20, (t) => [82 + t * 10, 0]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(1);
    expect(r.events.filter((e) => e.kind === 'turn').length).toBe(0);
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.loops).toBe(1);
    expect(stats.lanes).toBe(1);
    // im Looping hängt der Wagen wirklich kopfüber …
    expect(minUpY(s)).toBeLessThan(-0.8);
    // … und ist danach wieder aufrecht
    const end = stateAt(s, s.length - 3);
    expect(end.upy).toBeGreaterThan(0.8);
    expect(r.path.nodes.some((n) => n.kind === 'loopApex')).toBe(true);
  });
  it('ignoriert Zittern', () => {
    const pts = Array.from({ length: 80 }, (_, i) => ({ x: i * 0.5 + (i % 3 === 0 ? -0.2 : 0), y: 12 }));
    const r = interpretStroke(pts, { startMode: 'height', startZ: 0 });
    expect(detectTurns(r, []).length).toBe(0);
  });
});

describe('Kreis schließen', () => {
  it('liest ein großes Oval, dessen Rückseite über die Bühne hinausragt, als Bodenkurve ohne Looping', () => {
    // Oval über 12 Bühnen-Meter Höhe (Bühne ist 8,4 m hoch): oben bleibt es hinterste Spur, kein Anstieg
    const H = 12;
    const stroke = [
      ...param(40, (t) => [t * 40, 0]),
      ...param(40, (t) => [40 + 9 * Math.sin(Math.PI * t), (H / 2) * (1 - Math.cos(Math.PI * t))]),
      ...param(40, (t) => [40 - t * 40, H]),
      ...param(40, (t) => [-9 * Math.sin(Math.PI * t), (H / 2) * (1 + Math.cos(Math.PI * t))]),
    ];
    const r = strokeToTrack(stroke);
    // die Kehre am Boden wird als Boden-Kehre geformt, kein Looping, kein Anstieg
    expect(r.events.every((e) => e.kind === 'turn' && e.floor)).toBe(true);
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.loops).toBe(0);
    expect(stats.turns).toBe(2);
    expect(stats.maxHeight).toBeLessThan(2);
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(false);
    expect(minUpY(s)).toBeGreaterThan(0.9);
  });
  it('liest einen von Hand geschlossenen Hügel-Rundkurs nicht als Looping', () => {
    // Hügel nach rechts, kurze Kehre am Ende, Rückweg oberhalb zurück und von oben in die Station
    const stroke = [
      ...param(20, (t) => [t * 8, 0]),
      ...param(30, (t) => [8 + t * 10, 16 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(30, (t) => [18 + t * 14, 16 - 12 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(20, (t) => [32 + t * 10, 4]),
      ...param(16, (t) => [42 + 3 * Math.sin(Math.PI * t), 4 + 3 * (1 - Math.cos(Math.PI * t)) * 0.5]),
      ...param(40, (t) => [42 - t * 36, 7]),
      ...param(20, (t) => [6 - t * 6, 7 - 7 * (1 - Math.cos(Math.PI * t)) * 0.5]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.events.filter((e) => e.kind === 'loop').length).toBe(0);
    expect(r.events.filter((e) => e.kind === 'turn').length).toBe(1);
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.loops).toBe(0);
    expect(stats.lanes).toBeGreaterThanOrEqual(2);
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(false);
    expect(minUpY(s)).toBeGreaterThan(-0.1);
  });
});

describe('Strich → Bahn', () => {
  it('lässt einen offenen Strich offen und schließt ihn erst für die Fahrt', () => {
    const stroke = stageCurve(0, 60, 120, (x) => 15 * Math.exp(-((x - 30) ** 2) / 120));
    const r = strokeToTrack(stroke);
    expect(r.path.nodes.length).toBeGreaterThan(3);
    expect(r.path.nodes[0].kind).toBe('station');
    expect(r.path.closed).toBe(false);
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(false);
    // offen abgetastet: endet am letzten Knoten
    const open = sampleTrack(r.path);
    const endNode = r.path.nodes[r.path.nodes.length - 1];
    const last = stateAt(open, open.length - 0.01);
    expect(Math.hypot(last.x - endNode.x, last.y - endNode.y)).toBeLessThan(0.5);
    closeTrack(r.path);
    expect(r.path.closed).toBe(true);
    const samples = sampleTrack(r.path);
    const stats = trackStats(r.path, samples);
    expect(stats.maxHeight).toBeGreaterThan(13);
    expect(stats.maxHeight).toBeLessThan(16.5);
    expect(stats.loops).toBe(0);
    const a = stateAt(samples, 0);
    const b = stateAt(samples, samples.length - 0.01);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
    // offener Strich → automatischer Rückweg über die Nachbarspur, der nicht als Kurve zählt
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(true);
    expect(stats.turns).toBe(0);
    expect(stats.lanes).toBe(1);
  });
  it('schließt ein Oval am Boden direkt und zählt zwei Kurven', () => {
    const R = laneRise(1);
    const stroke = [
      ...param(40, (t) => [t * 30, 0]),
      ...param(30, (t) => [30 + R * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(40, (t) => [30 - t * 30, 2 * R]),
      ...param(30, (t) => [-R * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
    ];
    const r = strokeToTrack(stroke);
    expect(r.path.nodes.some((n) => n.kind === 'closeReturn')).toBe(false);
    expect(r.path.closed).toBe(true);
    // die Einfahrt in die Station kommt geradeaus (Halbkreis um die Station), ohne Schlenker
    expect(r.path.nodes[0].inX).toBeLessThan(0);
    expect(Math.abs(r.path.nodes[0].inZ)).toBeLessThan(0.05);
    const s = sampleTrack(r.path);
    const stats = trackStats(r.path, s);
    expect(stats.turns).toBe(2);
    expect(stats.loops).toBe(0);
    // Spuren zählen nur, wo die Bahn längs läuft: vorne (0) und hinten (2)
    expect(stats.lanes).toBe(2);
    expect(stats.maxHeight).toBeLessThan(1.5);
    expect(minUpY(s)).toBeGreaterThan(0.9);
  });
  it('rastet Tiefen nahe einer Spur magnetisch ein und bleibt dazwischen stetig', () => {
    expect(magnetLane(0.1)).toBe(0);
    expect(magnetLane(1.85)).toBe(2);
    expect(magnetLane(-0.15)).toBe(-0);
    expect(magnetLane(0.5)).toBeCloseTo(0.5, 6);
    expect(magnetLane(0.35)).toBeCloseTo(0.25, 6);
    let prev = magnetLane(-2);
    for (let z = -2; z <= 2; z += 0.01) {
      const v = magnetLane(z);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(Math.abs(v - prev)).toBeLessThan(0.03);
      prev = v;
    }
  });
  it('entfernt kleine Rückwärts-Haken aus dem Strich, behält echte Kehren', () => {
    const line = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0 }));
    // Haken bei x=20: 1,5 m zurück, dann weiter
    const hook = [...line.slice(0, 21), { x: 19.5, y: 0.4 }, { x: 19, y: 0.6 }, { x: 19.5, y: 0.8 }, ...line.slice(21)];
    const cleaned = removeHooks(hook, 3);
    expect(cleaned.every((p, i) => i === 0 || p.x >= cleaned[i - 1].x)).toBe(true);
    // echte Kehre (8 m zurück) bleibt
    const turn = [...line.slice(0, 21), ...Array.from({ length: 8 }, (_, i) => ({ x: 19 - i, y: 3 }))];
    expect(removeHooks(turn, 3).length).toBe(turn.length);
  });
  it('setzt eine offene Bahn am Ende fort und schließt sie, wenn der Strich zur Station führt', () => {
    const r = strokeToTrack(stageCurve(0, 30, 60, (x) => 15 * Math.exp(-((x - 15) ** 2) / 40)));
    expect(r.path.closed).toBe(false);
    const end = r.path.nodes[r.path.nodes.length - 1];
    const se = toStage(end.x, end.y, end.z);
    // vom Ende aus am Boden weiter nach rechts (offen bleibt offen)
    const ext = extendTrack(r.path, param(30, (t) => [se.X + t * 20, se.Y]));
    expect(ext).not.toBeNull();
    expect(ext!.closed).toBe(false);
    expect(ext!.nodes.length).toBeGreaterThan(r.path.nodes.length);
    // Bogen über die hintere Spur zurück zur Station → geschlossen
    const R = laneRise(1);
    const back = extendTrack(ext!, [
      ...param(20, (t) => [se.X + 20 + 7 * Math.sin(Math.PI * t), R - R * Math.cos(Math.PI * t)]),
      ...param(40, (t) => [se.X + 20 - t * (se.X + 20), 2 * R]),
      ...param(20, (t) => [-7 * Math.sin(Math.PI * t), R + R * Math.cos(Math.PI * t)]),
    ]);
    expect(back).not.toBeNull();
    expect(back!.closed).toBe(true);
    const stats = trackStats(back!, sampleTrack(back!));
    expect(stats.loops).toBe(0);
  });
  it('hebt die Bahn über das Terrain', () => {
    // Berg von x=20 bis 40, 5 m hoch, auf allen Spuren; der Strich folgt der Silhouette
    const ground = (x: number) => (x > 20 && x < 40 ? 5 * Math.sin(((x - 20) / 20) * Math.PI) : 0);
    const stroke = stageCurve(0, 60, 120, (x) => ground(x) + 0.2);
    const r = strokeToTrack(stroke, { groundHeight: ground, groundClearance: 0.8 });
    closeTrack(r.path);
    const s = sampleTrack(r.path);
    let minClearance = Infinity;
    let maxY = 0;
    for (let i = 0; i < s.count; i++) {
      if (s.auto[i]) continue;
      minClearance = Math.min(minClearance, s.y[i] - ground(s.x[i]));
      maxY = Math.max(maxY, s.y[i]);
    }
    expect(minClearance).toBeGreaterThan(0.2);
    expect(maxY).toBeGreaterThan(5.2);
    expect(trackStats(r.path, s).lanes).toBe(1);
  });
});

describe('Überzeichnen', () => {
  const flat = () => strokeToTrack(stageCurve(0, 80, 100, () => 0)).path;
  it('ersetzt nur den überzeichneten Abschnitt durch einen Hügel', () => {
    // offene Bahn (Strich endet weit weg vom Start)
    const base = flat();
    const before = sampleTrack(base);
    const y0 = base.nodes[0].y; // Bahn liegt um die Mindesthöhe über dem Boden
    const stroke = stageCurve(30, 50, 40, (x) => y0 + 10 * Math.sin(((x - 30) / 20) * Math.PI));
    const merged = applyOverdraw(base, stroke);
    expect(merged).not.toBeNull();
    const after = sampleTrack(merged!);
    const stats = trackStats(merged!, after);
    expect(stats.maxHeight).toBeGreaterThan(9);
    let maxOutside = 0;
    let maxZ = 0;
    for (let i = 0; i < after.count; i++) {
      if (after.auto[i]) continue;
      if (after.x[i] < 25 || after.x[i] > 55) maxOutside = Math.max(maxOutside, after.y[i]);
      maxZ = Math.max(maxZ, Math.abs(after.z[i]));
    }
    expect(maxOutside).toBeLessThan(3);
    expect(maxZ).toBeLessThan(0.3);
    expect(after.length).toBeGreaterThan(before.length);
    // offene Bahn: Knoten bleiben in Fahrtrichtung geordnet (Ende bleibt Ende), keine Schleifen
    expect(merged!.closed).toBe(false);
    expect(merged!.nodes.every((n, i) => i === 0 || n.x >= merged!.nodes[i - 1].x - 0.5)).toBe(true);
    expect(stats.loops).toBe(0);
  });
  it('lehnt einen Strich fern der Bahn ab', () => {
    const base = flat();
    const stroke = stageCurve(30, 50, 20, () => 40);
    expect(applyOverdraw(base, stroke)).toBeNull();
  });
  it('verlegt einen Abschnitt am Boden in eine andere Spur', () => {
    const base = flat();
    const y0 = base.nodes[0].y;
    // Bogen nach hinten: auf der Bahn starten, bis Spur 1 hoch, wieder zurück auf die Bahn
    const k1 = laneScale(1);
    const stroke = param(60, (t) => [20 + t * 40, y0 + (laneRise(1) + y0 * k1 - y0) * Math.sin(Math.PI * t)]);
    const merged = applyOverdraw(base, stroke);
    expect(merged).not.toBeNull();
    const after = sampleTrack(merged!);
    let maxZ = 0;
    let maxY = 0;
    for (let i = 0; i < after.count; i++) {
      if (after.auto[i]) continue;
      maxZ = Math.max(maxZ, after.z[i]);
      maxY = Math.max(maxY, after.y[i]);
    }
    expect(maxZ).toBeGreaterThan(0.8);
    expect(maxY).toBeLessThan(1.5);
  });
});
