import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assessTopicMatch, classifyEvidence, duplicateClusterKey, researchEditorialSummary } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SOURCE_ID = 'openalex'
const METHOD_VERSION = 'university-index-complete-2026-09-v2'
const OPENALEX = 'https://api.openalex.org'
const OPENALEX_MIN_INTERVAL_MS = 450
const OPENALEX_PAGE_SIZE = 200
const RUN_TIME_BUDGET_MS = 105_000
let openAlexGate = Promise.resolve()
let lastOpenAlexRequestAt = 0

const CONTINENT_CODES: Record<string, string> = {
  Africa: 'DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
  Asia: 'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE HK MO',
  Europe: 'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR VA HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB XK',
  'North America': 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US GL BM PM',
  'South America': 'AR BO BR CL CO EC GY PY PE SR UY VE FK GF',
  Oceania: 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC PF GU AS MP CK NU TK WF',
  Antarctica: 'AQ',
}
const COUNTRY_CONTINENT = new Map(Object.entries(CONTINENT_CODES).flatMap(([continent, codes]) => codes.split(' ').map((code) => [code, continent])))

type SyncState = { topic_slug: string; phase: 'all' | 'five' | 'two' | 'works' | 'complete'; cursor: string; pages_processed: number; records_processed: number }

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function openAlexId(value: unknown, prefix = 'I'): string {
  const match = clean(value, 100).match(new RegExp(`(?:^|/)(${prefix}\\d+)$`))
  return match?.[1] ?? ''
}

function slugify(name: unknown, id: string): string {
  const base = clean(name, 180).toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 88)
  return `${base || 'university'}-${id.toLowerCase()}`
}

function continentForCountry(code: unknown): string | null { return COUNTRY_CONTINENT.get(clean(code, 2).toUpperCase()) ?? null }
function yearsAgo(years: number): string { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - years); return date.toISOString().slice(0, 10) }
function openAlexSearchQuery(value: unknown): string { return clean(value, 1200).replace(/\*/g, '').replace(/\s+/g, ' ').trim() }

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

async function paceOpenAlex(): Promise<void> {
  const turn = openAlexGate.then(async () => {
    const wait = Math.max(0, OPENALEX_MIN_INTERVAL_MS - (Date.now() - lastOpenAlexRequestAt))
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    lastOpenAlexRequestAt = Date.now()
  })
  openAlexGate = turn.catch(() => undefined)
  await turn
}

async function openAlex(path: string, params: Record<string, string>, attempts = 5): Promise<any> {
  const url = new URL(path, OPENALEX)
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
  const apiKey = Deno.env.get('OPENALEX_API_KEY')?.trim()
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'immortal.life-university-index/2.0 (research@immortal.life)' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await paceOpenAlex()
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) })
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Math.max(1, Math.min(20, Number(response.headers.get('retry-after') ?? 2)))
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 * (attempt + 1)))
        }
        throw new Error(`openalex_${response.status}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('openalex_request_failed')
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  throw lastError ?? new Error('openalex_request_failed')
}

async function batches<T>(values: T[], size: number, fn: (batch: T[]) => Promise<void>): Promise<void> {
  for (let index = 0; index < values.length; index += size) await fn(values.slice(index, index + size))
}

async function upsertInstitutions(supabase: any, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const eligible = new Set<string>()
  await batches(unique, 80, async (batch) => {
    if (!batch.length) return
    const payload = await openAlex('/institutions', {
      filter: `openalex:${batch.join('|')}`, per_page: '100',
      select: 'id,display_name,ror,country_code,type,homepage_url,geo,summary_stats,works_count,cited_by_count,is_super_system,updated_date',
    })
    const rows = (payload?.results ?? []).filter((item: any) => item?.type === 'education' && !item?.is_super_system && openAlexId(item?.id) && clean(item?.display_name)).map((item: any) => {
      const id = openAlexId(item.id); eligible.add(id)
      return {
        openalex_id: id, slug: slugify(item.display_name, id), name: clean(item.display_name, 300), ror_id: clean(item.ror, 160) || null,
        country_code: /^[A-Za-z]{2}$/.test(clean(item.country_code, 2)) ? clean(item.country_code, 2).toUpperCase() : null,
        country_name: clean(item.geo?.country, 160) || null, continent: continentForCountry(item.country_code), region: clean(item.geo?.region, 160) || null,
        city: clean(item.geo?.city, 160) || null, latitude: Number.isFinite(Number(item.geo?.latitude)) ? Number(item.geo.latitude) : null,
        longitude: Number.isFinite(Number(item.geo?.longitude)) ? Number(item.geo.longitude) : null,
        homepage_url: /^https:\/\//.test(clean(item.homepage_url, 500)) ? clean(item.homepage_url, 500) : null,
        openalex_url: `https://openalex.org/${id}`, institution_type: 'education', global_works_count: Math.max(0, Math.trunc(Number(item.works_count ?? 0))),
        global_cited_by_count: Math.max(0, Math.trunc(Number(item.cited_by_count ?? 0))), global_h_index: Math.max(0, Math.trunc(Number(item.summary_stats?.h_index ?? 0))),
        global_two_year_mean_citedness: Number.isFinite(Number(item.summary_stats?.['2yr_mean_citedness'])) ? Number(item.summary_stats['2yr_mean_citedness']) : null,
        ranking_method_version: METHOD_VERSION, source_updated_at: item.updated_date || null, last_seen_at: new Date().toISOString(),
        metadata: { source: 'OpenAlex', affiliation_registry: item.ror ? 'ROR' : null, full_history: true },
      }
    })
    if (rows.length) { const { error } = await supabase.from('university_research_institutions').upsert(rows, { onConflict: 'openalex_id', defaultToNull: false }); if (error) throw error }
  })
  return eligible
}

function nextCursor(payload: any, current: string): string | null {
  const next = clean(payload?.meta?.next_cursor ?? payload?.meta?.nextCursor, 4000)
  return next && next !== current ? next : null
}

async function processGroupPage(supabase: any, topic: any, state: SyncState): Promise<{ next: string | null; count: number }> {
  const filter = state.phase === 'five' ? `from_publication_date:${yearsAgo(5)}` : state.phase === 'two' ? `from_publication_date:${yearsAgo(2)}` : ''
  const payload = await openAlex('/works', { search: openAlexSearchQuery(topic.literature_query), filter, group_by: 'authorships.institutions.id', per_page: String(OPENALEX_PAGE_SIZE), cursor: state.cursor || '*' })
  const groups = Array.isArray(payload?.group_by) ? payload.group_by : []
  const allowed = await upsertInstitutions(supabase, groups.map((group: any) => openAlexId(group.key)).filter(Boolean))
  const field = state.phase === 'all' ? 'works_all_time' : state.phase === 'five' ? 'works_five_year' : 'works_two_year'
  const rows = groups.map((group: any) => ({ id: openAlexId(group.key), count: Math.max(0, Math.trunc(Number(group.count ?? 0))) }))
    .filter((group: any) => allowed.has(group.id) && group.count > 0)
    .map((group: any) => ({ openalex_id: group.id, topic_slug: topic.slug, [field]: group.count, source_query: topic.literature_query, last_synced_at: new Date().toISOString() }))
  if (rows.length) { const { error } = await supabase.from('university_research_topic_metrics').upsert(rows, { onConflict: 'openalex_id,topic_slug', defaultToNull: false }); if (error) throw error }
  return { next: nextCursor(payload, state.cursor), count: groups.length }
}

function workLink(work: any): string {
  const doi = clean(work?.doi, 300); if (doi.startsWith('https://doi.org/')) return doi
  const id = openAlexId(work?.id, 'W'); return id ? `https://openalex.org/${id}` : 'https://openalex.org/'
}

function abstractFromInvertedIndex(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const positioned: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) if (Number.isSafeInteger(Number(position))) positioned.push([Number(position), word])
  }
  return clean(positioned.sort((left, right) => left[0] - right[0]).map((entry) => entry[1]).join(' '), 12_000) || null
}

async function processWorksPage(supabase: any, topic: any, state: SyncState): Promise<{ next: string | null; count: number }> {
  const payload = await openAlex('/works', { search: openAlexSearchQuery(topic.literature_query), per_page: String(OPENALEX_PAGE_SIZE), cursor: state.cursor || '*', select: 'id,title,publication_year,publication_date,cited_by_count,doi,open_access,authorships,primary_location,abstract_inverted_index,type,keywords,topics,updated_date' })
  const works = Array.isArray(payload?.results) ? payload.results : []
  const institutionIds = [...new Set(works.flatMap((work: any) => (work?.authorships ?? []).flatMap((authorship: any) => (authorship?.institutions ?? []).map((institution: any) => openAlexId(institution?.id))).filter(Boolean)))] as string[]
  const allowed = await upsertInstitutions(supabase, institutionIds)
  const workRows = works.map((work: any) => ({ openalex_work_id: openAlexId(work?.id, 'W'), title: clean(work?.title, 500), publication_year: Number(work?.publication_year ?? 0) || null,
    publication_date: clean(work?.publication_date, 10) || null, cited_by_count: Math.max(0, Math.trunc(Number(work?.cited_by_count ?? 0))), is_open_access: Boolean(work?.open_access?.is_oa),
    doi: clean(work?.doi, 300) || null, source_url: workLink(work), source_name: clean(work?.primary_location?.source?.display_name, 200) || null, updated_at: new Date().toISOString() })).filter((work: any) => work.openalex_work_id && work.title)
  if (workRows.length) {
    let result = await supabase.from('university_research_works').upsert(workRows, { onConflict: 'openalex_work_id', defaultToNull: false }); if (result.error) throw result.error
    result = await supabase.from('university_research_work_topics').upsert(workRows.map((work: any) => ({ openalex_work_id: work.openalex_work_id, topic_slug: topic.slug })), { onConflict: 'openalex_work_id,topic_slug', ignoreDuplicates: true }); if (result.error) throw result.error
    const knownWorks = new Set(workRows.map((work: any) => work.openalex_work_id))
    const links = works.flatMap((work: any) => {
      const workId = openAlexId(work?.id, 'W'); if (!knownWorks.has(workId)) return []
      const ids = new Set<string>(); for (const authorship of work?.authorships ?? []) for (const institution of authorship?.institutions ?? []) { const id = openAlexId(institution?.id); if (allowed.has(id)) ids.add(id) }
      return [...ids].map((openalex_id) => ({ openalex_work_id: workId, openalex_id }))
    })
    if (links.length) { const linkResult = await supabase.from('university_research_work_institutions').upsert(links, { onConflict: 'openalex_work_id,openalex_id', ignoreDuplicates: true }); if (linkResult.error) throw linkResult.error }

    // OpenAlex expands the public research corpus beyond the biomedical-only
    // sources while reusing the same relevance quarantine and deduplication
    // contracts as PubMed and Europe PMC.
    const now = new Date().toISOString()
    const assessments = new Map<string, ReturnType<typeof assessTopicMatch>>()
    const researchRows = works.map((work: any) => {
      const externalId = openAlexId(work?.id, 'W')
      const title = clean(work?.title, 500)
      if (!externalId || !title) return null
      const controlledTerms = [...new Set([...(work?.topics ?? []), ...(work?.keywords ?? [])].map((item: any) => clean(item?.display_name, 180)).filter(Boolean))]
      const publicationType = clean(work?.type, 120).replace(/_/g, ' ') || null
      const journal = clean(work?.primary_location?.source?.display_name, 240) || null
      const publishedOn = clean(work?.publication_date, 10) || null
      const assessment = assessTopicMatch(topic.slug, { title, controlledTerms, studyType: publicationType, sourceId: SOURCE_ID, sourceDate: publishedOn }, {
        matching_terms: Array.isArray(topic.matching_terms) ? topic.matching_terms : [],
        requires_ageing_context: topic.requires_ageing_context,
      })
      assessments.set(externalId, assessment)
      const level = classifyEvidence(publicationType, title, SOURCE_ID)
      const doi = clean(work?.doi, 300).replace(/^https:\/\/doi\.org\//i, '') || null
      return {
        source_id: SOURCE_ID, external_id: externalId, title,
        authors: clean((work?.authorships ?? []).map((authorship: any) => authorship?.author?.display_name).filter(Boolean).join(', '), 3000) || null,
        journal, published_on: publishedOn, doi, publication_type: publicationType,
        abstract_text: null, controlled_terms: controlledTerms, evidence_level: level,
        source_url: workLink(work), is_open_access: work?.open_access?.is_oa == null ? null : Boolean(work.open_access.is_oa),
        cited_by_count: Math.max(0, Math.trunc(Number(work?.cited_by_count ?? 0))),
        editorial_summary: researchEditorialSummary(level, journal), source_updated_at: work?.updated_date || now,
        last_seen_at: now, status: 'published', relevance_confidence: assessment.relevanceScore,
        source_quality_score: assessment.sourceQualityScore, freshness_score: assessment.freshnessScore,
        publication_state: assessment.publish ? 'published' : 'quarantined', match_explanation: assessment.explanation,
        quality_checked_at: now, duplicate_cluster_key: duplicateClusterKey(title, doi),
        metadata: { openalex_id: externalId, source: 'OpenAlex complete works API' },
      }
    }).filter(Boolean)
    if (researchRows.length) {
      const imported = await supabase.from('research_items').upsert(researchRows, { onConflict: 'source_id,external_id', defaultToNull: false }).select('id,external_id')
      if (imported.error) throw imported.error
      const topicLinks = (imported.data ?? []).map((record: any) => {
        const assessment = assessments.get(record.external_id)
        return { research_item_id: record.id, topic_slug: topic.slug, matched_by: 'source-query', relevance_score: assessment?.relevanceScore ?? 0, match_reasons: assessment?.reasons ?? [], matched_fields: assessment?.matchedFields ?? [], is_published: Boolean(assessment?.publish), evaluated_at: now }
      })
      if (topicLinks.length) {
        const linked = await supabase.from('research_item_topics').upsert(topicLinks, { onConflict: 'research_item_id,topic_slug', defaultToNull: false }); if (linked.error) throw linked.error
        const quality = await supabase.rpc('refresh_research_quality', { record_ids: topicLinks.map((link: any) => link.research_item_id) }); if (quality.error) throw quality.error
      }
    }
  }
  return { next: nextCursor(payload, state.cursor), count: works.length }
}

async function prepareState(supabase: any): Promise<SyncState | null> {
  const topics = await supabase.from('intelligence_topics').select('slug').eq('enabled', true); if (topics.error) throw topics.error
  if (topics.data?.length) { const seeded = await supabase.from('university_topic_sync_state').upsert(topics.data.map((topic: any) => ({ topic_slug: topic.slug })), { onConflict: 'topic_slug', ignoreDuplicates: true }); if (seeded.error) throw seeded.error }
  let selected = await supabase.from('university_topic_sync_state').select('topic_slug,phase,cursor,pages_processed,records_processed').neq('phase', 'complete').order('updated_at').limit(1).maybeSingle()
  if (selected.error) throw selected.error; if (selected.data) return selected.data as SyncState
  const staleBefore = new Date(Date.now() - 7 * 86400000).toISOString()
  const completed = await supabase.from('university_topic_sync_state').select('topic_slug').eq('phase', 'complete').lt('completed_at', staleBefore).order('completed_at').limit(1).maybeSingle()
  if (completed.error) throw completed.error; if (!completed.data) return null
  // Keep the last complete public snapshot available while its next refresh is
  // assembled. Source upserts are idempotent, so readers never see an empty
  // topic merely because a weekly refresh has begun.
  selected = await supabase.from('university_topic_sync_state').update({ phase: 'all', cursor: '*', pages_processed: 0, records_processed: 0, cycle_started_at: new Date().toISOString(), completed_at: null, last_error: null, updated_at: new Date().toISOString() }).eq('topic_slug', completed.data.topic_slug).select('topic_slug,phase,cursor,pages_processed,records_processed').single()
  if (selected.error) throw selected.error
  return selected.data as SyncState
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  const runStartedAt = Date.now()
  const startedAt = new Date().toISOString(); await supabase.from('content_sources').update({ last_attempt_at: startedAt, updated_at: startedAt }).eq('id', SOURCE_ID)
  let state: SyncState | null = null
  try {
    let pagesProcessed = 0
    let recordsProcessed = 0
    let completedTopics = 0
    while (Date.now() - runStartedAt < RUN_TIME_BUDGET_MS) {
      state = await prepareState(supabase)
      if (!state) break
      const topic = await supabase.from('intelligence_topics').select('slug,literature_query,matching_terms,requires_ageing_context').eq('slug', state.topic_slug).eq('enabled', true).single(); if (topic.error) throw topic.error
      const result = state.phase === 'works' ? await processWorksPage(supabase, topic.data, state) : await processGroupPage(supabase, topic.data, state)
      const phases: Record<string, SyncState['phase']> = { all: 'five', five: 'two', two: 'works', works: 'complete' }
      const finished = !result.next; const nextPhase = finished ? phases[state.phase] : state.phase; const now = new Date().toISOString()
      const update = { phase: nextPhase, cursor: finished ? '*' : result.next, pages_processed: state.pages_processed + 1, records_processed: Number(state.records_processed) + result.count, completed_at: nextPhase === 'complete' ? now : null, last_error: null, updated_at: now }
      const stateResult = await supabase.from('university_topic_sync_state').update(update).eq('topic_slug', state.topic_slug); if (stateResult.error) throw stateResult.error
      pagesProcessed += 1
      recordsProcessed += result.count
      if (nextPhase === 'complete') {
        completedTopics += 1
        const scored = await supabase.rpc('refresh_university_research_scores'); if (scored.error) throw scored.error
      }
      await supabase.from('content_sources').update({ last_success_at: now, last_error: null, consecutive_failures: 0, updated_at: now }).eq('id', SOURCE_ID)
    }
    return jsonResponse(req, { ok: true, pages_processed: pagesProcessed, records_processed: recordsProcessed, completed_topics: completedTopics, runtime_ms: Date.now() - runStartedAt, method_version: METHOD_VERSION })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'university_index_sync_failed'
    if (state) await supabase.from('university_topic_sync_state').update({ last_error: message, updated_at: new Date().toISOString() }).eq('topic_slug', state.topic_slug)
    const source = await supabase.from('content_sources').select('consecutive_failures').eq('id', SOURCE_ID).maybeSingle()
    await supabase.from('content_sources').update({ last_error: message, consecutive_failures: Number(source.data?.consecutive_failures ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', SOURCE_ID)
    console.error('sync-university-index', message)
    return jsonResponse(req, { error: 'university_index_sync_failed' }, 500, 'POST')
  }
})
