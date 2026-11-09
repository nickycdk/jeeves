#!/bin/sh
# Local equivalent of CI plus the mod checks: typecheck, lint, test, test:mod (stop x off, stop x on, turn x off), validate.
set -e
cd "$(dirname "$0")/.."
# Without the engine types (a fresh clone that never ran `claude --plugin-dir .`) only src/core is type-checked.
if [ -n "$CLAUDE_CODE_TYPES" ] || [ -f .claude-plugin/types/claude-code/index.d.ts ]; then npm run -s typecheck
else echo 'WARNING: engine types missing, so hooks/ and src/adapter/ are NOT type-checked. Run `claude --plugin-dir .` once (see CONTRIBUTING).'; npm run -s typecheck -- --core-only; fi
npm run -s lint
out=$(mktemp); npm test > "$out" 2>&1 || { cat "$out"; exit 1; }
grep -E '^# (tests|pass|fail)' "$out"; rm -f "$out"
# ST-17.2: the AC-41 driver's void check.
python3 -I tests/pty/void_check_test.py
# A pipe would hide the exit code: keep the output, print the summary (and any failure), then fail on it.
out=$(mktemp); if npm run -s test:mod > "$out" 2>&1; then tail -3 "$out"; else grep -A12 '(fail)' "$out"; tail -3 "$out"; rm -f "$out"; exit 1; fi; rm -f "$out"
# The same suite with auto-start on (spec §9: off and on).
out=$(mktemp); if npm run -s test:mod:on > "$out" 2>&1; then echo "auto-start on: $(tail -3 "$out" | head -1)"; else grep -A12 '(fail)' "$out"; tail -3 "$out"; rm -f "$out"; exit 1; fi; rm -f "$out"
# ST-16.7: the same suite as on a Team account (turn mode), auto-start off.
out=$(mktemp); if npm run -s test:mod:turn > "$out" 2>&1; then echo "turn mode: $(tail -3 "$out" | head -1)"; else grep -A12 '(fail)' "$out"; tail -3 "$out"; rm -f "$out"; exit 1; fi; rm -f "$out"
out=$(mktemp); npm run -s validate > "$out" 2>&1 || { cat "$out"; exit 1; }; tail -1 "$out"
# The repository root is the marketplace (ST-8.1).
(cd .. && claude plugin validate . > "$out" 2>&1) || { cat "$out"; exit 1; }; echo "marketplace: $(tail -1 "$out")"; rm -f "$out"
