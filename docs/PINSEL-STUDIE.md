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

**Gebaut** (`src/track/strich2.ts`, 9 Tests in `tests/strich2.test.ts`, Level-Szene `src/app/scenes/level.ts`):
- Linie wächst nur am Ende (Abtastung 0,25 m, Gauß 0,5 m, 1-m-Punkte); Abfragen je Punkt gemerkt.
- Löser auf dem freien Ende: min Σ w·(z − Ziel)² + μ·Σ(Δz)² + λ·Σ(Δ²z)² + Wenden-Term, dichtes System mit Cholesky und
  aktiver Menge; Schranken aus Freiraum (Flächen) und Kreuzungen mit festen und freien Punkten; Station hält 12 m.
- Fester Vorlauf 12 m, bei steilen Stücken länger (bis 90 m); Hügel: Tiefe gerade von Fuß zu Fuß; Kehre: Halbkreis
  durch die Tiefe (nach oben gezeichnet nach hinten), mindestens 2,6 m, höchstens drei Spuren.
- Knoten alle 3 m ohne Fit (feste bleiben), Rundenschluss als Dubins-Weg ab dem festen Ende, Ende auf Stationstiefe.
- Keine Probefahrten-Hebel; Fels wird markiert, nicht abgeschnitten.

**Adresse und Schalter:** Messserver ohne Aufnahme `http://localhost:5188/` (statt 5186: den Port hält ein verwaister
Dev-Server der gelöschten Worktree `pinsel-studie`, PID 75373); Florians Server mit Aufnahme `http://localhost:5187/`.
Heutiger Stand: `http://localhost:5187/?zone=test-huegel&editor=2`. Prototyp: `…&strich=2`; mit `&vorlauf=1` bleibt
der noch unentschiedene Teil hinter der Spitze schwarze Linie statt Schienen (Florians „der Strich wird länger“).
Zonen: `test-huegel`, `test-grotte`, `test-boegen`, `test-boegen-f2` (Florians geändertes Bogenland).

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
   lassen?
4. **Höhlenmeter:** Budget je Feld, Startwerte (Vorschlag: 60 m, nur Vorschlag).
5. **Mindestabstand spielbarer Ebenen** (Vorschlag: 4 m, nur Vorschlag) und was mit engeren Ebenen passiert.
6. **Kantenrollen** im Werkzeug D: eine Taste mit Durchschalten (andocken, Lippe, Halter, Vorrang) oder vier Marken?
7. **Stützen- und Tunnelvarianten:** Teileliste und Materialien, erst nach der Stützen-Werkstatt (Paket 3).
8. Ob Strich 2 den heutigen Pinsel in `zoneneditor` ersetzt oder zunächst als Schalter dazu kommt.
