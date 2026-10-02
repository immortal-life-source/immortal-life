-- The public directory must not rebuild every funder-to-work/topic/institution
-- aggregate on each page request. Materialize those source-backed counts once
-- per day; individual profiles and Funding Radar continue to use live records.

create materialized view if not exists public.funding_funder_stats_cache as
with award_stats as (
  select a.funder_id,
    count(*)::bigint award_count,
    min(a.first_publication_date) first_publication_date,
    max(a.latest_publication_date) latest_publication_date
  from public.funding_awards a
  where a.funder_id is not null
  group by a.funder_id
), work_stats as (
  select a.funder_id,
    count(distinct aw.openalex_work_id)::bigint linked_publication_count
  from public.funding_awards a
  join public.funding_award_works aw using (openalex_award_id)
  where a.funder_id is not null
  group by a.funder_id
), topic_stats as (
  select a.funder_id,
    count(distinct fat.topic_slug)::bigint topic_count
  from public.funding_awards a
  join public.funding_award_topics fat using (openalex_award_id)
  where a.funder_id is not null
  group by a.funder_id
), institution_stats as (
  select a.funder_id,
    count(distinct fai.openalex_id)::bigint institution_count
  from public.funding_awards a
  join public.funding_award_institutions fai using (openalex_award_id)
  where a.funder_id is not null
  group by a.funder_id
)
select f.funder_id,
  coalesce(a.award_count, 0)::bigint award_count,
  coalesce(w.linked_publication_count, 0)::bigint linked_publication_count,
  coalesce(t.topic_count, 0)::bigint topic_count,
  coalesce(i.institution_count, 0)::bigint institution_count,
  a.first_publication_date,
  a.latest_publication_date,
  now() refreshed_at
from public.funding_funders f
left join award_stats a using (funder_id)
left join work_stats w using (funder_id)
left join topic_stats t using (funder_id)
left join institution_stats i using (funder_id);

create unique index if not exists funding_funder_stats_cache_funder_id_idx
  on public.funding_funder_stats_cache(funder_id);

create or replace function public.get_funder_directory(
  p_search text default '',
  p_offset integer default 0,
  p_limit integer default 100
)
returns table(
  funder_id text,
  slug text,
  name text,
  country_code text,
  description text,
  homepage_url text,
  ror_id text,
  source_url text,
  source_updated_date date,
  updated_at timestamptz,
  award_count bigint,
  linked_publication_count bigint,
  topic_count bigint,
  institution_count bigint,
  first_publication_date date,
  latest_publication_date date,
  total_matching bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with matched as (
    select f.*
    from public.funding_funders f
    where coalesce(trim(p_search), '') = ''
      or f.name ilike '%' || trim(p_search) || '%'
      or exists (select 1 from unnest(f.alternate_titles) title where title ilike '%' || trim(p_search) || '%')
  ), paged as (
    select m.*, count(*) over()::bigint as total_matching
    from matched m
    order by m.name, m.funder_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 100), 1), 1000)
  )
  select p.funder_id, p.slug, p.name, p.country_code, p.description,
    p.homepage_url, p.ror_id, p.source_url, p.source_updated_date, p.updated_at,
    coalesce(s.award_count, 0)::bigint,
    coalesce(s.linked_publication_count, 0)::bigint,
    coalesce(s.topic_count, 0)::bigint,
    coalesce(s.institution_count, 0)::bigint,
    s.first_publication_date,
    s.latest_publication_date,
    p.total_matching
  from paged p
  left join public.funding_funder_stats_cache s using (funder_id)
  order by p.name, p.funder_id;
$$;

revoke all on table public.funding_funder_stats_cache from public, anon, authenticated;
grant select on table public.funding_funder_stats_cache to service_role;
revoke all on function public.get_funder_directory(text,integer,integer) from public, anon, authenticated;
grant execute on function public.get_funder_directory(text,integer,integer) to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'immortal-life-funder-directory-cache' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-funder-directory-cache',
    '17 3 * * *',
    $job$refresh materialized view concurrently public.funding_funder_stats_cache$job$
  );
end
$schedule$;
