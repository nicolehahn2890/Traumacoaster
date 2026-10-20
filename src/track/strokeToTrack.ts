/**
 * Strich → Bahn: die Pipeline des Bühnen-Zeichnens.
 *
 * 1. Glätten + Vereinfachen (Streamline, RDP)
 * 2. Ereignisse erkennen: Kehrtwenden (= Kurven/Spurwechsel) und Selbstkreuzungen (= Loopings)
 * 3. Tiefe z pro Punkt zuweisen (Start-Spur aus dem Boden, ±1 pro Kehrtwende, smoothstep im Kurvenbereich)
 * 4. Bühne → Welt umrechnen (pro Punkt mit seinem z)
 * 5. Bezier-Fit (Schneider) und Knoten erzeugen, Looping-Scheitel markieren
 * 6. Schließen
 */
import type { Vec2 } from '@/core/math';
import { dist, segmentIntersection, smoothstep, sub, normalize, scale, add } from '@/core/math';
import { dedupe, simplifyRDP, simplifyRDPIndices, smoothStroke } from '@/core/rdp';
import { fitWithCorners } from '@/core/bezierFit';
import { createNode, emptyPath, type TrackNode, type TrackPath } from './model';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, nearestLane, toWorld, type StagePoint } from './stage';

export interface StrokeOptions {
  /** Toleranz des RDP in Bühnen-Metern */
  simplifyTolerance?: number;
  /** Fehlertoleranz des Bezier-Fits in Metern */
  fitError?: number;
  /** Mindestbreite einer Kehrtwende (Hin- und Rückweg) in Metern */
  minTurnWidth?: number;
  /** Halbe Länge des Kurvenbereichs (Bogenlänge) in Metern */
  turnHalfLength?: number;
  /** Feste Start-Spur (sonst aus dem Boden) */
  forceLane?: number;
  /** Bodenhöhe (Welt) pro x und Spur, für das Anheben der Bahn über das Terrain */
  groundHeight?: (x: number, z: number) => number;
  /** Mindestabstand zum Boden */
  groundClearance?: number;
  /** Maximale Höhe */
  maxHeight?: number;
  /** Erlaubt Kurven (Spurwechsel) */
  allowTurns?: boolean;
  /** Erlaubt Loopings */
  allowLoops?: boolean;
}

export interface StrokeEvent {
  kind: 'turn' | 'loop';
  /** Punktindex (Scheitel) */
  index: number;
  /** Richtung des Spurwechsels (+1 hinten, −1 vorne) bei turn */
  dir?: number;
  /** Bei loop: Start- und Endindex der Schleife */
  from?: number;
  to?: number;
}

export interface StrokeResult {
  path: TrackPath;
  events: StrokeEvent[];
  /** Die geglätteten Punkte mit zugewiesener Tiefe (für Vorschau/Debug) */
  points: Array<{ x: number; y: number; z: number }>;
}

const DEFAULTS: Required<Omit<StrokeOptions, 'forceLane' | 'groundHeight'>> = {
  simplifyTolerance: 0.6,
  fitError: 0.45,
  minTurnWidth: 12,
  turnHalfLength: 8,
  groundClearance: 0.6,
  maxHeight: 0,
  allowTurns: true,
  allowLoops: true,
};

/** Bogenlängen-Tabelle einer Punktfolge */
function cumulative(points: Vec2[]): number[] {
  const c = [0];
  for (let i = 1; i < points.length; i++) c.push(c[i - 1] + dist(points[i], points[i - 1]));
  return c;
}

/**
 * Kehrtwenden finden: Vorzeichenwechsel der x-Richtung, bei dem Hin- und Rückweg
 * jeweils mindestens minTurnWidth lang sind und der Strich sich nicht kreuzt (Kreuzungen werden vorher entfernt).
 */
export function detectTurns(points: Vec2[], minTurnWidth: number, loopRanges: Array<[number, number]>): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  if (points.length < 4) return events;
  const inLoop = (i: number) => loopRanges.some(([a, b]) => i >= a && i <= b);
  const cum = cumulative(points);
  /** mittlere Höhe des Strichs im Bogenlängen-Fenster [s0, s1] */
  const meanY = (s0: number, s1: number): number => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < points.length; i++) {
      if (cum[i] >= s0 && cum[i] <= s1) {
        sum += points[i].y;
        n++;
      }
    }
    return n ? sum / n : NaN;
  };
  // Richtung des Strichs in x, mit Hysterese (Zittern ignorieren)
  let dir = 0;
  let extremeIdx = 0;
  let extremeX = points[0].x;
  let legStartX = points[0].x;
  for (let i = 1; i < points.length; i++) {
    const x = points[i].x;
    if (dir === 0) {
      if (Math.abs(x - legStartX) >= minTurnWidth * 0.25) {
        dir = x > legStartX ? 1 : -1;
        extremeIdx = i;
        extremeX = x;
      }
      continue;
    }
    if ((dir === 1 && x > extremeX) || (dir === -1 && x < extremeX)) {
      extremeX = x;
      extremeIdx = i;
      continue;
    }
    // Rückweg lang genug?
    if (Math.abs(extremeX - x) >= minTurnWidth && Math.abs(extremeX - legStartX) >= minTurnWidth) {
      if (!inLoop(extremeIdx)) {
        // Höhe des Rückwegs vs. Hinwegs über je ein Fenster von minTurnWidth Bogenlänge
        const sApex = cum[extremeIdx];
        const w = minTurnWidth;
        let before = meanY(sApex - w * 1.5, sApex - w * 0.5);
        let after = meanY(sApex + w * 0.5, sApex + w * 1.5);
        if (Number.isNaN(before)) before = points[Math.max(0, extremeIdx - 1)].y;
        if (Number.isNaN(after)) after = points[Math.min(points.length - 1, extremeIdx + 1)].y;
        // Rückweg höher (Y größer in Bühnenkoordinaten = weiter oben) → nach hinten
        const turnDir = after >= before ? 1 : -1;
        events.push({ kind: 'turn', index: extremeIdx, dir: turnDir });
      }
      dir = -dir;
      legStartX = extremeX;
      extremeX = x;
      extremeIdx = i;
    }
  }
  return events;
}

/** Verdichtet eine Punktfolge (mit Tiefe) auf höchstens `maxStep` Abstand. */
export function densify(points: Vec2[], z: number[], maxStep: number): { points: Vec2[]; z: number[] } {
  const outP: Vec2[] = [];
  const outZ: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / maxStep));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      outP.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      outZ.push(z[i] + (z[i + 1] - z[i]) * f);
    }
  }
  outP.push(points[points.length - 1]);
  outZ.push(z[z.length - 1]);
  return { points: outP, z: outZ };
}

/** Selbstkreuzungen finden (einfacher O(n²)-Sweep, Punktzahl ist nach RDP klein). */
export function detectLoops(points: Vec2[]): StrokeEvent[] {
  const events: StrokeEvent[] = [];
  const n = points.length;
  let i = 0;
  while (i < n - 3) {
    let found = false;
    for (let j = i + 2; j < n - 1; j++) {
      const hit = segmentIntersection(points[i], points[i + 1], points[j], points[j + 1]);
      if (hit) {
        // Schleife von i..j; Scheitel = Punkt mit dem größten Abstand zur Kreuzung
        let apex = i + 1;
        let best = -1;
        for (let k = i + 1; k <= j; k++) {
          const d = dist(points[k], hit.point);
          if (d > best) {
            best = d;
            apex = k;
          }
        }
        // Mini-Schleifen (Zittern) ignorieren
        if (best > 2.5) events.push({ kind: 'loop', index: apex, from: i, to: j + 1 });
        i = j + 1;
        found = true;
        break;
      }
    }
    if (!found) i++;
  }
  return events;
}

/** Tiefe pro Punkt: Start-Spur, dann ±1 an jeder Kehrtwende, weich über den Kurvenbereich. */
export function assignDepth(points: Vec2[], startLane: number, turns: StrokeEvent[], turnHalfLength: number): number[] {
  const cum = cumulative(points);
  const z = new Array<number>(points.length).fill(startLane);
  let lane = startLane;
  const sortedTurns = [...turns].sort((a, b) => a.index - b.index);
  for (const t of sortedTurns) {
    const dir = t.dir ?? 1;
    let next = lane + dir;
    if (next > LANE_MAX || next < LANE_MIN) {
      next = lane - dir; // an der letzten Spur in die andere Richtung
      t.dir = -dir;
    }
    const sApex = cum[t.index];
    for (let i = 0; i < points.length; i++) {
      const s = cum[i];
      if (s <= sApex - turnHalfLength) continue;
      const f = smoothstep((s - (sApex - turnHalfLength)) / (2 * turnHalfLength));
      z[i] = lane + (next - lane) * f;
    }
    lane = next;
  }
  return z;
}

/**
 * Bühne → Welt, dann über das Terrain heben: verdichten, anheben, erneut vereinfachen.
 * Liefert Weltpunkte mit Tiefe.
 */
export function liftOverGround(
  stagePts: Vec2[],
  z: number[],
  groundHeight: ((x: number, z: number) => number) | undefined,
  clearance: number,
  maxHeight: number,
): { points: Vec2[]; z: number[] } {
  const dense = densify(stagePts, z, 1.0);
  const world: Vec2[] = dense.points.map((p, i) => toWorld(p.x, p.y, dense.z[i]));
  for (let i = 0; i < world.length; i++) {
    const ground = groundHeight ? groundHeight(world[i].x, dense.z[i]) : 0;
    world[i].y = Math.max(world[i].y, ground + clearance);
    if (maxHeight > 0) world[i].y = Math.min(world[i].y, maxHeight);
  }
  // Nur kollineare Punkte entfernen: Der Fit braucht dichte Punkte, sonst schwingen die Handles über.
  const keep = simplifyRDPIndices(world, 0.03);
  return { points: keep.map((i) => world[i]), z: keep.map((i) => dense.z[i]) };
}

/** Die vollständige Pipeline. Eingabe sind Bühnenkoordinaten (X, Y) in Metern. */
export function strokeToTrack(stroke: StagePoint[], opts: StrokeOptions = {}): StrokeResult {
  const o = { ...DEFAULTS, ...opts };
  const raw: Vec2[] = stroke.map((p) => ({ x: p.X, y: p.Y }));
  let pts = dedupe(raw, 0.15);
  pts = smoothStroke(pts, 5);
  pts = simplifyRDP(pts, o.simplifyTolerance);
  if (pts.length < 2) return { path: emptyPath(), events: [], points: [] };

  // Ereignisse
  const loops = o.allowLoops ? detectLoops(pts) : [];
  const loopRanges = loops.map((l) => [l.from!, l.to!] as [number, number]);
  const turns = o.allowTurns ? detectTurns(pts, o.minTurnWidth, loopRanges) : [];
  const events = [...loops, ...turns].sort((a, b) => a.index - b.index);

  // Tiefe
  const startLane = opts.forceLane ?? nearestLane(pts[0].y);
  let z = assignDepth(pts, startLane, turns, o.turnHalfLength);

  // Bühne → Welt pro Punkt
  const lifted = liftOverGround(pts, z, opts.groundHeight, o.groundClearance, o.maxHeight);
  const world = lifted.points;
  z = lifted.z;

  // Bezier-Fit in Weltkoordinaten
  const segments = fitWithCorners(world, o.fitError);
  if (!segments.length) return { path: emptyPath(), events: [], points: [] };
  const nodes: TrackNode[] = [];
  const zAt = (p: Vec2): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < world.length; i++) {
      const d = dist(world[i], p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return z[best];
  };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const node = createNode(seg.p0.x, seg.p0.y, zAt(seg.p0), i === 0 ? 'station' : 'normal');
    node.outX = seg.p1.x - seg.p0.x;
    node.outY = seg.p1.y - seg.p0.y;
    if (i > 0) {
      const prev = segments[i - 1];
      node.inX = prev.p2.x - prev.p3.x;
      node.inY = prev.p2.y - prev.p3.y;
    }
    nodes.push(node);
  }
  // letzter Punkt
  const last = segments[segments.length - 1];
  const endNode = createNode(last.p3.x, last.p3.y, zAt(last.p3));
  endNode.inX = last.p2.x - last.p3.x;
  endNode.inY = last.p2.y - last.p3.y;
  nodes.push(endNode);

  // Looping-Scheitel markieren: Knoten, der dem Apex-Punkt am nächsten liegt
  for (const l of loops) {
    const apex = world[l.index];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - apex.x, nodes[i].y - apex.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && nodes[best].kind === 'normal') nodes[best].kind = 'loopApex';
  }
  // Kurven-Knoten markieren
  for (const t of turns) {
    const apex = world[t.index];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - apex.x, nodes[i].y - apex.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && nodes[best].kind === 'normal') nodes[best].kind = 'turn';
  }

  const path: TrackPath = { ...emptyPath(), nodes };
  closePath(path);
  return { path, events, points: world.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })) };
}

/**
 * Baut die Knoten eines Halbkreis-Spurwechsels (Kehre) in der x/z-Ebene.
 * dir = +1: Kehre holt nach rechts aus, −1: nach links. Fahrtrichtung dreht sich um.
 * Die Höhe wird von yFrom nach yTo interpoliert. Knoten sind vom Typ 'closeTurn'.
 */
export function buildTurnArc(xCenter: number, dir: number, yFrom: number, yTo: number, zFrom: number, zTo: number): TrackNode[] {
  const R = LANE_DEPTH / 2;
  const steps = 4; // Winkel 0, 45°, 90°, 135°, 180°
  const out: TrackNode[] = [];
  for (let k = 0; k <= steps; k++) {
    const th = (Math.PI * k) / steps;
    const f = k / steps;
    const x = xCenter + dir * R * Math.sin(th);
    const y = yFrom + (yTo - yFrom) * f;
    const z = zFrom + (zTo - zFrom) * (1 - Math.cos(th)) / 2;
    const nd = createNode(x, y, z, 'closeTurn');
    // Profil-Handles entlang dx/dθ = R·cos θ (in Fahrtrichtung), Δθ/3 als Handle-Länge
    const dTh = Math.PI / steps / 3;
    const hx = dir * R * Math.cos(th) * dTh;
    const hy = ((yTo - yFrom) / steps) / 3;
    nd.outX = hx; nd.outY = hy;
    nd.inX = -hx; nd.inY = -hy;
    out.push(nd);
  }
  return out;
}

/**
 * Schließt den Pfad.
 * - Ende nahe am Start: direkt verbinden (letzter Knoten fällt weg, wenn er praktisch auf dem Start liegt).
 * - Ende weit weg, gleiche Spur: automatischer Rückweg über die Nachbarspur (Out-and-Back) mit zwei
 *   Kurven, die nicht als Spieler-Kurven zählen (kind 'closeTurn'/'closeReturn').
 * - Unterschiedliche Spur: direkte Verbindung, die Tiefe interpoliert (ergibt eine Kurve).
 */
export function closePath(path: TrackPath, returnHeight = 0.8): void {
  const nodes = path.nodes;
  if (nodes.length < 2) return;
  // alte Auto-Knoten entfernen (bei erneutem Schließen)
  for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].kind === 'closeTurn' || nodes[i].kind === 'closeReturn') nodes.splice(i, 1);
  const first = nodes[0];
  let last = nodes[nodes.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) < 1.5 && Math.abs(last.z - first.z) < 0.25) {
    nodes.pop();
    last = nodes[nodes.length - 1];
  }
  const gap = Math.hypot(first.x - last.x, first.y - last.y);
  const sameLane = Math.abs(Math.round(first.z) - Math.round(last.z)) === 0;

  if (gap > 12 && sameLane) {
    const z0 = Math.round(first.z);
    const zr = z0 + 1 <= LANE_MAX ? z0 + 1 : z0 - 1;
    // Fahrtrichtung am Ende (x) bestimmt, wohin die Kehre ausholt
    const endDir = normalize({ x: -last.inX, y: -last.inY });
    const d = endDir.x >= 0 ? 1 : -1;
    const startDir = normalize({ x: first.outX, y: first.outY });
    const ds = startDir.x >= 0 ? 1 : -1;
    const yEnd = Math.max(returnHeight, Math.min(last.y, returnHeight + 2));
    const yStart = Math.max(returnHeight, Math.min(first.y, returnHeight + 2));
    // Kehre am Ende: Halbkreis in der x/z-Ebene (Radius = halber Spurabstand)
    const arcEnd = buildTurnArc(last.x + 2 * d, d, yEnd, returnHeight, z0, zr);
    const r1 = createNode(last.x - 1 * d, returnHeight, zr, 'closeReturn');
    const r2 = createNode(first.x + 1 * ds, returnHeight, zr, 'closeReturn');
    // Kehre am Anfang: Halbkreis zurück auf die Startspur
    const arcStart = buildTurnArc(first.x - 2 * ds, -ds, returnHeight, yStart, zr, z0);
    nodes.push(...arcEnd, r1, r2, ...arcStart);
    // Rückweg waagerecht
    const back = -d;
    const retLen = Math.max(1, Math.abs(r2.x - r1.x) / 3);
    r1.inX = -back * Math.min(retLen, 3); r1.inY = 0; r1.outX = back * retLen; r1.outY = 0;
    r2.inX = -back * retLen; r2.inY = 0; r2.outX = back * Math.min(retLen, 3); r2.outY = 0;
    // Nahtstellen: last → Bogen, Bogen → first
    const a0 = arcEnd[0];
    const lo = Math.max(1, Math.hypot(a0.x - last.x, a0.y - last.y) / 3);
    last.outX = endDir.x * lo;
    last.outY = endDir.y * lo;
    const aN = arcStart[arcStart.length - 1];
    const li = Math.max(1, Math.hypot(first.x - aN.x, first.y - aN.y) / 3);
    first.inX = -startDir.x * li;
    first.inY = -startDir.y * li;
    nodes[0].kind = 'station';
    return;
  }

  const h = Math.max(2, gap / 3);
  const endDir = normalize({ x: -last.inX, y: -last.inY });
  const startDir = normalize({ x: first.outX, y: first.outY });
  const toStart = normalize(sub({ x: first.x, y: first.y }, { x: last.x, y: last.y }));
  const outDir = normalize(add(scale(endDir, 0.5), scale(toStart, 0.5)));
  const inDir = normalize(add(scale(startDir, -0.5), scale(toStart, -0.5)));
  last.outX = outDir.x * h;
  last.outY = outDir.y * h;
  first.inX = inDir.x * h;
  first.inY = inDir.y * h;
  nodes[0].kind = 'station';
}
