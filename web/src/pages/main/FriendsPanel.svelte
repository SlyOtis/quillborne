<script lang="ts">
  import { deleteProfileFriend, postProfileFriend } from '$lib/api'
  import type { Profile } from '$lib/api/types'
  import Glyph from "$components/ui/Glyph.svelte";
  import Button from "$components/ui/Button.svelte";
  import Card from "$components/ui/Card.svelte";
  import Field from "$components/ui/Field.svelte";

  let {
    loading = false,
    friends = $bindable([] as Profile[])
  }: {
    /** Whether the hearth is still reading who the friends are. */
    loading?: boolean
    /** The profiles of the friends, rewritten when one is added or removed. */
    friends?: Profile[]
  } = $props();

  let address = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function add() {
    const wanted = address.trim();
    if (!wanted) return;

    busy = true;
    error = null;
    try {
      const found = await postProfileFriend(wanted);
      if (!friends.some((entry) => entry.user_id === found.user_id)) friends = [...friends, found];
      address = '';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
    }
  }

  async function drop(userId: string) {
    busy = true;
    error = null;
    try {
      await deleteProfileFriend(userId);
      friends = friends.filter((entry) => entry.user_id !== userId);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
    }
  }
</script>

{#if loading}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else}
  {#if friends.length === 0}
    <div class="dnd-empty friends-empty">
      <span class="dnd-empty-mark"><Glyph name="character" size="lg" /></span>
      <span>No friend has answered the call yet</span>
    </div>
  {:else}
    <div class="dnd-stack">
      {#each friends as entry (entry.user_id)}
        <Card
          title={entry.display_name || entry.email}
          sub={entry.email}
          image={entry.photo_url}
          tone="metal"
        >
          <Button variant="ghost" size="sm" disabled={busy} onclick={() => drop(entry.user_id)}>Remove</Button>
        </Card>
      {/each}
    </div>
  {/if}

  <div class="friends-add">
    <Field id="friend-address" label="Add a friend by email" error={error ?? undefined}>
      <input
        id="friend-address"
        type="email"
        placeholder="them@example.com"
        bind:value={address}
        disabled={busy}
        onkeydown={(event) => event.key === 'Enter' && add()}
      />
      {#snippet action()}
        <Button variant="secondary" size="sm" disabled={busy || !address.trim()} onclick={add}>Add</Button>
      {/snippet}
    </Field>
  </div>
{/if}

<style>
  .friends-empty {
    flex: none;
  }

  .friends-add {
    display: grid;
    min-width: 0;
  }
</style>
