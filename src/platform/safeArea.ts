/**
 * Sicherer Bereich des Bildschirms (Kerbe, Dynamic Island, Home-Leiste): Die Spielfläche füllt den ganzen
 * Bildschirm, nur die Bedienelemente weichen diesen Rändern aus. Die Werte kommen aus CSS (env(safe-area-inset-*))
 * über das Mess-Element #safe in index.html; im Browser am Desktop sind sie 0.
 */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let insets: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Ränder neu aus dem Mess-Element lesen (bei Resize und Drehen) */
export function readSafeArea(): SafeInsets {
  if (typeof document === 'undefined') return insets;
  const el = document.getElementById('safe');
  if (!el) return insets;
  const r = el.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(160, Math.round(v))) : 0);
  insets = { top: clamp(r.top), left: clamp(r.left), right: clamp(w - r.right), bottom: clamp(h - r.bottom) };
  return insets;
}

/** zuletzt gelesene Ränder */
export function safeArea(): SafeInsets {
  return insets;
}
