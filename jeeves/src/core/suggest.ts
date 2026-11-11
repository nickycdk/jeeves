// ST-11.2 (FR-10, R-19): check commands to suggest at /jeeves on. Suggestions only: nothing is added or run. Pure.

const KINDS = ['test', 'lint', 'typecheck', 'check'] as const
const SAFE = /^[A-Za-z0-9:_-]{1,40}$/
const MAX = 4
const PER_SOURCE = 2

export type Pm = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface RepoFiles {
  packageJson: string | null
  makefile: string | null
  justfile: string | null
  pyproject: string | null
  cargo: boolean
  goMod: boolean
  uvLock: boolean
  poetryLock: boolean
  pm: Pm
}

const parse = (packageJson: string | null): Record<string, unknown> | null => {
  try {
    const v: unknown = packageJson === null ? null : JSON.parse(packageJson)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  } catch { return null }
}

/** The `packageManager` field wins over lockfiles; no sign of another manager means npm. */
export function detectPm(packageJson: string | null, f: { pnpmLock: boolean; yarnLock: boolean; bunLock: boolean }): Pm {
  const field = parse(packageJson)?.packageManager
  const named = typeof field === 'string' ? /^(npm|pnpm|yarn|bun)@/.exec(field)?.[1] : undefined
  if (named) return named as Pm
  return f.pnpmLock ? 'pnpm' : f.yarnLock ? 'yarn' : f.bunLock ? 'bun' : 'npm'
}

// `bun test` runs bun's own test runner, not the script, so bun always gets `run`.
const runner = (pm: Pm, script: string) =>
  script === 'test' && pm !== 'bun' ? `${pm} test` : pm === 'yarn' ? `yarn ${script}` : `${pm} run ${script}`

function packageScripts(packageJson: string | null, pm: Pm): string[] {
  const scripts = parse(packageJson)?.scripts
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return []
  const names = Object.entries(scripts).filter(([n, v]) => typeof v === 'string' && SAFE.test(n)).map(([n]) => n)
  const out: string[] = []
  for (const k of KINDS) for (const n of names) if (n === k || n.startsWith(`${k}:`)) out.push(runner(pm, n))
  return out
}

const targets = (text: string | null, tool: string, line: (t: string) => RegExp) =>
  text === null ? [] : ['test', 'lint'].filter(t => line(t).test(text)).map(t => `${tool} ${t}`)

// A tool is suggested only when it is installed by default: `uv run` / `poetry run` fail for one that is not,
// and extras (`[project.optional-dependencies]`) are not installed without `--extra`.
function isDep(pyproject: string, tool: string): boolean {
  for (const m of pyproject.matchAll(new RegExp(`["']${tool}(?![\\w-])|^\\s*${tool}\\s*=`, 'gm'))) {
    const section = pyproject.slice(0, m.index).match(/^\s*\[[^\]\n]+\]/gm)?.at(-1) ?? ''
    if (!section.includes('optional-dependencies')) return true
  }
  return false
}

function python(f: RepoFiles): string[] {
  const py = f.pyproject
  if (py === null || !(f.uvLock || f.poetryLock)) return [] // bare tools usually sit in an inactive virtualenv
  const prefix = f.uvLock ? 'uv run' : 'poetry run'
  const tools: [string, string][] = [['pytest', 'pytest'], ['ruff', 'ruff check .'], ['mypy', 'mypy']]
  return tools.filter(([tool]) => isDep(py, tool)).map(([, cmd]) => `${prefix} ${cmd}`)
}

/**
 * Makefile and justfile first (in a mixed repo they are the declared entry point), then package.json, pyproject, Cargo, Go.
 * At most 2 per source, so one ecosystem cannot crowd out the others; 4 in all.
 */
export function suggestChecks(f: RepoFiles): string[] {
  const sources = [
    // `test := x` and `test ::= x` are variables, `test::` is still a target.
    targets(f.makefile, 'make', t => new RegExp(`^${t}\\s*:(?!:?=)`, 'm')),
    // just: optional `@` (quiet) and parameters before the colon; `:=` is an assignment.
    targets(f.justfile, 'just', t => new RegExp(`^@?${t}(\\s[^:\\n]*)?:(?!=)`, 'm')),
    packageScripts(f.packageJson, f.pm),
    python(f),
    f.cargo ? ['cargo test', 'cargo clippy'] : [],
    f.goMod ? ['go test ./...', 'go vet ./...'] : [],
  ]
  return sources.flatMap(s => s.slice(0, PER_SOURCE)).slice(0, MAX)
}
