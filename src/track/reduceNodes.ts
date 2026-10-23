/**
 * Knotenreduktion.
 *
 * Aus einer dichten Punktfolge (3D in Metern, Abstand ≤ 1 m) werden kubische Segmente mit festen Tangenten aus
 * der Punktfolge (G1 an jedem Knoten) nach Schneider: Passt ein Segment nicht, wird am Ort des größten Fehlers
 * geteilt. Anders als beim reinen Fit mit 0,3 m überall ist die Toleranz adaptiv: 0,3 m, wo die Bahn eng ist
 * (Radien unter 25 m, dort entscheidet die Form über die g-Kräfte), 1,2 m auf Geraden und in weiten Bögen, so
 * bleiben lange Stücke ein Segment. Die Tangenten sind symmetrische Sekanten (±1 m, interpoliert), damit ungleiche
 * Punktabstände keinen Knick am Knoten erzeugen. Looping- und Kehren-Scheitel sind gesetzte Knoten und tragen die
 * Knotenart. Die Scheitelwahl (Kuppen, Täler, Kurvenscheitel als lokale Krümmungsmaxima mit Prominenz) steht als
 * `pickApexIndices` für Maßband und Bearbeitung bereit; als Teilungsstellen des Fits ist sie abschaltbar, weil
 * Knoten genau auf dem Scheitel die Bahn dort enger machen (siehe ReduceOptions.snapApex).
 */
import type { Vec3 } from '@/core/math3';
import { add3, cross3, dist3, len3, normalize3, scale3, sub3 } from '@/core/math3';
import { fitCubicWithTangents, type CubicSegment3 } from '@/core/bezierFit3';
import type { NodeKind } from './model';

/** Scheitel eines erkannten Ereignisses (Looping, Kehre): bekommt auf jeden Fall einen Knoten */
export interface ApexHint {
  pos: Vec3;
  kind: NodeKind;
}

export interface ReduceOptions {
  /** kleinste Krümmung (1/m), ab der ein lokales Maximum als Scheitel zählt (Standard 1/40) */
  minCurvature?: number;
  /** Mindestabstand zweier Scheitel in Metern (Standard 4) */
  minSpacing?: number;
  /** Toleranz in engen Kurven und auf Geraden, in Metern (Standard 0,3 und 1,2) */
  tolTight?: number;
  tolLoose?: number;
  /** Faktor auf beide Toleranzen (Vorschau: gröber und schneller) */
  tolScale?: number;
  /** höchste Toleranz je Punkt in Metern (Pinsel-Bahn: eng, wo die Bahn einer anderen Stelle nahekommt) */
  tolAt?: ArrayLike<number>;
  /** Radius in Metern, unter dem die enge Toleranz gilt (Standard 25: Täler bei 90 km/h haben rund 20 m) */
  tightRadius?: number;
  /**
   * Teilungen auf nahe Scheitel (Kuppen, Täler, Kurvenscheitel) einrasten lassen (Standard: nein). Ein Knoten genau
   * auf dem Scheitel macht die Bahn dort messbar enger als gezeichnet (ein kubisches Segment „Flanke plus halber
   * Bogen“ konzentriert die Krümmung an seinem Ende; im Tal nach einem 30-m-Drop waren es 5,6 g statt 4,2 g).
   * Für die Bearbeitung genügt das Ziehen am Segment; wer einen Knoten auf der Kuppe will, setzt ihn per Doppeltipp.
   */
  snapApex?: boolean;
  /**
   * Knoten sparsam und gleichmäßig (Pinsel-Bahn): die kleinste Zahl von Segmenten, die in der Toleranz bleiben, und
   * unter allen solchen Verteilungen die mit den gleichmäßigsten Längen (statt am Ort des größten Fehlers zu teilen,
   * was Knoten häuft). Knotenarten (Ereignis-Scheitel) gibt es dabei nicht.
   */
  even?: boolean;
  /** geschlossene Runde (erster und letzter Punkt gleich): Die Tangente an der Naht reicht über sie hinweg */
  closed?: boolean;
  /** Diagnose: je Abschnitt Fehler, Toleranz und Entscheidung */
  trace?: (msg: string) => void;
}

export interface ReducedPath {
  segments: CubicSegment3[];
  /** Art je Knoten (segments.length + 1 Einträge) */
  kinds: NodeKind[];
  /** Index je Knoten in der Punktfolge */
  indices: number[];
}

const WINDOW = 2; // Meter: Krümmung aus den Punkten ±2 m (Handzittern fällt heraus, ein Scheitel bleibt)
const TANGENT_WINDOW = 1; // Meter: Tangente aus der Sekante ±1 m (die Punktfolge ist schon geglättet)
const MIN_SPLIT_LENGTH = 3; // Meter: kürzere Spannen werden nicht mehr geteilt
const SNAP = 3; // Meter: so weit darf eine Teilung auf einen Scheitel einrasten
// Newton-Nachbesserung nur unter dem Vierfachen der Toleranz (Schneider). Ohne diese Grenze zwingt Newton lange
// Segmente in die Toleranz, die in Kurven enger biegen als die Punktfolge: im Tal nach einem 30-m-Drop 5,0 g statt 4,2 g.
const NEWTON_BELOW = 4;
/** Meter: längstes Segment der gleichmäßigen Verteilung (even) */
const EVEN_SPAN = 90;
/** größte Drehung der Richtung in einem Segment der gleichmäßigen Verteilung: Ein Kubik-Segment mit festen
 * Tangenten biegt über mehr als einen Viertelkreis enger als die Punktfolge (der Wagen spürt die Spitze) */
const EVEN_TURN = (120 * Math.PI) / 180;
const PROMINENCE = 0.25; // ein Scheitel muss sein Umfeld um 25 % überragen (sonst ist es ein gleichmäßiger Bogen)
const PROMINENCE_ABS = 0.008; // … und um mindestens 0,008/m (sonst ist es Zittern auf einer weiten Kurve)

/** Bogenlängen (kumuliert) der Punktfolge */
export function cumulativeLength(pts: Vec3[]): Float64Array {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist3(pts[i - 1], pts[i]);
  return cum;
}

/** Index des ersten Punkts mit Bogenlänge ≥ s (binäre Suche) */
function indexAtLength(cum: Float64Array, s: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Menger-Krümmung des Dreiecks a, b, c (4·Fläche / Produkt der Seiten) */
function menger(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub3(b, a);
  const bc = sub3(c, b);
  const ca = sub3(c, a);
  const la = len3(ab);
  const lb = len3(bc);
  const lc = len3(ca);
  if (la < 1e-6 || lb < 1e-6 || lc < 1e-6) return 0;
  return (2 * len3(cross3(ab, bc))) / (la * lb * lc);
}

/** Krümmungsbetrag je Punkt (1/m) über das Fenster ±window Meter (Punkt davor, Punkt selbst, Punkt danach) */
export function curvatureProfile(pts: Vec3[], window = WINDOW): Float64Array {
  const n = pts.length;
  const k = new Float64Array(n);
  if (n < 3) return k;
  const cum = cumulativeLength(pts);
  for (let i = 0; i < n; i++) {
    const a = indexAtLength(cum, cum[i] - window);
    const c = Math.min(n - 1, indexAtLength(cum, cum[i] + window));
    if (a >= i || c <= i) continue;
    k[i] = menger(pts[a], pts[i], pts[c]);
  }
  // Ränder: letzter gültiger Wert nach außen fortsetzen
  let first = 0;
  while (first < n && k[first] === 0) first++;
  for (let i = 0; i < first && first < n; i++) k[i] = k[first];
  let last = n - 1;
  while (last >= 0 && k[last] === 0) last--;
  for (let i = n - 1; i > last && last >= 0; i--) k[i] = k[last];
  return k;
}

/** Krümmung aus den unmittelbaren Nachbarn (Menger), danach über ±half Meter Bogenlänge gemittelt: was der Wagen spürt */
export function feltCurvature(pts: Vec3[], half = 1.2): Float64Array {
  const n = pts.length;
  const local = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) local[i] = menger(pts[i - 1], pts[i], pts[i + 1]);
  if (n > 2) {
    local[0] = local[1];
    local[n - 1] = local[n - 2];
  }
  const cum = cumulativeLength(pts);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = indexAtLength(cum, cum[i] - half);
    const c = Math.min(n - 1, indexAtLength(cum, cum[i] + half));
    let sum = 0;
    let w = 0;
    for (let j = a; j <= c; j++) {
      const dl = j > 0 ? cum[j] - cum[j - 1] : n > 1 ? cum[1] - cum[0] : 1;
      sum += local[j] * dl;
      w += dl;
    }
    out[i] = w > 0 ? sum / w : local[i];
  }
  return out;
}

/** Punkt bei Bogenlänge s (linear zwischen den Punkten interpoliert, an den Enden geklemmt) */
function pointAtLength(pts: Vec3[], cum: Float64Array, s: number): Vec3 {
  const n = pts.length;
  if (s <= 0) return pts[0];
  if (s >= cum[n - 1]) return pts[n - 1];
  const j = indexAtLength(cum, s);
  if (j === 0) return pts[0];
  const l = cum[j] - cum[j - 1];
  const t = l > 1e-9 ? (s - cum[j - 1]) / l : 0;
  return add3(pts[j - 1], scale3(sub3(pts[j], pts[j - 1]), t));
}

/**
 * Einheitstangente an Punkt i: Sekante zwischen den Punkten genau ±window Meter davor und danach (interpoliert,
 * damit die ungleichen Punktabstände die Richtung nicht verfälschen: ein schiefer Sekantenpunkt knickt die Bahn
 * am Knoten um Bruchteile eines Grads, was der Wagen als Krümmungsspitze spürt). An den Enden einseitig.
 */
/**
 * Tangente an der Naht einer geschlossenen Runde: Sekante vom Punkt TANGENT_WINDOW vor dem Ende zum Punkt
 * TANGENT_WINDOW nach dem Anfang (beide Enden bekommen dieselbe, sonst knickte die Bahn an der Station).
 */
function seamTangent(pts: Vec3[], cum: Float64Array): Vec3 {
  const L = cum[pts.length - 1];
  const t = normalize3(sub3(pointAtLength(pts, cum, TANGENT_WINDOW), pointAtLength(pts, cum, L - TANGENT_WINDOW)));
  return len3(t) < 0.5 ? tangentAt(pts, 0, cum) : t;
}

export function tangentAt(pts: Vec3[], i: number, cum: Float64Array, window = TANGENT_WINDOW): Vec3 {
  const n = pts.length;
  const a = pointAtLength(pts, cum, cum[i] - window);
  const c = pointAtLength(pts, cum, cum[i] + window);
  let t = normalize3(sub3(c, a));
  if (len3(t) < 0.5) t = normalize3(sub3(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
  if (len3(t) < 0.5) t = normalize3(sub3(pts[n - 1], pts[0]));
  return t;
}


/**
 * Scheitel wählen: lokale Krümmungsmaxima über minCurvature, die ihr Umfeld (±minSpacing) deutlich überragen,
 * dazu die Ereignis-Scheitel (Looping, Kehre) als gesetzte Knoten. Anfang und Ende sind immer dabei.
 * `protected` sind die Scheitel selbst; die Bogenränder der engen Scheitel kommen als freie Kandidaten dazu.
 */
export function pickApexIndices(pts: Vec3[], prof: Float64Array, hints: ApexHint[], opts: ReduceOptions = {}): { indices: number[]; kinds: Map<number, NodeKind>; protectedIdx: Set<number> } {
  const n = pts.length;
  const minK = opts.minCurvature ?? 1 / 40;
  const spacing = opts.minSpacing ?? 4;
  const cum = cumulativeLength(pts);
  const kinds = new Map<number, NodeKind>();
  const protectedIdx = new Set<number>([0, n - 1]);
  // Ereignis-Scheitel: nächster Punkt
  for (const h of hints) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist3(pts[i], h.pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best <= 0 || best >= n - 1) continue;
    protectedIdx.add(best);
    kinds.set(best, h.kind);
  }
  const hintIdx = [...kinds.keys()];
  for (let i = 1; i < n - 1; i++) {
    const k = prof[i];
    if (k < minK) continue;
    const a = indexAtLength(cum, cum[i] - spacing);
    const c = Math.min(n - 1, indexAtLength(cum, cum[i] + spacing));
    let isMax = true;
    let minAround = k;
    for (let j = a; j <= c && isMax; j++) {
      if (j === i) continue;
      // frühere Punkte dürfen gleich groß sein (Plateau: der erste gewinnt), spätere müssen kleiner sein
      if (j < i ? prof[j] > k : prof[j] >= k) isMax = false;
      if (prof[j] < minAround) minAround = prof[j];
    }
    if (!isMax) continue;
    if (k - minAround < Math.max(PROMINENCE * k, PROMINENCE_ABS)) continue; // gleichmäßiger Bogen oder Zittern
    if (hintIdx.some((h) => Math.abs(cum[h] - cum[i]) < spacing)) continue; // nah an einem gesetzten Scheitel
    if (cum[i] < spacing / 2 || cum[n - 1] - cum[i] < spacing / 2) continue; // nah am Rand
    protectedIdx.add(i);
  }
  return { indices: [...protectedIdx].sort((x, y) => x - y), kinds, protectedIdx };
}

/** Toleranz für einen Abschnitt: eng bei engen Radien (R ≤ tightRadius → tolTight), locker auf Geraden */
function toleranceFor(maxK: number, opts: ReduceOptions): number {
  const t = Math.max(0, Math.min(1, 1 - maxK * (opts.tightRadius ?? 25)));
  const tight = opts.tolTight ?? 0.3;
  const loose = opts.tolLoose ?? 1.2;
  return (tight + (loose - tight) * t) * (opts.tolScale ?? 1);
}


export function reduceNodes(pts: Vec3[], hints: ApexHint[] = [], opts: ReduceOptions = {}): ReducedPath {
  const n = pts.length;
  if (n < 2) return { segments: [], kinds: [], indices: [] };
  if (n === 2) {
    const d = scale3(sub3(pts[1], pts[0]), 1 / 3);
    return { segments: [{ p0: pts[0], p1: add3(pts[0], d), p2: sub3(pts[1], d), p3: pts[1] }], kinds: ['normal', 'normal'], indices: [0, 1] };
  }
  const prof = curvatureProfile(pts);
  const cum = cumulativeLength(pts);
  const { kinds, protectedIdx } = pickApexIndices(pts, prof, hints, opts);
  const apexes = [...protectedIdx].filter((i) => i > 0 && i < n - 1).sort((a, b) => a - b);
  opts.trace?.(`Punkte ${n}, Scheitel ${apexes.map((i) => `${i}${kinds.get(i) ? ':' + kinds.get(i) : ''}(κ ${prof[i].toFixed(3)})`).join(' ')}`);
  const tangents = new Map<number, Vec3>();
  const T = (i: number): Vec3 => {
    let t = tangents.get(i);
    if (!t) {
      t = opts.closed && (i === 0 || i === n - 1) ? seamTangent(pts, cum) : tangentAt(pts, i, cum);
      tangents.set(i, t);
    }
    return t;
  };
  const segments: CubicSegment3[] = [];
  const outIdx: number[] = [];
  /**
   * Schneider-Rekursion mit adaptiver Toleranz: passt ein Segment nicht, wird am Ort des größten Fehlers geteilt;
   * liegt ein Scheitel nahe (±SNAP Meter), rastet die Teilung dort ein, damit die Knoten auf Kuppen, Tälern und
   * Kurvenscheiteln liegen statt irgendwo auf der Flanke.
   */
  const fitRec = (a: number, b: number, depth: number): void => {
    let maxK = 0;
    for (let i = a; i <= b; i++) if (prof[i] > maxK) maxK = prof[i];
    let tol = toleranceFor(maxK, opts);
    if (opts.tolAt) for (let i = a; i <= b; i++) tol = Math.min(tol, opts.tolAt[i]);
    const r = fitCubicWithTangents(pts, a, b, T(a), scale3(T(b), -1), tol, 6, NEWTON_BELOW);
    const short = b - a < 3 || cum[b] - cum[a] < MIN_SPLIT_LENGTH;
    opts.trace?.(`[${a}..${b}] err ${r.maxError.toFixed(2)} tol ${tol.toFixed(2)} → ${r.maxError <= tol || short || depth >= 10 ? 'ok' : 'teilen'}`);
    if (r.maxError <= tol || short || depth >= 10) {
      segments.push(r.bez);
      outIdx.push(a);
      return;
    }
    let m = r.splitPoint;
    if (m <= a || m >= b) m = (a + b) >> 1;
    // auf einen nahen Scheitel einrasten (nur echte Zwischenpunkte, nur auf Wunsch, siehe ReduceOptions.snapApex)
    if (opts.snapApex) {
      let best = -1;
      let bestD = SNAP;
      for (const i of apexes) {
        if (i <= a + 1 || i >= b - 1) continue;
        const d = Math.abs(cum[i] - cum[m]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) m = best;
    }
    fitRec(a, m, depth + 1);
    fitRec(m, b, depth + 1);
  };
  if (opts.even) {
    // Segmente, die doch nicht passen (ein Teilstück eines passenden Stücks passt nicht immer), wie oben teilen
    for (const [a, b] of evenSplits(pts, cum, prof, T, opts)) fitRec(a, b, 0);
    outIdx.push(n - 1);
    return { segments, kinds: outIdx.map(() => 'normal'), indices: outIdx };
  }
  // Ereignis-Scheitel (Looping, Kehre) sind gesetzte Knoten: sie tragen die Knotenart
  const forced = [0, ...[...kinds.keys()].filter((i) => i > 0 && i < n - 1).sort((a, b) => a - b), n - 1];
  for (let k = 0; k < forced.length - 1; k++) if (forced[k + 1] > forced[k]) fitRec(forced[k], forced[k + 1], 0);
  outIdx.push(n - 1);
  return { segments, kinds: outIdx.map((i) => kinds.get(i) ?? 'normal'), indices: outIdx };
}

/**
 * Knotenstellen für opts.even: Reichweite je Punkt (das weiteste Ende, bis zu dem ein Segment noch in der Toleranz
 * bleibt; gesucht ab der Reichweite des Vorgängers, sie wächst fast immer mit), daraus die kleinste Segmentzahl K
 * (von vorn immer so weit wie möglich) und dann die Verteilung mit K Segmenten, deren Längen am wenigsten vom
 * Mittel abweichen (dynamische Programmierung über die Reichweiten).
 */
function evenSplits(pts: Vec3[], cum: Float64Array, prof: Float64Array, T: (i: number) => Vec3, opts: ReduceOptions): Array<[number, number]> {
  const n = pts.length;
  // Drehung der Richtung, aufsummiert von Punkt zu Punkt
  const turn = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const u = sub3(pts[i], pts[i - 1]);
    const v = sub3(pts[i + 1], pts[i]);
    const lu = len3(u);
    const lv = len3(v);
    const c = lu > 1e-9 && lv > 1e-9 ? (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv) : 1;
    turn[i + 1] = turn[i] + Math.acos(Math.max(-1, Math.min(1, c)));
  }
  turn[1] = turn[1] || 0;
  const fits = (a: number, b: number): boolean => {
    if (b - a < 2) return true;
    if (cum[b] - cum[a] > EVEN_SPAN || turn[b] - turn[a] > EVEN_TURN) return false;
    let maxK = 0;
    for (let i = a; i <= b; i++) if (prof[i] > maxK) maxK = prof[i];
    let tol = toleranceFor(maxK, opts);
    if (opts.tolAt) for (let i = a; i <= b; i++) tol = Math.min(tol, opts.tolAt[i]);
    return fitCubicWithTangents(pts, a, b, T(a), scale3(T(b), -1), tol, 6, NEWTON_BELOW).maxError <= tol;
  };
  const reach = new Int32Array(n);
  for (let a = 0; a < n - 1; a++) {
    // lo passt (ein Schritt passt immer), hi ist das erste bekannte Ende, das nicht mehr passt (−1: keins)
    let lo = a + 1;
    let hi = -1;
    let t = Math.min(n - 1, Math.max(a + 2, a > 0 ? reach[a - 1] : 0));
    for (let step = 2; ; step *= 2) {
      if (!fits(a, t)) {
        hi = t;
        break;
      }
      lo = t;
      if (t === n - 1) break;
      t = Math.min(n - 1, t + step);
    }
    if (hi >= 0) {
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (fits(a, m)) lo = m;
        else hi = m;
      }
    }
    reach[a] = lo;
  }
  const greedy = [0];
  while (greedy[greedy.length - 1] < n - 1) greedy.push(reach[greedy[greedy.length - 1]]);
  const K = greedy.length - 1;
  const mean = cum[n - 1] / Math.max(1, K);
  let cost = new Float64Array(n).fill(Infinity);
  cost[0] = 0;
  const from: Int32Array[] = [];
  for (let k = 0; k < K; k++) {
    const next = new Float64Array(n).fill(Infinity);
    const fr = new Int32Array(n).fill(-1);
    for (let a = 0; a < n - 1; a++) {
      if (cost[a] === Infinity) continue;
      for (let b = a + 1; b <= reach[a]; b++) {
        const c = cost[a] + (cum[b] - cum[a] - mean) ** 2;
        if (c < next[b]) {
          next[b] = c;
          fr[b] = a;
        }
      }
    }
    from.push(fr);
    cost = next;
  }
  let idx = [n - 1];
  for (let k = K - 1; k >= 0 && idx[0] >= 0; k--) idx.unshift(from[k][idx[0]]);
  if (idx[0] !== 0) idx = greedy;
  const out: Array<[number, number]> = [];
  for (let k = 0; k < idx.length - 1; k++) out.push([idx[k], idx[k + 1]]);
  return out;
}
