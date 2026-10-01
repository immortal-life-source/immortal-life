-- Make Funding Radar reads predictable and add direct, source-owned grant
-- records alongside (but never confused with) publication acknowledgements.

alter table public.content_sources drop constraint if exists content_sources_kind_check;
alter table public.content_sources add constraint content_sources_kind_check
  check (kind in ('literature', 'trial_registry', 'integrity', 'regulatory', 'funding'));

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence, enabled,
   rights_class, automated_ingestion_allowed, public_display_allowed,
   paid_distribution_allowed, permitted_content_scope, attribution_text,
   rights_basis, rights_reviewed_at, rights_review_due_at)
values
  ('nih-reporter', 'NIH RePORTER', 'funding', 'https://reporter.nih.gov/',
   'https://api.reporter.nih.gov/v2/projects/search',
   'https://api.reporter.nih.gov/?urls.primaryName=V2.0', 'Daily', true,
   'commercial', true, true, true,
   'Structured federal award and funded-organization metadata exposed by the official RePORTER API; excludes abstracts, public-health narratives, people, contact details and linked documents.',
   'Source: NIH RePORTER, U.S. Department of Health and Human Services; no endorsement implied.',
   'The official RePORTER API is expressly provided for external third-party applications, reporting, integration, analysis and business needs. Only structured award metadata is retained.',
   current_date, current_date + 180),
  ('cordis', 'CORDIS', 'funding', 'https://cordis.europa.eu/',
   'https://cordis.europa.eu/datalab/sparql',
   'https://cordis.europa.eu/about/legal', 'Weekly', true,
   'commercial', true, true, true,
   'EU-owned structured project, grant, programme, date, amount and coordinator metadata from the EURIO knowledge graph; excludes beneficiary reports, deliverables, publications, personal data, logos and third-party media.',
   'Source: CORDIS, European Union, 1994–2026, licensed under CC BY 4.0; transformed by immortal.life.',
   'CORDIS publishes the EURIO knowledge graph for machine reuse. EU-owned website content is reusable under CC BY 4.0 with attribution and changes indicated; beneficiary-provided and third-party materials are excluded.',
   current_date, current_date + 180)
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, homepage_url = excluded.homepage_url,
  api_url = excluded.api_url, terms_url = excluded.terms_url,
  update_cadence = excluded.update_cadence, enabled = excluded.enabled,
  rights_class = excluded.rights_class,
  automated_ingestion_allowed = excluded.automated_ingestion_allowed,
  public_display_allowed = excluded.public_display_allowed,
  paid_distribution_allowed = excluded.paid_distribution_allowed,
  permitted_content_scope = excluded.permitted_content_scope,
  attribution_text = excluded.attribution_text, rights_basis = excluded.rights_basis,
  rights_reviewed_at = excluded.rights_reviewed_at,
  rights_review_due_at = excluded.rights_review_due_at, updated_at = now();

create table if not exists public.funding_grants (
  source_id text not null references public.content_sources(id),
  source_grant_id text not null,
  grant_number text,
  title text not null,
  funder_name text not null,
  recipient_name text,
  recipient_country_code text,
  recipient_country_name text,
  programme text,
  status text,
  fiscal_year integer,
  start_date date,
  end_date date,
  awarded_amount numeric,
  currency text,
  source_url text not null,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, source_grant_id),
  check (recipient_country_code is null or recipient_country_code ~ '^[A-Z]{2}$'),
  check (currency is null or currency ~ '^[A-Z]{3}$'),
  check (awarded_amount is null or awarded_amount >= 0)
);

create table if not exists public.funding_grant_topics (
  source_id text not null,
  source_grant_id text not null,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  relevance_score integer not null check (relevance_score between 0 and 100),
  match_explanation text not null,
  primary key (source_id, source_grant_id, topic_slug),
  foreign key (source_id, source_grant_id)
    references public.funding_grants(source_id, source_grant_id) on delete cascade
);

create table if not exists public.funding_grant_sync_state (
  source_id text primary key references public.content_sources(id) on delete cascade,
  cursor jsonb not null default '{}'::jsonb,
  records_scanned bigint not null default 0 check (records_scanned >= 0),
  grants_retained bigint not null default 0 check (grants_retained >= 0),
  completed_cycles integer not null default 0 check (completed_cycles >= 0),
  cycle_started_at timestamptz not null default now(),
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.funding_grant_sync_state(source_id)
values ('nih-reporter'), ('cordis') on conflict (source_id) do nothing;

create index if not exists funding_grants_recent_idx
  on public.funding_grants(source_updated_at desc nulls last, start_date desc nulls last, first_seen_at desc, source_id, source_grant_id);
create index if not exists funding_grants_source_idx
  on public.funding_grants(source_id, start_date desc nulls last, source_grant_id);
create index if not exists funding_grants_country_idx
  on public.funding_grants(recipient_country_code, start_date desc nulls last);
create index if not exists funding_grants_recipient_idx
  on public.funding_grants(recipient_name, start_date desc nulls last);
create index if not exists funding_grant_topics_topic_idx
  on public.funding_grant_topics(topic_slug, source_id, source_grant_id);

create table if not exists public.funding_radar_overview_cache (
  id boolean primary key default true check (id),
  overview jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

insert into public.funding_radar_overview_cache(id) values (true)
on conflict (id) do nothing;

create or replace function public.upsert_direct_grant_page(
  p_source_id text,
  p_grants jsonb,
  p_topic_links jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grants integer := 0;
  v_topics integer := 0;
begin
  if not exists (
    select 1 from public.content_sources s
    where s.id = p_source_id and s.enabled and s.automated_ingestion_allowed
      and s.public_display_allowed and s.rights_review_due_at >= current_date
  ) then
    raise exception 'Source % is not approved for direct grant ingestion', p_source_id;
  end if;

  insert into public.funding_grants
    (source_id, source_grant_id, grant_number, title, funder_name,
     recipient_name, recipient_country_code, recipient_country_name, programme,
     status, fiscal_year, start_date, end_date, awarded_amount, currency,
     source_url, source_updated_at, last_seen_at, updated_at)
  select p_source_id, g.source_grant_id, nullif(g.grant_number, ''), g.title,
    g.funder_name, nullif(g.recipient_name, ''), nullif(g.recipient_country_code, ''),
    nullif(g.recipient_country_name, ''), nullif(g.programme, ''),
    nullif(g.status, ''), g.fiscal_year, g.start_date, g.end_date,
    g.awarded_amount, nullif(g.currency, ''), g.source_url,
    g.source_updated_at, now(), now()
  from jsonb_to_recordset(coalesce(p_grants, '[]'::jsonb)) as g(
    source_grant_id text, grant_number text, title text, funder_name text,
    recipient_name text, recipient_country_code text, recipient_country_name text,
    programme text, status text, fiscal_year integer, start_date date, end_date date,
    awarded_amount numeric, currency text, source_url text, source_updated_at timestamptz
  )
  where nullif(g.source_grant_id, '') is not null
    and nullif(g.title, '') is not null and nullif(g.funder_name, '') is not null
    and g.source_url ~ '^https://'
  on conflict (source_id, source_grant_id) do update set
    grant_number = coalesce(excluded.grant_number, funding_grants.grant_number),
    title = excluded.title, funder_name = excluded.funder_name,
    recipient_name = coalesce(excluded.recipient_name, funding_grants.recipient_name),
    recipient_country_code = coalesce(excluded.recipient_country_code, funding_grants.recipient_country_code),
    recipient_country_name = coalesce(excluded.recipient_country_name, funding_grants.recipient_country_name),
    programme = coalesce(excluded.programme, funding_grants.programme),
    status = coalesce(excluded.status, funding_grants.status),
    fiscal_year = coalesce(excluded.fiscal_year, funding_grants.fiscal_year),
    start_date = coalesce(excluded.start_date, funding_grants.start_date),
    end_date = coalesce(excluded.end_date, funding_grants.end_date),
    awarded_amount = coalesce(excluded.awarded_amount, funding_grants.awarded_amount),
    currency = coalesce(excluded.currency, funding_grants.currency),
    source_url = excluded.source_url,
    source_updated_at = coalesce(excluded.source_updated_at, funding_grants.source_updated_at),
    last_seen_at = now(), updated_at = now();
  get diagnostics v_grants = row_count;

  insert into public.funding_grant_topics
    (source_id, source_grant_id, topic_slug, relevance_score, match_explanation)
  select p_source_id, l.source_grant_id, l.topic_slug,
    greatest(0, least(100, l.relevance_score)), l.match_explanation
  from jsonb_to_recordset(coalesce(p_topic_links, '[]'::jsonb)) as l(
    source_grant_id text, topic_slug text, relevance_score integer, match_explanation text
  )
  join public.funding_grants g on g.source_id = p_source_id and g.source_grant_id = l.source_grant_id
  join public.intelligence_topics t on t.slug = l.topic_slug and t.enabled
  where l.relevance_score >= 60 and nullif(l.match_explanation, '') is not null
  on conflict (source_id, source_grant_id, topic_slug) do update set
    relevance_score = excluded.relevance_score,
    match_explanation = excluded.match_explanation;
  get diagnostics v_topics = row_count;

  return jsonb_build_object('grants_upserted', v_grants, 'topic_links_upserted', v_topics);
end;
$$;

create or replace function public.refresh_funding_radar_overview_cache()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_overview jsonb;
begin
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
  ), grant_summary as (
    select count(*)::bigint direct_grants,
      count(*) filter (where end_date is null or end_date >= current_date)::bigint active_direct_grants,
      count(distinct source_id)::bigint direct_grant_sources,
      count(distinct recipient_name) filter (where recipient_name is not null)::bigint grant_recipients
    from public.funding_grants
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
    'summary', (select to_jsonb(s) || to_jsonb(p) || to_jsonb(i) || to_jsonb(t) || to_jsonb(g)
      from summary s cross join publication_summary p cross join institution_summary i
      cross join topic_summary t cross join grant_summary g),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c) order by c.year desc) from cohorts c), '[]'::jsonb),
    'leading_funders', coalesce((select jsonb_agg(to_jsonb(f)) from leading_funders f), '[]'::jsonb),
    'leading_topics', coalesce((select jsonb_agg(to_jsonb(t)) from leading_topics t), '[]'::jsonb),
    'leading_institutions', coalesce((select jsonb_agg(to_jsonb(i)) from leading_institutions i), '[]'::jsonb)
  ) into v_overview;

  insert into public.funding_radar_overview_cache(id, overview, refreshed_at)
  values (true, v_overview, now())
  on conflict (id) do update set overview = excluded.overview, refreshed_at = excluded.refreshed_at;
  return v_overview;
end;
$$;

create or replace function public.get_funding_radar_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select overview || jsonb_build_object('refreshed_at', refreshed_at)
  from public.funding_radar_overview_cache where id;
$$;

create or replace function public.get_funding_award_page(
  p_topic text default '', p_country text default '', p_funder text default '',
  p_institution text default '', p_search text default '', p_sort text default 'recent',
  p_offset integer default 0, p_limit integer default 24
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtered as materialized (
    select a.openalex_award_id
    from public.funding_awards a
    where (coalesce(trim(p_topic), '') = '' or exists (
      select 1 from public.funding_award_topics x
      where x.openalex_award_id = a.openalex_award_id and x.topic_slug = trim(p_topic)))
    and (coalesce(trim(p_country), '') = '' or exists (
      select 1 from public.funding_award_institutions x
      join public.university_research_institutions i using (openalex_id)
      where x.openalex_award_id = a.openalex_award_id and i.country_code = upper(trim(p_country))))
    and (coalesce(trim(p_institution), '') = '' or exists (
      select 1 from public.funding_award_institutions x
      join public.university_research_institutions i using (openalex_id)
      where x.openalex_award_id = a.openalex_award_id and i.slug = trim(p_institution)))
    and (coalesce(trim(p_funder), '') = '' or a.funder_id = trim(p_funder))
    and (coalesce(trim(p_search), '') = '' or a.award_identifier ilike '%' || trim(p_search) || '%'
      or a.title ilike '%' || trim(p_search) || '%' or a.funder_name ilike '%' || trim(p_search) || '%')
  ), paged as (
    select a.*, count(*) over()::bigint total_matching
    from public.funding_awards a join filtered f using (openalex_award_id)
    order by
      case when p_sort = 'oldest' then a.first_publication_date end asc nulls last,
      case when p_sort = 'funder' then a.funder_name end asc nulls last,
      case when p_sort not in ('oldest', 'funder') then a.latest_publication_date end desc nulls last,
      a.openalex_award_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 24), 1), 100)
  ), records as (
    select to_jsonb(p) - 'total_matching' || jsonb_build_object(
      'funding_award_topics', coalesce((select jsonb_agg(jsonb_build_object(
        'topic_slug', x.topic_slug,
        'intelligence_topics', jsonb_build_object('name', t.name, 'slug', t.slug)) order by t.name)
        from public.funding_award_topics x join public.intelligence_topics t on t.slug = x.topic_slug
        where x.openalex_award_id = p.openalex_award_id), '[]'::jsonb),
      'funding_award_institutions', coalesce((select jsonb_agg(jsonb_build_object(
        'openalex_id', x.openalex_id,
        'university_research_institutions', jsonb_build_object('slug', i.slug, 'name', i.name,
          'country_code', i.country_code, 'country_name', i.country_name, 'city', i.city)) order by i.name)
        from public.funding_award_institutions x
        join public.university_research_institutions i using (openalex_id)
        where x.openalex_award_id = p.openalex_award_id and i.is_eligible), '[]'::jsonb),
      'funding_award_works', coalesce((select jsonb_agg(jsonb_build_object(
        'openalex_work_id', w.openalex_work_id,
        'university_research_works', jsonb_build_object('title', w.title,
          'publication_date', w.publication_date, 'source_url', w.source_url,
          'source_name', w.source_name)) order by w.publication_date desc nulls last)
        from (select uw.* from public.funding_award_works x
          join public.university_research_works uw using (openalex_work_id)
          where x.openalex_award_id = p.openalex_award_id
          order by uw.publication_date desc nulls last limit 12) w), '[]'::jsonb)
    ) record, p.total_matching
    from paged p
  )
  select jsonb_build_object(
    'records', coalesce((select jsonb_agg(record) from records), '[]'::jsonb),
    'total_matching', coalesce((select max(total_matching) from records), (select count(*) from filtered), 0)
  );
$$;

create or replace function public.get_direct_grant_page(
  p_topic text default '', p_country text default '', p_search text default '',
  p_offset integer default 0, p_limit integer default 12
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtered as materialized (
    select g.*
    from public.funding_grants g
    join public.content_sources s on s.id = g.source_id and s.public_display_allowed
      and s.rights_review_due_at >= current_date
    where (coalesce(trim(p_topic), '') = '' or exists (
      select 1 from public.funding_grant_topics x where x.source_id = g.source_id
      and x.source_grant_id = g.source_grant_id and x.topic_slug = trim(p_topic)))
    and (coalesce(trim(p_country), '') = '' or g.recipient_country_code = upper(trim(p_country)))
    and (coalesce(trim(p_search), '') = '' or g.grant_number ilike '%' || trim(p_search) || '%'
      or g.title ilike '%' || trim(p_search) || '%' or g.funder_name ilike '%' || trim(p_search) || '%'
      or g.recipient_name ilike '%' || trim(p_search) || '%')
  ), paged as (
    select f.*, count(*) over()::bigint total_matching
    from filtered f
    order by coalesce(f.source_updated_at, f.start_date::timestamptz, f.first_seen_at) desc,
      f.source_id, f.source_grant_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 12), 1), 50)
  )
  select jsonb_build_object(
    'records', coalesce((select jsonb_agg(to_jsonb(p) - 'total_matching' || jsonb_build_object(
      'topics', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name,
        'relevance_score', x.relevance_score) order by x.relevance_score desc, t.name)
        from public.funding_grant_topics x join public.intelligence_topics t on t.slug = x.topic_slug
        where x.source_id = p.source_id and x.source_grant_id = p.source_grant_id), '[]'::jsonb),
      'source_name', (select s.name from public.content_sources s where s.id = p.source_id),
      'attribution', (select s.attribution_text from public.content_sources s where s.id = p.source_id)
    )) from paged p), '[]'::jsonb),
    'total_matching', coalesce((select max(total_matching) from paged), (select count(*) from filtered), 0),
    'by_source', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select source_id, count(*)::bigint grants from filtered group by source_id order by source_id) x), '[]'::jsonb)
  );
$$;

-- Re-profile source identities weekly. The worker still processes only 50 per
-- invocation, so this improves freshness without creating a request burst.
create or replace function public.get_funders_needing_profile(p_limit integer default 50)
returns table(funder_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.funder_id from public.funding_funders f
  where f.last_synced_at is null or f.last_synced_at < now() - interval '7 days'
  order by f.last_synced_at asc nulls first, f.funder_id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

select public.refresh_funding_radar_overview_cache();

alter table public.funding_grants enable row level security;
alter table public.funding_grant_topics enable row level security;
alter table public.funding_grant_sync_state enable row level security;
alter table public.funding_radar_overview_cache enable row level security;

revoke all on table public.funding_grants, public.funding_grant_topics,
  public.funding_grant_sync_state, public.funding_radar_overview_cache
  from public, anon, authenticated;
grant all on table public.funding_grants, public.funding_grant_topics,
  public.funding_grant_sync_state, public.funding_radar_overview_cache to service_role;
revoke all on function public.upsert_direct_grant_page(text,jsonb,jsonb),
  public.refresh_funding_radar_overview_cache(),
  public.get_funding_radar_overview(),
  public.get_funding_award_page(text,text,text,text,text,text,integer,integer),
  public.get_direct_grant_page(text,text,text,integer,integer),
  public.get_funders_needing_profile(integer) from public, anon, authenticated;
grant execute on function public.upsert_direct_grant_page(text,jsonb,jsonb),
  public.refresh_funding_radar_overview_cache(),
  public.get_funding_radar_overview(),
  public.get_funding_award_page(text,text,text,text,text,text,integer,integer),
  public.get_direct_grant_page(text,text,text,integer,integer),
  public.get_funders_needing_profile(integer) to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-direct-grants' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-direct-grants', '1-59/10 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-direct-grants',
        headers := jsonb_build_object('Content-Type','application/json','x-intelligence-secret',(select decrypted_secret from vault.decrypted_secrets where name='intelligence_sync_secret' order by created_at desc limit 1)),
        body := '{"trigger":"schedule"}'::jsonb, timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
