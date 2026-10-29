import { describe, expect, it } from 'vitest';
import { bakeSwatch, ellipsePath, lightIn, lightOf, newPlane, newShape, parseNodes, planesOf, rectPath, serializeNodes, cloneNodes, setFacePaint, shapeFaces, LIGHT_DEFAULT, type ZoneLight, type ZoneNode } from '@/zone/nodes';
import { bandT, cloneFill, evalLayers, layersNeedEdge, mapFillPoints, MAX_LAYERS, MIST_MAX, mistAt, parseFill, serializeFill, visibleLayers, type DotsFill, type GradientFill, type MistDab, type MistFill, type ZoneFill, type ZoneSwatch } from '@/zone/paint';
import { decodeEdge, edgeAtPoint, edgeRaster, encodeEdge, EDGE_IN, faceEdge } from '@/zone/edgeDistance';
import { EdgeAtlas, grainTiles, rankTile } from '@/world/earleTextures';
import { applyPreset, autoPreset, presetLayers, type EarleContext } from '@/zone/earle';
import { fillParams, setFillParam } from '@/zoneeditor/fillParams';
import { layerTokens, mistSlots, PlaneLayer, specialFragment } from '@/world/planeMesh';
import type { Poly } from '@/zone/path';

const none = new Map<string, ZoneSwatch>();
const square = (w: number, h: number): Poly => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const circle = (r: number, n = 128): Poly => Array.from({ length: n }, (_, i): [number, number] => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]);

describe('Earle-Füllungen in der Zonendatei', () => {
  it('Lichtkante, Innenschatten, Pünktchen, Papier und die Verlaufs-Extras kommen unverändert zurück', () => {
    const fills: ZoneFill[] = [
      { type: 'gradient', edge: true, steps: 4, inner: 0.3, wave: 0.4, stops: [{ t: 0, color: '#ffffff', a: 1 }, { t: 1, color: '#000000', a: 1 }], x0: 0, y0: 0, x1: 3, y1: 0, blend: 'normal', opacity: 1 },
      { type: 'light', width: 0.6, soft: 0.1, blend: 'screen', opacity: 0.5 },
      { type: 'shade', width: 2, soft: 0, color: '@c2', blend: 'multiply', opacity: 0.4 },
      { type: 'dots', size: 0.3, gap: 1.8, density: 0.7, jitter: 0.35, source: 'shade', reach: 2.5, tone: -0.4, seed: 7, blend: 'normal', opacity: 1 },
      { type: 'grain', tile: 'gouache', scale: 9, angle: 30, blend: 'softLight', opacity: 0.45, hidden: true },
    ];
    for (const f of fills) expect(parseFill(JSON.parse(JSON.stringify(serializeFill(f))))).toEqual(f);
  });

  it('Kaputtes wird gekappt statt verworfen, Unbekanntes fällt weg', () => {
    const d = parseFill({ type: 'dots', size: -1, gap: 99, density: 3, source: 'nirgends', tone: 5, seed: 1e9 }) as DotsFill;
    expect(d).toMatchObject({ size: 0.02, gap: 6, density: 1, source: 'even', tone: 1, seed: 9999 });
    expect(parseFill({ type: 'light' })).toMatchObject({ type: 'light', width: 1, soft: 0 });
    expect(parseFill({ type: 'nebel' })).toBeNull();
    // ein Kantenverlauf ist nie zugleich radial
    expect(parseFill({ type: 'gradient', edge: true, radial: true, stops: [{ t: 0, color: '#000000' }, { t: 1, color: '#ffffff' }], x0: 0, y0: 0, x1: 1, y1: 0 })).not.toHaveProperty('radial');
  });

  it('Kopieren, Griffe abbilden und Kürzen verdeckter Schichten kennen die Earle-Schichten', () => {
    const dots: DotsFill = { type: 'dots', size: 0.3, gap: 1.8, density: 0.7, jitter: 0.3, source: 'even', reach: 3, tone: 0, seed: 1, blend: 'normal', opacity: 1 };
    const c = cloneFill(dots) as DotsFill;
    c.size = 2;
    expect(dots.size).toBe(0.3);
    const fills: ZoneFill[] = [dots, { type: 'color', color: '#112233', blend: 'normal', opacity: 1 }];
    mapFillPoints(fills, (x, y) => [x + 1, y]);
    expect(fills[0]).toEqual(dots);
    // eine deckende Farbe über den Pünktchen verdeckt sie; Pünktchen darüber verdecken nichts
    expect(visibleLayers(fills)).toHaveLength(1);
    expect(visibleLayers([...fills].reverse())).toHaveLength(2);
    expect(layersNeedEdge([dots])).toBe(false);
    expect(layersNeedEdge([{ ...dots, source: 'light' }])).toBe(true);
  });

  it('Bänder: harte Stufen mit dem Verlauf in der Stufe; die Pipette rechnet sie mit, Earle-Schichten nicht', () => {
    expect([0, 0.2, 0.49, 0.51, 0.99, 1].map((t) => bandT(t, 2, 0))).toEqual([0, 0, 0, 1, 1, 1]);
    expect([0.1, 0.3, 0.6, 0.9].map((t) => bandT(t, 4, 0))).toEqual([0, 1 / 3, 2 / 3, 1]);
    // in der Stufe läuft inner des Abstands weiter, an der Grenze springt es
    expect(bandT(0.49, 4, 0.4)).toBeGreaterThan(bandT(0.26, 4, 0.4));
    expect(bandT(0.51, 4, 0.4) - bandT(0.49, 4, 0.4)).toBeGreaterThan(0.18);
    const g: GradientFill = { type: 'gradient', steps: 2, inner: 0, stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#ffffff', a: 1 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 };
    expect(evalLayers([g], 0.4, 0, none).rgb[0]).toBe(0);
    expect(evalLayers([g], 0.6, 0, none).rgb[0]).toBe(1);
    const light: ZoneFill = { type: 'light', width: 1, soft: 0, color: '#ff0000', blend: 'normal', opacity: 1 };
    expect(evalLayers([{ type: 'color', color: '#336699', blend: 'normal', opacity: 1 }, light], 0, 0, none).rgb.map((v) => Math.round(v * 255))).toEqual([0x33, 0x66, 0x99]);
  });
});

describe('Kantenabstand', () => {
  it('Kodierung: außen und innen gekappt, Bytes zurück in Meter', () => {
    expect(encodeEdge(-99)).toBe(0);
    expect(encodeEdge(99)).toBe(255);
    expect(decodeEdge(encodeEdge(3))).toBeCloseTo(3, 1);
  });

  // Auf der Mittellinie (dem First des Abstandsfelds) schneidet bilineares Lesen die Spitze um bis zu eine halbe Zelle ab;
  // überall sonst ist der Abstand bis auf die Kodierung (7 cm) genau
  it('Rechteck: Abstand zur nächsten Seite, außen negativ, auf dem First höchstens eine halbe Zelle zu knapp', () => {
    const r = edgeRaster(square(10, 6), [], 1, 1);
    expect(edgeAtPoint(r, 0, 1.2)).toBeCloseTo(1.8, 1);
    expect(edgeAtPoint(r, 4, 0)).toBeCloseTo(1, 1);
    expect(edgeAtPoint(r, 0, 2.5)).toBeCloseTo(0.5, 1);
    expect(edgeAtPoint(r, 5.3, 0)).toBeLessThan(0);
    expect(edgeAtPoint(r, 0, 0)).toBeGreaterThan(3 - r.texel / 2 - 0.04);
    expect(edgeAtPoint(r, 0, 0)).toBeLessThan(3.04);
  });

  it('Kreis: Abstand = Radius minus Mittenabstand, auch weit innen glatt', () => {
    const r = edgeRaster(circle(6), [], 1, 1);
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      const a = k * 0.37;
      const rho = 0.6 + (k % 10) * 0.55;
      worst = Math.max(worst, Math.abs(edgeAtPoint(r, rho * Math.cos(a), rho * Math.sin(a)) - (6 - rho)));
    }
    // Zelle 0,25 m, Kodierung 7 cm, Kreis aus 128 Strecken: unter 8 cm
    expect(worst).toBeLessThan(0.08);
  });

  it('Loch: der Ring hat innen Abstand zu beiden Rändern, im Loch ist außen', () => {
    const r = edgeRaster(square(20, 20), [square(10, 10)], 1, 1);
    expect(edgeAtPoint(r, 6.5, 0)).toBeCloseTo(1.5, 1);
    expect(edgeAtPoint(r, 9, 0)).toBeCloseTo(1, 1);
    expect(edgeAtPoint(r, 0, 0)).toBeLessThan(0);
  });

  it('Maßstab der Form: doppelt so breit heißt doppelt so weit (Meter der Ebene), gespiegelt bleibt gleich', () => {
    const a = edgeRaster(square(4, 4), [], 2, 2);
    expect(edgeAtPoint(a, 2, 0)).toBeCloseTo(2, 1);
    const b = edgeRaster(square(4, 4), [], -2, 2);
    expect(edgeAtPoint(b, 2, 0)).toBeCloseTo(2, 1);
  });

  it('große Flächen bekommen gröbere Zellen statt mehr als 256 je Seite', () => {
    const r = edgeRaster(square(400, 30), [], 1, 1);
    expect(r.w).toBeLessThanOrEqual(256);
    expect(r.texel).toBeGreaterThan(1.5);
    expect(Math.abs(edgeAtPoint(r, 0, 0) - 15)).toBeLessThan(r.texel / 2 + 0.1);
    expect(edgeAtPoint(r, 0, 0)).toBeLessThan(EDGE_IN);
  });

  it('zwischengespeichert je Fläche und Maßstab', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const s = newShape(nodes, planesOf(nodes)[0].id, rectPath(6, 4), 0, 0, '#445566');
    const f = shapeFaces(s)[0];
    expect(faceEdge(f, 1, 1)).toBe(faceEdge(f, 1, 1));
    expect(faceEdge(f, 2, 1)).not.toBe(faceEdge(f, 1, 1));
  });
});

describe('Texturen der Earle-Schichten', () => {
  it('Rang-Kachel: jeder Rang genau einmal, Versatz in Grenzen, die ersten Punkte weit verteilt', () => {
    const n = 32;
    const t = rankTile(n, 5);
    const ranks = Array.from({ length: n * n }, (_, c) => t[c * 4 + 2]).sort((a, b) => a - b);
    ranks.forEach((r, k) => expect(r).toBeCloseTo((k + 0.5) / (n * n), 6));
    for (let c = 0; c < n * n; c++) {
      expect(Math.abs(t[c * 4])).toBeLessThanOrEqual(1);
      expect(Math.abs(t[c * 4 + 1])).toBeLessThanOrEqual(1);
    }
    // die 16 Zellen mit dem kleinsten Rang: auf dem Torus mindestens 4 Zellen auseinander (Gitter wäre 8)
    const first = Array.from({ length: n * n }, (_, c) => c)
      .sort((a, b) => t[a * 4 + 2] - t[b * 4 + 2])
      .slice(0, 16);
    let minD = Infinity;
    for (const a of first)
      for (const b of first) {
        if (a === b) continue;
        let dx = Math.abs((a % n) - (b % n));
        let dy = Math.abs(Math.floor(a / n) - Math.floor(b / n));
        dx = Math.min(dx, n - dx);
        dy = Math.min(dy, n - dy);
        minD = Math.min(minD, Math.hypot(dx, dy));
      }
    expect(minD).toBeGreaterThanOrEqual(4);
  });

  it('Papier und Gouache liegen im Mittel bei Grau (Weiches Licht ändert dann im Mittel nichts)', () => {
    const g = grainTiles(64, 3);
    let r = 0;
    let gg = 0;
    for (let i = 0; i < 64 * 64; i++) {
      r += g[i * 4];
      gg += g[i * 4 + 1];
    }
    expect(r / 4096).toBeGreaterThan(120);
    expect(r / 4096).toBeLessThan(136);
    expect(gg / 4096).toBeGreaterThan(120);
    expect(gg / 4096).toBeLessThan(136);
  });

  it('Atlas: Raster überlappen nicht, gleiche Menge packt nicht neu', () => {
    const a = new EdgeAtlas();
    const rs = [edgeRaster(square(30, 10), [], 1, 1), edgeRaster(circle(8), [], 1, 1), edgeRaster(square(50, 50), [], 1, 1)];
    expect(a.pack(rs)).toBe(true);
    expect(a.pack(rs)).toBe(false);
    const boxes = rs.map((r) => ({ ...a.slot(r)!, w: r.w, h: r.h }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        expect(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y).toBe(true);
      }
  });
});

describe('Licht der Zone', () => {
  it('liest und schreibt Richtung, Farben und eigene Werte je Look', () => {
    const light: ZoneLight = { id: 'light', kind: 'light', angle: 140, color: '#fff0c0', shade: '@c1', looks: { night: { color: '#8fa8ff', angle: 60 } } };
    const nodes = parseNodes(serializeNodes([light]));
    expect(lightOf(nodes)).toEqual(light);
    expect(lightIn(lightOf(nodes), 'night')).toEqual({ angle: 60, color: '#8fa8ff', shade: '@c1' });
    expect(lightIn(undefined)).toEqual(LIGHT_DEFAULT);
    const copy = cloneNodes(nodes);
    (copy[0] as ZoneLight).looks!.night!.angle = 0;
    expect(lightIn(lightOf(nodes), 'night').angle).toBe(60);
  });

  it('ein gelöschtes Palettenfeld bekommt seinen Wert auch im Licht', () => {
    const sw: ZoneSwatch = { id: 'c1', kind: 'swatch', name: 'Schatten', color: '#102040' };
    const light: ZoneLight = { id: 'light', kind: 'light', angle: 90, color: '#ffffff', shade: '@c1' };
    const nodes: ZoneNode[] = [sw, light];
    bakeSwatch(nodes, 'c1');
    expect(light.shade).toBe('#102040');
  });
});

describe('Knopf „Earle“', () => {
  const ctx: EarleContext = { box: { minX: -5, minY: -3, maxX: 5, maxY: 3 }, base: '#4a7a3c', light: { angle: 125, color: '#fff1c8', shade: '#1f2a5c' }, sx: 1, sy: 1 };

  it('ein zweiter Druck ersetzt die Earle-Schichten statt sie zu verdoppeln', () => {
    const paint = { fill: '#4a7a3c' as string | null, fills: undefined as ZoneFill[] | undefined };
    applyPreset(paint, 'hill', ctx);
    const once = paint.fills!.length;
    applyPreset(paint, 'hill', ctx);
    expect(paint.fills!.length).toBe(once);
    expect(paint.fills!.filter((f) => f.type === 'gradient')).toHaveLength(1);
  });

  it('ein eigener Verlauf bekommt Stufen statt eines zweiten Verlaufs; der Stapel bleibt in seinen Grenzen', () => {
    const own: GradientFill = { type: 'gradient', stops: [{ t: 0, color: '#ffffff', a: 1 }, { t: 1, color: '#000000', a: 1 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 };
    const filler: ZoneFill = { type: 'color', color: '#808080', blend: 'multiply', opacity: 0.2 };
    const paint = { fill: '#4a7a3c' as string | null, fills: [own, filler, filler, filler] as ZoneFill[] };
    applyPreset(paint, 'hill', ctx);
    expect(paint.fills![0]).toMatchObject({ type: 'gradient', steps: 4 });
    expect(paint.fills!.filter((f) => f.type === 'gradient')).toHaveLength(1);
    expect(paint.fills!.length).toBeLessThanOrEqual(MAX_LAYERS - 1);
  });

  it('Fels: die Ringe liegen durchscheinend über der eigenen Farbgebung und verdoppeln sich beim zweiten Druck nicht', () => {
    const own: GradientFill = { type: 'gradient', stops: [{ t: 0, color: '#e8d4a8', a: 1 }, { t: 1, color: '#c08850', a: 1 }], x0: 0, y0: 3, x1: 0, y1: -3, blend: 'normal', opacity: 1 };
    const paint = { fill: '#e8d4a8' as string | null, fills: [own] as ZoneFill[] };
    applyPreset(paint, 'rock', ctx);
    applyPreset(paint, 'rock', ctx);
    const grads = paint.fills!.filter((f): f is GradientFill => f.type === 'gradient');
    expect(grads).toHaveLength(2);
    expect(grads[0]).toEqual(own);
    expect(grads[1].edge).toBe(true);
    expect(grads[1].stops.at(-1)!.a).toBe(0);
    // die eigene Farbgebung bleibt sichtbar: nichts Deckendes darüber, der eigene Verlauf ist die unterste sichtbare Schicht
    const shown = visibleLayers([{ type: 'color', color: '#e8d4a8', blend: 'normal', opacity: 1 }, ...paint.fills!]);
    expect(shown[0]).toEqual(own);
    expect(shown).toHaveLength(paint.fills!.length);
  });

  it('jede Vorgabe passt in den Stapel; Automatisch wählt nach Material und Farbe', () => {
    for (const p of ['hill', 'rock', 'meadow', 'crown', 'water'] as const) expect(presetLayers(p, ctx).length).toBeLessThanOrEqual(MAX_LAYERS - 1);
    expect(autoPreset('solid', '#777777')).toBe('rock');
    expect(autoPreset('dig', '#4a7a3c')).toBe('hill');
    expect(autoPreset('dig', '#2a5ab0')).toBe('water');
    expect(autoPreset('airy', '#2f6a30')).toBe('crown');
  });

  it('der Kantenverlauf des Felsens reicht in Metern der Ebene ein Viertel der kurzen Seite tief, auch bei skalierter Form', () => {
    // Rahmen 10 × 6, doppelt so breit gezogen: kurze Seite 6 m, Tiefe 1,5 m
    const g = presetLayers('rock', { ...ctx, sx: 2 })[0] as GradientFill;
    expect(g.edge).toBe(true);
    expect(Math.hypot(2 * (g.x1 - g.x0), g.y1 - g.y0)).toBeCloseTo(1.5, 6);
    const big = presetLayers('rock', { ...ctx, box: { minX: 0, minY: 0, maxX: 100, maxY: 60 } })[0] as GradientFill;
    expect(Math.hypot(big.x1 - big.x0, big.y1 - big.y0)).toBeCloseTo(6, 6);
  });
});

describe('Wertezeile im Füllstapel', () => {
  it('Prozent hin und zurück, Grenzen wie beim Lesen, Tiefe des Kantenverlaufs mit dem Maßstab der Form', () => {
    const dots = parseFill({ type: 'dots' }) as DotsFill;
    setFillParam(dots, 'density', 35);
    expect(dots.density).toBeCloseTo(0.35);
    setFillParam(dots, 'gap', 0.2);
    expect(dots.gap).toBe(1.05);
    expect(fillParams(dots).params!.find((p) => p.key === 'density')!.value).toBe(35);
    const g = parseFill({ type: 'gradient', stops: [{ t: 0, color: '#000000' }, { t: 1, color: '#ffffff' }], x0: 0, y0: 0, x1: 10, y1: 0 }) as GradientFill;
    setFillParam(g, 'kind', 'edge', { sx: 2, sy: 2 });
    expect(g.edge).toBe(true);
    setFillParam(g, 'depth', 5, { sx: 2, sy: 2 });
    expect(Math.hypot(2 * (g.x1 - g.x0), 2 * (g.y1 - g.y0))).toBeCloseTo(5, 6);
    setFillParam(g, 'steps', 1);
    expect(g.steps).toBeUndefined();
    expect(fillParams(g).name).toBe('Kantenverlauf');
  });
});

describe('Ebenen-Material mit Earle-Schichten', () => {
  it('Kantenabstand, Rang- und Papierkachel nur für Flächen, die sie brauchen', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const plane = planesOf(nodes)[0];
    const a = newShape(nodes, plane.id, rectPath(20, 10), 0, 0, '#445566');
    const b = newShape(nodes, plane.id, ellipsePath(5, 4), 30, 0, '#668844');
    nodes.push(a, b);
    const layer = new PlaneLayer();
    layer.build(nodes);
    expect(layer.stats.edges).toBe(0);
    setFacePaint(b, shapeFaces(b)[0], { fill: '#668844', fills: [{ type: 'grain', tile: 'paper', scale: 6, angle: 0, blend: 'softLight', opacity: 0.4 }] });
    layer.build(nodes);
    expect(layer.stats.edges).toBe(0);
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [{ type: 'light', width: 0.6, soft: 0, blend: 'screen', opacity: 0.5 }] });
    layer.build(nodes);
    expect(layer.stats.edges).toBe(1);
    expect(layer.stats.paints).toBeGreaterThanOrEqual(3);
  });
});

describe('Shader je Schichtfolge', () => {
  it('die Folge nennt Art, Griffart, Bänder, Welle und Punktquelle, nicht die Werte', () => {
    const fills: ZoneFill[] = [
      { type: 'color', color: '#112233', blend: 'normal', opacity: 1 },
      { type: 'gradient', steps: 4, wave: 0.3, stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#ffffff', a: 1 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 },
      { type: 'fade', edge: true, stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#000000', a: 0 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 },
      { type: 'shade', width: 2, soft: 0, blend: 'multiply', opacity: 0.4 },
      { type: 'dots', size: 0.3, gap: 1.8, density: 0.7, jitter: 0.3, source: 'edge', reach: 2, tone: 0.5, seed: 1, blend: 'normal', opacity: 1 },
      { type: 'grain', tile: 'paper', scale: 6, angle: 0, blend: 'softLight', opacity: 0.4 },
    ];
    expect(layerTokens(fills)).toBe('c.glbw.fe.S.D3.P');
    // andere Werte, gleiche Folge
    expect(layerTokens(fills.map((f) => ({ ...f, opacity: 0.5 })) as ZoneFill[])).toBe('c.glbw.fe.S.D3.P');
  });

  it('jede Folge bekommt nur den Code ihrer Arten; eine Farbe ohne Ebenenstapel nimmt die Farbe der Ecken', () => {
    const main = (sig: string) => specialFragment(sig).split('void main()')[1];
    expect(main('c|')).toContain('vSolid.rgb');
    expect(main('c|')).not.toContain('texelFetch(uPaint');
    expect(main('gl|')).not.toContain('uRank');
    expect(main('gl|')).not.toContain('dotCover(');
    expect(main('gl|')).not.toContain('textureGrad');
    // (die Pünktchen lesen die Rang-Kachel in der gemeinsamen Funktion dotCover)
    expect(main('c.D1|')).toContain('dotCover(');
    expect(main('c.D1|')).toContain('edgeAt(uLight * D.y)');
    expect(main('c|P')).toContain('vRows.y');
    // durchsichtige Flächen rechnen auch eine einzelne Farbe aus der Datentextur
    expect(specialFragment('c|', true).split('void main()')[1]).toContain('texelFetch(uPaint');
  });
});

describe('Earle auf die ganze Zone (ohne Editor)', () => {
  it('setzt Vorgaben auf alle Formen sichtbarer Ebenen, Kronen bekommen echte Punkte, die Eingabe bleibt unverändert', async () => {
    const { earleZone } = await import('@/zone/earle');
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const plane = planesOf(nodes)[0];
    const hill = newShape(nodes, plane.id, rectPath(30, 10), 0, 0, '#6a9a3c');
    nodes.push(hill);
    const crown = newShape(nodes, plane.id, ellipsePath(5, 3), 40, 10, '#2f5a2a');
    crown.material = 'airy';
    nodes.push(crown);
    const before = JSON.stringify(nodes);
    const out = earleZone(nodes);
    expect(JSON.stringify(nodes)).toBe(before);
    const h = out.find((n) => n.id === hill.id) as typeof hill;
    const c = out.find((n) => n.id === crown.id) as typeof crown;
    expect(h.fills?.some((f) => f.type === 'light')).toBe(true);
    expect(c.crown).toBeDefined();
    expect(c.fills?.some((f) => f.type === 'dots')).toBe(false);
    const layer = new PlaneLayer();
    layer.build(out);
    expect(layer.crownDots).toBeGreaterThan(30);
  });
});

describe('Shader je Folge: deckend und durchsichtig getrennt', () => {
  it('nach einem Wechsel der Folgen bleibt jede deckende Fläche deckend, auch wenn eine durchsichtige dieselbe Folge hat', () => {
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const plane = planesOf(nodes)[0];
    const a = newShape(nodes, plane.id, rectPath(20, 10), 0, 0, '#445566');
    nodes.push(a);
    const b = newShape(nodes, plane.id, rectPath(10, 6), 30, 0, '#668844');
    nodes.push(b);
    const light: ZoneFill = { type: 'light', width: 0.6, soft: 0, blend: 'screen', opacity: 0.5 };
    const dots = parseFill({ type: 'dots', source: 'light' })!;
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [light, dots] });
    // gleiche Folge, aber durchsichtig
    setFacePaint(b, shapeFaces(b)[0], { fill: '#668844', fills: [light, dots], opacity: 0.5 });
    const layer = new PlaneLayer();
    const check = () => {
      for (const m of layer.group.children as unknown as Array<{ name: string; material: { transparent: boolean } }>) {
        if (m.name.startsWith('ebenen-formen')) expect(m.material.transparent).toBe(false);
        if (m.name.startsWith('ebenen-durchsichtig')) expect(m.material.transparent).toBe(true);
      }
    };
    layer.build(nodes);
    check();
    // andere Folge (ohne Pünktchen), dann zurück: die deckende Fläche bekommt wieder ein deckendes Material
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [light] });
    layer.build(nodes);
    check();
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [light, dots] });
    layer.build(nodes);
    check();
  });
});

describe('Funkeln', () => {
  it('liest und schreibt, Kaputtes gekappt; Wasser bekommt es, die Wertezeile setzt Prozent und Tempo', () => {
    const k: ZoneFill = { type: 'sparkle', size: 0.4, gap: 6, density: 0.3, speed: 1.2, seed: 3, color: '#fffbe6', blend: 'screen', opacity: 0.9 };
    expect(parseFill(JSON.parse(JSON.stringify(serializeFill(k))))).toEqual(k);
    expect(parseFill({ type: 'sparkle', gap: 0.5, speed: 99 })).toMatchObject({ gap: 1.5, speed: 10 });
    const ctx: EarleContext = { box: { minX: -5, minY: -3, maxX: 5, maxY: 3 }, base: '#2a5ab0', light: { angle: 125, color: '#fff1c8', shade: '#1f2a5c' }, sx: 1, sy: 1 };
    expect(presetLayers('water', ctx).some((f) => f.type === 'sparkle')).toBe(true);
    const s = parseFill({ type: 'sparkle' })!;
    setFillParam(s, 'density', 20);
    setFillParam(s, 'speed', 2);
    expect(s).toMatchObject({ density: 0.2, speed: 2 });
    expect(fillParams(s).params!.map((p) => p.key)).toEqual(['size', 'gap', 'density', 'speed', 'seed']);
  });
  it('der Shader der Folge mit Funkeln braucht die Rang-Kachel und die Uhr', () => {
    expect(layerTokens([{ type: 'color', color: '#2a5ab0', blend: 'normal', opacity: 1 }, parseFill({ type: 'sparkle' })!])).toBe('c.K');
    const main = specialFragment('c.K|').split('void main()')[1];
    expect(main).toContain('sparkleAt(vPat.xy');
  });
});

describe('Farbnebel', () => {
  const nebel = (dabs: Array<Partial<MistDab>>): MistFill => ({ type: 'mist', dabs: dabs.map((d) => ({ x: 0, y: 0, r: 2, color: '#ff0000', a: 1, ...d })), blend: 'normal', opacity: 1 });
  const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

  it('liest und schreibt; kaputte Tupfer fallen weg, mehr als MIST_MAX werden gekappt, ohne Tupfer kein Farbnebel', () => {
    const m = nebel([{ x: 1, y: -2, r: 1.5, color: '@c1', a: 0.6 }, { x: -3, y: 0.5, r: 4, color: '#204080' }]);
    expect(parseFill(JSON.parse(JSON.stringify(serializeFill(m))))).toEqual(m);
    const broken = [{ x: 0, y: 0, r: 0, color: '#ffffff' }, { x: 0, y: 'a', r: 1, color: '#ffffff' }, { x: 1, y: 1, r: 1, color: 'rot' }, { x: 1, y: 1, r: 1, color: '#ffffff', a: 3 }];
    expect((parseFill({ type: 'mist', dabs: broken }) as MistFill).dabs).toEqual([{ x: 1, y: 1, r: 1, color: '#ffffff', a: 1 }]);
    expect(parseFill({ type: 'mist', dabs: [] })).toBeNull();
    const many = Array.from({ length: MIST_MAX + 5 }, (_, i) => ({ x: i, y: 0, r: 1, color: '#ffffff', a: 1 }));
    expect((parseFill({ type: 'mist', dabs: many }) as MistFill).dabs).toHaveLength(MIST_MAX);
  });

  it('in der Mitte eines vollen Tupfers seine Farbe, am Halbmesser nichts, dazwischen weich; zwei Tupfer mischen nach Nähe', () => {
    const one = nebel([{ x: 0, y: 0, r: 2 }]);
    expect(mistAt(one, 0, 0, none)).toEqual({ rgb: [1, 0, 0], a: 1 });
    expect(mistAt(one, 2, 0, none).a).toBe(0);
    expect(mistAt(one, 1, 0, none).a).toBeCloseTo(0.5, 6);
    const two = nebel([{ x: -2, y: 0, r: 3 }, { x: 2, y: 0, r: 3, color: '#0000ff' }]);
    close(mistAt(two, 0, 0, none).rgb, [0.5, 0, 0.5]);
    const left = mistAt(two, -1, 0, none).rgb;
    expect(left[0]).toBeGreaterThan(left[2]);
    // über einer Grundfarbe: in der Mitte deckt der Nebel, außerhalb bleibt die Grundfarbe
    const base: ZoneFill = { type: 'color', color: '#00ff00', blend: 'normal', opacity: 1 };
    close(evalLayers([base, one], 0, 0, none).rgb, [1, 0, 0]);
    close(evalLayers([base, one], 5, 0, none).rgb, [0, 1, 0]);
  });

  it('Drehen nimmt die Tupfer mit, eine Kopie teilt keine; ein gelöschtes Palettenfeld bekommt seinen Wert auch im Nebel', () => {
    const m = nebel([{ x: 1, y: 2, color: '@c1' }]);
    const copy = cloneFill(m) as MistFill;
    mapFillPoints([copy], (x, y) => [-y, x]);
    expect(copy.dabs[0]).toMatchObject({ x: -2, y: 1 });
    expect(m.dabs[0]).toMatchObject({ x: 1, y: 2 });
    const sw: ZoneSwatch = { id: 'c1', kind: 'swatch', name: 'Rot', color: '#c02010' };
    const nodes: ZoneNode[] = [sw, newPlane([], 0)];
    const shape = newShape(nodes, planesOf(nodes)[0].id, rectPath(10, 10), 0, 0, '#445566');
    shape.fills = [m];
    nodes.push(shape);
    bakeSwatch(nodes, 'c1');
    expect(m.dabs[0].color).toBe('#c02010');
  });

  it('die Folge nennt die Plätze (nächste Zweierpotenz), der Shader schreibt jeden Tupfer aus; ohne Kantenabstand; die Tupfer landen in der Nebeltextur', () => {
    expect([1, 2, 3, 4, 5, 9, 16, 40].map(mistSlots)).toEqual([1, 2, 4, 4, 8, 16, 16, 16]);
    const mist = nebel([{ x: 3, y: 1, r: 4, color: '#ff8800', a: 0.8 }]);
    const fills: ZoneFill[] = [{ type: 'color', color: '#445566', blend: 'normal', opacity: 1 }, mist];
    expect(layerTokens(fills)).toBe('c.N1');
    expect(layerTokens([fills[0], nebel([{}, {}, {}])])).toBe('c.N4');
    expect(layersNeedEdge(fills)).toBe(false);
    const main = specialFragment('c.N4|').split('void main()')[1];
    expect(main.match(/mistDab\(mr, \d+, vLocal, ms, mw, mk\)/g)).toHaveLength(4);
    expect(main).not.toContain('mistAt(');
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const a = newShape(nodes, planesOf(nodes)[0].id, rectPath(20, 10), 0, 0, '#445566');
    nodes.push(a);
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [mist] });
    const layer = new PlaneLayer();
    layer.build(nodes);
    expect(layer.stats.edges).toBe(0);
    const tex = (layer as unknown as { mistTex: { image: { data: Float32Array } } }).mistTex.image.data;
    close([...tex.slice(0, 7)], [3, 1, 4, 0.8, 1, 0x88 / 255, 0]);
  });
});

describe('Shader je Folge ohne Schleifen', () => {
  it('keine Art Schicht bringt eine Schleife in den Shader (unter ANGLE/Metal kostet jede einige Millisekunden je Bild)', () => {
    const main = specialFragment('c.glbw.frw.fe.L.S.D0.D3.K.N16.P.gld.fed|c.gl.N2').split('void main()')[1];
    expect(main).not.toMatch(/\bfor\s*\(|\bwhile\s*\(/);
    expect(main).not.toContain('mistAt(');
    expect(main).not.toMatch(/\blayers\(/);
    expect(specialFragment('c.N16|', true).split('void main()')[1]).not.toMatch(/\bfor\s*\(/);
  });
});

describe('Verlauf als Pünktchen (Dot Shading)', () => {
  const grad = (o: Partial<GradientFill> = {}): GradientFill => ({ type: 'gradient', stops: [{ t: 0, color: '#2e5f2a', a: 1 }, { t: 1, color: '#2e5f2a', a: 0 }], x0: 0, y0: 0, x1: 4, y1: 0, blend: 'normal', opacity: 1, ...o });

  it('liest und schreibt die Pünktchen, kappt Unsinn, eine Kopie teilt sie nicht', () => {
    const g = grad({ dots: { size: 0.25, gap: 1.4, jitter: 0.2, seed: 3 } });
    expect(parseFill(JSON.parse(JSON.stringify(serializeFill(g))))).toEqual(g);
    expect((parseFill({ ...serializeFill(g), dots: { size: 99, gap: 0.2 } }) as GradientFill).dots).toEqual({ size: 20, gap: 1.05, jitter: 0.3, seed: 1 });
    expect((parseFill(serializeFill(grad())) as GradientFill).dots).toBeUndefined();
    const copy = cloneFill(g) as GradientFill;
    copy.dots!.size = 1;
    expect(g.dots!.size).toBe(0.25);
  });

  it('ein Verlauf als Pünktchen deckt nie ganz; die Folge nennt d, der Shader wächst die Punkte zusammen', () => {
    const base: ZoneFill = { type: 'color', color: '#8fc24a', blend: 'normal', opacity: 1 };
    const solid = grad({ stops: [{ t: 0, color: '#2e5f2a', a: 1 }, { t: 1, color: '#cfe05c', a: 1 }] });
    expect(visibleLayers([base, solid])).toHaveLength(1);
    expect(visibleLayers([base, { ...solid, dots: { size: 0.3, gap: 1.5, jitter: 0.3, seed: 1 } }])).toHaveLength(2);
    expect(layerTokens([base, grad({ dots: { size: 0.3, gap: 1.5, jitter: 0.3, seed: 1 } })])).toBe('c.gld');
    expect(layerTokens([base, { ...grad({ edge: true, dots: { size: 0.3, gap: 1.5, jitter: 0.3, seed: 1 } }), type: 'fade' }])).toBe('c.fed');
    const main = specialFragment('c.gld|').split('void main()')[1];
    expect(main).toContain('dotCover(vPat.xy, D.x, D.y, D.z, D.w, as, as, 1.0, px)');
    // die Pünktchen-Schicht nutzt dieselbe Funktion, ohne Zusammenwachsen
    expect(specialFragment('c.D3|').split('void main()')[1]).toContain('dotCover(vPat.xy, C.x, C.y, D.z, C.w, C.z * k, k, 0.0, px)');
  });

  it('Wertezeile: Pünktchen an und aus, Abstand; das Material braucht die Rang-Kachel', () => {
    const g = grad();
    expect(fillParams(g).params!.map((p) => p.key)).toContain('dots');
    setFillParam(g, 'dots', 0.4);
    expect(g.dots).toMatchObject({ size: 0.4, gap: 1.5 });
    expect(fillParams(g).name).toBe('Verlauf als Pünktchen');
    setFillParam(g, 'dotgap', 2.2);
    expect(g.dots!.gap).toBe(2.2);
    setFillParam(g, 'dots', 0);
    expect(g.dots).toBeUndefined();
    const nodes: ZoneNode[] = [newPlane([], 0)];
    const a = newShape(nodes, planesOf(nodes)[0].id, rectPath(20, 10), 0, 0, '#445566');
    nodes.push(a);
    setFacePaint(a, shapeFaces(a)[0], { fill: '#445566', fills: [grad({ dots: { size: 0.3, gap: 1.5, jitter: 0.3, seed: 1 } })] });
    const layer = new PlaneLayer();
    layer.build(nodes);
    expect((layer as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms.uRank.value).toBeTruthy();
  });
});

describe('Lichtkante und Innenschatten mit Breite 0 oder negativ', () => {
  it('die Breite darf 0 (Saum rundum) und negativ (andere Seite) sein, in den Grenzen ±40 m', () => {
    expect(parseFill({ type: 'shade', width: -2, soft: 1 })).toMatchObject({ width: -2 });
    expect(parseFill({ type: 'light', width: 0, soft: 1 })).toMatchObject({ width: 0 });
    expect(parseFill({ type: 'light', width: -99 })).toMatchObject({ width: -40 });
    const s = parseFill({ type: 'shade', width: 1 })!;
    setFillParam(s, 'width', -3);
    expect(s).toMatchObject({ width: -3 });
    expect(fillParams(s).params!.find((p) => p.key === 'width')!.min).toBe(-40);
  });
});

