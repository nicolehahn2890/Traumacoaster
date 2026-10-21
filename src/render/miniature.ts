/**
 * Miniatur eines Levels für die Karte: dieselbe Bühne wie im Level (Bodenstreifen, Berge, Wasser, Coins),
 * darauf die Bahn, die dort gebaut wurde, mit dem Zug in der Station. Gerendert in eine Textur, die auf der
 * Karte auf die Drehscheibe gebogen wird. Weil Miniatur und Level dieselben Bühnen-Meter benutzen, kann der
 * Übergang die Miniatur nahtlos zum Level aufziehen.
 */
import { Container, Graphics, RenderTexture, type Renderer } from 'pixi.js';
import { getLevel, unlockedUpTo } from '@/levels/levels';
import { worldOfLevel } from '@/levels/worlds';
import type { ElementId, LevelDef, WorldDef } from '@/levels/types';
import { Terrain } from '@/physics/terrain';
import { TrainSim, simOptionsForLevel } from '@/physics/trainSim';
import { sampleTrack, type TrackPath } from '@/track/model';
import { laneRise, toStage, LANE_MIN, LANE_MAX } from '@/track/stage';
import { storage } from '@/core/storage';
import { devSkin, unlockAll } from '@/core/dev';
import { WorldView } from './worldView';

/** Bodenlinie der hintersten Spur: Sie liegt auf der Oberfläche der Drehscheibe (der Horizont des Levels) */
export const HORIZON_Y = laneRise(LANE_MAX);
/** Unterkante der Miniatur (knapp unter der vordersten Bodenlinie) */
export const MINI_BOTTOM = laneRise(LANE_MIN) - 5;
/** Auflösung der Miniatur-Texturen (Pixel pro Bühnen-Meter) und Obergrenze der Texturgröße */
const MINI_PPM = 8;
const MAX_TEX_W = 1200;
const MAX_TEX_H = 900;
/** So viele Miniaturen bleiben als Textur im Speicher */
const CACHE_SIZE = 28;

/** Ausschnitt in Bühnen-Metern */
export interface MiniBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Miniature {
  texture: RenderTexture;
  bounds: MiniBounds;
  /** Liegt in diesem Level schon eine Bahn? */
  built: boolean;
}

/** Gespeicherte Bahn eines Levels (wie beim Öffnen des Levels geprüft) */
export function levelDraft(levelId: number): TrackPath | null {
  const d = storage.draft(levelId);
  return d && d.nodes.length >= 2 && 'inZ' in d.nodes[0] ? d : null;
}

/** Skin wie im Level: Welt-Skin, sonst der beste freigeschaltete */
function pickSkin(world: WorldDef, unlocked: Set<ElementId>): string {
  const forced = devSkin();
  if (forced) return forced;
  if (unlocked.has(world.skin)) return world.skin;
  const order: ElementId[] = ['skinSpace', 'skinLava', 'skinGhost', 'skinIce', 'skinNeon', 'skinGold', 'skinSteel', 'skinMine', 'skinHybrid', 'skinWood'];
  return order.find((s) => unlocked.has(s)) ?? 'skinWood';
}

function unlockedFor(levelId: number): Set<ElementId> {
  if (unlockAll()) return unlockedUpTo(150);
  return unlockedUpTo(Math.max(storage.progress.highest, levelId - 1));
}

/**
 * Ausschnitt der Miniatur: ganze Spielfeldbreite, unten bis knapp unter die vorderste Spur, oben bis über
 * Bahn, Berge und Coins. Die Bahn wird über ihre Kontrollpunkte abgeschätzt (die Kurve liegt in deren Hülle).
 */
export function miniBounds(level: LevelDef, terrain: Terrain, path: TrackPath | null): MiniBounds {
  let minX = -6;
  let maxX = level.width + 6;
  let top = HORIZON_Y + 6;
  for (let z = LANE_MIN; z <= LANE_MAX; z++) {
    for (let x = 0; x <= level.width; x += 2) top = Math.max(top, toStage(x, terrain.surfaceHeight(x, z), z).Y);
  }
  for (const c of level.coins ?? []) {
    const lane = c.lane ?? 0;
    top = Math.max(top, toStage(c.x, terrain.groundHeight(c.x, lane) + c.y, lane).Y + 1.5);
  }
  if (path) {
    for (const n of path.nodes) {
      for (const p of [toStage(n.x, n.y, n.z), toStage(n.x + n.inX, n.y + n.inY, n.z + n.inZ), toStage(n.x + n.outX, n.y + n.outY, n.z + n.outZ)]) {
        top = Math.max(top, p.Y + 3);
        minX = Math.min(minX, p.X - 4);
        maxX = Math.max(maxX, p.X + 4);
      }
    }
  }
  return { minX, maxX, minY: MINI_BOTTOM, maxY: top + 2 };
}

/** Kurzer Fingerabdruck der Bahn: Ändert sich die Bahn, wird die Miniatur neu gerendert */
function draftKey(path: TrackPath | null, skin: string): string {
  if (!path) return `-|${skin}`;
  const s = JSON.stringify(path);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}:${h >>> 0}|${skin}`;
}

const cache = new Map<number, { key: string; mini: Miniature }>();

/** Aktuelle Miniatur aus dem Speicher, ohne zu rendern (null, wenn keine oder veraltet) */
export function cachedMiniature(levelId: number): Miniature | null {
  const e = cache.get(levelId);
  if (!e) return null;
  const key = draftKey(levelDraft(levelId), pickSkin(worldOfLevel(levelId), unlockedFor(levelId)));
  if (e.key !== key) return null;
  // zuletzt benutzt: Sichtbare Miniaturen fallen so nie aus dem Speicher
  cache.delete(levelId);
  cache.set(levelId, e);
  return e.mini;
}

/** Miniatur holen (aus dem Speicher oder frisch gerendert) */
export function getMiniature(renderer: Renderer, levelId: number): Miniature {
  const path = levelDraft(levelId);
  const unlocked = unlockedFor(levelId);
  const world = worldOfLevel(levelId);
  const skin = pickSkin(world, unlocked);
  const key = draftKey(path, skin);
  const hit = cache.get(levelId);
  if (hit && hit.key === key) {
    cache.delete(levelId);
    cache.set(levelId, hit);
    return hit.mini;
  }
  if (hit) {
    cache.delete(levelId);
    hit.mini.texture.destroy(true);
  }
  const mini = render(renderer, getLevel(levelId), world, skin, unlocked, path);
  cache.set(levelId, { key, mini });
  while (cache.size > CACHE_SIZE) {
    const [id, old] = cache.entries().next().value!;
    cache.delete(id);
    old.mini.texture.destroy(true);
  }
  return mini;
}

function render(renderer: Renderer, level: LevelDef, world: WorldDef, skin: string, unlocked: Set<ElementId>, path: TrackPath | null): Miniature {
  const terrain = new Terrain(level);
  const view = new WorldView(world, terrain, skin, false);
  view.trackR.setCoins(level.coins ?? []);
  const allowTunnels = unlocked.has('tunnel');
  if (path) {
    const samples = sampleTrack(path, 0.25);
    view.setTrack(path, samples, skin, terrain, allowTunnels, false);
    // Zug ohne Fahrgäste in der Station
    try {
      const opts = simOptionsForLevel(level, path, terrain, skin, allowTunnels);
      const sim = new TrainSim(samples, path, opts);
      view.buildTrain(opts.cars, [], 0);
      view.updateTrain(sim.cars, [], 0);
    } catch {
      /* ohne Zug */
    }
  }
  const b = miniBounds(level, terrain, path);
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const ppm = Math.min(MINI_PPM, MAX_TEX_W / bw, MAX_TEX_H / bh);
  const tw = Math.ceil(bw * ppm);
  const th = Math.ceil(bh * ppm);
  const cam = view.camera;
  cam.minZoom = 0.1;
  cam.resize(tw, th);
  cam.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, ppm);
  view.update(0);
  const holder = new Container();
  holder.addChild(view.world);
  const texture = RenderTexture.create({ width: tw, height: th, resolution: 1, antialias: true });
  renderer.render({ container: holder, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
  // Ränder weich ausblenden: links und rechts über den Rand des Spielfelds, unten über drei Meter
  const fade = new Graphics();
  fade.blendMode = 'erase';
  const fw = Math.min(tw * 0.2, 7 * ppm);
  const fb = 3 * ppm;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = 1 - (i + 0.5) / steps;
    const alpha = a * a * (3 - 2 * a);
    const x = (i * fw) / steps;
    fade.rect(x, 0, fw / steps + 0.5, th).fill({ color: 0x000000, alpha });
    fade.rect(tw - x - fw / steps - 0.5, 0, fw / steps + 0.5, th).fill({ color: 0x000000, alpha });
    fade.rect(0, th - (i * fb) / steps - fb / steps - 0.5, tw, fb / steps + 0.5).fill({ color: 0x000000, alpha });
  }
  // Der Blend-Modus wirkt nur unterhalb der gerenderten Wurzel, darum in einem Eltern-Container
  const fadeRoot = new Container();
  fadeRoot.addChild(fade);
  renderer.render({ container: fadeRoot, target: texture, clear: false });
  fadeRoot.destroy({ children: true });
  holder.destroy({ children: true });
  view.destroy();
  return { texture, bounds: b, built: !!path };
}
