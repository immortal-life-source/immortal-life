-- Complete, resumable knowledge acquisition.
-- Page sizes remain bounded to respect upstream APIs, but there is no fixed
-- total-result ceiling: every source/topic stream resumes until exhausted.

alter table public.ingestion_jobs
  add column if not exists sync_mode text not null default 'incremental'
    check (sync_mode in ('incremental', 'history')),
  add column if not exists cursor_state jsonb not null default '{}'::jsonb,
  add column if not exists pages_processed integer not null default 0
    check (pages_processed >= 0),
  add column if not exists total_available bigint
    check (total_available is null or total_available >= 0);

create index if not exists ingestion_jobs_fair_work_idx
  on public.ingestion_jobs (status, available_at, updated_at, created_at);

-- One durable historical stream per topic and ingesting source. The worker
-- keeps each row pending until the upstream cursor/date partitions are fully
-- exhausted; conflict handling makes this safe to re-run.
insert into public.ingestion_jobs
  (source_id, topic_slug, job_key, window_start, sync_mode, status, available_at)
select source.id, topic.slug, topic.slug || ':history', '1800-01-01 00:00:00+00',
       'history', 'pending', now()
from public.content_sources source
cross join public.intelligence_topics topic
where source.enabled
  and source.id in ('pubmed', 'europe-pmc', 'clinicaltrials-gov')
  and topic.enabled
on conflict (source_id, job_key, window_start) do nothing;

insert into public.ingestion_jobs
  (source_id, topic_slug, job_key, window_start, sync_mode, status, available_at)
select id, null, 'retractions:history', '1800-01-01 00:00:00+00',
       'history', 'pending', now()
from public.content_sources
where id = 'crossref' and enabled
on conflict (source_id, job_key, window_start) do nothing;

-- OpenAlex has its own worker. Keeping it out of the generic queue removes the
-- historical "Unsupported source openalex" failures.
update public.ingestion_jobs
set status = 'succeeded', completed_at = coalesce(completed_at, now()),
    last_error = null, updated_at = now()
where source_id = 'openalex'
  and status in ('pending', 'retry', 'running');

-- Run continuously enough for large backfills to make progress. Idempotent
-- six-hour incremental windows prevent duplicate records.
do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-intelligence-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-intelligence-sync',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"all","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;

revoke all on table public.ingestion_jobs from public, anon, authenticated;
grant all on table public.ingestion_jobs to service_role;
