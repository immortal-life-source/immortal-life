import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('homepage is organised around useful visitor goals and live updates', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('main.js')])
  assert.match(html, /Today in longevity/)
  assert.match(html, /What are you curious about/)
  assert.match(html, /Choose your route/)
  assert.match(html, /mobile-dock/)
  assert.doesNotMatch(html, /You were not meant to expire/)
  assert.match(js, /il_last_visit/)
  assert.match(js, /il_saved_searches/)
  assert.match(js, /il_saved_topics/)
})

test('public page shells provide search, reading levels, related journeys and mobile navigation', async () => {
  const files = await Promise.all([
    read('intelligence-template.html'),
    read('content-template.html'),
    read('supabase/functions/public-pages/index.ts'),
  ])
  for (const source of files) {
    assert.match(source, /intel-nav-search/)
    assert.match(source, /mobile-dock/)
    assert.match(source, /Continue exploring/)
  }
  assert.match(files[0], /reader-mode/)
  assert.match(files[2], /reader-mode/)
})

test('learning, evidence and return-loop features remain connected', async () => {
  const [build, portal, dashboardHtml, dashboardJs, publicPages] = await Promise.all([
    read('build.js'), read('intelligence.js'), read('dashboard.html'), read('dashboard.js'), read('supabase/functions/public-pages/index.ts'),
  ])
  assert.match(build, /learning-quiz/)
  assert.match(portal, /evidenceLadder/)
  assert.match(portal, /trialLadder/)
  assert.match(portal, /il_recent_topics/)
  assert.match(dashboardHtml, /Continue where you left off/)
  assert.match(dashboardJs, /dashSavedSearches/)
  assert.match(publicPages, /evidenceLadderHtml/)
  assert.match(publicPages, /trial-country-map/)
})

test('the visitor experience does not introduce a forum', async () => {
  const sources = await Promise.all([read('index.html'), read('intelligence-template.html'), read('content-template.html')])
  for (const source of sources) assert.doesNotMatch(source, /\bforum\b/i)
})
