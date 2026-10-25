/**
 * Prozedurale Platzhalter-Texturen des Weltrenderers (aus dem Tiefen-Labor übernommen): Bodenbänder in drei Tönen
 * mit Tupfern, Erdschichten für den Erdschnitt. Nur das Nötigste, bis die Teile aus der Asset-Pipeline kommen
 * (keine Grafiken in Menge vor der Stilprobe).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng } from '@/core/math';
import { shade } from '@/render/paint';

function canvasTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Boden: Grundton mit zwei wellig begrenzten Bändern (hell, dunkel) und hellen Tupfern; deterministisch je Seed */
export function groundBandsTexture(base: string, dots: string, seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const tones = [shade(base, 0.14), base, shade(base, -0.16)];
  const r = rng(seed);
  g.fillStyle = tones[1];
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = tones[i % 2 === 0 ? 0 : 2];
    g.beginPath();
    const y = i * 60 + 10;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 9 + Math.sin(x * 0.07 + i * 3) * 3);
    g.lineTo(512, y + 30);
    g.lineTo(0, y + 30);
    g.closePath();
    g.fill();
  }
  g.fillStyle = dots;
  for (let i = 0; i < 700; i++) {
    const x = r() * 512;
    const y = r() * 512;
    g.beginPath();
    g.arc(x, y, 1 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(c);
}

/** Erdschnitt: geschichtete Erde in vier Tönen mit Steinen */
export function strataTexture(base: string, seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const tones = [shade(base, -0.08), shade(base, 0.12), shade(base, -0.22), shade(base, 0.22)];
  const r = rng(seed);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = tones[i % 4];
    g.beginPath();
    const y = i * 40;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 10);
    g.lineTo(512, 600);
    g.lineTo(0, 600);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(30,18,10,.5)';
  for (let i = 0; i < 300; i++) {
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 2 + r() * 5, 1 + r() * 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(c);
}
