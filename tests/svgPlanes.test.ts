import { describe, expect, it } from 'vitest';
import { ellipsePath, faceFill, newPlane, newShape, planesOf, rectPath, serializeNodes, setFaceFill, shapeFaces, shapesOf, type ZoneNode, type ZoneShape } from '@/zone/nodes';
import { parseColor, planesToSvg, slug, svgToPlanes } from '@/zone/svgPlanes';

/** zwei Ebenen: hinten eine Ellipse mit Loch, vorn ein Rechteck mit Teilungslinie, einer roten Fläche und einem Loch */
function scene(): ZoneNode[] {
  const nodes: ZoneNode[] = [];
  nodes.push(newPlane(nodes, 0, 'Vorn Höhle'));
  nodes.push(newPlane(nodes, 8, 'Hinten'));
  const [front, back] = planesOf(nodes);
  const e = newShape(nodes, back.id, ellipsePath(12, 7), 40, 12, '#8aa58c');
  e.holes = [ellipsePath(3, 2)];
  nodes.push(e);
  const r = newShape(nodes, front.id, rectPath(20, 10), 30, 5, '#3d5a63');
  r.cuts = [{ path: [{ x: -10, y: 1 }, { x: 0, y: -2, inX: -3, inY: 0, outX: 3, outY: 0 }, { x: 10, y: 0 }], closed: false }, { path: ellipsePath(2, 1.5).map((p) => ({ ...p, y: p.y + 3 })), closed: true }];
  nodes.push(r);
  const faces = shapeFaces(r);
  const lower = faces.find((f) => f.inner[1] < -2)!;
  setFaceFill(r, lower, '#a3665a');
  const ring = faces.find((f) => !f.holes.length && f.area < 12)!;
  setFaceFill(r, ring, null);
  return nodes;
}

const json = (nodes: readonly ZoneNode[]) => JSON.stringify(serializeNodes(nodes));

describe('SVG-Austausch der Ebenen', () => {
  it('Kennungen und Farben', () => {
    expect(slug('Vorn Höhle 2')).toBe('vorn-hoehle-2');
    expect(parseColor('#ABC')).toBe('#aabbcc');
    expect(parseColor('rgb(61, 90, 99)')).toBe('#3d5a63');
    expect(parseColor('none')).toBeNull();
  });

  it('Export: je Ebene eine Gruppe von hinten nach vorn, geteilte Form als Gruppe ihrer gefüllten Flächen mit Kurven', () => {
    const svg = planesToSvg(scene(), { zoneName: 'test' });
    expect(svg.indexOf('id="p2-hinten"')).toBeLessThan(svg.indexOf('id="p1-vorn-hoehle"'));
    expect(svg).toMatch(/<rect id="rahmen-x\d+-y\d+"/);
    expect(svg).toMatch(/<g id="s2">/);
    // drei Flächen außen herum, eine davon rot; der Ring ist ein Loch und fehlt
    expect((svg.match(/id="s2-f\d+"/g) ?? []).length).toBe(2);
    expect(svg).toContain('fill="#a3665a"');
    // Kurven statt Vielecke
    const face = /<path id="s2-f\d+" d="([^"]+)"/.exec(svg)![1];
    expect(face).toContain('C');
    expect((face.match(/[CL]/g) ?? []).length).toBeLessThan(20);
  });

  it('Rundlauf: der eigene Export kommt unverändert zurück, auch die Teilungslinien und Löcher', () => {
    const nodes = scene();
    const r = svgToPlanes(planesToSvg(nodes), nodes);
    expect(r.replaced).toBe(2);
    expect(r.added).toBe(0);
    expect(r.kept).toBe(2);
    expect(json(r.nodes)).toBe(json(nodes));
  });

  it('Rundlauf über Illustrator: ohne Datenattribute, in einer Ebenengruppe, verschoben – der Rahmen trägt den Ursprung', () => {
    const nodes = scene();
    let svg = planesToSvg(nodes);
    svg = svg.replace(/ data-(zone|scale|min-x|max-y)="[^"]*"/g, '').replace(/(<svg[^>]*>)/, '$1<g id="Ebene_1" transform="translate(37 -12)">').replace('</svg>', '</g></svg>');
    const r = svgToPlanes(svg, nodes);
    expect(r.kept).toBe(2);
    expect(json(r.nodes)).toBe(json(nodes));
  });

  it('geänderte Farbe einer Fläche: die Flächen kommen als eigene Formen, die anderen Formen bleiben', () => {
    const nodes = scene();
    const svg = planesToSvg(nodes).replace('fill="#a3665a"', 'fill="#00ff00"');
    const r = svgToPlanes(svg, nodes);
    expect(r.kept).toBe(1);
    const front = planesOf(r.nodes)[0];
    const shapes = shapesOf(r.nodes, front.id);
    expect(shapes.length).toBe(2);
    expect(shapes.map((s) => s.fill).sort()).toEqual(['#00ff00', '#3d5a63']);
    // die Form mit dem Ring-Loch hat ihn als Loch
    expect(shapes.some((s) => s.holes?.length === 1)).toBe(true);
  });

  it('fremdes SVG aus Illustrator: Ebenen werden neue Ebenen hinter dem Stapel, Klassen und Stile geben die Farben', () => {
    const nodes = scene();
    const svg = `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Ebene_1" xmlns="http://www.w3.org/2000/svg" xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" x="0px" y="0px" viewBox="0 0 400 200">
<style type="text/css">
	.st0{fill:#3D5A63;}
	.st1{fill:none;stroke:#000000;}
</style>
<switch><foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1"><i:pgfRef xlink:href="#adobe_illustrator_pgf"></i:pgfRef></foreignObject>
<g i:extraneous="self">
  <g id="Berge">
    <rect x="10" y="100" class="st0" width="200" height="80" rx="20"/>
    <path class="st1" d="M0,0L50,50"/>
  </g>
  <g id="Vorne_x20_Busch" data-name="Vorne Busch">
    <path style="fill:#8aa58c" d="M100,150c0-27.6,22.4-50,50-50s50,22.4,50,50s-22.4,50-50,50S100,177.6,100,150z M130,150a20,20 0 1,0 40,0a20,20 0 1,0 -40,0z"/>
    <circle cx="300" cy="150" r="30" fill="rgb(163,102,90)" transform="scale(1 0.5) translate(0 150)"/>
  </g>
</g></switch>
<i:pgf id="adobe_illustrator_pgf"><![CDATA[eJzsvWmTJMdx<>]]></i:pgf>
</svg>`;
    const r = svgToPlanes(svg, nodes);
    expect(r.added).toBe(2);
    expect(r.warnings.join(' ')).toMatch(/Illustrator-Bearbeitungsdaten/);
    expect(r.warnings.join(' ')).toMatch(/ohne Füllung/);
    const planes = planesOf(r.nodes);
    const berge = planes.find((p) => p.name === 'Berge')!;
    const busch = planes.find((p) => p.name === 'Vorne Busch')!;
    expect(berge.z).toBeGreaterThan(busch.z);
    expect(busch.z).toBeGreaterThan(8);
    const rect = shapesOf(r.nodes, berge.id)[0];
    expect(rect.fill).toBe('#3d5a63');
    // abgerundete Ecken: acht Anker
    expect(rect.path.length).toBe(8);
    const bush = shapesOf(r.nodes, busch.id);
    expect(bush.length).toBe(2);
    const donut = bush.find((s) => s.fill === '#8aa58c') as ZoneShape;
    expect(donut.holes?.length).toBe(1);
    // 100 px = 10 m breit
    const xs = donut.path.map((p) => p.x * donut.sx + donut.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 3);
    expect(bush.find((s) => s.fill === '#a3665a')).toBeTruthy();
    // die alten Ebenen bleiben unberührt
    expect(json(r.nodes.filter((n) => n.id === 'p1' || n.id === 'p2' || n.id === 's1' || n.id === 's2'))).toBe(json(nodes));
  });

  it('Ebenen-Gruppen werden Gruppen um ihre Ebenen und kommen unverändert zurück', async () => {
    const { groupPlanes } = await import('@/zone/planeGroups');
    const nodes = scene();
    const [front, back] = planesOf(nodes);
    groupPlanes(nodes, [front.id, back.id], null, 'Fels');
    const svg = planesToSvg(nodes);
    expect(svg).toMatch(/<g id="g1-fels" data-name="Fels">\s*<g id="p2-hinten"/);
    const r = svgToPlanes(svg, nodes);
    expect(r.kept).toBe(2);
    expect(json(r.nodes)).toBe(json(nodes));
  });

  it('Formgruppen werden verschachtelte Gruppen und kommen unverändert zurück; in Illustrator umgruppiert gilt das neue', async () => {
    const { groupShapes } = await import('@/zone/shapeGroups');
    const nodes = scene();
    const front = planesOf(nodes)[0];
    const b1 = newShape(nodes, front.id, rectPath(2, 2), 60, 0, '#8aa58c');
    nodes.push(b1);
    const b2 = newShape(nodes, front.id, ellipsePath(1, 1), 64, 0, '#8aa58c');
    nodes.push(b2);
    const inner = groupShapes(nodes, [b1.id, b2.id])!;
    const outer = groupShapes(nodes, [b1.id, b2.id, 's2'])!;
    const svg = planesToSvg(nodes);
    expect(svg).toMatch(new RegExp(`<g id="${outer}">\\s*<g id="s2">[\\s\\S]*<g id="${inner}">\\s*<path id="${b1.id}"`));
    const r = svgToPlanes(svg, nodes);
    expect(r.kept).toBe(4);
    expect(json(r.nodes)).toBe(json(nodes));
    // in Illustrator die Ellipse aus der inneren Gruppe gezogen (sie steht jetzt nach ihr in der äußeren)
    const moved = svg.replace(new RegExp(`(<path id="${b2.id}"[^>]*/>)(\\s*</g>)`), '$2\n$1');
    const r2 = svgToPlanes(moved, nodes);
    const e2 = r2.nodes.find((n) => n.id === b2.id) as ZoneShape;
    const e1 = r2.nodes.find((n) => n.id === b1.id) as ZoneShape;
    expect(e2.groups).toEqual([outer]);
    expect(e1.groups).toEqual([outer, inner]);
  });

  it('Gruppen aus Illustrator ohne Kennung werden Formgruppen, eine Hülle um alles nicht', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
<g><g id="Wald">
  <g><path fill="#335533" d="M10,10h20v20h-20z"/><path fill="#335533" d="M40,10h20v20h-20z"/></g>
  <path fill="#557755" d="M80,10h20v20h-20z"/>
</g></g></svg>`;
    const r = svgToPlanes(svg, []);
    const wald = planesOf(r.nodes).find((p) => p.name === 'Wald')!;
    const shapes = shapesOf(r.nodes, wald.id);
    expect(shapes.length).toBe(3);
    expect(shapes[0].groups).toEqual(shapes[1].groups);
    expect(shapes[0].groups?.length).toBe(1);
    expect(shapes[2].groups).toBeUndefined();
  });

  it('ein Loch der Form, das als eigene Fläche gefärbt ist, bleibt beim Rundlauf erhalten', () => {
    const nodes = scene();
    const s = nodes.find((n): n is ZoneShape => n.kind === 'shape' && n.id === 's2')!;
    const fills = shapeFaces(s).map((f) => faceFill(s, f));
    expect(fills.filter((x) => x === null).length).toBe(1);
  });
});

describe('SVG-Austausch: Füllstapel und Verläufe (Stufe 3)', () => {
  const grad = (x0: number, x1: number) => ({ type: 'gradient' as const, stops: [{ t: 0, color: '#ffffff', a: 1 }, { t: 1, color: '#203040', a: 1 }], x0, y0: 0, x1, y1: 0, blend: 'normal' as const, opacity: 1 });

  function stacked(): { nodes: ZoneNode[]; a: ZoneShape; b: ZoneShape } {
    const nodes: ZoneNode[] = [newPlane([], 0, 'Fels')];
    const a = newShape(nodes, 'p1', rectPath(20, 10), 30, 5, '#3d5a63');
    a.fills = [grad(-10, 10)];
    nodes.push(a);
    const b = newShape(nodes, 'p1', ellipsePath(6, 4), 60, 5, '#808080');
    b.fills = [{ type: 'color', color: '#ff8040', blend: 'multiply', opacity: 0.5 }, { ...grad(-6, 6), blend: 'overlay', opacity: 0.8 }];
    nodes.push(b);
    return { nodes, a, b };
  }

  it('Export: ein deckender Verlauf sitzt auf dem Pfad, weitere Füllungen sind eigene Pfade mit Mischmodus und Deckkraft', () => {
    const svg = planesToSvg(stacked().nodes);
    expect(svg).toMatch(/<defs>[\s\S]*<linearGradient id="v1" gradientUnits="userSpaceOnUse"/);
    expect(svg).toMatch(/<path id="s1" d="[^"]+" fill="url\(#v1\)"/);
    expect(svg).toMatch(/<path id="s2" d="[^"]+" fill="#808080"/);
    expect(svg).toMatch(/<path id="s2-L1" d="[^"]+" fill="#ff8040" fill-rule="evenodd" opacity="0.5" style="mix-blend-mode:multiply"\/>/);
    expect(svg).toMatch(/<path id="s2-L2" d="[^"]+" fill="url\(#v\d\)" fill-rule="evenodd" opacity="0.8" style="mix-blend-mode:overlay"\/>/);
  });

  it('Rundlauf: Verläufe und Füllungen kommen unverändert zurück, die Formen bleiben', () => {
    const { nodes } = stacked();
    const r = svgToPlanes(planesToSvg(nodes), nodes);
    expect(r.kept).toBe(2);
    expect(json(r.nodes)).toBe(json(nodes));
  });

  it('in Illustrator verschoben: der Verlauf kommt mit den neuen Griffen zurück', () => {
    const { nodes } = stacked();
    const svg = planesToSvg(nodes).replace(/(<linearGradient id="v1"[^>]*x2=")([\d.]+)"/, (_m, a: string, x: string) => `${a}${Number(x) - 50}"`);
    const r = svgToPlanes(svg, nodes);
    const a = shapesOf(r.nodes, 'p1')[0];
    const g = a.fills?.[0];
    expect(r.kept).toBe(1);
    expect(g?.type).toBe('gradient');
    if (g?.type !== 'gradient') return;
    // 50 px = 5 m kürzer, in Pfad-Koordinaten der neuen Form
    expect(a.x + a.sx * g.x1 - (a.x + a.sx * g.x0)).toBeCloseTo(15, 3);
    expect(a.fill).toBe('#ffffff');
  });

  it('Illustrator-Verlauf am Rahmen mit Drehung und Stopps über xlink:href wird ein Verlauf', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 200">
      <defs>
        <linearGradient id="SVGID_1_"><stop offset="0" style="stop-color:#FF0000"/><stop offset="100%" style="stop-color:#0000FF;stop-opacity:0.5"/></linearGradient>
        <linearGradient id="SVGID_2_" xlink:href="#SVGID_1_" gradientTransform="rotate(90 0.5 0.5)"/>
      </defs>
      <g id="Wand"><rect x="100" y="50" width="200" height="100" fill="url(#SVGID_2_)"/></g>
    </svg>`;
    const r = svgToPlanes(svg, []);
    const s = r.nodes.find((n): n is ZoneShape => n.kind === 'shape')!;
    const g = s.fills?.[0];
    expect(r.warnings.join(' ')).not.toMatch(/Verläufe/);
    expect(s.fill).toBe('#ff0000');
    expect(g?.type).toBe('gradient');
    if (g?.type !== 'gradient') return;
    expect(g.stops.map((st) => [st.t, st.color, st.a])).toEqual([
      [0, '#ff0000', 1],
      [1, '#0000ff', 0.5],
    ]);
    // gedreht um die Mitte des Rahmens: von oben nach unten (Ebene: y nach oben, 1 m = 10 px)
    const [x0, y0, x1, y1] = [s.x + s.sx * g.x0, s.y + s.sy * g.y0, s.x + s.sx * g.x1, s.y + s.sy * g.y1];
    expect(x0).toBeCloseTo(x1, 6);
    expect(y0 - y1).toBeCloseTo(10, 6);
  });
});
