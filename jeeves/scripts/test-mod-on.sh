#!/bin/sh
# The mod suite again with the /config row autoStart 'on' (spec §9: the I-layer suite runs off and on).
# Runs in a temporary copy, so tests/mod/mode.ts in the work tree is never changed.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules . "$tmp/jeeves"
sed -i.bak "s/AUTO_START: 'off' | 'on' = 'off'/AUTO_START: 'off' | 'on' = 'on'/" "$tmp/jeeves/tests/mod/mode.ts"
grep -q "= 'on'" "$tmp/jeeves/tests/mod/mode.ts" || { echo 'test-mod-on: could not set the mode in tests/mod/mode.ts' >&2; exit 1; }
rm "$tmp/jeeves/tests/mod/mode.ts.bak"
claude plugin test "$tmp/jeeves"
