import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { motifForTopic, topicIllustrationSvg } = require('../scripts/topic-illustrations.js')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

async function topics() {
  const files = ['intelligence-topics.json', 'intelligence-topics-expanded.json', 'intelligence-topics-round-three.json']
  return (await Promise.all(files.map(async (file) => JSON.parse(await read(file))))).flat()
}

test('all 180 dossiers receive a unique semantic vector illustration', async () => {
  const allTopics = await topics()
  assert.equal(allTopics.length, 180)
  const illustrations = allTopics.map(topicIllustrationSvg)
  assert.equal(new Set(illustrations).size, 180)
  assert.ok(new Set(allTopics.map(motifForTopic)).size >= 20)
  for (const illustration of illustrations) {
    assert.match(illustration, /<svg viewBox="0 0 860 470"/)
    assert.match(illustration, /data-topic-motif=/)
    assert.doesNotMatch(illustration, /<text|<image|script/i)
  }
  const bySlug = Object.fromEntries(allTopics.map((topic) => [topic.slug, topic]))
  assert.equal(motifForTopic(bySlug.sleep), 'sleep')
  assert.equal(motifForTopic(bySlug.exercise), 'movement')
  assert.equal(motifForTopic(bySlug['epigenetic-clocks']), 'clock')
  assert.equal(motifForTopic(bySlug.cryonics), 'cryo')
})

test('topic pages explain evidence in reader language and keep conclusions readiness-gated', async () => {
  const [build, browser, template, styles] = await Promise.all([read('build.js'), read('intelligence.js'), read('intelligence-template.html'), read('intelligence.css')])
  assert.match(build, /The current picture/)
  assert.match(build, /How far has this topic reached\?/)
  assert.match(build, /Human Evidence, Clinical Trials & Research/)
  assert.match(build, /delete escapedValues\.TOPIC_VISUAL_HTML/)
  assert.match(browser, /A registration is not evidence that an intervention worked/)
  assert.match(browser, /No notice is not the same as evidence of safety/)
  assert.match(browser, /coverage statement, not a claim/)
  assert.match(browser, /topicCurrentInterpretation\.hidden = true/)
  assert.match(template, /intelligence\.js\?v=20261002-dossier-scale/)
  assert.match(template, /intelligence\.css\?v=20261002-topic-art-layout/)
  assert.match(styles, /grid-template-areas:"kicker art timeline" "title art timeline" "lede art timeline"/)
  assert.match(styles, /\.intel-hero > \.topic-hero-art \{\s*position:relative;/)
})

test('dossier hero metrics show meaningful scale and open precisely filtered evidence', async () => {
  const [browser, proxy, endpoint] = await Promise.all([
    read('intelligence.js'),
    read('api/intelligence.js'),
    read('supabase/functions/public-intelligence/index.ts'),
  ])
  assert.match(browser, /Research records · \$\{currentYear - 3\}–\$\{currentYear - 1\}/)
  assert.match(browser, /Active research institutions/)
  assert.match(browser, /Randomized-human records/)
  assert.match(browser, /published_from=\$\{recentFrom\}&published_to=\$\{recentTo\}/)
  assert.match(proxy, /'published_from', 'published_to'/)
  assert.match(endpoint, /query\.gte\('published_on', publishedFrom\)/)
  assert.match(endpoint, /query\.lte\('published_on', publishedTo\)/)
})
