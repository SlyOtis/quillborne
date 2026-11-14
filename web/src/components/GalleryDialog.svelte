<script lang="ts">
  import { getContext } from 'svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'

  let {
    isOpen = $bindable(false),
    images,
    at = $bindable(0),
    main = '',
    alt,
    canWrite = false,
    onmain
  }: {
    /** Whether the gallery is showing. */
    isOpen: boolean
    /** Every picture, in the order they are shown. */
    images: string[]
    /** Which picture is on the stage. */
    at?: number
    /** The picture that stands for the whole. */
    main?: string
    /** Alternative text for every picture. */
    alt: string
    /** Whether the main picture may be changed. */
    canWrite?: boolean
    /** Runs with the address chosen as the main picture. */
    onmain?: (address: string) => void
  } = $props()

  const dialogContext = getContext('dialogState') as { setDialogState: (isOpen: boolean) => void } | undefined

  const SCALE_MIN = 1
  const SCALE_MAX = 6
  const SCALE_STEP = 1.25

  let scale = $state(1)
  let shift = $state({ x: 0, y: 0 })
  let dragging = $state(false)
  let grip = { x: 0, y: 0 }

  const shown = $derived(images[at] ?? '')
  const count = $derived(images.length)

  $effect(() => {
    dialogContext?.setDialogState(isOpen)
    return () => dialogContext?.setDialogState(false)
  })

  function close() {
    isOpen = false
  }

  function reset() {
    scale = 1
    shift = { x: 0, y: 0 }
  }

  function turn(step: number) {
    if (count === 0) return
    at = (at + step + count) % count
    reset()
  }

  function zoom(factor: number) {
    scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * factor))
    if (scale === SCALE_MIN) shift = { x: 0, y: 0 }
  }

  function onWheel(event: WheelEvent) {
    if (!(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    zoom(event.deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP)
  }

  function grab(event: PointerEvent) {
    if (scale === SCALE_MIN) return
    dragging = true
    grip = { x: event.clientX - shift.x, y: event.clientY - shift.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function haul(event: PointerEvent) {
    if (!dragging) return
    shift = { x: event.clientX - grip.x, y: event.clientY - grip.y }
  }

  function release() {
    dragging = false
  }

  function fall(event: MouseEvent) {
    if (event.target === event.currentTarget && scale === SCALE_MIN) close()
  }

  function step(event: KeyboardEvent) {
    if (!isOpen) return
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowRight') turn(1)
    else if (event.key === 'ArrowLeft') turn(-1)
    else if (event.key === '+' || event.key === '=') zoom(SCALE_STEP)
    else if (event.key === '-') zoom(1 / SCALE_STEP)
    else if (event.key === '0') reset()
  }
</script>

<svelte:window onkeydown={step} />

{#if isOpen}
  <div class="gallery" role="dialog" aria-modal="true" aria-label="Pictures">
    <div
      class="gallery-stage"
      class:gallery-stage-far={scale > SCALE_MIN}
      class:gallery-stage-hauling={dragging}
      role="presentation"
      onwheel={onWheel}
      onpointerdown={grab}
      onpointermove={haul}
      onpointerup={release}
      onpointercancel={release}
      onclick={fall}
    >
      {#if shown}
        <span class="gallery-glass" style:transform="translate({shift.x}px, {shift.y}px) scale({scale})">
          <StoredImage src={shown} {alt} />
        </span>
      {/if}
    </div>

    <span class="gallery-close">
      <IconBtn title="Close" onclick={close}>
        <Glyph name="close" size="md" />
      </IconBtn>
    </span>

    {#if count > 1}
      <span class="gallery-turn gallery-turn-back">
        <IconBtn title="Previous picture" onclick={() => turn(-1)}>
          <Glyph name="back" size="lg" />
        </IconBtn>
      </span>
      <span class="gallery-turn gallery-turn-forward">
        <IconBtn title="Next picture" onclick={() => turn(1)}>
          <Glyph name="forward" size="lg" />
        </IconBtn>
      </span>
    {/if}

    <div class="gallery-tools">
      <span class="gallery-count">{count > 0 ? `${at + 1} of ${count}` : 'No pictures'}</span>
      <IconBtn title="Zoom out" disabled={scale <= SCALE_MIN} onclick={() => zoom(1 / SCALE_STEP)}>
        <Glyph name="zoomout" size="md" />
      </IconBtn>
      <span class="gallery-scale">{Math.round(scale * 100)}%</span>
      <IconBtn title="Zoom in" disabled={scale >= SCALE_MAX} onclick={() => zoom(SCALE_STEP)}>
        <Glyph name="zoomin" size="md" />
      </IconBtn>
      <IconBtn title="Fit" disabled={scale === SCALE_MIN} onclick={reset}>
        <Glyph name="revert" size="md" />
      </IconBtn>
      {#if canWrite && shown}
        <IconBtn
          title={shown === main ? 'The main picture' : 'Make this the main picture'}
          tone="ember"
          active={shown === main}
          disabled={shown === main}
          onclick={() => onmain?.(shown)}
        >
          <Glyph name="picture" size="md" />
        </IconBtn>
      {/if}
    </div>

    {#if count > 1}
      <div class="gallery-strip">
        {#each images as address, index (address)}
          <button
            type="button"
            class="gallery-shot"
            class:gallery-shot-on={index === at}
            class:gallery-shot-main={address === main}
            title={address === main ? 'The main picture' : `Picture ${index + 1}`}
            aria-pressed={index === at}
            onclick={() => {
              at = index
              reset()
            }}
          >
            <StoredImage src={address} alt="" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .gallery {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    background:
      radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--ember-glow) 14%, transparent) 0%, transparent 70%),
      color-mix(in srgb, var(--ground-deep) 94%, transparent);
    backdrop-filter: blur(12px);
  }

  .gallery-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
  }

  .gallery-stage-far {
    cursor: grab;
  }

  .gallery-stage-hauling {
    cursor: grabbing;
  }

  .gallery-glass {
    display: block;
    max-width: 100%;
    max-height: 100%;
    transition: transform 0.12s ease-out;
    will-change: transform;
  }

  .gallery-stage-hauling .gallery-glass {
    transition: none;
  }

  .gallery-glass :global(img) {
    display: block;
    max-width: 100vw;
    max-height: 100vh;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }

  .gallery-close {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
  }

  .gallery-turn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .gallery-turn-back {
    left: var(--space-4);
  }

  .gallery-turn-forward {
    right: var(--space-4);
  }

  .gallery-tools {
    position: absolute;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-up), var(--shadow-md);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
  }

  .gallery-count,
  .gallery-scale {
    font-family: var(--font-figures);
    font-weight: 700;
    text-shadow: 0 1px 0 var(--shadow-ink);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .gallery-strip {
    --gallery-shot: var(--space-7);
    position: absolute;
    bottom: calc(var(--space-4) + var(--space-8));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: var(--space-2);
    max-width: calc(100vw - var(--space-8) * 2);
    padding: var(--space-2);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 12px 2px var(--shade-hard), var(--shadow-md);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
  }

  .gallery-shot {
    flex: none;
    width: var(--gallery-shot);
    height: var(--gallery-shot);
    padding: 0;
    overflow: hidden;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    scroll-snap-align: start;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease, border-color 0.15s ease;
  }

  .gallery-shot:hover,
  .gallery-shot-on {
    opacity: 1;
    border-color: var(--metal-bright);
    box-shadow: var(--glow-metal);
  }

  .gallery-shot-main {
    box-shadow: var(--shadow-hearth-soft), inset 0 0 0 1px var(--ember);
  }

  .gallery-shot :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
