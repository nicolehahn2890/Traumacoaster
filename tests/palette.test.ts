import { describe, expect, it } from 'vitest';
import { WORLDS } from '@/levels/worlds';
import { atmosphereStep, isHexColor, luminance, tones } from '@/render/palette';

describe('Paletten der Welten', () => {
  it('haben für jede Welt alle Tokens als gültige Hex-Farben', () => {
    expect(WORLDS.length).toBe(10);
    for (const w of WORLDS) {
      const p = w.palette;
      for (const c of [...p.sky, ...p.ground, p.accent, p.ink, p.glow, p.stipple]) expect(isHexColor(c), `${w.name}: ${c}`).toBe(true);
      expect(p.sky).toEqual(w.sky);
      expect(p.ground).toEqual(w.ground);
      // Tinte ist dunkler als der Boden, Leuchten heller als die Tinte
      expect(luminance(p.ink)).toBeLessThan(luminance(p.ground[0]));
      expect(luminance(p.glow)).toBeGreaterThan(luminance(p.ink));
    }
  });
  it('liefert harte Töne von hell nach dunkel', () => {
    const t = tones('#7cc242');
    expect(t.length).toBe(3);
    expect(luminance(t[0])).toBeGreaterThan(luminance(t[1]));
    expect(luminance(t[1])).toBeGreaterThan(luminance(t[2]));
    expect(t[1].toLowerCase()).toBe('#7cc242');
  });
  it('stuft die Luftperspektive nach hinten in Richtung Himmel', () => {
    const front = atmosphereStep('#4f9a2e', -2, '#cdefff');
    const back = atmosphereStep('#4f9a2e', 2, '#cdefff');
    expect(front.toLowerCase()).toBe('#4f9a2e');
    expect(luminance(back)).toBeGreaterThan(luminance(front));
  });
});
