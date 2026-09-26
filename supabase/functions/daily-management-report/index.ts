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

function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function number(value: unknown): string { return new Intl.NumberFormat('en-GB').format(Number(value || 0)) }
function safeUrl(value: unknown): string { const text = String(value ?? ''); return /^https:\/\//.test(text) ? text : SITE }

async function authorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && hash === data.value
}

function metricCard(label: string, value: string, note: string, tone = 'pink'): string {
  const colour = tone === 'gold' ? '#c99328' : tone === 'alert' ? '#b83d54' : '#cc3f79'
  return `<td style="width:25%;padding:18px 16px;border:1px solid #f0dfe7;background:#fff;vertical-align:top"><div style="font:700 26px Arial,sans-serif;color:${colour}">${escapeHtml(value)}</div><div style="margin-top:5px;font:700 10px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#44343e">${escapeHtml(label)}</div><div style="margin-top:8px;font:12px/1.5 Arial,sans-serif;color:#7a6872">${escapeHtml(note)}</div></td>`
}

function recordRows(rows: any[], kind: 'research' | 'trials' | 'universities'): string {
  if (!rows.length) return '<tr><td style="padding:13px 0;color:#8a7782;font:13px Arial,sans-serif">No new public records in this 24-hour window.</td></tr>'
  return rows.slice(0, 8).map((row: any) => {
    const href = kind === 'research' ? `${SITE}/research/${row.id}` : kind === 'trials' ? `${SITE}/trials/${row.id}` : safeUrl(row.source_url)
    const meta = kind === 'research' ? [row.journal, row.evidence_level].filter(Boolean).join(' · ')
      : kind === 'trials' ? [row.overall_status, Array.isArray(row.phases) ? row.phases.join(', ') : ''].filter(Boolean).join(' · ')
      : [row.source_name, row.publication_year].filter(Boolean).join(' · ')
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #f2e8ed"><a href="${escapeHtml(href)}" style="font:600 14px/1.35 Arial,sans-serif;color:#3c2934;text-decoration:none">${escapeHtml(row.title)}</a><div style="margin-top:4px;font:11px Arial,sans-serif;color:#927a86">${escapeHtml(meta)}</div></td></tr>`
  }).join('')
}

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

  if (diagnostics) {
    const diagnosticSince = new Date(now.getTime() - 86400000).toISOString()
    const diagnosticSearchStart = new Date(now.getTime() - 35 * 86400000).toISOString().slice(0, 10)
    const [diagnosticSources, diagnosticJobs, diagnosticUniversities, diagnosticResearch, diagnosticTrials, diagnosticWorks, diagnosticSearchRows, diagnosticSearchRun, diagnosticReport] = await Promise.all([
      supabase.from('content_sources').select('*').in('id', ['clinicaltrials-gov', 'crossref', 'openalex', 'doaj']),
      supabase.from('ingestion_jobs').select('*').in('status', ['retry', 'dead']).gte('updated_at', diagnosticSince).order('updated_at', { ascending: false }).limit(100),
      supabase.from('university_topic_sync_state').select('*').not('last_error', 'is', null).order('updated_at', { ascending: false }).limit(100),
      supabase.from('research_items').select('id,title,journal,evidence_level,first_seen_at', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', diagnosticSince).order('first_seen_at', { ascending: false }).limit(8),
      supabase.from('clinical_trials').select('id,title,overall_status,phases,first_seen_at', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', diagnosticSince).order('first_seen_at', { ascending: false }).limit(8),
      supabase.from('university_research_works').select('openalex_work_id,title,publication_year,source_name,source_url,first_seen_at', { count: 'exact' }).gte('first_seen_at', diagnosticSince).order('first_seen_at', { ascending: false }).limit(8),
      supabase.from('search_console_daily').select('metric_date,page,clicks,impressions,position').gte('metric_date', diagnosticSearchStart).order('metric_date', { ascending: false }).limit(25000),
      supabase.from('search_console_sync_runs').select('status,started_at,finished_at,rows_imported,error_code').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('daily_management_reports').select('id,status,report_date').eq('report_date', local.date),
    ])
    const diagnosticResults = [diagnosticSources, diagnosticJobs, diagnosticUniversities, diagnosticResearch, diagnosticTrials, diagnosticWorks, diagnosticSearchRows, diagnosticSearchRun, diagnosticReport]
    return jsonResponse(req, {
      ok: !diagnosticResults.some((result) => result.error),
      generated_at: now.toISOString(),
      errors: diagnosticResults.map((result, index) => result.error ? { query: ['sources', 'jobs', 'universities', 'research', 'trials', 'works', 'search_rows', 'search_run', 'report'][index], error: result.error } : null).filter(Boolean),
      sources: diagnosticSources.data ?? [],
      jobs: diagnosticJobs.data ?? [],
      university_states: diagnosticUniversities.data ?? [],
      probes: {
        research_count: diagnosticResearch.count,
        trials_count: diagnosticTrials.count,
        works_count: diagnosticWorks.count,
        search_rows: diagnosticSearchRows.data?.length ?? 0,
        search_run: diagnosticSearchRun.data ?? null,
        reports: diagnosticReport.data ?? [],
      },
    }, 200, 'POST')
  }

  const { data: alreadySent } = await supabase.from('daily_management_reports').select('id').eq('report_date', local.date).eq('status', 'sent').maybeSingle()
  if (alreadySent && !force) return jsonResponse(req, { ok: true, skipped: true, reason: 'already_sent' }, 200, 'POST')

  const since = new Date(now.getTime() - 86400000).toISOString()
  const searchStart = new Date(now.getTime() - 35 * 86400000).toISOString().slice(0, 10)
  const [research, trials, universityWorks, searchRows, searchRun, sources, jobs, universityState] = await Promise.all([
    supabase.from('research_items').select('id,title,journal,evidence_level,first_seen_at', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', since).order('first_seen_at', { ascending: false }).limit(8),
    supabase.from('clinical_trials').select('id,title,overall_status,phases,first_seen_at', { count: 'exact' }).eq('publication_state', 'published').gte('first_seen_at', since).order('first_seen_at', { ascending: false }).limit(8),
    supabase.from('university_research_works').select('openalex_work_id,title,publication_year,source_name,source_url,first_seen_at', { count: 'exact' }).gte('first_seen_at', since).order('first_seen_at', { ascending: false }).limit(8),
    supabase.from('search_console_daily').select('metric_date,page,clicks,impressions,position').gte('metric_date', searchStart).order('metric_date', { ascending: false }).limit(25000),
    supabase.from('search_console_sync_runs').select('status,started_at,finished_at,rows_imported,error_code').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('content_sources').select('id,name,last_success_at,last_attempt_at,last_error,consecutive_failures,updated_at').eq('enabled', true).order('name'),
    supabase.from('ingestion_jobs').select('id,source_id,job_key,topic_slug,status,attempts,last_error,available_at,updated_at').in('status', ['retry', 'dead']).gte('updated_at', since).order('updated_at', { ascending: false }).limit(50),
    supabase.from('university_topic_sync_state').select('topic_slug,phase,cursor,pages_processed,records_processed,last_error,updated_at').not('last_error', 'is', null).order('updated_at', { ascending: false }).limit(20),
  ])
  for (const result of [research, trials, universityWorks, searchRows, searchRun, sources, jobs, universityState]) if (result.error) throw result.error

  const metrics = Array.isArray(searchRows.data) ? searchRows.data : []
  const latestMetricDate = metrics[0]?.metric_date || null
  const latestDate = latestMetricDate ? new Date(`${latestMetricDate}T00:00:00Z`) : null
  const currentEnd = latestDate?.getTime() ?? 0
  const currentStart = currentEnd - 6 * 86400000
  const priorStart = currentEnd - 13 * 86400000
  const aggregate = (start: number, end: number) => metrics.filter((row: any) => { const time = new Date(`${row.metric_date}T00:00:00Z`).getTime(); return time >= start && time <= end }).reduce((sum: any, row: any) => ({ clicks: sum.clicks + Number(row.clicks || 0), impressions: sum.impressions + Number(row.impressions || 0), weightedPosition: sum.weightedPosition + Number(row.position || 0) * Number(row.impressions || 0) }), { clicks: 0, impressions: 0, weightedPosition: 0 })
  const current = aggregate(currentStart, currentEnd)
  const prior = aggregate(priorStart, currentStart - 86400000)
  const ctr = current.impressions ? current.clicks / current.impressions : 0
  const position = current.impressions ? current.weightedPosition / current.impressions : 0
  const clickChange = prior.clicks ? (current.clicks - prior.clicks) / prior.clicks : current.clicks ? 1 : 0
  const pageMap = new Map<string, { clicks: number; impressions: number }>()
  metrics.filter((row: any) => new Date(`${row.metric_date}T00:00:00Z`).getTime() >= currentStart).forEach((row: any) => { const item = pageMap.get(row.page) ?? { clicks: 0, impressions: 0 }; item.clicks += Number(row.clicks || 0); item.impressions += Number(row.impressions || 0); pageMap.set(row.page, item) })
  const topPages = [...pageMap.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions).slice(0, 6)

  // A single recovered/transient miss is normal for external APIs. Escalate
  // only repeated failures or a feed that has not succeeded for 48 hours.
  const delayedSources = (sources.data ?? []).filter((source: any) => Number(source.consecutive_failures || 0) >= 2 || !source.last_success_at || Date.now() - new Date(source.last_success_at).getTime() > 48 * 3600000)
  const sourceSuccess = new Map((sources.data ?? []).map((source: any) => [source.id, source.last_success_at ? new Date(source.last_success_at).getTime() : 0]))
  const activeJobs = (jobs.data ?? []).filter((job: any) => job.status === 'dead' || new Date(job.updated_at).getTime() > Number(sourceSuccess.get(job.source_id) ?? 0))
  const openAlexSuccess = Number(sourceSuccess.get('openalex') ?? 0)
  const activeUniversityStates = (universityState.data ?? []).filter((state: any) => new Date(state.updated_at).getTime() > openAlexSuccess)
  const newResearchCount = Number(research.count ?? research.data?.length ?? 0)
  const newTrialCount = Number(trials.count ?? trials.data?.length ?? 0)
  const newUniversityWorkCount = Number(universityWorks.count ?? universityWorks.data?.length ?? 0)
  const searchConfigured = searchRun.data?.status !== 'not_configured' && Boolean(latestMetricDate)
  const alerts: string[] = []
  if (!searchConfigured) alerts.push('Google Search Console is not connected or has not imported data.')
  else if (Date.now() - new Date(`${latestMetricDate}T00:00:00Z`).getTime() > 5 * 86400000) alerts.push(`Search Console data is stale; newest metric date is ${latestMetricDate}.`)
  if (delayedSources.length) alerts.push(`${delayedSources.length} enabled source${delayedSources.length === 1 ? '' : 's'} need attention.`)
  if (activeJobs.length) alerts.push(`${activeJobs.length} ingestion job${activeJobs.length === 1 ? '' : 's'} currently require recovery.`)
  if (activeUniversityStates.length) alerts.push(`${activeUniversityStates.length} university topic sync state${activeUniversityStates.length === 1 ? '' : 's'} currently report an error.`)

  const status = alerts.length ? 'Attention needed' : 'Operating normally'
  const statusColour = alerts.length ? '#b83d54' : '#2f846f'
  const alertHtml = alerts.length ? alerts.map((alert) => `<li style="margin:7px 0">${escapeHtml(alert)}</li>`).join('') : '<li>No reportable system problems were detected.</li>'
  const topPageHtml = topPages.length ? topPages.map(([page, value]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f2e8ed"><a href="${escapeHtml(page)}" style="color:#3c2934;text-decoration:none;font:600 13px Arial,sans-serif">${escapeHtml(page.replace(SITE, '') || '/')}</a></td><td style="padding:10px;text-align:right;color:#cc3f79;font:700 13px Arial,sans-serif">${number(value.clicks)}</td><td style="padding:10px 0;text-align:right;color:#806d78;font:13px Arial,sans-serif">${number(value.impressions)}</td></tr>`).join('') : '<tr><td style="padding:12px 0;color:#8a7782">No Search Console page data available.</td></tr>'

  const html = `<!doctype html><html><body style="margin:0;background:#fff8fb;color:#3c2934"><div style="display:none;max-height:0;overflow:hidden">Daily traffic, knowledge growth, and system health for immortal.life.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8fb"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:100%;max-width:760px;background:#fff;border:1px solid #efdfe7;border-radius:20px;overflow:hidden"><tr><td style="padding:30px 34px;background:linear-gradient(120deg,#fff 0%,#fff1f6 64%,#fff5df 100%)"><div style="font:700 11px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cc3f79">Immortal.life · Daily management report</div><h1 style="margin:10px 0 4px;font:700 31px/1.1 Arial,sans-serif;color:#31242c">${escapeHtml(local.label)}</h1><div style="font:13px Arial,sans-serif;color:#826e79">Traffic · new knowledge · operational health</div><div style="display:inline-block;margin-top:18px;padding:8px 13px;border-radius:999px;background:${statusColour};color:#fff;font:700 11px Arial,sans-serif">${status}</div></td></tr><tr><td style="padding:28px 34px"><h2 style="margin:0 0 14px;font:700 20px Arial,sans-serif">Search visibility</h2><table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>${metricCard('Clicks · latest 7 days', searchConfigured ? number(current.clicks) : '—', searchConfigured ? `${clickChange >= 0 ? '+' : ''}${percent(clickChange)} vs previous 7 days` : 'Connection required')}${metricCard('Impressions', searchConfigured ? number(current.impressions) : '—', latestMetricDate ? `Data through ${latestMetricDate}` : 'No imported Google data', 'gold')}${metricCard('Click-through rate', searchConfigured ? percent(ctr) : '—', 'Weighted across queries and devices')}${metricCard('Average position', searchConfigured ? position.toFixed(1) : '—', 'Lower is better', 'gold')}</tr></table><h3 style="margin:23px 0 8px;font:700 14px Arial,sans-serif">Top landing pages</h3><table width="100%" cellspacing="0" cellpadding="0"><tr><th align="left" style="font:700 10px Arial,sans-serif;color:#8c7481">Page</th><th align="right" style="font:700 10px Arial,sans-serif;color:#8c7481">Clicks</th><th align="right" style="font:700 10px Arial,sans-serif;color:#8c7481">Impressions</th></tr>${topPageHtml}</table></td></tr><tr><td style="padding:28px 34px;background:#fffafd;border-top:1px solid #f0e3e9"><h2 style="margin:0 0 14px;font:700 20px Arial,sans-serif">Knowledge added in the last 24 hours</h2><table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>${metricCard('Research records', number(newResearchCount), 'New public records')}${metricCard('Trial records', number(newTrialCount), 'New public registrations', 'gold')}${metricCard('University works', number(newUniversityWorkCount), 'Newly discovered work links')}${metricCard('Open alerts', number(alerts.length), status, alerts.length ? 'alert' : 'gold')}</tr></table><h3 style="margin:24px 0 4px;font:700 14px Arial,sans-serif;color:#cc3f79">Research</h3><table width="100%" cellspacing="0" cellpadding="0">${recordRows(research.data ?? [], 'research')}</table><h3 style="margin:24px 0 4px;font:700 14px Arial,sans-serif;color:#c99328">Trials</h3><table width="100%" cellspacing="0" cellpadding="0">${recordRows(trials.data ?? [], 'trials')}</table><h3 style="margin:24px 0 4px;font:700 14px Arial,sans-serif;color:#cc3f79">University research works</h3><table width="100%" cellspacing="0" cellpadding="0">${recordRows(universityWorks.data ?? [], 'universities')}</table></td></tr><tr><td style="padding:28px 34px;border-top:1px solid #f0e3e9"><h2 style="margin:0 0 12px;font:700 20px Arial,sans-serif">Website health</h2><ul style="margin:0;padding-left:20px;font:13px/1.55 Arial,sans-serif;color:#624f5a">${alertHtml}</ul>${delayedSources.length ? `<h3 style="margin:20px 0 6px;font:700 13px Arial,sans-serif">Sources needing attention</h3><p style="margin:0;font:12px/1.55 Arial,sans-serif;color:#7c6974">${escapeHtml(delayedSources.map((source: any) => source.name).join(' · '))}</p>` : ''}<p style="margin:22px 0 0;font:11px/1.5 Arial,sans-serif;color:#9b8792">Search Console normally publishes final data with a delay. “New” means first discovered by immortal.life during the rolling 24-hour window; it does not mean the underlying paper or trial was first published today.</p></td></tr><tr><td style="padding:18px 34px;background:#35272f;color:#f8edf2;font:11px Arial,sans-serif">Private management report · ${escapeHtml(DESTINATION)} · <a href="${SITE}" style="color:#f1c65d">immortal.life</a></td></tr></table></td></tr></table></body></html>`

  const reportPayload = { counts: { research: newResearchCount, trials: newTrialCount, university_works: newUniversityWorkCount }, alerts, search: { configured: searchConfigured, latest_metric_date: latestMetricDate, clicks: current.clicks, impressions: current.impressions, ctr, position } }
  const reportInsert = force && alreadySent
    ? await supabase.from('daily_management_reports').update({ destination: DESTINATION, status: 'sending', payload: reportPayload, sent_at: null, error_code: null }).eq('id', alreadySent.id).select('id').single()
    : await supabase.from('daily_management_reports').insert({ report_date: local.date, destination: DESTINATION, status: 'sending', payload: reportPayload }).select('id').single()
  if (reportInsert.error) throw reportInsert.error

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!apiKey) {
    await supabase.from('daily_management_reports').update({ status: 'failed', error_code: 'resend_not_configured' }).eq('id', reportInsert.data.id)
    return jsonResponse(req, { ok: false, error: 'email_not_configured' }, 503, 'POST')
  }
  const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('BRIEFING_FROM_EMAIL') ?? 'immortal.life <briefings@immortal.life>', to: [DESTINATION], subject: `${alerts.length ? 'Attention · ' : ''}immortal.life daily report · ${local.date}`, html }) })
  const emailPayload = await emailResponse.json().catch(() => ({}))
  await supabase.from('daily_management_reports').update({ status: emailResponse.ok ? 'sent' : 'failed', sent_at: emailResponse.ok ? new Date().toISOString() : null, provider_id: cleanText(emailPayload?.id, 200) || null, error_code: emailResponse.ok ? null : `resend_${emailResponse.status}` }).eq('id', reportInsert.data.id)
  return jsonResponse(req, { ok: emailResponse.ok, report_date: local.date, destination: DESTINATION, status, alerts: alerts.length, counts: { research: newResearchCount, trials: newTrialCount, university_works: newUniversityWorkCount }, search_console: { configured: searchConfigured, latest_metric_date: latestMetricDate } }, emailResponse.ok ? 200 : 502, 'POST')
})
