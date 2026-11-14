<script lang="ts">
  import BaseDialog from './BaseDialog.svelte';
  import Ornament from '$components/ui/Ornament.svelte';
  import Portrait, { PORTRAIT_FRAMES, type PortraitFrame } from '$components/ui/Portrait.svelte';

  let {
    isOpen = $bindable(false),
    frame = $bindable(),
    src,
    alt
  }: {
    /** Whether the dialog is showing. */
    isOpen: boolean;
    /** The frame the portrait is traced in. */
    frame?: string;
    /** The picture to preview in every frame. */
    src?: string;
    /** Alternative text for the picture. */
    alt: string;
  } = $props();

  const taken = $derived((frame as PortraitFrame) ?? 'lancet');
</script>

<BaseDialog bind:isOpen title="Choose Your Frame" width="600px" zIndex={9999}>
  <div class="content">
    <div class="crest">
      <Ornament name="crest" size="md" tone="metal" />
    </div>

    <p class="description">Select the surround your portrait is traced in</p>

    <div class="traces">
      {#each PORTRAIT_FRAMES as choice (choice.id)}
        <button
          type="button"
          class="trace"
          class:trace-lit={taken === choice.id}
          aria-pressed={taken === choice.id}
          onclick={() => (frame = choice.id)}
        >
          <Portrait {src} {alt} frame={choice.id} size="sm" />
          <span class="trace-name">{choice.title}</span>

          {#if taken === choice.id}
            <span class="trace-mark">
              <Ornament name="quatrefoil" size="xs" tone="ember" />
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</BaseDialog>

<style>
  .content {
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .crest {
    display: flex;
    justify-content: center;
    opacity: 0.9;
  }

  .description {
    margin: var(--space-2) 0 var(--space-5);
    text-align: center;
    color: var(--ink-dim);
    font-style: italic;
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
  }

  .traces {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(7.5rem, 100%), 1fr));
    gap: var(--space-4);
  }

  .trace {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-3) var(--space-3);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-sm);
    color: var(--ink);
    cursor: pointer;
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .trace:hover {
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-bright),
      inset 0 0 0 3px var(--keyline),
      inset 0 0 16px 2px var(--shade-hard),
      var(--shadow-md);
  }

  .trace:hover .trace-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .trace:active {
    filter: brightness(0.85);
  }

  .trace:focus-visible {
    outline: none;
    box-shadow: var(--rim-thin), var(--focus-ring);
  }

  .trace-lit {
    background:
      radial-gradient(ellipse 80% 60% at 50% 100%, var(--ember-glow) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim), inset 0 0 24px -6px var(--ember-glow), var(--glow-metal);
  }

  .trace-name {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    transition: color 0.18s ease, text-shadow 0.18s ease;
  }

  .trace-lit .trace-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .trace-mark {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    display: flex;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .content {
      padding: var(--space-4);
    }
  }
</style>
