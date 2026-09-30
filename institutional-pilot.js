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
      const [response, trialsResponse] = await Promise.all([
        fetch(dossierUrl, { headers: window.ilFnHeaders() }),
        fetch(trialsUrl, { headers: window.ilFnHeaders() }),
      ]);
      if (!response.ok || !trialsResponse.ok) throw new Error(`Live index request failed with ${response.status}/${trialsResponse.status}`);
      const [data, trialsData] = await Promise.all([response.json(), trialsResponse.json()]);
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
      const events = Array.isArray(data.timeline?.events) ? data.timeline.events : [];
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
      renderList('pilotResearch', research, (record) => item(date(record.published_on), text(record.title), record.source_url || `/research/${encodeURIComponent(record.id)}`), 'No current research example is available.');
      renderList('pilotTrials', exerciseTrials, (record) => item(text(record.overall_status), text(record.title), record.source_url || `/trials/${encodeURIComponent(record.id)}`), 'No current trial registration is available.');
      renderList('pilotUniversities', universities, (record) => {
        const location = [record.city, record.country_name || record.country_code].filter(Boolean).join(', ');
        return item(location || 'Exercise topic profile', text(record.name), `/universities/${encodeURIComponent(record.slug)}?topic=exercise`);
      }, 'No topic-specific university activity is currently available.');
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
      ['pilotResearch', 'pilotTrials', 'pilotUniversities', 'pilotChanges'].forEach((id) => {
        const container = document.getElementById(id); clear(container); container.append(node('p', '', 'Live records will reappear when the source endpoint is available.'));
      });
      console.error(error);
    }
  }

  load();
})();
