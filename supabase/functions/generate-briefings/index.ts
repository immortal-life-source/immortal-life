import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

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

function mondayPeriod(): { start: string; end: string; since: string; until: string } {
  const now = new Date(); const utcDay = now.getUTCDay() || 7
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay + 1))
  const previousMonday = new Date(thisMonday.getTime() - 7 * 86400000); const previousSunday = new Date(thisMonday.getTime() - 86400000)
  return { start: previousMonday.toISOString().slice(0, 10), end: previousSunday.toISOString().slice(0, 10), since: previousMonday.toISOString(), until: thisMonday.toISOString() }
}

function matches(event: any, watches: any[]): boolean {
  const topics = new Set(event.topic_slugs ?? []); const keys = new Set(event.watch_keys ?? [])
  return watches.some((watch) => watch.watch_type === 'topic' ? topics.has(watch.watch_key) : keys.has(watch.watch_type === 'entity' ? watch.watch_key : `${watch.watch_type}:${watch.watch_key}`))
}

const MEANINGFUL_EVENT_TYPES = new Set(['trial_status_changed', 'new_regulatory_notice', 'new_integrity_event', 'quality_state_changed', 'research_updated'])

function isMeaningfulEvent(event: any): boolean {
  if (!MEANINGFUL_EVENT_TYPES.has(String(event?.event_type ?? ''))) return false
  if (event.event_type === 'research_updated') return event.importance === 'important' || ['retracted', 'corrected', 'expression_of_concern'].includes(String(event?.metadata?.status ?? ''))
  return true
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  try {
    const period = mondayPeriod()
    const [{ data: preferences, error: preferencesError }, { data: events, error: eventsError }] = await Promise.all([
      supabase.from('member_briefing_preferences').select('member_id').eq('enabled', true).limit(1000),
      supabase.from('intelligence_change_events').select('event_type,importance,record_type,record_id,title,source_url,occurred_at,topic_slugs,watch_keys,metadata').gte('occurred_at', period.since).lt('occurred_at', period.until).order('occurred_at', { ascending: false }).limit(2000),
    ])
    if (preferencesError || eventsError) throw preferencesError ?? eventsError
    let generated = 0
    for (const preference of preferences ?? []) {
      const { data: watches, error: watchesError } = await supabase.from('member_radar_watches').select('watch_type,watch_key,label').eq('member_id', preference.member_id)
      if (watchesError) throw watchesError
      if (!watches?.length) continue
      const relevant = (events ?? []).filter((event: any) => isMeaningfulEvent(event) && matches(event, watches)).slice(0, 60)
      const grouped: Record<string, any[]> = { research: [], trials: [], regulatory: [], integrity: [] }
      for (const event of relevant) grouped[event.record_type]?.push({ id: event.record_id, title: event.title, source_url: event.source_url, event_type: event.event_type, importance: event.importance, occurred_at: event.occurred_at, metadata: event.metadata })
      const counts = Object.fromEntries(Object.entries(grouped).map(([kind, rows]) => [kind, rows.length]))
      const total = relevant.length
      const summary = total
        ? `${total} relevant changes: ${counts.research} research, ${counts.trials} trial, ${counts.regulatory} regulatory, and ${counts.integrity} integrity updates.`
        : 'No new source changes matched your radar this week. Monitoring continued normally.'
      const { error: insertError } = await supabase.from('member_briefings').upsert({
        member_id: preference.member_id, period_start: period.start, period_end: period.end,
        title: `Personal longevity radar · ${period.start}`, summary,
        payload: { watches: watches.map((watch: any) => ({ type: watch.watch_type, key: watch.watch_key, label: watch.label })), counts, changes: relevant.slice(0, 20), research: grouped.research.slice(0, 8), trials: grouped.trials.slice(0, 8), regulatory: grouped.regulatory.slice(0, 8), integrity: grouped.integrity.slice(0, 8), medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.' },
        generated_at: new Date().toISOString(),
      }, { onConflict: 'member_id,period_start' })
      if (insertError) throw insertError
      generated += 1
    }
    return jsonResponse(req, { ok: true, period, generated }, 200, 'POST')
  } catch (error) {
    console.error('generate-briefings error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'generation_failed' }, 500, 'POST')
  }
})
