// Ports implemented with the engine's `$`.
import type { EngineInterface } from 'claude-code'
import type { EnginePort, FsPort } from './ports.ts'

export function fsPort($: EngineInterface): FsPort {
  return {
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDirs: path => $.fs.list(path).then(es => es.filter(e => e.kind === 'dir').map(e => e.name), () => []),
    realPath: path => $.fs.stat(path, { resolve: true }).then(st => st.realPath ?? null, () => null),
    mtimeMs: path => $.fs.stat(path).then(st => st.mtimeMs, () => null),
    run: async (argv, opts = {}) => {
      const r = await $.process.run(argv, { timeoutMs: opts.timeoutMs ?? 10_000, ...(opts.cwd ? { cwd: opts.cwd } : {}), ...(opts.env ? { env: opts.env } : {}) })
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
    env: name => {
      switch (name) {
        case 'HOME': return $.env.get('HOME')
        case 'XDG_STATE_HOME': return $.env.get('XDG_STATE_HOME')
        case 'CLAUDE_PLUGIN_DATA': return $.env.get('CLAUDE_PLUGIN_DATA')
        case 'SESSIONRELAY_TEST': return $.env.get('SESSIONRELAY_TEST')
        case 'SESSIONRELAY_STATE_DIR': return $.env.get('SESSIONRELAY_STATE_DIR')
        case 'SESSIONRELAY_TEST_THRESHOLD_OVERRIDE': return $.env.get('SESSIONRELAY_TEST_THRESHOLD_OVERRIDE')
      }
    },
  }
}

export function enginePort($: EngineInterface): EnginePort {
  return {
    ...fsPort($),
    version: () => $.session.version(),
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    usage: async () => {
      const c = (await $.session.usage()).context
      return { window: c.window, ...(c.percent !== undefined ? { percent: c.percent } : {}), ...(c.tokens !== undefined ? { tokens: c.tokens } : {}) }
    },
    runCommand: async name => { await $.command.run({ command: name, args: '' }) },
    submitPrompt: async text => { await $.prompt.submit({ text }) },
    submitPromptSoon: (text, onError) => { $.clock.after(0, () => { $.prompt.submit({ text }).catch(onError) }) },
    appendHiddenNote: async text => { await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }) },
    runningAgents: async () => (await $.agent.list()).filter(a => a.status === 'running').length,
    status: text => $.ui.status(text),
    toast: text => $.ui.toast(text),
    log: text => $.ui.log(text, { to: 'debug' }),
    now: () => $.clock.now(),
    firstActivation: async () => {
      if ((await $.store.get('firstActivationShown')) === true) return false
      await $.store.set('firstActivationShown', true)
      return true
    },
  }
}
