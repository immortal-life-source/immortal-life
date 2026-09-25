import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('homepage is a single-screen search entry with no below-the-fold portal duplicate', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('main.js')])
  assert.match(html, /What are you curious about/)
  assert.match(html, /id="homeSearch"/)
  assert.doesNotMatch(html, /home-live|home-paths|home-explorer|home-global|home-personal|site-footer|mobile-dock/)
  assert.doesNotMatch(html, /heroDiscoveriesList|Today in longevity|Choose your route/)
  assert.doesNotMatch(html, /You were not meant to expire/)
  assert.match(js, /il_last_visit/)
  assert.match(js, /il_saved_searches/)
  assert.doesNotMatch(html, /My Radar|href="\/dashboard"/)
  assert.match(js, /if \(!document\.getElementById\('todayGrid'\) && !document\.getElementById\('heroDiscoveriesList'\)\) return/)
})

test('changes-page totals are direct links to their relevant indexes', async () => {
  const [pages, css] = await Promise.all([read('supabase/functions/public-pages/index.ts'), read('intelligence.css')])
  assert.match(pages, /research: '\/research'/)
  assert.match(pages, /trials: '\/trials'/)
  assert.match(pages, /class="report-metric"/)
  assert.match(pages, /Browse records →/)
  assert.match(css, /\.report-metric:hover/)
})

test('topic catalogue is compact, searchable, and does not bury research or trials', async () => {
  const [template, portal, css, build] = await Promise.all([read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js')])
  assert.match(template, /id="topicSearch"/)
  assert.match(template, /id="topicDomain"/)
  assert.match(build, /topics-directory\.json/)
  assert.match(portal, /fetch\('\/topics-directory\.json'/)
  assert.doesNotMatch(portal.match(/else if \(view === 'topics'\)[\s\S]*?else if \(view === 'topic'\)/)?.[0] || '', /request\('topics'/)
  assert.match(portal, /Showing \$\{numberFormatter\.format\(visible\.length\)\} of/)
  assert.match(portal, /view === 'trials'[\s\S]*?renderTrials\(data\.trials \|\| \[\]\);[\s\S]*?view === 'topics'/)
  assert.doesNotMatch(portal, /view === 'trials'[\s\S]*?renderTopics\(topicsData/)
  assert.match(portal, /allLink\.href = compact \? '\/topics' : '\/resources'/)
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0,1fr\)\)/)
  assert.match(css, /min-height: 158px/)
})

test('Trial Radar has one canonical visitor route', async () => {
  const [routes, home, template] = await Promise.all([read('vercel.json'), read('index.html'), read('intelligence-template.html')])
  assert.match(routes, /"source": "\/discover\/recruiting-trials", "destination": "\/trials", "permanent": true/)
  assert.doesNotMatch(home, /href="\/discover\/recruiting-trials"/)
  assert.doesNotMatch(template, /href="\/discover\/recruiting-trials"/)
})

test('expanded topic catalogue has 180 distinct guides in nine controlled domains', async () => {
  const [coreText, expandedText, roundThreeText, domainsText, migration, matcher] = await Promise.all([
    read('intelligence-topics.json'), read('intelligence-topics-expanded.json'), read('intelligence-topics-round-three.json'), read('intelligence-topic-domains.json'),
    read('supabase/migrations/20260925001800_expand_topics_by_domain.sql'),
    read('supabase/functions/_shared/intelligence.ts'),
  ])
  const roundThree = JSON.parse(roundThreeText)
  const topics = [...JSON.parse(coreText), ...JSON.parse(expandedText), ...roundThree]
  const domains = JSON.parse(domainsText)
  const mapped = domains.flatMap((domain) => domain.topics)
  assert.equal(topics.length, 180)
  assert.equal(roundThree.length, 98)
  assert.equal(domains.length, 9)
  assert.equal(new Set(topics.map((topic) => topic.slug)).size, 180)
  assert.equal(mapped.length, 180)
  assert.equal(new Set(mapped).size, 180)
  assert.deepEqual(new Set(mapped), new Set(topics.map((topic) => topic.slug)))
  assert.match(migration, /matching_terms text\[\]/)
  assert.match(migration, /Expected at least 180 enabled topics/)
  assert.match(matcher, /matching_terms\?: string\[\]/)
})

test('desktop homepage exposes the complete navigation and keeps motion clear of the headline', async () => {
  const [html, css, js] = await Promise.all([read('index.html'), read('style.css'), read('main.js')])
  assert.doesNotMatch(html, /s1-nav-more-toggle|homeMoreNav/)
  assert.doesNotMatch(js, /setMoreMenu/)
  assert.match(css, /width: min\(760px, 52vw\)/)
  assert.match(css, /--orbit-size: clamp\(380px, 31vw, 480px\)/)
  assert.match(html, /<a href="\/topics" class="s1-nav-link">Topics<\/a>/)
  assert.match(html, /<a href="\/discover" class="s1-nav-link">Explore<\/a>/)
  assert.match(html, /href="\/universities" class="s1-nav-link">Universities<\/a>[\s\S]*?href="\/research" class="s1-nav-link">Research<\/a>[\s\S]*?href="\/discover" class="s1-nav-link">Explore<\/a>/)
  for (const href of ['/changes', '/topics', '/trials', '/universities', '/research', '/discover', '/learn', '/regulatory', '/resources', '/briefings', '/methodology']) assert.match(html, new RegExp(`href="${href}"`))
  assert.doesNotMatch(html, /Newsreader/)
  assert.match(css, /\.hl \{[\s\S]*?font-family: var\(--font-serif\)/)
  assert.match(css, /font-size: clamp\(50px, 5\.25vw, 81px\)/)
  assert.match(css, /\.brand-mark \{[\s\S]*?width: 57px;/)
})

test('research and trials use complete searchable filter systems', async () => {
  const [template, portal, css, build] = await Promise.all([read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js')])
  for (const id of ['researchControls', 'researchSearch', 'researchTopic', 'researchEvidence', 'researchAccess', 'researchResult', 'trialControls', 'trialSearch', 'trialTopic', 'trialStatus', 'trialPhase', 'trialCountry', 'trialResult']) assert.match(template, new RegExp(`id="${id}"`))
  assert.match(portal, /request\('research', 100, researchQueryParams/)
  assert.match(portal, /request\('trials', 100, trialQueryParams/)
  assert.match(portal, /reloadResearch/)
  assert.match(portal, /reloadTrials/)
  assert.match(portal, /function filterResearchRecords/)
  assert.match(portal, /function filterTrialRecords/)
  assert.match(portal, /researchNextOffset/)
  assert.match(portal, /trialNextOffset/)
  assert.match(css, /\.record-controls/)
  assert.match(css, /\.record-controls--trials/)
  assert.match(build, /filename: 'research\.html',[\s\S]*?PAGE_VIEW: 'research'/)
  assert.doesNotMatch(build, /filename: 'research\.html',[\s\S]{0,300}?PAGE_VIEW: 'overview'/)
})

test('public data views recover from brief Edge Function saturation', async () => {
  const [portal, proxy, vercel] = await Promise.all([read('intelligence.js'), read('api/intelligence.js'), read('vercel.json')])
  assert.match(portal, /fetchWithDeadline/)
  assert.match(portal, /immortal-life-public-intelligence-v1/)
  assert.match(portal, /const endpoint = '\/api\/intelligence'/)
  assert.match(portal, /timeoutMs = 6500/)
  assert.match(proxy, /s-maxage=300/)
  assert.match(proxy, /stale-if-error=604800/)
  assert.match(proxy, /sourceFallback/)
  assert.match(vercel, /topics-directory\.json\|resources-directory\.json/)
  assert.match(vercel, /s-maxage=86400, stale-while-revalidate=604800/)
})

test('public page shells provide search, related journeys and mobile navigation', async () => {
  const files = await Promise.all([
    read('intelligence-template.html'),
    read('content-template.html'),
    read('supabase/functions/public-pages/index.ts'),
  ])
  for (const source of files) {
    assert.match(source, /intel-nav-search/)
    assert.doesNotMatch(source, /intel-nav-more/)
    assert.match(source, /mobile-dock/)
    assert.match(source, /Continue exploring/)
    assert.match(source, /<a href="\/topics"[^>]*>Topics<\/a>/)
    assert.match(source, /<a href="\/discover">Explore<\/a>/)
  }
  assert.doesNotMatch(files[0], /reader-mode/)
  assert.doesNotMatch(files[2], /reader-mode/)
})

test('mobile hamburger navigation is identical on every public shell', async () => {
  const [home, intelligence, content, privacy, confirmed, unsubscribed] = await Promise.all([
    read('index.html'), read('intelligence-template.html'), read('content-template.html'), read('privacy.html'), read('confirmed.html'), read('unsubscribed.html'),
  ])
  const menuLinks = (source, id) => {
    const menu = source.match(new RegExp(`<nav[^>]+id="${id}"[\\s\\S]*?<\\/nav>`))?.[0] || ''
    return [...menu.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => `${match[1]}:${match[2].trim()}`)
  }
  const expected = menuLinks(intelligence, 'intelNav')
  assert.deepEqual(menuLinks(home, 'primaryNav'), expected)
  assert.deepEqual(menuLinks(content, 'intelNav'), expected)
  assert.deepEqual(menuLinks(privacy, 'intelNav'), expected)
  assert.deepEqual(menuLinks(confirmed, 'confirmedMemberNav'), expected)
  assert.deepEqual(menuLinks(unsubscribed, 'unsubscribedMemberNav'), expected)
  const dock = (source) => source.match(/<nav class="mobile-dock"[\s\S]*?<\/nav>/)?.[0].replace(/\s+/g, ' ')
  assert.equal(dock(home), undefined)
  assert.equal(dock(content), dock(intelligence))
  assert.equal(dock(privacy), dock(intelligence))
  assert.doesNotMatch(home, /Project News|href="\/dashboard"|href="\/join"/)
})

test('detail-level controls and their duplicate copy are removed', async () => {
  const [portal, css] = await Promise.all([read('intelligence.js'), read('intelligence.css')])
  assert.doesNotMatch(portal, /Showing Beginner view/)
  assert.doesNotMatch(portal, /data-reader-mode/)
  assert.doesNotMatch(css, /reader-mode/)
  assert.match(portal, /plain-record-copy/)
})

test('record titles use readable article typography on desktop and mobile', async () => {
  const css = await read('intelligence.css')
  assert.match(css, /\.record-hero h1 \{ font-size: clamp\(36px, 3\.6vw, 52px\)/)
  assert.match(css, /\.record-hero h1 \{ font-size:clamp\(28px,7\.6vw,38px\)/)
  assert.doesNotMatch(css, /\.record-hero h1 \{ font-size: clamp\(48px, 7\.5vw, 100px\)/)
})

test('topic journeys produce a visibly topic-specific university ranking', async () => {
  const [portal, api, template] = await Promise.all([read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts'), read('intelligence-template.html')])
  assert.match(portal, /Find related university activity/)
  assert.match(portal, /This is a topic-specific view/)
  assert.match(portal, /ranked by that topic’s indexed work links/)
  assert.match(api, /leftMetric\?\.works_five_year/)
  assert.match(template, /id="universityHeading"/)
})

test('learning and evidence features remain connected without the retired dashboard', async () => {
  const [build, portal, routes, publicPages] = await Promise.all([
    read('build.js'), read('intelligence.js'), read('vercel.json'), read('supabase/functions/public-pages/index.ts'),
  ])
  assert.match(build, /learning-quiz/)
  assert.match(portal, /evidenceLadder/)
  assert.match(portal, /trialLadder/)
  assert.match(portal, /includes\('PHASE3'\) \? 2/)
  assert.match(portal, /\['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'\]/)
  assert.match(portal, /il_recent_topics/)
  assert.doesNotMatch(build, /'dashboard\.html'|'join\.html'/)
  assert.match(routes, /"source": "\/dashboard", "destination": "\/topics"/)
  assert.match(routes, /"source": "\/join", "destination": "\/topics"/)
  assert.match(publicPages, /evidenceLadderHtml/)
  assert.match(publicPages, /trial-country-map/)
})

test('quality page exposes publication checks but no private traffic analytics or duplicate source directory', async () => {
  const [portal, api] = await Promise.all([read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts')])
  assert.doesNotMatch(portal, /Google impressions|Google visits|Search pages to improve|Weekly briefing delivery/)
  assert.doesNotMatch(api.match(/if \(view === 'quality'\)[\s\S]*?if \(view === 'entities'\)/)?.[0] || '', /search_utility_telemetry|directory_sources/)
  assert.doesNotMatch(portal.match(/view === 'quality'[\s\S]*?\n      \}/)?.[0] || '', /renderSources/)
})

test('summary numbers lead to the records or explanation behind them', async () => {
  const [template, portal, pages] = await Promise.all([read('intelligence-template.html'), read('intelligence.js'), read('supabase/functions/public-pages/index.ts')])
  assert.match(template, /<a href="\/research"><strong id="researchCount"/)
  assert.match(portal, /atlas-stat atlas-stat--action/)
  assert.match(portal, /quality-stat quality-stat--link/)
  assert.match(pages, /report-metric/)
})

test('resource summary reports complete reader-facing coverage, not the internal feed count', async () => {
  const [portal, api, template] = await Promise.all([
    read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts'), read('intelligence-template.html'),
  ])
  assert.match(portal, /Countries covered/)
  assert.match(portal, /Coverage regions/)
  assert.match(portal, /View countries →/)
  assert.match(portal, /View regions →/)
  assert.doesNotMatch(portal.match(/function renderResourceStats[\s\S]*?\n  \}/)?.[0] || '', /Updated automatically|live_integrations/)
  assert.match(api, /countries: \(countryDirectory \?\? \[\]\)\.length/)
  assert.match(api, /regions: Object\.keys\(countBy\('region'\)\)\.length/)
  assert.match(template, /Live data feed/)
})

test('the visitor experience does not introduce a forum', async () => {
  const sources = await Promise.all([read('index.html'), read('intelligence-template.html'), read('content-template.html')])
  for (const source of sources) assert.doesNotMatch(source, /\bforum\b/i)
})

test('evidence explorer uses readable topic rows instead of an unreadable node cloud', async () => {
  const [template, portal, api] = await Promise.all([
    read('intelligence-template.html'), read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts'),
  ])
  assert.match(template, /Evidence by topic/)
  assert.match(template, /id="graphTopicList"/)
  assert.doesNotMatch(template, /id="evidenceGraph"/)
  assert.match(portal, /evidence-topic-metric/)
  assert.match(portal, /graphResult/)
  assert.match(api, /topics: explorerTopics/)
})

test('the completed living atlas includes daily signals, timelines, plain-language cards, and connected discovery', async () => {
  const [home, main, portalTemplate, portal, publicPages, publicApi, css] = await Promise.all([
    read('index.html'), read('main.js'), read('intelligence-template.html'), read('intelligence.js'),
    read('supabase/functions/public-pages/index.ts'), read('supabase/functions/public-intelligence/index.ts'), read('intelligence.css'),
  ])
  assert.doesNotMatch(home, /systemMapTemplate/)
  assert.doesNotMatch(home, /Weekly longevity briefing/)
  assert.doesNotMatch(home, /home-live|home-paths|home-explorer|home-global|home-personal/)
  assert.match(portalTemplate, /Evidence timeline/)
  assert.match(portal, /renderTimeline/)
  assert.match(publicApi, /view === 'timeline'/)
  assert.match(publicApi, /TOPIC_MECHANISMS/)
  assert.match(publicApi, /layer:universities/)
  assert.match(portal, /What this record means/)
  assert.match(publicPages, /Five questions to ask about this record/)
  assert.match(publicPages, /trial-world-map/)
  assert.match(publicPages, /Related discoveries/)
  assert.match(css, /trial-map-node/)
  assert.match(portalTemplate, /resourceCountryCoverage/)
  assert.match(portal, /Worldwide country coverage:.*of 195 countries/)
  assert.match(portal, /by_region_jurisdictions/)
})
