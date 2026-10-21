# Trauma Coaster – Stil-Bibel

**Leitbild:** Eyvind Earle × Rayman Legends. Flache, harte Silhouetten in drei Tönen, Punktraster auf den Schattenseiten, schwarze verzweigte Stämme mit farbigen Flecken, Hügel als parallele Bänder, Luftperspektive in klaren Farbstufen, dazu die Sattheit und das Leuchten von Rayman. Alles wirkt gemalt und aus einem Guss: Karte, Level, Zug, Fahrgäste, Oberfläche. Wild und abgefahren, aber lesbar: Die Bahn ist immer das Klarste im Bild.

Referenzen liegen unter `refs/` (Earle: `refs/eyvind earle/`, Feedback-Auswahl in `feedback-2026-09-30/`; Rayman: `refs/rayman legends/`; Figuren: `refs/south park - terrence und phillip.png`).

## 1. Die sechs Regeln

1. **Harte Kanten, drei Töne.** Jede Fläche hat genau drei Werte: Licht, Mittelton, Schatten (`tones()` in `src/render/palette.ts`). Keine weichen Verläufe innerhalb einer Form; Verläufe gibt es nur im Himmel und als Luftperspektive zwischen den Spuren.
2. **Stippling auf der Schattenseite.** Punkte (ein bis drei Pixel bei 1×, Farbe `palette.stipple`) sitzen am Rand der Schattenflächen und in Baumkronen; sie werden zur Lichtseite hin dünner. Nie auf der Bahn, nie auf Figuren.
3. **Schwarze Stämme, farbige Flecken.** Bäume, Pfeiler und Stützen sind verzweigte schwarze Silhouetten (einzige Stelle mit reinem Schwarz), auf denen kleine Farbflecken aus der Palette sitzen (Flechten, Lichter, Blätter). Kronen sind Kugeln, Fächer oder Sternnadeln.
4. **Hügel als Bänder.** Berge und Hügel bestehen aus drei bis vier parallelen Konturbändern (Inset-Polygone, Abstand 1,5 m × Spurmaßstab), abwechselnd im Licht- und Mittelton; Schneefelder und Wiesen sind glatte, helle Flächen dazwischen.
5. **Luftperspektive in Stufen.** Spur −2 (vorne) ist satt, Spur +2 (hinten) in zwei klaren Schritten heller und zum Himmel hin gemischt (`atmosphereStep()`). Konturen vorne 0,22 m, hinten 0,12 m.
6. **Leuchten nur auf Interaktivem.** Coins, Chips, Handles, Zielmarker, Schienenkanten bei Nacht und Laternen leuchten (`palette.glow`, additiv, halbe Auflösung). Terrain leuchtet nie.

## 2. Welten und Tokens

Die Tokens stehen in `src/levels/worlds.ts` (`palette`). Jede Welt: Himmel (Zenit, Mitte, Horizont), Boden (Licht, Schatten), Akzent, Tinte, Leuchten, Stippling.

| Welt | Stimmung | Akzent | Tinte | Leuchten |
|---|---|---|---|---|
| 1 Wiesenland | Sommer, Kugelbäume, Gänseblümchen-Stippling | Pink `#ff5c8a` | `#1f3a2a` | `#fff3a0` |
| 2 Jahrmarkt | Abendrot, Buden-Silhouetten, Lichterketten | Pink | `#3a1c4a` | `#ffd56b` |
| 3 Minenberg | Fels in Bändern, Goldadern, Laternen | Gold `#ffb13b` | `#3b2418` | `#ffd27a` |
| 4 Seenland | Wasserbänder, Schilf-Fächer, Stege | Türkis `#3ec7c2` | `#1e3c3a` | `#bff4ff` |
| 5 Schlossreich | Rosa Himmel, Türme als Silhouetten, Gold | Gold `#ffd23f` | `#3a2a4a` | `#fff1b8` |
| 6 Großstadt | Nacht, Hochhaus-Bänder, Neon | Cyan `#3ec7c2` | `#101428` | Pink `#ff6fae` |
| 7 Eisgipfel | Tannen aus Punkten, Schneeflächen, Polarlicht | Rosa `#ff9ecf` | `#2b4a66` | Weiß |
| 8 Geisterhaus | Violette Nacht, krumme Stämme, Nebelbänder | Violett `#9b6dff` | `#0d0b1f` | Giftgrün `#b7ff6b` |
| 9 Vulkaninsel | Schwarzes Gestein, Lavaadern, Funken | Orange `#ff8a5c` | `#1a0b0b` | `#ffb13b` |
| 10 Weltraum | Sterne, Nebel in Bändern, Ringe | Grün `#7ee081` | `#05010f` | Hellblau `#8fd3ff` |

Grundakzent des Spiels (UI): Pink `#ff5c8a`, Tinte `#2a1f3d`, Papier `#fff8ec`.

## 3. Elemente

- **Himmel:** drei hart gestufte Bänder aus `palette.sky`, Stippling an den Bandkanten, Sonnenstrahlen als transparente Fächer. Wolken flach gestapelt (zwei bis drei Scheiben) mit harter Unterkante, Stippling-Rand, Rim-Light oben; drei Parallaxe-Ebenen, auf Karte und im Level dieselben.
- **Boden (fünf Spuren):** pro Spur ein Band in drei Tönen, Silhouette aus dem Terrain, Stippling-Blattwerk entlang der Schattenkante, Kugelbäume und Fächer als Deko.
- **Berge:** Silhouette plus Konturbänder; Tunnel als Ausschnitt (Ameisenfarm) mit dunkler Höhle, Kristallen oder Laternen und Portal-Bögen mit Schlussstein.
- **Wasser:** Bänder in zwei Blautönen, Glanzstriche, Reflexion der Bahn verzerrt (Shader), Gischt als Stippling.
- **Schienen:** Band-Mesh entlang der Bahn mit gemalter Textur je Skin, Schwellen als Sprites, Leuchtkante bei Nacht. Die Bahn hat die stärkste Kontur im Bild.
- **Pfeiler und Streben:** je Welt eine Form (Wiesenland: verzweigte Stämme mit Blattkugeln; Mine: Holzböcke mit Laternen; Eis: Kristalle; Space: schwebende Ringe …), symmetrisch zur Bahn, Füße auf der Bodenoberfläche ihrer Spur, Brücken über Wasser.
- **Zug:** satte Wagenfarbe, Innenraum dunkel, Glanzlinie, Nase mit Lampe; Absperrband gelb/schwarz an offenen Enden.
- **Figuren:** Cut-out-Puppen (Terrance & Phillip): flache Teile, Perlenaugen, Kopf klappt an der Mundlinie, Bewegung auf Zweiern (12 Schritte/s), große Farbflächen ohne Verlauf.
- **UI:** Papier-Sticker mit Tinte-Kontur, leicht gedreht, Pop-in; Display-Schrift Fredoka, Text Nunito, illudiy-Logo in Lobster.

## 4. Texturen (Drop-in)

Echte gemalte Kacheln liegen unter `public/art/<name>.webp` (PNG als Fallback) und werden über `public/art/manifest.json` geladen (`src/assets/manifest.ts`). Fehlt eine Kachel, nimmt das Spiel die prozedurale Version.

Der erste Kachelsatz (24 Kacheln) ist mit dem Figma-Bildgenerator entstanden, Modell `gpt-image-2.5-sunburst` (Gemini Flash war im Vergleich weicher und weniger Earle). Eine Quelle für alles ist `scripts/art-kit.json`: Name, Zielgröße, Figma-Knoten, Aufbereitungsregel und Prompt je Kachel. `npm run art:prep` liest die Quellbilder aus `art-src/` (nicht im Repository, die Figma-Datei ist das Archiv), stellt Freisteller per Chroma-Key frei (Magenta, für Neon Grün, für Formen Weiß; Farbsaum wird herausgerechnet, Magenta-Reste in getupften Motiven per Despill entfernt, gemalte Schlagschatten auf dem Key werden halbtransparentes Dunkel), schneidet auf den Inhalt zu, macht Flächen kachelbar (Ränder mit der halb verschobenen Kachel überblendet) und schreibt WebP plus Manifest. `glow` und `stipple_sheet` entstehen prozedural (SVG), weil sie exakt und kachelbar sein müssen. `npm run art:doc` erzeugt daraus `docs/ART-PROMPTS.md`. Falls später CC0-Kacheln dazukommen: Lizenz in `public/art/LICENSES.md` vermerken.

## 4a. Shader (Stand)

Das Stippling der Regel 2 kommt aus dem Spur-Filter (`src/render/shaders/laneFilter.ts`): Punkte in `palette.stipple` auf allen Pixeln unterhalb der Helligkeitsschwelle, dichter zum Schatten hin, in Bildschirmpixeln (bleiben bei jedem Zoom ein bis drei Pixel). Leuchten (Regel 6) läuft über die additive Leuchtebene je Spur (`glowLayer.ts`). Beides lässt sich mit `?fx=0` abschalten und im Dev-Overlay (`?dev=1`, Taste F) vergleichen.

## 5. Was nicht in den Stil gehört

Weiche Cel-Shading-Verläufe, fotorealistische Texturen, Glitzer auf dem Terrain, reines Schwarz außer auf Stämmen und Stützen, Text im Bild, Bewegungsunschärfe.
