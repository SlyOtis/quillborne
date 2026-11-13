<script lang="ts">
  import { getContext, type Snippet } from 'svelte';
  import Ornament from '$components/ui/Ornament.svelte';
  import Sigil from '$components/ui/Sigil.svelte'
  import Glyph from '$components/ui/Glyph.svelte';

  let {
    isOpen = $bindable(false),
    onClose,
    title = '',
    width = '600px',
    maxWidth = '90vw',
    maxHeight = '80vh',
    showCloseButton = true,
    backdrop = true,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    place = 'center',
    zIndex = 1000,
    children
  }: {
    isOpen: boolean;
    onClose?: () => void;
    title?: string;
    width?: string;
    maxWidth?: string;
    maxHeight?: string;
    showCloseButton?: boolean;
    backdrop?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    place?: 'center' | 'top';
    zIndex?: number;
    children?: Snippet;
  } = $props();

  let dialogElement = $state<HTMLDivElement>();

  const dialogContext = getContext('dialogState') as {
    setDialogState: (isOpen: boolean) => void;
  } | undefined;

  function closeDialog() {
    if (onClose) {
      onClose();
    } else {
      isOpen = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      closeDialog();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    }
  }

  $effect(() => {
    if (dialogContext) {
      dialogContext.setDialogState(isOpen);
    }
  });

  $effect(() => {
    if (isOpen && dialogElement) {
      dialogElement.focus();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  {#if backdrop}
    <button
      type="button"
      class="backdrop"
      aria-label="Close dialog"
      onclick={handleBackdropClick}
      style="z-index: {zIndex};"
    ></button>
  {/if}

  <div
    bind:this={dialogElement}
    class="dialog"
    class:dialog-top={place === 'top'}
    style="width: {width}; max-width: {maxWidth}; max-height: {maxHeight}; z-index: {zIndex + 1};"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'dialog-title' : undefined}
  >
    <span class="dialog-crown">
      <Ornament name="tracery" size="sm" tone="metal" />
    </span>

    <span class="dialog-corner dialog-corner-head-start">
      <Ornament name="corner" size="sm" tone="metal" />
    </span>
    <span class="dialog-corner dialog-corner-head-end">
      <Ornament name="corner" size="sm" tone="metal" flip />
    </span>
    <span class="dialog-corner dialog-corner-foot-start">
      <Ornament name="cusp" size="xs" tone="metal" rotate={180} flip />
    </span>
    <span class="dialog-corner dialog-corner-foot-end">
      <Ornament name="cusp" size="xs" tone="metal" rotate={180} />
    </span>

    {#if title || showCloseButton}
      <div class="dialog-header">
        {#if title}
          <h2 id="dialog-title" class="dialog-title">{title}</h2>
        {/if}
        {#if showCloseButton}
          <Sigil title="Close dialog" tone="bane" size="sm" frame="cusped" onclick={closeDialog}>
            <Glyph name="close" size="sm" />
          </Sigil>
        {/if}
      </div>
      <span class="dialog-key">
        <Ornament name="divider" tone="metal" />
      </span>
    {/if}

    <div class="dialog-content dnd-scroll">
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    border: none;
    padding: 0;
    background:
      var(--texture-motes),
      radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--ember-glow) 22%, transparent) 0%, transparent 70%),
      radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--ground-deep) 55%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 92%, transparent) 100%);
    backdrop-filter: blur(4px) saturate(0.55) sepia(0.25);
    cursor: default;
    animation: dialog-veil 0.2s ease-out;
  }

  .dialog {
    --dialog-radius: var(--radius-xl);
    --dialog-rim-w: 0.375rem;
    --dialog-shift: -50%;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, var(--dialog-shift));
    display: flex;
    flex-direction: column;
    padding: var(--dialog-rim-w);
    background:
      var(--texture-noise),
      radial-gradient(ellipse 80% 50% at 50% 0%, color-mix(in srgb, var(--ember-glow) 18%, transparent) 0%, transparent 70%),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground) 55%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--dialog-radius);
    box-shadow:
      var(--rim),
      inset 0 0 22px 6px var(--shade-hard),
      var(--shadow-lg),
      0 0 0 1px var(--keyline);
    outline: none;
    animation: dialog-enter 0.22s ease-out;
  }

  .dialog-top {
    top: 10vh;
    --dialog-shift: 0%;
  }

  .dialog::before {
    content: '';
    position: absolute;
    inset: calc(var(--dialog-rim-w) + var(--space-1));
    z-index: 4;
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 55%, transparent);
    border-radius: var(--radius-lg);
    pointer-events: none;
  }

  .dialog-crown {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 5;
    display: flex;
    transform: translate(-50%, -58%);
    padding: var(--space-1);
    border-radius: var(--radius-pill);
    background:
      radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--stone-light) 40%, transparent) 0%, transparent 60%),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: var(--rim-thin), var(--bevel-up);
    pointer-events: none;
    filter: drop-shadow(0 2px 8px var(--shade-hard));
  }

  .dialog-corner {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px var(--shade-hard));
  }

  .dialog-corner-head-start {
    top: 0;
    left: 0;
  }

  .dialog-corner-head-end {
    top: 0;
    right: 0;
  }

  .dialog-corner-foot-start {
    bottom: 0;
    left: 0;
  }

  .dialog-corner-foot-end {
    bottom: 0;
    right: 0;
  }

  .dialog-header {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 22%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--ground-raised);
    border-bottom: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow:
      var(--bevel-up),
      inset 0 -1px 0 var(--keyline),
      0 1px 0 var(--metal-dim),
      0 2px 0 var(--metal),
      0 3px 0 var(--keyline),
      0 5px 10px var(--shade);
  }

  .dialog-title {
    margin: 0;
    padding-inline-start: var(--space-5);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 #000, 0 0 2px #000, 0 0 12px color-mix(in srgb, var(--ember-glow) 60%, transparent);
  }

  .dialog-key {
    position: relative;
    z-index: 3;
    display: block;
    width: min(14rem, 60%);
    margin: calc(var(--space-3) * -1) auto var(--space-1);
    opacity: 0.85;
    pointer-events: none;
  }

  .dialog-content {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  @keyframes dialog-veil {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes dialog-enter {
    from {
      opacity: 0;
      transform: translate(-50%, calc(var(--dialog-shift) + 2%)) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translate(-50%, var(--dialog-shift)) scale(1);
    }
  }
</style>
