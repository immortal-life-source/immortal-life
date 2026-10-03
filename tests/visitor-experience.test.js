import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('homepage is a single-screen search entry with no below-the-fold portal duplicate', async () => {
  const [html, js, css] = await Promise.all([read('index.html'), read('main.js'), read('style.css')])
  assert.match(html, /What are you curious about/)
  assert.match(html, /id="homeSearch"/)
  assert.doesNotMatch(html, /home-live|home-paths|home-explorer|home-global|home-personal|site-footer/)
  assert.match(html, /mobile-dock-you[^>]*href="\/you"/)
  assert.doesNotMatch(html, /heroDiscoveriesList|Today in longevity|Choose your route/)
  assert.doesNotMatch(html, /You were not meant to expire/)
  assert.match(js, /il_last_visit/)
  assert.match(js, /il_saved_searches/)
  assert.doesNotMatch(html, /My Radar|href="\/dashboard"/)
  assert.match(js, /if \(!document\.getElementById\('todayGrid'\) && !document\.getElementById\('heroDiscoveriesList'\)\) return/)
  assert.match(html, /class="hero-butterfly" aria-hidden="true"/)
  assert.match(html, /style\.css\?v=20261001-butterfly-glide/)
  assert.match(css, /@keyframes heroButterflyJourney/)
  assert.match(css, /@keyframes heroButterflyJourneyMobile/)
  assert.match(css, /heroButterflyJourney 10\.2s/)
  assert.match(css, /heroButterflyJourneyMobile 10\.4s/)
  assert.match(css, /translate\(-36vw,-2vh\)[\s\S]*translate\(-27vw,-10vh\)[\s\S]*translate\(-18vw,-3vh\)[\s\S]*translate\(-11vw,-9vh\)[\s\S]*translate\(-5vw,-2\.5vh\)/)
  assert.doesNotMatch(css, /rotate\((?:88|178|268|350|368)deg\)/)
  assert.match(css, /grid-template-rows: clamp\(176px, 31svh, 270px\) 1fr auto/)
  assert.match(css, /font-size: clamp\(58px, 18vw, 78px\)/)
  assert.match(css, /translate\(-50%,-54%\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s+\.hero-butterfly \{[\s\S]*?animation: none;/)
})

test('changes-page totals are direct links to their relevant indexes', async () => {
  const [pages, css] = await Promise.all([read('supabase/functions/public-pages/index.ts'), read('intelligence.css')])
  assert.match(pages, /\/changes\?kind=\$\{encodeURIComponent\(recordType\)\}/)
  assert.match(pages, /Browse exactly \$\{count\}/)
  assert.match(pages, /class="report-metric"/)
  assert.match(pages, /Open this exact update set →/)
  assert.match(css, /\.report-metric:hover/)
})

test('shared portal script does not fail on informational pages without portal regions', async () => {
  const [portal, template] = await Promise.all([read('intelligence.js'), read('content-template.html')])
  assert.match(portal, /if \(!elements\.loading \|\| !elements\.error\) return/)
  assert.match(template, /intelligence\.js\?v=20261003-number-integrity-v5/)
})

test('topic catalogue is compact, searchable, visual, and does not bury research or trials', async () => {
  const [template, portal, css, build] = await Promise.all([read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js')])
  assert.match(template, /id="topicSearch"/)
  assert.match(template, /id="topicDomain"/)
  assert.match(build, /topics-directory\.json/)
  assert.match(portal, /fetch\('\/topics-directory\.json'/)
  assert.doesNotMatch(portal.match(/else if \(view === 'topics'\)[\s\S]*?else if \(view === 'topic'\)/)?.[0] || '', /request\('topics'/)
  assert.match(portal, /Showing \$\{numberFormatter\.format\(visible\.length\)\} of/)
  assert.match(portal, /elements\.topicDomain\?\.value \?\? ''/)
  assert.match(portal, /else url\.searchParams\.delete\('domain'\)/)
  assert.doesNotMatch(portal, /elements\.topicDomain\?\.value \|\| initialDomain/)
  assert.match(portal, /view === 'trials'[\s\S]*?renderTrials\(data\.trials \|\| \[\], topicEntries\);[\s\S]*?view === 'topics'/)
  assert.doesNotMatch(portal, /view === 'trials'[\s\S]*?renderTopics\(topicsData/)
  assert.match(portal, /allLink\.href = compact \? '\/topics' : '\/resources'/)
  assert.match(build, /Open global sources/)
  assert.match(template, /HERO_ACTION_HTML/)
  assert.match(css, /body\[data-view="topics"\] #topicsSection > \.section-heading \{ display:none; \}/)
  assert.match(css, /\.topic-domain-grid \{[^}]*repeat\(6, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.topic-domain-grid \.topic-card \{[^}]*min-height:142px/)
  assert.match(portal, /--card-hue/)
})

test('Evidence Compare is shareable, source-linked, and non-prescriptive', async () => {
  const [template, portal, css, build, routes] = await Promise.all([
    read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js'), read('vercel.json'),
  ])
  for (const id of ['compareSection', 'compareForm', 'compareLeft', 'compareRight', 'compareResults', 'compareSummary', 'compareGroups']) assert.match(template, new RegExp(`id="${id}"`))
  assert.match(build, /filename: 'compare\.html'/)
  assert.match(build, /PAGE_VIEW: 'compare'/)
  assert.match(build, /href="\/compare\?left=\$\{encodeURIComponent\(topic\.slug\)\}"/)
  assert.match(routes, /"source": "\/compare\/:pair", "destination": "\/compare\?pair=:pair"/)
  assert.match(portal, /Promise\.all\(\[\s*request\('topic-dossier', 12, \{ topic: leftSlug \}\)/)
  assert.match(portal, /history\.replaceState\(\{\}, '', `\/compare\/\$\{encodeURIComponent\(leftSlug\)\}-vs-\$\{encodeURIComponent\(rightSlug\)\}`\)/)
  assert.match(portal, /comparison_started/)
  assert.match(portal, /comparison_completed/)
  assert.match(portal, /Posted-results coverage/)
  assert.match(portal, /Visible evidence gaps/)
  assert.match(portal, /none of these signals determines effectiveness or safety/)
  assert.match(template, /do not establish benefit, safety, or suitability for any person/)
  assert.match(css, /EVIDENCE COMPARE/)
  assert.match(css, /\.compare-row/)
})

test('Trial Results Gap Monitor is source-linked, complete, and avoids misconduct claims', async () => {
  const [template, portal, css, build, routes, api, proxy] = await Promise.all([
    read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js'), read('vercel.json'),
    read('supabase/functions/public-intelligence/index.ts'), read('api/intelligence.js'),
  ])
  for (const id of ['resultsGapSection', 'resultsGapStats', 'resultsGapYears', 'resultsGapControls', 'resultsGapList']) assert.match(template, new RegExp(`id="${id}"`))
  assert.match(build, /filename: 'trial-results-gap\.html'/)
  assert.match(build, /PAGE_VIEW: 'trial-results-gap'/)
  assert.match(build, /href="\/trials\/results-gap"/)
  assert.match(build, /name === 'trial-results-gap\.html'\) return '\/trials\/results-gap'/)
  assert.match(routes, /"source": "\/trials\/results-gap", "destination": "\/trial-results-gap"/)
  assert.match(api, /if \(view === 'trial-results-gap'\)/)
  assert.match(api, /\.eq\('overall_status', 'Completed'\)/)
  assert.match(api, /for \(let page = 0; ; page \+= 1\)/)
  assert.match(api, /daysSinceCompletion > 365/)
  assert.match(api, /not a finding of legal non-compliance/)
  assert.match(proxy, /'trial-results-gap'/)
  assert.match(portal, /renderResultsGapMonitor/)
  assert.match(portal, /Verify in original registry/)
  assert.match(template, /It is a discovery signal—not proof/)
  assert.match(css, /TRIAL RESULTS GAP MONITOR/)
  assert.match(css, /\.results-gap-card--possible-gap/)
})

test('Funding Radar is source-linked, paginated, and distinguishes direct grants from acknowledgements', async () => {
  const [template, portal, css, build, api, worker, migration, strongMigration, grantWorker, proxy, pages, config] = await Promise.all([
    read('intelligence-template.html'), read('intelligence.js'), read('intelligence.css'), read('build.js'),
    read('supabase/functions/public-intelligence/index.ts'), read('supabase/functions/sync-funding-radar/index.ts'),
    read('supabase/migrations/20260928000700_funding_radar.sql'), read('supabase/migrations/20261001000600_strong_funding_database.sql'),
    read('supabase/functions/sync-direct-grants/index.ts'), read('api/intelligence.js'),
    read('supabase/functions/public-pages/index.ts'), read('supabase/config.toml'),
  ])
  for (const id of ['fundingSection', 'fundingStats', 'fundingYears', 'fundingFunders', 'fundingTopics', 'fundingControls', 'directGrantList', 'fundingList']) assert.match(template, new RegExp(`id="${id}"`))
  assert.match(build, /filename: 'funding\.html'/)
  assert.match(build, /href="\/funding">Open Funding Radar/)
  assert.match(build, /href="\/funding\?topic=/)
  assert.match(api, /if \(view === 'funding'\)/)
  assert.match(api, /next_offset/)
  assert.match(api, /historical_cycle_complete/)
  assert.match(worker, /select', 'id,title,publication_date,awards,funders'/)
  assert.match(worker, /upsert_funding_award_page/)
  assert.match(migration, /create table if not exists public\.funding_awards/)
  assert.match(migration, /get_funding_radar_overview/)
  assert.match(migration, /revoke all on table public\.funding_awards/)
  assert.match(migration, /immortal-life-funding-radar/)
  assert.match(strongMigration, /create table if not exists public\.funding_grants/)
  assert.match(strongMigration, /get_funding_award_page/)
  assert.match(strongMigration, /funding_radar_overview_cache/)
  assert.match(strongMigration, /interval '7 days'/)
  assert.match(grantWorker, /api\.reporter\.nih\.gov\/v2\/projects\/search/)
  assert.match(grantWorker, /cordis\.europa\.eu\/datalab\/sparql/)
  assert.match(grantWorker, /upsert_direct_grant_page/)
  assert.match(grantWorker, /const NIH_PAGE_SIZE = 100/)
  assert.match(grantWorker, /const CORDIS_PAGE_SIZE = 50/)
  assert.match(grantWorker, /consolidateCordisBindings/)
  assert.match(grantWorker, /diagnosticError/)
  assert.match(grantWorker, /ORDER BY \?id \?recipient \?amount/)
  assert.doesNotMatch(grantWorker, /principal_investigators|abstract_text|phr_text/)
  assert.match(api, /get_funding_award_page/)
  assert.match(api, /get_direct_grant_page/)
  assert.match(portal, /drawDirectGrants/)
  assert.match(template, /Direct award data/)
  assert.match(proxy, /'institution'/)
  assert.match(pages, /Funding acknowledgements/)
  assert.match(config, /\[functions\.sync-funding-radar\]/)
  assert.match(config, /\[functions\.sync-direct-grants\]/)
  assert.match(build, /does not measure total spending/i)
  assert.match(template, /Direct grant amounts and dates are reproduced from the named official source/i)
  assert.match(css, /FUNDING RADAR/)
})

test('funder profiles are source-backed, conservative, searchable, fast, and indexable only when useful', async () => {
  const [migration, fastProfileMigration, boundedProfileMigration, largeProfileMigration, fastestProfileMigration, directoryCacheMigration, worker, pages, script, config, sitemapProxy] = await Promise.all([
    read('supabase/migrations/20260928000800_funder_profiles.sql'),
    read('supabase/migrations/20261002000300_fast_funder_profiles.sql'),
    read('supabase/migrations/20261002000400_bounded_funder_profile_reads.sql'),
    read('supabase/migrations/20261002000500_responsive_large_funder_profiles.sql'),
    read('supabase/migrations/20261002000600_faster_largest_funder_profiles.sql'),
    read('supabase/migrations/20261002000700_fast_funder_directory_cache.sql'),
    read('supabase/functions/sync-funding-funders/index.ts'), read('supabase/functions/public-pages/index.ts'),
    read('intelligence.js'), read('vercel.json'), read('api/sitemap.js'),
  ])
  assert.match(migration, /create table if not exists public\.funding_funders/)
  assert.match(migration, /get_funder_directory/)
  assert.match(migration, /get_funder_page/)
  assert.match(fastProfileMigration, /funding_awards_funder_id_latest_idx/)
  assert.match(fastProfileMigration, /award_summary[\s\S]*work_summary[\s\S]*topic_summary[\s\S]*institution_summary/)
  assert.doesNotMatch(fastProfileMigration.match(/award_summary as \([\s\S]*?\), work_summary/)?.[0] || '', /funding_award_works/)
  assert.match(boundedProfileMigration, /latest_publication_date[\s\S]*count\(\*\)::bigint awards/)
  assert.doesNotMatch(boundedProfileMigration, /join public\.university_research_works w using \(openalex_work_id\)[\s\S]*group by 1 order by 1 desc limit 20/)
  assert.match(largeProfileMigration, /funding_radar_overview_cache/)
  assert.match(largeProfileMigration, /limit 2500/)
  assert.match(largeProfileMigration, /relationships_complete/)
  assert.match(fastestProfileMigration, /limit 1000/)
  assert.match(fastestProfileMigration, /headline totals still come from the full profile\/cache/i)
  assert.match(directoryCacheMigration, /create materialized view if not exists public\.funding_funder_stats_cache/)
  assert.match(directoryCacheMigration, /refresh materialized view concurrently public\.funding_funder_stats_cache/)
  assert.match(directoryCacheMigration, /left join public\.funding_funder_stats_cache s using \(funder_id\)/)
  assert.match(await read('supabase/migrations/20261001000600_strong_funding_database.sql'), /interval '7 days'/)
  assert.match(worker, /alternate_titles,country_code,description,homepage_url,ids,updated_date/)
  assert.doesNotMatch(worker, /image_url|image_thumbnail_url/)
  assert.match(pages, /mode === 'funders'/)
  assert.match(pages, /mode === 'funder'/)
  assert.match(pages, /award_count \?\? 0\) >= 3/)
  assert.match(pages, /immortal\.life is not affiliated with this organization/)
  assert.match(pages, /award entities last linked in this year/)
  assert.match(pages, /How this large profile is summarized/)
  assert.match(pages, /Linked publications in sample/)
  assert.match(script, /funderProfilePath/)
  assert.match(config, /funders\/:slug/)
  assert.match(config, /"source": "\/funders\/:path\*"/)
  assert.match(config, /sitemaps\/funders\.xml/)
  assert.match(sitemapProxy, /'funders'/)
})

test('Funding is a first-class global menu with useful desktop shortcuts', async () => {
  const shells = await Promise.all([
    read('index.html'), read('intelligence-template.html'), read('content-template.html'),
    read('privacy.html'), read('institutional-pilot.html'), read('institutional-pilot2.html'),
    read('auth-x.html'), read('auth-linkedin.html'), read('confirmed.html'), read('unsubscribed.html'),
    read('dashboard.html'), read('join.html'), read('leaderboard.html'),
    read('supabase/functions/public-pages/index.ts'),
  ])
  for (const shell of shells) assert.match(shell, /href="\/funding"[^>]*>Funding<\/a>/)
  const navigation = await read('desktop-nav.js')
  assert.match(navigation, /'\/funding': \{/)
  assert.match(navigation, /Direct grants[\s\S]*Funder directory[\s\S]*Leading funders[\s\S]*Funding by topic/)
  assert.match(await read('intelligence.js'), /summary\.topics, 'Longevity topics'/)
  assert.doesNotMatch(await read('intelligence.js'), /summary\.identified_awards, 'Award identifiers'/)
})

test('Signals and Sources replace overlapping regulatory, resource and briefing navigation', async () => {
  const shells = await Promise.all([
    read('index.html'), read('intelligence-template.html'), read('content-template.html'),
    read('privacy.html'), read('institutional-pilot.html'), read('institutional-pilot2.html'),
    read('auth-x.html'), read('auth-linkedin.html'), read('confirmed.html'), read('unsubscribed.html'),
    read('dashboard.html'), read('join.html'), read('leaderboard.html'),
    read('supabase/functions/public-pages/index.ts'), read('api/signals.js'),
  ])
  for (const shell of shells) {
    assert.match(shell, /href="\/signals"[^>]*>Signals<\/a>/)
    assert.match(shell, /href="\/resources"[^>]*>Sources<\/a>/)
    assert.doesNotMatch(shell, /href="\/(?:regulatory|briefings)"[^>]*>(?:Regulatory|Briefings)<\/a>/)
    assert.doesNotMatch(shell, /href="\/resources"[^>]*>Resources<\/a>/)
  }
  const navigation = await read('desktop-nav.js')
  assert.match(navigation, /'\/signals': \{/)
  assert.match(navigation, /Latest Signals[\s\S]*Global Trial Map[\s\S]*Trial Results Gap[\s\S]*Funding Map[\s\S]*Weekly briefings/)
  assert.match(navigation, /'\/resources': \{[\s\S]*Global Source Directory[\s\S]*Regulatory & Safety[\s\S]*Corrections & Retractions[\s\S]*Public Data & Feeds[\s\S]*Quality & Methodology/)
  assert.doesNotMatch(navigation, /'\/(?:regulatory|briefings)': \{/)
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
  assert.match(html, /<a href="\/changes" class="s1-nav-link">News<\/a>/)
  assert.match(html, /href="\/universities" class="s1-nav-link">Universities<\/a>[\s\S]*?href="\/research" class="s1-nav-link">Research<\/a>[\s\S]*?href="\/funding" class="s1-nav-link">Funding<\/a>[\s\S]*?href="\/signals" class="s1-nav-link">Signals<\/a>[\s\S]*?href="\/you" class="s1-nav-link s1-nav-you">You<\/a>[\s\S]*?href="\/resources" class="s1-nav-link">Sources<\/a>/)
  assert.match(css, /\.s1-nav-you[\s\S]*?box-shadow:/)
  for (const href of ['/changes', '/topics', '/trials', '/universities', '/research', '/funding', '/signals', '/you', '/resources', '/methodology']) assert.match(html, new RegExp(`href="${href}"`))
  assert.doesNotMatch(html, /href="\/(?:regulatory|briefings)" class="s1-nav-link"/)
  assert.match(html, /<a href="\/methodology" class="s1-nav-link">About<\/a>/)
  assert.doesNotMatch(html, /href="\/(?:discover|learn)"/)
  assert.doesNotMatch(html, /Newsreader/)
  assert.match(css, /\.hl \{[\s\S]*?font-family: var\(--font-serif\)/)
  assert.match(css, /font-size: clamp\(50px, 5\.25vw, 81px\)/)
  assert.match(css, /\.brand-mark \{[\s\S]*?width: 57px;/)
  assert.match(css, /\.brand-lockup span \{[\s\S]*?color: #c73572/)
  assert.match(css, /\.hero-question-accent \{[\s\S]*?color: #c73572/)
  assert.match(css, /\.home-search button \{[\s\S]*?background: #c73572/)
  assert.doesNotMatch(css.match(/\.s1-nav-you,[\s\S]*?\n\}/)?.[0] || '', /255, 238, 155|219, 169, 47/)
})

test('desktop navigation previews expose useful routes on every deployed page shell without changing mobile navigation', async () => {
  const [home, intelligenceTemplate, contentTemplate, menuScript, menuStyles, intelligence, ...memberPages] = await Promise.all([
    read('index.html'),
    read('intelligence-template.html'),
    read('content-template.html'),
    read('desktop-nav.js'),
    read('desktop-nav.css'),
    read('intelligence.js'),
    ...['auth-x.html', 'auth-linkedin.html', 'confirmed.html', 'unsubscribed.html', 'leaderboard.html'].map(read),
  ])
  for (const shell of [home, intelligenceTemplate, contentTemplate, ...memberPages]) {
    assert.match(shell, /desktop-nav\.css\?v=20261001-nav-shell-all/)
    assert.match(shell, /desktop-nav\.js\?v=20261003-menu-simplified-v1/)
  }
  for (const shell of memberPages) {
    assert.match(shell, /href="\/you" class="m-member-nav-you">You<\/a>/)
  }
  for (const domain of ['ageing-mechanisms', 'geroscience-interventions', 'nutrition-metabolism', 'lifestyle-environment', 'biomarkers-measurement', 'organs-systems', 'healthspan-clinical-ageing', 'genetics-regeneration-futures', 'population-longevity-prevention']) {
    assert.match(menuScript, new RegExp(`/topics\\?domain=${domain}`))
  }
  assert.match(menuScript, /\/universities\?country=US/)
  assert.match(menuScript, /\/trials\?status=active/)
  assert.match(menuScript, /\/research\?evidence=human/)
  assert.match(menuScript, /aria-haspopup/)
  assert.match(menuScript, /event\.key === 'Escape'/)
  assert.match(menuScript, /\.m-member-nav/)
  assert.match(menuStyles, /hover: hover/)
  assert.match(menuStyles, /pointer: fine/)
  assert.match(menuStyles, /max-width: 860px/)
  assert.match(menuStyles, /One quiet shell makes the destinations read as a single navigation system/)
  assert.match(menuStyles, /\.s1-nav-top,[\s\S]*?min-height: 44px;[\s\S]*?border: 1px solid rgba\(105, 57, 81, \.13\)/)
  assert.match(menuStyles, /\.s1-nav-top > a,[\s\S]*?min-height: 34px;[\s\S]*?border: 1px solid transparent/)
  assert.match(menuStyles, /\.s1-nav-top > \.s1-nav-you,[\s\S]*?min-height: 34px;[\s\S]*?0 0 17px rgba\(199, 53, 114, \.13\)/)
  assert.match(menuStyles, /\.m-member-nav > \.m-member-nav-you/)
  assert.match(intelligence, /requestedCountry/)
  assert.match(intelligence, /requestedSort/)
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
  assert.match(portal, /status: selectedStatus/)
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
  assert.match(portal, /filteredResearch/)
  assert.match(portal, /immortal-life-public-intelligence-v15/)
  assert.match(portal, /const endpoint = '\/api\/intelligence'/)
  assert.match(portal, /new URL\(endpoint, window\.location\.origin\)/)
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
    const primaryNav = source.match(/<nav class="intel-nav"[\s\S]*?<\/nav>/)?.[0] || source
    assert.match(source, /intel-nav-search/)
    assert.doesNotMatch(source, /intel-nav-more/)
    assert.match(source, /mobile-dock/)
    assert.match(source, /Continue exploring/)
    assert.match(primaryNav, /<a href="\/topics"[^>]*>Topics<\/a>/)
    assert.match(primaryNav, /<a href="\/you"[^>]*>You<\/a>/)
    assert.match(primaryNav, /<a href="\/changes">News<\/a>/)
    assert.match(primaryNav, /<a href="\/methodology">About<\/a>/)
    assert.doesNotMatch(primaryNav, /href="\/(?:discover|learn)"/)
  }
  assert.doesNotMatch(files[0], /reader-mode/)
  assert.doesNotMatch(files[2], /reader-mode/)
})

test('mobile hamburger navigation is identical on every public shell', async () => {
  const [home, intelligence, content, privacy, confirmed, unsubscribed, authX, authLinkedIn, leaderboard] = await Promise.all([
    read('index.html'), read('intelligence-template.html'), read('content-template.html'), read('privacy.html'), read('confirmed.html'), read('unsubscribed.html'), read('auth-x.html'), read('auth-linkedin.html'), read('leaderboard.html'),
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
  assert.deepEqual(menuLinks(authX, 'authXMemberNav'), expected)
  assert.deepEqual(menuLinks(authLinkedIn, 'linkedinMemberNav'), expected)
  assert.deepEqual(menuLinks(leaderboard, 'leaderboardMemberNav'), expected)
  const dockLinks = (source) => [...(source.match(/<nav class="mobile-dock"[\s\S]*?<\/nav>/)?.[0] || '').matchAll(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?([^<>]+)<\/a>/g)].map((match) => `${match[1]}:${match[2].trim()}`)
  const expectedDock = dockLinks(intelligence)
  assert.deepEqual(dockLinks(home), expectedDock)
  assert.deepEqual(dockLinks(content), expectedDock)
  assert.deepEqual(dockLinks(privacy), expectedDock)
  for (const source of [home, intelligence, content, privacy]) {
    const dock = source.match(/<nav class="mobile-dock"[\s\S]*?<\/nav>/)?.[0] || ''
    assert.match(dock, /mobile-dock-you[^>]*href="\/you"/)
    assert.doesNotMatch(dock, /<button/)
  }
  const intelligenceCss = await read('intelligence.css')
  const membersCss = await read('members.css')
  assert.match(intelligenceCss, /\.intel-nav \{ position:absolute; top:calc\(100% \+ 12px\)/)
  assert.doesNotMatch(intelligenceCss, /\.intel-nav \{ position:fixed/)
  assert.doesNotMatch(intelligenceCss, /\/\* Living atlas navigation, orientation, and learning tools \*\/\s*\.intel-nav \{ position:relative; \}/)
  assert.match(intelligenceCss, /@media \(min-width:861px\) \{ \.intel-nav \{ position:relative; \} \}/)
  assert.match(membersCss, /\.m-member-nav \{\s+position:\s*absolute;\s+top:\s*calc\(100% \+ 12px\)/)
  assert.doesNotMatch(membersCss, /\.m-member-nav \{\s+position:\s*fixed/)
  assert.doesNotMatch(home, /Project News|href="\/dashboard"|href="\/join"/)
})

test('all topic pages share a reader-first living dossier structure', async () => {
  const [build, portal, api, css, migration] = await Promise.all([
    read('build.js'), read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts'), read('intelligence.css'), read('supabase/migrations/20260926000300_reader_first_topic_dossiers.sql'),
  ])
  for (const id of ['topicUniversities', 'topicUniversityGrid', 'topicTrend', 'topicTrendChart', 'topicSourceBasisList', 'topicEvidenceContext', 'topicEndGuide']) assert.match(build, new RegExp(`id="${id}"`))
  assert.match(build, /Reliable source basis/)
  assert.match(build, /research-activity guide, not a ranking of teaching quality/)
  assert.match(portal, /renderTopicReaderOverview/)
  assert.match(portal, /trend_recent_total/)
  assert.match(api, /get_topic_reader_overview/)
  assert.match(migration, /research_by_year/)
  assert.match(migration, /leading_universities/)
  assert.match(css, /READER-FIRST TOPIC DOSSIERS/)
  assert.match(css, /body\[data-view="topic"\] \.intel-hero/)
})

test('university fallbacks never present a 100-row sample as complete global coverage', async () => {
  const [proxy, portal, api] = await Promise.all([
    read('api/intelligence.js'), read('intelligence.js'), read('supabase/functions/public-intelligence/index.ts'),
  ])
  assert.match(proxy, /total_matching: null/)
  assert.match(proxy, /temporary sample, not index totals/)
  assert.match(proxy, /\['overview', 'universities', 'topic-dossier', 'trial-results-gap', 'funding'\]\.includes\(request\.query\?\.view\)/)
  assert.match(proxy, /slowAggregate \? 9000 : 3500/)
  assert.match(api, /country_name\.ilike/)
  assert.match(api, /\.select\(institutionFields, \{ count: filteredDirectory \? 'exact' : 'planned' \}\)/)
  assert.match(api, /supabase\.from\('university_research_topic_metrics'\)/)
  assert.match(api, /university_research_institutions!inner/)
  assert.match(api, /uses university_topic_rank_idx directly/)
  assert.match(api, /university_research_institutions!inner\(\$\{institutionFields\}\)`, \{ count: 'exact' \}/)
  assert.match(api, /total_matching: hasDirectoryFilters \? Number\(count \?\? 0\) : Number\(coverage\.data\?\.universities/)
  assert.match(api, /next_offset: offset \+ universities\.length < Number\(hasDirectoryFilters/)
  assert.match(portal, /Load 100 more/)
  assert.match(portal, /data\.total_matching != null/)
  assert.match(portal, /const activeTopic = elements\.universityTopic\?\.value \|\| requestedTopic/)
  assert.doesNotMatch(portal, /elements\.universityTopic\.value = requestedTopic;\s*return fetchUniversityIndex\(\)/)
  assert.match(portal, /complete university index is reconnecting/i)
})

test('university profile provenance and record links have non-overlapping spacing', async () => {
  const [css, template, pages] = await Promise.all([
    read('intelligence.css'), read('intelligence-template.html'), read('supabase/functions/public-pages/index.ts'),
  ])
  assert.match(css, /\.university-profile-metrics \+ \.record-links \{ margin: 34px 0 0; \}/)
  assert.match(css, /\.university-profile-metrics \+ \.record-links \+ \.quality-intro \{ max-width: 980px; margin: 20px 0 36px; \}/)
  assert.match(template, /intelligence\.css\?v=20261003-number-integrity-v5/)
  assert.match(pages, /intelligence\.css\?v=20261003-number-integrity-v5/)
  assert.match(template, /intelligence\.js\?v=20261003-number-integrity-v5/)
  assert.match(pages, /intelligence\.js\?v=20261003-number-integrity-v5/)
  assert.match(pages, /desktop-nav\.css\?v=20261001-nav-shell-all/)
  assert.match(pages, /desktop-nav\.js\?v=20261003-menu-simplified-v1/)
  assert.match(await read('intelligence.js'), /\['universities', 'topic-dossier', 'trial-results-gap', 'funding'\]\.includes\(viewName\) \? 10000 : 6500/)
  assert.match(pages, /Full-history total not yet available/)
  assert.match(pages, /fullHistoryAvailable \? works : '—'/)
})

test('private daily management report is daily, numerical, and action-oriented', async () => {
  const [report, migration, config] = await Promise.all([
    read('supabase/functions/daily-management-report/index.ts'), read('supabase/migrations/20260926000400_daily_management_report.sql'), read('supabase/config.toml'),
  ])
  assert.match(report, /hello@immortal\.life/)
  assert.match(report, /Google Search Console/)
  assert.match(report, /Google search · latest complete day/)
  assert.match(report, /Visitor activity ·/)
  assert.match(report, /utility_event_daily/)
  assert.match(report, /Knowledge added · last 24 hours/)
  assert.match(report, /Coverage progress · last 24 hours/)
  assert.match(report, /Website health · right now/)
  assert.match(report, /Actions for you/)
  assert.match(report, /The connection is working/)
  assert.match(report, /p_hours: 24/)
  assert.doesNotMatch(report, /recordRows|Top landing pages|Most visited pages|latest 7 days|previous 7 days/)
  assert.match(report, /RESEND_API_KEY/)
  assert.match(migration, /0 17,18 \* \* \*/)
  assert.match(migration, /daily_management_reports/)
  assert.match(config, /\[functions\.daily-management-report\]/)
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
  assert.match(portal, /ranked by the all-history topic result count/)
  assert.match(portal, /\$\{topicName\} research records/)
  assert.match(portal, /OpenAlex research records associated with this university/)
  assert.match(portal, /viewName === 'universities' && window\.IL_FN_BASE/)
  assert.match(portal, /immortal-life-public-intelligence-v15/)
  assert.match(api, /\.gt\('works_all_time', 0\)/)
  assert.match(api, /\.order\('works_all_time', \{ ascending: false \}\)/)
  assert.match(await read('api/intelligence.js'), /'directory_rules'/)
  assert.match(api, /university_research_topic_metrics: \[topicMetric\]/)
  assert.match(template, /id="universityHeading"/)
})

test('evidence features remain connected while retired learning and dashboard pages redirect', async () => {
  const [build, portal, routes, publicPages] = await Promise.all([
    read('build.js'), read('intelligence.js'), read('vercel.json'), read('supabase/functions/public-pages/index.ts'),
  ])
  assert.match(build, /filename: 'you\.html'/)
  assert.match(build, /page\.filename !== 'learn\.html'/)
  assert.match(portal, /evidenceLadder/)
  assert.match(portal, /trialLadder/)
  assert.match(portal, /includes\('PHASE3'\) \? 2/)
  assert.match(portal, /\['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'\]/)
  assert.match(portal, /il_recent_topics/)
  assert.doesNotMatch(build, /'dashboard\.html'|'join\.html'/)
  assert.match(routes, /"source": "\/dashboard", "destination": "\/topics"/)
  assert.match(routes, /"source": "\/join", "destination": "\/topics"/)
  assert.match(routes, /"source": "\/learn", "destination": "\/methodology", "permanent": true/)
  assert.match(routes, /"source": "\/discover", "destination": "\/you", "permanent": true/)
  assert.match(publicPages, /evidenceLadderHtml/)
  assert.match(publicPages, /trial-country-map/)
})

test('every topic builds a Living Evidence Dossier and connects to Longevity Watch', async () => {
  const [build, portal, css, migration, delivery] = await Promise.all([
    read('build.js'),
    read('intelligence.js'),
    read('intelligence.css'),
    read('supabase/migrations/20260926000100_expand_living_evidence_dossiers.sql'),
    read('supabase/functions/deliver-briefings/index.ts'),
  ])
  assert.match(build, /Living Evidence Dossier/)
  assert.match(build, /id="topicDossierSnapshot"/)
  assert.match(build, /id="topicHeroTimelineList"/)
  assert.match(build, /data-watch-topic=/)
  assert.match(build, /filename: 'you\.html'[\s\S]*?Longevity Watch/)
  assert.match(portal, /il_longevity_watch/)
  assert.match(portal, /function renderTopicEvidence/)
  assert.match(portal, /human_evidence_total/)
  assert.match(portal, /registered_enrollment/)
  assert.match(portal, /topicHeroTimelineList/)
  assert.match(portal, /integrity_total/)
  assert.match(css, /\.dossier-snapshot/)
  assert.match(css, /\.longevity-watch/)
  assert.match(migration, /create or replace function public\.get_topic_evidence_snapshot/)
  assert.match(migration, /'human_evidence_total'/)
  assert.match(migration, /'last_meaningful_update'/)
  assert.match(delivery, /topicChanges/)
  assert.match(delivery, /paid_distribution_allowed/)
})

test('senolytics pilots versioned cautious conclusions without silently rewriting them', async () => {
  const [build, portal, api, migration] = await Promise.all([
    read('build.js'),
    read('intelligence.js'),
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/migrations/20260927000700_senolytics_living_conclusions_pilot.sql'),
  ])
  assert.match(build, /topic-current-interpretation[^>]*[\s\S]{0,180}hidden/)
  assert.match(build, /What the evidence supports today/)
  assert.match(portal, /renderTopicPilot/)
  assert.match(portal, /if \(!pilot\?\.enabled \|\| !conclusions\.length\)/)
  assert.match(portal, /topicCurrentInterpretation\.hidden = true/)
  assert.match(portal, /cannot silently reverse the conclusion/)
  assert.match(portal, /20260930-audited-pilot-metrics-b/)
  assert.match(api, /get_topic_dossier_pilot/)
  assert.match(migration, /topic_dossier_versions/)
  assert.match(migration, /topic_dossier_change_candidates/)
  assert.match(migration, /publish_topic_dossier_version/)
  assert.match(migration, /A general safety conclusion is not supported/)
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
