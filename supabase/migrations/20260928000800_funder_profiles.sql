-- Source-backed funder identities and reader-facing longevity profiles.
-- Identity metadata is synchronized from OpenAlex; website copy and logos are not imported.

create table if not exists public.funding_funders (
  funder_id text primary key,
  slug text not null unique,
  name text not null,
  alternate_titles text[] not null default '{}',
  country_code text,
  description text,
  homepage_url text,
  ror_id text,
  wikidata_url text,
  crossref_id text,
  source_url text not null,
  source_updated_date date,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.funding_funders(funder_id, slug, name, ror_id, source_url)
select distinct on (a.funder_id)
  a.funder_id,
  coalesce(nullif(left(trim(both '-' from regexp_replace(lower(a.funder_name), '[^a-z0-9]+', '-', 'g')), 100), ''), 'funder') || '-' || lower(a.funder_id),
  a.funder_name,
  a.funder_ror,
  'https://openalex.org/' || a.funder_id
from public.funding_awards a
where a.funder_id is not null and a.funder_name is not null
order by a.funder_id, a.latest_publication_date desc nulls last
on conflict (funder_id) do update set
  name = excluded.name,
  ror_id = coalesce(funding_funders.ror_id, excluded.ror_id),
  updated_at = now();

create index if not exists funding_funders_name_idx on public.funding_funders(name);
create index if not exists funding_funders_country_idx on public.funding_funders(country_code, name);
create index if not exists funding_funders_sync_idx on public.funding_funders(last_synced_at asc nulls first, funder_id);

create or replace function public.get_funders_needing_profile(p_limit integer default 50)
returns table(funder_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.funder_id
  from public.funding_funders f
  where f.last_synced_at is null
     or f.last_synced_at < now() - interval '30 days'
  order by f.last_synced_at asc nulls first, f.funder_id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

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
  ), award_stats as (
    select a.funder_id,
      count(distinct a.openalex_award_id)::bigint award_count,
      min(a.first_publication_date) first_publication_date,
      max(a.latest_publication_date) latest_publication_date
    from public.funding_awards a join paged p using (funder_id)
    group by a.funder_id
  ), work_stats as (
    select a.funder_id, count(distinct aw.openalex_work_id)::bigint linked_publication_count
    from public.funding_awards a join paged p using (funder_id)
    join public.funding_award_works aw using (openalex_award_id)
    group by a.funder_id
  ), topic_stats as (
    select a.funder_id, count(distinct fat.topic_slug)::bigint topic_count
    from public.funding_awards a join paged p using (funder_id)
    join public.funding_award_topics fat using (openalex_award_id)
    group by a.funder_id
  ), institution_stats as (
    select a.funder_id, count(distinct fai.openalex_id)::bigint institution_count
    from public.funding_awards a join paged p using (funder_id)
    join public.funding_award_institutions fai using (openalex_award_id)
    group by a.funder_id
  )
  select p.funder_id, p.slug, p.name, p.country_code, p.description,
    p.homepage_url, p.ror_id, p.source_url, p.source_updated_date, p.updated_at,
    coalesce(a.award_count, 0)::bigint,
    coalesce(w.linked_publication_count, 0)::bigint,
    coalesce(t.topic_count, 0)::bigint,
    coalesce(i.institution_count, 0)::bigint,
    a.first_publication_date,
    a.latest_publication_date,
    p.total_matching
  from paged p
  left join award_stats a using (funder_id)
  left join work_stats w using (funder_id)
  left join topic_stats t using (funder_id)
  left join institution_stats i using (funder_id)
  order by p.name, p.funder_id;
$$;

create or replace function public.get_funder_page(p_funder_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select * from public.funding_funders where funder_id = p_funder_id
  ), target_awards as (
    select a.* from public.funding_awards a where a.funder_id = p_funder_id
  ), summary as (
    select count(distinct a.openalex_award_id)::bigint award_count,
      count(distinct aw.openalex_work_id)::bigint linked_publication_count,
      count(distinct fat.topic_slug)::bigint topic_count,
      count(distinct fai.openalex_id)::bigint institution_count,
      min(a.first_publication_date) first_publication_date,
      max(a.latest_publication_date) latest_publication_date
    from target_awards a
    left join public.funding_award_works aw using (openalex_award_id)
    left join public.funding_award_topics fat using (openalex_award_id)
    left join public.funding_award_institutions fai using (openalex_award_id)
  ), cohorts as (
    select extract(year from w.publication_date)::integer as "year",
      count(distinct aw.openalex_work_id)::bigint publications,
      count(distinct aw.openalex_award_id)::bigint awards
    from target_awards a
    join public.funding_award_works aw using (openalex_award_id)
    join public.university_research_works w using (openalex_work_id)
    where w.publication_date is not null
    group by 1 order by 1 desc limit 20
  ), topics as (
    select t.slug, t.name, count(distinct fat.openalex_award_id)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from target_awards a
    join public.funding_award_topics fat using (openalex_award_id)
    join public.intelligence_topics t on t.slug = fat.topic_slug
    left join public.funding_award_works aw on aw.openalex_award_id = a.openalex_award_id
    group by t.slug, t.name order by awards desc, t.name limit 18
  ), institutions as (
    select i.slug, i.name, i.country_code, i.country_name,
      count(distinct fai.openalex_award_id)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from target_awards a
    join public.funding_award_institutions fai using (openalex_award_id)
    join public.university_research_institutions i on i.openalex_id = fai.openalex_id and i.is_eligible
    left join public.funding_award_works aw on aw.openalex_award_id = a.openalex_award_id
    group by i.slug, i.name, i.country_code, i.country_name
    order by awards desc, i.name limit 18
  ), recent_awards as (
    select a.openalex_award_id, a.award_identifier, a.title, a.source_url,
      a.first_publication_date, a.latest_publication_date,
      (select count(*)::bigint from public.funding_award_works x where x.openalex_award_id = a.openalex_award_id) as publication_count,
      coalesce((select jsonb_agg(to_jsonb(w) order by w.publication_date desc nulls last)
        from (select uw.title, uw.publication_date, uw.source_url
          from public.funding_award_works x
          join public.university_research_works uw using (openalex_work_id)
          where x.openalex_award_id = a.openalex_award_id
          order by uw.publication_date desc nulls last limit 3) w), '[]'::jsonb) as publications
    from target_awards a
    order by a.latest_publication_date desc nulls last, a.openalex_award_id
    limit 30
  )
  select case when exists(select 1 from target) then jsonb_build_object(
    'profile', (select to_jsonb(t) from target t),
    'summary', (select to_jsonb(s) from summary s),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c) order by c.year desc) from cohorts c), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(t)) from topics t), '[]'::jsonb),
    'institutions', coalesce((select jsonb_agg(to_jsonb(i)) from institutions i), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(to_jsonb(a)) from recent_awards a), '[]'::jsonb)
  ) else null end;
$$;

alter table public.funding_funders enable row level security;
revoke all on table public.funding_funders from public, anon, authenticated;
grant all on table public.funding_funders to service_role;
revoke all on function public.get_funders_needing_profile(integer), public.get_funder_directory(text,integer,integer), public.get_funder_page(text) from public, anon, authenticated;
grant execute on function public.get_funders_needing_profile(integer), public.get_funder_directory(text,integer,integer), public.get_funder_page(text) to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-funder-profiles' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-funder-profiles', '8-59/10 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-funding-funders',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb, timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
