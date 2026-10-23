/**
 * Selbstkritischer Spieltest: handähnliche Striche (Zittern, Tremor, ungleichmäßige Geschwindigkeit),
 * Nahaufnahmen von Bahn, Schluss und Wagen. Erzeugt screenshots/playtest-*.png und schreibt Kennzahlen.
 *   node scripts/playtest.mjs            # alle Fälle
 *   node scripts/playtest.mjs hill close # einzelne Fälle
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.TC_URL ?? 'http://localhost:4173/';
const ONLY = process.argv.slice(2);
const want = (c) => ONLY.length === 0 || ONLY.includes(c);
mkdirSync('screenshots', { recursive: true });
let server = null;
const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i++) await sleep(500);
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const stars = {};
  for (let i = 1; i <= 14; i++) stars[i] = 1;
  // auf about:blank gibt es keinen Speicher (Zwischenseite beim Levelwechsel)
  try { localStorage.setItem('traumacoaster.v1', JSON.stringify({ progress: { stars, highest: 14, current: 4, drafts: {} }, settings: { rideSpeed: 3 } })); } catch { /* ignorieren */ }
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

// deterministischer Zufall
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.9;

const toScreen = (pts) => page.evaluate((pts) => pts.map(([X, Y]) => { const p = window.tcGame.current.view.camera.toScreen(X, Y); return [p.x, p.y]; }), pts);

/** Handstrich: Catmull-Rom durch die Stützpunkte, dazu Zittern (σ in Bühnen-Metern) und Tremor */
async function handStroke(stagePts, jitter = 0.35, stepM = 0.4) {
  // in Bühnen-Metern verdichten
  const P = (i) => stagePts[Math.max(0, Math.min(stagePts.length - 1, i))];
  const dense = [];
  for (let i = 0; i < stagePts.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(segLen / stepM));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      dense.push([x, y]);
    }
  }
  dense.push(stagePts[stagePts.length - 1]);
  // Zittern + langsamer Tremor
  let tremor = 0;
  const noisy = dense.map(([x, y], i) => {
    tremor = tremor * 0.85 + gauss() * jitter * 0.5;
    return [x + gauss() * jitter * 0.6, y + gauss() * jitter + tremor];
  });
  const scr = await toScreen(noisy);
  await page.mouse.move(scr[0][0], scr[0][1]);
  await page.mouse.down();
  for (const [x, y] of scr.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
}

const state = () => page.evaluate(() => {
  const s = window.tcGame.current;
  const st = s?.stats;
  const nodes = s?.path?.nodes ?? [];
  const kinds = {};
  for (const n of nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  // Krümmungs-Spitzen und Tiefen-Unruhe aus den Abtastwerten
  let maxK = 0; let zJitter = 0;
  const sm = s?.samples;
  if (sm) {
    for (let i = 1; i < sm.count; i++) {
      if (sm.auto[i]) continue;
      maxK = Math.max(maxK, Math.hypot(sm.k3x[i], sm.k3y[i], sm.k3z[i]));
      zJitter += Math.abs(sm.z[i] - sm.z[i - 1]);
    }
  }
  return { closed: s?.path?.closed, nodes: nodes.length, kinds, loops: st?.loops, turns: st?.turns, lanes: st?.lanes, height: st?.maxHeight?.toFixed(1), minRadius: maxK ? (1 / maxK).toFixed(1) : '-', zTravel: zJitter.toFixed(2) };
});

async function zoomAt(X, Y, zoom) {
  await page.evaluate(([X, Y, zoom]) => { const c = window.tcGame.current.view.camera; c.set(X, Y, zoom); }, [X, Y, zoom]);
  await sleep(300);
}
page.setDefaultTimeout(20000);
/** Level öffnen: frische Seite (about:blank dazwischen), auf die Szene warten statt auf „networkidle“ */
const openLevel = async (lvl) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}?scene=start&fast=6&level=${lvl}&stage&scroll=0`, { waitUntil: 'load' });
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() => !!(window.tcGame?.current?.view?.camera && window.tcGame.current.mode === 'draw')).catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(600);
};
const play = async (tag, shots = [4, 8, 12]) => {
  await page.mouse.click(640, 800 - 56);
  let n = 0;
  for (let i = 0; i < 80; i++) {
    await sleep(400);
    const st = await page.evaluate(() => { const s = window.tcGame.current; const c = s?.sim?.cars?.[0]; return { mode: s?.mode, t: s?.sim?.t ?? 0, phase: s?.sim?.phase, fail: s?.sim?.failReason, car: c ? { x: c.x, y: c.y, z: c.z, bank: Math.round((c.bank * 180) / Math.PI), g: c.gSeat.toFixed(1) } : null }; });
    if (n < shots.length && st.t >= shots[n]) {
      n++;
      await page.screenshot({ path: `screenshots/playtest-${tag}-ride${n}.png` });
      console.log(`  ride shot ${n}`, st.car, st.phase, st.fail ?? '');
    }
    if (st.mode === 'result') { console.log('  result:', st.phase, st.fail ?? 'ok'); break; }
  }
  await sleep(500);
  await page.screenshot({ path: `screenshots/playtest-${tag}-result.png` });
};

await page.goto(`${BASE}?scene=start&fast=6&stage&scroll=0`, { waitUntil: 'networkidle' });
await sleep(600);

// 1) Hügel mit Zittern, offen lassen, Nahaufnahme der Bahn
if (want('hill')) {
  await openLevel(1);
  await handStroke([[0, 0], [5, 0.5], [9, 5], [13, 12], [17, 13], [22, 9], [28, 3], [36, 0.5], [50, 0]]);
  await sleep(700);
  console.log('hill', await state());
  await page.screenshot({ path: 'screenshots/playtest-hill-full.png' });
  await zoomAt(14, 7, 28);
  await page.screenshot({ path: 'screenshots/playtest-hill-zoom.png' });
  await zoomAt(30, 2, 34);
  await page.screenshot({ path: 'screenshots/playtest-hill-foot.png' });
  await play('hill', [3, 5, 7]);
}

// 2) Kreis von Hand schließen (Hügel, Bogen hinten herum, zurück zur Station), Schluss in Nahaufnahme
if (want('close')) {
  await openLevel(4);
  const R = 4.2;
  await handStroke([[0, 0], [5, 0.4], [9, 6], [13, 15], [17, 18], [22, 13], [28, 5], [36, 1], [46, 0.5], [54, 0.4 * R], [57, 1.1 * R], [54, 1.8 * R], [44, 2 * R], [25, 2 * R], [8, 2 * R], [-2, 1.6 * R], [-5, 0.8 * R], [-2, 0.1 * R], [1, 0]]);
  await sleep(700);
  console.log('close', await state());
  await page.screenshot({ path: 'screenshots/playtest-close-full.png' });
  await zoomAt(0, 3, 30);
  await page.screenshot({ path: 'screenshots/playtest-close-station.png' });
  await zoomAt(55, 4, 26);
  await page.screenshot({ path: 'screenshots/playtest-close-farend.png' });
  await play('close', [4, 7, 10]);
}

// 3) Bogen in der Höhe (muss Kurve sein, kein Looping) mit Zittern
if (want('arc')) {
  await openLevel(5);
  await handStroke([[0, 0], [5, 0.4], [9, 6], [13, 15], [17, 16], [24, 12], [32, 9], [42, 9], [49, 10.5], [52, 14], [48, 17], [40, 17.5], [28, 17], [18, 15], [10, 9], [4, 4.6], [-4, 4.2]]);
  await sleep(700);
  console.log('arc', await state());
  await page.screenshot({ path: 'screenshots/playtest-arc-full.png' });
  await zoomAt(48, 12, 26);
  await page.screenshot({ path: 'screenshots/playtest-arc-turn.png' });
  await play('arc', [4, 6, 8]);
}

// 4) Looping klar gezeichnet vs. kleiner unsauberer Schnörkel
if (want('loop')) {
  await openLevel(8);
  await handStroke([[0, 0], [5, 0.4], [9, 6], [13, 15], [17, 19], [25, 15], [33, 7], [40, 3], [46, 3.5], [50, 8], [48, 12.5], [43, 13], [38, 9], [40, 4], [46, 2], [60, 0.4], [74, 0.2]]);
  await sleep(700);
  console.log('loop clear', await state());
  await page.screenshot({ path: 'screenshots/playtest-loop-clear.png' });
  await page.keyboard.press('Control+z');
  await sleep(300);
  // kleiner Schnörkel auf der Abfahrt (so etwas passiert beim Zeichnen) → darf kein Looping sein
  await handStroke([[0, 0], [5, 0.4], [9, 6], [13, 15], [17, 19], [25, 15], [31, 9], [33, 8], [34, 9.5], [32.5, 10], [32, 8.5], [36, 5], [44, 1], [60, 0.4], [74, 0.2]], 0.3);
  await sleep(700);
  console.log('loop scribble', await state());
  await page.screenshot({ path: 'screenshots/playtest-loop-scribble.png' });
  await zoomAt(33, 9, 30);
  await page.screenshot({ path: 'screenshots/playtest-loop-scribble-zoom.png' });
}

// 5) Wagen in Nahaufnahme (gerade, Kurve, Looping)
if (want('cars')) {
  await openLevel(8);
  await handStroke([[0, 0], [5, 0.4], [9, 6], [13, 15], [17, 19], [25, 15], [33, 7], [40, 3], [46, 3.5], [50, 8], [48, 12.5], [43, 13], [38, 9], [40, 4], [46, 2], [60, 0.4], [74, 0.2]], 0.15);
  await sleep(600);
  await page.mouse.click(640, 800 - 56);
  for (const [t, name] of [[2.2, 'lift'], [5.2, 'drop'], [6.4, 'loop'], [9, 'flat']]) {
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      const st = await page.evaluate(() => { const s = window.tcGame.current; const c = s?.sim?.cars?.[0]; return { t: s?.sim?.t ?? 0, mode: s?.mode, c: c ? [c.x, c.y, c.z, c.upy] : null }; });
      if (st.mode === 'result' || st.t >= t) {
        if (st.c) {
          // Fahrt für das Foto anhalten (Zeitraffer), Kamera auf den Wagen, danach weiterfahren
          await page.evaluate(([x, y, z]) => { const s = window.tcGame.current; s.__step = s.sim.step; s.sim.step = () => {}; s.cameraPhase = 'manual'; const k = Math.pow(0.94, z); s.view.camera.set(x * k, (y + 0.8) * k + 4.2 * z, 40); s.view.camera.snap?.(); }, st.c);
          await sleep(300);
          await page.screenshot({ path: `screenshots/playtest-cars-${name}.png` });
          await page.evaluate(() => { const s = window.tcGame.current; if (s.__step) s.sim.step = s.__step; s.cameraPhase = 'follow'; });
          console.log('cars', name, st.c);
        }
        break;
      }
    }
  }
  // Fahrt beenden, damit die Seite beim Levelwechsel nicht mehr unter Volllast rechnet
  await page.evaluate(() => window.tcGame.current.stopRide?.()).catch(() => {});
  await sleep(300);
}

// 6) Level 4 („Hoch hinaus“): Lifthügel durch die Coins am Hang, 18 m, Fahrt bis ins Ziel
if (want('level4')) {
  await openLevel(4);
  await handStroke([[0, 0], [6, 0.6], [11, 3.5], [16, 7.5], [21, 11.5], [26, 15.5], [30, 19], [34, 19.5], [39, 15], [45, 7], [52, 3], [60, 0.6], [68, 0]]);
  await sleep(700);
  console.log('level4', await state());
  await page.screenshot({ path: 'screenshots/playtest-level4-full.png' });
  await play('level4', [3, 6, 9]);
  const res = await page.evaluate(() => { const s = window.tcGame.current; return { height: s?.stats?.maxHeight?.toFixed(1), coins: s?.sim?.stats?.coins, phase: s?.sim?.phase, fail: s?.sim?.failReason }; });
  console.log('level4 result', res, res.coins >= 3 && Number(res.height) >= 18 && res.phase === 'done' ? 'GESCHAFFT' : 'NICHT GESCHAFFT');
}

await browser.close();
server?.kill('SIGTERM');
