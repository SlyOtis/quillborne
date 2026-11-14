<script lang="ts">
  import type {CharacterContext} from "$lib/types";
  import {getContext} from "svelte";
  import Pool from "$components/ui/Pool.svelte";

  const {special} = getContext<CharacterContext>('character')

  function putCurrent(current: number) {
    special.update(curr => ({...curr, current}))
  }
</script>

<Pool title={$special.name} note={$special.regain} max={$special.max} current={$special.current} view="pips" onput={putCurrent} />
