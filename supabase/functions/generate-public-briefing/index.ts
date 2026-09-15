import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const DISCLOSURE = 'Generated automatically from cited source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates this publication before release.'

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
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

function previousWeek(): { start: string; end: string; since: string; until: string; slug: string } {
  const now = new Date()
  const day = now.getUTCDay() || 7
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1))
  const start = new Date(thisMonday.getTime() - 7 * 86400000)
  const end = new Date(thisMonday.getTime() - 86400000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), since: start.toISOString(), until: thisMonday.toISOString(), slug: `week-of-${start.toISOString().slice(0, 10)}` }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  try {
    const period = previousWeek()
    const [research, trials, regulatory, integrity] = await Promise.all([
      supabase.from('research_items').select('id,title,published_on,source_url,status,relevance_confidence', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', period.since).lt('first_seen_at', period.until).order('first_seen_at', { ascending: false }).limit(25),
      supabase.from('clinical_trials').select('id,title,overall_status,last_update_date,source_url,relevance_confidence', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', period.since).lt('first_seen_at', period.until).order('first_seen_at', { ascending: false }).limit(25),
      supabase.from('regulatory_events').select('id,title,jurisdiction,published_at,source_url,relevance_confidence', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', period.since).lt('first_seen_at', period.until).order('first_seen_at', { ascending: false }).limit(20),
      supabase.from('research_integrity_events').select('id,title,event_type,detected_at,source_url,relevance_confidence', { count: 'exact' }).eq('publication_state', 'published').gte('detected_at', period.since).lt('detected_at', period.until).order('detected_at', { ascending: false }).limit(20),
    ])
    for (const result of [research, trials, regulatory, integrity]) if (result.error) throw result.error
    const counts = { research: research.count ?? 0, trials: trials.count ?? 0, regulatory: regulatory.count ?? 0, integrity: integrity.count ?? 0 }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const title = `Longevity evidence briefing · ${period.start}`
    const dek = `${total} newly indexed source records for the week ending ${period.end}.`
    const summary = total
      ? `The automated index added ${counts.research} research records, ${counts.trials} clinical trial records, ${counts.regulatory} regulatory notices, and ${counts.integrity} research-integrity events. Counts reflect ingestion activity, not evidence strength or clinical importance.`
      : 'No new source records were indexed during this weekly window. Source monitoring continued automatically.'
    const { error } = await supabase.from('public_briefings').upsert({
      slug: period.slug,
      period_start: period.start,
      period_end: period.end,
      title,
      dek,
      summary,
      payload: { counts, research: research.data ?? [], trials: trials.data ?? [], regulatory: regulatory.data ?? [], integrity: integrity.data ?? [], medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.' },
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      automation_disclosure: DISCLOSURE,
    }, { onConflict: 'period_start' })
    if (error) throw error
    return jsonResponse(req, { ok: true, slug: period.slug, period, counts }, 200, 'POST')
  } catch (error) {
    console.error('generate-public-briefing error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'generation_failed' }, 500, 'POST')
  }
})
