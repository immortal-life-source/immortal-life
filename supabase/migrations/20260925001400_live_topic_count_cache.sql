-- Transactionally maintained public counts keep the complete topic directory
-- fast while the uncapped history tables continue to grow.

create table if not exists public.intelligence_topic_counts_cache (
  topic_slug text primary key references public.intelligence_topics(slug) on delete cascade,
  research_count bigint not null default 0 check (research_count >= 0),
  trial_count bigint not null default 0 check (trial_count >= 0),
  refreshed_at timestamptz not null default now()
);

revoke all on table public.intelligence_topic_counts_cache from public, anon, authenticated;
grant all on table public.intelligence_topic_counts_cache to service_role;

create or replace function public.topic_relation_is_public(topic_slug text, matched_fields text[], is_published boolean)
returns boolean language sql immutable as $$
  select coalesce(is_published, false) and (
    topic_slug not in ('glp-1-therapies', 'exercise', 'caloric-restriction', 'sleep', 'plasma-exchange', 'stem-cells', 'gene-therapy')
    or coalesce(matched_fields, array[]::text[]) @> array['title', 'title context']::text[]
  );
$$;

create or replace function public.refresh_intelligence_topic_counts_cache()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
begin
  insert into public.intelligence_topic_counts_cache (topic_slug, research_count, trial_count, refreshed_at)
  with research_counts as (
    select relation.topic_slug, count(*)::bigint as record_count
    from public.research_item_topics relation
    join public.research_items item on item.id = relation.research_item_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  ), trial_counts as (
    select relation.topic_slug, count(*)::bigint as record_count
    from public.clinical_trial_topics relation
    join public.clinical_trials item on item.id = relation.clinical_trial_id
    where item.publication_state = 'published'
      and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  )
  select topic.slug, coalesce(research_counts.record_count, 0), coalesce(trial_counts.record_count, 0), now()
  from public.intelligence_topics topic
  left join research_counts on research_counts.topic_slug = topic.slug
  left join trial_counts on trial_counts.topic_slug = topic.slug
  where topic.enabled
  on conflict (topic_slug) do update set
    research_count = excluded.research_count,
    trial_count = excluded.trial_count,
    refreshed_at = excluded.refreshed_at;

  delete from public.intelligence_topic_counts_cache cache
  where not exists (select 1 from public.intelligence_topics topic where topic.slug = cache.topic_slug and topic.enabled);
end;
$$;

create or replace function public.update_research_topic_count_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_visible boolean := false; new_visible boolean := false;
begin
  if tg_op <> 'INSERT' then
    select item.publication_state = 'published' and public.topic_relation_is_public(old.topic_slug, old.matched_fields, old.is_published)
      into old_visible from public.research_items item where item.id = old.research_item_id;
    if old_visible then update public.intelligence_topic_counts_cache set research_count = greatest(0, research_count - 1), refreshed_at = now() where topic_slug = old.topic_slug; end if;
  end if;
  if tg_op <> 'DELETE' then
    select item.publication_state = 'published' and public.topic_relation_is_public(new.topic_slug, new.matched_fields, new.is_published)
      into new_visible from public.research_items item where item.id = new.research_item_id;
    if new_visible then update public.intelligence_topic_counts_cache set research_count = research_count + 1, refreshed_at = now() where topic_slug = new.topic_slug; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.update_trial_topic_count_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_visible boolean := false; new_visible boolean := false;
begin
  if tg_op <> 'INSERT' then
    select item.publication_state = 'published' and public.topic_relation_is_public(old.topic_slug, old.matched_fields, old.is_published)
      into old_visible from public.clinical_trials item where item.id = old.clinical_trial_id;
    if old_visible then update public.intelligence_topic_counts_cache set trial_count = greatest(0, trial_count - 1), refreshed_at = now() where topic_slug = old.topic_slug; end if;
  end if;
  if tg_op <> 'DELETE' then
    select item.publication_state = 'published' and public.topic_relation_is_public(new.topic_slug, new.matched_fields, new.is_published)
      into new_visible from public.clinical_trials item where item.id = new.clinical_trial_id;
    if new_visible then update public.intelligence_topic_counts_cache set trial_count = trial_count + 1, refreshed_at = now() where topic_slug = new.topic_slug; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.update_research_item_count_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta integer;
begin
  if old.publication_state is not distinct from new.publication_state then return new; end if;
  delta := case when new.publication_state = 'published' then 1 else -1 end;
  update public.intelligence_topic_counts_cache cache set research_count = greatest(0, cache.research_count + delta * counts.record_count), refreshed_at = now()
  from (
    select relation.topic_slug, count(*)::bigint as record_count
    from public.research_item_topics relation
    where relation.research_item_id = new.id and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  ) counts where cache.topic_slug = counts.topic_slug;
  return new;
end;
$$;

create or replace function public.update_trial_item_count_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta integer;
begin
  if old.publication_state is not distinct from new.publication_state then return new; end if;
  delta := case when new.publication_state = 'published' then 1 else -1 end;
  update public.intelligence_topic_counts_cache cache set trial_count = greatest(0, cache.trial_count + delta * counts.record_count), refreshed_at = now()
  from (
    select relation.topic_slug, count(*)::bigint as record_count
    from public.clinical_trial_topics relation
    where relation.clinical_trial_id = new.id and public.topic_relation_is_public(relation.topic_slug, relation.matched_fields, relation.is_published)
    group by relation.topic_slug
  ) counts where cache.topic_slug = counts.topic_slug;
  return new;
end;
$$;

drop trigger if exists research_topic_count_cache on public.research_item_topics;
create trigger research_topic_count_cache after insert or update or delete on public.research_item_topics for each row execute function public.update_research_topic_count_cache();
drop trigger if exists trial_topic_count_cache on public.clinical_trial_topics;
create trigger trial_topic_count_cache after insert or update or delete on public.clinical_trial_topics for each row execute function public.update_trial_topic_count_cache();
drop trigger if exists research_item_count_cache on public.research_items;
create trigger research_item_count_cache after update of publication_state on public.research_items for each row execute function public.update_research_item_count_cache();
drop trigger if exists trial_item_count_cache on public.clinical_trials;
create trigger trial_item_count_cache after update of publication_state on public.clinical_trials for each row execute function public.update_trial_item_count_cache();

select public.refresh_intelligence_topic_counts_cache();

drop function if exists public.get_intelligence_topic_counts();
create function public.get_intelligence_topic_counts()
returns table (slug text, name text, description text, sort_order integer, research_count bigint, trial_count bigint)
language sql stable security definer set search_path = public as $$
  select topic.slug, topic.name, topic.description, topic.sort_order,
    coalesce(cache.research_count, 0), coalesce(cache.trial_count, 0)
  from public.intelligence_topics topic
  left join public.intelligence_topic_counts_cache cache on cache.topic_slug = topic.slug
  where topic.enabled
  order by topic.sort_order;
$$;
revoke all on function public.get_intelligence_topic_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_counts() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-count-reconcile' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-topic-count-reconcile', '17 4 * * *', 'select public.refresh_intelligence_topic_counts_cache();');

  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-entity-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-entity-refresh', '4 */6 * * *', 'select public.refresh_intelligence_entities();');
end
$schedule$;
