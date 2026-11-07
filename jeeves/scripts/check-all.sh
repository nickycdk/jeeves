#!/bin/sh
# Local equivalent of CI plus the mod checks: typecheck, lint, test, test:mod, validate.
set -e
cd "$(dirname "$0")/.."
npm run -s typecheck
npm run -s lint
out=$(mktemp); npm test > "$out" 2>&1 || { cat "$out"; exit 1; }
grep -E '^# (tests|pass|fail)' "$out"; rm -f "$out"
# A pipe would hide the exit code: keep the output, print the summary (and any failure), then fail on it.
out=$(mktemp); if npm run -s test:mod > "$out" 2>&1; then tail -3 "$out"; else grep -A12 '(fail)' "$out"; tail -3 "$out"; rm -f "$out"; exit 1; fi; rm -f "$out"
npm run -s validate 2>&1 | tail -1
