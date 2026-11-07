<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { clipSegmentToBox, gripKey, itemFootprint, lineChords, offsetPolyline, openingGeometry, openingSymbolPath, polygonToPath, polylineToPath, ringToPath, surfacePlacements, type FixturePlan, type Guide, type Modifiers, type Vec2 } from '$lib/nimap'
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import { IS_MAC } from '$lib/nimap-editor/platform'
  import { CANVAS, GUIDES, SNAP_NODE } from '$lib/nimap-editor/look'

  const {
    editor
  }: {
    /** The editor the canvas draws and feeds every press, key and wheel to. */
    editor: Editor
  } = $props()

  let svgEl = $state<SVGSVGElement>()
  let worldEl = $state<SVGGElement>()
  let spaceHeld = $state(false)
  let panning = $state<{ x: number; y: number } | null>(null)
  let lastClient: { x: number; y: number; modifiers: Modifiers } | null = null

  const viewBoxValue = $derived(`${editor.viewBox.x} ${editor.viewBox.y} ${editor.viewBox.width} ${editor.viewBox.height}`)
  const px = (n: number) => n / editor.scale
  const lineWidth = $derived(px(1.5))
  const nodeRadius = $derived(px(4))

  const selection = $derived(editor.selection)
  const overlay = $derived(editor.overlay)
  const units = $derived(editor.svg.units)
  const wallsHidden = $derived(editor.layers.walls.hidden)
  const fixturesHidden = $derived(editor.layers.fixtures.hidden)
  const mutedWalls = $derived(editor.stage.layers.walls !== 'live')
  const mutedFixtures = $derived(editor.stage.layers.fixtures !== 'live')
  const fixtures = $derived(fixturesHidden ? [] : editor.svg.fixtures)
  const fixturePlans = $derived(fixturesHidden ? new Map<string, FixturePlan>() : editor.fixturePlans)
  const labels = $derived(units.filter(u => u.name && !u.hidden))
  const fixtureLabels = $derived(fixtures.filter(f => f.name))
  const openUnits = $derived(units.filter(u => u.ground === 'open'))
  const topItems = $derived.by(() => {
    if (fixturesHidden) return []
    const level = editor.working
    return level.fixtures.flatMap(f => (f.items?.length ? surfacePlacements(f, level.fixtureLines).map(p => ({ key: `${f.id}:${p.item.id}`, path: ringToPath(itemFootprint(p.kind, p.at, p.front), false) })) : []))
  })
  const fixtureLines = $derived(fixturesHidden ? [] : editor.svg.fixtureLines)
  const walls = $derived(wallsHidden ? [] : editor.svg.walls)
  const wallBoundary = $derived(wallsHidden ? '' : editor.svg.wallBoundary)
  const edgeIds = $derived(new Set(editor.level.walls.filter(w => w.width === 0).map(w => w.id)))
  const edges = $derived(wallsHidden ? [] : editor.svg.centerlines.filter(l => edgeIds.has(l.id)))
  const centerlines = $derived(wallsHidden || mutedWalls ? [] : editor.svg.centerlines.filter(l => isSelectedLine(l.id) || l.id === hoveredLineId))
  const gridLines = $derived.by(() => {
    const v = editor.viewport
    const step = v.maxX - v.minX > 40 ? 5 : 1
    const xs: number[] = []
    const ys: number[] = []
    for (let x = Math.ceil(v.minX / step) * step; x <= v.maxX; x += step) xs.push(x)
    for (let y = Math.ceil(v.minY / step) * step; y <= v.maxY; y += step) ys.push(y)
    return { xs, ys, v }
  })
  const openings = $derived(wallsHidden ? [] : editor.svg.openings)
  const openingPreviews = $derived(
    overlay.flatMap(item => {
      if (item.type !== 'opening') return []
      const g = openingGeometry(item.opening, editor.runs)
      return g ? [{ box: ringToPath(g.box, false), symbol: openingSymbolPath(g, false) }] : []
    })
  )
  const nodes = $derived(editor.graph.nodes.filter(n => (n.layer === 'walls' ? !wallsHidden && !mutedWalls : !fixturesHidden && !mutedFixtures)))
  const readouts = $derived(overlay.flatMap(o => (o.type === 'label' ? [o] : [])))
  const hover = $derived.by(() => {
    const item = overlay.find(o => o.type === 'hover')
    return item && item.type === 'hover' ? item.hit : null
  })
  const hoveredNode = $derived(hover?.kind === 'node' ? (nodes.find(n => n.id === hover.node.id) ?? null) : null)
  const hoveredLineId = $derived(hover?.kind === 'line' ? hover.lineId : null)
  const hoveredMiddle = $derived(hover?.kind === 'line' ? { point: hover.middle, layer: hover.layer, on: hover.part === 'middle' } : null)
  const hoveredFixtureId = $derived(hover?.kind === 'fixture' ? hover.fixtureId : null)
  const hoveredUnitId = $derived(hover?.kind === 'room' ? hover.unitId : null)
  const hoveredGrip = $derived(hover?.kind === 'grip' ? gripKey(hover.grip) : null)
  const grips = $derived(editor.frontToolId === 'select' ? editor.grips : [])
  const edgeGrips = $derived(grips.flatMap(g => (g.kind === 'track' ? [{ key: gripKey(g), on: g.on, path: polylineToPath(g.points, false) }] : [])))
  const trackCorners = $derived(grips.length ? [...fixturePlans].filter(([id]) => selection.fixtureIds.has(id)).flatMap(([id, plan]) => plan.track.corners.map((c, i) => ({ key: `${id}:${i}`, path: polylineToPath(c, false) }))) : [])
  const chairGrips = $derived(grips.flatMap(g => (g.kind === 'chair' || g.kind === 'item' ? [{ key: gripKey(g), path: ringToPath(g.outline, false) }] : [])))
  const addGrips = $derived(grips.flatMap(g => (g.kind === 'add' || g.kind === 'supportAdd' ? [{ key: gripKey(g), point: g.point }] : [])))
  const stretchGrips = $derived(grips.flatMap(g => (g.kind === 'support' && g.outline ? [{ key: gripKey(g), path: polygonToPath(g.outline, false) }] : [])))
  const pointGrips = $derived(grips.flatMap(g => (g.kind === 'support' || g.kind === 'pedestal' || g.kind === 'supportEnd' ? [{ key: gripKey(g), point: g.point }] : [])))
  const supportEnds = $derived(grips.flatMap(g => (g.kind === 'supportEnd' ? [{ key: gripKey(g), point: g.point }] : [])))
  const barDots = $derived(grips.flatMap(g => (g.kind === 'support' && g.outline ? [{ key: gripKey(g), point: g.point }] : [])))
  const supportTracks = $derived(grips.flatMap(g => (g.kind === 'supportTrack' ? [{ key: gripKey(g), path: polylineToPath(g.points, false) }] : [])))
  const hoveredOpening = $derived(hover?.kind === 'opening' ? { id: hover.opening.id, part: hover.part } : null)
  const hoveredJamb = $derived(hover?.kind === 'opening' && hover.part === 'jamb' ? (hover.jambLine ?? null) : null)
  const hoveredFace = $derived.by(() => {
    const h = hover
    if (h?.kind !== 'line' || h.part !== 'face' || !selection.lineIds.has(h.lineId)) return null
    const wall = editor.working.walls.find(w => w.id === h.lineId)
    return wall ? polylineToPath(offsetPolyline(lineChords(wall), (h.side * wall.width) / 2), false) : null
  })
  const pointer = $derived(editor.inputs.point)
  const guides = $derived.by<Guide[]>(() => {
    const box = editor.viewport
    const out: Guide[] = []
    for (const item of overlay) {
      if (item.type !== 'guide') continue
      if (item.guide.type === 'path') {
        out.push(item.guide)
        continue
      }
      const clipped = clipSegmentToBox(item.guide.from, item.guide.to, box)
      if (clipped) out.push({ ...item.guide, from: clipped[0], to: clipped[1] })
    }
    return out
  })
  const reference = $derived(editor.reference)
  const calibration = $derived(editor.calibration)
  const calibrationPairs = $derived([0, 2].filter(i => calibration.points.length >= i + 2))
  const fontSize = $derived(px(12))
  const guideDash = $derived(`${px(5)} ${px(4)}`)
  const cursorStyle = $derived(panning ? editor.cursorFor('grabbing') : spaceHeld ? editor.cursorFor('grab') : editor.cursor)

  const isSelectedLine = (id: string) => selection.lineIds.has(id)

  const wallFill = (wall: { owner: string; members: string[] }) =>
    mutedWalls
      ? CANVAS.wall
      : wall.members.some(m => isSelectedLine(m))
        ? CANVAS.wallSelected
        : wall.members.includes(hoveredLineId ?? '')
          ? CANVAS.wallHover
          : wall.owner.startsWith('j') && new Set(wall.members).size > 1
            ? CANVAS.junction
            : CANVAS.wall

  const edgeStroke = (id: string) => (mutedWalls ? CANVAS.edge : isSelectedLine(id) ? CANVAS.selected : id === hoveredLineId ? CANVAS.hover : CANVAS.edge)

  const unitFill = (unit: { id: string; hidden: boolean; ground?: string }) =>
    selection.unitIds.has(unit.id) ? CANVAS.unitSelected : unit.hidden ? CANVAS.unitHidden : unit.ground === 'inside' ? CANVAS.unit : 'none'

  const unitOpacity = (unit: { id: string; hidden: boolean; name: string }) =>
    selection.unitIds.has(unit.id) ? 0.34 : unit.id === hoveredUnitId ? (unit.name ? 0.26 : 0.17) : unit.hidden ? 0.5 : unit.name ? 0.16 : 0.07

  const openingStroke = (id: string) => (selection.openingIds.has(id) ? CANVAS.openingSelected : id === hoveredOpening?.id ? CANVAS.hover : CANVAS.opening)

  const fixtureStroke = (id: string) => (selection.fixtureIds.has(id) ? CANVAS.fixtureSelected : id === hoveredFixtureId ? CANVAS.hover : CANVAS.fixtureStroke)

  const lineStroke = (id: string) => (isSelectedLine(id) ? CANVAS.fixtureSelected : id === hoveredLineId ? CANVAS.hover : CANVAS.fixtureStroke)

  const supportShapes = (plan: FixturePlan): { dot: Vec2 | null; path: string | null }[] => {
    if (plan.supportTrack) return plan.supportTrack.supports.map(s => (s.outline ? { dot: null, path: polygonToPath(s.outline, false) } : { dot: s.line[0], path: null }))
    if (plan.pedestals) return plan.pedestals.pedestals.map(p => ({ dot: null, path: ringToPath(p.outline, false) }))
    return plan.supports.map(s => ({ dot: null, path: ringToPath(s.outline, false) }))
  }

  const crosses = (points: Vec2[]) => {
    const arm = px(1.7)
    return points.map(([x, y]) => `M${x - arm},${y - arm}L${x + arm},${y + arm}M${x - arm},${y + arm}L${x + arm},${y - arm}`).join('')
  }

  const onPoint = (snapTypes: string[]) => snapTypes[0] === 'node' || snapTypes[0] === 'midpoint'

  const modifiers = (e: MouseEvent | KeyboardEvent): Modifiers => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, command: IS_MAC ? e.metaKey : e.ctrlKey })

  const clientToDocument = (x: number, y: number): Vec2 | null => {
    const ctm = worldEl?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  const replayPointer = () => {
    if (!lastClient) return
    const p = clientToDocument(lastClient.x, lastClient.y)
    if (p) editor.pointerMove(p, lastClient.modifiers)
  }

  const toDocument = (e: MouseEvent): Vec2 | null => {
    lastClient = { x: e.clientX, y: e.clientY, modifiers: modifiers(e) }
    return clientToDocument(e.clientX, e.clientY)
  }

  const toSvg = (e: MouseEvent): Vec2 | null => {
    const ctm = svgEl?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    svgEl?.focus()
    svgEl?.setPointerCapture(e.pointerId)
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      panning = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.button !== 0) return
    const p = toDocument(e)
    if (p) editor.pointerDown(p, modifiers(e))
  }

  const onPointerMove = (e: PointerEvent) => {
    if (panning) {
      editor.panBy(e.clientX - panning.x, e.clientY - panning.y)
      panning = { x: e.clientX, y: e.clientY }
      lastClient = { x: e.clientX, y: e.clientY, modifiers: modifiers(e) }
      tick().then(replayPointer)
      return
    }
    const p = toDocument(e)
    if (p) editor.pointerMove(p, modifiers(e))
  }

  const onPointerCancel = () => {
    panning = null
    editor.interrupt()
  }

  const onPointerLeave = () => {
    lastClient = null
    editor.pointerLeave()
  }

  const onPointerUp = (e: PointerEvent) => {
    if (panning) {
      panning = null
      return
    }
    if (e.button !== 0) return
    const p = toDocument(e)
    if (p) editor.pointerUp(p, modifiers(e))
  }

  const onDoubleClick = (e: MouseEvent) => {
    const p = toDocument(e)
    if (p) editor.doubleClick(p, modifiers(e))
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (e.altKey) {
      editor.wheelWidth(e.deltaY, e.shiftKey)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      const p = toSvg(e)
      if (p) editor.zoomAt(p, Math.exp(e.deltaY * 0.002))
    } else {
      editor.panBy(-e.deltaX, -e.deltaY)
    }
    lastClient = { x: e.clientX, y: e.clientY, modifiers: modifiers(e) }
    tick().then(replayPointer)
  }

  const MODIFIER_KEYS = new Set(['Shift', 'Alt', 'Control', 'Meta'])

  const isTyping = (e: KeyboardEvent) => {
    const el = e.composedPath()[0] as HTMLElement | undefined
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    if (e.code === 'Space') {
      spaceHeld = true
      e.preventDefault()
      return
    }
    if (MODIFIER_KEYS.has(e.key)) {
      if (lastClient) lastClient.modifiers = modifiers(e)
      editor.modifiersChanged(modifiers(e))
      return
    }
    if (editor.keyDown(e.key, { ...modifiers(e), meta: e.metaKey })) e.preventDefault()
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceHeld = false
    if (MODIFIER_KEYS.has(e.key)) {
      if (lastClient) lastClient.modifiers = modifiers(e)
      editor.modifiersChanged(modifiers(e))
    }
  }

  const onBlur = () => {
    spaceHeld = false
    if (lastClient) lastClient.modifiers = { shift: false, alt: false, ctrl: false }
    editor.modifiersChanged({ shift: false, alt: false, ctrl: false })
  }

  $effect(() => {
    const el = svgEl
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) editor.setViewportSize(r.width, r.height)
    })
    observer.observe(el)
    untrack(() => {
      editor.setViewportSize(el.clientWidth, el.clientHeight)
      editor.fitToContent()
    })
    return () => observer.disconnect()
  })
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} onblur={onBlur} />

<svg
  bind:this={svgEl}
  class="dnd-editor-canvas"
  viewBox={viewBoxValue}
  style:cursor={cursorStyle}
  style:background={CANVAS.background}
  tabindex="-1"
  role="application"
  aria-label="Floor plan"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  ondragstart={e => e.preventDefault()}
  ondblclick={onDoubleClick}
  onwheel={onWheel}
  onpointerleave={onPointerLeave}
  oncontextmenu={e => e.preventDefault()}
>
  {#if reference}
    <image
      href={reference.url}
      x={reference.origin?.[0] ?? 0}
      y={-(reference.origin?.[1] ?? 0)}
      width={reference.widthPx * reference.metresPerPixel}
      height={reference.heightPx * reference.metresPerPixel}
      opacity={reference.opacity}
      preserveAspectRatio="none"
    />
  {/if}

  <defs>
    <pattern id="dnd-editor-canvas-open" patternUnits="userSpaceOnUse" width={px(8)} height={px(8)} patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2={px(8)} style:stroke={CANVAS.open} stroke-opacity="0.45" stroke-width={px(1.5)} />
    </pattern>
  </defs>

  <g bind:this={worldEl} transform="scale(1,-1)">
    <g pointer-events="none">
      {#each gridLines.xs as x (x)}
        <line x1={x} y1={gridLines.v.minY} x2={x} y2={gridLines.v.maxY} style:stroke={CANVAS.grid} stroke-width={px(1)} />
      {/each}
      {#each gridLines.ys as y (y)}
        <line x1={gridLines.v.minX} y1={y} x2={gridLines.v.maxX} y2={y} style:stroke={CANVAS.grid} stroke-width={px(1)} />
      {/each}
    </g>

    <g>
      {#each units as unit (unit.id)}
        <path d={unit.path} fill-rule="evenodd" style:fill={unitFill(unit)} fill-opacity={unitOpacity(unit)} />
      {/each}
      {#each openUnits as unit (unit.id)}
        <path d={unit.path} fill-rule="evenodd" fill="url(#dnd-editor-canvas-open)" pointer-events="none" />
      {/each}
    </g>

    <g>
      {#each walls as wall, i (i)}
        <path d={wall.path} fill-rule="evenodd" style:fill={wallFill(wall)} style:stroke={wallFill(wall)} stroke-width={px(1)} stroke-linejoin="round" />
      {/each}
      {#each edges as edge (edge.id)}
        <path d={edge.path} fill="none" style:stroke={edgeStroke(edge.id)} stroke-width={px(isSelectedLine(edge.id) || edge.id === hoveredLineId ? 2.5 : 1.5)} stroke-linecap="round" />
      {/each}
      <path d={wallBoundary} fill="none" style:stroke={CANVAS.wallEdge} stroke-width={px(1)} stroke-linejoin="round" />
      {#if hoveredFace}
        <path d={hoveredFace} fill="none" style:stroke={CANVAS.hover} stroke-width={px(3)} stroke-linecap="round" stroke-linejoin="round" />
      {/if}
    </g>

    <g>
      {#each openings as o (o.id)}
        <path d={o.box} style:fill={CANVAS.background} fill-opacity="0.7" style:stroke={openingStroke(o.id)} stroke-width={px(1)} />
        <path
          d={o.symbol}
          fill="none"
          style:stroke={openingStroke(o.id)}
          stroke-width={px(o.id === hoveredOpening?.id && (hoveredOpening?.part === 'leaf' || hoveredOpening?.part === 'swing') ? 2.5 : 1.25)}
          stroke-linecap="round"
        />
      {/each}
      {#if hoveredJamb}
        <line x1={hoveredJamb[0][0]} y1={hoveredJamb[0][1]} x2={hoveredJamb[1][0]} y2={hoveredJamb[1][1]} style:stroke={CANVAS.hover} stroke-width={px(3)} stroke-linecap="round" />
      {/if}
      {#each openingPreviews as o, i (i)}
        <path d={o.box} style:fill={CANVAS.preview} fill-opacity="0.35" style:stroke={CANVAS.preview} stroke-width={px(1)} />
        <path d={o.symbol} fill="none" style:stroke={CANVAS.preview} stroke-width={px(1.5)} stroke-linecap="round" />
      {/each}
    </g>

    <g>
      {#each centerlines as line (line.id)}
        <path d={line.path} fill="none" style:stroke={CANVAS.centerline} stroke-opacity="0.7" stroke-width={px(1)} stroke-dasharray={guideDash} />
      {/each}
    </g>

    <g opacity={mutedFixtures ? 0.4 : 1}>
      {#each fixtureLines as line (line.id)}
        <path d={line.path} fill="none" style:stroke={lineStroke(line.id)} stroke-width={px(isSelectedLine(line.id) || line.id === hoveredLineId ? 2.5 : 1.5)} stroke-linecap="round" />
      {/each}
      {#each fixtures as fixture (fixture.id)}
        <path
          d={fixture.path}
          fill-rule="evenodd"
          style:fill={fixture.closed && fixture.kind !== 'hole' ? CANVAS.fixture : 'none'}
          stroke-dasharray={fixture.kind === 'hole' ? guideDash : undefined}
          fill-opacity={selection.fixtureIds.has(fixture.id) ? 0.42 : fixture.id === hoveredFixtureId ? 0.34 : 0.24}
          style:stroke={fixtureStroke(fixture.id)}
          stroke-width={px(2)}
          stroke-linejoin="round"
          stroke-linecap="round"
          pointer-events="none"
        />
      {/each}
      {#each trackCorners as corner (corner.key)}
        <path d={corner.path} fill="none" style:stroke={CANVAS.fixtureSelected} stroke-opacity="0.45" stroke-width={px(2)} stroke-linecap="round" pointer-events="none" />
      {/each}
      {#each edgeGrips as grip (grip.key)}
        <path
          d={grip.path}
          fill="none"
          style:stroke={hoveredGrip === grip.key ? CANVAS.hover : CANVAS.fixtureSelected}
          stroke-opacity={grip.on || hoveredGrip === grip.key ? 0.9 : 0.45}
          stroke-width={px(hoveredGrip === grip.key ? 3 : 2)}
          stroke-dasharray={grip.on ? undefined : `${px(4)} ${px(4)}`}
          stroke-linecap="round"
          pointer-events="none"
        />
      {/each}
      {#each supportTracks as ring (ring.key)}
        <path
          d={ring.path}
          fill="none"
          style:stroke={hoveredGrip === ring.key ? CANVAS.hover : CANVAS.nodeSelected}
          stroke-opacity={hoveredGrip === ring.key ? 0.9 : 0.4}
          stroke-width={px(hoveredGrip === ring.key ? 2.5 : 1.5)}
          pointer-events="none"
        />
      {/each}
      {#each topItems as item (item.key)}
        <path d={item.path} style:fill={CANVAS.fixtureStroke} fill-opacity="0.7" pointer-events="none" />
      {/each}
      {#each [...fixturePlans] as [id, plan] (id)}
        {#each plan.pieces as piece (piece.id)}
          <path d={ringToPath(piece.outline, false)} style:fill={CANVAS.fixtureStroke} fill-opacity="0.7" pointer-events="none" />
        {/each}
        {#if selection.fixtureIds.has(id)}
          {#each supportShapes(plan) as s, i (i)}
            {#if s.dot}
              <circle cx={s.dot[0]} cy={s.dot[1]} r={px(4.5)} style:fill={CANVAS.nodeSelected} style:stroke={CANVAS.nodeStroke} stroke-width={px(1.25)} pointer-events="none" />
            {:else if s.path}
              <path
                d={s.path}
                style:fill={CANVAS.nodeSelected}
                fill-opacity="0.16"
                style:stroke={CANVAS.nodeSelected}
                stroke-width={px(1.25)}
                stroke-dasharray={`${px(4)} ${px(3)}`}
                stroke-linejoin="round"
                pointer-events="none"
              />
            {/if}
          {/each}
          {#each supportEnds.filter(e => e.key.includes(':' + id + ':')) as end (end.key)}
            <circle cx={end.point[0]} cy={end.point[1]} r={px(3.5)} style:fill={CANVAS.nodeSelected} style:stroke={CANVAS.nodeStroke} stroke-width={px(1.25)} pointer-events="none" />
          {/each}
          {#each barDots.filter(d => d.key.includes(':' + id + ':')) as dot (dot.key)}
            <circle cx={dot.point[0]} cy={dot.point[1]} r={px(4.5)} style:fill={CANVAS.nodeSelected} style:stroke={CANVAS.nodeStroke} stroke-width={px(1.25)} pointer-events="none" />
          {/each}
          {#each plan.pedestals?.pedestals ?? [] as p, i (i)}
            <circle cx={p.at[0]} cy={p.at[1]} r={px(4.5)} style:fill={CANVAS.nodeSelected} style:stroke={CANVAS.nodeStroke} stroke-width={px(1.25)} pointer-events="none" />
          {/each}
        {/if}
      {/each}
      {#each pointGrips.filter(g => g.key === hoveredGrip) as grip (grip.key)}
        <circle cx={grip.point[0]} cy={grip.point[1]} r={px(8)} fill="none" style:stroke={CANVAS.hover} stroke-width={px(1.5)} pointer-events="none" />
      {/each}
      {#each stretchGrips.filter(g => g.key === hoveredGrip) as grip (grip.key)}
        <path d={grip.path} fill="none" style:stroke={CANVAS.hover} stroke-width={px(2)} stroke-linejoin="round" pointer-events="none" />
      {/each}
      {#each chairGrips.filter(g => g.key === hoveredGrip) as grip (grip.key)}
        <path d={grip.path} fill="none" style:stroke={CANVAS.hover} stroke-width={px(2)} stroke-linejoin="round" pointer-events="none" />
      {/each}
      {#each addGrips as grip (grip.key)}
        <g pointer-events="none">
          <circle
            cx={grip.point[0]}
            cy={grip.point[1]}
            r={px(hoveredGrip === grip.key ? 7 : 6)}
            style:fill={hoveredGrip === grip.key ? CANVAS.hover : CANVAS.background}
            style:stroke={CANVAS.fixtureSelected}
            stroke-width={px(1.5)}
          />
          <path
            d={`M${grip.point[0] - px(3)},${grip.point[1]}H${grip.point[0] + px(3)}M${grip.point[0]},${grip.point[1] - px(3)}V${grip.point[1] + px(3)}`}
            style:stroke={hoveredGrip === grip.key ? CANVAS.background : CANVAS.fixtureSelected}
            stroke-width={px(1.5)}
            stroke-linecap="round"
          />
        </g>
      {/each}
    </g>

    <g>
      {#each guides as guide, i (i)}
        {#if guide.type === 'line'}
          <line
            x1={guide.from[0]}
            y1={guide.from[1]}
            x2={guide.to[0]}
            y2={guide.to[1]}
            style:stroke={GUIDES[guide.style]}
            stroke-width={lineWidth}
            stroke-dasharray={guide.style === 'alignment' || guide.style === 'edge' ? undefined : guideDash}
            opacity="0.8"
          />
        {:else if guide.type === 'path'}
          <path d={polylineToPath(guide.points, false)} fill="none" style:stroke={GUIDES[guide.style]} stroke-width={lineWidth} opacity="0.8" />
        {:else if guide.type === 'highlight'}
          <line x1={guide.from[0]} y1={guide.from[1]} x2={guide.to[0]} y2={guide.to[1]} style:stroke={SNAP_NODE} stroke-width={lineWidth} />
        {/if}
      {/each}
      {#each overlay as item, i (i)}
        {#if item.type === 'preview'}
          <path
            d={polylineToPath(item.points, false)}
            fill="none"
            style:stroke={item.layer === 'walls' ? CANVAS.preview : CANVAS.fixtureStroke}
            stroke-width={Math.max(item.width, px(2))}
            stroke-opacity="0.6"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        {:else if item.type === 'outline'}
          <path
            d={polylineToPath(item.points, false) + (item.closed ? ' Z' : '')}
            style:fill={item.closed ? CANVAS.fixture : 'none'}
            fill-opacity="0.25"
            style:stroke={CANVAS.preview}
            stroke-width={px(1.5)}
            stroke-linejoin="round"
          />
          {#if !item.closed && item.closable}
            <line
              x1={item.points[item.points.length - 1][0]}
              y1={item.points[item.points.length - 1][1]}
              x2={item.points[0][0]}
              y2={item.points[0][1]}
              style:stroke={CANVAS.preview}
              stroke-width={px(1)}
              stroke-dasharray={guideDash}
              opacity="0.6"
            />
          {/if}
        {:else if item.type === 'box'}
          <rect
            x={Math.min(item.a[0], item.b[0])}
            y={Math.min(item.a[1], item.b[1])}
            width={Math.abs(item.b[0] - item.a[0])}
            height={Math.abs(item.b[1] - item.a[1])}
            style:fill={CANVAS.box}
            fill-opacity="0.1"
            style:stroke={CANVAS.box}
            stroke-width={px(1)}
            stroke-dasharray={guideDash}
          />
        {/if}
      {/each}
    </g>

    <g>
      {#if hoveredNode}
        <circle cx={hoveredNode.point[0]} cy={hoveredNode.point[1]} r={px(8)} fill="none" style:stroke={CANVAS.hover} stroke-width={px(1.5)} opacity="0.9" />
      {/if}
      {#each nodes as node (node.id)}
        <circle
          cx={node.point[0]}
          cy={node.point[1]}
          r={(node.layer === 'walls' ? nodeRadius : px(3)) + (selection.nodeIds.has(node.id) ? px(0.625) : 0)}
          style:fill={selection.nodeIds.has(node.id) ? CANVAS.nodeSelected : node.layer === 'walls' ? CANVAS.node : CANVAS.fixtureStroke}
          style:stroke={selection.nodeIds.has(node.id) ? CANVAS.nodeOutline : CANVAS.nodeStroke}
          stroke-width={px(1.25)}
        />
      {/each}
      {#each guides as guide, i (i)}
        {#if (guide.type === 'path' || guide.type === 'line') && guide.midpoint}
          <circle cx={guide.midpoint[0]} cy={guide.midpoint[1]} r={nodeRadius} style:fill={CANVAS.node} style:stroke={CANVAS.nodeStroke} stroke-width={px(1.25)} />
        {/if}
      {/each}
      {#if hoveredMiddle}
        {#if hoveredMiddle.on}
          <circle cx={hoveredMiddle.point[0]} cy={hoveredMiddle.point[1]} r={px(8)} fill="none" style:stroke={CANVAS.hover} stroke-width={px(1.5)} opacity="0.9" />
        {/if}
        <circle
          cx={hoveredMiddle.point[0]}
          cy={hoveredMiddle.point[1]}
          r={hoveredMiddle.layer === 'walls' ? nodeRadius : px(3)}
          style:fill={hoveredMiddle.layer === 'walls' ? CANVAS.node : CANVAS.fixtureStroke}
          style:stroke={CANVAS.nodeStroke}
          stroke-width={px(1.25)}
        />
      {/if}
    </g>

    <g pointer-events="none">
      {#each guides as guide, i (i)}
        {#if guide.type === 'line' && guide.marks}
          <path d={crosses(guide.marks)} style:stroke={CANVAS.nodeStroke} stroke-width={px(2)} stroke-linecap="round" />
          <path d={crosses(guide.marks)} style:stroke={GUIDES[guide.style]} stroke-width={px(1)} stroke-linecap="round" />
        {/if}
      {/each}
    </g>

    {#each overlay as item, i (i)}
      {#if item.type === 'bounds'}
        <rect
          x={item.box.minX}
          y={item.box.minY}
          width={Math.max(item.box.maxX - item.box.minX, px(0.5))}
          height={Math.max(item.box.maxY - item.box.minY, px(0.5))}
          fill="none"
          style:stroke={CANVAS.box}
          stroke-width={px(1)}
        />
      {:else if item.type === 'handles'}
        {#each item.handles as h (h.lineId + h.index)}
          <line x1={h.anchor[0]} y1={h.anchor[1]} x2={h.point[0]} y2={h.point[1]} style:stroke={CANVAS.selected} stroke-width={px(1)} opacity="0.7" />
          <circle cx={h.point[0]} cy={h.point[1]} r={px(3.5)} style:fill={CANVAS.background} style:stroke={CANVAS.selected} stroke-width={px(1.5)} />
        {/each}
      {:else if item.type === 'anchor'}
        <circle cx={item.point[0]} cy={item.point[1]} r={nodeRadius + px(0.625)} style:fill={CANVAS.anchor} style:stroke={CANVAS.nodeOutline} stroke-width={px(1.25)} />
      {:else if item.type === 'cursor'}
        {#if onPoint(item.snapTypes)}
          <circle cx={item.point[0]} cy={item.point[1]} r={px(8)} fill="none" style:stroke={CANVAS.hover} stroke-width={px(1.5)} opacity="0.9" />
        {:else}
          <circle
            cx={item.point[0]}
            cy={item.point[1]}
            r={item.layer === 'fixtures' ? px(3) : nodeRadius}
            style:fill={item.layer === 'fixtures' ? CANVAS.fixtureStroke : CANVAS.node}
            style:stroke={CANVAS.nodeStroke}
            stroke-width={px(1.25)}
          />
        {/if}
      {/if}
    {/each}

    {#if calibration.active}
      <g>
        {#each calibration.points as p, i (i)}
          <circle cx={p[0]} cy={p[1]} r={px(5)} style:fill={CANVAS.calibration} />
        {/each}
        {#each calibrationPairs as pair (pair)}
          <line
            x1={calibration.points[pair][0]}
            y1={calibration.points[pair][1]}
            x2={calibration.points[pair + 1][0]}
            y2={calibration.points[pair + 1][1]}
            style:stroke={CANVAS.calibration}
            stroke-width={px(2)}
            stroke-dasharray={pair ? `${px(6)} ${px(4)}` : undefined}
          />
        {/each}
      </g>
    {/if}
  </g>

  <g class="dnd-editor-canvas-labels">
    {#each labels as unit (unit.id)}
      <text x={unit.anchor[0]} y={-unit.anchor[1]} text-anchor="middle" dominant-baseline="central" font-size={fontSize} style:fill={CANVAS.label}>{unit.name}</text>
    {/each}
    {#each fixtureLabels as fixture (fixture.id)}
      <text x={fixture.anchor[0]} y={-fixture.anchor[1]} text-anchor="middle" dominant-baseline="central" font-size={px(10)} style:fill={CANVAS.fixtureStroke}>{fixture.name}</text>
    {/each}
    {#each readouts as item, i (i)}
      <text
        x={item.at[0]}
        y={-item.at[1] - px(12)}
        text-anchor="middle"
        dominant-baseline="central"
        font-size={px(11)}
        style:fill={CANVAS.readout}
        style:stroke={CANVAS.background}
        stroke-width={px(3)}
        paint-order="stroke">{item.text}</text
      >
    {/each}
    {#if editor.hud && pointer}
      <text
        x={pointer[0] + px(16)}
        y={-pointer[1] - px(16)}
        dominant-baseline="central"
        font-size={px(11)}
        style:fill={CANVAS.readout}
        style:stroke={CANVAS.background}
        stroke-width={px(3)}
        paint-order="stroke">{editor.hud}</text
      >
    {/if}
  </g>
</svg>

<style>
  .dnd-editor-canvas {
    display: block;
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    overscroll-behavior: none;
    font-family: var(--font-body);
  }

  .dnd-editor-canvas:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .dnd-editor-canvas-labels {
    pointer-events: none;
    user-select: none;
  }
</style>
