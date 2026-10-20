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
  app/                 Szenen: Splash, Start (Halbkugel), Level, Ergebnis, MeineBahnen, Editor
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
```

## 3. Datenmodell der Bahn
```ts
interface TrackNode {
  x: number;      // Meter entlang der Bühne
  y: number;      // Höhe über der Bodenlinie der Spur (Meter)
  lane: number;   // -2..2 (Spur). Zwischen zwei Knoten mit unterschiedlicher Spur liegt eine Kurve.
  inX, inY, outX, outY: number; // Bezier-Handles relativ zum Knoten
  roll: number;   // Rollwinkel in Grad (Schleife)
  kind: 'normal' | 'loopApex' | 'turn' | 'station';
}
interface TrackPath { nodes: TrackNode[]; closed: true; elements: TrackElement[]; startType: StartType; }
```
- Die Bahn ist ein geschlossener Pfad kubischer Bezier-Segmente. Eine Bogenlängen-Tabelle (alle 0,25 m) liefert Position, Tangente, Krümmung und Spur für jedes s.
- Die Tiefe z wird pro Segment linear zwischen den Spuren interpoliert, mit Smoothstep über die Kurve. Daraus ergibt sich die horizontale Krümmung für die seitlichen g.
- Projektion auf den Bildschirm: `screenX = x * scale(lane)`, `screenY = groundLine(lane) - y * scale(lane)`, `scale(lane) = 0.88^lane`, `groundLine(lane) = horizon + laneOffset * (2 - lane)`.

## 4. Strich → Bahn (Pipeline)
1. **Aufnahme:** Pointer-Events (Touch und Maus vereinheitlicht), Punkte in Weltkoordinaten mit Zeitstempel.
2. **Glätten:** Gleitender Mittelwert über 5 Punkte (Streamline), dann Ramer-Douglas-Peucker mit Toleranz 0,6 m.
3. **Ereignisse erkennen:**
   - Kehrtwende: Vorzeichenwechsel von dx über mindestens 12 m Hin- und Rückweg; Spur-Richtung aus der mittleren Höhe des Rückwegs vs. Hinweg.
   - Kreuzung: Segment-Schnitt-Test (Sweep); die Schleife zwischen den Schnittpunkten wird zum Looping, Apex-Knoten markiert.
4. **Bezier-Fit:** Schneider-Algorithmus (Graphics Gems) mit Fehlertoleranz 0,4 m; Ecken ab 60° werden Knoten mit gebrochenen Tangenten.
5. **Spur zuweisen:** Start-Spur aus der nächsten Bodenlinie; jede Kehrtwende setzt die Spur um ±1 für alle folgenden Knoten.
6. **Schließen:** Letzter Knoten wird mit dem ersten über ein Bezier-Segment verbunden, Tangenten aus den Nachbarn; bei Spurdifferenz wird ein Kurven-Knoten eingefügt.
7. **Überzeichnen:** Startet ein Strich innerhalb von 3 m an der Bahn und endet innerhalb von 3 m, werden die Fußpunkte (Bogenlänge s1, s2) bestimmt; die Knoten dazwischen werden durch den neuen Fit ersetzt; Tangenten an s1/s2 werden gemittelt.

## 5. Physik
- Zug: fester Schritt 1/120 s, symplektischer Euler entlang s. Kräfte siehe GDD Kapitel 6.
- g-Kräfte: κ_vertikal aus der Bezier-Krümmung in der x/y-Ebene, κ_horizontal aus der z-Interpolation (Kurvenradius = halbe Kehrtwenden-Breite).
- Fahrgäste: Rapier-Welt mit Schwerkraft im Wagen-Bezugssystem? Nein: Weltkoordinaten. Die Wanne ist ein kinematischer Körper, dessen Position aus der Zug-Simulation gesetzt wird (`setNextKinematicTranslation/Rotation`). Rapier löst die Kontakte. Seitliche Scheinkraft wird als zusätzliche Kraft auf die Ragdoll-Körper addiert.
- Rauswurf: Ein Fahrgast gilt als draußen, wenn sein Rumpf-Mittelpunkt die Wannen-Bounding-Box um mehr als 0,6 m verlässt.

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
