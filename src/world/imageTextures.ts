/**
 * Bilder der Ebenen (Stufe 6, Plan 4.8 und 4.11): gemalte Füllungen und Säume als Texturen. Jedes Bild lädt einmal je Art
 * (im Rahmen oder als Kachel, weil die Kachel ein anderes Wiederholen braucht) und wird geteilt.
 *
 * **KTX2 beim Kompilieren** (Plan 4.11 „Bilder im Atlas (KTX2)“): `scripts/zone-ktx2.mjs` (und der Dev-Server nach jedem
 * Hochladen) legt neben jedes Bild einer Zone eine KTX2-Datei (Basis Universal UASTC mit Mipmaps) und schreibt
 * `/zones/<zone>/ktx2.json`. Steht ein Bild dort, lädt es als KTX2: Die Grafikkarte des Handys hält es gepackt (ASTC,
 * ETC2 oder BC7, ein Byte je Bildpunkt statt vier). `&ktx2=0` lädt immer die Originale (Vergleich). Ein eigener Atlas lohnt
 * sich erst bei vielen Bildern (jedes Bild kostet je Schichtfolge einen Draw Call mehr; das zeigt die Leistungsanzeige).
 *
 * Alle Bilder sind **vormultipliziert** (PNG beim Hochladen auf die Grafikkarte, KTX2 schon beim Kompilieren), damit
 * Mipmaps und Filter an durchsichtigen Rändern keine dunklen Säume machen; die Shader teilen wieder durch Alpha. Die Werte
 * bleiben sRGB (wie Photoshop rechnen die Ebenen-Shader in sRGB), darum ohne Farbraum. Die Zeilen der Bilder laufen wie bei
 * PNG von unten nach oben (KTX2 wird beim Kompilieren gespiegelt).
 */
import { ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, Texture, TextureLoader, type WebGLRenderer } from 'three';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** was der Compiler über die KTX2-Fassung eines Bilds schreibt (src/../scripts/zone-ktx2.mjs) */
export interface Ktx2Entry {
  /** KTX2-Datei neben dem Bild */
  file: string;
  w: number;
  h: number;
  /** Grafikspeicher am Handy mit Mipmaps (Bytes) */
  gpu: number;
}
type Manifest = Record<string, Ktx2Entry>;

interface Entry {
  texture: Texture;
  /** zuletzt gebraucht (performance.now) */
  used: number;
  /** Bildpunkte, sobald bekannt, und Grafikspeicher (Schätzung: PNG 4 Bytes, KTX2 aus dem Compiler) */
  w: number;
  h: number;
  gpu: number;
  ktx2: boolean;
  loaded: boolean;
}

const useKtx2 = (): boolean => typeof location === 'undefined' || new URLSearchParams(location.search).get('ktx2') !== '0';

/**
 * Rahmen für den Grafikspeicher der Bilder einer Zone am Handy (Tor S6 „Speicher im Rahmen“). **Platzhalter:** 64 MB; iOS
 * beendet eine Seite ohne Warnung ab etwa 1,5 GB (Plan 3.3), Spiel, Bahn und Pixi brauchen daneben ihren Teil
 */
export const IMAGE_BUDGET = 64 * 1048576;

/** Grafikspeicher eines unkomprimierten Bilds mit Mipmaps */
export const rgbaBytes = (w: number, h: number): number => Math.round(w * h * 4 * (4 / 3));

export class ImageCache {
  private renderer: WebGLRenderer | null = null;
  private ktx: Promise<KTX2Loader> | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly manifests = new Map<string, Promise<Manifest>>();
  private readonly loader = new TextureLoader();
  /** ein Bild ist fertig geladen oder hat seine Textur getauscht (KTX2): Uniforms und Materialien nachführen */
  onChange: (() => void) | null = null;

  constructor() {
    // der Dev-Server meldet neue KTX2-Dateien: Verzeichnis neu lesen und die Bilder tauschen
    if (import.meta.hot)
      import.meta.hot.on('tc:ktx2', (data: { name: string }) => {
        this.manifests.delete(data.name);
        for (const [key, e] of this.entries) if (!e.ktx2 && key.startsWith(`/zones/${data.name}/`)) this.refresh(key);
      });
  }

  /** der Renderer (für KTX2: welche gepackten Formate die Grafikkarte kann) */
  setRenderer(r: WebGLRenderer): void {
    this.renderer = r;
  }

  /** Textur eines Bilds (sofort; bis es geladen ist, eine leere, durchsichtige) */
  texture(src: string, repeat = false): Texture {
    const key = `${src}${repeat ? '#r' : ''}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { texture: new Texture(), used: typeof performance === 'undefined' ? 0 : performance.now(), w: 0, h: 0, gpu: 0, ktx2: false, loaded: false };
      this.entries.set(key, e);
      this.refresh(key);
    }
    return e.texture;
  }

  /** Größe eines geladenen Bilds (Bildpunkte), sonst null */
  size(src: string): { w: number; h: number } | null {
    const e = this.entries.get(src) ?? this.entries.get(`${src}#r`);
    return e && e.w ? { w: e.w, h: e.h } : null;
  }

  /** diese Bilder (Schlüssel src oder src#r) werden gerade gebraucht */
  touch(keys: Iterable<string>): void {
    const now = performance.now();
    for (const k of keys) {
      const e = this.entries.get(k);
      if (e) e.used = now;
    }
  }

  /**
   * Bilder, die länger als idle Millisekunden niemand gebraucht hat, von der Grafikkarte nehmen (kommt eins zurück, etwa
   * mit Rückgängig, lädt es neu); gibt zurück, ob etwas wegfiel
   */
  prune(idle = 20000): boolean {
    const now = performance.now();
    let gone = false;
    for (const [k, e] of this.entries) {
      if (now - e.used < idle) continue;
      e.texture.dispose();
      this.entries.delete(k);
      gone = true;
    }
    return gone;
  }

  /** Bilder im Speicher: Zahl, Grafikspeicher (Bytes), davon als KTX2 */
  stats(used?: ReadonlySet<string>): { count: number; gpu: number; ktx2: number } {
    let count = 0;
    let gpu = 0;
    let ktx2 = 0;
    for (const [key, e] of this.entries) {
      if (used && !used.has(key)) continue;
      count++;
      gpu += e.gpu;
      if (e.ktx2) ktx2++;
    }
    return { count, gpu, ktx2 };
  }

  private manifest(zone: string): Promise<Manifest> {
    let m = this.manifests.get(zone);
    if (!m) {
      m = fetch(`${import.meta.env.BASE_URL}zones/${zone}/ktx2.json`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
        .catch(() => ({}));
      this.manifests.set(zone, m);
    }
    return m;
  }

  private ktxLoader(): Promise<KTX2Loader> | null {
    if (!this.renderer) return null;
    if (!this.ktx) {
      const renderer = this.renderer;
      this.ktx = import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
        const l = new KTX2Loader();
        l.setTranscoderPath(`${import.meta.env.BASE_URL}basis/`);
        l.detectSupport(renderer);
        return l;
      });
    }
    return this.ktx;
  }

  /** ein Bild (neu) laden: KTX2, wenn der Compiler es kennt, sonst das Original */
  private refresh(key: string): void {
    // ohne Browser (Tests, Skripte) bleibt die leere Textur
    if (typeof document === 'undefined') return;
    const repeat = key.endsWith('#r');
    const src = repeat ? key.slice(0, -2) : key;
    const m = /^\/zones\/([a-z0-9-]+)\/([\w.-]+)$/.exec(src);
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const plain = () => {
      const e = this.entries.get(key);
      if (!e || e.loaded) return;
      this.loader.load(`${base}${src}`, (tex) => {
        const img = tex.image as { width: number; height: number };
        this.adopt(key, tex, repeat, img.width, img.height, rgbaBytes(img.width, img.height), false);
      });
    };
    const ktx = m && useKtx2() ? this.ktxLoader() : null;
    if (!m || !ktx) {
      plain();
      return;
    }
    void this.manifest(m[1]).then((man) => {
      const k = man[m[2]];
      if (!k) {
        plain();
        return;
      }
      void ktx
        .then((l) => l.loadAsync(`${base}/zones/${m[1]}/${k.file}`))
        .then((tex) => this.adopt(key, tex, repeat, k.w, k.h, k.gpu, true))
        .catch(() => plain());
    });
  }

  /** geladene Textur einsetzen: vormultipliziert, ohne Farbraum, Mipmaps, Kachel oder Rand */
  private adopt(key: string, tex: Texture, repeat: boolean, w: number, h: number, gpu: number, ktx2: boolean): void {
    const e = this.entries.get(key);
    if (!e) {
      tex.dispose();
      return;
    }
    tex.colorSpace = NoColorSpace;
    tex.wrapS = tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = tex.mipmaps && tex.mipmaps.length === 1 && ktx2 ? LinearFilter : LinearMipmapLinearFilter;
    if (!ktx2) {
      tex.premultiplyAlpha = true;
      tex.generateMipmaps = true;
    }
    tex.anisotropy = Math.min(4, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
    tex.needsUpdate = true;
    if (e.texture !== tex) e.texture.dispose();
    Object.assign(e, { texture: tex, w, h, gpu, ktx2, loaded: true });
    this.onChange?.();
  }

  dispose(): void {
    for (const e of this.entries.values()) e.texture.dispose();
    this.entries.clear();
  }
}
