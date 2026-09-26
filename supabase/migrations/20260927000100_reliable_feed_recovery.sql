-- The worker now keeps one resumable rolling incremental job per source/topic
-- going forward. Existing queue state is preserved and drains normally; this
-- migration deliberately does not rewrite or discard historical retries.

-- Crossref has one global integrity cursor and should not wait behind hundreds
-- of topic jobs. ClinicalTrials.gov receives a small source-scoped recovery
-- slice hourly; its cursor remains uncapped and database writes are bounded.
do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-crossref-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-crossref-sync', '11 */6 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"crossref","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-clinicaltrials-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-clinicaltrials-sync', '37 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"clinicaltrials-gov","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 35000
      );
    $job$
  );
end
$schedule$;
