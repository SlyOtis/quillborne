<script lang="ts">
  import { AUTO, MIXED, type Field as InspectorField, type FieldValue } from '$lib/nimap'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import NumberField from './NumberField.svelte'

  const {
    field,
    onchange
  }: {
    /** One field of the inspector, drawn by its control's type. */
    field: InspectorField
    /** Runs with the new value, for the caller to turn into an edit through the field. */
    onchange: (value: FieldValue) => void
  } = $props()

  const id = $props.id()
  const mixed = $derived(field.value === MIXED)
  const control = $derived(field.control)
  const shown = $derived(mixed ? '' : String(field.value))
  const options = $derived(control.type === 'choice' || control.type === 'segment' || control.type === 'tiles' ? control.options : [])
</script>

{#if control.type === 'number'}
  <NumberField label={field.label} value={mixed ? null : (field.value as number)} min={control.min} max={control.max} step={control.step} unit={control.unit} {onchange} />
{:else if control.type === 'count'}
  <NumberField
    label={field.label}
    value={typeof field.value === 'number' ? field.value : null}
    min={control.min}
    max={control.max}
    unit={control.unit}
    placeholder={field.value === AUTO ? (control.auto ?? 'Auto') : 'Mixed'}
    {onchange}
  >
    {#snippet action()}
      <Button size="sm" variant={field.value === AUTO ? 'primary' : 'ghost'} disabled={field.value === AUTO} onclick={() => onchange(AUTO)}>{control.auto ?? 'Auto'}</Button>
    {/snippet}
  </NumberField>
{:else if control.type === 'text'}
  <Field label={field.label} {id}>
    <input {id} type="text" value={shown} placeholder={mixed ? 'Mixed' : control.placeholder} onchange={e => onchange(e.currentTarget.value)} />
  </Field>
{:else if control.type === 'toggle'}
  <label class="dnd-field-control">
    <input type="checkbox" checked={field.value === true} indeterminate={mixed} onchange={e => onchange(e.currentTarget.checked)} />
    <span>{field.label}</span>
  </label>
{:else}
  <Field label={field.label} {id}>
    <select {id} value={shown} onchange={e => onchange(e.currentTarget.value)}>
      {#if mixed}
        <option value="" disabled>Mixed</option>
      {/if}
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </Field>
{/if}

<style>
  .dnd-field-control {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
