import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText, researchEvidenceSnapshot, trialEvidenceSnapshot } from '../_shared/intelligence.ts'
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
    // is_published is a denormalized convenience flag. Enforce the actual
    // public threshold here as defense in depth so a stale or legacy flag can
    // never expose a zero-scored topic relation.
    if (Number(relation?.relevance_score ?? 0) < 60) return false
    if (!STRICT_TITLE_CONTEXT_TOPICS.has(relation?.topic_slug)) return true
    const fields = Array.isArray(relation?.matched_fields) ? relation.matched_fields : []
    return fields.includes('title') && fields.includes('title context')
  })
}

function publicRecords(rows: any[] | null, field: string): any[] {
  return (rows ?? []).map((record: any) => ({ ...record, [field]: publicRelations(record, field) })).filter((record: any) => record[field].length > 0)
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

function publicSearchTerm(value: string | null): string {
  return cleanText(value ?? '', 160).replace(/[,%().:*]/g, ' ').replace(/\s+/g, ' ').trim()
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
  const signalSlug = cleanText(url.searchParams.get('slug') ?? '', 180)
  const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '24', 10)
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 24
  const parsedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10)
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0

  if (topic && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)) {
    return response(req, { error: 'Invalid topic' }, 400)
  }
  if (signalSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(signalSlug)) {
    return response(req, { error: 'Invalid Signal slug' }, 400)
  }

  try {
    const sourcesPromise = supabase
      .from('content_sources')
      .select('id,name,kind,homepage_url,update_cadence,last_success_at,consecutive_failures')
      .eq('enabled', true)
      .eq('public_display_allowed', true)
      .order('name')

    if (view === 'signals') {
      const fields = 'slug,story_kind,topic_slug,period_start,period_end,title,dek,question,summary,payload,generated_at,updated_at,automation_disclosure,intelligence_topics(name,description,domain_slug,domain_name)'
      if (!signalSlug) {
        const { data, error } = await supabase.from('signal_stories')
          .select(fields).eq('publication_state', 'published')
          .order('period_end', { ascending: false }).order('updated_at', { ascending: false }).limit(limit)
        if (error) throw error
        return response(req, { generated_at: new Date().toISOString(), stories: data ?? [] })
      }
      const { data: story, error } = await supabase.from('signal_stories')
        .select(fields).eq('slug', signalSlug).eq('publication_state', 'published').maybeSingle()
      if (error) throw error
      if (!story) return response(req, { error: 'Signal not found' }, 404)
      const ids = Array.isArray(story.payload?.event_ids)
        ? story.payload.event_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isSafeInteger(value) && value > 0).slice(0, 12)
        : []
      let events: any[] = []
      if (ids.length) {
        const result = await supabase.from('intelligence_change_events')
          .select('id,event_type,importance,record_type,record_id,title,source_url,occurred_at,topic_slugs,metadata')
          .in('id', ids).neq('event_type', 'quality_state_changed')
          .order('importance', { ascending: true }).order('occurred_at', { ascending: false })
        if (result.error) throw result.error
        events = result.data ?? []
      }
      return response(req, { generated_at: new Date().toISOString(), story, events })
    }

    if (view === 'quality') {
      const { data: telemetry, error } = await supabase.rpc('get_intelligence_quality_telemetry')
      if (error) throw error
      return response(req, {
        telemetry: {
          research: telemetry?.research ?? {},
          trials: telemetry?.trials ?? {},
        },
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
          countries: (countryDirectory ?? []).length,
          regions: Object.keys(countBy('region')).length,
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
      const search = publicSearchTerm(url.searchParams.get('q'))
      const universityLimit = Math.min(Math.max(parsedLimit || 100, 1), 500)
      const institutionFields = 'openalex_id,slug,name,ror_id,country_code,country_name,continent,region,city,latitude,longitude,homepage_url,openalex_url,indexed_works_all_time,indexed_works_five_year,indexed_works_two_year,indexed_topic_count,representative_citations,representative_open_access_share,activity_score,breadth_score,momentum_score,citation_context_score,research_index_score,ranking_method_version,updated_at'

      // Start topic-filtered requests from the selective metrics table. The
      // previous reverse embedded join started with every eligible institution,
      // calculated an exact joined count, and only then applied the topic. At
      // global scale that regularly approached the proxy deadline. This shape
      // uses university_topic_rank_idx directly and also returns the genuinely
      // strongest topic institutions, rather than sorting a general top-100
      // sample in JavaScript after retrieval. Empty metric placeholders are
      // never reader-visible, and all-history activity remains useful while
      // the more recent rolling windows are still being assembled.
      let directoryQuery: any
      if (topic) {
        directoryQuery = supabase.from('university_research_topic_metrics')
          .select(`topic_slug,works_all_time,works_five_year,works_two_year,representative_citations,representative_open_access_count,representative_work_count,university_research_institutions!inner(${institutionFields})`, { count: 'exact' })
          .eq('topic_slug', topic)
          .gt('works_all_time', 0)
          .eq('university_research_institutions.is_eligible', true)
          .range(offset, offset + universityLimit - 1)
        if (/^[A-Z]{2}$/.test(country)) directoryQuery = directoryQuery.eq('university_research_institutions.country_code', country)
        if (continent === 'unavailable') directoryQuery = directoryQuery.is('university_research_institutions.continent', null)
        else if (continent) directoryQuery = directoryQuery.eq('university_research_institutions.continent', continent)
        if (search) directoryQuery = directoryQuery.or(`name.ilike.%${search}%,city.ilike.%${search}%,country_name.ilike.%${search}%`, { referencedTable: 'university_research_institutions' })
        directoryQuery = directoryQuery
          .order('works_all_time', { ascending: false })
          .order('works_five_year', { ascending: false })
          .order('works_two_year', { ascending: false })
          .order('openalex_id')
      } else {
        const filteredDirectory = Boolean(search || continent || /^[A-Z]{2}$/.test(country))
        directoryQuery = supabase.from('university_research_institutions')
          .select(institutionFields, { count: filteredDirectory ? 'exact' : 'planned' })
          .eq('is_eligible', true)
          .range(offset, offset + universityLimit - 1)
        if (/^[A-Z]{2}$/.test(country)) directoryQuery = directoryQuery.eq('country_code', country)
        if (continent === 'unavailable') directoryQuery = directoryQuery.is('continent', null)
        else if (continent) directoryQuery = directoryQuery.eq('continent', continent)
        if (search) directoryQuery = directoryQuery.or(`name.ilike.%${search}%,city.ilike.%${search}%,country_name.ilike.%${search}%`)
        if (sort === 'activity') directoryQuery = directoryQuery.order('indexed_works_five_year', { ascending: false }).order('research_index_score', { ascending: false })
        else if (sort === 'momentum') directoryQuery = directoryQuery.order('momentum_score', { ascending: false }).order('indexed_works_two_year', { ascending: false })
        else if (sort === 'breadth') directoryQuery = directoryQuery.order('indexed_topic_count', { ascending: false }).order('indexed_works_five_year', { ascending: false })
        else if (sort === 'open-access') directoryQuery = directoryQuery.order('representative_open_access_share', { ascending: false, nullsFirst: false }).order('indexed_works_five_year', { ascending: false })
        else directoryQuery = directoryQuery.order('research_index_score', { ascending: false }).order('indexed_works_five_year', { ascending: false })
      }
      const [{ data: directoryData, error, count }, coverage, topicsResult, { data: sources, error: sourcesError }] = await Promise.all([
        directoryQuery,
        supabase.rpc('get_university_index_coverage'),
        supabase.from('intelligence_topics').select('slug,name,sort_order,domain_slug,domain_name,domain_sort').eq('enabled', true).order('sort_order'),
        sourcesPromise,
      ])
      for (const result of [coverage, topicsResult]) if (result.error) throw result.error
      if (error) throw error
      if (sourcesError) throw sourcesError
      const universities = topic
        ? (directoryData ?? []).map((metric: any) => {
          const institution = Array.isArray(metric.university_research_institutions)
            ? metric.university_research_institutions[0]
            : metric.university_research_institutions
          const { university_research_institutions: _institution, ...topicMetric } = metric
          return { ...(institution ?? {}), university_research_topic_metrics: [topicMetric] }
        }).filter((institution: any) => institution.openalex_id)
        : (directoryData ?? [])
      const countryDirectory = Array.isArray(coverage.data?.country_directory) ? coverage.data.country_directory : []
      const hasDirectoryFilters = Boolean(topic || search || continent || /^[A-Z]{2}$/.test(country))
      return response(req, {
        generated_at: new Date().toISOString(),
        // Filtered requests use indexed exact counts so a number clicked from
        // a dossier or region card always matches the destination result set.
        // The global directory retains the cached coverage total for speed.
        total_matching: hasDirectoryFilters ? Number(count ?? 0) : Number(coverage.data?.universities ?? count ?? 0),
        offset,
        next_offset: offset + universities.length < Number(hasDirectoryFilters ? count ?? 0 : coverage.data?.universities ?? count ?? 0) ? offset + universities.length : null,
        coverage: coverage.data ?? {},
        filters: { topic: topic || null, country: country || null, continent: continent || null, search: search || null, sort },
        topics: topicsResult.data ?? [],
        countries: countryDirectory,
        universities,
        methodology: {
          label: 'Global University Research Index',
          source: 'OpenAlex institutions and affiliations; ROR identifiers are shown where available',
          window: 'All available publication history is retained; activity and momentum use rolling five-year and two-year windows',
          score: '50% unique-work activity, 20% coverage across every enabled topic, 15% recent momentum, 15% citation context across all linked works',
          limitations: 'The score measures activity in configured longevity topics. It does not rate teaching, clinical care, study quality, safety, effectiveness, or institutional quality. OpenAlex affiliation and citation data can be incomplete or incorrect.',
        },
        sources: (sources ?? []).filter((source: any) => source.id === 'openalex').map(publicSourceState),
      })
    }

    if (view === 'funding') {
      const country = cleanText(url.searchParams.get('country') ?? '', 2).toUpperCase()
      const funder = cleanText(url.searchParams.get('funder') ?? '', 120)
      const institution = cleanText(url.searchParams.get('institution') ?? '', 120)
      const sort = cleanText(url.searchParams.get('sort') ?? 'recent', 24)
      const search = publicSearchTerm(url.searchParams.get('q'))
      const safeCountry = /^[A-Z]{2}$/.test(country) ? country : ''
      const safeInstitution = institution && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(institution) ? institution : ''
      const [awardResult, directGrantResult, overviewResult, syncResult, directSyncResult, { data: sources, error: sourcesError }] = await Promise.all([
        supabase.rpc('get_funding_award_page', {
          p_topic: topic, p_country: safeCountry, p_funder: funder,
          p_institution: safeInstitution, p_search: search,
          p_sort: ['recent', 'oldest', 'funder'].includes(sort) ? sort : 'recent',
          p_offset: offset, p_limit: limit,
        }),
        supabase.rpc('get_direct_grant_page', {
          p_topic: topic, p_country: safeCountry, p_search: search,
          p_offset: 0, p_limit: Math.min(limit, 24),
        }),
        supabase.rpc('get_funding_radar_overview'),
        supabase.from('funding_radar_sync_state').select('processed_work_count,linked_award_count,completed_cycles,last_completed_at,last_error,updated_at').eq('id', true).maybeSingle(),
        supabase.from('funding_grant_sync_state').select('source_id,records_scanned,grants_retained,completed_cycles,last_completed_at,last_success_at,last_error,updated_at').order('source_id'),
        sourcesPromise,
      ])
      if (awardResult.error) throw awardResult.error
      if (directGrantResult.error) throw directGrantResult.error
      if (overviewResult.error) throw overviewResult.error
      if (syncResult.error) throw syncResult.error
      if (directSyncResult.error) throw directSyncResult.error
      if (sourcesError) throw sourcesError
      const awards = awardResult.data?.records ?? []
      const count = Number(awardResult.data?.total_matching ?? 0)
      const directGrantTotal = Number(directGrantResult.data?.total_matching ?? 0)
      const cachedOverview = overviewResult.data ?? {}
      const overview = {
        ...cachedOverview,
        summary: { ...(cachedOverview.summary ?? {}), awards: count, direct_grants: directGrantTotal },
      }
      return response(req, {
        generated_at: new Date().toISOString(),
        total_matching: count,
        offset,
        next_offset: offset + awards.length < count ? offset + awards.length : null,
        filters: { topic: topic || null, country: country || null, funder: funder || null, institution: institution || null, search: search || null, sort },
        overview,
        coverage_status: {
          historical_cycle_complete: Number(syncResult.data?.completed_cycles ?? 0) > 0,
          completed_cycles: Number(syncResult.data?.completed_cycles ?? 0),
          processed_work_count: Number(syncResult.data?.processed_work_count ?? 0),
          last_completed_at: syncResult.data?.last_completed_at ?? null,
          updated_at: syncResult.data?.updated_at ?? null,
          direct_grant_sources: directSyncResult.data ?? [],
        },
        direct_grants: directGrantResult.data?.records ?? [],
        direct_grant_total_matching: directGrantTotal,
        direct_grants_by_source: directGrantResult.data?.by_source ?? [],
        awards,
        sources: (sources ?? []).filter((source: any) => ['openalex', 'nih-reporter', 'cordis'].includes(source.id)).map(publicSourceState),
        scope_notice: 'Direct grant records from NIH RePORTER and CORDIS are shown separately from publication-linked OpenAlex funding acknowledgements. Amounts are source-reported award or contribution values, not total research spending or measures of scientific impact.',
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

    if (view === 'topic-evidence') {
      if (!topic) return response(req, { error: 'Topic is required' }, 400)
      const [{ data: snapshot, error }, { data: sources, error: sourcesError }] = await Promise.all([
        supabase.rpc('get_topic_evidence_snapshot', { requested_topic: topic }),
        sourcesPromise,
      ])
      if (error) throw error
      if (sourcesError) throw sourcesError
      return response(req, { topic, evidence: snapshot ?? {}, sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'topic-funding-seo') {
      if (!topic) return response(req, { error: 'Topic is required' }, 400)
      const [topicResult, fundingResult, countResult] = await Promise.all([
        supabase.from('intelligence_topics')
          .select('slug,name,description,updated_at').eq('slug', topic).eq('enabled', true).maybeSingle(),
        supabase.from('topic_funding_dossier_cache')
          .select('dossier,refreshed_at,content_updated_at').eq('topic_slug', topic).maybeSingle(),
        supabase.from('intelligence_topic_counts_cache')
          .select('research_count,trial_count,refreshed_at,content_updated_at').eq('topic_slug', topic).maybeSingle(),
      ])
      for (const result of [topicResult, fundingResult, countResult]) if (result.error) throw result.error
      if (!topicResult.data) return response(req, { error: 'Topic not found' }, 404)
      const timestamps = [
        topicResult.data.updated_at,
        fundingResult.data?.content_updated_at ?? fundingResult.data?.refreshed_at,
        countResult.data?.content_updated_at ?? countResult.data?.refreshed_at,
      ].filter(Boolean).map((value) => new Date(String(value))).filter((value) => !Number.isNaN(value.getTime()))
      const modifiedAt = timestamps.length ? new Date(Math.max(...timestamps.map((value) => value.getTime()))).toISOString() : null
      return response(req, {
        topic: topicResult.data,
        funding: fundingResult.data ? { ...(fundingResult.data.dossier ?? {}), refreshed_at: fundingResult.data.refreshed_at } : { summary: {} },
        counts: countResult.data ?? { research_count: 0, trial_count: 0 },
        modified_at: modifiedAt,
      })
    }

    if (view === 'topic-dossier') {
      if (!topic) return response(req, { error: 'Topic is required' }, 400)
      const dossierStage = async (stage: string, operation: PromiseLike<any>) => {
        const result = await operation
        if (result?.error) throw { ...result.error, stage }
        return result
      }
      const sixWeeksAgo = new Date(Date.now() - 42 * 86400000).toISOString()
      const twelveWeeksAgo = new Date(Date.now() - 84 * 86400000).toISOString()
      const researchFields = 'id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,evidence_snapshot,source_url,is_open_access,cited_by_count,editorial_summary,status,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name)'
      const trialRelation = 'clinical_trial_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
      const [researchResult, trialResult, topicResult, evidenceResult, overviewResult, timelineResult, timelinePulseResult, sourcesResult, pilotResult, fundingResult, fundingAwardCountResult, directGrantCountResult, universityCountResult] = await Promise.all([
        // Start at the selective topic-link index. Beginning with the entire
        // research table and asking PostgREST for an embedded inner relation
        // caused rare topics to scan the growing global corpus before finding
        // twelve matches.
        dossierStage('recent-research', supabase.from('research_item_topics')
          .select(`topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug),research_items!inner(${researchFields})`)
          .eq('topic_slug', topic).eq('is_published', true).eq('research_items.publication_state', 'published')
          .order('published_on', { referencedTable: 'research_items', ascending: false, nullsFirst: false })
          .order('id', { referencedTable: 'research_items', ascending: false }).limit(12)),
        dossierStage('recent-trials', supabase.from('clinical_trials')
          .select(`id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,evidence_snapshot,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),${trialRelation}`)
          .eq('publication_state', 'published').eq('clinical_trial_topics.topic_slug', topic).eq('clinical_trial_topics.is_published', true)
          .order('last_update_date', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(12)),
        dossierStage('topic', supabase.from('intelligence_topics').select('slug,name,description,domain_slug,domain_name,domain_description').eq('slug', topic).eq('enabled', true).maybeSingle()),
        dossierStage('evidence', supabase.rpc('get_topic_evidence_snapshot', { requested_topic: topic })),
        dossierStage('overview', supabase.rpc('get_topic_reader_overview', { requested_topic: topic })),
        dossierStage('timeline', supabase.from('intelligence_change_events')
          .select('id,event_type,importance,record_type,record_id,title,source_url,occurred_at,topic_slugs,metadata', { count: 'planned' })
          .neq('event_type', 'quality_state_changed').contains('topic_slugs', [topic]).gte('occurred_at', sixWeeksAgo).order('occurred_at', { ascending: false }).limit(250)),
        dossierStage('timeline-pulse', supabase.from('intelligence_change_events')
          .select('event_type,record_type,occurred_at', { count: 'planned' })
          .neq('event_type', 'quality_state_changed').contains('topic_slugs', [topic]).gte('occurred_at', twelveWeeksAgo).order('occurred_at', { ascending: false }).limit(2000)),
        dossierStage('sources', sourcesPromise),
        dossierStage('interpretation', supabase.rpc('get_topic_dossier_pilot', { requested_topic: topic })),
        dossierStage('funding', supabase.rpc('get_topic_funding_dossier', { requested_topic: topic })),
        dossierStage('funding-award-count', supabase.rpc('get_funding_award_page', {
          p_topic: topic, p_country: '', p_funder: '', p_institution: '', p_search: '', p_sort: 'recent', p_offset: 0, p_limit: 1,
        })),
        dossierStage('direct-grant-count', supabase.rpc('get_direct_grant_page', {
          p_topic: topic, p_country: '', p_search: '', p_offset: 0, p_limit: 1,
        })),
        dossierStage('university-count', supabase.from('university_research_topic_metrics')
          .select('openalex_id,university_research_institutions!inner(is_eligible)', { count: 'exact', head: true })
          .eq('topic_slug', topic).gt('works_all_time', 0).eq('university_research_institutions.is_eligible', true)),
      ])
      for (const result of [researchResult, trialResult, topicResult, evidenceResult, overviewResult, timelineResult, timelinePulseResult, sourcesResult, pilotResult, fundingResult, fundingAwardCountResult, directGrantCountResult, universityCountResult]) if (result.error) throw result.error

      const related = new Map<string, number>()
      for (const event of timelineResult.data ?? []) for (const slug of event.topic_slugs ?? []) if (slug !== topic) related.set(slug, (related.get(slug) ?? 0) + 1)
      const relatedSlugs = [...related.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6)
      let relatedTopics: any[] = []
      if (relatedSlugs.length) {
        const result = await supabase.from('intelligence_topics').select('slug,name,description,domain_slug,domain_name').in('slug', relatedSlugs.map(([slug]) => slug))
        if (result.error) throw result.error
        const bySlug = new Map((result.data ?? []).map((item: any) => [item.slug, item]))
        relatedTopics = relatedSlugs.map(([slug, shared_events]) => ({ ...bySlug.get(slug), shared_events })).filter((item: any) => item.slug)
      }

      const researchRows = (researchResult.data ?? []).map((relation: any) => {
        const item = Array.isArray(relation.research_items) ? relation.research_items[0] : relation.research_items
        const { research_items: _item, ...topicRelation } = relation
        return { ...(item ?? {}), research_item_topics: [topicRelation] }
      }).filter((record: any) => record.id)
      const research = publicRecords(researchRows, 'research_item_topics').map((record: any) => ({
        ...record,
        evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : researchEvidenceSnapshot(record),
      }))
      const trials = publicRecords(trialResult.data, 'clinical_trial_topics').map((record: any) => ({
        ...record,
        evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : trialEvidenceSnapshot(record),
      }))
      const pulseEvents = timelinePulseResult.data ?? []
      const currentPulse = pulseEvents.filter((event: any) => String(event.occurred_at) >= sixWeeksAgo)
      const previousPulse = pulseEvents.filter((event: any) => String(event.occurred_at) < sixWeeksAgo)
      const pulseCounts = (events: any[]) => events.reduce((counts: Record<string, number>, event: any) => {
        const key = String(event.record_type || 'other')
        counts[key] = (counts[key] ?? 0) + 1
        return counts
      }, {})
      let universityConnections: any = { topics: [], universities: [] }
      const leadingSlugs = (overviewResult.data?.universities ?? []).slice(0, 5).map((university: any) => university.slug).filter(Boolean)
      if (leadingSlugs.length) {
        const connectionsResult = await supabase.from('university_research_institutions')
          .select('slug,name,university_research_topic_metrics(topic_slug,works_five_year,works_two_year,intelligence_topics(name))')
          .in('slug', leadingSlugs).eq('is_eligible', true)
        if (connectionsResult.error) throw connectionsResult.error
        const institutions = (connectionsResult.data ?? []).sort((left: any, right: any) => leadingSlugs.indexOf(left.slug) - leadingSlugs.indexOf(right.slug))
        const topicTotals = new Map<string, { slug: string; name: string; total: number }>()
        for (const institution of institutions) for (const metric of institution.university_research_topic_metrics ?? []) {
          if (!metric.topic_slug || metric.topic_slug === topic) continue
          const amount = Math.max(0, Number(metric.works_five_year) || 0)
          if (!amount) continue
          const current = topicTotals.get(metric.topic_slug) ?? { slug: metric.topic_slug, name: metric.intelligence_topics?.name || String(metric.topic_slug).replace(/-/g, ' '), total: 0 }
          current.total += amount
          topicTotals.set(metric.topic_slug, current)
        }
        const connectionTopics = [...topicTotals.values()].sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)).slice(0, 5)
        universityConnections = {
          topics: connectionTopics,
          universities: institutions.map((institution: any) => ({
            slug: institution.slug,
            name: institution.name,
            values: Object.fromEntries(connectionTopics.map((connectionTopic) => {
              const metric = (institution.university_research_topic_metrics ?? []).find((item: any) => item.topic_slug === connectionTopic.slug)
              return [connectionTopic.slug, Math.max(0, Number(metric?.works_five_year) || 0)]
            })),
          })),
        }
      }
      const cachedFunding = fundingResult.data ?? {
        summary: {}, reported_amounts: [], direct_funders: [], acknowledgement_funders: [],
        universities: [], acknowledgement_countries: [], direct_countries: [],
        acknowledgement_years: [], direct_grant_years: [], recent_direct_grants: [],
        recent_awards: [], related_topics: [], direct_sources: [],
      }
      const funding = {
        ...cachedFunding,
        summary: {
          ...(cachedFunding.summary ?? {}),
          award_entities: Number(fundingAwardCountResult.data?.total_matching ?? cachedFunding.summary?.award_entities ?? 0),
          direct_grants: Number(directGrantCountResult.data?.total_matching ?? cachedFunding.summary?.direct_grants ?? 0),
        },
      }
      return response(req, {
        generated_at: new Date().toISOString(),
        research,
        trials,
        evidence: evidenceResult.data ?? {},
        overview: { ...(overviewResult.data ?? {}), university_total: universityCountResult.count ?? 0, university_connections: universityConnections },
        timeline: {
          topic: topicResult.data,
          events: timelineResult.data ?? [],
          total_matching: timelineResult.count ?? (timelineResult.data ?? []).length,
          window_days: 42,
          related_topics: relatedTopics,
          pulse: {
            current_total: currentPulse.length,
            previous_total: previousPulse.length,
            current_by_record_type: pulseCounts(currentPulse),
            previous_by_record_type: pulseCounts(previousPulse),
            complete: Number(timelinePulseResult.count ?? pulseEvents.length) === pulseEvents.length,
            baseline_ready: previousPulse.length > 0,
          },
        },
        pilot: pilotResult.data ?? null,
        funding,
        sources: (sourcesResult.data ?? []).map(publicSourceState),
      })
    }

    if (view === 'trial-results-gap') {
      const gapSearch = publicSearchTerm(url.searchParams.get('q'))
      // Read the completed cohort in bounded database pages, then classify it
      // in one cached public response. This avoids one database request per
      // visitor-visible card and keeps the monitor complete as history grows.
      const completedRows: any[] = []
      const pageSize = 1000
      for (let page = 0; ; page += 1) {
        const start = page * pageSize
        const { data, error } = await supabase
          .from('clinical_trials')
          .select('id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,evidence_snapshot,metadata,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),clinical_trial_topics(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))')
          .eq('publication_state', 'published')
          .eq('overall_status', 'Completed')
          .eq('clinical_trial_topics.is_published', true)
          .order('completion_date', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(start, start + pageSize - 1)
        if (error) throw error
        completedRows.push(...(data ?? []))
        if ((data?.length ?? 0) < pageSize) break
      }

      const today = new Date()
      const dayMs = 24 * 60 * 60 * 1000
      const classified = publicRecords(completedRows, 'clinical_trial_topics').map((record: any) => {
        const hasResults = record?.metadata?.source_has_results === true || record?.metadata?.source_has_results === 'true'
        const completion = record.completion_date ? new Date(`${record.completion_date}T00:00:00Z`) : null
        const validCompletion = completion && !Number.isNaN(completion.getTime()) && completion.getTime() <= today.getTime()
        const daysSinceCompletion = validCompletion ? Math.max(0, Math.floor((today.getTime() - completion.getTime()) / dayMs)) : null
        const resultState = hasResults
          ? 'results-posted'
          : daysSinceCompletion == null
            ? 'date-unavailable'
            : daysSinceCompletion > 365
              ? 'possible-gap'
              : 'within-window'
        const { metadata: _privateMetadata, ...publicRecord } = record
        return {
          ...publicRecord,
          has_results: hasResults,
          result_state: resultState,
          days_since_completion: daysSinceCompletion,
          gap_days: resultState === 'possible-gap' ? daysSinceCompletion - 365 : 0,
        }
      })

      let visibleClassified = topic
        ? classified.filter((record: any) => record.clinical_trial_topics.some((relation: any) => relation.topic_slug === topic))
        : classified
      if (gapSearch) {
        const needle = gapSearch.toLocaleLowerCase()
        visibleClassified = visibleClassified.filter((record: any) => [record.title, record.sponsor, record.external_id]
          .some((value) => String(value || '').toLocaleLowerCase().includes(needle)))
      }
      const countState = (state: string) => visibleClassified.filter((record: any) => record.result_state === state).length
      const yearMap = new Map<number, { year: number; completed: number; results_posted: number; possible_gaps: number; within_window: number }>()
      for (const record of visibleClassified) {
        if (!record.completion_date || record.days_since_completion == null) continue
        const year = Number(String(record.completion_date).slice(0, 4))
        if (!Number.isFinite(year)) continue
        const cohort = yearMap.get(year) ?? { year, completed: 0, results_posted: 0, possible_gaps: 0, within_window: 0 }
        cohort.completed += 1
        if (record.result_state === 'results-posted') cohort.results_posted += 1
        if (record.result_state === 'possible-gap') cohort.possible_gaps += 1
        if (record.result_state === 'within-window') cohort.within_window += 1
        yearMap.set(year, cohort)
      }
      const resultsPosted = countState('results-posted')
      const { data: sources, error: sourcesError } = await sourcesPromise
      if (sourcesError) throw sourcesError
      return response(req, {
        generated_at: new Date().toISOString(),
        definition: {
          threshold_days: 365,
          cohort: 'Published longevity trial registrations with registry status Completed and at least one eligible public topic match.',
          possible_gap: 'No structured results are visible in the indexed registry record more than 365 days after its listed completion date.',
          filter: { topic: topic || null, search: gapSearch || null },
        },
        summary: {
          completed_trials: visibleClassified.length,
          results_posted: resultsPosted,
          possible_gaps: countState('possible-gap'),
          within_window: countState('within-window'),
          completion_date_unavailable: countState('date-unavailable'),
          results_coverage_percent: visibleClassified.length ? Math.round((resultsPosted / visibleClassified.length) * 1000) / 10 : 0,
          topics_represented: new Set(visibleClassified.flatMap((record: any) => record.clinical_trial_topics.map((relation: any) => relation.topic_slug))).size,
          oldest_gap_days: visibleClassified.reduce((maximum: number, record: any) => Math.max(maximum, Number(record.gap_days ?? 0)), 0),
        },
        cohorts: [...yearMap.values()].sort((left, right) => right.year - left.year),
        trials: visibleClassified.sort((left: any, right: any) => Number(right.gap_days ?? 0) - Number(left.gap_days ?? 0) || String(left.title).localeCompare(String(right.title))),
        sources: (sources ?? []).map(publicSourceState),
        interpretation_notice: 'A possible gap is an automated registry-transparency signal. It is not a finding of legal non-compliance, selective reporting, sponsor misconduct, or absence of results elsewhere.',
      })
    }

    if (view === 'research') {
      const search = publicSearchTerm(url.searchParams.get('q'))
      const evidence = cleanText(url.searchParams.get('evidence') ?? '', 40)
      const access = cleanText(url.searchParams.get('access') ?? '', 12)
      const publishedFromRaw = cleanText(url.searchParams.get('published_from') ?? '', 10)
      const publishedToRaw = cleanText(url.searchParams.get('published_to') ?? '', 10)
      const publishedFrom = /^\d{4}-\d{2}-\d{2}$/.test(publishedFromRaw) ? publishedFromRaw : ''
      const publishedTo = /^\d{4}-\d{2}-\d{2}$/.test(publishedToRaw) ? publishedToRaw : ''
      const countMode = search || evidence || access || publishedFrom || publishedTo || topic ? 'exact' : 'planned'
      // Only use an inner relationship when a topic filter needs it. An inner
      // join across every topic relation made the unfiltered global index and
      // its exact count increasingly expensive as historical coverage grew.
      const topicRelation = topic
        ? 'research_item_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
        : 'research_item_topics(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
      let query = supabase
        .from('research_items')
        // A planned count avoids a full-corpus count scan on every visitor
        // request while retaining uncapped cursor pagination through history.
        .select(`id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,evidence_snapshot,source_url,is_open_access,cited_by_count,editorial_summary,status,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),${topicRelation}`, { count: countMode })
        .eq('publication_state', 'published')
        .eq('research_item_topics.is_published', true)
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1)
      if (topic) query = query.eq('research_item_topics.topic_slug', topic).eq('research_item_topics.is_published', true)
      if (search) query = query.or(`title.ilike.%${search}%,authors.ilike.%${search}%,journal.ilike.%${search}%,doi.ilike.%${search}%`)
      if (evidence === 'human') query = query.in('evidence_level', ['human-synthesis', 'randomized-human', 'human-study'])
      else if (evidence) query = query.eq('evidence_level', evidence)
      if (access === 'open') query = query.eq('is_open_access', true)
      else if (access === 'restricted') query = query.eq('is_open_access', false)
      if (publishedFrom) query = query.gte('published_on', publishedFrom)
      if (publishedTo) query = query.lte('published_on', publishedTo)
      const [{ data, error, count }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      const research = publicRecords(data, 'research_item_topics').map((record: any) => ({
        ...record,
        evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : researchEvidenceSnapshot(record),
      }))
      const pageLength = data?.length ?? 0
      return response(req, { research, total_matching: count ?? pageLength, offset, next_offset: pageLength === limit && offset + pageLength < Number(count ?? 0) ? offset + pageLength : null, sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'trials') {
      const search = publicSearchTerm(url.searchParams.get('q'))
      const status = cleanText(url.searchParams.get('status') ?? '', 80)
      const phase = cleanText(url.searchParams.get('phase') ?? '', 80)
      const country = cleanText(url.searchParams.get('country') ?? '', 120)
      const results = cleanText(url.searchParams.get('results') ?? '', 20)
      const countMode = search || status || phase || country || results || topic ? 'exact' : 'planned'
      const topicRelation = 'clinical_trial_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))'
      let query = supabase
        .from('clinical_trials')
        .select(`id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,evidence_snapshot,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),${topicRelation}`, { count: countMode })
        .eq('publication_state', 'published')
        .eq('clinical_trial_topics.is_published', true)
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1)
      if (topic) query = query.eq('clinical_trial_topics.topic_slug', topic).eq('clinical_trial_topics.is_published', true)
      if (search) query = query.or(`title.ilike.%${search}%,sponsor.ilike.%${search}%,external_id.ilike.%${search}%`)
      if (status === 'active') query = query.in('overall_status', ['Recruiting', 'Not Yet Recruiting', 'Enrolling By Invitation', 'Active Not Recruiting'])
      else if (status) query = query.eq('overall_status', status)
      if (phase) query = query.contains('phases', [phase])
      if (country) query = query.contains('countries', [country])
      if (results === 'posted') query = query.eq('metadata->>source_has_results', 'true')
      const [{ data, error, count }, { data: sources, error: sourcesError }] = await Promise.all([query, sourcesPromise])
      if (error) throw error
      if (sourcesError) throw sourcesError
      const trials = publicRecords(data, 'clinical_trial_topics').map((record: any) => ({
        ...record,
        evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : trialEvidenceSnapshot(record),
      }))
      const pageLength = data?.length ?? 0
      return response(req, { trials, total_matching: count ?? pageLength, offset, next_offset: pageLength === limit && offset + pageLength < Number(count ?? 0) ? offset + pageLength : null, sources: (sources ?? []).map(publicSourceState) })
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
        supabase.from('intelligence_topics').select('slug,name,description,domain_slug,domain_name,domain_description').eq('slug', topic).eq('enabled', true).maybeSingle(),
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
        const result = await supabase.from('intelligence_topics').select('slug,name,description,domain_slug,domain_name').in('slug', relatedSlugs.map(([slug]) => slug))
        if (result.error) throw result.error
        const bySlug = new Map((result.data ?? []).map((item: any) => [item.slug, item]))
        relatedTopics = relatedSlugs.map(([slug, shared_events]) => ({ ...bySlug.get(slug), shared_events })).filter((item: any) => item.slug)
      }
      return response(req, { generated_at: new Date().toISOString(), topic: topicRow, events: events ?? [], related_topics: relatedTopics, sources: (sources ?? []).map(publicSourceState) })
    }

    if (view === 'graph') {
      const [topicsResult, overlapsResult, sourcesResult] = await Promise.all([
        supabase.rpc('get_intelligence_graph_counts'),
        supabase.rpc('get_intelligence_topic_overlap_counts'),
        sourcesPromise,
      ])
      for (const result of [topicsResult, overlapsResult, sourcesResult]) if (result.error) throw result.error
      const topics = topicsResult.data ?? []
      const nodes = topics.map((item: any) => ({ id: `topic:${item.slug}`, slug: item.slug, label: item.name, kind: 'topic', weight: Number(item.research_count ?? 0) + Number(item.trial_count ?? 0) }))
      nodes.push(
        { id: 'layer:research', label: 'Research', kind: 'evidence', weight: topics.reduce((sum: number, item: any) => sum + Number(item.research_count ?? 0), 0) },
        { id: 'layer:trials', label: 'Trials', kind: 'evidence', weight: topics.reduce((sum: number, item: any) => sum + Number(item.trial_count ?? 0), 0) },
        { id: 'layer:regulatory', label: 'Regulatory', kind: 'evidence', weight: topics.reduce((sum: number, item: any) => sum + Number(item.regulatory_count ?? 0), 0) },
        { id: 'layer:integrity', label: 'Integrity', kind: 'evidence', weight: topics.reduce((sum: number, item: any) => sum + Number(item.integrity_count ?? 0), 0) },
        { id: 'layer:universities', label: 'Universities', kind: 'university', weight: topics.reduce((sum: number, item: any) => sum + Number(item.university_work_count ?? 0), 0) },
      )
      for (const [slug, label] of Object.entries(TOPIC_MECHANISMS)) nodes.push({ id: `mechanism:${slug}`, label, kind: 'mechanism', weight: 1, slug })
      const links: Array<{ source: string; target: string; kind: string; weight: number }> = []
      for (const item of topics) {
        links.push({ source: `topic:${item.slug}`, target: 'layer:research', kind: 'research', weight: Number(item.research_count ?? 0) })
        links.push({ source: `topic:${item.slug}`, target: 'layer:trials', kind: 'trial', weight: Number(item.trial_count ?? 0) })
        links.push({ source: `topic:${item.slug}`, target: 'layer:universities', kind: 'university', weight: Number(item.university_work_count ?? 0) })
        links.push({ source: `topic:${item.slug}`, target: 'layer:regulatory', kind: 'regulatory', weight: Number(item.regulatory_count ?? 0) })
        links.push({ source: `topic:${item.slug}`, target: 'layer:integrity', kind: 'integrity', weight: Number(item.integrity_count ?? 0) })
        if (TOPIC_MECHANISMS[item.slug]) links.push({ source: `topic:${item.slug}`, target: `mechanism:${item.slug}`, kind: 'mechanism', weight: 1 })
      }

      for (const pair of overlapsResult.data ?? []) links.push({ source: `topic:${pair.left_slug}`, target: `topic:${pair.right_slug}`, kind: 'overlap', weight: Number(pair.overlap_count ?? 0) })
      const names = new Map(topics.map((item: any) => [item.slug, item.name]))
      const related = new Map<string, Array<{ slug: string; name: string; shared_records: number }>>()
      for (const pair of overlapsResult.data ?? []) {
        const count = Number(pair.overlap_count ?? 0)
        const left = related.get(pair.left_slug) ?? []
        const right = related.get(pair.right_slug) ?? []
        left.push({ slug: pair.right_slug, name: names.get(pair.right_slug) ?? pair.right_slug, shared_records: count })
        right.push({ slug: pair.left_slug, name: names.get(pair.left_slug) ?? pair.left_slug, shared_records: count })
        related.set(pair.left_slug, left)
        related.set(pair.right_slug, right)
      }
      const explorerTopics = topics.map((item: any) => {
        const researchCount = Number(item.research_count ?? 0)
        const trialCount = Number(item.trial_count ?? 0)
        const universityCount = Number(item.university_work_count ?? 0)
        const regulatoryCount = Number(item.regulatory_count ?? 0)
        const integrityCount = Number(item.integrity_count ?? 0)
        return {
          slug: item.slug,
          name: item.name,
          description: item.description,
          mechanism: TOPIC_MECHANISMS[item.slug] ?? null,
          research_count: researchCount,
          trial_count: trialCount,
          university_work_count: universityCount,
          regulatory_count: regulatoryCount,
          integrity_count: integrityCount,
          evidence_total: researchCount + trialCount + universityCount + regulatoryCount + integrityCount,
          related_topics: (related.get(item.slug) ?? []).sort((left, right) => right.shared_records - left.shared_records).slice(0, 4),
        }
      })
      return response(req, { generated_at: new Date().toISOString(), topics: explorerTopics, nodes, links, sources: (sourcesResult.data ?? []).map(publicSourceState) })
    }

    const [topicsResult, researchResult, trialsResult, sourcesResult, researchCount, trialsCount] = await Promise.all([
      supabase.rpc('get_intelligence_topic_counts'),
      supabase
        .from('research_items')
        .select('id,external_id,title,authors,journal,published_on,doi,publication_type,evidence_level,evidence_snapshot,source_url,is_open_access,cited_by_count,editorial_summary,status,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),research_item_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))')
        .eq('publication_state', 'published')
        .eq('research_item_topics.is_published', true)
        .order('published_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      supabase
        .from('clinical_trials')
        .select('id,external_id,title,overall_status,phases,study_type,sponsor,enrollment,countries,start_date,completion_date,last_update_date,evidence_snapshot,source_url,editorial_summary,relevance_confidence,source_quality_score,freshness_score,match_explanation,quality_checked_at,content_sources(name),clinical_trial_topics!inner(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug))')
        .eq('publication_state', 'published')
        .eq('clinical_trial_topics.is_published', true)
        .order('last_update_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(limit, 12)),
      sourcesPromise,
      // The landing-page totals are orientation figures, not a billing or
      // scientific audit. Planned counts avoid a full-table count across the
      // continuously growing corpus on every cold overview request.
      supabase.from('research_items').select('id', { count: 'planned', head: true }).eq('publication_state', 'published'),
      supabase.from('clinical_trials').select('id', { count: 'planned', head: true }).eq('publication_state', 'published'),
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
      research: publicRecords(researchResult.data, 'research_item_topics').map((record: any) => ({ ...record, evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : researchEvidenceSnapshot(record) })),
      trials: publicRecords(trialsResult.data, 'clinical_trial_topics').map((record: any) => ({ ...record, evidence_snapshot: record.evidence_snapshot && Object.keys(record.evidence_snapshot).length ? record.evidence_snapshot : trialEvidenceSnapshot(record) })),
      medical_notice: 'Research information only. Not medical advice, diagnosis, or treatment guidance.',
    })
  } catch (error) {
    const diagnostic = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 4).join(' | ') }
      : error && typeof error === 'object'
        ? Object.fromEntries(['stage', 'code', 'message', 'details', 'hint'].map((key) => [key, String((error as Record<string, unknown>)[key] ?? '')]).filter(([, value]) => value))
        : { message: String(error) }
    console.error(`public-intelligence error: ${JSON.stringify({ view, topic: topic || null, diagnostic })}`)
    return response(req, { error: 'content_unavailable' }, 500)
  }
})
