<script lang="ts">
  import { postParty } from '$lib/api'
  import { onMount, setContext } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import MenuPanel from '$components/MenuPanel.svelte'
  import Chat from '$chat/Chat.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  let name = $state('')
  let description = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  const named = $derived(name.trim().length > 0)

  onMount(() => setTheme(getTheme()))

  async function raise() {
    if (!named || !$user) return

    busy = true
    error = null
    try {
      const id = await postParty({
        name: name.trim(),
        description: description.trim(),
        image_url: '',
        member_ids: [$user.user_id],
        character_ids: []
      })
      navigate(`/main/party/${id}`)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      busy = false
    }
  }
</script>

<Shell title="Gather a party" width="narrow" back={() => navigate('/main')}>
  {#snippet menu()}
    <MenuPanel />
  {/snippet}

  {#snippet chat()}
    <Chat />
  {/snippet}

  <div class="band">
    {#if error}
      <p class="band-alarm" role="alert">{error}</p>
    {/if}

    <p class="band-lede">
      A party stands on its own. Gather one to share character sheets and talk, with or without a campaign
      around it.
    </p>

    <Field id="party-name" label="What they are called">
      <input id="party-name" type="text" placeholder="The Ashen Company" bind:value={name} disabled={busy} />
    </Field>

    <Field id="party-note" label="What they are about">
      <textarea
        id="party-note"
        rows="4"
        placeholder="Sellswords out of Duskin Keep."
        bind:value={description}
        disabled={busy}
      ></textarea>
    </Field>

    <div class="band-acts">
      <Button variant="primary" disabled={busy || !named} onclick={raise}>Gather them</Button>
      <Button variant="ghost" disabled={busy} onclick={() => navigate('/main')}>Cancel</Button>
    </div>
  </div>
</Shell>

<style>
  .band {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .band-lede {
    margin: 0;
    max-width: 70ch;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .band-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: var(--border-hair) solid var(--metal-dim);
    box-shadow: inset 0 1px 0 var(--keyline);
  }

  .band-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
