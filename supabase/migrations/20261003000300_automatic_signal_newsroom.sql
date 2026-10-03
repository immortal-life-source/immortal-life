-- Expand Signals into a deterministic, source-linked newsroom. Each format
-- reports a different kind of observable movement without inferring efficacy,
-- safety, causality, scientific quality or institutional merit.

alter table public.signal_stories drop constraint if exists signal_stories_story_kind_check;
alter table public.signal_stories add constraint signal_stories_story_kind_check
  check (story_kind in (
    'topic-pulse', 'trial-milestones', 'funding-movements', 'integrity-watch',
    'evidence-maturity', 'trial-geography', 'university-network', 'topic-connections'
  ));
alter table public.signal_stories alter column topic_slug drop not null;
alter table public.signal_stories drop constraint if exists signal_stories_topic_slug_period_end_key;
create unique index if not exists signal_stories_kind_topic_period_key
  on public.signal_stories (story_kind, coalesce(topic_slug, ''), period_end);
create index if not exists signal_stories_kind_publication_idx
  on public.signal_stories (story_kind, publication_state, period_end desc);

create or replace function public.generate_signal_newsroom()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date := date_trunc('week', now() at time zone 'utc')::date;
  affected integer := 0;
  written integer := 0;
begin
  update public.signal_stories
  set publication_state = 'withdrawn', updated_at = now()
  where story_kind <> 'topic-pulse' and period_end >= week_start;

  -- Trial milestones: current registry state for trials with a genuine recent
  -- source update. Backfill timestamps are never used as the news date.
  with recent as (
    select distinct on (trial.id)
      event.id as event_id, trial.id, trial.title, trial.overall_status,
      trial.last_update_date, trial.countries, trial.source_url
    from public.intelligence_change_events event
    join public.clinical_trials trial on event.record_type = 'trials' and trial.id = event.record_id
    join public.content_sources source on source.id = trial.source_id
    where event.event_type in ('new_trial', 'trial_status_changed')
      and trial.publication_state = 'published'
      and trial.last_update_date >= current_date - 41
      and trial.last_update_date <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
    order by trial.id, event.occurred_at desc, event.id desc
  ), previous_count as (
    select count(distinct trial.id)::integer as total
    from public.clinical_trials trial
    join public.content_sources source on source.id = trial.source_id
    where trial.publication_state = 'published'
      and trial.last_update_date >= current_date - 83
      and trial.last_update_date < current_date - 41
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), rollup as (
    select count(*)::integer as total,
      count(*) filter (where lower(overall_status) = 'recruiting')::integer as recruiting,
      count(*) filter (where lower(overall_status) like '%active%not recruiting%')::integer as active_not_recruiting,
      count(*) filter (where lower(overall_status) = 'completed')::integer as completed,
      coalesce((array_agg(event_id order by last_update_date desc, event_id desc))[1:12], '{}') as event_ids
    from recent
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'trial-milestones-week-of-' || week_start, 'trial-milestones', current_date - 41, current_date,
    'Which longevity trials reached a visible registry milestone?',
    'A source-linked ledger of recently updated trial registrations, their current status and the countries shown in the registry.',
    'Which longevity-related trial registrations changed during the last six weeks?',
    rollup.total || ' trial registrations carry a source update in this six-week window. Current registry status is descriptive and does not establish results, effectiveness or safety.',
    jsonb_build_object(
      'visual_type', 'milestones', 'primary_value', rollup.total, 'previous_total', previous_count.total,
      'event_ids', to_jsonb(rollup.event_ids),
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'recently updated registrations', 'note', 'Source-dated six-week window', 'href', '/trials'),
        jsonb_build_object('value', rollup.recruiting, 'label', 'currently recruiting', 'note', 'Current registry status', 'href', '/trials?status=Recruiting'),
        jsonb_build_object('value', rollup.completed, 'label', 'currently completed', 'note', 'Results may or may not be posted', 'href', '/trials?status=Completed'),
        jsonb_build_object('value', previous_count.total, 'label', 'registrations in prior window', 'note', 'Comparison, not a growth claim', 'href', '/trials')
      ),
      'bars', jsonb_build_array(
        jsonb_build_object('label', 'Recruiting', 'value', rollup.recruiting),
        jsonb_build_object('label', 'Active, not recruiting', 'value', rollup.active_not_recruiting),
        jsonb_build_object('label', 'Completed', 'value', rollup.completed),
        jsonb_build_object('label', 'Other current status', 'value', greatest(0, rollup.total - rollup.recruiting - rollup.active_not_recruiting - rollup.completed))
      ),
      'scope', 'Published trial registrations with an official registry update date inside the latest 42-day window.',
      'meaning', 'A registration milestone describes the registry record. It does not show that an intervention worked, was safe, or produced a published result.'
    ), 'published', now(), now()
  from rollup cross join previous_count where rollup.total >= 3
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- Funding movements: direct grants only. Publication acknowledgements are
  -- intentionally excluded from this newsroom edition.
  with recent as (
    select direct_grant.source_id, direct_grant.source_grant_id, direct_grant.title, direct_grant.funder_name,
      direct_grant.recipient_name, direct_grant.recipient_country_name, direct_grant.start_date,
      direct_grant.source_url, source.name as source_name
    from public.funding_grants direct_grant
    join public.content_sources source on source.id = direct_grant.source_id
    where direct_grant.start_date >= current_date - 41 and direct_grant.start_date <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), topic_counts as (
    select topic.slug, topic.name, count(*)::integer as value
    from recent direct_grant
    join public.funding_grant_topics link using (source_id, source_grant_id)
    join public.intelligence_topics topic on topic.slug = link.topic_slug
    group by topic.slug, topic.name order by value desc, topic.name limit 8
  ), rollup as (
    select count(*)::integer as total, count(distinct funder_name)::integer as funders,
      count(distinct recipient_country_name) filter (where recipient_country_name is not null)::integer as countries
    from recent
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'funding-movements-week-of-' || week_start, 'funding-movements', current_date - 41, current_date,
    'Where did new longevity grants become visible?',
    'Official, directly sourced grants connected to longevity topics—kept separate from publication funding acknowledgements.',
    'Which official longevity-related grants started during the last six weeks?',
    rollup.total || ' direct grants from approved official feeds have a start date in this window, involving ' || rollup.funders || ' named funders.',
    jsonb_build_object(
      'visual_type', 'funding', 'primary_value', rollup.total,
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'direct official grants', 'note', 'Start date in six-week window', 'href', '/funding#directGrantSection'),
        jsonb_build_object('value', rollup.funders, 'label', 'named funders', 'note', 'Not a measure of influence', 'href', '/funders'),
        jsonb_build_object('value', rollup.countries, 'label', 'recipient countries', 'note', 'Where location is reported', 'href', '/funding'),
        jsonb_build_object('value', (select count(*) from topic_counts), 'label', 'leading topic connections', 'note', 'Source-matched fields', 'href', '/topics')
      ),
      'bars', coalesce((select jsonb_agg(jsonb_build_object('label', name, 'value', value, 'href', '/topics/' || slug) order by value desc, name) from topic_counts), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'eyebrow', source_name || ' · ' || coalesce(start_date::text, 'date unavailable'),
        'title', title, 'href', source_url,
        'note', funder_name || case when recipient_name is not null then ' → ' || recipient_name else '' end
      ) order by start_date desc, title) from (select * from recent order by start_date desc, title limit 12) sample), '[]'::jsonb),
      'scope', 'Direct official grant records whose source start date falls inside the latest 42-day window.',
      'meaning', 'Grant counts do not measure total spending, scientific quality, outcomes or impact. Different currencies are not combined.'
    ), 'published', now(), now()
  from rollup where rollup.total >= 3
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- Integrity notices: reproduce the issuing source's action type without
  -- inferring misconduct, intent or the validity of other work.
  with recent as (
    select integrity.id, integrity.event_type, integrity.title, integrity.source_url,
      coalesce(integrity.announced_on, integrity.detected_at::date) as source_date, source.name as source_name
    from public.research_integrity_events integrity
    join public.content_sources source on source.id = integrity.source_id
    where integrity.publication_state = 'published'
      and coalesce(integrity.announced_on, integrity.detected_at::date) >= current_date - 41
      and coalesce(integrity.announced_on, integrity.detected_at::date) <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), rollup as (
    select count(*)::integer as total,
      count(*) filter (where event_type = 'retraction')::integer as retractions,
      count(*) filter (where event_type = 'correction')::integer as corrections,
      count(*) filter (where event_type = 'expression-of-concern')::integer as concerns
    from recent
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'integrity-watch-week-of-' || week_start, 'integrity-watch', current_date - 41, current_date,
    'Which official corrections and integrity notices appeared?',
    'A neutral ledger of source-issued corrections, retractions, withdrawals and expressions of concern connected to the longevity index.',
    'Which formal research-integrity actions became visible during the last six weeks?',
    rollup.total || ' source-issued integrity notices fall inside this six-week window. Each label repeats the action type supplied by the issuing source.',
    jsonb_build_object(
      'visual_type', 'integrity', 'primary_value', rollup.total,
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'official notices', 'note', 'All action types', 'href', '/integrity'),
        jsonb_build_object('value', rollup.corrections, 'label', 'corrections', 'note', 'As classified by the source', 'href', '/integrity'),
        jsonb_build_object('value', rollup.retractions, 'label', 'retractions', 'note', 'As classified by the source', 'href', '/integrity'),
        jsonb_build_object('value', rollup.concerns, 'label', 'expressions of concern', 'note', 'As classified by the source', 'href', '/integrity')
      ),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'eyebrow', replace(event_type, '-', ' ') || ' · ' || source_date::text,
        'title', title, 'href', source_url, 'note', source_name
      ) order by source_date desc, id desc) from (select * from recent order by source_date desc, id desc limit 12) sample), '[]'::jsonb),
      'scope', 'Formal integrity events from approved public sources with an announcement or detection date inside the latest 42-day window.',
      'meaning', 'A notice is not an independent finding of misconduct, and it does not determine the reliability of unrelated work, a field, an institution or a person.'
    ), 'published', now(), now()
  from rollup where rollup.total >= 1
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- Evidence maturity: the phase distribution visible among genuinely recent
  -- registry updates. This is not called progress and makes no outcome claim.
  with recent as (
    select distinct trial.id, trial.phases, trial.overall_status
    from public.clinical_trials trial
    join public.content_sources source on source.id = trial.source_id
    where trial.publication_state = 'published'
      and trial.last_update_date >= current_date - 41 and trial.last_update_date <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), phase_counts as (
    select phase as label, count(*)::integer as value
    from recent cross join lateral unnest(phases) phase
    where nullif(trim(phase), '') is not null
    group by phase order by value desc, phase
  ), topic_counts as (
    select topic.slug, topic.name, count(distinct recent.id)::integer as value
    from recent join public.clinical_trial_topics link on link.clinical_trial_id = recent.id and link.is_published
    join public.intelligence_topics topic on topic.slug = link.topic_slug
    group by topic.slug, topic.name order by value desc, topic.name limit 8
  ), rollup as (select count(*)::integer as total from recent)
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'evidence-maturity-week-of-' || week_start, 'evidence-maturity', current_date - 41, current_date,
    'Which clinical phases are visible in recently updated longevity trials?',
    'A phase-by-phase view of recently updated trial registrations, linked back to the registry records and their topic dossiers.',
    'What clinical-development stages appear in longevity trial registrations updated during the last six weeks?',
    rollup.total || ' recently updated registrations form this phase snapshot. Phase describes trial design and does not indicate success.',
    jsonb_build_object(
      'visual_type', 'maturity', 'primary_value', rollup.total,
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'recently updated trials', 'note', 'Source-dated window', 'href', '/trials'),
        jsonb_build_object('value', (select count(*) from phase_counts), 'label', 'reported phase labels', 'note', 'Some trials report none or several', 'href', '/trials'),
        jsonb_build_object('value', (select count(*) from topic_counts), 'label', 'leading topic connections', 'note', 'Top fields in this snapshot', 'href', '/topics'),
        jsonb_build_object('value', (select count(*) from recent where cardinality(phases) = 0), 'label', 'without a phase label', 'note', 'Often expected outside drug phases', 'href', '/trials')
      ),
      'bars', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value) order by value desc, label) from phase_counts), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(jsonb_build_object('label', name, 'value', value, 'href', '/topics/' || slug) order by value desc, name) from topic_counts), '[]'::jsonb),
      'scope', 'Published trial registrations with an official last-update date inside the latest 42-day window.',
      'meaning', 'Trial phase describes design and development stage. It does not demonstrate effectiveness, safety, completion or regulatory approval.'
    ), 'published', now(), now()
  from rollup where rollup.total >= 5
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- Trial geography: current locations on recent registry records. This avoids
  -- claiming first entry or expansion when historical registry coverage varies.
  with recent as (
    select distinct trial.id, trial.countries
    from public.clinical_trials trial
    join public.content_sources source on source.id = trial.source_id
    where trial.publication_state = 'published'
      and trial.last_update_date >= current_date - 41 and trial.last_update_date <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), country_counts as (
    select country as label, count(*)::integer as value
    from recent cross join lateral unnest(countries) country
    where nullif(trim(country), '') is not null
    group by country order by value desc, country
  ), rollup as (
    select count(*)::integer as total,
      count(*) filter (where cardinality(countries) > 1)::integer as multinational
    from recent
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'trial-geography-week-of-' || week_start, 'trial-geography', current_date - 41, current_date,
    'Where are recently updated longevity trials registered?',
    'A country map built from locations listed in recently updated trial registrations—not a map of completed participation or access.',
    'Which countries appear in longevity trial registrations updated during the last six weeks?',
    (select count(*) from country_counts) || ' country labels appear across ' || rollup.total || ' recently updated registrations.',
    jsonb_build_object(
      'visual_type', 'geography', 'primary_value', (select count(*) from country_counts),
      'metrics', jsonb_build_array(
        jsonb_build_object('value', (select count(*) from country_counts), 'label', 'country labels', 'note', 'Top visible registry locations', 'href', '/trials'),
        jsonb_build_object('value', rollup.total, 'label', 'recently updated trials', 'note', 'Source-dated window', 'href', '/trials'),
        jsonb_build_object('value', rollup.multinational, 'label', 'multi-country registrations', 'note', 'Listed in more than one country', 'href', '/trials'),
        jsonb_build_object('value', (select coalesce(max(value), 0) from country_counts), 'label', 'largest visible country cohort', 'note', 'Registrations, not participants', 'href', '/trials')
      ),
      'bars', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'href', '/trials?country=' || replace(label, ' ', '%20')) order by value desc, label) from (select * from country_counts order by value desc, label limit 20) visible_countries), '[]'::jsonb),
      'scope', 'Country labels listed in published trial registrations with an official update date inside the latest 42-day window.',
      'meaning', 'A location on a registration does not prove recruitment, participation, treatment availability or research quality. Multinational trials appear under every listed country.'
    ), 'published', now(), now()
  from rollup where (select count(*) from country_counts) >= 5
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- University network: a current activity map, explicitly not a league table.
  with ranked as (
    select university.slug, university.name, university.country_name,
      sum(metric.works_five_year)::integer as works_five_year,
      sum(metric.works_two_year)::integer as works_two_year,
      count(*) filter (where metric.works_five_year > 0)::integer as topics,
      max(metric.last_synced_at) as refreshed_at
    from public.university_research_institutions university
    join public.university_research_topic_metrics metric on metric.openalex_id = university.openalex_id
    where university.is_eligible
    group by university.slug, university.name, university.country_name
    having sum(metric.works_five_year) > 0
    order by works_two_year desc, works_five_year desc, university.name
    limit 10
  ), rollup as (
    select count(*)::integer as total, count(distinct country_name)::integer as countries,
      sum(works_five_year)::bigint as works_five_year, max(refreshed_at) as refreshed_at from ranked
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'university-network-week-of-' || week_start, 'university-network', current_date - 41, current_date,
    'Which universities are most visible in the current longevity index?',
    'A source-matched activity map of universities, countries and topic breadth—not a ranking of teaching, quality or institutional performance.',
    'Which institutions currently connect the largest amount of indexed longevity research?',
    rollup.total || ' institutions form this compact activity view across ' || rollup.countries || ' represented countries.',
    jsonb_build_object(
      'visual_type', 'universities', 'primary_value', rollup.total,
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'institutions shown', 'note', 'Compact current view', 'href', '/universities'),
        jsonb_build_object('value', rollup.countries, 'label', 'represented countries', 'note', 'Among institutions shown', 'href', '/universities'),
        jsonb_build_object('value', rollup.works_five_year, 'label', 'five-year topic-work links', 'note', 'Links can overlap across topics', 'href', '/universities'),
        jsonb_build_object('value', breadth.max_topics, 'label', 'widest topic breadth', 'note', 'Indexed topics, not teaching scope', 'href', '/universities')
      ),
      'bars', coalesce((select jsonb_agg(jsonb_build_object('label', name, 'value', works_two_year, 'href', '/universities/' || slug, 'note', coalesce(country_name, 'Location not reported')) order by works_two_year desc, name) from ranked), '[]'::jsonb),
      'scope', 'Eligible OpenAlex-resolved universities ordered by source-matched rolling two-year longevity work links in the current index.',
      'meaning', 'Indexed activity is not a ranking of scientific quality, teaching, clinical care, impact or institutional performance. Topic links can overlap.'
    ), 'published', now(), now()
  from rollup cross join (select coalesce(max(topics), 0) as max_topics from ranked) breadth where rollup.total >= 5
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  -- Topic connections: co-occurrence within recent source-dated research. It
  -- never labels co-occurrence as causality, agreement or mechanistic proof.
  with eligible_research as (
    select research.id, research.title, research.published_on, research.source_url
    from public.research_items research
    join public.content_sources source on source.id = research.source_id
    where research.publication_state = 'published'
      and research.published_on >= current_date - 41 and research.published_on <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
  ), pairs as (
    select left_link.topic_slug as left_slug, right_link.topic_slug as right_slug,
      count(distinct research.id)::integer as shared_records
    from eligible_research research
    join public.research_item_topics left_link on left_link.research_item_id = research.id and left_link.is_published
    join public.research_item_topics right_link on right_link.research_item_id = research.id and right_link.is_published and left_link.topic_slug < right_link.topic_slug
    group by left_link.topic_slug, right_link.topic_slug
    order by shared_records desc, left_slug, right_slug limit 1
  ), selected as (
    select pairs.*, left_topic.name as left_name, right_topic.name as right_name
    from pairs join public.intelligence_topics left_topic on left_topic.slug = pairs.left_slug
    join public.intelligence_topics right_topic on right_topic.slug = pairs.right_slug
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'topic-connections-week-of-' || week_start, 'topic-connections', current_date - 41, current_date,
    'Which longevity topics appeared together most often?',
    'A source-linked view of the strongest recent topic co-occurrence in the research index, without turning overlap into a causal claim.',
    'Which pair of longevity topics co-appeared most often in research published during the last six weeks?',
    selected.left_name || ' and ' || selected.right_name || ' co-appear on ' || selected.shared_records || ' recent source-matched research records.',
    jsonb_build_object(
      'visual_type', 'connections', 'primary_value', selected.shared_records,
      'left_topic', jsonb_build_object('slug', selected.left_slug, 'name', selected.left_name),
      'right_topic', jsonb_build_object('slug', selected.right_slug, 'name', selected.right_name),
      'metrics', jsonb_build_array(
        jsonb_build_object('value', selected.shared_records, 'label', 'shared research records', 'note', 'Published in the six-week window', 'href', '/research?topic=' || selected.left_slug),
        jsonb_build_object('value', '2', 'label', 'connected topic dossiers', 'note', 'Open either field', 'href', '/topics'),
        jsonb_build_object('value', '42', 'label', 'days in the cohort', 'note', 'Source publication dates', 'href', '/changes'),
        jsonb_build_object('value', '0', 'label', 'causal claims', 'note', 'Co-occurrence only', 'href', '/methodology')
      ),
      'links', jsonb_build_array(
        jsonb_build_object('label', selected.left_name, 'value', selected.shared_records, 'href', '/topics/' || selected.left_slug),
        jsonb_build_object('label', selected.right_name, 'value', selected.shared_records, 'href', '/topics/' || selected.right_slug)
      ),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'eyebrow', research.published_on::text, 'title', research.title,
        'href', '/research/' || research.id, 'note', 'Source-linked research record'
      ) order by research.published_on desc, research.id desc)
      from (select research.* from eligible_research research
        join public.research_item_topics left_link on left_link.research_item_id = research.id and left_link.topic_slug = selected.left_slug and left_link.is_published
        join public.research_item_topics right_link on right_link.research_item_id = research.id and right_link.topic_slug = selected.right_slug and right_link.is_published
        order by research.published_on desc, research.id desc limit 12) research), '[]'::jsonb),
      'scope', 'Research records published in the latest 42-day window and independently matched to both named topics.',
      'meaning', 'Topic co-occurrence does not establish causality, biological interaction, consensus, effectiveness or research quality. Broad records can match more than one field.'
    ), 'published', now(), now()
  from selected where selected.shared_records >= 5
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count; affected := affected + written;

  return affected;
end;
$$;

revoke all on function public.generate_signal_newsroom() from public, anon, authenticated;
grant execute on function public.generate_signal_newsroom() to service_role;

create or replace function public.refresh_automatic_signals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare topic_count integer; newsroom_count integer;
begin
  topic_count := public.generate_automatic_signal_stories();
  newsroom_count := public.generate_signal_newsroom();
  return jsonb_build_object('topic_pulses', topic_count, 'newsroom_editions', newsroom_count);
end;
$$;

revoke all on function public.refresh_automatic_signals() from public, anon, authenticated;
grant execute on function public.refresh_automatic_signals() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-automatic-signals' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-automatic-signals',
    '42 6 * * *',
    'select public.refresh_automatic_signals();'
  );
end
$schedule$;

select public.generate_signal_newsroom();
