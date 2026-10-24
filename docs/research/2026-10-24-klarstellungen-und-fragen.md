# Klarstellungen und offene Fragen (Florian, 24.10.2026)

Protokoll der Vorgaben für die nächste Phase: eine Zone im finalen Look, alle Features und Levelziele der
Achterbahn. Die Antworten, Messungen und die daraus abgeleitete Richtlinie stehen in
[RICHTLINIE.md](../RICHTLINIE.md); die Tests liegen unter `public/labs/` (im Dev-Server und auf der
Pages-Seite unter `/labs/`).

## 1. Klarstellungen (Stand der Dinge)

1. **Art Direction gibt es noch nicht.** Sie wird hier erarbeitet. Die von GPT erstellte Datei ist nur ein Vorschlag
   (`refs/traumacoaster-gpt explore/doc/Art-Direction-Vorschlag.md`, lokal).
2. **Zeichnen funktioniert.** Nach einem Tag Test: bis auf ein paar Bugs und Einstellungen beim Entgleisen der
   Wagen ist das reine Ziehen der Bahn nicht schlecht.
3. **Optisch ist alles Prototyp** mit Dummygrafiken.
4. **Die Lesart „Pinsel“ bleibt.** Sie ist mit Abstand die direkteste, die Bahn wird damit am besten gezeichnet.
5. **Grafikstil: Rayman Legends trifft Eyvind Earle.** Mood mystisch, aber freundlich und bunt. Charaktere und
   Achterbahnen total verrückt, alles liebevoll animiert. Der Stil von Rayman und Earle wird vereinfacht; dafür
   sorgen Umgebungsanimationen, Shading, Partikeleffekte und die Kombination aus gezeichneten Grafiken mit
   dynamischen Shadern, Schatten und Licht für die Stimmung. Von Alpenlandschaften im Frühling bis zu
   Cyberpunk-Freizeitparks soll alles möglich sein und trotzdem einen einheitlichen Look haben.
6. **Es gibt etliche GPT-Bilder, die gefallen.** Der genaue Stil und Detailgrad ist noch nicht festgelegt.
   Detailgrad wie in den Bildern „Alpenkurve · 16“ (Straße) und „Glutgrund · 38“ (Stahl); Stil und Earle-Look am
   besten in „Smaragdhain · 07“ (Holz) und „Straßenkarussell · 24“ (Stahl) getroffen
   (`refs/traumacoaster-gpt explore/visuals/`).
7. **Die geschwungenen S-Formen und die organischen Portale** gefallen hervorragend. Die Elemente sind
   optisch sehr gut; es fehlen kleine Details und Bauteile für andere Zonen, der Look stimmt.
8. **Auf dem iPhone wirklich Vollbild.** Aktuell werden oben und unten Flächen abgeschnitten. Die App soll als
   Vollbild-App laufen, mit so viel Platz wie möglich zum Zeichnen.
9. **2,5D ist ein Vorteil.** Die fehlende Tiefeninformation erlaubt, Physik und Perspektive zu unseren Gunsten zu
   verbiegen. Das nutzt das Pinselstrichverfahren schon; das Leveldesign soll es auch nutzen.
10. **Erst eine Zone fertig machen.** Eine Zone wird im Stil finalisiert; darin werden Achterbahn-Themes
    (Autobahn, Stahl, Holz, Hängeachterbahn) mit verschiedenen Zügen ausprobiert und die Levelziele
    festgelegt. Verhalten der Bahn und Werkzeuge werden dabei deutlich optimiert. Ziel: alle Informationen und
    die technische Grundlage, um das Spiel schnell breit zu fächern und mit wenig händischem Grafikaufwand
    viele Level und Zonen zu erstellen.
11. **Startarten sichtbar machen.** Kettenzug deutlich sichtbar, beim Launch ein deutlicher Launchbereich,
    Hängeachterbahn erkennbar.
12. **Die Skizze von 2014** (`refs/erster Draft 2014.jpg`): organische, schräge Pfeiler, Dicke und Aufbau der
    Gleise in der Silhouette. Holzachterbahn und teilweise Stahlachterbahn sollen in diese Richtung gehen.
13. **Bilder werden bei Bedarf mit GPT erzeugt.**
14. **Charaktere im Originalstil** von Florian (GPT-Baukasten funktioniert schlecht, Stil aber gut getroffen,
    `refs/traumacoaster-gpt explore/character/`). Detailreich und liebevoll, aber einfach animiert; Vorlage
    South Park, besonders Terrance und Phillip mit den aufklappenden Kiefern. Figuren stehen in der Zone
    Schlange, die Schlangen reagieren auf vorbeirauschende Bahnen, im Schlangenbereich darf die Bahn nicht mit
    Figuren kollidieren.
15. **Der Bahnstart ist vorgegeben und etwas länger**, damit die Bahn am Anfang immer gut dasteht. Gezeichnet
    wird vom Zughäuschen aus; davor stehen Figuren, die Schlange wächst mit der Länge der Bahn.
16. **Die Karte** (Konzepte in `refs/traumacoaster-gpt explore/moodboards_map/`) wird nach Bahn und Leveln
    finalisiert. Fest: Radlayout; Level als kleine Achterbahn-Miniaturen mit Symbolen und Animationen; der Morph
    von der runden Welt zur organischen Levelansicht muss sauber sein (Boden morpht, Bäume und Felsen werden
    einanimiert, keine Sprünge, nichts wird einfach eingeblendet).

## 2. Fragen und Rechercheaufträge

1. **2D oder 3D?** Fester Blick von der Seite wie Rayman Legends, Zonenelemente als Layer hintereinander.
   Wie wird die Welt trotzdem plastisch wie bei Rayman (dort mit 3D erstellt)? Parallaktische Verschiebung oder
   echte 3D-Verschiebung? GPTs Übergabe (`refs/traumacoaster-gpt explore/doc/02-Umsetzungsplan.pdf`) ist
   nicht verbindlich, auf Relevanz prüfen; ehrlicher Vergleich 2D zu 3D.
2. **Meshy-Modelle** aus den Elementen klappen ganz gut (Bild 1–3 der Nachricht), aber der charmante, verrückte
   2D-Look wie bei Rayman ist wichtiger.
3. **Integration Bahn und Hintergrund:** Die Bahn soll sich in fortgeschrittenen Leveln durch die Landschaft
   schlängeln; Untergrund zum Entdecken, Tunnel durch Berge und Riesenbäume, Fahrt unter Wasserfällen.
   Stützpfeiler immer passend zur Umgebung; Elemente optimal im Vorder-/Hintergrund oder maskiert.
4. **Parallaxentest mit GPT** (`refs/traumacoaster-gpt explore/parallax baukasten test/`): Collagen aus
   Einzelelementen mit Demobahn, noch grob. Prüfen, ob Parallaxe mit unserer Bahn möglich ist oder ob echtes 3D
   mit leichter Perspektive als 2,5D besser geeignet ist.
5. **Zone als Level:** Eine große Zone wird designt, die Achterbahnen entstehen an verschiedenen Stellen oder in
   größeren Ausschnitten. Das Scrollfeld ist pro Level sinnvoll begrenzt (Absperrband, wo es nicht weitergeht);
   mit dem Zonenfortschritt werden Höhlen und Untergrund sichtbar.
6. **Tunnel und Höhleneinfahrten:** vorgegeben (Punkt im Berg als Baustelle mit gelbem Absperrband; ist die
   Verbindung hergestellt, zoomt die Kamera heraus und eine kleine Höhle wird mit Animation freigelegt, dort ein
   neuer Startpunkt) **und/oder dynamisch** (selbst Tunnel und Durchgänge graben). Das Spielelement
   „Baustelle“ ist gesetzt; wie beides kombiniert wird, ist offen.
7. **Übergänge Oberfläche ↔ Untergrund** und Tunneleinfahrten dynamisch und animiert setzen. Fast alles soll
   als Startpunkt, Tunnel oder „Säule“ nutzbar sein, um die sich die Bahn schlängelt.
8. **Darstellung und Zeichengröße:** Große Finger, Elemente zu klein. Dickere Pinselspitze, Vollbild, näher an die
   Bahn zoomen. Beste Gestaltung, Größe, Perspektive und Verteilung für die Usability recherchieren und testen.
9. **Charaktere:** siehe Klarstellung 14 (Baukasten, South-Park-Animation, Schlangen).
10. **Schatten:** Fake-2D oder echt; gerade mit Pfeilern und organischen Formen schön. Wie am besten?
11. **Shader:** Elemente umfärben (Wiederverwendung), Glitzern, Schatten, Wasseranimation, Nebel in Neonfarben,
    Partikel und Lichtquellen, die mit der Umgebung interagieren und sich je Zonenfortschritt verändern
    (z. B. Nachtlevel mit Beleuchtung und mystischem Nebel).

## 3. Erwartungen an das Ergebnis

- Klarstellungen und Fragen speichern (diese Datei), nötige Tests vorbereiten.
- Recherche zu den einzelnen Punkten; GPTs Pläne und Grafiken kritisch prüfen, Relevantes übernehmen.
- Welche Technologien brauchen wir? Wie erstellt ein kleines Team möglichst automatisiert viele Zonen und Level?
  Welcher Mix aus 2D/3D, Shadern und gemalten Grafiken erreicht den Stil?
- Ehrliche Vergleiche der aktuellen Technik und Pläne mit den Erwartungen und den neuen Visualisierungen;
  die besten Wege ausgiebig und selbstkritisch testen.
- Ergebnis: eine klare Richtlinie, aus der der „große Plan“ entsteht. Wenn eine andere technische Richtung
  besser ist, darf alles Bisherige verworfen oder neu gemacht werden. Gesucht ist die bestmögliche und
  eleganteste Lösung.
