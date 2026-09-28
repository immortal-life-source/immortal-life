-- During a complete taxonomy pass, newly ingested ids are picked up when the
-- worker extends its upper bound. Do not also evaluate those same records via
-- the near-real-time queue. The lightweight source-topic link remains
-- available immediately; consolidated quality is refreshed by the full pass.

create or replace function public.enqueue_research_source_records_for_reindex(p_source_id text, p_external_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  if exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'research' and status in ('pending', 'running')
  ) then return 0; end if;
  with inserted as (
    insert into public.topic_reindex_queue(entity_kind, record_id)
    select 'research', item.id from public.research_items item
    where item.source_id = p_source_id and item.external_id = any(coalesce(p_external_ids, '{}'))
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
  if exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'trials' and status in ('pending', 'running')
  ) then return 0; end if;
  with inserted as (
    insert into public.topic_reindex_queue(entity_kind, record_id)
    select 'trials', trial.id from public.clinical_trials trial
    where trial.source_id = p_source_id and trial.external_id = any(coalesce(p_external_ids, '{}'))
    on conflict (entity_kind, record_id) do update set
      enqueued_at = least(topic_reindex_queue.enqueued_at, excluded.enqueued_at)
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

-- Linking the currently requested topic must remain cheap while the complete
-- pass is already responsible for consolidated record quality.
create or replace function public.link_research_ingestion_page(
  p_source_id text, p_topic_slug text, p_links jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected_ids bigint[];
begin
  with payload as (
    select * from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as x(
      external_id text, relevance_score smallint, match_reasons jsonb,
      matched_fields text[], is_published boolean, evaluated_at timestamptz
    )
  ), linked as (
    insert into public.research_item_topics(
      research_item_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select item.id, p_topic_slug, 'source-query', payload.relevance_score,
      coalesce(payload.match_reasons, '[]'::jsonb), coalesce(payload.matched_fields, '{}'::text[]),
      coalesce(payload.is_published, false), coalesce(payload.evaluated_at, now())
    from payload join public.research_items item
      on item.source_id = p_source_id and item.external_id = payload.external_id
    on conflict (research_item_id, topic_slug) do update set
      matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
      is_published = excluded.is_published, evaluated_at = excluded.evaluated_at
    returning research_item_id
  ) select array_agg(distinct research_item_id) into affected_ids from linked;
  if coalesce(array_length(affected_ids, 1), 0) > 0 and not exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'research' and status in ('pending', 'running')
  ) then perform public.refresh_research_quality(affected_ids); end if;
  return coalesce(array_length(affected_ids, 1), 0);
end;
$$;

create or replace function public.link_trial_ingestion_page(
  p_source_id text, p_topic_slug text, p_links jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected_ids bigint[];
begin
  with payload as (
    select * from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as x(
      external_id text, relevance_score smallint, match_reasons jsonb,
      matched_fields text[], is_published boolean, evaluated_at timestamptz
    )
  ), linked as (
    insert into public.clinical_trial_topics(
      clinical_trial_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select trial.id, p_topic_slug, 'source-query', payload.relevance_score,
      coalesce(payload.match_reasons, '[]'::jsonb), coalesce(payload.matched_fields, '{}'::text[]),
      coalesce(payload.is_published, false), coalesce(payload.evaluated_at, now())
    from payload join public.clinical_trials trial
      on trial.source_id = p_source_id and trial.external_id = payload.external_id
    on conflict (clinical_trial_id, topic_slug) do update set
      matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
      is_published = excluded.is_published, evaluated_at = excluded.evaluated_at
    returning clinical_trial_id
  ) select array_agg(distinct clinical_trial_id) into affected_ids from linked;
  if coalesce(array_length(affected_ids, 1), 0) > 0 and not exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'trials' and status in ('pending', 'running')
  ) then perform public.refresh_trial_quality(affected_ids); end if;
  return coalesce(array_length(affected_ids, 1), 0);
end;
$$;

-- Existing queued ids are inside the still-active full-run extension boundary;
-- removing them avoids duplicate 180-topic evaluation, not source data loss.
delete from public.topic_reindex_queue queue
using public.topic_taxonomy_reindex_runs run
where run.entity_kind = queue.entity_kind
  and run.status in ('pending', 'running');

-- Expired page tokens and the six previously over-complex DOAJ searches can
-- now restart from their durable beginning. Upserts keep this idempotent.
update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  cursor_state = '{}'::jsonb, last_error = null, updated_at = now()
where (source_id = 'doaj' and status = 'dead' and last_error = 'Upstream 400 from doaj.org')
   or (source_id = 'clinicaltrials-gov' and status in ('retry', 'dead') and (
     last_error like 'Upstream 400 from clinicaltrials.gov%'
     or last_error = '[object Object]'
     or last_error like 'canceling statement due to statement timeout%'
   ));

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-reindex-queue' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-reindex-queue',
    '* * * * *',
    $job$select public.process_topic_reindex_queue(60);$job$
  );
end
$schedule$;

notify pgrst, 'reload schema';
