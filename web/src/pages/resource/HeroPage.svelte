<script lang="ts">
  import { postCharacter } from '$lib/api'
  import type { Owner } from '$lib/api/types'
  import { navigate } from 'sly-svelte-location-router'
  import ResourceShell from '$components/campaign/ResourceShell.svelte'
  import Sigil from '$components/ui/Sigil.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import { putHero, type Hero } from '$lib/resources'
  import { getEmptyCharacter } from '$lib/engine'

  let forging = $state(false)

  async function openSheet(one: Hero, owner: Owner) {
    if (one.sheet_id) {
      navigate(`/main/character/${one.sheet_id}`)
      return
    }
    if (!one.id || forging) return

    forging = true
    try {
      const character = getEmptyCharacter()
      character.info = {
        ...character.info,
        name: one.title,
        description: one.description,
        imageUrl: one.image,
        level: one.level || 1,
        class: { name: one.class || 'Unknown', hitDice: { amount: 1, die: 8 } },
        race: { name: one.species || 'Unknown', type: one.species || 'Unknown' }
      }

      const id = await postCharacter(
        character,
        undefined,
        owner.at === 'campaign' ? owner.id : undefined
      )
      await putHero(owner, one.id, { ...one, sheet_id: id })
      navigate(`/main/character/${id}`)
    } finally {
      forging = false
    }
  }
</script>

<ResourceShell kind="heroes">
  {#snippet bar(one, owner)}
    {@const it = one as unknown as Hero}
    <Sigil title={it.sheet_id ? 'Open the sheet' : 'Forge the sheet'} size="sm" onclick={() => openSheet(it, owner)}>
      <Glyph name="character" size="sm" />
    </Sigil>
  {/snippet}

  {#snippet facts(one)}
    {@const it = one as unknown as Hero}
    <dt>Level</dt>
    <dd>{it.level}</dd>
    {#if it.class}<dt>Class</dt><dd>{it.class}</dd>{/if}
    {#if it.species}<dt>Species</dt><dd>{it.species}</dd>{/if}
    {#if it.player}<dt>Played by</dt><dd>{it.player}</dd>{/if}
  {/snippet}

  {#snippet form(one)}
    <dt><label for="hero-player">Played by</label></dt>
    <dd>
      <input id="hero-player" type="text" bind:value={one.player} />
    </dd>
    <dt><label for="hero-class">Class</label></dt>
    <dd>
      <input id="hero-class" type="text" bind:value={one.class} />
    </dd>
    <dt><label for="hero-species">Species</label></dt>
    <dd>
      <input id="hero-species" type="text" bind:value={one.species} />
    </dd>
    <dt><label for="hero-level">Level</label></dt>
    <dd>
      <input id="hero-level" type="number" bind:value={one.level} />
    </dd>
  {/snippet}
</ResourceShell>
