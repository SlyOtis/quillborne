<script lang="ts">
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import type { CharacterContext } from '$lib/types'
  import type { RulesState } from '$lib/rules/store'
  import { postShortRest } from '$lib/engine'
  import BaseDialog from './BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'

  let { isOpen = $bindable(false) }: {
    /** Whether the dialog is showing. */
    isOpen: boolean
  } = $props()

  const { info } = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let dice = $state(1)
  let resting = $state(false)

  const hitDice = $derived($rules.resolved?.pools.find((pool) => pool.id === 'hitDice'))
  const remaining = $derived(hitDice?.remaining ?? 0)
  const die = $derived($info.class?.hitDice?.die || 8)

  async function rest() {
    if (!$rules.resolved) return
    resting = true
    try {
      await postShortRest(dice, $rules.resolved)
      isOpen = false
    } finally {
      resting = false
    }
  }
</script>

<BaseDialog bind:isOpen title="Short rest" width="420px" zIndex={9999}>
  <div class="dnd-shortrest">
    <p class="dnd-shortrest-note">
      Choose how many hit dice to roll for the rest. {remaining} of {hitDice?.max ?? 0} d{die} left.
    </p>

    <Field label="Hit dice to spend" id="shortrest-dice" help="Zero rests without rolling a die.">
      <input id="shortrest-dice" class="dnd-num" type="number" min="0" max={remaining} bind:value={dice} />
    </Field>

    <div class="dnd-shortrest-acts">
      <Button variant="ghost" size="sm" onclick={() => (isOpen = false)}>Cancel</Button>
      <Button variant="primary" size="sm" loading={resting} disabled={!$rules.resolved} onclick={rest}>Rest</Button>
    </div>
  </div>
</BaseDialog>

<style>
  .dnd-shortrest {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .dnd-shortrest-note {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink-dim);
  }

  .dnd-shortrest-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
