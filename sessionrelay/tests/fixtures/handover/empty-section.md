<<<SESSIONRELAY-HANDOVER v1 task=t_20261107_k3m9qa rotation=r_fixture01
## Completed since last handover
- [verified] Added `sub` and `mul` to `src/calc.js`; both exported.
- [inferred] The parser module is half done: tokenising works, precedence does not.

## Decisions and constraints

## Tests and checks
- [verified] `npm run lint` passed.
- [verified] `npm test` fails: 2 precedence cases in `test/calc.test.js`.

## Open work and blockers
- [verified] Operator precedence in `src/parse.js` is not implemented.
- [unknown] Whether unary minus is in scope.

## Exact next actions
1. [inferred] Implement precedence climbing in `src/parse.js`.
2. [inferred] Re-run `npm test` until the 2 precedence cases pass.

## Do not repeat / do not change
- [verified] Do not rewrite the tokenizer in `src/tokenize.js`; it passes its tests.
SESSIONRELAY-HANDOVER>>>
