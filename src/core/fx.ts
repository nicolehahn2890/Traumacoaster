/**
 * Grafikeffekte (Spur-Filter mit Stippling, Leuchtebenen): Einstellung 'auto' entscheidet nach dem Gerät
 * (unter sechs Kernen aus), ?fx=0/1 in der Adresse überstimmt alles (Tests, Vergleiche).
 */
import { storage } from './storage';

export function fxEnabled(): boolean {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('fx');
    if (q === '0') return false;
    if (q === '1') return true;
  }
  const s = storage.settings.fx ?? 'auto';
  if (s === 'high') return true;
  if (s === 'low') return false;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return cores >= 6;
}
