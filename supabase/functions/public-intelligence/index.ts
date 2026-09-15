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

function publicResourceState(resource: any, ingestionSource?: any): Record<string, unknown> {
  const failures = Number(resource?.consecutive_failures ?? 0)
  const status = Number(resource?.last_status_code ?? 0)
  const restricted = [401, 403, 405, 416, 429].includes(status)
  const monitoredHealth = !resource?.last_checked_at ? 'pending' : failures > 0 ? 'degraded' : restricted ? 'restricted' : 'healthy'
  const health = ingestionSource ? publicSourceState(ingestionSource).health : monitoredHealth
  return {
    id: resource.id,
    name: resource.name,
    resource_type: resource.resource_type,
    geographic_scope: resource.geographic_scope,
    jurisdiction_code: resource.jurisdiction_code,
    jurisdiction_name: resource.jurisdiction_name,
    region: resource.region,
    authority_tier: resource.authority_tier,
    description: resource.description,
    limitations: resource.limitations,
    homepage_url: resource.homepage_url,
    data_url: resource.data_url,
    terms_url: resource.terms_url,
    access_mode: resource.access_mode,
    reuse_status: resource.reuse_status,
    integration_status: resource.integration_status,
    health_basis: ingestionSource ? 'ingestion' : 'availability',
    update_cadence: resource.update_cadence,
    eligibility_reason: resource.eligibility_reason,
    last_checked_at: resource.last_checked_at,
    last_healthy_at: resource.last_healthy_at,
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

    if (view === 'quality') {
      const [{ data: telemetry, error }, { data: search, error: searchError }, { data: sources, error: sourcesError }] = await Promise.all([
        supabase.rpc('get_intelligence_quality_telemetry'),
        supabase.rpc('search_utility_telemetry'),
        sourcesPromise,
      ])
      if (error) throw error
      if (searchError) throw searchError
      if (sourcesError) throw sourcesError
      return response(req, { telemetry: { ...(telemetry ?? {}), search: search ?? {} }, sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'entities') {
      const kind = cleanText(url.searchParams.get('kind') ?? '', 30)
      let entityQuery = supabase
        .from('intelligence_entities')
        .select('kind,slug,name,description,record_count,last_seen_at,metadata')
        .order('record_count', { ascending: false })
        .order('name')
        .limit(limit)
      if (kind && ['topic', 'journal', 'sponsor', 'source'].includes(kind)) entityQuery = entityQuery.eq('kind', kind)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([entityQuery, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { entities: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'resources') {
      const [{ data, error }, { data: ingestionSources, error: ingestionError }] = await Promise.all([supabase
        .from('global_resources')
        .select('id,name,resource_type,geographic_scope,jurisdiction_code,jurisdiction_name,region,authority_tier,description,limitations,homepage_url,data_url,terms_url,access_mode,reuse_status,integration_status,content_source_id,update_cadence,eligibility_reason,last_checked_at,last_healthy_at,last_status_code,consecutive_failures')
        .eq('is_eligible', true)
        .order('authority_tier')
        .order('name')
        .limit(limit), sourcesPromise])
      if (error) throw error
      if (ingestionError) throw ingestionError
      const ingestionById = new Map((ingestionSources ?? []).map((source: any) => [source.id, source]))
      const resources = (data ?? []).map((resource: any) => publicResourceState(resource, resource.content_source_id ? ingestionById.get(resource.content_source_id) : undefined))
      const countBy = (key: string) => resources.reduce((counts: Record<string, number>, item: any) => {
        const value = String(item[key] ?? 'Unknown')
        counts[value] = (counts[value] ?? 0) + 1
        return counts
      }, {})
      return response(req, {
        generated_at: new Date().toISOString(),
        resources,
        coverage: {
          total: resources.length,
          jurisdictions: new Set(resources.map((item: any) => item.jurisdiction_code)).size,
          live_integrations: resources.filter((item: any) => item.integration_status === 'live').length,
          healthy: resources.filter((item: any) => item.health === 'healthy').length,
          by_region: countBy('region'),
          by_type: countBy('resource_type'),
        },
        scope_notice: 'Coverage is selective and authority-based. A resource applies only in its stated jurisdiction; directory inclusion is not endorsement or evidence of treatment approval.',
      })
    }

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
      const topicRelation = 'research_item_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
      let query = supabase
        .from('research_items')
        .select(`id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,source_url,is_open_access,cited_by_count,editorial_summary,status,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,${topicRelation}`)
        .eq('publication_state', 'published')
        .eq('research_item_topics.is_published', true)
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (topic) query = query.eq('research_item_topics.topic_slug', topic).eq('research_item_topics.is_published', true)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { research: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'trials') {
      const topicRelation = 'clinical_trial_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
      let query = supabase
        .from('clinical_trials')
        .select(`id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,${topicRelation}`)
        .eq('publication_state', 'published')
        .eq('clinical_trial_topics.is_published', true)
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (topic) query = query.eq('clinical_trial_topics.topic_slug', topic).eq('clinical_trial_topics.is_published', true)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { trials: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'integrity') {
      let query = supabase
        .from('research_integrity_events')
        .select('id,event_type,title,summary,source_url,announced_on,detected_at,relevance_confidence,source_quality_score,freshness_score,match_explanation,research_items(id,title,doi,status,research_item_topics(topic_slug,relevance_score,is_published,intelligence_topics(name,slug)))')
        .eq('publication_state', 'published')
        .order('detected_at', { ascending: false })
        .limit(limit)
      if (topic) query = query.eq('research_items.research_item_topics.topic_slug', topic)
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { integrity: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'regulatory') {
      let query = supabase
        .from('regulatory_events')
        .select('id,jurisdiction,category,title,summary,published_at,source_url,matched_topics,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name)')
        .eq('publication_state', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (topic) query = query.contains('matched_topics', [topic])
      const [{ data, error }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { regulatory: data ?? [], sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'graph') {
      const [topicsResult, researchLinks, trialLinks, regulatoryResult, integrityResult, sourcesResult] = await Promise.all([
        supabase.rpc('get_intelligence_topic_counts'),
        supabase.from('research_item_topics').select('research_item_id,topic_slug,research_items!inner(publication_state)').eq('is_published', true).eq('research_items.publication_state', 'published').limit(5000),
        supabase.from('clinical_trial_topics').select('clinical_trial_id,topic_slug,clinical_trials!inner(publication_state)').eq('is_published', true).eq('clinical_trials.publication_state', 'published').limit(5000),
        supabase.from('regulatory_events').select('matched_topics').eq('publication_state', 'published').limit(1000),
        supabase.from('research_integrity_events').select('research_items(research_item_topics(topic_slug,is_published))').eq('publication_state', 'published').limit(1000),
        sourcesPromise,
      ])
      for (const result of [topicsResult, researchLinks, trialLinks, regulatoryResult, integrityResult, sourcesResult]) if (result.error) throw result.error
      const topics = topicsResult.data ?? []
      const nodes = topics.map((item: any) => ({ id: `topic:${item.slug}`, slug: item.slug, label: item.name, kind: 'topic', weight: Number(item.research_count) + Number(item.trial_count) }))
      nodes.push(
        { id: 'layer:research', label: 'Research', kind: 'evidence', weight: researchLinks.data?.length ?? 0 },
        { id: 'layer:trials', label: 'Trials', kind: 'evidence', weight: trialLinks.data?.length ?? 0 },
        { id: 'layer:regulatory', label: 'Regulatory', kind: 'evidence', weight: regulatoryResult.data?.length ?? 0 },
        { id: 'layer:integrity', label: 'Integrity', kind: 'evidence', weight: integrityResult.data?.length ?? 0 },
      )
      const links: Array<{ source: string; target: string; kind: string; weight: number }> = []
      for (const item of topics) {
        links.push({ source: `topic:${item.slug}`, target: 'layer:research', kind: 'research', weight: Number(item.research_count) })
        links.push({ source: `topic:${item.slug}`, target: 'layer:trials', kind: 'trial', weight: Number(item.trial_count) })
      }
      const regulatoryCounts = new Map<string, number>()
      for (const item of regulatoryResult.data ?? []) for (const slug of item.matched_topics ?? []) regulatoryCounts.set(slug, (regulatoryCounts.get(slug) ?? 0) + 1)
      for (const [slug, weight] of regulatoryCounts) links.push({ source: `topic:${slug}`, target: 'layer:regulatory', kind: 'regulatory', weight })
      const integrityCounts = new Map<string, number>()
      for (const item of integrityResult.data ?? []) {
        const relations = item.research_items?.research_item_topics ?? []
        for (const relation of relations) if (relation.is_published) integrityCounts.set(relation.topic_slug, (integrityCounts.get(relation.topic_slug) ?? 0) + 1)
      }
      for (const [slug, weight] of integrityCounts) links.push({ source: `topic:${slug}`, target: 'layer:integrity', kind: 'integrity', weight })

      const memberships = new Map<string, Set<string>>()
      for (const row of [...(researchLinks.data ?? []).map((item: any) => ({ key: `r:${item.research_item_id}`, topic: item.topic_slug })), ...(trialLinks.data ?? []).map((item: any) => ({ key: `t:${item.clinical_trial_id}`, topic: item.topic_slug }))]) {
        if (!memberships.has(row.key)) memberships.set(row.key, new Set())
        memberships.get(row.key)?.add(row.topic)
      }
      const pairs = new Map<string, number>()
      for (const topicSet of memberships.values()) {
        const values = [...topicSet].sort()
        for (let left = 0; left < values.length; left++) for (let right = left + 1; right < values.length; right++) {
          const key = `${values[left]}|${values[right]}`
          pairs.set(key, (pairs.get(key) ?? 0) + 1)
        }
      }
      for (const [pair, weight] of [...pairs].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
        const [left, right] = pair.split('|')
        links.push({ source: `topic:${left}`, target: `topic:${right}`, kind: 'overlap', weight })
      }
      return response(req, { generated_at: new Date().toISOString(), nodes, links, sources: (sourcesResult.data ?? []).map(publicSourceState) })
    }

    const [topicsResult, researchResult, trialsResult, sourcesResult, researchCount, trialsCount] = await Promise.all([
      supabase.rpc('get_intelligence_topic_counts'),
      supabase
        .from('research_items')
        .select('id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,source_url,is_open_access,cited_by_count,editorial_summary,status,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,research_item_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))')
        .eq('publication_state', 'published')
        .eq('research_item_topics.is_published', true)
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      supabase
        .from('clinical_trials')
        .select('id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,clinical_trial_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))')
        .eq('publication_state', 'published')
        .eq('clinical_trial_topics.is_published', true)
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      sourcesPromise,
      supabase.from('research_items').select('*', { count: 'exact', head: true }).eq('publication_state', 'published'),
      supabase.from('clinical_trials').select('*', { count: 'exact', head: true }).eq('publication_state', 'published'),
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
