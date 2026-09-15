'use strict';

(function initIntelligencePortal() {
  const body = document.body;
  const view = body.dataset.view || 'overview';
  const topicSlug = body.dataset.topic || '';
  const endpoint = `${window.IL_FN_BASE}/public-intelligence`;
  const dateFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });
  const numberFormatter = new Intl.NumberFormat('en');

  const elements = {
    loading: document.getElementById('loadingState'),
    error: document.getElementById('errorState'),
    retry: document.getElementById('retryButton'),
    freshness: document.getElementById('freshness'),
    freshnessText: document.getElementById('freshnessText'),
    statsSection: document.getElementById('statsSection'),
    researchCount: document.getElementById('researchCount'),
    trialCount: document.getElementById('trialCount'),
    topicCount: document.getElementById('topicCount'),
    topicsSection: document.getElementById('topicsSection'),
    topicGrid: document.getElementById('topicGrid'),
    researchSection: document.getElementById('researchSection'),
    researchList: document.getElementById('researchList'),
    trialsSection: document.getElementById('trialsSection'),
    trialList: document.getElementById('trialList'),
    regulatorySection: document.getElementById('regulatorySection'),
    regulatoryList: document.getElementById('regulatoryList'),
    integritySection: document.getElementById('integritySection'),
    integrityList: document.getElementById('integrityList'),
    graphSection: document.getElementById('graphSection'),
    graph: document.getElementById('evidenceGraph'),
    graphFallback: document.getElementById('graphFallback'),
    entitiesSection: document.getElementById('entitiesSection'),
    entityGrid: document.getElementById('entityGrid'),
    resourcesSection: document.getElementById('resourcesSection'),
    resourceStats: document.getElementById('resourceStats'),
    resourceMapNodes: document.getElementById('resourceMapNodes'),
    mapSummary: document.getElementById('mapSummary'),
    resourceControls: document.getElementById('resourceControls'),
    resourceSearch: document.getElementById('resourceSearch'),
    resourceRegion: document.getElementById('resourceRegion'),
    resourceType: document.getElementById('resourceType'),
    resourceIntegration: document.getElementById('resourceIntegration'),
    resourceResult: document.getElementById('resourceResult'),
    resourceGrid: document.getElementById('resourceGrid'),
    qualitySection: document.getElementById('qualitySection'),
    qualityGrid: document.getElementById('qualityGrid'),
    sourceSection: document.getElementById('sourceSection'),
    sourceList: document.getElementById('sourceList'),
  };

  document.querySelector(`[data-nav="${view === 'overview' || view === 'topic' ? 'research' : view}"]`)?.setAttribute('aria-current', 'page');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function link(className, label, href) {
    const node = el('a', className, label);
    node.href = href;
    return node;
  }

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : dateFormatter.format(parsed);
  }

  function formatTimestamp(value) {
    if (!value) return 'Date unavailable';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : dateFormatter.format(parsed);
  }

  function topicLinks(record, relationName) {
    const relations = Array.isArray(record?.[relationName]) ? record[relationName] : [];
    return relations
      .filter((relation) => relation?.is_published !== false)
      .map((relation) => relation?.intelligence_topics || relation)
      .filter((topic) => topic && topic.slug && topic.name);
  }

  function appendQualityExplanation(container, record, relationName) {
    const details = el('details', 'quality-explanation');
    const summary = el('summary', '', `Why this matched · ${numberFormatter.format(Number(record.relevance_confidence || 0))}% confidence`);
    details.append(summary, el('p', '', record.match_explanation || 'Matched automatically using controlled terminology and source metadata.'));
    const relations = Array.isArray(record?.[relationName]) ? record[relationName].filter((item) => item?.is_published !== false) : [];
    relations.forEach((relation) => {
      const topic = relation?.intelligence_topics?.name || relation?.topic_slug || 'Tracked topic';
      const reasons = Array.isArray(relation?.match_reasons) ? relation.match_reasons.join(' ') : '';
      details.append(el('p', 'quality-reason', `${topic} · ${Number(relation?.relevance_score || 0)}%${reasons ? ` — ${reasons}` : ''}`));
    });
    details.append(el('p', 'quality-signal-note', `Source quality ${Number(record.source_quality_score || 0)}% · freshness ${Number(record.freshness_score || 0)}%. Routing signals only—not medical or evidence-strength ratings.`));
    container.append(details);
  }

  function renderTopics(topics, compact) {
    elements.topicGrid.replaceChildren();
    const visible = compact ? topics.slice(0, 6) : topics;
    visible.forEach((topic, index) => {
      const card = link('topic-card', '', `/topics/${encodeURIComponent(topic.slug)}`);
      card.append(el('span', 'topic-card-number', String(index + 1).padStart(2, '0')));
      card.append(el('h3', '', topic.name));
      card.append(el('p', '', topic.description));
      const counts = el('span', 'topic-counts');
      counts.textContent = `${numberFormatter.format(Number(topic.research_count || 0))} papers · ${numberFormatter.format(Number(topic.trial_count || 0))} trials`;
      card.append(counts);
      elements.topicGrid.append(card);
    });
    elements.topicsSection.hidden = false;
    const allLink = elements.topicsSection.querySelector('.section-link');
    if (allLink) allLink.hidden = !compact;
  }

  function renderResearch(records) {
    elements.researchList.replaceChildren();
    if (!records.length) {
      elements.researchList.append(el('p', 'empty-list', 'The first source sync is in progress. This page will populate automatically.'));
    }
    records.forEach((record) => {
      const card = el('article', 'record-card');
      const meta = el('div', 'record-meta');
      meta.append(el('div', '', formatDate(record.published_on)));
      if (record.journal) meta.append(el('div', '', record.journal));

      const main = el('div', 'record-main');
      const heading = el('h3');
      heading.append(link('record-title-link', record.title, `/research/${encodeURIComponent(record.id)}`));
      main.append(heading);
      main.append(el('p', '', record.editorial_summary));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'research_item_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      if (record.is_open_access) tags.append(el('span', 'record-tag', 'Open access'));
      main.append(tags);
      appendQualityExplanation(main, record, 'research_item_topics');

      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', evidenceLabel(record.evidence_level, record.status)));
      const source = link('source-link', 'Open source record', record.source_url);
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      action.append(source);
      card.append(meta, main, action);
      elements.researchList.append(card);
    });
    elements.researchSection.hidden = false;
  }

  function evidenceLabel(level, status) {
    if (status === 'retracted') return 'Retracted record';
    const labels = {
      'human-synthesis': 'Evidence synthesis',
      'randomized-human': 'Randomized human study',
      'human-study': 'Human study',
      preclinical: 'Preclinical research',
      preprint: 'Preprint · not peer reviewed',
      'research-record': 'Research record',
    };
    return labels[level] || 'Research record';
  }

  function renderTrials(records) {
    elements.trialList.replaceChildren();
    if (!records.length) {
      elements.trialList.append(el('p', 'empty-list', 'The first registry sync is in progress. This page will populate automatically.'));
    }
    records.forEach((record) => {
      const card = el('article', 'record-card');
      const meta = el('div', 'record-meta');
      meta.append(el('div', '', record.external_id));
      meta.append(el('div', '', formatDate(record.last_update_date)));
      if (record.enrollment != null) meta.append(el('div', '', `${numberFormatter.format(record.enrollment)} planned enrollment`));

      const main = el('div', 'record-main');
      const heading = el('h3');
      heading.append(link('record-title-link', record.title, `/trials/${encodeURIComponent(record.id)}`));
      main.append(heading);
      main.append(el('p', '', record.editorial_summary));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'clinical_trial_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      (record.phases || []).forEach((phase) => tags.append(el('span', 'record-tag', phase.replace(/_/g, ' '))));
      main.append(tags);
      appendQualityExplanation(main, record, 'clinical_trial_topics');

      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', record.overall_status));
      const source = link('source-link', 'Open registry record', record.source_url);
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      action.append(source);
      card.append(meta, main, action);
      elements.trialList.append(card);
    });
    elements.trialsSection.hidden = false;
  }

  function renderRegulatory(records) {
    elements.regulatoryList.replaceChildren();
    if (!records.length) elements.regulatoryList.append(el('p', 'empty-list', 'Official feeds are current; no notices have been indexed yet.'));
    records.forEach((record) => {
      const card = el('article', 'record-card');
      const meta = el('div', 'record-meta');
      meta.append(el('div', '', record.jurisdiction));
      meta.append(el('div', '', formatTimestamp(record.published_at)));
      if (record.content_sources?.name) meta.append(el('div', '', record.content_sources.name));
      const main = el('div', 'record-main');
      const heading = el('h3');
      heading.append(link('record-title-link', record.title, `/regulatory/${encodeURIComponent(record.id)}`));
      main.append(heading);
      main.append(el('p', '', record.summary));
      const tags = el('div', 'record-tags');
      (record.matched_topics || []).forEach((slug) => tags.append(link('record-tag', slug.replace(/-/g, ' '), `/topics/${encodeURIComponent(slug)}`)));
      main.append(tags);
      appendQualityExplanation(main, record, '');
      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', record.category));
      const source = link('source-link', 'Open official notice', record.source_url);
      source.target = '_blank'; source.rel = 'noopener noreferrer'; action.append(source);
      card.append(meta, main, action); elements.regulatoryList.append(card);
    });
    elements.regulatorySection.hidden = false;
  }

  function renderIntegrity(records) {
    elements.integrityList.replaceChildren();
    if (!records.length) elements.integrityList.append(el('p', 'empty-list', 'No Crossref-linked integrity events currently match the indexed research. Monitoring continues automatically.'));
    records.forEach((record) => {
      const card = el('article', 'record-card integrity-card');
      const meta = el('div', 'record-meta');
      meta.append(el('div', '', formatDate(record.announced_on)));
      meta.append(el('div', '', 'Detected ' + formatTimestamp(record.detected_at)));
      const main = el('div', 'record-main');
      const heading = el('h3');
      heading.append(link('record-title-link', record.title, `/integrity/${encodeURIComponent(record.id)}`));
      main.append(heading);
      main.append(el('p', '', record.summary));
      if (record.research_items?.title) main.append(el('p', 'integrity-linked', `Indexed record: ${record.research_items.title}`));
      appendQualityExplanation(main, record, '');
      const action = el('div', 'record-action');
      action.append(el('span', 'record-status record-status--alert', record.event_type));
      const source = link('source-link', 'Open integrity notice', record.source_url);
      source.target = '_blank'; source.rel = 'noopener noreferrer'; action.append(source);
      card.append(meta, main, action); elements.integrityList.append(card);
    });
    elements.integritySection.hidden = false;
  }

  function renderGraph(data) {
    const svg = elements.graph;
    svg.replaceChildren(svg.querySelector('title'), svg.querySelector('desc'));
    const width = 1200, height = 720, centerX = width / 2, centerY = height / 2;
    const layerPositions = {
      'layer:research': { x: 165, y: 140 }, 'layer:trials': { x: 1035, y: 140 },
      'layer:regulatory': { x: 1035, y: 580 }, 'layer:integrity': { x: 165, y: 580 },
    };
    const topicNodes = (data.nodes || []).filter((node) => node.kind === 'topic');
    const positions = {};
    topicNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(topicNodes.length, 1);
      positions[node.id] = { x: centerX + Math.cos(angle) * 245, y: centerY + Math.sin(angle) * 245 };
    });
    Object.assign(positions, layerPositions);
    const ns = 'http://www.w3.org/2000/svg';
    (data.links || []).forEach((edge) => {
      const from = positions[edge.source], to = positions[edge.target];
      if (!from || !to || edge.weight <= 0) return;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
      line.setAttribute('class', `graph-link graph-link--${edge.kind}`);
      line.setAttribute('stroke-width', String(Math.min(8, 0.8 + Math.log2(edge.weight + 1))));
      svg.append(line);
    });
    (data.nodes || []).forEach((node) => {
      const point = positions[node.id]; if (!point) return;
      const group = document.createElementNS(ns, node.kind === 'topic' ? 'a' : 'g');
      if (node.kind === 'topic') group.setAttribute('href', `/topics/${encodeURIComponent(node.slug)}`);
      group.setAttribute('class', `graph-node graph-node--${node.kind}`);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y);
      circle.setAttribute('r', String(node.kind === 'topic' ? Math.min(35, 18 + Math.log2(Number(node.weight || 0) + 1) * 2) : 48));
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', point.x); label.setAttribute('y', point.y + (node.kind === 'topic' ? 50 : 70));
      label.setAttribute('text-anchor', 'middle'); label.textContent = node.label;
      const count = document.createElementNS(ns, 'text');
      count.setAttribute('x', point.x); count.setAttribute('y', point.y + 4); count.setAttribute('text-anchor', 'middle');
      count.setAttribute('class', 'graph-count'); count.textContent = numberFormatter.format(Number(node.weight || 0));
      group.append(circle, count, label); svg.append(group);
    });
    elements.graphFallback.replaceChildren();
    const fallbackTitle = el('h3', '', 'Evidence by topic'); elements.graphFallback.append(fallbackTitle);
    const fallbackList = el('ul', 'graph-fallback-list');
    topicNodes.forEach((node) => { const item = el('li'); item.append(link('', node.label, `/topics/${encodeURIComponent(node.slug)}`), el('span', '', numberFormatter.format(Number(node.weight || 0)))); fallbackList.append(item); });
    elements.graphFallback.append(fallbackList); elements.graphSection.hidden = false;
  }

  function renderSources(sources) {
    elements.sourceList.replaceChildren();
    if (!sources.length) {
      elements.sourceSection.hidden = true;
      elements.freshness.dataset.health = 'pending';
      elements.freshnessText.textContent = 'Waiting for a verified source synchronization.';
      return;
    }
    sources.forEach((source) => {
      const item = el('div', 'source-item');
      const sourceLink = link('', source.name, source.homepage_url);
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      const health = el('span', 'source-health', source.health);
      health.dataset.health = source.health;
      const updated = source.last_success_at ? `Last successful sync ${dateFormatter.format(new Date(source.last_success_at))} · ${source.update_cadence}` : `First sync pending · ${source.update_cadence}`;
      item.append(sourceLink, health, el('p', '', updated));
      elements.sourceList.append(item);
    });
    elements.sourceSection.hidden = false;

    const states = sources.map((source) => source.health);
    const overall = states.includes('degraded') ? 'degraded' : states.includes('stale') ? 'stale' : states.every((state) => state === 'healthy') ? 'healthy' : 'pending';
    elements.freshness.dataset.health = overall;
    if (overall === 'healthy') elements.freshnessText.textContent = 'All configured sources passed their latest automated checks.';
    else if (overall === 'pending') elements.freshnessText.textContent = 'Initial source synchronization is in progress.';
    else elements.freshnessText.textContent = 'One or more sources are delayed; existing records remain cited and available.';
  }

  function renderStats(values) {
    const stats = [
      [elements.researchCount, Number(values.research || 0)],
      [elements.trialCount, Number(values.trials || 0)],
      [elements.topicCount, Number(values.topics || 0)],
    ];
    let visible = 0;
    stats.forEach(([valueElement, value]) => {
      const cell = valueElement?.parentElement;
      if (!valueElement || !cell) return;
      const hasValue = Number.isFinite(value) && value > 0;
      cell.hidden = !hasValue;
      if (hasValue) {
        valueElement.textContent = numberFormatter.format(value);
        visible += 1;
      }
    });
    elements.statsSection.hidden = visible === 0;
    elements.statsSection.style.setProperty('--visible-stat-count', String(Math.max(visible, 1)));
  }

  function renderEntities(entities) {
    elements.entityGrid.replaceChildren();
    if (!entities.length) elements.entityGrid.append(el('p', 'empty-list', 'Entity generation will follow the next source synchronization.'));
    entities.forEach((entity) => {
      const card = link('entity-card', '', `/entities/${encodeURIComponent(entity.kind)}/${encodeURIComponent(entity.slug)}`);
      card.append(el('span', 'section-index', entity.kind));
      card.append(el('h3', '', entity.name));
      card.append(el('p', '', entity.description));
      card.append(el('strong', 'entity-count', `${numberFormatter.format(Number(entity.record_count || 0))} published records`));
      elements.entityGrid.append(card);
    });
    elements.entitiesSection.hidden = false;
  }

  function resourceLabel(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderResourceStats(coverage) {
    elements.resourceStats.replaceChildren();
    [
      ['Qualified resources', coverage?.total || 0],
      ['Jurisdictions', coverage?.jurisdictions || 0],
      ['Live connections', coverage?.live_integrations || 0],
      ['Healthy checks', coverage?.healthy || 0],
    ].forEach(([label, value]) => {
      const card = el('div', 'atlas-stat');
      card.append(el('strong', '', numberFormatter.format(Number(value))), el('span', '', label));
      elements.resourceStats.append(card);
    });
  }

  function renderResourceMap(coverage) {
    elements.resourceMapNodes.replaceChildren();
    const positions = {
      Global: { x: 600, y: 82 }, Europe: { x: 635, y: 196 }, Americas: { x: 250, y: 220 }, 'Asia-Pacific': { x: 970, y: 280 },
    };
    const ns = 'http://www.w3.org/2000/svg';
    Object.entries(coverage?.by_region || {}).forEach(([region, count]) => {
      const point = positions[region];
      if (!point) return;
      const group = document.createElementNS(ns, 'a');
      group.setAttribute('href', `?region=${encodeURIComponent(region)}`);
      group.setAttribute('class', 'resource-map-node');
      group.setAttribute('aria-label', `Show ${region} resources: ${count}`);
      const pulse = document.createElementNS(ns, 'circle');
      pulse.setAttribute('class', 'resource-map-pulse'); pulse.setAttribute('cx', point.x); pulse.setAttribute('cy', point.y); pulse.setAttribute('r', '34');
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', String(22 + Math.min(18, Number(count) * 2)));
      const number = document.createElementNS(ns, 'text');
      number.setAttribute('x', point.x); number.setAttribute('y', point.y + 6); number.setAttribute('text-anchor', 'middle'); number.textContent = String(count);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', point.x); label.setAttribute('y', point.y + 58); label.setAttribute('text-anchor', 'middle'); label.setAttribute('class', 'resource-map-label'); label.textContent = region;
      group.append(pulse, circle, number, label);
      group.addEventListener('click', (event) => {
        event.preventDefault();
        elements.resourceRegion.value = region;
        renderFilteredResources();
        elements.resourceControls.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      elements.resourceMapNodes.append(group);
    });
    elements.mapSummary.textContent = 'The map shows directory coverage, not regulatory equivalence. Global resources aggregate across countries; national and regional decisions apply only where stated.';
  }

  let atlasResources = [];

  function renderFilteredResources() {
    const query = String(elements.resourceSearch.value || '').trim().toLowerCase();
    const region = elements.resourceRegion.value;
    const type = elements.resourceType.value;
    const integration = elements.resourceIntegration.value;
    const visible = atlasResources.filter((resource) => {
      const searchable = `${resource.name} ${resource.jurisdiction_name} ${resource.description} ${resource.resource_type}`.toLowerCase();
      return (!query || searchable.includes(query)) && (!region || resource.region === region) && (!type || resource.resource_type === type) && (!integration || resource.integration_status === integration);
    });
    elements.resourceGrid.replaceChildren();
    visible.forEach((resource) => {
      const card = el('article', 'resource-card');
      const heading = el('div', 'resource-card-heading');
      heading.append(el('span', 'section-index', resourceLabel(resource.resource_type)));
      const health = el('span', 'source-health', resource.health);
      health.dataset.health = resource.health;
      heading.append(health);
      const title = el('h3');
      const official = link('', resource.name, resource.homepage_url);
      official.target = '_blank'; official.rel = 'noopener noreferrer';
      title.append(official);
      const jurisdiction = el('p', 'resource-jurisdiction', `${resource.jurisdiction_name} · ${resourceLabel(resource.geographic_scope)} scope`);
      const badges = el('div', 'resource-badges');
      badges.append(
        el('span', resource.integration_status === 'live' ? 'resource-badge resource-badge--live' : 'resource-badge', resource.integration_status === 'live' ? 'Live ingestion' : 'Verified directory'),
        el('span', 'resource-badge', resourceLabel(resource.access_mode)),
        el('span', 'resource-badge', resource.reuse_status === 'open' ? 'Open reuse' : resource.reuse_status === 'link-only' ? 'Link only' : 'Source terms apply'),
      );
      const actions = el('div', 'resource-actions');
      if (resource.data_url) { const dataLink = link('section-link', 'Open data access', resource.data_url); dataLink.target = '_blank'; dataLink.rel = 'noopener noreferrer'; actions.append(dataLink); }
      if (resource.terms_url) { const termsLink = link('section-link section-link--muted', 'Access terms', resource.terms_url); termsLink.target = '_blank'; termsLink.rel = 'noopener noreferrer'; actions.append(termsLink); }
      const limitations = el('details', 'resource-limitations');
      limitations.append(el('summary', '', 'Scope and limitations'), el('p', '', resource.limitations), el('p', 'resource-eligibility', resource.eligibility_reason));
      const checked = resource.health_basis === 'ingestion' ? 'Health based on live ingestion' : resource.last_checked_at ? `Availability checked ${formatTimestamp(resource.last_checked_at)}` : 'First automated check pending';
      card.append(heading, title, jurisdiction, el('p', 'resource-description', resource.description), badges, limitations, actions, el('p', 'resource-check', `${checked} · ${resource.update_cadence}`));
      elements.resourceGrid.append(card);
    });
    elements.resourceResult.textContent = `${numberFormatter.format(visible.length)} of ${numberFormatter.format(atlasResources.length)} qualified resources shown.`;
  }

  function renderResources(data) {
    atlasResources = Array.isArray(data.resources) ? data.resources : [];
    renderResourceStats(data.coverage || {});
    renderResourceMap(data.coverage || {});
    const regions = [...new Set(atlasResources.map((item) => item.region))].sort();
    const types = [...new Set(atlasResources.map((item) => item.resource_type))].sort();
    regions.forEach((region) => elements.resourceRegion.append(new Option(region, region)));
    types.forEach((type) => elements.resourceType.append(new Option(resourceLabel(type), type)));
    const initialRegion = new URLSearchParams(location.search).get('region');
    if (regions.includes(initialRegion)) elements.resourceRegion.value = initialRegion;
    elements.resourceControls.addEventListener('input', renderFilteredResources);
    renderFilteredResources();
    const states = atlasResources.map((resource) => resource.health);
    const healthy = states.filter((state) => state === 'healthy').length;
    const degraded = states.filter((state) => state === 'degraded').length;
    const restricted = states.filter((state) => state === 'restricted').length;
    elements.freshness.dataset.health = degraded ? 'degraded' : healthy === states.length && states.length ? 'healthy' : 'pending';
    elements.freshnessText.textContent = degraded ? `${degraded} resource check${degraded === 1 ? '' : 's'} delayed; jurisdiction and provenance data remain visible.` : restricted ? `${restricted} official source${restricted === 1 ? '' : 's'} restrict automated checks; verified links and scope information remain available.` : healthy === states.length && states.length ? 'All qualified resource links passed the latest automated availability check.' : 'Initial automated resource checks are in progress.';
    elements.resourcesSection.hidden = false;
  }

  function renderQuality(telemetry) {
    elements.qualityGrid.replaceChildren();
    const groups = [
      ['Research published', telemetry?.research?.published],
      ['Research quarantined', telemetry?.research?.quarantined],
      ['Research confidence', `${Number(telemetry?.research?.average_confidence || 0)}%`],
      ['Duplicates suppressed', telemetry?.research?.duplicates_suppressed],
      ['Trials published', telemetry?.trials?.published],
      ['Trials quarantined', telemetry?.trials?.quarantined],
      ['Trial confidence', `${Number(telemetry?.trials?.average_confidence || 0)}%`],
      ['IndexNow notification', telemetry?.indexing?.succeeded === true ? 'Healthy' : telemetry?.indexing?.succeeded === false ? 'Degraded' : 'Pending'],
      ['Briefing distribution', telemetry?.distribution?.succeeded === true ? 'Healthy' : telemetry?.distribution?.succeeded === false ? 'Degraded' : 'Pending'],
      ['Search impressions · 28d', telemetry?.search?.last_imported_at ? telemetry.search.impressions : 'Connecting'],
      ['Search clicks · 28d', telemetry?.search?.last_imported_at ? telemetry.search.clicks : 'Connecting'],
      ['Search opportunities', telemetry?.search?.last_imported_at ? telemetry.search.open_opportunities : 'Connecting'],
      ['Search data freshness', telemetry?.search?.last_imported_at ? formatTimestamp(telemetry.search.last_imported_at) : 'Awaiting secure API link'],
    ];
    groups.forEach(([label, value]) => {
      const card = el('article', 'quality-stat');
      card.append(el('span', '', label), el('strong', '', typeof value === 'number' ? numberFormatter.format(value) : value ?? '—'));
      elements.qualityGrid.append(card);
    });
    elements.qualitySection.hidden = false;
  }

  async function request(viewName, limit) {
    const url = new URL(endpoint);
    url.searchParams.set('view', viewName);
    url.searchParams.set('limit', String(limit));
    if (topicSlug) url.searchParams.set('topic', topicSlug);
    const res = await fetch(url, { headers: window.ilFnHeaders() });
    if (!res.ok) throw new Error(`Feed request failed with ${res.status}`);
    return res.json();
  }

  async function load() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    try {
      if (view === 'overview') {
        const data = await request('overview', 12);
        renderStats({ research: data.stats?.research_records, trials: data.stats?.clinical_trials, topics: data.stats?.topics });
        renderTopics(data.topics || [], true);
        renderResearch(data.research || []);
        renderTrials(data.trials || []);
        renderSources(data.sources || []);
      } else if (view === 'research') {
        const [data, topicsData] = await Promise.all([request('research', 60), request('topics', 100)]);
        renderResearch(data.research || []);
        renderSources(data.sources || []);
        renderTopics(topicsData.topics || [], true);
      } else if (view === 'trials') {
        const [data, topicsData] = await Promise.all([request('trials', 60), request('topics', 100)]);
        renderTrials(data.trials || []);
        renderSources(data.sources || []);
        renderTopics(topicsData.topics || [], true);
      } else if (view === 'topics') {
        const data = await request('topics', 100);
        renderTopics(data.topics || [], false);
        renderSources(data.sources || []);
      } else if (view === 'topic') {
        const [research, trials, topics] = await Promise.all([
          request('research', 40),
          request('trials', 40),
          request('topics', 100),
        ]);
        renderResearch(research.research || []);
        renderTrials(trials.trials || []);
        renderSources(research.sources || trials.sources || []);
        const selected = (topics.topics || []).find((topic) => topic.slug === topicSlug);
        if (selected) {
          renderStats({ research: selected.research_count, trials: selected.trial_count });
        }
      } else if (view === 'regulatory') {
        const data = await request('regulatory', 80);
        renderRegulatory(data.regulatory || []);
        renderSources(data.sources || []);
      } else if (view === 'integrity') {
        const data = await request('integrity', 80);
        renderIntegrity(data.integrity || []);
        renderSources(data.sources || []);
      } else if (view === 'graph') {
        const data = await request('graph', 100);
        renderGraph(data);
        renderSources(data.sources || []);
      } else if (view === 'entities') {
        const data = await request('entities', 100);
        renderEntities(data.entities || []);
        renderSources(data.sources || []);
      } else if (view === 'resources') {
        const data = await request('resources', 100);
        renderResources(data);
      } else if (view === 'quality') {
        const data = await request('quality', 100);
        renderQuality(data.telemetry || {});
        renderSources(data.sources || []);
      }
      elements.loading.hidden = true;
    } catch (error) {
      console.error('Intelligence portal load failed:', error);
      elements.loading.hidden = true;
      elements.error.hidden = false;
      elements.freshness.dataset.health = 'degraded';
      elements.freshnessText.textContent = 'Live source status is temporarily unavailable.';
    }
  }

  elements.retry?.addEventListener('click', load);
  load();
})();
