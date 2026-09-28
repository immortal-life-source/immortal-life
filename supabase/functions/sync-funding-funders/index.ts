import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const OPENALEX = 'https://api.openalex.org'

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function openAlexId(value: unknown): string {
  return clean(value, 120).match(/(?:^|\/)(F\d+)$/)?.[1] ?? ''
}

function slugify(value: unknown): string {
  return clean(value, 240).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || 'funder'
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

async function fetchFunders(ids: string[]): Promise<any[]> {
  if (!ids.length) return []
  const url = new URL('/funders', OPENALEX)
  url.searchParams.set('filter', `openalex:${ids.join('|')}`)
  url.searchParams.set('per-page', String(ids.length))
  url.searchParams.set('select', 'id,display_name,alternate_titles,country_code,description,homepage_url,ids,updated_date')
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'immortal.life-funder-profiles/1.0 (research@immortal.life)' }
  const apiKey = Deno.env.get('OPENALEX_API_KEY')?.trim()
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
    if (response.ok) return (await response.json())?.results ?? []
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(`openalex_${response.status}`)
    await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)))
  }
  return []
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const body = await req.clone().json().catch(() => ({}))
  if (body?.trigger === 'schedule' && Deno.env.get('SCHEDULED_INGESTION_PAUSED') === 'true') return jsonResponse(req, { ok: true, status: 'maintenance_pause' }, 202, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  try {
    const candidates = await supabase.rpc('get_funders_needing_profile', { p_limit: 50 })
    if (candidates.error) throw candidates.error
    const ids = (candidates.data ?? []).map((item: any) => openAlexId(item.funder_id)).filter(Boolean)
    const funders = await fetchFunders(ids)
    const rows = funders.map((funder: any) => {
      const funderId = openAlexId(funder?.id)
      const name = clean(funder?.display_name, 300)
      return {
        funder_id: funderId,
        slug: `${slugify(name)}-${funderId.toLowerCase()}`,
        name,
        alternate_titles: Array.isArray(funder?.alternate_titles) ? funder.alternate_titles.map((title: unknown) => clean(title, 300)).filter(Boolean).slice(0, 30) : [],
        country_code: clean(funder?.country_code, 2).toUpperCase() || null,
        description: clean(funder?.description, 600) || null,
        homepage_url: clean(funder?.homepage_url, 500) || null,
        ror_id: clean(funder?.ids?.ror, 240) || null,
        wikidata_url: clean(funder?.ids?.wikidata, 240) || null,
        crossref_id: clean(funder?.ids?.crossref, 120) || null,
        source_url: `https://openalex.org/${funderId}`,
        source_updated_date: clean(funder?.updated_date, 10) || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }).filter((row: any) => row.funder_id && row.name)
    if (rows.length) {
      const stored = await supabase.from('funding_funders').upsert(rows, { onConflict: 'funder_id', defaultToNull: false })
      if (stored.error) throw stored.error
    }
    return jsonResponse(req, { ok: true, requested: ids.length, synchronized: rows.length }, 200, 'POST')
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : String(error), 500) || 'funder_profile_sync_failed'
    console.error('sync-funding-funders', message)
    return jsonResponse(req, { error: 'funder_profile_sync_failed' }, 500, 'POST')
  }
})
