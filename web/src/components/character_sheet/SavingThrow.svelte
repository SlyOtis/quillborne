<script lang="ts">
  import {rollSave} from "$lib/engine";
  import Button from "$components/ui/Button.svelte";

  const {title, short, modifier, proficient}: {
    /** The name of the save, written in the roll log. */
    title: string
    /** The caps abbreviation shown on the row. */
    short: string
    /** The bonus added to the die. */
    modifier: number
    /** Marks the save as one the character is proficient in. */
    proficient: boolean
  } = $props()

  const sign = $derived(modifier < 0 ? '' : '+')

  function roll() {
    window.dispatchEvent(new CustomEvent('playButtonClick'));
    rollSave(title, modifier, proficient ? 1 : 0)
  }
</script>

<Button variant="ghost" size="md" fill title="Roll {title} save" onclick={roll}>
  <span class="save" class:save-proficient={proficient}>
    <span class="save-pip"></span>
    <span class="save-short">{short}</span>
    <span class="save-bonus dnd-inset">{sign}{modifier}</span>
  </span>
</Button>

<style>
  .save {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .save-pip {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    background: var(--texture-noise), var(--ground-deep);
    border: var(--border-hair) solid var(--metal-dim);
    box-shadow: var(--bevel-down);
    transform: rotate(45deg);
  }

  .save-proficient .save-pip {
    background: linear-gradient(135deg, var(--ember-core) 0%, var(--metal-bright) 30%, var(--metal) 60%, var(--metal-dim) 100%);
    border-color: var(--keyline);
    box-shadow: inset 0 1px 0 var(--sheen-strong), 0 0 0.4rem var(--ember-glow);
  }

  .save-short {
    flex: 1;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-align: start;
    color: var(--ink-dim);
  }

  .save-proficient .save-short {
    color: var(--metal-bright);
  }

  .save-bonus {
    flex: none;
    padding: 0 var(--space-2);
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    letter-spacing: 0;
    color: var(--metal-bright);
  }
</style>
