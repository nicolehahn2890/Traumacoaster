/**
 * Pinsel-Bahn („intelligente Bahn“): Die gemalte Linie ist die Bahn, so wie man sie in der festen Ansicht sieht.
 * Die Ansicht zeigt Tiefe nur als Versatz nach oben (Bildhöhe Y = Höhe + Tiefe · LANE_RISE / LANE_DEPTH, ohne
 * Verkleinerung nach hinten). Was das Bild nicht festlegt, wählt die Bahn selbst:
 *  - Tiefe je Stelle (planBrushTrack): Lange Wellen der Bildhöhe werden Tiefe, kurze werden Höhe über dem Boden
 *    (Wunschhöhe). Nie unter dem Boden, nie aus der Bühne, wo Stränge sich kreuzen oder nahekommen so weit getrennt,
 *    dass der Zug durchpasst (später Gezeichnetes liegt vorne), Fliehkräfte über die Tiefe weicher (je schneller der
 *    Zug dort, desto stärker).
 *  - Probefahrten (BrushRefiner): An der ersten Problemstelle bessert die Bahn nach (Fliehkraft weicher, Höhe halten
 *    statt kopfüber, Kuppe nach hinten, Linie innerhalb einer kleinen Toleranz runder). Was dann noch scheitert, liegt
 *    am Strich und bleibt so: Das ist das Spiel.
 */
import type { Vec3 } from '@/core/math3';
import { findCrossings } from './crossings';
import { createNode, emptyPath, sampleTrack, type TrackPath, type TrackSamples } from './model';
import { reduceNodes } from './reduceNodes';
import { previewNodes } from './strokeToTrack';
import type { FreeLanes } from '@/zone/field';
// C: Bildhöhe je Meter Tiefe (tan der Kameraneigung, folgt dem Kamerawinkel-Test)
import { LANE_DEPTH, LANE_MAX, LANE_MIN, TILT_TAN as C, fillRays, mixPoint, rayToWorld, tagRay, toView, type StagePoint } from './stage';

/** Tiefenbereich der Bühne (Meter); der Ebenen-Test darf hinten weiter (BrushOptions.zMax) */
const STAGE_Z_MIN = LANE_MIN * LANE_DEPTH;
const STAGE_Z_MAX = LANE_MAX * LANE_DEPTH;
/** Abstand der Linienpunkte (Bühnen-Meter) */
const STEP = 1;
/** Wunschhöhe über dem Boden, wo die Tiefe frei ist */
const H_COMFORT = 4;
/** Bildhöhen-Wellen, die länger sind, werden Tiefe; kürzere werden Höhe (Glättung zweiter Ordnung) */
const CUTOFF = 40;
const LAMBDA = (CUTOFF / (2 * Math.PI)) ** 4;
/** Gewicht der Fliehkraft (Tempo² · Krümmung) bei der Tiefenwahl */
const KAPPA = 4;
/**
 * Kreuzungsregel der Fahrt: Kommen sich zwei Bahnstellen in der Draufsicht näher als 1 m, muss eine 3,2 m über der
 * anderen liegen. Die Tiefe hält sie mit Spiel ein (Linienpunkte liegen 1 m auseinander, die Knoten weichen etwas
 * ab): seitlich mindestens PASS_SIDE auseinander oder in der Höhe mindestens PASS_OVER.
 */
const PASS_SIDE = 2.2;
const PASS_OVER = 3.5;
/** so viele Linienpunkte (je 1 m) auseinander sind zwei Stellen keine Nachbarn mehr (wie in der Fahrt) */
const NEIGHBOR = 8;
/** Paare, die auf beiden Strängen höchstens so weit (Linienpunkte) auseinanderliegen, bilden eine Engstelle */
const CLUSTER = 12;
/** zu nahe Paare in einer Engstelle, an der schon ein Paar festgehalten wird, kommen erst ab dieser Verletzung dazu */
const NEAR_TOL = 0.1;
/** höchstens so viele festgehaltene Paare je Engstelle */
const CLUSTER_MAX = 8;
/** bleibt ein festgehaltenes Paar um so viel (m) zu nah, kämpft es gegen andere Schranken: Engstelle aufgeben */
const GIVE_UP = 0.5;
/** Knoten-Toleranz (m) an Stellen, die einer anderen Stelle nahekommen (sonst bis 1,2 m auf Geraden) */
const TIGHT_TOL = 0.12;
/**
 * Einrastende Tiefen: Liegt die Bahn höchstens SNAP_RANGE vor oder hinter einer der fünf Bodenlinien (Spuren), zieht
 * sie dorthin (Gewicht bis SNAP_W, quadratisch nach innen), aber nur, wo flach und gerade gezeichnet ist (steil ist
 * Höhe, in Kringeln und Bögen entscheidet die Fahrt) und nicht an der Station. So liegt sie in der Draufsicht auf
 * Spuren; dazwischen wechselt sie weich. Das Bild ändert das nicht (Höhe und Tiefe zusammen bleiben die Linie).
 */
const SNAP_W = 2;
const SNAP_RANGE = 3;
/**
 * Elemente im Strich (findElements): Eine umlaufende Schleife, die mindestens LOOP_ASPECT mal so hoch wie breit ist
 * und nach oben geht, wird ein senkrechter Looping; flachere bleiben Bodenschleifen (die Tiefe darf sie in die Fläche
 * legen). Ein Hügel (mindestens HILL_RISE über beiden Füßen, ohne Umkehr in x, höchstens HILL_WIDE breit) bleibt
 * gerade. Beide werden zur Rampe: Die Wunschtiefe läuft gerade von der Tiefe am einen Fuß zu der am anderen (statt
 * mit der Bildhöhe nach hinten), die Tiefe ist steifer und die Fliehkraft biegt sie kaum. Der Lifthügel an der Station
 * und ein Anstieg am Ende der Linie bleiben ganz auf der Tiefe ihres ersten Fußes.
 */
const LOOP_ASPECT = 0.9;
const LOOP_TURN = (200 * Math.PI) / 180;
const HILL_RISE = 5;
const HILL_WIDE = 140;
/** Steifigkeit der Tiefe (Vielfaches der Glättung) in einem Looping und in einem Hügel */
const LOOP_FLAT = 30;
const HILL_FLAT = 6;
const G = 9.81;
const PIN_W = 1e4;
/** so weit (m) um die Station bleibt die Bahn in deren Tiefe; danach wird die Wunschhöhe über STATION_RAMP m eingeblendet */
const STATION_CALM = 12;
const STATION_RAMP = 20;
/** Steilheit des Strichs (Bild), ab der die Wunschhöhe nachlässt bzw. kaum noch zieht */
const STEEP_FROM = (15 * Math.PI) / 180;
const STEEP_TO = (40 * Math.PI) / 180;
const STEEP_WH = 0.03;
/** Gewicht, mit dem die Tiefe an der Station festgehalten wird */
const CALM_WH = 50;
/**
 * Wenden (die Bildrichtung x kehrt um, außer in Loopings): Am Scheitel steht die Linie auf dem Bild senkrecht. Liefe
 * die Bahn dort in der Höhe, stünde sie senkrecht und kippte kopfüber; dort fährt sie flach durch die Tiefe (die Höhe
 * bleibt, die Tiefe nimmt die Bildbewegung). Gewicht dafür und wie weit (m) vor und nach einer Stelle die Richtung
 * gesucht wird, aus der sie kommt und in die sie geht.
 */
const TURN_LEVEL_W = 1500;
const TURN_SPAN = 12;

export interface BrushOptions {
  /** Bodenhöhe (Welt) an x und Tiefe z (Spuren) */
  ground?: (x: number, z: number) => number;
  /** Mindesthöhe über dem Boden */
  clearance?: number;
  /** endet die Linie so nah an ihrem Anfang (Bühnen-Meter), schließt sich die Runde (wenn das unauffällig geht) */
  closeSnap?: number;
  /**
   * Rundenschluss auf Wunsch (Tipp auf die Station): so weit darf das Ende dann von der Station weg sein, und der
   * Schluss darf auch eine kleine Schlaufe drehen
   */
  closeReach?: number;
  /** so weit (Bühnen-Meter) darf die Linie beim Nachbessern nachgeben */
  tolerance?: number;
  /**
   * Freiraumfeld (Tor 2b; Plan Paket 5): freie Tiefen-Abschnitte am Strahl eines Bühnenpunkts und fester Weltpunkt. Ohne
   * Feld gilt nur der Boden (ground) wie in den Levels
   */
  field?: BrushField;
  /** intern: nach dem Abschneiden vor dem Fels nicht noch einmal schneiden */
  noCut?: boolean;
  /** Fang (Etappe 2, Schritt 6): das Ende der offenen Linie gleitet auf diesen Bühnenpunkt und hält dort diese Spur (Baustelle) */
  endSnap?: { X: number; Y: number; lane: number };
  /**
   * Pinsel „Spur halten“ (Kamerawinkel-Test, für flache Kamera): Die Bildhöhe ist nur Höhe, die Wunschtiefe überall die
   * Tiefe, an der der Strich ansetzt. Kreuzungen, Wenden, Loopings, Höhlen und Wände ändern die Tiefe weiter wie sonst.
   */
  holdLane?: boolean;
  /** Tiefe (Meter), die „Spur halten“ hält: beim Fortsetzen das Ende der alten Bahn; ohne Angabe die Spur unter dem Anfang */
  holdDepth?: number;
  /**
   * Ebenen-Test („Tiefe aus Ebenen“, mit holdLane): Wunschtiefe (Meter) am Bildpunkt aus dem Scheibenstapel, null in der
   * Luft (dort hält die Bahn die zuletzt gelesene Tiefe). Kehren beulen dann nach vorne aus, statt die Spur zu wechseln.
   */
  depthAt?: (p: StagePoint) => number | Landing | null;
  /** Ebenen-Test: tiefste erlaubte Tiefe (Meter), wenn der Scheibenstapel weiter nach hinten reicht als die Bühne */
  zMax?: number;
  /**
   * Ebenen-Test, Mischung („Ebenen: Bodenhöhe“, mit depthAt): Wunschtiefe (Meter) wie beim Bildhöhen-Pinsel, mit den
   * Scheibenkanten als Boden. Lange Wellen werden Tiefe, kurze und Hügel Höhe; Landungen und Höhlen (depthAt) gehen vor
   */
  groundAt?: (p: StagePoint) => number;
  /**
   * Kettenlinie als Deckel (Strich 2, Paket 3): Welthöhe der Kettenzugstärke über der Station; die Bahn liegt nirgends
   * höher, was im Bild darüber liegt, wird Tiefe
   */
  chainTop?: number;
}

/** Ebenen-Test: Landung eines Strichpunkts auf einer Scheibe (Tiefe in Metern, Kennung der Scheibe, Höhe über ihrer Kante) */
export interface Landing {
  z: number;
  id: number;
  off: number;
  /** in einer Höhlenöffnung (zählt sofort, ohne Mindestlänge) */
  cave?: boolean;
}

/** Sicht des Pinsels auf das Freiraumfeld (`src/zone/field.ts`): nur diese zwei Abfragen braucht er */
export interface BrushField {
  /** freie Tiefen-Abschnitte am Strahl des Bühnenpunkts (Spuren) */
  free: (p: StagePoint) => FreeLanes;
  /** fester Weltpunkt (x, Höhe, Spur): dort steckt die Bahn in der Erde und wird angehoben */
  solid: (x: number, y: number, lane: number) => boolean;
  /** tragende Fläche unter dem Punkt (Höhe), null im Leeren: darüber hält die Bahn ihre Mindesthöhe */
  floor: (x: number, y: number, lane: number) => number | null;
}

/** Abstand der Wunschtiefe von einer Wand des Freiraumfelds (Meter) */
const FIELD_GAP = 0.15 * LANE_DEPTH;
/**
 * Reichweite des Magneten einer Höhle (Spuren): liegt die Wunschtiefe so nah an einer Höhle, in die der Strich hinein
 * gemalt ist, zählt sie als in ihr (Öffnungen und Räume ziehen an); weiter weg zieht nichts
 */
const CAVE_PULL = 0.35;
/**
 * Gewicht der Wunschtiefe in einer Höhle (Vielfaches des Höhengewichts): die Mitte ist dort der einzige sinnvolle Wunsch,
 * und sie muss gegen Glättung und gezeigte Tiefe ankommen, sonst klebt die Bahn an der Wand, an der sie hereinkam
 */
const NOREAD_W = 4;
/** Fliehkraft-Kopplung der Tiefe in einer Höhle (Anteil) */
const CAVE_K = 0.1;
/** Ein- und Ausfahrt einer Höhle: über so viele Punkte wandert die Wunschtiefe zwischen Lesung und Höhlenmitte */
const CAVE_RAMP = 6;
/** Anteil, mit dem die gezeigte Tiefe in einer Höhle gehalten wird (Vorschau und Loslassen) */
const CAVE_HOLD = 0.1;
/** Anlauf: was eine Wand an der Wunschtiefe ändert, klingt rückwärts je Meter mit diesem Faktor ab (Halbwert rund 8 m) */
const RAMP_DECAY = 0.92;
/**
 * so weit (Meter) bleibt die harte Schranke von der abgetasteten Wand weg: knapp, damit die Bahn schräg auf eine
 * Öffnung zulaufen kann; den Abstand im Normalfall hält FIELD_GAP weich
 */
const CHAIN_MARGIN = 0.25;
/** „Spur halten“: eine Kehre wechselt höchstens so viele Spuren (zwei: Halbkreis mit 8,4 m Radius, wie die Kehren der Bühne) */
const HOLD_TURN = 2;
/** „Spur halten“: Anteil der Tiefen-Glättung in einer Kehre */
const HOLD_SOFT = 0.02;
/** Ebenen-Test: so weit (m) gleitet die Bahn nach einer Kehre zur gelesenen Tiefe zurück */
const HOLD_RETURN = 25;
/** Ebenen-Test: eine Kehre geht mindestens so viel tiefer, wie ihr U hoch ist (mal diesem Faktor), höchstens SLICE_TURN_MAX Spuren */
const KEHRE_RISE = 1.2;
/** Ebenen-Test: am Scheitel einer Kehre läuft die Tiefe so viel schneller als der Strich im Bild auf und ab */
const KEHRE_APEX = 1.3;
/** Ebenen-Test, Wächter: Gewicht der festgelegten Tiefen-Neigung an steilen Stellen einer Kehre, die sonst kopfüber führe */
const KEHRE_GUARD_W = 1e4;
const SLICE_TURN_MAX = 3;
/** Ebenen-Test: Zieltiefe über ±SLICE_BLUR Linienpunkte gemittelt (die Kanten der Scheiben liefern Stufen) */
const SLICE_BLUR = 4;
/** Ebenen-Test: so viel (m) darf sich die Zieltiefe je Meter Linie höchstens ändern, vom Anfang zur Spitze hin */
const SLICE_RATE = 0.5;
/** Ebenen-Test, Live-Vorschau: ab so weit hinter der Spitze hält die gezeigte Tiefe, ab SLICE_PREVIEW_FREE ist sie fest */
const SLICE_PREVIEW_TIP = 4;
const SLICE_PREVIEW_FREE = 10;
/** Ebenen-Test: über so viele Linienpunkte gleitet die Steifigkeit der Tiefe zwischen weich (Kehre, Landung) und normal */
const SOFT_TAPER = 6;

/**
 * Ebenen-Test: Ein Looping legt sich als Ganzes. Die Vorschau hält im Ebenen-Modus schon wenige Meter hinter der Spitze
 * fest; schließt sich dann ein Looping oder kreuzt die Linie sich selbst, wäre der Bereich schon festgelegt und die Bahn
 * knickte. Er hängt deshalb nicht an der früheren Vorschau, die alte Bahn (keepLen) bleibt fest.
 */
function freeLoops(elements: BrushElements, n: number, fixed: Float64Array | null, holdW: Float64Array | null, keepLen: number, known: LineCrossing[] = []): void {
  for (const l of elements.loops) {
    // nur, wenn die Schleife neu ist: danach hält die gezeigte Lösung (an einer Kreuzung gibt es zwei, davor oder dahinter
    // und höher, und frei kippte die Vorschau von Bild zu Bild zwischen ihnen)
    if (known.some((c) => Math.abs(c.i - l.i) <= 3 && Math.abs(c.j - l.j) <= 3)) continue;
    // Looping ganz; Bodenschleife (Kreuzung): der spätere Strang um die Kreuzung, damit er in der Tiefe weich vorbeikommt
    // (dort hält die gezeigte Tiefe weich weiter, sonst kippt die Seite von Bild zu Bild)
    const from = l.vertical ? l.i - 6 : l.j - 12;
    for (let k = Math.max(keepLen, from); k <= Math.min(n - 1, l.j + 6); k++) {
      if (fixed) fixed[k] = NaN;
      if (holdW) holdW[k] = l.vertical ? 0 : Math.min(holdW[k], PREVIEW_HOLD);
    }
  }
}
/** Ebenen-Test, Live-Vorschau: so viel stärker hält die gezeigte Tiefe (ein später erkannter Looping reißt sonst mit) */
const SLICE_HOLD = 8;

/**
 * Ebenen-Test: Zieltiefe beruhigen. Die Kanten der Scheiben und das Landen liefern Stufen; gemittelt und in der Änderung
 * je Meter begrenzt (von der Station zur Spitze, also wie gezeichnet: die Spitze setzt fort, was schon steht) gibt es
 * keine Zacken, die die Glättung als Schrauben und viele Knoten in die Bahn trüge. Höhlenpunkte bleiben scharf.
 */
function calmSlices(t: Float64Array, keep: Uint8Array): void {
  const n = t.length;
  const src = Float64Array.from(t);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, i - SLICE_BLUR); k <= Math.min(n - 1, i + SLICE_BLUR); k++) {
      sum += src[k];
      cnt++;
    }
    t[i] = sum / cnt;
  }
  for (let i = 1; i < n; i++) {
    const d = t[i] - t[i - 1];
    if (Math.abs(d) > SLICE_RATE * STEP && !keep[i]) t[i] = t[i - 1] + Math.sign(d) * SLICE_RATE * STEP;
  }
}
/**
 * Ebenen-Test: Die Wunschtiefe kommt aus gemalten Scheiben und springt an ihren Kanten; die Bahn soll Bögen und Terrassen
 * treffen, die nur 10–20 m breit sind. Darum kürzere Glättung (Grenzwellenlänge rund 40 · 0,08^¼ ≈ 21 m) und doppeltes
 * Gewicht der Wunschtiefe
 */
const SLICE_SMOOTH = 0.08;
const SLICE_W = 2;
/** Ebenen-Test: steiler als das (Bildhöhe je Bildbreite, rund 14°) landet der Strich nicht, er ist Höhe */
const LAND_SLOPE = 0.25;
/** Ebenen-Test: so lang (m) muss der Strich am Stück flach auf Scheiben liegen, damit er dort landet */
const LAND_RUN = 10;
/** Ebenen-Test: so weit (m) darf der Abstand zur Kante schwanken, während der Strich an ihr entlangläuft */
const CONTOUR_TOL = 1.5;
/** „Spur halten“, neuer Strich: unter dieser Bildhöhe je Meter Tiefe (tan, rund 14°) liegen die Bodenlinien zu dicht zum Wählen */
const HOLD_PICK_TAN = 0.25;

interface Opts {
  ground: (x: number, z: number) => number;
  clearance: number;
  closeSnap: number;
  closeReach: number;
  tolerance: number;
  field: BrushField | null;
  noCut: boolean;
  endSnap: { X: number; Y: number; lane: number } | null;
  holdLane: boolean;
  holdDepth: number;
  depthAt: ((p: StagePoint) => number | Landing | null) | null;
  zMax: number;
  groundAt: ((p: StagePoint) => number) | null;
}

const withDefaults = (o: BrushOptions): Opts => ({
  ground: o.ground ?? (() => 0),
  clearance: o.clearance ?? 0.8,
  closeSnap: o.closeSnap ?? 8,
  closeReach: o.closeReach ?? 0,
  tolerance: o.tolerance ?? 1,
  field: o.field ?? null,
  noCut: !!o.noCut,
  endSnap: o.endSnap ?? null,
  holdLane: !!o.holdLane,
  holdDepth: o.holdDepth ?? NaN,
  depthAt: o.depthAt ?? null,
  zMax: o.zMax ?? STAGE_Z_MAX,
  groundAt: o.groundAt ?? null,
});

/** Haken für Messwerkzeuge (Replay): wird gerufen, wenn die Bahn vor blockierten Punkten abgeschnitten wird */
export const brushDebug: { onCut: ((info: { line: StagePoint[]; z: Float64Array; rock: Array<[number, number]> }) => void) | null; onSolve: ((info: { line: StagePoint[]; z: Float64Array; target: Float64Array; low: Float64Array; upper: Float64Array; noRead: Uint8Array; wH: Float64Array; read: Float64Array }) => void) | null } = { onCut: null, onSolve: null };

export interface LineCrossing {
  /** früherer und späterer Strichpunkt an der Kreuzung */
  i: number;
  j: number;
  /** liegt der später gezeichnete Strang vorne? */
  laterFront?: boolean;
  /**
   * Der spätere Strang ist der Rundenschluss (nicht gezeichnet): Statt „später vorne“ gilt die Seite, auf der er von
   * selbst läge (die Tiefe der Station); sonst müsste er vor der Station die Seite wechseln.
   */
  natural?: boolean;
}

export interface BrushPlan {
  /** Linie, wie gezeichnet (Bühne, 1 m Abstand) */
  drawn: StagePoint[];
  /** Linie der Bahn (nach dem Nachbessern höchstens tolerance von drawn entfernt) */
  line: StagePoint[];
  closed: boolean;
  crossings: LineCrossing[];
  /** Tiefe je Linienpunkt (Meter, vorne negativ) */
  z: Float64Array;
  /** Bahnpunkte in der Welt (x, Höhe, Tiefe in Metern), je Linienpunkt */
  pts: Vec3[];
  path: TrackPath;
  /** Steuergrößen der Tiefenwahl, die das Nachbessern verändert: Gewicht der Wunschhöhe, Faktor auf die
   *  Fliehkraft, untere Schranke der Tiefe (Kuppe nach hinten) */
  wH: Float64Array;
  wMul: Float64Array;
  lower: Float64Array;
  /** 1 an der Station (Tiefe bleibt die der Station), 0 auf freier Strecke */
  calm: Float64Array;
  /** am Scheitel einer Wende bis 1: Dort bleibt die Höhe flach (TURN_LEVEL_W), die Tiefe nimmt die Bildbewegung */
  level: Float64Array;
  /** Tiefe, die bleibt (NaN = frei): beim Fortsetzen die alte Bahn */
  fixed: Float64Array | null;
  /** Tiefe, an der die Bahn weich hängt (NaN = keine), und wie stark: die zuletzt gezeigte Live-Vorschau */
  hold: Float64Array | null;
  holdW: Float64Array | null;
  /** Steifigkeit der Tiefe je Linienpunkt (Vielfaches der Glättung): in Loopings und Hügeln höher */
  flat: Float64Array;
  /** Loopings und Hügel im Strich, und wo die Wunschtiefe deshalb gerade läuft */
  elements: BrushElements;
  ramps: Ramp[];
  /** blockiert: Läufe von Linienpunkten (von, bis) ohne freie Tiefe im Freiraumfeld (Etappe 2, Schritt 5) */
  rock: Array<[number, number]>;
  /** die Linie wurde vor dem Fels abgeschnitten (die Bahn endet davor) */
  rockCut: boolean;
  /** Ebenen-Test: Kehren und die Richtung ihrer Tiefe (bleibt beim Loslassen und Nachbessern wie in der Vorschau) */
  kehren: KehreSide[];
}

/** Ebenen-Test: eine Kehre (Linienpunkte von, bis) und die Richtung ihrer Tiefe (+1 nach hinten, −1 nach vorne, 0 offen) */
export interface KehreSide {
  a: number;
  b: number;
  dir: number;
}

export interface BrushElements {
  /** Schleifen: Linienpunkte der Kreuzung (Einfahrt i, Ausfahrt j); senkrecht = Looping, sonst Bodenschleife */
  loops: Array<{ i: number; j: number; vertical: boolean }>;
  /** Hügel: Fuß links, Kuppe, Fuß rechts (Linienpunkte); open: Die Linie endet im Anstieg */
  hills: Array<{ a: number; top: number; b: number; open: boolean }>;
}

/** Bereich, in dem die Wunschtiefe gerade von der Tiefe bei a zu der bei b läuft (keep: bleibt auf der bei a) */
interface Ramp {
  /** Hügel (sonst Looping) */
  hill: boolean;
  /** Kuppe eines Hügels (Linienpunkt) */
  top?: number;
  a: number;
  b: number;
  keep: boolean;
}

// ------------------------------------------------------------------ Linie

function resampleLine(pts: StagePoint[], step: number): StagePoint[] {
  const out: StagePoint[] = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.X - a.X, b.Y - a.Y);
    if (d < 1e-9) continue;
    let t = step - carry;
    while (t <= d) {
      out.push(mixPoint(a, b, t / d));
      t += step;
    }
    carry = d - (t - step);
  }
  const last = pts[pts.length - 1];
  const o = out[out.length - 1];
  if (Math.hypot(o.X - last.X, o.Y - last.Y) > step * 0.3) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

/** Gauß-Glättung entlang gleichmäßig abgetasteter Punkte, Enden bleiben fest */
function smoothLine(pts: StagePoint[], sigma: number, step: number): StagePoint[] {
  const r = Math.ceil((3 * sigma) / step);
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    let scx = 0;
    let scy = 0;
    let sc = 0;
    for (let k = -r; k <= r; k++) {
      const q = pts[Math.max(0, Math.min(pts.length - 1, i + k))];
      const w = Math.exp(-((k * step) ** 2) / (2 * sigma * sigma));
      sx += q.X * w;
      sy += q.Y * w;
      sw += w;
      if (q.cx !== undefined && q.cy !== undefined) {
        scx += q.cx * w;
        scy += q.cy * w;
        sc += w;
      }
    }
    const out: StagePoint = { X: sx / sw, Y: sy / sw };
    if (sc > 0) {
      out.cx = scx / sc;
      out.cy = scy / sc;
    }
    return out;
  });
}

/** Linienlänge (Bühnen-Meter) */
export function lineLength(pts: StagePoint[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y);
  return l;
}

/**
 * Gemalte Pinsellinie aufbereiten: gleichmäßig abtasten, Fingerknicke wegglätten, auf 1 m Abstand bringen. Endet sie
 * nah an ihrem Anfang, wird die Runde weich geschlossen (closeReach > 0: auf Wunsch, dann auch mit kleiner Schlaufe).
 */
export function prepareBrushLine(points: StagePoint[], closeSnap = 8, closeReach = 0): { line: StagePoint[]; closed: boolean; closeFrom?: number } | null {
  if (points.length < 2 || lineLength(points) < 6) return null;
  const line = resampleLine(smoothLine(resampleLine(points, 0.25), 0.5, 0.25), STEP);
  fillRays(line);
  if (line.length < 7) return null;
  const a = line[0];
  const b = line[line.length - 1];
  const gap = Math.hypot(b.X - a.X, b.Y - a.Y);
  if (gap > Math.max(closeSnap, closeReach) || lineLength(line) < 40) return { line, closed: false };
  const ring = closeBrushLine(line, closeReach > 0);
  if (ring) fillRays(ring.line);
  return ring ? { line: ring.line, closed: true, closeFrom: ring.from } : { line, closed: false };
}

/** Rundenschluss: so lang läuft die Bahn vor der Station gerade in deren Richtung ein (Bühnen-Meter; kürzer, wenn
 * der Strich schon fast richtig ankommt) */
const CLOSE_ENTRIES = [3, 1.5];
/** Bogenradien eines neuen Schlusswegs auf dem Bild (Bühnen-Meter); unter 6 m wird eine Drehung teurer */
const CLOSE_RADII = [4, 6, 10, 16];
/** so weit darf der Rundenschluss vom Strichende zurückgreifen (Meter Linie, höchstens 30 % der Linie) */
const CLOSE_BACK = 40;
/** über so lange Stücke (Meter Linie) kann das Strichende in die Station gebogen werden */
const CLOSE_BEND = [6, 10, 15, 22, 30];
/** Grenze gegen ausufernde Schlüsse: so weit (Bühnen-Meter) darf er sich vom Strichende und der Lücke entfernen */
const CLOSE_AWAY = 10;
/** so weit (Grad) darf ein neuer Schlussweg drehen: von selbst höchstens eine Wende, auf Tipp auch eine Schlaufe */
const CLOSE_TURN = 240;
const CLOSE_TURN_TAP = 300;
/**
 * Liegt das Strichende auf dem Bild tiefer als die Station, liegt es weiter vorne (unter die Bodenlinie kann die Bahn
 * nicht): Auf dem Anstieg zur Station wechselt sie die Tiefe. Damit das kein Haken wird, braucht der Anstieg Länge,
 * etwa eine S-Kurve mit diesem Radius (Meter) über den doppelten Höhenunterschied.
 */
const CLOSE_DEPTH_R = 12;

type Pose = { X: number; Y: number; th: number };

const mod2pi = (a: number): number => a - 2 * Math.PI * Math.floor(a / (2 * Math.PI));
const wrapPi = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Krümmung (1/m, Linksbogen positiv) durch drei Punkte */
function curvature(p: StagePoint, q: StagePoint, r: StagePoint): number {
  const den = Math.hypot(q.X - p.X, q.Y - p.Y) * Math.hypot(r.X - q.X, r.Y - q.Y) * Math.hypot(r.X - p.X, r.Y - p.Y);
  return den > 1e-12 ? (2 * ((q.X - p.X) * (r.Y - q.Y) - (q.Y - p.Y) * (r.X - q.X))) / den : 0;
}

/**
 * Dubins-Wege von a nach b auf dem Bild: Bögen mit Radius R und Geraden, kürzeste Verbindung zweier Richtungen bei
 * begrenzter Krümmung (sechs Arten, auch mit Wende). Je gültiger Art die Punkte im Abstand step (ohne a, mit b).
 */
export function dubinsPaths(a: Pose, b: Pose, R: number, step: number): StagePoint[][] {
  const dx = (b.X - a.X) / R;
  const dy = (b.Y - a.Y) / R;
  const d = Math.hypot(dx, dy);
  const theta = mod2pi(Math.atan2(dy, dx));
  const al = mod2pi(a.th - theta);
  const be = mod2pi(b.th - theta);
  const sa = Math.sin(al);
  const sb = Math.sin(be);
  const ca = Math.cos(al);
  const cb = Math.cos(be);
  const cab = Math.cos(al - be);
  const words: Array<[string, number, number, number]> = [];
  let p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
  if (p2 >= 0) {
    const tmp = Math.atan2(cb - ca, d + sa - sb);
    words.push(['LSL', mod2pi(-al + tmp), Math.sqrt(p2), mod2pi(be - tmp)]);
  }
  p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
  if (p2 >= 0) {
    const tmp = Math.atan2(ca - cb, d - sa + sb);
    words.push(['RSR', mod2pi(al - tmp), Math.sqrt(p2), mod2pi(-be + tmp)]);
  }
  p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    words.push(['LSR', mod2pi(-al + tmp), p, mod2pi(-be + tmp)]);
  }
  p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    words.push(['RSL', mod2pi(al - tmp), p, mod2pi(be - tmp)]);
  }
  let c = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
  if (Math.abs(c) <= 1) {
    const p = mod2pi(2 * Math.PI - Math.acos(c));
    const t = mod2pi(al - Math.atan2(ca - cb, d - sa + sb) + p / 2);
    words.push(['RLR', t, p, mod2pi(al - be - t + p)]);
  }
  c = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;
  if (Math.abs(c) <= 1) {
    const p = mod2pi(2 * Math.PI - Math.acos(c));
    const t = mod2pi(-al - Math.atan2(ca - cb, d + sa - sb) + p / 2);
    words.push(['LRL', t, p, mod2pi(be - al - t + p)]);
  }
  const out: StagePoint[][] = [];
  for (const [w, ...params] of words) {
    const pts: StagePoint[] = [];
    let x = a.X;
    let y = a.Y;
    let th = a.th;
    for (let k = 0; k < 3; k++) {
      const len = params[k] * R;
      const m = Math.max(1, Math.ceil(len / step));
      const ds = len / m;
      const turn = w[k] === 'L' ? 1 : w[k] === 'R' ? -1 : 0;
      for (let i = 0; i < m; i++) {
        if (!turn) {
          x += Math.cos(th) * ds;
          y += Math.sin(th) * ds;
        } else {
          const cx = x - turn * R * Math.sin(th);
          const cy = y + turn * R * Math.cos(th);
          th += (turn * ds) / R;
          x = cx + turn * R * Math.sin(th);
          y = cy - turn * R * Math.cos(th);
        }
        pts.push({ X: x, Y: y });
      }
    }
    let dth = th - b.th;
    dth -= Math.round(dth / (2 * Math.PI)) * 2 * Math.PI;
    // nur Wege, die wirklich in b ankommen (die Formeln rechnen in Normlage, das prüft sie)
    if (Math.hypot(x - b.X, y - b.Y) < 0.02 * R && Math.abs(dth) < 0.02) out.push(pts);
  }
  return out;
}

/**
 * Weicher Übergang von a nach b: kubische Kurve mit den Richtungen der Posen und Henkeln h1, h2 (für kleine Versätze
 * auf kurzem Weg, wo Kreisbögen fester Größe nicht hineinpassen). Punkte im Abstand von etwa step (ohne a, mit b) und
 * die größte Krümmung (1/m).
 */
function easePath(a: Pose, b: Pose, h1: number, h2: number, step: number): { pts: StagePoint[]; kMax: number } {
  const p1 = { X: a.X + Math.cos(a.th) * h1, Y: a.Y + Math.sin(a.th) * h1 };
  const p2 = { X: b.X - Math.cos(b.th) * h2, Y: b.Y - Math.sin(b.th) * h2 };
  const m = Math.max(4, Math.ceil((Math.hypot(b.X - a.X, b.Y - a.Y) + h1 + h2) / step));
  const pts: StagePoint[] = [];
  for (let k = 1; k <= m; k++) {
    const t = k / m;
    const u = 1 - t;
    pts.push({
      X: u * u * u * a.X + 3 * u * u * t * p1.X + 3 * u * t * t * p2.X + t * t * t * b.X,
      Y: u * u * u * a.Y + 3 * u * u * t * p1.Y + 3 * u * t * t * p2.Y + t * t * t * b.Y,
    });
  }
  let kMax = 0;
  const all = [{ X: a.X, Y: a.Y }, ...pts];
  for (let k = 1; k < all.length - 1; k++) kMax = Math.max(kMax, Math.abs(curvature(all[k - 1], all[k], all[k + 1])));
  return { pts, kMax };
}

/** Schnitte des Wegs mit den Linienstücken from..to (Bounding-Box zuerst, die Linie hat 1 m Abstand) */
function countCrossings(path: StagePoint[], line: StagePoint[], from: number, to: number): number {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    x0 = Math.min(x0, p.X);
    x1 = Math.max(x1, p.X);
    y0 = Math.min(y0, p.Y);
    y1 = Math.max(y1, p.Y);
  }
  let k = 0;
  for (let i = Math.max(0, from); i < Math.min(line.length - 1, to); i++) {
    const c = line[i];
    const e = line[i + 1];
    if (Math.max(c.X, e.X) < x0 || Math.min(c.X, e.X) > x1 || Math.max(c.Y, e.Y) < y0 || Math.min(c.Y, e.Y) > y1) continue;
    for (let j = 0; j < path.length - 1; j++) {
      const a = path[j];
      const b = path[j + 1];
      const rx = b.X - a.X;
      const ry = b.Y - a.Y;
      const sx = e.X - c.X;
      const sy = e.Y - c.Y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.X - a.X) * sy - (c.Y - a.Y) * sx) / den;
      const u = ((c.X - a.X) * ry - (c.Y - a.Y) * rx) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) k++;
    }
  }
  return k;
}

/** Gesamtdrehung (rad) eines Wegs, der in Pose a beginnt */
function turning(a: Pose, path: StagePoint[]): number {
  let turn = 0;
  let prev = a.th;
  for (let i = 0; i < path.length; i++) {
    const q = i ? path[i - 1] : a;
    const th = Math.atan2(path[i].Y - q.Y, path[i].X - q.X);
    turn += Math.abs(wrapPi(th - prev));
    prev = th;
  }
  return turn;
}

/** größter Abstand eines Wegpunkts vom nächsten Bezugspunkt (Bühnen-Meter) */
function awayFrom(path: StagePoint[], ref: StagePoint[]): number {
  let worst = 0;
  for (const p of path) {
    let d = Infinity;
    for (const q of ref) {
      d = Math.min(d, (p.X - q.X) ** 2 + (p.Y - q.Y) ** 2);
      if (d <= worst) break;
    }
    worst = Math.max(worst, d);
  }
  return Math.sqrt(worst);
}

/**
 * Strichende biegen: line[j..t] so verformen, dass line[t] in goal ankommt, in dessen Richtung. Drehung und
 * Verschiebung wachsen von j aus sanft an (die Krümmung bleibt dort stetig). Punkte ohne line[j], goal als letzter;
 * dazu die Verschiebung (m), die Drehung (rad) und die stärkste zusätzliche Krümmung. null, wenn der Strich dabei
 * gestaucht, gedehnt, deutlich anders gekrümmt oder enger würde als gezeichnet (und als der kleinste Radius).
 */
function bendTail(line: StagePoint[], j: number, t: number, goal: Pose): { pts: StagePoint[]; shift: number; turn: number; addK: number } | null {
  const seg = line.slice(j, t + 1);
  const m = seg.length;
  if (m < 4) return null;
  const len: number[] = [];
  const ang: number[] = [];
  let L = 0;
  for (let i = 1; i < m; i++) {
    len.push(Math.hypot(seg[i].X - seg[i - 1].X, seg[i].Y - seg[i - 1].Y));
    L += len[i - 1];
    const a = Math.atan2(seg[i].Y - seg[i - 1].Y, seg[i].X - seg[i - 1].X);
    ang.push(i > 1 ? ang[i - 2] + wrapPi(a - ang[i - 2]) : a);
  }
  const rot = wrapPi(goal.th - ang[ang.length - 1]);
  const W = (u: number) => u * u * u * (10 + u * (6 * u - 15));
  // Richtungen eindrehen, neu zusammensetzen, die verbleibende Abweichung als Verschiebung verteilen
  const pts: StagePoint[] = [{ ...seg[0] }];
  let s = 0;
  for (let i = 0; i < len.length; i++) {
    const a = ang[i] + W((s + len[i] / 2) / L) * rot;
    pts.push({ X: pts[i].X + Math.cos(a) * len[i], Y: pts[i].Y + Math.sin(a) * len[i] });
    s += len[i];
  }
  const ex = goal.X - pts[m - 1].X;
  const ey = goal.Y - pts[m - 1].Y;
  s = 0;
  for (let i = 1; i < m; i++) {
    s += len[i - 1];
    const w = W(s / L);
    pts[i] = { X: pts[i].X + ex * w, Y: pts[i].Y + ey * w };
  }
  let addK = 0;
  let k0 = 0;
  let k1 = 0;
  for (let i = 1; i < m; i++) {
    const r = Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y) / len[i - 1];
    if (r < 0.6 || r > 1.6) return null;
    if (i === m - 1) break;
    const a = Math.abs(curvature(seg[i - 1], seg[i], seg[i + 1]));
    const b = Math.abs(curvature(pts[i - 1], pts[i], pts[i + 1]));
    addK = Math.max(addK, Math.abs(b - a));
    k0 = Math.max(k0, a);
    k1 = Math.max(k1, b);
  }
  if (addK > 0.15 || k1 > Math.max(k0, 1 / CLOSE_RADII[0]) + 0.01) return null;
  return { pts: pts.slice(1), shift: Math.hypot(ex, ey), turn: Math.abs(rot), addK };
}

/**
 * Rundenschluss ohne Knick: Das Ende läuft über eine gerade Einfahrt (CLOSE_ENTRIES) in Richtung der Station in sie
 * hinein. Davor gibt es zwei Arten Schluss:
 *  - Strichende biegen: Kommt der Strich ungefähr richtig an, wird sein Ende über einige Meter sanft eingebogen
 *    (bendTail), was danach übersteht, fällt weg. So bleibt der gezeichnete Bogen, wie er ist.
 *  - neuer Weg: von einer ruhigen Stelle der letzten CLOSE_BACK Meter ein Dubins-Weg (Bögen mit einem der
 *    CLOSE_RADII, Geraden, auch mit Wende) oder ein weicher Übergang.
 * Gewählt wird der günstigste: wenig neue Bahn, wenig Drehung, wenig weggelassener Strich, nah am Strich, möglichst
 * ohne neue Kreuzung. Nie ausufernd: Kein Schluss entfernt sich weiter als CLOSE_AWAY vom Strichende und von der Lücke
 * zur Station, ein neuer Weg dreht von selbst höchstens CLOSE_TURN Grad (eine Wende), auf Wunsch (tap) bis
 * CLOSE_TURN_TAP. Geht es so nicht: null (die Runde bleibt offen). from: erster Linienpunkt des Schlusses.
 */
export function closeBrushLine(drawn: StagePoint[], tap = false): { line: StagePoint[]; from: number } | null {
  if (drawn.length < 30) return null;
  const P0 = drawn[0];
  // Die Station liegt waagerecht in der Zeichenrichtung: Die Runde fährt 2 m gerade ab und kommt gerade an. Ein
  // gleich steigender Anfang ginge nicht: Der Schluss käme in seiner Richtung von unten, also durch den Boden.
  const ts = { X: Math.sign(drawn[Math.min(drawn.length - 1, 4)].X - P0.X) || 1, Y: 0 };
  const thS = Math.atan2(ts.Y, ts.X);
  const head: StagePoint[] = [];
  for (let i = 0; i <= 6 && i < drawn.length; i++) {
    const w = i <= 2 ? 1 : 1 - (i - 2) / 4;
    const e = w * w * (3 - 2 * w);
    head.push({ X: drawn[i].X + (P0.X + ts.X * i - drawn[i].X) * e, Y: drawn[i].Y + (P0.Y - drawn[i].Y) * e });
  }
  const line = resampleLine([...head, ...drawn.slice(head.length)], STEP);
  const n = line.length;
  // Ziele: Beginn der geraden Einfahrt (e Meter vor der Station) und die Punkte der Einfahrt bis zur Station
  const goals = CLOSE_ENTRIES.map((e) => {
    const entry: StagePoint[] = [];
    if (e > 0) {
      for (let d = e - 1; d > 1e-9; d -= 1) entry.push({ X: P0.X - ts.X * d, Y: P0.Y - ts.Y * d });
      entry.push({ ...P0 });
    }
    return { pose: { X: P0.X - ts.X * e, Y: P0.Y - ts.Y * e, th: thS } as Pose, entry };
  });
  // Bezug für den Abstand: das Strichende und die Lücke vom Ende zur Station (Punkte im Meterabstand)
  const end = line[n - 1];
  const gap = Math.hypot(P0.X - end.X, P0.Y - end.Y);
  const bridge: StagePoint[] = [];
  for (let k = 0; k <= Math.ceil(gap); k++) {
    const u = gap > 0 ? Math.min(1, k / gap) : 0;
    bridge.push({ X: end.X + (P0.X - end.X) * u, Y: end.Y + (P0.Y - end.Y) * u });
  }
  const maxTurn = ((tap ? CLOSE_TURN_TAP : CLOSE_TURN) * Math.PI) / 180;
  const minJ = Math.max(24, n - 1 - Math.min(CLOSE_BACK, Math.round(0.3 * n)));
  // angeschlossen wird nur, wo der Strich nicht selbst scharf wendet (seine Richtung wäre dort Zufall)
  const calm = (j: number) => {
    if (j > n - 3) return true;
    const a = Math.atan2(line[j].Y - line[j - 2].Y, line[j].X - line[j - 2].X);
    return Math.abs(wrapPi(Math.atan2(line[j + 2].Y - line[j].Y, line[j + 2].X - line[j].X) - a)) <= (40 * Math.PI) / 180;
  };
  let best = null as { path: StagePoint[]; j: number; cost: number } | null;
  /**
   * Kandidat bewerten: path führt von line[j] (ohne) zum Beginn der Einfahrt. Ab drop fällt der Strich weg (je Meter 2).
   * Neuer Weg (start, R): je Meter 1, Drehung je Radiant umso teurer, je enger (unter 6 m deutlich). Gebogener Strich:
   * nur die Verformung (extra). Dazu: Abstand vom Strich je Meter 2, neue Kreuzung 60, zu kurzer Anstieg je Meter 3.
   */
  const consider = (path: StagePoint[], entry: StagePoint[], j: number, drop: number, extra: number, start?: Pose, R = 0) => {
    let cost = extra + 2 * (n - 1 - drop);
    if (start) {
      const turn = turning(start, path);
      if (turn > maxTurn) return;
      cost += path.length * 0.5 + turn * (6 + 30 / R + 40 * Math.max(0, 1 / R - 1 / 6));
    }
    if (best && cost >= best.cost) return;
    const away = awayFrom(path, [...line.slice(j, n), ...bridge]);
    if (away > CLOSE_AWAY) return;
    // Kreuzungen; beim gebogenen Strich nur die, die er gezeichnet noch nicht hatte
    let crossings = countCrossings([...path, ...entry.slice(0, -1)], line, 2, j - 3);
    if (!start) crossings = Math.max(0, crossings - countCrossings(line.slice(j, drop + 1), line, 2, j - 3));
    // Länge, die der Anstieg vom tiefer gezeichneten Ende zur Station mindestens braucht
    const rise = Math.max(0, P0.Y - line[j].Y);
    const needed = rise > 0 ? Math.sqrt(8 * CLOSE_DEPTH_R * rise) : 0;
    cost += 2 * away + 60 * crossings + 3 * Math.max(0, needed - path.length * 0.5);
    if (!best || cost < best.cost) best = { path: [...path, ...entry], j, cost };
  };
  // gebogenes Strichende: line[t] (auf den letzten 20 m) landet am Ziel, gebogen wird ab j = t - L
  for (let t = n - 1; t >= Math.max(minJ + CLOSE_BEND[0], n - 21); t--) {
    for (const L of CLOSE_BEND) {
      const j = t - L;
      if (j < minJ || !calm(j)) continue;
      for (const { pose: goal, entry } of goals) {
        const b = bendTail(line, j, t, goal);
        if (!b) continue;
        const path = resampleLine([line[j], ...b.pts], 0.5).slice(1);
        consider(path, entry, j, t, 0.3 * L + 4 * b.shift + 10 * b.turn + 80 * Math.max(0, b.addK - 0.08));
      }
    }
  }
  // neuer Weg: Dubins-Wege je Radius und weiche Übergänge (nur, wenn sie nicht enger als der kleinste Radius biegen)
  for (let j = n - 1; j >= minJ; j--) {
    if (!calm(j)) continue;
    // Richtung der Linie in j: Sekante ±2 m (nur rückwärts wäre sie in Bögen zu spät, der Anschluss knickte)
    const A = line[j];
    const B = line[Math.max(0, j - 2)];
    const F = line[Math.min(n - 1, j + 2)];
    const start: Pose = { X: A.X, Y: A.Y, th: Math.atan2(F.Y - B.Y, F.X - B.X) };
    for (const { pose: goal, entry } of goals) {
      for (const R of CLOSE_RADII) for (const path of dubinsPaths(start, goal, R, 0.5)) consider(path, entry, j, j, 0, start, R);
      const dist = Math.hypot(goal.X - A.X, goal.Y - A.Y);
      if (dist < 2) continue;
      for (const lam of [0.33, 0.5]) {
        const e = easePath(start, goal, lam * dist, lam * dist, 0.5);
        if (e.kMax * CLOSE_RADII[0] <= 1) consider(e.pts, entry, j, j, 0, start, 1 / Math.max(e.kMax, 1e-6));
      }
    }
  }
  if (!best) return null;
  const { path, j } = best;
  let ring = resampleLine([...line.slice(0, j + 1), ...path], STEP);
  // nur die Naht am Strich glätten (± 6 m, weich ein- und ausgeblendet); Bögen, Einfahrt und Station bleiben genau
  const m = ring.length;
  const from = Math.max(1, j - 6);
  const to = Math.min(m - 4, j + 6);
  if (to - from >= 4) {
    const part = ring.slice(from, to + 1);
    const smooth = smoothLine(part, 0.8, STEP).map((p, i) => {
      const w = Math.min(1, i / 4, (part.length - 1 - i) / 4);
      const e = w * w * (3 - 2 * w);
      return { X: part[i].X + (p.X - part[i].X) * e, Y: part[i].Y + (p.Y - part[i].Y) * e };
    });
    ring = [...ring.slice(0, from), ...smooth, ...ring.slice(to + 1)];
  }
  ring[ring.length - 1] = { ...P0 };
  return { line: ring, from };
}

/** Kreuzungen der Linie mit sich selbst (Strichpunkt-Paare, der spätere zuletzt) */
export function findLineCrossings(line: StagePoint[], closed: boolean): LineCrossing[] {
  const n = line.length;
  const out: LineCrossing[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const minX = Math.min(a.X, b.X);
    const maxX = Math.max(a.X, b.X);
    const minY = Math.min(a.Y, b.Y);
    const maxY = Math.max(a.Y, b.Y);
    for (let j = i + 8; j < n - 1; j++) {
      if (closed && i < 4 && j > n - 6) continue;
      const c = line[j];
      const d = line[j + 1];
      if (Math.max(c.X, d.X) < minX || Math.min(c.X, d.X) > maxX || Math.max(c.Y, d.Y) < minY || Math.min(c.Y, d.Y) > maxY) continue;
      const rx = b.X - a.X;
      const ry = b.Y - a.Y;
      const sx = d.X - c.X;
      const sy = d.Y - c.Y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.X - a.X) * sy - (c.Y - a.Y) * sx) / den;
      const u = ((c.X - a.X) * ry - (c.Y - a.Y) * rx) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push({ i: t < 0.5 ? i : i + 1, j: u < 0.5 ? j : j + 1 });
    }
  }
  return out;
}

/**
 * Loopings, Bodenschleifen und Hügel im Strich (Linie mit 1 m Abstand, Kreuzungen aus findLineCrossings). Eine Schleife
 * ist eine Kreuzung, zwischen deren Stellen die Linie einmal herum dreht (mindestens LOOP_TURN, 12 bis 160 m); hoch
 * und nach oben gezeichnet ist sie ein Looping. Ein Hügel ist eine Kuppe mindestens HILL_RISE über beiden Füßen, ohne Umkehr in x
 * und nicht in einem Looping; endet die Linie im Anstieg, zählt der Anstieg mit (die Vorschau sieht den Hügel so
 * schon, bevor er wieder herunterkommt).
 */
export function findElements(line: StagePoint[], crossings: LineCrossing[]): BrushElements {
  const n = line.length;
  const out: BrushElements = { loops: [], hills: [] };
  if (n < 4) return out;
  const head = (k: number) => Math.atan2(line[k + 1].Y - line[k].Y, line[k + 1].X - line[k].X);
  for (const c of crossings) {
    if (c.j - c.i < 12 || c.j - c.i > 160) continue;
    let turn = 0;
    for (let k = c.i; k < Math.min(c.j, n - 2); k++) {
      let d = head(k + 1) - head(k);
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      turn += d;
    }
    if (Math.abs(turn) < LOOP_TURN) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = c.i; k <= c.j; k++) {
      x0 = Math.min(x0, line[k].X);
      x1 = Math.max(x1, line[k].X);
      y0 = Math.min(y0, line[k].Y);
      y1 = Math.max(y1, line[k].Y);
    }
    const h = y1 - y0;
    const vertical = h >= LOOP_ASPECT * (x1 - x0) && y1 - line[c.i].Y > 0.6 * h;
    out.loops.push({ i: c.i, j: c.j, vertical });
  }
  const inLoop = (k: number) => out.loops.some((l) => l.vertical && k >= l.i - 4 && k <= l.j + 4);
  // Täler und Kuppen der Reihe nach (Zickzack mit 1 m Hysterese in der Bildhöhe)
  const Y = (k: number) => line[k].Y;
  const ext: Array<{ k: number; max: boolean }> = [];
  let mode = 0;
  let hi = 0;
  let lo = 0;
  for (let k = 1; k < n; k++) {
    if (mode >= 0 && Y(k) > Y(hi)) hi = k;
    if (mode <= 0 && Y(k) < Y(lo)) lo = k;
    if (mode === 0) {
      if (Y(hi) - Y(lo) > 1) {
        mode = lo < hi ? 1 : -1;
        ext.push(lo < hi ? { k: lo, max: false } : { k: hi, max: true });
      }
    } else if (mode === 1 && Y(hi) - Y(k) > 1) {
      ext.push({ k: hi, max: true });
      mode = -1;
      lo = k;
    } else if (mode === -1 && Y(k) - Y(lo) > 1) {
      ext.push({ k: lo, max: false });
      mode = 1;
      hi = k;
    }
  }
  // die Linie endet im Anstieg (oder oben): das Ende zählt als vorläufige Kuppe
  if (mode === 1) ext.push({ k: hi, max: true });
  else if (mode === -1) ext.push({ k: lo, max: false });
  for (let e = 0; e < ext.length; e++) {
    if (!ext[e].max) continue;
    const top = ext[e].k;
    const open = e === ext.length - 1;
    let a = e > 0 ? ext[e - 1].k : 0;
    let b = open ? n - 1 : ext[e + 1].k;
    if (Y(top) - Y(a) < HILL_RISE || (!open && Y(top) - Y(b) < HILL_RISE)) continue;
    // Füße: wo der Anstieg beginnt und der Abstieg endet (ein langes Tal davor gehört nicht dazu)
    const ya = Y(a);
    for (let k = top; k > a; k--) {
      if (Y(k) <= ya + 1) {
        a = Math.max(a, k - 5);
        break;
      }
    }
    if (!open) {
      const yb = Y(b);
      for (let k = top; k < b; k++) {
        if (Y(k) <= yb + 1) {
          b = Math.min(b, k + 5);
          break;
        }
      }
    }
    if (b - a > HILL_WIDE) continue;
    // ohne Umkehr in x (sonst Kehre oder Schleife), nicht im Looping
    const sx = Math.sign(line[Math.max(b, top)].X - line[a].X) || 1;
    let ok = true;
    for (let k = a; k < b && ok; k++) if ((line[k + 1].X - line[k].X) * sx < -0.2 || inLoop(k)) ok = false;
    if (ok) out.hills.push({ a, top, b, open });
  }
  return out;
}

/** Elemente in die Tiefenwahl übertragen: Fliehkraft-Gewicht und Steifigkeit je Punkt, Rampen der Wunschtiefe */
function applyElements(el: BrushElements, wMul: Float64Array, flat: Float64Array, calm: Float64Array, level: Float64Array): Ramp[] {
  const n = wMul.length;
  const ramps: Ramp[] = [];
  for (const h of el.hills) {
    for (let k = h.a; k <= h.b; k++) {
      wMul[k] *= 0.3;
      flat[k] = Math.max(flat[k], HILL_FLAT);
    }
    ramps.push({ hill: true, top: h.top, a: h.a, b: h.b, keep: h.open || calm[h.a] > 0.5 });
  }
  for (const l of el.loops) {
    if (!l.vertical) continue;
    const a = Math.max(0, l.i - 4);
    const b = Math.min(n - 1, l.j + 4);
    for (let k = a; k <= b; k++) {
      wMul[k] = 0;
      flat[k] = Math.max(flat[k], LOOP_FLAT);
      level[k] = 0;
    }
    ramps.push({ hill: false, a, b, keep: false });
  }
  return ramps;
}

// ------------------------------------------------------------------ Tiefe

/**
 * Symmetrische, positiv definite Bandmatrix mit Bandbreite 2, wie sie aus Wunschtiefe, Glättung zweiter Ordnung und
 * festgehaltenen Stellen entsteht (d0 Diagonale, d1 und d2 die Einträge (i, i+1) und (i, i+2)). Zerlegt als L·D·Lᵀ
 * und direkt gelöst: kein Iterieren, auch mit sehr steifen Schranken genau.
 */
class Band2 {
  readonly d0: Float64Array;
  readonly d1: Float64Array;
  readonly d2: Float64Array;
  private readonly D: Float64Array;
  private readonly a1: Float64Array;
  private readonly a2: Float64Array;

  constructor(readonly n: number) {
    this.d0 = new Float64Array(n);
    this.d1 = new Float64Array(n);
    this.d2 = new Float64Array(n);
    this.D = new Float64Array(n);
    this.a1 = new Float64Array(n);
    this.a2 = new Float64Array(n);
  }

  factor(): void {
    const { n, d0, d1, d2, D, a1, a2 } = this;
    for (let i = 0; i < n; i++) {
      let d = d0[i];
      if (i >= 1) d -= a1[i - 1] * a1[i - 1] * D[i - 1];
      if (i >= 2) d -= a2[i - 2] * a2[i - 2] * D[i - 2];
      D[i] = d;
      a1[i] = i + 1 < n ? (d1[i] - (i >= 1 ? a2[i - 1] * a1[i - 1] * D[i - 1] : 0)) / d : 0;
      a2[i] = i + 2 < n ? d2[i] / d : 0;
    }
  }

  /** x = B⁻¹·f (x darf f sein) */
  solve(f: Float64Array, x: Float64Array): void {
    const { n, D, a1, a2 } = this;
    for (let i = 0; i < n; i++) x[i] = f[i] - (i >= 1 ? a1[i - 1] * x[i - 1] : 0) - (i >= 2 ? a2[i - 2] * x[i - 2] : 0);
    for (let i = 0; i < n; i++) x[i] /= D[i];
    for (let i = n - 1; i >= 0; i--) x[i] -= (i + 1 < n ? a1[i] * x[i + 1] : 0) + (i + 2 < n ? a2[i] * x[i + 2] : 0);
  }
}

/** S·x = r für ein kleines dichtes symmetrisches System (Cholesky; etwas Regularisierung gegen abhängige Paare) */
function solveDense(S: Float64Array, k: number, r: Float64Array): Float64Array {
  let maxDiag = 0;
  for (let i = 0; i < k; i++) maxDiag = Math.max(maxDiag, S[i * k + i]);
  const eps = 1e-9 * maxDiag + 1e-300;
  const L = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = S[i * k + j];
      for (let m = 0; m < j; m++) s -= L[i * k + m] * L[j * k + m];
      if (i === j) L[i * k + i] = Math.sqrt(Math.max(s, 0) + eps);
      else L[i * k + j] = s / L[j * k + j];
    }
  }
  const x = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    let s = r[i];
    for (let m = 0; m < i; m++) s -= L[i * k + m] * x[m];
    x[i] = s / L[i * k + i];
  }
  for (let i = k - 1; i >= 0; i--) {
    let s = x[i];
    for (let m = i + 1; m < k; m++) s -= L[m * k + i] * x[m];
    x[i] = s / L[i * k + i];
  }
  return x;
}

/**
 * Zwei Linienpunkte, die sich auf dem Bild so nahe kommen, dass die Tiefe sie trennen muss: Für den Tiefenunterschied
 * dz = z_j − z_i ist das offene Intervall (lo, hi) verboten, dort lägen sie in der Draufsicht näher als PASS_SIDE und
 * in der Höhe näher als PASS_OVER beieinander.
 */
interface NearPair {
  i: number;
  j: number;
  lo: number;
  hi: number;
}

/** Paare von Stellen, die auf der Linie keine Nachbarn sind (bei einer Runde auch über die Station hinweg gezählt) */
function nearPairs(line: StagePoint[], closed: boolean, fixed: Float64Array | null = null): NearPair[] {
  // bei einer Runde ist der letzte Punkt die Station
  const m = closed ? line.length - 1 : line.length;
  const out: NearPair[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = i + NEIGHBOR; j < m; j++) {
      if (closed && m - (j - i) < NEIGHBOR) continue;
      // zwei feste Stellen kann die Tiefe nicht mehr trennen
      if (fixed && !Number.isNaN(fixed[i]) && !Number.isNaN(fixed[j])) continue;
      const dX = line[j].X - line[i].X;
      if (Math.abs(dX) >= PASS_SIDE) continue;
      const dY = line[j].Y - line[i].Y;
      // seitlich zu nah: |dz| < w; in der Höhe zu nah: |dY − c·dz| < PASS_OVER
      const w = Math.sqrt(PASS_SIDE * PASS_SIDE - dX * dX);
      const lo = Math.max(-w, (dY - PASS_OVER) / C);
      const hi = Math.min(w, (dY + PASS_OVER) / C);
      if (lo < hi) out.push({ i, j, lo, hi });
    }
  }
  return out;
}

/**
 * Tiefe je Linienpunkt: min Σ wH·(z − Ziel)² + Σ λ_i·(Δ²z)² + Σ wK·[(Y'' − c·z'')² + z''²]
 * mit Ziel = Tiefe, bei der die Bahn auf Wunschhöhe läge, λ für die Grenzwellenlänge, wK = Fliehkraft-Gewicht aus dem
 * geschätzten Tempo. Schranken, gesetzt sobald verletzt und losgelassen sobald sie nach außen ziehen: Boden, Bühne,
 * untere Schranke (Nachbessern) als steife Federn, der Mindestabstand an Engstellen als exakte Bedingung je Paar
 * (Kraft je Paar aus dem Gleichungssystem). Die Station (Anfang) steht auf dem Boden, bei geschlossener Runde auch das
 * Ende. Dazu je Linienpunkt die Knoten-Toleranz (eng, wo die Bahn einer anderen Stelle nahekommt).
 */
function solveDepth(line: StagePoint[], closed: boolean, crossings: LineCrossing[], wH: Float64Array, wMul: Float64Array, lower: Float64Array, calm: Float64Array, o: Opts, fixed: Float64Array | null = null, hold: Float64Array | null = null, holdW: Float64Array | null = null, flat: Float64Array | null = null, ramps: Ramp[] = [], level: Float64Array | null = null, prevKehren: KehreSide[] | null = null): { z: Float64Array; tol: Float64Array; blocked: Uint8Array; cave: Uint8Array; kehren: KehreSide[] } {
  const n = line.length;
  const z = new Float64Array(n);
  const Z_MIN = STAGE_Z_MIN;
  const Z_MAX = Math.max(STAGE_Z_MAX, o.zMax);
  // Ebenen-Test: In Hügeln ist die Tiefe nicht steifer (sie folgt den Scheiben), nur Loopings bleiben steif
  if (o.depthAt && !o.groundAt && flat) {
    flat = Float64Array.from(flat);
    for (const r of ramps) if (r.hill) for (let k = calm[r.a] > 0.5 ? (r.top ?? r.b) + 1 : r.a; k <= r.b; k++) flat[k] = Math.min(flat[k], 1);
  }
  // „Spur halten“: gehaltene Tiefe je Linienpunkt (holdT); ohne Vorgabe die Spur, auf deren Boden der Strich ansetzt,
  // bei flacher Kamera (Bodenlinien dichter als HOLD_PICK_TAN) die Mittelspur
  let holdZ = NaN;
  const holdT = new Float64Array(n);
  /** 1 in einer Kehre von „Spur halten“: dort darf die Tiefe dem Halbkreis folgen */
  const holdSoft = new Uint8Array(n);
  /** Ebenen-Test: die Kehren (von, bis) und die Richtung, in die der Wächter ihre Tiefe laufen lässt */
  const kehren: KehreSide[] = [];
  /** Ebenen-Test: 1, wo der Strich auf einer Scheibe landet (oder in einer Höhle ist) */
  const landed = new Uint8Array(n);
  /** Ebenen-Test, Mischung: Bodenhöhe aus den Scheiben mit kurzer Glättung nur an Landungen, sonst wie der Bildhöhen-Pinsel */
  const mix = !!o.depthAt && !!o.groundAt;
  if (o.holdLane) {
    const g0 = o.ground(rayToWorld(line[0], 0).x, 0);
    const start = C >= HOLD_PICK_TAN ? Math.round(((line[0].Y - g0 - o.clearance) / C) / LANE_DEPTH) * LANE_DEPTH : 0;
    holdZ = Math.max(Z_MIN, Math.min(Z_MAX, Number.isFinite(o.holdDepth) ? o.holdDepth : start));
    holdT.fill(holdZ);
    // Ebenen-Test: Tiefe nur an Landungen (depthAt), und nur wo der Strich flacher als LAND_SLOPE läuft (steil ist Höhe);
    // dazwischen läuft sie gerade von Landung zu Landung, vor der ersten vom Anfang (Station, alte Bahn) aus, nach der
    // letzten bleibt sie
    if (o.depthAt) {
      const hit = new Float64Array(n).fill(NaN);
      const id = new Float64Array(n).fill(NaN);
      const off = new Float64Array(n).fill(NaN);
      const flatHere = new Uint8Array(n);
      const inCave = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const a = line[Math.max(0, i - 2)];
        const b = line[Math.min(n - 1, i + 2)];
        flatHere[i] = Math.abs(b.Y - a.Y) <= LAND_SLOPE * Math.abs(b.X - a.X) ? 1 : 0;
        const d = o.depthAt(line[i]);
        if (d === null) continue;
        const l = typeof d === 'number' ? { z: d, id: NaN, off: NaN } : d;
        hit[i] = Math.max(Z_MIN, Math.min(Z_MAX, l.z));
        id[i] = l.id;
        inCave[i] = typeof d !== 'number' && d.cave ? 1 : 0;
        off[i] = l.off;
      }
      // Eine Landung zählt erst ab LAND_RUN Metern am Stück, und nur auf zwei Arten: flach (unter LAND_SLOPE) über
      // Scheiben hinweg, oder im gleichen Abstand (±CONTOUR_TOL) an derselben Kante entlang, auch steil (Bergrücken). Eine
      // Hügelflanke quert Kanten und eine kurze Kuppe ist zu kurz: beides bleibt Höhe
      const land = new Float64Array(n).fill(NaN);
      const keepRun = (ok: (i: number, j: number) => boolean) => {
        for (let i = 0; i < n; ) {
          if (!ok(i, i)) {
            i++;
            continue;
          }
          let j = i;
          while (j + 1 < n && ok(i, j + 1)) j++;
          if ((j - i + 1) * STEP >= LAND_RUN) for (let k = i; k <= j; k++) land[k] = hit[k];
          i = j + 1;
        }
      };
      keepRun((_, k) => !Number.isNaN(hit[k]) && flatHere[k] === 1);
      keepRun((i, k) => !Number.isNaN(hit[k]) && !Number.isNaN(id[i]) && id[k] === id[i] && Math.abs(off[k] - off[i]) <= CONTOUR_TOL);
      // Höhlen zählen sofort (die Öffnung ist meist kürzer als eine Landung)
      for (let i = 0; i < n; i++) if (Number.isNaN(land[i]) && inCave[i]) land[i] = hit[i];
      for (let i = 0; i < n; i++) landed[i] = Number.isNaN(land[i]) ? 0 : 1;
      if (mix) {
        // Mischung: Wunschtiefe aus der Bodenhöhe der Scheiben, wo nicht gelandet wird
        for (let i = 0; i < n; i++) holdT[i] = landed[i] ? land[i] : Math.max(Z_MIN, Math.min(Z_MAX, o.groundAt!(line[i])));
        calmSlices(holdT, landed);
      } else {
        if (Number.isNaN(land[0])) land[0] = holdZ;
        let prev = 0;
        for (let i = 1; i < n; i++) {
          if (Number.isNaN(land[i])) continue;
          for (let k = prev + 1; k < i; k++) land[k] = land[prev] + ((land[i] - land[prev]) * (k - prev)) / (i - prev);
          prev = i;
        }
        for (let k = prev + 1; k < n; k++) land[k] = land[prev];
        holdT.set(land);
        calmSlices(holdT, landed);
      }
    }
    // Kehre (Wende in x, von Schenkel zu Schenkel): von der Seite ist sie ein U auf dem Bild; die Bahn fährt es als Halbkreis
    // durch die Tiefe, so weit, wie das U breit ist (Radius = Breite), mindestens am anderen Schenkel vorbei, höchstens
    // HOLD_TURN Spuren. Nach oben gezeichnet nach hinten, sonst nach vorne, ohne Platz die andere Seite. Danach gilt die
    // neue Spur. In der Kehre ist die Tiefe weich (die Glättung ließe den Halbkreis sonst überschwingen)
    if (level) {
      const dirX = (k: number) => {
        const a = line[Math.max(0, k - 1)];
        const b = line[Math.min(n - 1, k + 1)];
        return (b.X - a.X) / (Math.hypot(b.X - a.X, b.Y - a.Y) || 1);
      };
      const heading = (k: number) => {
        const a = line[Math.max(0, k - 1)];
        const b = line[Math.min(n - 1, k + 1)];
        return Math.atan2(b.Y - a.Y, b.X - a.X);
      };
      let cur = holdZ;
      for (let i = 0; i < n; i++) {
        if (!(level[i] > 0)) {
          if (!o.depthAt) holdT[i] = cur;
          continue;
        }
        let j = i;
        while (j + 1 < n && level[j + 1] > 0) j++;
        let a = Math.max(0, i - 1);
        while (a > 0 && i - a < TURN_SPAN && Math.abs(dirX(a)) < 0.9) a--;
        let b = Math.min(n - 1, j + 1);
        while (b < n - 1 && b - j < TURN_SPAN && Math.abs(dirX(b)) < 0.9) b++;
        const s0 = Math.sign(dirX(a)) || 1;
        let ext = line[a].X;
        for (let k = a; k <= b; k++) ext = s0 > 0 ? Math.max(ext, line[k].X) : Math.min(ext, line[k].X);
        const width = Math.abs(ext - (line[a].X + line[b].X) / 2);
        const dz = Math.max(PASS_SIDE + 0.4, Math.min(HOLD_TURN * LANE_DEPTH, 2 * width));
        // Halbkreis: Tiefe nach dem Drehwinkel der Bildrichtung, z = von + (nach − von)·(1 − cos)/2
        const turn = new Float64Array(b - a + 1);
        for (let k = a + 1; k <= b; k++) {
          let d = heading(k) - heading(k - 1);
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          turn[k - a] = turn[k - a - 1] + Math.abs(d);
        }
        const total = Math.max(1e-9, turn[b - a]);
        const half = (k: number) => (1 - Math.cos((Math.PI * turn[k - a]) / total)) / 2;
        // Ebenen-Test: Die Kehre ist ein Halbkreis durch die Tiefe, danach gleitet die Bahn über HOLD_RETURN Meter zur
        // gelesenen Tiefe zurück. (Eine Beule vor und zurück ließ die Tiefe genau am Scheitel stillstehen, wo x umkehrt: dort
        // entstand ein Knick wie eine winzige Schleife, Radius unter 2 m, der Zug entgleiste.)
        if (o.depthAt) {
          // kausal (die Spitze ändert nicht, was schon steht): Tiefe nach dem schon gezeichneten Drehwinkel (bis 180°).
          // Die Kehre fährt ihren Halbkreis von der Tiefe an der Einfahrt aus und nimmt dabei keinen Zug der Scheiben
          // mit (sonst hob ein Zug nach hinten den Halbkreis nach vorne am Scheitel auf: Die Tiefe stand still, die Bahn
          // drehte senkrecht wie ein halber Looping und fuhr kopfüber). Sie ist mindestens KEHRE_RISE-mal so tief, wie das U
          // wirklich hoch ist (Bild Y = Höhe + Tiefe · C: nach oben gezeichnet und nach hinten ist das U flacher, als es
          // aussieht, nach vorne höher), und am Scheitel läuft die Tiefe KEHRE_APEX-mal so schnell wie die wirkliche Höhe.
          // Ob das reicht, prüft nach dem Lösen der Wächter
          let yMin = Infinity;
          let yMax = -Infinity;
          for (let k = a; k <= b; k++) {
            yMin = Math.min(yMin, line[k].Y);
            yMax = Math.max(yMax, line[k].Y);
          }
          let apexY = 0;
          let apexTurn = 1;
          for (let k = a + 1; k <= b; k++) {
            if (turn[k - a] < Math.PI / 2) continue;
            apexY = Math.abs(line[k].Y - line[k - 1].Y);
            apexTurn = Math.max(1e-3, turn[k - a] - turn[k - a - 1]);
            break;
          }
          const up = Math.sign(line[b].Y - line[a].Y) || 1;
          // e = +1: die Tiefe nimmt dem U Höhe (Bild Y = Höhe + Tiefe · C), −1: sie gibt ihm Höhe dazu
          const depthFor = (e: number) => {
            const rise = (KEHRE_RISE * (yMax - yMin)) / Math.max(0.2, 1 + e * KEHRE_RISE * C);
            const apex = (KEHRE_APEX * apexY) / Math.max(0.2, 1 + e * KEHRE_APEX * C) / (0.5 * apexTurn);
            return Math.max(PASS_SIDE + 0.4, Math.min(SLICE_TURN_MAX * LANE_DEPTH, Math.max(2 * Math.abs(ext - line[a].X), rise, apex)));
          };
          const base = holdT[a];
          const trend = holdT[a] - holdT[Math.max(0, a - 6)];
          // wie in der Vorschau davor (sonst kippte die Kehre von Bild zu Bild), sonst dem Zug der Tiefe folgen, außer das U
          // würde dadurch viel höher (steile Kamera, über etwa 14°)
          const was = prevKehren?.find((q) => q.dir && Math.abs(q.a - a) <= 3);
          let sgn = was ? was.dir : Math.abs(trend) > 0.5 && KEHRE_APEX * C <= 1 / 3 ? Math.sign(trend) : up;
          let dzK = depthFor(sgn * up);
          if (base + sgn * dzK > Z_MAX || base + sgn * dzK < Z_MIN) {
            sgn = -sgn;
            dzK = depthFor(sgn * up);
          }
          const prof = (k: number) => (1 - Math.cos(Math.min(Math.PI, turn[k - a]))) / 2;
          const endOffset = base + sgn * dzK * prof(b) - holdT[b];
          for (let k = a; k <= b; k++) {
            holdT[k] = Math.max(Z_MIN, Math.min(Z_MAX, base + sgn * dzK * prof(k)));
            holdSoft[k] = 1;
          }
          for (let k = b + 1; k < n && k - b <= HOLD_RETURN; k++) {
            const w = (k - b) / HOLD_RETURN;
            holdT[k] = Math.max(Z_MIN, Math.min(Z_MAX, holdT[k] + endOffset * (1 - w * w * (3 - 2 * w))));
          }
          kehren.push({ a, b, dir: was ? sgn : 0 });
          i = b;
          continue;
        }
        const dir = Math.sign(line[b].Y - line[a].Y) || 1;
        let next = cur + dir * dz;
        if (next > Z_MAX + 1e-6 || next < Z_MIN - 1e-6) next = cur - dir * dz;
        next = Math.max(Z_MIN, Math.min(Z_MAX, next));
        for (let k = a; k <= b; k++) {
          holdT[k] = cur + (next - cur) * half(k);
          holdSoft[k] = 1;
        }
        cur = next;
        i = b;
      }
    }
  }
  for (let i = 0; i < n; i++) z[i] = o.holdLane ? holdT[i] : Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - H_COMFORT) / C));
  const target = new Float64Array(n);
  const upper = new Float64Array(n);
  const low = new Float64Array(n);
  const ypp = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) ypp[i] = line[i - 1].Y - 2 * line[i].Y + line[i + 1].Y;
  let solved = false;
  // Freiraumfeld (Tor 2b; Plan Paket 5): je Linienpunkt die freien Tiefen-Abschnitte am Strahl; daraus wählt chooseChain
  // eine Kette von Abschnitten über den ganzen Strich. Schranken, Lesung und Anlauf kommen dann aus dem gewählten Abschnitt
  const lanes: FreeLanes[] | null = o.field ? line.map((p) => o.field!.free(p)) : null;
  const blocked = new Uint8Array(n);
  /** 1: in einer Höhle, der Pinsel liest keine Höhe (die Mitte des Abschnitts, schwach) */
  const noRead = new Uint8Array(n);
  const fieldOn = new Uint8Array(n);
  const fieldLow = new Float64Array(n).fill(-Infinity);
  const fieldUp = new Float64Array(n).fill(Infinity);
  /** Mitte des gewählten Abschnitts (Meter): in einer Höhle der Wunsch (die Schranken sind weiter, sie umfassen Berührendes) */
  const fieldMid = new Float64Array(n);
  /** Abstand des Wunschs von der vorderen und hinteren Schranke (Meter): nur an Elementwänden, am Boden wie in den Levels keiner */
  const gapLo = new Float64Array(n);
  const gapUp = new Float64Array(n);
  /** Höhle unter dem Strich, in die er noch nicht hinein reicht: Mitte (Meter) und Zug dorthin 0 … 1 */
  const caveBelow = new Float64Array(n);
  const caveBelowW = new Float64Array(n);
  /** reine Lesung der Bildhöhe über dem Boden (Meter), vor Schranken und Anlauf */
  const read = new Float64Array(n);
  const smooth = (w: number) => w * w * (3 - 2 * w);
  const bounds = () => {
    for (let i = 0; i < n; i++) {
      const g = o.ground(rayToWorld(line[i], z[i] / LANE_DEPTH).x, z[i] / LANE_DEPTH);
      target[i] = o.holdLane ? holdT[i] : (line[i].Y - g - H_COMFORT) / C;
      // unter der vordersten Bodenlinie gezeichnet: ganz vorne bleiben (die Höhe wird dort angehoben); „Spur halten“
      // weicht dafür nicht nach vorne aus, dort hebt nur die Mindesthöhe (worldPoints)
      upper[i] = o.holdLane ? Z_MAX : Math.max(Z_MIN, Math.min(Z_MAX, (line[i].Y - g - o.clearance) / C));
      low[i] = Math.min(upper[i], Math.max(Z_MIN, lower[i]));
      read[i] = target[i];
      // Freiraumfeld: Schranken des gewählten Abschnitts (er enthält schon den Boden mit Luft darunter); der Hebel „nach
      // hinten legen“ des Nachbesserns (lower) gilt nur, soweit der Abschnitt ihn lässt (der Fels schlägt den Hebel)
      if (fieldOn[i]) {
        upper[i] = Math.min(Z_MAX, fieldUp[i]);
        low[i] = Math.max(Z_MIN, fieldLow[i]);
        if (lower[i] > low[i]) low[i] = Math.min(upper[i], lower[i]);
      }
    }
    const startZ = o.holdLane ? holdZ : upper[0];
    for (let i = 0; i < n; i++) if (calm[i] > 0) target[i] = calm[i] * startZ + (1 - calm[i]) * target[i];
    // Looping und Hügel: Wunschtiefe gerade von Fuß zu Fuß (Tiefe der letzten Lösung, vor der ersten die Wunschtiefe)
    for (const r of ramps) {
      // Ebenen-Test: Hügel und ein Anstieg am Strichende liegen auf den Scheiben, über die sie gezeichnet sind (ein Strich über
      // einen Berg liegt auf dem Berg). Der Lifthügel an der Station läuft gerade von der Station zur Scheibe unter seiner
      // Kuppe (ein gerader Kettenaufzug in die Tiefe), danach folgt er den Scheiben; Loopings bleiben gerade
      if (mix && r.hill) {
        const za = solved ? z[r.a] : target[r.a];
        const zb = r.keep ? za : solved ? z[r.b] : target[r.b];
        for (let i = r.a + 1; i < r.b; i++) if (!landed[i]) target[i] = za + ((zb - za) * (i - r.a)) / (r.b - r.a);
        if (r.keep && !landed[r.b]) target[r.b] = za;
        continue;
      }
      if (o.depthAt && r.hill) {
        if (!(calm[r.a] > 0.5)) continue;
        const t = r.top ?? r.b;
        const za = solved ? z[r.a] : target[r.a];
        const zb = holdT[t];
        // die Tiefe wächst mit der Höhe (flach am Fuß bleibt die Bahn vor den vorderen Terrassen)
        const rise = Math.max(1e-6, line[t].Y - line[r.a].Y);
        for (let i = r.a + 1; i <= t; i++) target[i] = za + (zb - za) * Math.max(0, Math.min(1, (line[i].Y - line[r.a].Y) / rise));
        continue;
      }
      const za = solved ? z[r.a] : target[r.a];
      const zb = r.keep ? za : solved ? z[r.b] : target[r.b];
      for (let i = r.a + 1; i < r.b; i++) target[i] = za + ((zb - za) * (i - r.a)) / (r.b - r.a);
      if (r.keep) target[r.b] = za;
    }
    // Freiraumfeld, nach Station und Hügeln (die Wände gehen vor): In einer Höhle liest der Pinsel keine Höhe, Wunsch
    // ist die Mitte des Abschnitts. Sonst hält der Wunsch FIELD_GAP Abstand zu den Wänden, und eine Höhle unter dem
    // Strich zieht ihn nahe der Oberfläche auf ihre Mitte, damit die Tauchfahrt in ihrer Spur beginnt (Florians Magnet)
    if (lanes) {
      const base = Float64Array.from(target);
      // 1: der Wunsch wurde von einer Elementwand oder einer Höhle verschoben (nur das kündigt sich im Anlauf an; die
      // Bodenschranke wirkt wie in den Levels allein über die Schranke)
      const shifted = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (!fieldOn[i]) continue;
        if (noRead[i]) {
          target[i] = Math.max(low[i], Math.min(upper[i], fieldMid[i]));
          continue;
        }
        let t = target[i];
        if (caveBelowW[i] > 0) {
          t += (caveBelow[i] - t) * caveBelowW[i];
          shifted[i] = 1;
        }
        const half = (upper[i] - low[i]) / 2;
        const lo = low[i] + Math.min(gapLo[i], half);
        const up = upper[i] - Math.min(gapUp[i], half);
        if (t < lo) {
          if (gapLo[i] > 0) shifted[i] = 1;
          t = lo;
        } else if (t > up) {
          if (gapUp[i] > 0) shifted[i] = 1;
          t = up;
        }
        target[i] = t;
      }
      // Anlauf: Was Wände und Höhlen an der Wunschtiefe ändern, kündigt sich rückwärts entlang der Linie an (je Meter mit
      // RAMP_DECAY abklingend), damit die Bahn nicht erst an der Wand abbiegt, sondern weich hinläuft. In einer Höhle gibt
      // es keine Lesung, also auch keine Verschiebung gegen sie; was eine Höhle vor sich herschiebt, trägt der Zug auf
      // ihre Mitte (caveBelow) in den Punkten davor
      let carry = 0;
      for (let i = n - 1; i >= 0; i--) {
        if (i === 0 || (fixed && !Number.isNaN(fixed[i]))) {
          carry = 0;
          continue;
        }
        const own = fieldOn[i] && !noRead[i] && shifted[i] ? target[i] - base[i] : 0;
        if (Math.abs(own) >= Math.abs(carry)) carry = own;
        else {
          carry *= RAMP_DECAY;
          if (!noRead[i]) target[i] = Math.max(low[i], Math.min(upper[i], base[i] + carry));
        }
      }
      // Ein- und Ausfahrt einer Höhle: die Wunschtiefe wandert über CAVE_RAMP Punkte von der letzten Lesung davor zur
      // Höhlenmitte und am Ende wieder zur ersten Lesung danach, statt am Rand zu springen
      let run = 0;
      let from = NaN;
      for (let i = 0; i < n; i++) {
        if (!noRead[i]) {
          run = 0;
          from = target[i];
          continue;
        }
        if (!Number.isNaN(from) && run < CAVE_RAMP) target[i] = from + (target[i] - from) * smooth((run + 1) / (CAVE_RAMP + 1));
        run++;
      }
      run = 0;
      let to = NaN;
      for (let i = n - 1; i >= 0; i--) {
        if (!noRead[i]) {
          run = 0;
          to = target[i];
          continue;
        }
        if (!Number.isNaN(to) && run < CAVE_RAMP) target[i] = to + (target[i] - to) * smooth((run + 1) / (CAVE_RAMP + 1));
        run++;
      }
    }
  };
  bounds();
  const pins = new Map<number, number>();
  // fest: die Station und was die Tiefe behalten soll (alte Bahn beim Fortsetzen, ruhiger Teil der Live-Vorschau)
  const isFixed = (i: number) => !!fixed && !Number.isNaN(fixed[i]);
  // Runde: Die Station liegt auf beiden Seiten gerade (die ersten und letzten 2 m behalten ihre Tiefe), sonst käme die
  // Bahn mit anderer Tiefen-Steigung an, als sie abfährt: ein seitlicher Knick genau in der Station
  const seam = (i: number) => closed && (i <= 2 || i >= n - 3);
  // Fang an einer Baustelle: das Ende der offenen Linie hält die Spur des Anschlusspunkts wie die Station ihre
  const endPin = o.endSnap && !closed ? n - 1 : -1;
  const station = (i: number) => i === 0 || (closed && i === n - 1) || seam(i) || isFixed(i) || i === endPin;
  const fixedAt = (i: number) => (isFixed(i) ? fixed![i] : i === endPin ? o.endSnap!.lane * LANE_DEPTH : o.holdLane ? holdZ : upper[0]);
  const pinStation = () => {
    pins.set(0, fixedAt(0));
    if (endPin >= 0) pins.set(endPin, fixedAt(endPin));
    if (closed) for (const i of [1, 2, n - 3, n - 2, n - 1]) pins.set(i, isFixed(i) ? fixed![i] : fixedAt(0));
    if (fixed) for (let i = 0; i < n; i++) if (isFixed(i)) pins.set(i, fixed[i]);
  };
  pinStation();
  // an Wenden (±3 m) lässt eine Schranke schon bei kleiner Gegenkraft los: Der flache Scheitel braucht dort oft die
  // Stelle davor weiter vorne oder hinten, als die erste Lösung sie hatte (sonst bliebe sie am Bühnenrand kleben)
  const atTurn = new Uint8Array(n);
  if (level) for (let i = 0; i < n; i++) if (level[i] > 0) for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) atTurn[k] = 1;
  const wK = new Float64Array(n);
  // Spur-Magnete (ab dem zweiten Durchgang aus der vorigen Lösung), nur wo die Linie über ±3 m kaum dreht
  const magW = new Float64Array(n);
  const magZ = new Float64Array(n);
  const straight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 3)];
    const m = line[i];
    const c = line[Math.min(n - 1, i + 3)];
    const turn = Math.abs(Math.atan2((m.X - a.X) * (c.Y - m.Y) - (m.Y - a.Y) * (c.X - m.X), (m.X - a.X) * (c.X - m.X) + (m.Y - a.Y) * (c.Y - m.Y)));
    straight[i] = Math.max(0, 1 - turn / ((25 * Math.PI) / 180));
  }
  // Engstellen: je Paar die gewählte Seite (+1: j liegt hinten, dz ≥ hi; −1: j vorne, dz ≤ lo), ob es gerade auf dem
  // Rand des verbotenen Bereichs gehalten wird (seit welcher Runde, mit welcher Kraft) oder aufgegeben ist
  const near = nearPairs(line, closed, fixed);
  const side = new Int8Array(near.length);
  const held: number[] = [];
  const isHeld = new Uint8Array(near.length);
  const heldRound = new Int32Array(near.length);
  const given = new Uint8Array(near.length);
  let force: Float64Array = new Float64Array(0);
  let roundNo = 0;
  const edge = (p: number) => (side[p] > 0 ? near[p].hi : near[p].lo);
  const B = new Band2(n);
  // Schranken-Feder: deutlich steifer als der Rest des Systems (das Fliehkraft-Gewicht kann groß werden)
  let pinW = PIN_W;
  // Steifigkeit der Tiefe je Punkt: in Kehren und an Landungen weicher. Der Wechsel gleitet über ±SOFT_TAPER Punkte
  // (geometrisch gemittelt), sonst knickt die Bahn genau dort, wo die Steifigkeit springt (Mini-Knicke am Kehrenanfang)
  const soft = new Float64Array(n);
  for (let i = 0; i < n; i++) soft[i] = Math.log((holdSoft[i] ? HOLD_SOFT : 1) * (o.depthAt && (!mix || landed[i]) ? SLICE_SMOOTH : 1));
  if (o.depthAt) {
    const src = Float64Array.from(soft);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = Math.max(0, i - SOFT_TAPER); k <= Math.min(n - 1, i + SOFT_TAPER); k++) {
        sum += src[k];
        cnt++;
      }
      soft[i] = sum / cnt;
    }
  }
  for (let i = 0; i < n; i++) soft[i] = Math.exp(soft[i]);
  // Wächter der Kehren: festgelegte Tiefen-Neigung z(i+1) − z(i−1) je Linienpunkt (Gewicht 0: frei)
  const guardW = new Float64Array(n);
  const guardT = new Float64Array(n);
  /** 1 in einer Kehre, die der Wächter korrigiert: Dort hält die gezeigte Vorschau nicht (sie hielte den Fehler fest) */
  const guarded = new Uint8Array(n);
  const solveOnce = () => {
    const { d0, d1, d2 } = B;
    d1.fill(0);
    d2.fill(0);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // in einer Höhle und davor, wo sie den Strich schon auf ihre Mitte zieht, wiegt der Wunsch mehr
      // „Spur halten“: auch steil gezeichnet hält die Spur (die Steilheit ist dort Höhe, nicht Tiefe)
      const wr = (o.holdLane ? (mix && !landed[i] ? wH[i] : Math.max(o.depthAt ? SLICE_W : 1, wH[i])) : wH[i]) * (noRead[i] ? NOREAD_W : 1 + (NOREAD_W - 1) * caveBelowW[i]);
      d0[i] = wr + magW[i];
      b[i] = wr * target[i] + magW[i] * magZ[i];
      if (hold && holdW && !Number.isNaN(hold[i]) && !guarded[i]) {
        d0[i] += holdW[i];
        b[i] += holdW[i] * hold[i];
      }
    }
    for (let i = 1; i < n - 1; i++) {
      const l = LAMBDA * (flat ? flat[i] : 1) * soft[i] + (1 + C * C) * wK[i];
      d0[i - 1] += l;
      d0[i] += 4 * l;
      d0[i + 1] += l;
      d1[i - 1] -= 2 * l;
      d1[i] -= 2 * l;
      d2[i - 1] += l;
      const q = C * wK[i] * ypp[i];
      b[i - 1] += q;
      b[i] -= 2 * q;
      b[i + 1] += q;
    }
    // Scheitel von Wenden: Höhe flach, also z(i+1) − z(i−1) = (Y(i+1) − Y(i−1)) / c
    if (level) {
      for (let i = 1; i < n - 1; i++) {
        // wo der Wächter die Neigung festlegt, gilt seine
        const w = guardW[i] ? 0 : TURN_LEVEL_W * level[i];
        if (!w) continue;
        // „Spur halten“: die Kehre nimmt ihre geplanten zwei Spuren, die übrige Bildbewegung wird Höhe
        const t = o.holdLane ? holdT[i + 1] - holdT[i - 1] : (line[i + 1].Y - line[i - 1].Y) / C;
        d0[i - 1] += w;
        d0[i + 1] += w;
        d2[i - 1] -= w;
        b[i + 1] += w * t;
        b[i - 1] -= w * t;
      }
    }
    for (let i = 1; i < n - 1; i++) {
      const w = guardW[i];
      if (!w) continue;
      d0[i - 1] += w;
      d0[i + 1] += w;
      d2[i - 1] -= w;
      b[i + 1] += w * guardT[i];
      b[i - 1] -= w * guardT[i];
    }
    let maxD = 0;
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, d0[i]);
    pinW = Math.max(PIN_W, 1e3 * maxD);
    for (const [i, v] of pins) {
      d0[i] += pinW;
      b[i] += pinW * v;
    }
    B.factor();
    B.solve(b, z);
    solved = true;
    // gehaltene Paare exakt (z_j − z_i = Rand): z = z0 − Y·f mit Y = B⁻¹·U, (Uᵀ·Y)·f = Uᵀ·z0 − Rand
    const k = held.length;
    force = new Float64Array(k);
    if (!k) return;
    const Y: Float64Array[] = [];
    const u = new Float64Array(n);
    for (const p of held) {
      u[near[p].j] = 1;
      u[near[p].i] = -1;
      const y = new Float64Array(n);
      B.solve(u, y);
      u[near[p].j] = 0;
      u[near[p].i] = 0;
      Y.push(y);
    }
    const S = new Float64Array(k * k);
    const r = new Float64Array(k);
    for (let a = 0; a < k; a++) {
      const q = near[held[a]];
      r[a] = z[q.j] - z[q.i] - edge(held[a]);
      for (let c = 0; c <= a; c++) S[a * k + c] = S[c * k + a] = Y[c][q.j] - Y[c][q.i];
    }
    force = solveDense(S, k, r);
    for (let a = 0; a < k; a++) {
      const y = Y[a];
      const f = force[a];
      for (let i = 0; i < n; i++) z[i] -= f * y[i];
    }
  };
  const inCluster = (a: { i: number; j: number }, b: { i: number; j: number }) => Math.abs(a.i - b.i) <= CLUSTER && Math.abs(a.j - b.j) <= CLUSTER;
  // Seite eines Paars: wie die Engstelle, in der schon ein Paar gehalten wird; sonst wie zuletzt; an einer Kreuzung wie
  // dort gewählt; sonst die nähere. Geht sie wegen Boden, Bühne oder Station nicht, die andere.
  const sideOf = (p: number, dz: number): number => {
    const q = near[p];
    for (const h of held) if (inCluster(q, near[h])) return side[h];
    const lowAt = (i: number) => (station(i) ? fixedAt(i) : low[i]);
    const upAt = (i: number) => (station(i) ? fixedAt(i) : upper[i]);
    const fits = (s: number) => (s > 0 ? upAt(q.j) - lowAt(q.i) >= q.hi : lowAt(q.j) - upAt(q.i) <= q.lo);
    let s = side[p];
    if (!s) for (const c of crossings) if (c.laterFront !== undefined && inCluster(q, c)) s = c.laterFront ? -1 : 1;
    if (!s) s = dz >= (q.lo + q.hi) / 2 ? 1 : -1;
    return fits(s) || !fits(-s) ? s : -s;
  };
  const release = (a: number) => {
    isHeld[held[a]] = 0;
    held.splice(a, 1);
  };
  // gehaltene Paare, deren Kraft die Stränge zusammenzieht, loslassen (sie lägen von selbst weiter auseinander)
  const releasePulling = (): number => {
    let k = 0;
    for (let a = held.length - 1; a >= 0; a--) {
      if (side[held[a]] * force[a] > 1e-6 * pinW) {
        release(a);
        k++;
      }
    }
    return k;
  };
  // Widersprüche (Knäuel aus vielen Strängen, Station, Bühnenrand): Ein gehaltenes Paar drückt eine festgehaltene
  // Stelle weit über ihre Schranke. Diese Engstelle bleibt so, am Ende meldet sie sich als Kreuzung.
  const giveUp = (): number => {
    let k = 0;
    for (let a = held.length - 1; a >= 0; a--) {
      if (a >= held.length) continue;
      const q = near[held[a]];
      const over = (i: number) => {
        const v = pins.get(i);
        if (v === undefined) return 0;
        return station(i) ? Math.abs(z[i] - v) : v === upper[i] ? z[i] - v : v - z[i];
      };
      if (Math.max(over(q.i), over(q.j)) <= GIVE_UP) continue;
      for (let r = 0; r < near.length; r++) if (inCluster(near[r], q)) given[r] = 1;
      for (let m = held.length - 1; m >= 0; m--) {
        if (given[held[m]]) {
          release(m);
          k++;
        }
      }
    }
    return k;
  };
  // zu nahe Paare auf den Rand setzen. Je Runde und Engstelle kommt nur das am stärksten verletzte dazu, weitere erst,
  // wenn sie danach noch deutlich zu nah sind (die Tiefe ist glatt, meist trägt ein Paar die ganze Engstelle)
  const holdNew = (): number => {
    const cand: Array<{ p: number; v: number }> = [];
    for (let p = 0; p < near.length; p++) {
      if (isHeld[p] || given[p]) continue;
      const q = near[p];
      const dz = z[q.j] - z[q.i];
      if (dz <= q.lo + 1e-3 || dz >= q.hi - 1e-3) continue;
      cand.push({ p, v: sideOf(p, dz) > 0 ? q.hi - dz : dz - q.lo });
    }
    cand.sort((a, b) => b.v - a.v);
    let k = 0;
    for (const { p, v } of cand) {
      const q = near[p];
      let inIt = 0;
      let skip = false;
      for (const h of held) {
        if (!inCluster(q, near[h])) continue;
        inIt++;
        if (heldRound[h] === roundNo || v < NEAR_TOL || inIt >= CLUSTER_MAX) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      side[p] = sideOf(p, z[q.j] - z[q.i]);
      held.push(p);
      isHeld[p] = 1;
      heldRound[p] = roundNo;
      k++;
    }
    return k;
  };
  const settle = (withNear: boolean) => {
    for (let round = 0; round < 40; round++) {
      solveOnce();
      roundNo++;
      // Loslassen zuerst: Was nach außen zieht, verfälscht die Lösung, also danach keine Widersprüche suchen
      let released = withNear ? releasePulling() : 0;
      for (const [i, v] of pins) {
        if (station(i) || upper[i] - low[i] < 1e-6) continue;
        // in einer Höhle (und über einer, die zieht) lässt die Schranke wie an Wenden schon bei kleiner Gegenkraft los:
        // der Zug zur Höhlenmitte ist sanft und hielte sonst die Bahn an der Wand, an der sie hereinkam
        const tolI = atTurn[i] || noRead[i] || caveBelowW[i] > 0 ? 1e-5 : 1e-3;
        if (v === upper[i] ? z[i] < v - tolI : z[i] > v + tolI) {
          pins.delete(i);
          released++;
        }
      }
      let changed = released;
      if (withNear && !released) changed += giveUp();
      for (let i = 0; i < n; i++) {
        if (pins.has(i)) continue;
        if (z[i] > upper[i] + 1e-3) {
          pins.set(i, upper[i]);
          changed++;
        } else if (z[i] < low[i] - 1e-3) {
          pins.set(i, low[i]);
          changed++;
        }
      }
      if (withNear) changed += holdNew();
      if (!changed) break;
    }
  };
  // erste Lösung ohne Engstellen und Fliehkraft: daraus die Reihenfolge an den Kreuzungen (später Gezeichnetes vorne,
  // außer der frühere Strang liegt schon ganz vorne) und die Seite an den Engstellen
  // Kette der freien Abschnitte (Freiraumfeld): je Punkt kostet ein Abschnitt den Abstand der Wunschtiefe zu ihm (Spuren),
  // eine Höhle, in die der Strich hinein gemalt ist, zählt um CAVE_PULL breiter (Magnet: Öffnungen und Räume ziehen an), ein
  // Wechsel in einen Abschnitt, der den vorigen nicht berührt, ist ein Sprung (teuer; dort ist der Strich blockiert, die
  // Bahn endet beim Loslassen davor). Feste Punkte (Station, alte Bahn, Vorschau, Fang) bleiben in ihrem Abschnitt.
  // Kleinste Gesamtkosten über den ganzen Strich (dynamisches Programm), also eine Seite je Durchfahrt ohne Hin und Her
  const chooseChain = () => {
    const M = CHAIN_MARGIN;
    const JUMP = 100;
    const natural = new Float64Array(n);
    for (let i = 0; i < n; i++) natural[i] = o.holdLane ? holdT[i] : (line[i].Y - o.ground(rayToWorld(line[i], z[i] / LANE_DEPTH).x, z[i] / LANE_DEPTH) - H_COMFORT) / C;
    interface Opt {
      a: number;
      b: number;
      a0: number;
      b0: number;
      /** Elementwand vorn bzw. hinten (dort Abstand und Anlauf; am Boden und Bühnenrand nicht) */
      wallLo: boolean;
      wallUp: boolean;
      cave: boolean;
      attract: boolean;
    }
    const opts: Opt[][] = lanes!.map((l) => {
      const out: Opt[] = [];
      for (const iv of l.intervals) {
        const a0 = iv.a * LANE_DEPTH;
        const b0 = iv.b * LANE_DEPTH;
        const wallLo = iv.aKind === 'element';
        const wallUp = iv.bKind === 'element';
        // knapp vor Elementwänden; die Bodenschranke ist genau die Mindesthöhe wie in den Levels
        let a = Math.max(Z_MIN, a0 + (wallLo ? M : 0));
        let b = Math.min(Z_MAX, b0 - (wallUp ? M : 0));
        // schmaler als der doppelte Abstand (etwa am vordersten Bühnenrand): auf die Mitte gefaltet, nicht weg
        if (b < a) a = b = Math.max(Z_MIN, Math.min(Z_MAX, (a0 + b0) / 2));
        out.push({ a, b, a0, b0, wallLo, wallUp, cave: !!iv.cave, attract: iv.attract });
      }
      if (!out.length && l.fallback !== null) {
        const f = Math.max(Z_MIN, Math.min(Z_MAX, l.fallback * LANE_DEPTH));
        out.push({ a: f, b: f, a0: f, b0: f, wallLo: false, wallUp: false, cave: false, attract: false });
      }
      return out;
    });
    const pinned = (i: number): number | null => (isFixed(i) ? fixed![i] : i === endPin ? o.endSnap!.lane * LANE_DEPTH : null);
    const dist = (v: number, op: Opt) => (v < op.a ? op.a - v : v > op.b ? v - op.b : 0) / LANE_DEPTH;
    const cost = (i: number, k: number): number => {
      const op = opts[i][k];
      const fx = pinned(i);
      if (fx !== null) return fx >= op.a - M && fx <= op.b + M ? 0 : 20;
      // was schon gezeigt wurde (hold: die letzte Vorschau), führt die Kette: kein Wechsel beim Loslassen oder weiter hinten
      if (hold && holdW && holdW[i] > 0 && !Number.isNaN(hold[i])) return dist(hold[i], op) * 4;
      // Höhle, in die der Strich hinein gemalt ist: um CAVE_PULL breiter gerechnet, bei Gleichstand leicht bevorzugt
      if (op.cave && op.attract) return Math.max(0, dist(natural[i], op) - CAVE_PULL) - 0.05;
      return dist(natural[i], op);
    };
    // Abschnitte berühren sich, wenn sich die ungeschrumpften überlappen oder aneinander grenzen (eine Abtastung)
    const touch = (p: Opt, q: Opt) => Math.min(p.b0, q.b0) - Math.max(p.a0, q.a0) >= -0.06 * LANE_DEPTH;
    const dp = opts.map((l) => new Float64Array(l.length).fill(Infinity));
    const from = opts.map((l) => new Int32Array(l.length).fill(-1));
    const jump = opts.map((l) => new Uint8Array(l.length));
    let prev = -1;
    for (let i = 0; i < n; i++) {
      if (!opts[i].length) {
        blocked[i] = 1;
        continue;
      }
      for (let k = 0; k < opts[i].length; k++) {
        const c = cost(i, k);
        if (prev < 0) {
          dp[i][k] = c;
          continue;
        }
        let best = Infinity;
        let bk = -1;
        let jumped = false;
        for (let k2 = 0; k2 < opts[prev].length; k2++) {
          const conn = i - prev > 1 || touch(opts[prev][k2], opts[i][k]);
          const v = dp[prev][k2] + (conn ? 0 : JUMP);
          if (v < best) {
            best = v;
            bk = k2;
            jumped = !conn;
          }
        }
        dp[i][k] = best + c;
        from[i][k] = bk;
        jump[i][k] = jumped ? 1 : 0;
      }
      prev = i;
    }
    if (prev < 0) return;
    let i = prev;
    let k = 0;
    for (let q = 1; q < dp[i].length; q++) if (dp[i][q] < dp[i][k]) k = q;
    while (i >= 0 && k >= 0) {
      const op = opts[i][k];
      const l = lanes![i];
      fieldOn[i] = 1;
      // Schranken: der gewählte Abschnitt samt allen, die ihn berühren (Luft und Höhle an einem Fenster oder Lochrand
      // sind ein zusammenhängender Freiraum); so wechselt die Bahn dort weich statt an einem Punkt
      let a = op.a;
      let b = op.b;
      let wallLo = op.wallLo;
      let wallUp = op.wallUp;
      for (let q = k - 1; q >= 0 && touch(opts[i][q], opts[i][q + 1]); q--) {
        a = Math.min(a, opts[i][q].a);
        wallLo = opts[i][q].wallLo;
      }
      for (let q = k + 1; q < opts[i].length && touch(opts[i][q - 1], opts[i][q]); q++) {
        b = Math.max(b, opts[i][q].b);
        wallUp = opts[i][q].wallUp;
      }
      fieldLow[i] = a;
      fieldUp[i] = b;
      fieldMid[i] = (op.a + op.b) / 2;
      gapLo[i] = wallLo ? FIELD_GAP : 0;
      gapUp[i] = wallUp ? FIELD_GAP : 0;
      noRead[i] = op.cave && op.attract ? 1 : 0;
      if (l.below && !noRead[i]) {
        caveBelow[i] = l.below.center * LANE_DEPTH;
        caveBelowW[i] = smooth(Math.max(0, Math.min(1, 1 - l.below.h / H_COMFORT)));
      }
      if (jump[i][k]) blocked[i] = 1;
      const pk = from[i][k];
      let j = i - 1;
      while (j >= 0 && !opts[j].length) j--;
      i = j;
      k = pk;
    }
  };
  if (lanes) {
    chooseChain();
    bounds();
  }
  const order = crossings.filter((c) => c.laterFront === undefined);
  if (order.length || near.length) {
    settle(false);
    // Ebenen-Test: die Seite, auf der der spätere Strang ohnehin liegt (sonst schnappte er beim Erkennen der Kreuzung um)
    for (const c of order) c.laterFront = c.natural || o.depthAt ? z[c.j] <= z[c.i] : z[c.i] - PASS_SIDE >= Z_MIN + 0.5 || z[c.i] + PASS_SIDE > upper[c.j];
  }
  if (near.length) {
    // Engstellen entlang paralleler Stränge: eine Seite je Strangpaar (Paare, die über ±2 Linienpunkte zusammenhängen),
    // gewählt nach der Mehrheit der ersten Lösung, an einer Kreuzung wie dort (widersprechen sich zwei Kreuzungen,
    // entscheidet jede Engstelle selbst). Sonst wechselte ein Strang mittendrin die Seite und träfe den anderen auf
    // gleicher Höhe.
    const at = new Map<number, number>();
    near.forEach((q, p) => at.set(q.i * n + q.j, p));
    const root = Int32Array.from(near.keys());
    const find = (p: number): number => {
      while (root[p] !== p) p = root[p] = root[root[p]];
      return p;
    };
    near.forEach((q, p) => {
      for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) {
          const r = at.get((q.i + di) * n + q.j + dj);
          if (r !== undefined) root[find(r)] = find(p);
        }
      }
    });
    const vote = new Map<number, number>();
    const fixedSide = new Map<number, number>();
    near.forEach((q, p) => {
      const g = find(p);
      vote.set(g, (vote.get(g) ?? 0) + (z[q.j] - z[q.i] >= (q.lo + q.hi) / 2 ? 1 : -1));
      for (const c of crossings) {
        if (c.laterFront === undefined || !inCluster(q, c)) continue;
        const s = c.laterFront ? -1 : 1;
        const was = fixedSide.get(g);
        fixedSide.set(g, was === undefined || was === s ? s : 0);
      }
    });
    near.forEach((_, p) => {
      const g = find(p);
      const f = fixedSide.get(g);
      side[p] = f === undefined ? ((vote.get(g) ?? 0) >= 0 ? 1 : -1) : f;
    });
  }
  // Fliehkraft-Gewichte aus dem Tempo der jeweils letzten Lösung (Fallhöhe seit dem höchsten Punkt davor)
  for (let outer = 0; outer < 3; outer++) {
    let hMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = line[i].Y - C * z[i];
      hMax = Math.max(hMax, y);
      const v2 = Math.max(36, 2 * G * (hMax - y));
      // in einer Höhle hält die Bahn ihre Spur: die Kopplung der Tiefe an die Bildkrümmung (Fliehkraft) drückte sie dort
      // mit der Fallhöhe an die Wand
      wK[i] = KAPPA * (v2 / G) ** 2 * wMul[i] * (noRead[i] ? CAVE_K : 1 - (1 - CAVE_K) * caveBelowW[i]);
    }
    // Boden an der neuen Tiefe; die Schranken bilden sich in settle neu
    bounds();
    if (outer > 0) {
      for (let i = 0; i < n; i++) {
        magW[i] = 0;
        if (station(i)) continue;
        // nächste Spur, die Boden und Bühne zulassen
        let k = Math.round(z[i] / LANE_DEPTH);
        if (k * LANE_DEPTH > upper[i]) k = Math.floor(upper[i] / LANE_DEPTH);
        if (k * LANE_DEPTH < low[i]) k = Math.ceil(low[i] / LANE_DEPTH);
        const zl = k * LANE_DEPTH;
        const d = Math.abs(z[i] - zl);
        if (zl > upper[i] + 1e-9 || zl < low[i] - 1e-9 || d >= SNAP_RANGE) continue;
        magW[i] = SNAP_W * (1 - d / SNAP_RANGE) ** 2 * Math.min(1, wH[i]) * (1 - calm[i]) * straight[i];
        magZ[i] = zl;
      }
    }
    pins.clear();
    pinStation();
    settle(true);
  }
  // Wächter (Ebenen-Test): An den steilen Stellen einer Kehre (der Strich läuft auf dem Bild eher auf und ab) muss die
  // Tiefe KEHRE_APEX-mal so schnell laufen wie die wirkliche Höhe (Bild Y = Höhe + Tiefe · C), sonst dreht die Bahn dort
  // senkrecht wie ein halber Looping und fährt kopfüber (Florian 26.10.2026: Überkopffahrten nur im Looping; Loopings
  // haben keine Kehren). Wo nicht, wird die Neigung dort festgelegt und neu gelöst. Die Richtung je Kehre bleibt von
  // Vorschau zu Vorschau und beim Loslassen (KehreSide)
  const guardTip = new Uint8Array(n);
  /** Ziel-Neigung an einem Wächterpunkt für die Richtung der Kehre (an Spitzen mindestens die Trennung der Schenkel) */
  const guardNeed = (k: KehreSide, m: number) => {
    const dY = line[m + 1].Y - line[m - 1].Y;
    const e = k.dir * Math.sign(dY);
    const apex = (1.1 * KEHRE_APEX * Math.abs(dY)) / (1 + e * KEHRE_APEX * C);
    return k.dir * (guardTip[m] ? Math.max(apex, 0.55 * PASS_SIDE) : apex);
  };
  /** wie weit die Lösung die Ziel-Neigung einer Kehre erreicht (schlechtester Punkt, 1 = ganz), und ob davon schon etwas fest ist */
  const guardReach = (k: KehreSide) => {
    let worst = Infinity;
    let fixedPart = false;
    for (let m = Math.max(1, k.a - 1); m <= Math.min(n - 2, k.b + 1); m++) {
      if (!guardW[m]) continue;
      worst = Math.min(worst, (z[m + 1] - z[m - 1]) / guardT[m]);
      if (isFixed(m - 1) || isFixed(m + 1)) fixedPart = true;
    }
    return { worst, fixedPart };
  };
  const flipped = new Set<KehreSide>();
  for (let guard = 0; guard < 4 && kehren.length; guard++) {
    let added = 0;
    // Erreicht eine Kehre ihre Neigung nicht (Kreuzungen und Engstellen legen die Reihenfolge der Stränge fest), dreht sie
    // einmal in die andere Richtung, solange davon noch nichts fest gezeigt ist
    if (guard > 0) {
      for (const k of kehren) {
        const r = guardReach(k);
        if (r.worst >= 0.7 || r.fixedPart || flipped.has(k)) continue;
        flipped.add(k);
        k.dir = -k.dir;
        for (let m = Math.max(1, k.a - 1); m <= Math.min(n - 2, k.b + 1); m++) if (guardW[m]) guardT[m] = guardNeed(k, m);
        added++;
      }
    }
    for (const k of kehren) {
      for (let i = Math.max(2, k.a); i <= Math.min(n - 3, k.b); i++) {
        const dX = line[i + 1].X - line[i - 1].X;
        const dY = line[i + 1].Y - line[i - 1].Y;
        const dz = z[i + 1] - z[i - 1];
        const steep = Math.abs(dX) < Math.abs(dY) && Math.abs(dz) < KEHRE_APEX * Math.abs(dY - C * dz);
        // Spitze (die Richtung in x kehrt ohne senkrechten Punkt um, die Bahn dreht auf wenigen Metern): Dort trennt die
        // Tiefe die beiden Schenkel über ±2 m um PASS_SIDE, verteilt auf drei Punkte (auf einem knickte die Bahn)
        const tip = (line[i].X - line[i - 1].X) * (line[i + 1].X - line[i].X) < 0 && Math.abs(z[i + 2] - z[i - 2]) < PASS_SIDE;
        if (!steep && !tip) continue;
        if (!k.dir) {
          // Richtung, der Reihe nach: wie die Vorschau die Kehre schon fest gezeigt hat (sonst Zickzack von Bild zu Bild);
          // wie eine greifende Engstelle die Schenkel trennt (eine enge Kehre, deren Schenkel im Bild nah liegen: gegen sie
          // gewann mal das eine, mal das andere); sonst wohin die Tiefe läuft, außer das U würde dadurch viel höher (steile
          // Kamera), dann die Richtung, die ihm Höhe nimmt
          let shown = 0;
          for (let m = k.a + 1; m <= i; m++) if (isFixed(m) && isFixed(m - 1)) shown += z[m] - z[m - 1];
          let vote = 0;
          near.forEach((q, p) => {
            if (isHeld[p] && q.i <= k.a + 1 && q.j >= k.b - 1) vote += side[p];
          });
          k.dir = Math.abs(shown) > 0.2 ? Math.sign(shown) : vote ? Math.sign(vote) : Math.abs(dz) > 0.1 && KEHRE_APEX * C <= 1 / 3 ? Math.sign(dz) : Math.sign(dY) || 1;
        }
        for (const m of tip ? [i - 1, i, i + 1] : [i]) {
          if (guardW[m] || (isFixed(m - 1) && isFixed(m + 1))) continue;
          guardTip[m] = tip ? 1 : 0;
          guardT[m] = guardNeed(k, m);
          guardW[m] = KEHRE_GUARD_W;
          added++;
        }
      }
      if (k.dir) for (let i = k.a; i <= k.b; i++) guarded[i] = 1;
    }
    if (!added) break;
    pins.clear();
    pinStation();
    settle(true);
  }
  // Reste der Schranken-Federn abschneiden: nie unter den Boden, nie aus der Bühne (Festes bleibt genau)
  for (let i = 0; i < n; i++) z[i] = isFixed(i) ? fixed![i] : Math.min(upper[i], Math.max(low[i], z[i]));
  // Knoten-Toleranz: eng, wo zwei Stellen sich nahekommen (die Knoten dürfen den Abstand dort nicht auffressen)
  const tol = new Float64Array(n).fill(Infinity);
  for (const q of near) {
    const dz = z[q.j] - z[q.i];
    if (Math.hypot(line[q.j].X - line[q.i].X, dz) > PASS_SIDE + 0.6 && Math.abs(line[q.j].Y - line[q.i].Y - C * dz) > PASS_OVER + 0.6) continue;
    for (const c of [q.i, q.j]) for (let k = Math.max(0, c - 1); k <= Math.min(n - 1, c + 1); k++) tol[k] = TIGHT_TOL;
  }
  brushDebug.onSolve?.({ line, z, target, low, upper, noRead, wH, read });
  return { z, tol, blocked, cave: noRead, kehren };
}

/** Läufe (von, bis) der blockierten Linienpunkte */
function blockedRuns(blocked: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < blocked.length; i++) {
    if (!blocked[i]) continue;
    let j = i;
    while (j + 1 < blocked.length && blocked[j + 1]) j++;
    out.push([i, j]);
    i = j;
  }
  return out;
}

// ------------------------------------------------------------------ Bahn

/** Weltpunkte je Linienpunkt: x wie gezeichnet, Höhe = Bildhöhe − Tiefe · c (nie unter der halben Mindesthöhe) */
function worldPoints(line: StagePoint[], z: Float64Array, closed: boolean, o: Opts): Vec3[] {
  const pts = line.map((p, i) => {
    const lane = z[i] / LANE_DEPTH;
    const w = rayToWorld(p, lane);
    const g = o.ground(w.x, lane);
    // Mindesthöhe über der tragenden Fläche: über der Erde wie bisher; mit Freiraumfeld über dem, was unter dem Punkt
    // trägt (in einer Höhle ihr Boden), und wer in der Erde steckt, kommt auf die Oberfläche
    let base = g;
    if (o.field && !o.field.solid(w.x, w.y, lane)) base = o.field.floor(w.x, w.y, lane) ?? g;
    return { x: w.x, y: Math.max(w.y, base + o.clearance * 0.5), z: z[i] };
  });
  if (closed) pts[pts.length - 1] = { ...pts[0] };
  return pts;
}

/** Knoten aus den Weltpunkten: so wenige wie nötig (Scheitel-Knoten, siehe reduceNodes) */
export function pathFromPoints(pts: Vec3[], closed: boolean, tolAt?: ArrayLike<number>): TrackPath {
  const segs = reduceNodes(pts, [], { tolAt, even: true, closed }).segments;
  const mk = (p: Vec3) => createNode(p.x, p.y, p.z / LANE_DEPTH);
  const nodes = segs.map((seg, i) => {
    const nd = mk(seg.p0);
    nd.outX = seg.p1.x - seg.p0.x;
    nd.outY = seg.p1.y - seg.p0.y;
    nd.outZ = (seg.p1.z - seg.p0.z) / LANE_DEPTH;
    if (i > 0 || closed) {
      const prev = segs[(i - 1 + segs.length) % segs.length];
      nd.inX = prev.p2.x - prev.p3.x;
      nd.inY = prev.p2.y - prev.p3.y;
      nd.inZ = (prev.p2.z - prev.p3.z) / LANE_DEPTH;
    }
    return nd;
  });
  if (!closed && segs.length) {
    const last = segs[segs.length - 1];
    const end = mk(last.p3);
    end.inX = last.p2.x - last.p3.x;
    end.inY = last.p2.y - last.p3.y;
    end.inZ = (last.p2.z - last.p3.z) / LANE_DEPTH;
    nodes.push(end);
  }
  if (nodes.length) nodes[0].kind = 'station';
  return { ...emptyPath(), nodes, closed, brush: true };
}

function replan(plan: BrushPlan, o: Opts): void {
  const { z, tol, blocked, kehren } = solveDepth(plan.line, plan.closed, plan.crossings, plan.wH, plan.wMul, plan.lower, plan.calm, o, plan.fixed, plan.hold, plan.holdW, plan.flat, plan.ramps, plan.level, plan.kehren);
  plan.z = z;
  plan.kehren = kehren;
  plan.rock = blockedRuns(blocked);
  plan.pts = worldPoints(plan.line, plan.z, plan.closed, o);
  plan.path = pathFromPoints(plan.pts, plan.closed, tol);
}

/**
 * Gewichte der Tiefenwahl je Linienpunkt. An der Station zieht die Tiefe zur Tiefe der Station statt zur Wunschhöhe:
 * Die Bahn bleibt dort am Boden und folgt der Bildhöhe, bis der Strich steigt (sonst entstünde direkt nach der Station
 * ein kleiner Buckel, an dem der Kettenzug schon endet). Steil gezeichnet ist Höhe: Dort zieht die Wunschhöhe kaum
 * (unter 15° voll, ab 40° fast nicht); ein steiler Strich wird so ein Anstieg, statt erst nach hinten zu wandern und
 * dann umso steiler zu steigen.
 */
function depthWeights(line: StagePoint[], closed: boolean): { calm: Float64Array; wH: Float64Array; level: Float64Array } {
  const n = line.length;
  // Richtung der Linie über ±1 m (Bild) und Fahrtrichtung der Station in x
  const dir = (i: number) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b.X - a.X, b.Y - a.Y) || 1;
    return { x: (b.X - a.X) / d, y: (b.Y - a.Y) / d };
  };
  const ts = Math.sign(line[Math.min(n - 1, 4)].X - line[0].X) || 1;
  const calm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const fromStation = Math.min(i, closed ? n - 1 - i : Infinity) * STEP;
    calm[i] = 1 - Math.min(1, Math.max(0, (fromStation - STATION_CALM) / STATION_RAMP));
    // nur, wo die Linie in Stationsrichtung läuft: In einer Wende muss die Tiefe frei sein
    const w = Math.min(1, Math.max(0, (dir(i).x * ts - 0.05) / 0.3));
    calm[i] *= w * w * (3 - 2 * w);
  }
  // Scheitel von Wenden: deutliche Richtung in x davor und danach entgegengesetzt; Gewicht, je senkrechter die Linie
  const clear = (i: number) => {
    const x = dir(i).x;
    return Math.abs(x) > 0.4 ? Math.sign(x) : 0;
  };
  const level = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    let before = 0;
    let after = 0;
    for (let k = i; k >= Math.max(0, i - TURN_SPAN) && !before; k--) before = clear(k);
    for (let k = i; k <= Math.min(n - 1, i + TURN_SPAN) && !after; k++) after = clear(k);
    if (before * after < 0) level[i] = (1 - Math.abs(dir(i).x)) ** 2;
  }
  // sehr enge Wende: Die Richtung springt zwischen zwei Nachbarn direkt um (kein Punkt dazwischen ist unklar), dann ist der
  // senkrechtere der beiden der Scheitel (sonst blieb die Kehre unerkannt und die Bahn drehte im Bild kopfüber)
  for (let i = 0; i < n - 1; i++) {
    if (clear(i) * clear(i + 1) >= 0) continue;
    const k = Math.abs(dir(i).x) < Math.abs(dir(i + 1).x) ? i : i + 1;
    level[k] = Math.max(level[k], (1 - Math.abs(dir(k).x)) ** 2);
  }
  const wH = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 2)];
    const b = line[Math.min(n - 1, i + 2)];
    const angle = Math.atan2(Math.abs(b.Y - a.Y), Math.abs(b.X - a.X) + 1e-9);
    wH[i] = Math.max(STEEP_WH, Math.min(1, (STEEP_TO - angle) / (STEEP_TO - STEEP_FROM)));
    // an der Station hält die Tiefe fest (die Glättung der Tiefe zöge sie sonst schon zum Rest der Bahn)
    wH[i] = Math.max(wH[i], CALM_WH * calm[i]);
  }
  return { calm, wH, level };
}

/** feste Tiefe je Linienpunkt aus einer Tiefe je Meter vom Anfang (die letzten zwei bleiben frei: weicher Anschluss) */
function keptDepth(n: number, keepDepth?: ArrayLike<number>): Float64Array | null {
  if (!keepDepth || keepDepth.length < 3) return null;
  const fixed = new Float64Array(n).fill(NaN);
  for (let i = 0; i < Math.min(n - 2, keepDepth.length - 2); i++) fixed[i] = keepDepth[i];
  return fixed;
}

/**
 * Aus der gemalten Pinsellinie die Bahn: Linie aufbereiten, Kreuzungen, Tiefe, Knoten. null bei zu kurzem Strich.
 * keepDepth: Tiefe je Meter vom Anfang an, die bleibt (Fortsetzen: Die alte Bahn ändert sich nicht). shownPreview:
 * die zuletzt gezeigte Live-Vorschau; die Bahn hängt weich an ihrer Tiefe und übernimmt die Reihenfolge an ihren
 * Kreuzungen, damit beim Loslassen nichts springt.
 */
export function planBrushTrack(points: StagePoint[], options: BrushOptions = {}, keepDepth?: ArrayLike<number>, shownPreview?: BrushPreview | null): BrushPlan | null {
  const shown = shownPreview?.z;
  const o = withDefaults(options);
  const prep = prepareBrushLine(points, o.closeSnap, o.closeReach);
  if (!prep) return null;
  // Fang an einer Baustelle: das Ende gleitet über die letzten 6 m auf den Anschlusspunkt
  if (o.endSnap && !prep.closed) prep.line = blendInto(prep.line, null, { X: o.endSnap.X, Y: o.endSnap.Y }, 6);
  const n = prep.line.length;
  const { calm, wH, level } = depthWeights(prep.line, prep.closed);
  const crossings = findLineCrossings(prep.line, prep.closed);
  if (prep.closeFrom !== undefined) for (const c of crossings) if (c.j >= prep.closeFrom) c.natural = true;
  const elements = findElements(prep.line, crossings);
  const wMul = new Float64Array(n).fill(1);
  const flat = new Float64Array(n).fill(1);
  const ramps = applyElements(elements, wMul, flat, calm, level);
  // Spitze (Plan Paket 5, Freiraumfeld c): Was die Vorschau schon fest gezeigt hat (älter als PREVIEW_FREE vor dem Ende),
  // bleibt beim Loslassen genau so; nur der freie Teil wird neu gelöst. Bei einer Runde wird der Schluss neu gebaut und
  // die Linie am Ende verändert, dort hält die gezeigte Tiefe weiter nur weich
  let fixedAtRelease = keptDepth(n, keepDepth);
  if (shown && !prep.closed) {
    fixedAtRelease = fixedAtRelease ?? new Float64Array(n).fill(NaN);
    const free = o.depthAt ? SLICE_PREVIEW_FREE : PREVIEW_FREE;
    for (let i = 0; i < Math.min(n - free, shown.length - 3); i++) if (Number.isNaN(fixedAtRelease[i])) fixedAtRelease[i] = shown[i];
  }
  let hold: Float64Array | null = null;
  let holdW: Float64Array | null = null;
  if (shown && shown.length > 3) {
    hold = new Float64Array(n).fill(NaN);
    holdW = new Float64Array(n);
    for (let i = 0; i < Math.min(n, shown.length - 3); i++) {
      hold[i] = shown[i];
      // vor dem Rundenschluss ausblenden: das Ende muss in die Station
      holdW[i] = PREVIEW_HOLD * (prep.closed ? Math.min(1, (n - 1 - i) / RING_FADE) : 1) * (shownPreview?.cave?.[i] ? CAVE_HOLD : 1);
    }
  }
  if (o.depthAt) freeLoops(elements, n, fixedAtRelease, holdW, keepDepth ? keepDepth.length - 2 : 0, shownPreview?.crossings ?? []);
  const plan: BrushPlan = {
    drawn: prep.line.map((p) => ({ ...p })),
    line: prep.line,
    closed: prep.closed,
    crossings,
    z: new Float64Array(n),
    pts: [],
    path: emptyPath(),
    wH,
    calm,
    level,
    wMul,
    lower: new Float64Array(n).fill(-Infinity),
    fixed: fixedAtRelease,
    hold,
    holdW,
    flat,
    elements,
    ramps,
    rock: [],
    rockCut: false,
    kehren: shownPreview?.kehren ?? [],
  };
  keepOrder(plan.crossings, shownPreview?.crossings);
  replan(plan, o);
  if (plan.rock.length && !o.noCut) {
    // Fels ohne freie Seite: Die Bahn endet davor (Plan 5.1), der Rest des Strichs fällt weg
    brushDebug.onCut?.({ line: plan.line, z: plan.z, rock: plan.rock });
    const cut = plan.rock[0][0] - 1;
    if (cut >= 4) {
      const shorter = planBrushTrack(plan.line.slice(0, cut), { ...options, noCut: true }, keepDepth, shownPreview);
      if (shorter && shorter.path.nodes.length >= 2) {
        shorter.rockCut = true;
        return shorter;
      }
    }
  }
  return plan;
}

/**
 * Reihenfolge an einer Kreuzung tauschen (der vordere Strang geht nach hinten) und die Tiefe neu wählen. Die Tiefe der
 * Vorschau hält dann nicht mehr (sie hätte die alte Reihenfolge festgehalten). Danach am besten neu probefahren.
 */
export function swapCrossing(plan: BrushPlan, k: number, options: BrushOptions = {}): void {
  const c = plan.crossings[k];
  if (!c) return;
  c.laterFront = !c.laterFront;
  plan.hold = null;
  plan.holdW = null;
  replan(plan, withDefaults(options));
}

/** so viele Linienpunkte (je 1 m) am Ende bleiben in der Live-Vorschau frei; davor gilt die Tiefe der letzten Vorschau */
const PREVIEW_FREE = 45;
/**
 * Die Spitze (so viele Meter vor dem Finger) wählt ihre Tiefe frei; davor hängt die gezeigte Bahn im freien Teil weich an
 * der Tiefe der letzten Vorschau (Gewicht wächst bis PREVIEW_HOLD am festen Teil), damit sie beim Malen nicht wackelt
 * (Florians Leitsatz an Tor 2b). Schranken (Fels, Raum, Boden) bleiben hart
 */
const PREVIEW_TIP = 15;
/**
 * Gewicht, mit dem die fertige Bahn an der Tiefe der zuletzt gezeigten Vorschau hängt (so springt beim Loslassen
 * nichts). Wo die Probefahrten nachbessern, lockert es sich; vor dem Rundenschluss blendet es über RING_FADE m aus.
 */
const PREVIEW_HOLD = 20;
const RING_FADE = 40;

export interface BrushPreview {
  path: TrackPath;
  /** Tiefe je Linienpunkt, für die nächste Vorschau */
  z: Float64Array;
  /** Linienpunkte im Fels ohne freie Seite (rote Marken) */
  rock: StagePoint[];
  /** je Linienpunkt 1, wenn er in einer Höhle liegt (dort hält die nächste Vorschau die Tiefe nur schwach) */
  cave: Uint8Array;
  /** Kreuzungen mit der gewählten Reihenfolge (bleibt von Vorschau zu Vorschau und beim Loslassen gleich) */
  crossings: LineCrossing[];
  /** Ebenen-Test: Kehren mit der Richtung ihrer Tiefe (bleibt ebenso) */
  kehren?: KehreSide[];
}

/** Reihenfolge an Kreuzungen übernehmen, die es schon gab (Linienpunkte höchstens 3 auseinander) */
function keepOrder(crossings: LineCrossing[], from: LineCrossing[] | undefined): void {
  if (!from) return;
  for (const c of crossings) {
    const o = from.find((q) => q.laterFront !== undefined && Math.abs(q.i - c.i) <= 3 && Math.abs(q.j - c.j) <= 3);
    if (o) c.laterFront = o.laterFront;
  }
}

/**
 * Live-Vorschau beim Malen: dieselbe Tiefenwahl wie beim Loslassen, aber ruhig und schnell. Was mehr als PREVIEW_FREE
 * Meter vor dem Linienende liegt, behält die Tiefe der letzten Vorschau (dort bewegt sich nichts mehr), Engstellen
 * zählen nur, wo der freie Teil beteiligt ist, Knoten ohne Fit (alle 2,5 m), kein Rundenschluss (der kommt beim
 * Loslassen). keepDepth wie bei planBrushTrack.
 */
export function previewBrushTrack(points: StagePoint[], options: BrushOptions, prev: BrushPreview | null, keepDepth?: ArrayLike<number>): BrushPreview | null {
  const o = withDefaults(options);
  const prep = prepareBrushLine(points, -1);
  if (!prep) return null;
  const n = prep.line.length;
  const { calm, wH, level } = depthWeights(prep.line, false);
  const fixed = keptDepth(n, keepDepth) ?? new Float64Array(n).fill(NaN);
  // Ebenen-Test: früher halten und festlegen, damit die Bahn hinter der Spitze ruhig bleibt (Florian: „springt“)
  const free = o.depthAt ? SLICE_PREVIEW_FREE : PREVIEW_FREE;
  const tip = o.depthAt ? SLICE_PREVIEW_TIP : PREVIEW_TIP;
  if (prev) for (let i = 0; i < Math.min(n - free, prev.z.length - 3); i++) if (Number.isNaN(fixed[i])) fixed[i] = prev.z[i];
  let hold: Float64Array | null = null;
  let holdW: Float64Array | null = null;
  if (prev) {
    hold = new Float64Array(n).fill(NaN);
    holdW = new Float64Array(n);
    for (let i = 0; i < Math.min(n, prev.z.length - 3); i++) {
      const d = n - 1 - i;
      if (!Number.isNaN(fixed[i]) || d <= tip) continue;
      const w = Math.min(1, (d - tip) / (free - tip));
      hold[i] = prev.z[i];
      // in einer Höhle hält die gezeigte Tiefe nur schwach: dort zieht die Höhlenmitte, die erste Lösung klebte an der Wand
      holdW[i] = PREVIEW_HOLD * (o.depthAt ? SLICE_HOLD : 1) * w * w * (3 - 2 * w) * (prev.cave?.[i] ? CAVE_HOLD : 1);
    }
  }
  const crossings = findLineCrossings(prep.line, false);
  keepOrder(crossings, prev?.crossings);
  const wMul = new Float64Array(n).fill(1);
  const flat = new Float64Array(n).fill(1);
  const elements = findElements(prep.line, crossings);
  const ramps = applyElements(elements, wMul, flat, calm, level);
  if (o.depthAt) freeLoops(elements, n, fixed, holdW, keepDepth ? keepDepth.length - 2 : 0, prev?.crossings ?? []);
  const { z, blocked, cave, kehren } = solveDepth(prep.line, false, crossings, wH, wMul, new Float64Array(n).fill(-Infinity), calm, o, fixed, hold, holdW, flat, ramps, level, prev?.kehren ?? null);
  const nodes = previewNodes(worldPoints(prep.line, z, false, o), []);
  if (nodes.length) nodes[0].kind = 'station';
  const rock: StagePoint[] = [];
  for (let i = 0; i < n; i++) if (blocked[i]) rock.push(prep.line[i]);
  return { path: { ...emptyPath(), nodes, closed: false, brush: true }, z, crossings, rock, cave, kehren };
}

/** Anfang und Ende einer Linie weich auf zwei Punkte gleiten lassen (je über blend Bühnen-Meter) */
function blendInto(mid: StagePoint[], start: StagePoint | null, end: StagePoint | null, blend = 5): StagePoint[] {
  const n = mid.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(mid[i].X - mid[i - 1].X, mid[i].Y - mid[i - 1].Y));
  const total = cum[n - 1];
  const ds = start ? { X: start.X - mid[0].X, Y: start.Y - mid[0].Y } : null;
  const de = end ? { X: end.X - mid[n - 1].X, Y: end.Y - mid[n - 1].Y } : null;
  return mid.map((p, i) => {
    let X = p.X;
    let Y = p.Y;
    if (ds) {
      const f = Math.max(0, 1 - cum[i] / blend);
      X += ds.X * f;
      Y += ds.Y * f;
    }
    if (de) {
      const f = Math.max(0, 1 - (total - cum[i]) / blend);
      X += de.X * f;
      Y += de.Y * f;
    }
    return { X, Y };
  });
}

/** Fortsetzen: Die neue Linie schließt an das Ende der alten an (ihr Anfang gleitet auf das alte Ende) */
export function joinLines(base: StagePoint[], add: StagePoint[]): StagePoint[] {
  if (!base.length) return add;
  return [...base, ...blendInto(add, base[base.length - 1], null).slice(1)];
}

/**
 * Überzeichnen: Der neue Strich ersetzt die alte Linie zwischen der Stelle, an der er beginnt, und der, an der er
 * endet (gegen die Fahrtrichtung gezeichnet wird er umgedreht). Endet er nicht an der Linie (weiter als snap), geht
 * die Bahn ab seinem Anfang im neuen Strich weiter.
 */
export function spliceLine(base: StagePoint[], add: StagePoint[], snap: number): StagePoint[] {
  const nearest = (p: StagePoint) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < base.length; i++) {
      const d = Math.hypot(base[i].X - p.X, base[i].Y - p.Y);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return { i: bi, d: bd };
  };
  const a = nearest(add[0]);
  const b = nearest(add[add.length - 1]);
  if (b.d > snap) return joinLines(base.slice(0, a.i + 1), add);
  let from = a.i;
  let to = b.i;
  let mid = add;
  if (from > to) {
    [from, to] = [to, from];
    mid = [...add].reverse();
  }
  return [...base.slice(0, from + 1), ...blendInto(mid, base[from], base[to]).slice(1, -1), ...base.slice(to)];
}

/** Bildschirmlinie einer vorhandenen Bahn (Bühne, 1 m Abstand) mit der Tiefe je Punkt (Meter), zum Fortsetzen */
export function trackLineWithDepth(samples: TrackSamples): { line: StagePoint[]; z: Float64Array } {
  const line: StagePoint[] = [];
  const zs: number[] = [];
  if (!samples.count) return { line, z: new Float64Array(0) };
  const at = (i: number) => tagRay(toView(samples.x[i], samples.y[i], samples.z[i]));
  let prev = at(0);
  line.push(prev);
  zs.push(samples.z[0] * LANE_DEPTH);
  let carry = 0;
  for (let i = 1; i < samples.count; i++) {
    const cur = at(i);
    const d = Math.hypot(cur.X - prev.X, cur.Y - prev.Y);
    if (d < 1e-9) continue;
    let t = STEP - carry;
    while (t <= d) {
      const f = t / d;
      line.push(mixPoint(prev, cur, f));
      zs.push((samples.z[i - 1] + (samples.z[i] - samples.z[i - 1]) * f) * LANE_DEPTH);
      t += STEP;
    }
    carry = d - (t - STEP);
    prev = cur;
  }
  return { line, z: Float64Array.from(zs) };
}

/** Bildschirmlinie einer vorhandenen Bahn (Bühne, 1 m Abstand), zum Fortsetzen und Überzeichnen */
export function trackLine(samples: TrackSamples): StagePoint[] {
  const pts: StagePoint[] = [];
  for (let i = 0; i < samples.count; i++) pts.push(tagRay(toView(samples.x[i], samples.y[i], samples.z[i])));
  return pts.length >= 2 ? resampleLine(pts, STEP) : pts;
}

// ------------------------------------------------------------------ Probefahrten

/** was der Nachbesserer von einer Fahrt braucht (TrainSim erfüllt das) */
export interface ProbeSim {
  step(dt: number): void;
  readonly finished: boolean;
  readonly phase: string;
  readonly failReason: string | null;
  readonly cars: ReadonlyArray<{ s: number; gLat: number }>;
}
/** Probefahrt ohne Entgleis-Grenze (die Querkraft wird je Ort mitgeschrieben und hier bewertet) und ohne
 *  Kreuzungsprüfung (die macht der Nachbesserer am Ende selbst) */
export type ProbeFactory = (path: TrackPath, samples: TrackSamples) => ProbeSim;

export interface AcceptedSpot {
  /** Bogenlänge der Bahn */
  s: number;
  reason: string;
  /** Linienpunkt */
  f: number;
}

type Lever = 'soften' | 'flatten' | 'pushBack' | 'relax' | 'unramp';

/**
 * Nachbessern in Zeitscheiben: Tiefe lösen, Bahn bauen, Probefahrt; an der ersten Problemstelle einen Hebel
 * ansetzen und von vorn. Problemstellen: Querkraft über der Grenze, Fahrgäste fallen (kopfüber zu langsam),
 * Stillstand. Ein Hebel, der die Bahn auf langen Stücken verdreht (Wagen-Rahmen kippt) oder neue Kreuzungen auf
 * gleicher Höhe schafft, wird zurückgenommen.
 */
export class BrushRefiner {
  readonly accepted: AcceptedSpot[] = [];
  repaired = 0;
  steps = 0;
  private stage: 'build' | 'ride' | 'done' = 'build';
  private o: Opts;
  private sim: ProbeSim | null = null;
  private samples: TrackSamples | null = null;
  private lat = new Float64Array(0);
  /** Linienpunkt je Abtastpunkt der aktuellen Bahn (−1 = noch nicht gesucht) */
  private lineIdx = new Int32Array(0);
  /** Steuergrößen geändert: vor der nächsten Probefahrt neu planen */
  private dirty = false;
  private baseInverted = -1;
  /** Kreuzungen auf gleicher Höhe der ersten Bahn: Ein Hebel, der neue schafft, wird zurückgenommen */
  private baseCrossings = -1;
  private tries = new Map<number, number>();
  private snapshot: { lever: Lever; wH: Float64Array; wMul: Float64Array; lower: Float64Array; holdW: Float64Array | null; flat: Float64Array; ramps: Ramp[]; line: StagePoint[]; key: number; skipTo: number } | null = null;
  /** zuletzt gebaute Bahn, die die Probefahrt bestanden hat oder deren Problemstellen hingenommen sind */
  best: TrackPath;

  constructor(readonly plan: BrushPlan, options: BrushOptions, private probe: ProbeFactory, private latLimit: number, private maxSteps = 24) {
    this.o = withDefaults(options);
    this.best = plan.path;
  }

  get done(): boolean {
    return this.stage === 'done';
  }

  /** höchstens budgetMs arbeiten; true, wenn fertig */
  run(budgetMs: number): boolean {
    const t0 = performance.now();
    while (this.stage !== 'done' && performance.now() - t0 < budgetMs) {
      if (this.stage === 'build') this.build();
      else this.ride(t0, budgetMs);
    }
    return this.stage === 'done';
  }

  private inverted(s: TrackSamples): number {
    let k = 0;
    for (let i = 0; i < s.count; i++) if (s.upy[i] < 0.35) k++;
    return k / Math.max(1, s.count);
  }

  private build(): void {
    if (this.dirty) replan(this.plan, this.o);
    this.dirty = false;
    const samples = sampleTrack(this.plan.path, 0.25);
    const inv = this.inverted(samples);
    if (this.baseInverted < 0) this.baseInverted = inv;
    const cross = findCrossings(samples).length;
    if (this.baseCrossings < 0) this.baseCrossings = cross;
    // Ein gerader Hügel, der wieder nach hinten darf, ist die Bahn ohne Hügel-Erkennung: Verdrehte Stellen, die dabei
    // auftauchen (Haken über Kopf), hätte sie auch so gehabt. Sie werden ab da der Maßstab.
    const freed = this.snapshot?.lever === 'unramp';
    // die Tiefenwahl kann bei sehr ungleichen Gewichten numerisch scheitern: dann wie ein verdrehender Hebel
    const broken = !this.plan.z.every(Number.isFinite);
    if (this.snapshot && ((inv > this.baseInverted + 0.05 && !freed) || cross > this.baseCrossings || broken)) {
      // der Hebel hat die Bahn verdreht oder Stränge aufeinandergeschoben: zurücknehmen, an dieser Stelle ist er
      // verbraucht
      const s = this.snapshot;
      this.plan.wH = s.wH;
      this.plan.wMul = s.wMul;
      this.plan.lower = s.lower;
      this.plan.holdW = s.holdW;
      this.plan.flat = s.flat;
      this.plan.ramps = s.ramps;
      this.plan.line = s.line;
      this.tries.set(s.key, Math.max(this.tries.get(s.key) ?? 0, s.skipTo));
      this.repaired--;
      this.snapshot = null;
      this.dirty = true;
      return;
    }
    if (freed) this.baseInverted = Math.max(this.baseInverted, inv);
    this.snapshot = null;
    this.samples = samples;
    this.lat = new Float64Array(samples.count);
    this.lineIdx = new Int32Array(samples.count).fill(-1);
    this.sim = this.probe(this.plan.path, samples);
    this.stage = 'ride';
  }

  private ride(t0: number, budgetMs: number): void {
    const sim = this.sim!;
    const S = this.samples!;
    const L = S.length;
    while (!sim.finished && performance.now() - t0 < budgetMs) {
      for (let k = 0; k < 15 && !sim.finished; k++) {
        sim.step(1 / 60);
        for (const c of sim.cars) {
          const s = S.closed ? ((c.s % L) + L) % L : Math.max(0, Math.min(L, c.s));
          const i = Math.min(S.count - 1, Math.round(s / S.step));
          if (c.gLat > this.lat[i]) this.lat[i] = c.gLat;
        }
      }
      const prob = this.firstProblem(false);
      if (prob) {
        this.handle(prob);
        return;
      }
    }
    if (!sim.finished) return;
    const prob = this.firstProblem(true);
    if (prob) this.handle(prob);
    else this.finish();
  }

  /** erste Problemstelle: Querkraft über der Grenze (nicht hingenommen) oder Fehlschlag der Fahrt */
  private firstProblem(final: boolean): { idx: number; reason: string } | null {
    const S = this.samples!;
    for (let i = 0; i < S.count; i++) {
      if (this.lat[i] > this.latLimit && !this.isAccepted(this.lineIndex(i))) return { idx: i, reason: 'derail' };
    }
    if (!final) return null;
    const sim = this.sim!;
    if (sim.phase === 'failed' || sim.phase === 'flying') {
      const r = sim.failReason ?? 'fail';
      if (r === 'openEnd') return null;
      const L = S.length;
      const s0 = S.closed ? ((sim.cars[0].s % L) + L) % L : Math.max(0, Math.min(L, sim.cars[0].s));
      return { idx: Math.min(S.count - 1, Math.round(s0 / S.step)), reason: r };
    }
    return null;
  }

  private isAccepted(f: number): boolean {
    return this.accepted.some((a) => Math.abs(a.f - f) <= 20);
  }

  /** Linienpunkt, der einem Abtastpunkt der Bahn am nächsten liegt */
  private lineIndex(sampleIdx: number): number {
    const cached = this.lineIdx[sampleIdx];
    if (cached >= 0) return cached;
    const S = this.samples!;
    const q = { x: S.x[sampleIdx], y: S.y[sampleIdx], z: S.z[sampleIdx] * LANE_DEPTH };
    let best = 0;
    let bd = Infinity;
    const pts = this.plan.pts;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - q.x) ** 2 + (pts[i].y - q.y) ** 2 + (pts[i].z - q.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.lineIdx[sampleIdx] = best;
    return best;
  }

  private handle(prob: { idx: number; reason: string }): void {
    const f = this.lineIndex(prob.idx);
    const key = Math.round(f / 12);
    const k = (this.tries.get(key) ?? 0) + 1;
    this.tries.set(key, k);
    const lever = this.pickLever(prob.reason, k, f);
    if (!lever || this.steps >= this.maxSteps) {
      // liegt am Strich: hinnehmen. Bei Querkraft fährt die Probefahrt weiter, sonst endet sie hier.
      this.accepted.push({ s: this.samples!.s[prob.idx], reason: prob.reason, f });
      if (this.steps >= this.maxSteps || prob.reason !== 'derail') this.finish();
      return;
    }
    const p = this.plan;
    this.snapshot = { lever, wH: Float64Array.from(p.wH), wMul: Float64Array.from(p.wMul), lower: Float64Array.from(p.lower), holdW: p.holdW ? Float64Array.from(p.holdW) : null, flat: Float64Array.from(p.flat), ramps: p.ramps.slice(), line: p.line.map((q) => ({ ...q })), key, skipTo: lever === 'unramp' ? 1 : lever === 'soften' || lever === 'flatten' ? 3 : 6 };
    this.apply(lever, f);
    this.repaired++;
    this.steps++;
    this.dirty = true;
    this.stage = 'build';
  }

  /** gerader Hügel, den der Zug an Linienpunkt f hinauffährt (Index in plan.ramps, −1 = keiner) */
  private hillAt(f: number): number {
    const p = this.plan;
    return p.ramps.findIndex((r) => p.elements.hills.some((h) => h.a === r.a && h.b === r.b) && f >= r.a - 10 && f <= r.b);
  }

  private pickLever(reason: string, k: number, f = -1): Lever | null {
    // im Looping hilft kein Hebel, ohne ihn plattzudrücken: Er bleibt, wie gezeichnet (zu langsam ist Spiel)
    if (this.plan.elements.loops.some((l) => l.vertical && f >= l.i - 4 && f <= l.j + 4)) return null;
    // Ebenen-Test: Die Tiefe kommt aus den Scheiben und bleibt, wie gezeigt. „Kuppe nach hinten“ und „Fliehkraft über die
    // Tiefe“ verschoben sie nach dem Loslassen um bis zu 19 m und machten enge Zacken; hier rundet nur die Linie
    if (this.o.depthAt) return reason === 'derail' ? (k <= 4 ? 'relax' : null) : reason === 'fall' ? (k <= 3 ? 'flatten' : null) : null;
    // gerade nur, wenn es passt: Kommt der Zug nicht hinauf, darf der Hügel zuerst wieder nach hinten
    if (reason === 'stall') return k === 1 && this.hillAt(f) >= 0 ? 'unramp' : k <= 5 ? 'pushBack' : null;
    if (reason === 'fall') return k <= 3 ? 'flatten' : k <= 6 ? 'relax' : null;
    if (reason === 'derail') return k <= 4 ? 'soften' : k <= 7 ? 'relax' : null;
    return null;
  }

  private apply(lever: Lever, f: number): void {
    const p = this.plan;
    const n = p.line.length;
    const loops = p.elements.loops.filter((l) => l.vertical);
    const range = (half: number, fn: (i: number) => void) => {
      for (let i = Math.max(1, f - half); i <= Math.min(n - 2, f + half); i++) if (!loops.some((l) => i >= l.i - 4 && i <= l.j + 4)) fn(i);
    };
    // wo nachgebessert wird, hängt die Bahn nicht mehr an der Vorschau
    if (p.holdW) range(40, (i) => (p.holdW![i] = 0));
    if (lever === 'soften') {
      // Fliehkraft hier stärker gewichten und die Wunschhöhe lockern: die Tiefe darf die Kurve weiten
      range(25, (i) => {
        p.wMul[i] = Math.min(p.wMul[i] * 8, 1000);
        p.wH[i] = Math.max(0.05, p.wH[i] * 0.3);
      });
    } else if (lever === 'flatten') {
      // kopfüber zu langsam: Höhe halten (Tiefe folgt der Bildhöhe), aus dem Looping wird eine flache Kurve
      range(30, (i) => {
        p.wH[i] = Math.min(400, p.wH[i] * 8);
        p.wMul[i] *= 0.2;
      });
    } else if (lever === 'unramp') {
      const r = p.ramps[this.hillAt(f)];
      p.ramps = p.ramps.filter((q) => q !== r);
      for (let i = r.a; i <= r.b; i++) {
        p.wMul[i] /= 0.3;
        p.flat[i] = 1;
      }
    } else if (lever === 'pushBack') {
      // Zug bleibt hängen: die Kuppe davor nach hinten legen (= tiefer)
      let crest = f;
      for (let i = f; i < Math.min(n - 1, f + 50); i++) if (p.pts[i].y > p.pts[crest].y) crest = i;
      for (let i = Math.max(1, crest - 14); i <= Math.min(n - 2, crest + 14); i++) p.lower[i] = Math.max(p.lower[i], p.z[i] + 3);
    } else {
      p.line = relaxLine(p.line, p.drawn, f, 18, this.o.tolerance);
    }
  }

  private finish(): void {
    this.stage = 'done';
    this.best = this.plan.path;
    this.sim = null;
    // Kreuzungen auf gleicher Höhe, die die Tiefe nicht trennen konnte (Knäuel aus vielen Strängen): Dort endet die
    // Fahrt. Die Probefahrten fahren durch, damit die Stellen dahinter auch nachgebessert werden.
    const S = this.samples;
    if (S) for (const c of findCrossings(S)) this.accepted.push({ s: c.s1, reason: 'crossing', f: this.lineIndex(Math.min(S.count - 1, Math.round(c.s1 / S.step))) });
  }
}

/**
 * Linie an einer engen Stelle runder ziehen: geglättete Linie mit Kosinus-Fenster eingeblendet, als Ganzes so weit
 * skaliert, dass kein Punkt mehr als tol von der gezeichneten Linie abweicht (keine Dellen an den Fenstergrenzen).
 */
function relaxLine(line: StagePoint[], drawn: StagePoint[], f: number, half: number, tol: number): StagePoint[] {
  const n = line.length;
  const a = Math.max(1, f - half);
  const b = Math.min(n - 2, f + half);
  const upd: Array<{ i: number; dx: number; dy: number }> = [];
  for (let i = a; i <= b; i++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -9; k <= 9; k++) {
      const q = line[Math.max(0, Math.min(n - 1, i + k))];
      const w = Math.exp(-(k * k) / 18);
      sx += q.X * w;
      sy += q.Y * w;
      sw += w;
    }
    const w = 0.5 * (1 + Math.cos((Math.PI * (i - f)) / (half + 1)));
    upd.push({ i, dx: (sx / sw - line[i].X) * w, dy: (sy / sw - line[i].Y) * w });
  }
  const ok = (t: number) => upd.every((u) => Math.hypot(line[u.i].X + t * u.dx - drawn[u.i].X, line[u.i].Y + t * u.dy - drawn[u.i].Y) <= tol + 1e-9);
  let lo = 0;
  let hi = 1;
  if (ok(1)) lo = 1;
  else {
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2;
      if (ok(m)) lo = m;
      else hi = m;
    }
  }
  const out = line.map((p) => ({ ...p }));
  for (const u of upd) out[u.i] = { X: line[u.i].X + lo * u.dx, Y: line[u.i].Y + lo * u.dy };
  return out;
}
