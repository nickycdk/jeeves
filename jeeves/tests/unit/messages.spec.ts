// AC-23: every failure the user can meet has a plain message saying what happened and what to do; one snapshot holds them all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MSG } from '../../src/adapter/ui.ts'
import { diskText, nearText, stopFailureCode, stopFailureText, USER_CLEAR_AUTO, USER_CLEAR_EXPLICIT, windowEndText } from '../../src/core/machine.ts'
import { probe } from '../../src/core/probe.ts'

const SNAPSHOT = join(import.meta.dirname, '../fixtures/messages.txt')
const ERRORS = ['rate_limit', 'authentication_failed', 'billing_error', 'overloaded', 'server_error', 'invalid_request', 'unknown'] as const

function allMessages(): string {
  const all = { 'command.run': true, 'prompt.submit': true, 'session.usage': true, 'process.run': true }
  return [
    ...ERRORS.map(e => `StopFailure ${e}: ${stopFailureText(stopFailureCode(e), e)}`),
    `StopFailure rate_limit (reset known): ${stopFailureText('RATE_LIMIT', 'rate_limit', '2026-11-07T14:00:00.000Z')}`,
    `Outdated version: ${probe({ version: '2.1.280', primitives: all }).message}`,
    `Disk error: ${diskText('/state/projects/p/tasks/t_1', 'write /state/projects/p/tasks/t_1/state.json.tmp-0123456789ab: EIO')}`,
    `Wrong branch: ${MSG.repoMismatch('main', 'feature/x')}`,
    `Wrong path: ${MSG.moved('t_1', '/work/old')}`,
    `Lock held: ${MSG.recoverHeld('t_1', 42)}`,
    `Unreadable state: ${MSG.corrupt('t_1')}`,
    `Auto task, first reading near the threshold: ${nearText(34)}`,
    `Auto task, model switch to 200K: ${windowEndText(200_000)}`,
    `Auto task, Stop hook skipped: ${MSG.autoUnsupported}`,
    `First eligible session: ${MSG.autoNotice(40, 1_000_000)}`,
    `Auto task, user /clear: ${USER_CLEAR_AUTO}`,
    `Explicit task, user /clear: ${USER_CLEAR_EXPLICIT}`,
    `Auto task made explicit: ${MSG.madeExplicit('t_1', 2)}`,
    `Hint, not watched (ST-14.1): ${MSG.hint(45)}`,
  ].join('\n') + '\n'
}

test('AC-23: the failure messages match their snapshot', () => {
  if (process.env.UPDATE_SNAPSHOTS === '1') writeFileSync(SNAPSHOT, allMessages())
  assert.equal(allMessages(), readFileSync(SNAPSHOT, 'utf8'))
})

test('ST-6.2 AC 1: each StopFailure code has its own reason and its own fix; plain ASCII', () => {
  const codes = ['RATE_LIMIT', 'AUTH', 'BILLING', 'OVERLOADED', 'API_ERROR'] as const
  const texts = codes.map(c => stopFailureText(c, 'x'))
  assert.equal(new Set(texts).size, codes.length)
  for (const [i, c] of codes.entries()) assert.ok(texts[i]!.startsWith(`Paused (${c}): `), texts[i])
  assert.match(stopFailureText('AUTH', 'authentication_failed'), /\/login/)
  for (const t of texts) assert.match(t, /^[\x20-\x7e]+$/)
  assert.match(stopFailureText('RATE_LIMIT', 'rate_limit', 'not a date'), /reached\. Then/)
})
