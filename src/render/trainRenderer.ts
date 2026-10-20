/**
 * Zug in 3D: Jeder Wagen ist eine offene Wanne (Quader), deren Ecken aus dem Wagen-Rahmen
 * (vorwärts, oben mit Schräglage, seitlich) auf die Bühne projiziert werden. Die Flächen werden
 * nach Sichtbarkeit sortiert (Maler-Algorithmus). Fahrgäste sitzen als Billboards im Wagen-System.
 */
import { Container, Graphics, Matrix } from 'pixi.js';
import type { CarState } from '@/physics/trainSim';
import type { PassengerView } from '@/physics/passengers';
import { CAR } from '@/physics/passengers';
import type { CharacterDef } from '@/editor/characters';
import { laneScale, toStage, LANE_MIN, LANE_MAX, LANE_DEPTH } from '@/track/stage';
import { CharacterSprite } from './characterSprite';
import { hexNum, shade } from './paint';
import { SKIN_STYLES } from './trackRenderer';

interface CarView {
  container: Container;
  back: Graphics;
  front: Graphics;
  riders: CharacterSprite[];
  riderDefs: CharacterDef[];
  lane: number;
  body: string;
}

/** Blickrichtung des Betrachters (leicht von oben, in die Bühne hinein) */
const VIEW = { x: 0, y: -0.45, z: 0.9 };

export class TrainRenderer {
  readonly layers = new Map<number, Container>();
  private cars: CarView[] = [];
  private flying = new Map<number, { sprite: CharacterSprite; lane: number }>();
  private skin: string;

  constructor(skin: string) {
    this.skin = skin;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) this.layers.set(z, new Container());
  }

  build(carCount: number, riders: CharacterDef[], perCar: number): void {
    this.clear();
    let r = 0;
    for (let c = 0; c < carCount; c++) {
      const container = new Container();
      const back = new Graphics();
      const front = new Graphics();
      container.addChild(back);
      const sprites: CharacterSprite[] = [];
      const defs: CharacterDef[] = [];
      for (let i = 0; i < perCar; i++) {
        const def = riders[r++ % Math.max(1, riders.length)];
        const sp = new CharacterSprite(def);
        container.addChild(sp.container);
        sprites.push(sp);
        defs.push(def);
      }
      container.addChild(front);
      const body = c === 0 ? '#ff5c8a' : ['#ffd23f', '#3ec7c2', '#9b6dff', '#7ee081', '#ff8a5c'][c % 5];
      const view: CarView = { container, back, front, riders: sprites, riderDefs: defs, lane: 0, body };
      this.cars.push(view);
      this.layers.get(0)!.addChild(container);
    }
  }

  clear(): void {
    for (const c of this.cars) c.container.destroy({ children: true });
    this.cars = [];
    for (const f of this.flying.values()) f.sprite.container.destroy({ children: true });
    this.flying.clear();
  }

  /** Wagenquader zeichnen: Ecken = P + a·T + b·U + c·S, projiziert */
  private drawCar(view: CarView, st: CarState, index: number, total: number): void {
    const style = SKIN_STYLES[this.skin] ?? SKIN_STYLES.skinWood;
    const P = { x: st.x, y: st.y, z: st.z * LANE_DEPTH };
    const T = { x: st.tx, y: st.ty, z: st.tz };
    const U = { x: st.upx, y: st.upy, z: st.upz };
    const S = { x: st.sx, y: st.sy, z: st.sz };
    const proj = (a: number, b: number, c: number) => {
      const x = P.x + a * T.x + b * U.x + c * S.x;
      const y = P.y + a * T.y + b * U.y + c * S.y;
      const z = P.z + a * T.z + b * U.z + c * S.z;
      return toStage(x, y, z / LANE_DEPTH);
    };
    const hl = CAR.halfLength;
    const hw = 0.6;
    const y0 = CAR.railOffset;
    const y1 = y0 + CAR.frontWallH;
    const yBack = y0 + CAR.rearWallH;
    const body = view.body;
    const ink = 0x2a1f3d;
    const back = view.back;
    const front = view.front;
    back.clear();
    front.clear();
    // Sichtbarkeit der Flächen: Normale · Blickrichtung < 0 → zum Betrachter
    const vis = (n: { x: number; y: number; z: number }) => n.x * VIEW.x + n.y * VIEW.y + n.z * VIEW.z < 0;
    const face = (g: Graphics, pts: Array<[number, number, number]>, color: number, alpha = 1) => {
      const flat: number[] = [];
      for (const [a, b, c] of pts) {
        const p = proj(a, b, c);
        flat.push(p.X, p.Y);
      }
      g.poly(flat).fill({ color, alpha }).stroke({ width: 0.05, color: ink, alpha: 0.9, join: 'round' });
    };
    const neg = (v: { x: number; y: number; z: number }) => ({ x: -v.x, y: -v.y, z: -v.z });
    // Räder (hinten, dunkel)
    for (const a of [-0.8, 0.8]) {
      for (const c of [-hw * 0.8, hw * 0.8]) {
        const p = proj(a, 0.12, c);
        back.circle(p.X, p.Y, 0.2 * laneScale(st.z)).fill(ink);
        back.circle(p.X, p.Y, 0.1 * laneScale(st.z)).fill(hexNum(style.railLight));
      }
    }
    // Boden
    face(back, [[-hl, y0, -hw], [hl, y0, -hw], [hl, y0, hw], [-hl, y0, hw]], hexNum(shade(body, -0.55)));
    // Rückwände/Seitenwände, die vom Betrachter weg zeigen, kommen hinter die Fahrgäste
    const sides: Array<{ n: { x: number; y: number; z: number }; pts: Array<[number, number, number]>; color: number }> = [
      { n: neg(T), pts: [[-hl, y0, -hw], [-hl, yBack, -hw], [-hl, yBack, hw], [-hl, y0, hw]], color: hexNum(shade(body, -0.25)) }, // Heck
      { n: T, pts: [[hl, y0, -hw], [hl, y1, -hw], [hl, y1, hw], [hl, y0, hw]], color: hexNum(shade(body, -0.15)) }, // Front
      { n: S, pts: [[-hl, y0, hw], [-hl, y1 + 0.05, hw], [hl, y1, hw], [hl, y0, hw]], color: hexNum(body) }, // Seite +S
      { n: neg(S), pts: [[-hl, y0, -hw], [-hl, y1 + 0.05, -hw], [hl, y1, -hw], [hl, y0, -hw]], color: hexNum(shade(body, 0.08)) }, // Seite −S
    ];
    // Trennwand (Lehne Reihe 2) im Innenraum
    const divider: Array<[number, number, number]> = [[0, y0, -hw], [0, y0 + CAR.dividerH, -hw], [0, y0 + CAR.dividerH, hw], [0, y0, hw]];
    const innerSeat = hexNum(shade(body, -0.45));
    face(back, divider, innerSeat);
    for (const sd of sides) {
      const g = vis(sd.n) ? front : back;
      face(g, sd.pts, sd.color);
    }
    // Nase am ersten Wagen und Glanz auf der sichtbaren Seite
    if (index === 0) {
      const nosePts: Array<[number, number, number]> = [[hl, y0, -hw * 0.8], [hl + 0.4, y0 + 0.15, 0], [hl, y0, hw * 0.8]];
      face(front, nosePts, hexNum(body));
      const lamp = proj(hl + 0.25, y0 + 0.28, 0);
      front.circle(lamp.X, lamp.Y, 0.1 * laneScale(st.z)).fill(0xffd23f);
    }
    const sideVisible = vis(S) ? S : neg(S);
    const c = sideVisible === S ? hw : -hw;
    const g1 = proj(-hl + 0.2, y1 - 0.12, c);
    const g2 = proj(hl - 0.3, y1 - 0.12, c);
    front.moveTo(g1.X, g1.Y).lineTo(g2.X, g2.Y).stroke({ width: 0.06 * laneScale(st.z), color: 0xffffff, alpha: 0.5, cap: 'round' });
    if (index < total - 1) {
      const k1 = proj(-hl, y0 + 0.2, 0);
      const k2 = proj(-hl - 0.5, y0 + 0.2, 0);
      back.moveTo(k1.X, k1.Y).lineTo(k2.X, k2.Y).stroke({ width: 0.08 * laneScale(st.z), color: 0x3a3350 });
    }
  }

  update(cars: CarState[], passengers: PassengerView[], dt: number): void {
    for (let c = 0; c < this.cars.length; c++) {
      const view = this.cars[c];
      const st = cars[c];
      if (!st) continue;
      const lane = Math.round(st.z);
      if (lane !== view.lane) {
        view.lane = lane;
        this.layers.get(lane)?.addChild(view.container);
      }
      this.drawCar(view, st, c, this.cars.length);
      // Fahrgäste: lokale (vorwärts, oben) → Bühne über den projizierten Rahmen
      const base = toStage(st.x, st.y, st.z);
      const fx = toStage(st.x + st.tx, st.y + st.ty, st.z + st.tz / LANE_DEPTH);
      const fy = toStage(st.x + st.upx, st.y + st.upy, st.z + st.upz / LANE_DEPTH);
      const ex = { x: fx.X - base.X, y: fx.Y - base.Y };
      const ey = { x: fy.X - base.X, y: fy.Y - base.Y };
      const seated = passengers.filter((pv) => pv.car === c);
      seated.forEach((pv, i) => {
        const sp = view.riders[i];
        if (!sp) return;
        if (pv.ejected) {
          sp.container.visible = false;
          this.ensureFlying(pv, view.riderDefs[i]);
          return;
        }
        sp.container.visible = true;
        // Sitzreihe leicht zur sichtbaren Seite versetzen, damit Fahrgäste vor der Rückwand sitzen
        const sideShift = 0.15 * (st.sz > 0 ? -1 : 1);
        const seatBase = toStage(st.x + st.sx * sideShift, st.y + st.sy * sideShift, st.z + (st.sz * sideShift) / LANE_DEPTH);
        sp.container.setFromMatrix(new Matrix(ex.x, ex.y, ey.x, ey.y, seatBase.X, seatBase.Y));
        sp.setPose(pv.parts, CAR.railOffset);
        sp.update(dt, st.feltFwd, st.feltUp, st.gSeat);
      });
    }
    for (const pv of passengers) {
      if (!pv.ejected) continue;
      const f = this.flying.get(pv.index);
      if (!f) continue;
      const lane = Math.round(pv.lane);
      if (lane !== f.lane) {
        f.lane = lane;
        this.layers.get(lane)?.addChild(f.sprite.container);
      }
      const k = laneScale(pv.lane);
      const base = toStage(0, 0, pv.lane);
      f.sprite.container.setFromMatrix(new Matrix(k, 0, 0, k, base.X, base.Y));
      f.sprite.setPose(pv.parts, 0);
      f.sprite.update(dt, 0, 9.81, pv.landed ? 1 : -0.5);
    }
  }

  private ensureFlying(pv: PassengerView, def: CharacterDef): void {
    if (this.flying.has(pv.index)) return;
    const sprite = new CharacterSprite(def);
    const lane = Math.round(pv.lane);
    this.layers.get(lane)?.addChild(sprite.container);
    this.flying.set(pv.index, { sprite, lane });
  }
}
