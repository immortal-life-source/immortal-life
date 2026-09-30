(function institutionalPilot() {
  'use strict';

  const menuButton = document.getElementById('pilotMenuButton');
  const nav = document.getElementById('pilotNav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    });
  }

  const status = document.getElementById('demoStatus');
  const endpoint = `${window.IL_FN_BASE}/public-intelligence`;
  const number = new Intl.NumberFormat('en-US');
  const compactDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });
  const text = (value, fallback = 'Not yet classified') => String(value || fallback);
  const date = (value) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.valueOf()) ? compactDate.format(parsed) : 'Date unavailable';
  };
  const clear = (element) => { while (element.firstChild) element.removeChild(element.firstChild); };
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const item = (meta, title, href) => {
    const link = node('a', 'live-item');
    link.href = href || '#';
    if (/^https?:/i.test(link.href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    link.append(node('small', '', meta), node('strong', '', title));
    return link;
  };
  const renderList = (id, records, mapper, emptyText) => {
    const container = document.getElementById(id);
    clear(container);
    if (!records.length) { container.append(node('p', '', emptyText)); return; }
    records.slice(0, 3).forEach((record) => container.append(mapper(record)));
  };
  const metric = (label, value, href, note) => {
    const link = node('a', 'metric-card'); link.href = href;
    link.append(node('strong', '', value), node('span', '', label), node('small', '', note));
    return link;
  };
  const formatCount = (value) => number.format(Math.max(0, Number(value) || 0));
  const visualLink = (className, href) => {
    const link = node('a', className);
    link.href = href;
    return link;
  };
  const renderMaturity = (evidence, trials, activeTrials, gapSummary) => {
    const container = document.getElementById('pilotMaturity'); clear(container);
    const stages = [
      ['Indexed research', Number(evidence.research_total) || 0, '/research?topic=exercise'],
      ['Human studies', Number(evidence.human_evidence_total) || 0, '/research?topic=exercise&evidence=human'],
      ['Trial registrations', trials.length, '/trials?search=exercise'],
      ['Active trials', activeTrials.length, '/trials?search=exercise&status=active'],
      ['Completed trials', Number(gapSummary.completed_trials) || 0, '/trials/results-gap?search=exercise'],
      ['Structured results visible', Number(gapSummary.results_posted) || 0, '/trials/results-gap?search=exercise&status=results-posted'],
    ];
    stages.forEach(([label, value, href], index) => {
      const link = visualLink('maturity-stage', href);
      link.append(node('small', '', String(index + 1).padStart(2, '0')), node('strong', '', formatCount(value)), node('span', '', label));
      container.append(link);
    });
  };
  const renderPulse = (pulse) => {
    const container = document.getElementById('pilotChangePulse'); clear(container);
    if (!pulse || pulse.complete !== true) {
      container.append(node('p', 'visual-empty', 'A complete twelve-week comparison is not available yet. Open the source timeline instead.'));
      return;
    }
    const current = Number(pulse.current_total) || 0;
    const previous = Number(pulse.previous_total) || 0;
    const maximum = Math.max(current, previous, 1);
    const summary = node('p', 'pulse-summary');
    const delta = current - previous;
    summary.textContent = pulse.baseline_ready === false
      ? `${formatCount(current)} source events are indexed for the latest six weeks. The preceding-window baseline is not mature enough for an acceleration claim.`
      : delta === 0 ? 'Source activity was unchanged.' : `${formatCount(Math.abs(delta))} ${delta > 0 ? 'more' : 'fewer'} source events than in the preceding six weeks.`;
    container.append(summary);
    (pulse.baseline_ready === false ? [['Latest six weeks', current]] : [['Previous six weeks', previous], ['Latest six weeks', current]]).forEach(([label, value]) => {
      const link = visualLink('comparison-bar', '/changes?topic=exercise');
      const copy = node('span'); copy.append(node('b', '', label), node('strong', '', formatCount(value)));
      const track = node('i'); const fill = node('em'); fill.style.width = `${Math.max(2, (Number(value) / maximum) * 100)}%`; track.append(fill);
      link.append(copy, track); container.append(link);
    });
    const types = node('div', 'pulse-types');
    const typeLabels = { research: 'Research', research_item: 'Research', trial: 'Trials', clinical_trial: 'Trials', regulatory: 'Official notices', integrity: 'Corrections' };
    Object.entries(pulse.current_by_record_type || {}).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 4).forEach(([key, value]) => {
      const destination = /trial/i.test(key) ? '/trials?search=exercise' : /regulatory/i.test(key) ? '/regulatory?topic=exercise' : /integrity|correction|retraction/i.test(key) ? '/integrity?topic=exercise' : '/research?topic=exercise';
      const link = visualLink('', destination); link.append(node('strong', '', formatCount(value)), node('span', '', typeLabels[key] || key.replace(/_/g, ' '))); types.append(link);
    });
    container.append(types, node('p', 'visual-footnote', 'This measures indexed source activity, not whether the scientific conclusion improved. A trend comparison appears only after both six-week windows contain indexed history.'));
  };
  const renderTrialLandscape = (trials) => {
    const container = document.getElementById('pilotTrialLandscape'); clear(container);
    const groups = [
      { label: 'Active or recruiting', test: /recruiting|active|enrolling/i, href: '/trials?search=exercise&status=active' },
      { label: 'Completed', test: /^completed$/i, href: '/trials?search=exercise&status=Completed' },
      { label: 'Stopped early', test: /terminated|withdrawn|suspended/i, href: '/trials?search=exercise' },
    ];
    const assigned = new Set();
    const rows = groups.map((group) => {
      const records = trials.filter((trial, index) => group.test.test(String(trial.overall_status || '')) && !assigned.has(index));
      trials.forEach((trial, index) => { if (group.test.test(String(trial.overall_status || ''))) assigned.add(index); });
      return { ...group, records };
    });
    rows.push({ label: 'Other registry status', href: '/trials?search=exercise', records: trials.filter((trial, index) => !assigned.has(index)) });
    const maximum = Math.max(...rows.map((row) => row.records.length), 1);
    rows.forEach((row) => {
      const participants = row.records.reduce((sum, trial) => sum + Math.max(0, Number(trial.enrollment) || 0), 0);
      const link = visualLink('landscape-row', row.href);
      const heading = node('span'); heading.append(node('b', '', row.label), node('strong', '', formatCount(row.records.length)));
      const track = node('i'); const fill = node('em'); fill.style.width = `${Math.max(2, (row.records.length / maximum) * 100)}%`; track.append(fill);
      link.append(heading, track, node('small', '', `${formatCount(participants)} listed participants`)); container.append(link);
    });
    container.append(node('p', 'visual-footnote', 'Status and participant totals come from registry records; listed enrollment is not proof of completed participation.'));
  };
  const renderUniversityConnections = (connections) => {
    const container = document.getElementById('pilotUniversityHeatmap'); clear(container);
    const topics = Array.isArray(connections?.topics) ? connections.topics : [];
    const universities = Array.isArray(connections?.universities) ? connections.universities : [];
    if (!topics.length || !universities.length) {
      container.append(node('p', 'visual-empty', 'No complete cross-topic university view is available yet.'));
      return;
    }
    const maximum = Math.max(...universities.flatMap((university) => topics.map((topic) => Number(university.values?.[topic.slug]) || 0)), 1);
    const table = node('table');
    const head = node('thead'); const headRow = node('tr'); headRow.append(node('th', '', 'Institution'));
    topics.forEach((topic) => { const cell = node('th'); const link = visualLink('', `/topics/${encodeURIComponent(topic.slug)}`); link.textContent = topic.name; cell.append(link); headRow.append(cell); });
    head.append(headRow); table.append(head);
    const body = node('tbody');
    universities.forEach((university) => {
      const row = node('tr'); const label = node('th'); const profile = visualLink('', `/universities/${encodeURIComponent(university.slug)}?topic=exercise`); profile.textContent = university.name; label.append(profile); row.append(label);
      topics.forEach((topic) => {
        const value = Number(university.values?.[topic.slug]) || 0;
        const cell = node('td'); const link = visualLink('heat-cell', `/universities/${encodeURIComponent(university.slug)}?topic=${encodeURIComponent(topic.slug)}`);
        link.style.setProperty('--heat', String(value / maximum)); link.textContent = formatCount(value); link.title = `${university.name}: ${formatCount(value)} indexed five-year links to ${topic.name}`; cell.append(link); row.append(cell);
      });
      body.append(row);
    });
    table.append(body); container.append(table, node('p', 'visual-footnote', 'Select any cell to inspect that institution and topic. Counts are indexed publication links from the latest five-year window.'));
  };
  const renderResultsGap = (summary) => {
    const container = document.getElementById('pilotResultsGap'); clear(container);
    const completed = Number(summary.completed_trials) || 0;
    const posted = Number(summary.results_posted) || 0;
    const possible = Number(summary.possible_gaps) || 0;
    const within = Number(summary.within_window) || 0;
    const unavailable = Number(summary.completion_date_unavailable) || 0;
    if (!completed) {
      container.append(node('p', 'visual-empty', 'No completed Exercise trial registrations are present in this exact text-matched cohort.'));
      return;
    }
    const bar = node('div', 'results-segments');
    [[posted, 'posted'], [within, 'window'], [possible, 'gap'], [unavailable, 'unknown']].forEach(([value, kind]) => {
      if (!value) return;
      const segment = node('i', `is-${kind}`); segment.style.width = `${(Number(value) / completed) * 100}%`; bar.append(segment);
    });
    container.append(bar);
    const cards = node('div', 'results-cards');
    [
      ['Completed registrations', completed, '/trials/results-gap?search=exercise'],
      ['Structured results visible', posted, '/trials/results-gap?search=exercise&status=results-posted'],
      ['Possible reporting gap', possible, '/trials/results-gap?search=exercise&status=possible-gap'],
      ['Still within 365-day window', within, '/trials/results-gap?search=exercise&status=within-window'],
    ].forEach(([label, value, href]) => { const link = visualLink('result-card', href); link.append(node('strong', '', formatCount(value)), node('span', '', label)); cards.append(link); });
    container.append(cards, node('p', 'visual-footnote', 'A possible gap means no structured result was visible in the indexed registry record more than 365 days after listed completion. It is not an allegation of misconduct or proof that results do not exist elsewhere.'));
  };

  async function load() {
    try {
      const dossierUrl = new URL(endpoint);
      dossierUrl.searchParams.set('view', 'topic-dossier');
      dossierUrl.searchParams.set('topic', 'exercise');
      dossierUrl.searchParams.set('limit', '12');
      dossierUrl.searchParams.set('quality_rules', '20260930-audited-pilot-metrics');
      const trialsUrl = new URL(endpoint);
      trialsUrl.searchParams.set('view', 'trials');
      trialsUrl.searchParams.set('q', 'exercise');
      trialsUrl.searchParams.set('limit', '100');
      trialsUrl.searchParams.set('quality_rules', '20260930-audited-pilot-metrics');
      const gapUrl = new URL(endpoint);
      gapUrl.searchParams.set('view', 'trial-results-gap');
      gapUrl.searchParams.set('q', 'exercise');
      gapUrl.searchParams.set('quality_rules', '20260930-decision-views');
      const [response, trialsResponse, gapResponse] = await Promise.all([
        fetch(dossierUrl, { headers: window.ilFnHeaders() }),
        fetch(trialsUrl, { headers: window.ilFnHeaders() }),
        fetch(gapUrl, { headers: window.ilFnHeaders() }),
      ]);
      if (!response.ok || !trialsResponse.ok || !gapResponse.ok) throw new Error(`Live index request failed with ${response.status}/${trialsResponse.status}/${gapResponse.status}`);
      const [data, trialsData, gapData] = await Promise.all([response.json(), trialsResponse.json(), gapResponse.json()]);
      const evidence = data.evidence || {};
      const overview = data.overview || {};
      const requiredCounts = ['research_total', 'human_evidence_total'];
      const exerciseTrials = Array.isArray(trialsData.trials) ? trialsData.trials : [];
      const activeTrials = exerciseTrials.filter((record) => /recruiting|active|enrolling/i.test(String(record.overall_status || '')));
      const listedParticipants = exerciseTrials.reduce((sum, record) => sum + Math.max(0, Number(record.enrollment) || 0), 0);
      if (requiredCounts.some((field) => !Number.isFinite(Number(evidence[field])) || Number(evidence[field]) <= 0)
        || !exerciseTrials.length || !activeTrials.length || !listedParticipants) {
        throw new Error('The live pilot snapshot is incomplete');
      }
      const research = Array.isArray(data.research) ? data.research : [];
      const universities = Array.isArray(overview.universities) ? overview.universities : [];
      const universityTotal = Math.max(universities.length, Number(overview.university_total) || 0);
      const events = Array.isArray(data.timeline?.events) ? data.timeline.events : [];
      const eventTotal = Math.max(events.length, Number(data.timeline?.total_matching) || 0);
      const grid = document.getElementById('metricGrid');
      clear(grid);
      grid.append(
        metric('Indexed research', number.format(Number(evidence.research_total || 0)), '/research?topic=exercise', 'See the research →'),
        metric('Human studies', number.format(Number(evidence.human_evidence_total || 0)), '/research?topic=exercise&evidence=human', 'See the human studies →'),
        metric('Exercise-related trials', number.format(exerciseTrials.length), '/trials?search=exercise', 'See trial registrations →'),
        metric('Active trials', number.format(activeTrials.length), '/trials?search=exercise&status=active', 'See active trials →'),
        metric('People listed in trials', number.format(listedParticipants), '/trials?search=exercise&metric=enrollment', 'See listed enrollment →'),
        metric('Research activity', text(overview.trend_direction, 'Limited').replace(/^./, (value) => value.toUpperCase()), '/topics/exercise#topicTrend', 'View the trend →'),
      );
      renderMaturity(evidence, exerciseTrials, activeTrials, gapData.summary || {});
      renderPulse(data.timeline?.pulse);
      renderTrialLandscape(exerciseTrials);
      renderUniversityConnections(overview.university_connections);
      renderResultsGap(gapData.summary || {});
      renderList('pilotResearch', research, (record) => item(date(record.published_on), text(record.title), record.source_url || `/research/${encodeURIComponent(record.id)}`), 'No current research example is available.');
      renderList('pilotTrials', exerciseTrials, (record) => item(text(record.overall_status), text(record.title), record.source_url || `/trials/${encodeURIComponent(record.id)}`), 'No current trial registration is available.');
      const universitiesSummary = document.getElementById('pilotUniversitiesSummary');
      if (universitiesSummary) {
        const visible = Math.min(3, universities.length);
        const roundedUniversityTotal = universityTotal >= 1000 ? Math.floor(universityTotal / 100) * 100 : universityTotal;
        universitiesSummary.textContent = universityTotal
          ? `${visible === universityTotal ? `Showing all ${number.format(universityTotal)}` : `Showing 3 leading profiles from ${universityTotal >= 1000 ? 'more than ' : ''}${number.format(roundedUniversityTotal)}`} universities currently linked to Exercise research. Open the complete topic view to browse the full filtered index.`
          : 'No university profile is currently linked to Exercise research.';
      }
      renderList('pilotUniversities', universities, (record) => {
        const location = [record.city, record.country_name || record.country_code].filter(Boolean).join(', ');
        return item(location || 'Exercise topic profile', text(record.name), `/universities/${encodeURIComponent(record.slug)}?topic=exercise`);
      }, 'No topic-specific university activity is currently available.');
      const changesSummary = document.getElementById('pilotChangesSummary');
      if (changesSummary) {
        const visible = Math.min(3, events.length);
        changesSummary.textContent = eventTotal
          ? `${visible === eventTotal ? `Showing all ${number.format(eventTotal)}` : `Showing the ${number.format(visible)} newest of ${number.format(eventTotal)}`} source-level changes recorded for Exercise in the last six weeks. A new or updated record does not necessarily change the scientific conclusion.`
          : 'No source-level change is currently recorded for Exercise in the last six weeks.';
      }
      renderList('pilotChanges', events, (record) => item(date(record.occurred_at), text(record.title), record.source_url || '/changes?topic=exercise'), 'No source-level change is currently recorded.');
      status.classList.add('is-live');
      status.querySelector('span').textContent = `Live index snapshot generated ${date(data.generated_at)} · open any item to inspect its source.`;
    } catch (error) {
      status.classList.add('is-error');
      status.querySelector('span').textContent = 'The live snapshot is temporarily unavailable. The complete exercise dossier remains available.';
      const grid = document.getElementById('metricGrid'); clear(grid);
      const fallback = node('a', 'metric-card'); fallback.href = '/topics/exercise';
      fallback.style.gridColumn = '1 / -1';
      fallback.append(node('strong', '', 'Open'), node('span', '', 'Exercise Living Evidence Dossier'), node('small', '', 'View current research, trials, university activity, and evidence context →'));
      grid.append(fallback);
      ['pilotMaturity', 'pilotChangePulse', 'pilotTrialLandscape', 'pilotUniversityHeatmap', 'pilotResultsGap', 'pilotResearch', 'pilotTrials', 'pilotUniversities', 'pilotChanges'].forEach((id) => {
        const container = document.getElementById(id); clear(container); container.append(node('p', '', 'Live records will reappear when the source endpoint is available.'));
      });
      console.error(error);
    }
  }

  load();
})();
