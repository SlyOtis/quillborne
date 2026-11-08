<script lang="ts">
  import { redirectToLogin } from '$lib/api'
  import {Router, type RouteComponent, type RouteGuard, type Routes} from "sly-svelte-location-router";
  import {onMount, onDestroy} from "svelte";
  import { get } from "svelte/store";
  import { initializeAuth, isAuthenticated, isLoading } from "$lib/stores/auth.store";
  import EffectDefs from "$components/ui/EffectDefs.svelte";
  import Aura from "$components/ui/Aura.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import Search from "$components/search/Search.svelte";
  import Dialogs from "$dialogs/Dialogs.svelte";
  import SoundManager from "$components/SoundManager.svelte";
  import { handleGlobalKeydown } from "$lib/globalEvents";

  const requireSignIn: RouteGuard = async () =>
    get(isAuthenticated) ? null : redirectToLogin();

  function page(name: string, load: () => Promise<unknown>) {
    return async () => {
      try {
        return (await load()) as any;
      } catch (reason) {
        console.error(
          `[quillborne] "${name}" did not load. A stale dev server is the usual cause: stop it and run just dev.`,
          reason
        );
        throw reason;
      }
    };
  }

  const routes: Routes = {
    "/": {
      name: "root",
      component: page("MainPage", () => import("./pages/MainPage.svelte")),
      guard: async () => "/main"
    },
    "/main": {
      name: "main",
      component: page("MainPage", () => import("./pages/MainPage.svelte")),
      guard: requireSignIn
    },
    "/login": "/main",
    "/signup": "/main",
    "/main/create": "/main",
    "/main/create/character": {
      name: "character-create",
      component: page("CharacterCreatePage", () => import("./pages/CharacterCreatePage.svelte")),
      guard: requireSignIn
    },
    "/main/create/character/class": {
      name: "character-class",
      component: page("CharacterClassPage", () => import("./pages/CharacterClassPage.svelte")),
      guard: requireSignIn
    },
    "/main/create/character/race": {
      name: "character-race",
      component: page("CharacterRacePage", () => import("./pages/CharacterRacePage.svelte")),
      guard: requireSignIn
    },
    "/main/sources/:kind/:id": {
      name: "source-view",
      component: page("SourcePage", () => import("./pages/SourcePage.svelte")),
      guard: requireSignIn
    },
    "/main/create/campaign": {
      name: "campaign-create",
      component: page("CampaignCreatePage", () => import("./pages/CampaignCreatePage.svelte")),
      guard: requireSignIn
    },
    "/main/character": "/main/characters",
    "/main/character/:id": {
      name: "character-view",
      component: page("CharacterPage", () => import("./pages/CharacterPage.svelte")),
      guard: requireSignIn
    },
    "/main/user": {
      name: "user",
      component: page("UserPage", () => import("./pages/UserPage.svelte")),
      guard: requireSignIn
    },
    "/main/campaign": "/main/campaigns",
    "/main/campaigns": {
      name: "campaigns-list",
      component: page("CampaignsPage", () => import("./pages/CampaignsPage.svelte")),
      guard: requireSignIn
    },
    "/main/campaign/:id": {
      name: "campaign-view",
      component: page("CampaignPage", () => import("./pages/CampaignPage.svelte")),
      guard: requireSignIn
    },
    "/main/create/party": {
      name: "party-create",
      component: page("PartyCreatePage", () => import("./pages/PartyCreatePage.svelte")),
      guard: requireSignIn
    },
    "/main/party/:id": {
      name: "party-view",
      component: page("PartyPage", () => import("./pages/PartyPage.svelte")),
      guard: requireSignIn
    },
    "/main/vehicle": "/main/vehicles",
    "/main/vehicles": {
      name: "vehicles-list",
      component: page("VehiclesPage", () => import("./pages/VehiclesPage.svelte")),
      guard: requireSignIn
    },
    "/main/campaign/:id/vehicles": {
      name: "campaign-vehicles",
      component: page("VehiclesPage", () => import("./pages/VehiclesPage.svelte")),
      guard: requireSignIn
    },
    "/main/vehicles/:id": {
      name: "vehicle-view",
      component: page("VehiclePage", () => import("./pages/VehiclePage.svelte")),
      guard: requireSignIn
    }
  }

  for (const stop of ["design", "crew", "history", "rules", "papers"]) {
    routes[`/main/vehicles/:id/${stop}`] = {
      name: `vehicle-${stop}`,
      component: page("VehiclePage", () => import("./pages/VehiclePage.svelte")),
      guard: requireSignIn
    }
  }

  const RESOURCE_PAGES: Record<string, { name: string; roll: RouteComponent; one: RouteComponent }> = {
    entries: {
      name: "Entry",
      roll: () => import("./pages/resource/EntryListPage.svelte"),
      one: () => import("./pages/resource/EntryPage.svelte")
    },
    characters: {
      name: "Npc",
      roll: () => import("./pages/resource/NpcListPage.svelte"),
      one: () => import("./pages/resource/NpcPage.svelte")
    },
    heroes: {
      name: "Hero",
      roll: () => import("./pages/resource/HeroListPage.svelte"),
      one: () => import("./pages/resource/HeroPage.svelte")
    },
    items: {
      name: "Item",
      roll: () => import("./pages/resource/ItemListPage.svelte"),
      one: () => import("./pages/resource/ItemPage.svelte")
    },
    weapons: {
      name: "Weapon",
      roll: () => import("./pages/resource/WeaponListPage.svelte"),
      one: () => import("./pages/resource/WeaponPage.svelte")
    },
    armor: {
      name: "Armor",
      roll: () => import("./pages/resource/ArmorListPage.svelte"),
      one: () => import("./pages/resource/ArmorPage.svelte")
    },
    places: {
      name: "Place",
      roll: () => import("./pages/resource/PlaceListPage.svelte"),
      one: () => import("./pages/resource/PlacePage.svelte")
    },
    maps: {
      name: "Map",
      roll: () => import("./pages/resource/MapListPage.svelte"),
      one: () => import("./pages/resource/MapPage.svelte")
    },
    sessions: {
      name: "Session",
      roll: () => import("./pages/resource/SessionListPage.svelte"),
      one: () => import("./pages/resource/SessionPage.svelte")
    },
    quests: {
      name: "Quest",
      roll: () => import("./pages/resource/QuestListPage.svelte"),
      one: () => import("./pages/resource/QuestPage.svelte")
    }
  };

  for (const [kind, held] of Object.entries(RESOURCE_PAGES)) {
    for (const under of [`/main/${kind}`, `/main/campaign/:id/${kind}`]) {
      routes[under] = {
        name: `${kind}-list`,
        component: page(`${held.name}ListPage`, held.roll),
        guard: requireSignIn
      };
      routes[`${under}/:resourceId`] = {
        name: `${kind}-view`,
        component: page(`${held.name}Page`, held.one),
        guard: requireSignIn
      };
    }
  }

  let unsubscribeAuth: (() => void) | null = null;

  onMount(() => {
    unsubscribeAuth = initializeAuth();
  });

  onDestroy(() => {
    if (unsubscribeAuth) {
      unsubscribeAuth();
    }
  });

</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<EffectDefs />
<Search />
<Dialogs />
<SoundManager />

{#if $isLoading}
  <div class="loading-screen">
    <Aura variant="motes" tone="ember" density="thick" />
    <Aura variant="runes" tone="verdigris" />

    <div class="loading-content">
      <img class="loading-mark" src="/favicon.svg" alt="" />
      <h2 class="dnd-heading dnd-heading-hero">Quillborne</h2>
      <span class="loading-rule">
        <Ornament name="divider" tone="metal" />
      </span>
      <p class="dnd-label loading-note">Lighting the braziers</p>
    </div>
  </div>
{:else}
  <svelte:boundary>
    <Router {routes} fallback={() => import("./pages/NotFoundPage.svelte")}>
      <div class="loading-screen">
        <Aura variant="motes" tone="ember" density="thick" />

        <div class="loading-content">
          <img class="loading-mark" src="/favicon.svg" alt="" />
          <span class="loading-rule"><Ornament name="divider" tone="metal" /></span>
          <p class="dnd-label loading-note">Turning the page</p>
        </div>
      </div>
    </Router>

    {#snippet failed(error: unknown, reset: () => void)}
      <div class="page-broke" role="alert">
        <h2 class="dnd-heading">This page did not load</h2>
        <p class="page-broke-text">{error instanceof Error ? error.message : String(error)}</p>
        <p class="page-broke-note">
          If this followed a code change, the dev server is holding a stale module. Stop it and run
          <code>just dev</code> again.
        </p>
        <button type="button" class="page-broke-again" onclick={reset}>Try again</button>
      </div>
    {/snippet}
  </svelte:boundary>
{/if}

<style>
  .loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--backdrop);
    z-index: 9999;
  }

  .loading-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    text-align: center;
    padding: var(--space-7);
  }

  .loading-mark {
    display: block;
    inline-size: clamp(4rem, 12vw, 7rem);
    aspect-ratio: 1;
    margin-bottom: var(--space-2);
    filter: drop-shadow(0 0 1.5rem var(--ember-glow));
  }

  .loading-rule {
    display: block;
    width: min(21.25rem, 70vw);
  }

  .loading-note {
    margin: 0;
    color: var(--ink-dim);
    font-style: italic;
    text-shadow: 0 1px 0 #000;
  }

  .page-broke {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    max-width: 70ch;
    margin: var(--space-8) auto;
    padding: var(--space-6);
    border: none;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--state-bad) 16%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .page-broke-text {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .page-broke-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .page-broke-again {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up), var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
    cursor: pointer;
  }

  .page-broke-again:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    filter: brightness(1.1);
  }

  .page-broke-again:active {
    filter: brightness(0.85);
  }
</style>
