---
name: nimon-pr
description: Read what a pull request, a commit or a range claims, identify the surface it changes and where in the ui it is reached, then try the feature or fix by point and click and keyboard with the nimonstrate cli, recorded. Use when asked to test, verify, demo or record a pull request or a change in the browser.
---

# nimon-pr

The flow a pull request goes through. Every step is a `nimon` command; the `nimon` skill is the cli.

## Flow

1. Read the intent. `nimon pr prepare <n|sha|from..to>` writes `.nimon/pr/<key>/context.md` with the claimed behaviour, the acceptance criteria read from the checklist in the body, the commits and the changed files, beside `diff.patch`. Read them; `gh pr view` and `git log` add what they leave out.

2. Identify the surface. `surface.md` beside it classifies the change as feature, fix or no surface, and for every changed file with a surface names the routes, the tagged tests from the manifest and the navigation path. When no route maps to a file, add a glob to `NIMON_ROUTES` such as `web/src/pages/settings/**=/settings` or crawl the navigation with `nimon look` or `nimon routes` from `NIMON_BASE_URL`. Each surface is one proposed story, prose only, under `.nimon/pr/<key>/stories/`. The user keeps, edits or drops them before anything runs.

3. Get the code in the repo's own checkout. `gh pr checkout <n>`, then `git merge origin/main`. Never a worktree, never a clone, never a rebase.

4. Bring the app up. `nimon service up`, `nimon open <first route>`, `nimon record start --name pr-<n>`. When the surface is unclear, `nimon explore page <route>` writes the features of the page as files to read.

5. Exercise the change. The tagged tests for the changed files first, then `story resolve` and `story run --mp4 --gif` for each kept story. Then try what the description claims in a look, act and verify loop, one `run` per intent: `caption`, the actions, `expect`, `focus` and `zoom` on the changed region, the keyboard paths covered.

6. Collect evidence. `inspect console|network`, failed expects, screenshots of anything off.

7. Finish. `record stop --mp4 --gif`, then `report.md` with the verdict, the steps, the evidence and the video paths.

8. Post only on the user's explicit word.
