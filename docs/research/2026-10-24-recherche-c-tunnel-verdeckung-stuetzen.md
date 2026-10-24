# Recherche C: Graben, Verdeckung, Freilegen, Stützen, Zonen (24.10.2026)

Hintergrund für [RICHTLINIE.md](../RICHTLINIE.md), Abschnitte 3, 4 und 10. Bezug: Pixi 8.22 + Rapier2D, fünf
Spur-Container, analytisches Terrain (`groundHeight`/`mountainHeight`), Stützenplaner `supports/supportStyle.ts`.

## A. Dynamisches Graben in gemalter Landschaft

**Empfehlung:** Ein Skalarfeld („Festigkeit“, 0,25–0,5 m Zellen, Chunks ~8 m) je grabbarem Element (Berg,
Riesenbaum, Untergrund), nicht Pixel und nicht Kacheln. Vorgegebene Tunnel = vorab subtrahierte Kapseln,
Spieler-Graben = Scheiben entlang des Strichs. Kontur per interpoliertem Marching Squares, Dreiecke per Earcut,
Darstellung als Mesh, dessen UVs die Originalmalerei unverändert durchreichen. Kollision: Rapier-`polyline` je Chunk,
bei Änderung Collider tauschen.

**Warum nicht die Alternativen:**
- *Alpha-Maske (Worms, `destination-out`/`'erase'`)*: nur Optik; Kollision passt nicht mehr, man braucht Pixel-Readback
  oder eine zweite Repräsentation; bei bildschirmgroßen Malereien kostet jeder Texturupload auf Mobile; harte
  Alpha-Kante. Taugt für kleine Effekte (Kratzspuren, Staub).
- *Polygon-Boolean auf Vektorsilhouetten*: `polygon-clipping` 0.15.7 (reines JS, O((n+k)·log n)), Clipper2-WASM 0.4.0
  (1,2 MB inkl. WASM, mit Offsetting für Randbänder), `clipper2-ts`. Gut bei SVG-Silhouetten; Fallstrick: Splitter und
  degenerierte Reste. Earcut (3.2.4, ~4 kB gzip) verlangt gültige Eingaben ohne Selbstschnitte, bietet `deviation()`.
- *Voxel/Kachel (Terraria, Dome Keeper)*: passt zur Rasteroptik, nicht zu großflächigen Gemälden.

**Kanten gemalt wirken lassen:** (1) Randstreifen entlang der Kontur mit `stripMesh`/`MeshRope` (Bruchkanten-Textur);
(2) SDF-Kantenshader: SDF-Textur je Chunk aus dem Feld (CPU: Felzenszwalb; GPU: Jump Flooding), `smoothstep` statt
`step`, Innenschatten aus der Distanz. Beides kombinieren: Schatten aus SDF, Grasbüschel per Streifen.

**Beispiele:** Godot-Destructable-Terrain (interpoliertes Marching Squares, Chunking); GDevelop-Erweiterung
(Skalarfeld, „Add/Mask disk“); Worms W.M.D setzt einzeln gezeichnete Landschaftsstücke zusammen.

**Mobile-Kosten:** Marching Squares nur auf schmutzigen Chunks, Earcut im Mikrosekundenbereich, Mesh-Upload klein;
Polygon-Boolean wenige ms (eigene Messung nötig). Rapier-Polylinien haben kein Inneres (Punkt-im-Berg aus dem Feld
ableiten), dünne Dreiecke vermeiden.

## B. Verdeckung in 2,5D-Ebenen

**Empfehlung:** Jedes durchfahrbare Element wird in Rückwand → (Innenraum) → Vorderlippe geschnitten und mit der Bahn
in dieser Reihenfolge verschränkt. Das Loch aus A sitzt in der Vorderlippe; außerhalb verdeckt die Lippe automatisch.
Für Säulen/Bäume, um die sich die Bahn windet, dasselbe Prinzip „Schnitt am Objekt“.

**Masken nur für weiche Übergänge** (Portaldunkel, Zug-Ausblenden): Pixi-Rangfolge Scissor < Graphics/Stencil <
Sprite-Maske (Filter); „100s of masks will really slow things down“. RenderLayers (8.7, experimentell) entkoppeln
Zeichenreihenfolge von der Hierarchie; Filter der Vorfahren wirken nicht auf angehängte Kinder.

**Three.js:** `alphaTest` ohne `transparent` + `depthWrite` liefert automatische Verdeckung ohne Sortierung; Kanten
hart; `alphaToCoverage` braucht MSAA und ist auf Mobile unzuverlässig; `alphaHash` rauscht. Der Tiefentest hilft nur,
wenn alle Verdecker in Three liegen. (Das Tiefen-Labor hat genau das gebaut; mit dem Ergebnis in der Richtlinie wird
Three der Weltrenderer, die Pixi-Masken-Variante entfällt.)

**Spielbeispiele:** UbiArt legt Kulissen als statische „Friezes“ ab; Rayman Legends verbirgt Geheimnisse hinter
Vordergrundobjekten; Ori platziert gekachelte Meshes im 3D-Raum (unverifiziert); Trine: keine technische Quelle.
Querschnitt-Vorbilder: SimAnt, Fallout Shelter („ant farm look“).

## C. Reveal-Animation „Höhle freilegen“

Eine Choreografie, ein Shader: (1) Ping am Baustellenpunkt; (2) Kamera-Pullback 0,6–0,9 s mit Ease-out (Rayman nutzt
den Zoom-out, um mehr Level zu zeigen); (3) Risse: Voronoi-Rissoverlay entlang der künftigen Lochkontur; (4) Dissolve
der Vorderlippe mit Noise-Schwelle + Brandkante: zwei `smoothstep`-Schwellen, Sprite-Alpha multiplizieren, Randbreite
≈ 0,04; Trick fürs „Aufreißen von innen“: Schwelle = SDF des fertigen Lochs + Noise·k, so wächst die Maske vom Zentrum
nach außen; (5) wenige gemalte Bruchstücke + Staubpartikel; (6) Rückwand/Innenraum wird sichtbar; (7) Kamera zurück.

**Fallstricke:** Pixi-Texturen sind premultiplied (RGB und A gemeinsam skalieren); Physikloch erst am Ende der Animation
öffnen; keine Sprite-Masken je Frame. Monument Valley/Alto/DKC: keine belastbaren Technikquellen zu Reveal-Animationen.

## D. Automatische Stützen

**Belegt:** NoLimits 2: Footer sind Betonblöcke im Boden, Prefabs hängen an der Bahn, Balken automatisch; Holz-Generator
mit Bent-Spacing (dichter bei hohen g), Stile, die mit Höhe Stufen/Breite zulegen, Kollisionserkennung entfernt
Balken, wo tiefere Bahn durchführt; „Clear Previous Structure“ als Option. Planet Coaster: Auto-Stützen stehen „always
directly under the track“ und spreizen bei Höhe; Terrain formt sich um bestehende Bahn. 2D-Spiele: keine belegte
Stützenlogik gefunden.

**Übernahme:** je Bahnprobe (Abstand nach Höhe und g) ein Strahl nach unten im Skalarfeld der Spur: erste feste Fläche
= Fuß. Ausschluss Wasser und Leere über Maximallänge; Kaskade: Fuß ±x verschieben → Deckenaufhängung (Strahl nach
oben) → Brücke als Fachwerk zwischen gültigen Füßen → Anlehnen an Säule (horizontaler Strahl) → sichtbar „schwebend“
markieren. Höhentypen (A-Böcke/Querverbände ab n m). Kein Fuß in einem Loch, kein Balken durch andere Bahn.
Hysterese beim Editieren, deterministischer Seed.

## E. Zonen-Streaming und Level-Ausschnitte

Zone = eine Szene je Welt, horizontal in Chunks (~32–48 m) je Spur; Chunk-Container `cullable`, Bounds per `cullArea`.
Statische gemalte Chunks nur gezielt `cacheAsTexture` (≤ 4096 px; 4096×2048 RGBA ≈ 32 MB); Spritesheets, KTX2/Basis
(„most useful on mobile“). Laden: Manifest + Bundles je Abschnitt, `backgroundLoadBundle` für den nächsten,
`Assets.unload` für verlassene. Ausschnitt: Kamera-Clamp plus weiche Rückstoßzone; Absperrband als Sprite-Reihe
(einfache, offensichtliche Grenzen lesen sich besser als detaillierte unregelmäßige). Fortschritt „Untergrund“: yMin
der Kamera nach unten erweitern, Untergrund-Chunks aktivieren, Reveal aus C. Fallstrick: getweente Kameragrenzen
jittern, wenn Räume größer als der Viewport sind.

## Quellen

[1] https://construct.net/en/tutorials/destroy-game-floor-per-pixel-2276 · [2] https://www.html5gamedevs.com/topic/26720-problem-with-terrain-destruction/ · [3] https://code.tutsplus.com/coding-destructible-pixel-terrain-how-to-make-everything-explode--gamedev-45t · [4] https://github.com/milesturin/Godot-Destructable-Terrain · [5] https://wiki.gdevelop.io/gdevelop5/extensions/marching-squares/details/ · [6] https://prideout.net/blog/distance_fields/ · [7] https://blog.demofox.org/2016/02/29/fast-voronoi-diagrams-and-distance-dield-textures-on-the-gpu-with-the-jump-flooding-algorithm/ · [8] https://www.comp.nus.edu.sg/~tants/jfa/i3d06.pdf · [9] https://github.com/mfogel/polygon-clipping · [10] https://github.com/ErikSom/Clipper2-WASM · [11] https://cdn.jsdelivr.net/npm/clipper2-ts@2.0.1-17/README.md · [12] https://github.com/mapbox/earcut · [13] https://emanueleferonato.com/2013/10/09/how-to-create-destructible-terrain-using-box2d-step-1/ · [14] https://rapier.rs/docs/user_guides/javascript/colliders · [15] https://pixijs.com/8.x/guides/components/scene-objects/graphics · [16] https://pixijs.com/8.x/guides/components/scene-objects/graphics/graphics-fill · [17] https://pixijs.com/8.x/guides/components/scene-objects/mesh · [18] https://pixijs.com/8.x/guides/concepts/performance-tips · [19] https://pixijs.com/8.x/guides/components/scene-objects · [20] https://pixijs.com/8.x/guides/concepts/render-layers · [21] https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi · [22] https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js · [23] https://discourse.threejs.org/t/threejs-and-the-transparent-problem/11553 · [24] https://forum.unity.com/threads/alpha-to-coverage-doesnt-work-reliably-on-mobile-devices.686842/ · [25] https://godotshaders.com/shader/2d-dissolve-with-burn-edge/ · [26] https://bevy.org/examples/shaders/sprite-material/ · [27] https://gamedev.net/shaderlab/14-sprite-dissolve-effect/ · [28] https://godotshaders.com/shader/impact-glass-shader/ · [29] https://godotshaders.com/shader/sdf-scalable-textures/ · [30] https://gamedev.net/blogs/entry/2268462-shader-that-renders-border-outlines · [31] https://www.gamedeveloper.com/design/secrets-design-in-rayman-legends · [32] https://nolimitscoaster.com/nolimits2/help/pages/editmodes.html · [33] https://nolimitscoaster.com/nolimits2/help/pages/supportspanel.html · [34] https://nolimitscoaster.com/nolimits2/help/pages/woodensupportgenerator.html · [35] https://coastercrazy.com/forums/catwalks-for-buildings-how-do-you-do-this-t16240.html · [36] https://forums.frontier.co.uk/threads/custom-coaster-supports.497505 · [37] https://steamcommunity.com/app/2688950/discussions/0/4634860913217831870 · [38] https://gamingtrend.com/previews/planet-coaster-alpha-2-preview-unlimited-potential/ · [39] https://gigazine.net/gsc_news/en/20080528_rollercoaster_creator · [40] https://pixijs.com/8.x/guides/components/application/culler-plugin · [41] https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture · [42] https://pixijs.com/8.x/guides/components/assets/compressed-textures · [43] https://pixijs.com/8.x/guides/components/assets/background-loader · [44] https://forum.godotengine.org/t/help-with-celeste-style-room-transitions/23200 · [45] https://www.gamebanshee.com/kukf8 · [46] https://discussions.unity.com/t/believable-level-borders/588480 · [47] https://blog.playstation.com/?p=170440 · [48] https://domekeeper.wiki.gg/wiki/Dome_Keeper · [49] https://dazeland.com/en/Amiga/SimAnt.html · [50] https://www.thesixthaxis.com/2015/06/15/manage-your-own-fallout-shelter-on-ios-tonight/ · [51] https://polycount.com/discussion/comment/2101739 · [52] https://raymanpc.com/wiki/en/UbiArt · [53] https://forums.factorio.com/viewtopic.php?p=298513

Nicht gefunden (unsicher bleibt): Trine-Rendering, Ori-Layering (nur Polycount), Where's My Water, Monument
Valley/Alto/DKC-Reveal-Technik, Rayman/Alto-Streaming, Coaster Crafter/Nitro Racing.
