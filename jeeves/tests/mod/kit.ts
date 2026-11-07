// Shared helpers for the mod tests (not a *.test.ts, so the runner does not run it).
import type { On, PromptOrigin } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import type { MemHost } from './memfs.ts'

export type Kit = Engine
export const start = ($: Kit) => $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
export const typed = (args: string, kind: 'composer' | 'plugin' = 'composer') => ({
  command: 'relay', args, origin: (kind === 'composer' ? { kind } : { kind, name: 'other' }) as PromptOrigin, presentation: { isFullscreen: false, columns: 80 },
})
export const relay = async ($: Kit, args: string, kind: 'composer' | 'plugin' = 'composer') => (await $.command.run(typed(args, kind))).text ?? ''
export const submit = ($: Kit, text: string, origin: PromptOrigin = { kind: 'composer' }, command?: { name: string; args: string }) =>
  $.prompt.submit({ text, origin, wait: false, ...(command ? { command } : {}) })

/** Task folders the host holds, with what is in them. */
export const taskDirs = (h: MemHost) => [...new Set([...h.files.keys()].filter(f => f.includes('/tasks/')).map(f => f.replace(/(\/tasks\/[^/]+)\/.*$/, '$1')))]
export const stateOf = (h: MemHost, dir: string) => JSON.parse(h.files.get(`${dir}/state.json`)!)
/** Every prompt that reached the engine beneath the plugin, with its origin. */
export const bottom = (on: On) => {
  const got: { text: string; origin: string }[] = []
  on('prompt.submit', (_, e) => { got.push({ text: e.text, origin: e.origin.kind }); return { text: e.text } })
  return got
}

export const PROMPT = 'Build the parser.\n\n  - keep CRLF?\r\n  - emoji: 🚀 ✅ — ÆØÅ  \n\ttrailing tab\t'


/** Settle the mock clock until `ready()` holds (work a timer started runs past one settle). Gives up after 200 rounds. */
export async function until(h: MemHost, ready: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !ready(); i++) await h.clock.settle()
}
