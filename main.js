/* ============================================================
   immortal.life — main.js
   Scroll reveal · Form validation · Modal · Backend hook
   ============================================================ */

'use strict';

/* ── Responsive primary navigation ────────────────────────── */
(function initMobileNavigation() {
  const toggle = document.querySelector('.mobile-nav-toggle');
  const nav = document.getElementById('primaryNav');
  if (!toggle || !nav) return;

  function closeMenu() {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    nav.removeAttribute('data-open');
  }

  toggle.addEventListener('click', () => {
    const opening = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    if (opening) nav.setAttribute('data-open', 'true');
    else nav.removeAttribute('data-open');
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      toggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
  });
})();

/* ── Scroll reveal ─────────────────────────────────────────── */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ── Form ──────────────────────────────────────────────────── */
const emailInput   = document.getElementById('emailInput');
const consentCheck = document.getElementById('consentCheck');
const formError    = document.getElementById('formError');
const formState    = document.getElementById('formState');
const successState = document.getElementById('successState');

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setEmailError(msg) {
  emailInput.classList.add('error');
  formError.textContent = msg;
}

function clearEmailError() {
  emailInput.classList.remove('error');
  formError.textContent = '';
}

emailInput?.addEventListener('input', clearEmailError);

emailInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSubmit();
});

async function handleSubmit() {
  let valid = true;
  clearEmailError();
  consentCheck.classList.remove('error');

  const email = emailInput.value.trim();

  if (!validateEmail(email)) {
    setEmailError('Please enter a valid email address.');
    emailInput.focus();
    valid = false;
  }

  if (!consentCheck.checked) {
    consentCheck.classList.add('error');
    valid = false;
  }

  if (!valid) return;

  /* ── Send to backend ─────────────────────────────────────
     Replace WEBHOOK_URL with your n8n webhook endpoint.
     The payload includes consent timestamp for GDPR audit trail.
     ─────────────────────────────────────────────────────── */
  const WEBHOOK_URL = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/subscribe';

  const payload = {
    email:      email,
    consent:    true,
    consent_ts: new Date().toISOString(),
    source:     'immortal.life',
  };

  /* Optimistic UI — show success immediately, send in background */
  showSuccess();

  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('Webhook error:', res.status, res.statusText);
    }
  } catch (err) {
    /* Network failure — log silently, user already sees success.
       In production consider a retry queue or fallback. */
    console.error('Submission error:', err);
  }
}

function showSuccess() {
  formState.style.display    = 'none';
  successState.style.display = 'flex';
  successState.focus();
}

/* ── Privacy modal ─────────────────────────────────────────── */
const modal = document.getElementById('privacyModal');
const firstFocus = modal?.querySelector('.modal-close');

function openPrivacy(e) {
  document.getElementById('privacyModal').style.display = 'block';
  if (e && e.preventDefault) e.preventDefault();
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  firstFocus?.focus();
}

function closePrivacy() {
  if (!modal) return;
  modal.style.display = '';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePrivacy();
  });
}

firstFocus?.addEventListener('click', closePrivacy);

function bindPrivacyOpenTriggers(el) {
  if (!el) return;
  const handler = (e) => openPrivacy(e);
  el.addEventListener('click', handler, { passive: false });
  el.addEventListener('touchstart', handler, { passive: false });
}

bindPrivacyOpenTriggers(document.querySelector('.privacy-link'));
bindPrivacyOpenTriggers(
  document.querySelector('.site-footer .foot-right > button.foot-link')
);

document.getElementById('submitBtn')?.addEventListener('click', () => {
  handleSubmit();
});

/* Close on Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal?.classList.contains('open')) closePrivacy();
});

/* ── Hero particle canvas ─────────────────────────────────── */
(function initHeroParticles() {
  const canvas = document.getElementById('heroParticles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = [
    'rgba(199,53,114,.48)',
    'rgba(232,109,67,.40)',
    'rgba(197,154,75,.48)',
    'rgba(85,169,175,.38)',
    'rgba(140,117,207,.34)',
  ];
  let particles = [];
  let cssW = 0;
  let cssH = 0;
  let rafId = 0;

  function particleCount() {
    if (reduceMotion) return 38;
    if (window.innerWidth < 700) return 42;
    if (window.innerWidth < 1100) return 62;
    return 86;
  }

  function createParticles(count) {
    return Array.from({ length: count }, (_, index) => ({
      angle: Math.random() * Math.PI * 2,
      radiusX: .10 + Math.random() * .38,
      radiusY: .07 + Math.random() * .28,
      speed: (.000035 + Math.random() * .000055) * (index % 2 ? 1 : -1),
      phase: Math.random() * Math.PI * 2,
      wobble: 5 + Math.random() * 16,
      baseR: .9 + Math.random() * 1.8,
      color: palette[index % palette.length],
      x: 0,
      y: 0,
    }));
  }

  function layoutCanvas() {
    const nextW = canvas.clientWidth;
    const nextH = canvas.clientHeight;
    if (nextW < 2 || nextH < 2) return;
    cssW = nextW;
    cssH = nextH;
    const targetCount = particleCount();
    if (particles.length !== targetCount) particles = createParticles(targetCount);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tick(now) {
    rafId = 0;
    if (document.hidden || cssW < 2 || cssH < 2) return;
    const centerX = cssW * .5;
    const centerY = cssH * .48;
    const tSec = now * .001;
    ctx.clearRect(0, 0, cssW, cssH);
    particles.forEach((particle) => {
      if (!reduceMotion) particle.angle += particle.speed * 16.667;
      const wave = Math.sin(tSec * .42 + particle.phase) * particle.wobble;
      particle.x = centerX + Math.cos(particle.angle) * (particle.radiusX * cssW + wave);
      particle.y = centerY + Math.sin(particle.angle) * (particle.radiusY * cssH + wave * .35);
    });

    const connectionDistance = Math.min(118, Math.max(72, cssW * .075));
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (distance >= connectionDistance) continue;
        const proximity = 1 - distance / connectionDistance;
        ctx.strokeStyle = 'rgba(198,86,126,' + (.075 * proximity) + ')';
        ctx.lineWidth = .7 + proximity * .55;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    particles.forEach((particle) => {
      const breath = .32 * Math.sin(tSec * .85 + particle.phase);
      const radius = Math.max(.6, particle.baseR + breath);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    if (!reduceMotion) rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (!rafId && !document.hidden) rafId = requestAnimationFrame(tick);
  }

  layoutCanvas();
  window.addEventListener('resize', () => {
    layoutCanvas();
    start();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else {
      start();
    }
  });
  start();
})();

window.openPrivacy  = openPrivacy;
window.closePrivacy = closePrivacy;
window.handleSubmit = handleSubmit;

/* ── Living homepage: search, live updates, and return memory ── */
(function initLivingHomepage() {
  const menuButton = document.querySelector('[data-mobile-menu-open]');
  const mobileToggle = document.querySelector('.mobile-nav-toggle');
  menuButton?.addEventListener('click', () => mobileToggle?.click());
  document.querySelector('.mobile-dock a[href="/"]')?.setAttribute('aria-current', 'page');

  const topicRoutes = {
    'rapamycin': 'rapamycin', 'senolytics': 'senolytics', 'epigenetic clocks': 'epigenetic-clocks',
    'exercise': 'exercise', 'caloric restriction': 'caloric-restriction', 'stem cells': 'stem-cells',
    'gene therapy': 'gene-therapy', 'sleep': 'sleep', 'plasma exchange': 'plasma-exchange',
    'glp-1': 'glp-1-therapies', 'metformin': 'metformin', 'nad': 'nad-metabolism'
  };
  document.getElementById('homeSearch')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const rawQuery = String(document.getElementById('homeSearchInput')?.value || '').trim();
    const query = rawQuery.toLowerCase();
    if (!query) return document.getElementById('homeSearchInput')?.focus();
    try {
      const saved = JSON.parse(localStorage.getItem('il_saved_searches') || '[]').filter((item) => item.query.toLowerCase() !== rawQuery.toLowerCase());
      saved.unshift({ query: rawQuery, savedAt: new Date().toISOString() });
      localStorage.setItem('il_saved_searches', JSON.stringify(saved.slice(0, 8)));
    } catch (_) { /* storage is optional */ }
    const exact = topicRoutes[query] || Object.entries(topicRoutes).find(([label]) => label.includes(query) || query.includes(label))?.[1];
    window.location.href = exact ? `/topics/${exact}` : `/topics?search=${encodeURIComponent(query)}`;
  });

  document.querySelector('.home-nav-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[type="search"]');
    const query = String(input?.value || '').trim();
    if (!query) return input?.focus();
    window.location.href = `/topics?search=${encodeURIComponent(query)}`;
  });

  // The search-first homepage has no live feed below the opening screen.
  // Avoid spending reader requests and database IO on content that is not shown.
  if (!document.getElementById('todayGrid') && !document.getElementById('heroDiscoveriesList')) return;

  const previousVisit = localStorage.getItem('il_last_visit');
  localStorage.setItem('il_last_visit', new Date().toISOString());

  function recordKind(item) {
    if (item?.kind) return item.kind;
    const url = String(item?.url || '');
    if (url.includes('/trials/')) return 'trials';
    if (url.includes('/regulatory/')) return 'regulatory';
    if (url.includes('/integrity/')) return 'integrity';
    return 'research';
  }

  function shortCopy(value, limit = 150) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    return clean.length > limit ? `${clean.slice(0, limit - 1).trim()}…` : clean;
  }

  function isUsefulReaderUpdate(item) {
    const title = String(item?.title || '');
    return item?.event_type !== 'quality_state_changed' && !/^publication[- ]quality status changed\s*:/i.test(title);
  }

  function renderToday(feedItems, changeItems, currentTrial, regulatory, regulatoryGuide, regulatoryCoverage, university) {
    const root = document.getElementById('todayGrid');
    if (!root) return;
    const combined = [...changeItems, ...feedItems].filter(isUsefulReaderUpdate).map((item) => ({ ...item, kind: recordKind(item) }));
    const unique = (items) => {
      const seen = new Set();
      return items.filter((item) => { const key = `${item.url || ''}|${item.title || ''}`; if (!key || seen.has(key)) return false; seen.add(key); return true; });
    };
    const developments = unique(combined.filter((item) => item.kind === 'research' || item.kind === 'integrity')).slice(0, 3);
    const trial = currentTrial ? {
      kind: 'trials', title: currentTrial.title,
      content_text: `Registry status: ${String(currentTrial.overall_status || 'not supplied').replaceAll('_', ' ').toLowerCase()}. Last source update ${currentTrial.last_update_date ? new Date(`${currentTrial.last_update_date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : 'date unavailable'}. Registration is not proof of safety or effectiveness.`,
      date_published: currentTrial.last_update_date, url: `/trials/${currentTrial.id}`,
    } : combined.find((item) => item.kind === 'trials');
    const official = regulatory ? {
      kind: 'regulatory', title: regulatory.title, content_text: regulatory.summary,
      date_published: regulatory.published_at, url: `/regulatory/${regulatory.id}`,
    } : regulatoryGuide ? {
      kind: 'regulatory',
      title: `Check health claims with ${regulatoryGuide.name}`,
      content_text: `Use this official ${regulatoryGuide.jurisdiction_name || regulatoryGuide.geographic_scope || 'regulatory'} authority to verify medicine approvals, safety notices, and health-claim rules. Our directory currently covers ${Number(regulatoryCoverage?.authorities || 0).toLocaleString('en')} authorities worldwide.`,
      url: '/regulatory#regulatoryGuideGrid',
    } : {
      kind: 'regulatory',
      title: 'How to verify a longevity health claim',
      content_text: 'Check whether the product is authorised, whether its health claims are allowed, and whether an official safety notice exists. Start with the authority for your country.',
      url: '/regulatory#regulatoryGuideGrid',
    };
    const campus = university ? {
      kind: 'university', title: university.name,
      content_text: `${Number(university.indexed_works_two_year || 0).toLocaleString('en')} recent topic-linked works across ${Number(university.indexed_topic_count || 0)} tracked areas. Activity is not a quality ranking.`,
      date_published: university.updated_at, url: `/universities/${university.slug}`,
    } : { kind: 'university', title: 'University activity is being refreshed', content_text: 'Open the global university index to compare topic breadth and recent research momentum.', url: '/universities' };
    const discoveryFallbacks = [
      { kind: 'research', title: 'Browse the newest longevity research', content_text: 'Open the source-linked research index, sorted by the date supplied by the original scholarly source.', url: '/research' },
      { kind: 'integrity', title: 'See important evidence updates', content_text: 'Review new records, corrections, retractions, trial-status updates, and other automatically detected differences.', url: '/changes' },
      { kind: 'research', title: 'Choose a longevity topic to follow', content_text: 'Start with a plain-language topic guide, then move into matching papers, trials, limitations, and source records.', url: '/topics' },
    ];
    const candidates = [...developments];
    while (candidates.length < 3) candidates.push(discoveryFallbacks[candidates.length]);
    candidates.push(trial || { kind: 'trials', title: 'No new trial status change matched this window', content_text: 'Trial registries remain under automatic monitoring. Open Trial Radar for current registry statuses.', url: '/trials' }, official, campus);
    root.replaceChildren();
    if (!candidates.length) { root.append(Object.assign(document.createElement('article'), { className: 'today-loading', textContent: 'The live index is current; no new eligible records are available in this window.' })); return; }
    candidates.slice(0, 6).forEach((item) => {
      const card = document.createElement('a');
      card.className = 'today-card'; card.dataset.kind = item.kind; card.href = item.url || '/changes';
      const labels = { trials: 'Trial status', integrity: 'Evidence update', regulatory: 'Official guidance', university: 'University momentum', research: 'Development' };
      const label = document.createElement('span'); label.textContent = `${labels[item.kind] || 'Update'} · ${item.date_published ? new Date(item.date_published).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'Latest check'}`;
      const heading = document.createElement('h3'); heading.textContent = shortCopy(item.title, 92);
      const copy = document.createElement('p'); copy.textContent = shortCopy(item.content_text || 'Open the source-linked record to see what is new and why it appears here.');
      card.append(label, heading, copy); root.append(card);
    });
  }

  function renderHeroDiscoveries(feedItems, changeItems) {
    const root = document.getElementById('heroDiscoveriesList');
    if (!root) return;
    const seen = new Set();
    const items = [...changeItems, ...feedItems].filter((item) => {
      const kind = recordKind(item);
      const key = `${item.url || ''}|${item.title || ''}`;
      if (!isUsefulReaderUpdate(item) || !item.title || !item.url || seen.has(key) || !['research', 'integrity'].includes(kind)) return false;
      seen.add(key); return true;
    }).slice(0, 6);
    root.replaceChildren();
    if (!items.length) {
      const fallback = document.createElement('a'); fallback.className = 'hero-discovery'; fallback.href = '/research';
      fallback.append(Object.assign(document.createElement('span'), { textContent: 'Live index' }), Object.assign(document.createElement('strong'), { textContent: 'Browse the newest source-linked longevity research' })); root.append(fallback); return;
    }
    items.forEach((item) => {
      const anchor = document.createElement('a'); anchor.className = 'hero-discovery'; anchor.href = item.url;
      const meta = document.createElement('span'); meta.textContent = item.date_published ? new Date(item.date_published).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : recordKind(item) === 'integrity' ? 'Integrity' : 'New record';
      const title = document.createElement('strong'); title.textContent = shortCopy(item.title, 82);
      anchor.append(meta, title); root.append(anchor);
    });
  }

  const optionalJson = (url, options) => fetch(url, options).then((response) => response.ok ? response.json() : null).catch(() => null);
  const feedPromise = optionalJson('/feed.json');
  const changesPromise = optionalJson('/changes/feed.json');
  const trialPromise = optionalJson(`${window.IL_FN_BASE}/public-intelligence?view=trials&limit=1`, { headers: window.ilFnHeaders() });
  const regulatoryPromise = optionalJson(`${window.IL_FN_BASE}/public-intelligence?view=regulatory&limit=1`, { headers: window.ilFnHeaders() });
  const universityPromise = optionalJson(`${window.IL_FN_BASE}/public-intelligence?view=universities&sort=momentum&limit=1`, { headers: window.ilFnHeaders() });

  renderHeroDiscoveries([], []);
  renderToday([], [], null, null, null, null, null);

  Promise.all([feedPromise, changesPromise]).then(([feed, changes]) => {
    const feedItems = Array.isArray(feed?.items) ? feed.items : [];
    const changeItems = Array.isArray(changes?.items) ? changes.items : [];
    renderHeroDiscoveries(feedItems, changeItems);
    renderToday(feedItems, changeItems, null, null, null, null, null);
  });

  Promise.all([feedPromise, changesPromise, trialPromise, regulatoryPromise, universityPromise]).then(([feed, changes, trialData, regulatoryData, universityData]) => {
    const feedItems = Array.isArray(feed?.items) ? feed.items : [];
    const changeItems = Array.isArray(changes?.items) ? changes.items : [];
    renderToday(
      feedItems,
      changeItems,
      trialData?.trials?.[0],
      regulatoryData?.regulatory?.[0],
      regulatoryData?.regulatory_guides?.[0],
      regulatoryData?.regulatory_coverage,
      universityData?.universities?.[0],
    );
    const status = document.getElementById('homeDataStatus');
    if (status) status.textContent = `Live index checked ${new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}. Every item links to its original record.`;
    if (previousVisit) {
      const count = changeItems.filter((item) => new Date(item.date_published).getTime() > new Date(previousVisit).getTime()).length;
      const banner = document.getElementById('returnBanner');
      if (count > 0 && banner) { document.getElementById('returnCount').textContent = String(count); banner.hidden = false; }
    }
  }).catch(() => {
    const root = document.getElementById('todayGrid');
    if (root) root.innerHTML = '<article class="today-loading">The live summary is temporarily delayed. The research, trial and change pages remain available.</article>';
    const status = document.getElementById('homeDataStatus');
    if (status) status.textContent = 'Live summary delayed. No uncited fallback content has been inserted.';
    renderHeroDiscoveries([], []);
  });
})();
