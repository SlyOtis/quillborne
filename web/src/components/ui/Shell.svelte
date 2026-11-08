<script lang="ts">
  import type { Snippet } from 'svelte'
  import { shell } from '$lib/stores/ui.store'

  const {
    title,
    back,
    width = 'wide',
    flush = false,
    drawers = false,
    backdrop,
    nav,
    crown,
    band,
    tools,
    children
  }: {
    /** The name written on the bar beside the crest. */
    title: string
    /** Runs when the back arrow is pressed. The arrow is drawn only when it is given. */
    back?: () => void
    /** Sets how far the content is allowed to run before it is held in the middle. */
    width?: 'narrow' | 'wide' | 'full'
    /** Drops the padding and the hold so the body fills the content edge to edge. */
    flush?: boolean
    /** Offers the navigator drawer at the start edge and the chat drawer at the end edge. */
    drawers?: boolean
    /** Painted across the content ground, under the veil and the page. */
    backdrop?: Snippet
    /** Controls placed on the bar after the name. */
    nav?: Snippet
    /** A full width head that scrolls away, drawn above the band. */
    crown?: Snippet
    /** A full width band that sticks once the crown has scrolled past. */
    band?: Snippet
    /** Screen actions placed on the bar before the profile chip. */
    tools?: Snippet
    /** The scrolling body of the page. */
    children?: Snippet
  } = $props()

  $effect.pre(() => {
    const mine = { title, back, width, flush, drawers, backdrop, nav, crown, band, tools }
    shell.set(mine)
    return () =>
      shell.update((now) =>
        now === mine ? { ...now, backdrop: undefined, nav: undefined, crown: undefined, band: undefined, tools: undefined } : now
      )
  })
</script>

{@render children?.()}
