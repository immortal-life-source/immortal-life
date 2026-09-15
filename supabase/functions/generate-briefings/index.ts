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
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

function mondayPeriod(): { start: string; end: string; since: string } {
  const now = new Date()
  const utcDay = now.getUTCDay() || 7
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay + 1))
  const previousMonday = new Date(thisMonday.getTime() - 7 * 86400000)
  const previousSunday = new Date(thisMonday.getTime() - 86400000)
  return {
    start: previousMonday.toISOString().slice(0, 10),
    end: previousSunday.toISOString().slice(0, 10),
    since: previousMonday.toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')

  try {
    const period = mondayPeriod()
    const { data: preferences, error: preferencesError } = await supabase
      .from('member_briefing_preferences').select('member_id').eq('enabled', true).limit(1000)
    if (preferencesError) throw preferencesError
    let generated = 0

    for (const preference of preferences ?? []) {
      const { data: watches, error: watchesError } = await supabase
        .from('member_topic_watches').select('topic_slug,intelligence_topics(name)').eq('member_id', preference.member_id)
      if (watchesError) throw watchesError
      const slugs = (watches ?? []).map((watch: any) => watch.topic_slug)
      if (!slugs.length) continue

      const [researchLinks, trialLinks, regulatory, integrity] = await Promise.all([
        supabase.from('research_item_topics').select('topic_slug,relevance_score,research_items!inner(id,title,published_on,source_url,first_seen_at,status,relevance_confidence,publication_state)').eq('is_published', true).eq('research_items.publication_state', 'published').in('topic_slug', slugs).gte('research_items.first_seen_at', period.since).limit(40),
        supabase.from('clinical_trial_topics').select('topic_slug,relevance_score,clinical_trials!inner(id,title,overall_status,last_update_date,source_url,first_seen_at,relevance_confidence,publication_state)').eq('is_published', true).eq('clinical_trials.publication_state', 'published').in('topic_slug', slugs).gte('clinical_trials.first_seen_at', period.since).limit(40),
        supabase.from('regulatory_events').select('id,title,jurisdiction,published_at,source_url,matched_topics,relevance_confidence').eq('publication_state', 'published').overlaps('matched_topics', slugs).gte('first_seen_at', period.since).order('published_at', { ascending: false }).limit(20),
        supabase.from('research_integrity_events').select('id,title,event_type,detected_at,source_url,relevance_confidence,research_items!inner(research_item_topics!inner(topic_slug,is_published))').eq('publication_state', 'published').eq('research_items.research_item_topics.is_published', true).in('research_items.research_item_topics.topic_slug', slugs).gte('detected_at', period.since).order('detected_at', { ascending: false }).limit(20),
      ])
      for (const result of [researchLinks, trialLinks, regulatory, integrity]) if (result.error) throw result.error
      const research = (researchLinks.data ?? []).map((row: any) => row.research_items).filter(Boolean)
      const trials = (trialLinks.data ?? []).map((row: any) => row.clinical_trials).filter(Boolean)
      const topicNames = (watches ?? []).map((watch: any) => watch.intelligence_topics?.name).filter(Boolean)
      const counts = { research: research.length, trials: trials.length, regulatory: regulatory.data?.length ?? 0, integrity: integrity.data?.length ?? 0 }
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
      const summary = total
        ? `${total} new monitored records: ${counts.research} research, ${counts.trials} trials, ${counts.regulatory} regulatory, and ${counts.integrity} integrity updates.`
        : 'No new source records matched your watchlist this week. Monitoring continued normally.'
      const { error: insertError } = await supabase.from('member_briefings').upsert({
        member_id: preference.member_id,
        period_start: period.start,
        period_end: period.end,
        title: `Weekly evidence briefing · ${period.start}`,
        summary,
        payload: {
          topics: topicNames,
          counts,
          research: research.slice(0, 8),
          trials: trials.slice(0, 8),
          regulatory: (regulatory.data ?? []).slice(0, 8),
          integrity: (integrity.data ?? []).slice(0, 8),
          medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.',
        },
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
