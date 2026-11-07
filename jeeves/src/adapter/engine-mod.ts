// Ports implemented with the engine's `$`.
import type { EngineInterface } from 'claude-code'
import type { EnginePort, FsPort } from './ports.ts'

export function fsPort($: EngineInterface): FsPort {
  return {
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDirs: path => $.fs.list(path).then(es => es.filter(e => e.kind === 'dir').map(e => e.name), () => []),
    listFiles: path => $.fs.list(path).then(es => es.filter(e => e.kind === 'file').map(e => e.name), () => []),
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
        case 'JEEVES_TEST': return $.env.get('JEEVES_TEST')
        case 'JEEVES_STATE_DIR': return $.env.get('JEEVES_STATE_DIR')
        case 'JEEVES_TEST_THRESHOLD_OVERRIDE': return $.env.get('JEEVES_TEST_THRESHOLD_OVERRIDE')
        case 'JEEVES_TEST_CRASH': return $.env.get('JEEVES_TEST_CRASH')
      }
    },
  }
}

function refused(r: { drop?: string | undefined }): void {
  if (r.drop !== undefined) throw new Error(`prompt refused: ${r.drop}`)
}

export function enginePort($: EngineInterface): EnginePort {
  return {
    ...fsPort($),
    version: () => $.session.version(),
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    turns: () => $.session.turns(),
    usage: async () => {
      const c = (await $.session.usage()).context
      return { window: c.window, ...(c.percent !== undefined ? { percent: c.percent } : {}), ...(c.tokens !== undefined ? { tokens: c.tokens } : {}) }
    },
    rateLimitReset: () => $.session.usage().then(u => [...u.rateLimits].sort((a, b) => b.percentUsed - a.percentUsed)[0]?.resetsAt ?? null, () => null),
    costUsd: () => $.session.usage().then(u => u.cost?.usd ?? null, () => null),
    runCommand: async name => { await $.command.run({ command: name, args: '' }) },
    after: (ms, fn) => { $.clock.after(ms, fn) },
    // A refused prompt resolves { drop } rather than rejecting: count it as a failure.
    submitPrompt: async text => { refused(await $.prompt.submit({ text })) },
    submitPromptSoon: (text, onError) => { $.clock.after(0, () => { $.prompt.submit({ text }).then(refused).catch(onError) }) },
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
