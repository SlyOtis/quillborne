<script lang="ts">
  import type { Snippet } from 'svelte'
  import Ornament from './Ornament.svelte'
  import StoredImage from './StoredImage.svelte'

  const {
    title,
    sub,
    image,
    badge,
    tone = 'metal',
    layout = 'row',
    frame = 'thin',
    rim,
    holder,
    on = false,
    onclick,
    children
  }: {
    /** The name written on the card. */
    title: string
    /** A smaller line written under the name. */
    sub?: string
    /** Portrait shown in the medallion. The first letter of the title stands in when it is missing. */
    image?: string
    /** Short mark drawn in the upper right of the card. */
    badge?: string
    /** Colours the rim against the active theme. */
    tone?: 'metal' | 'ember' | 'verdigris'
    /** Row fills the width of a column. Tile is a fixed width portrait for a rail. Face centres the words and the stat column with no medallion. */
    layout?: 'row' | 'tile' | 'face'
    /** Heavy rings the card in the full gilt rim and lights its keyline, the mark of the reader's own. */
    frame?: 'thin' | 'heavy'
    /** Colours the tile's border with the player's own colour at a campaign table. */
    rim?: 'ember' | 'verdigris' | 'metal' | 'good'
    /** The player who holds the character, drawn as a small shield on the tile's top left corner. */
    holder?: { name: string; image?: string }
    /** Marks the card as the one being read. */
    on?: boolean
    /** Runs when the card is pressed. */
    onclick?: (event: MouseEvent) => void
    /** The stat row written under the sub line. */
    children?: Snippet
  } = $props()

  const initial = $derived(title.charAt(0).toUpperCase())
</script>

<button
  type="button"
  class="dnd-card dnd-card-{tone} dnd-card-{layout} dnd-card-{frame}"
  class:dnd-card-on={on}
  class:dnd-card-rimmed={layout === 'tile' && Boolean(rim)}
  class:dnd-card-rim-ember={layout === 'tile' && rim === 'ember'}
  class:dnd-card-rim-verdigris={layout === 'tile' && rim === 'verdigris'}
  class:dnd-card-rim-metal={layout === 'tile' && rim === 'metal'}
  class:dnd-card-rim-good={layout === 'tile' && rim === 'good'}
  class:dnd-card-held={layout === 'tile' && Boolean(holder)}
  aria-current={on ? 'page' : undefined}
  {onclick}
>
  {#if layout === 'tile'}
    <span class="dnd-card-finial"><Ornament name="finial" size="xs" tone="metal" /></span>
  {/if}

  {#if layout !== 'face'}
    <span class="dnd-card-medallion">
      {#if image}
        <span class="dnd-card-portrait"><StoredImage src={image} alt="" /></span>
      {:else}
        <span class="dnd-card-initial">{initial}</span>
      {/if}
      <span class="dnd-card-rim"></span>
    </span>
  {/if}

  <span class="dnd-card-body">
    <span class="dnd-card-title">{title}</span>
    {#if sub}<span class="dnd-card-sub">{sub}</span>{/if}
    {#if children}<span class="dnd-card-stats">{@render children()}</span>{/if}
  </span>

  {#if badge}
    <span class="dnd-card-badge">{badge}</span>
  {/if}

  {#if layout === 'tile' && holder}
    <span class="dnd-card-holder" title={holder.name}>
      {#if holder.image}
        <StoredImage src={holder.image} alt="" />
      {:else}
        <span class="dnd-card-holder-initial">{holder.name.charAt(0).toUpperCase()}</span>
      {/if}
    </span>
  {/if}
</button>

<style>
  .dnd-card {
    position: relative;
    display: flex;
    width: 100%;
    text-align: start;
    cursor: pointer;
    --card-light: var(--metal);
    --card-keyline: var(--space-1);
    background:
      var(--rivets),
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--card-light) 7%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-md);
    box-shadow: var(--rim-thin), inset 0 0 18px 2px var(--shade-hard), var(--shadow-sm);
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .dnd-card-heavy {
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-sm), 0 0 10px color-mix(in srgb, var(--card-light) 35%, transparent);
  }

  .dnd-card.dnd-card-heavy::after {
    border-color: var(--card-light);
  }

  .dnd-card-on {
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-sm), 0 0 14px var(--ember-glow);
  }

  .dnd-card::after {
    content: '';
    position: absolute;
    inset: var(--card-keyline);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 70%, transparent);
    border-radius: var(--radius-sm);
    opacity: 0.6;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .dnd-card:hover::after {
    opacity: 0.9;
  }

  .dnd-card-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: 'medallion body';
    align-items: center;
    column-gap: var(--space-4);
    padding: var(--space-4);
    background:
      var(--rivets),
      radial-gradient(ellipse 50% 100% at 0% 50%, color-mix(in srgb, var(--card-light) 10%, transparent) 0%, transparent 70%),
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--card-light) 6%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
  }

  .dnd-card-tile {
    flex-direction: column;
    gap: var(--space-3);
    width: 11.4rem;
    padding: var(--space-3);
    --card-rim: var(--metal-dim);
  }

  .dnd-card-rim-ember {
    --card-rim: var(--ember);
  }

  .dnd-card-rim-verdigris {
    --card-rim: var(--verdigris);
  }

  .dnd-card-rim-metal {
    --card-rim: var(--metal);
  }

  .dnd-card-rim-good {
    --card-rim: var(--state-good);
  }

  .dnd-card-rimmed {
    box-shadow: 0 0 0 var(--border-hair) var(--keyline), 0 0 0 calc(var(--border-hair) * 3) var(--card-rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-sm), 0 0 12px color-mix(in srgb, var(--card-rim) 35%, transparent);
  }

  .dnd-card-rimmed::after {
    border-color: color-mix(in srgb, var(--card-rim) 70%, transparent);
    opacity: 0.9;
  }

  .dnd-card-holder {
    --holder-rim: calc(var(--border-hair) * 2);
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: calc(var(--space-6) + var(--space-1));
    aspect-ratio: 100 / 120;
    padding: var(--holder-rim);
    background: linear-gradient(180deg, color-mix(in srgb, var(--card-rim) 80%, var(--metal-bright)) 0%, var(--card-rim) 60%, color-mix(in srgb, var(--card-rim) 70%, var(--keyline)) 100%);
    -webkit-mask: var(--mask-shield) center / 100% 100% no-repeat;
    mask: var(--mask-shield) center / 100% 100% no-repeat;
    filter: drop-shadow(0 var(--space-0) var(--space-1) var(--shade-hard));
    color: var(--card-rim);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .dnd-card-holder::before {
    content: '';
    position: absolute;
    inset: var(--holder-rim);
    background: radial-gradient(circle at 50% 35%, var(--ground-lift) 0%, var(--ground-deep) 85%);
    -webkit-mask: var(--mask-shield) center / 100% 100% no-repeat;
    mask: var(--mask-shield) center / 100% 100% no-repeat;
  }

  .dnd-card-holder :global(img) {
    position: relative;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    -webkit-mask: var(--mask-shield) center / 100% 100% no-repeat;
    mask: var(--mask-shield) center / 100% 100% no-repeat;
  }

  .dnd-card-holder-initial {
    position: relative;
  }

  .dnd-card-face {
    flex-direction: column;
    padding: var(--space-5) var(--space-4);
    text-align: center;
  }

  .dnd-card-face .dnd-card-body {
    align-items: center;
    gap: var(--space-1);
  }

  .dnd-card-face .dnd-card-title {
    font-size: var(--text-xl);
    max-width: 100%;
  }

  .dnd-card-face .dnd-card-stats {
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .dnd-card-ember {
    --card-light: var(--ember);
  }

  .dnd-card-verdigris {
    --card-light: var(--verdigris);
  }

  .dnd-card:hover {
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-md), 0 0 16px color-mix(in srgb, var(--card-light) 40%, transparent);
    filter: brightness(1.06);
  }

  .dnd-card:active {
    filter: brightness(0.88);
  }

  .dnd-card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-card-medallion {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
  }

  .dnd-card-row .dnd-card-medallion {
    grid-area: medallion;
    align-self: center;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: var(--radius-pill);
    box-shadow: 0 0 0 var(--space-0) var(--keyline), 0 0 18px color-mix(in srgb, var(--card-light) 32%, transparent), var(--shadow-sm);
  }

  .dnd-card-tile .dnd-card-medallion {
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 0;
    -webkit-mask-image: var(--mask-arch);
    mask-image: var(--mask-arch);
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }

  .dnd-card-portrait {
    display: block;
    width: 100%;
    height: 100%;
  }

  .dnd-card-portrait :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-card-initial {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--card-light);
    text-shadow: 0 0 10px var(--card-light);
  }

  .dnd-card-row .dnd-card-initial {
    font-size: var(--text-2xl);
  }

  .dnd-card-tile .dnd-card-initial {
    font-size: var(--text-3xl);
  }

  .dnd-card-tile .dnd-card-body {
    flex: 1;
  }

  .dnd-card-tile .dnd-card-sub {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
  }

  .dnd-card-tile .dnd-card-stats {
    flex: 1;
    align-content: stretch;
  }

  .dnd-card-rim {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-dim),
      inset 0 0 0 3px var(--metal),
      inset 0 0 0 4px var(--metal-bright),
      inset 0 0 0 5px var(--keyline),
      inset 0 0 14px var(--shade-hard);
    pointer-events: none;
  }

  .dnd-card-finial {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 1;
    transform: translate(-50%, -25%);
    filter: drop-shadow(0 1px 3px var(--shade-hard));
    pointer-events: none;
  }

  .dnd-card-tile .dnd-card-medallion::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, var(--ground-deep) 100%);
    opacity: 0.85;
    pointer-events: none;
  }

  .dnd-card-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .dnd-card-row .dnd-card-body {
    grid-area: body;
    gap: var(--space-1);
  }

  .dnd-card-title {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--metal-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-card-row .dnd-card-title {
    display: block;
    max-block-size: calc(2 * 1.2em);
    font-size: var(--text-md);
    font-weight: 700;
    line-height: 1.2;
    text-shadow: 0 1px 0 var(--keyline), 0 0 0.5rem color-mix(in srgb, var(--card-light) 35%, transparent);
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .dnd-card-row:has(.dnd-card-badge) .dnd-card-title::before {
    content: '';
    float: inline-end;
    inline-size: calc(var(--space-7) + var(--space-3));
    block-size: 1lh;
  }

  .dnd-card-sub {
    font-size: var(--text-xs);
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-card-row .dnd-card-sub {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font-size: var(--text-sm);
    line-height: 1.35;
    white-space: normal;
  }

  .dnd-card-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-1);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-card-row .dnd-card-stats {
    position: relative;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-0);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
    background: linear-gradient(90deg, var(--metal) 0%, color-mix(in srgb, var(--metal-dim) 85%, transparent) 55%, transparent 100%) 0 0 / 100% var(--border-hair) no-repeat;
  }

  .dnd-card-row .dnd-card-stats::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    inline-size: var(--space-2);
    block-size: var(--space-2);
    transform: translate(-50%, -50%) rotate(45deg);
    background:
      linear-gradient(135deg, var(--metal-bright), var(--metal) 50%, var(--metal-dim)) center / 45% 45% no-repeat,
      var(--ground-deep);
    border: var(--border-hair) solid var(--metal);
    box-shadow: var(--glow-metal);
    pointer-events: none;
  }

  .dnd-card-badge {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    z-index: 2;
    padding: 1px var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-pill);
    background: var(--ground-deep);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .dnd-card-row .dnd-card-badge {
    top: var(--space-3);
    right: var(--space-3);
    padding: var(--space-0) var(--space-2);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--card-light);
    border-color: color-mix(in srgb, var(--card-light) 55%, var(--metal-dim));
    box-shadow: inset 0 0 0 var(--border-hair) var(--keyline), 0 0 10px color-mix(in srgb, var(--card-light) 28%, transparent);
    text-shadow: 0 0 6px color-mix(in srgb, var(--card-light) 60%, transparent);
  }
</style>
