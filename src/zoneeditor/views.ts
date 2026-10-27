/**
 * Ansichten des Zonen-Editors (Stufe 1, Plan 4.2 und Befund 7): **Spielblick** ist die Spielkamera selbst (Neigung,
 * Bildwinkel, Kamerafahrt beim Zoomen); **Frontal** schaut gerade und ohne Perspektive auf die Ebenen, zum genauen
 * Zeichnen auf der aktiven Ebene; **Frei** kreist um einen Punkt und zeigt den Stapel im Raum; **Seite** ist Frei schräg
 * von der Seite, damit die Abstände der Ebenen zu sehen sind. Frontal und Frei haben eigene Kameras und verändern die
 * Spielkamera nicht; der Weltrenderer zeichnet sie über `viewCamera`.
 */
import { OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { WorldRenderer } from '@/world/renderer';

export type ViewMode = 'game' | 'front' | 'free';

export const VIEW_WORDS: Record<ViewMode | 'side', string> = { game: 'Spielblick', front: 'Frontal', free: 'Frei', side: 'Seite' };

const DEG = Math.PI / 180;

export class EditorViews {
  mode: ViewMode = 'game';
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  private readonly persp = new PerspectiveCamera(35, 1, 0.5, 8000);
  /** Frontal: Ziel und Maßstab (px je Meter) */
  private front = { x: 0, y: 0, zoom: 10 };
  /** Frei: Umkreisen um target mit Drehung um die Hochachse (yaw), Neigung (pitch) und Abstand */
  private free = { target: new Vector3(), yaw: 0, pitch: 12 * DEG, dist: 120 };
  private width = 800;
  private height = 600;
  private readonly ray = new Raycaster();

  constructor(private readonly world: WorldRenderer) {}

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
  }

  /** Kamera dieses Bildes (Spielblick: die Spielkamera) */
  get camera(): Camera {
    return this.mode === 'game' ? this.world.camera.active : this.mode === 'front' ? this.ortho : this.persp;
  }

  /** Kameras dieses Bildes stellen; vor dem Zeichnen aufrufen */
  update(): void {
    if (this.mode === 'front') {
      const c = this.ortho;
      const f = this.front;
      c.left = -this.width / 2 / f.zoom;
      c.right = this.width / 2 / f.zoom;
      c.top = this.height / 2 / f.zoom;
      c.bottom = -this.height / 2 / f.zoom;
      c.position.set(f.x, f.y, 3000);
      c.up.set(0, 1, 0);
      c.lookAt(f.x, f.y, 0);
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
    } else if (this.mode === 'free') {
      const c = this.persp;
      const f = this.free;
      const cp = Math.cos(f.pitch);
      c.aspect = this.width / this.height;
      c.near = Math.max(0.1, f.dist * 0.01);
      c.far = f.dist * 30 + 3000;
      c.position.set(f.target.x + Math.sin(f.yaw) * cp * f.dist, f.target.y + Math.sin(f.pitch) * f.dist, f.target.z + Math.cos(f.yaw) * cp * f.dist);
      c.up.set(0, 1, 0);
      c.lookAt(f.target);
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
    }
    this.world.viewCamera = this.mode === 'game' ? null : this.camera;
  }

  /** Strahl durch einen Bildpunkt (CSS-Pixel) in der Kamera dieses Bildes */
  rayAt(x: number, y: number): Raycaster {
    this.ray.setFromCamera(new Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2), this.camera);
    return this.ray;
  }

  /** Schnitt des Strahls mit der Ebene in Tiefe z (Meter, Welt-Z = −z); null, wenn er sie nicht trifft */
  pointOnDepth(x: number, y: number, z: number): { x: number; y: number } | null {
    const r = this.rayAt(x, y);
    const hit = r.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), z), new Vector3());
    return hit ? { x: hit.x, y: hit.y } : null;
  }

  /** Weltpunkt → Bildpunkt (CSS-Pixel); null hinter der Kamera */
  toScreen(x: number, y: number, Z: number): { x: number; y: number } | null {
    const v = new Vector3(x, y, Z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  /**
   * Ansicht wechseln. focusDepth: Tiefe der aktiven Ebene; Frontal behält dann ihre Lage und Größe in der Bildmitte,
   * Frei kreist um ihren Punkt in der Bildmitte.
   */
  setMode(mode: ViewMode | 'side', focusDepth: number, stackDepth: { min: number; max: number }): void {
    const from = this.camera;
    const center = this.pointOnDepth(this.width / 2, this.height / 2, focusDepth) ?? { x: 0, y: 0 };
    if (mode === 'front') {
      const side = this.pointOnDepth(this.width / 2 + 100, this.height / 2, focusDepth);
      const d = side ? Math.hypot(side.x - center.x, side.y - center.y) : 10;
      this.front = { x: center.x, y: center.y, zoom: Math.min(400, Math.max(0.5, 100 / Math.max(1e-3, d))) };
      this.mode = 'front';
    } else if (mode === 'free' || mode === 'side') {
      const target = new Vector3(center.x, center.y, -focusDepth);
      const pos = new Vector3().setFromMatrixPosition(from.matrixWorld);
      const v = pos.clone().sub(target);
      let dist = Math.max(5, v.length());
      let yaw = Math.atan2(v.x, v.z);
      let pitch = Math.asin(Math.max(-1, Math.min(1, v.y / dist)));
      if (!Number.isFinite(dist) || dist > 5000 || this.mode === 'front') {
        dist = 120;
        yaw = 0;
        pitch = 12 * DEG;
      }
      if (mode === 'side') {
        const span = Math.max(20, stackDepth.max - stackDepth.min);
        target.z = -(stackDepth.min + stackDepth.max) / 2;
        dist = Math.max(dist, span * 1.6);
        yaw = 62 * DEG;
        pitch = 14 * DEG;
      }
      this.free = { target, yaw, pitch, dist };
      this.mode = 'free';
    } else this.mode = 'game';
    this.update();
  }

  /** Bild verschieben (Frontal, Frei); im Spielblick schiebt der Aufrufer die Spielkamera */
  pan(dx: number, dy: number): void {
    if (this.mode === 'front') {
      this.front.x -= dx / this.front.zoom;
      this.front.y += dy / this.front.zoom;
    } else if (this.mode === 'free') {
      const c = this.persp;
      const k = (2 * this.free.dist * Math.tan((c.fov * DEG) / 2)) / this.height;
      const right = new Vector3().setFromMatrixColumn(c.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(c.matrixWorld, 1);
      this.free.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    }
    this.update();
  }

  /** um den Bildpunkt (x, y) zoomen (Frontal) oder heranfahren (Frei) */
  zoomAt(x: number, y: number, factor: number): void {
    if (this.mode === 'front') {
      const f = this.front;
      const wx = f.x + (x - this.width / 2) / f.zoom;
      const wy = f.y - (y - this.height / 2) / f.zoom;
      f.zoom = Math.min(400, Math.max(0.3, f.zoom * factor));
      f.x = wx - (x - this.width / 2) / f.zoom;
      f.y = wy + (y - this.height / 2) / f.zoom;
    } else if (this.mode === 'free') {
      this.free.dist = Math.min(4000, Math.max(2, this.free.dist / factor));
    }
    this.update();
  }

  /** Frei: um das Ziel kreisen */
  orbit(dx: number, dy: number): void {
    if (this.mode !== 'free') return;
    this.free.yaw -= dx * 0.006;
    this.free.pitch = Math.max(-80 * DEG, Math.min(80 * DEG, this.free.pitch + dy * 0.006));
    this.update();
  }
}
