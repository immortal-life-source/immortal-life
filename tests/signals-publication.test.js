const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const signals = require('../api/signals.js');
const publicPages = require('../api/public-page.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Signals is a permanent source-linked publication with three launch stories', () => {
  assert.deepEqual(signals.stories.map((story) => story.slug), [
    'global-longevity-trial-map',
    'longevity-trial-results-gap',
    'where-longevity-funding-flows',
  ]);
  const hub = signals.shell({
    title: 'Signals', description: 'Source-linked data stories', canonical: 'https://www.immortal.life/signals',
    eyebrow: 'Immortal.life Signals', heading: 'The stories hidden inside longevity data.', body: signals.hubBody(),
  });
  for (const story of signals.stories) assert.match(hub, new RegExp(`/signals/${story.slug}`));
  assert.match(hub, /Interesting enough to share\. Careful enough to cite\./);
  assert.match(hub, /Ask about the data/);
  assert.match(read('docs/editorial-signals-strategy.md'), /must not manufacture commentary/i);
});

test('trial map distinguishes registrations, country links and planned enrolment', () => {
  const html = signals.activeTrialStory(signals.stories[0], {
    generated_at: '2026-10-03T00:00:00Z', total: 2, complete: true,
    rows: [
      { id: 1, external_id: 'NCT1', title: 'Ageing exercise trial', overall_status: 'Recruiting', sponsor: 'Example University', enrollment: 120, countries: ['United States'], phases: ['PHASE2'] },
      { id: 2, external_id: 'NCT2', title: 'Healthspan trial', overall_status: 'Active, not recruiting', sponsor: 'Example University', enrollment: 80, countries: ['Canada', 'United States'], phases: ['PHASE1'] },
    ],
  });
  assert.match(html, /2 active or recruiting registrations/);
  assert.match(html, /200<\/strong><span>planned enrolment/);
  assert.match(html, /Multinational studies can appear in more than one country/);
  assert.match(html, /Registration does not establish|do not show effectiveness/i);
  assert.match(html, /\/trials\?status=active&amp;country=United%20States/);
});

test('results-gap story preserves the non-accusatory interpretation boundary', () => {
  const html = signals.resultsGapStory(signals.stories[1], {
    generated_at: '2026-10-03T00:00:00Z',
    definition: { cohort: 'Completed eligible trial registrations.' },
    summary: { completed_trials: 10, results_posted: 4, possible_gaps: 3, within_window: 2, results_coverage_percent: 40, oldest_gap_days: 900 },
    cohorts: [{ year: 2024, completed: 10, results_posted: 4, possible_gaps: 3, within_window: 2 }],
    trials: [{ id: 9, external_id: 'NCT9', title: 'Example completed trial', sponsor: 'Example sponsor', result_state: 'possible-gap', days_since_completion: 1265 }],
    interpretation_notice: 'A possible gap is not evidence of misconduct or legal non-compliance.',
  });
  assert.match(html, /No registry results.*not the same as.*no results anywhere/s);
  assert.match(html, /not evidence of misconduct or legal non-compliance/);
  assert.match(html, /\/trials\/9/);
});

test('funding story keeps direct grants separate from acknowledgements', () => {
  const html = signals.fundingStory(signals.stories[2], {
    generated_at: '2026-10-03T00:00:00Z', direct_grant_total_matching: 25,
    direct_grants: [{ source_name: 'NIH RePORTER', title: 'Example grant', source_url: 'https://example.org/grant', recipient_name: 'University A', recipient_country_name: 'United States' }],
    overview: {
      summary: { awards: 80, funders: 12, linked_publications: 55 },
      leading_funders: [{ funder_id: 'F123', funder_name: 'Example Funder', awards: 20 }],
      leading_topics: [{ slug: 'exercise', name: 'Exercise', awards: 15 }],
      leading_institutions: [{ slug: 'university-a', name: 'University A', awards: 10 }],
      cohorts: [{ year: 2025, awards: 22 }],
    },
    scope_notice: 'Counts do not measure total spending or scientific impact.',
  });
  assert.match(html, /25 direct official grant records/);
  assert.match(html, /80 publication-linked award entities/);
  assert.match(html, /Counts do not measure total spending or scientific impact/);
  assert.match(html, /https:\/\/example\.org\/grant/);
});

test('Signals is discoverable from briefings, navigation and a dedicated sitemap', () => {
  const injected = publicPages.injectSignalsFeature('<main></main><nav class="next-journey"></nav>');
  assert.match(injected, /Stories hidden inside longevity data/);
  assert.match(injected, /href="\/signals"/);
  assert.match(read('desktop-nav.js'), /Immortal\.life Signals/);
  assert.match(read('vercel.json'), /"source": "\/signals\/:slug"/);
  const map = signals.sitemap();
  for (const story of signals.stories) assert.match(map, new RegExp(`signals/${story.slug}`));
  assert.match(read('api/sitemap.js'), /sitemaps\/signals\.xml/);
});
