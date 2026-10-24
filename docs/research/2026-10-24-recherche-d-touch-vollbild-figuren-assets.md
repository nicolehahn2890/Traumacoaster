# Recherche D: Touch-Ergonomie, iPhone-Vollbild, Figuren-Runtimes, KI-Assets (24.10.2026)

Hintergrund für [RICHTLINIE.md](../RICHTLINIE.md), Abschnitte 7, 8 und 9. Umrechnung iPhone 15/16 (460 ppi,
DPR 3, 393×852 pt): **1 CSS-px = 0,166 mm, 1 mm ≈ 6 px.** Heutige Werte im Spiel: Pinselradius 17 px = 2,8 mm
(Ø 5,6 mm), Linie 9 px = 1,5 mm, Gummiband 22 px = 3,6 mm, 7 px/m ⇒ 1 m Bahn = 1,2 mm.

## A. Touch-Ergonomie beim Zeichnen

**Belegte Zahlen**
- Apple HIG: Mindest-Trefffläche 44×44 pt = 7,3 mm (Sekundärquellen). Material/Android: 48×48 dp ≈ 9 mm, Google
  empfiehlt 7–10 mm Ziele, 8 dp Abstand. WCAG 2.5.8 (AA) nur 24 px, 2.5.5 (AAA) 44 px.
- Parhi/Karlson/Bederson (MobileHCI 2006, Daumen einhändig): 9,2 mm für Einzelziele, 9,6 mm für Serien.
- Fingerbreite (MIT Touch Lab): Zeigefingerkuppe 16–20 mm (= 97–121 px), Daumen ≈ 25 mm (≈ 150 px). Kontaktfläche
  beim Tippen deutlich kleiner; Vogel & Baudisch setzten die „Occlusion-Schwelle“ auf 24 px ≈ 10,5 mm.
- Holz & Baudisch („Understanding Touch“, CHI 2011): Mindestknopfgröße für 95 % Treffsicherheit 7,9 mm;
  systematischer Versatz der Kontaktflächen-Mitte im Schnitt 3,75 mm.
- Shift (Vogel & Baudisch, CHI 2007): unbehandelte Fingereingabe bei 2,6-mm-Zielen 81 % Fehler. Lösung: Callout
  („Lupe“) Ø 26 mm, 22 mm über dem Berührpunkt, nur bei kleinen Zielen nach ≈ 300 ms Verweilzeit; Loslassen wählt aus.
- Steering Law (Accot & Zhai): Zeit zum Durchsteuern eines Pfads ∝ Länge/Breite des Korridors – enge Kringel werden
  überproportional langsam und fehlerhaft.
- Zeichen-Apps: Procreate Pocket und Concepts zeichnen mit einem Finger, pannen/zoomen mit zwei, Undo = Zwei-Finger-Tipp.
  Zu Linienbreiten von Happy Glass, Brain Dots, Draw Climber, Love Balls, Line Rider mobile keine belastbaren Zahlen.

**Empfehlungen (iPhone 15/16)**
1. Buttons/Handles ≥ 56–60 px (9,2–10 mm), nie unter 48 px; Abstand ≥ 8 px. Für große Finger eher 64 px.
2. Treffer-Toleranz an der Bahnlinie ±30 px (5 mm); Snap-Radius zum Verbinden von Enden/Station ≥ 60 px (10 mm).
3. Pinselspitze: sichtbarer Ring Ø ≈ 60 px (10 mm), damit er um den Finger herum hervorschaut; gezeichnete Linie 14–18 px
   (2,3–3 mm) statt 9 px; Gummiband ≥ 30 px.
4. Verdeckung: Shift-Prinzip nur, wo Präzision zählt (Anschluss an Station, Kreuzen eigener Bahn): nach 300 ms Verweilen
   eine Lupe Ø ≈ 150 px etwa 130 px (22 mm) über dem Finger; sonst direkt zeichnen.
5. Kleinster Kringel: Durchmesser ≥ 2× Kontaktfläche, also ≥ 20–25 mm (120–150 px), besser 30 mm (180 px). Daraus
   folgt der Zoom: bei Looping-Radius R (m) braucht man ≥ 75/R px/m; 7 px/m reicht nur für Loopings ≥ 9–10 m Radius,
   sonst 10–12 px/m als Zeichen-Zoom (eigene Ableitung).
6. Pan: Zwei-Finger-Pan/Pinch; Rand-Autoscroll nur als Ergänzung: Zone 60–70 px, Start nach ≈ 150 ms Verweilen.

## B. Vollbild als Home-Bildschirm-Web-App (iOS 18/26)

- **Manifest:** iOS unterstützt nur `display: standalone`; `fullscreen` fällt per Spezifikation darauf zurück.
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`: Pixel (0,0) der Seite liegt auf
  (0,0) des Schirms, Statusleiste transparent darüber. `theme-color` wird ignoriert.
- **viewport-fit=cover + env():** Hintergrund bis zum Rand, wichtige Elemente mit `max(12px, env(safe-area-inset-*))`
  einrücken.
- **Querformat (iPhone 16/16 Pro):** Hochformat oben 59/62 pt, unten 34 pt; Querformat links/rechts 59/62 pt
  (Dynamic Island), unten 21 pt (Home-Indicator), oben 0.
- **Bekannte Bugs:** WebKit #301994 – seit iOS 26.1 bleibt in Home-Screen-Apps ein Balken oben,
  `safe-area-inset-top` liefert 0 statt 44; in 26.2 als behoben gemeldet, Juli 2026 auf 26.5.2 wieder, Bug offen.
  WebKit #316008/#254868 – `100vh`/`lvh` falsch, wenn die App ohne black-translucent installiert wurde; bleibt bis zur
  Neuinstallation. WebKit #306465 – Safari (Browser) liefert im Hochformat absichtlich keine Top/Bottom-Insets.
  Apple-Forum 798014: nativ `safeAreaInsets.top` nach Rotation falsch bis Hintergrund/Vordergrund-Wechsel.
- **Best Practice Canvas:** Canvas auf `innerWidth × innerHeight` dimensionieren (nicht 100vh/100dvh), bei `resize`/
  `orientationchange` neu lesen; Insets in JS spiegeln und als HUD-Zone nutzen, Bahn/Hintergrund darunter durchzeichnen;
  nach Meta-Änderungen deinstallieren/neu installieren.
- **Capacitor:** StatusBar-Plugin `overlaysWebView` Default `true` (iOS), `ios.contentInset` Default `'never'`, dieselben
  `env()`-Werte im WKWebView; Capacitor 8 `SystemBars` für Android-Edge-to-Edge.

## C. Figuren im Terrance-&-Phillip-Stil: Runtimes

**Wie South Park es macht:** seit 2001 Maya; jede Figur ≈ 10.000 Stücke Geometrie, Rig mit mindestens vier Ansichten,
Sonderposen per Slider („Replacement Animation“), ≈ 12 Hände je Pose, Papiertextur gerendert. Übersetzung für Web:
Teile-Atlas + Skelett-JSON + Replacement-Sets (Münder, Hände, Augen) + je Ansicht ein Rig; Kopf als zwei Teile mit
Pivot an der Mundlinie.

| Runtime | Lizenz/Preis | Pixi-8-Anbindung | Baukasten | Urteil |
|---|---|---|---|---|
| Spine | Essential 69 $, Professional 379 $ einmalig je Person, Enterprise 2.499 $ + 379 $/User/Jahr ab 500 k$ Umsatz; Runtime nur mit Editor-Lizenz je Nutzer | offiziell `@esotericsoftware/spine-pixi-v8` | Skins kombinierbar zur Laufzeit | beste Allround-Wahl, 379 $ je animierende Person |
| Rive | Free / 9 / 32 / 120 $ je Sitz/Monat; Runtimes MIT | nur Community `pixi-rive` (2024, inoffiziell) | State Machines, Data Binding | stark für Reaktionslogik, Pixi-Integration und 20+-Figuren-Leistung unbelegt |
| DragonBones | kostenlos; Editor in „LoongBones“ umbenannt | DragonBonesJS ohne Releases | ja | nicht empfohlen |
| Lottie | frei | lottie-web | nein | ungeeignet |
| Eigenbau | 0 € | nativ | beliebig, datengetrieben | passt zu „viele Figuren automatisch aus Teilen“ |

**Empfehlung für 2 Personen:** Eigenbau-Cut-out datengetrieben ausbauen: Teile-Slots, Replacement-Sets, kleine
Keyframe-Clips (Idle, Staunen, Jubel, Ducken) und eine Mini-Statemaschine für Reaktionen auf die Bahn. Spine Pro erst,
wenn handanimierte Expressivität (Meshes, IK) nötig wird.

## D. KI-Asset-Pipeline

- **OpenAI:** aktuell `gpt-image-2.5-sunburst` (Präzision/Edit) und `-flare` (schnell), Token-Preise 8 $/M Bild-Input,
  30 $/M Bild-Output; `background: "transparent"` offiziell unterstützt (PNG/WebP). Stückpreise Vorgänger: gpt-image-2
  1024² low/medium/high 0,006/0,053/0,211 $; Batch-API halbiert die Token-Preise. Mehrere Referenzbilder je Edit;
  Masken sind nur „Guidance“. Kostenbeispiel: 200 Einzelteile medium ≈ 10–11 $, per Batch ≈ 5 $ (2.5-Preise je Bild
  unbekannt).
- **Alternativen:** Flux Kontext pro 0,04 $ / max 0,08 $ je Bild (Drittquelle); Recraft Raster 0,035 $, Vektor (SVG)
  0,08 $; Ideogram 0,03–0,09 $ (unsicher). Midjourney ohne offizielle API, Automatisierung verstößt gegen die ToS.
- **2D→3D:** Meshy Pro 19 €/Mo (1.000 Credits), Premium 38 €, Ultra 95 €; Free nur CC BY 4.0; Export glb/fbx/obj/usdz;
  API ab Pro. Tripo ≈ 20 $/Mo (Drittquelle). Qualität bei gemalten Flachformen: keine Tests gefunden; beide beleuchten
  „realistisch“ nach – eher für Wagen-/Kulissen-Silhouetten als für den Earle-Look.
- **Freistellen:** rembg MIT, aber Default-Modell `bria-rmbg` (RMBG-2.0) ist CC BY-NC – kommerziell
  `birefnet-general` (MIT) oder `isnet` mit `-vm`/`-dc`. Besser direkt transparent generieren, Matting nur nachputzen.
- **Umfärbbar:** Graustufen-Index + Paletten-LUT (Wargroove) oder Paletten-Koordinaten in R/G; Teile in neutralem Grau
  mit Schattierung erzeugen und je Zone eine Kanalmaske (R = Haut, G = Kleidung, B = Akzent) – Praxistauglichkeit mit
  gpt-image noch zu testen.

## Quellen

- https://github.com/w3c/wcag/issues/1831 · https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size
- https://support.google.com/accessibility/android/answer/7101858
- https://www.microsoft.com/en-us/research/wp-content/uploads/2008/01/p1399-karlson.pdf
- https://www.smashingmagazine.com/2012/02/finger-friendly-design-ideal-mobile-touchscreen-target-sizes/
- https://projects.csail.mit.edu/hci-reading/papers/chi2007-vogel.pdf
- https://static.siplab.org/papers/chi2011-understanding_touch.pdf
- https://en.wikipedia.org/wiki/Steering_law
- https://help.procreate.com/pocket/handbook/interface-gestures/gestures · https://concepts.app/en/tutorials/the-top-gestures-of-concepts-pros/
- https://useyourloaf.com/blog/iphone-16-screen-sizes/
- https://web.dev/learn/pwa/enhancements · https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
- https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- https://bugs.webkit.org/show_bug.cgi?id=301994 · https://bugs.webkit.org/show_bug.cgi?id=306465 · https://bugs.webkit.org/show_bug.cgi?id=316008 · https://bugs.webkit.org/show_bug.cgi?id=254868
- https://developer.apple.com/forums/thread/798014
- https://capacitorjs.com/docs/config · https://capacitorjs.com/docs/apis/status-bar · https://capacitorjs.com/docs/apis/system-bars
- https://esotericsoftware.com/spine-purchase · https://esotericsoftware.com/spine-runtimes-license · https://esotericsoftware.com/spine-skins · https://esotericsoftware.com/spine-pixi.md
- https://rive.app/pricing · https://rive.app/docs/runtimes/web/canvas-vs-webgl · https://rive.app/community/doc/runtime-asset-swapping/docCK8JCPhVm · https://npmjs.com/package/pixi-rive
- https://github.com/DragonBones/DragonBonesJS · https://forum.defold.com/t/hope-defold-can-continue-to-support-the-new-loongbones/81757
- https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation
- https://southpark.wiki.gg/wiki/Animation_Changes · https://www.engadget.com/2012-01-30-macworld-iworlds-south-park-talk.html
- https://developers.openai.com/api/docs/guides/image-generation · https://developers.openai.com/api/docs/pricing · https://developers.openai.com/api/docs/models/gpt-image-1.5
- https://developer.puter.com/tutorials/flux-api-pricing/ · https://www.recraft.ai/blog/best-ai-image-generation-api · https://openrouter.ai/recraft/recraft-v4-vector
- https://unifically.com/blogs/midjourney-api · https://evolink.ai/blog/midjourney-api-pricing-2026
- https://www.meshy.ai/pricing · https://www.costbench.com/software/ai-3d-generation/tripo-ai/
- https://github.com/danielgatis/rembg · https://github.com/ZhengPeng7/BiRefNet · https://github.com/Bria-AI/RMBG-2.0 · https://www.creativeainews.com/articles/rembg-background-removal-models-tested-2026/
- https://wargroove.com/palette-swapping/ · https://godotshaders.com/shader/palette-swap-no-recolor-recolor/

Methodik: Apple-HIG- und Tripo-Seiten waren nicht abrufbar; deren Zahlen stammen aus Sekundärquellen. Shift- und
Understanding-Touch-Zahlen direkt aus den Paper-PDFs.
