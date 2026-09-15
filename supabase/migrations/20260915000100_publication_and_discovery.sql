-- Automated public publication, discovery feeds, and indexing notifications.
-- immortal.life has no human editors or reviewers; every output is generated
-- from the source records already stored by the ingestion pipeline.

create table if not exists public.public_briefings (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  period_start date not null unique,
  period_end date not null,
  title text not null,
  dek text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  automation_disclosure text not null default 'Generated automatically from cited source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates this publication before release.',
  check (period_end >= period_start)
);

create index if not exists public_briefings_generated_idx
  on public.public_briefings (generated_at desc);

alter table public.public_briefings enable row level security;
revoke all on table public.public_briefings from public, anon, authenticated;
grant all on table public.public_briefings to service_role;

with bounds as (
  select
    (date_trunc('week', now() at time zone 'utc') - interval '7 days')::date as period_start,
    (date_trunc('week', now() at time zone 'utc') - interval '1 day')::date as period_end,
    date_trunc('week', now() at time zone 'utc') - interval '7 days' as since_at,
    date_trunc('week', now() at time zone 'utc') as until_at
), counts as (
  select
    (select count(*) from public.research_items, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at) as research_count,
    (select count(*) from public.clinical_trials, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at) as trial_count,
    (select count(*) from public.regulatory_events, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at) as regulatory_count,
    (select count(*) from public.research_integrity_events, bounds where detected_at >= bounds.since_at and detected_at < bounds.until_at) as integrity_count
)
insert into public.public_briefings (slug, period_start, period_end, title, dek, summary, payload)
select
  'week-of-' || bounds.period_start,
  bounds.period_start,
  bounds.period_end,
  'Longevity evidence briefing · ' || bounds.period_start,
  (counts.research_count + counts.trial_count + counts.regulatory_count + counts.integrity_count) || ' newly indexed source records for the week ending ' || bounds.period_end || '.',
  'The automated index added ' || counts.research_count || ' research records, ' || counts.trial_count || ' clinical trial records, ' || counts.regulatory_count || ' regulatory notices, and ' || counts.integrity_count || ' research-integrity events. Counts reflect ingestion activity, not evidence strength or clinical importance.',
  jsonb_build_object(
    'counts', jsonb_build_object('research', counts.research_count, 'trials', counts.trial_count, 'regulatory', counts.regulatory_count, 'integrity', counts.integrity_count),
    'research', coalesce((select jsonb_agg(row_data) from (select jsonb_build_object('id', id, 'title', title) row_data from public.research_items, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at order by first_seen_at desc limit 25) selected), '[]'::jsonb),
    'trials', coalesce((select jsonb_agg(row_data) from (select jsonb_build_object('id', id, 'title', title) row_data from public.clinical_trials, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at order by first_seen_at desc limit 25) selected), '[]'::jsonb),
    'regulatory', coalesce((select jsonb_agg(row_data) from (select jsonb_build_object('id', id, 'title', title) row_data from public.regulatory_events, bounds where first_seen_at >= bounds.since_at and first_seen_at < bounds.until_at order by first_seen_at desc limit 20) selected), '[]'::jsonb),
    'integrity', coalesce((select jsonb_agg(row_data) from (select jsonb_build_object('id', id, 'title', title) row_data from public.research_integrity_events, bounds where detected_at >= bounds.since_at and detected_at < bounds.until_at order by detected_at desc limit 20) selected), '[]'::jsonb)
  )
from bounds cross join counts
on conflict (period_start) do nothing;

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-public-weekly-briefing' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'immortal-life-public-weekly-briefing',
    '8 6 * * 1',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/generate-public-briefing',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'intelligence_sync_secret'
            order by created_at desc limit 1
          )
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-indexnow' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'immortal-life-indexnow',
    '24 */6 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/notify-indexnow',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'intelligence_sync_secret'
            order by created_at desc limit 1
          )
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
end
$schedule$;
