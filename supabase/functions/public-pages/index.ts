import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { researchEvidenceSnapshot, trialEvidenceSnapshot } from '../_shared/intelligence.ts'
import { serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const DISCLOSURE = 'Generated automatically from cited source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates this publication before release.'
const STRICT_TITLE_CONTEXT_TOPICS = new Set(['glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy'])

function hasPublicTopicRelation(record: any, field: string, requestedTopic = ''): boolean {
  return (record?.[field] ?? []).some((relation: any) => {
    if (relation?.is_published === false || (requestedTopic && relation?.topic_slug !== requestedTopic)) return false
    if (!STRICT_TITLE_CONTEXT_TOPICS.has(relation?.topic_slug)) return true
    const fields = Array.isArray(relation?.matched_fields) ? relation.matched_fields : []
    return fields.includes('title') && fields.includes('title context')
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char))
}

function xml(value: unknown): string {
  return escapeHtml(value)
}

function safeId(value: string): number | null {
  if (!/^\d{1,18}$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function response(body: string, type: string, status = 200, cache = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'): Response {
  return new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' } })
}

function streamResponse(body: ReadableStream<Uint8Array>, type: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=900', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' } })
}

function formatDate(value: unknown): string {
  if (!value) return 'Date unavailable'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

function pageShell(input: { title: string; description: string; canonical: string; kicker: string; heading: string; body: string; type?: string; date?: string; socialImage?: string; indexable?: boolean; journeys?: Array<{ href: string; label: string }> }): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': input.type === 'Article' ? 'Article' : 'WebPage',
    headline: input.title,
    description: input.description,
    url: input.canonical,
    datePublished: input.date || undefined,
    dateModified: input.date || undefined,
    publisher: { '@type': 'Organization', name: 'immortal.life', url: SITE },
    isAccessibleForFree: true,
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title><meta name="description" content="${escapeHtml(input.description)}"><meta name="robots" content="${input.indexable === false ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
<link rel="canonical" href="${escapeHtml(input.canonical)}"><link rel="alternate" type="application/rss+xml" title="immortal.life updates" href="${SITE}/feed.xml">
<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(input.title)}"><meta property="og:description" content="${escapeHtml(input.description)}"><meta property="og:url" content="${escapeHtml(input.canonical)}"><meta property="og:image" content="${escapeHtml(input.socialImage || `${SITE}/og-image.png`)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(input.title)}"><meta name="twitter:description" content="${escapeHtml(input.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;1,300&family=Instrument+Sans:wght@300;400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/intelligence.css?v=20260925-evidence-global-b"><link rel="icon" href="/favicon.ico">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head><body>
<header class="intel-header"><a class="intel-logo" href="/" aria-label="immortal.life home"><img src="/linkedin-app-logo.png" width="54" height="54" alt="" decoding="async"><span>immortal.life</span></a><button class="intel-nav-toggle" id="intelNavToggle" type="button" aria-expanded="false" aria-controls="intelNav"><span>Menu</span><i aria-hidden="true"></i></button><nav class="intel-nav" id="intelNav" aria-label="Primary navigation"><a href="/changes">Today</a><a href="/topics">Topics</a><a href="/trials">Trials</a><a href="/universities">Universities</a><a href="/research">Research</a><a href="/discover">Explore</a><a href="/learn">Longevity 101</a><a href="/regulatory">Regulatory</a><a href="/resources">Resources</a><a href="/briefings">Briefings</a><a href="/methodology">How it works</a><form class="intel-nav-search" role="search"><input type="search" aria-label="Search longevity topics" placeholder="Search topics…"><button type="submit">Search</button></form></nav></header>
<main><section class="intel-hero record-hero"><div class="bio-ambient bio-ambient--intel" aria-hidden="true"><div class="bio-dna"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="bio-human"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="intel-kicker">${escapeHtml(input.kicker)}</div><h1>${escapeHtml(input.heading)}</h1><p class="intel-lede">${escapeHtml(input.description)}</p></section>${input.body}<nav class="next-journey" aria-label="Related discoveries"><span>${input.journeys?.length ? 'Related discoveries' : 'Continue exploring'}</span>${(input.journeys?.length ? input.journeys : [{ href: '/changes', label: "What's new today" }, { href: '/topics', label: 'Choose a topic' }, { href: '/trials', label: 'Open Trial Radar' }, { href: '/universities', label: 'Compare universities' }]).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join('')}</nav></main>
<footer class="intel-footer"><p><strong>Automated publication.</strong> ${escapeHtml(DISCLOSURE)} Research information only; not medical advice, diagnosis, or treatment guidance.</p><div><a href="/changes">What's new</a><a href="/reports">Reports</a><a href="/data">Data & feeds</a><a href="/methodology">Methodology</a><a href="/automation">Automation disclosure</a><a href="/corrections">Corrections</a><span>© 2026 immortal.life</span></div></footer><nav class="mobile-dock" aria-label="Mobile navigation"><a href="/"><span aria-hidden="true">⌂</span>Home</a><a href="/topics"><span aria-hidden="true">◇</span>Topics</a><a href="/trials"><span aria-hidden="true">＋</span>Trials</a><a href="/changes"><span aria-hidden="true">↻</span>Updates</a><button type="button" data-mobile-menu-open><span aria-hidden="true">☰</span>Menu</button></nav><script src="/il-config.js"></script><script src="/intelligence.js?v=20260925-evidence-global-b"></script><script src="/telemetry.js"></script></body></html>`
}

function chips(topics: string[]): string {
  return topics.map((slug) => `<a class="record-tag" href="/topics/${encodeURIComponent(slug)}">${escapeHtml(slug.replace(/-/g, ' '))}</a>`).join('')
}

function recordBody(rows: Array<[string, unknown]>, summary: unknown, sourceUrl: unknown, topics: string[], citationUrl: string, extra = '', guide: Array<[string, string]> = []): string {
  const guideHtml = guide.length ? `<section class="record-meaning" aria-labelledby="recordMeaning"><span class="section-index">Plain-language guide</span><h2 id="recordMeaning">Five questions to ask about this record</h2><dl class="record-guide">${guide.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>` : ''
  return `<section class="intel-section record-detail">${guideHtml}<div class="record-detail-grid"><dl>${rows.filter(([, value]) => value != null && value !== '').map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><article><span class="section-index">Automated source synopsis</span><p class="record-summary">${escapeHtml(summary || 'No source synopsis is available.')}</p>${extra}<div class="record-tags">${chips(topics)}</div><div class="record-links"><a class="section-link" data-il-event="open_source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open primary source</a><a class="section-link" href="${escapeHtml(citationUrl)}">Export JSON</a></div></article></div><aside class="automation-notice"><strong>How to read this page</strong><p>${escapeHtml(DISCLOSURE)} Verify consequential details at the linked primary source.</p></aside></section>`
}

async function getRecord(supabase: any, kind: string, id: number): Promise<any | null> {
  const specs: Record<string, { table: string; select: string }> = {
    research: { table: 'research_items', select: '*,research_item_topics(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug)),content_sources(name,homepage_url)' },
    trials: { table: 'clinical_trials', select: '*,clinical_trial_topics(topic_slug,relevance_score,match_reasons,matched_fields,is_published,intelligence_topics(name,slug)),content_sources(name,homepage_url)' },
    regulatory: { table: 'regulatory_events', select: '*,content_sources(name,homepage_url)' },
    integrity: { table: 'research_integrity_events', select: '*,content_sources(name,homepage_url),research_items(id,title,doi)' },
  }
  const spec = specs[kind]
  if (!spec) return null
  const { data, error } = await supabase.from(spec.table).select(spec.select).eq('id', id).eq('publication_state', 'published').maybeSingle()
  if (error) throw error
  if (data?.research_item_topics) data.research_item_topics = data.research_item_topics.filter((item: any) => item?.is_published !== false)
  if (data?.clinical_trial_topics) data.clinical_trial_topics = data.clinical_trial_topics.filter((item: any) => item?.is_published !== false)
  return data
}

function relationTopics(record: any, field: string): string[] {
  return (record?.[field] ?? []).filter((item: any) => item?.is_published !== false).map((item: any) => item?.intelligence_topics?.slug || item?.topic_slug).filter(Boolean)
}

function qualityDisclosure(record: any, relationField = ''): string {
  const relations = relationField ? (record?.[relationField] ?? []).filter((item: any) => item?.is_published !== false) : []
  const details = relations.map((item: any) => {
    const topic = item?.intelligence_topics?.name || item?.topic_slug || 'Tracked topic'
    const reasons = Array.isArray(item?.match_reasons) ? item.match_reasons : []
    return `<li><strong>${escapeHtml(topic)} · ${Number(item?.relevance_score ?? record?.relevance_confidence ?? 0)}%</strong>${reasons.length ? `<span>${escapeHtml(reasons.join(' '))}</span>` : ''}</li>`
  }).join('')
  return `<details class="quality-explanation"><summary>Why this record appears here · ${Number(record?.relevance_confidence ?? 0)}% topic match</summary><p>The title, summary, or source keywords matched one or more topics followed by immortal.life. A higher percentage means a stronger topic match; it does not rate safety, effectiveness, or study quality.</p>${details ? `<ul>${details}</ul>` : ''}<p>Automated source check ${Number(record?.source_quality_score ?? 0)}% · update recency ${Number(record?.freshness_score ?? 0)}%. These figures help sort records; they are not medical ratings.</p></details>`
}

function evidenceSnapshotHtml(snapshot: any): string {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.evidence_stage) return ''
  const value = (input: any): string => Array.isArray(input) ? input.filter(Boolean).join('; ') : input == null || input === '' ? 'Not reported' : String(input)
  const fields: Array<[string, any]> = [
    ['Evidence stage', snapshot.evidence_stage],
    ['Study design', snapshot.study_design],
    ['Evidence population', snapshot.subject_scope],
    ['Participants', snapshot.participants],
    ['Population', snapshot.population],
    ['Duration', snapshot.duration],
    ['Intervention', snapshot.intervention],
    ['Comparator', snapshot.comparator],
    ['Outcomes measured', snapshot.outcomes_measured],
    ['Reported result', snapshot.reported_outcome || 'No reusable finding-level result is available in this record.'],
  ]
  return `<section class="evidence-snapshot" aria-labelledby="evidenceSnapshotTitle"><span class="section-index">Evidence snapshot</span><h2 id="evidenceSnapshotTitle">What the source actually supports</h2><dl>${fields.map(([name, field]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value(field))}</dd></div>`).join('')}</dl><div class="evidence-snapshot-notes"><p><strong>Main limitation</strong>${escapeHtml(value(snapshot.main_limitation))}</p><p><strong>Safety and approval</strong>${escapeHtml(value(snapshot.safety_context))} ${escapeHtml(value(snapshot.regulatory_context))}</p><p><strong>Source support</strong>${escapeHtml(value(snapshot.source_support))}</p></div></section>`
}

function evidenceLadderHtml(level: unknown): string {
  const value = String(level || '').toLowerCase()
  const stages = [
    { label: 'Lab or animal', match: ['preclinical', 'animal', 'in vitro', 'mechanistic'] },
    { label: 'Human study', match: ['observational', 'cohort', 'case-control', 'human'] },
    { label: 'Randomized trial', match: ['randomized', 'randomised', 'rct', 'clinical trial'] },
    { label: 'Evidence synthesis', match: ['meta-analysis', 'systematic review', 'guideline'] },
  ]
  const active = value.includes('synthesis') || value.includes('meta-analysis') || value.includes('systematic review') || value.includes('guideline') ? 3
    : value.includes('randomized') || value.includes('randomised') || value.includes('rct') || value.includes('clinical trial') ? 2
    : value.includes('human') || value.includes('observational') || value.includes('cohort') || value.includes('case-control') ? 1
    : value ? 0 : -1
  return `<div class="record-ladder-intro"><strong>Evidence stage · ${escapeHtml(String(level || 'Not classified'))}</strong><span>This describes the study type, not whether an intervention is safe or effective.</span></div><div class="evidence-ladder" aria-label="Evidence stage">${stages.map((stage, index) => `<span${index === active ? ' class="is-current"' : index < active ? ' class="is-passed"' : ''}>${stage.label}</span>`).join('')}</div>`
}

function trialLadderHtml(phases: unknown): string {
  const value = (Array.isArray(phases) ? phases.join(' ') : String(phases || '')).toLowerCase()
  const stages = ['Early phase', 'Phase 2', 'Phase 3', 'Phase 4']
  let active = value.includes('phase 4') ? 3 : value.includes('phase 3') ? 2 : value.includes('phase 2') ? 1 : value ? 0 : -1
  return `<div class="record-ladder-intro"><strong>Trial stage · ${escapeHtml(Array.isArray(phases) && phases.length ? phases.join(', ') : 'Phase not reported')}</strong><span>A trial phase describes development stage; it does not establish a positive result.</span></div><div class="evidence-ladder evidence-ladder--trial" aria-label="Trial stage">${stages.map((stage, index) => `<span${index === active ? ' class="is-current"' : index < active ? ' class="is-passed"' : ''}>${stage}</span>`).join('')}</div>`
}

function citation(record: any, kind: string, format: string): Response {
  const id = `${kind}-${record.id}`
  const title = String(record.title || 'Untitled record')
  const year = String(record.published_on || record.last_update_date || record.published_at || record.announced_on || '').slice(0, 4)
  const source = String(record.journal || record.sponsor || record.content_sources?.name || 'Source record')
  const url = String(record.source_url || `${SITE}/${kind}/${record.id}`)
  if (format === 'bibtex') {
    const key = `immortallife_${kind}_${record.id}`
    const authors = Array.isArray(record.authors) ? record.authors.join(' and ') : String(record.authors || '')
    const body = `@misc{${key},\n  title = {${title.replace(/[{}]/g, '')}},\n${authors ? `  author = {${authors.replace(/[{}]/g, '')}},\n` : ''}${year ? `  year = {${year}},\n` : ''}  howpublished = {${source.replace(/[{}]/g, '')}},\n  url = {${url}}\n}\n`
    return response(body, 'application/x-bibtex; charset=utf-8')
  }
  if (format === 'ris') {
    const authors = (Array.isArray(record.authors) ? record.authors : []).map((author: string) => `AU  - ${author}\n`).join('')
    return response(`TY  - GEN\nID  - ${id}\nTI  - ${title}\n${authors}${year ? `PY  - ${year}\n` : ''}T2  - ${source}\nUR  - ${url}\nER  - \n`, 'application/x-research-info-systems; charset=utf-8')
  }
  return response(JSON.stringify({ type: kind, record, canonical_url: `${SITE}/${kind}/${record.id}`, automation_disclosure: DISCLOSURE }), 'application/json; charset=utf-8')
}

function renderRecord(kind: string, record: any): string {
  const id = Number(record.id)
  const canonical = `${SITE}/${kind}/${id}`
  let title = String(record.title || 'Intelligence record')
  let description = String(record.editorial_summary || record.summary || title).slice(0, 260)
  let kicker = 'Source-backed intelligence record'
  let rows: Array<[string, unknown]> = []
  let topics: string[] = []
  let date: string | undefined
  let extra = ''
  let guide: Array<[string, string]> = []
  if (kind === 'research') {
    if (!record.evidence_snapshot || !Object.keys(record.evidence_snapshot).length) record.evidence_snapshot = researchEvidenceSnapshot(record)
    topics = relationTopics(record, 'research_item_topics'); date = record.published_on
    rows = [['Published', formatDate(record.published_on)], ['Journal', record.journal], ['Authors', Array.isArray(record.authors) ? record.authors.join(', ') : record.authors], ['DOI', record.doi], ['Evidence class', record.evidence_level], ['Record status', record.status], ['Match confidence', `${record.relevance_confidence}%`], ['Citations', record.cited_by_count], ['Source feed', record.content_sources?.name]]
    kicker = record.status === 'retracted' ? 'Retracted research record' : 'Research record'
    extra = evidenceSnapshotHtml(record.evidence_snapshot) + evidenceLadderHtml(record.evidence_level) + qualityDisclosure(record, 'research_item_topics')
    guide = [['What this is', `${record.evidence_level || 'Research'} record from ${record.journal || 'a scholarly source'}.`], ['Why it may matter', 'It matched a longevity topic and may show how that evidence area is developing.'], ['Evidence', `Automated topic match ${record.relevance_confidence || 0}%; this is not a medical rating.`], ['Main limitation', 'One research record does not prove safety, effectiveness, or usefulness for an individual.'], ['What changed', `Source metadata was published or refreshed ${formatDate(record.published_on)}.`], ['Where to verify', 'Open the primary source below for methods, population, results, and limitations.']]
  } else if (kind === 'trials') {
    if (!record.evidence_snapshot || !Object.keys(record.evidence_snapshot).length) record.evidence_snapshot = trialEvidenceSnapshot(record)
    topics = relationTopics(record, 'clinical_trial_topics'); date = record.last_update_date
    rows = [['Registry ID', record.external_id], ['Last registry update', formatDate(record.last_update_date)], ['Status', record.overall_status], ['Phase', (record.phases || []).join(', ')], ['Sponsor', record.sponsor], ['Enrollment', record.enrollment], ['Countries', (record.countries || []).join(', ')], ['Match confidence', `${record.relevance_confidence}%`], ['Source feed', record.content_sources?.name]]
    kicker = 'Clinical trial registry record'
    extra = evidenceSnapshotHtml(record.evidence_snapshot) + trialLadderHtml(record.phases) + '<p class="record-caveat">Registration and recruitment status do not establish safety, efficacy, or regulatory approval.</p>' + qualityDisclosure(record, 'clinical_trial_topics')
    guide = [['What this is', 'A clinical study registration, not a result or recommendation.'], ['Why it may matter', `The registry currently reports ${String(record.overall_status || 'an unknown status').replace(/_/g, ' ')}.`], ['Evidence', `Registered ${Array.isArray(record.phases) && record.phases.length ? record.phases.join(', ') : 'phase not supplied'} study.`], ['Main limitation', 'Registration does not prove that the intervention works, is safe, or is available to you.'], ['What changed', `Registry metadata was last updated ${formatDate(record.last_update_date)}.`], ['Where to verify', 'Open the primary registry below for eligibility, locations, contacts, and current status.']]
  } else if (kind === 'regulatory') {
    topics = record.matched_topics || []; date = record.published_at
    rows = [['Jurisdiction', record.jurisdiction], ['Category', record.category], ['Published', formatDate(record.published_at)], ['Match confidence', `${record.relevance_confidence}%`], ['Official feed', record.content_sources?.name]]
    kicker = 'Official regulatory notice'
    extra = qualityDisclosure(record)
    guide = [['What this is', `An official ${record.category || 'regulatory'} notice from ${record.jurisdiction || 'a public authority'}.`], ['Why it may matter', 'Official notices can change approval, recall, safety, or monitoring context.'], ['Evidence', 'This is an authority notice, not a clinical study.'], ['Main limitation', 'It applies only to the product, use, date, and jurisdiction named in the notice.'], ['What changed', `Published or refreshed ${formatDate(record.published_at)}.`], ['Where to verify', 'Open the primary source below for the authority’s exact wording.']]
  } else {
    date = record.announced_on || record.detected_at
    rows = [['Event', record.event_type], ['Announced', formatDate(record.announced_on)], ['Detected', formatDate(record.detected_at)], ['Source feed', record.content_sources?.name], ['Linked research', record.research_items?.title]]
    kicker = 'Research integrity event'
    extra = record.research_items?.id ? `<p class="record-caveat">Linked record: <a href="/research/${Number(record.research_items.id)}">${escapeHtml(record.research_items.title)}</a></p>` : ''
    guide = [['What this is', `A ${String(record.event_type || 'research integrity').replace(/_/g, ' ')} event.`], ['Why it may matter', 'Corrections, retractions, and concerns can change how earlier evidence should be read.'], ['Evidence', 'This page records the integrity notice and its link to the indexed work.'], ['Main limitation', 'The event’s exact scope must be read in the original notice.'], ['What changed', `Detected ${formatDate(record.detected_at)}.`], ['Where to verify', 'Open the primary source below to inspect the original notice.']]
  }
  const exports = kind === 'research' ? `${extra}<p class="record-exports"><a href="/api/intelligence/${kind}/${id}?format=bibtex">BibTeX</a> · <a href="/api/intelligence/${kind}/${id}?format=ris">RIS</a></p>` : extra
  const body = recordBody(rows, record.editorial_summary || record.summary, record.source_url, topics, `/api/intelligence/${kind}/${id}`, exports, guide)
  const firstTopic = topics[0]
  const journeys = firstTopic ? [{ href: `/topics/${firstTopic}`, label: `Open the ${firstTopic.replace(/-/g, ' ')} guide` }, { href: `/topics/${firstTopic}#researchSection`, label: 'See related research' }, { href: `/topics/${firstTopic}#trialsSection`, label: 'See related trials' }, { href: `/universities?topic=${firstTopic}`, label: 'Find university activity' }] : undefined
  return pageShell({ title: `${title} — immortal.life`, description, canonical, kicker, heading: title, body, type: 'Article', date, socialImage: `${SITE}/social-card/${kind}/${id}.png`, journeys })
}

async function loadRecent(supabase: any, limit = 30): Promise<any[]> {
  const [research, trials, regulatory, integrity] = await Promise.all([
    supabase.from('research_items').select('id,title,editorial_summary,published_on,last_seen_at').eq('publication_state', 'published').order('published_on', { ascending: false, nullsFirst: false }).limit(limit),
    supabase.from('clinical_trials').select('id,title,editorial_summary,last_update_date,last_seen_at').eq('publication_state', 'published').order('last_update_date', { ascending: false, nullsFirst: false }).limit(limit),
    supabase.from('regulatory_events').select('id,title,summary,published_at,last_seen_at').eq('publication_state', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(limit),
    supabase.from('research_integrity_events').select('id,title,summary,announced_on,detected_at').eq('publication_state', 'published').order('detected_at', { ascending: false }).limit(limit),
  ])
  for (const result of [research, trials, regulatory, integrity]) if (result.error) throw result.error
  return [
    ...(research.data ?? []).map((r: any) => ({ ...r, kind: 'research', date: r.published_on || r.last_seen_at, summary: r.editorial_summary })),
    ...(trials.data ?? []).map((r: any) => ({ ...r, kind: 'trials', date: r.last_update_date || r.last_seen_at, summary: r.editorial_summary })),
    ...(regulatory.data ?? []).map((r: any) => ({ ...r, kind: 'regulatory', date: r.published_at || r.last_seen_at })),
    ...(integrity.data ?? []).map((r: any) => ({ ...r, kind: 'integrity', date: r.announced_on || r.detected_at })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit)
}

function sitemapUrlset(urls: Array<{ path: string; modified?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((item) => `<url><loc>${xml(SITE + item.path)}</loc>${item.modified ? `<lastmod>${xml(String(item.modified).slice(0, 10))}</lastmod>` : ''}</url>`).join('')}</urlset>`
}

async function collectAllRows(fetchPage: (from: number, to: number) => PromiseLike<any>, pageSize = 1000): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await fetchPage(offset, offset + pageSize - 1)
    if (result.error) throw result.error
    const page = result.data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

async function sitemap(supabase: any, type = 'index'): Promise<string> {
  const allowed = ['static', 'topics', 'research', 'trials', 'regulatory', 'integrity', 'briefings', 'entities', 'universities']
  if (type === 'index') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allowed.map((name) => `<sitemap><loc>${SITE}/sitemaps/${name}.xml</loc></sitemap>`).join('')}</sitemapindex>`
  }
  if (!allowed.includes(type)) return sitemapUrlset([])
  if (type === 'static') {
    return sitemapUrlset(['', '/learn', '/discover', '/changes', '/discover/regulatory-status', '/discover/research-integrity', '/research', '/trials', '/topics', '/universities', '/regulatory', '/integrity', '/evidence-graph', '/briefings', '/resources', '/entities', '/quality', '/reports', '/methodology', '/automation', '/publication-policy', '/corrections', '/data'].map((path) => ({ path })))
  }
  let urls: Array<{ path: string; modified?: string }> = []
  if (type === 'topics') {
    const rows = await collectAllRows((from, to) => supabase.from('intelligence_topics').select('slug,updated_at').eq('enabled', true).order('slug').range(from, to))
    urls = rows.map((row: any) => ({ path: `/topics/${row.slug}`, modified: row.updated_at }))
  } else if (type === 'briefings') {
    const rows = await collectAllRows((from, to) => supabase.from('public_briefings').select('slug,updated_at').order('period_start', { ascending: false }).range(from, to))
    urls = rows.map((row: any) => ({ path: `/briefings/${row.slug}`, modified: row.updated_at }))
  } else if (type === 'entities') {
    const rows = await collectAllRows((from, to) => supabase.from('intelligence_entities').select('kind,slug,updated_at,record_count,metadata').neq('kind', 'topic').order('updated_at', { ascending: false }).order('slug').range(from, to))
    urls = rows.filter((row: any) => Number(row.record_count ?? 0) >= Number(row.metadata?.minimum_records ?? 1)).map((row: any) => ({ path: `/entities/${row.kind}/${row.slug}`, modified: row.updated_at }))
  } else if (type === 'universities') {
    const rows = await collectAllRows((from, to) => supabase.from('university_research_institutions').select('slug,updated_at').eq('is_eligible', true).order('research_index_score', { ascending: false }).order('slug').range(from, to))
    urls = rows.map((row: any) => ({ path: `/universities/${row.slug}`, modified: row.updated_at }))
  } else {
    const spec: Record<string, { table: string; modified: string }> = {
      research: { table: 'research_items', modified: 'last_seen_at' }, trials: { table: 'clinical_trials', modified: 'last_seen_at' },
      regulatory: { table: 'regulatory_events', modified: 'last_seen_at' }, integrity: { table: 'research_integrity_events', modified: 'detected_at' },
    }
    const selected = spec[type]
    const rows = await collectAllRows((from, to) => supabase.from(selected.table).select(`id,${selected.modified}`).eq('publication_state', 'published').order('id', { ascending: false }).range(from, to))
    urls = rows.map((row: any) => ({ path: `/${type}/${row.id}`, modified: row[selected.modified] }))
  }
  return sitemapUrlset(urls)
}

async function feed(supabase: any, format: string, topic = ''): Promise<Response> {
  let items = await loadRecent(supabase, 80)
  if (topic && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)) {
    const [researchLinks, trialLinks, regulatory] = await Promise.all([
      supabase.from('research_item_topics').select('research_item_id').eq('topic_slug', topic).eq('is_published', true),
      supabase.from('clinical_trial_topics').select('clinical_trial_id').eq('topic_slug', topic).eq('is_published', true),
      supabase.from('regulatory_events').select('id').eq('publication_state', 'published').contains('matched_topics', [topic]),
    ])
    const researchIds = new Set((researchLinks.data ?? []).map((row: any) => Number(row.research_item_id)))
    const trialIds = new Set((trialLinks.data ?? []).map((row: any) => Number(row.clinical_trial_id)))
    const regulatoryIds = new Set((regulatory.data ?? []).map((row: any) => Number(row.id)))
    items = items.filter((item) => {
      if (item.kind === 'research') return researchIds.has(Number(item.id))
      if (item.kind === 'trials') return trialIds.has(Number(item.id))
      if (item.kind === 'regulatory') return regulatoryIds.has(Number(item.id))
      return false
    }).slice(0, 40)
  } else {
    items = items.slice(0, 40)
  }
  const feedTitle = topic ? `immortal.life · ${topic.replace(/-/g, ' ')}` : 'immortal.life automated intelligence'
  if (format === 'json') return response(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: feedTitle, home_page_url: topic ? `${SITE}/topics/${topic}` : SITE, feed_url: topic ? `${SITE}/feeds/topics/${topic}.json` : `${SITE}/feed.json`, description: DISCLOSURE, items: items.map((item) => ({ id: `${SITE}/${item.kind}/${item.id}`, url: `${SITE}/${item.kind}/${item.id}`, title: item.title, content_text: item.summary || item.title, date_published: item.date })) }), 'application/feed+json; charset=utf-8')
  if (format === 'atom') {
    const updated = items[0]?.date || new Date().toISOString()
    const entries = items.map((item) => `<entry><id>${xml(`${SITE}/${item.kind}/${item.id}`)}</id><link href="${xml(`${SITE}/${item.kind}/${item.id}`)}"/><title>${xml(item.title)}</title><summary>${xml(item.summary || item.title)}</summary><updated>${xml(new Date(item.date).toISOString())}</updated><category term="${xml(item.kind)}"/></entry>`).join('')
    return response(`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/${xml(topic)}</id><title>${xml(feedTitle)}</title><link href="${xml(topic ? `${SITE}/feeds/topics/${topic}.atom` : `${SITE}/feed.atom`)}" rel="self"/><link href="https://pubsubhubbub.appspot.com/" rel="hub"/><link href="${xml(topic ? `${SITE}/topics/${topic}` : `${SITE}/`)}"/><updated>${xml(new Date(updated).toISOString())}</updated><subtitle>${xml(DISCLOSURE)}</subtitle>${entries}</feed>`, 'application/atom+xml; charset=utf-8')
  }
  const entries = items.map((item) => `<item><guid isPermaLink="true">${xml(`${SITE}/${item.kind}/${item.id}`)}</guid><link>${xml(`${SITE}/${item.kind}/${item.id}`)}</link><title>${xml(item.title)}</title><description>${xml(item.summary || item.title)}</description><pubDate>${xml(new Date(item.date).toUTCString())}</pubDate><category>${xml(item.kind)}</category></item>`).join('')
  return response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(feedTitle)}</title><link>${xml(topic ? `${SITE}/topics/${topic}` : SITE)}</link><atom:link href="${xml(topic ? `${SITE}/feeds/topics/${topic}.xml` : `${SITE}/feed.xml`)}" rel="self" type="application/rss+xml"/><atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/><description>${xml(DISCLOSURE)}</description><language>en</language>${entries}</channel></rss>`, 'application/rss+xml; charset=utf-8')
}

async function briefingsPage(supabase: any, slug = ''): Promise<string | null> {
  if (slug) {
    const { data, error } = await supabase.from('public_briefings').select('*').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!data) return null
    const sections = ['research', 'trials', 'regulatory', 'integrity'].map((kind) => {
      const items = data.payload?.[kind] ?? []
      return `<section><h2>${escapeHtml(kind[0].toUpperCase() + kind.slice(1))}</h2>${items.length ? `<ol>${items.map((item: any) => `<li><a href="/${kind}/${Number(item.id)}">${escapeHtml(item.title)}</a></li>`).join('')}</ol>` : '<p>No newly indexed records in this category.</p>'}</section>`
    }).join('')
    const counts = data.payload?.counts ?? {}
    const total = ['research', 'trials', 'regulatory', 'integrity'].reduce((sum, kind) => sum + Number(counts[kind] || 0), 0)
    const summary = total === 0 ? 'No new eligible records were indexed during this weekly window. Source monitoring continued automatically.' : data.summary
    return pageShell({ title: `${data.title} — immortal.life`, description: total === 0 ? summary : data.dek, canonical: `${SITE}/briefings/${data.slug}`, kicker: `${formatDate(data.period_start)} — ${formatDate(data.period_end)}`, heading: data.title, body: `<section class="intel-section legal-copy"><p class="record-summary">${escapeHtml(summary)}</p><aside class="automation-notice"><strong>Automated briefing</strong><p>${escapeHtml(data.automation_disclosure)}</p></aside>${sections}</section>`, type: 'Article', date: data.generated_at, socialImage: `${SITE}/social-card/briefing/${data.slug}.png` })
  }
  const { data, error } = await supabase.from('public_briefings').select('slug,title,dek,period_start,period_end,generated_at,payload').order('period_start', { ascending: false }).limit(100)
  if (error) throw error
  const list = (data ?? []).map((item: any) => {
    const counts = item.payload?.counts ?? {}
    const total = ['research', 'trials', 'regulatory', 'integrity'].reduce((sum, kind) => sum + Number(counts[kind] || 0), 0)
    const dek = total === 0 ? 'No new eligible records this week; source monitoring continued.' : item.dek
    return `<article class="briefing-card"><span class="section-index">${escapeHtml(formatDate(item.period_start))}</span><h2><a href="/briefings/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(dek)}</p></article>`
  }).join('') || '<p class="empty-list">The first weekly public briefing will publish automatically after the next completed weekly window.</p>'
  const subscribe = `<section class="intel-section subscribe-panel"><div><span class="section-index">Email delivery</span><h2>Receive the weekly briefing</h2><p>One source-linked summary each Monday. Confirm once by email and unsubscribe at any time.</p></div><form class="subscribe-form" method="post" action="/api/subscribe"><label>Email address<input type="email" name="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label class="subscribe-consent"><input type="checkbox" name="consent" value="yes" required><span>Email me the weekly briefing. I agree to the <a href="/privacy">privacy notice</a>.</span></label><button type="submit">Subscribe by email</button></form></section>`
  return pageShell({ title: 'Automated weekly longevity briefings — immortal.life', description: 'A weekly, automatically generated record of newly indexed longevity research, trials, regulatory notices, and integrity events.', canonical: `${SITE}/briefings`, kicker: 'Published automatically every Monday', heading: 'Weekly evidence briefings.', body: `${subscribe}<section class="intel-section"><div class="briefing-list">${list}</div></section>` })
}

function changeLabel(value: string): string {
  const labels: Record<string, string> = {
    new_research: 'New research', research_updated: 'Research record updated', new_trial: 'New clinical trial',
    trial_status_changed: 'Clinical trial status updated', new_regulatory_notice: 'New official notice',
    new_integrity_event: 'Correction or retraction',
  }
  return labels[value] || value.replace(/_/g, ' ')
}

async function changesPage(supabase: any): Promise<string> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await supabase.from('intelligence_change_events').select('id,event_type,importance,record_type,record_id,title,occurred_at,topic_slugs,metadata').neq('event_type', 'quality_state_changed').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(250)
  if (error) throw error
  const events = data ?? []
  const counts = ['research', 'trials', 'regulatory', 'integrity'].map((kind) => ({ kind, count: events.filter((event: any) => event.record_type === kind).length })).filter(({ count }) => count > 0)
  const rows = events.slice(0, 100).map((event: any) => `<li class="change-row${event.importance === 'important' ? ' is-important' : ''}"><div><span class="section-index">${escapeHtml(changeLabel(event.event_type))} · ${escapeHtml(formatDate(event.occurred_at))}</span><h2><a data-il-event="open_change" href="/${escapeHtml(event.record_type)}/${Number(event.record_id)}">${escapeHtml(event.title)}</a></h2>${event.topic_slugs?.length ? `<div class="record-tags">${chips(event.topic_slugs)}</div>` : ''}</div><span class="change-kind">${escapeHtml(event.record_type)}</span></li>`).join('')
  const countLabels: Record<string, string> = { research: 'research additions', trials: 'trial additions and updates', regulatory: 'official notices', integrity: 'corrections and retractions' }
  const countLinks: Record<string, string> = { research: '/research', trials: '/trials', regulatory: '/regulatory', integrity: '/discover/research-integrity' }
  const body = `<section class="intel-section changes-section">${counts.length ? `<div class="report-metrics report-metrics--active">${counts.map(({ kind, count }) => `<a class="report-metric" href="${countLinks[kind] || '/changes'}" aria-label="Browse ${escapeHtml(countLabels[kind] || `${kind} updates`)}"><strong>${count}</strong><span>${escapeHtml(countLabels[kind] || `${kind} updates`)} in the last 30 days</span><small>Browse records →</small></a>`).join('')}</div>` : ''}<div class="section-heading report-heading"><div><span class="section-index">Recent additions and updates</span><h2>Newest research and trial updates</h2></div><a class="section-link" href="/changes/feed.xml">Follow by RSS</a></div><ol class="change-list">${rows || '<li class="empty-list">Nothing new has been indexed in this period. Source monitoring continues automatically.</li>'}</ol><aside class="automation-notice"><strong>How to read this feed</strong><p>This page lists newly found records and source updates. It does not mean that an intervention works, is safe, or is medically important.</p></aside></section>`
  return pageShell({ title: "What's new in longevity research — immortal.life", description: 'New longevity research, clinical trial updates, official notices, corrections and retractions, collected automatically.', canonical: `${SITE}/changes`, kicker: 'Updated automatically', heading: "What's new in longevity?", body, indexable: events.length >= 3, socialImage: `${SITE}/social-card/changes/latest.png` })
}

async function changeFeed(supabase: any, format: string): Promise<Response> {
  const { data, error } = await supabase.from('intelligence_change_events').select('id,event_type,record_type,record_id,title,occurred_at').neq('event_type', 'quality_state_changed').order('occurred_at', { ascending: false }).limit(50)
  if (error) throw error
  const items = data ?? []
  if (format === 'json') return response(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: "immortal.life · what's new", home_page_url: `${SITE}/changes`, feed_url: `${SITE}/changes/feed.json`, description: DISCLOSURE, items: items.map((item: any) => ({ id: `${SITE}/changes#${item.id}`, url: `${SITE}/${item.record_type}/${item.record_id}`, title: `${changeLabel(item.event_type)}: ${item.title}`, date_published: item.occurred_at })) }), 'application/feed+json; charset=utf-8')
  const entries = items.map((item: any) => `<item><guid isPermaLink="false">${xml(`${SITE}/changes#${item.id}`)}</guid><link>${xml(`${SITE}/${item.record_type}/${item.record_id}`)}</link><title>${xml(`${changeLabel(item.event_type)}: ${item.title}`)}</title><pubDate>${xml(new Date(item.occurred_at).toUTCString())}</pubDate><category>${xml(item.record_type)}</category></item>`).join('')
  return response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>immortal.life · what's new</title><link>${SITE}/changes</link><description>${xml(DISCLOSURE)}</description>${entries}</channel></rss>`, 'application/rss+xml; charset=utf-8')
}

function entityRecordList(items: any[], kind: 'research' | 'trials'): string {
  if (!items.length) return '<p class="empty-list">No currently published records are linked to this entity.</p>'
  return `<ol class="entity-record-list">${items.map((item) => `<li><a href="/${kind}/${Number(item.id)}">${escapeHtml(item.title)}</a><span>${escapeHtml(kind === 'research' ? formatDate(item.published_on) : formatDate(item.last_update_date))} · ${Number(item.relevance_confidence ?? 0)}% match confidence</span></li>`).join('')}</ol>`
}

async function entityPage(supabase: any, kind: string, slug: string): Promise<string | null> {
  if (!['topic', 'journal', 'sponsor', 'source'].includes(kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  const { data: entity, error } = await supabase.from('intelligence_entities').select('*').eq('kind', kind).eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!entity) return null

  let researchQuery = supabase.from('research_items').select('id,title,published_on,relevance_confidence').eq('publication_state', 'published').limit(50)
  let trialQuery = supabase.from('clinical_trials').select('id,title,last_update_date,relevance_confidence').eq('publication_state', 'published').limit(50)
  if (kind === 'topic') {
    researchQuery = supabase.from('research_items').select('id,title,published_on,relevance_confidence,research_item_topics!inner(topic_slug,matched_fields,is_published)').eq('publication_state', 'published').eq('research_item_topics.topic_slug', slug).eq('research_item_topics.is_published', true).limit(50)
    trialQuery = supabase.from('clinical_trials').select('id,title,last_update_date,relevance_confidence,clinical_trial_topics!inner(topic_slug,matched_fields,is_published)').eq('publication_state', 'published').eq('clinical_trial_topics.topic_slug', slug).eq('clinical_trial_topics.is_published', true).limit(50)
  } else if (kind === 'journal') {
    researchQuery = researchQuery.eq('journal', entity.name)
    trialQuery = trialQuery.eq('id', -1)
  } else if (kind === 'sponsor') {
    researchQuery = researchQuery.eq('id', -1)
    trialQuery = trialQuery.eq('sponsor', entity.name)
  } else {
    const { data: source } = await supabase.from('content_sources').select('id').eq('name', entity.name).maybeSingle()
    if (source?.id) {
      researchQuery = researchQuery.eq('source_id', source.id)
      trialQuery = trialQuery.eq('source_id', source.id)
    } else {
      researchQuery = researchQuery.eq('id', -1)
      trialQuery = trialQuery.eq('id', -1)
    }
  }
  const [research, trials] = await Promise.all([
    researchQuery.order('published_on', { ascending: false, nullsFirst: false }),
    trialQuery.order('last_update_date', { ascending: false, nullsFirst: false }),
  ])
  if (research.error) throw research.error
  if (trials.error) throw trials.error
  const canonical = `${SITE}/entities/${kind}/${slug}`
  const kindLabels: Record<string, string> = { topic: 'Topic', journal: 'Journal', sponsor: 'Trial sponsor', source: 'Scientific source' }
  const visibleResearch = kind === 'topic' ? (research.data ?? []).filter((item: any) => hasPublicTopicRelation(item, 'research_item_topics', slug)) : (research.data ?? [])
  const visibleTrials = kind === 'topic' ? (trials.data ?? []).filter((item: any) => hasPublicTopicRelation(item, 'clinical_trial_topics', slug)) : (trials.data ?? [])
  const recordCount = visibleResearch.length + visibleTrials.length
  const minimumRecords = Number(entity.metadata?.minimum_records ?? (kind === 'journal' ? 3 : kind === 'sponsor' ? 2 : 1))
  const body = `<section class="intel-section entity-detail"><div class="quality-stat"><span>Type</span><strong>${escapeHtml(kindLabels[kind] || kind)}</strong></div><a class="quality-stat quality-stat--link" href="#entity-records"><span>Eligible records</span><strong>${recordCount}</strong><small>View records →</small></a><div id="entity-records"><h2>Research</h2>${entityRecordList(visibleResearch, 'research')}<h2>Clinical trials</h2>${entityRecordList(visibleTrials, 'trials')}</div><aside class="automation-notice"><strong>Built automatically from source records</strong><p>Names and links come directly from source information. No human reviewer merges identities or evaluates individual records. Pages below their ${minimumRecords}-record usefulness threshold remain out of search results.</p>${kind === 'topic' ? `<p><a class="section-link" href="/topics/${encodeURIComponent(slug)}">Open the full topic guide</a></p>` : ''}</aside></section>`
  return pageShell({ title: `${entity.name} — immortal.life entity`, description: entity.description, canonical, kicker: kindLabels[kind] || 'Evidence directory', heading: entity.name, body, socialImage: `${SITE}/social-card/entity/${kind}-${slug}.png`, indexable: kind !== 'topic' && recordCount >= minimumRecords })
}

async function universityPage(supabase: any, slug: string): Promise<string | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  const { data: university, error } = await supabase.from('university_research_institutions').select('*').eq('slug', slug).eq('is_eligible', true).maybeSingle()
  if (error) throw error
  if (!university) return null
  const { data: scopedMetrics, error: scopedError } = await supabase.from('university_research_topic_metrics')
    .select('topic_slug,works_all_time,works_five_year,works_two_year,representative_work_count,representative_citations,representative_open_access_count,intelligence_topics(name,description)')
    .eq('openalex_id', university.openalex_id).order('works_five_year', { ascending: false })
  if (scopedError) throw scopedError
  const rows = scopedMetrics ?? []
  const maxWorks = Math.max(1, ...rows.map((metric: any) => Number(metric.works_all_time ?? 0)))
  const topicRows = rows.map((metric: any) => {
    const works = Number(metric.works_all_time ?? 0)
    const fiveYear = Number(metric.works_five_year ?? 0)
    const recent = Number(metric.works_two_year ?? 0)
    const topicName = metric.intelligence_topics?.name || metric.topic_slug.replace(/-/g, ' ')
    const completeWorks = `/api/universities/${encodeURIComponent(slug)}/works?topic=${encodeURIComponent(metric.topic_slug)}`
    return `<article class="university-topic-row"><div><h3><a href="/topics/${encodeURIComponent(metric.topic_slug)}">${escapeHtml(topicName)}</a></h3><p>${works} source-matched work links across all available history · ${fiveYear} in the rolling five-year window · ${recent} in the rolling two-year window · ${Number(metric.representative_citations ?? 0)} citations across all linked works</p><a class="section-link" href="${completeWorks}">Browse every linked work →</a></div><div class="university-topic-bar" aria-label="Relative all-time activity for ${escapeHtml(topicName)}"><i style="width:${Math.max(3, Math.round(100 * works / maxWorks))}%"></i></div><strong class="utility-value">${works}</strong></article>`
  }).join('')
  const location = [university.city, university.region, university.country_name || university.country_code].filter(Boolean).join(', ') || 'Location unavailable'
  const links = [
    university.homepage_url ? `<a class="section-link" href="${escapeHtml(university.homepage_url)}" target="_blank" rel="noopener noreferrer">University website</a>` : '',
    `<a class="section-link" href="${escapeHtml(university.openalex_url)}" target="_blank" rel="noopener noreferrer">OpenAlex institution record</a>`,
    university.ror_id ? `<a class="section-link" href="${escapeHtml(university.ror_id)}" target="_blank" rel="noopener noreferrer">ROR identity record</a>` : '',
  ].filter(Boolean).join('')
  const body = `<section class="intel-section"><div class="university-profile-metrics"><div><strong>${Number(university.research_index_score ?? 0).toFixed(1)}</strong><span>Transparent research index score</span></div><div><strong>${Number(university.indexed_works_all_time ?? 0)}</strong><span>All-time longevity work links</span></div><div><strong>${Number(university.indexed_works_five_year ?? 0)}</strong><span>Rolling five-year work links</span></div><div><strong>${Number(university.indexed_topic_count ?? 0)}</strong><span>Longevity topics represented</span></div><div><strong>${Number(university.momentum_score ?? 0).toFixed(0)}%</strong><span>Share in the rolling two-year window</span></div><div><strong>${university.representative_open_access_share == null ? 'N/A' : `${Number(university.representative_open_access_share).toFixed(0)}%`}</strong><span>Open-access share across linked works</span></div></div><div class="record-links">${links}</div><p class="quality-intro">${escapeHtml(location)}. This profile is generated from all retained OpenAlex work affiliations resolved against ROR institution identities.</p><section class="university-topic-profile"><div class="section-heading"><div><span class="section-index">Topic profile</span><h2>Where the indexed activity appears</h2></div><a class="section-link" href="/universities">Compare universities</a></div>${topicRows || '<p class="empty-list">Topic metrics will appear after the next automated refresh.</p>'}</section><aside class="automation-notice"><strong>Activity is not quality</strong><p>This index does not rank teaching, clinical care, study quality, safety, effectiveness, or institutional quality. Counts can overlap when several universities appear on one paper. OpenAlex affiliation matching, citations, open-access status, and publication dates can be incomplete or incorrect. Every retained work remains source-linked and available through the complete work list.</p></aside></section>`
  const description = `${university.name} longevity research profile: ${university.indexed_works_all_time ?? 0} source-matched work links across ${university.indexed_topic_count} tracked topics and all available history.`
  return pageShell({ title: `${university.name} longevity research — immortal.life`, description, canonical: `${SITE}/universities/${slug}`, kicker: 'Global University Research Index', heading: university.name, body, socialImage: `${SITE}/social-card/university/${slug}.png`, indexable: Number(university.indexed_works_five_year ?? 0) >= 3 })
}

function slugify(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function utilityCard(title: string, value: unknown, copy: string, href: string, action: string, accent = ''): string {
  const displayValue = typeof value === 'number' ? value : value
  return `<article class="utility-card${accent ? ` utility-card--${escapeHtml(accent)}` : ''}"><div><span class="utility-value">${escapeHtml(displayValue)}</span><h2><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2></div><p>${escapeHtml(copy)}</p><a class="section-link" href="${escapeHtml(href)}">${escapeHtml(action)}</a></article>`
}

function compactRecordList(items: any[], kind: string, empty: string): string {
  if (!items.length) return `<p class="empty-list">${escapeHtml(empty)}</p>`
  return `<ol class="entity-record-list">${items.map((item) => `<li><a href="/${kind}/${Number(item.id)}">${escapeHtml(item.title)}</a><span>${escapeHtml(kind === 'trials' ? item.overall_status?.replace(/_/g, ' ') : kind === 'regulatory' ? `${item.jurisdiction} · ${formatDate(item.published_at)}` : formatDate(item.announced_on || item.detected_at))}</span></li>`).join('')}</ol>`
}

const COUNTRY_POINTS: Record<string, [number, number]> = {
  'united-states': [250, 210], 'canada': [225, 145], 'mexico': [245, 280], 'brazil': [375, 375], 'argentina': [360, 445],
  'united-kingdom': [555, 160], 'ireland': [538, 163], 'france': [565, 190], 'germany': [592, 177], 'spain': [548, 215], 'italy': [595, 215],
  'netherlands': [578, 167], 'sweden': [610, 125], 'poland': [626, 180], 'czechia': [610, 190], 'czech-republic': [610, 190], 'switzerland': [580, 196],
  'israel': [660, 242], 'turkey': [650, 215], 'south-africa': [620, 420], 'egypt': [630, 270], 'nigeria': [565, 315],
  'india': [770, 275], 'china': [865, 220], 'japan': [1010, 225], 'south-korea': [965, 225], 'singapore': [865, 340],
  'australia': [970, 405], 'new-zealand': [1090, 440], 'taiwan': [940, 265], 'thailand': [835, 305],
}

function countryPoint(slug: string, index: number): [number, number] {
  if (COUNTRY_POINTS[slug]) return COUNTRY_POINTS[slug]
  let hash = 0; for (const char of slug) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return [120 + Math.abs(hash % 960), 110 + Math.abs((hash >> 8) % 320)]
}

async function discoveryPage(supabase: any, view: string, countrySlug = ''): Promise<string> {
  const recruitingStatuses = ['Recruiting', 'Not Yet Recruiting', 'Enrolling by Invitation', 'Active Not Recruiting']
  const [trialsResult, regulatoryResult, integrityResult, researchCountResult, topicCountResult, universityCountResult] = await Promise.all([
    supabase.from('clinical_trials').select('id,title,overall_status,last_update_date,countries,sponsor,relevance_confidence,clinical_trial_topics(topic_slug,matched_fields,is_published)').eq('publication_state', 'published').in('overall_status', recruitingStatuses).order('last_update_date', { ascending: false, nullsFirst: false }).limit(1000),
    supabase.from('regulatory_events').select('id,title,jurisdiction,category,published_at,relevance_confidence').eq('publication_state', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(300),
    supabase.from('research_integrity_events').select('id,title,event_type,announced_on,detected_at').eq('publication_state', 'published').order('detected_at', { ascending: false }).limit(200),
    supabase.from('research_items').select('id', { count: 'exact', head: true }).eq('publication_state', 'published'),
    supabase.from('intelligence_topics').select('slug', { count: 'exact', head: true }).eq('enabled', true),
    supabase.from('university_research_institutions').select('openalex_id', { count: 'exact', head: true }).eq('is_eligible', true),
  ])
  for (const result of [trialsResult, regulatoryResult, integrityResult, researchCountResult, topicCountResult, universityCountResult]) if (result.error) throw result.error
  const trials = (trialsResult.data ?? []).filter((item: any) => hasPublicTopicRelation(item, 'clinical_trial_topics'))
  const regulatory = regulatoryResult.data ?? []
  const integrity = integrityResult.data ?? []
  const countries = new Map<string, { name: string; count: number }>()
  for (const trial of trials) for (const name of trial.countries ?? []) {
    const slug = slugify(name)
    if (!slug) continue
    const current = countries.get(slug) ?? { name: String(name), count: 0 }
    current.count += 1; countries.set(slug, current)
  }
  const eligibleCountries = [...countries.entries()].filter(([, item]) => item.count >= 3).sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name))
  const recentIntegrity = integrity.filter((item: any) => new Date(item.detected_at).getTime() >= Date.now() - 90 * 86400000)
  const jurisdictions = new Set(regulatory.map((item: any) => item.jurisdiction).filter(Boolean))

  if (view === 'recruiting') {
    const selectedCountry = countrySlug ? countries.get(countrySlug) : null
    const selectedTrials = selectedCountry ? trials.filter((trial: any) => (trial.countries ?? []).some((name: string) => slugify(name) === countrySlug)) : trials
    const countryLinks = eligibleCountries.slice(0, 40).map(([slug, item]) => `<a class="filter-chip${slug === countrySlug ? ' active' : ''}" href="/discover/recruiting-trials/${slug}">${escapeHtml(item.name)} · ${item.count}</a>`).join('')
    const maxCountryCount = Math.max(1, ...eligibleCountries.map(([, item]) => item.count))
    const mapNodes = eligibleCountries.slice(0, 40).map(([slug, item], index) => {
      const [x, y] = countryPoint(slug, index); const radius = 6 + Math.sqrt(item.count / maxCountryCount) * 15
      return `<a class="trial-map-node${slug === countrySlug ? ' active' : ''}" href="/discover/recruiting-trials/${slug}" aria-label="${escapeHtml(item.name)}, ${item.count} active registry records"><circle cx="${x}" cy="${y}" r="${radius.toFixed(1)}"></circle><text x="${x}" y="${y + radius + 17}" text-anchor="middle">${escapeHtml(item.name)}</text><text class="trial-map-count" x="${x}" y="${y + 4}" text-anchor="middle">${item.count}</text></a>`
    }).join('')
    const countryMap = `<div class="trial-country-map" aria-label="World map of countries with active trial records"><div><span>Active trial map</span><strong>${eligibleCountries.length} countries with enough records to compare</strong></div><svg class="trial-world-map" viewBox="0 0 1200 520" role="img" aria-labelledby="trialMapTitle trialMapDesc"><title id="trialMapTitle">Recruiting longevity trial records by country</title><desc id="trialMapDesc">A world map. Larger circles represent more current registry records with an active recruitment-related status.</desc><g class="map-land" aria-hidden="true"><path d="M90 165l88-66 131 13 61 53-43 53-87 9-38 78-79-27-48-63z"/><path d="M329 302l61 31 33 70-20 91-44-30-25-85-34-34z"/><path d="M523 137l73-35 102 18 26 43-64 35-16 55-76-8-47-45z"/><path d="M594 257l86 12 51 68-36 112-62 25-36-83-54-62z"/><path d="M711 128l151-40 174 35 86 77-78 77-119-20-68 56-108-44-43-68z"/><path d="M947 360l93-24 70 55-23 66-112 2-54-53z"/></g><g>${mapNodes}</g></svg><p class="map-summary">Circle size shows the number of current matched registry records, not study quality, safety, effectiveness, or local availability.</p></div>`
    const heading = selectedCountry ? `Longevity trials recruiting in ${selectedCountry.name}.` : 'Longevity trials recruiting now.'
    const description = selectedCountry ? `${selectedTrials.length} automatically matched registry records with an active recruitment-related status in ${selectedCountry.name}.` : `${trials.length} automatically matched registry records currently carrying an active recruitment-related status.`
    const body = `<section class="intel-section"><div class="intent-summary"><strong>${selectedTrials.length || 'None yet'}</strong><p>Current registry records. Status can change; confirm eligibility, locations and contacts in the primary registry.</p></div>${countryMap}<nav class="filter-row" aria-label="Filter by country"><a class="filter-chip${countrySlug ? '' : ' active'}" href="/discover/recruiting-trials">All eligible locations</a>${countryLinks}</nav>${compactRecordList(selectedTrials.slice(0, 100), 'trials', 'No eligible recruiting trial records currently match this location.')}<aside class="automation-notice"><strong>Registry status, not medical guidance</strong><p>“Recruiting” reflects source registry metadata and does not establish eligibility, availability at every listed location, safety, effectiveness, completion, or approval.</p></aside></section>`
    return pageShell({ title: `${heading.replace(/\.$/, '')} — immortal.life`, description, canonical: `${SITE}/discover/recruiting-trials${countrySlug ? `/${countrySlug}` : ''}`, kicker: 'Live Trial Radar', heading, body, indexable: !countrySlug || Boolean(selectedCountry && selectedTrials.length >= 3) })
  }

  if (view === 'regulatory-status') {
    const groups = [...jurisdictions].sort().map((jurisdiction) => ({ jurisdiction, records: regulatory.filter((item: any) => item.jurisdiction === jurisdiction) }))
    const body = `<section class="intel-section"><div class="automation-notice automation-notice--large"><strong>Jurisdiction matters</strong><p>This is an index of matched official notices—not a definitive approval database. A notice applies only to its named jurisdiction, product, indication and date. Verify current status with the linked regulator.</p></div>${groups.map((group) => `<section class="jurisdiction-group"><div class="section-heading"><div><span class="section-index">Official-source notices</span><h2>${escapeHtml(group.jurisdiction)}</h2></div><span class="utility-value">${group.records.length}</span></div>${compactRecordList(group.records.slice(0, 25), 'regulatory', 'No current records.')}</section>`).join('') || '<p class="empty-list">Official regulatory feeds are monitored; no matching notices are currently indexed.</p>'}</section>`
    return pageShell({ title: 'Longevity regulatory status by jurisdiction — immortal.life', description: 'Official-source regulatory notices relevant to longevity, organized by jurisdiction with explicit scope and limitations.', canonical: `${SITE}/discover/regulatory-status`, kicker: 'Regulatory navigation', heading: 'Regulatory status depends on where you are.', body })
  }

  if (view === 'research-integrity') {
    const body = `<section class="intel-section"><div class="intent-summary"><strong>${recentIntegrity.length || 'None detected'}</strong><p>Integrity events detected in the last 90 days. Corrections, expressions of concern and retractions remain visible so evidence changes are not silently erased.</p></div>${compactRecordList(integrity.slice(0, 100), 'integrity', 'No currently indexed integrity events match the longevity index. Monitoring continues automatically.')}</section>`
    return pageShell({ title: 'Recent longevity retractions and corrections — immortal.life', description: 'Automatically detected retractions, corrections, withdrawals and other research-integrity events linked to longevity records.', canonical: `${SITE}/discover/research-integrity`, kicker: 'Research integrity monitor', heading: 'When evidence changes, see the change.', body })
  }

  const researchCount = Number(researchCountResult.count ?? 0)
  const topicCount = Number(topicCountResult.count ?? 0)
  const universityCount = Number(universityCountResult.count ?? 0)
  const regulatoryCard = regulatory.length
    ? utilityCard('Regulatory notices', `${regulatory.length} current`, `Read matched official notices across ${jurisdictions.size} jurisdictions.`, '/discover/regulatory-status', 'Read official notices', 'coral')
    : utilityCard('Official health authorities', '27 EU countries + global', 'Find official medicines authorities, registers, guidance and safety sources.', '/regulatory', 'Browse official sources', 'coral')
  const integrityCard = recentIntegrity.length
    ? utilityCard('Corrections and retractions', `${recentIntegrity.length} recent`, 'See corrections, retractions and other changes detected in the last 90 days.', '/discover/research-integrity', 'Review evidence changes', 'violet')
    : ''
  const body = `<section class="discover-directory" aria-labelledby="discoverPaths"><div class="discover-heading"><div><span class="section-index">Choose a destination</span><h2 id="discoverPaths">Start with what you need</h2></div><p>Each page links back to its original sources. Counts update automatically.</p></div><div class="utility-grid">${utilityCard('Latest research', `${researchCount} records`, 'Browse recent longevity papers and see why each one matched a tracked topic.', '/research', 'See new research', 'teal')}${utilityCard('Trial Radar', `${trials.length} active records`, 'Browse current longevity registry records in one place.', '/trials', 'Open Trial Radar', 'green')}${utilityCard('University research', `${universityCount} institutions`, 'Compare topic-specific research activity and open the underlying work links.', '/universities', 'Compare universities', 'violet')}${utilityCard('Longevity topics', `${topicCount} tracked`, 'Choose a topic to see related research, trials and university activity together.', '/topics', 'Browse all topics', 'blue')}${regulatoryCard}${integrityCard}${utilityCard('Weekly briefing', 'Latest summary', 'Read the most important research, trial and regulatory updates in one place.', '/briefings', 'Read the briefing', 'gold')}</div><nav class="discover-tools" aria-label="Research tools"><span>Research tools</span><a href="/reports">Live evidence report</a><a href="/data">Download data</a><a href="/quality">Index health</a><a href="/methodology">How matching works</a></nav></section>`
  return pageShell({ title: 'Explore longevity evidence — immortal.life', description: 'Find longevity research, recruiting trials, university activity, tracked topics and official health sources.', canonical: `${SITE}/discover`, kicker: 'Explore', heading: 'Find the evidence you need.', body })
}

async function reportsPage(supabase: any): Promise<string> {
  const [telemetry, topics, trials, regulatory, integrity] = await Promise.all([
    supabase.rpc('get_intelligence_quality_telemetry'), supabase.from('intelligence_entities').select('slug,name,record_count').eq('kind', 'topic').order('record_count', { ascending: false }).limit(12),
    supabase.from('clinical_trials').select('id', { count: 'exact', head: true }).eq('publication_state', 'published').in('overall_status', ['Recruiting', 'Not Yet Recruiting', 'Enrolling by Invitation']),
    supabase.from('regulatory_events').select('id', { count: 'exact', head: true }).eq('publication_state', 'published'), supabase.from('research_integrity_events').select('id', { count: 'exact', head: true }).eq('publication_state', 'published'),
  ])
  const quality = telemetry.data ?? {}
  const countLabel = (value: unknown) => String(Number(value ?? 0))
  const confidence = Number(quality?.research?.average_confidence ?? 0)
  const body = `<section class="intel-section"><div class="report-metrics report-metrics--active"><a class="report-metric" href="/trials"><strong>${countLabel(trials.count)}</strong><span>Trials with an active recruitment status</span><small>Browse trials →</small></a><a class="report-metric" href="/regulatory"><strong>${countLabel(regulatory.count)}</strong><span>Regulatory notices</span><small>Browse notices →</small></a><a class="report-metric" href="/discover/research-integrity"><strong>${countLabel(integrity.count)}</strong><span>Corrections and retractions</span><small>Browse integrity records →</small></a><a class="report-metric" href="/quality"><strong>${confidence > 0 ? `${confidence}%` : 'Pending'}</strong><span>Average research topic match</span><small>Understand the check →</small></a></div><div class="section-heading report-heading"><div><span class="section-index">Current activity</span><h2>Most active topics</h2></div><a class="section-link" href="/data">Download data</a></div><ol class="report-ranking">${(topics.data ?? []).filter((topic: any) => Number(topic.record_count ?? 0) > 0).map((topic: any, index: number) => `<li><span>${String(index + 1).padStart(2, '0')}</span><a href="/topics/${encodeURIComponent(topic.slug)}">${escapeHtml(topic.name)}</a><strong>${Number(topic.record_count)}</strong></li>`).join('')}</ol><aside class="automation-notice"><strong>A live snapshot</strong><p>Counts may change after source updates, duplicate removal, corrections, or new quality checks. If you cite this page, include the date you accessed it and keep the original-source links.</p></aside></section>`
  return pageShell({ title: 'Longevity evidence reports — immortal.life', description: 'Current counts and topic trends across longevity trials, regulatory notices, and research corrections.', canonical: `${SITE}/reports`, kicker: 'Shareable evidence snapshots', heading: 'A clear view of longevity research activity.', body })
}

function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.join('|') : String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

async function dataset(supabase: any, kind: string, format: string): Promise<Response | null> {
  const specs: Record<string, { table: string; fields: string; order: string; eligible?: boolean }> = {
    universities: { table: 'university_research_institutions', fields: 'openalex_id,slug,name,ror_id,country_code,country_name,continent,region,city,homepage_url,openalex_url,indexed_works_all_time,indexed_works_five_year,indexed_works_two_year,indexed_topic_count,representative_citations,representative_open_access_share,activity_score,breadth_score,momentum_score,citation_context_score,research_index_score,ranking_method_version,updated_at', order: 'openalex_id', eligible: true },
    research: { table: 'research_items', fields: 'id,title,published_on,journal,doi,evidence_level,status,relevance_confidence,source_url,last_seen_at', order: 'id' },
    trials: { table: 'clinical_trials', fields: 'id,external_id,title,overall_status,phases,sponsor,countries,last_update_date,relevance_confidence,source_url', order: 'id' },
    regulatory: { table: 'regulatory_events', fields: 'id,title,jurisdiction,category,published_at,relevance_confidence,source_url', order: 'id' },
    integrity: { table: 'research_integrity_events', fields: 'id,title,event_type,announced_on,detected_at,source_url', order: 'id' },
  }
  const spec = specs[kind]
  if (!spec) return null
  const columns = spec.fields.split(',')
  const encoder = new TextEncoder()
  const pageSize = 1000
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let offset = 0
      let first = true
      try {
        if (format === 'json') controller.enqueue(encoder.encode(`{"generated_at":${JSON.stringify(new Date().toISOString())},"kind":${JSON.stringify(kind)},"automation_disclosure":${JSON.stringify(DISCLOSURE)},"records":[`))
        else controller.enqueue(encoder.encode(`${columns.map(csvCell).join(',')}\r\n`))
        while (true) {
          let query = supabase.from(spec.table).select(spec.fields).order(spec.order).range(offset, offset + pageSize - 1)
          query = spec.eligible ? query.eq('is_eligible', true) : query.eq('publication_state', 'published')
          const { data, error } = await query
          if (error) throw error
          const records = data ?? []
          if (!records.length) break
          if (format === 'json') {
            const chunk = records.map((record: any) => JSON.stringify(record)).join(',')
            controller.enqueue(encoder.encode(`${first ? '' : ','}${chunk}`))
          } else {
            controller.enqueue(encoder.encode(`${records.map((record: any) => columns.map((column) => csvCell(record[column])).join(',')).join('\r\n')}\r\n`))
          }
          first = false
          offset += records.length
          if (records.length < pageSize) break
        }
        if (format === 'json') controller.enqueue(encoder.encode(`],"methodology":${JSON.stringify(kind === 'universities' ? 'Complete retained OpenAlex/ROR affiliation index; activity is not a rating of institutional or research quality.' : 'All published quality-eligible records; no fixed export ceiling.')}}`))
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
  return streamResponse(stream, format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8')
}

async function universityWorks(supabase: any, slug: string, topic: string, offset: number, limit: number): Promise<Response | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (topic && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic))) return null
  const institution = await supabase.from('university_research_institutions').select('openalex_id,name').eq('slug', slug).eq('is_eligible', true).maybeSingle()
  if (institution.error) throw institution.error
  if (!institution.data) return null
  let query = supabase.from('university_research_work_institutions')
    .select('university_research_works!inner(openalex_work_id,title,publication_year,publication_date,cited_by_count,is_open_access,doi,source_url,source_name,university_research_work_topics!inner(topic_slug))', { count: 'exact' })
    .eq('openalex_id', institution.data.openalex_id)
    .order('openalex_work_id', { ascending: false, referencedTable: 'university_research_works' })
    .range(offset, offset + limit - 1)
  if (topic) query = query.eq('university_research_works.university_research_work_topics.topic_slug', topic)
  const { data, error, count } = await query
  if (error) throw error
  const records = (data ?? []).map((row: any) => row.university_research_works)
  return response(JSON.stringify({ university: institution.data, topic: topic || null, total_matching: count ?? 0, offset, next_offset: offset + records.length < Number(count ?? 0) ? offset + records.length : null, records, automation_disclosure: DISCLOSURE }), 'application/json; charset=utf-8')
}

function socialCardSvg(title: string, kicker: string, confidence?: number): string {
  const words = cleanCardText(title).split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (`${line} ${word}`.trim().length > 38 && line) { lines.push(line); line = word } else line = `${line} ${word}`.trim()
  }
  if (line) lines.push(line)
  const visible = lines.slice(0, 3)
  if (lines.length > 3) visible[2] = `${visible[2].slice(0, 34)}…`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${xml(title)}"><defs><radialGradient id="g" cx="72%" cy="35%"><stop offset="0" stop-color="#4b3d06"/><stop offset="1" stop-color="#080806"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/><g fill="none" stroke="#c8a82e" opacity=".32"><circle cx="940" cy="190" r="124"/><circle cx="940" cy="190" r="72"/><path d="M760 450C870 310 1015 365 1110 250M710 120C850 80 1020 95 1120 170"/></g><text x="72" y="80" fill="#c8a82e" font-family="Arial,sans-serif" font-size="26" letter-spacing="5">IMMORTAL.LIFE</text><text x="72" y="132" fill="#8d866f" font-family="Arial,sans-serif" font-size="20" letter-spacing="3">${xml(kicker.toUpperCase())}</text>${visible.map((value, index) => `<text x="72" y="${235 + index * 78}" fill="#f5f2e8" font-family="Georgia,serif" font-size="58">${xml(value)}</text>`).join('')}${confidence != null ? `<text x="72" y="530" fill="#c8a82e" font-family="Arial,sans-serif" font-size="25">${Math.max(0, Math.min(100, confidence))}% AUTOMATED MATCH CONFIDENCE</text>` : ''}<text x="72" y="585" fill="#8d866f" font-family="Arial,sans-serif" font-size="18">SOURCE-LINKED · AUTOMATED · RESEARCH INFORMATION, NOT MEDICAL ADVICE</text></svg>`
}

function cleanCardText(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Longevity intelligence'
}

async function socialCard(supabase: any, kind: string, key: string): Promise<string | null> {
  if (kind === 'briefing') {
    const { data, error } = await supabase.from('public_briefings').select('title').eq('slug', key).maybeSingle()
    if (error) throw error
    return data ? socialCardSvg(data.title, 'Weekly evidence briefing') : null
  }
  if (kind === 'entity') {
    const split = key.indexOf('-')
    const entityKind = split > 0 ? key.slice(0, split) : ''
    const slug = split > 0 ? key.slice(split + 1) : ''
    const { data, error } = await supabase.from('intelligence_entities').select('name,kind').eq('kind', entityKind).eq('slug', slug).maybeSingle()
    if (error) throw error
    return data ? socialCardSvg(data.name, `${data.kind} entity`) : null
  }
  if (kind === 'university') {
    const { data, error } = await supabase.from('university_research_institutions').select('name,research_index_score').eq('slug', key).eq('is_eligible', true).maybeSingle()
    if (error) throw error
    return data ? socialCardSvg(data.name, 'Global University Research Index', Number(data.research_index_score ?? 0)) : null
  }
  const id = safeId(key)
  if (!id || !['research', 'trials', 'regulatory', 'integrity'].includes(kind)) return null
  const record = await getRecord(supabase, kind, id)
  return record ? socialCardSvg(record.title, kind === 'trials' ? 'Trial Radar' : `${kind} intelligence`, Number(record.relevance_confidence ?? 100)) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return response('', 'text/plain', 204)
  if (req.method !== 'GET') return response('Method not allowed', 'text/plain', 405, 'no-store')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || 'record'
  try {
    if (mode === 'sitemap') return response(await sitemap(supabase, url.searchParams.get('type') || 'index'), 'application/xml; charset=utf-8')
    if (mode === 'feed') return await feed(supabase, url.searchParams.get('format') || 'rss', url.searchParams.get('topic') || '')
    if (mode === 'changes') return response(await changesPage(supabase), 'text/html; charset=utf-8')
    if (mode === 'change-feed') return await changeFeed(supabase, url.searchParams.get('format') || 'rss')
    if (mode === 'discover') return response(await discoveryPage(supabase, url.searchParams.get('view') || 'index', url.searchParams.get('country') || ''), 'text/html; charset=utf-8')
    if (mode === 'reports') return response(await reportsPage(supabase), 'text/html; charset=utf-8')
    if (mode === 'dataset') {
      const exported = await dataset(supabase, url.searchParams.get('kind') || '', url.searchParams.get('format') || 'csv')
      return exported ?? response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'briefings') {
      const html = await briefingsPage(supabase, url.searchParams.get('slug') || '')
      return html ? response(html, 'text/html; charset=utf-8') : response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'entity') {
      const html = await entityPage(supabase, url.searchParams.get('kind') || '', url.searchParams.get('slug') || '')
      return html ? response(html, 'text/html; charset=utf-8') : response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'university') {
      const html = await universityPage(supabase, url.searchParams.get('slug') || '')
      return html ? response(html, 'text/html; charset=utf-8') : response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'university-works') {
      const parsedOffset = Number.parseInt(url.searchParams.get('offset') || '0', 10)
      const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '100', 10)
      const exported = await universityWorks(supabase, url.searchParams.get('slug') || '', url.searchParams.get('topic') || '', Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0, Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 100)
      return exported ?? response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'social') {
      const svg = await socialCard(supabase, url.searchParams.get('kind') || '', url.searchParams.get('key') || '')
      return svg ? response(svg, 'image/svg+xml; charset=utf-8', 200, 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800') : response('Not found', 'text/plain', 404, 'no-store')
    }
    const kind = url.searchParams.get('kind') || ''
    const id = safeId(url.searchParams.get('id') || '')
    if (!id || !['research', 'trials', 'regulatory', 'integrity'].includes(kind)) return response('Not found', 'text/plain', 404, 'no-store')
    const record = await getRecord(supabase, kind, id)
    if (!record) return response('Not found', 'text/plain', 404, 'no-store')
    if (mode === 'api') return citation(record, kind, url.searchParams.get('format') || 'json')
    return response(renderRecord(kind, record), 'text/html; charset=utf-8')
  } catch (error) {
    console.error('public-pages error', error instanceof Error ? error.message : String(error))
    return response('Content temporarily unavailable', 'text/plain', 503, 'no-store')
  }
})
