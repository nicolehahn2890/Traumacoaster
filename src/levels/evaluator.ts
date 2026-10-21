/**
 * Zielauswertung: Welche Ziele sind geometrisch (beim Zeichnen) und welche erst nach der Fahrt erfüllt?
 */
import type { TrackPath } from '@/track/model';
import type { TrackStats } from '@/track/model';
import type { RideStats } from '@/physics/trainSim';
import type { Goal, LevelDef } from './types';

export interface GoalResult {
  goal: Goal;
  /** erfüllt */
  done: boolean;
  /** aktueller Wert (für Anzeige) */
  value: number;
  /** Ziel kann schon beim Zeichnen bewertet werden */
  static: boolean;
}

export interface Evaluation {
  goals: GoalResult[];
  requiredDone: boolean;
  bonusDone: boolean;
  stars: number;
  cleanRide: boolean;
}

const STATIC: Set<Goal['type']> = new Set(['height', 'loops', 'turns', 'lanes', 'length', 'maxLength', 'rolls', 'launch', 'chainlift', 'boosters', 'noBrakes', 'drop', 'element']);

/** Negative Ziele: Rausfliegen, Fangen, Flugweite. In Leveln mit solchen Zielen ist ein Rauswurf kein Fehlschlag. */
export const NEGATIVE: Set<Goal['type']> = new Set(['eject', 'catch', 'flight']);

export function hasNegativeGoals(level: Pick<LevelDef, 'goals'>): boolean {
  return level.goals.some((g) => NEGATIVE.has(g.type));
}

/** Anzahl eingebauter Elemente eines Typs (Regal-Elemente und Vorlagen) */
function countElement(path: TrackPath, id: string): number {
  const fromTemplates = path.templates[id] ?? 0;
  const map: Record<string, string> = { booster: 'booster', brake: 'brake', splash: 'splash', doubleLaunch: 'launchBlock', switchTrack: 'switch', reverse: 'reverse', tilt: 'tilt', dropTrack: 'dropTrack' };
  const kind = map[id];
  const fromElements = kind ? path.elements.filter((e) => e.kind === kind).length : 0;
  const fromStart = (id === 'hydroLaunch' && path.startType === 'hydro') || (id === 'swingLaunch' && path.startType === 'swing') || (id === 'verticalLift' && path.startType === 'verticalLift') ? 1 : 0;
  return fromTemplates + fromElements + fromStart;
}

export function evaluateGoal(goal: Goal, path: TrackPath, ts: TrackStats, ride: RideStats | null, finished: boolean): GoalResult {
  const v = goal.value ?? 0;
  const isStatic = STATIC.has(goal.type);
  let value = 0;
  let done = false;
  switch (goal.type) {
    case 'finish': value = finished ? 1 : 0; done = finished; break;
    case 'height': value = ts.maxHeight; done = value >= v - 0.05; break;
    case 'drop': value = ts.maxDrop; done = value >= v - 0.05; break;
    case 'loops': value = ts.loops; done = value >= v; break;
    case 'turns': value = ts.turns; done = value >= v; break;
    case 'lanes': value = ts.lanes; done = value >= v; break;
    case 'rolls': value = ts.rolls; done = value >= v; break;
    case 'length': value = ts.length; done = value >= v; break;
    case 'maxLength': value = ts.length; done = value <= v; break;
    case 'launch': value = path.startType === 'launch' || path.startType === 'hydro' || path.startType === 'swing' ? 1 : 0; done = value > 0; break;
    case 'chainlift': value = path.startType === 'chainlift' || path.startType === 'verticalLift' ? 1 : 0; done = value > 0; break;
    case 'boosters': value = path.elements.filter((e) => e.kind === 'booster' || e.kind === 'launchBlock').length; done = value >= v; break;
    case 'noBrakes': value = path.elements.some((e) => e.kind === 'brake') ? 0 : 1; done = value > 0; break;
    case 'element': value = countElement(path, goal.element ?? ''); done = value >= Math.max(1, v); break;
    case 'coins': value = ride?.coins ?? 0; done = !!ride && finished && value >= v; break;
    case 'tunnels': value = ride?.tunnels ?? 0; done = !!ride && finished && value >= v; break;
    case 'airtime': value = ride?.airtime ?? 0; done = !!ride && finished && value >= v; break;
    case 'speed': value = (ride?.maxSpeed ?? 0) * 3.6; done = !!ride && finished && value >= v; break;
    case 'time': value = ride?.time ?? 0; done = !!ride && finished && value >= v; break;
    case 'maxTime': value = ride?.time ?? 0; done = !!ride && finished && value <= v; break;
    case 'maxG': value = ride?.maxG ?? 0; done = !!ride && finished && value <= v; break;
    case 'minG': value = ride?.maxG ?? 0; done = !!ride && finished && value >= v; break;
    case 'splash': value = ride?.splashes ?? 0; done = !!ride && finished && value >= v; break;
    case 'eject': value = ride?.ejected ?? 0; done = !!ride && finished && value >= v; break;
    case 'catch': value = ride?.caught ?? 0; done = !!ride && finished && value >= v; break;
    case 'flight': value = ride?.flightMax ?? 0; done = !!ride && finished && value >= v; break;
  }
  return { goal, done, value, static: isStatic };
}

export function evaluate(level: LevelDef, path: TrackPath, ts: TrackStats, ride: RideStats | null, finished: boolean, allSeated: boolean): Evaluation {
  // Niemand darf rausfliegen, außer das Level will es (negative Ziele); ankommen muss der Zug immer
  const seatedOk = hasNegativeGoals(level) ? true : allSeated;
  const goals = level.goals.map((g) => evaluateGoal(g, path, ts, ride, finished && seatedOk));
  const required = goals.filter((g) => !g.goal.bonus);
  const bonus = goals.filter((g) => g.goal.bonus);
  const requiredDone = required.every((g) => g.done) && finished && seatedOk;
  const bonusDone = bonus.length ? bonus.every((g) => g.done) : !!ride && finished && (level.coins?.length ?? 0) > 0 ? ride!.coins >= (level.coins?.length ?? 0) : requiredDone;
  const cleanRide = !!ride && !ride.blackout && !ride.brakesUsed;
  let stars = 0;
  if (requiredDone) stars = 1;
  if (requiredDone && bonusDone) stars = 2;
  if (requiredDone && bonusDone && cleanRide) stars = 3;
  return { goals, requiredDone, bonusDone, stars, cleanRide };
}
