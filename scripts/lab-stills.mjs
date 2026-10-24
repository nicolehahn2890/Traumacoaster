/**
 * Standbilder des Tiefen-Labors (public/labs/tiefe.html) für die Doku: ein Bild je Einstellung, Handy-Querformat.
 * Voraussetzung: laufender Dev-Server (npm run dev), Chromium für Playwright installiert.
 *   node scripts/lab-stills.mjs [http://localhost:5173]
 * Schreibt docs/research/labs/tiefe-<name>.jpg und misst je Einstellung Bildrate und Draw Calls (Konsole).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'docs/research/labs';
mkdirSync(out, { recursive: true });

const shots = [
  ['ortho', 'cam=ortho&zoom=7&hud=0'],
  ['persp22', 'cam=persp&fov=22&zoom=7&hud=0'],
  ['persp22-strich', 'cam=persp&fov=22&zoom=7&lines=1&hud=0'],
  ['persp40', 'cam=persp&fov=40&zoom=7&hud=0'],
  ['nacht', 'cam=persp&fov=22&zoom=7&look=night&hud=0'],
  ['neon', 'cam=persp&fov=22&zoom=7&look=neon&hud=0'],
  ['vulkan', 'cam=persp&fov=22&zoom=7&look=lava&hud=0'],
  ['abend', 'cam=persp&fov=22&zoom=7&look=dusk&hud=0'],
  ['hoehle', 'cam=persp&fov=22&zoom=6&cx=92&cy=-2&reveal=1&hud=0'],
  ['schatten-map', 'cam=persp&fov=22&zoom=12&cx=118&cy=6&shadow=map&hud=0'],
  ['schatten-fake', 'cam=persp&fov=22&zoom=12&cx=118&cy=6&shadow=fake&hud=0'],
  ['schatten-aus', 'cam=persp&fov=22&zoom=12&cx=118&cy=6&shadow=off&hud=0'],
  ['dolly22-zoom14', 'cam=persp&fov=22&lens=0&zoom=14&cx=118&cy=6&hud=0'],
  ['linse22-zoom14', 'cam=persp&fov=22&lens=1&zoom=14&cx=118&cy=6&hud=0'],
  ['stress120', 'cam=persp&fov=22&zoom=7&stress=3&hud=0'],
  ['bahn-strasse', 'cam=persp&fov=22&zoom=14&cx=36&cy=9&track=road&hud=0'],
  ['bahn-strasse-verrueckt', 'cam=persp&fov=22&zoom=14&cx=36&cy=9&track=road&sup=crazy&hud=0'],
  ['bahn-stahl', 'cam=persp&fov=22&zoom=12&cx=120&cy=8&track=steel&hud=0'],
  ['bahn-holz', 'cam=persp&fov=22&zoom=14&cx=36&cy=9&track=wood&hud=0'],
  ['bahn-holz-verrueckt', 'cam=persp&fov=22&zoom=14&cx=36&cy=9&track=wood&sup=crazy&hud=0'],
  ['bahn-haengebahn', 'cam=persp&fov=22&zoom=14&cx=36&cy=9&track=hanging&hud=0'],
  ['bahn-baumfenster', 'cam=persp&fov=22&zoom=12&cx=176&cy=11&track=wood&sup=crazy&feet=1&hud=0'],
  ['bahn-felsfenster', 'cam=persp&fov=22&zoom=11&cx=140&cy=10&track=steel&feet=1&hud=0'],
  ['bahn-hoehle', 'cam=persp&fov=22&zoom=9&cx=92&cy=-6&track=road&reveal=1&feet=1&hud=0'],
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1170, height: 540 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const [name, params] of shots) {
  await page.goto(`${base}/labs/tiefe.html?${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.lab && window.lab.fps > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => ({ fps: +window.lab.fps.toFixed(0), ms: +window.lab.ms.toFixed(1), calls: window.lab.renderer.info.render.calls, tris: window.lab.renderer.info.render.triangles }));
  await page.screenshot({ path: `${out}/tiefe-${name}.jpg`, type: 'jpeg', quality: 82 });
  console.log(name.padEnd(16), JSON.stringify(stats));
}
// Messung der Projektion (Abweichung vom Strich, Maßstab je Spur, Parallaxe)
await page.goto(`${base}/labs/tiefe.html?cam=persp&fov=22&zoom=8&hud=0`, { waitUntil: 'load' });
await page.waitForFunction(() => window.lab && window.lab.fps > 0, null, { timeout: 60000 });
for (const fov of [12, 22, 35]) {
  const txt = await page.evaluate((f) => { window.lab.S.fov = f; return window.lab.measure(); }, fov);
  console.log(`\n=== FOV ${fov}° ===\n${txt}`);
}
// Stützen je Bahntyp: wo stehen die Füße (Boden, Kulisse, Höhlenboden, schwebend)?
for (const track of ['road', 'steel', 'wood', 'hanging']) {
  const st = await page.evaluate((t) => { window.lab.S.track = t; window.lab.rebuildTrack(); return window.lab.stats(); }, track);
  console.log(`Stützen ${track.padEnd(8)} Boden ${st.ground}, Kulisse ${st.element} (${Object.entries(st.names).map(([k, v]) => k + ' ' + v).join(', ') || '–'}), Höhle ${st.cave}, schwebend ${st.floating}, zu kurz ${st.skipped}`);
}
await browser.close();
