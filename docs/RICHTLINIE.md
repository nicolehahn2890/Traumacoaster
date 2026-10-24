# Richtlinie: Technik und Look für die erste Zone

Stand 24.10.2026. Antwort auf die [Klarstellungen und Fragen](research/2026-10-24-klarstellungen-und-fragen.md)
vom selben Tag. Grundlage: der Code auf `main` (cc7d00b), die GPT-Unterlagen unter `refs/` (lokal), vier
Recherchen mit Quellen (Abschnitt 13) und das neue **Tiefen-Labor** `public/labs/tiefe.html`, in dem dieselbe
Szene aus den GPT-Elementen als Bühne (heutige Projektion) und als 3D-Welt mit Perspektive, Schatten, Nebel,
Umfärben, Höhlenfreilegung und Stresstest läuft. Lokal: `npm run dev` → `/labs/tiefe.html`; nach dem nächsten Push
auf `main` auch auf dem Handy unter https://nicolehahn2890.github.io/Traumacoaster/labs/tiefe.html.

## 0. Kurzfassung

1. **Weltrenderer wechselt zu Three.js, Pixi bleibt fürs HUD.** Die Welt wird eine echte 3D-Szene aus gemalten
   Flächen (die GPT-Elemente als senkrecht stehende Kulissen auf einem waagerechten Boden) plus Schienen, Stützen
   und Wagen als Meshes. Das heutige Bild ist exakt eine um 26,6° nach unten geneigte Ortho-Kamera; die neue Kamera
   ist dieselbe Neigung, nur mit leichter Perspektive. Der Pinsel und „hinten ist oben“ bleiben, die Zeichenmathematik
   bekommt statt `toStage/toWorld` einen Strahl-Ebenen-Schnitt je Spur.
2. **Perspektive schwach und zoomfest:** Bildwinkel 15–22° bezogen auf 7 px/m, Zoom als Linse (Kameraabstand fest).
   Gemessen bei 22°: Spur +2 ist 10 % kleiner als Spur −2, Wald 17 % und Berge 24 % langsamer als die Bühne.
3. **Verdeckung kommt aus dem Tiefenpuffer**, nicht aus Masken: Element = Rückwand + Innenraum + Vorderlippe, die
   Bahn fährt mit ihrer echten Tiefe dazwischen. Masken nur für weiche Übergänge (Portaldunkel, Wasserfall).
4. **Schatten: eine Shadow Map** (Licht von hinten oben, 1024², nur Schiene/Stützen/Wagen werfen, Boden fängt) plus
   gescherte Silhouetten-Kopien für Kulissen als billige Alternative; auf schwachen Geräten abschaltbar.
5. **Umfärben per Shader** (Farbton, Sättigung, Gradient-Map, Tönung, später RGB-Masken) statt neuer Grafiken je
   Zone: im Labor werden aus denselben Elementen Frühling, Abend, Nacht, Neon und Vulkan.
6. **Untergrund als Baustelle + Freilegung** (gesetzt) und **dynamisches Graben nur in freigegebenen Zonen** über ein
   Skalarfeld mit Marching Squares; die Freilegung ist im Labor gebaut (Kamerafahrt, Auflösen, Staub, Innenraum).
7. **Zeichnen auf dem Handy größer:** Linie 14–18 px, Tropfen Ø 50–60 px, Gummiband 30 px, Zeichen-Zoom
   10–12 px/m, kleinster Kringel 120–150 px. Vollbild ist umgesetzt (Bühne unter Kerbe und Home-Leiste, Knöpfe
   weichen aus); Größen sind per Adresse testbar (`?tip=26&line=15&band=30&dzoom=11`).
8. **Figuren im Eigenbau** (datengetriebener Cut-out mit Teile-Slots und Reaktions-Zuständen), Spine nur bei Bedarf.
9. **Assets:** GPT-Image mit transparentem Hintergrund, ein Teil je Bild, mit Metadaten (Maßstab, Fußpunkt,
   Tiefe, Öffnung, Fundamentflächen); Meshy nur für Wagen und Prüfkörper, nicht für den Look.
10. **Erst die Alpen-Zone komplett**, dann aus denselben Systemen die anderen; Level = Ausschnitt einer Zone.

## 1. Ausgangslage, ehrlich verglichen

| | Heute (`main`) | Erwartung |
|---|---|---|
| Rendering | PixiJS 8, fünf Spur-Container, Vektor-Grafik + prozedurale Kacheln | gemalte Elemente, plastisch wie Rayman, Schatten, Licht, Nebel |
| Projektion | Bühne: X = x, Y = y + 0,5·Tiefe, keine Verkleinerung nach hinten | feste Seitenansicht, trotzdem Tiefe |
| Verdeckung | Spur-Container hinten → vorn; Berge als „Deckel“ über Bahn und Zug; Tunnelportale als schwarze Kreise | Bahn schlängelt durch Berge, Bäume, Wasserfälle, Untergrund |
| Terrain | Höhenfunktion aus Kosinushügeln je Spur | organische S-Formen, Höhlen mit mehreren Etagen |
| Stützen | Planer je Welt, Fuß auf Bodenhöhe der Spur | passend zu Fels, Höhlenboden, Brücken, nie im Wasser |
| Shader | Stippling-Filter je Spur, Leuchtebene | Umfärben, Glitzern, Nebel, Wasser, Lichtquellen, Tag/Nacht |
| Zeichnen | Pinsel funktioniert, Lesart bleibt | größer auf dem Handy, Vollbild |

Die Spiellogik ist weiter als der Look: 3D-Bahnmodell mit Rollwinkel, Zugphysik mit g-Kräften, Freiflug,
Rapier-Fahrgäste, Pinsel-Pipeline, Level-Daten, Karte mit Morph. Das bleibt alles. Was nicht bleibt, ist der
Darstellungsteil (`src/render/`), weil ein reiner 2D-Renderer drei Dinge nicht liefert, die der Look braucht:
Tiefenpuffer (Bahn hinter und vor beliebigen Flächen), Schatten aus Geometrie und Licht auf Flächen. Alles davon
ließe sich in Pixi nachbauen (Masken je Element, gemalte Schatten, additive Lichtflecke), aber jedes Element würde
ein Sonderfall, und genau diese Sonderfälle haben GPTs Parallaxentest schon im Labor eingeholt (Prüfbericht:
„Masken sind Entwürfe“, „Mündungen passen nicht zum Fels“, „Bahn verschwindet lange“).

## 2. 2D, 2,5D oder 3D: Messung und Entscheidung

### 2.1 Die heutige Bühne ist eine 3D-Kamera

Y = y + 0,5·Tiefe ist genau die orthografische Sicht einer um atan(0,5) = 26,57° nach unten geneigten Kamera
(mit senkrechter Streckung 1/cos, damit ein senkrechter Meter so lang bleibt wie ein waagerechter). Das Labor
rechnet so und misst **0,0 px Abweichung** zur Bühnenformel über die ganze Bahn. Folge: Der Wechsel in eine 3D-Welt
ändert das Bild zunächst gar nicht; der Pinsel sieht dieselbe Fläche. GPTs „Scherungs-Adapter“ ist unnötig.

### 2.2 Was Perspektive hinzufügt (Labor, 1170 × 540, 8 px/m, Zoom als Kamerafahrt)

| Bildwinkel | Maßstab Spur −2 → +2 | je Spur | Parallaxe Spuren | Wald (41 m hinter Spur 0) | Berge (62 m) | Abweichung der 3D-Bahn vom Bühnen-Strich Ø / max |
|---|---|---|---|---|---|---|
| Ortho (heute) | 8,00 → 8,00 px/m | 0 % | 0 % | 0 % | 0 % | 0 / 0 px |
| 12° | 8,39 → 7,64 | ±2,3 % | ±4–5 % | 10 % | 15 % | 6,6 / 31 px |
| 22° | 8,76 → 7,36 | ±4,5 % | ±8–9 % | 17 % | 24 % | 12 / 56 px |
| 35° | 9,31 → 7,02 | ±7,5 % | ±12–16 % | 26 % | 34 % | 19 / 87 px |

„Abweichung“ heißt: Würde man den Strich weiter mit der Ortho-Formel deuten, aber perspektivisch zeichnen, läge
die Bahn im Bild bis zu 56 px neben dem Strich (bei 22°, Punkte bis 100 m vom Bildzentrum). Im Spiel wird die
Deutung deshalb umgestellt: Bildschirmpunkt + gewählte Spur → Strahl schneidet die Spurebene → eindeutiger Punkt,
genau wie heute `toWorld(X, Y, z)`. Dann liegt die Bahn per Konstruktion auf dem Strich; was bleibt, ist der
Maßstabsunterschied je Spur (bei 22° zehn Prozent zwischen vorn und hinten), und der ist gewollt.

Drei Befunde aus dem Labor, die man nur dort sieht:

- **Die geneigte Ortho-Sicht hat keinen Horizont.** Fernes steigt im Bild unbegrenzt nach oben (Berge 300 m
  hinter der Bühne lägen 150 m über ihr). Darum fälscht das heutige Spiel die Ferne als 2D-Kulisse ohne Bewegung.
  Mit Perspektive laufen Ferne und Himmel auf den Horizont zu und bewegen sich beim Scrollen von selbst richtig.
  Alles, was in den GPT-Bildern „nach Rayman“ aussieht (gestaffelte Ferne, Tiefe beim Scrollen), kommt daher.
- **Zoom als Linse, nicht als Kamerafahrt.** Fährt die Kamera beim Zoomen heran (FOV fest), verdoppelt sich die
  Perspektivstärke von 7 auf 14 px/m (Spurmaßstab ±4,5 % → ±9 %): Beim Zeichnen würde die Welt „aufklappen“.
  Bleibt der Abstand fest und nur der Bildwinkel ändert sich (Labor: „Zoom = Linse“), ist das Bild in jedem Zoom
  dieselbe Perspektive, nur vergrößert. Das ist die richtige Wahl für ein Zeichenspiel.
- **Vertikale Streckung behalten.** Ohne sie sind Hügel 11 % flacher als heute (cos 26,57°); beide Varianten sind
  im Labor schaltbar („Höhe wie Bühne“), die gestreckte sieht wie das heutige Spiel aus und bleibt Standard.

### 2.3 Entscheidung

**3D-Szene mit geneigter Perspektivkamera, Bildwinkel 15–22° bei 7 px/m, Linsen-Zoom, vertikale Streckung,
gemalte Flächen als Kulissen, Bahn und Stützen als Meshes.** Nicht volles 3D (keine freie Kamera, keine
modellierte Landschaft), nicht reine Parallaxe (keine Tiefenbeziehung zwischen Bahn und Kulissen). Das ist der Weg
von Hollow Knight („3D camera, backgrounds pushed back on the z-plane“) und Ori (Sprites in 3D, Perspektivkamera);
Trine und LittleBigPlanet sind volles 3D, Cuphead/Dead Cells reine 2D-Parallaxe (Recherche A).

Engine: **Three.js** (WebGL, `stencil: true`, `antialias: false`, DPR ≤ 2) als Weltrenderer, **PixiJS 8** bleibt für
HUD, Sticker, Karte-Overlay und den Zeichen-Overlay im selben WebGL-Kontext (offiziell dokumentiert, Texturen
werden nicht geteilt, `resetState()` je Frame). Nicht Godot/Unity-Web (Logik müsste raus aus TypeScript, Größe,
Leistung), nicht Phaser (2D), Babylon nur als Alternative, falls fertige Bausteine wichtiger sind als Bundle-Größe.
pixi3d und pixi-projection sind tot, Pixis eigenes 3D ist nur angekündigt (Recherche A).

Was beim Wechsel bleibt: `src/track/*` (Modell, Pinsel, Lesarten, Kreuzungen), `src/physics/*`, `src/levels/*`,
`src/core/*`, Figuren-Definitionen, Karte-Logik. Was neu entsteht: `src/world/` (Szene, Kamera, Kulissen,
Schienen-Mesh, Stützen-Meshes, Zug-Mesh, Licht, Effekte) als Ersatz für `src/render/worldView|terrainRenderer|
trackRenderer|trainRenderer|supports`. Übergang: beide Renderer parallel hinter einem Schalter, gleiche Bahn,
gleiche Kamera, Pixel-Vergleich an 100 Bühnenpunkten (GPTs Abnahmetest ist hier richtig).

Risiken: Füllrate auf iPhone 12/13 bei vielen großen halbtransparenten Kulissen (Labor: Stresstest „+40 Ebenen“,
auf dem Handy messen; Kulissen auf Inhaltsgrenzen schneiden, opaker Kern per alphaTest + schmaler Blend-Rand);
Speicher (2048² RGBA = 16 MiB, +30 % Mipmaps; KTX2/UASTC von Anfang an einplanen); zwei Renderer im Kontext.

## 3. Bahn und Landschaft verschmelzen

- **Tiefenpuffer statt Masken.** Jede Kulisse ist eine Fläche mit Alpha-Test und Tiefenschreiben. Die Bahn liegt
  mit ihrer echten Tiefe dazwischen; im Labor fährt sie hinter dem großen Bogen, durch sein Fenster und hinter dem
  Felsfenster hindurch, ohne eine einzige Maske. Weiche Ränder (Wasserfall, Nebel, Portaldunkel) sind getrennte
  halbtransparente Flächen in sortierter Reihenfolge.
- **Element = Rückwand + Innenraum + Vorderlippe** (GPTs Modulbegriff, der richtig ist): Ein Baum mit Stammfenster
  ist Stammrückwand (hinter der Bahn), Rindenbogen (vor der Bahn) und dazwischen ein leerer Kanal mit Tiefe. Dieselbe
  Mastergrafik wird in diese Teile geschnitten; hinter der Vorderlippe braucht es gemalte Reserve (Unterzeichnung),
  weil die Parallaxe sie freilegt.
- **Alles kann Säule, Tunnel oder Start sein,** wenn das Element diese Metadaten trägt: Öffnungsvolumen (wo der Zug
  durchpasst), Fundamentflächen (wo Stützen stehen dürfen), Anschlusspunkte (Station, Tunnelachse, Wasserfallquelle).
  Eine Alpha-Lücke im Bild ist kein Fahrraum (Prüfbericht GPT, zu Recht).
- **Stützen aus der Umgebung:** je Bahnprobe ein Strahl nach unten in das Festigkeitsfeld der Spur: erster fester
  Treffer = Fuß (Boden, Felsvorsprung, Höhlenboden); Wasser und Leere sind ungültig; dann Kaskade: Fuß verschieben →
  Deckenaufhängung (Höhle) → Brücke/Fachwerk zwischen gültigen Füßen → Anlehnen an Säule → sichtbar markieren.
  Abstand nach Höhe und g wie NoLimits („Bent-Spacing“), Form je Zone (heutige `SupportKind`s), Holz im Geist der
  Skizze von 2014: organische, schräge Böcke, Gleis als dicke dunkle Silhouette mit heller Schiene (so ist die Bahn
  im Labor gebaut: Tintentubus unter cremefarbener Schiene).
- **Startarten sichtbar:** Kettenzug als Kettenmesh auf dem Anstieg, Launch als farbiges Band mit Lichtern,
  Hängebahn mit Tragschiene oben, Gondeln darunter, seitliche Ausleger als eigene Stützenfamilie.

## 3a. Bahn-Labor: vier Bahntypen, Stützenfamilien, Füße auf Kulissen (24.10., zweite Runde)

Das Labor baut die Bahn jetzt als echtes Profil entlang der 3D-Kurve (Knopfzeile „Bahn“ und „Stützen“, Adresse
`?track=road|steel|wood|hanging&sup=normal|crazy|none&feet=1`). Dieselbe Kurve, vier Materialien:

| Typ | Bahnkörper | Stützenfamilie | Stand |
|---|---|---|---|
| Straße (Alpenautobahn) | Betonplatte 3,4 m breit, Asphalt, helle Ränder, gestrichelte Mittellinie entlang der Bogenlänge, Brüstung hinten | brutalistische Betonpfeiler: konisch, Seiten dunkler, ab 7 m mit rundem Fenster, Kapitell und Fundamentplatte; „verrückt“ lehnt und verschiebt das Fenster | trifft die Bilder 01/17; Brückenbögen zwischen Pfeilern fehlen noch |
| Stahl (Stahlwirbel) | zwei cremefarbene Rohre, orange Schwellen, blaues Rückgrat mit Streben | Rohrpylon mit Gabel, ab 10 m A-Bock; „verrückt“ biegt den Pylon | nah an Bild 13 |
| Holz (Holzwirbel, Schraubenwald) | Schichtholzstapel unter Flachstahl-Schienen, Schwellen, Eisenlaschen, Handlauf | Böcke aus 2–3 schrägen Pfosten mit Riegeln, Diagonalen und Laschen, Steinfüße; „verrückt“ krümmt die Pfosten, verdreht sie in der Tiefe und lässt Y-Gabeln aus einem Fuß wachsen | trifft die Skizze von 2014 und Bild 14/16; Pfosten dürfen noch dicker und die Verzweigung kann weiter gehen |
| Hängebahn (Wolkenschaukel) | Tragbalken oben mit Rippen, Gondeln hängen 1,1 m darunter an einem Hänger, Bahn fährt 3 m höher | Betonportal, das abwechselnd vor und hinter der Bahn steht und mit einem Betonarm über den Balken greift | trifft Bild 05; die Arme könnten schwungvoller sein |

**Füße auf Kulissen (die Frage „wie stützen 2D-Elemente die 3D-Bahn“):** Jede Kulisse, die als Fundament
taugt (Wiese, Felsfenster, Doppelbaum), bekommt einen Alpha-Scan ihres Bildes (192 Spalten). Für jede Stütze
sucht der Planer senkrecht unter dem Anschlusspunkt die erste deckende Stelle einer Kulisse, die in der Tiefe
höchstens 1,9 m neben der Bahn steht, sonst den Boden oder den Höhlenboden; der höchste Treffer gewinnt. Der
Fuß steht 0,35 m vor der Kulisse, die Stütze kippt dorthin. Ergebnis: Stützen stehen auf dem Hügelrücken der Wiese,
auf der Fensterbank des Felsfensters und im Stammfenster des Doppelbaums, durch das die Bahn fährt; wo die Bahn
hinter deckendem Bild liegt, entsteht keine Stütze (sie wäre unsichtbar); wo nichts unter der Bahn ist, setzt das
Labor einen roten Marker („schwebend“), im Spiel wäre das die Stelle für Brücke, Ausleger oder eine Ablehnung des
Strichs. Zählung auf der Testbahn (`Messen`):

| Typ | Boden | Kulisse | Höhlenboden | schwebend | zu kurz (< 1,3 m) |
|---|---|---|---|---|---|
| Straße | 25 | 3 (Felsfenster 1, Baum 2) | 15 | 3 | 10 |
| Stahl | 28 | 2 | 19 | 4 | 19 |
| Holz | 41 | 4 (Felsfenster 3, Baum 1) | 25 | 6 | 18 |
| Hängebahn | 29 | 5 (Wiese 2, Felsfenster 2, Baum 1) | 10 | 6 | 0 |

Die „schwebenden“ Stellen liegen dort, wo die Testbahn ohne Tunnelmund unter die Wiese taucht; mit dem
Baustellen-Tunnel aus Abschnitt 4 verschwinden sie. Bildrate mit allen vier Typen unverändert 120 fps am Mac;
Draw Calls bei 1170 × 540: Straße 114, Stahl 155, Hängebahn 115, Holz 469. Die Holzböcke bestehen im Labor aus
vielen Einzelteilen (Pfosten, Riegel, Laschen); im Spiel werden sie instanziert oder je Bock zu einer Geometrie
verschmolzen, sonst wird der Holztyp auf dem Handy der teuerste.

**So schlängelt sich die Bahn glaubwürdig um Elemente:**
1. **Durch Fenster:** Die Bahn liegt eine halbe bis zwei Spuren hinter der Kulisse. Wo das Bild deckend ist, ist
   sie weg, im Fenster ist sie da, und die Stütze steht auf dem Fensterrand. Kein Code pro Element, nur der
   Tiefenpuffer und der Alpha-Scan.
2. **Um Säulen und Stämme:** Vorne oder hinten entscheidet die Tiefe der Bahn relativ zur Kulisse. Ein Wechsel
   geschieht nur über einen Spurwechsel, der an der Kulisse stattfindet; damit die Bahn dabei nicht „durch“ den
   Stamm schneidet, bekommt der Stamm ein unsichtbares Volumen (ein Zylinder, der nur in den Tiefenpuffer
   schreibt). Das ist die Stelle, an der 3D-Hilfskörper sinnvoll sind.
3. **Stützen als Teil der Kulisse:** Füße nur auf Flächen, die das Element als tragfähig meldet (im Labor:
   deckende Pixel; im Spiel: ein Fundament-Polygon je Element, damit Blattkronen und Wasser ausgeschlossen sind),
   Form und Farbe je Zone, Seed je Level, „verrückt“ als Stärke-Regler statt Zufall ohne Grenzen.

**Antwort zur Kombination mit Meshy:** Ja, aber andersherum als gefragt. Die gemalten Flächen tragen den Look,
3D-Körper gibt es an drei Stellen: (1) Funktionsgeometrie aus Code (Bahn, Stützen, Straßenplatte, Höhlenkasten:
alles im Labor), (2) unsichtbare Tiefen- und Kollisionskörper (Stamm-Zylinder, Felsvolumen; dafür reichen
Primitive, Meshy ist hier Luxus), (3) sichtbare Meshes nur dort, wo ein Volumen wirklich von mehreren Seiten zu
sehen ist: Wagen mit Rolls, vielleicht ein Hero-Fels. Ein Meshy-Untergrund als sichtbares Mesh müsste gemalt
texturiert werden, sonst bricht er den Stil (Bilder 1–3 der ersten Nachricht zeigen genau das: schöne Form,
falsches Licht); der Höhlenkasten aus vier gemalten Flächen im Labor liest sich bereits als Höhle. Regel:
**Flächen malen, Volumen nur, wo die Bahn sie braucht.**

## 4. Untergrund, Höhlen, Tunnel

- **Baustellenpunkt (gesetzt):** markierter Anschluss im Berg mit gelbem Absperrband. Verbindet der Strich ihn,
  läuft eine Choreografie: Ping am Punkt → Kamera fährt 0,6–0,9 s heraus → Lichtsaum/Risse entlang der künftigen
  Öffnung → die Vorderfläche löst sich mit Noise-Schwelle und Brandkante auf (Maskenwachstum vom Zentrum) → Staub →
  Innenraum mit Licht und Nebel wird sichtbar → Kamera zurück. Im Labor als Dissolve-Shader auf dem Erdschnitt und
  dem Deckel über der Höhle gebaut (`Höhle freilegen`); die Physik öffnet das Loch erst am Ende der Animation.
- **Untergrund als Ameisenfarm:** Der vordere Erdschnitt ist eine senkrechte Fläche an der Vorderkante der Bühne
  (im Labor mit Schichtentextur); Höhlen sind Räume dahinter mit Rückwand, Boden und Seitenwänden. Fortschritt in der
  Zone erweitert die Kameragrenze nach unten und legt weitere Räume frei. Bild 21 der GPT-Visuals ist genau das.
- **Dynamisch graben:** nicht Pixel (Worms), nicht Kacheln, sondern ein Skalarfeld (0,25–0,5 m Zellen, Chunks ~8 m)
  je grabbarem Element; Spieler-Graben subtrahiert Scheiben entlang des Strichs, vorgegebene Tunnel sind vorab
  subtrahierte Kapseln. Kontur per Marching Squares, Dreiecke per Earcut, Darstellung als Mesh mit den Original-UVs,
  Kante gemalt über einen Randstreifen entlang der Kontur plus Innenschatten aus dem Distanzfeld. Graben nur, wo das
  Level es erlaubt (sonst entwertet es Tunnelrätsel); der Tunnel wird um die Fahrzeughülle geprüft, nicht um die
  Mittellinie. Beides kombiniert: Große Räume sind gestaltet und werden freigelegt, kleine Verbindungen gräbt der
  Spieler.
- **Wasserfälle:** hintere Farbfläche, bewegte helle Bänder, vordere Gischtkante; Bahn dahinter gedämpft, aber
  lesbar; Eintritt/Austritt betonen.

## 5. Schatten (Laborergebnis)

| Variante | Ergebnis im Labor | Kosten | Urteil |
|---|---|---|---|
| Shadow Map (1 Richtungslicht von hinten oben, PCF, 2048², `ShadowMaterial`-Fänger auf dem Boden) | Schiene, Looping, Stützen und Wagen werfen weiche, richtige Schatten nach vorn auf die Wiese; Kulissen (Alpha-Test) werfen ihre Silhouette | M3 Pro: 120 fps bei 171 Draw Calls; Software-Renderer (Playwright): 52 ms statt 12 ms je Bild, also der teuerste Posten; Handy: zu messen | **Standard**, 1024² auf dem Handy, abschaltbar |
| Fake 2D (gescherte Silhouetten-Kopie der Kulisse flach auf den Boden, Parallelogramm je Stütze) | lesbar, aber steif; Stützen-Schatten enden nicht am Bahn-Schatten | ein Draw Call je Schatten | Fallback für schwache Geräte, Kontaktschatten an Füßen |
| aus | flach | – | nur als Vergleich |

Entscheidend war die Lichtrichtung: Licht von vorn (wie zuerst gebaut) wirft Schatten nach hinten, wo sie hinter
den Kulissen verschwinden. Licht von hinten oben links wirft sie nach vorn auf den Boden, wo man sie sieht; die
gemalten Kulissen bekommen ihre Helligkeit fast nur aus dem Umgebungslicht (ihr Licht ist ja schon gemalt), das
Richtungslicht ist schwach und dient nur dem Schatten.

## 6. Shader und Looks

| Wunsch | Technik (im Labor) | Produktionsreif |
|---|---|---|
| Umfärben | Farbtondrehung + Sättigung + Gradient-Map (Luminanz → 3-Farb-Palette) + Tönung als Uniforms auf allen Kulissen; fünf Presets aus denselben Grafiken | Gradient-Map erhält Punktraster und Kantenlicht; Stufe 2: RGB-Masken je Element (Haut/Kleid/Akzent, Little-Nemo-Pipeline), Paletten-Atlas je Zone (Rain World); Farbdrehung besser in OKLab |
| Nebel | Noise-Band (FBM) als scrollende Fläche + Three-Fog nach hinten | in Produktion FBM durch Noise-Textur ersetzen (Forge of Empires: FBM kostete 2/3 der Bildrate) |
| Wasser | UV-Verzerrung mit Noise + Glitzer-Hash | Spiegelung als gespiegelte Frame-Kopie, nicht als zweiter Render |
| Glitzern | `Points`, ein Draw Call, Phase je Punkt | auf Masken (Kronen) begrenzen |
| Lichtquellen | `PointLight` auf Lambert-Flächen + additives Glow-Sprite: die Laterne hellt Stationsdach und Boden auf | SDF-Fake-Normalen für Fels/Bäume, handgemalte Normals nur für Hero-Assets |
| Tag/Nacht | Preset (Palette + Ambient + Lichtfarbe + Nebel) | plus 3D-LUT-Pass; Helligkeit nicht in die LUT |

## 7. Zeichnen auf dem Handy

Umrechnung iPhone 15/16: 1 CSS-px = 0,166 mm, 1 mm ≈ 6 px. Heutige Werte: Tropfen Ø 5,6 mm, Linie 1,5 mm,
Gummiband 3,6 mm, 7 px/m ⇒ 1 m Bahn = 1,2 mm. Belegte Größen: Fingerkuppe 16–20 mm, Daumen ~25 mm, Occlusion-Schwelle
≈ 10,5 mm, 95 % Treffsicherheit ab 7,9 mm, Verweil-Lupe (Shift) nur bei kleinen Zielen.

Aufzeichnungen (`recordings/strokes.jsonl`, 222 Striche): 221 am Desktop bei median 17,7 px/m, nur 1 vom Handy
(7 px/m). Median-Kringel 11 m ⇒ am Handy 77 px ≈ 13 mm, also fingergroß: zu klein.

| Größe | heute | Empfehlung | Test per Adresse |
|---|---|---|---|
| Linie | 9 px | 14–18 px (2,3–3 mm) | `?line=15` |
| Tropfen (Radius) | 17 px | 25–30 px (Ø 8–10 mm, schaut um den Finger hervor) | `?tip=26` |
| Gummiband | 22 px | 30 px | `?band=30` |
| Zeichen-Zoom | 7 px/m | 10–12 px/m (kleinster Kringel ≥ 120–150 px; bei Looping-Radius R braucht es ≥ 75/R px/m) | `?dzoom=11` |
| Trefferzonen | 24–32 px | ≥ 56–60 px, Anschluss an Station 60 px | (Code) |

Außerdem: Zwei-Finger-Pan/Pinch wie Procreate (ist so), Rand-Autoscroll erst nach ≈ 150 ms Verweilen, Lupe nur
für den Anschluss an Station und eigene Bahn. **Vollbild ist umgesetzt** (`index.html`, `src/platform/safeArea.ts`):
Die Bühne füllt den ganzen Bildschirm, Knöpfe und Anzeigen weichen Kerbe, Dynamic Island und Home-Leiste aus. iOS
kennt nur `standalone` (fällt automatisch zurück); `black-translucent` bleibt. Bekannter WebKit-Fehler 301994: Seit
iOS 26.1 bleibt in Home-Screen-Apps manchmal ein Balken oben; nach Änderungen die App vom Home-Bildschirm löschen und
neu hinzufügen. Capacitor verhält sich mit `overlaysWebView` genauso.

## 8. Figuren

Eigenbau bleibt (`cutoutAnimator`, `characterSprite`), datengetrieben ausgebaut: Teile-Slots (Kopf, Frisur,
Oberteil, Hose, Schuhe), Ersatzsets (Münder, Hände, Augen), Kopf als zwei Teile mit Pivot an der Mundlinie (Terrance
& Phillip), kleine Keyframe-Clips (Stehen, Staunen, Jubel, Ducken, Schlange rücken) und eine Mini-Statemaschine für
Reaktionen auf die Bahn (Auslöser: Abstand, Tempo, Entgleisen). Schlange als Bereich der Zone mit Reihenfolge und
Kollisionsverbot für die Bahn. Spine Pro (379 $ einmalig je Person, offizielle Pixi-8-Runtime, Skins für den
Baukasten) erst, wenn handanimierte Meshes nötig werden; Rive nur über Umwege in Pixi; DragonBones/Lottie nicht.
Der GPT-Baukasten (`refs/…/character`) ist als Stilvorlage brauchbar, als Teileschnitt nicht (uneinheitliche
Maßstäbe, Berührungen).

## 9. Asset-Pipeline

- **Ein Teil je Bild, transparent erzeugt** (GPT-Image unterstützt `background: transparent`; Batch halbiert die
  Kosten; 200 Teile in mittlerer Qualität ≈ 5–11 $). Freistellen nur zum Nachputzen (BiRefNet MIT; das
  Standardmodell von rembg ist nicht kommerziell nutzbar).
- **Metadaten je Teil:** Maßstab in Metern, Fußpunkt/Pivot, Tiefenrolle (Rückwand/Mitte/Vorderlippe), Öffnungsvolumen,
  Fundamentflächen, Anschlusspunkte, Palettenfamilie, Wachstumsstufe. Das ist der brauchbare Kern aus GPTs
  `modul-schema.json`; die Alpha-Konturen aus dem Parallaxentest sind nur ein Anfang.
- **Umfärbbar:** Elemente in neutraler Palette erzeugen; Zone und Stimmung kommen aus dem Shader. Für Teile, die
  mehrere Materialien haben, eine RGB-Maske (5–15 Minuten je Teil, halbautomatisch).
- **Meshy/Tripo:** nur für Wagen (echter 3D-Körper für Rolls) und unsichtbare Prüfkörper; die generierten Modelle
  beleuchten „realistisch“ nach und passen nicht zum flachen Earle-Look (Bild 1–3 der Nachricht zeigen das).
- Die Labor-Umwandlung (`public/labs/assets/`, 34 Teile, 2,2 MB WebP) zeigt: alle GPT-Teile sind hart freigestellt
  (0–3 % halbtransparente Pixel), nur Nebel/Lichtschacht sind weich. Beschnittene Kanten (z. B. `env_foothill_a`
  links) müssen im Katalog vermerkt sein.

## 10. Zonen und Level produzieren

- **Zone = eine Szene** (Three), in Chunks von ~32–48 m je Tiefenband, Culling über Bounds, Kulissen in Atlanten
  (KTX2), Bundles je Abschnitt mit Vorladen des nächsten.
- **Level = Ausschnitt + Station + Ziele + Budget:** Kameragrenzen, Absperrband an den Rändern, freigeschaltete
  Werkzeuge und Startarten, erlaubte Grabzonen, Landmarkenstufe. Der Untergrund erweitert die Grenze nach unten.
- **Rezepte statt Illustrationen:** ~12 Kompositionsrezepte je Zone (offener Hügel, Landmarke links/rechts, See,
  Felsfenster, Brückenbogen, Wasserfallquerung, kurzer Tunnel, Haupthalle, mehrstöckig, Zonenfinale) × Zielvarianten;
  Seed + Generator- und Assetversion werden gespeichert; je Level eine gespeicherte Lösungsbahn als Test.
- **Karte:** bleibt Rad; mit einer 3D-Welt wird der Morph einfacher und schöner, weil der Boden als Mesh gebogen
  wird (Vertex-Shader) und Bäume/Felsen echte Objekte sind, die einanimiert werden, statt gebogene Fototexturen.

## 11. GPTs Pläne und Grafiken, kritisch

Brauchbar und übernommen: gemeinsames Weltmodell (Bild, Tiefe, Kollision, Ziele aus denselben Daten), Element als
Modul mit Rückwand/Vorderlippe/Öffnung/Fundamenten, Stützen aus der Geometrie, Level als Rezept mit Seed und
Version, Alpen zuerst, Abnahmetest mit 100 Punkten, Startumfang 50–70 Teile, Three.js als Weltrenderer (Empfehlung
der PDF; der spätere Parallaxentest empfiehlt dagegen „Pixi mit Teilmasken als nächsten Schritt“, das widerlegt
unser Labor: die Masken-Sonderfälle sind genau das Problem).

Verworfen oder verschoben: Rapier3D für Fahrgäste (die Wannen-Simulation im Wagenrahmen und der 2D-Freiflug tragen
weiter; räumliche Ziele erst, wenn „Zieleschießen“ als Feature feststeht); „Linsenwölbung“; Höhlen aus
Polygon-Boolean-Bibliotheken (Skalarfeld ist einfacher und robuster); Öffnungen aus Alpha-Konturen; breite
Straßenbänder mit Rolls als erste Aufgabe; die Zeitschätzung 8–14 Wochen wird nach der Etappe „Vergleichsszene“
neu gerechnet. Die Labor-Koordinaten des Parallaxentests (Bildschirmpixel mit Tiefenband) werden nicht importiert.

Grafiken: Die Visuals 5–8 treffen Detailgrad und Stil (flache große Formen, ruhige Flächen hinter der Bahn, dicke
dunkle Bahnsilhouette); 13 und 52 sind zu dicht. Die Einzelelemente sind als Kulissen sofort einsetzbar (Labor),
aber ohne Rückwand/Lippe-Schnitt und ohne Fundament-Metadaten. Der Parallaxentest beweist Schichtung, nicht
Spielbarkeit (sein eigener Prüfbericht sagt das).

## 12. Offene Tests und Risiken

1. **Handy-Leistung:** Labor nach dem Push auf dem iPhone öffnen: Bildrate mit Shadow Map an/aus, Perspektive,
   „+40 Ebenen“ zwei- bis dreimal (Füllrate). Ziel 60 fps auf iPhone 12/13, 30-fps-Stufe für Schwächere.
2. **Zeichnen in Perspektive:** Die Bahn-Deutung per Strahl je Spur muss gegen die 222 Aufnahmen laufen
   (`npm run strokes:replay`) und darf keine neuen Tiefenfehler bringen.
3. **Speicher:** Atlanten + KTX2 vor der zweiten Zone.
4. **Kulissen-Schnitt:** ein Baum mit Fenster, ein Fels mit Tunnel, ein Portal als Dreiteiler produktionsfertig,
   bevor der große Assetauftrag startet.
5. **Zwei Renderer:** Pixi-HUD über Three im selben Kontext, Zustands-Reset je Frame, Figma-Kacheln bleiben in Pixi.

## 13. Nächste Etappen (Vorschlag für den „großen Plan“)

1. **Weltrenderer-Grundlage (1–2 Wochen):** Three-Szene hinter Schalter; Kamera-Adapter (Ortho = Bühne, Perspektive);
   Schienen-, Stützen-, Zug-Meshes aus dem heutigen Bahnmodell; Boden + Erdschnitt; Pixi-HUD darüber; 100-Punkte-Test;
   Pinsel-Deutung per Strahl; Replay grün.
2. **Alpen-Kulissen (1 Woche):** 10–15 Elemente als Dreiteiler mit Metadaten; Licht, Schatten, Nebel, Looks aus dem
   Labor übernehmen; ein Anfängerlevel im finalen Look auf dem Handy.
3. **Untergrund (1–2 Wochen):** Baustellenpunkt, Freilegung, Höhlenraum, Stützen im Feld, kleiner grabbarer Tunnel.
4. **Werkzeuge und Ziele (1–2 Wochen):** Größen vom Handy übernehmen, Startarten sichtbar, Levelziele der Zone
   (Höhe, Looping, Tunnel-Meter, Airtime, Schlange), Figuren-Schlange mit Reaktionen.
5. **Produktion (laufend):** Rezepte, Seeds, Lösungsbahnen; zweite Zone als Nachweis, dass nichts Alpen-spezifisch ist.

## Anhang: Labor

`public/labs/tiefe.html`. Bedienung: Kamera (Bühne/Perspektive, FOV, Zoom = Linse/Kamerafahrt, Höhe wie Bühne),
Zoom, Schatten (aus/Shadow Map/Fake 2D), Look (Frühling/Abend/Nacht/Neon/Vulkan), Effekte (Nebel, Glitzern, Wasser,
Strich-Overlay = weiß gestrichelt der Bühnen-Strich, pink die 3D-Bahn, Fahrt), Test (Höhle freilegen, +40 Ebenen,
Messen, Ansicht). Ziehen = schieben, Pinch/Rad = Zoom, ☰ blendet die Leiste aus. Adresse: `?cam=persp&fov=18&look=night&shadow=fake&reveal=1&hud=0&zoom=8&cx=90&cy=6&lens=1&stress=2`.
Standbilder: `npm run dev` und `node scripts/lab-stills.mjs http://localhost:5173` → `docs/research/labs/tiefe-*.jpg`
(Bühne, Perspektive 22°/40°, Strich-Overlay, Nacht, Neon, Vulkan, Abend, Höhle, Schatten map/fake/aus, Kamerafahrt vs.
Linse bei 14 px/m, Stress 120 Ebenen, Bahntypen `bahn-strasse`, `bahn-stahl`, `bahn-holz`, `bahn-haengebahn` samt
„verrückt“, Füße im Baumfenster, am Felsfenster und in der Höhle) samt Bildrate, Draw Calls und Stützenzählung in der
Konsole. Bedienung Bahn: Bahn (Straße/Stahl/Holz/Hängebahn), Stützen (passend/verrückt/keine), „Füße zeigen“
(grün Boden, orange Kulisse, blau Höhlenboden, rot schwebend).

Die vier Recherchen mit allen Quellen liegen unter `docs/research/`:
[A 2,5D-Look und Engines](research/2026-10-24-recherche-a-2-5d-engines.md),
[B Shader, Licht, Schatten](research/2026-10-24-recherche-b-shader-licht-schatten.md),
[C Graben, Verdeckung, Freilegen, Stützen](research/2026-10-24-recherche-c-tunnel-verdeckung-stuetzen.md),
[D Touch, Vollbild, Figuren, Assets](research/2026-10-24-recherche-d-touch-vollbild-figuren-assets.md).

**Grenzen dieses Labors, selbstkritisch:** Gemessen wurde auf einem M3 Pro und im Software-Renderer, nicht auf
einem Handy; die Füllraten-Frage ist damit offen. Die Bahn im Labor ist eine handgesetzte Kurve, nicht das
Spielmodell; die Pinsel-Deutung per Strahl ist noch nicht gebaut, also ist „Zeichnen in Perspektive“ eine Rechnung,
kein Spielgefühl. Die Höhlenfreilegung ist ein Shader-Effekt ohne Spiellogik, die Fake-Schatten sind grob, die
Umfärbe-Presets sind Uniform-Spielereien ohne Masken, und die Kulissen stehen als ganze Bilder, nicht als
Rückwand/Lippe-Dreiteiler. Das Labor beweist, dass der Weg trägt und wie die Zahlen aussehen, nicht, dass der
fertige Look erreicht ist.
