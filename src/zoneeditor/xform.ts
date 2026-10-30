/**
 * Bewegen wie in Blender (Florian, 30.10.2026): G verschiebt, R dreht, S skaliert die gewählten Punkte; die Bewegung folgt
 * dem Zeiger ohne Drücken, X und Y halten eine Achse, Klick oder Eingabe übernimmt, Esc oder Rechtsklick bricht ab. Mit
 * proportionalem Bearbeiten (O an, Umschalt+O wechselt die Abfallkurve) gehen nicht gewählte Punkte im Einflusskreis mit,
 * das Mausrad (oder Bild↑/↓) ändert seinen Radius während der Bewegung. Ziehen eines gewählten Punkts ist dasselbe wie G.
 *
 * Die Rechnung steht in src/zone/proportional.ts; ein Ziel sind die gewählten Anker der Direktauswahl (src/zoneeditor/
 * pathTools.ts) oder die Punkte des Netz-Werkzeugs (src/zoneeditor/meshTool.ts). Der Editor führt die Bewegung.
 */
import type { ZonePlane } from '@/zone/nodes';
import type { Proportional, Xform } from '@/zone/proportional';
import type { Pt } from './overlay';

export interface XformTarget {
  /** Ebene, in der der Zeiger gemessen wird (Ebenen-Koordinaten, Meter) */
  plane: ZonePlane;
  /** Mitte der gewählten Punkte (Ebenen-Koordinaten): um sie dreht und skaliert es, an ihr hängt der Einflusskreis */
  pivot: Pt;
  /** Bewegung vom Stand beim Beginn aus anwenden; prop null: nur die gewählten Punkte */
  apply(xf: Xform, prop: Proportional | null): void;
  /** vor dem Übernehmen: warum es so nicht geht (ein Netz überschnitte sich), sonst null */
  check?(): string | null;
}

/** Mitte des Einflusskreises in Ebenen-Koordinaten: beim Verschieben wandert sie mit */
export function ringCenter(t: XformTarget, xf: Xform | null): Pt {
  return xf?.kind === 'grab' ? { x: t.pivot.x + xf.dx, y: t.pivot.y + xf.dy } : t.pivot;
}
