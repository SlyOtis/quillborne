<script lang="ts">
  import ResourceShell from '$components/campaign/ResourceShell.svelte'
  import type { Npc } from '$lib/resources'
</script>

<ResourceShell kind="npcs">
  {#snippet facts(one)}
    {@const it = one as unknown as Npc}
    {#if it.role}<dt>Role</dt><dd>{it.role}</dd>{/if}
    <dt>Disposition</dt>
    <dd>{it.disposition}</dd>
    {#if it.species}<dt>Species</dt><dd>{it.species}</dd>{/if}
  {/snippet}

  {#snippet form(one)}
    <dt><label for="npc-role">Role</label></dt>
    <dd>
      <input id="npc-role" type="text" bind:value={one.role} />
    </dd>
    <dt><label for="npc-disposition">Disposition</label></dt>
    <dd>
      <select id="npc-disposition" bind:value={one.disposition}>
        <option value="friendly">friendly</option>
        <option value="neutral">neutral</option>
        <option value="hostile">hostile</option>
        <option value="unknown">unknown</option>
      </select>
    </dd>
    <dt><label for="npc-species">Species</label></dt>
    <dd>
      <input id="npc-species" type="text" bind:value={one.species} />
    </dd>
  {/snippet}
</ResourceShell>
