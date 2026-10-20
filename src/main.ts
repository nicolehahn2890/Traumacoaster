import { Game } from './app/game';
import { SplashScene } from './app/scenes/splash';
import { initPhysics } from './physics/passengers';
import { loadArtOverrides } from './assets/manifest';
import { storage } from './core/storage';
import { StartScene } from './app/scenes/start';
import { LevelScene } from './app/scenes/level';

type BootWindow = Window & { tcBootDone?: () => void; tcBootError?: (msg: string) => void; tcGame?: Game };

async function boot(): Promise<void> {
  // Physik (WebAssembly) im Hintergrund vorbereiten; das Level wartet selbst darauf.
  // Splash und Startscreen sollen auch dann erscheinen, wenn WebAssembly hier nicht geladen werden kann.
  void initPhysics().catch((err) => console.error('Physik konnte nicht geladen werden', err));
  await Promise.all([loadArtOverrides(), (document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve()]);
  const game = new Game();
  await game.init();
  (window as BootWindow).tcBootDone?.();
  // Splash nur beim ersten Start pro Sitzung
  const seen = sessionStorage.getItem('tc.splash') === '1';
  const params = new URLSearchParams(location.search);
  const levelParam = Number(params.get('level') ?? '0');
  if (levelParam > 0) game.goto(() => new LevelScene(levelParam), true);
  else if (params.get('scene') === 'start' || seen) game.goto(() => new StartScene(), true);
  else game.goto(() => new SplashScene(), true);
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
