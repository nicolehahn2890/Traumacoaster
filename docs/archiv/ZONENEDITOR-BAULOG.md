> **Archiv (30.10.2026):** Bauprotokoll des Zonen-Editors, Stufen 0 bis 6 und Nachtrag, wörtlich aus
> [ZONENEDITOR-PLAN.md](../ZONENEDITOR-PLAN.md) verschoben. Den Stand je Stufe, Florians Entscheidungen, Abweichungen,
> Platzhalter und offene Punkte sagt der Plan, Abschnitt 6; die Technik steht in [TECH.md](../TECH.md) 4i bis 4m (Stufe 5
> hat dort noch keinen Abschnitt, ihre Technik steht hier).

# Zonen-Editor: Bauprotokoll

Florian bat am 30.10.2026, alles aufzuräumen, die Pläne auf den neuesten Stand zu bringen und Überholtes zu archivieren.
Hier steht unverändert, was je Stufe gebaut, gemessen und geprüft wurde, mit den Befunden des jeweiligen Tages. „Heute“,
„wartet auf Tor …“, „noch offen“ und Zweignamen meinen den Tag, an dem sie geschrieben wurden; alle genannten Zweige sind
inzwischen in `zoneneditor`. Vorne stehen außerdem der alte Kopf des Plans und die überholte Skizze des Datenmodells aus
Abschnitt 5.2. Die Überschriften nennen die Zeilen des Plans vor dem Aufräumen.

## Alter Kopf des Plans (zuletzt am 30.10.2026 ergänzt; Zeilen 3–17)

Stand 27.10.2026. **Startfragen A1 bis A7 von Florian am 27.10.2026 beantwortet (alle wie empfohlen, Abschnitt 9);
Stufe 0 und Stufe 1 gebaut, Tor S1 bestanden (Florian, 27.10.2026); Stufe 2 ganz gebaut, Tor S2: „sieht gut aus“
(Florian, 27.10.2026; ein paar Kleinigkeiten meldet er nach); Stufe 3 gebaut (Farbmenü, Verläufe, Füllstapel,
Ebenenstapel, Luftperspektive, Stile, Looks, SVG), Tor S3 am Mac bestanden („Es scheint alles erstmal zu
funktionieren“; Kleinigkeiten aus S2 und S3 sammelt Florian und geht sie später mit uns durch); weiter mit Stufe 4.
Der Editor muss zuerst am Mac laufen, iPad und Tablet optimieren wir später (Florian, 27.10.2026). Stufe 5 (Earle-Schichten) ist seit 29.10.2026 in
`zoneneditor` (gebaut auf `zoneneditor-tor2`); an Tor S5 hat Florian die Werkzeuge freigegeben und Regel 4 neu gefasst, die Testzone bleibt Vorschlag (29.10.2026).
Stufe 4 ist bis auf die Handy-Messung erfüllt (30.10.2026). Stufe 6 (Bilder, Schnittmasken, Säume, Malvorlagen, KTX2) ist seit
30.10.2026 gebaut, auf dem Zweig `claude/dreamy-dewdney-c96dd5`; Tor S6 wartet auf Florians Malerei nach den bereitliegenden
Vorlagen und die Handy-Messung. Dazu auf Florians Wunsch (30.10.2026): ein Netz um ein Bild wie in Spine (Werkzeug W) und
Bewegen wie in Blender (G, R, S, O mit Einflusskreis) für Netz- und Vektorpunkte, Nachtrag nach Stufe 6.**
Gebaut wird Stufe für
Stufe mit Tor, auf dem Branch `zoneneditor`. Der große Plan (`docs/GROSSER-PLAN.md`)
ruht seit heute auf Florians Wunsch; Etappe 2 steht nach Schritt 7, dem Freiraumfeld und der Freigabe der Ebenen-Probe,
Tor 2b ist offen. Die Session von Etappe 2 hat die Pause per Nachricht bekommen (27.10.2026).

## Abschnitt 5.2: Skizze des Datenmodells vom 27.10.2026, so nicht gebaut (Zeilen 710–741)

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

## Stufe 0: Vorbereitung (Zeilen 794–811)

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

## Stufe 1: Gerüst, Ebenen, Kamera (Zeilen 819–840)

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

## Stufe 2: Formen (Zeilen 847–985)

**Stand 27.10.2026: Kern gebaut, wartet auf Tor S2** (Technik in `docs/TECH.md` 4i). Gebaut: das **Vektornetz**
(`src/zone/faces.ts`): Umriss, Löcher und Teilungslinien einer Form zerfallen in Flächen; jede Fläche hat ihre eigene
Füllung oder ist ein Loch (wie Illustrators Interaktiv malen: die Farbe hängt an einem Punkt in der Fläche, nicht am
Pfad); die Welt zeichnet je Fläche, ein Treffer kennt seine Fläche. **Zeichenstift (P):** tippen gibt eine Ecke, ziehen
eine Kurve (mit Wahltaste nur der Griff nach vorn), Gummiband beim Schweben von Maus und Pencil; auf den ersten Punkt
tippen schließt, auf den letzten tippen, Eingabe oder „Fertig“ beendet; Entf, Cmd+Z oder zwei Finger nehmen den letzten
Punkt zurück, „Abbrechen“ verwirft. Ist eine Form gewählt und berührt der Pfad sie, wird er eine Teilungslinie oder ein
Ring in ihr, seine Punkte rasten an ihren Ankern und Kanten ein; sonst wird er eine neue Form. **Direktauswahl (A):**
Anker und Griffe ziehen (ein runder Anker spiegelt den Griff gegenüber, mit Wahltaste nicht), Doppeltippen auf eine
Linie setzt einen Anker, „Ecke“ und „Rund“, „Punkt löschen“ (Entf), „Linie löschen“ oder „Loch löschen“; eine Fläche
antippen, dann eine Farbe oder „Loch“ (Entf). Enden von Teilungslinien kleben an ihrer Kante, wenn man den Umriss zieht,
und rasten beim Loslassen an Kanten ein. **Formpinsel (B):** freihand, wird eine glatte Kurve mit wenigen Ankern
(Kurvenanpassung nach Schneider; ein gezogener Kreis hat 3 bis 8 Anker, scharfe Knicke bleiben Ecken); geschlossen eine
neue Form oder ein Ring in der gewählten Form, offen quer durch die gewählte Form eine Teilungslinie (auf die Kanten
gekürzt). **Messer (K):** ein Strich quer durch eine Form der aktiven Ebene teilt sie. **Kopieren, Ausschneiden,
Einfügen** (Cmd+C, X, V; „Kopieren“ in der Leiste der Form, „Einfügen“ in der Leiste der Ebene): in eine andere Ebene mit
„Bild halten“ an dieselbe Stelle im Spielblick (gemessen 0,0014 px), mit „Welt halten“ an dieselbe Lage in Metern.
**Spiegeln** waagrecht und senkrecht (Shift+H, Shift+V, zwei Knöpfe). **SVG** („SVG sichern“ und „SVG laden“ unten in
der Ebenenliste, „Als SVG“ in der Leiste einer Ebene): je Ebene eine Gruppe `p3-name` von hinten nach vorn, 1 m = 10 px;
eine Form ist ein Pfad mit ihren Kurven und Löchern, eine geteilte Form eine Gruppe ihrer gefüllten Flächen `s12-f0`
mit echten Kurven (`src/zone/faceCurves.ts`, kein Vieleck); der Rahmen `rahmen-x…-y…` trägt den Ursprung, falls
Illustrator die Datenattribute verliert. Laden: Gruppen mit Ebenen-Kennung ersetzen ihre Ebene; Formen, die unverändert
zurückkommen, bleiben samt Teilungslinien; geänderte Flächen kommen als eigene Formen (Illustrator kennt keine
Teilungslinien); andere oberste Gruppen werden neue Ebenen hinter dem Stapel; gelesen werden Klassen, Stile, alle
Pfadbefehle samt Bögen, Transformationen, Kreise, Ellipsen, abgerundete Rechtecke, Polygone; Verläufe werden Vollton,
Illustrator-Bearbeitungsdaten (`i:pgf`) werden übergangen und gemeldet; ein Schritt im Verlauf. Die Vorschaubilder der
Ebenen zeigen die Flächenfarben. Geprüft: 356 Tests grün (40 neue: Flächen, Pfad-Werkzeuge mit einem Bild ohne Kamera,
Kurvenanpassung, Flächen als Kurven, SVG-Rundlauf auch über eine Illustrator-artige Datei), Build grün, Szenario 12 mit
8 Prüfungen grün (Zeichenstift, Teilungslinie, Fläche färben und Loch, Formpinsel, Messer, Kopie in die Ebene dahinter
mit 0,0014 px, SVG sichern und laden ohne Änderung), am Mac im Browser mit Maus und nachgestelltem Pencil und zwei
Fingern durchgespielt. Spielcode ist nicht berührt. **Platzhalter:** die acht Füllfarben, das Aussehen von Werkzeugzeichen
und Leisten. **Noch offen aus Stufe 2** waren zu diesem Stand: Boolesche Operationen, Vereinfachen, Einrasten im Bild und
am Raster, Mehrfachauswahl und Gruppen, Drehen, Ausrichten, Kurvenstift (Shift+P), Band (O), Skizze als Pause-Ebene;
alle am selben Tag nachgebaut (die Befunde unten und „Rest von Stufe 2 gebaut“).
**Befunde an Tor S2 (Florian, 27.10.2026) und was daraus wurde** (am selben Tag gebaut, Szenario 13):
1. *Zeichenstift wie in Illustrator:* mit Befehlstaste Punkte und Griffe verschieben, auch am laufenden Pfad (Klick ins
   Leere beendet ihn), mit Wahltaste das Ankerpunkt-Werkzeug (Klick auf einen Anker: Ecke oder Rund; aus einem Anker
   ziehen: neue Griffe; an einem Griff ziehen: nur dieser; am letzten Anker des Pfads fällt der Griff nach vorn weg).
2. *Beim Schließen den Punkt drehen:* auf den ersten Punkt drücken und ziehen dreht seine Griffe (beide gleich, mit
   Wahltaste nur der zum Schluss hin).
3. *Rechteck und Lasso, Mehrfachauswahl:* neues Werkzeug **Lasso (Q)**, freihand oder als Rechteck, überall im Bild
   (auch über Flächen); es wählt die Punkte in den gewählten Ebenen und damit ihre Formen. Direktauswahl: Umschalt nimmt
   Punkte dazu, Ziehen bewegt alle gewählten, aus dem Leeren ein Rechteck; Ecke, Rund und Löschen gelten für alle.
   Auswahl (V): Umschalt nimmt Formen dazu, aus dem Leeren ein Rechteck (Formen, deren Umriss es berührt, wie in
   Illustrator); mehrere Formen verschieben (jede in ihrer Ebene unter dem Zeiger), in einer Ebene am gemeinsamen Rahmen
   skalieren, spiegeln, duplizieren, kopieren, färben, löschen; Cmd+A wählt alle Formen der gewählten Ebenen. Ebenen in
   der Liste: Umschalt wählt bis hierher, Befehlstaste nimmt dazu oder heraus, am iPad nach rechts wischen wie in
   Procreate; Rolle, „Als SVG“ und Löschen gelten für alle gewählten.
4. *Die Tiefenleiste ist bei vielen Ebenen viel zu schmal:* stimmt, die Leiste aus Befund 6 (Abschnitt 2) taugt ab etwa
   15 Ebenen nicht mehr. Sie ist weg; jede Zeile zeigt unter dem Namen ihre **Tiefe**: waagrecht ziehen schiebt nur
   diese Ebene (mit den anderen gewählten), 5 cm je Bildpunkt, mit Umschalt 1 cm; tippen gibt eine Zahl. Die
   Abstandspillen bleiben, den Überblick über den Stapel gibt die Ansicht „Seite“.
5. *Ebenen in der Liste ziehen, Gruppen wie in Photoshop (als Info):* Umordnen ist gebaut („Reihenfolge ziehen“ stand
   in Plan 4.4 und in Stufe 1 und fehlte dort): mit der Maus die Zeile, mit Finger oder Pencil das Vorschaubild ziehen
   (sonst rollt die Liste); die Ebene kommt mittig in die Lücke, ist sie zu schmal, rücken die Ebenen dahinter ein Stück
   nach hinten; „Bild halten“ gilt. **Gruppen** fehlten noch (geplant als Ebenen-Gruppen, Befund 6; Baugruppen mit
   festen Abständen bleiben Stufe 8, Abschnitt 3.4); Florian hat sie am 27.10. als Nächstes gewählt.
**Ebenen-Gruppen gebaut (27.10.2026, Szenario 14):** wie Ordner in Photoshop. Gewählte Ebenen gruppieren („Gruppieren“
oder Cmd+G; liegen sie nicht beieinander, kommen sie hinter die vorderste), „Auflösen“ (Shift+Cmd+G, die Ebenen
bleiben), „Gruppe löschen“ (mit Ebenen und Formen). In der Liste steht die Gruppe als Ordnerzeile vor ihren
eingerückten Ebenen: Dreieck klappt auf und zu, Auge und Schloss gelten für alle Ebenen der Gruppe (auch im Spiel),
doppelt tippen benennt um, die Tiefe in der Ordnerzeile schiebt die ganze Gruppe. Ziehen: eine Ebene in die Gruppe (vor
eine ihrer Ebenen, oder direkt nach ihrer letzten mit dem Zeiger eingerückt) und heraus; die Ordnerzeile (Maus: die
Zeile, Finger: der Ordner) zieht die ganze Gruppe mit ihren Abständen, nie in eine andere Gruppe. Damit eine Gruppe ein
zusammenhängender Lauf in der Liste bleibt, hält eine geschobene Tiefe 1 cm vor der nächsten Ebene einer anderen Gruppe
an; dorthin geht es durch Ziehen in der Liste. Im SVG wird eine Ebenen-Gruppe eine Gruppe um ihre Ebenen (in Illustrator
ein Ordner). **Noch nicht:** Gruppen in Gruppen.
**Rest von Stufe 2 gebaut (27.10.2026, Szenario 15; je Paket geprüft und in Florians Teststand übernommen):**
- *Drehen:* über dem Rahmen gewählter Formen sitzt ein runder Griff; ziehen dreht um die Mitte, mit Umschalt in
  15°-Schritten. Gedreht wird vom Anfang des Ziehens aus (nichts summiert sich), zurück auf 0° ist die Form genau wie
  vorher; Linien, Löcher und Flächenfarben drehen mit.
- *Ausrichten und Verteilen:* ab zwei Formen einer Ebene „Ausrichten“ in der Leiste: links, waagrecht mittig, rechts,
  oben, senkrecht mittig, unten am gemeinsamen Rahmen (wie Illustrators „an Auswahl ausrichten“), ab drei waagrecht
  oder senkrecht verteilen (gleiche Abstände der Mitten).
- *Boolesche Operationen:* ab zwei Formen einer Ebene „Verbinden“: Vereinen, vordere von der hintersten abziehen,
  Schnittmenge, Überlappung ausschließen (wie Illustrators Pathfinder). Das Ergebnis behält echte Kurven, Löcher werden
  Löcher; die Farbe kommt von der vordersten Form (beim Abziehen von der hintersten). Teilungslinien und Flächenfarben
  der Ausgangsformen fallen dabei weg (die Meldung sagt es).
- *Vereinfachen:* „Vereinfachen“ in der Leiste einer Form nimmt Anker weg, solange der Umriss höchstens 1,5 Bildpunkte
  (so wie er gerade zu sehen ist) danebenliegt; ein Pinselstrich mit vielen Ankern wird so wenige glatte Kurven.
- *Kurvenstift (Shift+P,* wie Illustrators Kurvenzeichner*):* jedes Tippen setzt einen Anker, die Kurve läuft glatt
  durch alle; ziehen verschiebt einen Anker, doppelt tippen wechselt Ecke und Rund, auf den ersten tippen schließt.
  Berührt der Pfad die gewählte Form, wird er wie beim Zeichenstift eine Teilungslinie oder ein Ring in ihr.
- *Band (O,* Plan 4.3*):* in der gewählten Form auf eine Kante drücken und nach innen ziehen: das Kantenstück bis zu den
  nächsten Ecken (an einem runden Umriss so weit, wie die Kante ungefähr ihre Richtung hält; ein runder Lochrand ganz)
  wird um die gezogene Weite versetzt und eine Teilungslinie, so entsteht eine eigene Fläche zum Färben (das helle
  Randband aus Bild 2, ein Höhlenrand, wenn man an einem Loch nach außen zieht).
- *Einrasten im Bild und Raster:* zwei Schalter oben (Magnet, zu Beginn an; Gitter, zu Beginn aus). Magnet: Punkte rasten an Ankern
  (zuerst) und Kanten aller sichtbaren Formen ein, auch anderer Ebenen, und zwar so, wie sie im Bild liegen: ein Punkt
  der vorderen Ebene sitzt im Spielblick genau auf der Kante der hinteren. Ein kleiner Ring zeigt, wo es einrastet.
  Gitter: das Raster der aktiven Ebene in Metern, seine Weite passt sich dem Zoom an (mindestens 18 Bildpunkte). Gilt
  für Zeichenstift, Kurvenstift, Formpinsel, Direktauswahl und Band.
- *Skizze als Pause-Ebene:* in der Leiste einer Ebene „Skizze“ lädt ein Foto oder Bild (PNG, JPG, WebP). Es kommt neben
  die Zonendatei (`public/zones/<zone>/skizze-….png`, nur mit Dev-Server; ohne ihn bleibt es bis zum Neuladen) und
  liegt in Lage und Perspektive der Ebene, mitten im freien Bild und ganz zu sehen. Es liegt über allen Ebenen (sonst
  verschwände es beim Nachzeichnen hinter den vorderen) und ist **multipliziert**: weißes Papier wird durchsichtig,
  Linien dunkeln ab (abschaltbar, dann normal halbdurchsichtig). Anpassen: Ecke ziehen skaliert mit festem
  Seitenverhältnis, innen ziehen verschiebt; Deckkraft 25, 50, 75, 100 %, Ausblenden, Anderes Bild, Entfernen, alles
  rückgängig. Eine Skizze je Ebene; sie wird mit der Zone gesichert, im Spiel nicht gezeichnet und nicht exportiert.
Geprüft: 384 Tests grün, Build grün, Szenarien 11 bis 15 mit 35 Prüfungen grün (Szenario 15: Skizze laden, verschieben,
an der Ecke skalieren mit 0,00 px Abweichung der festen Ecke, über der vordersten Ebene dunkelt eine Linie auf 58 % ab,
das Papier ändert höchstens 4 von 255, Deckkraft und Mischung rückgängig, im Spiel unsichtbar). Spielcode nicht berührt.
**Platzhalter:** wie oben die acht Füllfarben und das Aussehen der Werkzeugzeichen; neu die Zeichen für Ausrichten und
Verbinden. **Abweichung vom Plan:** Abschnitt 3 nennt Boolesche Operationen, „die änderbar bleiben“; gebaut ist die
angewandte Form wie Illustrators Pathfinder ohne Alt (rückgängig geht, nachträglich ändern nicht).
**Lücken aus 4.3 nachgebaut (27.10.2026, Szenarien 16 und 17; Florian war unterwegs und sagte „mach gerne weiter“):**
- *Formgruppen in einer Ebene* (Abschnitt 4.1 „Schicht … oder Gruppe“, 4.3 „Gruppieren“, Abschnitt 3 Isolationsmodus):
  wie Gruppen in Illustrator. Gewählte Formen einer Ebene mit Cmd+G oder „Gruppieren“ zusammenfassen, auch Gruppen mit
  Formen zu einer größeren (verschachtelt); Shift+Cmd+G oder „Auflösen“ löst die äußerste gewählte auf. Mit der Auswahl
  (V) wählt Tippen die ganze Gruppe, Ziehen bewegt sie; zweimal tippen (ohne Ziehen) geht hinein: ein fein gestrichelter
  Rahmen zeigt die Gruppe, darin wählt Tippen einzelne Formen; Esc, „Gruppe verlassen“ oder Tippen ins Leere geht heraus.
  Die Formen einer Gruppe rücken in der Zeichenreihenfolge zusammen (dorthin, wo die vorderste lag), „Nach vorn/hinten“
  bewegt die Gruppe als Block. Duplizieren legt die Kopie gleich vor das Original (eine ganz kopierte Gruppe wird eine
  eigene), Einfügen in eine betretene Gruppe landet darin. Ausrichten, Verteilen und Verbinden behandeln eine Gruppe als
  ein Teil; eine einzelne gewählte Gruppe lässt sich in sich verbinden; ein Ergebnis aus mehreren Teilen bleibt als
  Gruppe beisammen. Im SVG ist eine Formgruppe eine Gruppe `fg3` in der Ebene; Gruppen, die in Illustrator dazukommen
  oder umgebaut werden, kommen als Formgruppen zurück. Cmd+G gruppiert Formen, sobald Formen gewählt sind, sonst wie
  bisher die gewählten Ebenen.
- *Bogen (Portalform) als Grundform* (4.3 „Grundformen U: Ellipse, Rechteck, Bogen“): neues Werkzeug unter der Ellipse,
  U wechselt Rechteck, Ellipse, Bogen. Unten gerade, senkrechte Seiten, oben ein Halbkreis; ist der Rahmen flacher als
  halb so hoch wie breit, eine halbe Ellipse. Tippen ohne Ziehen gibt 8 × 10 m.
- *Umschalt in 45°-Schritten* (Abschnitt 3 „Einrasten in 45°-Schritten“): Zeichen- und Kurvenstift setzen den nächsten
  Anker waagrecht, senkrecht oder schräg zum letzten (auch das Gummiband), gezogene Griffe drehen in 45°-Schritten,
  gezogene Anker und verschobene Formen laufen nur waagrecht, senkrecht oder schräg, gemessen in Metern der Ebene (im
  geneigten Spielblick bleibt senkrecht wirklich senkrecht). Solange Umschalt gedrückt ist, rastet nichts an Kanten ein.
- *Zahlen* (Abschnitt 2 Punkt 9 „Zahleneingabe, sonst fehlt Präzision“; 4.2 Grundsatz 1 „Zahlen nur auf Wunsch“):
  „Zahlen“ in der Leiste gewählter Formen öffnet X und Y (Mitte des Rahmens), B und H (Meter in der Ebene; die Kette
  ändert beide im Seitenverhältnis) und ↻ (um so viele Grad drehen). Komma oder Punkt, Eingabe übernimmt, Esc verwirft;
  jede Zahl ist ein Schritt im Verlauf.
Geprüft: 400 Tests grün (16 neue), Build grün, Szenarien 11 bis 17 mit 46 Prüfungen grün (Szenario 16: gruppieren,
Gruppe wählen und ziehen, hinein, eine Form allein ziehen, Esc, verschachtelt gruppieren, duplizieren, auflösen, SVG;
Szenario 17: Bogen über U, Breite und Mitte als Zahl, Umschalt beim Verschieben und beim Zeichenstift). Dabei gefunden und
behoben: ein Klick mit gleich folgendem Ziehen galt als zweimal Tippen und ging in die Gruppe (jetzt erst beim Abheben
des zweiten Tippens ohne Ziehen); beim Duplizieren einer ganzen Gruppe behielt die Kopie die Kennungen. Meldungen stehen
jetzt über der Leiste unten, auch wenn sie zweizeilig umbricht; „Nach vorn/hinten“ sind Zeichen. **Platzhalter:** die
Zeichen für Bogen, Nach vorn/hinten und die Kette. **Noch offen aus 4.3:** Schnittmaske (Cmd+7, gehört zu Stufe 6),
Kontur in Fläche (es gibt noch keine Konturen; kommt, wenn Linien mit Breite gebraucht werden), Hilfslinien, Ebenen-
Gruppen in Ebenen-Gruppen. Die Leiste unten bricht mit mehreren gewählten Formen auf zwei Zeilen um, solange die acht
Platzhalter-Farbtupfer darin stehen; mit dem Farbmenü aus Stufe 3 (oben rechts, Plan 4.2) wird sie wieder einzeilig.

## Stufe 3: Farbe, Verläufe, Stile (Zeilen 991–1027 und 1034–1044)

**Stand 27.10.2026: gebaut, wartet auf Tor S3** (Technik in `docs/TECH.md` 4j; Tor S2 gab Florian am selben Tag mit
„sieht gut aus“ frei, Kleinigkeiten folgen). In acht Paketen:
- *Ebenen-Material* (5.3): ein Shader für alle Ebenen, im Editor und im Spiel. Eine Fläche zeigt ihre Grundfarbe und
  darüber ihren Füllstapel (Farbe, linearer oder radialer Verlauf, Deckkraftverlauf; je Füllung Mischmodus Normal,
  Multiplizieren, Negativ multiplizieren, Ineinanderkopieren, Weiches Licht, Farbig abwedeln, Farbe und Deckkraft;
  höchstens 7 Füllungen), dazu die Deckkraft der ganzen Fläche. Gerechnet wird wie in Illustrator im sRGB-Raum.
  Durchsichtige Flächen liegen in einem zweiten Mesh (ein Draw Call mehr, nur wenn es sie gibt), einfarbige nehmen einen
  schnellen Weg, Schichten unter einer deckenden Füllung rechnet der Shader nicht.
- *Farbmenü* (4.2, 4.6): der Farbknopf oben rechts; Scheibe, Klassisch, Harmonie (komplementär, geteilt, analog, Triade,
  Tetrade), Werte (H, S, B, R, G, B, Hex), Paletten (Zonenpalette mit Namen, Platzhalter-Palette), Stile; darunter die
  zehn zuletzt benutzten Farben. Eine gewählte Form oder Fläche bekommt die Farbe, ihre Farbe wird die aktuelle (wie
  Illustrator); neue Formen bekommen die aktuelle. Die acht Farbtupfer der Leiste unten sind weg, sie ist wieder
  einzeilig.
- *Ziehen und Fallenlassen, Weiter füllen, Pipette* (3.1 ColorDrop): Farbknopf, jedes Feld und jeder Stil lassen sich auf
  eine Fläche ziehen (sie leuchtet vorher auf); danach füllt jedes Antippen oder Überstreichen weitere Flächen, bis Esc
  oder „Fertig“. Fällt eine Farbe auf eine Fläche mit Verlauf, fragt die Leiste: Grundfarbe oder Verlaufsstopp.
  Pipette (I) nimmt die sichtbare Farbe auf; am iPad hält man dafür einen Finger (mit Lupe), sobald der Stift im Spiel
  war; mit Wahltaste nimmt sie den ganzen Anstrich und legt ihn auf die Auswahl.
- *Verlaufswerkzeug G* (4.6, Bild 5): über eine Fläche ziehen legt einen Verlauf an (von der aktuellen Farbe zur
  Grundfarbe), über gewählte Formen einen gemeinsamen (in der Ebene an derselben Stelle, jede Form nimmt ihren beim
  Verschieben mit, wie in Illustrator). Am Objekt: Anfang (offener Kreis), Ende (Punkt), Stopps als Farbfelder neben der
  Linie, Mitten als Rauten; Tippen auf die Linie setzt einen Stopp, Wegziehen löscht ihn, das Farbmenü färbt den
  gewählten. Linear, radial, umkehren, Deckkraft je Stopp, Deckkraftverlauf, entfernen.
- *Füllstapel als Liste* (4.2 „Füllstapel als kleine Liste“): „Füllungen“ in der Leiste; je Zeile Auge, Vorschau,
  Mischmodus als Buchstabe (wie das „N“ in Procreate), Deckkraft durch waagrechtes Ziehen; dazu, umordnen, entfernen,
  „Regler“ öffnet einen Verlauf im Werkzeug G. *Ebenenstapel* (4.4) in der Leiste der Ebene: dieselbe Liste über allen
  Formen der Ebene, dazu die *Luftperspektive* der Zone (Farbe, Stärke, ab und bis zu welcher Tiefe, Anteil je Ebene;
  kommt zum Nebel der Welt dazu).
- *Stile* (4.6): als Stil sichern (Griffe als Anteil am Rahmen, passt auf jede Fläche), antippen oder auf eine Fläche
  ziehen verknüpft, „Neu festlegen“ ändert alle verknüpften, löschen lässt ihr Aussehen stehen; wer den Füllstapel
  ändert, löst die Fläche (wie Illustrator); Stil kopieren und einfügen (Cmd+Wahl+C/V, Knöpfe im Füllstapel).
- *Zonenpalette und Looks* (4.6, Paket 2): Felder mit Namen; Flächen verweisen auf ein Feld (globale Farbe); je Look
  (Tag, Abend, Nacht, Neon) eine eigene Farbe, ohne eigene wie Tag; beim Bearbeiten zeigt das Bild den Look. Im Spiel
  tauscht der Look der Fortschrittsstufe die Farben.
- *SVG* (4.10): Verläufe gehen als SVG-Verläufe hinaus, weitere Füllungen als eigene Pfade `s12-L1` mit Deckkraft und
  `mix-blend-mode`; Verläufe aus Illustrator (auch am Rahmen, gedreht, mit Stopp-Verweisen) kommen als Verlauf herein,
  nicht mehr als Vollton; unverändert zurück lässt die Form, wie sie war.

*(Im Plan geblieben: die Abweichungen vom Plan, Zeilen 1028–1033.)*

**Platzhalter:** Aussehen des Farbmenüs, der Füllstapel-Liste und des Verlaufsreglers, die Buchstaben der Mischmodi,
die Platzhalter-Palette (acht Farben), die Vorgabe der Luftperspektive (kühles Hellblau, ab 24 m, voll bei 140 m, 50 %),
die Stopps eines neuen Verlaufs, Name „Stil n“ und „Farbe n“. **Noch offen:** Farbe auf eine Ebene in der Liste fallen
lassen (Ebenenstapel, 4.2: was die Farbe dort tun soll, klären wir), Deckkraftverläufe, Verlaufsmitten, Ebenenstapel und
Luft im SVG, Texturen im Ebenenstapel (Stufe 5). **Nicht geprüft:** am echten iPad (Finger-Pipette nur nachgestellt) und
die 60 fps am Handy. **Gemessen** am Mac (Apple M3 Pro, 2560 × 1600, Probe-Stapel mit 32 Ebenen und 36 großen Formen,
Chromium mit Grafikkarte): leere Welt 3,5 ms, alle Flächen einfarbig 7,3 ms, je ein Verlauf 12,1 ms, je drei Füllungen
(Multiplizieren, Verlauf mit drei Stopps, radialer Verlauf) 21,7 ms. Der Probe-Stapel ist der ungünstige Fall (viele
große, sich überdeckende Flächen); ob das am Handy reicht, zeigt erst die Messung an Tor S3.
Geprüft: 426 Tests grün, Build grün, Szenarien 11 bis 23 mit 83 Prüfungen grün (18 misst 45 Punkte des Shaders gegen
die Rechenvorlage, Tag und Nacht; 19 Farbmenü; 20 Verlaufswerkzeug; 21 Füllstapel und Luft; 22 Stile; 23 Looks).

## Stufe 4: Spiel im Editor (Zeilen 1051–1136, 1167–1199 und 1203–1225)

**Stand 27.10.2026: im Kern gebaut** (Technik in `docs/TECH.md` 4k):
- *Material je Fläche* (fest, grabbar, luftig, frei; Vorgabe grabbar nach Florians Antwort zu B2) in den Leisten von Form
  und Fläche. *Andockkanten:* Oberkanten fester und grabbarer Flächen spielbarer Ebenen bis 35° Neigung, über denen in
  der Ebene nichts Festes liegt, auch der Boden eines Lochs (Höhle); je Kantenstück abschaltbar. Werkzeug D zeigt sie
  grün und das Material als Schraffur (fest dicht, grabbar weit, luftig gepunktet).
- *Tiefe aus Ebenen:* Im Modus „Ebenen: Bodenhöhe“ (wird in Ebenen-Zonen einmal vorgewählt) liest der Pinsel die Tiefe aus
  den Ebenen mit den Regeln der Kamerasession: landen knapp an einer Andockkante, sonst Bodenhöhe 4 m über der Kante,
  durch einen Höhlenmund gezeichnet die Ebene dahinter; Kulisse verdeckt, Vordergrund und Luft sind durchsichtig; die
  Bahn liegt 1 m vor der Ebene. Ein neuer Strich beginnt in der Tiefe der Ebenen; den flachen Boden gibt es in
  Ebenen-Zonen nicht mehr (die Bahn darf unter die alte Nulllinie).
- *Stützen auf Kanten:* Fuß auf der Andockkante der Ebene, an der die Bahn andockt, oder der nächsten davor (im dünnen
  Stapel des Editors fehlte sonst oft eine Ebene davor); kein unsichtbarer Boden.
- *Station auf einer Andockkante* (Werkzeug D, „Station setzen“, Richtung, entfernen): ein Knoten der Zone; im Spiel
  gibt sie den Bahnhof und das Vorgabestück, sie wandert mit ihrer Ebene.
- *Probebahn und Testfahrt:* „Spielen“ (Tab) liest die Ebenen neu; dort zeichnet und fährt man wie im Spiel.
  Geprüft mit Szenario 25 (Station, Strich 3 m über der Kante: Bahn in der Tiefe der Ebene, 22 Stützen auf Kanten, keine
  auf unsichtbarem Boden, Fahrt läuft) und 26 (Höhle: ein Strich durch den Höhlenmund landet auf der Rückwand dahinter,
  die Stützen stehen auf dem unteren Rand der Öffnung, ihr Fuß hinter der vorderen Ebene, wie in Szene 06).
- *Handy-Link* („Handy“ oben links: Adresse im WLAN mit Bildrate), *Leistungsanzeige* (Bildrate, Draw Calls,
  Dreiecke oben links, schon seit Stufe 1).
- *Testszenen* (Florians Wunsch vom 27.10.: Testgrundlage mit organischen, verschachtelten Ebenen, statt alles selbst
  zu bauen): `test-huegel` (Hügelwellen in drei spielbaren Tiefen vor See, fernen Hügeln und Bergen; Baukasten 01, 02,
  Visuals 14, 50, 52), `test-grotte` (Felsmassiv mit Höhlenmund, drei verschachtelte Bögen, Höhlenboden mit See,
  Höhlenwand; Baukasten 03, 05, 06, 10, Montagen „Wald und Grotte“, „Große Bögen“), `test-boegen` (Plateau mit drei
  Fenstern über einer Unterwelt, Überhang, schwebende Insel, Wasserfall; Visuals 21, 27, 31, 33, 35, Baukasten 07, 09).
  Jede mit Station und einem Feld; der Editor beginnt mit dem Feld im Bild. Szenario 27: in allen drei Szenen landet ein
  Strich in den erwarteten Tiefen, die Fahrt läuft. **Platzhalter:** alle Formen, Farben und Tiefen (Testgrundlage, kein
  Inhalt; Szene 06 für Tor S4 bleibt eigens). **Befund:** Ein Teil der Stützen schwebt, wo die Bahn zwischen zwei Ebenen
  liegt oder tief in einer Höhle hinter Bögen andockt (Grotte 5 von 10, Bogenland 4 von 7, Hügel 2 von 6); das gehört zu
  „Stützen auf Kanten“ und zum Freiraumfeld.
- *Freiraumfeld aus Flächen* (27.10.): fest und grabbar sind fest, luftig und frei sind frei; eine Fläche reicht bis zur
  nächsten Ebene dahinter, die die Stelle deckt, die hinterste höchstens 6 m (Platzhalter für die „eingestellte Tiefe“).
  Gerechnet im Bild wie „Bild halten“ (die Ebenen sind Blätter): Ein Loch ist kein Tunnel, eine Fläche hat keine
  sichtbare Oberseite. Folge: Die Bahn liegt nie verdeckt hinter Festem; sie läuft davor und taucht nur durch Öffnungen in
  die Tiefe (Grotte: vor der Felswand zum Mund, dann hinein; Bogenland: erst im Fenster). Pinsel, Stützen (keine im
  Festen, Fuß dort, wo die Stütze im Bild hinter einer Fläche verschwindet) und Fahrt (Tunnel) lesen es. Szenarien 25 bis
  27 grün. **Rest:** In den Testszenen schweben noch 2 bis 4 Stützen je Strich, vor allem vor steilen Wänden ohne Kante
  darunter (Grotte, Bogenland); ob es dort Wandhalter geben soll, ist eine Gestaltungsfrage für Florian.
- *Felder mit Kamerabegrenzung und Rahmen* (27.10.): Werkzeug R im Zonen-Editor; ein Feld antippen, Ecken und Kanten
  ziehen, innen verschieben, „Feld anlegen“, „Umbenennen“, „Feld entfernen“; am gewählten Feld zeigen zwei gestrichelte
  Rahmen, was das Handy quer und hoch ganz herausgezoomt zeigt (gerechnet für 19,5 : 9; **Deutung** von „Rahmen für Hoch-
  und Querformat“, eigene Rahmen je Format zum Ziehen gibt es noch nicht). Beim Spielen gilt das Feld der Station wie am
  Handy (Kamera weich begrenzt, Zoom-Grenze, Absperrband), beim Bauen ist die Kamera frei. Felder sind Knoten der Zone
  (Rückgängig, Sicherungskopie); Felder aus dem Klötzchen-Editor werden beim Laden übernommen und beim Sichern
  zurückgespiegelt. Der Editor startet mit dem ersten Feld im freien Bereich zwischen den Leisten. Szenario 28.
  **Noch nicht im Zonen-Editor:** Ziele, Fortschritts- und Aufwertungsstufe, Schalter eines Felds (sie bleiben erhalten,
  bearbeitet werden sie bis dahin im Klötzchen-Editor).
**Pinsel (29.10.2026, Pinsel-Studie `docs/PINSEL-STUDIE.md`):** Florians Entscheidung 8 der Studie: „Strich 2“ (kausal,
fester Vorlauf 12 m, Knoten gefittet wie beim bisherigen Pinsel, pinkes Band als Vorlauf) ist in Ebenen-Zonen die Vorgabe
des Pinsels; `&strich=1` nimmt den bisherigen Pinsel, `&strich=2` erzwingt Strich 2 auch ohne Ebenen, `&vorlaufm=N` setzt den
Vorlauf in Metern zum Ausprobieren. Fortsetzen und Überzeichnen laufen seit 29.10. vormittags auf Strich 2 (die alte Bahn
bleibt wörtlich, Studie Abschnitt 12; rückwärts Überzeichnetes fällt noch auf den bisherigen Pinsel zurück). Seit 29.10.
nachmittags (Studie Abschnitt 13): Kreuzungen auf gleicher Höhe auf Florians Strichen 11 → 3 (kleiner Versatz im
±6-m-Fenster, Seite je Begegnung, ganze Spur nur an sauberen Kreuzungen), Knoten-Fit 150 m / 180° (`&tol= &even= &span=
&turn=` zum Ausprobieren), Bearbeiten über Knoten und Griffe baut die Bahn einmal je Bild leicht neu statt je
Zeigerereignis. Kantenfelder je Ebene (Studie 13h, 29.10. mittags): ein Rasterindex je Ebene und Flächenliste in
`planeStack.ts`, beim ersten Zugriff nach jedem Neubau des Stapels gebaut (30 bis 80 ms), macht Freiraum, Landung und
Bodenhöhe 60- bis 100-mal billiger bei identischen Ergebnissen; die Vorschau von Strich 2 liegt damit um 1 ms. Handy-
Messung (Studie 13i, headless am Handy-Bild): 54 bis 60 fps bei 862 bis 1396 m Linie, 0 bis 6 % Bilder über 20 ms; der
Rest kommt vom Neubau des ganzen Schienen-Meshs je Vorschau (`setTrack`, Risiko 4), nicht vom Strich. 29.10. nachmittags (Studie
14): Vorlauf dynamisch (3 / 6 / 12 m, `&vorlaufm`, `&freezemax`, `&lookstart`), erste Vorschau nach 3 m; Florians
Antworten und die Pakete 2–5 (Fahrt, Schleifen als Loopings, Mesh inkrementell mit animiertem Nachziehen, Raum) stehen
in Studie 14. 29.10. (Studie 15, Paket 2): Fahrregeln `drive` als Vorgabe (Antrieb mit Mindesttempo 4 m/s,
Stützräder: kein Entgleisen, kein Fall, kein Stillstand, kein Auffahren; Querkraft und Hängen sind Werte), auf
Florians 78 Strichen kommen damit alle Bahnen an statt einer; `&fahrt=1` ist die strenge Fahrt, offen sind
Mindesttempo, Kettenlinie im Zeichnen, ebene Kreuzungen, Schräglage-Deckel und ein sichtbarer Antrieb (Studie 15f).
29.10. (Studie 16, Paket 3): Strich 2 erkennt gezeichnete Schleifen und liest sie als Loopings (Tiefe bleibt,
Mindestradius 4 m mit Aufweitung, Tinte bleibt) oder Bodenschleifen; die Kettenlinie ist ein Deckel (`chainTop`,
greift nur in Feldern mit Aufwertungsstufe). Gemessen entstehen die Loopings, aber Kreuzungen auf gleicher Höhe und
Knicke nehmen zu und die ungewollten Inversionen sinken kaum; Schalter `&schleifen=0`, Kehren bleiben die bisherige
Lesung (hohe schmale U kippen als halbe Loopings), Brücken-Regel nicht gebaut; Entscheidungen in Studie 16f. Nachgang
(Studie 16g, Florian: anlassen und aufklären): Band und ein Teil der Knicke kamen von Nebenänderungen und sind
repariert (Kehre erkennt sich am geraden zweiten Schenkel, Schranken außerhalb von Schleifen wie vorher); die eigenen
Schleifenkreuzungen sind in Ordnung, mehr werden Kreuzungen späterer Stränge über festen Schleifen (Stand gegen alt:
6 → 9, 112 → 189, 196 → 297), drei Versuche dagegen ohne Wirkung und wieder ausgebaut (Studie 16h). Florians Einwand
(zu viele Sonderregeln im Pinsel) ist angenommen: Die Garantien „aufrecht außer im Looping“ und „Mindestradius“ sind
an den Schienen und im Fit (Studie 17, 29.10. nachts): Der Oben-Vektor in `sampleTrack` hält den Wagen aufrecht, kopfüber
nur auf dem oberen Bogen eines Loopings (`framePlan` liest Loopings aus der Geometrie: durch die Senkrechte hinauf und
mit Umkehr wieder hinab; senkrechte Kehren drehen sich auf dem Schenkel um eine halbe Drehung), und `relaxCurvature`
rundet vor dem Fit von Strich 2 Ecken unter 4 m Radius (Schleifen und enge Kehren bleiben, höchstens 2 m Abweichung von
der Tinte). Auf den 21 + 27 + 31 Strichen: halbe Rollen −75 bis −92 %, Kopfüber (Fahrt) −29 bis −46 %, Knicke unter 4 m
−20 bis −26 %, Knoten −7 bis −12 %, Bahnen 2–3 % kürzer, Vorschau höchstens +0,1 ms. Die Leseschicht des Pinsels bleibt
unangetastet, bis eine echte Zone zeigt, wie viel Lesung er braucht (offen: Bodenschleifen und Kehren unter 4 m, die
der Pinsel flach liest, aber steil baut).
Offen in Stufe P1: Mesh und Abtastung des festen Teils behalten (Renderer), Restkreuzungen in dichten
Schleifenhaufen (strukturell, Stufe P2). Zonen ohne Ebenen zeichnen weiter mit dem bisherigen Pinsel.

*(Im Plan geblieben: „Editor zuerst, Strich eingefroren, Aufnahme aus“, das Testmenü und Florians Antworten zum Rest von Stufe 4, Zeilen 1137–1166.)*

**Spielobjekte auf Kanten (30.10.2026):** neues Werkzeug **Spielobjekte (S)**. Station, Schlange, Baustelle und Coins
sind Knoten einer spielbaren Ebene (`queue`, `site`, `coins` neben `station`; `src/zone/playObjects.ts`): Knopf in der
Leiste, dann eine grüne Andockkante antippen (Coins: über einer Kante in die Luft). Antippen wählt, ziehen schiebt
Station, Schlange und Baustelle entlang der Kanten, auch auf die Kante einer anderen Ebene; die Enden der gewählten
Schlange ändern ihre Länge; Coins bleiben beim Ziehen in ihrer Ebene. In der Leiste: Richtung und Länge der Station,
Eingang der Schlange, Verbinden oder Durchbruch mit Tempo, Form, Zahl und Abstand der Coins, Entfernen (auch Entf).
Höhe und Tiefe folgen aus Kante und Ebene wie bei der Station: Schlange und Baustelle stehen auf der Kante, alles in der
Spur der Bahn 1 m vor der Ebene. Beim Spielen stehen sie als die Platzhalter des Klötzchen-Editors in der Welt, die Coins
zählen auf der Bühne, die Durchbruch-Wand geht in die Fahrt. Das Verbinden einer Baustelle legt in Ebenen-Zonen noch nichts
frei (es braucht eine Öffnung in einer Fläche, also die Portale in Stufe 7). Die Station wohnt jetzt im Werkzeug S (im
Werkzeug D führt ein Knopf dorthin). **Ziele, Stufen, Schalter:** im Werkzeug Felder am gewählten Feld „Ziele“ (Zeile wie
im Klötzchen-Editor), „Stufe“ und „Aufwertung“ (weiterschalten), „Schalter“ (Zeile) und „Look“ der Stufe; sie stehen im
Feldknoten und gelten beim Spielen. Szenario 29. **Platzhalter:** alle Figuren und Formen der Objekte (Bahnsteig,
Figuren der Schlange, Pfosten und Wand der Baustelle, Coin-Marken), Schlange 8 m beim Setzen, Coins 5 im Abstand 2 m,
Durchbruch 10 m/s, die Zeilen für Ziele und Schalter (Eingabefeld des Browsers statt eigener Oberfläche).
**Wand- und Deckenhalter (30.10.2026, Vorschlag; Florian, 28.10.: „Stützen bekommen Wandhalter und Deckenhalter, jeweils
in mehreren Varianten“):** Befund vorher: Eine Stütze „schwebt“, wenn unter der Bahn keine Andockkante trägt; sie fehlt
dann ganz. Mit den Strichen von Szenario 27 waren es 3 im Hügelland, 2 in der Grotte und 2 im Bogenland, jedes Mal vor
einer steilen Wand 0 bis 1 m hinter der Bahn. Jetzt sucht der Planer dort erst eine **Wand**: die vorderste spielbare
Ebene von der Tiefe der Bahn bis 4 m dahinter, die höchstens 4 m unter dem Anschluss fest wird (auch eine steile Flanke).
Die Konsole hält 2,6 m unter dem Anschluss im Festen. Dann eine **Kante etwas weiter hinten**: Der Pinsel legt die Bahn
manchmal mehr als 1 m vor ihre Ebene; dann trägt eine Kante bis 4 m dahinter eine gewöhnliche Stütze. Dann eine
**Decke**: die niedrigste feste Unterseite 3,2 bis 12 m über dem Anschluss, darunter Platz für den Zug. Die Stangen
hängen 1,3 m hinter der Bahn, der Zug fährt davor vorbei. Je drei Varianten: Wand **V-Konsole** (wie Szene 06),
**Kragarm** (wie `bahn und strecke/15-wandkonsole`), **Bogenkonsole**; Decke **Hänger** (zwei Stangen), **Pendel** (eine
Stange mit Gabel), **V-Hänger**. Jeder Lauf von Haltern einer Art nimmt die nächste Variante; `&halter=1` bis `3` zeigt
eine allein. Die Halter nutzen die Teile der Stützenfamilie des Bahntyps (keine eigenen Draw Calls); die Hängebahn hat
Pfeiler statt Haltern. Ergebnis: In den drei Testszenen schwebt keine Stütze mehr (Wandhalter 3, 2 und 2). Neue
Halter-Probe `test-halter` (Felswand ohne Kante, Überhang über einem See): 7 Wandhalter, 5 Deckenhalter, 2 Stellen ohne
Halt (die Bahn zu dicht unter dem Fels oder zu weit von allem). Szenario 30. Vergleichsblatt mit den Vorbildern (nur
lokal, es zeigt Bilder aus `refs/`); unsere Bilder allein: `docs/research/halter/2026-10-30-halter-vorschlag.jpg`.
**Platzhalter:** alle Formen und Maße der Halter, die Reichweiten (4 m, 2,6 m, 3,2 bis 12 m), die Regel „je Lauf die
nächste Variante“. Gemalte oder modellierte Halter gehören zur Stützen-Werkstatt (Etappe 4 im großen Plan).

*(Im Plan geblieben: Florian, 30.10., zu Haltern, Bahn und Zug, Zeilen 1200–1202.)*

**Szene 06 in Formen (30.10.2026, Vorschlag für Tor S4):** Zone `szene-06` aus `npx tsx scripts/testzonen.ts szene-06`, in
der Lage der gemalten Fassung (Zone `ebenen`, Feld „Oben“ 0 bis 96 × −12 bis 66 m): Bogen, Terrasse und Wiesenmasse
übernehmen deren Umrisse (dort in Etappe 2 aus den Bildern des Baukastens gewonnen). Ebenen von vorn nach hinten: Farn
(Vordergrund, −3 m), Terrasse (4 m, der Boden der Höhle vorn), großer Bogen mit Grasdecke (8 m, Station auf der Grasdecke),
Ring hell (11 m) und Ring tief (14 m) in der Öffnung, Höhle (18 m, Rückwand mit Lichtschacht und Graten), Bäume (26 m,
Kulisse), Wiese (30 m, Kulisse: als spielbare Ebene nahm der Pinsel Striche knapp über der Grasdecke als Bahn auf der Wiese
dahinter; im Editor mit einem Klick wieder spielbar), See (60 m), Berge (70 m). Earle-Vorgaben auf allen Formen außer
den Bergen. Die zwei Steinportale des Originals fehlen (Portale, Stufe 7): Die Bahn fährt durch die große Öffnung in die
Höhle. **Geprüft (Szenario 31):** Ein Strich über die Grasdecke, vor der Bogenwand hinab und durch die Öffnung landet mit
seinem Ende auf der Höhlenwand (Spur 2,02), 7 Stützen auf Kanten (in der Höhle auf dem unteren Rand der Öffnung und der
Terrasse davor, wie im Original), eine Stelle ohne Halt (die Bahn liegt dort 5 m vor dem Bogen, weiter als die Wandhalter
reichen), die Fahrt läuft. **Bildzeit** (Mac M3 Pro, Metal, Handy-Bild 1688 × 780 px, `scripts/earle-bildzeiten.mjs`):
mit Earle 1,45 ms je Bild, ohne Earle 1,35 ms, Grotte zum Vergleich 1,43 ms; am Handy noch nicht gemessen. Unsere Bilder:
`docs/research/szene-06/2026-10-30-szene-06-vorschlag.jpg`; der Vergleich mit der gemalten Fassung nur lokal (Bilder aus
`refs/`). **Platzhalter:** alle Formen außer den übernommenen Umrissen, alle Farben, Tiefen und Earle-Vorgaben, die Lage
der Station. **Bekannt:** Das hohe Feld erscheint in der Perspektive als Trapez; sein unterer Rand liegt beim Start knapp
unter der Leiste unten. **Florian, 30.10.:** Mit Earles Bildern hat Szene 06 nur die Silhouette gemein; den Stil findet
Florian.
**Tor S4, was noch fehlt:** Florian passt Szene 06 an, zeichnet und fährt selbst eine Bahn durch die Höhle (die Werkzeuge,
nicht das Gefühl des Pinsels) und misst am Handy (`?zone=szene-06&dev=1&earle=messen`, dazu eine Fahrt mit der Anzeige).
Die Formen der Halter gehören nicht zum Tor, sie kommen mit dem Look. „Replay grün“ wartet, bis er wieder aufnimmt. **Platzhalter:** Vorgabe „grabbar“, 35° Grenze, Station 1 m über der Kante und 14 m
lang, die Schraffuren. **Nicht geprüft:** Szene 06 in Formen (Tor S4), Stroke-Replay mit dem Ebenen-Pinsel (der Replay
kennt den Modus nicht), 60 fps am Handy.

## Stufe 5: Earle-Schichten (Zeilen 1238–1356 und 1366–1370)

**Stufe 5 begonnen (29.10.2026, Florian: „mit Earle-Look anfangen“; Zweig `zoneneditor-tor2`, der Pinsel läuft
parallel in der Pinsel-Studie).** Paket 1 gebaut: Earle-Schichten als Füllungen im Füllstapel (`src/zone/paint.ts`):
**Lichtkante** und **Innenschatten** (Sichel aus dem Kantenabstand, um die Lichtrichtung verschoben, hart oder weich),
**Pünktchen** (Rang-Kachel 64 × 64 mit blau verteilten Rängen, Wabenraster, Punkt bleibt in seiner Zelle; Dichte aus
Lichtkante, Schattenseite, allen Kanten, dem Dunklen oder gleichmäßig; Farbe als hellere bzw. tiefere Stufe der eigenen
Farbe oder fest), **Papier** und **Gouache** (Kachel), **Bänder** (Stufen, Verlauf in der Stufe, Welle) und
**Kantenverlauf** (Ringe entlang der Kante) als Arten des Verlaufs. **Licht der Zone** als Knoten `light` (Richtung,
Licht- und Schattenfarbe, eigene Werte je Look), im Füllstapel als Zeile. **Kantenabstand** je Fläche genau gerechnet
(`src/zone/edgeDistance.ts`, Strecken weitergereicht wie Dead Reckoning) und in einem Atlas (`src/world/earleTextures.ts`).
**Knopf „Earle“** im Füllstapel hinter „Earle …“: Automatisch, Hügel, Fels, Wiese, Krone, Wasser, Ganze Zone
(`src/zone/earle.ts`); ein zweiter Druck ersetzt statt zu verdoppeln. Werte je Schicht in einer Zeile unter der gewählten
Schicht (Wort waagrecht ziehen oder Zahl tippen, `src/zoneeditor/fillParams.ts`). Die vier Mängel des Test-Shaders sind
im Ebenen-Material behoben (Punkt in der Zelle, Zufall ohne Sinus, Muster je Form und Ebene versetzt, keine Schatten).
**Leistung:** Der eine Shader mit Schleife über alle Arten kostete am Mac in Handy-Auflösung je Schicht rund 2 ms (die GPU
schleppt den ganzen Schleifenrumpf mit); jetzt bekommt jede Schichtfolge ihren eigenen geraden Shader (ein Draw Call je
Folge, Testszenen 6 bis 7), durchsichtige Flächen in Läufen gleicher Folge. Messung `scripts/earle-bildzeiten.mjs`
(Mac M3 Pro, Metal, Spielblick 1688 × 780): Ebenen ohne Earle 1,0 bis 1,2 ms je Bild, mit Earle auf allen Flächen
1,4 bis 1,9 ms; Gegenprobe gegen den allgemeinen Shader: kein Bildpunkt weicht um mehr als 1 ab. Kantenabstand beim
Laden 30 bis 120 ms je Testszene, danach nur für geänderte Flächen. Die Vorgaben halten die eigene Farbgebung der Fläche
(Bänder gehen an den eigenen Verlauf, die Felsringe liegen durchscheinend darüber). Vorher und nachher als Standbild in
Handy-Auflösung: `docs/research/earle/2026-10-29-earle-paket1.jpg`. **Platzhalter:** alle Vorgaben und Zahlen der
Presets, die Regel für „Automatisch“, die Papier- und Gouache-Kacheln (erzeugt, bis Florian scannt), die Licht- und
Schattenfarbe. **Nicht geprüft:** Bildrate am echten Handy (Messung am Mac), Pinsel und Fahrt mit Earle-Flächen. **Offen
aus Stufe 5:** Sonne als Griff im Bild, Kantenwelle, Farbnebel, Funkeln, Punktkronen mit Wind, Punktpinsel, Kosten je
Schicht in der Leistungsanzeige; in zwei künstlichen Messvarianten (Testszenen ohne Kantenverlauf bzw. ohne Lichtkante)
wurde es langsamer statt schneller, das wird bei der Handy-Messung mit angesehen.
**Paket 2 (29.10.2026, nach dem Fast-Forward der Pinsel-Studie b658b07 nach `zoneneditor`; Earle-Zweig darauf gesetzt).**
**Punktkronen** (`src/zone/crown.ts`, `src/world/crownMesh.ts`): echte Punkte als Achtecke in einem Draw Call, deckend
ohne discard, Poisson-Scheibe in der Form und bis 15 cm darüber hinaus (gebuckelter Umriss wie Bild 6), dicht und hell
zur Lichtkante, auf der Schattenseite lichter und dunkler, drei Tonstufen bis gelbgrün, in der Tiefe gestaffelt, Wind je
Punkt, unter etwa einem Bildpunkt fallen sie weg; Zeile „Punktkrone“ im Füllstapel mit Werten, „+ Punktkrone“ unter
„Earle …“, die Vorgabe „Krone“ setzt sie (hohe, schmale Formen wie Stämme nicht). **Kantenwelle**
(`src/zone/edgeWave.ts`): ein ruhiges Rauschfeld verschiebt alle Punkte der Form gleich, geteilte Flächen bleiben
lückenlos; nur im Bild, Stützen und Station stehen auf der glatten Kante, darum setzen die Vorgaben sie nicht
automatisch („+ Kantenwelle“). **Sonne als Griff**: der Sonnenpfeil in der Lichtzeile dreht das Licht. **Handy-Messung**:
`&earle=messen` am Spiel (zweiter Link im „Handy“-Feld) misst auf dem Gerät ohne Ebenen, wie gesichert, ohne Earle, mit
Earle auf allen Flächen, je Schicht weniger und eine Kontrollzeile (`src/world/earleMessung.ts`). **Fehler gefunden und
behoben:** Der Zwischenspeicher der Shader legte das durchsichtige Material unter dem Schlüssel des deckenden ab; nach
einem Wechsel der Schichtfolgen zeichnete eine deckende Fläche dann durchsichtig (blass, ohne Tiefe, doppelt so teuer).
Das waren die Ausreißer aus Paket 1; Regressionstest in `tests/earle.test.ts`. **Messung** (Mac, Metal, Spielblick
1688 × 780, Earle auf allen Flächen mit Punktkronen): 1,4 bis 1,7 ms je Bild gegen 0,9 bis 1,2 ms ohne Earle;
Gegenprobe pixelgleich. Vorher und nachher: `docs/research/earle/2026-10-29-earle-paket2.jpg`, Krone neben Bild 6:
`docs/research/earle/2026-10-29-punktkrone.jpg`. **Platzhalter:** Werte der Punktkronen, Tonstufen, Kantenwelle,
die Regel „Stämme ohne Krone“. **Am Handy gemessen (Florian, 29.10.2026, iPhone, Apple GPU, Hochformat 786 × 1262 px,
Hügel-Szene mit `&earle=messen`):** ohne Ebenen 0,87 ms je Bild, wie gesichert 0,73, ohne Earle 0,80, Earle auf allen
Flächen mit 1309 Kronenpunkten 1,77, Kontrolle am Ende 1,80 (stabil). Je Schicht weniger: Pünktchen −0,30 ms,
Papier/Gouache −0,24, Innenschatten −0,17, Lichtkante −0,10, Kantenverlauf −0,04, Punktkronen ±0. Earle kostet am Handy
also rund 1 ms der 16,7 ms je Bild; die Anzeige zeigte dabei 59 fps. Damit ist „Kosten je Schicht am Handy gemessen“
für Tor S5 erfüllt. **Nicht geprüft:** Punktkronen mit Bahn und Fahrt davor, Kantenwelle an spielbaren Kanten. **Offen aus Stufe 5:** Punktpinsel, Farbnebel, Funkeln, Papier und
Gouache aus Florians Scans.
**Paket 3 (29.10.2026).** **Funkeln** (Schicht im Füllstapel): Glanzkreuze je Zelle aus der Rang-Kachel, die in eigener
Phase aufleuchten; „+ Funkeln“ unter „Earle …“, die Vorgabe Wasser setzt es. **Punktpinsel** (Werkzeug E): über eine
Form ziehen setzt Punkte dicht an dicht wie Earles Reihen entlang von Graten; Größe, Ton und „Wegnehmen“ (auch mit
Wahltaste, auf allen Formen unter dem Pinsel, auch Punkte der Punktkrone); gezeichnet mit dem Mesh der Punktkronen.
**Farbnebel** (Werkzeug N, Abschnitt 4.3): in eine Fläche tupfen oder ziehen gibt weiche Tupfer in der aktuellen Farbe
(der Farbe des Farbknopfs). Die Tupfer sammeln sich als Schicht „Farbnebel“ im Füllstapel der Fläche, bis 16 je Schicht,
dann beginnt eine neue; die Farbe ist nach Nähe gemischt, die Deckkraft die Vereinigung der weichen Kreise
(Freiform-Verlauf); Palettenfarben bleiben Verweise und ändern sich mit dem Feld. Ein Ring am Zeiger zeigt die Größe von
Farbnebel und Punktpinsel, die Tasten [ und ] ändern sie. **Fehler gefunden und behoben:** Eine Schleife im
Flächen-Shader kostet unter ANGLE/Metal (Chromium am Mac) einige Millisekunden je Bild, auch mit fester Länge: der
Farbnebel mit einem Tupfer auf allen Flächen kostete +3,5 ms, mit 16 Tupfern +19 ms. Die Shader je Schichtfolge
schreiben die Tupfer jetzt einzeln aus (Plätze 1, 2, 4, 8 oder 16 je Folge), ein Test hält sie schleifenfrei. Das
erklärt wohl auch, warum der allgemeine Shader aus Paket 1 je Schicht rund 2 ms kostete (er läuft in einer Schleife
über die Schichten). **Messung** (Mac, Metal, Spielblick 1688 × 780): Farbnebel mit 1 bis 4 Tupfern auf allen Flächen
kostet nichts Messbares, mit 16 Tupfern auf jeder Form rund +0,8 ms, über Earle auf allen Flächen rund +1 ms;
Gegenprobe gegen den allgemeinen Shader pixelgleich (größte Abweichung 1 Stufe). Die Handy-Messung hat dafür die Zeile
„+ Farbnebel (16 Tupfer)“. Vorher und nachher: `docs/research/earle/2026-10-29-farbnebel.jpg` (Demo-Tupfer, keine
Vorgabe). **Platzhalter:** Startgröße 6 m und Stärke 70 % des Farbnebels, Abstand der Tupfer beim Ziehen, Größen- und
Tonschritte des Punktpinsels, Werte des Funkelns. **Am Handy gemessen (Florian, 29.10.2026, iPhone, Apple GPU,
786 × 1390 px, Hügel-Szene mit `&earle=messen`):** ohne Earle 0,83 ms je Bild, Earle auf allen Flächen 1,83 (Kontrolle am
Ende 1,73), dazu Farbnebel mit 16 Tupfern auf jeder Form 2,70 ms, also rund +0,9 ms im teuersten Fall. Je Schicht
weniger: Pünktchen −0,36 ms, Papier/Gouache −0,33, Lichtkante und Innenschatten je −0,23, Funkeln −0,16, Kantenverlauf
und Punktkronen je −0,10 (Schwankung etwa 0,1 ms, siehe Kontrolle); die Anzeige zeigte 60 fps. Florian: die neuen
Werkzeuge „sehen vielversprechend aus“. **Nicht geprüft:** Malen mit Farbnebel und Punktpinsel am iPad mit dem Pencil
(der Editor ist zuerst für den Mac). **Offen aus Stufe 5:** Papier
und Gouache aus Florians Scans; dann Tor S5 (Standbilder vom Handy neben Earles Favoriten, Florians Freigabe).
**Tor S5 vorbereitet (29.10.2026, Florian: „Bereite Tor S5 vor: eine Testszene mit Wiese, Bogen und Baum im Earle-Look
und ein Vergleichsblatt neben Earles Favoriten. Inhalte und Farben nur als Vorschlag markieren.“)** Testzone `tor-s5` aus
`scripts/testzonen.ts` (`npx tsx scripts/testzonen.ts tor-s5` schreibt nur sie): vorn eine Wiese mit der Station, in der
Mitte eine goldgrüne Wiese mit einem großen Baum (Stamm mit vier Ästen unter einer Schirmkrone mit Punktkrone, nach Bild 6
und Earle 03), rechts ein Felsbogen aus Sandstein mit Grasdecke und zwei nach innen dunkler werdenden Ringen (Bild 8,
Baukasten 05 und 06), dahinter eine helle Wiese mit Baumgruppen, ferne Hügel, Berge und eine Wolke. Die Earle-Vorgaben
liegen schon in der Datei (Wiesen: Hügel, Krone: Krone, Stamm und Bogen: Fels, hinten: Wiese). **Standbild** `&bild` am
Zonen-Editor: ohne Leisten, der Spielblick nimmt den ganzen Bildschirm, ein Finger verschiebt nur das Bild, zwei Finger
zoomen; für die Standbilder vom Handy (quer): `?zone=tor-s5&editor=2&bild`. **Vergleichsblatt** (unsere Bilder neben Earles
01, 03, 05 und Florians Bildern 6 bis 8) nur lokal, weil es fremde Bilder enthält; unsere Bilder allein:
`docs/research/earle/2026-10-29-tor-s5-vorschlag.jpg`. **Befund am Blatt:** Krone und Wiesenbänder treffen die Technik
(echte Punkte in der Krone, harte Stufen, Pünktchen an der Lichtkante). Gegenüber Earle und Bild 8 sind unsere Bilder
heller und weicher (wenig Tonwert-Kontrast, blasser Himmel, Dunst über den Bergen), der Bogen ist regelmäßiger als die
geschwungenen Bänder in Bild 8 und seine Kantenpünktchen sind lichter, der Baum hat vier dicke Äste statt vieler feiner.
**Platzhalter:** die ganze Szene (Formen, Farben, Wahl der Vorgaben). **Offen für das Tor:** Standbilder vom Handy,
Florians Urteil und Regel 4 (B1).
**Nachgeschärft (29.10.2026, Florian: „mehr Tonwert-Kontrast, dichtere Kantenpünktchen am Bogen, geschwungenere Bänder
und feinere Äste. Alles weiter als Vorschlag markieren.“)** Eigene Palettenfelder der Szene für die Tiefen (Wiese tief,
Ocker tief, Nachtblau, Berg tief, Creme); die Wiesen laufen von hellem Rand bis tief, ihre Bänder folgen als Kantenverlauf
dem Umriss, dazu S-förmige Bänder. Der Bogen hat innen Bänder in Hellblau, Creme und Nachtblau, schräg verzogen, sodass sie
ungleich breit schwingen, und dichte, feine Kantenpünktchen (Pünktchen-Werte nur in dieser Szene). Der Baum ist eine flache
Silhouette in Nachtblau aus Stamm, vier Ästen und acht Zweigen. Die Kulisse liegt näher (Berge bei 70 statt 120 m), weil der
Nebel der Welt ab 24 m hinter der Bühne zunimmt und bei 140 m ganz deckt; die Berge waren darin fast weiß. Der Generator
hat dafür Palettenfelder je Szene und einen Nachschliff je Form nach der Earle-Vorgabe. Vorher und nachher:
`docs/research/earle/2026-10-29-tor-s5-vorschlag.jpg`. **Befund nach dem Nachschärfen:** Kontrast, Bänder und Äste sind
deutlich näher an Bild 6 bis 8; anders bleiben der blasse Himmel (Look der Welt, nicht der Zone), die Größe der Punkte in
der Krone (größer und gleichmäßiger als in Bild 6), die Zahl der Äste (12 statt eines feinen Netzes) und der Bogen als
ruhige Form in der Landschaft statt der großen Schwünge aus der Nähe in Bild 8. **Platzhalter:** weiterhin die ganze Szene
samt Nachschliff.
**Pünktchen als Verlauf, negative Kantenbreite, zweites Nachschärfen (29.10.2026, Florian: „Können die Pünktchen mehr
einen Verlauf bilden wie beim Dot Shading … Die Breite von Innenkanten muss auch negativ sein können … Schärfe nochmal
nach, versuche auch größere harmonische Grasflächen hinzubekommen“).** **Verlauf als Pünktchen** (`dots` am Verlauf,
Knopf „Pünktchen“ beim Verlaufswerkzeug G, Größe und Abstand in der Wertezeile): jeder Verlauf (linear, radial, an der
Kante, Farbe oder Deckkraft) lässt sich als Punkte zeichnen; wo er voll deckt, wachsen die Punkte zur geschlossenen Fläche
zusammen, wo er dünner wird, werden sie seltener und kleiner, wo er durchsichtig ist, ist keiner. Ein Deckkraftverlauf
löst die Fläche so in Punkte auf. Die Pünktchen-Schicht nutzt dieselbe Funktion (`dotCover` im Shader) und wird zum
dünnen Ende ihrer Reichweite jetzt auch kleiner (gleichmäßige bleiben wie bisher). **Lichtkante und Innenschatten** dürfen
die Breite 0 (Saum rundum, so breit wie „weich“) und negativ haben (Sichel auf der anderen Seite), Grenzen ±40 m.
Gegenprobe Shader je Folge gegen den allgemeinen Shader pixelgleich (größte Abweichung 1 Stufe). **Szene:** die Wiesen
als große Flächen in harmonischem Grün (Gold, Wiese hell, Wiese, tief), drei breite weiche Bänder am Umriss, ein heller
Punktsaum am Rand und ein Pünktchen-Verlauf ins Tiefe statt der S-Bänder. **Messung** (Mac, Metal, 1688 × 780, Zone
`tor-s5` mit `&earle=messen`): wie gesichert 1,84 ms je Bild, ohne Earle-Schichten 0,91 ms. **Platzhalter:** Werte der
Pünktchen-Verläufe und der ganze Nachschliff der Szene. **Nicht geprüft:** am Handy.

*(Im Plan geblieben: Tor S5, Werkzeuge freigegeben, Zeilen 1357–1366.)*

**Earle in `zoneneditor` (29.10.2026, Florian: „Ja, bring Earle nach zoneneditor und stimm
dich dafür mit der Pinsel-Studie ab.“):** Fast-Forward von 11454fb (Pinsel-Studie Paket 2) auf den Earle-Zweig, damit
:5183 Pinsel und Earle zusammen zeigt. Ab jetzt liefern beide Zweige gleich: Die Pinsel-Studie und der Earle-Zweig
(`zoneneditor-tor2`, :5184) holen vor jedem neuen Stand `zoneneditor` herein, dann geht es per Fast-Forward nach
`zoneneditor`. Die Pinsel-Studie hat das per Nachricht bekommen. Nichts ist gepusht.

## Stufe 6: Bilder, Schnittmasken, Säume, Austausch (Zeilen 1381–1448)

**Stand 30.10.2026: gebaut** (Technik in `docs/TECH.md` 4l; Zweig `claude/dreamy-dewdney-c96dd5` ab 78ca3c3):
- *Bild als Füllung, Schnittmaske* (4.8): Ein Bild ist eine Schicht im Füllstapel einer Form oder Fläche, im Rahmen (außerhalb
  durchsichtig) oder als Kachel; es sitzt genau in der Form, ohne Schablone und ohne eigenen Draw Call je Form (ein Draw Call je
  Bild und Schichtfolge). Earle-Schichten darüber wirken auf das Bild wie auf eine Farbe. Wertezeile: Rahmen oder Kachel,
  „liegt auf“ oder „schneidet aus“, Breite. **Bildschicht:** ein Bild in eine leere Stelle der Ebene ziehen gibt ein Rechteck
  mit dem Bild, das ausschneidet (verschieben, skalieren, drehen wie jede Form). **Schnittmaske** wie in Illustrator: Bildschicht
  und Form darunter wählen, Cmd+7 (oder „Schnittmaske“); Wahl+Cmd+7 löst sie wieder. (Ziehen in der Ebenenliste wie Affinity
  gibt es nicht: die Liste zeigt Ebenen, nicht einzelne Formen.)
- *Saum* (4.8): Knopf „Saum“ an der Form, dann ein Streifenbild wählen. Der Streifen läuft an allen Kanten entlang, die in eine
  Richtung zeigen (Vorgabe: oben, ± 50°; unten, links, rechts und rundum gehen auch, Löcher auf Wunsch), und folgt der Form,
  wenn sie sich ändert (auch der Kantenwelle). **Wiederholen:** das Bild ist Anfang | Mitte | Ende (Grenzen im Füllstapel als
  Prozent), Anfang und Ende sitzen an den Enden jedes Kantenstücks, die Mitte wiederholt sich dazwischen. **Strecken:** das ganze
  Bild über jedes Kantenstück. Im Füllstapel der Form über den Füllungen: Höhe, Lage der Kante im Streifen, Richtung, Spanne,
  Anfang, Ende, Löcher, Deckkraft, Auge.
- *Malvorlage mit Fingerabdruck und Größenangabe* (4.10): „Bild …“ › „Malvorlage“ an Form oder Fläche, „Saum-Vorlage: Stück“
  oder „Streifen“ für den Saum. Das PNG hat den Malbereich (Form mit Überstand rundum) in der Zielgröße aus Tiefe und größtem
  Zoom (höchstens 4096 Bildpunkte, sonst sagt die Vorlage, bis zu welchem Zoom sie scharf ist), die Silhouette, beim Saum die
  Kante und die Teilung, im Rand vier Passmarken und eine Zeile mit Größe, Bildpunkten je Meter, Schärfe und Fingerabdruck.
  Dazu SVG mit Schnittpfad (Illustrator) und Begleitdatei; alles als Download und in `zones/<zone>/vorlagen/`.
- *Import gemalter Teile mit Passmarken* (4.10): Das gemalte PNG ins Bild ziehen oder „Bild einsetzen“. Erkannt wird die
  Vorlage am Namen (Procreate behält ihn: `…-v3`), an der Größe oder am Seitenverhältnis (größer gemalt bleibt schärfer, bis
  4096); der Rand fällt weg, das Bild sitzt genau im Rahmen der Vorlage. Ist die Leinwand beschnitten, finden die Passmarken die
  Lage (wenn sie mit im Bild sind). Ein zweites Bild derselben Vorlage ersetzt das erste.
- *Gemalte Teile nach Formänderungen* (Risiko in Abschnitt 7): Der Fingerabdruck merkt den Umriss beim Anlegen der Vorlage;
  Verschieben und Skalieren ändern ihn nicht (das Bild geht mit), Anker schon. Dann steht am Bild im Füllstapel „Form geändert,
  bis N px daneben“, und der Import sagt es auch. Ein Saum zum Wiederholen passt immer; ein gestreckter merkt die Kantenlänge.
- *Umriss aus Bild* (4.8): „Umriss aus Bild“ an einer Form mit Bild gibt ihr den Umriss des Gemalten (wo es deckt) als wenige
  glatte Anker; danach deckt das Bild, und die Form ist eine Form wie jede andere (Andockkanten, Material grabbar).
- *KTX2 beim Kompilieren* (4.11): Nach dem Hochladen und nach jedem Sichern packt der Dev-Server die Bilder der Zone als KTX2
  (Basis Universal UASTC mit Mipmaps, `scripts/zone-ktx2.mjs`, `npm run kompilieren`); das Spiel lädt sie gepackt, am Handy
  und am Mac als ASTC (ein Byte je Bildpunkt statt vier). Die Messzeile oben links zeigt Bilder und Grafikspeicher.
- *Tor S6 vorbereitet* (`npx tsx scripts/tor-s6.ts`): In Szene 06 liegt auf der Grasdecke ein **Platzhalter-Saum** aus
  `grass_rim_trim.png`, zerteilt in die linke Locke (Anfang), ein nahtlos gemachtes Mittelstück und die rechte Locke (Ende,
  hochgerückt, weil das Band im Original nach rechts abfällt). Malvorlagen in `public/zones/szene-06/vorlagen/`: **v1**
  Grasnarbe als Stück zum Wiederholen (1296 × 402 px, scharf bis Zoom 60), **v2** Grasnarbe als Streifen über die ganze
  Oberkante (144,6 m: 4096 × 127 px, scharf nur bis Zoom 15; ein Streifen für eine so lange Kante wird dünn), **v3** der große Bogen (4096 × 2442 px, scharf bis Zoom 14 von 60), **v4** die Rückwand (4096 × 2826 px, scharf bis
  Zoom 35); zu v1 und v2 je eine Unterlage mit der zerteilten Grasnarbe in der richtigen Größe.
- *Wohin ein gemaltes Bild im Füllstapel kommt:* über die Schichten, die die Fläche färben (Farbe, Verlauf, Farbnebel), unter
  die Wirkungen (Lichtkante, Innenschatten, Pünktchen, Papier, Funkeln, Deckkraftverlauf). Befund beim Messen: zuunterst
  eingesetzt verdeckten die Vorschlags-Verläufe von Szene 06 das Bild ganz; behoben vor dem Commit.

**Geprüft (30.10.2026):** 563 Tests grün (23 neue in `tests/bilder.test.ts`), Typprüfung sauber, Szenarien 24 bis 32 allein
gegen den eigenen Server grün (Szenario 32 mit 12 Prüfungen in einer eigenen Zone, die danach wieder verschwindet: Malvorlage
als Download und in `vorlagen/`, gemaltes Bild passgenau, Rot und Blau an den richtigen Stellen im Bild, doppelt so groß
gemalt, „Form geändert, bis 173 px“, Saum über der Kante, Saum-Vorlage, Bildschicht, Umriss aus Bild (Kreis mit 5 Ankern,
Radius 3,98 bis 4,03 m statt 4), Schnittmaske und lösen, nach dem Sichern im Spiel 3 von 3 Bildern als KTX2 mit 12,1 statt
48,4 MB Grafikspeicher). Szenario 31 (Szene 06 mit dem Platzhalter-Saum) fährt weiter durch die Höhle. **Bildzeit**
(`scripts/earle-bildzeiten.mjs`, Mac M3 Pro, Metal, Handy-Bild 1688 × 780): Testszenen wie in Stufe 5 (mit Earle 1,58 bis
2,33 ms, ohne 0,71 bis 0,97 ms); die Gegenprobe der Shader zeigt 0,02 % abweichende Bildpunkte, mit angehaltener Uhr 0 %
(größte Abweichung 1): das Funkeln läuft zwischen den zwei Aufnahmen weiter, die Shader sind gleich. Szene 06 mit gemaltem
Bogen (Testbild 4096 × 2442 aus der Vorlage v3) und Saum: 2,0 bis 2,4 ms je Bild, ohne Bilder 2,1 bis 2,3 ms, also im
Rauschen; ein Draw Call mehr je Bild. **Speicher:** der Bogen in Vorlagengröße kostet als PNG 51 MB Grafikspeicher, als KTX2
13 MB; der Platzhalter-Saum 0,5 MB (KTX2). Rahmen für die Bilder einer Zone: 64 MB (Platzhalter, die Messzeile warnt darüber).
**Platzhalter:** der Saum aus `grass_rim_trim.png` (Bild aus `refs/`, zerteilt; Grenzen 300, 660 und 1380 Bildpunkte, 48
Bildpunkte überblendet) und seine Werte auf der Grasdecke (4,5 m hoch, Kante bei 59 %); Vorgaben eines neuen Saums (1,6 m hoch,
Kante bei 30 %, nach oben ± 50°); der größte Zoom 60, das Handy 390 CSS-Bildpunkte hoch und Auflösung 2 für die Zielgröße der
Vorlagen; Überstand 3 % (mindestens 0,4 m); Rand 64 Bildpunkte; Aussehen der Vorlage (Grau der Silhouette, Striche, Wortlaut
der Zeilen, Magenta der Passmarken); 4096 Bildpunkte als größte Seite; 64 MB Speicherrahmen; 20 s, bis ein ungenutztes Bild die
Grafikkarte verlässt; die Grundfarbe nach „Umriss aus Bild“ (Mittel der Randfarben); das Aussehen der neuen Knöpfe.
**Nicht geprüft:** 60 fps und Speicher am Handy (Florian misst mit `&earle=messen`, neue Zeile „− Bilder und Säume“);
der Weg über Procreate selbst (Import der Vorlage, Malen, Teilen als PNG, AirDrop); am iPad; KTX2 auf einem Handy ohne ASTC.
**Offen aus Stufe 6:** Bilder im SVG der Ebenen (die Malvorlage bringt ihre eigene SVG mit Schnittpfad mit); Ziehen einer
Bildschicht auf eine Form in der Ebenenliste (die Liste zeigt keine Formen); Atlas für viele Bilder (erst wenn die
Draw Calls es verlangen); PSD (B6: später, wenn gewünscht).
**Tor S6, was Florian tut:** In Szene 06 „Bild …“ › „Malvorlage“ am Bogen (oder die bereitliegenden Dateien in
`public/zones/szene-06/vorlagen/` nehmen), in Procreate malen (Vorlage importieren, neue Ebene, über den Umriss bis an den
gestrichelten Rand malen, Vorlage ausblenden, als PNG teilen), das PNG ins Editorfenster ziehen; dasselbe mit der
Saum-Vorlage v1 (oder v2) für die Grasnarbe; sichern; am Handy `&earle=messen` und eine Fahrt mit der Bildrate.

## Nachtrag zu Stufe 6: Netz wie Spine, Bewegen wie Blender (Zeilen 1457–1470 und 1475–1479)

**Gebaut** (Zweig `claude/dreamy-dewdney-c96dd5`):
- *Werkzeug Netz (W)* an der gewählten Form: „Netz automatisch“ (Hülle auf dem Umriss, innen ein Raster: wenige, mittel, viele)
  oder „Netz zeichnen“ (die Form steht unverzerrt, Hüllpunkte um das Bild tippen, auf den ersten Punkt oder Eingabe schließt).
  **Verformen:** Punkte antippen (Umschalt nimmt dazu, aus dem Leeren ein Rechteck), ziehen oder G, R, S; das Bild verzerrt sich
  mit den Dreiecken. **Bearbeiten:** die Form steht unverzerrt wie in Spine; Punkte verschieben ändert, wo sie im Bild sitzen,
  Tippen ins Netz setzt einen Punkt, Tippen auf die Hülle einen Hüllpunkt, Wahltaste auf einen Punkt oder Entf löscht.
  „Zurücksetzen“ nimmt die Verzerrung (der gewählten Punkte oder ganz), „Neu zeichnen“ ersetzt das Netz, „Netz entfernen“ lässt
  die unverzerrte Hülle als Umriss. Der Umriss der Form ist die verzerrte Hülle (Andockkanten, Saum und Physik folgen ihr).
- *Bewegen wie Blender* in Direktauswahl, Lasso und Netz (4.3): G, R, S, X/Y, Klick/Eingabe, Esc/Rechtsklick; O Einflusskreis
  mit Mausrad (auch beim Ziehen eines Punkts), Umschalt+O die Kurve (weich, Kugel, Wurzel, invers quadratisch, spitz, linear,
  konstant). An Vektorpunkten drehen und strecken die Griffe mit; angeklebte Teilungslinien bleiben an ihrer Kante. Die Leiste
  zeigt „Einfluss … m“ und die Kurve; am Zeiger steht, was gerade passiert.
- Gemalt wird in der unverzerrten Lage: eine Malvorlage für eine Netzform hat den unverzerrten Umriss, und Verformen meldet
  kein „Form geändert“. Gesichert wird das Netz in der Zonendatei an der Form; im Spiel zeichnet es verzerrt.

*(Im Plan geblieben: Platzhalter und System, Zeilen 1471–1474.)*

**Geprüft (30.10.2026):** 595 Tests grün (32 neue in `tests/netz.test.ts` und `tests/bewegen.test.ts`), Typprüfung sauber,
Szenario 33 (7 Prüfungen mit Maus und Tasten wie von Hand: Netz automatisch, G verschiebt die Grenze im Bild, Bearbeiten
unverzerrt, O mit Mausrad 7,1 m und 11 Nachbarn teilweise, Esc und Rechtsklick, Direktauswahl mit Einfluss, nach dem Sichern im
Spiel verzerrt). **Nicht geprüft:** am iPad und am Handy (G, R, S, O brauchen eine Tastatur; Knöpfe dafür fehlen noch); die
Bildrate am Handy mit verzerrten Netzen (gezeichnet wird wie vorher, nur mit den Dreiecken des Netzes).
