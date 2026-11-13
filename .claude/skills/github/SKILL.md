---
name: github
description: Everything that talks to GitHub. Pull requests, issues, epics, sub-issues, labels, milestones, releases, the project board and every gh cli or GraphQL call. Use when opening or editing a PR, creating or listing issues, managing epics, reading or updating the board, setting labels or priority, or running any gh command. The local git cli is the git skill.
allowed-tools: Bash(gh *), Bash(git *)
---

# Github skill

Everything that talks to GitHub. Committing, branching and merging locally are the `git` skill.

Use the current git repository from the working directory. Derive owner and repo name from the remote for all `gh` and GraphQL commands.

When working inside the Samna repo set, project board specifics (project number, field ids, status option ids, repo membership, vacation windows) live in `samna/.claude/rules/github_project.md`. Honor that file when present; treat its values as authoritative.

## Before creating anything

Run this assessment first. Skip it only when the user already named the exact target.

1. Search the target repo for an existing open issue covering the same scope: `gh issue list --repo <owner>/<repo> --state open --search "<keywords>"`.

2. Decide between:

2.1. New standalone issue when the scope is fresh and self contained.

2.2. Sub-issue under an existing parent when it slots into an existing epic or feature.

2.3. Comment on an existing issue when the work is already tracked there.

2.4. New epic wrapping the existing issue plus the new one when the scope has grown and a single tracker no longer holds it.

2.5. New milestone when the board now reflects a coherent release boundary.

3. State the decision before any write so the user can redirect.

## Hierarchy

The board uses Epic, Feature, Task, Bug as issue types. Sub-issue links nest a Task under a Feature, a Feature under an Epic, an Epic under a parent Epic for larger initiatives. Bugs sit at any level depending on impact.

1. Epic: a multi-week effort with sub-issues.

2. Feature: a single deliverable, often with sub-tasks.

3. Task: a single reviewable change.

4. Bug: a defect at any level.

## Issue body shape

Write the body to describe the work itself. Anchor in current code (file path and line number) where useful.

1. Lead with intent in one paragraph.

2. Scope as a numbered list.

3. Acceptance criteria when the outcome is testable.

4. Estimate as working days.

5. Mermaid diagram (`flowchart`, `stateDiagram-v2`, `sequenceDiagram`, or `erDiagram`) when a feature has a flow, state, or relationship that reads more cleanly visually than as prose.

Never inline link issue numbers (`#123`) inside the body to point at sibling issues. Rely on the project board sub-issue and tracked-by relations to connect them. Plain prose explains the task on its own.

## Labels

Labels drive priority, type, and verification state. Required on every issue.

1. Always set a priority label: `high priority`, `medium priority`, or `low priority`.

2. Always set a type label: `feature`, `bug`, `documentation`, or `help wanted`.

3. Always set `unverified` on every issue this skill creates. The label marks the issue as awaiting the user's verification.

3.1. If `unverified` is missing in the target repo, create it: `gh label create unverified --repo <owner>/<repo> --color FBCA04 --description "Created by Claude, awaiting verification."`.

3.2. If creation fails (permissions, rate limit, etc.), report back to the user and skip the issue create. Do not silently drop the label.

Never invent priority, type, or status labels beyond the documented set.

## Estimate, dates, priority

Calibrate against existing issues in the target repo rather than guessing in isolation.

1. Read three open issues of comparable scope: `gh issue list --repo <owner>/<repo> --state open --limit 50 --json number,title,labels,body`. Pull their Start Date, Target Date, and priority from the project board.

2. Pick an estimate in working days that matches the comparable issues. Write it in the body under an `## Estimate` heading.

3. Pick Start Date and Target Date that respect the board's cadence and any documented blackout windows. Set both on the project item via `updateProjectV2ItemFieldValue` with `value:{date:"YYYY-MM-DD"}`.

4. Pick the priority label based on impact and the user's framing. Default to `medium priority` when unclear and surface the assumption.

## Banned flags

1. `gh issue create --project "..."` raises a fatal deprecation error. Use `addProjectV2ItemById` after the issue is created.

2. `gh issue edit --add-project` and `--remove-project` raise the same error.

3. `--type` on `gh issue create` and `gh issue edit` does not exist. Set type via the GraphQL `updateIssue` mutation.

## Issue creation flow

1. Create the issue with the labels CSV including priority, type, and `unverified`:

```
gh issue create --repo <owner>/<repo> \
  --title "..." \
  --body "..." \
  --label "high priority,feature,unverified"
```

2. Read its node id:

```
gh api graphql -f query='{ repository(owner:"<owner>",name:"<repo>") { issue(number:<N>) { id } } }' \
  -q '.data.repository.issue.id'
```

3. Set the issue type:

```
gh api graphql -f query='mutation { updateIssue(input:{id:"<NID>", issueTypeId:"<TID>"}) { issue { id } } }'
```

4. If a parent issue is named, link as sub-issue:

```
gh api graphql -H "GraphQL-Features: sub_issues" \
  -f query='mutation { addSubIssue(input:{issueId:"<PARENT_NID>", subIssueId:"<CHILD_NID>"}) { issue { id } } }'
```

5. Add to the project board:

```
gh api graphql -f query='mutation { addProjectV2ItemById(input:{projectId:"<PROJECT_ID>", contentId:"<NID>"}) { item { id } } }' \
  -q '.data.addProjectV2ItemById.item.id'
```

6. Set status, Start Date, Target Date via `updateProjectV2ItemFieldValue` on the item.

## Issue type ids

The ids below are scoped to the `nimling` organization. Confirm before use against `gh api graphql -f query='{ organization(login:"<org>") { issueTypes(first:20) { nodes { id name } } } }'` when working outside that org.

1. Task: `IT_kwDOA6RKQc4AtgRd`.

2. Bug: `IT_kwDOA6RKQc4AtgRf`.

3. Feature: `IT_kwDOA6RKQc4AtgRi`.

4. Epic: `IT_kwDOA6RKQc4B3ZL8`.

## Relating issues

Use the project board's relations rather than inline links.

1. Parent/child: `addSubIssue` mutation as above. Surfaces under the parent's sub-issues panel.

2. Tracked-by: same relation viewed from the child side.

3. Cross-repo dependency: comment on each issue stating the dependency, then add both to the same milestone or epic. Do not inline link the number inside the body text.

## Commit messages

The commit message shape is the `git` skill. Everything below the commit is this one.

## PR format

Three parts, in this order, and nothing else.

1. The issue line. `Closes #<number>` when the PR finishes the issue, `Refs #<number>` when it advances one without closing it. Search the repo for the issue the work belongs to before writing the body: `gh issue list --repo <owner>/<repo> --state open --search "<keywords>"`. Omit the line only when no issue covers the work, and say so in the summary rather than inventing a number. Below it, one `Depends on <owner>/<repo>#<number>` line per pull request in another repo this one needs merged or released first; after opening, add `Needed by <owner>/<repo>#<number>` to each of those with `gh pr edit`.

2. The summary. One short paragraph, at most three sentences, on what the change does. Not why it is safe, not how it was verified.

3. The changelist. A numbered list, one entry per file or per tight group of files that moved together. The file name is bold on the numbered line and nothing else shares it, and the one line description sits directly below it, unnumbered.

```
gh pr create --repo <owner>/<repo> --title "..." --body "$(cat <<'EOF'
Closes #<number>
Depends on <owner>/<repo>#<number>

<one paragraph summary>

1. **`path/to/file`**
What changed in it.

2. **`path/to/other`**
What changed in that one.
EOF
)"
```

Nothing else goes in a PR body. No table, no test plan, no results, no gate output, no verification, no findings, no deploy notes, no open questions, no risk, no checklist, no footer, no heading. Anything learned while doing the work belongs in the repo's docs and changelog, which are themselves entries in the changelist.

## Output format

After any create, update, close, list, or PR operation, return a table:

| # | Title | Link |
|---|-------|------|

## Rate limit awareness

The GraphQL endpoint allows 5000 points per hour per user. Project board mutations cost roughly 5 to 7 points each. When orchestrating large batches:

1. Check `gh api rate_limit -q '.resources.graphql'` before starting a long batch.

2. Pause and resume against the documented reset timestamp rather than retrying in a tight loop.

3. Coalesce reads where the GraphQL `query` field supports it (multiple `issue(number:N)` aliases in one call).

## Rules

1. Always set labels and type on every issue and PR.

2. Always set the `unverified` label on every issue this skill creates. Create the label in the target repo when missing. When creation fails, report back to the user and do not create the issue.

3. Never invent labels outside the documented set.

4. Never create a PR or push without explicit user consent.

5. No icons or emojis anywhere.

6. Everything is the work of the current system git user. Never add a trailer or a footer, and never name a tool or a model in an issue, a PR, a comment or a commit.

7. Never link sibling issues inside an issue body. Use the project board's sub-issue and tracked-by relations.

8. Run the assessment in `## Before creating anything` before writing anything new.

9. Calibrate estimate, dates, and priority against existing issues in the target repo, not in isolation.

10. A PR body carries the issue line, one paragraph, and the changelist table. Nothing else. See `## PR format`.
