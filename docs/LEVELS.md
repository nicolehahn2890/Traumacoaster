# Anhang A: Die 150 Level von Trauma Coaster

Automatisch erzeugt aus `src/levels/levels.ts` (`npm run levels:doc`). Jedes Level verlangt zusätzlich immer: Der Zug kommt heil in der Station an und kein Fahrgast fliegt heraus; nur in Leveln mit negativen Zielen (fliegt raus, wieder gefangen, Flug ≥ x m) ist der Rauswurf gewollt. Die Spalte „Gurt“ zeigt die Gurtstufe (Welt-Standard, einzelne Level weichen ab): ohne Gurt, Beckengurt (hält 0,6 g), Bügel (1,5 g), Schulterbügel (3 g), Rennsitz (5 g); darüber reißt der Gurt. Bonusziele (kursiv) zählen für den 2. und 3. Stern.

## Welt 1: Wiesenland

**Thema:** Sommerwiese, Holzachterbahn, Lehrgang  
**Look:** Saftig grüne Hügel, Gänseblümchen, pastellblauer Himmel mit dicken gemalten Wolken. Holzschienen mit hellen Streben. Alles weich, rund und freundlich.  
**Schienenstil:** Holzbahn  
**Gurt:** keine

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 1 | Erster Hügel | Zeichne einen Hügel. Der Zug fährt los, sobald du auf Play drückst. | Höhe ≥ 10 m | eben (1 Wagen) | 60 m | keine | Bezier-Handles |
| 2 | Feinschliff | Tippe die Bahn an und zieh an den Handles, bis der Hügel 12 Meter hoch ist. | Höhe ≥ 12 m, *Strecke ≤ 90 m* | eben (1 Wagen) | 60 m | keine | Coins |
| 3 | Goldregen | Coins liegen in der Luft. Führe die Bahn hindurch. | 4 Coins, *6 Coins* | eben | 70 m | keine | – |
| 4 | Hoch hinaus | Höher bauen heißt schneller fahren. Die Coins liegen am Lifthügel. | Höhe ≥ 18 m, 3 Coins, *4 Coins* | Hügel 4 m | 70 m | keine | Kurve (Spurwechsel) |
| 5 | Die erste Kurve | Am Boden ist oben gleich hinten: Zeichne einen flachen Bogen über die Bühne. In der Höhe wird eine Kehre zur Steilkurve. | 1 Kurve, Höhe ≥ 12 m, *5 Coins* | eben | 70 m | keine | – |
| 6 | Hin und zurück | Zwei Kurven bringen dich wieder nach vorne. Die Coins liegen auf drei Spuren. | 2 Kurven, 6 Coins | eben | 80 m | keine | – |
| 7 | Tal der Wiesen | Ein Tal in der Mitte: Nutze es für einen großen Drop. | Höhe ≥ 20 m, Drop ≥ 15 m | Tal 8 m | 90 m | keine | Looping |
| 8 | Looping! | Kreuze deinen Strich: Daraus wird ein Looping. Genug Tempo mitnehmen! | 1 Looping, Höhe ≥ 15 m, *Tempo ≥ 50 km/h* | eben | 90 m | keine | – |
| 9 | Doppelt hält besser | Zwei Loopings hintereinander. Der zweite braucht noch Schwung. | 2 Loopings, 6 Coins | eben | 100 m | keine | – |
| 10 | Kurvenkönig | Drei Kurven, drei Spuren. Die Bühne gehört dir. | 3 Kurven, 3 Spuren | eben | 90 m | keine | Bremse |
| 11 | Sanfte Landung | Komfort zählt: Höchstens 3,5 g. Die Bremse hilft, aber ohne gibt es den Bonus. | Höhe ≥ 20 m, max. 3,5 g, *Ohne Bremse* | eben | 90 m | keine | – |
| 12 | Airtime-Hügel | Kleine, schnelle Hügel heben die Fahrgäste aus dem Sitz. Zum Glück gibt es hier einen Beckengurt. | Airtime ≥ 1 s, Höhe ≥ 18 m | Hügel 3 m, Hügel 3 m | 100 m | Beckengurt* | – |
| 13 | Abflug | Ohne Gurt hebt es die Fahrgäste aus dem Sitz. Diesmal ist das gewollt: Einer soll rausfliegen, je weiter, desto besser. | 1 fliegt raus, Höhe ≥ 20 m, *Flug ≥ 15 m* | eben | 100 m | keine* (Rauswurf erlaubt) | – |
| 14 | Wiesen-Tour | Eine lange Runde über die ganze Wiese mit Coins auf dem Weg. | Strecke ≥ 150 m, 8 Coins, 2 Kurven | eben | 110 m | keine | Häuser |
| 15 | Großes Wiesenfest | Finale: Alles, was du gelernt hast, in einer Bahn. Die Dorfbewohner schauen zu. | Höhe ≥ 25 m, 1 Looping, 2 Kurven, 10 Coins, *Airtime ≥ 1,5 s* | Deko: house, Deko: house, Hügel 4 m (3 Wagen) | 120 m | keine | – |

## Welt 2: Jahrmarkt

**Thema:** Kirmes bei Sonnenuntergang, Launch-Start, Lichter  
**Look:** Orange-pinker Abendhimmel, Riesenrad und Buden als Silhouetten, Lichterketten, Zuckerwatte-Wolken. Hybrid-Schienen (Holzgerüst, Stahlschiene) mit bunten Glühbirnen.  
**Schienenstil:** Hybridbahn  
**Gurt:** Beckengurt

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 16 | Lichter an | Willkommen auf dem Jahrmarkt. Die Lichterketten sind deine Coins. | 8 Coins, Höhe ≥ 20 m, *2 Kurven* | Deko: ferris, Deko: booth | 100 m | Beckengurt | Launch-Start |
| 17 | Launch! | Tippe den Start-Chip und wähle Launch. Flach losfahren, Tempo mitnehmen. | Launch-Start, Tempo ≥ 60 km/h | eben | 100 m | Beckengurt | – |
| 18 | Katapult | Mit Launch kannst du vom Boden aus hoch hinaus. Baue den Hügel nach dem Start. | Launch-Start, Höhe ≥ 25 m | eben | 110 m | Beckengurt | Langer Zug |
| 19 | Rückfänger | Vier Wagen, acht Fahrgäste und keine Gurte: Wer rausfliegt, landet vielleicht im nächsten Wagen. Fang einen wieder ein. | 1 wieder gefangen, Höhe ≥ 20 m, *max. 4 g* | eben (4 Wagen) | 110 m | keine* (Rauswurf erlaubt) | – |
| 20 | Riesenrad-Runde | Vier Kurven um das Riesenrad herum. Drei Spuren, viele Coins. | 4 Kurven, 3 Spuren, 10 Coins | Deko: ferris | 110 m | Beckengurt | Booster |
| 21 | Nachschub | Zieh einen Booster aus dem Regal auf eine gerade Strecke. Er schiebt den Zug an. | 1 Booster, Tempo ≥ 80 km/h | eben | 120 m | Beckengurt | – |
| 22 | Zuckerwatte-Looping | Zwei Loopings mit Launch-Start. Wolken aus Zuckerwatte inklusive. | 2 Loopings, Launch-Start, *10 Coins* | eben | 120 m | Beckengurt | Feuerwerk |
| 23 | Feuerwerk | Je höher, desto näher am Feuerwerk. 35 Meter und 85 km/h; wer dabei rausfliegt, fliegt weit. | Höhe ≥ 35 m, Tempo ≥ 85 km/h, *Flug ≥ 30 m* | eben | 120 m | Beckengurt (Rauswurf erlaubt) | – |
| 24 | Achterbahn-Rallye | Eine lange Fahrt: mindestens 25 Sekunden und 220 Meter Strecke. | Fahrzeit ≥ 25 s, Strecke ≥ 220 m | eben | 130 m | Beckengurt | – |
| 25 | Nachtfahrt | Die Kirmes bei Nacht. Nur die Coins leuchten den Weg. | 12 Coins, 3 Kurven | eben | 120 m | Beckengurt | Nachtmodus |
| 26 | Spiegelkabinett | Vier Spuren, fünf Kurven. Verliere nicht die Orientierung. | 4 Spuren, 5 Kurven | eben | 120 m | Beckengurt | – |
| 27 | Sparfuchs | Material ist teuer: höchstens 160 Meter Schiene für 25 Meter Höhe und einen Looping. | Strecke ≤ 160 m, Höhe ≥ 25 m, 1 Looping | eben (Budget 160 m) | 100 m | Beckengurt | Hybridbahn |
| 28 | Kirmes-Express | Zwei Booster, 90 km/h, und das Ganze in unter 30 Sekunden. | Tempo ≥ 90 km/h, 2 Booster, *Fahrzeit ≤ 30 s* | eben | 130 m | Beckengurt | – |
| 29 | Schausteller-Prüfung | Die Prüfung: Loopings, Kurven, Airtime und Coins in einer Bahn. | 2 Loopings, 3 Kurven, Airtime ≥ 1,5 s, 12 Coins | Hügel 3 m, Hügel 3 m | 130 m | Beckengurt | – |
| 30 | Die große Kirmesbahn | Finale: 40 Meter hoch, zwei Loopings, vier Kurven, Launch. Das Feuerwerk wartet. | Höhe ≥ 40 m, 2 Loopings, 4 Kurven, Launch-Start, 15 Coins, *Tempo ≥ 100 km/h* | Deko: ferris, Deko: booth, Hügel 4 m (4 Wagen) | 150 m | Beckengurt | – |

## Welt 3: Minenberg

**Thema:** Goldmine, Berge, Tunnel, Minenzug  
**Look:** Rostbraune Felsen mit goldenen Adern, Holzstützen in Stollen, Laternen, Staub im Gegenlicht. Minenzug-Schienen auf niedrigen Holzböcken.  
**Schienenstil:** Minenzug  
**Gurt:** Beckengurt

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 31 | Erste Schürfung | Ein Berg versperrt den Weg. Noch musst du drüber. Bald geht es hindurch. | Höhe ≥ 20 m, 6 Coins | Berg 14 m | 110 m | Beckengurt | Tunnelbauer |
| 32 | Durch den Berg | Der Tunnelbauer ist frei: Zeichne die Bahn mitten durch den Fels. | 1 Tunnel | Berg 18 m | 110 m | Beckengurt | – |
| 33 | Stollenlicht | Zwei Tunnel, und die Coins liegen im Dunkeln. | 2 Tunnel, 8 Coins | Berg 14 m, Berg 16 m | 130 m | Beckengurt | Minenzug |
| 34 | Goldader | Die Goldader läuft hinter dem Berg entlang. Zwei Kurven führen dich hin. | 12 Coins, 2 Kurven | Berg 20 m | 130 m | Beckengurt | – |
| 35 | Minenschacht | Ein Abhang von 25 Metern. Der Zug muss unten ankommen, nicht die Fahrgäste. | Drop ≥ 25 m | Klippe 22 m | 120 m | Beckengurt | Bergbauer |
| 36 | Bergbauer | Du bist jetzt Bergbauer: Tippe und zieh auf den Boden, um einen Berg zu formen. Dann hindurch. | 1 Tunnel, Höhe ≥ 30 m, Bergbauer | eben | 120 m | Beckengurt | – |
| 37 | Staub und Funken | Schnell durch zwei Stollen. 80 km/h im Dunkeln. | Tempo ≥ 80 km/h, 2 Tunnel | Berg 16 m, Berg 20 m | 140 m | Beckengurt | Minen-Deko |
| 38 | Spirale | Vier Kurven auf vier Spuren: eine Spirale um den Förderturm. | 4 Spuren, 4 Kurven | Deko: headframe | 130 m | Beckengurt | Helix-Vorlage |
| 39 | Helix im Fels | Die Helix-Vorlage macht sechs Kurven zu einer Spirale. Sammle die Coins auf jeder Ebene. | 6 Kurven, 10 Coins | eben | 140 m | Beckengurt | – |
| 40 | Kippgefahr | Vier Kurven mit 70 km/h, aber höchstens 4 g. Zu schnell, und der Minenzug kippt. | max. 4 g, 4 Kurven, Tempo ≥ 70 km/h | eben | 140 m | Beckengurt | Vertikallift |
| 41 | Senkrecht hoch | Der Vertikallift zieht den Zug gerade nach oben. 45 Meter, dann 40 Meter Drop. | Höhe ≥ 45 m, Drop ≥ 40 m | eben | 140 m | Beckengurt | – |
| 42 | Doppelstollen | Drei Tunnel und ein Looping im Berginneren. | 3 Tunnel, 1 Looping | Berg 18 m, Berg 26 m, Berg 12 m | 150 m | Beckengurt | Fallschacht |
| 43 | Fallschacht | Das Fallschacht-Element lässt ein Schienenstück senkrecht abstürzen. Airtime garantiert. | Drop ≥ 35 m, Airtime ≥ 2 s, Fallschacht | Klippe 30 m | 140 m | Beckengurt | – |
| 44 | Goldrausch | Zwanzig Coins, zwei Tunnel, drei Kurven. Unter 40 Sekunden gibt es den Bonus. | 20 Coins, 2 Tunnel, 3 Kurven, *Fahrzeit ≤ 40 s* | Berg 18 m, Berg 18 m | 150 m | Beckengurt | – |
| 45 | Der große Durchbruch | Finale: Drei Tunnel, 45 Meter Höhe, zwei Loopings, vier Kurven. Die Mine gehört dir. | 3 Tunnel, Höhe ≥ 45 m, 2 Loopings, 4 Kurven, 15 Coins | Berg 22 m, Berg 30 m, Berg 14 m, Deko: headframe (4 Wagen) | 170 m | Beckengurt | – |

## Welt 4: Seenland

**Thema:** Seen, Flüsse, Wasserfälle, Brücken, Splashdown  
**Look:** Türkisblaues Wasser mit gemalten Lichtreflexen, Schilf, Holzstege, Gischt. Erste Stahlschienen in Weiß und Türkis auf schlanken Stützen.  
**Schienenstil:** Stahlbahn  
**Gurt:** Bügel

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 46 | Über den See | Wasser trägt keine Stützen. Baue die Bahn hoch genug über den See. | Strecke ≥ 120 m, 6 Coins | See | 120 m | Bügel | Holzbrücke |
| 47 | Brückenbauer | Die Holzbrücke trägt die Bahn über das Wasser. Nimm eine Kurve am Ufer mit. | 1 Kurve, Höhe ≥ 20 m, Holzbrücke | See | 130 m | Bügel | – |
| 48 | Wasserspiegel | Flach über dem Wasser mit Airtime. Die Coins spiegeln sich. | Airtime ≥ 2 s, 10 Coins | See, See | 130 m | Bügel | Wasserfall |
| 49 | Wasserfall | Ein Wasserfall stürzt von der Klippe. Deine Bahn stürzt mit: 35 Meter hoch bauen. | Höhe ≥ 35 m | Klippe 28 m, Wasserfall, See | 130 m | Bügel | – |
| 50 | Gischt | Neunzig km/h und ein 30-Meter-Drop in die Gischt. | Tempo ≥ 90 km/h, Drop ≥ 30 m | Wasserfall, Klippe 24 m, See | 140 m | Bügel | Splashdown |
| 51 | Splashdown | Zieh das Splash-Element auf eine Stelle über dem See: Die Flossen tauchen ein. | 1 Splash | See | 130 m | Bügel | – |
| 52 | Doppelter Splash | Zwei Mal eintauchen, zwei Kurven. Das Wasser bremst, also Schwung holen. | 2 Splashes, 2 Kurven | See, See | 150 m | Bügel | Stahlbahn |
| 53 | Stahlzeit | Stahlschienen erlauben engere Kurven und mehr g. Zwei Loopings bei 100 km/h. | 2 Loopings, Tempo ≥ 100 km/h | See | 150 m | Bügel | – |
| 54 | Flussfahrt | Der Fluss zieht sich über alle Spuren. Fünf Kurven, vier Spuren, zwölf Coins. | 4 Spuren, 5 Kurven, 12 Coins | Fluss | 150 m | Bügel | – |
| 55 | Inselhüpfen | Eine Insel mit Berg im See: Tunnel durch die Insel, Splash daneben. | 1 Tunnel, 1 Splash, 10 Coins | See, Berg 14 m, See | 150 m | Bügel | Zweiter Zug |
| 56 | Zwei Züge | Zwei Züge auf einer Bahn: Die Blockbremse hält den zweiten, bis der erste durch ist. | Höhe ≥ 40 m, Zweiter Zug | See (6 Wagen) | 160 m | Bügel | – |
| 57 | Seerosen | Sanft wie eine Seerose: Höchstens 3,5 g, aber 3 Sekunden Airtime. | max. 3,5 g, Airtime ≥ 3 s, 14 Coins | See, See | 160 m | Bügel | – |
| 58 | Wellenritt | Bunny Hops: Viele kleine Hügel, vier Sekunden Airtime insgesamt. | Airtime ≥ 4 s, Tempo ≥ 80 km/h | Hügel 2 m, Hügel 2 m, Hügel 2 m, Hügel 2 m | 170 m | Bügel | – |
| 59 | Regenbogen | Drei Loopings und ein Splash. Wo Gischt ist, ist ein Regenbogen. | 3 Loopings, 1 Splash, *15 Coins* | See | 170 m | Bügel | – |
| 60 | Seenland-Finale | Finale: 50 Meter hoch, zwei Loopings, zwei Splashes, vier Kurven. Eine Bahn wie ein Gemälde. | Höhe ≥ 50 m, 2 Loopings, 2 Splashes, 4 Kurven, 18 Coins, *Strecke ≥ 300 m* | Klippe 30 m, Wasserfall, See, See (4 Wagen) | 190 m | Bügel | – |

## Welt 5: Schlossreich

**Thema:** Märchenschloss, Türme, Top Hat, Immelmann  
**Look:** Lila-rosa Himmel, Schloss mit Spitztürmen und Fahnen, Rosenhecken, Goldglitzer. Goldene Stahlschienen mit Ornament-Stützen.  
**Schienenstil:** Goldbahn  
**Gurt:** Bügel

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 61 | Schlosstor | Das Schloss liegt im Hintergrund. Deine Bahn muss über das Tor hinweg. | Höhe ≥ 45 m, 10 Coins | Deko: castle, Hügel 10 m | 150 m | Bügel | Schloss |
| 62 | Turmhoch | Höher als der höchste Turm: 60 Meter. | Höhe ≥ 60 m | Deko: castle | 150 m | Bügel | Top-Hat-Vorlage |
| 63 | Top Hat | Launch, dann senkrecht hoch und über den Top Hat. 55 Meter hoch, 50 Meter Drop. | Launch-Start, Höhe ≥ 55 m, Drop ≥ 50 m, Top-Hat-Vorlage | eben | 160 m | Bügel | – |
| 64 | Hofknicks | Zwei Loopings und drei Kurven, elegant wie ein Knicks vor dem König. | 2 Loopings, 3 Kurven | eben | 160 m | Bügel | Schleife (Roll-Handle) |
| 65 | Die Schleife | Neu: Das dritte Handle dreht die Schiene um die Fahrtrichtung. Eine volle Schleife bitte. | 1 Schleife, Höhe ≥ 30 m | eben | 150 m | Bügel | – |
| 66 | Doppelschleife | Zwei Schleifen bei 90 km/h. Die Fahrgäste hängen kopfüber, also nicht zu langsam. | 2 Schleifen, Tempo ≥ 90 km/h | eben | 160 m | Bügel | Doppel-Launch |
| 67 | Zwei Launches | Der zweite Launch sitzt mitten in der Bahn. 120 km/h sind drin. | Launch-Start, 1 Booster, Tempo ≥ 120 km/h, Doppel-Launch | eben | 170 m | Bügel | – |
| 68 | Ritterturnier | Drei Loopings, eine Schleife, fünfzehn Coins. Das Turnier beginnt. | 3 Loopings, 1 Schleife, 15 Coins | eben | 170 m | Bügel | Immelmann-Vorlage |
| 69 | Immelmann | Halber Looping, halbe Schleife, Kurve: Die Immelmann-Vorlage aus dem Regal. | Immelmann-Vorlage, Tempo ≥ 100 km/h | eben | 160 m | Bügel | – |
| 70 | Königliche Parade | Eine lange Parade: 350 Meter, 45 Sekunden, 20 Coins. | Strecke ≥ 350 m, Fahrzeit ≥ 45 s, 20 Coins | Deko: castle | 190 m | Bügel | – |
| 71 | Drachenflug | Wie ein Drache: 60 Meter hoch, vier Sekunden Airtime, höchstens 4,5 g. | Airtime ≥ 4 s, Höhe ≥ 60 m, max. 4,5 g | Hügel 6 m, Hügel 6 m | 180 m | Bügel | – |
| 72 | Goldene Schienen | 130 km/h und 55 Meter Drop. Danach glänzt die Bahn golden. | Tempo ≥ 130 km/h, Drop ≥ 55 m | eben | 180 m | Bügel | Goldbahn |
| 73 | Thronsaal | Durch den Thronsaal: Fünf Spuren, sechs Kurven, ein Tunnel durch das Schloss. | 5 Spuren, 6 Kurven, 1 Tunnel | Berg 22 m, Deko: castle | 180 m | Bügel | – |
| 74 | Krönung | Drei Loopings, zwei Schleifen, Launch und 18 Coins. Fast gekrönt. | 3 Loopings, 2 Schleifen, Launch-Start, 18 Coins | eben | 190 m | Bügel | – |
| 75 | Schloss-Finale | Finale: 70 Meter, drei Loopings, zwei Schleifen, vier Kurven, 20 Coins. Der König applaudiert. | Höhe ≥ 70 m, 3 Loopings, 2 Schleifen, 4 Kurven, 20 Coins, *Airtime ≥ 3 s* | Deko: castle, Hügel 12 m (4 Wagen) | 210 m | Bügel | – |

## Welt 6: Großstadt

**Thema:** Neon-Metropole bei Nacht, Mehrfach-Launch, Helix  
**Look:** Dunkelblauer Nachthimmel, Hochhaus-Silhouetten mit leuchtenden Fenstern, Neon-Reklamen in Pink und Cyan, nasse Straßen mit Spiegelungen. Neon-Stahlschienen.  
**Schienenstil:** Neonbahn  
**Gurt:** Schulterbügel

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 76 | Skyline | Zwischen den Hochhäusern hindurch: 60 Meter hoch, zwei Kurven. | Höhe ≥ 60 m, 12 Coins, 2 Kurven | Deko: tower, Deko: tower | 170 m | Schulterbügel | Stadt-Deko |
| 77 | Neonlichter | Zwanzig Neon-Coins bei 100 km/h. | 20 Coins, Tempo ≥ 100 km/h | eben | 180 m | Schulterbügel | Neonbahn |
| 78 | Dreifach-Launch | Launch plus zwei Booster: 140 km/h. | 2 Booster, Launch-Start, Tempo ≥ 140 km/h | eben | 190 m | Schulterbügel | – |
| 79 | Parkhaus-Helix | Acht Kurven auf fünf Spuren, wie die Rampe im Parkhaus. | 8 Kurven, 5 Spuren | Deko: garage | 180 m | Schulterbügel | Korkenzieher-Vorlage |
| 80 | Korkenzieher | Die Korkenzieher-Vorlage: Looping und Schleife in einem. 110 km/h. | Korkenzieher-Vorlage, Tempo ≥ 110 km/h | eben | 180 m | Schulterbügel | – |
| 81 | Rush Hour | Schnell durch die Stadt: 300 Meter in höchstens 35 Sekunden, 15 Coins. | Fahrzeit ≤ 35 s, Strecke ≥ 300 m, 15 Coins | eben | 200 m | Schulterbügel | – |
| 82 | U-Bahn | Drei Tunnel unter der Stadt bei 120 km/h. | 3 Tunnel, Tempo ≥ 120 km/h | Berg 14 m, Berg 16 m, Berg 14 m | 200 m | Schulterbügel | – |
| 83 | Dachgarten | Über die Dächer mit vier Sekunden Airtime, aber höchstens 4 g. | Airtime ≥ 4 s, Höhe ≥ 50 m, max. 4 g | Hügel 8 m, Hügel 8 m, Deko: tower | 200 m | Schulterbügel | – |
| 84 | Hochhaus-Sprint | Vom Dach in die Tiefe: 70 Meter Drop, 150 km/h. | Drop ≥ 70 m, Tempo ≥ 150 km/h | Klippe 40 m, Deko: tower | 200 m | Schulterbügel | – |
| 85 | Nachtschicht | Vier Loopings mit zwei Boostern, damit der Schwung nie ausgeht. | 4 Loopings, 2 Booster | eben | 210 m | Schulterbügel | – |
| 86 | Verkehrschaos | Sechs Kurven, zwei Tunnel, zwei Loopings, zwanzig Coins. | 6 Kurven, 2 Tunnel, 2 Loopings, 20 Coins | Berg 16 m, Berg 16 m | 210 m | Schulterbügel | – |
| 87 | Leuchtreklame | Drei Schleifen vor der Leuchtreklame, 18 Coins. | 3 Schleifen, 18 Coins | Deko: billboard | 200 m | Schulterbügel | – |
| 88 | Sparplan | Budget: 220 Meter Schiene für 55 Meter Höhe und zwei Loopings. | Strecke ≤ 220 m, Höhe ≥ 55 m, 2 Loopings | eben (Budget 220 m) | 180 m | Schulterbügel | – |
| 89 | Metropolen-Marathon | 500 Meter Strecke, 60 Sekunden Fahrt, 25 Coins. | Strecke ≥ 500 m, Fahrzeit ≥ 60 s, 25 Coins | eben | 240 m | Schulterbügel | – |
| 90 | Großstadt-Finale | Finale: 80 Meter, vier Loopings, zwei Schleifen, zwei Booster, sechs Kurven, 25 Coins. | Höhe ≥ 80 m, 4 Loopings, 2 Schleifen, 2 Booster, 6 Kurven, 25 Coins, *Tempo ≥ 160 km/h* | Deko: tower, Deko: tower, Berg 16 m (6 Wagen) | 250 m | Schulterbügel | – |

## Welt 7: Eisgipfel

**Thema:** Gletscher, wenig Reibung, Korkenzieher, Cobra Roll  
**Look:** Hellblaues Eis mit rosa Morgenlicht, Schneeverwehungen, Eiszapfen, Polarlichter. Eis-Schienen mit Frost-Textur, Stützen aus Eiskristallen.  
**Schienenstil:** Eisbahn  
**Gurt:** Schulterbügel

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 91 | Glatteis | Auf Eis rollt der Zug fast ohne Reibung. 120 km/h bei 50 Metern Höhe, höchstens 4 g. | Tempo ≥ 120 km/h, Höhe ≥ 50 m, max. 4 g | eben (Reibung ×0.4) | 180 m | Schulterbügel | Eis-Deko |
| 92 | Eiszapfen | Die Coins hängen wie Eiszapfen. Drei Kurven. | 15 Coins, 3 Kurven | eben (Reibung ×0.4) | 180 m | Schulterbügel | – |
| 93 | Gletscherspalte | 60 Meter Drop in die Spalte, Tunnel durch die Eishöhle. | Drop ≥ 60 m, 1 Tunnel | Klippe 36 m, Berg 20 m (Reibung ×0.4) | 190 m | Schulterbügel | Eisbahn |
| 94 | Schneesturm | Drei Loopings, zwei Schleifen, 130 km/h. Im Schneesturm. | 3 Loopings, 2 Schleifen, Tempo ≥ 130 km/h | eben (Reibung ×0.4) | 200 m | Schulterbügel | Cobra-Roll-Vorlage |
| 95 | Cobra Roll | Die Cobra-Roll-Vorlage: zwei halbe Loopings, zwei halbe Schleifen, Rückkehr in Gegenrichtung. | Cobra-Roll-Vorlage, Tempo ≥ 110 km/h | eben (Reibung ×0.4) | 200 m | Schulterbügel | – |
| 96 | Polarlicht | Unter dem Polarlicht: fünf Sekunden Airtime bei 60 Metern Höhe. | Airtime ≥ 5 s, Höhe ≥ 60 m | Hügel 6 m, Hügel 6 m, Hügel 6 m (Reibung ×0.4) | 210 m | Schulterbügel | – |
| 97 | Lawine | Schneller als die Lawine: 280 Meter in 30 Sekunden bei 140 km/h. | Fahrzeit ≤ 30 s, Strecke ≥ 280 m, Tempo ≥ 140 km/h | eben (Reibung ×0.4) | 210 m | Schulterbügel | Weiche |
| 98 | Weichenstellung | Die Weiche schickt den Zug mal links, mal rechts. Fünf Spuren, sieben Kurven. | 5 Spuren, 7 Kurven, Weiche | eben (Reibung ×0.4) | 210 m | Schulterbügel | – |
| 99 | Eisbrecher | Zwei Splashes im Eiswasser, zwei Loopings. | 2 Splashes, 2 Loopings | See, See (Reibung ×0.4) | 210 m | Schulterbügel | – |
| 100 | Hundert | Level 100: Dreißig Coins, 70 Meter, drei Loopings. Ein Fest aus Eis. | 30 Coins, Höhe ≥ 70 m, 3 Loopings | eben (Reibung ×0.4) | 230 m | Schulterbügel | Kippschiene |
| 101 | Kipplage | Die Kippschiene neigt den Zug vor dem Drop. 5 g und 65 Meter Drop. | max. 5 g, Drop ≥ 65 m, Kippschiene | Klippe 40 m (Reibung ×0.4) | 220 m | Schulterbügel | – |
| 102 | Frostbeulen | Acht Kurven, zwei Tunnel, zwei Schleifen. Kalt, aber schnell. | 8 Kurven, 2 Tunnel, 2 Schleifen | Berg 18 m, Berg 18 m (Reibung ×0.4) | 230 m | Schulterbügel | – |
| 103 | Gipfelsturm | 90 Meter hoch, 150 km/h. Der Gipfel ruft. | Höhe ≥ 90 m, Tempo ≥ 150 km/h | Berg 40 m (Reibung ×0.4) | 230 m | Schulterbügel | – |
| 104 | Eiskristall | Fünf Loopings und 25 Coins, wie die Spitzen eines Eiskristalls. | 5 Loopings, 25 Coins | eben (Reibung ×0.4) | 250 m | Schulterbügel | – |
| 105 | Eisgipfel-Finale | Finale: 90 Meter, vier Loopings, drei Schleifen, sechs Kurven, zwei Tunnel, 30 Coins. | Höhe ≥ 90 m, 4 Loopings, 3 Schleifen, 6 Kurven, 2 Tunnel, 30 Coins | Berg 24 m, Berg 24 m, Klippe 30 m (Reibung ×0.4, 6 Wagen) | 270 m | Schulterbügel | – |

## Welt 8: Geisterhaus

**Thema:** Spukvilla, Dark Ride, Drop Track, Rückwärtsfahrt  
**Look:** Tiefviolette Nacht, Nebel, schiefe Villa mit leuchtenden Fenstern, Fledermäuse, Kürbisse, Grabsteine. Rostige Schienen mit Spinnweben, Laternen als Lichtquellen.  
**Schienenstil:** Geisterbahn  
**Gurt:** Schulterbügel

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 106 | Spukvilla | Durch die Villa hindurch: Zwei Tunnel im Dunkeln, zwölf Coins. | 2 Tunnel, 12 Coins | Berg 22 m, Berg 22 m, Deko: ghostHouse | 190 m | Schulterbügel | Geisterhaus |
| 107 | Fledermausflug | Wie eine Fledermaus: vier Sekunden Airtime, vier Kurven. | Airtime ≥ 4 s, 4 Kurven | Hügel 5 m, Hügel 5 m, Hügel 5 m | 200 m | Schulterbügel | – |
| 108 | Friedhofsrunde | Drei Loopings über den Grabsteinen bei 110 km/h. | 3 Loopings, Tempo ≥ 110 km/h, 15 Coins | Deko: graveyard | 210 m | Schulterbügel | Geisterbahn |
| 109 | Fallgrube | Der Fallschacht öffnet sich ins Nichts: 50 Meter Drop, drei Sekunden Airtime. | Drop ≥ 50 m, Airtime ≥ 3 s, Fallschacht | Klippe 34 m | 200 m | Schulterbügel | – |
| 110 | Spiegelwelt | Fünf Spuren, acht Kurven. Die Spiegel lügen. | 5 Spuren, 8 Kurven | eben | 210 m | Schulterbügel | Rückwärts-Weiche |
| 111 | Rückwärts! | Die Rückwärts-Weiche schickt den Zug ein Stück zurück. Nutze sie einmal. | Rückwärts-Weiche, Höhe ≥ 50 m | eben | 200 m | Schulterbügel | – |
| 112 | Kerzenschein | Nachtmodus: Nur Kerzen und Coins leuchten. Drei Tunnel, zwanzig Coins. | 20 Coins, 3 Tunnel | Berg 18 m, Berg 18 m, Berg 18 m | 220 m | Schulterbügel | Pendel-Launch |
| 113 | Pendel | Pendel-Launch: Der Zug schwingt mehrmals durch die Station und wird jedes Mal schneller. 120 km/h. | Pendel-Launch, Tempo ≥ 120 km/h | eben | 220 m | Schulterbügel | – |
| 114 | Geisterstunde | In 40 Sekunden: vier Loopings und zwei Schleifen. | Fahrzeit ≤ 40 s, 4 Loopings, 2 Schleifen | eben | 230 m | Schulterbügel | – |
| 115 | Knochenbrecher | Intensität: Mindestens 4,5 g irgendwo auf der Strecke, drei Loopings. | min. 4,5 g, 3 Loopings | eben | 220 m | Schulterbügel | – |
| 116 | Nebelfahrt | Sechs Kurven, drei Tunnel, vier Spuren im Nebel. | 6 Kurven, 3 Tunnel, 4 Spuren | Berg 18 m, Berg 18 m, Berg 18 m | 230 m | Schulterbügel | – |
| 117 | Grabesstille | Ganz sanft: höchstens 3 g, aber vier Sekunden Airtime und 20 Coins. | max. 3 g, Airtime ≥ 4 s, 20 Coins | Hügel 5 m, Hügel 5 m, Hügel 5 m | 230 m | Schulterbügel | – |
| 118 | Hexenkessel | Cobra Roll und Immelmann in einer Bahn, dazu zwei Loopings. | Cobra-Roll-Vorlage, Immelmann-Vorlage, 2 Loopings | eben | 240 m | Schulterbügel | – |
| 119 | Dämmerung | 450 Meter, 55 Sekunden, 25 Coins. Die Nacht ist lang. | Strecke ≥ 450 m, Fahrzeit ≥ 55 s, 25 Coins | eben | 250 m | Schulterbügel | – |
| 120 | Geisterhaus-Finale | Finale: 85 Meter, vier Loopings, drei Schleifen, drei Tunnel, Rückwärts-Weiche, 30 Coins. | Höhe ≥ 85 m, 4 Loopings, 3 Schleifen, 3 Tunnel, Rückwärts-Weiche, 30 Coins | Berg 24 m, Berg 24 m, Berg 24 m, Deko: ghostHouse (6 Wagen) | 270 m | Schulterbügel | – |

## Welt 9: Vulkaninsel

**Thema:** Lava, Hydro-Launch, hohe g-Kräfte, Zeitdruck  
**Look:** Glühend roter Himmel, schwarzes Gestein mit Lavaadern, Aschewolken, Funken. Lava-Schienen mit glühenden Streben.  
**Schienenstil:** Lavabahn  
**Gurt:** Rennsitz

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 121 | Lavastrom | Ein Lavafluss in der Mitte. 60 Meter hoch darüber, 15 Coins. | Höhe ≥ 60 m, 15 Coins | Fluss | 200 m | Rennsitz | Vulkan-Deko |
| 122 | Asche | 140 km/h durch zwei Aschetunnel. | Tempo ≥ 140 km/h, 2 Tunnel | Berg 20 m, Berg 20 m | 210 m | Rennsitz | – |
| 123 | Krater | 80 Meter Drop in den Krater mit drei Sekunden Airtime. | Drop ≥ 80 m, Airtime ≥ 3 s | Klippe 50 m, Tal 10 m | 220 m | Rennsitz | Lavabahn |
| 124 | Magmakammer | Vier Loopings in der Magmakammer, zwei Tunnel, 20 Coins. | 4 Loopings, 2 Tunnel, 20 Coins | Berg 26 m, Berg 26 m | 240 m | Rennsitz | Hydro-Launch |
| 125 | Hydro-Launch | Der Hydro-Launch ist der stärkste Start im Spiel: 180 km/h in Sekunden. | Hydro-Launch, Tempo ≥ 180 km/h | eben | 240 m | Rennsitz | – |
| 126 | Eruption | 100 Meter hoch wie die Eruption, mit Launch und 170 km/h. | Höhe ≥ 100 m, Launch-Start, Tempo ≥ 170 km/h | Berg 50 m | 240 m | Rennsitz | – |
| 127 | Glutnester | Dreißig glühende Coins über sechs Kurven. | 30 Coins, 6 Kurven | eben | 240 m | Rennsitz | – |
| 128 | Hitzewelle | Intensiv, aber nicht tödlich: mindestens 4 g, höchstens 5 g, drei Loopings. | max. 5 g, min. 4 g, 3 Loopings | eben | 230 m | Rennsitz | – |
| 129 | Feuerspucker | Vier Schleifen bei 150 km/h. | 4 Schleifen, Tempo ≥ 150 km/h | eben | 240 m | Rennsitz | – |
| 130 | Inselumrundung | Einmal um die Insel: acht Kurven, fünf Spuren, 500 Meter. | 8 Kurven, 5 Spuren, Strecke ≥ 500 m | Berg 36 m | 260 m | Rennsitz | – |
| 131 | Schwefelnebel | Vier Tunnel und drei Loopings im Schwefelnebel. | 4 Tunnel, 3 Loopings | Berg 18 m, Berg 18 m, Berg 18 m, Berg 18 m | 260 m | Rennsitz | – |
| 132 | Gegen die Zeit | 400 Meter in höchstens 35 Sekunden, 20 Coins. | Fahrzeit ≤ 35 s, Strecke ≥ 400 m, 20 Coins | eben | 260 m | Rennsitz | – |
| 133 | Lavabrücke | Top Hat über die Lavabrücke, 90 Meter hoch, ein Splash im See. | Top-Hat-Vorlage, Höhe ≥ 90 m, 1 Splash | Fluss, See | 260 m | Rennsitz | – |
| 134 | Ausbruch | 110 Meter, 100 Meter Drop, 190 km/h. Der Vulkan bricht aus. | Höhe ≥ 110 m, Drop ≥ 100 m, Tempo ≥ 190 km/h | Berg 60 m | 270 m | Rennsitz | – |
| 135 | Vulkan-Finale | Finale: 110 Meter, fünf Loopings, drei Schleifen, sechs Kurven, drei Tunnel, Hydro-Launch, 35 Coins. | Höhe ≥ 110 m, 5 Loopings, 3 Schleifen, 6 Kurven, 3 Tunnel, Hydro-Launch, 35 Coins | Berg 26 m, Berg 60 m, Berg 26 m, Fluss (6 Wagen) | 300 m | Rennsitz | – |

## Welt 10: Weltraum

**Thema:** Raumstation, geringe Schwerkraft, Pendel-Launch, Finale  
**Look:** Tiefes Violett mit Sternen, Planeten und Nebeln, Raumstation-Module, schwebende Asteroiden. Weiß-blaue Space-Schienen mit leuchtenden Magnetstreben.  
**Schienenstil:** Space-Bahn  
**Gurt:** Rennsitz

| Nr. | Name | Hook | Ziele | Terrain | Breite | Gurt | Schaltet frei |
|---|---|---|---|---|---|---|---|
| 136 | Startrampe | Im Weltraum wiegt alles weniger. Launch und 80 Meter Höhe bei 120 km/h. | Höhe ≥ 80 m, Launch-Start, Tempo ≥ 120 km/h | eben (Schwerkraft ×0.6) | 220 m | Rennsitz | Raumstation |
| 137 | Schwerelos | Acht Sekunden Airtime. Hier schweben die Fahrgäste gern. | Airtime ≥ 8 s, 20 Coins | Hügel 6 m, Hügel 6 m, Hügel 6 m (Schwerkraft ×0.6) | 230 m | Rennsitz | – |
| 138 | Raumstation | Durch die Module der Raumstation: zwei Tunnel, vier Kurven. | 2 Tunnel, 4 Kurven | Berg 20 m, Berg 20 m, Deko: spaceBuilding (Schwerkraft ×0.6) | 230 m | Rennsitz | Space-Bahn |
| 139 | Asteroidengürtel | Dreißig Coins auf fünf Spuren zwischen den Asteroiden. | 30 Coins, 5 Spuren | eben (Schwerkraft ×0.6) | 240 m | Rennsitz | – |
| 140 | Orbit | Fünf Loopings und drei Schleifen wie ein Orbit. | 5 Loopings, 3 Schleifen | eben (Schwerkraft ×0.6) | 250 m | Rennsitz | – |
| 141 | Andocken | Präzision: höchstens 300 Meter Schiene für 70 Meter Höhe und zwei Loopings. | Strecke ≤ 300 m, Höhe ≥ 70 m, 2 Loopings | eben (Schwerkraft ×0.6, Budget 300 m) | 220 m | Rennsitz | – |
| 142 | Sonnensturm | 200 km/h mit drei Boostern. | Tempo ≥ 200 km/h, 3 Booster | eben (Schwerkraft ×0.6) | 260 m | Rennsitz | – |
| 143 | Mondlandung | Sanft landen: höchstens 3 g trotz 90 Meter Drop und sechs Sekunden Airtime. | max. 3 g, Drop ≥ 90 m, Airtime ≥ 6 s | Klippe 56 m (Schwerkraft ×0.6) | 260 m | Rennsitz | – |
| 144 | Wurmloch | Vier Tunnel, Rückwärts-Weiche, drei Loopings. Raum und Zeit verbiegen sich. | 4 Tunnel, Rückwärts-Weiche, 3 Loopings | Berg 18 m, Berg 18 m, Berg 18 m, Berg 18 m (Schwerkraft ×0.6) | 270 m | Rennsitz | – |
| 145 | Sternenstaub | Vierzig Coins über acht Kurven. | 40 Coins, 8 Kurven | eben (Schwerkraft ×0.6) | 270 m | Rennsitz | – |
| 146 | Supernova | Mindestens 5 g, sechs Loopings, 180 km/h. Explosiv. | min. 5 g, 6 Loopings, Tempo ≥ 180 km/h | eben (Schwerkraft ×0.6) | 280 m | Rennsitz | – |
| 147 | Galaxie-Tour | 700 Meter in 80 Sekunden: die längste Fahrt des Spiels. | Strecke ≥ 700 m, Fahrzeit ≥ 80 s | eben (Schwerkraft ×0.6) | 300 m | Rennsitz | – |
| 148 | Schwarzes Loch | Zwei Cobra Rolls, zwei Immelmanns, vier Schleifen. | Cobra-Roll-Vorlage ×2, Immelmann-Vorlage ×2, 4 Schleifen | eben (Schwerkraft ×0.6) | 290 m | Rennsitz | – |
| 149 | Raketenstart | Hydro-Launch, drei Booster, 120 Meter, 220 km/h. | Hydro-Launch, 3 Booster, Höhe ≥ 120 m, Tempo ≥ 220 km/h | eben (Schwerkraft ×0.6) | 300 m | Rennsitz | – |
| 150 | Trauma Coaster | Das Finale: 130 Meter, sechs Loopings, vier Schleifen, acht Kurven, vier Tunnel, Splash, Launch, 50 Coins. Die Bahn aller Bahnen. | Höhe ≥ 130 m, 6 Loopings, 4 Schleifen, 8 Kurven, 4 Tunnel, 1 Splash, Launch-Start, 50 Coins, *Tempo ≥ 230 km/h*, *Airtime ≥ 8 s* | Berg 24 m, Berg 24 m, Berg 24 m, Berg 24 m, See, Deko: spaceBuilding (Schwerkraft ×0.6, 8 Wagen) | 340 m | Rennsitz | – |

## Freischalt-Reihenfolge

| Nach Level | Element |
|---|---|
| Start | Zeichnen, Kettenzug, Holzbahn |
| 1 | Bezier-Handles |
| 2 | Coins |
| 4 | Kurve (Spurwechsel) |
| 7 | Looping |
| 10 | Bremse |
| 14 | Häuser |
| 16 | Launch-Start |
| 18 | Langer Zug |
| 20 | Booster |
| 22 | Feuerwerk |
| 25 | Nachtmodus |
| 27 | Hybridbahn |
| 31 | Tunnelbauer |
| 33 | Minenzug |
| 35 | Bergbauer |
| 37 | Minen-Deko |
| 38 | Helix-Vorlage |
| 40 | Vertikallift |
| 42 | Fallschacht |
| 46 | Holzbrücke |
| 48 | Wasserfall |
| 50 | Splashdown |
| 52 | Stahlbahn |
| 55 | Zweiter Zug |
| 61 | Schloss |
| 62 | Top-Hat-Vorlage |
| 64 | Schleife (Roll-Handle) |
| 66 | Doppel-Launch |
| 68 | Immelmann-Vorlage |
| 72 | Goldbahn |
| 76 | Stadt-Deko |
| 77 | Neonbahn |
| 79 | Korkenzieher-Vorlage |
| 91 | Eis-Deko |
| 93 | Eisbahn |
| 94 | Cobra-Roll-Vorlage |
| 97 | Weiche |
| 100 | Kippschiene |
| 106 | Geisterhaus |
| 108 | Geisterbahn |
| 110 | Rückwärts-Weiche |
| 112 | Pendel-Launch |
| 121 | Vulkan-Deko |
| 123 | Lavabahn |
| 124 | Hydro-Launch |
| 136 | Raumstation |
| 138 | Space-Bahn |

Nach Level 150 freigeschaltet: 50 Elemente.

## Schwierigkeitskurve (Maximalwerte pro Welt)

| Welt | Höhe | Tempo | Loopings | Kurven | Tunnel | Coins | Airtime |
|---|---|---|---|---|---|---|---|
| 1 Wiesenland | 25 m | 50 km/h | 2 | 3 | 0 | 10 | 1.5 s |
| 2 Jahrmarkt | 40 m | 100 km/h | 2 | 5 | 0 | 15 | 1.5 s |
| 3 Minenberg | 45 m | 80 km/h | 2 | 6 | 3 | 20 | 2 s |
| 4 Seenland | 50 m | 100 km/h | 3 | 5 | 1 | 18 | 4 s |
| 5 Schlossreich | 70 m | 130 km/h | 3 | 6 | 1 | 20 | 4 s |
| 6 Großstadt | 80 m | 160 km/h | 4 | 8 | 3 | 25 | 4 s |
| 7 Eisgipfel | 90 m | 150 km/h | 5 | 8 | 2 | 30 | 5 s |
| 8 Geisterhaus | 85 m | 120 km/h | 4 | 8 | 3 | 30 | 4 s |
| 9 Vulkaninsel | 110 m | 190 km/h | 5 | 8 | 4 | 35 | 3 s |
| 10 Weltraum | 130 m | 230 km/h | 6 | 8 | 4 | 50 | 8 s |
