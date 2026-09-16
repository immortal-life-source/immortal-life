-- Reader growth loops: personal radar watches, a durable change ledger, and
-- privacy-preserving aggregate utility telemetry. The public site remains
-- fully automated and does not introduce comments, forums, or user posts.

create table if not exists public.member_radar_watches (
  member_id bigint not null references public.members(id) on delete cascade,
  watch_type text not null check (watch_type in ('topic', 'entity', 'country', 'trial')),
  watch_key text not null check (watch_key ~ '^[a-z0-9]+(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$|^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(label) between 1 and 180),
  created_at timestamptz not null default now(),
  primary key (member_id, watch_type, watch_key)
);

insert into public.member_radar_watches (member_id, watch_type, watch_key, label)
select w.member_id, 'topic', w.topic_slug, coalesce(t.name, initcap(replace(w.topic_slug, '-', ' ')))
from public.member_topic_watches w
left join public.intelligence_topics t on t.slug = w.topic_slug
on conflict do nothing;

create table if not exists public.member_radar_state (
  member_id bigint primary key references public.members(id) on delete cascade,
  last_seen_at timestamptz not null default (now() - interval '30 days'),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_change_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_type text not null check (event_type in (
    'new_research', 'research_updated', 'new_trial', 'trial_status_changed',
    'new_regulatory_notice', 'new_integrity_event', 'quality_state_changed'
  )),
  importance text not null default 'standard' check (importance in ('standard', 'important')),
  record_type text not null check (record_type in ('research', 'trials', 'regulatory', 'integrity')),
  record_id bigint not null,
  title text not null,
  source_url text,
  occurred_at timestamptz not null default now(),
  topic_slugs text[] not null default '{}',
  watch_keys text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_change_events_recent_idx
  on public.intelligence_change_events (occurred_at desc);
create index if not exists intelligence_change_events_topics_idx
  on public.intelligence_change_events using gin (topic_slugs);
create index if not exists intelligence_change_events_watches_idx
  on public.intelligence_change_events using gin (watch_keys);

create or replace function public.change_entity_key(kind text, value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(value), '') is null then null
    when kind in ('journal', 'sponsor') then kind || ':' || public.entity_slug(value) || '-' || substr(md5(lower(value)), 1, 8)
    when kind = 'source' then 'source:' || public.entity_slug(value)
    else kind || ':' || public.entity_slug(value)
  end;
$$;

create or replace function public.capture_intelligence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name text;
  event_importance text := 'standard';
  changed_material text;
  event_watch_keys text[] := '{}';
  event_topics text[] := '{}';
  event_metadata jsonb := '{}'::jsonb;
  event_title text;
  event_source text;
  event_record_type text;
  event_record_id bigint;
  event_occurred_at timestamptz := now();
begin
  if tg_table_name = 'research_items' then
    if new.publication_state <> 'published' then delete from public.intelligence_change_events where record_type = 'research' and record_id = new.id; return new; end if;
    event_record_type := 'research'; event_record_id := new.id; event_title := new.title; event_source := new.source_url;
    event_watch_keys := array_remove(array[public.change_entity_key('journal', new.journal), public.change_entity_key('source', new.source_id)], null);
    event_metadata := jsonb_build_object('journal', new.journal, 'status', new.status, 'confidence', new.relevance_confidence);
    if tg_op = 'INSERT' then event_name := 'new_research'; changed_material := 'new';
    elsif old.publication_state is distinct from new.publication_state then event_name := 'quality_state_changed'; changed_material := old.publication_state || '>' || new.publication_state;
    elsif old.status is distinct from new.status then event_name := 'research_updated'; event_importance := case when lower(coalesce(new.status, '')) = 'retracted' then 'important' else 'standard' end; changed_material := coalesce(old.status, '') || '>' || coalesce(new.status, '');
    elsif abs(coalesce(new.relevance_confidence, 0) - coalesce(old.relevance_confidence, 0)) >= 10 then event_name := 'quality_state_changed'; changed_material := old.relevance_confidence || '>' || new.relevance_confidence;
    else return new; end if;
  elsif tg_table_name = 'clinical_trials' then
    if new.publication_state <> 'published' then delete from public.intelligence_change_events where record_type = 'trials' and record_id = new.id; return new; end if;
    event_record_type := 'trials'; event_record_id := new.id; event_title := new.title; event_source := new.source_url;
    event_watch_keys := array_remove(array[public.change_entity_key('sponsor', new.sponsor), public.change_entity_key('source', new.source_id), 'trial:' || new.id::text], null);
    if new.countries is not null then
      event_watch_keys := event_watch_keys || coalesce((select array_agg('country:' || public.entity_slug(country)) from unnest(new.countries) country where public.entity_slug(country) <> ''), '{}');
    end if;
    event_metadata := jsonb_build_object('sponsor', new.sponsor, 'countries', coalesce(new.countries, '{}'), 'status', new.overall_status, 'confidence', new.relevance_confidence);
    if tg_op = 'INSERT' then event_name := 'new_trial'; changed_material := 'new';
    elsif old.publication_state is distinct from new.publication_state then event_name := 'quality_state_changed'; changed_material := old.publication_state || '>' || new.publication_state;
    elsif old.overall_status is distinct from new.overall_status then event_name := 'trial_status_changed'; event_importance := 'important'; changed_material := coalesce(old.overall_status, '') || '>' || coalesce(new.overall_status, '');
    else return new; end if;
  elsif tg_table_name = 'regulatory_events' then
    if new.publication_state <> 'published' then delete from public.intelligence_change_events where record_type = 'regulatory' and record_id = new.id; return new; end if;
    if tg_op <> 'INSERT' then return new; end if;
    event_name := 'new_regulatory_notice'; event_importance := 'important'; event_record_type := 'regulatory'; event_record_id := new.id; event_title := new.title; event_source := new.source_url;
    event_topics := coalesce(new.matched_topics, '{}');
    event_watch_keys := array_remove(array[public.change_entity_key('source', new.source_id), public.change_entity_key('country', new.jurisdiction)], null);
    event_metadata := jsonb_build_object('jurisdiction', new.jurisdiction, 'category', new.category, 'confidence', new.relevance_confidence);
    changed_material := coalesce(new.external_id, new.id::text);
  elsif tg_table_name = 'research_integrity_events' then
    if new.publication_state <> 'published' then delete from public.intelligence_change_events where record_type = 'integrity' and record_id = new.id; return new; end if;
    if tg_op <> 'INSERT' then return new; end if;
    event_name := 'new_integrity_event'; event_importance := 'important'; event_record_type := 'integrity'; event_record_id := new.id; event_title := new.title; event_source := new.source_url;
    event_watch_keys := array_remove(array[public.change_entity_key('source', new.source_id)], null);
    event_metadata := jsonb_build_object('event_type', new.event_type, 'research_item_id', new.research_item_id);
    changed_material := coalesce(new.event_type, '') || ':' || coalesce(new.external_id, new.id::text);
  else
    return new;
  end if;

  insert into public.intelligence_change_events (
    event_key, event_type, importance, record_type, record_id, title, source_url,
    occurred_at, topic_slugs, watch_keys, metadata
  ) values (
    event_record_type || ':' || event_record_id || ':' || event_name || ':' || substr(md5(coalesce(changed_material, '')), 1, 16),
    event_name, event_importance, event_record_type, event_record_id, event_title, event_source,
    event_occurred_at, event_topics, event_watch_keys, event_metadata
  ) on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists capture_research_change on public.research_items;
create trigger capture_research_change after insert or update on public.research_items
for each row execute function public.capture_intelligence_change();
drop trigger if exists capture_trial_change on public.clinical_trials;
create trigger capture_trial_change after insert or update on public.clinical_trials
for each row execute function public.capture_intelligence_change();
drop trigger if exists capture_regulatory_change on public.regulatory_events;
create trigger capture_regulatory_change after insert on public.regulatory_events
for each row execute function public.capture_intelligence_change();
drop trigger if exists capture_integrity_change on public.research_integrity_events;
create trigger capture_integrity_change after insert on public.research_integrity_events
for each row execute function public.capture_intelligence_change();

create or replace function public.attach_change_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'research_item_topics' and new.is_published then
    update public.intelligence_change_events
      set topic_slugs = array(select distinct unnest(topic_slugs || array[new.topic_slug]))
      where record_type = 'research' and record_id = new.research_item_id;
  elsif tg_table_name = 'clinical_trial_topics' and new.is_published then
    update public.intelligence_change_events
      set topic_slugs = array(select distinct unnest(topic_slugs || array[new.topic_slug]))
      where record_type = 'trials' and record_id = new.clinical_trial_id;
  end if;
  return new;
end;
$$;

drop trigger if exists attach_research_change_topic on public.research_item_topics;
create trigger attach_research_change_topic after insert or update of is_published on public.research_item_topics
for each row execute function public.attach_change_topic();
drop trigger if exists attach_trial_change_topic on public.clinical_trial_topics;
create trigger attach_trial_change_topic after insert or update of is_published on public.clinical_trial_topics
for each row execute function public.attach_change_topic();

-- Seed the change log from the current rolling window so the feature is useful
-- immediately; triggers keep it current after this migration.
insert into public.intelligence_change_events (event_key, event_type, record_type, record_id, title, source_url, occurred_at, topic_slugs, watch_keys, metadata)
select 'research:' || ri.id || ':new:backfill', 'new_research', 'research', ri.id, ri.title, ri.source_url, ri.first_seen_at,
  coalesce((select array_agg(rit.topic_slug) from public.research_item_topics rit where rit.research_item_id = ri.id and rit.is_published), '{}'),
  array_remove(array[public.change_entity_key('journal', ri.journal), public.change_entity_key('source', ri.source_id)], null),
  jsonb_build_object('journal', ri.journal, 'status', ri.status, 'confidence', ri.relevance_confidence)
from public.research_items ri
where ri.publication_state = 'published' and ri.first_seen_at >= now() - interval '30 days'
on conflict do nothing;

insert into public.intelligence_change_events (event_key, event_type, record_type, record_id, title, source_url, occurred_at, topic_slugs, watch_keys, metadata)
select 'trials:' || ct.id || ':new:backfill', 'new_trial', 'trials', ct.id, ct.title, ct.source_url, ct.first_seen_at,
  coalesce((select array_agg(ctt.topic_slug) from public.clinical_trial_topics ctt where ctt.clinical_trial_id = ct.id and ctt.is_published), '{}'),
  array_remove(array[public.change_entity_key('sponsor', ct.sponsor), public.change_entity_key('source', ct.source_id), 'trial:' || ct.id::text], null)
    || coalesce((select array_agg('country:' || public.entity_slug(country)) from unnest(ct.countries) country where public.entity_slug(country) <> ''), '{}'),
  jsonb_build_object('sponsor', ct.sponsor, 'countries', ct.countries, 'status', ct.overall_status, 'confidence', ct.relevance_confidence)
from public.clinical_trials ct
where ct.publication_state = 'published' and ct.first_seen_at >= now() - interval '30 days'
on conflict do nothing;

insert into public.intelligence_change_events (event_key, event_type, importance, record_type, record_id, title, source_url, occurred_at, topic_slugs, watch_keys, metadata)
select 'regulatory:' || re.id || ':new:backfill', 'new_regulatory_notice', 'important', 'regulatory', re.id, re.title, re.source_url, coalesce(re.published_at, re.first_seen_at), re.matched_topics,
  array_remove(array[public.change_entity_key('source', re.source_id), public.change_entity_key('country', re.jurisdiction)], null),
  jsonb_build_object('jurisdiction', re.jurisdiction, 'category', re.category, 'confidence', re.relevance_confidence)
from public.regulatory_events re
where re.publication_state = 'published' and re.first_seen_at >= now() - interval '30 days'
on conflict do nothing;

insert into public.intelligence_change_events (event_key, event_type, importance, record_type, record_id, title, source_url, occurred_at, watch_keys, metadata)
select 'integrity:' || rie.id || ':new:backfill', 'new_integrity_event', 'important', 'integrity', rie.id, rie.title, rie.source_url, rie.detected_at,
  array_remove(array[public.change_entity_key('source', rie.source_id)], null),
  jsonb_build_object('event_type', rie.event_type, 'research_item_id', rie.research_item_id)
from public.research_integrity_events rie
where rie.publication_state = 'published' and rie.detected_at >= now() - interval '30 days'
on conflict do nothing;

-- Give the topic entities that represent interventions an explicit machine-readable role.
update public.intelligence_entities
set metadata = metadata || jsonb_build_object('entity_role', 'intervention', 'topic_slug', slug, 'minimum_records', 3)
where kind = 'topic' and slug in (
  'rapamycin', 'senolytics', 'partial-reprogramming', 'metformin', 'glp-1-therapies',
  'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy'
);

alter table public.briefing_distribution_log
  add column if not exists source_digest text,
  add column if not exists receipt_id text;

create table if not exists public.utility_event_daily (
  metric_date date not null default current_date,
  event_name text not null check (event_name in (
    'open_source', 'create_watch', 'remove_watch', 'open_change', 'download_dataset',
    'copy_embed', 'subscribe_briefing', 'share_record'
  )),
  page_path text not null,
  event_count bigint not null default 0 check (event_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (metric_date, event_name, page_path)
);

create or replace function public.increment_utility_event(p_event_name text, p_page_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_name not in ('open_source', 'create_watch', 'remove_watch', 'open_change', 'download_dataset', 'copy_embed', 'subscribe_briefing', 'share_record') then
    raise exception 'invalid event';
  end if;
  if p_page_path !~ '^/[a-zA-Z0-9/_\-\.]{0,240}$' then raise exception 'invalid path'; end if;
  insert into public.utility_event_daily (metric_date, event_name, page_path, event_count)
  values (current_date, p_event_name, p_page_path, 1)
  on conflict (metric_date, event_name, page_path) do update
    set event_count = public.utility_event_daily.event_count + 1, updated_at = now();
end;
$$;

alter table public.member_radar_watches enable row level security;
alter table public.member_radar_state enable row level security;
alter table public.intelligence_change_events enable row level security;
alter table public.utility_event_daily enable row level security;

revoke all on table public.member_radar_watches, public.member_radar_state, public.intelligence_change_events, public.utility_event_daily from public, anon, authenticated;
grant all on table public.member_radar_watches, public.member_radar_state, public.intelligence_change_events, public.utility_event_daily to service_role;
revoke all on function public.capture_intelligence_change(), public.attach_change_topic(), public.increment_utility_event(text, text) from public, anon, authenticated;
grant execute on function public.increment_utility_event(text, text) to service_role;
