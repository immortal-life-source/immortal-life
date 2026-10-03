-- Automatic, fact-only Signals publication.
--
-- The generator publishes a bounded weekly set of topic pulses and refreshes
-- their numbers daily. It describes movement inside the immortal.life index;
-- it never converts record volume into a claim about efficacy, safety, quality
-- or real-world scientific momentum.

create table if not exists public.signal_stories (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  story_kind text not null check (story_kind in ('topic-pulse')),
  topic_slug text not null references public.intelligence_topics(slug),
  period_start date not null,
  period_end date not null,
  title text not null,
  dek text not null,
  question text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  publication_state text not null default 'published' check (publication_state in ('published', 'withdrawn')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  automation_disclosure text not null default 'Generated automatically from source-linked metadata. No scientist, clinician, editor or human reviewer evaluates this story before publication.',
  check (period_end >= period_start),
  unique (topic_slug, period_end)
);

create index if not exists signal_stories_publication_idx
  on public.signal_stories (publication_state, period_end desc, updated_at desc);
create index if not exists signal_stories_topic_idx
  on public.signal_stories (topic_slug, period_end desc);

alter table public.signal_stories enable row level security;
revoke all on table public.signal_stories from public, anon, authenticated;
grant all on table public.signal_stories to service_role;

create or replace function public.generate_automatic_signal_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date := date_trunc('week', now() at time zone 'utc')::date;
  inserted_count integer := 0;
begin
  with eligible_events as (
    select event.*
    from public.intelligence_change_events event
    join public.content_sources source on source.id = event.source_id
    where event.occurred_at >= now() - interval '84 days'
      and event.event_type <> 'quality_state_changed'
      and source.public_display_allowed
      and coalesce(array_length(event.topic_slugs, 1), 0) > 0
  ), expanded as (
    select event.*, topic_slug
    from eligible_events event
    cross join lateral unnest(event.topic_slugs) topic_slug
  ), current_window as (
    select
      topic_slug,
      count(*)::integer as total,
      count(*) filter (where record_type = 'research')::integer as research_count,
      count(*) filter (where record_type = 'trials')::integer as trial_count,
      count(*) filter (where record_type = 'regulatory')::integer as regulatory_count,
      count(*) filter (where record_type = 'integrity')::integer as integrity_count,
      count(*) filter (where importance = 'important')::integer as important_count,
      count(distinct record_type)::integer as record_type_count,
      max(occurred_at) as latest_event_at,
      (array_agg(id order by (importance = 'important') desc, occurred_at desc, id desc))[1:12] as event_ids
    from expanded
    where occurred_at >= now() - interval '42 days'
    group by topic_slug
  ), previous_window as (
    select
      topic_slug,
      count(*)::integer as total,
      count(*) filter (where record_type = 'research')::integer as research_count,
      count(*) filter (where record_type = 'trials')::integer as trial_count,
      count(*) filter (where record_type = 'regulatory')::integer as regulatory_count,
      count(*) filter (where record_type = 'integrity')::integer as integrity_count
    from expanded
    where occurred_at >= now() - interval '84 days'
      and occurred_at < now() - interval '42 days'
    group by topic_slug
  ), ranked as (
    select
      topic.name as topic_name,
      current_window.*,
      coalesce(previous_window.total, 0) as previous_total,
      coalesce(previous_window.research_count, 0) as previous_research_count,
      coalesce(previous_window.trial_count, 0) as previous_trial_count,
      coalesce(previous_window.regulatory_count, 0) as previous_regulatory_count,
      coalesce(previous_window.integrity_count, 0) as previous_integrity_count,
      (
        current_window.total
        + current_window.important_count * 25
        + current_window.trial_count * 4
        + current_window.regulatory_count * 12
        + current_window.integrity_count * 12
        + current_window.record_type_count * 10
      )::integer as editorial_score
    from current_window
    join public.intelligence_topics topic on topic.slug = current_window.topic_slug and topic.enabled
    left join previous_window on previous_window.topic_slug = current_window.topic_slug
    where current_window.total >= 8
      and (
        current_window.record_type_count >= 2
        or current_window.important_count >= 1
      )
      and (
        current_window.trial_count
        + current_window.regulatory_count
        + current_window.integrity_count
      ) >= 1
    order by editorial_score desc, current_window.latest_event_at desc, topic.slug
    limit 6
  ), written as (
    insert into public.signal_stories (
      slug, story_kind, topic_slug, period_start, period_end, title, dek,
      question, summary, payload, publication_state, generated_at, updated_at
    )
    select
      'topic-' || ranked.topic_slug || '-week-of-' || week_start::text,
      'topic-pulse', ranked.topic_slug, (current_date - 41), current_date,
      'What entered the ' || ranked.topic_name || ' evidence map in six weeks?',
      'A source-linked view of newly indexed research, trial and oversight activity for ' || ranked.topic_name || '.',
      'What source-linked activity entered the immortal.life index for ' || ranked.topic_name || ' during the last six weeks?',
      'The index recorded ' || ranked.total || ' source-linked changes: '
        || ranked.research_count || ' research additions or updates, '
        || ranked.trial_count || ' trial additions or status changes, '
        || ranked.regulatory_count || ' regulatory notices, and '
        || ranked.integrity_count || ' integrity events. These figures describe indexed activity, not evidence strength, effectiveness or safety.',
      jsonb_build_object(
        'current_total', ranked.total,
        'previous_total', ranked.previous_total,
        'current_counts', jsonb_build_object(
          'research', ranked.research_count, 'trials', ranked.trial_count,
          'regulatory', ranked.regulatory_count, 'integrity', ranked.integrity_count,
          'important', ranked.important_count
        ),
        'previous_counts', jsonb_build_object(
          'research', ranked.previous_research_count, 'trials', ranked.previous_trial_count,
          'regulatory', ranked.previous_regulatory_count, 'integrity', ranked.previous_integrity_count
        ),
        'event_ids', to_jsonb(ranked.event_ids),
        'latest_event_at', ranked.latest_event_at,
        'editorial_score', ranked.editorial_score,
        'generation_rule', 'At least eight public source-linked events plus multiple record types or an important event; at least one trial, regulatory or integrity event is required.'
      ),
      'published', now(), now()
    from ranked
    on conflict (slug) do update set
      title = excluded.title,
      dek = excluded.dek,
      question = excluded.question,
      summary = excluded.summary,
      payload = excluded.payload,
      publication_state = 'published',
      updated_at = now()
    returning 1
  )
  select count(*) into inserted_count from written;

  return inserted_count;
end;
$$;

revoke all on function public.generate_automatic_signal_stories() from public, anon, authenticated;
grant execute on function public.generate_automatic_signal_stories() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-automatic-signals' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-automatic-signals',
    '42 6 * * *',
    'select public.generate_automatic_signal_stories();'
  );
end
$schedule$;

-- Seed this week's eligible stories immediately. The same function is
-- idempotent within a week and refreshes their factual counts every day.
select public.generate_automatic_signal_stories();
