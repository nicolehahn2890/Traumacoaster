# Trauma Coaster – Technische Umsetzung

## 1. Stack
| Bereich | Wahl | Grund |
|---|---|---|
| Sprache | TypeScript (strict) | Typsicherheit für Geometrie und Physik, gute Toolchain |
| Build | Vite 8 | Schnell, `base: './'` für GitHub Pages und Capacitor |
| Rendering | PixiJS 8 (WebGL, WebGPU-fähig) | Heute: Vektor-Graphics plus prozedurale Canvas-Texturen, keine Shader; der gemalte Look (Texturen, Stipple-/Glow-/Wasser-Shader) kommt mit dem Stil-Update, siehe docs/ART.md |
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
  render/              Sky (Himmel, Wolken), Terrain, TrackRenderer (Schienen/Streben), TrainRenderer, Props, Camera, Effects, paint (Canvas-Texturen), palette (Farbtöne)
  assets/              Manifest mit Drop-in-Logik für echte gemalte Texturen (public/art)
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
  z: number;      // Tiefe in Spuren (−2..2, kontinuierlich); Welt-Tiefe = z · 8,4 m (LANE_DEPTH)
  inX, inY, inZ, outX, outY, outZ: number; // 3D-Bezier-Handles relativ zum Knoten (z in Spuren)
  roll: number;   // manueller Rollwinkel (Radiant), NaN = automatische Überhöhung
  kind: 'normal' | 'loopApex' | 'turn' | 'station' | 'closeTurn' | 'closeReturn';
}
interface TrackPath { nodes: TrackNode[]; elements: TrackElement[]; startType: StartType; templates: Record<string, number>; }
```
- Die Bahn ist ein geschlossener Pfad kubischer Bezier-Segmente in 3D (`src/track/model.ts`). `closure` protokolliert, was der Rundenschluss am gezeichneten Ende entfernt oder überschrieben hat (`PathClosure`), damit `closePath` wiederholbar ist (siehe Kapitel 4, Punkt 7). `sampleTrack` liefert alle 0,25 m Position, 3D-Tangente, 3D-Krümmungsvektor (analytisch aus erster und zweiter Ableitung), Oben-Vektor (Paralleltransport mit Rückzug zur Welt-Senkrechten auf waagerechter Strecke) und Rollwinkel.
- `carFrame(state, v)` gibt den Wagen-Rahmen (T, U, S) mit Schräglage: manuell (`roll`) oder automatisch (`bankAt`: Oben-Vektor zur gefühlten Kraft v²·κ⃗ + g gedreht, max. 80°, keine Neigung bei Airtime).
- `closeTurn`/`closeReturn` sind automatische Knoten (Rückweg); `trackStats` und die Entgleis-Prüfung ignorieren sie.
- Projektion auf die Bühne (`src/track/stage.ts`): `X = x · k(z)`, `Y = y · k(z) + 4,2 · z`, `k(z) = 0,94^z`. Die Kamera rechnet Bühnen-Meter in Pixel um.

## 4. Strich → Bahn (Pipeline, `src/track/strokeToTrack.ts`)
1. **Aufnahme:** Pointer-Events (Touch und Maus vereinheitlicht), Punkte in Bühnen-Metern.
2. **Glätten:** Dedupe (0,15 m), gleitender Mittelwert über 5 Punkte, Resampling auf 0,5 m.
3. **Lesart (interpretStroke):** Der Strich wird in monotone Bild-Y-Abschnitte zerlegt (Hysterese 0,4 m). Ein steigender Abschnitt ist ein **Anstieg**, wenn er oberhalb der Bühne endet oder ein 4-m-Fenster enthält, das im Mittel steiler als 40° ist und in dessen Umgebung (±8 m) x nicht um mehr als 0,8 m umkehrt. Sonst ist er Boden.
   - Boden-Modus: Tiefe z aus der Bild-Höhe über der Bodenlinie (Fixpunkt-Iteration über das Terrain), über ±4 m geglättet, weich (28 m) an die vorige Tiefe angeschlossen, magnetisch auf Spurlinien (±0,2) eingerastet (`magnetLane`). Höhe = Boden + Mindesthöhe.
   - Höhen-Modus: Tiefe eingefroren, Höhe = Bild-Höhe über der Bodenlinie dieser Tiefe. Zurück zum Boden, wenn die Höhe ≤ 0,35 m und der Strich nicht steigt (nicht innerhalb des auslösenden Anstiegs).
4. **Ereignisse:** Looping = Schleife im Profil in gleicher x-Richtung, angenommen nur bei klarer Schleife (Scheitel ≥ 4,5 m von der Kreuzung, Umfang ≥ 12 m, Rundheit 4π·A/U² ≥ 0,4); Scheitel wird `loopApex`. Drei Wege: (a) `findRoundLoops` prüft schon den rohen Strich auf runde Schleifen (Kreuzung oder Fast-Kreuzung ≤ 1,5 m, Rundheit ≥ 0,5, etwa so hoch wie breit); ihre steigenden Abschnitte gelten als Anstieg, damit auch ein Kreis, der am Boden beginnt, ein Looping ist und keine zwei Bodenkurven; (b) echte Kreuzungen im Höhen-Modus; (c) Fast-Kreuzungen im Höhen-Modus (Lücke ≤ 1,5 m, Rundheit ≥ 0,45). Bei einer Fast-Kreuzung zieht `shapeLoopCrossing` die Ausfahrt auf die Einfahrt, damit die Schienen wirklich kreuzen. Steilkurve (Höhen-Modus) = x-Umkehr mit Hin- und Rückweg ≥ 5 m außerhalb von Loopings; Richtung aus der mittleren Höhe von Rückweg vs. Hinweg (höher = nach hinten), Spurenzahl des Halbkreises aus der gezeichneten Breite oder dem Tempo (R ≥ Fallhöhe bis zur Einfahrt für ≤ 2 g), eine Spur (4,2 m) nur bei langsamer Fahrt, höchstens vier (16,8 m), begrenzt durch den Platz auf der Bühne (sonst Richtung drehen). Boden-Kehre (Boden-Modus, `floor: true`) = dieselbe x-Umkehr, Richtung aus der gelesenen Tiefe, Spuren = gezeichnete Spuren oder mehr bei Tempo, mindestens zwei, wo die Bühne Platz hat (eine Spur wäre im Bild eine spitze Nase; der Rückweg gleitet danach über 28 m auf seine Spur), ohne zusätzliche Verschiebung; Boden-Kehren nahe der Station (Rundenschluss) oder ohne genug Strich nach dem Scheitel bleiben dem Rundenschluss überlassen.
5. **Zweiter Durchlauf:** Steilkurven liefern ein Tiefen-Profil (2·R/8,4 Spuren, Smoothstep über π·R um den Scheitel, am Bühnenrand gespiegelt). `interpretStroke` läuft erneut mit diesem Profil (solange die Verschiebung läuft, bleibt der Strich in der Höhe), dann formt `shapeTurns` alle Kehren als Halbkreise in der x/z-Ebene: Höhe in der Kurve eben gehalten (Einfahrtshöhe, mindestens höchstes Gelände unter dem Halbkreis plus Mindesthöhe; Rampe davor über max(16 m, √(6·ΔY·1,5·Fallhöhe)) mit 6 m ebenem Einlauf), danach 6 m eben, dann x über 10 m, Tiefe über 28 m und Höhe über max(16 m, √(6·ΔY·1,5·Fallhöhe)) weich an den gezeichneten Verlauf angeschlossen. Rundenschluss (`snapEndToStart`): Ende nahe der Station → Einfahrt über 14 m auf die Abfahrtsgerade gelegt oder Schluss-Kehre durch einen Halbkreis um die Station ersetzt.
6. **Knoten:** Welt-Punkte (x, Höhe über Boden, z·8,4), als 3D-Linie mit Gauß (σ = 1,5 m, Enden gespiegelt) geglättet (`smoothPolyline3`), dann Bodenhöhe addiert, auf 0,5 m neu abgetastet (`resample3`) und durch `limitVerticalCurvature` auf tempo-gerechte Kuppen- und Talradien gebracht (v² ≈ 2·g·Δh seit dem höchsten Punkt, mindestens 6 m/s; Kuppe R ≥ 1,4·v²/(2g), Tal R ≥ v²/(3g); nur anheben: Kuppen pflanzen die erlaubte Parabel in Laufrichtung fort, Senken werden örtlich aufgefüllt; Loopings und der Anfang bleiben fest, das Ende bei geschlossener Runde). Der Begrenzer misst die Sehnenhöhe senkrecht und rechnet das Gefälle ein (Faktor cos α): ohne ihn ließ er auf steilen Flanken, etwa im Auslauf eines Drops, bis zu doppelt so enge Radien durch (6 g statt der 4 g, für die ein Tal ausgelegt ist). Dann Ecken ab 35° abrunden, RDP 3D (0,04 m), wieder auf 1 m verdichten (damit der Fit Überschwinger auf Geraden erkennt; `densePolyline`) und Knoten wählen (`src/track/reduceNodes.ts`): Schneider-Rekursion in 3D mit festen Tangenten je Knoten (symmetrische Sekante ±1 m, interpoliert, damit ungleiche Punktabstände keinen Knick am Knoten erzeugen), adaptive Toleranz (0,3 m bei Radien unter 25 m, dort entscheidet die Form über die g-Kräfte; bis 1,2 m auf Geraden und in weiten Bögen), Newton-Nachbesserung nur unter dem Vierfachen der Toleranz (sonst zwingt sie lange Segmente in die Toleranz, die in Kurven enger biegen als gezeichnet), Looping- und Kehren-Scheitel als gesetzte Knoten mit Knotenart. Ein Oval braucht so fünf bis sieben Knoten, ein Hügel fünf bis sechs, ein Looping-Strich rund zehn. Knoten genau auf Kuppen und Tälern (`snapApex`) sind abschaltbar und standardmäßig aus: Ein Segment „Flanke plus halber Bogen“ konzentriert die Krümmung am Scheitel, der Wagen spürte dort 5,6 g statt 4,2 g; die Scheitelwahl (`pickApexIndices`, lokale Krümmungsmaxima mit Prominenz) dient Maßband und Bearbeitung. `?fit=legacy` schaltet zum Vergleich auf den Fit ohne Ecken mit 0,3 m überall.
7. **Schließen (closePath):** Zuerst wird ein früherer Schluss zurückgenommen (`restoreClosure`: automatische Knoten weg, vom Schluss entfernte Knoten wieder angehängt, überschriebene Handles zurückgesetzt), dann neu gerechnet: Ende auf dem Start → Endknoten verwerfen, Station übernimmt die Ankunft. Ankunft gegen die Abfahrtsrichtung → Halbkreis (`closeTurn`, Mitte auf der Station, zwei Spuren) in die Station. Ende nahe (≤ 6 m) → weiche Verbindung. Jede Änderung steht im Protokoll `path.closure`; so liefert jede Bearbeitung (die `closePath` erneut aufruft) denselben Schluss, und eine von Hand geschlossene Bahn öffnet sich nie wieder. Sonst bleibt die Bahn offen und fährt offen (Absperrband, `openEnd`); `closeTrack` (zwei Halbkreis-Kehren über eine zwei Spuren entfernte Rückweg-Spur und eine Rückweg-Gerade `closeReturn` mit Bremsstrecke) bleibt als Werkzeug für Tests und den Sandkasten-Vergleich, die Level-Szene ruft es nicht mehr auf. Der Schnappradius für den Schluss ist 8 m, beim Zeichnen mindestens 60 px (`closeSnap`), und die Schlussverbindung erscheint schon während des Strichs als gestrichelte Geister-Schiene.
8. **Überzeichnen (`src/track/overdraw.ts`):** Beginnt und endet der Strich innerhalb von 30 px an der Bahn, werden die Fußpunkte (s1, s2) über alle Tiefen gesucht. Der Strich wird mit derselben Lesart interpretiert (Startzustand = Zustand der Bahn am Fußpunkt, Boden um die Mindesthöhe angehoben, Ende auf die Tiefe der Bahn geblendet). Die Knoten im Bereich werden ersetzt, die Naht geglättet, der Schluss neu gebildet.
9. **Vorschau beim Zeichnen:** Dieselbe Pipeline mit `preview: true` (60 statt 400 Begrenzer-Durchläufe, doppelte Fit-Toleranz) läuft alle 80 ms oder, wenn eine Vorschau länger braucht, nach dem Doppelten ihrer Dauer. Sie zeichnet die Bahn wie fertig (Schienen, Schwellen, Station), nur Streben und Elemente nicht; die Tinte zeigt nur noch, was hinter dem Finger noch nicht als Bahn steht (mindestens die letzten 1,5 Bühnen-Meter). Nach dem Loslassen wachsen die Streben in 0,3 s vom Boden hoch (`TrackRenderer.redrawSupports`). Die Kreuzungs- und Fast-Kreuzungs-Suchen (`findRoundLoops`, `detectLoops`) laufen über ein Segment-Raster (`src/core/segmentGrid.ts`, Zellen 2 m) statt über jedes Paar: ein 160-m-Strich kostet so 14 ms statt 170 ms, die Vorschau 4 ms.
10. **Bearbeiten** (`src/track/edit.ts`, `LevelScene`): Knoten-Trefferfläche 32 px, eng liegende Knoten werden für den Treffer auseinandergeschoben (`nodeHitCenters`). Ein Finger auf der Bahn (≤ 24 px) greift das Segment (`trackPending`): quer zur Bahn gezogen wird es gebogen (`bendSegment`: kleinste Änderung der inneren Kontrollpunkte mit Bernstein-Gewichten, sodass die Kurve beim Parameter t durch den Finger läuft; die gegenüberliegenden Handles drehen mit, Länge bleibt, G1), längs gezogen wird überzeichnet. Am leuchtenden offenen Ende (≤ 56 px) hat Fortsetzen Vorrang. Bogenmenü über dem gewählten Knoten (Radius 64 px: Tiefe, Schräglage, Löschen; Treffer 32 px). Langdruck zeigt Tangenten-Handles (`proNode`); der InputManager ruft nach dem Langdruck sofort `dragStart`, deshalb unterdrückt `longPressArmed` diesen einen Strich-Beginn. Live-Ziele und Maßband (`src/render/measureOverlay.ts`): während Strich und Drag wird die Bahn höchstens alle 100 ms bewertet (`evaluate` ohne Fahrt), die Zielleiste ist einmal gebaut und hakt nur um; das Maßband läuft in Bildschirm-Pixeln je Frame aus Bühnenpunkten über die Kamera.

## 5. Physik
- Zug (`src/physics/trainSim.ts`): fester Schritt 1/120 s, Euler entlang der Bogenlänge. Hangabtrieb aus der 3D-Tangente (Mittel über alle Wagen), Rollreibung je Schienentyp, Luftwiderstand (0,0008·v²). Station schiebt mit 2,0 m/s an; auf ebener Strecke rollt der Zug aus und bleibt stehen (Stall nach 0,4 s unter 0,03 m/s oder sofort am Hang). Kettenzug nur an einem Anstieg, der innerhalb von 30 m nach der Station beginnt, bis zum ersten Scheitel (6,0 m/s, Vertikallift 5,5 m/s). Launch 26 m mit 12 m/s² (Hydro 24, Pendel 16), Booster +8 m/s², Bremse bremst auf 4 m/s, Splash −3,5 m/s². Rückweg-Abschnitte (`auto`, nur noch über `closeTrack`) bremsen auf 8 m/s (14 m Vorausschau). Offenes Ende: kommt der Zug mit über 6 m/s an, blockieren die Räder 0,3 s lang (−25 m/s², nicht unter 2 m/s, Beginn so, dass die Blockade an der Kante endet; Ereignis `wheelLock`, `TrainSim.wheelLock` für die Funken), an der Kante `fail('openEnd')` mit Freiflug `launch`; langsamer `tip` (kippt über die Vorderkante). `lapDone`/`finish` gibt es nur auf geschlossenen Bahnen.
- g-Kräfte: f = v²·κ⃗ (Mindestradius 2,5 m; κ⃗ aus `sampleTrack` über ±1,2 m gemittelt, ein Wagen spürt keine kürzeren Spitzen) + a_tan·T + g·ŷ, wobei a_tan die echte Tangentialbeschleunigung des Zugs ist (Hangabtrieb minus Reibung, Kettenzug hält das Tempo, Launch, Booster, Bremse); zerlegt im Wagen-Rahmen (T, U, S) mit Schräglage. So drückt die Kette die Fahrgäste in die Lehne, der Launch in den Sitz, die Bremse nach vorn. Entgleisen bei seitlichem g über dem Limit des Schienentyps (`SKIN_PHYSICS`: Holz 2,0, Hybrid 2,4, Mine 2,2, Stahl 3,0, Gold 3,0, Neon 3,2, Eis 2,6, Geister 2,3, Lava 3,0, Space 3,5), Herausfallen bei kopfüber mit g_v < −0,15 über 0,12 s, Blackout über 7 g (nur ein Merker, kostet den dritten Stern). Entgleisen und Herausfallen übergeben den Zug in den Freiflug (unten), Rückroller und Wasser lassen ihn auf der Schiene ausrollen.
- Freiflug (`src/physics/flightSim.ts`, Phase `flying`): Jeder Wagen ist ein starrer Körper in der Welt-Ebene (x, y) mit Neigung und Drehrate, dazu Schräglage (`bank`) und Tiefe (z in Spuren) als eigene Freiheitsgrade. Schwerkraft, Luftwiderstand 0,02·v², Ketten-Federn zwischen den Wagen (Ruhelänge = Wagenlänge, k = 300, c = 20), Bodenkontakt an vier Ecken gegen `terrain.surfaceHeight` (Rückprall 0,25, Stöße unter 0,5 m/s unelastisch, Reibung, Drehimpuls über den Hebelarm der tiefsten Ecke, am Boden eine gedämpfte Drehfeder zur nächsten flachen Lage, auch aufs Dach), Wasser dämpft mit e^(−3t) und meldet einen Platsch. Startzustände: `derail` kippt mit 2,5 rad/s zur Seite der Querkraft (bis 90°) und driftet 0,25 Spuren/s aus der Spur, `fall` überschlägt sich (−1,5 rad/s), `launch`/`tip` für das offene Ende (A5). Aufpräller über 3 m/s senkrecht sind `ImpactEvent`s (0,5 s Sperre je Wagen): die Level-Szene wirft darauf alle Fahrgäste des Wagens aus (`PassengerSim.ejectCar`, Schubs 1,5 + 0,4·v, höchstens 6 m/s) und zeigt Staub bzw. Platsch. `writeTo` schreibt Lage, Rahmen (T aus der Neigung, U/S um T mit der Schräglage gedreht), Geschwindigkeit und Scheinkräfte (Körperbeschleunigung + g, auf 60 m/s² begrenzt) in die `CarState`s; Rendering und Fahrgast-Simulation laufen unverändert weiter. `settled` nach 0,6 s unter 0,3 m/s und 0,2 rad/s; das Ergebnis erscheint frühestens 1,2 s nach dem Fehlschlag und sobald das Wrack liegt, spätestens nach 5 s Simulationszeit.
- Fahrgäste (`src/physics/passengers.ts`): Rapier2D in der Wagen-Ebene (vorwärts/oben), Schritt 1/60 s. Die Wanne ist statisch, die Ragdolls bekommen die Scheinkraft −m·f (vorwärts, oben) als Kraft; seitliche g lassen sie lehnen und ab `sideEjectG` (2,2 g über 0,15 s) über die Bordwand kippen. Rauswurf = Rumpf verlässt die Wanne (über 1,70 m Höhe oder 1,9 m vor/hinter der Wagenmitte); danach Weltsimulation mit Terrain.
- Interpolation (`src/physics/interpolate.ts`): Zug und Fahrgäste halten den Zustand vor dem letzten Schritt (`prevCars`, `prevParts`). Die Level-Szene zeichnet den Zwischenstand bei alpha = Rest des Akkumulators / Schrittweite; so bleibt die Bewegung in Zeitlupe (0,25×–0,6×) und im Zeitraffer (bis 5×) glatt. Zeitlupen-Regie: Rauswurf 0,25× für 1,2 s mit Kamera auf dem Fliegenden (bis er landet), Entgleisen/Fall/Rückroller 0,35× auf dem betroffenen Wagen, Kuppe 0,6× für 0,5 s.
- Rendering: Schienen als P ± 0,55·S (projiziert, mit Schräglage für die Entwurfsgeschwindigkeit), Wagen als projizierter 3D-Quader mit Sichtbarkeits-Sortierung, Fahrgäste als Billboards im projizierten Wagen-Rahmen.

## 6. Asset-Pipeline (Drop-in für gemalte Texturen)
Jede Textur hat einen Namen im Manifest (`src/assets/manifest.ts`, `ART_NAMES`). Beim Start lädt `loadArtOverrides()` die Liste `public/art/manifest.json` und dazu je Name `public/art/<name>.webp` (Fallback `.png`). `art(name, fallback)` liefert die gemalte Textur oder erzeugt die prozedurale; `hasArt(name)` sagt, ob eine gemalte existiert (die Wolken wählen danach Skalierung und Tönung).

Der Kachelsatz entsteht so: `scripts/art-kit.json` beschreibt jede Kachel (Name, Zielgröße, Figma-Knoten, Regeln `key`/`fit`/`shadow`/`despill`/`seamless`/`procedural`, Prompt). Die Bilder werden im Figma-Bildgenerator erzeugt (Modell `gpt-image-2.5-sunburst`, Datei „Trauma Coaster – Art Kit“) und als PNG nach `art-src/` gelegt (nicht im Repository). `npm run art:prep` (sharp) stellt frei, schneidet zu, macht kachelbar und schreibt `public/art/<name>.webp` + `manifest.json`; `npm run art:doc` schreibt `docs/ART-PROMPTS.md` aus dem Kit. Stilregeln und Prompt-Vorspann: `docs/ART.md`, `docs/ART-PROMPTS.md`.

Namensschema: `<kategorie>_<variante>` (z. B. `cloud_a`, `grass_brush_b`, `tree_ball`) bzw. mit Welt/Skin, wenn es je Welt eigene Kacheln gibt (`sky_w1_day`, `rail_wood_tie`).

## 7. Performance-Budget (Mittelklasse-Handy, 60 fps)
- Draw Calls < 150 pro Frame (Ziel mit dem Stil-Update: Schienen als Band-Mesh, Streben als Meshes, Punkte und Partikel als ParticleContainer; heute: Graphics pro Spur).
- Rapier: max. 16 Fahrgäste × 6 Körper = 96 Körper, 1/60 s, 2 Substeps.
- Texturen: ein Atlas pro Welt (max. 4096 × 4096), Deko-Props im gemeinsamen Atlas.
- Kein Filter über dem gesamten Bildschirm; das Papierkorn ist ein TilingSprite mit Multiply. Shader des Stil-Updates laufen pro Spur auf halber Auflösung (siehe docs/ART.md).

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

## 10. Deployment und CI
GitHub Pages über `.github/workflows/deploy.yml`: Bei Push auf den Hauptbranch wird getestet, gebaut und `dist/` veröffentlicht. In den Repo-Einstellungen unter Pages muss „GitHub Actions“ als Quelle gewählt sein. `.github/workflows/ci.yml` prüft jeden Push auf andere Branches und jede Pull-Request: ein Job mit Vitest und Typecheck/Build, dazu die sechs Playwright-Szenarien (`scripts/scenario.mjs <Schritt>`) als parallele Matrix im Chromium mit SwiftShader; die Screenshots hängen je Szenario als Artefakt am Lauf. Die Matrix ist nötig, weil jede Mausbewegung beim Zeichnen auf den Software-gerenderten Frame wartet: ein Strich dauert auf dem Runner mehrere Minuten, alle sechs nacheinander liefen ins Job-Timeout.

## 11. Umsetzungsstand und bekannte Eigenheiten
- Alle Zeichnungen in Metern: Formen mit kleinen Radien (Augen, Räder, Coins) werden über `MGraphics` (src/render/mgraphics.ts) intern in Zentimetern tesselliert, sonst entstehen Vielecke.
- Die Bahn wird nach Spuren (gerundetes z) in Stücke geteilt und in die passende Tiefenebene gelegt; Berge/Wasser liegen über Bahn und Zug (Tunnel-Effekt).
- Offene Bahnen haben keinen automatischen Rückweg mehr: Absperrband (`TrackRenderer.updateBarriers`, Ebene `barriers` zwischen Schienen und Coins, flattert jeden Frame) am Ende und 3 m hinter der Station; die Fahrt endet dort mit `openEnd`. `closeTrack` (Halbkreis-Kehre 8,4 m über eine zwei Spuren entfernte Spur, Bremsstrecke max. 8 m/s) bleibt als Werkzeug.
- Der Oben-Vektor wird per Parallel-Transport berechnet und bei waagerechter Bahn stetig zur Welt-Senkrechten zurückgezogen; so bleiben Kurven Kurven und Loopings Loopings.
- Fahrgäste werden im Wagen-System simuliert (Rapier, Kraft = −m·gefühlte Beschleunigung); beim Verlassen der Wanne werden sie in eine Welt-Simulation mit Boden übergeben.
- Zeitschritt: `Game` begrenzt dt auf 50 ms; auf sehr langsamen Renderern läuft das Spiel dann in Zeitlupe. `?fast=N` beschleunigt für Tests. Die Fahrt rechnet in festen 1/60-s-Schritten (höchstens 120 pro Bild) und zeichnet interpoliert.
- Schriften (Fredoka, Nunito, Lobster) liegen lokal unter `public/fonts/` (variable woff2, OFL); es gibt keinen Google-Fonts-Aufruf, damit das Spiel offline läuft und Screenshots in Tests deterministisch sind.
- Nicht umgesetzt (siehe README): Vorlagen-Elemente, Weiche/Kippschiene/Rückwärts-Weiche/Fallschacht, Audio, Capacitor-Builds.

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
