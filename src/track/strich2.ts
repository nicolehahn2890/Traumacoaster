/**
 * Pinsel-Studie (28.10.2026): Prototyp „Strich 2“ hinter dem Schalter `&strich=2` (docs/PINSEL-STUDIE.md, Abschnitt 6).
 * Der heutige Pinsel (brushTrack.ts) bleibt unverändert; dieser Strich liest dieselben Ebenen-Abfragen (BrushOptions:
 * depthAt, groundAt, field), entscheidet aber anders:
 *
 *  - **Kausal mit kurzem Vorlauf:** Die Tiefe eines Linienpunkts wird gelöst, solange er höchstens FREEZE Meter hinter
 *    der Spitze liegt; danach ist sie fest und ändert sich nie mehr, weder bei der nächsten Vorschau noch beim Loslassen
 *    noch durch Probefahrten. Der Sprung beim Loslassen ist damit null, die Linie im Bild bleibt genau der Strich.
 *    Der Vorlauf wächst, solange der Strich steil ist (Florians „der schwarze Strich wird länger“): Ein steiles Stück
 *    ist erst Höhe oder Tiefe, wenn es sich erklärt hat, als Hügel (wieder flach, ohne Umkehr: die Tiefe läuft gerade von
 *    Fuß zu Fuß) oder als Kehre (die Bildrichtung in x kehrt um: ein Halbkreis durch die Tiefe, nach oben gezeichnet nach
 *    hinten). Erst dann friert das Stück ein.
 *  - **Konstante Arbeit je Vorschau:** Nur das freie Stück (FREEZE Meter plus BORDER feste Punkte als Rand) wird gelöst;
 *    die Abfragen an Ebenen und Freiraumfeld sind je Punkt gemerkt. Die Linie selbst wächst nur am Ende (Abtastung
 *    0,25 m, Gauß 0,5 m, 1-m-Punkte), was weiter als das Glättungsfenster zurückliegt, wird nicht neu gerechnet.
 *  - **Einfacher Löser:** min Σ w·(z − Ziel)² + λ·Σ(Δ²z)² + Σ wL·(Δz − ΔY/c)² an Wenden, mit Schranken aus dem Freiraum
 *    (Flächen der Ebenen) und aus Kreuzungen mit dem schon festen Teil, als kleines dichtes System (Cholesky) mit
 *    aktiver Menge. Die Lesung ist „Ebenen: Bodenhöhe“ wie beim heutigen Pinsel: Bild-Y ist die Tiefe, in der der
 *    Strich GROUND_COMFORT über einer Ebenenkante liegt, steil wie flach (Florian, 28.10. abends: Strich 2 malte „in den
 *    Boden und kaum in die Tiefe“, als Steiles noch Höhe war); flach Gezeichnetes landet auf Kanten, kurze Hügel bleiben
 *    Höhe (gerade von Fuß zu Fuß), Kehren ein Halbkreis durch die Tiefe; an einer Wende nimmt die Tiefe die Bildbewegung,
 *    damit die Bahn dort flach bleibt. Der freie Abschnitt je Punkt ist der dem Ziel nächste (mit Vorzug für den, in dem
 *    die Tiefe schon ist), nicht der, der am vorigen anschließt: Sonst sperrte jede Kante, unter die der Strich läuft,
 *    als „Fels“ die Tiefe, statt dass die Bahn vor die Ebene kommt.
 *  - **Knoten so wenige wie nötig** (reduceNodes wie beim heutigen Pinsel: kubische Segmente in der Toleranz 0,3–1,2 m,
 *    gleichmäßig verteilt; eng an Kreuzungen). Segmente, deren Punkte fest sind, bleiben samt Knoten; je Vorschau wird
 *    nur das Stück ab dem letzten festen Segment neu gefittet (Florian 28.10.: „nur die allernötigsten Punkte“, „wie
 *    bei Strich 1 geglättet“).
 *  - **Rundenschluss** nur als neuer Weg ab dem festen Ende (Dubins-Bögen aus brushTrack), der gezeichnete Teil bleibt.
 *
 * Platzhalter (nur im Bericht als Entwurf): Tunnel-Lippen, Höhlenmeter, Markierungen im Editor, Stützenvarianten,
 * Überzeichnen, Kreuzungs-Chips, Fels-Abschneiden (blockierte Punkte werden nur markiert).
 */
import type { Vec3 } from '@/core/math3';
import type { FreeLanes } from '@/zone/field';
import { dubinsPaths, type BrushOptions, type BrushPreview, type Landing } from './brushTrack';

/**
 * Vorschau von Strich 2: wie BrushPreview, dazu die Linie (1-m-Punkte, Bühne) je Tiefe, die Zahl der festen
 * Linienpunkte (die Bahn der Vorschau endet dort, wenn der Vorlauf abgeschnitten ist) und der Weltpunkt des letzten festen
 * (dort setzt die Tinte an)
 */
export type Strich2Preview = BrushPreview & { line: StagePoint[]; frozen: number; frozenWorld: Vec3 | null };
import type { CubicSegment3 } from '@/core/bezierFit3';
import { createNode, emptyPath, type TrackNode, type TrackPath } from './model';
import { reduceNodes } from './reduceNodes';
import { LANE_DEPTH, LANE_MAX, LANE_MIN, TILT_TAN, mixPoint, rayToWorld, toView, zAtHeight, type StagePoint } from './stage';

/** so weit (m) hinter der Spitze ist die Tiefe noch frei; davor fest */
export const FREEZE = 12;
/**
 * Dynamischer Vorlauf (Florian 29.10.: „je kürzer, desto besser das Zeichengefühl, und immer so lang, wie es nötig ist“):
 * Wo nichts zu entscheiden ist (keine steile Stelle, keine Richtungsumkehr, kein anderer Strang in Reichweite in den
 * letzten FREEZE Metern), wird schon LOOK_SHORT Meter hinter der Spitze fest; ist ein anderer Strang in Reichweite,
 * LOOK_BASE; bei steilem Stück oder Umkehr der volle Vorlauf FREEZE (&vorlaufm). Die ersten Meter eines Strichs sind
 * auf die Starttiefe gepinnt, darum folgen die Schienen dort sofort (Platzhalter 3 und 6 m, 29.10.)
 */
const LOOK_SHORT = 3;
const LOOK_BASE = 6;
/** so nah (m) muss die Tiefe eines freien Punkts an seinem Ziel sein, damit der kurze Vorlauf gilt */
const LOOK_SETTLED = 0.5;
/** so viele neue Linienmeter braucht eine Vorschau (vorher 6: die Schienen kamen am Strichanfang spät) */
const MIN_LINE = 3;
/** so viele feste Punkte nimmt der Löser als Rand mit (Lage, Neigung und Krümmung schließen stetig an) */
const BORDER = 3;
const STEP = 1;
const FINE = 0.25;
const SIGMA = 0.5;
/** Glättungsfenster der Linie in feinen Punkten (3σ) */
const SMOOTH_R = Math.ceil((3 * SIGMA) / FINE);
/**
 * Knoten-Toleranz an Kreuzungen: Zwei Stränge dürfen sich durch den Fit nicht näher kommen als die Kreuzungsregel
 * erlaubt. Je Paar ist der Spielraum max(seitlich − PASS_SIDE, in der Höhe − PASS_OVER); die Toleranz beider Stellen ist
 * die Hälfte davon, mindestens TOL_NEAR (wie TIGHT_TOL im heutigen Pinsel), ab 2·TOL_LOOSE Spielraum gilt die normale
 * Toleranz. Der spätere Strang misst dabei an den festen Schienen des früheren (sein Fit darf bis TOL_LOOSE von der
 * Linie abliegen), nicht an dessen Linienpunkten.
 */
/**
 * 0,3 statt 0,12 (29.10.): Die Fahrt zählt erst unter 1 m seitlichem Abstand eine Kreuzung; zwei Stränge mit PASS_SIDE
 * 2,2 m Abstand und je 0,3 m Fit-Abweichung behalten 1,6 m. In der Höhe gilt PASS_OVER 3,8 = 3,2 (Durchfahrt) + 2 · 0,3
 */
const TOL_NEAR = 0.3;
const TOL_LOOSE = 1.2;
/**
 * Vorgabe: ein Segment wird fest, wenn so viele Linienpunkte (m) hinter seinem Ende schon fest sind. Mindestens 2 (die
 * Tangente ±1 m bleibt gleich); je größer, desto länger darf das Stück davor noch neu gefittet werden (weniger Knoten,
 * dafür „atmen“ die Schienen in diesem Stück noch in der Toleranz). Schalter &fest=N
 */
export const FIX_BEHIND = 2;
/**
 * Ein Segment, das über die feste Grenze hinaus bis in den Vorlauf reicht, wird am festen Ende geteilt und sein vorderer
 * Teil fest, sobald der feste Teil so viele Meter lang ist: Die Schienen weiter hinten stehen still, ohne dass der Fit
 * dort je Vorschau ein kurzes Segment abschneiden muss (Platzhalter, 29.10.)
 */
const FIX_SPAN = 30;
/** Überzeichnen: über so viele Pinsel-Meter gleitet das Ende des Strichs auf den Zielpunkt auf der alten Bahn */
const GLUE = 5;
/**
 * Knoten-Fit von Strich 2 zum Ausprobieren (Florian 29.10.: „die weißen Bearbeitungspunkte sollten wirklich nur da
 * liegen, wo sie nötig sind“): Faktor auf die Toleranz (0,3 m in engen Kurven, 1,2 m auf Geraden), Gleichverteilung
 * an oder aus, längstes Segment in Metern und größte Drehung je Segment in Grad. Im Spiel &tol=2&even=0&span=90&turn=120,
 * in der Messung --tol 2 --even 0 --span 90 --turn 120. Gemessen auf Florians 21 Strichen (29.10.): die Toleranz ändert
 * die Knotenzahl nicht (48 → 48, die Schleifen des Strichs brauchen ihre Segmente), 150 m / 180° gibt 44 statt 48 bei
 * gleicher Abweichung; das ist jetzt die Vorgabe (vorher 90 m / 120°, wie beim bisherigen Pinsel).
 */
export const FIT_TUNING = { tolScale: 1, even: true, evenSpan: 150, evenTurn: 180 };
/** Grenzwellenlänge (m) der Tiefenglättung; kürzer als beim heutigen Pinsel (40 m), weil die Ebenen Terrassen von 10–20 m haben */
const CUTOFF = 20;
const LAMBDA = (CUTOFF / (2 * Math.PI)) ** 4;
/** Strafe auf die Neigung der Tiefe (je Meter), damit Stufen der Ebenen zu Rampen unter MAX_SLOPE werden */
const MU = 40;
/** steil: Gewicht der Wunschtiefe unter dieser Schwelle (rund 25°) */
const STEEP_LIMIT = 0.5;
/** so viele flache Punkte nach einem steilen Lauf erklären ihn (Hügel); so viele klare Punkte nach dem Scheitel eine Kehre */
const RESOLVE_RUN = 3;
/** Kehre: Tiefe mindestens PASS_SIDE + 0,4 (die Schenkel müssen aneinander vorbei), höchstens drei Spuren, sonst die doppelte Weite des U im Bild */
const KEHRE_MIN = PASS_SIDE_CONST();
const KEHRE_MAX_LANES = 3;
function PASS_SIDE_CONST(): number {
  return 2.6;
}
/** längster Vorlauf (Punkte): ein steiles Stück, das sich so lange nicht erklärt, friert trotzdem ein (als Höhe) */
const FREEZE_MAX = 90;
/**
 * Einstellbar für die Messung (&freezemax, --freezemax): ab dieser Länge bleibt ein offenes steiles Stück Höhe und wird
 * fest; LOOK_START: so viele Meter nach dem Anschluss an die alte Bahn (oder die ersten STATION_CALM Meter eines neuen
 * Strichs) dürfen auch in einem offenen steilen Stück fest werden, ihre Tiefe ist durch den Anschluss ohnehin festgelegt
 * (Florian 30.10.: „Es dauert sehr lange, bis die Bahn am Anfang meinem Strich folgt“; gemessen: erste Schienen erst
 * nach 16 Linienmetern, weil seine Striche steil beginnen)
 */
export const LOOK_TUNING = { freezeMax: FREEZE_MAX, lookStart: 6 };
/** Gewicht der Wunschtiefe: flach gelandet, in einer Höhle, Bodenhöhe der Ebenen; ohne Lesung fast nichts */
const W_LAND = 2;
const W_CAVE = 4;
const W_GROUND = 1;
const STEEP_FROM = (15 * Math.PI) / 180;
const STEEP_TO = (40 * Math.PI) / 180;
const STEEP_W = 0.03;
/**
 * Abschnittswahl: der Abschnitt, in dem die Tiefe schon ist, bleibt, bis das Ziel so viel (Spuren) näher an einem anderen
 * liegt; ein Abschnitt weiter als HOP_MAX Spuren vom Ziel ist keine Lesung mehr (Fels)
 */
const HOP = 0.25;
const HOP_MAX = 1.2;
/** flacher als das (Bildhöhe je Bildbreite) landet der Strich auf einer Kante */
const LAND_SLOPE = 0.25;
/** so viele Meter am Stück auf derselben Kante, bis die Landung voll zieht */
const LAND_RUN = 4;
/** Wenden: Gewicht, mit dem die Tiefe am Scheitel die Bildbewegung nimmt, und wie weit (Punkte) die Richtung gesucht wird */
const W_LEVEL = 400;
const TURN_SPAN = 12;
/** Kreuzungsregel wie in brushTrack: seitlich mindestens PASS_SIDE auseinander oder in der Höhe PASS_OVER */
const PASS_SIDE = 2.2;
const PASS_OVER = 3.8;
const NEIGHBOR = 8;
/** Abfrage-Cache: so nah (Bühnen-Meter) darf ein neu entstandener Linienpunkt am gemerkten liegen, um dessen Abfragen zu übernehmen */
const QUERY_REUSE = 0.3;
/**
 * Kreuzungen (Florian 29.10.: „Stränge um ganze Spuren trennen, wo Platz ist“, „es sollte so gut wie keine Kreuzungen
 * geben“). Der kleine Versatz (seitlich PASS_SIDE oder in der Höhe PASS_OVER) gilt für jeden früheren Punkt, der im Bild
 * nah ist, in einem Fenster von ±XWIN Metern in x: So können sich die Tiefenkurven nicht wenige Meter neben der
 * Bildkreuzung schneiden (Diagnose 29.10.: bei 26 von 43 Kreuzungen auf gleicher Höhe war die Linie an der Stelle selbst
 * getrennt). Liegt der frühere Punkt noch im Vorlauf (seine Tiefe ändert sich mit), wird zweimal gelöst. Eine ganze Spur
 * (LANE_DEPTH) gibt es nur an sauberen Kreuzungen: mehr als LOOP_ARC Meter auseinander auf dem Strich (keine Schleife des
 * Strichs selbst), die Stränge kreuzen sich im Bild schräg (Sinus des Winkels über CROSS_SIN) und der freie Raum hat
 * Platz. Nahe parallel laufende Stränge und Schleifen behalten den kleinen Versatz: Mit der Spur für alle nahen Paare
 * wurde die Bahn auf Florians 21 Strichen wilder (Knicke 127 → 142, Tiefenspanne 20 → 28 m) und kreuzte öfter (20 → 26)
 */
const XWIN = 6;
const LOOP_ARC = 40;
const CROSS_SIN = Math.sin((30 * Math.PI) / 180);
/**
 * Gezeichnete Schleifen (Paket 3; Florian 30.10.: „gezeichnete Schleifen als gewollte Loopings mit Mindestradius 4 m,
 * der Rest flach“). Kreuzt die Linie sich selbst und dreht sie dazwischen mindestens LOOP_TURN (Bogen LOOP_MIN_ARC bis
 * LOOP_MAX_ARC Meter), ist das eine Schleife. Hoch gezeichnet (Höhe ≥ aspect · Breite; eine senkrechte Kreisbahn ist im
 * Bild rund, eine waagerechte bei 26,6° Neigung eine Ellipse mit 0,45) ist sie ein **Looping**: Die Tiefe bleibt durch die
 * Schleife die der Einfahrt (die Kreuzungsregel versetzt die Ausfahrt um PASS_SIDE), die Form im Bild wird die Form in
 * der Höhe; ist ihr Radius kleiner als minR, wird die Bahn um die Schleifenmitte aufgeweitet, die Tinte bleibt. Flach
 * gezeichnet ist sie eine **Bodenschleife**: Die Höhe bleibt, die Bildbewegung wird Tiefe. In einer Schleife gilt keine
 * Hügel- oder Kehren-Lesung, ihre eigene Kreuzung bekommt keine ganze Spur, und sie friert als Ganzes ein, sobald sie
 * sich schließt. Eine Kehre gilt erst als gelesen, wenn ihr zweiter Schenkel wieder auf der Höhe des Fußes ist: vorher
 * kann sie noch eine Schleife werden (die Ausfahrt kreuzt die Einfahrt), und ihre Tiefe darf nicht als Halbkreis fest werden.
 */
const LOOP_MIN_ARC = 12;
const LOOP_MAX_ARC = 160;
const LOOP_TURN = (200 * Math.PI) / 180;
/**
 * so wenig (rad) darf der zweite Schenkel einer Kehre über die letzten RESOLVE_RUN Linienstücke drehen, damit er als
 * gerade gilt: ein Kreisbogen mit 7 m Radius dreht auf 3 m rund 25°, Florians Kringel (Radius 3 bis 4,5 m) deutlich mehr
 */
const KEHRE_STRAIGHT = (15 * Math.PI) / 180;
/** Aufweitung läuft über so viele Punkte vor und hinter der Schleife an und aus (Anschluss an die Tinte) */
const LOOP_BLEND = 6;
/** Gewicht des Schleifenziels: stärker als Landung und Hügel, damit die Tiefe gegen die Glättung durch die Schleife hält */
const W_LOOP = 8;
/** on: Schleifen lesen (Vorgabe; &schleifen=0 / --schleifen 0 für den Stand vor Paket 3, siehe Studie 16e) */
export const LOOP_TUNING = { on: true, aspect: 0.7, minR: 4 };
/** an der Station bleibt die Tiefe so lange (m) die der Station */
const STATION_CALM = 12;
/** Schranken-Feder (Vielfaches der größten Diagonale) */
const PIN_K = 1e3;
/** Rundenschluss: Bogenradien (m), gerade Einfahrt (m) und höchste Drehung (Grad) */
const CLOSE_RADII = [6, 10, 16];
const CLOSE_ENTRY = 3;
const CLOSE_TURN = 240;

type Pose = { X: number; Y: number; th: number };

export interface Strich2Result {
  path: TrackPath;
  line: StagePoint[];
  z: Float64Array;
  pts: Vec3[];
  closed: boolean;
  /** Läufe blockierter Linienpunkte (kein freier Abschnitt, der an den vorigen anschließt) */
  rock: Array<[number, number]>;
}

/** Ziel beim Loslassen (Überzeichnen): der Strich endet genau hier, in dieser Tiefe (Meter) und mit dieser Einheitsrichtung */
export interface Strich2End {
  p: StagePoint;
  z: number;
  tangent: Vec3;
}

export interface Strich2Stats {
  /** Linienpunkte gesamt und davon fest */
  n: number;
  frozen: number;
  /** Dauer der letzten Vorschau (ms) und darin die Abfragen an Ebenen und Feld, der Löser (mit Kreuzungsschranken), die Kreuzungsschranken allein, der Knoten-Fit */
  ms: number;
  queryMs: number;
  solveMs: number;
  crossMs: number;
  fitMs: number;
  /** Punkte, deren Kreuzungsschranken sich auch mit einheitlicher Seite widersprachen (kein Platz) */
  conflicts: number;
  /** erkannte Schleifen: Loopings (davon aufgeweitet) und Bodenschleifen; Punkte, die die Kettenlinie nicht halten konnte */
  loops: number;
  loopsWidened: number;
  loopsFlat: number;
  capped: number;
}

/** gezeichnete Schleife: Linienpunkte der Kreuzung (Einfahrt i, Ausfahrt j), Looping oder Bodenschleife, Radius und Mitte im Bild, Aufweitung */
interface Loop {
  i: number;
  j: number;
  vertical: boolean;
  r: number;
  cx: number;
  cy: number;
  scale: number;
}

/** steiler Lauf mit Lesung: Füße a und b (−1 offen), Scheitel (Punkt mit der kleinsten Richtung in x); Kehre: turn = drei Punkte hinter der Umkehr (bis dorthin läuft die Tiefe) */
interface Shape {
  a: number;
  b: number;
  kind: 'hill' | 'kehre' | 'open' | 'loop';
  apex: number;
  turn: number;
}

/** je Linienpunkt gemerkt: Abfragen und Lösung */
interface Pt {
  p: StagePoint;
  land: Landing | number | null;
  ground: number;
  lanes: FreeLanes | null;
  /** 1 flach gezeichnet (Landung erlaubt), Steilheit als Gewicht */
  flat: boolean;
  wh: number;
  /** Lauf gelandeter Punkte auf derselben Kante bis hierher (Meter) */
  run: number;
  /** Richtung der Linie in x (−1 … 1) */
  dirX: number;
  z: number;
  frozen: boolean;
  blocked: boolean;
  cave: boolean;
  /** hat eine Kreuzungsschranke bekommen: Knoten dort eng (die Bahn darf den Abstand nicht auffressen) */
  near: boolean;
  /** Ebenen und Feld schon abgefragt (ein Linienpunkt bewegt sich nicht mehr, sobald er endgültig ist; nur vorläufige Punkte entstehen je Vorschau neu) */
  queried: boolean;
  /** Bühnenlage des Schienenpunkts (einmal berechnet, für die Kreuzungssuche) */
  railStage: StagePoint | null;
  /** Schienenpunkt (Welt) des festen Segments an dieser Stelle; null: Linienpunkt gilt */
  rail: Vec3 | null;
  /** Weltpunkt mit Hub über die tragende Fläche (gilt für die Tiefe wpLane) */
  wp: Vec3 | null;
  wpLane: number;
  /** Bahnpunkt im Bild, wenn er vom Linienpunkt abweicht (aufgeweitete Schleife); die Tinte bleibt p */
  pt: StagePoint | null;
  /** die Kettenlinie war auch in der tiefsten erlaubten Tiefe nicht zu halten */
  capped: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** kleines dichtes symmetrisches System lösen (Cholesky mit etwas Regularisierung) */
/**
 * Symmetrisches, positiv definites Gleichungssystem mit Bandbreite BAND lösen (Cholesky auf dem Band). Die Matrix des
 * Lösers hat nur Einträge mit |i − j| ≤ 2 (Nachbarglättung ±1, Krümmungsglättung und Wende ±2, Ziele und Pins auf der
 * Diagonalen); vorher dichte Cholesky O(k³) je Runde, bei k ≈ 100 und bis zu 24 Runden der größte Posten der Vorschau
 */
const BAND = 2;
function solveSym(A: Float64Array, k: number, b: Float64Array): Float64Array<ArrayBuffer> {
  let maxDiag = 0;
  for (let i = 0; i < k; i++) maxDiag = Math.max(maxDiag, A[i * k + i]);
  const eps = 1e-10 * maxDiag + 1e-300;
  const W = BAND + 1;
  // L[i][j] für i − BAND ≤ j ≤ i liegt in Lb[i * W + (i − j)]
  const Lb = new Float64Array(k * W);
  for (let i = 0; i < k; i++) {
    const j0 = Math.max(0, i - BAND);
    for (let j = j0; j <= i; j++) {
      let v = A[i * k + j];
      const m0 = Math.max(j0, j - BAND);
      for (let m = m0; m < j; m++) v -= Lb[i * W + (i - m)] * Lb[j * W + (j - m)];
      if (i === j) Lb[i * W] = Math.sqrt(Math.max(v, 0) + eps);
      else Lb[i * W + (i - j)] = v / Lb[j * W];
    }
  }
  const x = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    let v = b[i];
    for (let m = Math.max(0, i - BAND); m < i; m++) v -= Lb[i * W + (i - m)] * x[m];
    x[i] = v / Lb[i * W];
  }
  for (let i = k - 1; i >= 0; i--) {
    let v = x[i];
    for (let m = i + 1; m <= Math.min(k - 1, i + BAND); m++) v -= Lb[m * W + (m - i)] * x[m];
    x[i] = v / Lb[i * W];
  }
  return x;
}

/** kubisches Segment bei u teilen (de Casteljau): vorderer und hinterer Teil, die Kurve bleibt dieselbe */
function splitCubic(seg: CubicSegment3, u: number): { left: CubicSegment3; right: CubicSegment3 } {
  const L = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
  const q0 = L(seg.p0, seg.p1);
  const q1 = L(seg.p1, seg.p2);
  const q2 = L(seg.p2, seg.p3);
  const r0 = L(q0, q1);
  const r1 = L(q1, q2);
  const m = L(r0, r1);
  return { left: { p0: seg.p0, p1: q0, p2: r0, p3: m }, right: { p0: m, p1: r1, p2: q2, p3: seg.p3 } };
}

/** Länge (Punkte) der Ausfahrt einer Schleife, über die sie hinter die Einfahrt läuft: 2·NEIGHBOR, bei kleinen Schleifen die halbe Schleife */
function loopRamp(l: Loop): number {
  return Math.max(3, Math.min(2 * NEIGHBOR, Math.floor((l.j - l.i) / 2)));
}

/** Punkt der kubischen Bezier-Kurve bei u */
function bezierAt(seg: CubicSegment3, u: number): Vec3 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return { x: a * seg.p0.x + b * seg.p1.x + c * seg.p2.x + d * seg.p3.x, y: a * seg.p0.y + b * seg.p1.y + c * seg.p2.y + d * seg.p3.y, z: a * seg.p0.z + b * seg.p1.z + c * seg.p2.z + d * seg.p3.z };
}

export class Strich2 {
  /** Pinselpunkte, wie zuletzt übergeben (nach dem Anschluss an die alte Bahn verschoben) und unverschoben zum Vergleich */
  private raw: StagePoint[] = [];
  private rawIn: StagePoint[] = [];
  private rawCum: number[] = [0];
  /** Anschluss an die alte Bahn: Versatz des ersten Pinselpunkts, über BLEND m abgebaut */
  private blend: { dx: number; dy: number } | null = null;
  /** feine Abtastung (FINE m) des Pinsels, nur wachsend; Cursor in raw */
  private fine: StagePoint[] = [];
  private fineNext = 0;
  private fineSeg = 0;
  /** geglättete feine Punkte; die ersten smoothFinal sind endgültig */
  private smooth: StagePoint[] = [];
  private smoothFinal = 0;
  private smoothCum: number[] = [];
  /** 1-m-Linie: Punkte, davon die ersten lineFinal endgültig; baseLen Punkte der alten Bahn davor */
  private pts: Pt[] = [];
  private lineFinal = 0;
  private readonly baseLen: number;
  /**
   * feste Segmente der Bahn (alle ihre Punkte sind fest, dazu fixBehind dahinter) mit dem Linienpunkt, an dem jedes
   * endet, und ihren Knoten (dieselben Objekte von Vorschau zu Vorschau); fitFrom: ab hier wird neu gefittet
   */
  private fixedSegs: CubicSegment3[] = [];
  private fixedEnd: number[] = [];
  private fixedNodes: TrackNode[] = [];
  private fitFrom = 0;
  /** so viele der festen Segmente sind die alte Bahn (Fortsetzen, Überzeichnen): sie fallen beim Zurückziehen nie weg */
  private baseSegs = 0;
  /** Richtung am Ende (Überzeichnen: Anschluss an den Rest der alten Bahn), nur beim Loslassen gesetzt */
  private endTangent: Vec3 | null = null;
  /** beim Lösen: eine Kreuzungsschranke bezog sich auf einen noch freien Punkt (seine Tiefe ändert sich mit) → zweiter Durchgang */
  private freePairs = false;
  /**
   * Abfragen je Linienindex: Vorläufige Linienpunkte entstehen je Vorschau neu, liegen aber fast an derselben Stelle. Liegt
   * der neue Punkt näher als QUERY_REUSE am gemerkten, gelten dessen Ebenen- und Feldwerte (je Punkt kosten die Abfragen
   * rund 1 ms, sie waren 5 von 7 ms der Vorschau)
   */
  private queryCache = new Map<number, { X: number; Y: number; land: Landing | number | null; ground: number; lanes: FreeLanes | null }>();
  /** Seite je Kreuzung (Schlüssel: Bündel des späteren und des früheren Punkts), bleibt und wird an Nachbarbündel vererbt */
  private sides = new Map<number, number>();
  /** feste Punkte nach x-Zelle für die Kreuzungssuche */
  private xCells = new Map<number, number[]>();
  private readonly startZ: number;
  private readonly tsX: number;
  /** erkannte Schleifen (Kreuzung der Linie mit sich selbst mit Drehung dazwischen); bis loopsChecked schon gesucht */
  private loops: Loop[] = [];
  private loopsChecked = 0;
  /** Diagnose (Messung, Tests): Ziele, Gewichte, Schranken und Wende-Gewichte des letzten Lösens ab Linienindex a */
  lastSolve: { a: number; T: Float64Array; W: Float64Array; LO: Float64Array; HI: Float64Array; level: Float64Array } | null = null;
  stats: Strich2Stats = { n: 0, frozen: 0, ms: 0, queryMs: 0, solveMs: 0, crossMs: 0, fitMs: 0, conflicts: 0, loops: 0, loopsWidened: 0, loopsFlat: 0, capped: 0 };
  private queryMs = 0;

  /**
   * base: alte Bahn (Linie mit Tiefe je Punkt), an die der Strich anschließt; startZ: Tiefe am Anfang eines neuen
   * Strichs (Landung oder Bodenhöhe der Ebenen); closeSnap: so nah muss das Ende dem Anfang kommen, damit die Runde
   * schließt; lookahead: Vorlauf in Metern hinter der Spitze, ab dem die Tiefe fest wird (FREEZE). base.nodes: die
   * Knoten der alten Bahn (offen, bis zu ihrem Ende): sie bleiben wörtlich stehen, gefittet wird erst ab ihrem Ende
   */
  constructor(
    private readonly options: () => BrushOptions,
    base: { line: StagePoint[]; z: Float64Array; nodes?: TrackNode[] } | null,
    startZ: number,
    private readonly closeSnap: number,
    private readonly fixBehind = FIX_BEHIND,
    private readonly lookahead = FREEZE,
  ) {
    if (base && base.line.length >= 2) {
      base.line.forEach((p, i) => this.pts.push(this.newPt({ ...p }, base.z[i])));
      if (base.nodes && base.nodes.length >= 2) {
        // die 1-m-Linie endet meist kurz vor dem letzten Knoten: ein Punkt genau dort, damit der Fit am Knoten ansetzt
        const last = base.nodes[base.nodes.length - 1];
        const sEnd = toView(last.x, last.y, last.z);
        const lp = this.pts[this.pts.length - 1];
        if (Math.hypot(lp.p.X - sEnd.X, lp.p.Y - sEnd.Y) > 0.05) this.pts.push(this.newPt({ ...lp.p, X: sEnd.X, Y: sEnd.Y }, last.z * LANE_DEPTH));
      }
      for (const q of this.pts) {
        q.frozen = true;
        this.indexX(this.pts.indexOf(q));
      }
      this.baseLen = this.pts.length;
      this.lineFinal = this.baseLen;
      this.startZ = base.z[0];
      const a = base.line[0];
      const b = base.line[Math.min(base.line.length - 1, 4)];
      this.tsX = Math.sign(b.X - a.X) || 1;
      if (base.nodes && base.nodes.length >= 2) this.adoptNodes(base.nodes);
    } else {
      this.baseLen = 0;
      this.startZ = Number.isFinite(startZ) ? startZ : 0;
      this.tsX = 0;
    }
  }

  /**
   * Knoten der alten Bahn als feste Segmente übernehmen (dieselben Werte, eigene Kopien): Griffe in Spuren → Meter. Das
   * Ende jedes Segments wird dem nächsten Linienpunkt zugeordnet (monoton; das letzte endet am Ende der alten Bahn)
   */
  private adoptNodes(nd: TrackNode[]): void {
    const w = (n: TrackNode): Vec3 => ({ x: n.x, y: n.y, z: n.z * LANE_DEPTH });
    let prevEnd = 0;
    for (let k = 0; k + 1 < nd.length; k++) {
      const a = nd[k];
      const b = nd[k + 1];
      const p0 = w(a);
      const p3 = w(b);
      const p1 = { x: p0.x + a.outX, y: p0.y + a.outY, z: p0.z + a.outZ * LANE_DEPTH };
      const p2 = { x: p3.x + b.inX, y: p3.y + b.inY, z: p3.z + b.inZ * LANE_DEPTH };
      this.fixedSegs.push({ p0, p1, p2, p3 });
      this.fixedNodes.push({ ...a });
      let end = this.baseLen - 1;
      if (k + 2 < nd.length) {
        const s = toView(b.x, b.y, b.z);
        let bd = Infinity;
        for (let i = prevEnd; i < this.baseLen; i++) {
          const d = Math.hypot(this.pts[i].p.X - s.X, this.pts[i].p.Y - s.Y);
          if (d < bd) {
            bd = d;
            end = i;
          }
        }
      }
      this.fixedEnd.push(end);
      prevEnd = end;
    }
    this.baseSegs = this.fixedSegs.length;
    this.fitFrom = this.baseLen - 1;
  }

  private newPt(p: StagePoint, z: number): Pt {
    return { p, land: null, ground: NaN, lanes: null, flat: true, wh: 1, run: 0, dirX: 0, z, frozen: false, blocked: false, cave: false, near: false, queried: false, rail: null, railStage: null, wp: null, wpLane: NaN, pt: null, capped: false };
  }

  /** Lage des Bahnpunkts im Bild: der Linienpunkt, bei aufgeweiteten Schleifen der verschobene */
  private at(q: Pt): StagePoint {
    return q.pt ?? q.p;
  }

  /** die Schleife, in der ein Linienpunkt liegt (mit etwas Rand), sonst null */
  private loopOf(k: number): Loop | null {
    for (const l of this.loops) if (k >= l.i - 2 && k <= l.j + 2) return l;
    return null;
  }

  private indexX(i: number): void {
    const c = Math.floor(this.pts[i].p.X);
    const l = this.xCells.get(c);
    if (l) l.push(i);
    else this.xCells.set(c, [i]);
  }

  // ------------------------------------------------------------------ Linie (nur wachsend)

  /** Pinselpunkte übernehmen: gewachsen am Ende, oder gekürzt (Zurückziehen): dann fällt alles dahinter weg */
  private feed(points: StagePoint[]): void {
    let common = 0;
    while (common < this.rawIn.length && common < points.length && this.rawIn[common].X === points[common].X && this.rawIn[common].Y === points[common].Y) common++;
    if (common < this.raw.length) this.truncateRaw(common);
    if (!this.raw.length && points.length) {
      const base = this.baseLen ? this.pts[this.baseLen - 1].p : null;
      this.blend = base ? { dx: base.X - points[0].X, dy: base.Y - points[0].Y } : null;
    }
    for (let i = this.raw.length; i < points.length; i++) {
      const b = this.blendAt(i, points);
      const p: StagePoint = { ...points[i], X: points[i].X + b.dx, Y: points[i].Y + b.dy };
      if (i > 0) this.rawCum.push(this.rawCum[i - 1] + Math.hypot(p.X - this.raw[i - 1].X, p.Y - this.raw[i - 1].Y));
      this.raw.push(p);
      this.rawIn.push({ X: points[i].X, Y: points[i].Y });
    }
    this.extendFine();
    this.extendSmooth();
    this.extendLine();
  }

  /** Versatz des Anschlusses für Pinselpunkt i (über 5 m Pinsellinie abgebaut) */
  private blendAt(i: number, points: StagePoint[] = this.raw): { dx: number; dy: number } {
    if (!this.blend) return { dx: 0, dy: 0 };
    let cum = 0;
    if (i < this.rawCum.length) cum = this.rawCum[i];
    else {
      cum = this.rawCum[this.rawCum.length - 1];
      for (let k = this.rawCum.length; k <= i && k < points.length; k++) cum += Math.hypot(points[k].X - points[k - 1].X, points[k].Y - points[k - 1].Y);
    }
    const f = Math.max(0, 1 - cum / 5);
    return { dx: this.blend.dx * f, dy: this.blend.dy * f };
  }

  /** Zurückziehen: alles ab Pinselpunkt common verwerfen (auch feste Linienpunkte, die daraus entstanden) */
  private truncateRaw(common: number): void {
    this.raw.length = common;
    this.rawIn.length = common;
    this.rawCum.length = Math.max(1, common);
    // feine Punkte bis zur Länge des verbleibenden Pinsels
    const len = common ? this.rawCum[common - 1] : 0;
    let fineKeep = 0;
    while (fineKeep < this.fine.length && fineKeep * FINE <= len) fineKeep++;
    this.fine.length = fineKeep;
    this.fineNext = fineKeep;
    this.fineSeg = 0;
    // Cursor neu an die passende Stelle setzen
    const target = fineKeep * FINE;
    while (this.fineSeg + 1 < this.raw.length && this.rawCum[this.fineSeg + 1] < target) this.fineSeg++;
    const sKeep = Math.max(0, Math.min(this.smooth.length, fineKeep - SMOOTH_R));
    this.smooth.length = sKeep;
    this.smoothCum.length = sKeep;
    this.smoothFinal = Math.min(this.smoothFinal, Math.max(0, sKeep - SMOOTH_R));
    const lineLen = sKeep ? this.smoothCum[sKeep - 1] : 0;
    let keep = this.baseLen;
    while (keep < this.pts.length && (keep - this.baseLen) * STEP <= lineLen - 2 * STEP) keep++;
    keep = Math.max(this.baseLen, Math.min(keep, this.pts.length));
    this.dropFrom(keep);
  }

  /** Linienpunkte ab from verwerfen (fest oder nicht) */
  private dropFrom(from: number): void {
    if (from >= this.pts.length) return;
    this.pts.length = from;
    this.lineFinal = Math.min(this.lineFinal, from);
    this.xCells = new Map();
    for (let i = 0; i < from; i++) if (this.pts[i].frozen) this.indexX(i);
    // feste Segmente, deren Ende (samt Tangenten-Nachbarn) noch da ist, bleiben
    while (this.fixedEnd.length > this.baseSegs && this.fixedEnd[this.fixedEnd.length - 1] + Math.max(2, this.fixBehind) >= from) {
      const b = this.fixedEnd.pop()!;
      const a = this.fixedEnd.length ? this.fixedEnd[this.fixedEnd.length - 1] : 0;
      for (let i = a; i <= Math.min(b, this.pts.length - 1); i++) {
        this.pts[i].rail = null;
        this.pts[i].railStage = null;
      }
      this.fixedSegs.pop();
      this.fixedNodes.pop();
    }
    this.fitFrom = this.fixedEnd.length ? this.fixedEnd[this.fixedEnd.length - 1] : 0;
    this.loops = this.loops.filter((l) => l.j < from);
    this.loopsChecked = Math.min(this.loopsChecked, from);
  }

  // ------------------------------------------------------------------ Schleifen

  /**
   * Schleifen suchen: jedes neue Linienstück gegen die Stücke bis LOOP_MAX_ARC davor (vorläufige Punkte entstehen je
   * Vorschau neu, darum ab dem endgültigen Teil immer wieder); eine Kreuzung mit Drehung ≥ LOOP_TURN dazwischen ist eine
   * Schleife. Danach die Bahnpunkte aufgeweiteter Loopings setzen
   */
  private findLoops(): void {
    const n = this.pts.length;
    if (!LOOP_TUNING.on) {
      this.loops = [];
      this.loopsChecked = n;
      return;
    }
    const from = Math.max(this.baseLen + 1, Math.min(this.loopsChecked, this.lineFinal));
    this.loops = this.loops.filter((l) => l.j < from);
    const P = (k: number): StagePoint => this.pts[k].p;
    const head = (k: number): number => Math.atan2(P(k + 1).Y - P(k).Y, P(k + 1).X - P(k).X);
    for (let i = from; i < n; i++) {
      const a = P(i - 1);
      const b = P(i);
      const minX = Math.min(a.X, b.X);
      const maxX = Math.max(a.X, b.X);
      const minY = Math.min(a.Y, b.Y);
      const maxY = Math.max(a.Y, b.Y);
      const rx = b.X - a.X;
      const ry = b.Y - a.Y;
      // nur im neuen Strich: Kreuzt er die alte Bahn (Fortsetzen), ist das eine Kreuzung, keine Schleife
      for (let j = Math.max(this.baseLen + 1, i - Math.round(LOOP_MAX_ARC / STEP)); j <= i - NEIGHBOR; j++) {
        const c = P(j - 1);
        const d = P(j);
        if (Math.max(c.X, d.X) < minX || Math.min(c.X, d.X) > maxX || Math.max(c.Y, d.Y) < minY || Math.min(c.Y, d.Y) > maxY) continue;
        const sx = d.X - c.X;
        const sy = d.Y - c.Y;
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c.X - a.X) * sy - (c.Y - a.Y) * sx) / den;
        const u = ((c.X - a.X) * ry - (c.Y - a.Y) * rx) / den;
        if (!(t >= 0 && t < 1 && u >= 0 && u < 1)) continue;
        if (i - j < LOOP_MIN_ARC / STEP) continue;
        let turn = 0;
        for (let k = j; k < i - 1; k++) {
          let dh = head(k + 1) - head(k);
          dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
          turn += dh;
        }
        if (Math.abs(turn) < LOOP_TURN) continue;
        if (this.loops.some((l) => Math.abs(l.i - j) < 6 && Math.abs(l.j - i) < 6)) continue;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let k = j; k <= i; k++) {
          x0 = Math.min(x0, P(k).X);
          x1 = Math.max(x1, P(k).X);
          y0 = Math.min(y0, P(k).Y);
          y1 = Math.max(y1, P(k).Y);
        }
        const w = x1 - x0;
        const h = y1 - y0;
        const vertical = h >= LOOP_TUNING.aspect * w;
        const r = (w + h) / 4;
        this.loops.push({ i: j, j: i, vertical, r, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: vertical && r > 1e-6 && r < LOOP_TUNING.minR ? LOOP_TUNING.minR / r : 1 });
        // Seiten, die vor der Erkennung zwischen Punkten der Schleife entschieden wurden, gelten nicht mehr (die beiden
        // Seiten der Schleife sind keine Kreuzung; die Ein- und Ausfahrt entscheidet neu)
        const b0 = Math.floor(j / 12);
        const b1 = Math.floor(i / 12);
        for (const key of Array.from(this.sides.keys())) {
          const iB = Math.floor(key / 65536);
          const jB = key % 65536;
          if (iB >= b0 && iB <= b1 && jB >= b0 && jB <= b1) this.sides.delete(key);
        }
        break;
      }
    }
    this.loopsChecked = n;
    this.stats.loops = this.loops.filter((l) => l.vertical).length;
    this.stats.loopsWidened = this.loops.filter((l) => l.scale > 1).length;
    this.stats.loopsFlat = this.loops.length - this.stats.loops;
    for (const l of this.loops) this.widen(l);
  }

  /**
   * Bahnpunkte einer aufgeweiteten Schleife: die Schleife um ihre Mitte gestreckt, davor und dahinter über LOOP_BLEND freie
   * Punkte an die Tinte angeschlossen. Feste Punkte behalten ihren Bahnpunkt (ihre Schienen stehen)
   */
  private widen(l: Loop): void {
    const n = this.pts.length;
    for (let k = Math.max(this.baseLen, l.i - LOOP_BLEND); k <= Math.min(n - 1, l.j + LOOP_BLEND); k++) {
      const q = this.pts[k];
      if (q.frozen) continue;
      if (l.scale <= 1) {
        q.pt = null;
        continue;
      }
      const out = k < l.i ? l.i - k : k > l.j ? k - l.j : 0;
      const f = 1 - out / (LOOP_BLEND + 1);
      const wgt = f * f * (3 - 2 * f);
      const s = 1 + (l.scale - 1) * wgt;
      q.pt = { ...q.p, X: l.cx + (q.p.X - l.cx) * s, Y: l.cy + (q.p.Y - l.cy) * s };
    }
  }

  /** feine Punkte an Vielfachen von FINE entlang des Pinsels nachziehen (der Cursor läuft nur vorwärts) */
  private extendFine(): void {
    const n = this.raw.length;
    if (n < 2) return;
    const total = this.rawCum[n - 1];
    while (this.fineNext * FINE <= total) {
      const s = this.fineNext * FINE;
      while (this.fineSeg + 1 < n - 1 && this.rawCum[this.fineSeg + 1] <= s) this.fineSeg++;
      const a = this.raw[this.fineSeg];
      const b = this.raw[this.fineSeg + 1];
      const d = this.rawCum[this.fineSeg + 1] - this.rawCum[this.fineSeg];
      const f = d > 1e-9 ? clamp((s - this.rawCum[this.fineSeg]) / d, 0, 1) : 0;
      this.fine.push(mixPoint(a, b, f));
      this.fineNext++;
    }
  }

  /** Gauß über ±SMOOTH_R feine Punkte; endgültig, sobald das Fenster ganz im Vorrat liegt */
  private extendSmooth(): void {
    const n = this.fine.length;
    const from = this.smoothFinal;
    for (let i = from; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      let scx = 0;
      let scy = 0;
      let sc = 0;
      for (let k = -SMOOTH_R; k <= SMOOTH_R; k++) {
        const q = this.fine[clamp(i + k, 0, n - 1)];
        const w = Math.exp(-((k * FINE) ** 2) / (2 * SIGMA * SIGMA));
        sx += q.X * w;
        sy += q.Y * w;
        sw += w;
        if (q.cx !== undefined && q.cy !== undefined) {
          scx += q.cx * w;
          scy += q.cy * w;
          sc += w;
        }
      }
      const out: StagePoint = i === 0 ? { ...this.fine[0] } : { X: sx / sw, Y: sy / sw };
      if (i > 0 && sc > 0) {
        out.cx = scx / sc;
        out.cy = scy / sc;
      }
      this.smooth[i] = out;
      this.smoothCum[i] = i ? this.smoothCum[i - 1] + Math.hypot(out.X - this.smooth[i - 1].X, out.Y - this.smooth[i - 1].Y) : 0;
    }
    this.smooth.length = n;
    this.smoothCum.length = n;
    this.smoothFinal = Math.max(0, n - SMOOTH_R);
  }

  /** 1-m-Punkte an Vielfachen von STEP entlang der geglätteten Linie; endgültig bis zur Länge des endgültigen Teils */
  private extendLine(): void {
    const n = this.smooth.length;
    if (n < 2) return;
    const total = this.smoothCum[n - 1];
    const finalLen = this.smoothFinal ? this.smoothCum[this.smoothFinal - 1] : 0;
    // vorläufige Linienpunkte neu, endgültige bleiben
    const keep = this.lineFinal;
    this.pts.length = Math.max(this.baseLen, keep);
    let seg = 0;
    const first = this.baseLen === 0 ? 0 : 1;
    for (let k = this.pts.length - this.baseLen + first; ; k++) {
      const s = k * STEP;
      if (s > total) break;
      while (seg + 1 < n - 1 && this.smoothCum[seg + 1] <= s) seg++;
      const d = this.smoothCum[seg + 1] - this.smoothCum[seg];
      const f = d > 1e-9 ? clamp((s - this.smoothCum[seg]) / d, 0, 1) : 0;
      const p = mixPoint(this.smooth[seg], this.smooth[seg + 1], f);
      const zPrev = this.pts.length ? this.pts[this.pts.length - 1].z : this.startZ;
      this.pts.push(this.newPt(p, zPrev));
      if (s <= finalLen) this.lineFinal = this.pts.length;
    }
    this.stats.n = this.pts.length;
  }

  // ------------------------------------------------------------------ Abfragen und Ziele

  /** Ebenen und Feld je freiem Punkt lesen (feste Punkte behalten ihre Werte) */
  private query(o: BrushOptions, from: number): void {
    const n = this.pts.length;
    const t0 = performance.now();
    for (let i = Math.max(from, this.baseLen); i < n; i++) {
      const q = this.pts[i];
      if (q.frozen || q.queried) continue;
      const c = this.queryCache.get(i);
      if (c && Math.abs(c.X - q.p.X) < QUERY_REUSE && Math.abs(c.Y - q.p.Y) < QUERY_REUSE) {
        q.land = c.land;
        q.ground = c.ground;
        q.lanes = c.lanes;
      } else {
        q.land = o.depthAt ? o.depthAt(q.p) : null;
        q.ground = o.groundAt ? o.groundAt(q.p) : NaN;
        q.lanes = o.field ? o.field.free(q.p) : null;
        this.queryCache.set(i, { X: q.p.X, Y: q.p.Y, land: q.land, ground: q.ground, lanes: q.lanes });
      }
      q.queried = true;
    }
    this.queryMs += performance.now() - t0;
    for (let i = Math.max(from, this.baseLen, 1); i < n; i++) {
      const q = this.pts[i];
      if (q.frozen) continue;
      const a = this.pts[Math.max(0, i - 2)].p;
      const b = this.pts[Math.min(n - 1, i + 2)].p;
      const dX = Math.abs(b.X - a.X);
      const dY = Math.abs(b.Y - a.Y);
      q.flat = dY <= LAND_SLOPE * dX;
      const angle = Math.atan2(dY, dX + 1e-9);
      q.wh = Math.max(STEEP_W, Math.min(1, (STEEP_TO - angle) / (STEEP_TO - STEEP_FROM)));
      const a1 = this.pts[Math.max(0, i - 1)].p;
      const b1 = this.pts[Math.min(n - 1, i + 1)].p;
      q.dirX = (b1.X - a1.X) / (Math.hypot(b1.X - a1.X, b1.Y - a1.Y) || 1);
      const prev = this.pts[i - 1];
      const id = q.land !== null && typeof q.land === 'object' ? q.land.id : NaN;
      const prevId = prev.land !== null && typeof prev.land === 'object' ? prev.land.id : NaN;
      q.run = Number.isNaN(id) ? 0 : id === prevId ? prev.run + STEP : STEP;
    }
  }

  /** Wunschtiefe und Gewicht eines Punkts (ohne Schranken) */
  private target(q: Pt, i: number): { t: number; w: number } {
    if (i < this.baseLen) return { t: q.z, w: 1 };
    // Station: die ersten Meter eines neuen Strichs bleiben auf der Starttiefe
    if (!this.baseLen && i * STEP < STATION_CALM) return { t: this.startZ, w: 50 };
    const l = q.land;
    if (l !== null) {
      const z = typeof l === 'number' ? l : l.z;
      const cave = typeof l === 'object' && !!l.cave;
      if (cave) return { t: z, w: W_CAVE };
      // flach auf derselben Kante: Landung, die über LAND_RUN Meter voll zieht; steil über eine Kante hinweg: Bodenhöhe
      if (q.flat && q.run >= LAND_RUN) return { t: z, w: W_LAND };
      if (q.flat && !Number.isFinite(q.ground)) return { t: z, w: (W_LAND * q.run) / LAND_RUN + STEEP_W };
    }
    // „Ebenen: Bodenhöhe“ wie beim heutigen Pinsel: die Tiefe, in der der Strich bequem über einer Kante liegt, steil wie
    // flach; was kurz steil ist, setzt solve() als Hügel (Höhe) oder Kehre (Halbkreis) darüber
    if (Number.isFinite(q.ground)) return { t: q.ground, w: W_GROUND };
    return { t: q.z, w: 0 };
  }

  /**
   * Schranken aus dem Freiraum: der Abschnitt, der dem Ziel am nächsten liegt, mit Vorzug (HOP) für den, in dem die
   * Tiefe des Vorgängers liegt (kein Hin und Her bei Gleichstand), mit allen berührenden Nachbarn als Spielraum. Läuft der
   * Strich unter eine Kante, liegt die vorige Tiefe im Festen: Dann nimmt die Bahn den Abschnitt davor oder dahinter, je
   * nach Ziel; der Löser verteilt den Wechsel über das freie Stück. Gar kein Abschnitt → blockiert, die Tiefe bleibt
   */
  private bounds(q: Pt, prev: Pt | null, t: number, zMin: number, zMax: number): { lo: number; hi: number; mid: number; cave: boolean; blocked: boolean } {
    const l = q.lanes;
    if (!l || !l.intervals.length) return { lo: zMin, hi: zMax, mid: NaN, cave: false, blocked: false };
    const iv = l.intervals.map((v) => ({ a: v.a * LANE_DEPTH, b: v.b * LANE_DEPTH, cave: !!v.cave && v.attract }));
    const zPrev = prev ? prev.z : t;
    const touch = (a: { a: number; b: number }, b: { a: number; b: number }) => Math.min(a.b, b.b) - Math.max(a.a, b.a) >= -0.06 * LANE_DEPTH;
    const dist = (v: { a: number; b: number }, z: number) => (z < v.a ? v.a - z : z > v.b ? z - v.b : 0);
    let best = -1;
    let bestCost = Infinity;
    let bestFar = false;
    for (let k = 0; k < iv.length; k++) {
      const holds = dist(iv[k], zPrev) <= 0.06 * LANE_DEPTH;
      const d = dist(iv[k], t);
      const c = d - (iv[k].cave ? 0.3 * LANE_DEPTH : 0) - (holds ? HOP * LANE_DEPTH : 0);
      if (c < bestCost) {
        bestCost = c;
        best = k;
        bestFar = !holds && d > HOP_MAX * LANE_DEPTH;
      }
    }
    // kein Abschnitt, oder der nächste liegt weiter als HOP_MAX vom Ziel und die Tiefe ist nicht schon darin: Fels, die
    // Tiefe bleibt (ein Sprung so weit wäre keine Lesung des Strichs mehr)
    if (best < 0 || bestFar) return { lo: zPrev, hi: zPrev, mid: NaN, cave: false, blocked: true };
    let lo = iv[best].a;
    let hi = iv[best].b;
    for (let k = best - 1; k >= 0 && touch(iv[k], iv[k + 1]); k--) lo = Math.min(lo, iv[k].a);
    for (let k = best + 1; k < iv.length && touch(iv[k - 1], iv[k]); k++) hi = Math.max(hi, iv[k].b);
    return { lo: Math.max(zMin, lo), hi: Math.min(zMax, hi), mid: (iv[best].a + iv[best].b) / 2, cave: iv[best].cave, blocked: false };
  }

  /** Lage eines früheren Punkts für die Kreuzungsregel: seine festen Schienen (Bühne), sonst sein Bahnpunkt */
  private stageOf(r: Pt): StagePoint {
    return r.railStage ?? this.at(r);
  }

  private zOf(r: Pt): number {
    return r.rail ? r.rail.z : r.z;
  }

  /** Sinus des Winkels, in dem sich die Linie an den Punkten i und j im Bild kreuzt (0 = parallel, 1 = rechtwinklig) */
  private crossSin(i: number, j: number): number {
    const dir = (k: number): [number, number] => {
      const a = this.pts[Math.max(0, k - 1)].p;
      const b = this.pts[Math.min(this.pts.length - 1, k + 1)].p;
      const l = Math.hypot(b.X - a.X, b.Y - a.Y) || 1;
      return [(b.X - a.X) / l, (b.Y - a.Y) / l];
    };
    const [ax, ay] = dir(i);
    const [bx, by] = dir(j);
    return Math.abs(ax * by - ay * bx);
  }

  /**
   * Kreuzung mit früheren Punkten (fest, oder frei mit der Tiefe der letzten Lösung): verbotener Tiefenunterschied je
   * Paar, die Seite (vorne oder hinten) wird je Begegnung einmal entschieden und an die Nachbarbündel vererbt.
   * Widersprechen sich die Schranken (vor dem einen, hinter dem anderen Strang: in dichten Schleifenhaufen), zählt ein
   * Konflikt; der Löser klemmt den Punkt dann an eine Schranke. (Ein Versuch mit der Lücke
   * zwischen allen verbotenen Bändern je Punkt, mit und ohne Gedächtnis, war auf Florians Schleifen-Strichen messbar
   * schlechter: 31 Striche 375 und 478 Kreuzungen statt 215; verworfen 29.10.)
   */
  private crossBounds(i: number, t: number, lo: number, hi: number, closing = false): { lo: number; hi: number } {
    const tC = performance.now();
    const q = this.pts[i];
    const qp = this.at(q);
    const n = this.pts.length;
    const cx = Math.floor(q.p.X);
    const pairs: Array<{ rz: number; fLo: number; fHi: number; clean: boolean; key: number; iB: number; jB: number; forced: number }> = [];
    for (let c = cx - XWIN; c <= cx + XWIN; c++) {
      const list = this.xCells.get(c);
      if (!list) continue;
      for (const j of list) {
        if (j > i - NEIGHBOR) continue;
        // Rundenschluss: die Naht an der Station ist keine Kreuzung
        if (closing && n - i + j < NEIGHBOR + 3) continue;
        // Paare in einer Schleife: die beiden Seiten derselben Schleife (Scheitel über der Einfahrt) und die Einfahrt
        // gegen ihre eigene Anfahrt sind keine Kreuzung; nur die Ausfahrt begegnet der Einfahrt, und sie läuft hinter
        // sie (Seite fest, kleiner Versatz, keine ganze Spur). (Ohne Schranke, nur mit dem weichen Ziel, verdoppelten
        // sich die Kreuzungen auf gleicher Höhe auf Florians Strichen: 6 → 21, 112 → 212; mit der Schranke auch für
        // die Einfahrt rückte eine Bodenschleife schon am Anfang 2 m nach hinten)
        const lp = this.loopOf(i) ?? this.loopOf(i - XWIN - NEIGHBOR);
        let own = false;
        if (lp) {
          const nearEntry = j >= lp.i - XWIN - NEIGHBOR && j <= lp.i + NEIGHBOR;
          if (j > lp.i + NEIGHBOR && j <= lp.j + 2) continue;
          if (nearEntry) {
            if (i < lp.j - loopRamp(lp)) continue;
            own = true;
          }
        }
        const r = this.pts[j];
        const rp = this.stageOf(r);
        const dX = qp.X - rp.X;
        if (Math.abs(dX) >= XWIN) continue;
        const dY = qp.Y - rp.Y;
        // kleiner Versatz: im ganzen Fenster seitlich PASS_SIDE (dichter als PASS_SIDE in x: der Kreis darum) oder in der Höhe PASS_OVER
        const w = Math.abs(dX) < PASS_SIDE ? Math.sqrt(PASS_SIDE * PASS_SIDE - dX * dX) : PASS_SIDE;
        const fLo = Math.max(-w, (dY - PASS_OVER) / TILT_TAN);
        const fHi = Math.min(w, (dY + PASS_OVER) / TILT_TAN);
        if (fLo >= fHi) continue;
        if (!r.frozen) this.freePairs = true;
        // ganze Spur nur an einer sauberen Kreuzung: weit auseinander auf dem Strich, schräg kreuzend, nicht die eigene
        // Kreuzung einer erkannten Schleife (ein Looping versetzt seine Ausfahrt nur um den kleinen Versatz)
        const clean = !own && i - j > LOOP_ARC / STEP && this.crossSin(i, j) >= CROSS_SIN;
        const iB = Math.floor(i / 12);
        const jB = Math.floor(j / 12);
        pairs.push({ rz: this.zOf(r), fLo, fHi, clean, key: iB * 65536 + jB, iB, jB, forced: own ? 1 : 0 });
      }
    }
    if (!pairs.length) {
      this.stats.crossMs += performance.now() - tC;
      return { lo, hi };
    }
    q.near = true;
    const bound = (pr: (typeof pairs)[number], side: number, cur: { lo: number; hi: number }) => {
      const lane = pr.clean && (side > 0 ? cur.hi >= pr.rz + LANE_DEPTH : cur.lo <= pr.rz - LANE_DEPTH);
      if (side > 0) cur.lo = Math.max(cur.lo, pr.rz + (lane ? LANE_DEPTH : pr.fHi));
      else cur.hi = Math.min(cur.hi, pr.rz + (lane ? -LANE_DEPTH : pr.fLo));
    };
    const cur = { lo, hi };
    for (const pr of pairs) {
      let side = pr.forced || (this.sides.get(pr.key) ?? 0);
      if (!side) {
        // Seite vom Nachbarpaar erben (dieselbe Begegnung ein Stück weiter vorn oder hinten): Wechselt die Seite entlang
        // einer flachen Kreuzung, müssen die Tiefenkurven sich schneiden (so entstanden Kreuzungen auf gleicher Höhe)
        const { iB, jB } = pr;
        for (const k of [(iB - 1) * 65536 + jB, iB * 65536 + jB - 1, iB * 65536 + jB + 1, (iB - 1) * 65536 + jB - 1, (iB - 1) * 65536 + jB + 1]) {
          const sd = this.sides.get(k);
          if (sd) {
            side = sd;
            break;
          }
        }
      }
      if (!side) {
        // nahe am Ziel; sonst später Gezeichnetes vorne. An einer sauberen Kreuzung lieber die Seite mit Platz für die Spur
        side = t - pr.rz >= (pr.fLo + pr.fHi) / 2 ? 1 : -1;
        const fitsLane = (sd: number) => pr.clean && (sd > 0 ? cur.hi >= pr.rz + LANE_DEPTH : cur.lo <= pr.rz - LANE_DEPTH);
        const fitsMin = (sd: number) => (sd > 0 ? cur.hi >= pr.rz + pr.fHi : cur.lo <= pr.rz + pr.fLo);
        if (pr.clean && !fitsLane(side) && fitsLane(-side)) side = -side;
        else if (!fitsLane(side) && !fitsMin(side) && fitsMin(-side)) side = -side;
      }
      this.sides.set(pr.key, side);
      bound(pr, side, cur);
    }
    // Widerspruch (vor dem einen, hinter dem anderen Strang): nur zählen, der Löser klemmt den Punkt an eine Schranke.
    // Gemessen und verworfen (29.10., 31 Schleifen-Striche): alle Paare auf eine Seite zwingen 297 statt 215 Kreuzungen,
    // fernere Paare fallen lassen 276 statt 236. Die Haufen sind strukturell zu eng (rund 1000 Konfliktpunkte je Strich)
    if (cur.lo > cur.hi) this.stats.conflicts++;
    this.stats.crossMs += performance.now() - tC;
    return cur;
  }

  // ------------------------------------------------------------------ Formen (Hügel, Kehren) und Vorlauf

  /**
   * Steile Läufe ab from: je Lauf, ob er sich erklärt hat (Hügel: danach RESOLVE_RUN flache Punkte ohne Umkehr in x;
   * Kehre: die klare Richtung in x kehrt um und hält RESOLVE_RUN Punkte) und seine Füße a (letzter flacher Punkt davor)
   * und b (erster flacher Punkt danach, −1 offen)
   */
  private shapes(from: number): Shape[] {
    const n = this.pts.length;
    const steep = (i: number) => this.pts[i].wh < STEEP_LIMIT;
    const clear = (i: number) => (Math.abs(this.pts[i].dirX) > 0.4 ? Math.sign(this.pts[i].dirX) : 0);
    const out: Shape[] = [];
    for (let i = Math.max(1, from); i < n; i++) {
      if (!steep(i)) continue;
      const a = i - 1;
      let e = i;
      while (e + 1 < n && steep(e + 1)) e++;
      // klare Richtung vor dem Lauf und die erste danach
      let before = 0;
      for (let s = a; s >= Math.max(0, a - TURN_SPAN) && !before; s--) before = clear(s);
      let after = 0;
      let afterAt = -1;
      for (let s = e + 1; s < n && !after; s++) {
        after = clear(s);
        afterAt = s;
      }
      let kind: Shape['kind'] = 'open';
      let b = -1;
      let turn = -1;
      const lp = this.loopOf(i) ?? this.loopOf(e);
      if (lp && e >= lp.i && a <= lp.j) {
        // in einer erkannten Schleife: die Schleife liest den Lauf (Looping oder Bodenschleife), er ist erklärt
        kind = 'loop';
        b = Math.max(e, lp.j);
      } else if (before && after && before * after < 0) {
        // Kehre: die Gegenrichtung hält RESOLVE_RUN Punkte (ein senkrechter zweiter Schenkel hat keine klare Richtung in
        // x und unterbricht das nicht), und der zweite Schenkel läuft gerade: über die letzten RESOLVE_RUN Stücke dreht
        // die Linie weniger als KEHRE_STRAIGHT und seit dem Fuß insgesamt weniger als LOOP_TURN. Ein Kringel dreht nach
        // der Umkehr weiter (Kreisbogen) und kreuzt dann seine Einfahrt, der gehört der Schleife. (Paket 3; die erste
        // Fassung wartete, bis der Schenkel wieder unten ist, und machte das Band 15 bis 55 m länger und die Knicke
        // auf einem Satz um 64 % mehr, Studie 16g)
        let hold = 0;
        for (let s = afterAt; s < n && clear(s) !== before; s++) hold++;
        if (hold >= RESOLVE_RUN && n - 1 - RESOLVE_RUN > afterAt) {
          const head = (q: number) => Math.atan2(this.pts[q + 1].p.Y - this.pts[q].p.Y, this.pts[q + 1].p.X - this.pts[q].p.X);
          let tail = 0;
          let total = 0;
          for (let q = a + 1; q + 1 < n; q++) {
            let dh = head(q) - head(q - 1);
            dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
            total += dh;
            if (q >= n - 1 - RESOLVE_RUN) tail += Math.abs(dh);
          }
          if (tail <= KEHRE_STRAIGHT && Math.abs(total) < LOOP_TURN) {
            kind = 'kehre';
            turn = afterAt + RESOLVE_RUN - 1;
            // wie vor Paket 3 endet die Kehre drei Punkte hinter der Umkehr: der zweite Schenkel ist ein eigener Lauf
            // (Hügel oder offen) mit eigener Tiefenlesung; bis zum Fuß zu reichen kostete auf einem Satz 34 % Knicke
            b = turn;
          }
        }
      } else if (e + RESOLVE_RUN < n && after) {
        // Hügel: danach flach weiter, mit klarer Richtung dahinter (ohne die bleibt der Lauf offen: er kann noch eine
        // Kehre werden; vorher gewann der Hügel das Rennen, sobald drei flache Punkte da waren)
        let flat = 0;
        for (let s = e + 1; s < n && !steep(s); s++) flat++;
        if (flat >= RESOLVE_RUN) {
          kind = 'hill';
          b = e + 1;
        }
      }
      // Scheitel: der Punkt mit der kleinsten |Richtung in x| zwischen den Füßen
      let apex = e;
      let best = Infinity;
      for (let s = a; s <= (b < 0 ? e : b); s++) {
        const v = Math.abs(this.pts[s].dirX);
        if (v < best) {
          best = v;
          apex = s;
        }
      }
      out.push({ a, b, kind, apex, turn });
      i = b < 0 ? e : b;
    }
    return out;
  }

  /**
   * bis zu welchem Index (ausschließlich) eingefroren werden darf: der dynamische Vorlauf hinter der Spitze (LOOK_SHORT,
   * LOOK_BASE oder lookahead, je nachdem, was in den letzten lookahead Metern offen ist), aber nie in ein offenes steiles
   * Stück hinein
   */
  private freezeLimit(final = false): number {
    const n = this.pts.length;
    const long = Math.round(this.lookahead / STEP);
    let need = Math.round(LOOK_SHORT / STEP);
    if (!final) {
      let dir = 0;
      for (let i = Math.max(this.baseLen, n - long); i < n; i++) {
        const q = this.pts[i];
        if (q.wh < STEEP_LIMIT) {
          need = long;
          break;
        }
        const c = Math.abs(q.dirX) > 0.4 ? Math.sign(q.dirX) : 0;
        if (c && dir && c !== dir) {
          need = long;
          break;
        }
        if (c) dir = c;
        // die Tiefe ist noch unterwegs zu ihrem Ziel (etwa nach einer Stufe der Bodenhöhe): den Weg nicht abschneiden
        if (!q.frozen && Math.abs(this.target(q, i).t - q.z) > LOOK_SETTLED) {
          need = long;
          break;
        }
        if (q.near) need = Math.max(need, Math.round(LOOK_BASE / STEP));
      }
    }
    let limit = Math.min(this.lineFinal, n - (final ? long : need));
    if (final) return limit;
    let first = this.baseLen;
    while (first < n && this.pts[first].frozen) first++;
    const startFree = this.baseLen ? this.baseLen + Math.round(LOOK_TUNING.lookStart / STEP) : Math.round(STATION_CALM / STEP);
    for (const sh of this.shapes(first)) {
      if (sh.kind !== 'open') continue;
      // offen: nur, wenn der Lauf nicht schon länger als freezeMax ist (dann bleibt er Höhe); die ersten Meter nach dem
      // Anschluss dürfen trotzdem fest werden
      if (n - sh.a > LOOK_TUNING.freezeMax / STEP) continue;
      limit = Math.min(limit, Math.max(sh.a, startFree));
      break;
    }
    return limit;
  }

  // ------------------------------------------------------------------ Löser

  /** lösen; bezog sich eine Kreuzungsschranke auf einen noch freien Punkt, noch einmal mit dessen neuer Tiefe */
  private solveTwice(o: BrushOptions, endZ = NaN): void {
    this.solve(o, endZ);
    if (this.freePairs) this.solve(o, endZ);
  }

  /** Tiefe des freien Stücks lösen (feste Punkte als Rand); endZ: Tiefe am letzten Punkt (Rundenschluss) */
  private solve(o: BrushOptions, endZ = NaN): void {
    const tS = performance.now();
    this.freePairs = false;
    const n = this.pts.length;
    let free = this.baseLen;
    while (free < n && this.pts[free].frozen) free++;
    if (free >= n) return;
    const a = Math.max(0, free - BORDER);
    const k = n - a;
    const zMin = LANE_MIN * LANE_DEPTH;
    const zMax = Math.max(LANE_MAX * LANE_DEPTH, o.zMax ?? -Infinity);
    const cap = o.chainTop !== undefined && Number.isFinite(o.chainTop) ? o.chainTop : undefined;
    const T = new Float64Array(k);
    const W = new Float64Array(k);
    const LO = new Float64Array(k).fill(zMin);
    const HI = new Float64Array(k).fill(zMax);
    const level = new Float64Array(k);
    // Punkte in einer Schleife (samt Ausfahrt): ihre Kreuzungsschranken kommen erst nach dem Schleifenziel (die Seite
    // einer Begegnung wird am Ziel entschieden); alle anderen vorher mit dem Bodenhöhen-Ziel (Studie 16g)
    const inLoopM = new Uint8Array(k);
    for (const l of this.loops) for (let m = Math.max(0, l.i - a); m <= Math.min(k - 1, l.j + NEIGHBOR - a); m++) inLoopM[m] = 1;
    const dirX = (i: number) => this.pts[clamp(i, 0, n - 1)].dirX;
    const clear = (i: number) => (Math.abs(dirX(i)) > 0.4 ? Math.sign(dirX(i)) : 0);
    // freie Punkte vorübergehend in die x-Zellen (Kreuzungen innerhalb des Vorlaufs, etwa in einem Looping)
    const tempCells: Array<[number, number]> = [];
    for (let m = 0; m < k; m++) {
      const i = a + m;
      if (this.pts[i].frozen) continue;
      const c = Math.floor(this.pts[i].p.X);
      const l = this.xCells.get(c);
      if (l) l.push(i);
      else this.xCells.set(c, [i]);
      tempCells.push([c, i]);
    }
    for (let m = 0; m < k; m++) {
      const i = a + m;
      const q = this.pts[i];
      const { t, w } = this.target(q, i);
      T[m] = t;
      W[m] = w;
      if (q.frozen) continue;
      const b = this.bounds(q, i > 0 ? this.pts[i - 1] : null, t, zMin, zMax);
      q.blocked = b.blocked;
      q.cave = b.cave;
      let lo = b.lo;
      let hi = b.hi;
      if (b.cave && !Number.isNaN(b.mid)) {
        T[m] = b.mid;
        W[m] = W_CAVE;
      }
      // Kettenlinie als Deckel (Paket 3): nicht höher als die Kettenzugstärke über der Station; am Strahl heißt das
      // mindestens so tief. Geht das auch in der tiefsten erlaubten Tiefe nicht, bleibt der Punkt dort und wird gezählt
      q.capped = false;
      if (cap !== undefined) {
        const zc = zAtHeight(q.p, cap) * LANE_DEPTH;
        if (zc > lo) {
          if (zc > hi) {
            q.capped = true;
            lo = hi;
          } else lo = zc;
        }
      }
      if (!inLoopM[m]) {
        ({ lo, hi } = this.crossBounds(i, T[m], lo, hi, Number.isFinite(endZ)));
        if (lo > hi) lo = hi = (lo + hi) / 2;
      }
      LO[m] = lo;
      HI[m] = hi;
      T[m] = clamp(T[m], lo, hi);
      // Wende: deutliche Richtung in x davor und danach entgegengesetzt
      let before = 0;
      let after = 0;
      for (let s = i; s >= Math.max(0, i - TURN_SPAN) && !before; s--) before = clear(s);
      for (let s = i; s <= Math.min(n - 1, i + TURN_SPAN) && !after; s++) after = clear(s);
      if (before * after < 0) level[m] = (1 - Math.abs(dirX(i))) ** 2;
    }
    for (const [c, i] of tempCells) {
      const l = this.xCells.get(c)!;
      l.splice(l.indexOf(i), 1);
      if (!l.length) this.xCells.delete(c);
    }
    // festes: Rand und Tiefe der alten Bahn; Rundenschluss: Ende auf der Starttiefe
    const pinned = new Float64Array(k).fill(NaN);
    for (let m = 0; m < k; m++) if (this.pts[a + m].frozen) pinned[m] = this.pts[a + m].z;
    if (Number.isFinite(endZ)) for (let m = Math.max(0, k - 3); m < k; m++) pinned[m] = endZ;
    const A = new Float64Array(k * k);
    const b = new Float64Array(k);
    const add = (i: number, j: number, v: number) => {
      A[i * k + j] += v;
    };
    // Formen im Fenster: Hügel laufen gerade von Fuß zu Fuß, Kehren als Halbkreis durch die Tiefe (Schleifen unten)
    for (const sh of this.shapes(a + 1)) {
      if (sh.kind === 'open' || sh.kind === 'loop' || sh.b < 0) continue;
      const ma = sh.a - a;
      const mb = sh.b - a;
      if (sh.kind === 'hill') {
        // Hügel laufen in der Tiefe gerade von Fuß zu Fuß
        const za = this.pts[sh.a].frozen ? this.pts[sh.a].z : T[Math.max(0, ma)];
        const zb = T[Math.min(k - 1, mb)];
        for (let m = Math.max(1, ma + 1); m < Math.min(k, mb); m++) {
          if (this.pts[a + m].frozen) continue;
          T[m] = za + ((zb - za) * (m - ma)) / Math.max(1, mb - ma);
          W[m] = W_LAND;
          level[m] = 0;
        }
      } else {
        // Kehre: wie vor Paket 3 ein Halbkreis durch die Tiefe (Weite des U im Bild, Richtung nach oben gezeichnet nach
        // hinten), gelegt über den ersten Schenkel bis drei Punkte hinter die Umkehr; der zweite Schenkel kommt mit der
        // Bodenhöhe zurück. Das kippt bei hohen schmalen U am Scheitel (Studie 16c), aber alle vier Lesungen ohne
        // senkrechte Schenkel waren auf Florians Strichen messbar schlechter (Knicke, Knoten, Kreuzungen); die Frage
        // bleibt offen (16f). Neu ist nur, dass die Kehre erst als gelesen gilt, wenn sie keine Schleife mehr werden kann
        const A = this.pts[sh.a].p;
        const tEnd = sh.turn >= 0 ? sh.turn : sh.b;
        const mt = tEnd - a;
        let ext = A.X;
        const s0 = Math.sign(this.pts[sh.a].dirX) || 1;
        for (let s = sh.a; s <= tEnd; s++) ext = s0 > 0 ? Math.max(ext, this.pts[s].p.X) : Math.min(ext, this.pts[s].p.X);
        const width = Math.abs(ext - A.X);
        const dz = clamp(2 * width, KEHRE_MIN, KEHRE_MAX_LANES * LANE_DEPTH);
        const base = this.pts[sh.a].frozen ? this.pts[sh.a].z : T[Math.max(0, ma)];
        let sgn = Math.sign(this.pts[tEnd].p.Y - A.Y) || 1;
        if (base + sgn * dz > zMax || base + sgn * dz < zMin) sgn = -sgn;
        const span = Math.max(1, mt - ma);
        for (let m = Math.max(1, ma + 1); m <= Math.min(k - 1, mt); m++) {
          if (this.pts[a + m].frozen) continue;
          const u = (m - ma) / span;
          T[m] = clamp(base + (sgn * dz * (1 - Math.cos(Math.PI * u))) / 2, LO[m], HI[m]);
          W[m] = W_LAND;
          level[m] = 0;
        }
      }
    }
    // Schleifen: ein Looping hält die Tiefe der Einfahrt (die Kreuzungsregel versetzt die Ausfahrt), eine Bodenschleife
    // die Höhe (die Bildbewegung wird Tiefe)
    for (const l of this.loops) {
      if (l.j < a || l.i >= n) continue;
      const qi = this.pts[l.i];
      const zIn = qi.frozen ? qi.z : T[clamp(l.i - a, 0, k - 1)];
      const body = (q: Pt): number => (l.vertical ? zIn : zIn + (q.p.Y - qi.p.Y) / TILT_TAN);
      for (let m = Math.max(1, l.i - a); m <= Math.min(k - 1, l.j - a); m++) {
        const q = this.pts[a + m];
        if (q.frozen) continue;
        T[m] = clamp(body(q), LO[m], HI[m]);
        W[m] = W_LOOP;
        level[m] = 0;
      }
      // die eigene Kreuzung: die Ausfahrt läuft über die letzten 2·NEIGHBOR Meter der Schleife hinter die Einfahrt
      // (PASS_SIDE plus Spiel) und bleibt dort noch NEIGHBOR Meter; die Kreuzungsregel setzt dort dieselbe Seite fest
      // bei kleinen Schleifen höchstens die halbe Schleife, sonst rückte die ganze Schleife um den Versatz nach hinten
      const off = PASS_SIDE * 1.15;
      const ramp = loopRamp(l);
      for (let m = Math.max(1, l.j - ramp - a); m <= Math.min(k - 1, l.j + NEIGHBOR - a); m++) {
        const q = this.pts[a + m];
        if (q.frozen) continue;
        const u = clamp((a + m - (l.j - ramp)) / ramp, 0, 1);
        T[m] = clamp(body(q) + off * u * u * (3 - 2 * u), LO[m], HI[m]);
        W[m] = W_LOOP;
        level[m] = 0;
      }
    }
    // Kreuzungsschranken erst jetzt, mit dem endgültigen Ziel je Punkt: Die Seite einer Begegnung wird am Ziel entschieden
    // und bleibt; mit dem Bodenhöhen-Ziel statt dem der Form (Kehre, Schleife) saß sie oft falsch und deckelte die Tiefe
    for (let m = 0; m < k; m++) {
      const i = a + m;
      if (this.pts[i].frozen || !inLoopM[m]) continue;
      let { lo, hi } = this.crossBounds(i, T[m], LO[m], HI[m], Number.isFinite(endZ));
      if (lo > hi) lo = hi = (lo + hi) / 2;
      LO[m] = lo;
      HI[m] = hi;
      T[m] = clamp(T[m], lo, hi);
    }
    this.lastSolve = { a, T: Float64Array.from(T), W: Float64Array.from(W), LO: Float64Array.from(LO), HI: Float64Array.from(HI), level: Float64Array.from(level) };
    for (let m = 0; m < k; m++) {
      add(m, m, W[m]);
      b[m] += W[m] * T[m];
    }
    for (let m = 1; m < k; m++) {
      // μ·(z[m] − z[m−1])²
      add(m - 1, m - 1, MU);
      add(m, m, MU);
      add(m - 1, m, -MU);
      add(m, m - 1, -MU);
    }
    for (let m = 1; m < k - 1; m++) {
      // λ·(z[m−1] − 2 z[m] + z[m+1])²
      const l = LAMBDA;
      add(m - 1, m - 1, l);
      add(m, m, 4 * l);
      add(m + 1, m + 1, l);
      add(m - 1, m, -2 * l);
      add(m, m - 1, -2 * l);
      add(m, m + 1, -2 * l);
      add(m + 1, m, -2 * l);
      add(m - 1, m + 1, l);
      add(m + 1, m - 1, l);
      // Wende: (z[m+1] − z[m−1] − g)² mit g = (Y[m+1] − Y[m−1]) / c
      const wl = W_LEVEL * level[m];
      if (wl > 0) {
        const g = (this.pts[a + m + 1].p.Y - this.pts[a + m - 1].p.Y) / TILT_TAN;
        add(m + 1, m + 1, wl);
        add(m - 1, m - 1, wl);
        add(m + 1, m - 1, -wl);
        add(m - 1, m + 1, -wl);
        b[m + 1] += wl * g;
        b[m - 1] -= wl * g;
      }
    }
    let maxDiag = 0;
    for (let m = 0; m < k; m++) maxDiag = Math.max(maxDiag, A[m * k + m]);
    const pinW = PIN_K * maxDiag;
    const pins = new Map<number, number>();
    for (let m = 0; m < k; m++) if (!Number.isNaN(pinned[m])) pins.set(m, pinned[m]);
    let z: Float64Array<ArrayBuffer> = new Float64Array(k);
    for (let round = 0; round < 24; round++) {
      const A2 = Float64Array.from(A);
      const b2 = Float64Array.from(b);
      for (const [m, v] of pins) {
        A2[m * k + m] += pinW;
        b2[m] += pinW * v;
      }
      z = solveSym(A2, k, b2);
      let changed = 0;
      // Schranken loslassen, die nach innen ziehen; verletzte setzen
      for (const [m, v] of pins) {
        if (!Number.isNaN(pinned[m])) continue;
        if (v === HI[m] ? z[m] < v - 1e-4 : z[m] > v + 1e-4) {
          pins.delete(m);
          changed++;
        }
      }
      for (let m = 0; m < k; m++) {
        if (pins.has(m)) continue;
        if (z[m] > HI[m] + 1e-4) {
          pins.set(m, HI[m]);
          changed++;
        } else if (z[m] < LO[m] - 1e-4) {
          pins.set(m, LO[m]);
          changed++;
        }
      }
      if (!changed) break;
    }
    for (let m = 0; m < k; m++) {
      const q = this.pts[a + m];
      if (q.frozen) continue;
      q.z = Number.isFinite(z[m]) ? clamp(z[m], LO[m], HI[m]) : q.z;
    }
    this.stats.solveMs += performance.now() - tS;
  }

  // ------------------------------------------------------------------ Bahn

  /** Weltpunkt eines Linienpunkts (Hub über die tragende Fläche), gemerkt je Tiefe */
  /** Weltpunkt ohne Feld (freie Punkte beim Fitten: vorläufig, nie fest) */
  private worldPointCheap(q: Pt): Vec3 {
    const w = rayToWorld(this.at(q), q.z / LANE_DEPTH);
    return { x: w.x, y: w.y, z: q.z };
  }

  private worldPoint(o: BrushOptions, q: Pt): Vec3 {
    const lane = q.z / LANE_DEPTH;
    if (q.wp && Math.abs(q.wpLane - lane) < 0.02) return q.wp;
    const w = rayToWorld(this.at(q), lane);
    let y = w.y;
    const t0 = performance.now();
    if (o.field && !o.field.solid(w.x, w.y, lane)) {
      const floor = o.field.floor(w.x, w.y, lane);
      if (floor !== null) y = Math.max(y, floor + (o.clearance ?? 0.8) * 0.5);
    }
    this.queryMs += performance.now() - t0;
    q.wp = { x: w.x, y, z: q.z };
    q.wpLane = lane;
    return q.wp;
  }

  /**
   * Knoten der Bahn bis end (ausschließlich): die festen Segmente, dahinter neu gefittete (reduceNodes, gleichmäßig, so
   * wenige wie die Toleranz erlaubt; eng, wo eine Kreuzungsschranke gilt). Das erste neue Segment setzt G1 am letzten
   * festen an (dessen Endtangente wird vorgegeben). Segmente, deren Punkte samt fixBehind dahinter fest sind, werden
   * fest. Geschlossen: das letzte Segment endet in der Station mit deren Richtung, kein Endknoten.
   */
  private buildNodes(o: BrushOptions, closed: boolean, end = this.pts.length): TrackNode[] {
    const from = this.fitFrom;
    // gefittet wird immer bis zur Spitze (die Segmentierung am festen Ende hängt sonst davon ab, wo die Vorschau endet:
    // mit Fit nur bis zum festen Teil entstanden kurze Segmente an der Grenze, rund 10 Knoten je Strich mehr); gezeigt
    // wird bis end. Freie Punkte nehmen den billigen Weltpunkt (ohne Feld), ihre Segmente werden nie fest
    const total = this.pts.length;
    const frozenEnd = this.frozenEnd();
    const pts: Vec3[] = [];
    for (let i = from; i < total; i++) pts.push(i < frozenEnd ? this.worldPoint(o, this.pts[i]) : this.worldPointCheap(this.pts[i]));
    if (closed && pts.length) pts[pts.length - 1] = { ...this.worldPoint(o, this.pts[0]) };
    // Toleranz an Kreuzungen (siehe TOL_NEAR): je Paar aus dem Spielraum nach der Lösung, für beide Stellen ±1 Punkt
    const tolAt = new Float64Array(pts.length).fill(Infinity);
    const tighten = (k: number, tol: number) => {
      for (let m = Math.max(from, k - 1); m <= Math.min(total - 1, k + 1); m++) tolAt[m - from] = Math.min(tolAt[m - from], tol);
    };
    for (let i = from; i < total; i++) {
      const q = this.pts[i];
      if (!q.near) continue;
      const cx = Math.floor(q.p.X);
      for (let c = cx - 1; c <= cx + 1; c++) {
        const list = this.xCells.get(c);
        if (!list) continue;
        for (const j of list) {
          if (j > i - NEIGHBOR) continue;
          const r = this.pts[j];
          const rp = this.stageOf(r);
          const dX = q.p.X - rp.X;
          if (Math.abs(dX) >= PASS_SIDE + 2 * TOL_LOOSE) continue;
          const dz = q.z - this.zOf(r);
          const margin = Math.max(Math.hypot(dX, dz) - PASS_SIDE, Math.abs(q.p.Y - rp.Y - TILT_TAN * dz) - PASS_OVER);
          if (margin >= 2 * TOL_LOOSE) continue;
          const tol = Math.max(TOL_NEAR, margin / 2);
          tighten(i, tol);
          if (j >= from) tighten(j, tol);
        }
      }
    }
    const unit = (a: Vec3, b: Vec3): Vec3 | undefined => {
      const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l, z: (b.z - a.z) / l } : undefined;
    };
    const lastFixed = this.fixedSegs.length ? this.fixedSegs[this.fixedSegs.length - 1] : null;
    const startTangent = lastFixed ? unit(lastFixed.p2, lastFixed.p3) : undefined;
    const first = this.fixedSegs[0] ?? null;
    const endTangent = closed && first ? unit(first.p0, first.p1) : (this.endTangent ?? undefined);
    // ohne feste Segmente eine geschlossene Runde: Tangente an der Naht über sie hinweg (reduceNodes closed)
    const fit = pts.length >= 2 ? reduceNodes(pts, [], { even: FIT_TUNING.even, tolScale: FIT_TUNING.tolScale, evenSpan: FIT_TUNING.evenSpan, evenTurn: FIT_TUNING.evenTurn, tolAt, startTangent, endTangent, closed: closed && !first }) : { segments: [] as CubicSegment3[], indices: [] as number[] };
    // gezeigt bis end: ganze Segmente davor, das Segment mit dem Ende an der Sehnen-Parameterstelle geteilt
    let shown: CubicSegment3[] = fit.segments;
    if (!closed && end < total && fit.segments.length) {
      const endIdx = end - 1;
      shown = [];
      for (let k = 0; k < fit.segments.length; k++) {
        const a = from + fit.indices[k];
        const b = from + fit.indices[k + 1];
        if (b <= endIdx) {
          shown.push(fit.segments[k]);
          continue;
        }
        if (a >= endIdx) break;
        let cumA = 0;
        let cumE = 0;
        for (let i = a + 1; i <= b; i++) {
          const d = Math.hypot(pts[i - from].x - pts[i - 1 - from].x, pts[i - from].y - pts[i - 1 - from].y, pts[i - from].z - pts[i - 1 - from].z);
          cumA += d;
          if (i <= endIdx) cumE += d;
        }
        shown.push(splitCubic(fit.segments[k], cumA > 1e-9 ? cumE / cumA : 1).left);
        break;
      }
    }
    const segs = [...this.fixedSegs, ...shown];
    const nodeOf = (k: number): TrackNode => {
      const seg = segs[k];
      const nd = createNode(seg.p0.x, seg.p0.y, seg.p0.z / LANE_DEPTH);
      nd.outX = seg.p1.x - seg.p0.x;
      nd.outY = seg.p1.y - seg.p0.y;
      nd.outZ = (seg.p1.z - seg.p0.z) / LANE_DEPTH;
      if (k > 0) {
        const prev = segs[k - 1];
        nd.inX = prev.p2.x - prev.p3.x;
        nd.inY = prev.p2.y - prev.p3.y;
        nd.inZ = (prev.p2.z - prev.p3.z) / LANE_DEPTH;
      }
      return nd;
    };
    const nodes: TrackNode[] = this.fixedNodes.slice();
    for (let k = nodes.length; k < segs.length; k++) nodes.push(nodeOf(k));
    if (!segs.length) return nodes;
    const last = segs[segs.length - 1];
    if (closed) {
      nodes[0].inX = last.p2.x - last.p3.x;
      nodes[0].inY = last.p2.y - last.p3.y;
      nodes[0].inZ = (last.p2.z - last.p3.z) / LANE_DEPTH;
    } else {
      const nd = createNode(last.p3.x, last.p3.y, last.p3.z / LANE_DEPTH);
      nd.inX = last.p2.x - last.p3.x;
      nd.inY = last.p2.y - last.p3.y;
      nd.inZ = (last.p2.z - last.p3.z) / LANE_DEPTH;
      nodes.push(nd);
    }
    nodes[0].kind = 'station';
    // neue Segmente, deren Punkte (samt fixBehind dahinter) fest sind, werden fest; nicht beim Rundenschluss (alles endet)
    if (!closed) {
      const frozen = this.frozenEnd();
      // Schienenpunkt je innerem Linienpunkt eines festen Segments: Bezier an der Sehnen-Parameterstelle (dort liegt der
      // Fit in der Toleranz am Punkt); spätere Stränge messen ihren Abstand daran
      const chord = (a: number, b: number) => {
        const cum = [0];
        for (let i = a + 1; i <= b; i++) cum.push(cum[cum.length - 1] + Math.hypot(pts[i - from].x - pts[i - 1 - from].x, pts[i - from].y - pts[i - 1 - from].y, pts[i - from].z - pts[i - 1 - from].z));
        return cum;
      };
      const rails = (seg: CubicSegment3, a: number, b: number) => {
        const cum = chord(a, b);
        const L = cum[cum.length - 1];
        for (let i = a + 1; i < b; i++) {
          const q = this.pts[i];
          q.rail = L > 1e-9 ? bezierAt(seg, cum[i - a] / L) : null;
          q.railStage = q.rail ? toView(q.rail.x, q.rail.y, q.rail.z / LANE_DEPTH) : null;
        }
      };
      let k = 0;
      for (; k < fit.segments.length; k++) {
        const endIdx = from + fit.indices[k + 1];
        if (endIdx + Math.max(2, this.fixBehind) >= frozen) break;
        const seg = fit.segments[k];
        this.fixedSegs.push(seg);
        this.fixedEnd.push(endIdx);
        this.fixedNodes.push(nodes[this.fixedSegs.length - 1]);
        this.fitFrom = endIdx;
        rails(seg, from + fit.indices[k], endIdx);
      }
      // das erste nicht feste Segment reicht über die feste Grenze: ist sein fester Teil länger als FIX_SPAN, am festen
      // Ende teilen und den vorderen Teil fest machen (die Kurve bleibt dieselbe, ein Knoten kommt dazu)
      if (k < fit.segments.length) {
        const a = from + fit.indices[k];
        const b = from + fit.indices[k + 1];
        const cut = frozen - Math.max(2, this.fixBehind) - 1;
        if (cut - a >= FIX_SPAN / STEP && b - cut >= 3) {
          const cum = chord(a, b);
          const L = cum[cum.length - 1];
          const { left } = splitCubic(fit.segments[k], L > 1e-9 ? cum[cut - a] / L : 0.5);
          // der Knoten am Anfang des Segments wird fest (wie bei ganzen Segmenten); der Teilungspunkt wird beim nächsten
          // Fit der Anfang des Restes, G1 über die Endtangente des festen Teils
          this.fixedSegs.push(left);
          this.fixedEnd.push(cut);
          this.fixedNodes.push(nodes[this.fixedSegs.length - 1]);
          this.fitFrom = cut;
          rails(left, a, cut);
        }
      }
    }
    return nodes;
  }

  /** Punkte älter als FREEZE Meter hinter der Spitze einfrieren */
  private freeze(o: BrushOptions, final = false): void {
    const limit = this.freezeLimit(final);
    for (let i = this.baseLen; i < limit; i++) {
      const q = this.pts[i];
      if (q.frozen) continue;
      q.frozen = true;
      this.worldPoint(o, q);
      this.indexX(i);
    }
    this.stats.frozen = this.pts.filter((q) => q.frozen).length;
  }

  private rockRuns(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < this.pts.length; i++) {
      if (!this.pts[i].blocked) continue;
      let j = i;
      while (j + 1 < this.pts.length && this.pts[j + 1].blocked) j++;
      out.push([i, j]);
      i = j;
    }
    return out;
  }

  /** Zahl der festen Linienpunkte von vorn (alte Bahn mitgezählt) */
  private frozenEnd(): number {
    let f = this.baseLen;
    while (f < this.pts.length && this.pts[f].frozen) f++;
    return f;
  }

  /** end: so viele Linienpunkte werden Bahn (die Vorschau beim Malen endet am festen Teil, wenn der Vorlauf abgeschnitten ist) */
  private preview(o: BrushOptions, closed: boolean, end = this.pts.length): Strich2Preview {
    const tF = performance.now();
    const nodes = this.buildNodes(o, closed, end);
    this.stats.fitMs += performance.now() - tF;
    const n = this.pts.length;
    const z = new Float64Array(n);
    const cave = new Uint8Array(n);
    const rock: StagePoint[] = [];
    for (let i = 0; i < n; i++) {
      z[i] = this.pts[i].z;
      cave[i] = this.pts[i].cave ? 1 : 0;
      if (this.pts[i].blocked) rock.push(this.pts[i].p);
    }
    const frozen = this.frozenEnd();
    const frozenWorld = frozen > this.baseLen ? this.worldPoint(o, this.pts[frozen - 1]) : null;
    this.stats.capped = this.pts.reduce((s, q) => s + (q.capped ? 1 : 0), 0);
    return { path: { ...emptyPath(), nodes, closed, brush: true }, z, rock, cave, crossings: [], line: this.pts.map((q) => q.p), frozen, frozenWorld };
  }

  /** Länge der Linie bis zum letzten festen Punkt (Bühnen-Meter, ohne alte Bahn): bis hierher sind die Schienen endgültig */
  get frozenLength(): number {
    let l = 0;
    for (let i = this.baseLen + 1; i < this.pts.length && this.pts[i].frozen; i++) l += Math.hypot(this.pts[i].p.X - this.pts[i - 1].p.X, this.pts[i].p.Y - this.pts[i - 1].p.Y);
    return l;
  }

  /**
   * Vorschau beim Malen: Pinselpunkte übernehmen, freies Stück lösen, Punkte hinter dem Vorlauf einfrieren. cut: die Bahn
   * der Vorschau endet am festen Teil (der Vorlauf bleibt Tinte: „die Bahn zieht nach, wenn die Tiefe entschieden ist“);
   * sonst reicht sie bis zur Spitze, der Vorlauf vorläufig
   */
  update(points: StagePoint[], cut = true): Strich2Preview | null {
    const t0 = performance.now();
    this.queryMs = 0;
    this.stats.solveMs = 0;
    this.stats.crossMs = 0;
    this.stats.fitMs = 0;
    this.stats.conflicts = 0;
    const o = this.options();
    const before = this.pts.length;
    this.feed(points);
    if (this.pts.length - this.baseLen < MIN_LINE) return null;
    this.query(o, Math.min(before, this.lineFinal) - 2);
    this.findLoops();
    this.solveTwice(o);
    this.freeze(o);
    const end = cut ? Math.max(this.frozenEnd(), Math.min(this.pts.length, this.baseLen + 2)) : this.pts.length;
    const pv = this.preview(o, false, end);
    this.stats.ms = performance.now() - t0;
    this.stats.queryMs = this.queryMs;
    return pv;
  }

  /**
   * Loslassen: die ganze Pinsellinie übernehmen, den Rest lösen; endet sie nah am Anfang, ein neuer Weg ab dem festen
   * Ende in die Station (der gezeichnete Teil bleibt). Danach ist alles fest.
   */
  finish(points: StagePoint[], endAt?: Strich2End): Strich2Result | null {
    const o = this.options();
    const before = this.pts.length;
    if (endAt) {
      // Überzeichnen: die letzten GLUE Meter des Pinsels gleiten auf den Zielpunkt zu, der letzte Punkt liegt genau dort
      const pts = points.map((p) => ({ ...p }));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Y - pts[i - 1].Y));
      const L = cum[cum.length - 1];
      const last = pts[pts.length - 1];
      const dx = endAt.p.X - last.X;
      const dy = endAt.p.Y - last.Y;
      for (let i = 0; i < pts.length; i++) {
        const f = Math.max(0, 1 - (L - cum[i]) / GLUE);
        pts[i].X += dx * f;
        pts[i].Y += dy * f;
      }
      pts[pts.length - 1] = { ...endAt.p };
      points = pts;
      this.endTangent = endAt.tangent;
    }
    this.feed(points);
    if (this.pts.length - this.baseLen < 6) return null;
    if (endAt) {
      // die 1-m-Linie endet bis zu 1 m vor dem Pinselende: ein Linienpunkt genau am Ziel, dort setzt der Schwanz an
      const lp = this.pts[this.pts.length - 1];
      if (Math.hypot(lp.p.X - endAt.p.X, lp.p.Y - endAt.p.Y) > 0.01) this.pts.push(this.newPt({ ...endAt.p }, lp.z));
      this.lineFinal = this.pts.length;
    }
    this.query(o, Math.min(before, this.lineFinal) - 2);
    this.findLoops();
    this.solveTwice(o, endAt ? endAt.z : NaN);
    if (endAt) this.pts[this.pts.length - 1].z = endAt.z;
    // beim Loslassen ist ein noch offenes steiles Stück Höhe: alles bis FREEZE vor dem Ende wird fest
    this.freeze(o, true);
    let closed = false;
    const n = this.pts.length;
    const p0 = this.pts[0].p;
    const end = this.pts[n - 1].p;
    const gap = Math.hypot(end.X - p0.X, end.Y - p0.Y);
    if (!endAt && gap <= this.closeSnap && (n - 1) * STEP >= 40) {
      const ring = this.closeRing();
      if (ring) {
        this.dropFrom(ring.from);
        for (const p of ring.pts) this.pts.push(this.newPt(p, this.pts[this.pts.length - 1].z));
        this.lineFinal = this.pts.length;
        this.query(o, ring.from);
        this.solve(o, this.startZ);
        closed = true;
      }
    }
    for (let i = this.baseLen; i < this.pts.length; i++) {
      const q = this.pts[i];
      q.frozen = true;
      this.worldPoint(o, q);
    }
    const pv = this.preview(o, closed);
    const pts = this.pts.map((q) => this.worldPoint(o, q));
    if (closed) pts[pts.length - 1] = { ...pts[0] };
    return { path: pv.path, line: this.pts.map((q) => q.p), z: pv.z, pts, closed, rock: this.rockRuns() };
  }

  /**
   * Neuer Weg ab dem letzten festen Punkt in die Station: Dubins-Bögen (Radien CLOSE_RADII) bis zum Beginn einer geraden
   * Einfahrt, dann gerade in die Station; die kürzeste Art, die nicht weiter als CLOSE_TURN dreht. from: erster Index,
   * der ersetzt wird
   */
  private closeRing(): { from: number; pts: StagePoint[] } | null {
    const n = this.pts.length;
    let f = n - 1;
    while (f > this.baseLen && !this.pts[f].frozen) f--;
    if (f < Math.max(this.baseLen, 2) + 6) return null;
    const P0 = this.pts[0].p;
    const tsX = this.tsX || Math.sign(this.pts[Math.min(n - 1, 4)].p.X - P0.X) || 1;
    const thS = Math.atan2(0, tsX);
    const A = this.pts[f].p;
    const B = this.pts[f - 2].p;
    const start: Pose = { X: A.X, Y: A.Y, th: Math.atan2(A.Y - B.Y, A.X - B.X) };
    const goal: Pose = { X: P0.X - tsX * CLOSE_ENTRY, Y: P0.Y, th: thS };
    let best: { pts: StagePoint[]; cost: number } | null = null;
    for (const R of CLOSE_RADII) {
      for (const path of dubinsPaths(start, goal, R, 0.5)) {
        let turn = 0;
        let prev = start.th;
        let len = 0;
        let last: StagePoint = A;
        for (const p of path) {
          const th = Math.atan2(p.Y - last.Y, p.X - last.X);
          let d = th - prev;
          d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
          turn += Math.abs(d);
          prev = th;
          len += Math.hypot(p.X - last.X, p.Y - last.Y);
          last = p;
        }
        if (turn > (CLOSE_TURN * Math.PI) / 180) continue;
        const cost = len + turn * 4 * (16 / R);
        if (!best || cost < best.cost) best = { pts: path, cost };
      }
    }
    if (!best) return null;
    // auf STEP neu abtasten, dann die Einfahrt bis zur Station
    const entry: StagePoint[] = [];
    for (let d = CLOSE_ENTRY - 1; d > 1e-9; d -= 1) entry.push({ X: P0.X - tsX * d, Y: P0.Y, cx: P0.cx, cy: P0.cy });
    entry.push({ ...P0 });
    const all = [A, ...best.pts, ...entry];
    const out: StagePoint[] = [];
    let carry = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      const d = Math.hypot(b.X - a.X, b.Y - a.Y);
      if (d < 1e-9) continue;
      let t = STEP - carry;
      while (t <= d) {
        out.push(mixPoint(a, b, t / d));
        t += STEP;
      }
      carry = d - (t - STEP);
    }
    out.push({ ...P0 });
    // Strahlen: Punkte ohne Kamera bekommen die des festen Endes
    for (const p of out) {
      if (p.cx === undefined && A.cx !== undefined) {
        p.cx = A.cx;
        p.cy = A.cy;
      }
    }
    return { from: f + 1, pts: out };
  }
}
