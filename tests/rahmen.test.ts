import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math3';
import { loopRegions, sampleTrack, stateAt, trackStats, type TrackSamples } from '@/track/model';
import { pathFromPoints } from '@/track/brushTrack';
import { relaxCurvature } from '@/track/reduceNodes';

/**
 * Regel der Schienen (Studie 17): Der Wagen fährt aufrecht, kopfüber nur auf dem oberen Bogen eines Loopings.
 * Die Bahnen hier sind 1-m-Punktfolgen in Weltmetern (x nach rechts, y Höhe, z Tiefe), gefittet wie die Pinsel-Bahn.
 */

/** Punkte entlang einer Parameterkurve, n Stück ohne den Startpunkt */
const along = (n: number, f: (t: number) => Vec3): Vec3[] => Array.from({ length: n }, (_, i) => f((i + 1) / n));
/** Kreisbogen um (cx, cy) in der x-y-Ebene von Winkel a0 bis a1 (Bogenmaß), Punkte je Meter */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, z = 0): Vec3[] =>
  along(Math.max(2, Math.round(Math.abs(a1 - a0) * r)), (t) => ({ x: cx + r * Math.cos(a0 + (a1 - a0) * t), y: cy + r * Math.sin(a0 + (a1 - a0) * t), z }));
const line = (from: Vec3, to: Vec3): Vec3[] => along(Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z))), (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }));

const minUp = (s: TrackSamples): number => Math.min(...Array.from(s.upy));

/** Anfahrt flach, Looping (Radius 6) mit leichter Tiefendrift in der Ausfahrt, Ausfahrt flach */
function loopTrack(): Vec3[] {
  const pts: Vec3[] = [{ x: 0, y: 0, z: 0 }, ...line({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 })];
  // Kreis um (20, 6): unten bei Winkel −90°, gegen den Uhrzeigersinn einmal herum; die letzten 60° driften 1,5 m in die Tiefe
  const circle = arc(20, 6, 6, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
  const n = circle.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    circle[i].z = t > 0.84 ? (1.5 * (t - 0.84)) / 0.16 : 0;
  }
  pts.push(...circle);
  pts.push(...line({ x: 20, y: 0, z: 1.5 }, { x: 45, y: 0, z: 1.5 }));
  return pts;
}

/** Kehre mit senkrechten Schenkeln: flach, Bogen hoch, 15 m senkrecht, Scheitelbogen (Radius 4) zurück, 15 m senkrecht runter, Bogen flach, danach eine Kuppe */
function hairpinTrack(): Vec3[] {
  const pts: Vec3[] = [{ x: 0, y: 0, z: 0 }, ...line({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 })];
  pts.push(...arc(20, 5, 5, -Math.PI / 2, 0)); // Bogen von waagerecht nach senkrecht, endet bei (25, 5)
  pts.push(...line({ x: 25, y: 5, z: 0 }, { x: 25, y: 20, z: 0 }));
  pts.push(...arc(21, 20, 4, 0, Math.PI)); // Scheitel: von (25, 20) über (21, 24) nach (17, 20)
  pts.push(...line({ x: 17, y: 20, z: 0 }, { x: 17, y: 5, z: 0 }));
  pts.push(...arc(12, 5, 5, 0, -Math.PI / 2)); // Bogen von senkrecht runter nach waagerecht links, endet bei (12, 0)
  pts.push(...line({ x: 12, y: 0, z: 0 }, { x: -10, y: 0, z: 0 }));
  // Kuppe: 8 m hoch über 40 m
  pts.push(...along(40, (t) => ({ x: -10 - 40 * t, y: 8 * Math.sin(Math.PI * t) ** 2, z: 0 })));
  pts.push(...line({ x: -50, y: 0, z: 0 }, { x: -70, y: 0, z: 0 }));
  return pts;
}

describe('Regel der Schienen: aufrecht außer im Looping', () => {
  it('hängt im Looping kopfüber, davor und danach aufrecht; der obere Bogen ist der Schleifenbereich', () => {
    const path = pathFromPoints(loopTrack(), false);
    const s = sampleTrack(path, 0.25);
    const inv = loopRegions(s);
    const n = Array.from(inv).filter((v) => v).length;
    // oberer Halbbogen eines Kreises mit Radius 6 ≈ 19 m, abzüglich der fast senkrechten Stücke
    expect(n * s.step).toBeGreaterThan(8);
    expect(n * s.step).toBeLessThan(22);
    expect(minUp(s)).toBeLessThan(-0.9);
    expect(trackStats(path, s).loops).toBe(1);
    expect(stateAt(s, 10).upy).toBeGreaterThan(0.98);
    expect(stateAt(s, s.length - 5).upy).toBeGreaterThan(0.95);
    // kopfüber nur im Schleifenbereich (und dicht dahinter, bis der Rahmen zurückgedreht ist)
    for (let i = 0; i < s.count; i++) if (s.upy[i] < -0.5) expect(inv[i] || inv[Math.max(0, i - 8)]).toBeTruthy();
  });

  it('nimmt eine Kehre mit senkrechten Schenkeln nicht als Looping und fährt die Kuppe danach aufrecht', () => {
    const path = pathFromPoints(hairpinTrack(), false);
    const s = sampleTrack(path, 0.25);
    expect(Array.from(loopRegions(s)).every((v) => !v)).toBe(true);
    expect(trackStats(path, s).loops).toBe(0);
    // nie kopfüber: der Rahmen dreht sich vor dem Durchgang (auf dem senkrechten Schenkel) um eine halbe Drehung und
    // kommt aufrecht über den Scheitel
    expect(minUp(s)).toBeGreaterThan(-0.3);
    // auf dem Rückweg und auf der Kuppe (x ≈ −30, höchster Punkt) aufrecht
    let top = 0;
    for (let i = 1; i < s.count; i++) if (s.x[i] < -20 && s.x[i] > -40 && s.y[i] > s.y[top]) top = i;
    expect(s.upy[top]).toBeGreaterThan(0.9);
    expect(stateAt(s, s.length - 3).upy).toBeGreaterThan(0.95);
  });

  it('Kuppe und flache Kurve bleiben aufrecht, ohne Schleifenbereich', () => {
    const pts: Vec3[] = [{ x: 0, y: 0, z: 0 }, ...line({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })];
    pts.push(...along(40, (t) => ({ x: 10 + 40 * t, y: 10 * Math.sin(Math.PI * t) ** 2, z: 0 })));
    // flache Kurve um 180° in der Tiefe
    pts.push(...along(47, (t) => ({ x: 50 + 15 * Math.sin(Math.PI * t), y: 0, z: 15 - 15 * Math.cos(Math.PI * t) })));
    const path = pathFromPoints(pts, false);
    const s = sampleTrack(path, 0.25);
    expect(Array.from(loopRegions(s)).every((v) => !v)).toBe(true);
    expect(minUp(s)).toBeGreaterThan(0.6);
  });
});

describe('Mindestradius als Eigenschaft des Fits', () => {
  const menger = (a: Vec3, b: Vec3, c: Vec3): number => {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const bcx = c.x - b.x, bcy = c.y - b.y, bcz = c.z - b.z;
    const cx = aby * bcz - abz * bcy, cy = abz * bcx - abx * bcz, cz = abx * bcy - aby * bcx;
    const la = Math.hypot(abx, aby, abz), lb = Math.hypot(bcx, bcy, bcz), lc = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    return (2 * Math.hypot(cx, cy, cz)) / (la * lb * lc);
  };
  const maxK = (pts: Vec3[]): number => {
    let m = 0;
    for (let i = 1; i < pts.length - 1; i++) m = Math.max(m, menger(pts[i - 1], pts[i], pts[i + 1]));
    return m;
  };

  it('macht aus einer rechtwinkligen Ecke einen Bogen von 4 m, Anfang und Ende bleiben, Abweichung unter 2 m', () => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: i, y: 0, z: 0 });
    for (let i = 1; i <= 20; i++) pts.push({ x: 20, y: i, z: 0 });
    const out = relaxCurvature(pts, 4);
    expect(maxK(pts)).toBeGreaterThan(1);
    expect(maxK(out)).toBeLessThan(0.26);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    let dev = 0;
    for (let i = 0; i < pts.length; i++) dev = Math.max(dev, Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y));
    expect(dev).toBeGreaterThan(1);
    expect(dev).toBeLessThan(2);
  });

  it('lässt eine 4-m-Schleife, eine weite Kurve und auch eine zu enge Schleife liegen (Schleifen weitet der Pinsel)', () => {
    const ring = along(26, (t) => ({ x: 4 * Math.cos(2 * Math.PI * t), y: 4 * Math.sin(2 * Math.PI * t), z: 0 }));
    const out = relaxCurvature(ring, 4);
    for (let i = 0; i < ring.length; i++) expect(Math.hypot(out[i].x - ring[i].x, out[i].y - ring[i].y)).toBeLessThan(0.05);
    const wide = along(60, (t) => ({ x: 30 * Math.cos(t), y: 30 * Math.sin(t), z: t * 3 }));
    expect(relaxCurvature(wide, 4)).toEqual(wide);
    // eine 2-m-Schleife im Strich (Gerade, Kringel, Gerade): Glätten zöge sie zusammen, also bleibt sie
    const curl: Vec3[] = [];
    for (let i = 0; i <= 10; i++) curl.push({ x: i, y: 0, z: 0 });
    curl.push(...along(13, (t) => ({ x: 10 + 2 * Math.sin(2 * Math.PI * t), y: 2 - 2 * Math.cos(2 * Math.PI * t), z: 0 })));
    for (let i = 1; i <= 10; i++) curl.push({ x: 10 + i, y: 0, z: 0 });
    expect(relaxCurvature(curl, 4)).toEqual(curl);
    // dieselbe Folge mit einer Ecke davor: nur die Ecke wird gerundet, der Kringel bleibt
    const cornerAndCurl: Vec3[] = [];
    for (let i = 0; i <= 8; i++) cornerAndCurl.push({ x: 0, y: 8 - i, z: 0 });
    cornerAndCurl.push(...curl.slice(1));
    const r2 = relaxCurvature(cornerAndCurl, 4);
    expect(maxK(r2.slice(0, 14))).toBeLessThan(0.26);
    for (let i = 20; i < r2.length; i++) expect(r2[i]).toEqual(cornerAndCurl[i]);
  });

  it('weicht nie weiter als 2 m von der Tinte ab: eine 150°-Ecke bleibt eng, statt weit auszuholen', () => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: i, y: 0, z: 0 });
    const a = (150 * Math.PI) / 180;
    for (let i = 1; i <= 20; i++) pts.push({ x: 20 + i * Math.cos(a), y: i * Math.sin(a), z: 0 });
    const out = relaxCurvature(pts, 4);
    let dev = 0;
    for (let i = 0; i < pts.length; i++) dev = Math.max(dev, Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y));
    expect(dev).toBeLessThanOrEqual(2.0001);
  });

  it('wird auch mit einer engen Rampe in der Tiefe fertig (Spurwechsel 2,2 m auf 4 m)', () => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 30; i++) pts.push({ x: i, y: 0, z: i < 10 ? 0 : i > 14 ? 2.2 : (2.2 * (1 - Math.cos((Math.PI * (i - 10)) / 4))) / 2 });
    const out = relaxCurvature(pts, 4);
    expect(maxK(out)).toBeLessThan(0.26);
    // die Rampe wird länger, kommt aber auf der anderen Spur an
    expect(out[30].z).toBe(2.2);
    expect(Math.abs(out[20].z - 2.2)).toBeLessThan(0.3);
  });
});
