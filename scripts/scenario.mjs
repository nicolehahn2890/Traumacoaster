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
    };
  });
  console.log('zone', zone);
  check(zone.world, 'Weltrenderer läuft mit ?zone=');
  check(zone.name === 'probe' && JSON.stringify(zone.counts) === '[3,1,1,1,1,1]', `Prüfzone geladen (Elemente, Felder, Station, Schlange, Baustelle, Coins: ${JSON.stringify(zone.counts)})`);
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
  // dieselbe Datei noch einmal gelesen ergibt denselben Stand (deterministisch)
  const again = await page.evaluate(async () => {
    const res = await fetch(`${location.pathname.replace(/[^/]*$/, '')}zones/probe/zone.json`, { cache: 'no-store' });
    const file = await res.json();
    const z = window.tcGame.current.sandbox.zone;
    // Schlüssel sortiert vergleichen: die Reihenfolge in der Datei ist egal, der Inhalt muss gleich sein
    const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
    return { fileElements: file.elements.length, sameStation: canon(file.stations[0]) === canon(z.stations[0]), sameField: canon(file.fields[0]) === canon(z.fields[0]) };
  });
  check(again.fileElements === 3 && again.sameStation && again.sameField, 'Zonendatei und geladener Stand stimmen überein');
  await page.screenshot({ path: 'screenshots/scenario-10-zone.png' });
}

await browser.close();
server?.kill('SIGTERM');
if (errors.length) console.error('Fehler:', errors.join('\n'));
console.log(failures.length ? `\n${failures.length} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(errors.length || failures.length ? 2 : 0);
