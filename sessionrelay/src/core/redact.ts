// Minimal secret redaction (ST-1.5); ST-3.7 extends the pattern list. Pure.

/** [name, pattern, high]: `high` patterns are specific enough to reject a handover that contains one (ST-3.6). */
const PATTERNS: [string, RegExp, boolean][] = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, true],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{10,}/g, true],
  ['openai-key', /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g, true],
  ['github-token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, true],
  ['aws-key-id', /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, true],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, true],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, true],
  ['bearer', /\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{16,}=*/gi, false],
  ['assignment', /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/g, false],
  ['assignment', /(["']?\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)["']?)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, false],
  ['url-credentials', /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, true],
]

/** Names of the high-confidence secret formats found in `text` (empty when none). */
export function findSecrets(text: string): string[] {
  return [...new Set(PATTERNS.filter(([, re, high]) => high && new RegExp(re.source, re.flags.replace('g', '')).test(text)).map(([name]) => name))]
}

export function redact(text: string): string {
  let out = text
  for (const [name, re] of PATTERNS) {
    out = out.replace(re, (...m: string[]) => {
      if (name === 'assignment') return `${m[1]}=[REDACTED:${name}]`
      if (name === 'url-credentials') return `${m[1]}[REDACTED:${name}]@`
      return `[REDACTED:${name}]`
    })
  }
  return out
}

/** Event details are short by construction, so a prompt or handover can never be logged whole. */
export const DETAIL_MAX = 200

export function eventDetail(text: string): string {
  const flat = redact(text).replace(/\s+/g, ' ').trim()
  return flat.length > DETAIL_MAX ? `${flat.slice(0, DETAIL_MAX - 1)}…` : flat
}
