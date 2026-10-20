/**
 * Playwright-Screenshots aller Szenen in Hoch-, Quer- und Desktop-Format.
 * Voraussetzung: `npm run build` und ein laufender `npm run preview` (Port 4173),
 * oder dieses Skript startet den Preview-Server selbst.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.TC_URL ?? 'http://localhost:4173/';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* noch nicht da */
    }
    await sleep(500);
  }
  return false;
}

let server = null;
if (!(await waitForServer(BASE, 2))) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'inherit' });
  if (!(await waitForServer(BASE))) {
    console.error('Preview-Server nicht erreichbar');
    process.exit(1);
  }
}

const viewports = [
  { name: 'phone-portrait', width: 390, height: 844, mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
];

/** Zeichnet einen Strich per Pointer-Events (Bildschirmkoordinaten) */
async function drawStroke(page, points, steps = 6) {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      await page.mouse.move(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
  }
  await page.mouse.up();
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.mobile, isMobile: vp.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    errors.push(`${vp.name}: ${e.message}\n${e.stack ?? ''}`);
    console.error('pageerror', vp.name, e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`${vp.name} console: ${m.text()}`);
      console.error('console', vp.name, m.text());
    }
  });
  // Splash
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${vp.name}-1-splash.png` });
  // Start
  await page.goto(`${BASE}?scene=start&fast=4`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/${vp.name}-2-start.png` });
  // Level 1 öffnen über "Spielen" (Button unten Mitte)
  await page.mouse.click(vp.width / 2, vp.height - (vp.height > vp.width ? 70 : 54));
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/${vp.name}-3-level-empty.png` });
  // Hügel zeichnen: Start auf dem Boden links, hoch, runter, rechts
  const gy = vp.height * (vp.height > vp.width ? 0.6 : 0.68);
  const x0 = vp.width * 0.18;
  const x1 = vp.width * 0.82;
  const top = vp.height * (vp.height > vp.width ? 0.38 : 0.3);
  await drawStroke(page, [
    [x0, gy], [x0 + (x1 - x0) * 0.2, gy - 4], [x0 + (x1 - x0) * 0.42, top], [x0 + (x1 - x0) * 0.58, top + 6], [x0 + (x1 - x0) * 0.78, gy - 10], [x1, gy],
  ], 10);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/${vp.name}-4-level-drawn.png` });
  // Fahrt starten
  await page.mouse.click(vp.width / 2, vp.height - (vp.height > vp.width ? 64 : 56));
  await sleep(2600);
  await page.screenshot({ path: `${OUT}/${vp.name}-5-ride.png` });
  await sleep(9000);
  await page.screenshot({ path: `${OUT}/${vp.name}-6-result.png` });
  // Figuren-Editor und Meine Bahnen über den Startscreen
  await page.goto(`${BASE}?scene=start`, { waitUntil: 'networkidle' });
  await sleep(800);
  await page.mouse.click(110, 44);
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/${vp.name}-7-editor.png` });
  await page.goto(`${BASE}?scene=start`, { waitUntil: 'networkidle' });
  await sleep(800);
  await page.mouse.click(vp.width - 115, 44);
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/${vp.name}-8-mytracks.png` });
  await ctx.close();
}
await browser.close();
server?.kill('SIGTERM');
if (errors.length) {
  console.error('Fehler im Browser:\n' + errors.join('\n'));
  process.exit(2);
}
console.log(`Screenshots in ./${OUT}`);
process.exit(0);
