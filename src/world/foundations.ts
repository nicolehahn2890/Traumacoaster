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

/** höchster Treffer aller Fundamente unter einem Punkt */
export function footBelow(foundations: readonly Foundation[], x: number, y: number, z: number): FootHit | null {
  let best: FootHit | null = null;
  for (const f of foundations) {
    const hit = f.surfaceBelow(x, y, z);
    if (hit && (!best || hit.y > best.y)) best = hit;
  }
  return best;
}
