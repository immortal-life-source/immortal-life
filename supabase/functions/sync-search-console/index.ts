import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const PROPERTY = 'sc-domain:immortal.life'

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

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')

  const { data: run, error: runError } = await supabase.from('search_console_sync_runs').insert({ status: 'running' }).select('id').single()
  if (runError) return jsonResponse(req, { error: 'sync_log_failed' }, 500, 'POST')

  const clientId = Deno.env.get('GOOGLE_SEARCH_CONSOLE_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET') ?? ''
  const refreshToken = Deno.env.get('GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN') ?? ''
  if (!clientId || !clientSecret || !refreshToken) {
    await supabase.from('search_console_sync_runs').update({ status: 'not_configured', finished_at: new Date().toISOString(), error_code: 'oauth_not_configured' }).eq('id', run.id)
    return jsonResponse(req, { ok: true, configured: false, rows_imported: 0 }, 200, 'POST')
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    if (!tokenResponse.ok) throw new Error(`google_token_${tokenResponse.status}`)
    const token = await tokenResponse.json()
    if (!token?.access_token) throw new Error('google_token_incomplete')

    const searchResponse = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: isoDay(5), endDate: isoDay(2), dimensions: ['date', 'page', 'query', 'country', 'device'], rowLimit: 25000, dataState: 'final' }),
    })
    if (!searchResponse.ok) throw new Error(`search_console_${searchResponse.status}`)
    const payload = await searchResponse.json()
    const rows = (Array.isArray(payload?.rows) ? payload.rows : []).map((row: any) => ({
      metric_date: row.keys?.[0], page: cleanText(row.keys?.[1], 1000), query: cleanText(row.keys?.[2], 500), country: cleanText(row.keys?.[3], 16), device: cleanText(row.keys?.[4], 32),
      clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(row.ctr || 0), position: Number(row.position || 0), imported_at: new Date().toISOString(),
    })).filter((row: any) => row.metric_date && row.page && row.query)

    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await supabase.from('search_console_daily').upsert(rows.slice(index, index + 500), { onConflict: 'metric_date,page,query,country,device' })
      if (error) throw error
    }
    await supabase.rpc('refresh_search_opportunities')
    await supabase.from('search_console_sync_runs').update({ status: 'succeeded', finished_at: new Date().toISOString(), rows_imported: rows.length }).eq('id', run.id)
    return jsonResponse(req, { ok: true, configured: true, rows_imported: rows.length }, 200, 'POST')
  } catch (error) {
    const code = cleanText(error instanceof Error ? error.message : String(error), 240) || 'sync_failed'
    await supabase.from('search_console_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_code: code }).eq('id', run.id)
    console.error('sync-search-console error:', code)
    return jsonResponse(req, { error: 'sync_failed' }, 500, 'POST')
  }
})
