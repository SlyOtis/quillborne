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
  shadow-ink: "#000"
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
  rarity-common: "#cfc4ad"
  rarity-uncommon: "#4fd46a"
  rarity-rare: "#5a9cf2"
  rarity-very-rare: "#b56cf2"
  rarity-legendary: "#ffa53a"
  rarity-artifact: "#e07a5a"
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
  button-plain:
    textColor: "{colors.metal}"
    typography: "{typography.label}"
    height: "2.4rem"
    padding: "0"
  button-hover:
    textColor: "{colors.metal-bright}"
  iconbtn:
    textColor: "{colors.metal}"
    rounded: "{rounded.pill}"
    size: "1.75em"
    padding: "0.3em"
  iconbtn-hover:
    textColor: "{colors.metal-bright}"
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
  search-input:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 8px"
  dropdown:
    textColor: "{colors.metal}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 4px"
  toggle-group:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.metal}"
    rounded: "{rounded.md}"
  chip:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  chip-on:
    textColor: "{colors.metal-bright}"
  pill-tabs:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.metal}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  pill-tabs-on:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.metal-bright}"
  page-tab:
    textColor: "{colors.ink-dim}"
    padding: "8px 12px"
  page-tab-on:
    textColor: "{colors.metal-bright}"
  tooltip:
    backgroundColor: "{colors.shadow-ink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
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
    width: "320px"
  drawer-chat:
    backgroundColor: "{colors.ground-raised}"
    width: "400px"
  map-scene:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.md}"
---

# Design System: Quillborne

## Overview

**Creative North Star: "The Frozen Throne Menu"**

Every surface is a WarCraft III game menu rebuilt in CSS. Chrome is carved granite and dark oak; every container is ringed in gilt with a black keyline on both sides; every worded button is a beveled stone slab with gold capital lettering that lights like a torch on hover and sinks when pressed, and a control that is only a glyph is the glyph alone, framed only when it is a fixture of the surface it sits on. The ground is a midnight starfield, painted once in the Frame, which stays mounted around every page: it lays `--texture-stars` and noise over a raised-to-abyss gradient, and the page is a raised plate on it, painted with `--backdrop` (a blue haze at both upper edges and a black pool at the foot in the default skin). Inside the page sits the sign-in gate's hall: the arched `Glass` window faint at its centre, two hung `Flame` lanterns at the edges (hidden below a 47.5rem shell), and `Aura` veil and ember motes over it. Nothing is flat: a control has weight, a well is sunk, a plate stands proud.

The ornament is a frame for data, never a competitor to it. The character sheet is dense (stat plates in rows, a crown slab with the portrait in a gilded arch, a hit point block, tabbed actions), and it stays readable at a glance: gold labels in small tracked capitals above large Cinzel figures on dark ground. All material is procedural. Stone, grain, leather, noise and stars are inline SVG in `web/src/app.css`, and no raster frame or texture ships.

Five race skins exist and every one comes from tokens: Alliance (`medieval`, the default pale gold on midnight blue with an orange torch), Night Elf (`forest`, lilac silver on violet night with a teal torch), Horde (`fire`, copper on scorched brown with a red flame), Scourge (`arcane`, bone on moss black with a fel green light) and Frozen Throne (`ocean`, ice silver on deep blue with a cyan light). A skin re-declares the same token names under `:root[data-theme]`, and swaps the display and body faces; the starfield is shared by every skin. The 3D dice and the 3D map plans read the active skin live.

**Key Characteristics:**
- Midnight starfield ground, pale gilt trim, ember light.
- Multi-ring gilt rims bounded by black keylines.
- The page is raised beside its drawers and rounds into them behind a thin gold double rule and a diamond stud.
- Beveled stone slabs for worded buttons, bare glyphs for icon controls, sunken black wells for inputs.
- Gold tracked capitals for every label and control.
- Procedural SVG textures only; no rasters.
- Five race skins by token re-declaration; components are theme-blind.

## Colors

A midnight palette: blue-black grounds, three-step pale gilt metal, one ember light and one cool secondary light, re-tinted wholesale per race skin.

### Primary
- **Gilt** (`metal`): the trim of every rim, the ink of every label and button, the resting colour of every glyph, the stroke of every sigil ring, the outer line of the shell bend. It is the system's structural colour.
- **Burnished Highlight** (`metal-bright`): the lit edge of a rim, headings, a hovered or chosen control, the focus ring, dice numerals, the light face of a diamond stud.
- **Tarnished Gilt** (`metal-dim`): the shadowed band of a rim, the hairline border of wells, chips, tooltips and the map scene, the inner line of the shell bend, tree guides, table rules, scrollbar thumbs, the resting border of inputs.

### Secondary
- **Torch Ember** (`ember`, with `ember-core` and `ember-glow`): light, never paint. It arrives as text glow on hover, as radial washes at 7 to 22 percent mix behind plates, primary buttons and the current row of a tree or table, as the breathing glow under the chosen menu tab, as the inner hearth glow of frames, the crest's halo and the gate veil, and as the ember meter fill.

### Tertiary
- **Verdigris** (`verdigris`, `verdigris-dim`): the cool second light. Mana meters, verdigris-toned sigils and cards, the glow at the head and foot of every drawer, the tag words of the file hover card, and the selection and hover colour of the map editor. Per skin it becomes teal, blood red, fel violet or ice blue.

### Neutral
- **Abyss / Ground / Raised / Lift** (`ground-deep`, `ground`, `ground-raised`, `ground-lift`): the four-step midnight ladder. Panels and drawers grade from raised at the top to ground or abyss at the bottom.
- **Granite** (`stone`, `stone-light`, `stone-dark`): slate blue in the default skin. The stone texture lives on button faces, the lit face of a pill tab, bands and frame gaps only; every other surface takes grain or stars on the ground ladder. The flat stone colour also tints the dice and the walls of the map editor's drawing.
- **Oak** (`wood`, `wood-dark`): the leather-and-oak panel variant, stained midnight in the default skin.
- **Keyline** (`keyline`): the near-black line that bounds every gilt ring on both sides; one value for every skin.
- **Shadow Ink** (`shadow-ink`): the black of every text drop, scrim and shade mix: the 1px drop under lettering, the scrim over a page head banner, the 88 percent ground of a tooltip. Declared once in `:root`; one value for every skin.
- **Starfield** (`--texture-stars`): pale blue-white specks at 0.3 to 0.6 opacity on a 180px tile, over the Shell ground and every drawer.
- **Vellum Ink** (`ink`, `ink-dim`, `ink-faint`): body text, secondary text, placeholders.
- **Parchment** (`--texture-parchment`, a radial from #e9d9b4 to #b99a62, with `ink-parchment`): the one light surface.
- **States** (`state-good`, `state-warn`, `state-bad`): stamina and valid; warning; life, danger, invalid and the `bane` tone of a destructive control.
- **Rarity** (`rarity-common`, `rarity-uncommon`, `rarity-rare`, `rarity-very-rare`, `rarity-legendary`, `rarity-artifact`): the ink of an item's name on a row and of the word on a rarity chip, re-declared per skin.

### Named Rules
**The Theme-Blind Rule.** A component reads tokens and never knows which skin is active. A new colour is a new token declared in `:root` and in all five `[data-theme]` blocks, or it does not exist. A canvas or WebGL surface reads the same tokens from the live document (`getToken` in `web/src/lib/nimap-editor/look.ts`).

**The Ember Is Light Rule.** Ember is emitted, not filled: glow, text-shadow, and radial or linear washes at 22 percent mix or less. Its only solid uses are the ember meter, an ember-toned glyph and the ring of the reader's own presence disc.

**The Keyline Rule.** Every gilt ring is bounded by the near-black keyline on its inner and outer edge. Gold never touches the ground directly.

**The Tone Is Meaning Rule.** A tone names what a control means, never a colour: `metal` is neutral, `ember` is the character's own, `verdigris` is the world's, `bane` is destructive. A call site picks a tone and never a colour value.

## Typography

**Display Font:** Cinzel (with Trajan Pro, Georgia), swapped per skin: Uncial Antiqua (Night Elf), Grenze (Horde), Metamorphous (Scourge), Cinzel (Alliance, Frozen Throne).
**Body Font:** Alegreya (with Spectral, Georgia), swapped per skin: Vollkorn (Horde), EB Garamond (Scourge), Cardo (Frozen Throne).
**Figures Font:** Cinzel (`--font-figures`), fixed across skins so numbers read the same everywhere.
**Mono Font:** IBM Plex Mono.

**Character:** Inscriptional Roman capitals over a warm humanist book face: the carved plaque above the page of the rulebook.

The scale is seven fluid steps (`--text-xs` to `--text-3xl`, ratio about 1.2), each a `clamp()` against viewport width, on a root size of 106.25 percent.

### Hierarchy
- **Display** (600, `--text-3xl`, tracking 0.14em): the hero heading of a page head, `metal-bright` with a layered ember glow; it steps down to `--text-xl` when the head collapses.
- **Headline** (600, `--text-xl`, tracking 0.05em): section and panel headings, `metal-bright` with a black drop and half-strength ember glow. All `h1` to `h6` take the display face at 600 in `metal-bright`.
- **Figure** (700, `--text-2xl`, line-height 1, tabular numerals): every value on a stat plate, a number input, a die face. Counts beside a heading, on a tree row and in a pool run smaller in the same face.
- **Body** (400, `--text-md`, line-height 1.55): prose, list text, facts. Tooltips, menu rows and table cells are body at `--text-xs` to `--text-sm`, sentence case.
- **Label** (600 to 700, `--text-xs`, tracking 0.14em, uppercase, `metal`, 1px `shadow-ink` drop): field labels, stat names, button lettering (buttons step up to `--text-sm` at md and `--text-md` at lg), tab words, column headers, the dialog title (at `--text-sm`).

### Named Rules
**The Gilt Lettering Rule.** A control's text is gold tracked capitals in the display face. On hover it lights to `metal-bright` with the torch glow (`--glow-text`).

**The Numbers Stay Roman Rule.** Figures use `--font-figures` in every skin, so a skin can change the voice of the headings but never the legibility of a score.

## Layout

The layout is held fixed: a restyle changes the skin, not where things are. The Shell is a three-column grid: the top bar (`--size-bar`, a clamp from 3.6rem to 4.7rem) spans all three, and below it the menu drawer, the page and the chat drawer sit side by side. The menu drawer opens on the start edge; the end edge holds the chat drawer, which carries friends and chat. A closed drawer's column is 0px; open, the menu runs at `--size-menu-max` (320px) and the chat at 400px (the Shell overrides the root `--size-chat-max` of 420px), and the columns animate over 250ms. The page caps its content at `--size-page-max` 1600px, or 1040px narrow and 1200px wide.

The page is raised beside its drawers. When a drawer opens, the page rounds the two corners on that side by `--shell-bend` (1.5 times `--radius-xl`), casts a black haze on the drawer (`0 0 32px` of `--shade-hard`), and draws its edge as a gold double rule: an outer `metal` hairline and an inner `metal-dim` hairline inset by 4px. A diamond stud sits on that edge at its vertical middle. Drawers do not draw their own edge inside the Shell; a free-standing drawer (the blocks drawer on a resource page) draws its own rule and stud.

A page opens with its page head, a band that sticks to the top of the scroll and collapses as the page moves under it; the body follows at the page's hold. Spacing runs on a nine-step scale (2, 4, 8, 12, 16, 24, 32, 48, 72px). Stacks, rows and grids default to 12px gaps; the page holds its sections at 24px; panels and bands pad at 32px; stat plates pad tight. Stat plates sit in equal-width rows. Band headers bleed to the panel edge with negative margins.

Sizing is relative: flex, grid `fr`, percentages and `clamp()`; the page pads by `clamp()` against its own container width. A glyph control is sized in `em`, so the row it sits in decides how big it is. Breakpoints are declared per component rather than as tokens. On the bar: below 1100px the character and campaign chips drop to their faces alone; below 860px the music player keeps only its three controls and the page tightens its padding to 16px; below 560px the bar tightens its gaps. A table narrower than its columns stacks each row into a lead line with labelled values under it.

### Named Rules
**The Raised Page Rule.** The page is the one surface that meets a drawer. It rounds into every open drawer with `--shell-bend`, and the edge is always the gold double rule with one stud at its middle; the drawer stays square and plain behind it.

**The Row Decides Rule.** A glyph button is square and fills the height its row gives it (1.75em of the row's type size). A call site that wants a bigger one gives the row more height, never the button a size, and never wraps it to move it.

## Elevation & Depth

Hybrid and heavy. Depth is carved rather than floated: stacked inset rings, bevels and inset shade build relief inside the element, and a dark drop-shadow (or `filter: drop-shadow` for clipped shapes) lifts it off the ground. Light comes from above: a sheen on the top edge, hard shade on the bottom.

### Shadow Vocabulary
- **Rim** (`--rim`): nine inset rings, keyline, bright, gilt, dim, gilt, bright, dim, keyline, edge. Frames heavy panels and a card or row that is the reader's own.
- **Thin Rim** (`--rim-thin`): five inset rings. Stat plates, keyline panels, the pill tab track, and every floating menu: the dropdown panel, the file menu, the block menu, the search field's tag list, the preview well.
- **Bevel Up** (`--bevel-up`): top and left sheen, bottom and right shade. Raised plates.
- **Bevel Down** (`--bevel-down`): top inner shade. Every sunken well and input, the search field, the toggle group.
- **Glow Text** (`--glow-text`): 6px and 14px ember glow over a 1px `shadow-ink` drop. Lit lettering.
- **Hearth** (`--shadow-hearth`): inset ember glow inside frame grounds.
- **Drops** (`--shadow-sm/md/lg`, `--drop-frame/panel/crest/relief/haze`): black lifts from 3px to 48px blur. A floating menu takes `--shadow-lg`; a tooltip takes `--shadow-sm`.
- **Bar Ledge**: the top bar's bottom edge is a pair of gilt hairlines (a `metal-dim` line cut short at both ends over a `metal` line that tarnishes at both ends).
- **Band Ledge**: the bottom edge of a band and of the page head: `metal-dim`, `metal` and `keyline` hairlines stacked 1px apart over a soft shade.
- **Shell Bend**: the raised page's 32px `--shade-hard` haze over an open drawer.
- **Metal Glow** (`--glow-metal`): the soft gold halo of a diamond stud and of a focused search field.
- **Focus** (`--focus-ring`): 2px abyss gap, 2px `metal-bright` ring, gilt glow.

### Named Rules
**The Sinking Slab Rule.** Press sinks: the face swaps its bevel for inset shade, dims to about 0.82 to 0.88 brightness, and the label drops 1px (sigils scale to 0.94). Nothing lifts on hover; it lights.

**The Carved Not Floated Rule.** Depth comes from rings and bevels first. A drop-shadow only separates the carved object from the ground.

**The No One Sided Border Rule.** A surface never carries a thick rounded border on one side alone: no inset bar, no accent spine, no edge stripe on a tile, a card or a row. A current row lights with its wash, its keyline and its glow, all four sides alike. A hairline rule under a header row, a section divide or the open page tab is a rule, not a spine.

**The Top Most Tooltip Rule.** A tooltip is drawn once, in the top layer, and is never clipped by the surface its control sits in.

## Shapes

No surface has a hard square corner. The radius scale is stored in rem: `--radius-sm` 0.5rem, `--radius-md` 0.75rem, `--radius-lg` 1.125rem, `--radius-xl` 1.625rem, `--chamfer` 0.75rem. Buttons clip to `inset(0 round …)` on the scale (sm, md, lg by button size). Stat plates and their faces are arched: an elliptical top (50% across, `--radius-xl` down) over `--radius-lg` lower corners, the gate window's arch. A cut stat plate is cut at all four corners by `--chamfer` inside a thin double rule: an outer `metal` hairline and an inner `metal-dim` hairline 4px inside it, each layer's cut shortened by 0.586 of its inset so the diagonals keep the gap of the straight sides. Wells, inputs, the search field, the toggle group, value boxes, file tiles and the 3D map scene take `--radius-md` with a carved inner keyline or a tarnished hairline; chips, tooltips, menus, rows, pill tabs and toasts `--radius-sm`; cards `--radius-md`; panels `--radius-xl` with a `--radius-lg` keyline and a cusp flourish in all four corners; dialogs `--radius-xl`; anything ringed by the heavy `--rim` takes at least `--radius-lg`. The page's bend into an open drawer is the largest curve in the system (`--shell-bend`, 1.5 times `--radius-xl`), and its inner rule follows it 4px smaller. Frames still cut their top corners into cusped notches (`--cusp` 30px, `--dip` 18px) on the xl radius. Round is for bosses and discs: sigils, orbs, spinners, presence discs, the tick on a file tile, the hover wash of an icon button and a dropdown, and card badges.

Sigils trace one of six SVG surrounds (quatrefoil, ring, cusped, lobed, star, plate). Portraits sit in one of ten traced frames (arch, lancet, ogee, trefoil, shield, round, cusped, gable, quatrefoil, reliquary); the bar chips' faces mask to a quatrefoil. Arched stat plates carry L-shaped gilt braces on both lower corners; field wells carry them on the top-left and bottom-right. Dividers are gilt hairlines that fade at both ends with a centred lozenge and diamond. The diamond stud (a 12px square turned 45 degrees, abyss inside a gilt hairline with a gilt lozenge at its centre) marks the middle of every drawer edge.

## Components

### Buttons
A button carries a word. Anything read as a sentence is a button and nothing else.
- **Shape:** a rounded slab clipped to `inset(0 round …)`; a gilt gradient frame behind a textured stone face inset by 0.16rem.
- **Sizes:** sm 1.8rem, md 2.4rem, lg 3.2rem high.
- **Primary:** ember-core to dim rim, ember tint at 16 percent over the stone, `metal-bright` lettering, a standing ember sheen at 0.45.
- **Secondary:** gilt rim, plain stone, `metal` lettering, gilt light.
- **Ghost:** tarnished rim over a raised-ground face with noise.
- **Danger:** blood rim and tint; lettering lights to ink with a red glow on hover.
- **Plain:** the words alone: no frame, no face, no sheen, no padding and no drop. Gilt tracked capitals that light on hover; a glyph may lead the word. The foot of the menu and the line that reopens a folded section are plain.
- **Hover / Focus:** brightness 1.08, the ember sheen rises from the bottom edge, lettering lights. Focus is a two-stage drop glow (the clip path hides a box-shadow ring).
- **Loading / Disabled:** a spinner leads the label and blocks the press; disabled is 0.5 opacity, 0.85 grayscale.

### Icon Buttons and Sigils
- **Icon button:** a glyph and nothing around it: no border, no background, no plate. It is the default for a glyph-only control (a fold, a zoom step, a block handle, a row action, a close). A 1.75em square with 0.3em of padding, so the row decides its size; the glyph is `metal` at rest, or the tone it is given (`ember`, `verdigris`, `bane`, `ink`).
- **Icon button states:** hover lights the glyph to `metal-bright` over a round 16 percent `metal` wash; press dims to 0.85 with an inset shade; active lights the glyph inside a `metal-bright` ring between keylines with an ember glow; a count sits in the lower right corner as a small figure on an abyss tab; disabled is 0.4 opacity, 0.85 grayscale; focus is `--focus-ring`.
- **Framed button:** a glyph inside a traced sigil frame, for a control that has to read as a fixture of its surface: the bar handles and the section sigils on the hearth. A control inside a panel that already has a border does not get a second one.
- **Sigil:** the round bronze boss of the top bar and section headers. An abyss fill inside a heavy gilt stroke and a tarnished inner key ring; 2.25rem, 3.3rem or 4.6rem across; tones metal, ember, verdigris, arcane, bane; active fills with 30 percent of its tone; a charge count sits on the lower right of the ring.
- **Glyphs:** every mark is a drawn SVG from `Glyph`, in the current colour and scaled against the type scale (sm, md, lg).

### Chips
- **Style:** a small tag: abyss ground, an 80 percent `metal-dim` hairline, `--radius-sm`, 2px by 8px padding, the word in the display face at `--text-xs` in `ink-dim`, an optional `metal` glyph leading it.
- **States:** hover takes a `metal` border and `metal-bright` word; press dims to 0.85; on takes the `metal` border with an inset and outer ember glow; still is a plain mark that cannot be pressed and does not light.
- **Rarity:** the word takes the rarity ink, and an on chip takes its border and glow from the same ink.
- **Use:** tags in the search field and on file tiles, table tag cells (three, then a count), and the read-only access mask.

### Cards / Containers
- **Panel:** riveted (`--rivets` at the four corners), `--shadow-md` plus the full inset rim; variants stone (granite), parchment (leather and oak), void (motes on a radial dark).
- **Frame:** the heavy container: outer gilt edge, a stone gap, an inner gilt keyline, then the ground with hearth glow; cusped top corners; variants cathedral, dragon, iron, timber, hairline.
- **Band:** a header strip graded from raised ground to abyss under a faint ember wash, with the band ledge on its bottom edge and `--radius-lg` lower corners, bled to the panel edge.
- **Card:** a pressable plate for a character, a campaign or a thing: layouts row, tile, face and square; a medallion portrait or the first letter of the title; a badge in the upper right; hash words under the name; the people seated at it stacked on its top left corner. A heavy frame rings it in the full `--rim`, the mark of the reader's own.
- **Row:** a pressable line plate at `--radius-sm`: a square picture, the name, a quieter line, columns and a closing mark, over a faint wash of its tone (metal, ember, verdigris). Hover brightens the ring to `metal` and lights the name; press dims to 0.88; the current row takes the heavy rim and an ember glow. The name takes a rarity ink when given one.
- **Fold:** a titled band that opens and closes its body, as a cut plate or as a flush row in a list, with a count at its end.

### Section
A titled divide inside a page. The name is a label in `metal-bright` at `--text-sm` with an ember glow, an italic note beside it, and a 55 percent `metal` hairline under the whole line; an icon button folds the body and further actions sit at the tail. Folded, the body shows a short peek that fades out under a mask, and a plain button under it shows it again.

### Inputs / Fields
- **Style:** a sunken abyss well with noise, a tarnished hairline border, bevel down plus a keyline and edge ring, `--radius-md`. Gilt corner braces top-left and bottom-right.
- **Focus:** border and inner ring go to `metal-bright`/gilt with the gilt glow; braces light.
- **Valid / Invalid:** the rim, braces and a small diamond mark take `state-good` or `state-bad`.
- **Label:** gold tracked capitals led by a small gilt diamond; a help line or an error under the control, and a button may sit on the control's row.
- **Picker:** a well of chips with a typed filter and a list under it; a chip's rim says whether it is a group, a person or a thing.

### Search Input
- **Well:** a sunken abyss field at `--radius-md` with a gilt hairline (55 percent `metal` over `metal-dim`) and bevel down; an `ink-faint` glyph leads it, the text is body at `--text-xs` with a `metal` caret, and an `ink` icon button clears it.
- **Band:** the same field run edge to edge: square, solid abyss, no bevel, one tarnished hairline below. It heads the menu's page list and the playlist.
- **Tags:** hash tags sit inside the field before the text as lit chips; a `#` typed in the text opens a thin-rimmed list of the tags on offer, and the chosen option lights on a 16 percent `metal` wash.
- **Hover / Focus:** the border goes to `metal`; focus adds `--glow-metal`. Disabled is 0.55 opacity.

### Dropdown
A quiet pick inside a head or a toolbar: the chosen option's label in gilt tracked capitals at `--text-xs`, an optional glyph before it and a chevron after it, with no frame at rest. Hover lights it over a round 16 percent `metal` wash; focus is `--focus-ring`. Picking one uses the native list on an abyss ground; picking several opens a thin-rimmed panel of checks at `--radius-sm` under `--shadow-lg`, whose rows light on an ember wash from the start edge and whose held options read `ink-faint`.

### Toggle Group
Icon buttons fused into one sunken control: an abyss well at `--radius-md` with a gilt hairline and bevel down, the toggles divided by tarnished hairlines, each carrying its own active state. An actions strip may fuse to either side, sharing the same edge with its inner corners squared; an active action lights on an 18 percent `metal` wash rather than a ring. It holds the view switch at the end of a page head's content row.

### Pill Tabs
A segmented switch for two to a few views of one thing. The track is an abyss well at `--radius-sm` inside a thin rim with bevel down; the words are gilt tracked capitals at `--text-xs`. The chosen tab is a granite face with an ember glow rising from its foot, ringed by a keyline and a `metal` line, and it slides between tabs over 0.28s; its word lights to `metal-bright` with the torch glow. An even track stretches to full width with equal shares.

### Page Tabs
The strip along the bottom edge of a page head, one tab per page of the thing being read. A tab is a glyph and a word in the display face at `--text-xs`, tracked 0.05em, `ink-dim` at rest. Hover lights the word; the open tab is `metal-bright` with the torch glow over a 2px `metal` rule on the strip's edge. The strip scrolls sideways without a scrollbar, with sticky arrows at either end when it overflows, and may end in an add button.

### Navigation
The top bar is a dark strip graded from abyss to raised ground, with the gilt bar ledge on its bottom edge. From the start edge it reads: the menu sigil, which turns slowly while the menu is open; the crest, second, which goes home; then the back and forward sigils, dimmed when there is nowhere to go. The page's own controls follow behind a fading gilt divider. At the end sit the member stack of the open campaign, the character chip and the campaign chip, and the chat sigil. A chip is a quatrefoil gilt face over a notched gilt pennant holding a name and an italic line under it; the character chip tucks under the campaign chip, and on a sheet it opens the sheet's tools as a drop under the bar. While a song plays, a small player sits on the bar: previous, play or pause in ember, next, the title, a seek line and the time, with an icon button that opens the playlist.

### Menu
The menu drawer's content. A tab row heads it on an abyss ground over a hairline: Table and Scribe in gilt tracked capitals, the chosen tab lit to `metal-bright` over an ember glow that rises from its foot and breathes over 2.6s, with an icon button at the end of the row. The body is a scroll of trees and folds: the reader's sheet, campaigns, monsters, characters and items under Table; a band search and the page tree under Scribe. The foot is one line of plain buttons, the pinned actions, each a glyph and a word, divided by fading tarnished hairlines, ending in Pin. Under it the reader's row: an initial in a hairline square, the name and address, the search key and a bell. Opened to music, the menu swaps its tab row for a rail on the same ground, a back icon button at the start, over a band search and the playlist: the queue, the songs of the selected campaign under its name, and the reader's own, each group with its own import.

### Drawers
The menu, friends and chat drawers are `Sidebar`s: a starfield ground (`--texture-stars` and noise over a raised-to-abyss gradient) with a verdigris glow at the head and foot of the outer edge. They slide in over 250ms and lay their content out at the full run width whatever they are squeezed to; content that asks for it fades the starfield out to the solid ground. With `edge="rule"` a drawer draws its own inner edge, a `metal` and a `metal-dim` hairline fading at both ends with a small glowing diamond between them; with `edge="none"` it draws nothing and the Shell's raised page draws the edge (the double rule and stud above).

### Page Head
The band that opens a page. The hero heading sits at the start of the title row with a count beside it in the figures face, and the page's actions at the end, each once. Under it, in order: crumbs (the way back as gilt label words divided by `ink-faint` slashes; the open page is the heading, never a crumb), the centre (the page's search), a one-line description in `ink-dim`, and a content row with tools at the start and the view toggle at the end. Page tabs run along the bottom edge.
- **Banner:** a picture may be painted across the band behind the title under a `shadow-ink` scrim that shades the top and foot (72 and 82 percent) and leaves the middle near clear; over it the description reads in `ink` with a dark halo and the action icon buttons sit on a blurred 45 percent `shadow-ink` disc.
- **Collapse:** once the page has scrolled 36px the head collapses: the padding drops from 32px to 8px, the heading steps from `--text-3xl` to `--text-xl`, and the crumbs, centre, description and content row fold away and fade, the banner shrinking with the band. The title row, its actions and the page tabs survive. It opens again within 10px of the top. The move takes 0.35s at a slow scroll down to 0.12s at a fast one, and nothing under reduced motion; a page too short to scroll past the collapsed head never collapses.

### Dialogs
One dialog shell. A plate at `--radius-xl` over a dimmed backdrop of motes and a faint ember pool, ringed in gilt with an inner tarnished hairline at `--radius-lg`, a tracery boss on its crown and ornaments in its four corners. The head is a granite strip with the title at the start, small: `--text-sm` gilt tracked capitals with a soft ember halo. The close is an icon button in the `bane` tone at the end of the head, with no frame. A gilt divider sits under the head and the body scrolls. The backdrop and the plate are drawn in the top layer, so whatever surface a dialog is opened from never clips or moves it, and the one opened last sits on top.

### Access Dialog
Who holds what on a thing. The dialog lists the holders by claim, each with the people on it, and a fold to add a claim and a person through pickers. The access selector is a segmented well (abyss, tarnished hairline, bevel down, `--radius-sm`): each segment is a small diamond check, a glyph, a label in tracked capitals and a line of description, stacked or inline. The chosen segment lights on an ember wash with a `metal` ring and the torch glow; under deny the segments take the `state-bad` wash and ring. Read-only, the mask is written as chips whose rim says the verb: `metal` read, `state-good` execute, `verdigris` write, `ember` owner.

### Toast
Notices stack at the bottom end corner of the window, above everything. Each is a plate at `--radius-sm` on abyss under a `state-bad` wash and hairline, bevel down and `--shadow-lg`: an ember skull mark, the text in `ink` at `--text-sm`, and a small ghost button that dismisses it.

### Tooltips
Every sigil, icon button, titled button, bar handle and bar chip shows its title in one tooltip, drawn in the top layer by the Frame with the popover attribute, so no surface clips it. It is a small plate at `--radius-sm`: 88 percent `shadow-ink` ground, a `metal-dim` hairline, `--shadow-sm`, the title in the body face at `--text-xs` in `ink`, sentence case on one line. It sits centred 4px above its control, drops below when there is no room above, and shifts sideways to stay inside the window. It shows on hover and on focus and hides on scroll.

### Tree
An outline of rows that fold. Each row is a chevron, a glyph (a folder for a row with kids, a file for the rest), the name in the body face at `--text-sm` and a quiet mark after it in the figures face. Kids hang from their parent on guides: 1px elbows in 80 percent `metal-dim` from the parent's chevron down to each child. Hover washes the row with ember from the start edge and lights the name; the row being read takes a stronger ember wash, a tarnished keyline on all four sides and an inner glow, and its ancestors open so it shows. A search draws the matches flat. With columns it gains a header of sortable label words over a `metal-dim` hairline and a hairline under each row. Bodies fold over 0.22s.

### Table
Rows on a grid of columns. The header sticks to the top on the ground colour over a `metal-dim` hairline: label words, pressable when sortable, with the sort mark showing on the sorted column. Rows are at least 2.25rem high over a 40 percent `metal-dim` hairline; the lead cell is the display face in `ink`, the rest body in `ink-dim`; a tags cell draws three chips and a count; row actions are icon buttons at the end. A pressable row washes with ember and lights its lead cell on hover; a selected row takes the same lit ground as the tree's current row; a row may open content beneath it across every column. Loading draws shimmering bones in the shape of the columns; empty writes one italic line. In a narrow container each row stacks: the lead cell at `--text-md`, then each value with its column label before it.

### File Explorer
Files and folders as a grid of tiles, sized in `em` so the surface it sits on sets its scale.
- **Tile:** a square well at `--radius-md` (a radial from lifted ground to abyss inside a keyline) holding the type glyph in `metal` with a soft glow, or the file's picture once it has drawn, over the name in the display face at `--text-sm` in `metal-bright`. Hover reveals a round tick over the mark's corner, a more button, and the tags as chips; a selected tile keeps its tick filled `metal` and rings the well in `metal-bright` with an ember glow. A folder that will take a drop lights with a `metal` hairline and glow; a dragged tile fades to 0.4. The people at an item stack on the well's corner; a lock or an index mark sits in a corner when the item is reserved or is its folder's index. The name becomes a field in place to rename.
- **Add tile:** first in the grid, a dashed `metal-dim` well with a small glyph and a label, lighting to `metal` on hover.
- **Groups:** the grid may split under label heads with a count and a hairline that fades to the end.
- **Menu:** a thin-rimmed plate at `--radius-sm` under `--shadow-lg`; rows are a `metal` glyph and a body word, lit by an ember wash on hover, a destructive row in `state-bad`; Move slides the plate sideways to a searchable list of folders.
- **Hover card:** resting on a tile shows a card in the tooltip's dress (88 percent `shadow-ink`, `metal-dim` hairline, `--shadow-md`): the name in `metal-bright`, rows of type, format, size, visibility and dates with `ink-faint` terms, and the tags in `verdigris`.
- **Preview:** a file opens in place of the grid, in a thin-rimmed well 70vh high: a banner with the name, type and size and icon buttons for previous, next and close, over the picture, video, audio, document, code or type specimen; an upload blurs the preview under a spinner.
- **Loading:** shimmering tiles until the first items arrive.

### Presence
The people at a thing, as overlapping discs 2em across: a picture or initials on a radial ground, ringed by a keyline and a `metal-dim` line. The reader's own disc takes an `ember` ring. Past the limit the rest collapse into a `+n` disc. When pressable a disc lifts to the front with an ember glow on hover. The bar shows the open campaign's members; cards and file tiles carry the stack on a corner.

### Crest
The mark of the app on the bar: a gilt-stroked shield on a field graded from lifted ground to abyss, with points and beads in `metal` and a keyline in `metal-dim`, sized to 92 percent of the bar's height. A faint ember halo sits behind it and brightens from 0.2 to 0.6 when the reader is home.

### Portrait
A picture in a traced frame: arch, lancet, ogee, trefoil, shield, round, cusped, gable, quatrefoil or reliquary. The frame is a keyline edge under a gilt rim with a faint ember glow and a thin `metal-bright` key line inside it; the picture sits under a vignette, and an arched portrait fades to abyss at its foot. Without a picture the first letter stands in, in gilt with an ember halo. Heights sm, md, lg, or the height it is given.

### Stat Plate
The signature of the sheet, and the pressable plate that shows a figure: a roll, a score, a toggle that reads as a number. An arched plate with a thin rim, gilt braces on both lower corners and an ember wash at the top; the name in tracked capitals above the figure in Cinzel, a small line under it, and a second figure in a cap under the plate. Shapes arch, the default, and cut: the cut plate writes a small caps line over the figure, a unit beside the figure on its baseline in the display face, and the name in capitals at its foot, as the speed on the sheet does. Tones metal, ember, verdigris, bane; lit marks it as spent or charged. Label size clamps against the plate's own width (container query) so long names never break the row.

### Pool
A pool of points, drawn one of two ways. As a plate it is a stat plate carrying what is left over "of" the full count. As pips it is a head line (the name as a label, an italic note under it, and what is left over the full count in the figures face with an ember halo, above a tarnished hairline) over a row of quatrefoils: ember while held, `ink` once spent, each an icon button when the pool can be changed.

### Meters and Orbs
Sunken channels and spheres filled with a banded vertical gradient of their tone: life (`state-bad`), mana (`verdigris`), stamina (`state-good`), ember, metal.

### Block Editor and Reader
A page is a document of blocks, held as markdown. The reader draws it: headings in `metal-bright` with a half-strength ember glow, stepping `--text-2xl`, `--text-xl`, `--text-lg`, with an optional outline number in the figures face in `metal`; prose at line-height 1.6 on a 65ch measure; list marks and numbers in `metal`; quotes on a 10 percent `metal` wash at `--radius-sm`; code in the mono face on abyss inside a keyline; task boxes with a tarnished hairline that fill `metal` when done; tables in a `metal-dim` hairline at `--text-xs`. The editor writes the same blocks in place, with italic `ink-faint` placeholders. Each block has a handle at its start, an icon button that drags the block and opens its menu; the menu, like the slash list, is the thin-rimmed plate of the file menu, with a label head over a hairline, fading splits, and a second panel it slides to. The blocks drawer lists the blocks on offer under label group names, each row lighting on an ember wash with a tarnished keyline.

### 3D Dice
Dice read `--stone`, `--stone-dark`, `--metal`, `--metal-bright` and `--font-figures` from the live document. Each face is a canvas: a radial granite ground, 900 grit specks, a gilt outline stroked at 0.85 alpha, and numerals in the figures face at 600 with a black stroke. The material is flat-shaded with roughness 0.62 and metalness 0.18. A skin change re-materials the dice.

### 3D Maps
A campaign map can carry a drawn plan. Icon buttons above the map switch between the picture and the plan in 3D, a level field appears when the plan has several levels, and the DM gets a third button that opens the plan editor full screen. The 3D plan sits in a well with a `metal-dim` hairline and `--radius-md`, over a radial from raised ground to ground. Its look is read from the live tokens: background `ground`, floor `ground-raised`, rooms `ground-lift`, walls `metal`, furniture `metal-bright`, accent `ember`. The editor's drawing is a dark board (`ground-deep` with a `ground-lift` grid) with walls in `stone` edged in `stone-light`, selection and guides in `verdigris`, pending work in `ember`, fixtures in tarnished gilt and labels in `ink`.

## Do's and Don'ts

### Do:
- **Do** take every colour, space, radius, type size, shadow and border width from the tokens in `web/src/app.css`.
- **Do** declare a new colour token in `:root` and in all five `[data-theme]` blocks.
- **Do** bound gilt with the black keyline, and build rings from the composed `--rim` and `--rim-thin`.
- **Do** make a new material a procedural SVG filter in `web/src/app.css`, never a raster.
- **Do** letter controls and labels in the display face, uppercase, tracked 0.14em, in gilt.
- **Do** light on hover (`--glow-text`, ember sheen, a gilt wash) and sink on press.
- **Do** keep figures in `--font-figures` with tabular numerals.
- **Do** keep the incumbent layout: a restyle changes the skin, not where things are.
- **Do** let the raised page draw the edge of a drawer inside the Shell (`edge="none"`), and give a free-standing drawer its own rule (`edge="rule"`).
- **Do** colour canvas and 3D surfaces from the live tokens, never from a fixed palette.
- **Do** use the icon button for a glyph-only control, and the plain button for words that need no slab.
- **Do** let the row size a glyph button, and name a control's meaning with a tone.
- **Do** take text drops and scrims from `--shadow-ink`.
- **Do** open a page with the page head, and put its tabs on the head's bottom edge so they survive the collapse.

### Don't:
- **Don't** write a literal colour in a component, or branch on the active theme.
- **Don't** set gold directly against the ground without a keyline.
- **Don't** lift a control on hover; light it.
- **Don't** let ornament cover or crowd data; the sheet is readable before it is ornate.
- **Don't** add a raster frame or texture, or claim one exists.
- **Don't** draw a second edge on a drawer the page already bends into.
- **Don't** put a border and a background around a glyph by hand; a framed glyph is the framed button, and it has to earn its frame.
- **Don't** frame a control inside a panel that already has a border.
- **Don't** wrap a primitive to move or size it, or restyle it from outside.
- **Don't** draw a tooltip inside the surface its control sits in; the Frame draws the one tooltip in the top layer.
