import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey, sessionFromRequest } from '../_shared/security.ts'

const METHODS = 'GET, POST, OPTIONS'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)
    return new Response('ok', { headers: corsHeaders(req, METHODS) })
  }
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse(req, { error: 'Method not allowed' }, 405, METHODS)
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)

  const session = await sessionFromRequest(req)
  if (!session) return jsonResponse(req, { error: 'Unauthorized' }, 401, METHODS)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data: member } = await supabase.from('members').select('id').eq('id', session.member_id).eq('auth_provider', session.provider).eq('auth_subject', session.subject).maybeSingle()
    if (!member) return jsonResponse(req, { error: 'Unauthorized' }, 401, METHODS)

    const { error: defaultPreferenceError } = await supabase.from('member_briefing_preferences').upsert({
      member_id: session.member_id,
      enabled: true,
    }, { onConflict: 'member_id', ignoreDuplicates: true })
    if (defaultPreferenceError) throw defaultPreferenceError

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const action = cleanText(body?.action, 40)
      if (action === 'watch_topic' || action === 'unwatch_topic') {
        const topic = cleanText(body?.topic, 80)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)) return jsonResponse(req, { error: 'Invalid topic' }, 400, METHODS)
        const { data: validTopic } = await supabase.from('intelligence_topics').select('slug').eq('slug', topic).eq('enabled', true).maybeSingle()
        if (!validTopic) return jsonResponse(req, { error: 'Unknown topic' }, 404, METHODS)
        const operation = action === 'watch_topic'
          ? supabase.from('member_topic_watches').upsert({ member_id: session.member_id, topic_slug: topic }, { onConflict: 'member_id,topic_slug' })
          : supabase.from('member_topic_watches').delete().eq('member_id', session.member_id).eq('topic_slug', topic)
        const { error } = await operation
        if (error) throw error
      } else if (action === 'set_briefings') {
        if (typeof body?.enabled !== 'boolean') return jsonResponse(req, { error: 'Invalid preference' }, 400, METHODS)
        const { error } = await supabase.from('member_briefing_preferences').upsert({
          member_id: session.member_id,
          enabled: body.enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id' })
        if (error) throw error
      } else {
        return jsonResponse(req, { error: 'Unknown action' }, 400, METHODS)
      }
    }

    const [topicsResult, watchesResult, preferenceResult, briefingsResult] = await Promise.all([
      supabase.rpc('get_intelligence_topic_counts'),
      supabase.from('member_topic_watches').select('topic_slug').eq('member_id', session.member_id),
      supabase.from('member_briefing_preferences').select('enabled').eq('member_id', session.member_id).maybeSingle(),
      supabase.from('member_briefings').select('id,period_start,period_end,title,summary,payload,generated_at').eq('member_id', session.member_id).order('period_start', { ascending: false }).limit(8),
    ])
    for (const result of [topicsResult, watchesResult, preferenceResult, briefingsResult]) if (result.error) throw result.error

    return jsonResponse(req, {
      topics: topicsResult.data ?? [],
      watched_topics: (watchesResult.data ?? []).map((row: { topic_slug: string }) => row.topic_slug),
      briefings_enabled: preferenceResult.data?.enabled ?? true,
      briefings: briefingsResult.data ?? [],
      next_briefing: 'Monday morning',
    }, 200, METHODS)
  } catch (error) {
    console.error('member-intelligence error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'server_error' }, 500, METHODS)
  }
})
