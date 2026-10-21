/**
 * Audio-Hook: Das Spiel ruft play(name) an den Stellen, an denen später ein Klang sitzt (Gurtriss, Fang,
 * Rauswurf, Entgleisen). Noch ohne Ausgabe; die Namen bleiben stabil, damit die Klänge nachgerüstet werden können.
 */
export type SoundName = 'beltSnap' | 'catch' | 'eject' | 'derail' | 'impact' | 'wheelLock';

const listeners = new Set<(name: SoundName) => void>();

export const audio = {
  play(name: SoundName): void {
    for (const l of listeners) l(name);
  },
  /** Für Tests und spätere Ausgabe: wird bei jedem play() gerufen */
  on(listener: (name: SoundName) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
