import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared ingestion reserves three page slots in four for historical work', async () => {
  const source = await read('supabase/functions/sync-intelligence/index.ts')
  assert.match(source, /processed % 4 === 3 \? 'incremental' : 'history'/)
  assert.match(source, /fairness_policy: 'three_history_pages_per_incremental_page'/)
})

test('API pages use database-side batch link and quality functions', async () => {
  const [sync, universities, migration] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/functions/sync-university-index/index.ts'),
    read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql'),
  ])
  assert.match(sync, /link_research_ingestion_page/)
  assert.match(sync, /link_trial_ingestion_page/)
  assert.match(universities, /link_university_ingestion_page/)
  assert.match(migration, /refresh_research_quality\(affected_ids\)/)
  assert.match(migration, /refresh_trial_quality\(affected_ids\)/)
})

test('university history is isolated off peak and expensive score rebuild is daily', async () => {
  const [source, migration] = await Promise.all([
    read('supabase/functions/sync-university-index/index.ts'),
    read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql'),
  ])
  assert.match(source, /HISTORY_RUN_TIME_BUDGET_MS = 80_000/)
  assert.doesNotMatch(source, /if \(nextPhase === 'complete'\)[\s\S]{0,200}refresh_university_research_scores/)
  assert.match(migration, /immortal-life-university-history/)
  assert.match(migration, /immortal-life-university-score-refresh/)
})

test('high-volume historical sources receive independent bounded recovery capacity', async () => {
  const migration = await read('supabase/migrations/20260928000200_accelerate_historical_source_workers.sql')
  assert.match(migration, /immortal-life-pubmed-sync/)
  assert.match(migration, /immortal-life-europe-pmc-sync/)
  assert.match(migration, /immortal-life-clinicaltrials-sync/)
  assert.match(migration, /"source":"pubmed"/)
  assert.match(migration, /"source":"europe-pmc"/)
  assert.match(migration, /"source":"clinicaltrials-gov"/)
  assert.match(migration, /immortal-life-university-history/)
  assert.match(migration, /'\*\/5 22-23,0-4 \* \* \*'/)
})

test('high-volume pages stay below the indexed upsert statement budget and shrink only on database timeout', async () => {
  const source = await read('supabase/functions/sync-intelligence/index.ts')
  assert.match(source, /PUBMED_PAGE_SIZE = 100/)
  assert.match(source, /EUROPE_PMC_PAGE_SIZE = 125/)
  assert.match(source, /CLINICAL_TRIALS_PAGE_SIZE = 50/)
  assert.match(source, /adaptiveDatabasePageSize/)
  assert.match(source, /job\.database_timeout_count/)
  assert.doesNotMatch(source, /adaptiveDatabasePageSize\([^\n]+job\.attempts/)
  assert.match(source, /canceling statement due to statement timeout/)
})

test('heavy research writes serialize only during taxonomy rebuilding with an expiring private lease', async () => {
  const [source, migration] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/migrations/20261002001200_serialize_heavy_research_writes.sql'),
  ])
  assert.match(source, /HEAVY_RESEARCH_SOURCE_IDS = new Set\(\['pubmed', 'europe-pmc'\]\)/)
  assert.match(source, /taxonomy_reindex_active/)
  assert.match(source, /try_acquire_ingestion_worker_lease/)
  assert.match(source, /release_ingestion_worker_lease/)
  assert.match(source, /incremental_freshness_preserved: true/)
  assert.match(migration, /database_timeout_count integer not null default 0/)
  assert.match(migration, /create table if not exists public\.ingestion_worker_leases/)
  assert.match(migration, /expires_at <= now\(\)/)
  assert.match(migration, /revoke all on table public\.ingestion_worker_leases from public, anon, authenticated/)
  assert.doesNotMatch(migration, /delete from public\.research_items|truncate table public\.research_items|drop table public\.research_items/i)
  const executableSql = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
  assert.doesNotMatch(executableSql, /spend[_ ]cap|subscription|billing/i)
})

test('Pro ingestion headroom is used without changing billing controls', async () => {
  const [sync, universities, migration] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/functions/sync-university-index/index.ts'),
    read('supabase/migrations/20260928000900_use_pro_ingestion_headroom.sql'),
  ])
  assert.match(sync, /CLINICAL_TRIALS_PAGE_SIZE = 50/)
  assert.match(sync, /error instanceof UpstreamHttpError[\s\S]{0,120}error\.status !== 400[\s\S]{0,100}!savedPageToken/)
  assert.match(sync, /isEuropePmcTransient[\s\S]{0,500}24 \* 60 \* 60 \* 1000/)
  assert.match(universities, /HISTORY_RUN_TIME_BUDGET_MS = 80_000/)
  assert.match(migration, /'\*\/2 22-23,0-4 \* \* \*'/)
  assert.match(migration, /does not alter billing controls, compute size, corpus scope/)
  const executableSql = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
  assert.doesNotMatch(executableSql, /spend[_ ]cap|subscription|billing/i)
})

test('taxonomy completion temporarily receives priority without disabling ingestion', async () => {
  const migration = await read('supabase/migrations/20261001000900_prioritize_taxonomy_completion.sql')
  assert.match(migration, /process_priority_topic_taxonomy_reindex/)
  assert.match(migration, /utc_hour between 0 and 7 then 300 else 150/)
  assert.match(migration, /where not public\.taxonomy_reindex_active\(\)/g)
  assert.match(migration, /immortal-life-pubmed-sync/)
  assert.match(migration, /immortal-life-europe-pmc-sync/)
  assert.match(migration, /immortal-life-clinicaltrials-sync/)
  assert.match(migration, /immortal-life-doaj-sync/)
  assert.match(migration, /immortal-life-direct-grants/)
  assert.match(migration, /immortal-life-university-history/)
  assert.doesNotMatch(migration, /delete from public\.|truncate table public\./i)
})

test('storage migration starts as an additive private archive foundation', async () => {
  const migration = await read('supabase/migrations/20261001000200_reliable_ingestion_and_archive_foundation.sql')
  assert.match(migration, /research_candidate_archive_manifest/)
  assert.match(migration, /research-candidate-archive/)
  assert.match(migration, /public = false/)
  assert.match(migration, /pg_try_advisory_xact_lock/)
  assert.match(migration, /create temporary table topic_counts_next/)
  assert.match(migration, /canonical_name/)
  assert.doesNotMatch(migration, /delete from public\.research_items|truncate table public\.research_items|drop table public\.research_items/i)
})

test('DOAJ history uses one resumable OAI-PMH harvest instead of deep search paging', async () => {
  const [sync, migration, boundedWorker] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/migrations/20261001000300_doaj_oai_global_harvest.sql'),
    read('supabase/migrations/20261001000400_bound_doaj_oai_worker.sql'),
  ])
  assert.match(sync, /parseDoajOaiPage/)
  assert.match(sync, /oai:global:/)
  assert.match(sync, /badResumptionToken/)
  assert.match(sync, /DOAJ OAI-PMH deletion signal|deletion reconciliation/)
  assert.match(migration, /link_research_ingestion_batch/)
  assert.match(migration, /get_doaj_oai_harvest_report/)
  assert.match(migration, /Waiting for the shared DOAJ OAI-PMH history harvest/)
  assert.match(migration, /'\*\/3 \* \* \* \*'/)
  assert.match(sync, /DOAJ_PAGE_START_BUDGET_MS = 45_000/)
  assert.match(sync, /requestedSource === 'doaj' \? 4 \* 60 \* 1000/)
  assert.match(sync, /Recovered abandoned job from its durable cursor/)
  assert.match(sync, /attempts: Number\(abandonedJob\.attempts \?\? 0\) \+ 1/)
  assert.match(sync, /adaptiveDatabasePageSize\(50, job\.database_timeout_count, 10\)/)
  assert.match(sync, /isDoajDatabaseTimeout \? 60 \* 1000/)
  assert.match(boundedWorker, /'\* \* \* \* \*'/)
  assert.match(boundedWorker, /Recovered safely from the initial OAI worker timeout/)
  assert.doesNotMatch(migration, /delete from public\.research_items|truncate table public\.research_items/i)
  assert.doesNotMatch(boundedWorker, /delete from public\.research_items|truncate table public\.research_items/i)
})

test('source reuse is fail-closed, auditable, expiring, and excluded from paid delivery by default', async () => {
  const [migration, expiry] = await Promise.all([
    read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql'),
    read('supabase/migrations/20260927000400_quarantine_expired_source_records.sql'),
  ])
  assert.match(migration, /source_rights_decisions/)
  assert.match(migration, /validate_source_rights_activation/)
  assert.match(migration, /rights_review_due_at < current_date/)
  assert.match(migration, /expire_unreviewed_source_rights/)
  assert.match(migration, /paid_distribution_allowed = false/)
  assert.match(expiry, /publication_state = 'quarantined'/)
  assert.match(expiry, /delete from public\.intelligence_change_events/)
})

test('ingestion telemetry is collected privately and the management report uses a daily window', async () => {
  const [migration, report] = await Promise.all([
    read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql'),
    read('supabase/functions/daily-management-report/index.ts'),
  ])
  assert.match(migration, /ingestion_throughput_snapshots/)
  assert.match(migration, /get_ingestion_throughput_report/)
  assert.match(migration, /immortal-life-ingestion-throughput/)
  assert.match(report, /Coverage progress · last 24 hours/)
  assert.match(report, /p_hours: 24/)
})
