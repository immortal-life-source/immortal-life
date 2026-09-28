-- Use the compute and invocation headroom already included in Supabase Pro.
-- This migration does not alter billing controls, compute size, corpus scope,
-- source-rights policy, or the project's spend cap.

-- ClinicalTrials.gov page tokens can expire during long historical traversals.
-- The worker now recovers automatically; replaying page one is idempotent.
update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  cursor_state = '{}'::jsonb, completed_at = null, last_error = null, updated_at = now()
where source_id = 'clinicaltrials-gov'
  and status in ('retry', 'dead')
  and last_error like 'Upstream 400 from clinicaltrials.gov%';

-- Spread the current Europe PMC transient backlog across the next twelve
-- hours. This prevents a retry storm while other productive sources continue.
update public.ingestion_jobs set
  status = 'retry', attempts = least(attempts, 3), locked_at = null,
  available_at = now() + interval '30 minutes' + ((id % 690)::text || ' minutes')::interval,
  updated_at = now()
where source_id = 'europe-pmc'
  and status in ('retry', 'dead')
  and (last_error like 'Upstream 5__ from www.ebi.ac.uk%'
    or last_error like '%signal has been aborted%');

-- Re-run database timeout pages after lowering the ClinicalTrials.gov write
-- batch to 100 records. Cursors are preserved, so no completed range is lost.
update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  last_error = null, updated_at = now()
where status in ('retry', 'dead')
  and source_id in ('clinicaltrials-gov', 'pubmed')
  and last_error like '%canceling statement due to statement timeout%';

do $schedule$
declare existing_job_id bigint;
begin
  -- Twenty-second, source-scoped workers now run every three minutes, staggered
  -- so their database writes do not begin together.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-pubmed-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-pubmed-sync',
    '0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"pubmed","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-europe-pmc-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-europe-pmc-sync',
    '1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"europe-pmc","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-clinicaltrials-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-clinicaltrials-sync',
    '2,5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"clinicaltrials-gov","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      );
    $job$
  );

  -- University history gets an 80-second window every two minutes during the
  -- existing off-peak window. The 40-second gap prevents overlapping workers.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-history' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-history',
    '*/2 22-23,0-4 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 105000
      );
    $job$
  );
end
$schedule$;

notify pgrst, 'reload schema';
