-- Funding Radar: source-linked OpenAlex award acknowledgements connected to
-- retained longevity publications, topics, and educational institutions.

create table if not exists public.funding_awards (
  openalex_award_id text primary key,
  award_identifier text,
  title text,
  funder_id text,
  funder_name text not null,
  funder_ror text,
  source_url text not null,
  first_publication_date date,
  latest_publication_date date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funding_award_works (
  openalex_award_id text not null references public.funding_awards(openalex_award_id) on delete cascade,
  openalex_work_id text not null references public.university_research_works(openalex_work_id) on delete cascade,
  primary key (openalex_award_id, openalex_work_id)
);

create table if not exists public.funding_award_topics (
  openalex_award_id text not null references public.funding_awards(openalex_award_id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  primary key (openalex_award_id, topic_slug)
);

create table if not exists public.funding_award_institutions (
  openalex_award_id text not null references public.funding_awards(openalex_award_id) on delete cascade,
  openalex_id text not null references public.university_research_institutions(openalex_id) on delete cascade,
  primary key (openalex_award_id, openalex_id)
);

create table if not exists public.funding_radar_sync_state (
  id boolean primary key default true check (id),
  cursor_openalex_work_id text,
  processed_work_count bigint not null default 0 check (processed_work_count >= 0),
  linked_award_count bigint not null default 0 check (linked_award_count >= 0),
  completed_cycles integer not null default 0 check (completed_cycles >= 0),
  cycle_started_at timestamptz not null default now(),
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.funding_radar_sync_state(id) values (true)
on conflict (id) do nothing;

create index if not exists funding_awards_latest_idx on public.funding_awards(latest_publication_date desc nulls last, openalex_award_id);
create index if not exists funding_awards_funder_idx on public.funding_awards(funder_name, latest_publication_date desc nulls last);
create index if not exists funding_award_topics_topic_idx on public.funding_award_topics(topic_slug, openalex_award_id);
create index if not exists funding_award_institutions_institution_idx on public.funding_award_institutions(openalex_id, openalex_award_id);
create index if not exists funding_award_works_work_idx on public.funding_award_works(openalex_work_id, openalex_award_id);

create or replace function public.upsert_funding_award_page(
  p_awards jsonb,
  p_work_links jsonb,
  p_topic_links jsonb,
  p_institution_links jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_awards integer := 0;
  v_work_links integer := 0;
begin
  insert into public.funding_awards
    (openalex_award_id, award_identifier, title, funder_id, funder_name, funder_ror,
     source_url, first_publication_date, latest_publication_date, last_seen_at, updated_at)
  select a.openalex_award_id, nullif(a.award_identifier, ''), nullif(a.title, ''),
    nullif(a.funder_id, ''), a.funder_name, nullif(a.funder_ror, ''), a.source_url,
    a.publication_date, a.publication_date, now(), now()
  from jsonb_to_recordset(coalesce(p_awards, '[]'::jsonb)) as a(
    openalex_award_id text, award_identifier text, title text, funder_id text,
    funder_name text, funder_ror text, source_url text, publication_date date
  )
  where a.openalex_award_id is not null and a.funder_name is not null and a.source_url is not null
  on conflict (openalex_award_id) do update set
    award_identifier = coalesce(nullif(excluded.award_identifier, ''), funding_awards.award_identifier),
    title = coalesce(nullif(excluded.title, ''), funding_awards.title),
    funder_id = coalesce(nullif(excluded.funder_id, ''), funding_awards.funder_id),
    funder_name = excluded.funder_name,
    funder_ror = coalesce(nullif(excluded.funder_ror, ''), funding_awards.funder_ror),
    source_url = excluded.source_url,
    first_publication_date = case
      when funding_awards.first_publication_date is null then excluded.first_publication_date
      when excluded.first_publication_date is null then funding_awards.first_publication_date
      else least(funding_awards.first_publication_date, excluded.first_publication_date) end,
    latest_publication_date = case
      when funding_awards.latest_publication_date is null then excluded.latest_publication_date
      when excluded.latest_publication_date is null then funding_awards.latest_publication_date
      else greatest(funding_awards.latest_publication_date, excluded.latest_publication_date) end,
    last_seen_at = now(), updated_at = now();
  get diagnostics v_awards = row_count;

  insert into public.funding_award_works(openalex_award_id, openalex_work_id)
  select l.openalex_award_id, l.openalex_work_id
  from jsonb_to_recordset(coalesce(p_work_links, '[]'::jsonb)) as l(openalex_award_id text, openalex_work_id text)
  join public.funding_awards a using (openalex_award_id)
  join public.university_research_works w using (openalex_work_id)
  on conflict do nothing;
  get diagnostics v_work_links = row_count;

  insert into public.funding_award_topics(openalex_award_id, topic_slug)
  select l.openalex_award_id, l.topic_slug
  from jsonb_to_recordset(coalesce(p_topic_links, '[]'::jsonb)) as l(openalex_award_id text, topic_slug text)
  join public.funding_awards a using (openalex_award_id)
  join public.intelligence_topics t on t.slug = l.topic_slug and t.enabled
  on conflict do nothing;

  insert into public.funding_award_institutions(openalex_award_id, openalex_id)
  select l.openalex_award_id, l.openalex_id
  from jsonb_to_recordset(coalesce(p_institution_links, '[]'::jsonb)) as l(openalex_award_id text, openalex_id text)
  join public.funding_awards a using (openalex_award_id)
  join public.university_research_institutions i using (openalex_id)
  on conflict do nothing;

  return jsonb_build_object('awards_upserted', v_awards, 'work_links_added', v_work_links);
end;
$$;

create or replace function public.get_funding_radar_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with summary as (
    select count(*)::bigint awards,
      count(*) filter (where award_identifier is not null)::bigint identified_awards,
      count(distinct funder_id)::bigint funders,
      min(first_publication_date) first_publication_date,
      max(latest_publication_date) latest_publication_date
    from public.funding_awards
  ), publication_summary as (
    select count(distinct openalex_work_id)::bigint linked_publications from public.funding_award_works
  ), institution_summary as (
    select count(distinct openalex_id)::bigint institutions from public.funding_award_institutions
  ), topic_summary as (
    select count(distinct topic_slug)::bigint topics from public.funding_award_topics
  ), cohorts as (
    select extract(year from w.publication_date)::integer as "year",
      count(distinct aw.openalex_award_id)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from public.funding_award_works aw
    join public.university_research_works w using (openalex_work_id)
    where w.publication_date is not null
    group by 1 order by 1 desc limit 15
  ), leading_funders as (
    select a.funder_id, a.funder_name, count(*)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from public.funding_awards a
    left join public.funding_award_works aw using (openalex_award_id)
    group by a.funder_id, a.funder_name order by awards desc, a.funder_name limit 20
  ), leading_topics as (
    select t.slug, t.name, count(distinct fat.openalex_award_id)::bigint awards
    from public.funding_award_topics fat join public.intelligence_topics t on t.slug = fat.topic_slug
    group by t.slug, t.name order by awards desc, t.name limit 20
  ), leading_institutions as (
    select i.slug, i.name, i.country_code, i.country_name,
      count(distinct fai.openalex_award_id)::bigint awards
    from public.funding_award_institutions fai
    join public.university_research_institutions i using (openalex_id)
    where i.is_eligible
    group by i.slug, i.name, i.country_code, i.country_name
    order by awards desc, i.name limit 20
  )
  select jsonb_build_object(
    'summary', (select to_jsonb(s) || to_jsonb(p) || to_jsonb(i) || to_jsonb(t) from summary s cross join publication_summary p cross join institution_summary i cross join topic_summary t),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c) order by c.year desc) from cohorts c), '[]'::jsonb),
    'leading_funders', coalesce((select jsonb_agg(to_jsonb(f)) from leading_funders f), '[]'::jsonb),
    'leading_topics', coalesce((select jsonb_agg(to_jsonb(t)) from leading_topics t), '[]'::jsonb),
    'leading_institutions', coalesce((select jsonb_agg(to_jsonb(i)) from leading_institutions i), '[]'::jsonb)
  );
$$;

alter table public.funding_awards enable row level security;
alter table public.funding_award_works enable row level security;
alter table public.funding_award_topics enable row level security;
alter table public.funding_award_institutions enable row level security;
alter table public.funding_radar_sync_state enable row level security;

revoke all on table public.funding_awards, public.funding_award_works,
  public.funding_award_topics, public.funding_award_institutions,
  public.funding_radar_sync_state from public, anon, authenticated;
grant all on table public.funding_awards, public.funding_award_works,
  public.funding_award_topics, public.funding_award_institutions,
  public.funding_radar_sync_state to service_role;
revoke all on function public.upsert_funding_award_page(jsonb,jsonb,jsonb,jsonb), public.get_funding_radar_overview() from public, anon, authenticated;
grant execute on function public.upsert_funding_award_page(jsonb,jsonb,jsonb,jsonb), public.get_funding_radar_overview() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-funding-radar' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-funding-radar', '3-59/10 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-funding-radar',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb, timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
