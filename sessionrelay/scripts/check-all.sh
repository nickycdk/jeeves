#!/bin/sh
# Local equivalent of CI plus the mod checks: typecheck, lint, test, test:mod, validate.
set -e
cd "$(dirname "$0")/.."
npm run -s typecheck
npm run -s lint
out=$(mktemp); npm test > "$out" 2>&1 || { cat "$out"; exit 1; }
grep -E '^# (tests|pass|fail)' "$out"; rm -f "$out"
npm run -s test:mod 2>&1 | tail -3
npm run -s validate 2>&1 | tail -1
