import { describe, expect, it } from 'vitest';
import { harmonyHues, hsvToHex, hsvToRgb, rgbToHsv } from '@/zoneeditor/colorMenu';
import { bakeSwatch, newPlane, newShape, rectPath, setFaceFill, shapeFaces, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { hexToRgb, type GradientFill, type ZoneStyle, type ZoneSwatch } from '@/zone/paint';

describe('Farbmenü: Farbräume', () => {
  it('HSB und RGB laufen verlustfrei hin und zurück', () => {
    for (const hex of ['#3d5a63', '#ff0000', '#00ff80', '#123456', '#ffffff', '#000000', '#a3665a']) {
      const [h, s, v] = rgbToHsv(...hexToRgb(hex));
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 1, 0]);
    expect(rgbToHsv(0, 0, 1)[0]).toBe(240);
  });

  it('Harmonien drehen den Farbton und bleiben im Kreis', () => {
    expect(harmonyHues(350, 'triad')).toEqual([350, 110, 230]);
    expect(harmonyHues(10, 'analog')).toEqual([340, 10, 40]);
    expect(harmonyHues(200, 'complement')).toEqual([200, 20]);
  });
});

describe('Zonenpalette', () => {
  it('ein gelöschtes Feld hinterlässt seinen Wert überall, wo es benutzt wurde', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    nodes.push({ id: 'c1', kind: 'swatch', name: 'Fels', color: '#aa3355' } as ZoneSwatch);
    const s = newShape(nodes, 'p1', rectPath(4, 2), 0, 0, '@c1');
    s.fills = [{ type: 'gradient', stops: [{ t: 0, color: '@c1', a: 1 }, { t: 1, color: '#ffffff', a: 1 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 }];
    s.regions = [{ x: 1, y: 0, fill: '@c1' }];
    nodes.push(s);
    nodes.push({ id: 'y1', kind: 'style', name: 'Stil', fill: '@c1' } as ZoneStyle);
    bakeSwatch(nodes, 'c1');
    expect(s.fill).toBe('#aa3355');
    expect((s.fills[0] as GradientFill).stops[0].color).toBe('#aa3355');
    expect(s.regions[0].fill).toBe('#aa3355');
    expect((nodes.find((n) => n.id === 'y1') as ZoneStyle).fill).toBe('#aa3355');
  });

  it('eine Form aus einer Fläche bekommt die Farbe selbst, ohne Füllpunkt', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s: ZoneShape = newShape(nodes, 'p1', rectPath(4, 2), 0, 0, '#445566');
    setFaceFill(s, shapeFaces(s)[0], '#ff0000');
    expect(s.fill).toBe('#ff0000');
    expect(s.regions).toBeUndefined();
  });
});
