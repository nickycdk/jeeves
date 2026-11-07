# Performance

Budgets come from NFR-03. Numbers are from this repo's own tests on the maintainer's Mac (Apple Silicon, Node 22.22, Claude Code 2.1.319).

## Evidence ledger (ST-3.1)

The `tool.call` hook waits for the tool's answer, hands it back unchanged, and records the ledger entry after the hook has returned. The disk write (read state, write, rename) never delays the call.

| Measure | p95 | Budget | Test |
|---|---|---|---|
| Entry + reducer, 2,000 calls, ledger full (200) | 0.014 ms | < 5 ms | `tests/unit/evidence.spec.ts` |
| Whole hook through the engine test kit, 100 calls | 0.56 ms | < 5 ms | `tests/mod/ledger.test.ts` |

The second figure includes the test kit's own dispatch, so the hook's share is smaller. Not measured: the deferred disk write under a real engine (it runs off the tool's path).
