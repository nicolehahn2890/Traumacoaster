/**
 * Erzeugt docs/ART-PROMPTS.md aus scripts/art-kit.json (eine Quelle für Namen, Größen, Prompts).
 *   node scripts/art-prompts-doc.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const KIT = JSON.parse(await readFile(new URL('./art-kit.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/\|/g, '\\|');
const sizeOf = (a) => (a.size[1] ? `${a.size[0]}×${a.size[1]}` : `${a.size[0]}×auto`);
const kindOf = (a) => {
  const k = [];
  if (a.procedural) k.push('prozedural');
  if (a.key) k.push('Alpha');
  if (a.seamless === 'xy') k.push('nahtlos');
  if (a.seamless === 'x') k.push('nahtlos horizontal');
  return k.join(', ') || 'Fläche';
};

const rows = KIT.assets.map((a) => `| \`${a.name}\` | ${sizeOf(a)} | ${kindOf(a)} | ${a.node ?? '–'} | ${esc(a.prompt)} |`).join('\n');

const md = `# Trauma Coaster – Texturen und Prompts

Diese Datei wird aus \`scripts/art-kit.json\` erzeugt (\`npm run art:doc\`); dort stehen Namen, Zielgrößen, Aufbereitungsregeln und Prompts. Der Kachelsatz wurde mit dem Figma-Bildgenerator erzeugt, Modell \`${KIT.model}\`, Datei ${KIT.figmaFile}. Danach \`npm run art:prep\`: Quellen aus \`art-src/<name>.png\` werden freigestellt (Chroma-Key), zugeschnitten, kachelbar gemacht und als WebP nach \`public/art/\` geschrieben; \`public/art/manifest.json\` listet die vorhandenen Kacheln. Zwei Kacheln (\`glow\`, \`stipple_sheet\`) entstehen prozedural.

**Stil-Vorspann für alle Prompts (Englisch, weil die Modelle Englisch besser verstehen):**
\`\`\`
${KIT.style.trim()}
\`\`\`

| Name | Größe | Art | Figma-Knoten | Motiv (Prompt nach dem Vorspann) |
|---|---|---|---|---|
${rows}

**Hinweise**
- Freisteller werden auf einem einfarbigen Key-Hintergrund erzeugt (Magenta \`#FF00FF\`, für Neon Grün \`#00FF00\`, für die Blatt-Form Weiß). Das Prep-Skript rechnet den Farbsaum heraus und schneidet auf den Inhalt zu.
- Die Kacheln sind farbig in der Wiesenland-Palette gemalt. Welten färben per \`tint\` um; kräftige Umfärbungen (Nacht, Vulkan) brauchen eigene Varianten oder die Paletten-Shader (Paket D3).
- Neue Kachel: Eintrag in \`scripts/art-kit.json\`, Bild nach \`art-src/\`, Name in \`ART_NAMES\` (\`src/assets/manifest.ts\`), dann \`npm run art:prep\` und \`npm run art:doc\`.
- Die Quellbilder (\`art-src/\`) liegen nicht im Repository (\`.gitignore\`); die Figma-Datei ist das Archiv.
`;
await writeFile(new URL('../docs/ART-PROMPTS.md', import.meta.url), md);
console.log('docs/ART-PROMPTS.md geschrieben');
