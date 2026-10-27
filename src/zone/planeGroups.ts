/**
 * Ebenen-Gruppen und Reihenfolge (Zonen-Editor, nach Tor S2; Plan 4.4 „Reihenfolge ziehen, die Tiefe folgt der
 * Reihenfolge“, Befund 6 „Ebenen-Gruppen“): Die Liste zeigt die Ebenen von vorn nach hinten, eine Gruppe ist ein Lauf
 * benachbarter Ebenen darin (wie ein Ordner in Photoshop). Damit das so bleibt, ordnen Ziehen in der Liste und Gruppieren
 * die Tiefen neu, und eine Tiefe lässt sich nur bis zur nächsten Ebene einer anderen Gruppe schieben. Ohne DOM.
 */
import { DEFAULT_GAP, groupsOf, movePlaneDepth, newGroup, planesOf, type HoldView, type ZoneGroup, type ZoneNode, type ZonePlane } from './nodes';

/** so weit (Meter) bleiben Ebenen beim Einordnen mindestens auseinander */
const MIN_GAP = 0.05;
/** und so weit vor der nächsten Ebene einer anderen Gruppe hält eine geschobene Tiefe an */
const STOP = 0.01;

/**
 * Gruppen aufräumen: die Ebenen einer Gruppe liegen beieinander (wer abgerissen ist, verlässt sie; es bleibt der längste
 * Lauf), Verweise auf fehlende Gruppen fallen weg, leere Gruppen auch. Gibt die Knoten ohne leere Gruppen zurück
 */
export function normalizeGroups(nodes: ZoneNode[]): ZoneNode[] {
  const planes = planesOf(nodes);
  const ids = new Set(groupsOf(nodes).map((g) => g.id));
  for (const p of planes) if (p.group && !ids.has(p.group)) delete p.group;
  for (const g of groupsOf(nodes)) {
    const idx = planes.flatMap((p, i) => (p.group === g.id ? [i] : []));
    if (idx.length < 2) continue;
    let best: [number, number] = [idx[0], idx[0]];
    let cur: [number, number] = [idx[0], idx[0]];
    for (const i of idx.slice(1)) {
      cur = i === cur[1] + 1 ? [cur[0], i] : [i, i];
      if (cur[1] - cur[0] > best[1] - best[0]) best = [cur[0], cur[1]];
    }
    for (const i of idx) if (i < best[0] || i > best[1]) delete planes[i].group;
  }
  const used = new Set(planes.map((p) => p.group).filter(Boolean));
  return nodes.filter((n) => n.kind !== 'group' || used.has(n.id));
}

/**
 * Wie weit sich die Ebenen moving zusammen in der Tiefe schieben lassen (Δz), ohne an einer Ebene einer anderen Gruppe
 * vorbeizukommen (Ebenen ohne Gruppe zählen als eine Gruppe); nie so, dass sie sich bewegen müssen
 */
export function depthLimits(nodes: readonly ZoneNode[], moving: readonly string[]): { min: number; max: number } {
  const set = new Set(moving);
  const planes = planesOf(nodes);
  let min = -Infinity;
  let max = Infinity;
  planes.forEach((p, i) => {
    if (!set.has(p.id)) return;
    planes.forEach((q, j) => {
      if (set.has(q.id) || (q.group ?? null) === (p.group ?? null)) return;
      if (j > i) max = Math.min(max, Math.max(0, q.z - p.z - STOP));
      else min = Math.max(min, Math.min(0, q.z - p.z + STOP));
    });
  });
  return { min, max };
}

/**
 * Ebenen in der Reihenfolge verschieben (Ziehen in der Liste): vor die Ebene before (null: ganz nach hinten), in die
 * Gruppe group (null: keine). Eine ganze Gruppe behält ihre Abstände; mehrere andere Ebenen verteilen sich gleichmäßig
 * in der Lücke. Ist die Lücke zu schmal, rücken die Ebenen dahinter nach hinten. hold: „Bild halten“ (jede verschobene
 * Ebene behält ihr Bild im Spielblick). false, wenn sich nichts ändert
 */
export function reorderPlanes(nodes: ZoneNode[], ids: readonly string[], before: string | null, group: string | null, hold: HoldView | null): boolean {
  const all = planesOf(nodes);
  const moving = all.filter((p) => ids.includes(p.id));
  const rest = all.filter((p) => !ids.includes(p.id));
  if (!moving.length) return false;
  const at = before ? rest.findIndex((p) => p.id === before) : rest.length;
  if (at < 0) return false;
  const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  const sameOrder = order.every((p, i) => p === all[i]);
  const sameGroup = moving.every((p) => (p.group ?? null) === group);
  if (sameOrder && sameGroup) return false;
  for (const p of moving) {
    if (group) p.group = group;
    else delete p.group;
  }
  if (sameOrder) return true;
  const prev = rest[at - 1] ?? null;
  const next = rest[at] ?? null;
  // eine ganze Gruppe behält ihre Abstände
  const whole = !!group && moving.every((p) => p.group === group) && rest.every((p) => p.group !== group);
  const span = whole ? moving[moving.length - 1].z - moving[0].z : 0;
  const k = moving.length;
  let zs: number[];
  if (prev && next) {
    const need = whole ? span + 2 * MIN_GAP : MIN_GAP * (k + 1);
    if (next.z - prev.z < need) {
      const push = need - (next.z - prev.z);
      for (const p of rest.slice(at)) movePlaneDepth(p, p.z + push, hold);
    }
    const room = next.z - prev.z;
    zs = whole ? moving.map((p) => prev.z + (room - span) / 2 + (p.z - moving[0].z)) : moving.map((_, i) => prev.z + (room * (i + 1)) / (k + 1));
  } else if (next) zs = whole ? moving.map((p) => next.z - DEFAULT_GAP - span + (p.z - moving[0].z)) : moving.map((_, i) => next.z - DEFAULT_GAP * (k - i));
  else if (prev) zs = whole ? moving.map((p) => prev.z + DEFAULT_GAP + (p.z - moving[0].z)) : moving.map((_, i) => prev.z + DEFAULT_GAP * (i + 1));
  else return true;
  // erst alle Ziele, dann verschieben (die Abstände einer Gruppe rechnen vom alten Stand)
  moving.forEach((p, i) => movePlaneDepth(p, zs[i], hold));
  return true;
}

/**
 * Ebenen zu einer neuen Gruppe zusammenfassen; liegen sie nicht beieinander, kommen die übrigen gleich hinter die
 * vorderste. Ebenen aus anderen Gruppen verlassen diese. Gibt die neue Gruppe zurück
 */
export function groupPlanes(nodes: ZoneNode[], ids: readonly string[], hold: HoldView | null, name?: string): ZoneGroup | null {
  const planes = planesOf(nodes).filter((p) => ids.includes(p.id));
  if (!planes.length) return null;
  const g = newGroup(nodes, name);
  nodes.push(g);
  for (const p of planes) delete p.group;
  const all = planesOf(nodes);
  const first = all.indexOf(planes[0]);
  if (!planes.every((p, i) => all.indexOf(p) === first + i)) {
    const after = all.slice(first + 1).find((p) => !ids.includes(p.id)) ?? null;
    reorderPlanes(
      nodes,
      planes.slice(1).map((p) => p.id),
      after?.id ?? null,
      null,
      hold,
    );
  }
  for (const p of planes) p.group = g.id;
  return g;
}

/** Gruppe auflösen: die Ebenen bleiben, wo sie sind */
export function ungroup(nodes: ZoneNode[], groupId: string): ZoneNode[] {
  for (const n of nodes) if (n.kind === 'plane' && n.group === groupId) delete n.group;
  return nodes.filter((n) => n.id !== groupId);
}

/** Zeilen der Ebenenliste von vorn nach hinten: vor der ersten Ebene einer Gruppe ihre Kopfzeile */
export type ListEntry = { kind: 'group'; group: ZoneGroup; members: ZonePlane[] } | { kind: 'plane'; plane: ZonePlane; group: ZoneGroup | null };

export function listEntries(nodes: readonly ZoneNode[]): ListEntry[] {
  const groups = new Map(groupsOf(nodes).map((g) => [g.id, g]));
  const planes = planesOf(nodes);
  const out: ListEntry[] = [];
  let open: string | null = null;
  for (const p of planes) {
    const g = p.group ? (groups.get(p.group) ?? null) : null;
    if (g && open !== g.id) out.push({ kind: 'group', group: g, members: planes.filter((x) => x.group === g.id) });
    open = g?.id ?? null;
    out.push({ kind: 'plane', plane: p, group: g });
  }
  return out;
}
