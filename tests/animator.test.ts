import { describe, expect, it } from 'vitest';
import { CutoutAnimator, CLIPS, STEP, type AnimTarget } from '@/render/cutoutAnimator';

function fakeTarget() {
  const log: Array<Record<string, unknown>> = [];
  const cur: Record<string, unknown> = {};
  const t: AnimTarget = {
    setHeadFlap: (r) => (cur.flap = r),
    setEyes: (k) => (cur.eyes = k),
    setMouth: (k) => (cur.mouth = k),
    setArm: (s, a) => (cur['arm' + s] = a),
    setHop: (d) => (cur.hop = d),
    setTilt: (r) => (cur.tilt = r),
  };
  return { t, cur, log };
}

describe('Cut-out-Animator (Zweier, 12 Schritte pro Sekunde)', () => {
  it('wendet in einer Sekunde Idle genau 12 Frames an, auch bei 60 Bildern pro Sekunde', () => {
    const { t } = fakeTarget();
    const a = new CutoutAnimator(t, 'idle');
    const before = a.applied; // play() wendet Frame 0 an
    for (let i = 0; i < 60; i++) a.update(1 / 60);
    expect(a.applied - before).toBe(12);
    expect(a.current).toBe('idle');
  });
  it('Erschrecken dauert 6 Frames und kehrt dann zum Idle zurück', () => {
    const { t, cur } = fakeTarget();
    const a = new CutoutAnimator(t, 'idle');
    a.play('scared', { once: true });
    expect(cur.eyes).toBe('big');
    expect(cur.flap).toBeCloseTo((35 * Math.PI) / 180, 6);
    for (let i = 0; i < 5; i++) a.update(STEP);
    expect(a.current).toBe('scared');
    a.update(STEP);
    expect(a.current).toBe('idle');
    expect(cur.eyes).toBe('normal');
    expect(cur.flap).toBe(0);
  });
  it('Reden klappt den Kopf alle 2 Frames zwischen 10° und 28°', () => {
    const { t, cur } = fakeTarget();
    const a = new CutoutAnimator(t, 'talk');
    const flaps: number[] = [cur.flap as number];
    for (let i = 0; i < 8; i++) {
      a.update(STEP);
      flaps.push(cur.flap as number);
    }
    const deg = flaps.map((f) => Math.round((f * 180) / Math.PI));
    expect(deg.slice(0, 5)).toEqual([10, 10, 28, 28, 10]);
    expect(cur.mouth).toBe('open');
  });
  it('hält Werte zwischen zwei Keys (keine Zwischenwerte)', () => {
    const { t, cur } = fakeTarget();
    const a = new CutoutAnimator(t, 'wave');
    const first = cur.armR;
    a.update(STEP / 2);
    expect(cur.armR).toBe(first);
    a.update(STEP);
    expect(cur.armR).toBe(first);
    for (let i = 0; i < 3; i++) a.update(STEP);
    expect(cur.armR).not.toBe(first);
  });
  it('alle Clips haben Keys innerhalb ihrer Länge', () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      for (const k of clip.keys) expect(k.f, name).toBeLessThan(clip.frames);
    }
  });
});
