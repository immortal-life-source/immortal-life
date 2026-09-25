import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { researchEvidenceSnapshot, trialEvidenceSnapshot } from '../supabase/functions/_shared/intelligence.ts'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('metadata-only research never invents a finding', () => {
  const snapshot = researchEvidenceSnapshot({ evidence_level: 'randomized-human', publication_type: 'Randomized Controlled Trial' })
  assert.equal(snapshot.status, 'metadata-only')
  assert.equal(snapshot.reported_outcome, null)
  assert.match(snapshot.main_limitation, /does not provide enough reusable detail/i)
  assert.match(snapshot.source_support, /Bibliographic citation metadata/i)
})

test('registered trials distinguish planned outcomes from reported results', () => {
  const snapshot = trialEvidenceSnapshot({
    phases: ['PHASE2'], study_type: 'Interventional', enrollment: 120,
    start_date: '2025-01-01', completion_date: '2026-01-01',
    metadata: { interventions: ['Intervention A'], outcome_measures: ['Frailty score — 12 months'], source_has_results: false },
  })
  assert.equal(snapshot.participants, 120)
  assert.deepEqual(snapshot.outcomes_measured, ['Frailty score — 12 months'])
  assert.equal(snapshot.reported_outcome, null)
  assert.match(snapshot.main_limitation, /study registration/i)
})

test('evidence snapshots and topic evidence are exposed on public pages', async () => {
  const [api, pages, portal] = await Promise.all([
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/functions/public-pages/index.ts'),
    read('intelligence.js'),
  ])
  assert.match(api, /view === 'topic-evidence'/)
  assert.match(api, /evidence_snapshot/)
  assert.match(pages, /What the source actually supports/)
  assert.match(portal, /appendEvidenceSnapshot/)
  assert.match(portal, /renderTopicEvidence/)
})

test('ISRCTN and DOAJ are explicit, commercially-cleared live feeds', async () => {
  const [migration, sync, workers] = await Promise.all([
    read('supabase/migrations/20260925000700_evidence_snapshots_and_global_live_sources.sql'),
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/migrations/20260925000900_dedicated_global_feed_workers.sql'),
  ])
  for (const source of ['isrctn', 'doaj']) {
    assert.match(migration, new RegExp(`'${source}'`))
    assert.match(sync, new RegExp(`job\\.source_id === '${source}'`))
  }
  assert.match(migration, /CC BY 4\.0/)
  assert.match(migration, /CC0 waiver/)
  assert.match(migration, /excludes abstracts, full text and publisher media/)
  assert.doesNotMatch(sync, /source_id: 'doaj'[\s\S]{0,1600}abstract_text: cleanText/)
  assert.match(sync, /requestedSource !== 'all'\) jobsQuery = jobsQuery\.eq\('source_id', requestedSource\)/)
  assert.match(sync, /last_success_at: completedAt/)
  assert.match(workers, /immortal-life-doaj-sync/)
  assert.match(workers, /immortal-life-isrctn-sync/)
})
