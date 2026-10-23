/**
 * Aufgezeichnete Striche nachspielen (Strich-Rekorder im Dev-Server, recordings/strokes.jsonl): jeder neue Strich
 * läuft durch alle vier Lesarten (Pinsel, Bühne, Ein Strich, Ebenen) und wird gefahren. Fortsetzen und Überzeichnen
 * brauchen die Bahn davor und laufen nur in der aufgezeichneten Lesart. Für „Ebenen“ gilt die beim Aufsetzen gewählte
 * Ebene (ältere Aufnahmen: keine).
 *   npm run strokes:replay                      # alle Striche
 *   npm run strokes:replay -- --last 5          # die letzten fünf
 *   npm run strokes:replay -- datei.jsonl
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
import type { StagePoint } from '../src/track/stage';

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
  points: Array<[number, number, number]>;
  before: TrackPath | null;
  result: { nodes: number; closed: boolean; length: number } | null;
}

const args = process.argv.slice(2);
const lastIdx = args.indexOf('--last');
const last = lastIdx >= 0 ? Number(args[lastIdx + 1]) : 0;
const file = args.find((a, i) => !a.startsWith('--') && (lastIdx < 0 || i !== lastIdx + 1)) ?? 'recordings/strokes.jsonl';
const NAME: Record<Reading, string> = { brush: 'Pinsel', stage: 'Bühne', single: 'Ein Strich', lanes: 'Ebenen' };
const FAIL: Record<string, string> = { derail: 'entgleist', fall: 'Fahrgäste fallen', stall: 'bleibt stehen', eject: 'Rauswurf', water: 'Wasser', ejectSide: 'Rauswurf seitlich', openEnd: 'Absperrband (offenes Ende)', crossing: 'Kreuzung' };

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
  const stroke: StagePoint[] = rec.points.map(([X, Y]) => ({ X, Y }));
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
      }
    } catch (e) {
      line = `Fehler: ${(e as Error).message}`;
    }
    console.log(`  ${NAME[reading].padEnd(10)}: ${line}`);
  }
});
console.log('\nFahrt geschafft (offenes Ende zählt als geschafft):');
for (const r of ['brush', 'stage', 'single', 'lanes'] as Reading[]) console.log(`  ${NAME[r].padEnd(10)}: ${tally[r].ok} von ${tally[r].n}`);
