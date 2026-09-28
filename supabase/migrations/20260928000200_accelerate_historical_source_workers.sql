-- With all-taxonomy evaluation removed from the ingestion transaction, the
-- high-volume research and trial feeds can safely receive short, independent
-- recovery slices. Each invocation remains bounded by the Edge worker's
-- source-specific ten-second budget and every cursor remains durable.

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-pubmed-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-pubmed-sync',
    '0,5,10,15,20,25,30,35,40,45,50,55 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"pubmed","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-europe-pmc-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-europe-pmc-sync',
    '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"europe-pmc","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-clinicaltrials-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-clinicaltrials-sync',
    '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"clinicaltrials-gov","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  -- A history invocation has a fifty-second budget. Five-minute spacing more
  -- than prevents overlap while doubling the previous safe off-peak cadence.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-history' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-history',
    '*/5 22-23,0-4 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 65000
      );
    $job$
  );
end
$schedule$;
