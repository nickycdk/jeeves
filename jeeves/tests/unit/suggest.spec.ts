// ST-11.2: verification-check suggestions from the repository's build files. Suggestions only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPm, suggestChecks, type RepoFiles } from '../../src/core/suggest.ts'

const pkg = (scripts: Record<string, string>, extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'x', scripts, ...extra })
const NONE: RepoFiles = { packageJson: null, makefile: null, justfile: null, pyproject: null, cargo: false, goMod: false, uvLock: false, poetryLock: false, pm: 'npm' }
const s = (f: Partial<RepoFiles>) => suggestChecks({ ...NONE, ...f })

test('AC 1: test and typecheck scripts -> two suggestions, npm test first', () => {
  assert.deepEqual(s({ packageJson: pkg({ build: 'tsc', typecheck: 'tsc --noEmit', test: 'node --test' }) }), ['npm test', 'npm run typecheck'])
})

test('AC 2: nothing matching -> none', () => {
  assert.deepEqual(s({ packageJson: pkg({ build: 'tsc', start: 'node .' }) }), [])
  assert.deepEqual(s({}), [])
})

test('AC 4: names with shell characters or too long are not shown; at most 2 from package.json', () => {
  assert.deepEqual(s({ packageJson: pkg({ 'test; rm -rf ~': 'x', [`test:${'a'.repeat(500)}`]: 'x', 'lint$(id)': 'x' }) }), [])
  assert.deepEqual(s({ packageJson: pkg({ test: 'a', 'test:unit': 'a', 'test:e2e': 'a', lint: 'a', typecheck: 'a', check: 'a' }) }), ['npm test', 'npm run test:unit'])
})

test('AC 5: invalid package.json -> none, no error; scripts not an object -> none', () => {
  assert.deepEqual(s({ packageJson: '{ nope' }), [])
  assert.deepEqual(s({ packageJson: JSON.stringify({ scripts: ['test'] }) }), [])
  assert.deepEqual(s({ packageJson: JSON.stringify({ scripts: { test: 7 } }) }), [])
})

test('Makefile test/lint targets, before package.json ones', () => {
  assert.deepEqual(s({ makefile: 'all: build\n\ntest: build\n\t./run\nlint:\n\tx\n  test-not:\n' }), ['make test', 'make lint'])
  assert.deepEqual(s({ packageJson: pkg({ test: 'x' }), makefile: 'test:\n\tx\n' }), ['make test', 'npm test'])
})

test('detectPm: packageManager field wins over a lockfile; each lockfile alone; none -> npm', () => {
  const no = { pnpmLock: false, yarnLock: false, bunLock: false }
  assert.equal(detectPm(pkg({}, { packageManager: 'pnpm@9.1.0' }), { ...no, yarnLock: true }), 'pnpm')
  assert.equal(detectPm(null, { ...no, pnpmLock: true }), 'pnpm')
  assert.equal(detectPm(null, { ...no, yarnLock: true }), 'yarn')
  assert.equal(detectPm(null, { ...no, bunLock: true }), 'bun')
  assert.equal(detectPm(pkg({}, { packageManager: 'weird' }), no), 'npm')
  assert.equal(detectPm('{ nope', no), 'npm')
})

test('runners per package manager; bun always uses run (bun test is a different tool)', () => {
  const p = pkg({ test: 'x', lint: 'y' })
  assert.deepEqual(s({ packageJson: p, pm: 'pnpm' }), ['pnpm test', 'pnpm run lint'])
  assert.deepEqual(s({ packageJson: p, pm: 'yarn' }), ['yarn test', 'yarn lint'])
  assert.deepEqual(s({ packageJson: p, pm: 'bun' }), ['bun run test', 'bun run lint'])
})

const PY = '[project]\nname = "x"\n[dependency-groups]\ndev = ["pytest>=8", "ruff", "mypy"]\n[tool.mypy]\nstrict = true\n'

test('pyproject: only with uv.lock or poetry.lock; mypy stays bare; at most 2', () => {
  assert.deepEqual(s({ pyproject: PY, uvLock: true }), ['uv run pytest', 'uv run ruff check .'])
  assert.deepEqual(s({ pyproject: '[tool.poetry.group.dev.dependencies]\nmypy = "^1"\n', poetryLock: true }), ['poetry run mypy'])
  assert.deepEqual(s({ pyproject: PY }), [])
})

test('pyproject: pytest-cov or a comment is not pytest; a config section alone is not a dependency', () => {
  assert.deepEqual(s({ pyproject: 'dev = ["pytest-cov"]\n# pytest is nice\n[tool.ruff]\nline-length = 100\n', uvLock: true }), [])
})

test('pyproject: a tool only in an optional extra is not installed by uv run, so not suggested', () => {
  assert.deepEqual(s({ pyproject: '[project.optional-dependencies]\ntest = [\n  "pytest>=8",\n]\n', uvLock: true }), [])
  assert.deepEqual(s({ pyproject: '[project.optional-dependencies]\ntest = ["pytest"]\n[dependency-groups]\ndev = ["pytest"]\n', uvLock: true }), ['uv run pytest'])
})

test('Makefile: variables are not targets; a double-colon rule is', () => {
  assert.deepEqual(s({ makefile: 'test := ./...\nlint ::= x\nbuild:\n\tgo build\n' }), [])
  assert.deepEqual(s({ makefile: 'test::\n\tx\n' }), ['make test'])
})

test('Cargo and Go', () => {
  assert.deepEqual(s({ cargo: true }), ['cargo test', 'cargo clippy'])
  assert.deepEqual(s({ goMod: true }), ['go test ./...', 'go vet ./...'])
})

test('justfile: quiet prefix, parameters and attribute lines; not other recipes or assignments', () => {
  assert.deepEqual(s({ justfile: "[group('ci')]\n@test *args:\n  cargo test {{args}}\nlint:\n  x\n" }), ['just test', 'just lint'])
  assert.deepEqual(s({ justfile: 'testing:\n  x\ntest-all:\n  x\ntest := "y"\n' }), [])
})

test('mixed repo: 2 per source, Makefile first, 4 in all', () => {
  const out = s({ makefile: 'test:\n\tx\n', packageJson: pkg({ test: 'a', lint: 'a', typecheck: 'a', check: 'a' }), goMod: true })
  assert.deepEqual(out, ['make test', 'npm test', 'npm run lint', 'go test ./...'])
})
