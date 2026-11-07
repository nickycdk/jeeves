import type { Register, EngineInterface } from 'claude-code'

let chain: Promise<void> = Promise.resolve()
function log($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  chain = chain.then(() => logNow($, ev, data)).catch(() => {})
  return chain
}
async function logNow($: EngineInterface, ev: string, data: Record<string, unknown>) {
  const path = await $.env.get('SRSPIKE_LOG')
  if (!path) return
  let prev = ''
  try { prev = (await $.fs.read(path)) as string } catch {}
  const u = await $.session.usage().catch(() => null)
  const row = { t: await $.clock.now(), ev, sid: await $.session.id(), pct: u?.context.percent ?? null, usd: u?.cost?.usd ?? null, tokens: u?.context.tokens ?? null, ...data }
  await $.fs.write(path, prev + JSON.stringify(row) + '\n')
}

const WORDS = ['OSPREY', 'JUNIPER', 'QUARTZ', 'MAGENTA', 'TUNDRA', 'VELVET']
type Pending = { n: number; channel: 'ctx' | 'submit'; word: string; payload: string; first: string; last: string; lastL: string }
let pending: Pending | null = null
let checking: Pending | null = null
let transcript = ''
let count = 0

function payload(n: number, word: string) {
  const first = `SPIKE-PAYLOAD size=${n} START-MARK`
  const last = `END-MARK-${n}-${word}`
  let body = first + '\n', i = 0, lastL = ''
  for (;;) {
    const line = `L${String(++i).padStart(4, '0')} the handover body repeats ordinary prose so the size is realistic.\n`
    if (body.length + line.length + last.length > n) break
    body += line; lastL = line.slice(0, 5)
  }
  body += last
  return { payload: body.padEnd(n - 0, ' ').slice(0, n), first, last, lastL }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'srsize', description: 'Rotate with a payload of N chars via ctx|submit (spike)', argumentHint: '<chars> <ctx|submit>' })
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('command.run', { command: 'srsize' }, async ($, e) => {
    const [ns, ch] = (e.args ?? '').trim().split(/\s+/)
    const n = Number(ns), channel = ch === 'submit' ? 'submit' : 'ctx'
    const word = WORDS[count++ % WORDS.length]
    // payload ends with the end marker exactly; pad only if the loop left room
    const p = payload(n, word)
    const text = p.payload.endsWith(p.last) ? p.payload : p.payload.trimEnd()
    pending = { n, channel, word, payload: text, first: p.first, last: p.last, lastL: p.lastL }
    await log($, 'size.requested', { n, channel, actualLen: text.length, last: p.last, lastL: p.lastL })
    $.clock.after(500, () => {
      void (async () => {
        try { await $.command.run({ command: 'clear', args: '' }); await log($, 'clear.resolved', { n, channel }) }
        catch (err) { await log($, 'clear.rejected', { err: String(err) }); return }
        const q = 'SessionRelay spike check. Your context may contain a block whose first line starts with SPIKE-PAYLOAD. Reply with exactly three lines: (1) that first line verbatim, (2) the block\'s very last line verbatim (it starts with END-MARK), (3) the label of the last line that starts with L and four digits (for example L0123). If no such block is visible, reply MISSING.'
        const p2 = pending!
        checking = p2; pending = null
        try {
          const sub = await $.prompt.submit({ text: p2.channel === 'submit' ? `${q}\n\n${p2.payload}` : q })
          await log($, 'submit.resolved', { n, channel, drop: (sub as { drop?: string }).drop ?? null })
        } catch (err) { await log($, 'submit.rejected', { err: String(err) }) }
      })()
    })
    return { text: `spike: rotating with ${n} chars via ${channel}` }
  })

  on('classic.SessionStart', async ($, e, next) => {
    // read pending before awaiting: $.command.run('clear') can resolve (and clear it) while hooks beneath run
    const p = e.source === 'clear' && pending?.channel === 'ctx' ? pending : null
    const r = await next(e)
    transcript = e.transcript_path
    await log($, 'classic.SessionStart', { source: e.source, injectedChars: p?.payload.length ?? 0 })
    return p ? { ...r, additionalContext: [...(r.additionalContext ?? []), p.payload] } : r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || !checking) return r
    const c = checking; checking = null
    const reply = r.text
    $.clock.after(1500, () => {
      void (async () => {
        let tr = ''
        try { tr = (await $.fs.read(transcript)) as string } catch (err) { tr = 'READ-FAILED ' + String(err) }
        const idx = tr.indexOf(c.first)
        await log($, 'size.result', {
          n: c.n, channel: c.channel,
          modelFirstOk: reply.includes(c.first), modelLastOk: reply.includes(c.last), modelLastLOk: reply.includes(c.lastL),
          expectLastL: c.lastL, reply: reply.slice(0, 300),
          transcriptHasFirst: idx >= 0, transcriptHasLast: tr.includes(c.last),
          transcriptHasFullPayload: tr.includes(JSON.stringify(c.payload).slice(1, -1)),
          transcriptMentions: ['truncat', 'saved to', 'preview', 'characters omitted', 'too long'].filter(w => tr.slice(Math.max(0, idx - 500), idx + c.n * 2).toLowerCase().includes(w)),
          transcriptLen: tr.length,
        })
      })()
    })
    return r
  })
}
