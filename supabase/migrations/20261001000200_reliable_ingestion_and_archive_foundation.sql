-- Production-safe ingestion reliability and the additive foundation for
-- candidate cold storage. This migration does not delete, compact, move, or
-- change the publication state of any evidence record.

-- Keep a durable, auditable manifest before any future payload is moved to
-- private object storage. The archive worker is deliberately not scheduled by
-- this migration; copying and cutover remain separate, reversible stages.
create table if not exists public.research_candidate_archive_manifest (
  research_item_id bigint primary key references public.research_items(id) on delete cascade,
  source_id text not null references public.content_sources(id),
  external_id text not null,
  object_path text not null unique,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_bytes bigint not null check (payload_bytes > 0),
  source_last_seen_at timestamptz not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'verified', 'compacted', 'failed')),
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz,
  compacted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists research_candidate_archive_status_idx
  on public.research_candidate_archive_manifest(status, research_item_id);

create table if not exists public.research_candidate_archive_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  candidates_examined integer not null default 0 check (candidates_examined >= 0),
  payloads_uploaded integer not null default 0 check (payloads_uploaded >= 0),
  payloads_verified integer not null default 0 check (payloads_verified >= 0),
  bytes_uploaded bigint not null default 0 check (bytes_uploaded >= 0),
  error_code text,
  details jsonb not null default '{}'::jsonb
);

alter table public.research_candidate_archive_manifest enable row level security;
alter table public.research_candidate_archive_runs enable row level security;
revoke all on table public.research_candidate_archive_manifest,
  public.research_candidate_archive_runs from public, anon, authenticated;
grant all on table public.research_candidate_archive_manifest,
  public.research_candidate_archive_runs to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-candidate-archive',
  'research-candidate-archive',
  false,
  5242880,
  array['application/json', 'application/gzip']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.get_research_candidate_archive_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'uploaded', count(*) filter (where status = 'uploaded'),
    'verified', count(*) filter (where status = 'verified'),
    'compacted', count(*) filter (where status = 'compacted'),
    'failed', count(*) filter (where status = 'failed'),
    'verified_bytes', coalesce(sum(payload_bytes) filter (where status in ('verified','compacted')), 0),
    'last_verified_at', max(verified_at)
  ) from public.research_candidate_archive_manifest;
$$;

revoke all on function public.get_research_candidate_archive_report() from public, anon, authenticated;
grant execute on function public.get_research_candidate_archive_report() to service_role;

-- Canonicalize names before creating journal and sponsor identities. Case and
-- whitespace variants previously produced the same primary key twice inside a
-- single INSERT, aborting the nightly entity refresh.
create or replace function public.refresh_intelligence_entities()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '300s'
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_intelligence_entities', 0)) then
    return;
  end if;

  delete from public.intelligence_entities where kind <> 'topic';

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'topic', t.slug, t.name, t.description,
    (select count(*) from public.research_item_topics rit join public.research_items ri on ri.id = rit.research_item_id where rit.topic_slug = t.slug and rit.is_published and ri.publication_state = 'published')
    + (select count(*) from public.clinical_trial_topics ctt join public.clinical_trials ct on ct.id = ctt.clinical_trial_id where ctt.topic_slug = t.slug and ctt.is_published and ct.publication_state = 'published'),
    greatest(t.updated_at, now()), jsonb_build_object('eligibility', 'first-class-topic')
  from public.intelligence_topics t where t.enabled
  on conflict (kind, slug) do update set name = excluded.name, description = excluded.description,
    record_count = excluded.record_count, last_seen_at = excluded.last_seen_at,
    metadata = excluded.metadata, updated_at = now();

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'journal', public.entity_slug(canonical_name) || '-' || substr(md5(canonical_name), 1, 8),
    display_name, 'Automatically generated journal entity from published source metadata.',
    record_count, last_seen_at, jsonb_build_object('minimum_records', 3)
  from (
    select lower(trim(regexp_replace(journal, '\s+', ' ', 'g'))) canonical_name,
      min(trim(regexp_replace(journal, '\s+', ' ', 'g'))) display_name,
      count(*)::integer record_count, max(last_seen_at) last_seen_at
    from public.research_items
    where publication_state = 'published' and nullif(trim(journal), '') is not null
    group by lower(trim(regexp_replace(journal, '\s+', ' ', 'g')))
    having count(*) >= 3
  ) journals
  where public.entity_slug(canonical_name) <> '';

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'sponsor', public.entity_slug(canonical_name) || '-' || substr(md5(canonical_name), 1, 8),
    display_name, 'Automatically generated trial-sponsor entity from registry metadata.',
    record_count, last_seen_at, jsonb_build_object('minimum_records', 2)
  from (
    select lower(trim(regexp_replace(sponsor, '\s+', ' ', 'g'))) canonical_name,
      min(trim(regexp_replace(sponsor, '\s+', ' ', 'g'))) display_name,
      count(*)::integer record_count, max(last_seen_at) last_seen_at
    from public.clinical_trials
    where publication_state = 'published' and nullif(trim(sponsor), '') is not null
    group by lower(trim(regexp_replace(sponsor, '\s+', ' ', 'g')))
    having count(*) >= 2
  ) sponsors
  where public.entity_slug(canonical_name) <> '';

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'source', public.entity_slug(cs.id), cs.name,
    'Named upstream source monitored automatically by immortal.life.', counts.record_count,
    cs.last_success_at, jsonb_build_object('homepage_url', cs.homepage_url,
      'health_failures', cs.consecutive_failures, 'minimum_records', 1)
  from public.content_sources cs
  cross join lateral (
    select ((select count(*) from public.research_items where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.clinical_trials where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.regulatory_events where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.research_integrity_events where source_id = cs.id and publication_state = 'published'))::integer record_count
  ) counts
  where cs.enabled and counts.record_count >= 1;
end;
$$;

-- Build the expensive complete counts away from the live cache, then hold the
-- cache lock only for the 180-row swap. This removes the former deadlock with
-- row-level ingestion triggers while keeping exact uncapped totals.
create or replace function public.refresh_intelligence_topic_counts_cache()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '300s'
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_intelligence_topic_counts_cache', 0)) then
    return;
  end if;

  drop table if exists pg_temp.topic_counts_next;
  create temporary table topic_counts_next on commit drop as
  with research_counts as (
    select relation.topic_slug, count(*)::bigint record_count
    from public.research_item_topics relation
    join public.research_items item on item.id = relation.research_item_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  ), trial_counts as (
    select relation.topic_slug, count(*)::bigint record_count
    from public.clinical_trial_topics relation
    join public.clinical_trials item on item.id = relation.clinical_trial_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  )
  select topic.slug topic_slug, coalesce(research_counts.record_count, 0) research_count,
    coalesce(trial_counts.record_count, 0) trial_count
  from public.intelligence_topics topic
  left join research_counts on research_counts.topic_slug = topic.slug
  left join trial_counts on trial_counts.topic_slug = topic.slug
  where topic.enabled;

  lock table public.intelligence_topic_counts_cache in share row exclusive mode;
  insert into public.intelligence_topic_counts_cache(topic_slug, research_count, trial_count, refreshed_at)
  select topic_slug, research_count, trial_count, now() from topic_counts_next
  on conflict (topic_slug) do update set research_count = excluded.research_count,
    trial_count = excluded.trial_count, refreshed_at = excluded.refreshed_at;

  delete from public.intelligence_topic_counts_cache cache
  where not exists (select 1 from topic_counts_next next where next.topic_slug = cache.topic_slug);
end;
$$;

revoke all on function public.refresh_intelligence_entities(),
  public.refresh_intelligence_topic_counts_cache() from public, anon, authenticated;
grant execute on function public.refresh_intelligence_entities(),
  public.refresh_intelligence_topic_counts_cache() to service_role;

-- Retry only the current database-timeout pages. Cursors remain unchanged and
-- the deployed worker will halve its write page on each retry.
update public.ingestion_jobs set
  status = 'pending', attempts = greatest(1, least(attempts, 2)),
  available_at = now(), locked_at = null, updated_at = now()
where status = 'retry'
  and last_error like '%canceling statement due to statement timeout%';

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-count-reconcile' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-topic-count-reconcile', '37 5 * * *',
    'select public.refresh_intelligence_topic_counts_cache();');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-entity-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-entity-refresh', '54 5 * * *',
    'select public.refresh_intelligence_entities();');
end
$schedule$;

notify pgrst, 'reload schema';
