/**
 * Zug: Wagen (offene Wanne mit Rädern) und Fahrgäste. Wagen liegen in der Tiefenebene ihrer Spur.
 */
import { Container, Graphics } from 'pixi.js';
import { MGraphics } from './mgraphics';
import type { CarState } from '@/physics/trainSim';
import type { PassengerView } from '@/physics/passengers';
import { CAR } from '@/physics/passengers';
import type { CharacterDef } from '@/editor/characters';
import { laneScale, toStage, LANE_MIN, LANE_MAX } from '@/track/stage';
import { CharacterSprite } from './characterSprite';
import { hexNum, shade } from './paint';
import { SKIN_STYLES } from './trackRenderer';

interface CarView {
  container: Container;
  back: Graphics;
  front: Graphics;
  riders: CharacterSprite[];
  lane: number;
}

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
      const back = new MGraphics();
      const front = new MGraphics();
      this.drawTub(back, front, c, carCount);
      container.addChild(back);
      const sprites: CharacterSprite[] = [];
      for (let i = 0; i < perCar; i++) {
        const def = riders[r++ % Math.max(1, riders.length)];
        const sp = new CharacterSprite(def);
        container.addChild(sp.container);
        sprites.push(sp);
      }
      container.addChild(front);
      const view: CarView = { container, back, front, riders: sprites, lane: 0 };
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

  private drawTub(back: Graphics, front: Graphics, index: number, total: number): void {
    const style = SKIN_STYLES[this.skin] ?? SKIN_STYLES.skinWood;
    const body = index === 0 ? '#ff5c8a' : ['#ffd23f', '#3ec7c2', '#9b6dff', '#7ee081', '#ff8a5c'][index % 5];
    const dark = shade(body, -0.35);
    const ink = 0x2a1f3d;
    const hl = CAR.halfLength;
    const y0 = CAR.railOffset;
    // Rückwand und Innenraum (hinter den Fahrgästen)
    back.roundRect(-hl - 0.08, y0, hl * 2 + 0.16, CAR.rearWallH + 0.05, 0.25).fill(hexNum(dark)).stroke({ width: 0.04, color: ink });
    back.roundRect(-hl, y0 + 0.05, hl * 2, CAR.rearWallH - 0.05, 0.2).fill(hexNum(shade(body, -0.55)));
    // Sitzlehnen
    back.rect(-hl + 0.02, y0, 0.12, CAR.rearWallH).fill(hexNum(dark));
    back.rect(-0.06, y0, 0.12, CAR.dividerH).fill(hexNum(dark));
    // Vorderwand (Bordwand) vor den Fahrgästen
    front.roundRect(-hl - 0.08, y0, hl * 2 + 0.16, CAR.frontWallH, 0.22).fill(hexNum(body)).stroke({ width: 0.04, color: ink });
    front.roundRect(-hl + 0.1, y0 + 0.12, hl * 2 - 0.2, CAR.frontWallH - 0.3, 0.12).fill(hexNum(shade(body, 0.18)));
    // Front-Nase beim ersten Wagen
    if (index === 0) {
      front.moveTo(hl + 0.08, y0).lineTo(hl + 0.45, y0 + 0.1).lineTo(hl + 0.08, y0 + CAR.frontWallH).closePath().fill(hexNum(body)).stroke({ width: 0.04, color: ink });
      front.circle(hl + 0.2, y0 + 0.3, 0.09).fill(0xffd23f);
    }
    // Räder und Fahrwerk
    for (const wx of [-0.8, 0.8]) {
      front.circle(wx, 0.12, 0.2).fill(0x2a1f3d);
      front.circle(wx, 0.12, 0.11).fill(hexNum(style.railLight));
      front.rect(wx - 0.12, 0.08, 0.24, y0 - 0.08).fill(0x3a3350);
    }
    // Kupplung
    if (index < total - 1) front.rect(-hl - 0.5, y0 + 0.15, 0.5, 0.08).fill(0x3a3350);
    // Glanz
    front.roundRect(-hl + 0.2, y0 + CAR.frontWallH - 0.16, hl * 1.2, 0.06, 0.03).fill({ color: 0xffffff, alpha: 0.5 });
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
      const p = toStage(st.x, st.y, st.z);
      const k = laneScale(st.z);
      view.container.position.set(p.X, p.Y);
      view.container.rotation = st.angle;
      // Roll als Stauchung (pseudo-3D) und Querneigung
      const rollScale = Math.max(0.35, Math.abs(Math.cos(st.roll)));
      view.container.scale.set(k, k * (st.roll !== 0 ? rollScale : 1));
      view.container.visible = !st.inTunnel || true; // im Tunnel verdeckt der Berg den Wagen
      // Fahrgäste
      const seated = passengers.filter((pv) => pv.car === c);
      seated.forEach((pv, i) => {
        const sp = view.riders[i];
        if (!sp) return;
        if (pv.ejected) {
          sp.container.visible = false;
          this.ensureFlying(pv, sp);
          return;
        }
        sp.container.visible = true;
        sp.setPose(pv.parts, CAR.railOffset);
        sp.container.skew.x = -pv.lean * 0.5;
        sp.update(dt, st.feltFwd, st.feltUp, st.gSeat);
      });
    }
    // fliegende Fahrgäste in Weltkoordinaten
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
      f.sprite.container.scale.set(k);
      const base = toStage(0, 0, pv.lane);
      f.sprite.container.position.set(base.X, base.Y);
      f.sprite.setPose(pv.parts, 0);
      f.sprite.update(dt, 0, 9.81, pv.landed ? 1 : -0.5);
    }
  }

  private ensureFlying(pv: PassengerView, source: CharacterSprite): void {
    if (this.flying.has(pv.index)) return;
    // neue Sprite-Instanz mit derselben Figur
    const sprite = new CharacterSprite((source as unknown as { def: CharacterDef }).def);
    const lane = Math.round(pv.lane);
    this.layers.get(lane)?.addChild(sprite.container);
    this.flying.set(pv.index, { sprite, lane });
  }
}
