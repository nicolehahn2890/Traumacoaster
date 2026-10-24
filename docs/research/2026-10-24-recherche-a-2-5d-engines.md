# Recherche A: 2,5D-Look, Web-Engines, Mobile-Budget (24.10.2026)

Hintergrund für [RICHTLINIE.md](../RICHTLINIE.md), Abschnitt 2. Zusammengetragen aus Primärquellen (Dokumentation,
Quellcode, Interviews); Unsicheres ist markiert.

**Kurzfazit:** Die „plastischen“ 2,5D-Referenzen teilen sich in drei Lager: (1) flache, gemalte Ebenen im 3D-Raum vor
einer Perspektivkamera (Ori, Hollow Knight, sehr wahrscheinlich UbiArt), (2) volles 3D mit Seitenkamera (Trine,
LittleBigPlanet, DKC Tropical Freeze), (3) reine 2D-Sprites mit Parallaxe (Cuphead, Dead Cells). Für unseren Mix
(gemalte PNG-Ebenen + echtes Schienen-Mesh + Schatten + Masken) ist Lager 1 mit echtem Tiefenpuffer der natürliche
Weg: Three.js als Szenen-Renderer, PixiJS 8 fürs HUD im selben WebGL-Kontext. PixiJS allein hat keinen Tiefenpuffer
pro Objekt, pixi3d ist tot, Pixis eigenes 3D ist nur angekündigt.

## Spiel → Technik

| Spiel | Engine | Technik | Sicherheit |
|---|---|---|---|
| Rayman Origins/Legends | UbiArt | Offiziell „2.5D-Engine“: 2D-Vektorgrafik, verformt über „2D patches“ + Skelette; Kulissen („Friezes“); 60 fps. Ob Perspektivkamera oder reine Parallaxe, ist nirgends offiziell belegt. *Legends Retold* (2026) legt Snowdrop-3D-Optik über die UbiArt-Spiellogik | Perspektive unsicher |
| Child of Light | UbiArt | Aquarell-Konzeptkunst direkt ins Spiel; GDC-2014-Talk nur zur Art Direction | wie Rayman (abgeleitet) |
| Ori and the Blind Forest | Unity | Sprites (aus 3D vorgerendert) „in 3D space so all scenes have a real perspective“; Perspektivkamera; Licht laut Forum „gefaked“ (PNGs) | plausibel, Sekundärquellen |
| Hollow Knight | Unity | Team Cherry: „The game uses a 3D camera and all the background details are pushed back on the z-plane“ | Primärquelle |
| Trine 2 | eigene Engine | volles 3D mit Seitenkamera; Deferred Renderer, 50–100 dynamische Lichter, SSR | gut belegt |
| LittleBigPlanet | eigene (MM) | volles 3D mit drei Spielebenen | gut belegt |
| DKC Tropical Freeze | Retro | „levels and character models are in 3D“ | gut belegt |
| Cuphead | Unity 2D | Sprite Renderer, handgemalte Parallaxe-Ebenen | Kamera unsicher |
| Dead Cells | Heaps | 2D; Figuren aus 3D zu Pixel-Sprites gerendert, Hintergründe handgemalt + Normal Maps für dynamisches Licht | gut belegt |

**FOV/Brennweite:** Konkrete Werte der Spiele sind nicht veröffentlicht. Prinzipien: Bei bildparallelen Ebenen erzeugt
Perspektive nur Skalierung/Versatz je Ebene, keine Verzerrung in der Ebene; Perspektivstärke hängt vom Kameraabstand
ab; Formel, damit die Spielebene ihren Ortho-Maßstab behält: `FOV = 2·atan(h/(2·D))`. Rechnung für 42 m Tiefe
(5 × 8,4 m): Kamera 200 m vor der vordersten Spur → hinterste Spur 17 % kleiner; 800 m → 5 %; 1500 m → 3 %.

## Engine → Eignung

| Engine | Pro | Contra | Mobile |
|---|---|---|---|
| PixiJS 8 (v8.22) | bekannt; Container-Transforms reichen für Weak-Perspective je Spur; Masken, Filter, Partikel | reines 2D: kein Tiefenpuffer → Schiene/Pfeiler können nicht automatisch zwischen Ebenen durchtauchen; keine Shadow Maps; 3D nur angekündigt (8.16, Feb 2026) | sehr gut |
| pixi3d / pixi-projection | – | pixi3d: letzter Commit Mai 2024, Peer `pixi.js ^6.5`; pixi-projection: Apr 2023 → kein v8 | – |
| Three.js (r186) | PerspectiveCamera mit kleinem FOV; Planes mit `alphaTest` + `depthWrite` → Tiefenpuffer sortiert automatisch; Shadow-Pass übernimmt `map`/`alphaTest` → ausgestanzte Schatten ohne Custom-Material; Stencil je Material; Post-FX gebündelt (pmndrs/postprocessing); ~185 kB gz; TS-Typen; Pixi-Kombi offiziell | `THREE.Sprite` wirft keine Schatten (Planes nutzen); weiche Alpha-Ränder brauchen manuelle Sortierung; WebKit-Macken (AA, powerPreference) | gut, Füllrate messen |
| Babylon.js (9.32) | TS-nativ, ShadowGenerator, Partikel, Post-Processes, GUI | 1,4–1,8 MB gz (tree-shakeable); Cascaded Shadows auf Mobile teuer; kleinere 2,5D-Community | gut bei Konfiguration |
| PlayCanvas (2.23) | MIT, TS-Deklarationen, WebGL2/WebGPU, mobil-fokussiert, ~615 kB gz | Editor gehostet; kleineres Ökosystem für Code-first | gut |
| Phaser 4 | neuer WebGL-Renderer | reines 2D | ungeeignet |
| Godot 4 Web (4.7) | Single-Thread-Export, „works very well on macOS and iOS“ | nur Compatibility-Renderer; .wasm ~40 MB (5 MB Brotli); nativ deutlich schneller; Logik nicht TS; Rapier/Zeichenlogik müssten gebrückt werden | mäßig |
| Unity Web | iOS Safari 15+ | nur High-End-Geräte; leeres Projekt 3–15 MB; C# | nur High-End |

**Pixi + Three im selben Kontext:** Three erstellt Canvas/Kontext (`stencil: true`), Pixi hängt sich per
`context: threeRenderer.getContext()` an, `clearBeforeRender: false`, je Frame `resetState()` vor jedem Renderer;
Texturen werden nicht geteilt.

## Budget-Zahlen (iPhone 12/13, Mittelklasse-Android)

- **Füllrate/Overdraw:** keine offiziellen Fillrate-Werte für A14/A15 (unsicher). Apple: Hidden Surface Removal nur
  für opakes Material; jedes transluzente Primitiv erzwingt Fragment-Shading aller bedeckten Pixel; Reihenfolge opak →
  alpha-test → transluzent. Rechnung: 2,96 MP nativ × 30 Vollbild-Ebenen = 89 M Fragmente/Frame (5,3 G/s bei 60 fps);
  bei DPR 2 noch 39 M. Realistisch nur mit DPR ≤ 2, Ebenen auf Inhaltsgrenzen zugeschnitten, opaker Kern (alphaTest,
  depthWrite) + schmaler Blend-Rand. WebKit-Report: `antialias` und `powerPreference: "high-performance"` drückten
  eine Three-Szene auf dem iPhone 12 auf 20 fps.
- **Draw Calls:** Daumenregel < 100–150/Frame; 30 Ebenen = 30 Calls, unkritisch; das Problem ist Füllrate.
- **Shadow Maps:** zusätzlicher Tiefen-Pass aller Caster + 1 Sample je Empfängerpixel. Empfehlung: 1 Directional
  Light, 1024², Caster nur Schiene/Pfeiler/Wagen, Empfänger nur Boden/Fels.
- **KTX2/Basis:** ETC1S 0,3–3 bpp (versagt bei komplexen/gesättigten Texturen), UASTC 8 bpp „high quality“ → für
  gemalte PNGs mit Alpha UASTC, transkodiert zu ASTC (iOS) bzw. ETC2 (Android).
- **Speicher:** 2048² RGBA8 = 16 MiB, +~30 % Mipmaps ≈ 22 MB; als ASTC 4×4/ETC2 4 MiB. 30 solche Ebenen: 480 MiB
  unkomprimiert vs. 120 MiB komprimiert. iOS kennt kein festes Limit, sondern Jetsam-Druck → stiller Reload.

## Empfehlung

Three.js als Szenen-Renderer (WebGLRenderer, `stencil: true`, `antialias: false`, DPR ≤ 2), PixiJS 8 nur noch für HUD
und Zeichen-Overlay im geteilten Kontext, Rapier und Zeichenlogik unverändert in TypeScript. Günstigere Zwischenstufe
zum Vergleich: Weak-Perspective je Spur in Pixi (Container-Scale 0,97…0,83) plus gemalte Schattenflecke. Risiken:
Füllrate (früh Stresstest), Speicher (KTX2 von Anfang an), weiche Alpha-Ränder (`depthWrite: false` + `renderOrder`
je Spur), zwei Renderer (State-Resets), Schattenkosten auf Mittelklasse-Android (abschaltbar).

## Quellen

1. https://en.wikipedia.org/wiki/UbiArt_Framework
2. https://cedec.cesa.or.jp/2014/session/ENG/12313.html
3. https://www.gameinformer.com/state-of-play/2026/06/02/rayman-legends-retold-is-a-3d-remake-of-the-best-rayman-game-and-we-played
4. https://nintendoeverything.com/rayman-legends-retold-interview/
5. https://discussions.unity.com/t/ori-and-the-blind-forest-feature-question/562031
6. https://polycount.com/discussion/comment/2514772
7. https://airborn-studios.com/projects/ori
8. https://x.com/TeamCherryGames/status/958871445081239552
9. https://www.pcgameshardware.de/Trine-2-Spiel-39851/Specials/Trine-2-Exklusives-Technik-Interview-mit-Frozenbyte-Grandioses-Art-Design-trifft-auf-detailverliebte-Engine-866092/
10. https://www.fandom.com/articles/2017-interview-frozenbyte-on-trine-4-2-5d-is-where
11. https://gameinformer.com/games/donkey_kong_country_tropical_freeze/b/wii_u/archive/2013/12/24/nintendo-answers-our-donkey-kong-country-tropical-freeze-questions
12. https://en.wikipedia.org/wiki/LittleBigPlanet_(2008_video_game)
13. https://unity.com/made-with-unity/cuphead
14. https://80.lv/articles/interview-with-the-developers-of-dead-cells
15. https://wnhub.io/news/art/item-13775
16. https://mcvuk.com/development-news/when-we-made-dead-cells/
17. https://gamedeveloper.com/art/video-discovering-the-art-direction-for-i-child-of-light-i-
18. https://en.wikipedia.org/wiki/Perspective_distortion
19. https://www.gamedeveloper.com/programming/combining-perspective-and-orthographic-camera-for-parallax-effect-in-2d-game
20. https://www.gamedeveloper.com/programming/adding-some-perspective-to-your-unity-2d-game-
21. https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi
22. https://pixijs.com/blog/8.7.0
23. https://pixijs.com/blog/8.16.0
24. https://github.com/jnsmalm/pixi3d
25. https://github.com/pixijs/pixi-projection
26. https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLShadowMap.js
27. https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js
28. https://github.com/pmndrs/postprocessing
29. https://bugs.webkit.org/show_bug.cgi?id=276959
30. https://bugs.webkit.org/show_bug.cgi?id=300782
31. https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison
32. https://forum.babylonjs.com/t/how-to-imporve-performance-on-mobile-more-effectively/49593
33. https://developer.playcanvas.com/user-manual/engine/
34. https://cdn.jsdelivr.net/npm/phaser@4.2.1/README.md
35. https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
36. https://godotengine.org/article/progress-report-web-export-in-4-3/
37. https://docs.unity3d.com/Manual/webgl-browsercompatibility.html
38. https://activation.unity3d.com/roadmap/415-web-mobile-browser-support
39. https://docs.crazygames.com/resources/optimization-tips/
40. https://developer.apple.com/videos/play/wwdc2020/10602/
41. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
42. https://gamedev.net/tutorials/programming/why-your-unity-game-starts-lagging-on-mobile-and-how-to-fix-it-1-r6169
43. https://docs.unity3d.com/462/Documentation/Manual/DirectionalShadowDetails.html
44. https://github.com/BinomialLLC/basis_universal
45. https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
46. https://caniuse.com/wf-webgl-compressed-texture-astc
47. https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
48. https://capacitorjs.com/docs/ios
49. https://rapier.rs/docs/user_guides/javascript/getting_started_js
50. https://github.com/dimforge/rapier.js
