# Trauma Coaster – Gamedesign-Dokument

**Version:** 1.0 (Oktober 2026)  
**Produktion:** illudiy  
**Plattformen:** iOS, Android (App Stores), Browser als Fallback (Maus)  
**Genre:** 2.5D-Physik-Puzzle mit Zeichen-Mechanik, Levellogik und Sandbox  
**Begleitdokumente:** [TECH.md](TECH.md) (Architektur), [LEVELS.md](LEVELS.md) (alle 150 Level), [research/](research/) (Recherche)

---

## Inhalt

1. [Überblick](#1-überblick)
2. [Kernschleife](#2-kernschleife)
3. [Herzstück: Bühnen-Zeichnen](#3-herzstück-bühnen-zeichnen)
4. [Bedienkonzept](#4-bedienkonzept)
5. [Spielfluss und Screens](#5-spielfluss-und-screens)
6. [Physikmodell](#6-physikmodell)
7. [Levelziele und Sterne](#7-levelziele-und-sterne)
8. [Element-Katalog](#8-element-katalog)
9. [Die zehn Welten](#9-die-zehn-welten)
10. [Leveldesign-Prinzipien](#10-leveldesign-prinzipien)
11. [Fahrgäste und Figuren-Editor](#11-fahrgäste-und-figuren-editor)
12. [Meine Bahnen](#12-meine-bahnen)
13. [Art Direction](#13-art-direction)
14. [Kamera](#14-kamera)
15. [Audio](#15-audio)
16. [Stores, Monetarisierung, Erweiterbarkeit](#16-stores-monetarisierung-erweiterbarkeit)
17. [Selbstkritik, Risiken, offene Fragen](#17-selbstkritik-risiken-offene-fragen)

---

## 1. Überblick

### Elevator Pitch
Trauma Coaster ist das Achterbahnspiel, bei dem du die Bahn mit einem Fingerstrich malst. Ein Strich, und die Schienen legen sich wie von selbst. Dann fährt ein Zug mit kleinen, nicht angeschnallten Fahrgästen physikalisch korrekt über deine Bahn. Zu schnell in die Kurve: Der Zug entgleist. Zu steiler Hügel: Er rollt zurück. Zu viel Airtime: Ein Fahrgast fliegt raus wie ein Crashtest-Dummy. 150 Level mit Zielen wie Höhe, Loopings, Coins, Tunneln und Kurven, eine Sandbox für eigene Bahnen und ein Editor, mit dem du dich und deine Freunde als Fahrgäste nachbaust. Alles in einem handgemalten, knallbunten 2D-Stil, inspiriert von Rayman Legends.

### Was das Spiel einzigartig macht
1. **Ein Strich ist eine Bahn.** Keine Bausteine, keine Menüs, kein Raster. Zeichnen wie mit dem Bleistift in Illustrator, nachbessern wie mit dem Stift-Werkzeug.
2. **Bühnen-Zeichnen.** Die Welt ist eine Bühne mit Tiefenspuren. Am Boden ist oben gleich hinten (flache Kurven), steil hoch ist Höhe (Hügel, Loopings, Steilkurven). So entstehen echte Achterbahnen mit Tiefe und echter 3D-Bewegung, ohne dass die Ansicht je eine 3D-Kamera braucht.
3. **Echte Physik mit Konsequenzen.** Die Fahrgäste werden nur von der Physik im Wagen gehalten. Das Spiel heißt nicht umsonst Trauma Coaster.
4. **Handillustrierter Look.** Jede Strebe, jede Wolke, jeder Felsen sieht gemalt aus. Bunter und glitzernder als Rayman.

### Zielgruppe
- Primär: 10 bis 35 Jahre, Mobile-Spieler, die Physik-Puzzles (Bad Piggies, Poly Bridge, Happy Glass) und kreative Spiele (Line Rider, Planet Coaster) mögen.
- Sekundär: Achterbahn-Fans, Familien (gemeinsam am Tablet), Kreative, die ihre Bahnen teilen wollen.

### Plattformen und Formate
- Mobile zuerst: Hoch- und Querformat, beides vollwertig. Hochformat ist die Standardhaltung für Startscreen und kurze Level, Querformat für breite Bahnen. Das Spiel wechselt live mit der Geräteausrichtung.
- Browser-Fallback mit Maus: Links ziehen = Finger, Mausrad = Zoom, rechte Maustaste oder Leertaste + ziehen = Pan.
- Mindestauflösung: 360 × 640 logische Pixel. Alle Bedienelemente sind mindestens 48 px groß.

### Session-Design
Ein Level dauert zwei bis acht Minuten. Es gibt keine Energie, keine Timer, keine Wartezeiten. Man kann so lange an einer Bahn arbeiten, wie man will.

---

## 2. Kernschleife

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Anforderung │ →  │   Zeichnen   │ →  │    Fahrt     │ →  │   Ergebnis   │
│  lesen       │    │   + Feilen   │    │   (Physik)   │    │   + Sterne   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       ↑                   ↑                   │                   │
       │                   └── Fehlschlag ─────┘                   │
       └──────────────── Nächstes Level, neues Element ────────────┘
```

1. **Anforderung lesen:** Oben stehen die Ziele als Icons mit Zahl (z. B. „↑ 15 m“, „◎ 1 Looping“, „● 6 Coins“).
2. **Zeichnen und feilen:** Ein Strich legt die Bahn. Handles, Chips und Überzeichnen verfeinern sie. Die Ziel-Icons bekommen live einen Haken, sobald die Bahn geometrisch passt (Höhe, Looping-Anzahl, Kurven). Ziele, die erst die Fahrt entscheidet (Coins, Tempo, Airtime, Ankunft), bleiben offen.
3. **Fahrt:** Play startet den Zug. Die Kamera folgt dynamisch. Fahrgäste reagieren auf jede Kraft. Jederzeit antippen = zurück zum Zeichnen.
4. **Ergebnis:** Sterne (1 bis 3), eingesammelte Coins, Highlights (höchste g, Top-Speed, Airtime), Freischaltung. Weiter oder nochmal.

Die Schleife ist bewusst kurz. Ein Fehlschlag kostet nichts außer einem Tipp auf den Bildschirm, und die Fehlschläge selbst (herausfliegende Fahrgäste, entgleisende Züge) sind die lustigsten Momente des Spiels. Deshalb werden sie inszeniert statt bestraft: Zeitlupe, Kamera-Zoom, Konfetti aus Popcorn.

---

## 3. Herzstück: Bühnen-Zeichnen

### 3.1 Das Problem
Eine Achterbahn braucht Tiefe: Kurven führen nach links und rechts. Trauma Coaster zeigt die Welt aber immer als gemaltes 2D-Bild von der Seite. Aus der Skizze „Ebenen“ im Prompt kommt die Idee: Die Bahn darf sich nach vorne und hinten erstrecken, und der Boden zeigt diese Tiefe als Streifen. Die Frage ist, wie man mit einem einzigen Fingerstrich gleichzeitig Höhe und Tiefe zeichnet, ohne Modus, Regler oder 3D-Kamera.

### 3.2 Die Lösung: Die Bühne
Die Welt ist eine Theaterbühne, die man leicht von oben sieht. Der Boden ist eine geneigte Fläche mit **fünf Spuren** (Tiefenebenen):

```
                        Himmel
   ──────────────────────────────────────────   Spur +2 (ganz hinten, etwas kleiner, hell)
   ───────────────────────────────────────────  Spur +1
   ────────────────────────────────────────────  Spur  0 (Mitte, Standard)
   ─────────────────────────────────────────────  Spur −1
   ──────────────────────────────────────────────  Spur −2 (ganz vorne, groß, satt)
```

- Jede Spur hat eine eigene **Bodenlinie**. Weiter hinten liegt die Bodenlinie höher im Bild (4,2 Bühnen-Meter pro Spur), die Bahn dort ist etwas kleiner (Faktor 0,94 pro Spur, bewusst dezent) und leicht in den Himmel eingefärbt (Luftperspektive). Vorne ist alles größer, satter, mit kräftigeren Konturen.
- In der Welt liegen die Spuren 8,4 m auseinander (das Doppelte der Bild-Anhebung, also eine Schrägsicht von 30°). Die Tiefe ist **kontinuierlich**, aber die Spuren sind **magnetisch**: Tiefen nahe einer Spurlinie (±0,2 Spuren) rasten ein, damit ein Strich entlang einer Bodenlinie trotz Handzittern exakt auf der Spur liegt. Dazwischen bleibt die Tiefe stetig, Diagonalen über die Bühne sind weiter möglich.
- Die Spuren sind als gemalte Terrain-Streifen sichtbar: Wiesenstreifen, Felsbänder, Wasserflächen. Man sieht die Bühne, ohne dass sie technisch wirkt.

### 3.3 Zwei Lesarten, die der Strich selbst wechselt
Der Strich wird in genau zwei Lesarten gelesen. Es gibt keinen Schalter; die Form des Strichs entscheidet, und die Tinte zeigt es sofort (grün = Boden, pink = Höhe).

| Lesart | Wann | Was die Bild-Höhe bedeutet | Was entsteht |
|---|---|---|---|
| **Boden** (grün) | Der Strich läuft über die Bühne: flach, sanft, Bögen, Ovale, S-Kurven | **Tiefe.** Höher im Bild = weiter hinten. | Flache Kurven, die der Wagen mit automatischer Schräglage durchfährt. Kreuzungen sind hier keine Loopings, sondern Überführungen (die Bahn bleibt am Boden). |
| **Höhe** (pink) | Der Strich steigt steil an (im Mittel über 40° auf 4 m) oder verlässt die Bühne oben | **Höhe.** Die Tiefe bleibt eingefroren, wo der Anstieg begann. | Hügel, Drops, Loopings (Selbstkreuzung), Steilkurven (Kehre ohne Kreuzung: Rückweg höher im Bild = nach hinten, tiefer = nach vorne, jeweils eine Spur). Zurück auf den Boden geht es, wenn die Bahn wieder bis auf die Bodenlinie herunterkommt. |

Warum die Steilheit entscheidet: Eine Bodenkehre ist genau dort steil, wo der Strich in x umkehrt (der Scheitel eines Ovals). Ein Hügel ist steil, während der Strich weiter nach vorne läuft. Das System prüft deshalb, ob x in der Umgebung des steilen Stücks umkehrt. Sanfte Steigungen unter 40° sind Bewegungen in die Tiefe. Wer einen Hügel will, zeichnet ihn steil, so wie echte Lifthügel aussehen.

### 3.4 Die Regeln beim Zeichnen

| # | Regel | Was passiert |
|---|---|---|
| 1 | **Start auf dem Boden wählt die Tiefe.** | Wo der Finger aufsetzt, liegt die Station: Bildhöhe über der vordersten Bodenlinie = Tiefe. |
| 2 | **Am Boden ist oben gleich hinten.** | Ein Bogen über die Bühne ist eine flache Kurve. Ein Oval ist eine Runde mit zwei Kurven über drei Spuren. Die Tiefe wird über ±4 m geglättet, damit Handzittern keine Querkräfte erzeugt. Dreht der Strich am Boden in x um (Kehre, Hin- und Rückweg je ≥ 5 m), wird die Kehre als **Halbkreis** geformt: Radius aus den überquerten Spuren (mindestens zwei Spuren, also 8,4 m), die Richtung aus dem Strich. So ist eine gezeichnete Kehre immer eine runde Kurve, nie ein in die Tiefe gestrecktes Oval mit engen Ein- und Ausfahrten. |
| 3 | **Steil hoch ist Höhe.** | Ab 40° Steigung über 4 m (ohne x-Umkehr) liest das System Höhe, rückwirkend ab dem Fuß des Anstiegs. Die Tiefe friert ein. |
| 4 | **In der Höhe: Kreuzung = Looping.** | Kreuzt der Strich sich selbst und die Schleife ist klar gezeichnet (Scheitel mindestens 4,5 m von der Kreuzung, Umfang mindestens 12 m, rund: 4π·Fläche/Umfang² ≥ 0,4), wird sie zum vertikalen Looping in derselben Tiefe. Der Wagen fährt wirklich kopfüber (3D-Rahmen mit Paralleltransport). Kleine oder spitze Schleifen sind Zittern und werden nicht zum Looping. |
| 5 | **In der Höhe: Kehre = Steilkurve.** | Dreht der Strich in x um, ohne sich zu kreuzen (Hin- und Rückweg je ≥ 5 m), entsteht eine überhöhte Kurve: ein Halbkreis in der Horizontalen, dessen Radius aus der gezeichneten Breite folgt (mindestens zwei Spuren = 8,4 m, höchstens vier = 16,8 m) und tempo-bewusst wächst: Aus der Fallhöhe bis zur Kurve wird das Tempo geschätzt und der Radius so gewählt, dass die Querbeschleunigung unter 2,5 g bleibt, soweit die Bühne Platz hat. Rückweg höher im Bild = nach hinten, tiefer = nach vorne. Die Kurve bleibt auf Einfahrtshöhe, der gezeichnete Höhenunterschied wird danach weich abgebaut; die Länge dieses Übergangs wächst mit dem Tempo, damit die Kuppe danach keine Fahrgäste aus dem Sitz hebt. Kleinere Rückwärts-Haken (unter 5 m) sind Zittern und werden entfernt. |
| 6 | **Zurück auf den Boden.** | Kommt die Bahn in der Höhen-Lesart bis auf die Bodenlinie herunter, liest das System wieder Tiefe. Der Übergang ist weich (6 m). |
| 7 | **Offen bleibt offen, Schluss von Hand ist sauber.** | Endet der Strich auf dem Bildschirm nahe der Station (8 m), wird die Runde geschlossen, und zwar elegant: Kommt der Strich in Abfahrtsrichtung an, werden die letzten 14 m weich auf die gerade Einfahrt gelegt (gleiche Spur, Höhe, Richtung). Kommt er gegen die Abfahrtsrichtung hinter der Station vorbei und dreht dort um (Oval, Rundkurs), ersetzt ein Halbkreis mit Mitte auf der Station die gezeichnete Schluss-Kehre (Radius aus den Spuren zwischen Rückweg und Station; liegt der Rückweg nur eine Spur daneben, wird er vorher eine Spur nach außen geführt). Die Hand trifft die Station nie genau; ohne diese Schritte gäbe es am Schluss Schlenker oder S-Kurven. Sonst bleibt die Bahn offen: Das Ende leuchtet, ein neuer Strich ab dem Ende setzt die Bahn fort, bis sie die Station erreicht. Beim Zeichnen wird nie ein Rückweg vorgeschlagen. Erst Play ergänzt für die Fahrt einen automatischen Rückweg (zwei Halbkreis-Kehren über die Nachbarspur, Bremsstrecke) auf einer Kopie; die Zeichnung bleibt, wie sie ist. Der Rückweg zählt für keine Ziele. |
| 8 | **3D-Handles.** | Knoten antippen zeigt die Bezier-Handles (in 3D: Tangente mit Tiefenanteil). Unter dem Knoten sitzt das **Tiefen-Handle** (Quadrat): vertikal ziehen schiebt den Knoten nach hinten oder vorne; so lassen sich Spuren nachträglich ändern, sobald Handles freigeschaltet sind (ab Level 2). Rechts sitzt das **Roll-Handle** (Ring): ziehen setzt die Schräglage von Hand, Doppeltipp schaltet zurück auf automatisch. Schrauben (Rolls) entstehen nur über dieses Handle, nie aus dem Strich; es erscheint mit der Freischaltung „Roll“ (Welt 4). |
| 9 | **Überzeichnen wie der Illustrator-Stift.** | Beginnt und endet ein neuer Strich auf der Bahn (30 px), ersetzt er nur den Abschnitt dazwischen, mit derselben Lesart (Boden/Höhe) und weichen Nahtstellen. Das Strichende blendet auf die Tiefe der Bahn zurück. |
| 10 | **Wegräumen.** | Der rote Papierkorb oben rechts löscht die ganze Bahn (mit Undo). Ein neuer Strich auf freier Fläche ersetzt die Bahn ebenfalls. |

### 3.5 Warum die Mischung funktioniert
- „Boden als Tiefenfläche“ allein ist mehrdeutig: Ein Punkt hoch im Bild kann „hoch“ oder „hinten“ bedeuten. Die Steilheit löst das: Echte Achterbahn-Anstiege sind steil, echte Kurven am Boden sind flach.
- „Gesten-Erkennung“ allein wäre unsichtbar. Die Tinte färbt sich beim Zeichnen (grün/pink), die Vorschau-Bahn klappt sofort perspektivisch in die Tiefe, und die Zielspur ist sichtbar.
- Es gibt nie einen Modus, Regler oder Schalter. Egal wie viele Elemente freigeschaltet sind, der Strich bleibt derselbe.

### 3.6 Live-Feedback beim Zeichnen
1. Der rohe Strich erscheint sofort als leuchtende Linie (Tinte), grün für Boden, pink für Höhe, gelb beim Überzeichnen.
2. Alle 80 ms wird der Strich interpretiert und als Vorschau-Bahn gezeichnet (Schienen, noch ohne Streben).
3. Erkennt das System eine Steilkurve, zieht die Vorschau den Bogen in die Nachbarspur; ein Looping zeigt sich als Schleife mit Scheitelknoten.
4. Beim Loslassen schließen sich die Enden, Streben wachsen aus dem Boden.

### 3.7 Knoten, Handles, Roll-Handle
- Die Bahn wird intern als geschlossener Pfad aus kubischen Bezier-Segmenten in 3D gespeichert. Knoten haben Position (x, Höhe, Tiefe), zwei 3D-Tangenten-Handles und einen Rollwinkel (automatisch oder manuell).
- Handles sind nur am angetippten Knoten sichtbar. Sie sind 14 px groß, haben aber eine Trefferfläche von 44 px.
- Die Schräglage ist standardmäßig automatisch: Der Wagen neigt sich so, dass die gefühlte Kraft (Fliehkraft plus Schwerkraft) durch den Sitz geht, bis 80°. Das Roll-Handle überschreibt das; eine volle Drehung über zwei Knoten erzeugt eine **Schleife** (Heartline-Roll).

### 3.8 Grenzen und Sonderfälle
- Ein Strich, der die Bühne oben verlässt, ist Höhe (Tiefe = hinterste Spur, falls kein Anstieg vorausging).
- Eine Kehre an der hintersten Spur führt nach vorne (und umgekehrt).
- Eine Kehre mit weniger als 10 m Hin- oder Rückweg gilt als Zittern und wird ignoriert.
- Die Welt ist 8,4 m pro Spur tief, das Bild zeigt 4,2 m pro Spur. Damit Bodenkehren nicht als in die Tiefe gestreckte Ovale mit engen Ein- und Ausfahrten entstehen, werden sie wie Steilkurven als Halbkreise geformt (mindestens 8,4 m Radius). Enge Kehren bleiben trotzdem bei hohem Tempo fordernd: 8,4 m Radius bei 60 km/h sind rund 2,7 g, auf Holz nur mit voller Schräglage fahrbar.
- Nach dem Lesen wird die Bahn als 3D-Linie noch einmal weich geglättet (Gauß, 1,5 m). Erst dadurch verschwinden die Knicke, die nicht aus dem Strich kommen, sondern aus dem Lesen: das Anheben auf die Mindesthöhe am Fuß eines Hügels, die Nahtstellen der Kurven, Spurwechsel.
- **Der Bahnplaner im Hintergrund:** Kuppen und Täler werden auf tempo-gerechte Radien gebracht. Aus der Fallhöhe seit dem höchsten Punkt wird das Tempo geschätzt; eine Kuppe bekommt mindestens den Radius, bei dem die Fahrgäste nur leicht aus dem Sitz schweben (etwa −0,4 g), ein Tal den Radius für höchstens 3 g. Die Bahn wird dabei nur angehoben (Schultern an Kuppen, Talsohlen), nie abgesenkt: Hügel behalten ihre Höhe, das Gelände wird überbrückt statt nachgefahren. Oben am Lifthügel, wo der Zug langsam ist, bleibt jede Form erlaubt; Loopings bleiben, wie gezeichnet. Kurven (Halbkreise) liegen immer eben: auf der Einfahrtshöhe, mindestens aber über dem höchsten Gelände unter dem Halbkreis, mit Rampe davor und kurzem ebenen Auslauf danach; eine Kurve über einen Hügel wird also aufgeständert statt den Hügel mitzufahren.
- Die Physik mittelt die Bahnkrümmung über die Wagenlänge (±1,2 m): Ein Wagen mit Radstand spürt keine Spitzen, die kürzer sind als er selbst.

---

## 4. Bedienkonzept

### 4.1 Grundsätze
1. **Ein Finger baut, zwei Finger navigieren.** Nie umgekehrt.
2. **Kein Modus.** Die Fläche weiß aus dem Kontext (leer, Bahn, Knoten, Chip), was gemeint ist.
3. **Alles direkt an der Bahn.** Chips, Handles, Elemente werden auf die Bahn gezogen, nicht in Menüs eingestellt.
4. **Jede Geste hat einen Button-Zwilling.** Undo, Play, Zurück, Zoom-Reset sind immer sichtbar oder per Doppeltipp erreichbar.
5. **Vier Dinge auf dem Bildschirm, nie mehr:** Anforderungen oben, Play unten Mitte, Regal unten rechts, Undo/Zurück oben links.

### 4.2 Gesten-Tabelle

| Geste | Auf leerer Fläche | Auf der Bahn | Auf Knoten/Handle | Auf Chip | Mit Maus |
|---|---|---|---|---|---|
| Tippen | Knoten-Auswahl aufheben | Knoten auswählen (Handles einblenden) | Knoten auswählen | Chip umschalten | Linksklick |
| Ziehen (1 Finger) | Neue Bahn zeichnen (wenn noch keine) oder Überzeichnen (wenn Start auf Bahn) | Abschnitt verschieben | Handle/Knoten ziehen | Spur um mehrere Ebenen ändern | Linke Maustaste ziehen |
| Doppeltipp | Zoom-Reset (ganze Bahn) | Knoten einfügen | Knoten löschen | – | Doppelklick |
| Langdruck | – | Element-Kontext (Booster/Bremse hierher) | Handle unabhängig machen | – | Rechtsklick |
| 2 Finger ziehen | Pan | Pan | Pan | Pan | Rechte Taste ziehen oder Leertaste + ziehen |
| Pinch | Zoom | Zoom | Zoom | Zoom | Mausrad |
| 2-Finger-Tipp | Undo | Undo | Undo | Undo | Strg+Z |
| 3-Finger-Tipp | Redo | Redo | Redo | Redo | Strg+Y |
| Regal → Bahn ziehen | – | Element einsetzen (Booster, Bremse, Splash, Vorlage) | – | – | Ziehen |

### 4.3 Die vier UI-Zonen

```
┌────────────────────────────────────────────┐
│ ‹ ↶      ↑15 m ✓   ◎1   ●4/6   ⟲0/1      │  Anforderungen (Icons + Haken)
│                                            │
│                                            │
│                  Bühne                     │
│                                            │
│                                            │
│                                      ▣ ▣ ▣ │  Regal (nur freigeschaltete Elemente, wischbar)
│                     ▶                      │  Play
└────────────────────────────────────────────┘
```

- **Anforderungen:** Eine Zeile Icons. Haken erscheint, sobald das Ziel erfüllt ist (geometrische Ziele live, Fahrtziele nach der Fahrt). Tippen auf ein Icon zeigt einen Satz Erklärung als Sprechblase.
- **Play:** Großer runder Button. Während der Fahrt wird er zum Stop-Button. Lange drücken startet mit Übersichts-Kamera.
- **Regal:** Horizontal wischbare Leiste, standardmäßig eingeklappt zu einem Button. Zeigt nur, was freigeschaltet und im Level sinnvoll ist. Vorlagen (Helix, Korkenzieher, Immelmann, Cobra Roll, Top Hat) werden auf die Bahn gezogen und ersetzen dort einen Abschnitt, bleiben aber mit Handles editierbar.
- **Oben links:** Zurück und Undo. Undo hat unbegrenzte Historie pro Level.

### 4.4 Start-Chip
An der Station sitzt ein Chip mit dem Start-Typ: Kettenzug (Standard), Launch, Hydro-Launch, Pendel-Launch, Vertikallift. Tippen wechselt durch die freigeschalteten Typen. Beim Kettenzug zieht die Kette den Zug bis zum ersten Scheitel; beim Launch beschleunigt die Station auf dem ersten geraden Stück.

### 4.5 Terrain-Werkzeuge (Bergbauer, See, Wasserfall)
Auch das Terrain wird mit demselben Finger bearbeitet: Ein Strich, der **auf dem Boden beginnt und auf dem Boden endet**, ohne dass eine Bahn gezeichnet wird (weil die Bahn schon existiert), formt den Boden: Nach oben ziehen hebt einen Berg, nach unten senkt ein Tal oder einen See (wenn „See“ freigeschaltet ist, füllt sich die Senke mit Wasser). Damit braucht der Bergbauer kein eigenes Werkzeug. In Leveln, in denen das Terrain fest ist, ist die Funktion aus.

### 4.6 Onboarding
Es gibt keine Tutorial-Texte. Die ersten vier Level zeigen eine animierte Finger-Geste (Geisterhand), die das Gewünschte vormacht, und blenden sich aus, sobald der Spieler beginnt. Neue Elemente stellen sich mit einem 3-Sekunden-Clip im Ergebnis-Screen vor.

---

## 5. Spielfluss und Screens

### 5.1 Splash
illudiy-Logo, zwei Sekunden, handgemalt, mit einem kleinen Zug, der durch das Logo fährt. Danach nie wieder, außer nach App-Neustart.

### 5.2 Startscreen (Karte als Drehscheibe)
- Unten eine große **Drehscheibe**, die gemalte Welt. Jedes der 150 Level steht als **Miniatur seiner Bühne** auf der Scheibe: dieselben fünf Bodenstreifen, Berge, Seen, Deko und Coins wie im Level, darauf die Bahn, die dort gebaut wurde, mit dem Zug in der Station. Ein noch nicht gebautes Level zeigt seine Landschaft.
- Die zehn Welten sind große **Zonen** auf der Scheibe (je 15 Level). Jede Zone beginnt mit einem Tor (Hügel mit dem Wahrzeichen der Welt, Nummer und Name); der Boden geht dort weich in die Farben der nächsten Welt über, der Himmel blendet mit.
- Über jeder Miniatur ein Schild mit Levelnummer und Sternen (Schloss, wenn die Welt noch zu ist). Oben stehen Welt und Level der Miniatur in der Mitte.
- Ziehen nach links oder rechts dreht die Scheibe; der Schwung läuft über eine gedämpfte Feder ins Einrasten auf dem nächsten Level aus. Pfeiltasten springen ein Level weiter.
- Die Miniaturen haben je einen eigenen Maßstab, damit breite und hohe Bahnen genauso in den Blick passen wie kleine; die Bodenstreifen dazwischen wechseln die Breite weich.
- Über dem Boden ziehen **Wolken** in drei Parallaxe-Ebenen mit, langsamer als die Scheibe.
- Unten der Button **Spielen** (öffnet das Level in der Mitte; quer unten rechts), oben rechts **Meine Bahnen**. Einstellungen liegen hinter einem kleinen Zahnrad oben links, daneben der Figuren-Editor.
- Tippen auf die Miniatur in der Mitte öffnet das Level, Tippen auf einen Nachbarn dreht ihn in die Mitte, Tippen auf ein Tor springt an den Anfang der Welt.

### 5.3 Level-Screen
Beim Öffnen biegt sich die gekrümmte Scheibe gerade und wird zum Bühnenboden des Levels: Die Miniatur wächst auf die Größe des Levels, die Krümmung geht auf null, Himmel und Knöpfe blenden über (1,5 s, ohne Schnitt). Zurück zur Karte krümmt sich der Boden wieder zur Drehscheibe, mit der gerade gebauten Bahn als Miniatur. Technisch ist beides derselbe Boden mit anderer Krümmung (siehe TECH.md). Oben erscheinen die Anforderungen. Die Geisterhand zeigt bei Bedarf die Geste.

### 5.4 Fahrt
Play startet den Zug. UI blendet sich aus bis auf Stop und die Anforderungen (die während der Fahrt abgehakt werden). Kamera siehe Kapitel 14. Nach der Ankunft oder dem Unfall: 1,5 Sekunden Nachlauf (Fahrgäste jubeln oder liegen im Gras), dann Ergebnis.

### 5.5 Ergebnis
Karte mit Sternen (animiert nacheinander), Zielen mit Haken oder Kreuz, Highlights (Top-Speed, max. g, Airtime, Coins), Freischaltung mit Clip. Buttons: Nochmal, Weiter, Teilen (Screenshot der Bahn mit Kurzlink, später). Bei Fehlschlag: Ein Satz, was schiefging („Mia ist bei 2,1 g Airtime rausgeflogen“), mit Zeitlupen-Clip.

### 5.6 Meine Bahnen
Siehe Kapitel 12.

### 5.7 Figuren-Editor
Siehe Kapitel 11.

---

## 6. Physikmodell

### 6.1 Zug auf der Schiene
Der Zug ist ein Punktmassen-Modell entlang der Bogenlänge s der Bahn:

- Geschwindigkeit: dv/dt = −g · sin(α) − μ · g · cos(α) − k · v², mit Steigungswinkel α, Rollreibung μ = 0,012 (Holz 0,015, Stahl 0,010, Eis 0,004) und Luftwiderstand k = 0,0008 pro Meter.
- Mehrere Wagen: Jeder Wagen hat eigene Position s_i = s − i · Wagenlänge; die Gesamtkraft ist die Summe, so dass ein langer Zug über einen Hügel „gezogen“ wird (Zugmitte zählt).
- Station: Der Zug bekommt nur einen kleinen Schubs (1,6 m/s). Auf ebener Strecke rollt er ein paar Meter aus und bleibt stehen (Fahrt nicht geschafft).
- Kettenzug: Nur an einem Anstieg, der innerhalb von 30 m nach der Station beginnt, gilt v = max(v, 4 m/s) bis zum ersten Scheitel. Ohne Anstieg gibt es keinen Kettenzug.
- Launch: Auf dem ersten Abschnitt bis 25 m Länge gilt a = +12 m/s² (Hydro: +25 m/s², Pendel: dreimal durch die Station mit wachsender Kraft).
- Booster: 10 m langes Element, a = +8 m/s². Bremse: 8 m, bremst auf maximal 4 m/s.
- Stall: Wird v auf einem Anstieg null, rollt der Zug zurück (v wird negativ, Fahrt gilt als nicht geschafft, Kamera zeigt den Rückroller).

### 6.2 g-Kräfte aus 3D-Krümmung
Die Bahn ist eine echte 3D-Kurve (x, Höhe y, Tiefe z). Aus den Bezier-Segmenten kommen Tangente und Krümmungsvektor analytisch. Der Wagen hat einen 3D-Rahmen (vorwärts, oben, seitlich): Der Oben-Vektor wird per Paralleltransport entlang der Bahn geführt und auf waagerechter Strecke zur Welt-Senkrechten zurückgezogen, so dass der Wagen nach Loopings und Kurven wieder aufrecht steht und im Looping wirklich kopfüber hängt.
- Gefühlte Beschleunigung im Wagen: f = v² · κ⃗ + g (Fliehkraft zum Krümmungsmittelpunkt plus Schwerkraft), zerlegt in Sitzrichtung (g_v, negativ = Airtime), Fahrtrichtung und Seite (g_s).
- Automatische Überhöhung: Der Wagen neigt sich so, dass f durch den Sitz geht (keine Querkraft), bis 80°. Erst sehr enge Kurven bei hohem Tempo lassen Querkraft übrig. Das Roll-Handle setzt die Neigung von Hand.
- Der Mindestradius für die Kraftberechnung ist 2,5 m, damit Handzittern keine unendlichen Kräfte erzeugt. Über 7 g gibt es einen Blackout (kein dritter Stern).

### 6.3 Entgleisen und Scheitern
| Ereignis | Bedingung | Folge |
|---|---|---|
| Entgleisen in der Kurve | g_s > Limit (Holz 2,5 g, Hybrid 3 g, Stahl 3,5 g, Eis 3 g) | Zug fliegt tangential weg, Fahrgäste purzeln, Fahrt nicht geschafft |
| Aus dem Looping fallen | Oben im Looping v² < 9,81 · r | Zug löst sich, Fahrgäste fallen, Fahrt nicht geschafft |
| Rückroller | v = 0 auf Anstieg | Zug rollt zurück zur Station, Fahrt nicht geschafft |
| Rauswurf | Fahrgast verlässt die Wanne (echte Physik) | Fahrt nicht geschafft, Fahrgast landet mit Ragdoll |
| Überlast | g_v > 6 g | Fahrgäste werden ohnmächtig (Augen zu, Zunge raus), Fahrt gilt, aber kein Stern 3 |
| Wasser ohne Splash-Element | Bahn taucht ins Wasser | Zug bremst hart, Fontäne, Fahrt meist nicht geschafft |

### 6.4 Fahrgäste (echte Physik)
- Jeder Fahrgast ist ein Ragdoll aus Rumpf (mit Unterkopf), Oberkopf, zwei Armen, zwei Beinen, verbunden über Gelenke mit Grenzen.
- Der Wagen ist eine **offene Wanne**: Boden, Rückenlehne, Vorderwand, Sitzfläche. Keine Bügel, keine Gurte. Die Wanne wird kinematisch entlang der Bahn geführt; die Fahrgäste sind dynamische Körper in der Wanne.
- Vertikale Kräfte wirken real: Bei negativer g hebt der Körper ab, bei starker Airtime verlässt er die Wanne. Kopfüber im Looping werden sie vom Sitz- und Lehnenkontakt gehalten, solange die Zentripetalkraft reicht.
- Seitliche Kräfte (Kurven) wirken als Neigung: Der Ragdoll bekommt eine seitliche Scheinkraft proportional zu g_s, die ihn Richtung Kamera oder von ihr weg drückt. Ab 2,5 g seitlich kippt er über die Wannenkante (als „Rauswurf nach vorne/hinten“ inszeniert mit Größenänderung).
- Die Fahrgäste reagieren sichtbar: Pupillen gehen in Fahrtrichtung der Kraft, Blinzeln bei Schreck, Mund auf ab 3 g, Haare und Kleidung flattern mit dem Fahrtwind.

### 6.5 Welt-Abweichungen
- Eisgipfel: Reibung × 0,4. Der Zug wird deutlich schneller, Bremsen werden wichtiger.
- Weltraum: Schwerkraft × 0,6. Höhere Bahnen, viel Airtime, Launches wirken stärker.

### 6.6 Simulationstakt
Fixer Zeitschritt 1/120 s für den Zug, Rapier-Physik der Fahrgäste mit 1/60 s und zwei Substeps. Rendering mit variabler Framerate, Interpolation zwischen Schritten.

---

## 7. Levelziele und Sterne

### 7.1 Zieltypen
Alle Zieltypen, die das Spiel auswertet (Quelle: `src/levels/types.ts`):

| Typ | Icon | Messung |
|---|---|---|
| Ankunft | ✓ | Zug kommt in der Station an, niemand fliegt raus (immer Pflicht) |
| Höhe | ↑ | Höchster Punkt der Bahn über dem Boden der Spur |
| Coins | ● | Zug fährt durch den Coin (Radius 2 m) |
| Loopings | ◎ | Anzahl Selbstkreuzungen |
| Kurven | ↻ | Anzahl Spurwechsel |
| Tunnel | ◠ | Anzahl Durchfahrten durch Berg-Terrain |
| Launch / Kettenzug | ⚡ / ⛓ | Start-Typ benutzt |
| Booster | » | Anzahl Booster auf der Bahn |
| Airtime | ☁ | Summe der Sekunden mit g_v < 0 |
| Tempo | ⏱ | Höchstgeschwindigkeit in km/h |
| Strecke ≥ / ≤ | ⟷ | Bogenlänge der Bahn |
| Fahrzeit ≥ / ≤ | ◷ | Sekunden von Start bis Ankunft |
| Schleifen | ∞ | Volle Rollen um die Fahrtrichtung |
| max. g / min. g | ⬇ | Komfort- bzw. Intensitätsziel |
| Splash | ≈ | Splash-Elemente durchfahren |
| Spuren | ≡ | Anzahl verschiedener Spuren, die befahren werden |
| Ohne Bremse | ⊘ | Keine Bremse eingesetzt |
| Drop | ⤓ | Größter zusammenhängender Höhenverlust |
| Element | ▣ | Ein bestimmtes Element (Vorlage, Weiche, Fallschacht) n-mal eingebaut |

### 7.2 Sterne
- ★ Alle Pflichtziele erfüllt und Ankunft.
- ★★ Zusätzlich alle Bonusziele (kursiv in der Leveltabelle) oder, wenn es keine gibt: alle Coins.
- ★★★ Zusätzlich „saubere Fahrt“: niemand ohnmächtig (g_v ≤ 6), keine Bremse nötig, Fahrt unter dem Richtwert für die Zeit.
Sterne schalten nichts Hartes frei, sie sind Prestige und Schmuck auf der Karte (goldene Sterne auf dem Schild über der Miniatur).

### 7.3 Freischalten
Jedes dritte bis vierte Level schaltet ein Element frei (siehe LEVELS.md, „Freischalt-Reihenfolge“). Neue Elemente werden sofort im nächsten Level gebraucht, damit sie nicht im Regal verstauben. Es gibt 50 freischaltbare Elemente plus die Grundausstattung.

---

## 8. Element-Katalog

Die Pflichtliste aus dem Prompt ist vollständig enthalten (Looping, Schleife, Tunnel, Launch-Start, Schienendesigns mit Streben, Bergbau, Terrains, Gebäude, Wasserfälle und See, Mehrfach-Launch/Kettenzug). Darüber hinaus die Elemente aus der Achterbahn-Recherche, die sich für Levelziele eignen.

### 8.1 Bahn-Elemente (entstehen aus dem Strich)
| Element | Entsteht durch | Levelziel |
|---|---|---|
| Hügel / Drop | Strich auf und ab | Höhe, Drop, Tempo |
| Airtime-Hügel / Bunny Hops | Kleine, schnelle Hügel | Airtime |
| Kurve (Spurwechsel) | Kehrtwende | Kurven, Spuren |
| Looping | Selbstkreuzung | Loopings |
| Schleife (Heartline-Roll) | Roll-Handle | Schleifen |
| Tunnel | Bahn durch Berg | Tunnel |
| S-Kurve / Slalom | Zwei Kehrtwenden in Gegenrichtung | Kurven |
| Helix | Mehrere Kehrtwenden in gleicher Richtung (oder Vorlage) | Kurven, Spuren |

### 8.2 Vorlagen (aus dem Regal auf die Bahn ziehen, bleiben editierbar)
| Vorlage | Aufbau | Freischaltung |
|---|---|---|
| Helix | 4 bis 6 Kurven übereinander | Minenberg |
| Top Hat | Senkrecht hoch, enge Kuppe, senkrecht runter | Schlossreich |
| Immelmann | Halber Looping, halbe Schleife, Kurve | Schlossreich |
| Korkenzieher | Looping mit eingebauter Schleife | Großstadt |
| Cobra Roll | Zwei halbe Loopings, zwei halbe Schleifen, Rückkehr | Eisgipfel |

### 8.3 Antrieb und Sondertechnik
| Element | Wirkung | Freischaltung |
|---|---|---|
| Kettenzug | Zieht den Zug den ersten Anstieg hoch | Start |
| Launch-Start | Beschleunigt auf dem ersten geraden Stück | Jahrmarkt |
| Booster | Beschleunigt mitten auf der Strecke | Jahrmarkt |
| Bremse | Verlangsamt, verhindert Entgleisen | Wiesenland |
| Doppel-Launch | Zweiter Launch-Block mitten in der Bahn | Schlossreich |
| Vertikallift | Senkrechter Lift | Minenberg |
| Fallschacht | Schienenstück fällt senkrecht nach unten | Minenberg |
| Weiche | Zug wechselt die Spur ohne Kurve (Switch Track) | Eisgipfel |
| Kippschiene | Schiene kippt vor dem Drop (Tilt) | Eisgipfel |
| Rückwärts-Weiche | Zug fährt ein Stück zurück (Boomerang) | Geisterhaus |
| Pendel-Launch | Mehrfaches Durchschwingen der Station | Geisterhaus |
| Hydro-Launch | Stärkster Launch | Vulkaninsel |
| Splashdown | Flossen tauchen ins Wasser, Fontäne, leichte Bremsung | Seenland |
| Zweiter Zug / Langer Zug | Mehr Wagen, Blockbremsen-Logik | Seenland / Jahrmarkt |

### 8.4 Terrain
| Element | Bedienung | Freischaltung |
|---|---|---|
| Hügel, Tal | Boden-Strich nach oben/unten | Start |
| Bergbauer | Boden-Strich mit größerer Höhe, tunnelfähig | Minenberg |
| Tunnelbauer | Bahn durch Berg = Tunnel mit Portal | Minenberg |
| See | Senke füllt sich mit Wasser | Seenland |
| Fluss | Breite Wasserbahn über alle Spuren | Seenland |
| Wasserfall | Wasser stürzt von einer Klippe | Seenland |
| Holzbrücke | Automatische Stützen über Wasser | Seenland |
| Klippe | Terrain-Vorgabe | Minenberg |

### 8.5 Schienen-Stile (Skins) mit eigenen Streben
| Skin | Schiene | Streben | Besonderheit |
|---|---|---|---|
| Holzbahn | Flache Holzschiene mit Stahlband | Dichtes Holzfachwerk, Kreuzstreben | Knarzt, geringere g-Toleranz |
| Hybridbahn | Stahlschiene auf Holzgerüst | Holzfachwerk mit Stahlknoten, Glühbirnen | Jahrmarkt-Lichter |
| Minenzug | Niedrige Stahlschiene, Holzschwellen | Holzböcke, Laternen | Staubpartikel |
| Stahlbahn | Rohrschiene, türkis/weiß | Schlanke Stahlstützen, Rohre | Höchste g-Toleranz |
| Goldbahn | Goldene Rohrschiene | Ornamentstützen | Glitzer-Partikel |
| Neonbahn | Schwarze Schiene mit Leuchtkante | Dünne Stützen mit Neonstreifen | Leuchtet im Nachtmodus |
| Eisbahn | Eisblaue Schiene mit Frost | Eiskristall-Stützen | Reibung niedrig |
| Geisterbahn | Rostige Schiene, Spinnweben | Krumme Holzstützen, Laternen | Nebel |
| Lavabahn | Schwarze Schiene mit Glut | Glühende Streben | Funken |
| Space-Bahn | Weiße Schiene mit Blaulicht | Schwebende Magnetstützen | Keine Bodenverbindung |

### 8.6 Deko (Themeelemente)
Häuser (Wiesenland), Riesenrad und Buden (Jahrmarkt), Förderturm und Loren (Minenberg), Stege und Boote (Seenland), Schloss (Schlossreich), Hochhäuser, Parkhaus, Leuchtreklame (Großstadt), Iglus und Eiszapfen (Eisgipfel), Spukvilla, Friedhof, Kürbisse (Geisterhaus), Lavafelsen und Palmen (Vulkaninsel), Raumstation, Satelliten (Weltraum). Deko ist Hintergrund auf Spur +2 oder Vordergrund auf Spur −2 und kollidiert nie mit der Bahn, mit einer Ausnahme: Gebäude mit „Tunnelfunktion“ (Spukvilla, Schloss, Raumstation) zählen als Berg.

### 8.7 Extras
Nachtmodus (Lichter, Laternen, Coins leuchten), Feuerwerk (bei 3 Sternen), zweiter Zug, langer Zug.

---

## 9. Die zehn Welten

| # | Welt | Neue Mechanik | Finale |
|---|---|---|---|
| 1 | Wiesenland | Zeichnen, Handles, Coins, Kurve, Looping, Bremse | Großes Wiesenfest |
| 2 | Jahrmarkt | Launch, Booster, langer Zug, Nachtmodus, Hybridbahn | Die große Kirmesbahn |
| 3 | Minenberg | Tunnel, Bergbauer, Helix, Vertikallift, Fallschacht, Minenzug | Der große Durchbruch |
| 4 | Seenland | See, Brücke, Wasserfall, Splash, Stahlbahn, zweiter Zug | Seenland-Finale |
| 5 | Schlossreich | Top Hat, Schleife (Roll-Handle), Doppel-Launch, Immelmann, Goldbahn | Schloss-Finale |
| 6 | Großstadt | Mehrfach-Launch, Korkenzieher, Neonbahn, Budget-Level | Großstadt-Finale |
| 7 | Eisgipfel | Wenig Reibung, Cobra Roll, Weiche, Kippschiene, Eisbahn | Eisgipfel-Finale |
| 8 | Geisterhaus | Dark Ride, Rückwärts-Weiche, Pendel-Launch, Geisterbahn | Geisterhaus-Finale |
| 9 | Vulkaninsel | Hydro-Launch, hohe g, Zeitdruck, Lavabahn | Vulkan-Finale |
| 10 | Weltraum | Geringe Schwerkraft, alle Elemente, Space-Bahn | Trauma Coaster |

Jede Welt hat eine eigene Palette, einen eigenen Himmel, eigene Wolkenformen, eigene Streben und eigene Deko. Die Details stehen in `src/levels/worlds.ts` und in LEVELS.md.

---

## 10. Leveldesign-Prinzipien

1. **Ein neues Ding pro Level.** Jedes Level hat höchstens eine neue Anforderung oder ein neues Element. Alles andere ist bekannt.
2. **Rhythmus 15:** Pro Welt: 2 Lern-Level, 9 Kombinations-Level, 2 Sonder-Level (Budget, Komfort, Zeit), 1 Vorbereitung, 1 Finale.
3. **Ziele sind Zahlen, die man sieht.** Höhe, Loopings, Kurven werden beim Zeichnen live abgehakt. Fahrtziele sind nach der Fahrt sofort erklärbar.
4. **Terrain ist Anlass, nicht Hindernis.** Ein Tal lädt zum Drop ein, ein Berg zum Tunnel, ein See zum Splash.
5. **Breite wächst mit dem Können:** 60 m in Level 1 bis 340 m im Finale. Die Kamera zoomt automatisch passend.
6. **Schwierigkeitskurve:** Siehe Tabelle in LEVELS.md. Höhe 10 → 130 m, Tempo 50 → 230 km/h, Loopings 1 → 6, Kurven 1 → 8, Tunnel 1 → 4, Coins 5 → 50, Airtime 1 → 8 s.
7. **Finale = alles, was die Welt gelehrt hat.** Finale-Level haben mehr Wagen und mehr Fahrgäste.
8. **Nach 150 ist nicht Schluss.** Das Format erlaubt Level-Packs (15 Level = 1 Welt) ohne Codeänderung: Level sind Daten.

---

## 11. Fahrgäste und Figuren-Editor

### 11.1 Rig (nach dem Entwurf)
Die Figuren folgen dem Entwurf aus dem Prompt: große, leicht schiefe Köpfe, riesige Augen, kleine Körper, gemalte Schattierung.

```
         ┌────────────┐
         │  Oberkopf  │  ← Haare, Augen (Pupillen animiert), Augenbrauen, Brille, Cap
         ├─ Oberlippe ┤  ← Schnittkante; Oberkopf „steckt“ im Unterteil
         │ Unterkopf  │  ← Mund, Kinn, Bart
         │ + Rumpf    │  ← Shirt/Jacke mit Logo, Hals
    ┌────┤            ├────┐
    │Arm │            │Arm │ ← Arme stecken im Rumpf (Gelenk an der Schulter)
    └────┤            ├────┘
         ├────┬───────┤
         │Bein│  Bein │  ← Beine stecken im Rumpf (Gelenk an der Hüfte)
         └────┴───────┘
```

- **Teile:** Oberkopf, Unterkopf-mit-Rumpf, linker Arm, rechter Arm, linkes Bein, rechtes Bein. Sechs Teile, fünf Gelenke. Oberkopf-Gelenk sitzt an der Oberlippe (Nick-Bewegung ±20°, so dass der Mund beim Schreien aufgeht).
- **Animation:** Pupillen bewegen sich entgegen der Beschleunigung (bei Airtime nach oben, im Looping zur Mitte). Blinzeln alle 2 bis 6 Sekunden, Schreck-Blinzeln bei plötzlicher Kraft. Mund öffnet sich proportional zu |g|. Haare und Kleidung flattern mit Fahrtwind (einfache Verlet-Ketten).
- **Physik:** Jedes Teil ist ein Rapier-Körper (Kapsel), die Gelenke sind Revolute-Joints mit Limits. Die Wanne hält sie. Siehe 6.4.

### 11.2 Figuren-Editor
Ziel: Jeder soll sich und seine Freunde in zwei Minuten nachbauen.

- **Auswahl statt Zeichnen:** Pro Teil eine wischbare Reihe von gemalten Varianten: Kopfform (5), Haut (8 Töne), Haare (14 Frisuren), Haarfarbe (10), Augen (6), Augenbrauen (5), Brille (6 inkl. keine), Bart (6), Mund (5), Kopfbedeckung (8 inkl. keine), Oberteil (12) mit Farbe, Logo (10 inkl. eigenes Bild), Hose (6), Schuhe (8).
- **Farben** über eine gemalte Palette, keine Hex-Eingabe.
- **Vorschau** lebt: Die Figur blinzelt, schaut dem Finger nach, winkt beim Speichern.
- **Eigenes Logo:** Foto aus der Galerie wird auf das Shirt gelegt (wie beim „BSW“-Shirt im Entwurf).
- **Speichern:** Figuren werden lokal gespeichert (später Cloud). Bis zu 16 Figuren. Man wählt, wer mitfährt; die Reihenfolge füllt die Wagen.
- **Erreichbar** über das Zahnrad und direkt vom Ergebnis-Screen („Wer fährt mit?“).

---

## 12. Meine Bahnen

- **Sandbox:** Ein Level ohne Ziele, mit allen freigeschalteten Elementen, Skins, Terrains und Deko. Breite frei bis 500 m. Terrain frei formbar.
- **Wächst mit:** Jede freigeschaltete Welt bringt ihren Himmel, ihre Deko und ihren Skin als Auswahl in die Sandbox. So ist „Meine Bahnen“ am Anfang klein (Wiese, Holz) und am Ende riesig.
- **Speichern/Laden:** Bahnen werden als kompakte JSON (Knoten, Spuren, Elemente, Terrain) lokal gespeichert, mit Vorschaubild. Bis zu 50 Bahnen.
- **Statistik:** Nach jeder Fahrt: Länge, Höhe, Top-Speed, max. g, Airtime, Inversionen, „Spaß-Wert“ (Formel aus Airtime + Inversionen − Übelkeit, angelehnt an RCT).
- **Teilen (später):** Export als Link (JSON komprimiert in der URL) und als Video-Clip der Fahrt.

---

## 13. Art Direction

### 13.1 Leitbild
Handgemalt, bunt, glitzernd. Die Referenz ist Rayman Legends (gemalte Texturen, weiche Verläufe, satte Farben, dicke Konturen mit variabler Linienbreite), aber heller, bunter und mit mehr Glitzer: Lichtpunkte auf Schienen, Sternchen in Coins, Lichtstrahlen durch Wolken.

### 13.2 Regeln
1. **Keine geraden Linien.** Jede Kontur hat ein leichtes Wackeln (Noise auf der Linie), jede Fläche eine Pinselstruktur.
2. **Drei Werte pro Fläche:** Licht, Mittelton, Schatten, als weiche gemalte Verläufe, nie als harte Cel-Shading-Kanten.
3. **Licht von oben links**, Sonne oder Mond als sichtbare Lichtquelle, farbiges Rim-Light am Rand (Rosa bei Sonnenuntergang, Cyan in der Stadt).
4. **Tiefe durch Spuren:** Spur −2 satt und kontrastreich, Spur +2 hell und entsättigt (Luftperspektive), dazwischen linear.
5. **Konturen** in dunkler Farbe des jeweiligen Tons (nicht schwarz), 3 bis 6 px, dicker vorne, dünner hinten.
6. **Glitzer** nur auf Interaktivem: Coins, Handles, Chips, Zielmarker. Nie auf Terrain.
7. **Papierkorn** als ganz leichte Textur über dem ganzen Bild (Multiply, 4 %).

### 13.3 Farbwelten
Siehe `src/levels/worlds.ts`: Jede Welt hat einen dreistufigen Himmelsverlauf und zwei Bodenfarben. Die UI nimmt die Akzentfarbe der Welt (Pink in Welt 1 und 2, Gold in 5, Cyan in 6). Grundakzent des Spiels: Pink `#ff5c8a`, Tinte `#1b2a4a`, Papier `#fff8ec`.

### 13.4 Schriften
Überschriften: eine runde, handgeschriebene Display-Schrift (Lizenz: Google Fonts „Fredoka“ oder „Baloo 2“). Text und Zahlen: „Nunito“. Alle Zahlen in UI-Elementen mindestens 18 px.

### 13.5 Asset-Pipeline
Der Prototyp erzeugt Texturen prozedural (Pinselstriche, Noise, Verläufe) und mit SVG-Illustrationen, damit der Look schon stimmt. Jede prozedurale Textur hat einen Dateinamen im Manifest (`src/assets/manifest.ts`). Liegt unter `public/art/<name>.png` eine echte gemalte Textur, wird sie automatisch statt der prozeduralen genommen. Prompt-Vorlagen für die Bildgenerierung stehen in TECH.md. So kann illudiy die Grafik Schritt für Schritt durch echte Malerei ersetzen, ohne Code anzufassen.

### 13.6 Asset-Liste (für die Malerei)
Himmel (10 Welten × Tag/Nacht), Wolken (6 Formen × 3 Tiefen), Bodenstreifen (10 Welten × 5 Spuren), Berge (3 Formen × 10 Welten), Wasser (Oberfläche, Gischt, Wasserfall), Schienen (10 Skins: Schiene, Schwelle, Strebe, Stütze, Knoten), Zug (10 Skins × Wagen vorne/mitte/hinten), Figurenteile (siehe 11.2), Coins, Chips, Handles, Buttons, Deko (ca. 40 Props), Effekte (Funken, Staub, Glitzer, Konfetti, Fontäne), Splash-Logo illudiy, Halbkugel-Welt mit 10 Inseln.

---

## 14. Kamera

- **Zeichnen:** Freie Kamera, Pinch-Zoom 0,5× bis 3×, Pan mit zwei Fingern. Doppeltipp auf leere Fläche: Ganze Bahn ins Bild.
- **Fahrtbeginn:** 1,2 Sekunden Übersichtsflug über die ganze Bahn (von der Station zum höchsten Punkt und zurück), dann Schnitt auf den Zug.
- **Fahrt:** Die Kamera folgt dem Zug mit Vorhalt in Fahrtrichtung (0,6 s Vorhalt). Zoom hängt vom Tempo ab: langsam = nah (1,8×), schnell = weit (0,9×). Vor Loopings und Drops zoomt die Kamera kurz raus, um die Figur ganz zu zeigen; im Looping dreht sie 8° mit.
- **Höhepunkte:** Beim höchsten Punkt und beim ersten Looping ein kurzer Zeitlupen-Moment (0,4 s bei 50 %), Kamera fährt heran.
- **Unfall:** Zeitlupe 1,5 s, Kamera auf den Fahrgast, der fliegt. Dann Schnitt.
- **Ankunft:** Kamera zieht zurück auf die ganze Bahn, Konfetti.
- **Hoch- und Querformat:** Im Hochformat ist der Vorhalt kleiner und der Zoom näher; die Anforderungsleiste bricht in zwei Zeilen um.

---

## 15. Audio

- **Musik:** Pro Welt ein Loop (Ukulele und Glockenspiel in der Wiese, Drehorgel im Jahrmarkt, Banjo in der Mine, Synthwave in der Stadt, Theremin im Geisterhaus, Synth-Pads im Weltraum). Während der Fahrt tempoabhängig (Tempo der Musik folgt v).
- **Sound:** Stift-Kratzen beim Zeichnen (Tonhöhe folgt der Geschwindigkeit des Fingers), „Klack“ beim Setzen eines Knotens, Holz-Knarzen beim Wachsen der Streben, Kettenzug-Klackern, Launch-Zischen, Fahrtwind, Schreie der Fahrgäste (lustig, nicht gruselig), Coin-Pling, Splash, Fanfare bei Sternen.
- **Haptik:** Kurzer Impuls bei Kehrtwende-Erkennung, Looping-Snap, Coin, Rauswurf.
- Alles abschaltbar, Musik und Effekte getrennt.

---

## 16. Stores, Monetarisierung, Erweiterbarkeit

- **Modell (Vorschlag):** Premium-App ohne Werbung im Spiel. Die ersten 30 Level (zwei Welten) sind kostenlos spielbar, der Rest wird einmalig freigekauft. Kosmetik-Packs (Skins, Figurenteile) als optionale Käufe. Keine Energie, keine Lootboxen, keine Zeit-Timer. Das passt zu einem Spiel, dessen Wert im Bauen liegt.
- **Stores:** Capacitor-Wrapper (siehe TECH.md). Spielstand lokal, später iCloud/Google-Sync.
- **Erweiterbarkeit:** Level sind Daten. Eine neue Welt ist ein neuer Eintrag in `worlds.ts`, 15 Level in `levels.ts`, eine Palette und Deko. Geplante Erweiterungen: Welt 11 „Unterwasser“, Welt 12 „Dschungel“, Community-Bahnen (Teilen per Link), wöchentliche Herausforderung (gleiche Bahn, Bestzeit), Mehrspieler „Duell“ (zwei Züge, wer zuerst ankommt).

---

## 17. Selbstkritik, Risiken, offene Fragen

### 17.1 Was gut ist
- Bühnen-Zeichnen löst das Tiefenproblem ohne Modus und ist erklärbar in einem Satz: „Am Boden ist oben gleich hinten, steil hoch ist Höhe.“
- Alle Pflichtelemente aus dem Prompt sind drin und haben ein Levelziel.
- Die Level sind Daten, also erweiterbar und testbar.
- Die Fahrgast-Physik ist echt, nicht gescriptet. Das ist der Humor des Spiels.

### 17.2 Risiken
| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| Boden/Höhe-Lesart fühlt sich unvorhersehbar an (sanfter Hügel wird Tiefe) | mittel | Schwellwerte (40° über 4 m) mit Spielern testen; Tinte färbt sich live; Tiefen-Handle korrigiert jeden Knoten |
| Fahrgäste nur in der Wagen-Ebene simuliert (seitliche Kraft als Lehnen/Kippen) | mittel | Für den Prototyp ausreichend; bei Bedarf Fahrgäste in 3D rechnen (Rapier3D) oder Godot-Wechsel (siehe TECH.md) |
| Handgemalter Look nur prozedural | hoch im Prototyp | Drop-in-Pipeline für echte Texturen, Prompt-Vorlagen, klare Asset-Liste |
| Performance auf alten Handys (Rapier + Pixi + viele Partikel) | mittel | Fahrgast-Zahl pro Level begrenzen (max. 16), Partikel-Budget, WebGL-Fallback |
| 150 Level balancieren | hoch | Automatischer Lösbarkeits-Test: Für jedes Level eine Referenzbahn hinterlegen, die im Test gefahren wird |
| Hochformat bei breiten Bahnen | mittel | Automatischer Zoom, zweizeilige Anforderungen, Kamera-Vorhalt kleiner |

### 17.3 Offene Fragen an illudiy
1. Soll der Name „Trauma Coaster“ auch in den Stores so heißen (Alterseinstufung, Humor)?
2. Gewünschte Musikrichtung je Welt, oder generische Loops?
3. Sollen Fahrgäste beim Rauswurf verletzt aussehen (Pflaster) oder immer unversehrt (Family-Rating)? Empfehlung: unversehrt, mit Sternchen um den Kopf.
4. Community-Features (Teilen) in Version 1 oder später?
5. Welche Sprachen außer Deutsch und Englisch?

---

**Anhang A:** [LEVELS.md](LEVELS.md), alle 150 Level mit Zielen, Terrain und Freischaltungen.  
**Anhang B:** [research/01-achterbahnen.md](research/01-achterbahnen.md), [research/02-coaster-spiele.md](research/02-coaster-spiele.md), [research/03-gesten-ux.md](research/03-gesten-ux.md).  
**Anhang C:** [TECH.md](TECH.md), technische Umsetzung.
