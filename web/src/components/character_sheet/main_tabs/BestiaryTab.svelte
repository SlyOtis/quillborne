<script lang="ts">
  import Ornament from '$components/ui/Ornament.svelte'

  const SLOTS = ['skull', 'dragon', 'rune', 'tracery', 'quatrefoil', 'dragon', 'skull', 'quatrefoil', 'rune', 'tracery'] as const
</script>

<div class="root">
  <header class="head">
    <span class="crest dnd-arch"><Ornament name="dragon" size="md" tone="ember" /></span>
    <h4 class="dnd-heading title">Bestiary</h4>
    <p class="lede">Every creature this character faces is written here, page by page, as the campaign goes on.</p>
    <span class="rule"><Ornament name="divider" tone="metal" /></span>
  </header>

  <ul class="slots" aria-label="Unwritten pages">
    {#each SLOTS as mark, index (index)}
      <li class="slot">
        <span class="slot-face"><Ornament name={mark} size="sm" tone="metal" /></span>
        <span class="slot-word">Unwritten</span>
      </li>
    {/each}
  </ul>

  <p class="foot">No creature has crossed this character's path yet.</p>
</div>

<style>
  .root {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    min-width: 0;
    padding: var(--space-4) var(--space-3) var(--space-5);
  }

  .head {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    max-width: 36rem;
    text-align: center;
  }

  .crest {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--space-8) + var(--space-2));
    aspect-ratio: 4 / 5;
    padding: var(--space-2);
    background:
      radial-gradient(ellipse 80% 70% at 50% 30%, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    filter: drop-shadow(0 0.25rem 0.5rem var(--shade-hard));
  }

  .title {
    margin: 0;
    letter-spacing: var(--tracking-caps);
  }

  .lede {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .rule {
    display: block;
    width: min(16rem, 70%);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) + var(--space-5)), 100%), 1fr));
    gap: var(--space-3);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slot {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-2) var(--space-3);
    border-radius: 50% 50% var(--radius-md) var(--radius-md) / var(--radius-xl) var(--radius-xl) var(--radius-md) var(--radius-md);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--ground-raised) 60%, transparent), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 18px 2px var(--shade-hard);
  }

  .slot-face {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-7);
    aspect-ratio: 1;
    opacity: 0.28;
    filter: grayscale(0.6);
  }

  .slot-word {
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .foot {
    margin: 0;
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
