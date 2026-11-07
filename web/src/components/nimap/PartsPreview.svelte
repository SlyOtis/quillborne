<script lang="ts">
  import { untrack } from 'svelte'
  import { Box3, type Group } from 'three'
  import { boxPart, partsExtent, transformParts, translation, type Part } from '$lib/nimap'
  import { createMaterials, createRenderSession, disposeMaterials, disposeObject, partsObject, pieceLightsOf, type RenderSession } from '$lib/nimap/render'
  import { getLook } from '$lib/nimap-editor/look'

  const {
    parts,
    frame
  }: {
    /** The piece to show, as parts in level space. */
    parts: Part[]
    /** Which things the piece is; a new value frames the view afresh. */
    frame: string
  } = $props()

  const REFRAME = 1.25
  const FLOOR_MARGIN = 0.35

  let host = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let session = $state.raw<RenderSession | null>(null)
  let materials: ReturnType<typeof createMaterials> | null = null
  let object: Group | null = null
  let framed: [number, number, number] | null = null
  let framedFor = ''

  const staged = (ps: Part[]): Part[] => {
    const { min, max } = partsExtent(ps)
    const floor = boxPart([max[0] - min[0] + 2 * FLOOR_MARGIN, max[1] - min[1] + 2 * FLOOR_MARGIN, 0.03], 'slab', [0, 0, -0.03])
    return [floor, ...transformParts(ps, translation(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2))]
  }

  const build = (on: RenderSession, ps: Part[], reframe: boolean) => {
    if (!materials) return
    if (object) {
      on.remove(object)
      disposeObject(object)
    }
    object = partsObject(staged(ps), materials)
    on.add(object)
    const box = new Box3().setFromObject(object)
    const size: [number, number, number] = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
    const was = framed
    const resized = !was || size.some((d, i) => Math.max(d, 1e-3) / Math.max(was[i], 1e-3) > REFRAME || Math.max(was[i], 1e-3) / Math.max(d, 1e-3) > REFRAME)
    if (reframe || resized) {
      on.fit(box, 1.25)
      framed = size
    } else on.invalidate(true)
  }

  $effect(() => {
    const el = host
    const surface = canvas
    if (!el || !surface) return
    const look = getLook()
    materials = createMaterials(look)
    const made = createRenderSession(surface, { shadows: true, clear: true, lights: pieceLightsOf(look.pieceLight) })
    const observer = new ResizeObserver(() => made.resize(el.clientWidth, el.clientHeight))
    observer.observe(el)
    made.resize(el.clientWidth, el.clientHeight)
    session = made
    return () => {
      observer.disconnect()
      if (object) disposeObject(object)
      object = null
      framed = null
      framedFor = ''
      if (materials) disposeMaterials(materials)
      materials = null
      made.dispose()
      session = null
    }
  })

  $effect(() => {
    const on = session
    const ps = parts
    const key = frame
    if (!on) return
    untrack(() => {
      build(on, ps, key !== framedFor)
      framedFor = key
    })
  })
</script>

<div bind:this={host} class="dnd-parts-preview">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .dnd-parts-preview {
    position: relative;
    aspect-ratio: 4 / 3;
    width: 100%;
    overflow: hidden;
    background: radial-gradient(ellipse at 48% 42%, var(--ground-raised), var(--ground) 85%);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-md);
  }

  .dnd-parts-preview canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
