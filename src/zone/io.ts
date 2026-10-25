/**
 * Zonendatei laden und speichern. Laden: statisch aus `public/zones/<name>/zone.json` (Dev-Server, Build und Handy).
 * Speichern: nur am Mac im Dev-Server über `POST /__zone/<name>` (vite.config.ts schreibt die Datei). Hot-Reload: Ändert
 * sich die Datei (Speichern aus dem Editor, Bearbeiten von Hand, eine zweite Sitzung), meldet der Dev-Server das
 * Ereignis `tc:zone`, und das laufende Spiel lädt die Zone neu, ohne die Seite zu laden.
 */
import { parseZone, serializeZone, type ZoneFile } from './types';

const zoneUrl = (name: string): string => `${import.meta.env.BASE_URL}zones/${name}/zone.json`;

export async function loadZone(name: string): Promise<ZoneFile | null> {
  try {
    const res = await fetch(zoneUrl(name), { cache: 'no-store' });
    if (!res.ok) return null;
    return parseZone(await res.json());
  } catch {
    return null;
  }
}

/** true, wenn der Dev-Server die Datei geschrieben hat */
export async function saveZone(zone: ZoneFile): Promise<boolean> {
  try {
    const res = await fetch(`/__zone/${zone.name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: serializeZone(zone) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Hot-Reload: Rückruf, wenn eine Zonendatei auf der Platte geändert wurde (nur im Dev-Server) */
export function onZoneChange(cb: (name: string) => void): void {
  if (import.meta.hot) import.meta.hot.on('tc:zone', (data: { name: string }) => cb(data.name));
}
