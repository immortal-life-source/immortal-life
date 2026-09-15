-- Automated search-demand feedback, subscription delivery, and utility telemetry.
-- Query data and subscriber identities are private service data; only aggregates
-- are exposed by public endpoints.

create table if not exists public.search_console_daily (
  metric_date date not null,
  page text not null,
  query text not null,
  country text not null default '',
  device text not null default '',
  clicks numeric(14,4) not null default 0,
  impressions numeric(14,4) not null default 0,
  ctr numeric(8,7) not null default 0,
  position numeric(10,4) not null default 0,
  imported_at timestamptz not null default now(),
  primary key (metric_date, page, query, country, device)
);

create index if not exists search_console_daily_page_idx
  on public.search_console_daily (page, metric_date desc);
create index if not exists search_console_daily_opportunity_idx
  on public.search_console_daily (impressions desc, position, metric_date desc);

create table if not exists public.search_console_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'not_configured')),
  rows_imported integer not null default 0,
  error_code text
);

create table if not exists public.search_opportunities (
  id bigint generated always as identity primary key,
  opportunity_key text not null unique,
  opportunity_type text not null check (opportunity_type in ('striking_distance', 'low_ctr', 'content_gap')),
  query text not null,
  page text not null,
  impressions numeric(14,4) not null default 0,
  clicks numeric(14,4) not null default 0,
  ctr numeric(8,7) not null default 0,
  position numeric(10,4) not null default 0,
  opportunity_score numeric(12,4) not null default 0,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists search_opportunities_score_idx
  on public.search_opportunities (resolved_at, opportunity_score desc);

create table if not exists public.briefing_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  topic_slug text references public.intelligence_topics(slug) on delete set null,
  topic_key text generated always as (coalesce(topic_slug, '')) stored,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced')),
  confirmation_token_hash text,
  unsubscribe_token_hash text not null,
  consent_text text not null,
  consented_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz,
  unique (email_normalized, topic_key)
);

create index if not exists briefing_subscribers_delivery_idx
  on public.briefing_subscribers (status, topic_slug, last_delivery_at);

create or replace function public.refresh_search_opportunities()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  with aggregate_metrics as (
    select
      query,
      page,
      sum(clicks) clicks,
      sum(impressions) impressions,
      case when sum(impressions) > 0 then sum(clicks) / sum(impressions) else 0 end ctr,
      case when sum(impressions) > 0 then sum(position * impressions) / sum(impressions) else 0 end position
    from public.search_console_daily
    where metric_date >= current_date - 28
    group by query, page
    having sum(impressions) >= 10
  ), classified as (
    select *,
      case
        when position between 5 and 20 then 'striking_distance'
        when impressions >= 50 and ctr < 0.02 then 'low_ctr'
        else 'content_gap'
      end opportunity_type,
      round((impressions * greatest(1, 21 - least(position, 20)) * greatest(0.02, 0.12 - ctr))::numeric, 4) opportunity_score
    from aggregate_metrics
    where position between 5 and 30 or (impressions >= 50 and ctr < 0.02)
  )
  insert into public.search_opportunities
    (opportunity_key, opportunity_type, query, page, clicks, impressions, ctr, position, opportunity_score, last_detected_at, resolved_at)
  select encode(digest(query || '|' || page, 'sha256'), 'hex'), opportunity_type, query, page, clicks, impressions, ctr, position, opportunity_score, now(), null
  from classified
  on conflict (opportunity_key) do update set
    opportunity_type = excluded.opportunity_type,
    clicks = excluded.clicks,
    impressions = excluded.impressions,
    ctr = excluded.ctr,
    position = excluded.position,
    opportunity_score = excluded.opportunity_score,
    last_detected_at = now(),
    resolved_at = null;

  get diagnostics changed = row_count;

  update public.search_opportunities
  set resolved_at = now()
  where resolved_at is null
    and last_detected_at < now() - interval '35 days';

  return changed;
end;
$$;

create or replace function public.search_utility_telemetry()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'period_days', 28,
    'last_imported_at', (select max(imported_at) from search_console_daily),
    'clicks', coalesce((select round(sum(clicks)) from search_console_daily where metric_date >= current_date - 28), 0),
    'impressions', coalesce((select round(sum(impressions)) from search_console_daily where metric_date >= current_date - 28), 0),
    'average_position', coalesce((select round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) from search_console_daily where metric_date >= current_date - 28), 0),
    'open_opportunities', (select count(*) from search_opportunities where resolved_at is null),
    'last_sync', coalesce((select jsonb_build_object('status', status, 'finished_at', finished_at, 'rows_imported', rows_imported) from search_console_sync_runs order by started_at desc limit 1), '{}'::jsonb)
  );
$$;

alter table public.search_console_daily enable row level security;
alter table public.search_console_sync_runs enable row level security;
alter table public.search_opportunities enable row level security;
alter table public.briefing_subscribers enable row level security;

revoke all on table public.search_console_daily, public.search_console_sync_runs, public.search_opportunities, public.briefing_subscribers from public, anon, authenticated;
grant all on table public.search_console_daily, public.search_console_sync_runs, public.search_opportunities, public.briefing_subscribers to service_role;
revoke all on function public.refresh_search_opportunities() from public, anon, authenticated;
grant execute on function public.refresh_search_opportunities() to service_role;
revoke all on function public.search_utility_telemetry() from public, anon, authenticated;
grant execute on function public.search_utility_telemetry() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-search-console-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-search-console-sync',
    '18 5 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-search-console',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-subscriber-briefing-delivery' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-subscriber-briefing-delivery',
    '38 7 * * 1',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/deliver-briefings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
