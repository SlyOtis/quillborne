<script lang="ts">
  import { getAssets, getSession, postCampaign, postFile, postObjectAsset } from '$lib/api'
  import type { MediaAsset } from '$lib/blocks'
  import { navigate } from "sly-svelte-location-router";
  import Button from "$components/ui/Button.svelte";
  import Field from "$components/ui/Field.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import Panel from "$components/ui/Panel.svelte";
  import Shell from "$components/ui/Shell.svelte";
  import Portrait from "$components/ui/Portrait.svelte";
  import MediaDialog from "$components/MediaDialog.svelte";

  let name = $state("");
  let description = $state("");
  let picture = $state<MediaAsset | null>(null);
  let pictureDragActive = $state(false);
  let pictureOpen = $state(false);
  let error: string | null = $state(null);
  let isCreating = $state(false);
  let campaignId = $state<string | null>(null);

  let canCreate = $derived(name.trim().length > 0);

  function drag(event: DragEvent, active: boolean): boolean {
    event.preventDefault();
    return active;
  }

  async function postPicture(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith('image/'));
    if (!file) return;

    error = null;

    try {
      picture = await postFile(file, { kind: 'user' });
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function handlePictureDrop(event: DragEvent) {
    event.preventDefault();
    pictureDragActive = false;
    const files = event.dataTransfer?.files;
    if (files) await postPicture(Array.from(files));
  }

  async function createCampaign() {
    if (!canCreate) return;

    isCreating = true;
    error = null;

    try {
      const currentUser = getSession();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      campaignId ??= await postCampaign({
        name: name.trim(),
        description: description.trim(),
        dm_id: currentUser.user_id,
        player_ids: [],
        character_ids: [],
        is_active: true,
        settings: {
          allow_character_editing: true,
          share_character_sheets: true,
          private_notes: true,
          experience_mode: 'milestone' as const
        }
      });

      if (picture) await postObjectAsset(picture.id, 'campaign', campaignId);

      navigate(`/main/campaign/${campaignId}`);
    } catch (err) {
      console.error("Failed to create campaign:", err);
      error = err instanceof Error ? err.message : "Failed to create campaign. Please try again.";
    } finally {
      isCreating = false;
    }
  }
</script>

<Shell title="New Campaign" width="narrow">
  <header class="raise-crown">
    <span class="raise-crest"><Ornament name="banner" size="lg" tone="metal" /></span>
    <h1 class="dnd-heading dnd-heading-hero raise-name">Raise a Campaign</h1>
  </header>

  <Panel title="The campaign">
    <div class="raise-top">
      <button
        type="button"
        class="raise-drop raise-face"
        class:raise-drop-live={pictureDragActive}
        aria-label="Campaign image"
        disabled={isCreating}
        ondragover={(event) => (pictureDragActive = drag(event, true))}
        ondragleave={() => (pictureDragActive = false)}
        ondrop={handlePictureDrop}
        onclick={() => (pictureOpen = true)}
      >
        {#if picture}
          <span class="raise-face-glass"><Portrait src={picture.url} alt="Campaign" size="fill" /></span>
        {:else}
          <span class="dnd-empty-mark"><Ornament name="portrait" size="sm" tone="metal" /></span>
          <span class="raise-drop-note">Drop a picture, or pick one</span>
        {/if}
      </button>

      <div class="raise-lines">
        <Field label="Campaign title" id="campaign-title" required>
          <input id="campaign-title" type="text" bind:value={name} disabled={isCreating} placeholder="Enter campaign title" />
        </Field>

        <Field label="Description" id="campaign-description" help="Setting, tone, and what the party is pulled into.">
          <textarea
            id="campaign-description"
            rows="4"
            bind:value={description}
            disabled={isCreating}
            placeholder="A dark fantasy campaign about disappearances in a haunted forest kingdom…"
          ></textarea>
        </Field>
      </div>
    </div>
  </Panel>

  {#if error}
    <p class="raise-alarm" role="alert">{error}</p>
  {/if}

  <div class="raise-acts">
    <Button variant="secondary" disabled={isCreating} onclick={() => navigate('/main')}>Cancel</Button>
    <Button variant="primary" loading={isCreating} disabled={!canCreate} onclick={createCampaign}>Create this campaign</Button>
  </div>
</Shell>

{#if pictureOpen}
  <MediaDialog
    kind="image"
    current={picture?.url}
    getAssets={(query, kind) => getAssets(query, kind, { kind: 'user' })}
    uploadFile={(file) => postFile(file, { kind: 'user' })}
    onclose={(asset) => {
      if (asset) picture = asset;
      pictureOpen = false;
    }}
  />
{/if}

<style>
  .raise-crown {
    --raise-crest-lift: drop-shadow(0 var(--space-1) var(--space-3) var(--shade-hard));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    text-align: center;
  }

  .raise-crest {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-6) var(--space-5);
    filter: var(--raise-crest-lift);
  }

  .raise-name {
    font-size: var(--text-2xl);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.75rem var(--ember-glow), 0 0 1.75rem var(--ember-glow);
    overflow-wrap: anywhere;
  }

  .raise-top {
    --raise-picture-col: calc(var(--space-8) * 3);
    display: grid;
    grid-template-columns: minmax(0, var(--raise-picture-col)) minmax(0, 1fr);
    gap: var(--space-4);
    align-items: stretch;
  }

  .raise-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-self: stretch;
  }

  .raise-drop {
    --raise-drop-sink: inset 0 var(--border-width) var(--space-3) var(--shade-hard);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    min-width: 0;
    overflow: hidden;
    border: var(--border-width) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--raise-drop-sink);
    text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .raise-drop-live {
    border-color: var(--metal);
    box-shadow: var(--raise-drop-sink), var(--glow-metal), inset 0 0 2rem -0.5rem var(--ember-glow);
  }

  .raise-drop-live .raise-drop-note {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .raise-drop:focus-within {
    border-color: var(--metal);
    box-shadow: var(--focus-ring);
  }

  .raise-face {
    width: 100%;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .raise-face:disabled {
    cursor: progress;
  }

  .raise-face-glass {
    position: absolute;
    inset: 0;
    display: block;
  }

  .raise-face-glass :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .raise-drop-note {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    letter-spacing: var(--tracking-wide);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
    overflow-wrap: anywhere;
  }

  .raise-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .raise-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  @media (max-width: 720px) {
    .raise-top {
      grid-template-columns: 1fr;
    }
  }
</style>
