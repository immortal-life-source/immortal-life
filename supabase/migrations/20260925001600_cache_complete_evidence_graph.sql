-- The evidence graph describes the complete retained corpus, but its overlap
-- matrix does not need to be rebuilt for every visitor request.

create table if not exists public.intelligence_graph_cache (
  singleton boolean primary key default true check (singleton),
  topics jsonb not null default '[]'::jsonb,
  overlap_rows jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now()
);
revoke all on table public.intelligence_graph_cache from public, anon, authenticated;
grant all on table public.intelligence_graph_cache to service_role;

create or replace function public.refresh_intelligence_graph_cache()
returns void language plpgsql security definer set search_path = public set statement_timeout = '300s' as $$
declare topic_payload jsonb; overlap_payload jsonb;
begin
  with university_counts as (
    select topic_slug, sum(works_five_year)::bigint as record_count
    from public.university_research_topic_metrics group by topic_slug
  ), regulatory_counts as (
    select topic_slug, count(*)::bigint as record_count
    from public.regulatory_events event
    cross join lateral unnest(coalesce(event.matched_topics, array[]::text[])) topic_slug
    where event.publication_state = 'published' group by topic_slug
  ), integrity_counts as (
    select relation.topic_slug, count(distinct event.id)::bigint as record_count
    from public.research_integrity_events event
    join public.research_items item on item.id = event.research_item_id
    join public.research_item_topics relation on relation.research_item_id = item.id
    where event.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', topic.slug, 'name', topic.name, 'description', topic.description, 'sort_order', topic.sort_order,
    'research_count', coalesce(cache.research_count, 0), 'trial_count', coalesce(cache.trial_count, 0),
    'university_work_count', coalesce(university_counts.record_count, 0),
    'regulatory_count', coalesce(regulatory_counts.record_count, 0),
    'integrity_count', coalesce(integrity_counts.record_count, 0)
  ) order by topic.sort_order), '[]'::jsonb) into topic_payload
  from public.intelligence_topics topic
  left join public.intelligence_topic_counts_cache cache on cache.topic_slug = topic.slug
  left join university_counts on university_counts.topic_slug = topic.slug
  left join regulatory_counts on regulatory_counts.topic_slug = topic.slug
  left join integrity_counts on integrity_counts.topic_slug = topic.slug
  where topic.enabled;

  with visible_research as (
    select relation.research_item_id as record_id, relation.topic_slug
    from public.research_item_topics relation
    join public.research_items item on item.id = relation.research_item_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
  ), visible_trials as (
    select relation.clinical_trial_id as record_id, relation.topic_slug
    from public.clinical_trial_topics relation
    join public.clinical_trials item on item.id = relation.clinical_trial_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
  ), pairs as (
    select left_relation.topic_slug as left_slug, right_relation.topic_slug as right_slug, count(*)::bigint as overlap_count
    from visible_research left_relation join visible_research right_relation on right_relation.record_id = left_relation.record_id and right_relation.topic_slug > left_relation.topic_slug
    group by left_relation.topic_slug, right_relation.topic_slug
    union all
    select left_relation.topic_slug, right_relation.topic_slug, count(*)::bigint
    from visible_trials left_relation join visible_trials right_relation on right_relation.record_id = left_relation.record_id and right_relation.topic_slug > left_relation.topic_slug
    group by left_relation.topic_slug, right_relation.topic_slug
  ), combined as (
    select left_slug, right_slug, sum(overlap_count)::bigint as overlap_count
    from pairs group by left_slug, right_slug having sum(overlap_count) >= 2
  )
  select coalesce(jsonb_agg(jsonb_build_object('left_slug', left_slug, 'right_slug', right_slug, 'overlap_count', overlap_count) order by overlap_count desc, left_slug, right_slug), '[]'::jsonb)
    into overlap_payload from combined;

  insert into public.intelligence_graph_cache (singleton, topics, overlap_rows, refreshed_at)
  values (true, topic_payload, overlap_payload, now())
  on conflict (singleton) do update set topics = excluded.topics, overlap_rows = excluded.overlap_rows, refreshed_at = excluded.refreshed_at;
end;
$$;

select public.refresh_intelligence_graph_cache();

drop function if exists public.get_intelligence_graph_counts();
create function public.get_intelligence_graph_counts()
returns table (slug text, name text, description text, sort_order integer, research_count bigint, trial_count bigint, university_work_count bigint, regulatory_count bigint, integrity_count bigint)
language sql stable security definer set search_path = public as $$
  select row.* from public.intelligence_graph_cache cache,
  jsonb_to_recordset(cache.topics) as row(slug text, name text, description text, sort_order integer, research_count bigint, trial_count bigint, university_work_count bigint, regulatory_count bigint, integrity_count bigint)
  where cache.singleton order by row.sort_order;
$$;
revoke all on function public.get_intelligence_graph_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_graph_counts() to service_role;

drop function if exists public.get_intelligence_topic_overlap_counts();
create function public.get_intelligence_topic_overlap_counts()
returns table (left_slug text, right_slug text, overlap_count bigint)
language sql stable security definer set search_path = public as $$
  select row.* from public.intelligence_graph_cache cache,
  jsonb_to_recordset(cache.overlap_rows) as row(left_slug text, right_slug text, overlap_count bigint)
  where cache.singleton order by row.overlap_count desc, row.left_slug, row.right_slug;
$$;
revoke all on function public.get_intelligence_topic_overlap_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_overlap_counts() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-graph-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-graph-refresh', '4 1,7,13,19 * * *', 'select public.refresh_intelligence_graph_cache();');
end
$schedule$;
