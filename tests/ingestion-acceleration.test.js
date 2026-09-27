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
  assert.match(source, /HISTORY_RUN_TIME_BUDGET_MS = 50_000/)
  assert.doesNotMatch(source, /if \(nextPhase === 'complete'\)[\s\S]{0,200}refresh_university_research_scores/)
  assert.match(migration, /immortal-life-university-history/)
  assert.match(migration, /immortal-life-university-score-refresh/)
})

test('source reuse is fail-closed, auditable, expiring, and excluded from paid delivery by default', async () => {
  const migration = await read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql')
  assert.match(migration, /source_rights_decisions/)
  assert.match(migration, /validate_source_rights_activation/)
  assert.match(migration, /rights_review_due_at < current_date/)
  assert.match(migration, /expire_unreviewed_source_rights/)
  assert.match(migration, /paid_distribution_allowed = false/)
})

test('72-hour ingestion telemetry is collected privately and included in management reporting', async () => {
  const [migration, report] = await Promise.all([
    read('supabase/migrations/20260927000300_accelerate_history_and_enforce_source_policy.sql'),
    read('supabase/functions/daily-management-report/index.ts'),
  ])
  assert.match(migration, /ingestion_throughput_snapshots/)
  assert.match(migration, /get_ingestion_throughput_report/)
  assert.match(migration, /immortal-life-ingestion-throughput/)
  assert.match(report, /Historical coverage progress/)
  assert.match(report, /p_hours: 72/)
})
