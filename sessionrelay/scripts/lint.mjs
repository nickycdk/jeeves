// Small project rules tsc cannot express. No ESLint (ADR-008: typescript is the only dev dependency).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const files = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
})
const errors = []
const check = (file, re, why) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => { if (re.test(line)) errors.push(`${relative(root, file)}:${i + 1}: ${why}`) })
}

for (const f of files(join(root, 'src/core'))) {
  check(f, /\bDate\.now\(|new Date\(\)|Math\.random\(/, 'core must be pure: pass time and randomness in')
  check(f, /from 'claude-code'|\$\./, 'core must not touch the engine')
  check(f, /from 'node:/, 'core must not import Node modules')
}
for (const f of [...files(join(root, 'src')), ...files(join(root, 'hooks'))]) {
  check(f, /\bimport\(/, 'the engine refuses a module holding import()')
  // AC-19: SessionRelay never mutates git.
  check(f, /['"](commit|push|reset|stash|checkout|rebase|merge|add|restore|clean|switch)['"]\s*[,\]]/, 'possible git-mutating argv')
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.dependencies && Object.keys(pkg.dependencies).length) errors.push('package.json: runtime dependencies are not allowed (ADR-008)')
const dev = Object.keys(pkg.devDependencies ?? {})
if (dev.join() !== 'typescript') errors.push(`package.json: only typescript may be a dev dependency, found ${dev}`)
if (!/^\d/.test(pkg.devDependencies?.typescript ?? '')) errors.push('package.json: pin typescript exactly')
for (const f of files(join(root, 'tests/unit'))) if (/\.test\.tsx?$/.test(f)) errors.push(`${relative(root, f)}: unit tests use .spec.ts (claude plugin test runs every *.test.ts)`)

if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('lint: ok')
