---
name: nimon
description: Drive a real browser through a feature or a fix with the nimon cli and record it to mp4 or gif, and write and run browser tests. Use when a page has to be seen rather than asserted, when a flow is to be recorded, when browser tests are to be written, recorded or run in parallel like Playwright tests, when a process written in natural language is to be run as a test, when tagged tests in a project's markup are to be run, when a page or a site is to be charted or its features written down, or when a project's nimon settings, services or stories are to be read or written.
---

# nimon

`nimon` opens a real browser on this machine with its own profile, runs the service under test, drives a drawn cursor and keyboard through a feature, and records it with click, keystroke and spotlight illustrations and zoom. The cursor is not the OS mouse. One session per repository holds the browser; every command is a thin client of it, and `run` carries many commands in one call.

## How to call it

1. One intent, one call. Put every command of a step into one `nimon run`, in order, and read the result once. A single `click` or `type` on its own is a wasted round trip.

```
nimon run 'caption "Apply the coupon"' 'type label="Coupon" SUMMER25' 'click role=button[name="Apply"]' 'expect css=#out text:"Discount applied"' 'look'
```

2. Look before acting, in text. `look` lists every clickable with its role, name and ref. It costs no image. `look marks` adds a screenshot with the refs drawn, for a target with no name; Read that png only then.

3. Targets, in the order to prefer them:

```
nim=<handle>                  data-nim-name in the markup, stable across redesigns
role=button[name="Save"]      role and name as look prints them; role=button alone takes the first; a pointer element with no role is generic
label="Email"                 the control a label names
testid=search                 data-testid; placeholder="Search", alt="Logo" and title="Close" read those attributes
text="Apply"                  visible text, exact first then substring, then the name look prints; a bare Apply is the same
css=#out                      a css selector; xpath=//main//h2 an xpath
ref=12                        a ref from the last look, recounted after a reload or rerender
@640,312                      viewport coordinates, the last resort
```

Chain with `>>`, each part searching inside the one before: `css=nav >> role=link[name="Pages"]`. Filter with a part `nth=1`, `first`, `last`, `visible`, `has-text=Alerts`, `has-not-text=`, `has=<target>`: `css=li.row >> has-text=Alerts >> role=button`. `role=heading[level=2]` picks a level, `[exact]` an exact name. Every action waits up to `--timeout` (`NIMON_TIMEOUT`, 5s) for its target to be attached, visible, still, enabled and the element a click would hit, and says which of those failed.

4. Assert, do not assume. End a step with `expect`, retried until it holds, and read `inspect console` when something looks off. A failed `run` stops at the failing line and exits with its code.

5. Caption every step of intent before acting. The caption is what a viewer of the recording reads.

6. Never post, publish or push anything. Recordings and reports stay under `.nimon/` until a person moves them.

7. Poke around in read mode. When the ask is to look, learn or document, `mode read` first: the session then refuses typing, selecting, uploading, dragging, Enter and Space, a click at coordinates, and any click on a control whose name reads like save, create, delete, send or log out, while menus, tabs, links, disclosure controls and the navigation keys stay open. `mode post` when the ask is to fill forms and test them: typing, selecting, Enter and submitting are allowed, anything that reads like delete, pay, place order, sign out or deploy is refused, and each click or Enter that sends a non GET request or trips form validation waits for the page to answer and writes a post record to `<store>/<host>/network/<route>/post-<control>.md`, the click or press reply naming it. `mode write` only when the person asks for a change to be made.

## Session

```
open [route|url] [--profile --headless --viewport WxH --scale --owner <pid> --idle 30m --isolated --new-browser --new-tab --focus]   a tab in the one browser running on the profile, launched only when none runs, then go to the route
attach <url> [--relaunch]                browse to a tab the person already has open, whatever browser holds it
browsers                                 every running browser, its DevTools port and profile, remembered in ~/.nimon/browsers.json
status | close [--browser --all --stale]  close ends the session and its tab, the browser keeps running; --browser quits it, --stale closes the dead, orphaned and idle sessions, --all every session and browser
sessions                                 every session on the machine: state, daemon and owner pid, profile, browser pid, last use, and browsers no session holds
service up|down|status|logs [name]      .nimon/services.json: {name, command, cwd, env, ready, timeout}
```

One browser runs per profile and every session is a tab in it: `open`, every command that opens a session for itself, `tests run` and every agent reuse the running instance, found through its DevTools port, whatever session or process launched it, headless or not, and launch one only when none runs. Reuse is on by default and set per run: `--new-browser` (`new_browser`, `NIMON_NEW_BROWSER`) launches a browser of its own instead of attaching to the running one, on a `--profile` no running browser holds, and `--new-tab` (`new_tab`, `NIMON_NEW_TAB`) opens a tab of its own, closed with the session, instead of driving an existing one. A session keeps one tab: `open` and `go` in the same session navigate it. A new session drives, in this order, the tab its name held last time, any tab no live session holds, and only when every tab is held a new tab in the background, which it leaves open on close so the next session reuses it. Two live sessions never share a tab: with several agents at once each gets its own, so the tab count settles at the most sessions that ran together. Reusing a free tab also takes one a person opened by hand in that browser; `--new-tab` or `--isolated` leaves every existing tab alone. nimon never brings the browser or a tab to the front, so it never takes focus; `open --focus` does when asked, and a tab in a background window still renders and resizes as if focused. Closing a session closes its tab and leaves the browser running for the next one; `close --browser` or `close --all` quits it. Never launch a second browser: use the default session, or `--session <name>` for a second tab, `--isolated` for a tab with its own cookies and storage; `--new-browser` with another `--profile` is the explicit exception. The browser is Brave unless `browser` names another, `nimon config set browser=Chrome`, a name Brave, Chrome, Edge, Arc, Chromium or Vivaldi, or a path to a .app or an executable. A route resolves against `NIMON_BASE_URL`. `ready` is an http url answering below 500 or `log:<regex>`. A ready service is reused. `--session` or `NIMON_SESSION` names a second session. Every session is registered in `~/.nimon/run/<session>.json`; a second session on a profile a live session already holds opens as a new tab in that browser instead of a second browser, and closing it closes only its tab. A session ends itself after `--idle` (`NIMON_IDLE`, 30m, 0 never) with no command and no tab of another session in its browser, when the `--owner` process exits, or when its browser dies; ending it closes its tab and leaves the browser running. A command that has to open a session for itself, `chart`, `explore`, `review`, `collect`, `prep`, `security`, `design` and `site`, opens it owned by its own process, headless at scale 1 unless `NIMON_BROWSER_SCALE` is set, and closes it when it ends, also on an error or an interrupt; `open` first to keep one. A launch drops the profile's restored tabs, so a reused profile starts with one tab. `sessions` shows what is open; `close --stale` cleans up the sessions of runs that were killed.

When the person names a url they already have open, `attach` it rather than `open` it: the page, its login and its state are theirs. `attach` reads every browser process; a Chromium browser with a DevTools port, started with `--remote-debugging-port` or by `nimon open`, is asked for its tabs and the one showing the url becomes the session. A browser without a port is found through its tabs on macOS and named with what to do; `--relaunch` quits it and starts it again with a port on the same profile, tabs restored. Safari and Firefox speak no DevTools protocol and are only named.

## Commands

```
go <route|url> | --back | --forward | --reload
tabs [--use <n|id|url>] [--close <n|id|url>]   emulate [--color-scheme light|dark --motion reduce|no-preference --forced-colors active|none | --clear]
click <target> [--double] [--right]      move <target|@x,y>      drag <from> <to>      scroll [target] --by <dy>
type [target] <text>                     press <keys>            Enter, Tab, Escape, Meta+K, Ctrl+Shift+P
fill <target> <value>                    check <target>          uncheck <target>
select <target> <value>                  upload <target> <file>...                    dialog [text] [--dismiss]
wait [target] | --text <t> | --url <part> | --gone <target> | --idle    [--timeout 5s]
expect <target|page> [assertion] [--not]   visible hidden enabled disabled editable checked unchecked focused
                                         text:<s> exact:<s> value:<s> attr:<n>[=<v>] class:<c> css:<p>=<v> count<op><n>
                                         url:<s> title:<s> js:<expr> screenshot:<name>
eval <expression|function> [--on <target>]
storage save <name> | load <name> | clear
network wait <url-pattern> [--method --status 200]    network route <url-pattern> [--status --body --file --abort] | unroute
look | look marks [--clean --find <words>]  shot [target] [--pad --clean]   inspect console|network|a11y
caption <text> [--for 2s]                focus <target|off>      zoom <target|x,y,w,h|reset>      overlay keys|cursor|all on|off
overlay burst confetti|emoji|off [--when click,keys] [--emoji 🎉🚀]
run <command>... | -                     the batch; - reads lines from stdin
```

`go --back`, `--forward` and `--reload` move through the tab's own history and settle like `go`, also when the page comes back from the back forward cache, and refuse when there is no page that way. `tabs` lists the tabs this session drives and the ones they opened, a popup or a `target=_blank` link, never another session's or a person's; `--use` drives one by its number, an id prefix or part of its url, and `--close` shuts one after any `--use`, so `tabs --use 1 --close checkout` returns from a popup and closes it. `emulate` sets the media features the page styles by, so a dark scheme, reduced motion or forced colors layout can be driven and shot; it holds for the tab until `--clear`. `look --find <words>` keeps only the elements whose role, name or link holds every word, so finding one control costs a line instead of the page. Several agents in one repository share its default session and so its tab: give each its own `--session <name>`.

`type` with a target clicks it first and types one key at a time. `fill` clears a field and enters the value at once, typed key by key at the human pace; `check` and `uncheck` click only when the state differs. `expect` retries until the assertion holds or `--timeout` passes; with no assertion it is `visible`, `page` targets the page, a `/regex/` works for any string, `js:` is a page expression that must be truthy, `screenshot:<name>` compares with `<store>/snapshots/<name>.png`, written on the first run and rewritten with `NIMON_UPDATE_SNAPSHOTS`. `eval` runs javascript in the page and prints what it returns; a function is called, `--on` calls it with the element. `network wait` waits for a request made since the last action and asserts its status; `network route` answers matching requests with a mock or `--abort`s them until `unroute`. `storage save <name>` keeps the cookies and local storage of a signed in session in `~/.nimon/storage`, `load` puts them in another session, `clear` signs it out of everything. `overlay burst` throws confetti, or emoji rising from the point, on every click, every keystroke, or both with `--when click,keys`, for the open session; `NIMON_BURST`, `NIMON_BURST_WHEN` and `NIMON_BURST_EMOJI` set it for every session. It is off by default. `zoom` writes a camera keyframe applied when the video is composed; the live page never moves.

## Recording

```
record start [--name <name>]
record stop [--mp4] [--gif] [--no-zoom]      NIMON_RECORD_FORMAT when neither flag is given
record status | list | export <id> --format mp4,gif
video edit <file> [--audio <file>] [--follow-cursor --sample 5 --view 5cm|180px --zoom-out auto|<s>|none --cursor <png>] [--out <mp4>]
```

A recording is a folder under `<store>/<host>/recordings/` with frames, `timeline.json`, `steps.json`, `console.json`, `network.json`, `report.md` and the videos. Elements matching `NIMON_RECORD_REDACT` or carrying `data-nim-redact` are pixelated.

`video edit` works on any video file, a macOS screen recording made outside nimon included, and needs no session. `--audio` replaces the sound with the file given, looped to the length of the video; without it the original sound is kept. `--follow-cursor` finds the OS cursor with ffmpeg `find_rect` on `--sample` frames a second, not every frame, smooths the path over three samples and writes one camera keyframe per sample, so the camera eases between them through the same camera `record` composes with. `--view` is the height of the screen kept around the cursor: in px, or in cm on the display the video was recorded on, read from the attached display whose pixel size matches the video; with no such display attached it refuses and `--view` is given in px. `--zoom-out auto` returns to the full frame at the first scene change, a window or a page appearing, and tracking stops there; seconds name the moment, `none` follows to the end. The built in cursor is the macOS arrow at 1x and 2x, the better match chosen on the first two seconds; when it is not found, cut the cursor from one frame and pass it as `--cursor`. The result names the file, the zoom, the zoom out and how many samples found the cursor. Read the video's frames as a contact sheet of a few frames, never frame by frame, to keep the cost down.

## Stories and tagged tests

```
story new <name> [--start <route>] "step one" "step two"
story list [--unresolved] | resolve <name> | run <name>... [--strict --mp4 --gif --no-record] | check [name]...
tests list [file|dir|story]... [--grep] | tests list --tags [--route <r>] [--check]
tests run [file|dir|story|tag-id]... [--workers 4 --retries 1 --grep <re> --reporter list,junit,json --trace on|off|failure --video --headed --update-snapshots]
```

A story is `.nimon/stories/<name>.md`: a title, `Start:`, `Services:`, numbered prose steps, each with a fenced block of command lines, the same lines `run` takes. The prose is the caption; `run` replays the block with no model. `resolve` prints the next prose only step with a `look`; write its block into the file. Tagged tests come from `data-nim` attributes the Vite plugin reads.

A test file is `<name>.nimon.md`, or `<name>.nimon.ts` written in a small Playwright style, `test`, `test.describe`, `beforeEach`, `page.goto`, `getByRole/Text/Label/TestId`, `locator.click/fill/press` and `expect(...).toBeVisible/toHaveText/toHaveCount/toHaveURL`, read by nimon, never run by Playwright. A test file is `<name>.nimon.md` in the project: the story format with fixtures in the frontmatter, `base_url`, `viewport`, `storage`, `timeout` and `retries`, one test per `## <name>` section and the hooks `## Before all`, `## Before each`, `## After each` and `## After all`; a fenced block straight under a heading needs no numbered prose. `tests run` runs every test file and story, or those named, on `--workers` private contexts of the one running browser, launched headless when none runs: each test starts signed out on a blank page at the viewport with the `storage` state loaded, actions are always at the fast pace, a failed test is retried, and every test writes `trace.json` under `<store>/test-results/<test>/` with a screenshot per step with `--trace on`, junit and json reports beside it. It exits 1 when a test failed. Write tests by doing: `story start <name> --codegen`, click through the page, `story stop --file tests/<name>.nimon.md`. docs/story.md in the repository has the format.

## History and exporting

```
history list [--session <name> --project <name>]       every recorded session of the project, newest first
history show <id>                                     its steps: when, the command, ok, exit code, time
history export <id> --as nimon.md|test|playwright [--file tests/<name>.nimon.md]
tests import <playwright spec|dir>... [--out <dir> --base-url <url>]
```

Every command a session runs is recorded on its own into the project history, `<store>/history/<date>/<session>.jsonl`, through the cli or the mcp, with a password or secret field stored as `<secret>`. Never write a test by hand: do the check with nimon commands, then `history export <id> --as nimon.md --file tests/<name>.nimon.md`, which keeps the passing steps that act or assert and names what it skipped; `--as test` writes a Playwright style `.nimon.ts`, `--as playwright` a `.spec.ts`. `tests import` turns Playwright specs into `.nimon.md` tests and lists every line it could not map.

## Charting and exploring

```
mode [read|post|write]                      read refuses everything that changes state, post fills and submits forms and records each submit, write allows all; bare, the current mode
chart page [route|url]                      the page as text: regions, forms, controls, links, outline, measured design
chart site [route|url] [--depth --max --out]  every linked page too, one file each plus index.md under .nimon/chart
chart describe [route|url]                  the page as text, then Features and Design prose by the claude cli
explore page [route|url] [--out]            one file per feature of the page, named and described by the claude cli
explore site [route|url] [--depth --max --parallel 3 --repo <dir> --stored]   the same across every linked page, described in parallel tabs
explore list [route|url]                    the features as the DOM walk finds them, mechanical, no model
explore scan [route|url] [--depth 0 --max 500 --repo <dir> --stored]   every internal link as far as it goes, mechanical, no model: the scraper
site show|learn|diff|selectors [url]        the learned model of a host, no model call; diff prints the changed regions and a line diff against the cached chart
prep page|site [route|url] [--a11y] [--previews=false]  how ready a page is to be found, shared, read by AI and used by everyone: a scored report and a share preview image under <store>/<host>/prep
features list [route|url]                   every feature on record, or those of one page
features show <route|url>                   the feature files of one page in full: description, how to, notes
features export [route|url] [--out <file>]  one markdown document of them all, or of one page
review page [route|url] [--gif --no-shot --write|--post]   tester mode: the features, then one bug file per defect with evidence
review site [route|url] [--depth --max --parallel 3 --repo <dir> --stored]   the same across every linked page, in parallel tabs of one browser
review read [route|url] [--prompt "<what to judge>" --depth 0 --max 10]   a reader in read mode: clicks, scrolls, opens sub pages, judges from its own shots, writes <store>/<host>/reviews/<route>.md
bugs list|show|export [route|url]           the bug files on record, severity first
```

A feature file sits under `<store>/<host>/features/<route>/<feature>.md`, where the store is the project's `.nimon` or, outside a project or with `--global`, `~/.nimon`. Recordings, shots and charts of the same host sit beside it, so everything a domain produced is one folder. Frontmatter: `feature`, `kind` (form, action, navigation, content, flow or state), `route`, `url`, `region` and `where`, a list of targets. Body: a paragraph on what it does, `## How to` with numbered steps naming the controls as labelled, `## Notes` when a state or a pitfall exists. `index.md` lists them all. `explore scan` is the no model scraper: it follows every same host link breadth first, skipping logout, delete and file links, with no depth limit, and writes the mechanical feature files of every page. `explore page` and `site` put the session in read mode, let the claude cli open menus, tabs and dialogs under that guard, rename and describe every feature and add the flows and states the DOM walk cannot see, then restore the mode. `features` reads the project store and every host store.

## Reading back

```
page show [route|url] [--only feature,bug,review,story,...]   one document of everything stored about the open page or the one given
page files [route|url]                                 the stored files of the page, by kind
```

Every stored file opens with frontmatter naming `host`, `page` (its title), `route` and `url`, plus what the file is: `feature` with `kind`, `region` and `where`; `bug` with `severity` and `evidence`; `kind: review` with `prompt` and `shots`; `kind: prep` with `score` and `version`; `kind: chart`; `kind: shared` with `pages`; `story` with `start`, `pace`, `last_run`, `last_result` and `video`. `page show` is the way in from a page: before working on a page, read it; it costs one call.

## Stories

```
story start <name> [--codegen --video --gif]   journal every command run in this session; --codegen also writes what a person clicks, fills, checks, selects and presses, with the best locator
story stop [--gif --file <path>]               write the story to <store>/<host>/stories/<name>.md, or to a test file
story new <name> [--start <route>] "step" ...   write one by hand, prose only
story list [--unresolved] | resolve <name> | check [name]...
story run <name>... [--mp4 --gif --speed 2 --typing 80ms --every 30m --strict --no-record]
```

A story is a repeatable flow: frontmatter, then numbered prose steps, each with a fenced block of command lines. `run` replays it with no model, captions each step, records it, and writes `last_run`, `last_result` and `video` back into the frontmatter; `--every` repeats it until interrupted. Establish a story by doing it: `story start`, caption, act with `run`, `story stop`.

## Pace and settling

```
pace [fast|human] [--instant on|off --speed 0.5 --typing 80ms --settle 4s --hold 400ms]   bare, prints the session pace
still [--for 4s]                                             wait for the page to go still
resize <WxH|mobile|tablet|desktop|wide>                     set the viewport so the page relayouts
download <target>                            click a download trigger and save the file under <store>/<host>/downloads
downloads                                   the files the session has downloaded
login --pass-env VAR [--user --user-env --user-field --pass-field --submit]   sign in a test account
```

Everything runs at the fast pace by default: the cursor jumps, text lands at once, and an action waits only until its target is actionable, with no settling and no hold, because nothing is being filmed. `record start`, and so `story run` and `story start --video`, switches the session to the human pace, the moving cursor, typing key by key, settling until the page is still and holding on each result, and back at `record stop`. `--pace human`, `NIMON_PACE=human` or `pace human` asks for it without a recording; never ask for it to test, and `tests run` ignores it and stays fast. At the human pace every action also waits, up to the settle limit, until no finite animation or transition runs, no `aria-busy`, progressbar, spinner, loader or skeleton shows, images and fonts have loaded and the layout holds; `explore`, `review`, `collect`, `prep`, `site learn` and `chart site` are fast too.

`resize` relayouts the page at a size or a named viewport; `prep --viewport mobile,tablet,desktop` scores each and writes one file per size, which catches overflow and layout bugs that only show narrow. `login` fills a username and password form and submits, for signing a test account into your own app; the password is read from the environment variable `--pass-env` names, sent over the local session socket, never on the command line or stored, so two accounts can be driven to test authorization by hand.

## Design

```
design system [url]        write DESIGN.md for the host from its live styles: colour, type, shape and component tokens
design element <target>    one element, a clipped image and its computed tokens, to recreate it elsewhere
```

The reverse of building a design system: nimon reads the rendered page and writes what it sees. `design system` emits a DESIGN.md with the token frontmatter and the sections a design tool reads, colours, typography, shapes, layout, components, drawn from the computed styles across the host. `design element` captures one element as a clipped png beside a markdown table of its font, colour, background, border, radius, shadow, padding, layout and any resolved CSS variables, enough to rebuild it in another project. `explore --design` and `review --design` capture the element of each feature and each bug the same way, beside its file.

## Report

```
report [url]   one document of everything on record for the host, with a regression diff
```

`report` gathers the features, data, prep, security and bugs of a host into `<store>/<host>/report.md`. A finding that recurs on every page, a missing header say, is rolled up to one site-level line instead of repeating per route. It keeps a snapshot each run, so the next report names what is new and what is gone since the last one, which makes it a regression gate after a deploy.

## Data

```
collect page|site [route|url] [--depth --max --global]   the data a page shows, as one file per collection
data list|show|export [route|url]                         the collections on record
```

`collect` extracts with no model: tables and ARIA grids, definition lists, and repeated components, three or more siblings with the same tag and class list whose items carry two or more values. Utility classes such as Tailwind's are ignored when naming; a field is named by its data attribute, its semantic class, or its tag, title, heading, time, link, image, text. A collection is `<store>/<host>/data/<route>/<name>.md` with frontmatter `data`, `kind` (table, list or pairs), `host`, `page`, `route`, `url`, `region`, `component`, `where` and `fields`, then a markdown table, one row per item, item n at `<where> > :nth-child(n)`. `explore` collects along the way unless `--no-data`, and a re-collect replaces the page's collections. `page show` includes them.

## Security

```
security page|site [route|url] [--depth --max --global]   audit the frontend, one file per finding
security list|show|export [route|url]                     the findings on record, severity first
security noauth [--authorized]                            refetch the seen API calls with no credentials
```

## Network

```
network log [--since <seq>] [--match /api] [--full]   the requests the open session saw; --full prints headers and bodies sent and received
network clear                                      forget them
network page [route|url] [--global]                load a page and write every request it makes to <store>/<host>/network/<route>/page.md
network list|show|export [route|url] [--out]       the page traffic and post records on record
```

The session keeps the last 400 fetch, xhr, beacon and document requests: method, url, headers, body sent, status, headers and body received for text types, time. `Authorization`, `Cookie`, `Set-Cookie`, api key and csrf headers, and body fields named like password, secret, token, api key, card number, cvc or pin are replaced with `<redacted>` when captured, so nothing secret reaches a record. A record is markdown with frontmatter `network`, `kind` (page or post), `host`, `page`, `route`, `url`, `requests`, and for a post `control` and `result` (sent, failed or invalid), then Steps, Sent and received, one heading per request, and for a post the Page response: the url, the title, every alert, status, toast or dialog text and every invalid field with its validation message. `index.md` lists them.

For auditing a site you own or are authorized to test, before an attacker does. It detects and reports, with no model: it never logs in as another user or replays a request with a swapped id. It flags secrets a script can read (JWTs, bearer tokens, API keys in `localStorage`, `sessionStorage`, JS-readable cookies, `window` globals and the DOM), access-control risks (object ids in links and forms, each with the verify step that only the server refusing the object is a control; privileged UI hidden only in the browser), missing response headers (CSP, HSTS, X-Frame-Options, nosniff) and `Set-Cookie` without HttpOnly, Secure or SameSite, and exposures (forms over http, source maps). A finding is `<store>/<host>/security/<route>/<name>.md` with frontmatter `finding`, `severity`, `area`, `host`, `page`, `route`, `url`, `where`, then What and Verify and fix; `index.md` ranks them. `explore --security` audits along the way. `page show` includes them.

`security noauth` is the one active check, gated behind `--authorized`: it refetches each same-origin API call the session has captured with every credential omitted, and reports any that still return data, which means the endpoint is not behind authentication. It never swaps an id and never reads another user's object. To test authorization between two accounts, `login` as one, note an object's id, `login` as the other, and request that id by hand.

## Scraper craft

Every walk teaches a site model, `<store>/<host>/site.json`, with no model call: a fingerprint per page, the regions whose controls repeat across pages, a census of the css classes that mark buttons, fields, links and rows on that host, and a stable selector per named control, `data-testid`, id, aria label, name or href. `explore`, `review` and `chart site` use it: a region shared by more than one page is written once under `_shared` and left out of every model prompt; a page whose fingerprint is unchanged since the last visit is skipped, `--force` visits it anyway; a changed page tells the model which regions differ. `site show` prints the model, `site learn` walks and learns only, `site diff` says what changed on a page, regions and a line diff against the chart cached under `<host>/cache/`, `site selectors` lists the learned selectors; a feature's `where` carries the stable selector as `css=` beside the role target. A version label found in meta, a data attribute, a global or the footer is recorded per route in the model with the fingerprint it was seen with.

`prep` scores a page for the outside world with no model, in seven areas. Search: title 30 to 60 and description 70 to 160 characters, lang, one h1, canonical, robots meta and X-Robots-Tag, max-image-preview, meta keywords found in the page text, title terms in the h1, description or first 100 words, top terms and keyword density, crawlable links and generic link text, robots.txt with a Sitemap line, sitemap.xml and whether the page is listed in it, hreflang with x-default, http status and redirects. Share preview: what unfurlers see in the server html without javascript, og:title, og:description, og:image, og:url, og:type and og:site_name, share title and description length, og:url against canonical, the share image fetched and measured, absolute https, 1200x630 at 1.91, png, jpeg or webp, under 600 KB for WhatsApp and 5 MB for X and LinkedIn, alt and declared dimensions, twitter:card, theme color; it renders the link as it unfurls on Google, Slack, Facebook, X, LinkedIn, Discord, iMessage and WhatsApp into `prep/previews/<route>.png`, `--previews=false` skips it. Embed: iframe policy from X-Frame-Options and frame-ancestors, open graph, oembed discovery and its response, json-ld blocks, their types and the fields Google requires per type. AI: llms.txt with one h1, a summary and links, llms-full.txt, robots.txt verdicts per bot for search crawlers, preview bots, answer engines and training crawlers, words readable without javascript, the head in the server html, ai.txt, tdmrep.json and noai. App: manifest and icons, favicon, apple touch icon, theme color, viewport, charset. Accessibility: unique ids, names on buttons and links, labels on fields, aria references that resolve, valid roles, no focus inside aria-hidden, no positive tabindex, alt on images and svg, titles on frames, heading levels that do not skip, lists that hold items, text contrast against WCAG AA on solid backgrounds, autoplay with sound, zoom, lang, landmarks and a skip link; each rule names its first element by selector, and `--a11y` lists every finding with its selector. Content: alt attributes with decorative images counted apart, word count, iframes, version. One file per page under `<store>/<host>/prep/` and `index.md`; `prep site` adds the titles, descriptions and share images shared between pages.

`review` is the tester mode. It writes the features as `explore` does, then for every page: clears the logs, loads it, runs the mechanical checks, console errors, failed requests, controls without a name, one bug per role naming the first ten, images without alt text, unlabelled fields, sideways scrolling, a missing title, language or h1, each becoming a bug file with a clean screenshot as evidence; then the claude cli tests the page like a person in read mode, `--write` lifts it, `--post` fills and submits every form, tries a wrong value, and reads the post record of each submit to file the requests that failed or answered wrong, confirms the mechanical bugs, adds the visual, functional, text and state defects it finds, judges the design against the project's `DESIGN.md` and `PRODUCT.md` when they exist (else the rest of the site) and files a `design` bug for a value off the system, a broken or overlapping region or a known anti-pattern, and a `content` bug for placeholder, untranslated, contradictory or invented text, each with steps, expected, actual and evidence, a png by default or a gif per bug with `--gif`, none with `--no-shot`. A bug file is `<store>/<host>/bugs/<route>/<bug>.md` with frontmatter `bug`, `severity`, `kind` (visual, design, functional, a11y, performance, content, console or network), `route`, `url`, `where`, `evidence`; Identical bugs, same `bug`, `kind` and `where`, are filed once, and a page files at most 40, the most severe first, with `more-bugs.md` counting by kind what was not filed. The route folder is the path and query as a slug, capped at 80 characters with a short hash of the route when longer, and a long query becomes a short hash. `evaluation.md` beside them is the page by page summary. `bugs list|show|export` reads them like `features`.

`review site` and `explore site` run as a waterfall. Discovery charts every page once in the session's tab: the link walk, or with `--stored` the list the last discovery stored, united with `--repo <dir>`, the routes of that repository's file router (`src/pages`, `pages`, `web/src/pages`, `app/pages` or a SvelteKit `src/routes`). A route with a parameter, `/users/:id`, is filled from the walked links that match it, and one no link fills is listed as unresolved and not tested. The list is `<store>/<host>/routes.json`, each route with `sources` (site, repo), its `pattern` and `file`, and the change since the last visit. Then the pages run `--parallel` at once, 3 by default and 1 with `--write` or `--post` unless given, each as its own `review page` or `explore page` process in a tab session `<session>-tab<n>` of the same browser, so N pages cost one browser and N tabs. A tab opens only in the browser the session holds, sharing its profile and its sign in, and never launches a browser of its own. Discovery and the pages never leave the start host: a page that lands on another host, or on a login form at another path, means the browser is not signed in, and the run stops with exit 4 naming the page instead of charting or testing the login page; sign in again in that browser and rerun. `index.md` and `evaluation.md` are written once at the end. A tab or browser that dies is reopened, the tab in the same browser, and the page tried again; a page that fails twice, or a browser that cannot be reopened, makes the run exit non zero naming the pages not done.

`review read` is the reader mode, the person beside the tester. In read mode nimon takes a clean shot of the page and the claude cli Reads it, then moves through the page and its sub pages as a person would, `scroll`, `look`, `click` on menus, tabs, disclosures and links, `go` back, taking a `shot` into `<store>/<host>/reviews/<route>/` after each step and Reading it, and judges from the shots, not the DOM. `--prompt` says what to judge, by default what the page is and says, whether its point is understandable, the product, the presentation, the intuitiveness and the flow. `<store>/<host>/reviews/<route>.md` has frontmatter `host`, `page`, `route`, `url`, `kind: review`, `prompt` and `shots`, then the sections Interpretation, The point, The product, Presentation, Intuitiveness, Flow and Answers, each claim with the shot it rests on embedded by relative path. `--depth` above 0 walks the links first, reads each page in turn up to `--max`, and writes `reviews/index.md` summing up the pages, the product and the flow across them. `page show --only review` reads it back.

## Model driven

```
auto "<goal>" [--max-steps 25] [--model] [--record] [--post]
```

`auto` hands the goal to the claude cli in print mode with this skill, allowed to run `nimon` and to Read screenshots. The claude cli is a dependency; it carries the login. Prefer a story when the steps are known. `--post` runs it in post mode and points the model at the post records.

## Configuration

Everything nimon keeps on the machine lives in `~/.nimon/`: `config.yaml` with one block per named config, the profiles, the run sockets, the plugin and completions. Every setting has a yaml key, the `NIMON_<KEY>` name lowercased without the prefix, `base_url` for `NIMON_BASE_URL`. Values resolve the flag, the process environment, `--env <file>` dotenv layers (every key in the file is loaded), a local `.nimon/config.yaml` found by walking up from the working directory, then the named config, picked by `--config`, `NIMON_CONFIG`, the local `use:`, then `default:`, then the built in default. A local `.nimon/` takes over until `--global` or `nimon config local off`.

```yaml
default: dev
configs:
  dev:
    base_url: http://localhost:5173
    viewport: 1440x900
  prd:
    base_url: https://app.example.com
    protected: "true"
```

```
config get | list | set [--to <name>|--local] key=value... | use <name> | init [name] | local on|off | path
```

`nimon config set --to dev base_url=http://localhost:5173` writes a named config, `nimon config init dev` pins this directory to it, and `nimon config set --local cursor_size=32` writes the local `.nimon/config.yaml`. On a `protected` config every write prints its plan and asks for `yes`, a pipe or an mcp call needs `--yes`, and `--plan` prints the plan and stops.

## Tooling

```
doctor | tools | tools install [ffmpeg|claude|gh ...] | skill get|install | plugin install|desktop|status | mcp | completion --auto | version | help
```

`nimon tools` shows whether the browser, ffmpeg, claude and gh are on the path, each missing one with the command that installs it; `nimon tools install` installs every one missing with Homebrew, or only those named, and prints the status again. A Chromium browser is never installed: Brave, Chrome, Edge, Arc, Chromium or Vivaldi, or the one `browser` names. `doctor` runs the same checks plus the config files.

`--no-banner`, `--no-color`, `--verbose`. Exit 4 is not authenticated, 3 refused, 2 rejected or an unknown command, 1 failed, 130 interrupted. A table on a terminal, json in a pipe and under mcp, with no colour; `--json` forces json, `--raw` keeps the list envelope, `--plain` prints tab separated lines. Shape any output with `--fields a,b.c`, `--sort field[:desc]`, `--jq <expr>` or `--template <go template>`; a list takes `--limit <n>` and `--cursor <offset>`, and a truncated one ends with a line naming the next cursor. Every output of a page lands under `<store>/<host>/`: `recordings`, `shots`, `chart`, `features`; `NIMON_STORE` moves the root. Through the mcp every command but the tooling is a tool; `run` is the one to reach for.
