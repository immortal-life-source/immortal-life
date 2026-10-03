import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

test('large public directories render a small first view without capping their corpus', async () => {
  const [portal, template] = await Promise.all([
    read('intelligence.js'),
    read('intelligence-template.html'),
  ])

  assert.match(portal, /const DIRECTORY_INITIAL_PAGE_SIZE = 30/)
  assert.match(portal, /const DIRECTORY_LOAD_MORE_SIZE = 50/)
  assert.match(portal, /request\('research', DIRECTORY_INITIAL_PAGE_SIZE/)
  assert.match(portal, /request\('trials', DIRECTORY_INITIAL_PAGE_SIZE/)
  assert.match(portal, /universityPageSize = append \? DIRECTORY_LOAD_MORE_SIZE : DIRECTORY_INITIAL_PAGE_SIZE/)
  assert.match(portal, /request\('research', DIRECTORY_LOAD_MORE_SIZE/)
  assert.match(portal, /request\('trials', DIRECTORY_LOAD_MORE_SIZE/)
  assert.match(template, /id="researchLoadMore"/)
  assert.match(template, /id="trialLoadMore"/)
  assert.match(template, /id="universityLoadMore"/)
})

test('the worldwide source atlas progressively reveals every matching source', async () => {
  const [portal, template, css] = await Promise.all([
    read('intelligence.js'),
    read('intelligence-template.html'),
    read('intelligence.css'),
  ])

  assert.match(portal, /const RESOURCE_INITIAL_VISIBLE = 36/)
  assert.match(portal, /const matches = atlasResources\.filter/)
  assert.match(portal, /const visible = matches\.slice\(0, resourceVisibleLimit\)/)
  assert.match(portal, /resourceVisibleLimit \+= RESOURCE_LOAD_MORE_SIZE/)
  assert.match(template, /id="resourceLoadMore"/)
  assert.match(css, /content-visibility:\s*auto/)
})

test('the Signals front page does not block on every detailed field-map aggregate', async () => {
  const signals = await read('api/signals.js')
  const hub = signals.slice(signals.indexOf('async function renderHub()'), signals.indexOf('async function renderStory'))

  assert.match(hub, /fetchJson\(\{ view: 'signals', limit: 20 \}\)/)
  assert.doesNotMatch(hub, /view: 'trial-results-gap'/)
  assert.doesNotMatch(hub, /status: 'Recruiting'/)
  assert.doesNotMatch(hub, /view: 'funding'/)
})
