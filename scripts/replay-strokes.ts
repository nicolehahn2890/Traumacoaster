/**
 * Aufgezeichnete Striche nachspielen (Strich-Rekorder im Dev-Server, recordings/strokes.jsonl): jeder neue Strich
 * läuft durch alle vier Lesarten (Pinsel, Bühne, Ein Strich, Ebenen) und wird gefahren. Fortsetzen und Überzeichnen
 * brauchen die Bahn davor und laufen nur in der aufgezeichneten Lesart. Für „Ebenen“ gilt die beim Aufsetzen gewählte
 * Ebene (ältere Aufnahmen: keine).
 *   npm run strokes:replay                      # alle Striche
 *   npm run strokes:replay -- --last 5          # die letzten fünf
 *   npm run strokes:replay -- datei.jsonl
 *   npm run strokes:replay -- --persp         # in Perspektive (Richtlinie, Schritt 1): Kamera je Strich fest im Strichzentrum,
 *                                              #   sofern die Aufnahme keine Kamera je Punkt enthält (points[3..4])
 *   npm run strokes:replay -- --world         # wie --persp, dazu je Pinsel-Bahn das Bahnprofil und die Stützen des Weltrenderers
 *                                              #   (nur Geometrie: Teile, Dreiecke, endliche Werte, Füße je Fundament) und bei neuen
 *                                              #   Strichen der Abstand der Bahnknoten vom Strich im Bild der Weltkamera (Median, Maximum)
 */
import { readFileSync } from 'node:fs';
import { getLevel } from '../src/levels/levels';
import { worldOfLevel } from '../src/levels/worlds';
import type { LevelDef } from '../src/levels/types';
import { Terrain } from '../src/physics/terrain';
import { SKIN_PHYSICS, TrainSim, simOptionsForLevel } from '../src/physics/trainSim';
import { sampleTrack, type TrackPath } from '../src/track/model';
import { extendTrack, lanesTrack, strokeToTrack } from '../src/track/strokeToTrack';
import { applyOverdraw } from '../src/track/overdraw';
import { RubberBrush } from '../src/track/brush';
import { BrushRefiner, joinLines, planBrushTrack, spliceLine, trackLine, trackLineWithDepth } from '../src/track/brushTrack';
import { setPerspective, setView, viewDistance, type StagePoint } from '../src/track/stage';
import { railBanksFor } from '../src/track/model';
import { trackFrames } from '../src/world/trackMesh';
import { buildTrack } from '../src/world/trackBuilder';
import { trackTypeForSkin } from '../src/world/trackTypes';
import { WorldCamera } from '../src/world/camera';
import { TerrainFoundation } from '../src/world/foundations';
import { buildWorldSupports, planWorldSupports } from '../src/world/supports';
import type { InstancedMesh, Mesh } from 'three';

type Reading = 'brush' | 'stage' | 'single' | 'lanes';
interface Rec {
  at: string;
  level: number;
  reading: Reading;
  kind: 'new' | 'extend' | 'overdraw';
  armed?: number | null;
  auto?: boolean;
  zoom: number;
  screen: [number, number];
  points: Array<[number, number, number] | [number, number, number, number, number]>;
  persp?: number;
  before: TrackPath | null;
  result: { nodes: number; closed: boolean; length: number } | null;
}

const args = process.argv.slice(2);
const WORLD = args.includes('--world');
const PERSP = args.includes('--persp') || WORLD;
const lastIdx = args.indexOf('--last');
const last = lastIdx >= 0 ? Number(args[lastIdx + 1]) : 0;
const file = args.find((a, i) => !a.startsWith('--') && (lastIdx < 0 || i !== lastIdx + 1)) ?? 'recordings/strokes.jsonl';
const NAME: Record<Reading, string> = { brush: 'Pinsel', stage: 'Bühne', single: 'Ein Strich', lanes: 'Ebenen' };
const FAIL: Record<string, string> = { derail: 'entgleist', fall: 'Fahrgäste fallen', stall: 'bleibt stehen', eject: 'Rauswurf', water: 'Wasser', ejectSide: 'Rauswurf seitlich', openEnd: 'Absperrband (offenes Ende)', crossing: 'Kreuzung', chain: 'Kette reicht nicht' };

let recs: Rec[] = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as Rec);
if (last > 0) recs = recs.slice(-last);

const fixNaN = (p: TrackPath | null): TrackPath | null => {
  if (!p) return p;
  for (const n of p.nodes) if (n.roll === null || n.roll === undefined) n.roll = NaN;
  return p;
};

function levelOf(id: number): { level: LevelDef; skin: string } {
  try {
    return { level: getLevel(id), skin: worldOfLevel(id).skin };
  } catch {
    // Sandbox (id 0) oder unbekannt: breite, flache Bühne
    return { level: { id: 0, world: 1, name: 'Sandbox', hook: '', goals: [], width: 200, terrain: [{ kind: 'flat' }], cars: 3, passengers: 6 } as unknown as LevelDef, skin: 'skinWood' };
  }
}

function build(rec: Rec, reading: Reading, level: LevelDef, terrain: Terrain, skin: string): { path: TrackPath | null; note: string } {
  let stroke: StagePoint[] = rec.points.map(([X, Y]) => ({ X, Y }));
  if (PERSP) {
    // Kamera: wie aufgezeichnet (Punkt 4/5), sonst für den ganzen Strich fest im Strichzentrum
    let cx = 0;
    let cy = 0;
    for (const p of stroke) {
      cx += p.X / stroke.length;
      cy += p.Y / stroke.length;
    }
    setPerspective(true, rec.persp ?? 18);
    setView(cx, cy, viewDistance(rec.zoom, rec.screen[1]));
    stroke = rec.points.map((p) => (p.length >= 5 ? { X: p[0], Y: p[1], cx: p[3], cy: p[4] } : { X: p[0], Y: p[1], cx, cy }));
  } else setPerspective(false);
  const ground = (x: number, z: number) => terrain.groundHeight(x, z);
  const closeSnap = Math.max(8, 60 / rec.zoom);
  const before = fixNaN(rec.before);
  if (reading === 'brush') {
    const b = new RubberBrush(stroke[0], 22 / rec.zoom);
    for (const p of stroke.slice(1)) b.move(p);
    let line = b.finish();
    let keep: Float64Array | undefined;
    if (before && rec.kind === 'extend') {
      // wie im Spiel: Die alte Bahn behält beim Fortsetzen ihre Tiefe
      const base = trackLineWithDepth(sampleTrack(before, 0.25));
      line = joinLines(base.line, line);
      keep = base.z;
    } else if (before && rec.kind === 'overdraw') line = spliceLine(trackLine(sampleTrack(before, 0.25)), line, Math.max(2, 30 / rec.zoom));
    const opts = { ground, clearance: 0.8, closeSnap, tolerance: Math.max(0.4, 8 / rec.zoom) };
    const plan = planBrushTrack(line, opts, keep);
    if (!plan) return { path: null, note: 'zu kurz' };
    const limit = (SKIN_PHYSICS[skin] ?? SKIN_PHYSICS.skinWood).lateralLimit;
    const ref = new BrushRefiner(plan, opts, (path, samples) => new TrainSim(samples, path, { ...simOptionsForLevel(level, path, terrain, skin, true), lateralLimit: Infinity, checkCrossings: false }), limit);
    while (!ref.run(1000));
    const spots = ref.accepted.map((a) => `${Math.round(a.s)} m ${FAIL[a.reason] ?? a.reason}`);
    return { path: ref.best, note: `${plan.crossings.length} Kreuzungen, ${ref.repaired} nachgebessert${spots.length ? `, hingenommen: ${spots.join(', ')}` : ''}` };
  }
  const opts = { groundHeight: ground, groundClearance: 0.8, maxHeight: level.maxHeight ?? 0, allowTurns: true, allowLoops: true, closeSnap, single: reading === 'single' };
  if (reading === 'lanes' && rec.kind !== 'overdraw') {
    const armed = rec.reading === 'lanes' ? (rec.armed ?? null) : null;
    const auto = rec.reading === 'lanes' && !!rec.auto;
    return { path: lanesTrack(rec.kind === 'extend' ? before : null, stroke, opts, armed, undefined, auto), note: [armed !== null ? `Ebene ${armed}` : '', auto ? 'Auto' : ''].filter(Boolean).join(', ') };
  }
  if (before && rec.kind === 'extend') return { path: extendTrack(before, stroke, opts), note: '' };
  if (before && rec.kind === 'overdraw') return { path: applyOverdraw(before, stroke, { ...opts, snapDistance: 30 / rec.zoom }), note: '' };
  const r = strokeToTrack(stroke, opts);
  return { path: r.path.nodes.length >= 2 ? r.path : null, note: r.events.length ? r.events.map((e) => (e.kind === 'loop' ? 'Looping' : 'Kehre')).join(', ') : '' };
}

/** Kamera eines Strichs: Mittelpunkt der Punkte; Aufnahmen mit Kamera je Punkt (Autoscroll) tragen points[3..4] */
function strokeCamera(rec: Rec): { cx: number; cy: number; perPoint: boolean } {
  let cx = 0;
  let cy = 0;
  for (const p of rec.points) {
    cx += p[0] / rec.points.length;
    cy += p[1] / rec.points.length;
  }
  return { cx, cy, perPoint: rec.points.some((p) => p.length >= 5) };
}

const segDist = (q: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t));
};

const worldTally = { built: 0, invalid: 0, medians: [] as number[], max: 0, supports: 0, floating: 0 };

/**
 * Weltrenderer: Bahnprofil aus dem Bahnmodell bauen (nur Geometrie, ohne WebGL) und prüfen, dann die Bahnknoten durch die
 * Weltkamera auf den Bildschirm projizieren und ihren Abstand zum gezeichneten Strich messen (Kamera fest im Strichzentrum
 * wie beim Nachspielen; der Rundenschluss zählt mit, deshalb Median und Maximum).
 */
function worldCheck(path: TrackPath, rec: Rec, skin: string, terrain: Terrain): string {
  const samples = sampleTrack(path, 0.25);
  const frames = trackFrames(samples, railBanksFor(samples));
  const type = trackTypeForSkin(skin);
  const group = buildTrack(frames, samples.length, type);
  const { plans, stats } = planWorldSupports(samples, frames, type, [new TerrainFoundation(terrain)], (x, y, z) => terrain.insideMountain(x, y, z));
  group.add(buildWorldSupports(plans, type));
  worldTally.supports += plans.length;
  worldTally.floating += stats.floating;
  let tris = 0;
  let parts = 0;
  let valid = true;
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.geometry) return;
    parts++;
    const pos = m.geometry.getAttribute('position');
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) {
        valid = false;
        break;
      }
    }
    const inst = (m as InstancedMesh).isInstancedMesh ? (m as InstancedMesh).count : 1;
    tris += (m.geometry.index ? m.geometry.index.count / 3 : pos.count / 3) * inst;
  });
  worldTally.built++;
  if (!valid) worldTally.invalid++;
  const { cx, cy, perPoint } = strokeCamera(rec);
  const feet = `Stützen ${plans.length} (Boden ${stats.ground}, Fels ${stats.rock}, schwebend ${stats.floating}, zu kurz ${stats.skipped})`;
  // Abstand zum Strich nur bei neuen Strichen (fortgesetzte und überzeichnete Bahnen enthalten die alte Bahn)
  let dev = rec.kind === 'new' ? ', Strich: Kamera je Punkt, kein Maß' : '';
  if (!perPoint && rec.kind === 'new') {
    const cam = new WorldCamera();
    cam.set({ cx, cy, zoom: rec.zoom, width: rec.screen[0], height: rec.screen[1], persp: true, fov: rec.persp ?? 18 });
    const px = (X: number, Y: number) => ({ x: (X - cx) * rec.zoom + rec.screen[0] / 2, y: rec.screen[1] / 2 - (Y - cy) * rec.zoom });
    const line = rec.points.map((p) => px(p[0], p[1]));
    const dists: number[] = [];
    for (const node of path.nodes) {
      if (node.kind === 'closeTurn' || node.kind === 'closeReturn') continue;
      const q = cam.toScreen(node.x, node.y, node.z);
      let best = line.length === 1 ? Math.hypot(q.x - line[0].x, q.y - line[0].y) : Infinity;
      for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segDist(q, line[i], line[i + 1]));
      dists.push(best);
    }
    if (dists.length) {
      dists.sort((a, b) => a - b);
      const median = dists[Math.floor(dists.length / 2)];
      const max = dists[dists.length - 1];
      worldTally.medians.push(median);
      worldTally.max = Math.max(worldTally.max, max);
      dev = `, Strich: Median ${median.toFixed(1)} px, max ${max.toFixed(1)} px`;
    }
  }
  return `Welt: ${parts} Teile, ${(tris / 1000).toFixed(1)}k Dreiecke, ${feet}${valid ? '' : ', UNGÜLTIGE WERTE'}${dev}`;
}

function ride(path: TrackPath, level: LevelDef, terrain: Terrain, skin: string): { ok: boolean; text: string } {
  path.startType ||= 'chainlift';
  const samples = sampleTrack(path, 0.25);
  const sim = new TrainSim(samples, path, simOptionsForLevel(level, path, terrain, skin, true));
  for (let i = 0; i < 60 * 180 && !sim.finished; i++) sim.step(1 / 60);
  const kmh = Math.round(sim.stats.maxSpeed * 3.6);
  const lat = sim.stats.maxLatG.toFixed(1);
  if (sim.phase === 'done') return { ok: true, text: `geschafft, ${kmh} km/h, ${lat} g quer` };
  const at = Math.round(((sim.cars[0].s % samples.length) + samples.length) % samples.length);
  const why = FAIL[sim.failReason ?? ''] ?? sim.failReason ?? 'Zeit um';
  return { ok: sim.failReason === 'openEnd', text: `${why} bei ${at} m, ${kmh} km/h, ${lat} g quer` };
}

const tally: Record<Reading, { ok: number; n: number }> = { brush: { ok: 0, n: 0 }, stage: { ok: 0, n: 0 }, single: { ok: 0, n: 0 }, lanes: { ok: 0, n: 0 } };
recs.forEach((rec, k) => {
  const { level, skin } = levelOf(rec.level);
  const terrain = new Terrain(level);
  const kindText = rec.kind === 'new' ? 'neu' : rec.kind === 'extend' ? 'fortgesetzt' : 'überzeichnet';
  const secs = (rec.points[rec.points.length - 1][2] / 1000).toFixed(1);
  console.log(`\n#${k + 1} ${rec.at.slice(0, 16).replace('T', ' ')} · Level ${rec.level} · gezeichnet: ${NAME[rec.reading]} · ${kindText} · ${rec.points.length} Punkte in ${secs} s · Zoom ${rec.zoom}`);
  const readings: Reading[] = rec.kind === 'new' ? ['brush', 'stage', 'single', 'lanes'] : [rec.reading];
  for (const reading of readings) {
    let line: string;
    try {
      const { path, note } = build(rec, reading, level, terrain, skin);
      if (!path) line = 'keine Bahn' + (note ? ` (${note})` : '');
      else {
        const s = sampleTrack(path, 0.25);
        const r = ride(path, level, terrain, skin);
        tally[reading].n++;
        if (r.ok) tally[reading].ok++;
        line = `${path.nodes.length} Knoten, ${Math.round(s.length)} m, ${path.closed !== false ? 'geschlossen' : 'offen'}${note ? ` (${note})` : ''} | Fahrt: ${r.text}`;
        if (WORLD && reading === 'brush') line += ` | ${worldCheck(path, rec, skin, terrain)}`;
      }
    } catch (e) {
      line = `Fehler: ${(e as Error).message}`;
    }
    console.log(`  ${NAME[reading].padEnd(10)}: ${line}`);
  }
});
console.log('\nFahrt geschafft (offenes Ende zählt als geschafft):');
for (const r of ['brush', 'stage', 'single', 'lanes'] as Reading[]) console.log(`  ${NAME[r].padEnd(10)}: ${tally[r].ok} von ${tally[r].n}`);
if (WORLD) {
  const med = [...worldTally.medians].sort((a, b) => a - b);
  const mid = med.length ? med[Math.floor(med.length / 2)] : NaN;
  console.log(`\nWeltrenderer: ${worldTally.built} Bahnprofile gebaut, ${worldTally.invalid} mit ungültigen Werten, ${worldTally.supports} Stützen (${worldTally.floating} Stellen ohne Fundament); Abstand Bahn–Strich (${med.length} neue Striche mit fester Kamera): Median der Mediane ${mid.toFixed(1)} px, größtes Maximum ${worldTally.max.toFixed(1)} px`);
}
