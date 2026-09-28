import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const OPENALEX = 'https://api.openalex.org'
const PAGE_SIZE = 100
const RUN_BUDGET_MS = 45_000

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function openAlexId(value: unknown, prefix: 'W' | 'G' | 'F'): string {
  const match = clean(value, 120).match(new RegExp(`(?:^|/)(${prefix}\\d+)$`))
  return match?.[1] ?? ''
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

async function fetchWorks(ids: string[]): Promise<any[]> {
  if (!ids.length) return []
  const url = new URL('/works', OPENALEX)
  url.searchParams.set('filter', `openalex:${ids.join('|')}`)
  url.searchParams.set('per-page', String(ids.length))
  url.searchParams.set('select', 'id,title,publication_date,awards,funders')
  const apiKey = Deno.env.get('OPENALEX_API_KEY')?.trim()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'immortal.life-funding-radar/1.0 (research@immortal.life)',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) })
    if (response.ok) return (await response.json())?.results ?? []
    if (response.status !== 429 || attempt === 3) throw new Error(`openalex_${response.status}`)
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
  return []
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
  let processed = 0
  let linked = 0
  try {
    while (Date.now() - started < RUN_BUDGET_MS) {
      const stateResult = await supabase.from('funding_radar_sync_state').select('*').eq('id', true).single()
      if (stateResult.error) throw stateResult.error
      const cursor = clean(stateResult.data?.cursor_openalex_work_id, 80)
      let workQuery = supabase.from('university_research_works')
        .select('openalex_work_id,publication_date,university_research_work_topics(topic_slug),university_research_work_institutions(openalex_id)')
        .order('openalex_work_id').limit(PAGE_SIZE)
      if (cursor) workQuery = workQuery.gt('openalex_work_id', cursor)
      const workResult = await workQuery
      if (workResult.error) throw workResult.error
      const localWorks = workResult.data ?? []
      if (!localWorks.length) {
        const now = new Date().toISOString()
        const reset = await supabase.from('funding_radar_sync_state').update({
          cursor_openalex_work_id: null,
          completed_cycles: Number(stateResult.data?.completed_cycles ?? 0) + 1,
          cycle_started_at: now,
          last_completed_at: now,
          last_error: null,
          updated_at: now,
        }).eq('id', true)
        if (reset.error) throw reset.error
        break
      }

      const localById = new Map(localWorks.map((work: any) => [work.openalex_work_id, work]))
      const upstreamWorks = await fetchWorks(localWorks.map((work: any) => work.openalex_work_id))
      const awards: any[] = []
      const workLinks: any[] = []
      const topicLinks: any[] = []
      const institutionLinks: any[] = []
      for (const work of upstreamWorks) {
        const workId = openAlexId(work?.id, 'W')
        const local = localById.get(workId)
        if (!local) continue
        const funderById = new Map((work?.funders ?? []).map((funder: any) => [openAlexId(funder?.id, 'F'), funder]))
        for (const award of work?.awards ?? []) {
          const awardId = openAlexId(award?.id, 'G')
          const funderId = openAlexId(award?.funder_id, 'F')
          const funder = funderById.get(funderId) as any
          const funderName = clean(award?.funder_display_name || funder?.display_name, 300)
          if (!awardId || !funderName) continue
          awards.push({
            openalex_award_id: awardId,
            award_identifier: clean(award?.funder_award_id, 240) || null,
            title: clean(award?.display_name, 500) || null,
            funder_id: funderId || null,
            funder_name: funderName,
            funder_ror: clean(funder?.ror, 240) || null,
            source_url: `https://openalex.org/${awardId}`,
            publication_date: clean(work?.publication_date, 10) || local.publication_date || null,
          })
          workLinks.push({ openalex_award_id: awardId, openalex_work_id: workId })
          for (const relation of local.university_research_work_topics ?? []) {
            if (relation?.topic_slug) topicLinks.push({ openalex_award_id: awardId, topic_slug: relation.topic_slug })
          }
          for (const relation of local.university_research_work_institutions ?? []) {
            if (relation?.openalex_id) institutionLinks.push({ openalex_award_id: awardId, openalex_id: relation.openalex_id })
          }
        }
      }
      const unique = (rows: any[], key: (row: any) => string) => [...new Map(rows.map((row) => [key(row), row])).values()]
      const page = await supabase.rpc('upsert_funding_award_page', {
        p_awards: unique(awards, (row) => row.openalex_award_id),
        p_work_links: unique(workLinks, (row) => `${row.openalex_award_id}:${row.openalex_work_id}`),
        p_topic_links: unique(topicLinks, (row) => `${row.openalex_award_id}:${row.topic_slug}`),
        p_institution_links: unique(institutionLinks, (row) => `${row.openalex_award_id}:${row.openalex_id}`),
      })
      if (page.error) throw page.error
      processed += localWorks.length
      linked += workLinks.length
      const nextCursor = localWorks.at(-1)?.openalex_work_id
      const update = await supabase.from('funding_radar_sync_state').update({
        cursor_openalex_work_id: nextCursor,
        processed_work_count: Number(stateResult.data?.processed_work_count ?? 0) + localWorks.length,
        linked_award_count: Number(stateResult.data?.linked_award_count ?? 0) + workLinks.length,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', true)
      if (update.error) throw update.error
      if (localWorks.length < PAGE_SIZE) continue
    }
    return jsonResponse(req, { ok: true, works_processed: processed, award_links_seen: linked, runtime_ms: Date.now() - started }, 200, 'POST')
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : String(error), 500) || 'funding_radar_sync_failed'
    await supabase.from('funding_radar_sync_state').update({ last_error: message, updated_at: new Date().toISOString() }).eq('id', true)
    console.error('sync-funding-radar', message)
    return jsonResponse(req, { error: 'funding_radar_sync_failed' }, 500, 'POST')
  }
})
