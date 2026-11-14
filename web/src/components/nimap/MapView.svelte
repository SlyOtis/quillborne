<script lang="ts">
  import { untrack } from 'svelte'
  import type { Level } from '$lib/nimap'
  import { buildLevel, createRenderSession, disposeObject, highlightGroup, levelOptionsOf, pickFeature, type LevelObject, type MapLook, type Picked, type RenderSession } from '$lib/nimap/render'
  import { styleOfViewProps } from '$lib/nimap-editor/view-props'

  const {
    level,
    look,
    fixtures = true,
    openings = true,
    wallHeight,
    exteriorWallHeight,
    backdrop = 'flat',
    pickable = [],
    selected = [],
    onpick
  }: {
    /** The level drawn. */
    level: Level
    /** The colours and light the level is drawn in. */
    look?: Partial<MapLook>
    /** Whether the furniture is drawn. */
    fixtures?: boolean
    /** Whether doors and windows are cut out of the walls. */
    openings?: boolean
    /** Metres where the walls are cut. */
    wallHeight?: number
    /** Metres where the walls on the outline are cut. */
    exteriorWallHeight?: number
    /** The ground behind the map: flat, or a soft spotlight. */
    backdrop?: 'flat' | 'spot'
    /** Which things a click picks; none turns the view only. */
    pickable?: Picked['kind'][]
    /** What is selected, marked on the map. */
    selected?: Picked[]
    /** Runs with what a click picked, null on nothing. */
    onpick?: (picked: Picked | null) => void
  } = $props()

  const CLICK_PX = 4
  const MARGIN = 0.025

  let host = $state<HTMLDivElement>()
  let hostWidth = $state(0)
  let hostHeight = $state(0)
  let canvas = $state<HTMLCanvasElement>()
  let session = $state.raw<RenderSession | null>(null)
  let built = $state.raw<LevelObject | null>(null)
  let hovered = $state.raw<Picked | null>(null)
  let framedFor = ''
  let marks: ReturnType<typeof highlightGroup> | null = null
  let pressedAt: [number, number] | null = null
  let hoverFrame = 0

  const style = $derived(styleOfViewProps({ look, fixtures, openings, wallHeight, exteriorWallHeight }))

  const outlineKey = (object: LevelObject) => {
    if (!object.outline.length) return ''
    const xs = object.outline.map(p => p[0])
    const zs = object.outline.map(p => p[2])
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map(v => v.toFixed(2)).join()
  }

  export function fit() {
    const on = session
    const object = built
    const el = host
    if (!on || !object || !el) return
    const edge = Math.max(el.clientWidth, el.clientHeight) * MARGIN
    on.fit(object.bounds, 1.02, { left: edge, right: edge, top: edge, bottom: edge }, object.outline)
  }

  const pickAt = (e: PointerEvent): Picked | null => {
    if (!session || !canvas) return null
    const r = canvas.getBoundingClientRect()
    return pickFeature(level, session.rayAt(e.clientX - r.left, e.clientY - r.top), pickable)
  }

  const onPress = (e: PointerEvent) => {
    pressedAt = pickable.length ? [e.clientX, e.clientY] : null
  }

  const onRelease = (e: PointerEvent) => {
    if (!pressedAt) return
    const moved = Math.hypot(e.clientX - pressedAt[0], e.clientY - pressedAt[1])
    pressedAt = null
    if (moved <= CLICK_PX) onpick?.(pickAt(e))
  }

  const onMove = (e: PointerEvent) => {
    if (!pickable.length || e.buttons) return
    cancelAnimationFrame(hoverFrame)
    hoverFrame = requestAnimationFrame(() => {
      const next = pickAt(e)
      if (next?.id === hovered?.id && next?.kind === hovered?.kind) return
      hovered = next
    })
  }

  const onLeave = () => {
    cancelAnimationFrame(hoverFrame)
    hovered = null
  }

  $effect(() => {
    const el = host
    const surface = canvas
    if (!el || !surface) return
    const made = untrack(() => createRenderSession(surface, { shadows: true, clear: true, lights: style.lights, view: style.camera }))
    made.resize(el.clientWidth, el.clientHeight)
    session = made
    return () => {
      cancelAnimationFrame(hoverFrame)
      untrack(() => built)?.dispose()
      built = null
      marks = null
      framedFor = ''
      made.dispose()
      session = null
    }
  })

  $effect(() => {
    const on = session
    const w = hostWidth
    const h = hostHeight
    if (!on || !w || !h) return
    on.resize(w, h)
    untrack(fit)
  })

  $effect(() => {
    const on = session
    if (on) on.setLights(style.lights)
  })

  $effect(() => {
    const on = session
    const shown = level
    const options = levelOptionsOf(style)
    if (!on) return
    let next: LevelObject
    try {
      next = buildLevel(shown, options)
    } catch (error) {
      console.warn('Map level could not be built:', error)
      return
    }
    untrack(() => {
      if (built) {
        on.remove(built.group)
        built.dispose()
      }
      marks = null
      on.add(next.group)
      built = next
      const outline = outlineKey(next)
      if (outline !== framedFor) {
        framedFor = outline
        fit()
      }
    })
  })

  $effect(() => {
    const on = session
    const object = built
    const wanted = [...selected.map(picked => ({ picked, style: 'selected' as const })), ...(hovered ? [{ picked: hovered, style: 'hover' as const }] : [])]
    if (!on || !object) return
    untrack(() => {
      if (marks) {
        object.group.remove(marks)
        disposeObject(marks)
        marks = null
      }
      if (wanted.length) {
        marks = highlightGroup(level, wanted)
        object.group.add(marks)
      }
      on.invalidate()
    })
  })
</script>

<div bind:this={host} bind:clientWidth={hostWidth} bind:clientHeight={hostHeight} class="dnd-map-view dnd-map-view-{backdrop}" class:dnd-map-view-hover={!!hovered}>
  <canvas bind:this={canvas} onpointerdown={onPress} onpointerup={onRelease} onpointermove={onMove} onpointerleave={onLeave}></canvas>
</div>

<style>
  .dnd-map-view {
    position: relative;
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .dnd-map-view-flat {
    background: var(--ground);
  }

  .dnd-map-view-spot {
    background: radial-gradient(ellipse at 48% 42%, var(--ground-raised), var(--ground) 85%);
  }

  .dnd-map-view canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .dnd-map-view-hover canvas {
    cursor: pointer;
  }
</style>
