# Trauma Coaster – Technische Umsetzung

## 1. Stack
| Bereich | Wahl | Grund |
|---|---|---|
| Sprache | TypeScript (strict) | Typsicherheit für Geometrie und Physik, gute Toolchain |
| Build | Vite 8 | Schnell, `base: './'` für GitHub Pages und Capacitor |
| Rendering | PixiJS 8 (WebGL, WebGPU-fähig) | Sprites, Meshes, Filter; gemalter Look über Texturen und Shader |
| Physik Fahrgäste | Rapier2D (WASM, compat-Build) | Stabile Ragdolls mit Gelenken; compat-Build braucht keinen separaten WASM-Loader |
| Physik Zug | Eigenes Modell entlang der Bogenlänge | Deterministisch, schnell, exakt steuerbar (Launch, Kette, Bremse) |
| Tests | Vitest | Geometrie, Gesten-Erkennung, Physik |
| Screenshots | Playwright (Chromium) | Sichtprüfung in Hoch-/Querformat |
| Mobile | Capacitor (später) | iOS/Android-Wrapper um denselben Build |
| Hosting | GitHub Pages | `.github/workflows/deploy.yml` baut `dist/` |

## 2. Projektstruktur
```
src/
  main.ts              Einstieg: Pixi-App, SceneManager, Resize, Orientation
  app/                 Szenen: Splash, Start (Karte als Drehscheibe), Level, Ergebnis, MeineBahnen, Editor
  core/                math (Bezier, Spline, Bogenlänge, Krümmung), gestures, input, i18n, storage, rng
  track/               TrackPath-Modell, StrokeToTrack (RDP + Bezier-Fit), Stage (Spuren), Overdraw-Merge
  physics/             TrainSim (Zug), Forces (g-Kräfte), Passengers (Rapier-Ragdolls), Events
  render/              Sky, Clouds, Terrain, TrackRenderer (Schienen/Streben), TrainRenderer, Coins, Props, Camera, PaintFilters
  assets/              Prozedurale Texturen (brush, noise, gradients), Manifest mit Drop-in-Logik
  levels/              types, worlds, levels (150), goalLabels, GoalEvaluator
  editor/              Figuren-Editor (Rig-Teile, Varianten, Speichern)
  ui/                  HUD (Anforderungen), Play, Regal, Chips, Buttons (Pixi-basiert)
tests/                 Vitest-Tests
scripts/               gen-levels-doc.ts (LEVELS.md), screenshots.mjs (Playwright)
docs/                  GDD.md, LEVELS.md, TECH.md, research/
public/art/            Optionale, echte gemalte Texturen (Drop-in, siehe Kapitel 6)
public/brand/          illudiy-Logo (Sticker, WebP 1024 px) für den Splash
public/fonts/          Lobster (illudiy-Markenschrift, OFL) als woff2 + illudiy.css
```

## 3. Datenmodell der Bahn
```ts
interface TrackNode {
  x: number;      // Meter entlang der Bühne
  y: number;      // Höhe (Meter, absolut)
  z: number;      // Tiefe in Spuren (−2..2, kontinuierlich); Welt-Tiefe = z · 7 m
  inX, inY, inZ, outX, outY, outZ: number; // 3D-Bezier-Handles relativ zum Knoten (z in Spuren)
  roll: number;   // manueller Rollwinkel (Radiant), NaN = automatische Überhöhung
  kind: 'normal' | 'loopApex' | 'turn' | 'station' | 'closeTurn' | 'closeReturn';
}
interface TrackPath { nodes: TrackNode[]; elements: TrackElement[]; startType: StartType; templates: Record<string, number>; }
```
- Die Bahn ist ein geschlossener Pfad kubischer Bezier-Segmente in 3D (`src/track/model.ts`). `sampleTrack` liefert alle 0,25 m Position, 3D-Tangente, 3D-Krümmungsvektor (analytisch aus erster und zweiter Ableitung), Oben-Vektor (Paralleltransport mit Rückzug zur Welt-Senkrechten auf waagerechter Strecke) und Rollwinkel.
- `carFrame(state, v)` gibt den Wagen-Rahmen (T, U, S) mit Schräglage: manuell (`roll`) oder automatisch (`bankAt`: Oben-Vektor zur gefühlten Kraft v²·κ⃗ + g gedreht, max. 80°, keine Neigung bei Airtime).
- `closeTurn`/`closeReturn` sind automatische Knoten (Rückweg); `trackStats` und die Entgleis-Prüfung ignorieren sie.
- Projektion auf die Bühne (`src/track/stage.ts`): `X = x · k(z)`, `Y = y · k(z) + 4,2 · z`, `k(z) = 0,94^z`. Die Kamera rechnet Bühnen-Meter in Pixel um.

## 4. Strich → Bahn (Pipeline, `src/track/strokeToTrack.ts`)
1. **Aufnahme:** Pointer-Events (Touch und Maus vereinheitlicht), Punkte in Bühnen-Metern.
2. **Glätten:** Dedupe (0,15 m), gleitender Mittelwert über 5 Punkte, Resampling auf 0,5 m.
3. **Lesart (interpretStroke):** Der Strich wird in monotone Bild-Y-Abschnitte zerlegt (Hysterese 0,4 m). Ein steigender Abschnitt ist ein **Anstieg**, wenn er oberhalb der Bühne endet oder ein 4-m-Fenster enthält, das im Mittel steiler als 40° ist und in dessen Umgebung (±8 m) x nicht um mehr als 0,8 m umkehrt. Sonst ist er Boden.
   - Boden-Modus: Tiefe z aus der Bild-Höhe über der Bodenlinie (Fixpunkt-Iteration über das Terrain), über ±4 m geglättet, weich (6 m) an die vorige Tiefe angeschlossen. Höhe = Boden + Mindesthöhe.
   - Höhen-Modus: Tiefe eingefroren, Höhe = Bild-Höhe über der Bodenlinie dieser Tiefe. Zurück zum Boden, wenn die Höhe ≤ 0,35 m und der Strich nicht steigt (nicht innerhalb des auslösenden Anstiegs).
4. **Ereignisse (nur im Höhen-Modus):** Looping = Segment-Schnitt-Test im Profil, Scheitel wird `loopApex`. Steilkurve = x-Umkehr mit Hin- und Rückweg ≥ 10 m außerhalb von Loopings; Richtung aus der mittleren Höhe von Rückweg vs. Hinweg (höher = nach hinten).
5. **Zweiter Durchlauf:** Steilkurven liefern ein Tiefen-Profil (±1 Spur, Smoothstep über 16 m um den Scheitel, am Bühnenrand gespiegelt). `interpretStroke` läuft erneut mit diesem Profil, damit der Rückweg auf der Bodenlinie der neuen Spur landet.
6. **Knoten:** Welt-Punkte (x, y, z·7), Ecken ab 35° abrunden, RDP 3D (0,04 m), wieder auf 1 m verdichten (damit der Fit Überschwinger auf Geraden erkennt), Schneider-Fit in 3D mit 0,45 m Toleranz, Ecken ab 60° werden Knoten mit gebrochenen Tangenten. Ereignis-Knoten werden markiert.
7. **Schließen (closePath):** Ende auf dem Start → Handle übernehmen, direkt geschlossen. Ende nahe (≤ 10 m) → weiche Verbindung. Sonst zwei Halbkreis-Kehren (`closeTurn`) über die Nachbarspur und eine Rückweg-Gerade (`closeReturn`) mit Bremsstrecke.
8. **Überzeichnen (`src/track/overdraw.ts`):** Beginnt und endet der Strich innerhalb von 30 px an der Bahn, werden die Fußpunkte (s1, s2) über alle Tiefen gesucht. Der Strich wird mit derselben Lesart interpretiert (Startzustand = Zustand der Bahn am Fußpunkt, Boden um die Mindesthöhe angehoben, Ende auf die Tiefe der Bahn geblendet). Die Knoten im Bereich werden ersetzt, die Naht geglättet, der Schluss neu gebildet.

## 5. Physik
- Zug (`src/physics/trainSim.ts`): fester Schritt 1/120 s, Euler entlang der Bogenlänge. Hangabtrieb aus der 3D-Tangente (Mittel über alle Wagen), Rollreibung je Schienentyp, Luftwiderstand. Station schiebt mit 1,6 m/s an; auf ebener Strecke rollt der Zug aus und bleibt stehen (Stall). Kettenzug nur an einem Anstieg, der innerhalb von 30 m nach der Station beginnt, bis zum ersten Scheitel (4 m/s, Vertikallift 5,5 m/s). Launch 26 m mit 12 m/s². Rückweg-Abschnitte bremsen auf 8 m/s (14 m Vorausschau).
- g-Kräfte: f = v²·κ⃗ (Mindestradius 2,5 m) + Hangabtrieb·T + g·ŷ, zerlegt im Wagen-Rahmen (T, U, S) mit Schräglage. Entgleisen bei seitlichem g über dem Limit des Schienentyps (Holz 2,0, Hybrid 2,4, Mine 2,2, Stahl 3,0, Eis 2,6, Space 3,5 …), Herausfallen bei kopfüber mit g_v < −0,15 über 0,12 s, Blackout über 7 g.
- Fahrgäste (`src/physics/passengers.ts`): Rapier2D in der Wagen-Ebene (vorwärts/oben). Die Wanne ist statisch, die Ragdolls bekommen die Scheinkraft −m·f (vorwärts, oben) als Kraft; seitliche g lassen sie lehnen und ab `sideEjectG` über die Bordwand kippen. Rauswurf = Rumpf verlässt die Wanne; danach Weltsimulation mit Terrain.
- Rendering: Schienen als P ± 0,55·S (projiziert, mit Schräglage für die Entwurfsgeschwindigkeit), Wagen als projizierter 3D-Quader mit Sichtbarkeits-Sortierung, Fahrgäste als Billboards im projizierten Wagen-Rahmen.

## 6. Asset-Pipeline (Drop-in für gemalte Texturen)
Jede Textur hat einen Namen im Manifest (`src/assets/manifest.ts`). Beim Laden prüft das Spiel, ob `public/art/<name>.png` existiert (HEAD-Request bzw. Asset-Liste). Wenn ja, wird sie genommen, sonst die prozedurale Version erzeugt.

Namensschema: `<kategorie>_<welt|skin>_<variante>.png`, z. B. `sky_w1_day.png`, `rail_wood_tie.png`, `cloud_a.png`, `ground_w3_lane-2.png`, `prop_castle.png`.

Prompt-Vorlage für Bildgeneratoren (Englisch, da Modelle Englisch besser verstehen):
```
hand-painted 2D game texture, Rayman Legends style, vibrant colors, soft painterly shading,
visible brush strokes, slightly wobbly outlines, [MOTIV], seamless tileable, flat lighting from top left,
no text, no watermark, transparent background (PNG)
```
Motiv-Beispiele: „wooden roller coaster beam with cross braces“, „fluffy cumulus cloud“, „mossy green meadow ground strip“, „glowing lava rock“.

## 7. Performance-Budget (Mittelklasse-Handy, 60 fps)
- Draw Calls < 150 pro Frame (Schienen als ein Mesh, Streben instanziert, Partikel als ParticleContainer).
- Rapier: max. 16 Fahrgäste × 6 Körper = 96 Körper, 1/60 s, 2 Substeps.
- Texturen: ein Atlas pro Welt (max. 4096 × 4096), Deko-Props im gemeinsamen Atlas.
- Kein Filter über dem gesamten Bildschirm außer dem Papierkorn (ein Sprite mit Multiply).

## 8. Kriterien für einen Engine-Wechsel (Godot 4 oder vergleichbar)
Wechseln, wenn mindestens eines zutrifft:
1. Unter 50 fps auf einem Mittelklasse-Handy (z. B. iPhone 12, Pixel 6a) bei 3 Wagen und 12 Fahrgästen trotz Optimierung.
2. Seitliche Kräfte sollen echt simuliert werden (Fahrgäste in 3D), und die Rapier3D-Integration im Web ist zu langsam.
3. Bedarf an nativen Store-Features (Game Center, Play Games, In-App-Käufe) übersteigt das, was Capacitor-Plugins zuverlässig liefern.
4. Bedarf an echter 3D-Kamera für Kurven.
Was beim Wechsel erhalten bleibt: Level-Daten (JSON), Bahn-Format, GDD, Texturen, Gesten-Logik (portierbar), Figuren-Definitionen.

## 9. Capacitor (Stores)
```
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Trauma Coaster" com.illudiy.traumacoaster --web-dir dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```
Config-Hinweise: `webDir: 'dist'`, `server.androidScheme: 'https'`, Statusbar overlay, Orientation beide. iOS-Build braucht Xcode auf einem Mac; Android-Build Android Studio.

## 10. Deployment
GitHub Pages über `.github/workflows/deploy.yml`: Bei Push auf den Hauptbranch wird gebaut und `dist/` veröffentlicht. In den Repo-Einstellungen unter Pages muss „GitHub Actions“ als Quelle gewählt sein.

## 11. Umsetzungsstand und bekannte Eigenheiten
- Alle Zeichnungen in Metern: Formen mit kleinen Radien (Augen, Räder, Coins) werden über `MGraphics` (src/render/mgraphics.ts) intern in Zentimetern tesselliert, sonst entstehen Vielecke.
- Die Bahn wird nach Spuren (gerundetes z) in Stücke geteilt und in die passende Tiefenebene gelegt; Berge/Wasser liegen über Bahn und Zug (Tunnel-Effekt).
- Der automatische Rückweg (offener Strich) läuft als Halbkreis-Kehre über die Nachbarspur und ist eine Bremsstrecke (max. 8 m/s), zählt nicht für Ziele.
- Der Oben-Vektor wird per Parallel-Transport berechnet und bei waagerechter Bahn stetig zur Welt-Senkrechten zurückgezogen; so bleiben Kurven Kurven und Loopings Loopings.
- Fahrgäste werden im Wagen-System simuliert (Rapier, Kraft = −m·gefühlte Beschleunigung); beim Verlassen der Wanne werden sie in eine Welt-Simulation mit Boden übergeben.
- Zeitschritt: `Game` begrenzt dt auf 50 ms; auf sehr langsamen Renderern läuft das Spiel dann in Zeitlupe. `?fast=N` beschleunigt für Tests.
- Nicht umgesetzt (siehe README): Vorlagen-Elemente, Roll-Handle, Weiche/Kippschiene/Rückwärts-Weiche/Fallschacht, Audio, Capacitor-Builds.

## 12. Entwicklungsbefehle
```
npm install
npm run dev          # http://localhost:5173
npm run test         # Vitest
npm run build        # Typecheck + Build nach dist/
npm run preview      # Build lokal ansehen
npm run levels:doc   # docs/LEVELS.md neu erzeugen
npm run screenshots  # Playwright-Screenshots nach screenshots/
npm run scenario     # Szenario-Test: Looping, Kurve, Fahrt bis zum Ergebnis
```

## 13. Karte und Übergang ins Level
- **Ein Boden, zwei Krümmungen** (`src/render/bend.ts`): Alles auf der Karte liegt in flachen Koordinaten (u = Bogenlänge ab der Bildmitte, v = Höhe über dem Boden, in Karten-Pixeln) und wird mit Krümmung k auf den Kreis der Drehscheibe gelegt; k = 0 ist der flache Boden des Levels. Der Übergang dreht nur an k, am Maßstab und am Fokus. Texturen (Miniaturen, das Level-Bild) liegen auf einem Gitter (`BentSheet`), dessen Punkte jedes Bild neu gebogen werden.
- **Miniaturen** (`src/render/miniature.ts`): Pro Level wird die Bühne mit `WorldView` in eine Textur gerendert (Terrain, Coins, gespeicherte Bahn, Zug in der Station, Ränder weich ausgeblendet), in denselben Bühnen-Metern wie das Level. Die Oberfläche der Scheibe ist die Bodenlinie der hintersten Spur (`HORIZON_Y`); die fünf Spurstreifen der Scheibe haben die Farben und Breiten der Miniatur. Höchstens 28 Texturen bleiben im Speicher; neu gerendert wird, wenn sich die Bahn ändert, höchstens eine Miniatur pro Bild und nicht beim schnellen Drehen.
- **Übergang** (`src/app/scenes/start.ts`, `src/app/mapTransition.ts`): Die Karte bereitet das Level unsichtbar vor (`Game.prepare`), fotografiert seine Ebenen (Himmel, Bühne, Knöpfe) und biegt die Bühne von der Scheibe gerade, bis sie deckungsgleich mit dem Level liegt; dann übernimmt das Level (`Game.adopt`). Zurück fotografiert das Level seine Ebenen (`LevelScene.transitionLayers`), und die Karte krümmt das Foto zur Scheibe, während die frische Miniatur darunter übernimmt. Der Zoom läuft im Logarithmus um einen festen Punkt, die Krümmung geht etwas früher auf null; Himmel, Wolken und Knöpfe blenden in festen Abschnitten über.
