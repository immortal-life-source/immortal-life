'use strict';

(function initIntelligencePortal() {
  const body = document.body;
  const navToggleOnly = document.getElementById('intelNavToggle');
  const navOnly = document.getElementById('intelNav');

  function setNavigationOnly(open) {
    if (!navToggleOnly || !navOnly) return;
    navToggleOnly.setAttribute('aria-expanded', String(open));
    navOnly.dataset.open = String(open);
  }

  navToggleOnly?.addEventListener('click', () => setNavigationOnly(navToggleOnly.getAttribute('aria-expanded') !== 'true'));
  navOnly?.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setNavigationOnly(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setNavigationOnly(false);
  });

  document.querySelector('[data-mobile-menu-open]')?.addEventListener('click', () => navToggleOnly?.click());
  const currentPath = location.pathname;
  document.querySelectorAll('.mobile-dock a').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(`${href}/`))) anchor.setAttribute('aria-current', 'page');
  });

  const topicMatch = currentPath.match(/^\/topics\/([a-z0-9-]+)$/);
  if (topicMatch) {
    const topicName = document.querySelector('h1')?.textContent?.trim() || topicMatch[1].replace(/-/g, ' ');
    try {
      const recent = JSON.parse(localStorage.getItem('il_recent_topics') || '[]').filter((item) => item.slug !== topicMatch[1]);
      recent.unshift({ slug: topicMatch[1], name: topicName, visitedAt: new Date().toISOString() });
      localStorage.setItem('il_recent_topics', JSON.stringify(recent.slice(0, 8)));
    } catch (_) { /* storage is optional */ }
  }

  document.querySelectorAll('[data-learning-quiz] .quiz-question').forEach((question) => {
    question.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
      const correct = button.dataset.choice === question.dataset.answer;
      question.dataset.result = correct ? 'correct' : 'try-again';
      question.querySelector('small').hidden = false;
      question.querySelectorAll('[data-choice]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice === button)));
    }));
    question.querySelector('small').hidden = true;
  });

  document.querySelectorAll('.intel-nav-search').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="search"]');
    const query = String(input?.value || '').trim();
    if (!query) { input?.focus(); return; }
    try {
      const saved = JSON.parse(localStorage.getItem('il_saved_searches') || '[]').filter((item) => item.query.toLowerCase() !== query.toLowerCase());
      saved.unshift({ query, savedAt: new Date().toISOString() });
      localStorage.setItem('il_saved_searches', JSON.stringify(saved.slice(0, 8)));
    } catch (_) { /* storage is optional */ }
    window.location.href = `/topics?search=${encodeURIComponent(query)}`;
  }));

  if (!body.dataset.view) return;

  const view = body.dataset.view || 'overview';
  const topicSlug = body.dataset.topic || '';
  const endpoint = `${window.IL_FN_BASE}/public-intelligence`;
  const dateFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });
  const numberFormatter = new Intl.NumberFormat('en');

  const elements = {
    navToggle: document.getElementById('intelNavToggle'),
    nav: document.getElementById('intelNav'),
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
    topicTools: document.getElementById('topicTools'),
    topicSearch: document.getElementById('topicSearch'),
    topicResult: document.getElementById('topicResult'),
    researchSection: document.getElementById('researchSection'),
    researchList: document.getElementById('researchList'),
    researchControls: document.getElementById('researchControls'),
    researchSearch: document.getElementById('researchSearch'),
    researchTopic: document.getElementById('researchTopic'),
    researchEvidence: document.getElementById('researchEvidence'),
    researchAccess: document.getElementById('researchAccess'),
    researchClear: document.getElementById('researchClear'),
    researchResult: document.getElementById('researchResult'),
    researchLoadMore: document.getElementById('researchLoadMore'),
    trialsSection: document.getElementById('trialsSection'),
    trialList: document.getElementById('trialList'),
    trialControls: document.getElementById('trialControls'),
    trialSearch: document.getElementById('trialSearch'),
    trialTopic: document.getElementById('trialTopic'),
    trialStatus: document.getElementById('trialStatus'),
    trialPhase: document.getElementById('trialPhase'),
    trialCountry: document.getElementById('trialCountry'),
    trialClear: document.getElementById('trialClear'),
    trialResult: document.getElementById('trialResult'),
    trialLoadMore: document.getElementById('trialLoadMore'),
    regulatorySection: document.getElementById('regulatorySection'),
    regulatoryList: document.getElementById('regulatoryList'),
    regulatoryLibrary: document.getElementById('regulatoryLibrary'),
    regulatoryCoverage: document.getElementById('regulatoryCoverage'),
    regulatoryControls: document.getElementById('regulatoryControls'),
    regulatorySearch: document.getElementById('regulatorySearch'),
    regulatoryRegion: document.getElementById('regulatoryRegion'),
    regulatoryResult: document.getElementById('regulatoryResult'),
    regulatoryGuideGrid: document.getElementById('regulatoryGuideGrid'),
    integritySection: document.getElementById('integritySection'),
    integrityList: document.getElementById('integrityList'),
    graphSection: document.getElementById('graphSection'),
    graph: document.getElementById('evidenceGraph'),
    graphFallback: document.getElementById('graphFallback'),
    timelineSection: document.getElementById('timelineSection'),
    timelineList: document.getElementById('evidenceTimeline'),
    relatedJourneys: document.getElementById('relatedJourneys'),
    entitiesSection: document.getElementById('entitiesSection'),
    entityGrid: document.getElementById('entityGrid'),
    universitiesSection: document.getElementById('universitiesSection'),
    universityStats: document.getElementById('universityStats'),
    universityRegionGrid: document.getElementById('universityRegionGrid'),
    universityControls: document.getElementById('universityControls'),
    universitySearch: document.getElementById('universitySearch'),
    universityTopic: document.getElementById('universityTopic'),
    universityHeading: document.getElementById('universityHeading'),
    universityIntro: document.getElementById('universityIntro'),
    universityCountry: document.getElementById('universityCountry'),
    universityContinent: document.getElementById('universityContinent'),
    universitySort: document.getElementById('universitySort'),
    universityResult: document.getElementById('universityResult'),
    universityList: document.getElementById('universityList'),
    universityLoadMore: document.getElementById('universityLoadMore'),
    universityCompare: document.getElementById('universityCompare'),
    universityCompareGrid: document.getElementById('universityCompareGrid'),
    clearUniversityCompare: document.getElementById('clearUniversityCompare'),
    resourcesSection: document.getElementById('resourcesSection'),
    resourceStats: document.getElementById('resourceStats'),
    resourceRegionGrid: document.getElementById('resourceRegionGrid'),
    resourceCountryCoverage: document.getElementById('resourceCountryCoverage'),
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

  function setNavigation(open) {
    if (!elements.navToggle || !elements.nav) return;
    elements.navToggle.setAttribute('aria-expanded', String(open));
    elements.nav.dataset.open = String(open);
  }

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

  function appendReaderCopy(container, variants) {
    container.append(el('p', 'plain-record-copy', variants.beginner || variants.student || variants.professional || ''));
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

  function appendHumanGuide(container, rows) {
    const details = el('details', 'record-human-guide');
    details.append(el('summary', '', 'What this record means'));
    const list = el('dl', 'record-guide');
    rows.forEach(([label, value]) => {
      const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); list.append(row);
    });
    details.append(list); container.append(details);
  }

  function readableStatus(value) {
    return String(value || 'Status not supplied').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
  }

  function renderTopics(topics, compact) {
    const initialSearch = new URLSearchParams(location.search).get('search')?.trim() || '';
    if (!compact && elements.topicSearch) elements.topicSearch.value = initialSearch;
    const draw = () => {
      elements.topicGrid.replaceChildren();
      const search = String(compact ? initialSearch : elements.topicSearch?.value || initialSearch).trim().toLowerCase();
      const filtered = search ? topics.filter((topic) => `${topic.name} ${topic.description}`.toLowerCase().includes(search)) : topics;
      const visible = compact ? filtered.slice(0, 6) : filtered;
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
      if (!visible.length) elements.topicGrid.append(el('p', 'empty-list', `No tracked topic matches “${search}”. Try a broader term or browse all topics.`));
      if (!compact && elements.topicResult) elements.topicResult.textContent = `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(topics.length)} topics`;
    };
    if (!compact && elements.topicSearch && !elements.topicSearch.dataset.ready) {
      elements.topicSearch.addEventListener('input', draw);
      elements.topicSearch.dataset.ready = 'true';
    }
    if (elements.topicTools) elements.topicTools.hidden = compact;
    draw();
    elements.topicsSection.hidden = false;
    const allLink = elements.topicsSection.querySelector('.section-link');
    if (allLink) {
      allLink.hidden = false;
      allLink.href = compact ? '/topics' : '/resources';
      allLink.textContent = compact ? 'Explore all topics' : 'Open global sources';
    }
  }

  function drawResearch(records, emptyMessage = 'The first source sync is in progress. This page will populate automatically.') {
    elements.researchList.replaceChildren();
    if (!records.length) {
      elements.researchList.append(el('p', 'empty-list', emptyMessage));
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
      appendReaderCopy(main, {
        beginner: researchSummary,
        student: `${evidenceLabel(record.evidence_level, record.status)}${record.journal ? ` in ${record.journal}` : ''}. Treat the evidence stage as context: a single indexed record cannot establish a general clinical conclusion. Open the source to inspect the population, methods, comparison, outcomes, and limitations.`,
        professional: `${evidenceLabel(record.evidence_level, record.status)} · published ${formatDate(record.published_on)} · topic-match confidence ${Number(record.relevance_confidence || 0)}% · source-quality signal ${Number(record.source_quality_score || 0)}%. These automated signals describe indexing confidence, not validity or effect size.`,
      });
      main.append(evidenceLadder(record.evidence_level));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'research_item_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      if (record.is_open_access) tags.append(el('span', 'record-tag', 'Open access'));
      main.append(tags);
      appendHumanGuide(main, [
        ['What this is', `${evidenceLabel(record.evidence_level, record.status)} indexed from ${record.journal || 'a scholarly source'}.`],
        ['Why it may matter', 'It matched one or more longevity topics and may help show how that area is developing.'],
        ['Main limitation', record.evidence_level === 'preclinical' ? 'Lab or animal findings may not apply to people.' : record.evidence_level === 'preprint' ? 'This record has not completed peer review.' : 'A single record does not establish safety, effectiveness, or medical usefulness.'],
        ['What changed', `Added or refreshed from source metadata dated ${formatDate(record.published_on)}.`],
        ['Where to verify', 'Use “Open source record” below to read the original publication record.'],
      ]);
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

  function evidenceLadder(level) {
    const ladder = el('div', 'evidence-ladder');
    ladder.setAttribute('aria-label', 'Evidence stage');
    const stages = [
      ['preclinical', 'Lab / animal'], ['human-study', 'Human study'], ['randomized-human', 'Randomized'], ['human-synthesis', 'Evidence synthesis']
    ];
    const activeIndex = stages.findIndex(([key]) => key === level);
    stages.forEach(([key, label], index) => {
      const item = el('span', index === activeIndex ? 'is-current' : index < activeIndex ? 'is-passed' : '', label);
      item.dataset.stage = key; ladder.append(item);
    });
    return ladder;
  }

  function trialLadder(phases) {
    const ladder = el('div', 'evidence-ladder evidence-ladder--trial');
    ladder.setAttribute('aria-label', 'Clinical trial phase');
    const value = (Array.isArray(phases) ? phases.join(' ') : String(phases || '')).toLowerCase();
    const current = value.includes('phase 4') ? 3 : value.includes('phase 3') ? 2 : value.includes('phase 2') ? 1 : 0;
    ['Early phase', 'Phase 2', 'Phase 3', 'Phase 4'].forEach((label, index) => ladder.append(el('span', index === current ? 'is-current' : index < current ? 'is-passed' : '', label)));
    return ladder;
  }

  function drawTrials(records, emptyMessage = 'The first registry sync is in progress. This page will populate automatically.') {
    elements.trialList.replaceChildren();
    if (!records.length) {
      elements.trialList.append(el('p', 'empty-list', emptyMessage));
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
      appendReaderCopy(main, {
        beginner: `${phases} clinical study. Registry status: ${readableStatus(record.overall_status)}. Open the registry record for eligibility, locations, and contacts.`,
        student: `${phases} registered study with a current registry status of ${readableStatus(record.overall_status)}. Registration describes a protocol; it does not show that the study finished or that an intervention works. Check eligibility, outcomes, locations, and update history in the source.`,
        professional: `${record.external_id} · ${phases} · ${readableStatus(record.overall_status)} · planned enrollment ${record.enrollment == null ? 'not supplied' : numberFormatter.format(record.enrollment)} · registry metadata updated ${formatDate(record.last_update_date)} · match confidence ${Number(record.relevance_confidence || 0)}%.`,
      });
      main.append(trialLadder(record.phases));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'clinical_trial_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      (record.phases || []).forEach((phase) => tags.append(el('span', 'record-tag', phase.replace(/_/g, ' '))));
      main.append(tags);
      appendHumanGuide(main, [
        ['What this is', `${phases} registered clinical study.`],
        ['Why it may matter', `The registry currently reports the study as ${readableStatus(record.overall_status)}.`],
        ['Main limitation', 'Registration is not proof that a treatment works, is safe, or is available to you.'],
        ['What changed', `Registry metadata was last updated ${formatDate(record.last_update_date)}.`],
        ['Where to verify', 'Use “Open registry record” below for eligibility, sites, contacts, and current status.'],
      ]);
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

  let searchableResearch = [];
  let searchableTrials = [];
  let researchNextOffset = null;
  let trialNextOffset = null;
  let researchTotal = 0;
  let trialTotal = 0;
  let researchRequestVersion = 0;
  let trialRequestVersion = 0;
  let researchSearchTimer = 0;
  let trialSearchTimer = 0;

  function researchQueryParams(offset = 0) {
    return {
      offset,
      q: String(elements.researchSearch?.value || '').trim(),
      topic: elements.researchTopic?.value || '',
      evidence: elements.researchEvidence?.value || '',
      access: elements.researchAccess?.value || '',
    };
  }

  function trialQueryParams(offset = 0) {
    return {
      offset,
      q: String(elements.trialSearch?.value || '').trim(),
      topic: elements.trialTopic?.value || '',
      status: elements.trialStatus?.value || '',
      phase: elements.trialPhase?.value || '',
      country: elements.trialCountry?.value || '',
    };
  }

  function replaceFilterOptions(select, firstLabel, entries) {
    if (!select) return;
    select.replaceChildren(new Option(firstLabel, ''));
    entries.forEach(([value, label]) => select.append(new Option(label, value)));
  }

  function topicOptions(records, relationName) {
    const topics = new Map();
    records.forEach((record) => topicLinks(record, relationName).forEach((topic) => topics.set(topic.slug, topic.name)));
    return [...topics.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }

  function includesTopic(record, relationName, slug) {
    return !slug || topicLinks(record, relationName).some((topic) => topic.slug === slug);
  }

  function researchSearchText(record) {
    const authors = Array.isArray(record.authors)
      ? record.authors.map((author) => typeof author === 'string' ? author : author?.name || '').join(' ')
      : String(record.authors || '');
    return `${record.title || ''} ${record.journal || ''} ${authors} ${record.doi || ''}`.toLowerCase();
  }

  function filterResearchRecords() {
    const query = String(elements.researchSearch?.value || '').trim().toLowerCase();
    const topic = elements.researchTopic?.value || '';
    const evidence = elements.researchEvidence?.value || '';
    const access = elements.researchAccess?.value || '';
    const filtered = searchableResearch.filter((record) =>
      (!query || researchSearchText(record).includes(query)) &&
      includesTopic(record, 'research_item_topics', topic) &&
      (!evidence || record.evidence_level === evidence) &&
      (!access || (access === 'open' ? record.is_open_access : !record.is_open_access))
    );
    drawResearch(filtered, 'No research record matches these filters. Try a broader search or clear one of the filters.');
    if (elements.researchResult) elements.researchResult.textContent = `Showing ${numberFormatter.format(filtered.length)} matching records from ${numberFormatter.format(searchableResearch.length)} loaded · ${numberFormatter.format(researchTotal || searchableResearch.length)} available.`;
  }

  function setupResearchSearch() {
    if (!elements.researchControls || elements.researchControls.dataset.ready) return;
    replaceFilterOptions(elements.researchTopic, 'All topics', topicOptions(searchableResearch, 'research_item_topics'));
    const evidence = [...new Set(searchableResearch.map((record) => record.evidence_level).filter(Boolean))]
      .map((value) => [value, evidenceLabel(value)])
      .sort((left, right) => left[1].localeCompare(right[1]));
    replaceFilterOptions(elements.researchEvidence, 'All evidence stages', evidence);
    elements.researchSearch.value = new URLSearchParams(location.search).get('search')?.trim() || '';
    elements.researchControls.addEventListener('input', () => {
      filterResearchRecords();
      window.clearTimeout(researchSearchTimer);
      researchSearchTimer = window.setTimeout(() => reloadResearch().catch((error) => console.error('Research search failed:', error)), 300);
    });
    elements.researchClear.onclick = () => {
      elements.researchSearch.value = '';
      elements.researchTopic.value = '';
      elements.researchEvidence.value = '';
      elements.researchAccess.value = '';
      reloadResearch().catch((error) => console.error('Research search failed:', error));
      elements.researchSearch.focus();
    };
    elements.researchControls.dataset.ready = 'true';
    elements.researchControls.hidden = false;
  }

  async function reloadResearch() {
    const version = ++researchRequestVersion;
    const data = await request('research', 100, researchQueryParams(0));
    if (version !== researchRequestVersion) return;
    searchableResearch = data.research || [];
    researchNextOffset = data.next_offset;
    researchTotal = Number(data.total_matching || searchableResearch.length);
    filterResearchRecords();
    elements.researchLoadMore.hidden = researchNextOffset == null;
  }

  function renderResearch(records) {
    if (view !== 'research') return drawResearch(records);
    searchableResearch = records;
    setupResearchSearch();
    filterResearchRecords();
  }

  async function loadMoreResearch() {
    if (researchNextOffset == null) return;
    elements.researchLoadMore.disabled = true;
    elements.researchLoadMore.textContent = 'Loading…';
    try {
      const data = await request('research', 100, researchQueryParams(researchNextOffset));
      const known = new Set(searchableResearch.map((record) => record.id));
      searchableResearch.push(...(data.research || []).filter((record) => !known.has(record.id)));
      researchNextOffset = data.next_offset;
      researchTotal = Number(data.total_matching || searchableResearch.length);
      filterResearchRecords();
      elements.researchLoadMore.hidden = researchNextOffset == null;
    } finally {
      elements.researchLoadMore.disabled = false;
      elements.researchLoadMore.textContent = 'Load more research';
    }
  }

  function trialSearchText(record) {
    return `${record.title || ''} ${record.sponsor || ''} ${record.external_id || ''}`.toLowerCase();
  }

  function filterTrialRecords() {
    const query = String(elements.trialSearch?.value || '').trim().toLowerCase();
    const topic = elements.trialTopic?.value || '';
    const status = elements.trialStatus?.value || '';
    const phase = elements.trialPhase?.value || '';
    const country = elements.trialCountry?.value || '';
    const filtered = searchableTrials.filter((record) =>
      (!query || trialSearchText(record).includes(query)) &&
      includesTopic(record, 'clinical_trial_topics', topic) &&
      (!status || record.overall_status === status) &&
      (!phase || (record.phases || []).includes(phase)) &&
      (!country || (record.countries || []).includes(country))
    );
    drawTrials(filtered, 'No clinical trial matches these filters. Try a broader search or clear one of the filters.');
    if (elements.trialResult) elements.trialResult.textContent = `Showing ${numberFormatter.format(filtered.length)} matching trials from ${numberFormatter.format(searchableTrials.length)} loaded · ${numberFormatter.format(trialTotal || searchableTrials.length)} available.`;
  }

  function setupTrialSearch() {
    if (!elements.trialControls || elements.trialControls.dataset.ready) return;
    replaceFilterOptions(elements.trialTopic, 'All topics', topicOptions(searchableTrials, 'clinical_trial_topics'));
    replaceFilterOptions(elements.trialStatus, 'All statuses', [...new Set(searchableTrials.map((record) => record.overall_status).filter(Boolean))].sort().map((value) => [value, readableStatus(value)]));
    replaceFilterOptions(elements.trialPhase, 'All phases', [...new Set(searchableTrials.flatMap((record) => record.phases || []).filter(Boolean))].sort().map((value) => [value, readableStatus(value)]));
    replaceFilterOptions(elements.trialCountry, 'All countries', [...new Set(searchableTrials.flatMap((record) => record.countries || []).filter(Boolean))].sort((left, right) => left.localeCompare(right)).map((value) => [value, value]));
    elements.trialSearch.value = new URLSearchParams(location.search).get('search')?.trim() || '';
    elements.trialControls.addEventListener('input', () => {
      filterTrialRecords();
      window.clearTimeout(trialSearchTimer);
      trialSearchTimer = window.setTimeout(() => reloadTrials().catch((error) => console.error('Trial search failed:', error)), 300);
    });
    elements.trialClear.onclick = () => {
      elements.trialSearch.value = '';
      elements.trialTopic.value = '';
      elements.trialStatus.value = '';
      elements.trialPhase.value = '';
      elements.trialCountry.value = '';
      reloadTrials().catch((error) => console.error('Trial search failed:', error));
      elements.trialSearch.focus();
    };
    elements.trialControls.dataset.ready = 'true';
    elements.trialControls.hidden = false;
  }

  async function reloadTrials() {
    const version = ++trialRequestVersion;
    const data = await request('trials', 100, trialQueryParams(0));
    if (version !== trialRequestVersion) return;
    searchableTrials = data.trials || [];
    trialNextOffset = data.next_offset;
    trialTotal = Number(data.total_matching || searchableTrials.length);
    filterTrialRecords();
    elements.trialLoadMore.hidden = trialNextOffset == null;
  }

  function renderTrials(records) {
    if (view !== 'trials') return drawTrials(records);
    searchableTrials = records;
    setupTrialSearch();
    filterTrialRecords();
  }

  async function loadMoreTrials() {
    if (trialNextOffset == null) return;
    elements.trialLoadMore.disabled = true;
    elements.trialLoadMore.textContent = 'Loading…';
    try {
      const data = await request('trials', 100, trialQueryParams(trialNextOffset));
      const known = new Set(searchableTrials.map((record) => record.id));
      searchableTrials.push(...(data.trials || []).filter((record) => !known.has(record.id)));
      trialNextOffset = data.next_offset;
      trialTotal = Number(data.total_matching || searchableTrials.length);
      filterTrialRecords();
      elements.trialLoadMore.hidden = trialNextOffset == null;
    } finally {
      elements.trialLoadMore.disabled = false;
      elements.trialLoadMore.textContent = 'Load more trials';
    }
  }

  function regulatoryGuideTitle(resource) {
    const place = resource.jurisdiction_name || resource.geographic_scope || resource.region || 'this jurisdiction';
    return `How to check medicine approvals and safety in ${place}`;
  }

  function renderRegulatoryGuides(guides, coverage) {
    if (!elements.regulatoryGuideGrid || !elements.regulatoryLibrary) return;
    const ordered = [...guides].sort((a, b) => String(a.region).localeCompare(String(b.region)) || String(a.jurisdiction_name).localeCompare(String(b.jurisdiction_name)) || String(a.name).localeCompare(String(b.name)));
    const regions = [...new Set(ordered.map((item) => item.region).filter(Boolean))].sort();
    elements.regulatoryRegion?.replaceChildren(new Option('All regions', ''), ...regions.map((region) => new Option(region, region)));
    if (elements.regulatoryCoverage) {
      elements.regulatoryCoverage.replaceChildren();
      [[coverage?.authorities ?? ordered.length, 'official authorities'], [coverage?.jurisdictions ?? new Set(ordered.map((item) => item.jurisdiction_code)).size, 'jurisdictions'], [coverage?.regions ?? regions.length, 'world regions']].forEach(([value, label]) => {
        const stat = el('div'); stat.append(el('strong', '', value), el('span', '', label)); elements.regulatoryCoverage.append(stat);
      });
    }

    function draw() {
      const query = String(elements.regulatorySearch?.value || '').trim().toLowerCase();
      const region = elements.regulatoryRegion?.value || '';
      const filtered = ordered.filter((item) => (!region || item.region === region) && (!query || `${item.name} ${item.jurisdiction_name} ${item.region} ${item.description}`.toLowerCase().includes(query)));
      elements.regulatoryGuideGrid.replaceChildren();
      filtered.forEach((resource) => {
        const card = el('article', 'regulatory-guide-card');
        const overline = el('div', 'regulatory-guide-overline', `${resource.region || 'Global'} · ${resource.jurisdiction_name || resource.geographic_scope || 'Official authority'}`);
        const heading = el('h3'); heading.append(link('', regulatoryGuideTitle(resource), resource.homepage_url));
        const healthText = resource.health === 'healthy' ? 'Official link checked' : resource.health === 'restricted' ? 'Authority limits automated checks' : resource.health === 'degraded' ? 'Availability check delayed' : 'Awaiting availability check';
        appendReaderCopy(card, {
          beginner: `Use ${resource.name} for the official answer in ${resource.jurisdiction_name || resource.geographic_scope || 'its jurisdiction'}. Start here to check whether a medicine is authorised and to find official safety alerts, recalls, shortages, or product information.`,
          student: `${resource.description} Decisions are jurisdiction-specific: a listing, warning, or approval in one country does not automatically apply elsewhere. ${resource.limitations || 'Verify the exact product, indication, date, and authority record.'}`,
          professional: `${resource.name} · authority tier ${resource.authority_tier || 'not supplied'} · access ${String(resource.access_mode || 'not supplied').replace(/-/g, ' ')} · update cadence ${resource.update_cadence || 'source-defined'} · integration ${resource.integration_status === 'live' ? 'automated ingestion' : 'verified directory'} · availability ${healthText.toLowerCase()}. ${resource.limitations || ''}`,
        });
        const actions = el('div', 'regulatory-guide-actions');
        const official = link('source-link', 'Open official authority', resource.homepage_url); official.target = '_blank'; official.rel = 'noopener noreferrer'; actions.append(official);
        if (resource.data_url && resource.data_url !== resource.homepage_url) { const data = link('source-link section-link--muted', 'Open official database', resource.data_url); data.target = '_blank'; data.rel = 'noopener noreferrer'; actions.append(data); }
        card.prepend(overline, heading);
        card.append(el('div', `resource-health resource-health--${resource.health || 'pending'}`, healthText), actions);
        elements.regulatoryGuideGrid.append(card);
      });
      if (!filtered.length) elements.regulatoryGuideGrid.append(el('p', 'empty-list', 'No official authority matches those filters. Try a country, region, or shorter search term.'));
      if (elements.regulatoryResult) elements.regulatoryResult.textContent = `${numberFormatter.format(filtered.length)} of ${numberFormatter.format(ordered.length)} official-source guides shown`;
    }
    elements.regulatoryControls?.addEventListener('input', draw);
    elements.regulatoryControls?.addEventListener('change', draw);
    draw();
    elements.regulatoryLibrary.hidden = false;
  }

  function renderRegulatory(records, guides = [], coverage = {}) {
    elements.regulatoryList.replaceChildren();
    elements.regulatorySection.dataset.hasNotices = String(records.length > 0);
    if (!records.length) elements.regulatoryList.append(el('div', 'regulatory-live-state', 'No new notice passed the public relevance checks in this window. Monitoring continues automatically; use the official-source guides below for current authority information.'));
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
      appendReaderCopy(main, {
        beginner: record.summary,
        student: `${record.summary} This is an official notice, but its meaning is limited to the product, use, dates, and jurisdiction named in the source.`,
        professional: `${record.summary} Jurisdiction: ${record.jurisdiction || 'not supplied'} · category: ${record.category || 'not supplied'} · match confidence ${Number(record.relevance_confidence || 0)}% · source-quality signal ${Number(record.source_quality_score || 0)}%.`,
      });
      const tags = el('div', 'record-tags');
      (record.matched_topics || []).forEach((slug) => tags.append(link('record-tag', slug.replace(/-/g, ' '), `/topics/${encodeURIComponent(slug)}`)));
      main.append(tags);
      appendHumanGuide(main, [
        ['What this is', `${record.category || 'Official'} notice from ${record.jurisdiction || 'a public authority'}.`],
        ['Why it may matter', 'Official notices can change the safety, approval, recall, or monitoring context around a topic.'],
        ['Main limitation', 'The notice applies only to the product, use, date, and jurisdiction named by the authority.'],
        ['What changed', `Published or refreshed ${formatTimestamp(record.published_at)}.`],
        ['Where to verify', 'Use “Open official notice” below to read the authority’s original wording.'],
      ]);
      appendQualityExplanation(main, record, '');
      const action = el('div', 'record-action');
      action.append(el('span', 'record-status', record.category));
      const source = link('source-link', 'Open official notice', record.source_url);
      source.dataset.ilEvent = 'open_source';
      source.target = '_blank'; source.rel = 'noopener noreferrer'; action.append(source);
      card.append(meta, main, action); elements.regulatoryList.append(card);
    });
    renderRegulatoryGuides(guides, coverage);
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
      appendReaderCopy(main, {
        beginner: record.summary,
        student: `${record.summary} Read the original notice to see which parts of the earlier record were corrected, questioned, or withdrawn.`,
        professional: `${record.summary} Event: ${readableStatus(record.event_type)} · announced ${formatDate(record.announced_on)} · detected ${formatTimestamp(record.detected_at)} · match confidence ${Number(record.relevance_confidence || 0)}%.`,
      });
      if (record.research_items?.title) main.append(el('p', 'integrity-linked', `Indexed record: ${record.research_items.title}`));
      appendHumanGuide(main, [
        ['What this is', `${readableStatus(record.event_type)} linked to an indexed research record.`],
        ['Why it may matter', 'Corrections, retractions, and concerns can change how earlier evidence should be interpreted.'],
        ['Main limitation', 'This event does not automatically invalidate every related finding; read the notice for its exact scope.'],
        ['What changed', `Detected ${formatTimestamp(record.detected_at)}.`],
        ['Where to verify', 'Use “Open integrity notice” below to inspect the original record.'],
      ]);
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
      'layer:universities': { x: 600, y: 680 },
    };
    const topicNodes = (data.nodes || []).filter((node) => node.kind === 'topic' && Number(node.weight || 0) > 0);
    const positions = {};
    topicNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(topicNodes.length, 1);
      positions[node.id] = { x: centerX + Math.cos(angle) * 325, y: centerY + Math.sin(angle) * 205 };
    });
    (data.nodes || []).filter((node) => node.kind === 'mechanism').forEach((node, index) => {
      const topicPoint = positions[`topic:${node.slug}`];
      if (topicPoint) positions[node.id] = { x: centerX + (topicPoint.x - centerX) * .58, y: centerY + (topicPoint.y - centerY) * .58 };
      else positions[node.id] = { x: centerX + Math.cos(index) * 120, y: centerY + Math.sin(index) * 90 };
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
      circle.setAttribute('r', String(node.kind === 'topic' ? Math.min(32, 17 + Math.log2(Number(node.weight || 0) + 1) * 1.8) : node.kind === 'mechanism' ? 10 : 37));
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', point.x); label.setAttribute('y', point.y + (node.kind === 'topic' ? 48 : 57));
      label.setAttribute('text-anchor', 'middle'); label.textContent = node.label;
      const count = document.createElementNS(ns, 'text');
      count.setAttribute('x', point.x); count.setAttribute('y', point.y + 4); count.setAttribute('text-anchor', 'middle');
      count.setAttribute('class', 'graph-count'); count.textContent = node.kind === 'mechanism' ? '' : numberFormatter.format(Number(node.weight || 0));
      group.append(circle, count, label); svg.append(group);
    });
    elements.graphFallback.replaceChildren();
    const fallbackTitle = el('h3', '', 'Evidence by topic'); elements.graphFallback.append(fallbackTitle);
    const fallbackList = el('ul', 'graph-fallback-list');
    topicNodes.forEach((node) => { const item = el('li'); item.append(link('', node.label, `/topics/${encodeURIComponent(node.slug)}`), el('span', '', numberFormatter.format(Number(node.weight || 0)))); fallbackList.append(item); });
    elements.graphFallback.append(fallbackList); elements.graphSection.hidden = false;
  }

  function renderTimeline(data) {
    if (!elements.timelineSection || !elements.timelineList) return;
    elements.timelineList.replaceChildren();
    const events = Array.isArray(data.events) ? data.events : [];
    if (!events.length) elements.timelineList.append(el('li', 'timeline-empty', 'No source-level change has been recorded for this topic yet. Monitoring continues automatically.'));
    events.slice(0, 20).forEach((event) => {
      const item = el('li', `timeline-event timeline-event--${event.record_type || 'research'}`);
      item.append(el('time', '', formatTimestamp(event.occurred_at)), el('span', 'timeline-kind', readableStatus(event.event_type)));
      const heading = el('h3'); heading.append(link('', event.title, event.record_type && event.record_id ? `/${event.record_type === 'trials' ? 'trials' : event.record_type}/${encodeURIComponent(event.record_id)}` : event.source_url || '/changes'));
      item.append(heading, el('p', '', event.importance === 'important' ? 'Meaningful source change.' : 'New or updated source record. Open it to inspect the evidence and limitations.'));
      elements.timelineList.append(item);
    });
    elements.timelineSection.hidden = false;
    if (elements.relatedJourneys) {
      elements.relatedJourneys.replaceChildren(el('span', '', 'Related discoveries'));
      elements.relatedJourneys.append(link('', 'See all changes for this topic', `/changes?topic=${encodeURIComponent(topicSlug)}`));
      (data.related_topics || []).slice(0, 3).forEach((topic) => elements.relatedJourneys.append(link('', `Compare with ${topic.name}`, `/topics/${encodeURIComponent(topic.slug)}`)));
      elements.relatedJourneys.append(link('', 'Find related university activity', `/universities?topic=${encodeURIComponent(topicSlug)}`));
    }
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
      const sourceHealthLabels = { healthy: source.integration_status === 'directory' ? 'Official link available' : 'Up to date', degraded: 'Delayed', stale: 'Update delayed', pending: 'Checking', restricted: 'Access limited' };
      const health = el('span', 'source-health', sourceHealthLabels[source.health] || readableStatus(source.health));
      health.dataset.health = source.health;
      const sourceDate = source.last_success_at || source.last_healthy_at || source.last_checked_at;
      const sourceScope = source.jurisdiction_name ? `${source.jurisdiction_name} · Official medicines authority · ` : '';
      const updated = sourceDate
        ? `${sourceScope}Last checked ${dateFormatter.format(new Date(sourceDate))} · ${source.update_cadence}`
        : `${sourceScope}${source.integration_status === 'directory' ? 'Official-link check is pending' : 'First update is pending'} · ${source.update_cadence}`;
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

  let universityRows = [];
  let universityNextOffset = null;
  let universityTotal = 0;
  let universityControlsReady = false;
  const comparedUniversities = new Map();

  function percentage(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}%` : 'Not available';
  }

  function renderUniversityStats(coverage) {
    elements.universityStats.replaceChildren();
    [
      ['Universities indexed', coverage?.universities || 0, 'ranking'],
      ['Countries represented', coverage?.countries || 0, 'countries'],
      ['Longevity-topic links', coverage?.indexed_topic_links || 0, 'topics'],
      ['Five-year work links', coverage?.indexed_works_five_year || 0, 'activity'],
    ].forEach(([label, value, action]) => {
      const card = el('button', 'atlas-stat atlas-stat--action'); card.type = 'button';
      card.setAttribute('aria-label', `${numberFormatter.format(Number(value))} ${label}. Show what this represents.`);
      card.append(el('strong', '', numberFormatter.format(Number(value))), el('span', '', label), el('small', '', 'View details →'));
      card.onclick = () => {
        if (action === 'topics') elements.universityTopic.focus();
        else if (action === 'countries') elements.universityCountry.focus();
        else if (action === 'activity') { elements.universitySort.value = 'activity'; fetchUniversityIndex().catch(showUniversityError); }
        (action === 'topics' || action === 'countries' ? elements.universityControls : elements.universityList).scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      elements.universityStats.append(card);
    });
  }

  function renderUniversityRegions(rows) {
    elements.universityRegionGrid.replaceChildren();
    const groups = new Map();
    rows.forEach((university) => {
      const region = university.continent || 'Region unavailable';
      if (!groups.has(region)) groups.set(region, []);
      groups.get(region).push(university);
    });
    [...groups.entries()].sort((left, right) => right[1].length - left[1].length).forEach(([region, universities]) => {
      const card = el('button', 'university-region-card'); card.type = 'button';
      const leaders = [...universities].sort((left, right) => Number(right.indexed_works_five_year || 0) - Number(left.indexed_works_five_year || 0)).slice(0, 3);
      card.append(
        el('span', 'section-index', region),
        el('strong', '', numberFormatter.format(universities.length)),
        el('small', '', universities.length === 1 ? 'university in this result' : 'universities in this result'),
        el('p', '', leaders.map((university) => university.name).join(' · ')),
        el('i', '', 'View regional ranking →'),
      );
      card.onclick = () => {
        if (region !== 'Region unavailable') elements.universityContinent.value = region;
        fetchUniversityIndex().catch(showUniversityError);
        elements.universityControls.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      elements.universityRegionGrid.append(card);
    });
  }

  function metricForSort(university) {
    const topicSlug = elements.universityTopic?.value || '';
    if (topicSlug) {
      const topicMetric = (university.university_research_topic_metrics || []).find((metric) => metric.topic_slug === topicSlug);
      const topicName = elements.universityTopic.selectedOptions?.[0]?.textContent || topicSlug.replaceAll('-', ' ');
      return { value: numberFormatter.format(Number(topicMetric?.works_five_year || 0)), label: `${topicName} work links` };
    }
    const sort = elements.universitySort?.value || 'index';
    if (sort === 'activity') return { value: university.indexed_works_five_year, label: 'five-year work links' };
    if (sort === 'breadth') return { value: university.indexed_topic_count, label: 'topics represented' };
    if (sort === 'momentum') return { value: percentage(university.momentum_score), label: 'recent momentum' };
    if (sort === 'open-access') return { value: percentage(university.representative_open_access_share), label: 'open-access sample' };
    return { value: Number(university.research_index_score || 0).toFixed(1), label: 'transparent index score' };
  }

  function renderUniversityComparison() {
    elements.universityCompareGrid.replaceChildren();
    const selected = [...comparedUniversities.values()];
    elements.universityCompare.hidden = selected.length < 2;
    selected.forEach((university) => {
      const card = el('article', 'university-compare-card');
      card.append(el('span', 'section-index', university.country_name || university.country_code || 'Location unavailable'));
      const heading = el('h3'); heading.append(link('', university.name, `/universities/${encodeURIComponent(university.slug)}`));
      const metrics = el('dl');
      [
        ['Index score', Number(university.research_index_score || 0).toFixed(1)],
        ['All-time work links', numberFormatter.format(Number(university.indexed_works_all_time || 0))],
        ['Five-year work links', numberFormatter.format(Number(university.indexed_works_five_year || 0))],
        ['Topics', numberFormatter.format(Number(university.indexed_topic_count || 0))],
        ['Recent momentum', percentage(university.momentum_score)],
        ['Open-access sample', percentage(university.representative_open_access_share)],
      ].forEach(([label, value]) => { const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); metrics.append(row); });
      card.append(heading, metrics); elements.universityCompareGrid.append(card);
    });
  }

  function renderUniversityRows() {
    const search = String(elements.universitySearch?.value || '').trim().toLowerCase();
    const activeTopic = elements.universityTopic?.value || '';
    const activeTopicName = elements.universityTopic?.selectedOptions?.[0]?.textContent || activeTopic.replaceAll('-', ' ');
    const visible = universityRows.filter((university) => !search || `${university.name} ${university.city || ''} ${university.country_name || ''}`.toLowerCase().includes(search));
    elements.universityList.replaceChildren();
    if (!visible.length) elements.universityList.append(el('li', 'empty-list', universityRows.length ? 'No university in this result matches that name or location.' : 'The first automated university index refresh is pending. This page will populate without manual editing.'));
    visible.forEach((university, index) => {
      const item = el('li', 'university-row');
      const rank = el('span', 'university-rank', String(index + 1).padStart(2, '0'));
      const main = el('div', 'university-main');
      const location = [university.city, university.country_name || university.country_code].filter(Boolean).join(', ') || 'Location unavailable';
      main.append(el('span', 'section-index', location));
      const heading = el('h3'); heading.append(link('', university.name, `/universities/${encodeURIComponent(university.slug)}`)); main.append(heading);
      const topicMetrics = Array.isArray(university.university_research_topic_metrics) ? university.university_research_topic_metrics : [];
      const topicNames = topicMetrics.sort((left, right) => Number(right.works_five_year || 0) - Number(left.works_five_year || 0)).slice(0, 4).map((metric) => metric.topic_slug.replaceAll('-', ' '));
      const activeMetric = activeTopic ? topicMetrics.find((metric) => metric.topic_slug === activeTopic) : null;
      main.append(el('p', '', activeTopic
        ? `${numberFormatter.format(Number(activeMetric?.works_five_year || 0))} source-matched ${activeTopicName} work links in the five-year window; ${numberFormatter.format(Number(activeMetric?.works_two_year || 0))} are recent.`
        : topicNames.length ? `Strongest indexed activity: ${topicNames.join(', ')}.` : `${numberFormatter.format(Number(university.indexed_topic_count || 0))} longevity topics represented.`));
      const signals = el('div', 'university-signals');
      signals.append(
        el('span', '', `${numberFormatter.format(Number(university.indexed_works_all_time || 0))} all-time work links`),
        el('span', '', `${numberFormatter.format(Number(university.indexed_works_five_year || 0))} five-year work links`),
        el('span', '', `${numberFormatter.format(Number(university.indexed_topic_count || 0))} topics`),
        el('span', '', `${percentage(university.momentum_score)} momentum`),
      );
      main.append(signals);
      const score = el('div', 'university-score');
      const metric = metricForSort(university); score.append(el('strong', '', metric.value), el('span', '', metric.label));
      const compare = el('label', 'university-compare-control');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = comparedUniversities.has(university.openalex_id);
      checkbox.setAttribute('aria-label', `Compare ${university.name}`);
      checkbox.onchange = () => {
        const previousCount = comparedUniversities.size;
        if (checkbox.checked) {
          if (comparedUniversities.size >= 3) { checkbox.checked = false; return; }
          comparedUniversities.set(university.openalex_id, university);
        } else comparedUniversities.delete(university.openalex_id);
        renderUniversityComparison();
        if (checkbox.checked && previousCount >= 1) requestAnimationFrame(() => {
          const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          elements.universityCompare.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        });
      };
      compare.append(checkbox, el('span', '', 'Compare'));
      item.append(rank, main, score, compare); elements.universityList.append(item);
    });
    elements.universityResult.textContent = activeTopic
      ? `Showing ${numberFormatter.format(visible.length)} universities with source-matched ${activeTopicName} activity, ranked by that topic’s indexed work links.`
      : `Showing ${numberFormatter.format(visible.length)} matching universities from ${numberFormatter.format(universityRows.length)} loaded · ${numberFormatter.format(universityTotal || universityRows.length)} available.`;
    if (elements.universityHeading) elements.universityHeading.textContent = activeTopic ? `Universities researching ${activeTopicName}.` : 'Universities active in longevity research.';
    if (elements.universityIntro) elements.universityIntro.textContent = activeTopic
      ? `This is a topic-specific view. Every university below has source-matched ${activeTopicName} research in the index; the ranking uses that topic’s five-year activity, not the general university list.`
      : 'Explore universities through several lenses instead of relying on a single unexplained league table. The index retains all source-matched scholarly works and measures rolling activity, breadth across every longevity topic, recent momentum, and citation context across the complete linked corpus.';
    renderUniversityRegions(visible);
  }

  async function fetchUniversityIndex(append = false) {
    elements.universityResult.textContent = 'Updating the university view…';
    const url = new URL(endpoint);
    url.searchParams.set('view', 'universities'); url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(append ? universityNextOffset || 0 : 0));
    if (elements.universityTopic?.value) url.searchParams.set('topic', elements.universityTopic.value);
    if (elements.universityCountry?.value) url.searchParams.set('country', elements.universityCountry.value);
    if (elements.universityContinent?.value) url.searchParams.set('continent', elements.universityContinent.value);
    if (elements.universitySort?.value) url.searchParams.set('sort', elements.universitySort.value);
    const response = await fetch(url, { headers: window.ilFnHeaders() });
    if (!response.ok) throw new Error(`University index request failed with ${response.status}`);
    const data = await response.json();
    const incoming = Array.isArray(data.universities) ? data.universities : [];
    if (append) {
      const known = new Set(universityRows.map((university) => university.openalex_id));
      universityRows.push(...incoming.filter((university) => !known.has(university.openalex_id)));
    } else universityRows = incoming;
    universityNextOffset = data.next_offset;
    universityTotal = Number(data.total_matching || universityRows.length);
    elements.universityLoadMore.hidden = universityNextOffset == null;
    renderUniversityStats(data.coverage || {});
    if (!universityControlsReady) {
      (data.topics || []).forEach((topic) => elements.universityTopic.append(new Option(topic.name, topic.slug)));
      (data.countries || []).forEach((country) => elements.universityCountry.append(new Option(`${country.name} · ${country.universities}`, country.code)));
      [...new Set((data.countries || []).map((country) => country.continent).filter(Boolean))].sort().forEach((continent) => elements.universityContinent.append(new Option(continent, continent)));
      elements.universitySearch.addEventListener('input', renderUniversityRows);
      [elements.universityTopic, elements.universityCountry, elements.universityContinent, elements.universitySort].forEach((control) => control.addEventListener('change', () => {
        if (control === elements.universityTopic) {
          const nextUrl = new URL(location.href);
          if (elements.universityTopic.value) nextUrl.searchParams.set('topic', elements.universityTopic.value);
          else nextUrl.searchParams.delete('topic');
          history.replaceState({}, '', nextUrl);
        }
        fetchUniversityIndex(false).catch(showUniversityError);
      }));
      elements.clearUniversityCompare.onclick = () => { comparedUniversities.clear(); renderUniversityComparison(); renderUniversityRows(); };
      elements.universityLoadMore.onclick = async () => {
        if (universityNextOffset == null) return;
        elements.universityLoadMore.disabled = true;
        try { await fetchUniversityIndex(true); } catch (error) { showUniversityError(error); }
        finally { elements.universityLoadMore.disabled = false; }
      };
      universityControlsReady = true;
      const requestedTopic = new URLSearchParams(location.search).get('topic');
      if (requestedTopic && [...elements.universityTopic.options].some((option) => option.value === requestedTopic)) {
        elements.universityTopic.value = requestedTopic;
        return fetchUniversityIndex();
      }
    }
    renderUniversityRows();
    elements.freshness.dataset.health = data.sources?.[0]?.health || 'pending';
    elements.freshnessText.textContent = data.coverage?.last_updated_at ? `University index refreshed ${formatTimestamp(data.coverage.last_updated_at)} from OpenAlex affiliation data.` : 'The first automated OpenAlex university refresh is pending.';
    elements.universitiesSection.hidden = false;
  }

  function showUniversityError(error) {
    console.error('University index filter failed:', error);
    elements.universityResult.textContent = 'This university view could not refresh. The previous result remains visible; try again shortly.';
  }

  function resourceLabel(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderResourceStats(coverage) {
    elements.resourceStats.replaceChildren();
    [
      ['Official resources listed', coverage?.total || 0, 'all', 'View resources →'],
      ['Countries covered', coverage?.countries || 0, 'countries', 'View countries →'],
      ['Coverage regions', coverage?.regions || 0, 'regions', 'View regions →'],
      ['Links checked successfully', coverage?.healthy || 0, 'healthy', 'View checked links →'],
    ].forEach(([label, value, action, callToAction]) => {
      const card = el('button', 'atlas-stat atlas-stat--action'); card.type = 'button';
      card.setAttribute('aria-label', `${numberFormatter.format(Number(value))} ${label}. Show what this represents.`);
      card.append(el('strong', '', numberFormatter.format(Number(value))), el('span', '', label), el('small', '', callToAction));
      card.onclick = () => {
        elements.resourceSearch.value = '';
        elements.resourceRegion.value = '';
        elements.resourceType.value = '';
        elements.resourceIntegration.value = '';
        renderFilteredResources(action === 'healthy' ? 'healthy' : '');
        (action === 'countries' ? elements.resourceCountryCoverage : action === 'regions' ? elements.resourceRegionGrid : elements.resourceResult).scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      elements.resourceStats.append(card);
    });
  }

  function renderResourceMap(coverage, countryDirectory = []) {
    elements.resourceRegionGrid.replaceChildren();
    Object.entries(coverage?.by_region || {}).sort((left, right) => Number(right[1]) - Number(left[1])).forEach(([region, count]) => {
      const countryCount = Number(coverage?.by_region_jurisdictions?.[region] || 0);
      const card = el('button', 'resource-region-card'); card.type = 'button';
      card.setAttribute('aria-label', `Show ${count} official sources covering ${region}`);
      card.append(
        el('span', 'section-index', region),
        el('strong', '', numberFormatter.format(Number(count))),
        el('small', '', Number(count) === 1 ? 'official source' : 'official sources'),
        el('p', '', countryCount ? `${numberFormatter.format(countryCount)} countries and regions represented` : 'Global or cross-border coverage'),
        el('i', '', 'Filter directory →'),
      );
      card.onclick = () => {
        elements.resourceRegion.value = region;
        renderFilteredResources();
        elements.resourceControls.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      elements.resourceRegionGrid.append(card);
    });
    const countrySources = countryDirectory
      .map((country) => [country.jurisdiction_code, country.jurisdiction_name, country.region])
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    if (elements.resourceCountryCoverage) {
      elements.resourceCountryCoverage.replaceChildren();
      const heading = el('div', 'resource-country-heading');
      heading.append(el('strong', '', `Worldwide country coverage: ${countrySources.length} of 195 countries`), el('span', '', 'Choose a country to open its national authority or official WHO country profile.'));
      const controls = el('div', 'resource-country-controls');
      const selectLabel = el('label');
      selectLabel.append(el('span', '', 'Choose a country'));
      const select = el('select');
      select.setAttribute('aria-label', 'Choose a country source');
      const placeholder = el('option', '', 'Select one of 195 countries');
      placeholder.value = '';
      select.append(placeholder);
      countrySources.forEach(([code, name]) => {
        const option = el('option', '', `${name} (${code})`);
        option.value = code;
        select.append(option);
      });
      select.onchange = () => {
        const selected = countrySources.find(([code]) => code === select.value);
        if (!selected) return;
        elements.resourceSearch.value = selected[1];
        elements.resourceRegion.value = '';
        renderFilteredResources();
        elements.resourceControls.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      selectLabel.append(select);
      controls.append(selectLabel);
      const regionSummary = el('div', 'resource-country-regions');
      Object.entries(coverage?.by_region_jurisdictions || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([region, count]) => {
        const button = el('button', '', `${region}: ${count}`);
        button.type = 'button';
        button.onclick = () => {
          elements.resourceSearch.value = '';
          elements.resourceRegion.value = region;
          renderFilteredResources();
          elements.resourceControls.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        regionSummary.append(button);
      });
      controls.append(regionSummary);
      heading.append(controls);
      elements.resourceCountryCoverage.append(heading);
    }
  }

  let atlasResources = [];

  function renderFilteredResources(healthFilter = '') {
    const query = String(elements.resourceSearch.value || '').trim().toLowerCase();
    const region = elements.resourceRegion.value;
    const type = elements.resourceType.value;
    const integration = elements.resourceIntegration.value;
    const visible = atlasResources.filter((resource) => {
      const searchable = `${resource.name} ${resource.jurisdiction_name} ${resource.description} ${resource.resource_type}`.toLowerCase();
      return (!query || searchable.includes(query)) && (!region || resource.region === region) && (!type || resource.resource_type === type) && (!integration || resource.integration_status === integration) && (!healthFilter || resource.health === healthFilter);
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
        el('span', resource.integration_status === 'live' ? 'resource-badge resource-badge--live' : 'resource-badge', resource.integration_status === 'live' ? 'Live data feed' : 'Verified official link'),
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
    renderResourceMap(data.coverage || {}, Array.isArray(data.country_directory) ? data.country_directory : []);
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
      ['Research records shown', telemetry?.research?.published, 'Passed the automatic topic and source checks.', '/research', 'Browse records'],
      ['Research records withheld', telemetry?.research?.quarantined, 'Kept off the public site because the match was too weak or uncertain.', '/methodology', 'See the publication rules'],
      ['Average research match', Number(telemetry?.research?.average_confidence || 0) > 0 ? `${Number(telemetry.research.average_confidence)}%` : 'Pending', 'Average topic relevance of the records currently shown.', '/methodology', 'Understand this score'],
      ['Repeated records removed', telemetry?.research?.duplicates_suppressed, 'Near-identical records grouped behind one main entry.', '/methodology', 'See how duplicates work'],
      ['Trial records shown', telemetry?.trials?.published, 'Registry records that passed the automatic checks.', '/trials', 'Browse trials'],
      ['Trial records withheld', telemetry?.trials?.quarantined, 'Registry records held back because the longevity connection was unclear.', '/methodology', 'See the publication rules'],
      ['Average trial match', Number(telemetry?.trials?.average_confidence || 0) > 0 ? `${Number(telemetry.trials.average_confidence)}%` : 'Pending', 'Average topic relevance of the trials currently shown.', '/methodology', 'Understand this score'],
    ];
    groups.forEach(([label, value, description, href, action]) => {
      const card = link('quality-stat quality-stat--link', '', href);
      const displayValue = typeof value === 'number' ? numberFormatter.format(value) : value ?? 'Pending';
      card.append(el('span', '', label), el('strong', '', displayValue), el('small', '', description), el('i', '', `${action} →`));
      elements.qualityGrid.append(card);
    });
    elements.qualitySection.hidden = false;
  }

  async function request(viewName, limit, params = {}) {
    const url = new URL(endpoint);
    url.searchParams.set('quality_rules', '20260916b');
    url.searchParams.set('view', viewName);
    url.searchParams.set('limit', String(limit));
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    if (viewName === 'resources') url.searchParams.set('directory_contract', 'global-195-v2');
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
        const data = await request('research', 100, { q: new URLSearchParams(location.search).get('search')?.trim() || '' });
        researchNextOffset = data.next_offset;
        researchTotal = Number(data.total_matching || data.research?.length || 0);
        renderResearch(data.research || []);
        elements.researchLoadMore.hidden = researchNextOffset == null;
        elements.researchLoadMore.onclick = () => loadMoreResearch().catch((error) => console.error('Research page request failed:', error));
        renderSources(data.sources || [], false);
      } else if (view === 'trials') {
        const data = await request('trials', 100, { q: new URLSearchParams(location.search).get('search')?.trim() || '' });
        trialNextOffset = data.next_offset;
        trialTotal = Number(data.total_matching || data.trials?.length || 0);
        renderTrials(data.trials || []);
        elements.trialLoadMore.hidden = trialNextOffset == null;
        elements.trialLoadMore.onclick = () => loadMoreTrials().catch((error) => console.error('Trial page request failed:', error));
        renderSources(data.sources || [], false);
      } else if (view === 'topics') {
        const data = await request('topics', 100);
        renderTopics(data.topics || [], false);
        renderSources(data.sources || [], false);
      } else if (view === 'topic') {
        const [research, trials, topics, timeline] = await Promise.all([
          request('research', 12),
          request('trials', 12),
          request('topics', 100),
          request('timeline', 40),
        ]);
        renderResearch(research.research || []);
        renderTrials(trials.trials || []);
        renderSources(research.sources || trials.sources || [], false);
        const selected = (topics.topics || []).find((topic) => topic.slug === topicSlug);
        if (selected) {
          renderStats({ research: selected.research_count, trials: selected.trial_count });
        }
        renderTimeline(timeline);
      } else if (view === 'regulatory') {
        const data = await request('regulatory', 80);
        renderRegulatory(data.regulatory || [], data.regulatory_guides || [], data.regulatory_coverage || {});
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
      } else if (view === 'universities') {
        await fetchUniversityIndex();
      } else if (view === 'resources') {
        const data = await request('resources', 500);
        renderResources(data);
      } else if (view === 'quality') {
        const data = await request('quality', 100);
        renderQuality(data.telemetry || {});
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
