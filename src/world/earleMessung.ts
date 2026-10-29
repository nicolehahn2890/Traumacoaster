/**
 * Handy-Messung der Earle-Schichten (docs/ZONENEDITOR-PLAN.md, Stufe 5: „Kosten je Schicht am Handy gemessen“, Tor S5).
 * Mit `&earle=messen` in der Adresse misst das Spiel nach dem Laden auf dem Gerät selbst, was die Ebenen kosten: ohne
 * Ebenen, wie gesichert, ohne Earle-Schichten, mit Earle auf allen Flächen (Knopf „Ganze Zone“, nur im Speicher) und
 * davon je eine Art Schicht weniger. Je Zeile 30 Bilder am Stück über world.render, dann einmal auf die GPU warten
 * (Auslesen eines Bildpunkts), Median aus fünf solchen Stapeln. Die Tafel zeigt Millisekunden je Bild; 16,7 ms ist das
 * ganze Budget für 60 fps, das Spiel braucht daneben noch Pixi, Bahn und Logik. Danach gilt wieder die Zone wie
 * gesichert; geschrieben wird nichts.
 */
import type { WorldRenderer } from './renderer';
import { earleZone } from '@/zone/earle';
import { isGradient, isEarle, type ZoneFill } from '@/zone/paint';
import { isShape, type ZoneNode } from '@/zone/nodes';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Knoten mit Füllstapeln, deren Schichten test behält (alle Formen, ihre Flächen und alle Ebenen) */
function mapFills(nodes: readonly ZoneNode[], fn: (f: ZoneFill) => ZoneFill[]): ZoneNode[] {
  const out = structuredClone(nodes) as ZoneNode[];
  for (const n of out) {
    const o = n as { fills?: ZoneFill[]; regions?: Array<{ fills?: ZoneFill[] }> };
    if (o.fills) o.fills = o.fills.flatMap(fn);
    for (const r of o.regions ?? []) if (r.fills) r.fills = r.fills.flatMap(fn);
  }
  return out;
}

/** ohne Earle: keine Lichtkante, kein Innenschatten, keine Pünktchen, kein Papier, keine Bänder, kein Kantenverlauf, keine Punktkronen */
export function withoutEarle(nodes: readonly ZoneNode[]): ZoneNode[] {
  const out = mapFills(nodes, (f) => (isEarle(f) || (isGradient(f) && f.edge) ? [] : isGradient(f) && f.steps ? [{ ...f, steps: undefined, wave: undefined, inner: undefined }] : [f]));
  for (const n of out) if (isShape(n)) delete n.crown;
  return out;
}

function panel(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 44px);z-index:99;max-width:520px;margin:0 auto;padding:10px 12px;border-radius:10px;background:rgba(20,22,28,.9);color:#e8e4da;font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:auto';
  document.body.append(el);
  return el;
}

export async function startEarleMessung(world: WorldRenderer): Promise<void> {
  const out = panel();
  const say = (s: string) => (out.textContent = s);
  say('Earle-Messung: warte auf die Zone …');
  const t0 = performance.now();
  while (!world.planes.lastNodes?.length) {
    if (performance.now() - t0 > 20000) return void say('Earle-Messung: diese Zone hat keine Ebenen.');
    await sleep(250);
  }
  // Kamera und Shader zur Ruhe kommen lassen
  await sleep(3000);
  const saved = world.planes.lastNodes;
  const renderer = world.three;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const camera = () => world.viewCamera ?? world.camera.active;
  const measure = async (nodes: readonly ZoneNode[] | null): Promise<number> => {
    if (nodes) world.planes.build(nodes);
    await renderer.compileAsync(world.scene, camera());
    for (let i = 0; i < 5; i++) world.render();
    sync();
    const runs: number[] = [];
    for (let k = 0; k < 5; k++) {
      const s = performance.now();
      for (let i = 0; i < 30; i++) world.render();
      sync();
      runs.push((performance.now() - s) / 30);
      await sleep(30);
    }
    runs.sort((a, b) => a - b);
    return runs[2];
  };
  const rows: Array<[string, number]> = [];
  const gpu = (() => {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  })();
  const head = `Earle-Messung · ${renderer.domElement.width}×${renderer.domElement.height} px · DPR ${window.devicePixelRatio} · ${gpu}\nMillisekunden je Bild (nur die 3D-Welt; Budget für 60 fps: 16,7 ms für alles)\n`;
  const show = (more = '') => say(head + rows.map(([n, ms]) => `${n.padEnd(26)} ${ms.toFixed(2).padStart(6)} ms`).join('\n') + more);
  const step = async (name: string, nodes: readonly ZoneNode[] | null) => {
    show(`\n${name} …`);
    rows.push([name, await measure(nodes)]);
    show();
  };
  try {
    world.planes.group.visible = false;
    await step('ohne Ebenen', null);
    world.planes.group.visible = true;
    await step('Ebenen wie gesichert', saved);
    const plain = withoutEarle(saved);
    await step('ohne Earle-Schichten', plain);
    const full = earleZone(plain);
    await step('Earle auf allen Flächen', full);
    const fullStats = `${world.planes.stats.variants} Shader je Folge, ${world.planes.crownDots} Kronenpunkte`;
    const minus = (name: string, test: (f: ZoneFill) => boolean) => step(`  − ${name}`, mapFills(full, (f) => (test(f) ? [] : [f])));
    await minus('Pünktchen', (f) => f.type === 'dots');
    await minus('Lichtkante', (f) => f.type === 'light');
    await minus('Innenschatten', (f) => f.type === 'shade');
    await minus('Papier/Gouache', (f) => f.type === 'grain');
    await minus('Kantenverlauf', (f) => isGradient(f) && !!f.edge);
    const noCrowns = structuredClone(full) as ZoneNode[];
    for (const n of noCrowns) if (isShape(n)) delete n.crown;
    await step('  − Punktkronen', noCrowns);
    // Kontrolle: dieselbe Zeile wie oben; weicht sie stark ab, schwankt das Gerät (Wärme, Takt), nicht die Schichten
    await step('Earle auf allen Flächen (Kontrolle)', full);
    show(`\n\nFertig (Earle auf allen Flächen: ${fullStats}). Es gilt wieder die Zone wie gesichert.`);
  } catch (e) {
    show(`\n\nAbgebrochen: ${(e as Error).message}`);
  } finally {
    world.planes.group.visible = true;
    world.planes.build(saved);
  }
}
