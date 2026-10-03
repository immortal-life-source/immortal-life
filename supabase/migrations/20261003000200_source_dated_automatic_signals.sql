-- Automatic Signals must reflect source-dated activity, not the speed of the
-- current historical ingestion. Require a real comparison baseline and
-- withdraw the initial ingestion-dominated seed before regenerating.

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
  update public.signal_stories
  set publication_state = 'withdrawn', updated_at = now()
  where story_kind = 'topic-pulse'
    and period_end >= week_start;

  with dated_events as (
    select
      event.*,
      case
        when event.event_type in ('trial_status_changed', 'research_updated') then event.occurred_at
        else coalesce(
          research.published_on::timestamptz,
          trial.last_update_date::timestamptz,
          regulatory.published_at,
          integrity.announced_on::timestamptz,
          integrity.detected_at,
          case when event.event_key not like '%:backfill' then event.occurred_at end
        )
      end as source_occurred_at
    from public.intelligence_change_events event
    join public.content_sources source on source.id = event.source_id and source.public_display_allowed
    left join public.research_items research on event.record_type = 'research' and research.id = event.record_id
    left join public.clinical_trials trial on event.record_type = 'trials' and trial.id = event.record_id
    left join public.regulatory_events regulatory on event.record_type = 'regulatory' and regulatory.id = event.record_id
    left join public.research_integrity_events integrity on event.record_type = 'integrity' and integrity.id = event.record_id
    where event.event_type <> 'quality_state_changed'
      and coalesce(array_length(event.topic_slugs, 1), 0) > 0
  ), eligible_events as (
    select * from dated_events
    where source_occurred_at >= now() - interval '84 days'
      and source_occurred_at <= now() + interval '1 day'
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
      max(source_occurred_at) as latest_event_at,
      (array_agg(id order by (importance = 'important') desc, source_occurred_at desc, id desc))[1:12] as event_ids
    from expanded
    where source_occurred_at >= now() - interval '42 days'
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
    where source_occurred_at >= now() - interval '84 days'
      and source_occurred_at < now() - interval '42 days'
    group by topic_slug
  ), ranked as (
    select
      topic.name as topic_name,
      current_window.*,
      previous_window.total as previous_total,
      previous_window.research_count as previous_research_count,
      previous_window.trial_count as previous_trial_count,
      previous_window.regulatory_count as previous_regulatory_count,
      previous_window.integrity_count as previous_integrity_count,
      (
        current_window.total
        + current_window.important_count * 25
        + current_window.trial_count * 4
        + current_window.regulatory_count * 12
        + current_window.integrity_count * 12
        + current_window.record_type_count * 10
      )::integer as editorial_score
    from current_window
    join previous_window on previous_window.topic_slug = current_window.topic_slug and previous_window.total >= 3
    join public.intelligence_topics topic on topic.slug = current_window.topic_slug and topic.enabled
    where current_window.total >= 8
      and (current_window.record_type_count >= 2 or current_window.important_count >= 1)
      and (current_window.trial_count + current_window.regulatory_count + current_window.integrity_count) >= 1
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
      'A source-linked view of recent research, trial and oversight activity for ' || ranked.topic_name || ', organized by source date.',
      'What source-linked activity appeared for ' || ranked.topic_name || ' during the last six weeks?',
      'The source-dated cohort contains ' || ranked.total || ' changes: '
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
        'window_basis', 'Source publication, registry-update, announcement or detection dates; not ingestion dates.',
        'generation_rule', 'At least eight public source-linked events, at least three events in the preceding comparison window, plus multiple record types or an important event; at least one trial, regulatory or integrity event is required.'
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

select public.generate_automatic_signal_stories();
