-- Compute the complete topic catalogue in one pass per relation table. The
-- previous correlated subqueries repeated the same joins once for each topic
-- and no longer scaled with uncapped historical ingestion.

drop function if exists public.get_intelligence_topic_counts();
create function public.get_intelligence_topic_counts()
returns table (slug text, name text, description text, sort_order integer, research_count bigint, trial_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with research_counts as (
    select relation.topic_slug, count(*)::bigint as record_count
    from research_item_topics relation
    join research_items item on item.id = relation.research_item_id
    where relation.is_published
      and item.publication_state = 'published'
      and (
        relation.topic_slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
        or relation.matched_fields @> array['title', 'title context']::text[]
      )
    group by relation.topic_slug
  ), trial_counts as (
    select relation.topic_slug, count(*)::bigint as record_count
    from clinical_trial_topics relation
    join clinical_trials item on item.id = relation.clinical_trial_id
    where relation.is_published
      and item.publication_state = 'published'
      and (
        relation.topic_slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
        or relation.matched_fields @> array['title', 'title context']::text[]
      )
    group by relation.topic_slug
  )
  select topic.slug, topic.name, topic.description, topic.sort_order,
    coalesce(research_counts.record_count, 0),
    coalesce(trial_counts.record_count, 0)
  from intelligence_topics topic
  left join research_counts on research_counts.topic_slug = topic.slug
  left join trial_counts on trial_counts.topic_slug = topic.slug
  where topic.enabled
  order by topic.sort_order;
$$;

revoke all on function public.get_intelligence_topic_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_counts() to service_role;
