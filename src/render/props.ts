/**
 * Deko-Props als Vektorzeichnungen (Meter, Y nach oben, Ursprung am Boden).
 * Jede Welt hat ihre Themen-Gebäude: Haus, Riesenrad, Bude, Förderturm, Schloss, Hochhaus,
 * Parkhaus, Leuchtreklame, Spukvilla, Friedhof, Raumstation. Alles handgezeichnet-wackelig.
 */
import { Container, Graphics } from 'pixi.js';
import { MGraphics } from './mgraphics';
import type { WorldDef } from '@/levels/types';
import { hexNum, shade } from './paint';
import { noise1 } from '@/core/math';
import { laneAtmosphere } from '@/track/stage';

const INK = '#2a1f3d';

function wobblyRect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, seed = 1, stroke = INK): void {
  const pts: number[] = [];
  const n = 6;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const nx = noise1(seed * 7 + f * 5 + x0, seed) * 0.06;
      const ny = noise1(seed * 3 + f * 5 + y0, seed + 1) * 0.06;
      pts.push(x0 + (x1 - x0) * f + nx, y0 + (y1 - y0) * f + ny);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
  g.poly(pts).fill(hexNum(fill)).stroke({ width: 0.12, color: hexNum(stroke), alpha: 0.85, join: 'round' });
}

function windows(g: Graphics, x: number, y: number, w: number, h: number, cols: number, rows: number, lit: boolean): void {
  const cw = w / (cols + 1);
  const ch = h / (rows + 1);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const wx = x + cw * (c + 0.65);
      const wy = y + ch * (r + 0.6);
      g.rect(wx, wy, cw * 0.55, ch * 0.55).fill(lit && (c + r) % 3 !== 1 ? 0xffd23f : 0x6fa8dc);
    }
  }
}

export function drawProp(parent: Container, id: string, world: WorldDef, z: number): void {
  const g = new MGraphics();
  parent.addChild(g);
  const fade = laneAtmosphere(z);
  const night = world.id === 6 || world.id === 8 || world.id === 10;
  const tone = (c: string) => shade(c, fade * 0.25);
  switch (id) {
    case 'house': {
      wobblyRect(g, -2.5, 0, 5, 3.2, tone('#f3d9a4'), 1);
      g.poly([-3, 3.2, 0, 5.6, 3, 3.2]).fill(hexNum(tone('#d64545'))).stroke({ width: 0.12, color: hexNum(INK) });
      wobblyRect(g, -0.6, 0, 1.2, 1.8, tone('#8a5a2b'), 2);
      windows(g, -2.3, 1.2, 1.4, 1.4, 1, 1, night);
      windows(g, 0.9, 1.2, 1.4, 1.4, 1, 1, night);
      g.rect(1.4, 4.2, 0.6, 1.2).fill(hexNum(tone('#8a5a2b')));
      break;
    }
    case 'ferris': {
      const R = 7;
      g.moveTo(-3, 0).lineTo(0, R).lineTo(3, 0).stroke({ width: 0.3, color: hexNum(tone('#5b2a86')) });
      g.circle(0, R, R).stroke({ width: 0.35, color: hexNum(tone('#ff7eb3')) });
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        g.moveTo(0, R).lineTo(Math.cos(a) * R, R + Math.sin(a) * R).stroke({ width: 0.12, color: hexNum(tone('#ffb17a')) });
        const cx = Math.cos(a) * R;
        const cy = R + Math.sin(a) * R;
        g.circle(cx, cy - 0.5, 0.55).fill(hexNum(['#ffd23f', '#7ee081', '#4f8dff', '#ff5c8a'][i % 4]));
      }
      g.circle(0, R, 0.7).fill(hexNum('#ffd23f'));
      break;
    }
    case 'booth': {
      wobblyRect(g, -2, 0, 4, 2.2, tone('#ffffff'), 3);
      for (let i = 0; i < 4; i++) g.rect(-2 + i, 0, 0.5, 2.2).fill(hexNum(tone('#ff5c8a')));
      g.poly([-2.4, 2.2, 0, 3.4, 2.4, 2.2]).fill(hexNum(tone('#ff5c8a'))).stroke({ width: 0.12, color: hexNum(INK) });
      g.rect(-1.6, 1.1, 3.2, 0.2).fill(hexNum(INK));
      break;
    }
    case 'headframe': {
      g.moveTo(-2.2, 0).lineTo(-0.7, 7).lineTo(0.7, 7).lineTo(2.2, 0).stroke({ width: 0.3, color: hexNum(tone('#5a3a22')) });
      for (let i = 1; i < 6; i++) g.moveTo(-2.2 + i * 0.25, i * 1.2).lineTo(2.2 - i * 0.25, i * 1.2).stroke({ width: 0.14, color: hexNum(tone('#5a3a22')) });
      g.circle(0, 7.4, 0.9).stroke({ width: 0.25, color: hexNum(tone('#8a5a2b')) });
      g.moveTo(0, 7.4).lineTo(0, 1).stroke({ width: 0.08, color: hexNum(INK) });
      wobblyRect(g, -0.6, 0.4, 1.2, 1, tone('#8a5a2b'), 4);
      break;
    }
    case 'castle': {
      wobblyRect(g, -6, 0, 12, 6, tone('#efe2ff'), 5);
      for (const tx of [-6.5, 5.3]) {
        wobblyRect(g, tx, 0, 1.2, 9, tone('#e3d0ff'), 6);
        g.poly([tx - 0.3, 9, tx + 0.6, 11.5, tx + 1.5, 9]).fill(hexNum(tone('#a855f7'))).stroke({ width: 0.12, color: hexNum(INK) });
        g.moveTo(tx + 0.6, 11.5).lineTo(tx + 0.6, 12.6).stroke({ width: 0.1, color: hexNum(INK) });
        g.poly([tx + 0.6, 12.6, tx + 1.8, 12.2, tx + 0.6, 11.8]).fill(hexNum('#ff5c8a'));
      }
      wobblyRect(g, -1.5, 0, 3, 11, tone('#efe2ff'), 7);
      g.poly([-2, 11, 0, 14, 2, 11]).fill(hexNum(tone('#a855f7'))).stroke({ width: 0.12, color: hexNum(INK) });
      g.moveTo(-1.2, 0).lineTo(-1.2, 2.6).arc(0, 2.6, 1.2, Math.PI, 0, true).lineTo(1.2, 0).fill(hexNum('#5b2a86'));
      for (let i = -5; i <= 5; i += 2) g.rect(i - 0.3, 6, 0.8, 0.8).fill(hexNum(tone('#efe2ff'))).stroke({ width: 0.08, color: hexNum(INK) });
      windows(g, -5, 2, 3, 3, 2, 1, night);
      windows(g, 2, 2, 3, 3, 2, 1, night);
      break;
    }
    case 'tower': {
      const h = 18 + Math.abs(noise1(z * 3, 2)) * 10;
      wobblyRect(g, -3, 0, 6, h, tone('#55596b'), 8);
      windows(g, -3, 0.5, 6, h - 1, 3, Math.floor(h / 2.5), night);
      g.rect(-3.2, h, 6.4, 0.5).fill(hexNum(tone('#33364a')));
      g.moveTo(0, h + 0.5).lineTo(0, h + 3).stroke({ width: 0.12, color: hexNum(INK) });
      g.circle(0, h + 3.2, 0.3).fill(0xff5c8a);
      break;
    }
    case 'garage': {
      wobblyRect(g, -5, 0, 10, 7, tone('#6b6f84'), 9);
      for (let r = 0; r < 3; r++) g.rect(-4.5, 0.7 + r * 2.2, 9, 0.9).fill(hexNum(tone('#2c2f3f')));
      g.rect(-4.6, 7, 9.2, 0.4).fill(hexNum(tone('#ff6fae')));
      break;
    }
    case 'billboard': {
      g.moveTo(-0.5, 0).lineTo(-0.5, 6).moveTo(0.5, 0).lineTo(0.5, 6).stroke({ width: 0.25, color: hexNum(INK) });
      wobblyRect(g, -5, 6, 10, 4, '#1b1b2b', 10);
      g.roundRect(-4.4, 6.5, 8.8, 3, 0.6).stroke({ width: 0.25, color: 0xff6fae });
      for (let i = 0; i < 5; i++) g.circle(-3.5 + i * 1.75, 8, 0.6).fill(hexNum(['#ff6fae', '#3ec7c2', '#ffd23f', '#9b6dff', '#7ee081'][i]));
      break;
    }
    case 'ghostHouse': {
      wobblyRect(g, -5, 0, 10, 7, tone('#3b2e52'), 11);
      g.poly([-5.8, 7, -2, 11.5, 2, 11.5, 5.8, 7]).fill(hexNum(tone('#2a2040'))).stroke({ width: 0.12, color: hexNum(INK) });
      wobblyRect(g, -1.2, 0, 2.4, 3.4, '#1a1426', 12);
      windows(g, -4.5, 3, 3, 3, 2, 1, true);
      windows(g, 1.5, 3, 3, 3, 2, 1, true);
      g.rect(2.5, 9, 1, 3).fill(hexNum(tone('#2a2040')));
      // Fledermaus
      g.moveTo(-6, 10).quadraticCurveTo(-5.2, 11, -4.4, 10).quadraticCurveTo(-3.6, 11, -2.8, 10).stroke({ width: 0.14, color: hexNum(INK) });
      break;
    }
    case 'graveyard': {
      for (let i = 0; i < 5; i++) {
        const x = -6 + i * 3;
        g.roundRect(x - 0.6, 0, 1.2, 1.6 + (i % 2) * 0.4, 0.5).fill(hexNum(tone('#9a93b3'))).stroke({ width: 0.1, color: hexNum(INK) });
        g.rect(x - 0.08, 0.5, 0.16, 0.6).fill(hexNum(INK));
        g.rect(x - 0.3, 0.85, 0.6, 0.14).fill(hexNum(INK));
      }
      g.circle(5, 0.6, 0.8).fill(0xff8a1f);
      g.rect(4.8, 1.3, 0.4, 0.4).fill(0x2f7a4a);
      break;
    }
    case 'spaceBuilding': {
      g.roundRect(-5, 1, 10, 3, 1.5).fill(hexNum(tone('#d9d4f0'))).stroke({ width: 0.14, color: hexNum(INK) });
      g.roundRect(-2, 4, 4, 5, 1).fill(hexNum(tone('#bdb4e6'))).stroke({ width: 0.14, color: hexNum(INK) });
      g.circle(0, 10, 1.6).fill(hexNum('#7fd3ff')).stroke({ width: 0.14, color: hexNum(INK) });
      for (let i = 0; i < 4; i++) g.circle(-3.5 + i * 2.3, 2.5, 0.5).fill(0x7fd3ff);
      g.moveTo(-5, 1).lineTo(-6.5, 0).moveTo(5, 1).lineTo(6.5, 0).stroke({ width: 0.2, color: hexNum(INK) });
      g.rect(-9, 5, 3, 1.2).fill(0x4f8dff);
      g.rect(6, 5, 3, 1.2).fill(0x4f8dff);
      g.moveTo(-6, 5.6).lineTo(-2, 5.6).moveTo(2, 5.6).lineTo(6, 5.6).stroke({ width: 0.12, color: hexNum(INK) });
      break;
    }
    default: {
      // Baum als Fallback
      g.rect(-0.3, 0, 0.6, 1.6).fill(hexNum(tone('#8a5a2b')));
      g.circle(0, 2.6, 1.6).fill(hexNum(tone(world.ground[0])));
      g.circle(-0.9, 2.2, 1.1).fill(hexNum(tone(world.ground[0])));
      g.circle(0.9, 2.2, 1.1).fill(hexNum(tone(world.ground[0])));
    }
  }
}
