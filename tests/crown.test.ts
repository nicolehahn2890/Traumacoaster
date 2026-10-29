import { describe, expect, it } from 'vitest';
import { cachedCrownPoints, crownColor, crownPoints, CROWN_DEFAULT, CROWN_STRIDE, parseCrown, serializeCrown, type CrownParams } from '@/zone/crown';
import { ellipsePath, newPlane, newShape, planesOf, shapeFaces, type ZoneNode } from '@/zone/nodes';

/** Ellipse 10 × 6 m als Krone */
function crown(): { faces: ReturnType<typeof shapeFaces> } {
  const nodes: ZoneNode[] = [newPlane([], 0)];
  const s = newShape(nodes, planesOf(nodes)[0].id, ellipsePath(5, 3), 0, 0, '#2f5a2a');
  return { faces: shapeFaces(s) };
}

const UP_LEFT: [number, number] = [Math.cos((125 * Math.PI) / 180), Math.sin((125 * Math.PI) / 180)];

describe('Punktkronen', () => {
  it('liest und schreibt die Werte, Kaputtes gekappt', () => {
    const c: CrownParams = { ...CROWN_DEFAULT, size: 0.5, seed: 4, hidden: true };
    expect(parseCrown(JSON.parse(JSON.stringify(serializeCrown(c))))).toEqual(c);
    expect(parseCrown({ size: 99, gap: 0.1, density: 3 })).toMatchObject({ size: 10, gap: 0.8, density: 1 });
    expect(parseCrown(null)).toBeUndefined();
  });

  it('Punkte halten Abstand, liegen in der Krone oder knapp darüber hinaus', () => {
    const { faces } = crown();
    const p = { ...CROWN_DEFAULT, density: 1 };
    const pts = crownPoints(faces, 1, 1, p, UP_LEFT);
    const n = pts.length / CROWN_STRIDE;
    expect(n).toBeGreaterThan(60);
    let minD = Infinity;
    for (let i = 0; i < n; i++) {
      const x = pts[i * CROWN_STRIDE];
      const y = pts[i * CROWN_STRIDE + 1];
      // Ellipse 5 × 3 (Halbachsen) plus out, mit etwas Luft für die Zellen des Kantenabstands
      expect((x / (5 + p.out + 0.15)) ** 2 + (y / (3 + p.out + 0.15)) ** 2).toBeLessThanOrEqual(1);
      for (let j = i + 1; j < n; j++) minD = Math.min(minD, Math.hypot(x - pts[j * CROWN_STRIDE], y - pts[j * CROWN_STRIDE + 1]));
    }
    expect(minD).toBeGreaterThanOrEqual(p.size * p.gap * 0.999);
  });

  it('dicht an der Lichtkante, spärlich und dunkler auf der Schattenseite', () => {
    const { faces } = crown();
    const pts = crownPoints(faces, 1, 1, { ...CROWN_DEFAULT, reach: 2 }, UP_LEFT);
    const n = pts.length / CROWN_STRIDE;
    let lit = 0;
    let dark = 0;
    let litStep = 0;
    let darkStep = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * CROWN_STRIDE];
      const y = pts[i * CROWN_STRIDE + 1];
      const step = pts[i * CROWN_STRIDE + 3];
      // oben links (zum Licht) gegen unten rechts
      if (x * UP_LEFT[0] + y * UP_LEFT[1] > 1.5) {
        lit++;
        litStep += step;
      } else if (x * UP_LEFT[0] + y * UP_LEFT[1] < -1.5) {
        dark++;
        darkStep += step;
      }
    }
    expect(lit).toBeGreaterThan(dark * 1.3);
    expect(litStep / Math.max(1, lit)).toBeGreaterThan(darkStep / Math.max(1, dark) + 0.5);
  });

  it('gleiche Eingaben, gleiche Punkte (auch aus dem Zwischenspeicher); anderer Samen, anderes Muster', () => {
    const { faces } = crown();
    const a = crownPoints(faces, 1, 1, CROWN_DEFAULT, UP_LEFT);
    expect(crownPoints(faces, 1, 1, CROWN_DEFAULT, UP_LEFT)).toEqual(a);
    expect(cachedCrownPoints(faces, 1, 1, CROWN_DEFAULT, UP_LEFT)).toBe(cachedCrownPoints(faces, 1, 1, CROWN_DEFAULT, UP_LEFT));
    expect(crownPoints(faces, 1, 1, { ...CROWN_DEFAULT, seed: 2 }, UP_LEFT)).not.toEqual(a);
  });

  it('Tonstufen werden zur hellsten hin heller und behalten den Farbton', () => {
    const base: [number, number, number] = [0.18, 0.35, 0.16];
    const light: [number, number, number] = [1, 0.95, 0.8];
    const [s0, s1, s2] = [0, 1, 2].map((k) => crownColor(base, light, 0.8, k));
    expect(s0[1]).toBeLessThan(base[1]);
    expect(s0[1]).toBeLessThan(s1[1]);
    expect(s1[1]).toBeLessThan(s2[1]);
    // grün bleibt grün, die hellste Stufe geht ins Gelbe (mehr Rot als die Krone, wenig Blau)
    expect(s2[1]).toBeGreaterThan(s2[0]);
    expect(s2[1]).toBeGreaterThan(s2[2]);
    expect(s2[0] / s2[1]).toBeGreaterThan(base[0] / base[1]);
  });
});
