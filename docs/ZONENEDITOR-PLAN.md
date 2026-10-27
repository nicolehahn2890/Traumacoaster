# Trauma Coaster – Plan für den Zonen-Editor

Stand 27.10.2026. **Startfragen A1 bis A7 von Florian am 27.10.2026 beantwortet (alle wie empfohlen, Abschnitt 9);
Stufe 0 und Stufe 1 gebaut, Tor S1 bestanden (Florian, 27.10.2026); als Nächstes Stufe 2.** Gebaut wird Stufe für
Stufe mit Tor, auf dem Branch `zoneneditor`. Der große Plan (`docs/GROSSER-PLAN.md`)
ruht seit heute auf Florians Wunsch; Etappe 2 steht nach Schritt 7, dem Freiraumfeld und der Freigabe der Ebenen-Probe,
Tor 2b ist offen. Die Session von Etappe 2 hat die Pause per Nachricht bekommen (27.10.2026).

Grundlagen: Florians Vorgaben vom 27.10.2026 mit seinen acht Bildern (Bild 1 Kontur mit Ankern, Bild 2 Unterteilung und
Höhlenöffnung, Bild 3 gefüllt, Bild 4 Verläufe, Bild 5 Verlaufswerkzeug in Illustrator, Bild 6 Earle-Baum mit
Punktkrone, Bild 7 gemalte Bänder mit Textur, Bild 8 Höhlenbogen mit Pünktchen an den Kanten); die Kamerawinkel-Session
vom 26.10.2026 (Branch `test-kamerawinkel`, Runden 1 bis 10); der halbfertige Pfad- und SVG-Stand von Etappe 2; drei
Recherchen vom 27.10.2026 (Abschnitt 3); die Referenzen unter `refs/` (gesichtet am 27.10.2026 als Kontaktbögen:
`eyvind earle/` mit den fünf Favoriten in `feedback-2026-09-30`, `traumacoaster-gpt explore/visuals/` 04 bis 52,
`elements_png/` mit 139 Teilen, `parallax baukasten test/szenen/` 01 bis 10, `progression demo/`).

Die Kennzeichnung folgt der Regel aus `docs/HANDOVER.md` Abschnitt 5: **Platzhalter** ist alles, was vorläufig
aussieht oder vorläufige Werte trägt; **System** ist, was bleibt.

## 0. Kurzfassung

- **Was:** ein Zonen-Editor für die Ebenen-Welt. Tiefenebenen liegen hintereinander im Raum, mit einstellbarem Abstand.
  Auf jeder Ebene zeichnest du Formen wie in Illustrator (Zeichenstift, Kurvenstift, Formpinsel, Unterteilen in
  Flächen) und füllst sie per Ziehen wie in Procreate: Farbe, Verlauf mit Griffen, Mischmodi, Stile. Die
  Earle-Schichten (Bänder, Innenschatten, Gouache, Pünktchen, Lichtkante, Punktkronen) kommen per Knopf dazu, gemalte
  Bilder per Schnittmaske, Säume laufen entlang der Kanten, Portale sind Baugruppen. Du siehst alles im echten
  Spielbild, mit Bahn und Testfahrt, und exportierst SVG und Malvorlagen.
- **Wo:** im Browser, aus demselben Code wie das Spiel, am Mac und am iPad (über HTTPS zum Mac). Eine App-Hülle kommt
  erst, wenn ein Tor sie verlangt.
- **Die wichtigsten Befunde in deinen Vorgaben** (Abschnitt 2):
  - Ein Abstand ändert in der Perspektive das Bild: 20 m weiter hinten heißt bis 24 % kleiner und bis 64 px höher.
    Deshalb ist „Bild halten“ der Standard.
  - Pünktchen als Filter widersprechen Paket 0, Regel 4. Das entscheidest du neu, an Tor S5.
  - „Überall abtauchen“ widerspricht „Fels ist fest“ und den Rätseln darauf. Deshalb hat jede Fläche ein Material.
  - Markierungen braucht es, aber automatisch vorbelegt (Rolle, Material, Andockkanten). Ohne sie hält der Pinsel
    jede Kante für Boden.
  - SVG gibt Formen und Grundfarben genau weiter, die Earle-Schichten nicht.
  - Gemalte Teile brauchen eine Malvorlage mit Fingerabdruck der Form.
  - Ebenen in Ebenen: ja als Bedienung, darunter ein Knotenbaum mit relativer Tiefe. So bleiben Portale aus mehreren
    Ebenen beisammen.
- **Earle im Shader:** machbar, auch automatisch per Knopf: ein Ebenen-Material, drei bis sechs Draw Calls für den
  ganzen Stapel, geschätzt 1 bis 3 ms je Bild am Handy (wird gemessen).
- **Weg:** Stufe 0 (sichern, zusammenführen, HTTPS), dann acht Stufen mit Toren. Nach Stufe 2 ist der Editor ein
  Formwerkzeug mit SVG-Export, nach Stufe 3 ein Vorlagenwerkzeug für gemalte Teile, nach Stufe 4 ist die Zone
  spielbar.
- **Vor dem Start nötig:** deine Antworten auf A1 bis A7 (Abschnitt 9).

## 1. Ausgangslage

### 1.1 Warum jetzt

Die Kamerawinkel-Session hat gezeigt, dass die Welt aus vielen parallaktischen Ebenen bestehen kann und die Tiefe der
Bahn aus diesen Ebenen kommt: 32 Vektorscheiben in einem Mesh mit Punkte-Shader, 27 Draw Calls für das ganze Bild, der
Pinselmodus „Ebenen: Bodenhöhe“ fühlte sich für Florian schon gut an (26.10.2026). Die Formen dort sind aber erzeugt
(Rauschen), nicht seine. Damit die Ebenen-Welt seine Formen bekommt, braucht er ein Werkzeug, in dem er Ebenen anlegt,
Formen zeichnet, füllt, im Spielblick prüft, mit der Bahn testet und als genaue Vorlage exportiert. Das ist der
Zonen-Editor. Er setzt fort, was Florian am 25.10.2026 in Paket 5 freigegeben hat („Formen, die sich wie in Illustrator
bearbeiten oder sogar erstellen lassen … perfekte Formvorlagen für meine gemalten Elemente“), und erweitert es zu einem
eigenen Programm.

### 1.2 Was schon da ist und wiederverwendet wird

| Was | Wo | Stand |
|---|---|---|
| Zonendatei, Speichern über den Dev-Server, Hot-Reload | `src/zone/io.ts`, `vite.config.ts` | `main` (Etappe 1) |
| Weltrenderer, Kamera, Bahnprofile, Stützen, Physik, Testfahrt | `src/world/`, `src/track/`, `src/physics/` | `main` und `etappe-2-bahn-und-welt` |
| Klötzchen-Editor mit Station, Schlange, Feldern, Zielen, Schaltern, Coins, Baustellen | `src/app/zoneEditor.ts` | `main` und Etappe 2 |
| Freiraumfeld „fest oder frei“ für Pinsel, Stützen und Fahrt | `src/zone/field.ts` | Etappe 2, gepusht |
| Körper aus geschlossenen Kurvenpfaden (kubische Bézier, Löcher) mit Rollen Front, Wand, Füllung, Saum, Licht, Nebel, mit Dicke, Raum dahinter, Deckel ab Stufe, Boden-Merkmal und Bild auf dem Kurvenrahmen; Freiraumfeld und Three-Aufbau kennen Körper | `src/zone/types.ts`, `field.ts`, `src/world/elements.ts` | `etappe-2-bahn-und-welt`, gesichert als `b30bb71` (27.10.), 287 Tests grün; jetzt auch in `zoneneditor` |
| Pfad-Geometrie: Glätten, Grenzen, Punkt in Polygon mit Löchern, Vereinfachen, Glättung mit Griffgrenze, Selbstschnitt-Prüfung, Vorlagen Blob, Bogen, Hügel, Bank, Ring | `src/zone/path.ts` | ebenso |
| SVG-Export und -Import (alle Pfadbefehle, Bögen, Gruppen mit Transformationen, Grundformen, Löcher, Datenattribute für Tiefe, Dicke, Rolle), Rundlauf getestet | `src/zone/svg.ts` | ebenso |
| Umriss aus dem Alphakanal eines Bildes (bisher nur im Skript) und Zone `ebenen` aus Szene 06 des Parallax-Baukastens (8 Körper, 3 Felder als 3 Stufen) | `src/zone/trace.ts`, `scripts/ebenen-zone.ts`, `public/zones/ebenen/` | ebenso; Punkt- und Griffbearbeitung im Editor nicht begonnen |
| Neigung und Bildwinkel zur Laufzeit, Kamera-Panel mit Voreinstellungen | `src/track/stage.ts`, `src/ui/cameraTiltPanel.ts` | `test-kamerawinkel` (e7ad789, nur lokal); seit 27.10. in `zoneneditor` zusammengeführt |
| Scheibenstapel mit Rollen, ein Mesh mit Punkte-Shader | `src/zone/slices.ts`, `src/world/sliceMesh.ts` | `test-kamerawinkel` |
| Pinsel „Tiefe aus Ebenen“ (Bodenhöhe, Landen), Kehren-Wächter, Perspektiv-Physik | `src/track/brushTrack.ts`, `src/physics/trainSim.ts` | `test-kamerawinkel` |

### 1.3 Wie der Editor zum großen Plan steht

Viele Punkte des großen Plans behalten ihre Bedeutung; der Editor ändert, wo und wie sie gebaut werden.

| Stelle im großen Plan | bisher | mit dem Zonen-Editor |
|---|---|---|
| Paket 2.2, Editor Option A in drei Stufen | Stufe 1 (Klötzchen) gebaut, Tor 1b bestanden | Der Zonen-Editor ersetzt die Stufen 2 (Grafik-Slots) und 3 (Zonenwerkzeuge); die Spielobjekte aus Stufe 1 ziehen in ihn um (Stufe 4 hier) |
| Paket 5, Ebenen-Probe und Formvorlagen (Freigabe 25.10.) | Körper aus Kurvenpfaden halb gebaut | Der Editor ist die Ebenen-Probe in groß; Szene 06 „Kathedrale im Fels“ wird Torübung |
| Paket 5, „Fels ist fest, nur Öffnungen und Baustellen“; Etappe 2 Schritt 9 Tunnelkapsel | bestätigt 24.10. | Material je Fläche und Portal-Vorlagen (Befund 16, Entscheidung B2 und B3) |
| Paket 0, Regeln 1, 2, 4, 6, 9; Funkeln 0.3; Stilprobe E4 | vorläufig bis zur Stilprobe | Der Editor liefert die Werkzeuge dafür; Regel 4 muss neu entschieden werden (Befund 12) |
| Paket 8a und 8b, Teile, Aufträge, Prüfung „passt es genau“ | Erzeugung über Figma oder Generator | Malvorlage und SVG aus dem Editor sind die genaue Form jedes Auftrags (Abschnitt 4.10) |
| Paket 3.4, Stützen-Werkstatt | E4 | Stützen stehen auf Andockkanten der Ebenen (Abschnitt 4.9) |
| Paket 10, Etappen | E2 bei Schritt 7, Tor 2b offen | E2 ruht; nach Stufe 4 hier wird der Rest von E2 auf Ebenen neu geschnitten (Abschnitt 8) |
| Paket 11, Risiko „Editor-Oberfläche frisst die Etappe“ | Gegenmaßnahme: Stufe 1 ohne Politur | Jetzt das Hauptrisiko; Gegenmaßnahmen in Abschnitt 7 |

## 2. Florians Vorgaben, geprüft: Denkfehler, Widersprüche, Lücken

Jeder Punkt nennt die Vorgabe, den Befund und den Vorschlag. Wo Florian entscheiden muss, steht die Nummer aus
Abschnitt 9.

**1. Ebenen hintereinander, Abstand zwischen zwei Ebenen einstellen, ohne die anderen Abstände zu ändern.**
- Zwei Lesarten: Wandert nur die eine Ebene, ändert sich ihr Abstand zur nächsten. „Ohne die anderen Abstände zu
  ändern“ heißt also: alle Ebenen dahinter rücken mit. Vorschlag: Der Griff zwischen zwei Ebenen schiebt alles
  dahinter mit (Florians Lesart, Standard). Wer eine einzelne Ebene zwischen ihren Nachbarn verschieben will, zieht die
  Ebene selbst.
- **Denkfehler:** In der Perspektive ändert ein Abstand das Bild, nicht nur die Tiefe. Eine Ebene, die nach hinten
  rückt, wird kleiner und wandert nach oben (Bildhöhe = Höhe + Tiefe · tan Neigung). Gerechnet für das Handy quer mit
  11 px/m: 20 m weiter hinten heißt 12 % kleiner und 29 px höher bei 18° Bildwinkel und 12° Neigung; 24 % kleiner bei
  45°; 64 px höher bei 26,6° Neigung. Komponiert wird aber im Bild. Vorschlag: Standard **„Bild halten“**: Beim
  Verschieben in der Tiefe wird die Ebene so vergrößert und versetzt, dass sie im Spielblick gleich bleibt; nur die
  Parallaxe beim Schwenken wird stärker. Umschalter **„Welt halten“** für den anderen Fall (Entscheidung A1).
- Folge: Die Bahn liest ihre Tiefe aus den Ebenen; eine Probebahn wird nach jeder Abstandsänderung neu gelöst. Level
  sind leer, es geht also nichts verloren.

**2. Ebene anlegen, mit „P“ eine Kontur zeichnen, die Kontur unterteilen (Bild 1 und 2).**
- Illustrator macht das Unterteilen über das Formerstellungswerkzeug oder „Interaktiv malen“, beides umständlich. Die
  eleganteste Lösung hat Figma: Im **Vektornetz** erzeugt eine Linie quer durch die Form zwei Flächen, jede einzeln
  füllbar, und wenn man die Linie später verschiebt, wandern beide Flächen mit. Vorschlag: Formen als Vektornetz mit
  Flächen (Entscheidung A4).
- **Lücke:** Auf dem iPad ist ein freihändig gezogener Umriss natürlicher als der Zeichenstift. Vorschlag: zusätzlich ein
  **Formpinsel**, der einen Pencil-Strich in eine glatte Kurve mit wenigen Ankern verwandelt (wie QuickShape in
  Procreate; `path.ts` kann ein Polygon schon in einen weichen Pfad verwandeln).
- **Lücke:** In Bild 3 und 4 ist die Höhlenöffnung leer, in Bild 5 grau gefüllt. Beides muss gehen: Jede Fläche hat ein
  Material, „frei“ ist ein Loch (durchsichtig, die Bahn darf hindurch), sonst ist sie gefüllt.
- **Lücke:** Der Höhlenrand in Bild 2 bis 5 liegt flach auf derselben Ebene und bewegt sich beim Schwenken nicht gegen
  die Vorderfläche. Für echte Tiefe braucht es **„Nach hinten lösen“**: Die Fläche rückt ein Stück hinter die
  Vorderfläche (sie bleibt Teil ihrer Ebene, bekommt aber eine eigene Tiefe, Abschnitt 3.4) und wird vom Editor unter
  die Vorderfläche verlängert, damit beim Schwenken keine Spalte aufgeht.

**3. Die gezeichnete Form füllen (Bild 3).** Passt. Füllen heißt: Farbe aus dem Farbmenü auf die Fläche ziehen
(ColorDrop wie in Procreate) oder antippen.

**4. Farben und Verläufe wie Procreate, Verlauf mit Winkel und Länge, „am besten ein Pinsel dafür“, Verlauf mit
Deckkraft und Mischmodus über einer Volltonfarbe.**
- **Befund:** Procreate hat laut seinen eigenen Hilfeseiten kein Verlaufswerkzeug, nur die Verlaufsumsetzung
  (Gradient Map) und Umwege wie einen weichen Airbrush auf einer Ebene mit Alpha-Sperre (Abschnitt 3.1). Wir nehmen von
  Procreate das Farbmenü, ColorDrop und die Pipette per Halten, von Photoshop und Affinity die Verlaufsgriffe direkt auf
  der Fläche und von Illustrator die Freiform-Verläufe als „Pinsel“.
- Vorschlag: Verlauf = eine Linie über die Fläche ziehen (Anfang und Ende geben Winkel und Länge), Farben auf die Enden
  fallen lassen, eine weitere Farbe auf die Linie fallen lassen gibt einen Zwischenstopp. Ein Verlauf kann über mehrere
  Flächen laufen (wie in Bild 5 über Rand und Vorderfläche). Der „Pinsel“ heißt **Farbnebel**: weiche Farbtupfer mit
  dem Pencil in die Fläche, intern ein Freiform-Verlauf.
- Der Verlauf über einer Volltonfarbe ist der **Füllstapel** einer Fläche: Farbe, darüber Verlauf mit Mischmodus und
  Deckkraft, darüber Farbnebel, Textur, Pünktchen, Lichtkante. Das ist Illustrators Aussehen-Bedienfeld bzw. Figmas
  mehrfache Füllung, gezeigt als kleine Liste wie Procreates Ebenen.
- **Lücke:** Wenn 40 Flächen „Wiesengrün“ tragen, soll eine Änderung alle treffen. Vorschlag: **Zonenpalette** mit
  benannten Farbfeldern; die Looks Tag, Abend und Nacht (Paket 2, Paket 0 Regel 9) tauschen die Palette.

**5. Ein zusätzlicher Verlauf auf der ganzen Ebene mit Mischmodus.** Passt (Ebenenstapel wie der Füllstapel, nur für
die ganze Ebene). **Grenze:** Das gilt für die Pixel der Ebene selbst. Eine ganze Ebene, die im Mischmodus auf die
Ebenen dahinter wirkt (etwa ein Nebel in „Ineinanderkopieren“), geht im Spiel nur als Multiplizieren, Negativ
multiplizieren oder Addieren (Abschnitt 3.2). **Lücke:** Paket 0 Regel 6 will Ferne hell und entsättigt, Vordergrund
dunkel. Vorschlag: **Luftperspektive** als automatische Ebenen-Schicht nach Tiefe, je Ebene abschaltbar.

**6. Ebenenliste rechts mit Vorschau, Abstand zwischen zwei Ebenen in der Liste einstellbar.** Passt. **Lücke:** Bei 30
und mehr Ebenen wird die Liste lang und der Abstand als Zahl abstrakt. Vorschlag: neben der Liste eine **Tiefenleiste**
(der Stapel von der Seite, jede Ebene ein Strich, Abstände ziehbar), Ebenen-Gruppen (Vorne, Spiel, Ferne), und Tippen auf
eine Form im Bild wählt ihre Ebene.

**7. Kamerawinkel und Perspektive einstellen wie in der Kamerasession, Navigation durch den Raum.** Passt (das Kamera-
Panel ist gebaut). **Lücken:** (a) Hinten zeichnen ist schwer, wenn vordere Ebenen die Stelle verdecken: Vorschlag
**Isolieren** (Ebenen davor ausblenden oder durchsichtig). (b) Freies Umkreisen zeigt den Trick der flachen Ebenen; das
ist zum Prüfen gut, zum Urteilen über den Look nicht. Vorschlag: Ansichten **Spielblick**, **Frontal** (gerade auf die
aktive Ebene, zum genauen Zeichnen), **Seite** (Tiefen von der Seite), **Frei**, mit einem Knopf zurück zum Spielblick.
(c) Wo Neigung und Bildwinkel gespeichert werden (je Zone oder je Feld), ist offen (Entscheidung B5).

**8. Recherche, welche Funktionen noch fehlen.** Abschnitt 3; die übernommenen Funktionen stehen in Abschnitt 4.

**9. Formen und Ebeneninhalte wie mit „V“ als Ganzes verschieben, breiter und höher machen.** Passt; dazu Drehen,
Spiegeln, Ausrichten, Einrasten und Zahleneingabe, sonst fehlt Präzision.

**10. Möglichst viel mit Pickern und Drag-and-drop, keine unnötigen Regler, intuitiv, auch auf dem iPad.** Passt als
Grundsatz. **Kleiner Denkfehler:** Ganz ohne Werte geht es nicht (Abstände, Winkel, Deckkraft). Vorschlag: Werte am
Objekt anfassen (Griffe) und bei Bedarf als Zahl antippen; Regler nur in der Kamera, wo Florian sie schon kennt.

**11. Formen kopieren und in neue Ebenen einfügen, Verläufe auf andere Formen übertragen wie Ebenenstile.** Passt.
**Lücke:** Beim Einfügen in eine Ebene mit anderer Tiefe ist offen, ob die Form gleich groß im Bild oder gleich groß in
Metern bleibt. Vorschlag: Standard wie bei Punkt 1 („Bild halten“). **Lücke:** Ein übertragener Stil ist eine Kopie;
für eine ganze Zone besser sind **verknüpfte Stile** (einmal ändern, überall geändert), wie Grafikstile in Illustrator.

**12. Earle-Pünktchen und gemalte Textur auf Ebenen und Formen, automatisch per Knopf, vielleicht als dynamischer
Shader.**
- **Widerspruch:** Paket 0, Regel 4 sagt bisher „Punktraster nur gemalt, an Kronenkanten und Schattenrändern wie in
  Bild 04, nie als Filter“ (Bild 04 ist das Visual „Ornamentwald“; Florians Vorgabe vom 24.10.2026). Der neue Wunsch
  ändert diese Regel (Entscheidung B1).
- Machbarkeit: ja. Die Kamerasession zeichnet schon Punkte im Shader (Zellen mit Zufallsversatz in Weltmetern, Radius
  aus der Schattierung). Wie weit das trägt und was dynamisch sinnvoll ist, steht in Abschnitt 3.2 und 4.7.

**13. Es wird ein Spiel mit Achterbahn und Physik, flüssig als Handy-App und am Desktop.** Passt. **Lücke:** Der Editor
muss das sichtbar machen, sonst merkt man es erst am Handy. Vorschlag: **Leistungsanzeige** im Editor (Draw Calls,
Dreiecke, Texturspeicher, geschätzte Kosten je Pixel), ein **Kompilieren**-Schritt, der die Zone für das Spiel
vorbereitet, und ein Link mit QR-Code, der die Zone sofort auf dem Handy öffnet.

**14. Der Editor soll am Desktop und auf iPad oder Tablet laufen, Browser oder App, was am besten funktioniert.**
**Erweiterung gegenüber dem 25.10.2026:** Damals hieß es „der Pfad-Editor muss nicht auf dem Handy laufen, der ganze
Baukasten passiert am Mac“. Das iPad ist neu und kostet Bedienarbeit (Gesten, Pencil, Fingerziele, keine Tasten).
Empfehlung in Abschnitt 3.3 (Entscheidung A2).

**15. Die Tiefe kommt künftig von den Ebenen; Ebenenkanten sollen erkannt werden, aber keinen Einfluss auf den
Pinselstrich haben. Muss ich dazu Markierungen oder eine Kollisionsmaske an der Ebene einstellen?**
- Der Strich bleibt im Bild genau dort, wo er gezogen wird (Regel seit Tor 1a). Die Ebenen bestimmen nur die Tiefe
  dahinter, die Stützen und die Portale.
- **Ja, ein paar Angaben braucht es, aber automatisch vorbelegt.** In einem dichten Stapel ist jede Bildhöhe die
  Oberkante irgendeiner Ebene; die Kamerasession hat in Runde 5 gesehen, dass der Pinsel dann jeden Anstieg als Tiefe
  liest. Vorschlag, drei Angaben: **Rolle der Ebene** (spielbar, Kulisse, Vordergrund, Luft; die Kamerasession hatte
  schon front, play, cave, deep, far), **Material je Fläche** (fest, grabbar, luftig, frei) und **Andockkanten**
  (Oberkanten bis etwa 35° Neigung automatisch, je Kantenstück abschaltbar).
- Keine gemalten Kollisionsmasken: Vektorflächen sind selbst genaue Masken. Bei gemalten Bildern liefert die
  Schnittform oder der Umriss aus dem Bild (`trace.ts`) die Maske.

**16. Kein Boden mehr: Wo die Bahn hinter einer Ebene abtaucht, entsteht ein Tunneleingang, wo sie auftaucht, ein
Ausgang; Portale sind Formen, die ich wie Ebenen bearbeite, und können aus mehreren Ebenen bestehen.**
- Passt zum Freiraumfeld und zu Florians Leitsatz 5 (Paket 5).
- **Widerspruch:** Paket 5 sagt „Fels ist fest, nur Öffnungen und Baustellen“ (bestätigt 24.10.2026), und darauf bauen
  Rätsel: Durchbruch, Baustelle, Tunnel-Meter, Fähigkeit „Tunnel erlaubt“. Wenn die Bahn überall abtauchen darf, fallen
  sie weg. Vorschlag: Das Material entscheidet: **grabbar** (Erde, Wiese: Abtauchen erzeugt Portale), **fest** (Fels:
  nur durch Öffnungen und Baustellen), **luftig** (Busch, Krone: die Bahn läuft verdeckt dahinter, ohne Portal),
  **frei** (Loch). Entscheidung B2.
- **Denkfehler:** Ein Portal sieht nur echt aus, wenn die Bahn durch die Öffnung in die Tiefe fährt: Sie kommt vor der
  Ebene an und verschwindet durch das Loch nach hinten. Der Pinsel braucht dort einen Tiefenwechsel, und die Ebene
  braucht an der Stelle ein echtes Loch, das zur Laufzeit geschnitten wird.
- **Lücke:** Hinter einer Ebene ist bis zur nächsten nichts. Was man durch den Portalmund sieht (Innenwand, Dunkel),
  muss die Portal-Vorlage mitbringen, und sie muss in die Lücke bis zur nächsten Ebene passen.
- **Lücke:** Eine Bahn „unter der Erde“ darf nirgends durchscheinen. Wo sie hinter einer Ebene läuft, muss davor etwas
  Festes liegen; Lücken zwischen Büschen im Vordergrund würden sie zeigen. Vorschlag: Ebenen reichen nach unten bis an
  den Feldrand, und eine **Durchblick-Prüfung** zeigt im Editor, wo eine verdeckte Bahn sichtbar würde.
- Vorschlag: Portal-Vorlagen als Baugruppen, eine **Portal-Werkstatt** mit Probebahn, die Platzierung beim Zeichnen
  und feste Öffnungen von Hand (Abschnitt 4.9, Entscheidung B3).

**17. Ebenen sollen auch Bilder sein, Formen exportierbar; die vielen einfachen Seiten als SVG, Vorlagen für gemalte
Ebenen; Formen und Gemaltes mischen, etwa gemalte Grasnarbe oben, SVG-Flächen darunter.**
- **Befund:** SVG gibt Formen, Vollton, lineare und radiale Verläufe, Schnittpfade und Gruppen genau weiter, aber
  nicht Pünktchen, Textur, Farbnebel und Lichtkante (Abschnitt 4.10). SVG ist also die genaue Vorgabe für Form und
  Grundfarbe; der Rest reist als Daten in der Datei und als gerendertes Bild.
- **Lücke:** Eine gemalte Grasnarbe als festes Bild passt nicht mehr, sobald die Form darunter geändert wird.
  Vorschlag: **Saum**, ein gemalter Streifen, der der Kante folgt, wie die Friezes in Raymans Engine und die Säume
  `grass_rim_trim`, `rock_rim_trim`, `snow_rim_trim` und `root_rim_trim` im Elemente-Bogen.
- **Lücke:** Wird eine Form nach dem Malen geändert, passt das Bild nicht mehr. Vorschlag: Die **Malvorlage** trägt
  einen Fingerabdruck der Form; ändert sich die Form, warnt der Editor.
- **Lücke:** Gemalte Ebenen vorn brauchen mehr Pixel als hinten. Der Editor rechnet die nötige Bildgröße je Ebene aus
  Tiefe und größtem Zoom vor.

**18. Gemalte Ebenen durch SVG-Bereiche beschneiden wie die Schnittmaske in Photoshop.** Passt. Im Spiel ist das
günstig: Das Bild liegt als Textur auf der Fläche, die es beschneidet; es braucht keinen eigenen Draw Call und keine
Schablone.

**19. Ein Ebenensystem innerhalb der Ebene, oder geht es besser?** Als Bedienung ja, mit zwei Begriffen und flach
statt tief verschachtelt: **Ebene** (im Raum, mit Abstand) enthält **Schichten** (Form, Bild, Saum, Gruppe) mit
Schnittmasken wie in Procreate; Verläufe und Effekte stecken im Füllstapel der Fläche statt in Unterebenen; was über
mehrere Ebenen reicht (Portal, Baum, Höhle), ist eine **Baugruppe**. **Besser als reine „Ebenen in Ebenen“** ist
darunter ein Knotenbaum, in dem jeder Knoten eine Tiefe relativ zu seinem Elternteil hat; dann bleiben Baugruppen
beisammen, Flächen lassen sich ein Stück nach hinten lösen, und Freilegen ist eine Tiefenänderung (Abschnitt 3.4).

**Lücken, die in den Vorgaben nicht vorkommen:**
- Rückgängig und Wiederholen (zwei und drei Finger tippen wie in Procreate, Cmd+Z), automatisches Sichern, Versionen.
- **Skizze als Pause-Ebene:** ein eigenes Foto oder Bild halbdurchsichtig über das Spielbild legen und nachzeichnen;
  wird nicht exportiert.
- **Spielobjekte:** Station, Schlange, Felder, Ziele, Schalter, Coins und Baustellen aus dem Klötzchen-Editor müssen in
  den neuen Editor, sonst gibt es zwei Editoren.
- **Fortschritt „Mehr Ebenen, gleicher Blick“** (`progression demo/19-vergleich-zwei-drei-fuenf-ebenen.png`):
  Ebenen und Schichten mit „sichtbar ab Fortschrittsstufe“, ein Stufenregler im Editor; **Freilegen** als
  Ebenenverschiebung (Leitsatz 5).
- **Bewegung:** Earle × Rayman heißt „alles animiert“: Wiegen, Treiben, Funkeln je Schicht.
- **Licht der Zone:** eine Lichtrichtung, aus der Lichtkante und Pünktchen ihre Seite nehmen (Paket 0 Regel 5).
- **Prüfungen:** Leistung, Durchblick, Details unter 3 px am Handy (Paket 0 Regel 2), Andockkanten anzeigen.
- **Boolesche Operationen**, Pfad vereinfachen, **Kontur in Fläche umwandeln** (Paket 0 Regel 1: keine Konturen im
  Look; helle Rindenlinien sind Flächen, keine Striche).

## 3. Recherche (27.10.2026, Essenz)

Drei Recherchen mit Quellen (Liste in Abschnitt 10). Bestätigtes steht ohne Zusatz, Unsicheres ist markiert.

### 3.1 Wie Procreate, Adobe, Affinity, Figma und andere es machen

**Neu seit 2025:** Procreate 5.4 hat Pinsel und Farbmenü überarbeitet, bleibt aber ein reines Malprogramm ohne
Vektorformen und ohne Verlaufswerkzeug. Affinity ist seit dem 30.10.2025 eine einzige kostenlose App für Mac und
Windows (Vektor, Pixel, Layout in einer Datei, Rückgängig-Verlauf in der Datei), die iPad-Fassung ist angekündigt,
aber noch nicht da (laut einer Meldung vom 15.10.2026 für November, unsicher). Illustrator auf dem iPad hat weder das
Aussehen-Bedienfeld noch Grafikstile. Figma unterstützt das Bearbeiten von Designs auf dem iPad offiziell nicht, hat aber
2026 „Ziehen zum Füllen“ im Vektormodus und einen Mesh-Verlauf (Beta) bekommen. Pixelmator Pro gibt es seit Januar
2026 auf dem iPad. **Folge:** Es gibt kein fertiges Programm, das Florians Wünsche auf dem iPad erfüllt; das spricht für
einen eigenen Editor und gegen „einfach Illustrator auf dem iPad“.

Was wir je Thema übernehmen:

| Thema | bestes Vorbild | übernommen als |
|---|---|---|
| Farbe wählen und auf Flächen ziehen | **Procreate**: Farbknopf oben rechts, Modi Scheibe, Klassisch, Harmonie, Wert, Paletten, die letzten zehn Farben; ColorDrop (Farbe auf die Fläche ziehen, halten und seitlich wischen ändert den Schwellwert, „Weiter füllen“ für weitere Flächen); SwatchDrop (Palettenfeld direkt ziehen); Halten mit dem Finger ist die Pipette | Farbmenü und Ziehen aus 4.2 und 4.6; „Weiter füllen“ heißt bei uns: nach dem Fallenlassen weitere Flächen antippen |
| Verlauf mit Winkel und Länge | **Photoshop Live-Verläufe** und **Affinitys Füllwerkzeug**: über das Objekt ziehen, Stopps auf der Linie antippen, Ende ziehen ändert Länge und Winkel, bleibt bearbeitbar; Illustrator iPad rastet in 45°-Schritten ein | Verlaufswerkzeug aus 4.3 mit 45°-Raster beim Ziehen |
| „Pinsel“ für Verläufe | **Illustrators Freiform-Verlauf** (Farbpunkte oder Linien mit Reichweite), Figmas Mesh-Verlauf mit 16 Punkten (Beta) | Farbnebel (4.3) |
| Verlauf mit Mischmodus über Vollton | mehrere Füllungen je Objekt mit eigener Deckkraft und eigenem Mischmodus: Illustrators Aussehen-Bedienfeld, Affinitys Appearance (auch auf dem iPad, Reihenfolge per Ziehen), Figma je Füllung; in Figma ist auch ein Bild eine Füllung | Füllstapel (4.6); ein gemaltes Bild kann eine Füllung sein |
| Durchsichtigkeitsverlauf | Affinitys Transparenzwerkzeug zieht Deckkraftverläufe wie Farbverläufe | Deckkraft als Verlaufsart im Füllstapel (für Nebel, Licht, weiche Übergänge) |
| Stil übertragen | **Illustrator-Grafikstile**: Stil-Miniatur auf ein Objekt ziehen (ohne vorher auszuwählen), Neudefinieren ändert alle Objekte mit dem Stil, Pipette nimmt das ganze Aussehen; Figma kopiert Eigenschaften mit Cmd+Opt+C/V | Stile aus 4.6: ziehen, verknüpfen, Pipette mit Wahltaste, Stil kopieren und einfügen |
| Schnittmaske | **Affinity**: eine Ebene auf den Namen einer anderen ziehen macht sie zum beschnittenen Kind, auf die Miniatur gezogen wird sie zur Maske; Procreate: Ebene antippen, Schnittmaske | Ziehen in der Ebenenliste wie in Affinity, dazu Cmd+7 |
| Form in Teilflächen | **Figmas Vektornetz** mit Farbeimer (Shift+B, Ziehen füllt mehrere Flächen, gleiche Farbe nochmal entfernt die Füllung, so entsteht ohne Pfadrichtung ein Loch); Illustrators Interaktiv malen (Farbe hängt an der Fläche, nicht am Pfad); Affinitys Vektor-Flutfüllung (füllt auch zwischen offenen Kurven), Shape Builder und Messer; in Concepts wird gefüllt, was man mit dem Stift umfährt | Vektornetz mit Flächen (4.5), Messer, Füllen durch Ziehen über mehrere Flächen |
| Verschachtelung | in allen Programmen hat eine Ebene einen Typ; Vektor und Gemaltes mischen sie über Gruppen oder Elternobjekte; am direktesten Affinity (jedes Objekt kann Kinder haben, etwa ein Bild in einer Vektorform) | Abschnitt 3.4 |

**Funktionen, die Profi-Programme haben und die Florian nicht genannt hat** (übernommen in 4.3 bis 4.6):
Boolesche Operationen, die änderbar bleiben; **Kurvenstift** (Illustrators Kurvenzeichner: Tippen gibt glatte Kurven
ohne Griffe, gut für Finger); **Band** (Kontur nach innen versetzen, um das helle Randband und den dunklen Höhlenrand
aus Bild 2 als parallele Fläche zu erzeugen, statt sie von Hand zu zeichnen); Einrasten in 45°-Schritten und an
Hilfslinien; Symbole und Instanzen; verknüpfte Stile; globale Farben; Pipette für Farbe und Aussehen; langer
Arbeitsverlauf; Ausrichten, Verteilen, Zahlen; Isolationsmodus (Gruppe doppelt antippen); Auto-Trace aus Skizzen;
Bibliotheken für Formvorlagen, Paletten und Stile; PSD-Import mit Ebenen (Procreate exportiert PSD).

**iPad-Bedienung:** Maßstab sind Procreates Gesten (zwei Finger tippen rückgängig, halten mehrere Schritte, drei Finger
wiederholen, drei Finger nach unten wischen Kopieren-Menü, Finger halten Pipette, Eingefügtes landet auf einer neuen
Ebene). Für Umschalt- und Wahltaste ohne Tastatur gibt es drei erprobte Wege: Adobes Touch Shortcut (Mitte halten,
zum Rand schieben), Affinitys Command Controller (Tasten halten oder sperren), Linearitys zweiter Finger. Schwach auf
dem iPad: Abläufe mit Wahltaste vom Desktop, Präzision (der Finger verdeckt den Anker), schwer merkbare Gesten mit drei
und vier Fingern. Folgerung: wenige Gesten, sichtbare Knöpfe für alles Wichtige, Lupe beim Ziehen von Ankern.

### 3.2 Earle-Pünktchen, gemalte Textur und Dynamik im Shader

**Antwort auf Florians Frage: ja, auch automatisch.** Pünktchen und gemalte Textur lassen sich wie ein Verlauf auf jede
Form legen. Dafür gibt es ein einziges **Ebenen-Material**, das für jede Form eine **Stilzeile** aus einer Datentextur
liest. Ein Knopf füllt diese Zeile mit abgeleiteten Werten, und das Bild ändert sich sofort, ohne dass Geometrie neu
gebaut wird. Gebacken werden nur der Kantenabstand (SDF) und die Kronenpunkte. Alles haftet an seiner Ebene (kein
„Duschtür-Effekt“, bei dem ein Muster am Bildschirm klebt), bleibt undurchsichtig und kommt für den ganzen Stapel mit
etwa drei bis sechs Draw Calls aus. Die Kosten sind Schätzungen für ein iPhone 12 bei DPR 2 und werden gemessen.

| Schicht | Technik | Kosten je Pixel (Schätzung) |
|---|---|---|
| Geometrie (gebacken) | Kurven zu Polygonen; die Formen einer Ebene werden überlappungsfrei zerlegt; die „gemalte“ Kante als Rauschen in die Kontur gelegt | nichts pro Bild |
| Verlauf | im Shader aus der Lage berechnet, Farbe aus einem Verlaufsatlas (eine Zeile je Form, beliebig viele Stopps) | 1 Zugriff, ~10 Rechenschritte |
| **Bänder** | der Verlauf in Stufen, die Stufengrenzen mit Rauschen verschoben: Earles gebänderte Hügel | ~10 |
| **Innenschatten** | der Kantenabstand versetzt gelesen (Valves Schatten-Trick): harte Licht-Schatten-Kanten in der Form | 1 Zugriff |
| **Pünktchen** | Zellen mit Versatz aus einer vorab entspannten 64×64-Kachel mit Rang: ein Punkt erscheint, wenn sein Rang unter der Dichte liegt; ändert sich die Dichte, kommen Punkte hinzu oder fallen weg, keiner springt; wahlweise ein gemalter Tupfer statt Kreis | ~30, 1–2 Zugriffe |
| **Lichtkante** | Band am Rand, gewichtet mit der Lichtrichtung über eine „Kissen-Normale“ aus dem Kantenabstand | 2–3 Zugriffe |
| **Gouache und Papier** | gescannte Graustufen-Kacheln (am besten Florians eigenes Papier und seine Gouache, nicht Rauschen), Mischung Weiches Licht, Körnung in Papiertälern dunkler, im Ebenenraum, in Verlaufsrichtung gedreht | 1–2 Zugriffe, ~15 |
| Luftperspektive | Mischung zur Dunstfarbe je Ebene statt durchsichtiger Nebelflächen | ~3 |
| **Kronenpunkte** | eigenes Mesh aus echten Scheiben, Lage vorab verteilt (gewichtetes Voronoi oder Poisson), Farbe je Punkt aus dem Licht, in der Tiefe ±0,5 m gestaffelt | 3000 Punkte ≈ 25k Dreiecke |

Zusammen etwa 80 bis 150 Rechenschritte und vier bis sechs Texturzugriffe je Pixel. Apple-GPUs verwerfen verdeckte
undurchsichtige Pixel vor dem Shader, also wird jeder Bildpunkt etwa einmal gerechnet: geschätzt 1 bis 3 ms je Bild.

**Kantenabstand (SDF):** Canvas2D zeichnet den Bézier-Pfad als Maske, daraus berechnet ein Hintergrund-Thread die exakte
Distanztransformation (so baut Mapbox seine Schrift-SDFs); Ergebnis als 8-Bit-Textur in einem Atlas, 2 bis 4 Texel je
Meter, höchstens 256 Pixel je Seite, ±4 m; ein Atlas 2048² belegt 4 MB für einige hundert Formen. Ohne Textur geht es
mit versetzten Konturringen (wie im Scheibenstapel der Kamerasession), dann aber ohne Innenschatten. Neu rechnen beim
Bearbeiten (wenige Millisekunden), nie pro Bild.

**Mischmodi:** Innerhalb einer Form und einer Ebene geht jeder Modus (Multiplizieren, Negativ multiplizieren,
Ineinanderkopieren, Weiches Licht, Farbig abwedeln; je 3 bis 15 Rechenschritte), in fester Reihenfolge im Shader.
**Gegen dahinterliegende Ebenen kann WebGL nur Multiplizieren, Negativ multiplizieren und Addieren**; alles andere
bräuchte eine Kopie des Bildes, und die WebGL-Erweiterung dafür ist seit 2019 nur ein Entwurf. Gerechnet wird in sRGB
wie Photoshop und Procreate, sonst weicht Weiches Licht von der Vorlage ab.

**Was der Knopf „Earle“ braucht:** je Zone Lichtrichtung (in der Ebene und Höhe), Licht- und Schattenfarbe, einen Satz
Papier und Gouache, die Grundgröße der Punkte in Bildpunkten; je Form ein Preset (Hügel, Fels, Wiese, Krone, Wasser),
Dichte, Größenstreuung, Kantenbreite, Bänderzahl, Zufallssamen. Automatisch abgeleitet: mehr Punkte im dunklen Teil des
Verlaufs und an der Lichtkante, weniger in der Mitte; Punktfarbe im Schatten heller, zur Lichtfarbe hin; Punktgröße je
Ebene aus der Bildgröße; Texturdrehung aus der Verlaufsrichtung. Handarbeit bleibt: Kronen, bewusst gesetzte Punkte
(Earles Reihen entlang von Graten), Paletten und die Preset-Liste; das entscheidet Florian. **Platzhalter:** alle
Presets und Farbregeln, bis die Stilprobe sie bestätigt.

**Dynamik, die sich lohnt:** Licht als Wert, der sich ändern darf (Tag und Nacht, Laternen: Lichtkanten, Innenschatten
und Punktdichte folgen, Punkte kommen und gehen statt zu wandern); Mitbewegen mit der Ebene (kostet nichts); Wind in
den Kronenpunkten; Kronenpunkte in der Tiefe gestaffelt (echte Tiefe beim Schwenken); Wolkenschatten als wandernde
Textur. **Nur bedingt:** Mikro-Parallaxe der prozeduralen Punkte (5 cm vor der Fläche bewegen sich über eine ganze
Bildschirmfahrt etwa 1 px, also unsichtbar; ab Dezimetern lieber echte Geometrie); Funkeln nur für Wasser, Schnee und
Kristalle. **Lohnt sich nicht:** blickabhängiger Randschein (wirkt plastisch und unruhig, gemaltes Licht hängt nicht
vom Blick ab), Punkte, die sich beim Zoomen teilen (Surface-Stable Fractal Dithering: im Gemälde werden Punkte beim
Heranzoomen größer), Kantenabstand pro Bild, Papier im Bildschirmraum.

**Fallstricke:** Flimmern bei fahrender Kamera (Punkte unter 1 bis 2 px ausblenden, Lichtkanten mit Mindestbreite);
Zoom über Faktor 3,75 und Tiefen bis 250 m (Punktgröße je Ebene aus dem Bildmaß, Kronen unter 3 px in eine Fläche mit
prozeduralen Punkten überblenden); überlappende Formen derselben Ebene flackern im Tiefenpuffer (darum überlappungsfrei
zerlegen); jede durchsichtige Nebelfläche kostet die ganze Fläche; Verläufe zeigen Stufen (das Papierkorn hilft);
Akku und Wärme (GPU-Zeit unter etwa 60 % des Bildes, DPR 1,5 bis 2 nach Bildzeit regeln, keine Vollbild-Nachpässe).
**Vier Mängel im Test-Shader der Kamerasession**, zu beheben beim Übernehmen: Punkte werden an Zellkanten
abgeschnitten (Versatz auf ±(0,5 − Radius) begrenzen); der Sinus-Hash wird bei großen Zellnummern ungenau (Ganzzahl-
Hash); alle Scheiben teilen ein Weltraster, die Muster fluchten über die Ebenen (Versatz je Ebene); der ganze Stapel
empfängt Schatten (nur nahe Ebenen).

**Vorbilder:** Raymans Engine UbiArt baut Gelände aus Spline-Formen („Frise“) mit Fülltextur, Kantentexturen je
Steigung, Vertex-Animation und Tiefe (aus Reverse-Engineering, inoffiziell); Unitys Sprite Shape macht dasselbe mit
Kanten-Sprites je Winkelbereich; Murphy und Galanter (Texas A&M, SIGGRAPH 2014 und 2015) haben Earles Stil in Houdini
nachgebaut: Grundformen, gestreute Punkte als Geometrie, eigene Schattenformen, flache Flächen mit weichen Verläufen;
Alto's Odyssey zeigt flache Verlaufsebenen mit gedämpfter Ferne auf dem Handy; Old Man's Journey verformt Hügel-Ebenen
als Spielmechanik. **Korrektur** zu `docs/research/2026-10-24-recherche-b-shader-licht-schatten.md`: Das SIGGRAPH-
Poster von 2014 nennt Rayman Legends nur als Beispiel für zerlegte Sprites; dass Rayman selbst so schattiert, ist nicht
belegt.

### 3.3 Mac und iPad: Browser, App-Hülle oder eigene App

**Empfehlung: zuerst im Browser, eine App-Hülle (Capacitor) nur bei Bedarf, keine eigene iPad-App.** Der Editor wird eine
zweite Seite im selben Projekt wie das Spiel; er nutzt dessen Renderer, Kamera und Zonendatei und zeigt deshalb genau das
Spielbild. Am Mac läuft er in Chrome oder Safari auf `localhost`. Auf dem iPad läuft er in Safari, am besten als App auf
dem Home-Bildschirm (seit iPadOS 26 öffnet jede dort abgelegte Seite als eigene App), und zwar **über HTTPS** gegen den
Dev-Server auf dem Mac. Gespeichert wird wie heute über den Dev-Server ins Repository; dazu sichert der Editor jeden
Arbeitsschritt zusätzlich im Browser-Speicher (IndexedDB), falls die Seite abstürzt oder der Mac schläft.

**Warum HTTPS:** `http://192.168.…` im WLAN ist für Safari kein sicherer Kontext. Ohne HTTPS fehlen unter anderem die
Zwischenablage, Teilen mit Dateien (AirDrop, „In Dateien sichern“), der dauerhafte Speicher, der Offline-Betrieb und
WebGPU. Wege dahin: `vite-plugin-mkcert` (lokales Zertifikat, einmal ein Profil auf dem iPad installieren und vertrauen,
Zertifikat auch für `<mac>.local`) oder Tailscale Serve (gültiges Zertifikat ohne Profil, auch unterwegs). Öffentliche
Tunnel scheiden aus, weil sie die Speicher-Endpunkte ins Internet stellen würden (Entscheidung A7).

**Was auf dem iPad in Safari geht:** Pointer Events mit Druck und Neigung, seit Safari 18.2 auch Höhen- und Drehwinkel,
zusammengefasste und vorhergesagte Ereignisse; Stiftereignisse mit bis zu 240 Hz; Pencil-Schweben auf Geräten mit Hover;
Seitenzoom lässt sich sperren; WebGL2, WASM, IndexedDB; Dateien hinein per Auswahl und Ziehen; Tastatur mit Umschalt-
und Befehlstasten. **Was nicht geht:** Drücken und Doppeltippen des Pencil Pro, Drehen des Stifts (nur experimentell),
Stift und Finger gleichzeitig (iPadOS schickt keine Fingerereignisse, solange der Stift aufliegt), Dateien am Ort öffnen
und sichern, eigene Einträge in der Menüleiste, Systemgesten am Rand abschalten, Safari-Kürzel wie Cmd+T und Cmd+W
belegen, Downloads in Home-Bildschirm-Apps (ein offener WebKit-Fehler), 120 Hz (Safari begrenzt auf 60 fps).
**Speicher:** Über etwa 1,5 GB beendet iOS die Seite ohne Vorwarnung; ein Bild mit 4096² Pixeln belegt mit Mipmaps rund
85 MB. Darum gemalte Bilder im Editor auf höchstens 2048 Pixel begrenzen und Vorschaubilder über den gemeinsamen
Renderer zeichnen.

**Pencil-Verzögerung:** Native Apple-Apps liegen bei etwa 9 ms, im Browser kommen der 60-Hz-Takt und das Zusammensetzen
der Seite dazu; das ist spürbar träger (Schätzung, keine Messung gefunden). Für Anker und Griffe unkritisch; für
Freihandstriche (Formpinsel, Farbnebel, Bahn) zusammengefasste und vorhergesagte Ereignisse nutzen, den Strich in eine
leichte Überlagerung zeichnen und die 3D-Szene nicht bei jedem Ereignis neu rendern.

**Die App-Hülle (Capacitor) lohnt sich erst**, wenn eines davon gebraucht wird: Drücken und Doppeltippen des Pencil Pro
(eigenes Swift-Modul nötig), Menüleiste und Tastenkürzel ohne Konflikte, Öffnen und Sichern in Dateien oder iCloud Drive
(Austausch mit Illustrator ohne Mac), Arbeiten ohne Mac. Sie nutzt dieselbe Browser-Engine, ändert also nichts an
Stift, Grafik und Leistung; der Preis sind Xcode-Builds und Signierung (mit freier Apple-ID nur sieben Tage gültig).
Tauri bringt auf dem iPad nichts darüber hinaus, Electron nur am Mac, eine eigene iPad-App (SwiftUI, PencilKit, Metal)
hätte die beste Stiftbedienung, müsste aber die ganze Spielszene nachbauen.

**Vergleich:** Kein Profi-Vektorprogramm unterstützt das Bearbeiten auf dem iPad im Browser offiziell (Figma nein,
Penpot ohne Touch-Modell, Rive nein); tldraw und Excalidraw zeigen, wie es geht: **Stift ist das Werkzeug, zwei Finger
schwenken und zoomen, ein Finger wird im Stiftmodus ignoriert.** Dieses Modell bauen wir selbst.

### 3.4 Ebenen in Ebenen: das bessere Modell

Die Profi-Programme verschachteln alle: Illustrator mit Ebenen, Unterebenen und Gruppen, Photoshop mit Gruppen und
Smartobjekten, Affinity am direktesten (jedes Objekt kann Kinder haben, etwa ein Bild in einer Vektorform). Für unsere
Welt gibt es drei Bauweisen:

| Modell | Vorteil | Nachteil |
|---|---|---|
| (a) Tiefenebenen, die je einen 2D-Stapel enthalten (Florians Vorschlag) | vertraut wie Illustrator-Ebenen, Freilegen durch Ebenenverschiebung ergibt sich von selbst | Tiefen sind starr; was über mehrere Tiefen reicht (Portal aus Rand, Innenwand, Rückwand), zerfällt |
| (b) flache Liste, jedes Objekt mit eigener Tiefe | passt zur Perspektivkamera und zum heutigen Format, einfach | keine Gruppen, Masken, Booleschen Operationen; viele Objekte ohne Ordnung |
| (c) Baugruppen mit Tiefen relativ zueinander | ein Portal bleibt beisammen, Vorlagen werden wiederverwendbar | Instanzen brauchen Änderungen je Kopie; SVG kennt keine Instanzen |

**Empfehlung: Florians Ebenen als Bedienung, darunter ein Knotenbaum, in dem jeder Knoten eine Tiefe relativ zu seinem
Elternteil hat** (wie Figmas Dokumentbaum, ergänzt um die Tiefe). Florian sieht und bedient Ebenen mit Schichten, genau
wie er es beschrieben hat. Weil aber jede Ebene, Gruppe und Form eine Tiefe relativ zu ihrem Elternteil trägt, kann
eine **Baugruppe** mehrere Ebenen enthalten (das Portal), eine einzelne Fläche lässt sich ein Stück **nach hinten
lösen**, ohne die Ebene zu verlassen, und **Freilegen** ist nur eine Tiefenänderung eines Knotens. Raymans Engine
hatte genau dafür die „MetaFrise“: Boden, Gitter vorn und hinten und Dach mit festen Abständen als ein Teil, das
Muster des Tunnelportals. **Schnittmaske** ist eine Eigenschaft einer Gruppe. **Verläufe und Effekte** brauchen keine
eigenen Unterebenen, sie stecken im Füllstapel der Fläche (3.1). Damit bleibt die Verschachtelung flach: Zone →
Ebene oder Baugruppe → Schichten (Form, Bild, Saum, Gruppe) → Flächen mit Füllstapel.

## 4. Der Editor (Soll-Bild)

### 4.1 Begriffe

| Begriff | Bedeutung |
|---|---|
| **Zone** | eine Datei, alles darin: Ebenen, Baugruppen, Palette, Stile, Licht, Kamera, Spielobjekte, Felder |
| **Ebene** | eine Fläche im Raum, parallel zum Bild, mit Tiefe (Meter), Rolle, Ebenenstapel und Schichten |
| **Schicht** | Inhalt einer Ebene in Zeichenreihenfolge: Form, Bild, Saum oder Gruppe; kann an der Schicht darunter beschnitten sein (Schnittmaske) |
| **Form** | ein Vektornetz aus Ankern und Kurven; die Linien teilen es in **Flächen** |
| **Fläche** | ein geschlossenes Stück einer Form mit Material (fest, grabbar, luftig, frei) und Füllstapel |
| **Füllstapel** | was eine Fläche zeigt, von unten nach oben: Farbe, Verlauf, Bänder, Farbnebel, Innenschatten, Textur, Pünktchen, Lichtkante; jede Füllung mit Mischmodus und Deckkraft; dazu die Kantenwelle, die die Kontur selbst „gemalt“ unregelmäßig macht |
| **Stil** | ein gespeicherter Füllstapel mit Namen, verknüpft oder als Kopie (wie ein Ebenenstil) |
| **Palette** | benannte Farben der Zone; Füllungen verweisen darauf, Looks tauschen sie |
| **Saum** | ein gemalter Streifen entlang einer Kante (Gras, Fels, Schnee, Wurzel) |
| **Baugruppe** | mehrere Ebenen mit festen Abständen als ein Teil (Portal, Baum, Höhlensatz); Vorlage und Instanzen |
| **Portal** | eine Baugruppe mit Öffnung, die an eine Ebene geheftet wird und dort ein Loch schneidet |
| **Malvorlage** | Export einer Fläche oder Ebene als Bild in der richtigen Größe mit Fingerabdruck, als Grundlage zum Malen |

### 4.2 Bildschirm und Bedienung

Ein Bildschirm für Mac und iPad, quer. **Platzhalter:** das genaue Aussehen. **System:** die Aufteilung und die
Grundsätze.

- **Mitte:** das Spielbild, gerendert vom Spielrenderer, in der Spielkamera. Griffe und Pfade liegen als scharfe
  Überlagerung darüber.
- **Links:** eine schmale Werkzeugleiste (Abschnitt 4.3).
- **Rechts oben:** der Farbknopf mit der aktuellen Farbe. Antippen öffnet das Farbmenü: Scheibe, Klassisch, Harmonie,
  Werte, Paletten, zuletzt benutzt, Zonenpalette, dazu die Reiter Verläufe, Stile, Texturen und Pünktchen. Alles darin
  lässt sich auf das Bild ziehen: auf eine Fläche (füllt), auf einen Verlaufsstopp (färbt ihn), auf eine Ebene in der
  Liste (Ebenenstapel).
- **Rechts:** die Ebenenliste mit Vorschaubildern, Namen, Sichtbarkeit, Sperre und Rollen-Zeichen; zwischen zwei Zeilen
  eine Pille mit dem Abstand („2,0 m“), ziehbar und antippbar; daneben die Tiefenleiste. Eine Ebene aufklappen zeigt
  ihre Schichten mit Schnittmasken-Pfeil.
- **Unten:** eine Kontextleiste für die Auswahl. Für eine Fläche: Füllstapel als kleine Liste, Material, Stil kopieren
  und einfügen, „Nach hinten lösen“. Für eine Ebene: Rolle, Ebenenstapel, Isolieren, „sichtbar ab Stufe“.
- **Kamera:** das Panel aus der Kamerasession (Neigung, Bildwinkel, Voreinstellungen) und die Ansichten Spielblick,
  Frontal, Seite und Frei.

Grundsätze:
1. **Am Objekt statt im Dialog:** Verlauf, Abstand, Größe, Winkel werden am Objekt gezogen; Zahlen nur auf Wunsch.
2. **Ziehen und fallen lassen:** Farbe, Verlauf, Stil, Textur, Pünktchen, Bild: alles wird aus dem Menü auf das Ziel
   gezogen. Mit der Maus gilt dasselbe.
3. **Pencil zeichnet, Finger bewegen:** Auf dem iPad zeichnet und bearbeitet der Pencil, zwei Finger schwenken und
   zoomen, ein einzelner Finger wird ignoriert, sobald ein Stift im Spiel ist (wie tldraw und Excalidraw; iPadOS schickt
   ohnehin keine Fingerereignisse, solange der Stift aufliegt). Ein Schalter erlaubt das Zeichnen mit dem Finger. Langes
   Halten mit dem Finger ist die Pipette. Beim Ziehen von Ankern zeigt eine Lupe die Stelle unter Stift oder Finger.
4. **Gesten wie Procreate:** zwei Finger tippen = rückgängig, drei Finger tippen = wiederholen, zwei Finger ziehen und
   spreizen = Kamera.
5. **Tasten wie Illustrator** am Mac und mit iPad-Tastatur (Abschnitt 4.3). Ohne Tastatur ersetzt ein Knopf am Rand die
   Umschalt- und Wahltaste (wie Affinitys Command Controller).
6. **Ruhige Oberfläche:** Der Editor ist ein Werkzeug, **so minimalistisch und ruhig wie möglich** (Florian,
   27.10.2026): neutral und dunkel, wenige sichtbare Knöpfe, Bedienfelder nur, solange sie gebraucht werden; der
   „Baustellen-Brutalismus“ bleibt der Spiel-Oberfläche vorbehalten (Entscheidung A6).

### 4.3 Werkzeuge

| Werkzeug | Taste | iPad | was es tut |
|---|---|---|---|
| Auswahl | V | Pencil tippen und ziehen | Form, Schicht oder Gruppe wählen, verschieben, skalieren (breiter, höher, mit Umschalt gleichmäßig), drehen, spiegeln |
| Direktauswahl | A | Pencil auf einen Anker | Anker und Griffe bearbeiten, Anker hinzufügen (auf die Linie tippen), löschen, Ecke oder Kurve |
| Zeichenstift | P | Pencil | Kontur mit Ankern zeichnen; tippen gibt eine Ecke, ziehen eine Kurve; eine Linie von Kante zu Kante unterteilt die Form |
| Kurvenstift | Shift+P | Pencil oder Finger tippen | wie Illustrators Kurvenzeichner: jedes Tippen setzt einen Punkt, die Kurve läuft glatt hindurch, ohne Griffe; doppelt tippen wechselt Ecke und Rundung |
| Formpinsel | B | Pencil | freihand einen Umriss oder eine Teilungslinie ziehen, wird zur glatten Kurve mit wenigen Ankern |
| Band | O | Pencil an einer Kante ziehen | ein Kantenstück (etwa die Oberkante) oder einen Lochrand nach innen versetzen; daraus wird eine eigene Fläche, wie das helle Randband und der Höhlenrand in Bild 2 |
| Grundformen | U | Pencil ziehen | Ellipse, Rechteck, Bogen (Portalform) |
| Messer | K | Pencil quer ziehen | Fläche entlang des Strichs teilen |
| Verlauf | G | Pencil über die Fläche ziehen | Verlauf anlegen oder ändern, Stopps verschieben, Farben auf Stopps ziehen |
| Farbnebel | N | Pencil | weiche Farbtupfer in eine Fläche (Freiform-Verlauf) |
| Pipette | I | Finger halten | Farbe aufnehmen; mit Wahltaste den ganzen Stil |
| Hand und Kamera | Leertaste | zwei Finger | schwenken, zoomen; in der Ansicht Frei umkreisen |
| Bahn | T | Pencil | Probebahn zeichnen wie im Spiel, danach Testfahrt |

Dazu die üblichen Befehle: Kopieren, Einfügen, an Ort einfügen (auch in eine andere Ebene, „Bild halten“), Duplizieren,
Gruppieren, Schnittmaske (Cmd+7), Vereinen, Abziehen, Schnittmenge, Pfad vereinfachen, Kontur in Fläche, nach vorn und
hinten in der Ebene, auf eine andere Ebene schieben. Einrasten an Ankern, Kanten, Raster und **im Bild** (eine vordere
Kante rastet dort ein, wo sie im Spielblick an einer hinteren Kante liegt).

### 4.4 Ebenen und Tiefe

- Ebene anlegen (über, unter der aktiven), umbenennen, ein- und ausblenden, sperren, Reihenfolge ziehen; die Tiefe
  folgt der Reihenfolge.
- Abstand: Pille zwischen zwei Zeilen oder Strich in der Tiefenleiste ziehen. Alles dahinter rückt mit (Befund 1);
  „Bild halten“ als Standard, „Welt halten“ umschaltbar.
- Isolieren: nur die aktive Ebene zeigen, oder die Ebenen davor durchsichtig.
- Rolle je Ebene (spielbar, Kulisse, Vordergrund, Luft) mit Vorbelegung nach Lage im Stapel.
- Ebenenstapel: Verlauf über die ganze Ebene mit Mischmodus, Luftperspektive nach Tiefe, Textur.
- „Sichtbar ab Fortschrittsstufe“ und Lage je Fortschrittsstufe für Fortschritt und Freilegen (gebaut in Stufe 8).

### 4.5 Formen und Flächen

- Vektornetz: Anker mit Griffen (wie `path.ts` heute), Kanten als kubische Kurven, Flächen werden aus den Kanten
  gefunden. Eine geschlossene Linie in einer Fläche macht ein Loch oder eine Insel; eine Linie von Kante zu Kante teilt.
- Füllungen hängen an Flächen und bleiben beim Bearbeiten an „ihrer“ Fläche (über einen Punkt im Inneren und die
  Überdeckung).
- Material je Fläche: fest, grabbar, luftig, frei.
- „Nach hinten lösen“: Die Fläche rückt ein Stück hinter ihre Nachbarn (sie bleibt in ihrer Ebene und bekommt eine
  eigene Tiefe), mit Unterfütterung gegen Spalten.
- Grundformen, Formpinsel, Messer, Boolesche Operationen, Vereinfachen.

### 4.6 Farbe, Verläufe, Füllstapel, Stile

- Farbmenü oben rechts (4.2); zuletzt benutzte Farben; Harmonie-Vorschläge; Zonenpalette mit Namen.
- **ColorDrop:** Farbe auf eine Fläche ziehen. Fällt sie auf eine Fläche mit Verlauf, fragt eine kleine Leiste:
  Grundfarbe ersetzen oder als Verlaufsstopp.
- **Verlauf:** linear oder radial, über die Fläche gezogen (Winkel rastet beim Ziehen in 45°-Schritten ein, mit
  Umschalten frei); Stopps auf der Linie; ein Verlauf kann mehrere Flächen überspannen (gemeinsamer Verlauf in
  Ebenenkoordinaten); als Sonderform ein **Deckkraftverlauf** (Fläche läuft durchsichtig aus, für Nebel, Licht und
  weiche Übergänge, wie Affinitys Transparenzwerkzeug).
- **Weiter füllen:** Nach dem Fallenlassen einer Farbe füllt jedes weitere Antippen die nächste Fläche mit derselben
  Farbe; Ziehen über mehrere Flächen füllt alle (Figma).
- **Füllstapel:** jede Füllung mit Mischmodus (Normal, Multiplizieren, Negativ multiplizieren, Ineinanderkopieren,
  Weiches Licht, Farbe) und Deckkraft. Deckkraft durch waagrechtes Ziehen auf der Zeile, Mischmodus über ein Buchstaben-
  Feld wie das „N“ in Procreate.
- **Stile:** Stil kopieren und einfügen; als Stil sichern; Stil aus der Bibliothek auf eine Fläche ziehen; verknüpfte
  Stile ändern alle Flächen; Pipette mit Wahltaste nimmt den ganzen Stil.
- **Looks:** Tag, Abend, Nacht als Palettentausch je Fortschrittsstufe (Paket 2, Paket 0 Regel 9).

### 4.7 Earle-Schichten

Die Technik steht in 3.2. Im Editor sind es Füllungen wie Farbe und Verlauf: aus dem Farbmenü (Reiter Texturen und
Pünktchen) auf eine Fläche ziehen, im Füllstapel umstellen, mit Stil kopieren.

- **Knopf „Earle“** an der Fläche, der Ebene oder der ganzen Zone: wählt je Fläche ein Preset (Hügel, Fels, Wiese,
  Krone, Wasser) nach Material und Lage, legt Textur, Pünktchen, Lichtkante und bei Hügeln Bänder an und leitet Dichte,
  Punktfarbe und Punktgröße aus Licht, Verlauf und Tiefe ab. Danach bleibt alles einzeln änderbar.
- **Licht der Zone:** ein Griff im Bild (Sonne) für Richtung und Höhe; Lichtkante, Innenschatten und Punktdichte folgen
  sofort. Tag, Abend und Nacht bringen ihr eigenes Licht mit.
- **Pünktchen:** Dichte und Größe am Objekt ändern (ziehen auf der Zeile im Füllstapel), Quelle wählen: Schatten,
  Lichtkante oder Verlauf. Mit einem **Punktpinsel** lassen sich Punkte bewusst setzen oder wegnehmen (Earles Reihen
  entlang von Graten).
- **Punktkrone:** eigenes Werkzeug für Bäume (Bild 6): Kronenform zeichnen, Knopf füllt sie mit echten Punkten,
  Farbe nach Licht, in der Tiefe gestaffelt, mit Wind.
- **Gouache und Papier:** wenige gescannte Kacheln; **Florian scannt oder fotografiert sein Papier und seine Gouache**
  (Aufgabe für ihn, parallel zu Stufe 4).
- **Kantenwelle:** macht die Kontur unregelmäßig wie gemalt; wird beim Kompilieren in die Kontur gebacken.
- **Funkeln** (Paket 0.3): als Schicht nur für Wasser, Schnee, Kristalle und Coins.
- **Kosten sichtbar:** Jede Schicht zeigt in der Leistungsanzeige, was sie kostet; am Tor S5 wird je Schicht am Handy
  gemessen.

### 4.8 Bilder, Schnittmasken, Säume

- **Bildschicht:** PNG oder WebP mit Alphakanal in eine Ebene ziehen; verschieben und skalieren wie eine Form. Ein Bild
  kann auch eine Füllung im Füllstapel sein (wie in Figma), dann sitzt es genau in der Fläche.
- **Schnittmaske:** eine Bildschicht auf den Namen einer Form in der Liste ziehen (wie in Affinity) oder Cmd+7; das Bild
  ist nur innerhalb der Form zu sehen. Im Spiel liegt das Bild als Textur auf der Form; keine Schablone, kein eigener
  Draw Call. Die Earle-Schichten (Textur, Pünktchen, Lichtkante, Luftperspektive) wirken auch auf Bilder, damit Gemaltes
  und Vektorflächen zusammenpassen.
- **Saum:** einen gemalten Streifen (etwa `grass_rim_trim.png`) auf eine Kante ziehen; er folgt der Kante, auch wenn
  die Form sich ändert. Nach UbiArt und Unitys Sprite Shape: Fülltextur der Fläche plus Kantentexturen je Winkelbereich
  (oben Gras, an steilen Stellen Fels, unten Wurzeln), Breite und Versatz am Objekt ziehbar.
- **Umriss aus Bild** (`trace.ts`): ein gemaltes Teil wird zur Form mit seinem Umriss; danach ist es eine Form mit
  Bildfüllung und lässt sich wie jede Form bearbeiten.
- **Auflösung:** Der Editor zeigt je Bild, ob es für Tiefe und größten Zoom scharf genug ist.

### 4.9 Spiel im Editor

Ziel: Jede Form wird sofort mit Bahn, Stützen und Fahrt geprüft, im selben Bild, das das Handy zeigt.

- **Tiefe aus Ebenen:** Der Pinsel liest die Tiefe aus den spielbaren Ebenen, mit dem Modus „Ebenen: Bodenhöhe“ aus der
  Kamerasession als Ausgangspunkt (Florians Urteil vom 26.10.2026: „fühlt sich nicht schlecht an, daran können wir
  weiterarbeiten“). Nur Andockkanten zählen als Boden; Kulisse, Vordergrund und Luft zählen nicht. Der Strich bleibt im
  Bild genau dort, wo er gezogen wurde.
- **Freiraumfeld aus Flächen:** fest und grabbar sind fest, luftig und frei sind frei; die Dicke einer Ebene reicht bis
  zur nächsten Ebene dahinter oder bis zu einer eingestellten Tiefe.
- **Stützen** stehen auf Andockkanten der Ebenen davor (wie `SliceFoundation` in der Kamerasession), nie in Festem.
- **Portale und Tunnel:**
  1. **Portal-Vorlage** als Baugruppe: Öffnung (schneidet das Loch), Rahmen auf der Ebene, Innenwand kurz dahinter,
     Dunkel weiter hinten; dazu Regeln: Größe zur Spurweite, aufrecht oder der Bahn folgend, wie tief die hinteren
     Teile höchstens reichen dürfen.
  2. **Portal-Werkstatt:** eine Probebahn taucht an einer frei wählbaren Stelle, Ebene und Neigung ab; Florian sieht
     das Portal dort und bearbeitet seine Formen direkt.
  3. **Beim Zeichnen:** Taucht die Bahn in eine grabbare Fläche ab, setzt der Pinsel an der Kreuzung ein Portal, führt
     die Bahn durch die Öffnung nach hinten und hält sie verdeckt; wo sie wieder auftaucht, setzt er den Ausgang.
     Verdeckt darf die Bahn die Tiefe wechseln, solange davor Festes liegt.
  4. **Feste Öffnungen und Baustellen** werden von Hand mit derselben Vorlage gesetzt (für feste Flächen, Rätsel und
     Durchbruch).
  5. Das Loch wird beim Setzen in die Flächen der Ebene geschnitten (Abschnitt 5.3).
- **Spielobjekte** aus dem Klötzchen-Editor: Station mit Vorgabestück, Schlange, Felder mit Kamerabegrenzung und
  Rahmen für Hoch- und Querformat, Ziele, Fortschritts- und Aufwertungsstufe, Schalter, Coin-Gruppen, Baustellen,
  Testfahrt. Sie stehen auf Andockkanten einer Ebene statt auf einer Spur.
- **Prüfungen im Bild:** Andockkanten (grün), feste und grabbare Flächen (Schraffur), Durchblick (wo eine verdeckte Bahn
  sichtbar würde), Details unter 3 px am Handy, Leistung (4.11).

### 4.10 Austausch

- **SVG ist Austauschformat, nie die Quelle.** Die Quelle ist die Zonendatei (JSON); Tiefe, Dicke, Rolle, Material und
  Füllstapel bleiben dort und werden über stabile Kennungen zugeordnet (so arbeitet `svg.ts` schon). Kennungen nur nach
  dem Muster `[a-z][a-z0-9-]*`, weil Illustrator andere umschreibt (unsicher).
- **SVG-Export** je Ebene, je Auswahl oder der ganze Stapel als Gruppen von hinten nach vorn: Formen, Vollton, lineare
  und radiale Verläufe, Schnittpfade genau; Mischmodi als `mix-blend-mode` (Illustrator setzt sie teils auf Normal
  zurück); Pünktchen, Textur, Farbnebel, Bänder und Lichtkante gehen nicht in SVG, sie reisen als Daten in der
  Zonendatei und als gerendertes Bild mit.
- **Illustrator-Rückreise:** Illustrator macht aus obersten Gruppen keine Ebenen, sondern Gruppen in „Ebene 1“ (per
  Markup nicht steuerbar; Abhilfe in Illustrator „Auf Ebenen verteilen“ oder ein kleines Skript). Zurück in den Editor
  mit **Exportieren als › SVG** (Stil: Präsentationsattribute, Schrift in Pfade, Bilder verknüpfen, Objekt-IDs:
  Ebenennamen, 3 bis 4 Dezimalstellen, Minimieren und Responsiv aus). **Nicht** „Speichern unter“ mit „Illustrator-
  Bearbeitungsfunktionen beibehalten“: Das bettet eine private Kopie ein, die Illustrator beim nächsten Öffnen statt
  unserer Änderungen lädt; der Import warnt davor und entfernt sie. Am Mac geht auch Kopieren in Illustrator (mit
  „SVG-Code einschließen“) und Einfügen im Editor.
- **Malvorlage** für gemalte Teile: je Fläche oder Ebene ein PNG mit Alphakanal in der Zielgröße (aus Tiefe und größtem
  Zoom), dazu eine SVG mit Schnittpfad und Bild (wird in Illustrator eine Schnittgruppe) und eine kleine Begleitdatei
  mit Lage, Tiefe und Fingerabdruck der Form. Florian malt darauf in Procreate oder Photoshop; der Import setzt das Bild
  über die Begleitdatei passgenau ein und warnt, wenn die Form sich seitdem geändert hat.
- **Bilder hinein:** PNG und WebP per Ziehen oder Auswahl; auf dem iPad aus „Dateien“ oder Fotos. PSD-Import mit
  Ebenen aus Procreate ist eine Option für Stufe 6 (Entscheidung B6).
- **Für Paket 8b:** Jeder Teile-Auftrag bekommt Malvorlage und SVG der Form als Vorgabe; die Prüfung „passt es genau“
  vergleicht das Ergebnis mit dieser Form.

### 4.11 Leistung

- **Kompilieren:** Der Editor arbeitet auf Kurven, Füllstapeln und Bildern; das Spiel lädt ein vorbereitetes Paket:
  Dreiecke je Ebene zusammengefasst, Füllstapel in einer Datentextur, Bilder im Atlas (KTX2), Kanten für Pinsel und
  Stützen als vereinfachte Linien. Der Editor kompiliert geänderte Ebenen laufend, der Build alle.
- **Budget** wie Richtlinie 12: unter 150 Draw Calls im vollsten Feld, DPR höchstens 2, Shadow Map 1024². Ziel für die
  Ebenen: der ganze Stapel eines Felds in höchstens etwa zehn Draw Calls (die Kamerasession brauchte einen für 32
  Scheiben).
- **Anzeige im Editor:** Draw Calls, Dreiecke, Texturspeicher, geschätzte Kosten je Pixel (wie viele Schichten mit
  Textur und Pünktchen übereinander), Bildrate.
- **Handy-Test:** ein Knopf zeigt Link und QR-Code; das Handy öffnet die Zone im Spiel und lädt bei jedem Speichern neu
  (wie heute über `tc:zone`). Gemessen wird am Handy, nicht am Mac.

## 5. Technik

### 5.1 Aufbau

- **Eine zweite Seite im Projekt** (`editor.html`), derselbe Vite-Build, derselbe Weltrenderer (`src/world/`), dieselbe
  Zonendatei, derselbe Pinsel und dieselbe Physik. Was der Editor zeigt, zeigt das Handy.
- **Oberfläche in HTML und CSS**, nicht in Pixi: Listen, Menüs, Zahleneingaben, Ziehen und Fallenlassen und Touch sind
  dort fertig. Pixi bleibt das HUD des Spiels.
- **Griffe und Pfade** als SVG-Überlagerung über dem Spielbild, aus der Kamera projiziert; Treffen und Ziehen über den
  Strahl auf die aktive Ebene (`rayToWorld`, wie im Klötzchen-Editor).
- **Eingabe:** Pointer Events nach dem Modell aus 3.3, Tastenkürzel nach Illustrator.
- **Zustand:** unveränderlich mit Immer-Patches, eine Transaktion je Geste (vom Aufsetzen bis zum Abheben), die
  Vorschau läuft außerhalb des Verlaufs; Bilder nur als Verweis. Die Patches dienen auch der Autosicherung in IndexedDB.
- **Kompilieren** („Kochen“, wie UbiArt Editordaten fürs Spiel kocht): aus der Quelle wird ein Spielpaket je Zone
  (Binärdatei mit Positionen, Form-Kennungen und Dreiecken; Stil-Datentextur; Verlaufsatlas; Kantenabstands-Atlas;
  Bildatlas; vereinfachte Kanten für Pinsel, Freiraumfeld und Stützen). Im Editor laufend für geänderte Ebenen in einem
  Hintergrund-Thread, im Build für alle.
- **Übergang:** Der Editor liest Zonendateien der Version 1 (Klötzchen und Körper) und schreibt Version 2; das Spiel
  liest beide, bis alle Zonen umgestellt sind.

### 5.2 Datenmodell (Skizze; wird in Stufe 1 festgelegt)

```ts
interface ZoneV2 {
  version: 2;
  name: string;
  camera: { tilt: number; fov: number };                     // Entscheidung B5
  light: { angle: number; elevation: number; color: string; shade: string };
  palette: { id: string; name: string; color: string }[];   // Looks tauschen Einträge
  styles: { id: string; name: string; fills: Fill[] }[];    // verknüpfte Stile
  nodes: ZoneNode[];                                         // ein Baum über parent und order
  templates: string[];                                       // Baugruppen (Portale, Bäume) als eigene Dateien
  game: unknown;                                             // Stationen, Felder, Schlangen, Baustellen, Coins … aus Version 1
}

interface ZoneNode {
  id: string;
  parent: string | null;
  order: string;                                             // Bruchindex wie in Figma: Umsortieren ohne Umnummerieren
  kind: 'plane' | 'assembly' | 'group' | 'shape' | 'image' | 'rim';
  x: number; y: number; z: number;                           // relativ zum Elternteil, Meter
  scale?: [number, number]; rotation?: number; hidden?: boolean; locked?: boolean;
  // plane: role, visibleFrom, planeFills · assembly: template, overrides · group: clip
  // shape: network { anchors, edges }, faces [{ seed, material, fills | style }], dockEdges
  // image: src, frame · rim: shape, edgeRange, src, width, offset
}

interface Fill {
  type: 'color' | 'gradient' | 'opacity' | 'bands' | 'mist' | 'innerShadow' | 'texture' | 'dots' | 'rimLight' | 'image';
  blend: 'normal' | 'multiply' | 'screen' | 'overlay' | 'softLight' | 'colorDodge' | 'color';
  opacity: number;
  // je Typ: Farben als Palettenverweis oder Wert, Stopps und Griffe in Ebenenkoordinaten, Dichte, Größe, Samen …
}
```

### 5.3 Renderer

- **Ein Ebenen-Material** (3.2): Form-Kennung als Vertex-Attribut, die Stilzeile liest der Vertex-Shader aus der
  Datentextur und reicht sie als feste Werte weiter; Verzweigungen je Form sind dadurch billig.
- **Draw Calls nach Gruppen:** nah (empfängt Schatten), fern, Kronenpunkte, wenige Durchsichtige (Nebel, Licht); zusammen
  etwa drei bis sechs für den ganzen Stapel (Kamerasession: einer für 32 Scheiben).
- **Undurchsichtig und ohne `discard`**; die Formen einer Ebene werden beim Kompilieren überlappungsfrei zerlegt, damit
  nichts im Tiefenpuffer flackert; die Zeichenreihenfolge innerhalb der Ebene kostet so zur Laufzeit nichts.
- **Bilder** als Textur auf ihrer Form; die Schnittmaske ist die Geometrie selbst.
- **Portallöcher:** Beim Setzen eines Portals werden die betroffenen Flächen der Ebene neu geschnitten (Clipper2) und
  trianguliert, nur beim Loslassen und in wenigen Millisekunden; während des Zeichnens zeigt eine Vorschau das Loch.
  Rückfall, falls das zu langsam ist: eine Lochmaske je Ebene.
- **Zeichnen auf dem iPad:** Der Freihandstrich läuft in einer leichten Überlagerung; die 3D-Szene rendert dabei nicht bei
  jedem Stiftereignis neu.

### 5.4 Bibliotheken (Vorschlag, je Stufe geprüft)

| Aufgabe | Vorschlag | Lizenz | Stand |
|---|---|---|---|
| Boolesche Operationen mit Kurven, Teilflächen, „Farbeimer“ | PathBool.js (`path-bool`, mit Division, Fracture und atomaren Regionen) | MIT | aktiv, 1.0 seit 06/2026, sieben bekannte Fehlfälle; Rückfall paper.js 0.16 (MIT, groß, Booleans über planaren Graphen) |
| Polygone, Versatz (Band, Saum, Portalschnitt) | `clipper2-ts` | BSL-1.0 | aktiv |
| Triangulierung | earcut (steckt in Three) | ISC | aktiv, winzig |
| Bézier-Mathematik | bezier-js | MIT | ruht, stabil |
| SVG-Pfadsyntax | eigenes `svg.ts`, für Randfälle `svg-pathdata` | MIT | aktiv |
| Kantenabstand | Distanztransformation wie Mapbox `tiny-sdf` im Hintergrund-Thread | BSD-2 | aktiv |
| Umriss aus Bild | eigenes `trace.ts`; für farbige Vorlagen `vtracer` (WASM) | MIT/Apache | Alpha; Potrace-Portierungen sind GPL, meiden |
| Freihandstriche | perfect-freehand | MIT | klein |
| Farbwähler | eigener Wähler mit `culori` (Farbräume, OKLab) | MIT | aktiv |
| Rückgängig | Immer mit Patches | MIT | aktiv |

### 5.5 Zugang und Prüfungen

- Dev-Server mit HTTPS (A7), Autosicherung in IndexedDB, Kennungen werden hochgezählt (keine Funktion, die einen sicheren
  Kontext braucht).
- Tests: Vitest für Geometrie (Vektornetz, Flächen, Boolesche Operationen, Versatz, SVG-Rundlauf, Malvorlage),
  Kompilieren (gleiche Quelle gibt gleiches Paket), Standbild-Szenarien mit Playwright je Stufe, Replay der Striche
  bleibt grün, Handy-Messung an jedem Tor.

## 6. Umsetzung in Stufen mit Toren

Wie im großen Plan: kein Kalender, eine Reihenfolge mit Toren; Umfang grob als S, M, L. Jede Stufe endet mit
`npm test`, `npm run build`, dem Replay der aufgenommenen Striche und einem Standbild-Szenario; jedes Tor hat dieselben
vier Prüfungen wie in Paket 10 (Handy-Messung, Replay grün, Standbilder vom Handy, Florians Freigabe nach eigenem
Arbeiten am Mac **und am iPad**). Florian bedient den Editor an jedem Tor selbst.

**Stufe 0: Vorbereitung (S, ohne Tor).** Den halbfertigen Stand von Etappe 2 auf ihrem Branch sichern (nur mit Florians
OK; laut der Session 287 Tests grün, offen sind dort die Raumwand, die in der Perspektive über den Bogen lugt, die
Prüfung der Stufen und die Replays), einen Branch `zoneneditor` von `etappe-2-bahn-und-welt` anlegen und
`test-kamerawinkel` hineinholen (beide Stände ändern den Pinsel; das Zusammenführen ist die eigentliche Arbeit dieser
Stufe, mit Replay als Prüfung); Dev-Server mit HTTPS für das iPad; als Startmaterial die Zone `ebenen` (Szene 06 aus
gemalten Körpern) und die Scheiben-Zone der Kamerasession. Entscheidung A5.
**Stand 27.10.2026: gebaut.** Der Stand von Etappe 2 ist als `b30bb71` auf `etappe-2-bahn-und-welt` gesichert (lokal,
287 Tests grün). Der Branch `zoneneditor` (Worktree `.claude/worktrees/zoneneditor`) entstand aus diesem Stand plus
`test-kamerawinkel`; das Zusammenführen lief ohne Konflikte. Typprüfung sauber, 300 Tests grün, Build grün. Replay
`--world` aller 475 Pinsel-Striche: 174 Fahrten geschafft, 13.525 Stützen, Abstand Bahn–Strich im Median 2,1 px, genau
wie `test-kamerawinkel` (Etappe 2 allein: 170, 13.460, 2,0 px; der Unterschied kommt aus den Pinsel-Änderungen der
Kamerasession). In der Zone `ebenen` 181 von 475 wie Etappe 2, in der Zone `scheiben` 181 von 475 und 14.522 Stützen
genau wie die Kamerasession.
**HTTPS (A7):** `scripts/https-cert.sh` legt mit OpenSSL eine eigene kleine Zertifizierungsstelle und ein
Server-Zertifikat für `localhost`, `MacBook-Pro-von-Florian.local` und die WLAN-Adresse an, im Ordner `.certs` des
Haupt-Checkouts (nicht im Repository, gilt für alle Worktrees). Das ersetzt `vite-plugin-mkcert`: Es wird kein Programm
heruntergeladen, und am Mac ändert sich keine Sicherheitseinstellung; vertraut wird der Stelle nur auf dem iPad. Die
Stelle darf nur lokale Namen und Heimnetz-Adressen bestätigen, ihr Schlüssel bleibt auf dem Mac. `npm run dev:https`
startet den Dev-Server auf `https://MacBook-Pro-von-Florian.local:5180/`, `/__tc-ca.pem` liefert die Stelle zum
Installieren aus. Geprüft mit `curl` gegen alle drei Adressen; ohne Profil wird die Verbindung abgelehnt. Striche aus
Dev-Servern in Worktrees landen jetzt in `recordings/strokes.jsonl` des Haupt-Checkouts, wo das Replay sie sucht.
**Offen:** Florian installiert das Profil auf dem iPad und öffnet die Seite dort (am Mac genügt `http://localhost`).
Vor einem Push klären: Die Zone `ebenen` enthält acht WebP-Bilder aus dem Parallax-Baukasten unter `refs/`, und `refs/`
ist laut `.gitignore` bewusst nicht im öffentlichen Repository.

**Stufe 1: Gerüst, Ebenen, Kamera (M).** Editor-Seite im selben Projekt mit dem Spielrenderer in der Mitte und der
Oberfläche aus 4.2; Ebenen anlegen, ordnen, ein- und ausblenden, sperren; Abstandspillen und Tiefenleiste mit „Bild
halten“; Kamera-Panel und Ansichten; Isolieren; Grundformen mit Auswahlwerkzeug, damit es etwas zu sehen gibt;
Rückgängig, Wiederholen, Sichern über den Dev-Server, Autosicherung; Pencil zeichnet, Finger bewegen. Platzhalter:
Aussehen der Oberfläche, Farben der Grundformen. **Tor S1:** Florian legt am Mac und am iPad acht Ebenen mit
Grundformen an, stellt Abstände ein, navigiert und speichert; das Handy zeigt die Zone; 60 fps am Handy mit 30 Ebenen.
**Stand 27.10.2026: gebaut, wartet auf Tor S1** (Technik in `docs/TECH.md` 4i). Aufruf `?zone=<name>&editor=2`; der
Editor hängt sich wie der Klötzchen-Editor in die Level-Szene (statt einer eigenen Seite `editor.html`), so nutzt er
Weltrenderer, Spielkamera und später Pinsel und Fahrt ohne zweite Kopie. Gebaut: Ebenen in `zone.nodes` der
Zonendatei; Ebenenliste mit Vorschau, Umbenennen per Doppeltippen, Ein- und Ausblenden, Sperren, Rolle, Löschen;
Abstandspillen (ziehen oder Zahl tippen, alles dahinter rückt mit), Tiefenleiste (eine Ebene allein schieben), „Bild
halten“ und „Welt halten“; Ansichten Spielblick, Frontal, Frei, Seite; Neigung und Bildwinkel als Regler im Feld
„Kamera“ (dieselben Werte wie das Kamera-Panel der Kamerasession); Isolieren (alle, davor aus, nur diese); Rechteck und
Ellipse aufziehen oder antippen, Auswahl mit Rahmen und acht Griffen (verschieben, breiter, höher, mit Umschalt
gleichmäßig), Duplizieren, Reihenfolge, Löschen, Platzhalter-Farben; Rückgängig und Wiederholen (Cmd+Z, zwei und drei
Finger), Sichern (Cmd+S), Sicherungskopie im Browser mit Wiederherstellen, Neuladen bei Änderungen von außen; Stift und
Finger wie geplant; Messzeile (Ebenen, Formen, Dreiecke, Draw Calls der Welt, fps); im Spiel ohne Editor dieselben
Ebenen und kein flacher Boden. Geprüft: 316 Tests grün (16 neue), Build grün, Replay unverändert (174 von 475, 13.525
Stützen, 2,1 px), Szenario 11 mit 7 Prüfungen grün (32 Ebenen mit 36 Formen und 4.632 Dreiecken in einem Mesh, 28
Draw Calls gesamt, „Bild halten“ mit 0,0000 px Abweichung), im Browser Verschieben, Ecke ziehen (Gegenecke bleibt auf
0 px), Rückgängig, Sichern und Spielansicht. **Platzhalter:** Aussehen der Oberfläche, Füllfarben, die Probe-Formen.
**Noch nicht:** Zeichenstift und Punktbearbeitung (Stufe 2), die Bahn kennt die Ebenen nicht (Stufe 4, im Modus
„Spielen“ zeichnet sie wie bisher).
**Tor S1 bestanden (Florian, 27.10.2026)** mit einem Befund: In Frontal hatten die Formen keine Farbe und waren weiß.
Ursache: Der Nebel der Welt rechnet mit dem Abstand zur zeichnenden Kamera, und Frontal steht 3000 m vor der Bühne.
Behoben am selben Tag: Frontal bekommt den Nebel je Tiefe wie der Spielblick, Frei und Seite zeigen die reinen Farben
(`WorldRenderer.viewFog`); Szenario 11 misst die Farbe einer Form in Frontal (Abweichung 6 von 255, das Papierkorn).
Dabei gefunden und behoben: Die Leiste unten wurde jede halbe Sekunde neu aufgebaut, ein Tipp konnte ins Leere gehen.

**Stufe 2: Formen (L).** Zeichenstift, Direktauswahl, Formpinsel, Messer, Vektornetz mit Flächen, Löcher, Boolesche
Operationen, Vereinfachen, Einrasten (auch im Bild), Gruppen, Kopieren und Einfügen über Ebenen hinweg, Drehen,
Spiegeln, Ausrichten; Skizze als Pause-Ebene; SVG-Export je Ebene und Stapel, SVG-Import aus Illustrator als Brücke.
Platzhalter: Füllfarben (graue Stufen). **Tor S2:** Florian zeichnet Bild 1 und 2 (Kontur, Unterteilung,
Höhlenöffnung) am iPad mit dem Pencil und am Mac; der SVG-Export öffnet sauber in Illustrator und kommt zurück.

**Stufe 3: Farbe, Verläufe, Stile (M).** Farbmenü, Ziehen und Fallenlassen, Pipette, Verläufe auf der Fläche und über
mehrere Flächen, Füllstapel mit Mischmodi und Deckkraft, Ebenenstapel, Luftperspektive, Zonenpalette, Stile (kopieren,
Bibliothek, verknüpft), Looks als Palettentausch; im Spiel ein gemeinsames Ebenen-Material. **Tor S3:** Bild 3, 4 und
5 im Editor nachgebaut und im Spielblick geprüft; 60 fps am Handy; Florians Urteil über Farbe und Verlauf.

**Stufe 4: Spiel im Editor (L).** Rollen, Material, Andockkanten, Freiraumfeld aus Flächen, Pinsel „Tiefe aus Ebenen“
auf den neuen Ebenen, Stützen auf Kanten, Probebahn und Testfahrt im Editor, Spielobjekte aus dem Klötzchen-Editor,
Feldrahmen, Durchblick-Prüfung, Leistungsanzeige, Handy-Link. Platzhalter: Stützenformen, Figuren. **Tor S4:** Szene
06 „Kathedrale im Fels“ aus dem Parallax-Baukasten in Formen nachgebaut, neben der gemalten Fassung (Zone `ebenen` aus
Etappe 2); Bahn durch die Höhle gezeichnet und gefahren, Stützen auf Kanten; Replay grün; 60 fps am Handy.

**Stufe 5: Earle-Schichten (M).** Licht der Zone, Bänder, Innenschatten (Kantenabstand im Atlas), Textur aus Florians
Scans, Pünktchen mit Rang-Kachel und Punktpinsel, Lichtkante, Kantenwelle, Farbnebel, Funkeln, Punktkronen für Bäume
mit Wind, Knopf „Earle“ mit Presets; die vier Mängel des Test-Shaders behoben; Kosten je Schicht am Handy gemessen.
Platzhalter: alle Presets, Farbregeln und Kacheln bis zur Stilprobe.
**Tor S5:** ein Satz Körper (Wiese, Bogen, Baum) als Standbild vom Handy neben Earles Favoriten (01 rote Scheune, 03
organischer Stamm, 05 Tannenwald) und Florians Bildern 6 bis 8; Florian entscheidet Regel 4 neu (B1).

**Stufe 6: Bilder, Schnittmasken, Säume, Austausch (M).** Bildschichten, Schnittmaske, Saum entlang einer Kante,
Malvorlage mit Fingerabdruck und Größenangabe, Umriss aus Bild, Import gemalter Teile mit Passmarken, KTX2 beim
Kompilieren. **Tor S6:** Florian malt nach einer Malvorlage eine Grasnarbe als Saum und eine gemalte Fläche in
Procreate, setzt beides ein; 60 fps am Handy, Speicher im Rahmen.

**Stufe 7: Portale und Tunnel (L).** Portal-Vorlagen, Portal-Werkstatt, Platzierung beim Zeichnen, Tiefenwechsel durch
die Öffnung, Loch zur Laufzeit, feste Öffnungen und Baustellen mit Vorlagen, Tunnel-Meter. **Tor S7:** Florian zeichnet
am Handy drei Bahnen, die abtauchen und wieder auftauchen; die Portale sehen aus wie in der Werkstatt; nirgends
scheint eine verdeckte Bahn durch; 60 fps.

**Stufe 8: Baugruppen, Fortschritt, Bewegung (M).** Baugruppen mit Vorlage und Instanzen, Fortschrittsstufen
(„sichtbar ab“, Lage je Fortschrittsstufe, Freilegen als Ebenenverschiebung), Looks je Fortschrittsstufe, Bewegung
(Wiegen, Treiben). **Tor S8:** „Mehr Ebenen, gleicher Blick“
(`progression demo/19-vergleich-zwei-drei-fuenf-ebenen.png`) als eine Zone mit drei Fortschrittsstufen am Handy.

Reihenfolge: Erst was Florian zum Formen braucht (S1 bis S3), dann der Beweis, dass die Formen spielbar sind (S4), dann
der Look (S5, S6), dann das schwierigste Spielsystem (S7), zuletzt die Produktion (S8). Wer den Look früher sehen will,
kann S5 vor S4 ziehen (Entscheidung A3). Nach S2 ist der Editor schon als Formwerkzeug mit SVG-Export nutzbar, nach S3
als Vorlagenwerkzeug für gemalte Teile.

## 7. Risiken

| Risiko | Gegenmaßnahme | wo geprüft |
|---|---|---|
| Umfang: ein Programm wie Illustrator entsteht nicht nebenbei | Stufen mit Toren; ab S2 SVG-Brücke zu Illustrator, damit schwierige Formarbeit dort gehen kann; nur bauen, was Florian an einem Tor vermisst | jedes Tor |
| Vektornetz robust machen (Schnittpunkte, Flächen nach Änderungen) | eigene Geometrie-Tests; Rückfall: „Teilen“ erzeugt getrennte Formen wie Illustrators Pathfinder | Tor S2 |
| Grenzen von Safari auf dem iPad (Pencil-Verzögerung, Gesten, Speicher, sicherer Kontext) | schon in S1 am iPad messen; App-Hülle als Rückfall (Abschnitt 3.3) | Tor S1 |
| Kosten je Pixel am Handy mit vielen Schichten (Textur, Pünktchen, Mischmodi, Überzeichnen) | Leistungsanzeige, Messung je Schicht, Schichten nur wo gesetzt, undurchsichtig von vorn nach hinten | Tor S3, S5 |
| Pinsel springt in dichten Stapeln | Rollen und Andockkanten; Replay und Prüfstriche aus der Kamerasession | Tor S4 |
| Portale zur Laufzeit (Loch, Tiefenwechsel, Vorlage passt nicht in die Lücke) | Portal-Werkstatt, Prüfung „passt in die Lücke“; Rückfall: nur feste Öffnungen | Tor S7 |
| Zwei ungesicherte Stände (Etappe-2-Worktree, Kamerawinkel nur lokal) | Stufe 0 sichert beide, bevor gebaut wird (erledigt am 27.10.: `b30bb71` und Branch `zoneneditor`, beide lokal) | Stufe 0 |
| Shader-Pünktchen wirken gefiltert statt gemalt | Vergleich gemalt gegen Shader am Handy; Florian entscheidet Regel 4 | Tor S5 |
| Gemalte Teile passen nicht mehr nach Formänderungen | Fingerabdruck der Malvorlage, Warnung im Editor | Tor S6 |

## 8. Was aus dem großen Plan danach weiterläuft

- **Etappe 2** ruht bei Schritt 7. Nach Stufe 4 wird ihr Rest auf Ebenen neu geschnitten: Schritt 8 (Tor 2b) wird
  durch Tor S4 ersetzt; Schritt 9 (Schlange mit Freiraum, Tunnelkapsel) teilt sich in Spielobjekte auf Kanten (S4) und
  Portale (S7); Schritt 10 (Wasser) wird eine Fläche mit Wassermaterial; Schritt 11 (Basiszone v1) baut Florian im
  Editor aus Formen statt Klötzchen.
- **Etappe 3** (Ziele, Rätsel, Humor) läuft danach wie geplant; Glocke, Mühlrad, Tor und Durchbruch stehen auf Kanten.
- **Etappe 4** (Stilprobe) wird kleiner: Stufe 5 und 6 liefern die Werkzeuge; die Stilprobe selbst bleibt das Tor für
  den Look und für den Vergleich gemaltes Teil gegen 3D-Teil (Paket 8a, Nachtrag 25.10.).
- **Paket 8b** bekommt aus dem Editor die genaue Form jedes Auftrags (SVG und Malvorlage); die Prüfung „passt es genau“
  vergleicht gegen die Form statt gegen einen Klotz.
- Bei jeder Rückmeldung von Florian nennt die Session die Stelle im Plan, wenn der Punkt schon vorgesehen ist.

## 9. Offene Entscheidungen

### Florians Antworten vom 27.10.2026

- **Startfragen:** „Ja zu A1 bis A7“; die Oberfläche des Editors **so minimalistisch und ruhig wie möglich**.
- **Abstand (Befund 1):** „Dann muss der hintere Shape in der Größe verändert werden“, also „Bild halten“ wie empfohlen.
- **Pünktchen als Filter (Befund 12, B1):** „Muss man ausprobieren. Ich würde es gerne als Shader sehen.“ Die Stufe 5
  baut die Pünktchen als Shader; ob Regel 4 in Paket 0 fällt, entscheidet der Vergleich an Tor S5.
- **Fels ist fest (Befund 16, B2):** gilt nach Florians letzten Recherchen erst einmal nicht mehr; das Material
  „grabbar“ wird gebaut, dann schauen wir.
- **Portale (Befund 16, B3):** werden dynamisch gesetzt. Wie Durchfahrten gemacht werden, ob sie sichtbar sind und ob
  der Pinsel dynamisch gräbt, klären wir später. **Vorrang haben Look, Pinselstrich und Fahrt;** Levelziele werden
  notfalls angepasst, und fallen welche weg, ist das so („wir haben ja sehr viele“).
- **Markierungen an Ebenen (Befund 15):** einverstanden, sie werden ohnehin gebraucht.
- **SVG (Befund 17):** ist die Basis; eine fertige Ebene kann am Ende aus SVG, gemalten Elementen und Shadern bestehen.
- **Knotenbaum unter den Ebenen (Befund 19, 3.4):** einverstanden („wenn du das für besser hältst“).

### A. Vor dem Start (für Stufe 0 und 1) – beantwortet am 27.10.2026, alle wie empfohlen

| Nr. | Frage | Optionen | Empfehlung |
|---|---|---|---|
| A1 | Was macht der Abstandsgriff? | (a) alles dahinter rückt mit, Bild bleibt gleich; (b) alles dahinter rückt mit, Ebenen werden kleiner; (c) nur eine Ebene wandert | (a) als Standard, (b) umschaltbar, (c) durch Ziehen der Ebene selbst |
| A2 | Plattform | (a) Web im selben Code, iPad über HTTPS zum Mac; (b) Web plus App-Hülle (Capacitor) für das iPad; (c) eigene iPad-App | (a), (b) erst wenn ein Tor es verlangt |
| A3 | Reihenfolge | S1–S8 wie in Abschnitt 6, oder Earle-Schichten (S5) vor Spiel im Editor (S4) | wie in Abschnitt 6 |
| A4 | Formmodell | (a) Vektornetz mit Flächen; (b) getrennte geschlossene Formen | (a) |
| A5 | Git | Etappe-2-Zwischenstand auf seinem Branch committen, Branch `zoneneditor` aus Etappe 2 plus Kamerawinkel | ja |
| A6 | Aussehen des Editors | neutral und ruhig, oder im Stil der Spiel-Oberfläche | neutral |
| A7 | HTTPS für das iPad | (a) `vite-plugin-mkcert`, einmal ein Profil auf dem iPad installieren, nur im WLAN; (b) Tailscale Serve, ohne Profil, auch unterwegs, braucht ein Tailscale-Konto | (a) zum Start, (b) wenn du unterwegs am iPad bauen willst; umgesetzt mit einem eigenen OpenSSL-Skript statt des Plugins (Abschnitt 6, Stufe 0) |

### B. An den Toren

| Nr. | Frage | wann |
|---|---|---|
| B1 | Paket 0 Regel 4 neu: Pünktchen und Textur als Schicht im Editor erlaubt? Nach Vergleich gemalt gegen Shader (Florian will es als Shader sehen, 27.10.) | Tor S5 |
| B2 | ~~Abtauchen nur in grabbare Flächen, Fels bleibt fest?~~ **Teilweise beantwortet (27.10.):** „Fels ist fest“ gilt erst einmal nicht mehr, „grabbar“ wird gebaut; ob es daneben noch „fest“ braucht, zeigt der Test | Tor S4 |
| B3 | ~~Portale automatisch oder nur von Hand?~~ **Beantwortet (27.10.):** dynamisch. Offen bleibt, wie Durchfahrten gemacht werden, ob sie sichtbar sind und ob der Pinsel dynamisch gräbt | Tor S7 |
| B4 | Pinsel „Ebenen: Bodenhöhe“ als Grundlage für die Tiefe aus Ebenen? | Tor S4 |
| B5 | Neigung und Bildwinkel je Zone oder je Feld? | Tor S1 |
| B6 | PSD-Import aus Procreate (Ebenen als Bildschichten) nötig? | Tor S6 |

**Florian parallel (jederzeit, nicht im Tor):** Papier und Gouache scannen oder fotografieren (für die Texturen in Stufe
5); eine Skizze der ersten echten Zonenformen, die er im Editor nachbauen will; am iPad das HTTPS-Profil installieren
(einmalig, in Stufe 0); an den Toren am Mac **und** am iPad bauen.

## 10. Quellen (Auswahl aus den drei Recherchen vom 27.10.2026)

**Grafikprogramme:** Procreate Farben https://help.procreate.com/procreate/handbook/colors/colors-interface · Procreate
5.4 https://help.procreate.com/articles/Ls9oMu-procreate-5-4-update-at-a-glance · Procreate Ebenen
https://help.procreate.com/procreate/handbook/layers/layers-options · Procreate Gesten
https://help.procreate.com/procreate/handbook/interface-gestures/gestures · Procreate Anpassungen
https://help.procreate.com/procreate/handbook/adjustments/adjustments-color · Illustrator Interaktiv malen
https://helpx.adobe.com/illustrator/desktop/paint-and-fill/learn-painting-basics/paint-with-the-live-paint-bucket-tool.html
· Illustrator Freiform-Verläufe
https://helpx.adobe.com/illustrator/desktop/paint-and-fill/create-and-edit-gradients/create-and-apply-freeform-gradients.html
· Illustrator mehrere Füllungen
https://helpx.adobe.com/illustrator/desktop/paint-and-fill/learn-painting-basics/create-multiple-fills-and-strokes.html ·
Illustrator Kurvenzeichner https://helpx.adobe.com/illustrator/using/tool-techniques/curvature-tool.html · Illustrator
iPad Verläufe https://helpx.adobe.com/illustrator/using/colors-gradients-ipad.html · Photoshop Verläufe
https://helpx.adobe.com/photoshop/using/gradients.html · Affinity Appearance
https://affinity.help/designer2/en-US.lproj/pages/Panels/appearancePanel.html · Affinity Vektor-Flutfüllung
https://affinity.help/designer2/en-US.lproj/pages/Tools/tools_vectorFloodFill.html · Affinity Ebenen-Ablagezonen
https://affinity.help/photo2/en-US.lproj/pages/Layers/layerDropZones.html · Affinity Command Controller und Einrasten
https://affinity.help/designer2ipad/en-US.lproj/pages/DesignAids/snapping.html · Affinity-App https://www.affinity.studio/
· Figma Vektornetze https://www.figma.com/blog/introducing-vector-networks/ · Figma Vektorbearbeitung
https://help.figma.com/hc/en-us/articles/360039957634-Edit-vector-layers · Figma Füllungen
https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills · Figma Eigenschaften kopieren
https://help.figma.com/hc/en-us/articles/4412765442967-Copy-and-paste-properties-between-layers · Linearity Gesten
https://www.linearity.io/academy/curve/ipad/user-guide/shortcuts-and-gestures/tools-gestures/ · Rive Vector Feathering
https://rive.app/blog/introducing-vector-feathering

**Earle-Look und Shader:** Instant Stippling https://diglib.eg.org/handle/10.1111/cgf13565 · Weighted Voronoi Stippling
https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf · Surface-Stable Fractal Dithering
https://runevision.com/tech/dither3d · Texture Bombing
https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-20-texture-bombing · Band-Limiting
https://iquilezles.org/articles/bandlimiting/ · Ganzzahl-Hash https://jcgt.org/published/0009/03/02/ · Valve
Alpha-Tested Magnification https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf
· tiny-sdf https://www.npmjs.com/package/@mapbox/tiny-sdf · Mischmodi W3C https://www.w3.org/TR/compositing-1/ ·
erweiterte Mischmodi in WebGL (Entwurf)
https://registry.khronos.org/webgl/extensions/WEBGL_blend_equation_advanced_coherent/ · KTX2Loader
https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/KTX2Loader.js · UbiArt-Frisen (Reverse-Engineering)
https://github.com/byvar/ubi-canvas-delta · Unity Sprite Shape
https://docs.unity3d.com/Packages/com.unity.2d.spriteshape@5.0/manual/SSProfile.html · Earle in Houdini (Murphy,
Galanter) https://dl.acm.org/doi/10.1145/2785585.2792558 · Sable
https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability · Hollow Knight
https://unity.com/madewith/hollow-knight

**iPad, Browser, Datenmodell, SVG:** WebKit Safari 27.2 https://webkit.org/blog/18515/webkit-features-for-safari-27-2/
· Pointer Events in Safari 18.2 https://webkit.org/blog/16301/webkit-features-in-safari-18-2/ · tldraw zu Stift und
Finger https://tldraw.dev/blog/a-touchy-subject · sichere Kontexte
https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts ·
Download-Fehler in Web-Apps https://bugs.webkit.org/show_bug.cgi?id=290847 · Speichergrenze
https://bugs.webkit.org/show_bug.cgi?id=300782 · vite-plugin-mkcert https://npmjs.com/package/vite-plugin-mkcert ·
Tailscale Serve https://tailscale.com/docs/use-cases/application-testing/share-local-dev-server-with-team · Pencil-Drücken
nativ https://developer.apple.com/documentation/applepencil/handling-squeezes-from-apple-pencil · PathBool.js
https://github.com/r-flash/PathBool.js/releases · paper.js https://github.com/paperjs/paper.js/releases · Immer-Patches
https://immerjs.github.io/immer/patches/ · Figma Mehrspieler-Datenmodell
https://www.figma.com/blog/how-figmas-multiplayer-technology-works/ · Illustrator und SVG-Gruppen
https://community.adobe.com/questions-652/how-to-create-g-elements-in-svg-that-are-recognized-as-layers-in-illustrator-817756
