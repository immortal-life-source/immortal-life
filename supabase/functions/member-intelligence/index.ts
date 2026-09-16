import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey, sessionFromRequest } from '../_shared/security.ts'

const METHODS = 'GET, POST, OPTIONS'
const WATCH_TYPES = new Set(['topic', 'entity', 'country', 'trial'])

function slugify(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function eventMatches(event: any, watches: any[]): boolean {
  if (!watches.length) return true
  const topics = new Set(Array.isArray(event?.topic_slugs) ? event.topic_slugs : [])
  const keys = new Set(Array.isArray(event?.watch_keys) ? event.watch_keys : [])
  return watches.some((watch) => watch.watch_type === 'topic'
    ? topics.has(watch.watch_key)
    : keys.has(watch.watch_type === 'entity' ? watch.watch_key : `${watch.watch_type}:${watch.watch_key}`))
}

async function resolveWatch(supabase: any, watchType: string, watchKey: string): Promise<{ watch_type: string; watch_key: string; label: string } | null> {
  if (!WATCH_TYPES.has(watchType) || !/^[a-z0-9]+(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$|^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(watchKey)) return null
  if (watchType === 'topic') {
    const { data } = await supabase.from('intelligence_topics').select('slug,name').eq('slug', watchKey).eq('enabled', true).maybeSingle()
    return data ? { watch_type: 'topic', watch_key: data.slug, label: data.name } : null
  }
  if (watchType === 'entity') {
    const split = watchKey.indexOf(':')
    if (split < 1) return null
    const kind = watchKey.slice(0, split); const slug = watchKey.slice(split + 1)
    if (!['topic', 'journal', 'sponsor', 'source'].includes(kind)) return null
    const { data } = await supabase.from('intelligence_entities').select('kind,slug,name').eq('kind', kind).eq('slug', slug).maybeSingle()
    return data ? { watch_type: 'entity', watch_key: `${data.kind}:${data.slug}`, label: data.name } : null
  }
  if (watchType === 'trial') {
    const id = Number(watchKey)
    if (!Number.isSafeInteger(id) || id < 1) return null
    const { data } = await supabase.from('clinical_trials').select('id,title').eq('id', id).eq('publication_state', 'published').maybeSingle()
    return data ? { watch_type: 'trial', watch_key: String(data.id), label: data.title } : null
  }
  const { data } = await supabase.from('clinical_trials').select('countries').eq('publication_state', 'published').limit(1000)
  const name = (data ?? []).flatMap((row: any) => row.countries ?? []).find((country: string) => slugify(country) === watchKey)
  return name ? { watch_type: 'country', watch_key: watchKey, label: name } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)
    return new Response('ok', { headers: corsHeaders(req, METHODS) })
  }
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse(req, { error: 'Method not allowed' }, 405, METHODS)
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)

  const session = await sessionFromRequest(req)
  if (!session) return jsonResponse(req, { error: 'Unauthorized' }, 401, METHODS)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    const { data: member } = await supabase.from('members').select('id').eq('id', session.member_id).eq('auth_provider', session.provider).eq('auth_subject', session.subject).maybeSingle()
    if (!member) return jsonResponse(req, { error: 'Unauthorized' }, 401, METHODS)

    const { error: defaultPreferenceError } = await supabase.from('member_briefing_preferences').upsert({ member_id: session.member_id, enabled: true }, { onConflict: 'member_id', ignoreDuplicates: true })
    if (defaultPreferenceError) throw defaultPreferenceError
    await supabase.from('member_radar_state').upsert({ member_id: session.member_id }, { onConflict: 'member_id', ignoreDuplicates: true })

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const action = cleanText(body?.action, 40)
      if (action === 'watch_topic' || action === 'unwatch_topic') {
        body.watch_type = 'topic'; body.watch_key = body.topic
        body.action = action === 'watch_topic' ? 'watch' : 'unwatch'
      }
      if (body.action === 'watch' || body.action === 'unwatch') {
        const watchType = cleanText(body?.watch_type, 20)
        const watchKey = cleanText(body?.watch_key, 180)
        const resolved = await resolveWatch(supabase, watchType, watchKey)
        if (!resolved) return jsonResponse(req, { error: 'Unknown watch target' }, 404, METHODS)
        if (body.action === 'watch') {
          const { error } = await supabase.from('member_radar_watches').upsert({ member_id: session.member_id, ...resolved }, { onConflict: 'member_id,watch_type,watch_key' })
          if (error) throw error
          if (resolved.watch_type === 'topic') await supabase.from('member_topic_watches').upsert({ member_id: session.member_id, topic_slug: resolved.watch_key }, { onConflict: 'member_id,topic_slug' })
        } else {
          const { error } = await supabase.from('member_radar_watches').delete().eq('member_id', session.member_id).eq('watch_type', resolved.watch_type).eq('watch_key', resolved.watch_key)
          if (error) throw error
          if (resolved.watch_type === 'topic') await supabase.from('member_topic_watches').delete().eq('member_id', session.member_id).eq('topic_slug', resolved.watch_key)
        }
      } else if (body.action === 'set_briefings') {
        if (typeof body?.enabled !== 'boolean') return jsonResponse(req, { error: 'Invalid preference' }, 400, METHODS)
        const { error } = await supabase.from('member_briefing_preferences').upsert({ member_id: session.member_id, enabled: body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
        if (error) throw error
      } else if (body.action === 'mark_radar_seen') {
        const seenAt = new Date(cleanText(body?.seen_at, 40))
        if (Number.isNaN(seenAt.getTime()) || seenAt.getTime() > Date.now() + 60000) return jsonResponse(req, { error: 'Invalid timestamp' }, 400, METHODS)
        const { error } = await supabase.from('member_radar_state').upsert({ member_id: session.member_id, last_seen_at: seenAt.toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
        if (error) throw error
      } else {
        return jsonResponse(req, { error: 'Unknown action' }, 400, METHODS)
      }
    }

    const [topicsResult, watchesResult, preferenceResult, briefingsResult, entitiesResult, trialsResult, stateResult, eventsResult] = await Promise.all([
      supabase.rpc('get_intelligence_topic_counts'),
      supabase.from('member_radar_watches').select('watch_type,watch_key,label,created_at').eq('member_id', session.member_id).order('created_at'),
      supabase.from('member_briefing_preferences').select('enabled').eq('member_id', session.member_id).maybeSingle(),
      supabase.from('member_briefings').select('id,period_start,period_end,title,summary,payload,generated_at').eq('member_id', session.member_id).order('period_start', { ascending: false }).limit(8),
      supabase.from('intelligence_entities').select('kind,slug,name,record_count').in('kind', ['sponsor', 'source']).gt('record_count', 0).order('record_count', { ascending: false }).limit(30),
      supabase.from('clinical_trials').select('id,title,overall_status,countries,sponsor,last_update_date').eq('publication_state', 'published').order('last_update_date', { ascending: false, nullsFirst: false }).limit(60),
      supabase.from('member_radar_state').select('last_seen_at').eq('member_id', session.member_id).maybeSingle(),
      supabase.from('intelligence_change_events').select('id,event_type,importance,record_type,record_id,title,source_url,occurred_at,topic_slugs,watch_keys,metadata').gte('occurred_at', new Date(Date.now() - 90 * 86400000).toISOString()).order('occurred_at', { ascending: false }).limit(250),
    ])
    for (const result of [topicsResult, watchesResult, preferenceResult, briefingsResult, entitiesResult, trialsResult, stateResult, eventsResult]) if (result.error) throw result.error

    const watches = watchesResult.data ?? []
    const events = (eventsResult.data ?? []).filter((event: any) => eventMatches(event, watches)).slice(0, 40)
    const lastSeenAt = stateResult.data?.last_seen_at ?? new Date(Date.now() - 30 * 86400000).toISOString()
    const countries = new Map<string, { key: string; label: string; count: number }>()
    for (const trial of trialsResult.data ?? []) for (const country of trial.countries ?? []) {
      const key = slugify(country); if (!key) continue
      const existing = countries.get(key); countries.set(key, { key, label: country, count: (existing?.count ?? 0) + 1 })
    }
    const generatedAt = new Date().toISOString()
    return jsonResponse(req, {
      topics: topicsResult.data ?? [],
      watched_topics: watches.filter((watch: any) => watch.watch_type === 'topic').map((watch: any) => watch.watch_key),
      watches,
      options: {
        entities: (entitiesResult.data ?? []).map((entity: any) => ({ key: `${entity.kind}:${entity.slug}`, label: entity.name, detail: entity.kind === 'sponsor' ? 'Trial sponsor' : 'Source organisation', count: entity.record_count })),
        countries: [...countries.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 30),
        trials: (trialsResult.data ?? []).slice(0, 30).map((trial: any) => ({ key: String(trial.id), label: trial.title, detail: trial.overall_status })),
      },
      radar_events: events,
      unread_count: events.filter((event: any) => String(event.occurred_at) > String(lastSeenAt)).length,
      last_seen_at: lastSeenAt,
      generated_at: generatedAt,
      briefings_enabled: preferenceResult.data?.enabled ?? true,
      briefings: briefingsResult.data ?? [],
      next_briefing: 'Monday morning',
    }, 200, METHODS)
  } catch (error) {
    console.error('member-intelligence error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'server_error' }, 500, METHODS)
  }
})
