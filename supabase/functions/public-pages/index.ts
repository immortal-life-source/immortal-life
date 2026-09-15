import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const DISCLOSURE = 'Generated automatically from cited source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates this publication before release.'

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

function formatDate(value: unknown): string {
  if (!value) return 'Date unavailable'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

function pageShell(input: { title: string; description: string; canonical: string; kicker: string; heading: string; body: string; type?: string; date?: string; socialImage?: string }): string {
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
<title>${escapeHtml(input.title)}</title><meta name="description" content="${escapeHtml(input.description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(input.canonical)}"><link rel="alternate" type="application/rss+xml" title="immortal.life updates" href="${SITE}/feed.xml">
<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(input.title)}"><meta property="og:description" content="${escapeHtml(input.description)}"><meta property="og:url" content="${escapeHtml(input.canonical)}"><meta property="og:image" content="${escapeHtml(input.socialImage || `${SITE}/og-image.png`)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(input.title)}"><meta name="twitter:description" content="${escapeHtml(input.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;1,300&family=Instrument+Sans:wght@300;400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/intelligence.css"><link rel="icon" href="/favicon.ico">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head><body>
<header class="intel-header"><a class="intel-logo" href="/" aria-label="immortal.life home"><img src="/linkedin-app-logo.png" width="40" height="40" alt="" decoding="async"><span>immortal.life</span></a><nav class="intel-nav" aria-label="Primary navigation"><a href="/research">Research</a><a href="/trials">Trial Radar</a><a href="/topics">Topics</a><a href="/regulatory">Regulatory</a><a href="/entities">Entities</a><a href="/quality">Quality</a><a href="/briefings">Briefings</a></nav></header>
<main><section class="intel-hero record-hero"><div class="intel-kicker">${escapeHtml(input.kicker)}</div><h1>${escapeHtml(input.heading)}</h1><p class="intel-lede">${escapeHtml(input.description)}</p></section>${input.body}</main>
<footer class="intel-footer"><p><strong>Automated publication.</strong> ${escapeHtml(DISCLOSURE)} Research information only; not medical advice, diagnosis, or treatment guidance.</p><div><a href="/methodology">Methodology</a><a href="/automation">Automation disclosure</a><a href="/corrections">Corrections</a><a href="/feed.xml">RSS</a><span>© 2026 immortal.life</span></div></footer></body></html>`
}

function chips(topics: string[]): string {
  return topics.map((slug) => `<a class="record-tag" href="/topics/${encodeURIComponent(slug)}">${escapeHtml(slug.replace(/-/g, ' '))}</a>`).join('')
}

function recordBody(rows: Array<[string, unknown]>, summary: unknown, sourceUrl: unknown, topics: string[], citationUrl: string, extra = ''): string {
  return `<section class="intel-section record-detail"><div class="record-detail-grid"><dl>${rows.filter(([, value]) => value != null && value !== '').map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><article><span class="section-index">Automated source synopsis</span><p class="record-summary">${escapeHtml(summary || 'No source synopsis is available.')}</p>${extra}<div class="record-tags">${chips(topics)}</div><div class="record-links"><a class="section-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open primary source</a><a class="section-link" href="${escapeHtml(citationUrl)}">Export JSON</a></div></article></div><aside class="automation-notice"><strong>How to read this page</strong><p>${escapeHtml(DISCLOSURE)} Verify consequential details at the linked primary source.</p></aside></section>`
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
  return `<details class="quality-explanation"><summary>Why this record matched · ${Number(record?.relevance_confidence ?? 0)}% confidence</summary><p>${escapeHtml(record?.match_explanation || 'Evaluated automatically against controlled topic terminology and source metadata.')}</p>${details ? `<ul>${details}</ul>` : ''}<p>Source quality ${Number(record?.source_quality_score ?? 0)}% · freshness ${Number(record?.freshness_score ?? 0)}%. These are automated routing signals, not medical or evidence-strength ratings.</p></details>`
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
  if (kind === 'research') {
    topics = relationTopics(record, 'research_item_topics'); date = record.published_on
    rows = [['Published', formatDate(record.published_on)], ['Journal', record.journal], ['Authors', Array.isArray(record.authors) ? record.authors.join(', ') : record.authors], ['DOI', record.doi], ['Evidence class', record.evidence_level], ['Record status', record.status], ['Match confidence', `${record.relevance_confidence}%`], ['Citations', record.cited_by_count], ['Source feed', record.content_sources?.name]]
    kicker = record.status === 'retracted' ? 'Retracted research record' : 'Research record'
    extra = qualityDisclosure(record, 'research_item_topics')
  } else if (kind === 'trials') {
    topics = relationTopics(record, 'clinical_trial_topics'); date = record.last_update_date
    rows = [['Registry ID', record.external_id], ['Last registry update', formatDate(record.last_update_date)], ['Status', record.overall_status], ['Phase', (record.phases || []).join(', ')], ['Sponsor', record.sponsor], ['Enrollment', record.enrollment], ['Countries', (record.countries || []).join(', ')], ['Match confidence', `${record.relevance_confidence}%`], ['Source feed', record.content_sources?.name]]
    kicker = 'Clinical trial registry record'
    extra = '<p class="record-caveat">Registration and recruitment status do not establish safety, efficacy, or regulatory approval.</p>' + qualityDisclosure(record, 'clinical_trial_topics')
  } else if (kind === 'regulatory') {
    topics = record.matched_topics || []; date = record.published_at
    rows = [['Jurisdiction', record.jurisdiction], ['Category', record.category], ['Published', formatDate(record.published_at)], ['Match confidence', `${record.relevance_confidence}%`], ['Official feed', record.content_sources?.name]]
    kicker = 'Official regulatory notice'
    extra = qualityDisclosure(record)
  } else {
    date = record.announced_on || record.detected_at
    rows = [['Event', record.event_type], ['Announced', formatDate(record.announced_on)], ['Detected', formatDate(record.detected_at)], ['Source feed', record.content_sources?.name], ['Linked research', record.research_items?.title]]
    kicker = 'Research integrity event'
    extra = record.research_items?.id ? `<p class="record-caveat">Linked record: <a href="/research/${Number(record.research_items.id)}">${escapeHtml(record.research_items.title)}</a></p>` : ''
  }
  const exports = kind === 'research' ? `${extra}<p class="record-exports"><a href="/api/intelligence/${kind}/${id}?format=bibtex">BibTeX</a> · <a href="/api/intelligence/${kind}/${id}?format=ris">RIS</a></p>` : extra
  const body = recordBody(rows, record.editorial_summary || record.summary, record.source_url, topics, `/api/intelligence/${kind}/${id}`, exports)
  return pageShell({ title: `${title} — immortal.life`, description, canonical, kicker, heading: title, body, type: 'Article', date, socialImage: `${SITE}/social-card/${kind}/${id}.png` })
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

async function sitemap(supabase: any): Promise<string> {
  const staticPaths = ['', '/research', '/trials', '/topics', '/regulatory', '/integrity', '/evidence-graph', '/briefings', '/entities', '/quality', '/methodology', '/automation', '/publication-policy', '/corrections', '/data']
  const [topics, research, trials, regulatory, integrity, briefings, entities] = await Promise.all([
    supabase.from('intelligence_topics').select('slug,updated_at').eq('enabled', true),
    supabase.from('research_items').select('id,last_seen_at').eq('publication_state', 'published').order('id', { ascending: false }).limit(20000),
    supabase.from('clinical_trials').select('id,last_seen_at').eq('publication_state', 'published').order('id', { ascending: false }).limit(20000),
    supabase.from('regulatory_events').select('id,last_seen_at').eq('publication_state', 'published').order('id', { ascending: false }).limit(5000),
    supabase.from('research_integrity_events').select('id,detected_at').eq('publication_state', 'published').order('id', { ascending: false }).limit(5000),
    supabase.from('public_briefings').select('slug,updated_at').order('period_start', { ascending: false }).limit(500),
    supabase.from('intelligence_entities').select('kind,slug,updated_at').order('updated_at', { ascending: false }).limit(10000),
  ])
  for (const result of [topics, research, trials, regulatory, integrity, briefings, entities]) if (result.error) throw result.error
  const urls: Array<{ path: string; modified?: string }> = staticPaths.map((path) => ({ path }))
  urls.push(...(topics.data ?? []).map((r: any) => ({ path: `/topics/${r.slug}`, modified: r.updated_at })))
  for (const [kind, result, field] of [['research', research, 'last_seen_at'], ['trials', trials, 'last_seen_at'], ['regulatory', regulatory, 'last_seen_at'], ['integrity', integrity, 'detected_at']] as const) {
    urls.push(...(result.data ?? []).map((r: any) => ({ path: `/${kind}/${r.id}`, modified: r[field] })))
  }
  urls.push(...(briefings.data ?? []).map((r: any) => ({ path: `/briefings/${r.slug}`, modified: r.updated_at })))
  urls.push(...(entities.data ?? []).map((r: any) => ({ path: `/entities/${r.kind}/${r.slug}`, modified: r.updated_at })))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((item) => `<url><loc>${xml(SITE + item.path)}</loc>${item.modified ? `<lastmod>${xml(String(item.modified).slice(0, 10))}</lastmod>` : ''}</url>`).join('')}</urlset>`
}

async function feed(supabase: any, format: string): Promise<Response> {
  const items = await loadRecent(supabase, 40)
  if (format === 'json') return response(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'immortal.life automated intelligence', home_page_url: SITE, feed_url: `${SITE}/feed.json`, description: DISCLOSURE, items: items.map((item) => ({ id: `${SITE}/${item.kind}/${item.id}`, url: `${SITE}/${item.kind}/${item.id}`, title: item.title, content_text: item.summary || item.title, date_published: item.date })) }), 'application/feed+json; charset=utf-8')
  if (format === 'atom') {
    const updated = items[0]?.date || new Date().toISOString()
    const entries = items.map((item) => `<entry><id>${xml(`${SITE}/${item.kind}/${item.id}`)}</id><link href="${xml(`${SITE}/${item.kind}/${item.id}`)}"/><title>${xml(item.title)}</title><summary>${xml(item.summary || item.title)}</summary><updated>${xml(new Date(item.date).toISOString())}</updated><category term="${xml(item.kind)}"/></entry>`).join('')
    return response(`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/</id><title>immortal.life automated intelligence</title><link href="${SITE}/feed.atom" rel="self"/><link href="https://pubsubhubbub.appspot.com/" rel="hub"/><link href="${SITE}/"/><updated>${xml(new Date(updated).toISOString())}</updated><subtitle>${xml(DISCLOSURE)}</subtitle>${entries}</feed>`, 'application/atom+xml; charset=utf-8')
  }
  const entries = items.map((item) => `<item><guid isPermaLink="true">${xml(`${SITE}/${item.kind}/${item.id}`)}</guid><link>${xml(`${SITE}/${item.kind}/${item.id}`)}</link><title>${xml(item.title)}</title><description>${xml(item.summary || item.title)}</description><pubDate>${xml(new Date(item.date).toUTCString())}</pubDate><category>${xml(item.kind)}</category></item>`).join('')
  return response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>immortal.life automated intelligence</title><link>${SITE}</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/><description>${xml(DISCLOSURE)}</description><language>en</language>${entries}</channel></rss>`, 'application/rss+xml; charset=utf-8')
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
    return pageShell({ title: `${data.title} — immortal.life`, description: data.dek, canonical: `${SITE}/briefings/${data.slug}`, kicker: `${formatDate(data.period_start)} — ${formatDate(data.period_end)}`, heading: data.title, body: `<section class="intel-section legal-copy"><p class="record-summary">${escapeHtml(data.summary)}</p><aside class="automation-notice"><strong>Automated briefing</strong><p>${escapeHtml(data.automation_disclosure)}</p></aside>${sections}</section>`, type: 'Article', date: data.generated_at, socialImage: `${SITE}/social-card/briefing/${data.slug}.png` })
  }
  const { data, error } = await supabase.from('public_briefings').select('slug,title,dek,period_start,period_end,generated_at').order('period_start', { ascending: false }).limit(100)
  if (error) throw error
  const list = (data ?? []).map((item: any) => `<article class="briefing-card"><span class="section-index">${escapeHtml(formatDate(item.period_start))}</span><h2><a href="/briefings/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.dek)}</p></article>`).join('') || '<p class="empty-list">The first weekly public briefing will publish automatically after the next completed weekly window.</p>'
  return pageShell({ title: 'Automated weekly longevity briefings — immortal.life', description: 'A weekly, automatically generated record of newly indexed longevity research, trials, regulatory notices, and integrity events.', canonical: `${SITE}/briefings`, kicker: 'Published automatically every Monday', heading: 'Weekly evidence briefings.', body: `<section class="intel-section"><div class="briefing-list">${list}</div></section>` })
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
    researchQuery = supabase.from('research_items').select('id,title,published_on,relevance_confidence,research_item_topics!inner(topic_slug,is_published)').eq('publication_state', 'published').eq('research_item_topics.topic_slug', slug).eq('research_item_topics.is_published', true).limit(50)
    trialQuery = supabase.from('clinical_trials').select('id,title,last_update_date,relevance_confidence,clinical_trial_topics!inner(topic_slug,is_published)').eq('publication_state', 'published').eq('clinical_trial_topics.topic_slug', slug).eq('clinical_trial_topics.is_published', true).limit(50)
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
  const body = `<section class="intel-section entity-detail"><div class="quality-stat"><span>Entity type</span><strong>${escapeHtml(kind)}</strong></div><div class="quality-stat"><span>Published records</span><strong>${Number(entity.record_count ?? 0)}</strong></div><h2>Research</h2>${entityRecordList(research.data ?? [], 'research')}<h2>Clinical trials</h2>${entityRecordList(trials.data ?? [], 'trials')}<aside class="automation-notice"><strong>Automatically generated entity</strong><p>Names and links come directly from source metadata. No human reviewer merges identities or evaluates individual records.</p></aside></section>`
  return pageShell({ title: `${entity.name} — immortal.life entity`, description: entity.description, canonical, kicker: `Automated ${kind} entity`, heading: entity.name, body, socialImage: `${SITE}/social-card/entity/${kind}-${slug}.png` })
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
    if (mode === 'sitemap') return response(await sitemap(supabase), 'application/xml; charset=utf-8')
    if (mode === 'feed') return await feed(supabase, url.searchParams.get('format') || 'rss')
    if (mode === 'briefings') {
      const html = await briefingsPage(supabase, url.searchParams.get('slug') || '')
      return html ? response(html, 'text/html; charset=utf-8') : response('Not found', 'text/plain', 404, 'no-store')
    }
    if (mode === 'entity') {
      const html = await entityPage(supabase, url.searchParams.get('kind') || '', url.searchParams.get('slug') || '')
      return html ? response(html, 'text/html; charset=utf-8') : response('Not found', 'text/plain', 404, 'no-store')
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
