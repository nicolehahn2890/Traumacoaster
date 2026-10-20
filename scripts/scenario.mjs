/**
 * Szenario-Test: Looping zeichnen, Kurve zeichnen, Fahrt bis zum Ergebnis. Screenshots nach screenshots/scenario-*.png
 * Nutzt einen vorbereiteten Spielstand (Welt 1 fast komplett), damit Kurve und Looping frei sind.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.TC_URL ?? 'http://localhost:4173/';
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
page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.error('CONSOLE', m.text()); } });

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
const state = () => page.evaluate(() => {
  const s = window.tcGame.current;
  return { scene: s?.constructor?.name, mode: s?.mode, nodes: s?.path?.nodes?.length, loops: s?.stats?.loops, turns: s?.stats?.turns, lanes: s?.stats?.lanes, height: s?.stats?.maxHeight?.toFixed(1), sim: s?.sim ? { phase: s.sim.phase, fail: s.sim.failReason, t: s.sim.t.toFixed(1), coins: s.sim.stats.coins, maxG: s.sim.stats.maxG.toFixed(1), maxSpeed: (s.sim.stats.maxSpeed * 3.6).toFixed(0) } : null };
});

await page.goto(`${BASE}?scene=start&fast=6`, { waitUntil: 'networkidle' });
await sleep(1000);
await page.goto(`${BASE}?scene=start&fast=6&level=8`, { waitUntil: 'networkidle' });
await sleep(1200);
console.log('state', await state());
// Bahn mit Looping: Boden links, hoch, Schleife, runter
const gy = 560;
await stroke([[200, gy], [330, gy - 8], [430, 230], [520, 230], [640, gy - 40], [720, gy - 120], [700, gy - 220], [620, gy - 220], [600, gy - 130], [700, gy - 60], [900, gy - 20], [1100, gy]], 10);
await sleep(700);
console.log('after loop stroke', await state());
await page.screenshot({ path: 'screenshots/scenario-1-loop.png' });
// Kurve: Rückgängig, dann Strich nach rechts und oberhalb zurück nach links
await page.keyboard.press('Control+z');
await sleep(300);
await stroke([[220, gy], [500, gy - 120], [900, gy - 20], [1000, gy - 60], [950, gy - 110], [700, gy - 130], [400, gy - 115]], 10);
await sleep(700);
console.log('after turn stroke', await state());
await page.screenshot({ path: 'screenshots/scenario-2-turn.png' });
// Fahrt bis zum Ende
await page.keyboard.press('Control+z');
await sleep(300);
await stroke([[200, gy], [330, gy - 8], [430, 230], [520, 230], [640, gy - 40], [720, gy - 120], [700, gy - 220], [620, gy - 220], [600, gy - 130], [700, gy - 60], [900, gy - 20], [1100, gy]], 10);
await sleep(600);
await page.mouse.click(640, 800 - 56);
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const st = await state();
  if (i % 5 === 0) console.log('ride', st.sim, st.mode);
  if (st.mode === 'result') break;
}
await sleep(800);
console.log('final', await state());
await page.screenshot({ path: 'screenshots/scenario-3-result.png' });
await browser.close();
server?.kill('SIGTERM');
if (errors.length) { console.error('Fehler:', errors.join('\n')); process.exit(2); }
process.exit(0);
