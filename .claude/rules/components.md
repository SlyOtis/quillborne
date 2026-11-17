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

## Names

A name is the user's: a component, a prop, a variant value or a token is proposed and written only once it has been said. A component is named for what it is, one or two words, with no prefix beyond the `dnd-` of its root class.

## Brought in from another library

A piece brought in from another library takes no prefix from it and is brought up in place as code of this repo: rewritten on the tokens, the primitives and the authoring rules above, never imported and wrapped. It keeps its job, its states and its keyboard behaviour; it loses its own colours, sizes and shell.

## The one of each

One dialog shell, `web/src/components/BaseDialog.svelte`. A full screen stage, the picture gallery and the plan editor, is not a dialog: it covers the page and draws no dialog chrome. One tooltip, drawn top most by `web/src/components/Frame.svelte`; no component draws its own with `[title]::after`. One page head, `PageHead` in `web/src/components/ui/`, which collapses on scroll. A second of any of them is drift to remove.

## Layout

A layout is relative: flexbox or grid, a fraction, a percentage or `fr`, clamped with `min-*`, `max-*` or `clamp()`. Never a measured pixel size. The row decides how large a glyph control is, and a primitive that takes a size takes one the design system names, `buttons.md`.

## Good and bad

- Good: a `Button` that will not fit gets a prop on `Button`, or the fix lands in `Button`. Bad: a `<span>` or a `<div>` around it with flex, padding or a width.
- Good: a new colour is a token in `:root` and in all five themes. Bad: a hex, an `rgb()` or a branch on `data-theme` in a component.
- Good: state a reader can return to lives in a query parameter. Bad: a view, a sort or a selection kept only in component state.
- Good: a page shows what the api answered. Bad: a component that filters rows by who may see them.

## Seen before done

A page is seen in the browser before it is called done: the stack of this worktree on its own slot through the `run` skill, the page opened with the `nimon` skill at a narrow and a wide width, and in a second theme when a colour changed.
