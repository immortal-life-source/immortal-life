import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { motifForTopic, topicIllustrationSvg } = require('../scripts/topic-illustrations.js')
const { injectFundingSnapshot, renderTopicFundingSection } = require('../api/_topic-funding-ssr.js')
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
  assert.match(template, /intelligence\.js\?v=20261003-number-integrity-v7/)
  assert.match(template, /intelligence\.css\?v=20261003-number-integrity-v7/)
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

test('every dossier receives fast, source-linked funding intelligence without collapsing unlike evidence', async () => {
  const [build, browser, styles, endpoint, migration] = await Promise.all([
    read('build.js'),
    read('intelligence.js'),
    read('intelligence.css'),
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/migrations/20261002000800_topic_funding_dossier_cache.sql'),
  ])
  assert.match(build, /Official grants and funding acknowledgements in publications are shown as two distinct forms of evidence/)
  assert.match(build, /id="topicFundingStats"/)
  assert.match(build, /id="topicFundingPathways"/)
  assert.match(build, /id="topicFundingTrend"/)
  assert.match(browser, /Direct funding evidence/)
  assert.match(browser, /Publication-linked evidence/)
  assert.match(browser, /Currencies stay separate; totals are not converted or combined/)
  assert.match(browser, /A funding relationship does not establish benefit, safety, impact, or endorsement/)
  assert.match(build, /This describes present coverage; it does not prove that no funding exists/)
  assert.match(styles, /\.topic-funding-pathways/)
  assert.match(styles, /\.topic-funding-trend-chart/)
  assert.match(endpoint, /rpc\('get_topic_funding_dossier'/)
  assert.doesNotMatch(endpoint, /dossierStage\('funding-count'/)
  assert.match(migration, /create table if not exists public\.topic_funding_dossier_cache/)
  assert.match(migration, /join public\.funding_grants/)
  assert.match(migration, /from award_base/)
  assert.match(migration, /select public\.refresh_topic_funding_dossier_cache\(\)/)
  assert.match(migration, /'27 \*\/6 \* \* \*'/)
})

test('funding facts are rendered into the first topic HTML response and stay interactive', async () => {
  const section = renderTopicFundingSection('Exercise', 'exercise', {
    summary: {
      direct_grants: 12, active_direct_grants: 7, direct_funders: 3,
      grant_recipients: 5, direct_countries: 2, award_entities: 8,
      acknowledgement_funders: 4, linked_publications: 11, linked_universities: 3,
    },
    direct_funders: [{ name: 'National Institutes of Health', grants: 8, active_grants: 4 }],
    acknowledgement_funders: [{ name: 'Wellcome', slug: 'wellcome', awards: 6, publications: 9 }],
    universities: [{ name: 'University of Oxford', slug: 'university-of-oxford', awards: 4, country_name: 'United Kingdom' }],
    direct_countries: [{ country_name: 'United States', country_code: 'US', grants: 9 }],
    direct_grant_years: [{ year: 2025, grants: 6 }],
    recent_direct_grants: [{ title: 'Healthy ageing study', funder_name: 'National Institutes of Health', source_url: 'https://example.org/grant' }],
    refreshed_at: '2026-10-02T10:00:00Z',
  })
  assert.match(section, /data-prerendered="true"/)
  assert.match(section, />12<\/strong><span>Official grant records/)
  assert.match(section, /Exercise currently connects to 12 official grant records/)
  assert.match(section, /National Institutes of Health/)
  assert.match(section, /University of Oxford/)
  assert.doesNotMatch(section, /Loading the funding landscape/)

  const shell = '<html><head><script type="application/ld+json">{"@graph":[{"@id":"https://www.immortal.life/topics/exercise#webpage"}]}</script></head><body><small id="topicFundingSummary">Loading source-linked awards…</small><section class="topic-funding" id="topicFunding"></section><section class="topic-trend" id="topicTrend"></section></body></html>'
  const rendered = injectFundingSnapshot(shell, {
    topic: { slug: 'exercise', name: 'Exercise' },
    funding: { summary: { direct_grants: 12 }, direct_funders: [{ name: 'NIH', grants: 12 }] },
    modified_at: '2026-10-02T11:00:00Z',
  })
  assert.match(rendered, /12 official grant records in connected grant sources/)
  assert.match(rendered, /article:modified_time/)
  assert.match(rendered, /dateModified/)
})

test('topic delivery uses a cached fail-safe prerender and meaningful sitemap dates', async () => {
  const [handler, vercel, endpoint, pages, sitemapProxy, migration] = await Promise.all([
    read('api/topic-page.js'), read('vercel.json'), read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/functions/public-pages/index.ts'), read('api/sitemap.js'),
    read('supabase/migrations/20261002001000_meaningful_topic_content_timestamps.sql'),
  ])
  assert.match(handler, /injectFundingSnapshot/)
  assert.match(handler, /s-maxage=21600/)
  assert.match(handler, /static-fallback/)
  assert.match(vercel, /"source": "\/topics\/:slug", "destination": "\/api\/topic-page\?slug=:slug"/)
  assert.match(vercel, /"includeFiles": "dist\/_topic-templates\/\*\*"/)
  assert.match(endpoint, /view === 'topic-funding-seo'/)
  assert.match(endpoint, /topic_funding_dossier_cache/)
  assert.match(pages, /fundingModified\.get\(row\.slug\)/)
  assert.match(pages, /countModified\.get\(row\.slug\)/)
  assert.match(sitemapProxy, /'topics'/)
  assert.match(migration, /preserve_topic_funding_content_timestamp/)
  assert.match(migration, /new\.dossier is distinct from old\.dossier/)
})

test('topic build keeps templates private so dynamic routes and meaningful sitemap dates win', async () => {
  const build = await read('build.js')
  assert.match(build, /path\.join\(outputDir, '_topic-templates'\)/)
  assert.doesNotMatch(build, /path\.join\(outputDir, 'topics'\)/)
  assert.doesNotMatch(build, /writeFileSync\(path\.join\(sitemapDirectory, 'topics\.xml'\)/)
})
