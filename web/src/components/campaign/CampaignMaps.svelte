<script lang="ts">
  import { deleteCampaignMap, postCampaignMap, postFile, putCampaignMap } from '$lib/api'
  import type { Campaign, CampaignMap, CampaignRecordKind, Character, MapLayer, MapMarker, MapMarkerKind } from '$lib/api/types'
  import { onDestroy, untrack } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { RESOURCES, type Place } from '$lib/resources'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import MapCanvas from './MapCanvas.svelte'
  import MapIcon from './MapIcon.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import DocumentEditor from '$components/nimap/DocumentEditor.svelte'
  import MapView from '$components/nimap/MapView.svelte'
  import { createDocument, createLevel, type MapDocument } from '$lib/nimap'
  import { orderedLevels } from '$lib/nimap-editor/levels'
  import { getLook } from '$lib/nimap-editor/look'

  let {
    campaignId,
    isDm = false,
    locations = [],
    npcs = [],
    maps = [],
    selectedId = $bindable(null),
    placing = $bindable(null),
    editing = $bindable(null),
    mode = 'canvas'
  }: {
    /** Campaign the maps belong to. */
    campaignId: string
    /** Grants uploading, placing, revealing and deleting. Players get a read only view. */
    isDm?: boolean
    /** Places a pin can stand for. */
    locations?: Place[]
    /** The NPC characters a pin can stand for. */
    npcs?: Character[]
    /** Every map the campaign holds, newest listener state. */
    maps?: CampaignMap[]
    /** The map on the canvas, bound to whatever drives the table of contents. */
    selectedId?: string | null
    /** The marker kind the next map click drops, shared with the tools. */
    placing?: MapMarkerKind | null
    /** The marker the editor is open on, shared with the tools. */
    editing?: string | null
    /** Draws the map itself, or the controls that drive it. */
    mode?: 'canvas' | 'tools'
  } = $props()

  const FAMILIES: { name: string; kinds: MapMarkerKind[] }[] = [
    { name: 'Settlements', kinds: ['region', 'city', 'town', 'village', 'camp', 'market'] },
    { name: 'Strongholds', kinds: ['keep', 'tower', 'temple', 'shrine', 'inn', 'forge'] },
    { name: 'Depths', kinds: ['dungeon', 'cave', 'ruin', 'grave', 'portal', 'bridge'] },
    { name: 'Wilds', kinds: ['forest', 'mountain', 'swamp', 'lake', 'harbour', 'road'] },
    { name: 'Marks', kinds: ['npc', 'battle', 'danger', 'treasure', 'note'] }
  ]

  const KINDS: MapMarkerKind[] = FAMILIES.flatMap((family) => family.kinds)

  let error = $state<string | null>(null)
  let busy = $state(false)
  let title = $state('')
  let shown = $state<Record<string, boolean>>({ pins: true, layers: false, chart: false, add: false })

  function toggle(id: string) {
    shown = { ...shown, [id]: !shown[id] }
  }

  const visible = $derived(isDm ? maps : maps.filter((map) => map.is_visible))
  const selected = $derived(visible.find((map) => map.id === selectedId) ?? visible[0] ?? null)
  const levels = $derived(selected?.plan ? orderedLevels(selected.plan) : [])
  const level = $derived(levels.find((one) => one.id === levelId) ?? levels[0] ?? null)

  let view = $state<'picture' | 'plan'>('picture')
  let drawing = $state(false)
  let levelId = $state<string | null>(null)
  let saving: ReturnType<typeof setTimeout> | undefined

  function putPlan(plan: MapDocument) {
    const mapId = selected?.id
    if (!mapId) return
    clearTimeout(saving)
    saving = setTimeout(() => {
      putCampaignMap(campaignId, mapId, { plan }).catch(report)
    }, 600)
  }

  function chooseImage(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        try {
          resolve((await postFile(file, { kind: 'campaignMap', campaignId })).url)
        } catch (reason) {
          report(reason)
          resolve(null)
        }
      }
      input.oncancel = () => resolve(null)
      input.click()
    })
  }

  onDestroy(() => clearTimeout(saving))
  const marker = $derived(selected?.markers.find((entry) => entry.id === editing) ?? null)

  const trail = $derived.by(() => {
    const walk: CampaignMap[] = []
    let step: CampaignMap | null = selected
    while (step && !walk.some((one) => one.id === step!.id)) {
      const here: CampaignMap = step
      walk.unshift(here)
      step = visible.find((one) => one.id === here.parent_map_id) ?? null
    }
    return walk
  })

  function report(reason: unknown) {
    error = reason instanceof Error ? reason.message : String(reason)
  }

  async function addMap(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    busy = true
    error = null
    try {
      const { url } = await postFile(file, { kind: 'campaignMap', campaignId })
      selectedId = await postCampaignMap(campaignId, {
        title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
        image_url: url
      })
      title = ''
    } catch (reason) {
      report(reason)
    } finally {
      busy = false
      input.value = ''
    }
  }

  async function addLayer(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !selected) return

    busy = true
    error = null
    try {
      const { url } = await postFile(file, { kind: 'campaignMap', campaignId })
      const previous = selected.layers[selected.layers.length - 1]
      const layer: MapLayer = {
        id: `${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        image_url: url,
        min_zoom: previous ? Math.min(previous.max_zoom, selected.max_zoom) : Math.round(selected.max_zoom / 2),
        max_zoom: selected.max_zoom
      }
      await putCampaignMap(campaignId, selected.id, { layers: [...selected.layers, layer] })
    } catch (reason) {
      report(reason)
    } finally {
      busy = false
      input.value = ''
    }
  }

  async function putLayer(layerId: string, updates: Partial<MapLayer>) {
    if (!selected) return
    const next = selected.layers.map((entry) => (entry.id === layerId ? { ...entry, ...updates } : entry))
    await putCampaignMap(campaignId, selected.id, { layers: next }).catch(report)
  }

  async function deleteLayer(layerId: string) {
    if (!selected) return
    const next = selected.layers.filter((entry) => entry.id !== layerId)
    await putCampaignMap(campaignId, selected.id, { layers: next }).catch(report)
  }

  async function place(x: number, y: number) {
    if (!selected || !placing) return

    const pin: MapMarker = {
      id: `${Date.now()}`,
      title: `New ${placing}`,
      kind: placing,
      x,
      y,
      is_visible: false,
      min_zoom: selected.min_zoom,
      max_zoom: selected.max_zoom
    }

    placing = null
    editing = pin.id
    await putCampaignMap(campaignId, selected.id, { markers: [...selected.markers, pin] }).catch(report)
  }

  async function putMarker(markerId: string, updates: Partial<MapMarker>) {
    if (!selected) return
    const next = selected.markers.map((entry) => (entry.id === markerId ? { ...entry, ...updates } : entry))
    await putCampaignMap(campaignId, selected.id, { markers: next }).catch(report)
  }

  async function deleteMarker(markerId: string) {
    if (!selected) return
    if (editing === markerId) editing = null
    const next = selected.markers.filter((entry) => entry.id !== markerId)
    await putCampaignMap(campaignId, selected.id, { markers: next }).catch(report)
  }

  async function linkMap(markerId: string, childId: string) {
    if (!selected) return
    await putMarker(markerId, { link_map_id: childId || undefined })
    if (childId) await putCampaignMap(campaignId, childId, { parent_map_id: selected.id }).catch(report)
  }

  function lookup(pin: MapMarker) {
    const child = pin.link_map_id ? visible.find((one) => one.id === pin.link_map_id) : null
    if (child) return { name: child.title, note: `${child.markers.length} pins`, body: '', image: child.image_url }

    if (pin.record_kind === 'place' && pin.record_id) {
      const place = locations.find((one) => one.id === pin.record_id)
      if (place) return { name: place.title, note: RESOURCES.places.mark(place), body: place.description, image: place.image, href: `/main/campaign/${campaignId}/places/${place.id}` }
    }
    if (pin.record_kind === 'character' && pin.record_id) {
      const who = npcs.find((one) => one.id === pin.record_id)
      if (who) return { name: who.metadata.name, note: `${who.metadata.race} ${who.metadata.class}`, body: who.character.info.description, image: who.character.info.imageUrl, href: `/main/character/${who.id}` }
    }

    return { name: pin.title, note: pin.kind, body: pin.description ?? '', image: '' }
  }

  function open(pin: MapMarker) {
    const card = lookup(pin)
    if (card.href) navigate(card.href)
  }

  function follow(pin: MapMarker) {
    if (pin.link_map_id && visible.some((map) => map.id === pin.link_map_id)) {
      selectedId = pin.link_map_id
      editing = null
      return
    }
    if (isDm) editing = pin.id
  }
</script>

<section class="dnd-maps" class:dnd-maps-tools={mode === 'tools'}>
  {#if error}
    <p class="dnd-maps-error">{error}</p>
  {/if}

  {#if mode === 'canvas'}
    {#if visible.length === 0}
      <p class="dnd-maps-note">No map has been shared yet.</p>
    {:else if trail.length > 1}
      <nav class="dnd-maps-trail" aria-label="Where this map sits">
        {#each trail as step, index (step.id)}
          <button
            type="button"
            class="dnd-maps-step"
            disabled={index === trail.length - 1}
            onclick={() => { selectedId = step.id; editing = null }}
          >
            {step.title}
          </button>
        {/each}
      </nav>
    {/if}

    {#if selected}
      {#if level || isDm}
        <div class="dnd-maps-views" role="group" aria-label="How the map is shown">
          <IconBtn title="The picture" active={view === 'picture' || !level} onclick={() => (view = 'picture')}>
            <Glyph name="picture" size="sm" />
          </IconBtn>
          {#if level}
            <IconBtn title="The plan in 3D" active={view === 'plan'} onclick={() => (view = 'plan')}>
              <Glyph name="cube" size="sm" />
            </IconBtn>
          {/if}
          {#if view === 'plan' && levels.length > 1}
            <Field label="Level" id="map-level">
              <select id="map-level" value={level?.id} onchange={(e) => (levelId = e.currentTarget.value)}>
                {#each levels as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
              </select>
            </Field>
          {/if}
          {#if isDm}
            <IconBtn title="Draw the plan" onclick={() => (drawing = true)}>
              <Glyph name="wall" size="sm" />
            </IconBtn>
          {/if}
        </div>
      {/if}

      {#if view === 'plan' && level}
        <div class="dnd-maps-scene">
          <MapView {level} look={getLook()} />
        </div>
      {:else}
        <MapCanvas
          map={selected}
          canEdit={isDm}
          {placing}
          onPlace={place}
          onSelect={follow}
          onDescend={follow}
          {lookup}
          onOpen={open}
        />
      {/if}

      {#if drawing && isDm}
        <dialog class="dnd-maps-drawing" aria-label="Draw the plan" {@attach (element: HTMLDialogElement) => element.showModal()} onclose={() => (drawing = false)}>
          {#key selected.id}
            <DocumentEditor
              document={selected.plan ?? createDocument({ name: selected.title, levels: [createLevel({ name: '1' })] })}
              title={selected.title}
              onchange={putPlan}
              {chooseImage}
              actions={[{ label: 'Done', primary: true, run: () => (drawing = false) }]}
            />
          {/key}
        </dialog>
      {/if}
    {/if}
  {:else if selected && isDm}
    <Fold title="Drop a pin" count={selected.markers.length} open={shown.pins} ontoggle={() => toggle('pins')}>
      {#each FAMILIES as family (family.name)}
        <p class="dnd-maps-title">{family.name}</p>
        <div class="dnd-maps-kinds">
          {#each family.kinds as kind (kind)}
            <IconBtn
              title="Place a {kind} pin"
              active={placing === kind}
              onclick={() => (placing = placing === kind ? null : kind)}
            >
              <MapIcon {kind} size={18} />
            </IconBtn>
          {/each}
        </div>
      {/each}

      {#if placing}
        <p class="dnd-maps-note">Click the map to drop a {placing} pin at the current zoom.</p>
      {/if}
    </Fold>

    {#if marker}
      <Fold title={marker.title} count={marker.kind} open ontoggle={() => (editing = null)}>
        <Field label="Title" id="pin-title">
          <input id="pin-title" value={marker.title} onchange={(e) => putMarker(marker.id, { title: e.currentTarget.value })} />
        </Field>
        <Field label="Description" id="pin-description">
          <textarea id="pin-description" rows="2" value={marker.description ?? ''} onchange={(e) => putMarker(marker.id, { description: e.currentTarget.value })}></textarea>
        </Field>
        <Field label="Icon" id="pin-kind">
          <select id="pin-kind" value={marker.kind} onchange={(e) => putMarker(marker.id, { kind: e.currentTarget.value as MapMarkerKind })}>
            {#each KINDS as kind}<option value={kind}>{kind}</option>{/each}
          </select>
        </Field>
        <div class="dnd-maps-pair">
          <Field label="Appears from zoom" id="pin-min">
            <input id="pin-min" type="number" step="0.1" min={selected.min_zoom} max={selected.max_zoom} value={marker.min_zoom} onchange={(e) => putMarker(marker.id, { min_zoom: Number(e.currentTarget.value) })} />
          </Field>
          <Field label="Disappears past zoom" id="pin-max">
            <input id="pin-max" type="number" step="0.1" min={selected.min_zoom} max={selected.max_zoom} value={marker.max_zoom} onchange={(e) => putMarker(marker.id, { max_zoom: Number(e.currentTarget.value) })} />
          </Field>
        </div>
        <Field label="Opens map" id="pin-link" help="Clicking the pin jumps to this map.">
          <select id="pin-link" value={marker.link_map_id ?? ''} onchange={(e) => linkMap(marker.id, e.currentTarget.value)}>
            <option value="">None</option>
            {#each maps.filter((entry) => entry.id !== selected.id) as entry}<option value={entry.id}>{entry.title}</option>{/each}
          </select>
        </Field>
        <Field label="Stands for" id="pin-record" help="Points the pin at a place or an NPC so the text lives in one record.">
          <select
            id="pin-record"
            value={marker.record_kind && marker.record_id ? `${marker.record_kind}:${marker.record_id}` : ''}
            onchange={(e) => {
              const [kind, id] = e.currentTarget.value.split(':')
              putMarker(marker.id, {
                record_kind: id ? (kind as CampaignRecordKind) : undefined,
                record_id: id || undefined
              })
            }}
          >
            <option value="">Nothing</option>
            {#each locations as place}<option value="place:{place.id}">Place — {place.title}</option>{/each}
            {#each npcs as npc}<option value="character:{npc.id}">NPC — {npc.metadata.name}</option>{/each}
          </select>
        </Field>
        <div class="dnd-maps-row">
          <Button variant={marker.is_visible ? 'secondary' : 'primary'} onclick={() => putMarker(marker.id, { is_visible: !marker.is_visible })}>
            {marker.is_visible ? 'Revealed' : 'Reveal to players'}
          </Button>
          <Button variant="danger" onclick={() => deleteMarker(marker.id)}>Remove pin</Button>
        </div>
      </Fold>
    {/if}

    <Fold title="Detail layers" count={selected.layers.length} open={shown.layers} ontoggle={() => toggle('layers')}>
      <p class="dnd-maps-note">A layer replaces the picture once the zoom passes its threshold.</p>
      {#each selected.layers as entry (entry.id)}
        <div class="dnd-maps-row">
          <input class="dnd-maps-input" value={entry.title} onchange={(e) => putLayer(entry.id, { title: e.currentTarget.value })} />
          <label class="dnd-maps-inline">from <input class="dnd-maps-number" type="number" step="0.1" value={entry.min_zoom} onchange={(e) => putLayer(entry.id, { min_zoom: Number(e.currentTarget.value) })} /></label>
          <label class="dnd-maps-inline">to <input class="dnd-maps-number" type="number" step="0.1" value={entry.max_zoom} onchange={(e) => putLayer(entry.id, { max_zoom: Number(e.currentTarget.value) })} /></label>
          <Button variant="danger" onclick={() => deleteLayer(entry.id)}>Remove</Button>
        </div>
        <div class="dnd-maps-row">
          <label class="dnd-maps-inline">x <input class="dnd-maps-number" type="number" step="0.01" min="0" max="1" value={entry.x ?? 0} onchange={(e) => putLayer(entry.id, { x: Number(e.currentTarget.value) })} /></label>
          <label class="dnd-maps-inline">y <input class="dnd-maps-number" type="number" step="0.01" min="0" max="1" value={entry.y ?? 0} onchange={(e) => putLayer(entry.id, { y: Number(e.currentTarget.value) })} /></label>
          <label class="dnd-maps-inline">w <input class="dnd-maps-number" type="number" step="0.01" min="0" max="1" value={entry.width ?? ''} placeholder="whole" onchange={(e) => putLayer(entry.id, { width: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} /></label>
          <label class="dnd-maps-inline">h <input class="dnd-maps-number" type="number" step="0.01" min="0" max="1" value={entry.height ?? ''} placeholder="whole" onchange={(e) => putLayer(entry.id, { height: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} /></label>
        </div>
      {/each}
      <label class="dnd-maps-upload">
        <span>Add a detail layer</span>
        <input type="file" accept="image/*" disabled={busy} onchange={addLayer} />
      </label>
    </Fold>

    <Fold title="This map" count={selected.is_visible ? 'shared' : 'hidden'} open={shown.chart} ontoggle={() => toggle('chart')}>
      <div class="dnd-maps-row">
        <Button
          variant={selected.is_visible ? 'secondary' : 'primary'}
          onclick={() => putCampaignMap(campaignId, selected.id, { is_visible: !selected.is_visible }).catch(report)}
        >
          {selected.is_visible ? 'Hide map from players' : 'Reveal map to players'}
        </Button>
        <Button variant="danger" onclick={() => deleteCampaignMap(campaignId, selected.id).catch(report)}>
          Delete map
        </Button>
      </div>
    </Fold>
  {/if}

  {#if isDm && mode === 'tools'}
    <Fold title="Add a map" count={maps.length} open={shown.add} ontoggle={() => toggle('add')}>
      <Field label="Title" id="map-title" help="Left blank, the file name is used.">
        <input id="map-title" bind:value={title} placeholder="The Sword Coast" />
      </Field>
      <label class="dnd-maps-upload">
        <span>{busy ? 'Uploading...' : 'Choose an image'}</span>
        <input type="file" accept="image/*" disabled={busy} onchange={addMap} />
      </label>
    </Fold>
  {/if}

</section>

<style>
  .dnd-maps {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .dnd-maps-views {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--space-6);
  }

  .dnd-maps-scene {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .dnd-maps-drawing {
    inline-size: 100%;
    block-size: 100%;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: 0;
    border: none;
    color: var(--ink);
    background: var(--ground-deep);
  }

  .dnd-maps-drawing[open] {
    display: flex;
  }

  .dnd-maps-tools {
    flex: none;
  }

  .dnd-maps-trail,
  .dnd-maps-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .dnd-maps-kinds {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: var(--space-7);
    gap: var(--space-1);
    justify-items: center;
  }

  .dnd-maps-title {
    margin: 0;
    color: var(--metal);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 #000;
  }

  .dnd-maps-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .dnd-maps-input,
  .dnd-maps-number {
    min-width: 0;
    padding: var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep), var(--ground));
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--text-sm);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-maps-input:focus,
  .dnd-maps-number:focus {
    outline: none;
    border-color: var(--metal-bright);
    box-shadow: var(--bevel-down), var(--glow-metal);
  }

  .dnd-maps-input {
    flex: 1;
  }

  .dnd-maps-number {
    width: 4.5rem;
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
  }

  .dnd-maps-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-maps-upload {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-maps-upload input {
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-maps-note {
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-maps-note {
    margin: 0;
    font-size: var(--text-sm);
  }

  .dnd-maps-error {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    color: var(--ink);
    font-size: var(--text-sm);
  }
</style>
