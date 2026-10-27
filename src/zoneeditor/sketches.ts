/**
 * Skizzen als Pause-Ebenen im Bild des Editors (Rest von Stufe 2, Plan „Skizze als Pause-Ebene … über das Spielbild
 * legen“): je Skizze ein Bild in Lage und Perspektive ihrer Ebene, aber über allem (auch über Ebenen davor, damit sie
 * beim Nachzeichnen nicht verschwindet), ohne Nebel. Multipliziert (wie die Ebenen-Mischung in Photoshop): weißes Papier
 * wird durchsichtig, Linien dunkeln ab; wahlweise normal halbdurchsichtig. Nur solange der Editor baut; das Spiel
 * zeichnet keine Skizzen.
 */
import { DoubleSide, Group, Mesh, MeshBasicMaterial, MultiplyBlending, NormalBlending, PlaneGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { findPlane, isSketch, shapesOf, type ZoneNode } from '@/zone/nodes';

/** Abstand der Formen einer Ebene in der Tiefe (wie in planeMesh); die Skizze liegt vor allen */
const ORDER_STEP = 0.003;

export class SketchLayer {
  readonly group = new Group();
  private readonly meshes = new Map<string, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  private readonly textures = new Map<string, Texture>();
  private readonly loader = new TextureLoader();

  constructor() {
    this.group.name = 'skizzen';
    this.group.renderOrder = 10;
  }

  /** Bild einer Skizze (einmal geladen, dann wiederverwendet; auch nach Rückgängig) */
  private texture(src: string): Texture {
    let t = this.textures.get(src);
    if (!t) {
      t = this.loader.load(src);
      t.colorSpace = SRGBColorSpace;
      this.textures.set(src, t);
    }
    return t;
  }

  /** Skizzen der Knoten nachführen; show: nur beim Bauen; visible: Ebene gerade sichtbar (ausgeblendet, isoliert) */
  update(nodes: readonly ZoneNode[], show: boolean, visible: (planeId: string) => boolean): void {
    this.group.visible = show;
    const seen = new Set<string>();
    for (const k of nodes.filter(isSketch)) {
      const plane = findPlane(nodes, k.parent);
      if (!plane) continue;
      seen.add(k.id);
      let m = this.meshes.get(k.id);
      if (!m) {
        m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, side: DoubleSide, fog: false }));
        m.renderOrder = 10;
        m.frustumCulled = false;
        this.meshes.set(k.id, m);
        this.group.add(m);
      }
      if (m.material.map !== this.texture(k.src)) {
        m.material.map = this.texture(k.src);
        m.material.needsUpdate = true;
      }
      m.material.opacity = k.opacity;
      m.material.blending = k.blend === 'normal' ? NormalBlending : MultiplyBlending;
      m.visible = !k.hidden && visible(plane.id);
      // Mitte und Größe in Ebenen-Koordinaten → Welt; knapp vor den Formen der Ebene
      m.position.set(plane.x + plane.scale * k.x, plane.y + plane.scale * k.y, -plane.z + (shapesOf(nodes, plane.id).length + 2) * ORDER_STEP);
      m.scale.set(plane.scale * k.w, plane.scale * k.h, 1);
    }
    for (const [id, m] of this.meshes) {
      if (seen.has(id)) continue;
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      this.meshes.delete(id);
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const t of this.textures.values()) t.dispose();
    this.meshes.clear();
    this.textures.clear();
    this.group.removeFromParent();
  }
}
