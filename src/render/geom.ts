/**
 * Geometrie-Helfer für die Malerei: Inset-Polygone (parallele Konturbänder der Berge), Rand-Normalen.
 * Reine Funktionen, ohne Pixi.
 */
export interface P2 {
  x: number;
  y: number;
}

/** Fläche (vorzeichenbehaftet, positiv gegen den Uhrzeigersinn) */
export function signedArea(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Polygon um d nach innen versetzen (Gehrungen an den Ecken, begrenzt auf das Doppelte des Abstands), danach
 * Punkte verwerfen, die über Nachbarn hinweg „umgeklappt“ sind. Für weiche Hügel-Silhouetten reicht das; echte
 * Selbstschnitt-Auflösung ist nicht nötig, weil die Bänder nur auf kleinem Abstand liegen.
 */
export function insetPolygon(pts: P2[], d: number): P2[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const ccw = signedArea(pts) > 0;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const e1 = norm(p1.x - p0.x, p1.y - p0.y);
    const e2 = norm(p2.x - p1.x, p2.y - p1.y);
    // Innen-Normalen (bei ccw zeigt die linke Normale nach innen)
    const s = ccw ? 1 : -1;
    const n1 = { x: -e1.y * s, y: e1.x * s };
    const n2 = { x: -e2.y * s, y: e2.x * s };
    const bis = norm(n1.x + n2.x, n1.y + n2.y);
    const cosHalf = Math.max(0.5, bis.x * n1.x + bis.y * n1.y);
    const len = Math.min(2 * d, d / cosHalf);
    out.push({ x: p1.x + bis.x * len, y: p1.y + bis.y * len });
  }
  // umgeklappte Punkte (Richtung dreht sich gegen die ursprüngliche Kante) entfernen
  const cleaned: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = out[(i - 1 + n) % n];
    const b = out[i];
    const pa = pts[(i - 1 + n) % n];
    const pb = pts[i];
    const dot = (b.x - a.x) * (pb.x - pa.x) + (b.y - a.y) * (pb.y - pa.y);
    if (dot >= 0 || cleaned.length === 0) cleaned.push(b);
  }
  const loops = removeLoops(cleaned);
  return loops.length >= 3 ? loops : [];
}

/** Schnittpunkt zweier Strecken (nur gültig, wenn sie sich schneiden) */
function crossing(a: P2, b: P2, c: P2, d: P2): P2 {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-12) return { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Kleine Schleifen (Selbstschnitte durch den Versatz) herausschneiden: die Punkte zwischen den beiden
 *  kreuzenden Kanten fallen weg, der Schnittpunkt ersetzt sie. */
export function removeLoops(pts: P2[]): P2[] {
  let cur = pts.slice();
  for (let iter = 0; iter < 64; iter++) {
    const n = cur.length;
    if (n < 4) return cur;
    let found = false;
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = cur[i];
        const b = cur[(i + 1) % n];
        const c = cur[j];
        const d = cur[(j + 1) % n];
        if (!segmentsCross(a, b, c, d)) continue;
        const x = crossing(a, b, c, d);
        const inner = j - i; // Punkte i+1 … j liegen in der Schleife
        const outerCount = n - inner;
        // die kleinere Seite ist die Schleife
        if (inner <= outerCount) cur = [...cur.slice(0, i + 1), x, ...cur.slice(j + 1)];
        else cur = [x, ...cur.slice(i + 1, j + 1)];
        found = true;
        break outer;
      }
    }
    if (!found) return cur;
  }
  return cur;
}

function norm(x: number, y: number): P2 {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/** Prüft, ob sich zwei Strecken (a–b, c–d) echt schneiden */
export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/** Hat das Polygon Selbstschnitte (nicht benachbarte Kanten)? */
export function selfIntersects(pts: P2[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}
