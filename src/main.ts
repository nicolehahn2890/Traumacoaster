import { Game } from './app/game';
import { SplashScene } from './app/scenes/splash';
import { initPhysics } from './physics/passengers';
import { loadArtOverrides } from './assets/manifest';
import { storage } from './core/storage';
import { StartScene } from './app/scenes/start';
import { LevelScene } from './app/scenes/level';

type BootWindow = Window & { tcBootDone?: () => void; tcBootError?: (msg: string) => void; tcGame?: Game };

/**
 * Schriften vor dem ersten Frame laden. Canvas-Text (Pixi) zeichnet sich nicht neu,
 * wenn eine Webfont erst später eintrifft; darum hier explizit warten, höchstens 3 s.
 */
async function loadFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const wanted = ['400 40px "Lobster"', '700 20px "Nunito"', '800 20px "Nunito"', '500 20px "Fredoka"', '700 20px "Fredoka"'];
  const all = Promise.all(wanted.map((f) => fonts.load(f).catch(() => [])))
    .then(() => fonts.ready)
    .then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.race([all, timeout]);
}

async function boot(): Promise<void> {
  // Physik (WebAssembly) im Hintergrund vorbereiten; das Level wartet selbst darauf.
  // Splash und Startscreen sollen auch dann erscheinen, wenn WebAssembly hier nicht geladen werden kann.
  void initPhysics().catch((err) => console.error('Physik konnte nicht geladen werden', err));
  const params = new URLSearchParams(location.search);
  const levelParam = Number(params.get('level') ?? '0');
  // Splash nur beim ersten Start pro Sitzung
  let seen = false;
  try {
    seen = sessionStorage.getItem('tc.splash') === '1';
  } catch {
    /* ignore */
  }
  // ?scene=splash zeigt das Intro immer, ?scene=start überspringt es
  const scene = params.get('scene');
  const showSplash = scene === 'splash' || (levelParam <= 0 && scene !== 'start' && !seen);
  // Das illudiy-Logo nur laden, wenn der Splash auch gezeigt wird (parallel zu Schriften und Texturen)
  const [, , logo] = await Promise.all([loadArtOverrides(), loadFonts(), showSplash ? SplashScene.preload() : Promise.resolve(null)]);
  const game = new Game();
  await game.init();
  (window as BootWindow).tcBootDone?.();
  if (showSplash) game.goto(() => new SplashScene(logo), true);
  else if (levelParam > 0) game.goto(() => new LevelScene(levelParam), true);
  else game.goto(() => new StartScene(), true);
  try {
    sessionStorage.setItem('tc.splash', '1');
  } catch {
    /* ignore */
  }
  void storage.settings;
  (window as BootWindow).tcGame = game;
}

boot().catch((err) => {
  console.error(err);
  const msg = `Fehler beim Start: ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  const w = window as BootWindow;
  if (w.tcBootError) w.tcBootError(msg);
  else {
    const el = document.createElement('pre');
    el.style.cssText = 'color:#fff;padding:20px;font:14px monospace;white-space:pre-wrap';
    el.textContent = msg;
    document.body.appendChild(el);
  }
});
