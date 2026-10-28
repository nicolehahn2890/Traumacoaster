/**
 * Pinsel-Studie: echte Bildzeiten beim Malen. Spielt aufgenommene Striche als Zeigerereignisse im Takt der Aufnahme in
 * die Seite (headless Chromium mit Metal), setzt die Kamera je Punkt wie aufgezeichnet (Autoscroll aus) und misst je
 * Bild die Zeit zwischen zwei requestAnimationFrame-Aufrufen sowie die Dauer von previewBrush, advanceBrush/drawInk und
 * view.setTrack. Nach dem Loslassen laufen die Probefahrten; auch dort werden die Bildzeiten gezählt.
 *
 *   node scripts/pinsel-bildzeiten.mjs <strokes.jsonl> --idx 3,20,42 [--url http://localhost:5186/] [--strich 2] [--gl swiftshader]
 *
 * --idx zählt die Striche von heute (28.10.) in Zonen, beginnend bei 0 (wie scripts/pinsel-messung.ts --heute).
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const file = args.find((a, i) => !a.startsWith('--') && !['--idx', '--url', '--strich', '--gl', '--shot'].includes(args[i - 1])) ?? 'recordings/strokes.jsonl';
const URL = opt('--url') ?? process.env.TC_URL ?? 'http://localhost:5186/';
const STRICH = opt('--strich');
const GL = opt('--gl') ?? 'metal';
const IDX = (opt('--idx') ?? '0').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const all = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const recs = all.filter((r) => r.reading === 'brush' && r.at.startsWith('2026-10-28') && r.zone);

const glArgs = GL === 'swiftshader' ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: glArgs });
const q = (a, f) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * f))];
};
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

for (const idx of IDX) {
  const rec = recs[idx];
  if (!rec) {
    console.error(`kein Strich ${idx}`);
    continue;
  }
  const zone = rec.zone === 'test-boegen' && rec.field === 'f2' ? 'test-boegen-f2' : rec.zone;
  const ctx = await browser.newContext({ viewport: { width: rec.screen[0], height: rec.screen[1] }, deviceScaleFactor: rec.dpr ?? 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  const url = `${URL}?zone=${zone}&editor=2&scroll=0&fov=${rec.persp ?? 18}${STRICH ? `&strich=${STRICH}` : ''}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await sleep(2500);
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const d = gl?.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unbekannt';
  });
  await page.keyboard.press('Tab');
  await sleep(1500);
  // Kamera je Punkt (Autoscroll-Punkte ohne Kamera nehmen die des Punkts davor)
  const pts = [];
  let cam = null;
  for (const p of rec.points) {
    if (p.length >= 5) cam = [p[3], p[4]];
    pts.push([p[0], p[1], p[2], cam ? cam[0] : null, cam ? cam[1] : null]);
  }
  const res = await page.evaluate(
    async ({ pts, zoom }) => {
      const g = window.tcGame;
      const s = g.current;
      const camera = s.view.camera;
      const el = document.querySelector('canvas');
      const M = { frames: [], preview: [], ink: [], setTrack: [], refineFrames: [], lenAtPreview: [], previewAt: [] };
      // Messhaken um die Methoden der Szene (TS-private ist nur zur Übersetzungszeit privat)
      const wrap = (obj, name, list, extra) => {
        const orig = obj[name];
        obj[name] = function (...a) {
          const t = performance.now();
          const r = orig.apply(this, a);
          list.push(performance.now() - t);
          extra?.();
          return r;
        };
      };
      wrap(s, 'previewBrush', M.preview, () => {
        M.lenAtPreview.push(s.brush ? s.brush.drawnLength : 0);
        M.previewAt.push(performance.now());
      });
      wrap(s, 'drawInk', M.ink);
      wrap(s.view, 'setTrack', M.setTrack);
      let phase = 'stroke';
      let last = performance.now();
      let running = true;
      const tick = (now) => {
        const d = now - last;
        last = now;
        if (phase === 'stroke') M.frames.push(d);
        else if (phase === 'refine') M.refineFrames.push(d);
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const setCam = (p) => {
        if (p[3] !== null && (camera.x !== p[3] || camera.y !== p[4])) camera.set(p[3], p[4], zoom);
      };
      const ev = (type, p) => {
        setCam(p);
        const sc = camera.toScreen(p[0], p[1]);
        el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: sc.x, clientY: sc.y, bubbles: true, cancelable: true, isPrimary: true }));
      };
      camera.set(pts[0][3] ?? camera.x, pts[0][4] ?? camera.y, zoom);
      camera.direct = true;
      // Leerlauf: Bildzeiten ohne Strich (die Welt allein)
      await new Promise((r) => setTimeout(r, 200));
      M.frames.length = 0;
      await new Promise((r) => setTimeout(r, 1000));
      M.idle = M.frames.slice();
      M.frames.length = 0;
      const t0 = performance.now();
      ev('pointerdown', pts[0]);
      for (let i = 1; i < pts.length; i++) {
        const wait = pts[i][2] - (performance.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        ev('pointermove', pts[i]);
      }
      ev('pointerup', pts[pts.length - 1]);
      const tStroke = performance.now() - t0;
      phase = 'refine';
      const tr = performance.now();
      while (s.refiner && performance.now() - tr < 20000) await new Promise((r) => setTimeout(r, 20));
      const tRefine = performance.now() - tr;
      phase = 'done';
      running = false;
      const nodes = s.path?.nodes?.length ?? 0;
      return { M, tStroke, tRefine, nodes, drawn: M.lenAtPreview[M.lenAtPreview.length - 1] ?? 0 };
    },
    { pts, zoom: rec.zoom },
  );
  const SHOT = opt('--shot');
  if (SHOT) await page.screenshot({ path: `${SHOT}/strich-${idx}${STRICH ? '-s' + STRICH : ''}.png` });
  const { M } = res;
  const fr = M.frames;
  const fps = fr.length ? 1000 / (fr.reduce((a, b) => a + b, 0) / fr.length) : NaN;
  const slow = fr.filter((d) => d > 20).length;
  console.log(`#${idx} ${rec.at.slice(11, 19)} ${zone} ${rec.screen.join('×')}@${rec.dpr ?? 2} zoom ${rec.zoom} fov ${rec.persp ?? 18} · GPU: ${gpu}`);
  const idle = M.idle ?? [];
  console.log(`   Leerlauf ohne Strich: ${idle.length} Bilder, Bildzeit Median ${f1(q(idle, 0.5))} ms, 90 % ${f1(q(idle, 0.9))} (Ø ${f1(idle.length ? 1000 / (idle.reduce((a, b) => a + b, 0) / idle.length) : NaN)} fps)`);
  console.log(`   Strich ${f1(res.tStroke / 1000)} s, ${fr.length} Bilder: Ø ${f1(fps)} fps, Bildzeit Median ${f1(q(fr, 0.5))} ms, 90 % ${f1(q(fr, 0.9))}, max ${f1(Math.max(...fr))}; Bilder über 20 ms: ${slow} (${Math.round((100 * slow) / Math.max(1, fr.length))} %)`);
  console.log(`   previewBrush ${M.preview.length}×: Median ${f1(q(M.preview, 0.5))} ms, 90 % ${f1(q(M.preview, 0.9))}, max ${f1(Math.max(...M.preview))}; davon setTrack Median ${f1(q(M.setTrack, 0.5))}, max ${f1(Math.max(...M.setTrack))}; drawInk Median ${f1(q(M.ink, 0.5))}, max ${f1(Math.max(...M.ink))} ms`);
  // Vorschau-Dauer über der Linienlänge
  const byLen = new Map();
  M.preview.forEach((ms, k) => {
    const b = Math.floor((M.lenAtPreview[k] ?? 0) / 100) * 100;
    byLen.set(b, [...(byLen.get(b) ?? []), ms]);
  });
  console.log('   previewBrush nach Linienlänge: ' + [...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([b, l]) => `${b}–${b + 99} m: ${f1(q(l, 0.5))}/${f1(Math.max(...l))} ms (${l.length})`).join(', '));
  const rf = M.refineFrames;
  console.log(`   nach dem Loslassen: Probefahrten ${f1(res.tRefine / 1000)} s, ${rf.length} Bilder: Ø ${f1(rf.length ? 1000 / (rf.reduce((a, b) => a + b, 0) / rf.length) : NaN)} fps, max Bildzeit ${f1(rf.length ? Math.max(...rf) : NaN)} ms; Bahn ${res.nodes} Knoten, ${Math.round(res.drawn)} m gemalt`);
  await ctx.close();
}
await browser.close();
