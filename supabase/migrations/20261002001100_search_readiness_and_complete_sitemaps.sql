-- Keep crawler discovery aligned with reader-facing evidence readiness.
-- Topics remain accessible while their history is still filling, but only
-- dossiers with at least five verified research/trial records enter sitemaps.

drop function if exists public.get_public_topic_sitemap();
create function public.get_public_topic_sitemap()
returns table(
  topic_slug text,
  content_updated_at timestamptz,
  research_count bigint,
  trial_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    topic.slug,
    greatest(
      topic.updated_at,
      coalesce(funding.content_updated_at, topic.updated_at),
      coalesce(counts.content_updated_at, topic.updated_at)
    ),
    coalesce(counts.research_count, 0),
    coalesce(counts.trial_count, 0)
  from public.intelligence_topics topic
  left join public.topic_funding_dossier_cache funding on funding.topic_slug = topic.slug
  left join public.intelligence_topic_counts_cache counts on counts.topic_slug = topic.slug
  where topic.enabled
  order by topic.slug;
$$;

revoke all on function public.get_public_topic_sitemap() from public, anon, authenticated;
grant execute on function public.get_public_topic_sitemap() to anon, service_role;

comment on function public.get_public_topic_sitemap() is
  'Public SEO sitemap input with meaningful timestamps and verified topic evidence counts. The website applies its current readiness threshold.';
