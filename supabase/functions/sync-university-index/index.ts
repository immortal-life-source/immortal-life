import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SOURCE_ID = 'openalex'
const METHOD_VERSION = 'university-index-2026-09-v1'
const FIVE_YEAR_START = '2022-01-01'
const TWO_YEAR_START = '2025-01-01'
const OPENALEX = 'https://api.openalex.org'
const OPENALEX_MIN_INTERVAL_MS = 450
let openAlexGate = Promise.resolve()
let lastOpenAlexRequestAt = 0

const CONTINENT_CODES: Record<string, string> = {
  Africa: 'DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
  Asia: 'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE HK MO',
  Europe: 'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR VA HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB XK',
  'North America': 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US GL BM PM',
  'South America': 'AR BO BR CL CO EC GY PY PE SR UY VE FK GF',
  Oceania: 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC PF GU AS MP CK NU TK WF',
  Antarctica: 'AQ',
}
const COUNTRY_CONTINENT = new Map(Object.entries(CONTINENT_CODES).flatMap(([continent, codes]) => codes.split(' ').map((code) => [code, continent])))

const TOPIC_QUERIES: Record<string, string> = {
  rapamycin: '(rapamycin OR sirolimus OR everolimus OR rapalog) AND (aging OR ageing OR longevity OR healthspan)',
  senolytics: '(senolytic OR senomorphic OR "cellular senescence" OR "senescent cell") AND (aging OR ageing OR longevity)',
  'partial-reprogramming': '("partial reprogramming" OR "epigenetic reprogramming" OR "Yamanaka factors" OR OSKM) AND (aging OR ageing OR rejuvenation)',
  metformin: 'metformin AND (aging OR ageing OR longevity OR healthspan)',
  'glp-1-therapies': '("GLP-1" OR semaglutide OR tirzepatide OR liraglutide) AND (aging OR ageing OR longevity OR healthspan OR frailty)',
  exercise: '(exercise OR "physical activity" OR "cardiorespiratory fitness") AND (aging OR ageing OR longevity OR healthspan OR frailty)',
  'caloric-restriction': '("caloric restriction" OR "calorie restriction" OR "intermittent fasting" OR "time-restricted eating") AND (aging OR ageing OR longevity OR healthspan)',
  sleep: '(sleep OR circadian) AND (aging OR ageing OR longevity OR healthspan OR frailty)',
  'epigenetic-clocks': '("epigenetic clock" OR "DNA methylation age" OR "biological age clock" OR PhenoAge OR GrimAge)',
  'plasma-exchange': '("plasma exchange" OR plasmapheresis OR "plasma dilution") AND (aging OR ageing OR rejuvenation OR longevity)',
  'stem-cells': '("stem cell" OR "progenitor cell") AND (aging OR ageing OR longevity OR rejuvenation OR frailty)',
  'gene-therapy': '("gene therapy" OR "gene transfer" OR "genome editing" OR CRISPR) AND (aging OR ageing OR longevity OR rejuvenation)',
}

type Group = { key?: string; key_display_name?: string; count?: number }
type TopicSnapshot = {
  slug: string
  query: string
  fiveYear: Map<string, number>
  twoYear: Map<string, number>
  samples: Map<string, Array<Record<string, unknown>>>
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function openAlexId(value: unknown): string {
  const match = clean(value, 80).match(/(?:^|\/)(I\d+)$/)
  return match?.[1] ?? ''
}

function slugify(name: unknown, id: string): string {
  const base = clean(name, 180).toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 88)
  return `${base || 'university'}-${id.toLowerCase()}`
}

function continentForCountry(code: unknown): string | null {
  return COUNTRY_CONTINENT.get(clean(code, 2).toUpperCase()) ?? null
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
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const apiKey = Deno.env.get('OPENALEX_API_KEY')?.trim()
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'immortal.life-university-index/1.0 (research@immortal.life)' }
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

function groupMap(groups: Group[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const group of groups ?? []) {
    const id = openAlexId(group.key)
    const count = Math.max(0, Math.trunc(Number(group.count ?? 0)))
    if (id && count) result.set(id, count)
  }
  return result
}

function workLink(work: any): string {
  const doi = clean(work?.doi, 300)
  if (doi.startsWith('https://doi.org/')) return doi
  const id = clean(work?.id, 120)
  return /^https:\/\/openalex\.org\/W\d+$/.test(id) ? id : 'https://openalex.org/'
}

async function topicSnapshot(slug: string, query: string): Promise<TopicSnapshot> {
  const common = { search: query, group_by: 'authorships.institutions.id', per_page: '200' }
  const [five, two, works] = await Promise.all([
    openAlex('/works', { ...common, filter: `from_publication_date:${FIVE_YEAR_START}` }),
    openAlex('/works', { ...common, filter: `from_publication_date:${TWO_YEAR_START}` }),
    openAlex('/works', {
      search: query,
      filter: `from_publication_date:${FIVE_YEAR_START}`,
      sort: 'cited_by_count:desc',
      per_page: '75',
      select: 'id,title,publication_year,publication_date,cited_by_count,doi,open_access,authorships,primary_location',
    }),
  ])
  const samples = new Map<string, Array<Record<string, unknown>>>()
  for (const work of works?.results ?? []) {
    const institutionIds = new Set<string>()
    for (const authorship of work?.authorships ?? []) for (const institution of authorship?.institutions ?? []) {
      const id = openAlexId(institution?.id)
      if (id) institutionIds.add(id)
    }
    const sample = {
      title: clean(work?.title, 500),
      publication_year: Number(work?.publication_year ?? 0) || null,
      publication_date: clean(work?.publication_date, 10) || null,
      cited_by_count: Math.max(0, Math.trunc(Number(work?.cited_by_count ?? 0))),
      is_open_access: Boolean(work?.open_access?.is_oa),
      doi: clean(work?.doi, 300) || null,
      source_url: workLink(work),
      source_name: clean(work?.primary_location?.source?.display_name, 200) || null,
    }
    if (!sample.title) continue
    for (const id of institutionIds) {
      const list = samples.get(id) ?? []
      if (list.length < 5) list.push(sample)
      samples.set(id, list)
    }
  }
  return { slug, query, fiveYear: groupMap(five?.group_by ?? []), twoYear: groupMap(two?.group_by ?? []), samples }
}

async function batches<T, R>(values: T[], size: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const output: R[] = []
  for (let index = 0; index < values.length; index += size) output.push(...await fn(values.slice(index, index + size)))
  return output
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  const startedAt = new Date().toISOString()
  await supabase.from('content_sources').update({ last_attempt_at: startedAt, updated_at: startedAt }).eq('id', SOURCE_ID)
  try {
    const { data: topics, error: topicsError } = await supabase.from('intelligence_topics').select('slug').eq('enabled', true).order('sort_order')
    if (topicsError) throw topicsError
    const configured = (topics ?? []).map((topic: any) => ({ slug: String(topic.slug), query: TOPIC_QUERIES[String(topic.slug)] })).filter((topic: any) => topic.query)
    const snapshots = await batches(configured, 3, async (batch) => await Promise.all(batch.map((topic) => topicSnapshot(topic.slug, topic.query))))
    const candidateIds = [...new Set(snapshots.flatMap((snapshot) => [...snapshot.fiveYear.keys()]))]
    const institutions = await batches(candidateIds, 80, async (batch) => {
      if (!batch.length) return []
      const payload = await openAlex('/institutions', {
        filter: `openalex:${batch.join('|')}`,
        per_page: '100',
        select: 'id,display_name,ror,country_code,type,homepage_url,geo,summary_stats,works_count,cited_by_count,is_super_system,updated_date',
      })
      return payload?.results ?? []
    })
    const now = new Date().toISOString()
    const eligibleInstitutions = institutions.filter((item: any) => item?.type === 'education' && !item?.is_super_system && openAlexId(item?.id) && clean(item?.display_name))
    const institutionRows = eligibleInstitutions.map((item: any) => {
      const id = openAlexId(item.id)
      return {
        openalex_id: id,
        slug: slugify(item.display_name, id),
        name: clean(item.display_name, 300),
        ror_id: clean(item.ror, 160) || null,
        country_code: /^[A-Za-z]{2}$/.test(clean(item.country_code, 2)) ? clean(item.country_code, 2).toUpperCase() : null,
        country_name: clean(item.geo?.country, 160) || null,
        continent: continentForCountry(item.country_code),
        region: clean(item.geo?.region, 160) || null,
        city: clean(item.geo?.city, 160) || null,
        latitude: Number.isFinite(Number(item.geo?.latitude)) ? Number(item.geo.latitude) : null,
        longitude: Number.isFinite(Number(item.geo?.longitude)) ? Number(item.geo.longitude) : null,
        homepage_url: /^https:\/\//.test(clean(item.homepage_url, 500)) ? clean(item.homepage_url, 500) : null,
        openalex_url: `https://openalex.org/${id}`,
        institution_type: 'education',
        global_works_count: Math.max(0, Math.trunc(Number(item.works_count ?? 0))),
        global_cited_by_count: Math.max(0, Math.trunc(Number(item.cited_by_count ?? 0))),
        global_h_index: Math.max(0, Math.trunc(Number(item.summary_stats?.h_index ?? 0))),
        global_two_year_mean_citedness: Number.isFinite(Number(item.summary_stats?.['2yr_mean_citedness'])) ? Number(item.summary_stats['2yr_mean_citedness']) : null,
        ranking_method_version: METHOD_VERSION,
        source_updated_at: item.updated_date || null,
        last_seen_at: now,
        metadata: { source: 'OpenAlex', affiliation_registry: 'ROR', coverage_window_start: FIVE_YEAR_START },
      }
    })
    if (!institutionRows.length) throw new Error('no_eligible_universities')
    const allowed = new Set(institutionRows.map((row) => row.openalex_id))
    const topicRows = snapshots.flatMap((snapshot) => [...snapshot.fiveYear.entries()].filter(([id]) => allowed.has(id)).map(([id, works]) => {
      const samples = snapshot.samples.get(id) ?? []
      return {
        openalex_id: id,
        topic_slug: snapshot.slug,
        works_five_year: works,
        works_two_year: snapshot.twoYear.get(id) ?? 0,
        representative_work_count: samples.length,
        representative_citations: samples.reduce((sum, work) => sum + Number(work.cited_by_count ?? 0), 0),
        representative_open_access_count: samples.filter((work) => work.is_open_access).length,
        representative_works: samples,
        source_query: snapshot.query,
        last_synced_at: now,
      }
    }))
    const { error: institutionsError } = await supabase.from('university_research_institutions').upsert(institutionRows, { onConflict: 'openalex_id', defaultToNull: false })
    if (institutionsError) throw institutionsError
    const { error: clearError } = await supabase.from('university_research_topic_metrics').delete().neq('openalex_id', '__none__')
    if (clearError) throw clearError
    for (let index = 0; index < topicRows.length; index += 500) {
      const { error } = await supabase.from('university_research_topic_metrics').upsert(topicRows.slice(index, index + 500), { onConflict: 'openalex_id,topic_slug' })
      if (error) throw error
    }
    const { error: scoreError } = await supabase.rpc('refresh_university_research_scores')
    if (scoreError) throw scoreError
    await supabase.from('content_sources').update({ last_success_at: now, last_error: null, consecutive_failures: 0, updated_at: now }).eq('id', SOURCE_ID)
    return jsonResponse(req, { ok: true, generated_at: now, topics: snapshots.length, universities: institutionRows.length, university_topic_rows: topicRows.length, method_version: METHOD_VERSION })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'university_index_sync_failed'
    const { data: source } = await supabase.from('content_sources').select('consecutive_failures').eq('id', SOURCE_ID).maybeSingle()
    await supabase.from('content_sources').update({ last_error: message, consecutive_failures: Number(source?.consecutive_failures ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', SOURCE_ID)
    console.error('sync-university-index', message)
    return jsonResponse(req, { error: 'university_index_sync_failed' }, 500, 'POST')
  }
})
