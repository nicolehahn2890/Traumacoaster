/**
 * Ebenen-Test (Branch test-kamerawinkel, Platzhalter, nicht Teil des Plans): eine Zone nur aus vielen Vektorscheiben
 * hintereinander, nach Florians Entwurf vom 26.10.2026: hinten oben Gipfel, vorne unten Büsche, dazwischen geschwungene
 * Terrassen, die nach hinten ansteigen wie ein Panorama, mit Höhlenbögen. Die Formen sind erzeugt (Rauschen), nicht gemalt.
 *
 * Eine Scheibe ist ein Höhenband an einer Tiefe (lane, hinten positiv): gefüllt von der Unterkante low(x) bis zur
 * Oberkante top(x). Ein Bogen ist eine Öffnung von unten (low steigt dort bis zur Bogendecke); dahinter liegt eine dunkle
 * Höhlenrückwand als eigene Scheibe. Der Pinsel liest seine Tiefe aus dem Stapel (depthAt): die vorderste bespielbare
 * Scheibe, die am Bildpunkt zu sehen ist; die Bahn liegt DOCK_GAP vor ihr. Stützen stehen auf der Oberkante der nächsten
 * Scheibe davor (SliceFoundation), ihr Fuß verschwindet also hinter deren Kante.
 */
import { LANE_DEPTH, rayToWorld, type StagePoint } from '@/track/stage';
import type { Foundation, FootHit } from '@/world/foundations';
import type { Landing } from '@/track/brushTrack';

/**
 * front: Büsche vor der Spielzone (für den Pinsel durchsichtig), play: Terrassen, cave: Höhlenrückwand, deep: Bäume,
 * Hügel und kleine Berge hinter der Spielzone (bemalbar, die Bahn darf dorthin), far: große Berge (Kulisse)
 */
export type SliceRole = 'front' | 'play' | 'cave' | 'deep' | 'far';
/** auf diesen Scheiben dockt die Bahn an */
export const dockable = (s: Slice): boolean => s.role === 'play' || s.role === 'cave' || s.role === 'deep';

export interface Slice {
  /** Tiefe in Spuren (hinten positiv, wie z der Bahn) */
  lane: number;
  role: SliceRole;
  /** Abtastung der Kanten: x0, Schritt (m), Ober- und Unterkante (Welthöhe) */
  x0: number;
  step: number;
  top: Float32Array;
  low: Float32Array;
  /** Saum (Oberkante), Fläche oben, Fläche unten */
  colors: { rim: string; top: string; bottom: string };
  /** Punktgröße der Schattierung (m) */
  dot: number;
}

export interface SliceStack {
  /** von vorne nach hinten */
  slices: Slice[];
}

/** so weit (m) liegt die Bahn vor der Scheibe, an der sie andockt (das Profil ist rund 1,5 m tief) */
export const DOCK_GAP = 1;
/** Unterkante aller Scheiben (unter dem Boden, damit nichts darunter durchscheint) */
const LOW = -14;

/** Kante an x (linear zwischen den Abtastpunkten), NaN außerhalb der Scheibe */
export function edgeAt(s: Slice, edge: Float32Array, x: number): number {
  const f = (x - s.x0) / s.step;
  if (f < 0 || f > edge.length - 1) return NaN;
  const i = Math.min(edge.length - 2, Math.floor(f));
  const t = f - i;
  return edge[i] * (1 - t) + edge[i + 1] * t;
}

/** gefüllt am Weltpunkt (x, Höhe y)? */
export function sliceCovers(s: Slice, x: number, y: number): boolean {
  const top = edgeAt(s, s.top, x);
  if (Number.isNaN(top) || y > top) return false;
  return y >= edgeAt(s, s.low, x);
}

/**
 * Tiefe für den Pinsel (Meter, hinten positiv) am Bildpunkt: die vorderste Scheibe, die der Strahl dort trifft, wenn sie
 * bemalbar ist; null über den großen Bergen und im Himmel (in der Luft hält der Pinsel). Büsche davor sind durchsichtig.
 */
export function depthAt(stack: SliceStack, p: StagePoint): number | null {
  for (const s of stack.slices) {
    if (s.role === 'front') continue;
    const w = rayToWorld(p, s.lane);
    if (!sliceCovers(s, w.x, w.y)) continue;
    return dockable(s) ? s.lane * LANE_DEPTH - DOCK_GAP : null;
  }
  return null;
}

/** so weit unter der Oberkante (auf dem gemalten Saum) bzw. darüber liegt ein Strichpunkt noch auf einer Scheibe (Meter) */
export const LAND_BELOW = 2.5;
export const LAND_ABOVE = 2;

/**
 * Landen statt Kleben (Florian, 26.10.2026: „es malt vorzugsweise in die Tiefe, Hügel sind schwer“): Tiefe nur, wo der
 * Strich auf einer Scheibe liegt, also knapp unter oder über ihrer Oberkante (Terrasse, Baumspitzen, Bergrücken), und in
 * einer Höhle; mitten auf einer Fläche oder in der Luft null (dort ist der Strich Höhe, die Tiefe läuft von Landung zu
 * Landung). Gesucht wird von vorne nach hinten: die erste Scheibe, die den Punkt verdeckt oder knapp unter ihm endet.
 */
export function landingAt(stack: SliceStack, p: StagePoint): Landing | null {
  const at = (k: number, off: number): Landing => ({ z: stack.slices[k].lane * LANE_DEPTH - DOCK_GAP, id: k, off });
  // durch eine Höhlenöffnung gezeichnet: die Höhle hat Vorrang vor einer Terrassenkante knapp darunter
  for (const [k, s] of stack.slices.entries()) {
    if (s.role === 'front') continue;
    const w = rayToWorld(p, s.lane);
    if (!sliceCovers(s, w.x, w.y)) continue;
    if (s.role === 'cave') return { ...at(k, 0), cave: true };
    break;
  }
  for (const [k, s] of stack.slices.entries()) {
    if (s.role === 'front') continue;
    const w = rayToWorld(p, s.lane);
    const top = edgeAt(s, s.top, w.x);
    if (Number.isNaN(top)) continue;
    if (w.y <= top && w.y >= edgeAt(s, s.low, w.x)) {
      if (!dockable(s)) return null;
      return s.role === 'cave' || top - w.y <= LAND_BELOW ? at(k, w.y - top) : null;
    }
    if (!dockable(s) || w.y <= top) continue;
    // knapp über der Kante: über Baumspitzen zählt die Hüllkurve der Spitzen (zwischen ihnen bricht die Kante tief ein)
    let env = top;
    for (const dx of [-2.5, -1.25, 1.25, 2.5]) {
      const t = edgeAt(s, s.top, w.x + dx);
      if (!Number.isNaN(t)) env = Math.max(env, t);
    }
    if (w.y - env <= LAND_ABOVE) return at(k, w.y - env);
  }
  return null;
}

/** Wunschhöhe über dem Boden (m), wie beim Bildhöhen-Pinsel (H_COMFORT) */
export const GROUND_COMFORT = 4;

/**
 * Bodenhöhe aus den Scheiben (Mischung, Florian 26.10.2026): die Lesung des Bildhöhen-Pinsels, nur liefern die Kanten der
 * Scheiben den Boden statt der Kameraneigung. Wunschtiefe (Meter) ist die Tiefe, in der der Strichpunkt GROUND_COMFORT über
 * der Kante liegt: von vorne nach hinten liegt er über den Kanten immer niedriger, zwischen den zwei Scheiben, wo er die
 * Wunschhöhe unterschreitet, wird gemittelt. Über allen Kanten hoch in der Luft die hinterste, unter allen die vorderste.
 */
export function groundDepth(stack: SliceStack, p: StagePoint): number {
  let prev: { d: number; h: number } | null = null;
  for (const s of stack.slices) {
    if (s.role !== 'play' && s.role !== 'deep') continue;
    const w = rayToWorld(p, s.lane);
    const top = edgeAt(s, s.top, w.x);
    if (Number.isNaN(top)) continue;
    const d = s.lane * LANE_DEPTH - DOCK_GAP;
    const h = w.y - top;
    if (h < GROUND_COMFORT) {
      if (!prev) return d;
      return prev.d + ((d - prev.d) * (prev.h - GROUND_COMFORT)) / Math.max(1e-6, prev.h - h);
    }
    prev = { d, h };
  }
  return prev ? prev.d : 0;
}

/** tiefste Tiefe (Meter), an der die Bahn andocken kann (der Pinsel darf so weit nach hinten) */
export function deepestDock(stack: SliceStack): number {
  let d = -Infinity;
  for (const s of stack.slices) if (dockable(s)) d = Math.max(d, s.lane * LANE_DEPTH - DOCK_GAP);
  return d;
}

/** Fundament: Fuß auf der Oberkante der nächsten Scheibe vor der Stütze (oder dahinter, wenn davor nichts darunter liegt) */
export class SliceFoundation implements Foundation {
  constructor(private readonly stack: SliceStack) {}

  surfaceBelow(x: number, y: number, z: number): FootHit | null {
    let best: number | null = null;
    // vor der Stütze: die nächste Scheibe, deren Kante unter dem Anschlusspunkt liegt
    for (let k = this.stack.slices.length - 1; k >= 0; k--) {
      const s = this.stack.slices[k];
      if ((s.role !== 'play' && s.role !== 'deep') || s.lane > z) continue;
      const top = edgeAt(s, s.top, x);
      if (!Number.isNaN(top) && top < y) {
        best = top;
        break;
      }
    }
    return best === null ? null : { y: best, kind: 'element' };
  }

  /** sperrt nichts (so bleibt das Fundament neben dem Freiraumfeld der Zone in der Liste) */
  blocks(): boolean {
    return false;
  }
}

// ------------------------------------------------------------------ Erzeugung

/** deterministische Zufallszahlen */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** glattes Wertrauschen in −0,5 … 0,5 */
function noise(seed: number): (x: number) => number {
  const r = rng(seed);
  const v = Array.from({ length: 512 }, () => r() - 0.5);
  return (x: number) => {
    const i = Math.floor(x);
    const t = x - i;
    const s = t * t * (3 - 2 * t);
    const a = v[((i % 512) + 512) % 512];
    const b = v[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * s;
  };
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Farben mischen (#rrggbb) */
function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const SKY = '#bfe0f2';

function band(lane: number, role: SliceRole, x0: number, x1: number, step: number, top: (x: number) => number, low: (x: number) => number, colors: Slice['colors'], haze: number): Slice {
  const n = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const t = new Float32Array(n);
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    t[i] = top(x);
    l[i] = Math.min(t[i], low(x));
  }
  const hz = (c: string) => mix(c, SKY, haze);
  const depth = Math.max(0, lane * LANE_DEPTH);
  // Ferne ohne Punkte (sie wären dort nur Grau), sonst wachsen die Punkte mit der Tiefe
  return { lane, role, x0, step, top: t, low: l, colors: { rim: hz(colors.rim), top: hz(colors.top), bottom: hz(colors.bottom) }, dot: role === 'far' ? 0 : 0.32 * (1 + depth / 35) };
}

const MEADOW = { rim: '#f4fb86', top: '#bfe844', bottom: '#78b64a' };
const CLIFF = { rim: '#e8f56e', top: '#fbf0cf', bottom: '#3d86d6' };
const CAVE = { rim: '#3a63a8', top: '#24477e', bottom: '#122a52' };
const BUSH = { rim: '#6cb848', top: '#2f7a3e', bottom: '#1a4630' };
const HILL = { rim: '#cdea70', top: '#86c25a', bottom: '#5b93a6' };
const MOUNTAIN = { rim: '#ffffff', top: '#fbfdff', bottom: '#9cc0ee' };
const FOOTHILL = { rim: '#ffffff', top: '#d9e6f6', bottom: '#6f8fc8' };
const CYPRESS = { rim: '#3f7d4a', top: '#2a5f3f', bottom: '#2d5a62' };

/**
 * Stapel für eine Zone der Breite width: Station links (x um 24–38 auf Spur 0), dort bleiben die vorderen Scheiben flach.
 * playCount bespielbare Scheiben zwischen den Spuren −1,85 und 2 (vor der vordersten bleibt Platz für den Abstand der Bahn).
 */
export function buildSliceStack(width: number, playCount = 17): SliceStack {
  const slices: Slice[] = [];
  const xa = -40;
  const xb = width + 40;
  // Bucht der Station: links flach
  const bay = (x: number) => 1 - smoothstep(42, 62, x);

  // Vordergrund: runde Büsche vor der Spielzone
  for (const [k, lane] of [-2.95, -2.45].entries()) {
    const n1 = noise(101 + k);
    const n2 = noise(131 + k);
    const top = (x: number) => {
      const bumps = Math.abs(Math.sin(x / (3.2 + k) + k)) * 1.6;
      const h = -0.6 + bumps + 2.2 * (n1(x / 14) + 0.5) + 0.8 * n2(x / 4);
      return h - 2.6 * bay(x);
    };
    slices.push(band(lane, 'front', xa, xb, 0.5, top, () => LOW - 4, BUSH, 0));
  }

  // Spielzone: Terrassen, die nach hinten ansteigen; jede dritte als Klippe (hell mit blauem Fuß), sonst Wiese
  const arches: Array<{ i: number; c: number; w: number; h: number }> = [];
  const r = rng(26);
  for (const i of [4, 9, 13]) {
    for (let a = 0; a < 2; a++) {
      const c = 70 + r() * (width - 100);
      if (arches.some((q) => q.i === i && Math.abs(q.c - c) < 30)) continue;
      arches.push({ i, c, w: 4.5 + r() * 3, h: 4.5 + r() * 2.5 });
    }
  }
  for (let i = 0; i < playCount; i++) {
    const t = i / (playCount - 1);
    const lane = -1.85 + t * 3.85;
    const n1 = noise(7 + i * 13);
    const n2 = noise(911 + i * 7);
    const base = 0.4 + 9.5 * Math.pow(t, 1.25);
    const amp = 1.6 + 4.5 * t;
    const mine = arches.filter((q) => q.i === i);
    // ein Bogen schneidet durch seine Scheibe und die zwei dahinter (die Höhle ist ein Raum, nicht nur ein Loch)
    const cut = arches.filter((q) => i >= q.i && i <= q.i + 2);
    const top = (x: number) => {
      let h = base + amp * (0.7 * (n1(x / 24 + i * 0.37) + 0.5) + 0.3 * (n2(x / 9) + 0.5)) - amp * 0.4;
      // Klippe über einem Bogen: der Fels steht dort höher
      for (const q of mine) {
        const near = 1 - smoothstep(q.w, q.w + 9, Math.abs(x - q.c));
        h += (Math.max(h, q.h + 3.2) - h) * near;
      }
      // Bucht der Station: Scheiben vor der Station bleiben unter ihr, die dahinter senken sich etwas
      if (lane < 0.05) h = h * (1 - bay(x)) + (0.35 + 0.25 * t) * bay(x);
      else h = h * (1 - 0.35 * bay(x)) + 1.5 * 0.35 * bay(x);
      return Math.max(0.3, h);
    };
    const low = (x: number) => {
      let l = LOW;
      for (const q of cut) {
        const d = (x - q.c) / q.w;
        if (Math.abs(d) < 1) l = Math.max(l, q.h * Math.sqrt(1 - d * d));
      }
      return l;
    };
    slices.push(band(lane, 'play', xa, xb, 0.75, top, low, i % 3 === 1 ? CLIFF : MEADOW, 0.1 * t));
    // Höhlenrückwand hinter jedem Bogen dieser Scheibe (dunkel, mit Punkten), hinter den zwei mitgeschnittenen Scheiben:
    // durch den Bogen sieht man in die Höhle, und die Bahn hat dort Platz (Rückwand gut 4,5 m hinter der Bogenwand)
    for (const q of mine) {
      const back = lane + (2.2 * 3.85) / (playCount - 1);
      slices.push(band(back, 'cave', q.c - q.w - 1.5, q.c + q.w + 1.5, 0.4, (x) => q.h + 3 - 1.5 * Math.abs((x - q.c) / q.w), () => LOW, CAVE, 0));
    }
  }

  // Hinter der Spielzone, bemalbar: Hügelketten, dann eine Reihe kleinerer Berge; dahinter zwei große Bergketten (Kulisse)
  for (const [k, lane] of [2.7, 3.6, 4.8, 6].entries()) {
    const n1 = noise(301 + k);
    const n2 = noise(331 + k);
    const top = (x: number) => 9 + 3.5 * k + 7 * (n1(x / (30 + 8 * k)) + 0.5) + 2 * n2(x / 7) + (k === 2 ? 2.2 * Math.abs(Math.sin(x / 1.6)) : 0);
    slices.push(band(lane, 'deep', xa - 60 * (k + 1), xb + 60 * (k + 1), 1.5, top, () => LOW, HILL, 0.18 + 0.08 * k));
  }
  {
    // kleinere Berge: felsige Kuppen mit hellen Kappen, höher als die Hügel davor, niedriger als die großen dahinter
    const n1 = noise(451);
    const n2 = noise(461);
    const top = (x: number) => {
      const a = n1(x / 34) + 0.5;
      const ridge = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, a))), 2);
      return 22 + 20 * ridge + 3 * (n2(x / 9) + 0.5);
    };
    slices.push(band(7.5, 'deep', xa - 300, xb + 300, 1, top, () => LOW, FOOTHILL, 0.22));
  }
  // Zypressenreihe direkt hinter der Spielzone (schmale Spitzen auf einem Hügelband), wie im Entwurf
  {
    const n1 = noise(401);
    const r2 = rng(402);
    const trees = Array.from({ length: 140 }, () => ({ x: xa + r2() * (xb - xa), h: 3 + r2() * 4.5, w: 0.9 + r2() * 0.6 }));
    const top = (x: number) => {
      let h = 6.5 + 3 * (n1(x / 26) + 0.5);
      for (const t of trees) {
        const d = Math.abs(x - t.x) / t.w;
        if (d < 1) h = Math.max(h, 6.5 + 3 * (n1(t.x / 26) + 0.5) + t.h * Math.sqrt(1 - d * d) * (1 - 0.35 * d));
      }
      return h;
    };
    slices.push(band(2.3, 'deep', xa, xb, 0.3, top, () => LOW, CYPRESS, 0.12));
  }
  for (const [k, lane] of [14, 24].entries()) {
    const n1 = noise(501 + k);
    const n2 = noise(551 + k);
    const top = (x: number) => {
      // Gipfel: geglättete Grate (nicht spitz), dazu Schultern
      const a = n1(x / (60 + 30 * k)) + 0.5;
      const ridge = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, a))), 3);
      return 20 + 12 * k + (38 + 26 * k) * ridge + 6 * (n2(x / 18) + 0.5);
    };
    slices.push(band(lane, 'far', xa - 400 * (k + 1), xb + 400 * (k + 1), 3, top, () => LOW, MOUNTAIN, 0.12 + 0.12 * k));
  }
  slices.sort((a, b) => a.lane - b.lane);
  return { slices };
}
