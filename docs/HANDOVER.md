# Übergabe – Trauma Coaster (Stand 23.10.2026)

Für die nächste Session (Florian oder wer auch immer weitermacht): Was fertig ist, was offen ist, wie du
weiterarbeitest und welche Regeln gelten. Das Spielkonzept steht in `docs/GDD.md`, die Technik in
`docs/TECH.md`, der Stil in `docs/ART.md`, der Plan mit allen Paketen und dem Umsetzungsstand in `docs/PLAN.md`.

## 1. Wo wir stehen

- **24.10.: Richtlinie und Tiefen-Labor.** Florians Klarstellungen und Fragen stehen in
  `docs/research/2026-10-24-klarstellungen-und-fragen.md`, die Antwort mit Messungen und Entscheidung in
  `docs/RICHTLINIE.md` (Kurzfassung: Weltrenderer zu Three.js mit geneigter Perspektivkamera, Pixi bleibt fürs HUD;
  Tiefenpuffer statt Masken; eine Shadow Map; Umfärben per Shader; Untergrund als Baustelle + Freilegung; größere
  Zeichenwerkzeuge auf dem Handy). Das Labor `public/labs/tiefe.html` (Three.js vom CDN, Assets in
  `public/labs/assets/`) zeigt dieselbe Szene als Bühne und als 3D-Welt; `node scripts/lab-stills.mjs` erzeugt
  Standbilder nach `docs/research/labs/`. Außerdem umgesetzt: Vollbild auf dem Handy (Bühne unter Kerbe und
  Home-Leiste, Bedienelemente weichen über `src/platform/safeArea.ts` aus) und Pinselgrößen per Adresse
  (`?tip=&line=&band=&dzoom=`). Noch nicht auf einem echten Handy geprüft.
  Zweite Runde am selben Tag: das Labor baut die Bahn als Profil (Straße, Stahl, Holz, Hängebahn) mit eigenen
  Stützenfamilien (Beton brutalistisch, Rohrpylon, Holzbock, Betonportal), Füße per Alpha-Scan auf den Kulissen;
  Zählung und Antwort zu Meshy in `docs/RICHTLINIE.md`, Abschnitt 3a.
  Erste Handy-Messung (Florian, iPhone): Holzbahn im Labor 48–55 fps beim Ziehen, flüssig; Leistung soll
  immer top sein, Ziel 60 fps, siehe Richtlinie Abschnitt 12.
  Entscheidungen 24.10.: Zoom als Kamerafahrt (nicht Linse), Shadow Map bleibt; dreimal „+40 Ebenen“ ohne Shadow
  Map, Neon, Holz: etwa 50–60 fps.

- **`main` ist der Prototyp (23.10.):** Der Pinsel-Stand ist der neue Hauptzweig, lokal und auf GitHub gleich; jeder
  Push auf `main` geht über `.github/workflows/deploy.yml` auf https://nicolehahn2890.github.io/Traumacoaster/. Die
  alten `claude/*`-Branches waren vollständig enthalten und sind gelöscht. Aufgeräumt: Fremde Referenzbilder (Earle,
  Rayman, South Park) und das Prompt-Dokument liegen nur noch lokal (`refs/`, `*.docx` sind ignoriert; in der
  Git-Historie stehen sie noch). Neu: Auf dem Handy als Vollbild-App (Manifest, Symbole, Spielfläche im sicheren
  Bereich ohne Kerbe und Home-Leiste, README „Auf dem Handy testen“). Die Browser-Szenarien laufen in der Lesart
  „Bühne“ (`&stage`), für die sie geschrieben sind, und ohne Autoscroll (`&scroll=0`): Der neue Autoscroll setzt schon
  in 30 % Abstand vom Rand ein und verzerrte die in festen Bildschirmkoordinaten gezeichneten Striche. Im Szenario 5
  sind die Fahrgäste vor der Fahrt ans offene Ende angeschnallt (ohne Gurt flog je nach Takt einer heraus, der Test
  schwankte). Alle 9 Szenarien grün (65 Prüfungen).
- **Inhalt (23.10.):** Der Pinsel-Spike führt `claude/nice-cannon-094fka` (Gesten v3, Ein Strich, Kreuzungsprüfung)
  mit dem Pinsel zusammen: vier Lesarten zum Vergleich über den Knopf unten links
  (Pinsel → Bühne → 1 Strich → Ebenen), Tiefe überall gerade nach hinten (`LANE_SCALE = 1`), Pinsel mit zäher Bahn,
  Schleppe und Live-Schienen, Kreuzungen per Tipp tauschbar, einrastende Tiefen, Ebenen-Lesart mit Ebenenleiste,
  Streckenanzeige mit Budget-Regler, Schwachstellen-Marker für alle Lesarten, neuer Autoscroll, Zeichen-Zoom auf dem
  Handy, Strich-Rekorder mit `npm run strokes:replay` (README, TECH.md 4b bis 4d). Danach: Pinsel mit Loopings
  (hohe Schleife) und geraden Hügeln, ruhigere Schienen-Schräglage mit dem Wagen darauf, weniger und gleichmäßiger
  verteilte Knoten, ausgedünnte Stützen, Ebenen mit Weiterzeichnen auf der gewählten Ebene und Auto-Knopf. Florian
  gefällt der Pinsel am besten. Offen: welche Lesart bleibt; Level, Coins und Ziele für Pinsel und Ebenen; Leistung
  auf echten Handys.
- **Davor:** PR #1 (M1 bis M5/D3) und PR #2 (Spur-Filter) am 21.10. gemerged, PR #3 (D4 Pfeiler je Welt, Schienen
  als Band-Mesh) danach; Gesten v3 (`docs/PLAN.md`, M2/A8) kam über den Pinsel-Spike nach `main`.
- **Plan:** `docs/PLAN.md` (18 Anpassungen aus dem ersten Spieltest, Pakete A–F, Meilensteine M1–M6) ist der alte
  Plan; unten steht je Meilenstein der „Umsetzungsstand“. Als Nächstes kommt ein neuer Plan für die erste Zone mit
  finaler Grafik (Abschnitt 3).
- **Fertig und gepusht:** M1 Fundament, M2 Zeichnen, M3 Fahrt und Scheitern, M4 Karte, D2 Textur-Kit,
  M5/D3 Shader-Grundlage (Commit e00ec84), M5/D4 Pfeiler je Welt und Schienen als Band-Mesh (letzter Commit).
- **Offen laut altem Plan:** D5 Terrain neu → D6 Wolken im Earle-Stil → E1 Tunnel-Workflow →
  E2 Harmonie Stützen/Brücken/Wasser → M6 (F1 PWA, Capacitor 8, Haptik, 120-Hz-Ticker, WebGPU-Flag,
  Screenshot-Baselines; F2 Doku-Abschluss; Vollbild-App und sicherer Bereich sind schon da). Die Details je Paket
  stehen in `docs/PLAN.md`, Abschnitt „Pakete im Detail“. Der neue Plan ordnet das neu.

## 2. So fängst du an

```
git fetch origin
git checkout -b <dein-branch> origin/main
npm ci
npm test                      # Vitest, 26 Dateien
npm run build                 # Typecheck + Build
npx playwright install chromium   # einmalig
node scripts/scenario.mjs 1 2 # Playwright-Szenarien (Lesart Bühne, Schritte wählbar); Screenshots nach screenshots/
npm run dev                   # http://localhost:5173, zeichnet jeden Strich in recordings/strokes.jsonl auf
npm run strokes:replay        # aufgezeichnete Striche in allen vier Lesarten nachspielen
```

Nützliche URL-Parameter im Spiel: `?scene=start&level=8` (direkt ins Level), `?fast=6` (Zeitraffer),
`?brush` / `?stage` / `?single` / `?lanes` (Lesart erzwingen), `?scroll=0` (kein Autoscroll beim Zeichnen, für
Skripte), `?fx=0` / `?fx=1` (Shader aus/an, sonst automatisch
ab sechs CPU-Kernen), `?dev=1` (Overlay mit fps, Draw-Calls, Partikeln; Taste F schaltet die Effekte um).
Eigene automatische Tests im Dev-Server mit `TC_NO_RECORD=1`, damit sie die echten Aufnahmen nicht verfälschen.

## 3. Nächster Schritt: Plan für die erste Zone

Florian arbeitet mit GPT ein Grafiksystem aus (lokal unter `refs/Traumacoaster-Visuals/`, nicht im Repository) und
will es zusammen mit seinen Testergebnissen prüfen lassen und daraus einen Plan für eine erste Zone mit allen
Funktionen und finaler Grafik machen; die Level-Logik folgt aus den Elementen dieses Plans.

Vorarbeit für das Terrain (Paket D5 des alten Plans) liegt bereit:
- `src/render/geom.ts`: `insetPolygon` (parallele Konturbänder für Berge, Schleifen werden herausgeschnitten),
  `selfIntersects`, `signedArea`; Tests in `tests/geom.test.ts`.
- `src/render/stripMesh.ts`: `buildStrip`/`StripMesh` (Textur entlang einer Polylinie, Batch-Modus).
- Kacheln in `public/art/`: `grass_brush_a..c`, `rock_a..b`, `leaf_dot`, `stipple_sheet`, `tree_ball`,
  `tree_fan`, `fir_dots`, `snow_field`, `water_band`, `portal_arch`, `crystal`, `lantern`, `glow`.
  Zugriff über `art(ART_NAMES.x(), fallback)` und `hasArt(name)` (`src/assets/manifest.ts`).
- Paletten je Welt: `WorldDef.palette` (`src/levels/worlds.ts`), Tonstufen über `tones()` in
  `src/render/palette.ts`, Luftperspektive über `atmosphere()` in `src/render/terrainRenderer.ts`.

Umsetzung laut Plan: `terrainRenderer.redraw` zeichnet je Spur ein Band in drei harten Tönen (Silhouette
ohne Wackeln in y), Stippling-Blattwerk entlang der Schattenkante als Sprites (`leaf_dot`, deterministisch,
etwa einer je Meter, Deckel 1500, Culling über `camera.view`), Kugelbäume aus `props.ts`/`tree_ball`
gestreut über `Terrain.scatter(seed)` (nicht auf Wasser oder Bahn), Berge als Silhouette plus drei bis vier
Konturbänder (`insetPolygon`, Abstand 1,5·k) mit Schneefeld in W3/W7, Wasser als Mesh mit Graphics-Fallback.
Prüfung: `insetPolygon` ohne Selbstschnitte, `scatter` deterministisch, Szenarien 1/2/8 grün, Screenshots
ansehen.

## 4. Arbeitsweise je Paket

1. Code + Tests (`tests/*.test.ts`, Vitest, Node-Umgebung ohne Pixi: nur reine Funktionen testen).
2. `npm test`, `npm run build`, betroffene Szenarien (`node scripts/scenario.mjs <Schritte>`), Screenshots in
   `screenshots/` ansehen (ist gitignored).
3. Doku nachziehen: `docs/PLAN.md` Umsetzungsstand (eigener Punkt je Paket, mit Abweichungen vom Plan),
   `docs/TECH.md` (Technik), bei Konzeptänderungen `docs/GDD.md`, bei Stil `docs/ART.md`. Level-Änderungen:
   `npm run levels:doc` erzeugt `docs/LEVELS.md`.
4. Commit auf Deutsch (Betreff beschreibt das Spielverhalten, Rumpf die Dateien), Push auf den
   eigenen Branch, CI-Lauf im Actions-Tab prüfen (`.github/workflows/ci.yml`: Job `test` plus Matrix
   `scenario` 1–9), dann per Pull Request nach `main` (deployt auf GitHub Pages).

## 5. Regeln und Eigenheiten

- Keine Modell- oder Werkzeugnamen in Dateien, Commits oder Kommentaren. Die Attributionszeilen am Ende
  der Commit-Nachricht gibt die jeweilige Session vor.
- `art-src/` (Quellbilder der Kacheln) ist nicht im Repository; das Archiv ist die Figma-Datei
  „Trauma Coaster – Art Kit“. `npm run art:prep` erzeugt daraus `public/art/` und das Manifest. Figma-Asset-URLs
  sind kurzlebig: nie in Dateien ablegen. Neue Kacheln brauchen den Figma-Connector mit dem Pro-Konto
  (Anleitung in `docs/PLAN.md`, „Figma-Anbindung“).
- Spieltexte in `src/core/locales/de.json` und `en.json` (beide pflegen); Finanz-Jargon gibt es hier nicht,
  das Spiel ist für Kinder und Familien.
- Szenarien öffnen Level 8 mit `?fast=6&fx=1` (Shader werden unter SwiftShader kompiliert). Schritt 2 läuft
  zusätzlich mit `?dev=1` und prüft das Draw-Call-Budget (< 150 im Zeichenmodus).
  Schritte: 1 Oval (+ stehender Zug, Himmel-Übergabe), 2 Hügel+Oval mit Schräglage (+ Draw-Calls, Pfeiler),
  3 Steilkurve, 4 Looping, 5 Löschen/Überzeichnen/Vorschau/Absperrband, 6 Rundkurs von Hand,
  7 Bearbeiten (Segment ziehen, Langdruck), 8 Entgleisen auf Holz (Freiflug, Sticker), 9 Karte (Glücksrad,
  gemeinsamer Himmel, Play mittig).
- Playwright-Szenarien dauern unter Software-Rendering mehrere Minuten je Schritt; lokal einzeln starten.
- Vitest-Tests laufen in Node ohne DOM/WebGL: Renderer-Klassen nicht importieren, nur reine Module
  (`geom.ts`, `supportStyle.ts`-Planer, `skyMath.ts`, `wheelPhysics.ts`, Physik, Track).

## 6. Offene Befunde und Entscheidungen (für Nicole)

- Welt 1 ohne Gurt: große Hügel werfen die Fahrgäste schon an der Kuppe raus, bevor die Bahn etwas anderes
  zeigt (Airtime bei Lift-Tempo ist Absicht). Stellschrauben: `CREST_G` in `src/physics/passengers.ts` oder
  eine frühere Gurtstufe in `src/levels/worlds.ts` (`restraint`). Siehe `docs/PLAN.md`, M3.
- D4 weicht vom Plan ab: keine gemalten Texturen auf Pfosten und Streben (bei 8–14 Pixel je Meter unsichtbar);
  gemalte Kacheln nur als Ornamente (Laterne, Kristall, Neon) und als Maserung des Schienenprofils.
- Die Figma-Kacheln `rail_<skin>_*` aus dem Plan gibt es nicht; das Schienenprofil ist prozedural
  (`railProfileTexture` in `src/render/paint.ts`).
- Audio gibt es nur als Hooks (`src/core/audio.ts`); Vorlagen-Elemente, Weichen, Community-Teilen und
  Store-Builds sind bewusst nicht im Plan.
- Sichtbefund, noch nicht untersucht: Im Zeichenmodus liegen am Bahnhof hinter dem stehenden Zug zwei große
  Scheiben (dunkelblau und grün, etwa 2,5 m Durchmesser, sie liegen innerhalb der Spur-Ebene, denn der
  Stippling-Filter greift auf sie). Das war schon vor D4 so (Screenshots `scenario-1-oval.png` und
  `scenario-7-bend.png`); der Bahnhof (`TrackRenderer.drawStation`: Bahnsteig, Pfosten, Dach, Fahne) ist auf
  diesen Bildern nicht zu erkennen. Kandidaten: Teile des stehenden Zugs (`LevelScene.buildStandingTrain`,
  `TrainRenderer.setStanding`/`idleUpdate`) mit falscher Skalierung oder die Zeichenreihenfolge in der
  Spur-Ebene. In der Fahrt sieht der Zug richtig aus.

- Befunde aus dem Spieltest am 21.10. abends (noch nicht eingeplant):
  - Levelziele, die nie erfüllbar sind: `countElement` (`src/levels/evaluator.ts`) zählt bridge, secondTrain,
    topHat, immelmann, corkscrew und cobraRoll nicht, weil es die Elemente nicht gibt. Betroffen: Level 47, 56, 63,
    69, 80, 95, 118, 133, 148. Ein Test, der jedes Levelziel gegen die vorhandenen Elemente prüft, fehlt.
  - Holzbrücke: nur ein Name in der Zielliste; Stützen stehen über Wasser im See (`planSupports` prüft kein Wasser).
  - Tunnelportale sind Platzhalter (feste schwarze Kreise in `TerrainRenderer.drawMountain`) und erscheinen auch,
    wo die Bahn einen Berg auf einer anderen Spur nur streift (Level 32, Bahn über den Gipfel). Teil von E1.
  - Bergbauer: Ein Strich weg von Bahn und Station wird ohne Hinweis zu Gelände (`strokeKind = 'terrain'` in
    `level.ts`); Spieler erzeugen so versehentlich Berge. Braucht ein sichtbares Werkzeug oder einen Hinweis.
  - Die Scheiben am Bahnhof (Punkt oben) sind auch im Spieltest aufgefallen und wirken dort wie ein großes Loch.
  - Das Startart-Symbol über der Station (Kettenlift = vier schräge Punkte) wird nicht als Knopf erkannt.

## 7. Karte des Codes

- `src/app/scenes/level.ts` Zeichnen, Bearbeiten, Fahrt, Ergebnis; `start.ts` Karte (Glücksrad, Übergang);
  `game.ts` App-Shell (Ticker, Dev-Overlay, Szenenwechsel); `mapTransition.ts` Übergabe Karte ↔ Level.
- `src/track/` Strich → Bahn (`gesture.ts` Lesart in Abschnitte, `strokeToTrack.ts` Pipeline/Schluss/Fortsetzen, `reduceNodes.ts`), Modell und Abtastung (`model.ts`),
  Bearbeitung (`edit.ts`), Überzeichnen (`overdraw.ts`), Bühne/Spuren (`stage.ts`).
- `src/physics/` Zug (`trainSim.ts`), Freiflug (`flightSim.ts`), Fahrgäste und Gurte (`passengers.ts`,
  `belts.ts`), Terrain (`terrain.ts`), Interpolation.
- `src/render/` Weltansicht (`worldView.ts`, Ebenen je Spur), Himmel (`sky.ts`, `skyMath.ts`), Terrain
  (`terrainRenderer.ts`), Bahn (`trackRenderer.ts`, `stripMesh.ts`, `supports/supportStyle.ts`), Zug und
  Figuren (`trainRenderer.ts`, `characterSprite.ts`, `cutoutAnimator.ts`), Shader (`shaders/`), Karte
  (`miniature.ts`, `bend.ts`, `unfold.ts`), Texturen (`paint.ts`), Paletten (`palette.ts`), Deko (`props.ts`).
- `src/levels/` Welten, Level, Zieltypen und Auswertung; `src/ui/` Widgets (Sticker, Icons, Chips).
- `scripts/` Szenarien, Screenshots, Level-Doku, Kachel-Aufbereitung (`art-prep.mjs`, `art-kit.json`).
