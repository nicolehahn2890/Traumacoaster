import { afterEach, describe, expect, it } from 'vitest';
import type { InstancedMesh, Mesh } from 'three';
import { WorldCamera } from '@/world/camera';
import { Camera } from '@/render/camera';
import { LANE_MAX, LANE_MIN, rayToWorld, setPerspective, setView, tagRay, toStage, toView, viewDistance, viewScale, type StagePoint } from '@/track/stage';
import { planBrushTrack } from '@/track/brushTrack';
import { railBanksFor, sampleTrack, type TrackPath } from '@/track/model';
import { Terrain } from '@/physics/terrain';
import { rect, ring, sweepGeometry, trackFrames } from '@/world/trackMesh';
import { ATTACH, HANG_LIFT, SUPPORT_SPACING, buildTrack } from '@/world/trackBuilder';
import { TerrainFoundation } from '@/world/foundations';
import { buildWorldSupports, planWorldSupports, SUPPORT_MIN_H } from '@/world/supports';
import { buildCave, buildColumn, buildFlat, buildPortal, buildThreePart, buildWater, buildWaterfall } from '@/world/elements';
import { elementsFromTerrain } from '@/world/levelElements';
import { footBelow } from '@/world/foundations';
import { LOOKS, applyGrade, grade, parseLook } from '@/world/looks';

/** deterministische Zufallszahlen */
function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Bühnenkamera (Pixel je Meter um das Ziel) wie die Weltansicht */
function stageCamera(cx: number, cy: number, zoom: number, w: number, h: number): Camera {
  const c = new Camera();
  c.resize(w, h);
  c.set(cx, cy, zoom);
  c.snap();
  return c;
}

afterEach(() => setPerspective(false));

describe('Weltrenderer: 100-Punkte-Test (Richtlinie 2.1, Paket 1)', () => {
  it('Bühne: die geneigte Ortho-Kamera der Welt trifft die Bühnenformel Y = y + 0,5·Tiefe auf 100 Punkten', () => {
    const r = lcg(11);
    const world = new WorldCamera();
    for (let k = 0; k < 5; k++) {
      const cx = r() * 200;
      const cy = r() * 30 - 5;
      const zoom = 3 + r() * 40;
      const w = 600 + Math.round(r() * 800);
      const h = 400 + Math.round(r() * 600);
      const stage = stageCamera(cx, cy, zoom, w, h);
      world.set({ cx, cy, zoom, width: w, height: h, persp: false, fov: 18 });
      for (let i = 0; i < 20; i++) {
        const x = r() * 240 - 20;
        const y = r() * 40 - 5;
        const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
        const s = toStage(x, y, z);
        const a = stage.toScreen(s.X, s.Y);
        const b = world.toScreen(x, y, z);
        expect(b.x).toBeCloseTo(a.x, 4);
        expect(b.y).toBeCloseTo(a.y, 4);
      }
    }
  });

  it('Perspektive 18°: die Three-Kamera projiziert wie toView, und der Strahl aus dem Bild führt zurück (100 Punkte)', () => {
    const r = lcg(23);
    const world = new WorldCamera();
    setPerspective(true, 18);
    for (let k = 0; k < 5; k++) {
      const cx = r() * 200;
      const cy = r() * 30 - 5;
      const zoom = 3 + r() * 40;
      const w = 600 + Math.round(r() * 800);
      const h = 400 + Math.round(r() * 600);
      const stage = stageCamera(cx, cy, zoom, w, h);
      setView(cx, cy, viewDistance(zoom, h, 18));
      world.set({ cx, cy, zoom, width: w, height: h, persp: true, fov: 18 });
      for (let i = 0; i < 20; i++) {
        const x = r() * 240 - 20;
        const y = r() * 40 - 5;
        const z = LANE_MIN + r() * (LANE_MAX - LANE_MIN);
        // Bild der Welt = Bild der Bühnen-Ansicht
        const v = toView(x, y, z);
        const a = stage.toScreen(v.X, v.Y);
        const b = world.toScreen(x, y, z);
        expect(b.x).toBeCloseTo(a.x, 4);
        expect(b.y).toBeCloseTo(a.y, 4);
        // Strahl durch diesen Bildpunkt auf der Spur z trifft wieder den Weltpunkt: die Bahn liegt auf dem Strich
        const wpt = rayToWorld(tagRay(stage.toStage(b.x, b.y)), z);
        expect(wpt.x).toBeCloseTo(x, 6);
        expect(wpt.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('Perspektive: Spurmaßstab wie im Tiefen-Labor (22° bei 8 px/m: Spur −2 8,76 px/m, Spur +2 7,36 px/m)', () => {
    const world = new WorldCamera();
    const cx = 90;
    const cy = 8;
    setPerspective(true, 22);
    setView(cx, cy, viewDistance(8, 540, 22));
    world.set({ cx, cy, zoom: 8, width: 1170, height: 540, persp: true, fov: 22 });
    for (const lane of [-2, 0, 2]) {
      const o = world.toScreen(cx, cy, lane);
      const ox = world.toScreen(cx + 1, cy, lane);
      const oy = world.toScreen(cx, cy + 1, lane);
      // waagerechter Meter auf Zielhöhe: genau der Container-Maßstab; der senkrechte Meter ist dank Streckung am Ziel
      // gleich lang und auf den anderen Spuren bis auf wenige Prozent (er liegt im Bild über oder unter dem Ziel)
      expect(Math.hypot(ox.x - o.x, ox.y - o.y)).toBeCloseTo(8 * viewScale(lane), 6);
      const vertical = Math.hypot(oy.x - o.x, oy.y - o.y);
      // auch am Ziel liegt das obere Ende des Meters der Kamera etwas näher: ein Viertelprozent
      if (lane === 0) expect(Math.abs(vertical - 8)).toBeLessThan(0.05);
      else expect(Math.abs(vertical / (8 * viewScale(lane)) - 1)).toBeLessThan(0.03);
    }
    expect(8 * viewScale(-2)).toBeCloseTo(8.76, 1);
    expect(8 * viewScale(2)).toBeCloseTo(7.36, 1);
    // Zoom als Kamerafahrt: näher heran, stärkere Perspektive (Spur −2 gegen Spur +2)
    const spread = (zoom: number): number => {
      setView(cx, cy, viewDistance(zoom, 540, 22));
      world.set({ cx, cy, zoom, width: 1170, height: 540, persp: true, fov: 22 });
      const a = world.toScreen(cx + 10, cy, -2).x - world.toScreen(cx, cy, -2).x;
      const b = world.toScreen(cx + 10, cy, 2).x - world.toScreen(cx, cy, 2).x;
      return a / b;
    };
    expect(spread(14)).toBeGreaterThan(spread(7));
  });

  it('Bühne gegen Perspektive: die Perspektive verschiebt ferne Punkte um Pixel, nahe am Ziel kaum (Labor 2.2)', () => {
    const world = new WorldCamera();
    const cx = 90;
    const cy = 8;
    const stage = stageCamera(cx, cy, 8, 1170, 540);
    world.set({ cx, cy, zoom: 8, width: 1170, height: 540, persp: true, fov: 22 });
    let maxFar = 0;
    let maxNear = 0;
    const r = lcg(5);
    for (let i = 0; i < 100; i++) {
      const far = i < 50;
      const x = cx + (far ? (r() - 0.5) * 200 : (r() - 0.5) * 10);
      const y = cy + (far ? (r() - 0.5) * 40 : (r() - 0.5) * 4);
      const z = far ? LANE_MIN + r() * (LANE_MAX - LANE_MIN) : (r() - 0.5) * 0.2;
      const s = toStage(x, y, z);
      const a = stage.toScreen(s.X, s.Y);
      const b = world.toScreen(x, y, z);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (far) maxFar = Math.max(maxFar, d);
      else maxNear = Math.max(maxNear, d);
    }
    expect(maxFar).toBeGreaterThan(10);
    expect(maxFar).toBeLessThan(90);
    expect(maxNear).toBeLessThan(1.5);
  });
});

/** gezeichnete Hügelbahn mit dem Pinsel (ohne Perspektive) */
function hillPath(): TrackPath {
  setPerspective(false);
  const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] } as never);
  const pts: StagePoint[] = [];
  for (let x = 10; x <= 90; x += 0.5) pts.push({ X: x, Y: 2 + 10 * Math.exp(-((x - 50) ** 2) / 200) });
  const plan = planBrushTrack(pts.map((p) => tagRay(p)), { ground: (x, z) => flat.groundHeight(x, z), clearance: 0.8, closeSnap: 8, tolerance: 0.5 });
  expect(plan).not.toBeNull();
  return plan!.path;
}

const allFinite = (m: Mesh): boolean => {
  const arr = m.geometry.getAttribute('position').array as Float32Array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
};

describe('Weltrenderer: Bahnprofil aus dem Bahnmodell (Schritt 2)', () => {
  it('Rahmen je Abtastpunkt: Einheitsvektoren, rechtshändig, Seite zum Betrachter bei Fahrt nach rechts', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    expect(frames.length).toBe(samples.count);
    for (const f of frames) {
      expect(f.t.length()).toBeCloseTo(1, 6);
      expect(f.n.length()).toBeCloseTo(1, 6);
      expect(f.s.length()).toBeCloseTo(1, 6);
      expect(Math.abs(f.t.dot(f.n))).toBeLessThan(1e-6);
      const cross = f.t.clone().cross(f.n);
      expect(cross.distanceTo(f.s)).toBeLessThan(1e-6);
      // flach nach rechts: oben ist +y, die Seite zeigt nach vorn (+Z, zum Betrachter)
      if (f.t.x > 0.99 && f.n.y > 0.99) expect(f.s.z).toBeGreaterThan(0.99);
    }
    // Welt-Z: Spur 0 liegt bei Z = 0, hinten negativ
    for (let i = 0; i < samples.count; i++) expect(frames[i].p.z).toBeCloseTo(-samples.z[i] * 8.4, 6);
  });

  it('Profil entlang der Bahn: endliche Werte, sechs Ecken je Rahmenpaar und Profilkante', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    const plate = sweepGeometry(frames, rect(-1, -0.5, 1, 0), { closed: true, step: 2 });
    const picks = Math.ceil(frames.length / 2) + (frames.length % 2 === 0 ? 1 : 0);
    expect(plate.getAttribute('position').count).toBe((picks - 1) * 4 * 6);
    const tube = sweepGeometry(frames, ring(0.55, 0, 0.24, 7), { closed: true, step: 1 });
    expect(tube.getAttribute('position').count).toBe((frames.length - 1) * 7 * 6);
    const strip = sweepGeometry(frames, [{ x: -1, y: 0 }, { x: 1, y: 0 }], { step: 4 });
    for (const g of [plate, tube, strip]) {
      const arr = g.getAttribute('position').array as Float32Array;
      for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      expect(g.getAttribute('normal')).toBeDefined();
    }
    // die Platte liegt um die Bahnmitte: ihre Ecken sind höchstens 1,2 m von der Bahn entfernt
    const arr = plate.getAttribute('position').array as Float32Array;
    let far = 0;
    for (let i = 0; i < arr.length; i += 3) {
      let best = Infinity;
      for (const f of frames) best = Math.min(best, Math.hypot(arr[i] - f.p.x, arr[i + 1] - f.p.y, arr[i + 2] - f.p.z));
      far = Math.max(far, best);
    }
    expect(far).toBeLessThan(1.2);
  });

  it('Straße und Stahl bauen aus der gezeichneten Bahn Gruppen mit Teilen, Schwellen als Instanzen', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    const road = buildTrack(frames, samples.length, 'road');
    const steel = buildTrack(frames, samples.length, 'steel');
    const meshes = (g: typeof road): Mesh[] => {
      const out: Mesh[] = [];
      g.traverse((o) => {
        if ((o as Mesh).geometry) out.push(o as Mesh);
      });
      return out;
    };
    expect(meshes(road).length).toBe(6);
    expect(meshes(steel).length).toBe(6);
    for (const m of [...meshes(road), ...meshes(steel)]) expect(allFinite(m)).toBe(true);
    const ties = meshes(steel).find((m) => (m as InstancedMesh).isInstancedMesh) as InstancedMesh;
    expect(ties.count).toBe(Math.floor(samples.length / 1.1));
  });
});

describe('Weltrenderer: Stützen auf Fundamentflächen (Schritt 3)', () => {
  const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] } as never);
  const lake = new Terrain({ width: 200, terrain: [{ kind: 'flat' }, { kind: 'lake', x: 50, width: 30 }] } as never);

  it('alle vier Profile bauen aus derselben Bahn Gruppen mit Teilen', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    for (const type of ['road', 'steel', 'wood', 'hanging'] as const) {
      const g = buildTrack(frames, samples.length, type);
      let parts = 0;
      g.traverse((o) => {
        const m = o as Mesh;
        if (!m.geometry) return;
        parts++;
        expect(allFinite(m)).toBe(true);
      });
      expect(parts).toBeGreaterThanOrEqual(3);
    }
    // Hängebahn: der Tragbalken liegt HANG_LIFT über der Bahnlinie, die Stützen greifen darüber
    expect(ATTACH.hanging).toBeGreaterThan(HANG_LIFT);
    expect(ATTACH.wood).toBeLessThan(0);
  });

  it('flacher Boden: Füße stehen auf dem Boden, alle SPACING Meter eine Stütze, Höhe über der Mindesthöhe', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    const { plans, stats } = planWorldSupports(samples, frames, 'wood', [new TerrainFoundation(flat)], (x, y, z) => flat.insideMountain(x, y, z));
    expect(stats.floating).toBe(0);
    expect(stats.rock).toBe(0);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(Math.floor(samples.length / SUPPORT_SPACING.wood) + 1);
    for (const p of plans) {
      expect(p.kind).toBe('ground');
      expect(p.F.y).toBeCloseTo(0, 6);
      expect(p.h).toBeGreaterThanOrEqual(SUPPORT_MIN_H);
      expect(p.A.y - p.F.y).toBeCloseTo(p.h, 9);
      // der Anschluss liegt ATTACH unter der Bahn (bei flacher Bahn senkrecht)
      expect(p.A.y).toBeLessThan(frames[p.seed].p.y);
    }
    // zwei Füße nie dichter als 2,6 m in der Draufsicht
    for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) expect(Math.hypot(plans[i].F.x - plans[j].F.x, plans[i].F.z - plans[j].F.z)).toBeGreaterThanOrEqual(2.6);
  });

  it('Wasser trägt nicht: über dem See bleiben die Stellen schwebend', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    const dry = planWorldSupports(samples, frames, 'steel', [new TerrainFoundation(flat)], () => false);
    const wet = planWorldSupports(samples, frames, 'steel', [new TerrainFoundation(lake)], () => false);
    expect(wet.stats.floating).toBeGreaterThan(0);
    expect(wet.plans.length).toBeLessThan(dry.plans.length);
    for (const p of wet.plans) expect(lake.waterAt(p.F.x, -p.F.z / 8.4)).toBe(false);
  });

  it('Familien als Instanzen: höchstens fünf Zeichenaufrufe je Bahntyp, Matrizen endlich', () => {
    const samples = sampleTrack(hillPath(), 0.25);
    const frames = trackFrames(samples, railBanksFor(samples));
    for (const type of ['road', 'steel', 'wood', 'hanging'] as const) {
      const { plans } = planWorldSupports(samples, frames, type, [new TerrainFoundation(flat)], () => false);
      const g = buildWorldSupports(plans, type);
      const meshes: InstancedMesh[] = [];
      g.traverse((o) => {
        if ((o as InstancedMesh).isInstancedMesh) meshes.push(o as InstancedMesh);
      });
      expect(meshes.length).toBeGreaterThan(0);
      expect(meshes.length).toBeLessThanOrEqual(5);
      let instances = 0;
      for (const m of meshes) {
        instances += m.count;
        const arr = m.instanceMatrix.array as Float32Array;
        for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      }
      expect(instances).toBeGreaterThanOrEqual(plans.length);
    }
  });
});

describe('Weltrenderer: Kulissen-Platzhalter und Looks (Schritt 4)', () => {
  it('Dreiteiler: Lippe mit Öffnungen hat mehr Ecken als ohne, Rückwand liegt hinter, Lippe vor der Spur', () => {
    const outline: Array<[number, number]> = [[0, 0], [10, 12], [20, 0], [20, -1], [0, -1]];
    const solid = buildThreePart(outline, 1, 7, [], '#a0765a');
    const holed = buildThreePart(outline, 1, 7, [{ x: 6, y: 2, r: 2 }, { x: 15, y: 3, r: 2 }], '#a0765a');
    const verts = (e: typeof solid, i: number): number => (e.group.children[i] as Mesh).geometry.getAttribute('position').count;
    expect(verts(holed, 1)).toBeGreaterThan(verts(solid, 1));
    expect(holed.openings?.length).toBe(2);
    const back = holed.group.children[0] as Mesh;
    const lip = holed.group.children[1] as Mesh;
    expect(back.position.z).toBeCloseTo(-8.4 - 3.5, 6);
    expect(lip.position.z).toBeCloseTo(-8.4 + 3.5, 6);
  });

  it('Höhlenboden trägt, Wasser sperrt, Säule als Tiefenvolumen schreibt keine Farbe', () => {
    const cave = buildCave(50, -20, 0, 40, 12, 14, '#5a4a3a');
    expect(cave.foundation!.surfaceBelow(50, -10, 0)).toEqual({ y: -20, kind: 'cave' });
    expect(cave.foundation!.surfaceBelow(80, -10, 0)).toBeNull();
    expect(cave.foundation!.surfaceBelow(50, -25, 0)).toBeNull();
    const water = buildWater(100, 0, 0, 30, 20, '#3ec7c2');
    const flat = new Terrain({ width: 200, terrain: [{ kind: 'flat' }] } as never);
    const ground = { surfaceBelow: (x: number, y: number, z: number) => (flat.groundHeight(x, z) < y ? { y: flat.groundHeight(x, z), kind: 'ground' as const } : null) };
    expect(footBelow([ground, water.foundation!], 100, 5, 0)).toBeNull();
    expect(footBelow([ground, water.foundation!], 140, 5, 0)).toEqual({ y: 0, kind: 'ground' });
    const col = buildColumn(10, 0, 0, 1, 8, '#888', true);
    expect(((col.group.children[0] as Mesh).material as { colorWrite: boolean }).colorWrite).toBe(false);
    expect(buildFlat(0, 0, 0, 3, 4, '#f00', 'Haus').kind).toBe('flat');
    expect(buildWaterfall(0, 0, 0, 2, 6, '#bfefff').kind).toBe('waterfall');
    expect(buildPortal(0, 2, -1, 2, 0.3, '#888').openings?.[0].r).toBe(2);
    for (const e of [cave, water, col]) e.dispose();
  });

  it('Level-Kulissen: Berg wird Dreiteiler mit Öffnung am Portal, See eine Wasserfläche, die Stützen meiden', () => {
    const terrain = new Terrain({ width: 200, terrain: [{ kind: 'flat' }, { kind: 'mountain', x: 60, width: 40, height: 18, lane: 0 }, { kind: 'lake', x: 150, width: 30, lane: -1 }] } as never);
    const world = { id: 3, palette: { accent: '#ffb13b', ground: ['#a0765a', '#6b4a35'], sky: ['#5c6b8a', '#9aa9c4', '#e8d9b5'] } } as never;
    const none = elementsFromTerrain(terrain, world, []);
    expect(none.map((e) => e.kind)).toEqual(['threePart', 'water']);
    const withPortals = elementsFromTerrain(terrain, world, [{ x: 44, y: 3, z: 0 }, { x: 76, y: 3, z: 0 }, { x: 150, y: 1, z: 0 }]);
    expect(withPortals.filter((e) => e.kind === 'portal').length).toBe(2);
    expect(withPortals.find((e) => e.kind === 'threePart')!.openings!.length).toBe(2);
    const water = withPortals.find((e) => e.kind === 'water')!;
    expect(water.foundation!.blocks!(150, -1)).toBe(true);
    expect(water.foundation!.blocks!(150, 1)).toBe(false);
    for (const e of withPortals) e.dispose();
  });

  it('Looks: Presets setzen die Umfärbe-Uniforms, Adresse wird geprüft', () => {
    applyGrade(LOOKS.night);
    expect(grade.uBright.value).toBeCloseTo(0.58, 6);
    expect(grade.uGradeMix.value).toBeCloseTo(0.5, 6);
    applyGrade(LOOKS.day);
    expect(grade.uHue.value).toBe(0);
    expect(grade.uGradeMix.value).toBe(0);
    expect(parseLook('neon')).toBe('neon');
    expect(parseLook('foo')).toBeNull();
    expect(parseLook(null)).toBeNull();
  });
});
