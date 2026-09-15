-- Automated relevance quality, entity discovery, indexing telemetry, and
-- programmatic briefing distribution. No human-review state exists by design.

alter table public.research_items
  add column if not exists abstract_text text,
  add column if not exists controlled_terms text[] not null default '{}',
  add column if not exists relevance_confidence smallint not null default 0 check (relevance_confidence between 0 and 100),
  add column if not exists source_quality_score smallint not null default 0 check (source_quality_score between 0 and 100),
  add column if not exists freshness_score smallint not null default 0 check (freshness_score between 0 and 100),
  add column if not exists publication_state text not null default 'published' check (publication_state in ('published', 'quarantined')),
  add column if not exists match_explanation text not null default 'Legacy record awaiting automated quality evaluation.',
  add column if not exists quality_checked_at timestamptz,
  add column if not exists duplicate_cluster_key text,
  add column if not exists duplicate_of_id bigint references public.research_items(id) on delete set null;

alter table public.clinical_trials
  add column if not exists controlled_terms text[] not null default '{}',
  add column if not exists relevance_confidence smallint not null default 0 check (relevance_confidence between 0 and 100),
  add column if not exists source_quality_score smallint not null default 0 check (source_quality_score between 0 and 100),
  add column if not exists freshness_score smallint not null default 0 check (freshness_score between 0 and 100),
  add column if not exists publication_state text not null default 'published' check (publication_state in ('published', 'quarantined')),
  add column if not exists match_explanation text not null default 'Legacy record awaiting automated quality evaluation.',
  add column if not exists quality_checked_at timestamptz,
  add column if not exists duplicate_cluster_key text,
  add column if not exists duplicate_of_id bigint references public.clinical_trials(id) on delete set null;

alter table public.regulatory_events
  add column if not exists relevance_confidence smallint not null default 0 check (relevance_confidence between 0 and 100),
  add column if not exists source_quality_score smallint not null default 100 check (source_quality_score between 0 and 100),
  add column if not exists freshness_score smallint not null default 0 check (freshness_score between 0 and 100),
  add column if not exists publication_state text not null default 'published' check (publication_state in ('published', 'quarantined')),
  add column if not exists match_explanation text not null default 'Official-source record awaiting automated quality evaluation.',
  add column if not exists quality_checked_at timestamptz,
  add column if not exists duplicate_cluster_key text,
  add column if not exists duplicate_of_id bigint references public.regulatory_events(id) on delete set null;

alter table public.research_integrity_events
  add column if not exists relevance_confidence smallint not null default 100 check (relevance_confidence between 0 and 100),
  add column if not exists source_quality_score smallint not null default 95 check (source_quality_score between 0 and 100),
  add column if not exists freshness_score smallint not null default 100 check (freshness_score between 0 and 100),
  add column if not exists publication_state text not null default 'published' check (publication_state in ('published', 'quarantined')),
  add column if not exists match_explanation text not null default 'Matched by a source-provided integrity relationship to an indexed record.',
  add column if not exists quality_checked_at timestamptz not null default now();

alter table public.research_item_topics
  add column if not exists relevance_score smallint not null default 0 check (relevance_score between 0 and 100),
  add column if not exists match_reasons jsonb not null default '[]'::jsonb,
  add column if not exists matched_fields text[] not null default '{}',
  add column if not exists is_published boolean not null default false,
  add column if not exists evaluated_at timestamptz;

alter table public.clinical_trial_topics
  add column if not exists relevance_score smallint not null default 0 check (relevance_score between 0 and 100),
  add column if not exists match_reasons jsonb not null default '[]'::jsonb,
  add column if not exists matched_fields text[] not null default '{}',
  add column if not exists is_published boolean not null default false,
  add column if not exists evaluated_at timestamptz;

create index if not exists research_items_public_quality_idx
  on public.research_items (publication_state, relevance_confidence desc, published_on desc nulls last);
create index if not exists clinical_trials_public_quality_idx
  on public.clinical_trials (publication_state, relevance_confidence desc, last_update_date desc nulls last);
create index if not exists regulatory_events_public_quality_idx
  on public.regulatory_events (publication_state, published_at desc nulls last);
create index if not exists research_item_topics_public_idx
  on public.research_item_topics (topic_slug, is_published, relevance_score desc);
create index if not exists clinical_trial_topics_public_idx
  on public.clinical_trial_topics (topic_slug, is_published, relevance_score desc);
create index if not exists research_items_duplicate_cluster_idx
  on public.research_items (duplicate_cluster_key) where duplicate_cluster_key is not null;
create index if not exists clinical_trials_duplicate_cluster_idx
  on public.clinical_trials (duplicate_cluster_key) where duplicate_cluster_key is not null;

create or replace function public.quality_topic_anchor(topic text, body text)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select case topic
    when 'rapamycin' then body ~* '(rapamycin|sirolimus|everolimus|rapalog|mTOR inhibitor)'
    when 'senolytics' then body ~* '(senolytic|senomorphic|cellular senescence|senescent cell)'
    when 'partial-reprogramming' then body ~* '(partial reprogramming|epigenetic reprogramming|Yamanaka|OSKM)'
    when 'metformin' then body ~* 'metformin'
    when 'glp-1-therapies' then body ~* '(GLP-?1|semaglutide|tirzepatide|liraglutide)'
    when 'exercise' then body ~* '(exercise|physical activity|cardiorespiratory fitness)'
    when 'caloric-restriction' then body ~* '(calori(c|e) restriction|intermittent fasting|time-restricted eating)'
    when 'sleep' then body ~* '(sleep|circadian)'
    when 'epigenetic-clocks' then body ~* '(epigenetic clock|DNA methylation age|biological age clock|PhenoAge|GrimAge)'
    when 'plasma-exchange' then body ~* '(plasma exchange|plasmapheresis|plasma dilution)'
    when 'stem-cells' then body ~* '(stem cell|progenitor cell)'
    when 'gene-therapy' then body ~* '(gene therapy|gene transfer|genome editing|CRISPR)'
    else false end;
$$;

create or replace function public.quality_ageing_context(body text)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select body ~* '(aging|ageing|longevity|lifespan|healthspan|rejuvenation|senescence|frailty|biological age|age-related|age associated|geroscience)';
$$;

-- Conservative first evaluation of legacy records. Abstract-aware scoring takes
-- over on the next autonomous source synchronization.
update public.research_item_topics rit
set relevance_score = case
      when public.quality_topic_anchor(rit.topic_slug, coalesce(ri.title, ''))
        and (rit.topic_slug not in ('glp-1-therapies','exercise','caloric-restriction','sleep','plasma-exchange','stem-cells','gene-therapy')
          or public.quality_ageing_context(coalesce(ri.title, '') || ' ' || coalesce(ri.abstract_text, ''))) then 75
      when public.quality_topic_anchor(rit.topic_slug, coalesce(ri.title, '') || ' ' || coalesce(ri.abstract_text, ''))
        and public.quality_ageing_context(coalesce(ri.title, '') || ' ' || coalesce(ri.abstract_text, '')) then 65
      when public.quality_topic_anchor(rit.topic_slug, coalesce(ri.title, '')) then 45
      else 20 end,
    matched_fields = case
      when public.quality_topic_anchor(rit.topic_slug, coalesce(ri.title, '')) then array['title']::text[]
      when public.quality_topic_anchor(rit.topic_slug, coalesce(ri.abstract_text, '')) then array['abstract']::text[]
      else '{}'::text[] end,
    match_reasons = jsonb_build_array('Legacy record evaluated automatically against controlled title and longevity-context rules.'),
    evaluated_at = now()
from public.research_items ri
where ri.id = rit.research_item_id;

update public.research_item_topics set is_published = relevance_score >= 60;

update public.clinical_trial_topics ctt
set relevance_score = case
      when public.quality_topic_anchor(ctt.topic_slug, coalesce(ct.title, ''))
        and (ctt.topic_slug not in ('glp-1-therapies','exercise','caloric-restriction','sleep','plasma-exchange','stem-cells','gene-therapy')
          or public.quality_ageing_context(coalesce(ct.title, '') || ' ' || coalesce(ct.brief_summary, ''))) then 80
      when public.quality_topic_anchor(ctt.topic_slug, coalesce(ct.title, '') || ' ' || coalesce(ct.brief_summary, ''))
        and public.quality_ageing_context(coalesce(ct.title, '') || ' ' || coalesce(ct.brief_summary, '')) then 68
      when public.quality_topic_anchor(ctt.topic_slug, coalesce(ct.title, '')) then 45
      else 20 end,
    matched_fields = case
      when public.quality_topic_anchor(ctt.topic_slug, coalesce(ct.title, '')) then array['title']::text[]
      when public.quality_topic_anchor(ctt.topic_slug, coalesce(ct.brief_summary, '')) then array['abstract']::text[]
      else '{}'::text[] end,
    match_reasons = jsonb_build_array('Legacy trial evaluated automatically against controlled title, summary, and longevity-context rules.'),
    evaluated_at = now()
from public.clinical_trials ct
where ct.id = ctt.clinical_trial_id;

update public.clinical_trial_topics set is_published = relevance_score >= 60;

update public.research_items ri
set relevance_confidence = coalesce(q.score, 0),
    source_quality_score = case ri.source_id when 'europe-pmc' then 90 else 70 end,
    freshness_score = case
      when ri.published_on >= current_date - 180 then 100
      when ri.published_on >= current_date - 365 then 85
      when ri.published_on >= current_date - 1095 then 65
      when ri.published_on is null then 45 else 50 end,
    publication_state = case when coalesce(q.score, 0) >= 60 then 'published' else 'quarantined' end,
    match_explanation = case when coalesce(q.score, 0) >= 60
      then format('Published automatically with %s%% topic confidence after controlled-term evaluation.', q.score)
      else format('Quarantined automatically with %s%% topic confidence; controlled terms or longevity context were insufficient.', coalesce(q.score, 0)) end,
    quality_checked_at = now(),
    duplicate_cluster_key = coalesce('doi:' || nullif(lower(ri.doi), ''), 'title:' || md5(lower(regexp_replace(ri.title, '[^a-zA-Z0-9]+', '', 'g'))))
from (select research_item_id, max(relevance_score)::smallint score from public.research_item_topics group by research_item_id) q
where q.research_item_id = ri.id;

update public.research_items ri
set publication_state = 'quarantined', relevance_confidence = 0,
    match_explanation = 'Quarantined automatically because no evaluated topic relationship is available.', quality_checked_at = now()
where not exists (select 1 from public.research_item_topics rit where rit.research_item_id = ri.id);

update public.clinical_trials ct
set relevance_confidence = coalesce(q.score, 0),
    source_quality_score = case ct.source_id when 'clinicaltrials-gov' then 100 else 70 end,
    freshness_score = case
      when ct.last_update_date >= current_date - 180 then 100
      when ct.last_update_date >= current_date - 365 then 85
      when ct.last_update_date >= current_date - 1095 then 65
      when ct.last_update_date is null then 45 else 50 end,
    publication_state = case when coalesce(q.score, 0) >= 60 then 'published' else 'quarantined' end,
    match_explanation = case when coalesce(q.score, 0) >= 60
      then format('Published automatically with %s%% topic confidence after controlled-term evaluation.', q.score)
      else format('Quarantined automatically with %s%% topic confidence; controlled terms or longevity context were insufficient.', coalesce(q.score, 0)) end,
    quality_checked_at = now(),
    duplicate_cluster_key = 'registry:' || lower(ct.external_id)
from (select clinical_trial_id, max(relevance_score)::smallint score from public.clinical_trial_topics group by clinical_trial_id) q
where q.clinical_trial_id = ct.id;

update public.clinical_trials ct
set publication_state = 'quarantined', relevance_confidence = 0,
    match_explanation = 'Quarantined automatically because no evaluated topic relationship is available.', quality_checked_at = now()
where not exists (select 1 from public.clinical_trial_topics ctt where ctt.clinical_trial_id = ct.id);

with duplicates as (
  select id, min(id) over (partition by duplicate_cluster_key) leader
  from public.research_items where duplicate_cluster_key is not null
)
update public.research_items ri
set duplicate_of_id = case when duplicates.id = duplicates.leader then null else duplicates.leader end,
    publication_state = case when duplicates.id = duplicates.leader then ri.publication_state else 'quarantined' end,
    match_explanation = case when duplicates.id = duplicates.leader then ri.match_explanation else 'Quarantined automatically as a duplicate or near-duplicate of the canonical cluster record.' end
from duplicates where duplicates.id = ri.id;

update public.regulatory_events
set relevance_confidence = case when cardinality(matched_topics) > 0 then 90 else 45 end,
    freshness_score = case when published_at >= now() - interval '180 days' then 100 when published_at is null then 45 else 70 end,
    publication_state = case when cardinality(matched_topics) > 0 then 'published' else 'quarantined' end,
    match_explanation = case when cardinality(matched_topics) > 0
      then 'Published automatically because controlled longevity terminology matched an official regulatory notice.'
      else 'Quarantined automatically because the official notice did not match controlled longevity terminology.' end,
    quality_checked_at = now(),
    duplicate_cluster_key = 'source:' || source_id || ':' || external_id;

update public.research_integrity_events rie
set publication_state = case when ri.publication_state = 'published' then 'published' else 'quarantined' end,
    quality_checked_at = now()
from public.research_items ri where ri.id = rie.research_item_id;

create or replace function public.refresh_research_quality(record_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_items ri
  set relevance_confidence = coalesce(q.score, 0),
      publication_state = case when coalesce(q.score, 0) >= 60 and ri.duplicate_of_id is null then 'published' else 'quarantined' end,
      match_explanation = coalesce(q.explanation, 'Quarantined automatically because no publishable topic match remains.'),
      quality_checked_at = now()
  from (
    select rit.research_item_id, max(rit.relevance_score)::smallint score,
      (array_agg(coalesce(rit.match_reasons->>0, 'Automated controlled-term match.') order by rit.relevance_score desc))[1] explanation
    from public.research_item_topics rit where rit.research_item_id = any(record_ids)
    group by rit.research_item_id
  ) q where q.research_item_id = ri.id;

  with clusters as (
    select candidate.id, min(all_rows.id) leader
    from public.research_items candidate
    join public.research_items all_rows on all_rows.duplicate_cluster_key = candidate.duplicate_cluster_key
    where candidate.id = any(record_ids) and candidate.duplicate_cluster_key is not null
    group by candidate.id
  )
  update public.research_items ri
  set duplicate_of_id = case when clusters.id = clusters.leader then null else clusters.leader end,
      publication_state = case when clusters.id = clusters.leader and ri.relevance_confidence >= 60 then 'published' else 'quarantined' end,
      match_explanation = case when clusters.id = clusters.leader then ri.match_explanation else 'Quarantined automatically as a duplicate or near-duplicate of the canonical cluster record.' end
  from clusters where clusters.id = ri.id;
end;
$$;

create or replace function public.refresh_trial_quality(record_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clinical_trials ct
  set relevance_confidence = coalesce(q.score, 0),
      publication_state = case when coalesce(q.score, 0) >= 60 and ct.duplicate_of_id is null then 'published' else 'quarantined' end,
      match_explanation = coalesce(q.explanation, 'Quarantined automatically because no publishable topic match remains.'),
      quality_checked_at = now()
  from (
    select ctt.clinical_trial_id, max(ctt.relevance_score)::smallint score,
      (array_agg(coalesce(ctt.match_reasons->>0, 'Automated controlled-term match.') order by ctt.relevance_score desc))[1] explanation
    from public.clinical_trial_topics ctt where ctt.clinical_trial_id = any(record_ids)
    group by ctt.clinical_trial_id
  ) q where q.clinical_trial_id = ct.id;
end;
$$;

create table if not exists public.indexing_submission_log (
  id bigint generated always as identity primary key,
  provider text not null,
  submitted_count integer not null default 0,
  response_status integer,
  succeeded boolean not null,
  error_code text,
  submitted_at timestamptz not null default now()
);

create table if not exists public.intelligence_entities (
  kind text not null check (kind in ('topic', 'journal', 'sponsor', 'source')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null,
  record_count integer not null default 0 check (record_count >= 0),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (kind, slug)
);

create or replace function public.entity_slug(value text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.refresh_intelligence_entities()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at)
  select 'topic', t.slug, t.name, t.description,
    (select count(*) from public.research_item_topics rit join public.research_items ri on ri.id = rit.research_item_id where rit.topic_slug = t.slug and rit.is_published and ri.publication_state = 'published')
    + (select count(*) from public.clinical_trial_topics ctt join public.clinical_trials ct on ct.id = ctt.clinical_trial_id where ctt.topic_slug = t.slug and ctt.is_published and ct.publication_state = 'published'),
    greatest(t.updated_at, now())
  from public.intelligence_topics t where t.enabled
  on conflict (kind, slug) do update set name = excluded.name, description = excluded.description, record_count = excluded.record_count, last_seen_at = excluded.last_seen_at, updated_at = now();

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at)
  select 'journal', public.entity_slug(journal) || '-' || substr(md5(lower(journal)), 1, 8), journal,
    'Automatically generated journal entity from published source metadata.', count(*)::integer, max(last_seen_at)
  from public.research_items where publication_state = 'published' and nullif(journal, '') is not null and public.entity_slug(journal) <> ''
  group by journal
  on conflict (kind, slug) do update set name = excluded.name, record_count = excluded.record_count, last_seen_at = excluded.last_seen_at, updated_at = now();

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at)
  select 'sponsor', public.entity_slug(sponsor) || '-' || substr(md5(lower(sponsor)), 1, 8), sponsor,
    'Automatically generated trial-sponsor entity from registry metadata.', count(*)::integer, max(last_seen_at)
  from public.clinical_trials where publication_state = 'published' and nullif(sponsor, '') is not null and public.entity_slug(sponsor) <> ''
  group by sponsor
  on conflict (kind, slug) do update set name = excluded.name, record_count = excluded.record_count, last_seen_at = excluded.last_seen_at, updated_at = now();

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'source', public.entity_slug(id), name, 'Named upstream source monitored automatically by immortal.life.', 0,
    last_success_at, jsonb_build_object('homepage_url', homepage_url, 'health_failures', consecutive_failures)
  from public.content_sources where enabled
  on conflict (kind, slug) do update set name = excluded.name, last_seen_at = excluded.last_seen_at, metadata = excluded.metadata, updated_at = now();
end;
$$;

select public.refresh_intelligence_entities();

create or replace function public.get_intelligence_topic_counts()
returns table (slug text, name text, description text, sort_order integer, research_count bigint, trial_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select topic.slug, topic.name, topic.description, topic.sort_order,
    (select count(*) from public.research_item_topics rit join public.research_items ri on ri.id = rit.research_item_id where rit.topic_slug = topic.slug and rit.is_published and ri.publication_state = 'published'),
    (select count(*) from public.clinical_trial_topics ctt join public.clinical_trials ct on ct.id = ctt.clinical_trial_id where ctt.topic_slug = topic.slug and ctt.is_published and ct.publication_state = 'published')
  from public.intelligence_topics topic where topic.enabled = true order by topic.sort_order;
$$;

create table if not exists public.briefing_distribution_log (
  id bigint generated always as identity primary key,
  briefing_slug text not null references public.public_briefings(slug) on delete cascade,
  channel text not null check (channel in ('websub-rss', 'websub-atom', 'indexnow', 'webhook')),
  destination text not null,
  succeeded boolean not null,
  response_status integer,
  error_code text,
  attempted_at timestamptz not null default now()
);

create or replace function public.get_intelligence_quality_telemetry()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'research', jsonb_build_object(
      'published', (select count(*) from research_items where publication_state = 'published'),
      'quarantined', (select count(*) from research_items where publication_state = 'quarantined'),
      'average_confidence', (select coalesce(round(avg(relevance_confidence)), 0) from research_items where publication_state = 'published'),
      'duplicates_suppressed', (select count(*) from research_items where duplicate_of_id is not null)
    ),
    'trials', jsonb_build_object(
      'published', (select count(*) from clinical_trials where publication_state = 'published'),
      'quarantined', (select count(*) from clinical_trials where publication_state = 'quarantined'),
      'average_confidence', (select coalesce(round(avg(relevance_confidence)), 0) from clinical_trials where publication_state = 'published'),
      'duplicates_suppressed', (select count(*) from clinical_trials where duplicate_of_id is not null)
    ),
    'regulatory', jsonb_build_object(
      'published', (select count(*) from regulatory_events where publication_state = 'published'),
      'quarantined', (select count(*) from regulatory_events where publication_state = 'quarantined')
    ),
    'indexing', coalesce((select jsonb_build_object('provider', provider, 'submitted_count', submitted_count, 'succeeded', succeeded, 'response_status', response_status, 'submitted_at', submitted_at) from indexing_submission_log order by submitted_at desc limit 1), '{}'::jsonb),
    'distribution', coalesce((select jsonb_build_object('briefing_slug', briefing_slug, 'channel', channel, 'succeeded', succeeded, 'response_status', response_status, 'attempted_at', attempted_at) from briefing_distribution_log order by attempted_at desc limit 1), '{}'::jsonb),
    'last_completed_sync', (select max(completed_at) from ingestion_runs where status in ('succeeded', 'partial'))
  );
$$;

alter table public.indexing_submission_log enable row level security;
alter table public.intelligence_entities enable row level security;
alter table public.briefing_distribution_log enable row level security;
revoke all on table public.indexing_submission_log, public.intelligence_entities, public.briefing_distribution_log from public, anon, authenticated;
grant all on table public.indexing_submission_log, public.intelligence_entities, public.briefing_distribution_log to service_role;
revoke all on function public.refresh_research_quality(bigint[]), public.refresh_trial_quality(bigint[]), public.refresh_intelligence_entities(), public.get_intelligence_quality_telemetry() from public, anon, authenticated;
grant execute on function public.refresh_research_quality(bigint[]), public.refresh_trial_quality(bigint[]), public.refresh_intelligence_entities(), public.get_intelligence_quality_telemetry() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-briefing-distribution' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-briefing-distribution',
    '32 6 * * 1',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/distribute-public-briefing',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;

-- Refresh the current public briefing asynchronously so legacy payloads inherit
-- the new quarantine rules immediately after this migration commits.
select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/generate-public-briefing',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"quality-migration"}'::jsonb,
  timeout_milliseconds := 150000
);
