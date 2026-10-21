/**
 * Gurte als Progression: Welt 1 fährt ohne Gurt (der Rauswurf ist der Humor), ab Welt 2 Beckengurt, Welt 4 Bügel,
 * Welt 6 Schulterbügel, Welt 9 Rennsitz. holdG: bis zu so viel g (Körpergewicht) hält der Gurt den Rumpf im Sitz,
 * darüber reißt er nach 0,2 s. sideG: Querbeschleunigung, ab der ein Fahrgast über die Bordwand kippt.
 */
import type { BeltLevel, LevelDef, WorldDef } from '@/levels/types';

export interface BeltSpec {
  holdG: number;
  sideG: number;
  name: string;
}

export const BELTS: Record<BeltLevel, BeltSpec> = {
  0: { holdG: 0, sideG: 2.2, name: 'keine' },
  1: { holdG: 0.6, sideG: 2.2, name: 'Beckengurt' },
  2: { holdG: 1.5, sideG: 2.8, name: 'Bügel' },
  3: { holdG: 3.0, sideG: 3.5, name: 'Schulterbügel' },
  4: { holdG: 5.0, sideG: 4.0, name: 'Rennsitz' },
};

/** Sekunden über der Haltekraft, nach denen der Gurt reißt */
export const BELT_SNAP_SECONDS = 0.2;

/** Gurtstufe eines Levels: eigener Wert oder der seiner Welt */
export function restraintFor(level: Pick<LevelDef, 'restraint'>, world: Pick<WorldDef, 'restraint'>): BeltLevel {
  return level.restraint ?? world.restraint;
}
