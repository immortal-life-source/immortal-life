import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the complete retained corpus is re-evaluated against all enabled topics in bounded batches', async () => {
  const [migration, worker] = await Promise.all([
    read('supabase/migrations/20260927000800_topic_taxonomy_reindex_readiness.sql'),
    read('supabase/functions/sync-intelligence/index.ts'),
  ])
  assert.match(migration, /topic_taxonomy_reindex_runs/)
  assert.match(migration, /process_topic_taxonomy_reindex\(requested_batch_size integer default 150\)/)
  assert.match(migration, /cross join public\.intelligence_topics topic/)
  assert.match(migration, /greatest\(10, least\(coalesce\(requested_batch_size, 150\), 500\)\)/)
  assert.match(migration, /\* 0-5 \* \* \*/)
  assert.match(worker, /reindex_research_source_records/)
  assert.match(worker, /reindex_trial_source_records/)
})

test('published interpretations fail closed until topic history, reindexing, university coverage and quality all pass', async () => {
  const migration = await read('supabase/migrations/20260927000800_topic_taxonomy_reindex_readiness.sql')
  assert.match(migration, /topic_coverage_readiness/)
  assert.match(migration, /history\.research_complete = history\.research_expected/)
  assert.match(migration, /history\.trial_complete = history\.trial_expected/)
  assert.match(migration, /university\.phase = 'complete'/)
  assert.match(migration, /invalid_public_matches/)
  assert.match(migration, /Topic % is not ready for a published interpretation/)
  assert.match(migration, /get_topic_readiness_report/)
})

test('sleep remains a preview and does not receive a production conclusion before readiness', async () => {
  const [build, migration] = await Promise.all([
    read('build.js'),
    read('supabase/migrations/20260927000800_topic_taxonomy_reindex_readiness.sql'),
  ])
  assert.match(build, /topic\.slug === 'senolytics'/)
  assert.doesNotMatch(migration, /Direct lifespan extension not established/)
  assert.doesNotMatch(migration, /insert into public\.topic_dossier_versions[\s\S]{0,1200}'sleep'/)
})
