<script lang="ts">
  import AdditionalSlots from "./AdditionalSlots.svelte";
  import type {CharacterAction} from "$lib/character.types";

  let {action}: { action: CharacterAction } = $props()
</script>

<li class="root">
    <div class="title">
        <h4>{action.name} {action?.level ? '- lvl ' + action.level : ''}</h4>
    </div>
    <div class="content">
        <p>{action.description}</p>
    </div>
    {#if action.usesSlots}
        <AdditionalSlots/>
    {/if}
</li>

<style>
    li {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
        gap: var(--space-0);
        margin-bottom: var(--space-2);
        padding-left: var(--space-2);
    }

    h4, p {
        margin: 0;
        padding: 0;
    }

    h4 {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    p {
        font-size: var(--text-sm);
        color: var(--ink);
    }

    .content {
        position: relative;
        width: 100%;
        height: auto;
    }
</style>
