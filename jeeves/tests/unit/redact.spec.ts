import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL_MAX, eventDetail, redact } from '../../src/core/redact.ts'

const SECRETS: [string, string][] = [
  ['anthropic-key', 'key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv here'],
  ['openai-key', 'sk-proj-abcdefghijklmnopqrstuvwxyz012345'],
  ['github-token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
  ['aws-key-id', 'AKIAABCDEFGHIJKLMNOP'],
  ['slack-token', 'xoxb-1234567890-abcdefghij'],
  ['jwt', 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4fw'],
  ['bearer', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
  ['assignment', 'export DB_PASSWORD="hunter2 with spaces"'],
  ['assignment', '{"api_key": "abc123def456"}'],
  ['url-credentials', 'git clone https://user:pa55word@example.com/repo.git'],
  ['private-key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----'],
]

test('each secret format is redacted and named', () => {
  for (const [name, text] of SECRETS) {
    const out = redact(text)
    assert.match(out, new RegExp(`\\[REDACTED:${name}\\]`), `${name}: ${out}`)
    assert.ok(!/hunter2|pa55word|MIIEow|abcdefghijklmnopqrst|abc123def456/.test(out), `${name} leaked: ${out}`)
  }
})

test('clean code is left alone', () => {
  const code = 'const tokenCount = usage.tokens; git status --porcelain; npm test -- --grep "secret santa"'
  assert.equal(redact(code), code)
})

test('event details are redacted, flattened and capped', () => {
  assert.equal(eventDetail('a\n\n b'), 'a b')
  const long = eventDetail('x'.repeat(5000))
  assert.equal(long.length, DETAIL_MAX)
  assert.ok(long.endsWith('…'))
  assert.equal(eventDetail('ok ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'ok [REDACTED:github-token]')
})
