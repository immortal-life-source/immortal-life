-- Temporarily make complete-corpus taxonomy evaluation the database's primary
-- background task. Source cursors continue to move, but at a lower cadence
-- while the research taxonomy run is active. Every normal ingestion cadence
-- restores automatically as soon as that run completes.

create or replace function public.taxonomy_reindex_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'research' and status in ('pending', 'running')
  );
$$;

create or replace function public.process_priority_topic_taxonomy_reindex()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  utc_hour integer := extract(hour from now() at time zone 'UTC')::integer;
  batch_size integer;
begin
  if not public.taxonomy_reindex_active() then
    return jsonb_build_object('status', 'idle', 'reason', 'research_reindex_complete');
  end if;
  -- Visitor hours get a substantial but bounded batch. Overnight receives the
  -- larger batch already proven safe by the existing resumable worker.
  batch_size := case when utc_hour between 0 and 7 then 300 else 150 end;
  return public.process_topic_taxonomy_reindex(batch_size);
end;
$$;

revoke all on function public.taxonomy_reindex_active(),
  public.process_priority_topic_taxonomy_reindex() from public, anon, authenticated;
grant execute on function public.taxonomy_reindex_active(),
  public.process_priority_topic_taxonomy_reindex() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  -- Replace the split day/night taxonomy jobs with one adaptive priority job.
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-topic-taxonomy-reindex' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-topic-taxonomy-reindex-daytime' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-taxonomy-reindex', '* * * * *',
    $job$select public.process_priority_topic_taxonomy_reindex();$job$
  );

  -- Research history sources keep running. During the complete reindex they
  -- use one invocation per nine minutes; afterwards the normal three-minute
  -- cadence resumes automatically without another migration.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-pubmed-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-pubmed-sync',
    '0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"pubmed","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 9 = 0;
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
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"europe-pmc","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 9 = 1;
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
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"clinicaltrials-gov","trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 45000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 9 = 2;
    $job$
  );

  -- DOAJ, direct grants, and university history also remain live at a reduced
  -- cadence. Their original schedules return automatically on completion.
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-doaj-sync', '* * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 120000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 5 = 3;
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-direct-grants' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-direct-grants', '* * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-direct-grants',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 55000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 5 = 4;
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-history' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-history', '*/2 22-23,0-4 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 105000
      ) where not public.taxonomy_reindex_active() or extract(minute from now())::integer % 10 = 6;
    $job$
  );
end
$schedule$;

select public.process_priority_topic_taxonomy_reindex();

notify pgrst, 'reload schema';

