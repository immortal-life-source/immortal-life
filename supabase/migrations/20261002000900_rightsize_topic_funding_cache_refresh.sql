-- The all-topic funding reduction is intentionally offline and substantial.
-- Four refreshes per day keep dossiers current without making this analytical
-- workload compete continuously with ingestion or visitor-facing reads.

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'immortal-life-topic-funding-cache' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-funding-cache', '27 */6 * * *',
    $job$select public.refresh_topic_funding_dossier_cache()$job$
  );
end
$schedule$;
