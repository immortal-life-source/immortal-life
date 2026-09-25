-- Resumable, all-topic, all-history OpenAlex university knowledge graph.

alter table public.university_research_topic_metrics
  add column if not exists works_all_time integer not null default 0
    check (works_all_time >= 0);

alter table public.university_research_institutions
  add column if not exists indexed_works_all_time integer not null default 0
    check (indexed_works_all_time >= 0);

create table if not exists public.university_research_works (
  openalex_work_id text primary key,
  title text not null,
  publication_year integer,
  publication_date date,
  cited_by_count integer not null default 0 check (cited_by_count >= 0),
  is_open_access boolean,
  doi text,
  source_url text not null,
  source_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.university_research_work_topics (
  openalex_work_id text not null references public.university_research_works(openalex_work_id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  primary key (openalex_work_id, topic_slug)
);

create table if not exists public.university_research_work_institutions (
  openalex_work_id text not null references public.university_research_works(openalex_work_id) on delete cascade,
  openalex_id text not null references public.university_research_institutions(openalex_id) on delete cascade,
  primary key (openalex_work_id, openalex_id)
);

create index if not exists university_work_topics_topic_idx
  on public.university_research_work_topics(topic_slug, openalex_work_id);
create index if not exists university_work_institutions_institution_idx
  on public.university_research_work_institutions(openalex_id, openalex_work_id);
create index if not exists university_works_date_idx
  on public.university_research_works(publication_date desc nulls last, openalex_work_id);

create table if not exists public.university_topic_sync_state (
  topic_slug text primary key references public.intelligence_topics(slug) on delete cascade,
  phase text not null default 'all' check (phase in ('all', 'five', 'two', 'works', 'complete')),
  cursor text not null default '*',
  pages_processed integer not null default 0 check (pages_processed >= 0),
  records_processed bigint not null default 0 check (records_processed >= 0),
  cycle_started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.university_topic_sync_state(topic_slug)
select slug from public.intelligence_topics where enabled
on conflict (topic_slug) do nothing;

-- Re-score from unique source works, not sums of topic links. A paper matching
-- several topics contributes once to institutional activity and citations.
create or replace function public.refresh_university_research_scores()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare enabled_topics integer;
declare five_year_start date := current_date - interval '5 years';
declare two_year_start date := current_date - interval '2 years';
begin
  select greatest(count(*), 1)::integer into enabled_topics
  from public.intelligence_topics where enabled;

  -- Replace the former sampled topic metrics with complete counts calculated
  -- from every retained OpenAlex work/institution/topic link. Legacy column
  -- names are retained for API compatibility, but now contain all-work data.
  with complete_topic_metrics as (
    select wi.openalex_id, wt.topic_slug,
      count(distinct w.openalex_work_id)::integer works_all,
      count(distinct w.openalex_work_id) filter (where w.publication_date >= five_year_start)::integer works_five,
      count(distinct w.openalex_work_id) filter (where w.publication_date >= two_year_start)::integer works_two,
      coalesce(sum(w.cited_by_count), 0)::bigint citations_all,
      count(distinct w.openalex_work_id) filter (where w.is_open_access)::integer open_access_all
    from public.university_research_work_institutions wi
    join public.university_research_works w on w.openalex_work_id = wi.openalex_work_id
    join public.university_research_work_topics wt on wt.openalex_work_id = w.openalex_work_id
    group by wi.openalex_id, wt.topic_slug
  )
  insert into public.university_research_topic_metrics
    (openalex_id, topic_slug, works_all_time, works_five_year, works_two_year,
     representative_work_count, representative_citations,
     representative_open_access_count, source_query, last_synced_at)
  select c.openalex_id, c.topic_slug, c.works_all, c.works_five, c.works_two,
    c.works_all, c.citations_all, c.open_access_all,
    coalesce(t.literature_query, ''), now()
  from complete_topic_metrics c
  join public.intelligence_topics t on t.slug = c.topic_slug
  on conflict (openalex_id, topic_slug) do update set
    works_all_time = excluded.works_all_time,
    works_five_year = excluded.works_five_year,
    works_two_year = excluded.works_two_year,
    representative_work_count = excluded.representative_work_count,
    representative_citations = excluded.representative_citations,
    representative_open_access_count = excluded.representative_open_access_count,
    source_query = excluded.source_query,
    last_synced_at = excluded.last_synced_at;

  with linked_works as (
    select distinct u.openalex_id, w.openalex_work_id, w.publication_date,
      w.cited_by_count, w.is_open_access
    from public.university_research_institutions u
    left join public.university_research_work_institutions wi on wi.openalex_id = u.openalex_id
    left join public.university_research_works w on w.openalex_work_id = wi.openalex_work_id
  ), linked as (
    select lw.openalex_id,
      count(lw.openalex_work_id)::integer works_all,
      count(lw.openalex_work_id) filter (where lw.publication_date >= five_year_start)::integer works_five,
      count(lw.openalex_work_id) filter (where lw.publication_date >= two_year_start)::integer works_two,
      (select count(distinct wt.topic_slug)::integer
       from public.university_research_work_institutions wi
       join public.university_research_work_topics wt on wt.openalex_work_id = wi.openalex_work_id
       where wi.openalex_id = lw.openalex_id) topic_count,
      coalesce(sum(lw.cited_by_count), 0)::bigint sample_citations,
      count(lw.openalex_work_id) filter (where lw.is_open_access)::integer sample_oa,
      count(lw.openalex_work_id)::integer sample_works
    from linked_works lw
    group by lw.openalex_id
  ), maxima as (
    select greatest(max(ln(1 + works_five)), 1) max_activity,
           greatest(max(ln(1 + sample_citations)), 1) max_citations from linked
  ), scored as (
    select l.*,
      round((100 * ln(1 + works_five) / m.max_activity)::numeric, 2) activity,
      round((100 * topic_count::numeric / enabled_topics)::numeric, 2) breadth,
      round((100 * least(1, works_two::numeric / greatest(works_five, 1)))::numeric, 2) momentum,
      round((100 * ln(1 + sample_citations) / m.max_citations)::numeric, 2) citation_context
    from linked l cross join maxima m
  )
  update public.university_research_institutions u set
    indexed_works_all_time = s.works_all,
    indexed_works_five_year = s.works_five,
    indexed_works_two_year = s.works_two,
    indexed_topic_count = s.topic_count,
    representative_citations = s.sample_citations,
    representative_open_access_share = case when s.sample_works > 0 then round(100 * s.sample_oa::numeric / s.sample_works, 2) else null end,
    activity_score = s.activity,
    breadth_score = s.breadth,
    momentum_score = s.momentum,
    citation_context_score = s.citation_context,
    research_index_score = round((0.50*s.activity + 0.20*s.breadth + 0.15*s.momentum + 0.15*s.citation_context)::numeric, 2),
    is_eligible = u.institution_type = 'education' and s.sample_works >= 1,
    exclusion_reason = case when u.institution_type <> 'education' then 'Not classified as an educational institution by OpenAlex' when s.sample_works < 1 then 'No source-matched work retained' else null end,
    updated_at = now()
  from scored s where s.openalex_id = u.openalex_id;
end;
$$;

alter table public.university_research_works enable row level security;
alter table public.university_research_work_topics enable row level security;
alter table public.university_research_work_institutions enable row level security;
alter table public.university_topic_sync_state enable row level security;
revoke all on table public.university_research_works, public.university_research_work_topics,
  public.university_research_work_institutions, public.university_topic_sync_state from public, anon, authenticated;
grant all on table public.university_research_works, public.university_research_work_topics,
  public.university_research_work_institutions, public.university_topic_sync_state to service_role;
revoke all on function public.refresh_university_research_scores() from public, anon, authenticated;
grant execute on function public.refresh_university_research_scores() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-index' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-index', '2-59/5 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb, timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
