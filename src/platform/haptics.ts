/**
 * Haptik: kurze Rückmeldungen (Rasten der Scheibe, Rauswurf, Fang, Gurtriss). Im Browser über navigator.vibrate,
 * später über Capacitor Haptics; ohne Unterstützung passiert nichts.
 */
/** Browser erlauben Vibration erst nach einer Nutzergeste (sonst nur eine Konsolenwarnung) */
let gestureSeen = false;
if (typeof window !== 'undefined') {
  const arm = () => {
    gestureSeen = true;
  };
  window.addEventListener('pointerdown', arm, { once: true, passive: true });
  window.addEventListener('keydown', arm, { once: true, passive: true });
}

function vibrate(ms: number | number[]): void {
  if (!gestureSeen || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* nicht erlaubt */
  }
}

export const haptics = {
  /** Rasten, Auswahl */
  selection(): void {
    vibrate(6);
  },
  impact(strength: 'light' | 'heavy' = 'light'): void {
    vibrate(strength === 'heavy' ? 30 : 12);
  },
  notification(): void {
    vibrate([10, 40, 10]);
  },
};
