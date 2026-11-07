// Wires engine events to the adapter; no logic here (02 §3).
import type { Register } from 'claude-code'
import { runtime } from '../src/adapter/runtime.ts'

export const register: Register = (on, options) => {
  const opts = { stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined }

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(rt.probe.mode === 'unsupported' ? `off: needs ${rt.probe.missing[0]}` : 'assisted mode')
      $.ui.toast(rt.probe.message)
    }
    return next(e)
  })

  // Subscribed now, forwarded unchanged until the stories that use them (M2-M5).
  on('session.measure', ($, e, next) => next(e))
  on('tool.call', ($, e, next) => next(e))
  on('turn.complete', ($, e, next) => next(e))
  on('session.end', ($, e, next) => next(e))
  on('session.compact', ($, e, next) => next(e))
  on('prompt.submit', ($, e, next) => next(e))
  on('classic.Stop', ($, e, next) => next(e))
  on('classic.StopFailure', ($, e, next) => next(e))
  on('classic.SessionStart', ($, e, next) => next(e))
}
