/**
 * Cut-out-Animator nach Terrance & Phillip: flache Teile, die sich nur verschieben und drehen, bewusst ruckelig
 * auf 12 Schritten pro Sekunde (keine Zwischenwerte). Clips sind Keyframe-Listen; ein Wert gilt, bis der nächste
 * Key ihn ändert. Einmal-Clips (scared, hop, wave …) kehren danach zum laufenden Loop zurück.
 */
import type { EyeKind, MouthKind } from './characterSprite';

export interface AnimTarget {
  setHeadFlap(rad: number): void;
  setEyes(kind: EyeKind): void;
  setMouth(kind: MouthKind | null): void;
  setArm(side: 'L' | 'R', angle: number): void;
  setHop(dy: number): void;
  setTilt(rad: number): void;
}

export interface Key {
  /** Frame (0 = Clip-Start) */
  f: number;
  flap?: number;
  eyes?: EyeKind;
  mouth?: MouthKind | null;
  armL?: number;
  armR?: number;
  hop?: number;
  tilt?: number;
}

export interface Clip {
  frames: number;
  loop: boolean;
  keys: Key[];
}

export type ClipName = 'idle' | 'talk' | 'wave' | 'hop' | 'scared' | 'scream' | 'dizzy' | 'faint';

/** 12 Schritte pro Sekunde */
export const STEP = 1 / 12;
const deg = (d: number) => (d * Math.PI) / 180;

export const CLIPS: Record<ClipName, Clip> = {
  // Atmen (±0,01 Neigung), Kopf klappt 0–5°, Blinzeln als 2-Frame-Strich
  idle: { frames: 48, loop: true, keys: [
    { f: 0, flap: 0, eyes: 'normal', mouth: null, armL: 0, armR: 0, hop: 0, tilt: 0.01 },
    { f: 12, tilt: -0.01, flap: deg(5) },
    { f: 24, tilt: 0.01, flap: 0 },
    { f: 30, eyes: 'line' },
    { f: 32, eyes: 'normal' },
    { f: 36, tilt: -0.01, flap: deg(3) },
  ] },
  // Reden: Oberkopf klappt 10°/28° alle 2 Frames
  talk: { frames: 16, loop: true, keys: [
    { f: 0, flap: deg(10), mouth: 'open', eyes: 'normal', tilt: 0, hop: 0, armL: 0, armR: 0 },
    { f: 2, flap: deg(28) }, { f: 4, flap: deg(10) }, { f: 6, flap: deg(28) }, { f: 8, flap: deg(12) },
    { f: 10, flap: deg(26) }, { f: 12, flap: deg(8) }, { f: 14, flap: deg(24) },
  ] },
  // Winken: starrer Arm schwingt ±0,35 alle 3 Frames
  wave: { frames: 18, loop: false, keys: [
    { f: 0, armR: 2.6, mouth: 'grin', flap: deg(8), eyes: 'normal' },
    { f: 3, armR: 2.95 }, { f: 6, armR: 2.25 }, { f: 9, armR: 2.95 }, { f: 12, armR: 2.25 }, { f: 15, armR: 2.6 },
  ] },
  // Hüpfer: 2 Frames hoch
  hop: { frames: 4, loop: false, keys: [{ f: 0, hop: 0.08 }, { f: 2, hop: 0 }] },
  // Erschrecken: Kopf klappt weit auf, Augen groß, Arme hoch, 6 Frames
  scared: { frames: 6, loop: false, keys: [
    { f: 0, flap: deg(35), eyes: 'big', mouth: 'open', armL: -2.4, armR: 2.4, hop: 0.05 },
    { f: 2, hop: 0 },
  ] },
  scream: { frames: 10, loop: false, keys: [
    { f: 0, flap: deg(35), eyes: 'big', mouth: 'open', armL: -2.6, armR: 2.6, tilt: -0.05 },
    { f: 2, tilt: 0.05 }, { f: 4, tilt: -0.05 }, { f: 6, tilt: 0.05 }, { f: 8, tilt: 0 },
  ] },
  // Benommen: Kopf pendelt, Augen Striche
  dizzy: { frames: 12, loop: true, keys: [
    { f: 0, tilt: 0.12, flap: deg(6), eyes: 'line', mouth: 'closed', armL: 0, armR: 0, hop: 0 },
    { f: 3, tilt: -0.12 }, { f: 6, tilt: 0.12 }, { f: 9, tilt: -0.12 },
  ] },
  faint: { frames: 1, loop: true, keys: [{ f: 0, tilt: 0.25, flap: 0, eyes: 'line', mouth: 'open', armL: 0.4, armR: -0.4, hop: 0 }] },
};

export class CutoutAnimator {
  current: ClipName = 'idle';
  frame = 0;
  private acc = 0;
  private loopClip: ClipName = 'idle';
  private readonly state: Required<Omit<Key, 'f'>> = { flap: 0, eyes: 'normal', mouth: null, armL: 0, armR: 0, hop: 0, tilt: 0 };

  constructor(private readonly target: AnimTarget, start: ClipName = 'idle') {
    this.play(start);
  }

  /** Clip starten; once: danach zurück zum laufenden Loop (Standard: Clip ist Loop → wird der neue Loop) */
  play(name: ClipName, opts: { once?: boolean } = {}): void {
    const clip = CLIPS[name];
    const once = opts.once ?? !clip.loop;
    if (!once) this.loopClip = name;
    this.current = name;
    this.frame = 0;
    this.acc = 0;
    this.applyFrame(0);
  }

  /** Schrittweise (12 Hz): keine Zwischenwerte zwischen zwei Frames */
  update(dt: number): void {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.frame++;
      const clip = CLIPS[this.current];
      if (this.frame >= clip.frames) {
        if (clip.loop) this.frame = 0;
        else {
          this.current = this.loopClip;
          this.frame = 0;
        }
      }
      this.applyFrame(this.frame);
    }
  }

  /** Zahl der angewandten Frames seit play(): für Tests */
  applied = 0;

  private applyFrame(frame: number): void {
    const clip = CLIPS[this.current];
    for (const k of clip.keys) {
      if (k.f !== frame) continue;
      if (k.flap !== undefined) this.state.flap = k.flap;
      if (k.eyes !== undefined) this.state.eyes = k.eyes;
      if (k.mouth !== undefined) this.state.mouth = k.mouth;
      if (k.armL !== undefined) this.state.armL = k.armL;
      if (k.armR !== undefined) this.state.armR = k.armR;
      if (k.hop !== undefined) this.state.hop = k.hop;
      if (k.tilt !== undefined) this.state.tilt = k.tilt;
    }
    const t = this.target;
    t.setHeadFlap(this.state.flap);
    t.setEyes(this.state.eyes);
    t.setMouth(this.state.mouth);
    t.setArm('L', this.state.armL);
    t.setArm('R', this.state.armR);
    t.setHop(this.state.hop);
    t.setTilt(this.state.tilt);
    this.applied++;
  }
}
