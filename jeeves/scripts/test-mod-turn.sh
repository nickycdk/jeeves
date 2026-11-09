#!/bin/sh
# The mod suite again as on a Team account: tests/mod/mode.ts's BOUNDARY 'turn' (ST-16.7; the kit seats the prepend
# plugin that passes classic.Stop, classic.SessionStart, session.compact and prompt.compose on past Jeeves).
# Runs in a temporary copy, so tests/mod/mode.ts in the work tree is never changed.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules . "$tmp/jeeves"
sed -i.bak "s/BOUNDARY: 'stop' | 'turn' = 'stop'/BOUNDARY: 'stop' | 'turn' = 'turn'/" "$tmp/jeeves/tests/mod/mode.ts"
grep -q "= 'turn'" "$tmp/jeeves/tests/mod/mode.ts" || { echo 'test-mod-turn: could not set the mode in tests/mod/mode.ts' >&2; exit 1; }
rm "$tmp/jeeves/tests/mod/mode.ts.bak"
claude plugin test "$tmp/jeeves"
