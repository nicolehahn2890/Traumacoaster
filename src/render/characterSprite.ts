/**
 * Zeichnet eine Figur als Rig aus sechs Teilen (Meter, Y nach oben):
 * Oberkopf (an der Oberlippe geschnitten), Unterkopf+Rumpf, zwei Arme, zwei Beine.
 * Pupillen folgen den Kräften, Blinzeln, Mund öffnet sich bei starken g.
 */
import { Container, Graphics } from 'pixi.js';
import { MGraphics } from './mgraphics';
import type { CharacterDef } from '@/editor/characters';
import type { PartName, PartPose } from '@/physics/passengers';
import { RIG } from '@/physics/passengers';
import { hexNum, shade } from './paint';
import { clamp } from '@/core/math';

const INK = 0x2a1f3d;

export class CharacterSprite {
  readonly container = new Container();
  readonly parts: Record<PartName, Container>;
  private pupils: Graphics[] = [];
  private eyeLids: Graphics[] = [];
  private mouth = new MGraphics();
  private def: CharacterDef;
  private blinkT = 2 + Math.random() * 4;
  private blinkPhase = 0;
  private mouthOpen = 0;
  private eyeBase: Array<{ x: number; y: number; r: number }> = [];

  constructor(def: CharacterDef) {
    this.def = def;
    this.parts = {
      legL: new Container(), legR: new Container(), armL: new Container(), torso: new Container(), armR: new Container(), head: new Container(),
    };
    // Zeichenreihenfolge: hinterer Arm, Beine, Rumpf, Kopf, vorderer Arm
    this.container.addChild(this.parts.armL, this.parts.legL, this.parts.legR, this.parts.torso, this.parts.head, this.parts.armR);
    this.build();
  }

  setDef(def: CharacterDef): void {
    this.def = def;
    for (const p of Object.values(this.parts)) p.removeChildren();
    this.pupils = [];
    this.eyeLids = [];
    this.eyeBase = [];
    this.build();
  }

  private build(): void {
    const d = this.def;
    // --- Beine ---
    for (const name of ['legL', 'legR'] as const) {
      const g = new MGraphics();
      const hx = RIG.leg.hx;
      const hy = RIG.leg.hy;
      g.roundRect(-hx, -hy + 0.08, hx * 2, hy * 2 - 0.08, 0.04).fill(hexNum(d.pantsColor)).stroke({ width: 0.025, color: INK });
      if (d.pants === 'shorts') g.rect(-hx, -hy + 0.08, hx * 2, hy * 0.9).fill(hexNum(d.skin));
      // Schuh
      const sc = hexNum(d.shoeColor);
      if (d.shoes === 'rainbow') {
        g.roundRect(-hx - 0.03, -hy - 0.05, hx * 2 + 0.1, 0.14, 0.05).fill(0xffffff).stroke({ width: 0.02, color: INK });
        g.rect(-hx - 0.02, -hy - 0.04, 0.05, 0.1).fill(0xff5c8a);
        g.rect(hx - 0.03, -hy - 0.04, 0.05, 0.1).fill(0x3ec7c2);
        g.rect(-0.02, -hy - 0.04, 0.04, 0.1).fill(0xffd23f);
      } else if (d.shoes === 'bare') {
        g.ellipse(0, -hy - 0.01, hx + 0.02, 0.05).fill(hexNum(d.skin)).stroke({ width: 0.02, color: INK });
      } else {
        const tall = d.shoes === 'boot' || d.shoes === 'highTop';
        g.roundRect(-hx - 0.03, -hy - 0.05, hx * 2 + 0.1, tall ? 0.2 : 0.13, 0.05).fill(sc).stroke({ width: 0.02, color: INK });
        g.rect(-hx - 0.03, -hy - 0.05, hx * 2 + 0.1, 0.035).fill(0xffffff);
      }
      this.parts[name].addChild(g);
    }
    // --- Arme ---
    for (const name of ['armL', 'armR'] as const) {
      const g = new MGraphics();
      const hx = RIG.arm.hx;
      const hy = RIG.arm.hy;
      const sleeve = d.top === 'tank' || d.top === 'dress' ? 0.1 : d.top === 'tee' || d.top === 'jersey' ? 0.45 : 0.85;
      g.roundRect(-hx, -hy, hx * 2, hy * 2, 0.04).fill(hexNum(d.skin)).stroke({ width: 0.025, color: INK });
      g.roundRect(-hx - 0.01, hy - hy * 2 * sleeve, hx * 2 + 0.02, hy * 2 * sleeve, 0.03).fill(hexNum(d.topColor)).stroke({ width: 0.02, color: INK });
      g.circle(0, -hy + 0.02, hx + 0.025).fill(hexNum(d.skin)).stroke({ width: 0.02, color: INK });
      this.parts[name].addChild(g);
    }
    // --- Rumpf + Unterkopf ---
    {
      const g = new MGraphics();
      const hx = RIG.torso.hx;
      const hy = RIG.torso.hy;
      const faceTop = hy; // Schnittkante Oberlippe
      const neck = hy - 0.17;
      // Oberteil
      const topCol = hexNum(d.topColor);
      g.roundRect(-hx, -hy, hx * 2, neck + hy, 0.05).fill(topCol).stroke({ width: 0.025, color: INK });
      // Oberteil-Details
      if (d.top === 'hoodie') g.roundRect(-hx + 0.03, neck - 0.1, hx * 2 - 0.06, 0.1, 0.03).fill(hexNum(shade(d.topColor, -0.2)));
      if (d.top === 'jacket' || d.top === 'raincoat' || d.top === 'suit' || d.top === 'vest') {
        g.moveTo(-0.07, neck).lineTo(-0.1, -hy + 0.02).moveTo(0.07, neck).lineTo(0.1, -hy + 0.02).stroke({ width: 0.02, color: INK });
        g.rect(-0.07, -hy + 0.02, 0.14, neck + hy - 0.04).fill(hexNum(shade(d.topColor, -0.45)));
      }
      if (d.top === 'overall') { g.rect(-hx, -hy, hx * 2, 0.26).fill(0x4f8dff); g.rect(-0.1, -hy + 0.2, 0.06, 0.26).fill(0x4f8dff); g.rect(0.04, -hy + 0.2, 0.06, 0.26).fill(0x4f8dff); }
      if (d.top === 'jersey') { g.rect(-hx, neck - 0.08, hx * 2, 0.05).fill(0xffffff); g.rect(-hx, -hy + 0.08, hx * 2, 0.05).fill(0xffffff); }
      if (d.top === 'shirt') g.moveTo(-0.05, neck).lineTo(0, neck - 0.08).lineTo(0.05, neck).stroke({ width: 0.02, color: INK });
      // Logo
      this.drawLogo(g, d, 0, -0.02);
      // Hals + Unterkopf (Kinn, Mund)
      const face = hexNum(d.skin);
      g.rect(-0.1, neck - 0.02, 0.2, 0.06).fill(face);
      g.roundRect(-RIG.head.hx + 0.02, neck, RIG.head.hx * 2 - 0.04, faceTop - neck, 0.08).fill(face).stroke({ width: 0.025, color: INK });
      // Schnittkante (Oberlippe) leicht dunkler
      g.rect(-RIG.head.hx + 0.02, faceTop - 0.012, RIG.head.hx * 2 - 0.04, 0.012).fill({ color: INK, alpha: 0.35 });
      // Bart
      if (d.beard !== 'none') {
        const bc = hexNum(d.hairColor);
        if (d.beard === 'stubble') g.roundRect(-RIG.head.hx + 0.03, neck + 0.01, RIG.head.hx * 2 - 0.06, 0.1, 0.05).fill({ color: bc, alpha: 0.28 });
        if (d.beard === 'goatee' || d.beard === 'chin') g.roundRect(-0.06, neck, 0.12, 0.07, 0.03).fill(bc);
        if (d.beard === 'full') g.roundRect(-RIG.head.hx + 0.02, neck - 0.01, RIG.head.hx * 2 - 0.04, 0.12, 0.05).fill(bc);
        if (d.beard === 'mustache' || d.beard === 'full') g.roundRect(-0.09, faceTop - 0.05, 0.18, 0.035, 0.015).fill(bc);
      }
      this.parts.torso.addChild(g);
      // Mund (eigene Grafik, animiert)
      this.mouth.position.set(0, faceTop - 0.075);
      this.parts.torso.addChild(this.mouth);
      this.drawMouth(0);
    }
    // --- Oberkopf ---
    {
      const g = new MGraphics();
      const hx = RIG.head.hx;
      const hy = RIG.head.hy;
      const face = hexNum(d.skin);
      const shape = d.headShape;
      const wide = shape === 'wide' ? 1.12 : shape === 'tall' ? 0.92 : 1;
      const tall = shape === 'tall' ? 1.18 : shape === 'egg' ? 1.08 : 1;
      // Kopfform: unten gerade (Schnitt), oben rund
      g.moveTo(-hx * wide, -hy).lineTo(hx * wide, -hy).lineTo(hx * wide, hy * 0.3 * tall)
        .bezierCurveTo(hx * wide, hy * tall + 0.03, hx * 0.5, hy * tall + 0.03, 0, hy * tall + 0.03)
        .bezierCurveTo(-hx * 0.5, hy * tall + 0.03, -hx * wide, hy * tall + 0.03, -hx * wide, hy * 0.3 * tall).closePath()
        .fill(face).stroke({ width: 0.025, color: INK });
      if (shape === 'square') g.rect(-hx * wide, -hy, hx * 2 * wide, hy * 1.3).fill(face);
      // Wangen
      g.circle(-hx * 0.6, -hy * 0.55, 0.045).fill({ color: 0xff5c8a, alpha: 0.18 });
      g.circle(hx * 0.6, -hy * 0.55, 0.045).fill({ color: 0xff5c8a, alpha: 0.18 });
      // Nase
      g.moveTo(0.0, 0.02).lineTo(0.03, -0.07).lineTo(-0.01, -0.08).stroke({ width: 0.02, color: INK, alpha: 0.7, cap: 'round' });
      // Augen
      const eyeY = 0.0;
      const eyeR = d.eyes === 'small' ? 0.05 : d.eyes === 'big' || d.eyes === 'wide' ? 0.085 : 0.07;
      const eyeDx = 0.1;
      for (const sx of [-1, 1]) {
        const ex = sx * eyeDx;
        const ry = d.eyes === 'sleepy' ? eyeR * 0.6 : eyeR;
        g.ellipse(ex, eyeY, eyeR * 0.85, ry).fill(0xffffff).stroke({ width: 0.022, color: INK });
        if (d.eyes === 'wink' && sx === 1) g.ellipse(ex, eyeY, eyeR * 0.85, ry).fill(face);
        this.eyeBase.push({ x: ex, y: eyeY, r: eyeR });
      }
      this.parts.head.addChild(g);
      // Pupillen + Lider (animiert)
      for (const e of this.eyeBase) {
        const p = new MGraphics();
        p.circle(0, 0, e.r * 0.42).fill(hexNum(d.eyeColor));
        p.circle(e.r * 0.12, e.r * 0.12, e.r * 0.14).fill(0xffffff);
        p.position.set(e.x, e.y);
        this.parts.head.addChild(p);
        this.pupils.push(p);
        const lid = new MGraphics();
        lid.ellipse(0, 0, e.r * 0.9, e.r * 1.05).fill(face);
        lid.position.set(e.x, e.y);
        lid.scale.y = 0;
        this.parts.head.addChild(lid);
        this.eyeLids.push(lid);
      }
      // Brauen
      const bg = new MGraphics();
      if (d.brows !== 'none') {
        const bw = d.brows === 'thick' ? 0.03 : 0.018;
        for (const sx of [-1, 1]) {
          const ex = sx * eyeDx;
          const tilt = d.brows === 'angry' ? sx * 0.02 : d.brows === 'raised' ? -sx * 0.015 : 0;
          bg.moveTo(ex - 0.06, 0.095 + tilt).quadraticCurveTo(ex, 0.12 - tilt, ex + 0.06, 0.095 - tilt).stroke({ width: bw, color: hexNum(d.hairColor), cap: 'round' });
        }
      }
      this.parts.head.addChild(bg);
      // Brille
      if (d.glasses !== 'none') {
        const gg = new MGraphics();
        const col = d.glasses === 'sun' ? 0x1b1b2b : INK;
        for (const sx of [-1, 1]) {
          const ex = sx * eyeDx;
          if (d.glasses === 'round' || d.glasses === 'nerd') gg.circle(ex, eyeY, eyeR * 1.05).stroke({ width: d.glasses === 'nerd' ? 0.03 : 0.018, color: col });
          else gg.roundRect(ex - eyeR * 1.05, eyeY - eyeR * 0.9, eyeR * 2.1, eyeR * 1.8, 0.02).stroke({ width: 0.022, color: col });
          if (d.glasses === 'sun' || d.glasses === 'aviator') gg.roundRect(ex - eyeR * 1.0, eyeY - eyeR * 0.85, eyeR * 2.0, eyeR * 1.7, 0.02).fill({ color: 0x1b1b2b, alpha: 0.75 });
        }
        gg.moveTo(-eyeDx + eyeR, eyeY).lineTo(eyeDx - eyeR, eyeY).stroke({ width: 0.018, color: col });
        gg.moveTo(-eyeDx - eyeR * 1.05, eyeY + 0.01).lineTo(-hx * wide, eyeY + 0.03).moveTo(eyeDx + eyeR * 1.05, eyeY + 0.01).lineTo(hx * wide, eyeY + 0.03).stroke({ width: 0.018, color: col });
        this.parts.head.addChild(gg);
      }
      // Haare
      const hg = new MGraphics();
      this.drawHair(hg, d, hx * wide, hy * tall);
      this.parts.head.addChild(hg);
      // Hut
      if (d.hat !== 'none') {
        const hh = new MGraphics();
        this.drawHat(hh, d, hx * wide, hy * tall);
        this.parts.head.addChild(hh);
      }
    }
  }

  private drawLogo(g: Graphics, d: CharacterDef, cx: number, cy: number): void {
    const col = hexNum(shade(d.topColor, d.topColor === '#1b1b1b' || d.topColor === '#1b2a4a' ? 0.9 : -0.5));
    switch (d.logo) {
      case 'star': {
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? 0.075 : 0.032;
          pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.poly(pts).fill(0xffd23f);
        break;
      }
      case 'heart': g.circle(cx - 0.035, cy + 0.02, 0.04).fill(0xff5c8a); g.circle(cx + 0.035, cy + 0.02, 0.04).fill(0xff5c8a); g.poly([cx - 0.07, cy + 0.01, cx + 0.07, cy + 0.01, cx, cy - 0.07]).fill(0xff5c8a); break;
      case 'skull': g.circle(cx, cy + 0.02, 0.05).fill(0xffffff); g.rect(cx - 0.03, cy - 0.04, 0.06, 0.04).fill(0xffffff); g.circle(cx - 0.018, cy + 0.025, 0.012).fill(INK); g.circle(cx + 0.018, cy + 0.025, 0.012).fill(INK); break;
      case 'bolt': g.poly([cx + 0.02, cy + 0.08, cx - 0.04, cy, cx, cy, cx - 0.02, cy - 0.08, cx + 0.04, cy, cx, cy]).fill(0xffd23f); break;
      case 'eagle': g.moveTo(cx - 0.11, cy + 0.03).quadraticCurveTo(cx - 0.05, cy + 0.08, cx, cy + 0.03).quadraticCurveTo(cx + 0.05, cy + 0.08, cx + 0.11, cy + 0.03).lineTo(cx, cy - 0.03).closePath().fill(0xffffff); g.rect(cx - 0.07, cy - 0.06, 0.14, 0.035).fill(0xd64545); break;
      case 'mountain': g.poly([cx - 0.09, cy - 0.05, cx - 0.03, cy + 0.06, cx + 0.01, cy, cx + 0.04, cy + 0.04, cx + 0.09, cy - 0.05]).fill(0xffffff); break;
      case 'smiley': g.circle(cx, cy, 0.06).fill(0xffd23f).stroke({ width: 0.012, color: INK }); g.circle(cx - 0.02, cy + 0.015, 0.008).fill(INK); g.circle(cx + 0.02, cy + 0.015, 0.008).fill(INK); g.moveTo(cx - 0.03, cy - 0.015).quadraticCurveTo(cx, cy - 0.045, cx + 0.03, cy - 0.015).stroke({ width: 0.01, color: INK }); break;
      case 'coaster': g.moveTo(cx - 0.09, cy - 0.04).quadraticCurveTo(cx - 0.04, cy + 0.08, cx, cy + 0.01).quadraticCurveTo(cx + 0.04, cy - 0.05, cx + 0.09, cy + 0.04).stroke({ width: 0.016, color: col }); break;
      case 'text': g.rect(cx - 0.08, cy - 0.02, 0.16, 0.04).fill(col); break;
      default: break;
    }
  }

  private drawHair(g: Graphics, d: CharacterDef, hx: number, hy: number): void {
    const col = hexNum(d.hairColor);
    const dark = hexNum(shade(d.hairColor, -0.3));
    const top = hy + 0.03;
    switch (d.hair) {
      case 'none': case 'bald': return;
      case 'buzz': g.moveTo(-hx, hy * 0.3).bezierCurveTo(-hx, top + 0.02, hx, top + 0.02, hx, hy * 0.3).lineTo(hx, hy * 0.5).bezierCurveTo(hx * 0.6, top, -hx * 0.6, top, -hx, hy * 0.5).closePath().fill({ color: col, alpha: 0.5 }); return;
      case 'short': g.moveTo(-hx - 0.01, hy * 0.25).bezierCurveTo(-hx, top + 0.07, hx, top + 0.07, hx + 0.01, hy * 0.25).lineTo(hx * 0.95, hy * 0.75).bezierCurveTo(hx * 0.5, top - 0.01, -hx * 0.5, top - 0.01, -hx * 0.95, hy * 0.75).closePath().fill(col).stroke({ width: 0.02, color: INK }); return;
      case 'spiky': { const pts: number[] = [-hx - 0.02, hy * 0.5]; for (let i = 0; i <= 6; i++) { const f = i / 6; pts.push(-hx + f * 2 * hx, top + 0.02 + (i % 2 === 0 ? 0.11 : 0.0)); } pts.push(hx + 0.02, hy * 0.5); g.poly(pts).fill(col).stroke({ width: 0.02, color: INK }); return; }
      case 'mohawk': g.poly([-0.05, hy * 0.8, -0.03, top + 0.2, 0.03, top + 0.2, 0.05, hy * 0.8]).fill(col).stroke({ width: 0.02, color: INK }); return;
      case 'long': g.moveTo(-hx - 0.04, -hy - 0.15).lineTo(-hx - 0.03, hy * 0.3).bezierCurveTo(-hx, top + 0.08, hx, top + 0.08, hx + 0.03, hy * 0.3).lineTo(hx + 0.04, -hy - 0.15).lineTo(hx * 0.75, -hy - 0.1).lineTo(hx * 0.8, hy * 0.6).bezierCurveTo(hx * 0.3, top, -hx * 0.3, top, -hx * 0.8, hy * 0.6).lineTo(-hx * 0.75, -hy - 0.1).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.moveTo(-hx * 0.2, top + 0.02).lineTo(-hx * 0.6, hy * 0.2).stroke({ width: 0.015, color: dark }); return;
      case 'bob': g.moveTo(-hx - 0.04, -hy + 0.05).lineTo(-hx - 0.03, hy * 0.3).bezierCurveTo(-hx, top + 0.08, hx, top + 0.08, hx + 0.03, hy * 0.3).lineTo(hx + 0.04, -hy + 0.05).lineTo(hx * 0.8, -hy + 0.1).lineTo(hx * 0.8, hy * 0.6).bezierCurveTo(hx * 0.3, top, -hx * 0.3, top, -hx * 0.8, hy * 0.6).lineTo(-hx * 0.8, -hy + 0.1).closePath().fill(col).stroke({ width: 0.02, color: INK }); return;
      case 'curly': case 'afro': { const r = d.hair === 'afro' ? 0.1 : 0.06; const R = d.hair === 'afro' ? hx + 0.08 : hx + 0.02; for (let i = 0; i < 9; i++) { const a = Math.PI * 0.05 + (Math.PI * 0.9 * i) / 8; g.circle(Math.cos(a) * R, hy * 0.2 + Math.sin(a) * (top - hy * 0.2 + 0.05), r).fill(col).stroke({ width: 0.018, color: INK }); } g.moveTo(-hx, hy * 0.3).bezierCurveTo(-hx, top + 0.05, hx, top + 0.05, hx, hy * 0.3).closePath().fill(col); return; }
      case 'bun': g.moveTo(-hx, hy * 0.3).bezierCurveTo(-hx, top + 0.06, hx, top + 0.06, hx, hy * 0.3).lineTo(hx * 0.9, hy * 0.6).bezierCurveTo(hx * 0.4, top, -hx * 0.4, top, -hx * 0.9, hy * 0.6).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.circle(0, top + 0.07, 0.07).fill(col).stroke({ width: 0.02, color: INK }); return;
      case 'side': g.moveTo(-hx - 0.02, hy * 0.2).bezierCurveTo(-hx, top + 0.07, hx * 0.6, top + 0.1, hx + 0.02, hy * 0.5).lineTo(hx * 0.95, hy * 0.75).bezierCurveTo(hx * 0.3, top + 0.01, -hx * 0.2, top - 0.02, -hx * 0.95, hy * 0.2).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.poly([hx * 0.2, top + 0.02, hx + 0.02, hy * 0.5, hx * 0.6, hy * 0.2]).fill(col); return;
      case 'ponytail': g.moveTo(-hx, hy * 0.3).bezierCurveTo(-hx, top + 0.06, hx, top + 0.06, hx, hy * 0.3).lineTo(hx * 0.9, hy * 0.6).bezierCurveTo(hx * 0.4, top, -hx * 0.4, top, -hx * 0.9, hy * 0.6).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.moveTo(-hx - 0.01, hy * 0.6).bezierCurveTo(-hx - 0.12, hy * 0.2, -hx - 0.1, -hy - 0.1, -hx - 0.02, -hy - 0.14).lineTo(-hx + 0.02, -hy - 0.05).bezierCurveTo(-hx - 0.04, -hy, -hx - 0.05, hy * 0.2, -hx - 0.01, hy * 0.4).closePath().fill(col).stroke({ width: 0.02, color: INK }); return;
      case 'wavy': g.moveTo(-hx - 0.03, -hy).quadraticCurveTo(-hx - 0.08, hy * 0.1, -hx - 0.02, hy * 0.4).bezierCurveTo(-hx, top + 0.08, hx, top + 0.08, hx + 0.02, hy * 0.4).quadraticCurveTo(hx + 0.08, hy * 0.1, hx + 0.03, -hy).quadraticCurveTo(hx + 0.01, -hy * 0.4, hx * 0.85, hy * 0.5).bezierCurveTo(hx * 0.4, top, -hx * 0.4, top, -hx * 0.85, hy * 0.5).quadraticCurveTo(-hx - 0.01, -hy * 0.4, -hx - 0.03, -hy).fill(col).stroke({ width: 0.02, color: INK }); return;
    }
  }

  private drawHat(g: Graphics, d: CharacterDef, hx: number, hy: number): void {
    const col = hexNum(d.hatColor);
    const top = hy + 0.03;
    switch (d.hat) {
      case 'cap': case 'capBack': {
        const dir = d.hat === 'cap' ? 1 : -1;
        g.moveTo(-hx - 0.02, hy * 0.45).bezierCurveTo(-hx, top + 0.11, hx, top + 0.11, hx + 0.02, hy * 0.45).closePath().fill(col).stroke({ width: 0.02, color: INK });
        g.roundRect(dir > 0 ? hx - 0.02 : -hx - 0.2, hy * 0.4, 0.22, 0.04, 0.02).fill(col).stroke({ width: 0.02, color: INK });
        g.circle(0, top + 0.1, 0.02).fill(hexNum(shade(d.hatColor, -0.3)));
        break;
      }
      case 'beanie': g.moveTo(-hx - 0.02, hy * 0.3).bezierCurveTo(-hx, top + 0.12, hx, top + 0.12, hx + 0.02, hy * 0.3).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.rect(-hx - 0.02, hy * 0.3, hx * 2 + 0.04, 0.05).fill(hexNum(shade(d.hatColor, -0.25))); g.circle(0, top + 0.12, 0.035).fill(col).stroke({ width: 0.02, color: INK }); break;
      case 'tophat': g.rect(-hx - 0.04, hy * 0.6, hx * 2 + 0.08, 0.03).fill(col).stroke({ width: 0.02, color: INK }); g.rect(-hx * 0.8, hy * 0.6, hx * 1.6, 0.22).fill(col).stroke({ width: 0.02, color: INK }); g.rect(-hx * 0.8, hy * 0.6 + 0.03, hx * 1.6, 0.04).fill(0xff5c8a); break;
      case 'helmet': g.moveTo(-hx - 0.03, hy * 0.2).bezierCurveTo(-hx - 0.01, top + 0.13, hx + 0.01, top + 0.13, hx + 0.03, hy * 0.2).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.moveTo(-hx * 0.6, top + 0.02).lineTo(hx * 0.6, top + 0.02).stroke({ width: 0.02, color: 0xffffff, alpha: 0.6 }); break;
      case 'crown': { const pts: number[] = [-hx * 0.8, hy * 0.6]; for (let i = 0; i <= 4; i++) pts.push(-hx * 0.8 + (i * hx * 1.6) / 4, hy * 0.6 + (i % 2 === 0 ? 0.14 : 0.05)); pts.push(hx * 0.8, hy * 0.6); g.poly(pts).fill(0xffd23f).stroke({ width: 0.02, color: INK }); g.circle(0, hy * 0.6 + 0.12, 0.02).fill(0xff5c8a); break; }
      case 'bandana': g.moveTo(-hx - 0.02, hy * 0.4).bezierCurveTo(-hx, top + 0.08, hx, top + 0.08, hx + 0.02, hy * 0.4).closePath().fill(col).stroke({ width: 0.02, color: INK }); g.poly([hx - 0.02, hy * 0.5, hx + 0.12, hy * 0.2, hx + 0.1, hy * 0.6]).fill(col).stroke({ width: 0.02, color: INK }); break;
      default: break;
    }
  }

  private drawMouth(open: number): void {
    const g = this.mouth;
    g.clear();
    const d = this.def;
    const w = 0.07;
    if (open > 0.15) {
      g.ellipse(0, -open * 0.04, w * 0.7 + open * 0.02, 0.02 + open * 0.07).fill(0x5a1f2b).stroke({ width: 0.018, color: INK });
      g.ellipse(0, -open * 0.04 + 0.01, w * 0.45, 0.012 + open * 0.02).fill(0xffffff);
      return;
    }
    switch (d.mouth) {
      case 'smile': g.moveTo(-w, 0.01).quadraticCurveTo(0, -0.035, w, 0.01).stroke({ width: 0.02, color: INK, cap: 'round' }); break;
      case 'grin': g.moveTo(-w, 0.01).quadraticCurveTo(0, -0.05, w, 0.01).closePath().fill(0xffffff).stroke({ width: 0.018, color: INK }); break;
      case 'flat': g.moveTo(-w * 0.8, -0.005).lineTo(w * 0.8, -0.005).stroke({ width: 0.02, color: INK, cap: 'round' }); break;
      case 'open': g.ellipse(0, -0.01, w * 0.6, 0.025).fill(0x5a1f2b).stroke({ width: 0.018, color: INK }); break;
      case 'smirk': g.moveTo(-w * 0.6, 0).quadraticCurveTo(w * 0.2, -0.03, w, 0.005).stroke({ width: 0.02, color: INK, cap: 'round' }); break;
    }
  }

  /** Posen übernehmen (lokal zum Elternteil) */
  setPose(parts: Record<PartName, PartPose>, offsetY = 0): void {
    for (const name of Object.keys(this.parts) as PartName[]) {
      const p = parts[name];
      const c = this.parts[name];
      c.position.set(p.x, p.y + offsetY);
      c.rotation = p.angle;
    }
  }

  /** Mimik: Pupillen folgen den Kräften, Blinzeln, Mund */
  update(dt: number, feltFwd: number, feltUp: number, gSeat: number): void {
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkPhase = 0.18;
      this.blinkT = 2 + Math.random() * 4;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase -= dt;
      const f = Math.sin((this.blinkPhase / 0.18) * Math.PI);
      for (const l of this.eyeLids) l.scale.y = 0.01 * f;
    } else {
      for (const l of this.eyeLids) l.scale.y = 0;
    }
    const px = clamp(-feltFwd / 9.81, -1, 1) * 0.022;
    const py = clamp(-(feltUp - 9.81) / 9.81, -1, 1) * 0.022;
    this.pupils.forEach((p, i) => {
      const e = this.eyeBase[i];
      p.position.set(e.x + px, e.y + py);
    });
    const target = clamp(Math.abs(gSeat - 1) * 0.5 + (gSeat < 0 ? 0.6 : 0), 0, 1);
    this.mouthOpen += (target - this.mouthOpen) * Math.min(1, dt * 10);
    this.drawMouth(this.mouthOpen);
  }
}
