'use strict';

const SITE = 'https://www.immortal.life';
const DATA_ORIGIN = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-intelligence';
const STORY_DATE = '2026-10-03';

const stories = [
  {
    slug: 'global-longevity-trial-map',
    number: '01',
    eyebrow: 'Global trial geography',
    title: 'Where active longevity trials are being registered',
    question: 'Where is active longevity-related clinical research visible—and how mature is it?',
    description: 'A source-linked map of active and recruiting longevity trial registrations, their countries, phases, sponsors and planned enrolment.',
    accent: 'rose',
  },
  {
    slug: 'longevity-trial-results-gap',
    number: '02',
    eyebrow: 'Trial transparency',
    title: 'The distance between trial completion and visible results',
    question: 'How often do completed longevity trial registrations show structured results?',
    description: 'A transparent look at completed longevity trial registrations and whether structured results are visible in the indexed registry record.',
    accent: 'violet',
  },
  {
    slug: 'where-longevity-funding-flows',
    number: '03',
    eyebrow: 'Funding connections',
    title: 'Where longevity research funding is visible',
    question: 'Which funders, topics and institutions are connected in public funding records?',
    description: 'Official grants and publication funding acknowledgements, kept separate and connected to the topics and institutions behind the work.',
    accent: 'gold',
  },
];

const storyBySlug = new Map(stories.map((story) => [story.slug, story]));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
}

function number(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function percentage(value) {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function formatDate(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(parsed);
}

function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_) { return ''; }
}

function funderSlug(name, id) {
  const cleanId = String(id || '').match(/F\d+/i)?.[0]?.toLowerCase();
  if (!cleanId) return '';
  const cleanName = String(name || 'funder').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || 'funder';
  return `${cleanName}-${cleanId}`;
}

function shell({ title, description, canonical, eyebrow, heading, body, date = STORY_DATE, indexable = true }) {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'immortal.life', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/linkedin-app-logo.png` } },
      { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'immortal.life', url: SITE, publisher: { '@id': `${SITE}/#organization` } },
      {
        '@type': canonical === `${SITE}/signals` ? 'CollectionPage' : 'NewsArticle',
        '@id': `${canonical}#article`, headline: title, name: title, description, url: canonical,
        datePublished: date, dateModified: date, isAccessibleForFree: true,
        isPartOf: { '@id': `${SITE}/#website` }, publisher: { '@id': `${SITE}/#organization` },
        author: { '@id': `${SITE}/#organization` },
      },
    ],
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow'}">
<link rel="canonical" href="${escapeHtml(canonical)}"><link rel="alternate" type="application/rss+xml" title="immortal.life updates" href="${SITE}/feed.xml">
<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;1,300&family=Instrument+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/intelligence.css?v=20261002-topic-funding-seo-v1"><link rel="stylesheet" href="/desktop-nav.css?v=20261001-nav-shell-all"><link rel="stylesheet" href="/signals.css?v=20261003-signals-v1"><link rel="icon" href="/favicon.ico"></head>
<body><header class="intel-header"><a class="intel-logo" href="/" aria-label="immortal.life home"><img src="/linkedin-app-logo.png?v=20260926-color" width="54" height="54" alt="" decoding="async"><span>immortal.life</span></a><button class="intel-nav-toggle" id="intelNavToggle" type="button" aria-expanded="false" aria-controls="intelNav"><span>Menu</span><i aria-hidden="true"></i></button><nav class="intel-nav" id="intelNav" aria-label="Primary navigation"><div class="intel-nav-top"><a href="/changes">News</a><a href="/topics">Topics</a><a href="/trials">Trials</a><a href="/universities">Universities</a><a href="/research">Research</a><a href="/funding">Funding</a><a href="/you" class="intel-nav-you">You</a><a href="/regulatory">Regulatory</a><a href="/resources">Resources</a><a href="/briefings">Briefings</a><a href="/methodology">About</a></div><form class="intel-nav-search" role="search"><input type="search" aria-label="Search longevity topics" placeholder="Search topics…"><button type="submit">Search</button></form></nav></header>
<main class="signals-main"><section class="signals-hero"><div class="signals-orbit" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="signals-hero-copy"><span class="signals-kicker">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p></div></section>${body}<nav class="next-journey" aria-label="Continue exploring"><span>Continue exploring</span><a href="/signals">All Signals</a><a href="/briefings">Weekly briefings</a><a href="/trials">Trial Radar</a><a href="/funding">Funding Radar</a></nav></main>
<footer class="intel-footer"><p><strong>Source-linked automated data publication.</strong> Figures are generated from the stated public-source metadata and dated so they can be checked. No scientist, clinician, editor or human reviewer evaluates each story before publication. The figures describe indexed activity—not medical effectiveness, safety, scientific quality or personal advice.</p><div><a href="/signals">Signals</a><a href="/methodology">Methodology</a><a href="/corrections">Corrections</a><a href="mailto:hello@immortal.life" data-il-event="share_record">Press contact</a><span>© 2026 immortal.life</span></div></footer><nav class="mobile-dock" aria-label="Mobile navigation"><a href="/"><span aria-hidden="true">⌂</span>Home</a><a href="/topics"><span aria-hidden="true">◇</span>Topics</a><a href="/trials"><span aria-hidden="true">＋</span>Trials</a><a href="/changes"><span aria-hidden="true">↻</span>News</a><a class="mobile-dock-you" href="/you"><span aria-hidden="true">✦</span>You</a></nav><script src="/il-config.js"></script><script src="/intelligence.js?v=20261003-signals-v1"></script><script src="/desktop-nav.js?v=20261003-signals-v1"></script><script src="/telemetry.js?v=20261002-utility-v1"></script></body></html>`;
}

function storyHeader(story, generatedAt, lead, metrics) {
  return `<article class="signal-story signal-story--${story.accent}"><header class="signal-story-header"><div><span class="signal-story-number">Signal ${story.number}</span><p class="signal-story-question">${escapeHtml(story.question)}</p><p class="signal-story-lead">${escapeHtml(lead)}</p></div><div class="signal-story-date"><span>Data snapshot</span><strong>${escapeHtml(formatDate(generatedAt))}</strong><small>Figures update with the connected index</small></div></header><section class="signal-metrics" aria-label="Key figures">${metrics.join('')}</section>`;
}

function metric(value, label, note, href = '') {
  const content = `<strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small>`;
  return href ? `<a href="${escapeHtml(href)}">${content}</a>` : `<div>${content}</div>`;
}

function disclosure({ complete = true, scope, meaning }) {
  return `<aside class="signal-scope"><div><span>How to read this</span><strong>${escapeHtml(scope)}</strong></div><p>${escapeHtml(meaning)}</p>${complete ? '' : '<p><strong>Coverage note:</strong> the visual summarizes the records returned in this snapshot; the headline total may be larger.</p>'}</aside>`;
}

function journalistBox(title, generatedAt, sourceLinks) {
  return `<section class="signal-journalist"><div><span class="signals-kicker">For journalists and researchers</span><h2>Use the figure. Check the records.</h2><p>Suggested citation: <cite>immortal.life Signals, “${escapeHtml(title)},” data accessed ${escapeHtml(formatDate(generatedAt))}.</cite></p></div><div class="signal-journalist-actions">${sourceLinks.map(([label, href]) => `<a href="${escapeHtml(href)}" data-il-event="${String(href).startsWith('/data') || String(href).startsWith('/datasets/') ? 'download_dataset' : 'open_source'}">${escapeHtml(label)} →</a>`).join('')}<a href="mailto:hello@immortal.life?subject=Immortal.life%20Signals%20press%20question" data-il-event="share_record">Ask about the data →</a></div></section>`;
}

async function fetchJson(params, timeoutMs = 14_000) {
  const url = new URL(DATA_ORIGIN);
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) url.searchParams.set(key, String(value));
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(url, { headers: { Accept: 'application/json', ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}) }, signal: controller.signal });
    if (!result.ok) throw new Error(`signals_origin_${result.status}`);
    const payload = await result.json();
    if (payload?.fallback || payload?.unavailable) throw new Error('signals_origin_unavailable');
    return payload;
  } finally { clearTimeout(timer); }
}

async function trialStatusSnapshot(status) {
  const first = await fetchJson({ view: 'trials', status, limit: 500, offset: 0 });
  const total = Number(first.total_matching ?? first.trials?.length ?? 0);
  const rows = [...(first.trials || [])];
  const maximumRecords = 5_000;
  const offsets = [];
  for (let offset = 500; offset < Math.min(total, maximumRecords); offset += 500) offsets.push(offset);
  const pages = await Promise.all(offsets.map((offset) => fetchJson({ view: 'trials', status, limit: 500, offset })));
  for (const page of pages) rows.push(...(page.trials || []));
  return { total, rows, complete: rows.length >= total, sources: first.sources || [] };
}

async function activeTrialSnapshot() {
  // Exact normalized registry states avoid counting "Not Yet Recruiting" as
  // active merely because its label contains the word "recruiting".
  const parts = await Promise.all(['Recruiting', 'Active, Not Recruiting', 'Enrolling By Invitation'].map(trialStatusSnapshot));
  const byId = new Map();
  for (const part of parts) for (const row of part.rows) byId.set(row.id, row);
  return {
    generated_at: new Date().toISOString(), total: parts.reduce((sum, part) => sum + part.total, 0),
    rows: [...byId.values()], complete: parts.every((part) => part.complete), sources: parts[0]?.sources || [],
  };
}

const countryPositions = {
  'United States': [18, 42], Canada: [17, 28], Mexico: [18, 57], Brazil: [32, 72], Argentina: [31, 86], Chile: [27, 83], Colombia: [25, 66], Peru: [24, 72],
  'United Kingdom': [47, 32], Ireland: [44, 33], France: [49, 40], Germany: [52, 36], Spain: [47, 48], Italy: [53, 48], Netherlands: [50, 33], Belgium: [49, 37], Switzerland: [51, 42], Austria: [54, 40], Sweden: [54, 24], Norway: [51, 21], Denmark: [52, 29], Finland: [57, 22], Poland: [57, 36], Czechia: [54, 38], Portugal: [44, 48], Greece: [58, 52], Türkiye: [62, 51], Israel: [61, 59],
  China: [80, 48], Japan: [91, 48], India: [72, 59], 'South Korea': [86, 50], Taiwan: [84, 56], Singapore: [81, 71], Thailand: [78, 66], Malaysia: [80, 68], Indonesia: [83, 75], Pakistan: [68, 56],
  Australia: [88, 84], 'New Zealand': [96, 87], 'South Africa': [57, 82], Egypt: [58, 60], Nigeria: [51, 68], Kenya: [59, 70], Morocco: [48, 57], Tunisia: [52, 56],
  Russia: [68, 26], Ukraine: [60, 39], Romania: [58, 43], Hungary: [56, 41], Serbia: [57, 46], Croatia: [55, 45], Bulgaria: [59, 47],
};

function trialCountryCounts(rows) {
  const counts = new Map();
  for (const trial of rows) for (const country of Array.isArray(trial.countries) ? new Set(trial.countries.filter(Boolean)) : []) counts.set(country, (counts.get(country) || 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function activeTrialStory(story, snapshot) {
  const rows = snapshot.rows;
  const countries = trialCountryCounts(rows);
  const enrollment = rows.reduce((sum, row) => sum + Math.max(0, Number(row.enrollment || 0)), 0);
  const sponsors = new Map();
  const phases = new Map();
  for (const row of rows) {
    if (row.sponsor) sponsors.set(row.sponsor, (sponsors.get(row.sponsor) || 0) + 1);
    const values = Array.isArray(row.phases) && row.phases.length ? row.phases : ['Not reported'];
    for (const phase of values) phases.set(String(phase).replace(/_/g, ' '), (phases.get(String(phase).replace(/_/g, ' ')) || 0) + 1);
  }
  const topSponsors = [...sponsors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const phaseRows = [...phases.entries()].sort((a, b) => b[1] - a[1]);
  const lead = `${number(snapshot.total)} active or recruiting registrations are currently visible in the index. The map shows ${number(rows.length)} retrieved registrations across ${number(countries.length)} country labels; planned enrolment is not completed participation.`;
  const bubbles = countries.slice(0, 24).map((country, index) => {
    const position = countryPositions[country.name] || [40 + ((index * 17) % 52), 22 + ((index * 23) % 65)];
    const size = Math.max(30, Math.min(82, 28 + Math.sqrt(country.count) * 8));
    return `<a class="signal-map-bubble" href="/trials?status=active&amp;country=${encodeURIComponent(country.name)}" style="--x:${position[0]}%;--y:${position[1]}%;--size:${size}px" title="${escapeHtml(country.name)} · ${number(country.count)} registrations"><strong>${number(country.count)}</strong><span>${escapeHtml(country.name)}</span></a>`;
  }).join('');
  const maxCountry = Math.max(1, countries[0]?.count || 1);
  const countryBars = countries.slice(0, 10).map((country) => `<a class="signal-rank-row" href="/trials?status=active&amp;country=${encodeURIComponent(country.name)}"><span>${escapeHtml(country.name)}</span><i style="--value:${(country.count / maxCountry) * 100}%"></i><strong>${number(country.count)}</strong></a>`).join('');
  const maxSponsor = Math.max(1, topSponsors[0]?.[1] || 1);
  const sponsorBars = topSponsors.map(([name, count]) => `<a class="signal-rank-row" href="/trials?status=active&amp;q=${encodeURIComponent(name)}"><span>${escapeHtml(name)}</span><i style="--value:${(count / maxSponsor) * 100}%"></i><strong>${number(count)}</strong></a>`).join('');
  const phaseTotal = Math.max(1, phaseRows.reduce((sum, [, count]) => sum + count, 0));
  const phaseBlocks = phaseRows.slice(0, 6).map(([name, count]) => `<a href="/trials?status=active&amp;phase=${encodeURIComponent(name.replace(/ /g, ''))}" style="--share:${(count / phaseTotal) * 100}%"><strong>${number(count)}</strong><span>${escapeHtml(name)}</span></a>`).join('');
  const cards = rows.slice(0, 5).map((row) => `<li><span>${escapeHtml(row.external_id || 'Registry record')}</span><a href="/trials/${Number(row.id)}">${escapeHtml(row.title || 'Untitled registration')}</a><small>${escapeHtml(row.sponsor || 'Sponsor not reported')} · ${number(row.enrollment)} planned</small></li>`).join('');
  return `${storyHeader(story, snapshot.generated_at, lead, [
    metric(number(snapshot.total), 'active registrations', 'Recruiting, active or enrolling', '/trials?status=active'),
    metric(number(countries.length), 'country labels', 'At least one visible registration', '/trials?status=active'),
    metric(number(enrollment), 'planned enrolment', 'Not completed participation', '/trials?status=active'),
    metric(number(sponsors.size), 'named sponsors', 'Registry-supplied identities', '/trials?status=active'),
  ])}
  <section class="signal-visual signal-visual--map"><div class="signal-section-heading"><span>The geography</span><h2>Activity is global—but not evenly distributed.</h2><p>Each bubble represents active registrations that name that country. Multinational studies can appear in more than one country.</p></div><div class="signal-world" aria-label="Diagrammatic map of active trial registrations by country">${bubbles}<div class="signal-world-grid" aria-hidden="true"></div></div></section>
  <section class="signal-split"><div><span class="signals-kicker">Country visibility</span><h2>Where registrations appear</h2><div class="signal-ranking">${countryBars || '<p>No country metadata is available.</p>'}</div></div><div><span class="signals-kicker">Sponsor visibility</span><h2>Who appears most often</h2><div class="signal-ranking">${sponsorBars || '<p>No sponsor metadata is available.</p>'}</div></div></section>
  <section class="signal-visual signal-visual--phases"><div class="signal-section-heading"><span>Clinical maturity</span><h2>Which phases are represented?</h2><p>Phase labels describe registry design. They do not establish that a study succeeded or that an intervention is safe.</p></div><div class="signal-phase-blocks">${phaseBlocks}</div></section>
  <section class="signal-records"><div class="signal-section-heading"><span>Open the evidence</span><h2>Registrations behind the picture</h2></div><ol>${cards}</ol><a class="signal-primary-action" href="/trials?status=active">Explore every active registration →</a></section>
  ${disclosure({ complete: snapshot.complete, scope: 'Active or recruiting, quality-eligible longevity trial registrations in the current immortal.life index.', meaning: 'Counts describe registry activity and registry-supplied metadata. They do not show effectiveness, safety, approval, study quality or final participation.' })}
  ${journalistBox(story.title, snapshot.generated_at, [['Open filtered trials', '/trials?status=active'], ['Download trial data', '/datasets/trials.csv'], ['Read the methodology', '/methodology']])}</article>`;
}

function resultsGapStory(story, data) {
  const summary = data.summary || {};
  const cohorts = Array.isArray(data.cohorts) ? data.cohorts.filter((row) => Number(row.completed || 0) > 0).slice(0, 12) : [];
  const max = Math.max(1, ...cohorts.map((row) => Number(row.completed || 0)));
  const cohortRows = cohorts.map((row) => `<div class="signal-cohort"><strong>${escapeHtml(row.year)}</strong><div class="signal-cohort-track"><i class="is-posted" style="--value:${(Number(row.results_posted || 0) / max) * 100}%" title="${number(row.results_posted)} with results"></i><i class="is-gap" style="--value:${(Number(row.possible_gaps || 0) / max) * 100}%" title="${number(row.possible_gaps)} possible gaps"></i><i class="is-window" style="--value:${(Number(row.within_window || 0) / max) * 100}%" title="${number(row.within_window)} within twelve months"></i></div><span>${number(row.completed)} completed</span></div>`).join('');
  const gaps = (data.trials || []).filter((row) => row.result_state === 'possible-gap').slice(0, 8);
  const gapCards = gaps.map((row) => `<li><span>${number(row.days_since_completion)} days since listed completion</span><a href="/trials/${Number(row.id)}">${escapeHtml(row.title || 'Untitled registration')}</a><small>${escapeHtml(row.sponsor || 'Sponsor not reported')} · ${escapeHtml(row.external_id || 'Registry record')}</small></li>`).join('');
  const lead = `${number(summary.completed_trials)} completed registrations meet the monitor definition. Structured registry results are visible for ${number(summary.results_posted)}, while ${number(summary.possible_gaps)} are flagged for inspection because no structured results are visible more than 365 days after the listed completion date.`;
  return `${storyHeader(story, data.generated_at, lead, [
    metric(number(summary.completed_trials), 'completed registrations', 'Current eligible cohort', '/trials/results-gap'),
    metric(number(summary.results_posted), 'results visible', 'Structured registry results', '/trials/results-gap?status=results-posted'),
    metric(number(summary.possible_gaps), 'possible gaps', 'More than 365 days', '/trials/results-gap?status=possible-gap'),
    metric(percentage(summary.results_coverage_percent), 'registry coverage', 'Visible structured results', '/trials/results-gap'),
  ])}
  <section class="signal-visual signal-visual--gap"><div class="signal-section-heading"><span>Completion-year view</span><h2>Results visibility changes across trial cohorts.</h2><p>Rose shows visible structured results; dark carmine marks registrations that meet the possible-gap rule; pale gold is still within twelve months.</p></div><div class="signal-legend"><span class="is-posted">Results visible</span><span class="is-gap">Possible gap</span><span class="is-window">Within twelve months</span></div><div class="signal-cohorts">${cohortRows || '<p>No completion-year cohorts are available.</p>'}</div></section>
  <section class="signal-split signal-split--statement"><div><span class="signals-kicker">What stands out</span><strong class="signal-big-statement">${number(summary.oldest_gap_days)}</strong><p>days beyond the monitor threshold for the oldest visible possible gap.</p></div><div><span class="signals-kicker">What this cannot establish</span><h2>“No registry results” is not the same as “no results anywhere.”</h2><p>Results may appear in a publication, another registry, a regulator submission or a source not connected to the index. The signal exists to support inspection—not accusation.</p></div></section>
  <section class="signal-records"><div class="signal-section-heading"><span>Records to inspect</span><h2>The longest visible possible gaps</h2></div><ol>${gapCards || '<li>No registration currently meets the possible-gap definition.</li>'}</ol><a class="signal-primary-action" href="/trials/results-gap?status=possible-gap">Open the complete possible-gap cohort →</a></section>
  ${disclosure({ scope: data.definition?.cohort || 'Completed, quality-eligible longevity trial registrations.', meaning: data.interpretation_notice || 'A possible gap is an automated transparency signal, not evidence of misconduct or legal non-compliance.' })}
  ${journalistBox(story.title, data.generated_at, [['Open the live monitor', '/trials/results-gap'], ['Inspect possible gaps', '/trials/results-gap?status=possible-gap'], ['Read the methodology', '/methodology']])}</article>`;
}

function fundingStory(story, data) {
  const overview = data.overview || {};
  const summary = overview.summary || {};
  const funders = (overview.leading_funders || []).slice(0, 8);
  const topics = (overview.leading_topics || []).slice(0, 8);
  const institutions = (overview.leading_institutions || []).slice(0, 8);
  const cohorts = (overview.cohorts || []).slice(0, 12).reverse();
  const maxCohort = Math.max(1, ...cohorts.map((row) => Number(row.awards || 0)));
  const history = cohorts.map((row) => `<a href="/funding" style="--height:${Math.max(5, (Number(row.awards || 0) / maxCohort) * 100)}%"><i></i><strong>${number(row.awards)}</strong><span>${escapeHtml(row.year)}</span></a>`).join('');
  const maxFunder = Math.max(1, ...funders.map((row) => Number(row.awards || 0)));
  const funderRows = funders.map((row) => {
    const slug = funderSlug(row.funder_name, row.funder_id);
    return `<a class="signal-rank-row" href="${slug ? `/funders/${encodeURIComponent(slug)}` : `/funding?funder=${encodeURIComponent(row.funder_id || '')}`}"><span>${escapeHtml(row.funder_name || 'Funder')}</span><i style="--value:${(Number(row.awards || 0) / maxFunder) * 100}%"></i><strong>${number(row.awards)}</strong></a>`;
  }).join('');
  const flowFunders = funders.slice(0, 5).map((row) => `<a href="/funding?funder=${encodeURIComponent(row.funder_id || '')}"><strong>${escapeHtml(row.funder_name || 'Funder')}</strong><span>${number(row.awards)} award entities</span></a>`).join('');
  const flowTopics = topics.slice(0, 5).map((row) => `<a href="/funding?topic=${encodeURIComponent(row.slug || '')}"><strong>${escapeHtml(row.name || row.slug)}</strong><span>${number(row.awards)} award links</span></a>`).join('');
  const flowInstitutions = institutions.slice(0, 5).map((row) => `<a href="/universities/${encodeURIComponent(row.slug || '')}"><strong>${escapeHtml(row.name || 'Institution')}</strong><span>${number(row.awards)} award links</span></a>`).join('');
  const directCards = (data.direct_grants || []).slice(0, 5).map((row) => `<li><span>${escapeHtml(row.source_name || row.funder_name || 'Official grant source')}</span><a href="${escapeHtml(safeExternalUrl(row.source_url) || '/funding')}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.title || row.grant_number || 'Grant record')}</a><small>${escapeHtml([row.recipient_name, row.recipient_country_name].filter(Boolean).join(' · ') || 'Open the official source for details')}</small></li>`).join('');
  const lead = `The connected funding index currently separates ${number(data.direct_grant_total_matching)} direct official grant records from ${number(summary.awards)} publication-linked award entities. That distinction matters: an acknowledgement is evidence of a disclosed relationship, not a statement of total spending or impact.`;
  return `${storyHeader(story, data.generated_at, lead, [
    metric(number(data.direct_grant_total_matching), 'direct grant records', 'Official funder sources', '/funding#directGrantSection'),
    metric(number(summary.awards), 'award entities', 'Publication acknowledgements', '/funding'),
    metric(number(summary.funders), 'funder identities', 'Named in connected metadata', '/funders'),
    metric(number(summary.linked_publications), 'linked publications', 'Source-backed relationships', '/funding'),
  ])}
  <section class="signal-visual signal-visual--flow"><div class="signal-section-heading"><span>Connected landscape</span><h2>From funders to fields to institutions.</h2><p>These columns show the most visible entities in publication-linked acknowledgements. Lines indicate the structure of the database, not a claim that every funder supports every listed topic or institution.</p></div><div class="signal-flow"><div><span>Funders</span>${flowFunders}</div><i aria-hidden="true"></i><div><span>Topics</span>${flowTopics}</div><i aria-hidden="true"></i><div><span>Institutions</span>${flowInstitutions}</div></div></section>
  <section class="signal-split"><div><span class="signals-kicker">Award-linked history</span><h2>When award entities appear</h2><div class="signal-history">${history}</div></div><div><span class="signals-kicker">Most visible funders</span><h2>Named award relationships</h2><div class="signal-ranking">${funderRows || '<p>No funder relationships are available.</p>'}</div></div></section>
  <section class="signal-records"><div class="signal-section-heading"><span>Official grant records</span><h2>Recent grants available at their primary source</h2></div><ol>${directCards || '<li>Direct grant records are currently refreshing.</li>'}</ol><a class="signal-primary-action" href="/funding#directGrantSection">Open all direct grants →</a></section>
  ${disclosure({ scope: 'Direct grants from approved official feeds and funding acknowledgements connected to indexed longevity publications.', meaning: data.scope_notice || 'Funding metadata can be incomplete. Counts do not measure total spending, scientific quality, funder impact or research outcomes.' })}
  ${journalistBox(story.title, data.generated_at, [['Open Funding Radar', '/funding'], ['Browse funder profiles', '/funders'], ['Read the methodology', '/methodology']])}</article>`;
}

function hubBody(live = {}) {
  const cards = stories.map((story) => {
    const figure = live[story.slug];
    return `<article class="signal-card signal-card--${story.accent}"><div class="signal-card-art" aria-hidden="true"><i></i><i></i><i></i></div><span>${escapeHtml(story.number)} · ${escapeHtml(story.eyebrow)}</span><h2><a href="/signals/${story.slug}">${escapeHtml(story.title)}</a></h2><p>${escapeHtml(story.description)}</p>${figure ? `<strong>${escapeHtml(figure)}</strong>` : '<strong>Live source-linked view</strong>'}<a href="/signals/${story.slug}">Open the story →</a></article>`;
  }).join('');
  return `<section class="signals-manifesto"><p>Most longevity websites repeat claims. <strong>Signals starts with a measurable question, shows the connected records, and states what the numbers cannot prove.</strong></p><div><span>Live data</span><span>Permanent sources</span><span>Explicit limits</span><span>Reusable figures</span></div></section><section class="signal-card-grid">${cards}</section><section class="signal-promise"><div><span class="signals-kicker">The editorial standard</span><h2>Interesting enough to share. Careful enough to cite.</h2></div><div><p>Every story has a snapshot date, a precise cohort definition, a route to the underlying records and a compact explanation of what the data does not mean.</p><p>Signals does not give personal medical advice, rank treatments, infer effectiveness from volume, or turn missing metadata into an accusation.</p></div></section>${journalistBox('Immortal.life Signals', new Date(), [['Read the methodology', '/methodology'], ['Download public data', '/data'], ['See corrections', '/corrections']])}`;
}

async function renderHub() {
  const live = {};
  try {
    const [recruiting, active, enrolling, gaps, funding] = await Promise.all([
      fetchJson({ view: 'trials', status: 'Recruiting', limit: 1 }),
      fetchJson({ view: 'trials', status: 'Active, Not Recruiting', limit: 1 }),
      fetchJson({ view: 'trials', status: 'Enrolling By Invitation', limit: 1 }),
      fetchJson({ view: 'trial-results-gap' }, 20_000),
      fetchJson({ view: 'funding', limit: 1 }),
    ]);
    live['global-longevity-trial-map'] = `${number(Number(recruiting.total_matching || 0) + Number(active.total_matching || 0) + Number(enrolling.total_matching || 0))} active registrations`;
    live['longevity-trial-results-gap'] = `${number(gaps.summary?.possible_gaps)} possible gaps to inspect`;
    live['where-longevity-funding-flows'] = `${number(funding.direct_grant_total_matching)} direct grant records`;
  } catch (_) { /* The hub remains useful without transient live counts. */ }
  return shell({ title: 'Immortal.life Signals — stories hidden inside longevity data', description: 'Source-linked maps, graphs and data stories revealing where longevity trials, results and funding are moving.', canonical: `${SITE}/signals`, eyebrow: 'Immortal.life Signals', heading: 'The stories hidden inside longevity data.', body: hubBody(live) });
}

async function renderStory(slug) {
  const story = storyBySlug.get(slug);
  if (!story) return null;
  let body;
  if (slug === 'global-longevity-trial-map') body = activeTrialStory(story, await activeTrialSnapshot());
  if (slug === 'longevity-trial-results-gap') body = resultsGapStory(story, await fetchJson({ view: 'trial-results-gap' }, 20_000));
  if (slug === 'where-longevity-funding-flows') body = fundingStory(story, await fetchJson({ view: 'funding', limit: 12 }));
  return shell({ title: `${story.title} — Immortal.life Signals`, description: story.description, canonical: `${SITE}/signals/${story.slug}`, eyebrow: `Immortal.life Signals · ${story.eyebrow}`, heading: story.title, body });
}

function sitemap() {
  const urls = [{ path: '/signals', modified: STORY_DATE }, ...stories.map((story) => ({ path: `/signals/${story.slug}`, modified: STORY_DATE }))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((item) => `<url><loc>${escapeXml(`${SITE}${item.path}`)}</loc><lastmod>${item.modified}</lastmod></url>`).join('')}</urlset>\n`;
}

module.exports = async function signalsHandler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }
  if (String(request.query?.mode || '') === 'sitemap') {
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
    return response.status(200).send(request.method === 'HEAD' ? '' : sitemap());
  }
  const slug = String(request.query?.slug || '').trim();
  if (slug && !storyBySlug.has(slug)) return response.status(404).send('Not found');
  try {
    const html = slug ? await renderStory(slug) : await renderHub();
    if (!html) return response.status(404).send('Not found');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    return response.status(200).send(request.method === 'HEAD' ? '' : html);
  } catch (error) {
    console.error('Signals rendering failed:', error instanceof Error ? error.message : String(error));
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).send('This source-linked story is refreshing. Please try again shortly.');
  }
};

module.exports.stories = stories;
module.exports.shell = shell;
module.exports.hubBody = hubBody;
module.exports.activeTrialStory = activeTrialStory;
module.exports.resultsGapStory = resultsGapStory;
module.exports.fundingStory = fundingStory;
module.exports.sitemap = sitemap;
