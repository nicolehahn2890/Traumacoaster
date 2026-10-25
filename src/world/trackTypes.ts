/**
 * Die vier Bahntypen des Weltrenderers (Richtlinie 3a, Plan Paket 3): Straße, Stahl, Holz, Hängebahn. Die Basiszone
 * nennt ihren Typ selbst (Paket 2.4); bis dahin folgt er dem Skin des Levels, `?track=` überstimmt ihn zum Vergleich.
 */
export type TrackType = 'road' | 'steel' | 'wood' | 'hanging';

/**
 * Hängebahn: Der gezeichnete Strich ist der Tragbalken (die Bahnlinie der Physik), die Gondel hängt so tief darunter
 * (Meter: Hänger plus Wagenhöhe). Der Pinsel hält den Strich entsprechend höher über dem Boden (Tor 1a, Florian:
 * der Strich muss immer genau da sein, wo gezeichnet wird).
 */
export const HANG_DROP = 2.4;

export const TRACK_TYPES: readonly TrackType[] = ['road', 'steel', 'wood', 'hanging'];

export function parseTrackType(s: string | null | undefined): TrackType | null {
  return (TRACK_TYPES as readonly string[]).includes(s ?? '') ? (s as TrackType) : null;
}

/** Bahntyp zum Skin der heutigen Welten */
export function trackTypeForSkin(skin: string): TrackType {
  switch (skin) {
    case 'skinWood':
    case 'skinHybrid':
    case 'skinMine':
    case 'skinGhost':
      return 'wood';
    default:
      return 'steel';
  }
}
