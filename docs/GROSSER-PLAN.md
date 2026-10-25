# Trauma Coaster – der große Plan

Stand 24.10.2026, spät. **Dieser Plan ist Paket für Paket mit Florian entstanden und am 24.10.2026 in allen Paketen
bestätigt** (Tabelle A, Spalte „bestätigt am“). Er wird fortgeschrieben: Was eine Etappe lernt, wird mit Datum im
betroffenen Paket nachgetragen; was Florian ändert, ebenso. Vorläufig bleiben ausdrücklich die zehn Regeln des Looks
(bis zur Stilprobe), die Grafikliste (folgt aus der Basiszone), Graben in Stufen (Florians Vorbehalt) und der
Autoscroll am Tunnel (wird ausprobiert). Eingabe war `docs/UEBERGABE-PLAN.md`; die Technik steht in
`docs/RICHTLINIE.md` und wird hier nicht neu verhandelt. Der alte Plan `docs/PLAN.md` bleibt als Archiv.

## A. Stand der Abstimmung

| Paket | Inhalt | Stand | bestätigt am |
|---|---|---|---|
| Z | Ziel und Zuschnitt des Plans | Florians Vorgabe vom 24.10.; mit Paket 2 und 4 bestätigt (Karte und Morph als Paket 12 ergänzt) | 24.10.2026 |
| 2 | Zonen-Baukasten: Editor, Zone und Level als Daten | **bestätigt**: Editor im Spiel (A), Fortschritt über Levelnummer, Untergrund gedeckelt bis freigespielt; Datenmodell als Arbeitsgrundlage, wird in Paket 3 und 5 ergänzt | 24.10.2026 |
| 4 | Levelziele, Sterne, Humor | **bestätigt**: Zielarten-Katalog v1, fünf Umgebungselemente, Schanze, Magnet-Coins, Fangen, Bild im Bild als 2D-Kabine, Sterne A plus C, Rauswurf ohne Fangen = Sternverlust plus Zielart „Alle an Bord“ | 24.10.2026 |
| 3 | Achterbahn-Features: Bahntypen, Aufwertungen, Startarten, Station, Stützen | **bestätigt**: Fähigkeiten als Schalter, alles geht in der Basiszone; 3D-Wagen mit gemalten Flächen; Station als Anker mit Richtung; Stützen-Werkstatt (Hybrid); Startarten sichtbar | 24.10.2026 |
| 8a | Teile und Elemente | **bestätigt**: Elementkatalog als Platzhalter-Satz, Ablauf Platzhalter → Auftrag → Grafik; die Grafikliste folgt aus der Basiszone, Referenzen in Paket 0 | 24.10.2026 |
| 6 | Figuren, Schlange, Fahrgäste | **bestätigt**: Rig mit klappendem Oberschädel, zwei Ansichten, Visuals als Stilvorlage, Schlange mit Freiraum, Editor bleibt und wächst, zwei je Wagen gemischt | 24.10.2026 |
| 5 | Untergrund, Tunnel, Baustellen | **bestätigt**: Fels fest, Baustellen in zwei Varianten, Freilegung auf zwei Wegen, Autoscroll als Schalter zum Ausprobieren, Graben in Stufen (Vorbehalt), Wasser mit Schaltern | 24.10.2026 |
| 0 | Art Direction v2 (Look) | **bestätigt**: alle Visuals als Pool (Stil 04 und 09, Maßstab 15 und 16), zehn Regeln nur vorläufig bis zur Stilprobe, keine Konturen, Punktraster gemalt plus Funkeln-Shader, Alpen als erster Look, Stilprobe als Tor; UI-Richtung Baustellen-Brutalismus, Nachtrag: noch viel verrückter, UI-Werkstatt mit drei Varianten | 24.10.2026 |
| 7 | Werkzeuge und Bedienung | **bestätigt**: 18 Grad, Richtlinien-Größen, drei Lesarten, Spur-Filter und 150 Level weg, Bug-Backlog, HUD in der Sprache der UI; Nachtrag: Kreuzungstausch bleibt als Rückfall im Bogenmenü, „Boden formen“ später als Fähigkeit der Basiszone | 24.10.2026 |
| 1 | Weltrenderer (Technik, Richtlinie Schritt 2) | **bestätigt**: Technik aus der Richtlinie, Module unter `src/world/`, Tore; Etappe 1 | 24.10.2026 |
| 8b | Asset-Pipeline und Aufträge | **bestätigt**: Session erzeugt über Florians Figma-Konto (am ersten Auftrag geprüft), automatische Prüfung gegen Auftrag und Leitbilder, eigene Teile je Zone, Katalog, Aufträge in Sätzen | 24.10.2026 |
| 9 | Produktion vieler Level | **bestätigt**: Vorschlag-Generator, Prüfer mit Lösungsbahn in der CI, zweite Zone „Mystischer Neon-Freizeitpark“ ohne neuen Engine-Code | 24.10.2026 |
| 10 | Etappen und Abnahmen | **bestätigt**: acht Etappen E1 bis E8 mit vier Prüfungen je Tor, Zwischentor nach E2, Stilprobe parallel zu E3; Nachtrag: kein Kalender, Etappe 1 als Arbeitsschritte in Reihenfolge; 25.10.: Etappe 2 als zwölf Arbeitsschritte mit drei Toren bestätigt | 24.10.2026 |
| 11 | Risiken und Grenzen | **bestätigt**: Risikotabelle mit Gegenmaßnahme und Tor, Liste dessen, was bewusst nicht im Plan ist | 24.10.2026 |
| 12 | Karte und Morph (neu auf Florians Wunsch, 24.10.) | **bestätigt**: ein Rad für alle Zonen in Sektoren, Miniaturen und Symbole, Morph in zwei Schritten mit messbaren Kriterien | 24.10.2026 |

Runde 1 (24.10.): offene Einladung, Zone und Level, Levelziele; Pakete Z, 2 und 4 am selben Abend bestätigt. Florians
Antworten stehen je Paket unter „Florians Vorgaben“; die Vorschläge darunter sind die Antwort der Session darauf, und
was Florian bestätigt hat, trägt das Datum. Runde 2 (24.10.): Achterbahn-Features und Teileliste; Florians Antworten haben die Zone zur **Basiszone** gemacht
(Abschnitt Z); Pakete 3 und 8a am selben Abend bestätigt. Runde 3 (24.10.): Figuren und Schlange, Untergrund und Tunnel; Pakete 6 und 5 am selben Abend bestätigt. Runde 4
(24.10.): Look und Werkzeuge; Pakete 0 und 7 am selben Abend bestätigt. Runde 5 (24.10.): Karte und Morph, Pipeline,
Produktion; Pakete 12, 8b und 9 am selben Abend bestätigt. Danach Etappen, Risiken und die Einordnung des Weltrenderers
als Vorschlag aus allem Bestätigten (Paket 1, 10, 11), am selben Abend bestätigt. Damit ist der Plan komplett.

## Z. Ziel und Zuschnitt des Plans (Florians Vorgabe, 24.10.)

Zur Bestätigung so formuliert:

- Der Plan führt zu **Look und Werkzeugen**, nicht zu fertigen Leveln: am Ende steht **ein Zonenerstellungssystem**,
  das wir weiterbenutzen (Editor, Datenmodell, Elementkatalog, Shader, Bahnsysteme), und **eine komplette Zone, in
  der alles funktioniert, was später im Spiel vorkommt**.
- Die genauen Level, die Anzahl je Zone (Florians Richtwert: 15–20, von sehr einfach bis Physikrätsel) und der
  Gesamtumfang werden **erst festgelegt, wenn Spielmechanik und Look sitzen**.
- **Die Zone, die wir jetzt bauen, ist eine Basiszone** (Florian, Runde 2): Sie soll alles enthalten, was eventuell
  kommen kann, allgemein gehalten, zuerst mit Platzhaltern, die ersetzt werden, sobald Form, Zuschnitt und Position
  feststehen. In ihr gehen alle Bahntypen, alle Startarten, alle Aufwertungen, alle Elementtypen; welche Level was
  wann bekommen, entscheidet später das Leveldesign. Welcher Look zuerst auf die Basiszone gelegt wird (die
  Richtlinie sagt Alpen), klärt Paket 0.
- **Basiszone und Neon-Freizeitpark sind Werkstattzonen** (Florian, 24.10., zur Info): Vermutlich findet keine von
  beiden so den Weg ins Spiel. Wenn klar ist, wie alles funktioniert und aussehen muss, überarbeitet Florian die
  Startzonen neu. Der Plan liefert also das System und zwei Nachweise, nicht den Inhalt der Veröffentlichung.
- Der Stil ist im Groben festgelegt; die Visuals unter `refs/traumacoaster-gpt explore/visuals/` zeigen ihn am
  besten, aber nur in Ausschnitten (Regelwerk daraus: Paket 0).
- Wir bauen den Editor zusammen: zuerst mit einfachen Formen, die wir dann durch Grafiken und 3D-Modelle ersetzen und
  dabei Shader und Elemente ausarbeiten.
- **Karte und Morph sind wieder im Plan** (Florian, 24.10.): zuerst muss der Morph vom Glücksrad ins Level sauber sein,
  dann wird die genaue Animation erarbeitet (Paket 12). Nicht im Plan: Audio, Store-Builds, weitere Zonen als Inhalt.

Folge für die Übergabe: Abschnitt 1 der `docs/UEBERGABE-PLAN.md` („erste Zone mit allen Leveln und Levelzielen“) ist
damit enger gefasst; der Levelzielkatalog bleibt Teil des Plans, die konkreten Level nicht.

## Paket 2: Zonen-Baukasten – Editor, Zone und Level als Daten

### Florians Vorgaben (Runde 1)

- Eine Zone ist quasi ein riesiges Level; in verschiedenen Ausschnitten entstehen verschiedene Level. Mal baut man an
  ganz neuen Orten der Zone, mal am gleichen Ort mit vergrößertem Ausschnitt, bei Nacht, mit der Möglichkeit, Tunnel
  zu machen, oder mit einem gewachsenen Element.
- Jedes Level ist leer. Es fühlt sich an wie andere Casual-Spiele: Level für Level voran, manche sehr schnell, manche
  knifflig und lang; auch kurze Bahnen sollen zu kniffligen Problemen führen.
- Jede Bahn entsteht in einem festgelegten Feld, über das man nicht hinausscrollen kann; beim Herauszoomen ist
  höchstens dieses Feld zu sehen, also maximal die ganze Bahn.
- Ein Bahntyp je Zone, der aufgewertet wird: besserer Gurt, schönere Wagen, Booster, Splash, Bremse, Launch-Arten,
  Kettenzug. In der ersten Version mehrere Typen zum Vergleich: Holzbahn, Stahlbahn, Autobahn, Schwebebahn.
- Stützen müssen richtig in die Umgebung integriert sein: mehrere Versionen je Bahntyp, auch in die Decke oder
  horizontal in einen Fels, besondere Holzkonstruktionen. Beispiele: `refs/traumacoaster-gpt explore/bahn und strecke/`
  (zehn Bahnen mit Gleisen, Pfeilern a–c, Station, Eingang mit Schlange, Wagen in drei Detailgraden, dazu
  Einzelstudien: Wandkonsole, fliegender Ausleger, schiefer Doppelbock, Fachwerkbrücke, Doppelportal, Beton-S, Fahrwerk).
- Wie Zonen vorgegeben werden und ob es einen Editor gibt, ist Florians Frage; die Antwort ist der Vorschlag unten.
- Baustellen und Tunnel: noch offen (Paket 5); das Ziel ist immer, die Bahn komplett zu bauen.

### Vorschlag 2.1: Begriffe und Datenmodell

Bisheriger Stand: Level sind Daten (`src/levels/types.ts`: Ziele, Freischaltungen, Breite, Höhenlimit, Terrain,
Coins, Startarten, Fahrgäste, Wagen, Streckenbudget, Physik, Gurt); Richtlinie 10 beschreibt Zone als Szene in
Chunks und Level als Ausschnitt mit Kameragrenzen, Absperrband, Werkzeugen, Startarten, Grabzonen, Landmarkenstufe.
Daraus, mit Florians Vorgaben:

**Zone** (eine Datei je Zone, zum Beispiel `zones/alpen/zone.json`, vom Editor geschrieben):
- Maße: Breite, Höhe über dem Boden, Tiefe unter dem Boden (Untergrund), Spuren wie heute (fünf, 8,4 m Abstand).
- Bahntyp der Zone (einer) und seine Aufwertungsstufen (siehe 2.4).
- Boden: Höhenprofil je Spur, Wasserflächen, Erdschnitt.
- Elemente: Instanzen aus dem Elementkatalog (Typ, Variante, Position x/y/Tiefe, Spiegelung, Maßstab) mit
  **Wachstumsstufen** (ein Element kann je Fortschrittsstufe anders aussehen: höherer Baum, zweites Fenster).
- Untergrund: Höhlenräume (Kästen mit Rückwand, Boden, Seiten), Baustellen- und Tunnel-Anschlüsse, Grabzonen (falls
  Paket 5 sie vorsieht).
- Stationsanker (mehrere je Zone), Schlangenbereiche, Coin-Gruppen, interaktive Elemente (Paket 4), Lichtquellen,
  Nebelbänder, Partikelquellen.
- Looks je Fortschrittsstufe (Tag, Abend, Nacht als Shader-Presets, Richtlinie 6).

**Level** (Liste in der Zone; jedes Level ist leer, keine Bahn bleibt stehen):
- **Feld**: Rechteck in Zonenkoordinaten (x von … bis, Höhe bis, Tiefe bis). Kamera scrollt nicht darüber hinaus
  (Begrenzung mit weichem Rückstoß), die Zoom-Grenze ist „Feld passt ins Bild“, an den Rändern Absperrband.
- Stationsanker und Richtung (Bahnstart vorgegeben und etwas länger, Paket 3) und der **Schlangenbereich**, je Level
  dort platziert, wo er zum Levelabschnitt am besten passt (Florian, Runde 2).
- **Fortschrittsstufe** der Zone (steuert Look, Wachstum der Elemente, Untergrund offen, Nacht, Tunnel erlaubt).
- **Aufwertungsstufe der Bahn** (Gurt, Wagen, Kettenzugstärke, Launch-Arten, Booster/Bremse/Splash verfügbar).
- Grenzen: Streckenbudget, Höhenlimit (Florian: in den meisten Leveln begrenzt).
- Ziele (höchstens drei, Paket 4), aktive interaktive Elemente, Coins, Baustellen und Tunnel aktiv, erlaubte Werkzeuge.
- Beispiel-Lösungsbahn (für den automatischen Test, Richtlinie 10).

**Fortschrittsstufe**: ganze Zahl je Zone (0 … n). Jedes Level nennt seine Stufe. So sind „derselbe Ort, größeres
Feld, bei Nacht, mit gewachsenem Baum“ nur Daten: zwei Level, gleicher Ort, verschiedene Felder und Stufen. Was die
Stufe auslöst, ist eine Rückfrage (Levelnummer oder Sterne, siehe Paket 4).

**Elementkatalog** (Typen, keine Grafiken; die Grafiken kommen in Paket 8a): einfache Kulisse; Dreiteiler (Rückwand,
Innenraum, Vorderlippe mit Öffnung, Richtlinie 3); Säule oder Stamm mit unsichtbarem Tiefenvolumen; Fundamentfläche
(wo Stützen stehen dürfen); Höhlenkasten; Wasserfläche und Wasserfall; Portal und Tunnelmund; Station; Baustelle;
Lichtquelle; Partikelquelle; Nebelband; Schlangenbereich; Deko ohne Funktion; interaktives Element (Rad, Klappe,
Glocke, Schalter, Paket 4); Coin-Gruppe; Feldrand.

### Vorschlag 2.2: Der Editor

Heute gibt es keinen Editor; Level sind Code (`src/levels/levels.ts`), das Tiefen-Labor ist eine feste Szene.
Optionen:

| Option | Was | Für | Gegen |
|---|---|---|---|
| **A: Editor im Spiel** (im Browser am Mac, hinter einem Schalter, gleiche Engine wie das Spiel) | Platzhalter setzen und verschieben, Tiefe und Metadaten wählen, Felder aufziehen, Testfahrt sofort, Speichern als Zonendatei | genau das, was auf dem Handy zu sehen ist; kein Export; Florian bedient ihn selbst; Platzhalter werden später per Namen durch Grafiken ersetzt | Bedienoberfläche muss gebaut werden (Pixi-HUD vorhanden) |
| B: 3D-Programm als Editor (Flächen und Kästen mit Eigenschaften, Export) | mächtige Transformationen, Kameravorschau | fertige Werkzeuge | Werkzeugwechsel, Exportpipeline, Metadaten umständlich, Handy-Kontrolle erst nach Export |
| C: Zonendatei von Hand (Daten plus Hot-Reload) | schnellster Start für Sessions | kein Bau nötig | für Florian nicht benutzbar, kein Gefühl für Maße |
| D: 2D-Leveleditor (Kacheln, Ebenen) | bekannt | fertig | unsere Zone ist 3D aus Flächen; Tiefe, Fundamente, Öffnungen passen nicht |

**Empfehlung: A**, in drei Ausbaustufen, jede mit Tor. **Bestätigt am 24.10.2026: Option A, Florian bedient den Editor selbst am Mac.**
**Stand 25.10.2026:** Stufe 1 begonnen (Etappe 1, Schritt 6: Setzen, Ziehen, Tiefe, Maße, Löschen, Speichern, Laden,
Hot-Reload; Schritt 7: Metadaten je Element und Felder mit Kamerabegrenzung, Absperrband und Zoom-Grenze; Schritt 8:
Station, Schlange, Baustelle und Coin-Gruppen als Einträge der Zone; Schritt 9: Ziele, Fortschritts- und
Aufwertungsstufe je Feld, Testfahrt-Knopf, Prüfzone mit Determinismus-Test und Standbild-Szenario; `docs/TECH.md` 4g).
Stufe 1 des Editors ist damit gebaut; Tor 1b prüft sie.

1. **Klötzchen-Editor** (gehört zur Etappe Weltrenderer): Platzhalter (Fläche, Kasten, Zylinder, Höhlenkasten, Wasser,
   Station, Baustelle, Coin-Gruppe) setzen, ziehen, in der Tiefe verschieben, Metadaten setzen (Fundament, Öffnung,
   Anschlüsse, Wachstumsstufe), Level-Felder aufziehen, Fortschritts- und Aufwertungsstufe wählen, Ziele eintragen,
   Testfahrt aus dem Editor, Speichern und Laden. Bedienung mit Maus und Trackpad am Mac; auf dem Handy nur spielen.
   Tor: Florian baut selbst einen Testausschnitt mit Station, einem Hügel, einem Fenster-Element und einer Baustelle;
   das Handy zeigt denselben Stand; der Export lädt deterministisch (Test rendert ein Standbild).
2. **Grafik-Slots**: jeder Platzhalter trägt einen Asset-Namen; liegt die Grafik oder das Modell vor, ersetzt es den
   Klotz (wie heute die Kacheln über das Manifest). Dreiteiler-Schnitt, Fundament-Polygon und Öffnung werden im
   Editor über das Bild nachgezeichnet. Tor: die ersten drei Alpen-Dreiteiler aus Paket 8a sitzen im Editor und
   tragen die Bahn und ihre Stützen (Richtlinie 12.4).
3. **Zonenwerkzeuge**: Varianten und Wachstum je Fortschrittsstufe, Look-Presets je Stufe, Untergrund-Freilegung,
   Schlangenbereiche, interaktive Elemente, später Rezepte und Generator (Paket 9). Tor: die Alpen-Zone als Datei mit
   mehreren Feldern in mehreren Stufen, komplett spielbar.

### Vorschlag 2.3: Feld und Kamera

Feld als Rechteck mit weicher Kamerabegrenzung (Recherche C, Abschnitt E: Kamera-Clamp plus Rückstoßzone,
einfache Grenzen lesen sich besser als unregelmäßige), Zoom-Grenze „Feld passt ins Bild“, Absperrband an den
Feldrändern wie heute an offenen Bahnenden, Autoscroll beim Zeichnen nur innerhalb des Feldes. Hochformat:
Felder sind eher hoch als breit (Untergrund zählt mit), Querformat eher breit; der Editor zeigt beide Rahmen.

**Untergrund vor dem Freispielen (Florians Antwort, 24.10.):** Er darf schon Platz einnehmen, soll aber nicht richtig
sichtbar sein, solange er nicht freigespielt ist. Umsetzung als Regel: Vor dem Freispielen zeigt das Feld unten nur den
geschlossenen Erdschnitt (geschichtete Erde ohne Räume, etwas dunkler, höchstens ein Fünftel der Feldhöhe); mit der
Fortschrittsstufe wächst das Feld nach unten, und die Räume werden mit der Freilegung aus dem Labor sichtbar.

### Vorschlag 2.4: Ein Bahntyp je Zone, Aufwertungen als Daten

Die Zone nennt ihren Bahntyp; die Aufwertungsstufen sind eine Tabelle je Typ: Stufe → Gurt (0–4 wie heute), Wagenform
(Skin-Variante), Kettenzugstärke (bestimmt die maximale Höhe des ersten Hügels, beim Zeichnen als Linie sichtbar),
Launch-Arten, Booster, Bremse, Splash. In der ersten Version bauen wir alle vier Typen als Systeme (Richtlinie 3a hat
sie im Labor) und schalten sie im Editor um, damit Florian vergleichen kann; welche die Alpen bekommt, ist eine Frage
der Runde 2 (die Alpen-Visuals zeigen die Autobahn).

### Rückfragen zu Paket 2 (Runde 1b)

1. Editor: Option A, du bedienst ihn selbst am Mac mit der Maus? **Beantwortet am 24.10.: ja, Option A.**
2. Fortschrittsstufe: durch die Levelnummer (fest, vorhersehbar) oder durch gesammelte Sterne (Wiederspielen lohnt)?
   Empfehlung: Levelnummer für Aufwertungen und Zonenfortschritt, Sterne als Prestige und für Schmuck (Paket 4).
   **Beantwortet am 24.10.: wie empfohlen, Levelnummer.**
3. Feld im Hochformat: darf der Untergrund das untere Drittel einnehmen wie in den Visuals 15 und 18, auch wenn
   die Bahn dann kleiner wird? Oder soll der Untergrund erst mit dem Fortschritt ins Feld rutschen?
   **Beantwortet am 24.10.: teilweise schon Platz, aber nicht richtig sichtbar, bis freigespielt (Regel in 2.3).**

**Status: bestätigt am 24.10.2026.** Das Datenmodell (2.1) ist Arbeitsgrundlage und wird mit Paket 3 (Bahn, Station)
und Paket 5 (Untergrund) ergänzt; Änderungen daran werden hier mit Datum nachgetragen. Ergänzt am 24.10. aus Runde 3
(mit Paket 5 und 6 bestätigt): Schlangenbereich mit Freiraum-Volumen, Baustelle mit Variante
(Verbinden, Durchbruch), Tunnel mit Schalter „Autoscroll zum Ausgang“, Wasser mit Schaltern (Schmuck, trägt Stützen,
Splash-Zone, Wasserfall), Räume mit „offen ab Stufe“. **Nachtrag 25.10.2026 (Etappe 2, von Florian bestätigt):** Die
Aufwertungsstufen aus 2.4 werden eine Tabelle der Zone (Stufe → Satz von Schaltern nach 3.1 mit Gurt, Kettenzugstärke
und Wagenvariante); ein Feld wählt die Stufe und kann einzelne Schalter überschreiben; die Kettenzugstärke ist die Höhe
über der Station in Metern, bis zu der die Kette zieht (Stufe „alles“ ohne Grenze); Streckenbudget und Höhenlimit
stehen je Feld.

## Paket 4: Levelziele, Sterne, Humor

### Florians Vorgaben (Runde 1)

- Wichtig sind Lernkurve, das Gefühl, etwas Kniffliges gelöst zu haben, und das Verständnis, welche Streckenführung
  funktioniert. Mehr **Physikrätsel** in die Ziele; vielleicht Umgebungselemente, die mit der Fahrt interagieren
  (Räder, Klappen, die durch die Fahrt gedreht oder geöffnet werden und Coins freilegen). Recherche und Vorschläge
  gewünscht.
- **Fangen** ist ein sehr cooles Ziel: der Wagen wirkt als Magnet und fängt Passagiere besser; Flug und Fangen in
  Zeitlupe in einer **Bild-im-Bild-Kamera**. **„Fliegt raus“ gibt es nicht mehr** als Ziel.
- **Coins** bleiben (sie geben die Form vor) und funktionieren ebenenübergreifend: nahe vorbei genügt, der Coin wird
  wie von einem Magneten angezogen; nicht zu leicht.
- In den meisten Leveln begrenzte Streckenlänge und Höhe. Der **erste Hügel hängt von der Kettenzugstärke** ab, die mit
  dem Fortschritt aufgewertet wird, beim Zeichnen sichtbar.
- Form der Bahn, Loopingzahl, Topspeed, Airtime (braucht bessere Gurte) sind gute Ziele. Tunnel-Meter gut.
  **Sprungschanzen**: Lücken in der Strecke, der Zug landet wieder auf den Gleisen, wenn es in etwa stimmt.
  Baustelle öffnen gut, aber nicht nur „Punkt verbinden“; Tunnel und Baustellen noch unentschieden (Paket 5).
- **Schlange versorgen ist kein Ziel**: je größer die Bahn, desto mehr Leute kommen und stehen an; sie jubeln, wenn die
  Bahn vorbeirauscht.
- Höchstens drei Ziele je Level, meistens zwei (Frage an die Session).
- Sterne: Recherche gewünscht. Egal, was man einsammelt: ein Ziel ist nur geschafft, wenn der Wagen ins Ziel kommt.
- **Sehr viel Humor.** Nicht übertrieben viel Scheitern; bei extremen Loopings und Kurven Nahaufnahmen der Passagiere im
  Bild im Bild (hysterisch schreiend, hin und her fliegend). Die Bahn soll nicht zu oft entgleisen, nicht frustrieren;
  wenn, dann richtig krass und lustig. Regeln dafür festlegen.

### Vorschlag 4.1: Zielarten-Katalog für das ganze Spiel (Entwurf)

Bisheriger Stand: 26 Zielarten in `src/levels/types.ts`, Auswertung in `src/levels/evaluator.ts` (statisch beim
Zeichnen oder nach der Fahrt). Mit Florians Vorgaben:

| Zielart | Art | Messung (auf der 3D-Bahn oder in der Fahrt) | Anzeige | Stand | Einführung |
|---|---|---|---|---|---|
| Ankunft | Pflicht immer | Zug kommt in der Station an | kein Chip, Ergebnisbild | bleibt | Zone 1 |
| Höhe ≥ | Form | höchster Punkt über dem Boden der Spur; Grenze durch Kettenzugstärke sichtbar | Chip, Lotlinie beim Zeichnen | bleibt | Zone 1, Level 1 |
| Drop ≥ | Form | größter zusammenhängender Höhenverlust | Chip, Maßband | bleibt | Zone 1 |
| Loopings ≥ | Form | Selbstkreuzungen der 3D-Kurve | Chip, Ring am Scheitel | bleibt | Zone 1 |
| Kurven ≥, Spuren ≥ | Form | Spurwechsel, befahrene Spuren | Chip | bleibt | Zone 1 |
| Strecke ≥ | Form | Bogenlänge | Chip | bleibt | Zone 1 |
| Strecke ≤ (Budget) | Grenze | Bogenlänge | Budget-Regler statt Ziel | wird Grenze | Zone 1 |
| Coins | Form/Weg | 3D-Abstand Wagen–Coin ≤ Fangradius, ebenenübergreifend, Magnetzug (4.4) | Chip n/m, Coins fliegen zum Wagen | bleibt, neu gebaut | Zone 1 |
| Tunnel-Meter ≥ | Welt | Bogenlänge der Bahn im Berg- oder Untergrundvolumen | Chip, Meterzahl läuft in der Fahrt | neu (ersetzt „Tunnel-Anzahl“) | Zone 1 |
| Baustelle öffnen | Welt/Rätsel | Anschluss verbunden; Variante: Durchbruch braucht Mindesttempo (4.2) | Chip, Freilegungs-Choreografie | neu | Zone 1 |
| Sprung ≥ x m | Rätsel/Form | Zug fliegt über eine Lücke und landet im Fangtrichter (4.3) | Chip, Flugbahn-Vorschau | neu | Zone 1, spät |
| Fangen ≥ n | Fahrgäste | Fahrgast fliegt heraus und wird von einem Wagen (Magnet) wieder gefangen (4.5) | Chip, Bild im Bild in Zeitlupe | bleibt, ausgebaut | Zone 1, spät |
| Element bedienen | Rätsel | Rad n-mal gedreht, Klappe geöffnet, Glocke angeschlagen (4.2) | Chip, Element animiert in der Welt | neu | Zone 1 (zwei bis drei Elemente) |
| Tempo ≥ | Fahrt | Höchstgeschwindigkeit | Chip nach der Fahrt | bleibt | Zone 1 |
| Airtime ≥ | Fahrt | Sekunden mit g < 0; braucht Gurt-Aufwertung | Chip nach der Fahrt | bleibt | Zone 1, nach Gurt |
| Launch / Kettenzug / Booster / Ohne Bremse | Ausrüstung | Startart oder Element benutzt | Chip | bleibt (Lehr-Level für neue Aufwertungen) | mit der Aufwertung |
| Splash | Welt | Durchfahrt durch Wasser | Chip | bleibt | Zone 1 (Bergsee) oder später |
| max. g ≤, min. g ≥ | Fahrt | Komfort oder Intensität | Chip nach der Fahrt | bleibt | später |
| Fahrzeit ≥ / ≤ | Fahrt | Sekunden | Chip | bleibt | später |
| Schleifen ≥ | Form | Rollen um die Fahrtrichtung; hängt von Entscheidung 4 (Wagen 3D) ab | Chip | später | nach Entscheidung |
| Bestimmtes Element n-mal | Form | Vorlagen und Sonderteile | Chip | bleibt | später |
| Alle an Bord | Fahrgäste | kein Fahrgast verloren (heutige Grundregel, jetzt als Zielart je Level) | Chip | neu (siehe 4.7) | wo das Level es verlangt |
| Fliegt raus | – | – | – | **weg** (Rauswurf bleibt ein Ereignis, kein Ziel) | – |
| Flug ≥ x m | – | – | – | weg als eigenes Ziel; denkbar als Bonus „gefangen nach ≥ x m Flug“ | Frage |
| Schlange | – | – | Ambiente: Schlange wächst mit der Bahn, jubelt | kein Ziel | – |

### Vorschlag 4.2: Interaktive Umgebungselemente (Physikrätsel) – Recherche und Übertragung

Recherche: Cut the Rope führt je Box ein neues Element ein (Blasen, Luftkissen, Stacheln, Spinnen, bewegliche
Haken, Funken, Zauberhüte als Teleporter, Sprungplattformen, Drehräder, die das Seil verlängern), Incredible Machine
und Contraption Maker arbeiten mit Zahnrädern, Flaschenzügen, Hebeln, Wippen, Trampolinen (über hundert Teile), Poly
Bridge hat eigene Sprunglevel mit Rampen und Hydraulik. Für ein Spiel, in dem der Zug das einzige bewegte Ding ist,
heißt das: Elemente, die **auf die Fahrt reagieren** (der Zug treibt sie an) oder **die Fahrt verändern**.

| Element | Auslöser und Physik | Was passiert | Rätseltyp | Alpen v1 |
|---|---|---|---|---|
| **Mühlrad / Wasserrad** | Zug streift die Schaufeln (Kontakt entlang eines Bogens), Rad dreht sich mit dem Impuls | nach n Umdrehungen öffnet sich eine Kiste oder Klappe mit Coins | Tempo und Höhe an einer Stelle | ja |
| **Tor mit Schalterplatte / Klappe** | Zug fährt über eine Platte oder drückt eine Klappe mit seinem Gewicht | Tor öffnet eine Höhle oder Coins für den zweiten Durchgang | Topologie: zweimal vorbei, Reihenfolge | ja (einfachste Form: Platte öffnet Tor) |
| **Kuhglocke** | Zug streift die Glocke | Klang, Haken, Schlange jubelt | Form und Höhe, lustig und billig | ja |
| **Durchbruchwand (Baustelle)** | Zug trifft die Wand mit Mindesttempo | Wand zersplittert, Tunnel offen (Freilegung aus dem Labor) | Energie: Höhe vorher richtig wählen | ja, als Baustellen-Variante (Paket 5) |
| **Sprungschanze** | Lücke in der Strecke, ballistischer Flug | Landung oder spektakuläres Scheitern (4.3) | Energie und Winkel | ja, spät |
| Windböe / Geysir | Luftstrom oder Fontäne schiebt den Zug | Energie dazu oder weg, Tempo-Rätsel | Energie | später (Physik am Zug) |
| Wippe / Zugbrücke | Zug kippt eine Wippe, die den Rückweg freigibt | bewegte Schiene | Topologie, Timing | später (bewegte Gleise, verwandt mit Kippschiene im GDD) |
| Lawine / Felsbrocken | Zug löst einen Fels, der eine Höhle öffnet | Spektakel, neuer Weg | Timing | später |
| Zustieg unterwegs | Wartende springen zu, wenn der Zug langsam genug vorbeikommt | mehr Fahrgäste, mehr Jubel | Tempo-Fenster | später (Frage) |

Empfehlung für die Alpen: Kuhglocke, Mühlrad, Tor mit Schalterplatte, dazu Sprungschanze und Durchbruch. Jedes
Element ist ein Typ im Elementkatalog (Position, Tiefe, Auslöse-Volumen, Zustandsmaschine, Animation), seine Messung
läuft als Ereignis in der Fahrtsimulation (wie heute Coins, Tunnel, Booster), seine Anzeige ist ein Chip plus die
Animation in der Welt. Rätsel entstehen aus Kombinationen: Rad braucht Tempo, Tempo braucht Höhe, Höhe ist durch den
Kettenzug begrenzt, also Drop vor dem Rad; Tor braucht zwei Durchgänge, also eine Schleife im Layout; die Schanze
braucht den richtigen Absprungwinkel.

### Vorschlag 4.3: Sprungschanze

- **Zeichnen:** Finger heben, dann ab mindestens 4 m Abstand zum offenen Ende weiterzeichnen; die Lücke wird zur
  Schanze, wenn der neue Strich in der Flugzone beginnt. Sonst gilt wie heute: offenes Ende mit Absperrband.
- **Physik:** Abflug mit Endgeschwindigkeit und Endtangente, ballistischer Flug (der Freiflug `flightSim` existiert).
  **Fangtrichter** bei der Landung: Vorderachse trifft die Landeschiene mit Abstand ≤ 1,5 m und Richtungsabweichung
  ≤ 25° → Einrasten mit Stoß, Funken, Kameraruck; sonst Entgleisen (richtig krass und lustig, siehe 4.7).
- **Vorschau:** nach dem Loslassen rechnet eine stille Vorab-Fahrt die Flugbahn und zeigt sie als gestrichelten Bogen
  mit Landemarke (grün passt, rot zu kurz oder zu steil). Nicht live während des Strichs, damit das Zeichnen flüssig
  bleibt.
- **Ziel:** „Sprung ≥ x m“ (Flugweite des Zugs) oder einfach Teil der Ankunft.
- Vorbilder: Poly Bridge (eigene Sprunglevel mit Rampen), RollerCoaster Tycoon (Zug fliegt, wenn Gleis fehlt, aber nur
  als Unfall). Ein Spiel mit „Lücke und wieder einrasten“ hat die Suche nicht gefunden; das ist ein eigenes Merkmal.

### Vorschlag 4.4: Coins mit Magnet

Heute: Coin zählt bei 2 m Abstand in der Spurebene. Vorschlag: 3D-Abstand (x, y, Tiefe) ≤ Fangradius 3,5 m, Tiefe
zählt voll (ebenenübergreifend), der Coin fliegt in 0,25 s zum Wagen (Kraft wächst mit der Nähe, wie in den
Magnet-Mechaniken von Endless Runnern), Pling. Nicht zu leicht: eine ganze Spur daneben (8,4 m) reicht nicht, eine
halbe schon. Radius je Level einstellbar. Coin-Gruppen bleiben Form-Hinweise (Reihe, Bogen, Ring, Säule wie heute).

### Vorschlag 4.5: Fangen mit Magnetwagen

Heute: ein fliegender Fahrgast wird gefangen, wenn er einen Wagen mit höchstens 9 m/s Relativgeschwindigkeit trifft
(`tryCatch`). Vorschlag: Fangtrichter um jeden freien Sitz (1,5 m), darin ein Sog zum Sitz, der die
Relativgeschwindigkeit dämpft; Treffer bei ≤ 12 m/s. Level mit Fangziel geben eine schwache Gurtstufe vor, damit
jemand fliegt; Rauswurf ohne Fangen bleibt ein Fehlschlag (Rückfrage). Flug und Fangen in Zeitlupe mit Bild im Bild.

### Vorschlag 4.6: Bild im Bild

| Option | Was | Kosten | Urteil |
|---|---|---|---|
| A: zweite 3D-Kamera (eigenes Rendertarget, als Fenster im HUD) | echte Nahaufnahme der Szene | zweiter Render-Durchgang je Bild, auf dem Handy zu messen | nur wenn B nicht reicht |
| **B: 2D-Kabine** (Wageninnenraum als gemalte Fläche, die Cut-out-Figuren groß darin, Pixi im HUD) | Nahaufnahme der Figuren: Kiefer klappt, Augen groß, Arme rudern, Figuren fliegen im Wagen umher | fast nichts | **Empfehlung**: passt zum South-Park-Stil, ist lustiger als eine Kameraaufnahme |

Auslöser: |g| über Schwelle (Looping, enge Kurve), Rauswurf und Fangen, Entgleisen; Dauer 1–2 s; Zeitlupe 0,3–0,5× auf
dem Hauptbild (das heutige Zeitlupen-System trägt das); Position oben, im Hochformat etwa ein Drittel der Breite.
Vorbild: die Zeitlupen-Unfallkamera von Burnout, die den Unfall aus mehreren Blickwinkeln zeigt.

### Vorschlag 4.7: Humor und Scheitern (Regeln, Entwurf)

- Entgleisen ist selten: großzügige Grenzen je Bahntyp, Schwachstellen-Marker beim Zeichnen (gibt es), Vorab-Fahrt
  warnt vor sicherem Entgleisen („hier zu schnell“), bevor man auf Testfahrt drückt.
- Wenn es passiert, ist es groß: Freiflug des Zugs (gibt es), Fahrgäste fliegen, Bild im Bild mit Gesichtern,
  Sticker, Kameraruck, Staub.
- Schreien ist kein Scheitern: hohe g lassen Fahrgäste kreischen und im Wagen herumfliegen (Bild im Bild), Ohnmacht ist
  kein Fehlschlag mehr (heute kostet sie den dritten Stern).
- Scheitern nur durch: Zug kommt nicht an (Entgleisen, Sprung verfehlt, offenes Ende) und Kollision im Schlangenbereich.
- **Rauswurf ohne Fangen (Empfehlung der Session, von Florian am 24.10. bestätigt):** kein Fehlschlag, sondern Sternverlust.
  Ein verlorener Fahrgast kostet den dritten Stern, mehr als die Hälfte verloren kostet auch den zweiten; der Zug muss
  ankommen. Wo ein Level es verlangt (Lehr-Level für einen neuen Gurt, Finale), gibt es die Zielart **„Alle an Bord“**
  als Pflichtziel; das ist die heutige Regel, aber als Daten je Level statt als Gesetz. Gründe: Fliegende Fahrgäste sind
  der Humor des Spiels, der Rauswurf ist dann ein Lacher und kein Neustart; der Gurt wird zum Weg zum dritten Stern
  statt zur Hürde; das Fangen bleibt die Rettung. Alternative (streng, wie heute): jeder ungefangene Rauswurf ist ein
  Fehlschlag; dann muss der Gurt früh stark sein, und Airtime-Level werden vorsichtig.

### Vorschlag 4.8: Sterne (Recherche und Optionen)

Recherche: Cut the Rope vergibt drei Sterne je Level und **sperrt die nächste Box über die Sternensumme** (30 Sterne für
die zweite Box auf dem Handy, rund 190 für die vierte); ein Level ohne Sterne gilt trotzdem als geschafft. Angry Birds
hat die Drei-Sterne-Logik populär gemacht: ein Stern fürs Bestehen, zwei für Besser, drei für Meisterschaft, Sterne
zählen hoch statt herunter. Kritik an solchen Systemen: ein oder zwei Sterne fühlen sich wie Trostpreise an, der
eigentliche Reiz liegt im dritten; und unklare Sternkriterien verwirren. Daraus drei Optionen:

| Option | Sterne bedeuten | Für | Gegen |
|---|---|---|---|
| **A: Prestige** (heute) | Schmuck auf der Karte, nichts gesperrt | kein Frust, Casual-Fluss Level für Level (Florians Vorgabe 3) | wenig Grund zum Wiederspielen |
| B: Sternensumme öffnet den nächsten Zonenabschnitt oder die nächste Zone | Wiederspielen lohnt | bewährt (Cut the Rope) | sperrt Spieler aus, die nur vorankommen wollen |
| C: Sternensumme öffnet Schmuck und Bonus-Level | Wagenlack, Fahnen, Figurenteile, ein Bonus-Level je Zone | Wiederspielen lohnt, niemand wird gesperrt | mehr Inhalt nötig |

Empfehlung: **A plus C**. Aufwertungen und Zonenfortschritt kommen über die Levelnummer (vorhersehbar), Sterne sind
Prestige und schalten Schmuck und ein Bonus-Level je Zone frei. Sternkriterien je Level klar: ★ alle Pflichtziele und
Ankunft, ★★ das Bonusziel, ★★★ ein benanntes „Meisterstück“ je Level (zum Beispiel unter dem Budget, ohne Bremse, alle
Coins) statt einer globalen „sauberen Fahrt“. Ein Ziel zählt nur, wenn der Wagen ankommt (Florians Regel).

### Vorschlag 4.9: Ziele je Level

Meinung der Session: ein Pflichtziel, das das Rätsel ist, dazu höchstens ein zweites Pflichtziel zur Form und höchstens
ein Bonusziel; Lehr-Level haben genau ein Ziel. Also meist zwei Chips, nie mehr als drei. Gründe: Platz oben auf dem
Handy, das alte Prinzip „ein neues Ding pro Level“, und die Vorbilder (Cut the Rope hat ein Ziel, die Sterne sind
optional). Florians „maximal drei, meistens zwei“ passt genau.

### Rückfragen zu Paket 4 (Runde 1b)

1. Welche Umgebungselemente zuerst? Empfehlung: Kuhglocke, Mühlrad, Tor mit Schalterplatte, dazu Sprungschanze und
   Durchbruch. Fehlt dir eines, das du im Kopf hast? **Beantwortet am 24.10.: passt (vorläufig).**
2. Rauswurf ohne Fangen: bleibt ein Fehlschlag, oder nur ein verlorener Stern? **Beantwortet am 24.10.: wie empfohlen,
   Sternverlust plus Zielart „Alle an Bord“ (4.7).**
3. Bild im Bild als 2D-Kabine mit den Figuren (Option B) statt zweiter Kamera: einverstanden? **Beantwortet am 24.10.: ja.**
4. Sterne: A plus C (Prestige, Schmuck, ein Bonus-Level je Zone), Fortschritt über die Levelnummer: einverstanden?
   **Beantwortet am 24.10.: ja.**
5. Sprungschanze schon in der Alpen-Zone (spät) oder erst in Zone 2? **Beantwortet am 24.10.: auf jeden Fall jetzt
   einbauen; ob sie erst in späteren Zonen genutzt wird, entscheidet das Leveldesign.**

**Status: bestätigt am 24.10.2026.** Offen bleibt nur, was ausdrücklich so markiert ist (Schleifen nach Entscheidung
4, Flugweite als Bonus-Variante, Zustieg unterwegs); das wird in Paket 3 und 6 geklärt.
**Stand 25.10.2026 (Etappe 1, Schritt 9):** Ziele lassen sich je Feld der Zone eintragen (Katalog v1 = die Zieltypen,
die der heutige Prüfer kennt: Ankommen, Höhe, Coins, Loopings, Kurven, Tunnel, Startarten, Booster, Airtime, Tempo,
Länge, Zeit, Schrauben, g-Kräfte, Splash, Spuren, ohne Bremse, Drop, Abflug, Fangen, Flugweite; Stern = Bonusziel) und
werden im aktiven Feld live wie im Level gewertet. Platzhalter: die Rätselziele aus 4.2 (Glocke, Mühlrad, Tor, Sprung,
Durchbruch), Magnet-Coins und das Fangen mit Bild-im-Bild kommen in E2 und E3; die Zieleingabe ist eine Textzeile.

## Paket 1: Weltrenderer (Technik gesetzt, Einordnung als Etappe 1)

Die Technik steht in `docs/RICHTLINIE.md` (Abschnitt 2, 3, 5, 6, 12, 13) und wird hier nicht neu verhandelt: Three.js
als Weltrenderer mit geneigter Perspektivkamera (18 Grad, Zoom als Kamerafahrt, vertikale Streckung), PixiJS 8 für
HUD, Sticker, Karten-Overlay und Zeichen-Overlay im selben WebGL-Kontext, Tiefenpuffer statt Masken, eine Shadow Map
(1024², abschaltbar), Umfärben und Looks per Shader, Untergrund als Erdschnitt mit Räumen, Ziel 60 fps auf dem Handy,
Draw Calls unter 150, DPR höchstens 2. Schritt 1 (Strich als Strahl hinter `?persp=1`) ist gebaut.

**Was neu entsteht (`src/world/`):** Szene und Kamera-Adapter, Boden und Erdschnitt, Kulissen (Fläche, Dreiteiler,
Säule mit Tiefenvolumen, Höhlenkasten, Wasser, Portal), Bahnprofile der vier Typen aus dem Bahnmodell, Stützenfamilien
(instanziert), Wagen (3D-Platzhalter), Station, Licht, Schatten, Nebel, Looks, Funkeln, Partikel, Freilegung, der
Klötzchen-Editor. **Was ersetzt wird:** `src/render/worldView`, `terrainRenderer`, `trackRenderer`, `trainRenderer`,
`supports`. **Was bleibt:** `src/track/*`, `src/physics/*`, `src/levels/*` (Datenmodell wird zur Zone erweitert),
`src/core/*`, Figuren-Definitionen, Karten-Logik, Pixi-HUD.

**Tore:** 100-Punkte-Test (die 3D-Bahn liegt auf dem Bühnen-Strich, Richtlinie 2.1), `npm run strokes:replay` ohne neue
Tiefenfehler, Handy-Messung mit allen vier Bahntypen (60 fps Ziel, Holz unter 150 Draw Calls), Standbilder der
Basiszone, keine Fehler in der Browserkonsole. Spanne: Etappe 1 (Paket 10).

**Status: bestätigt am 24.10.2026** (mit Paket 10).

**Stand 24.10.2026, Etappe 1, Schritt 1 gebaut** (Branch `etappe-1-weltrenderer`; Technik in `docs/TECH.md` 4e und 4f):
`src/world/` mit Renderer im geteilten Kontext, Kamera-Adapter, Boden und Erdschnitt, Schalter `?world=1`. Gelernt:
1. Pixi und Three teilen den Kontext mit `resetState` je Bild wie dokumentiert, aber Pixi setzt die Löschfarbe nach dem
   Reset nicht neu: Three muss sie transparent lassen, sonst sind Pixis Filter-Texturen deckend schwarz (Risiko „zwei Renderer
   im selben Kontext“ aus Paket 11: gefunden und behoben, die Szenarien prüfen das Bild am Tor 1a).
2. Die Perspektive aus Schritt 1 der Richtlinie rechnete die Spur-Ebenen bildparallel; die echte geneigte Kamera skaliert
   zusätzlich mit der Höhe über dem Kameraziel (bei 10 m und D = 170 m rund 2,6 %). `toView` und `rayToWorld` sind jetzt die
   exakte Kamera, die Spur-Container der Bühnendarstellung korrigieren jeden Punkt nach; der Pinsel deutet den Strich also
   genau so, wie der Weltrenderer ihn zeigt.
3. Kantenglättung: Die Richtlinie nennt `antialias: false`, Labor und Spiel liefen bisher mit Glättung (auch Florians
   Handy-Messung im Labor). Der Kontext startet mit Glättung, `?aa=0` schaltet sie ab; am Tor 1a wird beides gemessen, Florian
   entscheidet.
4. Boden als Höhenfeld zeigt Hügel je Spur als Terrassen (so rechnet die Physik); ob der Boden der Basiszone je Spur oder
   als Fläche beschrieben wird, klärt das Zonen-Datenmodell (Paket 2, Schritt 6/7).
5. Im Übergang bleiben Schienen, Stützen, Zug, Berge und Wasser in Pixi über der Welt: ohne Tiefenpuffer scheint eine Bahn
   hinter einem vorderen Hügel bis Schritt 2 durch, Berge und Wasser liegen in Perspektive bis zu ein paar Pixel neben dem
   Boden (bis Schritt 4).
6. Replay mit Perspektive nach dem Umbau: 261 Aufnahmen, Pinsel 87 von 250 Fahrten geschafft (vorher mit der bildparallelen Näherung 88, ohne Perspektive 90), kein Fehler, die Ausfallgründe verteilen sich wie vorher.
7. Schritt 2 (24.10.): Straße und Stahl als Profile entlang des Bahnmodells mit der Schräglage der Bühnen-Schienen,
   Wagen-Platzhalter mit Sitzen, Licht aus dem Labor. Gelernt: Ein Wagen aus Einzelteilen kostete 16 Zeichenaufrufe (drei
   Wagen fast die Hälfte des Budgets); als eine Geometrie mit Farbe je Ecke ist es einer. Bahn und Zug: 108 Zeichenaufrufe
   mit Pixi-HUD und Pixi-Stützen am Mac, 120 fps. Replay `--world`: 250 Bahnprofile aus den Aufnahmen gebaut, keine ungültigen Werte, Abstand der Bahnknoten zum Strich im Median 2,3 px (bei 17 px/m etwa 14 cm: die Fit-Toleranz des Pinsels).
8. Schritt 3 (24.10.): Holz und Hängebahn als Profile, vier Stützenfamilien als Instanzen (je Familie höchstens fünf
   Zeichenaufrufe; Holzbahn mit Böcken 96 Zeichenaufrufe statt 469 Einzelteile im Labor), Füße über Fundamentflächen statt
   Alpha-Scan (Terrain als erstes Fundament, Wasser trägt nicht; Kulissen melden ihre Flächen in Schritt 4 und 7 über
   Metadaten). Gelernt: Die Hängebahn braucht im Spiel den Tragbalken über der Bahnlinie (die Physik fährt auf der Linie,
   die Gondel hängt darunter am Balken), nicht wie im Labor die Bahnlinie als Balken; der Fuß wird unter der Bahnlinie
   gesucht, nicht unter dem Anschluss, sonst gilt eine niedrige Bahn als schwebend statt als zu kurz. Replay `--world` mit
   Stützen: 250 Bahnprofile und 7410 Stützen aus den Aufnahmen gebaut, keine Stelle ohne Fundament (flache Level), keine ungültigen Werte; Abstand der Bahnknoten zum Strich bei 191 neuen Strichen im Median 2,0 px, Maximum 159 px (Knoten des Rundenschlusses, der bis 10 m neben dem Strich liegen darf).
9. Schritt 4 (24.10.): Kulissen-Platzhalter nach 8a.1 mit Tiefenpuffer (Kulisse, Dreiteiler, Säule, Höhlenkasten,
   Wasser, Wasserfall, Portal), Berge der Level als Dreiteiler mit Öffnungen an den Tunnelportalen (die Bahn fährt hinter
   der Lippe, verdeckt ohne Maske: Richtlinie 3 bestätigt sich im Spiel), Seen als Wasserflächen, die Füße sperren; Licht,
   Shadow Map (1024², Kasten folgt der Kamera, `?shadow=0`), Schattenfänger, Nebel und vier Looks als Module, Umfärben
   auf allen Flächen (`?look=`). Lesarten-Knopf und Spur-Filter sind raus (Paket 7, Entscheidung 7). Gelernt: Ein
   Dreiteiler braucht keine Seitenwände (die Silhouette läuft am Rand auf den Boden aus; Wände ragten als Klingen über
   den Berg); der Himmel liegt noch in Pixi und folgt nur dem Nacht-Level, nicht dem Look (Nachtrag für Schritt 4 der
   Richtlinie: Himmel in die Welt, sobald ferne Kulissen kommen). Level 32 mit Bahn durch den Berg: 106 Zeichenaufrufe,
   120 fps am Mac. Replay `--world`: unverändert (250 Profile, 7410 Stützen, Median 2,0 px, kein Fehler).
10. **Tor 1a, erste Runde (25.10., Florians Handy-Test aller Links):** 3D-Optik und Schatten machen es besser. Zwei
    Befunde: (a) Die Hängebahn passte nicht, weil der Balken 2,4 m über dem Strich lag; **Regel von Florian: Der Strich
    muss immer genau da sein, wo gezeichnet wird.** Behoben: Der Balken liegt auf dem Strich, die Gondel hängt
    `HANG_DROP` = 2,4 m darunter (Welt und Bühnen-Fahrgäste versetzt, Pinsel hält 3,2 m Abstand zum Boden, Stützen suchen
    den Fuß unter der Gondel). (b) Die Berge waren nicht verständlich. Befund beim Nachstellen: Ein Berg ohne feste Spur
    (Level 32) war ein einziger 41 m tiefer Dreiteiler; im geneigten Bild liegt seine Vorderseite zehn Meter unter der
    Rückseite, die Bahn schwebte sichtbar dazwischen, und der Tunnel war nicht zu sehen. Behoben: Ein solcher Berg steht
    wie auf der Bühne als Scheibe je Spur gestaffelt (zu drei Zeichenaufrufen verschmolzen), jede Scheibe mit den
    Öffnungen der Bahn ihrer Spur; die Tunnelmünder bekommen eine dunkle Scheibe hinter dem Ring. Die gedimmt sichtbare
    Bahn im Berg kommt mit den Fels-Regeln in E2 (Paket 5.2).
    **Tor 1a bestanden (Florian, 25.10.):** Leistung am Handy reicht, Kantenglättung bleibt an (jederzeit per `?aa=0`
    nachjustierbar), die Berge sind als Platzhalter eingeordnet (Dreiteiler-Prinzip bleibt, Form, Farbe und Staffelung
    kommen aus den Bildern der Basiszone). Regel aus dem Tor für alle Stände: Platzhalter immer dazusagen
    (`docs/HANDOVER.md`, Abschnitt 5). Weiter mit Schritt 6. Replay `--world` nach den Fixes: 306 Bahnprofile (Florians Handy-Striche vom 25.10. sind aufgezeichnet, 261 → über 300 Aufnahmen), 8835 Stützen, 64 Stellen ohne Fundament (neue Aufnahmen über Wasser), Median 2,0 px, kein Fehler.

11. Schritt 6 (25.10.): Zonendatei Version 1 und Klötzchen-Editor Stufe 1 (`docs/TECH.md` 4g): Palette der Platzhalter
    aus 8a.1, Setzen, Ziehen in der Spur-Ebene, Tiefe und Maße per Tasten, Löschen, Bahntyp der Zone, Speichern über den
    Dev-Server, Hot-Reload bei jeder Änderung der Datei, Tab zum Spielen in der Zone. Gelernt: Vites eigener Wächter lädt
    bei Änderungen unter `public/` die ganze Seite neu, darum ein eigener Wächter für `public/zones` mit Ereignis an
    das Spiel; ein Three-Linienrahmen (ein Pixel) ist als Auswahl kaum zu sehen, der Rahmen ist ein Pixi-Kasten um die
    projizierte Hülle. Platzhalter: alle Klötzchen, ihre Maße und Farben. Replay `--world` unverändert grün (322
    Aufnahmen mit Florians Handy-Strichen, 9185 Stützen, Median 2,0 px, kein Fehler).
12. Schritt 7 (25.10.): Metadaten je Platzhalter nach 2.1 und 8a.1 (Fundament, Öffnungen, Anschluss, Wachstumsstufe,
    Tiefenrolle) in Datei und Editor, Felder als Rechtecke in Zonenkoordinaten mit weicher Kamerabegrenzung (Rückstoß
    nach dem Ziehen), Zoom-Grenze „Feld passt ins Bild“ und Absperrband an den Rändern; `docs/TECH.md` 4g. Gelernt: Die
    Taste F war schon das Dev-Overlay (Effekte), darum schaltet Enter ein Feld aktiv; Wachstumsstufe und Tiefenrolle
    bleiben bis Schritt 9 reine Daten. Platzhalter: die Öffnung ist ein Kreis, die Oberkante tragfähig als Ganzes; beides
    ersetzen die Metadaten der gemalten Teile (Fundament-Polygon, Öffnungsvolumen). Replay `--world`: 343 Aufnahmen, 9579 Stützen, Median 2,0 px, kein Fehler.
13. Schritt 8 (25.10.): Stationsanker mit Richtung und Vorgabestück (Plan 3.3; im Spiel beginnt die Bahn am Stück, jeder
    Strich setzt sie fort, Löschen stellt es wieder her), Häuschen mit Drehkreuz und Geländer, Hebel als Platzhalter;
    Schlangenbereich mit Eingangsrichtung, sechs Figuren und Freiraum-Volumen (6.3); Baustellen-Marke mit Variante
    Verbinden oder Durchbruch und Mindesttempo (5.1); Coin-Gruppen in vier Formen als Coins der Bühne (4.4). Gelernt: Vier
    Platzhalter aus Einzelteilen kosteten mit Schatten über hundert Zeichenaufrufe; verschmolzen zu einer Geometrie je
    Platzhalter sind es vier. Platzhalter: alle Formen und Farben; Startart-Knopf, Freiraum-Anhebung, Durchbruch und
    Magnet-Coins kommen in E2 und E3. Replay `--world`: 364 Aufnahmen, 10162 Stützen, Median 2,0 px, kein Fehler.
14. Schritt 9 (25.10.): Ziele je Feld (Katalog v1: die Zieltypen des heutigen Prüfers, als Zeile mit Typ, Wert und Stern
    für Bonus; 4.1), Fortschrittsstufe je Feld (Elemente mit größerer Wachstumsstufe fehlen in diesem Level; 2.1) und
    Aufwertung je Feld (heute die Gurtstufe; 2.4), Testfahrt-Knopf im Editor (gewähltes Feld aktiv, Spielen, Fahrt),
    Prüfzone mit Determinismus-Test (Lesen und Schreiben ergeben dieselbe Datei) und Szenario 10 als Standbild-Test in
    der CI. Gelernt: Ohne Ziele bleibt die Zone Sandkasten mit Maßband, mit Zielen verhält sie sich wie ein Level; so
    prüft Florian ein Feld, ohne ein Level anzulegen. Platzhalter: Zieleingabe als Textzeile im Browser-Dialog; die
    Rätselziele (4.2), Magnet-Coins und Fangen kommen in E2 und E3, die Fähigkeiten als Schalter (2.4) in E2. Replay `--world`: 382 Aufnahmen, 10695 Stützen, Median 2,0 px, kein Fehler.
15. Tor 1b, erste Rückmeldung (25.10.): Beim Bauen des Testausschnitts fehlten das Verschieben der Öffnung und die Dicke
    des Dreiteilers; nachgerüstet als Alt+Pfeile (Öffnung, Shift fein), Plus und Minus (Radius) und Shift+Pfeile
    links/rechts (Dicke von Dreiteiler, Höhlenkasten, Wasser). Gelernt: Jede Code-Änderung lädt die Editor-Seite am Mac
    neu, ungesicherte Einträge gehen dabei verloren; gespeicherte Zonen kommen per Hot-Reload zurück.
16. Tor 1b bestanden (25.10.): Florian hat den Testausschnitt (Station, Hügel, Fenster-Element, Baustelle) selbst gebaut,
    das Handy zeigt dasselbe. Seine Fragen dabei (Tunnel an Seite und Front, organischer Boden, Höhlen mit Lagen) sind
    mit Antwort in Paket 8a festgehalten, mit seiner Korrektur: gemaltes Teil gegen 3D-Teil mit gemalter, per Shader
    umgefärbter Textur bleibt offen und wird an der Stilprobe je Stelle getestet. Etappe 1 abgeschlossen, Pull Request
    nach `main`.

## Paket 10: Etappen und Abnahmen (Vorschlag aus allem Bestätigten)

### Grundsätze

- Erst die Basiszone als Werkstatt mit Platzhaltern, dann der Look auf einem Feld (Stilprobe), dann der Alpen-Satz,
  dann Generator und Prüfer, dann der Neonpark als Nachweis. Keine Teile in Menge vor der Stilprobe.
- Jede Etappe hat ein Tor mit vier Prüfungen: Handy-Messung (Ziel 60 fps, Draw Calls unter 150), Replay grün
  (`npm test`, Szenarien, `npm run strokes:replay`), Standbilder im Hochformat vom Handy, Florians Freigabe nach
  eigenem Spielen. Ohne Freigabe beginnt die nächste Etappe nicht; parallel laufen nur Florians eigene Arbeiten.
- **Kein Kalender** (Florian, 24.10., Nachtrag): Florian fängt direkt an und macht, so viel er schafft. Die Etappen
  sind eine Reihenfolge mit Toren, keine Wochen; die Größen in der Tabelle sind grobe Vergleichsgrößen (S, M, L)
  für den Umfang, keine Zusagen. Zur Einordnung: Die Richtlinie schätzte den schmaleren Umfang auf fünf bis acht
  Arbeitswochen; mit Editor, Figuren, UI-Werkstatt, Karte, Generator und zweiter Zone ist es etwa das Doppelte.
- Florians Parallelarbeiten (jederzeit, nicht im Tor): Figurenteile in zwei Ansichten, Entwurf der Alpen-Autos,
  Varianten je Zone, Handy-Tests am Ende jeder Woche, Entscheidungen an den Toren, Figma-Konto für den Generator,
  falls die Session diesen Weg wählt (8b.1).

### Die Etappen

| Etappe | Inhalt | Ergebnis | Tor | Umfang | Braucht |
|---|---|---|---|---|---|
| **E1 Weltrenderer und Klötzchen-Editor** | Three-Szene hinter Schalter, Pixi-HUD im Kontext, Kamera 18 Grad, Boden, Erdschnitt, Kulissen-Platzhalter mit Tiefenpuffer, vier Bahnprofile, Stützenfamilien instanziert, Wagen-Platzhalter, Licht, Schatten, Nebel, Looks aus dem Labor; Editor Stufe 1 (Platzhalter, Metadaten, Felder, Station, Baustelle, Coins, Zonendatei, Testfahrt); Lesarten-Knopf und Spur-Filter raus | Basiszone-Datei v0 mit einem Testfeld, vom Editor geschrieben | 100-Punkte-Test, Replay grün, Handy 60 fps mit Holz unter 150 Draw Calls, Florian baut selbst einen Testausschnitt, Handy zeigt dasselbe | M (Arbeitsschritte unten) | Richtlinie, Labor |
| **E2 Bahn und Welt** | Fähigkeiten als Schalter (3.1), Startarten sichtbar (Platzhalter), Aufwertungen als Daten, Station mit Vorgabestück, Häuschen, Hebel und Richtung, Schlangenbereich mit Freiraum und Platzhalter-Figuren, Feld mit Kamerabegrenzung, Fels-Regeln (Öffnungen, Baustellen, Stop-Hinweis), Baustellen in zwei Varianten mit Freilegung, Räume mit „offen ab Stufe“, Autoscroll-Schalter, Wasser mit Schaltern, Fortschrittsstufe mit Looks, Kettenzuglinie | Basiszone v1: alle Bahn- und Weltfähigkeiten mit Platzhaltern spielbar | Checkliste je Fähigkeit in je einem Feld, Replay grün, Handy 60 fps, Florians Spieltest | M | E1 |
| **E3 Ziele, Rätsel, Humor** | Zielarten-Katalog v1 auf der 3D-Bahn, Magnet-Coins, Tunnel-Meter, Sprungschanze mit Fangtrichter und Vorab-Fahrt, Fangen mit Magnetwagen, Bild im Bild als 2D-Kabine, Glocke, Mühlrad, Tor mit Schalterplatte, Durchbruch, Sterne A plus C mit „Alle an Bord“, Humor-Regeln (Entgleisen selten und groß), Bug-Backlog (Stabilität, Schräglage automatisch, Strichintelligenz, Bahnende, Kreuzungstausch ins Bogenmenü), 150 Level als Inhalt raus | Basiszone v2: jedes Ziel und jedes Element in einem Feld erlebbar | Prüfer-Vorstufe: jedes Ziel einmal erfüllt im Replay, Handy 60 fps auch mit Vorab-Fahrt und Bild im Bild, Florians Spieltest mit Fokus Humor | M | E2 |
| **E4 Stilprobe** | Stützen-Werkstatt (drei Wege, Hybrid gegen Florians Studien), UI-Werkstatt (drei Varianten, Florian wählt), Funkeln-Shader, Stilproben-Satz (10 bis 15 Teile über das Figma-Konto mit Prüfung), Florians erste Figurenteile mit Farbmasken im Rig, Looks Tag, Abend, Nacht; ein Feld der Basiszone komplett ohne Platzhalter; Vergleich je Stelle: gemaltes Teil gegen 3D-Teil mit gemalter, per Shader umgefärbter Textur (Florian, 25.10.) | Stilprobe: ein Feld im Alpen-Look, Art Direction v2 als Dokument (ersetzt `docs/ART.md`) | Standbild vom Handy neben Bild 15 und 04, Stützen je Familie neben der Studie, UI-Variante gewählt, Handy 60 fps mit Shadow Map und Funkeln, Florians Freigabe | M (parallel zu E3 möglich, sobald der Erzeugungsweg steht) | E1, Florians Teile, Erzeugungsweg |
| **E5 Alpen-Satz, Figuren, Karte** | Alpen-Satz (50 bis 70 Teile in Familien) ersetzt die Platzhalter der Basiszone, Katalog und KTX2, Figuren-Editor Stufe 1, Schlange mit Florians Figuren, Wagen Stufe 2 (Alpen-Autos nach Florians Entwurf, Holzzug und weitere über Generator und Meshy), Karte als ein Rad mit Sektoren, Miniaturen und Symbolen, Morph Schritt 1, Boden formen im Sandkasten | Basiszone komplett im Alpen-Look, Karte und Morph laufen | Zone komplett ohne Platzhalter, Morph-Video vom Handy ohne Sprung bei 60 fps, Replay grün, Prüfung „Platzhalter ohne Teil“ leer, Florians Freigabe | L | E3, E4, Florians Wagenentwurf |
| **E6 Generator und Prüfer** | Rezepte als Layout-Grammatiken, Seeds, Kandidaten im Editor, Lösungsbahn je Level, Prüfer in der CI, Zonen-Bundles mit Vorladen, Speicher-Messung | Zehn Kandidaten-Level in der Basiszone, vom Prüfer bestanden | CI grün mit Prüfer, Handy 60 fps und Speicher im Rahmen, Florian nimmt zehn Kandidaten an oder ändert sie | M | E5 |
| **E7 Neon-Freizeitpark** | Zweite Zone nur aus Daten, Neonpark-Satz, Looks Nacht und Neon mit Neon-Nebel, Glühen, Punktlichtern, eigene Stützen- und Stationsvarianten, Kostüme, höchstens ein neues interaktives Element; jede nötige Code-Änderung wird als Befund gegen das System notiert und behoben; danach Morph Schritt 2 mit Florian | Zweite Zone spielbar, Liste der Befunde, Morph-Animation final | Zone ohne neuen Engine-Code (Ausnahmen gelistet), 60 fps, Prüfer grün, Florians Freigabe | L | E6, Neonpark-Satz |
| **E8 Übergabe ans Leveldesign** | Dokumentation von Editor, Katalog, Generator, Prüfer; Florian beginnt die Startzonen neu | Übergabe | Florian baut eine Zone ohne Hilfe der Session | S | E7 |

### Etappe 1 in Arbeitsschritten (Reihenfolge, ohne Kalender)

Jeder Schritt endet mit `npm test`, `npm run build` und dem Replay; nach Schritt 5 und nach Schritt 10 steht ein Tor
mit Florian. Die Session arbeitet auf einem eigenen Branch und geht am Tor per Pull Request nach `main`
(`docs/HANDOVER.md`, Abschnitt 4).

1. Three-Szene hinter Schalter im Spiel (`?world=1`), Pixi-HUD im selben Kontext mit Zustands-Reset je Bild,
   Kamera-Adapter (18 Grad, Kamerafahrt, vertikale Streckung), Boden und geschlossener Erdschnitt; 100-Punkte-Test
   aus der Richtlinie als Vitest.
2. Bahnprofile Straße und Stahl als Meshes aus dem echten Bahnmodell, Wagen-Platzhalter als 3D-Körper mit Sitzen,
   Kamera folgt; Replay mit `--world`.
3. Bahnprofile Holz und Hängebahn, vier Stützenfamilien aus dem Labor als Instanzen (Holz unter 150 Draw Calls),
   Füße über Fundamentflächen statt Alpha-Scan.
4. Kulissen-Platzhalter (Fläche, Dreiteiler, Säule, Höhlenkasten, Wasser, Portal) mit Tiefenpuffer; Licht, Shadow
   Map, Nebel, Looks als Module; Lesarten-Knopf und Spur-Filter raus.
5. **Tor 1a:** Handy-Messung mit Florian (alle vier Typen), Standbilder, Fixes; Ziel 60 fps, Replay grün, Konsole leer.
6. Editor-Modus (`?editor=1`) am Mac: Platzhalter setzen, ziehen, in der Tiefe schieben, löschen; Zonendatei speichern
   und laden; Hot-Reload.
7. Metadaten je Platzhalter (Fundament, Öffnung, Anschlüsse, Wachstumsstufe, Tiefenrolle), Level-Feld aufziehen mit
   Kamerabegrenzung und Absperrband, Zoom-Grenze.
8. Stationsanker mit Richtung, Vorgabestück, Häuschen-Platzhalter und Hebel; Schlangenbereich mit Freiraum und
   Platzhalter-Figuren; Baustellen-Marke; Coin-Gruppen.
9. Testfahrt aus dem Editor, Ziele je Level eintragen (Katalog v1, statische Ziele live), Fortschritts- und
   Aufwertungsstufe wählen; Prüfung: Zonendatei lädt deterministisch, Standbild-Test.
10. **Tor 1b:** Florian baut selbst einen Testausschnitt (Station, Hügel, Fenster-Element, Baustelle); das Handy zeigt
    dasselbe; Fixes; Doku in `docs/TECH.md` und `docs/HANDOVER.md`; Pull Request nach `main`.

**Stand:** Schritte 1 bis 4 gebaut am 24.10.2026, Tor 1a bestanden am 25.10.2026, Schritte 6 bis 9 gebaut am 25.10.2026 (Nachträge in Paket 1); Tor 1b bestanden am 25.10.2026, Etappe 1 abgeschlossen, Pull Request nach `main` gestellt.

**Florian parallel zu Etappe 1:** den Erzeugungsweg für Teile mit der Session prüfen (Voraussetzung für E4), erste
Figurenteile in zwei Ansichten skizzieren, Entwurf der Alpen-Autos, Handy-Tests an den Toren, Entscheidungen an den
Toren.

### Etappe 2 in Arbeitsschritten (Reihenfolge, ohne Kalender; von Florian bestätigt am 25.10.2026)

Jeder Schritt endet mit `npm test`, `npm run build` und `npm run strokes:replay -- --world` (die Aufnahmen liegen nur im
Haupt-Checkout, der Worktree liest sie über den Pfad); Prüfzone und Szenario 10 wachsen mit jedem Schritt. Drei Tore:
2a nach den Bahn-Fähigkeiten, 2b nach Fels und Untergrund (Florian probiert Freilegung und Kamera aus), E2 am Ende.
Branch `etappe-2-bahn-und-welt` von `main` (Pull Request 4 gemerged). Alles Sichtbare bleibt Klötzchen bis zur Stilprobe.
Aus der E2-Zeile ist in Etappe 1 schon da: Station mit Vorgabestück, Häuschen, Hebel und Richtung, Schlangenbereich mit
Figuren und Freiraum-Volumen (ohne Wirkung), Baustellen-Marke mit Variante (ohne Verhalten), Feld mit Kamerabegrenzung,
Gurtstufe je Feld. Lücken am Code: In der Zone ist alles frei, jeder Strich abseits der Bahn wird zum Berg; der Pinsel
kennt die Zonenelemente nicht (die Bahn fährt durch jeden Klotz, Wasser sperrt nur Füße); die Startart ist das kleine
Symbol über dem ersten Knoten; Höhlenkästen unter dem Boden stehen unsichtbar hinter dem geschlossenen Erdschnitt.

1. **Fähigkeiten als Schalter, Aufwertungen als Daten** (3.1, 2.4, 2.1): Zonendatei mit Tabelle Stufe → Satz von
   Schaltern (Kettenzug, Launch, Hydro, Pendel, Vertikallift, Booster, Bremse, Splash, Launch-Block, Rolle, Tunnel
   erlaubt, Gurt 0–4, Kettenzugstärke, Wagenvariante); ein Feld wählt die Stufe, überschreibt einzelne Schalter und
   trägt Streckenbudget und Höhenlimit. Regal, Startarten, Gurt und Bergbauer folgen den Schaltern; „Boden formen“
   bleibt aus (7.5). Platzhalter: Vorbelegung der Stufen, Texteingabe im Editor.
2. **Startarten sichtbar, Startart-Knopf am Hebel** (3.5, 3.3): Kette von der Station bis zum Kettenende, Launch-Band
   mit Lichtern (26 m), Hydro-Band mit Dampf-Marke, Pendel-Puffer, Vertikallift-Turm, in den Maßen der Physik; der
   kleine Chip wird in der Zone zum großen Knopf am Hebel des Häuschens (Tipp wechselt durch die erlaubten Startarten,
   Name kurz groß; ein Menü kommt mit der UI-Werkstatt, E4). Platzhalter: alle Formen und Farben.
3. **Kettenzuglinie, Kettenzugstärke, Wagenvariante** (2.4, 7.4): Stärke je Stufe = Höhe über der Station, bis zu der
   die Kette zieht (Stufe „alles“ ohne Grenze); gestrichelte Linie beim Zeichnen; endet die Kette unter dem Gipfel,
   bleibt der Zug stehen und die Probefahrt meldet „Kette reicht nicht“. Wagenvariante als Datum je Stufe
   (Platzhalter: Farbe der Klötzchen-Wagen).
4. **Tor 2a** (Handy): Schalter, Startarten, Hebel-Knopf, Kettenzuglinie im Probefeld; Florian entscheidet, ob die
   Startart-Platzhalter bis zur Stilprobe reichen und der Knopf verständlich ist; 60 fps, Replay grün, Fixes.
5. **Fels-Regeln** (5.1, 5.2): Festigkeitsfeld aus den Zonenelementen (Dreiteiler fest mit Innenraum als Kanal nur durch
   Öffnungen, Säule fest, Höhlenkasten mit festen Wänden und freiem Raum, Erdschnitt fest außer in Räumen); der
   Tiefenlöser nimmt die freie Seite vor oder hinter dem Fels, Öffnungen führen hindurch, sonst rot mit Hinweis „Fels“
   und Ende der Bahn davor; kein Fuß im Fels; Tunnel-Meter in Öffnungen und Innenraum; Bahn im Fels gedimmt sichtbar;
   Prüfstriche in der Prüfzone als Test. Platzhalter: runde Öffnungen, Klötzchen.
6. **Baustellen in zwei Varianten mit Freilegung** (5.1, Richtlinie 4): Verbinden mit Choreografie aus dem Labor und
   Öffnung im Festigkeitsfeld; Durchbruch nur in der Fahrt (Wand zersplittert bei Mindesttempo, sonst endet die Fahrt
   davor), Vorab-Fahrt und Zielart in E3; Baustelle mit Ziel-Element und Öffnungsradius als Daten. Platzhalter: Staub,
   Splitter, Farben, Dauer.
7. **Untergrund und Looks** (5.2, 2.1, 2.3, Richtlinie 6): Erdschnitt als Element mit Tiefe unter dem Boden, Räume
   „offen ab Stufe“ hinter dem Deckel, durch Baustellen geöffnete Räume bleiben in späteren Stufen offen; Tabelle
   Stufe → Look (Tag, Abend, Nacht, Neon), der Himmel folgt dem Look; Regel 2.3 als Hinweis im Editor. Platzhalter:
   Schichten-Textur, Look-Werte.
8. **Tor 2b** (Handy): Fels-Hinweis, beide Baustellen, Freilegung mit Kamera, Räume ab Stufe, Looks je Stufe; Florian
   entscheidet Dauer und Kamera der Freilegung und die Looks; 60 fps mit Shadow Map, Replay grün, Fixes.
9. **Schlange mit Freiraum, Tunnelkapsel mit Autoscroll-Schalter** (6.3, 5.2, 5.3): Bahn über dem Freiraum angehoben,
   weich ein- und ausgeleitet, tief darunter frei, Stützen außerhalb; Tunnel als Paar von Öffnungen mit vorgefertigter
   Kapsel, mit Schalter fährt die Kamera zum Ausgang und der Strich geht dort weiter; Florian probiert beides.
   Platzhalter: Figuren, Kapselform.
10. **Wasser mit Schaltern** (5.4): Schmuck, trägt Stützen (Füße bis zum Grund mit Wellenring), Splash-Zone (Eintauchen,
    leichtes Bremsen, Fontäne, Zielart Splash; ohne Schalter bleibt Wasser Fehlschlag); der Wasserfall bleibt eigenes
    Element mit „Fahrt dahinter gedämpft“. Platzhalter: Ring, Fontäne, Band.
11. **Basiszone v1, Prüfzone, Doku:** Entwurf der Basiszone v1 als Checkliste mit einem Feld je Fähigkeit durch die
    Session, Florian baut ihn im Editor um (Inhalt bleibt seine Entscheidung); Prüfzone mit jeder neuen Eintragsart,
    Szenario 10 prüft Fels-Stop, Freilegung, Anheben und Schalter, Standbilder je Feld; Doku komplett.
12. **Tor E2:** Checkliste je Fähigkeit in je einem Feld, Replay grün, Handy 60 fps und unter 150 Zeichenaufrufen im
    vollsten Feld, Standbilder im Hochformat, Florians Spieltest, Fixes, Pull Request nach `main`.

Nicht in E2 (laut Plan später): Sprungschanze, Rätselelemente, Magnet-Coins, Fangen, Bild im Bild (E3); Stützen-Werkstatt
und Funkeln (E4); Boden formen (nach der Stilprobe); Graben Stufe 2 (eigenes Tor). Florians Antworten auf die sechs
Rückfragen der Session (25.10.): alle Empfehlungen angenommen (drei Tore; Durchbruch in E2 nur in der Fahrt; Wasserfall
bleibt eigenes Element; Entwurf der Basiszone v1 durch die Session; Startart-Knopf wechselt per Tipp; Kettenzugstärke
als Höhe über der Station).

**Stand:** Arbeitsschritte bestätigt am 25.10.2026, Schritt 1 begonnen.

### Rückfragen zu Paket 10

1. Spannen und Reihenfolge so annehmen, mit der Stilprobe parallel zu E3, sobald der Figma-Weg steht? **Ja (24.10.);
   „Figma-Weg“ heißt jetzt: der gewählte Erzeugungsweg aus 8b.1. Nachtrag: Die Spannen in Wochen und der Tagesplan
   sind gestrichen, Florian arbeitet ohne Kalender; Reihenfolge und Tore bleiben.**
2. Sollen E2 und E3 zu einer Etappe „Basiszone“ mit einem Tor nach vier Wochen zusammenfallen, oder bleibt das
   Zwischentor nach zwei Wochen (Empfehlung: Zwischentor, damit der Spieltest früher kommt)? **Zwischentor bleibt
   (Florian folgt der Empfehlung, 24.10.).**

**Status: bestätigt am 24.10.2026.**

## Paket 11: Risiken und Grenzen (Vorschlag)

| Risiko | Wo | Gegenmaßnahme | Tor |
|---|---|---|---|
| Füllrate auf dem Handy bei vielen großen halbtransparenten Kulissen | E1, E5 | DPR höchstens 2, Kulissen auf Inhaltsgrenzen schneiden, opaker Kern per Alpha-Test, schmaler Blend-Rand, Shadow Map 1024² abschaltbar | Messung jede Etappe |
| Speicher (Texturen, Räume, zweite Zone) | E5, E7 | KTX2 (UASTC) ab E5, Atlanten je Zone, Master höchstens 2048, Bundles je Abschnitt mit Vorladen und Entladen | Speicher-Messung E6 |
| Zwei Renderer im selben Kontext | E1 | Zustands-Reset je Bild, Texturen getrennt, Szenarien prüfen Konsole und Bild | Tor 1a |
| Zeichnen in Perspektive bringt Tiefenfehler | E1, E3 | Replay gegen alle Aufnahmen je Etappe, Fels-Regeln und Freiraum über den Tiefenlöser, Kreuzungstausch als Rückfall | Replay grün |
| Vorab-Fahrt (Schanze, Durchbruch, Entgleis-Warnung) kostet beim Zeichnen | E3 | nur nach dem Loslassen, mit Zeitbudget, abschaltbar | Handy-Messung E3 |
| Graben entwertet Tunnelrätsel oder frisst Zeit | nach E7 | Stufe 2 nur in markierten Grabzonen und nur nach einem Labor-Test; Fels bleibt fest | eigenes Tor |
| Figurenzahl (Schlange, Zug, Bild im Bild) | E2, E5 | Deckel zwölf in der Schlange, Cut-outs als Instanzen, Bild im Bild in 2D | Messung E3, E5 |
| Editor-Oberfläche frisst die Etappe | E1 | Stufe 1 nur mit Maus und Tastatur ohne Politur, Pixi-HUD vorhanden, Florian testet am Ende der Woche | Tor 1b |
| Figma-Weg läuft nicht aus der Session | E4 | Rückfall: Florian erzeugt aus demselben Auftragstext; Prüfung und Nacharbeit bleiben bei der Session | vor E4 |
| Teile sind nicht pixelgenau, Nacharbeit wächst | E4, E5 | automatische Prüfung je Teil, Kontaktbogen, Deckel: zwei Durchläufe je Teil, dann Florian oder Platzhalter bleibt | je Satz |
| Florians Teile und Entwürfe kommen später als die Etappe | E4, E5 | Platzhalter bleiben spielbar; die Stilprobe wartet, der Rest nicht | Tor E4 |
| Humor kippt in Frust (Entgleisen, Rauswurf) | E3 | Regeln aus 4.7, Spieltest mit Fokus Humor, Zahlen aus dem Replay (Entgleisquote je Typ) | Tor E3 |
| Die UI-Werkstatt verliert sich im Verrückten | E4 | drei Varianten, feste Grenzen (Treffer, Lesbarkeit in einer Sekunde), Florian wählt in einer Sitzung | Tor E4 |
| Morph „sauber“ ohne Maßstab | E5 | messbare Kriterien aus 12.2, Video vom Handy, Schritt 2 erst nach Freigabe | Tor E5 |
| Neonpark braucht doch Code | E7 | jede Änderung als Befund gegen das System, zuerst Daten und Shader-Presets versuchen | Tor E7 |

**Nicht in diesem Plan (bewusst später):** Audio, Store-Builds, Community und Teilen, Spine, Windböe und Wippe,
Lawine, Zustieg unterwegs, Graben Stufe 2 (nur nach Test), Rolls und Schrauben vor den finalen Wagen, der Inhalt der
Veröffentlichung (Startzonen überarbeitet Florian nach E8 neu).

**Status: bestätigt am 24.10.2026.**

## Paket 3: Achterbahn-Features – Bahntypen, Aufwertungen, Startarten, Station, Stützen

### Bisheriger Stand (Gedächtnisstütze für Runde 2)

- **Vier Bahntypen im Labor** als Profil entlang der 3D-Kurve mit eigener Stützenfamilie (Richtlinie 3a): Straße
  (Betonplatte 3,4 m, Asphalt, Mittellinie, Brüstung; brutalistische Betonpfeiler, ab 7 m mit Fenster), Stahl (zwei
  cremefarbene Rohre, orange Schwellen, blaues Rückgrat; Rohrpylon, ab 10 m A-Bock), Holz (Schichtholz unter
  Flachstahl, Handlauf; Böcke aus schrägen Pfosten, verzweigt, „verrückt“ als Regler), Hängebahn (Tragbalken oben,
  Gondeln 1,1 m darunter; Betonportale, die abwechselnd vor und hinter der Bahn über den Balken greifen). Füße per
  Alpha-Scan auf Kulissen, Höhlenboden oder Boden; „schwebend“ markiert. Holz hat 469 Draw Calls und wird instanziert.
- **Florians Studien** in `refs/traumacoaster-gpt explore/bahn und strecke/`: zehn Bahnen mit Gleisen, drei Pfeilern,
  Station, Eingang mit Schlange und Wagen in drei Detailgraden (01 Alpenautobahn: Straße 3,5 Wagenbreiten, Betonpfeiler
  mit Fenster, Rennwagen, Beton-Station mit geschwungenem Dach, Drehkreuz und Geländer; 02 Betonbumerang: Beton-U-Profil,
  Blockpfeiler mit Fenster; 03 Schirmwald-Express: Holzgleis mit Schwellen, Holzwagen wie Boote, Holzstation mit
  Schirmdach; 05 Wolkenschaukel: blauer Tragbalken, hängende Gondeln, geschwungener Betonarm; dazu 04 Dornenmine, 06
  Sternenfalter, 07 Vulkanwalze, 08 Eisblitz, 09 Dampfkarussell, 10 Mondjahrmarkt) und Einzelstudien: Wandkonsole,
  fliegender Ausleger, schiefer Doppelbock, Fachwerkbrücke, Doppelportal, S-Bogen Holz, Beton-S, Beton-V, Breite,
  Rohrschiene mit Fachwerkträger, Fahrwerk, Holz-Hügel, Stahl-S-Kurve.
- **Startarten im Code:** Kettenzug (die Kette hält das Tempo), Launch (26 m, 12 m/s²), Hydro, Pendel, Vertikallift;
  Elemente Booster, Bremse, Splash, Launch-Block. Richtlinie 3: Kettenzug als Kettenmesh, Launch als farbiges Band mit
  Lichtern, Hängebahn mit Tragschiene. Befund vom Testtag: das Startart-Symbol über der Station wird nicht als Knopf
  erkannt.
- **Gurte:** fünf Stufen (keine, Beckengurt 0,6 g, Bügel 1,5 g, Schulterbügel 3 g, Rennsitz 5 g); nach Paket 4 ist der
  Gurt eine Aufwertung der Zone und der Weg zum dritten Stern.
- **Station heute:** Bahnsteig, zwei Pfosten, Dach, Fahne, an der ersten Bahnprobe gezeichnet. Florians Vorgabe K15:
  Bahnstart vorgegeben und etwas länger, Zughäuschen, Schlange davor, die mit der Bahnlänge wächst.
- **Wagen:** Seitenansichten (Labor: vier Wagenbilder); Entscheidung 4 offen (2D oder 3D, entscheidet über Rolls).
- **Stützenplaner heute:** eine Form je Welt (zehn Formen), feste Abstände, nicht im Berg, Füße symmetrisch; prüft kein
  Wasser (Befund: Stützen im See). Richtlinie 3: Kaskade Fuß → Deckenaufhängung → Brücke → Anlehnen → markieren.

### Florians Vorgaben (Runde 2)

- Keine Reihenfolge der Aufwertungen jetzt: Wie und wann etwas erscheint, entscheidet das Leveldesign, wenn die
  Elemente stehen. In der Basiszone soll **alles gehen**: alle Launch-Arten, alle Aufwertungen, alle vier Bahntypen.
- Wagen grundsätzlich als 3D-Körper mit gemalten Flächen. Die Wagen in den Studien sind noch nicht weit; für die Alpen
  will Florian kleine getunte Autos, die er noch entwirft; der Holzzug und andere Wagen entstehen später mit GPT und
  Meshy.
- Station als Anker im Level (der Spieler verschiebt sie nicht); die Schlange steht je Level dort, wo es zum Abschnitt
  am besten passt.
- Stützen bleiben automatisch, sollen aber cool und gemalt aussehen wie in den Studien; das wird gesondert entwickelt.
- Erst einmal baut die Session alles mit einfachen Formen, die wir dann durch die finalen Grafiken ersetzen.

### Vorschlag 3.1: Fähigkeiten statt Reihenfolge

Jede Fähigkeit der Bahn ist ein Schalter, den ein Level setzt (die Aufwertungsstufe aus 2.4 ist dann nur ein
benannter Satz solcher Schalter, den das Leveldesign später füllt). Die Basiszone kann alles; der Editor schaltet je
Level um.

| Fähigkeit | Holz | Stahl | Autobahn | Schwebebahn | Stand |
|---|---|---|---|---|---|
| Bahnprofil | Schichtholz, Flachstahl | zwei Rohre, Schwellen, Rückgrat | Betonplatte, Asphalt, Brüstung | Tragbalken, Gondelhänger | Labor, alle vier |
| Stützenfamilie | Böcke, Doppelbock, Fachwerkbrücke, Konsole, Ausleger | Rohrpylon, A-Bock, Fachwerkträger | Betonpfeiler mit Fenster, Beton-S, Blockpfeiler, Wandkonsole | Betonportal, Arm | Labor je eine Familie; Studien liefern die weiteren (3.4) |
| Wagen | Boot-Wagen | kompakter Zug | getunte Autos (Florian) | Gondeln | Platzhalter-3D zuerst (3.2) |
| Kettenzug | ja | ja | ja | ja (Hänger) | Code; Kettenmesh neu |
| Launch, Hydro, Pendel, Vertikallift | ja | ja | ja | ja | Code; sichtbare Form neu (3.5) |
| Booster, Bremse, Splash, Launch-Block | ja | ja | ja | ja (Splash als Gischt unter den Gondeln) | Code; Darstellung je Typ neu |
| Gurte 0–4 | ja | ja | ja | ja | Code |
| Schleifen, Schrauben | mit 3D-Wagen möglich | ja | ja | nein (Gondeln hängen) | Roll-Handle existiert; braucht 3.2 |
| Sprungschanze (Paket 4) | ja | ja | ja | nein | neu |
| Brücken über Wasser | Fachwerkbrücke | Fachwerkträger | Bogen zwischen Pfeilern | Portalreihe | Kaskade aus Richtlinie 3 |
| Kollisionsverbot im Schlangenbereich | ja | ja | ja | ja | neu (Paket 6) |

### Vorschlag 3.2: Wagen

3D-Körper mit gemalten, unbeleuchteten Flächen (Richtlinie 9: 3D nur dort, wo ein Volumen von mehreren Seiten zu sehen
ist; der Wagen ist der Fall). Stufe 1: Platzhalter je Typ (farbige Klötze mit Rädern oder Hänger, richtige Maße,
Sitzplätze), damit Physik, Rollwinkel, Pendeln der Gondeln und Fahrgäste als Cut-outs im Wagen laufen. Stufe 2: finale
Modelle, Alpen-Autos nach Florians Entwurf, Holzzug und weitere mit GPT und Meshy, mit gemalter Textur ohne
realistisches Licht. Tor: Stilprobe mit allen vier Typen in der Basiszone.

### Vorschlag 3.3: Station

Anker im Level mit Position, Spur und Richtung (links nach rechts oder umgekehrt), Vorgabestück gerade, Länge als
Parameter (Start bei 14 m), Häuschen-Platzhalter mit Drehkreuz und Geländer wie in den Studien, Startart-Wahl als
großer Knopf am Vorgabestück (Befund: das kleine Symbol wird nicht erkannt). Der Schlangenbereich ist ein eigenes
Element, das der Editor je Level platziert; die Schlange wächst mit der Bahnlänge (Paket 6).

### Vorschlag 3.4: Stützen-Werkstatt (gesondert, mit eigenem Tor)

Automatische Platzierung mit der Kaskade aus Richtlinie 3 (Boden, Kulisse, Felskonsole, Decke, Brücke, Ausleger,
sichtbar markieren) und einem „Verrückt“-Regler je Zone. Für den gemalten Look drei Wege, die im Labor nebeneinander
gebaut und gegen Florians Studien gehalten werden:

| Weg | Was | Für | Gegen |
|---|---|---|---|
| A: Geometrie aus Code mit gemalten Texturen | Pfosten, Riegel, Bögen als Meshes, Holzmaserung und Beton als Kacheln | skaliert mit jeder Höhe, instanzierbar, billig | Formen bleiben technisch, wenig „Pinsel“ |
| B: gemalte Teile zusammengesetzt | Pfosten, Riegel, Laschen, Füße, Konsolen als Bilder aus einem Teile-Bogen, je Stütze gesteckt | sieht gemalt aus wie die Studien | Teile für alle Höhen und Winkel, viele Draw Calls |
| **C: Hybrid** | Tragwerk aus Code (A), Füße, Kapitelle, Laschen, Fenster, Konsolen als gemalte Teile (B) | gemalter Eindruck dort, wo das Auge hinschaut, Rest skaliert | zwei Pipelines je Familie |

Empfehlung: C. Tor: jede Familie neben Florians Studie als Standbild aus dem Labor, Florian gibt sie frei; Messung
auf dem Handy mit dem Holz-Typ (heute 469 Draw Calls, Ziel unter 150 mit Instanzen).

### Vorschlag 3.5: Startarten sichtbar

Kettenzug als Kettenmesh auf dem ersten Anstieg (die Kettenzugstärke zeichnet beim Zeichnen die erreichbare Höhe als
Linie, Paket 4), Launch als farbiges Band mit Lichtern auf dem Vorgabestück, Hydro als stärkeres Band mit Dampf,
Pendel als Station mit Durchfahrt und Puffern beidseits, Vertikallift als Turm mit Plattform; zuerst alle als
Platzhalter mit richtigen Maßen.

### Rückfragen zu Paket 3 (Runde 2b)

1. Station in beide Richtungen (links nach rechts oder rechts nach links) als Eigenschaft des Ankers: einverstanden?
   **Ja (24.10., kein Widerspruch bei der Festschreibung).**
2. Stützen-Werkstatt mit Weg C als Start: einverstanden? **Ja (24.10.).**

**Status: bestätigt am 24.10.2026.**
**Stand 25.10.2026 (Etappe 1, Schritt 8):** Stationsanker mit Richtung und Vorgabestück (14 m, offene Pinsel-Bahn,
jeder Strich setzt sie fort) sind im Editor und im Spiel; Häuschen und Hebel als Platzhalter; der große Startart-Knopf,
die sichtbaren Startarten (3.5) und die Fähigkeiten als Schalter kommen in E2. Schritt 9 (25.10.): Die Aufwertungsstufe
je Feld ist heute die Gurtstufe (Taste U im Editor, `upgrade` in der Zonendatei), ein Platzhalter für die Schalter aus 2.4.
**Nachtrag 25.10.2026 (Etappe 2, von Florian bestätigt):** Der Startart-Knopf am Hebel wechselt per Tipp durch die
Startarten, die das Feld erlaubt (Name kurz groß eingeblendet); ein Auswahlmenü kommt mit der UI-Werkstatt (E4). Die
Startarten aus 3.5 werden in Etappe 2 als Platzhalter in den Maßen der Physik gebaut (Schritte 2 und 3 in Paket 10).

## Paket 8a: Teile und Elemente

### Bisheriger Stand (Gedächtnisstütze für Runde 2)

- **Vorhanden:** 34 Labor-Teile als WebP (Himmel, Gipfel, Schneegrat, Vorberg, Wald, See, Wolken, Wiesen, großer
  Bogen, Felsfenster, Doppelbaum, Silberbaum, Portal, Tunnelstein, Höhlenfüllungen, Höhlenterrasse, Wasserfall,
  Wasservorhang, Lichtschacht, Nebel, Büsche, Pflanzenfächer, Gras-Kappe, Stationsdach, Kristall, vier Wagen) und der
  Elemente-Bogen mit rund 139 PNG (Büsche, Höhlendecken, -säulen, -füllungen, -böden, -wände, Wolken, Vorberge, Wald,
  See, Wiesen, Gipfel, Ufer, Himmel, Schneegrate, Nebel, Grasränder, Haine, Lichtschächte, Pfeilerteile, Portale in
  sieben Materialien mit Vorder- und Schrägansichten, Felsen, Wurzeln, Geheimnisse, Bäume, Wasser, Wasserfälle).
  Alle hart freigestellt, ohne Rückwand-Lippe-Schnitt und ohne Fundament-Metadaten (Richtlinie 11).
- **Richtlinie 12.4:** Baum mit Fenster, Fels mit Tunnel und Portal als Dreiteiler produktionsfertig, bevor der große
  Auftrag startet; Startumfang 50–70 Teile (Richtlinie 11); ein Teil je Bild, transparent, Metadaten je Teil, neutrale
  Palette, Umfärben per Shader (Richtlinie 9).
- **Alpen-Visuals:** 15 Alpenkurve (Straße, Tanne, Gipfel, Tunnel im Fels, Erdschnitt), 18 (Hochformat), 21 Alpenrausch
  (Station mit Schlange, Tunnel im Berg, Höhlen mit Wasserfällen), 27 (Hochformat Unterwelt), 31 Wasserfallkehren, 50
  Bergsee-Panorama.
- **Offen bei Florian:** Entscheidung 3 (welche Referenzen eingefroren werden, ob die S-förmigen Elemente stilistisch
  final sind) und Entscheidung 8 (welche Teile erzeugt werden: die Session legt eine Liste mit Begründung und
  Reihenfolge vor, eingefroren wird sie nach Florians Antwort).

### Florians Vorgaben (Runde 2)

- Es geht nicht um die Zone Alpen, sondern um eine **Basiszone**, die alles haben soll, was eventuell kommen kann;
  allgemein gehalten, zuerst mit Platzhaltern, die ersetzt werden, sobald Form, Zuschnitt und Position bekannt sind.
- Erst einmal baut die Session alles mit einfachen Formen; die finalen Grafiken kommen danach.
- Welche Referenzen der verbindliche Maßstab für Bahn, Station und Stützen sind, muss erst herausgefunden werden.

### Vorschlag 8a.1: Der Elementkatalog als Platzhalter-Satz

Jeder Elementtyp aus 2.1 bekommt einen Platzhalter mit richtigen Maßen und seinen Metadaten; die Session baut sie in
den Klötzchen-Editor (Paket 2, Stufe 1). Was den Platzhalter später ersetzt, steht daneben; die konkrete Grafikliste
(Entscheidung 8) entsteht aus der Basiszone, nicht vorher.

| Typ | Platzhalter | Parameter | Metadaten | Ersatz später |
|---|---|---|---|---|
| Kulisse | farbige Fläche mit Beschriftung | Breite, Höhe, Tiefe | Tiefenrolle | gemaltes Bild |
| Dreiteiler | Rückwand-Fläche, Innenraum-Kasten, Lippen-Fläche mit Loch | Öffnung, Tiefe des Innenraums | Öffnungsvolumen, Fundament-Polygon | Bild in drei Teile geschnitten |
| Säule, Stamm | Zylinder | Radius, Höhe | Tiefenvolumen (bleibt unsichtbar) | gemalter Stamm, Zylinder bleibt |
| Fundamentfläche | Streifen | Länge, Neigung | tragfähig | kommt mit dem Bild |
| Höhlenkasten | Kasten mit offener Front | Maße | Boden tragfähig, Decke als Aufhängung | vier gemalte Flächen |
| Wasserfläche, Wasserfall | blaue Fläche, senkrechtes Band | Maße | Stützen verboten, Splash-Zone | Shader plus Bild |
| Portal, Tunnelmund | Ring | Öffnung | Anschlussachse | gemaltes Portal |
| Station | Plattform-Kasten, Häuschen-Kasten | Länge, Richtung | Anker | Mesh plus gemalte Teile |
| Baustelle | Marke mit Absperrband | Anschlussachse, Durchbruch-Energie | – | Freilegungs-Shader |
| Schlangenbereich | Streifen mit Reihenfolge | Länge, Richtung | Kollisionsverbot | Figuren (Paket 6) |
| Interaktives Element | Scheibe (Rad), Platte (Klappe, Schalter), Kugel (Glocke) | Auslöser, Zustände | Auslöse-Volumen | gemalte Teile, Animation |
| Coin-Gruppe | Kugeln | Form (Reihe, Bogen, Ring, Säule) | Fangradius | Coin-Grafik |
| Lichtquelle, Partikelquelle, Nebelband | Gizmo | Farbe, Stärke | – | Shader |
| Feldrand | Rechteck | – | – | Absperrband |
| Deko | Fläche ohne Funktion | Maße | – | Bild |
| Stütze | automatisch (Paket 3) | – | – | Stützen-Werkstatt |

### Vorschlag 8a.2: Vom Platzhalter zur Grafik

Ablauf je Teil: Platzhalter in der Basiszone steht → Form, Zuschnitt und Position sind geprüft (Kamera an allen
Grenzen, Bahn durch die Öffnung, Stützen auf dem Fundament) → Auftrag mit Maßen, Tiefenrolle und Prompt (Paket 8b) →
Grafik oder Modell → ersetzt den Platzhalter über seinen Namen. Die eingefrorenen Referenzen (Entscheidung 3) werden
in Paket 0 über die Stilprobe gefunden, nicht vorab festgelegt.

**Status: bestätigt am 24.10.2026.** Die Grafikliste (Entscheidung 8) folgt aus der Basiszone und wird hier mit Datum
nachgetragen, sobald die Platzhalter stehen.

**Nachtrag 25.10.2026 (Florians Frage aus Tor 1b):** Tunnel sollen wie in den Referenzen auch an der Seite und vorn im Berg
sitzen, der Boden und die Höhlen sollen organische Formen mit vielen Lagen und Tiefe haben; Frage, ob ein Berg später ein
Teil mit echter Tiefe und Seitenansicht (Meshy) sein kann. Antwort der Session: Tunnelmünder an Flanke und Front sind
gemalte Öffnungen mit Öffnungsvolumen (Richtlinie 3; heute Platzhalter-Kreise in der Lippe und automatische Portale); der
Boden ist ein Höhenfeld je x und Spur mit gemalten Rändern (heute flach, weil die Zone noch kein Gelände hat; „Boden
formen“ in E5); Überhänge und Höhlen kommen aus gemalten Teilen in vielen Tiefenlagen (Höhlenkasten als Platzhalter,
später vier gemalte Flächen plus Höhlenteile; Untergrund als Ameisenfarm, Paket 5). **Florians Korrektur (25.10.):**
Die Begründung, Meshy-Modelle beleuchteten sich realistisch und brächen den gemalten Look, ist gestrichen; die
Meshy-Modelle aus den GPT-Earle-Teilen fand er sehr gut, und eine gemalte Textur lässt sich mit Shadern umfärben und so
anpassen. Ob an einer Stelle ein gemaltes Teil oder ein 3D-Teil mit gemalter Textur besser aussieht, bleibt offen und
wird an der Stilprobe (E4) je Stelle getestet, zum Beispiel ein Hero-Fels mit Tunnel in beiden Bauweisen nebeneinander
auf dem Handy. Die Richtlinie trägt den Nachtrag in den Abschnitten 0, 3 und 9.

## Paket 6: Figuren, Schlange, Fahrgäste

### Bisheriger Stand (Gedächtnisstütze für Runde 3)

- **Florians Vorgaben (K14, Runde 1 und 2):** Charaktere im Originalstil, der GPT-Baukasten trifft den Stil, funktioniert
  als Baukasten aber schlecht; detailreich, einfach animiert nach South Park (Terrance und Phillip: der Kiefer klappt);
  Figuren stehen in der Zone Schlange, die Schlange wächst mit der Bahn und jubelt, wenn die Bahn vorbeirauscht;
  im Schlangenbereich darf die Bahn nicht mit Figuren kollidieren; der Schlangenbereich wird je Level frei platziert.
- **Aus Paket 4 und 3 (bestätigt):** Fangen mit Magnetwagen, Bild im Bild als 2D-Kabine mit den Figuren, Rauswurf ohne
  Fangen kostet Sterne, Zielart „Alle an Bord“; Fahrgäste als Cut-outs in 3D-Wagen; Schlange ist Ambiente, kein Ziel.
- **Richtlinie 8:** Eigenbau-Cut-out datengetrieben: Teile-Slots (Kopf, Frisur, Oberteil, Hose, Schuhe), Ersatzsets
  (Münder, Hände, Augen), Kopf zweiteilig mit Pivot an der Mundlinie, Clips (Stehen, Staunen, Jubel, Ducken, Schlange
  rücken), Statemaschine mit Auslösern Abstand, Tempo, Entgleisen; Spine nur bei Bedarf.
- **Heute im Spiel:** Animator mit Clips idle, talk, wave, hop, scared, scream, dizzy, faint auf 12 Schritten je Sekunde,
  Kopf klappt an der Mundlinie; Figur aus Beinen, Armen, Rumpf mit Unterkopf und Mund, Oberkopf mit Augen, Brauen,
  Haaren, Hut; Figuren-Editor (Idle, Tipp erschreckt, Speichern winkt); Fahrgäste als Ragdoll aus sechs Teilen in der
  Wagenwanne, Pupillen und Mund folgen den g-Kräften, zwei je Wagen; GDD 11.2: Teile wählen, Hautton, Logo als Foto,
  bis 16 eigene Figuren, Auswahl, wer mitfährt.
- **GPT-Bögen** (`refs/traumacoaster-gpt explore/character/`): drei Figuren mit Teilen (Kappe, Frisuren, Augenpaare,
  Münder mit Kiefer, Oberteile, Arme, Hosen, Schuhe); große Köpfe, riesige Augen, Kiefer als eigenes Teil; Maßstäbe
  uneinheitlich, Teile berühren sich (Richtlinie 8). Florians Bahnstudien zeigen fünf Figuren je Eingang am Drehkreuz.
- **Entscheidung 6 (Übergabe):** Florians Figurenbogen als Vorlage für das Rig.

### Florians Vorgaben (Runde 3)

- Figurenbogen: Florian macht einige Teile mit verschiedenen Kleidern, Frisuren und Accessoires; die Session färbt sie
  später über Shader ein und baut daraus einen richtigen Charakter-Editor. Bis dahin reicht die Platzhalter-Figur mit
  den Proportionen aus den Bahnstudien.
- Animation wie vorgeschlagen (Cut-out, zwölf Schritte je Sekunde, klappender Kiefer; Reaktionen in Schlange und Wagen).
- Schlange wie vorgeschlagen, vielleicht später mehr Figuren. **Ein Strich durch die Schlange soll nicht gehen; wenn
  er doch dort landet, baut die Bahn immer eine Brücke oder Erhöhung, so dass die Schlange nie getroffen wird.**
- Der Figuren-Editor bleibt grundsätzlich und wird stark ausgebaut; der genaue Editor kommt, wenn die ersten Teile da
  sind. Frage: braucht es wie bei South Park mehr Ansichten als frontal und schräg?
- Zwei Fahrgäste je Wagen, gemischt; gespeicherte eigene Figuren werden bevorzugt.
- **Die Visuals sind feste Stilvorlage, so werden die Figuren aussehen,** vielleicht etwas flacher und einfacher
  schattiert. Der Oberkiefer sitzt auf dem Unterkiefer auf, der obere Schädel ist in Kiefer und Kopf gesteckt.

### Vorschlag 6.1: Rig und Ansichten

- **Proportionen:** wie in den Visuals und Bahnstudien, Kopf etwa ein Drittel der Körperhöhe, riesige Augen, Figuren
  übergroß, der Kopf ragt über den Wagenrand.
- **Teile:** Unterkiefer mit Mundboden, fest am Rumpf; **Oberschädel** (Augen, Brauen, Frisur, Kopfbedeckung) steckt auf
  dem Kiefer und klappt um ein Scharnier am hinteren Ende der Mundlinie (Terrance und Phillip); Rumpf mit Oberteil;
  zwei Arme als starre Streifen an der Schulter; zwei Beine mit Hose und Schuhen; Ersatzsets für Münder, Augen, Hände.
  Jeder Slot nimmt Florians Teile auf; Hautton, Stoff und Haar werden über eine RGB-Maske je Teil per Shader gefärbt
  (Richtlinie 6; die Session legt die Masken an, Florian malt wie gewohnt farbig).
- **Ansichten, Antwort auf Florians Frage:** South Park arbeitet mit vier und mehr Ansichten je Figur, weil die Figuren
  frei im Raum stehen und laufen. Unsere Welt ist eine Seitenansicht mit leichtem Blick von oben, die Figuren stehen
  in der Schlange und sitzen im Wagen. Darum reichen zuerst **zwei Ansichten**: Dreiviertel (Schlange und Wagen, für
  die andere Richtung gespiegelt) und frontal (Editor und Bild im Bild). Eine reine Seitenansicht kommt nur dazu, wenn
  die Dreiviertel im Wagen nicht liest. Jedes Teil braucht also zwei Fassungen, nicht vier.
- **Platzhalter:** Die Session baut die Figur zuerst aus einfachen Formen in diesen Proportionen mit allen Slots, so
  dass Schlange, Wagen, Fangen und Bild im Bild laufen, bevor Florians Teile da sind.

### Vorschlag 6.2: Animation und Reaktionen

Cut-out auf zwölf Schritten je Sekunde ohne Zwischenwerte (wie heute). Clips in der Schlange: Stehen (Atmen,
Blinzeln), Nachrücken (Hüpfer), Jubel (Arme hoch, Kiefer auf), Ducken, Erschrecken (Kiefer weit, Augen groß), Winken.
Im Wagen: Sitzen, Schreien, Arme hoch, Haare und Kleidung im Fahrtwind (einfache Kette), Benommen und Ohnmacht als Gag
ohne Spielfolge, Flug und Fangen. Eine kleine Statemaschine schaltet nach Abstand und Tempo der Bahn, g im Wagen,
Rauswurf, Fangen, Entgleisen. Das Bild im Bild zeigt die Kabine frontal.

### Vorschlag 6.3: Schlange mit Freiraum

- Der Schlangenbereich ist ein Element je Level (Paket 3). Regel: eine Figur je zehn Meter Bahn, Deckel zwölf, beides
  Parameter der Zone (Florian will vielleicht mehr). Beim Start gehen die Fahrgäste durchs Drehkreuz in den Zug.
- Reaktionen: Jubel, wenn die Bahn näher als zwölf Meter mit Tempo vorbeirauscht; Ducken unter vier Metern.
- **Freiraum statt Verbot:** Der Schlangenbereich trägt ein Freiraum-Volumen (Vorschlag: fünf Meter hoch über der
  Schlange). Ein Strich, der hinein zielt, wird nicht abgelehnt; die Bahn wird dort auf die Freiraum-Höhe angehoben und
  weich ein- und ausgeleitet, die Stützen stehen außerhalb des Bereichs (Kaskade aus Richtlinie 3: Brücke). Tief unter
  der Schlange (Tunnel) darf die Bahn durch. Damit kann es in der Fahrt keine Kollision mehr geben; ein Fahrgast, der
  in die Schlange fliegt, ist ein Gag, kein Fehlschlag.

### Vorschlag 6.4: Figuren-Editor

Bleibt und wird ausgebaut, auf der Grundlage von GDD 11.2: Teile je Slot wählen, Farben über die Shader-Maske,
Logo als Foto aufs Oberteil, bis 16 eigene Figuren, Auswahl, wer mitfährt. Stufe 1 mit Florians ersten Teilen:
Slots und Farbwahl, Vorschau als lebende Figur. Stufe 2: mehr Teile und Accessoires, Posen, Vorschau in der Kabine.
Tor: Florian baut sich und drei Freunde in zwei Minuten nach.

### Vorschlag 6.5: Wer fährt mit

Zwei je Wagen, gemischt aus dem Figuren-Pool der Zone; gespeicherte eigene Figuren füllen die Wagen zuerst, der Rest
kommt aus dem Pool; die Reihenfolge im Zug ist die Reihenfolge in der Schlange.

### Rückfragen zu Paket 6 (Runde 3b)

1. Zwei Ansichten (Dreiviertel und frontal) als Start: einverstanden? **Ja (24.10.).**
2. Freiraum über der Schlange fünf Meter: einverstanden? **Ja (24.10.).**
3. Du malst die Teile farbig wie gewohnt, die Session legt die Farbmasken an: einverstanden? **Ja (24.10.).**

**Status: bestätigt am 24.10.2026.**

## Paket 5: Untergrund, Tunnel, Baustellen

### Bisheriger Stand (Gedächtnisstütze für Runde 3)

- **Richtlinie 4:** Baustellenpunkt mit gelbem Absperrband ist gesetzt; die Freilegung läuft als Choreografie (Ping, Kamera
  fährt heraus, Risse, die Vorderfläche löst sich auf, Staub, Innenraum mit Licht und Nebel, Kamera zurück) und ist im
  Labor gebaut; Untergrund als Ameisenfarm (Erdschnitt vorn, Räume dahinter, der Fortschritt erweitert die Kamera nach
  unten); dynamisches Graben nur als Skalarfeld in freigegebenen Zonen, Kontur per Marching Squares, geprüft um die
  Fahrzeughülle; Wasserfälle als drei Schichten. Recherche C hat die Technik mit Quellen.
- **Florians Ideen (F6, F7, Runde 1):** Das Ziel ist immer, die Bahn komplett zu bauen. Drei Ideen: auf eine Baustelle
  ziehen und einen Durchgang freisprengen, durch den die Bahn weitergeht; auf eine Baustelle oder einen Tunneleingang
  ziehen, das Level scrollt zum Ausgang, dort geht es weiter; beim Ziehen Erde und Tunnel dynamisch mit Animation
  entstehen lassen (braucht Elemente mit Öffnungen, die überall passen). Vorgefertigt ist einfacher, dynamisch sehr
  cool, Kombination denkbar; noch unentschieden.
- **Aus Paket 4 und 2 (bestätigt):** Durchbruchwand mit Mindesttempo als Baustellen-Variante, Tunnel-Meter als Ziel,
  Untergrund vor dem Freispielen gedeckelt (geschlossener Erdschnitt), Räume werden mit der Fortschrittsstufe
  freigelegt.
- **Heute im Spiel:** Bahn durch Berg ist automatisch ein Tunnel, Portale sind Platzhalter-Kreise, auch dort, wo die Bahn
  den Berg auf einer anderen Spur nur streift (Befund); ein Strich abseits der Bahn wird ohne Hinweis zum Berg
  (Befund „Bergbauer“).
- **Labor:** Höhlenkasten unter dem Erdschnitt, Freilegung per Auflösen, Füße auf dem Höhlenboden, Bahn hinter dem Bogen
  und durch das Felsfenster über den Tiefenpuffer. Die GPT-Progression (Smaragdhain Anfänger, Mittel, Profi) zeigt, wie
  derselbe Ort nach unten wächst: mehr Räume, mehr Wasserfälle.

### Florians Vorgaben (Runde 3)

- Fester Fels: wie empfohlen, der Strich geht nur durch Öffnungen und Baustellen.
- Graben in Stufen: ja, mit dem Vorbehalt, dass sich das noch ändern kann.
- Freilegung und Kamera: muss er ausprobieren. Der Ausgang kann weiter unten in einem Bereich liegen, den man nicht
  vermutet hätte; dann wäre ein Autoscroll zum Ausgang nett. Zuerst wie vorgeschlagen.
- Wasser: sowohl als auch, offen halten. Seen können reiner Schmuck im Hintergrund sein, **Seen sollen auch Stützen
  tragen** (die Bahn gleitet übers Wasser, ein bekanntes Achterbahn-Element), und Splash-Hindernisse gehören dazu.

### Vorschlag 5.1: Regeln für Fels, Öffnungen und Baustellen

- **Fels ist fest.** Kulissen mit Volumen (Dreiteiler, Säulen, Höhlenkästen) lassen die Bahn nur durch ihre Öffnungen
  (Fenster, Tunnelmünder, Höhlenräume) und durch Baustellen. Zielt der Strich in festen Fels, weicht der Tiefenlöser auf
  eine freie Spur vor oder hinter dem Fels aus, wenn es eine gibt; sonst wird der Abschnitt rot markiert (wie heute die
  Schwachstellen) mit dem Hinweis „Fels“, und beim Loslassen endet die Bahn davor.
- **Baustelle** als Element mit Anschlussachse in zwei Varianten, als Daten je Baustelle: **Verbinden** (der Strich trifft
  den Punkt, die Freilegung läuft sofort) und **Durchbruch** (die Bahn muss in der Fahrt mit Mindesttempo ankommen, die
  Wand zersplittert; die Vorab-Fahrt aus Paket 4 zeigt beim Zeichnen, ob das Tempo reicht).
- **Tunnelmund** ist eine Öffnung mit Portal; Tunnel-Meter zählen innerhalb der Öffnungsvolumen.

### Vorschlag 5.2: Untergrund und Freilegung

- Der Erdschnitt ist ein Element (geschlossen, bis die Fortschrittsstufe ihn öffnet, Paket 2). Räume sind Höhlenkästen
  mit tragfähigem Boden und Decke als Aufhängung, verbunden durch vorgefertigte Tunnelkapseln (Stufe 1) oder Grabzonen
  (Stufe 2).
- Freilegung auf zwei Wegen: durch die Fortschrittsstufe (Raum ab Stufe n offen) und durch eine Baustelle im Level
  (Choreografie aus dem Labor); ein so geöffneter Raum bleibt in späteren Leveln offen (die Zone merkt sich „offen ab
  Stufe“).
- **Kamera am Tunnel:** zuerst läuft die Bahn hinter der Kulisse gedimmt sichtbar weiter, die Tunnel-Meter zählen.
  Dazu ein **Editor-Schalter „Autoscroll zum Ausgang“** je Tunnel, den Florian in der Basiszone ausprobiert: Liegt der
  Ausgang außerhalb des Bildes (etwa tief unten), fährt die Kamera dorthin, sobald der Strich den Mund trifft, und das
  Zeichnen geht am Ausgang weiter. Entschieden wird nach dem Ausprobieren.

### Vorschlag 5.3: Graben in Stufen

Stufe 1 (Basiszone): vorgefertigte Räume, Münder, Kapseln und Baustellen. Stufe 2: Grabzonen in weicher Erde als
Daten (zwischen Räumen, unter Wiesen), in denen der Strich gräbt: Skalarfeld und Marching Squares (Richtlinie 4),
Animation beim Ziehen (Erde bricht auf, Randstreifen und Innenschatten im Stil), geprüft um die Fahrzeughülle. Tor
vor Stufe 2: ein Labor-Test der Grab-Animation im Earle-Rayman-Look und eine Handy-Messung. Fels bleibt immer fest.
Florians Vorbehalt: kann sich noch ändern.

### Vorschlag 5.4: Wasser mit Schaltern

Wasser ist ein Element mit Schaltern je Instanz, alle Kombinationen erlaubt: **Schmuck** (hinten, ohne Wirkung),
**trägt Stützen** (Pfeiler stehen im Wasser mit Wellenring, die Bahn gleitet darüber), **Splash-Zone** (Durchfahrt
bremst leicht, Fontäne, Zielart Splash), **Wasserfall** (Band vor der Bahn, Gischt, Fahrt dahinter gedämpft). Die
heutige Regel „keine Stützen im Wasser“ gilt damit nur, wo der Schalter „trägt Stützen“ aus ist.

### Rückfragen zu Paket 5 (Runde 3b)

1. Baustelle in zwei Varianten (Verbinden, Durchbruch) als Daten: einverstanden? **Ja (24.10.).**
2. Autoscroll zum Ausgang als Editor-Schalter zum Ausprobieren: einverstanden? **Ja (24.10.).**

**Status: bestätigt am 24.10.2026.** Graben in Stufen trägt Florians Vorbehalt; Autoscroll wird nach dem Ausprobieren
entschieden. **Nachtrag 25.10.2026 (Etappe 2, von Florian bestätigt):** Der Wasserfall bleibt ein eigenes Element (er ist
seit Etappe 1 da) und bekommt den Schalter „Fahrt dahinter gedämpft“; die Schalter Schmuck, trägt Stützen und Splash-Zone
liegen auf der Wasserfläche. Der Durchbruch wirkt in Etappe 2 nur in der Fahrt (die Wand zersplittert bei Mindesttempo,
sonst endet die Fahrt davor); die Vorab-Fahrt beim Zeichnen und die Zielart kommen mit E3.

## Paket 0: Art Direction v2 (Look)

### Bisheriger Stand (Gedächtnisstütze für Runde 4)

- **Florians Vorgaben:** Es gibt noch keine Art Direction, sie wird hier erarbeitet (K1). Stil Rayman Legends trifft
  Eyvind Earle, vereinfacht; die Vereinfachung tragen Umgebungsanimationen, Shading, Partikel und die Kombination aus
  gezeichneten Grafiken mit Shadern, Schatten und Licht; von Alpen bis Cyberpunk ein Look (K5). Detailgrad wie Bild 15
  und 16, Stil wie Bild 04 und 09 (K6). S-Formen und organische Portale gefallen (K7). Skizze von 2014 für Holz und
  Stahl (K12). Runde 1: der Stil ist einigermaßen festgelegt, die Visuals zeigen ihn am besten, aber nur in
  Ausschnitten. Runde 3: die Visuals sind feste Stilvorlage für die Figuren, etwas flacher und einfacher schattiert.
  Runde 2: Stützen cool und gemalt wie die Studien; Referenzen für Bahn und Station erst herausfinden.
- **Alter Stil (`docs/ART.md`, wird ersetzt):** drei harte Töne, Punktraster auf Schattenseiten, schwarze Stämme mit
  Farbflecken, Hügel als Bänder, Luftperspektive in Stufen, Leuchten nur auf Interaktivem, Tinte-Konturen, Papier-Sticker
  als UI.
- **GPT-Vorschlag** (`refs/traumacoaster-gpt explore/doc/Art-Direction-Vorschlag.md`): Earle prägt Formen und
  Farbrhythmen, Rayman Licht, Staffelung und Humor; keine Konturlinien um Landschaft und Bedienelemente, Lesbarkeit
  durch Farbwert und Materialkontrast; die Bahn ist die klarste Form; UI als dunkle Lozenges mit heller runder Schrift;
  Richtungen Smaragd, Vulkan, Kosmos, Straße als Varianten, nicht als Zuordnung.
- **Labor:** Looks Frühling, Abend, Nacht, Neon, Vulkan als Shader-Presets aus denselben Grafiken (Farbton, Sättigung,
  Gradient-Map, Tönung), Nebel, Glitzern, Wasser, Lichtquellen, eine Shadow Map (Richtlinie 5 und 6). Richtlinie 11:
  die Visuals 5 bis 8 treffen Detailgrad und Stil, 13 und 52 sind zu dicht.
- **Übergabe, Paket 0:** eingefrorene Referenzen, zehn Regeln (Formen, Kanten, Detaildichte je Quadratmeter,
  Farbrollen, Lichtrichtung, Bahn als klarste Form, Figuren, UI), Zonen-Looks als Presets, die ersten Dreiteiler, eine
  Stilprobe als Tor, bevor Assets in Menge entstehen; ersetzt `docs/ART.md`. Entscheidung 3 (Referenzen einfrieren).
- **Aus den bestätigten Paketen:** Platzhalter zuerst, Grafiken ersetzen sie (8a); Looks je Fortschrittsstufe (2);
  Figuren nach den Visuals (6); Stützen-Werkstatt gegen Florians Studien (3).

### Florians Vorgaben (Runde 4)

- **Referenzen:** Alle Bilder unter `refs/traumacoaster-gpt explore/visuals/` dienen mehr oder weniger als Maßstab.
  Straßenkarussell (09) und Ornamentwald/Smaragdhain (04) gefallen als Bild und im Stil am besten; Alpenkurve (15) und
  Glutgrund (16) treffen Maßstab und Detailgrad besser. Die Synthese müssen wir herausfinden.
- **Keine Konturen.**
- Punktraster nur gemalt; zusätzlich wäre ein Shader schön, der an manchen Stellen das **Funkeln animiert**.
- Alpen als erster Look: ja, mit irgendetwas müssen wir anfangen.
- UI: ein Vorschlag in **total verrücktem, extremem Neo-Brutalismus** mit vielen eigenen Formen und Effekten.

### Vorschlag 0.1: Referenzen und Regeln (vorläufig bis zur Stilprobe)

**Eingefrorener Pool (Entscheidung 3):** alle Visuals im Ordner; darin zwei Rollen: **Stil-Leitbilder** 04 und 09
(Formen, Farbrhythmus, Humor der Architektur), **Maßstab-Leitbilder** 15 und 16 (Detailgrad je Bildschirm, ruhige
Flächen hinter der Bahn, Größe von Bahn und Wagen im Bild). Für Bahn und Station vorläufig Florians Bahnstudien, für
Figuren die Visuals (Paket 6). Die endgültige Synthese ist das Ergebnis der Stilprobe (0.2), nicht ihre Vorgabe.

**Zehn Regeln als Entwurf** (sie ersetzen `docs/ART.md`, sobald die Stilprobe steht; bis dahin gelten sie als
Arbeitsregeln für Platzhalter-Ersatz und Aufträge):

1. **Keine Konturen.** Weder um Landschaft noch um Figuren noch um die Bahn. Lesbarkeit kommt aus Farbwert,
   Helligkeit und Materialkontrast (Florian, 24.10.).
2. **Wenige große Formen je Bild.** Earle gibt die großen Flächen und den Farbrhythmus, Rayman das weiche lokale
   Volumen und die Staffelung; keine Mikrodetails, die auf dem Handy unter drei Pixel fallen.
3. **Die Bahn ist die klarste Form.** Sie hebt sich durch Helligkeit vom Grund ab (warme Schiene auf kühlem Grund oder
   umgekehrt), die Landschaft hinter der Bahn ist ruhig (Bild 15 und 16).
4. **Punktraster nur gemalt**, an Kronenkanten und Schattenrändern wie in Bild 04, nie als Filter; dazu ein
   **Funkeln-Shader** auf markierten Stellen (0.3).
5. **Licht von hinten oben links**, die Schatten fallen nach vorn auf den Boden (Richtlinie 5); die Kulissen tragen ihr
   Licht gemalt, das Richtungslicht dient nur dem Schatten.
6. **Farbrollen je Tiefe:** Ferne hell und entsättigt, Mitte satt, Vordergrund dunkel und kontrastreich; eine
   Akzentfarbe je Zone; Tag, Abend, Nacht als Presets je Fortschrittsstufe (Richtlinie 6).
7. **Formen:** S-Kurven, Fächer, Pilz- und Schirmkronen, organische Portale, geriefte Stämme; Stützen gemalt wie
   Florians Studien (Paket 3).
8. **Figuren** wie die Visuals, etwas flacher schattiert, riesige Augen, klappender Oberschädel (Paket 6).
9. **Umfärbbar:** Teile in neutraler Palette oder mit Farbmaske, Zone und Stimmung kommen aus dem Shader (Richtlinie 9).
10. **UI als eigene Welt:** hart, flach, laut (0.4), bewusst gegen die weiche Landschaft gesetzt; die Welt bleibt ohne
    Konturen, die UI darf welche haben.

### Vorschlag 0.2: Erster Look und Stilprobe

Erster Look: **Alpen**, Frühling am Tag, Abend und Nacht als Fortschrittsstufen (Richtlinie, Florian: „mit irgendetwas
müssen wir anfangen“). **Stilprobe:** ein Feld der Basiszone, in dem die ersten echten Teile die Platzhalter ersetzen:
drei Dreiteiler (Baum mit Fenster, Fels mit Tunnel, Portal), Bahn eines Typs mit Stützen aus der Werkstatt, Station mit
Häuschen, eine Figur in der Schlange und im Wagen, ein Coin-Satz, dazu Licht, Schatten, Nebel, Funkeln. Abnahme: ein
Standbild im Hochformat vom Handy neben Bild 15 und 04, Florians Freigabe. Erst danach entstehen Teile in Menge
(Paket 8b), und aus der Stilprobe wird das Regelwerk (0.1) endgültig.

### Vorschlag 0.3: Funkeln-Shader

Animiertes Funkeln an markierten Stellen (Schnee, Wasser, Kristalle, Tau auf Kronen, Coins, Laternen): je Teil ein
Maskenkanal oder eine kleine Punktwolke, der Shader lässt Punkte zeit- und blickabhängig aufblitzen (Richtlinie 6:
Hash je Zelle, Größe mit der Entfernung, auf Masken begrenzt). Kosten gering (ein Draw Call für die Punktwolke);
Messung auf dem Handy, bevor es bleibt.

### Vorschlag 0.4: UI im Neo-Brutalismus, Arbeitstitel „Baustellen-Brutalismus“

Die Welt hat keine Konturen, die UI bekommt sie umso härter. Die Idee: Die ganze Bedienung sieht aus wie das
Baustellen-Inventar der Zone, hart aufgeklebt auf das gemalte Bild.

- **Material:** flache Flächen in Schwarz, Kreide-Weiß, Warn-Gelb, Signal-Pink und einem Elektro-Blau; dicke schwarze
  Ränder (vier bis sechs Pixel); harte, unscharfe Versatz-Schatten in einer zweiten Farbe statt weicher Schatten;
  Schrift sehr fett, eng, Versalien, leicht gedreht.
- **Eigene Formen:** keine zwei Elemente gleich: Zielchips als gezackter Stern (Looping), abgerissener Zettel (Höhe),
  Sechseck (Airtime), Ring (Coins); Knöpfe als schiefe Blöcke; das Streckenbudget als **Absperrband** (gelb-schwarze
  Streifen), das sich mit jedem Meter aufrollt; die Kettenzuglinie beim Zeichnen als gestricheltes Band mit
  Höhenmarke; der Startart-Knopf als Hebel am Vorgabestück; „Testfahrt“ als riesiger schiefer Block mit Schraffur.
- **Effekte:** Drücken lässt den Versatz-Schatten zusammenfallen; Ziele werden mit Drehung eingestempelt und kippen
  bei Erfüllung die Farbe (Gelb zu Grün); „geht nicht weiter“ (Fels, Feld, Budget, Schlange) kommt als roter
  Stempel „STOP“ mit kurzem Rütteln; Entgleisen als gezackter „KRACH“-Burst; Sterne als schwarze Sticker mit
  gelbem Rand; Konfetti aus schwarz umrandeten Quadraten.
- **Grenzen:** Trefferflächen mindestens 56 bis 60 Pixel (Richtlinie 7), Texte mindestens 18 Pixel, nichts im
  Zeichenraum außer den Griffen und der Kettenzuglinie; die wilde Form sitzt an den Rändern.
- Ein erster Entwurf als Bild wurde Florian am 24.10. gezeigt (Hochformat-HUD). Florians Urteil: **noch viel
  verrückter und unkonventioneller.** Darum eine **UI-Werkstatt** mit drei Varianten zum Vergleich, bevor die UI in die
  Stilprobe kommt. Hebel, an denen „verrückter“ ansetzt:
  - **Die UI lebt:** Chips haben Augen und blinzeln, der Testfahrt-Block atmet, Knöpfe fallen beim Drücken um und
    rappeln sich auf, das Absperrband wird von einer Figur gehalten, die mit jedem Meter weiter zurückweicht.
  - **Die UI ist Teil der Zone:** Bedienelemente hängen an Seilen von oben, stecken als Schilder im Boden, sind an
    die Station genagelt; sie wackeln mit, wenn der Zug vorbeirauscht.
  - **Bewusst falsch:** nichts ist ausgerichtet, Schrift läuft schräg und über Kanten hinaus, Elemente überlappen,
    Löcher und Risse in den Blöcken, Klebeband hält Ecken, Marquee-Text als Laufschrift auf dem Band.
  - **Effekte als Ereignis:** Stempel schlagen mit Staubwolke ein, Erfolge zerreißen den Chip und zeigen einen neuen
    darunter, Fehlschläge lassen das ganze HUD kurz kippen, Sterne werden mit einer Hand aufgeklebt.
  - **Eigenes Alphabet:** eine Display-Schrift aus Schablonen- und Pinselbuchstaben, Zahlen als gestanzte Blechziffern.
  Grenzen bleiben: Trefferflächen, Lesbarkeit der Ziele in einer Sekunde, nichts im Zeichenraum außer Griffen und
  Kettenzuglinie. Tor: drei Varianten als Bilder, Florian wählt; die gewählte wird in der Stilprobe gebaut.

### Rückfragen zu Paket 0 (Runde 4b)

1. Zehn Regeln als vorläufiges Regelwerk bis zur Stilprobe: einverstanden? **Ja, aber nur vorläufig (24.10.).**
2. Baustellen-Brutalismus als Richtung für die UI: weiter ausarbeiten, oder noch verrückter? **Noch viel verrückter und
   unkonventioneller (Florian, 24.10., Nachtrag).** Ausarbeitung in 0.4 als UI-Werkstatt mit Varianten.

**Status: bestätigt am 24.10.2026**; die zehn Regeln bleiben vorläufig, bis die Stilprobe sie bestätigt oder ändert.
**Nachtrag 25.10.2026 (Florian):** Gemalte Fläche gegen 3D-Teil mit gemalter, per Shader umgefärbter Textur (Meshy aus den
GPT-Earle-Teilen) ist keine Regel, sondern ein Test der Stilprobe je Stelle; siehe Paket 8a und Richtlinie 3 und 9.

## Paket 7: Werkzeuge und Bedienung

### Bisheriger Stand (Gedächtnisstütze für Runde 4)

- **Richtlinie 7:** Zeichnen auf dem Handy größer: Linie 14–18 px, Tropfen Ø 50–60 px, Gummiband 30 px, Zeichen-Zoom
  10–12 px/m, kleinster Kringel 120–150 px, Trefferzonen 56–60 px, Anschluss an die Station 60 px; Lupe nur am
  Anschluss; Rand-Autoscroll nach etwa 150 ms; Zwei-Finger-Pan und Pinch; testbar per Adresse
  (`?tip=26&line=15&band=30&dzoom=11`). Vollbild ist gebaut. Entscheidung 2 (Zeichengrößen).
- **Perspektive:** hinter `?persp=1&fov=…` gebaut, Zoom als Kamerafahrt (Florians Entscheidung), Bildwinkel laut
  Richtlinie 15–22°, zur Wahl 12, 18, 24; Florians Handy-Test fand Risse an Spurgrenzen, behoben. Entscheidung 1.
- **Heute im Spiel:** vier Lesarten per Knopf (Pinsel bleibt, K4), Budget-Regler, Kreuzungen per Tipp tauschbar,
  einrastende Tiefen, Bogenmenü am Segment (Tiefe, Schräglage, Löschen), Profi-Handles nach Langdruck, Zwei-Finger-Tipp
  Undo, Autoscroll, Zeichen-Zoom, Strich-Rekorder; Terrain-Striche abseits der Bahn werden ohne Hinweis zu Bergen
  (Befund); Startart-Symbol wird nicht als Knopf erkannt (Befund); Scheiben am Bahnhof (Befund).
- **Entscheidung 5:** Florians Bug-Liste vom Testtag (Zeichnen gut bis auf Bugs und Entgleis-Einstellungen) fehlt noch.
- **Entscheidung 7:** was weg darf: die Lesarten Bühne, Ein Strich und Ebenen, der Spur-Filter, die 150 Level als Inhalt
  (Daten bleiben als Vorrat); Empfehlung der Übergabe: ja, alles drei.
- **Aus den bestätigten Paketen:** Ziele als höchstens drei Chips oben (4), Kettenzugstärke als Linie beim Zeichnen (4),
  Vorab-Fahrt für Schanze und Durchbruch (4, 5), Startart als großer Knopf am Vorgabestück (3), Feld mit weicher
  Kamerabegrenzung (2), Freiraum über der Schlange hebt die Bahn an (6), Fels markiert den Strich rot (5).

Fragen der Runde 4 (24.10.): Bildwinkel, Zeichengrößen, Bug-Liste, was weg darf, HUD und Werkzeuge im Feld.

**Entscheidung 1, bestätigt am 24.10.2026: Bildwinkel 18 Grad als Standard der Perspektive**, Zoom als Kamerafahrt
(wie am 24.10. entschieden). Die Adresse `?persp=1&fov=18` ist damit der Spielstand, bis der Weltrenderer die
Perspektive übernimmt.

### Florians Vorgaben (Runde 4)

- Bildwinkel 18 Grad (bestätigt, oben). Zeichengrößen: erst einmal die Empfehlung der Richtlinie.
- **Bug-Liste vom Testtag:** Die Bahn kann stabiler laufen, der Wagen entgleist an manchen Stellen zu schnell, vor
  allem in horizontalen Kurven; Kreuzung umdrehen braucht er wohl nicht; weiter feilen an der Strichintelligenz;
  visuelles Feedback, wenn es nicht weitergeht; Bahnende sauberer; zu viele unnötige Schleifen; Bedienung der
  Neigung; zu viele Punkte werden gesetzt.
- Was weg darf: ja (drei Lesarten, Spur-Filter, 150 Level als Inhalt).
- HUD: klingt erst einmal gut; für die Visualisierung etwas Besonderes (0.4).
- Terrain: kein Terrain-Zeichnen; vielleicht lässt sich das Terrain leicht formen; später in „Eigene Bahnen“ soll der
  Spieler mehr Einfluss haben.

### Vorschlag 7.1: Festgelegte Werte

Perspektive 18 Grad, Zoom als Kamerafahrt; Zeichengrößen als Standard: Linie 15 px, Tropfen-Radius 26 px, Gummiband
30 px, Zeichen-Zoom 11 px/m, Trefferzonen 56 bis 60 px, Anschluss 60 px; nachjustiert wird nach Florians Handy-Test in
der Basiszone, die Adressparameter bleiben zum Vergleichen.

### Vorschlag 7.2: Was weg darf (Entscheidung 7, bestätigt)

Die Lesarten Bühne, Ein Strich und Ebenen, der Spur-Filter (Punktraster als Filter) und die 150 spurbasierten Level
als Inhalt fallen mit dem Umbau auf den Weltrenderer; die Level-Daten bleiben als Vorrat für Rezepte (Paket 9), die
Aufnahmen und Tests der Lesarten bleiben, soweit sie den Pinsel prüfen. Der Lesart-Knopf unten links verschwindet.

**Stand 24.10.2026 (Etappe 1, Schritt 4):** Lesart-Knopf und Spur-Filter sind raus; die drei alten Lesarten bleiben
im Code nur noch per Adresse (`?stage`, `?single`, `?lanes`) für Szenarien und Replay. Die 150 Level liegen weiter in
`src/levels` und tragen bis zum Zonen-Editor (Schritt 6) die Basiszone-Arbeit; als Inhalt fallen sie mit der Zonendatei.

### Vorschlag 7.3: Bug-Backlog aus dem Testtag (Entscheidung 5)

| Befund (Florian) | Einordnung | Paket | Vorschlag |
|---|---|---|---|
| Bahn kann stabiler laufen; Wagen entgleist zu schnell, vor allem in horizontalen Kurven | Physik und Regeln | 4 (Humor und Scheitern), 3 | Seitengrenzen je Bahntyp anheben, automatische Schräglage in Kurven, Warnung vor sicherem Entgleisen durch die Vorab-Fahrt; Entgleisen bleibt selten und groß |
| Kreuzung umdrehen nicht nötig | Werkzeug | 7 | Tausch nur noch im Bogenmenü als Rückfall, nicht im HUD; fällt ganz, wenn das Replay ihn nicht braucht (Nachtrag 24.10.) |
| Strichintelligenz weiter feilen; zu viele unnötige Schleifen; zu viele Punkte | Pinsel-Pipeline | 7, 1 | Knotenwahl mit größerer Toleranz, Schleifen nur bei klarer Drehung, Glättung der Enden; Prüfung gegen die Aufnahmen (`npm run strokes:replay`) |
| Bahnende sauberer | Pinsel-Pipeline | 7 | Endstück mit sauberem Auslauf, Anschluss an die Station mit Vorschau |
| Visuelles Feedback, wenn es nicht weitergeht | HUD | 7, 0 | Stempel „STOP“ mit Grund (Fels, Feld, Budget, Schlange) und Rütteln (0.4) |
| Bedienung der Neigung | Werkzeug | 7 | Schräglage automatisch aus Tempo und Kurve; Handgriff nur im Bogenmenü als Ausnahme |

Die Punkte werden in den Etappen (Paket 10) eingeplant; Entgleis-Einstellungen gehören zu den Humor-Regeln (4.7).

### Vorschlag 7.4: HUD und Werkzeuge im Feld

Ziele als höchstens drei Chips oben; „Testfahrt“ groß unten; Startart als Hebel am Vorgabestück; Undo per
Zwei-Finger-Tipp und Knopf; Löschen über das Bogenmenü am Segment; Budget als Absperrband; Zoom-Reset als Knopf und
Doppeltipp; Werkzeuge erscheinen nur, wenn das Level sie erlaubt; Kettenzuglinie beim Zeichnen; die Vorab-Fahrt zeigt
Flugbahn (Schanze), Tempo (Durchbruch) und sicheres Entgleisen. Gestaltung in der Sprache von 0.4.

### Vorschlag 7.5: Terrain

In Leveln zeichnet der Spieler kein Terrain; Berge und Boden kommen aus der Zone. Als Daten je Level ein Schalter
**„Boden formen“** (Radius, Höhe), mit dem der Spieler Hügel leicht anheben oder senken darf, wo die Zone es erlaubt;
gebaut nach der Basiszone, zuerst für „Eigene Bahnen“ (Sandkasten, GDD 12), wo der Spieler mehr Einfluss bekommt.

### Rückfragen zu Paket 7 (Runde 4b)

1. Kreuzungs-Tausch wirklich entfernen (auch für spätere Zonen)? **Florian (24.10., Nachtrag): „Brauchen wir ihn? Wenn
   du ihn für nötig hältst, lass ihn drin.“ Urteil der Session: als Rückfall behalten, nicht als sichtbares Werkzeug.**
   Der Tausch bleibt im Bogenmenü der Kreuzung (Tippen auf die Kreuzung, dann „vorn/hinten tauschen“), weil der
   Tiefenlöser bei engen Kreuzungen falsch raten kann; er verschwindet aus dem HUD. Das Replay zählt, wie oft er
   gebraucht wird; wird er in der Basiszone nicht gebraucht, fällt er ganz.
2. „Boden formen“ als Schalter je Level, zuerst im Sandkasten: einverstanden? **Ja, wenn es später in die Basiszone
   eingebaut werden kann (24.10., Nachtrag).** Also: Fähigkeit der Basiszone (Schalter je Level, Radius und Höhe),
   gebaut nach der Stilprobe, zuerst im Sandkasten getestet, dann in Leveln, wo die Zone es erlaubt.

**Status: bestätigt am 24.10.2026.**

## Paket 12: Karte und Morph (neu, 24.10.)

Florians Vorgabe: Der Morph von der Glücksradkarte ins Spiel gehört doch in den Plan. Zuerst muss der Morph vom Rad
zum Level sauber sein, dann wird die genaue Animation erarbeitet. Bisheriger Stand: Karte als Rad mit Glücksrad-Physik,
gemeinsamer Himmel und aufklappende Spurstreifen (alter Plan M4, `src/app/mapTransition.ts`, `src/render/unfold.ts`);
Florians Vorgabe K16 (Radlayout, Level als Miniaturen mit Symbolen und Animationen, Boden morpht, Bäume und Felsen
werden einanimiert, keine Sprünge, nichts wird einfach eingeblendet); Richtlinie 10: mit der 3D-Welt wird der Morph
einfacher, weil der Boden als Mesh gebogen wird und Bäume und Felsen echte Objekte sind. Konzepte liegen unter
`refs/traumacoaster-gpt explore/moodboards_map/`.

### Bisheriger Stand (Gedächtnisstütze für Runde 5)

- **Heute im Spiel:** Karte als Drehscheibe mit Glücksrad-Physik (freies Ausrollen, Rasten, Haptik), gemeinsamer Himmel
  zwischen Karte und Level, Übergang über drei Standbilder (Himmel, Welt, UI), die Welt als gebogene Fläche von
  Krümmung auf flach (1,55 s hinein, 1,35 s heraus), Spurstreifen klappen gestaffelt auf, das Level-Bild blendet
  später ein; Miniaturen der gebauten Bahnen auf den Spots; Play mittig.
- **Florians Vorgaben (K16):** Radlayout fest; Level als kleine Achterbahn-Miniaturen mit Symbolen und Animationen; der
  Morph von der runden Welt zur organischen Levelansicht muss sauber sein: der Boden morpht, Bäume und Felsen werden
  einanimiert, keine Sprünge, nichts wird einfach eingeblendet. Runde 1: zuerst muss der Morph sauber sein, dann die
  genaue Animation.
- **Richtlinie 10:** Mit der 3D-Welt wird der Morph einfacher und schöner: der Boden wird als Mesh im Vertex-Shader
  gebogen, Bäume und Felsen sind echte Objekte, die einanimiert werden, statt gebogener Standbilder.
- **GPT-Konzept:** die Karte bleibt eine frontal betrachtete, drehbare Scheibe; Level wachsen radial am Rand; ein
  offenes Level ist eine große Skulptur (Samen, Felstrompete, Sternknospe), nach Erfolg die eigene Bahn als
  Miniatur; die Auswahl rastet an einem festen Fokuspunkt oben; auf dem Handy ein größerer Ausschnitt des Bogens mit
  fester Auswahlkarte unten (Visuals 05, 07, 08).

### Florians Vorgaben (Runde 5)

- Was „sauber“ genau heißt, weiß er noch nicht; wir fangen mit dem Vorschlag an.
- Miniaturen und Symbole wie in den GPT-Bildern ausprobieren.
- Alle Zonen auf ein Rad.

### Vorschlag 12.1: Ein Rad für alle Zonen

Ein Rad mit Sektoren je Zone (Weltenrad, Visual 05 und 08), die Level radial am Rand des Sektors. Bestandene Level
zeigen die eigene gebaute Bahn als Miniatur (die heutige Miniatur-Technik, auf die 3D-Welt umgestellt), offene Level
eine Skulptur der Zone mit Symbol (Samen, Felstrompete, Sternknospe, Laterne), gesperrte ruhiger mit Sperrsymbol. Die
Auswahl rastet am festen Fokuspunkt oben, Titel, Fortschritt und Play bleiben fest; die Glücksrad-Physik bleibt; auf
dem Handy ein größerer Ausschnitt des Bogens mit fester Auswahlkarte unten (Visual 07). Die Fortschrittsstufe der Zone
zeigt der Sektor an (mehr Miniaturen, wachsende Skulpturen), gesteuert wird sie über die Levelnummer (Paket 2).

### Vorschlag 12.2: Morph in zwei Schritten

**Schritt 1, der saubere Morph:** kein Schnitt und kein Einblenden. Die echte 3D-Zone wird im Vertex-Shader von der
Krümmung des Rads ins Flache gebogen, Bäume, Felsen und Station wachsen als Objekte aus dem Boden, der Himmel läuft
durch, die Kamera fährt in einem Zug vom Rad-Blick in den Level-Blick; die Spurstreifen klappen wie heute gestaffelt
auf, die gezeichnete Bahn erscheint zuletzt. Weil „sauber“ noch kein Maßstab hat, bekommt der Schritt messbare Kriterien
als Vorschlag: kein Objekt springt oder blendet ohne Bewegung ein, 60 fps auf dem Handy während des Morphs, Dauer
etwa 1,5 Sekunden hinein und 1,3 Sekunden heraus, Rückweg spiegelbildlich. Abnahme: ein Video vom Handy, Florian
sieht keinen Sprung, dazu die Messung.

**Schritt 2, die genaue Animation:** Timing, Kurven, Reihenfolge der Objekte, Partikel, Klang; mit Florian am
fertigen Schritt 1, nach der Stilprobe (Paket 10).

### Rückfragen zu Paket 12 (Runde 5b)

Keine; die Kriterien in 12.2 sind Vorschlag und werden am ersten Video geprüft.

**Status: bestätigt am 24.10.2026.**

## Paket 8b: Asset-Pipeline und Aufträge

### Bisheriger Stand (Gedächtnisstütze für Runde 5)

- **Richtlinie 9:** ein Teil je Bild, transparent erzeugt (das Bildwerkzeug kann transparente Hintergründe; im Batch
  halb so teuer; rund 200 Teile mittlerer Qualität etwa 5 bis 11 Dollar); Freistellen nur zum Nachputzen; Metadaten je
  Teil (Maßstab in Metern, Fußpunkt, Tiefenrolle, Öffnungsvolumen, Fundamentflächen, Anschlusspunkte, Palettenfamilie,
  Wachstumsstufe); umfärbbar durch neutrale Palette oder RGB-Masken (5 bis 15 Minuten je Teil); Meshy und Tripo nur
  für Wagen und Prüfkörper; beschnittene Kanten im Katalog vermerken.
- **Speicher (Richtlinie 2 und 12):** eine 2048er-Textur belegt 16 MiB; KTX2 von Anfang an, Atlanten, Kulissen auf
  Inhaltsgrenzen geschnitten; Labor-Umwandlung: 34 Teile, 2,2 MB WebP, hart freigestellt.
- **Heute im Repository:** `scripts/art-prep.mjs` (Chroma-Key, Zuschnitt, kachelbar, WebP, Manifest),
  `scripts/art-kit.json` (Name, Größe, Regel, Prompt je Kachel), `docs/ART-PROMPTS.md` daraus erzeugt; Quellbilder
  liegen nicht im Repository (lokal, Archiv in einer Figma-Datei); Drop-in über das Manifest; Labor-Assets mit
  `manifest.json` (Breite, Höhe, Seitenverhältnis, Größe).
- **GPT-Pipeline (Umsetzungsplan 14):** Master-Komposition festlegen, zusammengehörige Körper gemeinsam erzeugen,
  transparenten Master sichern (Prompt, Referenzen, Lichtregel, Version), Teile ableiten, Semantik zeichnen, im
  kleinsten Zielmaßstab prüfen, drei Testszenen, erst dann katalogisieren. `doc/Bildprompts.md` hat den Stil-Vorspann.
- **Aus den bestätigten Paketen:** Platzhalter zuerst, Grafiken ersetzen sie über ihren Namen (8a); Florian malt
  Figurenteile farbig, die Session legt Masken an (6); Wagen über GPT und Meshy mit gemalter Textur (3); Funkeln über
  einen Maskenkanal (0); die Stilprobe braucht den ersten Satz echter Teile (0).

### Florians Vorgaben (Runde 5)

- Werkzeugweg: über Florians Figma-Konto mit dem Bildgenerator versuchen; dann kann die Session selbst erzeugen,
  Florian passt nur an, wenn nötig.
- **Jede Zone bekommt eigene Teile, und zwar komplett**; nur wenige Teile sind für alle Zonen wiederverwendbar.
  Varianten je Zone macht Florian oder die Session mit Figma und GPT.
- Reihenfolge des ersten Auftrags ist in Ordnung. Generell soll die Session anhand der Referenzen selbst Bilder
  erzeugen, sie analysieren und sagen, was wie angepasst werden muss, damit es **genau** passt; der Generator macht
  schöne Bilder, aber nicht pixelgenau. Nacharbeit macht Florian, oder die Session, wenn sie es sich zutraut.

### Vorschlag 8b.1: Werkzeugweg

Die Session erzeugt die Teile über den Bildgenerator in Florians Figma-Konto (Referenzbilder: die Leitbilder aus
Paket 0 und ein Bild des Platzhalters im Editor als Vorlage für Form und Maße), ein Teil je Bild, transparenter
Hintergrund, Prompt mit dem Stil-Vorspann aus Paket 0 und der Beschreibung aus dem Auftrag. Quelle, Prompt,
Referenzen und Version jedes Teils stehen in einer Katalogdatei im Repository (ohne die Bilder); die Master liegen
lokal und in der Figma-Datei als Archiv. Voraussetzung, die beim ersten Auftrag geprüft wird: Der Connector läuft mit
Florians Konto (der alte Plan beschreibt den Weg über das Pro-Konto). Rückfall: Florian erzeugt aus demselben
Auftragstext in seinem Werkzeug. **Nachtrag Florian (24.10.):** Die Session wählt den Weg, der für sie besser ist,
Figma-Konto oder der Bildgenerator über eine Schnittstelle vom Terminal aus; beide Wege liefern dieselben Dinge
(transparentes Teil, Katalogeintrag mit Prompt, Referenzen und Version, Prüfung aus 8b.2). Entschieden wird am
ersten Auftrag nach einem Vergleich an zwei Teilen.

### Vorschlag 8b.2: Prüfung „passt es genau“

Jedes erzeugte Teil durchläuft eine automatische Analyse gegen den Auftrag: Umriss und Maße (Alpha-Begrenzung gegen
die Zielmaße und den Fußpunkt), Öffnungsgröße bei Dreiteilern, Lichtseite (Helligkeit links, rechts, oben), Palette
(Farbrollen und Sättigung gegen das Leitbild), Kantenhärte (hart freigestellt), Detaildichte im Zielmaßstab (keine
Feinheiten unter drei Pixeln auf dem Handy). Ergebnis ist ein Kontaktbogen: Teil neben Platzhalter und Leitbild im
Editor, dazu eine Liste „anpassen: …“. Nacharbeit: Zuschnitt, Skalierung, Fußpunkt, Maske und kleine Retuschen macht
die Session; Malerei, die den Charakter ändert, macht Florian; gezielte Neuerzeugung einzelner Stellen probiert die
Session mit dem Generator, bevor sie Florian bittet.

### Vorschlag 8b.3: Namensschema und Katalog

Zone als Ordner, dann Typ, Motiv, Variante: `alpen/dreiteiler_fels_fenster_a`, `neonpark/portal_geisterbahn_b`,
`gemeinsam/coin_a` für die wenigen Teile, die in allen Zonen vorkommen. Der Katalog (`assets/katalog.json`) trägt je
Teil die Metadaten aus Paket 8a (Maße in Metern, Fußpunkt, Tiefenrolle, Öffnung, Fundament, Anschlüsse,
Wachstumsstufe), ob eine Farbmaske existiert, Quelle, Prompt und Version. Das Umfärben per Shader dient Stimmungen
(Tag, Abend, Nacht) und kleinen Varianten, nicht als Ersatz für eigene Zonen-Teile (Florian).

### Vorschlag 8b.4: Aufträge in Sätzen

1. **Stilproben-Satz** (sobald das Stilproben-Feld als Platzhalter steht): etwa zehn bis fünfzehn Teile: drei
   Dreiteiler (Baum mit Fenster, Fels mit Tunnel, Portal), Stationsteile (Häuschen, Dach, Drehkreuz), Füße, Kapitelle,
   Laschen und Konsolen für die Stützen-Werkstatt, Coin, Nebelband, Funkeln-Maske; Florians Figurenteile kommen von
   ihm.
2. **Alpen-Satz:** aus den Platzhaltern der Basiszone (Richtwert 50 bis 70 Teile je Zone, Richtlinie 11), in Familien
   (Landmarken, Füller, Untergrund, Wasser, Station, Deko, interaktive Elemente).
3. **Neonpark-Satz** für die zweite Zone (Paket 9).

### Vorschlag 8b.5: Format und Grenzen

Master bis 2048 Pixel, WebP für die Entwicklung, KTX2 (UASTC) für das Handy, Atlanten je Zone, Kulissen auf
Inhaltsgrenzen geschnitten (Richtlinie 2 und 12); eine Prüfung in der CI meldet jeden Platzhalter, dessen Teil fehlt,
und jedes Teil ohne Katalogeintrag.

### Rückfragen zu Paket 8b (Runde 5b)

Keine; der Weg über das Figma-Konto wird am ersten Auftrag geprüft.

**Status: bestätigt am 24.10.2026.**

## Paket 9: Produktion vieler Level

### Bisheriger Stand (Gedächtnisstütze für Runde 5)

- **Florians Vorgaben:** erst eine Zone fertig, dann schnell breit fächern mit wenig händischem Grafikaufwand (K10);
  mit kleinem Team automatisiert viele Zonen und Level (Erwartungen); Runde 1: 15 bis 20 Level je Zone, von sehr
  einfach bis Physikrätsel, Level als leere Ausschnitte der Zone; die genauen Level kommen nach Mechanik und Look.
- **Richtlinie 10:** Rezepte statt Illustrationen (etwa zwölf Kompositionsrezepte je Zone mal Zielvarianten), Seed plus
  Generator- und Assetversion gespeichert, je Level eine gespeicherte Lösungsbahn als Test.
- **GPT-Umsetzungsplan 13:** Variation aus Komposition, Höhenprofil, Kamerarahmen, Bahnaufgabe, Raumverbindungen und
  Entwicklungsstufe; sechs bis acht Layout-Grammatiken (Wiesental, Seebalkon, Einzelbaum, Doppelbaum, Felsfenster,
  Wasserfallschlucht, Kathedralgrotte, Bergring); Elemente mit zwei bis vier Entwicklungszuständen; die Beispiel-Lösung
  prüft nur die Erreichbarkeit, Spieler dürfen anders bauen.
- **GDD 10:** ein neues Ding pro Level, Rhythmus aus Lern-, Kombinations-, Sonder- und Finale-Leveln, Ziele als
  sichtbare Zahlen, Terrain als Anlass. Risiko aus dem GDD: 150 Level balancieren; ein automatischer Lösbarkeits-Test
  fehlt bis heute (Befund vom Testtag: Ziele, die nie erfüllbar sind).
- **Heute:** 150 Level als Daten (bleiben Vorrat, Paket 7), Zielauswertung, kein Prüfer.

Fragen der Runde 5 (24.10.): wie Level später entstehen (von Hand, Vorschlag-Generator, automatisch), der Prüfer, die
zweite Zone als Nachweis.

### Florians Vorgaben (Runde 5)

- **Bestätigt am 24.10.2026: Level entstehen später mit einem Vorschlag-Generator im Editor.**
- Prüfer mit gespeicherter Lösungsbahn: einverstanden.
- Zweite Zone als Nachweis: **„Mystischer Neon-Freizeitpark“**, mit vielen mystischen Neonfarben, greller Beleuchtung,
  Shader-Details wie Neon-Nebel und Licht, Geisterbahn- und Halloween-Elementen.

### Vorschlag 9.1: Vorschlag-Generator

Rezepte sind Layout-Grammatiken der Zone (Wiesental, Seebalkon, Einzelbaum, Doppelbaum, Felsfenster,
Wasserfallschlucht, Kathedralgrotte, Bergring, für den Neonpark eigene) mal Zielvarianten aus dem Katalog (Paket 4).
Rezept plus Seed erzeugt Kandidaten: Feld in der Zone, Fortschrittsstufe, erlaubte Fähigkeiten, höchstens drei Ziele,
Coin-Gruppen, aktive Elemente und Baustellen. Der Editor zeigt die Kandidaten nebeneinander; Florian wählt, ändert und
nimmt an. Gespeichert werden Rezept, Seed, Generator- und Assetversion (Richtlinie 10), damit ein Level
reproduzierbar bleibt. Der Generator kommt nach der Basiszone (Paket 10).

### Vorschlag 9.2: Prüfer

Je Level eine Lösungsbahn, die Florian einmal im Editor zeichnet. Der Prüfer fährt sie automatisch mit genau den
Fähigkeiten, die das Level erlaubt, und meldet: Ziele, die die Lösung nicht erfüllt; Ziele, die auf fehlende Elemente
zeigen (Befund vom Testtag); Lösungen, die das Feld verlassen; Baustellen, die nicht erreichbar sind. Er läuft in der
CI (`npm test` und das Replay) und vor jeder Freigabe einer Zone zusammen mit der Handy-Messung (60 fps).

### Vorschlag 9.3: Zweite Zone „Mystischer Neon-Freizeitpark“

Zweck: der Beweis, dass das System trägt. Die Zone entsteht **ohne neuen Engine-Code**, nur aus Daten im Editor, einem
eigenen Teilesatz (Buden, Geisterbahn-Fassade, Kürbisse, Laternen, Neon-Schilder, Nebelbänke, Riesenrad als Kulisse,
Spukbäume), den Looks Nacht und Neon aus dem Labor mit Neon-Nebel, Glühen und Punktlichtern, eigenen Stützen- und
Stationsvarianten und dem Figuren-Pool mit Kostümen. Referenzen liegen schon vor: Visuals 23, 26, 33 und 51
(Mystischer Freizeitpark). Erlaubt sind neue Daten, neue Teile, neue Shader-Presets und höchstens ein neues
interaktives Element; alles, was mehr Code braucht, ist ein Befund gegen das System und wird im Plan vermerkt.
Bahntyp der Zone und ihre Rezepte: Entscheidung mit Florian, wenn die Basiszone steht.

### Rückfragen zu Paket 9 (Runde 5b)

Keine; Bahntyp und Rezepte des Neonparks folgen nach der Basiszone.

**Status: bestätigt am 24.10.2026.**

## Quellen der Recherche zu Paket 4

- Cut the Rope, Spielelemente je Box: https://cuttherope.fandom.com/wiki/Gameplay_elements und
  https://cuttherope.fandom.com/wiki/Fabric_Box (30 Sterne für die zweite Box); vierte Box rund 190 Sterne:
  https://www.macworld.com/article/208314/cuttheropereview.html
- Drei-Sterne-Systeme (Angry Birds, Cut the Rope): https://yukaichou.com/?p=40289; Kritik „Trostpreis-Sterne“:
  https://toucharcade.com/?p=75409
- Incredible Machine und Contraption Maker (Teile: Zahnräder, Flaschenzüge, Wippen, Trampoline):
  https://www.mobygames.com/game/2473?s=platform, https://store.epicgames.com/p/contraption-maker-66e1ec
- Poly Bridge, Rampen und Sprunglevel: https://www.nintendo.com/en-gb/Games/Nintendo-Switch-games/Game-1318070.html,
  https://www.speedrun.com/poly_bridge/levels
- Züge, die das Gleis verlassen (Unvorhersagbarkeit): https://coasterbuzz.com/Forums/PostLink/273664
- Coin-Magnet, Kraft wächst mit der Nähe: https://discussions.unity.com/t/magnetic-object-to-make-coins-move-to-object/56921
- Zeitlupen-Unfallkamera (Burnout): https://giantbomb.com/wiki/Franchises/Burnout, https://beamng.com/posts/1712091/
