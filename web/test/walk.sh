#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

base="${WALK_BASE:-http://localhost:$((5173 + ${SERVER_PORT:-4290} - 4290))}"
[ -n "$(sed -n 's/^SAUTH_DEBUG_USER_ID=//p' ../.env)" ] || { echo "SAUTH_DEBUG_USER_ID is empty in .env: the walk signs in as the debug user"; exit 1; }
curl -sf -o /dev/null "$base/" || { echo "nothing answers at $base: run just dev first"; exit 1; }

failures=()
page=""

pw() { playwright-cli -s=walk --raw "$@" 2>/dev/null; }
js() {
  local out
  if ! out="$(pw eval "$1")"; then
    echo "playwright-cli: $out" >&2
    kill -s TERM $$
  fi
  jq -r . <<<"$out"
}
fail() { failures+=("$page: $1"); echo "FAIL $page: $1"; }

wait_for() {
  local tries=0
  until [ "$(js "$1")" = "true" ]; do
    tries=$((tries + 1))
    [ "$tries" -ge 60 ] && { fail "timed out waiting for $2"; return 1; }
    sleep 0.5
  done
}

search_open() { js "document.querySelector('#search-command') !== null"; }

expect_search() {
  local want="$1" after="$2" tries=0
  until [ "$(search_open)" = "$want" ]; do
    tries=$((tries + 1))
    [ "$tries" -ge 10 ] && { fail "search dialog open=$(search_open) after $after, wanted $want"; return 1; }
    sleep 0.2
  done
}

check_page() {
  local bar="$1" summary errors warnings w over
  summary="$(pw console | head -1)"
  errors="$(sed -E 's/.*Errors: ([0-9]+).*/\1/' <<<"$summary")"
  warnings="$(sed -E 's/.*Warnings: ([0-9]+).*/\1/' <<<"$summary")"
  if [ "${errors:-0}" != "0" ] || [ "${warnings:-0}" != "0" ]; then
    fail "console carries $errors errors and $warnings warnings"
    pw console warning | sed -n '/^\[/p' | sed 's/^/    /'
  fi
  for w in 360 640 900 1280 1600 2000; do
    pw resize "$w" 900 >/dev/null
    over="$(js "Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")"
    [ "$over" -gt 0 ] && fail "document is ${over}px wider than the viewport at $w"
  done
  pw resize 1600 900 >/dev/null
  if [ "$bar" = "out" ]; then
    pw press Meta+k >/dev/null; expect_search false "Cmd K while signed out"
    return 0
  fi
  pw press Meta+k >/dev/null; expect_search true "Cmd K"
  pw press Meta+k >/dev/null; expect_search false "a second Cmd K"
  pw press Meta+k >/dev/null; expect_search true "Cmd K"
  pw press Escape >/dev/null; expect_search false "Escape"
  [ "$bar" = "bar" ] || return 0
  pw click "getByTitle('Toggle the menu')" >/dev/null
  wait_for "document.querySelector('.dnd-shell-menu-open .dnd-menu-search') !== null" "the search item at the top of the drawer"
  pw click "locator('.dnd-menu-search')" >/dev/null
  expect_search true "the drawer search item"
  pw press Escape >/dev/null; expect_search false "Escape on the drawer search"
  pw click "getByTitle('Toggle the menu')" >/dev/null
  wait_for "document.querySelector('.dnd-shell-menu-open') === null" "the drawer to close after the search"
}

visit() {
  page="$1"
  pw goto "$base$1" >/dev/null
  wait_for "$2" "$3" || return 1
  local at
  at="$(js "location.pathname")"
  [ "$at" = "$1" ] || { fail "landed on $at"; return 1; }
}

first_href() { js "document.querySelector('$1')?.getAttribute('href') ?? ''"; }

trap 'pw close >/dev/null' EXIT
pw open "$base/main" >/dev/null

hearth="document.querySelector('.hall-hero-name') !== null && document.querySelector('.dnd-loading') === null"
page="sign in"
pw goto "$base/main" >/dev/null
wait_for "$hearth" "the hearth as the debug user"
[ "$(js "$hearth")" = "true" ] || { echo "the debug user did not reach the hearth at $(js "location.href")"; exit 1; }
landed="$(js "location.pathname")"
case "$landed" in
  /|/main) ;;
  *) fail "sign in landed on $landed, neither the hearth nor its alias" ;;
esac

visit /main "$hearth" "the hearth" && check_page bar
page="/main at 1280 and 1600"
for w in 1280 1600; do
  pw resize "$w" 900 >/dev/null
  wait_for "document.querySelectorAll('.hall-grid .hall-plot').length === 2 && document.querySelector('.hall-grid .dnd-loading') === null" "the two hearth regions at $w" || continue
  [ "$(js "document.querySelector('.hall-grid .hall-hero .hall-hero-name') !== null")" = "true" ] || fail "no hero over the regions at $w"
  regions="$(js "[...document.querySelectorAll('.hall-grid .hall-plot')].map((e) => e.getAttribute('aria-label')).join(',')")"
  [ "$regions" = "Campaigns,Characters" ] || fail "the hearth regions are $regions at $w"
  plates="$(js "document.querySelectorAll('.hall-grid .dnd-panelbox-head, .hall-grid .dnd-rail-head, .hall-grid .dnd-rail-step').length")"
  [ "$plates" = "0" ] || fail "$plates header plates, rail heads or step arrows stand on the hearth at $w"
  gone="$(js "[...document.querySelectorAll('.hall-grid [aria-label]')].map((e) => e.getAttribute('aria-label')).filter((n) => /^(Party|Parties|Cast|Catalog)$/.test(n)).join(',')")"
  [ -z "$gone" ] || fail "the hearth still carries $gone at $w"
  laid="$(js "(() => { const g = document.querySelector('.hall-grid').getBoundingClientRect(); const c = document.querySelector('.hall-plot-camps').getBoundingClientRect(); const r = document.querySelector('.hall-plot-roll').getBoundingClientRect(); const wide = [c, r].every((e) => Math.abs(e.left - g.left) < 1 && Math.abs(e.right - g.right) < 1); const under = c.bottom <= r.top; return (wide ? 'wide' : 'narrow') + ':' + (under ? 'stacked' : 'shuffled') })()")"
  [ "${laid%%:*}" = "wide" ] || fail "campaigns and characters do not span the hearth's width at $w"
  [ "${laid##*:}" = "stacked" ] || fail "campaigns and characters do not stack in that order at $w"
  [ "$(js "document.querySelector('.hall-grid .hall-plot-friends') === null")" = "true" ] || fail "the hearth still carries a friends column at $w"
  over="$(js "Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")"
  [ "$over" -le 0 ] || fail "the hearth is ${over}px wider than the viewport at $w"
  wide="$(js "[...document.querySelector('.hall-grid').querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return (s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth }).length")"
  [ "$wide" = "0" ] || fail "$wide elements inside the hearth scroll sideways at $w"
  inner="$(js "[...document.querySelector('.hall-grid').querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight }).length")"
  [ "$inner" = "0" ] || fail "$inner elements inside the hearth scroll within their cell at $w"
  clipped="$(js "(() => { const scroll = document.querySelector('.dnd-shell-scroll'); return [...document.querySelectorAll('.hall-grid .dnd-card')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.bottom > scroll.scrollHeight + scroll.getBoundingClientRect().top - scroll.scrollTop + 1 }).length })()")"
  [ "$clipped" = "0" ] || fail "$clipped cards on the hearth cannot be reached by the page's own scroll at $w"
  tall="$(js "(() => { const scroll = document.querySelector('.dnd-shell-scroll'); return String(Math.ceil(scroll.scrollHeight + scroll.getBoundingClientRect().top)) })()")"
  pw resize "$w" "$tall" >/dev/null
  pw screenshot ".hall-grid" --filename=".playwright-cli/hearth-$w.png" >/dev/null
  pw resize "$w" 900 >/dev/null
done
pw resize 1600 900 >/dev/null

page="party in the chat"
pw click "getByTitle('Toggle the chat')" >/dev/null
if wait_for "document.querySelector('.dnd-shell-chat-open .dnd-sidebar-end [role=tablist]') !== null" "the chat panel with its tabs"; then
  tabs="$(js "[...document.querySelectorAll('.dnd-sidebar-end [role=tab]')].map((e) => e.textContent.trim().split(/\\s/)[0]).join(',')")"
  [ "$tabs" = "Chat,Party" ] || fail "the drawer tabs are $tabs, not Chat,Party"
  js "[...document.querySelectorAll('.dnd-sidebar-end [role=tab]')].find((e) => e.textContent.trim().startsWith('Party')).click() ?? null" >/dev/null
  wait_for "document.querySelector('.dnd-sidebar-end [role=tab][aria-selected=\"true\"]')?.textContent.trim().startsWith('Party') && document.querySelector('.dnd-sidebar-end .dnd-loading') === null" "the party tab to open"
  [ "$(js "document.querySelector('.dnd-sidebar-end .dnd-card') !== null || document.querySelector('.dnd-sidebar-end .dnd-empty') !== null")" = "true" ] || fail "the party list shows neither a friend nor its empty state"
  [ "$(js "document.querySelector('.dnd-sidebar-end #friend-address') !== null && [...document.querySelectorAll('.dnd-sidebar-end .dnd-button')].some((e) => e.textContent.trim() === 'Add')")" = "true" ] || fail "the party tab carries no add-a-friend field with its Add button"
  js "[...document.querySelectorAll('.dnd-sidebar-end [role=tab]')].find((e) => e.textContent.trim().startsWith('Chat')).click() ?? null" >/dev/null
  wait_for "document.querySelector('.dnd-sidebar-end textarea') !== null" "the chat tab to return"
  pw click "getByTitle('Toggle the menu')" >/dev/null
  wait_for "document.querySelector('.dnd-shell-menu-open') !== null && document.querySelector('.dnd-shell-chat-open') === null" "the menu to open and the chat to close"
  pw click "getByTitle('Toggle the chat')" >/dev/null
  wait_for "document.querySelector('.dnd-shell-chat-open') !== null && document.querySelector('.dnd-shell-menu-open') === null" "the chat to open and the menu to close"
  pw click "getByTitle('Toggle the chat')" >/dev/null
  wait_for "document.querySelector('.dnd-shell-chat-open') === null" "the chat drawer to close"
fi

page="encounter tracker"
campaign_id="$(js "(async () => { const { userCampaigns } = await import('/src/lib/stores/campaign.store.ts'); const { user } = await import('/src/lib/stores/auth.store.ts'); let held = []; let me = null; userCampaigns.subscribe((entries) => (held = entries))(); user.subscribe((one) => (me = one))(); return held.find((one) => one.dm_id === me?.user_id)?.id ?? '' })()")"
if [ -z "$campaign_id" ]; then
  fail "no campaign the debug player runs to track an encounter in"
else
  rows="[...document.querySelectorAll('.fray-row')]"
  pw goto "$base/main/campaign/$campaign_id?tab=encounter" >/dev/null
  wait_for "document.querySelector('.fray') !== null && document.querySelector('.dnd-loading') === null" "the encounter tab"
  encounter_id="$(js "(async () => { const { postCampaignEncounter } = await import('/src/lib/api/index.ts'); return postCampaignEncounter('$campaign_id', { title: 'Walk Ambush', is_active: true, is_known: true, round: 3, turn: 1, combatants: [{ id: 'w1', name: 'Goblin Cutter', kind: 'npc', npc_id: 'w-n1', initiative: 8, hit_points: 5, max_hit_points: 12, conditions: ['prone'], is_hit_points_known: true }, { id: 'w2', name: 'Walk Hero', kind: 'character', character_id: 'w-c1', initiative: 17, hit_points: 22, max_hit_points: 30, conditions: [], is_hit_points_known: true }, { id: 'w3', name: 'Dire Wolf', kind: 'npc', npc_id: 'w-n2', initiative: 12, hit_points: 9, max_hit_points: 26, conditions: [], is_hit_points_known: true }] }) })()")"
  wait_for "document.querySelector('#fray-chosen option[value=\"$encounter_id\"]') !== null" "the new encounter in the picker"
  js "(() => { const pick = document.querySelector('#fray-chosen'); pick.value = '$encounter_id'; pick.dispatchEvent(new Event('change', { bubbles: true })); return true })()" >/dev/null
  if wait_for "$rows.length === 3 && document.querySelector('.fray').textContent.includes('Walk Ambush')" "the combatants to stream into the tracker"; then
    order="$(js "$rows.map((e) => e.querySelector('.fray-initiative').textContent.trim()).join(',')")"
    [ "$order" = "17,12,8" ] || fail "the combatants stand in $order, not in initiative order 17,12,8"
    current="$(js "String($rows.findIndex((e) => e.getAttribute('aria-current') === 'step'))")"
    [ "$current" = "1" ] || fail "turn 1 of the round points at row $current, not at the second in initiative order"
    [ "$(js "document.querySelector('.fray').textContent.includes('Walk Ambush')")" = "true" ] || fail "the tracker does not name the encounter it lists"
    [ "$(js "document.querySelector('.fray').textContent.includes('Round 3')")" = "true" ] || fail "the tracker does not show round 3"
  fi
  js "(async () => { const { deleteCampaignEncounter } = await import('/src/lib/api/index.ts'); await deleteCampaignEncounter('$campaign_id', '$encounter_id'); return true })()" >/dev/null
  wait_for "!document.querySelector('.fray').textContent.includes('Walk Ambush')" "the struck encounter to leave the tracker"
fi

page="/main"
pw goto "$base/main" >/dev/null
wait_for "document.querySelector('.hall-plot-roll .dnd-card .dnd-card-title') !== null" "a character on the hearth"
hero="$(js "document.querySelector('.hall-plot-roll .dnd-card .dnd-card-title').textContent.trim()")"
js "document.querySelector('.hall-plot-roll .dnd-card').click() ?? null" >/dev/null
wait_for "location.pathname.startsWith('/main/character/')" "the character sheet"
sheet="$(js "location.pathname")"
campaign_card="document.querySelector('section[aria-label=\"Campaigns\"] .dnd-card')"

if visit "$sheet" "document.querySelector('.sheet-name')?.textContent.trim() === '$hero'" "$hero's sheet"; then
  check_page bar
  crown_pickers="$(js "document.querySelector('.sheet-crown').querySelectorAll('select, .trace, [aria-pressed]').length")"
  [ "$crown_pickers" = "0" ] || fail "the crown carries $crown_pickers frame picker controls"
  crown_names="$(js "/\b(Lancet|Ogee|Trefoil|Shield|Round)\b/.test(document.querySelector('.sheet-crown').textContent)")"
  [ "$crown_names" = "false" ] || fail "the crown names a frame"
  boxes="$(js "document.querySelectorAll('.sheet-slots > *').length")"
  [ "$boxes" -ge 5 ] || fail "the stat slots carry only $boxes boxes"
  strip="$(js "/defen[cs]es/i.test(document.querySelector('.sheet-grid')?.textContent ?? '')")"
  [ "$strip" = "true" ] || fail "the defences block does not stand in the sheet grid"
  for w in 1280 1600 2000; do
    pw resize "$w" 900 >/dev/null
    spill="$(js "[...document.querySelectorAll('.sheet-slots *')].filter((e) => e.children.length === 0 && e.textContent.trim() && (() => { const b = e.closest('.sheet-slots > *').getBoundingClientRect(), r = e.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 })()).map((e) => e.textContent.trim()).join(', ')")"
    [ -z "$spill" ] || fail "the stat titles run outside their boxes at $w: $spill"
    short="$(js "String(Math.round(document.querySelector('.sheet-grid').getBoundingClientRect().right - document.querySelector('.sheet-tabs').getBoundingClientRect().right))")"
    [ "$short" = "0" ] || fail "the tabs panel stops ${short}px short of the grid's right edge at $w"
  done
  pw resize 1600 900 >/dev/null
  pw click "getByTitle('Choose the portrait frame')" >/dev/null
  wait_for "document.querySelector('#dialog-title')?.textContent.trim() === 'Choose Your Frame'" "the frame dialog after clicking the portrait"
  crown_clip="document.querySelector('.sheet-crown .dnd-portrait-glass').getAttribute('style')"
  taken="$(js "document.querySelector('.trace-lit .trace-name').textContent.trim()")"
  worn="$(js "$crown_clip")"
  js "[...document.querySelectorAll('.trace')].find((e) => !e.classList.contains('trace-lit')).click() ?? null" >/dev/null
  [ "$(js "$crown_clip")" = "$worn" ] && fail "the crown keeps $worn after another frame is chosen"
  [ "$(js "document.querySelector('.trace-lit .trace-name').textContent.trim()")" = "$taken" ] && fail "the dialog still lights $taken after another frame is chosen"
  js "[...document.querySelectorAll('.trace')].find((e) => e.querySelector('.trace-name').textContent.trim() === '$taken').click() ?? null" >/dev/null
  [ "$(js "$crown_clip")" = "$worn" ] || fail "the crown does not return to $worn when $taken is chosen back"
  pw press Escape >/dev/null
  wait_for "document.querySelector('#dialog-title') === null" "the frame dialog to close"

  pw click "getByTitle('Import sources')" >/dev/null
  wait_for "document.querySelector('#dialog-title')?.textContent.trim() === 'Character Sources'" "the sources dialog after clicking the bar"
  dialog="document.querySelector('[role=dialog]')"
  raw="$(js "[...$dialog.querySelectorAll('button')].filter((e) => !/dnd-/.test(e.className)).length")"
  [ "$raw" = "0" ] || fail "the sources dialog carries $raw raw buttons"
  emoji="$(js "/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test($dialog.textContent)")"
  [ "$emoji" = "false" ] || fail "the sources dialog carries an emoji"
  painted="$(js "[...$dialog.querySelectorAll('*')].filter((e) => /#[0-9a-f]{3}|rgb/i.test(e.getAttribute('style') ?? '')).length")"
  [ "$painted" = "0" ] || fail "the sources dialog paints $painted elements with a literal colour"
  pw click "getByRole('button', { name: 'Import New Source' })" >/dev/null
  wait_for "document.querySelector('#dialog-title')?.textContent.trim() === 'Import Character Source'" "the import dialog"
  [ "$(js "document.querySelector('#source-file') !== null")" = "true" ] || fail "the import dialog carries no file field"
  pw press Escape >/dev/null
  wait_for "document.querySelector('#dialog-title')?.textContent.trim() === 'Character Sources'" "the sources dialog after Escape on the import dialog"
  pw press Escape >/dev/null
  wait_for "document.querySelector('#dialog-title') === null" "the sources dialog to close"
fi

page="/main/character/does-not-exist"
pw goto "$base/main/character/does-not-exist" >/dev/null
wait_for "location.pathname === '/main' && ($hearth)" "the hearth after an unknown character"

visit /main "$hearth" "the hearth"
if [ "$(js "$campaign_card !== null")" = "true" ]; then
  js "$campaign_card.click() ?? null" >/dev/null
  wait_for "location.pathname.startsWith('/main/campaign/')" "a campaign"
  if visit "$(js "location.pathname")" "document.querySelector('.dnd-shell-chip') !== null && document.querySelector('.dnd-loading') === null" "the campaign"; then
    campaign_page="$page"
    page="campaign drawers"
    pw click "getByTitle('Toggle the menu')" >/dev/null
    wait_for "document.querySelector('.dnd-shell-menu-open .dnd-sidebar-start .dnd-menu') !== null" "the navigator drawer on the campaign"
    wait_for "/Encounters/.test(document.querySelector('.dnd-sidebar-start .dnd-menu').textContent)" "the encounter section in the campaign drawer"
    pw click "getByTitle('Toggle the menu')" >/dev/null
    wait_for "document.querySelector('.dnd-shell-menu-open') === null" "the navigator drawer to close"
    pw click "getByTitle('Toggle the chat')" >/dev/null
    wait_for "document.querySelector('.dnd-shell-chat-open .dnd-sidebar-end textarea') !== null" "the chat composer on the campaign"
    rolls="document.querySelectorAll('.dnd-sidebar-end li.roll').length"
    before="$(js "$rolls")"
    pw fill ".dnd-sidebar-end textarea" "/roll 1d20" >/dev/null
    pw press Enter >/dev/null
    if wait_for "$rolls > $before" "the roll to show in the campaign chat"; then
      here_id="$(js "location.pathname.split('/')[3]")"
      logged="$(js "(async () => { const { getCampaignChatStream } = await import('/src/lib/api/index.ts'); const held = await new Promise((done) => { let stop = () => {}; stop = getCampaignChatStream('$here_id', (entries) => { stop(); done(entries) }) }); return String(held.filter((e) => e.kind === 'roll' && e.formula === '1d20').length) })()")"
      [ "${logged:-0}" -gt 0 ] || fail "the roll shows in the chat but the campaign log holds no 1d20 roll entry"
    fi
    pw click "getByTitle('Toggle the chat')" >/dev/null
    wait_for "document.querySelector('.dnd-shell-chat-open') === null" "the chat drawer to close"
    page="$campaign_page"
    check_page bar
  fi
else
  fail "no campaign on the hearth"
fi

if visit /main/create/character "document.querySelector('#character-name') !== null" "the character form"; then
  check_page bar
  pw fill "#character-name" "Walk" >/dev/null
  pw click "getByRole('button', { name: 'Continue' })" >/dev/null
  wait_for "location.pathname === '/main/create/character/class'" "the class page"
fi

catalog="document.querySelector('.dnd-catalog-more') !== null"
if visit /main/create/character/class "$catalog" "the class catalog"; then
  check_page bar
  visit "$(first_href '.dnd-catalog-more')" "document.querySelector('.source-crown') !== null" "the class detail" && check_page bar
  visit /main/create/character/class "$catalog" "the class catalog"
  pw click "locator('.dnd-catalog-row').first()" >/dev/null
  pw click "getByRole('button', { name: /^Continue as/ })" >/dev/null
  wait_for "location.pathname === '/main/create/character/race'" "the race page"
fi

if visit /main/create/character/race "$catalog" "the race catalog"; then
  check_page bar
  strays="$(js "(async () => { const { classes } = await (await fetch('/sources/classes/index.json')).json(); const held = new Set(classes); return [...document.querySelectorAll('.dnd-catalog-row .dnd-catalog-name')].map((e) => e.textContent.trim()).filter((name) => held.has(name.toLowerCase().replace(/ /g, '-'))).join(', ') })()")"
  [ -z "$strays" ] || fail "the race catalog offers a class as a race: $strays"
  visit "$(first_href '.dnd-catalog-more')" "document.querySelector('.source-crown') !== null" "the race detail" && check_page bar
fi

visit /main/create/campaign "document.querySelector('#campaign-prompt') !== null" "the campaign form" && check_page bar

visit /main/user "document.querySelector('.user-crown') !== null" "the profile" && check_page bar

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\n%d failed\n' "${#failures[@]}"
  printf '  %s\n' "${failures[@]}"
  exit 1
fi
echo "the walk is clean"
