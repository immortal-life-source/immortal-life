-- Small, resumable pages run frequently and alternate sources by oldest state.
-- This is more reliable on Edge Functions than large multi-page invocations and
-- remains far below NIH RePORTER's published request-rate ceiling.

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-direct-grants' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-direct-grants', '* * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-direct-grants',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-intelligence-secret',(
            select decrypted_secret from vault.decrypted_secrets
            where name='intelligence_sync_secret' order by created_at desc limit 1
          )
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
end
$schedule$;
