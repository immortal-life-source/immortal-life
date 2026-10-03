'use strict';

const fs = require('node:fs');
const path = require('node:path');

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-intelligence';
const hubViews = new Set(['research', 'trials', 'universities', 'funding']);
const forwarded = new Set(['topic', 'q', 'country', 'continent', 'sort', 'status', 'phase', 'evidence', 'access', 'published_from', 'published_to', 'funder', 'institution']);
const pageDirectory = path.join(process.cwd(), 'dist', '_hub-templates');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function safeUrl(value, fallback = '/') {
  try {
    const url = new URL(String(value || ''), 'https://www.immortal.life');
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch (_) { return fallback; }
}

function date(value) {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

function evidenceLabel(value) {
  return ({ 'human-synthesis': 'Evidence synthesis', 'randomized-human': 'Randomized human study', 'human-study': 'Human study', preclinical: 'Preclinical research', preprint: 'Preprint · not peer reviewed' })[String(value || '')] || 'Research record';
}

function replaceOnce(html, search, replacement) {
  const index = html.indexOf(search);
  if (index < 0) return html;
  return `${html.slice(0, index)}${replacement}${html.slice(index + search.length)}`;
}

function researchCards(rows) {
  return rows.slice(0, 12).map((row) => `<article class="record-card"><div class="record-meta"><div>${escapeHtml(date(row.published_on))}</div>${row.journal ? `<div>${escapeHtml(row.journal)}</div>` : ''}</div><div class="record-main"><h3><a class="record-title-link" href="/research/${encodeURIComponent(row.id)}">${escapeHtml(row.title || 'Untitled research record')}</a></h3><p class="reader-copy reader-copy--beginner">${escapeHtml(evidenceLabel(row.evidence_level))}. Open the permanent record for methods, evidence context and the original source.</p><div class="record-tags">${(row.research_item_topics || []).slice(0, 4).map((relation) => `<a class="record-tag" href="/topics/${encodeURIComponent(relation.topic_slug)}">${escapeHtml(relation.intelligence_topics?.name || relation.topic_slug)}</a>`).join('')}</div></div><div class="record-action"><span class="record-status">${escapeHtml(evidenceLabel(row.evidence_level))}</span><a class="source-link" href="${escapeHtml(safeUrl(row.source_url, `/research/${row.id}`))}" target="_blank" rel="noopener noreferrer">Open source record</a></div></article>`).join('');
}

function trialCards(rows) {
  return rows.slice(0, 12).map((row) => `<article class="record-card"><div class="record-meta"><div>${escapeHtml(row.external_id || '')}</div><div>${escapeHtml(date(row.last_update_date))}</div>${row.enrollment != null ? `<div>${escapeHtml(Number(row.enrollment).toLocaleString('en-US'))} planned enrollment</div>` : ''}</div><div class="record-main"><h3><a class="record-title-link" href="/trials/${encodeURIComponent(row.id)}">${escapeHtml(row.title || 'Untitled trial registration')}</a></h3><p class="reader-copy reader-copy--beginner">Registry status: ${escapeHtml(String(row.overall_status || 'not supplied').replaceAll('_', ' ').toLowerCase())}. Registration does not establish safety or effectiveness.</p><div class="record-tags">${(row.clinical_trial_topics || []).slice(0, 4).map((relation) => `<a class="record-tag" href="/topics/${encodeURIComponent(relation.topic_slug)}">${escapeHtml(relation.intelligence_topics?.name || relation.topic_slug)}</a>`).join('')}</div></div><div class="record-action"><span class="record-status">${escapeHtml(String(row.overall_status || 'status unavailable').replaceAll('_', ' '))}</span><a class="source-link" href="${escapeHtml(safeUrl(row.source_url, `/trials/${row.id}`))}" target="_blank" rel="noopener noreferrer">Open registry record</a></div></article>`).join('');
}

function universityRows(rows, topicName = '') {
  return rows.slice(0, 24).map((row, index) => {
    const metrics = Array.isArray(row.university_research_topic_metrics) ? row.university_research_topic_metrics : [];
    const topicWorks = topicName ? Number(metrics[0]?.works_all_time || 0) : Number(row.indexed_works_five_year || 0);
    const metricLabel = topicName ? `${topicName} research records` : 'five-year work links';
    return `<li class="university-row"><span class="university-rank">${String(index + 1).padStart(2, '0')}</span><div class="university-main"><span class="section-index">${escapeHtml([row.city, row.country_name || row.country_code].filter(Boolean).join(', ') || 'Location unavailable')}</span><h3><a href="/universities/${encodeURIComponent(row.slug)}">${escapeHtml(row.name || 'Unnamed university')}</a></h3><p>${escapeHtml(topicName ? `Source-matched activity for ${topicName}. Open the profile to inspect the connected work.` : `${Number(row.indexed_topic_count || 0).toLocaleString('en-US')} longevity topics represented in the current index.`)}</p></div><div class="university-score"><strong>${topicWorks.toLocaleString('en-US')}</strong><span>${escapeHtml(metricLabel)}</span></div></li>`;
  }).join('');
}

function funderSlug(name, id) {
  const cleanId = String(id || '').match(/F\d+/i)?.[0]?.toLowerCase();
  if (!cleanId) return '';
  const cleanName = String(name || 'funder').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || 'funder';
  return `${cleanName}-${cleanId}`;
}

function fundingCards(data) {
  const direct = (data.direct_grants || []).slice(0, 6).map((row) => `<article class="funding-card funding-card--direct"><div class="funding-card-meta"><span class="funding-funder">${escapeHtml(row.source_name || row.funder_name || 'Official grant source')}</span><strong>${escapeHtml(row.grant_number || row.source_grant_id || 'Grant record')}</strong></div><div class="funding-card-main"><h3>${escapeHtml(row.title || 'Direct grant record')}</h3><p class="funding-card-context">${escapeHtml([row.recipient_name, row.recipient_country_name].filter(Boolean).join(' · ') || 'Open the official source for recipient details.')}</p></div><div class="funding-card-action"><a class="source-link" href="${escapeHtml(safeUrl(row.source_url))}" target="_blank" rel="noopener noreferrer">Verify official grant</a></div></article>`).join('');
  const acknowledgements = (data.awards || []).slice(0, 8).map((row) => {
    const slug = funderSlug(row.funder_name, row.funder_id);
    return `<article class="funding-card"><div class="funding-card-meta">${slug ? `<a class="funding-funder" href="/funders/${encodeURIComponent(slug)}">${escapeHtml(row.funder_name || 'Funder')}</a>` : `<span class="funding-funder">${escapeHtml(row.funder_name || 'Funder')}</span>`}<strong>${escapeHtml(row.award_identifier || row.openalex_award_id || 'Award acknowledgement')}</strong></div><div class="funding-card-main"><h3>${escapeHtml(row.title || 'Source-linked funding acknowledgement')}</h3><p class="funding-card-context">Publication acknowledgement; not a spending or impact claim.</p></div><div class="funding-card-action"><a class="source-link" href="${escapeHtml(safeUrl(row.source_url))}" target="_blank" rel="noopener noreferrer">Verify source</a></div></article>`;
  }).join('');
  return { direct, acknowledgements };
}

function injectSnapshot(html, view, data, query) {
  if (view === 'research') {
    html = html.replace('<section class="intel-section" id="researchSection" hidden>', '<section class="intel-section" id="researchSection" data-prerendered="true">');
    return replaceOnce(html, '<div class="record-list" id="researchList"></div>', `<div class="record-list" id="researchList">${researchCards(data.research || [])}</div>`);
  }
  if (view === 'trials') {
    html = html.replace('<section class="intel-section" id="trialsSection" hidden>', '<section class="intel-section" id="trialsSection" data-prerendered="true">');
    return replaceOnce(html, '<div class="record-list" id="trialList"></div>', `<div class="record-list" id="trialList">${trialCards(data.trials || [])}</div>`);
  }
  if (view === 'universities') {
    html = html.replace('<section class="intel-section university-index" id="universitiesSection" hidden>', '<section class="intel-section university-index" id="universitiesSection" data-prerendered="true">');
    const topic = String(query.topic || '').replaceAll('-', ' ');
    return replaceOnce(html, '<ol class="university-ranking" id="universityList"></ol>', `<ol class="university-ranking" id="universityList">${universityRows(data.universities || [], topic)}</ol>`);
  }
  if (view === 'funding') {
    html = html.replace('<section class="intel-section funding-radar" id="fundingSection" hidden', '<section class="intel-section funding-radar" id="fundingSection" data-prerendered="true"');
    const cards = fundingCards(data);
    html = replaceOnce(html, '<div class="funding-list funding-list--direct" id="directGrantList"></div>', `<div class="funding-list funding-list--direct" id="directGrantList">${cards.direct}</div>`);
    return replaceOnce(html, '<div class="funding-list" id="fundingList"></div>', `<div class="funding-list" id="fundingList">${cards.acknowledgements}</div>`);
  }
  return html;
}

module.exports = async function hubPage(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }
  const view = String(request.query?.view || '').trim();
  if (!hubViews.has(view)) return response.status(404).send('Not found');
  const filePath = path.join(pageDirectory, `${view}.html`);
  if (!fs.existsSync(filePath)) return response.status(404).send('Not found');
  const staticHtml = fs.readFileSync(filePath, 'utf8');
  if (request.method === 'HEAD') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.status(200).send('');
  }

  const upstream = new URL(upstreamBase);
  upstream.searchParams.set('view', view);
  upstream.searchParams.set('limit', view === 'universities' ? '24' : '12');
  for (const [key, value] of Object.entries(request.query || {})) {
    if (!forwarded.has(key) || Array.isArray(value) || value == null) continue;
    upstream.searchParams.set(key, String(value).slice(0, 200));
  }
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 11_000);
  try {
    const result = await fetch(upstream, { headers: key ? { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' }, signal: controller.signal });
    if (!result.ok) throw new Error(`hub_${view}_${result.status}`);
    const data = await result.json();
    if (data?.fallback || data?.unavailable) throw new Error(`hub_${view}_fallback`);
    const html = injectSnapshot(staticHtml, view, data, request.query || {});
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('X-Immortal-Hub-Source', 'server-rendered');
    return response.status(200).send(html);
  } catch (error) {
    console.warn('Hub prerender fallback:', error instanceof Error ? error.message : String(error));
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Immortal-Hub-Source', 'static-fallback');
    return response.status(200).send(staticHtml);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports.injectSnapshot = injectSnapshot;
