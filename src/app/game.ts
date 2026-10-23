/**
 * Game: Pixi-Anwendung, Szenenwechsel mit Überblendung, Eingabe, Resize/Orientation.
 */
import { DevOverlay, type DevStats } from '@/core/devOverlay';
import { Application, Container, Graphics, RenderTexture } from 'pixi.js';
import { InputManager } from '@/core/input';
import type { Scene } from './scene';
import { storage } from '@/core/storage';
import { setLanguage } from '@/core/i18n';

export class Game {
  readonly app = new Application();
  readonly root = new Container();
  private fade = new Graphics();
  private scene: Scene | null = null;
  private input!: InputManager;
  private fadeAlpha = 0;
  private fadeDir = 0;
  private pending: (() => Scene) | null = null;
  width = 800;
  height = 600;
  private devOverlay: DevOverlay | null = null;

  async init(): Promise<void> {
    setLanguage(storage.settings.language);
    await this.app.init({
      resizeTo: window,
      background: '#1b2a4a',
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    const host = document.getElementById('app')!;
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root, this.fade);
    this.input = new InputManager(this.app.canvas);
    this.input.handlers = {
      dragStart: (p, id) => this.scene?.handlers.dragStart?.(p, id),
      dragMove: (p, id) => this.scene?.handlers.dragMove?.(p, id),
      dragEnd: (p, id) => this.scene?.handlers.dragEnd?.(p, id),
      tap: (p) => this.scene?.handlers.tap?.(p),
      doubleTap: (p) => this.scene?.handlers.doubleTap?.(p),
      longPress: (p) => this.scene?.handlers.longPress?.(p),
      panStart: (c) => this.scene?.handlers.panStart?.(c),
      pan: (c, d) => this.scene?.handlers.pan?.(c, d),
      pinch: (c, s) => this.scene?.handlers.pinch?.(c, s),
      panEnd: () => this.scene?.handlers.panEnd?.(),
      twoFingerTap: () => this.scene?.handlers.twoFingerTap?.(),
      threeFingerTap: () => this.scene?.handlers.threeFingerTap?.(),
      wheel: (p, d) => this.scene?.handlers.wheel?.(p, d),
      key: (k, e) => this.scene?.handlers.key?.(k, e),
    };
    // ?fast=N beschleunigt die Spielzeit (für automatische Tests auf langsamen Renderern)
    const fast = Number(new URLSearchParams(location.search).get('fast') ?? '1') || 1;
    this.app.ticker.add((ticker) => {
      const dt = Math.min(0.05, ticker.deltaMS / 1000) * fast;
      this.tick(dt);
    });
    this.app.renderer.on('resize', () => this.onResize());
    // ?dev=1: Bilder pro Sekunde, Draw-Calls, Partikel, Filter-Schalter (Taste F)
    if (new URLSearchParams(location.search).get('dev') === '1') {
      this.devOverlay = new DevOverlay();
      const gl = (this.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl ?? null;
      this.devOverlay.attach(gl);
      this.devOverlay.onToggleFilters = (on) => {
        const view = (this.scene as unknown as { view?: { setFx?: (on: boolean) => void } }).view;
        view?.setFx?.(on);
      };
    }
    this.onResize();
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 150));
  }

  private onResize(): void {
    this.width = this.app.screen.width;
    this.height = this.app.screen.height;
    this.scene?.resize(this.width, this.height);
    this.fade.clear();
    this.fade.rect(0, 0, this.width, this.height).fill(0x1b2a4a);
    this.fade.alpha = this.fadeAlpha;
  }

  /** Szene wechseln mit kurzer Überblendung */
  goto(make: () => Scene, instant = false): void {
    if (instant) {
      this.swap(make());
      return;
    }
    this.pending = make;
    this.fadeDir = 1;
  }

  /** Szene im Hintergrund vorbereiten (enter, ohne sie zu zeigen), für eigene Übergänge */
  async prepare(scene: Scene): Promise<Scene> {
    scene.resize(this.width, this.height);
    await scene.enter(this);
    return scene;
  }

  /** Vorbereitete Szene sofort zeigen (ihr enter lief schon in prepare) */
  adopt(scene: Scene): void {
    if (this.scene) {
      this.scene.exit();
      this.root.removeChild(this.scene.container);
    }
    this.pending = null;
    this.scene = scene;
    this.root.addChild(scene.container);
    scene.resize(this.width, this.height);
  }

  /** Container bildschirmgroß in eine Textur rendern (durchsichtiger Hintergrund) */
  snapshot(container: Container): RenderTexture {
    const r = this.app.renderer;
    const tex = RenderTexture.create({ width: this.width, height: this.height, resolution: r.resolution, antialias: true });
    r.render({ container, target: tex, clear: true, clearColor: [0, 0, 0, 0] });
    return tex;
  }

  private swap(next: Scene): void {
    if (this.scene) {
      this.scene.exit();
      this.root.removeChild(this.scene.container);
    }
    this.scene = next;
    this.root.addChild(next.container);
    next.resize(this.width, this.height);
    // nach enter noch einmal: Was eine Szene erst in enter anlegt (Himmel, Hintergründe), bekommt so die Größe
    void Promise.resolve(next.enter(this)).then(() => {
      if (this.scene === next) next.resize(this.width, this.height);
    });
  }

  private tick(dt: number): void {
    if (this.fadeDir !== 0) {
      this.fadeAlpha += this.fadeDir * dt * 4;
      if (this.fadeAlpha >= 1 && this.pending) {
        this.fadeAlpha = 1;
        this.swap(this.pending());
        this.pending = null;
        this.fadeDir = -1;
      } else if (this.fadeAlpha <= 0) {
        this.fadeAlpha = 0;
        this.fadeDir = 0;
      }
      this.fade.alpha = this.fadeAlpha;
      this.fade.eventMode = this.fadeAlpha > 0.05 ? 'static' : 'none';
    }
    this.scene?.update(dt);
    if (this.devOverlay) {
      const view = (this.scene as unknown as { view?: { effects?: { count: number } } }).view;
      this.devOverlay.frame(view?.effects?.count ?? 0);
    }
  }

  /** Messwerte des Dev-Overlays (?dev=1), sonst null; die Szenarien prüfen damit das Draw-Call-Budget */
  get dev(): DevStats | null {
    return this.devOverlay?.stats ?? null;
  }

  get isPortrait(): boolean {
    return this.height > this.width;
  }
  /** aktuelle Szene (für Debugging und Tests) */
  get current(): Scene | null {
    return this.scene;
  }
}
