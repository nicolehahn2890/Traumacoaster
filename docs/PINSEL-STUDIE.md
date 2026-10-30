# Pinsel-Studie: Strich → Bahn im Ebenen-System

Stand 30.10.2026: **angehalten seit 29.10. abends, der Strich ist eingefroren.** Florian: „Leider hat die Strich-Session
noch keine guten Resultate erzielt. Ich würde den Editor jetzt mit dem Strich, den wir haben, fertig bauen und dann noch
mal versuchen, eine Lösung zu finden.“ Gearbeitet wurde am 28. und 29.10. auf `claude/pinsel-studie-8f0777`; alles ist in
`zoneneditor` (zuletzt Studie 17: 4f54ef4, Vergleichsschalter 2a7f105).
**Im Spiel:** In Ebenen-Zonen zeichnet Strich 2 (dynamischer Vorlauf, Fortsetzen und Überzeichnen, Kreuzungsregel,
Kantenfelder, Schleifen als Loopings); die Fahrt hat Antrieb und Stützräder (`drive`); die Schienen bleiben aufrecht außer
im Looping, der Fit hält 4 m Mindestradius (Studie 17). Zonen ohne Ebenen zeichnen mit Strich 1, im Bericht „heutiger
Pinsel“. Alle Schalter stehen im Testmenü des Zonen-Editors (`src/ui/testMenu.ts`), Übersicht unten.
**Aufnahmen:** nur mit `TC_RECORD=1`, wenn Florian es will. Die 901 Striche bis 29.10. sind Kritzeleien für extreme
Formen und kein Maßstab für den Pinsel; die Nachspiel-Zahlen in diesem Bericht beruhen auf ihnen.
**Weiter:** Strich 1, Strich 2 oder eine Lesart ohne Formregeln entscheidet Florian später in einer eigenen Session, in
einer echten, dicht gemalten Zone. Bis dahin ruhen die Pakete 4 und 5, 15f, 16f, 17e und Florians Feintuning-Liste.
Die Kurzfassung unten ist der Befund vom 28.10.; die Nachträge 7 bis 18 und die Messprotokolle stehen wörtlich im Verlauf
(`docs/archiv/PINSEL-STUDIE-VERLAUF.md`), hier bleibt je Abschnitt das Ergebnis.

Begriffe beim ersten Mal: **Vorschau** = die Live-Schienen beim Malen (alle 50 ms neu gerechnet). **Tiefe** = Abstand
nach hinten in Metern (eine Spur = 8,4 m). **Loslassen** = der Finger geht hoch, die Bahn wird endgültig gebaut.
**Probefahrten** = die versteckten Fahrten nach dem Loslassen, die die Bahn an Problemstellen nachbessern.
**Vorlauf** = das Stück hinter der Pinselspitze, über das die Bahn noch nicht entschieden hat.
**Strich 1** = der bisherige Pinsel, im Bericht oft „heutiger Pinsel“; **Strich 2** = der kausale Strich dieser
Studie, seit 29.10. die Vorgabe in Ebenen-Zonen.

## Schalter (Adresse und Testmenü)

Alle Schalter stehen im Testmenü des Zonen-Editors („Test ▾“, `src/ui/testMenu.ts`); das Menü schreibt sie in die Adresse
und lädt neu. Ohne Schalter gilt die Vorgabe. Die Nachspiel-Messung (`scripts/pinsel-messung.ts`) hat die genannten
`--`-Schalter. Die Zahlen sind Platzhalter (Abschnitt 6), außer wo Florian sie bestätigt hat (Mindesttempo 4 m/s bis zur
Stilprobe, Abschnitt 16).

| Adresse | Testmenü | Vorgabe | wofür | Messung | Abschnitt |
|---|---|---|---|---|---|
| `&strich=` | Strich 2, Strich 1 (heutiger Pinsel) | 0: automatisch, Strich 2 in Ebenen-Zonen, sonst Strich 1 | `1` Strich 1, `2` Strich 2 auch ohne Ebenen | `--strich 2` | 11 |
| `&vorlauf=` | Vorlauf: als Tinte, als Schienen | 1: Schienen bis zum festen Teil, davor das pinke Band | `2` Vorlauf als Schienen bis zur Spitze | – | 9, 10 |
| `&vorlaufm=` | Vorlauf, bis die Tiefe fest ist (m) | 12 m | voller Vorlauf bei steilem Stück, Umkehr oder wandernder Tiefe (sonst 3 oder 6 m) | `--vorlauf` | 11, 14a |
| `&freezemax=` | steiles offenes Stück bleibt Höhe ab (m) | 90 m | ab dieser Länge hält ein offenes steiles Stück das Festwerden nicht mehr auf und bleibt Höhe | `--freezemax` | 14a |
| `&lookstart=` | nach dem Anschluss gleich fest (m) | 6 m | so viele Meter nach dem Anschluss werden auch in einem offenen steilen Stück fest | `--lookstart` | 14a |
| `&fest=` | fest hinter dem Ende (m) | 2 m | so viele Meter hinter dem festen Ende wird ein Bahn-Segment fest | `--fest` | 10 |
| `&tol=` | Fit-Toleranz (Faktor) | 1 | Faktor auf die Toleranz des Knoten-Fits | `--tol` | 13d |
| `&even=` | Knoten: gleich verteilt, ohne Gleichverteilung | an | `0` ohne Gleichverteilung der Knoten | `--even` | 13d |
| `&span=`, `&turn=` | Gleichverteilung: Spanne (m), Winkel (°) | 150 m, 180° | längstes Segment und größte Drehung je Segment | `--span`, `--turn` | 13d |
| `&schleifen=` | Schleifen: lesen, nicht lesen | an | `0` liest keine Schleifen (Stand vor Paket 3) | `--schleifen 0` | 16 |
| `&loopaspect=` | Looping ab Höhe/Breite | 0,7 | ab diesem Verhältnis ist eine gezeichnete Schleife ein Looping, sonst eine Bodenschleife | `--loopaspect` | 16b |
| `&loopr=` | Looping-Mindestradius (m) | 4 m | engere Loopings werden aufgeweitet | `--loopr` | 16b |
| `&fahrt=` | Fahrt: Antrieb und Stützräder, streng | Antrieb und Stützräder (`drive`) | `1` strenge Fahrt wie vor Paket 2 | `--fahrt strict` | 15d |
| `&antrieb=` | Antrieb: Mindesttempo (m/s) | 4 m/s | Mindesttempo des Antriebs | `--antrieb` | 15d |
| `&rahmen=` | Schienen: aufrecht (Studie 17), bisheriger Oben-Vektor | aufrecht außer im Looping | `1` bisheriger Oben-Vektor zum Vergleich | `--rahmen alt` | 17a |
| – | – | Mindestradius 4 m im Fit | nur in der Messung abschaltbar | `--minr 0` | 17b |

Im Testmenü stehen außerdem die Zeichengrößen (`dzoom`, `tip`, `line`, `band`), die vier Tiefen-Lesarten des alten
Kameramenüs und die alten Lesarten (`stage`, `single`, `lanes`, dazu `fit` und `tipr`); sie gehören nicht zur Studie.

## 1. Kurzfassung

Befund und Empfehlung vom 28.10. („heutiger Pinsel“ ist Strich 1; die Zahlen stammen aus den Aufnahmen, siehe Kopf):

1. Die Bildrate fällt, weil jede Vorschau die ganze Linie neu rechnet und dabei je Punkt die Ebenen befragt: Bei 300 m
   Linie dauert eine Vorschau 61 ms, bei 800 m 190 ms (Mittelwerte aus 5062 Vorschauen); 97 % davon sind Abfragen an
   Ebenen und Freiraumfeld (allein `floorBelow` 60–80 %), der Tiefenlöser selbst braucht 0,3–4 ms.
2. Nach dem Loslassen sind es sofort 60 fps, weil keine Vorschau mehr läuft; der Plan beim Loslassen blockiert einmal
   0,5 s (Median; bis 1,1 s), die Probefahrten laufen danach in 6-ms-Scheiben.
3. Die Bahn „springt“ beim Loslassen nicht im Bild (Median 2,8 px), sondern in der Tiefe: im Median um bis zu 16 m
   (knapp zwei Spuren), mit bis zu 55° Rollwinkel, auch weit hinter der Spitze. Grund: Rundenschluss und Probefahrten
   lösen die ganze Tiefe neu. Im alten Layout waren es 2,7 m und 19°.
4. Der Strich wird im Bild nicht abgelenkt (90 % der Bahnpunkte liegen unter 4,6 px am Strich, nahe Festem 4,8 px).
   Was Florian als Ablenkung spürt, ist der Rückstand der Schienen hinter dem Finger (Median 72 px, 90 % 134 px, im
   Browser bei 30 fps mehr) und das Hin und Her der Tiefe: 12 Tiefenumkehrungen und 131 Knicke je Strich.
5. Florians Gedanken tragen im Kern (Talblick, Abstände nutzen, unverfälschter Strich, Markierungen im Editor,
   Höhlenmeter); zwei brauchen eine Änderung: „zwischen zwei Ebenen ist immer Platz“ stimmt in den Testszenen nicht
   (Lücken bis 2 m), und „Physik verdrehen“ geht nur bis zur Kreuzungsregel und den Stützen, die echte Tiefe brauchen.
6. Empfehlung: Strich 2, ein kausaler Strich mit festem Vorlauf: Was 12 m hinter der Spitze liegt, ist entschieden
   und ändert sich nie mehr; je Vorschau wird nur das freie Ende gelöst; Hügel und Kehren bleiben offen, bis sie sich
   erklären. Prototyp hinter `&strich=2`: Arbeit je Vorschau 4–8 ms (Median) unabhängig von der Länge statt 9–192 ms,
   Sprung beim Loslassen 0,2 m Tiefe statt 16 m, am Handy 58 statt 40 fps, Rückstand der Schienen 32 statt 72 px.
   Noch nicht fahrbar (0 von 45 Fahrten, heute 1 von 45): Kehren und Kreuzungen brauchen Stufe P1 und P4. Aufwand bis
   zum Einbau: zwei Stufen (M/M), Stützen und Tunnel-Lippen danach (M), nachsichtige Fahrt (S).
   Stand 28.10.; seit 29.10. ist Strich 2 die Vorgabe in Ebenen-Zonen (Abschnitt 11), und mit `drive` kommen alle
   Fahrten an (Abschnitt 15).

Die Punkte 7 bis 18 (Nachträge vom 28.10. abends bis 29.10. nachts) stehen wörtlich im Verlauf, Abschnitt 1. Was daraus
wurde, steht im Kopf; je Abschnitt unten steht das Ergebnis.

## 2. Befund am heutigen Pinsel

Werkzeuge: `scripts/pinsel-messung.ts` (spielt die Aufnahmen so nach, wie die Level-Szene sie verarbeitet, mit der
gemessenen Vorschau-Dauer im Takt der Aufnahme) und `scripts/pinsel-bildzeiten.mjs` (echte Bildzeiten im headless
Chromium mit Metal, Striche als Zeigerereignisse im Takt der Aufnahme, Kamera je Punkt wie aufgezeichnet). Striche mit
Feld f2 in Bogenland laufen in der Kopie von Florians geänderter Zone (`test-boegen-f2`). Die Kameraneigung der
Aufnahmen ist nicht aufgezeichnet; gerechnet wurde mit der Standardneigung (26,6°). Alle Zeiten vom M3 Pro.

### 2a. Leistung

Dauer einer Vorschau nach Linienlänge (Node, heutiger Pinsel, 45 Striche, 5062 Vorschauen; Median / 90 % / max):

| Linie | Vorschau ms | davon Abfragen Ebenen und Feld | Löser | Mesh |
|---|---|---|---|---|
| 0–99 m | 8,7 / 31 / 97 | 8,4 ms (97 %) | 0,3 ms | 0,5 ms |
| 100–199 m | 23 / 55 / 174 | 22 ms | 0,6 | 1,2 |
| 200–299 m | 46 / 86 / 274 | 45 ms | 1,0 | 1,9 |
| 300–399 m | 61 / 132 / 497 | 59 ms | 1,4 | 2,7 |
| 400–499 m | 82 / 148 / 454 | 79 ms | 1,9 | 3,6 |
| 500–599 m | 129 / 161 / 396 | 126 ms | 2,3 | 4,8 |
| 800–899 m | 192 / 226 / 226 | 186 ms | 3,8 | 7,7 |

- Die Arbeit wächst linear mit der Linie, weil `previewBrushTrack` je Vorschau **alle** Linienpunkte neu durch die
  Ebenen schickt: `depthAt` (Landung, 15–20 % der Zeit), `free` (Freiraum am Strahl, 5–10 %) und vor allem
  `floorBelow` in `worldPoints` (tragende Fläche unter jedem Punkt, 60–80 %; bis zu 160 Festigkeitsabfragen je Punkt
  gegen alle Flächen aller Ebenen). Der Löser (Bandmatrix), die Kreuzungssuche und die Linie sind zusammen unter 5 ms.
- Im Browser (Metal) kommt der Aufbau der Schienen dazu (`setTrack`, 4–6 ms Median, bis 150 ms). Gemessen am Handy-Bild
  (393×695 px, dpr 3, Strich 42, 862 m): 39,6 fps im Mittel, 14 % der Bilder über 20 ms, Vorschau im Median 26 ms, 90 %
  166 ms. Am Mac-Bild (1920×963, dpr 2) rendert der headless Browser schon im Leerlauf mit 33 ms je Bild; dort zählt nur
  die Dauer je Vorschau: Strich 4 (Hügel, 665 m) Median 37 ms, 90 % 122 ms, max 164 ms; Strich 20 (Grotte, 127 m)
  Median 47 ms. Mit „alle 50 ms oder nach dem 1,5-Fachen der Dauer“ blockiert so alle 60–280 ms ein Bild für 40–190 ms:
  das sind Florians 30 fps.
- **Warum nach dem Loslassen sofort 60 fps:** Der Plan beim Loslassen rechnet einmal (Median 531 ms, max 1,1 s; davon
  Abfragen 95 %), danach läuft keine Vorschau mehr; die Probefahrten arbeiten in Scheiben von 6 ms je Bild, die
  Stützen brauchen 11 ms.

### 2b. Sprünge nach dem Loslassen

Letzte Vorschau gegen fertige Bahn, je Linienpunkt (45 Striche; „weit vor der Spitze“ = mehr als 15 m hinter dem Ende):

| | Bild (px) 90 % / max | Welt max | Tiefe max | Roll max |
|---|---|---|---|---|
| Vorschau → Plan (Median je Strich) | 7,6 / 23,7 | 27 m | 16,0 m | 54,5° |
| davon weit vor der Spitze (Median der Maxima) | 14,5 px | | 16 m | |
| Vorschau → nach Probefahrten (Median je Strich) | – / 33,3 (größtes 193) | | 16,1 m | 62,6° |
| altes Layout (349 Striche) Vorschau → Plan | 16,2 / 32,6 | | 2,7 m | 18,9° |

- Im Bild bleibt die Bahn fast, wo sie war: Die Bildlage ist beim heutigen Pinsel durch die Konstruktion gesichert
  (Höhe = Bildhöhe − 0,5 · Tiefe). Was springt, ist die **Tiefe**, im Median um bis zu 16 m, bei 30 von 45 Strichen um
  mehr als eine Spur, und das auch 50 m und weiter hinter der Spitze. Die Tiefe nimmt den Rollwinkel mit (Median der
  größten Änderung 55°).
- Ursachen im Code: (1) Bei einer **Runde** hält die fertige Bahn die gezeigte Tiefe nur weich (`PREVIEW_HOLD`, vor dem
  Schluss über 40 m ausgeblendet), weil `fixedAtRelease` nur offene Linien festnagelt (`planBrushTrack`, „shown &&
  !prep.closed“). 36 der 45 Striche schlossen die Runde. (2) Die **Probefahrten** lösen die Tiefe mit neuen Gewichten,
  lockern die gezeigte Tiefe ±40 m um die Stelle (`apply`: `holdW = 0`) und ziehen die Linie bis 8 px rund (`relaxLine`);
  bei 19 von 45 Strichen griffen Hebel, dann steigt der Bildsprung auf 33 px im Median, bis 193 px. (3) Der
  **Wächter der Kehren** und `freeLoops` geben Kehren und Schleifen beim Loslassen wieder frei, wenn ein Looping oder eine
  Kreuzung spät erkannt wird.
- „Unnötige Drehungen und Knicke“: Die fertigen Bahnen haben im Median 131 Stellen mit Krümmungsradius unter 4 m
  (altes Layout 61), 12 Tiefenumkehrungen (6) und 155° Rollen je 100 m (128°). Die Tiefe wandert im Median über 34 m
  (vier Spuren) je Strich. Nur 1 von 45 Bahnen übersteht die Fahrt (altes Layout 111 von 348), meist Stillstand am
  ersten Hügel (die Kette endet an der Kettenzuggrenze) oder Entgleisen in einer Tiefenschleife.

### 2c. Ablenkung beim Zeichnen

Abstand der sichtbaren Vorschau-Bahn (mit der Kamera des Augenblicks ins Bild gebracht) vom gemalten Strich:

| | Median | 90 % | 99 % |
|---|---|---|---|
| alle Vorschau-Punkte, Testszenen | 0,4 px | 4,6 px | 23,7 px |
| nahe Festem (Strahl berührt Flächen) | 0,3 px | 4,8 px | |
| frei | 0,5 px | 4,1 px | |
| altes Layout | 0,2 px | 1,9 px | 22,7 px |

- Die Bahn liegt also im Bild auf dem Strich; die Abweichungen über 10 px kommen vom Anschluss an die Station
  (`joinLines` gleitet die ersten 5 m des Strichs auf das Ende des Vorgabestücks) und von der Kamera (Autoscroll).
  Eine Verschiebung „nahe Festem“ gibt es nicht; die Ebenen ändern nur die Tiefe, nie die Bildlage.
- Was sich **addiert**, ist etwas anderes: Die Schienen laufen dem Finger hinterher, im Nachspiel im Median 72 px, bei
  90 % der Vorschauen 134 px, bis 354 px (Zähigkeit 0,14 s plus Vorschau-Takt plus Vorschau-Dauer; im Browser bei
  30 fps noch ein Bild mehr). Je länger der Strich, desto seltener die Vorschau (1,5-faches ihrer Dauer), desto größer
  der Rückstand: das ist „die Spitze wird ungenauer“. Dazu kippt der vorläufige Teil (die letzten 15 m, bei „Ebenen“
  die letzten 10 m) von Vorschau zu Vorschau in der Tiefe (90 % unter 0,33 m, aber bis 34 m), und 6-mal in 5062
  Vorschauen sprang auch schon Gezeigtes um bis zu 23 m (spät erkannte Schleifen, `freeLoops`). An Höhlen vorbei
  wechselt die Wunschtiefe zwischen „vor der Öffnung“ und „in der Höhle“ (`CAVE_PULL`, `noRead`): Dann schwingen die
  Schienen am Ende hin und her, und das sieht wie ein abgelenkter Pinsel aus, obwohl die Linie steht.
- Ein Vervielfachen gibt es nicht; es ist eine Summe aus Rückstand, Tiefenkippen am Ende und Bildrate.

### 2d. Vergleich mit dem alten Layout

- Dort gibt es keine Ebenen-Abfragen: Vorschau im Median 0,1–5 ms (max 290 ms bei dichten Kritzeln mit vielen
  Engstellen), also immer 60 fps. Die Tiefe kommt allein aus der Bildhöhe (Ziel: 4 m über dem flachen Boden), die
  Glättung über 40 m; Sprünge beim Loslassen 2,7 m Tiefe. Das ist das „smoothe“ Erlebnis: wenig Information, wenig
  Streit.
- Die **vorderste Bodenkante**, die Florian schon dort gestört hat: Unter der vordersten Bodenlinie gibt es keine
  Tiefe mehr (`upper` in `solveDepth` begrenzt z auf die Bühne), also hebt `worldPoints` die Bahn auf Boden + 0,4 m: Die
  Linie verlässt dort den Strich nach oben. Das ist der einzige Ort, an dem der alte Pinsel die Bildlage ändert (die 1 %
  der Punkte über 22 px).

## 3. Florians Gedanken geprüft

| Gedanke | Urteil | Beleg | Folge für Spiel und Editor |
|---|---|---|---|
| Tiefe und Physik „zu unseren Gunsten verdrehen“, jede Bahn passt, Physik eher im Bild | trägt, mit einer Grenze | Die Bildlage legt X und Y fest, die Tiefe ist frei: Jeder Strich ist als 3D-Bahn baubar (2c: 90 % unter 4,6 px). Was nicht frei ist: Kreuzungen (zwei Stellen müssen 2,2 m in der Tiefe oder 3,5 m in der Höhe auseinander, Kapitel 5 der TECH.md) und Stützen (brauchen echte Tiefe und Kanten). Die Fahrt rechnet seit den Scheiben schon mit „Tiefen-Perspektive“ (`depthPerspective` 70 m). Ein Denkfehler steckt in „keine korrekte Physik“: Sobald die Tiefe gewählt ist, ist die Bahn eindeutig und die Physik darauf so richtig wie je; willkürlich ist nur die Wahl. | Die Wahl darf Physik ignorieren (keine Fliehkraft-Kopplung in der Tiefenwahl, keine Hebel an der Linie), dafür muss die Fahrt nachsichtig sein: Querkraft aus Tiefenkrümmung deckeln (Arcade), Höhe und Tempo aus dem Bildprofil. Kreuzungsregel und Stützen bleiben echt. |
| Abstände zwischen den Ebenen nutzen statt der Kanten, oder eine Mischung | trägt mit Änderung | Die Bahn liegt heute schon im Abstand: 1 m vor der Ebene, an der sie andockt (`DOCK_GAP`). Aber „immer genug Platz“ stimmt nicht: Lücken in den Testszenen 4, 10, 12 m (Hügel), 5, 5, 4, 5 m (Grotte), 4, 2, 2, 10 m (Bogenland: Insel 10, Wasserfall 12, Boden 14). Ein Strang braucht rund 2,5 m, zwei Stränge nebeneinander 4,7 m. | Der Editor sichert den Platz: Mindestabstand spielbarer Ebenen als Regel in der Tiefenleiste (Plan 4.4 „Abstandspillen“), Ebenen unter dem Abstand werden Kulisse oder Luft. Die Mischung bleibt: Kante bestimmt die Ebene, die Bahn liegt im Abstand davor. |
| Talblick: Striche nach oben und unten „auf“ der Oberfläche lesen | trägt, mit einer Regel | So liest „Ebenen: Bodenhöhe“ heute (`planeGroundDepth`: die Tiefe, in der der Punkt 4 m über einer Kante liegt). Offen bleibt die Zweideutigkeit Höhe oder Tiefe: Ein Strich nach oben ist auch ein Hügel oder ein Looping. Heute entscheidet die Steilheit (unter 15° Tiefe, über 40° Höhe) plus Hügel- und Schleifenerkennung. | Die Regel bleibt, wird aber kausal: Steile Stücke bleiben offen (Vorlauf), bis sie sich als Hügel (wieder flach) oder Kehre (Umkehr in x) erklären (Prototyp). Florian entscheidet, ob er die Grenze bei 25° oder 40° will (Abschnitt 8). |
| Abtauchen zwischen zwei Ebenen, Tunnel-Lippen an Vorder- und Hinterkante, seitlich ebenso | trägt (Entwurf) | Der Weltrenderer verdeckt eine Bahn hinter einer Ebene schon heute (die Ebene liegt in ihrer Tiefe vor der Bahn). Die Lippe ist berechenbar: der Schnitt der Bildlinie der Bahn mit dem Umriss der Ebene dort, wo die Tiefe von „davor“ nach „dahinter“ wechselt; bei senkrechten Kanten dasselbe. Heute verhindert das Freiraumfeld das Abtauchen (fest hinter fester Fläche bis zur nächsten Ebene). | Material „grabbar“ wird durchfahrbar mit Budget, „fest“ bleibt fest; die Lippe wird eine Baugruppe aus der Portal-Vorlage (Plan 4.9, Punkt 1 und 3). Nicht im Prototyp. |
| Höhlenmeter als Budget | trägt | Die Fahrt kennt „im Tunnel“ (`insideRock` über `ceilingAbove`); Meter hinter einer Ebene sind entlang der Bahn abzählbar wie die Streckenmeter (`lengthPill`). | Ein Budget je Feld wie `budget` (Plan 2.4); Werte setzt Florian. Beim Malen zählt die Vorschau die verdeckten Meter mit und färbt den Strich rot, wenn das Budget voll ist. |
| Markierte Stellen, an denen Ebenen vor der Bahn bleiben (hinter Säulen, in den Berg) | trägt | Das ist eine Schranke je Punkt: Dort ist die Tiefe mindestens die der Ebene plus Abstand. Der kausale Löser nimmt Schranken ohne Mehrkosten (Prototyp: Schranken aus Freiraum und Kreuzungen). Die Daten gibt es halb: `dockOff` je Kante (Werkzeug D). | Werkzeug D bekommt eine zweite Marke „Vorrang vorn“ je Fläche oder Kante; die Zone speichert sie wie `dockOff`. |
| Unverfälschter schwarzer Strich, die Bahn zieht animiert nach; Puffer, notfalls Aufbau im Nachhinein | trägt | Gemessen: Die Linie ist im Bild schon heute der Strich (2c); was verfälscht, sind die Hebel der Probefahrten (`relaxLine` bis 8 px) und die Tiefensprünge. Ein Vorlauf, in dem die Bahn „überlegt“, ist genau das, was die Sprünge beseitigt (Prototyp: fester Vorlauf 12 m, bei steilen Stücken länger). | Hebel an der Linie weg; die Fahrt nimmt, was gezeichnet ist (das ist das Spiel). Das animierte Nachziehen ist ein Tween der festen Grenze (nicht gebaut, S). |
| Stützen an jeder markierten Kante, auch in der Ebene; Wand- und Deckenhalter in Varianten; Tunneleingänge markierbar, Ansichten je Material | trägt (Entwurf) | Heute stehen Füße nur auf Andockkanten der Ebene der Bahn und knapp dahinter; in den Testszenen fanden 1598 von 2434 Stützstellen keinen Fuß (66 % „schwebend“). Wand- und Deckenhalter wären genau die Antwort auf diese Stellen. Die Referenzen zeigen sie: 15-wandkonsole, 15-fliegender-ausleger, 15-doppelportal (bahn und strecke); Portale an Flanke und Front in 21 und 27 (visuals). | `DockEdge` bekommt Lage (oben, seitlich, unten) und Halterart; eine Markierung in der Fläche („Fuß hier, etwas unter dem Gras“) ist ein Punkt mit Richtung. Stützen-Werkstatt wie Plan Paket 3, Vorschlag 3.4 (Tor). Varianten sind Daten (Teile-Bogen). |
| Sichtbare und unsichtbare Tunnel; Tunnel als Durchgang in Höhlen | trägt mit Änderung | Unsichtbar heißt verdeckt: Das macht der Renderer von selbst, sobald die Bahn hinter eine Ebene darf (siehe Abtauchen); sichtbar sind Löcher und freie Flächen, in die der Strich heute schon hineinlandet (`planeLanding`, Höhle zuerst). | Keine eigene Tunnelgeometrie, nur Ein- und Ausgang (Lippen) und das Budget. Der Durchgang in eine Höhle ist die Landung durch den Mund, wie heute. |
| Leitsatz: einfacher denken, Strich und Umgebung intelligenter | trägt | Die Intelligenz kostet heute an der falschen Stelle: 97 % der Vorschau sind Abfragen, weil die Umgebung keine vorbereiteten Antworten hat (Kanten, Lücken, Vorrang). Der Löser selbst ist billig. | Die Umgebung antwortet vorbereitet (Kanten mit Rollen, Lücken geprüft, Markierungen); der Strich fragt je neuem Meter einmal und entscheidet kausal. Genau diese Teilung ist Strich 2. |
| „Der Strich wird nahe fester Flächen abgelenkt, es addiert oder multipliziert sich“ | Denkfehler in der Ursache, richtig im Gefühl | Die Bildlage weicht nahe Festem nicht mehr ab als frei (4,8 gegen 4,1 px). Es addieren sich Rückstand (bis 354 px), Tiefenkippen am Ende (bis 34 m) und die Bildrate; kein Faktor vervielfacht. | Behoben durch konstante Arbeit je Vorschau (Rückstand klein, Bildrate hoch) und den festen Vorlauf (kein Kippen hinter der Spitze). |

## 4. Recherche

Essenz, nur was zu diesem Spiel passt:

- **Strich-Stabilisierung ist gelöst und darf hinterherlaufen.** Toon Boom Harmony beschreibt genau das Gummiband
  („pulled string“: das Werkzeug bleibt stehen, bis die Schnur gespannt ist, dann zieht sie es in Richtung Stift) und
  nennt den Rückstand den Preis der Ruhe, einstellbar als Länge. Krita trennt „Weighted smoothing“ (Abstand, bevor der
  erste Punkt gesetzt wird) vom „Stabilizer“ (Mittel aller Eingaben, zieht die Linie immer zu Ende). Procreate hat
  StreamLine, Stabilization und „Motion filtering“ (nimmt die Ausreißer des Zitterns heraus). Folge: Der
  `RubberBrush` (22 px) und die Gauß-Glättung (0,5 m) bleiben; der Rückstand gehört dem Strich, nicht der Bahn.
  Quellen: [Harmony: About Pen Stabilization](https://docs.toonboom.com/help/harmony-24/premium/drawing/about-stabilization.html),
  [Krita: Freehand Brush Tool](https://docs.krita.org/Freehand_Brush_Tool),
  [Procreate: Brush Studio settings](https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings),
  [perfect-freehand (JS, `streamline`)](https://github.com/steveruizok/perfect-freehand).
- **Zeichenspiele lassen die Linie die Wahrheit sein.** Line Rider macht die gezeichnete Linie unverändert zur Bahn;
  die Physik ist bewusst einfach, aber nachvollziehbar (Nachbauten der Engine: lr-core-py, bosh-rs). Trials Fusion ist
  3D gerendert, gespielt aber auf einer 2D-Ebene: genau Florians „2D-Spiel, in das wir 3D malen“. Folge: Der Strich
  wird nicht umgeformt; was die Fahrt daraus macht, ist das Spiel.
  Quellen: [lr-core-py](https://zff.dev/Malizma333/lr-core-py), [bosh-rs](https://lib.rs/crates/bosh-rs),
  [Trials Fusion](https://en.wikipedia.org/wiki/Trials_Fusion).
- **Ebenenwechsel in 2,5D-Spielen sind Daten des Levels, nicht Raten der Engine.** LittleBigPlanet hat drei (später 16)
  Spielebenen; gewechselt wird über gebaute Mittel (Layer Launcher, Rails, Rampen), gute Level wechseln „ohne Zutun des
  Spielers“. Folge: Florians markierte Stellen (Vorrang vorn, Lippen, Halter) sind der richtige Ort für die
  Intelligenz.
  Quellen: [LittleBigPlanet 3](https://en.wikipedia.org/wiki/LittleBigPlanet_3),
  [Game Informer: LBP3 creation tools](https://gameinformer.com/games/littlebigplanet_3/b/playstation4/archive/2014/08/13/digging-deeper-into-littlebigplanet-3s-creation-tools).
- **Arcade-Physik ist Gefühl, nicht Simulation.** OutRun fälscht die Straße als verzerrtes Bild und stimmt Griff und
  Kamera auf Spielbarkeit ab; die Pseudo-3D-Technik ist dokumentiert. Folge: Höhe und Tempo aus dem Bildprofil, Querkraft
  gedeckelt, ist eine legitime Wahl.
  Quellen: [Out Run](https://en.wikipedia.org/wiki/Out_Run), [Lou's Pseudo 3D Page (Spiegel)](https://www.cnblogs.com/5four/p/4271132.html).
- **Ein 2D-Strich hat keine Tiefe; Skizzenprogramme legen sie per Regel fest.** Blenders Kurvenzeichner hat „Depth:
  Surface“ mit „Only First“ (die Tiefe nur am ersten Punkt von der Fläche nehmen, danach in dieser Ebene bleiben) und
  „Offset“ (Abstand zur Fläche): das ist „Spur halten“ plus `DOCK_GAP`. Die Forschung (Sketch2PQ, modellgeführtes
  Skizzieren) löst die Zweideutigkeit über angenommene Flächen oder Skizzenebenen, nie frei.
  Quellen: [Blender Manual: Draw (Curve)](https://docs.blender.org/manual/en/4.1/modeling/curves/tools/draw.html),
  [Sketch2PQ](https://arxiv.org/pdf/2201.09367), [Model-guided 3D sketching](https://hongbofu.people.ust.hk/doc/model-guided_3D_sketching_TVCG.pdf).
- **Kurven werden live mit kurzem Vorlauf angepasst, nicht am Ende neu.** Pudet (1994) passt Pinselstriche in Echtzeit
  stückweise mit Bézier-Kurven an; McCrae und Singh (2008) passen Klothoiden an, robust gegen Zittern. Beide legen ein
  Stück fest und gehen weiter. Folge: ein fester Vorlauf statt globaler Neurechnung (Prototyp).
  Quellen: [Pudet 1994](https://diglib.eg.org/handle/10.2312/6902), [McCrae, Singh 2008](https://www.dgp.toronto.edu/~karan/papers/sbim2008mccrae.pdf).
- **Gegen Verdrehungen: rotationsminimierende Rahmen mit Zusatzzielen.** Wang u. a. (2008) rechnen sie mit doppelter
  Spiegelung; Mossman, Bartels, Samavati (2023) erweitern sie um Ziele wie Schräglage, ausdrücklich für
  Achterbahn-Animation. Der Oben-Vektor der Bahn (Paralleltransport, `sampleTrack`) und die Schräglagen-Glättung
  (`railBanks`) sind schon auf dieser Linie; die Rollsprünge beim Loslassen kommen nicht vom Rahmen, sondern von der
  Tiefe.
  Quellen: [Wang u. a., Computation of rotation minimizing frames](https://www.microsoft.com/en-us/research/?p=344486),
  [Mossman u. a., Balancing Rotation Minimizing Frames with Additional Objectives](https://diglib.eg.org/handle/10.1111/cgf14979).
- **Wachsende Meshes: vorbelegen und Zeichenbereich setzen.** three.js: Puffer in Endgröße anlegen,
  `setDrawRange`, `DynamicDrawUsage`, nur den geänderten Bereich hochladen. Folge für Stufe 2: Das Bahnprofil wächst
  am Ende, statt je Vorschau neu zu entstehen (heute 5–8 ms je Vorschau bei langen Bahnen).
  Quelle: [three.js: How to update things](https://threejs.org/manual/en/how-to-update-things).

Verworfen: Rayman Legends (nur eine Spielebene, Parallaxe rein optisch) und Mario Kart (Gummiband-KI, nicht unser
Thema).

## 5. Empfohlene Lösung

**Zusammenspiel.** Der Strich ist die Bahn im Bild, unverändert. Die Umgebung (Zone) liefert je Bildpunkt vorbereitete
Antworten: Landung auf einer Kante, Bodenhöhe der Ebenen (Talblick), freie Tiefen am Strahl, Vorrang vorn, Lippen,
Halter. Die Bahn entscheidet **kausal**: Für jeden neuen Meter wird nur das freie Ende hinter der Spitze gelöst (12 m
fester Vorlauf; bei steilen Stücken wächst er, bis das Stück sich als Hügel oder Kehre erklärt hat); was dahinter
liegt, ist fest und bleibt es, auch beim Loslassen und in der Fahrt. Die Physik rechnet auf der so gebauten 3D-Bahn,
nachsichtig bei Querkraft aus der Tiefe, streng nur bei Kreuzungen (Tiefe trennt) und beim Tempo (Höhe).

**Was in den Editor wandert (Daten statt Rechnen):**
- Kanten mit Rollen: andocken (heute), Lippe erlaubt (Abtauchen), Halter (Wand, Decke, Konsole), Vorrang vorn.
- Lücken zwischen spielbaren Ebenen geprüft (Mindestabstand), sonst Kulisse oder Luft.
- Material „grabbar“ durchfahrbar mit Höhlenmeter-Budget je Feld; „fest“ bleibt fest.
- Portal-Vorlage je Material (Plan 4.9) als Baugruppe, die die Bahn an der Lippe setzt.
- Je Ebene vorbereitete Kantenfelder (Oberkanten-Höhe je x, Flächen-Boxen), damit `floorBelow` und die Landung je
  Punkt Mikrosekunden statt 0,4 ms kosten.

**Was der Pinsel noch entscheidet:** die Tiefe des freien Endes (Landung, Bodenhöhe, Höhle, Schranken), Hügel gegen
Kehre bei steilen Stücken, die Seite an Kreuzungen (später Gezeichnetes vorne, außer eine Höhle oder ein Vorrang
verlangt anderes), und den Rundenschluss als neuen Weg ab dem festen Ende.

**Alternativen, abgewogen:**
1. *Heutigen Pinsel beschleunigen* (Abfragen zwischenspeichern, `floorBelow` über Kantenfelder): nimmt die Bildrate,
   lässt aber die Sprünge (globaler Löser, Rundenschluss, Hebel) und das Tiefenkippen. Aufwand S, löst ein Drittel.
2. *Strich 2* (empfohlen): konstante Arbeit, Sprung null, Vorlauf als sichtbares Spielgefühl; der Preis: keine
   nachträgliche Verbesserung durch Probefahrten (Florian wollte das ohnehin nicht), Kreuzungs-Chips und Überzeichnen
   müssen nachgebaut werden, Kehren und Hügel werden erst am Ende des steilen Stücks entschieden.
3. *Bahn erst nach dem Loslassen bauen, animiert entlang des Strichs* (Florians Notlösung): kostet das Live-Gefühl,
   bringt nichts, was 2 nicht auch kann; bleibt als Rückfallebene für sehr lange Striche.

## 6. Prototyp: Strich 2

**Gebaut** (`src/track/strich2.ts`, 10 Tests in `tests/strich2.test.ts`, Level-Szene `src/app/scenes/level.ts`):
- Linie wächst nur am Ende (Abtastung 0,25 m, Gauß 0,5 m, 1-m-Punkte); Abfragen je Punkt gemerkt.
- Löser auf dem freien Ende: min Σ w·(z − Ziel)² + μ·Σ(Δz)² + λ·Σ(Δ²z)² + Wenden-Term, dichtes System mit Cholesky und
  aktiver Menge; Schranken aus Freiraum (Flächen) und Kreuzungen mit festen und freien Punkten; Station hält 12 m.
- Fester Vorlauf 12 m, bei steilen Stücken länger (bis 90 m); Hügel: Tiefe gerade von Fuß zu Fuß; Kehre: Halbkreis
  durch die Tiefe (nach oben gezeichnet nach hinten), mindestens 2,6 m, höchstens drei Spuren.
- Knoten alle 3 m ohne Fit (feste bleiben), Rundenschluss als Dubins-Weg ab dem festen Ende, Ende auf Stationstiefe.
- Keine Probefahrten-Hebel; Fels wird markiert, nicht abgeschnitten.

Stand 28.10.; später geändert: Knoten-Fit statt Knoten alle 3 m (Abschnitt 10), dynamischer Vorlauf (14a),
Fortsetzen und Überzeichnen (12), Schleifen (16), Mindestradius im Fit (17b).

Adressen, Messserver und Absicherung vom 28.10.: wörtlich im Verlauf, Abschnitt 6. Die Schalter von heute stehen oben in
der Tabelle.

**Nicht im Prototyp** (Entwurf, Abschnitt 5) und bis heute nicht gebaut: Tunnel-Lippen, Höhlenmeter,
Vorrang-Markierungen, Kreuzungs-Chips, Fels abschneiden, animiertes Nachziehen, wachsendes Mesh (Paket 4). Seitdem
gebaut: Überzeichnen (Abschnitt 12); Wand- und Deckenhalter im Zonen-Editor (Plan, Stufe 4, Platzhalter).
**Platzhalter:** alle Zahlen (Vorlauf, Glättung 20 m, Gewichte).

**Messungen alt gegen neu** (Stand 28.10., dieselben 45 Striche, dieselben Zonen):

| Maß | heutiger Pinsel | Strich 2 | Ziel |
|---|---|---|---|
| Vorschau je Aufruf, Median nach Linienlänge (Node) | 8,7 ms (0–99 m) … 61 ms (300–399 m) … 192 ms (800–899 m) | 3,9 … 5,4 … 2,6 ms (90 %: 10–32 ms; davon Abfragen am freien Ende 96 %) | konstant, weit unter 16,7 ms |
| davon Mesh-Aufbau (wächst mit der Länge, noch nicht inkrementell) | 0,5 … 2,7 … 7,7 ms | 0,4 … 2,2 … 5,2 ms | |
| Vorschau im Browser (Metal), Strich 4 Hügel 665 m | Median 37 ms, 90 % 122 ms | Median 15 ms, 90 % 23 ms (davon `setTrack` 5,5 ms) | |
| Bildrate am Handy-Bild, Strich 42 Bogenland 862 m | 39,6 fps, 14 % Bilder über 20 ms | 57,8 fps, 2 % über 20 ms | 60 fps |
| Plan beim Loslassen | 531 ms Median, max 1,1 s, Probefahrten bis 2,8 s | 17 ms Median, max 78 ms, keine Probefahrten | |
| Sprung beim Loslassen, Bild 90 % / max (Median je Strich) | 7,6 / 23,7 px, nach Probefahrten max 33 px | 0,0 / 4,4 px (nur am freien Ende und am Rundenschluss) | 0 |
| Sprung beim Loslassen, Tiefe max / Roll max (Median je Strich) | 16,0 m / 55° | 0,2 m / 11° | 0 |
| Abweichung Bahn–Strich im Bild, 90 % / 99 % | 4,6 / 23,7 px | 6,5 / 22,0 px | |
| Rückstand der Schienen hinter dem Finger, Median / 90 % | 72 / 134 px | 32 / 40 px | klein |
| Bewegung der gezeigten Bahn je Vorschau (älter als 15 m), max | 71 px, 23 m Tiefe | 10 px, 24 m Tiefe (nur offene steile Stücke, die sich als Kehre erklären) | 0 im festen Teil |
| Knicke (Radius unter 4 m) je Strich, Median | 131 | 83 | |
| Rollrate 90 % / Rollen je 100 m, Median | 3,4 °/m / 155° | 2,4 °/m / 102° | |
| Tiefenspanne / Tiefenumkehrungen je Strich, Median | 34 m / 12 | 20 m / 8 | |
| Fahrt geschafft (Probefahrt bis zum Ziel) | 1 von 45 (22 Stillstand, 15 Entgleisen, 3 Fall, 3 Kreuzung) | 0 von 45 (7 Stillstand, 14 Entgleisen, 16 Fall, 8 Kreuzung) | |
| Stützen gesetzt / Stützstellen ohne Fuß | 836 / 1598 | 691 / 531 | ohne Fuß 0 (Halter, Stufe P3) |

Lesart: Leistung, Sprung und Rückstand sind gelöst; die Form ist glatter (weniger Knicke, Rollen, Tiefenumkehrungen),
aber noch nicht fahrbar: Ohne Hebel kippen Kehren und Loopings häufiger (16 „Fall“, Zug zu langsam kopfüber), und die
Kreuzungsregel greift im offenen Vorlauf nicht immer (8 statt 3 Kreuzungen auf gleicher Höhe). Beides ist Stufe P1 und
P4, nicht der Kern. Die Abweichung im Bild (6,5 px) kommt vom eigenen Anschluss an die Station (5 m Gleiten) und ist
nicht größer als beim heutigen Pinsel. Am Mac-Bild lässt sich die Bildrate im headless Browser nicht zuschreiben
(Leerlauf 33 ms je Bild bei 3840×1926 px); dort zählt die Dauer je Vorschau. Das Handy-Budget ist geschätzt, nicht
gemessen: Bei rund 2–3-mal langsamerem Prozessor als dem M3 Pro blieben 4–8 ms Vorschau unter 16,7 ms, 61–192 ms nicht.

## 7. Stufenplan mit Toren

Muster wie `docs/ZONENEDITOR-PLAN.md`, Abschnitt 6: kein Kalender, Tore mit Handy-Messung, Replay und Florians Freigabe.

- **Stufe P1: Strich 2 als Pinsel der Zone (M).** Prototyp härten: Überzeichnen und Fortsetzen auf Strich 2, Kreuzungs-
  Chips (Seite tauschen heißt: Tiefe des späteren Strangs ab der Kreuzung neu, der Rest bleibt), Fels abschneiden,
  animiertes Nachziehen der festen Grenze, Vorlauf-Darstellung (Schienen fest, schwarze Linie offen). Kantenfelder je
  Ebene, damit `floorBelow` und Landung billig werden. **Tor P1:** auf dem Handy 60 fps bei 1000 m Linie; Replay der
  46 Striche: Sprung beim Loslassen 0 px und 0 m, Vorschau unter 5 ms im Median; Florian zeichnet eine Stunde in den
  drei Testszenen und sagt, ob der Vorlauf sich richtig anfühlt.
  **Status 30.10.:** zum Teil gebaut: Fortsetzen und Überzeichnen (Abschnitt 12), Vorlauf als Band (9, 10),
  Kantenfelder (13h), Kreuzungsregel (13c); die Vorschau liegt am Mac unter 5 ms (13h). Nicht gebaut:
  Kreuzungs-Chips, Fels abschneiden, animiertes Nachziehen (Paket 4). Tor P1 ist nicht abgenommen: headless am
  Handy-Bild 54 bis 60 fps bei 862 bis 1396 m (13i); das Replay der 46 Striche ist kein Maßstab mehr (Kopf). Ruht.
- **Stufe P2: Umgebung antwortet (M).** Kantenrollen (Lippe, Halter, Vorrang vorn) im Werkzeug D, Lückenprüfung in der
  Tiefenleiste, Material „grabbar“ durchfahrbar mit Höhlenmetern je Feld, Zähler im HUD. **Tor P2:** Szene 06 nachgebaut
  (Tor S4 des Editorplans) mit markierten Stellen; eine Bahn taucht ab, verschwindet hinter dem Berg und kommt mit
  Lippe wieder heraus; Budget stoppt den Strich rot.
  **Status 30.10.:** nicht gebaut. Szene 06 steht im Zonen-Editor als Vorschlag (Plan, Stufe 4), ohne
  Kantenrollen, Lippen und Höhlenmeter.
- **Stufe P3: Lippen und Halter (M, mit Stützen-Werkstatt Paket 3).** Portal-Vorlage je Material an der berechneten
  Lippe; Wand-, Decken- und Konsolenhalter aus Kantenrollen; Varianten als Teile. **Tor P3:** in den Testszenen unter 5 %
  schwebende Stützstellen (heute 66 %); Standbild vom Handy neben den Studien 15-wandkonsole und 15-doppelportal.
  **Status 30.10.:** Wand- und Deckenhalter baut der Zonen-Editor seit 30.10. als Platzhalter (Plan, Stufe 4); ihre
  Formen kommen mit dem Look (Florian, 30.10.). Lippen und Portal-Vorlagen gehören zur Plan-Stufe 7, nicht gebaut.
- **Stufe P4: Fahrt nachsichtig (S).** Querkraft aus Tiefenkrümmung gedeckelt, Höhe und Tempo wie heute; Inspector
  zeigt, was die Fahrt dennoch nicht schafft. **Tor P4:** Replay: Fahrt geschafft bei mindestens der Hälfte der
  Striche, die im Bild fahrbar aussehen (Florian markiert zehn).
  **Status 30.10.:** anders umgesetzt, als Paket 2 (Fahrregeln `drive`, Abschnitt 15): Antrieb und Stützräder,
  Querkraft ist ein Wert; auf den 78 Strichen kommen alle Bahnen an. Tor P4 ist nicht förmlich abgenommen.

**Risiken:** (1) Der Vorlauf fühlt sich zu zäh an, wenn steile Stücke lange offen bleiben (bis 90 m); Gegenmittel:
Vorlauf-Darstellung und eine kürzere Obergrenze. (2) Ohne Hebel scheitern mehr Fahrten; das ist gewollt, braucht aber
die nachsichtige Fahrt (P4) und klare Anzeigen. (3) Kehren mit kurzem Vorlauf sind rauer als heute (kein Wächter);
Messung im Prototyp (Tabelle). (4) Das Mesh wächst noch nicht inkrementell: bei 1000 m kostet `setTrack` 5–8 ms je
Vorschau, am Handy der größte Restposten (Stand 30.10.: weiter offen,
Paket 4). (5) Die Kameraneigung der Aufnahmen ist nicht aufgezeichnet; alle Replays
gelten für 26,6°.

## 8. Offene Entscheidungen für Florian

1. **Vorlauf sichtbar oder nicht:** Schienen bis zur Spitze (vorläufiger Teil bewegt sich leicht) oder schwarze Linie
   hinter der Spitze, Schienen erst, wo entschieden (`&vorlauf=1`)? Beides ausprobieren.
   **Status:** beantwortet (Abschnitte 9 und 10): Schienen erst, wo entschieden; der Vorlauf ist das pinke Band. Die
   Länge ist dynamisch und so kurz wie möglich (Florian, Abschnitt 14; Paket 1).
2. **Höhe gegen Tiefe:** Ab welcher Steilheit ist ein Strich Höhe (heute 15–40°, Prototyp 25°)? Und sollen Kehren
   immer durch die Tiefe gehen (Talblick) oder bei flacher Zeichnung auch als Hügel bleiben dürfen?
   **Status:** offen; gehört zur späteren Strich-Entscheidung in einer echten Zone (16h, Kopf).
3. **Nachsicht der Fahrt:** Querkraft aus der Tiefe deckeln (Arcade) oder streng lassen und mehr Fahrten scheitern
   lassen? **Beantwortet 29.10. (Florians Antwort 2, Abschnitt 15):** nachsichtig, Antrieb und Stützräder, Querkraft
   als Wert, Abbrüche nur für Sichtbares.
4. **Höhlenmeter:** Budget je Feld, Startwerte (Vorschlag: 60 m, nur Vorschlag).
   **Status:** offen, nicht gebaut.
5. **Mindestabstand spielbarer Ebenen** (Vorschlag: 4 m, nur Vorschlag) und was mit engeren Ebenen passiert.
   **Status:** offen, nicht gebaut; Florian zum Raum in den Zonen: „Mach das, was das Beste fürs Spiel ist.“
   (Abschnitt 14, Paket 5).
6. **Kantenrollen** im Werkzeug D: eine Taste mit Durchschalten (andocken, Lippe, Halter, Vorrang) oder vier Marken?
   **Status:** offen, nicht gebaut.
7. **Stützen- und Tunnelvarianten:** Teileliste und Materialien, erst nach der Stützen-Werkstatt (Paket 3).
   **Status:** offen. Für die Halter gilt seit 30.10.: Ihre Formen kommen mit dem Look (Florian, Plan Stufe 4).
8. Ob Strich 2 den heutigen Pinsel in `zoneneditor` ersetzt oder zunächst als Schalter dazu kommt.
   **Status:** entschieden am 29.10. (Abschnitt 11): Strich 2 ist in Ebenen-Zonen die Vorgabe, `&strich=1` nimmt
   Strich 1.

## 9. Nachtrag 28.10. abends: Florians erster Test des Prototyps

Florians Vorstellung nach seinem ersten Test (31 Striche): Die schwarze Linie ist immer genau der gezeichnete Strich; die
Bahn zeichnet später, wenn die Tiefe entschieden ist, und zieht in der saubersten Form nach. **Ergebnis:** Die drei
gemeldeten Fehler waren Fehler des Prototyps (Tinte am falschen Punkt, „Fels“-Sperre unter jeder Kante, Stocken) und sind
behoben; Strich 2 liest seitdem „Ebenen: Bodenhöhe“ wie Strich 1 und wählt den Abschnitt nach dem Ziel. Fahrbar war auf
diesen Strichen mit keinem der beiden Pinsel ein Strich. Ursachen, Änderungen und Nachspiel: wörtlich im Verlauf,
Abschnitt 9.

## 10. Nachtrag 28.10. spät: Knoten und Gummiband (Florians zweiter Test)

Florians zweiter Test (27 Striche, „fühlt sich deutlich besser an“) wünschte weniger Bearbeitungspunkte; ihm gefiel, wie
beim bisherigen Pinsel das pinke Band „wie Gummi zäh hinterherzieht und den Strich glättet“. **Ergebnis:** Strich 2
fittet die Knoten wie Strich 1 (`reduceNodes`), aber stückweise: Feste Segmente bleiben samt Knoten, neu gefittet wird
nur ab dem letzten festen Segment (G1 am Anschluss). Der ganze Vorlauf ist das pinke Band; es holt beim Anhalten nicht
auf, weil der Vorlauf Entscheidungszeit ist. Schalter `&fest=` (Vorgabe 2 m). Ursachen, Messungen und Lesart: wörtlich im
Verlauf, Abschnitt 10.

## 11. Nachtrag 29.10.: Strich 2 wird der Pinsel, Vorlauflänge gemessen (Florians dritter Test)

Florian hat am 29.10. früh 18 Striche in `test-huegel` gezeichnet (Stand 960ea46: gefittete Knoten, pinkes Band) und
gesagt: „gefällt mir schon ganz gut, braucht aber noch sehr viel Feintuning“. Auf die Frage Editor oder Strich fiel die
Entscheidung: hier der Strich (Stufe P1 ist der kritische Pfad von Editor-Stufe 4, Tor S4 braucht eine gezeichnete und
gefahrene Bahn durch Szene 06), die Editor-Session beginnt parallel mit Stufe 5 (Earle-Look). Damit ist Entscheidung 8
aus Abschnitt 8 gefallen: Strich 2 wird der Pinsel der Ebenen-Zonen. Seine Feintuning-Punkte hat er noch nicht genannt;
sie kommen nach seinem nächsten Zeichnen als Liste.

**Ergebnis:** Seit 29.10. zeichnet der Pinsel in Zonen mit Ebenenstapel ohne Parameter mit Strich 2; `&strich=1` nimmt
Strich 1, `&strich=2` erzwingt Strich 2 auch ohne Ebenen. Zonen ohne Ebenen bleiben bei Strich 1. Die Vorlauflänge (12,
8, 6 m) macht in Form, Sprung und Fahrt keinen messbaren Unterschied, nur das Band wird kürzer. **Verlauf:** Die Arbeit am
Strich parallel zur Editor-Stufe 5 endete am 29.10. abends (Kopf); Tor S4 gilt seit 30.10. mit eingefrorenem Strich und
prüft die Werkzeuge, nicht das Gefühl des Pinsels (Plan, Stufe 4). Geänderte Dateien, Messung und Zeiten: wörtlich im
Verlauf, Abschnitt 11.

## 12. Nachtrag 29.10. vormittags (9 Uhr): Fortsetzen und Überzeichnen auf Strich 2 (Stufe P1)

Florians Auftrag nach der Entscheidung: „Du machst hier mit Fortsetzen/Überzeichnen auf Strich 2 weiter.“

**Ergebnis:** Fortsetzen übernimmt die Knoten der alten Bahn wörtlich als feste Segmente und fittet erst ab dem Anschluss
(G1). Beim Überzeichnen bleibt die Bahn vor dem Anfasspunkt und hinter dem Ende wörtlich; der Strich endet genau am Ende,
in dessen Tiefe und Richtung, mit Vorschau während des Strichs. **Platzhalter:** Rückwärts Überzeichnetes und
Überzeichnen über die Naht einer Runde nehmen weiter Strich 1. **Offen (Entscheidung für Florian):** Wer schräg zum
Vorgabestück loszeichnet, bekommt einen kurzen Haken; eine Richtungs-Angleichung der ersten Meter wäre eine Änderung an
seinem Strich selbst und ist darum nicht gebaut. Befund, Änderungen und Nachspiel: wörtlich im Verlauf, Abschnitt 12.

## 13. Nachtrag 29.10. vormittags (10 Uhr): Kreuzungen, Knotenzahl, Ruckeln beim Bearbeiten (Stufe P1)

Florians Auftrag: „Mach hier mit den Kreuzungen weiter: Stränge um ganze Spuren trennen, wo Platz ist (weniger enge
Knoten, weniger Abbrüche an Kreuzungen).“ Und mittendrin: „Kreuzungen sind aktuell recht frustrierend. Es entstehen sehr
viele und die Punkte sind insgesamt viel zu hoch. Das waren sie selbst bei Strich 1. … es sollte eigentlich so gut wie
keine Kreuzungen geben. Und die weißen Bearbeitungspunkte sollten wirklich nur da liegen, wo sie nötig sind. Die
Performance bei der Bearbeitung über die Punkte ist ganz schlecht, es ruckelt und stockt.“

### 13a. Was die Fahrt als Kreuzung zählt, und woher sie kamen

Die Fahrt (`findCrossings`) zählt eine Kreuzung auf gleicher Höhe, wenn sich zwei Stränge in der Draufsicht (x und
Tiefe) schneiden oder näher als 1 m aneinander laufen und ihre Höhen dort unter 3,2 m auseinanderliegen; ein Looping
mit Kopfüber-Stück dazwischen ist ausgenommen. Die Nachspiel-Messung gibt die Kreuzungen jetzt je Strich aus
(`crossings`: Bogenlängen, Abstand auf der Bahn, Höhenunterschied, Tiefe der Linie an beiden Stellen).

Diagnose auf Florians 34 Strichen vom Vormittag (alte Regel): 43 Kreuzungen auf gleicher Höhe, 1,3 je Strich; 29 davon
zwischen Stellen, die mehr als 200 m auseinanderliegen (der Strich kommt zurück und kreuzt Früheres), nur 5 in Schleifen
unter 40 m. Bei 26 von 43 war die Linie an der Stelle selbst getrennt (bis 12 m Tiefenunterschied), die fertige Bahn
kreuzte trotzdem: Die Regel galt nur punktweise im ±1-m-Fenster der Bildkreuzung, und die Seite (vorne oder hinten)
wurde je 12-Punkte-Bündel neu entschieden. Wechselt sie entlang einer flachen Kreuzung, müssen sich die Tiefenkurven
wenige Meter daneben schneiden.

### 13b. Erster Umbau, ehrlich: schlechter

Ganze Spur (8,4 m) für jedes im Bild nahe Paar war auf 21 Strichen messbar schlechter (mehr Kreuzungen und Knicke) und ist
verworfen. Zahlen: wörtlich im Verlauf, Abschnitt 13b.

### 13c. Zweiter Umbau: kleiner Versatz robust, ganze Spur nur an sauberen Kreuzungen

- **Fenster:** Der kleine Versatz (seitlich 2,2 m oder in der Höhe 3,8 m) gilt für jeden früheren Punkt, der im Bild nah
  ist, in ±6 m x-Fenster, nicht nur im ±1-m-Fenster.
- **Seite erben:** Die Seite einer Begegnung (vorne oder hinten) wird einmal entschieden und an die Nachbarbündel vererbt
  (derselbe Strang ein Stück weiter vorn oder hinten); vorher entschied jedes 12-Punkte-Paar neu. Das war die eigentliche
  Ursache der flachen Kreuzungen: Der neue Test „flache Kreuzung unter 9°“ hatte mit Fenster allein noch 3 Kreuzungen,
  mit Erben 0.
- **Versuch Lücken, verworfen:** Auf den 31 Schleifen-Strichen blieben mit der Seiten-Regel 215 Kreuzungen, und in 168 von
  178 zugeordneten galt die Regel, die Linie war trotzdem nicht getrennt: Bei mehreren früheren Strängen in Reichweite
  widersprechen sich die Schranken (vor dem einen, hinter dem anderen). Darum ein Versuch, je Punkt alle verbotenen
  Tiefenbänder zu vereinigen und die Lücke zu wählen, die die vorige Tiefe enthält, erst ohne, dann mit Gedächtnis je
  Punkt. Gemessen: 31 Striche 375 und 478 Kreuzungen statt 215, 27 Striche 202 und 298 statt 129, Knicke 313 und 361
  statt 301. Die Wahl der Lücke kippt von Vorschau zu Vorschau, und das Gedächtnis macht es noch starrer und schlechter.
  Verworfen; die Seiten-Regel bleibt. Die Restkreuzungen in dichten Schleifenhaufen sind eine offene Stelle von P1.
- **Freie Nachbarn:** Liegt der frühere Punkt noch im Vorlauf (seine Tiefe ändert sich mit), wird zweimal gelöst; der
  zweite Durchgang sieht die neue Tiefe (Schleifen innerhalb der 12 m).
- **Ganze Spur** nur an sauberen Kreuzungen: mehr als 40 m auseinander auf dem Strich (keine Schleife des Strichs selbst),
  die Stränge kreuzen sich im Bild schräg (Winkel ab 30°), und der freie Raum hat Platz für 8,4 m; sonst der kleine
  Versatz. Test „schräge Kreuzung unter 35°“: eine Spur Abstand, keine Kreuzung auf gleicher Höhe.
- **Toleranz an Kreuzungen 0,3 statt 0,12 m** (`TOL_NEAR`), dafür `PASS_OVER` 3,8 statt 3,5 m: Die Fahrt zählt erst unter
  1 m seitlichem Abstand; 2,2 m minus zweimal 0,3 m bleiben 1,6 m, in der Höhe 3,8 − 0,6 = 3,2 m (Durchfahrt). Die enge
  Toleranz 0,12 erzwang viele kurze Segmente, also Knoten.
- **Platzhalter:** Winkelgrenze 30°, Schleifengrenze 40 m, Fenster 6 m sind gesetzt, nicht gemessen. Schleifen kürzer als
  8 Linienmeter (NEIGHBOR) bleiben ohne Regel: ein Strich, der sich binnen 8 m selbst schneidet, ist mit 4 m Mindestradius
  ohnehin nicht fahrbar.

### 13d. Knotenzahl: Woran sie wirklich hängt

Die Toleranz ändert die Knotenzahl nicht; die Knoten kommen aus den Schleifen des Strichs (ein kubisches Segment dreht
höchstens 180°). Der Knoten-Fit ist einstellbar (`&tol=`, `&even=`, `&span=`, `&turn=`), Vorgabe 150 m / 180°. Varianten
und Zahlen: wörtlich im Verlauf, Abschnitt 13d.

### 13e. Ruckeln beim Bearbeiten über die Punkte

Bearbeiten über Knoten und Griffe baute die ganze Bahn je Zeigerereignis neu (14 ms, bis 120 Ereignisse je Sekunde). Jetzt
merkt das Ereignis nur vor; die Bahn wird einmal je Bild leicht neu gebaut und beim Loslassen ganz (0,2 ms je Ereignis,
10,5 ms je Bild bei 251 m). Bei 500 m sind es rund 20 ms je Bild, das Mesh wächst noch nicht inkrementell (Paket 4).
Messung: wörtlich im Verlauf, Abschnitt 13e.

### 13f. Ergebnis

Auf 17 Strichen fielen die Kreuzungen auf gleicher Höhe von 11 auf 3, 15 von 17 Strichen haben keine mehr; dafür mehr
Knicke (63 → 78) und Tiefenspanne (20 → 25 m). Auf den Schleifen-Sätzen bleibt rund ein Drittel bis die Hälfte der
Kreuzungen, in dichten Schleifenhaufen. Tabellen und Lesart: wörtlich im Verlauf, Abschnitt 13f.

### 13g. Vorschau-Kosten und Restkreuzungen (Florians zweiter Auftrag: „Vorschau wieder unter 5 ms, Restkreuzungen in dichten Schleifenhaufen“)

Nicht der Löser war teuer, sondern die Abfragen an Ebenen und Feld. Abfragen einmal je endgültigem Linienpunkt, Löser auf
dem Band, Fit bis zur Spitze (gezeigt bis zum festen Teil): Vorschau 3,0 ms im Median auf den 31 Schleifen-Strichen. Die
Restkreuzungen in dichten Schleifenhaufen sind strukturell (rund 1000 Schranken-Konflikte je Strich); zwei Rückfälle sind
gemessen und verworfen. Messung und Endstand: wörtlich im Verlauf, Abschnitt 13g.

### 13h. Kantenfelder je Ebene: das Freiraumfeld wird billig (Florians dritter Auftrag, abgestimmt mit der Editor-Session)

**Befund:** `PlaneField.freeLanes` tastet je Strichpunkt den Strahl in 200 Spurschritten ab und prüfte je Schritt (zweimal,
Punkt und Punkt unter der Mindesthöhe) alle Flächen jeder Ebene mit Punkt-in-Polygon; die aus Kurven abgeflachten
Flächen der Testzonen haben zusammen 12 000 bis 16 500 Eckpunkte. Gemessen (300 Zufallspunkte je Zone, ohne
Perspektive): 2,4 ms (`test-huegel`), 1,4 ms (`test-grotte`), 1,2 ms (`test-boegen`) je Aufruf; `solid` bis 25 µs,
Landung und Bodenhöhe 0,05 ms.

**Gebaut** (`src/zone/planeStack.ts`, `AreaIndex`, `inAreas`): ein Rasterindex je Ebene und Flächenliste (feste, gefüllte,
Hüllen mit Öffnung), 128 Zellen auf der längsten Seite, beim ersten Zugriff gebaut und am Ebenenstapel gespeichert
(er wird mit dem Stapel neu gebaut, `level.ts` tut das je Ebenenänderung). Jede Zelle weiß, ob sie sicher in einer
Fläche liegt, sicher in keiner, oder ob eine Kante durch sie läuft; nur dann wird exakt geprüft, und nur gegen die
Flächen, die dort eine Kante haben. Zellen ohne Kante sind einheitlich innen oder außen: Flutfüllung je Fläche ab einer
exakt geprüften Zellmitte; Kanten markieren alle Zellen ihrer Hülle, eher zu viele als zu wenige. Die Antwort ist damit
identisch mit der direkten Rechnung, die als `inArea` für den Vergleich bleibt. Alle Abfragen der Ebenen gehen darüber:
Landung, Bodenhöhe, Höhlenmund, Freiraum, Boden unter dem Punkt, Decke.

**Die vier Bedingungen der Editor-Session:** (1) Landung, Bodenhöhe, tiefste Andockkante und Fundament liefern dieselben
Ergebnisse: Sie rufen dieselbe Punkt-in-Fläche-Frage, und ein Test prüft den Index gegen die direkte Rechnung auf den
Fixturen (Rechteck mit Loch) und auf allen Ebenen und Listen der drei Testzonen (Zufallspunkte mit Rand, dazu Punkte
dicht an Eckpunkten); die bestehenden Tests zu Landung, Bodenhöhe und Stützen bleiben grün. (2) `freeLanes` behält
Bedeutung und Rückgabe, beide Aufrufer sind unverändert. (3) Der Index lebt am Stapel, nicht global; er entsteht beim
ersten Zugriff nach jedem Neubau des Stapels. (4) Szenarien und Tests siehe Absicherung unten.

**Gemessen danach:** `freeLanes` 0,02 bis 0,03 ms je Aufruf (60- bis 100-mal weniger), `solid` 0,1 µs, Landung und
Bodenhöhe 0,01 ms. Der Aufbau aller Indizes einer Zone kostet einmal 30 bis 80 ms (bei 256 Zellen je Seite 55 bis 128
ms, darum 128), beim ersten Strich nach einer Ebenenänderung; der Aufbau des Stapels selbst kostet 25 bis 80 ms.

**Nachspiel** (31 Schleifen-Striche, Stand 13g gegen Stand mit Rasterindex, freie Maschine): Vorschau 3,0 → **0,9 ms** im
Median, 90 % 11,5 → 2,8 ms; davon Abfragen 2,5 → 0,2 ms, Knoten-Fit 0,3, Löser 0,1. Knoten 83 → 83, Knicke 310 → 310,
Rollen, Tiefenspanne, Sprung und Fahrten gleich; Kreuzungen 179 → 178 (eine Vorschau mehr im Takt der Messung). Tor P1
„Vorschau unter 5 ms im Median“ ist damit am Mac mit Abstand erfüllt; die Handy-Messung bei 1000 m folgt in 13i.

Absicherung und nicht Geprüftes: wörtlich im Verlauf, Abschnitt 13h.

**Nachtrag:** Der Index wird jetzt in einem Leerlauf-Tick nach jedem Neubau des Ebenenstapels vorgebaut
(`indexPlaneStack` in `level.ts`, `requestIdleCallback` mit 500 ms Frist, sonst nach 50 ms; ein inzwischen neu gebauter
Stapel baut seinen eigenen), damit auch der erste Strich nach einer Ebenenänderung nicht wartet. Die Editor-Session hat
aa5810a geholt und die Bedingungen im Diff bestätigt. Geprüft: 466 Tests, Build, Szenarien 11 und 24–28 (43 Prüfungen).

### 13i. Handy-Messung für Tor P1 (Florians Auftrag: „60 fps bei 1000 m Linie mit Strich 2, headless am Handy-Bild“)

Headless am Handy-Bild (852 × 393 @3, Metal auf dem Mac, also eine obere Schranke): Strich 2 54 bis 60 fps bei 862 bis
1396 m Linie, 0 bis 6 % Bilder über 20 ms; Strich 1 40 bis 50 fps mit 10 bis 15 % und Einfrieren nach dem Loslassen. Der
Rest kommt vom Neubau des ganzen Schienen-Meshs je Vorschau (`setTrack` und Abtastung), nicht vom Strich. Den festen Teil
im Renderer zu behalten ist Paket 4 (Florian: „OK, Voraussetzung ist, dass die Bahn schön smooth und fahrbar bleibt.“,
Abschnitt 14), nicht gebaut. Tabelle und Lesart: wörtlich im Verlauf, Abschnitt 13i.

## 14. Nachtrag 29.10. nachmittags (14 Uhr): Florians Antworten und Paket 1, der dynamische Vorlauf

Florians Antworten auf die Empfehlung aus Abschnitt 13 (29.10. mittags), in seinen Worten: (1) „Der Vorlauf sollte
dynamisch sein … je kürzer, desto besser ist das Zeichengefühl, und es sollte immer so lange sein, wie es nötig ist, um
die Strecke optimal zu zeichnen … im Zweifel 6 … Es dauert sehr lange, bis die Bahn am Anfang meinem Strich folgt. Das
sollte auch dynamischer sein“; dazu: „kann der Anfang der Bahn auch animiert dem Pinsel folgen und nicht solche Sprünge
machen?“ (2) Fahrt: „Ja auf jeden Fall. Es ist gerade kaum möglich, eine funktionierende Bahn zu machen. Es soll nur
gewollte Loopings geben, sonst sollte die Bahn keine unnötigen Überkopffahrten erzeugen. Das Entgleisen und
Zurückrollen passt nicht zur Perspektive. Hier noch mal richtig recherchieren, was die beste Lösung in unserem Fall ist.“
(3) Schleifen unter dem Mindestradius: „Ok, versuchen wir es so.“ (4) Mesh inkrementell: „OK, Voraussetzung ist, dass
die Bahn schön smooth und fahrbar bleibt.“ (5) Raum in den Zonen: „Mach das, was das Beste fürs Spiel ist.“

Reihenfolge der Pakete: 1 dynamischer Vorlauf und schneller Start, 2 Fahrt (Recherche, dann Umbau), 3 Schleifen als
gewollte Loopings mit Mindestradius, 4 Mesh inkrementell mit animiertem Nachziehen des Schienenanfangs (Florians Bitte),
5 Raum in den Zonen nach dem Ergebnis der ersten vier.

**Stand 30.10.:** Die Pakete 1 bis 3 sind gebaut (14a, 15, 16), die Pakete 4 und 5 nicht; sie ruhen mit dem
Strich.

### 14a. Paket 1: Vorlauf dynamisch, Start sofort

**Gebaut** (`src/track/strich2.ts`, `freezeLimit`): Wo in den letzten 12 m nichts zu entscheiden ist, wird schon
`LOOK_SHORT` 3 m hinter der Spitze fest; liegt ein anderer Strang in Reichweite (Kreuzungsschranke), `LOOK_BASE` 6 m
(Florians „im Zweifel 6“); bei einem steilen Punkt, einer Richtungsumkehr in x oder einer Tiefe, die noch mehr als
0,5 m von ihrem Ziel entfernt ist (etwa nach einer Stufe der Bodenhöhe), der volle Vorlauf von 12 m (`&vorlaufm`). Ein
offenes steiles Stück blockiert das Festwerden wie bisher. Die erste Vorschau kommt nach 3 statt 6 Linienmetern
(`MIN_LINE`). Beides Platzhalter, bis Florian es gezeichnet hat.

**Ergebnis:** In Form und Fahrt ist der dynamische Vorlauf auf den Strichen unsichtbar; er ändert nur, wann die Schienen
kommen (die ersten nach rund 4 Linienmetern). Das Band bleibt lang (Median 13,9 m), weil ein offenes steiles Stück nicht
fest wird; `&freezemax=40` kürzt das obere Zehntel, kostet aber Knicke, darum nur ein Schalter. Das vordere Schienenende
rückt noch in Sprüngen vor; das gehört zu Paket 4 (animiertes Nachziehen). Begründung, Browser-Test, Nachspiel und
Absicherung: wörtlich im Verlauf, Abschnitt 14a.

## 15. Paket 2: Die Fahrt. Recherche, Umbau und Messung (29.10., 14:30 Uhr)

Florians Antwort 2 (Abschnitt 14): Die Fahrt soll „auf jeden Fall“ neu gedacht werden, nur gewollte Loopings, keine
unnötigen Überkopffahrten; „das Entgleisen und Zurückrollen passt nicht zur Perspektive“; vorher „richtig
recherchieren, was die beste Lösung in unserem Fall ist“. Dieser Abschnitt ist die Recherche, der Vorschlag, der
Umbau (hinter einem Schalter, Vorgabe neu) und die Messung alt gegen neu auf den drei Strichsätzen.

### 15a. Befund: Was die strenge Fahrt auf deinen Strichen tut

Die Fahrt bis heute (`src/physics/trainSim.ts`) kennt vier Abbrüche aus der Bahnform: **Entgleisen** (Querkraft im Wagen
über der Grenze des Schienentyps, Holz 2,0 g bis Weltraum 3,5 g), **Fall** (kopfüber und länger als 0,12 s weniger
als −0,15 g im Sitz), **Stillstand** (Tempo unter 0,03 m/s im Rollen: der Zug rollt zurück) und **Auffahren** (Kreuzung
auf gleicher Höhe, Höhenunterschied unter 3,2 m). Dazu kommen offenes Ende, Wasser ohne Splash, Wand und Kette.
Auf deinen Strichen, mit Strich 2 und dem Stand nach Paket 1 (`--fahrt strict`):

| Satz | Striche | angekommen | Abbrüche | Stelle des Abbruchs (Median) | Länge (Median) |
|---|---|---|---|---|---|
| 21 heute früh (29.10.) | 21 | 1 | Fall 9, Entgleisen 8, Stillstand 2, Auffahren 1 | 94 m | 348 m |
| 27 neue (28.10. spät) | 27 | 0 | Fall 9, Entgleisen 8, Stillstand 6, Auffahren 4 | 72 m | 498 m |
| 31 alte (28.10. abends, Schleifen) | 30 | 0 | Auffahren 13, Entgleisen 7, Fall 6, Stillstand 4 | 70 m | 756 m |

Fast jede Fahrt endet im ersten Fünftel der Bahn, bevor man von der eigenen Bahn etwas gesehen hat. Die Ursachen sind
in unserer Perspektive nicht sichtbar: Ob eine Schleife 4 oder 8 m Radius hat, wie hoch ein Hügel in Metern ist, wie
schnell der Zug dort sein wird und ob die Schräglage reicht, entscheidet die Lesung des Strichs (Höhe gegen Tiefe,
Abschnitt 6), nicht die Hand. Die Regeln aus dem großen Plan 4.7 (Entgleisen selten, Schwachstellen-Marker beim
Zeichnen, Vorab-Fahrt warnt „hier zu schnell“) stammen aus der Zeit der Seitenansicht, in der Höhe und Radius im Bild
standen. Mit Ebenen-Zone und gekippter Kamera gilt das nicht mehr, und ein Zug, der abfliegt oder rückwärts den Berg
hinunterrollt, liest sich im Bild falsch (Florians Satz zur Perspektive).

### 15b. Was andere tun (Quellen, geprüft soweit erreichbar)

- **RollerCoaster Tycoon / OpenRCT2:** g-Kräfte sind nie ein Abbruch, nur Bewertung. Im Quelltext der Bewertung
  (`RideRatings.cpp`) erhöht eine Querkraft über 2,80 g die Intensität um 3,75 und die Übelkeit um 2,00, über 3,10 g
  wird die Spannung halbiert und negativ; nichts in dieser Datei lässt einen Zug abstürzen. Ein zu langsamer Zug
  rollt zurück und pendelt im Tal (aus dem Spiel bekannt, nicht nachgeschlagen); Crashs gibt es an offenen Enden und
  bei Zusammenstößen. Quelle: https://github.com/OpenRCT2/OpenRCT2/blob/develop/src/openrct2/ride/RideRatings.cpp
- **Rollercoaster Creator (Spil Games, 2008, Flash):** Bahn mit dem Stift zeichnen, dann Physik laufen lassen, Münzen
  sammeln; „a track that makes the coaster crash ends the level“. Es funktioniert, weil die Seitenansicht Höhe und
  Radius so zeigt, wie die Physik sie rechnet. Quellen: https://kizi.com/games/rollercoaster-creator,
  https://gigazine.net/gsc_news/en/20080528_rollercoaster_creator
- **RollerCoaster Tycoon Touch (Atari, Handy):** Bahn „mit einem Finger zeichnen“ (Spline-Editor). Nutzerkritik auf
  Metacritic: Die gezeichneten Bahnen „don't abide by the laws of physics“, das Zeichnen sei „fun but a little buggy“.
  Dieselbe Spannung wie bei uns: Zeichenfreiheit gegen physikalische Plausibilität. Quellen:
  https://atari.com/products/rollercoaster-tycoon-touch, https://www.metacritic.com/game/rollercoaster-tycoon-touch/
- **Coaster Crazy (Frontier, 2012, iOS):** Bahn aus Teilen, Physikfahrt, Punkte. Rezensionen (TouchArcade, 148Apps,
  Pocket Gamer) beschreiben es als Rätselspiel; als Frust nennt eine davon, dass unklar bleibt, warum eine Bahn
  schlecht bewertet wird (Suchergebnis, Rezension nicht einzeln gelesen). Unlesbare Regeln frustrieren auch ohne
  Abbruch. Quellen: https://toucharcade.com/2012/11/26/coaster-crazy-review/, https://148apps.com/reviews/coaster-crazy-review
- **Sonic (klassisch):** Loopings brauchen Mindesttempo; an Wand oder Decke unter 2,5 Pixel je Bild fällt Sonic ab
  (Sekundärquelle, der Sonic Physics Guide selbst war für mich gesperrt). Die Arcade-Regel funktioniert, weil das Tempo
  sichtbar und in der Hand des Spielers ist. Quellen: https://info.sonicretro.org/Sonic_Physics_Guide,
  https://threadreaderapp.com/scrolly/1747731331851678170, https://www.snexplores.org/article/sonic-the-hedgehog-physics-speed-loops
- **Echte Bahnen:** Seit Millers Stützrad-Patent (1919) umfassen drei Radsätze die Schiene (Lauf-, Seiten-,
  Stützräder); ein Zug fällt nicht aus dem Looping und entgleist nicht durch Querkraft. Querkraft ist eine
  Komfortgrenze: ASTM F2291 lässt (nach Sekundärquellen) etwa ±1,5 g seitlich zu, und Schräglage nimmt sie heraus.
  **Powered Coaster** (Mack Rides): Antrieb im Zug, „full control over speed and timing“, „no lift hill needed“: Der
  Zug fährt jede Form der Bahn mit dem Tempo, das man ihm gibt. Quellen: https://en.wikipedia.org/wiki/Underfriction,
  https://www.mack-rides.com/products/powered-coaster, https://store.astm.org/f2291-26.html (Norm, kostenpflichtig),
  https://thrillzing.com/science/roller-coaster-g-forces-explained/ (Sekundärquelle für die 1,5 g)
- **Spielgestaltung:** Juul (The Art of Failure, 2013): Gute Spiele versprechen eine faire Chance; Scheitern muss der
  Spieler sich selbst zuschreiben können. Ein Abbruch aus einer Ursache, die er nicht sehen konnte, bricht dieses
  Versprechen. Quelle: https://interactingminds.au.dk/events/single-events/artikel/failing-and-confusion-in-games-and-gaming

### 15c. Was das für uns heißt: drei Wege

| Weg | Was passiert | Für | Gegen |
|---|---|---|---|
| **A. Streng plus Warnung** (Plan 4.7) | Physik wie heute, Marker und Vorab-Fahrt warnen | ehrliche Physik, Spannung „schafft er es?“ | Warnungen zeigen Ursachen, die der Spieler nicht steuern kann (Radius, Höhe, Tempo sind Lesung); 95 % Abbrüche im ersten Fünftel; Abflug und Rückroller passen nicht zur Perspektive |
| **B. Antrieb und Stützräder** (Powered Coaster) | Energie bleibt (Abfahrt macht schnell, Hügel langsam), aber der Zug fällt nie unter ein Mindesttempo, bleibt auf der Schiene, hängt kopfüber statt zu fallen, fährt ebene Kreuzungen; g und Hängen sind Werte (Schreien), keine Abbrüche | jede Bahn kommt an, der Spieler sieht seine ganze Bahn, Humor statt Neustart (Plan 4.7: „Schreien ist kein Scheitern“), echtes Vorbild | Kriech-Momente am Berg und im zu langsamen Looping (Cartoon-Logik), die Kettenzugstärke begrenzt die Fahrt nicht mehr (muss ins Zeichnen) |
| **C. Arcade-Konstanttempo** | Tempo nur aus dem örtlichen Gefälle, keine Energie | einfachste Regel, nie ein Abbruch | kein Schwung über den nächsten Hügel, Höhe und Drop verlieren Bedeutung, fühlt sich nicht nach Achterbahn an |

**Empfehlung: B**, und so gebaut. A ist Florians Antwort nach abgelehnt, C nimmt dem Spiel die Achterbahn. Scheitern
bleibt für das, was der Spieler sieht und entscheidet: offenes Ende (Absperrband), Wasser ohne Splash, Wand, verfehlte
Schanze (Plan 4.3) und Kollision im Schlangenbereich (Plan 4.7).

### 15d. Umbau: Fahrregeln `drive` (gebaut, Vorgabe)

- `RIDE_TUNING = { rules: 'drive', driveSpeed: 4 }` in `src/physics/trainSim.ts`, je Fahrt überschreibbar
  (`rules`, `driveSpeed` in den Optionen). URL: `&fahrt=1` ist die strenge Fahrt wie bisher, `&antrieb=` das
  Mindesttempo in m/s (Vorgabe 4 m/s = 14 km/h); Messung: `--fahrt strict|drive`, `--antrieb`.
- Unter `drive`: kein Entgleisen (die Querkraft steht in `maxLatG` und je Wagen), kein Fall (kopfüber ohne Andruck
  heißt hängen, Airtime und Inversionen zählen weiter), kein Stillstand (der Antrieb hält im Rollen mindestens
  `driveSpeed`, außer vor dem offenen Ende, wo Radblockade und Kippen gelten), kein Auffahren (die Kreuzungsliste
  wird gar nicht gerechnet, eine Kreuzung auf gleicher Höhe ist eine ebene Kreuzung). Der Antrieb schreibt
  `stats.driveM` (geschobene Meter) und die Ereignisse `driveStart`/`driveEnd`, damit Darstellung und Ton später
  darauf reagieren können; heute ist er unsichtbar. Die Kette, der Launch, Booster, Bremse, Splash, Rückführung und
  das offene Ende bleiben, wie sie waren. Der Fehlgrund „Kette reicht nicht“ kann unter `drive` nicht mehr eintreten.
- `src/track/inspect.ts`: Die Querkraft-Marker (Schwachstellen im DEV-Modus) gibt es nur noch unter `strict`.
- Tests: sechs bestehende Dateien (physics, chain, crossings, inspect, slices, brush) prüfen ausdrücklich die strenge
  Fahrt und setzen `RIDE_TUNING.rules = 'strict'`; neu `tests/fahrt.test.ts` (sechs Tests: Vorgabe, Kriechen über den
  zu hohen Hügel mit Mindesttempo und Ereignissen, ebene Strecke, einstellbares Mindesttempo, keine Entgleisung in der
  engen Kehre, kein Fall im zu langsamen Looping). Szenario 8 (Entgleisen auf Holz) öffnet das Level mit `fahrt=1`,
  weil es den Abflug prüft; Szenario 1 (Oval am Boden) erwartete den Stillstand und prüft jetzt, dass der Antrieb den
  Zug mit 14 km/h um die Runde bringt.
- **Absicherung (29.10.):** wörtlich im Verlauf, Abschnitt 15d.

### 15e. Messung alt gegen neu (dieselben Striche, dieselben Bahnen; nur die Fahrt unterscheidet sich)

Mit `drive` kommen alle Bahnen an (21 von 21, 27 von 27, 30 von 30); der Antrieb greift auf fast allen Strichen ein, aber
kurz (4 bis 7 % der Länge). Offen bleiben die Überkopffahrten, die der Strich nicht als Schleife gezeichnet hat (Paket 3),
Querkraft-Spitzen von 9 bis 17 g an Knicken (Form) und die Schräglage, die ein Zehntel der Zeit am Anschlag liegt
(Stilprobe). Tabelle und Lesart: wörtlich im Verlauf, Abschnitt 15e.

### 15f. Offene Entscheidungen für Florian (Status am Ende)

1. **Mindesttempo:** 4 m/s (14 km/h) ist mein Vorschlag, langsam genug, dass eine Kuppe sich langsam anfühlt, schnell
   genug, dass 100 m Kriechen keine halbe Minute dauern. Im Spiel per `&antrieb=` fühlen.
2. **Kettenzugstärke:** Mit Antrieb ist „Kette reicht nicht“ kein Abbruch mehr; die Höhengrenze gehört ins Zeichnen
   (Plan 2.4 und Zielart „Höhe ≥“: „Grenze durch Kettenzugstärke sichtbar“, Linie beim Zeichnen). Empfehlung: Strich 2
   deckelt die Höhe an der Kettenlinie (Paket 5 oder eigenes Paket); bis dahin gilt die Grenze in der Fahrt nicht.
3. **Ebene Kreuzungen:** Der Zug fährt durch. Im gemalten Look ist das ein Kreuzungsdiamant (Stilprobe), die
   Pakete 1 bis 3 halten die Zahl klein. Alternative: Auffahren bleibt ein Abbruch (`&fahrt=1`-Verhalten einzeln).
4. **Schräglage-Deckel** 80° oder 60°: Stilprobe in der Zone.
5. **Sichtbarer Antrieb:** Ob der Antrieb hörbar oder sichtbar sein soll (Summen, kleine Funken) oder still bleibt
   (wie bei Powered Coastern, die einfach fahren). Ereignisse sind da.

**Status (Abschnitt 16):** Mindesttempo bleibt 4 m/s, Schräglage 80° und stiller Antrieb bis zur Stilprobe
(Florians Antworten zu den Punkten 1, 4 und 5). Die Kettenlinie ist seit Paket 3 ein Deckel in Strich 2 (16d; sie
greift erst in Feldern mit Aufwertungsstufe, Punkt 2). Punkt 3 (ebene Kreuzungen) ist offen.

**Entscheidung 3 aus Abschnitt 8** (Nachsicht der Fahrt) ist damit durch Florians Antwort 2 und diesen Umbau
beantwortet: nachsichtig, mit Antrieb und Stützrädern, Querkraft als Wert.

## 16. Paket 3: Schleifen als Loopings, Kehren, Kettenlinie (29.10., 17 Uhr)

Florians Auftrag (29.10.): „gezeichnete Schleifen als gewollte Loopings mit Mindestradius 4 m, Restkreuzungen als
Brücken wo ein Höcker passt (eben nur als letzter Ausweg, nie ein Abbruch), Kettenlinie als Deckel in Strich 2,
echter Schleifen-Zähler in der Messung.“ Dazu seine Antworten: Mindesttempo bleibt 4 m/s, Schräglage 80° und stiller
Antrieb bis zur Stilprobe.

### 16a. Befund: Woher die ungewollten Überkopffahrten kamen

Die Messung aus Abschnitt 15 ordnet jede Inversion der Fahrt (Antrieb, ganze Bahn) dem nächsten Linienpunkt zu und
schaut, was der Strich dort tut (Einteilung nach `findElements` des bisherigen Pinsels: Looping = hoch und nach oben
gezeichnete Schleife, Bodenschleife = sonstige Schleife; Kehre = Umkehr in x innerhalb von ±15 m ohne Schleife):

| | 21 heute früh | 27 neue | 31 alte |
|---|---|---|---|
| Inversionen gesamt | 137 | 470 | 606 |
| davon in gezeichneten Loopings | 10 | 34 | 50 |
| in Bodenschleifen (flach oder hängend gezeichnet) | 50 | 147 | 276 |
| an Kehren ohne Schleife | 58 | 166 | 147 |
| sonst (steile Stücke ohne Umkehr) | 19 | 123 | 133 |
| gezeichnete Loopings / Bodenschleifen | 11 / 30 | 28 / 145 | 26 / 157 |
| Radius der Loopings: Median / 10 % / unter 4 m | 3,1 m / 2,2 m / 8 von 11 | 3,7 / 2,3 / 18 von 28 | 4,5 / 2,4 / 11 von 26 |

Nur ein Zehntel der Inversionen lag in Loopings, die als solche gezeichnet waren. Der Rest hatte zwei Ursachen, beide
in der Lesung von Strich 2 (Abschnitt 6):

- **Jeder Kringel wurde eine Kehre.** Ein steiles Stück mit Umkehr in x galt als Kehre, sobald die Gegenrichtung drei
  Punkte hielt, also am Scheitel des Kringels, bevor er sich schließt. Die erste Hälfte des Kringels fror als Halbkreis
  durch die Tiefe ein (Tiefe 2 × Weite, bis 25 m), die zweite Hälfte kam mit der Bodenhöhe zurück: ein in die Tiefe
  verdrehter Halbbogen, kopfüber am Scheitel, und dazu die Kreuzung des Kringels mit sich selbst.
- **Kehren selbst.** Ein hohes schmales U (10 m hoch, 3 m weit) bekam 6 m Tiefe und 10 m Höhe: senkrechte Schenkel,
  oben eine Wende über die Kuppe. Geometrisch ist das ein halber Looping, der Wagen hängt danach unter der Schiene; der
  Schienenrahmen (Parallel-Transport in `sampleTrack`) zeigt genau das.

Dazu die Radien: Florians Kringel sind klein, der Median liegt bei 3 bis 4,5 m, ein gutes Drittel unter dem
Mindestradius; ohne Aufweiten wären sie als Loopings nicht fahrbar.

### 16b. Gebaut: Schleifen in Strich 2

- **Erkennung** (`findLoops`, je Vorschau nur die neuen Linienstücke gegen die bis 160 m davor): Kreuzt die 1-m-Linie
  sich selbst und dreht dazwischen mindestens 200° (Bogen 12 bis 160 m), ist das eine Schleife. Nur innerhalb des
  neuen Strichs: Kreuzt er beim Fortsetzen die alte Bahn, ist das eine Kreuzung, keine Schleife (der Test „schräge
  Kreuzung, ganze Spur“ hatte das aufgedeckt).
- **Looping oder Bodenschleife** nach dem Seitenverhältnis Höhe/Breite im Bild: ab 0,7 ein Looping (eine senkrechte
  Kreisbahn ist im Bild rund, eine waagerechte bei 26,6° Neigung eine Ellipse mit 0,45; die Schwelle liegt dazwischen;
  `&loopaspect`, `--loopaspect`). Der bisherige Pinsel verlangte 0,9 und „nach oben gezeichnet“; Florians hängende
  Kringel fielen damit durch.
- **Looping:** Die Tiefe bleibt durch die Schleife die der Einfahrt (Gewicht 8 gegen die Glättung), die Form im Bild
  wird die Form in der Höhe. Die eigene Kreuzung regelt das Schleifenziel selbst: Die Ausfahrt läuft über die letzten
  16 m der Schleife um 2,5 m hinter die Einfahrt und bleibt dort noch 8 m; die Kreuzungsregel lässt dieses Paar aus
  (eng gefittet wird dort trotzdem). Vorher hatte die Regel die Ausfahrt an die Seite gedrückt, die eine früh
  gemerkte Entscheidung vorgab, oder ihr an der eigenen Kreuzung eine ganze Spur verordnet (Tiefensprung 8 m).
- **Bodenschleife:** Die Höhe bleibt, die Bildbewegung wird Tiefe (Ziel `z = z_ein + ΔY / tan 26,6°`).
- **Mindestradius 4 m** (`&loopr`, `--loopr`): Radius aus dem Rechteck der Schleife im Bild, (Breite + Höhe) / 4.
  Darunter wird die Bahn um die Schleifenmitte auf den Mindestradius gestreckt, davor und dahinter über 6 Punkte an
  die Tinte angeschlossen; die Tinte bleibt (Bahnpunkt `pt` je Linienpunkt neben dem Linienpunkt `p`). Ein Marker im
  Bild fehlt noch (Platzhalter).
- **Fest als Ganzes:** Ein steiler Lauf in einer erkannten Schleife gilt als gelesen (Form „loop“), er sperrt das
  Einfrieren nicht mehr; die Schleife friert ein, sobald sie hinter dem Vorlauf liegt.
- **Kehren warten auf die Schleife:** Eine Kehre gilt erst als gelesen, wenn der zweite Schenkel bis auf die halbe
  Höhe des U zurück ist, an der Spitze nicht mehr auf die Einfahrt zufällt (flach ausläuft oder steigt) und drei Punkte
  weiter keine Kreuzung gekommen ist; ein Kringel fällt weiter, kreuzt seine Einfahrt und gehört dann der Schleife.
  Ebenso wartet ein Hügel, bis dahinter eine klare Richtung steht (vorher gewann der Hügel das Rennen gegen die Kehre,
  sobald drei flache Punkte da waren). Die beiden Seiten derselben Schleife (Scheitel über der Einfahrt) sind keine
  Kreuzung mehr, und Seiten, die vor der Erkennung zwischen Punkten der Schleife entschieden wurden, werden gelöscht.
- **Reihenfolge im Löser:** Die Kreuzungsschranken kommen jetzt nach den Formzielen (Hügel, Kehre, Schleife), damit
  die Seite einer Begegnung am endgültigen Ziel entschieden wird. Mit dem Bodenhöhen-Ziel saß sie oft falsch und
  deckelte die Tiefe einer Bodenschleife; die Lösung schwang dann zwischen den Schranken (Tiefe −6 m statt +11 m).

### 16c. Kehren: vier Lesungen, eine offene Frage

Ein hohes schmales U lässt sich nicht gleichzeitig auf der Tinte, aufrecht und glatt bauen; das ist der harte Kern
hinter Florians „keine unnötigen Überkopffahrten“. Gemessen an Einheitstests mit einem 9 m weiten, 17 m hohen U mit
runden Ecken und einem 3 m schmalen U:

1. **Flach: die ganze Bildhöhe wird Tiefe** (Scheitel so hoch wie der Fuß). Ein schmales U wird eine lange schmale
   Ellipse in der Ebene (20 m tief, 3 m breit) mit Radius unter 2 m am Scheitel: auf Florians Strichen mehr Knicke
   (Median je Strich 133, 248, 351 statt 124, 159, 314) und mehr schwebende Stützen (439, 1198, 1571 statt 408, 1095,
   1380). Verworfen.
2. **Steigende Wendel:** halbe Sinuswelle der Tiefe über die ganze Kehre mit Amplitude halbe Weite. Am Scheitel steht
   die Tiefe still, die Wende läuft in der senkrechten Ebene über die Kuppe: kopfüber. Verworfen.
3. **Haube in der Ebene** (Tiefe gerade von Fuß zu Fuß wie beim Hügel, U in der Bahn auf 8 m aufgezogen). Eine Wende
   über die Kuppe zurück ist ein halber Looping, der Wagen hängt danach unter der Schiene. Verworfen.
4. **Senkrechte Schenkel, oben ein waagerechter Halbkreis durch die Tiefe** mit dem Radius der halben Weite, mindestens
   4 m (ein schmaleres U wird in der Bahn aufgezogen, die Tinte bleibt): Das ist der Stand im Code. Höhe, Tiefe und
   Weite stimmen in den Tests; der Schienenrahmen liest aber auch hier den senkrechten Schenkel, der oben nach hinten
   abbiegt, als Looping-Kuppe („kopfüber bleibt“ in `sampleTrack`) und kippt. Die Einheitstests prüfen darum Form und
   Weite, nicht den Rahmen; ob Florians rundere Kehren das Problem haben, zeigt die Messung in 16e.

Was fehlt, ist eine Lesung ohne senkrechte Schenkel: Die Schenkel müssten selbst Tiefe tragen (eine Wendel, die nach
hinten steigt, mit Steigung unter 50°, wo der Rahmen sich noch aufrichtet), und dafür braucht ein 10 m hohes U rund 8 m
Tiefe je Schenkel und 8 m Weite, also eine deutliche Abweichung von der Tinte. Das ist eine Gestaltungsfrage für
Florian (16f), keine Rechenfrage.

### 16d. Gebaut: Kettenlinie als Deckel

- `BrushOptions.chainTop` (Welthöhe der Kettenzugstärke über der Station, in `level.ts` aus Feld und Station wie die
  gezeichnete Linie, nur mit Kettenzug-Start). In Strich 2 wird daraus je freiem Punkt eine Mindesttiefe:
  `zAtHeight(p, chainTop)` (neu in `stage.ts`, die Höhe am Strahl fällt mit der Tiefe, mit und ohne Perspektive).
  Was im Bild über der Linie liegt, wird Tiefe. Geht das auch in der tiefsten erlaubten Tiefe nicht (Stapel zu flach),
  bleibt der Punkt dort und wird gezählt (`stats.capped`, Messung `s2Capped`); ein Abschneiden wie beim Höhenlimit ist
  Platzhalter.
- **Ehrlich:** Florians Testzonen haben keine Aufwertungsstufen, dort löst `resolveAbilities` keine Kettenzugstärke
  auf, die Linie wird nicht gezeichnet und der Deckel greift nicht. Auf seinen Strichen ist der Deckel darum nicht
  gemessen, nur in Einheitstests (Linie 40 m hoch bei Kette 12 m: Bahn unter 12,6 m; mit nur 40 m Tiefe bleibt der
  Rest Höhe und wird gezählt). Sobald ein Feld eine Stufe hat (`upgrades`, Plan 2.4), gilt er.

### 16e. Messung: vorher gegen nachher (dieselben Striche; Fahrt mit Antrieb)

Die Loopings entstehen (19, 72 und 63 gezeichnete Kringel, ein Drittel bis zwei Drittel auf 4 m aufgeweitet); die
ungewollten Inversionen sinken kaum, Kreuzungen auf gleicher Höhe und Knicke nehmen deutlich zu, das Band wird länger. Die
Schleifen-Lesung blieb an (Florians Entscheidung), mit dem Schalter `&schleifen=0` zum Vergleich. Tabelle und Lesart:
wörtlich im Verlauf, Abschnitt 16e.

### 16f. Offen und Entscheidungen

1. **Schleifen an oder aus**, bis die Kreuzungen und Knicke geklärt sind (Zahlen oben; im Spiel `&schleifen=0` zum
   Vergleich). Empfehlung: an lassen und die Kreuzungen als Nächstes aufklären (eigene Schleifenkreuzung gegen fremde
   Stränge), denn die Loopings selbst sind richtig.
   **Status:** beantwortet am 29.10., 18 Uhr: „Schleifen anlassen und die Kreuzungen aufklären“ (16g).
2. **Kehren:** die Gestaltungsfrage aus 16c. Ein hohes schmales U kann nur aufrecht bleiben, wenn seine Schenkel Tiefe
   tragen (Wendel, Steigung unter 50°) und die Bahn dafür spürbar von der Tinte abweicht (8 m Tiefe je Schenkel, 8 m
   Weite). Alternative: U bleiben, was sie sind (halbe Loopings), und die Fahrt zeigt es als Überkopffahrt. Das ist
   Florians Entscheidung; bis dahin bleibt die bisherige Lesung.
3. **Brücken-Regel** für Restkreuzungen (Höcker, wo er passt): nicht gebaut. Mit den gestiegenen Kreuzungen wäre sie
   Symptombehandlung; erst die Ursache in 1 klären. Der Höcker braucht ohnehin die Abweichung von der Tinte in der Höhe
   (3,2 m plus Rampen), die Mechanik dafür (`pt` je Linienpunkt) gibt es jetzt.
4. **Marker** für aufgeweitete Loopings im Bild (Platzhalter) und ein Schleifen-Zähler in der Messung nach der Lesung
   von Strich 2 statt nach dem alten Pinsel.
5. **Kettenlinie:** greift erst, wenn ein Feld eine Aufwertungsstufe hat (Plan 2.4); die Testzonen haben keine. Ein
   Feld mit Stufe in `test-huegel` wäre der Test.

**Stand 30.10.:** Die Punkte 2 bis 5 sind offen; sie ruhen mit dem Strich (Kopf).

### 16g. Nachgang (Florian 29.10., 18 Uhr: „Schleifen anlassen und die Kreuzungen aufklären“)

Die eigenen Schleifenkreuzungen sind in Ordnung; mehr werden die Kreuzungen späterer Stränge, die Hunderte Meter weiter
über eine längst feste Schleife laufen. Kehren erkennen sich jetzt am geraden zweiten Schenkel, die Schranken sind hybrid
(außerhalb von Schleifen vor den Formzielen, in Schleifen danach); drei Versuche gegen die Kreuzungen mit fremden
Strängen brachten nichts. Stand gegen vorher: Kreuzungen 6 → 9, 112 → 189, 196 → 297; Knicke 124 → 118, 159 → 218,
314 → 374. Zuordnung, Umbauten und Lesart: wörtlich im Verlauf, Abschnitt 16g.

### 16h. Aufgeräumt (Florian 29.10., 21 Uhr: „Ja, räum alles auf, aber ich weiß gerade nicht, was das Richtige ist“)

Florians Einwand: Wir bauen wieder viele Sonderregeln; seine Idee war, Tiefe und Physik frei zu wählen, die Regeln
eher aus den Ebenen (davor, dahinter) als aus dem Pinsel zu nehmen, und Überkopffahrten wie Knicke von vornherein
auszuschließen, ohne den Strich beim Zeichnen denken zu lassen. Die Zahlen geben ihm recht: `strich2.ts` ist von 1156
Zeilen, 37 Konstanten und keinem Schalter (Strich 2 als Vorgabe, 29.10.) auf 1897 Zeilen, 58 Konstanten und 11 Schalter
gewachsen, und drei Regeln des Nachgangs standen ohne gemessene Wirkung im Code.

**Raus** (55b2e39): drei Regeln des Nachgangs ohne gemessene Wirkung und zwei Diagnose-Schalter; die Bahnen sind Strich für
Strich praktisch dieselben wie vorher. Die Streuung zwischen den Varianten ist so groß wie ihre Unterschiede: An den
Kreuzungen weiter mit Regeln zu drehen, misst Rauschen. Liste, Nachmessung und Korrektur: wörtlich im Verlauf,
Abschnitt 16h.

**Konsequenz (ohne weitere Rückfrage, Studie 17):** Die zwei Garantien, die Florian meint, gehören nicht in den
Strich, sondern dorthin, wo sie ohne Raten gelten: **Aufrecht außer im Looping** als Regel der Schienen (der Rahmen
in `sampleTrack` bleibt oben, solange die Bahn keinen vollen Kringel fährt; „Physik, wie sie uns passt“ wie der
Antrieb in Paket 2) und **Mindestradius** als Eigenschaft des Fits (die Bahn darf dafür in der Toleranz von der Tinte
abweichen). Beides ist auf den vorhandenen Strichen messbar. Die Leseschicht des Pinsels wird bis dahin nicht mehr
angefasst; wie viel Lesung er haben soll (16f, Lesart „Ebenen pur“), entscheidet sich in einer echten Zone, nicht an
den Testzonen.

## 17. Garantien an den Schienen und im Fit: aufrecht außer im Looping, Mindestradius (29.10., nachts)

Florians Einwand aus 16h, umgesetzt ohne Rückfrage: Die zwei Dinge, die er von vornherein ausgeschlossen haben will,
ungewollte Überkopffahrten und Knicke, sind jetzt keine Lese-Regeln des Pinsels mehr, sondern Eigenschaften der Schienen
und des Knoten-Fits. Der Pinsel (`strich2.ts`) ist in seiner Lesung unverändert; geändert sind `model.ts` (der
Oben-Vektor in `sampleTrack`), `reduceNodes.ts` (ein Mindestradius vor dem Fit) und die Stelle in `strich2.ts`, die den
Fit aufruft. Alles ist auf den vorhandenen Strichen gemessen (17d), es brauchte keine neuen Striche und keine Entscheidung.

### 17a. Regel der Schienen: aufrecht außer im Looping

**Vorher** stand der Oben-Vektor der Schienen auf Parallel-Transport: Er wurde entlang der Bahn mitgeführt und nur auf
flacher Strecke (Neigung unter 50°) zur Welt-Senkrechten zurückgedreht; kopfüber blieb er, wo der Transport ihn kopfüber
brachte und die Bahn nach unten krümmte. Das gab Loopings richtig, aber auch alles andere, was der Transport auf einer
verdrehten 3D-Bahn anrichtet: Auf steilen Stücken wurde gar nicht zurückgedreht, auf mittleren Neigungen fast nicht
(bei 30° noch 4 % der Kraft), und jede Kuppe nach einer verdrehten Anfahrt hielt den Wagen kopfüber, weil sie „nach
unten krümmt“. Gemessen (17d, Stand alt) dreht sich der Rahmen auf Florians Strichen im Median um 400 bis 460° je 100 m
gegen die Welt-Senkrechte und geht 5 bis 11 Mal je Strich außerhalb jedes Loopings über die Seite.

**Jetzt** gilt an den Schienen: Der Wagen fährt aufrecht (Oben-Vektor = Welt-Senkrechte quer zur Tangente), kopfüber
nur auf dem oberen Bogen eines Loopings. Was ein Looping ist, liest `framePlan` aus der Geometrie der fertigen Bahn,
ohne den Pinsel: Ein *Durchgang* ist ein Stück fast senkrechter Bahn (waagerechter Anteil der Tangente unter 0,4,
Neigung über 66°); er *kehrt um*, wenn die waagerechte Richtung davor und dahinter entgegengesetzt ist (die Bahn ging
über die Senkrechte hinweg, nicht nur bis an sie heran). Ein Looping ist ein Durchgang nach oben mit Umkehr, auf den als
nächster ein Durchgang nach unten mit Umkehr folgt; vom senkrechtesten Punkt des einen bis zum senkrechtesten Punkt des
anderen hängt der Wagen innen. Der Rahmen läuft weiter per Transport mit und wird je Schritt um 35 % seines Restwinkels,
höchstens 24° je Meter, auf die Zielrichtung gedreht (im Looping ihr Gegenteil); je steiler die Bahn, desto schwächer
der Zug, denn an der Senkrechten ist „aufrecht“ nicht bestimmt. So kommt ein Looping von selbst kopfüber über den
Scheitel (Ziel und Transport stimmen dort überein, der Wechsel der Zielrichtung liegt genau an der Senkrechten, wo sie
ohnehin umspringt), und eine Kuppe nach verdrehter Anfahrt wird aufrecht gezogen.

Der eine Fall, der eine Entscheidung brauchte: eine **Kehre mit senkrechten Schenkeln** (Durchgang nach oben mit Umkehr,
dann nach unten ohne Umkehr). Physikalisch ist das ein halber Looping, der Transport brächte den Wagen kopfüber heraus
und ließe ihn so weiterfahren; irgendwo muss eine halbe Drehung hin. Sie liegt auf dem senkrechten Schenkel: Dort dreht
sich der Rahmen gleichmäßig um eine halbe Drehung, wo der Wagen ohnehin quer steht, und kommt aufrecht über den
Scheitel und bleibt es auf dem Abstieg (Test: tiefster Oben-Wert −0,04 statt −0,51 mit der Drehung erst hinter dem
Durchgang, die den Wagen am Scheitel quer stehen ließ). Genauer: Die Drehzone liegt auf dem senkrechten Stück selbst, ein
kurzer Durchgang bekommt den Rest zu gleichen Teilen davor und dahinter (bis 16 m insgesamt); am Anfang der Zone
rechnet `sampleTrack` den Transport ohne Zug bis hinter den Durchgang voraus, vergleicht ihn dort mit der Zielrichtung
und verteilt genau den Fehlwinkel gleichmäßig über die Zone: bei einer ebenen Kehre 180°, bei einer verdrehten, was
eben fehlt, manchmal nichts. (Mit pauschal 180° blieben auf den Strichen drei- bis viermal so viele halbe Rollen übrig.)
Dasselbe gilt für einen Sturz über die Senkrechte zurück. Im Spiel sind solche Kehren selten, weil der Pinsel Kehren
Tiefe gibt (sie werden Steilkurven unter 66°); die Regel fängt den Rest.

Was die Regel *nicht* ändert: die Bahn selbst (Strich für Strich dieselben Knoten, Längen, Tiefen; 17d), die Schräglage
(`bankAt` rechnet weiter auf dem Oben-Vektor auf) und die Fahrt-Regeln aus Paket 2. Messschalter `--rahmen alt` in
`pinsel-messung.ts`; im Spiel vergleicht seit 2a7f105 `&rahmen=1` (Testmenü „Schienen“) mit der bisherigen Regel.

### 17b. Mindestradius als Eigenschaft des Fits

Vor dem Knoten-Fit von Strich 2 läuft `relaxCurvature` über die Punktfolge: Wo der Radius unter 4 m liegt, werden die
Punkte zu ihren Nachbarn hin ausgeglichen (Gauß-Seidel über die Menger-Krümmung der drei Nachbarn, nur an den Stellen,
deren Nachbarschaft sich geändert hat), bis jeder Punkt den Radius hält; eine Ecke wird so zu einem Bogen von 4 m. Der
erste Punkt ist das Ende des letzten festen Segments, so wie es gefittet wurde (bisher der rohe Punkt; mit Mindestradius
können beide um die Toleranz auseinanderliegen), die Spitze bleibt am Finger.

**Ehrlich gescheitert, erste Fassung:** Glätten überall, wo der Radius zu klein ist, ist ein Kurvenverkürzungsfluss.
Eine Bodenschleife von 2 m Radius kann den Radius 4 m nicht durch Glätten erreichen (Zusammenziehen macht sie enger),
also zieht sie sich bis auf einen Punkt zusammen. Auf dem Schleifen-Satz wurden die Bahnen dadurch um ein Drittel kürzer
(447 → 292 m bei einem Strich) – die Tinte war weg. Zweite Fassung, zwei Grenzen: Ein zu enges Stück, dessen Richtung
sich im Umfeld (±8 Punkte) irgendwo um 150° oder mehr dreht, ist eine Schleife oder Kehre und bleibt wie gezeichnet
(Loopings weitet der Pinsel, 16b; Bodenschleifen und enge Kehren bleiben eng, das ist jetzt messbar und eine Frage an
den Pinsel, nicht an den Fit); und kein Punkt weicht mehr als 2 m von seiner Lage ab, was sich so nicht runden lässt,
bleibt eng. Mit der Lücken-Regel allein (Stücke, deren Krümmung zwischendurch unter die Grenze fällt, gelten als eins)
reichte es noch nicht: Zerstückelte Schleifen wurden als lauter Ecken gerundet, auf dem Schleifen-Satz −100 m je Strich
im Median. Erst die Drehung im Umfeld hält sie.

### 17c. Befund am Rande: zwei Entgleisungs-Tests waren ein Rahmen-Fehler

Zwei Entgleisungs-Tests der strengen Fahrt hingen am alten Rahmen (der Wagen stand 28° nach außen gerollt), nicht an der
Bahn; sie fahren jetzt eine 2,5 m enge Kehre. Ein Teil der „Entgleisen 8 von 21“ aus 15a war also der Rahmen.
Einzelheiten: wörtlich im Verlauf, Abschnitt 17c.

### 17d. Messung: alt gegen neu, Regel und Mindestradius einzeln und zusammen

Zusammen, auf den drei Strichsätzen: Kopfüber −46 / −29 / −37 %, deutliches Kopfüber −62 / −33 / −35 %, halbe Rollen −92 /
−75 / −84 %, Rahmen-Drehung −61 / −52 / −62 %, Knicke −25 / −20 / −26 %, Querkraft-Spitzen −34 / −13 / −19 %; die Bahnen
werden an den Ecken 2 bis 3 % kürzer, die Vorschau kostet höchstens 0,1 ms mehr. Die Zahl der Kreuzungen auf gleicher
Höhe taugt seit Paket 2 nicht mehr als Formmaß. Ein Rest deutlicher Kopfüber-Stellen ist nicht nach Lage aufgeschlüsselt;
das ist der erste Schritt, wenn Florian im Spiel Kopfüber sieht, das er nicht gezeichnet hat. Tabellen: wörtlich im
Verlauf, Abschnitt 17d.

### 17e. Was offen bleibt

- Bodenschleifen und enge Kehren unter 4 m bleiben eng (bewusst, 17b). Ob der Pinsel sie wie Loopings weiten soll, ist
  eine Lesungsfrage für eine echte Zone, nicht für die Testzonen.
- Die Drehzonen (16 m, 11° je Meter) sind sichtbar; Florian sieht sie beim nächsten Zeichnen, wenn er eine senkrechte
  Kehre zeichnet. Länge und Lage sind eine Konstante (`TWIST_M`), kein Schalter.
- Kreuzungszählung geometrisch statt über die Fahrt (klein).
- Der Messschalter `--rahmen alt` bleibt, bis Florian den neuen Rahmen im Spiel gesehen hat; dann fliegt die alte Regel.
  Im Spiel vergleicht seit 2a7f105 `&rahmen=1` (Testmenü „Schienen“).
- Unverändert offen: 16f (Brücken, Marker, Kettenlinie-Testfeld), Pakete 4 (Mesh inkrementell, animiertes Nachziehen)
  und 5 (Raum in Zonen), Florians Feintuning-Liste. Alles ruht seit 29.10. abends (Kopf).
