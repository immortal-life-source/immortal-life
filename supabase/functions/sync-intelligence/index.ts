import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  classifyEvidence,
  cleanText,
  dateOnly,
  normalizeTrialStatus,
  researchEditorialSummary,
  trialEditorialSummary,
  uniqueStrings,
} from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

type Topic = {
  slug: string
  name: string
  literature_query: string
  trials_query: string
}

type Job = {
  id: number
  source_id: string
  topic_slug: string
  attempts: number
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const MAX_JOBS_PER_RUN = 30
const USER_AGENT = 'immortal.life-intelligence/1.0 (contact: research@immortal.life)'

function constantTimeSecretMatch(supplied: string, expected: string): boolean {
  if (!expected || supplied.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < supplied.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  return mismatch === 0
}

async function isAuthorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false

  const environmentSecret = Deno.env.get('INTELLIGENCE_SYNC_SECRET') ?? ''
  if (environmentSecret && constantTimeSecretMatch(supplied, environmentSecret)) return true

  const suppliedHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied))
  const suppliedHash = [...new Uint8Array(suppliedHashBytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const { data, error } = await supabase
    .from('intelligence_runtime_config')
    .select('value')
    .eq('key', 'sync_secret_sha256')
    .maybeSingle()
  return !error && typeof data?.value === 'string' && constantTimeSecretMatch(suppliedHash, data.value)
}

async function fetchJson(url: URL): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Upstream ${response.status} from ${url.hostname}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function sourceDateWindow(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

async function syncEuropePmc(supabase: any, topic: Topic): Promise<{ seen: number; written: number }> {
  const { from, to } = sourceDateWindow(90)
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search')
  url.searchParams.set('query', `(${topic.literature_query}) AND FIRST_PDATE:[${from} TO ${to}] sort_date:y`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('resultType', 'core')
  url.searchParams.set('pageSize', '50')

  const payload = await fetchJson(url)
  const results = Array.isArray(payload?.resultList?.result) ? payload.resultList.result : []
  const now = new Date().toISOString()
  const records = results
    .map((item: any) => {
      const externalId = cleanText(item?.id ?? item?.pmid ?? item?.pmcid, 120)
      const title = cleanText(item?.title, 500)
      if (!externalId || !title) return null
      const publicationType = cleanText(item?.pubType, 180)
      const level = classifyEvidence(publicationType, title, item?.source)
      const source = cleanText(item?.source, 20) || 'MED'
      const doi = cleanText(item?.doi, 240) || null
      const status = /(retraction of publication|retracted publication)/i.test(publicationType)
        ? 'retracted'
        : 'published'

      return {
        source_id: 'europe-pmc',
        external_id: externalId,
        title,
        authors: cleanText(item?.authorString, 600) || null,
        journal: cleanText(item?.journalTitle, 240) || null,
        published_on: dateOnly(item?.firstPublicationDate ?? item?.electronicPublicationDate ?? item?.pubYear),
        doi,
        publication_type: publicationType || null,
        evidence_level: level,
        source_url: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`,
        is_open_access: typeof item?.isOpenAccess === 'string'
          ? item.isOpenAccess === 'Y'
          : typeof item?.isOpenAccess === 'boolean' ? item.isOpenAccess : null,
        cited_by_count: item?.citedByCount != null && Number.isSafeInteger(Number(item.citedByCount))
          ? Number(item.citedByCount)
          : null,
        editorial_summary: researchEditorialSummary(level, topic.name, item?.journalTitle),
        source_updated_at: now,
        last_seen_at: now,
        status,
        metadata: {
          pmid: cleanText(item?.pmid, 40) || null,
          pmcid: cleanText(item?.pmcid, 40) || null,
          source,
          has_references: item?.hasReferences === 'Y',
        },
      }
    })
    .filter(Boolean)

  if (!records.length) return { seen: 0, written: 0 }
  const { data, error } = await supabase
    .from('research_items')
    .upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
    .select('id')
  if (error) throw error

  const topicLinks = (data ?? []).map((record: { id: number }) => ({
    research_item_id: record.id,
    topic_slug: topic.slug,
    matched_by: 'source-query',
  }))
  if (topicLinks.length) {
    const { error: linkError } = await supabase
      .from('research_item_topics')
      .upsert(topicLinks, { onConflict: 'research_item_id,topic_slug', ignoreDuplicates: true })
    if (linkError) throw linkError
  }
  return { seen: results.length, written: records.length }
}

function trialDate(value: any): string | null {
  return dateOnly(value?.date ?? value)
}

async function syncClinicalTrials(supabase: any, topic: Topic): Promise<{ seen: number; written: number }> {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies')
  url.searchParams.set('query.term', topic.trials_query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('pageSize', '50')
  url.searchParams.set('sort', 'LastUpdatePostDate:desc')

  const payload = await fetchJson(url)
  const studies = Array.isArray(payload?.studies) ? payload.studies : []
  const now = new Date().toISOString()
  const records = studies
    .map((study: any) => {
      const protocol = study?.protocolSection ?? {}
      const identification = protocol?.identificationModule ?? {}
      const statusModule = protocol?.statusModule ?? {}
      const design = protocol?.designModule ?? {}
      const sponsors = protocol?.sponsorCollaboratorsModule ?? {}
      const locations = protocol?.contactsLocationsModule?.locations ?? []
      const description = protocol?.descriptionModule ?? {}
      const externalId = cleanText(identification?.nctId, 40)
      const title = cleanText(identification?.briefTitle ?? identification?.officialTitle, 500)
      if (!externalId || !title) return null
      const phases = uniqueStrings(design?.phases, 8)
      const rawStatus = cleanText(statusModule?.overallStatus, 80)
      const countries = uniqueStrings(locations.map((location: any) => location?.country), 40)
      const enrollment = Number(design?.enrollmentInfo?.count)

      return {
        source_id: 'clinicaltrials-gov',
        external_id: externalId,
        title,
        brief_summary: cleanText(description?.briefSummary, 900) || null,
        overall_status: normalizeTrialStatus(rawStatus),
        phases,
        study_type: cleanText(design?.studyType, 100).replace(/_/g, ' ') || null,
        sponsor: cleanText(sponsors?.leadSponsor?.name, 240) || null,
        enrollment: Number.isSafeInteger(enrollment) && enrollment >= 0 ? enrollment : null,
        countries,
        start_date: trialDate(statusModule?.startDateStruct),
        completion_date: trialDate(statusModule?.completionDateStruct),
        last_update_date: trialDate(statusModule?.lastUpdatePostDateStruct ?? statusModule?.studyFirstPostDateStruct),
        source_url: `https://clinicaltrials.gov/study/${encodeURIComponent(externalId)}`,
        editorial_summary: trialEditorialSummary(topic.name, rawStatus, phases),
        last_seen_at: now,
        metadata: {
          acronym: cleanText(identification?.acronym, 80) || null,
          organization: cleanText(identification?.organization?.fullName, 240) || null,
          source_has_results: Boolean(study?.hasResults),
        },
      }
    })
    .filter(Boolean)

  if (!records.length) return { seen: 0, written: 0 }
  const { data, error } = await supabase
    .from('clinical_trials')
    .upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
    .select('id')
  if (error) throw error

  const topicLinks = (data ?? []).map((record: { id: number }) => ({
    clinical_trial_id: record.id,
    topic_slug: topic.slug,
    matched_by: 'source-query',
  }))
  if (topicLinks.length) {
    const { error: linkError } = await supabase
      .from('clinical_trial_topics')
      .upsert(topicLinks, { onConflict: 'clinical_trial_id,topic_slug', ignoreDuplicates: true })
    if (linkError) throw linkError
  }
  return { seen: studies.length, written: records.length }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (!(await isAuthorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  let requestedSource = 'all'
  let triggerKind = 'schedule'
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.source === 'string') requestedSource = body.source
    if (['schedule', 'manual', 'recovery'].includes(body?.trigger)) triggerKind = body.trigger
  } catch {
    // Empty bodies are valid scheduled requests.
  }

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ trigger_kind: triggerKind })
    .select('id')
    .single()
  if (runError) return jsonResponse(req, { error: 'Unable to create ingestion run' }, 500, 'POST')

  try {
    const { data: topics, error: topicsError } = await supabase
      .from('intelligence_topics')
      .select('slug,name,literature_query,trials_query')
      .eq('enabled', true)
      .order('sort_order')
    if (topicsError) throw topicsError

    let sourceQuery = supabase.from('content_sources').select('id').eq('enabled', true)
    if (requestedSource !== 'all') sourceQuery = sourceQuery.eq('id', requestedSource)
    const { data: sources, error: sourcesError } = await sourceQuery
    if (sourcesError) throw sourcesError
    if (!sources?.length) throw new Error('No enabled source matched the request')

    const slot = new Date(Math.floor(Date.now() / SIX_HOURS_MS) * SIX_HOURS_MS).toISOString()
    const queued = sources.flatMap((source: { id: string }) =>
      (topics ?? []).map((topic: Topic) => ({ source_id: source.id, topic_slug: topic.slug, window_start: slot }))
    )
    const { error: queueError } = await supabase
      .from('ingestion_jobs')
      .upsert(queued, { onConflict: 'source_id,topic_slug,window_start', ignoreDuplicates: true })
    if (queueError) throw queueError

    const abandonedBefore = new Date(Date.now() - 45 * 60 * 1000).toISOString()
    await supabase
      .from('ingestion_jobs')
      .update({ status: 'retry', available_at: new Date().toISOString(), locked_at: null, last_error: 'Recovered abandoned job' })
      .eq('status', 'running')
      .lt('locked_at', abandonedBefore)

    const { data: jobs, error: jobsError } = await supabase
      .from('ingestion_jobs')
      .select('id,source_id,topic_slug,attempts')
      .in('status', ['pending', 'retry'])
      .lte('available_at', new Date().toISOString())
      .order('created_at')
      .limit(MAX_JOBS_PER_RUN)
    if (jobsError) throw jobsError

    const topicBySlug = new Map((topics ?? []).map((topic: Topic) => [topic.slug, topic]))
    let seen = 0
    let written = 0
    let errors = 0
    const errorSources = new Set<string>()
    const successfulSources = new Set<string>()

    for (const job of (jobs ?? []) as Job[]) {
      const topic = topicBySlug.get(job.topic_slug)
      if (!topic) continue
      const attempt = job.attempts + 1
      const lockedAt = new Date().toISOString()
      const { data: locked } = await supabase
        .from('ingestion_jobs')
        .update({ status: 'running', attempts: attempt, locked_at: lockedAt, updated_at: lockedAt })
        .eq('id', job.id)
        .in('status', ['pending', 'retry'])
        .select('id')
        .maybeSingle()
      if (!locked) continue

      await supabase.from('content_sources').update({ last_attempt_at: lockedAt }).eq('id', job.source_id)
      try {
        const outcome = job.source_id === 'europe-pmc'
          ? await syncEuropePmc(supabase, topic)
          : await syncClinicalTrials(supabase, topic)
        seen += outcome.seen
        written += outcome.written
        successfulSources.add(job.source_id)
        const completedAt = new Date().toISOString()
        await supabase.from('ingestion_jobs').update({
          status: 'succeeded',
          completed_at: completedAt,
          items_seen: outcome.seen,
          items_written: outcome.written,
          locked_at: null,
          last_error: null,
          updated_at: completedAt,
        }).eq('id', job.id)
        await supabase.from('content_sources').update({
          last_success_at: completedAt,
          updated_at: completedAt,
        }).eq('id', job.source_id)
      } catch (error) {
        errors += 1
        errorSources.add(job.source_id)
        const message = cleanText(error instanceof Error ? error.message : String(error), 500)
        const isDead = attempt >= 5
        const retryDelayMs = Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(0, attempt - 1))
        await supabase.from('ingestion_jobs').update({
          status: isDead ? 'dead' : 'retry',
          available_at: new Date(Date.now() + retryDelayMs).toISOString(),
          locked_at: null,
          last_error: message,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        const { data: sourceState } = await supabase
          .from('content_sources')
          .select('consecutive_failures')
          .eq('id', job.source_id)
          .single()
        await supabase.from('content_sources').update({
          last_error: message,
          consecutive_failures: Number(sourceState?.consecutive_failures ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', job.source_id)
      }
    }

    for (const sourceId of successfulSources) {
      if (errorSources.has(sourceId)) continue
      await supabase.from('content_sources').update({
        last_error: null,
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      }).eq('id', sourceId)
    }

    const processed = (jobs ?? []).length
    const finalStatus = errors === 0 ? 'succeeded' : errors < processed ? 'partial' : 'failed'
    await supabase.from('ingestion_runs').update({
      completed_at: new Date().toISOString(),
      status: finalStatus,
      jobs_processed: processed,
      items_seen: seen,
      items_written: written,
      errors,
      details: { requested_source: requestedSource, error_sources: [...errorSources] },
    }).eq('id', run.id)

    return jsonResponse(req, {
      ok: finalStatus !== 'failed',
      run_id: run.id,
      status: finalStatus,
      jobs_processed: processed,
      items_seen: seen,
      items_written: written,
      errors,
    }, finalStatus === 'failed' ? 502 : 200, 'POST')
  } catch (error) {
    const message = cleanText(error instanceof Error ? error.message : String(error), 500)
    await supabase.from('ingestion_runs').update({
      completed_at: new Date().toISOString(),
      status: 'failed',
      errors: 1,
      details: { error: message },
    }).eq('id', run.id)
    console.error('sync-intelligence error:', message)
    return jsonResponse(req, { error: 'sync_failed', run_id: run.id }, 500, 'POST')
  }
})
