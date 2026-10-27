import { describe, expect, it } from 'vitest';
import { fieldFrames, fieldNodesOf, parseNodes, serializeNodes, PHONE_ASPECT, type ZoneNode } from '@/zone/nodes';
import { emptyZone, fieldsOf, fieldToNode, parseZone, serializeZone } from '@/zone/types';

describe('Felder als Knoten (Stufe 4)', () => {
  it('Feldknoten lesen und schreiben, Ziele, Stufe und Schalter reisen in rest mit', () => {
    const raw = [{ id: 'f1', kind: 'field', name: 'Wiese', x0: 120, x1: 0, y0: -10, y1: 55, goals: [{ type: 'length', value: 80 }], stage: 2, belt: 1 }];
    const nodes = parseNodes(raw);
    const [f] = fieldNodesOf(nodes);
    expect(f).toMatchObject({ id: 'f1', name: 'Wiese', x0: 0, x1: 120, y0: -10, y1: 55 });
    expect(f.rest).toEqual({ goals: [{ type: 'length', value: 80 }], stage: 2, belt: 1 });
    expect(parseNodes(serializeNodes(nodes))).toEqual(nodes);
  });

  it('fieldsOf nimmt die Feldknoten, sonst die Felder des Klötzchen-Editors; fieldToNode hin und zurück', () => {
    const zone = emptyZone('feldprobe');
    zone.fields = [{ id: 'f1', name: 'Alt', x0: 0, x1: 50, y0: 0, y1: 30, goals: [{ type: 'loops', value: 1 }], stage: 1 }];
    expect(fieldsOf(zone)).toBe(zone.fields);
    const nodes: ZoneNode[] = [fieldToNode(zone.fields[0])];
    nodes[0].kind === 'field' && (nodes[0].x1 = 80);
    zone.nodes = nodes;
    const fs = fieldsOf(zone);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ id: 'f1', name: 'Alt', x1: 80, stage: 1 });
    expect(fs[0].goals).toEqual([{ type: 'loops', value: 1 }]);
    // durch die Zonendatei
    const back = parseZone(JSON.parse(serializeZone(zone)))!;
    expect(fieldsOf(back)[0]).toMatchObject({ id: 'f1', x1: 80, stage: 1 });
  });

  it('Handy-Rahmen: quer passt die Höhe, hoch die Breite ein, mit 2 % Rand', () => {
    const f = { x0: 0, x1: 120, y0: -10, y1: 55 };
    const [quer, hoch] = fieldFrames(f);
    const k = 0.96;
    // quer: 120 / 65 = 1,85 < 19,5 / 9: die Höhe passt ein, die Breite zeigt mehr
    expect(quer.y1 - quer.y0).toBeCloseTo(65 / k, 6);
    expect(quer.x1 - quer.x0).toBeCloseTo((65 / k) * PHONE_ASPECT, 6);
    // hoch: die Breite passt ein, die Höhe zeigt viel mehr
    expect(hoch.x1 - hoch.x0).toBeCloseTo(120 / k, 6);
    expect(hoch.y1 - hoch.y0).toBeCloseTo((120 / k) * PHONE_ASPECT, 6);
    // beide um die Mitte des Felds
    for (const r of [quer, hoch]) {
      expect((r.x0 + r.x1) / 2).toBeCloseTo(60, 6);
      expect((r.y0 + r.y1) / 2).toBeCloseTo(22.5, 6);
    }
  });
});
