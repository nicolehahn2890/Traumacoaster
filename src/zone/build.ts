/**
 * Zonen-Elemente als Klötzchen in der Welt (Schritt 6): jedes Element der Zonendatei wird mit den Platzhalter-Bauern
 * aus `src/world/elements.ts` gebaut. Dreiteiler bekommen vorerst eine Rechteck-Silhouette ohne Öffnung (die Öffnungen
 * und die anderen Metadaten kommen in Schritt 7).
 */
import { buildCave, buildColumn, buildFlat, buildPortal, buildThreePart, buildWater, buildWaterfall, type BuiltElement } from '@/world/elements';
import type { Foundation } from '@/world/foundations';
import { kindDefaults, type ZoneElement } from './types';

/** Silhouette eines Dreiteiler-Platzhalters: Rechteck mit abgeschrägten Schultern (bis zu den Bildern der Zone) */
export function threePartOutline(el: ZoneElement): Array<[number, number]> {
  return [
    [el.x - el.w / 2, el.y - 1],
    [el.x - el.w / 2, el.y + el.h * 0.7],
    [el.x - el.w * 0.2, el.y + el.h],
    [el.x + el.w * 0.2, el.y + el.h],
    [el.x + el.w / 2, el.y + el.h * 0.7],
    [el.x + el.w / 2, el.y - 1],
  ];
}

/** Oberkante eines Elements bei x (Meter), null außerhalb: Kulisse flach, Dreiteiler mit Schultern */
export function topAt(el: ZoneElement, x: number): number | null {
  if (Math.abs(x - el.x) > el.w / 2) return null;
  if (el.kind !== 'threePart') return el.y + el.h;
  const pts = threePartOutline(el).slice(1, 5);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y0;
  }
  return el.y + el.h;
}

/** tragfähige Oberkante als Fundament: Füße dürfen darauf stehen, wenn die Bahn in der Tiefe nah genug ist (±0,5 Spuren) */
function elementFoundation(el: ZoneElement): Foundation {
  return {
    surfaceBelow(px, py, pz) {
      if (Math.abs(pz - el.z) > 0.5) return null;
      const top = topAt(el, px);
      if (top === null || top >= py) return null;
      return { y: top, kind: 'element' };
    },
  };
}

export function buildZoneElement(el: ZoneElement): BuiltElement {
  const def = kindDefaults(el.kind);
  const color = el.color ?? def.color;
  const d = el.d ?? def.d ?? 8;
  const built = buildRaw(el, color, d);
  if (el.foundation && (el.kind === 'flat' || el.kind === 'threePart' || el.kind === 'column')) built.foundation = elementFoundation(el);
  return built;
}

function buildRaw(el: ZoneElement, color: string, d: number): BuiltElement {
  switch (el.kind) {
    case 'threePart':
      return buildThreePart(threePartOutline(el), el.z, d, (el.openings ?? []).map((o) => ({ x: el.x + o.dx, y: el.y + o.dy, r: o.r })), color);
    case 'column':
      return buildColumn(el.x, el.y, el.z, el.w / 2, el.h, color);
    case 'cave':
      return buildCave(el.x, el.y, el.z, el.w, el.h, d, color);
    case 'water':
      return buildWater(el.x, el.y, el.z, el.w, d, color);
    case 'waterfall':
      return buildWaterfall(el.x, el.y, el.z, el.w, el.h, color);
    case 'portal':
      return buildPortal(el.x, el.y + el.w / 2, el.z, el.w / 2, 0.3, color);
    default:
      return buildFlat(el.x, el.y, el.z, el.w, el.h, color, el.label ?? kindDefaults(el.kind).label);
  }
}
