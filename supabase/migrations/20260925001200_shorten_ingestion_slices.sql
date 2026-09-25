-- The queue remains uncapped and resumable, but each source-specific HTTP
-- invocation has a short timeout so background acquisition cannot monopolize
-- reader-facing database and Edge capacity.

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-doaj-sync', '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-isrctn-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-isrctn-sync', '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"isrctn","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );
end
$schedule$;
