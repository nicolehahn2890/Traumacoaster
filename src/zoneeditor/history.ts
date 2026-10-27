/**
 * Arbeitsverlauf des Zonen-Editors (Stufe 1): Rückgängig und Wiederholen über Schnappschüsse der Knoten. Eine Geste
 * (vom Aufsetzen bis zum Abheben) oder ein Befehl ist ein Schritt; was sich nicht geändert hat, wird kein Schritt.
 * Die Dokumente sind klein genug für ganze Kopien (der Plan nannte Immer-Patches; die lohnen sich erst bei großen
 * Zonen und gemeinsamem Bearbeiten).
 */
import { cloneNodes, serializeNodes, type ZoneNode } from '@/zone/nodes';

const LIMIT = 200;

const same = (a: readonly ZoneNode[], b: readonly ZoneNode[]): boolean => JSON.stringify(serializeNodes(a)) === JSON.stringify(serializeNodes(b));

export class History {
  private past: ZoneNode[][] = [];
  private future: ZoneNode[][] = [];
  private pending: ZoneNode[] | null = null;

  /** Zustand vor einer Änderung merken; ein zweites begin in derselben Geste ändert nichts */
  begin(nodes: readonly ZoneNode[]): void {
    if (!this.pending) this.pending = cloneNodes(nodes);
  }

  /** Zustand vom Beginn der laufenden Geste (für Gesten, die immer vom Anfang aus rechnen) */
  get start(): readonly ZoneNode[] | null {
    return this.pending;
  }

  /** Geste fertig: Schritt übernehmen, wenn sich etwas geändert hat; true, wenn ein Schritt entstand */
  commit(nodes: readonly ZoneNode[]): boolean {
    const before = this.pending;
    this.pending = null;
    if (!before || same(before, nodes)) return false;
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    return true;
  }

  /** Geste abbrechen: der Zustand vom Beginn (oder null, wenn keine lief) */
  cancel(): ZoneNode[] | null {
    const before = this.pending;
    this.pending = null;
    return before;
  }

  /** einen Schritt zurück: der frühere Zustand, oder null */
  undo(nodes: readonly ZoneNode[]): ZoneNode[] | null {
    this.pending = null;
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(cloneNodes(nodes));
    return prev;
  }

  /** einen Schritt vor: der spätere Zustand, oder null */
  redo(nodes: readonly ZoneNode[]): ZoneNode[] | null {
    this.pending = null;
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneNodes(nodes));
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** nach dem Neuladen der Datei von außen gilt der alte Verlauf nicht mehr */
  reset(): void {
    this.past = [];
    this.future = [];
    this.pending = null;
  }
}
