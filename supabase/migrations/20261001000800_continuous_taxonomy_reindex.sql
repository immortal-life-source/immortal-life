-- Keep the large historical taxonomy rebuild moving during visitor hours at a
-- deliberately small batch size. Newly ingested records still use the
-- priority queue every two minutes, and the existing 250-record overnight
-- worker remains the main backfill engine.

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-topic-taxonomy-reindex-daytime' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-taxonomy-reindex-daytime',
    '* 8-23 * * *',
    $job$select public.process_topic_taxonomy_reindex(50);$job$
  );
end
$schedule$;

-- Advance one small batch immediately on deployment. The function resumes the
-- persisted cursor and is safe to rerun; no records or checkpoints are reset.
select public.process_topic_taxonomy_reindex(50);

