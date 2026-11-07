// Secret redaction (ST-1.5, ST-3.7; FR-16, NFR-10). Used for event details, ledger commands and handover validation. Pure.
// Residual risk (PRIVACY.md): only these formats are caught; a secret with no known prefix and no key-like name passes.

/** [name, pattern, high]: `high` patterns are specific enough to reject a handover that contains one (ST-3.6). */
const PATTERNS: [string, RegExp, boolean][] = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, true],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{10,}/g, true],
  ['openai-key', /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g, true],
  ['github-token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, true],
  ['aws-key-id', /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, true],
  ['stripe-key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|\bwhsec_[A-Za-z0-9]{20,}/g, true],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, true],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, true],
  // Runs are bounded ({0,40}, {0,80}) so a long dotted token cannot make a pattern rescan quadratically.
  ['url-credentials', /\b([a-z][a-z0-9+.-]{0,40}:\/\/)[^\s/:@]{1,200}:[^\s/@]{1,200}@/gi, true],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, false],
  // After "token" a value counts only when it holds a digit ("token cancellationRequested" is prose).
  ['bearer', /\btoken\s+(?=[A-Za-z._~+/-]*\d)[A-Za-z0-9._~+/-]{16,}=*/gi, false],
]

/** A key-like name (`API_KEY`, `aws_secret_access_key`, `"password"`), then `=` or `:`, then a value. */
const ASSIGNMENT = /(["']?\b[A-Za-z0-9_.-]{0,80}?(?:secret|password|passwd|pwd|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_.-]{0,80}["']?)(\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi

/**
 * Whether an assigned value looks like a secret rather than code. Quoted: 6+ characters, no spaces, and not a plain
 * word ("webauthn", "same-origin" are enum values). Bare: 8+ token characters with a digit. Identifiers, type names,
 * calls and generics (`string`, `process.env.X`, `Token<Kind>`) are not secrets.
 */
function secretValue(v: string): boolean {
  const quoted = /^(["']).*\1$/.test(v)
  const inner = quoted ? v.slice(1, -1) : v
  if (/^\[REDACTED/.test(inner)) return false
  if (quoted) return inner.length >= 6 && !/\s/.test(inner) && !/^[a-z-]+$/.test(inner) && !/^[A-Z][a-z]+$/.test(inner)
  return inner.length >= 8 && /^[A-Za-z0-9+/_.~=@-]+$/.test(inner) && /\d/.test(inner)
}

export function redact(text: string): string {
  let out = text
  for (const [name, re] of PATTERNS) {
    out = out.replace(re, (...m: string[]) => (name === 'url-credentials' ? `${m[1]}[REDACTED:${name}]@` : `[REDACTED:${name}]`))
  }
  return out.replace(ASSIGNMENT, (all, key: string, sep: string, value: string) =>
    // An env-style name (DB_PASSWORD=...) is signal enough: any value after it goes.
    (/^["']?[A-Z0-9_]+["']?$/.test(key) && !/^["']{2}$/.test(value)) || secretValue(value) ? `${key}${sep}[REDACTED:assignment]` : all)
}

/** Names of the high-confidence secret formats found in `text` (empty when none). */
export function findSecrets(text: string): string[] {
  return [...new Set(PATTERNS.filter(([, re, high]) => high && new RegExp(re.source, re.flags.replace('g', '')).test(text)).map(([name]) => name))]
}

/** Event details are short by construction, so a prompt or handover can never be logged whole. */
export const DETAIL_MAX = 200

export function eventDetail(text: string): string {
  const flat = redact(text).replace(/\s+/g, ' ').trim()
  return flat.length > DETAIL_MAX ? `${flat.slice(0, DETAIL_MAX - 1)}…` : flat
}
