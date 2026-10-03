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
  assert.match(hub, /Field maps/);
  assert.doesNotMatch(hub, /Interesting enough to share|selected automatically|Generated automatically/);
  assert.match(hub, /intelligence\.js[^<]*number-integrity-v4/);
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
  assert.match(read('desktop-nav.js'), /'\/signals': \{/);
  assert.match(read('vercel.json'), /"source": "\/signals\/:slug"/);
  const map = signals.sitemap();
  for (const story of signals.stories) assert.match(map, new RegExp(`signals/${story.slug}`));
  assert.match(read('api/sitemap.js'), /sitemaps\/signals\.xml/);
});

test('automatic Signals are fact-only, source-linked and explicitly about index activity', () => {
  const html = signals.automaticStory({
    generated_at: '2026-10-03T00:00:00Z',
    story: {
      slug: 'topic-sleep-week-of-2026-09-28', topic_slug: 'sleep',
      title: 'What entered the Sleep evidence map in six weeks?',
      question: 'What source-linked activity entered the immortal.life index for Sleep during the last six weeks?',
      summary: 'The index recorded 12 source-linked changes.', period_end: '2026-10-03', updated_at: '2026-10-03T00:00:00Z',
      intelligence_topics: { name: 'Sleep', domain_name: 'Lifestyle and environment' },
      payload: {
        current_total: 12, previous_total: 7, editorial_score: 88,
        current_counts: { research: 8, trials: 3, regulatory: 1, integrity: 0 },
        previous_counts: { research: 5, trials: 2, regulatory: 0, integrity: 0 },
      },
    },
    events: [{ id: 1, event_type: 'trial_status_changed', record_type: 'trials', record_id: 4, title: 'Example registry update', occurred_at: '2026-10-02T00:00:00Z' }],
  });
  assert.match(html, /Two-window comparison/);
  assert.match(html, /does not measure scientific importance or prove that the field itself accelerated/);
  assert.match(html, /Qualified/);
  assert.match(html, /met the publication rule/);
  assert.doesNotMatch(html, /editorial score/);
  assert.match(html, /\/trials\/4/);
  assert.match(html, /Selected from public-display-approved source metadata/);
  assert.doesNotMatch(html, /Automatically selected/);
});

test('automatic Signal generation is bounded, rights-aware, daily and discoverable', () => {
  const migration = read('supabase/migrations/20261003000100_automatic_signals.sql');
  const sourceDated = read('supabase/migrations/20261003000200_source_dated_automatic_signals.sql');
  assert.match(migration, /source\.public_display_allowed/);
  assert.match(migration, /current_window\.total >= 8/);
  assert.match(migration, /current_window\.record_type_count >= 2/);
  assert.match(migration, /limit 6/);
  assert.match(migration, /immortal-life-automatic-signals/);
  assert.match(migration, /42 6 \* \* \*/);
  assert.match(sourceDated, /source_occurred_at/);
  assert.match(sourceDated, /previous_window\.total >= 3/);
  assert.match(sourceDated, /publication_state = 'withdrawn'/);
  assert.match(read('supabase/functions/public-intelligence/index.ts'), /view === 'signals'/);
  assert.match(read('supabase/functions/notify-indexnow/index.ts'), /signal_stories/);
  assert.match(read('docs/editorial-signals-strategy.md'), /does not ask a language model to invent/i);
});

test('the automatic newsroom uses distinct, source-bounded story formats', () => {
  const migration = read('supabase/migrations/20261003000300_automatic_signal_newsroom.sql');
  const comparableMilestones = read('supabase/migrations/20261003000400_comparable_trial_milestone_signal.sql');
  for (const kind of ['trial-milestones', 'funding-movements', 'integrity-watch', 'evidence-maturity', 'trial-geography', 'university-network', 'topic-connections']) {
    assert.match(migration, new RegExp(kind));
  }
  assert.match(migration, /source\.public_display_allowed/g);
  assert.match(migration, /rights_review_due_at/g);
  assert.match(migration, /Grant counts do not measure total spending, scientific quality, outcomes or impact/);
  assert.match(migration, /does not establish causality/);
  assert.match(migration, /select public\.refresh_automatic_signals\(\)/);
  assert.match(comparableMilestones, /Same registry-update definition/);
  assert.match(comparableMilestones, /generate_trial_milestone_signal/);
  const css = read('signals.css');
  for (const visual of ['milestone', 'capital', 'integrity', 'maturity', 'geography', 'universities', 'connections']) {
    assert.match(css, new RegExp(`signal-auto-card--${visual}`));
  }
});

test('newsroom pages explain observable movement without turning it into advice', () => {
  const html = signals.automaticNewsroomStory({
    generated_at: '2026-10-03T00:00:00Z',
    story: {
      story_kind: 'funding-movements', title: 'Where did new longevity grants become visible?',
      dek: 'Official direct grants.', question: 'Which grants started?', summary: '12 grants are visible.',
      updated_at: '2026-10-03T00:00:00Z', payload: {
        primary_value: 12,
        metrics: [{ value: 12, label: 'direct official grants', note: 'Source dated', href: '/funding' }],
        bars: [{ label: 'Cellular senescence', value: 5, href: '/topics/cellular-senescence' }],
        items: [{ eyebrow: 'NIH RePORTER', title: 'Example award', href: 'https://example.org/grant', note: 'Official record' }],
        scope: 'Official grants in 42 days.',
        meaning: 'Grant counts do not measure spending, quality or impact.',
      },
    }, events: [],
  });
  assert.match(html, /New funding became visible/);
  assert.match(html, /<strong>12<\/strong><span>direct official grants/);
  assert.match(html, /https:\/\/example\.org\/grant/);
  assert.match(html, /Grant counts do not measure spending, quality or impact/);
  assert.match(html, /Missing or ambiguous cohorts remain unpublished/);
});
