-- Pace uncapped historical acquisition so it stays below the database's
-- sustained IO baseline. This changes frequency, never corpus scope: cursors
-- remain resumable and no records or historical ranges are discarded.

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-intelligence-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-intelligence-sync', '17 */6 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"all","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-doaj-sync', '7 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-isrctn-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-isrctn-sync', '27 */2 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"isrctn","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-index' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-index', '47 */2 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  -- Snapshot triggers now cover new and changed records; the one-time backfill
  -- worker must not keep scanning for already-completed work every minute.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-evidence-snapshot-backfill' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-graph-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-graph-refresh', '14 2 * * *', 'select public.refresh_intelligence_graph_cache();');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-quality-telemetry-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-quality-telemetry-refresh', '34 2 * * *', 'select public.refresh_intelligence_quality_telemetry_cache();');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-entity-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-entity-refresh', '54 2 * * *', 'select public.refresh_intelligence_entities();');
end
$schedule$;
