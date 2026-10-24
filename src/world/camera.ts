/**
 * Kamera-Adapter des Weltrenderers (Etappe 1, Richtlinie 2.1 und 2.3): dieselbe Kamera, deren Bild die Bühne ist, als
 * Three-Kamera. Bühne: um CAMERA_TILT (26,57°) nach unten geneigte Ortho-Kamera, senkrecht um 1/cos gestreckt, sodass
 * Y = y + 0,5·Tiefe exakt herauskommt. Perspektive: gleiche Neigung und Streckung, Bildwinkel fov (18°), Zoom als
 * Kamerafahrt (Abstand D aus viewDistance). Beides stimmt mit toStage bzw. toView/rayToWorld in src/track/stage.ts
 * überein (Test tests/world.test.ts, 100 Punkte): Was der Finger auf der Bühne zeichnet, liegt in der Welt auf der Bahn.
 *
 * Koordinaten der Welt: x entlang der Bühne, y Höhe, Z nach vorn zum Betrachter; Spur z (Spuren) liegt bei
 * Z = −z · LANE_DEPTH (hinten negativ).
 */
import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_TILT, LANE_DEPTH, viewDistance } from '@/track/stage';

/** Kameralage eines Bildes: Ziel auf der Spur-0-Ebene (Bühnen-Meter), Zoom (px/m), Bildgröße (px), Perspektive */
export interface CameraView {
  cx: number;
  cy: number;
  zoom: number;
  width: number;
  height: number;
  persp: boolean;
  /** Bildwinkel (Grad, senkrecht) */
  fov: number;
}

/** Spur (z in Spuren) → Welt-Z (hinten negativ) */
export const laneToZ = (z: number): number => -z * LANE_DEPTH;
/** Welt-Z → Spur */
export const zToLane = (Z: number): number => -Z / LANE_DEPTH;

const SIN = Math.sin(CAMERA_TILT);
const COS = Math.cos(CAMERA_TILT);
/** senkrechte Streckung der Bühne: ein senkrechter Meter erscheint so lang wie ein waagerechter */
export const VERTICAL_STRETCH = 1 / COS;
/** Abstand der Ortho-Kamera (beliebig, nur für near/far) */
const ORTHO_DISTANCE = 400;

export class WorldCamera {
  readonly persp = new PerspectiveCamera(18, 1, 1, 4000);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private current: PerspectiveCamera | OrthographicCamera = this.ortho;
  /** Kameraabstand zur Spur-0-Ebene (Meter), Infinity bei Bühne */
  distance = Infinity;
  view: CameraView = { cx: 0, cy: 0, zoom: 10, width: 800, height: 600, persp: false, fov: 18 };

  /** die Kamera dieses Bildes (Bühne oder Perspektive) */
  get active(): PerspectiveCamera | OrthographicCamera {
    return this.current;
  }

  /** Kamera für dieses Bild stellen */
  set(view: CameraView): void {
    this.view = { ...view };
    const wM = view.width / view.zoom;
    const hM = view.height / view.zoom;
    const target = new Vector3(view.cx, view.cy, 0);
    if (!view.persp) {
      const c = this.ortho;
      c.left = -wM / 2;
      c.right = wM / 2;
      c.top = hM / 2 / VERTICAL_STRETCH;
      c.bottom = -hM / 2 / VERTICAL_STRETCH;
      c.near = 1;
      c.far = ORTHO_DISTANCE * 2 + 2000;
      c.position.set(view.cx, view.cy + ORTHO_DISTANCE * SIN, ORTHO_DISTANCE * COS);
      c.up.set(0, 1, 0);
      c.lookAt(target);
      c.updateProjectionMatrix();
      this.distance = Infinity;
      this.current = c;
    } else {
      const c = this.persp;
      const D = viewDistance(view.zoom, view.height, view.fov);
      c.fov = view.fov;
      c.aspect = view.width / view.height;
      c.near = Math.max(0.5, D * 0.05);
      c.far = D * 6 + 2000;
      c.position.set(view.cx, view.cy + D * SIN, D * COS);
      c.up.set(0, 1, 0);
      c.lookAt(target);
      c.updateProjectionMatrix();
      // senkrechte Streckung wie die Bühne, als Teil der Projektion
      c.projectionMatrix.premultiply(new Matrix4().makeScale(1, VERTICAL_STRETCH, 1));
      c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
      this.distance = D;
      this.current = c;
    }
    this.current.updateMatrixWorld(true);
  }

  /** Weltpunkt (x, Höhe y, Tiefe z in Spuren) → Bildschirm-Pixel */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new Vector3(x, y, laneToZ(z)).project(this.current);
    return { x: ((v.x + 1) / 2) * this.view.width, y: ((1 - v.y) / 2) * this.view.height };
  }
}
