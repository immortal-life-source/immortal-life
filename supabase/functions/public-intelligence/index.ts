import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { corsHeaders, serviceRoleKey } from '../_shared/security.ts'

const PUBLIC_METHODS = 'GET, OPTIONS'

function response(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req, PUBLIC_METHODS),
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=120, s-maxage=300, stale-while-revalidate=900' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function publicSourceState(source: any): Record<string, unknown> {
  const lastSuccess = source?.last_success_at ? new Date(source.last_success_at) : null
  const ageMs = lastSuccess && !Number.isNaN(lastSuccess.getTime()) ? Date.now() - lastSuccess.getTime() : null
  let health = 'pending'
  if (ageMs != null) health = ageMs > 24 * 60 * 60 * 1000 ? 'stale' : 'healthy'
  if (Number(source?.consecutive_failures ?? 0) >= 2) health = 'degraded'
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    homepage_url: source.homepage_url,
    update_cadence: source.update_cadence,
    last_success_at: source.last_success_at,
    health,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, PUBLIC_METHODS) })
  if (req.method !== 'GET') return response(req, { error: 'Method not allowed' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const url = new URL(req.url)
  const view = cleanText(url.searchParams.get('view') ?? 'overview', 30)
  const topic = cleanText(url.searchParams.get('topic') ?? '', 80)
  const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '24', 10)
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 24

  if (topic && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)) {
    return response(req, { error: 'Invalid topic' }, 400)
  }

  try {
    const sourcesPromise = supabase
      .from('content_sources')
      .select('id,name,kind,homepage_url,update_cadence,last_success_at,consecutive_failures')
      .eq('enabled', true)
      .order('name')

    if (view === 'topics') {
      const [{ data: topics, error }, { data: sources, error: sourcesError }] = await Promise.all([
        supabase.rpc('get_intelligence_topic_counts'),
        sourcesPromise,
      ])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { topics: topics ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'research') {
      const topicRelation = topic
        ? 'research_item_topics!inner(topic_slug,intelligence_topics(name,slug))'
        : 'research_item_topics(topic_slug,intelligence_topics(name,slug))'
      let query = supabase
        .from('research_items')
        .select(`id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,source_url,is_open_access,cited_by_count,editorial_summary,status,${topicRelation}`)
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (topic) query = query.eq('research_item_topics.topic_slug', topic)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { research: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'trials') {
      const topicRelation = topic
        ? 'clinical_trial_topics!inner(topic_slug,intelligence_topics(name,slug))'
        : 'clinical_trial_topics(topic_slug,intelligence_topics(name,slug))'
      let query = supabase
        .from('clinical_trials')
        .select(`id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,source_url,editorial_summary,${topicRelation}`)
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (topic) query = query.eq('clinical_trial_topics.topic_slug', topic)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { trials: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    const [topicsResult, researchResult, trialsResult, sourcesResult, researchCount, trialsCount] = await Promise.all([
      supabase.rpc('get_intelligence_topic_counts'),
      supabase
        .from('research_items')
        .select('id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,source_url,is_open_access,cited_by_count,editorial_summary,status,research_item_topics(topic_slug,intelligence_topics(name,slug))')
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      supabase
        .from('clinical_trials')
        .select('id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,source_url,editorial_summary,clinical_trial_topics(topic_slug,intelligence_topics(name,slug))')
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      sourcesPromise,
      supabase.from('research_items').select('*', { count: 'exact', head: true }),
      supabase.from('clinical_trials').select('*', { count: 'exact', head: true }),
    ])
    for (const result of [topicsResult, researchResult, trialsResult, sourcesResult, researchCount, trialsCount]) {
      if (result.error) throw result.error
    }

    return response(req, {
      generated_at: new Date().toISOString(),
      stats: {
        research_records: researchCount.count ?? 0,
        clinical_trials: trialsCount.count ?? 0,
        topics: topicsResult.data?.length ?? 0,
      },
      sources: (sourcesResult.data ?? []).map(publicSourceState),
      topics: topicsResult.data ?? [],
      research: researchResult.data ?? [],
      trials: trialsResult.data ?? [],
      medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.',
    })
  } catch (error) {
    console.error('public-intelligence error:', error instanceof Error ? error.message : String(error))
    return response(req, { error: 'content_unavailable' }, 500)
  }
})
