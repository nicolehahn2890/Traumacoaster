/**
 * Proportionales Bearbeiten wie in Blender (Florian, 30.10.2026: „ein Werkzeug wie in Blender, das ich mit O einschalte und
 * dann mit dem Mausrad einen Influenzkreis dynamisch zur Bearbeitung ziehen kann und dann mit R rotieren, mit G verziehen
 * und mit S skalieren kann, smooth innerhalb des dynamischen Circle of Influence“). Blender-Handbuch: O schaltet es ein und
 * aus, Umschalt+O wechselt die Abfallkurve, während einer Bewegung ändern Mausrad oder Bild↑/↓ den Einflussradius; nicht
 * gewählte Punkte im Radius bewegen sich mit, je weiter weg von der Auswahl, desto weniger.
 *
 * Gewicht eines Punkts: 1 für gewählte, sonst Abfallkurve von t = 1 − d / r (d: Abstand zum nächsten gewählten Punkt, r:
 * Radius), 0 außerhalb. Kurven wie in Blenders Quelltext (calculatePropRatio). Verschieben addiert den Weg mal Gewicht,
 * Drehen dreht um den Drehpunkt um den Winkel mal Gewicht, Skalieren streckt um den Drehpunkt mit 1 + (Faktor − 1) · Gewicht.
 * Griffe eines Ankers (relative Vektoren) drehen und strecken mit. Gerechnet wird in Metern der Ebene. Ohne DOM.
 */

export type Falloff = 'smooth' | 'sphere' | 'root' | 'invsquare' | 'sharp' | 'linear' | 'constant';
/** Reihenfolge für Umschalt+O (wie Blenders Kurven, ohne Zufall) */
export const FALLOFFS: readonly Falloff[] = ['smooth', 'sphere', 'root', 'invsquare', 'sharp', 'linear', 'constant'];
export const FALLOFF_WORDS: Record<Falloff, string> = { smooth: 'weich', sphere: 'Kugel', root: 'Wurzel', invsquare: 'invers quadratisch', sharp: 'spitz', linear: 'linear', constant: 'konstant' };

/** Abfallkurve: t = 1 an der Auswahl, 0 am Rand des Kreises */
export function falloff(kind: Falloff, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (kind) {
    case 'sharp':
      return x * x;
    case 'root':
      return Math.sqrt(x);
    case 'linear':
      return x;
    case 'constant':
      return x > 0 ? 1 : 0;
    case 'sphere':
      return Math.sqrt(Math.max(0, 2 * x - x * x));
    case 'invsquare':
      return x * (2 - x);
    default:
      return 3 * x * x - 2 * x * x * x;
  }
}

/** Einstellung des Werkzeugs: an oder aus, Radius (Meter der Ebene), Abfallkurve */
export interface Proportional {
  on: boolean;
  radius: number;
  falloff: Falloff;
}

/** Platzhalter: 4 m Radius, weich */
export const PROPORTIONAL_DEFAULT: Proportional = { on: false, radius: 4, falloff: 'smooth' };

/** Radius nach einer Stufe des Mausrads (wie Blender: Faktor 1,1 je Stufe), begrenzt */
export function stepRadius(r: number, dir: 1 | -1, fine = false): number {
  const k = fine ? 1.02 : 1.1;
  return Math.max(0.02, Math.min(2000, dir > 0 ? r * k : r / k));
}

/** Gewichte aller Punkte (x, y abwechselnd): gewählt 1, sonst nach Abstand zum nächsten gewählten; ohne Kreis nur die gewählten */
export function weights(pts: ArrayLike<number>, selected: ReadonlySet<number>, prop: Proportional | null): Float32Array {
  const n = pts.length / 2;
  const w = new Float32Array(n);
  const sel = [...selected].filter((i) => i >= 0 && i < n);
  for (const i of sel) w[i] = 1;
  if (!prop?.on || prop.radius <= 0 || !sel.length) return w;
  for (let i = 0; i < n; i++) {
    if (w[i] === 1) continue;
    let d = Infinity;
    for (const j of sel) d = Math.min(d, Math.hypot(pts[i * 2] - pts[j * 2], pts[i * 2 + 1] - pts[j * 2 + 1]));
    if (d < prop.radius) w[i] = falloff(prop.falloff, 1 - d / prop.radius);
  }
  return w;
}

/** eine Bewegung: Verschieben (dx, dy), Drehen (Winkel im Bogenmaß um den Drehpunkt), Skalieren (Faktoren um den Drehpunkt) */
export type Xform = { kind: 'grab'; dx: number; dy: number } | { kind: 'rotate'; px: number; py: number; angle: number } | { kind: 'scale'; px: number; py: number; sx: number; sy: number };

/** Punkt (x, y) mit Gewicht w bewegen */
export function applyXform(x: number, y: number, w: number, xf: Xform): [number, number] {
  if (w <= 0) return [x, y];
  if (xf.kind === 'grab') return [x + xf.dx * w, y + xf.dy * w];
  const qx = x - xf.px;
  const qy = y - xf.py;
  if (xf.kind === 'rotate') {
    const a = xf.angle * w;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [xf.px + qx * c - qy * s, xf.py + qx * s + qy * c];
  }
  return [xf.px + qx * (1 + (xf.sx - 1) * w), xf.py + qy * (1 + (xf.sy - 1) * w)];
}

/** relativen Vektor (Griff eines Ankers) mit Gewicht w mitdrehen oder mitstrecken; Verschieben lässt ihn, wie er ist */
export function applyXformVector(vx: number, vy: number, w: number, xf: Xform): [number, number] {
  if (w <= 0 || xf.kind === 'grab') return [vx, vy];
  if (xf.kind === 'rotate') {
    const a = xf.angle * w;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [vx * c - vy * s, vx * s + vy * c];
  }
  return [vx * (1 + (xf.sx - 1) * w), vy * (1 + (xf.sy - 1) * w)];
}

/** Bewegung aus Zeigerlagen in Metern der Ebene: Start, jetzt, Drehpunkt; axis schränkt Verschieben und Skalieren ein */
export function xformFrom(kind: Xform['kind'], start: { x: number; y: number }, now: { x: number; y: number }, pivot: { x: number; y: number }, axis: 'x' | 'y' | null = null): Xform {
  if (kind === 'grab') return { kind: 'grab', dx: axis === 'y' ? 0 : now.x - start.x, dy: axis === 'x' ? 0 : now.y - start.y };
  if (kind === 'rotate') {
    const a0 = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    const a1 = Math.atan2(now.y - pivot.y, now.x - pivot.x);
    let a = a1 - a0;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return { kind: 'rotate', px: pivot.x, py: pivot.y, angle: a };
  }
  const d0 = Math.max(1e-6, Math.hypot(start.x - pivot.x, start.y - pivot.y));
  const k = Math.hypot(now.x - pivot.x, now.y - pivot.y) / d0;
  return { kind: 'scale', px: pivot.x, py: pivot.y, sx: axis === 'y' ? 1 : k, sy: axis === 'x' ? 1 : k };
}

/** Text für die Anzeige während einer Bewegung */
export function xformLabel(xf: Xform, prop: Proportional | null, axis: 'x' | 'y' | null): string {
  const f = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
  const what = xf.kind === 'grab' ? `Verschieben ${f(xf.dx)} | ${f(xf.dy)} m` : xf.kind === 'rotate' ? `Drehen ${f((xf.angle * 180) / Math.PI, 1)}°` : `Skalieren ${f(xf.sx)} × ${f(xf.sy)}`;
  const ax = axis ? ` · nur ${axis.toUpperCase()}` : '';
  const pr = prop?.on ? ` · Einfluss ${f(prop.radius, 1)} m ${FALLOFF_WORDS[prop.falloff]} (Rad)` : '';
  return `${what}${ax}${pr} · Klick: ja, Esc: nein`;
}
