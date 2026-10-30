/**
 * Stufe 6 (docs/ZONENEDITOR-PLAN.md): Bildfüllung und Schnittmaske, Säume, Malvorlage mit Fingerabdruck und Passmarken,
 * Shader je Schichtfolge mit Bildern
 */
import { describe, expect, it } from 'vitest';
import { cloneNodes, ellipsePath, flipShape, newPlane, newShape, parseNodes, planesOf, rectPath, serializeNodes, type ZoneNode, type ZonePlane, type ZoneShape, type ZoneTemplate } from '@/zone/nodes';
import { evalLayers, imageUv, layersClear, mapFillPoints, parseFill, serializeFill, setImageSampler, type ImageFill, type ZoneFill, type ZoneSwatch } from '@/zone/paint';
import { parseRims, rimLengths, rimPieces, rimRuns, rimStrip, serializeRim, type ZoneRim } from '@/zone/rims';
import { faceTemplate, fillFromTemplate, findMarks, fingerprint, importRect, markCenters, matchTemplate, neededPpm, rimTemplate, sharpZoom, targetFingerprint, templateDrift, templateFile, templateSvg, PHONE_VIEW, TEMPLATE_MAX, type RawImage } from '@/zone/template';
import { layerTokens, PlaneLayer, specialFragment } from '@/world/planeMesh';
import { fillParams, rimParamsOf, setFillParam, setRimParam } from '@/zoneeditor/fillParams';
import { imageSlotIn } from '@/zoneeditor/images';

const none = new Map<string, ZoneSwatch>();

/** eine Ebene mit einem Rechteck 20 × 10 m um (0, 0) */
function scene(z = 8): { nodes: ZoneNode[]; plane: ZonePlane; shape: ZoneShape } {
  const nodes: ZoneNode[] = [newPlane([], z)];
  const plane = planesOf(nodes)[0];
  const shape = newShape(nodes, plane.id, rectPath(20, 10), 0, 0, '#557744');
  nodes.push(shape);
  return { nodes, plane, shape };
}

const img = (src = '/zones/probe/bild-a.png'): ImageFill => ({ type: 'image', src, ox: -10, oy: -5, ux: 20, uy: 0, vx: 0, vy: 10, blend: 'normal', opacity: 1 });

const rim = (over: Partial<ZoneRim> = {}): ZoneRim => ({ id: 'r1', src: '/zones/probe/saum-gras.png', aspect: 4, width: 1, base: 0.3, dir: 90, spread: 50, mode: 'repeat', a: 0.2, b: 0.8, ...over });

describe('Bildfüllung (Plan 4.8)', () => {
  it('kommt unverändert aus der Datei zurück; fremde Adressen und ein flacher Rahmen fallen weg', () => {
    const f: ImageFill = { ...img(), repeat: true, mask: true, tpl: 'v3', opacity: 0.8, blend: 'multiply' };
    expect(parseFill(JSON.parse(JSON.stringify(serializeFill(f))))).toEqual(f);
    expect(parseFill({ ...serializeFill(img()), src: 'https://example.com/a.png' })).toBeNull();
    expect(parseFill({ ...serializeFill(img()), src: '/zones/probe/../geheim.png' })).toBeNull();
    expect(parseFill({ ...serializeFill(img()), vx: 20, vy: 0 })).toBeNull();
  });

  it('Rahmen: Lage im Bild aus dem Parallelogramm, auch gedreht und gespiegelt (mapFillPoints)', () => {
    const f = img();
    expect(imageUv(f, -10, -5)).toEqual([0, 0]);
    expect(imageUv(f, 10, 5)).toEqual([1, 1]);
    expect(imageUv(f, 0, 0)).toEqual([0.5, 0.5]);
    // um 90° drehen: der Punkt dreht mit, seine Lage im Bild bleibt
    const g: ImageFill = { ...f };
    mapFillPoints([g], (x, y) => [-y, x]);
    const [u, v] = imageUv(g, -2.5, 4);
    const [u0, v0] = imageUv(f, 4, 2.5);
    expect(u).toBeCloseTo(u0, 6);
    expect(v).toBeCloseTo(v0, 6);
    // spiegeln: die Form trägt das Bild gespiegelt
    const { shape } = scene();
    shape.fills = [img()];
    flipShape(shape, 'x');
    const h = shape.fills[0] as ImageFill;
    expect(imageUv(h, 9, 0)[0]).toBeCloseTo(imageUv(f, -9, 0)[0], 3);
  });

  it('Pipette: rechnet das Bild über die Grundfarbe; eine Bildschicht schneidet aus', () => {
    setImageSampler((src, u) => (src.endsWith('a.png') ? (u < 0.5 ? [1, 0, 0, 1] : [0, 0, 1, 0]) : null));
    try {
      const base: ZoneFill = { type: 'color', color: '#00ff00', blend: 'normal', opacity: 1 };
      // links deckt das Bild (rot), rechts ist es durchsichtig (Grundfarbe bleibt)
      expect(evalLayers([base, img()], -5, 0, none).rgb).toEqual([1, 0, 0]);
      expect(evalLayers([base, img()], 5, 0, none).rgb).toEqual([0, 1, 0]);
      // außerhalb des Rahmens nichts
      expect(evalLayers([base, img()], -12, 0, none).rgb).toEqual([0, 1, 0]);
      // als Bildschicht: wo das Bild durchsichtig ist, ist es die Fläche auch
      const cut = evalLayers([base, { ...img(), mask: true }], 5, 0, none);
      expect(cut.a).toBe(0);
      expect(evalLayers([base, { ...img(), mask: true }], -5, 0, none).a).toBe(1);
      // als Kachel wiederholt
      expect(evalLayers([base, { ...img(), repeat: true }], -25, 0, none).rgb).toEqual([1, 0, 0]);
    } finally {
      setImageSampler(null);
    }
  });

  it('ein gemaltes Bild kommt über die färbenden Schichten und unter die Earle-Wirkungen', () => {
    const grad: ZoneFill = { type: 'gradient', stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#ffffff', a: 1 }], x0: 0, y0: 0, x1: 1, y1: 0, blend: 'normal', opacity: 1 };
    const shade: ZoneFill = { type: 'shade', width: 1, soft: 0, blend: 'multiply', opacity: 0.5 };
    const dots: ZoneFill = { type: 'dots', size: 0.3, gap: 1.8, density: 0.6, jitter: 0.3, source: 'edge', reach: 2, tone: 0.4, seed: 1, blend: 'normal', opacity: 1 };
    // Szene 06: zwei Verläufe färben, darüber Innenschatten und Pünktchen
    expect(imageSlotIn([grad, grad, shade, dots])).toBe(2);
    expect(imageSlotIn([])).toBe(0);
    expect(imageSlotIn([shade])).toBe(0);
    // ein Verlauf als Pünktchen ist eine Wirkung und bleibt darüber
    expect(imageSlotIn([grad, { ...grad, dots: { size: 0.3, gap: 1.5, jitter: 0.3, seed: 1 } } as ZoneFill])).toBe(1);
  });

  it('nur eine Bildschicht, die ausschneidet, macht die Fläche durchsichtig', () => {
    const base: ZoneFill = { type: 'color', color: '#00ff00', blend: 'normal', opacity: 1 };
    expect(layersClear([base, img()])).toBe(false);
    expect(layersClear([base, { ...img(), mask: true }])).toBe(true);
    expect(layersClear([base, { ...img(), mask: true, hidden: true }])).toBe(false);
  });

  it('Wertezeile: Rahmen oder Kachel, ausschneiden, Breite um die Mitte', () => {
    const f = img();
    expect(fillParams(f).name).toBe('Bild');
    setFillParam(f, 'repeat', 'tile');
    setFillParam(f, 'mask', 'cut');
    expect(fillParams(f).name).toBe('Bildschicht');
    setFillParam(f, 'size', 10);
    expect(Math.hypot(f.ux, f.uy)).toBeCloseTo(10, 6);
    expect(Math.hypot(f.vx, f.vy)).toBeCloseTo(5, 6);
    expect(f.ox + (f.ux + f.vx) / 2).toBeCloseTo(0, 6);
  });
});

describe('Shader je Schichtfolge mit Bildern', () => {
  it('ein Bild nennt seinen Platz in der Folge; der Shader liest nur seine Sampler, ohne Schleife', () => {
    const fills: ZoneFill[] = [{ type: 'color', color: '#112233', blend: 'normal', opacity: 1 }, img(), { ...img('/zones/probe/bild-b.png'), repeat: true, mask: true }];
    const slots = new Map([['/zones/probe/bild-a.png', 0], ['/zones/probe/bild-b.png#r', 3]]);
    const sig = layerTokens(fills, (f) => slots.get(`${f.src}${f.repeat ? '#r' : ''}`) ?? -1);
    expect(sig).toBe('c.I0.Irm3');
    const frag = specialFragment(`${sig}|`);
    expect(frag).toContain('uniform sampler2D uImg0;');
    expect(frag).toContain('uniform sampler2D uImg3;');
    expect(frag).not.toContain('uImg1');
    const main = frag.split('void main()')[1];
    expect(main).not.toMatch(/\bfor\s*\(|\bwhile\s*\(/);
    // im Rahmen: außerhalb durchsichtig; als Kachel nicht; schneidet aus: nimmt dem Bisherigen Deckkraft
    expect(main).toContain('step(0.0, uv.x)');
    expect(main).toContain('acc *= 1.0 - A.z + A.z * as;');
  });

  it('die Ebenen geben jedem Bild einen festen Platz; Flächen mit Bild bekommen immer ihren eigenen Shader', () => {
    const { nodes, shape } = scene();
    shape.fills = [img()];
    const second = newShape(nodes, shape.parent, ellipsePath(3, 3), 20, 0, '#334455');
    second.fills = [{ ...img('/zones/probe/bild-b.png'), ox: -3, oy: -3, ux: 6, vy: 6 }];
    nodes.push(second);
    const layer = new PlaneLayer();
    layer.build(nodes);
    expect(layer.stats.images).toBe(2);
    expect(layer.stats.variants).toBe(2);
    // gleiche Bilder teilen den Platz auch nach einem Neubau
    layer.build(nodes);
    expect(layer.stats.images).toBe(2);
  });
});

describe('Säume (Plan 4.8)', () => {
  it('kommen unverändert aus der Datei zurück, mit der Form kopiert', () => {
    const r: ZoneRim = { ...rim(), holes: true, opacity: 0.5, hidden: true, tpl: 'v2' };
    expect(parseRims(JSON.parse(JSON.stringify([serializeRim(r)])))).toEqual([r]);
    const { nodes, shape } = scene();
    shape.rims = [r];
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes))));
    expect((back.find((n) => n.id === shape.id) as ZoneShape).rims).toEqual([r]);
    const copy = cloneNodes(nodes).find((n) => n.id === shape.id) as ZoneShape;
    copy.rims![0].width = 9;
    expect(shape.rims[0].width).toBe(1);
  });

  it('nach oben zeigende Kanten: beim Rechteck nur die Oberkante, der Streifen liegt darüber und zu base darin', () => {
    const { shape } = scene();
    const runs = rimRuns(shape, rim());
    expect(runs.length).toBe(1);
    const L = runs[0].s[runs[0].s.length - 1];
    expect(L).toBeGreaterThan(19);
    expect(L).toBeLessThan(21.5);
    for (const [, y] of runs[0].pts) expect(y).toBeCloseTo(5, 3);
    const strip = rimStrip(shape, rim());
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 1; i < strip.pos.length; i += 2) {
      top = Math.max(top, strip.pos[i]);
      bottom = Math.min(bottom, strip.pos[i]);
    }
    expect(top).toBeCloseTo(5.7, 3);
    expect(bottom).toBeCloseTo(4.7, 3);
    // nach unten: die Unterkante; rundum: ein geschlossener Lauf ohne Anfang und Ende
    expect(rimRuns(shape, rim({ dir: 270 }))[0].pts.every(([, y]) => Math.abs(y + 5) < 1e-3)).toBe(true);
    const all = rimRuns(shape, rim({ spread: 180 }));
    expect(all.length).toBe(1);
    expect(all[0].closed).toBe(true);
  });

  it('folgt der Form: verschoben, gestreckt, gespiegelt bleibt der Saum oben', () => {
    const { shape } = scene();
    shape.x = 30;
    shape.sy = -2;
    const runs = rimRuns(shape, rim());
    expect(runs.length).toBe(1);
    for (const [x, y] of runs[0].pts) {
      expect(y).toBeCloseTo(10, 3);
      expect(x).toBeGreaterThan(19.9);
      expect(x).toBeLessThan(40.1);
    }
  });

  it('Teilung: Anfang, ganzzahlig viele Mitten, Ende; kurz: nur Anfang und Ende; gestreckt: ein Stück', () => {
    // Bild 4 m lang (Höhe 1, Seitenverhältnis 4): Anfang 0,8 m, Mitte 2,4 m, Ende 0,8 m
    const p = rimPieces(rim(), 20, false);
    expect(p[0]).toEqual({ s0: 0, s1: 0.8, u0: 0, u1: 0.2 });
    expect(p.at(-1)?.u1).toBe(1);
    expect(p.at(-1)?.s1).toBeCloseTo(20, 9);
    const mids = p.slice(1, -1);
    expect(mids.length).toBe(Math.round(18.4 / 2.4));
    for (const m of mids) {
      expect(m.u0).toBe(0.2);
      expect(m.u1).toBe(0.8);
    }
    const short = rimPieces(rim(), 1, false);
    expect(short.map((q) => [q.u0, q.u1])).toEqual([
      [0, 0.2],
      [0.8, 1],
    ]);
    expect(short[1].s1).toBeCloseTo(1, 9);
    expect(rimPieces(rim({ mode: 'stretch' }), 20, false)).toEqual([{ s0: 0, s1: 20, u0: 0, u1: 1 }]);
    expect(rimPieces(rim(), 20, true).every((q) => q.u0 === 0.2 && q.u1 === 0.8)).toBe(true);
  });

  it('der Streifen hat an jeder Grenze eigene Ecken (keine Naht durch Interpolation)', () => {
    const { shape } = scene();
    const strip = rimStrip(shape, rim());
    // je Grenze zwischen zwei Stücken zwei Ecken mit u = 0,8 (Ende der Mitte) und u = 0,2 (Anfang der nächsten)
    let jumps = 0;
    for (let i = 4; i < strip.uv.length; i += 4) if (Math.abs(strip.uv[i] - strip.uv[i - 4]) > 0.5) jumps++;
    expect(jumps).toBeGreaterThan(0);
    expect(strip.index.length % 6).toBe(0);
    expect(Math.max(...strip.index)).toBeLessThan(strip.pos.length / 2);
  });

  it('Wertezeile: Höhe, Lage der Kante, Richtung, Spanne, Anfang und Ende', () => {
    const r = rim();
    expect(rimParamsOf(r).map((p) => p.key)).toEqual(['mode', 'width', 'base', 'dir', 'spread', 'a', 'b', 'holes']);
    setRimParam(r, 'dir', 'down');
    setRimParam(r, 'a', 90);
    setRimParam(r, 'base', 50);
    expect(r.dir).toBe(270);
    expect(r.a).toBeCloseTo(0.78, 6);
    expect(r.base).toBe(0.5);
    setRimParam(r, 'mode', 'stretch');
    expect(rimParamsOf(r).some((p) => p.key === 'a')).toBe(false);
  });
});

describe('Malvorlage (Plan 4.10)', () => {
  it('Zielgröße aus Tiefe und größtem Zoom: hinten weniger Bildpunkte je Meter, scharf bis zum größten Zoom', () => {
    const near = scene(4).plane;
    const far = scene(60).plane;
    expect(neededPpm(near)).toBeGreaterThan(neededPpm(far));
    expect(sharpZoom(near, neededPpm(near))).toBe(PHONE_VIEW.maxZoom);
    expect(sharpZoom(near, neededPpm(near) / 4)).toBeLessThan(PHONE_VIEW.maxZoom / 2);
  });

  it('Rahmen um die Form mit Überstand; Bildpunkte im Seitenverhältnis; die längste Seite höchstens 4096', () => {
    const { plane, shape } = scene();
    const d = faceTemplate('v1', plane, shape, null, '2026-10-30');
    expect(d).not.toBeNull();
    const t = d!.t;
    expect(t.ox).toBeCloseTo(-10.6, 6);
    expect(t.ux).toBeCloseTo(21.2, 6);
    expect(t.vy).toBeCloseTo(11.2, 6);
    expect(t.w / t.h).toBeCloseTo(21.2 / 11.2, 2);
    expect(t.ppm).toBeCloseTo(neededPpm(plane), 2);
    expect(templateFile(t)).toBe(`vorlage-${shape.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}-v1`);
    // eine riesige Form wird auf 4096 Bildpunkte begrenzt und sagt, bis wohin sie scharf ist
    shape.sx = shape.sy = 40;
    const big = faceTemplate('v2', plane, shape, null, '2026-10-30')!;
    expect(Math.max(big.t.w, big.t.h)).toBe(TEMPLATE_MAX);
    expect(big.sharp).toBeLessThan(PHONE_VIEW.maxZoom);
    // die Bildfüllung aus der Vorlage liegt genau im Rahmen der Vorlage
    const f = fillFromTemplate(t, '/zones/probe/bild-v1.png')!;
    expect([f.ox, f.oy, f.ux, f.uy, f.vx, f.vy]).toEqual([t.ox, t.oy, t.ux, t.uy, t.vx, t.vy]);
    expect(f.tpl).toBe('v1');
  });

  it('Fingerabdruck: Verschieben und Skalieren ändern ihn nicht, ein Anker schon; die Abweichung in Bildpunkten', () => {
    const { plane, shape } = scene();
    const t = faceTemplate('v1', plane, shape, null, '2026-10-30')!.t;
    shape.x = 50;
    shape.sx = 1.3;
    expect(targetFingerprint(shape, t)).toBe(t.fp);
    expect(templateDrift(t, shape)).toEqual({ changed: false, px: 0 });
    shape.sx = 1;
    shape.path = shape.path.map((p, i) => (i === 0 ? { ...p, x: p.x - 0.5 } : p));
    const d = templateDrift(t, shape);
    expect(d.changed).toBe(true);
    expect(d.px).toBeGreaterThan(0.4 * t.ppm);
    expect(d.px).toBeLessThan(0.6 * t.ppm);
    expect(fingerprint([[[0, 0]]])).toMatch(/^[0-9a-f]{8}$/);
  });

  it('Saum: Stück im Seitenverhältnis des Bilds mit Teilung, Streifen so lang wie die Kante', () => {
    const { plane, shape } = scene();
    const r = rim({ width: 2 });
    shape.rims = [r];
    const piece = rimTemplate('v1', plane, shape, r, 'repeat', '2026-10-30')!;
    expect(piece.t.w / piece.t.h).toBeCloseTo(4, 1);
    expect(piece.caps).toEqual([Math.round(0.2 * piece.t.w), Math.round(0.8 * piece.t.w)]);
    expect(piece.edgeY).toBe(Math.round(0.7 * piece.t.h));
    const strip = rimTemplate('v2', plane, shape, r, 'stretch', '2026-10-30')!;
    expect(strip.t.w / strip.t.h).toBeCloseTo(rimLengths(shape, r)[0] / 2, 1);
    expect(templateDrift(strip.t, shape).changed).toBe(false);
    shape.sx = 1.5;
    expect(templateDrift(strip.t, shape).changed).toBe(true);
    expect(templateDrift(piece.t, shape).changed).toBe(false);
  });

  it('Vorlage als SVG: Malbereich, Silhouette, vier Passmarken, Zeile mit Größe und Fingerabdruck', () => {
    const { plane, shape } = scene();
    const d = faceTemplate('v7', plane, shape, null, '2026-10-30')!;
    const svg = templateSvg(d, 'probe');
    expect(svg).toContain(`width="${d.t.w + 2 * d.t.margin}"`);
    expect((svg.match(/<circle /g) ?? []).length).toBe(4);
    expect(svg).toContain(d.t.fp);
    expect(svg).toContain('v7');
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('Datensatz der Vorlage reist mit der Zonendatei', () => {
    const { nodes, plane, shape } = scene();
    const t = faceTemplate('v1', plane, shape, [0, 0], '2026-10-30')!.t;
    nodes.push(t);
    const back = parseNodes(JSON.parse(JSON.stringify(serializeNodes(nodes)))).find((n) => n.id === 'v1') as ZoneTemplate;
    expect(back).toEqual({ ...t, ppm: Math.round(t.ppm * 1000) / 1000 });
  });
});

describe('Import gemalter Teile mit Passmarken', () => {
  const t: ZoneTemplate = { id: 'v4', kind: 'template', name: 'Probe', shape: 's1', w: 200, h: 100, margin: 20, ppm: 10, fp: '00000000', made: '' };

  /** leeres Bild mit Passmarken an den Stellen der Vorlage, verkleinert um k und um (dx, dy) verschoben */
  function marked(W: number, H: number, k: number, dx: number, dy: number): RawImage {
    const data = new Uint8Array(W * H * 4);
    for (const [cx, cy] of markCenters(t)) {
      const x0 = Math.round(cx * k + dx);
      const y0 = Math.round(cy * k + dy);
      for (let y = y0 - 3; y <= y0 + 3; y++)
        for (let x = x0 - 3; x <= x0 + 3; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          data.set([255, 0, 255, 255], (y * W + x) * 4);
        }
    }
    return { width: W, height: H, data };
  }

  it('erkennt die Vorlage am Namen, an der Größe oder am Seitenverhältnis', () => {
    expect(matchTemplate([t], 'vorlage-probe-v4.png', 1, 1)?.id).toBe('v4');
    expect(matchTemplate([t], 'Vorlage probe v4 (1).png', 1, 1)?.id).toBe('v4');
    expect(matchTemplate([t], 'gemalt.png', 240, 140)?.id).toBe('v4');
    expect(matchTemplate([t], 'gemalt.png', 200, 100)?.id).toBe('v4');
    expect(matchTemplate([t], 'gemalt.png', 480, 280)?.id).toBe('v4');
    expect(matchTemplate([t], 'gemalt.png', 300, 300)).toBeNull();
  });

  it('Lage des Malbereichs: gleiche Größe, skaliert, über die Passmarken, sonst gestreckt', () => {
    expect(importRect(t, { width: 240, height: 140, data: new Uint8Array(240 * 140 * 4) })).toEqual({ x: 20, y: 20, w: 200, h: 100, how: 'exact' });
    expect(importRect(t, { width: 480, height: 280, data: new Uint8Array(480 * 280 * 4) })).toEqual({ x: 40, y: 40, w: 400, h: 200, how: 'scaled' });
    // beschnitten und verschoben: die Marken liegen um (−10, −6) versetzt, Maßstab 1,5
    const r = importRect(t, marked(352, 214, 1.5, -10, -6));
    expect(r.how).toBe('marks');
    expect(r.x).toBeCloseTo(20 * 1.5 - 10, 0);
    expect(r.y).toBeCloseTo(20 * 1.5 - 6, 0);
    expect(r.w).toBeCloseTo(300, 0);
    expect(r.h).toBeCloseTo(150, 0);
    expect(importRect(t, { width: 333, height: 211, data: new Uint8Array(333 * 211 * 4) }).how).toBe('stretched');
  });

  it('Passmarken: Mitten der Magenta-Flecken in den Ecken', () => {
    const m = findMarks(marked(240, 140, 1, 0, 0));
    expect(m.every(Boolean)).toBe(true);
    expect(m[0]![0]).toBeCloseTo(10, 0);
    expect(m[3]![1]).toBeCloseTo(130, 0);
  });
});
