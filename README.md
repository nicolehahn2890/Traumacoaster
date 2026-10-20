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
```

`?scene=start` überspringt den Splash, `?fast=4` beschleunigt die Spielzeit (Tests), `VITE_UNLOCK_ALL=1 npm run dev` schaltet alle Welten und Elemente frei.

## Stand des Prototyps

Umgesetzt: Splash, Startscreen mit drehbarer Halbkugel, Bühnen-Zeichnen (Kurven über Kehrtwenden, Loopings über Kreuzungen, automatischer Rückweg), Handles, Überzeichnen, Start-Chip (Kettenzug/Launch/Hydro/Pendel/Vertikallift), Spur-Chips, Element-Regal (Booster, Bremse, Splash, Launch-Block), Bergbauer, Zug-Physik mit g-Kräften, Entgleisen, Rückroller, Rapier-Ragdoll-Fahrgäste mit Rauswurf, Kamera-Fahrt, Ergebnis mit Sternen und Freischaltung, alle 150 Level als Daten mit Zielauswertung, Fortschritt lokal, Meine Bahnen (Speichern/Laden), Figuren-Editor.

Noch nicht im Prototyp (im GDD spezifiziert): Vorlagen-Elemente (Helix, Top Hat, Immelmann, Korkenzieher, Cobra Roll), Roll-Handle für Schleifen, Weiche, Kippschiene, Rückwärts-Weiche, Fallschacht, Audio, echte gemalte Texturen (prozedural ersetzt, Drop-in-Pipeline siehe TECH.md), Capacitor-Builds. Level, die solche Elemente verlangen, sind definiert, aber erst mit diesen Elementen lösbar.

## Lizenzhinweis

Fonts: Fredoka und Nunito über Google Fonts (OFL). Alles andere eigene Entwicklung für illudiy.
