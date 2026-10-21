<!-- Arbeitsplan nach dem ersten Spieltest (Oktober 2026). Quelle: Planungssession; wird je Meilenstein unter „Umsetzungsstand“ fortgeschrieben. -->

# Trauma Coaster – Plan nach dem ersten Spieltest

## Kontext

Nach dem ersten Test des Prototyps (PixiJS 8 + Rapier2D, Branch `claude/serene-pascal-43m0gq`) liegt eine Liste mit 18 Anpassungen vor. Sie betreffen fünf Bereiche: (1) das Zeichnen und Bearbeiten der Bahn, (2) Fahrt, Physik und Feedback, (3) Karte und Übergänge, (4) Grafikstil und Terrain/Tunnel, (5) Technik, Plattform und Spielkonzept. Der Plan ordnet die Punkte in Arbeitspakete mit Abhängigkeiten, nennt pro Paket den technischen Ansatz, die betroffenen Dateien und die Prüfung. Jedes Paket ist ein eigener Commit-Block auf dem Branch; die Reihenfolge ist so gewählt, dass die Bedienung zuerst stimmt (sie entscheidet, ob das Spiel Spaß macht), dann das Feedback der Fahrt, dann Karte/Übergang, dann der Stil, dann Tunnel und Plattform.

### Antwort auf die Frage „fehlender Cloud-Zugriff, deshalb alles mit Shadern“

In der ersten Session gab es kein Werkzeug, um Bilder zu erzeugen (kein Bildgenerator, keine API). Deshalb wurde der gemalte Look vollständig **prozedural** gebaut. Die Code-Analyse zeigt genauer, was das heißt: Es gibt im ganzen Projekt **keinen einzigen Shader oder Filter** (gegrept nach `Filter`, `glsl`, `Shader`, `GlProgram`, `wgsl`: nur zwei Kommentare). Alles sind Pixi-`Graphics` (Vektorpolygone mit `wobble`-Rauschen) plus sechs Canvas-2D-Texturen (`src/render/paint.ts`: Himmelverlauf mit Pinselbändern, Wolke aus Kreisbögen, Papierkorn als Pixelrauschen, Funkel/Glow für Partikel). Das einzige Mesh ist das gebogene Gitter der Karte (`src/render/bend.ts`), die einzigen Blend-Modi sind Multiply (Papier) und Erase (Miniaturrand). Die Drop-in-Pipeline (`src/assets/manifest.ts`, `art(name, fallback)`) ist angelegt, aber nur Himmel und Wolken lesen sie überhaupt, und `public/art/` existiert nicht. TECH.md beschreibt Dinge, die es nicht gibt (`PaintFilters`, instanzierte Streben, ParticleContainer). Der Look ist deshalb „sauber“, aber flach: keine gemalte Textur, kein Pinselduktus, keine Körnung, kein Licht.

In dieser Session gibt es drei Wege zu echten gemalten Texturen:

| Weg | Was | Kosten/Haken |
|---|---|---|
| **Bildgenerator per Werkzeug** (Canva `generate-image`, Figma `generate_image` mit Gemini/GPT-Image) | Pro Prompt ein Bild, bis 2048 px, Stil über Prompt + Referenzbild steuerbar | Verbraucht Canva- bzw. Figma-KI-Credits pro Bild; Figma braucht eine Datei; Kachelbarkeit (seamless) muss nachbearbeitet werden |
| **CC0-Texturpakete** (Voxel Core Lab „Watercolor Terrain“ 16 PNG CC0; Lynocs „Stylized Texture Pack“ CC0; Kalponic „Painterly Vol. 1“ 8 PNG CC0; OpenGameArt CC0-Sammlung) | Fertige, kachelbare, handgemalte Flächen (Gras, Fels, Wasser, Erde, Schnee, Lava) | Allgemeiner Look, nicht Earle-spezifisch; dient als Pinselstruktur unter den eigenen Farben |
| **Shader** (GLSL/WGSL in PixiJS 8, Mesh + Filter) | Alles, was sich prozedural *besser* machen lässt: Earle-Stippling (Punktraster auf Silhouetten), Leuchten/Glow, Luftperspektive, Wasser, Tunnel-Ausschnitt, Papierkorn | Kein Credit-Verbrauch, aber „gemalt“ wird es erst in Kombination mit echten Pinseltexturen |

Empfehlung: **Hybrid.** Gemalte Kacheln (generiert + CC0) als Materialien, Shader für Stippling, Licht, Luftperspektive und Masken, Vektor-Silhouetten (Pixi Graphics) für die Formen. So bleibt alles pro Welt umfärbbar (Palette als Uniform), die Texturen sind klein (ein Atlas pro Welt), und der Stil ist auf dem Handy flüssig.

## Recherche-Ergebnisse (Stand 21.10.2026)

### Technik-Stand
- `pixi.js` 8.22.0 ist die aktuellste Version (npm), bereits im Projekt. v8.20+ hat WGSL-Overrides, Render-Bundles, Partial-Buffer-Updates; WebGPU mit WebGL-Fallback.
- `@capacitor/core` 8.5.3 ist aktuell; Capacitor ist noch nicht im Projekt (nur in TECH.md beschrieben). `@dimforge/rapier2d-compat` 0.21.0 aktuell, `vite` 8.3.5 aktuell.
- Kein PWA-Manifest, kein Service Worker im Repo (prüfen im Rendering-Bericht).

### Touch-Bearbeitung von Kurven (statt enger Bezier-Handles)
- **κ-Curves** (Yan, Schiller, Wilensky, Carr, Schaefer, SIGGRAPH 2017; Adobe Illustrator „Kurvenzeichner“): Kontrollpunkte liegen **auf** der Kurve, jeder Punkt ist ein lokales Krümmungsmaximum (Scheitel). Keine Handles. Genau die Semantik einer Achterbahn: ein Punkt = eine Kuppe, ein Tal, ein Kurvenscheitel. Quelle: https://people.engr.tamu.edu/schaefer/research/kcurves.pdf
- **Segment ziehen** (Embrilliance „drag on the outline“, Figma „Bend“-Werkzeug, Blender Curve Pen „Move Segment“): Man zieht die Kurve selbst zwischen zwei Punkten, die Tangenten werden automatisch angepasst. Für Touch deutlich besser als Handles, weil das Ziel (die Bahn) groß ist.
- **Große unsichtbare Trefferflächen mit Verdrängung** (Motion.dev BezierCurveEditor): Trefferflächen verschieben sich, wenn Punkte eng liegen.
- Folgerung: Standard-Bearbeitung = Scheitelpunkte auf der Bahn + Segment ziehen; Bezier-Handles nur im Profi-Modus (langer Druck auf einen Punkt). Datenmodell bleibt kubischer Bezier (`TrackNode`), Tangenten werden aus den Nachbarn abgeleitet (Catmull-Rom, zentripetal, auf 3D erweitert), solange der Spieler sie nicht pinnt.

### Terrance & Phillip (South Park) als Animations-Vorbild
- Cut-out-Puppen: flache Teile, die sich nur verschieben und drehen; Bewegung bewusst ruckelig (auf Zweiern/Dreiern animiert, also 8–12 Schritte pro Sekunde statt 60).
- Kanadier-Rig: Der Kopf ist waagerecht in der Mundlinie geteilt; beim Sprechen/Lachen klappt die **obere Kopfhälfte** nach oben (Scharnier hinten am Kopf), der Unterkiefer bleibt. Perlen-Augen (zwei Punkte), kein Hals, Körper hüpft als Ganzes, Arme sind starre Streifen, die an der Schulter schwingen, Beine kurze Streifen.
- Das GDD-Rig (Oberkopf / Unterkopf + Rumpf mit Gelenk an der Oberlippe) passt dazu bereits exakt.
- Für den Editor: Idle-Loops (Kopfklappen beim „Reden“, Blinzeln als Perlen-Schließen, Winken mit starrem Arm, Hüpfer), Reaktionen auf Tippen (Erschrecken: Kopf klappt weit auf, Augen werden größer), beim Rauswurf Flug mit Rotation als Ganzes und kurzes Zappeln.

### Eyvind Earle und Rayman Legends (Stil-Analyse aus `refs/`)
- Earle: große, **flache Farbflächen mit harter Kante**, dunkel-zu-hell aufgebaut (Silhouette schwarz, dann Mittelton, dann feine helle Lichter), **Stippling** (Punktraster) als Textur auf Baumkronen und Hügeln, **verzweigte schwarze Stämme** mit farbigen „Flechten“-Flecken, **gestreifte Bodenlinien** und Schneeflächen als parallele Bänder, Luftperspektive als Farbstufen (Türkis/Blau/Violett), Bäume als Kugeln, Sterne und Fächer. Deine Feedback-Auswahl (Ordner `feedback-2026-09-30`): rote Scheune/weiße Rindenlinien, bunte Kronen mit schönen Stämmen, organische Stämme mit Punktgruppen, Sternnadel-Baumform, Tannenwald aus Punkten mit Schneeflächen.
- Rayman Legends (UbiArt): handgemalte Texturen auf verformbaren Streifen („Friezes“) entlang von Splines, mehrere Parallaxe-Ebenen, weiche Verläufe, Licht durch Blätter, Wasser als transparente Ebene mit Unterwasser-Grün, Buden und Stützen als gemalte Holz-Elemente. Gerade die **Frieze-Technik** (Textur entlang einer Kurve) ist für Schienen, Pfeiler und Bodenstreifen ideal.
- Zielstil Trauma Coaster: Earle-Silhouetten und Stippling in Rayman-Farbigkeit, dazu Glitzer/Leuchten auf Interaktivem. „Wild und abgefahren“: übergroße organische Formen (Kugelbäume, Fächer, Sternnadeln), symmetrische Ornamente an Pfeilern, leuchtende Kanten.

## Entscheidungen (mit Nicole abgestimmt, 21.10.2026)
- **Texturen über Figma** (Pro-Konto): Bildgenerator-Werkzeug `generate_image` in einer Figma-Design-Datei; Modelle Gemini 3.1 Flash Image oder GPT-Image 2.5 (über Figma-KI-Credits). Ergänzend: Prompt-Liste in `docs/ART-PROMPTS.md`, damit Bilder auch manuell in ChatGPT (GPT Plus) erzeugt und in `public/art/` abgelegt werden können; GPT Plus selbst lässt sich nicht an diese Session anbinden.
- **Reihenfolge**: A (Bahn zeichnen/bearbeiten) → B (Fahrt, Physik, Gurte, negative Ziele, Figuren) → C (Karte/Übergang) → D (Stil) → E (Tunnel/Terrain) → F (Technik/Plattform/Doku).
- **Bearbeitung**: Scheitelpunkte auf der Kurve + Segment-Ziehen; Bezier-Handles nur nach Langdruck (Profi-Modus).
- **Figuren**: Terrance-&-Phillip-Rig ohne Pups-Gag.

### Figma-Anbindung (Stand dieser Session, geprüft per `whoami`)
- Der Figma-Connector dieser Session ist mit dem Konto **„Fisch Rex“ (fischrex@gmail.com)** verbunden: Plan „Fisch Rex's team“, Stufe **Starter**, Sitz **View**. Das ist nicht das Pro-Konto. Mit Starter/View-Sitz sind KI-Bildgenerierung (`generate_image`, verbraucht Figma-KI-Credits) und Dateianlage in Teams nicht oder nur stark begrenzt möglich.
- **Figma Weave** (Figmas KI-Medien-Werkstatt mit Modellen wie Nano Banana, die **Referenzbilder** annehmen, ideal für die Earle-Vorlagen) ist nicht verknüpft: Meldung „You haven't linked your Figma account to Weave yet.“
- **So wird es angebunden (Nicole):**
  1. Unter https://claude.ai/customize/connectors den Figma-Connector trennen und mit dem **Pro-Konto** neu verbinden (bei der Figma-Anmeldung das Pro-Konto wählen). Alternativ: „Fisch Rex“ als Editor ins Pro-Team einladen (dann reicht ein Pro-Sitz dort).
  2. Weave verknüpfen: https://app.weavy.ai/settings?section=profile öffnen, mit dem Figma-Konto anmelden, im Profil „Link Figma account“.
  3. **Neue Session starten** (Connectors werden beim Start der Session gelesen). Dann liefert `whoami` das Pro-Konto, und Paket D kann Bilder erzeugen.
- **GPT Plus** lässt sich nicht an diese Session anbinden (ChatGPT hat keinen Connector). Zwei Wege, es trotzdem zu nutzen: (a) Figmas `generate_image` bietet das Modell `gpt-image-2.5-sunburst` an, abgerechnet über Figma-Credits, nicht über GPT Plus; (b) Paket D erzeugt `docs/ART-PROMPTS.md` mit allen Prompts, Dateinamen und Größen, damit die Bilder manuell in ChatGPT erzeugt und in `public/art/` abgelegt werden können (Drop-in-Pipeline, kein Codeeingriff). Paket D ist so gebaut, dass es auch ohne Generator startet (CC0-Pinselkacheln + Shader) und die Kacheln später austauschbar sind.
- Im Ablauf von Paket D: Skill `figma:figma-create-new-file` laden → Design-Datei „Trauma Coaster – Art Kit“ anlegen → pro Kachel `generate_image` (Prompt aus `docs/ART-PROMPTS.md`, 1024–2048 px) → `image.url` herunterladen → `scripts/art-prep.mjs` (kachelbar, WebP, Manifest).
- **Stand später am 21.10.:** Der Connector läuft jetzt über das Pro-Konto (Team „playground“, Pro-Sitz); Weave ist verknüpft, aber nicht nötig. Die Asset-URLs (`www.figma.com/api/mcp/asset/…`) sind aus der Session heraus gesperrt (Netzwerkrichtlinie der Umgebung); der Weg ist stattdessen `get_screenshot` mit `enableBase64Response`, das liefert die Knoten in voller Auflösung als PNG auf die Platte. Gemini Flash und GPT-Image 2.5 wurden verglichen; GPT-Image trifft den Earle-Stil deutlich besser (Stippling, schwarze Stämme, harte Kanten) und ist das Modell des Kachelsatzes.

## Befunde aus der Code-Analyse

### Rendering und Übergänge (für Pakete C und D)
- **Ebenen** (`src/render/worldView.ts:48-63`): Himmel → pro Spur (+2 … −2) ein Container mit Terrain-Streifen, Streben, Schienen, Coins, Zug, Terrain-„Cover“ (Berge/Wasser, deshalb der Tunnel-Effekt durch Zeichenreihenfolge) → Effekte → Overlay (Tinte, Handles) → Papier (TilingSprite, Multiply).
- **Terrain** (`src/render/terrainRenderer.ts:48-110`): pro Spur ein Polygon aus Cosinus-Hügeln (`src/physics/terrain.ts`), Grasband, Kontur, Blumen-Punkte. Berge: Kontur + Licht/Schatten-Polygone + Felsstriche + „Portale“ als drei konzentrische Kreise (`:213-220`). Nichts animiert, Neuzeichnen nur bei `setTunnelPortals`.
- **Tunnel heute**: `TrackRenderer.draw()` merkt sich, wo `insideMountain` wechselt (`src/render/trackRenderer.ts:132-137`), Streben werden im Berg übersprungen (`:155`). Kein Ausschnitt, keine Höhle, kein Portal-Sprite; der Zug verschwindet nur hinter dem Berg-Polygon.
- **Schienen** (`trackRenderer.ts:80-140, 215-257`): pro Spur ein `Graphics`; Schwellen als Striche, Schiene als drei übereinanderliegende Striche. Streben (`:142-213`) rein prozedural pro Skin. Vorschau beim Zeichnen (`:229-232`): nur die Mittellinie, ohne Schwellen/Streben, alle 80 ms neu (`src/app/scenes/level.ts:1441-1446`, `previewStroke` `:536-557`). Die rohe Tinte (`drawInk`, `level.ts:509-534`): weiße Linie 0,9 m + Farbe (grün/pink/gelb) im Overlay.
- **Zug** (`src/render/trainRenderer.ts:78-154`): projizierter Quader, jeden Frame neu gezeichnet; Fahrgäste sind flache 2D-Rigs, per Matrix in den Wagenrahmen geschert (`:168-188`), rausgeflogene in einem eigenen „flying“-Sprite (`:191-214`).
- **Figuren** (`src/render/characterSprite.ts:31-34`): Teile `legL, legR, armL, torso(+Unterkopf, Mund), armR, head(Oberkopf, Augen, Brauen, Haare, Hut)`; `update()` (`:304-326`) macht Blinzeln (alle 2–6 s), Pupillen nach g, Mund nach g_Sitz. Im Editor (`src/app/scenes/editor.ts:269-277`) nur Pupillen-Wandern, Blinzeln und ein 0,03-rad-Schaukeln des ganzen Körpers.
- **Kamera** (`src/render/camera.ts`, Follow in `level.ts:1244-1259`): exponentielle Glättung, Zoom nach Tempo; **Zeitlupe existiert** (`level.ts:91-92`: `timeScale`, `slowMo`; `peak` 0,35 s, `fail` 1,4 s bei 0,45). Physik in festen 1/60-s-Schritten.
- **Karte** (`src/app/scenes/start.ts`): Layout `:294-320` (Hochformat: `R = max(0.95w, 0.55h)`, `surfaceY = 0.63h`, `textBottom = 222`, `maxH = surfaceY − textBottom − 52`); Drehung = Drag mit `velocity = lerp(v, d/dt, 0.6)` (`:361-375`), beim Loslassen Sprung auf `nearest(focus + velocity/4)` und **kritisch gedämpfte Feder `SPRING = 55`** (`:86`, `:622-636`). Keine Reibung, keine Rasten, kein Nachschwingen: fühlt sich nicht wie ein Rad an. Play-Button `:940`: Hochformat mittig `(w/2, h−70)`, Querformat rechts unten `(w−135, h−50)` seit Commit 6a598d0 (vorher mittig).
- **Übergang** (`start.ts:469-577`, `src/app/mapTransition.ts`): drei Screenshots (Himmel, Welt, UI) als RenderTextures; Welt als `BentSheet` von Krümmung k auf 0 gebogen (1,55 s rein, 1,35 s raus), Zoom logarithmisch. **Sprünge**: Karte und Level haben **zwei getrennte Wolken-Implementierungen** (`start.ts:276-288` vs. `src/render/sky.ts:53-66`, andere Anzahl, Tönung, Positionen) und **verschiedene Himmelstexturen** (`start_w<id>` Seed id+50 vs. `w<id>` Seed id); Sonne, Hügel-Silhouette und Papierkorn gibt es nur im Level. Beim Übergang wird ein **eingefrorener** Himmel-Screenshot eingeblendet, während die Kartenwolken ausblenden. Das ist das „Springen“.
- **App-Shell** (`src/app/game.ts:24-31`): `preference: 'webgl'`, Auflösung min(2, dpr), Antialias. Kein PWA-Manifest, kein Service Worker, kein Capacitor.
- **Performance-Hinweis**: Zugwagen, Münder, Kartenboden und Miniatur-Meshes werden jeden Frame auf der CPU neu gebaut.

### Physik, Fahrgäste, Ziele (für Paket B)
- **Zug** (`src/physics/trainSim.ts`): Substeps 1/120 s; `FailReason = derail | fall | stall | eject | water | ejectSide`; Events `coin, tunnelEnter/Exit, booster, brake, splash, liftStart/End, launchEnd, peak, fail, finish, inversion`. `RideStats` (`:61-76`): `time, maxSpeed, maxG, minG, maxLatG, airtime, coins, tunnels, boosters, splashes, inversions, blackout, brakesUsed, distance` (kein Rauswurf-Zähler, keine Höhe). Entgleisen (`:380-388`): sofort bei `gLat > lateralLimit` des Skins (Holz 2,0 … Space 3,5), außer auf Auto-Rückweg. **Nach dem Fail bleibt der Zug auf der Schiene** und rollt weiter (`integrate(afterFail)`), kein Flug, kein Umkippen. Fahrgäste spüren Launch/Bremse nicht (`feltFwd ≈ 0`, `:300-336`).
- **Fahrgäste** (`src/physics/passengers.ts`): Rapier-Wanne (Boden, Rücklehne 0,95, Trenner 0,6, Vorderwand 0,6), Ragdoll 6 Teile; Scheinkraft `−m·(feltFwd, feltUp)`; seitlich nur Schwelle `sideEjectG` (hartkodiert **2,2** in `level.ts:1112`, GDD/Tests sagen 2,5) über 0,15 s. **Rauswurf**: Rumpf > 1,70 m über Boden oder > 1,9 m vor/hinter der Mitte (`:239-243`). Kein Gurt/Bügel irgendwo. Welt-Boden nach Rauswurf nur Spur 0 (`buildGround`, `:171-181`).
- **Ziele** (`src/levels/types.ts`, `evaluator.ts`): 23 Zieltypen, statisch vs. Fahrt; jede Auswertung verlangt `finished && allSeated`, **ein Rauswurf ist immer ein Fehlschlag**; keine negativen/komischen Ziele. `LevelDef.physics {friction, gravity}` existiert (Hook für Gurte), `LevelDef.passengers` ist deklariert, aber ungenutzt (`perCar = 2` hartkodiert).
- **Feedback in der Fahrt** (`src/app/scenes/level.ts:1188-1214`): `fail` → 20 Funken + `slowMo = 1.4`; `finish` → Konfetti. Kein Text, keine Kamera auf den Fliegenden (Kamera folgt immer Wagen 0, `:1255`), keine Entgleis-Animation, kein Blackout-Look, Ergebnis nach 2,2 s Sim-Zeit. **Zeitlupe** = `timeScale 0.45`, aber Physik läuft in festen 1/60-Schritten ohne Interpolation → bei 0,45× nur 0–1 Schritt pro Frame, **stottert**. Im Ergebnis-Modus friert die Physik (Fliegender hängt in der Luft).
- **Rendering des Rauswurfs** (`src/render/trainRenderer.ts:191-214`, `effects.ts`): Fliegender als eigener Sprite, Mund offen; sonst nur Partikel (Funken, Konfetti, Glitzer; `dust` nie benutzt). Kein Stern-Kreis, kein Screen-Shake, kein Wagen-Schaden.
- **Speicher** (`src/core/storage.ts`): `Progress {stars, highest, current, drafts}`, `Settings {…, rideSpeed, devMode}`; `load` merged flach mit Defaults → neue Felder (z. B. Gurt-Stufe) brauchen nur einen Default.
- **Doku-Drift**: Push 2,0 statt 1,6, Lift 6 statt 4, Blackout 7 statt 6, Seiten-Limits anders als im GDD.

### Strich → Bahn → Bearbeitung (für Paket A)
- **Datenfluss**: `LevelScene.dragStart` (`src/app/scenes/level.ts:258`) wählt `extend` (≤ 40 px am offenen Ende) > `overdraw` (≤ 30 px an der Bahn) > `terrain` > `new`; alle 80 ms `previewStroke()` (`:536`, voller Durchlauf der Pipeline, Vorschau nur als Mittellinie `trackRenderer.ts:229`); `dragEnd` → `strokeToTrack`/`extendTrack`/`applyOverdraw` → `setPath` → `sampleTrack(0.25)` → `trackStats`.
- **Pipeline** (`src/track/strokeToTrack.ts`): `prepareStroke` (`:398`) → `interpretWithEvents` (`:811`: `interpretStroke` → `detectLoops` `:510` → `detectTurns` `:587` → `turnShiftProfile` → zweiter Durchlauf → `shapeTurns` `:725`) → `snapEndToStart` (`:1119`) → `pointsToNodes` (`:1010`) → `closePath` (`:1279`).
- **Knotenzahl**: `pointsToNodes` glättet (σ 1,5), resampelt 0,5 m, `limitVerticalCurvature` (bis 400 Sweeps), `roundCorners3`, RDP 0,04 m, Verdichtung auf 1 m, dann Schneider-Fit 3D (`src/core/bezierFit3.ts:28`, G1) mit **Toleranz 0,3 m** (`:1045`, nie parametrisiert). Knoten = Segmente + 1, **keine Obergrenze, keine Scheitel-Semantik**: Knoten liegen, wo der Fit gerade teilen musste, nicht an Kuppen/Tälern. Commit 7d03b89 (0,1 → 0,3 m, Newton-Nachziehen repariert) brachte Oval 17 → 10, Hügel 10 → 5. Kein Test prüft Knotenzahlen.
- **Looping-Erkennung** (`:510-586`, Konstanten `:103-105`): nur im Höhen-Modus, echter Segment-Schnitt in gleicher x-Richtung, Scheitel ≥ 4,5 m, Umfang ≥ 12 m, Rundheit ≥ 0,4, |Δz| ≤ 0,3, nicht in 8 m um die Enden. Fast-Kreuzungen (Lücke) zählen nicht → viele „fast“-Loopings werden Kehren.
- **Bearbeitung** (`level.ts`): `HIT_R = 26` px (`:62`) für Knoten und Handles; Tiefen-Quadrat bei Knoten + (0, 44) px, Roll-Ring bei (44, 0) px (`gizmoPositions` `:451`); Knoten werden mit ~4,6 px Radius gezeichnet, Tangenten-Handles ~6 px. `moveHandle` (`:729`) hält G1. `afterEdit` (`:673`) ruft **immer `closePath`** → Ursache 2 (unten). `insertNode` per Doppeltipp (de Casteljau `:778`). **Keine Live-Ziele während Drag/Preview** (`updateGoals` `:1010` nur nach Commit).
- **Fortsetzen** (`extendTrack` `:1212`): existiert, Start nur ≤ 40 px am letzten Knoten, Tinte dabei komplett grün; `snapEndToStart` zielt auf die Station. Es gibt keinen sichtbaren Vorschlag der Schlussverbindung vor dem Loslassen.
- **Das wilde Endstück, Ursache 1**: `closeTrack` (`:1350-1402`) bei Play: erster Bogen beginnt 2 m hinter dem letzten Knoten mit Höhe geklemmt auf 0,7–2,7 m absolut → endet die Bahn in 12 m Höhe, folgt ein fast senkrechter Sturz; nur das Vorzeichen von `endDir.x` wird benutzt → Knicke; zeigt das Ende gegen die Abfahrtsrichtung, läuft der Rückweg rückwärts und schlägt Schleifen; Terrain wird ignoriert. **Ursache 2**: `closePath` ist nicht idempotent: beim zweiten Aufruf (jede Bearbeitung) werden die `closeTurn`-Knoten entfernt, der verbleibende letzte Knoten liegt ≥ 16,8 m von der Station → `closed = false` → Play hängt `closeTrack` an. Beim Ende-auf-Station-Fall ähnlich wahrscheinlich.
- **Input** (`src/core/input.ts`): Tap ≤ 10 px/300 ms, Doppeltipp 320 ms/30 px (erster Tap feuert sofort), Langdruck 480 ms (von `LevelScene` nicht genutzt → startet einfach einen Strich), zwei Finger = Pan/Pinch, 2-Finger-Tipp Undo.
- **Tests** (`tests/geometry.test.ts`, `scripts/scenario.mjs`, `scripts/playtest.mjs`): Lesarten, Events, Schließen, Überzeichnen, extend; Playwright-Szenarien mit Catmull-Rom-Strichen und handähnlichem Zittern. `scripts/debug-stroke.ts` simuliert ohne `closeTrack` (anders als das Spiel).

### Zusatzbefunde, die die Umsetzung beeinflussen
- `limitVerticalCurvature(world, keep, pinEnd, maxSweeps = 400)` hat den Sweep-Parameter schon (`strokeToTrack.ts:949`), `StrokeOptions.fitError` existiert (`:34`): die Vorschau braucht nur eine `preview`-Option.
- `src/core/input.ts:106-114`: nach `longPress` ruft der InputManager sofort `dragStart` auf; Profi-Handles per Langdruck brauchen einen Wächter, sonst startet ein Strich.
- `feltFwd`-Bug bestätigt (`trainSim.ts:321`: `aTan = −g·t3y`); die echte Tangentialbeschleunigung lebt nur in `integrate` (`:224-285`).
- `stateAt` klemmt offene Bahnen am Ende (`model.ts:308`), `lapDone` (`trainSim.ts:296`) prüft `samples.closed` nicht; beides muss das Absperrband anfassen.
- `index.html` lädt Fredoka/Nunito von Google Fonts: Offline-PWA und deterministische Screenshots brauchen Self-Hosting.
- `closeTrack` wird in `tests/physics.test.ts:17` und `tests/geometry.test.ts:283,372` benutzt: Funktion bleibt, nur der Aufruf in `startRide` fällt.
- `goalLabel` ist ein erschöpfender Switch (neue Zieltypen erzwingt der Compiler), `goalIcon` hat einen Default-Zweig (Icons explizit ergänzen).
- `Sky.update(dt, cam)` liest nur `cam.x`, `cam.y`, `cam.zoom`: die Karte kann einen Adapter liefern.
- Pixi 8: `container.setMask({ mask, inverse: true })` reicht für den Tunnel-Ausschnitt ohne Shader; `new Texture({ source, frame })` liefert Spur-Streifen aus einer RenderTexture.
- `PassengerSim.step` berechnet `carVel` aus `car.tx·trainSpeed` (`passengers.ts:191`), `carPrev` wird nie gelesen: der Flug braucht die echte Wagen-Geschwindigkeit.

## Arbeitspakete (Übersicht)

| Paket | Inhalt | Deine Punkte | Größe |
|---|---|---|---|
| **A Bahn zeichnen/bearbeiten** | A1 Vorschau = echte Bahn · A2 Knotenreduktion mit Scheitel-Semantik · A3 Scheitelpunkte + Segment-Ziehen + Profi-Handles · A4 Mehrfach-Striche + Geister-Schiene + `closePath` idempotent · A5 Absperrband statt Auto-Rückweg · A6 Looping-Erkennung · A7 Live-Ziele + Maßband | Strecke statt pinke Linie, weniger Punkte, intuitives Ziehen, mehrere Anläufe, offenes Ende, Loopings, dynamische Ziele | 2 L + 5 M |
| **B Fahrt/Physik/Feedback** | B1 Interpolation + Zeitlupen-Regie · B2 Zug-Freiflug/Entgleisen · B3 Gurte als Progression + `feltFwd`-Fix · B4 negative Ziele (eject/catch/flight) · B5 Crash-Inszenierung · B6 Terrance-&-Phillip-Animator | Gurte, negative Ziele mit Zeitlupe/Zoom, deutlichere Crashes, witzige Figuren | 2 L + 4 M |
| **C Karte/Übergang** | C1 gemeinsamer Himmel · C2 Ebenen falten auf + stilisierte Miniatur · C3 Glücksrad-Physik · C4 Layout (Karte höher, Play mittig) | Ebenen, Wolken/Himmel ohne Sprung, Drehen wie Glücksrad, Layout | 1 L + 2 M + 1 S |
| **D Stil-Update** | D1 Stil-Bibel + Paletten · D2 Textur-Kit + Prep-Skript · D3 Shader (Stipple, Luftperspektive, Glow, Wasser, Himmel) · D4 organische Pfeiler + Schienen als Band-Mesh · D5 Terrain neu · D6 Earle-Wolken | „Wilder, abgefahrener“, Earle × Rayman, Shader, gemalte Texturen | 1 XL + 2 L + 2 M + 1 S |
| **E Tunnel/Terrain** | E1 Tunnel-Workflow (Röhre, Ameisenfarm, Portale) · E2 Harmonie Stützen/Brücken/Bänder/Wasser | Tunnel/Höhlen, Berge/Täler/See harmonieren | 1 L + 1 M |
| **F Technik/Plattform/Doku** | F1 PWA, Capacitor 8, Haptik, Safe-Area, Ticker 120 Hz, WebGPU-Flag, Dev-Overlay, CI mit Screenshot-Vergleich · F2 Doku-Drift, GDD/TECH/LEVELS/README, ART-PROMPTS | State of the Art, Handy-App + Browser, Spielkonzept | 1 L + 1 M |

## Meilensteine (Reihenfolge A → B → C → D → E → F, mit zwei technischen Ausnahmen)

Jeder Meilenstein ist ein eigener Commit-Block auf `claude/serene-pascal-43m0gq`, am Ende spielbar und getestet (`npm test`, `npm run build`, `npm run scenario`). Die zwei Ausnahmen von der reinen Reihenfolge: **B1 (Interpolation) und der `feltFwd`-Fix kommen als Fundament ganz nach vorne** (sie entsperren Zeitlupe, Flug und Vorschau), und **A5 (Absperrband) landet im Fahrt-Meilenstein**, weil das Davonfliegen am offenen Ende den Zug-Freiflug (B2) braucht.

| Meilenstein | Inhalt | Fertig, wenn |
|---|---|---|
| **M1 Fundament** | B1, `feltFwd`-Fix, A4 (`closePath` idempotent, 56-px-Anschluss, Geister-Schiene), A6, D1 (Stil-Bibel, Paletten), F1-CI-Skelett (Vitest + Szenario in PR-Workflow, Fonts self-hosten), F2-Drift-Fix in TECH.md | Zeitlupe ruckelt nicht mehr; zweimal `closePath` = gleicher Zustand; Fast-Kreuzung wird Looping; `docs/ART.md` steht |
| **M2 Zeichnen** | A1, A2, A3, A7 (+ GDD Kap. 3/4) | Vorschau zeigt Schienen; Oval ≤ 7, Hügel ≤ 4, Looping-Bahn ≤ 7 Knoten; Segment-Ziehen und Langdruck-Handles laufen auf Touch und Maus; Ziele haken live |
| **M3 Fahrt und Scheitern** | B2 → A5 → B3 → B4 (+ Level 12/13/19/23, LEVELS.md) → B5 → B6 | Entgleisen = sichtbarer Flug; offene Bahn = Absperrband + Abflug/Kippen; Gurt-Stufen 0–4 spürbar; „Rausfliegen/Fangen“-Level lösbar; Sticker, Sterne-Kreis, Staub, Shake; Figuren auf Zweiern animiert |
| **M4 Karte** | C1 → C4 → C3 → C2 | Karte→Level ohne Sprung in Himmel/Wolken; Rad rollt aus, rastet mit leichtem Überschwingen; Karte höher, Play mittig; Spurstreifen klappen auf |
| **M5 Stil und Tunnel** | D2 → D3 → D4/D5 → D6 → E1 → E2 | Texturen aus Figma in `public/art/`; Stipple/Glow/Wasser/Himmel-Shader an; organische Pfeiler; Tunnel als Ausschnitt mit Portalen; 60 fps auf iPhone 12 (Dev-Overlay) |
| **M6 Plattform** | F1 (PWA, Capacitor, Haptik, Safe-Area, 120 Hz, WebGPU-Flag, Baselines einfrieren), F2 final | Offline-Start läuft; `npx cap sync` baut; Screenshot-Baselines grün; Doku beschreibt den Endzustand |

Abhängigkeiten: B1 → B2 → A5 → B5; B3 → B4; A2 → A3; A1 → A7 ← A4; C1 → C3 → C2; C1 → D6; D1 → D2 → D4/D5; D3 → D4 (Glow), D5 (Wasser), E1 (Höhlen-Look); E1-Maske geht ohne D3; B6, C4, A6 unabhängig.

## Pakete im Detail

### Paket A – Bahn zeichnen und bearbeiten

**A1 Live-Vorschau als echte Bahn, Tinte nur am Finger, Streben wachsen (M)**
1. `StrokeOptions.preview?: boolean` (`strokeToTrack.ts:25-44`); in `pointsToNodes` (`:1029`, `:1045`): `limitVerticalCurvature(…, opts.preview ? 40 : 400)`, Fit-Toleranz `opts.fitError ?? (opts.preview ? 0.6 : 0.3)`. `strokeOptions()` (`level.ts:498`) bekommt `preview`, `previewStroke` (`:536`) nutzt es für `strokeToTrack`/`extendTrack`/`applyOverdraw`.
2. Inkrementelle Vorbereitung: neue Klasse `StrokePrep` (`src/track/strokePrep.ts`, `push(p)`, `points()`), hält `dedupe`/`smoothStroke`-Fenster (`src/core/rdp.ts`) und `resample`-Carry, rechnet `removeHooks` + `gaussianSmooth` nur für den Schwanz (14 Punkte) neu; `prepareStroke` (`:398`) bleibt der volle Durchlauf beim Loslassen.
3. Preview-Takt adaptiv: Schwelle `max(0.08, 2·letzteDauer)` (`level.ts:1443`).
4. `TrackRenderer.draw(…, preview)` (`trackRenderer.ts:80`): Preview zeichnet Schienen, Schwellen (`drawRailChunk` ohne Kurzschluss `:229-232`), Station (`:280`), Portale; nur `drawSupports` (`:112`) und `drawElements` (`:131`) bleiben aus.
5. Streben wachsen: `drawSupports(…, growth)` interpoliert `top = lerp(bot, top, growth)` (`:160-161`); `setPath(path, animate)` setzt `supportGrow = 0`, `update` zählt in 0,3 s (Ease-out) hoch und ruft neues `trackR.redrawSupports(samples, growth)`.
6. `drawInk` (`level.ts:509`): nur die letzten 1,5 Bühnen-Meter, Breite 0,25, Alpha 0,55, Farbe der Lesart; Terrain-Tinte unverändert.
7. Phase 2 nur bei Bedarf (> 16 ms pro Vorschau auf iPhone 12): Web Worker `src/track/strokeWorker.ts` mit Sequenznummer.
- Tests: `tests/strokePrep.test.ts` (inkrementell == `prepareStroke` außerhalb des Schwanzes; Preview-Pfad weicht in `maxHeight` < 0,5 m vom vollen Pfad ab); Playwright: während `mouse.move` hat `trackR.layers.rails` Kinder.
- Risiko: Vorschau springt beim Lesart-Wechsel (Boden→Höhe rückwirkend) stärker als die Mittellinie → Mindestintervall 80 ms, Farbwechsel der Tinte.

**A2 Knotenreduktion mit Scheitel-Semantik (L)**
1. Neues Modul `src/track/reduceNodes.ts`: `curvatureProfile(pts, window = 2)` (Betrag, vertikale Komponente aus y'', horizontale aus Gier-Rate, z in Metern); `pickApexIndices(pts, prof, events, opts)`: lokale Maxima von |κ| über 1/60 m⁻¹ mit Mindestabstand 4 m, Wendepunkte (Vorzeichenwechsel der dominanten Komponente, Mindestabstand 6 m), Index 0 (Station), letzter Index, Loop-/Kurven-Scheitel aus `events`; `catmullTangents(P, closed)` zentripetal (α = 0,5); `fitSegmentsWithTangents(pts, idx, T, tolAt)` mit festen Tangenten (aus `bezierFit3.ts` exportieren: `generateBezier`, `reparameterize`, `computeMaxError` → `fitCubicWithTangents`), bei Überschreitung Split am Fehlerindex (bis 6 Iterationen); adaptive Toleranz `tolAt = lerp(0.3, 1.0, clamp(1 − maxK·15, 0, 1))` (0,3 m bei R < 15 m, 1,0 m auf Geraden).
2. `pointsToNodes` (`:1031-1063`): nach `roundCorners3`/`simplify3`/Verdichtung → `reduceNodes(dense, events, opts)` statt `fitWithCorners3(…, 179)`; `fitWithCorners3` bleibt als Fallback (`?fit=legacy`).
3. Knoten-Kinds direkt aus den Apex-Quellen (`loopApex`, `turn`), ersetzt die Nächster-Knoten-Suche (`:1065-1077`).
- Tests: `tests/reduceNodes.test.ts` mit kanonischen Strichen aus `geometry.test.ts` (Oval `:298-320` ≤ 7 Knoten, Hügel `:272` ≤ 4, Looping `:195-218` ≤ 7); max. Abstand Polylinie ↔ Bahn ≤ `tolAt` + 0,1 (über `sampleTrack` 0,25 m + `closestSample`); `trackStats` liefert dieselben `loops/turns/lanes`; Kuppen-g auf dem Hügel `minG ≥ −0,6`; bestehende Geometrie-/Physik-Tests bleiben grün.
- Risiko: weniger Knoten → Fit-Abweichung in Kurven-Ein-/Ausfahrten (Querkraft-Spitzen) → dort 0,3 m erzwingen. `overdraw.ts:85` nutzt `pointsToNodes` ebenfalls (Nahtstellen über `smoothJoin` bleiben).

**A3 Scheitelpunkte, Segment-Ziehen, Profi-Handles nach Langdruck, Knoten-Bogenmenü (L)**
1. `HIT_R = 32` (`level.ts:62`); `nodeHitCenters()`: Bildschirmpositionen (`nodeScreen :431`) mit 3 Relaxationsrunden (Paare < 2·HIT_R auseinanderschieben, unsichtbar); `hitNode` (`:435`) sucht darin.
2. `DragState.kind` (`:46`) += `'segment'` (`seg`, `t`, `z`). In `dragStart` (`:258`) nach dem Knoten-Test: `nearestOnTrack(samples, st)` (`overdraw.ts:38`), bei `d·zoom < 24 px` und `handles` frei → `pushHistory()`, Segment-Drag statt Strich. `dragSegment(seg, t, st)`: `target = toWorld(st, z)` (Tiefe fest), `[p0..p3] = segmentPoints(path, seg)` (`model.ts:68`), `Δ = target − bezier3(p0..p3, t)`, Bernstein `w1 = 3t(1−t)²`, `w2 = 3t²(1−t)`, `p1 += Δ·w1/(w1²+w2²)`, `p2 += Δ·w2/(w1²+w2²)` (Least-Norm, Kurve läuft exakt durch den Zielpunkt); zurückschreiben `a.out = p1 − a`, `b.in = p2 − b`, G1 wie `moveHandle` (`:729-747`); Station behält `in`; Auto-Knoten tabu; Höhe klemmen wie `moveNode` (`:725-726`). Reine Funktion `bendSegment(p0,p1,p2,p3,t,target)` in `src/track/edit.ts`.
3. Profi-Handles: `H.longPress` (bisher ungenutzt): `proNode = selected = hitNode(p)`, `longPressArmed = true`, Haptik-Hook; `dragStart` mit gesetztem Flag lässt nur Gizmo-/Handle-Treffer zu (Zusatzbefund `input.ts:106-114`). Tangenten-Handles (`drawOverlay :882-889`, `hitGizmo :465-466`) nur bei `proNode === selected`.
4. Knoten-Menü: `gizmoPositions()` (`:451`) liefert drei Positionen auf einem Bogen (Radius 64 px, Winkel 150°/90°/30°): `depth`, `roll`, `delete`, Icons 48 px (`gizmoLayer :893-906`), `hitGizmo` 32 px; Tipp auf `delete` → `deleteNode` (`:766`); Doppeltipp auf `roll` bleibt Auto-Roll; Tiefe/Roll ziehen wie `dragDepth :750`/`dragRoll :759`.
5. `drawOverlay` (`:846`): Scheitelpunkte ab Freischaltung `handles` immer sichtbar, Farbe nach `kind`, selektierter Knoten mit Lotlinie.
- Tests: `tests/segmentDrag.test.ts` (`bezier3(…, t) ≈ target`, Nachbar-Handles bleiben G1); Playwright: Oval zeichnen, `mouse.down` mitten auf einem Segment, 40 px hoch → `stats.maxHeight` steigt, `nodes.length` gleich; Langdruck 600 ms auf Knoten → `proNode ≥ 0`.
- Risiko: verdrängte Trefferfläche weicht vom sichtbaren Knoten ab → Highlight auf dem tatsächlich gegriffenen Knoten.

**A4 Mehrfache Striche: Anschlusspunkt, Geister-Schiene, `closePath` idempotent (M)**
1. `TrackPath.closure?: { trimmed: TrackNode[]; firstIn: [n,n,n]; lastOut: [n,n,n] }` (`model.ts:37-44`; `clonePath :56` tief kopieren; `storage` serialisiert mit). `closePath` (`:1279`): Vorab `restoreClosure(path)` (Auto-Knoten entfernen, `trimmed` anhängen, `first.in`/`last.out` zurücksetzen), dann wie bisher rechnen, aber jeden destruktiven Schritt protokollieren (`nodes.pop()` `:1299`, `:1324`; Handle-Überschreibungen `:1314-1315`, `:1325`, `:1335-1336`). Ergebnis: zweimal `closePath` = gleicher Zustand.
2. Gleiche Protokollierung in `closeTrack` (bleibt für Tests/Sandbox).
3. Anschlusspunkt: `endMarker` (`level.ts:854-861`) pulsiert (Alpha + Radius ±15 %); `extend`-Trefferradius 56 px (`:298`).
4. Geister-Schiene: `ghostRail: Graphics` im Overlay; in `previewStroke` für `new`/`extend`: `opts.closeSnap = max(8, 60/zoom)` (neues `StrokeOptions`-Feld, von `snapEndToStart :1134` gelesen); ist das Vorschau-Ergebnis `closed`, werden die Schluss-Segmente als gestrichelte, laufende Linie (Dash 0,8 m / Lücke 0,5 m, Offset `+= dt·3`) gezeichnet; beim Loslassen dieselbe Pipeline, `ghostRail.clear()`.
5. `openHint` ohne „oder drück Play“ (de/en).
- Tests: `geometry.test.ts`: `closePath` zweimal auf Oval, Hügel-Rundkurs, offenem Hügel → identische `nodes`/`closed`; `extendTrack` nach `closePath` liefert alte + neue Knoten. Playwright-Szenario: Hügel offen, zweiter Strich ab Ende zur Station, Screenshot der Geister-Schiene, danach `closed === true`.
- Risiko: Profi-Edit der Stations-Eingangstangente wird vom nächsten `closePath` zurückgesetzt → dokumentieren, später in `closure.firstIn` schreiben.

**A5 Kein Auto-Rückweg: Absperrband, Fahrt bis zum Ende, `openEnd` (M, + B2)**
1. `startRide` (`level.ts:1099-1107`): `clonePath/closeTrack/autoReturn`-Block entfernen; offene Bahn fährt als `samples.closed = false`.
2. `trainSim.ts`: `FailReason` += `'openEnd'`; in `integrate` für offene Bahnen bei `s ≥ L − 0.3`: `v > 6` → `wheelLock = 0.3 s` (a −= 25, Event `wheelLock` für Funken), danach `fail('openEnd')` + `startFlight('launch')`; `v ≤ 6` → `fail('openEnd')` + `startFlight('tip')`. `lapDone` (`:296`) und `finish` (`:403`) nur bei `samples.closed`.
3. Absperrband: `TrackRenderer.drawBarrier(g, samples, atEnd, time)` in neuer `barrierLayer`-Map pro Spur (in `WorldView :50-62` zwischen `rails` und `coins`): zwei Pfosten 1,1 m, drei Bänder gelb/schwarz (Streifen 0,3 m), Flattern `y += 0.08·sin(6t + x)`; nur bei offener Bahn am Ende und 3 m hinter der Station; `updateBarriers(time)` jeden Frame.
4. `fail.openEnd` (de/en): „Absperrung! Die Bahn endet hier – zeichne sie zurück zur Station.“ + Sticker (B5).
5. Tutorial-Text `tutorial.l1` („Play ergänzt den Rückweg“) umtexten; GDD Regel 7, TECH 4.7/11.
- Tests: `physics.test.ts`: offener Hügel ohne `closeTrack` → `failReason === 'openEnd'`, `phase === 'flying'`; Kipp-Variante bei v ≤ 6; bestehenden Test `:271-297` umformulieren (`closeTrack` ist Werkzeug, nicht Spielverhalten). Playwright: Szenario „hill“ endet mit `openEnd`, Screenshot der Absperrung vor dem Start.

**A6 Loopings besser erkennen (M)**
1. `src/core/math.ts`: `segmentDistance(p1,p2,p3,p4)` (nächste Punkte zweier Strecken).
2. `detectLoops` (`:510-557`): `LOOP_GAP_MAX = 1.5`, Rundheit ≥ 0,45 bei Lücke; ohne Schnitt, aber `j ≥ i + 6`, Abstand ≤ 1,5 m, gleiche x-Richtung, Höhen-Modus → virtueller Schnittpunkt (Mitte), Event bekommt `gap`.
3. `shapeLoopCrossing(points, loop)` nach `detectLoops` in `interpretWithEvents` (`:811`): Punkte ab `loop.to` über 8 m um `−gap·(1 − smoothstep)` verschieben, damit die Ausfahrt die Einfahrt wirklich kreuzt.
4. Vorschau-Marker: Ring (0,8·k, violett) an jedem `loopApex`-Knoten, unabhängig von `handles`.
5. `detectTurns` (`:587`) schließt die neuen Loop-Bereiche aus; Kehre mit Rundheit ≥ 0,45 und Fast-Kreuzung → Looping; Haarnadel ohne Fast-Kreuzung → Kehre.
- Tests: Looping-Strich mit Ausfahrt 1,0 m neben der Einfahrt → 1 Loop, `minUpY < −0,8`; Lücke 2,5 m → 0; enge Haarnadel (Rundheit ≈ 0,3) → 1 Kehre; Scribble aus `playtest.mjs:178` → 0 Loops.

**A7 Live-Feedback: Ziele während Drag, Maßband-Overlay (M)**
1. `updateGoals` (`level.ts:1010-1051`) aufteilen in `buildGoalsBar()` (einmalig, `goalCells`) und `refreshGoals(ev)` (nur Haken + Pop `scale 1→1.3→1` in 0,25 s + `effects.glitter`).
2. `previewStroke` und `dragMove` (node/segment/handle): alle 100 ms `trackStats` → `evaluate(level, path, ts, null, false, true)` → `refreshGoals`.
3. `src/render/measureOverlay.ts`: `MeasureOverlay.update(samples, stats, terrain, zoom, dt)`: höchster Punkt mit gestrichelter Lotlinie und „↑ 23 m“ (Zahl getweent), Gesamtlänge an der Station, Badges „◎1“/„↻2“ an `loopApex`/`turn`-Knoten; sichtbar während Strich/Drag + 1,2 s. Labels in `ui` über `view.toScreen` positionieren (Welt-Container ist y-gespiegelt, `worldView.ts:102`).
4. Sandbox-Statuszeile (`:1012-1017`) durch das Overlay ersetzen.
- Tests: Vitest `tween(shown, target, dt)`; Playwright: Hügel-Strich bis 20 m ohne `mouse.up` → `goalCells[0].done === true` (Level 1), Screenshot mit Maßband.

### Paket B – Fahrt, Physik, Feedback

**B1 Fester Physikschritt mit Interpolation, Zeitlupen-Regie (M)**
1. `trainSim.ts`: `prevCars` (Kopie in `step()` `:190` vor den Substeps), `CarState` += `vx, vy` (in `updateCars`).
2. `passengers.ts`: `PassengerView.prevParts` (in `step` `:187` vor `local.step()` kopieren, einmal allokiert).
3. `src/physics/interpolate.ts`: `lerpCar(a, b, t, out)` (Position linear, Rahmenvektoren linear + `normalize3`, Winkel kürzester Weg), `lerpParts(a, b, t, out)`.
4. `updateRide` (`level.ts:1216`): `alpha = physicsAccum / h`, Render-Puffer füllen, `view.updateTrain(renderCars, renderViews, dt)`; Kamera nutzt `renderCars`; Ergebnis-Modus rendert aus den Puffern.
5. Regie: `slowMo` → `slow: {factor, until, focus}`; `fail` mit `eject/ejectSide` → 0,25× für 1,2 s auf den Fliegenden, `derail/fall/openEnd` → 0,35× auf `e.car`, `peak` → 0,6× für 0,5 s; `timeScale ∈ [0.2, 5]`; Kamera-Ziel `passenger` = `toStage(torso.x, torso.y, pv.lane)`, Zoom 18.
- Tests: `tests/interpolate.test.ts` (t = 0/1 identisch, Rahmen normiert, Winkel über ±π); Simulation mit `dt = 1/30` und `1/240` liefert gleiche `stats`. Playwright: in Zeitlupe ändert sich die Wagen-Bildschirmposition in ≥ 90 % der Frames.
- Risiko: `flying`-Sprites (`trainRenderer.ts:191-205`) nutzen `pv.parts` direkt → auf Puffer umstellen.

**B2 Freiflug/Entgleisen als Zustand `flying` (L)**
1. `src/physics/flightSim.ts`: `FlightSim(cars, {terrain, gravity, carLength, lane, kind: 'derail'|'fall'|'launch'|'tip', side})`, `step(h)`, `settled`, `writeTo(cars)`. `FlightBody = {x, y, vx, vy, angle, omega, z, bank}`: Gravitation, Luftwiderstand 0,02·v², Ketten-Federn (Ruhelänge `carLength`, k = 300, c = 20), Bodenkontakt an 4 Ecken gegen `terrain.surfaceHeight(x, z)` (Restitution 0,25, Reibung 0,6, Drehimpuls über Hebelarm), Wasser → Dämpfung ×0,3 + `splash`. Startzustände: `derail` tangential, `omega = side·3`, Seitenkippen `bank(t) = side·min(π/2, 2.5t)`, `z(t) = z0 + side·0.25t` (zur Kamera oder weg); `fall` tangential, `omega = −1.5`; `launch` tangential, `omega = −0.6`; `tip` `omega = −2.5` um die Vorderkante. `settled` nach 0,6 s unter |v| 0,3 / |ω| 0,2.
2. `trainSim.ts`: `RidePhase` += `'flying'`; `startFlight(kind)` aus `fail()` für `derail|fall|openEnd`; `substep` bei `flying` → `flight.step(h)`, `writeTo` (Rahmen aus `angle`/`bank`, `felt*` aus Körperbeschleunigung, `feltSide = 0`), `sinceFail += h`; `finished` → `done|failed|flying`.
3. `passengers.ts`: `carVel` aus `car.vx/vy`; `ejectCar(car, cars, kick)` für alle Sitzenden; `impact`-Events (Ecke trifft Boden mit |v_n| > 3) → `LevelScene` ruft `ejectCar`.
4. `level.ts`: Kamera bei `flying` auf `e.car` bzw. den Fliegenden; Ergebnis-Wartezeit `flight.settled || sinceFail > 4`.
5. `drawCar` (`:78`) unverändert (Quader folgt Rahmen, Seitenkippen über `bank`); Spur-Wechsel über `round(z)` gewollt.
- Tests: `tests/flight.test.ts` (Wurfparabel ohne Boden; Landung `settled` ≤ 5 s ohne Durchfallen; Kettenabstand in [1,8; 3,2] m); `physics.test.ts`: Steilkurve mit `skinWood` bei 90 km/h → `derail` → `phase 'flying'`, Wagen-y unter Schienenhöhe; `passengers.test.ts`: `ejectCar`. Playwright: Haarnadel-Szenario mit `skinWood`, Screenshot bei `sinceFail ≈ 0,8 s`.
- Risiko: große Scheinkräfte auf Ragdolls in der Wanne → Kappung `|felt| ≤ 60 m/s²`; Kette nimmt dasselbe `side` für den ganzen Zug.

**B3 Gurte als Progression, `feltFwd`-Bug (M)**
1. `types.ts`: `BeltLevel = 0|1|2|3|4`, `LevelDef.restraint?: BeltLevel`; `WorldDef.restraint` mit `[0,1,1,2,2,3,3,3,4,4]`; `restraintFor(level, world)` in `levels.ts`.
2. `src/physics/belts.ts`: `BELTS: Record<BeltLevel, {holdG, sideG, name}>` = 0 {0, 2.2, 'keine'}, 1 {0.6, 2.2, 'Beckengurt'}, 2 {1.5, 2.8, 'Bügel'}, 3 {3.0, 3.5, 'Schulterbügel'}, 4 {5.0, 4.0, 'Rennsitz'}.
3. `passengers.ts`: `PassengerSimOptions.belt` ersetzt `sideEjectG`; je Fahrgast `beltBroken`, `beltStrain`; nach den Scheinkräften (`:201-206`) Sitzanker `p0`, Feder-Dämpfer `F = −k·(p − p0) − c·v` (k = 900·m, c = 2√(k·m)) nur für Komponenten, die aus dem Sitz ziehen; Sättigung `|F| ≤ m·holdG·g`; > 0,2 s gesättigt → `beltBroken`, `onBeltSnap`. Seitlich `car.gLat > sideG` statt `sideEjectG` (`:212`).
4. HUD: `beltIcon(g, level)` in `widgets.ts`, neben `levelTitle` und während der Fahrt neben `speedText`; beim Reißen Pop + Sound-Hook (`src/core/audio.ts` Stub `play(name)`).
5. `CharacterSprite.setBelt(level, broken)`: Gurtband/Bügel als `MGraphics` im `torso`; `broken` → aufgeklappt.
6. `feltFwd`-Fix: `integrate` speichert `aTangential = (vNew − vOld)/h`; `updateCars` (`:321`) nutzt es statt `−g·t3y`.
- Tests: `passengers.test.ts`: belt 1 bei −0,5 g bleibt sitzen, bei −1,2 g reißt; belt 3 bei −2,5 g bleibt; seitlich 3,0 g mit belt 2 bleibt, mit belt 1 kippt; `physics.test.ts`: Launch → `feltFwd ≈ 12`, Kettenzug am Hang → `feltFwd ≈ −g·sin α`; `evaluator.test.ts`: `restraintFor`-Defaults.
- Risiko: W1-Balance (Level 12 „Airtime ≥ 1 s“ ohne Gurt) → Level 12 `restraint: 1`; Federstabilität bei 1/60 prüfen.

**B4 Negative Ziele: `eject`, `catch`, `flight` (M)**
1. `GoalType` += `'eject' | 'catch' | 'flight'`; `goalLabel` („{n} fliegen raus“, „{n} wieder gefangen“, „Flug ≥ {x} m“), `UNIT.flight = 'm'`, drei `goalIcon`s. `evaluator.ts`: `NEGATIVE = new Set([...])`; `evaluateGoal`: `eject: ride.ejected ≥ v`, `catch: ride.caught ≥ v`, `flight: ride.flightMax ≥ v`; `evaluate`: `seatedOk = level.goals.some(NEGATIVE) ? true : allSeated`.
2. `RideStats` += `ejected, caught, flightMax`; `PassengerSim.stats`; `eject` merkt `ejectPos`, bei `landed` `flightMax`.
3. `catch`: für Welt-Puppen (`:224-235`) Lokalkoordinaten des Rumpfs je Wagen (inverse `toWorld` `:268-271`); bei `|lx| < halfLength`, `0.1 < ly < rearWallH + 0.4`, Relativgeschwindigkeit < 9 m/s und `|pv.lane − car.z| < 0.5` → `reseat(i, c, row)` (Welt-Puppe entfernen, `buildRagdoll` lokal, `ejected = false`, `caught`, `onCatch`).
4. `level.ts` `onEject`: `sim.fail` nur, wenn das Level keine negativen Ziele hat; sonst Sticker + Zeitlupe 0,25× auf den Fliegenden; `onCatch` → Zeitlupe, Kamera auf Wagen, Konfetti, Sticker „Gefangen!“; `showResult` mischt `passengers.stats` in die Ride-Stats.
5. Level-Vorschläge (`levels.ts`, in LEVELS.md prüfen): Level 13 „Abflug“ (`eject 1`, `height 20`, Bonus `flight 15`, `restraint 0`), Level 19 „Rückfänger“ (`catch 1`, `height 20`, Bonus `maxG 4`, 4 Wagen), Level 23 Bonus `flight 30`, Level 12 `restraint 1`; Hooks anpassen; `npm run levels:doc`.
- Tests: `evaluator.test.ts` (eject-Level mit `allSeated = false` → `requiredDone` möglich, Level ohne negative Ziele bleibt streng); `passengers.test.ts` (auswerfen, Wagen unter die Flugbahn → `caught === 1`); Playwright: Level 13 im Dev-Modus → „Geschafft“, Sticker-Screenshot.

**B5 Crash-/Rauswurf-Inszenierung (M)**
1. `widgets.ts`: `Sticker` (zwei `paintRect`-Papiere, ±4°, Slam-in 1,6→1 in 0,18 s, 34 px); in `processEvents`: „Entgleist!“, „Rausgeflogen!“ (Name), „Absperrung!“, „Platsch!“, „Zurückgerollt!“, „Gefangen!“, „Gurt gerissen!“.
2. `CharacterSprite.setFace('normal'|'faint'|'dizzy')`: X-Augen + Zunge bei `gSeat > 7` (2 s), Sterne-Kreis nach `landed`.
3. `effects.ts`: `dust` bei `impact` (12×, Bodenfarbe der Welt) und Landung (6×); neu `ribbons(x, y, n)` gelb/schwarz beim `openEnd`.
4. `Camera.shake(amp 0.6, dur 0.3)` → Offset auf `world.position` in `WorldView.update` (`:102-103`); Auslöser `fail`, `impact`.
5. Funkenspur: `wheelLock`-Events → `effects.sparks` am Vorderrad jeden Frame.
6. Arme rudern: Welt-Puppen `armL/armR.setAngvel(±9·sign(sin 12t))` solange `!landed` und |v| > 2.
7. Physik im Ergebnis-Modus (`level.ts:1454-1456`) läuft weiter, bis alle gelandet oder 6 s; `flightMax` nachwerten.
- Tests: Vitest `Camera.shake` klingt in 0,3 s ab; `ribbons` respektiert Cap 400. Playwright: Oval-Szenario zeigt Sticker; Entgleisen zeigt Staub (`effects.count > 0`).

**B6 Figuren-Animation nach Terrance & Phillip (L)**
1. `characterSprite.ts`: Kopf-Scharnier hinten-unten als innerer Container `headInner` (Pivot nur dort, damit `setPose` die Rapier-Zuordnung behält); `setHeadFlap(rad)` 0–35°; `setEyes('bead'|'line'|'big'|'x')` (Perlen = große Pupille, kleines Weiß; `line` beim Blinzeln); `setMouth('closed'|'open'|'grin')` über `drawMouth` (`:274`).
2. `src/render/cutoutAnimator.ts`: `CutoutAnimator(sprite).play(clip, {loop, once}).update(dt)`, `STEP = 1/12` gestuft (keine Zwischenwerte), Clips als Keyframe-Listen (Halten bis zum nächsten Key): `idle` (Atmen ±0,01, Flap 0–5°, Blinzeln 2 Frames alle 36–72), `talk` (Flap 10°/28° alle 2 Frames), `wave` (starrer Arm ±0,35 alle 3 Frames), `hop` (+0,08 für 2 Frames), `scared` (Flap 35°, `big`, Arme hoch, 6 Frames), `scream`, `dizzy`, `faint`.
3. Einsatz: `EditorScene.update` (`editor.ts:269-277`) → `idle`, Tipp → `scared`, Speichern → `wave`; im Zeichenmodus steht der Zug in der Station (`view.buildTrain` bei `setPath`, Wagen 0 aus `stateAt(samples, 0)`) mit `idle/talk` zufällig, Tipp auf Fahrgast → `scared`; Übersichtsphase → `wave`; in der Fahrt übernimmt die Physik.
- Tests: Animator gegen Interface `AnimTarget` (nach 1 s `idle` genau 12 `apply`-Aufrufe; `scared` kehrt nach 6 Frames zurück; `talk` wechselt alle 2 Frames). Playwright: Editor-Screenshots bei 0,50 s und 0,58 s identisch (Zweier), bei 0,67 s verschieden.

### Paket C – Karte und Übergang

**C1 Gemeinsamer Himmel (M)**
1. `sky.ts`: `Sky.update(dt, view: SkyView)` mit `{x, y, zoom, parallax}` (Adapter statt `Camera`), eingebauter Crossfade `setWorld(world, night, fade = 0.6 s)`, `drawHills` aus `world.ground`, `exportState()/importState()` (Wolken `x, y, depth, speed, time`); Karte bekommt dauerhaft Papier-`TilingSprite`.
2. `start.ts`: `sky`, `skyOld`, `cloudLayer`, `buildClouds` (`:112-117`, `:276-288`, `:606-613`, `:844-853`) durch `new Sky(WORLDS[0])` ersetzen; Zonenwechsel → `sky.setWorld`.
3. Übergang: `snap.sky` entfällt (`captureLevel :26-35` nur `world`, `ui`); Karten-Sky bleibt sichtbar, `parallax = lerp(mapParallax, 1, ramp(p, 0.2, 0.9))`, `x` von Karten-Fokus zu `cam.x`; bei `adopt` → `level.view.sky.importState(sky.exportState())`; Rückweg über `LevelSnapshot.skyState` in `leave`/`enter`.
- Tests: reine Funktion `cloudScreenX(c, view)` (Δx pro Frame < 3 px bei ruhender Kamera während der Parallaxe-Interpolation); Playwright: Wolkenpositionen bei p = 0/0,5/1 stetig, kein Sprung > 10 px zwischen letztem Karten- und erstem Level-Frame.
- Risiko: Nachtwelten W6/8/10 → `setWorld(world, night)` auch auf der Karte.

**C2 Ebenen falten auf, stilisierte Miniatur-Bahn (L)**
1. `miniature.ts render` (`:142-197`): RenderTexture mit fünf gestapelten Spur-Streifen (`WorldView.laneContainer(z)`), `Miniature.lanes: Texture[5]` via `new Texture({source, frame})`, Rand-Ausblendung pro Streifen.
2. `TrackRenderer.drawStylized(path, samples)`: dicke Linie (0,9·k) in Schienenfarbe + Scheitelpunkte + Sticker-Zug; Miniatur nutzt sie statt `setTrack`/`buildTrain`.
3. `start.ts`: `Spot.sheet` → `sheets: BentSheet[5]`; Aufklapp-Winkel `θ_z(p) = π/2·smoothstep((p − p0_z)/0.4)`, `p0_z = 0.15 + (2 − z)·0.039` (60 ms Versatz, hinten zuerst, Rückweg gespiegelt); Mapping `v' = v·sin θ + (1 − sin θ)·v_lane0`, Breiten-Squash `0.9 + 0.1·sin θ`.
4. Überblendung: Streifen `alpha = 1 − ramp(p, 0.6, 0.9)`, Level-Foto `ramp(p, 0.6, 0.9)`.
- Tests: `unfoldAngle` monoton, Versatz 60 ms, p = 1 → π/2; Playwright: Screenshots bei p = 0,25/0,4/0,55; GPU-Speicher (28 × 5 Texturen) prüfen.
- Risiko: +100 Draw Calls bei vielen sichtbaren Spots → nur sichtbare Spots haben Sheets (`:733-738`).

**C3 Glücksrad-Physik (M)**
1. `src/app/wheelPhysics.ts`: `WheelPhysics(spots, ends)` mit `dragStart/dragMove/dragEnd/step(dt) → {passed}`; frei: `a = −0.8·v − 350·sign(v)` (viskos + Coulomb); Einfang bei |v| < 420 px/s auf den nächsten Spot mit Feder `ω0 = √55`, `ζ = 0,6` (leichtes Überschwingen); Gummiband außerhalb `ends` (k = 120, Drag-Faktor 0,35); Obergrenze |v| ≤ 3500 px/s.
2. `start.ts`: `updateScroll` (`:622-636`), Drag-Handler (`:353-382`), `selectSpot` (`:412`) umstellen; je `passed` → `haptics.selection()`, `badgeScale = 1.3`, `bob = 1` (klingt mit `e^{−6t}` ab).
3. Parallaxe: Wolken 0,3×, ferne Hügel 0,1× (`Sky`), Miniaturen wippen `1.5·sin(t·1.3 + id)` px.
- Tests: `tests/wheel.test.ts` (aus 2000 px/s kommt das Rad auf einem Spot zur Ruhe ≤ 4 s; Überschwingen existiert, max. 8 % des Spot-Abstands; `passed` zählt jeden Spot genau einmal; Gummiband kehrt zurück). Playwright: Wisch 600 px in 150 ms → nach 3 s ≥ 2 Spots weiter, keine Zwischenposition.

**C4 Layout (S)**
1. `layout()` (`start.ts:294-320`): Hochformat `surfaceY = 0.56h`, `textBottom = 176`; Querformat `surfaceY = 0.74h`, `textBottom = 88`.
2. `resize()` (`:928-955`): Titel/Weltname/Info nach oben; Play-Button `(w/2, h − 70)` hoch, `(w/2, h − 46)` quer (`:940`); `devBtn` unten links prüfen (Kollision ab w < 640).
- Tests: `scripts/screenshots.mjs` Hoch/Quer; Play-Mitte bei `w/2` in beiden Formaten.

### Paket D – Stil-Update (Earle × Rayman)

**D1 Stil-Bibel und Paletten-Tokens (S)**
1. `docs/ART.md`: Leitbild, sechs Regeln (flache Silhouetten in drei Tönen mit harter Kante; Stippling auf der Schattenseite; schwarze verzweigte Stämme mit Farbflecken; Hügel als parallele Bänder; Luftperspektive als Farbstufen; Leuchten nur auf Interaktivem), Referenzen aus `refs/`, Token-Tabelle je Welt, Asset-Liste, Prompt-Vorlagen (ersetzt TECH.md §6).
2. `WorldDef.palette: {sky: [3], ground: [2], accent, ink, glow, stipple}` (`types.ts:151-164`; alte Felder als Alias); `worlds.ts` befüllen; `src/render/palette.ts`: `tones(base, 3)`, `atmosphereStep(color, z, sky)` als gestufte Luftperspektive.
- Tests: alle Welten haben gültige Palette; `tones` monoton hell→dunkel.

**D2 Textur-Kit und Prep-Skript (M)**
1. `scripts/art-prep.mjs` (devDependency `sharp`): `art-src/<name>.(png|jpg)` → kachelbar (Spiegel-Blend 12 %), 1024/512, `public/art/<name>.webp` + PNG-Fallback, `public/art/manifest.json`; App-Icons 192/512/maskable (F1).
2. `manifest.ts`: `.webp` zuerst, `.png` Fallback; `ART_NAMES` += `paper_grain`, `grass_brush_a..c`, `rock_a..b`, `wood_beam`, `steel`, `cloud_a..c`, `stipple_sheet`, `leaf_dot`, `glow`; neue Aufrufer `paperTexture`, Spur-Bänder (D5), Streben/Schienen (D4), Wolken.
3. Quellen: Figma `generate_image` (nach Umverbinden auf das Pro-Konto; Prompts aus `docs/ART-PROMPTS.md`, auch manuell in ChatGPT nutzbar) + CC0-Kacheln (Voxel Core Lab, Lynocs, Kalponic; Lizenz in ART.md). Welten färben per `tint`/Uniform.
4. Atlas erst bei > 150 Draw Calls (Dev-Overlay).
- Tests: Skript-Test (kachelbar: linke/rechte Spalte identisch; `manifest.json` enthält alle `ART_NAMES`).

**D3 Shader (XL)**
1. `src/render/shaders/`: `laneFilter.ts` (ein Pass pro Spur: Stipple-Raster auf dunklen Pixeln über Hash-Grid, `uThreshold`, `uDotSize` + Luftperspektive `mix(color, uSky, uDepth)`; `Filter` mit `GlProgram.from`, `resolution 0.5`), `glowLayer.ts` (`glow`-Container je Spur mit Leuchtstrichen, `BlurFilter({strength 6, quality 2, resolution 0.5})`, `blendMode 'add'`), `waterMesh.ts` (`Mesh` + `Shader.from`: Wellen-UV + Verzerrung über halbauflösende RenderTexture der Spur darunter, nur bei Bahnänderung neu), `skyMesh.ts` (Vollbild-Quad: drei hart gestufte Verlaufsbänder aus `palette.sky`, Stipple an den Kanten, Sonnenstrahlen `uTime`; ersetzt `skySprite`).
2. `WorldView` (`:50-62`): `laneContainers.get(z).filters = [laneFilter(z)]` nur bei `settings.fx !== 'low'`; ohne `gpuProgram` (WebGPU) Filter aus.
3. `src/core/devOverlay.ts` (`?dev=1`): fps, Draw Calls (Wrapper um `drawElements/drawArrays`), Partikel, Filter-Schalter (Taste F).
4. Budget: 5 Spur-Filter halbe Auflösung ≈ 1,25 Vollbild-Pässe, Glow 2 Pässe halb, Wasser nur bei Wasser-Leveln; Messung auf iPhone 12 (Safari) über das Overlay.
- Tests: Shader-Kompilierung in Playwright/SwiftShader ohne `GlProgram`-Fehler; Hash-Grid als TS-Port deterministisch; Screenshot-Baselines (F1).
- Risiko: Filter-Padding an Spuren über den Bildrand; RT-Speicher für Wasser; WGSL-Duplikate für WebGPU später.

**D4 Pfeiler/Streben organisch, Schienen als Band-Mesh (L)**
1. `src/render/stripMesh.ts`: `StripMesh(texture).setPath(points, halfWidth(s), uScale)` (Polylinie ± Normale, UV.x = Bogenlänge, `textureRepeat`); reine Funktion `buildStrip(points, hw, uScale)`.
2. `src/render/supports/supportStyle.ts`: `SupportStyle.plan(samples, terrain, i): SupportShape[]` (`{spline, width, texture, glow?, ornaments?: lantern|leafBall|crystal|ring}`); Presets je Welt (Wiesenland: verzweigter schwarzer Stamm + Blattkugeln aus Stipple-Sprites; Mine: Holzböcke mit Laternen; Eis: Kristalle; Space: schwebende Ringe; je ein Preset für Jahrmarkt/Schloss/Stadt/Geister/Vulkan/Seen). `drawSupports` (`:142-213`) ruft den Planer, `supports: Map<number, Container>`; Wachsen (A1) über `mesh.scale.y` um den Fußpunkt.
3. Schienen: `drawRailChunk` (`:215-257`) → zwei `StripMesh` (links/rechts, `rail_<skin>_rail`, UV = globales `s`) + Schwellen als `ParticleContainer` + Leuchtkante (Glow D3).
4. Symmetrie: Fußpunkte paarweise ±0,7·k (`:170`), Mittelachse exakt unter der Bahn; `wobble` als Vertex-Jitter.
- Tests: `buildStrip` (2n Vertices, UV.x monoton, Normalen senkrecht); Draw Calls im Szenario 2 < 150; Baselines.
- Risiko: Chunk-Grenzen zwischen Spuren (`:121-128`) → Meshes überlappen 1 Sample, UV über Chunks fortsetzen.

**D5 Terrain neu (L)**
1. `terrainRenderer.redraw` (`:48-110`): Spur-Band in drei harten Tönen (`tones`), Silhouette ohne `wobble` in y; Stipple-Blattwerk als `ParticleContainer` mit `leaf_dot` entlang der Schattenseite (deterministisch, 1/m), ersetzt `dots` (`:112-126`).
2. Kugelbäume: `props.ts` `tree` (schwarzer verzweigter Stamm, 2–4 Kugeln mit Farbflecken, Stipple-Kante); `Terrain.scatter(seed)` streut automatisch (nicht auf Wasser/Bahn).
3. `drawMountain` (`:162-222`): Silhouette + 3–4 parallele Konturbänder (`insetPolygon(points, d)` in `src/render/geom.ts`, Abstand 1,5·k), Schneefeld W3/W7; Felsstriche weg; Portale → E1.
4. `drawWater` → `WaterMesh` (D3) mit Graphics-Fallback.
5. Props auf Dreiton + schwarze Konturen.
- Tests: `insetPolygon` ohne Selbstschnitte; `scatter` deterministisch; Baselines.
- Risiko: Partikelzahl bei 340 m × 5 Spuren → Cap 1500, Culling über `camera.view`.

**D6 Wolken im Earle-Stil (M)**
1. `cloudTexture` (`paint.ts:74-115`) → flach gestapelte Scheiben (2–3 Ebenen) mit harter Unterkante, Stipple-Kante, Rim-Light-Strich; drei Varianten; echte Texturen aus D2 über `art(ART_NAMES.cloud(i))`.
2. `Sky.buildClouds` (`:53-66`): drei feste Parallaxe-Ebenen (`depth ∈ {0.15, 0.5, 0.85}`), Tint aus `palette.sky[1]` bei Nacht; dieselbe Instanz auf Karte und Level (C1).

### Paket E – Tunnel und Terrain-Harmonie

**E1 Tunnel-Workflow: Röhre, Ameisenfarm, Portale (L)**
1. Lesart: `StrokeOptions.allowUnderground` (true bei Freischaltung `tunnel`, `level.ts:498-507`); `interpretStroke`: `heightPoint` (`:423-426`) klemmt auf ≥ −8 m statt 0; Rückkehr auf den Boden (`:482`) nur bei `h ∈ [−0.35, 0.35]` und steigend/flach; Boden-Lesart: Überschuss unter der vordersten Bodenlinie wird negative Höhe in Spur −2. `pointsToNodes` (`:1015`): `rel.y = allowUnderground ? p.y : max(clearance, p.y)`, bei `|y − ground| < 0.6` auf `ground + 0.6` heben (kein „Streifen“); `moveNode`/`dragDepth` analog.
2. Röhren-Erkennung: `TrackRenderer.draw` (`:132-137`) liefert `tubes: {lane, pts, r}[]` (Sample-Läufe mit `y < ground + 0.6 || insideMountain`, Radius 2,2·k); `WorldView.setTrack` (`:79-82`) → `terrainR.setTunnels(tubes)`.
3. `TerrainRenderer.setTunnels`: pro Spur `tubeMask` (Polylinie als Stroke mit Breite 2r + Endkappen), `cover.setMask({mask, inverse: true})` (Ausschnitt in Berg/Wasser/Deko); `cave`-Container (dunkler Fill `shade(ground, −0.7)`, Kristalle/Laternen je Welt alle 4 m als Stipple-Sprites, Glow über D3) zwischen `strip` und `supports` (`WorldView :52-59`) mit derselben Form als normaler Maske; `drawPortal(parent, x, y, z, dir)` (Earle-Ornament: Bogen mit zwei Konturbändern + Schlussstein) ersetzt die Kreise (`:213-220`).
4. Streben im Tunnel aus (`drawSupports :155` + `y < ground + 0.6`), Glow-Lampen alle 6 m auf der Röhrenachse.
5. `trainSim.updateCars` (`:334`): `inTunnel = insideMountain || y < ground + 0.6` → Tunnel-Ziele zählen Senken.
- Tests: `geometry.test.ts`: Strich 3 m unter die Bodenlinie mit `allowUnderground` → `min(y) < −1`, ohne → `y ≥ 0.6`; `physics.test.ts`: Senken-Bahn → `stats.tunnels === 1`; Playwright: Level 31 im Dev-Modus, Strich durch den Berg → `terrainR.tubes.length ≥ 1`, Screenshot.
- Risiko: 5 inverse Stencil-Masken → messen; GDD Regel 11 „Unterquerung nur in Höhen-Lesart“ dokumentieren.

**E2 Harmonie Stützen/Brücken/Bänder/Wasser (M)**
1. `SupportStyle.plan` bekommt `terrain.waterAt(x, z)` → `bridge`-Form (Pfähle bis `groundHeight − 0.3`, Ring-Wellen-Sprite), Geländer als `StripMesh` über Wasser-Läufen (≥ 3 Stützen).
2. Bodenbänder aus gemeinsamem Rauschen: `redraw` (`:64-67`) `noise1(x·0.02 + 0.6·z, worldSeed)` statt `wobble(…, z + 11)`.
3. Bergbauer (`sculptTerrain`, `level.ts:608-634`): Mindestbreite 12 m für Earle-Bänder; Darstellung über D5 automatisch.
4. Wasser folgt der Spurtiefe: `Terrain.waterLevel(x, z)` (Oberfläche auf `min(groundHeight(Ränder))`), `drawWater` und `trainSim`-Wasser-Check (`:396`) nutzen es; `PassengerSim.buildGround` (`:171-181`) pro Spur (lazy, `round(z)`).
- Tests: `waterLevel` für See auf Hügel; `buildGround(lane)` mit `surfaceHeight(x, lane)` (Landung in Spur 2 auf Spur-2-Hügel); Baseline W4-Level mit See.

### Paket F – Technik, Plattform, Doku

**F1 PWA, Capacitor, Haptik, Ticker, WebGPU-Flag, Dev-Overlay, CI (L)**
1. Fonts self-hosten (Fredoka 500/700, Nunito 700/800, OFL) nach `public/fonts/`, Google-Links aus `index.html`, `@font-face` in `illudiy.css`.
2. `vite-plugin-pwa` (`registerType 'autoUpdate'`, Manifest `display 'fullscreen'`, `orientation 'any'`, Icons aus D2, Workbox `globPatterns` inkl. `wasm`/`woff2`/`webp`, `maximumFileSizeToCacheInBytes 8e6`); `scope`/`base` relativ für GitHub Pages.
3. Capacitor 8: `@capacitor/core|cli|ios|android|haptics|status-bar`; `capacitor.config.ts` (`com.illudiy.traumacoaster`, `webDir 'dist'`, `androidScheme 'https'`, `ios.contentInset 'never'`); `src/platform/haptics.ts` (`selection()`, `impact('light'|'heavy')`, `notification()`, Web-Fallback `navigator.vibrate`) für Rad-Klick, Rauswurf/Fang/Gurtriss, Kehren-/Looping-Erkennung; `src/platform/safeArea.ts` → `Game.insets` → `LevelScene.resize` (`safeTop = 14 + insets.top`) und `StartScene.resize`; StatusBar overlay, dark.
4. `game.ts init` (`:24-31`): `ticker.maxFPS = 120`, `minFPS = 20`; `resolution = min(settings.resolutionCap ?? 2, dpr)` mit Heuristik `hardwareConcurrency < 6 → 1.5`; `preference: params.gpu === '1' || settings.webgpu ? 'webgpu' : 'webgl'`; `Settings` += `haptics`, `resolutionCap`, `webgpu`, `fx`.
5. CI: `.github/workflows/ci.yml` (pull_request + push): `npm ci`, `npm test`, `npm run build`, Playwright Chromium, `scripts/scenario.mjs`, dann `npx playwright test` (`tests/e2e/*.spec.ts`, `toHaveScreenshot`, `maxDiffPixelRatio 0.02`, SwiftShader, `deviceScaleFactor 1`, `document.fonts.ready`); Baselines erst nach D einfrieren; `deploy.yml` + `npm run levels:doc -- --check`.
- Tests: `safeArea`-Parser; Settings-Merge mit Altstand; E2E Offline-Start (`context.setOffline(true)` → Seite aus dem Service Worker, `tcGame` vorhanden); Screenshot-Specs Karte Hoch/Quer, Level 1, Oval, Fahrt-Frame.
- Risiko: iOS-Build braucht Mac/Xcode (nur Konfiguration im Repo, Anleitung in TECH.md); SwiftShader-Baselines nur aus CI erzeugen.

**F2 Doku (M, verteilt)**
1. TECH.md-Drift sofort (M1): Rendering-Zeile, Konstanten aus `trainSim.ts:101-116`, Entgleis-Tabelle = `SKIN_PHYSICS`, Rapier-Beschreibung, Knotenzahlen, Auto-Rückweg → Absperrband, Trefferflächen.
2. GDD.md: 3.4 Regeln 7/8/11, 3.6, 4.2 Gesten-Tabelle, 5.2–5.5, 6.3/6.4/6.6, 7.1, 8.4, 9 (Gurt je Welt), 11.1, 13 (Verweis ART.md), 14, 15.
3. LEVELS.md: `gen-levels-doc.ts` um Spalte „Gurt“ und negative Ziele, `--check`-Modus.
4. README: Gesten-Tabelle, Stand, Befehle (`e2e`, `art:prep`, `cap sync`); `docs/ART-PROMPTS.md` (alle Texturen mit Prompt, Größe, Dateiname).

## Spielkonzept-Schärfung (was sich am Konzept ändert)
- **Gurte als Progression** statt „nie angeschnallt“: Welt 1 ohne Gurt (Rauswurf ist der Humor), ab Welt 2 Beckengurt, Welt 4 Bügel, Welt 6 Schulterbügel, Welt 9 Rennsitz; Gurte reißen sichtbar über ihrer g-Grenze. Level können die Stufe überschreiben (`restraint`).
- **Negative Ziele** („Abflug“, „Rückfänger“, „Flugweite“) als Bonus- oder Pflichtziele mit eigener Regie (Zeitlupe, Zoom, Sticker); die Pflicht „niemand fliegt raus“ gilt nur in Leveln ohne solche Ziele.
- **Bahn in Anläufen**: offenes Ende pulsiert, Fortsetzen ab dem Ende, Geister-Schiene schlägt den Schluss vor; **kein Auto-Rückweg** mehr, sondern Absperrband mit Abflug/Kippen als eigener Fehlschlag.
- **Bearbeiten ohne Handles**: Scheitelpunkte + Segment-Ziehen; Handles nur für Profis per Langdruck.
- **Tunnel-Workflow**: Bahn darf unter den Boden (Freischaltung `tunnel`); Röhren, Höhlen und Portale entstehen automatisch.
- **Karte als Glücksrad** mit Rasten, Klick und Parallaxe; Übergang ohne Schnitt mit aufklappenden Ebenen.
- **Figuren** als Cut-out-Puppen (Terrance & Phillip): ruckelig, Kopfklappen, Perlenaugen; ohne Pups-Gag.
- **Stil**: Earle-Silhouetten und Stippling in Rayman-Farbigkeit, gemalte Texturen + Shader, organische Pfeiler.

## Prüfung (Verifikation je Meilenstein)
1. **Automatisch**: `npm test` (Vitest, neue Tests je Paket wie oben), `npm run build` (Typecheck), `node scripts/scenario.mjs` (Playwright-Szenarien inkl. neuer: Geister-Schiene, Absperrung, Entgleis-Flug, Zeitlupe, Übergang), ab M1 CI-Workflow auf jedem Push; ab M6 Screenshot-Vergleich.
2. **Sichtprüfung**: `npm run screenshots` (Hoch/Quer/Desktop) und `node scripts/playtest.mjs` (handähnliche Striche) nach jedem Meilenstein; Screenshots im Chat zeigen.
3. **Auf dem Handy**: Deploy über GitHub Pages (Push auf `main` nach Merge), Test auf iPhone (Safari) mit `?dev=1` für fps/Draw Calls; Zielwert 60 fps auf iPhone 12 bei 3 Wagen und 12 Fahrgästen.
4. **Spielgefühl-Checks pro Meilenstein**: M2 Oval/Hügel/Looping mit Finger zeichnen (Knotenzahl, Segment-Ziehen, Langdruck); M3 Steilkurve auf Holz bei 90 km/h (Flug sichtbar), offene Bahn (Absperrband), Level 13/19 lösbar; M4 Karte wischen (Ausrollen, Rasten, Klick), Übergang hin und zurück ohne Sprung; M5 Level mit Berg (Tunnel), See (Brücke), Nachtwelt (Glow).

## Nicht enthalten (später)
Audio (nur Hooks), Vorlagen-Elemente (Helix, Top Hat …), Weiche/Kippschiene/Fallschacht, Community-Teilen, WGSL-Duplikate der Shader für WebGPU, iOS/Android-Store-Builds (nur Capacitor-Konfiguration und Anleitung).

## Umsetzungsstand

### M1 Fundament (Branch `claude/serene-pascal-43m0gq`)
- **B1 Interpolation + Regie**: `prevCars`/`prevParts`, `src/physics/interpolate.ts`, `LevelScene.interpolateRender`, Zeitlupe als `slow {factor, until, focus}` (Rauswurf 0,25× mit Kamera auf dem Fliegenden bis zur Landung, Entgleisen/Fall/Rückroller 0,35× auf dem Wagen, Kuppe 0,6×). Tests `tests/interpolate.test.ts`, `prevCars`-Test.
- **feltFwd-Fix**: `TrainSim.aTangential` (echte Tangentialbeschleunigung), Kette hält das Tempo stabil (`v <= liftSpeed`); Tests Launch ≈ 12 m/s², Kettenzug = Hangabtrieb in die Lehne.
- **A4**: `PathClosure`-Protokoll (`model.ts`), `restoreClosure`/`closePath` wiederholbar, `closeTrack` protokolliert ebenfalls; `closeSnap`-Option (8 m bzw. 60 px); Geister-Schiene + Looping-Ringe in `LevelScene.drawGhost`; Anschlusspunkt atmet (Alpha + Größe), Trefferradius 56 px. Tests: dreimal `closePath` = gleicher Zustand (Oval, Rundkurs, offener Hügel), Bearbeitung öffnet den Rundkurs nicht, `closeTrack` wird zurückgenommen.
- **A6**: `findRoundLoops` auf dem rohen Strich (Kreuzung oder Fast-Kreuzung ≤ 1,5 m, Rundheit ≥ 0,5, Seitenverhältnis 0,5–2) → steigende Abschnitte werden Anstieg → Kreise vom Boden aus (R 4–9 m) sind Loopings statt zwei Kurven; `detectLoops` mit Hinweisen + zwei Durchläufen (echt, Fast-Kreuzung); `shapeLoopCrossing` zieht die Ausfahrt auf die Einfahrt; `segmentDistance` in `math.ts`; Looping-Scheitel immer als Ring markiert. Tests: Bodenkreise R 5/7/9, Lücke 1 m, kurzes Ende, Oval/Acht bleiben Boden.
- **D1**: `WorldPalette` in `types.ts`/`worlds.ts`, `src/render/palette.ts` (`tones`, `atmosphereStep`, `glowOf`, `luminance`), `docs/ART.md`, `docs/ART-PROMPTS.md`; Test `tests/palette.test.ts`.
- **F1/F2**: `.github/workflows/ci.yml` (Vitest, Build, Playwright-Szenario, Screenshot-Artefakt), Fredoka/Nunito lokal (variable woff2) statt Google Fonts, TECH.md-Drift behoben (Konstanten, keine Shader-Behauptung, Protokoll, Interpolation, CI).
- **Zusatz aus dem Szenario-Lauf**: Ein Rundkurs, dessen Rückweg eine Spur hinter der Station ankommt (Playwright-Szenario 6), blieb offen (3D-Abstand = eine Spur); `closePath` misst jetzt Bühnenabstand (≤ 6 m) und Spuren (≤ 1,2) getrennt und schließt per Halbkreis. Test mit dem Szenario-Strich.
- **Bewusst auf M3 verschoben**: Texte `openHint`/`drawHint`/`tutorial.l1` („Play ergänzt den Rückweg“) bleiben wahr, bis A5 den Auto-Rückweg durch das Absperrband ersetzt.
- **Verifikation M1**: `npm test` 66 Tests grün, `npm run build` ok, `node scripts/scenario.mjs` alle Prüfungen bestanden, keine Browser-Fehler; Screenshots geprüft (Looping-Fahrt, Rundkurs).

### D2 Textur-Kit (vorgezogen aus M5, Branch `claude/serene-pascal-43m0gq`)
- 24 Kacheln nach `docs/ART-PROMPTS.md`: 22 mit dem Figma-Bildgenerator (`gpt-image-2.5-sunburst`, Figma-Datei „Trauma Coaster – Art Kit“), `glow` und `stipple_sheet` prozedural. Quelle für Namen, Größen, Knoten, Regeln und Prompts: `scripts/art-kit.json`; `docs/ART-PROMPTS.md` wird daraus erzeugt (`npm run art:doc`).
- `scripts/art-prep.mjs` (sharp): Chroma-Key mit Saum-Korrektur, Despill für getupfte Motive, Schatten-Regel (Sticker), Zuschnitt auf den Inhalt, Bänder mit fester Breite (Stahlrohr, Wasser), kachelbare Flächen, WebP + `public/art/manifest.json`. Gesamtgröße des Satzes rund 2 MB.
- Eingebunden: Wolken (`src/render/sky.ts`, drei gemalte Formen mit Tönung je Welt) und Papierkorn (Level und Karte). Die übrigen Kacheln warten auf D4/D5/E1 (Stützen, Terrain, Bäume, Portale, Sticker).
- Nicht im Repository: `art-src/` (Quellbilder); das Archiv ist die Figma-Datei.

### M2 Zeichnen (in Arbeit)
- **A2 Knotenwahl** (`src/track/reduceNodes.ts`, `densePolyline` in `strokeToTrack.ts`): Schneider-Rekursion mit adaptiver Toleranz (0,3 m bei R < 25 m, bis 1,2 m auf Geraden), symmetrische Sekanten-Tangenten, Newton nur unter dem Vierfachen der Toleranz, Looping-/Kehren-Scheitel als gesetzte Knoten; `?fit=legacy` zum Vergleich. **Befund gegen den Plan:** Knoten, die auf Kuppen und Tälern einrasten (`snapApex`), machen die Bahn dort messbar enger als gezeichnet (Tal nach 30-m-Drop 5,6 g statt 4,2 g; ein kubisches Segment „Flanke plus halber Bogen“ konzentriert die Krümmung an seinem Ende), ebenso jede Variante mit erzwungenen Scheiteln plus Zusammenlegen (mehr Knoten als der alte Fit, bis 15 statt 10). Deshalb ist `snapApex` standardmäßig aus; die Knotenzahl entspricht dem alten Fit (Oval 5–7, Hügel 5–6, Looping ~10), die Bahn ist in Kurven und am Lift sauberer (keine Knicke an Knoten). Die Scheitelwahl (`pickApexIndices`) bleibt für Maßband (A7) und Bearbeitung (A3: Doppeltipp setzt einen Knoten auf den Scheitel). Der große Knotenabbau des Spieltests (17 → 10 → 6 beim Oval) stammt aus dem Toleranzfix in M1.
- **Nebenbefund, behoben:** `limitVerticalCurvature` maß die Sehnenhöhe senkrecht; auf steilen Flanken ließ es bis zu doppelt so enge Radien durch. Mit Gefällefaktor cos α fällt das schnelle Tal von 5,3 g auf 4,2 g (VALLEY_G 3). Test `physics.test.ts` „hält ein schnelles Tal … bei rund 4 g“ für beide Fits.
- Tests: `tests/reduceNodes.test.ts` (Krümmungsprofil, Scheitelwahl, Halbkreis mit einem Segment, S-Kurve in Toleranz und G1, Knotenzahlen ≤ alter Fit + 1 mit gleichen Statistiken, Handzittern, Knotenarten, snapApex).
- **A1 Vorschau als echte Bahn**: `StrokeOptions.preview` (60 Begrenzer-Durchläufe, doppelte Fit-Toleranz), `TrackRenderer.draw(…, preview)` zeichnet Schienen, Schwellen und Station; Streben wachsen nach dem Loslassen in 0,3 s (`redrawSupports`, `LevelScene.supportGrow`); Tinte nur hinter dem Finger (`INK_TAIL` 1,5 m, mindestens alles seit der letzten Vorschau); Vorschau-Takt adaptiv (`previewCost`). **Nebenbefund, behoben:** Die Kreuzungs-Suchen waren O(n²) (160-m-Strich 170 ms); mit `src/core/segmentGrid.ts` 14 ms, Vorschau 4 ms. Die inkrementelle Strich-Vorbereitung (`StrokePrep`) und der Web Worker aus dem Plan sind damit unnötig. Tests: `tests/preview.test.ts`; Szenario 5 prüft mitten im Strich die Schienen-Grafik und legt `scenario-5-preview.png` ab.
- **A3 Bearbeiten**: `src/track/edit.ts` (`bendSegment`, `alignOpposite`), in `LevelScene`: Trefferfläche 32 px mit Verdrängung, Segment-Griff `trackPending` → quer biegen / längs überzeichnen, Fortsetzen am offenen Ende hat Vorrang, Bogenmenü (Tiefe, Schräglage, Löschen), Profi-Handles nach Langdruck (`proNode`, `longPressArmed`). Tests `tests/segmentDrag.test.ts`; Szenario 7 (Segment quer ziehen: Knoten bleiben, Bahn am Griffpunkt verschoben; Langdruck setzt `proNode`; Tipp ins Leere beendet ihn). GDD 3.6/3.7/4.2 aktualisiert.
- **A7 Live-Ziele und Maßband**: Zielleiste einmal gebaut (`buildGoalsBar`), `refreshGoals` mit Pop und Glitzer, `liveFeedback` höchstens alle 100 ms aus Vorschau und Drag; `src/render/measureOverlay.ts` (Lotlinie, Höhe, Länge, Marken, `approach`-Nachlauf, 1,2 s Haltezeit, im Sandkasten dauerhaft statt der Statuszeile). Tests `tests/measure.test.ts`; Szenario 7 prüft mitten im Strich den Haken „Höhe ≥ 15 m“.

### M3 Fahrt und Scheitern (in Arbeit)
- **B2 Freiflug** (`src/physics/flightSim.ts`, Phase `flying` in `trainSim.ts`): Entgleisen und Herausfallen übergeben den Zug an eine eigene Starrkörper-Simulation (Schwerkraft, Luftwiderstand, Ketten-Federn, Bodenkontakt an vier Ecken, Drehfeder zur flachen Lage, Wasser). `derail` kippt zur Seite der Querkraft und driftet aus der Spur, `fall` überschlägt sich; `launch`/`tip` warten auf A5. Aufpräller werfen die Fahrgäste des Wagens aus (`PassengerSim.ejectCar`, Schubs wächst mit der Aufprallgeschwindigkeit) und zeigen Staub oder Platsch; die Kamera bleibt auf dem Wagen, das Ergebnis kommt, sobald das Wrack liegt (1,2–5 s). Tests `tests/flight.test.ts` (Wurfparabel, Landung ohne Durchfallen, Kette 1,8–3,2 m, Seitenkippen, See), `physics.test.ts` (42-m-Hügel + 4-m-Kehre: Holz entgleist bei über 80 km/h und fliegt, Weltraum-Bahn fährt durch), `passengers.test.ts` (`ejectCar`); Szenario 8 (Entgleisen auf Holz, Flug-Screenshots). **Befund:** Die erste Fassung der Bodenauflage kam nie zur Ruhe (Ausrichtung auf die Bodenneigung ohne Drehrate, Wagen auf dem Dach wurde über 180° zurückgezogen); jetzt gedämpfte Drehfeder zur nächsten flachen Lage, kleine Stöße unelastisch, Kontakt mit 3 cm Rand.
- **A5 Absperrband** (`trainSim.ts`, `trackRenderer.ts`, `level.ts`): kein `closeTrack` mehr beim Play; offene Bahnen fahren offen. Am Ende und 3 m hinter der Station steht ein flatterndes gelb-schwarzes Absperrband (Ebene `barriers`). Kommt der Zug mit über 6 m/s an, blockieren die Räder 0,3 s (Beginn so berechnet, dass die Blockade an der Kante endet, Ereignis `wheelLock`, Funkenspur), dann `openEnd` mit Freiflug `launch`; langsamer `tip`. `lapDone`/`finish` nur auf geschlossenen Bahnen. Texte `openHint`, `drawHint`, `tutorial.l1`, neu `fail.openEnd` (de/en), `autoReturn` entfällt. Tests `tests/openEnd.test.ts` (Abflug mit Radblockade, Kippen bei 2 m/s, derselbe Strich mit `closeTrack` kommt an); Szenarien 3 und 4 schließen ihre Rundkurse jetzt von Hand, Szenario 5 fährt bis zum Absperrband (Flugart `launch`), Szenario 7 prüft das Band am offenen Hügel. GDD Regel 7 und 6.3, TECH 4.7/5/11, README angepasst.
