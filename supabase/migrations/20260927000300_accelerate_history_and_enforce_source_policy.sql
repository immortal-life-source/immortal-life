-- Accelerate the uncapped historical backfill without allowing it to crowd out
-- current updates, and make source reuse approval explicit and auditable.

-- One database call now persists the topic links for a complete research API
-- page and refreshes quality for exactly those records.
create or replace function public.link_research_ingestion_page(
  p_source_id text,
  p_topic_slug text,
  p_links jsonb
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
      external_id text,
      relevance_score smallint,
      match_reasons jsonb,
      matched_fields text[],
      is_published boolean,
      evaluated_at timestamptz
    )
  ), linked as (
    insert into public.research_item_topics(
      research_item_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select item.id, p_topic_slug, 'source-query', payload.relevance_score,
      coalesce(payload.match_reasons, '[]'::jsonb),
      coalesce(payload.matched_fields, '{}'::text[]),
      coalesce(payload.is_published, false),
      coalesce(payload.evaluated_at, now())
    from payload
    join public.research_items item
      on item.source_id = p_source_id and item.external_id = payload.external_id
    on conflict (research_item_id, topic_slug) do update set
      matched_by = excluded.matched_by,
      relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons,
      matched_fields = excluded.matched_fields,
      is_published = excluded.is_published,
      evaluated_at = excluded.evaluated_at
    returning research_item_id
  )
  select array_agg(distinct research_item_id) into affected_ids from linked;

  if coalesce(array_length(affected_ids, 1), 0) > 0 then
    perform public.refresh_research_quality(affected_ids);
  end if;
  return coalesce(array_length(affected_ids, 1), 0);
end;
$$;

create or replace function public.link_trial_ingestion_page(
  p_source_id text,
  p_topic_slug text,
  p_links jsonb
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
      external_id text,
      relevance_score smallint,
      match_reasons jsonb,
      matched_fields text[],
      is_published boolean,
      evaluated_at timestamptz
    )
  ), linked as (
    insert into public.clinical_trial_topics(
      clinical_trial_id, topic_slug, matched_by, relevance_score,
      match_reasons, matched_fields, is_published, evaluated_at
    )
    select trial.id, p_topic_slug, 'source-query', payload.relevance_score,
      coalesce(payload.match_reasons, '[]'::jsonb),
      coalesce(payload.matched_fields, '{}'::text[]),
      coalesce(payload.is_published, false),
      coalesce(payload.evaluated_at, now())
    from payload
    join public.clinical_trials trial
      on trial.source_id = p_source_id and trial.external_id = payload.external_id
    on conflict (clinical_trial_id, topic_slug) do update set
      matched_by = excluded.matched_by,
      relevance_score = excluded.relevance_score,
      match_reasons = excluded.match_reasons,
      matched_fields = excluded.matched_fields,
      is_published = excluded.is_published,
      evaluated_at = excluded.evaluated_at
    returning clinical_trial_id
  )
  select array_agg(distinct clinical_trial_id) into affected_ids from linked;

  if coalesce(array_length(affected_ids, 1), 0) > 0 then
    perform public.refresh_trial_quality(affected_ids);
  end if;
  return coalesce(array_length(affected_ids, 1), 0);
end;
$$;

-- University work/topic/institution links are persisted together after the page
-- of works has been upserted. This removes two HTTP/database round trips.
create or replace function public.link_university_ingestion_page(
  p_topic_slug text,
  p_work_ids text[],
  p_institution_links jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare link_count integer := 0;
begin
  insert into public.university_research_work_topics(openalex_work_id, topic_slug)
  select work_id, p_topic_slug
  from unnest(coalesce(p_work_ids, '{}'::text[])) work_id
  join public.university_research_works work on work.openalex_work_id = work_id
  on conflict (openalex_work_id, topic_slug) do nothing;

  with payload as (
    select * from jsonb_to_recordset(coalesce(p_institution_links, '[]'::jsonb))
      as x(openalex_work_id text, openalex_id text)
  ), inserted as (
    insert into public.university_research_work_institutions(openalex_work_id, openalex_id)
    select payload.openalex_work_id, payload.openalex_id
    from payload
    join public.university_research_works work using (openalex_work_id)
    join public.university_research_institutions institution using (openalex_id)
    on conflict (openalex_work_id, openalex_id) do nothing
    returning 1
  )
  select count(*) into link_count from inserted;
  return link_count;
end;
$$;

revoke all on function public.link_research_ingestion_page(text,text,jsonb), public.link_trial_ingestion_page(text,text,jsonb), public.link_university_ingestion_page(text,text[],jsonb) from public, anon, authenticated;
grant execute on function public.link_research_ingestion_page(text,text,jsonb), public.link_trial_ingestion_page(text,text,jsonb), public.link_university_ingestion_page(text,text[],jsonb) to service_role;

-- Source approvals fail closed, expire, and leave an internal audit trail.
alter table public.content_sources add column if not exists rights_review_due_at date;
alter table public.global_resources add column if not exists rights_review_due_at date;

update public.content_sources
set rights_review_due_at = coalesce(rights_review_due_at, rights_reviewed_at + 180)
where rights_reviewed_at is not null;

create table if not exists public.source_rights_decisions (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id) on delete cascade,
  decision text not null check (decision in ('approved', 'link_only', 'blocked', 'expired')),
  rights_class text not null,
  automated_ingestion_allowed boolean not null,
  public_display_allowed boolean not null,
  paid_distribution_allowed boolean not null,
  permitted_content_scope text not null,
  rights_basis text,
  reviewed_at date,
  review_due_at date,
  recorded_at timestamptz not null default now(),
  recorded_by text not null default current_user
);

alter table public.source_rights_decisions enable row level security;
revoke all on table public.source_rights_decisions from public, anon, authenticated;
grant all on table public.source_rights_decisions to service_role;

create or replace function public.validate_source_rights_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.automated_ingestion_allowed or new.public_display_allowed or new.paid_distribution_allowed then
    if new.rights_class <> 'commercial'
       or nullif(btrim(coalesce(new.rights_basis, '')), '') is null
       or new.rights_reviewed_at is null
       or new.rights_review_due_at is null
       or new.rights_review_due_at < current_date then
      raise exception 'Source % cannot be activated without a current explicit reuse approval', new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.audit_source_rights_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.source_rights_decisions(
    source_id, decision, rights_class, automated_ingestion_allowed,
    public_display_allowed, paid_distribution_allowed, permitted_content_scope,
    rights_basis, reviewed_at, review_due_at
  ) values (
    new.id,
    case
      when new.rights_review_due_at is not null and new.rights_review_due_at < current_date then 'expired'
      when new.rights_class = 'blocked' then 'blocked'
      when new.automated_ingestion_allowed then 'approved'
      else 'link_only'
    end,
    new.rights_class, new.automated_ingestion_allowed,
    new.public_display_allowed, new.paid_distribution_allowed,
    new.permitted_content_scope, new.rights_basis,
    new.rights_reviewed_at, new.rights_review_due_at
  );
  return new;
end;
$$;

drop trigger if exists validate_source_rights_activation on public.content_sources;
create trigger validate_source_rights_activation
before insert or update of rights_class, automated_ingestion_allowed, public_display_allowed,
  paid_distribution_allowed, rights_basis, rights_reviewed_at, rights_review_due_at
on public.content_sources for each row execute function public.validate_source_rights_activation();

drop trigger if exists audit_source_rights_decision on public.content_sources;
create trigger audit_source_rights_decision
after insert or update of rights_class, automated_ingestion_allowed, public_display_allowed,
  paid_distribution_allowed, rights_basis, rights_reviewed_at, rights_review_due_at
on public.content_sources for each row execute function public.audit_source_rights_decision();

insert into public.source_rights_decisions(
  source_id, decision, rights_class, automated_ingestion_allowed,
  public_display_allowed, paid_distribution_allowed, permitted_content_scope,
  rights_basis, reviewed_at, review_due_at
)
select id,
  case when rights_class = 'blocked' then 'blocked' when automated_ingestion_allowed then 'approved' else 'link_only' end,
  rights_class, automated_ingestion_allowed, public_display_allowed,
  paid_distribution_allowed, permitted_content_scope, rights_basis,
  rights_reviewed_at, rights_review_due_at
from public.content_sources source
where not exists (select 1 from public.source_rights_decisions decision where decision.source_id = source.id);

create or replace function public.expire_unreviewed_source_rights()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare expired_count integer;
begin
  with expired as (
    update public.content_sources
    set automated_ingestion_allowed = false,
        public_display_allowed = false,
        paid_distribution_allowed = false,
        enabled = false,
        updated_at = now()
    where (automated_ingestion_allowed or public_display_allowed or paid_distribution_allowed)
      and (rights_review_due_at is null or rights_review_due_at < current_date)
    returning id
  ) select count(*) into expired_count from expired;

  update public.global_resources resource
  set integration_status = 'directory',
      automated_ingestion_allowed = false,
      paid_distribution_allowed = false,
      rights_review_due_at = source.rights_review_due_at,
      updated_at = now()
  from public.content_sources source
  where resource.content_source_id = source.id
    and not source.automated_ingestion_allowed;
  return expired_count;
end;
$$;

revoke all on function public.validate_source_rights_activation(), public.audit_source_rights_decision(), public.expire_unreviewed_source_rights() from public, anon, authenticated;
grant execute on function public.validate_source_rights_activation(), public.audit_source_rights_decision(), public.expire_unreviewed_source_rights() to service_role;

-- Private hourly throughput snapshots provide a measurable 72-hour before/after
-- view. No visitor-facing request reads this table.
create table if not exists public.ingestion_throughput_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  marker text not null default 'scheduled',
  history_succeeded integer not null,
  history_open integer not null,
  history_pages bigint not null,
  history_items_seen bigint not null,
  history_items_written bigint not null,
  university_topics_complete integer not null,
  university_topics_total integer not null,
  university_pages bigint not null,
  university_records bigint not null,
  database_size_bytes bigint not null,
  source_progress jsonb not null default '{}'::jsonb
);

create index if not exists ingestion_throughput_snapshots_captured_idx
  on public.ingestion_throughput_snapshots(captured_at desc);
alter table public.ingestion_throughput_snapshots enable row level security;
revoke all on table public.ingestion_throughput_snapshots from public, anon, authenticated;
grant all on table public.ingestion_throughput_snapshots to service_role;

create or replace function public.capture_ingestion_throughput_snapshot(p_marker text default 'scheduled')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare snapshot_id bigint;
begin
  insert into public.ingestion_throughput_snapshots(
    marker, history_succeeded, history_open, history_pages,
    history_items_seen, history_items_written, university_topics_complete,
    university_topics_total, university_pages, university_records,
    database_size_bytes, source_progress
  )
  select p_marker,
    count(*) filter (where job.sync_mode = 'history' and job.status = 'succeeded'),
    count(*) filter (where job.sync_mode = 'history' and job.status in ('pending','retry','running')),
    coalesce(sum(job.pages_processed) filter (where job.sync_mode = 'history'), 0),
    coalesce(sum(job.items_seen) filter (where job.sync_mode = 'history'), 0),
    coalesce(sum(job.items_written) filter (where job.sync_mode = 'history'), 0),
    (select count(*) from public.university_topic_sync_state where phase = 'complete'),
    (select count(*) from public.university_topic_sync_state),
    (select coalesce(sum(pages_processed), 0) from public.university_topic_sync_state),
    (select coalesce(sum(records_processed), 0) from public.university_topic_sync_state),
    pg_database_size(current_database()),
    coalesce(jsonb_object_agg(job.source_id, jsonb_build_object(
      'succeeded', job.succeeded, 'open', job.open,
      'pages', job.source_pages, 'items_written', job.source_items_written
    )), '{}'::jsonb)
  from (
    select source_id, sync_mode, status, pages_processed, items_seen, items_written,
      count(*) filter (where sync_mode = 'history' and status = 'succeeded') over (partition by source_id) succeeded,
      count(*) filter (where sync_mode = 'history' and status in ('pending','retry','running')) over (partition by source_id) open,
      sum(pages_processed) filter (where sync_mode = 'history') over (partition by source_id) source_pages,
      sum(items_written) filter (where sync_mode = 'history') over (partition by source_id) source_items_written
    from public.ingestion_jobs
  ) job
  where job.sync_mode = 'history'
  returning id into snapshot_id;
  return snapshot_id;
end;
$$;

-- Compact, private report used by the daily management email.
create or replace function public.get_ingestion_throughput_report(p_hours integer default 72)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with latest as (
    select * from public.ingestion_throughput_snapshots order by captured_at desc limit 1
  ), baseline as (
    select * from public.ingestion_throughput_snapshots
    where captured_at <= now() - make_interval(hours => greatest(1, least(p_hours, 720)))
    order by captured_at desc limit 1
  )
  select jsonb_build_object(
    'captured_at', latest.captured_at,
    'window_hours', greatest(1, extract(epoch from (latest.captured_at - coalesce(baseline.captured_at, latest.captured_at))) / 3600),
    'history_succeeded', latest.history_succeeded,
    'history_open', latest.history_open,
    'history_pages', latest.history_pages,
    'history_items_written', latest.history_items_written,
    'pages_per_hour', case when baseline.id is null or latest.captured_at = baseline.captured_at then null else round((latest.history_pages - baseline.history_pages)::numeric / greatest(1, extract(epoch from (latest.captured_at - baseline.captured_at)) / 3600), 2) end,
    'items_per_hour', case when baseline.id is null or latest.captured_at = baseline.captured_at then null else round((latest.history_items_written - baseline.history_items_written)::numeric / greatest(1, extract(epoch from (latest.captured_at - baseline.captured_at)) / 3600), 2) end,
    'university_topics_complete', latest.university_topics_complete,
    'university_topics_total', latest.university_topics_total,
    'university_pages', latest.university_pages,
    'university_records', latest.university_records,
    'database_size_bytes', latest.database_size_bytes,
    'source_progress', latest.source_progress
  ) from latest left join baseline on true;
$$;

revoke all on function public.capture_ingestion_throughput_snapshot(text), public.get_ingestion_throughput_report(integer) from public, anon, authenticated;
grant execute on function public.capture_ingestion_throughput_snapshot(text), public.get_ingestion_throughput_report(integer) to service_role;

-- Off-peak Prague history worker: 22:00–04:50 UTC covers midnight–06:50 CEST
-- and 23:00–05:50 CET. It is deliberately single-threaded and separate from
-- visitor reads. The current-update worker remains active around the clock.
do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-index' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-history' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-history',
    '*/10 22-23,0-4 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule-history"}'::jsonb,
        timeout_milliseconds := 65000
      );
    $job$
  );

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-score-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-university-score-refresh', '20 5 * * *', 'select public.refresh_university_research_scores();');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-ingestion-throughput' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-ingestion-throughput', '5 * * * *', 'select public.capture_ingestion_throughput_snapshot(''scheduled'');');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-source-rights-expiry' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-source-rights-expiry', '10 1 * * *', 'select public.expire_unreviewed_source_rights();');
end
$schedule$;

select public.capture_ingestion_throughput_snapshot('optimization-baseline');
