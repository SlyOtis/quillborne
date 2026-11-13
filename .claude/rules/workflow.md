---
description: How work reaches Quillborne when more than one person or session works on it
---

# Way of working

1. Every change reaches `main` through a pull request. Nothing is pushed to `main`. Only the repository owner approves and merges, `.github/CODEOWNERS` and the branch protection on `main` enforce it, and an approval or a merge is never asked of anyone else.
2. Work starts from an issue. Before starting, search the open issues and pull requests, `gh issue list` and `gh pr list`, for the same concern; when one exists, the work joins it instead of starting a second one. A new concern opens its own issue first.
3. The issue is claimed before any code is written: assign it to yourself and say in a comment what you are taking. An issue someone else holds is theirs; ask on it before touching what it names.
4. One issue, one branch, `feat/<number>-<slug>` or `fix/<number>-<slug>`, cut from the newest `main`. Open the pull request as a draft as soon as the first commit is pushed, so others see what is in motion, and mark it ready when `just gate` passes.
5. A pull request stays inside its issue. A finding outside it is a new issue, never a change folded in.
6. Before a pull request is marked ready, it is up to date with `main` and `just gate` is clean: zero errors and zero warnings.
7. A commit message is one line, at most 72 characters, `#<number>: <what the change does>`. The body of a pull request is `Closes #<number>` or `Refs #<number>`, one short paragraph on what the change does, and a numbered list of the files it changes with one line each.
8. A deploy happens only by a merge to `main`, which only the owner approves. A Samna Auth app change and a deployed database are the owner's too: a contributor never runs `sauth` writes or smig against a deployed environment.
9. No secret, credential, personal address, host or machine path is committed, in code, in a rule or in `.claude/memory.jsonl`. `.env` holds the values and stays local.
10. `.claude/rules/`, `.claude/skills/`, `.claude/index.json` and `.claude/memory.jsonl` are shared. Tasks, questions, sessions, settings and the memory working files under `.claude/` stay on each machine and are ignored.
11. A pull request is cut and merged as often as there is a working feature. The moment a feature works locally and `just gate` is clean, the branch is pushed, the pull request is opened and it is merged; the next feature starts from the newest `main`. Work never piles up on a branch across features, and a branch that holds more than one working feature is overdue.
