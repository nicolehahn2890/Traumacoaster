import de from './locales/de.json';
import en from './locales/en.json';

type Dict = Record<string, string>;
const dicts: Record<string, Dict> = { de, en };
let current = 'de';

export function setLanguage(lang: string): void {
  if (dicts[lang]) current = lang;
}
export function getLanguage(): string {
  return current;
}

/** Übersetzt einen Schlüssel, {name} wird durch params.name ersetzt. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.de[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}
