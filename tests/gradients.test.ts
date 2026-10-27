import { describe, expect, it } from 'vitest';
import { addStop, lineT, moveStop, readGradient, removeGradient, removeStop, reverseStops, setMid, topGradient, writeGradient } from '@/zone/gradients';
import { newPlane, newShape, rectPath, shapeFaces, type ZoneNode } from '@/zone/nodes';
import type { GradientFill, GradientStop, ZoneStyle, ZoneSwatch } from '@/zone/paint';

const none = new Map<string, ZoneSwatch>();
const noStyles = new Map<string, ZoneStyle>();
const two: GradientStop[] = [
  { t: 0, color: '#000000', a: 1 },
  { t: 1, color: '#ffffff', a: 1 },
];

describe('Verlaufswerkzeug', () => {
  it('ein neuer Verlauf liegt in Pfad-Koordinaten der Form und kommt in Ebenen-Koordinaten zurück', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, 'p1', rectPath(4, 2), 10, 5, '#445566');
    s.sx = 2;
    const t = { shape: s, face: null };
    expect(writeGradient(t, 'gradient', noStyles, { line: { x0: 8, y0: 5, x1: 12, y1: 5 } }, () => two)).toBe(true);
    expect(s.fills?.[0]).toMatchObject({ type: 'gradient', x0: -1, y0: 0, x1: 1, y1: 0 });
    expect(readGradient(t, 'gradient', noStyles)?.line).toEqual({ x0: 8, y0: 5, x1: 12, y1: 5 });
    // ein zweites Ziehen ändert denselben Verlauf, kein zweiter
    writeGradient(t, 'gradient', noStyles, { line: { x0: 10, y0: 4, x1: 10, y1: 6 }, radial: true }, () => two);
    expect(s.fills?.length).toBe(1);
    expect((s.fills?.[0] as GradientFill).radial).toBe(true);
    expect(topGradient(s.fills, 'fade')).toBe(-1);
    removeGradient(t, 'gradient', noStyles);
    expect(s.fills).toBeUndefined();
  });

  it('eine Fläche bekommt ihren Verlauf über ihren Füllpunkt, die andere bleibt', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, 'p1', rectPath(4, 2), 0, 0, '#445566');
    s.cuts = [{ path: [{ x: -2, y: 0 }, { x: 2, y: 0 }], closed: false }];
    const [a, b] = shapeFaces(s);
    writeGradient({ shape: s, face: a }, 'fade', noStyles, { line: { x0: -2, y0: 0, x1: 2, y1: 0 } }, () => two);
    expect(s.regions?.length).toBe(1);
    expect(readGradient({ shape: s, face: a }, 'fade', noStyles)).not.toBeNull();
    expect(readGradient({ shape: s, face: b }, 'fade', noStyles)).toBeNull();
  });

  it('Stopps: einsetzen mit der Farbe an der Stelle, schieben bis zum Nachbarn, löschen bis auf zwei, Mitte, umkehren', () => {
    const { stops, index } = addStop(two, 0.5, none, 'day');
    expect(index).toBe(1);
    expect(stops[1].color).toBe('#808080');
    expect(moveStop(stops, 1, 1.4)[1].t).toBe(1);
    expect(moveStop(stops, 0, 0.7)[0].t).toBe(0.5);
    expect(removeStop(stops, 1).length).toBe(2);
    expect(removeStop(two, 0).length).toBe(2);
    const mid = setMid(two, 0, 0.3);
    expect(mid[0].mid).toBe(0.3);
    const rev = reverseStops(mid);
    expect(rev.map((s) => [s.t, s.color])).toEqual([
      [0, '#ffffff'],
      [1, '#000000'],
    ]);
    expect(rev[0].mid).toBe(0.7);
    expect(lineT({ x0: 0, y0: 0, x1: 10, y1: 0 }, 2.5, 7)).toBe(0.25);
  });
});
