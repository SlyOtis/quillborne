---
name: Quillborne
description: The table's character sheet and campaign book, dressed as a WarCraft III game menu.
colors:
  ground-deep: "#0a0806"
  ground: "#15110c"
  ground-raised: "#211a12"
  ground-lift: "#30271b"
  stone: "#4a4034"
  stone-light: "#7a6c58"
  stone-dark: "#1f1a14"
  wood: "#3a2413"
  wood-dark: "#1c1009"
  metal: "#d4a445"
  metal-bright: "#ffe39a"
  metal-dim: "#6e5120"
  metal-edge: "rgba(255, 227, 154, 0.3)"
  keyline: "#0b0703"
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
---

# Design System: Quillborne

## Overview

**Creative North Star: "The Frozen Throne Menu"**

Every surface is a WarCraft III game menu rebuilt in CSS. Chrome is carved granite and dark oak; every container is ringed in gilt with a black keyline on both sides; every button is a beveled stone slab with gold capital lettering that lights like a torch on hover and sinks when pressed. The ground is the sign-in gate's hall, painted once in the Frame, which stays mounted around every page: near-black under a warm vignette, the arched `Glass` window faint at its centre, two hung `Flame` lanterns at the edges (hidden below a 47.5rem shell), and `Aura` veil and ember motes over it. Nothing is flat: a control has weight, a well is sunk, a plate stands proud.

The ornament is a frame for data, never a competitor to it. The character sheet is dense (stat plates in rows, a crown slab with the portrait in a gilded arch, a hit point block, tabbed actions), and it stays readable at a glance: gold labels in small tracked capitals above large Cinzel figures on dark ground. All material is procedural. Stone, grain, leather and noise are inline SVG `feTurbulence` filters in `src/app.css`, and no raster frame or texture ships (there is no raster provenance to record).

Five race skins exist and every one comes from tokens: Alliance (`medieval`, the default gold on warm brown), Night Elf (`forest`, lilac silver on violet night with a teal torch), Horde (`fire`, copper on scorched brown with a red flame), Scourge (`arcane`, bone on moss black with a fel green light) and Frozen Throne (`ocean`, ice silver on deep blue with a cyan light). A skin re-declares the same token names under `:root[data-theme]`, and swaps the display and body faces. The 3D dice read the active skin live.

This system was applied under a standing looks-only constraint from the user: layouts, menus and screens stayed exactly where they were. The skin re-dressed the incumbent grammar; it did not move a single region.

**Key Characteristics:**
- Near-black torchlit ground, gilt trim, ember light.
- Multi-ring gilt rims bounded by black keylines.
- Beveled stone slabs for buttons, sunken black wells for inputs.
- Gold tracked capitals for every label and control.
- Procedural SVG textures only; no rasters.
- Five race skins by token re-declaration; components are theme-blind.

## Colors

A torchlit near-black palette: warm grounds, three-step gilt metal, one ember light and one cool secondary light, re-tinted wholesale per race skin.

### Primary
- **Gilt** (`metal`): the trim of every rim, the ink of every label and button, the stroke of every sigil ring. It is the system's structural colour.
- **Burnished Highlight** (`metal-bright`): the lit edge of a rim, headings, a hovered button label, the focus ring, dice numerals.
- **Tarnished Gilt** (`metal-dim`): the shadowed band of a rim, the hairline border of wells, scrollbar thumbs, the resting border of inputs.

### Secondary
- **Torch Ember** (`ember`, with `ember-core` and `ember-glow`): light, never paint. It arrives as text glow on hover, as radial washes at 7 to 16 percent mix behind plates and primary buttons, as the inner hearth glow of frames, and as the ember meter fill.

### Tertiary
- **Verdigris** (`verdigris`, `verdigris-dim`): the cool second light. Mana meters, verdigris-toned sigils and cards. Per skin it becomes teal, blood red, fel violet or ice blue.

### Neutral
- **Abyss / Ground / Raised / Lift** (`ground-deep`, `ground`, `ground-raised`, `ground-lift`): the four-step dark ladder. Panels grade from raised at the top to ground or abyss at the bottom.
- **Granite** (`stone`, `stone-light`, `stone-dark`): the stone texture lives on the top bar, button faces and frame gaps only; every other surface takes grain on the ground ladder. The flat stone colour also tints icon buttons and the dice.
- **Oak** (`wood`, `wood-dark`): the leather-and-oak panel variant.
- **Keyline** (`keyline`): the near-black line that bounds every gilt ring on both sides.
- **Vellum Ink** (`ink`, `ink-dim`, `ink-faint`): body text, secondary text, placeholders.
- **Parchment** (`--texture-parchment`, a radial from #e9d9b4 to #b99a62, with `ink-parchment`): the one light surface.
- **States** (`state-good`, `state-warn`, `state-bad`): stamina and valid, tooltip lettering, life and danger and invalid.

### Named Rules
**The Theme-Blind Rule.** A component reads tokens and never knows which skin is active. A new colour is a new token declared in `:root` and in all five `[data-theme]` blocks, or it does not exist.

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

The layout grammar is the incumbent app's, held fixed by the user's looks-only constraint. A shell grid puts the top bar (`--size-bar`, a clamp from 3.6rem to 4.7rem) above a single content row; side drawers for the menu, chat and sidebar open against maxima (`--size-menu-max` 320px, `--size-chat-max` 420px, `--size-sidebar-max` 400px) and the page caps at `--size-page-max` 1600px.

Spacing runs on a nine-step scale (2, 4, 8, 12, 16, 24, 32, 48, 72px). Stacks, rows and grids default to 12px gaps; panels and bands pad at 32px; stat plates pad tight (12px by 0.85rem). Stat plates sit in equal-width rows. Band headers bleed to the panel edge with negative margins.

Sizing is relative: flex, grid `fr`, percentages and `clamp()`. Breakpoints are declared per component rather than as tokens; the most common is 640px.

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
- **Bar** (`--shadow-bar`): the top bar's drop plus a three-line gilt ledge on its bottom edge.
- **Focus** (`--focus-ring`): 2px abyss gap, 2px `metal-bright` ring, gilt glow.

### Named Rules
**The Sinking Slab Rule.** Press sinks: the face swaps its bevel for inset shade, dims to about 0.82 to 0.85 brightness, and the label drops 1px (sigils scale to 0.94). Nothing lifts on hover; it lights.

**The Carved Not Floated Rule.** Depth comes from rings and bevels first. A drop-shadow only separates the carved object from the ground.

## Shapes

No surface has a hard square corner. The radius scale is stored in rem: `--radius-sm` 0.5rem, `--radius-md` 0.75rem, `--radius-lg` 1.125rem, `--radius-xl` 1.625rem, `--chamfer` 0.75rem. Buttons clip to `inset(0 round …)` on the scale (sm, md, lg by button size). Stat plates and their faces are arched: an elliptical top (50% across, `--radius-xl` down) over `--radius-lg` lower corners, the gate window's arch. Wells, inputs and value boxes take `--radius-md` with a carved inner keyline; cards `--radius-md`; panels `--radius-xl` with a `--radius-lg` keyline and a cusp flourish in all four corners; dialogs `--radius-xl`; anything ringed by the heavy `--rim` takes at least `--radius-lg`. The top bar rounds its lower corners by `--radius-lg`. Frames still cut their top corners into cusped notches (`--cusp` 30px, `--dip` 18px) on the xl radius. Round is for bosses, chips and badges: sigils, orbs, spinners, the profile chip and card badges.

Sigils trace one of five SVG surrounds (ring, cusped, lobed, star, plate). Portraits mask to lancet, ogee, trefoil, shield or round arches. Stat plates and field wells carry L-shaped gilt corner braces on the top-left and bottom-right. Dividers are gilt hairlines that fade at both ends with a centred lozenge and diamond.

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
The top bar is a granite strip with the bar shadow and its gilt ledge; a sigil at each end opens the menu and the chat, sigils in the middle carry the page tools, and the signed-in player sits in a thin-rimmed plate. Tab strips on the sheet are stone slabs; the active tab lights with ember.

### Stat Plate
The signature of the sheet. A riveted octagonal plate with a thin rim, gilt corner braces and an ember wash at the top; the name in tracked capitals flanked by fading hairlines; the value in a smaller chamfer below in Cinzel figures. Label size clamps against the plate's own width (container query) so long names never break the row.

### Meters and Orbs
Sunken channels and spheres filled with a banded vertical gradient of their tone: life (`state-bad`), mana (`verdigris`), stamina (`state-good`), ember, metal.

### Tooltips
Every sigil, icon button and titled button shows its title in a thin-rimmed black plate above it, in tracked capitals in `state-warn` gold, pinned to the edge when the control is first or last in its row.

### 3D Dice
Dice read `--stone`, `--stone-dark`, `--metal`, `--metal-bright` and `--font-figures` from the live document. Each face is a canvas: a radial granite ground, 900 grit specks, a gilt outline stroked at 0.85 alpha, and numerals in the figures face at 600 with a black stroke. The material is flat-shaded with roughness 0.62 and metalness 0.18. A skin change re-materials the dice.

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

### Don't:
- **Don't** write a literal colour in a component, or branch on the active theme.
- **Don't** set gold directly against the ground without a keyline.
- **Don't** lift a control on hover; light it.
- **Don't** let ornament cover or crowd data; the sheet is readable before it is ornate.
- **Don't** add a raster frame or texture, or claim one exists.
