-- Populate reader-facing, recent records first while the bounded historical
-- backfill continues automatically in the background.
create or replace function public.backfill_evidence_snapshots(batch_size integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  research_updated integer := 0;
  trials_updated integer := 0;
  backfill_job_id bigint;
begin
  with targets as (
    select id from public.research_items
    where evidence_snapshot = '{}'::jsonb order by id desc limit greatest(1, least(batch_size, 2000))
  )
  update public.research_items item
  set evidence_snapshot = public.build_research_evidence_snapshot(item)
  from targets where item.id = targets.id;
  get diagnostics research_updated = row_count;

  with targets as (
    select id from public.clinical_trials
    where evidence_snapshot = '{}'::jsonb order by id desc limit greatest(1, least(batch_size, 2000))
  )
  update public.clinical_trials item
  set evidence_snapshot = public.build_trial_evidence_snapshot(item)
  from targets where item.id = targets.id;
  get diagnostics trials_updated = row_count;

  if research_updated = 0 and trials_updated = 0 then
    select jobid into backfill_job_id from cron.job where jobname = 'immortal-life-evidence-snapshot-backfill' limit 1;
    if backfill_job_id is not null then perform cron.unschedule(backfill_job_id); end if;
  end if;
  return jsonb_build_object('research', research_updated, 'trials', trials_updated);
end;
$$;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-evidence-snapshot-backfill' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-evidence-snapshot-backfill', '* * * * *', 'select public.backfill_evidence_snapshots(2000);');
end
$schedule$;

select public.backfill_evidence_snapshots(1000);
