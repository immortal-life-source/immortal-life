'use strict';

(function initDesktopNavigationPreview() {
  const desktopQuery = window.matchMedia('(min-width: 861px) and (hover: hover) and (pointer: fine)');
  if (!desktopQuery.matches) return;

  const menus = {
    '/changes': {
      eyebrow: 'Live evidence movement',
      title: 'See what changed—not just what exists.',
      copy: 'Start with the newest source-linked activity, then move directly into the evidence stream that matters.',
      action: ['Open all news', '/changes'],
      links: [
        ['Latest changes', 'Research, trials and official notices', '/changes'],
        ['New research', 'Recently indexed publications', '/research'],
        ['Trial updates', 'New and updated registrations', '/trials'],
        ['Regulatory notices', 'Official safety and regulatory signals', '/regulatory'],
        ['Corrections & integrity', 'Corrections, retractions and withdrawals', '/integrity'],
      ],
    },
    '/topics': {
      eyebrow: '180 Living Evidence Dossiers',
      title: 'Explore longevity through nine clear domains.',
      copy: 'Each domain opens a filtered catalogue of mechanisms, interventions, measurements and healthspan questions.',
      action: ['Browse all topics', '/topics'],
      links: [
        ['Ageing mechanisms', 'Cells, damage, repair and signalling', '/topics?domain=ageing-mechanisms'],
        ['Geroscience interventions', 'Drugs and therapeutic strategies', '/topics?domain=geroscience-interventions'],
        ['Nutrition & metabolism', 'Diet, nutrients and metabolic health', '/topics?domain=nutrition-metabolism'],
        ['Lifestyle & environment', 'Exercise, sleep and exposures', '/topics?domain=lifestyle-environment'],
        ['Biomarkers & measurement', 'Biological age and functional signals', '/topics?domain=biomarkers-measurement'],
        ['Organs & systems', 'How tissues and systems age', '/topics?domain=organs-systems'],
        ['Healthspan & clinical ageing', 'Function, resilience and care', '/topics?domain=healthspan-clinical-ageing'],
        ['Genetics, regeneration & futures', 'Frontier and regenerative technologies', '/topics?domain=genetics-regeneration-futures'],
        ['Population longevity & prevention', 'Life-course and population evidence', '/topics?domain=population-longevity-prevention'],
      ],
    },
    '/trials': {
      eyebrow: 'Global Trial Radar',
      title: 'Move from the whole registry landscape to the useful cohort.',
      copy: 'Open recruiting studies, phases, countries and result-availability questions without rebuilding the filter yourself.',
      action: ['Search all trials', '/trials'],
      links: [
        ['Active & recruiting', 'Studies currently open or active', '/trials?status=active'],
        ['Phase 1', 'Early human study registrations', '/trials?phase=PHASE1'],
        ['Phase 2', 'Exploratory clinical studies', '/trials?phase=PHASE2'],
        ['Phase 3', 'Larger confirmatory studies', '/trials?phase=PHASE3'],
        ['United States', 'Trials with a US registry location', '/trials?country=United%20States'],
        ['United Kingdom', 'Trials with a UK registry location', '/trials?country=United%20Kingdom'],
        ['Results Gap Monitor', 'Completed trials and visible results', '/trials/results-gap'],
        ['Results posted', 'Structured results visible in registries', '/trials/results-gap?status=results-posted'],
        ['Possible reporting gaps', 'Completed over 12 months ago', '/trials/results-gap?status=possible-gap'],
      ],
    },
    '/universities': {
      eyebrow: 'Global University Research Index',
      title: 'See where longevity research is most visible.',
      copy: 'Jump into leading research countries, compare institutions, or rank the index by activity, breadth and momentum.',
      action: ['Open the global index', '/universities'],
      links: [
        ['United States', 'Browse source-matched US universities', '/universities?country=US'],
        ['United Kingdom', 'Browse source-matched UK universities', '/universities?country=GB'],
        ['China', 'Browse source-matched Chinese universities', '/universities?country=CN'],
        ['Germany', 'Browse source-matched German universities', '/universities?country=DE'],
        ['Canada', 'Browse source-matched Canadian universities', '/universities?country=CA'],
        ['Japan', 'Browse source-matched Japanese universities', '/universities?country=JP'],
        ['Australia', 'Browse source-matched Australian universities', '/universities?country=AU'],
        ['Research momentum', 'Order by recent indexed activity', '/universities?sort=momentum'],
        ['Compare universities', 'Select up to three institutions', '/universities#universityControls'],
      ],
    },
    '/research': {
      eyebrow: 'Research Intelligence',
      title: 'Read the evidence at the level you need.',
      copy: 'Move directly to human research, randomized studies, syntheses, open-access records or disclosed funding links.',
      action: ['Search all research', '/research'],
      links: [
        ['Human studies', 'Research involving human participants', '/research?evidence=human'],
        ['Randomized studies', 'Human randomized research', '/research?evidence=randomized'],
        ['Evidence syntheses', 'Reviews and connected evidence', '/research?evidence=human-synthesis'],
        ['Open access', 'Records marked openly accessible', '/research?access=open'],
        ['Newest research', 'The latest eligible publications', '/research'],
        ['Evidence Compare', 'Compare two longevity topics', '/compare'],
      ],
    },
    '/funding': {
      eyebrow: 'Longevity Funding Intelligence',
      title: 'See who is funding the field—and where the money appears.',
      copy: 'Explore official grant records separately from funding acknowledgements attached to longevity publications.',
      action: ['Open Funding Radar', '/funding'],
      links: [
        ['Funding Radar', 'Search grants and publication-linked awards', '/funding'],
        ['Direct grants', 'Official grant records with dates and reported amounts', '/funding#directGrantSection'],
        ['Funder directory', 'Browse source-backed funding organizations', '/funders'],
        ['Leading funders', 'See the most visible funders in indexed records', '/funding#fundingLandscape'],
        ['Funding by topic', 'Filter funding across 180 longevity topics', '/funding#fundingControls'],
        ['Funding and universities', 'Follow awards to connected institutions', '/funding#fundingList'],
      ],
    },
    '/signals': {
      eyebrow: 'Longevity data stories',
      title: 'See the movements worth opening.',
      copy: 'Read concise, source-linked views of changes across trials, funding, research and institutions.',
      action: ['Open latest Signals', '/signals'],
      links: [
        ['Latest Signals', 'New movements across the longevity index', '/signals'],
        ['Global Trial Map', 'Where active longevity trials are visible', '/signals/global-longevity-trial-map'],
        ['Trial Results Gap', 'Completion versus visible registry results', '/signals/longevity-trial-results-gap'],
        ['Funding Map', 'Funders, fields and connected institutions', '/signals/where-longevity-funding-flows'],
        ['Weekly briefings', 'Concise source-linked field updates', '/briefings'],
      ],
    },
    '/you': {
      eyebrow: 'Your Longevity Watch',
      title: 'Turn the global index into your own research radar.',
      copy: 'Follow the topics you care about privately, revisit dossiers and choose a source-linked weekly watch.',
      action: ['Open Longevity Watch', '/you'],
      links: [
        ['Build your watchlist', 'Follow up to 20 topics in this browser', '/you#watchBuilderTitle'],
        ['Your followed topics', 'Return to saved evidence dossiers', '/you#watchSavedTitle'],
        ['Weekly topic watch', 'Receive meaningful source-linked updates', '/you#watchEmailTitle'],
        ['Choose a topic', 'Browse all 180 evidence dossiers', '/topics'],
        ['Find trials', 'Search by status, phase and country', '/trials'],
        ['Compare evidence', 'Put two topics side by side', '/compare'],
      ],
    },
    '/resources': {
      eyebrow: 'Sources, safety & provenance',
      title: 'Check the authority behind the evidence.',
      copy: 'Find official sources, safety notices, research-integrity updates and reusable public data in one place.',
      action: ['Open the source directory', '/resources'],
      links: [
        ['Global Source Directory', 'Registries, regulators, reviews and datasets', '/resources'],
        ['Regulatory & Safety', 'Official notices, labels, recalls and alerts', '/regulatory'],
        ['Corrections & Retractions', 'Research-integrity notices', '/integrity'],
        ['Public Data & Feeds', 'Downloads and machine-readable updates', '/data'],
        ['Quality & Methodology', 'How records are matched and published', '/methodology'],
      ],
    },
    '/methodology': {
      eyebrow: 'About immortal.life',
      title: 'Understand the system, its boundaries and its data.',
      copy: 'See how records are collected, matched, checked, disclosed and made available for responsible reuse.',
      action: ['How it works', '/methodology'],
      links: [
        ['Methodology', 'How records enter the public index', '/methodology'],
        ['Automation', 'What is produced without human review', '/automation'],
        ['Quality telemetry', 'Publication checks and limitations', '/quality'],
        ['Coverage reports', 'Current public index activity', '/reports'],
        ['Data & feeds', 'Downloads, APIs and public feeds', '/data'],
        ['Privacy', 'How visitor and subscriber data is handled', '/privacy'],
        ['Contact', 'Reach the immortal.life project', 'mailto:hello@immortal.life'],
      ],
    },
  };

  const navs = document.querySelectorAll('.s1-nav, .intel-nav, .pilot-nav, .m-member-nav');
  navs.forEach((nav, navIndex) => {
    const top = nav.querySelector('.s1-nav-top, .intel-nav-top') || nav;
    const triggers = [...top.querySelectorAll(':scope > a')].filter((anchor) => menus[new URL(anchor.href, location.href).pathname]);
    if (!triggers.length) return;

    const panel = document.createElement('section');
    panel.className = 'desktop-nav-preview';
    panel.id = `desktopNavPreview${navIndex || ''}`;
    panel.setAttribute('aria-label', 'Navigation preview');
    panel.hidden = true;
    panel.innerHTML = '<div class="desktop-nav-preview__intro"><span></span><h2></h2><p></p><a></a></div><div class="desktop-nav-preview__links"></div>';
    nav.append(panel);

    const eyebrow = panel.querySelector('.desktop-nav-preview__intro > span');
    const heading = panel.querySelector('h2');
    const copy = panel.querySelector('p');
    const action = panel.querySelector('.desktop-nav-preview__intro > a');
    const links = panel.querySelector('.desktop-nav-preview__links');
    let activeTrigger = null;
    let closeTimer = 0;
    let hideTimer = 0;

    function render(trigger) {
      const key = new URL(trigger.href, location.href).pathname;
      const menu = menus[key];
      if (!menu) return;
      window.clearTimeout(closeTimer);
      window.clearTimeout(hideTimer);
      activeTrigger?.removeAttribute('aria-expanded');
      activeTrigger = trigger;
      trigger.setAttribute('aria-expanded', 'true');
      eyebrow.textContent = menu.eyebrow;
      heading.textContent = menu.title;
      copy.textContent = menu.copy;
      action.textContent = `${menu.action[0]} →`;
      action.href = menu.action[1];
      links.replaceChildren(...menu.links.map(([label, detail, href]) => {
        const link = document.createElement('a');
        const strong = document.createElement('strong');
        const span = document.createElement('span');
        strong.textContent = label;
        span.textContent = detail;
        link.href = href;
        link.append(strong, span);
        return link;
      }));
      panel.hidden = false;
      // Force one layout after removing `hidden` so the very short transition
      // is reliable for both pointer hover and keyboard focus.
      void panel.offsetWidth;
      panel.dataset.open = 'true';
    }

    function close(immediate = false) {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        panel.dataset.open = 'false';
        activeTrigger?.setAttribute('aria-expanded', 'false');
        activeTrigger = null;
        hideTimer = window.setTimeout(() => { panel.hidden = true; }, immediate ? 0 : 130);
      }, immediate ? 0 : 90);
    }

    triggers.forEach((trigger) => {
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-controls', panel.id);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('pointerenter', () => render(trigger));
      trigger.addEventListener('focus', () => render(trigger));
    });
    nav.addEventListener('pointerleave', () => close());
    nav.addEventListener('pointerenter', () => window.clearTimeout(closeTimer));
    nav.addEventListener('focusout', (event) => {
      if (!nav.contains(event.relatedTarget)) close();
    });
    nav.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        const returnFocus = activeTrigger;
        close(true);
        returnFocus?.focus();
      }
    });
  });
})();
