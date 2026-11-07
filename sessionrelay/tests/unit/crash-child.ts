// Writes state.json versions forever; the parent kills it at random points (SIGKILL).
import { createStorage } from '../../src/adapter/storage.ts'
import { nodePort } from './node-port.ts'
import { validState } from './helpers.ts'

const dir = process.argv[2]!
const s = createStorage(nodePort())
const pad = Array.from({ length: 4 }, () => 'x'.repeat(90_000)) // widens the write window
process.stdout.write('ready\n')
for (let n = 1; ; n++) await s.writeState(dir, validState({ rotationCount: n, heldPrompts: pad }))
