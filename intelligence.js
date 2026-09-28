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

  const WATCH_STORAGE_KEY = 'il_longevity_watch';
  const WATCH_LIMIT = 20;

  function readLongevityWatch() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => typeof item === 'string' ? { slug: item, name: item.replace(/-/g, ' ') } : item)
        .filter((item) => item && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.slug || '')))
        .slice(0, WATCH_LIMIT);
    } catch (_) { return []; }
  }

  function writeLongevityWatch(items) {
    try { localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(items.slice(0, WATCH_LIMIT))); } catch (_) { /* local storage is optional */ }
    window.dispatchEvent(new CustomEvent('il-watch-change', { detail: items }));
  }

  function syncWatchButtons(items = readLongevityWatch()) {
    const followed = new Set(items.map((item) => item.slug));
    document.querySelectorAll('[data-watch-topic]').forEach((button) => {
      const active = followed.has(button.dataset.watchTopic);
      button.setAttribute('aria-pressed', String(active));
      if (button.classList.contains('save-topic-button')) button.textContent = active ? 'Following in Longevity Watch' : 'Follow in Longevity Watch';
      else button.classList.toggle('is-followed', active);
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-watch-topic]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const slug = String(button.dataset.watchTopic || '');
    const name = String(button.dataset.watchName || slug.replace(/-/g, ' '));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
    const items = readLongevityWatch();
    const existing = items.findIndex((item) => item.slug === slug);
    if (existing >= 0) items.splice(existing, 1);
    else if (items.length < WATCH_LIMIT) items.push({ slug, name, followedAt: new Date().toISOString() });
    else {
      const status = document.getElementById('watchTopicResult');
      if (status) status.textContent = `Your watchlist is full. Remove one topic before adding another.`;
      return;
    }
    writeLongevityWatch(items);
    syncWatchButtons(items);
  });

  async function initLongevityWatch() {
    const root = document.querySelector('[data-longevity-watch]');
    syncWatchButtons();
    if (!root) return;
    const search = document.getElementById('watchTopicSearch');
    const domain = document.getElementById('watchTopicDomain');
    const result = document.getElementById('watchTopicResult');
    const topicGrid = document.getElementById('watchTopicGrid');
    const savedGrid = document.getElementById('watchSavedGrid');
    const counter = document.getElementById('watchCounter');
    const clear = document.getElementById('watchClear');
    const emailTopic = document.getElementById('watchEmailTopic');
    let topics = [];

    const node = (tag, className, text) => {
      const item = document.createElement(tag);
      if (className) item.className = className;
      if (text != null) item.textContent = String(text);
      return item;
    };

    const renderSaved = () => {
      const saved = readLongevityWatch();
      counter.textContent = `${saved.length} / ${WATCH_LIMIT} followed`;
      savedGrid.replaceChildren();
      emailTopic.replaceChildren(new Option(saved.length ? 'Choose a followed topic' : 'Follow a topic above first', ''));
      saved.forEach((savedTopic) => {
        const topic = topics.find((item) => item.slug === savedTopic.slug) || savedTopic;
        const card = node('article', 'watch-saved-card');
        const copy = node('div');
        copy.append(node('span', 'section-index', topic.domain_name || 'Longevity topic'), node('h3', '', topic.name));
        const actions = node('div', 'watch-saved-actions');
        const open = node('a', 'section-link', 'Open dossier'); open.href = `/topics/${encodeURIComponent(topic.slug)}`;
        const changes = node('a', 'section-link', 'Recent changes'); changes.href = `/changes?topic=${encodeURIComponent(topic.slug)}`;
        const funding = node('a', 'section-link', 'Funding'); funding.href = `/funding?topic=${encodeURIComponent(topic.slug)}`;
        const feed = node('a', 'section-link', 'RSS'); feed.href = `/feeds/topics/${encodeURIComponent(topic.slug)}.xml`;
        const remove = node('button', 'section-link watch-remove', 'Remove'); remove.type = 'button'; remove.dataset.watchTopic = topic.slug; remove.dataset.watchName = topic.name;
        actions.append(open, changes, funding, feed, remove); card.append(copy, actions); savedGrid.append(card);
        emailTopic.append(new Option(topic.name, topic.slug));
      });
      if (!saved.length) savedGrid.append(node('p', 'watch-empty', 'Your watchlist is empty. Follow topics above or use the Follow button on any evidence dossier.'));
      emailTopic.disabled = saved.length === 0;
      clear.hidden = saved.length === 0;
      syncWatchButtons(saved);
    };

    const renderDirectory = () => {
      const query = String(search.value || '').trim().toLowerCase();
      const selectedDomain = domain.value || '';
      const visible = topics.filter((topic) => {
        const text = `${topic.name} ${topic.description || ''} ${topic.domain_name || ''}`.toLowerCase();
        return (!query || text.includes(query)) && (!selectedDomain || topic.domain_slug === selectedDomain);
      });
      topicGrid.replaceChildren();
      visible.forEach((topic) => {
        const button = node('button', 'watch-topic-card'); button.type = 'button'; button.dataset.watchTopic = topic.slug; button.dataset.watchName = topic.name;
        button.append(node('span', 'watch-topic-domain', topic.domain_name || 'Longevity topic'), node('strong', '', topic.name), node('small', '', topic.description || 'Open the living evidence dossier.'));
        topicGrid.append(button);
      });
      if (!visible.length) topicGrid.append(node('p', 'watch-empty', 'No topic matches this search. Try a broader term or another domain.'));
      result.textContent = `Showing ${visible.length} of ${topics.length} topics`;
      syncWatchButtons();
    };

    try {
      const response = await fetch('/topics-directory.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Topic directory returned ${response.status}`);
      const directory = await response.json();
      topics = Array.isArray(directory.topics) ? directory.topics : [];
      const domains = [...new Map(topics.map((topic) => [topic.domain_slug, topic.domain_name])).entries()].filter(([slug]) => slug);
      domains.forEach(([slug, name]) => domain.append(new Option(name, slug)));
      search.addEventListener('input', renderDirectory);
      domain.addEventListener('change', renderDirectory);
      clear.addEventListener('click', () => writeLongevityWatch([]));
      window.addEventListener('il-watch-change', () => { renderSaved(); renderDirectory(); });
      renderSaved(); renderDirectory();
    } catch (error) {
      topicGrid.replaceChildren(node('p', 'watch-empty', 'The topic directory could not be loaded. Refresh the page to try again.'));
      result.textContent = '';
      console.error('Longevity Watch failed to load:', error);
    }
  }

  initLongevityWatch().catch((error) => console.error('Longevity Watch failed to start:', error));

  if (!body.dataset.view) return;

  const view = body.dataset.view || 'overview';
  const topicSlug = body.dataset.topic || '';
  const endpoint = '/api/intelligence';
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
    topicDomain: document.getElementById('topicDomain'),
    topicResult: document.getElementById('topicResult'),
    compareSection: document.getElementById('compareSection'),
    compareForm: document.getElementById('compareForm'),
    compareLeft: document.getElementById('compareLeft'),
    compareRight: document.getElementById('compareRight'),
    compareSwap: document.getElementById('compareSwap'),
    compareValidation: document.getElementById('compareValidation'),
    compareResults: document.getElementById('compareResults'),
    compareResultTitle: document.getElementById('compareResultTitle'),
    compareResultDate: document.getElementById('compareResultDate'),
    compareSummary: document.getElementById('compareSummary'),
    compareTopicHeadings: document.getElementById('compareTopicHeadings'),
    compareGroups: document.getElementById('compareGroups'),
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
    fundingSection: document.getElementById('fundingSection'),
    fundingStats: document.getElementById('fundingStats'),
    fundingLandscape: document.getElementById('fundingLandscape'),
    fundingYears: document.getElementById('fundingYears'),
    fundingFunders: document.getElementById('fundingFunders'),
    fundingTopics: document.getElementById('fundingTopics'),
    fundingControls: document.getElementById('fundingControls'),
    fundingSearch: document.getElementById('fundingSearch'),
    fundingTopic: document.getElementById('fundingTopic'),
    fundingCountry: document.getElementById('fundingCountry'),
    fundingSort: document.getElementById('fundingSort'),
    fundingClear: document.getElementById('fundingClear'),
    fundingResult: document.getElementById('fundingResult'),
    fundingList: document.getElementById('fundingList'),
    fundingLoadMore: document.getElementById('fundingLoadMore'),
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
    resultsGapSection: document.getElementById('resultsGapSection'),
    resultsGapStats: document.getElementById('resultsGapStats'),
    resultsGapYearPanel: document.getElementById('resultsGapYearPanel'),
    resultsGapYears: document.getElementById('resultsGapYears'),
    resultsGapControls: document.getElementById('resultsGapControls'),
    resultsGapSearch: document.getElementById('resultsGapSearch'),
    resultsGapTopic: document.getElementById('resultsGapTopic'),
    resultsGapStatus: document.getElementById('resultsGapStatus'),
    resultsGapSort: document.getElementById('resultsGapSort'),
    resultsGapClear: document.getElementById('resultsGapClear'),
    resultsGapResult: document.getElementById('resultsGapResult'),
    resultsGapList: document.getElementById('resultsGapList'),
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
    graphControls: document.getElementById('graphControls'),
    graphSearch: document.getElementById('graphSearch'),
    graphFocus: document.getElementById('graphFocus'),
    graphSort: document.getElementById('graphSort'),
    graphResult: document.getElementById('graphResult'),
    graphTopicList: document.getElementById('graphTopicList'),
    timelineSection: document.getElementById('timelineSection'),
    timelineList: document.getElementById('evidenceTimeline'),
    topicHeroTimelineList: document.getElementById('topicHeroTimelineList'),
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
    topicDossierSnapshot: document.getElementById('topicDossierSnapshot'),
    topicDossierAnswers: document.getElementById('topicDossierAnswers'),
    topicInterpretationVersion: document.getElementById('topicInterpretationVersion'),
    topicInterpretationDate: document.getElementById('topicInterpretationDate'),
    topicMaterialChange: document.getElementById('topicMaterialChange'),
    topicClaimLedger: document.getElementById('topicClaimLedger'),
    topicInterpretationMethod: document.getElementById('topicInterpretationMethod'),
    topicUniversitySummary: document.getElementById('topicUniversitySummary'),
    topicTrialSummary: document.getElementById('topicTrialSummary'),
    topicResearchSummary: document.getElementById('topicResearchSummary'),
    topicFundingSummary: document.getElementById('topicFundingSummary'),
    topicTrendSummary: document.getElementById('topicTrendSummary'),
    topicUniversityGrid: document.getElementById('topicUniversityGrid'),
    topicTrendCallout: document.getElementById('topicTrendCallout'),
    topicTrendChart: document.getElementById('topicTrendChart'),
    topicSourceBasisList: document.getElementById('topicSourceBasisList'),
  };

  document.querySelector(`[data-nav="${view === 'overview' || view === 'funding' ? 'research' : ['topic', 'compare'].includes(view) ? 'topics' : view === 'trial-results-gap' ? 'trials' : view}"]`)?.setAttribute('aria-current', 'page');
  if (view === 'you') return;

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
    const relations = Array.isArray(record?.[relationName]) ? record[relationName].filter((item) => item?.is_published !== false) : [];
    if (record.source_fallback) {
      const summary = el('summary', '', 'Why this source result appears · match score unavailable');
      details.append(
        summary,
        el('p', '', 'The verified immortal.life index is temporarily reconnecting, so this item came from a direct source search. It has not received the normal topic-match score and must not be read as a validated index match.'),
        el('p', 'quality-signal-note', 'Open the source and verify relevance directly. This temporary result is not included in Living Evidence Dossier counts.'),
      );
      container.append(details);
      return;
    }
    const relationConfidence = relations.reduce((highest, relation) => Math.max(highest, Number(relation?.relevance_score || 0)), 0);
    const confidence = numberFormatter.format(Math.max(Number(record.relevance_confidence || 0), relationConfidence));
    const summary = el('summary', '', `Why this record appears here · ${confidence}% topic match`);
    details.append(summary, el('p', '', 'The title, summary, or source keywords matched one or more topics followed by immortal.life. A higher percentage means a stronger topic match; it does not rate safety, effectiveness, or study quality.'));
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

  function appendEvidenceSnapshot(container, snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.evidence_stage) return;
    const section = el('section', 'evidence-snapshot evidence-snapshot--compact');
    section.append(el('span', 'section-index', 'Evidence snapshot'), el('h4', '', 'What the source actually supports'));
    const grid = el('dl', 'evidence-snapshot-grid');
    const display = (value, fallback = 'Not reported') => Array.isArray(value) ? (value.filter(Boolean).join('; ') || fallback) : value == null || value === '' ? fallback : String(value);
    [
      ['Stage', snapshot.evidence_stage],
      ['Design', snapshot.study_design],
      ['Population', snapshot.population || snapshot.subject_scope],
      ['Participants', snapshot.participants],
      ['Intervention', snapshot.intervention],
      ['Result', snapshot.reported_outcome || 'No reusable finding-level result available'],
    ].forEach(([label, value]) => {
      const shown = label === 'Stage' ? readableStatus(value) : display(value);
      const row = el('div'); row.append(el('dt', '', label), el('dd', '', shown)); grid.append(row);
    });
    section.append(grid, el('p', 'evidence-snapshot-limit', snapshot.main_limitation || 'Read the linked source for methods, findings, and limitations.'));
    container.append(section);
  }

  function readableStatus(value) {
    return String(value || 'Status not supplied')
      .replace(/_/g, ' ')
      .replace(/\bphase\s*([1-4])\b/gi, 'Phase $1')
      .toLowerCase()
      .replace(/^\w/, (letter) => letter.toUpperCase());
  }

  function renderTopics(topics, compact) {
    elements.topicGrid.classList.toggle('topic-grid--grouped', !compact);
    const queryParameters = new URLSearchParams(location.search);
    const initialSearch = queryParameters.get('search')?.trim() || '';
    const initialDomain = queryParameters.get('domain')?.trim() || '';
    if (!compact && elements.topicSearch) elements.topicSearch.value = initialSearch;
    if (!compact && elements.topicDomain && !elements.topicDomain.dataset.ready) {
      const domains = [...new Map(topics.filter((topic) => topic.domain_slug).map((topic) => [topic.domain_slug, topic.domain_name])).entries()];
      domains.forEach(([slug, name]) => elements.topicDomain.append(new Option(name, slug)));
      if (domains.some(([slug]) => slug === initialDomain)) elements.topicDomain.value = initialDomain;
    }
    const topicCard = (topic, index) => {
      const card = link('topic-card', '', `/topics/${encodeURIComponent(topic.slug)}`);
      const visualHash = [...String(topic.slug || topic.name)].reduce((value, character) => ((value * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
      card.style.setProperty('--card-hue', String(326 + (visualHash % 52)));
      card.style.setProperty('--card-hue-two', String(18 + ((visualHash >>> 5) % 34)));
      card.style.setProperty('--card-x', `${18 + ((visualHash >>> 10) % 68)}%`);
      card.style.setProperty('--card-y', `${12 + ((visualHash >>> 17) % 70)}%`);
      card.style.setProperty('--card-tilt', `${-24 + ((visualHash >>> 23) % 48)}deg`);
      card.append(el('span', 'topic-card-number', String(index + 1).padStart(2, '0')));
      card.append(el('h3', '', topic.name));
      card.append(el('p', '', topic.description));
      const counts = el('span', 'topic-counts');
      const researchCount = Number(topic.research_count || 0);
      const trialCount = Number(topic.trial_count || 0);
      const countParts = [];
      if (researchCount > 0) countParts.push(`${numberFormatter.format(researchCount)} ${researchCount === 1 ? 'paper' : 'papers'}`);
      if (trialCount > 0) countParts.push(`${numberFormatter.format(trialCount)} ${trialCount === 1 ? 'trial' : 'trials'}`);
      counts.textContent = countParts.join(' · ') || (topic.directory_only ? 'Open evidence guide' : 'Index building');
      card.append(counts);
      return card;
    };
    const draw = () => {
      elements.topicGrid.replaceChildren();
      const search = String(compact ? initialSearch : elements.topicSearch?.value || initialSearch).trim().toLowerCase();
      const domain = compact ? '' : String(elements.topicDomain?.value || initialDomain);
      const filtered = topics.filter((topic) => {
        const searchable = `${topic.name} ${topic.description} ${topic.domain_name || ''}`.toLowerCase();
        return (!search || searchable.includes(search)) && (!domain || topic.domain_slug === domain);
      });
      const visible = compact ? filtered.slice(0, 6) : filtered;
      if (compact) visible.forEach((topic, index) => elements.topicGrid.append(topicCard(topic, index)));
      else {
        const groups = new Map();
        visible.forEach((topic) => {
          const slug = topic.domain_slug || 'other';
          if (!groups.has(slug)) groups.set(slug, { name: topic.domain_name || 'Other topics', description: topic.domain_description || '', topics: [] });
          groups.get(slug).topics.push(topic);
        });
        let runningIndex = 0;
        groups.forEach((group, slug) => {
          const section = el('section', 'topic-domain'); section.id = `domain-${slug}`;
          const heading = el('div', 'topic-domain-heading');
          const copy = el('div'); copy.append(el('span', 'section-index', `${group.topics.length} topics`), el('h3', '', group.name), el('p', '', group.description));
          heading.append(copy);
          const cards = el('div', 'topic-domain-grid');
          group.topics.forEach((topic) => { cards.append(topicCard(topic, runningIndex)); runningIndex += 1; });
          section.append(heading, cards); elements.topicGrid.append(section);
        });
      }
      if (!visible.length) elements.topicGrid.append(el('p', 'empty-list', `No tracked topic matches “${search}”. Try a broader term or browse all topics.`));
      if (!compact && elements.topicResult) elements.topicResult.textContent = `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(topics.length)} topics`;
    };
    if (!compact && elements.topicSearch && !elements.topicSearch.dataset.ready) {
      elements.topicSearch.addEventListener('input', draw);
      elements.topicSearch.dataset.ready = 'true';
    }
    if (!compact && elements.topicDomain && !elements.topicDomain.dataset.ready) {
      elements.topicDomain.addEventListener('change', draw);
      elements.topicDomain.dataset.ready = 'true';
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

  function compareHighestPhase(phaseCounts) {
    const entries = Object.entries(phaseCounts || {}).filter(([, count]) => Number(count) > 0);
    const normalized = entries.map(([phase]) => String(phase).toUpperCase().replace(/[^A-Z0-9]+/g, ''));
    if (normalized.some((phase) => phase.includes('PHASE4'))) return 'Phase 4';
    if (normalized.some((phase) => phase.includes('PHASE3'))) return 'Phase 3';
    if (normalized.some((phase) => phase.includes('PHASE2'))) return 'Phase 2';
    if (normalized.some((phase) => phase.includes('PHASE1'))) return 'Phase 1';
    if (normalized.some((phase) => phase.includes('EARLY'))) return 'Early phase';
    return 'Not reported';
  }

  function compareGapSummary(dossier) {
    const evidence = dossier?.evidence || {};
    const gaps = [];
    if (!Number(evidence.human_evidence_total || 0)) gaps.push('human evidence');
    if (!Number(evidence.randomized_human_total || 0)) gaps.push('randomized human studies');
    if (!Number(evidence.human_synthesis_total || 0)) gaps.push('evidence syntheses');
    if (!Number(evidence.trial_total || 0)) gaps.push('registered trials');
    else if (!Number(evidence.trials_with_results || 0)) gaps.push('posted trial results');
    if (!Number(evidence.regulatory_total || 0)) gaps.push('matched regulatory context');
    return gaps.length ? gaps.join(', ') : 'No empty primary layer; interpretation still requires source review';
  }

  function compareTrendLabel(direction) {
    return ({ growing: 'Growing recently', steady: 'Broadly steady', slowing: 'Slower recently', limited: 'Too little dated evidence' })[direction] || 'Too little dated evidence';
  }

  function renderEvidenceComparison(leftTopic, rightTopic, leftDossier, rightDossier) {
    const leftEvidence = leftDossier.evidence || {};
    const rightEvidence = rightDossier.evidence || {};
    const leftOverview = leftDossier.overview || {};
    const rightOverview = rightDossier.overview || {};
    const leftHuman = Number(leftEvidence.human_evidence_total || 0);
    const rightHuman = Number(rightEvidence.human_evidence_total || 0);
    const leftResults = Number(leftEvidence.trials_with_results || 0);
    const rightResults = Number(rightEvidence.trials_with_results || 0);
    const leftTrials = Number(leftEvidence.trial_total || 0);
    const rightTrials = Number(rightEvidence.trial_total || 0);
    const largerHuman = leftHuman === rightHuman ? null : leftHuman > rightHuman ? leftTopic : rightTopic;
    const resultCoverage = (results, trials) => trials ? `${numberFormatter.format(results)} of ${numberFormatter.format(trials)} · ${Math.round((results / trials) * 100)}%` : 'No matched trials';
    const topicPath = (topic) => `/topics/${encodeURIComponent(topic.slug)}`;
    const researchPath = (topic, evidence = '') => `/research?topic=${encodeURIComponent(topic.slug)}${evidence ? `&evidence=${encodeURIComponent(evidence)}` : ''}`;
    const trialPath = (topic, status = '') => `/trials?topic=${encodeURIComponent(topic.slug)}${status ? `&status=${encodeURIComponent(status)}` : ''}`;
    const metricLink = (topic, value, href, context) => {
      const item = link('compare-value', '', href);
      item.append(el('strong', '', value), el('small', '', context));
      return item;
    };
    const row = (label, note, leftValue, rightValue, leftHref, rightHref, leftContext = 'Open underlying records', rightContext = leftContext) => {
      const item = el('div', 'compare-row');
      const heading = el('div', 'compare-row-label');
      heading.append(el('strong', '', label), el('small', '', note));
      item.append(heading, metricLink(leftTopic, leftValue, leftHref, leftContext), metricLink(rightTopic, rightValue, rightHref, rightContext));
      return item;
    };
    const group = (title, description, rows) => {
      const section = el('section', 'compare-group');
      const heading = el('div', 'compare-group-heading');
      heading.append(el('h3', '', title), el('p', '', description));
      section.append(heading, ...rows);
      elements.compareGroups.append(section);
    };

    elements.compareResultTitle.textContent = `${leftTopic.name} and ${rightTopic.name}`;
    const generatedAt = [leftEvidence.generated_at, rightEvidence.generated_at, leftOverview.generated_at, rightOverview.generated_at].filter(Boolean).sort().at(-1);
    elements.compareResultDate.textContent = generatedAt ? `Compared from index data available ${formatTimestamp(generatedAt)}` : 'Compared from the current public index';
    elements.compareSummary.replaceChildren();
    const summary = el('p');
    summary.textContent = largerHuman
      ? `${largerHuman.name} currently has the larger indexed human-evidence footprint. Trial maturity, posted-results coverage, activity trend, and visible evidence gaps should still be read separately; none of these signals determines effectiveness or safety.`
      : 'The two topics currently have the same number of indexed human-evidence records. Trial maturity, posted-results coverage, activity trend, and visible evidence gaps should still be read separately; none of these signals determines effectiveness or safety.';
    elements.compareSummary.append(summary);

    elements.compareTopicHeadings.replaceChildren(el('span', 'compare-axis-label', 'Measure'));
    [leftTopic, rightTopic].forEach((topic) => {
      const card = link('compare-topic-heading', '', topicPath(topic));
      card.append(el('span', '', topic.domain_name || 'Longevity topic'), el('h3', '', topic.name), el('p', '', topic.description), el('small', '', 'Open Living Evidence Dossier →'));
      elements.compareTopicHeadings.append(card);
    });

    elements.compareGroups.replaceChildren();
    group('Evidence maturity', 'Study type and source coverage—not a score of scientific quality or agreement.', [
      row('Research records', 'Eligible indexed research linked to this topic.', numberFormatter.format(Number(leftEvidence.research_total || 0)), numberFormatter.format(Number(rightEvidence.research_total || 0)), researchPath(leftTopic), researchPath(rightTopic)),
      row('Human evidence', 'Human studies, randomized studies, and evidence syntheses classified by the index.', numberFormatter.format(leftHuman), numberFormatter.format(rightHuman), researchPath(leftTopic, 'human'), researchPath(rightTopic, 'human')),
      row('Randomized human studies', 'Study design classification; not a finding or risk-of-bias judgment.', numberFormatter.format(Number(leftEvidence.randomized_human_total || 0)), numberFormatter.format(Number(rightEvidence.randomized_human_total || 0)), researchPath(leftTopic, 'randomized-human'), researchPath(rightTopic, 'randomized-human')),
      row('Evidence syntheses', 'Human evidence reviews or syntheses currently classified in the index.', numberFormatter.format(Number(leftEvidence.human_synthesis_total || 0)), numberFormatter.format(Number(rightEvidence.human_synthesis_total || 0)), researchPath(leftTopic, 'human-synthesis'), researchPath(rightTopic, 'human-synthesis')),
      row('Preclinical research', 'Laboratory or animal evidence cannot establish benefit or safety in people.', numberFormatter.format(Number(leftEvidence.preclinical_total || 0)), numberFormatter.format(Number(rightEvidence.preclinical_total || 0)), researchPath(leftTopic, 'preclinical'), researchPath(rightTopic, 'preclinical')),
    ]);
    group('Clinical trial landscape', 'Registry metadata describes study plans and status. It is not a result.', [
      row('Registered trials', 'All matched registrations currently eligible for the public index.', numberFormatter.format(leftTrials), numberFormatter.format(rightTrials), trialPath(leftTopic), trialPath(rightTopic)),
      row('Recruiting or active', 'Current status can change; verify eligibility and locations in the registry.', numberFormatter.format(Number(leftEvidence.recruiting_trials || 0)), numberFormatter.format(Number(rightEvidence.recruiting_trials || 0)), trialPath(leftTopic, 'Recruiting'), trialPath(rightTopic, 'Recruiting')),
      row('Posted-results coverage', 'Registrations with reusable structured results compared with all matched trials.', resultCoverage(leftResults, leftTrials), resultCoverage(rightResults, rightTrials), trialPath(leftTopic), trialPath(rightTopic), 'Inspect trial results and registrations', 'Inspect trial results and registrations'),
      row('Participants listed', 'Registry enrollment may be planned or actual and can change over time.', numberFormatter.format(Number(leftEvidence.registered_enrollment || 0)), numberFormatter.format(Number(rightEvidence.registered_enrollment || 0)), trialPath(leftTopic), trialPath(rightTopic), 'Verify participant fields at source', 'Verify participant fields at source'),
      row('Highest registered phase', 'Highest phase label found among matched registrations.', compareHighestPhase(leftEvidence.trials_by_phase), compareHighestPhase(rightEvidence.trials_by_phase), trialPath(leftTopic), trialPath(rightTopic)),
    ]);
    group('Momentum and research activity', 'Publication volume measures indexed activity, not whether results are positive or clinically useful.', [
      row('Recent direction', 'Latest complete three-year period compared with the preceding three years.', compareTrendLabel(leftOverview.trend_direction), compareTrendLabel(rightOverview.trend_direction), `${topicPath(leftTopic)}#topicTrend`, `${topicPath(rightTopic)}#topicTrend`, 'Open trend and yearly counts', 'Open trend and yearly counts'),
      row('Recent indexed records', 'Records in the latest complete three-year comparison period.', numberFormatter.format(Number(leftOverview.trend_recent_total || 0)), numberFormatter.format(Number(rightOverview.trend_recent_total || 0)), researchPath(leftTopic), researchPath(rightTopic)),
      row('Leading institutions shown', 'The dossiers show a small research-activity sample; open the full topic-specific university view.', numberFormatter.format((leftOverview.universities || []).length), numberFormatter.format((rightOverview.universities || []).length), `/universities?topic=${encodeURIComponent(leftTopic.slug)}`, `/universities?topic=${encodeURIComponent(rightTopic.slug)}`, 'Open topic university activity', 'Open topic university activity'),
    ]);
    group('Regulation, integrity, and uncertainty', 'Absence of a matched notice is not evidence of approval, safety, or scientific agreement.', [
      row('Official regulatory notices', 'Product-, indication-, date-, and jurisdiction-specific notices matched to the topic.', numberFormatter.format(Number(leftEvidence.regulatory_total || 0)), numberFormatter.format(Number(rightEvidence.regulatory_total || 0)), `/regulatory?topic=${encodeURIComponent(leftTopic.slug)}`, `/regulatory?topic=${encodeURIComponent(rightTopic.slug)}`),
      row('Corrections or retractions', 'Matched integrity signals; open each record to understand its scope.', numberFormatter.format(Number(leftEvidence.integrity_total || 0)), numberFormatter.format(Number(rightEvidence.integrity_total || 0)), `/integrity?topic=${encodeURIComponent(leftTopic.slug)}`, `/integrity?topic=${encodeURIComponent(rightTopic.slug)}`),
      row('Connected source types', 'Distinct connected sources contributing to the present evidence snapshot.', numberFormatter.format(Number(leftEvidence.source_count || 0)), numberFormatter.format(Number(rightEvidence.source_count || 0)), `${topicPath(leftTopic)}#topicSourceBasis`, `${topicPath(rightTopic)}#topicSourceBasis`, 'Open source-linked examples', 'Open source-linked examples'),
      row('Visible evidence gaps', 'Empty layers in the current indexed and classified collection.', compareGapSummary(leftDossier), compareGapSummary(rightDossier), `${topicPath(leftTopic)}#topicEvidenceContext`, `${topicPath(rightTopic)}#topicEvidenceContext`, 'Read uncertainty and limitations', 'Read uncertainty and limitations'),
      row('Last meaningful update', 'Most recent source-level event connected to the dossier.', leftEvidence.last_meaningful_update ? formatTimestamp(leftEvidence.last_meaningful_update) : 'None recorded', rightEvidence.last_meaningful_update ? formatTimestamp(rightEvidence.last_meaningful_update) : 'None recorded', `${topicPath(leftTopic)}#timelineSection`, `${topicPath(rightTopic)}#timelineSection`, 'Open evidence timeline', 'Open evidence timeline'),
    ]);
    elements.compareResults.hidden = false;
    elements.compareResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function comparisonSelectionFromLocation() {
    const params = new URLSearchParams(location.search);
    const directMatch = location.pathname.match(/^\/compare\/([^/]+)-vs-([^/]+)\/?$/);
    const pair = directMatch ? [directMatch[1], directMatch[2]] : String(params.get('pair') || '').split('-vs-');
    return {
      left: decodeURIComponent(params.get('left') || pair[0] || ''),
      right: decodeURIComponent(params.get('right') || pair[1] || ''),
    };
  }

  async function initEvidenceCompare() {
    elements.compareSection.hidden = false;
    const topics = await catalogueTopics();
    const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]));
    topics.forEach((topic) => {
      const label = `${topic.name} — ${topic.domain_name || 'Longevity topic'}`;
      elements.compareLeft.append(new Option(label, topic.slug));
      elements.compareRight.append(new Option(label, topic.slug));
    });
    const initial = comparisonSelectionFromLocation();
    if (topicBySlug.has(initial.left)) elements.compareLeft.value = initial.left;
    if (topicBySlug.has(initial.right)) elements.compareRight.value = initial.right;
    let startedTracked = false;
    const trackStart = () => {
      if (!startedTracked && (elements.compareLeft.value || elements.compareRight.value)) {
        startedTracked = true;
        window.ilTrackUtility?.('comparison_started');
      }
    };
    const run = async () => {
      const leftSlug = elements.compareLeft.value;
      const rightSlug = elements.compareRight.value;
      trackStart();
      if (!leftSlug || !rightSlug) {
        elements.compareResults.hidden = true;
        elements.compareValidation.textContent = 'Choose both topics to create a comparison.';
        return;
      }
      if (leftSlug === rightSlug) {
        elements.compareResults.hidden = true;
        elements.compareValidation.textContent = 'Choose two different topics so the comparison is meaningful.';
        return;
      }
      elements.compareValidation.textContent = 'Loading two verified Living Evidence Dossiers…';
      elements.compareResults.hidden = true;
      try {
        const [leftDossier, rightDossier] = await Promise.all([
          request('topic-dossier', 12, { topic: leftSlug }),
          request('topic-dossier', 12, { topic: rightSlug }),
        ]);
        if (leftDossier.fallback || rightDossier.fallback) throw new Error('Verified dossier data is temporarily reconnecting.');
        renderEvidenceComparison(topicBySlug.get(leftSlug), topicBySlug.get(rightSlug), leftDossier, rightDossier);
        history.replaceState({}, '', `/compare/${encodeURIComponent(leftSlug)}-vs-${encodeURIComponent(rightSlug)}`);
        document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
        elements.compareValidation.textContent = 'Comparison ready. Every value below opens its supporting records or dossier context.';
        elements.freshness.dataset.health = 'healthy';
        elements.freshnessText.textContent = 'Current source-linked dossier data loaded.';
        window.ilTrackUtility?.('comparison_completed');
      } catch (error) {
        console.error('Evidence comparison failed:', error);
        elements.compareValidation.textContent = 'The verified comparison data is temporarily unavailable. No zero counts or unverified fallback records have been substituted.';
      }
    };
    elements.compareForm.addEventListener('submit', (event) => { event.preventDefault(); run(); });
    elements.compareLeft.addEventListener('change', trackStart);
    elements.compareRight.addEventListener('change', trackStart);
    elements.compareSwap.addEventListener('click', () => {
      const previousLeft = elements.compareLeft.value;
      elements.compareLeft.value = elements.compareRight.value;
      elements.compareRight.value = previousLeft;
      if (elements.compareLeft.value && elements.compareRight.value) run();
    });
    if (elements.compareLeft.value || elements.compareRight.value) trackStart();
    if (elements.compareLeft.value && elements.compareRight.value) await run();
    else if (elements.compareLeft.value) {
      elements.compareValidation.textContent = `${topicBySlug.get(elements.compareLeft.value).name} is selected. Choose a second topic to compare.`;
      elements.compareRight.focus();
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
      heading.append(link('record-title-link', record.title, record.source_fallback ? record.source_url : `/research/${encodeURIComponent(record.id)}`));
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
      appendEvidenceSnapshot(main, record.evidence_snapshot);
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
    const value = (Array.isArray(phases) ? phases.join(' ') : String(phases || '')).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    const current = value.includes('PHASE4') ? 3 : value.includes('PHASE3') ? 2 : value.includes('PHASE2') ? 1 : value.includes('PHASE1') ? 0 : -1;
    ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'].forEach((label, index) => ladder.append(el('span', index === current ? 'is-current' : current >= 0 && index < current ? 'is-passed' : '', label)));
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
      heading.append(link('record-title-link', record.title, record.source_fallback ? record.source_url : `/trials/${encodeURIComponent(record.id)}`));
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
      appendEvidenceSnapshot(main, record.evidence_snapshot);
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
  let fundingRows = [];
  let fundingNextOffset = null;
  let fundingTotal = 0;
  let fundingRequestVersion = 0;
  let fundingSearchTimer = 0;
  const FUNDING_PAGE_SIZE = 30;
  let catalogueTopicEntriesPromise;
  let catalogueTopicsPromise;

  function catalogueTopics() {
    if (!catalogueTopicsPromise) {
      catalogueTopicsPromise = fetch('/topics-directory.json', { headers: { Accept: 'application/json' } })
        .then((response) => {
          if (!response.ok) throw new Error(`Topic directory failed with ${response.status}`);
          return response.json();
        })
        .then((directory) => (directory.topics || []).slice().sort((left, right) => left.name.localeCompare(right.name)));
    }
    return catalogueTopicsPromise;
  }

  function catalogueTopicEntries() {
    if (!catalogueTopicEntriesPromise) {
      catalogueTopicEntriesPromise = catalogueTopics()
        .then((topics) => topics.map((topic) => [topic.slug, topic.name]))
        .catch(() => []);
    }
    return catalogueTopicEntriesPromise;
  }

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
      (!evidence || (evidence === 'human' ? ['human-synthesis', 'randomized-human', 'human-study'].includes(record.evidence_level) : record.evidence_level === evidence)) &&
      (!access || (access === 'open' ? record.is_open_access : !record.is_open_access))
    );
    drawResearch(filtered, 'No research record matches these filters. Try a broader search or clear one of the filters.');
    if (elements.researchResult) elements.researchResult.textContent = `Showing ${numberFormatter.format(filtered.length)} matching records from ${numberFormatter.format(searchableResearch.length)} loaded · ${numberFormatter.format(researchTotal || searchableResearch.length)} available.`;
  }

  function setupResearchSearch(topicEntries = []) {
    if (!elements.researchControls || elements.researchControls.dataset.ready) return;
    replaceFilterOptions(elements.researchTopic, 'All topics', topicEntries.length ? topicEntries : topicOptions(searchableResearch, 'research_item_topics'));
    const evidence = [...new Set(searchableResearch.map((record) => record.evidence_level).filter(Boolean))]
      .map((value) => [value, evidenceLabel(value)])
      .sort((left, right) => left[1].localeCompare(right[1]));
    if (evidence.some(([value]) => ['human-synthesis', 'randomized-human', 'human-study'].includes(value))) evidence.unshift(['human', 'All human evidence']);
    replaceFilterOptions(elements.researchEvidence, 'All evidence stages', evidence);
    elements.researchSearch.value = new URLSearchParams(location.search).get('search')?.trim() || '';
    elements.researchTopic.value = new URLSearchParams(location.search).get('topic')?.trim() || '';
    elements.researchEvidence.value = new URLSearchParams(location.search).get('evidence')?.trim() || '';
    elements.researchAccess.value = new URLSearchParams(location.search).get('access')?.trim() || '';
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
      filterResearchRecords();
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

  function renderResearch(records, topicEntries = []) {
    if (view !== 'research') return drawResearch(records);
    searchableResearch = records;
    setupResearchSearch(topicEntries);
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

  function setupTrialSearch(topicEntries = []) {
    if (!elements.trialControls || elements.trialControls.dataset.ready) return;
    replaceFilterOptions(elements.trialTopic, 'All topics', topicEntries.length ? topicEntries : topicOptions(searchableTrials, 'clinical_trial_topics'));
    replaceFilterOptions(elements.trialStatus, 'All statuses', [...new Set(searchableTrials.map((record) => record.overall_status).filter(Boolean))].sort().map((value) => [value, readableStatus(value)]));
    replaceFilterOptions(elements.trialPhase, 'All phases', [...new Set(searchableTrials.flatMap((record) => record.phases || []).filter(Boolean))].sort().map((value) => [value, readableStatus(value)]));
    replaceFilterOptions(elements.trialCountry, 'All countries', [...new Set(searchableTrials.flatMap((record) => record.countries || []).filter(Boolean))].sort((left, right) => left.localeCompare(right)).map((value) => [value, value]));
    elements.trialSearch.value = new URLSearchParams(location.search).get('search')?.trim() || '';
    elements.trialTopic.value = new URLSearchParams(location.search).get('topic')?.trim() || '';
    elements.trialStatus.value = new URLSearchParams(location.search).get('status')?.trim() || '';
    elements.trialPhase.value = new URLSearchParams(location.search).get('phase')?.trim() || '';
    elements.trialCountry.value = new URLSearchParams(location.search).get('country')?.trim() || '';
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
      filterTrialRecords();
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

  function renderTrials(records, topicEntries = []) {
    if (view !== 'trials') return drawTrials(records);
    searchableTrials = records;
    setupTrialSearch(topicEntries);
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

  function fundingQueryParams(offset = 0) {
    return {
      offset,
      q: elements.fundingSearch?.value.trim() || '',
      topic: elements.fundingTopic?.value || '',
      country: elements.fundingCountry?.value || '',
      institution: new URLSearchParams(location.search).get('institution')?.trim() || '',
      sort: elements.fundingSort?.value || 'recent',
    };
  }

  function awardInstitutions(award) {
    return (award.funding_award_institutions || []).map((relation) => relation.university_research_institutions).filter(Boolean);
  }

  function funderProfilePath(name, id) {
    const cleanId = String(id || '').match(/F\d+/i)?.[0]?.toLowerCase();
    if (!cleanId) return '';
    const cleanName = String(name || 'funder').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || 'funder';
    return `/funders/${encodeURIComponent(`${cleanName}-${cleanId}`)}`;
  }

  function drawFundingAwards() {
    elements.fundingList.replaceChildren();
    if (!fundingRows.length) {
      elements.fundingList.append(el('p', 'empty-list', fundingTotal
        ? 'No funding record matches these filters. Try a broader search or clear the filters.'
        : 'Funding relationships are being assembled from retained publications. New source-linked awards will appear here automatically.'));
    }
    fundingRows.forEach((award) => {
      const card = el('article', 'funding-card');
      const meta = el('div', 'funding-card-meta');
      const funderPath = funderProfilePath(award.funder_name, award.funder_id);
      meta.append(funderPath ? link('funding-funder', award.funder_name || 'Funder unavailable', funderPath) : el('span', 'funding-funder', award.funder_name || 'Funder unavailable'));
      meta.append(el('strong', '', award.award_identifier || award.openalex_award_id || 'Award identifier unavailable'));
      if (award.latest_publication_date) meta.append(el('small', '', `Latest linked research ${formatDate(award.latest_publication_date)}`));

      const main = el('div', 'funding-card-main');
      const heading = el('h3', '', award.title || (award.award_identifier ? `Award ${award.award_identifier}` : 'Source-linked funding acknowledgement'));
      const institutions = awardInstitutions(award);
      const institutionLine = institutions.slice(0, 3).map((item) => item.name).join(' · ');
      main.append(heading, el('p', 'funding-card-context', institutionLine || 'No eligible university affiliation is linked in the retained metadata.'));
      const tags = el('div', 'record-tags');
      topicLinks(award, 'funding_award_topics').slice(0, 6).forEach((item) => tags.append(link('record-tag', item.name, `/topics/${encodeURIComponent(item.slug)}`)));
      institutions.slice(0, 3).forEach((item) => tags.append(link('record-tag', item.country_name || item.country_code || item.name, `/universities/${encodeURIComponent(item.slug)}`)));
      main.append(tags);
      const works = (award.funding_award_works || []).map((relation) => relation.university_research_works).filter(Boolean)
        .sort((left, right) => String(right.publication_date || '').localeCompare(String(left.publication_date || '')));
      const linkedWorks = el('div', 'funding-linked-works');
      works.slice(0, 3).forEach((work) => {
        const item = link('', work.title || 'Linked publication', work.source_url || '/research');
        item.target = '_blank'; item.rel = 'noopener noreferrer';
        linkedWorks.append(item);
      });
      if (linkedWorks.childElementCount) main.append(linkedWorks);

      const action = el('div', 'funding-card-action');
      action.append(el('span', '', `${numberFormatter.format(works.length)} linked publication${works.length === 1 ? '' : 's'}`));
      const source = link('source-link', 'Verify in OpenAlex', award.source_url);
      source.target = '_blank'; source.rel = 'noopener noreferrer'; source.dataset.ilEvent = 'open_source';
      action.append(source);
      card.append(meta, main, action);
      elements.fundingList.append(card);
    });
    elements.fundingResult.textContent = `Showing ${numberFormatter.format(fundingRows.length)} of ${numberFormatter.format(fundingTotal)} matching funding records.`;
    elements.fundingLoadMore.hidden = fundingNextOffset == null;
  }

  function renderFundingOverview(data) {
    const overview = data.overview || {};
    const summary = overview.summary || {};
    elements.fundingStats.replaceChildren();
    [
      [summary.awards, 'Award entities', 'Open source-linked award records'],
      [summary.identified_awards, 'Award identifiers', 'Records carrying a disclosed funder award reference'],
      [summary.funders, 'Funders', 'Distinct OpenAlex funder identities'],
      [summary.institutions, 'Universities', 'Eligible institutions connected through publications'],
      [summary.linked_publications, 'Linked publications', 'Retained longevity works carrying award metadata'],
    ].forEach(([value, label, note], index) => {
      const button = el('button', `funding-stat${index === 0 ? ' is-primary' : ''}`); button.type = 'button';
      button.append(el('strong', '', numberFormatter.format(Number(value || 0))), el('span', '', label), el('small', '', note));
      button.onclick = () => (index === 3 ? location.assign('/universities') : elements.fundingList.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      elements.fundingStats.append(button);
    });

    elements.fundingYears.replaceChildren();
    const cohorts = Array.isArray(overview.cohorts) ? overview.cohorts.slice(0, 10) : [];
    const maximum = Math.max(1, ...cohorts.map((item) => Number(item.publications || 0)));
    cohorts.forEach((cohort) => {
      const row = el('div', 'funding-year');
      const bar = el('i', ''); bar.style.setProperty('--funding-year-width', `${Math.max(4, Math.round((Number(cohort.publications || 0) / maximum) * 100))}%`);
      row.append(el('strong', '', cohort.year), bar, el('span', '', `${numberFormatter.format(cohort.awards)} awards · ${numberFormatter.format(cohort.publications)} publications`));
      elements.fundingYears.append(row);
    });
    const drawLeaders = (target, rows, label, handler, hrefFor) => {
      target.replaceChildren();
      rows.slice(0, 8).forEach((item) => {
        const href = hrefFor?.(item);
        const control = href ? link('funding-leader', '', href) : el('button', 'funding-leader');
        if (!href) { control.type = 'button'; control.onclick = () => handler(item); }
        control.append(el('span', '', label(item)), el('strong', '', numberFormatter.format(Number(item.awards || 0))));
        const entry = el('li'); entry.append(control); target.append(entry);
      });
    };
    drawLeaders(elements.fundingFunders, overview.leading_funders || [], (item) => item.funder_name, (item) => {
      elements.fundingSearch.value = item.funder_name; reloadFunding().catch((error) => console.error('Funding filter failed:', error));
    }, (item) => funderProfilePath(item.funder_name, item.funder_id));
    drawLeaders(elements.fundingTopics, overview.leading_topics || [], (item) => item.name, (item) => {
      elements.fundingTopic.value = item.slug; reloadFunding().catch((error) => console.error('Funding filter failed:', error));
    });
    elements.fundingLandscape.hidden = !cohorts.length && !(overview.leading_funders || []).length;
  }

  function setupFundingControls(topicEntries, data) {
    if (elements.fundingControls.dataset.ready) return;
    replaceFilterOptions(elements.fundingTopic, 'All topics', topicEntries);
    const countries = new Map();
    (data.overview?.leading_institutions || []).forEach((item) => { if (item.country_code) countries.set(item.country_code, item.country_name || item.country_code); });
    (data.awards || []).flatMap(awardInstitutions).forEach((item) => { if (item.country_code) countries.set(item.country_code, item.country_name || item.country_code); });
    replaceFilterOptions(elements.fundingCountry, 'All countries', [...countries.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    const params = new URLSearchParams(location.search);
    const requestedCountry = params.get('country')?.trim() || '';
    if (requestedCountry && ![...elements.fundingCountry.options].some((option) => option.value === requestedCountry)) elements.fundingCountry.append(new Option(requestedCountry, requestedCountry));
    elements.fundingSearch.value = params.get('search')?.trim() || '';
    elements.fundingTopic.value = params.get('topic')?.trim() || '';
    elements.fundingCountry.value = requestedCountry;
    elements.fundingSort.value = params.get('sort')?.trim() || 'recent';
    elements.fundingControls.addEventListener('input', () => {
      window.clearTimeout(fundingSearchTimer);
      fundingSearchTimer = window.setTimeout(() => reloadFunding().catch((error) => console.error('Funding search failed:', error)), 300);
    });
    elements.fundingControls.addEventListener('change', () => reloadFunding().catch((error) => console.error('Funding filter failed:', error)));
    elements.fundingClear.onclick = () => {
      elements.fundingSearch.value = ''; elements.fundingTopic.value = ''; elements.fundingCountry.value = ''; elements.fundingSort.value = 'recent';
      reloadFunding().catch((error) => console.error('Funding search failed:', error)); elements.fundingSearch.focus();
    };
    elements.fundingControls.dataset.ready = 'true';
  }

  async function reloadFunding() {
    const version = ++fundingRequestVersion;
    const data = await request('funding', FUNDING_PAGE_SIZE, fundingQueryParams(0));
    if (version !== fundingRequestVersion) return;
    fundingRows = data.awards || []; fundingNextOffset = data.next_offset; fundingTotal = Number(data.total_matching || fundingRows.length);
    const url = new URL(location.href);
    [['search', elements.fundingSearch.value.trim()], ['topic', elements.fundingTopic.value], ['country', elements.fundingCountry.value], ['sort', elements.fundingSort.value]].forEach(([key, value]) => value && !(key === 'sort' && value === 'recent') ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    history.replaceState({}, '', `${url.pathname}${url.search}`);
    drawFundingAwards(); renderFundingOverview(data);
  }

  async function loadMoreFunding() {
    if (fundingNextOffset == null) return;
    elements.fundingLoadMore.disabled = true; elements.fundingLoadMore.textContent = 'Loading…';
    try {
      const data = await request('funding', FUNDING_PAGE_SIZE, fundingQueryParams(fundingNextOffset));
      const known = new Set(fundingRows.map((item) => item.openalex_award_id));
      fundingRows.push(...(data.awards || []).filter((item) => !known.has(item.openalex_award_id)));
      fundingNextOffset = data.next_offset; fundingTotal = Number(data.total_matching || fundingRows.length); drawFundingAwards();
    } finally { elements.fundingLoadMore.disabled = false; elements.fundingLoadMore.textContent = 'Load more funding records'; }
  }

  function resultsGapStateLabel(state) {
    return {
      'possible-gap': 'Possible results gap',
      'within-window': 'Within 12 months',
      'results-posted': 'Results visible',
      'date-unavailable': 'Completion date unavailable',
    }[state] || 'Completed trial';
  }

  function renderResultsGapMonitor(data) {
    const trials = Array.isArray(data.trials) ? data.trials : [];
    const summary = data.summary || {};
    let selectedYear = '';

    const activateFilter = (state = '', year = '') => {
      if (elements.resultsGapStatus) elements.resultsGapStatus.value = state;
      selectedYear = year ? String(year) : '';
      draw();
      elements.resultsGapList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    elements.resultsGapStats.replaceChildren();
    [
      ['', summary.completed_trials, 'Completed registrations', 'The completed longevity-trial cohort checked by this monitor.'],
      ['possible-gap', summary.possible_gaps, 'Possible results gaps', 'No posted registry results more than 12 months after completion.'],
      ['within-window', summary.within_window, 'Completed within 12 months', 'No posted results yet, but still inside the monitor’s 12-month marker.'],
      ['results-posted', summary.results_posted, 'Registry results visible', `${Number(summary.results_coverage_percent || 0).toFixed(1)}% of this completed cohort.`],
      ['date-unavailable', summary.completion_date_unavailable, 'Date unavailable', 'Completed status without a usable past completion date.'],
    ].forEach(([state, value, label, note]) => {
      const button = el('button', `results-gap-stat${state === 'possible-gap' ? ' is-primary' : ''}`);
      button.type = 'button';
      button.dataset.state = state;
      button.append(el('strong', '', numberFormatter.format(Number(value || 0))), el('span', '', label), el('small', '', note));
      button.addEventListener('click', () => activateFilter(state));
      elements.resultsGapStats.append(button);
    });

    const cohorts = Array.isArray(data.cohorts) ? data.cohorts.slice(0, 12) : [];
    elements.resultsGapYears.replaceChildren();
    const maximum = Math.max(1, ...cohorts.map((cohort) => Number(cohort.completed || 0)));
    cohorts.forEach((cohort) => {
      const button = el('button', 'results-gap-year');
      button.type = 'button';
      button.dataset.year = String(cohort.year);
      const bar = el('span', 'results-gap-year-bar');
      bar.style.setProperty('--cohort-size', `${Math.max(8, (Number(cohort.completed || 0) / maximum) * 100)}%`);
      const postedShare = Number(cohort.completed || 0) ? Math.round((Number(cohort.results_posted || 0) / Number(cohort.completed)) * 100) : 0;
      bar.style.setProperty('--posted-share', `${postedShare}%`);
      button.append(el('strong', '', cohort.year), bar, el('span', '', `${numberFormatter.format(cohort.completed)} completed`), el('small', '', `${numberFormatter.format(cohort.results_posted)} results visible · ${numberFormatter.format(cohort.possible_gaps)} possible gaps`));
      button.addEventListener('click', () => activateFilter(elements.resultsGapStatus?.value || '', cohort.year));
      elements.resultsGapYears.append(button);
    });
    elements.resultsGapYearPanel.hidden = !cohorts.length;

    const topicEntries = topicOptions(trials, 'clinical_trial_topics');
    replaceFilterOptions(elements.resultsGapTopic, 'All topics', topicEntries);
    const params = new URLSearchParams(location.search);
    elements.resultsGapSearch.value = params.get('search')?.trim() || '';
    elements.resultsGapTopic.value = params.get('topic')?.trim() || '';
    elements.resultsGapStatus.value = params.get('status')?.trim() || 'possible-gap';
    elements.resultsGapSort.value = params.get('sort')?.trim() || 'longest-gap';

    function gapDetail(record) {
      if (record.result_state === 'possible-gap') {
        const months = Math.max(1, Math.floor(Number(record.gap_days || 0) / 30));
        return `${numberFormatter.format(months)} month${months === 1 ? '' : 's'} beyond the 12-month marker`;
      }
      if (record.result_state === 'within-window') return `${numberFormatter.format(Number(record.days_since_completion || 0))} days since listed completion`;
      if (record.result_state === 'results-posted') return 'Structured results are visible in the registry record';
      return 'No usable past completion date is available for timing';
    }

    function draw() {
      const query = String(elements.resultsGapSearch.value || '').trim().toLowerCase();
      const topic = elements.resultsGapTopic.value || '';
      const state = elements.resultsGapStatus.value || '';
      const sort = elements.resultsGapSort.value || 'longest-gap';
      const visible = trials.filter((record) => {
        const year = record.completion_date ? String(record.completion_date).slice(0, 4) : '';
        return (!query || trialSearchText(record).includes(query)) &&
          (!topic || includesTopic(record, 'clinical_trial_topics', topic)) &&
          (!state || record.result_state === state) &&
          (!selectedYear || year === selectedYear);
      }).sort((left, right) => {
        if (sort === 'title') return String(left.title).localeCompare(String(right.title));
        if (sort === 'recent-completion') return String(right.completion_date || '').localeCompare(String(left.completion_date || ''));
        if (sort === 'recent-update') return String(right.last_update_date || '').localeCompare(String(left.last_update_date || ''));
        return Number(right.gap_days || 0) - Number(left.gap_days || 0) || String(left.completion_date || '').localeCompare(String(right.completion_date || ''));
      });

      elements.resultsGapStats.querySelectorAll('[data-state]').forEach((button) => button.classList.toggle('is-active', button.dataset.state === state));
      elements.resultsGapYears.querySelectorAll('[data-year]').forEach((button) => button.classList.toggle('is-active', button.dataset.year === selectedYear));
      elements.resultsGapList.replaceChildren();
      visible.forEach((record) => {
        const card = el('article', `results-gap-card results-gap-card--${record.result_state}`);
        const meta = el('div', 'results-gap-card-meta');
        meta.append(el('span', `results-gap-state results-gap-state--${record.result_state}`, resultsGapStateLabel(record.result_state)));
        meta.append(el('strong', '', record.external_id || 'Registry ID unavailable'));
        if (record.content_sources?.name) meta.append(el('small', '', record.content_sources.name));

        const main = el('div', 'results-gap-card-main');
        const heading = el('h3'); heading.append(link('', record.title, `/trials/${encodeURIComponent(record.id)}`));
        const context = el('p', 'results-gap-context');
        context.textContent = `${record.sponsor || 'Sponsor not supplied'} · completed ${formatDate(record.completion_date)} · registry updated ${formatDate(record.last_update_date)}`;
        const signal = el('div', 'results-gap-signal');
        signal.append(el('strong', '', gapDetail(record)), el('span', '', record.result_state === 'possible-gap' ? 'No structured results are visible in the indexed registry record.' : resultsGapStateLabel(record.result_state)));
        const tags = el('div', 'record-tags');
        topicLinks(record, 'clinical_trial_topics').forEach((item) => tags.append(link('record-tag', item.name, `/topics/${encodeURIComponent(item.slug)}`)));
        (record.phases || []).forEach((phase) => tags.append(el('span', 'record-tag', readableStatus(phase))));
        main.append(heading, context, signal, tags);

        const action = el('div', 'results-gap-card-action');
        const local = link('section-link', 'Open indexed trial', `/trials/${encodeURIComponent(record.id)}`);
        const source = link('source-link', 'Verify in original registry', record.source_url);
        source.target = '_blank'; source.rel = 'noopener noreferrer'; source.dataset.ilEvent = 'open_source';
        action.append(local, source);
        card.append(meta, main, action);
        elements.resultsGapList.append(card);
      });
      if (!visible.length) elements.resultsGapList.append(el('p', 'empty-list', 'No completed trial matches these filters. Try all statuses, another topic, or clear the search.'));
      const yearText = selectedYear ? ` completed in ${selectedYear}` : '';
      elements.resultsGapResult.textContent = `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(trials.length)} completed trial registrations${yearText}. Updated ${formatTimestamp(data.generated_at)}.`;
      const url = new URL(location.href);
      [['search', elements.resultsGapSearch.value.trim()], ['topic', topic], ['status', state], ['sort', sort]].forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
      history.replaceState({}, '', `${url.pathname}${url.search}`);
    }

    elements.resultsGapControls.addEventListener('input', draw);
    elements.resultsGapControls.addEventListener('change', draw);
    elements.resultsGapClear.onclick = () => {
      elements.resultsGapSearch.value = '';
      elements.resultsGapTopic.value = '';
      elements.resultsGapStatus.value = '';
      elements.resultsGapSort.value = 'longest-gap';
      selectedYear = '';
      draw();
      elements.resultsGapSearch.focus();
    };
    draw();
    elements.resultsGapSection.hidden = false;
    elements.freshness.dataset.health = 'healthy';
    elements.freshnessText.textContent = `${numberFormatter.format(Number(summary.completed_trials || 0))} completed trial registrations checked · ${numberFormatter.format(Number(summary.possible_gaps || 0))} possible results gaps.`;
    window.ilTrackUtility?.('trial_results_gap_monitor_viewed', { possible_gaps: Number(summary.possible_gaps || 0) });
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
    const topics = Array.isArray(data.topics) ? data.topics.filter((topic) => data.fallback || Number(topic.evidence_total || 0) > 0) : [];
    const metricDefinitions = [
      ['research_count', 'Research', '/research'], ['trial_count', 'Trials', '/trials'],
      ['university_work_count', 'University works', '/universities'], ['regulatory_count', 'Regulatory', '/regulatory'],
      ['integrity_count', 'Integrity', '/integrity'],
    ];
    const draw = () => {
      const query = String(elements.graphSearch?.value || '').trim().toLowerCase();
      const focus = elements.graphFocus?.value || '';
      const sort = elements.graphSort?.value || 'evidence';
      const visible = topics.filter((topic) => {
        const searchable = `${topic.name || ''} ${topic.description || ''} ${topic.mechanism || ''}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!focus || Number(topic[focus] || 0) > 0);
      }).sort((left, right) => sort === 'name'
        ? String(left.name).localeCompare(String(right.name))
        : Number(right[sort === 'evidence' ? 'evidence_total' : sort] || 0) - Number(left[sort === 'evidence' ? 'evidence_total' : sort] || 0)
          || String(left.name).localeCompare(String(right.name)));
      elements.graphTopicList.replaceChildren();
      visible.forEach((topic) => {
        const row = el('article', 'evidence-topic-row');
        const copy = el('div', 'evidence-topic-copy');
        if (topic.mechanism) copy.append(el('span', 'evidence-topic-mechanism', topic.mechanism));
        const heading = el('h3'); heading.append(link('', topic.name, `/topics/${encodeURIComponent(topic.slug)}`));
        copy.append(heading, el('p', '', topic.description || 'Open the topic guide for its evidence and limitations.'));
        const metrics = el('div', 'evidence-topic-metrics');
        metricDefinitions.forEach(([field, label, destination]) => {
          const count = Number(topic[field] || 0);
          if (!count) return;
          const metric = link(`evidence-topic-metric evidence-topic-metric--${field}`, '', `${destination}?topic=${encodeURIComponent(topic.slug)}`);
          metric.setAttribute('aria-label', `${numberFormatter.format(count)} ${label.toLowerCase()} records for ${topic.name}`);
          metric.append(el('strong', '', numberFormatter.format(count)), el('span', '', label));
          metrics.append(metric);
        });
        if (!metrics.childElementCount && data.fallback) {
          const guide = link('evidence-topic-metric evidence-topic-metric--guide', '', `/topics/${encodeURIComponent(topic.slug)}`);
          guide.append(el('strong', '', 'Guide'), el('span', '', 'Open topic'));
          metrics.append(guide);
        }
        const related = el('nav', 'evidence-topic-related');
        if (Array.isArray(topic.related_topics) && topic.related_topics.length) {
          related.append(el('span', '', 'Related'));
          topic.related_topics.forEach((item) => related.append(link('', item.name, `/topics/${encodeURIComponent(item.slug)}`)));
        }
        row.append(copy, metrics);
        if (related.childElementCount) row.append(related);
        elements.graphTopicList.append(row);
      });
      if (!visible.length) elements.graphTopicList.append(el('p', 'empty-list', 'No topic matches these filters. Try a broader search.'));
      elements.graphResult.textContent = data.fallback
        ? `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(topics.length)} monitored topics while live evidence counts refresh.`
        : `Showing ${numberFormatter.format(visible.length)} of ${numberFormatter.format(topics.length)} topics with indexed evidence.`;
    };
    if (!elements.graphControls.dataset.ready) {
      elements.graphControls.addEventListener('input', draw);
      elements.graphControls.dataset.ready = 'true';
    }
    draw();
    elements.graphSection.hidden = false;
  }

  function renderTimeline(data) {
    if (!elements.timelineSection || !elements.timelineList) return;
    elements.timelineList.replaceChildren();
    const events = Array.isArray(data.events) ? data.events : [];
    const eventHref = (event) => event.source_fallback
      ? event.source_url
      : event.record_type && event.record_id
        ? `/${event.record_type === 'trials' ? 'trials' : event.record_type}/${encodeURIComponent(event.record_id)}`
        : event.source_url || '/changes';
    if (!events.length) elements.timelineList.append(el('li', 'timeline-empty', 'No source-level change is currently recorded for this topic.'));
    events.slice(0, 20).forEach((event) => {
      const item = el('li', `timeline-event timeline-event--${event.record_type || 'research'}`);
      item.append(el('time', '', formatTimestamp(event.occurred_at)), el('span', 'timeline-kind', readableStatus(event.event_type)));
      const heading = el('h3'); heading.append(link('', event.title, eventHref(event)));
      item.append(heading, el('p', '', event.importance === 'important' ? 'Meaningful source change.' : 'New or updated source record. Open it to inspect the evidence and limitations.'));
      elements.timelineList.append(item);
    });
    if (elements.topicHeroTimelineList) {
      elements.topicHeroTimelineList.replaceChildren();
      if (!events.length) {
        elements.topicHeroTimelineList.append(el('li', 'topic-hero-timeline-empty', 'No source-level change is recorded yet.'));
      }
      events.slice(0, 3).forEach((event) => {
        const item = el('li', 'topic-hero-timeline-event');
        const meta = el('div', 'topic-hero-timeline-meta');
        meta.append(el('time', '', formatTimestamp(event.occurred_at)), el('span', '', readableStatus(event.event_type)));
        item.append(meta, link('', event.title, eventHref(event)));
        elements.topicHeroTimelineList.append(item);
      });
    }
    elements.timelineSection.hidden = false;
    if (elements.relatedJourneys) {
      elements.relatedJourneys.replaceChildren(el('span', '', 'Related discoveries'));
      elements.relatedJourneys.append(link('', 'See all changes for this topic', `/changes?topic=${encodeURIComponent(topicSlug)}`));
      (data.related_topics || []).slice(0, 3).forEach((topic) => elements.relatedJourneys.append(link('', `Compare with ${topic.name}`, `/compare/${encodeURIComponent(topicSlug)}-vs-${encodeURIComponent(topic.slug)}`)));
      elements.relatedJourneys.append(link('', 'Find related university activity', `/universities?topic=${encodeURIComponent(topicSlug)}`));
      elements.relatedJourneys.append(link('', 'Explore source-linked funding', `/funding?topic=${encodeURIComponent(topicSlug)}`));
    }
  }

  function renderTopicReaderOverview(data) {
    const overview = data?.overview || {};
    const evidence = data?.evidence || {};
    const universities = Array.isArray(overview.universities) ? overview.universities : [];
    const research = Array.isArray(data?.research) ? data.research : [];
    const trials = Array.isArray(data?.trials) ? data.trials : [];
    const years = Array.isArray(overview.research_by_year) ? overview.research_by_year : [];
    const researchTotal = Number(evidence.research_total || 0);
    const trialTotal = Number(evidence.trial_total || 0);
    const recruiting = Number(evidence.recruiting_trials || 0);
    const humanTotal = Number(evidence.human_evidence_total || 0);
    const fundingTotal = Number(data?.funding?.award_count || 0);
    const trendLabels = { growing: 'Growing', steady: 'Broadly steady', slowing: 'Slower recently', limited: 'Too little data' };
    const trendDirection = String(overview.trend_direction || 'limited');
    const trendLabel = trendLabels[trendDirection] || 'Too little data';

    if (elements.topicUniversitySummary) elements.topicUniversitySummary.textContent = universities.length
      ? `${numberFormatter.format(universities.length)} leading institutions shown; open the full topic ranking.`
      : 'No topic-specific university activity is available yet.';
    if (elements.topicTrialSummary) elements.topicTrialSummary.textContent = `${numberFormatter.format(trialTotal)} registered · ${numberFormatter.format(recruiting)} recruiting or active.`;
    if (elements.topicResearchSummary) elements.topicResearchSummary.textContent = `${numberFormatter.format(researchTotal)} records · ${numberFormatter.format(humanTotal)} classified as human evidence.`;
    if (elements.topicFundingSummary) elements.topicFundingSummary.textContent = fundingTotal
      ? `${numberFormatter.format(fundingTotal)} source-linked award ${fundingTotal === 1 ? 'record' : 'records'} currently identified.`
      : 'Funding relationships are still being assembled for this topic.';
    if (elements.topicTrendSummary) elements.topicTrendSummary.textContent = `${trendLabel} across the latest complete three-year period.`;

    if (elements.topicUniversityGrid) {
      elements.topicUniversityGrid.replaceChildren();
      if (!universities.length) elements.topicUniversityGrid.append(el('p', 'empty-list', 'No university work is currently linked to this topic. Browse the global university index for adjacent fields.'));
      universities.forEach((university, index) => {
        const card = link('topic-university-card', '', `/universities/${encodeURIComponent(university.slug)}?topic=${encodeURIComponent(topicSlug)}`);
        const location = [university.city, university.country_name || university.country_code].filter(Boolean).join(', ') || 'Location unavailable';
        card.append(
          el('span', 'topic-university-rank', String(index + 1).padStart(2, '0')),
          el('h3', '', university.name),
          el('p', '', location),
          el('strong', '', numberFormatter.format(Number(university.works_all_time || 0))),
          el('small', '', 'indexed topic work links'),
        );
        elements.topicUniversityGrid.append(card);
      });
    }

    if (elements.topicTrendCallout) {
      const recent = Number(overview.trend_recent_total || 0);
      const prior = Number(overview.trend_prior_total || 0);
      const change = prior ? Math.round(((recent - prior) / prior) * 100) : recent ? 100 : 0;
      const explanation = trendDirection === 'growing' ? `The latest three complete years contain ${numberFormatter.format(recent)} indexed records, ${prior ? `${Math.abs(change)}% more than` : 'up from'} the preceding three years.`
        : trendDirection === 'slowing' ? `The latest three complete years contain ${numberFormatter.format(recent)} indexed records, ${Math.abs(change)}% fewer than the preceding three years.`
        : trendDirection === 'steady' ? `The latest three complete years contain ${numberFormatter.format(recent)} indexed records, close to ${numberFormatter.format(prior)} in the preceding period.`
        : 'There are not yet enough dated records to infer a meaningful publication trend.';
      elements.topicTrendCallout.replaceChildren(el('span', `topic-trend-status topic-trend-status--${trendDirection}`, trendLabel), el('strong', '', explanation), el('p', '', 'Publication activity measures indexed output, not whether findings are positive or clinically useful. The current year may be incomplete.'));
    }
    if (elements.topicTrendChart) {
      elements.topicTrendChart.replaceChildren();
      const maximum = Math.max(1, ...years.map((item) => Number(item.count || 0)));
      years.forEach((item) => {
        const bar = link('topic-trend-bar', '', `/research?topic=${encodeURIComponent(topicSlug)}`);
        bar.style.setProperty('--bar', `${Math.max(4, Math.round((Number(item.count || 0) / maximum) * 100))}%`);
        bar.setAttribute('aria-label', `${numberFormatter.format(Number(item.count || 0))} indexed research records published in ${item.year}; open topic research`);
        bar.append(el('strong', '', numberFormatter.format(Number(item.count || 0))), el('i', ''), el('span', '', String(item.year)));
        elements.topicTrendChart.append(bar);
      });
    }

    if (elements.topicSourceBasisList) {
      elements.topicSourceBasisList.replaceChildren();
      const examples = [
        ...research.slice(0, 2).map((record) => ({ title: record.title, url: record.source_url, type: record.content_sources?.name || 'Research source' })),
        ...trials.slice(0, 1).map((record) => ({ title: record.title, url: record.source_url, type: record.content_sources?.name || 'Official trial registry' })),
      ].filter((item) => item.title && item.url);
      if (!examples.length) elements.topicSourceBasisList.append(el('li', '', 'No source-linked example is currently available.'));
      examples.forEach((item) => {
        const entry = el('li');
        const source = link('', item.title, item.url); source.target = '_blank'; source.rel = 'noopener noreferrer';
        entry.append(source, el('small', '', String(item.type)));
        elements.topicSourceBasisList.append(entry);
      });
    }
  }

  function renderTopicEvidence(data) {
    const evidence = data?.evidence || {};
    if (!elements.topicDossierSnapshot || !elements.topicDossierAnswers) return;
    renderTopicReaderOverview(data);
    renderTopicPilot(data?.pilot);
    const events = Array.isArray(data?.timeline?.events) ? data.timeline.events : [];
    const research = Array.isArray(data?.research) ? data.research : [];
    const trials = Array.isArray(data?.trials) ? data.trials : [];
    const humanTotal = Number(evidence.human_evidence_total ?? ['human-synthesis', 'randomized-human', 'human-study'].reduce((sum, stage) => sum + Number(evidence.research_by_stage?.[stage] || 0), 0));
    const preclinicalTotal = Number(evidence.preclinical_total ?? evidence.research_by_stage?.preclinical ?? 0);
    const trialTotal = Number(evidence.trial_total || 0);
    const recruiting = Number(evidence.recruiting_trials || 0);
    const results = Number(evidence.trials_with_results || 0);
    const enrollment = Number(evidence.registered_enrollment || 0);
    const regulatory = Number(evidence.regulatory_total ?? events.filter((event) => event.record_type === 'regulatory').length);
    const integrity = Number(evidence.integrity_total ?? events.filter((event) => event.record_type === 'integrity').length);
    const lastUpdate = evidence.last_meaningful_update || events[0]?.occurred_at || evidence.generated_at;
    const metric = (label, value, href, note) => {
      const card = link('dossier-snapshot-card', '', href);
      card.append(el('strong', '', typeof value === 'number' ? numberFormatter.format(value) : value), el('span', '', label), el('small', '', note));
      return card;
    };
    elements.topicDossierSnapshot.replaceChildren(
      metric('Research records', Number(evidence.research_total || 0), '#researchSection', 'Open research →'),
      metric('Human evidence', humanTotal, '#dossier-human-evidence', 'Read context →'),
      metric('Clinical trials', trialTotal, '#trialsSection', 'Open trials →'),
      metric('Recruiting or active', recruiting, `/trials?topic=${encodeURIComponent(topicSlug)}&status=Recruiting`, 'Filter trials →'),
      metric('Funding awards', Number(data?.funding?.award_count || 0), `/funding?topic=${encodeURIComponent(topicSlug)}`, 'Open Funding Radar →'),
      metric('Participants listed', enrollment, '#dossier-trials', 'Registry enrollment →'),
      metric('Last meaningful update', lastUpdate ? formatTimestamp(lastUpdate) : 'None recorded', '#timelineSection', 'Open timeline →'),
    );

    elements.topicDossierAnswers.querySelectorAll('.living-dossier-answer').forEach((item) => item.remove());
    const dynamic = document.createDocumentFragment();
    const answer = (id, number, title, text, links = []) => {
      const article = el('article', 'living-dossier-answer'); article.id = id;
      article.append(el('span', '', number), el('h3', '', title), el('p', '', text));
      if (links.length) {
        const actions = el('div', 'dossier-answer-actions');
        links.forEach(([label, href]) => actions.append(link('section-link', label, href)));
        article.append(actions);
      }
      dynamic.append(article);
    };
    const randomized = Number(evidence.randomized_human_total ?? evidence.research_by_stage?.['randomized-human'] ?? 0);
    const syntheses = Number(evidence.human_synthesis_total ?? evidence.research_by_stage?.['human-synthesis'] ?? 0);
    const phaseCounts = evidence.trials_by_phase || {};
    const phaseSummary = Object.entries(phaseCounts).filter(([, count]) => Number(count) > 0).map(([phase, count]) => `${readableStatus(phase)}: ${numberFormatter.format(Number(count))}`).join(' · ');
    answer('dossier-human-evidence', '04', 'What has been demonstrated in humans?', humanTotal
      ? `${numberFormatter.format(humanTotal)} indexed human evidence record${humanTotal === 1 ? '' : 's'} currently match this topic, including ${numberFormatter.format(randomized)} randomized human stud${randomized === 1 ? 'y' : 'ies'} and ${numberFormatter.format(syntheses)} evidence syntheses. These counts identify study type; they do not establish a shared positive result.`
      : 'No indexed human evidence record currently matches this topic. That may reflect a genuine research gap, incomplete source coverage, or terminology that the automated matching did not detect.', [['Open human research', `/research?topic=${encodeURIComponent(topicSlug)}&evidence=human`]]);
    answer('dossier-preclinical', '05', 'What is limited to animals or cells?', preclinicalTotal
      ? `${numberFormatter.format(preclinicalTotal)} indexed preclinical record${preclinicalTotal === 1 ? '' : 's'} match this topic. Laboratory and animal findings can explain mechanisms and justify further research, but cannot establish a benefit or safety profile in people.`
      : 'No record is currently classified as preclinical for this topic. This does not prove that no animal or laboratory work exists; it describes the present indexed and classified collection.', [['Inspect research records', `/research?topic=${encodeURIComponent(topicSlug)}&evidence=preclinical`]]);
    answer('dossier-trials', '06', 'How mature is the trial evidence?', trialTotal
      ? `${numberFormatter.format(trialTotal)} registered trial${trialTotal === 1 ? '' : 's'} match this topic${phaseSummary ? `. ${phaseSummary}` : ''}. Registries list ${numberFormatter.format(enrollment)} participants in total; enrollment fields may be planned or actual and must be checked in each source record.`
      : 'No registered clinical trial currently matches this topic in the index. Absence from this collection is not proof that no study exists.', [['Open all matching trials', `/trials?topic=${encodeURIComponent(topicSlug)}`]]);
    answer('dossier-results', '07', 'Are results available, or only registrations?', results
      ? `${numberFormatter.format(results)} matched trial registration${results === 1 ? '' : 's'} currently report posted results. The remaining registrations may describe planned, active, completed, withdrawn, or otherwise updated studies without reusable results.`
      : trialTotal ? 'The matched trial registrations do not currently expose reusable posted results. A registration describes a study plan or status; it does not demonstrate that an intervention worked.' : 'There are no matched trial registrations from which posted results could be assessed.', [['Inspect trial records', `/trials?topic=${encodeURIComponent(topicSlug)}`]]);
    answer('dossier-safety', '08', 'What safety concerns have been reported?', regulatory
      ? `${numberFormatter.format(regulatory)} matched official regulatory notice${regulatory === 1 ? '' : 's'} appear in the topic timeline. Their scope is product-, indication-, date-, and jurisdiction-specific. This automated dossier does not constitute a complete safety assessment.`
      : 'No matched official regulatory notice is currently indexed. That is not evidence of safety. Safety may be reported in study results, product information, or authorities that are not connected to this topic.', [['Check official notices', `/regulatory?topic=${encodeURIComponent(topicSlug)}`]]);
    answer('dossier-regulation', '09', 'What do regulators say?', regulatory
      ? 'Open the matched official notices and verify the named product, indication, jurisdiction, and date. Research activity or trial registration does not itself mean that an intervention is approved for longevity use.'
      : 'The index has not connected an official notice to this topic. Regulatory status remains product-, use-, and jurisdiction-specific; inclusion in longevity research is not approval.', [['Open regulatory sources', '/resources?type=regulator']]);
    answer('dossier-disagreement', '10', 'Where does the evidence disagree?', 'The current automated metadata does not reliably encode comparable effect directions, endpoints, populations, and risk-of-bias judgments across every record. The dossier therefore does not manufacture a consensus or disagreement score. Compare the linked human studies and syntheses directly.', [['Compare source records', `/research?topic=${encodeURIComponent(topicSlug)}`]]);
    const latest = events[0];
    answer('dossier-changes', '11', 'What changed recently?', latest
      ? `The latest recorded source-level event was “${latest.title}” on ${formatTimestamp(latest.occurred_at)}. The timeline distinguishes new records, trial changes, official notices, corrections, and retractions without treating every update as a change in the scientific conclusion.`
      : 'No source-level change has yet been recorded for this topic.', [['Open the evidence timeline', '#timelineSection']]);
    const gaps = [];
    if (!humanTotal) gaps.push('human evidence');
    if (!randomized) gaps.push('randomized human studies');
    if (!syntheses) gaps.push('evidence syntheses');
    if (!trialTotal) gaps.push('registered trials');
    else if (!results) gaps.push('posted trial results');
    if (!regulatory) gaps.push('matched regulatory context');
    answer('dossier-gaps', '12', 'What important questions remain unanswered?', gaps.length
      ? `The present index has clear gaps in ${gaps.join(', ')}. Further questions include whether observed effects reproduce across populations, persist over meaningful follow-up, improve health outcomes rather than only biomarkers, and have an acceptable safety profile.`
      : 'Records exist across the main evidence layers, but important questions remain: reproducibility, effect size, long-term outcomes, population differences, clinically meaningful endpoints, and safety. Record counts alone cannot resolve them.', [['See how records are selected', '/methodology']]);
    elements.topicDossierAnswers.append(dynamic);
  }

  function renderTopicPilot(pilot) {
    if (!elements.topicClaimLedger) return;
    const version = pilot?.version || {};
    const conclusions = Array.isArray(version.conclusions) ? version.conclusions : [];
    const pending = Array.isArray(pilot?.pending_changes) ? pilot.pending_changes : [];
    if (!pilot?.enabled || !conclusions.length) {
      elements.topicClaimLedger.replaceChildren(el('p', 'dossier-loading', 'The cautious interpretation is temporarily unavailable. The source-linked records below remain accessible.'));
      return;
    }
    if (elements.topicInterpretationVersion) elements.topicInterpretationVersion.textContent = `Evidence interpretation · version ${Number(version.version_number || 1)}`;
    if (elements.topicInterpretationDate) elements.topicInterpretationDate.textContent = version.published_at ? `Assessed ${formatTimestamp(version.published_at)}` : '';
    if (elements.topicInterpretationMethod && pilot.method) elements.topicInterpretationMethod.textContent = pilot.method;
    if (elements.topicMaterialChange) {
      elements.topicMaterialChange.hidden = pending.length === 0;
      elements.topicMaterialChange.replaceChildren();
      if (pending.length) {
        elements.topicMaterialChange.append(
          el('strong', '', pending.some((change) => change.materiality === 'critical') ? 'Important new evidence detected' : 'New material evidence detected'),
          el('p', '', 'The live records and counts have updated. The interpretation below remains the last published version while the new evidence is assessed, so a single incoming record cannot silently reverse the conclusion.'),
        );
        const list = el('ul');
        pending.slice(0, 3).forEach((change) => {
          const item = el('li');
          const href = change.record_type && change.record_id ? `/${encodeURIComponent(change.record_type)}/${encodeURIComponent(change.record_id)}` : change.source_url;
          item.append(href ? link('', change.title || 'Open material evidence', href) : el('span', '', change.title || 'Material evidence event'), el('small', '', change.reason || 'This event may affect the evidence boundary.'));
          list.append(item);
        });
        elements.topicMaterialChange.append(list);
      }
    }
    elements.topicClaimLedger.replaceChildren();
    conclusions.forEach((claim) => {
      const card = el('article', 'topic-claim-card');
      const heading = el('div', 'topic-claim-heading');
      heading.append(el('span', '', claim.label || 'Evidence statement'), el('strong', '', claim.state || 'Current boundary'));
      const assessment = el('p', 'topic-claim-assessment', claim.assessment || 'No interpretation is available.');
      const boundary = el('dl', 'topic-claim-boundary');
      const basis = el('div'); basis.append(el('dt', '', 'Why this is cautious'), el('dd', '', claim.basis || 'Open the underlying records.'));
      const changes = el('div'); changes.append(el('dt', '', 'What could change it'), el('dd', '', claim.changes_if || 'New higher-quality evidence.'));
      boundary.append(basis, changes);
      card.append(heading, assessment, boundary);
      if (claim.href) card.append(link('section-link', 'Inspect supporting evidence', claim.href));
      elements.topicClaimLedger.append(card);
    });
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
      const available = value !== null && value !== undefined && Number.isFinite(Number(value));
      const display = available ? numberFormatter.format(Number(value)) : 'Updating…';
      card.setAttribute('aria-label', `${display} ${label}. Show what this represents.`);
      card.append(el('strong', '', display), el('span', '', label), el('small', '', available ? 'View details →' : 'Complete index reconnecting'));
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
      const heading = el('h3'); heading.append(link('', university.name, university.source_fallback ? university.openalex_url : `/universities/${encodeURIComponent(university.slug)}`)); main.append(heading);
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
        if (checkbox.checked && previousCount === 0) window.ilTrackUtility?.('comparison_started');
        if (checkbox.checked && previousCount === 1) window.ilTrackUtility?.('comparison_completed');
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
    const data = await request('universities', 100, {
      offset: append ? universityNextOffset || 0 : 0,
      q: elements.universitySearch?.value,
      topic: elements.universityTopic?.value,
      country: elements.universityCountry?.value,
      continent: elements.universityContinent?.value,
      sort: elements.universitySort?.value,
    });
    const incoming = Array.isArray(data.universities) ? data.universities : [];
    if (append) {
      const known = new Set(universityRows.map((university) => university.openalex_id));
      universityRows.push(...incoming.filter((university) => !known.has(university.openalex_id)));
    } else universityRows = incoming;
    universityNextOffset = data.next_offset;
    universityTotal = Number.isFinite(Number(data.total_matching)) ? Number(data.total_matching) : universityRows.length;
    elements.universityLoadMore.hidden = universityNextOffset == null;
    if (!elements.universityLoadMore.hidden) elements.universityLoadMore.textContent = `Load 100 more · ${numberFormatter.format(universityRows.length)} of ${numberFormatter.format(universityTotal)} shown`;
    renderUniversityStats(data.coverage || {});
    if (!universityControlsReady) {
      (data.topics || []).forEach((topic) => elements.universityTopic.append(new Option(topic.name, topic.slug)));
      (data.countries || []).forEach((country) => elements.universityCountry.append(new Option(`${country.name} · ${country.universities}`, country.code)));
      [...new Set((data.countries || []).map((country) => country.continent).filter(Boolean))].sort().forEach((continent) => elements.universityContinent.append(new Option(continent, continent)));
      let universitySearchTimer;
      elements.universitySearch.addEventListener('input', () => {
        clearTimeout(universitySearchTimer);
        universitySearchTimer = setTimeout(() => fetchUniversityIndex(false).catch(showUniversityError), 260);
      });
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
    elements.freshness.dataset.health = data.fallback ? 'stale' : data.sources?.[0]?.health || 'pending';
    elements.freshnessText.textContent = data.fallback
      ? 'The complete university index is reconnecting; temporary results are not shown as global totals.'
      : data.coverage?.last_updated_at ? `University index refreshed ${formatTimestamp(data.coverage.last_updated_at)} from OpenAlex affiliation data.` : 'The first automated OpenAlex university refresh is pending.';
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

  // Cache Storage survives ordinary reloads. Bump this contract whenever a
  // repaired public aggregation would otherwise remain hidden by an older
  // zero-value response in a visitor's browser.
  const publicCacheName = 'immortal-life-public-intelligence-v7';
  const publicCacheMaxAgeMs = 15 * 60 * 1000;

  async function readCachedRequest(url) {
    if (!('caches' in window)) return null;
    try {
      const cached = await caches.open(publicCacheName).then((cache) => cache.match(url.toString()));
      if (!cached) return null;
      const cachedAt = Number(cached.headers.get('x-immortal-cached-at') || 0);
      if (!cachedAt || Date.now() - cachedAt > publicCacheMaxAgeMs) return null;
      return cached.json();
    } catch (_) {
      return null;
    }
  }

  async function writeCachedRequest(url, data) {
    if (!('caches' in window)) return;
    try {
      const response = new Response(JSON.stringify(data), {
        headers: {
          'content-type': 'application/json',
          'x-immortal-cached-at': String(Date.now()),
        },
      });
      await caches.open(publicCacheName).then((cache) => cache.put(url.toString(), response));
    } catch (_) { /* A private browser may disable Cache Storage. */ }
  }

  async function fetchWithDeadline(url, timeoutMs = 6500) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { headers: window.ilFnHeaders(), signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function request(viewName, limit, params = {}) {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set('quality_rules', '20260927-readiness-gated-dossiers');
    url.searchParams.set('view', viewName);
    url.searchParams.set('limit', String(limit));
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    if (viewName === 'resources') url.searchParams.set('directory_contract', 'global-195-v2');
    if (topicSlug) url.searchParams.set('topic', topicSlug);
    const cached = await readCachedRequest(url);
    if (cached) return cached;
    const res = await fetchWithDeadline(url, ['topic-dossier', 'trial-results-gap', 'funding'].includes(viewName) ? 10000 : 6500);
    if (res.ok) {
      const data = await res.json();
      await writeCachedRequest(url, data);
      return data;
    }
    throw new Error(`Feed request failed with ${res.status}`);
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
        const params = new URLSearchParams(location.search);
        const [data, topicEntries] = await Promise.all([request('research', 100, { q: params.get('search')?.trim() || '', topic: params.get('topic')?.trim() || '', evidence: params.get('evidence')?.trim() || '', access: params.get('access')?.trim() || '' }), catalogueTopicEntries()]);
        researchNextOffset = data.next_offset;
        researchTotal = Number(data.total_matching || data.research?.length || 0);
        renderResearch(data.research || [], topicEntries);
        elements.researchLoadMore.hidden = researchNextOffset == null;
        elements.researchLoadMore.onclick = () => loadMoreResearch().catch((error) => console.error('Research page request failed:', error));
        renderSources(data.sources || [], false);
      } else if (view === 'trials') {
        const params = new URLSearchParams(location.search);
        const [data, topicEntries] = await Promise.all([request('trials', 100, { q: params.get('search')?.trim() || '', topic: params.get('topic')?.trim() || '', status: params.get('status')?.trim() || '', phase: params.get('phase')?.trim() || '', country: params.get('country')?.trim() || '' }), catalogueTopicEntries()]);
        trialNextOffset = data.next_offset;
        trialTotal = Number(data.total_matching || data.trials?.length || 0);
        renderTrials(data.trials || [], topicEntries);
        elements.trialLoadMore.hidden = trialNextOffset == null;
        elements.trialLoadMore.onclick = () => loadMoreTrials().catch((error) => console.error('Trial page request failed:', error));
        renderSources(data.sources || [], false);
      } else if (view === 'trial-results-gap') {
        const data = await request('trial-results-gap', 500);
        renderResultsGapMonitor(data);
        renderSources(data.sources || [], false);
      } else if (view === 'funding') {
        const params = new URLSearchParams(location.search);
        const [data, topicEntries] = await Promise.all([request('funding', FUNDING_PAGE_SIZE, {
          q: params.get('search')?.trim() || '', topic: params.get('topic')?.trim() || '', country: params.get('country')?.trim() || '', institution: params.get('institution')?.trim() || '', sort: params.get('sort')?.trim() || 'recent',
        }), catalogueTopicEntries()]);
        fundingRows = data.awards || []; fundingNextOffset = data.next_offset; fundingTotal = Number(data.total_matching || fundingRows.length);
        setupFundingControls(topicEntries, data); drawFundingAwards(); renderFundingOverview(data);
        elements.fundingSection.hidden = false; elements.fundingLoadMore.onclick = () => loadMoreFunding().catch((error) => console.error('Funding page request failed:', error));
        const fundingHistoryComplete = Boolean(data.coverage_status?.historical_cycle_complete);
        elements.freshness.dataset.health = data.fallback ? 'delayed' : fundingHistoryComplete ? 'healthy' : 'pending';
        elements.freshnessText.textContent = data.fallback
          ? data.notice
          : fundingHistoryComplete
            ? `${numberFormatter.format(Number(data.overview?.summary?.awards || 0))} source-linked awards currently indexed.`
            : `Funding history is still expanding; ${numberFormatter.format(Number(data.overview?.summary?.awards || 0))} source-linked awards are searchable so far.`;
        renderSources(data.sources || [], false);
      } else if (view === 'topics') {
        const response = await fetch('/topics-directory.json', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Topic directory failed with ${response.status}`);
        const data = await response.json();
        renderTopics(data.topics || [], false);
        elements.freshness.dataset.health = 'healthy';
        elements.freshnessText.textContent = `${numberFormatter.format(data.topic_count || data.topics?.length || 0)} topics organized across ${numberFormatter.format(data.domain_count || 0)} domains.`;
      } else if (view === 'compare') {
        await initEvidenceCompare();
      } else if (view === 'topic') {
        const dossier = await request('topic-dossier', 12);
        if (dossier.fallback) {
          drawResearch([], 'The verified topic index is temporarily reconnecting. Unscored source-search results are not shown as dossier evidence.');
          drawTrials([], 'The verified trial index is temporarily reconnecting. Unscored registry-search results are not shown as dossier evidence.');
          if (elements.topicDossierSnapshot) elements.topicDossierSnapshot.replaceChildren(el('p', 'dossier-loading', 'The verified evidence snapshot is temporarily unavailable. Please try again shortly; no zero counts or unscored records are substituted.'));
          if (elements.topicUniversitySummary) elements.topicUniversitySummary.textContent = 'Verified university activity is temporarily unavailable.';
          if (elements.topicTrialSummary) elements.topicTrialSummary.textContent = 'Verified trial counts are temporarily unavailable.';
          if (elements.topicResearchSummary) elements.topicResearchSummary.textContent = 'Verified research counts are temporarily unavailable.';
          if (elements.topicTrendSummary) elements.topicTrendSummary.textContent = 'Verified trend data is temporarily unavailable.';
          return;
        }
        renderResearch(dossier.research || []);
        renderTrials(dossier.trials || []);
        renderSources(dossier.sources || [], false);
        renderStats({ research: dossier.evidence?.research_total, trials: dossier.evidence?.trial_total });
        renderTimeline(dossier.timeline || {});
        renderTopicEvidence(dossier);
      } else if (view === 'regulatory') {
        const [data, directoryResponse] = await Promise.all([
          request('regulatory', 80, { topic: new URLSearchParams(location.search).get('topic')?.trim() || '' }),
          fetch('/resources-directory.json', { headers: { Accept: 'application/json' } }),
        ]);
        const directory = directoryResponse.ok ? await directoryResponse.json() : null;
        const officialGuides = (directory?.resources || []).filter((resource) => resource.resource_type === 'regulator');
        renderRegulatory(data.regulatory || [], officialGuides.length ? officialGuides : (data.regulatory_guides || []), officialGuides.length ? {
          authorities: officialGuides.length,
          jurisdictions: new Set(officialGuides.map((resource) => resource.jurisdiction_code).filter(Boolean)).size,
          regions: new Set(officialGuides.map((resource) => resource.region).filter(Boolean)).size,
        } : (data.regulatory_coverage || {}));
        renderSources(data.sources || [], false);
      } else if (view === 'integrity') {
        const data = await request('integrity', 80, { topic: new URLSearchParams(location.search).get('topic')?.trim() || '' });
        renderIntegrity(data.integrity || []);
        renderSources(data.sources || [], false);
      } else if (view === 'graph') {
        const data = await request('graph', 100);
        if (!(data.topics || []).length) {
          const directoryResponse = await fetch('/topics-directory.json', { headers: { Accept: 'application/json' } });
          if (directoryResponse.ok) {
            const directory = await directoryResponse.json();
            data.topics = (directory.topics || []).map((topic) => ({ ...topic, evidence_total: 0 }));
          }
        }
        renderGraph(data);
        renderSources(data.sources || [], false);
      } else if (view === 'entities') {
        const data = await request('entities', 100);
        renderEntities(data.entities || []);
        renderSources(data.sources || [], false);
      } else if (view === 'universities') {
        await fetchUniversityIndex();
      } else if (view === 'resources') {
        const response = await fetch('/resources-directory.json', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Resource directory failed with ${response.status}`);
        const data = await response.json();
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
