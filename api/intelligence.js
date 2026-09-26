'use strict';

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-intelligence';
const allowedParameters = new Set([
  'view', 'limit', 'offset', 'topic', 'q', 'country', 'continent', 'sort',
  'status', 'phase', 'region', 'quality_rules', 'directory_contract',
]);

async function fetchJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'immortal.life/1.0 research@immortal.life' }, signal: controller.signal });
    if (!result.ok) throw new Error(`source_${result.status}`);
    return result.json();
  } finally {
    clearTimeout(timeout);
  }
}

function evidenceLevel(types) {
  const value = String(types || '').toLowerCase();
  if (value.includes('systematic review') || value.includes('meta-analysis')) return 'human-synthesis';
  if (value.includes('randomized') || value.includes('randomised')) return 'randomized-human';
  if (value.includes('clinical trial')) return 'human-study';
  if (value.includes('preprint')) return 'preprint';
  return 'research-record';
}

async function researchFallback(query, limit) {
  const topicSlug = String(query.topic || '').trim();
  const topicName = topicSlug.replace(/-/g, ' ');
  const search = String(query.q || '').trim() || topicName || 'longevity OR healthspan OR geroscience OR "biological aging" OR "cellular senescence"';
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', `(${search}) sort_date:y`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(Math.min(Math.max(Number(limit) || 24, 1), 100)));
  const data = await fetchJson(url);
  const research = (data?.resultList?.result || []).filter((item) => item?.title && (item.id || item.pmid || item.doi)).map((item) => ({
    id: `source-${item.source || 'EPMC'}-${item.id || item.pmid || item.doi}`,
    external_id: item.id || item.pmid || item.doi,
    title: item.title,
    authors: item.authorString ? item.authorString.split(',').map((name) => name.trim()).filter(Boolean) : [],
    journal: item.journalTitle || null,
    published_on: item.firstPublicationDate || (item.pubYear ? `${item.pubYear}-01-01` : null),
    doi: item.doi || null,
    publication_type: item.pubType || null,
    evidence_level: evidenceLevel(item.pubType),
    source_url: `https://europepmc.org/article/${encodeURIComponent(item.source || 'MED')}/${encodeURIComponent(item.id || item.pmid || item.doi)}`,
    is_open_access: item.isOpenAccess === 'Y',
    cited_by_count: Number(item.citedByCount || 0),
    status: 'indexed', relevance_confidence: 0, source_quality_score: 0, freshness_score: 0,
    research_item_topics: topicSlug ? [{ topic_slug: topicSlug, is_published: true, intelligence_topics: { slug: topicSlug, name: topicName } }] : [], source_fallback: true,
  }));
  return { generated_at: new Date().toISOString(), total_matching: Number(data?.hitCount || research.length), next_offset: null, research, sources: [{ id: 'europe-pmc', name: 'Europe PMC', health: 'healthy', homepage_url: 'https://europepmc.org/' }] };
}

async function trialsFallback(query, limit) {
  const topicSlug = String(query.topic || '').trim();
  const topicName = topicSlug.replace(/-/g, ' ');
  const search = String(query.q || '').trim() || topicName || '(longevity OR healthspan OR geroscience OR "biological aging" OR "cellular senescence")';
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  url.searchParams.set('query.term', search);
  url.searchParams.set('pageSize', String(Math.min(Math.max(Number(limit) || 24, 1), 100)));
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url);
  const trials = (data?.studies || []).map((study) => {
    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const status = protocol.statusModule || {};
    const design = protocol.designModule || {};
    const sponsor = protocol.sponsorCollaboratorsModule || {};
    const locations = protocol.contactsLocationsModule?.locations || [];
    const nctId = identification.nctId;
    return {
      id: `source-${nctId}`, external_id: nctId, title: identification.briefTitle || identification.officialTitle,
      overall_status: status.overallStatus || 'UNKNOWN', phases: design.phases || [], study_type: design.studyType || null,
      sponsor: sponsor.leadSponsor?.name || null, enrollment: design.enrollmentInfo?.count ?? null,
      countries: [...new Set(locations.map((item) => item.country).filter(Boolean))],
      start_date: status.startDateStruct?.date || null, completion_date: status.completionDateStruct?.date || null,
      last_update_date: status.lastUpdatePostDateStruct?.date || null,
      source_url: `https://clinicaltrials.gov/study/${encodeURIComponent(nctId)}`,
      relevance_confidence: 0, source_quality_score: 0, freshness_score: 0,
      clinical_trial_topics: topicSlug ? [{ topic_slug: topicSlug, is_published: true, intelligence_topics: { slug: topicSlug, name: topicName } }] : [], source_fallback: true,
    };
  }).filter((trial) => trial.external_id && trial.title);
  return { generated_at: new Date().toISOString(), total_matching: Number(data?.totalCount || trials.length), next_offset: null, trials, sources: [{ id: 'clinicaltrials-gov', name: 'ClinicalTrials.gov', health: 'healthy', homepage_url: 'https://clinicaltrials.gov/' }] };
}

async function universitiesFallback(query, limit) {
  const search = String(query.q || query.topic || '').replace(/-/g, ' ').trim() || 'longevity OR healthspan OR geroscience OR "biological aging"';
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', search);
  url.searchParams.set('filter', 'from_publication_date:2021-01-01');
  url.searchParams.set('group_by', 'authorships.institutions.id');
  url.searchParams.set('per-page', String(Math.min(Math.max(Number(limit) || 24, 1), 100)));
  url.searchParams.set('mailto', 'research@immortal.life');
  const data = await fetchJson(url);
  const universities = (data?.group_by || []).filter((item) => item?.key && item?.key_display_name).map((item) => {
    const openalexId = String(item.key).split('/').pop();
    return {
      openalex_id: openalexId, slug: openalexId.toLowerCase(), name: item.key_display_name,
      country_code: null, country_name: null, continent: null, city: null,
      openalex_url: item.key, indexed_works_all_time: Number(item.count || 0), indexed_works_five_year: Number(item.count || 0),
      indexed_works_two_year: 0, indexed_topic_count: 1, momentum_score: 0, research_index_score: Number(item.count || 0),
      source_fallback: true,
    };
  });
  return {
    generated_at: new Date().toISOString(), total_matching: universities.length, next_offset: null, universities,
    coverage: { universities: universities.length, countries: 0, continents: 0, indexed_works_five_year: universities.reduce((sum, item) => sum + item.indexed_works_five_year, 0), last_updated_at: new Date().toISOString() },
    topics: [], countries: [], sources: [{ id: 'openalex', name: 'OpenAlex', health: 'healthy', homepage_url: 'https://openalex.org/' }],
  };
}

async function topicDossierFallback(query, limit) {
  const topic = String(query.topic || '').replace(/-/g, ' ').trim() || 'longevity';
  const scoped = { ...query, q: topic };
  const [researchResult, trialsResult] = await Promise.allSettled([
    researchFallback(scoped, limit),
    trialsFallback(scoped, limit),
  ]);
  const researchData = researchResult.status === 'fulfilled' ? researchResult.value : { research: [], sources: [] };
  const trialData = trialsResult.status === 'fulfilled' ? trialsResult.value : { trials: [], sources: [] };
  const research = researchData.research || [];
  const trials = trialData.trials || [];
  return {
    generated_at: new Date().toISOString(),
    research,
    trials,
    sources: [...(researchData.sources || []), ...(trialData.sources || [])],
    evidence: {
      research_total: Number(researchData.total_matching || research.length),
      trial_total: Number(trialData.total_matching || trials.length),
      recruiting_trials: trials.filter((trial) => /RECRUIT|ACTIVE/i.test(String(trial.overall_status || ''))).length,
      trials_with_results: 0,
      source_count: (researchData.sources || []).length + (trialData.sources || []).length,
      research_by_stage: research.reduce((counts, record) => {
        const stage = record.evidence_level || 'research-record';
        counts[stage] = Number(counts[stage] || 0) + 1;
        return counts;
      }, {}),
    },
    timeline: {
      events: [
        ...research.slice(0, 6).map((record) => ({ event_type: 'new research', title: record.title, occurred_at: record.published_on, source_url: record.source_url, source_fallback: true })),
        ...trials.slice(0, 6).map((record) => ({ event_type: 'registered trial', title: record.title, occurred_at: record.last_update_date || record.start_date, source_url: record.source_url, source_fallback: true })),
      ].filter((event) => event.title && event.source_url).sort((left, right) => String(right.occurred_at || '').localeCompare(String(left.occurred_at || ''))),
      related_topics: [],
    },
  };
}

async function sourceFallback(query) {
  const view = String(query.view || 'overview');
  const limit = query.limit;
  if (view === 'research') return researchFallback(query, limit);
  if (view === 'trials') return trialsFallback(query, limit);
  if (view === 'universities') return universitiesFallback(query, limit);
  if (view === 'topic-dossier') return topicDossierFallback(query, limit);
  if (view === 'regulatory') return { regulatory: [], regulatory_guides: [], regulatory_coverage: {}, sources: [], fallback: true };
  if (view === 'integrity') return { integrity: [], sources: [], fallback: true };
  if (view === 'graph') return { topics: [], sources: [], fallback: true };
  if (view === 'entities') return { entities: [], sources: [], fallback: true };
  if (view === 'overview') {
    const [research, trials] = await Promise.all([researchFallback(query, 12), trialsFallback(query, 12)]);
    return { stats: { research_records: research.total_matching, clinical_trials: trials.total_matching, topics: 0 }, topics: [], research: research.research, trials: trials.trials, sources: [...research.sources, ...trials.sources], fallback: true };
  }
  if (view === 'quality') return { telemetry: { research: {}, trials: {} }, fallback: true };
  return null;
}

module.exports = async function intelligenceProxy(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  const upstream = new URL(upstreamBase);
  for (const [key, value] of Object.entries(request.query || {})) {
    if (!allowedParameters.has(key) || Array.isArray(value) || value == null) continue;
    upstream.searchParams.set(key, String(value).slice(0, 200));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const upstreamResponse = await fetch(upstream, {
      headers: publishableKey ? { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` } : {},
      signal: controller.signal,
    });
    const body = await upstreamResponse.text();
    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8');
    if (upstreamResponse.ok) {
      response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
      response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
      return response.status(upstreamResponse.status).send(body);
    }
    const fallback = await sourceFallback(request.query || {});
    if (!fallback) return response.status(upstreamResponse.status).send(body);
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('X-Immortal-Source', 'official-source-fallback');
    return response.status(200).json(fallback);
  } catch (_) {
    try {
      const fallback = await sourceFallback(request.query || {});
      if (!fallback) throw new Error('no_fallback');
      response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
      response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
      response.setHeader('X-Immortal-Source', 'official-source-fallback');
      return response.status(200).json(fallback);
    } catch {
      response.setHeader('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'source_temporarily_unavailable' });
    }
  } finally {
    clearTimeout(timeout);
  }
};

module.exports.sourceFallback = sourceFallback;
