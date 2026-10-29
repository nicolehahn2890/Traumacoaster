# Pinsel-Studie: Strich → Bahn im Ebenen-System

Stand 28.10.2026, Zweig `claude/pinsel-studie-8f0777` (ab `zoneneditor` e38bf6b). Gemessen auf Florians 46 Strichen
vom 28.10. (45 in den Testszenen, 38 am Mac, 7 am Handy) und zum Vergleich auf 349 Pinsel-Strichen vom 23.–25.10. im
alten Layout. Nichts davon ist in `zoneneditor` eingebaut; Florian entscheidet.

Begriffe beim ersten Mal: **Vorschau** = die Live-Schienen beim Malen (alle 50 ms neu gerechnet). **Tiefe** = Abstand
nach hinten in Metern (eine Spur = 8,4 m). **Loslassen** = der Finger geht hoch, die Bahn wird endgültig gebaut.
**Probefahrten** = die versteckten Fahrten nach dem Loslassen, die die Bahn an Problemstellen nachbessern.
**Vorlauf** = das Stück hinter der Pinselspitze, über das die Bahn noch nicht entschieden hat.

## 1. Kurzfassung

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
7. Nachtrag vom Abend (Abschnitt 9): Florians erster Test zeigte drei Fehler des Prototyps, nicht des Ansatzes (Tinte
   am falschen Punkt, „Fels“-Sperre unter jeder Kante, Bahn wächst nur im 50-ms-Takt), alle drei behoben; die Lesung ist
   jetzt „Ebenen: Bodenhöhe“ wie beim heutigen Pinsel. Auf seinen 31 Strichen von 18:39–18:55 ist die Form in derselben
   Liga wie heute, Leistung und Sprung bleiben gelöst; fahrbar ist bei beiden keiner, und die meisten „Knicke“ sind die
   Schleifen des Strichs selbst (bei zoom 14,8 ist ein Radius von 59 px schon die 4-m-Grenze).
8. Zweiter Nachtrag (Abschnitt 10): Florians zweiter Test (27 Striche, „fühlt sich deutlich besser an“) wünschte
   weniger Bearbeitungspunkte und das Gummiband des heutigen Pinsels. Strich 2 setzte alle 3 m einen Knoten ohne Fit
   (186 je Strich); jetzt fittet er die Knoten wie der heutige Pinsel, stückweise und ohne das Feste anzurühren
   (99 je Strich gegen 59–64 heute auf den 31 Strichen von 18:39, 71 gegen 54 auf den 27 neuen; der Rest sind die
   engen Knoten an Kreuzungen, weil Strich 2 Stränge nur um den Mindestabstand trennt, und die kürzere Tiefenglättung), und der ganze Vorlauf ist das pinke
   Band statt schwarzer Tinte. Das Band ist mit 12 m (178 px) länger als beim heutigen Pinsel (41–109 px) und holt beim
   Anhalten nicht auf: Das ist die Entscheidungszeit, als Entscheidung in Abschnitt 8 und 10 festgehalten.
9. Dritter Nachtrag (Abschnitt 11): Florians dritter Test am 29.10. („gefällt mir schon ganz gut, braucht aber noch
   sehr viel Feintuning“) und seine Entscheidung: hier der Strich weiter (Stufe P1 als Teil von Editor-Stufe 4), die
   Editor-Session parallel am Earle-Look (Stufe 5). Strich 2 ist seitdem in Ebenen-Zonen die Vorgabe (`&strich=1` =
   bisheriger Pinsel). Die Vorlauflänge (12, 8, 6 m) macht auf seinen 18 + 27 + 31 Strichen in Form, Sprung und Fahrt
   keinen messbaren Unterschied (±6 %, ohne Richtung), nur das Band wird kürzer (178 → 118 → 89 px bei zoom 14,8):
   Entscheidung 1 ist damit eine reine Gefühlsfrage, am Mac mit `&vorlaufm=6` oder `8` ausprobierbar.
10. Vierter Nachtrag (Abschnitt 12): Fortsetzen und Überzeichnen laufen auf Strich 2. Vorher wanderten beim
   Fortsetzen die Knoten der alten Bahn um bis zu 5,3 m (sie wurde mitgefittet, beim heutigen Pinsel genauso), und
   Überzeichnen fiel ohne Vorschau auf den heutigen Pinsel zurück, der die ganze Bahn neu plante. Jetzt übernimmt
   Strich 2 die alten Knoten wörtlich als feste Segmente und fittet erst ab dem Anschluss (G1); beim Überzeichnen bleibt
   die Bahn vor dem Anfasspunkt und hinter dem Ende wörtlich, der Strich endet genau am Ende in dessen Tiefe und
   Richtung, mit Vorschau während des Strichs. Platzhalter: rückwärts gezeichnet und über die Naht einer Runde nimmt
   weiter der heutige Pinsel.
11. Fünfter Nachtrag (Abschnitt 13): Florians Auftrag Kreuzungen („so gut wie keine“), Knoten „nur wo nötig“ und das
   Ruckeln beim Bearbeiten. Kreuzungen auf gleicher Höhe entstanden, weil die Regel nur im ±1-m-Fenster der Bildkreuzung
   galt und die Seite je 12-Punkte-Bündel neu entschied. Erster Umbau (ganze Spur für jedes nahe Paar) war messbar
   schlechter und ist verworfen. Jetzt: kleiner Versatz im ±6-m-Fenster, Seite je Begegnung vererbt, zweiter
   Lösungsdurchgang für freie Nachbarn, Seite je Begegnung vererbt, ganze Spur nur an sauberen Kreuzungen (weit
   auseinander, ab 30°, Platz). Auf denselben 17 Strichen: Kreuzungen 11 → 3, Striche ohne Kreuzung 9 → 15,
   Fahrt-Abbrüche an Kreuzungen 5 → 1; auf den 27 von gestern Abend 208 → 129 (heutiger Pinsel: 264), auf den 31
   Schleifen-Strichen 423 → 215; ein Versuch mit Lücken statt Seiten war schlechter und ist verworfen. Preis:
   Knicke 63 → 78 und Tiefenspanne 20 → 25 m (die Spur-Rampen). Knoten 38 → 36: Die Toleranz ändert die Zahl nicht, die
   Knoten kommen aus den Schleifen des Strichs (ein kubisches Segment dreht höchstens 180°); Vorgabe jetzt 150 m / 180°.
   Das Ruckeln kam vom Neubau der ganzen Bahn je Zeigerereignis (14 ms, bis 120 je Sekunde); jetzt einmal je Bild
   leicht, beim Loslassen ganz (0,2 ms je Ereignis, 10 ms je Bild).
12. Sechster Nachtrag (Abschnitt 13g): Vorschau-Kosten aufgeschlüsselt: nicht der Löser, die Abfragen an Ebenen und
   Feld waren 6 von 7 ms, weil jede Vorschau alle freien Linienpunkte neu befragte. Jetzt einmal je endgültigem Punkt,
   Löser auf dem Band, Fit bis zur Spitze (gezeigt bis zum festen Teil), Messung wie im Spiel: 7,4 → 4,1 ms je
   Vorschau unter Last, bei freier Maschine 3,0 / 3,8 / 2,8 ms auf den drei Sätzen; der Rest sind zwei Aufrufe von
   `field.free` zu je 1,4 ms, also der Ebenenstapel selbst (Stufe P1 „Kantenfelder“). Restkreuzungen in dichten
   Schleifenhaufen: rund 1000 Konfliktpunkte je Strich (vor dem einen, hinter dem anderen Strang), zwei Rückfälle
   gemessen und verworfen; die Zahl schwankt dort schon durch Rundung um ±10 %. Mehr geht nur mit mehr Raum (Stufe P2)
   oder ohne kleine Schleifen (Entscheidung).
13. Siebter Nachtrag (Abschnitt 13h): Kantenfelder je Ebene, abgestimmt mit der Editor-Session. Das Freiraumfeld prüfte
   je Strahlschritt alle Flächen (12 000 bis 16 500 Eckpunkte je Zone), 1,2 bis 2,4 ms je Aufruf. Ein Rasterindex je
   Ebene und Flächenliste (Zellen sicher innen, sicher außen oder mit Kante; nur dort exakt) macht daraus 0,02 bis
   0,03 ms, mit identischen Ergebnissen (Test gegen die direkte Rechnung auf Fixturen und allen Testzonen). Die
   Vorschau von Strich 2 liegt damit auf den 31 Schleifen-Strichen bei 0,9 ms im Median (90 %: 2,8 ms), bei
   identischen Knoten, Knicken und Fahrten.
14. Achter Nachtrag (Abschnitt 13i): Handy-Messung für Tor P1, headless am Handy-Bild (852 × 393 @3, Metal auf dem Mac,
   also obere Schranke). Vier Striche mit 862 bis 1396 m: Strich 2 54 bis 60 fps im Schnitt, 0 bis 6 % Bilder über
   20 ms; der bisherige Pinsel 40 bis 50 fps mit 10 bis 15 % und Einfrieren nach dem Loslassen. Die Vorschau wächst mit
   der Bahnlänge (24 ms bei 1000 m), nicht durch den Strich (1 ms), sondern weil `setTrack` und die Abtastung je
   Vorschau die ganze Bahn neu bauen (Risiko 4): Für glatte 60 fps bei 1000 m muss der Renderer den festen Teil
   behalten. Nicht gebaut, Entscheidung für Florian, abzustimmen mit der Editor-Session.
15. Abschnitt 14: Florians Antworten (Vorlauf dynamisch und so kurz wie möglich, Fahrt neu recherchieren und ohne
   ungewollte Überkopffahrten, Schleifen unter dem Mindestradius aufweiten oder als Looping lesen, Mesh inkrementell mit
   animiertem Nachziehen, Raum in den Zonen nach meinem Ermessen) und Paket 1: Der Vorlauf ist dynamisch (3 m auf
   ruhiger Strecke, 6 m mit anderem Strang in Reichweite, 12 m bei steilem Stück, Umkehr oder noch wandernder Tiefe),
   die erste Vorschau kommt nach 3 statt 6 Linienmetern; im Browser stehen die ersten Schienen nach 0,8 s und 8 m, auf
   deinen Strichen nach 4 Linienmetern. Form und Fahrt ändern sich nicht. Das Band bleibt auf deinen Strichen im Median
   14 m lang, weil fast alles steil ist und ein offenes steiles Stück nicht fest wird; `&freezemax=40` halbiert das obere
   Zehntel, kostet aber Knicke, darum nur als Schalter. Die Antwort für Schleifen ist Paket 3.
16. Abschnitt 15, Paket 2: Die Fahrt. Recherche (OpenRCT2 bewertet g statt abzubrechen, Rollercoaster Creator und
   Sonic funktionieren mit Abbruch nur, weil Höhe und Tempo im Bild stehen, echte Bahnen entgleisen dank Stützrädern
   nicht, Powered Coaster fahren jede Form mit vorgegebenem Tempo) und Befund: Die strenge Fahrt endet auf deinen
   Strichen fast immer im ersten Fünftel (1 von 78 kommt an), aus Ursachen, die in unserer Perspektive nicht zu sehen
   sind. Umbau: Fahrregeln `drive` (Vorgabe): Antrieb mit Mindesttempo 4 m/s, Stützräder, kein Entgleisen, kein
   Fall, kein Stillstand, kein Auffahren; Querkraft und Hängen sind Werte. Alle 78 Bahnen kommen an, der Antrieb
   schiebt 4 bis 7 % der Länge. Offen und gemessen: Inversionen, die der Strich nicht als Schleife gezeichnet hat
   (Paket 3), Querkraft-Spitzen an Knicken (Form), Schräglage ein Zehntel der Zeit am Anschlag (Stilprobe). Schalter
   `&fahrt=1` (streng), `&antrieb=`; fünf Entscheidungen für Florian in 15f.
17. Abschnitt 16, Paket 3: Schleifen und Kettenlinie. Diagnose: Nur ein Zehntel der Inversionen lag in Loopings, die als
   solche gezeichnet waren; jeder Kringel wurde eine Kehre (verdrehter Halbbogen, kopfüber), und hohe schmale U sind
   geometrisch halbe Loopings. Gebaut: Strich 2 erkennt Schleifen (Selbstkreuzung mit ≥ 200° Drehung), liest sie ab
   Höhe/Breite 0,7 als Looping (Tiefe bleibt, eigene Ausfahrt 2,5 m dahinter, Mindestradius 4 m mit Aufweitung, die
   Tinte bleibt), sonst als Bodenschleife; Kehren warten, bis sie keine Schleife mehr werden können; die Kettenlinie
   ist ein Deckel (`chainTop`, `zAtHeight`). Gemessen: 19 / 72 / 63 Loopings entstehen; vier Kehren-Lesungen ohne
   senkrechte Schenkel waren schlechter oder kippten. Nachgang 16g (Florian: anlassen und aufklären): Band und ein Teil
   der Knicke kamen von Nebenänderungen (Kehren warteten, Schranken nach den Formzielen) und sind repariert (Kehre
   erkennt sich am geraden zweiten Schenkel); die eigenen Schleifenkreuzungen sind in Ordnung, mehr werden Kreuzungen
   späterer Stränge über festen Schleifen (Stand gegen alt: 6 → 9, 112 → 189, 196 → 297; Knicke 124 → 118, 159 → 218,
   314 → 374), drei Versuche dagegen ohne Wirkung, danach wieder ausgebaut (16h: die Streuung zwischen Varianten ist
   so groß wie ihre Unterschiede). Schalter `&schleifen=0`; Brücken-Regel nicht gebaut; offen 16f/16g. Nächstes
   (Studie 17): Aufrecht außer im Looping als Schienenregel, Mindestradius im Fit, keine Regeln mehr im Strich.

18. Abschnitt 17: Florians Einwand („wieder viele Extraregeln“) umgesetzt, ohne Rückfrage: Überkopffahrten und Knicke
   sind keine Lese-Regeln des Pinsels mehr, sondern Garantien der Schienen und des Fits. Die Schienen halten den Wagen
   aufrecht, kopfüber nur auf dem oberen Bogen eines Loopings (ein Looping ist, was durch die Senkrechte hinauf- und mit
   Umkehr wieder hinabgeht; Kehren mit senkrechten Schenkeln drehen sich auf dem senkrechten Stück um eine halbe
   Drehung und kommen aufrecht über den Scheitel). Der Fit rundet Ecken unter 4 m Radius, lässt Schleifen und enge
   Kehren wie gezeichnet und weicht nie mehr als 2 m von der Tinte ab (eine erste Fassung zog Bodenschleifen zusammen,
   Bahnen ein Drittel kürzer – verworfen). Gemessen auf denselben 21 + 27 + 31 Strichen: halbe Rollen des Rahmens −75
   bis −92 %, Rahmen-Drehung gegen die Senkrechte −52 bis −62 %, von der Fahrt gezähltes Kopfüber −29 bis −46 %
   (deutlich kopfüber −33 bis −62 %), Knicke (Radius unter 4 m) −20 bis −26 %, Knoten −7 bis −12 %, Querkraft-Spitzen
   −13 bis −34 %; die Bahnen werden an den Ecken 2 bis 3 % kürzer, die Vorschau kostet höchstens 0,1 ms mehr. Vom Rest
   liegt rund die Hälfte in Kringeln, die der Pinsel flach liest, aber steil baut (für die Schienen Loopings); auf den
   Schleifen-Sätzen bleiben 231 und 198 deutliche Kopfüber-Stellen, die noch nicht nach Lage aufgeschlüsselt sind. Nebenbefund: Zwei Entgleisungs-Tests hingen am alten Rahmen (28° nach außen
   gerollt in einer abfallenden Kehre), nicht an der Bahn. Korrektur zu 16h: Die dort zuerst genannten Zahlen stammten
   von einem Zwischenstand; der committete Stand misst wie 1429359.

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

**Adresse und Schalter:** Messserver ohne Aufnahme `http://localhost:5188/` (statt 5186: den Port hält ein verwaister
Dev-Server der gelöschten Worktree `pinsel-studie`, PID 75373); Florians Server mit Aufnahme `http://localhost:5187/`.
Heutiger Stand: `http://localhost:5187/?zone=test-huegel&editor=2`. Prototyp: `…&strich=2`; seit dem Nachtrag
(Abschnitt 9) bleibt der noch unentschiedene Teil hinter der Spitze von sich aus schwarze Linie, die Schienen enden am
festen Teil und ziehen weich nach (Florians „die Bahn zeichnet später“); `&vorlauf=2` zeigt den Vorlauf vorläufig als
Schienen bis zur Spitze. Zonen: `test-huegel`, `test-grotte`, `test-boegen`, `test-boegen-f2` (Florians geändertes
Bogenland).

**Absicherung:** 455 Tests grün (446 bestehende, 9 neue), `npm run build` grün, Szenarien 1–28 gegen den
Messserver :5188 bestanden (79 Prüfungen); der heutige Pinsel ist ohne `&strich=2` unverändert.

**Nicht im Prototyp** (nur Entwurf, Abschnitt 5): Tunnel-Lippen, Höhlenmeter, Vorrang-Markierungen, Halter und
Stützenvarianten, Überzeichnen (fällt auf den heutigen Pinsel zurück), Kreuzungs-Chips, Fels abschneiden, animiertes
Nachziehen, wachsendes Mesh. Platzhalter: alle Zahlen (Vorlauf 12 m, Glättung 20 m, Gewichte).

**Messungen alt gegen neu** (dieselben 45 Striche, dieselben Zonen):

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
- **Stufe P2: Umgebung antwortet (M).** Kantenrollen (Lippe, Halter, Vorrang vorn) im Werkzeug D, Lückenprüfung in der
  Tiefenleiste, Material „grabbar“ durchfahrbar mit Höhlenmetern je Feld, Zähler im HUD. **Tor P2:** Szene 06 nachgebaut
  (Tor S4 des Editorplans) mit markierten Stellen; eine Bahn taucht ab, verschwindet hinter dem Berg und kommt mit
  Lippe wieder heraus; Budget stoppt den Strich rot.
- **Stufe P3: Lippen und Halter (M, mit Stützen-Werkstatt Paket 3).** Portal-Vorlage je Material an der berechneten
  Lippe; Wand-, Decken- und Konsolenhalter aus Kantenrollen; Varianten als Teile. **Tor P3:** in den Testszenen unter 5 %
  schwebende Stützstellen (heute 66 %); Standbild vom Handy neben den Studien 15-wandkonsole und 15-doppelportal.
- **Stufe P4: Fahrt nachsichtig (S).** Querkraft aus Tiefenkrümmung gedeckelt, Höhe und Tempo wie heute; Inspector
  zeigt, was die Fahrt dennoch nicht schafft. **Tor P4:** Replay: Fahrt geschafft bei mindestens der Hälfte der
  Striche, die im Bild fahrbar aussehen (Florian markiert zehn).

**Risiken:** (1) Der Vorlauf fühlt sich zu zäh an, wenn steile Stücke lange offen bleiben (bis 90 m); Gegenmittel:
Vorlauf-Darstellung und eine kürzere Obergrenze. (2) Ohne Hebel scheitern mehr Fahrten; das ist gewollt, braucht aber
die nachsichtige Fahrt (P4) und klare Anzeigen. (3) Kehren mit kurzem Vorlauf sind rauer als heute (kein Wächter);
Messung im Prototyp (Tabelle). (4) Das Mesh wächst noch nicht inkrementell: bei 1000 m kostet `setTrack` 5–8 ms je
Vorschau, am Handy der größte Restposten. (5) Die Kameraneigung der Aufnahmen ist nicht aufgezeichnet; alle Replays
gelten für 26,6°.

## 8. Offene Entscheidungen für Florian

1. **Vorlauf sichtbar oder nicht:** Schienen bis zur Spitze (vorläufiger Teil bewegt sich leicht) oder schwarze Linie
   hinter der Spitze, Schienen erst, wo entschieden (`&vorlauf=1`)? Beides ausprobieren.
2. **Höhe gegen Tiefe:** Ab welcher Steilheit ist ein Strich Höhe (heute 15–40°, Prototyp 25°)? Und sollen Kehren
   immer durch die Tiefe gehen (Talblick) oder bei flacher Zeichnung auch als Hügel bleiben dürfen?
3. **Nachsicht der Fahrt:** Querkraft aus der Tiefe deckeln (Arcade) oder streng lassen und mehr Fahrten scheitern
   lassen? **Beantwortet 29.10. (Florians Antwort 2, Abschnitt 15):** nachsichtig, Antrieb und Stützräder, Querkraft
   als Wert, Abbrüche nur für Sichtbares.
4. **Höhlenmeter:** Budget je Feld, Startwerte (Vorschlag: 60 m, nur Vorschlag).
5. **Mindestabstand spielbarer Ebenen** (Vorschlag: 4 m, nur Vorschlag) und was mit engeren Ebenen passiert.
6. **Kantenrollen** im Werkzeug D: eine Taste mit Durchschalten (andocken, Lippe, Halter, Vorrang) oder vier Marken?
7. **Stützen- und Tunnelvarianten:** Teileliste und Materialien, erst nach der Stützen-Werkstatt (Paket 3).
8. Ob Strich 2 den heutigen Pinsel in `zoneneditor` ersetzt oder zunächst als Schalter dazu kommt.

## 9. Nachtrag 28.10. abends: Florians erster Test des Prototyps

Florian hat 31 Striche in `test-huegel` gezeichnet (18:39–18:55, Mac, zoom 14,8, 28 davon mit Strich 2, 2 mit dem
heutigen Pinsel, einer leer; erkennbar am Knotenabstand 3,5 m gegen 12 m) und gemeldet: Mit `&vorlauf=1` nahm die
schwarze Linie seltsame Formen an; Strich 2 wirkte stockend und malte „fast immer in den Boden und kaum in die Tiefe“;
beim heutigen Pinsel hässliche Bahnteile und fallende Bildrate. Seine Vorstellung in seinen Worten: Die schwarze Linie
ist immer genau der gezeichnete Strich; die Bahn zeichnet später, wenn die Tiefe entschieden ist, und zieht in der
saubersten Form nach. (Damit ist Entscheidung 1 aus Abschnitt 8 so verstanden: Vorlauf als Linie, Schienen erst, wo
entschieden.)

**Ursachen** (nachgestellt mit `scripts/pinsel-bildzeiten.mjs --strich 2 --extra vorlauf=1 --shotAt 7000` an Strich 47
und im Nachspiel aller 31 Striche, `--heute --last 31`):

1. **Tinte am falschen Punkt** (Fehler im Prototyp): `drawBrushInk` klebte die Linie an den letzten Knoten der Vorschau.
   Bei Strich 2 reichte die Vorschau bis zur Spitze, die Tinte begann aber am festen Ende: Der Versatz war der ganze
   Vorlauf, und die Linie lief vom falschen Punkt zum Finger (das Dreieck in Florians Bild).
2. **„In den Boden, kaum Tiefe“** (zwei Entscheidungen im Prototyp, beide anders als beim heutigen Pinsel): (a) Steil
   Gezeichnetes war Höhe (Zielgewicht 0,03 ab 40°), während Florian mit „Ebenen: Bodenhöhe“ zeichnet, wo Bild-Y die
   Tiefe über der Kante ist, steil wie flach. (b) Der freie Abschnitt musste an die Tiefe des Vorgängers anschließen
   (±0,25 m). Sobald der Strich unter eine Ebenenkante läuft, liegt die alte Tiefe im Festen, nichts schließt an, der
   Punkt gilt als Fels und die Tiefe bleibt: Die Bahn läuft in die Ebene hinein. Im Bild von Strich 47 bei 7 s waren
   die ganzen unteren Schleifen rote Fels-Punkte. Der heutige Pinsel wählt den Abschnitt nach dem Ziel (`chooseChain`),
   nicht nach dem Anschluss.
3. **Stocken** (Darstellung): Ohne Vorlauf-Darstellung wuchs die Bahn nur je Vorschau (alle 50 ms, 20 Hz) in Stufen bis
   zur Spitze, ohne Tinte dazwischen; der heutige Pinsel füllt die Lücke je Bild mit der Schleppe. Mit Vorlauf rückte das
   Bahnende in 3-m-Schritten. Die Dauer je Vorschau war nicht die Ursache (Browser, Strich 47: Median 12,5 ms).

**Geändert** (`src/track/strich2.ts`, `src/app/scenes/level.ts`):

- Lesung „Ebenen: Bodenhöhe“ wie beim heutigen Pinsel: Ziel ist die Bodenhöhe der Ebenen mit vollem Gewicht, steil wie
  flach; Landung nur flach auf derselben Kante; Hügel (kurz steil, dann wieder flach) und Kehren setzen ihre Form wie
  bisher darüber.
- Abschnittswahl nach dem Ziel, mit Vorzug für den Abschnitt, in dem die Tiefe schon liegt (0,25 Spuren); Fels nur, wenn
  der nächste Abschnitt weiter als 1,2 Spuren vom Ziel liegt (ein Sprung so weit wäre keine Lesung des Strichs mehr).
- Vorlauf-Darstellung ist Vorgabe: Die Schienen der Vorschau enden am festen Teil, die Tinte reicht von dort bis zum
  Finger und setzt am Weltpunkt des letzten festen Linienpunkts an; das feste Ende rückt je Vorschau vor, die Tinte gibt
  es je Bild weich frei (Zeitkonstante 0,14 s, nie weiter, als die Schienen reichen). `&vorlauf=2` zeigt den Vorlauf
  vorläufig als Schienen bis zur Spitze.

**Nachspiel der 31 Striche** (Median je Strich; „Strich 2 alt“ = Stand vor dem Nachtrag):

| Maß | heutiger Pinsel | Strich 2 alt | Strich 2 neu |
|---|---|---|---|
| Vorschau je Aufruf, Median / 90 % (Node) | 34,7 / 114 ms | 5,7 / 14,7 ms | 6,8 / 17,0 ms (zweiter Lauf unter Last 9,7 / 27,9) |
| Rückstand der Schienen hinter dem Finger | 95 px | 34 px | 34 px (mit Vorlauf: die Tinte, nicht die Schienen) |
| Plan beim Loslassen / Probefahrten | 200 ms / 62 ms | 6 ms / 0 | 11 ms / 0 |
| Sprung beim Loslassen, Bild max / Tiefe max / Roll max | 12,7 px / 0,1 m / 34° | 4,1 px / 0,2 m / 3,7° | 0,1 px / 0,2 m / 3,7° |
| Knicke (Radius unter 4 m, 0,25-m-Proben) | 226 | 230 | 251 |
| Rollrate 90 % / Rollen je 100 m | 3,3 °/m / 142° | 2,5 °/m / 107° | 2,7 °/m / 121° |
| Tiefenspanne / Tiefenumkehrungen | 40 m / 19 | 23 m / 24 | 27 m / 24 |
| Stützen / Stützstellen ohne Fuß | 22 / 49 | 22 / 8 | 32 / 31 |
| Fahrt geschafft | 0 von 31 (15 Kreuzung, 7 Entgleisen, 7 Stillstand) | 0 von 30 (13 Kreuzung, 9 Fall, 5 Entgleisen) | 0 von 30 (19 Kreuzung, 6 Fall, 5 Entgleisen) |

**Lesart, ehrlich:**

- Die drei gemeldeten Fehler waren Prototyp, nicht Ansatz: Tinte, Fels-Sperre und Stocken sind behoben; Leistung, Sprung
  und Rückstand bleiben gelöst. Das Bild von Strich 47 bei 7 s zeigt nach der Änderung keine Fels-Punkte mehr, die Tinte
  läuft sauber vom Bahnende zum Finger.
- Die Lesung Höhe gegen Tiefe (Entscheidung 2) ist vom Löser unabhängig; mit „Bodenhöhe“ nutzt Strich 2 wieder mehr
  Tiefe (27 statt 23 m Spanne) und liegt in Form und Rollen in derselben Liga wie der heutige Pinsel, bei weniger Rollen
  (121° statt 142° je 100 m) und mehr Knicken (251 statt 226).
- Die „Knicke“ sind zum Großteil der Strich selbst: Bei zoom 14,8 px/m ist ein Radius von 59 px schon die 4-m-Grenze, und
  Florians Striche haben im Median 85 Linienmeter mit Radius unter 4 m (2775 auf 31 Striche; mit 0,25-m-Proben rund
  340), fast so viele wie die Bahn Knicke zählt (226 und 251). Die Schleifen sind an der Grenze gezeichnet; die Zahl
  misst den Strich, nicht die Tiefe. Zum Beurteilen der Bahnform: größer zeichnen (näher heranzoomen) oder den
  Mindestradius 4 m als Entscheidung behandeln.
- Fahrbar ist bei beiden Pinseln kein Strich: Beim heutigen 15 Kreuzungen auf gleicher Höhe, bei Strich 2 neu 19
  (Kreuzungen im offenen Vorlauf, Stufe P1) und 6 Fälle in Kehren (Stufe P4). Das ist der Rest, der die Bahn „hässlich“
  macht, und er ist bei beiden derselbe.
- Nicht geprüft: Florians Bildrate am Mac (headless nicht zuschreibbar, Leerlauf 33 ms je Bild), das Gefühl des weichen
  Nachziehens (nur Standbilder), das Handy mit dem neuen Stand.

**Absicherung:** 455 Tests und `npm run build` grün, Szenarien 1–28 gegen den Messserver :5188 alle bestanden (Stand
nach der Änderung); der heutige Pinsel ist ohne `&strich=2` weiterhin unverändert.

## 10. Nachtrag 28.10. spät: Knoten und Gummiband (Florians zweiter Test)

Florian hat mit dem Stand aus Abschnitt 9 weitere 27 Striche in `test-huegel` gezeichnet (21:34–21:48, Mac, zoom 14,8,
alle mit Strich 2) und gemeldet: Es fühlt sich deutlich besser an. Aber es werden sehr viele Bearbeitungspunkte
gezeichnet, es sollten nur die allernötigsten sein; der Strich wird bei Strich 1 deutlich mehr und besser geglättet; und
ihm gefällt, wie beim heutigen Pinsel das pinke Band „wie Gummi zäh hinterherzieht und den Strich glättet“: ob Strich 2
das genauso kann.

**Ursachen** (im Code nachgelesen und am Nachspiel der 31 Striche aus Abschnitt 9 gemessen):

1. **Knoten alle 3 m ohne Fit** (Vereinfachung des Prototyps): Strich 2 setzte alle drei Linienmeter einen Knoten mit
   Catmull-Rom-Tangenten, 186 Knoten je Strich im Median (3,5 Bahnmeter je Knoten). Der heutige Pinsel fittet kubische
   Segmente in einer Toleranz (`reduceNodes`: 0,3 m in Kurven unter 25 m Radius, 1,2 m auf Geraden, 0,12 m an
   Kreuzungen) und verteilt sie gleichmäßig: 64 Knoten (11,2 m je Knoten). Derselbe Fit ist auch die „bessere Glättung“:
   Er bügelt Wellen bis zur Toleranz weg, während Catmull-Rom durch 3-m-Punkte jede Welle ab 6 m Länge nachzeichnet und
   kürzere faltet. Die Glättung der Linie davor (Gauß 0,5 m auf 0,25-m-Punkten) ist bei beiden Pinseln dieselbe.
2. **Tinte statt Band** (Entscheidung aus Abschnitt 9): Beim heutigen Pinsel liegt zwischen Schienen und Finger nur die
   pinke Schleppe (Chaikin-geglättet, zum Finger hin breit), und die Schienen holen mit Zeitkonstante 0,14 s auf, das
   Band ist also etwa Tempo mal 0,14 s: bei Florians Zeichentempo (Median 19,5 m/s, 90 % 52 m/s, aus den Aufnahmen)
   41 px, bei schnellen Zügen 109 px, Deckel 200 px. Strich 2 zeigte den Vorlauf als schwarze Linie genau auf den
   Pinselpunkten (12 m = 178 px) und nur die Spitze als Band. Das Gummiband des Pinsels selbst (`RubberBrush`: die Spitze
   hängt am Band, Zittern innerhalb der Bandlänge malt nichts) ist bei beiden gleich; der Unterschied war die Darstellung.

**Geändert** (Commit siehe git log, Worktree `pinsel-studie-8f0777`):

- Strich 2 baut die Knoten mit demselben `reduceNodes` wie der heutige Pinsel (gleichmäßige Verteilung, Toleranz
  0,3–1,2 m, 0,12 m an Linienpunkten mit Kreuzungsschranke), aber stückweise: Segmente, deren Punkte fest sind (dazu
  `fest` Meter dahinter, Vorgabe 2 m), werden fest und bleiben samt Knoten; je Vorschau wird nur ab dem letzten festen
  Segment neu gefittet. Das kostet 1–3 ms selbst für 800 Punkte (gemessen in Node), passt also in die 5–7 ms je Vorschau.
  Das erste neue Segment setzt G1 am festen an: `reduceNodes` kann dafür jetzt eine Anfangs- und Endtangente vorgegeben
  bekommen (`startTangent`, `endTangent`; der heutige Pinsel nutzt das nicht, sein Verhalten ist unverändert). Beim
  Rundenschluss endet das letzte Segment in der Station mit deren Richtung.
- Die Schleppe ist der ganze Vorlauf: pinkes Band vom festen Bahnende bis zum Finger, am Bahnende dünn, am Tropfen breit;
  der Anfang des Bands folgt dem festen Ende weich (0,14 s). Beim Malen gibt es keine schwarze Tinte mehr. `&vorlauf=2`
  zeigt weiter den Vorlauf als Schienen.
- Schalter `&fest=N`: so viele Meter hinter dem festen Ende wird ein Segment fest (siehe Tabelle); `pinsel-messung.ts`
  hat dafür `--fest N`, dazu `--skip N` (ältere Striche vergleichbar halten) und die Maße „Knoten bei globalem Fit“
  und „Atmen der gezeigten Schienen“ (größte Bewegung der schon gezeigten Schienen je Vorschau, px).

**Nachspiel der 31 Striche von 18:39–18:55** (Median je Strich; der heutige Pinsel in zwei Läufen, siehe Lesart):

| Maß | heutiger Pinsel (Lauf 1 / Lauf 2) | Strich 2 vorher (Knoten alle 3 m) | Strich 2 neu (Fit, gestufte Toleranz) |
|---|---|---|---|
| Knoten je Strich | 64 / 59 | 186 | 99 |
| Bahnmeter je Knoten | 11,2 / 11,3 | 3,5 | 6,7 |
| Knoten bei globalem Fit derselben Bahn ohne Kreuzungs-Toleranz | – / 57 | – | 77 |
| Linienpunkte mit Kreuzungsschranke | – | – | 228 (32 % der Linie) |
| Knicke (Radius unter 4 m, 0,25-m-Proben) | 226 / 187 | 251 | 249 |
| Rollen je 100 m | 142° / 149° | 121° | 125° |
| Tiefenspanne / Tiefenumkehrungen | 40 m / 19 | 26,5 m / 24 | 26,5 m / 25 |
| Sprung beim Loslassen, Bild max | 12,7 / 15,7 px | 0,1 px | 0,1 px |
| Atmen der gezeigten Schienen je Vorschau, 90 % / 99 % | 0,0 / 26 px | – | 1,6 / 3,4 px |
| Vorschau je Aufruf, Median / 90 % (Node) | 34,7 / 114 ms | 9,7 / 27,9 ms (unter Last) | 5,2 / 12,4 ms |
| Fahrt geschafft (davon Abbruch an Kreuzung) | 0 von 31 (15 / 10) | 0 von 30 (19) | 0 von 30 (18) |

Festwerden (`&fest=N`, Strich 2 mit Toleranz 0,12 m an allen Kreuzungspunkten): fest 2 / 15 / 30 / 60 m → 111 / 109 /
109 / 108 Knoten, Atmen 90 % 1,4 / 2,3 / 2,8 / 3,1 px. Ohne Kreuzungs-Toleranz 79 Knoten; mit Tiefenglättung 40 m
statt 20 m (wie heute) 108 Knoten und 247 statt 285 Knicke.

**Nachspiel der 27 neuen Striche von 21:34–21:48** (Median je Strich):

| Maß | heutiger Pinsel | Strich 2 (Fit, Toleranz 0,12 an Kreuzungen) | Strich 2 neu (gestuft) |
|---|---|---|---|
| Knoten je Strich / Bahnmeter je Knoten | 54 / 10,0 | 76 / 6,9 | 71 / 6,8 |
| Knicke | 229 | 177 | 188 |
| Rollen je 100 m | 142° | 113° | 112° |
| Tiefenspanne / Umkehrungen | 30,5 m / 16 | 17,3 m / 21 | 17,8 m / 21 |
| Vorschau Median / 90 % | 22,9 / 61 ms | 5,7 / 12,1 ms | 5,6 / 12,0 ms |
| Fahrt geschafft (Abbruch an Kreuzung) | 4 von 27 (7) | 0 von 27 (13) | 0 von 27 (13) |

**Lesart, ehrlich:**

- **Knoten:** 186 → 99 je Strich auf den alten 31; auf den neuen 27 (gezeichnet mit den 3-m-Knoten) 71, der
  Zwischenstand mit Toleranz 0,12 m an allen Kreuzungspunkten hatte 76. Das ist die Hälfte, aber noch das 1,6-Fache des
  heutigen Pinsels. Woher der Rest kommt, zeigen die Experimente: Ein
  Drittel aller Linienpunkte hat eine Kreuzungsschranke (so dicht sind die Schleifen), und dort muss der Fit eng
  bleiben, weil Strich 2 kreuzende Stränge nur um den Mindestabstand 2,2 m trennt; ohne diese Toleranz wären es 79. Der
  heutige Pinsel braucht fast nie enge Knoten (57 ohne, 59 mit), weil seine Tiefe kreuzende Stränge um ganze Spuren
  trennt (Einrasten auf Spuren). Die zweite Hälfte des Rests ist die Tiefe selbst: Strich 2 glättet sie mit 20 m statt
  40 m Grenzwellenlänge und kehrt öfter um (25 gegen 19), mehr Krümmung in 3D heißt mehr Segmente. Beides sind
  Entscheidungen für Stufe P1 (Kreuzungen: Stränge um Spuren trennen, wo Platz ist) und eine Einstellung (Glättung), nicht
  der Fit.
- **Festwerden kostet keine Knoten:** fest 2 bis 60 m gibt 111 bis 108 Knoten, das Atmen der Schienen steigt dabei von
  1,4 auf 3,1 px (90 %). Vorgabe bleibt 2 m: Die gezeigten Schienen stehen still (1,6 px sind der Fit des letzten,
  noch nicht festen Segments).
- **Gestufte Toleranz:** Statt überall 0,12 m, wo eine Kreuzungsschranke war, jetzt je Paar die Hälfte des Spielraums
  nach der Lösung (0,12 m am Mindestabstand, normal ab 2,4 m Spielraum). Dazu misst der spätere Strang seinen Abstand an
  den festen Schienen des früheren: Ein früher gefittetes Segment darf bis 1,2 m von seiner Linie abliegen, vorher galt
  der Abstand nur für die Linienpunkte. Abbrüche an Kreuzungen 18 statt 19, also kein messbarer Unterschied in der Fahrt.
- **Form:** Knicke 249 gegen 226/187 (alte 31) und 188 gegen 229 (neue 27), Rollen 125° gegen 142–149° je 100 m, gleiche
  Liga; die Knicke sind weiter überwiegend die Schleifen des Strichs (Abschnitt 9).
- **Der heutige Pinsel misst sich nicht gleich:** Seine Probefahrten laufen im Zeitbudget, zwei Läufe derselben 31 Striche
  gaben 64 / 226 und 59 / 187 (Knoten / Knicke), bei 23 von 31 Strichen eine andere Knotenzahl, einmal 216 gegen 179.
  Strich 2 ist deterministisch. Vergleiche mit dem heutigen Pinsel tragen daher rund ±10 %.
- **Band:** Das pinke Band ist bei Strich 2 der Vorlauf, 12 m (178 px bei zoom 14,8), beim heutigen Pinsel Tempo mal
  0,14 s (41 px im Median, 109 px bei schnellen Zügen) mit Deckel 200 px, und es holt beim Anhalten nicht auf, weil der
  Vorlauf Entscheidungszeit ist, keine Verzögerung: Die Schienen erreichen eine Stelle rund 0,6 s, nachdem der Finger dort
  war. Kürzer geht (FREEZE 6–8 m), die Wirkung auf Hügel und Kehren ist dann ungemessen; das ist Entscheidung 1 aus
  Abschnitt 8 in Zahlen.
- **Fahrbar:** auf den neuen 27 Strichen schafft der heutige Pinsel 4, Strich 2 keinen (13 Abbrüche an Kreuzungen, 5
  Entgleisen, 5 Fall). Das ist Stufe P1/P4, unverändert.
- Nicht geprüft: das Gefühl des Bands und der Knoten am Mac (nur Standbilder: Strich 47 bei 7 s und nach dem Loslassen,
  89 Knoten auf 544 m), die Bildrate am Mac, das Handy.

**Absicherung:** 456 Tests (einer neu: Knoten nur wo nötig, feste Knoten stehen still, G1 am Anschluss) und
`npm run build` grün, Szenarien 1–28 gegen den Messserver :5188 alle bestanden (Stand nach allen Änderungen dieses
Abschnitts); der heutige Pinsel ist ohne `&strich=2` unverändert, `reduceNodes` hat nur die optionale Vorgabe der
Anfangs- und Endtangente dazubekommen, die er nicht nutzt.

## 11. Nachtrag 29.10.: Strich 2 wird der Pinsel, Vorlauflänge gemessen (Florians dritter Test)

Florian hat am 29.10. früh 18 Striche in `test-huegel` gezeichnet (Stand 960ea46: gefittete Knoten, pinkes Band) und
gesagt: „gefällt mir schon ganz gut, braucht aber noch sehr viel Feintuning“. Auf die Frage Editor oder Strich fiel die
Entscheidung: hier der Strich (Stufe P1 ist der kritische Pfad von Editor-Stufe 4, Tor S4 braucht eine gezeichnete und
gefahrene Bahn durch Szene 06), die Editor-Session beginnt parallel mit Stufe 5 (Earle-Look). Damit ist Entscheidung 8
aus Abschnitt 8 gefallen: Strich 2 wird der Pinsel der Ebenen-Zonen. Seine Feintuning-Punkte hat er noch nicht genannt;
sie kommen nach seinem nächsten Zeichnen als Liste.

**Geändert (`src/app/scenes/level.ts`, `src/track/strich2.ts`, `scripts/pinsel-messung.ts`, `tests/strich2.test.ts`):**

- **Vorgabe:** In Zonen mit Ebenenstapel zeichnet der Pinsel jetzt ohne Parameter mit Strich 2; `&strich=1` nimmt den
  bisherigen Pinsel, `&strich=2` erzwingt Strich 2 auch ohne Ebenen (0 = automatisch). Zonen ohne Ebenen (Klötzchen,
  Werkstatt) bleiben beim bisherigen Pinsel, dort ist Strich 2 nicht gemessen. Überzeichnen fällt weiter auf den
  bisherigen Pinsel zurück (Stufe P1).
- **Vorlauf als Einstellung:** `Strich2` nimmt die Vorlauflänge als sechsten Parameter (`FREEZE` 12 m bleibt Vorgabe);
  im Spiel `&vorlaufm=8` (Meter), in der Messung `--vorlauf 8`. Neu auch `--tag JJJJ-MM-TT`, weil `--heute` fest den
  28.10. meint. Ein Test prüft, dass ein kürzerer Vorlauf um genau so viele Meter früher fest wird (457 Tests).
- **Geprüft im Browser** (:5188, `?zone=test-huegel&editor=2`, Strich in der Seite als Zeigerereignisse): ohne Parameter
  läuft Strich 2 (mitten im Strich 38 von 50 Linienpunkten fest, 12 m Vorlauf bei zoom 5,1; nach dem Loslassen 78 m Bahn
  mit 4 Knoten); mit `&strich=1` läuft der bisherige Pinsel (12 Knoten in der Vorschau, kein fester Teil).

**Vorlauflänge nachgespielt** (`--strich 2 --vorlauf 12|8|6`, Median je Strich; die Spalte „heute“ ist der bisherige
Pinsel auf denselben Strichen):

| Satz | Vorlauf | Knoten | Knicke | Rollen je 100 m | Tiefenspanne / Umkehr | Sprung Loslassen (px / m) | Fahrt (Abbruch an Kreuzung) |
|---|---|---|---|---|---|---|---|
| 18 Striche 29.10. (`test-huegel`) | 12 m | 41 | 82 | 123° | 20,5 m / 11 | 0,1 / 0,2 | 0 von 18 (3) |
| | 8 m | 41 | 73 | 118° | 21,9 m / 13 | 0,1 / 0,2 | 0 (3) |
| | 6 m | 43 | 85 | 122° | 20,7 m / 13 | 0,1 / 0,2 | 0 (2) |
| | heute | 32 | 104 | 144° | 29,2 m / 11 | 24,9 / 0,2 | 0 (2) |
| 27 Striche 28.10. 21:34 | 12 m | 71 | 188 | 112° | 17,8 m / 21 | 0,2 / 0,2 | 0 von 27 (13) |
| | 8 m | 72 | 190 | 115° | 18,6 m / 19 | 1,3 / 0,2 | 0 (13) |
| | 6 m | 72 | 180 | 117° | 17,8 m / 19 | 0,2 / 0,2 | 0 (13) |
| | heute | 54 | 229 | 142° | 30,5 m / 16 | 29,4 / 7,4 | 4 (7) |
| 31 Striche 28.10. 18:39 | 12 m | 99 | 249 | 125° | 26,5 m / 25 | 0,1 / 0,2 | 0 von 31 (18) |
| | 8 m | 97 | 265 | 126° | 26,6 m / 25 | 0,1 / 0,2 | 0 (17) |
| | 6 m | 105 | 263 | 126° | 26,3 m / 25 | 0,1 / 0,2 | 0 (17) |
| | heute | 59 | 187 | 149° | 40,7 m / 19 | 15,7 / 0,1 | 0 (10) |

**Lesart, ehrlich:**

- **Die Vorlauflänge kostet in der Form nichts Messbares.** Knoten, Knicke, Rollen, Tiefenspanne und Umkehrungen
  liegen bei 6, 8 und 12 m innerhalb von ±6 % und ohne Richtung (Knicke auf den 31 Strichen +6 %, auf den 18 Strichen
  bei 8 m −11 %, bei 6 m +4 %). Der Sprung beim Loslassen bleibt 0, die Fahrt ändert sich nicht (die Kreuzungen sind
  bei allen drei Längen der erste Abbruchgrund, Stufe P1/P4).
- **Was sich ändert, ist nur das Band:** 12 m sind bei zoom 14,8 rund 178 px, 8 m 118 px, 6 m 89 px, dazu kommen in
  allen Fällen rund 34 px, um die die Pinselspitze selbst hinter dem Finger hängt (gemessen, unabhängig vom Vorlauf).
  Der bisherige Pinsel liegt bei 41–109 px (Tempo mal 0,14 s). Mit 6 m ist Strich 2 also in derselben Liga. Die
  Wahl ist eine Gefühlsfrage, keine Messfrage: Entscheidung 1 aus Abschnitt 8, am Mac mit `&vorlaufm=6` und `8`
  ausprobierbar, ohne neuen Stand.
- **Vorbehalt:** Ein kürzerer Vorlauf sieht an einer beginnenden Kehre weniger Zukunft. In den drei Sätzen (darunter
  die schleifenreichen 31) zeigt sich das in den Zahlen nicht; ein eigener Kehren-Satz (nur Kehren, groß gezeichnet)
  ist nicht gemessen.
- **Heute gegen Strich 2 auf den 18 Strichen von heute:** 32 gegen 41 Knoten (1,3-fach, weniger Kreuzungen als in den
  Schleifen-Sätzen), Knicke 104 gegen 82, Sprung beim Loslassen 24,9 gegen 0,1 px. Fahrbar ist in `test-huegel` mit
  keinem Pinsel ein Strich (Entgleisen, Stehenbleiben, Fall, Kreuzung), das ist Stufe P4 und offen.
- **Zeiten:** Die 8- und 6-m-Läufe liefen parallel zu Build und Szenarien, ihre Vorschau- und Plan-Zeiten (8–10 ms)
  sind darum nicht mit den 12-m-Läufen im Leerlauf (5,2–5,6 ms) vergleichbar; die Nachmessung im Leerlauf steht unten.

**Absicherung:** 457 Tests (einer neu: Vorlauflänge) und `npm run build` grün; Szenarien 1–28 gegen den Messserver
:5188 alle 200 Prüfungen bestanden, mit Strich 2 als Vorgabe in den Ebenen-Szenen 25–28 (Szenario 25 setzt jetzt 8 statt
5 Knoten, alle in der Tiefe der Ebene). Zonen ohne Ebenen laufen unverändert mit dem bisherigen Pinsel. Nicht geprüft:
das Gefühl am Mac mit kürzerem Vorlauf, das Handy, Zonen ohne Ebenen mit `&strich=2`.

**Zeiten im Leerlauf nachgemessen** (18 Striche vom 29.10., ohne parallele Läufe): Vorlauf 12 m: Vorschau 5,8 ms im
Median, 90 % 12,3 ms, Plan beim Loslassen 5,6 ms; Vorlauf 6 m: 5,6 / 12,1 / 5,5 ms. Die Vorlauflänge kostet also auch in
der Zeit nichts; die 8–10 ms in der Tabelle oben waren Last durch Build und Szenarien (derselbe 12-m-Lauf unter Last
9,6 ms, im Leerlauf 5,8 ms). Stand: `zoneneditor` steht noch auf e38bf6b; der Fast-Forward dorthin wurde der
Studien-Session vom Berechtigungsmodus verweigert (fremder Worktree), wie der Stand hereinkommt, entscheidet Florian.

## 12. Nachtrag 29.10. vormittags (9 Uhr): Fortsetzen und Überzeichnen auf Strich 2 (Stufe P1)

Florians Auftrag nach der Entscheidung: „Du machst hier mit Fortsetzen/Überzeichnen auf Strich 2 weiter.“

**Befund vorher** (im Browser nachgestellt, `test-huegel`, Strich 2 als Vorgabe):

- **Fortsetzen:** Strich 2 bekam die alte Bahn nur als Linie mit Tiefe und fittete sie bei jeder Vorschau mit; ihre
  Knoten wanderten dadurch um bis zu 5,3 m (Tiefe blieb). Der heutige Pinsel macht dasselbe (er plant die ganze Linie
  neu und hält nur die Tiefe). Florians Bild „was fest ist, bleibt“ galt also nur innerhalb eines Strichs.
- **Überzeichnen:** fiel auf den heutigen Pinsel zurück: keine Vorschau während des Strichs, beim Loslassen wurde die
  ganze Bahn neu geplant (auch die Tiefe außerhalb des überzeichneten Stücks).

**Geändert** (`src/track/pathSplit.ts` neu, `src/track/strich2.ts`, `src/app/scenes/level.ts`, `scripts/pinsel-messung.ts`):

- **Bahn-Teilung** (`splitPathAt`): de Casteljau auf einem Segment an der Parameterstelle einer Bahnprobe; die Kurve
  bleibt dieselbe, nur ein Knoten kommt dazu (dicht an einem Knoten wird an ihm geteilt). Kopf und Schwanz tragen den
  Teilungsknoten als Kopie.
- **Strich 2 übernimmt die Knoten der alten Bahn wörtlich** (`base.nodes`): sie werden feste Segmente, die beim
  Zurückziehen nie wegfallen; gefittet wird erst ab dem letzten alten Knoten, mit dessen Richtung (G1). Die 1-m-Linie
  bekommt einen Punkt genau am letzten Knoten, damit der Fit dort ansetzt.
- **Ende mit Ziel** (`finish(points, endAt)`): für das Überzeichnen gleiten die letzten 5 Pinselmeter auf den Zielpunkt,
  ein Linienpunkt liegt genau dort, die Tiefe dort ist vorgegeben (Löser-Pin wie beim Rundenschluss) und die
  Endrichtung geht als Endtangente in den Fit; kein Rundenschluss in diesem Fall.
- **Level-Szene:** Fortsetzen gibt die Knoten mit. Überzeichnen mit Strich 2: Kopf = Bahn bis zum Anfasspunkt (bleibt
  wörtlich), der Strich löst ab dort mit Vorschau wie ein neuer; beim Loslassen auf der Bahn (vorwärts, binnen 30 px)
  bleibt der Schwanz dahinter wörtlich und der Nahtknoten nimmt Lage und Ausgangsgriff des Schwanzes, Eingangsgriff aus
  dem Fit. Endet der Strich neben der Bahn, geht die Bahn ab dem Anfasspunkt im Strich weiter (wie heute).
  **Platzhalter:** rückwärts gezeichnetes Überzeichnen fällt weiter auf den heutigen Pinsel zurück; Überzeichnen über
  die Naht einer geschlossenen Runde ebenso (der Kopf wäre leer).
- Die Nachspiel-Messung gibt beim Fortsetzen jetzt ebenfalls die Knoten mit (sonst liefe sie anders als das Spiel).

**Geprüft:** 16 Tests in `tests/strich2.test.ts` und `tests/pathSplit.test.ts` (Teilung ändert die Kurve nicht, nahe am
Knoten keine Winzsegmente, geschlossene Bahn; Fortsetzen: alte Knoten wörtlich gleich, Nahtknoten an der alten Lage,
Eingangsgriff wie dort, Ausgang in dieselbe Richtung; Ende mit Ziel: letzter Knoten genau am Ziel, in dessen Tiefe,
Eingangsgriff gegen die Zielrichtung). Im Browser (:5188, `test-huegel`): Fortsetzen lässt alle alten Knoten exakt stehen
(3 von 3, Nahtknoten an derselben Stelle), Strich 2 aktiv mit Vorschau; Überzeichnen mitten in der Bahn mit Strich 2
(Art „overdraw“, Vorschau mit 5 Knoten während des Strichs), Kopf und Schwanz behalten Lage und Kurve, nur die Griffe
der beiden Teilungsnachbarn sind wie bei de Casteljau verkürzt. Nicht geprüft: das Gefühl am Mac, rückwärts, geschlossene
Runden, das Handy.

**Nachspiel, ehrlich** (deine ersten 18 Striche von heute, alle setzen das Vorgabestück der Station fort; Median je
Strich, vorher → nachher): Knoten 41 → 45, Knicke 82 → 92, Rollen 123° → 126° je 100 m, Tiefenspanne 20,5 → 20,6 m,
Sprung beim Loslassen 0,1 px → 0,1 px, Abweichung Bahn–Strich 2,5 → 2,6 px. Ursache: Das Vorgabestück bleibt jetzt
starr und der Strich schließt G1 daran an; vorher bog der Fit das Stück mit (bei beiden Pinseln), was die ersten Meter
glatter machte, aber „was fest ist, bleibt“ verletzte. Wer schräg zum Stück loszeichnet, bekommt jetzt einen kurzen
Haken mit zwei bis vier Knoten. Eine Richtungs-Angleichung der ersten Meter wäre eine Änderung an deinem Strich selbst
(deine Regel: die schwarze Linie bleibt), darum nicht gebaut, sondern eine Entscheidung für dich.

**Absicherung:** 462 Tests (sechs neu) und `npm run build` grün; Szenarien 1–28 gegen den Messserver :5188 alle 200
Prüfungen bestanden (nur Zahlenrauschen gegenüber dem Lauf vom Vormittag). Stand: Commit auf
`claude/pinsel-studie-8f0777` nach b658b07; die Editor-Session holt den Zweig per Fast-Forward nach `zoneneditor`
(Florians Entscheidung, 29.10.).

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

Ganze Spur (8,4 m) für jedes im Bild nahe Paar (±6 m in x, bis 7,7 m in Y), kleiner Versatz nur als Rückfall. Auf
denselben 21 Strichen (die ältesten 21 von heute, die Nachspiel-Auswahl hatte sich verzählt, darum 21 statt 34):
Kreuzungen 20 → 26, Knicke 127 → 142, Rollen 118° → 145° je 100 m, Tiefenspanne 19,7 → 28 m. Grund: In Florians dichten
Schleifenhaufen muss ein Strang dann von jedem nahen früheren eine Spur weg, die Rampen von 8,4 m kommen sich gegenseitig
in die Quere, die Schranken widersprechen sich, der Löser klemmt irgendwo fest. Verworfen.

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

Der Knoten-Fit ist jetzt einstellbar (`&tol=`, `&even=`, `&span=`, `&turn=`; Messung `--tol --even --span --turn`), und
die Varianten sind auf den 21 Strichen gemessen (Median je Strich, alle mit derselben Kreuzungsregel):

| Variante | Knoten | Abweichung Bahn–Strich 90 % | Knicke |
|---|---|---|---|
| Vorgabe (Toleranz 0,3/1,2 m, gleichmäßig, 90 m, 120°) | 48 | 2,0 px | 137 |
| Toleranz doppelt (0,6/2,4 m) | 48 | 1,9 px | 134 |
| ohne Gleichverteilung | 47 | 2,0 px | 137 |
| Segmente bis 150 m und 180° Drehung | 44 | 2,1 px | 132 |
| Toleranz doppelt und ohne Gleichverteilung | 48 | 2,0 px | 137 |

**Lesart, ehrlich:** Die Toleranz ändert die Knotenzahl nicht. Die Knoten kommen aus den Schleifen des Strichs: Ein
kubisches Segment schafft höchstens eine Drehung von 120° (jetzt 180°), eine gezeichnete Schleife braucht also drei bis
vier Knoten, und Florians Striche haben im Median 130 Proben mit Radius unter 4 m, also viele kleine Schleifen. Die
Knoten sind damit „nötig“ im Sinn des Fits, nicht im Sinn des Zeichners. Weniger Knoten gäbe es nur, wenn die Bahn die
kleinen Schleifen nicht mitmacht (Glättung über die 4-m-Grenze, eine Entscheidung) oder wenn der Fit andere Kurven
als Kubiken nutzte. Die Vorgabe ist jetzt 150 m / 180° (8 % weniger Knoten bei gleicher Abweichung).

### 13e. Ruckeln beim Bearbeiten über die Punkte

Gemessen im Browser (303 m Bahn, 52 Knoten): Jedes Zeigerereignis beim Ziehen eines Knotens, Griffs, der Tiefe, Rolle
oder eines Segments baute die ganze Bahn neu (`redrawTrack`: Proben, Kennzahlen, Schienen-Mesh, Stützen; 14 ms je
Ereignis, bis 31 ms), und ein Trackpad liefert bis zu 120 Ereignisse je Sekunde: 1,7 s Arbeit je Sekunde, daher
„ruckelt und stockt“. Jetzt merkt das Ereignis nur vor, die Bahn wird einmal je Bild leicht neu gebaut (Schienen wie die
Pinsel-Vorschau, Kennzahlen und stehender Zug bleiben vom letzten vollen Aufbau) und beim Loslassen ganz. Gemessen
danach (251 m, 87 Knoten): 0,2 ms je Ereignis, 10,5 ms je Bild im Median während des Ziehens (ein Ausreißer 110 ms).
Nicht geprüft: das Gefühl am Mac, längere Bahnen (bei 500 m rund 20 ms je Bild, also unter 60 fps; das Mesh wächst noch
nicht inkrementell, Risiko 4 aus Abschnitt 7).

### 13f. Ergebnis

Nachspiel auf denselben 17 Strichen von heute früh (Median je Strich; „vorher“ = Stand 0d07c0f, „Spur für alle“ = der
verworfene erste Umbau, „jetzt“ = Stand nach 13c–13e):

| | vorher | Spur für alle | jetzt |
|---|---|---|---|
| Kreuzungen auf gleicher Höhe (Summe) | 11 | 19 | 3 |
| Striche ohne Kreuzung | 9 von 17 | 10 | 15 |
| Fahrt-Abbruch an Kreuzung / Entgleisen / Stehenbleiben / Fall | 5 / 5 / 1 / 5 | 5 / 4 / 0 / 7 | 1 / 7 / 4 / 4 |
| Knoten je Strich | 38 | 47 | 36 |
| Bahnmeter je Knoten | 8,0 | 8,1 | 9,2 |
| Knicke (R < 4 m) | 63 | 131 | 78 |
| Rollen je 100 m | 122° | 140° | 127° |
| Tiefenspanne / Umkehr | 19,7 m / 10 | 27,7 m / 13 | 25,3 m / 11 |
| Sprung beim Loslassen (px) | 0,1 | 0,2 | 0,3 |
| Vorschau Median / 90 % (ms, unter Last) | 6,6 / 13,8 | 12,5 / 30,6 | 7,7 / 18,4 |

**Lesart, ehrlich:** Die Kreuzungen auf gleicher Höhe sind von 11 auf 3 gefallen, 15 von 17 Strichen haben keine mehr;
die drei übrigen liegen an Stellen, an denen die Regel galt, aber auf keiner Seite Platz für den Versatz war (Ebenen,
Stufe P2). Die Spur-Rampen kosten Form: Knicke 63 → 78 und Tiefenspanne 20 → 25 m, Rollen leicht mehr, und die Fahrt
scheitert jetzt eher am Entgleisen und Stehenbleiben als an Kreuzungen (geschafft bleibt 0 von 17: Stufe P4). Die Knoten
sind nur leicht weniger (38 → 36), weil die Schleifen des Strichs sie brauchen (13d). Im Browser bestätigt: eine Bahn,
die ihren ersten Strang schräg kreuzt, geht 11 m dahinter vorbei, ohne Kreuzung auf gleicher Höhe (120 m, 10 Knoten).
Die Zeiten sind unter Last gemessen (parallel liefen Szenarien und weitere Nachspiele). Im Spiel bedeutet eine ganze
Spur Abstand 4,2 m Höhenunterschied im Bild an der Kreuzung; ob das „so gut wie keine Kreuzungen“ trifft, zeigt sich
beim Zeichnen.

**Die beiden Sätze von gestern** (Median je Strich; „alte Regel“ = 0d07c0f, „jetzt“ = Seiten-Regel mit Fenster, zweitem
Durchgang, Spur an sauberen Kreuzungen, Toleranz 0,3, Fit 150 m / 180°; der heutige Pinsel auf denselben Strichen,
nicht deterministisch, ±10 %):

| | 27 neue: alte Regel | jetzt | heutiger Pinsel | 31 alte: alte Regel | jetzt | heutiger Pinsel |
|---|---|---|---|---|---|---|
| Kreuzungen auf gleicher Höhe (Summe) | 208 | 129 | 264 | 423 | 215 | – |
| Striche ohne Kreuzung | 12 von 27 | 16 | 15 | 4 von 30 | 8 | – |
| Fahrt-Abbruch an Kreuzung | 13 | 3 | 8 | 18 | 12 | 10 |
| Fahrt geschafft | 0 | 0 | 4 | 0 | 0 | 0 |
| Knoten je Strich | 70 | 52 | 57 | 99 | 80 | 59 |
| Knicke | 208 | 177 | 218 | 297 | 301 | 187 |
| Rollen je 100 m | 114° | 121° | 147° | 127° | 142° | 149° |
| Tiefenspanne | 19,5 m | 28,3 m | 30,9 m | 26,6 m | 38,3 m | 40,7 m |
| Vorschau Median (ms, unter Last) | 7,5 | 9,8 | 33,7 | 6,6 | 8,7 | 32,8 |

(Der Kreuzungswert des heutigen Pinsels auf den 31 Strichen stammt aus einem älteren Lauf ohne diese Zählung.) Lesart:
Auf den Schleifen-Sätzen bleibt rund ein Drittel bis die Hälfte der Kreuzungen, 5 bis 7 je Strich, in dichten
Schleifenhaufen, wo sich die Schranken mehrerer früherer Stränge widersprechen oder kein Platz ist; der heutige Pinsel
hat dort mehr. Die Knoten sind mit 52 und 80 je Strich näher am heutigen Pinsel (57 und 59) als vorher (70 und 99).

**Absicherung:** 464 Tests (zwei neu: flache Kreuzung unter 9° mit kleinem Versatz, schräge Kreuzung unter 35° mit
ganzer Spur, beide ohne Kreuzung auf gleicher Höhe) und `npm run build` grün; Szenarien 1–28 gegen den Messserver :5188
alle 200 Prüfungen bestanden (Szenario 25 setzt mit 150 m / 180° jetzt 6 statt 8 Knoten, alle in der Tiefe der Ebene).
Im Browser (`test-huegel`): ein Strich, der seinen ersten Strang schräg kreuzt, geht 11 m dahinter vorbei (120 m, 10
Knoten, keine Kreuzung auf gleicher Höhe); zwei Schleifen hintereinander mit mehreren Kreuzungen (229 m, 22 Knoten)
ebenfalls ohne Kreuzung auf gleicher Höhe. Nicht geprüft: das Gefühl am Mac (Band, Spur-Rampen, Ziehen über die
Punkte), das Handy, Zonen ohne Ebenen. Stand: Commit auf `claude/pinsel-studie-8f0777` nach 0d07c0f; die Editor-Session
holt den Zweig per Fast-Forward nach `zoneneditor`.

### 13g. Vorschau-Kosten und Restkreuzungen (Florians zweiter Auftrag: „Vorschau wieder unter 5 ms, Restkreuzungen in dichten Schleifenhaufen“)

**Aufschlüsselung** (die Messung gibt je Vorschau jetzt Löser, Kreuzungsschranken, Knoten-Fit und Abfragen getrennt aus;
31 Schleifen-Striche, Median je Vorschau, unter Last durch die Szenarien der Editor-Session): Vorschau 7,4 ms, davon
Löser 0,2, Kreuzungsschranken 0,1, Knoten-Fit 0,8 und **Abfragen an Ebenen und Feld 6,3 ms**. Nicht der Löser war teuer,
sondern die Abfragen: je Vorschau wurden alle noch freien Linienpunkte neu befragt (rund 20 Punkte, je Punkt
`depthAt`, `groundAt` und `field.free`), obwohl ein endgültiger Linienpunkt sich nicht mehr bewegt, und die Messung
ließ die Vorschau-Bahn bis zur Spitze reichen (`cut = false`), was für jeden freien Punkt noch `solid` und `floor`
kostete. Im Spiel endet die Vorschau-Bahn am festen Teil.

**Geändert:**

- **Abfragen einmal je endgültigem Linienpunkt** (`queried`), und vorläufige Punkte (sie entstehen je Vorschau neu, liegen
  aber fast an derselben Stelle) übernehmen die Werte ihres Vorgängers am selben Linienindex, wenn er näher als 0,3 m liegt.
- **Löser auf dem Band:** Die Matrix hat nur Einträge mit |i − j| ≤ 2; Cholesky auf dem Band statt dicht (O(k) statt O(k³)
  je Runde). Bei den üblichen 20 freien Punkten kaum messbar (0,2 ms), bei offenen steilen Läufen bis 90 m wichtig.
- **Kreuzungssuche billiger:** Bühnenlage der Schienenpunkte einmal berechnet (`railStage`), Seiten-Schlüssel als Zahl
  statt Text, Zeitmessung je Anteil.
- **Messung wie im Spiel:** Vorschau-Bahn bis zum festen Teil (`cut = true`); dadurch misst „Rückstand der Schienen“ jetzt
  den Vorlauf (im Spiel sichtbar), nicht mehr den Pinselrückstand.
- **Fit bis zur Spitze, gezeigt bis zum festen Teil:** Die Messung wie im Spiel deckte auf, dass der Fit nur bis zum
  festen Teil (so lief es im Spiel) rund 10 Knoten je Strich mehr setzt als der Fit bis zur Spitze (so lief es in der
  Messung mit `cut = false`): An der festen Grenze entstanden kurze Segmente, die dann fest wurden. Jetzt fittet Strich 2
  immer bis zur Spitze (freie Punkte mit billigem Weltpunkt ohne Feld), zeigt die Bahn aber nur bis zum festen Teil (das
  Segment mit dem Ende wird dort geteilt, de Casteljau). Damit die Schienen weit hinten stillstehen, wird ein Segment, das
  über die feste Grenze hinausreicht, am festen Ende geteilt und sein vorderer Teil fest, sobald der länger als `FIX_SPAN`
  30 m ist (Platzhalter). Das letzte gezeigte Segment atmet, wie schon beim Stand 0d07c0f (1,6 px, Abschnitt 10).

**Ergebnis** (Median je Vorschau; zuerst unter Last durch die Szenarien der Editor-Session, Endstand bei freier
Maschine): 31 Striche 7,4 → 5,4 → 4,1 ms unter Last, Endstand **3,0 ms** (90 %: 11,5 ms); 27 Striche 3,8 ms (90 %:
10,6); 17 Striche von heute 2,8 ms (90 %: 8,8). Davon Abfragen 2,5 bis 3,0 ms, und die bestehen aus zwei Aufrufen von
`field.free` je Vorschau zu je rund 1,4 ms (die freien Tiefenabschnitte am Strahl eines neuen Punkts über den ganzen
Ebenenstapel). Löser, Schranken und Fit zusammen 0,3 ms. Weiter runter geht es nur über das Feld selbst (Stufe P1
„Kantenfelder je Ebene“: ein Index je Ebene statt des Gangs über alle Flächen), nicht über Strich 2.

**Restkreuzungen, ehrlich:** Die Messung zählt jetzt Schranken-Konflikte (ein Punkt soll vor dem einen und hinter dem
anderen Strang liegen): auf den 31 Schleifen-Strichen rund 31 000 Konfliktpunkte über alle Vorschauen, rund 1000 je
Strich. Zwei Rückfälle gemessen: alle Paare eines Punkts auf eine Seite zwingen (297 statt 215 Kreuzungen, weil es die
Seiten anderer Begegnungen kippt) und fernere Paare fallen lassen, erst die Paare an derselben x-Stelle, dann nur das
nächste (276 statt 236). Beides verworfen. Dazu kommt: Die Seiten-Regel reagiert in dichten Haufen auf Rundung (der
Band-Löser rechnet dieselbe Matrix, 215 → 236 Kreuzungen nur durch Rundungsunterschiede in den Seitenentscheidungen),
die Zahl schwankt also um rund ±10 %. Die Haufen sind strukturell zu eng für die Mindestabstände; mehr geht nur mit mehr
Raum (Höhlenmeter, Spuren, Stufe P2) oder damit, dass die Bahn kleine Schleifen nicht mitmacht (Entscheidung).

**Endstand** (Median je Strich; „b954df7“ = der Stand vom Nachmittag, „jetzt“ = Fit bis zur Spitze, Abfragen einmal,
Band-Löser; bei freier Maschine):

| | 31 alte: b954df7 | jetzt | 27 neue: b954df7 | jetzt | 17 heute: b954df7 | jetzt |
|---|---|---|---|---|---|---|
| Kreuzungen auf gleicher Höhe (Summe) | 215 | 179 | 129 | 107 | 3 | 3 |
| Striche ohne Kreuzung | 8 | 8 | 16 | 15 | 15 | 15 |
| Fahrt-Abbruch an Kreuzung | 12 | 12 | 3 | 3 | 1 | 0 |
| Knoten je Strich | 80 | 83 | 52 | 53 | 36 | 35 |
| Knicke | 301 | 310 | 177 | 142 | 78 | 80 |
| Tiefenspanne | 38,3 m | 40,3 m | 28,3 m | 27,7 m | 25,3 m | 25,5 m |
| Vorschau Median / 90 % (ms) | 8,7 / 24,5 (Last) | 3,0 / 11,5 | 9,8 / 23,7 (Last) | 3,8 / 10,6 | 7,7 / 18,4 (Last) | 2,8 / 8,8 |

Die Kreuzungen sind mit demselben Regelwerk etwas weniger (179 statt 215, 107 statt 129): Fit bis zur Spitze und
einmalige Abfragen ändern die Tiefenlösung nur über Rundung und den Abfrage-Cache, in dichten Haufen reicht das für
±10 bis 15 %. Die Zahl ist also keine Verbesserung der Regel, sondern Rauschen in ihrem Rahmen.

**Absicherung:** 464 Tests und `npm run build` grün (der Stillstand-Test lässt das letzte gezeigte Segment atmen, wie es
seit 0d07c0f ist); Szenarien 1–28 gegen den Messserver :5188 alle 200 Prüfungen bestanden, nur Zahlenrauschen gegenüber
dem Lauf von b954df7. Nicht geprüft: das Gefühl am Mac (Atmen des letzten Segments, Spur-Rampen), das Handy, Zonen ohne
Ebenen. Stand: Commit auf `claude/pinsel-studie-8f0777` nach b954df7, Fast-Forward nach `zoneneditor` möglich.

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
„Vorschau unter 5 ms im Median“ ist damit am Mac mit Abstand erfüllt; die Handy-Messung bei 1000 m steht noch aus.

**Absicherung:** 466 Tests (zwei neu: Rasterindex gegen direkte Rechnung auf den Fixturen und in den drei Testzonen) und
`npm run build` grün; Szenarien 1–28 gegen den Messserver :5188 alle 200 Prüfungen bestanden, darunter 24–28 (Andockkanten,
Stützen in der Höhle, Felder) mit denselben Werten wie ohne Index, sonst nur Zahlenrauschen. Nicht geprüft: das Handy,
der Aufbau des Index im Editor nach einer Ebenenänderung (30 bis 80 ms beim ersten Strich danach), Zonen mit sehr viel
mehr Ebenen (der Index wächst mit Ebenen mal Flächenlisten mal 128²). Stand: Commit auf `claude/pinsel-studie-8f0777`
nach 5bca0a7, Fast-Forward nach `zoneneditor` möglich.

**Nachtrag:** Der Index wird jetzt in einem Leerlauf-Tick nach jedem Neubau des Ebenenstapels vorgebaut
(`indexPlaneStack` in `level.ts`, `requestIdleCallback` mit 500 ms Frist, sonst nach 50 ms; ein inzwischen neu gebauter
Stapel baut seinen eigenen), damit auch der erste Strich nach einer Ebenenänderung nicht wartet. Die Editor-Session hat
aa5810a geholt und die Bedingungen im Diff bestätigt. Geprüft: 466 Tests, Build, Szenarien 11 und 24–28 (43 Prüfungen).

### 13i. Handy-Messung für Tor P1 (Florians Auftrag: „60 fps bei 1000 m Linie mit Strich 2, headless am Handy-Bild“)

**Aufbau:** `scripts/pinsel-bildzeiten.mjs` mit neuer Option `--viewport 852x393@3` (iPhone quer, dreifache
Pixeldichte; die Kamera behält den Zoom der Aufnahme), headless Chromium mit Metal auf dem M3 Pro, also eine Schätzung
des Handys, keine Messung am Gerät. Vier deiner längsten Striche vom 28.10. werden als Zeigerereignisse im Takt der
Aufnahme nachgezeichnet, mit Strich 2 (Vorgabe) und mit dem bisherigen Pinsel (`&strich=1`); gezählt werden die Bilder
zwischen zwei `requestAnimationFrame`-Aufrufen während des Strichs und die Dauer von `previewBrush`, davon `setTrack`.

| Strich | gemalt | Strich 2: Ø fps / Bilder über 20 ms | Vorschau Median / 90 % (davon `setTrack`) | bisheriger Pinsel: Ø fps / über 20 ms | Vorschau Median / 90 % |
|---|---|---|---|---|---|
| #65 `test-huegel` 18:48, zoom 14,8 | 1396 m | 56,4 fps / 6 % | 17,0 / 30,0 ms (11,8) | 45,1 fps / 15 % | 32,5 / 86,3 ms |
| #86 `test-huegel` 21:39 | 1257 m | 53,8 fps / 4 % | 8,8 / 23,5 ms (5,6) | 46,1 fps / 10 % | 19,7 / 91,4 ms |
| #53 `test-huegel` 18:42 | 1265 m | 53,5 fps / 3 % | 11,4 / 24,7 ms (8,3) | 40,4 fps / 12 % | 67,6 / 135,1 ms |
| #41 `test-boegen-f2` 14:16, zoom 7 | 862 m | 60,0 fps / 0 % | 8,5 / 14,3 ms (6,2) | 49,8 fps / 15 % | 28,1 / 50,6 ms |

Vorschau-Dauer über der Linienlänge (Strich #65, Median je 100 m): Strich 2 3,6 ms bei 0–100 m, 10,3 ms bei 500 m, 24,1 ms
bei 1000 m, 34,4 ms bei 1300 m; bisheriger Pinsel 4,4 → 33 → 96 → 175 ms. Nach dem Loslassen: Strich 2 keine
Probefahrten, kein Stocken; der bisherige Pinsel 0,1 bis 0,8 s Probefahrten mit Bildern bis 1083 ms.

**Lesart, ehrlich:** Tor P1 ist in der Bildrate fast, aber nicht ganz erreicht: 54 bis 56 fps im Schnitt bei 1250 bis
1400 m, bei 862 m glatte 60; 3 bis 6 % der Bilder sind länger als 20 ms, ein Bild je Vorschau, wenn die Vorschau über
die Bildzeit wächst. Der Löser von Strich 2 ist daran mit rund 1 ms unbeteiligt (Abschnitt 13g/13h); die Vorschau wächst
mit der Bahnlänge, weil `setTrack` je Vorschau das Schienen-Mesh der ganzen Bahn neu baut und `sampleTrack` und
`trackStats` die ganze Bahn abtasten (Risiko 4 aus Abschnitt 7: „Das Mesh wächst noch nicht inkrementell“). Bei 1000 m
sind das rund 20 der 24 ms. Der nächste Schritt für glatte 60 fps bei 1000 m wäre also nicht am Strich, sondern am
Renderer: den festen Teil der Bahn (Proben, Kennzahlen, Mesh) behalten und je Vorschau nur den Teil ab dem letzten
festen Segment neu bauen. Das ist eine Änderung an `view.setTrack` und `sampleTrack`, abzustimmen mit der
Editor-Session, nicht gebaut. Der bisherige Pinsel liegt bei 40 bis 50 fps mit 10 bis 15 % langsamen Bildern und friert
nach dem Loslassen für die Probefahrten ein.

Nicht geprüft: das echte Handy (Metal auf dem M3 Pro ist schneller als ein iPhone; die Zahlen sind eine obere Schranke
der Bildrate), Hochformat, Striche über 1400 m.

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

### 14a. Paket 1: Vorlauf dynamisch, Start sofort

**Gebaut** (`src/track/strich2.ts`, `freezeLimit`): Wo in den letzten 12 m nichts zu entscheiden ist, wird schon
`LOOK_SHORT` 3 m hinter der Spitze fest; liegt ein anderer Strang in Reichweite (Kreuzungsschranke), `LOOK_BASE` 6 m
(Florians „im Zweifel 6“); bei einem steilen Punkt, einer Richtungsumkehr in x oder einer Tiefe, die noch mehr als
0,5 m von ihrem Ziel entfernt ist (etwa nach einer Stufe der Bodenhöhe), der volle Vorlauf von 12 m (`&vorlaufm`). Ein
offenes steiles Stück blockiert das Festwerden wie bisher. Die erste Vorschau kommt nach 3 statt 6 Linienmetern
(`MIN_LINE`). Beides Platzhalter, bis Florian es gezeichnet hat.

**Warum die Tiefe-Regel:** Mit nur „steil oder Umkehr“ als Auslöser fror die flache Anfahrt vor einem Anstieg zu früh
fest, bevor die Tiefe ihrem Bodenziel gefolgt war (Test „liest steil Gezeichnetes als Höhe“: Drift 3,96 statt unter
3 m). Mit der Regel „noch unterwegs zum Ziel → voller Vorlauf“ ist der Test wieder grün, bei gleichem Zeichengefühl auf
ruhiger Strecke.

**Im Browser** (`test-huegel`, langsam gezogener Strich, zoom 2,3): nach 0,8 s und 8 m Linie stehen die ersten Schienen
(4 m fest, Band 4 m); auf ruhiger Strecke bleibt das Band 3 bis 6 m, an Stellen mit offener Entscheidung wächst es auf
13 bis 17 m und fällt danach zurück. Dabei rückt das vordere Schienenende in Sprüngen vor (einmal von 8 auf 31 m fest in
0,4 s): Das ist Florians „Sprünge“, und es wird in Paket 4 mit dem animierten Nachziehen behandelt, nicht hier.

**Nachspiel auf deinen Strichen** (Median je Strich; „fest 12 m“ = Stand 31c9327, „dynamisch“ = Paket 1, „+ Start frei“
= dazu die ersten 6 m nach dem Anschluss auch in einem offenen steilen Stück fest, „+ offen ab 40 m“ = dazu ein offenes
steiles Stück ab 40 statt 90 m als Höhe fest):

| | 31 alte: fest 12 m | dynamisch | + Start frei | + offen ab 40 m | 27 neue: fest | dyn. | + Start | + 40 m | 15 heute: fest | dyn. | + Start | + 40 m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kreuzungen (Summe) | 178 | 193 | 196 | 192 | 107 | 99 | 112 | 108 | 3 | 3 | 5 | 4 |
| Knoten je Strich | 83 | 82 | 82 | 82 | 53 | 53 | 53 | 52 | 35 | 34 | 35 | 36 |
| Knicke | 310 | 314 | 314 | 317 | 142 | 159 | 159 | 152 | 80 | 83 | 82 | 109 |
| Rollen je 100 m | 140° | 141° | 141° | 141° | 121° | 116° | 120° | 118° | 125° | 122° | 124° | 127° |
| Fahrt-Abbrüche an Kreuzung | 12 | 12 | 13 | 12 | 3 | 3 | 4 | 4 | 0 | 0 | 1 | 0 |

**Lesart, ehrlich:** In Form und Fahrt ist der dynamische Vorlauf auf deinen Strichen unsichtbar (alle Unterschiede im
Rauschen der Regel), er ändert nur, wann die Schienen kommen. Und da zeigte die erste Messung des Bands etwas anderes
als erwartet: Auf deinen 15 Strichen von heute früh liegt das Band im Median bei 13,9 m und im oberen Zehntel bei
54 m, nicht bei den 3 bis 6 m, die der dynamische Vorlauf auf ruhiger Strecke erlaubt; die ersten Schienen kommen nach
3,9 Linienmetern (vorher waren es 6 m plus Vorlauf). Der Grund für das lange Band ist nicht der Vorlauf, sondern
die Regel „ein offenes steiles Stück wird nicht fest“ (Abschnitt 6): Deine Striche sind fast durchgehend steil
(Schleifen), ein steiles Stück gilt erst als gelesen, wenn es sich als Hügel oder Kehre erklärt hat, und bis dahin
bleibt alles dahinter offen. Mit „offen ab 40 m“ fällt das obere Zehntel des Bands von 54 auf 21 m, auf den
Hügel-Strichen steigen dafür die Knicke (82 → 109); darum bleibt 90 m die Vorgabe und 40 m ein Schalter zum
Ausprobieren (`&freezemax=40`). Die freien Startmeter nach dem Anschluss (`&lookstart`) ändern auf deinen Strichen
nichts Messbares (die ersten Schienen kommen ohnehin nach 4 m), sie bleiben als Sicherung für steile Starts. Die
eigentliche Antwort auf das lange Band bei Schleifen ist Paket 3: Eine erkannte Schleife kann als Ganzes fest werden,
sobald sie sich schließt.

**Absicherung (29.10., 14 Uhr):** 466 Einheitstests in 58 Dateien bestanden (15 davon für Strich 2, der Vorlauf-Test
neu: ruhige Strecke gleich, Kehre im Fenster anders), `vite build` ohne Fehler, alle 28 Browser-Szenarien mit
200 Prüfungen bestanden (Server 5188, nach Abschluss der Code-Änderungen gestartet, damit kein Vite-Neuladen die Kette
abbricht). Schalter: `&vorlaufm` (voller Vorlauf, Vorgabe 12 m), `&freezemax` (offenes steiles Stück, Vorgabe 90 m),
`&lookstart` (freie Startmeter nach dem Anschluss, Vorgabe 6 m); die Messung nimmt sie als `--vorlauf --freezemax
--lookstart`.

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
- **Absicherung (29.10.):** 472 Einheitstests in 59 Dateien bestanden, `vite build` ohne Fehler, alle 28
  Browser-Szenarien auf 5188: im Durchlauf 199 von 200 Prüfungen, die eine (Oval: Stillstand erwartet) an die neuen
  Regeln angepasst und einzeln bestanden (Phase done, 14 km/h).

### 15e. Messung alt gegen neu (dieselben Striche, dieselben Bahnen; nur die Fahrt unterscheidet sich)

| | 21 heute früh | 27 neue | 31 alte (Schleifen) |
|---|---|---|---|
| angekommen, streng → Antrieb | 1 / 21 → 21 / 21 | 0 / 27 → 27 / 27 | 0 / 30 → 30 / 30 |
| Striche, bei denen der Antrieb eingreift | 17 | 23 | 29 |
| geschobene Meter je Strich: Median / 90 % / max | 20 / 33 / 49 | 41 / 100 / 123 | 60 / 123 / 131 |
| Anteil an der Bahnlänge (Median) | 3,7 % | 7,3 % | 6,8 % |
| kopfüber (Antrieb, ganze Bahn) / Selbstkreuzungen des Strichs im Bild | 137 / 77 | 470 / 469 | 605 / 796 |
| Striche mit mehr kopfüber als Selbstkreuzungen | 17 | 19 | 12 |
| Querkraft-Spitze je Strich, Median / 90 % | 9,0 / 14,3 g | 10,6 / 17,5 g | 9,7 / 14,8 g |
| Zeitanteil über 1,5 g quer (Median) | 3 % | 4,6 % | 5,9 % |
| Zeitanteil Schräglage am Anschlag 80° (Median) | 10 % | 12 % | 12 % |
| Höchsttempo (Median) | 76 km/h | 77 km/h | 84 km/h |
| Fahrzeit Median / max | 38 / 64 s | 53 / 176 s | 80 / 199 s |

**Lesart, ehrlich:**

- Jede Bahn kommt an. Der Antrieb greift auf fast allen Strichen ein, aber kurz: 4 bis 7 % der Länge, im oberen
  Zehntel 100 bis 120 m am Stück (ein langer Anstieg, den die Lesung als Höhe gelesen hat). Das sind bei 4 m/s
  25 bis 30 s Kriechen; ob das Tempo passt, ist Gefühlssache (`&antrieb`).
- Die **Überkopffahrten** sind das offene Thema, nicht die Abbrüche: Auf den zwei neueren Sätzen haben 17 von 21 und
  19 von 27 Strichen mehr Inversionen als Selbstkreuzungen im Bild. Die Zählung ist grob (eine Acht ist eine
  Kreuzung, eine Schleife über einem fremden Strang zwei), aber die Richtung ist klar: Es gibt Inversionen, die der
  Strich nicht als Schleife gezeichnet hat. Das ist genau Paket 3 (gezeichnete Schleifen als gewollte Loopings, der
  Rest flach), und die Messung braucht dort einen echten Schleifen-Zähler statt der Selbstkreuzungen.
- Die **Querkraft-Spitzen** von 9 bis 17 g sind keine Fahrt-, sondern Form-Werte: An Knicken der Bahn (Abschnitt 13,
  80 bis 180 je Strich) begrenzt die Fahrt die Krümmung auf 2,5 m Radius, und bei 80 km/h sind das 20 g. Die strenge
  Fahrt hat sie versteckt, weil sie an der ersten Stelle endete (deshalb dort 0,4 bis 1,8 g Median). Für das
  Schreien der Fahrgäste (Bild im Bild, E3) braucht die gefühlte Kraft einen weicheren Deckel als die Fahrt selbst;
  für die Bahn bleibt es die Knick-Arbeit am Strich.
- Die Schräglage liegt ein Zehntel der Zeit am Anschlag (80°). Ob das in der gekippten Perspektive als Überkopf liest,
  ist eine Stilprobe (60° als Deckel wäre ein Schalter, kostet mit `drive` nichts mehr, weil nichts mehr entgleist).
- Fahrzeit bis 199 s auf 1300-m-Strichen: lang, aber das sind Striche aus dem Zeichentest; die Zonen-Felder begrenzen
  die Länge (Budget-Regler, Plan 4).

### 15f. Offene Entscheidungen für Florian (nichts davon ist gesetzt)

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

**Entscheidung 3 aus Abschnitt 10** (Nachsicht der Fahrt) ist damit durch Florians Antwort 2 und diesen Umbau
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

„Vorher“ ist der Stand 11454fb (Paket 2), „nachher“ Schleifen neu mit der bisherigen Kehren-Regel (16c, Lesung 4 war
dazwischen noch schlechter: Knicke-Median 142 / 301 / 381, Kreuzungen 18 / 192 / 309). Inversionen nach Lage wie in 16a;
„Kehre + sonst“ ist der Teil, den niemand gezeichnet hat.

| | 21 heute früh: vorher → nachher | 27 neue | 31 alte (Schleifen) |
|---|---|---|---|
| Strich 2 erkennt: Loopings (davon aufgeweitet) / Bodenschleifen | 19 (13) / 23 | 72 (32) / 76 | 63 (20) / 114 |
| Inversionen gesamt | 137 → 155 | 470 → 481 | 606 → 482 |
| davon in Loopings (Zählung des alten Pinsels) | 10 → 22 | 34 → 35 | 50 → 30 |
| in Bodenschleifen (alter Pinsel; viele davon sind jetzt Loopings nach Strich 2) | 50 → 41 | 147 → 208 | 276 → 210 |
| an Kehren + sonst (ungewollt) | 77 → 92 | 289 → 238 | 280 → 242 |
| Kreuzungen auf gleicher Höhe (Summe) | 6 → 19 | 112 → 175 | 196 → 255 |
| Knicke je Strich (Median) | 124 → 134 | 159 → 270 | 314 → 401 |
| Knoten je Strich (Median) | 36 → 42 | 53 → 59 | 82 → 81 |
| Band hinter dem Festen je Vorschau, Median / 90 % | 37,9 / 80 m → 39,8 / 91 m | 37,9 / 84 → 40,8 / 105 m | 38 / 45 → 41 / 94 m |
| angekommen | 21 / 21 → 21 / 21 | 27 → 26 | 30 → 30 |

**Lesart, ehrlich:**

- **Die Loopings sind da.** 19, 72 und 63 gezeichnete Kringel sind jetzt Loopings mit konstanter Tiefe, ein Drittel bis
  zwei Drittel davon auf 4 m Radius aufgeweitet; weitere 23, 76 und 114 flache Kringel sind Bodenschleifen. Das ist das,
  was Florian wollte, und es steht in Tests und Zahlen.
- **Die ungewollten Inversionen sinken kaum:** auf den zwei schleifenreichen Sätzen um 15 bis 18 %, auf dem kleinen
  Satz steigen sie. Der Grund steht in 16c: Kehren bleiben die bisherige Lesung, und die kippt bei hohen schmalen U.
  Die Zählung „in Loopings / Bodenschleifen“ stammt vom alten Pinsel (Schwelle 0,9, nach oben gezeichnet) und zählt
  Florians hängende Kringel als Bodenschleifen; nach Strich 2 sind viele davon gewollte Loopings. Ein Zähler, der die
  Lesung von Strich 2 selbst nimmt, fehlt noch.
- **Kreuzungen auf gleicher Höhe und Knicke werden mehr,** und zwar deutlich (Kreuzungen +60 bis +200 %, Knicke +8 bis
  +70 %). Das ist das Gegenteil von Florians Wunsch („so gut wie keine Kreuzungen“, „nur die nötigsten Punkte“). Die
  Ursache habe ich nicht gefunden: Verdächtig sind die konstante Tiefe der Loopings in dichten Haufen (der Kringel
  wich vorher als Kehre 10 bis 25 m in die Tiefe aus und ging so anderen Strängen aus dem Weg), die Stufe der eigenen
  Ausfahrt (2,5 m über 16 m) und die Aufweitung. Eine Zählung, welche der neuen Kreuzungen eigene Schleifenkreuzungen
  sind und welche Kreuzungen mit anderen Strängen, ist der nächste Schritt.
- **Das Band wird länger** (Median +2 m, oberes Zehntel +10 bis +50 m), weil Kehren jetzt warten, bis sie keine
  Schleife mehr werden können. Für die Schleifen ist das nötig, für Florians Zeichengefühl ein Rückschritt.
- Die Kettenlinie greift in den Testzonen nicht (16d), die Vorschau-Zeiten ändern sich nicht messbar.

**Konsequenz:** Die Schleifen-Lesung bleibt eingebaut und an (Florians Entscheidung), aber mit Schalter `&schleifen=0`
(Messung `--schleifen 0`) für den bisherigen Stand, und die Frage, ob die Loopings den Preis wert sind, geht mit den
Zahlen an Florian (16f). Ich würde sie heute nicht als Verbesserung verkaufen.

### 16f. Offen und Entscheidungen

1. **Schleifen an oder aus**, bis die Kreuzungen und Knicke geklärt sind (Zahlen oben; im Spiel `&schleifen=0` zum
   Vergleich). Empfehlung: an lassen und die Kreuzungen als Nächstes aufklären (eigene Schleifenkreuzung gegen fremde
   Stränge), denn die Loopings selbst sind richtig.
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

### 16g. Nachgang (Florian 29.10., 18 Uhr: „Schleifen anlassen und die Kreuzungen aufklären“)

**Zuordnung.** Je Strichsatz drei Läufe ohne Schleifen-Lesung auf dem neuen Code (die Nebenänderungen einzeln) und
die Messung nach Lage: eigene Schleifenkreuzung (Ausfahrt gegen Einfahrt), Schleife gegen fremden Strang, außerhalb.

| Kreuzungen gleiche Höhe / Knicke-Median / Band 90 % | 21 heute früh | 27 neue | 31 alte |
|---|---|---|---|
| alt (11454fb) | 6 / 124 / 80 m | 112 / 159 / 84 m | 196 / 314 / 45 m |
| nur „Kehren warten, bis sie wieder unten sind“ | 7 / 143 / 95 | 106 / 261 / 105 | 215 / 342 / 101 |
| nur „Kreuzungsschranken nach den Formzielen“ | 11 / 98 / 79 | 134 / 213 / 84 | 195 / 289 / 45 |
| beides, ohne Schleifen (Stand 946d9f1) | 10 / 134 / 95 | 135 / 271 / 105 | 171 / 325 / 101 |
| beides, mit Schleifen (946d9f1) | 20 / 137 / 91 | 172 / 270 / 105 | 281 / 401 / 94 |

- Das **Warten** der Kehren (zweiter Schenkel bis auf halbe Höhe zurück) machte das Band 15 bis 55 m länger und auf dem
  Satz mit 27 Strichen die Knicke um 64 % mehr; der zweite Schenkel verlor dabei seine eigene Lesung als Lauf.
- Die **Reihenfolge** (Schranken nach den Formzielen) brachte auf zwei Sätzen mehr Kreuzungen (6 → 11, 112 → 134),
  dafür weniger ungewollte Inversionen.
- Die **Schleifen** selbst: Die eigenen Schleifenkreuzungen bleiben gleich (3 → 2, 36 → 35, 47 → 44), mehr werden die
  Kreuzungen **Schleife gegen fremden Strang** (3 → 8, 68 → 110, 90 → 160); die Knicke häufen sich an den Ausfahrten.
  Der schlimmste Strich (1900 m, 19 Schleifen, 54 Kreuzungen) zeigt, was das ist: In 42 von 54 Fällen liegt die Linie an
  der Kreuzung weniger als 1 m in der Tiefe auseinander, die beiden Stellen liegen im Median 930 m auseinander auf der
  Bahn. Es sind also nicht die Kringel einer Kette, die sich stoßen, sondern spätere Stränge, die Hunderte Meter weiter
  wieder über eine längst feste Schleife laufen und dort auf deren Tiefe klemmen.

**Umbauten danach (alle gemessen):**

1. Kehren erkennen sich am **geraden zweiten Schenkel** (über die letzten drei Linienstücke weniger als 15° Drehung,
   seit dem Fuß weniger als 200°) statt am Zurückkommen; ein Kringel dreht weiter und schließt. Das Band ist damit
   wieder so lang wie vorher (90 %: 81, 84 und 51 m), die Knicke ohne Schleifen gehen auf dem 27er-Satz von 271 auf 213.
2. Die Kehre endet wieder **drei Punkte hinter der Umkehr**, der zweite Schenkel ist ein eigener Lauf: Knicke ohne
   Schleifen 213 → 197. Der Hügel braucht nur noch eine klare Richtung dahinter.
3. **Schranken hybrid:** außerhalb von Schleifen vor den Formzielen (wie vor Paket 3), in Schleifen danach: ohne
   Schleifen 112 → 92 Kreuzungen auf dem 27er-Satz.
4. **Ausfahrt** kleiner Schleifen versetzt höchstens die halbe Schleife (vorher rückte eine 17-Punkte-Schleife als
   Ganzes nach hinten).
5. Gegen die Kreuzungen mit fremden Strängen drei Versuche: die Schleife als Ganzes auf die nächste Tiefe mit Platz
   rücken (kein messbarer Unterschied), überlappende Schleifen auf eigene Tiefen legen (kein Unterschied), und eine feste
   Schleife als **eine Begegnung** mit einer Seite zählen statt je 12-Punkte-Bündel (der schlimmste Strich 54 → 41
   Kreuzungen, zwei andere schlechter, in Summe +5 bis +10 %, dafür Knicke −7 bis −9 % auf zwei Sätzen). Der letzte
   Stand ist eingebaut; die anderen beiden sind drin, aber ohne Wirkung.

**Stand jetzt gegen alt** (Schleifen an; `&schleifen=0` ist der Stand davor mit den Kehren-Umbauten):

| | 21 heute früh | 27 neue | 31 alte |
|---|---|---|---|
| Kreuzungen gleiche Höhe | 6 → 9 | 112 → 189 | 196 → 297 |
| Knicke je Strich (Median) | 124 → 118 | 159 → 218 | 314 → 374 |
| Knoten je Strich (Median) | 36 → 42 | 53 → 62 | 82 → 86 |
| ungewollte Inversionen (Kehre + sonst) | 77 → 84 | 289 → 288 | 280 → 285 |
| Band 90 % | 80 → 81 m | 84 → 84 m | 45 → 51 m |
| Loopings erkannt | 19 | 72 | 63 |

**Lesart, ehrlich:** Die Kehren-Umbauten haben Band und Knicke repariert, soweit sie von den Nebenänderungen kamen. Was
bleibt, ist der Preis der Schleifen selbst: auf den schleifenreichen Sätzen rund 70 bis 90 Kreuzungen auf gleicher Höhe
mehr (+50 bis +70 %) und 20 bis 60 Knicke mehr je Strich, weil spätere Stränge über feste Schleifen klemmen. Drei
Versuche dagegen haben nichts gebracht; der Mechanismus (welche Schranken sich dort widersprechen) ist noch nicht
verstanden. Auf dem kleinen Satz ohne Kringelketten kostet die Schleifen-Lesung nichts. Nächster Schritt: an einer
dieser Stellen die Schranken je Punkt ansehen (`lastSolve` liefert sie) statt weiter an Regeln zu drehen; bis dahin
bleibt die Lesung an, wie Florian es entschieden hat, und `&schleifen=0` ist der Vergleich.

### 16h. Aufgeräumt (Florian 29.10., 21 Uhr: „Ja, räum alles auf, aber ich weiß gerade nicht, was das Richtige ist“)

Florians Einwand: Wir bauen wieder viele Sonderregeln; seine Idee war, Tiefe und Physik frei zu wählen, die Regeln
eher aus den Ebenen (davor, dahinter) als aus dem Pinsel zu nehmen, und Überkopffahrten wie Knicke von vornherein
auszuschließen, ohne den Strich beim Zeichnen denken zu lassen. Die Zahlen geben ihm recht: `strich2.ts` ist von 1156
Zeilen, 37 Konstanten und keinem Schalter (Strich 2 als Vorgabe, 29.10.) auf 1897 Zeilen, 58 Konstanten und 11 Schalter
gewachsen, und drei Regeln des Nachgangs standen ohne gemessene Wirkung im Code.

**Raus** (−94 Zeilen): die gemeinsame Verschiebung einer Schleife in ihre Schranken, die eigene Tiefe überlappender
Schleifen, die feste Schleife als eine Begegnung, die Diagnose-Schalter `--kehrewait` und `--crossafter` (die hybride
Reihenfolge der Schranken und die Kehre am geraden Schenkel bleiben, aber ohne Schalter). Nachgemessen (gleiche Sätze):

| aufgeräumt (55b2e39) gegen 1429359 | 21 heute früh | 27 neue | 31 alte |
|---|---|---|---|
| Kreuzungen gleiche Höhe | 9 → 12 | 189 → 181 | 297 → 277 |
| Knicke je Strich (Median) | 118 → 129 | 218 → 240 | 374 → 374 |
| Knoten je Strich (Median) | 42 → 43 | 62 → 61 | 86 → 82 |
| ungewollte Inversionen (Kehre + sonst) | 84 → 84 | 288 → 300 | 285 → 282 |

Strich für Strich sind die Bahnen des committeten Stands praktisch die von 1429359 (Längen auf wenige Meter gleich):
Die entfernten Regeln haben nichts getragen. (Korrektur: In der ersten Fassung dieses Abschnitts standen Zahlen eines
Zwischenstands der Aufräumarbeit, Kreuzungen 20/182/253, Knicke 133/234/365; die Striche waren dort um bis zu 15 %
länger als in beiden Ständen davor und danach. Beim Nachmessen für Studie 17 ist das aufgefallen, die Tabelle oben ist
der committete Stand.) Die Streuung zwischen den Varianten des Nachgangs (Kreuzungen 9 bis 20, 176 bis 189, 253 bis
297) ist so groß wie ihre Unterschiede. Das ist der eigentliche Befund: An den Kreuzungen weiter mit Regeln zu drehen,
misst Rauschen.

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
(`bankAt` rechnet weiter auf dem Oben-Vektor auf) und die Fahrt-Regeln aus Paket 2. Messschalter `--rahmen alt` nur in
`pinsel-messung.ts`, kein Spielschalter.

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

Zwei Tests der strengen Fahrt (physics, fahrt: „42-m-Lifthügel, 4 m enge Kehre am Boden, knapp 3 g quer trotz voller
Schräglage, Entgleisen auf Holz“) schlugen mit der neuen Regel fehl: Der Wagen hält die Kehre jetzt mit 0,8 g. Nachgesehen:
Die Kehre fällt in der Tiefe ab (16 m Höhe auf 1,6 m über 30 m, dabei 180° Drehung); der alte Rahmen zog auf dieser
Neigung kaum zurück und ließ den Wagen aus dem Transport heraus 28° *nach außen* gerollt stehen, die 80° Schräglage
griffen so nur zur Hälfte, 1,9 g quer, Entgleisen. Mit dem Rahmen quer zur Tangente aufrecht sitzt die Schräglage
richtig. Die Tests fahren jetzt eine 2,5 m enge Kehre (physics zusätzlich ab 50 m Höhe, 106 km/h): strenge Fahrt
entgleist mit gut 2 g, `drive` kommt mit 3,3 g quer durch. Das heißt auch: Ein Teil der „Entgleisen 8 von 21“ aus 15a
war der Rahmen, nicht die Bahn.

### 17d. Messung: alt gegen neu, Regel und Mindestradius einzeln und zusammen

Dieselben drei Strichsätze wie in 15 und 16 (21 vom 29.10. früh, 27 neue, 31 alte mit Schleifen), Strich 2, Fahrt
`drive`; vier Stände aus zwei Messschaltern (`--rahmen alt`, `--minr 0`): **alt** = Stand 55b2e39, **Rahmen** = nur die
Regel der Schienen, **Radius** = nur der Mindestradius im Fit, **beides** = der neue Stand. Die Bahn ist bei „alt“ und
„Rahmen“ Strich für Strich dieselbe (die Regel ändert nur den Oben-Vektor), bei „Radius“ und „beides“ ebenso.
„Kopfüber“ zählt die Fahrt wie bisher: Wagen-Oben unter −0,2, also auch ein Wagen, der in voller Schräglage (80°)
schon leicht über die Seite kippt; „halbe Rollen“ und „Rahmen-Drehung“ messen den Oben-Vektor der Schienen gegen die
Welt-Senkrechte quer zur Tangente, ohne fast senkrechte Stücke. Knicke sind Abtastpunkte (0,25 m) mit Radius unter
4 m, hier unabhängig vom Oben-Vektor gezählt (die bisherige Zählung „nur wo aufrecht“ steigt mit der neuen Regel, weil
mehr Bahn aufrecht ist, und taugt nicht mehr zum Vergleich).

| alt → Rahmen → Radius → beides | 21 heute früh | 27 neue | 31 alte (Schleifen) |
|---|---|---|---|
| kopfüber (Fahrt, Wagen-Oben unter −0,2) Σ | 151 → 87 → 135 → **81** | 531 → 439 → 439 → **375** | 536 → 456 → 444 → **339** |
| davon deutlich (Wagen-Oben unter −0,6) | 98 → 40 → – → **37** | 346 → 249 → – → **231** | 305 → 246 → – → **198** |
| davon außerhalb gezeichneter Loopings | 129 → 73 → 112 → **69** | 502 → 415 → 408 → **353** | 493 → 420 → 404 → **296** |
| halbe Rollen des Rahmens außerhalb von Loopings Σ | 107 → 12 → 91 → **9** | 288 → 79 → 249 → **71** | 315 → 75 → 292 → **50** |
| Rahmen-Drehung je 100 m (Median) | 403° → 180° → 370° → **157°** | 462° → 250° → 422° → **221°** | 450° → 236° → 383° → **173°** |
| Knicke R < 4 m (Abtastpunkte) Σ | 4551 → 4551 → 3406 → **3406** | 14353 → 14353 → 11454 → **11454** | 19570 → 19569 → 14518 → **14503** |
| davon außerhalb gezeichneter Schleifen | 2815 → 2815 → 2009 → **2009** | 6998 → 6998 → 5328 → **5328** | 8705 → 8705 → 6311 → **6299** |
| Knoten je Strich (Median) | 43 → 43 → 38 → **38** | 61 → 61 → 57 → **57** | 82 → 82 → 76 → **76** |
| Querkraft max je Strich (Median) | 9,5 → 7,8 → 9,2 → **6,3 g** | 9,4 → 10,8 → 8,5 → **8,2 g** | 10,5 → 9,3 → 10,7 → **8,5 g** |
| Kreuzungen gleiche Höhe (wie die Fahrt zählt) | 12 → 30 → 9 → 21 | 181 → 230 → 172 → 213 | 277 → 339 → 245 → 332 |
| Vorschau je Schritt (Median) | 0,8 → 0,8 → 0,8 → **0,8 ms** | 0,8 → 0,8 → 0,7 → **0,8 ms** | 1,0 → 1,0 → 0,9 → **1,0 ms** |

Was das heißt:

- **Die Regel der Schienen** nimmt drei Viertel bis neun Zehntel der halben Rollen (−89 / −73 / −76 %) und die Hälfte der
  Rahmen-Drehung (−55 / −46 / −48 %); die Fahrt zählt 15 bis 42 % weniger Kopfüber, deutliches Kopfüber (unter −0,6)
  −59 / −28 / −19 %. Die Querkraft-Spitzen sinken auf zwei Sätzen (ein Satz steigt: 9,4 → 10,8 g; der Wagen, der vorher
  aus dem Transport schief stand, nimmt manche Kurve jetzt aufrecht und spürt sie voll).
- **Der Mindestradius** nimmt ein Viertel der Knicke (−25 / −20 / −26 %, außerhalb der Schleifen −29 / −24 / −28 %) und
  7 bis 12 % der Knoten, kostet höchstens 0,1 ms je Vorschau und kürzt die Bahnen im Median um 2,2 / 2,2 / 2,9 %
  (schlimmster Strich −8 %): Das ist die Abweichung von der Tinte an den Ecken. Was bleibt, sind die Schleifen und
  engen Kehren unter 4 m, die er absichtlich nicht anfasst (17b), und Ecken über 150°.
- **Zusammen:** Kopfüber −46 / −29 / −37 %, deutliches Kopfüber −62 / −33 / −35 %, halbe Rollen −92 / −75 / −84 %,
  Rahmen-Drehung −61 / −52 / −62 %, Knicke −25 / −20 / −26 %, Querkraft-Spitzen −34 / −13 / −19 %.
- **Kreuzungen auf gleicher Höhe** schwanken bei *identischer Bahn* zwischen 12 und 30 (Satz 21): Die Fahrt zählt sie
  dort, wo der Zug beim Passieren der anderen Spur zu nahe kommt, und die Lage des Zugs hängt am Oben-Vektor und an der
  Schräglage. Die Zahl taugt seit Paket 2 nicht mehr als Formmaß; eine rein geometrische Zählung an den Schienen wäre
  ehrlicher (offen, klein).

**Woher der Rest kommt** (Stand „beides“, jede Kopfüber-Stelle der Fahrt nach ihrer Lage im Rahmenplan der Schienen):

| | 21 | 27 | 31 |
|---|---|---|---|
| im geometrischen Looping-Bogen | 22 | 107 | 93 |
| in einer Drehzone (halbe Rolle an einer Kehre) | 37 | 97 | 40 |
| auf fast senkrechtem Stück | 3 | 4 | 3 |
| sonst | 19 | 167 | 203 |
| zum Vergleich: deutlich kopfüber (unter −0,6), alle Lagen | 37 | 231 | 198 |

- Die *geometrischen Loopings* sind mehr als die gezeichneten (14 / 23 / 43): Der Pinsel liest manche Kringel als
  Bodenschleife oder Kehre, baut sie aber so steil, dass sie in 3D durch die Senkrechte gehen und umkehren; für die
  Schienen sind das Loopings, und sie fahren sie als solche. Das ist eine Frage an die Lesung (Bodenschleife wirklich
  flach bauen, oder als Looping lesen), nicht an die Regel.
- Die *Drehzonen* sind die halben Rollen vor Kehren mit senkrechten Schenkeln: Auf dem Weg durch „quer“ zählt die Fahrt
  den Wagen mit Schräglage und Neigung kurz als kopfüber. Hier sieht man im Spiel eine Schiene, die sich über 16 m um
  180° dreht; ob das stört, kann nur Florian sagen.
- *Sonst* (19 / 167 / 203) ist nicht aufgeklärt. Ein Teil ist quer, nicht kopfüber: In voller Schräglage (80°) reichen
  zehn Grad Neigung des Rahmens für „unter −0,2“. Aber die strengere Zählung (Wagen-Oben unter −0,6, 37 / 231 / 198)
  zeigt, dass auf den Schleifen-Sätzen mehr deutliche Kopfüber-Stellen bleiben, als die geometrischen Loopings (107 / 93)
  erklären; der Rest liegt wohl hinter Loopings und Drehzonen, wo der Rahmen noch zurückdreht (die Lage-Zählung greift
  nur 2 m weit). Dafür fehlt eine Aufschlüsselung der deutlichen Stellen nach Lage; sie ist der erste Schritt, wenn
  Florian im Spiel noch Kopfüber sieht, das er nicht gezeichnet hat.

### 17e. Was offen bleibt

- Bodenschleifen und enge Kehren unter 4 m bleiben eng (bewusst, 17b). Ob der Pinsel sie wie Loopings weiten soll, ist
  eine Lesungsfrage für eine echte Zone, nicht für die Testzonen.
- Die Drehzonen (16 m, 11° je Meter) sind sichtbar; Florian sieht sie beim nächsten Zeichnen, wenn er eine senkrechte
  Kehre zeichnet. Länge und Lage sind eine Konstante (`TWIST_M`), kein Schalter.
- Kreuzungszählung geometrisch statt über die Fahrt (klein).
- Der Messschalter `--rahmen alt` bleibt, bis Florian den neuen Rahmen im Spiel gesehen hat; dann fliegt die alte Regel.
- Unverändert offen: 16f (Brücken, Marker, Kettenlinie-Testfeld), Pakete 4 (Mesh inkrementell, animiertes Nachziehen)
  und 5 (Raum in Zonen), Florians Feintuning-Liste.
