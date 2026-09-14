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

  function topicLinks(record, relationName) {
    const relations = Array.isArray(record?.[relationName]) ? record[relationName] : [];
    return relations
      .map((relation) => relation?.intelligence_topics || relation)
      .filter((topic) => topic && topic.slug && topic.name);
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
      main.append(el('h3', '', record.title));
      main.append(el('p', '', record.editorial_summary));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'research_item_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      if (record.is_open_access) tags.append(el('span', 'record-tag', 'Open access'));
      main.append(tags);

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
      main.append(el('h3', '', record.title));
      main.append(el('p', '', record.editorial_summary));
      const tags = el('div', 'record-tags');
      topicLinks(record, 'clinical_trial_topics').forEach((topic) => tags.append(link('record-tag', topic.name, `/topics/${encodeURIComponent(topic.slug)}`)));
      (record.phases || []).forEach((phase) => tags.append(el('span', 'record-tag', phase.replace(/_/g, ' '))));
      main.append(tags);

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

  function renderSources(sources) {
    elements.sourceList.replaceChildren();
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
    if (overall === 'healthy') elements.freshnessText.textContent = 'All source feeds are current and updating automatically.';
    else if (overall === 'pending') elements.freshnessText.textContent = 'Initial source synchronization is in progress.';
    else elements.freshnessText.textContent = 'One or more sources are delayed; existing records remain cited and available.';
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
        elements.researchCount.textContent = numberFormatter.format(data.stats.research_records);
        elements.trialCount.textContent = numberFormatter.format(data.stats.clinical_trials);
        elements.topicCount.textContent = numberFormatter.format(data.stats.topics);
        elements.statsSection.hidden = false;
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
          elements.researchCount.textContent = numberFormatter.format(selected.research_count || 0);
          elements.trialCount.textContent = numberFormatter.format(selected.trial_count || 0);
          elements.topicCount.textContent = '1';
          elements.statsSection.hidden = false;
        }
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
