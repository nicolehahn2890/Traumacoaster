/**
 * Maßband beim Zeichnen und Bearbeiten: höchster Punkt mit gestrichelter Lotlinie und Höhe, Gesamtlänge an der
 * Station, Marken an Looping-Scheiteln (◎) und Kehren (↻). Zahlen laufen weich nach (approach). Liegt in der
 * UI-Ebene (Bildschirm-Pixel) und wird je Frame aus Bühnenpunkten über die Kamera neu gesetzt.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { StagePoint } from '@/track/stage';
import { toStage } from '@/track/stage';
import type { TrackPath, TrackSamples, TrackStats } from '@/track/model';
import { INK, PAPER, label } from '@/ui/widgets';
import { hexNum } from './paint';

/** Weiches Nachlaufen: shown nähert sich target mit Rate pro Sekunde (exponentiell), unabhängig von der Framerate */
export function approach(shown: number, target: number, dt: number, rate = 10): number {
  return target + (shown - target) * Math.exp(-rate * Math.max(0, dt));
}

interface MeasureData {
  apex: StagePoint;
  apexGround: StagePoint;
  height: number;
  station: StagePoint;
  length: number;
  marks: Array<{ at: StagePoint; text: string }>;
}

export class MeasureOverlay {
  readonly container = new Container();
  private g = new Graphics();
  private heightLabel: Text;
  private lengthLabel: Text;
  private markLabels: Text[] = [];
  private data: MeasureData | null = null;
  private shownHeight = 0;
  private shownLength = 0;
  private holdFor = 0;
  private pinned = false;

  constructor() {
    this.heightLabel = label('', 15, '#ffffff', true, { stroke: { color: INK, width: 4 } });
    this.heightLabel.anchor.set(0, 0.5);
    this.lengthLabel = label('', 13, PAPER, false, { stroke: { color: INK, width: 4 } });
    this.lengthLabel.anchor.set(0.5, 0);
    this.container.addChild(this.g, this.heightLabel, this.lengthLabel);
    this.container.visible = false;
    this.container.eventMode = 'none';
  }

  /** Im Sandkasten dauerhaft sichtbar (ersetzt die Statuszeile) */
  pin(on: boolean): void {
    this.pinned = on;
    if (on && this.data) this.container.visible = true;
  }

  /** Neue Messwerte zeigen und (ohne pin) `hold` Sekunden nach der letzten Änderung ausblenden */
  show(path: TrackPath, samples: TrackSamples, stats: TrackStats, ground: (x: number, z: number) => number, hold = 1.2): void {
    if (samples.count < 2) {
      this.data = null;
      this.container.visible = false;
      return;
    }
    let top = 0;
    for (let i = 1; i < samples.count; i++) if (!samples.auto[i] && samples.y[i] > samples.y[top]) top = i;
    const apex = toStage(samples.x[top], samples.y[top], samples.z[top]);
    const apexGround = toStage(samples.x[top], ground(samples.x[top], samples.z[top]), samples.z[top]);
    const marks: MeasureData['marks'] = [];
    let loops = 0;
    let turns = 0;
    for (const n of path.nodes) {
      if (n.kind === 'loopApex') marks.push({ at: toStage(n.x, n.y, n.z), text: `◎${++loops}` });
      else if (n.kind === 'turn') marks.push({ at: toStage(n.x, n.y, n.z), text: `↻${++turns}` });
    }
    const first = !this.data;
    this.data = { apex, apexGround, height: samples.y[top] - ground(samples.x[top], samples.z[top]), station: toStage(samples.x[0], samples.y[0], samples.z[0]), length: stats.length, marks };
    if (first) {
      this.shownHeight = this.data.height;
      this.shownLength = this.data.length;
    }
    this.holdFor = hold;
    this.container.visible = true;
  }

  /** Nichts mehr zu messen (Bahn gelöscht) */
  clear(): void {
    this.data = null;
    this.container.visible = false;
  }

  update(dt: number, toScreen: (X: number, Y: number) => { x: number; y: number }): void {
    if (!this.data || !this.container.visible) return;
    if (!this.pinned) {
      this.holdFor -= dt;
      if (this.holdFor <= 0) {
        this.container.visible = false;
        return;
      }
      this.container.alpha = Math.min(1, this.holdFor / 0.3);
    } else this.container.alpha = 1;
    const d = this.data;
    this.shownHeight = approach(this.shownHeight, d.height, dt);
    this.shownLength = approach(this.shownLength, d.length, dt);
    const g = this.g;
    g.clear();
    // Lotlinie vom höchsten Punkt zum Boden, gestrichelt
    const a = toScreen(d.apex.X, d.apex.Y);
    const b = toScreen(d.apexGround.X, d.apexGround.Y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 6) {
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      for (let s = 0; s < len; s += 14) {
        const e = Math.min(len, s + 8);
        g.moveTo(a.x + ux * s, a.y + uy * s).lineTo(a.x + ux * e, a.y + uy * e).stroke({ width: 2, color: hexNum(INK), alpha: 0.55 });
      }
      g.moveTo(a.x - 7, a.y).lineTo(a.x + 7, a.y).stroke({ width: 3, color: 0xffd23f, cap: 'round' });
      g.moveTo(b.x - 7, b.y).lineTo(b.x + 7, b.y).stroke({ width: 2, color: hexNum(INK), alpha: 0.55, cap: 'round' });
    }
    this.heightLabel.text = `↑ ${this.shownHeight.toFixed(this.shownHeight < 10 ? 1 : 0)} m`;
    this.heightLabel.position.set(a.x + 10, a.y - 2);
    const st = toScreen(d.station.X, d.station.Y);
    this.lengthLabel.text = `${Math.round(this.shownLength)} m`;
    this.lengthLabel.position.set(st.x, st.y + 14);
    // Marken
    while (this.markLabels.length < d.marks.length) {
      const m = label('', 14, '#ffffff', true, { stroke: { color: INK, width: 4 } });
      m.anchor.set(0.5, 1);
      this.markLabels.push(m);
      this.container.addChild(m);
    }
    this.markLabels.forEach((m, i) => {
      const mk = d.marks[i];
      m.visible = !!mk;
      if (!mk) return;
      const p = toScreen(mk.at.X, mk.at.Y);
      m.text = mk.text;
      m.position.set(p.x, p.y - 14);
    });
  }
}
