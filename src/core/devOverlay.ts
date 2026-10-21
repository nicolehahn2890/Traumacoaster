/**
 * Dev-Overlay (?dev=1): Bilder pro Sekunde, Draw-Calls, Partikel, Filter-Schalter (Taste F). Zählt die
 * WebGL-Zeichenaufrufe über einen Wrapper um drawElements/drawArrays des Kontexts.
 */
export interface DevStats {
  fps: number;
  drawCalls: number;
  particles: number;
  filters: boolean;
}

export class DevOverlay {
  readonly el: HTMLDivElement;
  private frames = 0;
  private last = performance.now();
  private fps = 0;
  private calls = 0;
  private patched = false;
  stats: DevStats = { fps: 0, drawCalls: 0, particles: 0, filters: true };
  onToggleFilters: ((on: boolean) => void) | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;font:12px/1.4 monospace;color:#fff;background:rgba(20,16,32,.75);padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre';
    document.body.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        this.stats.filters = !this.stats.filters;
        this.onToggleFilters?.(this.stats.filters);
      }
    });
  }

  /** WebGL-Kontext umwickeln, um Zeichenaufrufe zu zählen */
  attach(gl: WebGL2RenderingContext | WebGLRenderingContext | null): void {
    if (!gl || this.patched) return;
    this.patched = true;
    const self = this;
    const de = gl.drawElements.bind(gl);
    const da = gl.drawArrays.bind(gl);
    gl.drawElements = function (this: WebGLRenderingContext, ...args: Parameters<WebGLRenderingContext['drawElements']>) {
      self.calls++;
      return de(...args);
    };
    gl.drawArrays = function (this: WebGLRenderingContext, ...args: Parameters<WebGLRenderingContext['drawArrays']>) {
      self.calls++;
      return da(...args);
    };
  }

  /** Einmal je Bild nach dem Rendern aufrufen */
  frame(particles: number): void {
    this.frames++;
    const now = performance.now();
    if (now - this.last >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.last));
      this.frames = 0;
      this.last = now;
    }
    this.stats.fps = this.fps;
    this.stats.drawCalls = this.calls;
    this.stats.particles = particles;
    this.calls = 0;
    this.el.textContent = `${this.fps} fps\n${this.stats.drawCalls} draw calls\n${particles} Partikel\nFilter ${this.stats.filters ? 'an' : 'aus'} (F)`;
  }
}
