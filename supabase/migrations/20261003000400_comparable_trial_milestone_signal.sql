-- Keep the trial-milestone comparison mathematically comparable: both windows
-- use the official registry last-update date, not a mixture of change-ledger
-- events and registry dates.

create or replace function public.generate_trial_milestone_signal()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date := date_trunc('week', now() at time zone 'utc')::date;
  written integer := 0;
begin
  with current_trials as (
    select trial.id, trial.title, trial.overall_status, trial.last_update_date,
      trial.countries, trial.source_url
    from public.clinical_trials trial
    join public.content_sources source on source.id = trial.source_id
    where trial.publication_state = 'published'
      and trial.last_update_date >= current_date - 41
      and trial.last_update_date <= current_date + 1
      and source.public_display_allowed
      and coalesce(source.rights_review_due_at, current_date) >= current_date
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
      count(*) filter (where lower(overall_status) = 'completed')::integer as completed
    from current_trials
  )
  insert into public.signal_stories
    (slug, story_kind, period_start, period_end, title, dek, question, summary, payload, publication_state, generated_at, updated_at)
  select 'trial-milestones-week-of-' || week_start, 'trial-milestones', current_date - 41, current_date,
    'Which longevity trials reached a visible registry milestone?',
    'A source-linked ledger of recently updated trial registrations, their current status and the countries shown in the registry.',
    'Which longevity-related trial registrations carry an official update date from the last six weeks?',
    rollup.total || ' published trial registrations carry an official registry update date in this six-week window. Current status is descriptive and does not establish results, effectiveness or safety.',
    jsonb_build_object(
      'visual_type', 'milestones', 'primary_value', rollup.total, 'previous_total', previous_count.total,
      'metrics', jsonb_build_array(
        jsonb_build_object('value', rollup.total, 'label', 'recently updated registrations', 'note', 'Official six-week update window', 'href', '/trials'),
        jsonb_build_object('value', rollup.recruiting, 'label', 'currently recruiting', 'note', 'Current registry status', 'href', '/trials?status=Recruiting'),
        jsonb_build_object('value', rollup.completed, 'label', 'currently completed', 'note', 'Results may or may not be posted', 'href', '/trials?status=Completed'),
        jsonb_build_object('value', previous_count.total, 'label', 'registrations in prior window', 'note', 'Same registry-update definition', 'href', '/trials')
      ),
      'bars', jsonb_build_array(
        jsonb_build_object('label', 'Recruiting', 'value', rollup.recruiting),
        jsonb_build_object('label', 'Active, not recruiting', 'value', rollup.active_not_recruiting),
        jsonb_build_object('label', 'Completed', 'value', rollup.completed),
        jsonb_build_object('label', 'Other current status', 'value', greatest(0, rollup.total - rollup.recruiting - rollup.active_not_recruiting - rollup.completed))
      ),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'eyebrow', 'Registry updated ' || last_update_date::text,
        'title', title, 'href', '/trials/' || id,
        'note', coalesce(overall_status, 'Status not reported')
      ) order by last_update_date desc, id desc)
      from (select * from current_trials order by last_update_date desc, id desc limit 12) sample), '[]'::jsonb),
      'scope', 'Published trial registrations with an official registry last-update date inside the latest 42-day window, compared with the immediately preceding 42 days using the same definition.',
      'meaning', 'A registry update and current status do not show that an intervention worked, was safe, recruited the planned population or produced a published result.'
    ), 'published', now(), now()
  from rollup cross join previous_count where rollup.total >= 3
  on conflict (slug) do update set title = excluded.title, dek = excluded.dek, question = excluded.question,
    summary = excluded.summary, payload = excluded.payload, publication_state = 'published', updated_at = now();
  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function public.generate_trial_milestone_signal() from public, anon, authenticated;
grant execute on function public.generate_trial_milestone_signal() to service_role;

create or replace function public.refresh_automatic_signals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare topic_count integer; newsroom_count integer; milestone_count integer;
begin
  topic_count := public.generate_automatic_signal_stories();
  newsroom_count := public.generate_signal_newsroom();
  milestone_count := public.generate_trial_milestone_signal();
  return jsonb_build_object('topic_pulses', topic_count, 'newsroom_editions', newsroom_count, 'trial_milestones', milestone_count);
end;
$$;

select public.generate_trial_milestone_signal();
