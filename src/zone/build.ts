/**
 * Zonen-Elemente als Klötzchen in der Welt (Schritt 6): jedes Element der Zonendatei wird mit den Platzhalter-Bauern
 * aus `src/world/elements.ts` gebaut. Dreiteiler bekommen vorerst eine Rechteck-Silhouette ohne Öffnung (die Öffnungen
 * und die anderen Metadaten kommen in Schritt 7).
 */
import { buildCave, buildColumn, buildFlat, buildPortal, buildThreePart, buildWater, buildWaterfall, type BuiltElement } from '@/world/elements';
import { kindDefaults, type ZoneElement } from './types';

export function buildZoneElement(el: ZoneElement): BuiltElement {
  const def = kindDefaults(el.kind);
  const color = el.color ?? def.color;
  const d = el.d ?? def.d ?? 8;
  switch (el.kind) {
    case 'threePart': {
      const outline: Array<[number, number]> = [
        [el.x - el.w / 2, el.y - 1],
        [el.x - el.w / 2, el.y + el.h * 0.7],
        [el.x - el.w * 0.2, el.y + el.h],
        [el.x + el.w * 0.2, el.y + el.h],
        [el.x + el.w / 2, el.y + el.h * 0.7],
        [el.x + el.w / 2, el.y - 1],
      ];
      return buildThreePart(outline, el.z, d, [], color);
    }
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
      return buildFlat(el.x, el.y, el.z, el.w, el.h, color, el.label ?? def.label);
  }
}
