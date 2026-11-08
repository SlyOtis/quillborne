---
description: How a map carries a drawn plan beside its picture, where the nimap code lives, and what stays true of it
paths:
  - "web/src/lib/nimap/**"
  - "web/src/lib/nimap-editor/**"
  - "web/src/components/nimap/**"
  - "web/test/nimap/**"
  - "web/src/components/campaign/CampaignMaps.svelte"
---

# Maps

## Two ways to show one map

1. A `campaign_map` is a picture with layers and pins (`MapCanvas.svelte`), and beside it an optional drawn plan in `plan`, the nimap document as `storeMap` writes it, null when none is drawn. Neither replaces the other: `CampaignMaps.svelte` switches the picture and the plan in 3D, and pins stay on the picture.
2. Only the DM draws, as for the picture: `Draw the plan` opens `DocumentEditor` in a modal `dialog` and saves through `putCampaignMap` as it is drawn. A seated player reads the plan; `TestOnlyTheDungeonMasterDrawsMaps` pins it.

## The code is nimling/nimap

3. `web/src/lib/nimap/` is nimap's framework-free core and three.js renderer, copied from nimling/nimap: geometry, model, tools, furniture, svg and render, imported as `$lib/nimap` and `$lib/nimap/render`. It is changed in place like any other code here, and its tests in `web/test/nimap/` change with it.
4. nimap's Vue editor and view are rewritten in Svelte: the runes state, input, calibration and levels in `web/src/lib/nimap-editor/`, the components under nimap's own names in `web/src/components/nimap/`. A behaviour the core already has is called, never written again in a component.
5. The model's rules hold: coordinates are metres with y north, flipped once at the SVG or screen boundary; `geometry` and `model` import nothing of the DOM, Svelte or three.js; three.js is imported only under `render`; a line is the one primitive and rooms, runs and faces are derived, never stored.
6. The plan is coloured from the theme: `getLook` and `getToken` in `web/src/lib/nimap-editor/look.ts` read the tokens off the document root, so no colour is written in the editor or the scene.

## Tests

7. Every geometry and tool behaviour has a spec under `web/test/nimap/`, named `*.spec.ts` with fixtures as `*.fixture.ts`. `web/test/nimap/tools/performance.spec.ts` measures time per move, so the web `test` script runs it alone after the rest of the suite.
