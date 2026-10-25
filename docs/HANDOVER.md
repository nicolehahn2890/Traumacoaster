# Übergabe – Trauma Coaster (Stand 25.10.2026)

Für die nächste Session (Florian oder wer auch immer weitermacht): Was fertig ist, was offen ist, wie du
weiterarbeitest und welche Regeln gelten. Das Spielkonzept steht in `docs/GDD.md`, die Technik in
`docs/TECH.md`, der Stil in `docs/ART.md`, der Plan mit allen Paketen und dem Umsetzungsstand in `docs/PLAN.md`.

## 1. Wo wir stehen

- **25.10., Etappe 2 begonnen** (Branch `etappe-2-bahn-und-welt` von `main`; die zwölf Arbeitsschritte mit drei Toren stehen in
  `docs/GROSSER-PLAN.md`, Paket 10, von Florian bestätigt). Technik in `docs/TECH.md` 4h.
  Schritt 1 gebaut: Fähigkeiten als Schalter und Aufwertungen als Daten (`src/zone/abilities.ts`): Tabelle Stufe → Schalter
  (mit Gurt, Kettenzugstärke, Wagenvariante) in der Zonendatei, ein Feld wählt die Stufe und überschreibt einzelne Schalter,
  dazu Streckenbudget und Höhenlimit; Regal, Startarten, Rolle, Tunnel, Gurt, Budget und Höhenlimit folgen dem Feld, in der
  Zone wird kein Strich mehr zum Berg (Plan 7.5). Editor: U Stufe, Shift+U Stufe der Zone bearbeiten, S Schalter des Felds.
  Prüfzone mit drei Stufen, Szenario 10 prüft die Schalter im Spiel (zwölf Prüfungen grün, 132 Zeichenaufrufe). Replay `--world`
  nach Schritt 1: 472 Bahnprofile, keine ungültigen Werte, 13373 Stützen (69 Stellen ohne Fundament, Aufnahmen über Wasser),
  Abstand Bahn–Strich im Median 2,0 px, kein Fehler. System: Datenmodell, Schalter-Logik. Platzhalter:
  Vorbelegung der fünf Stufen, Texteingabe im Browser-Dialog, Wagenvariante als Wort. Eigenheiten im Worktree: Die
  Aufnahmen liegen nur im Haupt-Checkout (Pfad an das Replay geben); Szenarien mit `TC_URL` gegen den eigenen Server
  starten, sonst nimmt das Skript einen fremden Server auf Port 4173.
  Schritt 2 gebaut: Startarten sichtbar als Platzhalter in den Maßen der Physik (`src/world/startElements.ts`): Kette mit
  Zahnrädern bis zum Kettenende der Fahrt (`liftRange` aus der Physik), Launch-Band mit Lichtern auf 26 m, Hydro-Band
  mit Dampf-Marke, Pendel-Puffer beidseits des Vorgabestücks, Vertikallift-Turm am Kettenende; in der Zone ein großer
  Startart-Knopf am Hebel des Häuschens (Tipp wechselt durch die erlaubten Startarten, Name als Sticker). System: Bau aus
  den Rahmen der Bahn, Kettenende aus der Physik, Knopf am Anker. Platzhalter: alle Formen und Farben, Kettenlage je Typ.
  Zeichenaufrufe in der Prüfzone mit Anstieg 131 bis 134.
  Schritt 3 gebaut: Kettenzugstärke in der Fahrt (die Kette endet in der erlaubten Höhe über der Station; rollt der Zug am
  ersten Anstieg zurück, heißt es „Die Kette reicht nicht bis zum Gipfel“, die Schwachstellen-Probefahrt meldet es als
  Hinweis), gestrichelte Kettenzuglinie mit Beschriftung im Zeichenmodus, Wagenvariante der Stufe als Farbe der
  Klötzchen-Wagen. Die Probefahrten des Pinsels kennen die Grenze absichtlich nicht (sie würden sonst den Hügel verformen).
  System: Grenze in der Physik, Fehlgrund, Linie. Platzhalter: Strichstil, Farbwörter, Wagen. Replay `--world` nach
  Schritt 2 und 3: 475 Bahnprofile, keine ungültigen Werte, 13460 Stützen, Median 2,0 px, kein Fehler (das Replay fährt ohne
  Kettenzugstärke, wie die Level). Szenario 10 nach Schritt 3: 14 Prüfungen grün.
  Schritt 3b gebaut (Florians Entscheidung auf die Zwischenfrage, welche Startarten echt sind): Der Vertikallift ist ein
  Aufzug am Ende des Vorgabestücks (Viertelkreis, senkrecht bis zur Hubhöhe der Stufe, oben beginnt der Strich; die Fahrt
  hebt den Zug hoch und lässt ihn oben los), in der Welt ein Gerüst mit Maschinenhaus; der Knopf bietet ihn nur bei leerer
  Bahn. Zielarten „Aufzug-Start“ und „Pendel-Start“ sind im Katalog; das echte Pendeln (dreimal durch die Station) kommt in
  E3. System: Vorgabestück mit Aufzug, Liftende in der Fahrt, Zielarten. Platzhalter: Gerüst, Maschinenhaus, Fahrkorb ohne
  Bewegung. Replay `--world` nach Schritt 3b unverändert grün (475 Profile, Median 2,0 px), Szenario 10 grün (14 Prüfungen),
  im Browser fährt der Zug den Aufzug mit 20 km/h hoch und rollt oben weiter. Hinweis fürs Leveldesign: Die Hubhöhe zählt
  als Bahnhöhe, ein Ziel „Höhe ≥ 12 m“ ist mit einem 15-m-Aufzug schon erfüllt.
  **Tor 2a bestanden (25.10.):** Startart-Platzhalter und Aufzug reichen bis zur Stilprobe, Knopf am Hebel verständlich,
  Kettenregel passt, Handy flüssig. Weiter mit Schritt 5 (Fels-Regeln).
  Schritt 5 gebaut: Fels-Regeln (`src/zone/rock.ts`, TECH.md 4h). Dreiteiler: Lippe (mit Fenstern) und Rückwand fest, der
  Innenraum frei und Tunnel, Flanken offen wie bei den Bergen der Level; Säulen fest; Höhlenkästen mit festen Wänden um
  einen freien Raum. Der Pinsel bleibt vor oder hinter einer Wand (oder im Innenraum); geht keine Seite, zeigt die Vorschau
  rote Marken mit Hinweis „Fels“, und beim Loslassen endet die Bahn davor. Keine Stützenfüße im Fels, Tunnel-Meter in
  Innenraum und Höhle, Bahn hinter Fels gedimmt sichtbar. System: Festigkeitsfeld, Schranken im Löser, Abschneiden,
  Ghost-Durchgang. Platzhalter: Wandbänder, runde Öffnungen, offene Flanken, Kästen, Hinweis als Toast. Tests 257 grün,
  Replay `--world` unverändert (475 Profile, Median 2,0 px; die Aufnahmen laufen ohne Zone), Szenario 10 mit 15 Prüfungen
  grün (134 Zeichenaufrufe).
  Schritt 6 gebaut: Baustellen (`src/zone/sites.ts`, TECH.md 4h). Verbinden: Das Strichende rastet am Anschlusspunkt ein,
  die Freilegung läuft (Ping, Kamera heraus, Lippe löst sich mit Brandkante auf, Staub), danach hat die Lippe dort eine
  Öffnung und das Bahnende rutscht in den Innenraum. Durchbruch: Wand quer zur Bahn, in der Fahrt zersplittert sie bei
  Mindesttempo (Splitter, Sticker), sonst hält sie und die Fahrt endet. Prüfzone mit beiden Varianten. System: Fang,
  Öffnung im Feld, Wand in der Fahrt. Platzhalter: Ping, Staub, Splitter, Dauer, Kreisöffnung. Tests 261 grün, Replay
  unverändert grün, Szenario 10 mit 16 Prüfungen grün (135 Zeichenaufrufe; höhere Werte traten nur direkt nach
  Code-Änderungen während des Neuladens auf).
  Schritt 7 gebaut: Untergrund und Looks (`src/zone/underground.ts`, TECH.md 4h). Räume (Höhlenkästen) sind „offen ab
  Stufe“: davor unsichtbar und gedeckelt, ab der Stufe mit Loch im Boden und Fenster im Erdschnitt, der Pinsel darf
  hinab, eine Verbinden-Baustelle über dem Raum nimmt den Deckel (Freilegung auf dem Boden, Bahnende taucht ab). Looks je
  Stufe aus der Zonendatei (Tag, Abend, Nacht, Neon), der Himmel folgt mit Tag oder Nacht. Editor: L Look, O am Raum
  Öffnungsstufe, Hinweis nach Regel 2.3. System: Öffnungsstufe, Löcher und Fenster, Boden-Funktion, Look-Tabelle.
  Platzhalter: rechteckige Löcher, Abtauchen als Knick, Himmel nur Tag oder Nacht, Lichtschächte und Nebel fehlen.
  Gelernt: Ein nach unten gezeichneter Strich hieße für den Pinsel „nach vorn“; darum hält der Löser einen Punkt unter
  der Oberfläche über einem offenen Raum in dessen Spuren (sonst landete die Bahn am Bühnenrand statt im Raum). Tests 267
  grün, Build grün, Replay `--world` unverändert grün (475 Profile, Median 2,0 px), Szenario 10 mit 17 Prüfungen grün
  (135 Zeichenaufrufe).
  Tor 2b, erster Test (25.10.): Florian fand die Bahn in Räumen und an Berg und Tunnel unschön und springend. Fix gebaut
  (25.10., TECH.md 4h „Glättung der Tiefenwahl“): eine Seite je Passage am Fels, die über Vorschauen, Loslassen und
  Nachbessern bleibt; Anlauf 8 m vor und nach Wänden und Räumen; Räume bis zur Oberfläche offen, Brücke über das Loch oder
  Tauchfahrt auf der Raummitte; nur die Seitenwände des Raums sind Fels für den Pinsel; der Fels schlägt die Hebel der
  Probefahrten. System: Passagen, Seitengedächtnis, Anlauf, Raum-Treffer. Platzhalter: Abtauchen ohne Schacht,
  rechteckige Löcher. Messung an 71 Aufnahmen (Replay `--zone probe`): Tiefensprünge je berührendem Strich 10,7 statt
  12,2, Vorschau-Sprünge 85,3 statt 95,2, Loslassen 1,09 statt 1,14 Spuren, blockierte Läufe 0 statt 6. Tests 272 grün,
  Build grün, Replay `--world` unverändert (475 Profile, Median 2,0 px); Browser: der Strich durch den Berg läuft glatt
  (0,03 Spuren je Meter), die Tauchfahrt in den Raum ohne Knick am Lochrand.
  Tor 2b, zweiter Test (25.10.): nicht bestanden. Florian: etwas besser, aber nahe Stein und im „Erdgeschoss“ weiter
  sehr unschön, die Bahn wackelt beim Strichziehen, in der Grube keine schöne Form, das Fenster im Fels trifft er kaum
  noch, den Raum (ausgestanztes Quadrat) versteht er nicht; seine Leitsätze (keine hundert Sonderregeln, jedes Element
  trägt Stützen auch organisch, Kurve glatt um alles geleitet ohne Wackeln und Knicke, Öffnungen als Magnet mit glatt
  verbundenem Finger, Boden aus Ebenen, Pfeiler/Boden/Höhlen/Kollisionskörper ungeklärt) stehen im Plan, Paket 5.
  Sofort gebaut (25.10., TECH.md 4h): Durchfahrt durch Fenster als Seite der Passage (Magnet) und Vorschau ohne Wackeln
  (die gezeigte Bahn klebt, nur die Spitze wählt frei): Vorschau-Sprünge 41,5 statt 85,8 je Strich (ohne Zone 33,0
  statt 73,3), fertige Bahn 11,4 statt 10,6 Sprünge, Fahrten 30 statt 28 von 71. Tests 273 grün, Build grün, Szenario 10
  grün. System: Fenster-Spanne, Durchfahrt, Haltegewicht.
  Platzhalter: alles Bisherige. Vorschlag der Session im Plan (Paket 5): ein Freiraumfeld statt Sonderregeln (Pinsel,
  Spitze, Stützen, Fahrt, Ebenen-Boden). Beide Dev-Server laufen aus dem Worktree: 5174 mit Aufnahme (Handy, LAN), 5178
  ohne Aufnahme (eigene Prüfungen).
  Florian hat das Freiraumfeld bestätigt (25.10.). Schritt 1 und 2 davon gebaut (25.10., TECH.md 4h „Freiraumfeld“):
  `src/zone/field.ts` als ein Feld „fest oder frei“ (Erde, offene Räume, Dreiteiler mit Dach und Fenstern, Säulen,
  Kästen) mit den Abfragen fest, Höhle, freie Abschnitte am Strahl, tragende Fläche, Decke; der Pinsel liest in Zonen nur
  noch dieses Feld (Kette der freien Abschnitte über den Strich, Magnet für Höhlen in Reichweite, weiche Ein- und
  Ausfahrt, Anlauf); Lippen-/Rückwandbänder, Passagen, Durchfahrt und Raum-Treffer sind weg. System: Feld, Kette,
  Schranken aus berührenden Abschnitten, Höhlenmitte als Wunsch. Platzhalter: Flanken der Dreiteiler offen (feste Flanken
  mit 8a), rechteckige Räume, Stützen und Fahrt lesen noch das alte Festigkeitsfeld. Prüfzone: e1 hat ein zweites Fenster
  (Ausfahrt). Messung an 98 Aufnahmen (Replay `--zone probe`): Tiefensprünge je berührendem Strich 11,3, Vorschau-Sprünge
  51,0, Loslassen 1,17 Spuren, nichts blockiert oder abgeschnitten; ohne Zonenregeln 11,2 / 40,1 / 0,94. Tests 279 grün,
  Build grün, Replay `--world` unverändert, Szenario 10 grün. Browser: Berg und Raum ohne Sprung und ohne Knick. Als
  Nächstes: Spitze (fertige Bahn bleibt), Stützen und Fahrt auf das Feld, Ebenen-Boden und Räume im Editor, dann Tor 2b.
- **24.10., Etappe 1 begonnen** (Branch `etappe-1-weltrenderer`, Arbeitsschritte in `docs/GROSSER-PLAN.md`, Paket 10).
  Schritt 1 gebaut: Weltrenderer hinter `?world=1` (Three-Szene im selben WebGL-Kontext, Pixi zeichnet davor den Himmel und
  darüber Bühne, Overlay und HUD), Kamera-Adapter (18°, Kamerafahrt, senkrechte Streckung; die Perspektive im Spiel ist seitdem
  die exakte geneigte Kamera, auch für den Pinsel), Boden als Höhenfeld und geschlossener Erdschnitt aus dem Terrain,
  100-Punkte-Test (`tests/world.test.ts`). Technik in `docs/TECH.md` 4e und 4f, Gelerntes im Plan unter Paket 1. Replay:
  261 Aufnahmen, Pinsel in Perspektive 87 von 250 Fahrten geschafft (vorher 88, ohne Perspektive 90), kein Fehler.
  Schritt 2 gebaut: Bahnprofile Straße und Stahl als Meshes aus dem Bahnmodell (gleiche Schräglage wie die Bühne, Schwellen
  und Streben als Instanzen, `?track=` zum Vergleich), Wagen-Platzhalter als 3D-Körper mit Sitzen (eine Geometrie je
  Wagen), Licht aus dem Labor, Replay `npm run strokes:replay -- --world` (Profil je Bahn gebaut und geprüft, Abstand
  Bahn–Strich im Bild der Weltkamera): 250 Bahnprofile gebaut, keine ungültigen Werte, Abstand Bahn–Strich im Median 2,3 px.
  Schritt 3 gebaut: Holz und Hängebahn als Profile (die Gondel hängt am Balken 2,4 m über der Bahnlinie), vier
  Stützenfamilien aus dem Labor als Instanzen (höchstens fünf Zeichenaufrufe je Familie, Holzbahn 96 statt 469 im Labor),
  Füße über Fundamentflächen (`src/world/foundations.ts`: Terrain; Kulissen später über Metadaten). Replay `--world` mit
  Stützen: 250 Bahnprofile, 7410 Stützen geplant und gebaut, keine Stelle ohne Fundament (die Aufnahmen liegen auf flachen Leveln), keine ungültigen Werte; Abstand Bahn–Strich bei 191 neuen Strichen im Median 2,0 px.
  Schritt 4 gebaut: Kulissen-Platzhalter mit Tiefenpuffer (Fläche, Dreiteiler, Säule, Höhlenkasten, Wasser, Wasserfall,
  Portal; Berge der Level sind Dreiteiler mit Tunnelöffnungen, Seen Wasserflächen), Licht mit Shadow Map und
  Schattenfänger, Nebel, vier Looks aus dem Labor (`?look=`), Umfärbe-Shader auf allen Flächen; Lesarten-Knopf und
  Spur-Filter sind weg (Pinsel ist die Lesart, `?stage|single|lanes` nur für Szenarien und Replay). Replay: unverändert grün (250 Profile, 7410 Stützen, Abstand Bahn–Strich im Median 2,0 px, kein Fehler).
  Tor 1a, erste Runde (25.10.): Florian hat alle Links auf dem Handy gesehen (3D und Schatten besser). Fixes: Hängebahn
  mit dem Balken auf dem Strich und der Gondel darunter (Regel: der Strich ist immer genau dort, wo gezeichnet wird),
  Berge ohne feste Spur als gestaffelte Scheiben je Spur statt als ein tiefer Klotz, dunkle Tunnelmünder. **Tor 1a
  bestanden (25.10.):** Leistung reicht, Kantenglättung bleibt an, Berge als Platzhalter eingeordnet.
  Schritt 6 gebaut (25.10.): Zonendatei `public/zones/basiszone/zone.json` (Version 1: Name, Breite, Bahntyp, Elemente
  nach Plan 8a.1), Klötzchen-Editor am Mac unter `?zone=basiszone&editor=1` (Palette, Setzen, Ziehen, Tiefe, Maße, Löschen,
  Bahntyp, Speichern über den Dev-Server, Hot-Reload bei jeder Dateiänderung, Tab zum Spielen), TECH.md 4g. Replay `--world`: 322 Aufnahmen, 9185 Stützen, Median 2,0 px, kein Fehler.
  Schritt 7 gebaut (25.10.): Metadaten je Element in Datei und Editor (Fundament M, Öffnung O, Anker A, Wachstumsstufe G,
  Tiefenrolle R), Felder aufziehen (Werkzeug „Feld“, Enter schaltet aktiv) mit weicher Kamerabegrenzung, Zoom-Grenze „Feld
  passt ins Bild“ und Absperrband an den Rändern; ohne Editor wählt `?field=` das Feld. Replay `--world`: 343 Aufnahmen, 9579 Stützen, Median 2,0 px, kein Fehler.
  Schritt 8 gebaut (25.10.): Stationsanker mit Richtung und Vorgabestück (im Spiel beginnt die Bahn dort, Löschen stellt
  das Stück wieder her), Häuschen- und Hebel-Platzhalter, Schlangenbereich mit Figuren und Freiraum, Baustellen-Marke
  (Verbinden, Durchbruch), Coin-Gruppen (Reihe, Bogen, Ring, Säule) als Coins der Bühne; alle als verschmolzene
  Platzhalter. Replay `--world`: 364 Aufnahmen, 10162 Stützen, Median 2,0 px, kein Fehler.
  Schritt 9 gebaut (25.10.): Ziele je Feld (Katalog v1 = die Zieltypen des heutigen Prüfers, als Zeile „finish, height 20,
  *coins 5“ über die Taste Z), Fortschrittsstufe (G: Elemente späterer Wachstumsstufen fehlen) und Aufwertung (U: heute
  die Gurtstufe) je Feld; im aktiven Feld wertet die Zielleiste live wie im Level und die Ergebnistafel zeigt Sterne;
  Knopf „Testfahrt“ im Editor; Prüfzone `public/zones/probe/zone.json` mit Determinismus-Test und Szenario 10 (Standbild
  `screenshots/scenario-10-zone.png`, CI-Matrix 1 bis 10). Platzhalter: Zieleingabe als Textzeile im Browser-Dialog;
  Rätselziele, Magnet-Coins, Fangen und die Fähigkeiten als Schalter kommen in E2 und E3. Replay `--world`: 382 Aufnahmen, 10695 Stützen, Median 2,0 px, kein Fehler.
  Als Nächstes Schritt 10, Tor 1b: Florian baut selbst einen Testausschnitt (Station, Hügel, Fenster-Element, Baustelle),
  das Handy zeigt dasselbe, dann Fixes, Doku und der Pull Request nach `main`.
  Tor 1b, erste Rückmeldung (25.10.): Öffnung verschieben (Alt+Pfeile, Plus und Minus für den Radius) und Dicke des
  Volumens (Shift+Pfeile links/rechts) fehlten im Editor und sind nachgerüstet. Florians Fragen zu Tunneln an Seite und
  Front, organischem Boden und Höhlen mit Lagen sind mit Antwort in Paket 8a notiert. Florians Korrektur dazu: Ob ein
  gemaltes Teil oder ein 3D-Teil mit gemalter, per Shader umgefärbter Textur (Meshy) besser aussieht, bleibt offen und wird
  an der Stilprobe je Stelle getestet (Richtlinie 0, 3 und 9; Plan Paket 0 und 8a).
  Achtung: Jede Code-Änderung lädt die Editor-Seite am Mac neu; ungesicherte Einträge gehen verloren, gespeicherte Zonen
  kommen per Hot-Reload zurück.
  **Tor 1b bestanden (25.10.):** Florian hat den Testausschnitt selbst gebaut, das Handy zeigt dasselbe. Etappe 1 ist
  damit abgeschlossen; der Pull Request nach `main` steht in Abschnitt 3.
  Links für den Handy-Test: Dev-Server mit `npm run dev` (zeichnet auf), Adresse aus dem
  Vite-Log plus `?scene=start&level=8&world=1&dev=1` und `&track=`, `&aa=0`, `&shadow=0`, `&look=`, Level 32 (Tunnel),
  Level 47 (See).
- **24.10., spät: der große Plan steht.** `docs/GROSSER-PLAN.md` ist Paket für Paket mit Florian abgestimmt und in
  allen Paketen bestätigt: Ziel sind Look und Werkzeuge, nicht fertige Level. Es entsteht eine **Basiszone** als
  Werkstatt mit allen Fähigkeiten (vier Bahntypen, alle Startarten und Aufwertungen, alle Elementtypen) zuerst als
  Platzhalter, ein **Editor im Spiel** (Florian bedient ihn am Mac), ein Zielarten-Katalog mit Physikrätseln,
  Sprungschanze, Fangen und Bild im Bild, Figuren nach den Visuals mit Schlange und Freiraum, Untergrund mit festem
  Fels und Baustellen in zwei Varianten, Look ohne Konturen mit Stilprobe als Tor, UI im Baustellen-Brutalismus
  (UI-Werkstatt mit drei Varianten), ein Rad für alle Zonen mit Morph in zwei Schritten, Asset-Pipeline mit
  automatischer Prüfung und eigenen Teilen je Zone, Vorschlag-Generator und Prüfer, der **Mystische
  Neon-Freizeitpark** als zweite Zone ohne neuen Engine-Code. Acht Etappen mit Toren (Handy 60 fps, Replay grün,
  Standbilder, Florians Freigabe), Etappe 1 als Arbeitsschritte in Reihenfolge ohne Kalender (Abschnitt 3). Der alte
  Plan `docs/PLAN.md` trägt den Archivhinweis. Die Commits der Plan-Session sind auf `main` gepusht.
- **24.10.: Richtlinie und Tiefen-Labor.** Florians Klarstellungen und Fragen stehen in
  `docs/research/2026-10-24-klarstellungen-und-fragen.md`, die Antwort mit Messungen und Entscheidung in
  `docs/RICHTLINIE.md` (Kurzfassung: Weltrenderer zu Three.js mit geneigter Perspektivkamera, Pixi bleibt fürs HUD;
  Tiefenpuffer statt Masken; eine Shadow Map; Umfärben per Shader; Untergrund als Baustelle + Freilegung; größere
  Zeichenwerkzeuge auf dem Handy). Das Labor `public/labs/tiefe.html` (Three.js vom CDN, Assets in
  `public/labs/assets/`) zeigt dieselbe Szene als Bühne und als 3D-Welt; `node scripts/lab-stills.mjs` erzeugt
  Standbilder nach `docs/research/labs/`. Außerdem umgesetzt: Vollbild auf dem Handy (Bühne unter Kerbe und
  Home-Leiste, Bedienelemente weichen über `src/platform/safeArea.ts` aus) und Pinselgrößen per Adresse
  (`?tip=&line=&band=&dzoom=`). Noch nicht auf einem echten Handy geprüft.
  Zweite Runde am selben Tag: das Labor baut die Bahn als Profil (Straße, Stahl, Holz, Hängebahn) mit eigenen
  Stützenfamilien (Beton brutalistisch, Rohrpylon, Holzbock, Betonportal), Füße per Alpha-Scan auf den Kulissen;
  Zählung und Antwort zu Meshy in `docs/RICHTLINIE.md`, Abschnitt 3a.
  Erste Handy-Messung (Florian, iPhone): Holzbahn im Labor 48–55 fps beim Ziehen, flüssig; Leistung soll
  immer top sein, Ziel 60 fps, siehe Richtlinie Abschnitt 12.
  Entscheidungen 24.10.: Zoom als Kamerafahrt (nicht Linse), Shadow Map bleibt; dreimal „+40 Ebenen“ ohne Shadow
  Map, Neon, Holz: etwa 50–60 fps.
  Schritt 1 der Richtlinie gebaut: Perspektive hinter `?persp=1` (TECH.md 4e), Strich als Strahl, Tests in
  `tests/projection.test.ts`, Replay mit `--persp`. Eigene Browser-Tests im Dev-Server nur mit `TC_NO_RECORD=1`, sonst
  landen sie in Florians Aufnahmen. Florians Handy-Test fand Risse an Spurgrenzen und Griffe neben der Schiene;
  behoben in 15aa4e1 (jedes Schienenstück gegen seine eigene Spur korrigiert, Overlays folgen der Kamera).
  Abends: Florians Klarstellungen und Fragen gegen den Stand geprüft und die Übergabe für die Plan-Session
  geschrieben, `docs/UEBERGABE-PLAN.md` (Abschnitt 3 unten).

- **`main` ist der Prototyp (23.10.):** Der Pinsel-Stand ist der neue Hauptzweig, lokal und auf GitHub gleich; jeder
  Push auf `main` geht über `.github/workflows/deploy.yml` auf https://nicolehahn2890.github.io/Traumacoaster/. Die
  alten `claude/*`-Branches waren vollständig enthalten und sind gelöscht. Aufgeräumt: Fremde Referenzbilder (Earle,
  Rayman, South Park) und das Prompt-Dokument liegen nur noch lokal (`refs/`, `*.docx` sind ignoriert; in der
  Git-Historie stehen sie noch). Neu: Auf dem Handy als Vollbild-App (Manifest, Symbole, Spielfläche im sicheren
  Bereich ohne Kerbe und Home-Leiste, README „Auf dem Handy testen“). Die Browser-Szenarien laufen in der Lesart
  „Bühne“ (`&stage`), für die sie geschrieben sind, und ohne Autoscroll (`&scroll=0`): Der neue Autoscroll setzt schon
  in 30 % Abstand vom Rand ein und verzerrte die in festen Bildschirmkoordinaten gezeichneten Striche. Im Szenario 5
  sind die Fahrgäste vor der Fahrt ans offene Ende angeschnallt (ohne Gurt flog je nach Takt einer heraus, der Test
  schwankte). Alle 9 Szenarien grün (65 Prüfungen).
- **Inhalt (23.10.):** Der Pinsel-Spike führt `claude/nice-cannon-094fka` (Gesten v3, Ein Strich, Kreuzungsprüfung)
  mit dem Pinsel zusammen: vier Lesarten zum Vergleich über den Knopf unten links
  (Pinsel → Bühne → 1 Strich → Ebenen), Tiefe überall gerade nach hinten (`LANE_SCALE = 1`), Pinsel mit zäher Bahn,
  Schleppe und Live-Schienen, Kreuzungen per Tipp tauschbar, einrastende Tiefen, Ebenen-Lesart mit Ebenenleiste,
  Streckenanzeige mit Budget-Regler, Schwachstellen-Marker für alle Lesarten, neuer Autoscroll, Zeichen-Zoom auf dem
  Handy, Strich-Rekorder mit `npm run strokes:replay` (README, TECH.md 4b bis 4d). Danach: Pinsel mit Loopings
  (hohe Schleife) und geraden Hügeln, ruhigere Schienen-Schräglage mit dem Wagen darauf, weniger und gleichmäßiger
  verteilte Knoten, ausgedünnte Stützen, Ebenen mit Weiterzeichnen auf der gewählten Ebene und Auto-Knopf. Florian
  gefällt der Pinsel am besten. Offen: welche Lesart bleibt; Level, Coins und Ziele für Pinsel und Ebenen; Leistung
  auf echten Handys.
- **Davor:** PR #1 (M1 bis M5/D3) und PR #2 (Spur-Filter) am 21.10. gemerged, PR #3 (D4 Pfeiler je Welt, Schienen
  als Band-Mesh) danach; Gesten v3 (`docs/PLAN.md`, M2/A8) kam über den Pinsel-Spike nach `main`.
- **Plan:** `docs/PLAN.md` (18 Anpassungen aus dem ersten Spieltest, Pakete A–F, Meilensteine M1–M6) ist der alte
  Plan; unten steht je Meilenstein der „Umsetzungsstand“. Als Nächstes kommt ein neuer Plan für die erste Zone mit
  finaler Grafik (Abschnitt 3).
- **Fertig und gepusht:** M1 Fundament, M2 Zeichnen, M3 Fahrt und Scheitern, M4 Karte, D2 Textur-Kit,
  M5/D3 Shader-Grundlage (Commit e00ec84), M5/D4 Pfeiler je Welt und Schienen als Band-Mesh (letzter Commit).
- **Offen laut altem Plan:** D5 Terrain neu → D6 Wolken im Earle-Stil → E1 Tunnel-Workflow →
  E2 Harmonie Stützen/Brücken/Wasser → M6 (F1 PWA, Capacitor 8, Haptik, 120-Hz-Ticker, WebGPU-Flag,
  Screenshot-Baselines; F2 Doku-Abschluss; Vollbild-App und sicherer Bereich sind schon da). Die Details je Paket
  stehen in `docs/PLAN.md`, Abschnitt „Pakete im Detail“. Der neue Plan ordnet das neu.

## 2. So fängst du an

```
git fetch origin
git checkout -b <dein-branch> origin/main
npm ci
npm test                      # Vitest, 26 Dateien
npm run build                 # Typecheck + Build
npx playwright install chromium   # einmalig
node scripts/scenario.mjs 1 2 # Playwright-Szenarien (Lesart Bühne, Schritte wählbar); Screenshots nach screenshots/
npm run dev                   # http://localhost:5173, zeichnet jeden Strich in recordings/strokes.jsonl auf
npm run strokes:replay        # aufgezeichnete Striche in allen vier Lesarten nachspielen
```

Nützliche URL-Parameter im Spiel: `?scene=start&level=8` (direkt ins Level), `?fast=6` (Zeitraffer),
`?brush` / `?stage` / `?single` / `?lanes` (Lesart erzwingen), `?scroll=0` (kein Autoscroll beim Zeichnen, für
Skripte), `?fx=0` / `?fx=1` (Shader aus/an, sonst automatisch
ab sechs CPU-Kernen), `?dev=1` (Overlay mit fps, Draw-Calls, Partikeln; Taste F schaltet die Effekte um), `?world=1`
(Weltrenderer der Etappe 1, Perspektive 18° Standard; dort `?persp=0` für die Bühne, `?aa=0` ohne Kantenglättung).
Eigene automatische Tests im Dev-Server mit `TC_NO_RECORD=1`, damit sie die echten Aufnahmen nicht verfälschen.

## 3. Nächster Schritt: Etappe 2 des großen Plans

Etappe 1 (Weltrenderer und Klötzchen-Editor) ist auf dem Branch `etappe-1-weltrenderer` fertig, Tor 1a und Tor 1b sind
bestanden; der Pull Request nach `main` ist https://github.com/nicolehahn2890/Traumacoaster/pull/4 (der Merge deployt
auf GitHub Pages; Florian merged). Der Plan ist `docs/GROSSER-PLAN.md` (Tabelle A zeigt je Paket, was bestätigt ist;
Paket 10 die Etappen; Paket 11 die Risiken). Als Nächstes kommt **Etappe 2, Bahn und Welt** (Paket 10, Zeile E2):
Fähigkeiten als Schalter (Paket 3.1), Startarten sichtbar als Platzhalter, Aufwertungen als Daten, Station mit
Startart-Knopf am Hebel, Schlangenbereich mit Freiraum (Anheben der Bahn) und Platzhalter-Figuren, Fels-Regeln
(Öffnungen, Baustellen, Stop-Hinweis „Fels“), Baustellen in zwei Varianten mit Freilegung, Räume „offen ab Stufe“,
Autoscroll-Schalter, Wasser mit Schaltern, Fortschrittsstufe mit Looks, Kettenzuglinie. Ergebnis: Basiszone v1, in der
alle Bahn- und Weltfähigkeiten mit Platzhaltern spielbar sind; Tor: Checkliste je Fähigkeit in je einem Feld, Replay
grün, Handy 60 fps, Florians Spieltest. Etappe 2 hat im Plan noch keine Arbeitsschritte; die Session schlägt sie zuerst
vor (in der Art von Paket 10, Etappe 1) und baut erst nach Florians Ja. Was Etappe 1 schon vorweggenommen hat (Station
mit Vorgabestück, Schlangenbereich, Baustelle und Coin-Gruppen als Platzhalter, Felder mit Kamerabegrenzung, Ziele und
Gurtstufe je Feld), steht in Paket 1, Nachträge 11 bis 16; offen aus Tor 1b bleibt der Vergleich gemaltes Teil gegen
3D-Teil mit gemalter Textur, der an der Stilprobe je Stelle getestet wird (Paket 8a).

**Startsatz für eine neue Session** (Florian passt ihn an):

> Lies `docs/HANDOVER.md` ganz und `docs/GROSSER-PLAN.md` (Tabelle A, Abschnitt Z, Paket 1, 2, 3, 5, 10, 11), dann
> `docs/RICHTLINIE.md` Abschnitte 0, 3, 3a, 4, 12 und `docs/TECH.md` 4b bis 4g. Schlage mir zuerst die Arbeitsschritte
> für Etappe 2 (Paket 10, Zeile E2) vor, in Reihenfolge mit Toren, und warte auf mein Ja; dann baue sie auf einem
> eigenen Branch (von `main`, sobald Pull Request 4 gemerged ist, sonst von `etappe-1-weltrenderer`). Nach jedem
> Schritt `npm test`, `npm run build` und das Replay; eigene Browser-Tests nur mit `TC_NO_RECORD=1`;
> `recordings/strokes.jsonl` nie anfassen. An den Toren hältst du an und fragst mich; Entscheidungen, die der Plan mir
> zuschreibt, triffst du nicht selbst. Was du lernst, trägst du mit Datum im betroffenen Paket des Plans nach, die
> Technik in `docs/TECH.md`, den Stand hier in Abschnitt 1. Bei jedem Stand sagst du, was Platzhalter ist und was
> System. Deutsch, keine Modell- oder Werkzeugnamen in Dateien und Commits, Commit-Betreff beschreibt das
> Spielverhalten. Keine Grafiken in Menge vor der Stilprobe.

Regeln aus dem Plan, die für jede Session gelten: Nichts wird festgelegt, was Florian nicht bestätigt hat; was eine
Etappe lernt, wird mit Datum im betroffenen Paket nachgetragen; keine Teile in Menge vor der Stilprobe (Etappe 4);
die Technik der Richtlinie bleibt gesetzt. Die Übergabe `docs/UEBERGABE-PLAN.md` ist Geschichte des Plans: ihr
Abschnitt 1 (Alpen mit Leveln) ist durch den Zuschnitt in Abschnitt Z des Plans ersetzt.

GPTs Grafiksystem liegt lokal unter `refs/traumacoaster-gpt explore/` (nicht im Repository: Visuals, Elemente-Bogen,
Figuren-Versuche, Karten-Moodboards, Parallaxentest, Umsetzungsplan als PDF, Art-Direction-Vorschlag, Bildprompts).

Vorarbeit für das Terrain aus dem alten Plan (Paket D5, noch für den Pixi-Renderer gedacht; die Richtlinie ersetzt
den Weg, die Geometrie-Helfer bleiben nutzbar):
- `src/render/geom.ts`: `insetPolygon` (parallele Konturbänder für Berge, Schleifen werden herausgeschnitten),
  `selfIntersects`, `signedArea`; Tests in `tests/geom.test.ts`.
- `src/render/stripMesh.ts`: `buildStrip`/`StripMesh` (Textur entlang einer Polylinie, Batch-Modus).
- Kacheln in `public/art/`: `grass_brush_a..c`, `rock_a..b`, `leaf_dot`, `stipple_sheet`, `tree_ball`,
  `tree_fan`, `fir_dots`, `snow_field`, `water_band`, `portal_arch`, `crystal`, `lantern`, `glow`.
  Zugriff über `art(ART_NAMES.x(), fallback)` und `hasArt(name)` (`src/assets/manifest.ts`).
- Paletten je Welt: `WorldDef.palette` (`src/levels/worlds.ts`), Tonstufen über `tones()` in
  `src/render/palette.ts`, Luftperspektive über `atmosphere()` in `src/render/terrainRenderer.ts`.

Umsetzung laut Plan: `terrainRenderer.redraw` zeichnet je Spur ein Band in drei harten Tönen (Silhouette
ohne Wackeln in y), Stippling-Blattwerk entlang der Schattenkante als Sprites (`leaf_dot`, deterministisch,
etwa einer je Meter, Deckel 1500, Culling über `camera.view`), Kugelbäume aus `props.ts`/`tree_ball`
gestreut über `Terrain.scatter(seed)` (nicht auf Wasser oder Bahn), Berge als Silhouette plus drei bis vier
Konturbänder (`insetPolygon`, Abstand 1,5·k) mit Schneefeld in W3/W7, Wasser als Mesh mit Graphics-Fallback.
Prüfung: `insetPolygon` ohne Selbstschnitte, `scatter` deterministisch, Szenarien 1/2/8 grün, Screenshots
ansehen.

## 4. Arbeitsweise je Paket

1. Code + Tests (`tests/*.test.ts`, Vitest, Node-Umgebung ohne Pixi: nur reine Funktionen testen).
2. `npm test`, `npm run build`, betroffene Szenarien (`node scripts/scenario.mjs <Schritte>`), Screenshots in
   `screenshots/` ansehen (ist gitignored).
3. Doku nachziehen: `docs/PLAN.md` Umsetzungsstand (eigener Punkt je Paket, mit Abweichungen vom Plan),
   `docs/TECH.md` (Technik), bei Konzeptänderungen `docs/GDD.md`, bei Stil `docs/ART.md`. Level-Änderungen:
   `npm run levels:doc` erzeugt `docs/LEVELS.md`.
4. Commit auf Deutsch (Betreff beschreibt das Spielverhalten, Rumpf die Dateien), Push auf den
   eigenen Branch, CI-Lauf im Actions-Tab prüfen (`.github/workflows/ci.yml`: Job `test` plus Matrix
   `scenario` 1–10), dann per Pull Request nach `main` (deployt auf GitHub Pages).

## 5. Regeln und Eigenheiten

- **Platzhalter immer dazusagen (Florian, 25.10.):** Bei jedem Stand, jeder Antwort und jedem Standbild steht dabei, was
  nur vorläufig oder Platzhalter ist (Klötzchen, Farben, Formen aus den Level-Daten, Labor-Werte) und was gesetztes
  System ist (Kamera, Tiefenpuffer, Dreiteiler-Prinzip, Profile aus dem Bahnmodell, Instanzen, Schatten, Looks). Nichts
  Vorläufiges so zeigen, als wäre es der Look.
- Keine Modell- oder Werkzeugnamen in Dateien, Commits oder Kommentaren. Die Attributionszeilen am Ende
  der Commit-Nachricht gibt die jeweilige Session vor.
- `art-src/` (Quellbilder der Kacheln) ist nicht im Repository; das Archiv ist die Figma-Datei
  „Trauma Coaster – Art Kit“. `npm run art:prep` erzeugt daraus `public/art/` und das Manifest. Figma-Asset-URLs
  sind kurzlebig: nie in Dateien ablegen. Neue Kacheln brauchen den Figma-Connector mit dem Pro-Konto
  (Anleitung in `docs/PLAN.md`, „Figma-Anbindung“).
- Spieltexte in `src/core/locales/de.json` und `en.json` (beide pflegen); Finanz-Jargon gibt es hier nicht,
  das Spiel ist für Kinder und Familien.
- Szenarien öffnen Level 8 mit `?fast=6&fx=1` (Shader werden unter SwiftShader kompiliert). Schritt 2 läuft
  zusätzlich mit `?dev=1` und prüft das Draw-Call-Budget (< 150 im Zeichenmodus).
  Schritte: 1 Oval (+ stehender Zug, Himmel-Übergabe), 2 Hügel+Oval mit Schräglage (+ Draw-Calls, Pfeiler),
  3 Steilkurve, 4 Looping, 5 Löschen/Überzeichnen/Vorschau/Absperrband, 6 Rundkurs von Hand,
  7 Bearbeiten (Segment ziehen, Langdruck), 8 Entgleisen auf Holz (Freiflug, Sticker), 9 Karte (Glücksrad,
  gemeinsamer Himmel, Play mittig).
- Playwright-Szenarien dauern unter Software-Rendering mehrere Minuten je Schritt; lokal einzeln starten.
- Vitest-Tests laufen in Node ohne DOM/WebGL: Renderer-Klassen nicht importieren, nur reine Module
  (`geom.ts`, `supportStyle.ts`-Planer, `skyMath.ts`, `wheelPhysics.ts`, Physik, Track).

## 6. Offene Befunde und Entscheidungen (für Nicole)

- Welt 1 ohne Gurt: große Hügel werfen die Fahrgäste schon an der Kuppe raus, bevor die Bahn etwas anderes
  zeigt (Airtime bei Lift-Tempo ist Absicht). Stellschrauben: `CREST_G` in `src/physics/passengers.ts` oder
  eine frühere Gurtstufe in `src/levels/worlds.ts` (`restraint`). Siehe `docs/PLAN.md`, M3.
- D4 weicht vom Plan ab: keine gemalten Texturen auf Pfosten und Streben (bei 8–14 Pixel je Meter unsichtbar);
  gemalte Kacheln nur als Ornamente (Laterne, Kristall, Neon) und als Maserung des Schienenprofils.
- Die Figma-Kacheln `rail_<skin>_*` aus dem Plan gibt es nicht; das Schienenprofil ist prozedural
  (`railProfileTexture` in `src/render/paint.ts`).
- Audio gibt es nur als Hooks (`src/core/audio.ts`); Vorlagen-Elemente, Weichen, Community-Teilen und
  Store-Builds sind bewusst nicht im Plan.
- Sichtbefund, noch nicht untersucht: Im Zeichenmodus liegen am Bahnhof hinter dem stehenden Zug zwei große
  Scheiben (dunkelblau und grün, etwa 2,5 m Durchmesser, sie liegen innerhalb der Spur-Ebene, denn der
  Stippling-Filter greift auf sie). Das war schon vor D4 so (Screenshots `scenario-1-oval.png` und
  `scenario-7-bend.png`); der Bahnhof (`TrackRenderer.drawStation`: Bahnsteig, Pfosten, Dach, Fahne) ist auf
  diesen Bildern nicht zu erkennen. Kandidaten: Teile des stehenden Zugs (`LevelScene.buildStandingTrain`,
  `TrainRenderer.setStanding`/`idleUpdate`) mit falscher Skalierung oder die Zeichenreihenfolge in der
  Spur-Ebene. In der Fahrt sieht der Zug richtig aus.

- Befunde aus dem Spieltest am 21.10. abends (noch nicht eingeplant):
  - Levelziele, die nie erfüllbar sind: `countElement` (`src/levels/evaluator.ts`) zählt bridge, secondTrain,
    topHat, immelmann, corkscrew und cobraRoll nicht, weil es die Elemente nicht gibt. Betroffen: Level 47, 56, 63,
    69, 80, 95, 118, 133, 148. Ein Test, der jedes Levelziel gegen die vorhandenen Elemente prüft, fehlt.
  - Holzbrücke: nur ein Name in der Zielliste; Stützen stehen über Wasser im See (`planSupports` prüft kein Wasser).
  - Tunnelportale sind Platzhalter (feste schwarze Kreise in `TerrainRenderer.drawMountain`) und erscheinen auch,
    wo die Bahn einen Berg auf einer anderen Spur nur streift (Level 32, Bahn über den Gipfel). Teil von E1.
  - Bergbauer: Ein Strich weg von Bahn und Station wird ohne Hinweis zu Gelände (`strokeKind = 'terrain'` in
    `level.ts`); Spieler erzeugen so versehentlich Berge. Braucht ein sichtbares Werkzeug oder einen Hinweis.
  - Die Scheiben am Bahnhof (Punkt oben) sind auch im Spieltest aufgefallen und wirken dort wie ein großes Loch.
  - Das Startart-Symbol über der Station (Kettenlift = vier schräge Punkte) wird nicht als Knopf erkannt.

## 7. Karte des Codes

- `src/app/scenes/level.ts` Zeichnen, Bearbeiten, Fahrt, Ergebnis; `start.ts` Karte (Glücksrad, Übergang);
  `game.ts` App-Shell (Ticker, Dev-Overlay, Szenenwechsel); `mapTransition.ts` Übergabe Karte ↔ Level.
- `src/track/` Strich → Bahn (`gesture.ts` Lesart in Abschnitte, `strokeToTrack.ts` Pipeline/Schluss/Fortsetzen, `reduceNodes.ts`), Modell und Abtastung (`model.ts`),
  Bearbeitung (`edit.ts`), Überzeichnen (`overdraw.ts`), Bühne/Spuren (`stage.ts`).
- `src/physics/` Zug (`trainSim.ts`), Freiflug (`flightSim.ts`), Fahrgäste und Gurte (`passengers.ts`,
  `belts.ts`), Terrain (`terrain.ts`), Interpolation.
- `src/render/` Weltansicht (`worldView.ts`, Ebenen je Spur), Himmel (`sky.ts`, `skyMath.ts`), Terrain
  (`terrainRenderer.ts`), Bahn (`trackRenderer.ts`, `stripMesh.ts`, `supports/supportStyle.ts`), Zug und
  Figuren (`trainRenderer.ts`, `characterSprite.ts`, `cutoutAnimator.ts`), Shader (`shaders/`), Karte
  (`miniature.ts`, `bend.ts`, `unfold.ts`), Texturen (`paint.ts`), Paletten (`palette.ts`), Deko (`props.ts`).
- `src/levels/` Welten, Level, Zieltypen und Auswertung; `src/ui/` Widgets (Sticker, Icons, Chips).
- `scripts/` Szenarien, Screenshots, Level-Doku, Kachel-Aufbereitung (`art-prep.mjs`, `art-kit.json`).
