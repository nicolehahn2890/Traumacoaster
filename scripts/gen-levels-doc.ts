/**
 * Erzeugt docs/LEVELS.md aus den Level-Daten (src/levels). Aufruf: npm run levels:doc
 * Damit bleiben GDD-Anhang und Spiel immer identisch.
 */
import { writeFileSync } from 'node:fs';
import { LEVELS, unlockedUpTo } from '../src/levels/levels';
import { WORLDS } from '../src/levels/worlds';
import { ELEMENT_NAMES, goalLabel } from '../src/levels/goalLabels';
import { BELTS, restraintFor } from '../src/physics/belts';
import { hasNegativeGoals } from '../src/levels/evaluator';

const lines: string[] = [];
lines.push('# Anhang A: Die 150 Level von Trauma Coaster');
lines.push('');
lines.push('Automatisch erzeugt aus `src/levels/levels.ts` (`npm run levels:doc`). Jedes Level verlangt zusätzlich immer: Der Zug kommt heil in der Station an und kein Fahrgast fliegt heraus; nur in Leveln mit negativen Zielen (fliegt raus, wieder gefangen, Flug ≥ x m) ist der Rauswurf gewollt. Die Spalte „Gurt“ zeigt die Gurtstufe (Welt-Standard, einzelne Level weichen ab): ohne Gurt, Beckengurt (hält 0,6 g), Bügel (1,5 g), Schulterbügel (3 g), Rennsitz (5 g); darüber reißt der Gurt. Bonusziele (kursiv) zählen für den 2. und 3. Stern.');
lines.push('');

for (const w of WORLDS) {
  lines.push(`## Welt ${w.id}: ${w.name}`);
  lines.push('');
  lines.push(`**Thema:** ${w.theme}  `);
  lines.push(`**Look:** ${w.look}  `);
  lines.push(`**Schienenstil:** ${ELEMENT_NAMES[w.skin]}  `);
  lines.push(`**Gurt:** ${BELTS[w.restraint].name}`);
  lines.push('');
  lines.push('| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const id of w.levels) {
    const l = LEVELS[id - 1];
    const goals = l.goals.map((g) => (g.bonus ? `*${goalLabel(g)}*` : goalLabel(g))).join(', ');
    const terrain = l.terrain
      .map((t) => {
        switch (t.kind) {
          case 'flat': return 'eben';
          case 'hill': return `Hügel ${t.height} m`;
          case 'valley': return `Tal ${t.depth} m`;
          case 'mountain': return `Berg ${t.height} m`;
          case 'lake': return 'See';
          case 'river': return 'Fluss';
          case 'waterfall': return 'Wasserfall';
          case 'cliff': return `Klippe ${t.height} m`;
          case 'prop': return `Deko: ${t.id}`;
        }
      })
      .join(', ');
    const extras: string[] = [];
    if (l.physics?.friction) extras.push(`Reibung ×${l.physics.friction}`);
    if (l.physics?.gravity) extras.push(`Schwerkraft ×${l.physics.gravity}`);
    if (l.trackBudget) extras.push(`Budget ${l.trackBudget} m`);
    if (l.cars) extras.push(`${l.cars} Wagen`);
    const unlocks = (l.unlocks ?? []).map((u) => ELEMENT_NAMES[u]).join(', ') || '–';
    const belt = restraintFor(l, w);
    const beltCell = `${BELTS[belt].name}${l.restraint !== undefined ? '*' : ''}${hasNegativeGoals(l) ? ' (Rauswurf erlaubt)' : ''}`;
    lines.push(`| ${l.id} | ${l.name} | ${l.hook} | ${goals} | ${terrain}${extras.length ? ` (${extras.join(', ')})` : ''} | ${l.width} m | ${beltCell} | ${unlocks} |`);
  }
  lines.push('');
}

lines.push('## Freischalt-Reihenfolge');
lines.push('');
lines.push('| Nach Level | Element |');
lines.push('|---|---|');
lines.push('| Start | Zeichnen, Kettenzug, Holzbahn |');
for (const l of LEVELS) {
  for (const u of l.unlocks ?? []) lines.push(`| ${l.id} | ${ELEMENT_NAMES[u]} |`);
}
lines.push('');
lines.push(`Nach Level 150 freigeschaltet: ${unlockedUpTo(150).size} Elemente.`);
lines.push('');

// Schwierigkeitskurve als Übersicht
lines.push('## Schwierigkeitskurve (Maximalwerte pro Welt)');
lines.push('');
lines.push('| Welt | Höhe | Tempo | Loopings | Kurven | Tunnel | Coins | Airtime |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const w of WORLDS) {
  const max = (type: string) =>
    Math.max(0, ...w.levels.flatMap((id) => LEVELS[id - 1].goals.filter((g) => g.type === type).map((g) => g.value ?? 0)));
  lines.push(`| ${w.id} ${w.name} | ${max('height')} m | ${max('speed')} km/h | ${max('loops')} | ${max('turns')} | ${max('tunnels')} | ${max('coins')} | ${max('airtime')} s |`);
}
lines.push('');

writeFileSync(new URL('../docs/LEVELS.md', import.meta.url), lines.join('\n'), 'utf8');
console.log(`docs/LEVELS.md geschrieben: ${LEVELS.length} Level, ${WORLDS.length} Welten.`);
