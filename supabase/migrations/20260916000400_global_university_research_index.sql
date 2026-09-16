-- Global University Research Index.
-- OpenAlex resolves work affiliations to ROR-backed institutions. This index
-- measures source-record activity; it is not a league table of teaching,
-- clinical care, safety, effectiveness, or institutional quality.

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence)
values
  ('openalex', 'OpenAlex', 'literature',
   'https://openalex.org/', 'https://api.openalex.org/',
   'https://openalex.org/terms', 'Weekly')
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  homepage_url = excluded.homepage_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  update_cadence = excluded.update_cadence,
  enabled = true,
  updated_at = now();

create table if not exists public.university_research_institutions (
  openalex_id text primary key check (openalex_id ~ '^I[0-9]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  ror_id text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  country_name text,
  continent text,
  region text,
  city text,
  latitude double precision,
  longitude double precision,
  homepage_url text,
  openalex_url text not null,
  institution_type text not null default 'education',
  global_works_count integer not null default 0 check (global_works_count >= 0),
  global_cited_by_count bigint not null default 0 check (global_cited_by_count >= 0),
  global_h_index integer not null default 0 check (global_h_index >= 0),
  global_two_year_mean_citedness numeric(12,4),
  indexed_works_five_year integer not null default 0 check (indexed_works_five_year >= 0),
  indexed_works_two_year integer not null default 0 check (indexed_works_two_year >= 0),
  indexed_topic_count integer not null default 0 check (indexed_topic_count >= 0),
  representative_citations bigint not null default 0 check (representative_citations >= 0),
  representative_open_access_share numeric(6,3) check (representative_open_access_share is null or representative_open_access_share between 0 and 100),
  activity_score numeric(6,2) not null default 0 check (activity_score between 0 and 100),
  breadth_score numeric(6,2) not null default 0 check (breadth_score between 0 and 100),
  momentum_score numeric(6,2) not null default 0 check (momentum_score between 0 and 100),
  citation_context_score numeric(6,2) not null default 0 check (citation_context_score between 0 and 100),
  research_index_score numeric(6,2) not null default 0 check (research_index_score between 0 and 100),
  ranking_method_version text not null default 'university-index-2026-09-v1',
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_eligible boolean not null default true,
  exclusion_reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.university_research_topic_metrics (
  openalex_id text not null references public.university_research_institutions(openalex_id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  works_five_year integer not null default 0 check (works_five_year >= 0),
  works_two_year integer not null default 0 check (works_two_year >= 0),
  representative_work_count integer not null default 0 check (representative_work_count >= 0),
  representative_citations bigint not null default 0 check (representative_citations >= 0),
  representative_open_access_count integer not null default 0 check (representative_open_access_count >= 0),
  representative_works jsonb not null default '[]'::jsonb,
  source_query text not null,
  last_synced_at timestamptz not null default now(),
  primary key (openalex_id, topic_slug)
);

create index if not exists university_research_score_idx
  on public.university_research_institutions (is_eligible, research_index_score desc, indexed_works_five_year desc);
create index if not exists university_research_country_idx
  on public.university_research_institutions (country_code, research_index_score desc) where is_eligible;
create index if not exists university_research_continent_idx
  on public.university_research_institutions (continent, research_index_score desc) where is_eligible;
create index if not exists university_topic_rank_idx
  on public.university_research_topic_metrics (topic_slug, works_five_year desc, representative_citations desc);

create or replace function public.refresh_university_research_scores()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare enabled_topics integer;
begin
  select greatest(count(*), 1)::integer into enabled_topics
  from public.intelligence_topics where enabled;

  with aggregates as (
    select
      u.openalex_id,
      coalesce(sum(m.works_five_year), 0)::integer as works_five,
      coalesce(sum(m.works_two_year), 0)::integer as works_two,
      count(*) filter (where m.works_five_year > 0)::integer as topic_count,
      coalesce(sum(m.representative_citations), 0)::bigint as sample_citations,
      coalesce(sum(m.representative_open_access_count), 0)::integer as sample_oa,
      coalesce(sum(m.representative_work_count), 0)::integer as sample_works
    from public.university_research_institutions u
    left join public.university_research_topic_metrics m on m.openalex_id = u.openalex_id
    group by u.openalex_id
  ), maxima as (
    select
      greatest(max(ln(1 + works_five)), 1) as max_activity,
      greatest(max(ln(1 + sample_citations)), 1) as max_citations
    from aggregates
  ), scored as (
    select
      a.*,
      round((100 * ln(1 + a.works_five) / x.max_activity)::numeric, 2) as activity,
      round((100 * a.topic_count::numeric / enabled_topics)::numeric, 2) as breadth,
      round((100 * least(1, a.works_two::numeric / greatest(a.works_five, 1)))::numeric, 2) as momentum,
      round((100 * ln(1 + a.sample_citations) / x.max_citations)::numeric, 2) as citation_context
    from aggregates a cross join maxima x
  )
  update public.university_research_institutions u set
    indexed_works_five_year = s.works_five,
    indexed_works_two_year = s.works_two,
    indexed_topic_count = s.topic_count,
    representative_citations = s.sample_citations,
    representative_open_access_share = case when s.sample_works > 0 then round(100 * s.sample_oa::numeric / s.sample_works, 2) else null end,
    activity_score = s.activity,
    breadth_score = s.breadth,
    momentum_score = s.momentum,
    citation_context_score = s.citation_context,
    research_index_score = round((0.50 * s.activity + 0.20 * s.breadth + 0.15 * s.momentum + 0.15 * s.citation_context)::numeric, 2),
    is_eligible = u.institution_type = 'education' and s.works_five >= 3,
    exclusion_reason = case when u.institution_type <> 'education' then 'Not classified as an educational institution by OpenAlex/ROR' when s.works_five < 3 then 'Below the three-work public usefulness threshold' else null end,
    updated_at = now()
  from scored s where s.openalex_id = u.openalex_id;
end;
$$;

create or replace function public.get_university_index_coverage()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'universities', count(*) filter (where is_eligible),
    'countries', count(distinct country_code) filter (where is_eligible and country_code is not null),
    'continents', count(distinct continent) filter (where is_eligible and continent is not null),
    'indexed_topic_links', coalesce((select count(*) from public.university_research_topic_metrics where works_five_year > 0), 0),
    'indexed_works_five_year', coalesce(sum(indexed_works_five_year) filter (where is_eligible), 0),
    'last_updated_at', max(updated_at) filter (where is_eligible),
    'method_version', max(ranking_method_version) filter (where is_eligible)
  )
  from public.university_research_institutions;
$$;

alter table public.university_research_institutions enable row level security;
alter table public.university_research_topic_metrics enable row level security;
revoke all on table public.university_research_institutions, public.university_research_topic_metrics from anon, authenticated;
grant all on table public.university_research_institutions, public.university_research_topic_metrics to service_role;
revoke all on function public.refresh_university_research_scores(), public.get_university_index_coverage() from public, anon, authenticated;
grant execute on function public.refresh_university_research_scores(), public.get_university_index_coverage() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-index' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-index',
    '23 3 * * 2',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
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
