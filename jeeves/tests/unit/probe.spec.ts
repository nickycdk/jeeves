import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, MIN_VERSION, probe, withoutStopHook, type ProbeFacts } from '../../src/core/probe.ts'

const all = { 'command.run': true, 'prompt.submit': true, 'session.usage': true, 'process.run': true }
const facts = (over: Partial<ProbeFacts> = {}): ProbeFacts => ({ version: '2.1.319', primitives: all, ...over })

test('compareVersions on x.y.z cores', () => {
  assert.equal(compareVersions('2.1.319', '2.1.319'), 0)
  assert.equal(compareVersions('2.1.320', '2.1.319'), 1)
  assert.equal(compareVersions('2.2.0', '2.1.999'), 1)
  assert.equal(compareVersions('2.1.99', '2.1.319'), -1)
  assert.equal(compareVersions('2.1.320-dev', '2.1.319'), 1)
  assert.equal(compareVersions('banana', '2.1.319'), null)
})

test('supported version with every primitive -> full', () => {
  assert.deepEqual(probe(facts()), { mode: 'full', version: '2.1.319', missing: [], message: null })
  assert.equal(probe(facts({ version: '2.3.0' })).mode, 'full')
})

test('below the range -> unsupported, naming the exact version needed', () => {
  const p = probe(facts({ version: '2.1.280' }))
  assert.equal(p.mode, 'unsupported')
  assert.equal(p.message, `Jeeves needs Claude Code ${MIN_VERSION} or later (this is 2.1.280). Automatic rotation is off. Update Claude Code (claude update) and restart the session.`)
  assert.equal(probe(facts({ version: null })).mode, 'unsupported')
  assert.match(probe(facts({ version: null })).message!, /its version could not be read/)
  assert.equal(probe(facts({ version: 'nightly' })).mode, 'unsupported')
})

test('a missing primitive -> assisted, listing what is missing; a skipped Stop hook -> unsupported', () => {
  const p = probe(facts({ primitives: { ...all, 'process.run': false } }))
  assert.deepEqual([p.mode, p.missing], ['assisted', ['$.process.run']])
  assert.deepEqual([withoutStopHook(probe(facts())).mode, withoutStopHook(probe(facts())).missing], ['unsupported', ['classic.Stop hook']])
  assert.equal(withoutStopHook(probe(facts({ version: '2.1.1' }))).missing[0], 'Claude Code 2.1.319+', 'a version refusal stays')
  assert.equal(probe(facts({ version: '2.1.1', primitives: { ...all, 'process.run': false } })).mode, 'unsupported', 'version gate wins')
})
