// Capability probe, adapter half (ADR-002 A1): reads the facts; core/probe.ts decides.
// The engine refuses `$` nouns used as values, so there are no typeof checks: side-effect-free primitives are
// called once here; $.command.run and $.prompt.submit are checked at first use (a rejection -> assisted).
import type { EngineInterface } from 'claude-code'
import { probe, type Probe, type ProbeFacts } from '../core/probe.ts'

export async function probeFacts($: EngineInterface): Promise<ProbeFacts> {
  let version: string | null = null
  try { const v = await $.session.version(); version = v.base ?? v.version } catch { version = null }
  const usage = await $.session.usage().then(() => true, () => false)
  const process = await $.process.run(['true'], { timeoutMs: 5000 }).then(r => r.exitCode === 0, () => false)
  return {
    version,
    primitives: { 'session.usage': usage, 'process.run': process, 'command.run': true, 'prompt.submit': true },
  }
}

export async function runProbe($: EngineInterface): Promise<Probe> {
  return probe(await probeFacts($))
}
