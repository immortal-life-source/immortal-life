import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assessTopicMatch } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

// One deliberately small source page per invocation keeps CPU and wall-clock
// use predictable on Supabase Edge Functions. The one-minute scheduler and
// persisted cursors provide throughput without risking oversized retries.
const NIH_PAGE_SIZE = 100
const CORDIS_PAGE_SIZE = 50
const NIH_MIN_YEAR = 1985
const NIH_TERMS = [
  'aging', 'ageing', 'longevity', 'healthspan', 'senescence', 'geroscience',
  'frailty', 'rejuvenation', 'biological age', 'older adult',
]
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus',
  CZ: 'Czechia', DK: 'Denmark', EE: 'Estonia', FI: 'Finland', FR: 'France',
  DE: 'Germany', GR: 'Greece', HU: 'Hungary', IE: 'Ireland', IT: 'Italy',
  LV: 'Latvia', LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia',
  ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', NO: 'Norway', IL: 'Israel',
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isoDate(value: unknown): string | null {
  const match = clean(value, 40).match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? null
}

function amount(value: unknown): number | null {
  const result = Number(value)
  return Number.isFinite(result) && result >= 0 ? result : null
}

function constantTimeMatch(left: string, right: string): boolean {
  if (!right || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

async function authorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied))
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

function topicLinks(grantId: string, title: string, controlledTerms: string[], topics: any[], sourceId: string) {
  return topics.flatMap((topic) => {
    const assessment = assessTopicMatch(topic.slug, {
      title, controlledTerms, sourceId, sourceDate: null,
    }, {
      matching_terms: Array.isArray(topic.matching_terms) ? topic.matching_terms : [],
      requires_ageing_context: Boolean(topic.requires_ageing_context),
    })
    return assessment.publish ? [{
      source_grant_id: grantId,
      topic_slug: topic.slug,
      relevance_score: assessment.relevanceScore,
      match_explanation: assessment.explanation,
    }] : []
  })
}

async function postNih(cursor: any): Promise<any> {
  const fiscalYear = Number(cursor?.fiscal_year) || new Date().getUTCFullYear()
  const termIndex = Math.max(0, Math.min(NIH_TERMS.length - 1, Number(cursor?.term_index) || 0))
  const offset = Math.max(0, Number(cursor?.offset) || 0)
  const response = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'immortal.life-direct-grants/1.0 (research@immortal.life)' },
    body: JSON.stringify({
      criteria: {
        fiscal_years: [fiscalYear],
        advanced_text_search: { operator: 'and', search_field: 'projecttitle,terms', search_text: NIH_TERMS[termIndex] },
      },
      include_fields: [
        'ApplId', 'FiscalYear', 'ProjectNum', 'CoreProjectNum', 'ProjectTitle',
        'Organization', 'AwardAmount', 'AgencyIcFundings', 'AgencyIcAdmin',
        'ProjectStartDate', 'ProjectEndDate', 'AwardNoticeDate', 'FundingMechanism',
        'OpportunityNumber', 'PrefTerms', 'ProjectDetailUrl', 'DateAdded',
      ],
      offset, limit: NIH_PAGE_SIZE, sort_field: 'project_start_date', sort_order: 'desc',
    }),
    signal: AbortSignal.timeout(28_000),
  })
  if (!response.ok) throw new Error(`nih_reporter_${response.status}`)
  return await response.json()
}

async function syncNih(supabase: any, state: any, topics: any[]) {
  const cursor = state.cursor ?? {}
  const fiscalYear = Number(cursor.fiscal_year) || new Date().getUTCFullYear()
  const termIndex = Math.max(0, Number(cursor.term_index) || 0)
  const offset = Math.max(0, Number(cursor.offset) || 0)
  const payload = await postNih({ fiscal_year: fiscalYear, term_index: termIndex, offset })
  const results = Array.isArray(payload?.results) ? payload.results : []
  const grants: any[] = []
  const links: any[] = []
  for (const record of results) {
    const id = clean(record?.appl_id, 80)
    const title = clean(record?.project_title, 600)
    if (!id || !title) continue
    const matched = topicLinks(id, title, clean(record?.pref_terms, 20_000).split(';').filter(Boolean), topics, 'nih-reporter')
    if (!matched.length) continue
    const funder = record?.agency_ic_fundings?.[0]?.name || record?.agency_ic_admin?.name || 'National Institutes of Health'
    const countryCode = clean(record?.organization?.org_fips, 2).toUpperCase()
    grants.push({
      source_grant_id: id,
      grant_number: clean(record?.project_num || record?.core_project_num, 120) || null,
      title,
      funder_name: clean(funder, 300),
      recipient_name: clean(record?.organization?.org_name, 300) || null,
      recipient_country_code: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      recipient_country_name: clean(record?.organization?.org_country, 160) || COUNTRY_NAMES[countryCode] || null,
      programme: clean(record?.funding_mechanism || record?.opportunity_number, 240) || null,
      status: isoDate(record?.project_end_date) && String(record.project_end_date).slice(0, 10) < new Date().toISOString().slice(0, 10) ? 'completed' : 'active',
      fiscal_year: Number(record?.fiscal_year) || null,
      start_date: isoDate(record?.project_start_date),
      end_date: isoDate(record?.project_end_date),
      awarded_amount: amount(record?.award_amount),
      currency: 'USD',
      source_url: /^https:\/\//.test(clean(record?.project_detail_url, 500)) ? clean(record.project_detail_url, 500) : `https://reporter.nih.gov/project-details/${encodeURIComponent(id)}`,
      source_updated_at: clean(record?.date_added, 40) || clean(record?.award_notice_date, 40) || null,
    })
    links.push(...matched)
  }
  if (grants.length) {
    const result = await supabase.rpc('upsert_direct_grant_page', { p_source_id: 'nih-reporter', p_grants: grants, p_topic_links: links })
    if (result.error) throw result.error
  }

  const total = Number(payload?.meta?.total ?? 0)
  let next = { fiscal_year: fiscalYear, term_index: termIndex, offset: offset + results.length }
  let completedCycle = false
  if (!results.length || next.offset >= total || next.offset >= 14_999) {
    next = { fiscal_year: fiscalYear, term_index: termIndex + 1, offset: 0 }
    if (next.term_index >= NIH_TERMS.length) next = { fiscal_year: fiscalYear - 1, term_index: 0, offset: 0 }
    if (next.fiscal_year < NIH_MIN_YEAR) {
      next = { fiscal_year: new Date().getUTCFullYear(), term_index: 0, offset: 0 }
      completedCycle = true
    }
  }
  return { scanned: results.length, retained: grants.length, next, completedCycle }
}

function sparqlValue(binding: any, key: string): string { return clean(binding?.[key]?.value, key === 'keywords' ? 20_000 : 1000) }

async function fetchCordis(offset: number): Promise<any[]> {
  const query = `PREFIX eurio: <http://data.europa.eu/s66#>
SELECT ?project ?id ?title ?start ?end ?status ?amount ?recipient ?country
       (GROUP_CONCAT(DISTINCT ?keyword;separator="; ") AS ?keywords)
WHERE {
  ?project a eurio:Project ; eurio:identifier ?id ; eurio:title ?title .
  OPTIONAL { ?project eurio:startDate ?start }
  OPTIONAL { ?project eurio:endDate ?end }
  OPTIONAL { ?project eurio:projectStatus ?status }
  OPTIONAL { ?project eurio:keyword ?keyword }
  OPTIONAL { ?project eurio:isFundedBy ?grant . ?grant eurio:hasFundingAmount ?money . ?money eurio:value ?amount }
  OPTIONAL { ?project eurio:hasInvolvedParty ?role . ?role eurio:roleLabel "coordinator" ; eurio:isRoleOf ?org . ?org eurio:legalName ?recipient . OPTIONAL { ?org eurio:hasSite ?site . ?site eurio:hasAddress ?address . ?address eurio:addressCountry ?country } }
} GROUP BY ?project ?id ?title ?start ?end ?status ?amount ?recipient ?country
ORDER BY ?id LIMIT ${CORDIS_PAGE_SIZE} OFFSET ${Math.max(0, offset)}`
  const url = new URL('https://cordis.europa.eu/datalab/sparql')
  url.searchParams.set('query', query)
  url.searchParams.set('format', 'application/sparql-results+json')
  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'immortal.life-direct-grants/1.0 (research@immortal.life)' },
    signal: AbortSignal.timeout(28_000),
  })
  if (!response.ok) throw new Error(`cordis_sparql_${response.status}`)
  return (await response.json())?.results?.bindings ?? []
}

async function syncCordis(supabase: any, state: any, topics: any[]) {
  const offset = Math.max(0, Number(state?.cursor?.offset) || 0)
  const bindings = await fetchCordis(offset)
  const grants: any[] = []
  const links: any[] = []
  for (const row of bindings) {
    const id = sparqlValue(row, 'id')
    const title = sparqlValue(row, 'title')
    if (!id || !title) continue
    const matched = topicLinks(id, title, sparqlValue(row, 'keywords').split(';').filter(Boolean), topics, 'cordis')
    if (!matched.length) continue
    const countryCode = sparqlValue(row, 'country').toUpperCase()
    grants.push({
      source_grant_id: id, grant_number: id, title,
      funder_name: 'European Union', recipient_name: sparqlValue(row, 'recipient') || null,
      recipient_country_code: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      recipient_country_name: COUNTRY_NAMES[countryCode] || null,
      programme: 'EU research and innovation framework programmes',
      status: sparqlValue(row, 'status').toLowerCase() || null,
      fiscal_year: Number(sparqlValue(row, 'start').slice(0, 4)) || null,
      start_date: isoDate(sparqlValue(row, 'start')), end_date: isoDate(sparqlValue(row, 'end')),
      awarded_amount: amount(sparqlValue(row, 'amount')), currency: 'EUR',
      source_url: `https://cordis.europa.eu/project/id/${encodeURIComponent(id)}`,
      source_updated_at: null,
    })
    links.push(...matched)
  }
  if (grants.length) {
    const result = await supabase.rpc('upsert_direct_grant_page', { p_source_id: 'cordis', p_grants: grants, p_topic_links: links })
    if (result.error) throw result.error
  }
  const completedCycle = bindings.length < CORDIS_PAGE_SIZE
  return { scanned: bindings.length, retained: grants.length, next: { offset: completedCycle ? 0 : offset + bindings.length }, completedCycle }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const body = await req.clone().json().catch(() => ({}))
  if (body?.trigger === 'schedule' && Deno.env.get('SCHEDULED_INGESTION_PAUSED') === 'true') {
    return jsonResponse(req, { ok: true, status: 'maintenance_pause' }, 202, 'POST')
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
    const started = Date.now()
  let sourceId = clean(body?.source, 40)
  try {
    const rights = await supabase.from('content_sources').select('id').in('id', ['nih-reporter', 'cordis'])
      .eq('enabled', true).eq('automated_ingestion_allowed', true).eq('public_display_allowed', true)
    if (rights.error) throw rights.error
    const allowed = new Set((rights.data ?? []).map((row: any) => row.id))
    if (sourceId && !allowed.has(sourceId)) throw new Error('source_not_approved')
    if (!sourceId) {
      const states = await supabase.from('funding_grant_sync_state').select('*').in('source_id', [...allowed]).order('updated_at').limit(1)
      if (states.error) throw states.error
      sourceId = states.data?.[0]?.source_id ?? ''
    }
    if (!sourceId) throw new Error('no_approved_grant_source')
    const [stateResult, topicResult] = await Promise.all([
      supabase.from('funding_grant_sync_state').select('*').eq('source_id', sourceId).single(),
      supabase.from('intelligence_topics').select('slug,name,matching_terms,requires_ageing_context').eq('enabled', true).order('sort_order'),
    ])
    if (stateResult.error) throw stateResult.error
    if (topicResult.error) throw topicResult.error
    let scanned = 0
    let retained = 0
    let completedCycles = Number(stateResult.data?.completed_cycles ?? 0)
    let cursor = stateResult.data?.cursor ?? {}
    let completedAt: string | null = null
    const page = sourceId === 'nih-reporter'
      ? await syncNih(supabase, { ...stateResult.data, cursor }, topicResult.data ?? [])
      : await syncCordis(supabase, { ...stateResult.data, cursor }, topicResult.data ?? [])
    scanned = page.scanned
    retained = page.retained
    cursor = page.next
    if (page.completedCycle) { completedCycles += 1; completedAt = new Date().toISOString() }

    const now = new Date().toISOString()
    const update = await supabase.from('funding_grant_sync_state').update({
      cursor, records_scanned: Number(stateResult.data?.records_scanned ?? 0) + scanned,
      grants_retained: Number(stateResult.data?.grants_retained ?? 0) + retained,
      completed_cycles: completedCycles, last_completed_at: completedAt ?? stateResult.data?.last_completed_at,
      last_success_at: now, last_error: null, updated_at: now,
    }).eq('source_id', sourceId)
    if (update.error) throw update.error
    await supabase.from('content_sources').update({ last_attempt_at: now, last_success_at: now, last_error: null, consecutive_failures: 0, updated_at: now }).eq('id', sourceId)
    return jsonResponse(req, { ok: true, source: sourceId, scanned, retained, cursor, completed_cycles: completedCycles, runtime_ms: Date.now() - started }, 200, 'POST')
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : String(error), 500) || 'direct_grant_sync_failed'
    const now = new Date().toISOString()
    if (sourceId) {
      const current = await supabase.from('content_sources').select('consecutive_failures').eq('id', sourceId).maybeSingle()
      await Promise.all([
        supabase.from('funding_grant_sync_state').update({ last_error: message, updated_at: now }).eq('source_id', sourceId),
        supabase.from('content_sources').update({ last_attempt_at: now, last_error: message, consecutive_failures: Number(current.data?.consecutive_failures ?? 0) + 1, updated_at: now }).eq('id', sourceId),
      ])
    }
    console.error('sync-direct-grants', sourceId, message)
    return jsonResponse(req, { error: 'direct_grant_sync_failed', source: sourceId || null }, 500, 'POST')
  }
})
