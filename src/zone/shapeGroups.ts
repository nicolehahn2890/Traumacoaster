/**
 * Formgruppen in einer Ebene (Zonen-Editor, Rest von Stufe 2; Plan 4.3 „Gruppieren“ und der Isolationsmodus aus
 * Abschnitt 3, „Gruppe doppelt antippen“): wie Gruppen in Illustrator. Eine Form trägt die Kennungen ihrer Gruppen von
 * außen nach innen (`groups`); eine Gruppe hat keine eigenen Daten, sie ist die Menge der Formen mit ihrer Kennung.
 * Gruppen liegen in einer Ebene, sind ineinander geschachtelt (nie überlappend), haben mindestens zwei Formen und sind
 * in der Zeichenreihenfolge zusammenhängend. Gewählt wird je Einheit: im Kontext (den Gruppen, in die man doppelt
 * tippend hineingegangen ist; leer = oberste Stufe) eine ganze Gruppe der nächsten Stufe oder eine einzelne Form.
 * Ohne DOM.
 */
import { findShape, isShape, shapesOf, type ZoneNode, type ZoneShape } from './nodes';

/** Gruppen, in die man hineingegangen ist (von außen nach innen); leer = oberste Stufe */
export type GroupContext = readonly string[];

export const GROUP_ID = /^fg\d{1,6}$/;

const pathOf = (s: ZoneShape): readonly string[] => s.groups ?? [];

function setPath(s: ZoneShape, g: readonly string[]): void {
  if (g.length) s.groups = [...g];
  else delete s.groups;
}

/** liegt die Form im Kontext (beginnen ihre Gruppen mit ihm)? */
export function inContext(s: ZoneShape, ctx: GroupContext): boolean {
  const g = pathOf(s);
  return ctx.every((id, i) => g[i] === id);
}

/** Kennung der Einheit einer Form im Kontext: ihre Gruppe eine Stufe unter dem Kontext oder die Form selbst */
export function unitKey(s: ZoneShape, ctx: GroupContext): string {
  return pathOf(s)[ctx.length] ?? s.id;
}

/** alle Formen einer Gruppe (in Zeichenreihenfolge ihrer Ebene) */
export function groupMembersOf(nodes: readonly ZoneNode[], gid: string): ZoneShape[] {
  const first = nodes.find((n): n is ZoneShape => isShape(n) && pathOf(n).includes(gid));
  return first ? shapesOf(nodes, first.parent).filter((s) => pathOf(s).includes(gid)) : [];
}

/** Formen der Einheit einer Form im Kontext */
export function unitShapes(nodes: readonly ZoneNode[], s: ZoneShape, ctx: GroupContext): ZoneShape[] {
  const key = unitKey(s, ctx);
  return key === s.id ? [s] : groupMembersOf(nodes, key);
}

/** Einheiten des Kontexts in einer Ebene, in Zeichenreihenfolge (hinten zuerst), je Einheit ihre Formen */
export function unitsOf(nodes: readonly ZoneNode[], planeId: string, ctx: GroupContext): ZoneShape[][] {
  const units: ZoneShape[][] = [];
  for (const s of shapesOf(nodes, planeId)) {
    if (!inContext(s, ctx)) continue;
    const last = units.at(-1);
    if (last && unitKey(last[0], ctx) === unitKey(s, ctx)) last.push(s);
    else units.push([s]);
  }
  return units;
}

/**
 * Auswahl auf ganze Einheiten erweitern: eine Form im Kontext bringt ihre Einheit im Kontext mit, eine Form außerhalb
 * ihre Einheit der obersten Stufe
 */
export function expandToUnits(nodes: readonly ZoneNode[], ids: readonly string[], ctx: GroupContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const s = findShape(nodes, id);
    if (!s) continue;
    for (const m of unitShapes(nodes, s, inContext(s, ctx) ? ctx : [])) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m.id);
    }
  }
  return out;
}

/** nächste freie Gruppenkennung (fg1, fg2, …) */
export function nextGroupId(nodes: readonly ZoneNode[]): string {
  let max = 0;
  for (const n of nodes) if (isShape(n)) for (const g of pathOf(n)) max = Math.max(max, Number(g.slice(2)) || 0);
  return `fg${max + 1}`;
}

/**
 * Formen einer Ebene gruppieren (Cmd+G). Die neue Gruppe kommt in die innerste Gruppe, die alle gemeinsam haben; ganz
 * gewählte Untergruppen bleiben darin erhalten, aus teilweise gewählten werden die Formen herausgenommen. Die Formen
 * rücken in der Zeichenreihenfolge zusammen, dorthin, wo die vorderste lag. Gibt die neue Kennung oder null
 * (weniger als zwei Einheiten, verschiedene Ebenen)
 */
export function groupShapes(nodes: ZoneNode[], ids: readonly string[]): string | null {
  const sel = ids.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s);
  if (sel.length < 2 || sel.some((s) => s.parent !== sel[0].parent)) return null;
  let prefix = [...pathOf(sel[0])];
  for (const s of sel) {
    const g = pathOf(s);
    let i = 0;
    while (i < prefix.length && g[i] === prefix[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const chosen = new Set(sel.map((s) => s.id));
  const whole = (gid: string): boolean => groupMembersOf(nodes, gid).every((m) => chosen.has(m.id));
  const id = nextGroupId(nodes);
  for (const s of sel) {
    const g = pathOf(s);
    let k = prefix.length;
    while (k < g.length && !whole(g[k])) k++;
    setPath(s, [...prefix, id, ...g.slice(k)]);
  }
  normalizeShapeGroups(nodes);
  // war die Auswahl schon genau eine Gruppe, fällt die neue als doppelt weg
  return nodes.some((n) => isShape(n) && pathOf(n).includes(id)) ? id : null;
}

/**
 * Gruppen auflösen (Shift+Cmd+G): die Gruppen, die im Kontext als Einheit gewählt sind, verschwinden; ihre Formen und
 * Untergruppen bleiben. Gibt die Zahl der aufgelösten Gruppen
 */
export function ungroupShapes(nodes: ZoneNode[], ids: readonly string[], ctx: GroupContext): number {
  const sel = ids.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s && inContext(s, ctx));
  const keys = new Set(sel.map((s) => pathOf(s)[ctx.length]).filter((g): g is string => !!g));
  if (!keys.size) return 0;
  for (const n of nodes) {
    if (!isShape(n)) continue;
    const g = pathOf(n);
    if (keys.has(g[ctx.length])) setPath(n, [...g.slice(0, ctx.length), ...g.slice(ctx.length + 1)]);
  }
  normalizeShapeGroups(nodes);
  return keys.size;
}

/**
 * Gruppen kopierter Formen: ganz kopierte Gruppen bekommen neue Kennungen (die Kopie ist eine eigene Gruppe), teilweise
 * kopierte bleiben in derselben Ebene (die Kopie gehört dazu) und fallen in einer anderen weg. whole sagt, ob eine Gruppe
 * beim Kopieren ganz dabei war; copies[i] ist die Kopie von originals[i]
 */
export function copyGroups(nodes: readonly ZoneNode[], originals: readonly ZoneShape[], copies: readonly ZoneShape[], samePlane: boolean, whole: (gid: string) => boolean): void {
  const map = new Map<string, string | null>();
  let next = Number(nextGroupId(nodes).slice(2));
  for (const s of originals)
    for (const g of pathOf(s)) {
      if (map.has(g)) continue;
      map.set(g, whole(g) ? `fg${next++}` : samePlane ? g : null);
    }
  copies.forEach((c, i) => setPath(c, pathOf(originals[i]).flatMap((g) => map.get(g) ?? [])));
}

/**
 * Die gewählte Einheit im Kontext um eine Einheit nach vorn (1) oder hinten (−1) in der Zeichenreihenfolge (an der
 * nächsten Form oder Gruppe derselben Stufe vorbei). false, wenn die Auswahl nicht genau eine ganze Einheit des Kontexts
 * ist oder es nicht weitergeht
 */
export function moveUnit(nodes: readonly ZoneNode[], ids: readonly string[], ctx: GroupContext, dir: 1 | -1): boolean {
  const sel = ids.map((id) => findShape(nodes, id)).filter((s): s is ZoneShape => !!s);
  if (!sel.length || sel.some((s) => s.parent !== sel[0].parent || !inContext(s, ctx))) return false;
  const key = unitKey(sel[0], ctx);
  if (sel.some((s) => unitKey(s, ctx) !== key)) return false;
  const units = unitsOf(nodes, sel[0].parent, ctx);
  const i = units.findIndex((u) => unitKey(u[0], ctx) === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= units.length || units[i].length !== new Set(sel).size) return false;
  const vals = units.flat().map((s) => s.order);
  [units[i], units[j]] = [units[j], units[i]];
  units.flat().forEach((s, k) => (s.order = vals[k]));
  return true;
}

/**
 * Gruppen in Ordnung halten (nach jeder Änderung): Kennungen, die in mehreren Ebenen, auf verschiedenen Stufen oder unter
 * verschiedenen Eltern vorkommen, fallen weg, ebenso Gruppen mit weniger als zwei Formen und eine Gruppe, die genau so
 * viele Formen hat wie die um sie herum. Danach rücken die Formen jeder Gruppe in der Zeichenreihenfolge zusammen.
 * Gibt true, wenn sich etwas geändert hat
 */
export function normalizeShapeGroups(nodes: readonly ZoneNode[]): boolean {
  const shapes = nodes.filter(isShape);
  let changed = false;
  for (let round = 0; round < 8; round++) {
    const info = new Map<string, { plane: string; parent: string; depth: number; count: number; bad: boolean }>();
    for (const s of shapes) {
      const g = pathOf(s);
      g.forEach((id, i) => {
        const parent = i ? g[i - 1] : '';
        const e = info.get(id);
        if (!e) info.set(id, { plane: s.parent, parent, depth: i, count: 1, bad: g.indexOf(id) !== i || !GROUP_ID.test(id) });
        else {
          e.count++;
          if (e.plane !== s.parent || e.parent !== parent || e.depth !== i || g.indexOf(id) !== i) e.bad = true;
        }
      });
    }
    const drop = new Set<string>();
    for (const [id, e] of info) {
      if (e.bad || e.count < 2) drop.add(id);
      else if (e.parent && !info.get(e.parent)?.bad && info.get(e.parent)?.count === e.count) drop.add(id);
    }
    if (!drop.size) break;
    changed = true;
    for (const s of shapes) {
      const g = pathOf(s);
      if (g.some((id) => drop.has(id))) setPath(s, g.filter((id) => !drop.has(id)));
    }
  }
  for (const plane of new Set(shapes.filter((s) => s.groups?.length).map((s) => s.parent))) changed = tidyOrder(nodes, plane) || changed;
  return changed;
}

/**
 * Formen einer Ebene so ordnen, dass jede Gruppe zusammenhängt: jede Einheit liegt dort, wo ihre vorderste Form lag
 * (wie Illustrator beim Gruppieren). Die vorhandenen Werte von order werden nur neu verteilt
 */
function tidyOrder(nodes: readonly ZoneNode[], planeId: string): boolean {
  const list = shapesOf(nodes, planeId);
  const rep = new Map<string, number>();
  list.forEach((s, i) => {
    for (const g of pathOf(s)) rep.set(g, Math.max(rep.get(g) ?? -1, i));
  });
  const keyed = list.map((s, i) => ({ s, k: [...pathOf(s).map((g) => rep.get(g) ?? i), i] }));
  keyed.sort((a, b) => {
    for (let d = 0; d < Math.min(a.k.length, b.k.length); d++) if (a.k[d] !== b.k[d]) return a.k[d] - b.k[d];
    return a.k.length - b.k.length;
  });
  const vals = list.map((s) => s.order);
  let changed = false;
  keyed.forEach(({ s }, i) => {
    if (s.order !== vals[i]) {
      s.order = vals[i];
      changed = true;
    }
  });
  return changed;
}

/** Zeichenreihenfolge einer Ebene neu durchzählen (1, 2, 3, …), etwa nachdem Kopien zwischen zwei Formen kamen */
export function renumberOrder(nodes: readonly ZoneNode[], planeId: string): void {
  shapesOf(nodes, planeId).forEach((s, i) => (s.order = i + 1));
}
