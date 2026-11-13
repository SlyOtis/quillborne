#!/bin/bash
set -euo pipefail

title=${1:?title}
slug=${2:?slug}
shift 2
words=${*:-}

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
board="$main/.claude/tasks/features"
mkdir -p "$board"

last=$(ls "$board" 2>/dev/null | sed -n 's/^\([0-9][0-9]*\)-.*\.md$/\1/p' | sort -n | tail -1)
number=$(( ${last:-0} + 1 ))
file="$board/$number-$slug.md"

{
    echo "title: $title"
    echo "slug: $slug"
    echo "state: open"
    echo "branch: feat/$number-$slug"
    echo "tree:"
    echo "pr:"
    echo "agent:"
    echo
    echo "$words"
} > "$file"
echo "task $number: $title"
echo "$file"
