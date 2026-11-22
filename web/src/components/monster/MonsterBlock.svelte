<script lang="ts">
  import type { Monster } from '$lib/api/types'
  import { getInline, type Marks } from '$lib/blocks'
  import { rollAttack, rollDamage } from '$lib/engine'
  import { getEntryName, getHitDice, getMonsterAction, getMonsterBlock, getMonsterStats, getSigned } from '$lib/rules/monster'
  import type { MonsterFeature, MonsterFeatureKind, MonsterRoll, MonsterSystem } from '$lib/rules/monster.types'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'

  const {
    system,
    monster,
    layout = 'full',
    rolls = false
  }: {
    /** The monster system every word and figure on the block is taken from. */
    system: MonsterSystem
    /** The monster drawn, as stored or as the builder holds it. */
    monster: Pick<Monster, 'name' | 'size' | 'type' | 'alignment' | 'challenge' | 'stats'>
    /** Full draws every line of the block; compact leaves out the hit points and the languages and writes the abilities on one line, for a fight. */
    layout?: 'full' | 'compact'
    /** Draws a button for every to-hit and damage roll of a feature, written to the roll log. */
    rolls?: boolean
  } = $props()

  const stats = $derived(getMonsterStats(system, monster.stats))
  const block = $derived(getMonsterBlock(system, monster))
  const words = $derived(system.labels)
  const compact = $derived(layout === 'compact')
  const proficient = $derived(system.tiers.find((one) => one.value === 1)?.name ?? '')
  const half = $derived(Math.ceil(block.abilities.length / 2))
  const tables = $derived([block.abilities.slice(0, half), block.abilities.slice(half)])
  const kin = $derived(stats.subtypes.length ? `${block.type} (${stats.subtypes.join(', ')})` : block.type)
  const speeds = $derived(block.speeds.map((one) => `${one.name} ${one.value} ${system.distance}`).join(', '))
  const senses = $derived(block.senses.map((one) => `${one.name} ${one.value} ${system.distance}`).join(', '))
  const defences = $derived(
    [
      { label: words.vulnerabilities, names: block.vulnerabilities },
      { label: words.resistances, names: block.resistances },
      { label: words.immunities, names: block.immunities },
      { label: words.conditionImmunities, names: block.conditionImmunities }
    ].filter((one) => one.names.length > 0)
  )
  const sections = $derived(system.features.filter((kind) => (stats.features[kind.id] ?? []).length > 0))

  function getDice(roll: MonsterRoll): string {
    const dice = `${roll.dice}d${roll.die}`
    return roll.flat ? `${dice} ${roll.flat < 0 ? '-' : '+'} ${Math.abs(roll.flat)}` : dice
  }

  function getHit(roll: MonsterRoll): string {
    return roll.dice > 0 ? `${roll.average} (${getDice(roll)}) ${roll.type} ${words.damage}` : `${roll.flat} ${roll.type} ${words.damage}`
  }

  function getHits(hits: MonsterRoll[]): string {
    return hits.map(getHit).join(` ${words.plus} `)
  }

  function getSuffix(kind: MonsterFeatureKind, feature: MonsterFeature): string {
    const marks = [
      feature.recharge ? `${words.recharge} ${feature.recharge < system.rechargeDie ? `${feature.recharge}\u2013${system.rechargeDie}` : feature.recharge}` : '',
      feature.uses ? `${feature.uses}${words.perDay}` : '',
      kind.legendary && (feature.cost ?? 1) > 1 ? `${words.costs} ${feature.cost} ${words.actions}` : ''
    ].filter(Boolean)
    return marks.length ? ` (${marks.join('; ')})` : ''
  }

  function getAttackLine(feature: MonsterFeature, figure: number): { lead: string; rest: string } {
    const attack = feature.attack
    if (!attack) return { lead: '', rest: '' }
    const reach = attack.reach > 0 ? `${words.reach} ${attack.reach} ${system.distance}` : ''
    const range = attack.range > 0 ? `${words.range} ${attack.range}${attack.long_range > attack.range ? `/${attack.long_range}` : ''} ${system.distance}` : ''
    const reaches = [reach, range].filter(Boolean).join(` ${words.or} `)
    return { lead: reach && range ? words.meleeOrRanged : range ? words.ranged : words.melee, rest: `${getSigned(figure)}${reaches ? `, ${reaches}` : ''}.` }
  }

  function getSaveLine(feature: MonsterFeature, dc: number): { lead: string; rest: string } {
    const save = feature.save
    if (!save) return { lead: '', rest: '' }
    return { lead: `${getEntryName(system.abilities, save.ability)} ${words.savingThrow}`, rest: `${words.dc} ${dc}${save.area ? `, ${save.area}` : ''}.` }
  }
</script>

{#snippet marked(text: string, marks: Marks | undefined)}
  {#if marks?.italic}
    <em>{@render marked(text, { ...marks, italic: false })}</em>
  {:else if marks?.bold}
    <strong>{@render marked(text, { ...marks, bold: false })}</strong>
  {:else}{text}{/if}
{/snippet}

{#snippet prose(text: string)}
  {#each getInline(text) as run, index (index)}
    {#if 'ref' in run && run.ref === 'break'}
      <br />
    {:else if 'ref' in run}
      {run.mark}{run.label}
    {:else}
      {@render marked(run.text, run.marks)}
    {/if}
  {/each}
{/snippet}

{#snippet roll(title: string, word: string, onclick: () => void)}
  <Button variant="secondary" size="sm" {title} label={title} {onclick}>{word}</Button>
{/snippet}

{#snippet feat(kind: MonsterFeatureKind, feature: MonsterFeature)}
  {@const action = getMonsterAction(system, block, feature)}
  {@const named = `${monster.name} ${feature.name}`}
  <p class="dnd-monster-feat">
    <b>{feature.name}{getSuffix(kind, feature)}.</b>
    {#if action.attack !== null}
      {@const line = getAttackLine(feature, action.attack)}
      <i>{line.lead}:</i> {line.rest}
      <i>{words.hit}:</i>
      {getHits(action.hit)}{action.hit.length ? '.' : ''}
    {/if}
    {#if action.dc !== null}
      {@const line = getSaveLine(feature, action.dc)}
      <i>{line.lead}:</i> {line.rest}
      {#if action.failure.length}<i>{words.failure}:</i> {getHits(action.failure)}.{/if}
      {#if feature.save?.half}<i>{words.success}:</i> {words.half}{/if}
    {/if}
    {@render prose(feature.text)}
  </p>
  {#if rolls && (action.attack !== null || action.hit.length || action.failure.length)}
    <div class="dnd-monster-rolls">
      {#if action.attack !== null}
        {@const bonus = action.attack}
        {@render roll(`Roll ${feature.name} to hit`, getSigned(bonus), () => void rollAttack(named, bonus))}
      {/if}
      {#each [...action.hit, ...action.failure].filter((one) => one.dice > 0) as one, index (index)}
        {@render roll(`Roll ${feature.name} ${one.type} damage`, `${getDice(one)} ${one.type}`, () => void rollDamage(named, one.die, one.dice, one.flat))}
      {/each}
    </div>
  {/if}
{/snippet}

<article class="dnd-monster" class:dnd-monster-compact={compact} aria-label={monster.name}>
  <div class="dnd-monster-flow" class:dnd-monster-flow-split={sections.length > 0}>
    <div class="dnd-monster-top">
      <header class="dnd-monster-head">
        <h2 class="dnd-monster-name">{monster.name}</h2>
        <span class="dnd-monster-rule" aria-hidden="true"></span>
        <p class="dnd-monster-kin">{block.size} {kin}, {block.alignment}</p>
        {#if block.flags.length}
          <p class="dnd-monster-flags">
            {#each block.flags as flag (flag)}<Chip still>{flag}</Chip>{/each}
          </p>
        {/if}
      </header>

      <p class="dnd-monster-line dnd-monster-pair">
        <span>
          <b>{words.armorClass}</b>
          {stats.ac}{#if stats.ac_note}{' '}<span class="dnd-monster-aside">({stats.ac_note})</span>{/if}
        </span>
        <span><b>{words.initiative}</b> {getSigned(block.initiative)} ({block.initiativeScore})</span>
      </p>
      {#if !compact}
        <p class="dnd-monster-line"><b>{words.hitPoints}</b> {block.hitPoints} ({getHitDice(stats.hit_dice, block)})</p>
      {/if}
      <p class="dnd-monster-line"><b>{words.speed}</b> {speeds || `0 ${system.distance}`}</p>

      {#if compact}
        <p class="dnd-monster-line">
          {#each block.abilities as ability (ability.id)}
            <span class="dnd-monster-score">
              <b><abbr title={ability.name}>{ability.short}</abbr></b>
              {getSigned(ability.mod)}{#if ability.proficient}{' '}({words.save} {getSigned(ability.save)}){/if}
            </span>
          {/each}
        </p>
      {:else}
      <div class="dnd-monster-abilities">
        {#each tables as table, place (place)}
          <table class="dnd-monster-scores">
            <thead>
              <tr>
                <td></td>
                <td></td>
                <th scope="col">{words.modifier}</th>
                <th scope="col">{words.save}</th>
              </tr>
            </thead>
            <tbody>
              {#each table as ability (ability.id)}
                <tr>
                  <th scope="row"><abbr title={ability.name}>{ability.short}</abbr></th>
                  <td>{ability.score}</td>
                  <td>{getSigned(ability.mod)}</td>
                  <td class:dnd-monster-lit={ability.proficient}>
                    {#if ability.proficient}<span class="dnd-monster-mark" role="img" aria-label={proficient} title={proficient}></span>{/if}
                    {getSigned(ability.save)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/each}
      </div>
      {/if}

      {#if block.skills.length}
        <p class="dnd-monster-line">
          <b>{words.skills}</b>
          {block.skills.map((one) => `${one.name} ${getSigned(one.value)}`).join(', ')}
        </p>
      {/if}
      {#each defences as one (one.label)}
        <p class="dnd-monster-line"><b>{one.label}</b> {one.names.join(', ')}</p>
      {/each}
      <p class="dnd-monster-line">
        <b>{words.senses}</b>
        {senses ? `${senses}; ` : ''}{words.passivePerception} {block.passivePerception}
      </p>
      {#if !compact}
        <p class="dnd-monster-line"><b>{words.languages}</b> {block.languages.join(', ') || words.none}</p>
      {/if}
      <p class="dnd-monster-line">
        <b>{words.challenge}</b>
        {block.challenge?.name ?? ''} ({words.experience} {(block.challenge?.xp ?? 0).toLocaleString('en-US')}; {words.proficiency} {getSigned(block.prof)})
      </p>
    </div>

    {#each sections as kind (kind.id)}
      <section class="dnd-monster-part" aria-label={kind.name}>
        <div class="dnd-monster-lead">
          <h3 class="dnd-monster-part-name">{kind.name}</h3>
          <span class="dnd-monster-rule" aria-hidden="true"></span>
          {#if kind.legendary && stats.legendary_uses}
            <p class="dnd-monster-feat">
              <b>{words.legendaryUses}:</b>
              {stats.legendary_uses}{#if stats.legendary_lair_uses}{' '}({stats.legendary_lair_uses} {words.inLair}){/if}.
            </p>
          {/if}
          {@render feat(kind, stats.features[kind.id][0])}
        </div>
        {#each stats.features[kind.id].slice(1) as feature, index (index)}
          {@render feat(kind, feature)}
        {/each}
      </section>
    {/each}
  </div>
</article>

<style>
  .dnd-monster {
    container-type: inline-size;
    min-width: 0;
    padding: var(--space-4) var(--space-5) var(--space-5);
    border-radius: var(--radius-lg);
    background:
      radial-gradient(ellipse 70% 30% at 50% 0%, color-mix(in srgb, var(--ember) 6%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-sm);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .dnd-monster-flow {
    min-width: 0;
  }

  .dnd-monster-top {
    break-inside: avoid;
  }

  .dnd-monster-head {
    display: grid;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
    break-inside: avoid;
  }

  .dnd-monster-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-caps: small-caps;
    letter-spacing: var(--tracking-wide);
    line-height: 1.15;
    overflow-wrap: break-word;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 10px color-mix(in srgb, var(--ember-glow) 50%, transparent);
  }

  .dnd-monster-rule {
    display: block;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 45%, transparent);
    box-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-monster-kin {
    margin: var(--space-1) 0 0;
    font-style: italic;
    color: var(--ink-dim);
  }

  .dnd-monster-flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) 0 0;
  }

  .dnd-monster-line {
    margin: 0 0 var(--space-1);
    padding-inline-start: var(--space-4);
    text-indent: calc(var(--space-4) * -1);
    break-inside: avoid;
  }

  .dnd-monster-line b {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-monster-pair {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-5);
    text-indent: 0;
    padding-inline-start: 0;
  }

  .dnd-monster-aside {
    color: var(--ink-dim);
  }

  .dnd-monster-abilities {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin: var(--space-3) 0;
    break-inside: avoid;
  }

  .dnd-monster-scores {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 var(--space-0);
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .dnd-monster-scores th,
  .dnd-monster-scores td {
    padding: var(--space-0) var(--space-2);
  }

  .dnd-monster-scores thead th {
    padding-block: 0;
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-monster-scores tbody th,
  .dnd-monster-scores tbody td {
    background: color-mix(in srgb, var(--ground-lift) 55%, transparent);
    box-shadow: inset 0 1px 0 var(--sheen-soft), inset 0 -1px 0 var(--shadow-ink);
  }

  .dnd-monster-scores tbody th {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    text-align: start;
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-monster-scores tbody td:last-child {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .dnd-monster-scores abbr {
    text-decoration: none;
  }

  .dnd-monster-lit {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-monster-mark {
    display: inline-block;
    width: 0.38em;
    height: 0.38em;
    margin-inline-end: var(--space-1);
    vertical-align: 0.12em;
    transform: rotate(45deg);
    background: linear-gradient(135deg, var(--metal-bright), var(--metal-dim));
    box-shadow: 0 0 0 1px var(--keyline), 0 0 6px var(--ember-glow);
  }

  .dnd-monster-part {
    min-width: 0;
  }

  .dnd-monster-lead {
    break-inside: avoid;
  }

  .dnd-monster-part-name {
    margin: var(--space-4) 0 var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    line-height: 1.2;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 10px color-mix(in srgb, var(--ember-glow) 50%, transparent);
  }

  .dnd-monster-lead .dnd-monster-rule {
    margin-bottom: var(--space-2);
  }

  .dnd-monster-feat {
    margin: 0 0 var(--space-2);
    break-inside: avoid;
  }

  .dnd-monster-feat b {
    font-style: italic;
    font-weight: 700;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-monster-feat i {
    color: var(--ink-dim);
  }

  .dnd-monster-rolls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0 0 var(--space-2);
    break-inside: avoid;
  }

  .dnd-monster-score {
    display: inline-block;
    margin-inline-end: var(--space-3);
    text-indent: 0;
  }

  .dnd-monster-score abbr {
    text-decoration: none;
  }

  .dnd-monster-compact {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  @container (max-width: 30rem) {
    .dnd-monster-abilities {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
    }

    .dnd-monster-abilities .dnd-monster-scores + .dnd-monster-scores thead {
      display: none;
    }
  }

  @container (min-width: 46rem) {
    .dnd-monster-flow-split {
      columns: 2;
      column-gap: var(--space-6);
      column-rule: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 45%, transparent);
    }
  }
</style>
