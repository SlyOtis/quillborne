---
description: How a component is authored, which primitive owns which job, and where a value comes from
paths:
  - "web/src/components/**"
  - "web/src/pages/**"
  - "web/src/app.css"
---

## Choosing

`web/src/components/ui/` holds the primitives. `Button` is the only button. `Field` wraps every form control and styles the input it holds. `BaseDialog` is the only dialog shell. Reach for the primitive before writing an element.

A component that looks wrong is fixed with a prop or in the component. Never a wrapper div with flex, padding or width to make it size, and never reach past it.

A component that does not exist is authored in `web/src/components/ui/` and then consumed. Prove first that it is missing, and second that it cannot be composed from what is there.

## Authoring

One destructured `$props()` with a TSDoc line on every prop. `$derived` for computed values, `$effect` only for work outside the render. No comments in a component.

The root class is `dnd-<component>` and a variant is `dnd-<component>-<value>`. A variant prop is a singular lowercase enum defaulted in the destructure.

Never declare `style` or `class` as a prop name.

## Look

Colour, spacing, radius, type, shadow, border width and the focus ring come from the tokens in `web/src/app.css`. No literal colour values anywhere.

`web/src/app.css` holds five themes: medieval, forest, fire, arcane and ocean. A theme is a token re-declaration under `[data-theme]` and no component knows which one is active.

The look is a dark fantasy game UI over a midnight starfield: thin gold double rules, diamond studs and traced frames. `Shell` raises the page between its two drawers, the menu on the start edge and friends and chat on the end edge, and the page bends into each open drawer with a gold double line and a stud on that edge, the way a Mar page rounds beside its sidebar. `Sidebar` takes `edge`: `rule` draws its own gold rule and stud, `none` leaves the edge to what it sits beside, as in `Shell`.

`web/src/lib/dialogs/theme.ts` owns the theme list and the `dnd_theme` key. `getTheme` and `setTheme` are the only way a theme is read or applied. Never write `data-theme` or the key directly.

## Accessibility

A clickable card is a `<button>`, not a div with a handler. A file drop zone carries a role and an `aria-label`. Every control a `Field` wraps carries the id the `Field` points at.

`just check` is zero warnings. An a11y warning is a regression, not a note.
