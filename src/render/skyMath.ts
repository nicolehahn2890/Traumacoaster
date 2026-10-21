/**
 * Reine Himmel-Rechnung (ohne Pixi): Bildschirm-x einer Wolke für einen Blick. Karte und Level benutzen
 * dieselbe Formel, damit die Wolken beim Übergang nicht springen; parallax < 1 lässt sie auf der Karte
 * langsamer wandern.
 */
export interface SkyView {
  x: number;
  y: number;
  zoom: number;
  parallax?: number;
}

/** Wolken-Band: Breite der virtuellen Wiederholung in Pixeln */
export const CLOUD_WRAP = 2600;

export function cloudScreenX(cloudX: number, depth: number, view: SkyView): number {
  const parallax = 0.12 + (1 - depth) * 0.25;
  const px = view.x * (view.parallax ?? 1);
  let sx = (cloudX - px * parallax * 4) % CLOUD_WRAP;
  if (sx < -500) sx += CLOUD_WRAP;
  if (sx > 2100) sx -= CLOUD_WRAP;
  return sx - 300;
}

export function cloudScreenY(cloudY: number, depth: number, view: SkyView): number {
  const par = view.parallax ?? 1;
  return cloudY + view.y * view.zoom * 0.04 * (1 - depth) * par - (view.zoom - 12) * 1.5 * par;
}
