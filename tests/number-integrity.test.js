import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('number drilldowns retain the filters that define their visible totals', async () => {
  const [portal, proxy, hub, publicApi, pages] = await Promise.all([
    read('intelligence.js'),
    read('api/intelligence.js'),
    read('api/hub-page.js'),
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/functions/public-pages/index.ts'),
  ])

  assert.match(portal, /results=posted/)
  assert.match(portal, /published_from=\$\{recentFrom\}&published_to=\$\{recentTo\}/)
  assert.match(portal, /trialPath\(leftTopic, 'active'\)/)
  assert.match(portal, /trialPath\(rightTopic, 'active'\)/)
  assert.match(portal, /\/universities\?topic=\$\{encodeURIComponent\(topicSlug\)\}/)
  assert.match(proxy, /'status', 'phase', 'results', 'evidence', 'access', 'published_from', 'published_to'/)
  assert.match(hub, /'status', 'phase', 'results', 'evidence', 'access', 'published_from', 'published_to'/)
  assert.match(publicApi, /if \(results === 'posted'\) query = query\.eq\('metadata->>source_has_results', 'true'\)/)
  assert.match(publicApi, /query\.in\('overall_status', \['Recruiting', 'Not Yet Recruiting', 'Enrolling By Invitation', 'Active Not Recruiting'\]\)/)
  assert.match(pages, /Number\(trialsResult\.count \?\? trials\.length\)/)
  assert.match(pages, /\['Recruiting', 'Not Yet Recruiting', 'Enrolling By Invitation', 'Active Not Recruiting'\]/)
  assert.match(pages, /href="\/trials\?status=active"/)
})

test('every visible exact count either opens its exact cohort or is deliberately static', async () => {
  const [portal, styles, publicApi, pages] = await Promise.all([
    read('intelligence.js'),
    read('intelligence.css'),
    read('supabase/functions/public-intelligence/index.ts'),
    read('supabase/functions/public-pages/index.ts'),
  ])

  assert.match(pages, /const countQuery = \(recordType: string\) => `\/changes\?kind=\$\{encodeURIComponent\(recordType\)\}`/)
  assert.match(publicApi, /\.select\(institutionFields, \{ count: filteredDirectory \? 'exact' : 'planned' \}\)/)
  assert.match(publicApi, /university_research_institutions!inner\(\$\{institutionFields\}\)`, \{ count: 'exact' \}/)
  assert.match(portal, /renderUniversityRegions\(visible, universityCoverage\)/)
  assert.match(portal, /topic-funding-stat topic-funding-stat--static/)
  assert.match(portal, /topic-funding-chip topic-funding-chip--static/)
  assert.match(portal, /\[summary\.funders, 'Funders', 'Distinct OpenAlex funder identities', ''\]/)
  assert.match(portal, /\/funding\?funder=\$\{encodeURIComponent\(item\.funder_id\)\}/)
  assert.match(portal, /region === 'Region unavailable' \? 'unavailable' : region/)
  assert.match(portal, /coverage\.unavailable_region_universities/)
  assert.match(publicApi, /continent === 'unavailable'/)
  assert.match(publicApi, /unavailable_region_universities: Number\(missingContinentResult\.count \?\? 0\)/)
  assert.match(styles, /\.topic-funding-stat--static/)
  assert.doesNotMatch(portal, /location\.assign\('\/universities'\)/)
  assert.doesNotMatch(portal, /location\.assign\('\/topics'\)/)
})

test('dated research cohorts fail closed rather than widening to unrelated records', async () => {
  const [portal, proxy] = await Promise.all([read('intelligence.js'), read('api/intelligence.js')])
  assert.match(portal, /params\.published_from \|\| params\.published_to/)
  assert.match(proxy, /query\.published_from \|\| query\.published_to/)
  assert.match(proxy, /if \(view === 'research' && \(query\.evidence \|\| query\.access \|\| query\.published_from \|\| query\.published_to\)\) return null/)
})
