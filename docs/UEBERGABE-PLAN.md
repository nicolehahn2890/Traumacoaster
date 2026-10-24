# Übergabe für die Plan-Session: der große Plan für die erste Zone

Stand 24.10.2026, abends. Diese Datei ist die Eingabe für eine neue Session, die den großen Plan schreibt. Sie sagt,
wofür der Plan gilt, was entschieden ist, was noch offen ist (und bei wem), was der Plan enthalten muss, welche
Dateien die Session liest und wie sie arbeitet.

## 1. Wofür der Plan gilt

Der Plan ist der Produktionsplan für **die erste Zone (Alpen) im finalen Look mit allen Achterbahn-Features und
Levelzielen** und für **die Systeme, die danach jede weitere Zone billig machen**. Er löst den alten Plan
(`docs/PLAN.md`, 18 Anpassungen nach dem ersten Spieltest) ab. Er ist kein Techniknachweis mehr: Die
Technik-Entscheidungen stehen in `docs/RICHTLINIE.md` und sind durch das Tiefen-Labor und Schritt 1 (Perspektive
hinter Schalter im Spiel) belegt. Der Plan ordnet an, was in welcher Reihenfolge gebaut, gemalt und entschieden
wird, mit Abnahme je Etappe.

Zur Frage, ob der finale Look und der Aufbau von Zonen und Leveln erst mit dem Plan entstehen: **ja.** Die Richtlinie
hat entschieden, *wie* gerendert wird (Perspektive, Tiefenpuffer, Schatten, Shader, Stützen, Leistung) und *womit*
(gemalte Kulissen, Three.js-Welt, Pixi-HUD). *Wie es aussieht* (Regeln, Palette, Detaildichte, Formen) und *wie eine
Zone in Level zerfällt* sind nicht entschieden; sie sind die ersten beiden Pakete des Plans, nicht sein Ergebnis am
Ende. Der Plan legt sie als Arbeitspakete mit Toren an, Florian nimmt die Stilprobe ab, bevor Assets in Menge
entstehen.

Nicht im Plan (bewusst später): Karte und Morph (Florian: „nach Bahn und Leveln“), Audio, Store-Builds, die
weiteren neun Welten als Inhalt (nur als Nachweis, dass die Systeme sie tragen).

## 2. Prüfung der Klarstellungen und Fragen vom 24.10.

Quelle: `docs/research/2026-10-24-klarstellungen-und-fragen.md`. Stand je Punkt: **erledigt**, **entschieden**
(Richtlinie), **gebaut** (im Spiel oder Labor), **offen (Plan)** = der Plan muss es ausarbeiten, **offen (Florian)**
= Entscheidung oder Material von Florian nötig.

| Nr. | Klarstellung | Stand |
|---|---|---|
| K1 | Art Direction fehlt, wird erarbeitet; GPTs Datei ist nur ein Vorschlag | **offen (Florian + Plan): der größte Rest.** Es gibt eine Technik-Richtlinie, aber keine verbindliche Stilbibel für den neuen Look. `docs/ART.md` beschreibt noch den Prototyp-Stil (drei Töne, Punktraster, schwarze Stämme); die GPT-Elemente sind gemalter, weicher, ohne Konturen. GPTs Vorschlag liegt lokal (`refs/traumacoaster-gpt explore/doc/Art-Direction-Vorschlag.md`) und ist noch nicht gegen Florians Vorgaben geprüft. Der Plan braucht als Paket 0 eine Art Direction v2: eingefrorene Referenzen, Regeln, Zonen-Looks, eine Stilprobe als Tor. |
| K2 | Zeichnen gut, bis auf Bugs und Entgleis-Einstellungen | **offen (Florian):** die Liste vom Testtag fehlt. Teilweise vorhanden: Befunde vom 21.10. in `docs/HANDOVER.md`, Abschnitt 6 (unerfüllbare Ziele, Stützen im Wasser, Portal-Platzhalter, Bergbauer, Scheiben am Bahnhof, Startart-Symbol). Der Plan braucht beides als Backlog-Eingabe. |
| K3 | Optisch nur Prototyp | erledigt (Einordnung). |
| K4 | Lesart Pinsel bleibt | **entschieden.** Bühne, Ein Strich und Ebenen werden nicht weiterverfolgt; ihr Ausbau ist im Plan zu terminieren (offen, Plan). |
| K5 | Stil Rayman × Earle, vereinfacht, animiert, Shader, Schatten, Licht; Alpen bis Cyberpunk mit einem Look | Technik **gebaut** (Labor: fünf Looks per Shader, Schatten, Nebel, Licht). Die *Vereinfachungsregeln* des Stils sind K1. |
| K6 | GPT-Bilder gefallen; Detailgrad wie „Alpenkurve · 16“ und „Glutgrund · 38“, Stil wie „Smaragdhain · 07“ und „Straßenkarussell · 24“ | festgehalten; wird in K1 zur Regel. Die Namen sind die Bildtitel in den Spielbild-Visuals (Levelname · Nummer), Dateien in `refs/traumacoaster-gpt explore/visuals/`: Alpenkurve = `15-desktop-alpen-strassenbahn-querschnitt-v3.png` (Straße), Glutgrund = `16-desktop-glutgrund-fuenf-ebenen-v2.png` (Stahl), Smaragdhain = `04-spiel-desktop-ornamentwald.png` (Holz, laut Bildprompt), Straßenkarussell = `09-spiel-desktop-strassenkarussell.png` (Stahl). |
| K7 | S-Formen und organische Portale gefallen; Bauteile für andere Zonen fehlen | festgehalten; Bauteil-Listen je Zone: offen (Plan). |
| K8 | iPhone wirklich Vollbild | **gebaut** (Commit bc795cb, `src/platform/safeArea.ts`); auf Florians Handy noch nicht ausdrücklich bestätigt. |
| K9 | 2,5D als Vorteil nutzen | **entschieden und gebaut** (Perspektive um das Kameraziel, Strich als Strahl, Commits 0893e4b und 15aa4e1). |
| K10 | Erst eine Zone fertig; Themes Autobahn/Stahl/Holz/Hängebahn mit Zügen; Levelziele festlegen; Werkzeuge optimieren | Bahntypen und Stützen **im Labor gebaut** (Richtlinie 3a); Züge nur als Seitenansichten; **Levelziele offen (Plan)**; Werkzeuge: nur Größen per Adresse, Rest offen (Plan). |
| K11 | Startarten sichtbar (Kettenzug, Launch, Hängebahn) | **offen (Plan):** Gestaltung und Bau; in der Richtlinie nur benannt (Etappe 4). |
| K12 | Skizze 2014: organische schräge Pfeiler, dicke Gleissilhouette | Richtung im Labor **gebaut** (Holzböcke, verrückt, verzweigt); finale Form ist Teil von K1. |
| K13 | Bilder bei Bedarf mit GPT | Pipeline-Regeln in Richtlinie 9 **entschieden**; konkrete Aufträge offen (Plan). |
| K14 | Figuren im Originalstil, South-Park-Animation, Schlangen reagieren, Kollisionsverbot | Runtime-Entscheidung (Eigenbau-Cut-out) **entschieden**; alles andere **offen (Plan + Florian):** Figurenbogen in Florians Stil, Teile-Slots, Reaktionen, Schlangenbereich. GPTs Versuche liegen in `refs/traumacoaster-gpt explore/character/`. |
| K15 | Bahnstart vorgegeben und länger, Zughäuschen, Schlange wächst | **offen (Plan):** Stations-Modul mit Vorgabestück, Häuschen, Warteschlange. |
| K16 | Karte: Rad, Miniaturen, sauberer Morph | bewusst später (Florian); mit 3D-Welt leichter, Notiz in Richtlinie 10; Konzepte in `refs/traumacoaster-gpt explore/moodboards_map/`. |

| Nr. | Frage | Stand |
|---|---|---|
| F1 | 2D oder 3D; GPTs Übergabe prüfen | **entschieden** (Richtlinie 2) und mit Labor und Schritt 1 belegt; GPTs PDF (`refs/traumacoaster-gpt explore/doc/02-Umsetzungsplan.pdf`) in Richtlinie 11 bewertet. |
| F2 | Meshy-Modelle | **beantwortet** (Richtlinie 3a): Flächen malen, Volumen nur wo die Bahn sie braucht, 3D für Wagen. |
| F3 | Bahn und Landschaft verschmelzen, Stützen passend | Technik **gebaut** (Labor: Tiefenpuffer, Füße auf Kulissen); Element-Metadaten und Dreiteiler: offen (Plan). |
| F4 | Parallaxe oder echtes 3D | **entschieden:** 3D mit schwacher Perspektive, Zoom als Kamerafahrt; GPTs Parallaxentest (`refs/traumacoaster-gpt explore/parallax baukasten test/`) belegt Schichtung, nicht Spielbarkeit. |
| F5 | Zone als Level, begrenzter Ausschnitt, Absperrband, Untergrund mit Fortschritt | Konzept **angenommen**; Datenmodell, Kameragrenzen, Fortschrittsregeln **offen (Plan)**. |
| F6 | Tunnel vorgegeben (Baustelle) und/oder dynamisch | **entschieden:** beides (Richtlinie 4); Regeln, wo gegraben werden darf, und Kosten: offen (Plan). |
| F7 | Übergänge animiert, alles als Startpunkt/Tunnel/Säule | Technik **gebaut** (Freilegung im Labor); Autoring der Elemente: offen (Plan). |
| F8 | Zeichengröße, Vollbild, Zoom, Verteilung | Zahlen und Testparameter **gebaut** (Richtlinie 7, `?tip=&line=&band=&dzoom=`); **Entscheidung offen (Florian):** Bildwinkel, Größen; HUD-Anordnung für große Finger: offen (Plan). |
| F9 | Figuren | siehe K14. |
| F10 | Schatten | **entschieden** (Shadow Map bleibt, Richtlinie 5). |
| F11 | Shader: Umfärben, Glitzern, Nebel, Wasser, Partikel, Lichtquellen, Tag/Nacht je Fortschritt | Technik **gebaut** (Labor); Produktionsform (RGB-Masken, Farbtabellen, Rausch-Texturen) und die Regel „Look ändert sich mit dem Zonenfortschritt“: offen (Plan). |

Aus den Erwartungen: Technologien, Mix 2D/3D/Shader, ehrliche Vergleiche, Richtlinie: **erledigt**. „Mit kleinem
Team automatisiert viele Zonen und Level“: als Konzept in Richtlinie 10, als Produktionssystem **offen (Plan)**.

**Ehrlich zusammengefasst:** Geklärt ist die Grundtechnik (Projektion, Renderer-Weg, Tiefe, Schatten, Shader,
Stützen, Leistung). Nicht geklärt sind der finale Look als Regelwerk und alles, was Spielinhalt ist: Levelziele,
Zone-als-Level, Station und Startarten, Figuren und Schlange, Werkzeuge. Genau das ist der Stoff des Plans.

## 3. Entscheidungen, die noch bei Florian liegen (vor oder im Plan)

**Florian entscheidet bei allem mit.** Der Plan setzt seine Ideen um, und die hat er noch nicht vollständig genannt.
Deshalb schreibt die Session keinen fertigen Plan aus den Dokumenten, sondern holt zuerst seine Ideen ein, Paket für
Paket, und schreibt den Plan iterativ mit ihm (Arbeitsweise in Abschnitt 6). Die folgenden Punkte sind die
bekannten offenen Entscheidungen; sie ersetzen das Gespräch nicht.

1. **Perspektive:** bleibt sie, und mit welchem Bildwinkel (12, 18, 24)? Test auf dem Handy mit `?persp=1&fov=…`.
2. **Zeichengrößen:** Tropfen, Linie, Gummiband, Zeichen-Zoom (`?tip=&line=&band=&dzoom=`); Empfehlung in Richtlinie 7.
3. **Referenzen einfrieren:** welche drei bis fünf Bilder sind *der* Maßstab (Vorschlag: die vier aus K6, Bilder 15,
   16, 04 und 09, dazu der Elemente-Bogen `refs/traumacoaster-gpt explore/elements_png/`)? Sind die S-förmigen
   GPT-Elemente stilistisch final?
4. **Wagen:** 2D-Seitenansichten (wie heute und im Labor) oder 3D-Körper mit gemalten Flächen (Richtlinie 9 empfiehlt
   3D nur für Rolls)? Entscheidet, ob Rolls und Schrauben ins Feature-Set kommen.
5. **Bugs und Entgleis-Einstellungen** vom Testtag: die Liste (Ergänzung zu `docs/HANDOVER.md`, Abschnitt 6).
6. **Figurenbogen:** Florians Original-Figuren (Teile: Kopf, Frisur, Oberteil, Hose, Schuhe, Münder) als Vorlage für
   das Rig; ohne Bogen kann der Plan das Figurensystem nur abstrakt beschreiben.
7. **Was weg darf:** die drei anderen Lesarten, der Spur-Filter (Punktraster), die 150 spurbasierten Level als Inhalt
   (die Daten bleiben als Vorrat). Empfehlung: ja, alles drei, im Plan terminiert.
8. **Welche Teile erzeugt werden:** die Liste der Kulissen, Elemente, Wagen, Figuren und Stationsteile (Paket 0 und
   Paket 8) legt die Session als Vorschlag mit Begründung und Reihenfolge vor; eingefroren wird sie erst nach
   Florians Antwort.
9. **Levelzielarten für das ganze Spiel:** der Katalog aller Zielarten (Paket 4) wird als Vorschlag vorgelegt, mit
   Florian abgeklärt und dann festgelegt; danach bestimmt der Plan, welche davon die Alpen einführen.

Die Plan-Session trifft diese Entscheidungen nicht selbst und baut nichts (keine Code-Änderungen). Sie legt zu
jedem Punkt Optionen und eine Empfehlung vor und fragt je Paket nach, statt zu raten. Nichts im Plan gilt als
entschieden, was Florian nicht bestätigt hat.

## 4. Was der Plan enthalten muss

Richtlinie 13 schlägt fünf Etappen mit groben Spannen vor (Weltrenderer 1–2 Wochen, Alpen-Kulissen 1 Woche,
Untergrund 1–2 Wochen, Werkzeuge und Ziele 1–2 Wochen, Produktion laufend). Der Plan übernimmt diese Reihenfolge,
rechnet die Spannen nach und ergänzt, was dort fehlt oder nur benannt ist: Art Direction, Zone/Level-Datenmodell,
Station und Startarten, Figuren, Asset-Aufträge. Vorgeschlagene Gliederung (die Session darf sie verbessern, nicht
kürzen):

0. **Art Direction v2 (Paket 0, läuft parallel zu allem):** eingefrorene Referenzen, zehn Regeln (Formen, Kanten,
   Detaildichte je Quadratmeter, Farbrollen, Lichtrichtung, Bahn als klarste Form, Figuren, UI), Zonen-Looks als
   Shader-Presets (Frühling, Abend, Nacht, Neon, Vulkan sind im Labor angelegt), die drei ersten Alpen-Elemente als
   Dreiteiler (Baum mit Fenster, Fels mit Tunnel, Portal) mit Metadaten, eine **Stilprobe**: ein Schlüsselbild aus
   echten Elementen im Labor, das Florian abnimmt, bevor der große Assetauftrag läuft. Ersetzt `docs/ART.md`.
1. **Weltrenderer (Schritt 2 der Richtlinie, Produktion):** Three-Szene hinter Schalter, Pixi-HUD im selben Kontext,
   Labor-Bausteine als Module unter `src/world/` (Boden, Erdschnitt, Kulissen, Bahnprofile, Stützenfamilien, Wagen,
   Licht, Schatten, Nebel, Looks), Holzböcke instanziert, 100-Punkte-Test gegen die Bühne, Replay grün, Handy 60 fps.
2. **Zone und Level als Daten:** Zone = Szene mit Chunks; Level = Ausschnitt (Kameragrenzen, Absperrband), Station,
   Ziele, Budget, freigeschaltete Werkzeuge und Startarten, erlaubte Grabzonen, Landmarkenstufe; Fortschritt öffnet
   Untergrund und Baustellen; Rezepte, Seeds, Versionen, gespeicherte Lösungsbahnen; Übergang der alten Level-Daten.
3. **Achterbahn-Features:** die vier Typen mit Zügen (Entscheidung 4), sichtbare Startarten (Kettenzug, Launch,
   Hängebahn), Stationsmodul mit Vorgabestück und Häuschen, Elemente (Booster, Bremse, Splash, Launch-Block, später
   Weiche), Stützenfamilien je Typ, Brücken über Wasser, Kollisionsverbot im Schlangenbereich.
4. **Levelziele und Spielelemente:** Katalog aller Zielarten für das gesamte Spiel (Höhe, Looping, Airtime, Tempo,
   Tunnel-Meter, Baustelle verbinden, Schlange versorgen, Fahrgäste fangen …), als Vorschlag mit Florian abgeklärt
   (Entscheidung 9), je Zielart Messung auf der 3D-Geometrie (Richtlinie 11: Bild, Tiefe, Kollision und Ziele aus
   denselben Daten), Darstellung im Spiel, Sterne, Freischaltung; danach, welche Ziele die Alpen-Zone in welcher
   Reihenfolge einführt. Ausgangspunkt: `docs/GDD.md` Kapitel 7 und 8, `src/levels/evaluator.ts`.
5. **Untergrund und Tunnel:** Baustellenpunkt und Freilegung (Choreografie aus dem Labor), Skalarfeld und Graben in
   freigegebenen Zonen, Höhlenräume als Kulissen-Kästen, Wasserfälle, Portale.
6. **Figuren und Schlange:** Eigenbau-Cut-out datengetrieben (Teile-Slots, Ersatzsets, Clips, Statemaschine),
   Schlangenbereich mit Reaktionen, Fahrgäste im Wagen, Rauswurf wie heute.
7. **Werkzeuge und Bedienung:** Pinselgrößen (Entscheidung 2), HUD für große Finger im Vollbild, Zoom/Übersicht,
   Lupe beim Anschluss, Undo, Löschen, Budget; die drei anderen Lesarten ausbauen.
8. **Asset-Pipeline und Aufträge:** Namensschema, Metadaten je Teil, Umfärbbarkeit (neutrale Palette, später
   RGB-Masken), Atlanten/KTX2, die ersten 50–70 Alpen-Teile als Auftragsliste mit Prompt-Vorspann und Reihenfolge,
   als Vorschlag mit Florian abgeklärt (Entscheidung 8). GPTs Prompt-Sammlung liegt in
   `refs/traumacoaster-gpt explore/doc/Bildprompts.md`.
9. **Produktion vieler Level:** Rezepte, Generator, Prüfer (Lösbarkeit mit den freigeschalteten Werkzeugen), Art-Pass;
   Nachweis mit der zweiten Zone.
10. **Etappen mit Abnahme:** je Etappe Inhalt, Ergebnis, Tor (Handy-Messung, Replay, Standbilder, Florians Freigabe),
    grobe Spanne, Abhängigkeiten; die ersten zwei Wochen konkret. Erst die Alpen komplett, dann breit.
11. **Risiken und Grenzen:** Füllrate, Speicher, zwei Renderer im Kontext, Grabungen vs. Rätsel, Figurenzahl, was
    nicht in Version 1 ist.

Jedes Paket nennt: Eingabe, Ergebnis, wer liefert (Florian, Session), Prüfung, Spanne. Technik wird nicht neu
verhandelt; wo der Plan von der Richtlinie abweichen will, begründet er es ausdrücklich.

## 5. Was die Session liest

- `docs/RICHTLINIE.md` (Entscheidungen, Messungen, Abschnitte 3a, 11, 12, 13), `docs/research/2026-10-24-klarstellungen-und-fragen.md`,
  die vier Recherchen `docs/research/2026-10-24-recherche-*.md`, `docs/TECH.md` (4b bis 4e: Pinsel, Perspektive), `docs/HANDOVER.md`.
- Der Spielinhalt von vorher: `docs/GDD.md` (Kapitel 7 Levelziele, 8 Elemente, 9 Welten, 11 Figuren, 13 Art Direction),
  `docs/LEVELS.md`, `docs/PLAN.md` (alt, mit Umsetzungsstand), `docs/ART.md` (alt).
- Das Labor `public/labs/tiefe.html` mit den Standbildern `docs/research/labs/` und `scripts/lab-stills.mjs`.
- Lokal bei Florian, nicht im Repository: `refs/traumacoaster-gpt explore/` mit `visuals/` (35 Bilder), `elements_png/`
  (Elemente-Bogen), `character/`, `moodboards_map/`, `progression demo/`, `parallax baukasten test/` (eigener Prüfbericht
  und Umsetzungsplan darin), `doc/` (`00-Visuals.md`, `02-Umsetzungsplan.pdf`, `Art-Direction-Vorschlag.md`,
  `Bildprompts.md`); daneben `refs/erster Draft 2014.jpg`, `refs/eyvind earle/`, `refs/rayman legends/`,
  `refs/south park - terrence und phillip.png`.
- `recordings/strokes.jsonl`: am 24.10. um 13:23 UTC 253 Striche, davon 10 vom iPhone (395 und 423 × 811, 23. und
  24.10.) und seit 13:04 UTC laufend Perspektiv-Striche aus einem Browserfenster 609 × 811. Die Datei wächst, solange
  ein Dev-Server ohne `TC_NO_RECORD=1` läuft; nie kürzen.

## 6. So arbeitet die Session

- Deutsch, keine Modell- oder Werkzeugnamen in Dateien, Commits oder Kommentaren (die Attributionszeilen am Ende
  der Commit-Nachricht gibt die Session vor). Commit-Betreff beschreibt das Spielverhalten, Rumpf die Dateien.
- Ergebnis: `docs/GROSSER-PLAN.md` (neu), dazu `docs/HANDOVER.md` Abschnitt 1 und 3 nachziehen; `docs/PLAN.md`
  bleibt als Archiv mit einem Hinweis oben. Keine Code-Änderungen in dieser Session.
- `recordings/strokes.jsonl` nie verändern; eigene Browser-Tests nur mit `TC_NO_RECORD=1 npm run dev`.
- Nichts auf `main` pushen, ohne dass Florian es sagt; Branch und Pull Request wie in `docs/HANDOVER.md`, Abschnitt 4.
- Arbeitsweise: erst die Fragerunde, dann der Plan. Die Session zeigt Florian das Gerüst (die zwölf Pakete aus
  Abschnitt 4) und fragt je Paket nach seinen Ideen, mit konkreten Fragen; was GDD, Richtlinie und alter Plan dazu
  schon sagen, dient als Gedächtnisstütze, nicht als Vorgabe. Aus seinen Antworten entsteht je Paket ein Vorschlag,
  dann Rückfrage, dann Festschreiben in `docs/GROSSER-PLAN.md` mit dem Vermerk, wann Florian das Paket bestätigt hat.
  Reihenfolge: zuerst die Pakete, die seine Ideen am meisten brauchen (Zone und Level, Levelziele, Features und
  Startarten, Teile und Elemente, Figuren und Schlange), dann Art Direction, Werkzeuge, Pipeline, Produktion,
  Etappen. Die Technik der Richtlinie bleibt gesetzt, aber auch dort schildert Florian seine Vorstellung, und
  Abweichungen werden mit ihm geklärt, nicht übergangen.

## 7. Abnahme des Plans

Der Plan ist gut, wenn Florian nach dem Lesen weiß, was er morgen und in den nächsten zwei Wochen tut, was er mit
GPT erzeugt (mit fertigen Aufträgen), welche Entscheidungen er wann trifft, woran jede Etappe gemessen wird, wenn
kein Paket Technik erfindet, die die Richtlinie nicht deckt, und wenn jedes Paket auf seinen Ideen beruht und von
ihm bestätigt ist.
