// Type-checks against the engine-written claude-code declarations (claude plugin validate does not type-check).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tsc = resolve(root, 'node_modules/.bin/tsc')
const run = project => {
  try { execFileSync(tsc, ['-p', project], { cwd: root, stdio: 'inherit' }) } catch { process.exit(1) }
}

if (process.argv.includes('--core-only')) {
  run('tsconfig.core.json')
  console.log('typecheck: src/core only (no engine types); hooks/ and src/adapter/ NOT checked')
  process.exit(0)
}

const laid = resolve(root, '.claude-plugin/types')
const fromEnv = process.env.CLAUDE_CODE_TYPES
const include = fromEnv ? [resolve(fromEnv)] : existsSync(resolve(laid, 'claude-code/index.d.ts')) ? [laid] : null
if (!include) {
  console.error('typecheck: engine types not found. Load this folder once with `claude --plugin-dir .`\n' +
    '(Claude Code writes .claude-plugin/types/), or set CLAUDE_CODE_TYPES to its claude-code/index.d.ts.\n' +
    'Use `npm run typecheck -- --core-only` to check src/core alone.')
  process.exit(1)
}
const header = readFileSync(fromEnv ? include[0] : resolve(laid, 'claude-code/index.d.ts'), 'utf8').split('\n', 1)[0]
writeFileSync(resolve(root, 'tsconfig.engine.json'), JSON.stringify({
  extends: './tsconfig.json',
  include: [...include, 'hooks', 'src', 'tests/mod'],
}, null, 2))
run('tsconfig.engine.json')
console.log(`typecheck: ok against ${header.replace(/^\/\/\s*/, '')}`)
