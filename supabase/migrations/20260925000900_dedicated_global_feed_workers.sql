-- Keep the commercially reusable global feeds moving independently of the
-- much larger shared literature and trial history queue. Each invocation is
-- source-scoped by the worker, and the stagger avoids overlapping two
-- long-running Edge Function executions.

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'immortal-life-doaj-sync',
    '1,11,21,31,41,51 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-isrctn-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'immortal-life-isrctn-sync',
    '6,16,26,36,46,56 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"isrctn","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );

  -- Start both feeds immediately. Later work is handled by the staggered jobs.
  perform net.http_post(
    url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
    ),
    body := '{"source":"doaj","trigger":"manual"}'::jsonb,
    timeout_milliseconds := 150000
  );

  perform net.http_post(
    url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
    ),
    body := '{"source":"isrctn","trigger":"manual"}'::jsonb,
    timeout_milliseconds := 150000
  );
end
$schedule$;
