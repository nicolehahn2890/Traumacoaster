/**
 * Fundamentflächen (Richtlinie 3, Plan 2.1 und Schritt 3): Flächen, auf denen Stützenfüße stehen dürfen. Je Stütze
 * geht ein Strahl vom Anschlusspunkt senkrecht nach unten in alle Fundamente; der höchste Treffer trägt den Fuß.
 * Wasser und Leere sind ungültig (die Stelle gilt als schwebend). Etappe 1: Boden und Berge des Terrains. Kulissen
 * und Höhlenböden melden ihre Flächen später als eigene Fundamente über ihre Metadaten (Fundament-Polygon je Element),
 * nicht mehr über einen Alpha-Scan ihres Bilds wie im Labor.
 */
export type FootKind = 'ground' | 'rock' | 'element' | 'cave';

export interface FootHit {
  /** Höhe der tragenden Fläche (Meter) */
  y: number;
  kind: FootKind;
}

export interface Foundation {
  /** höchste tragende Fläche unter (x, y) auf Spur z (Spuren), oder null, wenn nichts trägt */
  surfaceBelow(x: number, y: number, z: number): FootHit | null;
  /** sperrt die Stelle für Füße (Wasserfläche), auch wenn ein anderes Fundament darunter trüge */
  blocks?(x: number, z: number): boolean;
  /**
   * Halter (Zonen-Editor, Stufe 4; Florian 28.10.: „Stützen bekommen Wand- und Deckenhalter“): Wo unter dem Anschluss
   * (x, y) auf Spur z nichts trägt, eine feste Wand knapp hinter der Bahn, an der eine Konsole hält (Punkt auf der Wand
   * unter dem Anschluss: Höhe und Spur), oder eine Decke darüber, an der ein Hänger hängt (Unterseite: Höhe und Spur)
   */
  wallAnchor?(x: number, y: number, z: number): HolderHit | null;
  ceilingAnchor?(x: number, y: number, z: number): HolderHit | null;
  /** Kante einer Ebene etwas weiter hinter der Bahn, auf der eine Stütze in der Tiefe der Bahn stehen kann (nach der Wand) */
  footBehind?(x: number, y: number, z: number): FootHit | null;
}

export interface HolderHit {
  /** Höhe des Halterpunkts an Wand oder Decke (Meter) */
  y: number;
  /** Spur der Wand oder Decke */
  z: number;
}

/**
 * Halter für eine Stelle ohne Fuß: erst eine Wand dahinter (Konsole), dann eine Kante etwas weiter hinter der Bahn (eine
 * gewöhnliche Stütze, kind foot), dann eine Decke darüber (Hänger); null, wenn alles fehlt
 */
export function holderAt(foundations: readonly Foundation[], x: number, y: number, z: number): (HolderHit & { kind: 'wall' | 'ceiling' | 'foot' }) | null {
  for (const f of foundations) {
    const w = f.wallAnchor?.(x, y, z);
    if (w) return { ...w, kind: 'wall' };
  }
  for (const f of foundations) {
    const b = f.footBehind?.(x, y, z);
    if (b) return { y: b.y, z, kind: 'foot' };
  }
  for (const f of foundations) {
    const c = f.ceilingAnchor?.(x, y, z);
    if (c) return { ...c, kind: 'ceiling' };
  }
  return null;
}

/** das Terrain des Levels, wie es der Planer der Bühne liest (Boden plus Berg, kein Wasser) */
export interface TerrainSurface {
  groundHeight(x: number, z: number): number;
  mountainHeight(x: number, z: number): number;
  waterAt(x: number, z: number): boolean;
}

export class TerrainFoundation implements Foundation {
  constructor(private readonly terrain: TerrainSurface) {}

  surfaceBelow(x: number, y: number, z: number): FootHit | null {
    if (this.terrain.waterAt(x, z)) return null;
    const m = this.terrain.mountainHeight(x, z);
    const top = this.terrain.groundHeight(x, z) + m;
    if (top >= y) return null;
    return { y: top, kind: m > 0.3 ? 'rock' : 'ground' };
  }
}

/** das Freiraumfeld einer Zone als Fundament: Füße stehen auf dem, was unter dem Punkt fest wird (Erde, Fels, Raumboden), auf jedem Element */
export class FieldFoundation implements Foundation {
  constructor(private readonly field: { floorBelow(x: number, y: number, lane: number): { y: number; kind: 'ground' | 'rock' | 'cave' } | null }) {}

  surfaceBelow(x: number, y: number, z: number): FootHit | null {
    const hit = this.field.floorBelow(x, y, z);
    return hit ? { y: hit.y, kind: hit.kind } : null;
  }
}

/** höchster Treffer aller Fundamente unter einem Punkt */
export function footBelow(foundations: readonly Foundation[], x: number, y: number, z: number): FootHit | null {
  for (const f of foundations) if (f.blocks?.(x, z)) return null;
  let best: FootHit | null = null;
  for (const f of foundations) {
    const hit = f.surfaceBelow(x, y, z);
    if (hit && (!best || hit.y > best.y)) best = hit;
  }
  return best;
}
