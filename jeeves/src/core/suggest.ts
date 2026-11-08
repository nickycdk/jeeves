// ST-11.2 (FR-10, R-19): check commands to suggest at /jeeves on. Suggestions only: nothing is added or run. Pure.

const KINDS = ['test', 'lint', 'typecheck', 'check'] as const
const SAFE = /^[A-Za-z0-9:_-]{1,40}$/
const MAX = 4

/** `npm test` / `npm run <name>` for package.json scripts named after a kind (`test`, `test:unit`), then `make test|lint`. */
export function suggestChecks(packageJson: string | null, makefile: string | null): string[] {
  const out: string[] = []
  let scripts: unknown
  try { scripts = packageJson === null ? null : (JSON.parse(packageJson) as { scripts?: unknown })?.scripts } catch { scripts = null }
  if (typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)) {
    const names = Object.entries(scripts).filter(([n, v]) => typeof v === 'string' && SAFE.test(n)).map(([n]) => n)
    for (const k of KINDS) for (const n of names) if (n === k || n.startsWith(`${k}:`)) out.push(n === 'test' ? 'npm test' : `npm run ${n}`)
  }
  for (const t of ['test', 'lint']) if (makefile !== null && new RegExp(`^${t}\\s*:`, 'm').test(makefile)) out.push(`make ${t}`)
  return out.slice(0, MAX)
}
