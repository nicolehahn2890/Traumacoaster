/**
 * Umformen mehrerer Formen (Zonen-Editor, Rest von Stufe 2; Plan 4.3 „drehen“, „Ausrichten“): drehen um einen Punkt,
 * ausrichten und verteilen am gemeinsamen Rahmen. Alles in Ebenen-Koordinaten (y nach oben). Eine Form trägt keine
 * Drehung, das Drehen rechnet sie (mit ihrem Maßstab) in die Pfade ein. Ohne DOM.
 */
import { shapeBounds, type ZoneShape } from './nodes';
import { cloneFills, mapFillPoints } from './paint';
import { cloneMesh, mapMeshPoints, meshPath } from './mesh';
import type { PathPoint, ZonePath } from './path';

interface Pt {
  x: number;
  y: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;

/**
 * Form um pivot (Ebenen-Koordinaten) um angle (Bogenmaß, gegen den Uhrzeigersinn) drehen, ausgehend vom Stand orig
 * (beim Ziehen immer vom Anfang aus, damit sich nichts aufsummiert). Pfade, Löcher, Linien und Füllpunkte drehen mit;
 * der Maßstab der Form steckt danach in den Pfaden (sx = sy = 1). Bei 0 bleibt alles wie orig
 */
export function rotateShape(shape: ZoneShape, orig: ZoneShape, pivot: Pt, angle: number): void {
  if (Math.abs(angle) < 1e-9) {
    Object.assign(shape, { x: orig.x, y: orig.y, sx: orig.sx, sy: orig.sy, path: orig.path, holes: orig.holes, cuts: orig.cuts, regions: orig.regions, fills: orig.fills, dockOff: orig.dockOff });
    if (!orig.dockOff) delete shape.dockOff;
    if (!orig.holes) delete shape.holes;
    if (!orig.cuts) delete shape.cuts;
    if (!orig.regions) delete shape.regions;
    if (!orig.fills) delete shape.fills;
    if (orig.mesh) shape.mesh = cloneMesh(orig.mesh);
    else delete shape.mesh;
    return;
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rs = (x: number, y: number): [number, number] => {
    const X = orig.sx * x;
    const Y = orig.sy * y;
    return [c * X - s * Y, s * X + c * Y];
  };
  const map = (path: ZonePath): ZonePath =>
    path.map((p) => {
      const [x, y] = rs(p.x, p.y);
      const o: PathPoint = { x: r3(x), y: r3(y) };
      if (p.inX || p.inY) {
        const [hx, hy] = rs(p.inX ?? 0, p.inY ?? 0);
        o.inX = r3(hx);
        o.inY = r3(hy);
      }
      if (p.outX || p.outY) {
        const [hx, hy] = rs(p.outX ?? 0, p.outY ?? 0);
        o.outX = r3(hx);
        o.outY = r3(hy);
      }
      return o;
    });
  shape.path = map(orig.path);
  if (orig.holes) shape.holes = orig.holes.map(map);
  if (orig.cuts) shape.cuts = orig.cuts.map((k) => ({ ...k, path: map(k.path) }));
  if (orig.regions)
    shape.regions = orig.regions.map((r) => {
      const [x, y] = rs(r.x, r.y);
      const fills = cloneFills(r.fills);
      mapFillPoints(fills, rs);
      return { ...r, x: r3(x), y: r3(y), ...(fills ? { fills } : {}) };
    });
  if (orig.fills) {
    shape.fills = cloneFills(orig.fills);
    mapFillPoints(shape.fills, rs);
  }
  if (orig.dockOff)
    shape.dockOff = orig.dockOff.map(([x, y]) => {
      const [a, b] = rs(x, y);
      return [r3(a), r3(b)];
    });
  if (orig.mesh) {
    shape.mesh = cloneMesh(orig.mesh);
    mapMeshPoints(shape.mesh, rs);
    shape.path = meshPath(shape.mesh);
  }
  const dx = orig.x - pivot.x;
  const dy = orig.y - pivot.y;
  shape.x = r3(pivot.x + c * dx - s * dy);
  shape.y = r3(pivot.y + s * dx + c * dy);
  shape.sx = 1;
  shape.sy = 1;
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** gemeinsamer Rahmen mehrerer Formen (Ebenen-Koordinaten) */
export function unionBounds(shapes: readonly ZoneShape[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of shapes) {
    const b = shapeBounds(s);
    u.minX = Math.min(u.minX, b.minX);
    u.minY = Math.min(u.minY, b.minY);
    u.maxX = Math.max(u.maxX, b.maxX);
    u.maxY = Math.max(u.maxY, b.maxY);
  }
  return u;
}

type Unit = ZoneShape | readonly ZoneShape[];
const list = (u: Unit): readonly ZoneShape[] => (Array.isArray(u) ? u : [u as ZoneShape]);

/** eine Einheit (Form oder Gruppe) als Ganzes verschieben */
function shift(u: Unit, dx: number, dy: number): void {
  for (const s of list(u)) {
    s.x = r3(s.x + dx);
    s.y = r3(s.y + dy);
  }
}

/**
 * Einheiten am gemeinsamen Rahmen ausrichten (wie Illustrator „an Auswahl ausrichten“; oben ist y groß); eine Einheit ist
 * eine Form oder eine Gruppe, die als Ganzes wandert
 */
export function alignShapes(units: readonly Unit[], mode: AlignMode): void {
  if (units.length < 2) return;
  const u = unionBounds(units.flatMap(list));
  for (const unit of units) {
    const b = unionBounds(list(unit));
    if (mode === 'left') shift(unit, u.minX - b.minX, 0);
    if (mode === 'right') shift(unit, u.maxX - b.maxX, 0);
    if (mode === 'hcenter') shift(unit, (u.minX + u.maxX - b.minX - b.maxX) / 2, 0);
    if (mode === 'top') shift(unit, 0, u.maxY - b.maxY);
    if (mode === 'bottom') shift(unit, 0, u.minY - b.minY);
    if (mode === 'vcenter') shift(unit, 0, (u.minY + u.maxY - b.minY - b.maxY) / 2);
  }
}

/** Einheiten gleichmäßig verteilen: die Mitten mit gleichen Abständen zwischen der ersten und der letzten */
export function distributeShapes(units: readonly Unit[], axis: 'x' | 'y'): void {
  if (units.length < 3) return;
  const mid = (unit: Unit): number => {
    const b = unionBounds(list(unit));
    return axis === 'x' ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
  };
  const sorted = [...units].sort((a, b) => mid(a) - mid(b));
  const first = mid(sorted[0]);
  const step = (mid(sorted[sorted.length - 1]) - first) / (sorted.length - 1);
  sorted.forEach((unit, i) => {
    const d = first + step * i - mid(unit);
    shift(unit, axis === 'x' ? d : 0, axis === 'y' ? d : 0);
  });
}
