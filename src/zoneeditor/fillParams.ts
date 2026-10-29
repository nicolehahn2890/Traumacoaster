/**
 * Wertezeile im Füllstapel (Stufe 5): welche Werte eine Füllung zeigt (Wort, Einheit, Schritt beim Ziehen, Grenzen) und
 * wie ein geänderter Wert in die Füllung kommt. Grenzen wie beim Lesen der Datei (`parseFill`). Anteile erscheinen als
 * Prozent. Die Tiefe eines Kantenverlaufs ist in Metern der Ebene; gespeichert ist sie als Länge der Griffe in
 * Pfad-Koordinaten, darum braucht es den Maßstab der Form. Ohne DOM.
 */
import { DOT_SOURCES, GRADIENT_DOTS, GRAIN_TILES, isGradient, type DotSource, type GrainTile, type ZoneFill } from '@/zone/paint';
import type { StackParam } from './stackPanel';
import type { CrownParams } from '@/zone/crown';
import type { EdgeWave } from '@/zone/edgeWave';

const SOURCE_WORDS: Record<DotSource, string> = { even: 'gleichmäßig', light: 'Lichtkante', shade: 'Schattenseite', edge: 'alle Kanten', dark: 'im Dunklen' };
const TILE_WORDS: Record<GrainTile, string> = { paper: 'Papier', gouache: 'Gouache' };

/** Maßstab der Form (Pfad → Meter der Ebene); für den Ebenenstapel 1, 1 */
export interface ParamScale {
  sx: number;
  sy: number;
}

const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Tiefe eines Kantenverlaufs in Metern der Ebene */
function edgeDepth(f: { x0: number; y0: number; x1: number; y1: number }, s: ParamScale): number {
  return Math.hypot(s.sx * (f.x1 - f.x0), s.sy * (f.y1 - f.y0));
}

/** Name und Werte einer Füllung für die Liste */
export function fillParams(f: ZoneFill, s: ParamScale = { sx: 1, sy: 1 }): { name?: string; params?: StackParam[] } {
  if (f.type === 'color') return {};
  if (isGradient(f)) {
    const fade = f.type === 'fade';
    const name = f.dots ? (fade ? 'Deckkraft als Pünktchen' : 'Verlauf als Pünktchen') : f.edge ? (fade ? 'Deckkraft an der Kante' : 'Kantenverlauf') : f.steps ? (fade ? 'Deckkraft in Stufen' : 'Bänder') : undefined;
    const params: StackParam[] = [
      { key: 'kind', label: 'Art', title: 'Richtung der Griffe (linear, radial) oder Abstand zur Kante', value: f.edge ? 'edge' : f.radial ? 'radial' : 'linear', options: [{ value: 'linear', word: 'linear' }, { value: 'radial', word: 'radial' }, { value: 'edge', word: 'Kante' }] },
    ];
    if (f.edge) params.push({ key: 'depth', label: 'Tiefe m', title: 'So weit reicht der Verlauf von der Kante nach innen (Meter)', value: r(edgeDepth(f, s)), step: 0.05, min: 0.1, max: 16, digits: 1 });
    params.push({ key: 'steps', label: 'Stufen', title: 'Harte Stufen (0 = stufenlos)', value: f.steps ?? 0, step: 0.05, min: 0, max: 16, digits: 0 });
    if (f.steps) {
      params.push({ key: 'inner', label: 'innen %', title: 'Verlauf in der Stufe: Anteil des Abstands zur Nachbarstufe', value: Math.round((f.inner ?? 0.35) * 100), step: 0.5, min: 0, max: 100, digits: 0 });
      params.push({ key: 'wave', label: 'Welle %', title: 'Die Stufengrenzen schwingen um diesen Anteil einer Stufe', value: Math.round((f.wave ?? 0) * 100), step: 0.5, min: 0, max: 100, digits: 0 });
    }
    params.push({ key: 'dots', label: 'Pünktchen m', title: 'Verlauf als Pünktchen (Dot Shading): Durchmesser der Punkte, 0 = aus; die Deckkraft des Verlaufs wird zur Dichte', value: f.dots ? r(f.dots.size) : 0, step: 0.005, min: 0, max: 20, digits: 2 });
    if (f.dots) params.push({ key: 'dotgap', label: 'Abstand ×', title: 'Zellgröße als Vielfaches des Durchmessers (klein = dicht)', value: r(f.dots.gap), step: 0.01, min: 1.05, max: 6, digits: 2 });
    return { name, params };
  }
  if (f.type === 'light' || f.type === 'shade')
    return {
      params: [
        { key: 'width', label: 'Breite m', title: 'Breite der Sichel (Meter); 0 = Saum rundum so breit wie „weich“, negativ = Sichel auf der anderen Seite', value: r(f.width), step: 0.02, min: -40, max: 40, digits: 2 },
        { key: 'soft', label: 'weich m', title: 'Weiche innere Grenze (0 = hart wie im Siebdruck)', value: r(f.soft), step: 0.02, min: 0, max: 40, digits: 2 },
      ],
    };
  if (f.type === 'dots')
    return {
      params: [
        { key: 'size', label: 'Größe m', title: 'Durchmesser der Punkte (Meter)', value: r(f.size), step: 0.005, min: 0.02, max: 20, digits: 2 },
        { key: 'gap', label: 'Abstand ×', title: 'Zellgröße als Vielfaches des Durchmessers (klein = dicht)', value: r(f.gap), step: 0.01, min: 1.05, max: 6, digits: 2 },
        { key: 'density', label: 'Dichte %', title: 'Anteil der Zellen mit Punkt, wo die Quelle voll ist', value: Math.round(f.density * 100), step: 0.5, min: 0, max: 100, digits: 0 },
        { key: 'jitter', label: 'Streuung %', title: 'Größenstreuung der Punkte', value: Math.round(f.jitter * 100), step: 0.5, min: 0, max: 100, digits: 0 },
        { key: 'source', label: 'an', title: 'Woher die Dichte kommt', value: f.source, options: DOT_SOURCES.map((v) => ({ value: v, word: SOURCE_WORDS[v] })) },
        ...(f.source === 'even' || f.source === 'dark' ? [] : [{ key: 'reach', label: 'Reichweite m', title: 'So weit von der Kante reicht die Quelle (Meter)', value: r(f.reach), step: 0.02, min: 0.05, max: 40, digits: 1 }]),
        ...(f.color ? [] : [{ key: 'tone', label: 'Ton', title: 'Farbe aus dem Untergrund: zur Lichtfarbe (+) oder zur Schattenfarbe (−), −100 bis 100', value: Math.round(f.tone * 100), step: 0.5, min: -100, max: 100, digits: 0 }]),
        { key: 'seed', label: 'Muster', title: 'Anderes Muster gleicher Art', value: f.seed, step: 0.05, min: 0, max: 9999, digits: 0 },
      ],
    };
  if (f.type === 'mist') return { name: `Farbnebel · ${f.dabs.length} Tupfer` };
  if (f.type === 'sparkle')
    return {
      params: [
        { key: 'size', label: 'Größe m', title: 'Größe eines Glanzpunkts (Meter)', value: r(f.size), step: 0.005, min: 0.05, max: 10, digits: 2 },
        { key: 'gap', label: 'Abstand ×', title: 'Zellgröße als Vielfaches der Größe (groß = seltener)', value: r(f.gap, 1), step: 0.02, min: 1.5, max: 20, digits: 1 },
        { key: 'density', label: 'Dichte %', title: 'Anteil der Zellen mit Glanzpunkt', value: Math.round(f.density * 100), step: 0.5, min: 0, max: 100, digits: 0 },
        { key: 'speed', label: 'Tempo', title: 'Aufleuchten je Sekunde', value: r(f.speed), step: 0.005, min: 0.05, max: 10, digits: 2 },
        { key: 'seed', label: 'Muster', title: 'Anderes Muster gleicher Art', value: f.seed, step: 0.05, min: 0, max: 9999, digits: 0 },
      ],
    };
  return {
    name: TILE_WORDS[f.tile],
    params: [
      { key: 'tile', label: 'Kachel', title: 'Papier oder Gouache (Platzhalter bis zu Florians Scans)', value: f.tile, options: GRAIN_TILES.map((v) => ({ value: v, word: TILE_WORDS[v] })) },
      { key: 'scale', label: 'Größe m', title: 'Größe einer Kachel (Meter)', value: r(f.scale, 1), step: 0.05, min: 0.2, max: 400, digits: 1 },
      { key: 'angle', label: 'Drehung °', title: 'Drehung der Kachel (Grad)', value: Math.round(f.angle), step: 0.5, digits: 0 },
    ],
  };
}

/** einen Wert setzen (ändert f in place) */
export function setFillParam(f: ZoneFill, key: string, v: number | string, s: ParamScale = { sx: 1, sy: 1 }): void {
  const n = typeof v === 'number' ? v : Number.NaN;
  const ok = Number.isFinite(n);
  if (isGradient(f)) {
    if (key === 'kind') {
      delete f.radial;
      delete f.edge;
      if (v === 'radial') f.radial = true;
      if (v === 'edge') {
        f.edge = true;
        // ohne brauchbare Tiefe: 3 m
        if (edgeDepth(f, s) < 0.1 || edgeDepth(f, s) > 16) {
          f.x1 = f.x0 + 3 / (Math.abs(s.sx) || 1);
          f.y1 = f.y0;
        }
      }
    } else if (key === 'depth' && ok) {
      const d = edgeDepth(f, s);
      const m = clamp(n, 0.1, 16);
      if (d > 1e-6) {
        f.x1 = f.x0 + ((f.x1 - f.x0) * m) / d;
        f.y1 = f.y0 + ((f.y1 - f.y0) * m) / d;
      } else {
        f.x1 = f.x0 + m / (Math.abs(s.sx) || 1);
        f.y1 = f.y0;
      }
    } else if (key === 'steps' && ok) {
      const k = Math.round(clamp(n, 0, 16));
      if (k >= 2) f.steps = k;
      else delete f.steps;
    } else if (key === 'inner' && ok) f.inner = clamp(n / 100, 0, 1);
    else if (key === 'wave' && ok) {
      if (n > 0) f.wave = clamp(n / 100, 0, 1);
      else delete f.wave;
    } else if (key === 'dots' && ok) {
      if (n > 0) f.dots = { ...(f.dots ?? GRADIENT_DOTS), size: clamp(n, 0.02, 20) };
      else delete f.dots;
    } else if (key === 'dotgap' && ok && f.dots) f.dots.gap = clamp(n, 1.05, 6);
    return;
  }
  if (f.type === 'light' || f.type === 'shade') {
    if (key === 'width' && ok) f.width = clamp(n, -40, 40);
    else if (key === 'soft' && ok) f.soft = clamp(n, 0, 40);
    return;
  }
  if (f.type === 'dots') {
    if (key === 'size' && ok) f.size = clamp(n, 0.02, 20);
    else if (key === 'gap' && ok) f.gap = clamp(n, 1.05, 6);
    else if (key === 'density' && ok) f.density = clamp(n / 100, 0, 1);
    else if (key === 'jitter' && ok) f.jitter = clamp(n / 100, 0, 1);
    else if (key === 'reach' && ok) f.reach = clamp(n, 0.05, 40);
    else if (key === 'tone' && ok) f.tone = clamp(n / 100, -1, 1);
    else if (key === 'seed' && ok) f.seed = Math.round(clamp(n, 0, 9999));
    else if (key === 'source' && (DOT_SOURCES as readonly string[]).includes(String(v))) f.source = v as DotSource;
    return;
  }
  if (f.type === 'sparkle') {
    if (key === 'size' && ok) f.size = clamp(n, 0.05, 10);
    else if (key === 'gap' && ok) f.gap = clamp(n, 1.5, 20);
    else if (key === 'density' && ok) f.density = clamp(n / 100, 0, 1);
    else if (key === 'speed' && ok) f.speed = clamp(n, 0.05, 10);
    else if (key === 'seed' && ok) f.seed = Math.round(clamp(n, 0, 9999));
    return;
  }
  if (f.type === 'grain') {
    if (key === 'tile' && (GRAIN_TILES as readonly string[]).includes(String(v))) f.tile = v as GrainTile;
    else if (key === 'scale' && ok) f.scale = clamp(n, 0.2, 400);
    else if (key === 'angle' && ok) f.angle = ((n % 360) + 360) % 360;
  }
}

/** Werte einer Punktkrone für die Wertezeile (Platzhalter-Grenzen wie parseCrown) */
export function crownParamsOf(c: CrownParams): StackParam[] {
  return [
    { key: 'size', label: 'Größe m', title: 'Durchmesser der Punkte (Meter)', value: r(c.size), step: 0.005, min: 0.05, max: 10, digits: 2 },
    { key: 'gap', label: 'Abstand ×', title: 'Mindestabstand der Punkte als Vielfaches des Durchmessers', value: r(c.gap), step: 0.01, min: 0.8, max: 4, digits: 2 },
    { key: 'reach', label: 'Reichweite m', title: 'So weit von der Lichtkante sind die Punkte dicht (Meter)', value: r(c.reach), step: 0.02, min: 0.1, max: 40, digits: 1 },
    { key: 'density', label: 'Dichte %', title: 'Anteil der Punkte an der Lichtkante; auf der Schattenseite ein Achtel davon', value: Math.round(c.density * 100), step: 0.5, min: 0, max: 100, digits: 0 },
    { key: 'tone', label: 'Ton', title: 'Helligkeit der hellsten Stufe (hellere Stufe der Kronenfarbe), 0 bis 100', value: Math.round(c.tone * 100), step: 0.5, min: 0, max: 100, digits: 0 },
    { key: 'wind', label: 'Wind cm', title: 'Ausschlag der Punkte im Wind (Zentimeter)', value: Math.round(c.wind * 100), step: 0.2, min: 0, max: 200, digits: 0 },
    { key: 'out', label: 'über Rand m', title: 'So weit dürfen Punkte über den Rand der Krone hinausstehen (Meter)', value: r(c.out), step: 0.01, min: 0, max: 5, digits: 2 },
    { key: 'seed', label: 'Muster', title: 'Anderes Muster gleicher Art', value: c.seed, step: 0.05, min: 0, max: 9999, digits: 0 },
  ];
}

/** einen Wert der Punktkrone setzen (ändert c in place) */
export function setCrownParam(c: CrownParams, key: string, v: number | string): void {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return;
  if (key === 'size') c.size = clamp(n, 0.05, 10);
  else if (key === 'gap') c.gap = clamp(n, 0.8, 4);
  else if (key === 'reach') c.reach = clamp(n, 0.1, 40);
  else if (key === 'density') c.density = clamp(n / 100, 0, 1);
  else if (key === 'tone') c.tone = clamp(n / 100, 0, 1);
  else if (key === 'wind') c.wind = clamp(n / 100, 0, 2);
  else if (key === 'out') c.out = clamp(n, 0, 5);
  else if (key === 'seed') c.seed = Math.round(clamp(n, 0, 9999));
}

/** Werte einer Kantenwelle für die Wertezeile (Versatz höchstens ein Viertel der Wellenlänge, wie parseWave) */
export function waveParamsOf(w: EdgeWave): StackParam[] {
  return [
    { key: 'amp', label: 'Stärke cm', title: 'Größter Versatz der Kontur (Zentimeter)', value: Math.round(w.amp * 100), step: 0.2, min: 0, max: 500, digits: 0 },
    { key: 'len', label: 'Länge m', title: 'Wellenlänge (Meter)', value: r(w.len, 1), step: 0.02, min: 0.2, max: 100, digits: 1 },
    { key: 'seed', label: 'Muster', title: 'Andere Welle gleicher Art', value: w.seed, step: 0.05, min: 0, max: 9999, digits: 0 },
  ];
}

/** einen Wert der Kantenwelle setzen (ändert w in place) */
export function setWaveParam(w: EdgeWave, key: string, v: number | string): void {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return;
  if (key === 'amp') w.amp = clamp(n / 100, 0, w.len / 4);
  else if (key === 'len') {
    w.len = clamp(n, 0.2, 100);
    w.amp = Math.min(w.amp, w.len / 4);
  } else if (key === 'seed') w.seed = Math.round(clamp(n, 0, 9999));
}
