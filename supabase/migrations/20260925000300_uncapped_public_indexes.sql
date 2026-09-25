-- Exact, uncapped graph totals. Page-size limits belong at transport boundaries,
-- never in the aggregate that describes the retained knowledge corpus.
drop function if exists public.get_intelligence_graph_counts();
create function public.get_intelligence_graph_counts()
returns table (
  slug text,
  name text,
  description text,
  sort_order integer,
  research_count bigint,
  trial_count bigint,
  university_work_count bigint,
  regulatory_count bigint,
  integrity_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    topic.slug,
    topic.name,
    topic.description,
    topic.sort_order,
    (
      select count(*)
      from research_item_topics relation
      join research_items item on item.id = relation.research_item_id
      where relation.topic_slug = topic.slug
        and relation.is_published
        and item.publication_state = 'published'
        and (
          topic.slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
          or relation.matched_fields @> array['title', 'title context']::text[]
        )
    ),
    (
      select count(*)
      from clinical_trial_topics relation
      join clinical_trials item on item.id = relation.clinical_trial_id
      where relation.topic_slug = topic.slug
        and relation.is_published
        and item.publication_state = 'published'
        and (
          topic.slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
          or relation.matched_fields @> array['title', 'title context']::text[]
        )
    ),
    coalesce((select sum(metric.works_five_year) from university_research_topic_metrics metric where metric.topic_slug = topic.slug), 0),
    (select count(*) from regulatory_events event where event.publication_state = 'published' and topic.slug = any(coalesce(event.matched_topics, array[]::text[]))),
    (
      select count(distinct event.id)
      from research_integrity_events event
      join research_items item on item.id = event.research_item_id
      join research_item_topics relation on relation.research_item_id = item.id
      where event.publication_state = 'published'
        and relation.is_published
        and relation.topic_slug = topic.slug
    )
  from intelligence_topics topic
  where topic.enabled
  order by topic.sort_order;
$$;

revoke all on function public.get_intelligence_graph_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_graph_counts() to service_role;

drop function if exists public.get_intelligence_topic_overlap_counts();
create function public.get_intelligence_topic_overlap_counts()
returns table (left_slug text, right_slug text, overlap_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with visible_research as (
    select relation.research_item_id as record_id, relation.topic_slug
    from research_item_topics relation
    join research_items item on item.id = relation.research_item_id
    where relation.is_published and item.publication_state = 'published'
      and (
        relation.topic_slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
        or relation.matched_fields @> array['title', 'title context']::text[]
      )
  ),
  visible_trials as (
    select relation.clinical_trial_id as record_id, relation.topic_slug
    from clinical_trial_topics relation
    join clinical_trials item on item.id = relation.clinical_trial_id
    where relation.is_published and item.publication_state = 'published'
      and (
        relation.topic_slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
        or relation.matched_fields @> array['title', 'title context']::text[]
      )
  ),
  pairs as (
    select left_relation.topic_slug as left_slug, right_relation.topic_slug as right_slug, count(*)::bigint as overlap_count
    from visible_research left_relation
    join visible_research right_relation on right_relation.record_id = left_relation.record_id and right_relation.topic_slug > left_relation.topic_slug
    group by left_relation.topic_slug, right_relation.topic_slug
    union all
    select left_relation.topic_slug, right_relation.topic_slug, count(*)::bigint
    from visible_trials left_relation
    join visible_trials right_relation on right_relation.record_id = left_relation.record_id and right_relation.topic_slug > left_relation.topic_slug
    group by left_relation.topic_slug, right_relation.topic_slug
  )
  select pairs.left_slug, pairs.right_slug, sum(pairs.overlap_count)::bigint
  from pairs
  group by pairs.left_slug, pairs.right_slug
  having sum(pairs.overlap_count) >= 2
  order by sum(pairs.overlap_count) desc, pairs.left_slug, pairs.right_slug;
$$;

revoke all on function public.get_intelligence_topic_overlap_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_overlap_counts() to service_role;
