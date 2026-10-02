'use strict';

const numberFormatter = new Intl.NumberFormat('en-US');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function number(value) {
  return numberFormatter.format(Math.max(0, Number(value) || 0));
}

function safeUrl(value, fallback) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : fallback;
  } catch (_) {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

function currency(value, code) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(value) || 0);
  } catch (_) {
    return `${number(value)} ${String(code || '').trim()}`.trim();
  }
}

function link(href, className, content, attributes = '') {
  return `<a class="${className}" href="${escapeHtml(href)}"${attributes}>${content}</a>`;
}

function rankedList(rows, render) {
  return rows.slice(0, 6).map((row, index) => render(row, index)).join('');
}

function fundingInterpretation(topicName, summary, funding) {
  const directGrants = Number(summary.direct_grants || 0);
  const awardEntities = Number(summary.award_entities || 0);
  const directFunders = Number(summary.direct_funders || 0);
  const recipients = Number(summary.grant_recipients || 0);
  const countries = Number(summary.direct_countries || 0);
  const leadingDirect = Array.isArray(funding.direct_funders) ? funding.direct_funders[0] : null;
  const leadingAcknowledgement = Array.isArray(funding.acknowledgement_funders) ? funding.acknowledgement_funders[0] : null;
  if (directGrants && awardEntities) {
    return `${topicName} currently connects to ${number(directGrants)} official grant records and ${number(awardEntities)} award entities acknowledged on publications. These are complementary views: direct grants show reported awards, while acknowledgements show where funding is named in scholarly work. They should not be added together as a spending total.`;
  }
  if (directGrants) {
    const leader = leadingDirect?.name ? ` ${leadingDirect.name} is the most visible funder in this connected record set.` : '';
    return `${topicName} currently connects to ${number(directGrants)} official grant records from ${number(directFunders)} named funders, associated with ${number(recipients)} recipients across ${number(countries)} reported ${countries === 1 ? 'country' : 'countries'}.${leader} This describes recorded activity—not proof of effectiveness, impact, or complete global funding.`;
  }
  const leader = leadingAcknowledgement?.name ? ` ${leadingAcknowledgement.name} is the most frequently named funder in these publication records.` : '';
  return `${topicName} currently connects to ${number(awardEntities)} award entities acknowledged on indexed publications.${leader} Publication acknowledgements reveal visible relationships, not complete grant coverage, spending, influence, or scientific impact.`;
}

function trendModel(funding) {
  const acknowledgementYears = Array.isArray(funding.acknowledgement_years) ? funding.acknowledgement_years : [];
  const directYears = Array.isArray(funding.direct_grant_years) ? funding.direct_grant_years : [];
  const hasAcknowledgements = acknowledgementYears.some((item) => Number(item.publications || 0) > 0);
  const map = new Map();
  acknowledgementYears.forEach((item) => map.set(Number(item.year), { year: Number(item.year), publications: Number(item.publications || 0), grants: 0 }));
  directYears.forEach((item) => {
    const year = Number(item.year);
    const current = map.get(year) || { year, publications: 0, grants: 0 };
    current.grants = Number(item.grants || 0);
    map.set(year, current);
  });
  const years = [...map.values()].filter((item) => item.year).sort((left, right) => left.year - right.year).slice(-10);
  const completeYear = new Date().getUTCFullYear() - 1;
  const momentumRows = hasAcknowledgements ? acknowledgementYears : directYears;
  const field = hasAcknowledgements ? 'publications' : 'grants';
  const recent = momentumRows.filter((item) => Number(item.year) >= completeYear - 2 && Number(item.year) <= completeYear).reduce((sum, item) => sum + Number(item[field] || 0), 0);
  const prior = momentumRows.filter((item) => Number(item.year) >= completeYear - 5 && Number(item.year) <= completeYear - 3).reduce((sum, item) => sum + Number(item[field] || 0), 0);
  const momentum = prior ? Math.round((recent - prior) / prior * 100) : recent ? null : 0;
  return { years, recent, prior, momentum, hasAcknowledgements, field };
}

function renderTopicFundingSection(topicName, topicSlug, funding = {}) {
  const summary = funding.summary || {};
  const directGrants = Number(summary.direct_grants || 0);
  const activeGrants = Number(summary.active_direct_grants || 0);
  const awardEntities = Number(summary.award_entities || 0);
  const acknowledgementFunders = Number(summary.acknowledgement_funders || 0);
  const linkedPublications = Number(summary.linked_publications || 0);
  const linkedUniversities = Number(summary.linked_universities || 0);
  const hasFunding = directGrants > 0 || awardEntities > 0;
  const fundingHref = `/funding?topic=${encodeURIComponent(topicSlug)}`;
  const directHref = `${fundingHref}#directGrantSection`;
  const heading = `<div class="topic-funding-heading"><div><span class="section-index">Funding landscape</span><h2 id="topicFundingTitle">Who is funding ${escapeHtml(topicName)}—and where does that support appear?</h2><p>Official grants and funding acknowledgements in publications are shown as two distinct forms of evidence. Every figure opens the records behind it. This does not measure total spending or scientific impact.</p></div><a class="section-link" href="${fundingHref}">Open complete Funding Radar →</a></div>`;
  const definitions = [
    [directGrants, 'Official grant records', 'Directly reported by connected grant sources', directHref],
    [activeGrants, 'Current or undated grants', 'Records not outside their reported date window; some sources omit dates', directHref],
    [summary.direct_funders, 'Official grant funders', 'Distinct funders named by direct grant sources', directHref],
    [summary.grant_recipients, 'Grant recipients', 'Organisations named on official grant records', directHref],
    [summary.direct_countries, 'Recipient countries', 'Countries reported for direct grant recipients', directHref],
    [awardEntities, 'Acknowledged awards', 'Award identifiers attached to publications', fundingHref],
    [acknowledgementFunders, 'Acknowledgement funders', 'Distinct funders named on publications', fundingHref],
    [linkedPublications, 'Linked publications', 'Papers connected to acknowledged awards', fundingHref],
    [linkedUniversities, 'Connected universities', 'Institutions on those linked publications', `/universities?topic=${encodeURIComponent(topicSlug)}`],
  ].filter(([value]) => Number(value) > 0);
  const columns = definitions.length > 6 ? 3 : Math.max(1, definitions.length);
  const stats = definitions.map(([value, label, note, href]) => link(href, 'topic-funding-stat', `<strong>${number(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small>`)).join('');

  const pathway = (tone, kicker, title, description, nodes, href) => `<article class="topic-funding-pathway topic-funding-pathway--${tone}"><div class="topic-funding-pathway-heading"><span class="section-index">${escapeHtml(kicker)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><div class="topic-funding-pathway-flow">${nodes.map((node, index) => `<div class="topic-funding-pathway-node"><strong>${number(node.value)}</strong><span>${escapeHtml(node.label)}</span></div>${index < nodes.length - 1 ? '<i aria-hidden="true">→</i>' : ''}`).join('')}</div><a class="section-link" href="${escapeHtml(href)}">Open underlying records</a></article>`;
  const pathways = [];
  if (directGrants) pathways.push(pathway('direct', 'Direct funding evidence', 'Official grant records', 'These records come from connected grant databases and identify a grant, funder, recipient, and source record.', [
    { value: summary.direct_funders, label: 'funders' }, { value: directGrants, label: 'grants' }, { value: summary.grant_recipients, label: 'recipients' }, { value: summary.direct_countries, label: 'countries' },
  ], directHref));
  if (awardEntities) pathways.push(pathway('acknowledged', 'Publication-linked evidence', 'Funding acknowledgements', 'These relationships are named on indexed publications. They do not reveal the full grant value or prove that funding caused a result.', [
    { value: acknowledgementFunders, label: 'funders' }, { value: awardEntities, label: 'awards' }, { value: linkedPublications, label: 'publications' }, { value: linkedUniversities, label: 'universities' },
  ], fundingHref));

  const trend = trendModel(funding);
  const maximum = Math.max(1, ...trend.years.flatMap((item) => [item.publications, item.grants]));
  const legend = `${trend.hasAcknowledgements ? '<span class="topic-funding-legend-ack">Publications with acknowledged awards</span>' : ''}<span class="topic-funding-legend-direct">Official grants beginning</span>`;
  const chart = trend.years.map((item) => {
    const displayed = trend.hasAcknowledgements ? item.publications : item.grants;
    const label = trend.hasAcknowledgements ? `${item.year}: ${number(item.publications)} linked publications and ${number(item.grants)} official grants beginning` : `${item.year}: ${number(item.grants)} official grants beginning`;
    const ack = trend.hasAcknowledgements ? `<i class="topic-funding-year-ack" style="--funding-bar:${Math.max(item.publications ? 4 : 0, Math.round(item.publications / maximum * 100))}%"></i>` : '';
    const direct = `<i class="topic-funding-year-direct" style="--funding-bar:${Math.max(item.grants ? 4 : 0, Math.round(item.grants / maximum * 100))}%"></i>`;
    return link(fundingHref, 'topic-funding-year', `<strong>${number(displayed)}</strong><span class="topic-funding-year-bars">${ack}${direct}</span><span>${item.year}</span>`, ` aria-label="${escapeHtml(label)}"`);
  }).join('');
  const trendHtml = trend.years.length ? `<div class="topic-funding-trend-legend">${legend}</div><div class="topic-funding-trend-chart">${chart}</div>` : '<p class="topic-funding-no-data">The connected records do not yet provide enough dated activity for a meaningful trend.</p>';

  const activityName = trend.hasAcknowledgements ? 'funding-linked publication activity' : 'official grant activity';
  const activityUnit = trend.hasAcknowledgements ? 'linked publications' : 'official grants beginning';
  const momentumHeading = trend.momentum == null ? `Visible ${activityName} is emerging.` : trend.momentum > 10 ? `${activityName[0].toUpperCase()}${activityName.slice(1)} is growing.` : trend.momentum < -10 ? `${activityName[0].toUpperCase()}${activityName.slice(1)} has slowed recently.` : `${activityName[0].toUpperCase()}${activityName.slice(1)} is broadly steady.`;
  const momentumCopy = trend.momentum == null ? `${number(trend.recent)} ${activityUnit} appear in the latest three complete years; the preceding period is too small for a stable percentage comparison.` : `The latest three complete years contain ${number(trend.recent)} ${activityUnit}, ${number(Math.abs(trend.momentum))}% ${trend.momentum >= 0 ? 'more than' : 'fewer than'} the preceding three years.`;
  const share = summary.top_five_acknowledgement_share_pct == null ? Number.NaN : Number(summary.top_five_acknowledgement_share_pct);
  const concentration = Number.isFinite(share) ? `The five most frequently named funders account for ${number(share)}% of acknowledged awards.` : 'Funder concentration cannot yet be calculated from the connected records.';
  const amounts = (Array.isArray(funding.reported_amounts) ? funding.reported_amounts : []).slice(0, 4);
  const amountHtml = amounts.length ? `<div class="topic-funding-amounts"><span>Reported award amounts</span>${amounts.map((item) => `<strong>${escapeHtml(currency(item.amount, item.currency))} · ${number(item.grants)} grant${Number(item.grants) === 1 ? '' : 's'}</strong>`).join('')}<small>Currencies stay separate; totals are not converted or combined.</small></div>` : '';
  const insight = `<aside class="topic-funding-insight" id="topicFundingInsight"><span class="section-index">What it means</span><h3>${escapeHtml(momentumHeading)}</h3><p class="topic-funding-interpretation">${escapeHtml(fundingInterpretation(topicName, summary, funding))}</p><p>${escapeHtml(momentumCopy)}</p><p>${escapeHtml(concentration)}</p><small>Activity measures records visible in the index—not spending, scientific quality, or whether findings were positive.</small>${amountHtml}</aside>`;

  const directFunders = Array.isArray(funding.direct_funders) ? funding.direct_funders : [];
  const acknowledgementRows = Array.isArray(funding.acknowledgement_funders) ? funding.acknowledgement_funders : [];
  const universities = Array.isArray(funding.universities) ? funding.universities : [];
  const ranked = (row, index, title, value, href, note) => link(href, 'topic-funding-ranked', `<span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(title)}</strong><b>${number(value)}</b><small>${escapeHtml(note)}</small>`);
  const directPanel = `<section class="topic-funding-panel"${directFunders.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Official grants</span><h3>Leading direct funders</h3></div><div class="topic-funding-list" id="topicDirectFunders">${rankedList(directFunders, (row, index) => ranked(row, index, row.name || 'Unnamed funder', row.grants, `${fundingHref}&search=${encodeURIComponent(row.name || '')}#directGrantSection`, `${number(row.active_grants)} current or undated record${Number(row.active_grants) === 1 ? '' : 's'}`))}</div></section>`;
  const acknowledgementPanel = `<section class="topic-funding-panel"${acknowledgementRows.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Publication acknowledgements</span><h3>Funders most often named</h3></div><div class="topic-funding-list" id="topicAcknowledgementFunders">${rankedList(acknowledgementRows, (row, index) => ranked(row, index, row.name || 'Unnamed funder', row.awards, row.slug ? `/funders/${encodeURIComponent(row.slug)}` : `${fundingHref}&search=${encodeURIComponent(row.name || '')}`, `${number(row.publications)} linked publication${Number(row.publications) === 1 ? '' : 's'}`))}</div></section>`;
  const visibleFunderPanels = Number(directFunders.length > 0) + Number(acknowledgementRows.length > 0);
  const funderColumns = `<div class="topic-funding-columns${visibleFunderPanels === 1 ? ' topic-funding-columns--single' : ''}">${directPanel}${acknowledgementPanel}</div>`;

  const universityPanel = `<section class="topic-funding-panel"${universities.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Research network</span><h3>Universities connected through publications</h3></div><div class="topic-funding-list" id="topicFundingUniversities">${rankedList(universities, (row, index) => ranked(row, index, row.name || 'Unnamed institution', row.awards, `/universities/${encodeURIComponent(row.slug)}?topic=${encodeURIComponent(topicSlug)}`, `${row.country_name || row.country_code || 'Location unavailable'} · acknowledged awards`))}</div></section>`;
  const countryGroups = [];
  const directCountries = Array.isArray(funding.direct_countries) ? funding.direct_countries : [];
  const acknowledgementCountries = Array.isArray(funding.acknowledgement_countries) ? funding.acknowledgement_countries : [];
  if (directCountries.length) countryGroups.push(`<div class="topic-funding-country-group"><strong>Official grant recipients</strong><div class="topic-funding-chips">${directCountries.slice(0, 8).map((row) => link(`${fundingHref}&country=${encodeURIComponent(row.country_code || '')}`, 'topic-funding-chip', `${escapeHtml(row.country_name || row.country_code)} · ${number(row.grants)}`)).join('')}</div></div>`);
  if (acknowledgementCountries.length) countryGroups.push(`<div class="topic-funding-country-group"><strong>Publication-linked institutions</strong><div class="topic-funding-chips">${acknowledgementCountries.slice(0, 8).map((row) => link(`${fundingHref}&country=${encodeURIComponent(row.country_code || '')}`, 'topic-funding-chip', `${escapeHtml(row.country_name || row.country_code)} · ${number(row.awards)}`)).join('')}</div></div>`);
  const countryPanel = `<section class="topic-funding-panel"${countryGroups.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Geography</span><h3>Where visible activity appears</h3></div><div class="topic-funding-country-groups" id="topicFundingCountries">${countryGroups.join('')}</div></section>`;
  const visibleNetworkPanels = Number(universities.length > 0) + Number(countryGroups.length > 0);
  const networkColumns = `<div class="topic-funding-columns${visibleNetworkPanels === 1 ? ' topic-funding-columns--single' : ''}">${universityPanel}${countryPanel}</div>`;

  const related = Array.isArray(funding.related_topics) ? funding.related_topics : [];
  const directions = related.length ? `<section class="topic-funding-directions"><div class="topic-funding-panel-heading"><span class="section-index">Connected directions</span><h3>Topics that share acknowledged awards</h3></div><div class="topic-funding-chips" id="topicFundingDirections">${related.slice(0, 8).map((row) => link(`/topics/${encodeURIComponent(row.slug)}#topicFunding`, 'topic-funding-chip', `${escapeHtml(row.name)} · ${number(row.shared_awards)}`)).join('')}</div></section>` : '<section class="topic-funding-directions" hidden><div id="topicFundingDirections"></div></section>';

  const recordCard = (title, meta, href, badge) => `<article class="topic-funding-record"><span>${escapeHtml(badge)}</span><h4><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title || 'Untitled funding record')}</a></h4><p>${escapeHtml(meta)}</p></article>`;
  const directRecords = Array.isArray(funding.recent_direct_grants) ? funding.recent_direct_grants : [];
  const recentAwards = Array.isArray(funding.recent_awards) ? funding.recent_awards : [];
  const directRecordsPanel = `<section class="topic-funding-panel"${directRecords.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Recent official records</span><h3>Direct grants</h3></div><div class="topic-funding-records" id="topicRecentDirectGrants">${directRecords.slice(0, 5).map((row) => recordCard(row.title || row.grant_number || row.source_grant_id, [row.funder_name, row.recipient_name, formatDate(row.start_date || row.source_updated_at)].filter(Boolean).join(' · '), safeUrl(row.source_url, directHref), 'Official grant record')).join('')}</div></section>`;
  const recentAwardsPanel = `<section class="topic-funding-panel"${recentAwards.length ? '' : ' hidden'}><div class="topic-funding-panel-heading"><span class="section-index">Recent source connections</span><h3>Acknowledged awards</h3></div><div class="topic-funding-records" id="topicRecentAwards">${recentAwards.slice(0, 5).map((row) => recordCard(row.title || row.award_identifier || row.openalex_award_id, [row.funder_name, row.award_identifier, row.latest_publication_date ? `latest linked publication ${formatDate(row.latest_publication_date)}` : ''].filter(Boolean).join(' · '), row.funder_slug ? `/funders/${encodeURIComponent(row.funder_slug)}` : safeUrl(row.source_url, fundingHref), 'Publication acknowledgement')).join('')}</div></section>`;
  const visibleRecentPanels = Number(directRecords.length > 0) + Number(recentAwards.length > 0);
  const recent = `<div class="topic-funding-recent${visibleRecentPanels === 1 ? ' topic-funding-columns--single' : ''}">${directRecordsPanel}${recentAwardsPanel}</div>`;

  const sources = (Array.isArray(funding.direct_sources) ? funding.direct_sources : []).map((item) => item.name).filter(Boolean);
  const refreshed = formatDate(funding.refreshed_at);
  const scope = `<aside class="topic-funding-scope" id="topicFundingScope"><strong>How to read this section</strong><p>Direct grant records${sources.length ? ` come from ${escapeHtml(sources.join(' and '))}` : ' come only from connected official grant feeds'}. Publication acknowledgements come from source-linked scholarly records. These collections have different coverage and must not be added together as a spending total. A funding relationship does not establish benefit, safety, impact, or endorsement.</p>${refreshed ? `<small>Funding view refreshed <time datetime="${escapeHtml(String(funding.refreshed_at))}">${escapeHtml(refreshed)}</time>.</small>` : ''}</aside>`;

  return `<section class="topic-funding" id="topicFunding" aria-labelledby="topicFundingTitle" data-prerendered="true">${heading}<div class="topic-funding-empty" id="topicFundingEmpty"${hasFunding ? ' hidden' : ''}>No verified funding relationship is currently matched in the connected sources. This describes present coverage; it does not prove that no funding exists.</div><div class="topic-funding-content" id="topicFundingContent"${hasFunding ? '' : ' hidden'}><div class="topic-funding-stats" id="topicFundingStats" aria-live="polite" style="--topic-funding-stat-columns:${columns}">${stats}</div><div class="topic-funding-pathways${pathways.length === 1 ? ' topic-funding-pathways--single' : ''}" id="topicFundingPathways">${pathways.join('')}</div><div class="topic-funding-analysis"><section class="topic-funding-panel"><div class="topic-funding-panel-heading"><span class="section-index">Funding momentum</span><h3>How has visible activity changed?</h3></div><div class="topic-funding-trend" id="topicFundingTrend" role="img" aria-label="Funding-linked activity by year">${trendHtml}</div></section>${insight}</div>${funderColumns}${networkColumns}${directions}${recent}${scope}</div></section>`;
}

function fundingSummaryText(funding = {}) {
  const summary = funding.summary || {};
  const direct = Number(summary.direct_grants || 0);
  const acknowledged = Number(summary.award_entities || 0);
  if (direct && acknowledged) return `${number(direct)} official grant ${direct === 1 ? 'record' : 'records'} · ${number(acknowledged)} publication-linked award ${acknowledged === 1 ? 'entity' : 'entities'}.`;
  if (direct) return `${number(direct)} official grant ${direct === 1 ? 'record' : 'records'} in connected grant sources.`;
  if (acknowledged) return `${number(acknowledged)} publication-linked award ${acknowledged === 1 ? 'entity' : 'entities'} currently identified.`;
  return 'Funding relationships are still being assembled for this topic.';
}

function injectFundingSnapshot(html, snapshot) {
  const funding = snapshot?.funding || {};
  const topic = snapshot?.topic || {};
  const topicSlug = String(topic.slug || '');
  const topicName = String(topic.name || topicSlug.replace(/-/g, ' '));
  if (!topicSlug || !topicName) return html;
  const start = '<section class="topic-funding" id="topicFunding"';
  const startIndex = html.indexOf(start);
  const endMarker = '<section class="topic-trend" id="topicTrend"';
  const endIndex = html.indexOf(endMarker, startIndex);
  if (startIndex < 0 || endIndex < 0) return html;
  let output = `${html.slice(0, startIndex)}${renderTopicFundingSection(topicName, topicSlug, funding)}\n    ${html.slice(endIndex)}`;
  output = output.replace(/(<small id="topicFundingSummary">)[\s\S]*?(<\/small>)/, `$1${escapeHtml(fundingSummaryText(funding))}$2`);
  const counts = snapshot?.counts || {};
  const evidenceRecordCount = Math.max(0, Number(counts.research_count || 0)) + Math.max(0, Number(counts.trial_count || 0));
  const indexable = evidenceRecordCount >= 5;
  output = output.replace(
    /<meta name="robots" content="[^"]*"\s*\/?>/,
    `<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}" />`,
  );
  output = output.replace(
    '</head>',
    `  <meta name="immortal-life:evidence-record-count" content="${evidenceRecordCount}" />\n  <meta name="immortal-life:index-readiness" content="${indexable ? 'ready' : 'building'}" />\n</head>`,
  );
  const modified = snapshot.modified_at || funding.refreshed_at;
  if (modified) {
    output = output.replace('</head>', `  <meta property="article:modified_time" content="${escapeHtml(modified)}" />\n</head>`);
    output = output.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (match, open, json, close) => {
      try {
        const schema = JSON.parse(json);
        const page = Array.isArray(schema['@graph']) ? schema['@graph'].find((item) => item?.['@id']?.endsWith('#webpage')) : null;
        if (page) page.dateModified = String(modified);
        return `${open}${JSON.stringify(schema).replace(/</g, '\\u003c')}${close}`;
      } catch (_) {
        return match;
      }
    });
  }
  return output;
}

function topicIndexable(snapshot) {
  const counts = snapshot?.counts || {};
  return Math.max(0, Number(counts.research_count || 0)) + Math.max(0, Number(counts.trial_count || 0)) >= 5;
}

module.exports = { escapeHtml, fundingInterpretation, fundingSummaryText, injectFundingSnapshot, renderTopicFundingSection, topicIndexable, trendModel };
