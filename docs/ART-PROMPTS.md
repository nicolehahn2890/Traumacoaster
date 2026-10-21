# Trauma Coaster – Texturen und Prompts

Jede Kachel hat einen Namen (`src/assets/manifest.ts`, `ART_NAMES`), eine Größe und einen Prompt. Erzeugt wird sie mit dem Figma-Bildgenerator (Referenzbilder aus `refs/eyvind earle/` und `refs/rayman legends/` anhängen) oder in ChatGPT; danach `npm run art:prep` (kachelbar machen, WebP, Manifest). Prompts auf Englisch, weil die Modelle Englisch besser verstehen.

**Stil-Zusatz für alle Prompts:**
```
hand-painted 2D game texture, flat shapes with hard edges, three tones per surface (light, mid, shadow),
stippled dots on the shadow side, gouache on paper, in the spirit of Eyvind Earle with the saturated
colors of Rayman Legends, no text, no watermark, no photo realism
```

| Name | Größe | Motiv (Prompt-Kern) | Tint |
|---|---|---|---|
| `paper_grain` | 512×512, nahtlos | fine warm paper grain, very subtle, greyscale, seamless | multiply |
| `grass_brush_a` | 1024×1024, nahtlos | meadow grass strip, flat green with hard-edged lighter patches and stippled dark dots along the lower edge, seamless | ja |
| `grass_brush_b` | 1024×1024, nahtlos | dry grass with small daisies as single white dots, seamless | ja |
| `grass_brush_c` | 1024×1024, nahtlos | moss and clover in three greens, hard-edged, stippled shadow, seamless | ja |
| `rock_a` | 1024×1024, nahtlos | layered rock face in parallel bands, three tones of warm brown, hard edges, seamless | ja |
| `rock_b` | 1024×1024, nahtlos | black volcanic rock with thin glowing orange veins, seamless | ja |
| `wood_beam` | 1024×256, nahtlos horizontal | painted wooden beam, flat planks, three tones, small knots, seamless horizontally | ja |
| `steel` | 1024×256, nahtlos horizontal | painted steel tube rail, teal and white, one hard highlight line, seamless horizontally | ja |
| `cloud_a` | 1024×512, Alpha | flat stacked cloud of three discs with hard bottom edge, stippled rim, light from top left, transparent background | ja |
| `cloud_b` | 1024×512, Alpha | long thin stacked cloud, two layers, transparent background | ja |
| `cloud_c` | 512×512, Alpha | small round puffy cloud, transparent background | ja |
| `stipple_sheet` | 512×512, Alpha | sheet of irregular round dots in four sizes, black on transparent, evenly spread | ja |
| `leaf_dot` | 128×128, Alpha | single painted leaf blob, hard edge, black on transparent | ja |
| `glow` | 256×256, Alpha | soft radial glow, white center fading to transparent | ja |
| `tree_ball` | 512×512, Alpha | round tree crown made of stippled dots in three tones, black branching trunk, transparent background | ja |
| `tree_fan` | 512×512, Alpha | fan-shaped tree with star-like needles, black silhouette with colored specks, transparent background | ja |
| `fir_dots` | 512×512, Alpha | fir tree drawn only with stippled dots, dark, transparent background | ja |
| `portal_arch` | 512×512, Alpha | ornate stone tunnel portal arch with two contour bands and a keystone, flat painted, transparent background | ja |
| `crystal` | 256×256, Alpha | glowing crystal cluster, three hard tones, transparent background | ja |
| `lantern` | 128×256, Alpha | hanging mine lantern, warm light, flat painted, transparent background | ja |
| `water_band` | 1024×256, nahtlos horizontal | water surface as horizontal bands in two blues with white glint strokes, seamless horizontally | ja |
| `snow_field` | 1024×512, nahtlos | smooth snow field with a few stippled fir shadows, seamless | ja |
| `neon_sign` | 512×256, Alpha | abstract neon sign shapes, pink and cyan, transparent background | nein |
| `sticker_paper` | 512×256, Alpha | torn paper sticker shape with soft shadow, transparent background | ja |

**Hinweise**
- „Tint ja“: Die Kachel wird in neutralen Tönen (oder Graustufen mit Alpha) erzeugt und im Spiel mit den Palettenfarben der Welt eingefärbt. So reicht ein Kachelsatz für alle zehn Welten.
- Kachelbar: In Figma/ChatGPT „seamless, tileable“ anfordern und mit `scripts/art-prep.mjs` prüfen (linke und rechte Spalte müssen übereinstimmen); das Skript blendet die Ränder notfalls über 12 % gespiegelt.
- Größen sind Obergrenzen; das Prep-Skript schreibt 1024 und 512 px.
- App-Icons (192, 512, maskable) entstehen aus `art-src/icon.svg`.
