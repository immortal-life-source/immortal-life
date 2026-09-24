import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { corsHeaders, serviceRoleKey } from '../_shared/security.ts'

const PUBLIC_METHODS = 'GET, OPTIONS'
const STRICT_TITLE_CONTEXT_TOPICS = new Set(['glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy'])
const TOPIC_MECHANISMS: Record<string, string> = {
  'rapamycin': 'mTOR signalling', 'senolytics': 'Cellular senescence', 'partial-reprogramming': 'Epigenetic resetting',
  'metformin': 'AMPK and metabolism', 'glp-1-therapies': 'Incretin signalling', 'exercise': 'Mitochondrial adaptation',
  'caloric-restriction': 'Nutrient sensing', 'sleep': 'Circadian regulation', 'epigenetic-clocks': 'DNA methylation',
  'plasma-exchange': 'Circulating factors', 'stem-cells': 'Tissue regeneration', 'gene-therapy': 'Gene delivery and editing',
  'genomic-instability': 'DNA damage and repair', 'telomeres-telomerase': 'Telomere maintenance', 'epigenetic-alterations': 'Chromatin regulation',
  proteostasis: 'Protein quality control', autophagy: 'Cellular recycling', 'nutrient-sensing': 'Metabolic signalling',
  'mitochondrial-function': 'Mitochondrial quality', 'intercellular-communication': 'Cell-to-cell signalling', 'chronic-inflammation': 'Inflammaging',
  'microbiome-dysbiosis': 'Host–microbiome balance', 'nad-metabolism': 'NAD metabolism', sirtuins: 'Sirtuin signalling',
  spermidine: 'Autophagy support', 'urolithin-a': 'Mitophagy', taurine: 'Amino-acid metabolism',
  'glycine-glynac': 'Glutathione metabolism', 'alpha-ketoglutarate': 'TCA-cycle signalling', acarbose: 'Glucose handling',
  canagliflozin: 'SGLT2 and metabolism', '17alpha-estradiol': 'Steroid signalling', 'ketogenic-diets': 'Ketone metabolism',
  'protein-restriction': 'Amino-acid sensing', 'young-blood-parabiosis': 'Circulating factors', 'heat-cold-hormesis': 'Adaptive stress response',
  frailty: 'Whole-person resilience', sarcopenia: 'Muscle ageing', 'cognitive-aging': 'Brain resilience',
  'cardiovascular-aging': 'Vascular ageing', 'immune-aging': 'Immunosenescence', 'ovarian-aging': 'Reproductive ageing',
}

function publicRelations(record: any, field: string): any[] {
  return (record?.[field] ?? []).filter((relation: any) => {
    if (relation?.is_published === false) return false
    if (!STRICT_TITLE_CONTEXT_TOPICS.has(relation?.topic_slug)) return true
    const fields = Array.isArray(relation?.matched_fields) ? relation.matched_fields : []
    return fields.includes('title') && fields.includes('title context')
  })
}

function publicRecords(rows: any[] | null, field: string): any[] {
  return (rows ?? []).map((record: any) => ({ ...record, [field]: publicRelations(record, field) })).filter((record: any) => record[field].length > 0)
}

function publicLinkRows(rows: any[] | null): any[] {
  return (rows ?? []).filter((row: any) => {
    if (!STRICT_TITLE_CONTEXT_TOPICS.has(row?.topic_slug)) return true
    const fields = Array.isArray(row?.matched_fields) ? row.matched_fields : []
    return fields.includes('title') && fields.includes('title context')
  })
}

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
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 24

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
      const [{ data: telemetry, error }, { data: search, error: searchError }, { data: sources, error: sourcesError }, { data: directorySources, error: directoryError }] = await Promise.all([
        supabase.rpc('get_intelligence_quality_telemetry'),
        supabase.rpc('search_utility_telemetry'),
        sourcesPromise,
        supabase.from('global_resources')
          .select('id,name,resource_type,geographic_scope,jurisdiction_code,jurisdiction_name,region,authority_tier,description,limitations,homepage_url,data_url,terms_url,access_mode,reuse_status,integration_status,update_cadence,eligibility_reason,last_checked_at,last_healthy_at,last_status_code,consecutive_failures')
          .eq('is_eligible', true)
          .eq('resource_type', 'regulator')
          .eq('region', 'Europe')
          .order('jurisdiction_name')
          .order('name')
          .limit(100),
      ])
      if (error) throw error
      if (searchError) throw searchError
      if (sourcesError) throw sourcesError
      if (directoryError) throw directoryError
      return response(req, {
        telemetry: { ...(telemetry ?? {}), search: search ?? {} },
        sources: (sources ?? []).map(publicSourceState),
        directory_sources: (directorySources ?? []).map((resource: any) => publicResourceState(resource)),
      })
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
      const [{ data, error }, { data: ingestionSources, error: ingestionError }, { data: countryDirectory, error: countryDirectoryError }] = await Promise.all([supabase
        .from('global_resources')
        .select('id,name,resource_type,geographic_scope,jurisdiction_code,jurisdiction_name,region,authority_tier,description,limitations,homepage_url,data_url,terms_url,access_mode,reuse_status,integration_status,content_source_id,update_cadence,eligibility_reason,last_checked_at,last_healthy_at,last_status_code,consecutive_failures')
        .eq('is_eligible', true)
        .order('authority_tier')
        .order('name')
        .limit(limit), sourcesPromise, supabase
          .from('global_country_roster')
          .select('jurisdiction_code,jurisdiction_name,region,source_kind')
          .order('jurisdiction_name')])
      if (error) throw error
      if (ingestionError) throw ingestionError
      if (countryDirectoryError) throw countryDirectoryError
      const ingestionById = new Map((ingestionSources ?? []).map((source: any) => [source.id, source]))
      const resources = (data ?? []).map((resource: any) => publicResourceState(resource, resource.content_source_id ? ingestionById.get(resource.content_source_id) : undefined))
      const countBy = (key: string) => resources.reduce((counts: Record<string, number>, item: any) => {
        const value = String(item[key] ?? 'Unknown')
        counts[value] = (counts[value] ?? 0) + 1
        return counts
      }, {})
      const countriesByRegion = (countryDirectory ?? []).reduce((regions: Record<string, Set<string>>, item: any) => {
        const region = String(item.region ?? 'Unknown')
        if (!regions[region]) regions[region] = new Set()
        regions[region].add(item.jurisdiction_code)
        return regions
      }, {})
      return response(req, {
        generated_at: new Date().toISOString(),
        resources,
        country_directory: countryDirectory ?? [],
        coverage: {
          total: resources.length,
          jurisdictions: new Set(resources.map((item: any) => item.jurisdiction_code)).size,
          live_integrations: resources.filter((item: any) => item.integration_status === 'live').length,
          healthy: resources.filter((item: any) => item.health === 'healthy').length,
          by_region: countBy('region'),
          by_region_jurisdictions: Object.fromEntries(Object.entries(countriesByRegion).map(([region, codes]) => [region, codes.size])),
          by_type: countBy('resource_type'),
        },
        scope_notice: 'Coverage is selective and authority-based. A resource applies only in its stated jurisdiction; directory inclusion is not endorsement or evidence of treatment approval.',
      })
    }

    if (view === 'universities') {
      const country = cleanText(url.searchParams.get('country') ?? '', 2).toUpperCase()
      const continent = cleanText(url.searchParams.get('continent') ?? '', 40)
      const sort = cleanText(url.searchParams.get('sort') ?? 'index', 20)
      const universityLimit = Math.min(Math.max(parsedLimit || 100, 1), 500)
      const relation = topic
        ? 'university_research_topic_metrics!inner(topic_slug,works_five_year,works_two_year,representative_citations,representative_open_access_count,representative_work_count)'
        : 'university_research_topic_metrics(topic_slug,works_five_year,works_two_year,representative_citations,representative_open_access_count,representative_work_count)'
      let query = supabase.from('university_research_institutions')
        .select(`openalex_id,slug,name,ror_id,country_code,country_name,continent,region,city,latitude,longitude,homepage_url,openalex_url,indexed_works_five_year,indexed_works_two_year,indexed_topic_count,representative_citations,representative_open_access_share,activity_score,breadth_score,momentum_score,citation_context_score,research_index_score,ranking_method_version,updated_at,${relation}`, { count: 'exact' })
        .eq('is_eligible', true)
        .limit(universityLimit)
      if (topic) query = query.eq('university_research_topic_metrics.topic_slug', topic)
      if (/^[A-Z]{2}$/.test(country)) query = query.eq('country_code', country)
      if (continent) query = query.eq('continent', continent)
      if (sort === 'activity') query = query.order('indexed_works_five_year', { ascending: false }).order('research_index_score', { ascending: false })
      else if (sort === 'momentum') query = query.order('momentum_score', { ascending: false }).order('indexed_works_two_year', { ascending: false })
      else if (sort === 'breadth') query = query.order('indexed_topic_count', { ascending: false }).order('indexed_works_five_year', { ascending: false })
      else if (sort === 'open-access') query = query.order('representative_open_access_share', { ascending: false, nullsFirst: false }).order('indexed_works_five_year', { ascending: false })
      else query = query.order('research_index_score', { ascending: false }).order('indexed_works_five_year', { ascending: false })
      const [{ data, error, count }, coverage, topicsResult, countriesResult, { data: sources, error: sourcesError }] = await Promise.all([
        query,
        supabase.rpc('get_university_index_coverage'),
        supabase.from('intelligence_topics').select('slug,name,sort_order').eq('enabled', true).order('sort_order'),
        supabase.from('university_research_institutions').select('country_code,country_name,continent').eq('is_eligible', true).order('country_name').limit(5000),
        sourcesPromise,
      ])
      for (const result of [coverage, topicsResult, countriesResult]) if (result.error) throw result.error
      if (error) throw error
      if (sourcesError) throw sourcesError
      const universities = data ?? []
      if (topic) universities.sort((left: any, right: any) => {
        const leftMetric = (left.university_research_topic_metrics ?? []).find((metric: any) => metric.topic_slug === topic)
        const rightMetric = (right.university_research_topic_metrics ?? []).find((metric: any) => metric.topic_slug === topic)
        return Number(rightMetric?.works_five_year ?? 0) - Number(leftMetric?.works_five_year ?? 0)
          || Number(rightMetric?.works_two_year ?? 0) - Number(leftMetric?.works_two_year ?? 0)
          || String(left.name).localeCompare(String(right.name))
      })
      const countryMap = new Map<string, { code: string; name: string; continent: string; universities: number }>()
      for (const row of countriesResult.data ?? []) {
        if (!row.country_code) continue
        const current = countryMap.get(row.country_code) ?? { code: row.country_code, name: row.country_name || row.country_code, continent: row.continent || 'Unspecified', universities: 0 }
        current.universities += 1
        countryMap.set(row.country_code, current)
      }
      return response(req, {
        generated_at: new Date().toISOString(),
        total_matching: count ?? 0,
        coverage: coverage.data ?? {},
        filters: { topic: topic || null, country: country || null, continent: continent || null, sort },
        topics: topicsResult.data ?? [],
        countries: [...countryMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
        universities,
        methodology: {
          label: 'Global University Research Index',
          source: 'OpenAlex affiliations resolved to ROR institutions',
          window: 'Works published from 2022 onward; recent momentum uses 2025 onward',
          score: '50% indexed activity, 20% topic breadth, 15% recent momentum, 15% citation context from representative works',
          limitations: 'The score measures activity in the configured longevity topics. It does not rate teaching, clinical care, study quality, safety, effectiveness, or institutional quality. Affiliation matching and citation data can be incomplete or incorrect.',
        },
        sources: (sources ?? []).filter((source: any) => source.id === 'openalex').map(publicSourceState),
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
      return response(req, { research: publicRecords(data, 'research_item_topics'), sources: (sources ?? []).map(publicSourceState) })
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
      return response(req, { trials: publicRecords(data, 'clinical_trial_topics'), sources: (sources ?? []).map(publicSourceState) })
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
      const regulatorQuery = supabase
        .from('global_resources')
        .select('id,name,resource_type,geographic_scope,jurisdiction_code,jurisdiction_name,region,authority_tier,description,limitations,homepage_url,data_url,terms_url,access_mode,reuse_status,integration_status,content_source_id,update_cadence,eligibility_reason,last_checked_at,last_healthy_at,last_status_code,consecutive_failures')
        .eq('is_eligible', true)
        .eq('resource_type', 'regulator')
        .order('authority_tier')
        .order('region')
        .order('name')
        .limit(100)
      const [{ data, error }, { data: regulators, error: regulatorsError }, { data: sources, error: sourcesError }] = await Promise.all([query, regulatorQuery, sourcesPromise])
      if (error) throw error
      if (regulatorsError) throw regulatorsError
      if (sourcesError) throw sourcesError
      const ingestionById = new Map((sources ?? []).map((source: any) => [source.id, source]))
      const regulatoryGuides = (regulators ?? []).map((resource: any) => publicResourceState(resource, resource.content_source_id ? ingestionById.get(resource.content_source_id) : undefined))
      return response(req, {
        generated_at: new Date().toISOString(),
        regulatory: data ?? [],
        regulatory_guides: regulatoryGuides,
        regulatory_coverage: {
          authorities: regulatoryGuides.length,
          jurisdictions: new Set(regulatoryGuides.map((item: any) => item.jurisdiction_code)).size,
          regions: new Set(regulatoryGuides.map((item: any) => item.region)).size,
        },
        sources: (sources ?? []).map(publicSourceState),
      })
    }

    if (view === 'timeline') {
      if (!topic) return response(req, { error: 'Topic is required' }, 400)
      const [{ data: events, error }, { data: topicRow, error: topicError }, { data: sources, error: sourcesError }] = await Promise.all([
        supabase.from('intelligence_change_events')
          .select('id,event_type,importance,record_type,record_id,title,source_url,occurred_at,topic_slugs,metadata')
          .neq('event_type', 'quality_state_changed').contains('topic_slugs', [topic]).order('occurred_at', { ascending: false }).limit(limit),
        supabase.from('intelligence_topics').select('slug,name,description').eq('slug', topic).eq('enabled', true).maybeSingle(),
        sourcesPromise,
      ])
      if (error) throw error
      if (topicError) throw topicError
      if (sourcesError) throw sourcesError
      const related = new Map<string, number>()
      for (const event of events ?? []) for (const slug of event.topic_slugs ?? []) if (slug !== topic) related.set(slug, (related.get(slug) ?? 0) + 1)
      const relatedSlugs = [...related.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      let relatedTopics: any[] = []
      if (relatedSlugs.length) {
        const result = await supabase.from('intelligence_topics').select('slug,name,description').in('slug', relatedSlugs.map(([slug]) => slug))
        if (result.error) throw result.error
        const bySlug = new Map((result.data ?? []).map((item: any) => [item.slug, item]))
        relatedTopics = relatedSlugs.map(([slug, shared_events]) => ({ ...bySlug.get(slug), shared_events })).filter((item: any) => item.slug)
      }
      return response(req, { generated_at: new Date().toISOString(), topic: topicRow, events: events ?? [], related_topics: relatedTopics, sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'graph') {
      const [topicsResult, researchLinks, trialLinks, regulatoryResult, integrityResult, universityLinks, sourcesResult] = await Promise.all([
        supabase.rpc('get_intelligence_topic_counts'),
        supabase.from('research_item_topics').select('research_item_id,topic_slug,matched_fields,research_items!inner(publication_state)').eq('is_published', true).eq('research_items.publication_state', 'published').limit(5000),
        supabase.from('clinical_trial_topics').select('clinical_trial_id,topic_slug,matched_fields,clinical_trials!inner(publication_state)').eq('is_published', true).eq('clinical_trials.publication_state', 'published').limit(5000),
        supabase.from('regulatory_events').select('matched_topics').eq('publication_state', 'published').limit(1000),
        supabase.from('research_integrity_events').select('research_items(research_item_topics(topic_slug,is_published))').eq('publication_state', 'published').limit(1000),
        supabase.from('university_research_topic_metrics').select('topic_slug,works_five_year').gt('works_five_year', 0).limit(5000),
        sourcesPromise,
      ])
      for (const result of [topicsResult, researchLinks, trialLinks, regulatoryResult, integrityResult, universityLinks, sourcesResult]) if (result.error) throw result.error
      const topics = topicsResult.data ?? []
      const visibleResearchLinks = publicLinkRows(researchLinks.data)
      const visibleTrialLinks = publicLinkRows(trialLinks.data)
      const researchTopicCounts = new Map<string, number>()
      const trialTopicCounts = new Map<string, number>()
      const universityTopicCounts = new Map<string, number>()
      for (const row of visibleResearchLinks) researchTopicCounts.set(row.topic_slug, (researchTopicCounts.get(row.topic_slug) ?? 0) + 1)
      for (const row of visibleTrialLinks) trialTopicCounts.set(row.topic_slug, (trialTopicCounts.get(row.topic_slug) ?? 0) + 1)
      for (const row of universityLinks.data ?? []) universityTopicCounts.set(row.topic_slug, (universityTopicCounts.get(row.topic_slug) ?? 0) + Number(row.works_five_year ?? 0))
      const nodes = topics.map((item: any) => ({ id: `topic:${item.slug}`, slug: item.slug, label: item.name, kind: 'topic', weight: (researchTopicCounts.get(item.slug) ?? 0) + (trialTopicCounts.get(item.slug) ?? 0) }))
      nodes.push(
        { id: 'layer:research', label: 'Research', kind: 'evidence', weight: visibleResearchLinks.length },
        { id: 'layer:trials', label: 'Trials', kind: 'evidence', weight: visibleTrialLinks.length },
        { id: 'layer:regulatory', label: 'Regulatory', kind: 'evidence', weight: regulatoryResult.data?.length ?? 0 },
        { id: 'layer:integrity', label: 'Integrity', kind: 'evidence', weight: integrityResult.data?.length ?? 0 },
        { id: 'layer:universities', label: 'Universities', kind: 'university', weight: universityLinks.data?.length ?? 0 },
      )
      for (const [slug, label] of Object.entries(TOPIC_MECHANISMS)) nodes.push({ id: `mechanism:${slug}`, label, kind: 'mechanism', weight: 1, slug })
      const links: Array<{ source: string; target: string; kind: string; weight: number }> = []
      for (const item of topics) {
        links.push({ source: `topic:${item.slug}`, target: 'layer:research', kind: 'research', weight: researchTopicCounts.get(item.slug) ?? 0 })
        links.push({ source: `topic:${item.slug}`, target: 'layer:trials', kind: 'trial', weight: trialTopicCounts.get(item.slug) ?? 0 })
        links.push({ source: `topic:${item.slug}`, target: 'layer:universities', kind: 'university', weight: universityTopicCounts.get(item.slug) ?? 0 })
        if (TOPIC_MECHANISMS[item.slug]) links.push({ source: `topic:${item.slug}`, target: `mechanism:${item.slug}`, kind: 'mechanism', weight: 1 })
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
      for (const row of [...visibleResearchLinks.map((item: any) => ({ key: `r:${item.research_item_id}`, topic: item.topic_slug })), ...visibleTrialLinks.map((item: any) => ({ key: `t:${item.clinical_trial_id}`, topic: item.topic_slug }))]) {
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
      research: publicRecords(researchResult.data, 'research_item_topics'),
      trials: publicRecords(trialsResult.data, 'clinical_trial_topics'),
      medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.',
    })
  } catch (error) {
    console.error('public-intelligence error:', error instanceof Error ? error.message : String(error))
    return response(req, { error: 'content_unavailable' }, 500)
  }
})
