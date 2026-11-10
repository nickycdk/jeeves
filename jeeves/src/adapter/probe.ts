// Capability probe, adapter half (ADR-002 A1): reads the facts; core/probe.ts decides.
// The engine refuses `$` nouns used as values, so there are no typeof checks: side-effect-free primitives are
// called once here; command.run and prompt.submit are checked at first use (a rejection -> assisted).
import type { EnginePort } from './ports.ts'
import { probe, type Probe, type ProbeFacts } from '../core/probe.ts'

export async function probeFacts(port: EnginePort): Promise<ProbeFacts> {
  let version: string | null = null
  try { const v = await port.version(); version = v.base ?? v.version } catch { version = null }
  const usage = await port.usage().then(() => true, () => false)
  const process = await port.run(['true'], { timeoutMs: 5000 }).then(r => r.exitCode === 0, () => false)
  return {
    version,
    primitives: { 'session.usage': usage, 'process.run': process, 'command.run': true, 'prompt.submit': true },
  }
}

export async function runProbe(port: EnginePort): Promise<Probe> {
  return probe(await probeFacts(port))
}
