-- Public quality totals are operational summaries, not live clinical data.
-- Cache the expensive full-corpus aggregates so visitor requests remain fast.

create table if not exists public.intelligence_quality_telemetry_cache (
  singleton boolean primary key default true check (singleton),
  payload jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);
revoke all on table public.intelligence_quality_telemetry_cache from public, anon, authenticated;
grant all on table public.intelligence_quality_telemetry_cache to service_role;

create or replace function public.refresh_intelligence_quality_telemetry_cache()
returns void language plpgsql security definer set search_path = public set statement_timeout = '300s' as $$
begin
  insert into public.intelligence_quality_telemetry_cache (singleton, payload, refreshed_at)
  values (true, jsonb_build_object(
    'generated_at', now(),
    'research', jsonb_build_object(
      'published', (select count(*) from public.research_items where publication_state = 'published'),
      'quarantined', (select count(*) from public.research_items where publication_state = 'quarantined'),
      'average_confidence', (select coalesce(round(avg(relevance_confidence)), 0) from public.research_items where publication_state = 'published'),
      'duplicates_suppressed', (select count(*) from public.research_items where duplicate_of_id is not null)
    ),
    'trials', jsonb_build_object(
      'published', (select count(*) from public.clinical_trials where publication_state = 'published'),
      'quarantined', (select count(*) from public.clinical_trials where publication_state = 'quarantined'),
      'average_confidence', (select coalesce(round(avg(relevance_confidence)), 0) from public.clinical_trials where publication_state = 'published'),
      'duplicates_suppressed', (select count(*) from public.clinical_trials where duplicate_of_id is not null)
    )
  ), now())
  on conflict (singleton) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
end;
$$;

select public.refresh_intelligence_quality_telemetry_cache();

create or replace function public.get_intelligence_quality_telemetry()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select payload from public.intelligence_quality_telemetry_cache where singleton), '{}'::jsonb);
$$;
revoke all on function public.get_intelligence_quality_telemetry() from public, anon, authenticated;
grant execute on function public.get_intelligence_quality_telemetry() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-quality-telemetry-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-quality-telemetry-refresh', '1 1,7,13,19 * * *', 'select public.refresh_intelligence_quality_telemetry_cache();');
end
$schedule$;
