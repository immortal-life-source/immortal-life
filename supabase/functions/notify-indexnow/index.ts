import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const INDEXNOW_KEY = '9f2c4a7e61d84b73a5c901e8f426bd10'
const SITE = 'https://www.immortal.life'

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  try {
    const since = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
    const [research, trials, regulatory, integrity, briefings] = await Promise.all([
      supabase.from('research_items').select('id').eq('publication_state', 'published').gte('last_seen_at', since).limit(1500),
      supabase.from('clinical_trials').select('id').eq('publication_state', 'published').gte('last_seen_at', since).limit(1500),
      supabase.from('regulatory_events').select('id').eq('publication_state', 'published').gte('last_seen_at', since).limit(500),
      supabase.from('research_integrity_events').select('id').eq('publication_state', 'published').gte('detected_at', since).limit(500),
      supabase.from('public_briefings').select('slug').gte('updated_at', since).limit(100),
    ])
    for (const result of [research, trials, regulatory, integrity, briefings]) if (result.error) throw result.error
    const urlList = [
      ...(research.data ?? []).map((row: any) => `${SITE}/research/${row.id}`),
      ...(trials.data ?? []).map((row: any) => `${SITE}/trials/${row.id}`),
      ...(regulatory.data ?? []).map((row: any) => `${SITE}/regulatory/${row.id}`),
      ...(integrity.data ?? []).map((row: any) => `${SITE}/integrity/${row.id}`),
      ...(briefings.data ?? []).map((row: any) => `${SITE}/briefings/${row.slug}`),
    ].slice(0, 10000)
    if (!urlList.length) {
      await supabase.from('indexing_submission_log').insert({ provider: 'indexnow', submitted_count: 0, succeeded: true, response_status: 204 })
      return jsonResponse(req, { ok: true, submitted: 0 }, 200, 'POST')
    }
    const result = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'www.immortal.life', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList }) })
    if (!result.ok && result.status !== 202) throw new Error(`IndexNow returned ${result.status}`)
    await supabase.from('indexing_submission_log').insert({ provider: 'indexnow', submitted_count: urlList.length, succeeded: true, response_status: result.status })
    return jsonResponse(req, { ok: true, submitted: urlList.length, status: result.status }, 200, 'POST')
  } catch (error) {
    console.error('notify-indexnow error', error instanceof Error ? error.message : String(error))
    await supabase.from('indexing_submission_log').insert({ provider: 'indexnow', submitted_count: 0, succeeded: false, error_code: error instanceof Error ? error.message.slice(0, 240) : 'unknown_error' })
    return jsonResponse(req, { error: 'indexing_notification_failed' }, 500, 'POST')
  }
})
