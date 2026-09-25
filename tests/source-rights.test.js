import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('source policy fails closed and keeps WHO ICTRP directory-only', async () => {
  const migration = await read('supabase/migrations/20260925000400_source_usage_rights.sql')
  assert.match(migration, /rights_class in \('commercial', 'link_only', 'blocked'\)/)
  assert.match(migration, /paid_distribution_allowed boolean not null default false/)
  assert.match(migration, /where id = 'who-ictrp'/)
  assert.match(migration, /WHO ICTRP terms prohibit marketing, promotional and commercial use/)
  assert.match(migration, /where resource_type = 'trial_registry' and id <> 'clinicaltrials-gov'/)
  assert.match(migration, /create trigger enforce_trial_source_rights/)
  assert.match(migration, /create trigger guard_change_event_source_rights/)
})

test('ClinicalTrials.gov remains live but is labelled as terms-governed metadata', async () => {
  const [policy, correction] = await Promise.all([
    read('supabase/migrations/20260925000400_source_usage_rights.sql'),
    read('supabase/migrations/20260925000600_clinicaltrials_terms_label.sql'),
  ])
  assert.match(policy, /when source\.id = 'clinicaltrials-gov' then 'terms-apply'/)
  assert.match(correction, /reuse_status = 'terms-apply'/)
  assert.match(correction, /excludes uploaded documents, protocols, linked publications, participant-level data/)
  assert.match(correction, /integration_status = 'live'/)
})

test('ingestion and paid briefings require explicit source permission', async () => {
  const [sync, publicBriefing, memberBriefing] = await Promise.all([
    read('supabase/functions/sync-intelligence/index.ts'),
    read('supabase/functions/generate-public-briefing/index.ts'),
    read('supabase/functions/generate-briefings/index.ts'),
  ])
  assert.match(sync, /eq\('automated_ingestion_allowed', true\)/)
  assert.match(sync, /eq\('public_display_allowed', true\)/)
  assert.doesNotMatch(sync, /abstract_text: abstractText/)
  assert.match(publicBriefing, /content_sources!inner\(paid_distribution_allowed\)/)
  assert.match(publicBriefing, /commercial-cleared-sources-only/)
  assert.match(memberBriefing, /content_sources!inner\(paid_distribution_allowed\)/)
  assert.match(memberBriefing, /commercial-cleared-sources-only/)
})

test('visitors see a restrained connection distinction, not internal rights labels', async () => {
  const [template, portal, api] = await Promise.all([
    read('intelligence-template.html'),
    read('intelligence.js'),
    read('supabase/functions/public-intelligence/index.ts'),
  ])
  assert.match(template, /“Live data” means records are indexed here; “Official link” opens the source directly/)
  assert.match(portal, /Live data feed.*Verified official link/s)
  assert.doesNotMatch(portal, /Reuse allowed|Source terms apply/)
  assert.doesNotMatch(api, /rights_basis|paid_distribution_allowed.*return/s)
})
