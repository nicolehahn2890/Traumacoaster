/**
 * Szenario-Test für das Bühnen-Zeichnen v2 (Boden = Tiefe, steil = Höhe):
 *  1. flaches Oval am Boden → 2 Kurven, 3 Spuren, kein Looping; Fahrt mit Schräglage bis ins Ziel
 *  2. steiler Hügel mit Kehre in der Höhe → 1 Steilkurve in die Nachbarspur, Wagen nie kopfüber
 *  3. Looping in der Luft → 1 Looping, Fahrt kopfüber und wieder aufrecht
 *  4. Löschen-Knopf, Überzeichnen (Hügel in eine flache Bahn)
 * Screenshots nach screenshots/scenario-*.png. Nutzt einen vorbereiteten Spielstand (Welt 1 fast komplett).
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

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

/** Weicher Strich: Catmull-Rom durch die Stützpunkte, wie ein echter Finger */
async function stroke(points, steps = 8) {
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (let i = 0; i < points.length - 1; i++) {
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
const strokeStage = async (pts, steps = 8) => stroke(await toScreen(pts), steps);

const state = () => page.evaluate(() => {
  const s = window.tcGame.current;
  const car = s?.sim?.cars?.[0];
  return {
    scene: s?.constructor?.name, mode: s?.mode, nodes: s?.path?.nodes?.length ?? 0,
    loops: s?.stats?.loops, turns: s?.stats?.turns, lanes: s?.stats?.lanes, height: s?.stats?.maxHeight?.toFixed(1),
    sim: s?.sim ? { phase: s.sim.phase, fail: s.sim.failReason, t: s.sim.t.toFixed(1), coins: s.sim.stats.coins, maxG: s.sim.stats.maxG.toFixed(1), maxLat: s.sim.stats.maxLatG.toFixed(2), maxSpeed: (s.sim.stats.maxSpeed * 3.6).toFixed(0), inversions: s.sim.stats.inversions } : null,
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
const openLevel = async () => {
  await page.goto(`${BASE}?scene=start&fast=6&level=8`, { waitUntil: 'networkidle' });
  await sleep(1200);
};

await page.goto(`${BASE}?scene=start&fast=6`, { waitUntil: 'networkidle' });
await sleep(800);

// ---------------------------------------------------------------- 1. Oval am Boden
if (want('1')) {
await openLevel();
console.log('state', await state());
const oval = [[2, 0], [20, 0], [40, 0], [48, 0.3 * R], [50, R], [48, 1.7 * R], [40, 2 * R], [20, 2 * R], [2, 2 * R], [-6, 1.7 * R], [-8, R], [-6, 0.3 * R], [0, 0], [2, 0]];
await strokeStage(oval, 10);
await sleep(800);
st = await state();
console.log('after oval', st);
check(st.turns === 2, `Oval: 2 Kurven (ist ${st.turns})`);
check(st.lanes === 2, `Oval: 2 Spuren (vorne und hinten, ist ${st.lanes})`);
check(st.loops === 0, `Oval: kein Looping (ist ${st.loops})`);
check(Number(st.height) < 3, `Oval: bleibt am Boden (Höhe ${st.height})`);
await page.screenshot({ path: 'screenshots/scenario-1-oval.png' });
// Fahrt (ohne Hügel gibt es keinen Schwung → Stillstand erwartet)
r = await ride('1-oval', 2);
check(r.st.sim?.fail === 'stall', `Oval ohne Hügel: Zug rollt aus und bleibt stehen (ist ${r.st.sim?.fail})`);
}

// ---------------------------------------------------------------- 2. Hügel + Oval am Boden, Fahrt mit Schräglage
if (want('2')) {
await openLevel();
const hillOval = [[0, 0], [6, 1], [10, 6], [14, 13], [18, 14], [22, 11], [28, 3], [34, 0.3], [44, 0], [54, 0.3 * R], [56, R], [54, 1.7 * R], [44, 2 * R], [20, 2 * R], [2, 2 * R], [-6, 1.7 * R], [-8, R], [-6, 0.3 * R], [0, 0]];
await strokeStage(hillOval, 10);
await sleep(800);
st = await state();
console.log('after hill+oval', st);
check(st.turns === 2 && st.lanes === 2 && st.loops === 0, `Hügel+Oval: 2 Kurven, 2 Spuren (vorne und hinten), 0 Loopings (ist ${st.turns}/${st.lanes}/${st.loops})`);
check(Number(st.height) > 11, `Hügel+Oval: Hügel ist Höhe (${st.height} m)`);
await page.screenshot({ path: 'screenshots/scenario-2-hill-oval.png' });
r = await ride('2-hill-oval', 9);
console.log('ride result', r);
check(r.st.sim?.phase === 'done', `Hügel+Oval: Fahrt kommt an (ist ${r.st.sim?.phase}/${r.st.sim?.fail})`);
check(r.minUp > 0.3, `Hügel+Oval: Wagen steht nie Kopf (min upy ${r.minUp})`);
check(r.maxBank > 15, `Hügel+Oval: Wagen legt sich in die Kurve (max Schräglage ${r.maxBank}°)`);
}

// ---------------------------------------------------------------- 3. Steilkurve in der Höhe
if (want('3')) {
await openLevel();
// Lifthügel, Drop auf 10 m, Kehre in der Höhe (Rückweg 2 m höher = nach hinten), Abfahrt auf die Bodenlinie der Spur 1
const hairpin = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 18], [24, 14], [30, 10], [40, 10], [46, 10.2], [50, 12], [46, 13.8], [40, 14], [26, 14], [18, 13.2], [10, 10], [2, 6], [-4, R + 0.3], [-12, R]];
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
const loop = [[0, 0], [6, 1], [10, 7], [14, 16], [18, 20], [26, 16], [34, 7], [40, 3], [46, 3.5], [50, 8], [48, 12.5], [43, 13], [38, 9], [40, 4], [46, 2], [60, 0.4], [74, 0.2]];
await strokeStage(loop, 10);
await sleep(800);
st = await state();
console.log('after loop', st);
check(st.loops === 1, `Looping: 1 Looping (ist ${st.loops})`);
check(st.lanes === 1, `Looping: bleibt in der Spur (ist ${st.lanes})`);
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
await strokeStage([[0, 0], [20, 0.1], [40, 0], [60, 0.1]], 10);
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

await browser.close();
server?.kill('SIGTERM');
if (errors.length) console.error('Fehler:', errors.join('\n'));
console.log(failures.length ? `\n${failures.length} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(errors.length || failures.length ? 2 : 0);
