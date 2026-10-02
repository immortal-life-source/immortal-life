import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const DESTINATION = 'hello@immortal.life'
const TIME_ZONE = 'Europe/Prague'

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char))
}

function pragueParts(date = new Date()): { date: string; hour: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const day = `${value('year')}-${value('month')}-${value('day')}`
  return { date: day, hour: Number(value('hour')), label: new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, dateStyle: 'long' }).format(date) }
}

function shiftIsoDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function number(value: unknown): string { return new Intl.NumberFormat('en-GB').format(Number(value || 0)) }
function percent(value: number): string { return `${(Number(value || 0) * 100).toFixed(1)}%` }
function signedNumber(current: number, prior: number): string {
  const difference = Number(current || 0) - Number(prior || 0)
  return difference === 0 ? 'No change from previous day' : `${difference > 0 ? '+' : ''}${number(difference)} vs previous day`
}
function progress(current: unknown, total: unknown): number {
  const denominator = Number(total || 0)
  return denominator > 0 ? Math.max(0, Math.min(1, Number(current || 0) / denominator)) : 0
}

async function authorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && hash === data.value
}

function metricCard(label: string, value: string, note: string, tone = 'pink'): string {
  const colour = tone === 'gold' ? '#b78323' : tone === 'alert' ? '#b83d54' : '#cc3f79'
  return `<td style="width:25%;padding:18px 16px;border:1px solid #f0dfe7;background:#fff;vertical-align:top"><div style="font:700 26px Arial,sans-serif;color:${colour}">${escapeHtml(value)}</div><div style="margin-top:5px;font:700 10px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#44343e">${escapeHtml(label)}</div><div style="margin-top:8px;font:12px/1.5 Arial,sans-serif;color:#7a6872">${escapeHtml(note)}</div></td>`
}

function section(title: string, cards: string, note = ''): string {
  return `<tr><td style="padding:26px 34px;border-top:1px solid #f0e3e9"><h2 style="margin:0 0 14px;font:700 20px Arial,sans-serif">${escapeHtml(title)}</h2><table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>${cards}</tr></table>${note ? `<p style="margin:14px 8px 0;font:12px/1.55 Arial,sans-serif;color:#806d78">${escapeHtml(note)}</p>` : ''}</td></tr>`
}

type SearchDay = { clicks: number; impressions: number; weightedPosition: number }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')

  const now = new Date()
  const local = pragueParts(now)
  let force = false
  let diagnostics = false
  try {
    const body = await req.json()
    force = Boolean(body?.force)
    diagnostics = Boolean(body?.diagnostics)
  } catch { /* empty scheduled body */ }
  if (!force && local.hour !== 19) return jsonResponse(req, { ok: true, skipped: true, reason: 'outside_prague_delivery_hour', local_hour: local.hour }, 200, 'POST')

  const since = new Date(now.getTime() - 86400000).toISOString()
  const searchStart = shiftIsoDay(local.date, -14)
  const utilityStart = shiftIsoDay(local.date, -3)
  const yesterday = shiftIsoDay(local.date, -1)
  const dayBefore = shiftIsoDay(local.date, -2)

  const [research, trials, universityWorks, directGrants, searchRows, searchRun, utilityEvents, sources, jobs, universityState, throughput, readiness, previousReport] = await Promise.all([
    supabase.from('research_items').select('id', { count: 'exact', head: true }).eq('publication_state', 'published').gte('first_seen_at', since),
    supabase.from('clinical_trials').select('id', { count: 'exact', head: true }).eq('publication_state', 'published').gte('first_seen_at', since),
    supabase.from('university_research_works').select('openalex_work_id', { count: 'exact', head: true }).gte('first_seen_at', since),
    supabase.from('funding_grants').select('id', { count: 'exact', head: true }).eq('publication_state', 'published').gte('first_seen_at', since),
    supabase.from('search_console_daily').select('metric_date,clicks,impressions,position').gte('metric_date', searchStart).order('metric_date', { ascending: false }).limit(25000),
    supabase.from('search_console_sync_runs').select('status,started_at,finished_at,rows_imported,error_code').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('utility_event_daily').select('metric_date,event_name,event_count').gte('metric_date', utilityStart).order('metric_date', { ascending: false }).limit(25000),
    supabase.from('content_sources').select('id,name,last_success_at,last_error,consecutive_failures').eq('enabled', true).order('name'),
    supabase.from('ingestion_jobs').select('id,source_id,status,updated_at').in('status', ['retry', 'dead']).gte('updated_at', since).order('updated_at', { ascending: false }).limit(100),
    supabase.from('university_topic_sync_state').select('topic_slug,last_error,updated_at').not('last_error', 'is', null).order('updated_at', { ascending: false }).limit(100),
    supabase.rpc('get_ingestion_throughput_report', { p_hours: 24 }),
    supabase.rpc('get_topic_readiness_report'),
    supabase.from('daily_management_reports').select('report_date,payload').eq('status', 'sent').lt('report_date', local.date).order('report_date', { ascending: false }).limit(1).maybeSingle(),
  ])
  const results = [research, trials, universityWorks, directGrants, searchRows, searchRun, utilityEvents, sources, jobs, universityState, throughput, readiness, previousReport]
  if (diagnostics) {
    return jsonResponse(req, {
      ok: !results.some((result) => result.error),
      generated_at: now.toISOString(),
      errors: results.map((result, index) => result.error ? { query: ['research', 'trials', 'university_works', 'direct_grants', 'search_rows', 'search_run', 'utility', 'sources', 'jobs', 'university_states', 'throughput', 'readiness', 'previous_report'][index], error: result.error } : null).filter(Boolean),
      counts: { research: research.count, trials: trials.count, university_works: universityWorks.count, direct_grants: directGrants.count },
      search_import: searchRun.data ?? null,
      search_rows: searchRows.data?.length ?? 0,
    }, 200, 'POST')
  }
  for (const result of results) if (result.error) throw result.error

  const { data: alreadySent } = await supabase.from('daily_management_reports').select('id').eq('report_date', local.date).eq('status', 'sent').maybeSingle()
  if (alreadySent && !force) return jsonResponse(req, { ok: true, skipped: true, reason: 'already_sent' }, 200, 'POST')

  const searchByDay = new Map<string, SearchDay>()
  for (const row of searchRows.data ?? []) {
    const item = searchByDay.get(row.metric_date) ?? { clicks: 0, impressions: 0, weightedPosition: 0 }
    item.clicks += Number(row.clicks || 0)
    item.impressions += Number(row.impressions || 0)
    item.weightedPosition += Number(row.position || 0) * Number(row.impressions || 0)
    searchByDay.set(row.metric_date, item)
  }
  const searchDates = [...searchByDay.keys()].sort().reverse()
  const latestMetricDate = searchDates[0] ?? null
  const previousMetricDate = searchDates[1] ?? null
  const googleToday = latestMetricDate ? searchByDay.get(latestMetricDate)! : { clicks: 0, impressions: 0, weightedPosition: 0 }
  const googlePrior = previousMetricDate ? searchByDay.get(previousMetricDate)! : { clicks: 0, impressions: 0, weightedPosition: 0 }
  const googleCtr = googleToday.impressions ? googleToday.clicks / googleToday.impressions : 0
  const googlePosition = googleToday.impressions ? googleToday.weightedPosition / googleToday.impressions : 0
  const searchConfigured = searchRun.data?.status === 'succeeded' && Boolean(latestMetricDate)

  const utilityRows = Array.isArray(utilityEvents.data) ? utilityEvents.data : []
  const eventTotal = (name: string, day: string) => utilityRows.filter((row: any) => row.event_name === name && row.metric_date === day).reduce((sum: number, row: any) => sum + Number(row.event_count || 0), 0)
  const pageViews = eventTotal('page_view', yesterday)
  const priorPageViews = eventTotal('page_view', dayBefore)
  const sourceOpens = eventTotal('open_source', yesterday)
  const siteSearches = eventTotal('site_search', yesterday)
  const comparisons = eventTotal('comparison_completed', yesterday)

  const sourceSuccess = new Map((sources.data ?? []).map((source: any) => [source.id, source.last_success_at ? new Date(source.last_success_at).getTime() : 0]))
  const delayedSources = (sources.data ?? []).filter((source: any) => Number(source.consecutive_failures || 0) >= 2 || !source.last_success_at || Date.now() - new Date(source.last_success_at).getTime() > 48 * 3600000)
  const activeJobs = (jobs.data ?? []).filter((job: any) => job.status === 'dead' || new Date(job.updated_at).getTime() > Number(sourceSuccess.get(job.source_id) ?? 0))
  const openAlexSuccess = Number(sourceSuccess.get('openalex') ?? 0)
  const activeUniversityStates = (universityState.data ?? []).filter((state: any) => new Date(state.updated_at).getTime() > openAlexSuccess)

  const throughputData = throughput.data ?? {}
  const readinessData = readiness.data ?? {}
  const reindexRuns = Array.isArray(readinessData.reindex_runs) ? readinessData.reindex_runs : []
  const researchReindex = reindexRuns.find((run: any) => run.entity_kind === 'research') ?? {}
  const trialReindex = reindexRuns.find((run: any) => run.entity_kind === 'trials') ?? {}
  const previousPayload = previousReport.data?.payload ?? {}
  const previousReindexRuns = Array.isArray(previousPayload?.readiness?.reindex_runs) ? previousPayload.readiness.reindex_runs : []
  const previousResearchReindex = previousReindexRuns.find((run: any) => run.entity_kind === 'research') ?? {}
  const researchReindexedToday = Math.max(0, Number(researchReindex.records_processed ?? researchReindex.cursor_id ?? 0) - Number(previousResearchReindex.records_processed ?? previousResearchReindex.cursor_id ?? 0))
  const historyPagesAdded = Math.max(0, Math.round(Number(throughputData.pages_per_hour || 0) * Number(throughputData.window_hours || 0)))
  const historyRecordsAdded = Math.max(0, Math.round(Number(throughputData.items_per_hour || 0) * Number(throughputData.window_hours || 0)))
  const universityTopicsAdded = Math.max(0, Number(throughputData.university_topics_complete || 0) - Number(previousPayload?.throughput?.university_topics_complete || 0))

  const alerts: string[] = []
  const actions: string[] = []
  if (!searchConfigured) {
    alerts.push('Google Search Console is not importing data.')
    actions.push('Reconnect Google Search Console so the report can measure search visibility.')
  } else if (Date.now() - new Date(`${latestMetricDate}T00:00:00Z`).getTime() > 5 * 86400000) {
    alerts.push(`Google data is stale; the newest complete day is ${latestMetricDate}.`)
    actions.push('Ask Codex to repair the Google Search Console import.')
  }
  if (delayedSources.length) {
    alerts.push(`${delayedSources.length} source${delayedSources.length === 1 ? '' : 's'} need attention.`)
    actions.push(`Ask Codex to review ${delayedSources.length} delayed source${delayedSources.length === 1 ? '' : 's'}: ${delayedSources.map((source: any) => source.name).join(', ')}.`)
  }
  if (activeJobs.length) {
    alerts.push(`${activeJobs.length} ingestion job${activeJobs.length === 1 ? '' : 's'} require recovery.`)
    actions.push(`Ask Codex to recover the ${activeJobs.length} unresolved ingestion job${activeJobs.length === 1 ? '' : 's'}.`)
  }
  if (activeUniversityStates.length) {
    alerts.push(`${activeUniversityStates.length} university topic job${activeUniversityStates.length === 1 ? '' : 's'} report an error.`)
    actions.push('Ask Codex to review the university ingestion errors.')
  }
  if (researchReindex.status === 'failed' || trialReindex.status === 'failed') {
    alerts.push('Topic reindexing has stopped.')
    actions.push('Ask Codex to restart the failed topic reindex.')
  }
  if (searchConfigured && googleToday.impressions > 0 && googleToday.clicks === 0) actions.push('No Google connection repair is needed. Keep improving search titles and dossier summaries while visibility is still small.')
  if (!actions.length) actions.push('No action is required from you today.')

  const status = alerts.length ? 'Attention needed' : 'Operating normally'
  const statusColour = alerts.length ? '#b83d54' : '#2f846f'
  const googleExplanation = !searchConfigured
    ? 'No complete Google day is available yet.'
    : googleToday.impressions > 0 && googleToday.clicks === 0
      ? `The connection is working. Google showed immortal.life ${number(googleToday.impressions)} times on ${latestMetricDate}, but no searcher clicked. This is a real early-traffic result, not missing data.`
      : `Google final data through ${latestMetricDate}; Search Console normally publishes with about a two-day delay.`

  const googleCards = metricCard('Google clicks', searchConfigured ? number(googleToday.clicks) : '—', searchConfigured ? signedNumber(googleToday.clicks, googlePrior.clicks) : 'Connection required')
    + metricCard('Google impressions', searchConfigured ? number(googleToday.impressions) : '—', searchConfigured ? signedNumber(googleToday.impressions, googlePrior.impressions) : 'Connection required', 'gold')
    + metricCard('Click-through rate', searchConfigured ? percent(googleCtr) : '—', latestMetricDate ? `Latest complete day: ${latestMetricDate}` : 'No complete day')
    + metricCard('Average position', searchConfigured && googleToday.impressions ? googlePosition.toFixed(1) : '—', 'Lower is better', 'gold')

  const knowledgeCards = metricCard('Research records', number(research.count), 'Added in the last 24 hours')
    + metricCard('Trial records', number(trials.count), 'Added in the last 24 hours', 'gold')
    + metricCard('University works', number(universityWorks.count), 'Discovered in the last 24 hours')
    + metricCard('Direct grants', number(directGrants.count), 'Added in the last 24 hours', 'gold')

  const visitorCards = metricCard('Page views', number(pageViews), signedNumber(pageViews, priorPageViews))
    + metricCard('Source opens', number(sourceOpens), 'Readers opened original evidence', 'gold')
    + metricCard('On-site searches', number(siteSearches), 'Search text is never stored')
    + metricCard('Comparisons', number(comparisons), 'Completed evidence comparisons', 'gold')

  const progressCards = metricCard('History pages processed', number(historyPagesAdded), 'Change in the last 24 hours')
    + metricCard('Historical records written', number(historyRecordsAdded), 'Change in the last 24 hours', 'gold')
    + metricCard('Research reindexed', number(researchReindexedToday), `${percent(progress(researchReindex.cursor_id, researchReindex.upper_bound_id))} of current pass complete`)
    + metricCard('University topics complete', `${number(throughputData.university_topics_complete)}/${number(throughputData.university_topics_total)}`, `+${number(universityTopicsAdded)} since previous report`, 'gold')

  const healthCards = metricCard('Sources needing attention', number(delayedSources.length), delayedSources.length ? 'Action listed below' : 'All sources within tolerance', delayedSources.length ? 'alert' : 'pink')
    + metricCard('Jobs needing recovery', number(activeJobs.length), activeJobs.length ? 'Action listed below' : 'No unresolved jobs', activeJobs.length ? 'alert' : 'gold')
    + metricCard('University errors', number(activeUniversityStates.length), activeUniversityStates.length ? 'Action listed below' : 'No current errors', activeUniversityStates.length ? 'alert' : 'pink')
    + metricCard('Topics evidence-ready', `${number(readinessData.ready_topics)}/${number(readinessData.total_topics)}`, `${percent(progress(trialReindex.cursor_id, trialReindex.upper_bound_id))} of trial reindex complete`, 'gold')

  const actionHtml = actions.map((action) => `<li style="margin:9px 0">${escapeHtml(action)}</li>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#fff8fb;color:#3c2934"><div style="display:none;max-height:0;overflow:hidden">Daily numbers and actions for immortal.life.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8fb"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:100%;max-width:760px;background:#fff;border:1px solid #efdfe7;border-radius:20px;overflow:hidden"><tr><td style="padding:30px 34px;background:linear-gradient(120deg,#fff 0%,#fff1f6 64%,#fff5df 100%)"><div style="font:700 11px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cc3f79">Immortal.life · Daily management report</div><h1 style="margin:10px 0 4px;font:700 31px/1.1 Arial,sans-serif;color:#31242c">${escapeHtml(local.label)}</h1><div style="font:13px Arial,sans-serif;color:#826e79">Daily numbers · daily changes · actions for you</div><div style="display:inline-block;margin-top:18px;padding:8px 13px;border-radius:999px;background:${statusColour};color:#fff;font:700 11px Arial,sans-serif">${status}</div></td></tr>${section('Google search · latest complete day', googleCards, googleExplanation)}${section('Knowledge added · last 24 hours', knowledgeCards)}${section(`Visitor activity · ${yesterday}`, visitorCards, 'Aggregate, identifier-free counts. No cookies, IP addresses, fingerprints, referrers, or search text are stored.')}${section('Coverage progress · last 24 hours', progressCards)}${section('Website health · right now', healthCards)}<tr><td style="padding:26px 34px;background:#fffafd;border-top:1px solid #f0e3e9"><h2 style="margin:0 0 10px;font:700 20px Arial,sans-serif">Actions for you</h2><ol style="margin:0;padding-left:21px;font:13px/1.6 Arial,sans-serif;color:#624f5a">${actionHtml}</ol></td></tr><tr><td style="padding:18px 34px;background:#35272f;color:#f8edf2;font:11px Arial,sans-serif">Private management report · ${escapeHtml(DESTINATION)} · <a href="${SITE}" style="color:#f1c65d">immortal.life</a></td></tr></table></td></tr></table></body></html>`

  const reportPayload = {
    counts: { research: Number(research.count || 0), trials: Number(trials.count || 0), university_works: Number(universityWorks.count || 0), direct_grants: Number(directGrants.count || 0) },
    alerts, actions, throughput: throughputData, readiness: readinessData,
    search: { configured: searchConfigured, latest_metric_date: latestMetricDate, previous_metric_date: previousMetricDate, clicks: googleToday.clicks, impressions: googleToday.impressions, ctr: googleCtr, position: googlePosition },
    usage: { metric_date: yesterday, page_views: pageViews, source_opens: sourceOpens, site_searches: siteSearches, comparisons_completed: comparisons },
    daily_progress: { history_pages: historyPagesAdded, history_records: historyRecordsAdded, research_reindexed: researchReindexedToday, university_topics: universityTopicsAdded },
  }
  const reportInsert = force && alreadySent
    ? await supabase.from('daily_management_reports').update({ destination: DESTINATION, status: 'sending', payload: reportPayload, sent_at: null, error_code: null }).eq('id', alreadySent.id).select('id').single()
    : await supabase.from('daily_management_reports').insert({ report_date: local.date, destination: DESTINATION, status: 'sending', payload: reportPayload }).select('id').single()
  if (reportInsert.error) throw reportInsert.error

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!apiKey) {
    await supabase.from('daily_management_reports').update({ status: 'failed', error_code: 'resend_not_configured' }).eq('id', reportInsert.data.id)
    return jsonResponse(req, { ok: false, error: 'email_not_configured' }, 503, 'POST')
  }
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('BRIEFING_FROM_EMAIL') ?? 'immortal.life <briefings@immortal.life>', to: [DESTINATION], subject: `${alerts.length ? 'Attention · ' : ''}immortal.life daily report · ${local.date}`, html }),
  })
  const emailPayload = await emailResponse.json().catch(() => ({}))
  await supabase.from('daily_management_reports').update({ status: emailResponse.ok ? 'sent' : 'failed', sent_at: emailResponse.ok ? new Date().toISOString() : null, provider_id: cleanText(emailPayload?.id, 200) || null, error_code: emailResponse.ok ? null : `resend_${emailResponse.status}` }).eq('id', reportInsert.data.id)
  return jsonResponse(req, { ok: emailResponse.ok, report_date: local.date, destination: DESTINATION, status, alerts: alerts.length, actions, search_console: { configured: searchConfigured, latest_metric_date: latestMetricDate, clicks: googleToday.clicks, impressions: googleToday.impressions } }, emailResponse.ok ? 200 : 502, 'POST')
})
