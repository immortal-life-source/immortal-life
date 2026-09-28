-- Keep source ingestion fast by moving all-taxonomy evaluation out of the
-- source-page transaction. Research and trial backfills now progress in
-- parallel during the low-traffic window, while newly ingested records enter
-- a small durable queue that can be drained independently.

create table if not exists public.topic_reindex_queue (
  entity_kind text not null check (entity_kind in ('research', 'trials')),
  record_id bigint not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text,
  primary key (entity_kind, record_id)
);

create index if not exists topic_reindex_queue_work_idx
  on public.topic_reindex_queue(entity_kind, enqueued_at, record_id);
alter table public.topic_reindex_queue enable row level security;
revoke all on table public.topic_reindex_queue from public, anon, authenticated;
grant all on table public.topic_reindex_queue to service_role;

create or replace function public.enqueue_research_source_records_for_reindex(p_source_id text, p_external_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  with inserted as (
    insert into public.topic_reindex_queue(entity_kind, record_id)
    select 'research', item.id from public.research_items item
    where item.source_id = p_source_id
      and item.external_id = any(coalesce(p_external_ids, '{}'))
    on conflict (entity_kind, record_id) do update set
      enqueued_at = least(topic_reindex_queue.enqueued_at, excluded.enqueued_at)
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

create or replace function public.enqueue_trial_source_records_for_reindex(p_source_id text, p_external_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  with inserted as (
    insert into public.topic_reindex_queue(entity_kind, record_id)
    select 'trials', trial.id from public.clinical_trials trial
    where trial.source_id = p_source_id
      and trial.external_id = any(coalesce(p_external_ids, '{}'))
    on conflict (entity_kind, record_id) do update set
      enqueued_at = least(topic_reindex_queue.enqueued_at, excluded.enqueued_at)
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

create or replace function public.process_topic_reindex_queue(requested_batch_size integer default 40)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  kind text;
  queued_ids bigint[];
  source_group record;
  processed integer := 0;
  batch_size integer := greatest(10, least(coalesce(requested_batch_size, 40), 100));
begin
  select entity_kind into kind from public.topic_reindex_queue
  group by entity_kind order by min(enqueued_at) limit 1;
  if kind is null then return jsonb_build_object('status', 'idle', 'processed', 0); end if;

  select coalesce(array_agg(record_id order by enqueued_at, record_id), '{}') into queued_ids
  from (
    select record_id, enqueued_at from public.topic_reindex_queue
    where entity_kind = kind order by enqueued_at, record_id limit batch_size
    for update skip locked
  ) queued;
  if cardinality(queued_ids) = 0 then return jsonb_build_object('status', 'busy', 'processed', 0); end if;

  if kind = 'research' then
    for source_group in
      select source_id, array_agg(external_id) external_ids
      from public.research_items where id = any(queued_ids) group by source_id
    loop
      perform public.reindex_research_source_records(source_group.source_id, source_group.external_ids);
    end loop;
  else
    for source_group in
      select source_id, array_agg(external_id) external_ids
      from public.clinical_trials where id = any(queued_ids) group by source_id
    loop
      perform public.reindex_trial_source_records(source_group.source_id, source_group.external_ids);
    end loop;
  end if;

  delete from public.topic_reindex_queue
  where entity_kind = kind and record_id = any(queued_ids);
  processed := cardinality(queued_ids);
  return jsonb_build_object('status', 'processed', 'entity_kind', kind, 'processed', processed);
exception when others then
  update public.topic_reindex_queue set attempts = least(attempts + 1, 20), last_error = sqlerrm
  where entity_kind = kind and record_id = any(coalesce(queued_ids, '{}'));
  raise;
end;
$$;

-- Trials previously waited behind the complete research corpus. This worker
-- locks only the trial checkpoint, allowing both corpora to advance safely in
-- parallel without sharing a transaction.
create or replace function public.process_trial_taxonomy_reindex(requested_batch_size integer default 250)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_row public.topic_taxonomy_reindex_runs%rowtype;
  record_ids bigint[];
  batch_count integer := 0;
  batch_last_id bigint := 0;
  current_max bigint := 0;
  batch_size integer := greatest(25, least(coalesce(requested_batch_size, 250), 400));
begin
  select * into run_row from public.topic_taxonomy_reindex_runs
  where entity_kind = 'trials' and status in ('pending', 'running')
  order by started_at desc limit 1 for update skip locked;
  if not found then return jsonb_build_object('status', 'idle', 'entity_kind', 'trials'); end if;
  update public.topic_taxonomy_reindex_runs set status = 'running', updated_at = now(), last_error = null
  where taxonomy_version = run_row.taxonomy_version and entity_kind = 'trials';

  select coalesce(array_agg(id order by id), '{}'), count(*), coalesce(max(id), run_row.cursor_id)
    into record_ids, batch_count, batch_last_id
  from (
    select id from public.clinical_trials
    where id > run_row.cursor_id and id <= run_row.upper_bound_id
    order by id limit batch_size
  ) batch;
  if batch_count > 0 then
    delete from public.clinical_trial_topics relation
    where relation.clinical_trial_id = any(record_ids) and relation.matched_by <> 'curated-rule';
    insert into public.clinical_trial_topics(
      clinical_trial_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select trial.id, topic.slug, 'source-query', (assessment->>'score')::smallint,
      assessment->'reasons', array(select jsonb_array_elements_text(assessment->'matched_fields')),
      (assessment->>'publish')::boolean, now()
    from public.clinical_trials trial
    cross join public.intelligence_topics topic
    cross join lateral public.topic_match_assessment(
      topic.slug, trial.title, trial.brief_summary,
      array_to_string(trial.controlled_terms, ' '), trial.study_type
    ) as matched(assessment)
    where trial.id = any(record_ids) and topic.enabled and (assessment->>'publish')::boolean
    on conflict (clinical_trial_id, topic_slug) do update set
      matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
      is_published = excluded.is_published, evaluated_at = excluded.evaluated_at;
    perform public.refresh_trial_quality(record_ids);
    update public.clinical_trials trial set
      relevance_confidence = 0, publication_state = 'quarantined',
      match_explanation = 'Quarantined automatically because no publishable relationship remained after the complete taxonomy reindex.',
      quality_checked_at = now()
    where trial.id = any(record_ids)
      and not exists (select 1 from public.clinical_trial_topics relation where relation.clinical_trial_id = trial.id and relation.is_published);
    update public.topic_taxonomy_reindex_runs set
      cursor_id = batch_last_id, records_processed = records_processed + batch_count,
      status = 'pending', updated_at = now()
    where taxonomy_version = run_row.taxonomy_version and entity_kind = 'trials';
  else
    select coalesce(max(id), 0) into current_max from public.clinical_trials;
    if current_max > run_row.upper_bound_id then
      update public.topic_taxonomy_reindex_runs set upper_bound_id = current_max, status = 'pending', updated_at = now()
      where taxonomy_version = run_row.taxonomy_version and entity_kind = 'trials';
    else
      update public.topic_taxonomy_reindex_runs set status = 'complete', completed_at = now(), updated_at = now()
      where taxonomy_version = run_row.taxonomy_version and entity_kind = 'trials';
    end if;
  end if;
  perform public.refresh_topic_coverage_readiness();
  return jsonb_build_object('status', case when batch_count > 0 then 'processed' else 'checkpoint' end,
    'entity_kind', 'trials', 'records_processed', batch_count, 'cursor_id', batch_last_id);
exception when others then
  update public.topic_taxonomy_reindex_runs set status = 'pending', last_error = sqlerrm, updated_at = now()
  where taxonomy_version = run_row.taxonomy_version and entity_kind = 'trials';
  raise;
end;
$$;

revoke all on function public.enqueue_research_source_records_for_reindex(text,text[]),
  public.enqueue_trial_source_records_for_reindex(text,text[]),
  public.process_topic_reindex_queue(integer),
  public.process_trial_taxonomy_reindex(integer) from public, anon, authenticated;
grant execute on function public.enqueue_research_source_records_for_reindex(text,text[]),
  public.enqueue_trial_source_records_for_reindex(text,text[]),
  public.process_topic_reindex_queue(integer),
  public.process_trial_taxonomy_reindex(integer) to service_role;

-- Retry transient failures now that the expensive work has left the ingestion
-- transaction. No completed or permanently dead work is rewritten.
update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  last_error = null, updated_at = now()
where status = 'retry'
  and (last_error like 'canceling statement due to statement timeout%'
    or last_error like 'ON CONFLICT DO UPDATE command cannot affect row a second time%');

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-taxonomy-reindex' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-taxonomy-reindex',
    '* 0-7 * * *',
    $job$select public.process_topic_taxonomy_reindex(250);$job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-trial-taxonomy-reindex' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-trial-taxonomy-reindex',
    '* 0-7 * * *',
    $job$select public.process_trial_taxonomy_reindex(250);$job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-reindex-queue' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-reindex-queue',
    '*/2 * * * *',
    $job$select public.process_topic_reindex_queue(40);$job$
  );
end
$schedule$;

notify pgrst, 'reload schema';
