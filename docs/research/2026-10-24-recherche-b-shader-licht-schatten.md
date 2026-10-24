# Recherche B: Umfärben, Licht, Schatten, Atmosphäre, Tag/Nacht (24.10.2026)

Hintergrund für [RICHTLINIE.md](../RICHTLINIE.md), Abschnitte 5 und 6. Die Quellen liefern fast keine
ms-Zahlen; Schätzungen sind markiert.

**Kurzfazit (Three.js/WebGL2):** Gemalte Ebenen als Planes mit eigenem Material (nicht `THREE.Sprite`, das ist
unbeleuchtet). Umfärben über RGB-Maske + Gradient-Map bzw. OKLab-Offsets je Zone. Licht über additive Lichtsprites
plus echte Punktlichter auf Planes mit Fake-Normalen aus dem Alpha-Distanzfeld. Schatten per einer
Directional-Shadow-Map nur für Schiene/Pfeiler/Zug auf `ShadowMaterial`-Fänger; gemalte Ebenen bekommen gescherte
Silhouetten-Kopien. Atmosphäre aus gescrollten Noise-Texturen, `Points`-Partikeln und einer gespiegelten Frame-Kopie
fürs Wasser. Tag/Nacht als Zonen-Preset (Palette + Ambient + 3D-LUT-Pass).

## A. Umfärben gemalter Sprites

Empfehlung: RGB-Maske (drei Materialzonen) + Gradient-Map je Zone; OKLab-Offsets für sanfte Varianten.

- *Tint* (Multiply) kann nur einfärben, was die Kanäle hergeben: ein blauer See wird nicht warm-orange, Lichter
  werden schmutzig. Für Zonenwechsel ungeeignet.
- *Gradient-Map* (Luminanz → 1D-Palette) erhält die Helligkeitsstruktur: Punktraster, Kantenlicht, Pinselkanten
  bleiben; nur die Farbzuordnung wechselt. Je Zone eine Zeile in einem Paletten-Atlas. Rain World macht das für ganze
  Level (32×16-Palette, Zeilen für beleuchtet/beschattet, Spalten je Tiefenebene, „Fade-Palette“ darüber).
  Fallstrick: der Originalfarbton geht verloren, Stamm und Fluss gleicher Helligkeit bekommen dieselbe Farbe. Darum
  Maske: Little Nemo legt Farbblöcke flächig an, R-Kanal = Schattierung/Gradientposition, G = Emission, B = Rim-Light;
  alle Gradienten in einem Texture-Array, derselbe Shader macht Palettenwechsel.
- *Hue-Shift in OKLab/OKLCH*: L fixieren, Hue drehen, Chroma skalieren → Helligkeit bleibt, anders als HSV.
  Kosten: zwei 3×3-Matrizen plus Kubikwurzel je Pixel; Billigvariante: luma-erhaltende Rotationsmatrix (Haeberli).
- Beispiele: Dead Cells färbt nicht um, sondern beleuchtet um (handgezeichnete Normal Maps + dynamische Lichter je
  Biom). Gris: Farbe als Mechanik. Hollow Knight: Standard-Sprite-Shader, Licht als weiche transparente Formen.
- Handarbeit: je Asset eine RGB-Maske (bei KI-PNGs halbautomatisch segmentieren, dann nachmalen); Paletten einmal
  je Zone. Kosten: 1–2 zusätzliche Texturzugriffe je Pixel.

## B. Licht auf 2D-Kunst

Empfehlung: additive Lichtsprites als Basis; echte Punktlichter auf Planes mit SDF-Fake-Normalen für
Felsen/Bäume/Portale; handgemalte Normals nur für Hero-Assets.

- Helligkeitsbasierte Generatoren (Laigter, NormalMap Online) lesen gemalte Lichter als Höhe: dunkle Gürtel werden
  Gräben, Glanzpunkte Spitzen. Das Ori-Team nennt automatische Normals „cheap, plasticky“ und malte ~30.000 Lightmaps
  für ~7.000 Assets. Handwerkzeuge: Sprite Lamp (~2× Zeichenzeit), SpriteIlluminator, Laigter (frei, GPL, CLI).
- Ohne Handarbeit: Normale aus dem Alpha-Distanzfeld („Kissen“). Godot 4 hat das eingebaut (`texture_sdf_normal()`);
  offline per Catlike-Coding-SDF, zur Laufzeit per Jump-Flood. Rim-Light wird mit SDF `smoothstep(sdf) × dot(N, L)`.
- Engines: Godot 4 beleuchtet im Hauptpass; Unity akkumuliert Lichter in Light-Texturen je Blend Style (max. 4),
  jeder Shadow Caster wird je Licht einmal gezeichnet, Masken nutzen den R-Kanal.
- Nachbau: eine Plane mit `MeshStandardMaterial` + `normalMap` wird von `PointLight` nativ beleuchtet; auf der
  flachen Plane liefert Lambert allein schon einen radialen Lichtkegel. pixi-lights ist auf Pixi v6 festgenagelt.
  Lichter je Material auf ~4 begrenzen (Schätzung).

## C. Schatten

Empfehlung: eine Directional-Shadow-Map (PCF, 1024²) nur für 3D-Teile auf transparente `ShadowMaterial`-Fänger;
gemalte Ebenen werfen gescherte Kopien; Blob-/Kontakt-Sprites an Pfeilerfüßen.

- Three.js kopiert `map` und `alphaTest` ins Depth-Material: eine PNG-Plane mit `alphaTest > 0` wirft ihre Silhouette.
  Point Lights rendern den Schatten sechsmal → nur Directional/Spot, 1–2 Schattenlichter. VSM braucht Blur-Passes; ein
  Demo mit hoher Auflösung hat ein iPhone 12 neu gestartet (Rat: PCF für Dynamisches, Gebackenes für Statisches).
  Alpha-Test/`discard` senkt auf Apple-GPUs die HSR-Effizienz, im Shadow-Pass unvermeidbar, also wenige Caster.
- Statisch: `autoUpdate = false`, `needsUpdate` bei Bedarf; bei scrollender Kamera folgt das Frustum, Gewinn gering.
- Fake-2D: Rayman Legends konnte Schatten nicht in verformbare Sprites backen und erzeugt sie dynamisch aus
  Sprite-„Volumen“ (SIGGRAPH-2014-Poster). Umsetzung: dieselbe Textur als zweite Plane, schwarz, Alpha 0,3–0,5,
  gescherte Y-Skalierung in Lichtrichtung, auf die Bodenebene; Weichzeichnen per Mipmap-Bias. Kontaktschatten:
  `ContactShadows` (teuer, `frames = 1` für statische Pfeiler) oder gebackenes AO-Sprite je Fußtyp.
- iPhone 12 realistisch: 1 Shadow-Light 1024² PCF + Silhouetten-Kopien + Blobs; Schätzung Shadow-Pass 1–3 ms bei
  wenigen Castern. VSM, mehrere Schattenlichter, 2048² mit großem Radius: riskant.

## D. Atmosphäre

- **Nebelbänder:** keine prozedurale FBM je Pixel: InnoGames kam mit optimiertem FBM-Wasser auf 12 statt 30 fps und
  ersetzte es durch Displacement; Unreal nennt ~80 Instruktionen je Oktave gegen 61 + 8 Lookups bei Textur-Noise.
  Besser: Noise-Textur (256², RG), zweimal unterschiedlich gescrollt und multipliziert, 1–2 Oktaven; Blue-Noise-Jitter
  statt mehr Samples. Neon: additiv. Nebel als Streifen-Quads, Overdraw ≤ 2–3.
- **God Rays:** Screen-Space nach GPU Gems 3; pmndrs `GodRaysEffect` 60 Samples bei 0,5 Auflösung; Mobile 24–32
  Samples bei 0,25–0,5 (Schätzung). Billiger: gemalte Strahlen-Sprites additiv mit Alpha-Welle.
- **Wasser:** UV-Verzerrung über Distortion-Textur, zwei Geschwindigkeiten, Noise seamless. Spiegelung nicht per
  `Reflector`/`Water2` (zwei extra Szenen-Renders), sondern 2D-Trick: Frame-Kopie der Ebenen über der Wasserlinie,
  V gespiegelt, verzerrt, abgedunkelt.
- **Glitzern:** Hash je Zelle (hash12 nach Hoskins), zeit- und blickabhängig; Grid-Sparkles aliasen, Größe mit Distanz
  skalieren; auf Sprites per Maskenkanal begrenzen.
- **Partikel:** Three.js `Points` (ein Draw Call) für Funken, Pollen, Glühwürmchen; Bewegung per Zeit-Uniform im
  Vertex-Shader. Pixi ParticleContainer: 1 Mio. @ 60 fps auf M3-Desktop. Der A14-Instancing-Bug ist seit iOS 15 behoben.
- **Laternen:** `PointLight` + additives Glow-Sprite + Points-Funken; Lichtfarbe/Ambient aus dem Zonen-Preset.

## E. Tag/Nacht

Empfehlung: Zonen-Preset = Paletten/OKLab-Offsets + Ambient- und Lichtfarben + ein Post-Pass mit 3D-LUT,
Himmelsgradient und Vignette; Fortschritt interpoliert zwischen zwei Presets. `LUTPass` nimmt nur `Data3DTexture`
(WebGL2, iOS seit 15); pmndrs `LUT3DEffect` kann zusätzlich 2D-Strips. Kosten: ein Fullscreen-Pass; bei DPR 3
(~3 Mpx) teuer → DPR ≤ 2. Fallstrick: Helligkeit/Kontrast nicht in die LUT legen; Nacht über Ambient und Lichtfarbe
wie Dead Cells und Unitys Tails-of-Iron-Beispiel.

## Budget iPhone 12 (Schätzung)

16,7 ms/Frame. Bei DPR 2 (≈ 1,3 Mpx): Szene mit 3–4 Ebenen Overdraw + Shadow-Pass + LUT/Vignette + Wasser-Kopie +
God Rays halbauflösend ≈ 8–10 Mpx/Frame; Fullscreen-Pässe ≤ 3, Draw Calls < 150. Handarbeit je Asset: Luminanz,
SDF-Normal, Silhouetten-Schatten: null. RGB-Maske: 5–15 Min. Hand-Normals: ~2× Zeichenzeit, nur Hero-Assets.

## Quellen

1. https://www.aegongames.com/?p=499
2. https://forum.defold.com/t/gradient-map-shader-sample-project/81188
3. https://pkg.go.dev/github.com/sinbad/spriterecolour
4. https://godotshaders.com/shader/gradient-mapping/
5. https://diesoft.games/2022/06/13/nemo-art-pipeline.html
6. https://rainworldmodding.miraheze.org/wiki/Palettes
7. https://bottosson.github.io/posts/oklab/
8. https://cycling74.com/forums/hue-shader-kind-of-works-anyone-want-to-take-a-stab-at-it
9. https://it.esotericsoftware.com/forum/d/28192-how-to-change-specific-colors-of-an-spine-object
10. https://forum.godotengine.org/t/how-to-have-shading-on-sprites-included-in-a-palette-swap-shader/55706
11. https://80.lv/articles/interview-with-the-developers-of-dead-cells
12. https://unity.com/madewith/hollow-knight
13. https://www.mcvuk.com/development/50-shades-of-gris-how-nomada-studio-created-a-game-that-evolves-visually-not-only-mechanically
14. https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/
15. https://www.sprite-ai.art/blog/normal-map-generators-compared
16. https://github.com/azagaya/laigter
17. https://www.codeandweb.com/spriteilluminator
18. https://www.snakehillgames.com/spritelamp/
19. https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html
20. https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/canvas_item_shader.html
21. https://docs.unity.com/en-us/engine/6000.0/manual/unity2d/2d-urp/2d-index/2dlight-properties
22. https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/2d-urp/2d-index/2d-graphics-profiler-module-reference
23. https://docs.unity3d.com/Manual/urp/LightBlendStyles.html
24. https://docs.unity3d.com/Manual/urp/2DShadows.html
25. https://godotshaders.com/shader/2d-rim-light-2/
26. https://catlikecoding.com/unity/code-documentation/class_catlike_coding_1_1_s_d_f_toolkit_1_1_s_d_f_texture_generator.html
27. https://github.com/Robert-K/light2D
28. https://www.npmjs.com/package/pixi-lights
29. https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLShadowMap.js
30. https://threejs.org/docs/pages/LightShadow.html
31. https://threejs.org/docs/pages/ShadowMaterial.html
32. https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681
33. https://discourse.threejs.org/t/dynamic-shadows-with-vsmshadowmap/71094
34. https://discourse.threejs.org/t/light-shine-through-transparent-png-texture-map/33298
35. https://www.scitepress.org/Papers/2014/46669/46669.pdf
36. https://drei.docs.pmnd.rs/staging/contact-shadows
37. https://history.siggraph.org/?p=91237
38. https://newdocs.phaser.io/docs/3.60.0/focus/Phaser.GameObjects.Components.FX-addShadow
39. https://nonstrict.eu/wwdcindex/wwdc2020/10602/
40. https://bugs.webkit.org/show_bug.cgi?id=218949
41. https://webgl2fundamentals.org/webgl/lessons/webgl-qna-optimize-drawing-lots-of-large-images.html
42. https://arxiv.org/pdf/1204.1461
43. https://blog.innogames.com/shader-performance-improvements-in-forge-of-empires/
44. https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/clustered-volumetric-fog
45. https://thebookofshaders.com/13/
46. https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
47. https://github.com/Erkaman/glsl-godrays
48. https://github.com/pmndrs/postprocessing/blob/main/src/effects/GodRaysEffect.js
49. https://godotshaders.com/shader/water-2d-reflection-4-x/
50. https://forum.defold.com/t/water-reflections/75802
51. https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water2.js
52. https://discourse.threejs.org/t/reflector-does-the-scene-render-in-the-reflector-surface-if-its-not-visible-or-if-its-not-facing-the-camera/23913
53. https://diglib.eg.org/bitstream/handle/10.2312/sre20161209/049-054.pdf
54. https://godotshaders.com/shader/fireworks/
55. https://discourse.threejs.org/t/better-performance-instanced-mesh-or-points/20293
56. https://pixijs.com/blog/particlecontainer-v8
57. https://pixijs.com/8.x/guides/components/scene-objects/particle-container
58. https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/LUTPass.js
59. https://github.com/pmndrs/postprocessing/blob/main/src/effects/LUT3DEffect.js
60. https://www.khronos.org/webgl/public-mailing-list/public_webgl/2110/msg00000.php
61. https://docs.unity3d.com/2019.2/Documentation/Manual/PostProcessing-ColorGrading.html
62. https://www.cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/15011057
63. https://unity.com/how-to/use-2d-lights-unity-set-mood
