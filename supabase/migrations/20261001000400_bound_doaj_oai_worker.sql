-- Keep the global OAI harvester inside the hosted Edge execution envelope.
-- The job cursor is already durable after every complete page, so recovering
-- a stale lock only replays the unfinished page and cannot skip source data.

create or replace function public.get_doaj_oai_harvest_report()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', status,
      'sync_mode', sync_mode,
      'pages_processed', pages_processed,
      'items_seen', items_seen,
      'items_written', items_written,
      'total_available', total_available,
      'source_cursor', cursor_state ->> 'cursor',
      'last_datestamp', cursor_state ->> 'lastDatestamp',
      'attempts', attempts,
      'last_error', last_error,
      'locked_at', locked_at,
      'locked_for_seconds', case when locked_at is null then null else extract(epoch from now() - locked_at)::bigint end,
      'available_at', available_at,
      'updated_at', updated_at,
      'completed_at', completed_at
    )
    from public.ingestion_jobs
    where source_id = 'doaj' and job_key = 'oai:global:history'
      and window_start = '1800-01-01 00:00:00+00'
    limit 1
  ), jsonb_build_object('status', 'not_started'));
$$;

revoke all on function public.get_doaj_oai_harvest_report()
  from public, anon, authenticated;
grant execute on function public.get_doaj_oai_harvest_report() to service_role;

update public.ingestion_jobs set
  status = 'pending', available_at = now(), locked_at = null,
  last_error = 'Recovered safely from the initial OAI worker timeout',
  updated_at = now()
where source_id = 'doaj' and job_key = 'oai:global:history'
  and status = 'running' and locked_at < now() - interval '3 minutes';

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-doaj-sync',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$schedule$;

notify pgrst, 'reload schema';
