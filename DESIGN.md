---
name: Quillborne
description: The table's character sheet and campaign book, dressed as a WarCraft III game menu over a midnight starfield.
colors:
  ground-deep: "#04060d"
  ground: "#090e1c"
  ground-raised: "#10182d"
  ground-lift: "#1a2644"
  stone: "#2f3850"
  stone-light: "#5d6784"
  stone-dark: "#141a2a"
  wood: "#1b2440"
  wood-dark: "#0c1222"
  metal: "#dcb672"
  metal-bright: "#f8e3b4"
  metal-dim: "#75592b"
  metal-edge: "rgba(248, 227, 180, 0.3)"
  keyline: "#020309"
  ember: "#ff9f2e"
  ember-core: "#ffe2b0"
  ember-glow: "rgba(255, 159, 46, 0.42)"
  verdigris: "#4b82d8"
  verdigris-dim: "#1f3663"
  ink: "#f3e7cb"
  ink-dim: "#d1c1a3"
  ink-faint: "#b7a88d"
  ink-parchment: "#2a1b0c"
  state-good: "#3fd65a"
  state-warn: "#ffcc00"
  state-bad: "#e0351f"
typography:
  display:
    fontFamily: "Cinzel, Trajan Pro, Georgia, serif"
    fontSize: "clamp(2.61rem, 2.18rem + 0.77vw, 3.42rem)"
    fontWeight: 600
    letterSpacing: "0.14em"
  headline:
    fontFamily: "Cinzel, Trajan Pro, Georgia, serif"
    fontSize: "clamp(1.44rem, 1.20rem + 0.43vw, 1.89rem)"
    fontWeight: 600
    letterSpacing: "0.05em"
  figure:
    fontFamily: "Cinzel, Trajan Pro, Georgia, serif"
    fontSize: "clamp(1.89rem, 1.58rem + 0.56vw, 2.48rem)"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Alegreya, Spectral, Georgia, serif"
    fontSize: "clamp(0.95rem, 0.80rem + 0.28vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Cinzel, Trajan Pro, Georgia, serif"
    fontSize: "clamp(0.70rem, 0.59rem + 0.21vw, 0.92rem)"
    fontWeight: 700
    letterSpacing: "0.14em"
  mono:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.125rem"
  xl: "1.625rem"
  pill: "9999px"
spacing:
  "0": "2px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "72px"
components:
  button-primary:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.metal-bright}"
    typography: "{typography.label}"
    height: "2.4rem"
    padding: "0 24px"
  button-secondary:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.metal}"
    typography: "{typography.label}"
    height: "2.4rem"
    padding: "0 24px"
  button-ghost:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.metal}"
    typography: "{typography.label}"
    height: "2.4rem"
    padding: "0 24px"
  button-danger:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "2.4rem"
    padding: "0 24px"
  button-hover:
    textColor: "{colors.metal-bright}"
  iconbtn:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.metal}"
    rounded: "{rounded.sm}"
  sigil:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.metal}"
    rounded: "{rounded.pill}"
    size: "3.3rem"
  field-input:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  field-label:
    textColor: "{colors.metal}"
    typography: "{typography.label}"
  stat-plate:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.metal}"
    rounded: "{rounded.lg}"
    padding: "12px 0.85rem 16px"
  frame:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.xl}"
  drawer:
    backgroundColor: "{colors.ground-raised}"
    width: "400px"
  map-scene:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.md}"
---

# Design System: Quillborne

## Overview

**Creative North Star: "The Frozen Throne Menu"**

Every surface is a WarCraft III game menu rebuilt in CSS. Chrome is carved granite and dark oak; every container is ringed in gilt with a black keyline on both sides; every button is a beveled stone slab with gold capital lettering that lights like a torch on hover and sinks when pressed. The ground is a midnight starfield, painted once in the Frame, which stays mounted around every page: it lays `--texture-stars` and noise over a raised-to-abyss gradient, and the page is a raised plate on it, painted with `--backdrop` (a blue haze at both upper edges and a black pool at the foot in the default skin). Inside the page sits the sign-in gate's hall: the arched `Glass` window faint at its centre, two hung `Flame` lanterns at the edges (hidden below a 47.5rem shell), and `Aura` veil and ember motes over it. Nothing is flat: a control has weight, a well is sunk, a plate stands proud.

The ornament is a frame for data, never a competitor to it. The character sheet is dense (stat plates in rows, a crown slab with the portrait in a gilded arch, a hit point block, tabbed actions), and it stays readable at a glance: gold labels in small tracked capitals above large Cinzel figures on dark ground. All material is procedural. Stone, grain, leather, noise and stars are inline SVG in `src/app.css`, and no raster frame or texture ships (there is no raster provenance to record).

Five race skins exist and every one comes from tokens: Alliance (`medieval`, the default pale gold on midnight blue with an orange torch), Night Elf (`forest`, lilac silver on violet night with a teal torch), Horde (`fire`, copper on scorched brown with a red flame), Scourge (`arcane`, bone on moss black with a fel green light) and Frozen Throne (`ocean`, ice silver on deep blue with a cyan light). A skin re-declares the same token names under `:root[data-theme]`, and swaps the display and body faces; the starfield is shared by every skin. The 3D dice and the 3D map plans read the active skin live.

This system was applied under a standing looks-only constraint from the user: layouts, menus and screens stayed exactly where they were. The skin re-dressed the incumbent grammar; the drawers still open where they did, and the page now bends into them rather than butting against them.

**Key Characteristics:**
- Midnight starfield ground, pale gilt trim, ember light.
- Multi-ring gilt rims bounded by black keylines.
- The page is raised beside its drawers and rounds into them behind a thin gold double rule and a diamond stud.
- Beveled stone slabs for buttons, sunken black wells for inputs.
- Gold tracked capitals for every label and control.
- Procedural SVG textures only; no rasters.
- Five race skins by token re-declaration; components are theme-blind.

## Colors

A midnight palette: blue-black grounds, three-step pale gilt metal, one ember light and one cool secondary light, re-tinted wholesale per race skin.

### Primary
- **Gilt** (`metal`): the trim of every rim, the ink of every label and button, the stroke of every sigil ring, the outer line of the shell bend. It is the system's structural colour.
- **Burnished Highlight** (`metal-bright`): the lit edge of a rim, headings, a hovered button label, the focus ring, dice numerals, the light face of a diamond stud.
- **Tarnished Gilt** (`metal-dim`): the shadowed band of a rim, the hairline border of wells and the map scene, the inner line of the shell bend, scrollbar thumbs, the resting border of inputs.

### Secondary
- **Torch Ember** (`ember`, with `ember-core` and `ember-glow`): light, never paint. It arrives as text glow on hover, as radial washes at 7 to 16 percent mix behind plates and primary buttons, as the inner hearth glow of frames, the crest's halo and the gate veil, and as the ember meter fill.

### Tertiary
- **Verdigris** (`verdigris`, `verdigris-dim`): the cool second light. Mana meters, verdigris-toned sigils and cards, the glow at the head and foot of every drawer, and the selection and hover colour of the map editor. Per skin it becomes teal, blood red, fel violet or ice blue.

### Neutral
- **Abyss / Ground / Raised / Lift** (`ground-deep`, `ground`, `ground-raised`, `ground-lift`): the four-step midnight ladder. Panels and drawers grade from raised at the top to ground or abyss at the bottom.
- **Granite** (`stone`, `stone-light`, `stone-dark`): slate blue in the default skin. The stone texture lives on button faces, icon buttons, bands and frame gaps only; every other surface takes grain or stars on the ground ladder. The flat stone colour also tints the dice and the walls of the map editor's drawing.
- **Oak** (`wood`, `wood-dark`): the leather-and-oak panel variant, stained midnight in the default skin.
- **Keyline** (`keyline`): the near-black line that bounds every gilt ring on both sides; one value for every skin.
- **Starfield** (`--texture-stars`): pale blue-white specks at 0.3 to 0.6 opacity on a 180px tile, over the Shell ground and every drawer.
- **Vellum Ink** (`ink`, `ink-dim`, `ink-faint`): body text, secondary text, placeholders.
- **Parchment** (`--texture-parchment`, a radial from #e9d9b4 to #b99a62, with `ink-parchment`): the one light surface.
- **States** (`state-good`, `state-warn`, `state-bad`): stamina and valid, tooltip lettering, life and danger and invalid.

### Named Rules
**The Theme-Blind Rule.** A component reads tokens and never knows which skin is active. A new colour is a new token declared in `:root` and in all five `[data-theme]` blocks, or it does not exist. A canvas or WebGL surface reads the same tokens from the live document (`getToken` in `src/lib/nimap-editor/look.ts`).

**The Ember Is Light Rule.** Ember is emitted, not filled: glow, text-shadow, and radial washes at 16 percent mix or less. Its only solid uses are the ember meter and an ember-toned glyph.

**The Keyline Rule.** Every gilt ring is bounded by the near-black keyline on its inner and outer edge. Gold never touches the ground directly.

## Typography

**Display Font:** Cinzel (with Trajan Pro, Georgia), swapped per skin: Uncial Antiqua (Night Elf), Grenze (Horde), Metamorphous (Scourge), Cinzel (Alliance, Frozen Throne).
**Body Font:** Alegreya (with Spectral, Georgia), swapped per skin: Vollkorn (Horde), EB Garamond (Scourge), Cardo (Frozen Throne).
**Figures Font:** Cinzel (`--font-figures`), fixed across skins so numbers read the same everywhere.
**Mono Font:** IBM Plex Mono.

**Character:** Inscriptional Roman capitals over a warm humanist book face: the carved plaque above the page of the rulebook.

The scale is seven fluid steps (`--text-xs` to `--text-3xl`, ratio about 1.2), each a `clamp()` against viewport width, on a root size of 106.25 percent.

### Hierarchy
- **Display** (600, `--text-3xl`, tracking 0.14em): the hero heading of a page, gilt with a layered ember glow.
- **Headline** (600, `--text-xl`, tracking 0.05em): section and panel headings, `metal-bright` with a black drop and half-strength ember glow. All `h1` to `h6` take the display face at 600 in `metal-bright`.
- **Figure** (700, `--text-2xl`, line-height 1, tabular numerals): every value on a stat plate, a number input, a die face.
- **Body** (400, `--text-md`, line-height 1.55): prose, list text, facts.
- **Label** (600 to 700, `--text-xs`, tracking 0.14em, uppercase, `metal`, 1px black drop): field labels, stat names, button lettering (buttons step up to `--text-sm` at md and `--text-md` at lg), tooltips.

### Named Rules
**The Gilt Lettering Rule.** A control's text is gold tracked capitals in the display face. On hover it lights to `metal-bright` with the torch glow (`--glow-text`).

**The Numbers Stay Roman Rule.** Figures use `--font-figures` in every skin, so a skin can change the voice of the headings but never the legibility of a score.

## Layout

The layout grammar is the incumbent app's, held fixed by the user's looks-only constraint. The Shell is a three-column grid: the top bar (`--size-bar`, a clamp from 3.6rem to 4.7rem) spans all three, and below it the menu drawer, the page and the chat drawer sit side by side. The menu drawer opens on the start edge; the end edge holds the chat drawer, which carries friends and chat. A closed drawer's column is 0px; an open one runs at 400px inside the Shell (the root `--size-menu-max` 320px and `--size-chat-max` 420px are overridden there), and the columns animate over 250ms. The page caps its content at `--size-page-max` 1600px, or 860px narrow and 1200px wide.

The page is raised beside its drawers. When a drawer opens, the page rounds the two corners on that side by `--shell-bend` (1.5 times `--radius-xl`), casts a black haze on the drawer (`0 0 32px` of `--shade-hard`), and draws its edge as a gold double rule: an outer `metal` hairline and an inner `metal-dim` hairline inset by 4px. A diamond stud sits on that edge at its vertical middle. Drawers do not draw their own edge inside the Shell; a free-standing drawer (the blocks drawer on a resource page) draws its own rule and stud.

Spacing runs on a nine-step scale (2, 4, 8, 12, 16, 24, 32, 48, 72px). Stacks, rows and grids default to 12px gaps; the page holds its sections at 24px; panels and bands pad at 32px; stat plates pad tight (12px by 0.85rem). Stat plates sit in equal-width rows. Band headers bleed to the panel edge with negative margins.

Sizing is relative: flex, grid `fr`, percentages and `clamp()`; the page pads by `clamp()` against its own container width. Breakpoints are declared per component rather than as tokens; the most common is 640px. Below 1100px the profile chip drops to its face alone; below 1440px a crowded top bar drops its crest.

### Named Rules
**The Raised Page Rule.** The page is the one surface that meets a drawer. It rounds into every open drawer with `--shell-bend`, and the edge is always the gold double rule with one stud at its middle; the drawer stays square and plain behind it.

## Elevation & Depth

Hybrid and heavy. Depth is carved rather than floated: stacked inset rings, bevels and inset shade build relief inside the element, and a dark drop-shadow (or `filter: drop-shadow` for clipped shapes) lifts it off the ground. Light comes from above: a sheen on the top edge, hard shade on the bottom.

### Shadow Vocabulary
- **Rim** (`--rim`): nine inset rings, keyline, bright, gilt, dim, gilt, bright, dim, keyline, edge. Frames heavy panels.
- **Thin Rim** (`--rim-thin`): five inset rings. Stat plates, keyline panels, tooltips.
- **Bevel Up** (`--bevel-up`): top and left sheen, bottom and right shade. Raised plates.
- **Bevel Down** (`--bevel-down`): top inner shade. Every sunken well and input.
- **Glow Text** (`--glow-text`): 6px and 14px ember glow over a 1px black drop. Lit lettering.
- **Hearth** (`--shadow-hearth`): inset ember glow inside frame grounds.
- **Drops** (`--shadow-sm/md/lg`, `--drop-frame/panel/crest/relief/haze`): black lifts from 3px to 48px blur.
- **Bar Ledge**: the top bar's bottom edge is a pair of gilt hairlines (a `metal-dim` line fading at both ends over a `metal` line) running out from the crest to each side. `--shadow-bar` is still declared in `app.css` but nothing uses it; it is not part of the vocabulary.
- **Shell Bend**: the raised page's 32px `--shade-hard` haze over an open drawer.
- **Metal Glow** (`--glow-metal`): the soft gold halo of a diamond stud.
- **Focus** (`--focus-ring`): 2px abyss gap, 2px `metal-bright` ring, gilt glow.

### Named Rules
**The Sinking Slab Rule.** Press sinks: the face swaps its bevel for inset shade, dims to about 0.82 to 0.85 brightness, and the label drops 1px (sigils scale to 0.94). Nothing lifts on hover; it lights.

**The Carved Not Floated Rule.** Depth comes from rings and bevels first. A drop-shadow only separates the carved object from the ground.

## Shapes

No surface has a hard square corner. The radius scale is stored in rem: `--radius-sm` 0.5rem, `--radius-md` 0.75rem, `--radius-lg` 1.125rem, `--radius-xl` 1.625rem, `--chamfer` 0.75rem. Buttons clip to `inset(0 round …)` on the scale (sm, md, lg by button size). Stat plates and their faces are arched: an elliptical top (50% across, `--radius-xl` down) over `--radius-lg` lower corners, the gate window's arch. Wells, inputs, value boxes and the 3D map scene take `--radius-md` with a carved inner keyline or a tarnished hairline; cards `--radius-md`; panels `--radius-xl` with a `--radius-lg` keyline and a cusp flourish in all four corners; dialogs `--radius-xl`; anything ringed by the heavy `--rim` takes at least `--radius-lg`. The page's bend into an open drawer is the largest curve in the system (`--shell-bend`, 1.5 times `--radius-xl`), and its inner rule follows it 4px smaller. Frames still cut their top corners into cusped notches (`--cusp` 30px, `--dip` 18px) on the xl radius. Round is for bosses, chips and badges: sigils, orbs, spinners and card badges.

Sigils trace one of five SVG surrounds (ring, cusped, lobed, star, plate). Portraits mask to lancet, ogee, trefoil, shield or round arches; the profile chip's face masks to a quatrefoil. Stat plates and field wells carry L-shaped gilt corner braces on the top-left and bottom-right. Dividers are gilt hairlines that fade at both ends with a centred lozenge and diamond. The diamond stud (a 12px square turned 45 degrees, abyss inside a gilt hairline with a gilt lozenge at its centre) marks the middle of every drawer edge.

## Components

### Buttons
Beveled stone slabs with gold lettering.
- **Shape:** octagon by `clip-path`; a gilt gradient frame behind a textured stone face inset by 0.16rem.
- **Sizes:** sm 1.8rem, md 2.4rem, lg 3.2rem high.
- **Primary:** ember-core to dim rim, ember tint at 16 percent over the stone, `metal-bright` lettering, a standing ember sheen at 0.45.
- **Secondary:** gilt rim, plain stone, `metal` lettering, gilt light.
- **Ghost:** tarnished rim over a raised-ground face with noise.
- **Danger:** blood rim and tint; lettering lights to ink with a red glow on hover.
- **Hover / Focus:** brightness 1.08, the ember sheen rises from the bottom edge, lettering lights. Focus is a two-stage drop glow (the clip path hides a box-shadow ring).
- **Disabled:** 0.5 opacity, 0.85 grayscale.

### Icon Buttons and Sigils
- **Icon button:** a square stone key with a three-ring inset (keyline, tarnished gilt, keyline); hover brightens the middle ring to gilt with an inner ember glow; on state lights it `metal-bright`. Icons are drawn SVG from `Glyph`.
- **Sigil:** the round bronze boss of the top bar and section headers. An abyss fill inside a heavy gilt stroke and a tarnished inner key ring; tones metal, ember, verdigris, arcane, bane; active fills with 30 percent of its tone.

### Cards / Containers
- **Panel:** riveted (`--rivets` at the four corners), `--shadow-md` plus the full inset rim; variants stone (granite), parchment (leather and oak), void (motes on a radial dark).
- **Frame:** the heavy container: outer gilt edge, a stone gap, an inner gilt keyline, then the ground with hearth glow; cusped top corners; variants cathedral, dragon, iron, timber, hairline.
- **Band:** a granite header strip with a three-line gilt ledge on its bottom edge, bled to the panel edge.

### Inputs / Fields
- **Style:** a sunken abyss well with noise, a tarnished hairline border, bevel down plus a keyline and edge ring, `--radius-md`. Gilt corner braces top-left and bottom-right.
- **Focus:** border and inner ring go to `metal-bright`/gilt with the gilt glow; braces light.
- **Valid / Invalid:** the rim, braces and a small diamond mark take `state-good` or `state-bad`.
- **Label:** gold tracked capitals led by a small gilt diamond.

### Navigation
The top bar is a dark strip graded from abyss to raised ground, with the gilt bar ledge on its bottom edge. At its centre hangs the crest: a gilt-stroked shield holding the favicon mark, a faint ember halo behind it, and gilt swags with diamond beads running out to the ledge on both sides. The page title is gold-gradient tracked capitals at the start beside the menu sigil, page controls follow behind a fading gilt divider, and the search and music sigils, the profile chip and the chat sigil close the end. The profile chip is a quatrefoil gilt face over a notched gilt pennant holding the player's name and address. Tab strips on the sheet are stone slabs; the active tab lights with ember.

### Drawers
The menu, friends and chat drawers are `Sidebar`s: a starfield ground (`--texture-stars` and noise over a raised-to-abyss gradient) with a verdigris glow at the head and foot of the outer edge. They slide in over 250ms and lay their content out at the full run width whatever they are squeezed to. With `edge="rule"` a drawer draws its own inner edge, a `metal` and a `metal-dim` hairline fading at both ends with a small glowing diamond between them; with `edge="none"` it draws nothing and the Shell's raised page draws the edge (the double rule and stud above).

### Stat Plate
The signature of the sheet. A riveted octagonal plate with a thin rim, gilt corner braces and an ember wash at the top; the name in tracked capitals flanked by fading hairlines; the value in a smaller chamfer below in Cinzel figures. Label size clamps against the plate's own width (container query) so long names never break the row.

### Meters and Orbs
Sunken channels and spheres filled with a banded vertical gradient of their tone: life (`state-bad`), mana (`verdigris`), stamina (`state-good`), ember, metal.

### Tooltips
Every sigil, icon button and titled button shows its title in a thin-rimmed black plate above it, in tracked capitals in `state-warn` gold, pinned to the edge when the control is first or last in its row. On the top bar the tooltip drops below the sigil.

### 3D Dice
Dice read `--stone`, `--stone-dark`, `--metal`, `--metal-bright` and `--font-figures` from the live document. Each face is a canvas: a radial granite ground, 900 grit specks, a gilt outline stroked at 0.85 alpha, and numerals in the figures face at 600 with a black stroke. The material is flat-shaded with roughness 0.62 and metalness 0.18. A skin change re-materials the dice.

### 3D Maps
A campaign map can carry a drawn plan. Icon buttons above the map switch between the picture and the plan in 3D, a level field appears when the plan has several levels, and the DM gets a third button that opens the plan editor full screen. The 3D plan sits in a well with a `metal-dim` hairline and `--radius-md`, over a radial from raised ground to ground. Its look is read from the live tokens: background `ground`, floor `ground-raised`, rooms `ground-lift`, walls `metal`, furniture `metal-bright`, accent `ember`. The editor's drawing is a dark board (`ground-deep` with a `ground-lift` grid) with walls in `stone` edged in `stone-light`, selection and guides in `verdigris`, pending work in `ember`, fixtures in tarnished gilt and labels in `ink`.

## Do's and Don'ts

### Do:
- **Do** take every colour, space, radius, type size, shadow and border width from the tokens in `src/app.css`.
- **Do** declare a new colour token in `:root` and in all five `[data-theme]` blocks.
- **Do** bound gilt with the black keyline, and build rings from the composed `--rim` and `--rim-thin`.
- **Do** make a new material a procedural SVG filter in `app.css`, never a raster.
- **Do** letter controls and labels in the display face, uppercase, tracked 0.14em, in gilt.
- **Do** light on hover (`--glow-text`, ember sheen) and sink on press.
- **Do** keep figures in `--font-figures` with tabular numerals.
- **Do** keep the incumbent layout: a restyle changes the skin, not where things are.
- **Do** let the raised page draw the edge of a drawer inside the Shell (`edge="none"`), and give a free-standing drawer its own rule (`edge="rule"`).
- **Do** colour canvas and 3D surfaces from the live tokens, never from a fixed palette.

### Don't:
- **Don't** write a literal colour in a component, or branch on the active theme.
- **Don't** set gold directly against the ground without a keyline.
- **Don't** lift a control on hover; light it.
- **Don't** let ornament cover or crowd data; the sheet is readable before it is ornate.
- **Don't** add a raster frame or texture, or claim one exists.
- **Don't** draw a second edge on a drawer the page already bends into.
