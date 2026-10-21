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
import { CutoutAnimator, type ClipName } from './cutoutAnimator';
import { hexNum, shade } from './paint';
import { SKIN_STYLES } from './trackRenderer';

interface CarView {
  container: Container;
  back: Graphics;
  front: Graphics;
  lane: number;
  body: string;
}

/** Blickrichtung des Betrachters (leicht von oben, in die Bühne hinein) */
const VIEW = { x: 0, y: -0.45, z: 0.9 };

export class TrainRenderer {
  readonly layers = new Map<number, Container>();
  private cars: CarView[] = [];
  /** Sitzende Fahrgäste je Fahrgast-Index (ein Fahrgast kann nach dem Fangen in einem anderen Wagen sitzen) */
  private seated = new Map<number, { sprite: CharacterSprite; car: number }>();
  private flying = new Map<number, { sprite: CharacterSprite; lane: number }>();
  private riderDefs: CharacterDef[] = [];
  private skin: string;
  /** Stehender Zug (Zeichenmodus, Übersicht): Cut-out-Animatoren je Fahrgast */
  private animators = new Map<number, CutoutAnimator>();
  private standing = false;

  constructor(skin: string) {
    this.skin = skin;
    for (let z = LANE_MAX; z >= LANE_MIN; z--) this.layers.set(z, new Container());
  }

  /** Bahntyp wechseln (Farben der Wagen beim nächsten Zeichnen) */
  setSkin(skin: string): void {
    this.skin = skin;
  }

  build(carCount: number, riders: CharacterDef[], perCar: number): void {
    this.clear();
    this.riderDefs = riders.length ? riders : [];
    void perCar;
    for (let c = 0; c < carCount; c++) {
      const container = new Container();
      const back = new Graphics();
      const front = new Graphics();
      container.addChild(back, front);
      const body = c === 0 ? '#ff5c8a' : ['#ffd23f', '#3ec7c2', '#9b6dff', '#7ee081', '#ff8a5c'][c % 5];
      const view: CarView = { container, back, front, lane: 0, body };
      this.cars.push(view);
      this.layers.get(0)!.addChild(container);
    }
  }

  clear(): void {
    for (const c of this.cars) c.container.destroy({ children: true });
    this.cars = [];
    this.seated.clear();
    this.animators.clear();
    for (const f of this.flying.values()) f.sprite.container.destroy({ children: true });
    this.flying.clear();
  }

  /** Stehender Zug: Fahrgäste reden, blinzeln, hüpfen (Cut-out-Clips auf Zweiern); aus während der Fahrt */
  setStanding(on: boolean): void {
    this.standing = on;
    if (!on) {
      this.animators.clear();
      for (const e of this.seated.values()) {
        e.sprite.setHeadFlap(0);
        e.sprite.setEyes('normal');
        e.sprite.setMouth(null);
        e.sprite.setHop(0);
      }
    }
  }

  /** Animatoren des stehenden Zugs fortschreiben (nach update(), damit die Pose schon gesetzt ist) */
  idleUpdate(dt: number): void {
    if (!this.standing) return;
    for (const [index, e] of this.seated) {
      let a = this.animators.get(index);
      if (!a) {
        a = new CutoutAnimator(e.sprite, Math.random() < 0.35 ? 'talk' : 'idle');
        // zeitlich versetzt, damit nicht alle im Gleichschritt klappen
        a.update(Math.random() * 2);
        this.animators.set(index, a);
      }
      a.update(dt);
      // ab und zu wechseln: Reden ↔ Idle, kleiner Hüpfer
      if (Math.random() < dt * 0.15) a.play(a.current === 'talk' ? 'idle' : 'talk');
      else if (Math.random() < dt * 0.08) a.play('hop', { once: true });
    }
  }

  /** Clip auf einem Fahrgast (z. B. Erschrecken nach Tipp) oder auf allen (Winken beim Start) */
  playOn(index: number, clip: ClipName): void {
    const a = this.animators.get(index);
    if (a) a.play(clip, { once: true });
  }
  playAll(clip: ClipName): void {
    for (const a of this.animators.values()) a.play(clip, { once: true });
  }

  /** Fahrgast unter einem Bühnenpunkt (Sitzende des stehenden Zugs), −1 wenn keiner */
  hitPassenger(X: number, Y: number): number {
    let best = -1;
    let bestD = Infinity;
    for (const [index, e] of this.seated) {
      if (!e.sprite.container.visible) continue;
      const view = this.cars[e.car];
      const k = view ? laneScale(view.lane) : 1;
      const p = e.sprite.container.position;
      const d = Math.hypot(X - p.x, Y - (p.y + 0.7 * k));
      if (d < 1.1 * k && d < bestD) {
        bestD = d;
        best = index;
      }
    }
    return best;
  }

  private defFor(index: number): CharacterDef | null {
    if (!this.riderDefs.length) return null;
    return this.riderDefs[index % this.riderDefs.length];
  }

  /** Sitz-Sprite eines Fahrgasts holen (bei Bedarf anlegen) und in den Wagen hängen, in dem er gerade sitzt */
  private ensureSeated(pv: PassengerView): CharacterSprite | null {
    const view = this.cars[pv.car];
    if (!view) return null;
    let entry = this.seated.get(pv.index);
    if (!entry) {
      const def = this.defFor(pv.index);
      if (!def) return null;
      entry = { sprite: new CharacterSprite(def), car: -1 };
      this.seated.set(pv.index, entry);
    }
    if (entry.car !== pv.car) {
      entry.car = pv.car;
      // zwischen Rückwand (back) und Vorderwand (front)
      view.container.addChildAt(entry.sprite.container, view.container.getChildIndex(view.front));
    }
    return entry.sprite;
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
      for (const pv of passengers) {
        if (pv.car !== c || pv.ejected) continue;
        const sp = this.ensureSeated(pv);
        if (!sp) continue;
        sp.container.visible = true;
        // Sitzreihe leicht zur sichtbaren Seite versetzen, damit Fahrgäste vor der Rückwand sitzen
        const sideShift = 0.15 * (st.sz > 0 ? -1 : 1);
        const seatBase = toStage(st.x + st.sx * sideShift, st.y + st.sy * sideShift, st.z + (st.sz * sideShift) / LANE_DEPTH);
        sp.container.setFromMatrix(new Matrix(ex.x, ex.y, ey.x, ey.y, seatBase.X, seatBase.Y));
        sp.setPose(pv.parts, CAR.railOffset);
        sp.setBelt(pv.belt, pv.beltBroken);
        sp.setFace(pv.face);
        sp.update(dt, st.feltFwd, st.feltUp, st.gSeat);
        // wieder eingefangen: der Flug-Sprite verschwindet
        const f = this.flying.get(pv.index);
        if (f) {
          f.sprite.container.destroy({ children: true });
          this.flying.delete(pv.index);
        }
      }
    }
    for (const pv of passengers) {
      if (!pv.ejected) continue;
      const seatedEntry = this.seated.get(pv.index);
      if (seatedEntry) seatedEntry.sprite.container.visible = false;
      this.ensureFlying(pv);
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
      f.sprite.setFace(pv.face);
      f.sprite.update(dt, 0, 9.81, pv.landed ? 1 : -0.5);
    }
  }

  private ensureFlying(pv: PassengerView): void {
    if (this.flying.has(pv.index)) return;
    const def = this.defFor(pv.index);
    if (!def) return;
    const sprite = new CharacterSprite(def);
    sprite.setBelt(pv.belt, true);
    const lane = Math.round(pv.lane);
    this.layers.get(lane)?.addChild(sprite.container);
    this.flying.set(pv.index, { sprite, lane });
  }
}
