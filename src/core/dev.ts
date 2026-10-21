/**
 * Dev-Modus zum Testen: alle Welten, Level, Elemente und Starttypen frei, dazu jeder Bahntyp in jedem Level.
 * Eingeschaltet über den DEV-Knopf auf der Karte (bleibt gespeichert) oder beim Bauen mit VITE_UNLOCK_ALL=1.
 */
import { storage } from './storage';

export const unlockAll = (): boolean => import.meta.env.VITE_UNLOCK_ALL === '1' || storage.settings.devMode;

/** Alle Bahntypen in der Reihenfolge des Dev-Knopfs im Level */
export const DEV_SKINS = ['skinWood', 'skinHybrid', 'skinMine', 'skinSteel', 'skinGold', 'skinNeon', 'skinIce', 'skinGhost', 'skinLava', 'skinSpace'];

/** Im Dev-Modus gewählter Bahntyp für alle Level ('' = der Bahntyp der Welt) */
export const devSkin = (): string => (unlockAll() ? storage.settings.devSkin : '');
