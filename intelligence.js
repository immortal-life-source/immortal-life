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
    const confidence = numberFormatter.format(Number(record.relevance_confidence || 0));
    const summary = el('summary', '', `Why this record appears here · ${confidence}% topic match`);
    details.append(summary, el('p', '', 'The title, summary, or source keywords matched one or more topics followed by immortal.life. A higher percentage means a stronger topic match; it does not rate safety, effectiveness, or study quality.'));
    const relations = Array.isArray(record?.[relationName]) ? record[relationName].filter((item) => item?.is_published !== false) : [];
    relations.forEach((relation) => {
      const topic = relation?.intelligence_topics?.name || relation?.topic_slug || 'Tracked topic';
      details.append(el('p', 'quality-reason', `${topic}: ${Number(relation?.relevance_score || 0)}% topic match`));
    });
    details.append(el('p', 'quality-signal-note', `Automated source check: ${Number(record.source_quality_score || 0)}% · update recency: ${Number(record.freshness_score || 0)}%. These figures help sort records; they are not medical ratings.`));
    container.append(details);
  }

  function readableStatus(value) {
    return String(value || 'Status not supplied').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
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
      const researchCount = Number(topic.research_count || 0);
      const trialCount = Number(topic.trial_count || 0);
      const countParts = [];
      if (researchCount > 0) countParts.push(`${numberFormatter.format(researchCount)} ${researchCount === 1 ? 'paper' : 'papers'}`);
      if (trialCount > 0) countParts.push(`${numberFormatter.format(trialCount)} ${trialCount === 1 ? 'trial' : 'trials'}`);
      counts.textContent = countParts.join(' · ') || 'Index building';
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
      const researchSummary = `${evidenceLabel(record.evidence_level, record.status)}${record.journal ? ` from ${record.journal}` : ''}. Open the original record for the study details, methods, and limitations.`;
      main.append(el('p', '', researchSummary));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'research_item_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      if (record.is_open_access) tags.append(el('span', 'record-tag', 'Open access'));
      main.append(tags);
      appendQualityExplanation(main, record, 'research_item_topics');

      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', evidenceLabel(record.evidence_level, record.status)));
      const source = link('source-link', 'Open source record', record.source_url);
      source.dataset.ilEvent = 'open_source';
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
      const phases = Array.isArray(record.phases) && record.phases.length ? record.phases.map(readableStatus).join(', ') : 'Phase not supplied';
      main.append(el('p', '', `${phases} clinical study. Registry status: ${readableStatus(record.overall_status)}. Open the registry record for eligibility, locations, and contacts.`));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'clinical_trial_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      (record.phases || []).forEach((phase) => tags.append(el('span', 'record-tag', phase.replace(/_/g, ' '))));
      main.append(tags);
      appendQualityExplanation(main, record, 'clinical_trial_topics');

      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', readableStatus(record.overall_status)));
      const source = link('source-link', 'Open registry record', record.source_url);
      source.dataset.ilEvent = 'open_source';
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
      source.dataset.ilEvent = 'open_source';
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
      source.dataset.ilEvent = 'open_source';
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
      'layer:research': { x: 95, y: 92 }, 'layer:trials': { x: 1105, y: 92 },
      'layer:regulatory': { x: 1105, y: 628 }, 'layer:integrity': { x: 95, y: 628 },
    };
    const topicNodes = (data.nodes || []).filter((node) => node.kind === 'topic' && Number(node.weight || 0) > 0);
    const positions = {};
    topicNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(topicNodes.length, 1);
      positions[node.id] = { x: centerX + Math.cos(angle) * 325, y: centerY + Math.sin(angle) * 205 };
    });
    Object.assign(positions, layerPositions);
    const ns = 'http://www.w3.org/2000/svg';
    (data.links || []).forEach((edge) => {
      const from = positions[edge.source], to = positions[edge.target];
      if (!from || !to || edge.weight <= 0) return;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
      line.setAttribute('class', `graph-link graph-link--${edge.kind}`);
      line.setAttribute('stroke-width', String(Math.min(4, 0.7 + Math.log2(edge.weight + 1) * .55)));
      svg.append(line);
    });
    (data.nodes || []).filter((node) => Number(node.weight || 0) > 0).forEach((node) => {
      const point = positions[node.id]; if (!point) return;
      const group = document.createElementNS(ns, node.kind === 'topic' ? 'a' : 'g');
      if (node.kind === 'topic') group.setAttribute('href', `/topics/${encodeURIComponent(node.slug)}`);
      group.setAttribute('class', `graph-node graph-node--${node.kind}`);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y);
      circle.setAttribute('r', String(node.kind === 'topic' ? Math.min(32, 17 + Math.log2(Number(node.weight || 0) + 1) * 1.8) : 37));
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', point.x); label.setAttribute('y', point.y + (node.kind === 'topic' ? 48 : 57));
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

  function renderSources(sources, showList) {
    const shouldShowList = showList !== false;
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
      const sourceHealthLabels = { healthy: 'Up to date', degraded: 'Delayed', stale: 'Update delayed', pending: 'Checking' };
      const health = el('span', 'source-health', sourceHealthLabels[source.health] || readableStatus(source.health));
      health.dataset.health = source.health;
      const updated = source.last_success_at ? `Last checked ${dateFormatter.format(new Date(source.last_success_at))} · Updated ${source.update_cadence}` : `First update is pending · Updated ${source.update_cadence}`;
      item.append(sourceLink, health, el('p', '', updated));
      if (shouldShowList) elements.sourceList.append(item);
    });
    elements.sourceSection.hidden = !shouldShowList;

    const states = sources.map((source) => source.health);
    const overall = states.includes('degraded') ? 'degraded' : states.includes('stale') ? 'stale' : states.every((state) => state === 'healthy') ? 'healthy' : 'pending';
    elements.freshness.dataset.health = overall;
    if (overall === 'healthy') elements.freshnessText.textContent = 'Source records are up to date.';
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
      const kinds = { topic: 'Topic', source: 'Scientific source', journal: 'Journal', sponsor: 'Trial sponsor' };
      card.append(el('span', 'section-index', kinds[entity.kind] || resourceLabel(entity.kind)));
      card.append(el('h3', '', entity.name));
      card.append(el('p', '', entity.description));
      card.append(el('strong', 'entity-count', `${numberFormatter.format(Number(entity.record_count || 0))} connected records`));
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
      ['Official resources listed', coverage?.total || 0],
      ['Countries and regions', coverage?.jurisdictions || 0],
      ['Updated automatically', coverage?.live_integrations || 0],
      ['Links checked successfully', coverage?.healthy || 0],
    ].forEach(([label, value]) => {
      const card = el('div', 'atlas-stat');
      card.append(el('strong', '', numberFormatter.format(Number(value))), el('span', '', label));
      elements.resourceStats.append(card);
    });
  }

  function renderResourceMap(coverage) {
    elements.resourceMapNodes.replaceChildren();
    const positions = {
      Global: { x: 600, y: 68 }, Europe: { x: 620, y: 178 }, Americas: { x: 250, y: 220 },
      'Asia-Pacific': { x: 990, y: 270 }, Africa: { x: 650, y: 365 }, 'Middle East': { x: 765, y: 235 },
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
      const healthLabels = { healthy: 'Available', degraded: 'Check delayed', restricted: 'Access limited', stale: 'Update delayed', pending: 'Checking' };
      const health = el('span', 'source-health', healthLabels[resource.health] || readableStatus(resource.health));
      health.dataset.health = resource.health;
      heading.append(health);
      const title = el('h3');
      const official = link('', resource.name, resource.homepage_url);
      official.target = '_blank'; official.rel = 'noopener noreferrer';
      title.append(official);
      const jurisdiction = el('p', 'resource-jurisdiction', `${resource.jurisdiction_name} · ${resourceLabel(resource.geographic_scope)} scope`);
      const badges = el('div', 'resource-badges');
      badges.append(
        el('span', resource.integration_status === 'live' ? 'resource-badge resource-badge--live' : 'resource-badge', resource.integration_status === 'live' ? 'Updated automatically' : 'Verified official link'),
        el('span', 'resource-badge', resource.access_mode === 'api' ? 'Data interface available' : resourceLabel(resource.access_mode)),
        el('span', 'resource-badge', resource.reuse_status === 'open' ? 'Reuse allowed' : resource.reuse_status === 'link-only' ? 'Link to source' : 'Source terms apply'),
      );
      const actions = el('div', 'resource-actions');
      if (resource.data_url) { const dataLink = link('section-link', 'Visit data page', resource.data_url); dataLink.target = '_blank'; dataLink.rel = 'noopener noreferrer'; actions.append(dataLink); }
      if (resource.terms_url) { const termsLink = link('section-link section-link--muted', 'Usage terms', resource.terms_url); termsLink.target = '_blank'; termsLink.rel = 'noopener noreferrer'; actions.append(termsLink); }
      const limitations = el('details', 'resource-limitations');
      limitations.append(el('summary', '', 'What this source covers'), el('p', '', resource.limitations), el('p', 'resource-eligibility', resource.eligibility_reason));
      const checked = resource.health_basis === 'ingestion' ? 'Updated from the live source' : resource.last_checked_at ? `Link checked ${formatTimestamp(resource.last_checked_at)}` : 'First link check is pending';
      card.append(heading, title, jurisdiction, el('p', 'resource-description', resource.description), badges, limitations, actions, el('p', 'resource-check', `${checked} · ${resource.update_cadence}`));
      elements.resourceGrid.append(card);
    });
    elements.resourceResult.textContent = `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(atlasResources.length)} official resources.`;
    document.querySelectorAll('[data-resource-preset]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.resourcePreset === type));
    });
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
    document.querySelectorAll('[data-resource-preset]').forEach((button) => {
      button.onclick = () => {
        elements.resourceSearch.value = '';
        elements.resourceRegion.value = '';
        elements.resourceIntegration.value = '';
        elements.resourceType.value = button.dataset.resourcePreset || '';
        renderFilteredResources();
        elements.resourceResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
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
      ['Research records shown', telemetry?.research?.published, 'Passed the automatic topic and source checks.'],
      ['Research records withheld', telemetry?.research?.quarantined, 'Kept off the public site because the match was too weak or uncertain.'],
      ['Average research match', Number(telemetry?.research?.average_confidence || 0) > 0 ? `${Number(telemetry.research.average_confidence)}%` : 'Pending', 'Average topic relevance of the records currently shown.'],
      ['Repeated records removed', telemetry?.research?.duplicates_suppressed, 'Near-identical records grouped behind one main entry.'],
      ['Trial records shown', telemetry?.trials?.published, 'Registry records that passed the automatic checks.'],
      ['Trial records withheld', telemetry?.trials?.quarantined, 'Registry records held back because the longevity connection was unclear.'],
      ['Average trial match', Number(telemetry?.trials?.average_confidence || 0) > 0 ? `${Number(telemetry.trials.average_confidence)}%` : 'Pending', 'Average topic relevance of the trials currently shown.'],
      ['Search engine update', telemetry?.indexing?.succeeded === true ? 'Up to date' : telemetry?.indexing?.succeeded === false ? 'Delayed' : 'Pending', 'Whether the latest changed pages were sent to supported search engines.'],
      ['Weekly briefing delivery', telemetry?.distribution?.succeeded === true ? 'Up to date' : telemetry?.distribution?.succeeded === false ? 'Delayed' : 'Pending', 'Whether the latest automatic briefing was generated and sent.'],
      ['Google impressions · 28 days', telemetry?.search?.last_imported_at ? telemetry.search.impressions : 'Not connected yet', 'How often pages appeared in Google search results.'],
      ['Google visits · 28 days', telemetry?.search?.last_imported_at ? telemetry.search.clicks : 'Not connected yet', 'Visits from Google search results.'],
      ['Search pages to improve', telemetry?.search?.last_imported_at ? telemetry.search.open_opportunities : 'Not connected yet', telemetry?.search?.last_imported_at ? `Pages appearing in search that may benefit from clearer titles or descriptions. Data updated ${formatTimestamp(telemetry.search.last_imported_at)}.` : 'Search Console data will appear here after its secure connection is configured.'],
    ];
    groups.forEach(([label, value, description]) => {
      const card = el('article', 'quality-stat');
      const displayValue = typeof value === 'number' ? numberFormatter.format(value) : value ?? 'Pending';
      card.append(el('span', '', label), el('strong', '', displayValue), el('small', '', description));
      elements.qualityGrid.append(card);
    });
    elements.qualitySection.hidden = false;
  }

  async function request(viewName, limit) {
    const url = new URL(endpoint);
    url.searchParams.set('quality_rules', '20260916b');
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
        renderSources(data.sources || [], true);
      } else if (view === 'research') {
        const [data, topicsData] = await Promise.all([request('research', 60), request('topics', 100)]);
        renderResearch(data.research || []);
        renderSources(data.sources || [], false);
        renderTopics(topicsData.topics || [], true);
      } else if (view === 'trials') {
        const [data, topicsData] = await Promise.all([request('trials', 60), request('topics', 100)]);
        renderTrials(data.trials || []);
        renderSources(data.sources || [], false);
        renderTopics(topicsData.topics || [], true);
      } else if (view === 'topics') {
        const data = await request('topics', 100);
        renderTopics(data.topics || [], false);
        renderSources(data.sources || [], true);
      } else if (view === 'topic') {
        const [research, trials, topics] = await Promise.all([
          request('research', 40),
          request('trials', 40),
          request('topics', 100),
        ]);
        renderResearch(research.research || []);
        renderTrials(trials.trials || []);
        renderSources(research.sources || trials.sources || [], false);
        const selected = (topics.topics || []).find((topic) => topic.slug === topicSlug);
        if (selected) {
          renderStats({ research: selected.research_count, trials: selected.trial_count });
        }
      } else if (view === 'regulatory') {
        const data = await request('regulatory', 80);
        renderRegulatory(data.regulatory || []);
        renderSources(data.sources || [], false);
      } else if (view === 'integrity') {
        const data = await request('integrity', 80);
        renderIntegrity(data.integrity || []);
        renderSources(data.sources || [], false);
      } else if (view === 'graph') {
        const data = await request('graph', 100);
        renderGraph(data);
        renderSources(data.sources || [], true);
      } else if (view === 'entities') {
        const data = await request('entities', 100);
        renderEntities(data.entities || []);
        renderSources(data.sources || [], false);
      } else if (view === 'resources') {
        const data = await request('resources', 100);
        renderResources(data);
      } else if (view === 'quality') {
        const data = await request('quality', 100);
        renderQuality(data.telemetry || {});
        renderSources(data.sources || [], true);
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
