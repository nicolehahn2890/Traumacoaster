import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_TILT,
  LANE_DEPTH,
  setCameraTilt,
  setPerspective,
  setView,
  toStage,
  toView,
  viewDistance,
  type StagePoint,
} from "@/track/stage";
import {
  DOCK_GAP,
  SliceFoundation,
  buildSliceStack,
  deepestDock,
  depthAt,
  edgeAt,
  groundDepth,
  landingAt,
  type Slice,
  type SliceStack,
} from "@/zone/slices";
import {
  BrushRefiner,
  pathFromPoints,
  planBrushTrack,
  previewBrushTrack,
  type BrushPreview,
} from "@/track/brushTrack";
import { RubberBrush } from "@/track/brush";
import { sampleTrack } from "@/track/model";
import { TrainSim } from "@/physics/trainSim";
import { Terrain } from "@/physics/terrain";

/** kleiner Stapel von Hand: zwei Terrassen, die hintere höher, die vordere mit einem Bogen und Höhlenrückwand */
function band(
  lane: number,
  role: Slice["role"],
  top: number,
  low = -14,
  x0 = 0,
  x1 = 100,
): Slice {
  const n = x1 - x0 + 1;
  return {
    lane,
    role,
    x0,
    step: 1,
    top: new Float32Array(n).fill(top),
    low: new Float32Array(n).fill(low),
    colors: { rim: "#fff", top: "#fff", bottom: "#000" },
    dot: 0.3,
  };
}

function stack(): SliceStack {
  const front = band(-1, "play", 3);
  // Bogen x 40–60 bis 2,5 m hoch
  for (let x = 40; x <= 60; x++) front.low[x] = 2.5;
  const cave = band(-0.5, "cave", 6, -14, 38, 62);
  const back = band(1, "play", 8);
  const far = band(10, "far", 40);
  return { slices: [front, cave, back, far] };
}

afterEach(() => {
  setCameraTilt(DEFAULT_CAMERA_TILT);
  setPerspective(false);
});

describe("Ebenen-Test: Tiefe aus Vektorscheiben", () => {
  it("liest die vorderste sichtbare Scheibe, im Bogen die Höhle, darüber die hintere, im Himmel nichts", () => {
    setCameraTilt((3 * Math.PI) / 180);
    const st = stack();
    const at = (x: number, y: number, lane: number) => {
      const p = toStage(x, y, lane);
      return depthAt(st, p);
    };
    expect(at(20, 1, -1)).toBeCloseTo(-1 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(50, 1.5, -0.5)).toBeCloseTo(-0.5 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(20, 5, 1)).toBeCloseTo(1 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(20, 20, 1)).toBeNull();
  });

  it("Stützen stehen auf der Kante der Scheibe davor", () => {
    const f = new SliceFoundation(stack());
    expect(f.surfaceBelow(20, 6, 0)?.y).toBeCloseTo(3, 6);
    expect(f.surfaceBelow(20, 2, 0)).toBeNull();
    expect(f.blocks()).toBe(false);
  });

  it("der Pinsel legt die Bahn bei 3° auf die Scheibe unter dem Strich (vorne flach, dann hinauf auf die hintere Terrasse)", () => {
    setCameraTilt((3 * Math.PI) / 180);
    const st = stack();
    const line = [];
    for (let x = 0; x <= 90; x += 0.25)
      line.push(
        toStage(
          x,
          x < 45 ? 1.2 : Math.min(6, 1.2 + (x - 45) * 0.3),
          x < 45 ? -1 : 1,
        ),
      );
    const plan = planBrushTrack(line, {
      ground: () => 0,
      holdLane: true,
      depthAt: (p) => depthAt(st, p),
    })!;
    const z = (x: number) => plan.z[Math.round(x)] / LANE_DEPTH;
    // vorne vor der vorderen Scheibe (nach der ruhigen Strecke an der Station, die ihre Tiefe hält), hinten vor der hinteren
    expect(z(40)).toBeLessThan(-0.8);
    expect(z(85)).toBeGreaterThan(0.6);
  });

  it("hinter der Spielzone: Bäume und kleine Berge sind bemalbar, große Berge nicht, Büsche davor sind durchsichtig", () => {
    setCameraTilt((3 * Math.PI) / 180);
    const st: SliceStack = {
      slices: [
        band(-3, "front", 2),
        band(-1, "play", 1),
        band(2.3, "deep", 9),
        band(7.5, "deep", 30),
        band(14, "far", 60),
      ],
    };
    const at = (x: number, y: number, lane: number) =>
      depthAt(st, toStage(x, y, lane));
    // durch die Büsche hindurch: die Terrasse dahinter (hier nicht sichtbar über ihr: nichts)
    expect(at(20, 0.5, -3)).toBeCloseTo(-1 * LANE_DEPTH - DOCK_GAP, 1);
    expect(at(20, 0.5, -1)).toBeCloseTo(-1 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(20, 5, 2.3)).toBeCloseTo(2.3 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(20, 20, 7.5)).toBeCloseTo(7.5 * LANE_DEPTH - DOCK_GAP, 6);
    expect(at(20, 45, 14)).toBeNull();
    expect(deepestDock(st)).toBeCloseTo(7.5 * LANE_DEPTH - DOCK_GAP, 6);
    // die Bahn darf dorthin: Strich auf den kleinen Bergen landet in ihrer Tiefe, weit hinter der Bühne
    const line = [];
    for (let x = 0; x <= 120; x += 0.25)
      line.push(
        toStage(
          x,
          x < 40 ? 0.8 : Math.min(20, 0.8 + (x - 40) * 0.6),
          x < 40 ? -1 : 7.5,
        ),
      );
    const plan = planBrushTrack(line, {
      ground: () => 0,
      holdLane: true,
      depthAt: (p) => depthAt(st, p),
      zMax: deepestDock(st),
    })!;
    expect(plan.z[plan.z.length - 5]).toBeGreaterThan(5 * LANE_DEPTH);
  });

  it("Landen statt Kleben (3°, 30°, Perspektive): Hügel bleiben Höhe, flach über Bäumen und am Bergrücken landet die Bahn", () => {
    setCameraTilt((3 * Math.PI) / 180);
    setPerspective(true, 30);
    const st = buildSliceStack(200);
    const trees = st.slices.find((s) => s.lane === 2.3)!;
    const ridge = st.slices.find((s) => s.lane === 7.5)!;
    const stroke = (
      route: Array<[number, number, number]>,
      cx: number,
      cy: number,
      zoom: number,
    ): StagePoint[] => {
      setView(cx, cy, viewDistance(zoom, 390, 30));
      const line: StagePoint[] = [];
      for (let k = 0; k < route.length - 1; k++) {
        const a = toView(...route[k]);
        const b = toView(...route[k + 1]);
        const m = Math.ceil(Math.hypot(b.X - a.X, b.Y - a.Y) / 0.25);
        for (let i = 0; i < m; i++)
          line.push({
            X: a.X + ((b.X - a.X) * i) / m,
            Y: a.Y + ((b.Y - a.Y) * i) / m,
            cx,
            cy,
          });
      }
      return line;
    };
    // ohne und mit Bodenhöhe aus den Scheiben (Mischung): beide lassen Hügel Höhe sein und landen am Bergrücken
    let ground = false;
    const lanes = (line: StagePoint[]) => {
      const plan = planBrushTrack(line, {
        ground: () => 0,
        holdLane: true,
        holdDepth: 0,
        depthAt: (p) => landingAt(st, p),
        zMax: deepestDock(st),
        groundAt: ground ? (p) => groundDepth(st, p) : undefined,
      })!;
      return {
        max: Math.max(...plan.z) / LANE_DEPTH,
        end: plan.z[plan.z.length - 2] / LANE_DEPTH,
        top: Math.max(...plan.pts.map((p) => p.y)),
      };
    };
    for (const g of [false, true]) {
      ground = g;
      const hill = lanes(
        stroke(
          [
            [38, 1, 0],
            [48, 2, 0],
            [58, 9, 0],
            [66, 15, 0],
            [74, 9, 0],
            [84, 2.5, 0],
            [96, 2, 0],
          ],
          64,
          8,
          12,
        ),
      );
      expect(hill.top).toBeGreaterThan(12);
      expect(hill.max).toBeLessThan(0.3);
    }
    ground = false;
    const T = (x: number) =>
      Math.max(
        ...[-3, -1.5, 0, 1.5, 3].map((d) => edgeAt(trees, trees.top, x + d)),
      ) + 0.6;
    const onTrees = lanes(
      stroke(
        [
          [38, 1, 0],
          [50, 4, 0],
          [58, T(60), 2.3],
          [66, T(66), 2.3],
          [74, T(74), 2.3],
          [82, T(82), 2.3],
          [90, T(90), 2.3],
        ],
        64,
        10,
        9,
      ),
    );
    expect(onTrees.end).toBeGreaterThan(1.8);
    const R = (x: number) => edgeAt(ridge, ridge.top, x) + 0.8;
    const onRidge = lanes(
      stroke(
        [
          [38, 1, 0],
          [50, 6, 0],
          [62, R(70), 7.5],
          [74, R(78), 7.5],
          [86, R(86), 7.5],
          [98, R(98), 7.5],
          [110, R(110), 7.5],
        ],
        70,
        18,
        6,
      ),
    );
    expect(onRidge.end).toBeGreaterThan(7);
  });

  it("Kehre im Ebenen-Modus (12°, 26°): Halbkreis durch die Tiefe statt Beule, kein Knick am Scheitel, die Fahrt kommt durch", () => {
    setCameraTilt((12 * Math.PI) / 180);
    setPerspective(true, 26);
    const st = buildSliceStack(200);
    setView(85, 8, viewDistance(8, 390, 26));
    const route: Array<[number, number, number]> = [
      [38, 1, 0],
      [60, 6, 0],
      [90, 9, 0],
      [115, 8, 0],
      [128, 5, 0],
      [126, 2, 0],
      [110, 1, 0],
      [80, 1.5, 0],
      [60, 2, 0],
    ];
    const P = route.map((r) => toView(...r));
    const Q = (i: number) => P[Math.max(0, Math.min(P.length - 1, i))];
    const line: StagePoint[] = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [p0, p1, p2, p3] = [Q(i - 1), Q(i), Q(i + 1), Q(i + 2)];
      for (let k = 0; k < 40; k++) {
        const t = k / 40;
        const f = (a: number, b: number, c: number, d: number) =>
          0.5 *
          (2 * b +
            (-a + c) * t +
            (2 * a - 5 * b + 4 * c - d) * t * t +
            (-a + 3 * b - 3 * c + d) * t * t * t);
        line.push({
          X: f(p0.X, p1.X, p2.X, p3.X),
          Y: f(p0.Y, p1.Y, p2.Y, p3.Y),
          cx: 85,
          cy: 8,
        });
      }
    }
    const plan = planBrushTrack(line, {
      ground: () => 0,
      holdLane: true,
      holdDepth: 0,
      depthAt: (p) => landingAt(st, p),
      zMax: deepestDock(st),
      groundAt: (p) => groundDepth(st, p),
    })!;
    const s = sampleTrack(plan.path, 0.25);
    let kMax = 0;
    for (let i = 0; i < s.count; i++)
      kMax = Math.max(kMax, Math.hypot(s.k3x[i], s.k3y[i], s.k3z[i]));
    expect(1 / kMax).toBeGreaterThan(1.5);
    const sim = new TrainSim(s, plan.path, {
      cars: 3,
      carLength: 2.4,
      skin: "skinWood",
      frictionScale: 1,
      gravityScale: 1,
      startType: "chainlift",
      coins: [],
      terrain: new Terrain({
        width: 400,
        terrain: [{ kind: "flat" }],
      } as never),
      allowTunnels: true,
      lateralLimit: Infinity,
      checkCrossings: false,
      depthPerspective: 70,
    });
    for (let i = 0; i < 60 * 120 && !sim.finished; i++) sim.step(1 / 60);
    expect(sim.failReason ?? "openEnd").toBe("openEnd");
  });

  it("Physik nach Bildgröße: 18-m-Hügel 6 Spuren hinten nach 20 m Kette schafft der Zug, mit echter Physik rollt er zurück", () => {
    const key: Array<[number, number, number]> = [
      [0, 1, 0],
      [14, 1, 0],
      [40, 20, 0],
      [55, 20, 0],
      [80, 3, 0],
      [110, 4, 2],
      [140, 6, 6],
      [165, 18, 6],
      [190, 4, 6],
      [220, 3, 6],
    ];
    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let k = 0; k < key.length - 1; k++) {
      const [a, b] = [key[k], key[k + 1]];
      const m = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let i = 0; i < m; i++) {
        const t = i / m;
        const e = t * t * (3 - 2 * t);
        pts.push({
          x: a[0] + (b[0] - a[0]) * t,
          y: a[1] + (b[1] - a[1]) * e,
          z: (a[2] + (b[2] - a[2]) * e) * LANE_DEPTH,
        });
      }
    }
    const path = pathFromPoints(pts, false);
    path.startType = "chainlift";
    const s = sampleTrack(path, 0.25);
    const ride = (D?: number) => {
      const sim = new TrainSim(s, path, {
        cars: 3,
        carLength: 2.4,
        skin: "skinWood",
        frictionScale: 1,
        gravityScale: 1,
        startType: "chainlift",
        coins: [],
        terrain: new Terrain({
          width: 400,
          terrain: [{ kind: "flat" }],
        } as never),
        allowTunnels: true,
        lateralLimit: Infinity,
        checkCrossings: false,
        depthPerspective: D,
      });
      for (let i = 0; i < 60 * 120 && !sim.finished; i++) sim.step(1 / 60);
      return sim.failReason;
    };
    expect(ride()).toBe("stall");
    expect(ride(70)).toBe("openEnd");
  });

  it("Malen nach hinten (12°, 26°, Bodenhöhe): die gezeigte Bahn springt nicht, und nach dem Loslassen bleibt die Tiefe", () => {
    setCameraTilt((12 * Math.PI) / 180);
    setPerspective(true, 26);
    const st = buildSliceStack(200);
    const zoom = 9;
    setView(80, 9, viewDistance(zoom, 390, 26));
    // S nach hinten, dazu ein Looping mit Umkehr in x (dort kippte die Vorschau von Bild zu Bild, Florian 26.10.2026)
    for (const route of [
      [
        [38, 1, 0],
        [52, 5, 0],
        [64, 10, 2],
        [74, 7, 3],
        [86, 13, 4],
        [98, 9, 3],
        [110, 15, 5],
        [122, 12, 4],
      ],
      [
        [38, 1, 0],
        [55, 4, 0],
        [70, 8, 1],
        [80, 14, 2],
        [76, 20, 2],
        [68, 18, 2],
        [70, 12, 2],
        [84, 10, 2],
        [100, 9, 2],
        [118, 6, 1],
      ],
    ] as Array<Array<[number, number, number]>>) {
      const P = route.map((r) => toView(...r));
      const Q = (i: number) => P[Math.max(0, Math.min(P.length - 1, i))];
      const pts: StagePoint[] = [];
      for (let i = 0; i < P.length - 1; i++) {
        const [p0, p1, p2, p3] = [Q(i - 1), Q(i), Q(i + 1), Q(i + 2)];
        for (let k = 0; k < 80; k++) {
          const t = k / 80;
          const f = (a: number, b: number, c: number, d: number) =>
            0.5 *
            (2 * b +
              (-a + c) * t +
              (2 * a - 5 * b + 4 * c - d) * t * t +
              (-a + 3 * b - 3 * c + d) * t * t * t);
          pts.push({
            X: f(p0.X, p1.X, p2.X, p3.X),
            Y: f(p0.Y, p1.Y, p2.Y, p3.Y),
            cx: 80,
            cy: 9,
          });
        }
      }
      const opts = {
        ground: () => 0,
        clearance: 0.8,
        tolerance: 0.9,
        closeSnap: 8,
        holdLane: true,
        holdDepth: 0,
        depthAt: (p: StagePoint) => landingAt(st, p),
        zMax: deepestDock(st),
        groundAt: (p: StagePoint) => groundDepth(st, p),
      };
      const b = new RubberBrush(pts[0], 22 / zoom);
      let pv: BrushPreview | null = null;
      let jump = 0;
      for (let i = 1; i < pts.length; i++) {
        b.move(pts[i]);
        if (i % 6 || b.points.length < 8) continue;
        const next = previewBrushTrack(b.points, opts, pv);
        if (!next) continue;
        // schon 6 m hinter der Spitze darf sich die gezeigte Bahn kaum noch bewegen
        if (pv)
          for (let k = 0; k < Math.min(next.z.length, pv.z.length) - 6; k++)
            jump = Math.max(jump, Math.abs(next.z[k] - pv.z[k]) / LANE_DEPTH);
        pv = next;
      }
    expect(jump).toBeLessThan(0.2);
      const plan = planBrushTrack(b.finish(), opts, undefined, pv)!;
      const before = Float64Array.from(plan.z);
      const flat = new Terrain({
        width: 400,
        terrain: [{ kind: "flat" }],
      } as never);
      const ref = new BrushRefiner(
        plan,
        opts,
        (path, samples) =>
          new TrainSim(samples, path, {
            cars: 3,
            carLength: 2.4,
            skin: "skinWood",
            frictionScale: 1,
            gravityScale: 1,
            startType: "chainlift",
            coins: [],
            terrain: flat,
            allowTunnels: true,
            lateralLimit: Infinity,
            checkCrossings: false,
            depthPerspective: 70,
          }),
        4,
      );
      while (!ref.run(1000));
      let shift = 0;
      for (let i = 0; i < before.length; i++)
        shift = Math.max(
          shift,
          Math.abs(ref.plan.z[i] - before[i]) / LANE_DEPTH,
        );
      expect(shift).toBeLessThan(0.05);
    }
  });

  it("Schlangenlinien hinten (3°, 12°, 26°): Kehren werden Steilkurven, nie kopfüber; ein gezeichnetes Looping schon", () => {
    // Florian 26.10.2026: „überkopffahrten, die kein Wagen schafft, wenn ich hinten Schlangenlinien fahre"
    setPerspective(true, 26);
    const st = buildSliceStack(200);
    const zoom = 9;
    const opts = {
      ground: () => 0,
      clearance: 0.8,
      tolerance: 0.9,
      closeSnap: 8,
      holdLane: true,
      holdDepth: 0,
      depthAt: (p: StagePoint) => landingAt(st, p),
      zMax: deepestDock(st),
      groundAt: (p: StagePoint) => groundDepth(st, p),
    };
    /** zeichnen wie der Finger (Vorschau alle 6 Punkte), loslassen; schlechtestes „oben" der Wagen */
    const draw = (pts: StagePoint[]) => {
      const b = new RubberBrush(pts[0], 22 / zoom);
      let pv: BrushPreview | null = null;
      for (let i = 1; i < pts.length; i++) {
        b.move(pts[i]);
        if (i % 6 || b.points.length < 8) continue;
        pv = previewBrushTrack(b.points, opts, pv) ?? pv;
      }
      const plan = planBrushTrack(b.finish(), opts, undefined, pv)!;
      const s = sampleTrack(plan.path, 0.25);
      return { plan, up: Math.min(...Array.from(s.upy)) };
    };
    const routes: Array<Array<[number, number, number]>> = [
      // U nach unten, schmal und hoch
      [[38, 1, 0], [60, 10, 1], [90, 16, 2], [105, 16, 2], [108, 10, 2], [105, 4, 2], [85, 4, 2], [65, 3, 2]],
      // U nach oben
      [[38, 1, 0], [55, 4, 1], [71.3, 8.4, 1], [81.3, 10.4, 1], [87.2, 11.1, 1], [90.6, 14.1, 1], [87.2, 17.8, 1], [78.3, 18.5, 1], [58.3, 17.5, 0]],
      // enge Serpentine und Doppel-Serpentine (die letzte Kehre ist eine Spitze)
      [[38, 1, 0], [60, 8, 1], [80, 14, 2], [86, 13, 2], [84, 10, 2], [76, 9, 2], [74, 6, 2], [82, 4, 2], [110, 4, 1], [130, 6, 1]],
      [[38, 1, 0], [60, 10, 1], [85, 18, 2], [92, 16, 2], [88, 13, 2], [70, 12, 2], [66, 9, 2], [72, 7, 2], [90, 6, 2], [96, 4, 2], [90, 2, 2], [70, 1.5, 1]],
    ];
    for (const tilt of [3, 12, 26]) {
      setCameraTilt((tilt * Math.PI) / 180);
      setView(85, 10, viewDistance(zoom, 390, 26));
      for (const route of routes) {
        const P = route.map((r) => toView(...r));
        const Q = (i: number) => P[Math.max(0, Math.min(P.length - 1, i))];
        const pts: StagePoint[] = [];
        for (let i = 0; i < P.length - 1; i++) {
          const [p0, p1, p2, p3] = [Q(i - 1), Q(i), Q(i + 1), Q(i + 2)];
          const m = Math.max(2, Math.ceil(Math.hypot(p2.X - p1.X, p2.Y - p1.Y) / 0.15));
          for (let k = 0; k < m; k++) {
            const t = k / m;
            const f = (a: number, b: number, c: number, d: number) =>
              0.5 *
              (2 * b +
                (-a + c) * t +
                (2 * a - 5 * b + 4 * c - d) * t * t +
                (-a + 3 * b - 3 * c + d) * t * t * t);
            pts.push({ X: f(p0.X, p1.X, p2.X, p3.X), Y: f(p0.Y, p1.Y, p2.Y, p3.Y), cx: 85, cy: 10 });
          }
        }
        const { plan, up } = draw(pts);
        expect(plan.elements.loops.some((l) => l.vertical)).toBe(false);
        // Schräglage unter 90°: das Oben der Wagen zeigt nie nach unten
        expect(up, `${tilt}°, Strecke ${routes.indexOf(route) + 1}`).toBeGreaterThan(0);
      }
    }
    // Looping wie in den Pinsel-Tests (x = x0 + 1,5·t + 5·sin t, Höhe 8·(1 − cos t)): bleibt ein Looping, über Kopf
    setCameraTilt((12 * Math.PI) / 180);
    setView(80, 10, viewDistance(zoom, 390, 26));
    const s0 = toView(38, 1, 0);
    const pts: StagePoint[] = [];
    for (let x = s0.X; x < 66; x += 0.15) pts.push({ X: x, Y: s0.Y + Math.min(1, (x - s0.X) / 10) * 1.5, cx: 80, cy: 10 });
    const y0 = pts[pts.length - 1].Y;
    for (let t = 0.02; t <= 2 * Math.PI; t += 0.01)
      pts.push({ X: 66 + 1.5 * t + 5 * Math.sin(t), Y: y0 + 8 * (1 - Math.cos(t)), cx: 80, cy: 10 });
    for (let x = 66 + 3 * Math.PI; x < 110; x += 0.15) pts.push({ X: x, Y: y0, cx: 80, cy: 10 });
    const loop = draw(pts);
    expect(loop.plan.elements.loops.some((l) => l.vertical)).toBe(true);
    expect(loop.up).toBeLessThan(-0.9);
  }, 120_000);

  it("der erzeugte Stapel: über 30 Scheiben, Bögen schneiden drei Scheiben, Ferne ohne Punkte", () => {
    const st = buildSliceStack(200);
    expect(st.slices.length).toBeGreaterThanOrEqual(30);
    for (let k = 1; k < st.slices.length; k++)
      expect(st.slices[k].lane).toBeGreaterThanOrEqual(st.slices[k - 1].lane);
    expect(
      st.slices.filter((s) => s.role === "cave").length,
    ).toBeGreaterThanOrEqual(3);
    for (const s of st.slices.filter((q) => q.role === "far"))
      expect(s.dot).toBe(0);
    for (const s of st.slices)
      for (let i = 0; i < s.top.length; i++)
        expect(s.low[i]).toBeLessThanOrEqual(s.top[i]);
    expect(Number.isNaN(edgeAt(st.slices[0], st.slices[0].top, -1000))).toBe(
      true,
    );
  });
});
