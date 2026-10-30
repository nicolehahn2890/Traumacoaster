# Trauma Coaster

2.5D-Physik-Achterbahnspiel von illudiy: Die Bahn wird mit einem Fingerstrich gezeichnet, ein Zug mit nicht angeschnallten Fahrgästen fährt physikalisch korrekt darüber. 150 Level in 10 Welten, Sandbox „Meine Bahnen“, Figuren-Editor und Zonen-Editor. Handgemalter Look nach Eyvind Earle × Rayman Legends.

**Dokumente:** [Stand und Plan](docs/ZONENEDITOR-PLAN.md) · [Technik](docs/TECH.md) · [Richtlinie Technik und Look](docs/RICHTLINIE.md) · [Großer Plan (ruht)](docs/GROSSER-PLAN.md) · [Pinsel-Studie (angehalten)](docs/PINSEL-STUDIE.md) · [Spielkonzept v1 (Archiv)](docs/archiv/GDD-v1-2026-10-23.md) · [alte Stil-Bibel (Archiv)](docs/archiv/ART-v1-2026-10-21.md) · [Recherche](docs/research/) · [Archiv](docs/archiv/README.md)

## Spielen

```
npm install
npm run dev        # http://localhost:5173
```

Online (jeder Push auf `main`, nach ein paar Minuten): https://nicolehahn2890.github.io/Traumacoaster/

Mobile zuerst (Hoch- und Querformat), im Browser mit der Maus spielbar:

| Aktion | Touch | Maus |
|---|---|---|
| Bahn zeichnen | Finger auf den Boden setzen und ziehen | Linke Taste ziehen |
| Kurve (Spurwechsel) | Strich umdrehen, ohne ihn zu kreuzen; Rückweg höher = nach hinten | gleich |
| Looping | Strich kreuzen | gleich |
| Bahn verbessern | Über die Bahn zeichnen (Start und Ende auf der Bahn) | gleich |
| Knoten bearbeiten | Knoten antippen, Handles ziehen; Doppeltipp auf Bahn = Knoten einfügen, auf Knoten = löschen | gleich |
| Start-Typ / Kurvenrichtung | Chip an der Station bzw. an der Kurve antippen | Klick |
| Elemente (Booster, Bremse, Splash) | Regal unten rechts öffnen, Element auf die Bahn ziehen; Antippen entfernt | gleich |
| Berg formen (ab „Bergbauer“) | Strich auf dem Boden beginnen und enden | gleich |
| Pan / Zoom | Zwei Finger / Pinch | Rechte Taste oder Leertaste + ziehen / Mausrad |
| Undo / Redo | Zwei-Finger-Tipp / Drei-Finger-Tipp | Strg+Z / Strg+Y |
| Fahrt | Play-Button, Tippen auf die Bühne stoppt | Leertaste |

## Auf dem Handy testen (Vollbild, Hoch- und Querformat)

Die Seite lässt sich als App auf den Home-Bildschirm legen und startet dann ohne Browserleisten im Vollbild; sie dreht mit dem Handy. Die Spielfläche füllt den ganzen Bildschirm, auch unter Kerbe, Dynamic Island und Home-Leiste; nur Knöpfe und Anzeigen weichen diesen Rändern aus. Nach Änderungen an der Startseite die App vom Home-Bildschirm entfernen und neu hinzufügen (iOS merkt sich die alte Einstellung).

- **iPhone/iPad:** https://nicolehahn2890.github.io/Traumacoaster/ in Safari öffnen → Teilen → „Zum Home-Bildschirm“ → vom Home-Bildschirm starten. Für das Querformat die Ausrichtungssperre im Kontrollzentrum ausschalten.
- **Android (Chrome):** Seite öffnen → ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
- Die App hat ihren eigenen Speicher: Fortschritt und Bahnen aus dem Browser sind dort nicht da und umgekehrt.
- Nach einem Push die App schließen und neu öffnen (GitHub Pages braucht ein paar Minuten, der Build läuft unter „Actions“).

## Entwicklung

```
npm run test         # Vitest: Geometrie, Physik, Fahrgäste, Zonen
npm run build        # Typecheck + Build nach dist/
npm run preview      # Build ansehen (Port 4173)
npm run dev:https    # HTTPS im WLAN für das iPad, Port 5180 (vorher scripts/https-cert.sh)
npm run scenario     # alle 33 Playwright-Szenarien; einzeln: node scripts/scenario.mjs 3 5
npm run screenshots  # Playwright-Screenshots (Hoch-, Quer-, Desktop-Format) nach screenshots/
npm run strokes:replay  # aufgezeichnete Striche in allen vier Lesarten nachspielen
npm run kompilieren  # Bilder der Zonen als KTX2 packen
npm run levels:doc   # Levelliste nach docs/archiv/LEVELS-2026-10-21.md
node scripts/lab-stills.mjs  # Standbilder und Messwerte des Tiefen-Labors (Dev-Server muss laufen)
```

Szenarien 1 bis 10 prüfen das Spiel (auch in der CI), 11 bis 33 den Zonen-Editor; diese laufen gegen den eigenen Dev-Server: `TC_URL=http://localhost:<Port>/ node scripts/scenario.mjs 24`. Wie man startet, welche Server Florian gehören und was nie angefasst wird: `docs/TECH.md`, Kapitel 12.

**Tiefen-Labor** (`public/labs/tiefe.html`, lokal unter `/labs/tiefe.html`, online unter `/Traumacoaster/labs/tiefe.html`): dieselbe Szene aus gemalten Elementen als heutige Bühne und als 3D-Welt mit Perspektive, Schatten, Nebel, Umfärben und Höhlenfreilegung; Grundlage der Entscheidung in `docs/RICHTLINIE.md`. Bahntypen und Stützen per Adresse: `?track=road|steel|wood|hanging&sup=normal|crazy|none&feet=1`.

Größen zum Ausprobieren auf dem Handy per Adresse: `?tip=26` (Tropfen unter dem Finger), `?line=15` (gemalte Linie), `?band=30` (Gummiband), `?dzoom=11` (Zeichen-Zoom in px/m).

**Perspektive (Richtlinie, Schritt 1, Beweistest):** `?persp=1` schaltet die Spur-Ebenen auf Kamerafahrt-Perspektive (um das Kameraziel skaliert, vorne größer, hinten kleiner, mit Parallaxe beim Scrollen), `?fov=18` setzt den Bildwinkel in Grad. Der Pinselstrich wird dann je Spur als Strahl gedeutet, die Bahn liegt also weiter genau unter dem Finger. `npm run strokes:replay -- --persp` spielt die Aufnahmen in Perspektive nach.

**Zonen-Editor:** `?zone=<name>&editor=2` öffnet eine Zone (`public/zones/<name>/zone.json`) im Zonen-Editor, seit 30.10.2026 dem einzigen Editor. Im Spiel führt der Knopf „Editor“ auf der Karte und in jedem Level dorthin; oben in der Mitte des Editors bietet „Test ▾“ alle Striche und Lesarten zum Vergleichen. Zonen laufen immer im Weltrenderer, `?zone=<name>` ohne Editor spielt sie. Plan und Stand: `docs/ZONENEDITOR-PLAN.md`, Technik: `docs/TECH.md` 4i bis 4n.

`?world=1` zeigt Levels im Weltrenderer (3D-Boden, Bahn, Stützen, Wagen, Kulissen; `?track=road|steel|wood|hanging`, `?look=day|dusk|night|neon`, `?shadow=0`, `?aa=0`, `?persp=0` zum Vergleichen). `?level=8` öffnet ein Level direkt, `?scene=start` überspringt den Splash, `?scene=splash` zeigt ihn immer (im Spiel: Einstellungen → „Intro ansehen“), `?fast=4` beschleunigt die Spielzeit (Tests), `?dev=1` zeigt fps und Zeichenaufrufe, `&fahrt=1` schaltet die strenge Fahrt ein, `&strich=1` oder `&strich=2` wählt den Strich. Der Knopf **DEV** unten links auf der Karte (oder `VITE_UNLOCK_ALL=1 npm run dev`) schaltet alle Welten, Level, Elemente und Starttypen frei; im Level schaltet dann der Knopf unten links durch alle zehn Bahntypen.

## Stand des Prototyps

Aktueller Stand, Plan und Arbeitsregeln: `docs/ZONENEDITOR-PLAN.md`. Ältere Übergaben und Pläne liegen im Archiv (`docs/archiv/README.md`).

Umgesetzt: Splash, Karte als Drehscheibe mit einer Miniatur pro Level (gebaute Bahn samt Zug) und fließendem Übergang ins Level (die Scheibe biegt sich gerade, zurück krümmt sich der Boden wieder), Bühnen-Zeichnen v2 (am Boden ist oben gleich hinten: flache Kurven; steil hoch ist Höhe: Hügel, Loopings über Kreuzungen, Steilkurven über Kehren in der Höhe; Absperrband am offenen Ende), 3D-Bahnmodell mit echter Bewegung in Kurven und Loopings, automatische Überhöhung, 3D-Handles (Tangente, Tiefe, Roll), Überzeichnen, Löschen-Knopf, Start-Chip (Kettenzug/Launch/Hydro/Pendel/Vertikallift), Element-Regal (Booster, Bremse, Splash, Launch-Block), Bergbauer, Zug-Physik mit g-Kräften (seit 29.10.2026 mit Antrieb und Stützrädern: kein Entgleisen, kein Rückrollen, mindestens 4 m/s; die strenge Fahrt mit Entgleisen, Rückroller und Ausrollen mit `&fahrt=1`), Rapier-Ragdoll-Fahrgäste mit Rauswurf, Kamera-Fahrt, Ergebnis mit Sternen und Freischaltung, alle 150 Level als Daten mit Zielauswertung, Fortschritt lokal, Meine Bahnen (Speichern/Laden), Figuren-Editor, Zonen-Editor (Stufen 1 bis 6: Ebenen und Formen, Farbe und Verläufe, Spiel im Editor, Earle-Schichten, Bilder und Malvorlagen).

Noch nicht im Prototyp (im GDD spezifiziert): Vorlagen-Elemente (Helix, Top Hat, Immelmann, Korkenzieher, Cobra Roll), Weiche, Kippschiene, Rückwärts-Weiche, Fallschacht, Audio (nur Hooks), Capacitor-Builds. Level, die solche Elemente verlangen, sind definiert, aber erst mit diesen Elementen lösbar. Gemalt sind bisher acht Kacheln des Kachelsatzes in `public/art` (Wolken, Papierkorn, Holzmaserung, Laterne, Kristall, Neon-Schild; `docs/TECH.md` Kapitel 6) und die Bilder, die der Zonen-Editor über Malvorlagen einsetzt; alles andere zeichnet das Spiel prozedural.

## Pinsel-Zeichnen (Standard)

Gezeichnet wird mit dem **Pinsel** (in Levels Strich 1, in Zonen mit Ebenen Strich 2, siehe unten); die drei älteren Lesarten Bühne, 1 Strich und Spuren (früher „Ebenen“) gibt es nur noch per Adresse (`?stage`, `?single`, `?lanes`) und im Testmenü des Zonen-Editors, für Szenarien, Replay und Vergleiche. In allen läuft die Tiefe auf dem Bild gerade nach hinten, am Rand scrollt das Bild beim Zeichnen mit (schon mit Abstand zum Rand, umso schneller, je näher und je schneller du ziehst), Zurückziehen radiert.

Pinsel: Die gemalte Linie ist die Bahn. Der Tropfen sitzt unter dem Finger, die Bahn folgt zäh (bei schnellem Ziehen weiter hinterher) und eine rosa, sich verjüngende Schleppe verbindet beides. Schon beim Malen stehen die Schienen da (Live-Vorschau, weiter hinten ruhig); beim Loslassen bleibt die Bahn so, wie sie zuletzt zu sehen war. Die Bahn wählt selbst, was das Bild nicht festlegt: Tiefe je Stelle (steil gezeichnet ist Höhe, auf flachen Stücken rastet sie auf die Spuren ein), nie unter dem Boden, und wo sich Stränge kreuzen oder nahekommen, so weit auseinander, dass der Zug durchpasst. Ein Tipp auf das ⇅ an einer Kreuzung tauscht, welcher Strang vorne liegt. Zurück an der Station läuft das Ende ohne Knick in die Station: Kommt der Strich ungefähr richtig an, wird sein Ende nur eingebogen, sonst schließt ein kurzer Bogen, nie ein großer Umweg. Ein gestrichelter Kreis zeigt, wo das Ende dafür landen muss; endet die Bahn darin offen (oder ginge der Schluss nur mit einer Schlaufe), schließt ein Tipp auf die Station die Runde. Beim Zeichnen treten die Bedienelemente zurück. Eine Wende fährt flach durch die Tiefe statt hochkant (kein ungewolltes Kopfüber, auch kurz vor der Station). Eine hohe Schleife wird ein senkrechter Looping, eine flache bleibt Bodenschleife; Hügel stehen gerade, statt nach hinten auszuweichen, und dürfen nur dann nach hinten, wenn der Zug sonst nicht hinaufkommt. Danach bessern kurze Probefahrten nach. Fortsetzen lässt die alte Bahn, wie sie ist. Knoten: so wenige, wie die Linie verlangt, möglichst gleichmäßig verteilt.

**Strich 2** (Pinsel-Studie, `docs/PINSEL-STUDIE.md`): In Zonen mit Ebenen gilt seit 29.10.2026 Strich 2. Die Tiefe eines Linienpunkts steht 3 bis 12 m hinter der Spitze fest und ändert sich danach nicht mehr, auch nicht beim Loslassen. `&strich=1` nimmt dort den Pinsel von oben (Strich 1), `&strich=2` erzwingt Strich 2 auch in Levels. Der Strich bleibt eingefroren, bis der Zonen-Editor fertig ist; zum Vergleichen dient das Testmenü im Editor.

Spuren (alt, `?lanes`, früher „Ebenen“; nicht die Ebenen des Zonen-Editors): Links wählst du die Spur, gezeichnet wird die Seitenansicht darauf; Kurven entstehen über die Spurwahl (`docs/TECH.md` 4c).

Streckenlänge: Unten links steht immer, wie lang die Bahn gerade ist. Ein Tipp darauf öffnet den Regler für die Strecke, die du zur Verfügung hast (50 bis 1000 m oder unbegrenzt); ist sie aufgebraucht, wächst der Strich nicht weiter. Level mit eigenem Budget geben es vor.

Am offenen Ende steht ein Absperrband: Play fährt trotzdem, und der Zug fliegt dort ab oder kippt über die Kante (Fehlschlag „Absperrung“). Der rote Papierkorb räumt die Bahn weg, der Knopf unten rechts stellt das Fahrttempo (1×, 2×, 3×, 5×).

Im DEV-Modus zeigen rote Ringe die Schwachstellen der Bahn: Kreuzungen und die Stelle, an der eine Fahrt scheitert, mit `&fahrt=1` auch zu enge und zu langsame Stellen; sie verschwinden bei jeder Änderung und werden kurz danach neu geprüft. Ein Tipp auf das Gurt-Abzeichen oben rechts wählt die Gurtstufe für alle Level (bis zurück zur Vorgabe des Levels).

Auf dem Handy zoomt das Zeichnen nicht weiter heraus als etwa 5 mm je Spur; Doppeltipp auf eine freie Stelle wechselt zur Übersicht und zurück.

Strich-Rekorder (nur `npm run dev`, nur mit `TC_RECORD=1`, seit 29.10.2026): Jeder Strich landet mit Lesart, Zoom und Zeitstempeln in `recordings/strokes.jsonl` (nicht im Repo). `npm run strokes:replay` spielt alle aufgezeichneten Striche in allen vier Lesarten nach und fährt sie (`-- --last 5` nur die letzten fünf). Ohne `TC_RECORD=1` (oder mit `TC_NO_RECORD=1`) zeichnet der Server nichts auf.

## Alte Lesart Bühne (`?stage`)

Nur noch für die Spiel-Szenarien und zum Vergleichen im Testmenü. Am Boden ist oben gleich hinten (grüne Tinte): Die Bahn liegt immer genau auf einer der fünf Spuren, ein Wandern in die nächste Spur wird eine weiche S-Kurve, eine Kehre ein runder Halbkreis über mindestens eine Spur; die Spur-Anzeige unten rechts zeigt, wo du gerade bist. Steil hoch ist Höhe (pinke Tinte): eine volle Drehung = Looping, Kehre = Steilkurve in die Nachbarspuren. Der Schluss zur Station kommt erst beim Loslassen (vorher nur eine gestrichelte Linie). Knoten antippen zeigt die 3D-Handles: Quadrat darunter = Tiefe, Ring rechts = Schräglage (ab Freischaltung „Roll“, Doppeltipp: automatisch).

## Lizenzhinweis

Fonts: Fredoka, Nunito und Lobster (OFL; Lobster ist die illudiy-Markenschrift) liegen lokal unter `public/fonts/`; das Spiel lädt nichts von Google Fonts. Das illudiy-Logo liegt unter `public/brand/`. Alles andere eigene Entwicklung für illudiy.
