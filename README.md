# Trauma Coaster

2.5D-Physik-Achterbahnspiel von illudiy: Die Bahn wird mit einem Fingerstrich gezeichnet, ein Zug mit nicht angeschnallten Fahrgästen fährt physikalisch korrekt darüber. 150 Level in 10 Welten, Sandbox „Meine Bahnen“, Figuren-Editor. Handgemalter Look, inspiriert von Rayman Legends.

**Dokumente:** [Gamedesign-Dokument](docs/GDD.md) · [Alle 150 Level](docs/LEVELS.md) · [Technik](docs/TECH.md) · [Recherche](docs/research/)

## Spielen

```
npm install
npm run dev        # http://localhost:5173
```

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

## Entwicklung

```
npm run test         # Vitest: Geometrie, Physik, Fahrgäste
npm run build        # Typecheck + Build nach dist/
npm run preview      # Build ansehen (Port 4173)
npm run levels:doc   # docs/LEVELS.md aus den Level-Daten erzeugen
npm run screenshots  # Playwright-Screenshots (Hoch-, Quer-, Desktop-Format) nach screenshots/
npm run scenario     # Playwright-Szenario: Oval, Steilkurve, Looping, Löschen, Überzeichnen mit Fahrten
```

`?scene=start` überspringt den Splash, `?scene=splash` zeigt ihn immer (im Spiel: Einstellungen → „Intro ansehen“), `?fast=4` beschleunigt die Spielzeit (Tests), Der Knopf **DEV** unten links auf der Karte (oder `VITE_UNLOCK_ALL=1 npm run dev`) schaltet alle Welten, Level, Elemente und Starttypen frei; im Level schaltet dann der Knopf unten links durch alle zehn Bahntypen.

## Stand des Prototyps

Übergabe für die nächste Session: `docs/HANDOVER.md` (Stand, nächste Schritte, Arbeitsweise, Regeln); Plan und Umsetzungsstand je Meilenstein: `docs/PLAN.md`.


Umgesetzt: Splash, Karte als Drehscheibe mit einer Miniatur pro Level (gebaute Bahn samt Zug) und fließendem Übergang ins Level (die Scheibe biegt sich gerade, zurück krümmt sich der Boden wieder), Bühnen-Zeichnen v2 (am Boden ist oben gleich hinten: flache Kurven; steil hoch ist Höhe: Hügel, Loopings über Kreuzungen, Steilkurven über Kehren in der Höhe; Absperrband am offenen Ende), 3D-Bahnmodell mit echter Bewegung in Kurven und Loopings, automatische Überhöhung, 3D-Handles (Tangente, Tiefe, Roll), Überzeichnen, Löschen-Knopf, Start-Chip (Kettenzug/Launch/Hydro/Pendel/Vertikallift), Element-Regal (Booster, Bremse, Splash, Launch-Block), Bergbauer, Zug-Physik mit g-Kräften, Entgleisen, Rückroller und Ausrollen auf ebener Strecke, Rapier-Ragdoll-Fahrgäste mit Rauswurf, Kamera-Fahrt, Ergebnis mit Sternen und Freischaltung, alle 150 Level als Daten mit Zielauswertung, Fortschritt lokal, Meine Bahnen (Speichern/Laden), Figuren-Editor.

## Pinsel-Zeichnen (Spike, Branch `claude/pinsel-spike`)

Drei Arten zu zeichnen zum Vergleich, umgeschaltet mit dem Knopf unten links: **Pinsel → Bühne → 1 Strich**. Die Wahl bleibt gespeichert; `?brush`, `?stage` oder `?single` in der Adresse erzwingen eine. In allen dreien läuft die Tiefe auf dem Bild gerade nach hinten (keine Verkleinerung, kein schräger Boden mehr), am Rand scrollt das Bild beim Zeichnen mit, Zurückziehen radiert.

Pinsel: Die gemalte Linie ist die Bahn. Der Strich hängt an einem Gummiband am Finger (pinker Tropfen): Zittern innerhalb des Bands malt nichts, Ecken werden rund, beim Loslassen holt die Linie zum Finger auf. Nach dem Loslassen wählt die Bahn selbst, was das Bild nicht festlegt: Tiefe je Stelle (steil gezeichnet ist Höhe, flache Wellen dürfen in die Tiefe), nie unter dem Boden, und wo sich Stränge kreuzen oder nahekommen, so weit auseinander, dass der Zug durchpasst (später Gezeichnetes vorne). Danach laufen kurze Probefahrten und bessern an Problemstellen nach (Fliehkraft über die Tiefe weicher, Höhe halten statt kopfüber, Kuppe nach hinten, Linie höchstens 8 px runder). Was dann noch scheitert, liegt am Strich; im DEV-Modus zeigen rote Ringe diese Stellen. Fortsetzen am offenen Ende und Überzeichnen gehen wie gewohnt.

Auf dem Handy zoomt das Zeichnen nicht weiter heraus als etwa 5 mm je Spur; Doppeltipp auf eine freie Stelle wechselt zur Übersicht und zurück.

Strich-Rekorder (nur `npm run dev`): Jeder Strich landet mit Lesart, Zoom und Zeitstempeln in `recordings/strokes.jsonl` (nicht im Repo). `npm run strokes:replay` spielt alle aufgezeichneten Striche in allen drei Lesarten nach und fährt sie (`-- --last 5` nur die letzten fünf). `TC_NO_RECORD=1 npm run dev` zeichnet nichts auf.

## Zeichnen in einem Satz

Am Boden ist oben gleich hinten (grüne Tinte): Die Bahn liegt immer genau auf einer der fünf Spuren, ein Wandern in die nächste Spur wird eine weiche S-Kurve, eine Kehre ein runder Halbkreis über mindestens eine Spur; die Spur-Anzeige unten rechts zeigt, wo du gerade bist. Steil hoch ist Höhe (pinke Tinte): eine volle Drehung = Looping (auch klein gezeichnet, nie plattgezogen), Kehre = Steilkurve in die Nachbarspuren (Radius wächst mit dem Tempo). Landet der Strich flach auf einer Bodenlinie, geht es dort weiter (auch auf einer anderen Spur). Beim Ziehen bleibt die Bahn stabil; der Schluss zur Station kommt erst beim Loslassen (vorher nur eine gestrichelte Linie). Sonst bleibt die Bahn offen, bis du sie zur Station führst (neuer Strich ab dem leuchtenden Ende setzt sie ohne Knick fort). Am offenen Ende steht ein Absperrband: Play fährt trotzdem, und der Zug fliegt dort ab oder kippt über die Kante (Fehlschlag „Absperrung“). Knoten antippen zeigt die 3D-Handles: Quadrat darunter = Tiefe (Spur nachträglich ändern), Ring rechts = Schräglage (ab Freischaltung „Roll“, Doppeltipp: automatisch). Der rote Papierkorb räumt die Bahn weg, der Knopf unten rechts stellt das Fahrttempo (1×, 2×, 3×, 5×).

Noch nicht im Prototyp (im GDD spezifiziert): Vorlagen-Elemente (Helix, Top Hat, Immelmann, Korkenzieher, Cobra Roll), Weiche, Kippschiene, Rückwärts-Weiche, Fallschacht, Audio, echte gemalte Texturen (prozedural ersetzt, Drop-in-Pipeline siehe TECH.md), Capacitor-Builds. Level, die solche Elemente verlangen, sind definiert, aber erst mit diesen Elementen lösbar.

## Lizenzhinweis

Fonts: Fredoka und Nunito über Google Fonts (OFL), Lobster (OFL, illudiy-Markenschrift) lokal unter `public/fonts/`. Das illudiy-Logo liegt unter `public/brand/`. Alles andere eigene Entwicklung für illudiy.
