-- Replace fragile per-topic DOAJ search pagination with one resumable global
-- OAI-PMH harvest. Existing records remain in place and source ids make every
-- replay idempotent. Per-topic history is finalized only after the global
-- OAI stream reaches its natural end.

create or replace function public.link_research_ingestion_batch(
  p_source_id text, p_links jsonb
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
      external_id text, topic_slug text, relevance_score smallint,
      match_reasons jsonb, matched_fields text[], is_published boolean,
      evaluated_at timestamptz
    )
  ), linked as (
    insert into public.research_item_topics(
      research_item_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select item.id, payload.topic_slug, 'source-query', payload.relevance_score,
      coalesce(payload.match_reasons, '[]'::jsonb),
      coalesce(payload.matched_fields, '{}'::text[]),
      coalesce(payload.is_published, false), coalesce(payload.evaluated_at, now())
    from payload
    join public.research_items item
      on item.source_id = p_source_id and item.external_id = payload.external_id
    join public.intelligence_topics topic
      on topic.slug = payload.topic_slug and topic.enabled
    on conflict (research_item_id, topic_slug) do update set
      matched_by = excluded.matched_by,
      relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons,
      matched_fields = excluded.matched_fields,
      is_published = excluded.is_published,
      evaluated_at = excluded.evaluated_at
    returning research_item_id
  ) select array_agg(distinct research_item_id) into affected_ids from linked;

  if coalesce(array_length(affected_ids, 1), 0) > 0 and not exists (
    select 1 from public.topic_taxonomy_reindex_runs
    where entity_kind = 'research' and status in ('pending', 'running')
  ) then
    perform public.refresh_research_quality(affected_ids);
  end if;
  return coalesce(array_length(affected_ids, 1), 0);
end;
$$;

create or replace function public.finalize_doaj_oai_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare finalized_count integer;
begin
  update public.ingestion_jobs
  set status = 'succeeded', attempts = 0, completed_at = now(),
      available_at = now(), locked_at = null, cursor_state = '{}'::jsonb,
      last_error = null, updated_at = now()
  where source_id = 'doaj' and sync_mode = 'history'
    and topic_slug is not null;
  get diagnostics finalized_count = row_count;
  perform public.refresh_topic_coverage_readiness();
  return finalized_count;
end;
$$;

create or replace function public.get_doaj_oai_harvest_report()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', status,
      'sync_mode', sync_mode,
      'pages_processed', pages_processed,
      'items_seen', items_seen,
      'items_written', items_written,
      'total_available', total_available,
      'source_cursor', cursor_state ->> 'cursor',
      'last_datestamp', cursor_state ->> 'lastDatestamp',
      'attempts', attempts,
      'last_error', last_error,
      'available_at', available_at,
      'updated_at', updated_at,
      'completed_at', completed_at
    )
    from public.ingestion_jobs
    where source_id = 'doaj' and job_key = 'oai:global:history'
      and window_start = '1800-01-01 00:00:00+00'
    limit 1
  ), jsonb_build_object('status', 'not_started'));
$$;

revoke all on function public.link_research_ingestion_batch(text,jsonb),
  public.finalize_doaj_oai_history(), public.get_doaj_oai_harvest_report()
  from public, anon, authenticated;
grant execute on function public.link_research_ingestion_batch(text,jsonb),
  public.finalize_doaj_oai_history(), public.get_doaj_oai_harvest_report()
  to service_role;

update public.content_sources set
  api_url = 'https://doaj.org/oai.article',
  update_cadence = 'Continuous historical OAI-PMH harvest; rolling updates every 6 hours',
  permitted_content_scope = 'Article-level bibliographic metadata, authors, journal, identifiers and keywords only; excludes stored abstracts, full text and publisher media.',
  rights_basis = 'DOAJ article-level metadata is available under CC0 through its public OAI-PMH service; article content remains with its copyright holder.',
  rights_reviewed_at = current_date,
  updated_at = now()
where id = 'doaj';

update public.global_resources set
  data_url = 'https://doaj.org/oai.article',
  access_mode = 'feed', integration_status = 'live',
  update_cadence = 'Continuous historical OAI-PMH harvest; rolling updates every 6 hours',
  healthcheck_url = 'https://doaj.org/oai.article?verb=Identify',
  permitted_content_scope = 'Article-level bibliographic metadata, authors, journal, identifiers and keywords only; excludes stored abstracts, full text and publisher media.',
  rights_basis = 'DOAJ article-level metadata is available under CC0 through its public OAI-PMH service; article content remains with its copyright holder.',
  rights_reviewed_at = current_date,
  updated_at = now()
where id = 'doaj';

-- One global history job replaces 180 repeated searches. The per-topic rows
-- remain pending and visible to readiness reporting until reconciliation.
insert into public.ingestion_jobs(
  source_id, topic_slug, job_key, window_start, sync_mode, status,
  available_at, cursor_state
)
values (
  'doaj', null, 'oai:global:history', '1800-01-01 00:00:00+00',
  'history', 'pending', now(), '{}'::jsonb
)
on conflict (source_id, job_key, window_start) do update set
  status = case when ingestion_jobs.status = 'succeeded' then ingestion_jobs.status else 'pending' end,
  available_at = case when ingestion_jobs.status = 'succeeded' then ingestion_jobs.available_at else now() end,
  attempts = case when ingestion_jobs.status = 'succeeded' then ingestion_jobs.attempts else 0 end,
  locked_at = null,
  last_error = case when ingestion_jobs.status = 'succeeded' then ingestion_jobs.last_error else null end,
  updated_at = now();

update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = '9999-12-31 00:00:00+00',
  locked_at = null, completed_at = null, cursor_state = '{}'::jsonb,
  last_error = 'Waiting for the shared DOAJ OAI-PMH history harvest',
  updated_at = now()
where source_id = 'doaj' and sync_mode = 'history' and topic_slug is not null;

-- Old per-topic incremental searches are superseded by the shared rolling
-- OAI job. No source records or topic links are removed.
update public.ingestion_jobs set
  status = 'succeeded', attempts = 0, completed_at = now(), available_at = now(),
  locked_at = null, last_error = null, updated_at = now()
where source_id = 'doaj' and sync_mode = 'incremental' and topic_slug is not null;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-doaj-sync' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-doaj-sync',
    '*/3 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"doaj","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$schedule$;

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"source":"doaj","trigger":"manual"}'::jsonb,
  timeout_milliseconds := 120000
);

notify pgrst, 'reload schema';
