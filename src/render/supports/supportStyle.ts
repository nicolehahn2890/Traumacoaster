/**
 * Pfeiler und Streben je Welt. Der Planer (reine Funktion) wählt die Fußpunkte entlang der Bahn, der Bauer
 * zeichnet die Form der Welt in einen Container je Pfeiler: Ursprung am Fuß auf der Bodenoberfläche der Spur,
 * Einheiten Spur-Meter, y nach oben. Die Bahn liegt bei y = h − 0,25 (Unterkante der Schwellen). Der
 * TrackRenderer setzt den Container auf die Bühne, skaliert ihn mit der Spur und lässt ihn nach dem Zeichnen
 * vom Boden hochwachsen (scale.y). Leuchtpunkte sammelt der Kontext für die Leuchtebene.
 *
 * Formen (Stil-Bibel, Kapitel 3): Wiesenland schwarze verzweigte Stämme mit Blattkugeln, Jahrmarkt gestreifte
 * Stangen mit Glühbirnen, Minenberg Holzböcke mit Laternen, Seenland helle Stahl-A-Böcke, Schlossreich
 * Steinsäulen mit Goldband, Großstadt Masten mit Neonringen, Eisgipfel Kristalle, Geisterhaus krumme Stämme
 * mit Laterne, Vulkaninsel Basaltsäulen mit glühenden Rissen, Weltraum schwebende Ringe.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { TrackSamples } from '@/track/model';
import type { WorldDef } from '@/levels/types';
import { art, ART_NAMES, hasArt } from '@/assets/manifest';
import { hexNum, mix, shade } from '../paint';
import { noise1, rng } from '@/core/math';
import type { SkinStyle } from '../trackRenderer';
import { atmosphere } from '../terrainRenderer';

export type SupportKind = 'tree' | 'pole' | 'trestle' | 'aframe' | 'column' | 'pylon' | 'crystal' | 'crooked' | 'basalt' | 'ring';

export interface SupportPlan {
  /** Bahnpunkt in Weltkoordinaten */
  x: number;
  y: number;
  z: number;
  lane: number;
  /** Bodenoberfläche der Spur unter dem Bahnpunkt (Boden + Berg) */
  ground: number;
  /** Höhe der Bahn über dem Fuß in Metern */
  h: number;
  seed: number;
  kind: SupportKind;
}

export interface TerrainLike {
  groundHeight(x: number, z: number): number;
  mountainHeight(x: number, z: number): number;
  insideMountain(x: number, y: number, z: number): boolean;
}

export interface SupportGlow {
  /** lokal zum Pfeiler (Spur-Meter, y nach oben) */
  x: number;
  y: number;
  r: number;
  color: string;
}

export interface SupportContext {
  style: SkinStyle;
  world: WorldDef;
  sky: string;
  /** vom Bauer gefüllt, vom Aufrufer in die Leuchtebene übertragen */
  glows: SupportGlow[];
}

/** Welt → Pfeilerform */
export const SUPPORT_KINDS: Record<number, SupportKind> = { 1: 'tree', 2: 'pole', 3: 'trestle', 4: 'aframe', 5: 'column', 6: 'pylon', 7: 'crystal', 8: 'crooked', 9: 'basalt', 10: 'ring' };

export function supportKindFor(worldId: number): SupportKind {
  return SUPPORT_KINDS[worldId] ?? 'trestle';
}

/** Mindesthöhe der Bahn über dem Boden, ab der ein Pfeiler steht */
export const SUPPORT_MIN_HEIGHT = 1.0;
/** Unterkante der Schwellen über dem Bahnpunkt */
export const SUPPORT_TOP_GAP = 0.25;

/** Fußpunkte (seitlicher Versatz in Spur-Metern), immer symmetrisch zur Bahnachse */
export function footOffsets(kind: SupportKind, h: number): number[] {
  switch (kind) {
    case 'trestle':
      return [-0.7, 0.7];
    case 'aframe':
      return [-1.0, 1.0];
    case 'pole':
      return h < 5 ? [0] : [-0.7, 0.7];
    default:
      return [0];
  }
}

/** Stützen stehen weiter auseinander als die Schienenstile vorgeben (die Bahn soll sichtbar bleiben) */
export const SUPPORT_THIN = 1.7;
/** Draufsicht-Abstand (m), unter dem eine Stütze ein anderes Bahnstück durchstoßen würde bzw. zu dicht steht */
const PIERCE_DIST = 1.8;
const CROWD_DIST = 2.6;
const LANE_M = 8.4;

/**
 * Fußpunkte entlang der Bahn: alle `spacing` · SUPPORT_THIN Meter einer, nicht kopfüber (upy < 0,35), nicht im Berg,
 * nicht unter SUPPORT_MIN_HEIGHT. Wo sich die Bahn übereinanderlegt (Spirale, Kreuzung, Kringel), keine Stütze durch
 * ein tieferes Bahnstück hindurch und keine zweite dicht neben einer schon gesetzten eines anderen Bahnstücks: So
 * bleibt die Bahn auch in einer Schneckennudel sichtbar. Deterministisch über den Abtastindex als Seed.
 */
export function planSupports(samples: TrackSamples, terrain: TerrainLike, spacing: number, kind: SupportKind): SupportPlan[] {
  const out: SupportPlan[] = [];
  const step = spacing * SUPPORT_THIN;
  const n = samples.count;
  const L = samples.length;
  // ein anderes Bahnstück (mindestens 10 m entfernt auf der Bahn) liegt unter diesem Punkt: die Stütze ginge hindurch
  const pierces = (i: number, x: number, y: number, z: number, ground: number): boolean => {
    for (let j = 0; j < n; j += 2) {
      let ds = Math.abs(samples.s[j] - samples.s[i]);
      if (samples.closed) ds = Math.min(ds, L - ds);
      if (ds < 10) continue;
      const yj = samples.y[j];
      if (yj >= y - 0.5 || yj <= ground + 0.3) continue;
      if (Math.hypot(samples.x[j] - x, (samples.z[j] - z) * LANE_M) < PIERCE_DIST) return true;
    }
    return false;
  };
  let nextS = 0;
  for (let i = 0; i < n; i++) {
    const s = samples.s[i];
    if (s < nextS) continue;
    const x = samples.x[i];
    const y = samples.y[i];
    const z = samples.z[i];
    if (samples.upy[i] < 0.35) continue;
    if (terrain.insideMountain(x, y, z)) continue;
    const ground = terrain.groundHeight(x, z) + terrain.mountainHeight(x, z);
    const h = y - ground;
    if (h < SUPPORT_MIN_HEIGHT) continue;
    // nächster Versuch nach einem Meter, wenn diese Stelle frei bleiben muss (die Lücke wird nicht doppelt so groß)
    if (out.some((p) => Math.hypot(p.x - x, (p.z - z) * LANE_M) < CROWD_DIST) || pierces(i, x, y, z, ground)) {
      nextS = s + 1;
      continue;
    }
    nextS = s + step;
    out.push({ x, y, z, lane: Math.round(z), ground, h, seed: i, kind });
  }
  return out;
}

/** Sprite aus einer gemalten Kachel (y-gespiegelt für den Welt-Container), Höhe in Metern; null ohne Kachel */
function artSprite(name: string, height: number, hanging: boolean): Sprite | null {
  if (!hasArt(name)) return null;
  const sp = new Sprite(art(name, () => Texture.EMPTY));
  const s = height / Math.max(1, sp.texture.height);
  sp.anchor.set(0.5, hanging ? 0 : 1);
  sp.scale.set(s, -s);
  return sp;
}

/** Strich mit Tinte-Kontur: Kante dunkel, Fläche in Farbe, Lichtkante hell (drei Töne, harte Kante) */
function beam(g: Graphics, x0: number, y0: number, x1: number, y1: number, w: number, color: string, ink: string, light?: string): void {
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w + 0.1, color: hexNum(ink), cap: 'round' });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w, color: hexNum(color), cap: 'round' });
  if (light) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w * 0.3;
    const ny = (dx / l) * w * 0.3;
    g.moveTo(x0 + nx, y0 + ny).lineTo(x1 + nx, y1 + ny).stroke({ width: w * 0.28, color: hexNum(light), alpha: 0.8, cap: 'round' });
  }
}

/** Laterne (gemalt oder gezeichnet), hängend am Punkt (x, y); meldet ihr Leuchten */
function lantern(c: Container, g: Graphics, x: number, y: number, tint: string | null, glow: string, ctx: SupportContext): void {
  const sp = artSprite(ART_NAMES.lantern(), 0.9, true);
  if (sp) {
    sp.position.set(x, y);
    if (tint) sp.tint = hexNum(tint);
    c.addChild(sp);
  } else {
    g.moveTo(x, y).lineTo(x, y - 0.2).stroke({ width: 0.06, color: 0x2a1f3d });
    g.roundRect(x - 0.2, y - 0.8, 0.4, 0.6, 0.08).fill(hexNum(glow)).stroke({ width: 0.06, color: 0x2a1f3d });
  }
  g.circle(x, y - 0.5, 0.55).fill({ color: hexNum(glow), alpha: 0.18 });
  ctx.glows.push({ x, y: y - 0.5, r: 1.1, color: glow });
}

/** Blattkugel im Earle-Stil: Scheibe in zwei Tönen, Tintenrand, Farbtupfer */
function leafBall(g: Graphics, x: number, y: number, r: number, light: string, dark: string, ink: string, spots: string[], seed: number): void {
  g.circle(x, y, r).fill(hexNum(light)).stroke({ width: 0.08, color: hexNum(ink), alpha: 0.9 });
  g.circle(x + r * 0.22, y - r * 0.22, r * 0.72).fill({ color: hexNum(dark), alpha: 0.85 });
  g.circle(x - r * 0.3, y + r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.25 });
  const rr = rng(seed);
  for (let i = 0; i < 3; i++) {
    const a = rr() * Math.PI * 2;
    const d = rr() * r * 0.7;
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.07 + rr() * 0.06).fill({ color: hexNum(spots[i % spots.length]), alpha: 0.9 });
  }
}

/** Baumstamm (gefülltes Polygon, verjüngt, leicht geschwungen) von (0,0) nach (0, top) */
function trunk(g: Graphics, top: number, w0: number, w1: number, sway: number, kinks: number[] | null, color: string): void {
  const n = 10;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = top * t;
    let cx = sway * Math.sin(Math.PI * t);
    if (kinks) {
      // Zickzack: stückweise linear zwischen den Knickpunkten
      const segs = kinks.length + 1;
      const f = t * segs;
      const j = Math.min(kinks.length, Math.floor(f));
      const a = j === 0 ? 0 : kinks[j - 1];
      const b = j >= kinks.length ? 0 : kinks[j];
      cx = a + (b - a) * (f - j);
    }
    const w = w0 + (w1 - w0) * t;
    left.push(cx - w / 2, y);
    right.push(cx + w / 2, y);
  }
  const poly: number[] = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  g.poly(poly).fill(hexNum(color));
}

/** Container eines Pfeilers bauen (Ursprung am Fuß, Spur-Meter, y nach oben) */
export function buildSupport(p: SupportPlan, ctx: SupportContext): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const { style, world, sky } = ctx;
  const z = p.z;
  const top = p.h - SUPPORT_TOP_GAP;
  const post = atmosphere(style.post, z, sky);
  const brace = atmosphere(style.brace, z, sky);
  const ink = atmosphere(world.palette.ink, z, sky);
  const black = atmosphere('#17111f', z, sky);
  const light = shade(post, 0.3);
  const glow = style.glow ?? world.palette.glow;
  const r = rng(p.seed * 7 + world.id * 13);
  const wob = (k: number) => noise1(p.seed * 0.37 + k, 3);

  switch (p.kind) {
    case 'tree': {
      // Wiesenland: schwarzer Stamm mit Wurzeln, Astgabel unter der Bahn, Äste mit Blattkugeln, Flechtenflecken
      const sway = (r() - 0.5) * Math.min(1.2, 0.3 + top * 0.08);
      trunk(g, top - 0.9, 0.55, 0.3, sway, null, black);
      for (const sx of [-0.7, 0.7]) g.moveTo(sx * 0.15, 0.35).lineTo(sx, -0.02).stroke({ width: 0.26, color: hexNum(black), cap: 'round' });
      for (const sx of [-0.75, 0.75]) g.moveTo(0, top - 1.1).lineTo(sx, top).stroke({ width: 0.2, color: hexNum(black), cap: 'round' });
      g.moveTo(-0.85, top).lineTo(0.85, top).stroke({ width: 0.18, color: hexNum(black), cap: 'round' });
      const tiers = Math.min(4, 1 + Math.floor(top / 5));
      const lightTone = shade(world.ground[0], 0.12);
      const darkTone = shade(world.ground[1], -0.08);
      const spots = [world.palette.accent, world.palette.glow, '#ffffff'];
      for (let j = 0; j < tiers; j++) {
        const side = (j + p.seed) % 2 === 0 ? 1 : -1;
        const hb = top * (0.3 + (0.55 * (j + 0.5)) / tiers);
        const cx = sway * Math.sin((Math.PI * hb) / Math.max(1e-6, top - 0.9));
        const len = 0.9 + r() * 0.9;
        const ex = cx + side * len;
        const ey = hb + 0.3 + r() * 0.6;
        g.moveTo(cx, hb).quadraticCurveTo(cx + side * len * 0.5, hb + 0.05, ex, ey).stroke({ width: 0.16, color: hexNum(black), cap: 'round' });
        leafBall(g, ex, ey + 0.2, 0.65 + r() * 0.5, atmosphere(lightTone, z, sky), atmosphere(darkTone, z, sky), ink, spots, p.seed * 3 + j);
      }
      for (let j = 0; j < 3; j++) {
        const hy = 0.6 + r() * Math.max(0.5, top - 1.8);
        const cx = sway * Math.sin((Math.PI * hy) / Math.max(1e-6, top - 0.9));
        g.circle(cx + (r() - 0.5) * 0.25, hy, 0.06 + r() * 0.05).fill({ color: hexNum(j === 0 ? world.palette.accent : world.palette.glow), alpha: 0.9 });
      }
      break;
    }
    case 'crooked': {
      // Geisterhaus: krummer schwarzer Stamm mit Astknubbeln, Laterne, zwei Glutaugen in einem Astloch
      const kinks = [(r() - 0.5) * 0.9, (r() - 0.5) * 0.9];
      trunk(g, top - 0.6, 0.48, 0.24, 0, kinks, black);
      for (const sx of [-0.6, 0.6]) g.moveTo(sx * 0.2, 0.3).lineTo(sx, -0.02).stroke({ width: 0.22, color: hexNum(black), cap: 'round' });
      for (const sx of [-0.75, 0.75]) g.moveTo(0, top - 0.8).lineTo(sx, top).stroke({ width: 0.18, color: hexNum(black), cap: 'round' });
      g.moveTo(-0.85, top).lineTo(0.85, top).stroke({ width: 0.16, color: hexNum(black), cap: 'round' });
      const stubY = top * 0.55;
      const stubSide = p.seed % 2 === 0 ? 1 : -1;
      const sx0 = kinks[0] * 0.8;
      g.moveTo(sx0, stubY).lineTo(sx0 + stubSide * 1.1, stubY + 0.5).stroke({ width: 0.14, color: hexNum(black), cap: 'round' });
      if (top > 3) lantern(c, g, sx0 + stubSide * 1.05, stubY + 0.45, glow, glow, ctx);
      if (top > 4 && p.seed % 3 === 0) {
        const ey = top * 0.3;
        g.circle(kinks[0] * 0.3, ey, 0.22).fill(hexNum('#0d0b1f'));
        for (const dx of [-0.07, 0.07]) g.circle(kinks[0] * 0.3 + dx, ey, 0.035).fill(hexNum(glow));
        ctx.glows.push({ x: kinks[0] * 0.3, y: ey, r: 0.35, color: glow });
      }
      break;
    }
    case 'trestle': {
      // Minenberg: Holzbock, Füße ±0,7, Pfosten laufen nach oben zusammen, Querbalken alle 3 m, X-Streben, Laterne
      const feet = footOffsets('trestle', p.h);
      const topX = 0.45;
      for (const fx of feet) beam(g, fx, 0, Math.sign(fx) * topX, top, 0.26, post, ink, light);
      const levels = Math.max(1, Math.floor(top / 3));
      const xAt = (y: number) => 0.7 + (topX - 0.7) * (y / Math.max(1e-6, top));
      for (let l = 0; l <= levels; l++) {
        const y = (top * l) / levels;
        const w = xAt(y);
        beam(g, -w + wob(l) * 0.05, y, w + wob(l + 7) * 0.05, y, 0.17, brace, ink);
        if (l < levels) {
          const y2 = (top * (l + 1)) / levels;
          const w2 = xAt(y2);
          g.moveTo(-w, y).lineTo(w2, y2).stroke({ width: 0.11, color: hexNum(brace), alpha: 0.9, cap: 'round' });
          g.moveTo(w, y).lineTo(-w2, y2).stroke({ width: 0.11, color: hexNum(brace), alpha: 0.9, cap: 'round' });
        }
      }
      g.rect(-0.95, top - 0.14, 1.9, 0.28).fill(hexNum(shade(post, -0.12))).stroke({ width: 0.06, color: hexNum(ink) });
      if (top > 4 && p.seed % 2 === 0) lantern(c, g, 0.95 * (p.seed % 4 === 0 ? 1 : -1), top - 0.3, null, glow, ctx);
      break;
    }
    case 'aframe': {
      // Seenland: heller Stahl-A-Bock mit Fußplatten, Riegel in halber Höhe, Kopfplatte, Nieten
      const feet = footOffsets('aframe', p.h);
      for (const fx of feet) {
        beam(g, fx, 0, Math.sign(fx) * 0.3, top, 0.3, post, brace, '#ffffff');
        g.rect(fx - 0.35, -0.02, 0.7, 0.16).fill(hexNum(brace));
      }
      const yTie = top * 0.5;
      beam(g, -(1.0 + (0.3 - 1.0) * 0.5), yTie, 1.0 + (0.3 - 1.0) * 0.5, yTie, 0.18, post, brace);
      g.rect(-0.65, top - 0.12, 1.3, 0.24).fill(hexNum(post)).stroke({ width: 0.06, color: hexNum(brace) });
      for (let y = 1.2; y < top - 0.5; y += 1.5) {
        const x = 1.0 + (0.3 - 1.0) * (y / top);
        g.circle(-x, y, 0.05).fill(hexNum(brace));
        g.circle(x, y, 0.05).fill(hexNum(brace));
      }
      break;
    }
    case 'column': {
      // Schlossreich: Steinsäule mit Sockel, Kapitell, Fugen, Goldband, Wimpel an hohen Säulen
      const stone = atmosphere(mix(style.post, '#efe2ff', 0.65), z, sky);
      const fuge = shade(stone, -0.25);
      g.rect(-0.75, 0, 1.5, 0.4).fill(hexNum(shade(stone, -0.08))).stroke({ width: 0.07, color: hexNum(ink) });
      g.rect(-0.42, 0.4, 0.84, Math.max(0.2, top - 0.9)).fill(hexNum(stone)).stroke({ width: 0.07, color: hexNum(ink) });
      for (let y = 1.6; y < top - 0.7; y += 1.5) g.moveTo(-0.42, y).lineTo(0.42, y).stroke({ width: 0.05, color: hexNum(fuge), alpha: 0.6 });
      g.moveTo(-0.14, 0.5).lineTo(-0.14, top - 0.6).moveTo(0.14, 0.5).lineTo(0.14, top - 0.6).stroke({ width: 0.04, color: hexNum(fuge), alpha: 0.45 });
      g.rect(-0.7, top - 0.5, 1.4, 0.5).fill(hexNum(shade(stone, 0.05))).stroke({ width: 0.07, color: hexNum(ink) });
      g.rect(-0.7, top - 0.16, 1.4, 0.14).fill(hexNum(style.post));
      if (top > 6) {
        const fx = p.seed % 2 === 0 ? 0.95 : -0.95;
        g.moveTo(fx, top - 0.55).lineTo(fx, top - 1.8).stroke({ width: 0.05, color: hexNum(ink) });
        g.poly([fx, top - 0.6, fx + Math.sign(fx) * 0.8, top - 0.95, fx, top - 1.3]).fill(hexNum(world.palette.accent));
      }
      break;
    }
    case 'pylon': {
      // Großstadt: dunkler Mast, Ausleger, Neonring, Reklame an hohen Masten
      g.poly([-0.4, 0, 0.4, 0, 0.22, top, -0.22, top]).fill(hexNum(post)).stroke({ width: 0.07, color: hexNum(ink) });
      g.moveTo(-0.1, 0.3).lineTo(-0.05, top - 0.3).stroke({ width: 0.08, color: hexNum(light), alpha: 0.5 });
      g.ellipse(0, 0.08, 0.75, 0.2).fill(hexNum(shade(post, -0.2)));
      g.rect(-0.9, top - 0.11, 1.8, 0.22).fill(hexNum(post)).stroke({ width: 0.06, color: hexNum(ink) });
      for (let y = 1; y < top - 0.6; y += 1.3) g.circle(0.18 - (0.18 * y) / top, y, 0.05).fill(hexNum(light));
      if (top > 2.5) {
        const ry = top - 1.5;
        g.circle(0, ry, 0.55).stroke({ width: 0.12, color: hexNum(glow), alpha: 0.95 });
        ctx.glows.push({ x: 0, y: ry, r: 0.9, color: glow });
      }
      if (top > 7 && p.seed % 3 === 0) {
        const sp = artSprite(ART_NAMES.neon(), 1.8, false);
        const sx = p.seed % 6 === 0 ? -1.3 : 1.3;
        if (sp) {
          sp.position.set(sx, top * 0.45);
          c.addChild(sp);
        } else {
          g.roundRect(sx - 0.8, top * 0.45, 1.6, 1.0, 0.3).stroke({ width: 0.1, color: hexNum(glow) });
        }
        ctx.glows.push({ x: sx, y: top * 0.45 + 0.9, r: 1.2, color: glow });
      }
      break;
    }
    case 'crystal': {
      // Eisgipfel: Eiskristall-Säule mit Facette, zweiter Splitter, Kristallbüschel am Fuß
      g.poly([-0.62, 0, 0.62, 0, 0.36, top, -0.36, top]).fill({ color: hexNum(post), alpha: 0.88 }).stroke({ width: 0.1, color: 0xffffff, alpha: 0.95 });
      g.poly([-0.62, 0, 0, 0, 0.1, top, -0.36, top]).fill({ color: 0xffffff, alpha: 0.18 });
      g.moveTo(-0.1, 0.4).lineTo(0.14, top - 0.4).stroke({ width: 0.08, color: 0xffffff, alpha: 0.6 });
      const side = p.seed % 2 === 0 ? 1 : -1;
      g.poly([side * 0.5, 0, side * 1.15, 0, side * 0.95, Math.min(top * 0.45, 3.2), side * 0.55, Math.min(top * 0.5, 3.6)]).fill({ color: hexNum(shade(post, -0.1)), alpha: 0.8 }).stroke({ width: 0.08, color: 0xffffff, alpha: 0.9 });
      g.rect(-0.8, top - 0.12, 1.6, 0.24).fill(hexNum(shade(post, 0.1))).stroke({ width: 0.06, color: 0xffffff });
      if (top > 3 && p.seed % 3 !== 1) {
        const sp = artSprite(ART_NAMES.crystal(), 1.3, false);
        if (sp) {
          sp.position.set(-side * 0.9, 0);
          c.addChild(sp);
        }
      }
      break;
    }
    case 'basalt': {
      // Vulkaninsel: gestapelte Basaltsegmente, glühende Risse, Glut am Fuß
      const segs = Math.max(1, Math.round(top / 2.2));
      const sh = top / segs;
      for (let i = 0; i < segs; i++) {
        const off = i % 2 === 0 ? 0.06 : -0.06;
        const y0 = i * sh;
        g.poly([-0.5 + off, y0, 0.5 + off, y0, 0.46 + off, y0 + sh, -0.46 + off, y0 + sh]).fill(hexNum(shade(post, i % 2 === 0 ? 0 : -0.14))).stroke({ width: 0.07, color: hexNum(ink) });
        if (i > 0) {
          const yy = y0 + 0.08;
          g.moveTo(-0.44 + off, yy).lineTo(-0.1 + off, yy - 0.12).lineTo(0.15 + off, yy + 0.1).lineTo(0.44 + off, yy - 0.05).stroke({ width: 0.07, color: hexNum(glow), alpha: 0.85 });
          ctx.glows.push({ x: off, y: yy, r: 0.55, color: glow });
        }
      }
      g.rect(-0.85, top - 0.12, 1.7, 0.24).fill(hexNum(shade(post, -0.2))).stroke({ width: 0.06, color: hexNum(ink) });
      g.ellipse(0, 0.1, 0.9, 0.2).fill({ color: hexNum(glow), alpha: 0.35 });
      ctx.glows.push({ x: 0, y: 0.1, r: 1.0, color: glow });
      break;
    }
    case 'ring': {
      // Weltraum: Landeplatte, Energiestrahl, schwebende Ringe, Auflage unter der Bahn
      g.ellipse(0, 0, 0.9, 0.2).fill(hexNum(post)).stroke({ width: 0.06, color: hexNum(glow), alpha: 0.7 });
      g.moveTo(0, 0.1).lineTo(0, top - 0.3).stroke({ width: 0.08, color: hexNum(glow), alpha: 0.25 });
      g.roundRect(-0.8, top - 0.3, 1.6, 0.3, 0.12).fill(hexNum(post));
      const heights = [top - 0.7, top - 1.6, top - 2.7];
      heights.forEach((ry, i) => {
        if (ry < 0.5) return;
        const rx = 0.9 - i * 0.15;
        g.ellipse(0, ry, rx, rx * 0.28).stroke({ width: 0.12, color: hexNum(post) });
        g.ellipse(0, ry, rx, rx * 0.28).stroke({ width: 0.05, color: hexNum(glow), alpha: 0.9 });
        ctx.glows.push({ x: 0, y: ry, r: rx, color: glow });
      });
      break;
    }
    case 'pole': {
      // Jahrmarkt: Zuckerstangen (rosa/weiß), ab 5 m zwei Stangen mit Querbalken und Glühbirnen, sonst Kugel und Wimpel
      const feet = footOffsets('pole', p.h);
      const stripeA = atmosphere(world.palette.accent, z, sky);
      const stripeB = atmosphere('#fff6f0', z, sky);
      for (const fx of feet) {
        g.ellipse(fx, 0.05, 0.42, 0.12).fill(hexNum(ink));
        g.moveTo(fx, 0).lineTo(fx, top).stroke({ width: 0.34, color: hexNum(ink), cap: 'round' });
        for (let y = 0; y < top; y += 0.6) {
          const y1 = Math.min(top, y + 0.6);
          g.moveTo(fx, y).lineTo(fx, y1).stroke({ width: 0.26, color: hexNum(Math.round(y / 0.6) % 2 === 0 ? stripeA : stripeB), cap: 'butt' });
        }
      }
      if (feet.length > 1) {
        g.rect(-0.95, top - 0.11, 1.9, 0.22).fill(hexNum(post)).stroke({ width: 0.06, color: hexNum(ink) });
        const bulbs = [world.palette.glow, '#ffffff', world.palette.accent];
        [-0.5, 0, 0.5].forEach((bx, i) => {
          g.moveTo(bx, top - 0.11).lineTo(bx, top - 0.35).stroke({ width: 0.04, color: hexNum(ink) });
          g.circle(bx, top - 0.45, 0.12).fill(hexNum(bulbs[i]));
          ctx.glows.push({ x: bx, y: top - 0.45, r: 0.35, color: bulbs[i] });
        });
      } else {
        g.circle(0, top - 0.45, 0.24).fill(hexNum(glow)).stroke({ width: 0.05, color: hexNum(ink) });
        g.moveTo(0.17, top - 0.4).lineTo(0.17, top - 1.3).stroke({ width: 0.04, color: hexNum(ink) });
        g.poly([0.17, top - 0.45, 0.95, top - 0.75, 0.17, top - 1.05]).fill(hexNum(world.palette.accent));
        ctx.glows.push({ x: 0, y: top - 0.45, r: 0.5, color: glow });
      }
      break;
    }
  }
  return c;
}
