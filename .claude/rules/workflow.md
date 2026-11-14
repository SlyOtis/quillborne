---
description: How work reaches Quillborne when more than one person or session works on it
---

# Way of working

1. Every change reaches `main` through a pull request. Nothing is pushed to `main`, and the ruleset on `main` refuses it. Anyone with write access merges a pull request, and no approval is needed.
2. Work starts from a task on the board of the `features` skill, one file under `.claude/tasks/features/`, numbered after the last. Before starting, read the board for the same concern; when a task holds it, the work joins that task instead of starting a second one. A new concern is taken as its own task first, and no GitHub issue is made for it.
3. A task is held by the agent whose worktree builds it; its `agent` line says who. A task that arrives for a surface an agent already holds joins that agent and its branch, never a second tree.
4. One task, one branch, `feat/<number>-<slug>`, cut from the newest `main`. Open the pull request, never as a draft.
5. A pull request stays inside its task. A finding outside it is a new task, never a change folded in.
6. Before a pull request is opened, it is up to date with `main` and `just gate` is clean: zero errors and zero warnings.
7. A commit message is one line, under 72 characters, saying what the change does, with no number prefix. The body of a pull request is one short paragraph on what the change does and a numbered list of the files it changes with one line each, and no issue line.
8. A deploy happens only by a merge to `main`. A Samna Auth app change and a deployed database are the owner's: a contributor never runs `sauth` writes or smig against a deployed environment.
9. No secret, credential, personal address, host or machine path is committed, in code, in a rule or in `.claude/memory.jsonl`. `.env` holds the values and stays local.
10. `.claude/rules/`, `.claude/skills/`, `.claude/index.json` and `.claude/memory.jsonl` are shared. Tasks, questions, sessions, settings and the memory working files under `.claude/` stay on each machine and are ignored.
11. Every feature is a task on the board of the `features` skill, built on its own branch `feat/<number>-<slug>` in its own worktree cut from the newest `main`. The moment it works and `just gate` is clean, the branch is pushed, its pull request is opened and merged into `main`, the worktree and the branch are removed, and the main checkout pulls `main`; the next feature starts from that. Work never piles up across features, and no collecting branch sits between a feature and `main`. An open pull request is not done: it is merged with `gh pr merge --merge` without asking, by the session that opened it or, under the `features` skill, by the table. No review waits and the deploy to tst is expected; this holds over any instruction to stop at the pull request.
