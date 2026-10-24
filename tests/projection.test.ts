import { afterEach, describe, expect, it } from 'vitest';
import { DEPTH_VIEW, LANE_DEPTH, LANE_MAX, LANE_MIN, laneRatio, mixPoint, rayToWorld, setPerspective, setView, tagRay, toLane, toLaneOf, toStage, toView, toWorld, viewDistance, viewScale, type StagePoint } from '@/track/stage';
import { planBrushTrack } from '@/track/brushTrack';
import { Terrain } from '@/physics/terrain';

const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] } as never);
const ground = (x: number, z: number) => flat.groundHeight(x, z);

/** deterministische Zufallszahlen */
function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

afterEach(() => setPerspective(false));

describe('Projektions-Adapter (Richtlinie, Schritt 1)', () => {
  it('ohne Perspektive sind Ansicht, Spur-Container und Bühne identisch (100 Punkte)', () => {
    setPerspective(false);
    setView(40, 10, 200);
    const r = lcg(1);
    for (let i = 0; i < 100; i++) {
      const x = r() * 200;
      const y = r() * 30;
      const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
      const a = toStage(x, y, z);
      const b = toView(x, y, z);
      const c = toLane(x, y, z);
      expect(b.X).toBeCloseTo(a.X, 9);
      expect(b.Y).toBeCloseTo(a.Y, 9);
      expect(c.X).toBeCloseTo(a.X, 9);
      expect(c.Y).toBeCloseTo(a.Y, 9);
      const w = rayToWorld(tagRay(a), z);
      const w0 = toWorld(a.X, a.Y, z);
      expect(w.x).toBeCloseTo(w0.x, 9);
      expect(w.y).toBeCloseTo(w0.y, 9);
      expect(viewScale(z)).toBe(1);
    }
  });

  it('Kameraabstand und Spurmaßstab wie im Tiefen-Labor (22° bei 8 px/m, 540 px hoch)', () => {
    setPerspective(true, 22);
    const D = viewDistance(8, 540);
    expect(D).toBeCloseTo(173.6, 0);
    setView(90, 8, D);
    // Labor: Spur −2 → +2 waagerecht 8,76 → 7,36 px/m bei 8 px/m auf Spur 0
    expect(viewScale(-2) * 8).toBeCloseTo(8.76, 1);
    expect(viewScale(2) * 8).toBeCloseTo(7.36, 1);
    expect(DEPTH_VIEW).toBeCloseTo(LANE_DEPTH * Math.cos(Math.atan(0.5)), 9);
  });

  it('mit Perspektive kehren Strahl und Ansicht sich um (100 Punkte, zufällige Kameras)', () => {
    setPerspective(true, 20);
    const r = lcg(7);
    for (let i = 0; i < 100; i++) {
      setView(r() * 200, r() * 30 - 5, 80 + r() * 300);
      const x = r() * 200;
      const y = r() * 30 - 5;
      const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
      const ray = tagRay(toView(x, y, z));
      const w = rayToWorld(ray, z);
      expect(w.x).toBeCloseTo(x, 7);
      expect(w.y).toBeCloseTo(y, 7);
    }
  });

  it('die Kamera darf nach dem Aufsetzen weiterziehen: der Strahl behält seine Kamera', () => {
    setPerspective(true, 20);
    setView(50, 8, 150);
    const ray = tagRay(toView(70, 12, 1.5));
    // Kamera fährt weiter (Autoscroll), der Strahl zeigt noch auf denselben Weltpunkt
    setView(90, 12, 150);
    const w = rayToWorld(ray, 1.5);
    expect(w.x).toBeCloseTo(70, 7);
    expect(w.y).toBeCloseTo(12, 7);
  });

  it('Spur-Container: ganze Spuren brauchen keine Korrektur, Zwischentiefen die Verhältniszahl', () => {
    setPerspective(true, 22);
    setView(60, 6, 180);
    for (let lane = LANE_MIN; lane <= LANE_MAX; lane++) {
      const a = toStage(100, 10, lane);
      const b = toLane(100, 10, lane);
      expect(b.X).toBeCloseTo(a.X, 9);
      expect(b.Y).toBeCloseTo(a.Y, 9);
      expect(laneRatio(lane)).toBeCloseTo(1, 9);
    }
    // Zwischentiefe: Container-Maßstab mal Korrektur ergibt die Ansicht
    const z = 0.5;
    const s = viewScale(Math.round(z));
    const l = toLane(100, 10, z);
    const v = toView(100, 10, z);
    expect(60 + (l.X - 60) * s).toBeCloseTo(v.X, 9);
    expect(6 + (l.Y - 6) * s).toBeCloseTo(v.Y, 9);
  });

  it('Stückgrenze: derselbe Punkt landet aus beiden Spur-Containern am selben Ort (keine Risse an Spurwechseln)', () => {
    setPerspective(true, 24);
    setView(70, 9, 90);
    const r = lcg(3);
    for (let i = 0; i < 100; i++) {
      const x = r() * 200;
      const y = r() * 25;
      const lane = LANE_MIN + Math.floor(r() * (LANE_MAX - LANE_MIN));
      const z = lane + 0.5; // genau auf der Rundungsgrenze: gehört beiden Stücken
      const a = toLaneOf(x, y, z, lane);
      const b = toLaneOf(x, y, z, lane + 1);
      const sa = viewScale(lane);
      const sb = viewScale(lane + 1);
      // Anzeige = Kameraziel + (Containerpunkt − Kameraziel) · Containermaßstab
      expect(70 + (a.X - 70) * sa).toBeCloseTo(70 + (b.X - 70) * sb, 9);
      expect(9 + (a.Y - 9) * sa).toBeCloseTo(9 + (b.Y - 9) * sb, 9);
      const v = toView(x, y, z);
      expect(70 + (a.X - 70) * sa).toBeCloseTo(v.X, 9);
      expect(9 + (a.Y - 9) * sa).toBeCloseTo(v.Y, 9);
    }
  });

  it('mixPoint mischt Lage und Kamera, fehlende Kameras werden übernommen', () => {
    const a: StagePoint = { X: 0, Y: 0, cx: 10, cy: 0 };
    const b: StagePoint = { X: 10, Y: 10, cx: 20, cy: 10 };
    const m = mixPoint(a, b, 0.25);
    expect(m).toEqual({ X: 2.5, Y: 2.5, cx: 12.5, cy: 2.5 });
    const n = mixPoint({ X: 0, Y: 0 }, b, 0.5);
    expect(n.cx).toBe(20);
  });

  it('Pinsel in Perspektive: die geplante Bahn liegt auf dem gezeichneten Strich (Ansicht) wie ohne Perspektive', () => {
    const line = (): StagePoint[] => {
      const pts: StagePoint[] = [];
      for (let x = 10; x <= 90; x += 0.5) pts.push({ X: x, Y: 2 + 10 * Math.exp(-((x - 50) ** 2) / 200) });
      return pts;
    };
    const opts = { ground, clearance: 0.8, closeSnap: 8, tolerance: 0.5 };
    const maxOffset = (): number => {
      const plan = planBrushTrack(line().map((p) => tagRay(p)), opts);
      expect(plan).not.toBeNull();
      let worst = 0;
      for (const n of plan!.path.nodes) {
        const v = toView(n.x, n.y, n.z);
        // nächster Strichpunkt
        let best = Infinity;
        for (const p of line()) best = Math.min(best, Math.hypot(p.X - v.X, p.Y - v.Y));
        worst = Math.max(worst, best);
      }
      return worst;
    };
    setPerspective(false);
    setView(50, 6, Infinity);
    const flatOffset = maxOffset();
    setPerspective(true, 22);
    setView(50, 6, viewDistance(8, 540));
    const perspOffset = maxOffset();
    expect(flatOffset).toBeLessThan(2.5);
    expect(perspOffset).toBeLessThan(2.5);
  });
});
