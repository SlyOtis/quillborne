#!/bin/bash
set -euo pipefail

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
cd "$main"
board="$main/.claude/tasks/features"

echo "tasks"
if [ -d "$board" ] && ls "$board"/*.md > /dev/null 2>&1; then
    for name in $(ls "$board" | grep -E '^[0-9]+-.*\.md$' | sort -n); do
        file="$board/$name"
        number="${name%%-*}"
        title="$(sed -n 's/^title: //p' "$file")"
        state="$(sed -n 's/^state: //p' "$file")"
        branch="$(sed -n 's/^branch: //p' "$file")"
        pr="$(sed -n 's/^pr: //p' "$file")"
        [ "$state" = "done" ] && continue
        echo "  $number	$state	$title	$branch	${pr:-no PR}"
    done
else
    echo "  none"
fi

echo "trees"
git worktree list --porcelain | awk '/^worktree /{tree=$2} /^branch /{sub("refs/heads/","",$2); print tree "\t" $2}' | while IFS=$'\t' read -r tree branch; do
    [ "$tree" = "$main" ] && continue
    port="$(sed -n 's/^SERVER_PORT=//p' "$tree/.env" 2>/dev/null)"
    dirty="clean"
    [ -n "$(git -C "$tree" status --porcelain 2>/dev/null)" ] && dirty="uncommitted"
    ahead="$(git rev-list --count "origin/main..$branch" 2>/dev/null || echo 0)"
    running="idle"
    for pid in $(pgrep -fx 'just dev' || true); do
        [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$tree" ] && running="running on $port"
    done
    pr="$(gh pr list --head "$branch" --state open --json number,isDraft --jq '.[] | "PR \(.number)\(if .isDraft then " draft" else "" end)"' 2>/dev/null | head -1)"
    echo "  $(basename "$tree")	$branch	$ahead ahead	$dirty	$running	${pr:-no PR}"
done

echo "main"
git fetch -q origin main 2> /dev/null || true
echo "  $(git log --oneline -1 origin/main)"
