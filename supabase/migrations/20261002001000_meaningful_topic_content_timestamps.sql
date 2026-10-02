-- Track meaningful reader-facing changes separately from routine cache refreshes.
-- This lets topic sitemaps report honest last-modified dates without making all
-- 180 dossiers look newly changed after every reconciliation run.

alter table public.topic_funding_dossier_cache
  add column if not exists content_updated_at timestamptz not null default now();

alter table public.intelligence_topic_counts_cache
  add column if not exists content_updated_at timestamptz not null default now();

update public.topic_funding_dossier_cache
set content_updated_at = refreshed_at
where content_updated_at is distinct from refreshed_at;

update public.intelligence_topic_counts_cache
set content_updated_at = refreshed_at
where content_updated_at is distinct from refreshed_at;

create or replace function public.preserve_topic_funding_content_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.content_updated_at := case
    when new.dossier is distinct from old.dossier then now()
    else old.content_updated_at
  end;
  return new;
end;
$$;

create or replace function public.preserve_topic_count_content_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.content_updated_at := case
    when new.research_count is distinct from old.research_count
      or new.trial_count is distinct from old.trial_count then now()
    else old.content_updated_at
  end;
  return new;
end;
$$;

drop trigger if exists preserve_topic_funding_content_timestamp on public.topic_funding_dossier_cache;
create trigger preserve_topic_funding_content_timestamp
before update on public.topic_funding_dossier_cache
for each row execute function public.preserve_topic_funding_content_timestamp();

drop trigger if exists preserve_topic_count_content_timestamp on public.intelligence_topic_counts_cache;
create trigger preserve_topic_count_content_timestamp
before update on public.intelligence_topic_counts_cache
for each row execute function public.preserve_topic_count_content_timestamp();

create or replace function public.get_public_topic_funding_seo(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'topic', jsonb_build_object('slug', topic.slug, 'name', topic.name, 'description', topic.description, 'updated_at', topic.updated_at),
    'funding', coalesce(funding.dossier, '{}'::jsonb) || jsonb_build_object('refreshed_at', funding.refreshed_at),
    'counts', jsonb_build_object('research_count', coalesce(counts.research_count, 0), 'trial_count', coalesce(counts.trial_count, 0)),
    'modified_at', greatest(topic.updated_at, coalesce(funding.content_updated_at, topic.updated_at), coalesce(counts.content_updated_at, topic.updated_at))
  )
  from public.intelligence_topics topic
  left join public.topic_funding_dossier_cache funding on funding.topic_slug = topic.slug
  left join public.intelligence_topic_counts_cache counts on counts.topic_slug = topic.slug
  where topic.slug = requested_topic and topic.enabled;
$$;

create or replace function public.get_public_topic_sitemap()
returns table(topic_slug text, content_updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select topic.slug,
    greatest(topic.updated_at, coalesce(funding.content_updated_at, topic.updated_at), coalesce(counts.content_updated_at, topic.updated_at))
  from public.intelligence_topics topic
  left join public.topic_funding_dossier_cache funding on funding.topic_slug = topic.slug
  left join public.intelligence_topic_counts_cache counts on counts.topic_slug = topic.slug
  where topic.enabled
  order by topic.slug;
$$;

revoke all on function public.preserve_topic_funding_content_timestamp(),
  public.preserve_topic_count_content_timestamp(),
  public.get_public_topic_funding_seo(text),
  public.get_public_topic_sitemap() from public, anon, authenticated;
grant execute on function public.preserve_topic_funding_content_timestamp(),
  public.preserve_topic_count_content_timestamp() to service_role;
grant execute on function public.get_public_topic_funding_seo(text),
  public.get_public_topic_sitemap() to anon, service_role;
