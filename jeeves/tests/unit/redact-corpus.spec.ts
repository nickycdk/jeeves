// ST-3.7: secret corpus (synthetic, built at run time so no key-like literal sits in the repo) and the
// false-positive rate on normal code and handovers (< 1 changed line per 10,000).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toolRecord } from '../../src/core/evidence.ts'
import { findSecrets, redact } from '../../src/core/redact.ts'
import { prng } from './helpers.ts'

const rnd = prng(7)
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[rnd.int(chars.length)]).join('')
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = 'abcdefghijklmnopqrstuvwxyz', D = '0123456789'
const ALNUM = AZ + az + D, B64 = ALNUM + '_-'

/** [kind, the secret itself, the text it sits in, high-confidence]. */
const CORPUS: [string, string, (s: string) => string, boolean][] = [
  ['anthropic-key', `sk-ant-api03-${pick(B64, 40)}`, s => `ANTHROPIC said use ${s} for now`, true],
  ['openai-key', `sk-proj-${pick(B64, 48)}`, s => `client = OpenAI(api_key=${s})`, true],
  ['openai-key', `sk-${pick(ALNUM, 48)}`, s => `key ${s}`, true],
  ['github-token', `ghp_${pick(ALNUM, 36)}`, s => `git push https://x:${s}@github.com/a/b`, true],
  ['github-token', `github_pat_${pick(ALNUM + '_', 60)}`, s => `token=${s}`, true],
  ['aws-key-id', `AKIA${pick(AZ + D, 16)}`, s => `aws_access_key_id = ${s}`, true],
  ['stripe-key', `sk_live_${pick(ALNUM, 24)}`, s => `Stripe.apiKey = "${s}";`, true],
  ['stripe-key', `rk_test_${pick(ALNUM, 24)}`, s => `restricted ${s}`, true],
  ['stripe-key', `whsec_${pick(ALNUM, 32)}`, s => `endpoint secret ${s}`, true],
  ['slack-token', `xoxb-${pick(D, 12)}-${pick(ALNUM, 24)}`, s => `SLACK ${s}`, true],
  ['jwt', `eyJ${pick(B64, 20)}.${pick(B64, 40)}.${pick(B64, 30)}`, s => `cookie: session=${s}`, true],
  ['private-key', `-----BEGIN OPENSSH PRIVATE KEY-----\n${pick(ALNUM, 64)}\n-----END OPENSSH PRIVATE KEY-----`, s => `id_ed25519:\n${s}\n`, true],
  ['private-key', `-----BEGIN EC PRIVATE KEY-----\n${pick(ALNUM, 64)}`, s => `${s}\n(truncated)`, true],
  ['url-credentials', `deploy:${pick(ALNUM, 14)}`, s => `DATABASE_URL=postgres://${s}@db.internal:5432/app`, true],
  ['bearer', pick(ALNUM, 32), s => `curl -H "Authorization: Bearer ${s}" https://api`, false],
  ['assignment', pick(ALNUM, 40), s => `AWS_SECRET_ACCESS_KEY=${s}`, false],
  ['assignment', `${pick(az, 6)} ${pick(az, 5)}`, s => `export DB_PASSWORD="${s}"`, false],
  ['assignment', pick(ALNUM + '/+', 40), s => `aws_secret_access_key = ${s}`, false],
  ['assignment', `${pick(ALNUM, 20)}9`, s => `{"client_secret": "${s}"}`, false],
  ['assignment', 'Tr0ub4dor&3', s => `password: '${s}'`, false],
  ['assignment', `${pick(az, 12)}7${pick(ALNUM, 12)}`, s => `NPM_TOKEN: ${s}`, false],
]

test('the secret corpus covers every supported format', () => {
  const kinds = new Set(CORPUS.map(c => c[0]))
  for (const k of ['anthropic-key', 'openai-key', 'github-token', 'aws-key-id', 'stripe-key', 'slack-token', 'jwt', 'private-key', 'url-credentials', 'bearer', 'assignment']) assert.ok(kinds.has(k), k)
})

test('AC (1): every synthetic secret is fully masked, and the high-confidence ones are flagged for handovers', () => {
  for (const [kind, secret, wrap, high] of CORPUS) {
    const text = wrap(secret)
    const out = redact(text)
    for (const part of secret.split(/[\s\n]+/).filter(p => p.length >= 6 && !p.startsWith('-----'))) assert.ok(!out.includes(part), `${kind} leaked "${part}": ${out}`)
    if (high) assert.ok(findSecrets(text).includes(kind), `${kind} not flagged: ${text}`)
  }
})

/** Normal code: every .d.ts under node_modules (TypeScript's own libs, ~83K lines), our source, and the clean handovers. */
function cleanCorpus(): { lines: string[]; sources: number } {
  const root = new URL('../../', import.meta.url).pathname
  const files = [
    ...(existsSync(join(root, 'node_modules')) ? (readdirSync(join(root, 'node_modules'), { recursive: true }) as string[]).filter(f => f.endsWith('.d.ts')).map(f => join(root, 'node_modules', f)) : []),
    ...(readdirSync(join(root, 'src'), { recursive: true }) as string[]).filter(f => f.endsWith('.ts')).map(f => join(root, 'src', f)),
    ...readdirSync(join(root, 'tests/fixtures/handover')).filter(f => f !== 'secret-inside.md').map(f => join(root, 'tests/fixtures/handover', f)),
  ]
  return { lines: files.flatMap(f => readFileSync(f, 'utf8').split('\n')), sources: files.length }
}

test('AC (2): false positives on normal code and handovers stay under 1 per 10,000 lines', () => {
  const { lines, sources } = cleanCorpus()
  assert.ok(lines.length >= 10_000, `corpus too small (${lines.length} lines from ${sources} files): run npm ci`)
  const changed = lines.filter(l => redact(l) !== l)
  const per10k = (changed.length / lines.length) * 10_000
  console.log(`# redaction false positives: ${changed.length} in ${lines.length} lines (${per10k.toFixed(2)} per 10K)`)
  assert.ok(per10k < 1, changed.slice(0, 5).join('\n'))
})

test('review fix 1: linear on hostile input; a 1 MB heredoc command is cut first and a secret near its start is still masked', () => {
  let t = performance.now()
  redact('x=' + 'a.'.repeat(100_000))
  redact('postgres://' + 'a.'.repeat(100_000))
  assert.ok(performance.now() - t < 1000, `${performance.now() - t} ms`)
  const key = `ghp_${pick(ALNUM, 36)}`
  t = performance.now()
  const rec = toolRecord({ tool: 'Bash', args: { command: `GH=${key} cat > f <<'EOF'\n${'a.'.repeat(500_000)}\nEOF` }, denied: false, isError: false, backgrounded: false })
  assert.ok(performance.now() - t < 200)
  assert.ok(rec?.kind === 'cmd' && !rec.command.includes(key) && rec.command.length <= 300)
})
