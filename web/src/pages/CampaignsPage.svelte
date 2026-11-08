<script lang="ts">
  import { getCampaigns } from '$lib/api'
  import { onMount, setContext } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import Button from '$components/ui/Button.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Sigil from '$components/ui/Sigil.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import CampaignsPanel from './main/CampaignsPanel.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  let loading = $state(true)
  let error = $state<string | null>(null)
  let search = $state('')

  onMount(async () => {
    setTheme(getTheme())

    try {
      userCampaigns.set(await getCampaigns())
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The archive did not answer'
    } finally {
      loading = false
    }
  })

  function createCampaign() {
    navigate('/main/create/campaign')
  }

  function dismissError() {
    error = null
  }
</script>

<Shell drawers title="Campaigns" width="wide" back={() => navigate('/main')}>
  <div class="camps">
    {#if error}
      <div class="camps-error" role="alert">
        <span class="camps-error-mark"><Ornament name="skull" size="sm" tone="ember" /></span>
        <p class="camps-error-text">{error}</p>
        <Button variant="ghost" size="sm" onclick={dismissError}>Dismiss</Button>
      </div>
    {/if}

    <header class="camps-crown">
      <p class="dnd-label camps-eyebrow">Chronicles</p>
      <h1 class="dnd-heading dnd-heading-hero camps-name">Campaigns</h1>
      <p class="camps-lede">{$userCampaigns.length} under way</p>
      <span class="camps-rule"><Ornament name="divider" tone="metal" /></span>
    </header>

    <section class="camps-part" aria-label="Campaigns">
      <header class="camps-divide">
        <h2 class="dnd-label camps-divide-name">All campaigns</h2>
        <span class="camps-divide-run"></span>
        <input
          type="text"
          class="dnd-search camps-divide-search"
          placeholder="Search the chronicles..."
          aria-label="Search campaigns"
          bind:value={search}
        />
        <Sigil title="Raise a new campaign" tone="verdigris" size="sm" onclick={createCampaign} frame="plate"><Glyph name="campaign" size="sm" /></Sigil>
      </header>
      <CampaignsPanel {loading} {search} />
    </section>
  </div>
</Shell>

<style>
  .camps {
    display: grid;
    gap: var(--space-6);
    min-width: 0;
  }

  .camps-crown {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .camps-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .camps-name {
    margin: 0;
  }

  .camps-lede {
    margin: 0;
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .camps-rule {
    display: block;
    width: min(21.25rem, 70%);
  }

  .camps-part {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .camps-divide {
    --camps-search: calc(var(--space-8) * 3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .camps-divide-name {
    margin: 0;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 10px var(--ember-glow);
  }

  .camps-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 #000;
  }

  .camps-divide-search {
    flex: 0 1 var(--camps-search);
    width: auto;
    min-width: 0;
  }

  .camps-error {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
  }

  .camps-error-mark {
    display: flex;
    flex: none;
  }

  .camps-error-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
  }
</style>
