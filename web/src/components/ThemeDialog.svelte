<script lang="ts">
  import { onMount } from 'svelte';
  import BaseDialog from './BaseDialog.svelte';
  import Ornament from '$components/ui/Ornament.svelte';
  import { availableThemes, getTheme, setTheme } from '$lib/dialogs/theme';

  let { isOpen = $bindable(false) } = $props();

  let currentTheme = $state(getTheme());

  const themes = availableThemes;

  onMount(() => {
    applyTheme(getTheme());
  });

  function applyTheme(themeId: string) {
    setTheme(themeId);
    currentTheme = getTheme();
  }
</script>

<BaseDialog bind:isOpen title="Choose Your Realm" width="600px" zIndex={9999}>
  <div class="content">
    <div class="crest">
      <Ornament name="crest" size="md" tone="metal" />
    </div>

    <p class="description">Select a mystical theme for your character sheet</p>

    <div class="realms">
      {#each themes as theme}
        <button
          type="button"
          class="realm"
          class:realm-lit={currentTheme === theme.id}
          aria-pressed={currentTheme === theme.id}
          onclick={() => applyTheme(theme.id)}
        >
          <span class="realm-cusp">
            <Ornament name="cusp" size="xs" tone="metal" />
          </span>

          <span class="realm-glass">
            {#each theme.colors as color}
              <span class="realm-hue" style="background-color: {color}"></span>
            {/each}
          </span>

          <span class="realm-name">{theme.name}</span>
          <span class="realm-note">{theme.description}</span>

          {#if currentTheme === theme.id}
            <span class="realm-mark">
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

  .realms {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(15.5rem, 100%), 1fr));
    gap: var(--space-4);
  }

  .realm {
    --realm-light: transparent;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-4) var(--space-4);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-sm);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .realm::before {
    content: '';
    position: absolute;
    inset: var(--space-2);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
    border-radius: var(--radius-md);
    pointer-events: none;
  }

  .realm:hover {
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-bright),
      inset 0 0 0 3px var(--keyline),
      inset 0 0 16px 2px var(--shade-hard),
      var(--shadow-md);
  }

  .realm:hover .realm-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .realm:active {
    filter: brightness(0.85);
  }

  .realm:focus-visible {
    outline: none;
    box-shadow: var(--rim-thin), var(--focus-ring);
  }

  .realm-lit {
    --realm-light: var(--ember-glow);
    background:
      radial-gradient(ellipse 80% 60% at 50% 100%, var(--ember-glow) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim), inset 0 0 26px -8px var(--realm-light), var(--glow-metal);
  }

  .realm-cusp {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0.7;
    pointer-events: none;
  }

  .realm-glass {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    margin-bottom: var(--space-2);
  }

  .realm-hue {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: var(--radius-pill);
    border: none;
    box-shadow: var(--rim-thin), inset 0 -6px 10px -6px var(--shade-hard), 0 0 10px -2px var(--realm-light);
  }

  .realm-name {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    transition: color 0.18s ease, text-shadow 0.18s ease;
  }

  .realm-lit .realm-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .realm-note {
    color: var(--ink-dim);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .realm-mark {
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

    .realms {
      grid-template-columns: 1fr;
    }
  }
</style>
