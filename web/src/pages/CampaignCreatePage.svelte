<script lang="ts">
  import { getSession, postCampaign } from '$lib/api'
  import type { Campaign } from '$lib/api/types'
  import { navigate } from "sly-svelte-location-router";
  import Button from "$components/ui/Button.svelte";
  import Field from "$components/ui/Field.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import Panel from "$components/ui/Panel.svelte";
  import Shell from "$components/ui/Shell.svelte";
  
  interface CampaignConcept {
    name?: string;
    description?: string;
    setting?: string;
    genre?: string;
    tone?: string;
    theme?: string;
    startLevel?: number;
    mainQuest?: {
      title?: string;
      description?: string;
    };
    locations?: Array<{
      name: string;
      type: string;
      description: string;
    }>;
    npcs?: Array<{
      name: string;
      role: string;
      description: string;
    }>;
    hooks?: string[];
  }

  let prompt = $state("");
  let isGenerating = $state(false);
  let generatedConcept: CampaignConcept | null = $state(null);
  let error: string | null = $state(null);
  let isCreating = $state(false);

  const examplePrompts = [
    "A dark fantasy campaign where heroes investigate mysterious disappearances in a haunted forest kingdom",
    "A high-seas adventure campaign featuring pirates, sea monsters, and lost treasure islands",
    "An urban fantasy campaign set in a modern city where magic has recently returned to the world", 
    "A post-apocalyptic campaign where survivors explore the ruins of an ancient magical civilization",
    "A court intrigue campaign where noble houses compete for the throne in a medieval kingdom"
  ];

  function useExamplePrompt(example: string) {
    prompt = example;
  }

  async function generateCampaign() {
    if (!prompt.trim()) {
      error = "Please enter a campaign concept";
      return;
    }

    isGenerating = true;
    error = null;

    try {
      // Simulate AI generation for now
      // In a real implementation, this would call an AI service
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Mock generated campaign concept
      generatedConcept = {
        name: "The Shadow of Blackwood",
        description: "A dark fantasy campaign set in the mysterious Blackwood region, where ancient evils stir and heroes must uncover long-buried secrets.",
        setting: "Blackwood Kingdom",
        genre: "Dark Fantasy",
        tone: "Mysterious and Foreboding",
        theme: "Ancient Secrets and Redemption",
        startLevel: 1,
        mainQuest: {
          title: "The Curse of Blackwood",
          description: "Investigate the mysterious disappearances plaguing the kingdom and uncover the ancient curse that threatens to consume the land."
        },
        locations: [
          {
            name: "Ravenshollow Village",
            type: "Village",
            description: "A small village on the edge of Blackwood Forest where the disappearances began."
          },
          {
            name: "Blackwood Forest",
            type: "Wilderness",
            description: "An ancient forest filled with twisted trees and dark magic."
          },
          {
            name: "Thornwick Castle",
            type: "Castle",
            description: "The seat of power in the region, ruled by the mysterious Lord Thornwick."
          }
        ],
        npcs: [
          {
            name: "Lord Aldric Thornwick",
            role: "Ruler",
            description: "The enigmatic lord of Thornwick Castle who seems to know more than he reveals."
          },
          {
            name: "Marta the Herbalist",
            role: "Quest Giver",
            description: "An elderly herbalist in Ravenshollow who first noticed the disappearances."
          },
          {
            name: "Captain Gareth",
            role: "Ally",
            description: "Captain of the guard who seeks help investigating the mysterious events."
          }
        ],
        hooks: [
          "Strange lights have been seen in Blackwood Forest at night",
          "Ancient runes have appeared on trees throughout the region",
          "Wildlife has begun fleeing the forest in unprecedented numbers",
          "Local crops are failing despite perfect growing conditions"
        ]
      };
    } catch (err) {
      error = "Failed to generate campaign. Please try again.";
      generatedConcept = null;
    } finally {
      isGenerating = false;
    }
  }

  async function createCampaign() {
    if (!generatedConcept) return;
    
    isCreating = true;
    error = null;
    
    try {
      const currentUser = getSession();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      const campaignData = {
        name: generatedConcept.name || "Unnamed Campaign",
        description: generatedConcept.description || "An AI-generated campaign",
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
      };
      
      const campaignId = await postCampaign(campaignData);
      
      console.log("Campaign created successfully with ID:", campaignId);
      
      // Navigate to campaign view with the new campaign ID
      navigate(`/main/campaign/${campaignId}`);
    } catch (err) {
      console.error("Failed to create campaign:", err);
      error = "Failed to create campaign. Please try again.";
    } finally {
      isCreating = false;
    }
  }

  function regenerateCampaign() {
    generateCampaign();
  }

  function editPrompt() {
    generatedConcept = null;
    error = null;
  }
</script>

<Shell title="New Campaign" width="narrow">
  <header class="raise-crown">
    <span class="raise-crest">
      <span class="raise-plate dnd-shield"></span>
      <Ornament name="crest" size="md" tone="metal" />
    </span>
    <h1 class="dnd-heading dnd-heading-hero raise-name">Raise a Campaign</h1>
    <span class="raise-rule"><Ornament name="divider" tone="metal" /></span>
    <p class="raise-lede">Describe the world you mean to run and the forge writes the first draft.</p>
  </header>

  {#if !generatedConcept}
    <Panel title="The concept">
      <Field label="Campaign concept" id="campaign-prompt" help="Setting, tone, and what the party is pulled into.">
        <textarea
          id="campaign-prompt"
          rows="5"
          bind:value={prompt}
          disabled={isGenerating}
          placeholder="A dark fantasy campaign about disappearances in a haunted forest kingdom…"
        ></textarea>
      </Field>

      <p class="dnd-label raise-label">Need a spark</p>
      <div class="raise-sparks">
        {#each examplePrompts as example (example)}
          <button type="button" class="raise-spark" disabled={isGenerating} onclick={() => useExamplePrompt(example)}>
            {example}
          </button>
        {/each}
      </div>

      {#if error}
        <p class="raise-alarm" role="alert">{error}</p>
      {/if}

      {#snippet actions()}
        <Button size="sm" loading={isGenerating} disabled={!prompt.trim()} onclick={generateCampaign}>Generate</Button>
      {/snippet}
    </Panel>

    <div class="raise-acts">
      <Button variant="secondary" onclick={() => navigate('/main')}>Cancel</Button>
    </div>
  {:else}
    <Panel title={generatedConcept.name ?? 'Generated campaign'}>
      <p class="raise-blurb">{generatedConcept.description}</p>

      <dl class="raise-facts">
        <dt>Setting</dt>
        <dd>{generatedConcept.setting || 'Not specified'}</dd>
        <dt>Genre</dt>
        <dd>{generatedConcept.genre || 'Not specified'}</dd>
        <dt>Tone</dt>
        <dd>{generatedConcept.tone || 'Not specified'}</dd>
        <dt>Theme</dt>
        <dd>{generatedConcept.theme || 'Not specified'}</dd>
        <dt>Starting level</dt>
        <dd>{generatedConcept.startLevel || 1}</dd>
      </dl>

      {#snippet actions()}
        <Button variant="ghost" size="sm" onclick={editPrompt}>Edit prompt</Button>
        <Button variant="ghost" size="sm" loading={isGenerating} onclick={regenerateCampaign}>Regenerate</Button>
      {/snippet}
    </Panel>

    <div class="raise-outline">
      {#if generatedConcept.mainQuest}
        <Panel title="Main quest">
          <p class="raise-entry-name">{generatedConcept.mainQuest.title}</p>
          <p class="raise-entry-note">{generatedConcept.mainQuest.description}</p>
        </Panel>
      {/if}

      {#if generatedConcept.locations && generatedConcept.locations.length > 0}
        <Panel title="Key locations">
          <ul class="raise-list">
            {#each generatedConcept.locations as location (location.name)}
              <li class="raise-entry">
                <span class="raise-entry-head">
                  <span class="raise-entry-name">{location.name}</span>
                  <span class="raise-entry-kind">{location.type}</span>
                </span>
                <span class="raise-entry-note">{location.description}</span>
              </li>
            {/each}
          </ul>
        </Panel>
      {/if}

      {#if generatedConcept.npcs && generatedConcept.npcs.length > 0}
        <Panel title="Important NPCs">
          <ul class="raise-list">
            {#each generatedConcept.npcs as npc (npc.name)}
              <li class="raise-entry">
                <span class="raise-entry-head">
                  <span class="raise-entry-name">{npc.name}</span>
                  <span class="raise-entry-kind">{npc.role}</span>
                </span>
                <span class="raise-entry-note">{npc.description}</span>
              </li>
            {/each}
          </ul>
        </Panel>
      {/if}

      {#if generatedConcept.hooks && generatedConcept.hooks.length > 0}
        <Panel title="Adventure hooks">
          <ul class="raise-list">
            {#each generatedConcept.hooks as hook (hook)}
              <li class="raise-entry"><span class="raise-entry-note">{hook}</span></li>
            {/each}
          </ul>
        </Panel>
      {/if}
    </div>

    <Panel title="The prompt">
      <p class="raise-entry-note">{prompt}</p>
    </Panel>

    {#if error}
      <p class="raise-alarm" role="alert">{error}</p>
    {/if}

    <div class="raise-acts">
      <Button variant="secondary" disabled={isCreating} onclick={editPrompt}>Start over</Button>
      <Button variant="primary" loading={isCreating} onclick={createCampaign}>Create this campaign</Button>
    </div>
  {/if}
</Shell>

<style>
  .raise-crown {
    --raise-rule-run: calc(var(--space-8) * 6);
    --raise-rule-share: 70%;
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

  .raise-plate {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: var(--radius-lg);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent)),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim), var(--bevel-up), 0 0 1.125rem var(--ember-glow);
  }

  .raise-name {
    font-size: var(--text-2xl);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.75rem var(--ember-glow), 0 0 1.75rem var(--ember-glow);
    overflow-wrap: anywhere;
  }

  .raise-rule {
    display: block;
    width: min(var(--raise-rule-run), var(--raise-rule-share));
  }

  .raise-lede {
    max-width: 60ch;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .raise-label {
    margin: var(--space-2) 0 0;
    color: var(--ink-faint);
  }

  .raise-sparks {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .raise-spark {
    padding: var(--space-3) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 1rem 0.125rem var(--shade-hard), var(--shadow-sm);
    color: var(--ink-dim);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
    transition: color 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }

  .raise-spark:hover:not(:disabled) {
    color: var(--ink);
    filter: brightness(1.06);
    box-shadow: var(--rim), inset 0 0 1rem 0.125rem var(--shade-hard), var(--shadow-md), 0 0 0.875rem var(--ember-glow);
  }

  .raise-spark:active:not(:disabled) {
    filter: brightness(0.88);
  }

  .raise-spark:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .raise-spark:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .raise-blurb {
    margin: 0;
    color: var(--ink);
  }

  .raise-facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    overflow-wrap: anywhere;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .raise-facts dt {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    font-size: var(--text-xs);
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .raise-facts dd {
    margin: 0;
  }

  .raise-outline {
    --raise-column: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--raise-column), 100%), 1fr));
    align-items: start;
    gap: var(--space-4);
    min-width: 0;
  }

  .raise-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .raise-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
    border-bottom: var(--border-hair) solid var(--metal-dim);
    box-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .raise-entry:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .raise-entry-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
  }

  .raise-entry-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-md);
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .raise-entry-kind {
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift), var(--ground-deep));
    box-shadow: var(--rim-thin);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .raise-entry-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
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
</style>
