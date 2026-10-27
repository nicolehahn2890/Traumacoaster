/**
 * Szenario-Test für das Bühnen-Zeichnen v2 (Boden = Tiefe, steil = Höhe):
 *  1. flaches Oval am Boden → 2 Kurven, 3 Spuren, kein Looping; Fahrt mit Schräglage bis ins Ziel
 *  2. steiler Hügel mit Kehre in der Höhe → 1 Steilkurve in die Nachbarspur, Wagen nie kopfüber
 *  3. Looping in der Luft → 1 Looping, Fahrt kopfüber und wieder aufrecht
 *  4. Löschen-Knopf, Überzeichnen (Hügel in eine flache Bahn)
 *  7. Bearbeiten: Segment ziehen (Bahn durch den Finger, Knoten bleiben), Langdruck zeigt Profi-Handles
 * 10. Zone: Prüfzone im Weltrenderer (Station, Vorgabestück, Coins, Feld, Zeichenaufrufe, Standbild)
 * Screenshots nach screenshots/scenario-*.png. Nutzt einen vorbereiteten Spielstand (Welt 1 fast komplett).
 * Läuft in der Lesart „Bühne“ (`&stage` in der Adresse), für die die Erwartungen geschrieben sind (Standard ist der
 * Pinsel), und ohne Autoscroll (`&scroll=0`): Die Striche liegen in festen Bildschirmkoordinaten, ein mitlaufendes Bild
 * verzerrte sie.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';

const BASE = process.env.TC_URL ?? 'http://localhost:4173/';
/** Nur einzelne Schritte: node scripts/scenario.mjs 3 5 */
const ONLY = process.argv.slice(2);
const want = (step) => ONLY.length === 0 || ONLY.includes(step);
mkdirSync('screenshots', { recursive: true });
let server = null;
const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i++) await sleep(500);
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  const stars = {};
  for (let i = 1; i <= 14; i++) stars[i] = 1;
  localStorage.setItem('traumacoaster.v1', JSON.stringify({ progress: { stars, highest: 14, current: 8, drafts: {} } }));
});
const page = await ctx.newPage();
const errors = [];
const failures = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.error('CONSOLE', m.text()); } });
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.error('CHECK FAILED:', msg); } else console.log('ok:', msg); };

/** Bühnen-Meter → Bildschirm-Pixel über die Kamera der Szene */
const toScreen = (pts) => page.evaluate((pts) => pts.map(([X, Y]) => { const p = window.tcGame.current.view.camera.toScreen(X, Y); return [p.x, p.y]; }), pts);

/** Weicher Strich: Catmull-Rom durch die Stützpunkte, wie ein echter Finger; onMid läuft nach der Hälfte der Punkte */
async function stroke(points, steps = 8, onMid = null) {
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (let i = 0; i < points.length - 1; i++) {
    if (onMid && i === Math.floor((points.length - 1) / 2)) await onMid();
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      await page.mouse.move(x, y);
    }
  }
  await page.mouse.up();
}
/** Strich in Bühnen-Metern (X, Y) */
const strokeStage = async (pts, steps = 8, onMid = null) => stroke(await toScreen(pts), steps, onMid);

const state = () => page.evaluate(() => {
  const s = window.tcGame.current;
  const car = s?.sim?.cars?.[0];
  return {
    scene: s?.constructor?.name, mode: s?.mode, nodes: s?.path?.nodes?.length ?? 0,
    loops: s?.stats?.loops, turns: s?.stats?.turns, lanes: s?.stats?.lanes, height: s?.stats?.maxHeight?.toFixed(1),
    sticker: !!(s?.sticker?.visible && s.sticker.alpha > 0), particles: s?.view?.effects?.count ?? 0,
    sim: s?.sim ? { phase: s.sim.phase, fail: s.sim.failReason, flight: s.sim.flight?.kind ?? null, t: s.sim.t.toFixed(1), coins: s.sim.stats.coins, maxG: s.sim.stats.maxG.toFixed(1), maxLat: s.sim.stats.maxLatG.toFixed(2), maxSpeed: (s.sim.stats.maxSpeed * 3.6).toFixed(0), inversions: s.sim.stats.inversions } : null,
    car: car ? { z: car.z.toFixed(2), bank: ((car.bank * 180) / Math.PI).toFixed(0), upy: car.upy.toFixed(2), y: car.y.toFixed(1) } : null,
  };
});

/** Fahrt bis zum Ergebnis; sammelt min(upy) und max|bank| des ersten Wagens */
async function ride(tag, shotAt = 6) {
  // min(upy) und max|bank| im Seitenkontext pro Frame sammeln (die Fahrt läuft im Zeitraffer, Polling wäre zu grob)
  await page.evaluate(() => {
    window.__ride = { minUp: 1, maxBank: 0 };
    const tick = () => {
      const car = window.tcGame?.current?.sim?.cars?.[0];
      if (car) {
        window.__ride.minUp = Math.min(window.__ride.minUp, car.upy);
        window.__ride.maxBank = Math.max(window.__ride.maxBank, Math.abs((car.bank * 180) / Math.PI));
      }
      if (window.tcGame?.current?.mode !== 'result') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.click(640, 800 - 56);
  let minUp = 1;
  let maxBank = 0;
  let shot = false;
  let st = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    st = await state();
    const acc = await page.evaluate(() => window.__ride);
    if (acc) {
      minUp = Math.min(minUp, acc.minUp);
      maxBank = Math.max(maxBank, acc.maxBank);
    }
    if (!shot && st.sim && Number(st.sim.t) >= shotAt) {
      shot = true;
      await page.screenshot({ path: `screenshots/scenario-${tag}-ride.png` });
    }
    if (i % 10 === 0) console.log('ride', tag, st.sim, st.car);
    if (st.mode === 'result') break;
  }
  await sleep(800);
  await page.screenshot({ path: `screenshots/scenario-${tag}-result.png` });
  return { st: await state(), minUp, maxBank };
}

const R = 4.2; // Bühnen-Meter pro Spur (Anhebung der Bodenlinie)
let st = null;
let r = null;
const openLevel = async (extra = '') => {
  await page.goto(`${BASE}?scene=start&fast=6&level=8&fx=1&stage&scroll=0${extra}`, { waitUntil: 'networkidle' });
  await sleep(1200);
};

await page.goto(`${BASE}?scene=start&fast=6&stage&scroll=0`, { waitUntil: 'networkidle' });
await sleep(800);

// ---------------------------------------------------------------- 1. Oval am Boden
if (want('1')) {
await openLevel();
console.log('state', await state());
// Gemeinsamer Himmel: das Level hat die Wolkenlage der Karte übernommen (gleiche Welt, Wolken vorhanden)
const skyState = await page.evaluate(() => window.tcGame.current.view.sky.exportState());
check(skyState.worldId === 1 && skyState.clouds.length > 3, `Himmel im Level übernommen (Welt ${skyState.worldId}, ${skyState.clouds.length} Wolken)`);
const oval = [[2, 0], [20, 0], [40, 0], [48, 0.3 * R], [50, R], [48, 1.7 * R], [40, 2 * R], [20, 2 * R], [2, 2 * R], [-6, 1.7 * R], [-8, R], [-6, 0.3 * R], [0, 0], [2, 0]];
await strokeStage(oval, 10);
await sleep(800);
st = await state();
console.log('after oval', st);
// Zeichenmodus: der Zug wartet in der Station, die Fahrgäste tuscheln (Cut-out-Animatoren)
const standing = await page.evaluate(() => ({ cars: window.tcGame.current.view.trainR.cars.length, anims: window.tcGame.current.view.trainR.animators.size, standCars: window.tcGame.current.standCars.length }));
check(standing.cars >= 1 && standing.cars === standing.standCars, `Stehender Zug in der Station (${standing.cars} Wagen)`);
check(standing.anims >= 2, `Fahrgäste des stehenden Zugs sind animiert (${standing.anims} Animatoren)`);
check(st.turns >= 2, `Oval: mindestens 2 Kurven (ist ${st.turns})`);
check(st.lanes >= 2, `Oval: mindestens 2 Spuren (vorne und hinten, ist ${st.lanes})`);
check(st.loops === 0, `Oval: kein Looping (ist ${st.loops})`);
check(Number(st.height) < 3, `Oval: bleibt am Boden (Höhe ${st.height})`);
await page.screenshot({ path: 'screenshots/scenario-1-oval.png' });
// Fahrt (ohne Hügel gibt es keinen Schwung → Stillstand erwartet)
r = await ride('1-oval', 2);
check(r.st.sim?.fail === 'stall', `Oval ohne Hügel: Zug rollt aus und bleibt stehen (ist ${r.st.sim?.fail})`);
}

// ---------------------------------------------------------------- 2. Hügel + Oval am Boden, Fahrt mit Schräglage
if (want('2')) {
await openLevel('&dev=1');
const hillOval = [[0, 0], [6, 1], [10, 6], [14, 13], [18, 14], [22, 11], [28, 3], [34, 0.3], [44, 0], [54, 0.3 * R], [56, R], [54, 1.7 * R], [44, 2 * R], [20, 2 * R], [2, 2 * R], [-6, 1.7 * R], [-8, R], [-6, 0.3 * R], [0, 0]];
await strokeStage(hillOval, 10);
await sleep(800);
st = await state();
// Draw-Call-Budget (Dev-Overlay): Bahn mit Pfeilern, Band-Mesh-Schienen, fünf Spur-Filtern und Leuchtebenen
const dev = await page.evaluate(() => window.tcGame.dev);
console.log('dev', dev);
check(dev && dev.drawCalls > 0 && dev.drawCalls < 150, `Draw-Calls im Zeichenmodus unter 150 (ist ${dev?.drawCalls})`);
const supports = await page.evaluate(() => [...window.tcGame.current.view.trackR.layers.supports.values()].reduce((n, c) => n + c.children.length, 0));
check(supports >= 8, `Pfeiler stehen unter dem Hügel (${supports} Pfeiler)`);
console.log('after hill+oval', st);
check(st.turns >= 2 && st.lanes >= 2 && st.loops === 0, `Hügel+Oval: mindestens 2 Kurven und 2 Spuren, 0 Loopings (ist ${st.turns}/${st.lanes}/${st.loops})`);
check(Number(st.height) > 11, `Hügel+Oval: Hügel ist Höhe (${st.height} m)`);
await page.screenshot({ path: 'screenshots/scenario-2-hill-oval.png' });
r = await ride('2-hill-oval', 9);
console.log('ride result', r);
check(r.st.sim?.phase === 'done', `Hügel+Oval: Fahrt kommt an (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
// nie kopfüber: die automatische Schräglage geht bis 80° (upy = cos 80° ≈ 0,17); der Rundkurs wird jetzt von Hand
// geschlossen und mit vollem Tempo durch die Schlusskurve gefahren, statt über den gebremsten Auto-Rückweg
check(r.minUp > 0.15, `Hügel+Oval: Wagen steht nie Kopf (min upy ${r.minUp})`);
check(r.maxBank > 15, `Hügel+Oval: Wagen legt sich in die Kurve (max Schräglage ${r.maxBank}°)`);
}

// ---------------------------------------------------------------- 3. Steilkurve in der Höhe
if (want('3')) {
await openLevel();
// Lifthügel, Drop auf 10 m, Kehre in der Höhe (Rückweg 2 m höher = nach hinten), Abfahrt auf die Bodenlinie der Spur 1.
// Der Rückweg kommt hinter der Station auf Spur 1 an und dreht dort in die Station (kein Auto-Rückweg mehr)
const hairpin = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 18], [24, 14], [30, 10], [40, 10], [46, 10.2], [50, 12], [46, 13.8], [40, 14], [26, 14], [18, 13.2], [10, 10], [2, 6], [-4, R + 0.3], [-7, R], [-8, 0.5 * R], [-6, 0.15 * R], [0, 0], [2, 0]];
await strokeStage(hairpin, 10);
await sleep(800);
st = await state();
console.log('after hairpin', st);
check(st.loops === 0, `Steilkurve: kein Looping (ist ${st.loops})`);
check(st.turns >= 1, `Steilkurve: mindestens 1 Kurve (ist ${st.turns})`);
check(st.lanes >= 2, `Steilkurve: mindestens 2 Spuren (ist ${st.lanes})`);
await page.screenshot({ path: 'screenshots/scenario-3-hairpin.png' });
r = await ride('3-hairpin', 7);
console.log('ride result', r);
check(r.minUp > -0.1, `Steilkurve: Wagen steht nie Kopf (min upy ${r.minUp}; steile Abfahrt kippt den Oben-Vektor mit)`);
check(r.st.sim?.phase === 'done', `Steilkurve: Fahrt kommt an (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
}

// ---------------------------------------------------------------- 4. Looping in der Luft
if (want('4')) {
await openLevel();
// Lifthügel 20 m, Looping mit Scheitel bei 13 m (genug Tempo oben), Auslauf auf den Boden
// Der Auslauf dreht am Boden auf Spur 2 und führt zurück in die Station (kein Auto-Rückweg mehr)
const loop = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 20], [26, 16], [34, 7], [40, 3], [46, 3.5], [50, 8], [48, 12.5], [43, 13], [38, 9], [40, 4], [46, 2], [60, 0.4], [70, 0.2], [76, 0.3 * R], [78, R], [76, 1.7 * R], [70, 2 * R], [40, 2 * R], [10, 2 * R], [-6, 1.7 * R], [-8, R], [-6, 0.3 * R], [0, 0], [2, 0]];
await strokeStage(loop, 10);
await sleep(800);
st = await state();
console.log('after loop', st);
check(st.loops === 1, `Looping: 1 Looping (ist ${st.loops})`);
check(st.lanes >= 2 && st.lanes <= 3, `Looping: Rückweg auf einer anderen Spur (Spuren ${st.lanes})`);
await page.screenshot({ path: 'screenshots/scenario-4-loop.png' });
r = await ride('4-loop', 8);
console.log('ride result', r);
check(r.minUp < -0.5, `Looping: Wagen fährt kopfüber (min upy ${r.minUp})`);
check(r.st.sim?.inversions === 1, `Looping: 1 Inversion gezählt (ist ${r.st.sim?.inversions})`);
check(r.st.sim?.phase === 'done', `Looping: Fahrt kommt an (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
}

// ---------------------------------------------------------------- 5. Löschen und Überzeichnen
if (want('5')) {
await openLevel();
// Vorschau: mitten im Strich sind schon Schienen gezeichnet (Breite der Schienen-Grafik der Spur 0 in Bühnen-Metern)
let previewWidth = 0;
await strokeStage([[0, 0], [20, 0.1], [40, 0], [60, 0.1]], 10, async () => {
  await sleep(300);
  previewWidth = await page.evaluate(() => window.tcGame.current.view.trackR.layers.rails.get(0).getLocalBounds().width);
  await page.screenshot({ path: 'screenshots/scenario-5-preview.png' });
});
check(previewWidth > 10, `Vorschau zeigt Schienen während des Strichs (Breite ${previewWidth.toFixed(1)} m)`);
await sleep(600);
st = await state();
check(st.nodes >= 2, `Flache Bahn gezeichnet (${st.nodes} Knoten)`);
await page.mouse.click(1280 - 36, 14 + 26); // Löschen-Knopf oben rechts
await sleep(500);
st = await state();
check(st.nodes === 0, `Löschen-Knopf räumt die Bahn weg (Knoten: ${st.nodes})`);
await strokeStage([[0, 0], [20, 0.1], [40, 0], [60, 0.1]], 10);
await sleep(600);
const lanesBefore = (await state()).lanes;
// Überzeichnen: auf der Bahn beginnen (Mindesthöhe 0,8 m), steiler Hügel, auf der Bahn enden
await strokeStage([[20, 0.8], [24, 2], [27, 8], [30, 11], [33, 8], [36, 2], [40, 0.8]], 10);
await sleep(800);
st = await state();
console.log('after overdraw', st);
check(Number(st.height) > 8, `Überzeichnen: Hügel eingebaut (Höhe ${st.height})`);
check(st.lanes === lanesBefore, `Überzeichnen: Spuren bleiben wie vorher (${lanesBefore} → ${st.lanes})`);
check(st.loops === 0, `Überzeichnen: kein Looping (ist ${st.loops})`);
// Offenes Ende: Absperrband steht, die Fahrt endet dort (Räder blockieren, Abflug), kein Auto-Rückweg
const barrierW = await page.evaluate(() => window.tcGame.current.view.trackR.layers.barriers.get(0).getLocalBounds().width);
check(barrierW > 1, `Absperrband am offenen Ende gezeichnet (Breite ${barrierW.toFixed(1)} m)`);
await page.screenshot({ path: 'screenshots/scenario-5-barrier.png' });
// Fahrgäste anschnallen: Ohne Gurt fliegt auf der Kuppe je nach Takt manchmal einer heraus, dann endet die Fahrt mit
// „Rauswurf“ statt am Absperrband (der Test schwankte); hier geht es nur um das offene Ende
await page.evaluate(() => { window.tcGame.current.level.restraint = 4; });
r = await ride('5-openend', 5);
console.log('ride result', r);
check(r.st.sim?.fail === 'openEnd', `Offenes Ende: Fahrt endet mit openEnd (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
check(r.st.sim?.phase === 'flying', `Offenes Ende: der Zug fliegt ab (Phase ${r.st.sim?.phase})`);
check(r.st.sim?.flight === 'launch', `Offenes Ende: mit Tempo → Abflug (Flugart ${r.st.sim?.flight})`);
await page.screenshot({ path: 'screenshots/scenario-5-overdraw.png' });
}

// ---------------------------------------------------------------- 6. Kreis von Hand schließen
if (want('6')) {
await openLevel();
// Hügel, kurze Kehre, Rückweg oberhalb zurück bis in die Station
const circuit = [[0, 0], [6, 1], [10, 7], [14, 15], [18, 16], [24, 12], [30, 5], [40, 4], [46, 5], [48, 8], [44, 9], [30, 9], [14, 9], [6, 7], [1, 2], [0, 0]];
await strokeStage(circuit, 10);
await sleep(800);
st = await state();
console.log('after circuit', st);
check(st.loops === 0, `Kreis von Hand: kein Looping (ist ${st.loops})`);
check(st.turns >= 1, `Kreis von Hand: Kehre erkannt (ist ${st.turns})`);
await page.screenshot({ path: 'screenshots/scenario-6-circuit.png' });
r = await ride('6-circuit', 6);
console.log('ride result', r);
check(r.minUp > -0.1, `Kreis von Hand: Wagen steht nie Kopf (min upy ${r.minUp})`);
check(r.st.sim?.phase === 'done', `Kreis von Hand: Fahrt kommt an (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
}

// ---------------------------------------------------------------- 7. Bearbeiten: Segment ziehen, Langdruck, Knotenmenü
if (want('7')) {
await openLevel();
// Live-Ziele: Level 8 verlangt 15 m Höhe; mitten im Strich (nach der Kuppe) muss das Ziel schon haken
let liveGoals = [];
await strokeStage([[0, 0], [8, 0.5], [16, 6], [24, 16], [32, 16.5], [40, 10], [50, 2], [60, 0.3], [70, 0]], 10, async () => {
  await sleep(400);
  liveGoals = await page.evaluate(() => window.tcGame.current.goalCells.map((c) => c.done));
  await page.screenshot({ path: 'screenshots/scenario-7-live.png' });
});
check(liveGoals[1] === true, `Live-Ziel: Höhe ≥ 15 m hakt schon während des Strichs (${JSON.stringify(liveGoals)})`);
const barrier7 = await page.evaluate(() => window.tcGame.current.view.trackR.layers.barriers.get(0).getLocalBounds().width);
check(barrier7 > 1, `Offener Hügel: Absperrband am Ende (Breite ${barrier7.toFixed(1)} m)`);
await sleep(800);
st = await state();
const n0 = st.nodes;
const h0 = Number(st.height);
check(n0 >= 3, `Hügel gezeichnet (${n0} Knoten)`);
// Anfasspunkt mitten in einem Segment (weit weg von Knoten): Abtastpunkt bei 35 % der Länge
const grab = await page.evaluate(() => {
  const s = window.tcGame.current;
  const sm = s.samples;
  const i = Math.floor(sm.count * 0.35);
  // Bühne aus Welt in Spur 0: X = x, Y = y (toStage mit Spur-Anhebung z·4,2)
  const scr = (j) => s.view.camera.toScreen(sm.x[j], sm.y[j] + sm.z[j] * 4.2);
  const p = scr(i);
  const a = scr(Math.max(0, i - 3));
  const b = scr(Math.min(sm.count - 1, i + 3));
  const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Normale zur Bahn (Bildschirm), nach oben zeigend: quer ziehen heißt biegen, längs heißt überzeichnen
  let nx = -(b.y - a.y) / tl;
  let ny = (b.x - a.x) / tl;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return { x: sm.x[i], y: sm.y[i], z: sm.z[i], sx: p.x, sy: p.y, nx, ny };
});
await page.mouse.move(grab.sx, grab.sy);
await page.mouse.down();
for (let k = 1; k <= 8; k++) await page.mouse.move(grab.sx + grab.nx * k * 8, grab.sy + grab.ny * k * 8);
await page.mouse.up();
await sleep(600);
st = await state();
console.log('after bend', st, grab);
check(st.nodes === n0, `Segment ziehen: Knotenzahl bleibt (${n0} → ${st.nodes})`);
check(Number(st.height) > h0 - 0.5, `Segment ziehen: Höhe nicht gesunken (${h0} → ${st.height})`);
const bent = await page.evaluate((g) => {
  // die Bahn läuft jetzt quer zur alten Richtung versetzt: kleinster Abstand des alten Anfasspunkts zur neuen Bahn
  const sm = window.tcGame.current.samples;
  let best = Infinity;
  for (let i = 0; i < sm.count; i++) best = Math.min(best, Math.hypot(sm.x[i] - g.x, sm.y[i] - g.y));
  return best;
}, grab);
check(bent > 2, `Segment ziehen: Bahn am Anfasspunkt um ${bent.toFixed(1)} m verschoben`);
await page.screenshot({ path: 'screenshots/scenario-7-bend.png' });
// Langdruck auf einen Knoten zeigt die Profi-Handles; vorher die Kamera zur Ruhe kommen lassen (sie führt nach
// einer Änderung weich nach, und die Knotenposition auf dem Bildschirm wandert mit)
await sleep(1500);
// Gedrückt wird auf die Trefferfläche des Knotens 1 (eng liegende Knoten werden für den Treffer auseinandergeschoben,
// die Trefferfläche kann also neben dem gezeichneten Punkt liegen)
const nodeScreen = await page.evaluate(() => {
  const s = window.tcGame.current;
  const c = s.nodeHitCenters().find((h) => h.i === 1);
  if (c) return { x: c.x, y: c.y, hit: s.hitNode({ x: c.x, y: c.y }) };
  const n = s.path.nodes[1];
  const p = s.view.camera.toScreen(n.x, n.y + n.z * 4.2);
  return { x: p.x, y: p.y, hit: s.hitNode(p) };
});
console.log('long press at', nodeScreen);
let pro = -1;
for (let attempt = 0; attempt < 3 && pro !== 1; attempt++) {
  await page.mouse.move(nodeScreen.x, nodeScreen.y);
  await page.mouse.down();
  // der Langdruck-Timer (480 ms) läuft erst, wenn der Hauptthread frei ist; mit Software-Rendering dauert das:
  // gedrückt halten, bis der Profi-Modus da ist (höchstens 2,5 s), dann loslassen
  for (let i = 0; i < 25; i++) {
    await sleep(100);
    pro = await page.evaluate(() => window.tcGame.current.proNode);
    if (pro === 1) break;
  }
  await page.mouse.up();
  await sleep(300);
  pro = await page.evaluate(() => window.tcGame.current.proNode);
  if (pro !== 1) console.log('long press attempt', attempt, 'proNode', pro);
}
check(pro === 1, `Langdruck zeigt Profi-Handles (proNode ${pro}, Treffer ${nodeScreen.hit})`);
await page.screenshot({ path: 'screenshots/scenario-7-pro.png' });
// Tipp ins Leere beendet den Profi-Modus
await page.mouse.click(1100, 300);
await sleep(300);
const proAfter = await page.evaluate(() => window.tcGame.current.proNode);
check(proAfter === -1, `Tipp ins Leere beendet den Profi-Modus (proNode ${proAfter})`);
}

// ---------------------------------------------------------------- 8. Entgleisen auf Holz
if (want('8')) {
await openLevel();
// 30-m-Lifthügel mit runder Kuppe (r 6 m lift-seitig, r 25 m bis 40° Gefälle, damit niemand an der Kuppe
// rausfliegt), Abfahrt 40°, enge Kehre am Boden, Rückweg auf Spur 2 und Kehre in die Station: Dort liegt die
// Querkraft auf der Holzbahn (Welt 1) bei rund 80 km/h trotz voller Schräglage über 2 g. Der Zug entgleist,
// fliegt, kippt zur Seite und bleibt liegen; beim Aufschlag fliegen die Fahrgäste raus.
const derail = [[0, 0], [4.6, 8], [9.8, 17], [15.6, 27], [17.8, 29.2], [20.8, 30], [25.1, 29.6], [29.3, 28.5], [33.3, 26.7], [36.9, 24.2], [50.7, 12.6], [64.5, 1], [68, 0], [72, 0], [75.5, 0.3 * R], [76, R], [75.5, 1.7 * R], [72, 2 * R], [36, 2 * R], [0, 2 * R], [-3.5, 1.7 * R], [-4, R], [-3.5, 0.3 * R], [0, 0]];
const derailScreen = await toScreen(derail);
check(derailScreen.every(([x, y]) => x > 0 && x < 1280 && y > 0 && y < 800), `Entgleisen: Strich liegt im Bild (${JSON.stringify(derailScreen[4])})`);
await stroke(derailScreen, 10);
await sleep(800);
st = await state();
console.log('after derail stroke', st);
check(Number(st.height) > 25, `Entgleisen: Hügel über 25 m (ist ${st.height})`);
check(st.turns >= 1, `Entgleisen: mindestens 1 Kurve (ist ${st.turns})`);
await page.mouse.click(640, 800 - 56);
let flightSt = null;
let shots = 0;
let stickerSeen = false;
let dustSeen = false;
for (let i = 0; i < 900; i++) {
  await sleep(100);
  const s = await state();
  if (s.sticker) stickerSeen = true;
  if (s.sim?.phase === 'flying') {
    if (s.particles > 0) dustSeen = true;
    if (!flightSt) flightSt = s;
    // zwei Bilder aus dem Flug: direkt nach dem Entgleisen (Zeitlupe) und etwas später
    if (shots < 2 && (shots === 0 || i % 3 === 0)) {
      await page.screenshot({ path: `screenshots/scenario-8-flight-${shots}.png` });
      shots++;
    }
  }
  if (i % 20 === 0) console.log('ride 8', s.sim, s.car);
  if (s.mode === 'result') break;
}
await sleep(800);
await page.screenshot({ path: 'screenshots/scenario-8-result.png' });
st = await state();
const ejected = await page.evaluate(() => window.tcGame.current.passengers?.views.filter((v) => v.ejected).length ?? -1);
console.log('after derail ride', st, 'ejected', ejected);
check(flightSt !== null, 'Entgleisen: der Zug geht in den Freiflug');
check(flightSt?.sim?.fail === 'derail', `Entgleisen: Grund ist derail (ist ${flightSt?.sim?.fail})`);
check(Number(flightSt?.sim?.maxSpeed) > 70, `Entgleisen: über 70 km/h vor dem Entgleisen (ist ${flightSt?.sim?.maxSpeed})`);
check(st.mode === 'result', `Entgleisen: Ergebnis erscheint (ist ${st.mode})`);
check(st.sim?.phase === 'flying', `Entgleisen: Phase bleibt flying (ist ${st.sim?.phase})`);
check(Math.abs(Number(st.car?.bank)) > 60, `Entgleisen: Wagen liegt auf der Seite (Schräglage ${st.car?.bank}°)`);
check(ejected > 0, `Entgleisen: Fahrgäste fliegen beim Aufprall raus (${ejected})`);
check(stickerSeen, 'Entgleisen: Sticker „Entgleist!“ erscheint');
check(dustSeen, 'Entgleisen: Staub/Funken beim Aufprall (Partikel > 0)');
}

// ---------------------------------------------------------------- 9. Karte: Glücksrad und gemeinsamer Himmel
if (want('9')) {
await page.goto(`${BASE}?scene=start`, { waitUntil: 'networkidle' });
await sleep(1500);
const before = await page.evaluate(() => ({ cur: window.tcGame.current.cur, focus: window.tcGame.current.wheel.focus, sky: window.tcGame.current.skyR?.exportState().clouds.length ?? 0 }));
check(before.sky > 3, `Karte zeigt denselben Himmel wie das Level (${before.sky} Wolken)`);
// Wisch nach links: 600 px in rund 160 ms → die Scheibe dreht frei aus und rastet mindestens zwei Rastpunkte weiter ein
await page.mouse.move(900, 500);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(900 - i * 75, 500);
  await sleep(20);
}
await page.mouse.up();
let settled = false;
let after = before;
for (let i = 0; i < 60 && !settled; i++) {
  await sleep(100);
  after = await page.evaluate(() => ({ cur: window.tcGame.current.cur, focus: window.tcGame.current.wheel.focus, sky: 0 }));
  settled = await page.evaluate(() => window.tcGame.current.wheel.velocity === 0 && window.tcGame.current.wheel.target !== null && Math.abs(window.tcGame.current.wheel.target - window.tcGame.current.wheel.focus) < 0.01);
}
const onSpot = await page.evaluate(() => window.tcGame.current.spots.some((sp) => Math.abs(sp.pos - window.tcGame.current.wheel.focus) < 0.01));
console.log('wheel', before, after, settled, onSpot);
check(settled && onSpot, `Glücksrad rollt aus und rastet auf einem Rastpunkt ein (Fokus ${after.focus.toFixed(1)})`);
check(after.cur >= before.cur + 1, `Glücksrad: Wisch dreht mindestens einen Rastpunkt weiter (${before.cur} → ${after.cur})`);
// Schneller Wisch mit festen Zeitstempeln (unter Software-Rendering kommen die Mausereignisse zu langsam an):
// 600 px in 150 ms → freie Drehung, mindestens zwei Rastpunkte weiter, jeder überfahrene Rastpunkt klickt einmal
const fast = await page.evaluate(() => {
  const s = window.tcGame.current;
  const w = s.wheel;
  const t0 = performance.now();
  w.dragStart(900, t0);
  for (let i = 1; i <= 6; i++) w.dragMove(900 - i * 100, t0 + i * 25, 1);
  w.dragEnd(t0 + 160);
  return { v: w.velocity, cur: s.cur };
});
let after2 = after;
for (let i = 0; i < 80; i++) {
  await sleep(100);
  const st2 = await page.evaluate(() => ({ cur: window.tcGame.current.cur, focus: window.tcGame.current.wheel.focus, v: window.tcGame.current.wheel.velocity, target: window.tcGame.current.wheel.target }));
  after2 = { cur: st2.cur, focus: st2.focus, sky: 0 };
  if (st2.v === 0 && st2.target !== null && Math.abs(st2.target - st2.focus) < 0.01) break;
}
console.log('fast flick', fast, after2);
check(Math.abs(fast.v) > 1500, `Schneller Wisch gibt Schwung (${fast.v.toFixed(0)} px/s)`);
check(after2.cur >= fast.cur + 2, `Glücksrad: schneller Wisch mindestens zwei Rastpunkte weiter (${fast.cur} → ${after2.cur})`);
await page.screenshot({ path: 'screenshots/scenario-9-map.png' });
// Play liegt mittig unter der Scheibe
const playX = await page.evaluate(() => window.tcGame.current.playBtn.x);
check(Math.abs(playX - 640) < 2, `Play-Knopf mittig (x ${playX})`);
}

// 10. Zone: die Prüfzone (public/zones/probe) lädt deterministisch in die Welt, Station setzt das Vorgabestück, Coins der
//     Gruppe stehen, Feld ist aktiv, Zeichenaufrufe im Budget; Standbild der Welt
if (want('10')) {
  await page.goto(`${BASE}?zone=probe&dev=1&fx=1&scroll=0`, { waitUntil: 'networkidle' });
  await sleep(3000);
  const zone = await page.evaluate(() => {
    const s = window.tcGame.current;
    const z = s.sandbox?.zone;
    return {
      world: !!window.tcGame.world,
      name: z?.name,
      counts: z ? [z.elements.length, z.fields.length, z.stations.length, z.queues.length, z.sites.length, z.coinGroups.length] : null,
      path: s.path ? s.path.nodes.length : 0,
      first: s.path?.nodes[0]?.kind ?? null,
      startX: s.path?.nodes[0]?.x ?? null,
      coins: s.level.coins?.length ?? 0,
      field: s.activeField?.id ?? null,
      minZoom: s.view.camera.minZoom,
      draw: window.tcGame.dev?.drawCalls ?? 0,
      // Schritt 9: Ziele des Felds in der Zielleiste, Gurtstufe des Felds, Fortschrittsstufe blendet die spätere Kulisse aus
      goals: s.level.goals.length,
      cells: s.goalCells.length,
      belt: s.level.restraint ?? null,
      e1Visible: window.tcGame.world.zone.get('e1')?.built.group.visible ?? null,
      e2Visible: window.tcGame.world.zone.get('e2')?.built.group.visible ?? null,
      // Etappe 2, Schritt 1: Schalter des Felds (Stufe „Alles“ der Prüfzone, Tunnel aus), Budget und Höhenlimit, kein Bergbauer
      tunnel: s.unlocked.has('tunnel'),
      launch: s.unlocked.has('launch'),
      mountain: s.unlocked.has('mountain'),
      budget: s.level.trackBudget ?? null,
      maxHeight: s.level.maxHeight ?? null,
      upgrades: z?.upgrades?.length ?? 0,
      // Schritt 2: großer Startart-Knopf am Hebel der Station (Radius 33 statt 22) und die Gruppe der Startart in der Welt
      startChipR: s.chips()[0]?.r ?? 0,
      startGroup: !!window.tcGame.world.scene.getObjectByName('start'),
      // Schritt 3: Kettenzugstärke des Felds (20 m) als gestrichelte Linie mit Beschriftung, Wagenvariante der Stufe
      chain: s.abilities?.chain ?? null,
      chainLine: s.chainLine.getBounds().width > 0 && s.chainLabel.visible,
      car: s.abilities?.car ?? null,
      // Schritt 5 (jetzt Freiraumfeld): Dreiteiler e1 fest, sein Fenster frei, Innenraum frei und unter einer Decke (Tunnel), Oberkante trägt
      // Schritt 6: zwei Baustellen (Durchbruch b1, Verbinden b2 auf dem Dreiteiler), noch keine offen, Wand für die Fahrt
      // Schritt 7: Raum e4 offen ab Stufe 2 (im Feld der Stufe 1 unsichtbar, kein Loch), Look der Stufe 1 ist Abend
      e4Visible: window.tcGame.world.zone.get('e4')?.built.group.visible ?? null,
      rooms: s.rooms.length,
      look: window.tcGame.world.currentLook,
      sites: z?.sites.map((b) => b.variant).join(',') ?? '',
      opened: s.openedSites.size,
      rock: !!s.field && s.field.solid(85, 8, 0.554) && !s.field.solid(85, 4, 0.554) && s.field.solid(85, 4, 1.446) && !s.field.solid(85, 8, 1) && s.field.ceilingAbove(85, 8, 1) && !s.field.solid(85, 8, 0) && !!s.field.floorBelow(85, 20, 1),
    };
  });
  console.log('zone', zone);
  check(zone.world, 'Weltrenderer läuft mit ?zone=');
  check(zone.name === 'probe' && JSON.stringify(zone.counts) === '[4,1,1,1,2,1]', `Prüfzone geladen (Elemente, Felder, Station, Schlange, Baustelle, Coins: ${JSON.stringify(zone.counts)})`);
  check(zone.path === 2 && zone.first === 'station' && zone.startX === 24, `Vorgabestück der Station steht (Knoten ${zone.path}, Start ${zone.first} bei x ${zone.startX})`);
  check(zone.coins === 5, `Coins der Gruppe in der Bühne (${zone.coins})`);
  check(zone.field === 'f1' && zone.minZoom > 3, `Feld f1 aktiv mit Zoom-Grenze (${zone.minZoom.toFixed(2)} px/m)`);
  check(zone.draw > 0 && zone.draw < 150, `Zeichenaufrufe im Budget (${zone.draw} < 150)`);
  check(zone.goals === 3 && zone.cells === 3, `Ziele des Felds stehen in der Zielleiste (${zone.goals} Ziele, ${zone.cells} Zellen)`);
  check(zone.belt === 2, `Gurtstufe des Felds gilt für die Fahrt (${zone.belt} = Bügel)`);
  check(zone.e1Visible === true && zone.e2Visible === false, `Fortschrittsstufe 1 zeigt den Dreiteiler und blendet die Kulisse ab Stufe 2 aus (e1 ${zone.e1Visible}, e2 ${zone.e2Visible})`);
  check(zone.upgrades === 3 && zone.launch === true && zone.tunnel === false && zone.mountain === false, `Schalter des Felds gelten (Stufe „Alles“ mit Tunnel aus: launch ${zone.launch}, tunnel ${zone.tunnel}, Bergbauer ${zone.mountain})`);
  check(zone.budget === 400 && zone.maxHeight === 40, `Streckenbudget und Höhenlimit des Felds gelten (${zone.budget} m, ${zone.maxHeight} m)`);
  check(zone.startChipR === 33 && zone.startGroup, `Startart-Knopf am Hebel (Radius ${zone.startChipR}) und Startart-Gruppe in der Welt (${zone.startGroup})`);
  check(zone.chain === 20 && zone.chainLine && zone.car === 'rot', `Kettenzuglinie bei ${zone.chain} m mit Beschriftung (${zone.chainLine}), Wagenvariante ${zone.car}`);
  check(zone.rock === true, `Freiraumfeld: Lippe fest mit freiem Fenster, Rückwand fest, Innenraum frei und Tunnel, Oberkante trägt (${zone.rock})`);
  check(zone.sites === 'breakthrough,connect' && zone.opened === 0, `Baustellen Durchbruch und Verbinden, noch geschlossen (${zone.sites}, offen ${zone.opened})`);
  check(zone.e4Visible === false && zone.rooms === 0 && zone.look === 'dusk', `Raum ab Stufe 2 in Stufe 1 gedeckelt (sichtbar ${zone.e4Visible}, offene Räume ${zone.rooms}), Look der Stufe ${zone.look}`);
  // dieselbe Datei noch einmal gelesen ergibt denselben Stand (deterministisch)
  const again = await page.evaluate(async () => {
    const res = await fetch(`${location.pathname.replace(/[^/]*$/, '')}zones/probe/zone.json`, { cache: 'no-store' });
    const file = await res.json();
    const z = window.tcGame.current.sandbox.zone;
    // Schlüssel sortiert vergleichen: die Reihenfolge in der Datei ist egal, der Inhalt muss gleich sein
    const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
    return { fileElements: file.elements.length, sameStation: canon(file.stations[0]) === canon(z.stations[0]), sameField: canon(file.fields[0]) === canon(z.fields[0]) };
  });
  check(again.fileElements === 4 && again.sameStation && again.sameField, 'Zonendatei und geladener Stand stimmen überein');
  await page.screenshot({ path: 'screenshots/scenario-10-zone.png' });
}

// 11. Zonen-Editor, Stufe 1 (docs/ZONENEDITOR-PLAN.md): Probe-Stapel als Ebenen, ein Mesh, Abstand mit „Bild halten“,
// Rechteck aufziehen, rückgängig, Ansichten; ohne Sichern (die Vorschau hat keinen Dev-Server)
if (want('11')) {
  await page.goto(`${BASE}?zone=editor-szenario&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const count = () => page.evaluate(() => {
    const z = window.tcGame.current.sandbox.zone;
    return { planes: (z.nodes ?? []).filter((n) => n.kind === 'plane').length, shapes: (z.nodes ?? []).filter((n) => n.kind === 'shape').length };
  });
  check(await page.locator('.ze-root').count() === 1 && (await count()).planes === 0, 'Editor-Oberfläche steht, die neue Zone hat keine Ebenen');
  await page.click('text=Probe-Stapel');
  await sleep(1200);
  const probe = await page.evaluate(() => ({ stats: window.tcGame.world.planes.stats, ground: window.tcGame.world.groundHidden, draw: window.tcGame.dev?.drawCalls ?? 0 }));
  const c1 = await count();
  check(c1.planes >= 30 && probe.stats.planes === c1.planes && probe.stats.shapes === c1.shapes, `Scheiben-Stapel als ${c1.planes} Ebenen mit ${c1.shapes} Formen in einem Mesh (${probe.stats.triangles} Dreiecke)`);
  check(probe.ground && probe.draw > 0 && probe.draw < 150, `kein flacher Boden mehr, Zeichenaufrufe im Budget (${probe.draw})`);
  // Abstandspille der vordersten Ebene nach unten ziehen: alles dahinter rückt nach hinten, das Bild bleibt
  const probePoints = () => page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    const planes = ed.nodes.filter((n) => n.kind === 'plane').sort((a, b) => a.z - b.z);
    return planes.slice(1).map((p) => ({ z: p.z, s: ed.views.toScreen(p.x + p.scale * 150, p.y + p.scale * 8, -p.z) }));
  });
  const before = await probePoints();
  const pill = await page.locator('.ze-pill').first().boundingBox();
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await page.mouse.down();
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2 + 30, { steps: 4 });
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2 + 60, { steps: 4 });
  await page.mouse.up();
  await sleep(200);
  const after = await probePoints();
  const shift = after[0].z - before[0].z;
  const dev = Math.max(...after.map((a, i) => Math.hypot(a.s.x - before[i].s.x, a.s.y - before[i].s.y)));
  check(shift > 0.5 && Math.abs(after.at(-1).z - before.at(-1).z - shift) < 1e-6, `Abstand gezogen: alle Ebenen dahinter ${shift.toFixed(2)} m nach hinten, gleiche Abstände`);
  check(dev < 0.01, `„Bild halten“: kein Punkt wandert im Spielblick (größte Abweichung ${dev.toFixed(4)} px)`);
  // Rechteck aufziehen, dann rückgängig
  await page.keyboard.press('m');
  await page.mouse.move(300, 200);
  await page.mouse.down();
  await page.mouse.move(380, 260, { steps: 5 });
  await page.mouse.up();
  await sleep(150);
  const c2 = await count();
  await page.keyboard.press('Meta+z');
  await sleep(150);
  const c3 = await count();
  check(c2.shapes === c1.shapes + 1 && c3.shapes === c1.shapes, `Rechteck aufgezogen (${c2.shapes} Formen) und rückgängig (${c3.shapes})`);
  // Frontal: Formen in ihrer Farbe (Befund an Tor S1: vorher lag in Frontal alles im Nebel und war weiß)
  await page.click('text=Frontal');
  await sleep(300);
  await page.mouse.move(560, 330);
  await page.mouse.down();
  await page.mouse.move(700, 430, { steps: 4 });
  await page.mouse.up();
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(150);
  await page.click('text=Nur diese');
  await sleep(300);
  const spot = await page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    const s = ed.nodes.filter((n) => n.kind === 'shape').reduce((a, b) => (b.id.localeCompare(a.id, 'en', { numeric: true }) > 0 ? b : a));
    const plane = ed.nodes.find((n) => n.id === s.parent);
    const p = ed.screenOf(plane, { x: s.x, y: s.y }, s);
    return { fill: s.fill, x: p.x, y: p.y };
  });
  const png = await page.screenshot({ path: 'screenshots/scenario-11-zoneneditor-frontal.png' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(spot.y) * info.width + Math.round(spot.x)) * info.channels;
  const got = [data[at], data[at + 1], data[at + 2]];
  const wantRgb = [1, 3, 5].map((i) => parseInt(spot.fill.slice(i, i + 2), 16));
  const diff = Math.max(...got.map((v, i) => Math.abs(v - wantRgb[i])));
  check(diff <= 12, `Frontal zeigt die Form in ihrer Farbe (${spot.fill}, gemessen rgb(${got.join(', ')}), Abweichung ${diff})`);
  await page.click('text=Alle');
  await page.click('text=Spielblick');
  await sleep(200);
  await page.keyboard.press('v');
  await page.screenshot({ path: 'screenshots/scenario-11-zoneneditor.png' });
  await page.click('text=Seite');
  await sleep(300);
  await page.screenshot({ path: 'screenshots/scenario-11-zoneneditor-seite.png' });
  const view = await page.evaluate(() => window.tcGame.world.viewCamera?.type ?? null);
  await page.click('text=Spielblick');
  await sleep(200);
  check(view === 'PerspectiveCamera' && (await page.evaluate(() => window.tcGame.world.viewCamera)) === null, `Seitenansicht mit eigener Kamera (${view}), zurück im Spielblick`);
}

// 12. Zonen-Editor, Stufe 2: Zeichenstift mit Teilungslinie, Direktauswahl (Fläche färben, Loch), Formpinsel, Messer,
// Kopieren in eine andere Ebene („Bild halten“), SVG-Rundlauf über Sichern und Laden, rückgängig
if (want('12')) {
  await page.goto(`${BASE}?zone=editor-formen&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const shapes = () => page.evaluate(() => window.tcGame.current.planeEditor.nodes.filter((n) => n.kind === 'shape').map((s) => ({ id: s.id, n: s.path.length, cuts: s.cuts?.length ?? 0, regions: s.regions ?? [], parent: s.parent, fill: s.fill })));
  // gezeichnete Flächen je Form (Löcher werden nicht gezeichnet)
  const faces = (id) => page.evaluate((id) => window.tcGame.world.planes.owners.filter((o) => o.id === id).length, id);
  const canon = () => page.evaluate(() => {
    const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sort(x)])) : v);
    return JSON.stringify(sort(window.tcGame.current.planeEditor.nodes));
  });
  const click = async (x, y) => {
    await page.mouse.click(x, y);
    await sleep(60);
  };
  await page.keyboard.press('p');
  for (const [x, y] of [[360, 260], [700, 260], [700, 520], [360, 520], [362, 262]]) await click(x, y);
  let list = await shapes();
  check(list.length === 1 && list[0].n === 4, `Zeichenstift: eine Form aus vier Ankern (${list.length} Form, ${list[0]?.n} Anker)`);
  // Teilungslinie: Anfang und Ende knapp neben den Kanten (rasten ein), in der Mitte gezogen (Kurve), Eingabe beendet
  await click(352, 380);
  await page.mouse.move(530, 430);
  await page.mouse.down();
  await page.mouse.move(590, 430, { steps: 4 });
  await page.mouse.up();
  await click(708, 360);
  await page.keyboard.press('Enter');
  await sleep(150);
  list = await shapes();
  const id = list[0].id;
  const f1 = await faces(id);
  check(list[0].cuts === 1 && f1 === 2, `Teilungslinie rastet an den Kanten ein und teilt die Form in ${f1} Flächen`);
  // Direktauswahl: obere Fläche färben, untere zum Loch
  await page.keyboard.press('a');
  await click(530, 300);
  // Farbe aus dem Farbmenü (Stufe 3; vorher Farbtupfer in der Leiste)
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Paletten")');
  await page.click('.ze-color .ze-chip[title="#d9a07a"]');
  await page.click('.ze-colorbtn');
  await click(530, 500);
  await page.click('.ze-context >> text=Loch');
  await sleep(150);
  list = await shapes();
  const f2 = await faces(id);
  check(list[0].regions.length === 2 && list[0].regions.some((r) => r.fill === '#d9a07a') && list[0].regions.some((r) => r.fill === null) && f2 === 1, `Direktauswahl: eine Fläche gefärbt, eine zum Loch (noch ${f2} gezeichnete Fläche)`);
  await page.screenshot({ path: 'screenshots/scenario-12-formen.png' });
  // Formpinsel: geschlossener Freihandkreis neben dem Rechteck, dann das Messer quer hindurch
  await page.keyboard.press('b');
  const loop = [];
  for (let k = 0; k <= 48; k++) loop.push([860 + 95 * Math.cos((k / 48) * 2 * Math.PI), 400 + 70 * Math.sin((k / 48) * 2 * Math.PI)]);
  await page.mouse.move(loop[0][0], loop[0][1]);
  await page.mouse.down();
  for (const [x, y] of loop.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
  await sleep(150);
  list = await shapes();
  const blob = list.at(-1);
  check(list.length === 2 && blob.n >= 3 && blob.n <= 12, `Formpinsel: eine glatte Form mit ${blob?.n} Ankern`);
  await page.keyboard.press('k');
  await page.mouse.move(740, 380);
  await page.mouse.down();
  await page.mouse.move(980, 430, { steps: 12 });
  await page.mouse.up();
  await sleep(150);
  list = await shapes();
  const f3 = await faces(blob.id);
  check(list.at(-1).cuts === 1 && f3 === 2, `Messer: die Pinselform zerfällt in ${f3} Flächen`);
  // Kopieren in eine neue Ebene dahinter: im Spielblick an derselben Stelle
  await page.keyboard.press('v');
  await click(400, 300);
  await page.keyboard.press('Meta+c');
  await page.click('.ze-head >> text=+');
  await sleep(100);
  await page.click('.ze-context >> text=Einfügen');
  await sleep(150);
  const paste = await page.evaluate((src) => {
    const ed = window.tcGame.current.planeEditor;
    const shapesNow = ed.nodes.filter((n) => n.kind === 'shape');
    const a = shapesNow.find((s) => s.id === src);
    const b = shapesNow.at(-1);
    const pa = ed.nodes.find((n) => n.id === a.parent);
    const pb = ed.nodes.find((n) => n.id === b.parent);
    const dev = a.path.map((p, i) => {
      const s1 = ed.screenOf(pa, { x: a.x + a.sx * p.x, y: a.y + a.sy * p.y }, a);
      const q = b.path[i];
      const s2 = ed.screenOf(pb, { x: b.x + b.sx * q.x, y: b.y + b.sy * q.y }, b);
      return Math.hypot(s1.x - s2.x, s1.y - s2.y);
    });
    return { other: pa.id !== pb.id, deeper: pb.z > pa.z, dev: Math.max(...dev) };
  }, id);
  check(paste.other && paste.deeper && paste.dev < 0.05, `Kopie in der Ebene dahinter liegt im Spielblick an derselben Stelle (größte Abweichung ${paste.dev.toFixed(4)} px)`);
  // SVG sichern und dieselbe Datei wieder laden: alles bleibt, wie es war
  const before = await canon();
  const steps = () => page.evaluate(() => window.tcGame.current.planeEditor.history.past.length);
  const steps0 = await steps();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.ze-foot >> text=SVG sichern')]);
  const file = await download.path();
  const svgText = readFileSync(file, 'utf8');
  check(download.suggestedFilename() === 'editor-formen-ebenen.svg' && /<g id="p1-/.test(svgText) && /id="s\d+-f\d+"/.test(svgText) && / C/.test(svgText), `SVG gesichert (${download.suggestedFilename()}, ${(svgText.length / 1024).toFixed(1)} KB, Gruppen je Ebene, Flächen mit Kurven)`);
  await page.setInputFiles('.ze-foot input[type=file]', file);
  await sleep(400);
  const toast = await page.locator('.ze-toast').textContent();
  const after = await canon();
  check(after === before && /unverändert/.test(toast ?? '') && (await steps()) === steps0, `SVG-Rundlauf ohne Änderung und ohne Schritt im Verlauf: ${toast}`);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'screenshots/scenario-12-formen-kopie.png' });
}

// 13. Befunde an Tor S2: Zeichenstift mit Befehls- und Wahltaste, Schließen mit Ziehen, Lasso und Mehrfachauswahl von
// Punkten und Formen, Ebenen in der Liste mehrfach wählen, ihre Tiefe ziehen und sie umordnen
if (want('13')) {
  await page.goto(`${BASE}?zone=editor-tor2&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const click = async (x, y, mods = []) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.click(x, y);
    for (const m of mods) await page.keyboard.up(m);
    await sleep(50);
  };
  const dragTo = async (from, to, mods = [], steps = 6) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps });
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
    await sleep(80);
  };
  // Zeichenstift: drei Punkte, den mittleren mit Befehlstaste verschieben, mit Ziehen am ersten Punkt schließen
  await page.keyboard.press('p');
  for (const [x, y] of [[300, 260], [520, 260], [520, 480]]) await click(x, y);
  await dragTo([520, 260], [560, 240], ['Meta']);
  const penPts = await ed(() => window.tcGame.current.planeEditor.paths.pen?.pts.length ?? 0);
  await dragTo([300, 260], [330, 300]);
  const closed = await ed(() => {
    const e = window.tcGame.current.planeEditor;
    const s = e.nodes.filter((n) => n.kind === 'shape').at(-1);
    return s ? { n: s.path.length, first: s.path[0], pen: !!e.paths.pen } : null;
  });
  check(penPts === 3 && closed?.n === 3 && !closed.pen && Math.abs(closed.first.outX ?? 0) > 0.5 && Math.abs((closed.first.inX ?? 0) + (closed.first.outX ?? 0)) < 1e-6, `Befehlstaste verschiebt einen Punkt des laufenden Pfads, Schließen mit Ziehen dreht die Griffe des Startpunkts (${JSON.stringify(closed?.first)})`);
  // Wahltaste: Klick auf einen Anker der gewählten Form macht ihn rund
  await page.keyboard.down('Alt');
  await page.mouse.move(520, 480);
  await sleep(60);
  await click(520, 480, ['Alt']);
  await page.keyboard.up('Alt');
  const round = await ed(() => window.tcGame.current.planeEditor.shape.path.filter((a) => a.inX || a.outX || a.inY || a.outY).length);
  check(round === 2, `Wahltaste macht einen Anker der Form rund (${round} runde Anker)`);
  // Lasso als Rechteck über die obere Kante: zwei Punkte, mit der Direktauswahl zusammen ziehen
  await page.keyboard.press('q');
  await page.click('.ze-context >> text=Rechteck');
  await dragTo([270, 200], [600, 300]);
  const lasso = await ed(() => window.tcGame.current.planeEditor.paths.anchors.length);
  await page.keyboard.press('a');
  const before = await ed(() => window.tcGame.current.planeEditor.shape.path.map((a) => a.y));
  await dragTo([300, 260], [300, 230]);
  const after = await ed(() => window.tcGame.current.planeEditor.shape.path.map((a) => a.y));
  const movedCount = after.filter((y, i) => Math.abs(y - before[i]) > 0.5).length;
  check(lasso === 2 && movedCount === 2, `Lasso wählt ${lasso} Punkte, die Direktauswahl zieht beide zugleich (${movedCount} bewegt)`);
  // Probe-Stapel: Ebenen mit Umschalt wählen, Tiefe in der Zeile ziehen, eine Zeile umordnen
  await page.keyboard.press('Escape');
  await page.click('text=Probe-Stapel');
  await sleep(600);
  const row = (name) => page.locator('.ze-row', { has: page.locator('.ze-name', { hasText: new RegExp(`^${name}$`) }) });
  await row('Scheibe 3').click();
  await row('Scheibe 6').click({ modifiers: ['Shift'] });
  const sel = await page.locator('.ze-row.on, .ze-row.sel').count();
  const z0 = await ed(() => Object.fromEntries(window.tcGame.current.planeEditor.nodes.filter((n) => n.kind === 'plane').map((p) => [p.name, p.z])));
  const chip = await row('Scheibe 4').locator('.ze-z').boundingBox();
  await dragTo([chip.x + 8, chip.y + chip.height / 2], [chip.x + 48, chip.y + chip.height / 2]);
  const z1 = await ed(() => Object.fromEntries(window.tcGame.current.planeEditor.nodes.filter((n) => n.kind === 'plane').map((p) => [p.name, p.z])));
  const moved = Object.keys(z0).filter((k) => Math.abs(z1[k] - z0[k]) > 1e-6);
  const dz = z1['Scheibe 4'] - z0['Scheibe 4'];
  check(sel === 4 && moved.length === 4 && moved.every((k) => Math.abs(z1[k] - z0[k] - dz) < 1e-6) && dz > 1, `Umschalt wählt 4 Ebenen; Ziehen an der Tiefe schiebt genau sie um ${dz.toFixed(2)} m (${moved.join(', ')})`);
  await row('Scheibe 9').click();
  const thumb = await row('Scheibe 9').locator('canvas').boundingBox();
  const target = await row('Scheibe 7').boundingBox();
  await dragTo([thumb.x + 10, thumb.y + 10], [thumb.x + 10, target.y + 6], [], 12);
  await sleep(300);
  const order = await page.locator('.ze-row .ze-name').allTextContents();
  const i9 = order.indexOf('Scheibe 9');
  check(order[i9 + 1] === 'Scheibe 7', `Zeile gezogen: Scheibe 9 steht jetzt vor Scheibe 7 (${order.slice(4, 10).join(', ')})`);
  await page.screenshot({ path: 'screenshots/scenario-13-tor2.png' });
}

// 14. Ebenen-Gruppen wie Ordner in Photoshop: gruppieren (Cmd+G), zuklappen, ausblenden, die Gruppe in der Tiefe ziehen
// (hält vor der nächsten fremden Ebene an), eine Ebene in die Gruppe ziehen, die ganze Gruppe umordnen, auflösen
if (want('14')) {
  await page.goto(`${BASE}?zone=editor-gruppen&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const row = (name) => page.locator('.ze-row', { has: page.locator('.ze-name', { hasText: new RegExp(`^${name}$`) }) });
  const head = () => page.locator('[data-ghead]').first();
  const listText = () => page.evaluate(() => [...document.querySelectorAll('.ze-list > .ze-row')].map((x) => (x.dataset.ghead ? `[${x.querySelector('.ze-name').textContent}]` : (x.classList.contains('ze-member') ? '·' : '') + x.querySelector('.ze-name').textContent)).slice(0, 10).join(' '));
  const z = () => ed(() => Object.fromEntries(window.tcGame.current.planeEditor.nodes.filter((n) => n.kind === 'plane').map((p) => [p.name, p.z])));
  const drag = async (from, to, steps = 10) => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps });
    await page.mouse.up();
    await sleep(200);
  };
  await page.click('text=Probe-Stapel');
  await sleep(600);
  await row('Scheibe 3').click();
  await row('Scheibe 5').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Meta+g');
  await sleep(200);
  const l1 = await listText();
  check(/\[Gruppe 1\] ·Scheibe 3 ·Scheibe 4 ·Scheibe 5 Scheibe 6/.test(l1), `Cmd+G: Ordnerzeile vor drei eingerückten Ebenen (${l1})`);
  await head().locator('.ze-disc').click();
  await sleep(150);
  const l2 = await listText();
  await head().locator('.ze-disc').click();
  await sleep(150);
  await head().locator('.ze-btn[title="Gruppe ausblenden"]').click();
  await sleep(150);
  const hidden = await ed(() => window.tcGame.world.planes.stats.shapes);
  await head().locator('.ze-btn[title="Gruppe einblenden"]').click();
  await sleep(150);
  const shown = await ed(() => window.tcGame.world.planes.stats.shapes);
  check(/\[Gruppe 1\] Scheibe 6/.test(l2) && shown - hidden === 3, `zugeklappt nur die Ordnerzeile; ausgeblendet fehlen ihre 3 Formen im Bild (${hidden} statt ${shown})`);
  // Tiefe der Gruppe weit nach hinten ziehen: alle drei wandern gleich, bis 1 cm vor Scheibe 6
  const z0 = await z();
  const chip = await head().locator('.ze-z').boundingBox();
  await drag([chip.x + 6, chip.y + chip.height / 2], [chip.x + 206, chip.y + chip.height / 2]);
  const z1 = await z();
  const d3 = z1['Scheibe 3'] - z0['Scheibe 3'];
  const same = ['Scheibe 4', 'Scheibe 5'].every((n) => Math.abs(z1[n] - z0[n] - d3) < 1e-6);
  check(same && d3 > 0.5 && Math.abs(z1['Scheibe 6'] - z1['Scheibe 5'] - 0.01) < 1e-6 && z1['Scheibe 6'] === z0['Scheibe 6'], `Tiefe der Gruppe gezogen: alle drei ${d3.toFixed(2)} m nach hinten, halten 1 cm vor Scheibe 6`);
  // Scheibe 7 in die Gruppe ziehen (unter Scheibe 5, eingerückt)
  const t7 = await row('Scheibe 7').locator('canvas').boundingBox();
  const r5 = await row('Scheibe 5').boundingBox();
  await drag([t7.x + 10, t7.y + 10], [r5.x + 120, r5.y + r5.height - 3]);
  const l3 = await listText();
  check(/·Scheibe 5 ·Scheibe 7 Scheibe 6/.test(l3), `Scheibe 7 in die Gruppe gezogen (${l3})`);
  // die ganze Gruppe hinter Scheibe 8 ziehen: ihre Abstände bleiben
  const gap0 = (await z())['Scheibe 4'] - (await z())['Scheibe 3'];
  const fh = await head().locator('.ze-fold').boundingBox();
  const r9 = await row('Scheibe 9').boundingBox();
  await drag([fh.x + 10, fh.y + 10], [r9.x + 20, r9.y + 4], 14);
  const l4 = await listText();
  const z4 = await z();
  check(/Scheibe 8 \[Gruppe 1\] ·Scheibe 3 ·Scheibe 4 ·Scheibe 5 ·Scheibe 7 Scheibe 9/.test(l4) && Math.abs(z4['Scheibe 4'] - z4['Scheibe 3'] - gap0) < 1e-6, `ganze Gruppe hinter Scheibe 8 gezogen, Abstände bleiben (${l4})`);
  await page.screenshot({ path: 'screenshots/scenario-14-gruppen.png' });
  await page.keyboard.press('Meta+Shift+g');
  await sleep(200);
  const l5 = await listText();
  check(!/\[/.test(l5) && (await ed(() => window.tcGame.current.planeEditor.nodes.some((n) => n.kind === 'group'))) === false, `Shift+Cmd+G löst die Gruppe auf, die Ebenen bleiben (${l5})`);
}

// 15. Skizze als Pause-Ebene: ein Bild über „Skizze“ auf eine hintere Ebene laden; es liegt ganz im freien Bild, ist
// multipliziert (Papier durchsichtig, Linien dunkeln ab) und liegt über den Ebenen davor; innen ziehen verschiebt, an
// der Ecke ziehen skaliert (die Ecke gegenüber steht), Deckkraft und Rückgängig; im Spiel unsichtbar
if (want('15')) {
  await page.goto(`${BASE}?zone=szenario-skizze&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const ctxBtn = (text) => page.locator('.ze-context .ze-btn', { hasText: new RegExp(`^${text}`) });
  const drag = async (from, to) => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    await page.mouse.up();
    await sleep(200);
  };
  await page.click('text=Probe-Stapel');
  await sleep(600);
  await page.locator('.ze-row', { has: page.locator('.ze-name', { hasText: /^Scheibe 9$/ }) }).click();
  // Papier mit einem dunklen Balken quer durch die Mitte
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#fbf8f0"/><rect x="100" y="215" width="600" height="70" fill="#2a2a2a"/><circle cx="400" cy="110" r="60" fill="none" stroke="#2a2a2a" stroke-width="8"/></svg>')).png().toBuffer();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), ctxBtn('Skizze').click()]);
  await chooser.setFiles({ name: 'bild-2.png', mimeType: 'image/png', buffer: png });
  await sleep(1200);
  const info = () =>
    ed(() => {
      const e = window.tcGame.current.planeEditor;
      const k = e.nodes.find((n) => n.kind === 'sketch');
      if (!k) return null;
      const plane = e.nodes.find((n) => n.id === k.parent);
      const front = e.nodes.filter((n) => n.kind === 'plane').reduce((a, b) => (b.z < a.z ? b : a));
      const fs = e.nodes.find((n) => n.kind === 'shape' && n.parent === front.id);
      return { k: { ...k }, plane: plane.name, corners: e.sketchCorners(k).map((q) => e.screenOf(plane, q)), mid: e.screenOf(plane, { x: k.x, y: k.y }), paper: e.screenOf(plane, { x: k.x + 0.3 * k.w, y: k.y - 0.3 * k.h }), front: e.screenOf(front, { x: fs.x, y: fs.y }, fs), free: e.ui.freeSpan(), edit: e.sketchEdit, meshes: e.sketches.group.children.length };
    });
  const a = await info();
  const served = a?.k.src.startsWith('/zones/') ? (await page.evaluate((u) => fetch(u).then((r) => `${r.status} ${r.headers.get('content-type')}`), a.k.src)) : 'nur im Speicher (ohne Dev-Server)';
  const inFree = a && a.corners.every((c) => c.x > a.free.left && c.x < a.free.right && c.y > 0 && c.y < 800);
  check(a && a.plane === 'Scheibe 9' && a.meshes === 1 && a.edit === a.k.id && !a.k.blend && inFree, `Skizze geladen auf Scheibe 9, ganz im freien Bild, multipliziert, Anpassen an (${a?.k.src}: ${served})`);
  // innen ziehen: die Mitte der Skizze (der Balken) auf eine Form der vordersten Ebene
  await drag([a.mid.x, a.mid.y], [a.front.x, a.front.y]);
  const b = await info();
  check(Math.hypot(b.mid.x - a.front.x, b.mid.y - a.front.y) < 1.5, `innen gezogen: die Skizze folgt dem Zeiger (Abstand ${Math.hypot(b.mid.x - a.front.x, b.mid.y - a.front.y).toFixed(2)} px)`);
  // an der Ecke rechts oben ziehen: links unten steht, das Seitenverhältnis bleibt
  await drag([b.corners[2].x, b.corners[2].y], [b.corners[2].x + 40, b.corners[2].y - 25]);
  const c = await info();
  const still = Math.hypot(c.corners[0].x - b.corners[0].x, c.corners[0].y - b.corners[0].y);
  check(c.k.w > b.k.w && Math.abs(c.k.w / c.k.h - b.k.w / b.k.h) < 1e-6 && still < 0.5, `an der Ecke skaliert: ${b.k.w.toFixed(1)} → ${c.k.w.toFixed(1)} m breit, Ecke gegenüber steht (${still.toFixed(2)} px)`);
  // über den Ebenen davor: auf der vordersten Form dunkelt der Balken ab, das Papier daneben ändert nichts
  await page.mouse.click(Math.min(Math.max(c.corners[1].x, c.corners[2].x) + 80, c.free.right - 20), 650);
  await sleep(200);
  const d = await info();
  check(d.edit === null, `ein Tipp neben die Skizze beendet das Anpassen (${d.edit})`);
  const shot = async () => sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
  const px = ({ data, info: i }, p) => {
    const at = (Math.round(p.y) * i.width + Math.round(p.x)) * i.channels;
    return [data[at], data[at + 1], data[at + 2]];
  };
  const on = await shot();
  // die Leiste der Skizze bleibt nach dem Anpassen offen
  await ctxBtn('Ausblenden').click();
  await sleep(300);
  const off = await shot();
  const lum = (v) => v[0] + v[1] + v[2];
  const ratio = lum(px(on, d.mid)) / Math.max(1, lum(px(off, d.mid)));
  const paperDiff = Math.max(...px(on, d.paper).map((v, i) => Math.abs(v - px(off, d.paper)[i])));
  const seen = [d.mid, d.paper].every((p) => p.x >= 0 && p.x < 1280 && p.y >= 0 && p.y < 740);
  check(seen && ratio < 0.8 && paperDiff <= 10, `über der vordersten Ebene: Balken dunkelt auf ${(ratio * 100).toFixed(0)} % ab, Papier ändert höchstens ${paperDiff} von 255 (rgb ${px(off, d.paper).join(', ')})`);
  await ctxBtn('Einblenden').click();
  await ctxBtn('Deckkraft').click();
  const op1 = (await info()).k.opacity;
  await page.keyboard.press('Meta+z');
  await sleep(150);
  const op2 = (await info()).k.opacity;
  await ctxBtn('Multiplizieren').click();
  const blend = (await info()).k.blend;
  await page.keyboard.press('Meta+z');
  await sleep(150);
  check(op1 === 0.75 && op2 === 0.5 && blend === 'normal' && !(await info()).k.blend, `Deckkraft 50 → 75 %, Multiplizieren aus, beides mit Cmd+Z zurück`);
  await page.screenshot({ path: 'screenshots/scenario-15-skizze.png' });
  await page.click('.ze-views .ze-btn:text-is("Spielen")');
  await sleep(300);
  const inGame = await ed(() => window.tcGame.current.planeEditor.sketches.group.visible);
  check(inGame === false, 'im Spiel ist die Skizze nicht zu sehen');
  // hochgeladene Bilder des Szenarios wieder weg (nur wenn der Dev-Server aus diesem Stand lief)
  if (a.k.src.startsWith('/zones/szenario-skizze/')) rmSync('public/zones/szenario-skizze', { recursive: true, force: true });
}

// 16. Formgruppen wie in Illustrator: zwei Rechtecke gruppieren (Cmd+G), Tippen wählt die Gruppe, Ziehen bewegt sie
// ganz, doppelt tippen geht hinein (eine Form allein), Esc heraus, mit einer dritten Form verschachtelt gruppieren
// (Knopf), duplizieren (eigene Gruppe), auflösen, SVG mit verschachtelten Gruppen
if (want('16')) {
  await page.goto(`${BASE}?zone=editor-formgruppen&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const drag = async (from, to) => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    await page.mouse.up();
    await sleep(200);
  };
  const state = () =>
    ed(() => {
      const e = window.tcGame.current.planeEditor;
      return {
        shapes: e.nodes.filter((n) => n.kind === 'shape').sort((a, b) => a.order - b.order).map((s) => ({ id: s.id, x: s.x, y: s.y, groups: (s.groups ?? []).join('/') })),
        sel: [...e.selection].sort(),
        inGroup: e.inGroup.join('/'),
        label: document.querySelector('.ze-context .ze-label')?.textContent ?? '',
        box: !!document.querySelector('.ze-groupbox')?.getAttribute('d'),
      };
    });
  await page.click('.ze-layers .ze-btn[title^="Neue Ebene"]');
  await page.keyboard.press('m');
  const A = [305, 385];
  const B = [485, 385];
  const C = [705, 385];
  for (const [x, y] of [A, B, C]) await drag([x - 65, y - 65], [x + 65, y + 65]);
  await page.keyboard.press('v');
  await page.mouse.click(A[0], A[1]);
  await page.keyboard.down('Shift');
  await page.mouse.click(B[0], B[1]);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Meta+g');
  await sleep(200);
  const s1 = await state();
  const [a, b, c] = s1.shapes;
  check(a.groups === 'fg1' && b.groups === 'fg1' && c.groups === '' && /Gruppe · 2 Formen/.test(s1.label), `Cmd+G gruppiert zwei Rechtecke (${s1.shapes.map((s) => `${s.id}:${s.groups || '–'}`).join(' ')}, Leiste „${s1.label}“)`);
  // daneben tippen, dann eine Form der Gruppe: die ganze Gruppe ist gewählt und zieht mit
  await page.mouse.click(640, 640);
  await page.mouse.click(B[0], B[1]);
  await sleep(150);
  const s2 = await state();
  await drag(B, [B[0] + 40, B[1] - 30]);
  const s3 = await state();
  const d = (k, s, t) => t.shapes.find((x) => x.id === k)[s] - s1.shapes.find((x) => x.id === k)[s];
  check(s2.sel.join(' ') === [a.id, b.id].sort().join(' ') && Math.abs(d(a.id, 'x', s3) - d(b.id, 'x', s3)) < 1e-6 && d(a.id, 'x', s3) > 1 && d(c.id, 'x', s3) === 0, `Tippen wählt die Gruppe, Ziehen bewegt beide gleich (${d(a.id, 'x', s3).toFixed(2)} m)`);
  // doppelt tippen: in die Gruppe, nur die getippte Form; Ziehen bewegt nur sie
  const A2 = [A[0] + 40, A[1] - 30];
  await page.mouse.dblclick(A2[0], A2[1]);
  await sleep(150);
  const s4 = await state();
  await drag(A2, [A2[0], A2[1] + 50]);
  const s5 = await state();
  check(s4.inGroup === 'fg1' && s4.sel.join(' ') === a.id && s4.box && d(a.id, 'y', s5) < d(a.id, 'y', s4) - 1 && d(b.id, 'y', s5) === d(b.id, 'y', s4), `doppelt tippen geht in die Gruppe (Rahmen gestrichelt), Ziehen bewegt nur ${a.id}`);
  await page.keyboard.press('Escape');
  await sleep(150);
  const s6 = await state();
  check(s6.inGroup === '' && s6.sel.join(' ') === [a.id, b.id].sort().join(' '), 'Esc verlässt die Gruppe, sie bleibt gewählt');
  // mit dem dritten Rechteck verschachtelt gruppieren (Knopf in der Leiste)
  await page.keyboard.down('Shift');
  await page.mouse.click(C[0], C[1]);
  await page.keyboard.up('Shift');
  await sleep(150);
  const s7 = await state();
  await page.click('.ze-context .ze-btn:text-is("Gruppieren")');
  await sleep(150);
  const s8 = await state();
  const g8 = Object.fromEntries(s8.shapes.map((s) => [s.id, s.groups]));
  check(/2 Teile · 3 Formen/.test(s7.label) && g8[a.id] === 'fg2/fg1' && g8[b.id] === 'fg2/fg1' && g8[c.id] === 'fg2' && /Gruppe · 3 Formen/.test(s8.label), `Gruppe und Rechteck verschachtelt gruppiert (${Object.values(g8).join(', ')})`);
  // duplizieren: die Kopie ist eine eigene Gruppe mit eigener Untergruppe, vor der alten
  await page.keyboard.press('Meta+d');
  await sleep(150);
  const s9 = await state();
  const copies = s9.shapes.slice(3);
  check(s9.shapes.length === 6 && copies.every((s) => s.groups.startsWith('fg3')) && copies.filter((s) => s.groups === 'fg3/fg4').length === 2 && s9.sel.join(' ') === copies.map((s) => s.id).sort().join(' '), `Cmd+D: die Kopie ist eine eigene Gruppe vor der alten (${copies.map((s) => `${s.id}:${s.groups}`).join(' ')})`);
  await page.keyboard.press('Meta+Shift+g');
  await sleep(150);
  const s10 = await state();
  const after = s10.shapes.slice(3).map((s) => s.groups);
  check(after.filter((g) => g === 'fg4').length === 2 && after.includes('') && s10.shapes.slice(0, 3).every((s) => s.groups.startsWith('fg2')), `Shift+Cmd+G löst die äußere Gruppe der Kopie auf, die innere bleibt (${after.join(', ')})`);
  const svg = await ed(async () => (await import('/src/zone/svgPlanes.ts')).planesToSvg(window.tcGame.current.planeEditor.nodes));
  check(/<g id="fg2">\s*<g id="fg1">\s*<path id="s\d+"/.test(svg) && /<g id="fg4">/.test(svg), 'SVG: Formgruppen als verschachtelte Gruppen in der Ebene');
  await page.screenshot({ path: 'screenshots/scenario-16-formgruppen.png' });
}

// 17. Bogen als Grundform (U wechselt durch), Zahlen für Breite und Mitte, Umschalt beim Verschieben (nur waagrecht) und
// beim Zeichenstift (die zweite Kante läuft waagrecht)
if (want('17')) {
  await page.goto(`${BASE}?zone=editor-zahlen&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const last = () =>
    ed(() => {
      const e = window.tcGame.current.planeEditor;
      const s = e.nodes.filter((n) => n.kind === 'shape').at(-1);
      if (!s) return null;
      const xs = s.path.map((p) => s.x + s.sx * p.x);
      const ys = s.path.map((p) => s.y + s.sy * p.y);
      return { id: s.id, name: s.name, n: s.path.length, x: s.x, y: s.y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts: xs.map((x, i) => [x, ys[i]]) };
    });
  await page.click('.ze-layers .ze-btn[title^="Neue Ebene"]');
  await page.keyboard.press('m');
  await page.keyboard.press('u');
  await page.keyboard.press('u');
  const tool = await ed(() => window.tcGame.current.planeEditor.tool);
  await page.mouse.move(420, 250);
  await page.mouse.down();
  await page.mouse.move(540, 480, { steps: 8 });
  await page.mouse.up();
  await sleep(200);
  const a = await last();
  check(tool === 'arch' && /^Bogen/.test(a?.name ?? '') && a.n === 5, `U wechselt zum Bogen, aufgezogen mit 5 Ankern (${a?.name})`);
  await page.keyboard.press('v');
  await page.click('.ze-context .ze-btn:text-is("Zahlen")');
  const fill = async (i, v) => {
    const input = page.locator('.ze-context .ze-num input').nth(i);
    await input.click();
    await input.fill(v);
    await input.press('Enter');
    await sleep(150);
  };
  await fill(2, '12');
  await fill(0, '5');
  const b = await last();
  check(Math.abs(b.w - 12) < 0.01 && Math.abs(b.x - 5) < 0.01 && Math.abs(b.h - a.h) < 1e-6, `Zahlen: Breite 12 m, Mitte x 5 m, Höhe bleibt (${b.w.toFixed(3)} × ${b.h.toFixed(2)} m)`);
  await page.click('.ze-context .ze-btn:text-is("Fertig")');
  // Umschalt beim Verschieben: schräg gezogen, die Form bleibt auf ihrer Höhe
  const c0 = await ed(() => {
    const e = window.tcGame.current.planeEditor;
    const s = e.nodes.filter((n) => n.kind === 'shape').at(-1);
    return e.screenOf(e.nodes.find((n) => n.id === s.parent), { x: s.x, y: s.y }, s);
  });
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c0.x + 20, c0.y + 3, { steps: 3 });
  await page.keyboard.down('Shift');
  await page.mouse.move(c0.x + 90, c0.y + 12, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await sleep(150);
  const c = await last();
  check(Math.abs(c.y - b.y) < 1e-9 && c.x - b.x > 1, `Umschalt beim Verschieben: nur waagrecht (${(c.x - b.x).toFixed(2)} m, Höhe gleich)`);
  // Zeichenstift mit Umschalt: die zweite Kante läuft waagrecht, obwohl der Zeiger 25 px tiefer liegt
  await page.mouse.click(700, 650);
  await page.keyboard.press('p');
  await page.mouse.click(300, 600);
  await page.keyboard.down('Shift');
  await page.mouse.click(420, 625);
  await page.keyboard.up('Shift');
  await page.mouse.click(400, 700);
  await page.keyboard.press('Enter');
  await sleep(200);
  const d = await last();
  check(d && d.n === 3 && Math.abs(d.pts[1][1] - d.pts[0][1]) < 1e-6, `Zeichenstift mit Umschalt: zweiter Anker auf der Höhe des ersten (${d ? (d.pts[1][1] - d.pts[0][1]).toFixed(4) : '–'} m)`);
  await page.screenshot({ path: 'screenshots/scenario-17-bogen-zahlen.png' });
}

// 18. Zonen-Editor, Stufe 3: das Ebenen-Material zeichnet Füllstapel wie die Vorlage evalLayers (src/zone/paint.ts):
// Vollton, Verläufe linear und radial, Mischmodi mit Deckkraft, Palettenfarbe mit Tausch je Look, Ebenenstapel,
// Deckkraftverlauf über einer anderen Form (zweites Mesh). Gemessen im Bildschirmfoto an Punkten mitten in den Flächen.
// Braucht den Dev-Server (lädt src/zone/paint.ts im Browser).
if (want('18')) {
  await page.goto(`${BASE}?zone=szenario-farbe&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const setup = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const g = window.tcGame;
    const ed = g.current.planeEditor;
    const grad = (a, b, x0, y0, x1, y1, extra = {}) => ({ type: 'gradient', stops: [{ t: 0, color: a, a: 1 }, { t: 1, color: b, a: 1 }], x0, y0, x1, y1, blend: 'normal', opacity: 1, ...extra });
    const cases = [];
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      ed.nodes.push({ id: 'c1', kind: 'swatch', name: 'Fels', color: '#aa3355', looks: { night: '#112244' } });
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 300).x - P(400, 300).x) / 60;
      const half = 35 * m;
      const sq = [
        { x: -half, y: -half },
        { x: half, y: -half },
        { x: half, y: half },
        { x: -half, y: half },
      ];
      const add = (planeId, at, fill, more = {}) => {
        const s = N.newShape(ed.nodes, planeId, sq, at.x, at.y, fill);
        Object.assign(s, more);
        ed.nodes.push(s);
        return s;
      };
      const row = (i, y) => P(240 + i * 95, y);
      const h2 = half * 0.6;
      cases.push({ name: 'Vollton', s: add(p.id, row(0, 330), '#3366aa'), pts: [[0, 0]] });
      cases.push({ name: 'Verlauf linear rot → blau', s: add(p.id, row(1, 330), '#000000', { fills: [grad('#ff0000', '#0000ff', -half, 0, half, 0)] }), pts: [[-h2, 0], [0, 0], [h2, 0]] });
      cases.push({ name: 'Multiplizieren 50 %', s: add(p.id, row(2, 330), '#808080', { fills: [{ type: 'color', color: '#ff8040', blend: 'multiply', opacity: 0.5 }] }), pts: [[0, 0]] });
      cases.push({ name: 'Ineinanderkopieren mit Verlauf', s: add(p.id, row(3, 330), '#336699', { fills: [grad('#ffffff', '#000000', 0, -half, 0, half, { blend: 'overlay' })] }), pts: [[0, -h2], [0, 0], [0, h2]] });
      cases.push({ name: 'Weiches Licht, radial', s: add(p.id, row(4, 330), '#996633', { fills: [grad('#ffeecc', '#202060', 0, 0, half, 0, { radial: true, blend: 'softLight', opacity: 0.8 })] }), pts: [[0, 0], [h2, 0], [0, -h2]] });
      cases.push({ name: 'Farbe (Farbton und Sättigung)', s: add(p.id, row(5, 330), '#c0c0c0', { fills: [{ type: 'color', color: '#3060ff', blend: 'color', opacity: 1 }] }), pts: [[0, 0]] });
      cases.push({ name: 'Palettenfarbe', s: add(p.id, row(0, 450), '@c1'), pts: [[0, 0]], palette: true });
      // Ebenenstapel: zweite Ebene mit einem multiplizierten Verlauf über allen ihren Formen
      const p2 = N.newPlane(ed.nodes, 0.5);
      ed.nodes.push(p2);
      const at2 = ed.planePoint(p2, { x: 240 + 95, y: 450 });
      p2.fills = [grad('#ffffff', '#ff6000', at2.x - half, 0, at2.x + half, 0, { blend: 'multiply' })];
      cases.push({ name: 'Ebenenstapel', s: add(p2.id, at2, '#88aacc'), pts: [[-h2, 0], [0, 0], [h2, 0]], plane: p2.id });
      // Deckkraftverlauf: weiße Form über einer dunklen, links deckend, rechts durchsichtig
      const under = add(p.id, row(2, 450), '#224433');
      cases.push({ name: 'Deckkraftverlauf', s: add(p.id, row(2, 450), '#ffffff', { fills: [{ type: 'fade', stops: [{ t: 0, color: '#000000', a: 1 }, { t: 1, color: '#000000', a: 0 }], x0: -half, y0: 0, x1: half, y1: 0, blend: 'normal', opacity: 1 }] }), pts: [[-h2, 0], [0, 0], [h2, 0]], over: under.id });
    });
    for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
    return { stats: g.world.planes.stats, n: cases.length };
  });
  check(setup.stats.paints >= 9 && setup.stats.gradients >= 4 && setup.stats.clear === 1, `Anstriche als Zeilen der Stil-Datentextur (${setup.stats.paints}), ${setup.stats.gradients} Farbbänder, eine durchsichtige Fläche im zweiten Mesh`);
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 795);
  const measure = async (look) => {
    const pts = await page.evaluate(async (look) => {
      const N = await import('/src/zone/nodes.ts');
      const P = await import('/src/zone/paint.ts');
      const g = window.tcGame;
      // ohne das Papierkorn des Spiels (über das ganze Bild multipliziert): es tönt alles leicht ab
      if (g.current.view?.paper) g.current.view.paper.visible = false;
      g.world.setLook(look);
      for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
      const ed = g.current.planeEditor;
      const sw = N.swatchMap(ed.nodes);
      const out = [];
      for (const s of ed.nodes.filter((n) => n.kind === 'shape')) {
        const plane = ed.nodes.find((n) => n.id === s.parent);
        const same = (n) => n.kind === 'shape' && n !== s && n.parent === s.parent && n.x === s.x && n.y === s.y;
        // die verdeckte Form unter dem Deckkraftverlauf misst die obere mit
        if (ed.nodes.some((n) => same(n) && n.order > s.order)) continue;
        const under = ed.nodes.find((n) => same(n) && n.order < s.order);
        const layers = P.paintLayers(s, new Map(), { minX: 0, minY: 0, maxX: 1, maxY: 1 }).layers;
        const k = 0.6 * Math.abs(s.path[0].x);
        for (const [lx, ly] of [[0, 0], [-k, 0], [k, 0], [0, -k], [0, k]]) {
          let c = P.evalLayers(layers, lx, ly, sw, look);
          if (plane.fills) c = P.evalLayers(plane.fills, s.x + lx, s.y + ly, sw, look, c);
          if (under) {
            const b = P.evalLayers(P.paintLayers(under, new Map(), { minX: 0, minY: 0, maxX: 1, maxY: 1 }).layers, 0, 0, sw, look);
            c = { rgb: c.rgb.map((v, i) => v * c.a + b.rgb[i] * (1 - c.a)), a: 1 };
          }
          const q = ed.screenOf(plane, { x: s.x + lx, y: s.y + ly }, s);
          out.push({ id: s.id, x: q.x, y: q.y, want: c.rgb.map((v) => Math.round(v * 255)) });
        }
      }
      return out;
    }, look);
    const png = await page.screenshot({ path: `screenshots/scenario-18-farbe-${look}.png` });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let worst = { d: 0, id: '', got: [], want: [] };
    for (const p of pts) {
      const at = (Math.round(p.y) * info.width + Math.round(p.x)) * info.channels;
      const got = [data[at], data[at + 1], data[at + 2]];
      const d = Math.max(...got.map((v, i) => Math.abs(v - p.want[i])));
      if (d > worst.d) worst = { d, id: p.id, got, want: p.want };
      if (d > 4 && process.env.TC_DEBUG) console.log('  abweichend', p.id, Math.round(p.x), Math.round(p.y), got, p.want);
    }
    return { n: pts.length, worst };
  };
  const day = await measure('day');
  check(day.worst.d <= 4, `Tag: ${day.n} Punkte wie evalLayers (größte Abweichung ${day.worst.d}${day.worst.d ? ` bei ${day.worst.id}: rgb(${day.worst.got.join(', ')}) statt rgb(${day.worst.want.join(', ')})` : ''})`);
  const night = await measure('night');
  const swap = await page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    const s = ed.nodes.find((n) => n.kind === 'shape' && n.fill === '@c1');
    return ed.screenOf(ed.nodes.find((n) => n.id === s.parent), { x: s.x, y: s.y }, s);
  });
  const png = await page.screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(swap.y) * info.width + Math.round(swap.x)) * info.channels;
  const nightRgb = [data[at], data[at + 1], data[at + 2]];
  check(night.worst.d <= 4 && Math.max(...nightRgb.map((v, i) => Math.abs(v - [0x11, 0x22, 0x44][i]))) <= 4, `Nacht: Palettenfarbe getauscht (rgb(${nightRgb.join(', ')})), alle ${night.n} Punkte wie evalLayers (Abweichung ${night.worst.d})`);
  await page.evaluate(() => {
    window.tcGame.world.setLook('day');
    if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true;
  });
}

// 19. Zonen-Editor, Stufe 3: Farbmenü. Auswahl färben (Hex in „Werte“), Farbe aus der Palette auf eine Fläche ziehen,
// „Weiter füllen“, Pipette, Feld der Zonenpalette anlegen, auf eine Fläche ziehen, bearbeiten (die Fläche ändert sich mit)
// und löschen (die Fläche behält den Wert), rückgängig. Braucht den Dev-Server (lädt src/zone/nodes.ts im Browser).
if (want('19')) {
  await page.goto(`${BASE}?zone=szenario-farbmenue&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const a = P(400, 420);
      const b = P(640, 420);
      const r = N.newShape(ed.nodes, p.id, N.rectPath(180 * m, 130 * m), a.x, a.y, '#3d5a63');
      r.cuts = [{ path: [{ x: -90 * m, y: 0 }, { x: 90 * m, y: 0 }], closed: false }];
      ed.nodes.push(r);
      const e = N.newShape(ed.nodes, p.id, N.ellipsePath(80 * m, 60 * m), b.x, b.y, '#c9c09a');
      ed.nodes.push(e);
      out = { rect: r.id, ellipse: e.id, up: { x: 400, y: 380 }, down: { x: 400, y: 460 }, mid: { x: 400, y: 420 }, ell: { x: 640, y: 420 } };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const shapeOf = (id) => page.evaluate((id) => {
    const s = window.tcGame.current.planeEditor.nodes.find((n) => n.id === id);
    return { fill: s.fill, regions: (s.regions ?? []).map((r) => ({ y: r.y, fill: r.fill })) };
  }, id);
  const editor = () => page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    return { color: ed.color, fillMode: ed.fillMode, swatches: ed.nodes.filter((n) => n.kind === 'swatch').map((s) => ({ id: s.id, color: s.color })), context: document.querySelector('.ze-context')?.textContent ?? '' };
  });
  // Form wählen, Farbmenü öffnen, in „Werte“ einen Hex-Wert eingeben: die ganze Form bekommt ihn
  await page.mouse.click(at.mid.x, at.mid.y);
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Werte")');
  const hex = page.locator('.ze-color .ze-hex input');
  await hex.fill('#a3665a');
  await hex.press('Enter');
  await sleep(150);
  const r1 = await shapeOf(at.rect);
  check(r1.fill === '#a3665a' && r1.regions.length === 0, `Farbmenü färbt die gewählte Form (${r1.fill}); die eine Leiste unten hat keine Farbtupfer mehr`);
  // ins Leere tippen hebt die Auswahl auf (das Menü bleibt offen)
  await page.mouse.click(300, 640);
  // aus der Platzhalter-Palette auf die Ellipse ziehen: gefüllt, danach „Weiter füllen“ (Esc schlösse hier das Menü)
  await page.click('.ze-ctabs .ze-btn:text-is("Paletten")');
  const chip = await page.locator('.ze-color .ze-chips').nth(1).locator('.ze-chip').nth(2).boundingBox();
  const drag = async (box, to) => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + 30, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await sleep(150);
  };
  await drag(chip, at.ell);
  const e1 = await shapeOf(at.ellipse);
  const s1 = await editor();
  check(e1.fill === '#8aa58c' && s1.fillMode === '#8aa58c' && /Weiter füllen/.test(s1.context), `Farbe auf die Ellipse gezogen (${e1.fill}), „Weiter füllen“ läuft`);
  await page.mouse.click(at.up.x, at.up.y);
  await sleep(100);
  await page.keyboard.press('Escape');
  const r2 = await shapeOf(at.rect);
  const s2 = await editor();
  check(r2.regions.length === 1 && r2.regions[0].fill === '#8aa58c' && r2.regions[0].y > 0 && s2.fillMode === null, `„Weiter füllen“: obere Fläche der Form angetippt und gefüllt, Esc beendet`);
  // Pipette: die Farbe der unteren Fläche aufnehmen
  await page.keyboard.press('i');
  await page.mouse.click(at.down.x, at.down.y);
  await sleep(100);
  const s3 = await editor();
  check(s3.color === '#a3665a', `Pipette nimmt die Farbe der unteren Fläche auf (${s3.color})`);
  await page.keyboard.press('v');
  // Feld der Zonenpalette anlegen, auf die untere Fläche ziehen, bearbeiten, löschen
  await page.click('.ze-color .ze-chip.add');
  await sleep(100);
  const s4 = await editor();
  const field = page.locator('.ze-color .ze-pchip').first();
  await drag(await field.boundingBox(), at.down);
  await page.keyboard.press('Escape');
  const r3 = await shapeOf(at.rect);
  const lower = () => r3.regions.find((r) => r.y < 0);
  check(s4.swatches.length === 1 && s4.swatches[0].color === '#a3665a' && lower()?.fill === `@${s4.swatches[0].id}`, `Feld ${s4.swatches[0]?.id} in der Zonenpalette, die untere Fläche verweist darauf (${lower()?.fill})`);
  await page.click('.ze-color .ze-csub .ze-btn:text-is("Bearbeiten")');
  await field.click();
  await sleep(150);
  await page.click('.ze-ctabs .ze-btn:text-is("Werte")');
  await hex.fill('#123456');
  await hex.press('Enter');
  await sleep(150);
  const s5 = await editor();
  const spot = await page.evaluate((p) => {
    const g = window.tcGame;
    if (g.current.view?.paper) g.current.view.paper.visible = false;
    for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
    return p;
  }, at.down);
  const png = await page.screenshot({ path: 'screenshots/scenario-19-farbmenue.png' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const px = (Math.round(spot.y) * info.width + Math.round(spot.x)) * info.channels;
  const got = [data[px], data[px + 1], data[px + 2]];
  const d = Math.max(...got.map((v, i) => Math.abs(v - [0x12, 0x34, 0x56][i])));
  check(s5.swatches[0].color === '#123456' && d <= 4, `Feld bearbeitet: die Fläche zeigt die neue Farbe (rgb(${got.join(', ')}))`);
  await page.click('.ze-cedit .ze-btn:text-is("Löschen")');
  await sleep(100);
  const r4 = await shapeOf(at.rect);
  const s6 = await editor();
  check(s6.swatches.length === 0 && r4.regions.find((r) => r.y < 0)?.fill === '#123456', 'Feld gelöscht: die Fläche behält seinen Wert');
  await page.keyboard.press('Meta+z');
  await sleep(100);
  const s7 = await editor();
  check(s7.swatches.length === 1, 'rückgängig: das Feld ist wieder da');
  await page.evaluate(() => {
    if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true;
  });
}

// 20. Zonen-Editor, Stufe 3: Verlaufswerkzeug (G). Über eine Fläche ziehen (rastet nahe 45° ein), Stopp auf die Linie
// tippen und färben, Stopp wegziehen löscht ihn, radial, umkehren, Deckkraftverlauf (durchsichtiges Mesh), Farbe auf
// eine Fläche mit Verlauf fallen lassen und als Stopp einsetzen, gemeinsamer Verlauf über zwei gewählte Formen.
if (want('20')) {
  await page.goto(`${BASE}?zone=szenario-verlauf&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const a = P(400, 420);
      const b = P(660, 420);
      const r = N.newShape(ed.nodes, p.id, N.rectPath(200 * m, 140 * m), a.x, a.y, '#3d5a63');
      r.cuts = [{ path: [{ x: -100 * m, y: 0 }, { x: 100 * m, y: 0 }], closed: false }];
      ed.nodes.push(r);
      const e = N.newShape(ed.nodes, p.id, N.ellipsePath(80 * m, 60 * m), b.x, b.y, '#c9c09a');
      ed.nodes.push(e);
      out = { rect: r.id, ellipse: e.id };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const grads = (id) => page.evaluate((id) => {
    const s = window.tcGame.current.planeEditor.nodes.find((n) => n.id === id);
    const pick = (fills) => (fills ?? []).filter((f) => f.type !== 'color').map((f) => ({ type: f.type, radial: !!f.radial, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, stops: f.stops.map((st) => [st.t, st.color, st.a]) }));
    return { shape: pick(s.fills), regions: (s.regions ?? []).map((r) => ({ y: r.y, fill: r.fill, grads: pick(r.fills) })) };
  }, id);
  const bar = () => page.evaluate(() => document.querySelector('.ze-context')?.textContent ?? '');
  await page.keyboard.press('g');
  // obere Fläche: von links nach rechts, 5 px schief (rastet waagrecht ein)
  await page.mouse.move(320, 385);
  await page.mouse.down();
  await page.mouse.move(400, 388, { steps: 5 });
  await page.mouse.move(480, 390, { steps: 5 });
  await page.mouse.up();
  await sleep(150);
  let g = await grads(at.rect);
  const up = g.regions.find((r) => r.y > 0);
  check(up?.grads.length === 1 && up.grads[0].type === 'gradient' && Math.abs(up.grads[0].y0 - up.grads[0].y1) < 1e-6 && up.grads[0].x1 > up.grads[0].x0, `Verlauf über die obere Fläche gezogen, nahe waagrecht rastet waagrecht ein (${up ? up.grads[0].stops.length : 0} Stopps)`);
  check(/Verlauf/.test(await bar()) && /Radial/.test(await bar()), 'Leiste des Verlaufswerkzeugs mit Linear, Radial, Umkehren, Entfernen');
  // Mitte der Linie antippen: neuer Stopp, im Farbmenü färben
  await page.mouse.click(400, 385);
  await sleep(100);
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Werte")');
  const hex = page.locator('.ze-color .ze-hex input');
  await hex.fill('#ffcc00');
  await hex.press('Enter');
  await page.click('.ze-colorbtn');
  await sleep(100);
  g = await grads(at.rect);
  let st = g.regions.find((r) => r.y > 0)?.grads[0].stops ?? [];
  check(st.length === 3 && Math.abs(st[1][0] - 0.5) < 0.05 && st[1][1] === '#ffcc00', `Stopp auf der Linie eingesetzt (bei ${st[1]?.[0].toFixed(2)}) und im Farbmenü gelb gefärbt`);
  // den mittleren Stopp weit von der Linie wegziehen: weg
  const stopPt = await page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    const s = ed.gradState();
    return ed.gradScreen(s).stops[1];
  });
  await page.mouse.move(stopPt.x, stopPt.y);
  await page.mouse.down();
  await page.mouse.move(stopPt.x + 5, stopPt.y + 40, { steps: 3 });
  await page.mouse.move(stopPt.x + 5, stopPt.y + 90, { steps: 3 });
  await page.mouse.up();
  await sleep(100);
  g = await grads(at.rect);
  st = g.regions.find((r) => r.y > 0)?.grads[0].stops ?? [];
  check(st.length === 2, `Stopp von der Linie weggezogen: entfernt (${st.length} Stopps)`);
  // radial und umkehren
  await page.click('.ze-context .ze-btn:text-is("Radial")');
  await page.click('.ze-context .ze-btn:text-is("Umkehren")');
  g = await grads(at.rect);
  const gr = g.regions.find((r) => r.y > 0)?.grads[0];
  check(gr?.radial && gr.stops[0][1] === st[1][1] && gr.stops[1][1] === st[0][1], 'radial geschaltet und umgekehrt');
  // Farbe der oberen Fläche messen: links (Anfang) und rechts unterscheiden sich
  // Deckkraftverlauf über die Ellipse: durchsichtiges Mesh
  await page.click('.ze-context .ze-btn:text-is("Deckkraft")');
  await page.mouse.move(600, 420);
  await page.mouse.down();
  await page.mouse.move(720, 420, { steps: 8 });
  await page.mouse.up();
  await sleep(150);
  const ge = await grads(at.ellipse);
  const clear = await page.evaluate(() => window.tcGame.world.planes.stats.clear);
  check(ge.shape.length === 1 && ge.shape[0].type === 'fade' && clear === 1, `Deckkraftverlauf über die Ellipse, die Fläche liegt im durchsichtigen Mesh (${clear})`);
  await page.click('.ze-context .ze-btn:text-is("Entfernen")');
  const ge2 = await grads(at.ellipse);
  check(ge2.shape.length === 0, 'Deckkraftverlauf entfernt');
  await page.click('.ze-context .ze-btn:text-is("Farbe")');
  // Farbe auf die Fläche mit Verlauf fallen lassen (Auswahlwerkzeug): die Leiste fragt, als Stopp einsetzen
  await page.keyboard.press('v');
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Paletten")');
  const chip = await page.locator('.ze-color .ze-chips').nth(1).locator('.ze-chip').nth(4).boundingBox();
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move(chip.x - 40, chip.y + 30, { steps: 4 });
  await page.mouse.move(400, 380, { steps: 10 });
  await page.mouse.up();
  await sleep(150);
  const asked = await bar();
  await page.click('.ze-context .ze-btn:text-is("Als Verlaufsstopp")');
  g = await grads(at.rect);
  st = g.regions.find((r) => r.y > 0)?.grads[0].stops ?? [];
  check(/Verlauf/.test(asked) && st.length === 3 && st.some((x) => x[1] === '#d9a07a'), `Farbe auf eine Fläche mit Verlauf: die Leiste fragt, als Stopp eingesetzt (${st.length} Stopps)`);
  await page.click('.ze-colorbtn');
  // zwei Formen wählen, gemeinsamer Verlauf über beide
  await page.mouse.click(400, 460);
  await page.keyboard.down('Shift');
  await page.mouse.click(660, 420);
  await page.keyboard.up('Shift');
  await page.keyboard.press('g');
  await page.mouse.move(330, 470);
  await page.mouse.down();
  await page.mouse.move(500, 460, { steps: 6 });
  await page.mouse.move(720, 450, { steps: 6 });
  await page.mouse.up();
  await sleep(150);
  const both = await page.evaluate(({ a, b }) => {
    const ed = window.tcGame.current.planeEditor;
    const plane = (id) => {
      const s = ed.nodes.find((n) => n.id === id);
      const f = (s.fills ?? []).find((x) => x.type === 'gradient');
      return f ? [s.x + s.sx * f.x0, s.y + s.sy * f.y0, s.x + s.sx * f.x1, s.y + s.sy * f.y1] : null;
    };
    return { a: plane(a), b: plane(b) };
  }, { a: at.rect, b: at.ellipse });
  const same = both.a && both.b && both.a.every((v, i) => Math.abs(v - both.b[i]) < 1e-3);
  check(!!same, 'zwei gewählte Formen: ein gemeinsamer Verlauf, in beiden an derselben Stelle der Ebene');
  await page.screenshot({ path: 'screenshots/scenario-20-verlauf.png' });
}

// 21. Zonen-Editor, Stufe 3: Füllstapel als Liste. Farbe dazu, im Farbmenü färben, Mischmodus „Multiplizieren“,
// Deckkraft durch waagrechtes Ziehen, Verlauf dazu und am Regler (G), ausblenden, entfernen; Ebenenstapel mit
// Luftperspektive (gemessen gegen evalLayers und den Anteil der Ebene).
if (want('21')) {
  await page.goto(`${BASE}?zone=szenario-stapel&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const a = P(400, 400);
      const r = N.newShape(ed.nodes, p.id, N.rectPath(200 * m, 140 * m), a.x, a.y, '#808080');
      ed.nodes.push(r);
      out = { rect: r.id, plane: p.id };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const fills = () => page.evaluate((id) => {
    const s = window.tcGame.current.planeEditor.nodes.find((n) => n.id === id);
    return { fill: s.fill, opacity: s.opacity ?? 1, fills: (s.fills ?? []).map((f) => ({ type: f.type, color: f.color, blend: f.blend, opacity: f.opacity, hidden: !!f.hidden })) };
  }, at.rect);
  const measure = () => page.evaluate(async ({ id }) => {
    const N = await import('/src/zone/nodes.ts');
    const P = await import('/src/zone/paint.ts');
    const g = window.tcGame;
    if (g.current.view?.paper) g.current.view.paper.visible = false;
    for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
    const ed = g.current.planeEditor;
    const s = ed.nodes.find((n) => n.id === id);
    const plane = ed.nodes.find((n) => n.id === s.parent);
    const sw = N.swatchMap(ed.nodes);
    let c = P.evalLayers(P.paintLayers(s, new Map(), { minX: 0, minY: 0, maxX: 1, maxY: 1 }).layers, 0, 0, sw);
    if (plane.fills) c = P.evalLayers(plane.fills, s.x, s.y, sw, 'day', c);
    const air = N.airOf(ed.nodes);
    const k = N.airAmount(air, plane);
    const ac = P.hexToRgb(air?.color ?? '#ffffff');
    const want = c.rgb.map((v, i) => Math.round((v + (ac[i] - v) * k) * 255));
    const q = ed.screenOf(plane, { x: s.x, y: s.y }, s);
    return { want, x: q.x, y: q.y, k };
  }, { id: at.rect });
  const pixel = async (m) => {
    const png = await page.screenshot();
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const i = (Math.round(m.y) * info.width + Math.round(m.x)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  await page.mouse.click(400, 400);
  await page.click('.ze-context .ze-btn:text-is("Füllungen")');
  check(await page.locator('.ze-stack.show .ze-srow').count() === 1, 'Füllstapel der Form: nur die Grundfarbe');
  await page.click('.ze-stack .ze-btn:text-is("+ Farbe")');
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Werte")');
  const hex = page.locator('.ze-color .ze-hex input');
  await hex.fill('#ff6020');
  await hex.press('Enter');
  await page.click('.ze-colorbtn');
  // Mischmodus über den Buchstaben
  await page.click('.ze-stack .ze-srow.on .ze-btn:text-is("N")');
  await page.click('.ze-stack .ze-blends .ze-btn:text-is("Multiplizieren")');
  // Deckkraft: 100 Bildpunkte nach links = 50 %
  const row = await page.locator('.ze-stack .ze-srow').first().locator('.ze-sname').boundingBox();
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + row.width / 2 - 50, row.y + row.height / 2, { steps: 4 });
  await page.mouse.move(row.x + row.width / 2 - 100, row.y + row.height / 2, { steps: 4 });
  await page.mouse.up();
  await sleep(150);
  let f = await fills();
  check(f.fills.length === 1 && f.fills[0].color === '#ff6020' && f.fills[0].blend === 'multiply' && Math.abs(f.fills[0].opacity - 0.5) < 0.02, `Farbe dazu, im Farbmenü gefärbt, Multiplizieren, Deckkraft gezogen (${Math.round(f.fills[0]?.opacity * 100)} %)`);
  let m = await measure();
  let got = await pixel(m);
  let d = Math.max(...got.map((v, i) => Math.abs(v - m.want[i])));
  check(d <= 4, `Bild wie evalLayers: rgb(${got.join(', ')}) statt rgb(${m.want.join(', ')})`);
  await page.evaluate(() => { if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true; });
  // Verlauf dazu, am Regler bearbeiten
  await page.click('.ze-stack .ze-btn:text-is("+ Verlauf")');
  await page.click('.ze-stack .ze-srow.on .ze-btn:text-is("Regler")');
  const tool = await page.evaluate(() => ({ tool: window.tcGame.current.planeEditor.tool, layer: window.tcGame.current.planeEditor.grad?.layer }));
  f = await fills();
  check(f.fills.length === 2 && f.fills[1].type === 'gradient' && tool.tool === 'gradient' && tool.layer === 1, `Verlauf dazu, „Regler“ öffnet ihn im Verlaufswerkzeug (Schicht ${tool.layer})`);
  await page.keyboard.press('v');
  await page.mouse.click(400, 400);
  // ausblenden und entfernen
  await page.locator('.ze-stack .ze-srow').first().locator('.ze-btn').first().click();
  f = await fills();
  const hid = f.fills[1]?.hidden;
  await page.locator('.ze-stack .ze-srow').first().locator('.ze-sname').click();
  await page.click('.ze-stack .ze-srow.on .ze-btn:text-is("×")');
  f = await fills();
  check(hid === true && f.fills.length === 1, 'Verlauf ausgeblendet, dann entfernt');
  await page.click('.ze-stack .ze-btn:text-is("Fertig")');
  // Ebenenstapel mit Luftperspektive
  await page.mouse.click(700, 680);
  await page.click('.ze-context .ze-btn:text-is("Ebenenstapel")');
  const field = (label) => page.locator('.ze-stack .ze-sair .ze-num', { hasText: label }).locator('input');
  for (const [label, v] of [['ab', '-10'], ['bis', '10'], ['%', '80'], ['Ebene %', '50']]) {
    await field(label).first().fill(v);
    await field(label).first().press('Enter');
    await sleep(80);
  }
  m = await measure();
  got = await pixel(m);
  d = Math.max(...got.map((v, i) => Math.abs(v - m.want[i])));
  check(Math.abs(m.k - 0.2) < 1e-6 && d <= 4, `Luftperspektive: Ebene bei 0 m zwischen -10 und 10 m, 80 %, Anteil 50 % → ${m.k.toFixed(2)}; Bild rgb(${got.join(', ')}) statt rgb(${m.want.join(', ')})`);
  await page.evaluate(() => { if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true; });
  await page.click('.ze-stack .ze-btn:text-is("+ Verlauf")');
  const pf = await page.evaluate((id) => window.tcGame.current.planeEditor.nodes.find((n) => n.id === id).fills?.length ?? 0, at.plane);
  check(pf === 1, 'Ebenenstapel: Verlauf über die ganze Ebene');
  await page.screenshot({ path: 'screenshots/scenario-21-stapel.png' });
}

// 22. Zonen-Editor, Stufe 3: Stile. Anstrich als Stil sichern, im Farbmenü auf eine andere Form legen, auf eine
// dritte ziehen (verknüpft, gemessen), Stil neu festlegen (alle ändern sich), lösen, kopieren und einfügen, Pipette mit
// Wahltaste, Stil löschen (die Formen behalten ihr Aussehen).
if (want('22')) {
  await page.goto(`${BASE}?zone=szenario-stile&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const mk = (x, w, fill) => {
        const c = P(x, 400);
        const s = N.newShape(ed.nodes, p.id, N.rectPath(w * m, 120 * m), c.x, c.y, fill);
        ed.nodes.push(s);
        return s;
      };
      const a = mk(300, 140, '#204060');
      a.fills = [{ type: 'gradient', stops: [{ t: 0, color: '#ffffff', a: 1 }, { t: 1, color: '#000000', a: 1 }], x0: -70 * m, y0: 0, x1: 70 * m, y1: 0, blend: 'multiply', opacity: 0.8 }];
      const b = mk(500, 160, '#888888');
      const c = mk(700, 120, '#c08040');
      out = { a: a.id, b: b.id, c: c.id, ax: 300, bx: 500, cx: 700 };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const shape = (id) => page.evaluate((id) => {
    const s = window.tcGame.current.planeEditor.nodes.find((n) => n.id === id);
    return { style: s.style ?? null, fill: s.fill, fills: (s.fills ?? []).length };
  }, id);
  const styles = () => page.evaluate(() => window.tcGame.current.planeEditor.nodes.filter((n) => n.kind === 'style').map((y) => ({ id: y.id, fill: y.fill, fills: (y.fills ?? []).length })));
  // A als Stil sichern
  await page.mouse.click(at.ax, 400);
  await page.click('.ze-context .ze-btn:text-is("Füllungen")');
  await page.click('.ze-stack .ze-btn:text-is("Als Stil")');
  const y1 = (await styles())[0];
  check(!!y1 && (await shape(at.a)).style === y1.id && y1.fills === 1, `Anstrich von A als Stil ${y1?.id} gesichert und verknüpft`);
  // B wählen, im Farbmenü › Stile antippen
  await page.mouse.click(at.bx, 400);
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Stile")');
  await page.click('.ze-color .ze-schip:not(.add)');
  check((await shape(at.b)).style === y1.id, 'Stil im Farbmenü auf B gelegt (verknüpft)');
  // auf C ziehen
  const chip = await page.locator('.ze-color .ze-schip:not(.add)').first().boundingBox();
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move(chip.x - 40, chip.y + 40, { steps: 4 });
  await page.mouse.move(at.cx, 400, { steps: 10 });
  await page.mouse.up();
  await sleep(150);
  check((await shape(at.c)).style === y1.id, 'Stil auf C gezogen (verknüpft)');
  // gemessen: C zeigt den Verlauf auf seinem Rahmen (links hell, rechts dunkel)
  const meas = await page.evaluate(async ({ id }) => {
    const N = await import('/src/zone/nodes.ts');
    const P = await import('/src/zone/paint.ts');
    const g = window.tcGame;
    if (g.current.view?.paper) g.current.view.paper.visible = false;
    for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
    const ed = g.current.planeEditor;
    const s = ed.nodes.find((n) => n.id === id);
    const plane = ed.nodes.find((n) => n.id === s.parent);
    const faces = N.shapeFaces(s);
    const box = { minX: Math.min(...s.path.map((q) => q.x)), minY: Math.min(...s.path.map((q) => q.y)), maxX: Math.max(...s.path.map((q) => q.x)), maxY: Math.max(...s.path.map((q) => q.y)) };
    const pl = P.paintLayers(N.facePaint(s, faces[0]), N.styleMap(ed.nodes), box);
    return [-0.35, 0.35].map((u) => {
      const lx = u * (box.maxX - box.minX);
      const c = P.evalLayers(pl.layers, lx, 0, N.swatchMap(ed.nodes));
      const q = ed.screenOf(plane, { x: s.x + lx, y: s.y }, s);
      return { x: q.x, y: q.y, want: c.rgb.map((v) => Math.round(v * 255)) };
    });
  }, { id: at.c });
  const png = await page.screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const dev = Math.max(...meas.map((m) => {
    const i = (Math.round(m.y) * info.width + Math.round(m.x)) * info.channels;
    return Math.max(...[0, 1, 2].map((k) => Math.abs(data[i + k] - m.want[k])));
  }));
  check(dev <= 4 && meas[0].want[0] > meas[1].want[0], `C zeigt den Stil auf seinem Rahmen (links ${meas[0].want.join('/')} → rechts ${meas[1].want.join('/')}, Abweichung ${dev})`);
  await page.evaluate(() => { if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true; });
  // A ändern (löst ihn), dann den Stil aus A neu festlegen: B und C ändern sich mit
  await page.click('.ze-colorbtn');
  await page.mouse.click(at.ax, 400);
  await page.click('.ze-stack .ze-btn:text-is("+ Farbe")');
  const aUnlinked = (await shape(at.a)).style === null;
  await page.click('.ze-colorbtn');
  await page.click('.ze-color .ze-csub .ze-btn:text-is("Bearbeiten")');
  await page.locator('.ze-color .ze-schip:not(.add)').first().click();
  await page.click('.ze-color .ze-cedit .ze-btn:text-is("Neu festlegen")');
  const y2 = (await styles())[0];
  check(aUnlinked && y2.fills === 2 && (await shape(at.b)).style === y1.id && (await shape(at.a)).style === y1.id, `A bearbeitet (gelöst), Stil aus A neu festgelegt: jetzt ${y2.fills} Füllungen für alle verknüpften`);
  await page.click('.ze-color .ze-cedit .ze-btn:text-is("Fertig")');
  await page.click('.ze-colorbtn');
  // B lösen, B kopieren, auf C einfügen (eine Kopie ohne Stil)
  await page.mouse.click(at.bx, 400);
  await page.click('.ze-stack .ze-btn:text-is("Lösen")');
  await page.keyboard.press('Meta+Alt+c');
  await page.mouse.click(at.cx, 400);
  await page.keyboard.press('Meta+Alt+v');
  const c2 = await shape(at.c);
  check((await shape(at.b)).style === null && c2.style === null && c2.fills === 2, 'B gelöst, kopiert und auf C eingefügt (eine eigene Kopie)');
  // Pipette mit Wahltaste: A nimmt den Anstrich von C
  await page.mouse.click(at.ax, 400);
  await page.keyboard.press('i');
  await page.keyboard.down('Alt');
  await page.mouse.click(at.cx, 400);
  await page.keyboard.up('Alt');
  await page.keyboard.press('v');
  const a3 = await shape(at.a);
  check(a3.style === null && a3.fills === 2 && a3.fill === c2.fill, 'Pipette mit Wahltaste: A bekommt den ganzen Anstrich von C');
  // Stil löschen: niemand verknüpft mehr, Aussehen bleibt
  await page.click('.ze-colorbtn');
  await page.click('.ze-color .ze-csub .ze-btn:text-is("Bearbeiten")');
  await page.locator('.ze-color .ze-schip:not(.add)').first().click();
  await page.click('.ze-color .ze-cedit .ze-btn:text-is("Löschen")');
  check((await styles()).length === 0, 'Stil gelöscht');
  await page.screenshot({ path: 'screenshots/scenario-22-stile.png' });
}

// 23. Zonen-Editor, Stufe 3: Looks als Palettentausch. Ein Feld der Zonenpalette bekommt im Look „Nacht“ eine eigene
// Farbe; beim Bearbeiten zeigt das Bild die Nacht, danach wieder den Tag; die Zonendatei hält beide Farben.
if (want('23')) {
  await page.goto(`${BASE}?zone=szenario-looks&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      ed.nodes.push({ id: 'c1', kind: 'swatch', name: 'Fels', color: '#aa3355' });
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const c = P(450, 400);
      const s = N.newShape(ed.nodes, p.id, N.rectPath(160 * m, 120 * m), c.x, c.y, '@c1');
      ed.nodes.push(s);
      out = { x: 450, y: 400 };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const pixel = async () => {
    await page.evaluate(() => {
      const g = window.tcGame;
      if (g.current.view?.paper) g.current.view.paper.visible = false;
      for (let i = 0; i < 3; i++) g.app.ticker.update(performance.now());
    });
    const png = await page.screenshot();
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const i = (Math.round(at.y) * info.width + Math.round(at.x)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const near = (a, hex) => Math.max(...a.map((v, i) => Math.abs(v - parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)))) <= 4;
  await page.click('.ze-colorbtn');
  await page.click('.ze-ctabs .ze-btn:text-is("Paletten")');
  const named = await page.locator('.ze-color .ze-pchip span').first().textContent();
  await page.click('.ze-color .ze-csub .ze-btn:text-is("Bearbeiten")');
  await page.locator('.ze-color .ze-pchip').first().click();
  await page.click('.ze-color .ze-clooks .ze-btn:has-text("Nacht")');
  const look1 = await page.evaluate(() => window.tcGame.world.currentLook);
  await page.click('.ze-ctabs .ze-btn:text-is("Werte")');
  const hex = page.locator('.ze-color .ze-hex input');
  await hex.fill('#112244');
  await hex.press('Enter');
  await sleep(100);
  const night = await pixel();
  await page.click('.ze-color .ze-cedit .ze-btn:text-is("Fertig")');
  const look2 = await page.evaluate(() => window.tcGame.world.currentLook);
  const day = await pixel();
  const saved = await page.evaluate(() => window.tcGame.current.planeEditor.nodes.find((n) => n.id === 'c1'));
  check(named === 'Fels' && look1 === 'night' && near(night, '#112244'), `Feld „${named}“ im Look Nacht bearbeitet: das Bild zeigt die Nacht (rgb(${night.join(', ')}))`);
  check(look2 === 'day' && near(day, '#aa3355') && saved.color === '#aa3355' && saved.looks?.night === '#112244', `nach „Fertig“ wieder Tag (rgb(${day.join(', ')})); das Feld hält Tag und Nacht`);
  await page.evaluate(() => { if (window.tcGame.current.view?.paper) window.tcGame.current.view.paper.visible = true; });
  await page.screenshot({ path: 'screenshots/scenario-23-looks.png' });
}

// 24. Zonen-Editor, Stufe 4: Andockkanten und Material. Werkzeug D zeigt die Oberkanten spielbarer Ebenen (auch den
// Boden einer Höhle), eine Kante antippen schaltet ihr Stück aus, eine Fläche antippen zeigt ihr Material; luftig trägt
// nicht; Material über die Leiste der Form.
if (want('24')) {
  await page.goto(`${BASE}?zone=szenario-kanten&editor=2&dev=1`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const p = N.newPlane(ed.nodes, 0);
      ed.nodes.push(p);
      const back = N.newPlane(ed.nodes, 30);
      back.role = 'backdrop';
      ed.nodes.push(back);
      const P = (x, y) => ed.planePoint(p, { x, y });
      const m = (P(460, 400).x - P(400, 400).x) / 60;
      const a = P(330, 470);
      const b = P(640, 430);
      const r = N.newShape(ed.nodes, p.id, N.rectPath(160 * m, 80 * m), a.x, a.y, '#5b7f7a');
      ed.nodes.push(r);
      const c = N.newShape(ed.nodes, p.id, N.rectPath(240 * m, 200 * m), b.x, b.y, '#3d5a63');
      c.holes = [N.ellipsePath(70 * m, 50 * m)];
      ed.nodes.push(c);
      const q = ed.planePoint(back, { x: 400, y: 250 });
      ed.nodes.push(N.newShape(ed.nodes, back.id, N.rectPath(30, 8), q.x, q.y, '#c6d4dc'));
      out = { rect: r.id, cave: c.id, plane: p.id };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  const info = () => page.evaluate(() => {
    const ed = window.tcGame.current.planeEditor;
    const e = ed.docks();
    return { edges: e.length, off: e.filter((x) => x.off).length, bar: document.querySelector('.ze-context')?.textContent ?? '', mids: e.map((x) => ({ shape: x.shape, s: ed.screenOf(ed.nodes.find((n) => n.id === x.plane), x.mid) })) };
  });
  await page.keyboard.press('d');
  await sleep(150);
  const i1 = await info();
  check(i1.edges === 3 && /3 Andockkanten/.test(i1.bar), `Werkzeug D: drei Andockkanten (Oberkante der Form, Oberkante und Boden der Höhle), die Kulisse hat keine (${i1.edges})`);
  // Oberkante der kleinen Form antippen: aus
  const top = i1.mids.find((m) => m.shape === at.rect).s;
  await page.mouse.click(top.x, top.y);
  await sleep(150);
  const i2 = await info();
  const off = await page.evaluate((id) => window.tcGame.current.planeEditor.nodes.find((n) => n.id === id).dockOff?.length ?? 0, at.rect);
  check(i2.off === 1 && off === 1 && /1 aus/.test(i2.bar), 'Kante angetippt: ihr Stück ist aus (die Form merkt sich einen Punkt daran)');
  // die Form selbst antippen: Material in der Leiste, luftig trägt nicht
  await page.mouse.click(top.x, top.y + 30);
  await sleep(100);
  await page.click('.ze-context .ze-btn:text-is("luftig")');
  await sleep(150);
  const i3 = await info();
  const mat = await page.evaluate((id) => window.tcGame.current.planeEditor.nodes.find((n) => n.id === id).material, at.rect);
  check(mat === 'airy' && i3.edges === 2, `Fläche angetippt, Material luftig: sie trägt nicht mehr (${i3.edges} Kanten)`);
  await page.screenshot({ path: 'screenshots/scenario-24-kanten.png' });
  // Material über die Leiste der Form
  await page.keyboard.press('v');
  const cave = i1.mids.find((m) => m.shape === at.cave).s;
  await page.mouse.click(cave.x + 100, cave.y + 20);
  await page.click('.ze-context .ze-btn:has-text("Material")');
  await page.click('.ze-context .ze-btn:text-is("fest")');
  const mat2 = await page.evaluate((id) => window.tcGame.current.planeEditor.nodes.find((n) => n.id === id).material, at.cave);
  check(mat2 === 'solid', 'Material der Höhle über die Leiste der Form: fest');
  // Handy-Link: Adresse der Zone im WLAN mit Bildrate
  await page.click('.ze-top .ze-btn:text-is("Handy")');
  await sleep(300);
  const url = await page.locator('.ze-phone.open code').first().textContent();
  check(/\?zone=szenario-kanten&dev=1$/.test(url ?? ''), `Handy-Link: ${url}`);
  await page.click('.ze-phone .ze-btn:text-is("Schließen")');
}

// 25. Zonen-Editor, Stufe 4: Spiel im Editor. Zwei spielbare Ebenen bauen, auf „Spielen“ schalten, mit dem Pinsel über
// die Oberkante der vorderen zeichnen (3 m darüber): die Bahn liegt in ihrer Tiefe (1 m davor), die Stützen stehen auf Andockkanten
// (kein flacher Boden mehr), die Fahrt läuft.
if (want('25')) {
  await page.goto(`${BASE}?zone=szenario-spiel&editor=2&dev=1&fast=6`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const at = await page.evaluate(async () => {
    const N = await import('/src/zone/nodes.ts');
    const ed = window.tcGame.current.planeEditor;
    let out = null;
    ed.edit(() => {
      const a = N.newPlane(ed.nodes, 8.4);
      ed.nodes.push(a);
      const b = N.newPlane(ed.nodes, 25.2);
      ed.nodes.push(b);
      const PA = (x, y) => ed.planePoint(a, { x, y });
      const left = PA(260, 470);
      const right = PA(1000, 470);
      const bottom = PA(640, 780);
      const w = right.x - left.x;
      const h = left.y - bottom.y;
      const sa = N.newShape(ed.nodes, a.id, N.rectPath(w, h), (left.x + right.x) / 2, (left.y + bottom.y) / 2, '#8aa58c');
      ed.nodes.push(sa);
      const PB = (x, y) => ed.planePoint(b, { x, y });
      const bl = PB(150, 300);
      const br = PB(1100, 300);
      const bb = PB(640, 790);
      const sb = N.newShape(ed.nodes, b.id, N.rectPath(br.x - bl.x, bl.y - bb.y), (bl.x + br.x) / 2, (bl.y + bb.y) / 2, '#5b7f7a');
      ed.nodes.push(sb);
      out = { a: a.id, top: left.y, x0: left.x, x1: right.x, za: a.z };
    });
    for (let i = 0; i < 3; i++) window.tcGame.app.ticker.update(performance.now());
    return out;
  });
  // Station auf die Kante der vorderen Ebene (Werkzeug D, „Station setzen“, links auf die Kante tippen)
  await page.keyboard.press('d');
  await page.click('.ze-context .ze-btn:text-is("Station setzen")');
  const sAt = await page.evaluate(({ a, top, x0 }) => {
    const ed = window.tcGame.current.planeEditor;
    return ed.screenOf(ed.nodes.find((n) => n.id === a), { x: x0 + 4, y: top });
  }, at);
  await page.mouse.click(sAt.x, sAt.y);
  await sleep(150);
  const stNode = await page.evaluate(() => window.tcGame.current.planeEditor.nodes.find((n) => n.kind === 'station') ?? null);
  check(!!stNode && stNode.parent === at.a, `Station auf die Andockkante gesetzt (Ebene ${stNode?.parent}, x ${stNode?.x?.toFixed(1)})`);
  await page.keyboard.press('v');
  // spielen: die Station steht mit Vorgabestück da
  await page.keyboard.press('Tab');
  await sleep(400);
  const piece = await page.evaluate(() => {
    const s = window.tcGame.current;
    const n0 = s.path?.nodes?.[0];
    return n0 ? { kind: n0.kind, y: n0.y, z: n0.z, nodes: s.path.nodes.length } : null;
  });
  check(piece?.kind === 'station' && Math.abs(piece.z - (at.za - 1) / 8.4) < 1e-6 && Math.abs(piece.y - (at.top + 1)) < 0.05, `Spielen: Vorgabestück der Station auf der Kante (Höhe ${piece?.y?.toFixed(2)}, Spur ${piece?.z?.toFixed(3)})`);
  // ab dem Ende des Vorgabestücks weiterzeichnen
  const pts = await page.evaluate(({ a, top, x0, x1 }) => {
    const ed = window.tcGame.current.planeEditor;
    const plane = ed.nodes.find((n) => n.id === a);
    const out = [];
    for (let k = 0; k <= 10; k++) {
      const x = x0 + 18 + ((x1 - x0 - 22) * k) / 10;
      // 3 m über der Kante: unter der Wunschhöhe (Bodenhöhe 4 m), also in ihrer Tiefe, und hoch genug für Stützen
      const q = ed.screenOf(plane, { x, y: top + 3 });
      out.push([q.x, q.y]);
    }
    return out;
  }, at);
  await stroke(pts, 8);
  await sleep(1500);
  const res = await page.evaluate(() => {
    const s = window.tcGame.current;
    const nodes = s.path?.nodes ?? [];
    return { mode: s.mode, nodes: nodes.length, z: nodes.map((n) => n.z), supports: window.tcGame.world.supportStats, brush: localStorage.getItem('tc.kamerawinkel'), stack: s.planeStack ? s.planeStack.planes.map((p) => ({ lane: p.lane, role: p.role, docks: p.docks.length })) : null, opts: (() => { const o = s.brushOptions(); return { depthAt: !!o.depthAt, groundAt: !!o.groundAt, zMax: o.zMax, holdLane: o.holdLane, field: !!o.field }; })() };
  });
  if (process.env.TC_DEBUG) console.log('  spiel', JSON.stringify(res));
  const want = (at.za - 1) / 8.4;
  const near = res.z.filter((z) => Math.abs(z - want) < 0.08).length;
  check(res.nodes >= 2 && near >= Math.ceil(res.z.length * 0.6), `Pinsel über der Oberkante: ${near} von ${res.z.length} Knoten in der Tiefe der Ebene (Spur ${want.toFixed(2)}; ${res.z.map((z) => z.toFixed(2)).join(' ')})`);
  const sup = res.supports ?? { ground: -1, element: 0 };
  check(sup.element > 0 && sup.ground === 0 && sup.rock === 0, `Stützen auf Andockkanten (${sup.element}), keine auf dem unsichtbaren Boden (${sup.ground})`);
  await page.screenshot({ path: 'screenshots/scenario-25-spiel.png' });
  // Probefahrt: die Bahn ist offen (keine Station), der Zug fährt bis zum Absperrband
  await page.mouse.click(640, 800 - 56);
  let ride = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    ride = await page.evaluate(() => {
      const s = window.tcGame.current;
      return { mode: s.mode, t: s.sim ? s.sim.t : 0, phase: s.sim?.phase ?? null, fail: s.sim?.failReason ?? null };
    });
    if (ride.mode === 'result' || ride.t > 2) break;
  }
  check(ride && (ride.t > 1 || ride.mode === 'result'), `Probefahrt im Spielen-Modus läuft (${ride?.mode}, ${Number(ride?.t ?? 0).toFixed(1)} s${ride?.fail ? `, ${ride.fail}` : ''})`);
}

await browser.close();
server?.kill('SIGTERM');
if (errors.length) console.error('Fehler:', errors.join('\n'));
console.log(failures.length ? `\n${failures.length} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(errors.length || failures.length ? 2 : 0);
