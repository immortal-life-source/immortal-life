import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('research and trial ingestion has resumable all-history streams without a total-record cap', async () => {
  const [sync, migration] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/migrations/20260925000100_complete_knowledge_pipeline.sql'),
  ])
  assert.match(sync, /HISTORY_START = '1800-01-01'/)
  assert.match(sync, /cursorMark/)
  assert.match(sync, /nextPageToken/)
  assert.match(sync, /splitDateRange/)
  assert.match(sync, /next-cursor/)
  assert.match(sync, /runTimeBudgetMs = requestedSource === 'all' \? RUN_TIME_BUDGET_MS : 25_000/)
  assert.match(sync, /while \(Date\.now\(\) - runStartedAt < runTimeBudgetMs\)/)
  assert.match(sync, /triggerKind !== 'schedule'/)
  assert.doesNotMatch(sync, /MAX_JOBS_PER_RUN/)
  assert.match(migration, /sync_mode in \('incremental', 'history'\)/)
  assert.match(migration, /'retractions:history'/)
})

test('uncapped historical ingestion is paced below the database IO baseline', async () => {
  const [worker, migration] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/migrations/20260925001700_protect_database_io_budget.sql'),
  ])
  assert.match(worker, /DEDICATED_SOURCE_IDS/)
  assert.match(worker, /filter\(\(sourceId\) => !DEDICATED_SOURCE_IDS\.has\(sourceId\)\)/)
  assert.match(migration, /immortal-life-intelligence-sync', '17 \*\/6/)
  assert.match(migration, /immortal-life-doaj-sync', '7 \*/)
  assert.match(migration, /immortal-life-isrctn-sync', '27 \*\/2/)
  assert.match(migration, /immortal-life-university-index', '47 \*\/2/)
  assert.match(migration, /cron\.unschedule\(existing_job_id\)/)
  assert.doesNotMatch(migration, /delete from|truncate/i)
})

test('public research and trial browsing avoids exact full-corpus count scans', async () => {
  const api = await read('supabase/functions/public-intelligence/index.ts')
  const researchView = api.slice(api.indexOf("if (view === 'research')"), api.indexOf("if (view === 'trials')"))
  const trialView = api.slice(api.indexOf("if (view === 'trials')"), api.indexOf("if (view === 'integrity')"))
  assert.match(researchView, /count: 'planned'/)
  assert.match(trialView, /count: 'planned'/)
  assert.doesNotMatch(researchView, /count: 'exact'/)
  assert.doesNotMatch(trialView, /count: 'exact'/)
})

test('public browsing, graph totals, sitemaps and downloads traverse the complete retained corpus', async () => {
  const [api, pages, portal, graphMigration] = await Promise.all([
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/functions/public-pages/index.ts'),
    read('intelligence.js'),
    read('supabase/migrations/20260925000300_uncapped_public_indexes.sql'),
  ])
  assert.match(api, /next_offset/)
  assert.match(api, /\.range\(offset, offset \+ limit - 1\)/)
  assert.match(portal, /Load more research/)
  assert.match(portal, /Load more trials/)
  assert.match(pages, /new ReadableStream/)
  assert.match(pages, /SITEMAP_SEGMENT_SIZE = 25_000/)
  assert.match(pages, /recordSitemapResponse/)
  assert.match(pages, /while \(true\)/)
  assert.match(pages, /collectAllRows/)
  assert.doesNotMatch(pages, /modified: string; limit: number/)
  assert.match(api, /get_intelligence_graph_counts/)
  assert.doesNotMatch(api, /research_item_topics[^\n]+limit\(5000\)/)
  assert.match(graphMigration, /get_intelligence_topic_overlap_counts/)
  const datasetImplementation = pages.match(/async function dataset[\s\S]*?async function universityWorks/)?.[0] || ''
  assert.doesNotMatch(datasetImplementation, /\.limit\(5000\)/)
  assert.doesNotMatch(datasetImplementation, /\.limit\(10000\)/)
  const topicCounts = await read('supabase/migrations/20260925001300_set_based_topic_counts.sql')
  assert.match(topicCounts, /with research_counts as/)
  assert.match(topicCounts, /group by relation\.topic_slug/)
  assert.doesNotMatch(topicCounts, /where rit\.topic_slug = topic\.slug/)
  const liveCounts = await read('supabase/migrations/20260925001400_live_topic_count_cache.sql')
  assert.match(liveCounts, /intelligence_topic_counts_cache/)
  assert.match(liveCounts, /research_topic_count_cache after insert or update or delete/)
  assert.match(liveCounts, /immortal-life-topic-count-reconcile/)
  const qualityCache = await read('supabase/migrations/20260925001500_cache_public_quality_telemetry.sql')
  assert.match(qualityCache, /intelligence_quality_telemetry_cache/)
  assert.match(qualityCache, /immortal-life-quality-telemetry-refresh/)
  const graphCache = await read('supabase/migrations/20260925001600_cache_complete_evidence_graph.sql')
  assert.match(graphCache, /intelligence_graph_cache/)
  assert.match(graphCache, /refresh_intelligence_graph_cache/)
  assert.match(graphCache, /jsonb_to_recordset\(cache\.overlap_rows\)/)
})
