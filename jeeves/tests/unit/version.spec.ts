// The version is written in several places; a release must change all of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('package.json, plugin.json, the root README (badge and text) and the plugin README carry the same version', () => {
  const pkg = JSON.parse(read('../../package.json')).version
  const root = read('../../../README.md')
  const found = {
    plugin: JSON.parse(read('../../.claude-plugin/plugin.json')).version,
    badge: /badge\/version-([0-9.]+)_/.exec(root)?.[1],
    rootText: /Public beta ([0-9.]+[0-9])/.exec(root)?.[1],
    pluginReadme: /public beta ([0-9.]+[0-9])/.exec(read('../../README.md'))?.[1],
  }
  for (const [where, v] of Object.entries(found)) assert.equal(v, pkg, `${where} says ${v}, package.json ${pkg}`)
})
