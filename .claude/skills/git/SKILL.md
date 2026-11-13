---
name: git
description: Runs the git cli. Committing, branching, pushing, merging, rebasing, diffing, stashing, tagging, resolving conflicts and reading history. Use for any local version control work. Anything that talks to GitHub, a pull request included, is the github skill.
argument-hint: [commit|branch|push|status|diff|log|merge|rebase|stash|tag] [args]
allowed-tools: Bash(git *)
---

The git cli only. A pull request, an issue, a label, a release and the project board are the `github` skill.

Use the current git repository and branch from the working directory for all operations.

## Branches

1. `fix/{slug}` for bugs.

2. `feat/{slug}` for features.

3. Slugs are lowercase, hyphen joined, max five words.

## Commit Messages

1. Single line, max 72 chars. No type prefix, no icons.

2. When working on an issue: `#<number>: <short description>`.

3. When no issue: plain short description.

## Conflicts

1. Read both sides and the merge base before resolving. `git show $(git merge-base <theirs> HEAD):<file>` tells you which side actually changed what.

2. Resolve to intent, not to a side. A version number resolves to the higher one, a lock file regenerates.

3. Run the repo's gate on the merged tree before committing the merge.

## Rules

1. Never force push, switch branch, or run destructive commands without explicit user consent. A commit and a push land on the branch already checked out, and the branch being the right one is the user's responsibility.

2. Never use `--no-verify` or `--amend` unless explicitly asked.

3. Everything is the work of the current system git user. Never set an author, never add a trailer or a footer, and never name a tool or a model anywhere. `~/.claude/rules/git.md` carries this and binds whether or not this skill is loaded.
