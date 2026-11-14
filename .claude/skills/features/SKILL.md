---
name: features
description: Take features in as they arrive in one session, keep the local board of them, give each surface one worktree and an agent that builds every task on it together, and merge the moment it works. Use when the user hands over a feature, a fix or a list of them, when a feature is to run beside another, when an agent reports its work done, when a pull request from a worktree is to be verified and merged, or when the user asks what is in motion.
argument-hint: "[board|take <title> <slug>|tree <number> <slug>|land <slug>]"
allowed-tools: Bash(bash .claude/skills/features/scripts/*), Bash(gh *), Bash(git *), Bash(just *), Agent, SendMessage, Read, Grep, Glob
---

# Features

One session is the table: it takes the features in, keeps the board, hands the features of one surface to one agent in one worktree, verifies what comes back on the main checkout and merges it. The agents build; the table never builds a feature itself while agents are out, so it is free to listen for the next one. The board is local: one file per task under `.claude/tasks/features/`, which the repo ignores, and no GitHub issue is made for a task. `~/.claude/rules/repos.md` and `workflow.md` 11 say where work lands: a branch per task, a pull request cut and merged as often as a feature works.

## The scripts

```
bash .claude/skills/features/scripts/board.sh                          every open task with its state, branch and pull request, every worktree with its slot and state, and main's head
bash .claude/skills/features/scripts/take.sh "<title>" <slug> [words]  the task file <number>-<slug>.md, numbered after the last, with the user's words
bash .claude/skills/features/scripts/tree.sh <number> <slug> [fix]     the worktree ../quillborne-<slug> on feat/<number>-<slug> from the newest main, linked, with its slot and database image; the task turns building
bash .claude/skills/features/scripts/land.sh <slug>                    after the merge: the worktree, its containers, image and branch removed, main pulled; the task turns done
```

A task file is `title`, `slug`, `state` (`open`, `building`, `review`, `done`), `branch`, `tree`, `pr`, `agent`, a blank line and the user's words. `take.sh` writes it, `tree.sh` and `land.sh` move its state, and the table writes `pr`, `agent` and `review` with `sed -i ''` when they are known. `tree.sh` prints the worktree's path last. It shares what can be shared and nothing else: `web/node_modules` is a link to the main checkout's when the lockfiles match, the `.env` is the checkout's own with the lowest free slot of `setup.md` Several checkouts at once, the seed is the main checkout's, and the database image, the containers and the volume are the worktree's own, named after its folder. `land.sh` refuses a tree with uncommitted changes or a branch main does not carry.

## Intake

1. Every feature the user hands over becomes a task before anything else: `take.sh` with a short title, a slug and the user's words as they were said, nothing inferred. A list becomes one task per item in the order given, and a task that cannot start before another says so in its words. No issue, no label, no comment on GitHub.
2. Keep listening. Between every step below, read what the user said since and take it in the same way; a new feature never waits for the one in flight.
3. Order the board by what the user said first, then by what blocks what. Tasks run in the same worktree as much as possible and are fixed together as much as possible: tasks that touch the same files, the same page or the same surface share one worktree, one agent, one branch and one pull request, and a task that arrives for a surface an agent already holds joins that agent through `SendMessage` with the new words and its own task number, never a second tree. Only tasks on surfaces apart get a worktree each and run side by side.

## Handing a task to an agent

4. `tree.sh <number> <slug>` for the task, then one `Agent` for it, `general-purpose`, with `isolation` unset, because the tree is already made; its name goes into the task's `agent` line. The brief carries, in this order: the worktree path and that every command runs from it; the task number and the user's words for the feature, nothing inferred; the files it owns and the files it must not touch; the contract it must not break, `~/.claude/rules/code.md`, the api spec as served and the claims model of `data.md`; the mechanism it must reuse, named by path; that it runs `just gate` in its tree and starts its stack with the `run` skill on its own slot when the feature has to be seen; that it commits on its branch with one line saying what the change does, pushes, opens the pull request, never as a draft, through the `github` skill with the body of `~/.claude/rules/git.md` and no issue line, slim: the paragraph one or two short sentences and each file line a few words, nothing explained twice, and reports the pull request number, the files it changed and what it could not do. No verification, screenshot or test step beyond the gate unless the user asked for one. A brief that names a section produces that section, so it names the diff.
5. Every file the brief names has been read in this session first; `~/.claude/hooks/read_gate.sh` refuses the call otherwise.

## When an agent reports

6. Write the pull request number into the task and set it to `review`. Read the pull request diff against main, not the report. A route, a verb and a state group move together, `cli.md`; a thing a player sees has its records in `database/state/local.ndjson`, `setup.md` Local test data.
7. Test on the main checkout when the feature has to be seen or felt: check the branch out there, start it with the `run` skill, drive it with the `nimon` skill, and put the checkout back on its branch after. A gate alone is enough for a change nothing visible depends on.
8. Mark the pull request ready when it is up to date with main and the gate is clean, and merge it through the `github` skill. Then `land.sh <slug>`, and the next task on the board starts from the main that now carries it.
9. A feature that comes back wrong goes back to the same agent through `SendMessage` with what is wrong in the user's words, never rebuilt by the table.

## Several sessions

10. Another session in the same checkout is told which files it owns and which are this session's, once, through `SendMessage`; each commits only its own files, and a change to a file the other owns is handed over rather than made. A branch two sessions share has one pull request.

## Hand over

11. Tell the user, per task: its number, the branch, the pull request and its state, and what, if anything, waits on them. The board is `board.sh`; nothing is restated from memory.
