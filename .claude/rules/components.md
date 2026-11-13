---
description: How a component is authored, which primitive owns which job, and where a value comes from
paths:
  - "web/src/components/**"
  - "web/src/pages/**"
  - "web/src/app.css"
---

## Choosing

`web/src/components/ui/` holds the primitives. The buttons are `buttons.md`. `Field` wraps every form control and styles the input it holds. `web/src/components/BaseDialog.svelte` is the only dialog shell. Reach for the primitive before writing an element.

A component that looks wrong is fixed with a prop or in the component. Never a wrapper div with flex, padding or width to make it size, and never reach past it.

A component that does not exist is authored in `web/src/components/ui/` and then consumed. Prove first that it is missing, and second that it cannot be composed from what is there.

## The frame

`web/src/components/Frame.svelte` is mounted once in `App.svelte` around the router and never remounts: the bar, the crest, the lanterns, the drawers and the scroll. A page renders inside `Shell` from `web/src/components/ui/`, which hands its title, back, width, flush, `drawers` and its `nav`, `crown`, `band`, `tools` and `backdrop` snippets to the frame through the `shell` store and renders the body in place. The frame owns the one `MenuPanel` and the one `Chat`, so a page asks for them with `drawers` and never draws its own; the sheet on screen hands its sound board to the menu through the `soundBoard` store. A page change swaps only the body, which fades in, and the scroll returns to the top unless the address names a mark.

## Authoring

One destructured `$props()` with a TSDoc line on every prop. `$derived` for computed values, `$effect` only for work outside the render. No comments in a component.

The root class is `dnd-<component>` and a variant is `dnd-<component>-<value>`. A variant prop is a singular lowercase enum defaulted in the destructure.

Never declare `style` or `class` as a prop name.

## Look

Colour, spacing, radius, type, shadow, border width and the focus ring come from the tokens in `web/src/app.css`. No literal colour values anywhere.

`web/src/app.css` holds five themes: medieval, forest, fire, arcane and ocean. A theme is a token re-declaration under `[data-theme]` and no component knows which one is active.

The look is `DESIGN.md`: the tokens, the five skins and the named rules. `Shell` raises the page between its two drawers, the menu on the start edge and friends and chat on the end edge, and bends it into each open drawer with a gold double line and a stud on that edge. `Sidebar` takes `edge`: `rule` draws its own gold rule and stud, `none` leaves the edge to what it sits beside, as in `Shell`.

`web/src/lib/dialogs/theme.ts` owns the theme list and the `dnd_theme` key. `getTheme` and `setTheme` are the only way a theme is read or applied. Never write `data-theme` or the key directly.

## Accessibility

A clickable card is a `<button>`, not a div with a handler. A file drop zone carries a role and an `aria-label`. Every control a `Field` wraps carries the id the `Field` points at.

`just check` is zero warnings. An a11y warning is a regression, not a note.
