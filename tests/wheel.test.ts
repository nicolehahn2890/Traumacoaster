import { describe, expect, it } from 'vitest';
import { WheelPhysics } from '@/app/wheelPhysics';

const positions = Array.from({ length: 20 }, (_, i) => 300 + i * 500);

function spin(w: WheelPhysics, seconds: number, dt = 1 / 60) {
  const passed: number[] = [];
  let settledAt = -1;
  for (let i = 0; i < seconds / dt; i++) {
    const r = w.step(dt);
    passed.push(...r.passed);
    if (r.settled && settledAt < 0) settledAt = (i + 1) * dt;
  }
  return { passed, settledAt };
}

describe('Glücksrad-Physik der Karte', () => {
  it('rollt aus 2000 px/s aus, kommt in unter 4 s auf einem Rastpunkt zur Ruhe und zählt jeden Rastpunkt einmal', () => {
    const w = new WheelPhysics(positions, positions[3]);
    w.dragStart(0, 0);
    w.dragMove(-10, 10);
    w.velocity = 2000;
    w.dragEnd(10);
    const { passed, settledAt } = spin(w, 6);
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt).toBeLessThan(4);
    expect(positions).toContain(w.focus);
    expect(w.focus).toBeGreaterThan(positions[4]); // mindestens zwei Rastpunkte weiter
    const uniq = new Set(passed);
    expect(uniq.size).toBe(passed.length);
    for (let i = 1; i < passed.length; i++) expect(passed[i]).toBe(passed[i - 1] + 1);
  });
  it('schwingt beim Einrasten leicht über (unter 12 % des Rastabstands)', () => {
    const w = new WheelPhysics(positions, positions[3]);
    w.select(5);
    let maxOver = 0;
    for (let i = 0; i < 600; i++) {
      w.step(1 / 60);
      maxOver = Math.max(maxOver, w.focus - positions[5]);
    }
    expect(maxOver).toBeGreaterThan(0.5);
    expect(maxOver).toBeLessThan(0.12 * 500);
    expect(w.focus).toBe(positions[5]);
  });
  it('kehrt vom Gummiband hinter dem letzten Rastpunkt zurück', () => {
    const w = new WheelPhysics(positions, positions[19] + 400);
    w.velocity = 300;
    spin(w, 5);
    expect(w.focus).toBe(positions[19]);
    const w2 = new WheelPhysics(positions, positions[0] - 300);
    spin(w2, 5);
    expect(w2.focus).toBe(positions[0]);
  });
  it('langsam losgelassen rastet in Wischrichtung ein, Tipp wählt direkt', () => {
    const w = new WheelPhysics(positions, positions[3] + 60);
    w.dragStart(100, 0);
    w.dragMove(-20, 300); // 120 px in 0,3 s geschoben: langsam, aber deutlich → nächster Rastpunkt in Wischrichtung
    w.dragEnd(310);
    expect(w.target).toBe(positions[4]);
    const w3 = new WheelPhysics(positions, positions[3] + 60);
    w3.dragStart(100, 0);
    w3.dragMove(90, 200); // kleiner Ruck: rastet beim nächsten ein
    w3.dragEnd(210);
    expect(w3.target).toBe(positions[3]);
    const w2 = new WheelPhysics(positions, positions[3]);
    w2.select(7);
    const { passed } = spin(w2, 4);
    expect(w2.focus).toBe(positions[7]);
    expect(passed).toEqual([4, 5, 6, 7]);
  });
});
