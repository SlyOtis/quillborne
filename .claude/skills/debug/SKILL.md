---
name: debug
description: The debug process of Quillborne. Bring the checkout to the newest main, run the lint and the type check of a surface, read from that output where each error is and which agent owns it, then fix at the cause and forward. Use when the gate, a check or a build is red, before an agent reports its work done, and before a pull request is opened.
allowed-tools: Bash(bash .claude/skills/debug/scripts/*), Bash(just *), Bash(git *), Read, Grep, Glob
---

# Debug

Four steps, in order. The scripts answer the first three; the fourth is the work.

## The scripts

```
bash .claude/skills/debug/scripts/latest.sh            fetches origin/main and merges it into this branch; says how far behind it was and names the conflicts
bash .claude/skills/debug/scripts/check.sh <surface>   web: just check. go: just vet. sql: just migrate lint. all: the three. Prints each part ok or failed with its log, then every file and line named in a failure with its count and the agent that owns it
```

## The process

1. Latest. `latest.sh` first, always: an error main already fixed is not debugged, and a conflict is settled before anything is checked.
2. Lint and type check. `check.sh` with the surface the agent holds: `design` runs `web`, `go` runs `go`, `sql` runs `sql`, the `reviewer` runs `all`. A part that did not run is said as not run, never as ok.
3. Where. The `where` list is the map: one line per file and line, most errors first, with its owner. Read the log at the first line of each file, not the last; one cause at the top of a file is often every error below it. `git log --oneline -3 -- <file>` says whether this branch touched it.
4. Fix, forward. The owner fixes at the cause, in place, and runs `check.sh` again until its surface is ok. Forward means the code moves to what the task asked for: never a revert, never a check skipped or loosened, never a type widened or cast to quiet an error, never a wrapper around the line that fails.

## Ask the agents

5. A line whose owner is another agent is that agent's: say the file, the line and the error to it, through the table, and carry on with what is yours. `go` for `internal/` and `cmd/`, `sql` for `database/`, `design` for `web/src/`, `tester` for a test, `claimius` before a fix changes who reads or writes a row.
6. An error whose cause is not found after the log and the file are read is said as not located, with what was read. A guess is not a fix.
7. When the surface is ok, the rest of the gate follows: `just test`, `just build`. The `reviewer` runs them part by part and puts each real failure on the board.
