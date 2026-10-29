/**
 * Stufe 5: Bildzeit der Earle-Schichten (docs/ZONENEDITOR-PLAN.md, „Kosten je Schicht“). Öffnet je Testzone den
 * Zonen-Editor im Spielblick, legt mit dem Knopf „Earle“ (Ganze Zone) die Vorgaben auf alle Flächen und misst die Zeit
 * je Bild: ohne Ebenen, Ebenen ohne Earle, mit Earle und mit Earle ohne je eine Art Schicht. Gemessen wird im Stapel:
 * 30 Bilder am Stück zeichnen (über world.render, das den mit Pixi geteilten Zustand zurücksetzt und den Nebel der
 * Ansicht setzt), dann einmal auf die GPU warten (Auslesen eines Bildpunkts; gl.finish wartet in Chromium
 * nicht), Median aus fünf Stapeln; headless Chromium mit Metal. Das ist die Zeit am Mac, nicht am Handy; die
 * Unterschiede zwischen den Zeilen zeigen, was eine Schicht kostet.
 *
 * Dazu die Gegenprobe der Shader je Schichtfolge (planeMesh.ts specialFragment): dasselbe Bild noch einmal mit dem
 * allgemeinen Shader; gezählt wird, wie viele Bildpunkte um mehr als 4 Stufen abweichen.
 *
 *   node scripts/earle-bildzeiten.mjs [http://localhost:5184/] [--zones test-huegel,test-grotte] [--size handy,mac] [--shots ordner]
 *
 * Mit --shots legt es je Zone und Größe zwei Standbilder des Spielblicks ab (ohne Editor-Leisten): <zone>-<größe>-ohne.png
 * und <zone>-<größe>-earle.png.
 *
 * Voraussetzung: laufender Dev-Server dieses Stands (am besten mit TC_NO_RECORD=1). Es wird nichts gesichert.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};
const URL = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5184/';
const ZONES = opt('--zones', 'test-huegel,test-grotte,test-boegen').split(',');
const SIZES = { handy: { width: 844, height: 390, dpr: 2 }, mac: { width: 1440, height: 900, dpr: 2 } };
const which = opt('--size', 'handy,mac').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = opt('--shots', null);
if (SHOTS) (await import('node:fs')).mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
for (const sizeName of which) {
  const size = SIZES[sizeName];
  for (const zone of ZONES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('KONSOLE', m.text().slice(0, 300)));
    await page.goto(`${URL}?zone=${zone}&editor=2`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.tcGame?.scene?.planeEditor?.nodes?.length > 0, null, { timeout: 60000 });
    await sleep(1500);
    // Standbilder: Editor-Leisten aus, Spielblick aufs Feld; erst ohne, dann mit Earle (im Editor, nicht gesichert)
    if (SHOTS) {
      await page.addStyleTag({ content: '[class^="ze-"],[class*=" ze-"]{display:none!important}' });
      const frame = async () =>
        page.evaluate(async () => {
          const pe = window.tcGame.scene.planeEditor;
          pe.setView('game');
          const f = pe.nodes.find((n) => n.kind === 'field');
          const cam = window.tcGame.scene.view.camera;
          const cx = f ? (f.x0 + f.x1) / 2 : 60;
          const cy = f ? (f.y0 + f.y1) / 2 : 20;
          const zoom = window.innerWidth / ((f ? f.x1 - f.x0 : 120) * 1.05);
          Object.assign(cam, { x: cx, y: cy, tx: cx, ty: cy, zoom, tz: zoom });
          await new Promise((r) => setTimeout(r, 2500));
        });
      await frame();
      await page.screenshot({ path: `${SHOTS}/${zone}-${sizeName}-ohne.png` });
      await page.evaluate(async () => {
        const pe = window.tcGame.scene.planeEditor;
        pe.stackEarle('zone');
        await new Promise((r) => setTimeout(r, 1500));
      });
      await page.screenshot({ path: `${SHOTS}/${zone}-${sizeName}-earle.png` });
      await page.evaluate(() => window.tcGame.scene.planeEditor.history && window.tcGame.scene.planeEditor.undo?.());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.tcGame?.scene?.planeEditor?.nodes?.length > 0, null, { timeout: 60000 });
      await sleep(1500);
    }
    const res = await page.evaluate(async () => {
      const pe = window.tcGame.scene.planeEditor;
      const world = pe.host.world;
      const renderer = world.three;
      const gl = renderer.getContext();
      pe.setView('game');
      const field = pe.nodes.find((n) => n.kind === 'field');
      const cam = window.tcGame.scene.view.camera;
      const cx = field ? (field.x0 + field.x1) / 2 : 60;
      const cy = field ? (field.y0 + field.y1) / 2 : 20;
      const zoom = window.innerWidth / ((field ? field.x1 - field.x0 : 120) * 1.05);
      Object.assign(cam, { x: cx, y: cy, tx: cx, ty: cy, zoom, tz: zoom });
      // die Kamera des Spielblicks fährt weich nach: erst messen, wenn sie steht
      await new Promise((r) => setTimeout(r, 2500));
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // neue Shader übersetzt Chromium im Hintergrund; bis sie fertig sind, lässt Three ihre Meshes weg
      const ready = () => renderer.compileAsync(world.scene, pe.views.camera);
      const measure = async (nodes) => {
        if (nodes) world.planes.build(nodes);
        await ready();
        for (let i = 0; i < 5; i++) world.render();
        sync();
        const runs = [];
        for (let k = 0; k < 5; k++) {
          const t0 = performance.now();
          for (let i = 0; i < 30; i++) world.render();
          sync();
          runs.push((performance.now() - t0) / 30);
        }
        runs.sort((a, b) => a - b);
        return Math.round(runs[2] * 100) / 100;
      };
      const out = [];
      const base = structuredClone(pe.nodes);
      world.planes.group.visible = false;
      out.push(['ohne Ebenen', await measure(null)]);
      world.planes.group.visible = true;
      out.push(['Ebenen ohne Earle', await measure(structuredClone(base))]);
      pe.stackEarle('zone');
      // der Editor baut nach dem Knopf in seinem eigenen Takt neu; das abwarten, sonst überschreibt er die Messstände
      await new Promise((r) => setTimeout(r, 1000));
      const earle = structuredClone(pe.nodes);
      out.push(['mit Earle', await measure(structuredClone(earle)), { ...world.planes.stats }]);
      // Gegenprobe: Shader je Folge gegen den allgemeinen Shader
      const W = renderer.domElement.width;
      const H = renderer.domElement.height;
      const grab = () => {
        world.render();
        const b = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
        return b;
      };
      // beide Shader-Sätze erst übersetzen, dann beide Bilder im selben Takt (die Kamera bewegt sich nicht dazwischen)
      const L = world.planes;
      await ready();
      const keep = L.group.children.map((m) => m.material);
      const generic = () => L.group.children.forEach((m) => (m.material = m.name.startsWith('ebenen-durchsichtig') ? L.clearMat : L.opaqueMat));
      const special = () => L.group.children.forEach((m, i) => (m.material = keep[i]));
      // (die Kronenpunkte schwingen im Wind, zwei Aufnahmen hintereinander unterschieden sich schon dadurch)
      const crowns = L.group.children.find((m) => m.name === 'ebenen-kronen');
      const crownsShown = crowns?.visible ?? false;
      if (crowns) crowns.visible = false;
      await ready();
      generic();
      await ready();
      special();
      const a = grab();
      generic();
      const b = grab();
      special();
      if (crowns) crowns.visible = crownsShown;
      let off = 0;
      let max = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 4) off++;
        max = Math.max(max, d);
      }
      const strip = (test) => {
        const nodes = structuredClone(earle);
        const cut = (fills) => (fills ? fills.flatMap((f) => test(f)) : fills);
        for (const n of nodes) {
          if (n.fills) n.fills = cut(n.fills);
          for (const r of n.regions ?? []) if (r.fills) r.fills = cut(r.fills);
        }
        return nodes;
      };
      out.push(['− Pünktchen', await measure(strip((f) => (f.type === 'dots' ? [] : [f])))]);
      out.push(['− Lichtkante', await measure(strip((f) => (f.type === 'light' ? [] : [f])))]);
      out.push(['− Innenschatten', await measure(strip((f) => (f.type === 'shade' ? [] : [f])))]);
      out.push(['− Papier/Gouache', await measure(strip((f) => (f.type === 'grain' ? [] : [f])))]);
      out.push(['− Bänder', await measure(strip((f) => (f.type === 'gradient' && f.steps ? [{ ...f, steps: undefined, wave: undefined }] : [f])))]);
      out.push(['− Kantenverlauf', await measure(strip((f) => (f.type === 'gradient' && f.edge ? [] : [f])))]);
      world.planes.build(base);
      return { out, px: [W, H], parity: { off: Math.round((off / (W * H)) * 1e6) / 1e4, max } };
    });
    console.log(`\n${zone} · ${sizeName} ${res.px.join('×')} px · Gegenprobe: ${res.parity.off} % der Bildpunkte weichen um mehr als 4 ab (größte Abweichung ${res.parity.max})`);
    for (const [name, ms, stats] of res.out) console.log(`  ${name.padEnd(20)} ${String(ms).padStart(6)} ms${stats ? `   (${stats.variants} Shader je Folge, ${stats.edges} Flächen mit Kantenabstand, Atlas 2048×${stats.atlas}, Kantenabstand ${stats.edgeMs} ms)` : ''}`);
    await ctx.close();
  }
}
await browser.close();
