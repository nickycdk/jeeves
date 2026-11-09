// ST-7.3: the first-activation notice shows once per machine ($.store), on the first successful /jeeves on.
import { expect } from 'claude-code/testing'
import { relay, start, test } from './kit.ts'
import { memHost } from './memfs.ts'

const NOTICE = 'Jeeves keeps task state on this machine only: /home/t/.local/state/jeeves'

test('the first /jeeves on shows the 3-line notice; later ones, even in a new session, do not', async ($, on) => {
  const h = memHost(on)
  await start($)
  const first = (await relay($, 'on')).split('\n')
  expect(first.length).toBe(4)
  expect(first[1]).toBe(NOTICE)
  expect(first[2]).toContain('starts a fresh conversation by itself')
  expect(first[3]).toContain('/jeeves pause')
  await relay($, 'off')
  h.sessionId = 'sess-2'
  await start($)
  const again = await relay($, 'on')
  expect(again).not.toContain('keeps task state')
  expect(again.split('\n').length).toBe(1)
})

test('a refused /jeeves on does not use up the notice', async ($, on) => {
  memHost(on)
  await start($)
  expect(await relay($, 'on', 'plugin')).toContain('Only you can change')
  expect((await relay($, 'on')).split('\n')[1]).toBe(NOTICE)
})
