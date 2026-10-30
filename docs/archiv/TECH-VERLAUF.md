# Technik: Verlauf und alte Messungen (Archiv)

Aus `docs/TECH.md` hierher verschoben am 30.10.2026. Die Absätze stehen wörtlich so, wie sie in TECH.md standen;
die Überschriften folgen deren Abschnitten, ein kursiver Hinweis nennt die Stelle. Was heute gilt, steht in
[TECH.md](../TECH.md). Messwerte gelten für den Stand ihres Datums und die damaligen Strich-Aufnahmen.

## 3. Datenmodell der Bahn

*Oben-Vektor der Schienen, Regel vor Studie 17 (heute mit `&rahmen=1` zu sehen):*

- Oben-Vektor der Schienen (`sampleTrack`, Schritt 4): Parallel-Transport, auf flacher Strecke zur Welt-Senkrechten zurückgedreht (Drehung um die Tangente, höchstens 24° je Meter). Kopfüber bleibt er nur, wo der Transport ihn kopfüber bringt und die Bahn sich nach unten krümmt (oben im Looping); vorher konnte er auf verdrehten 3D-Wegen kopfüber liegen bleiben.

*Projektion auf die Bühne, Nebensatz zum früheren `LANE_SCALE`:*

(mit dem früheren 0,94 lief „gerade nach hinten“ bei 60 m schon 42° schräg über das Bild)

## 4b. Pinsel-Bahn

*Punkt 3, Live-Schienen, Messung:*

Gemessen an 49 Aufnahmen: Vorschau im Mittel 0,5 ms, höchstens rund 11 ms (Mac); Sprung beim Loslassen im Median 1,4 m Tiefe, bei dichten Kreuzungen und Rundenschluss mehr.

*Punkt 4, Rundenschluss, Stand vor dem 23.10.2026:*

Bis zum 23.10.2026 entschieden die Kreuzungsstrafe (200) und eine Drehung, die je Radiant bei weiten Bögen kaum weniger kostete als bei engen: In dichten Strichen und bei falsch herum ankommendem Ende gewann ein Vollkreis mit 16 oder 25 m Radius, der weit in den Himmel ragte.

*Punkt 4, Rundenschluss, Messungen:*

Gemessen an den 113 Aufnahmen (von 221), die nah genug an der Station enden, gegen den Stand davor: Schluss im Median 20 m lang (16 m), höchstens 44 m (122 m); weiter als 12 m vom Strich weg 0 (29, bis 32 m); länger als 60 m 0 (28); 2 dichte Kritzel schließen nur noch auf Tipp; Probefahrten über alle Pinsel-Aufnahmen 61 statt 55 von 210 geschafft, keine schlechter; neue Kreuzungen durch den Schluss 13 (9); Knick am Stationsknoten 0°. Eine Wende kurz vor der Station fährt flach durch die Tiefe (Scheitel von Wenden, Punkt 5): Kopfüber im Schluss nur noch in 2 von 111 Runden (mit den alten Riesenbögen 9, mit dem neuen Schluss allein 12).

*Punkt 5, Scheitel von Wenden, Messung:*

Gemessen an 175 Pinsel-Bahnen aus den Aufnahmen: ungewollt kopfüber (außerhalb senkrechter Loopings) in 42 statt 90 Bahnen; Neigung am Scheitel der 1171 Wenden im Median 8° statt 47°, über 90° bei 140 statt 415 (meist Kringel unter 3 m Bildradius); Probefahrten 82 statt 61 von 210 geschafft (gegen den Stand vor dem neuen Rundenschluss 31 mehr und 4 weniger, davon 3 Stillstand).

*Punkt 5, Engstellen, Laufzeit:*

Laufzeit danach auf 175 Aufnahmen: Median 16 ms, schlimmster Strich 0,7 s (vorher 19 ms und 1,1 s).

*Punkt 5, Loopings und gerade Hügel, Messung:*

Gemessen an 135 Aufnahmen: 71 von 74 hohen Schleifen fahren über Kopf (vorher 62), die Ausbeulung der Hügel von der Geraden zwischen den Füßen sinkt um 40 %, gleich viele Fahrten geschafft.

*Punkt 7, Knoten, Messung:*

Auf 159 Aufnahmen 16 % weniger Knoten, Abstände deutlich gleichmäßiger, Fahrten und g-Spitzen wie vorher (ohne Drehungsgrenze wären es 20 % weniger, aber lange Segmente biegen in engen Kurven spitzer als gezeichnet).

## 4e. Perspektive hinter Schalter

*Kamera exakt (24.10.), Stand vorher:*

Vorher galt jede Spur-Ebene als bildparallel (W ohne den
Höhenterm); 10 m über dem Ziel machte das bei D = 170 m rund 2,6 % Maßstab aus.

## 4f. Weltrenderer

*Einleitung, Ladeweg und Größe des Chunks (Stand 24.10.):*

Der Weltrenderer wird nur mit dem Schalter per dynamischem Import geladen (eigener
Chunk, 527 kB, 132 kB gzip); ohne Schalter ist das Spiel unverändert.

*Holz und Hängebahn, Tor 1a, die erste Fassung:*

die erste
Fassung hatte den Balken 2,4 m über dem Strich und die Gondel auf dem Strich

*Kulissen-Platzhalter, Tor 1a, Berg als ein Klotz:*

Tor 1a: als ein 41 m tiefer Klotz lag seine Vorderseite im geneigten Bild zehn Meter unter
der Rückseite, die Bahn schwebte sichtbar dazwischen

*Schritt 4: Lesarten-Knopf und Spur-Filter entfernt; Messung nach Schritt 4:*

- **Lesarten-Knopf und Spur-Filter raus** (Schritt 4, Plan Paket 7): Lesart ist der Pinsel, `?stage|single|lanes` nur
  noch für Szenarien und Replay; `src/render/shaders/laneFilter.ts` gelöscht, `WorldView.setFx` schaltet nur noch die
  Leuchtebenen; die Texte `strokeMode.*` sind aus den Sprachdateien.
- Messung am Mac nach Schritt 4 (800 × 600): Level 32 mit Bahn durch den Berg 106 Zeichenaufrufe, 120 fps; Level 8 Holz 96.
  Replay `--world` nach Schritt 4: wie nach Schritt 3 (250 Profile, 7410 Stützen, Median 2,0 px, kein Fehler); Kulissen prüft das Replay nicht, sie hängen nur vom Level ab.

*Was im Übergang in Pixi bleibt (Stand bis Schritt 4):*

- **Was im Übergang in Pixi bleibt:** Die Bodenstreifen der Spuren sind aus (`WorldView.setWorldMode`); Berge, Wasser, Deko
  (cover), Stützen, Coins, Elemente, Station, Absperrbänder und Effekte liegen weiter in den Spur-Containern über der Welt,
  ohne Tiefenpuffer: Sie decken Bahn und Wagen immer, Berge und Wasser skalieren je Spur einheitlich und liegen in
  Perspektive bis zu ein paar Pixel neben dem exakten Boden (bis Schritt 3 und 4). Karte und Übergang (Miniaturen, Fotos
  der Ebenen) kennen die Welt noch nicht (Paket 12).

*Messung am Mac und Replay (24.10.):*

- Messung am Mac (24.10., 800 × 600, Browser der Entwicklungsumgebung): 120 fps, 54 Zeichenaufrufe ohne Bahn, 108 mit Bahn
  und Zug (Straße oder Stahl 6, Zug 3, Boden 2). Replay mit Perspektive: 261 Aufnahmen, Pinsel 87 von 250 Fahrten
  geschafft (vorher mit der bildparallelen Näherung 88, ohne Perspektive 90), kein Fehler; die drei Bühnen-Lesarten laufen
  ohne Perspektive und sind unverändert. Replay `--world` (wie `--persp`, dazu je Pinsel-Bahn das Profil mit Teilen,
  Dreiecken und endlichen Werten sowie der Abstand der Bahnknoten zum Strich im Bild der Weltkamera, Median und Maximum, der
  Rundenschluss zählt mit): 250 Bahnprofile gebaut, keine ungültigen Werte; Abstand der Bahnknoten zum Strich bei 227 Aufnahmen mit fester Kamera im Median der Mediane 2,3 px (das Maximum lag in fortgesetzten Bahnen, deren alte Knoten nicht zum Strich gehören; seit Schritt 3 zählen nur neue Striche).

## 4g. Zonendatei: Oberfläche des Klötzchen-Editors (entfernt am 30.10.2026)

*Einleitung:*

Platzhalter-Werkzeug (Plan Paket 2.2, Stufe 1): Florian baut die Basiszone am Mac mit Maus, Trackpad und Tastatur, ohne
Politur; alles Gesetzte sind Klötzchen, die später Grafiken ersetzen.

*Metadaten je Element, Tasten:*

Im Editor am gewählten Element: M Fundament, O Öffnung (Dreiteiler), A Anker,
G Stufe, R Rolle; Fundament als grüne Oberkante, Anker als Punkt am Fuß, alles in der Statuszeile. Seit Tor 1b (25.10.):
Alt+Pfeile verschieben die Öffnung (Shift fein, sie bleibt im Element), Plus und Minus ändern ihren Radius, Shift+Pfeile
links/rechts die Dicke (Ausdehnung in der Tiefe) von Dreiteiler, Höhlenkasten und Wasser.

*Felder, Werkzeug „Feld“:*

Werkzeug „Feld“: in der Welt aufziehen (Rechteck auf Spur 0), Klick in ein Feld
wählt es, Enter schaltet es aktiv, Entf löscht.

*Felder, Kamera beim Bauen und Rahmen:*

Im Bauen bleibt die Kamera frei. Hochformat- und Querformat-Rahmen
des Felds (Plan 2.3) zeigt der Editor noch nicht.

*Station, Schlange, Baustelle, Coins, Auswahl (dazu gestrichen: die Tasten in Klammern, Richtung (D), Länge (Pfeile), Variante (V), Mindesttempo (Pfeile), Form (C), Zahl und Abstand (Pfeile)):*

Alle Einträge lassen sich wie Elemente wählen, ziehen, in der Tiefe schieben und
löschen (Treffer über die Kennung).

*Ziele, Stufen und Testfahrt je Feld, Tasten:*

Im Editor am gewählten Feld: N Name, Z Ziele als Zeile „finish, height 20, *coins 5“
(`parseGoals`, `formatGoals`; Stern = Bonus; Eingabe über den Browser-Dialog), G Stufe (alle, 0 bis 3), U Gurt.

*Ziele, Stufen und Testfahrt je Feld, Knopf „Testfahrt“:*

Der Knopf „Testfahrt“ schaltet das gewählte Feld aktiv, wechselt ins Spielen und startet die
Fahrt (Tab zurück).

## 4h. Etappe 2: Bahn und Welt

*Fähigkeiten und Aufwertungen, Tasten des Klötzchen-Editors:*

Editor: U wählt die Stufe (alle → 0 … n → alle), Shift+U
bearbeitet die Stufe der Zone als Zeile („kettenzug launch booster, gurt 2, kette 32, wagen rot, name Bügel“; die Tabelle
wird damit Teil der Datei), S die Überschreibungen des Felds („+launch -tunnel, gurt 3, kette 30, budget 400, höhe 40“);
die Statuszeile zeigt den aufgelösten Satz.

*Fels-Regeln (Schritt 5), abgelöst durch das Freiraumfeld:*

- **Fels-Regeln** (Schritt 5; `src/zone/rock.ts`, Plan 5.1, 5.2, Richtlinie 3): Die Zone baut aus ihren Platzhaltern mit
  Volumen ein Festigkeitsfeld (`RockField`, je Fortschrittsstufe neu). Ein Dreiteiler ist Rückwand, Innenraum und
  Vorderlippe: Lippe (vor der Spur des Elements, in Spuren `z − d/2`) und Rückwand (`z + d/2`) sind je ein Band von
  ±`ROCK_MARGIN` = 0,12 Spuren, die Lippe außer in ihren Öffnungen; der Innenraum dazwischen ist frei und zählt als
  Tunnel; die Flanken sind offen wie bei den Bergen der Level (die gemalten Teile bringen feste Flanken und echte
  Öffnungsvolumen als Metadaten). Säulen sind Zylinder, Höhlenkästen haben Wände, Boden und Decke (`CAVE_WALL` 0,6 m) um
  einen freien Raum, der als Tunnel zählt; Flächen, Wasser, Wasserfall, Portal sind kein Fels. Pinsel: `BrushOptions.rock`
  liefert je Linienpunkt die verbotenen Tiefen (`spans`, der Punkt wird mit dem Strahl der Kamera in der Tiefe jeder Wand
  gedeutet); `solveDepth` bildet daraus Läufe und wählt je Lauf nach der ersten Lösung die Seite (vor oder hinter der Wand;
  geht die eine wegen Boden, Bühne oder Station nicht, die andere), als zusätzliche Schranken `rockUp`/`rockLo`, die
  dieselben Federn halten wie Boden und Bühne. Geht keine Seite, ist der Punkt blockiert: die Vorschau zeigt rote Marken
  (`BrushPreview.rock`, Hinweis `rock.blocked`), beim Loslassen schneidet `planBrushTrack` die Linie vor dem ersten Lauf ab
  und plant neu (`rockCut`, Hinweis `rock.cut`). Stützen: `planWorldSupports` setzt keinen Fuß, wo `solid` gilt
  (`WorldView.rock`). Fahrt: `TrainSimOptions.insideRock` zählt Tunnel-Meter im Innenraum und in Höhlenräumen wie im
  Berg. Welt: `ghostTrack` zeichnet den Bahnkörper noch einmal mit umgekehrtem Tiefentest (`GreaterDepth`, Deckung 0,28),
  also nur dort, wo Fels oder Kulisse ihn verdecken, ein Zeichenaufruf. Der Editor baut das Feld bei jeder Änderung neu
  (`refreshRock`). Gelernt: Eine Scheibe, die bis auf das Fenster ganz fest ist, macht das Fenster für den Pinsel wertlos
  (links und rechts davon ist Fels, die Bahn wird um den Berg geschoben); erst Rückwand und Lippe als Wände mit freiem
  Innenraum geben das Tunnel-Gefühl der Level und von Florians Fenster-Element. Tests in `tests/rock.test.ts` (Feld, Spannen,
  Ausweichen, Blockade mit Abschneiden, Tunnel-Meter), Szenario 10 prüft das Feld der Prüfzone. Platzhalter: Bänder statt
  gemalter Wandstärke, runde Öffnungen, offene Flanken, Kästen; der Hinweis ist ein Toast.

*Baustellen, Tasten des Klötzchen-Editors:*

Editor: Plus und Minus ändern den Öffnungsradius, die
Statuszeile nennt das Ziel-Element.

*Untergrund, Pinsel über offenen Räumen (abgelöst durch das Freiraumfeld):*

Der Pinsel sieht über einem
offenen Raum den Raumboden als Boden (`LevelScene.groundAt`, `roomAt`) und darf hinab; weil „unten auf dem Bild“ für
den Pinsel sonst „vorn“ hieße (und am Bühnenrand der Boden zu ist), hält `BrushOptions.underground` (`roomLanes`) einen
unter der Oberfläche gezeichneten Punkt über einem Raum in dessen Spuren, Wunschtiefe in der Raummitte; im Festigkeitsfeld hat ein Raum
Wände und Boden, aber keine Decke mehr (der Deckel ist weg), der Raum zählt als Tunnel.

*Untergrund, Tasten des Klötzchen-Editors:*

Editor: L wechselt den Look der Stufe des Felds, O am
Raum die Öffnungsstufe; das Feld meldet nach Regel 2.3 „Untergrund gedeckelt“, wenn es unter den Boden reicht und zur
Stufe kein Raum offen ist.

*Glättung der Tiefenwahl an Wänden und Räumen (abgelöst):*

- **Glättung der Tiefenwahl an Wänden und Räumen** (Fix zu Tor 2b, 25.10.; `src/track/brushTrack.ts`, `src/zone/rock.ts`,
  `src/zone/underground.ts`). Florians erster Test an Tor 2b: unschöne, springende Bahnen in Räumen und an Berg und Tunnel.
  Befund: Die Seitenwahl am Fels fiel je Lauf von Linienpunkten und je Wand (Lippe und Rückwand getrennt) und in jeder
  Vorschau neu, also kippte sie von Vorschau zu Vorschau und beim Loslassen; die Schranken setzten ohne Anlauf hart an der
  Wand ein. Über einem offenen Raum war der Raumboden auch für eine Bahn über der Oberfläche der Boden (die Wunschtiefe zog
  eine Brücke über das Loch bis 3 Spuren nach hinten), die zulässigen Spuren im Raum wanderten mit der Bildhöhe (Wunsch in
  der Mitte des zulässigen Bereichs, der nahe der Decke auf die hinterste Spur schrumpfte), und der Boden des Höhlenkastens
  sperrte einen Strich entlang des Raumbodens. Jetzt: (1) Spannen tragen Element und Wand (`RockSpan.id`, `kind`); Läufe
  desselben Elements, die höchstens `ROCK_RAMP` (8) Punkte auseinanderliegen, bilden eine Passage (ein Vorbeikommen am
  Element), und je Passage gilt eine Seite (`RockSide`: davor, zwischen Lippe und Rückwand, dahinter), nach der Lage der
  ersten Lösung. (2) Die Seite bleibt über Vorschauen, Loslassen und Nachbessern (`BrushPreview.rockSides` →
  `BrushOptions.rockSides` → `BrushPlan.rockSides`; Schlüssel Element@Anfang der Passage, bis 3 Punkte Versatz); geht sie
  nicht mehr, die nächste, sonst blockiert. Die Seitenwahl misst an den harten Schranken (Bühne, Raum; `hardLow`), nicht am
  Hebel „nach hinten legen“ der Probefahrten: Der Fels schlägt den Hebel (vorher sperrte der Hebel die Seite, und eine
  Passage, die frei war, wurde rot). (3) Wunschtiefe `ROCK_GAP` (0,15 Spuren) vor der Wand bzw. in der Korridormitte, mit
  Anlauf über `ROCK_RAMP` Punkte davor und danach (smoothstep). (4) Räume: `roomLanes` liefert für jeden Punkt über der
  Grundfläche einen `RoomHit` (Spuren, Raummitte, Höhe h des Strahls auf der Raummitte über der Oberfläche, Raumboden,
  Oberfläche); der Raum ist bis zur Oberfläche offen (`ROOM_DIVE` 0,3 m; die Decke zählt nicht mehr, der Deckel ist weg).
  Tauchfahrt (h < −0,3 m): Tiefe in den Spuren des Raums zwischen Raumboden + 1 m und Oberfläche, Wunsch die Raummitte
  (unter dem Raumboden gemalt: alle Spuren, die Höhe hebt der Boden an), `ROOM_MARGIN` 0,15 Spuren Abstand zu den Wänden,
  und die Raummitte zieht mit `ROOM_PULL` (2, zusätzlich zum Höhengewicht), sonst bliebe eine Bahn, die von hinten kommt, an
  der Rückwand hängen. Brücke (h ≥ −0,3 m, Bahn in den Spuren des Raums):
  Boden ist der Raumboden (weite Schranke), die Wunschtiefe die der Oberfläche, und je näher der Strich der Oberfläche
  kommt, desto mehr zieht sie auf die Raummitte; davor und danach der Anlauf. Für den Pinsel sind beim Höhlenkasten nur die
  Seitenwände Fels (`caveSide`), den Boden hält die Boden-Funktion; `solid` (Fahrt, Stützen) kennt Boden und Wände weiter.
  Messung (`npm run strokes:replay -- --zone probe recordings/strokes.jsonl` auf 71 Aufnahmen aus dem Worktree, 53 davon
  mit Fels- oder Raumberührung; `--stage N` erzwingt eine Fortschrittsstufe, `TC_DEBUG_ROCK=1` druckt blockierte Läufe und
  Seiten): Tiefensprünge je berührendem Strich 10,7 statt 12,2, Vorschau-Sprünge 85,3 statt 95,2, Sprung beim Loslassen im
  Median 1,09 statt 1,14 Spuren, blockierte Läufe 0 statt 6, größte Tiefenänderung je Meter unverändert höchstens 1,57
  Spuren; ohne Zonenregeln 11,2 / 73,3 / 0,87 (die Aufnahmen entstanden ohne Zone, die Berührungen sind Zufall; mit Stufe
  2 und offenem Raum dieselben Zahlen, kaum eine Aufnahme taucht). Tests in `tests/rock.test.ts` (Seite bleibt über
  Vorschauen und beim Loslassen, Hebel gegen Fels) und `tests/underground.test.ts` (Brücke, Tauchfahrt mit Wellen,
  Raumboden). Platzhalter weiter: Abtauchen ohne Schacht, rechteckige Löcher. **Abgelöst** durch das Freiraumfeld (unten).

*Durchfahrt durch Fenster (Magnet) und Vorschau ohne Wackeln (abgelöst bis auf die Vorschau):*

- **Durchfahrt durch Fenster (Magnet) und Vorschau ohne Wackeln** (Tor 2b, zweiter Test, 25.10.; Florians Leitsätze in
  Plan Paket 5). Fenster: Trifft der Strahl der Lippe eine Öffnung, liefert `RockField.spans` eine Spanne `kind: 'window'`
  (Tiefe der Lippe, ohne Breite, keine Wand). Trifft eine Passage ein Fenster und liegt der Strich nicht ohnehin im
  Korridor, ist die Durchfahrt die erste Wahl (`RockSide` `in`: davor vor der Lippe, danach im Korridor; `out`
  umgekehrt, wenn die Passage an einem festen Punkt hinter der Lippe beginnt, etwa nach einer Freilegung): Schranken an
  der Lippe vor dem Fenster auf der einen, danach auf der anderen Seite, Rückwand bleibt Schranke, die Wunschtiefe
  wechselt in einem langen S um das Fenster (`THROUGH_RAMP` 14 Punkte davor und danach; ein kurzer Wechsel bog in der
  Fahrt zu eng). Beim Malen wächst der Strich ins Fenster hinein, wenn die Passage schon „davor“ gezeigt wird: dann wird
  aus „davor“ die Durchfahrt (was gezeigt war, bleibt vor der Lippe; der Korridor dahinter ist neu); das Fenster zählt
  auch an festen Punkten, sonst verlöre die Passage es, sobald es hinter dem freien Teil liegt, und fiele beim Loslassen
  auf den Korridor zurück. Die natürliche Seite ist, liegt die erste Lösung in einer Wand, die nähere Seite dieser Wand
  (vorher der Korridor, sobald sie irgendwo zwischen Lippenfront und Rückwand lag). So zieht ein Eingang den Strich wie
  ein Magnet hindurch; wer das Fenster nicht trifft, fährt wie bisher davor, im Korridor oder dahinter. Vorschau: Im freien Teil
  (die letzten `PREVIEW_FREE` 45 m) hängt die gezeigte Bahn weich an der Tiefe der letzten Vorschau (`hold`/`holdW`,
  Gewicht `PREVIEW_HOLD` 20 mit weichem Anstieg ab `PREVIEW_TIP` 15 m vor dem Finger bis zum festen Teil); nur die Spitze
  wählt frei, Schranken bleiben hart. Gemessen (Replay `--zone probe`, 71 Aufnahmen, 53 mit Berührung): Vorschau-Sprünge
  an gezeigten Punkten 41,5 je Strich statt 85,8, ohne Zonenregeln 33,0 statt 73,3; Tiefensprünge der fertigen Bahn 11,4
  statt 10,6 (die Durchfahrt wechselt die Seite), Loslassen 1,07 statt 0,99 Spuren; Fahrten geschafft 30 statt 28 von 71
  (Aufnahmen ohne Zone, die Berührungen sind Zufall). Varianten, nur mit dem Haltegewicht gemessen: fest ab 25 m statt
  45 m: Vorschau-Sprünge 15,8, aber fertige Bahn 12,3 Sprünge und Loslassen 1,15 (die alte Bahn kann an Kreuzungen nicht
  mehr nachgeben); Spitze 20 m mit halbem Gewicht: 61,6 / 10,1 / 0,87. Die verbleibenden Sprünge kommen von Kreuzungen
  und Engstellen, an denen der frühere Strang nachgibt; dagegen hilft erst die Spitze aus dem Vorschlag „Freiraumfeld“
  (Plan Paket 5). Tests in `tests/rock.test.ts` (Durchfahrt am Stück und beim Malen, Strich im Korridor bleibt dort).
  **Abgelöst** durch das Freiraumfeld (unten); die Vorschau ohne Wackeln bleibt.

*Freiraumfeld, Spitze, Messung:*

Gemessen (inzwischen 119 Aufnahmen, 94 mit Berührung): Sprung beim Loslassen
im Median 0,77 statt 1,17 Spuren, ohne Zonenregeln 0,41 statt 0,94; Tiefensprünge und Vorschau-Sprünge unverändert (12,5
und 51,8 je berührendem Strich; ohne Zonenregeln 11,3 und 43,4).

*Freiraumfeld, freies Gelände, Messung:*

Gemessen an 159 Aufnahmen: Loslassen im Median 0,46 Spuren mit und 0,40 ohne Zonenregeln (vorher 0,77 und 0,41),
Vorschau-Sprünge 55,1 und 48,2, nichts blockiert oder abgeschnitten.

*Freiraumfeld, Pinsel auf dem Feld, Gelernt und Messung:*

Gelernt: (1) Eine Kette am Stück meidet Sackgassen (ein Innenraum mit nur einem Fenster), beim Malen führt die
gezeigte Tiefe hinein; darum sind die Flanken offen geblieben und die Prüfzone hat ein zweites Fenster als Ausfahrt;
feste Flanken kommen mit den gemalten Teilen (8a). (2) Die harte Schranke muss berührende Abschnitte zusammenfassen,
sonst springt die Bahn am Rand einer Öffnung um die Wanddicke. (3) Erde knapp unter der Oberfläche muss frei bleiben
(angehoben), sonst reißt die Kette vor jedem Loch und am vordersten Bühnenrand (Striche auf Bildhöhe −10 waren
abgeschnitten). (4) Die Mitte einer Höhle ist die ihres Abschnitts, nicht des verschmolzenen Freiraums (an einem
Fenster zog die Mitte sonst nach vorn hinaus). Messung (Replay `--zone probe`, inzwischen 98 Aufnahmen von Florian,
76 mit Berührung): Tiefensprünge je berührendem Strich 11,3, Vorschau-Sprünge 51,0, Loslassen 1,17 Spuren, blockiert
0, abgeschnitten 0; dieselben
Aufnahmen ohne Zonenregeln 11,2 / 40,1 / 0,94 (die Aufnahmen entstanden ohne Zone); Replay `--world` unverändert (475
Profile, Median 2,0 px; die Levels laufen ohne Feld). Browser: Strich an der Lippe läuft durch den Innenraum, Tauchfahrt
in den Raum (Bahn in der Mitte des Innenraums bzw. des Raums), beide ohne Sprung an gezeigten Punkten und mit höchstens
0,06 Spuren je Meter.

## 5. Physik

*Rendering, Schräglage der Schienen, Messung:*

Auf 151 Aufnahmen drehen sich die Schienen 71 % weniger (134 statt 455° je 100 m), schnelle Seitenwechsel (über ±45° in unter 20 m) gibt es nicht mehr (vorher 423).

*Rendering, Wagen auf den Schienen, Stand vorher:*

(die vorher auch die Darstellung bestimmte und an jedem Haken bis über 2000°/s zuckte)

## 5b. Shader und Effekte

*Budget mit den Spur-Filtern (entfernt seit Etappe 1):*

- Budget: fünf Spur-Filter in voller Auflösung ≈ 5 Vollbild-Durchgänge (Spuren sind teils leer, die Filterfläche folgt den Bounds) plus fünf Blur-Ebenen in halber Auflösung; Messung auf dem Handy über das Overlay.
