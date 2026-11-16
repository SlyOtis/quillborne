#!/bin/bash
set -uo pipefail

surface="${1:-all}"
out="$(mktemp -d)"
failed=0

run() {
    name="$1"
    shift
    if "$@" > "$out/$name.log" 2>&1; then
        echo "$name: ok"
    else
        echo "$name: failed, $out/$name.log"
        failed=1
    fi
}

case "$surface" in
    web) run check just check ;;
    go) run vet just vet ;;
    sql) run lint just migrate lint ;;
    all) run check just check; run vet just vet; run lint just migrate lint ;;
    *) echo "surface: web, go, sql or all"; exit 2 ;;
esac

[ "$failed" = "0" ] && exit 0

echo "where"
cat "$out"/*.log \
    | grep -oE '[A-Za-z0-9_./-]+\.(svelte|ts|js|go|sql|yml)[:(][0-9]+' \
    | sed -E "s|^$PWD/||; s|^\./||; s|\(|:|" \
    | sort | uniq -c | sort -rn \
    | while read -r count place; do
        case "$place" in
            web/test/*|test/*|*.spec.ts:*) owner=tester ;;
            web/*|src/*) owner=design ;;
            internal/*|cmd/*) owner=go ;;
            database/*) owner=sql ;;
            *) owner=table ;;
        esac
        echo "  $place	$count	$owner"
    done
exit 1
