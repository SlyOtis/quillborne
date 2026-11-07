<script lang="ts">
  import type { Snippet } from 'svelte'
  import Field from '$components/ui/Field.svelte'

  const {
    label,
    value,
    min,
    max,
    step = 1,
    unit = '',
    placeholder = 'Mixed',
    onchange,
    action
  }: {
    /** What the number is, written above the control. */
    label: string
    /** The number shown, null when several things disagree. */
    value: number | null
    /** The least the number may be. */
    min: number
    /** The most the number may be. */
    max: number
    /** How far one arrow press moves it. */
    step?: number
    /** The unit written after the label. */
    unit?: string
    /** What an empty field reads when the number is not one value. */
    placeholder?: string
    /** Runs with the typed number, held within the limits, when it is committed. */
    onchange: (value: number) => void
    /** A button set beside the number, on its row. */
    action?: Snippet
  } = $props()

  const id = $props.id()

  const commit = (input: HTMLInputElement) => {
    const typed = input.value.trim().replace(',', '.')
    const n = Number(typed)
    if (!typed || !Number.isFinite(n)) {
      input.value = value === null ? '' : String(value)
      return
    }
    const next = Math.min(max, Math.max(min, n))
    input.value = String(next)
    if (next !== value) onchange(next)
  }
</script>

<Field label={unit ? `${label} (${unit})` : label} {id} {action}>
  <input
    {id}
    type="number"
    inputmode="decimal"
    {min}
    {max}
    {step}
    value={value ?? ''}
    placeholder={value === null ? placeholder : ''}
    onchange={e => commit(e.currentTarget)}
    onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()}
  />
</Field>
