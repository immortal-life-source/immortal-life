-- Reader-facing funding intelligence for every living dossier. Keep official
-- direct grants separate from publication acknowledgements and precompute the
-- complete topic landscape so public pages need one indexed cache lookup.

set statement_timeout = '10min';

create table if not exists public.topic_funding_dossier_cache (
  topic_slug text primary key references public.intelligence_topics(slug) on delete cascade,
  dossier jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

create or replace function public.refresh_topic_funding_dossier_cache()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare refreshed_rows integer := 0;
begin
  insert into public.topic_funding_dossier_cache(topic_slug, dossier, refreshed_at)
  with enabled_topics as materialized (
    select slug from public.intelligence_topics where enabled
  ), award_base as materialized (
    select fat.topic_slug, a.openalex_award_id, a.award_identifier, a.title,
      a.funder_id, a.funder_name, a.source_url, a.first_publication_date,
      a.latest_publication_date
    from public.funding_award_topics fat
    join public.funding_awards a using (openalex_award_id)
    join enabled_topics t on t.slug = fat.topic_slug
  ), grant_base as materialized (
    select fgt.topic_slug, g.source_id, g.source_grant_id, g.grant_number,
      g.title, g.funder_name, g.recipient_name, g.recipient_country_code,
      g.recipient_country_name, g.programme, g.status, g.fiscal_year,
      g.start_date, g.end_date, g.awarded_amount, g.currency, g.source_url,
      g.source_updated_at, g.first_seen_at, s.name source_name,
      s.attribution_text
    from public.funding_grant_topics fgt
    join public.funding_grants g using (source_id, source_grant_id)
    join public.content_sources s on s.id = g.source_id
      and s.enabled and s.public_display_allowed
      and s.rights_review_due_at >= current_date
    join enabled_topics t on t.slug = fgt.topic_slug
  ), award_summary as (
    select topic_slug,
      count(*)::bigint award_count,
      count(distinct coalesce(funder_id, funder_name))::bigint funder_count,
      min(first_publication_date) first_publication_date,
      max(latest_publication_date) latest_publication_date
    from award_base group by topic_slug
  ), publication_summary as (
    select ab.topic_slug,
      count(distinct aw.openalex_work_id)::bigint linked_publication_count
    from award_base ab
    join public.funding_award_works aw using (openalex_award_id)
    group by ab.topic_slug
  ), institution_summary as (
    select ab.topic_slug,
      count(distinct i.openalex_id)::bigint institution_count,
      count(distinct i.country_code) filter (where i.country_code is not null)::bigint country_count
    from award_base ab
    join public.funding_award_institutions fai using (openalex_award_id)
    join public.university_research_institutions i using (openalex_id)
    where i.is_eligible
    group by ab.topic_slug
  ), grant_summary as (
    select topic_slug,
      count(*)::bigint direct_grant_count,
      count(*) filter (
        where (start_date is null or start_date <= current_date)
          and (end_date is null or end_date >= current_date)
      )::bigint active_direct_grant_count,
      count(distinct funder_name)::bigint direct_funder_count,
      count(distinct recipient_name) filter (where recipient_name is not null)::bigint recipient_count,
      count(distinct recipient_country_code) filter (where recipient_country_code is not null)::bigint direct_country_count,
      max(coalesce(source_updated_at, start_date::timestamptz, first_seen_at)) latest_direct_activity_at
    from grant_base group by topic_slug
  ), amount_stats as (
    select topic_slug, currency, sum(awarded_amount)::numeric amount,
      count(*)::bigint grants
    from grant_base
    where awarded_amount is not null and currency is not null
    group by topic_slug, currency
  ), amount_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'currency', currency, 'amount', amount, 'grants', grants
    ) order by amount desc) amounts
    from amount_stats group by topic_slug
  ), award_funder_stats as (
    select ab.topic_slug, coalesce(ab.funder_id, ab.funder_name) funder_key,
      max(ab.funder_id) funder_id, max(ab.funder_name) funder_name,
      count(distinct ab.openalex_award_id)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from award_base ab
    left join public.funding_award_works aw using (openalex_award_id)
    group by ab.topic_slug, coalesce(ab.funder_id, ab.funder_name)
  ), ranked_award_funders as (
    select s.*, f.slug,
      row_number() over (partition by s.topic_slug order by s.awards desc, s.funder_name) rank
    from award_funder_stats s
    left join public.funding_funders f on f.funder_id = s.funder_id
  ), award_funder_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'funder_id', funder_id, 'slug', slug, 'name', funder_name,
      'awards', awards, 'publications', publications
    ) order by rank) funders,
    sum(awards) filter (where rank <= 5)::bigint top_five_awards
    from ranked_award_funders where rank <= 8 group by topic_slug
  ), direct_funder_stats as (
    select topic_slug, funder_name,
      count(*)::bigint grants,
      count(*) filter (
        where (start_date is null or start_date <= current_date)
          and (end_date is null or end_date >= current_date)
      )::bigint active_grants,
      max(coalesce(source_updated_at, start_date::timestamptz, first_seen_at)) latest_activity_at
    from grant_base group by topic_slug, funder_name
  ), ranked_direct_funders as (
    select s.*, row_number() over (
      partition by topic_slug order by grants desc, funder_name
    ) rank from direct_funder_stats s
  ), direct_funder_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'name', funder_name, 'grants', grants, 'active_grants', active_grants,
      'latest_activity_at', latest_activity_at
    ) order by rank) funders
    from ranked_direct_funders where rank <= 8 group by topic_slug
  ), institution_stats as (
    select ab.topic_slug, i.slug, i.name, i.country_code, i.country_name,
      count(distinct ab.openalex_award_id)::bigint awards
    from award_base ab
    join public.funding_award_institutions fai using (openalex_award_id)
    join public.university_research_institutions i using (openalex_id)
    where i.is_eligible
    group by ab.topic_slug, i.slug, i.name, i.country_code, i.country_name
  ), ranked_institutions as (
    select s.*, row_number() over (
      partition by topic_slug order by awards desc, name
    ) rank from institution_stats s
  ), institution_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'slug', slug, 'name', name, 'country_code', country_code,
      'country_name', country_name, 'awards', awards
    ) order by rank) institutions
    from ranked_institutions where rank <= 8 group by topic_slug
  ), acknowledgement_country_stats as (
    select ab.topic_slug, i.country_code, i.country_name,
      count(distinct ab.openalex_award_id)::bigint awards
    from award_base ab
    join public.funding_award_institutions fai using (openalex_award_id)
    join public.university_research_institutions i using (openalex_id)
    where i.is_eligible and i.country_code is not null
    group by ab.topic_slug, i.country_code, i.country_name
  ), ranked_acknowledgement_countries as (
    select s.*, row_number() over (
      partition by topic_slug order by awards desc, country_name
    ) rank from acknowledgement_country_stats s
  ), acknowledgement_country_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'country_code', country_code, 'country_name', country_name, 'awards', awards
    ) order by rank) countries
    from ranked_acknowledgement_countries where rank <= 8 group by topic_slug
  ), direct_country_stats as (
    select topic_slug, recipient_country_code country_code,
      max(recipient_country_name) country_name, count(*)::bigint grants
    from grant_base where recipient_country_code is not null
    group by topic_slug, recipient_country_code
  ), ranked_direct_countries as (
    select s.*, row_number() over (
      partition by topic_slug order by grants desc, country_name
    ) rank from direct_country_stats s
  ), direct_country_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'country_code', country_code, 'country_name', country_name, 'grants', grants
    ) order by rank) countries
    from ranked_direct_countries where rank <= 8 group by topic_slug
  ), acknowledgement_year_stats as (
    select ab.topic_slug, extract(year from w.publication_date)::integer activity_year,
      count(distinct ab.openalex_award_id)::bigint awards,
      count(distinct aw.openalex_work_id)::bigint publications
    from award_base ab
    join public.funding_award_works aw using (openalex_award_id)
    join public.university_research_works w using (openalex_work_id)
    where w.publication_date is not null
      and extract(year from w.publication_date) >= extract(year from current_date) - 11
    group by ab.topic_slug, extract(year from w.publication_date)
  ), acknowledgement_year_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'year', activity_year, 'awards', awards, 'publications', publications
    ) order by activity_year) years
    from acknowledgement_year_stats group by topic_slug
  ), direct_grant_year_stats as (
    select topic_slug, coalesce(extract(year from start_date)::integer, fiscal_year) activity_year,
      count(*)::bigint grants
    from grant_base
    where coalesce(extract(year from start_date)::integer, fiscal_year) is not null
      and coalesce(extract(year from start_date)::integer, fiscal_year) >= extract(year from current_date) - 11
    group by topic_slug, coalesce(extract(year from start_date)::integer, fiscal_year)
  ), direct_grant_year_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'year', activity_year, 'grants', grants
    ) order by activity_year) years
    from direct_grant_year_stats group by topic_slug
  ), ranked_recent_grants as (
    select gb.*, row_number() over (partition by topic_slug order by
      coalesce(source_updated_at, start_date::timestamptz, first_seen_at) desc,
      source_id, source_grant_id) rank
    from grant_base gb
  ), recent_grant_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'source_id', source_id, 'source_grant_id', source_grant_id,
      'grant_number', grant_number, 'title', title, 'funder_name', funder_name,
      'recipient_name', recipient_name, 'recipient_country_code', recipient_country_code,
      'recipient_country_name', recipient_country_name, 'programme', programme,
      'status', status, 'start_date', start_date, 'end_date', end_date,
      'awarded_amount', awarded_amount, 'currency', currency, 'source_url', source_url,
      'source_updated_at', source_updated_at, 'source_name', source_name,
      'attribution', attribution_text
    ) order by rank) grants
    from ranked_recent_grants where rank <= 6 group by topic_slug
  ), ranked_recent_awards as (
    select ab.*, f.slug funder_slug,
      row_number() over (partition by ab.topic_slug order by
        ab.latest_publication_date desc nulls last, ab.openalex_award_id) rank
    from award_base ab left join public.funding_funders f on f.funder_id = ab.funder_id
  ), recent_award_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'openalex_award_id', openalex_award_id, 'award_identifier', award_identifier,
      'title', title, 'funder_id', funder_id, 'funder_name', funder_name,
      'funder_slug', funder_slug, 'source_url', source_url,
      'latest_publication_date', latest_publication_date
    ) order by rank) awards
    from ranked_recent_awards where rank <= 6 group by topic_slug
  ), related_topic_stats as (
    select current_link.topic_slug,
      other.topic_slug related_slug,
      count(distinct current_link.openalex_award_id)::bigint shared_awards
    from public.funding_award_topics current_link
    join public.funding_award_topics other using (openalex_award_id)
    join enabled_topics current_topic on current_topic.slug = current_link.topic_slug
    join enabled_topics related_topic on related_topic.slug = other.topic_slug
    where current_link.topic_slug <> other.topic_slug
    group by current_link.topic_slug, other.topic_slug
  ), ranked_related_topics as (
    select s.*, t.name,
      row_number() over (partition by s.topic_slug order by s.shared_awards desc, t.name) rank
    from related_topic_stats s join public.intelligence_topics t on t.slug = s.related_slug
  ), related_topic_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'slug', related_slug, 'name', name, 'shared_awards', shared_awards
    ) order by rank) topics
    from ranked_related_topics where rank <= 8 group by topic_slug
  ), direct_source_json as (
    select topic_slug, jsonb_agg(jsonb_build_object(
      'id', source_id, 'name', source_name, 'attribution', attribution_text,
      'grants', grants
    ) order by source_name) sources
    from (
      select topic_slug, source_id, source_name, attribution_text,
        count(*)::bigint grants
      from grant_base group by topic_slug, source_id, source_name, attribution_text
    ) source_counts group by topic_slug
  )
  select t.slug, jsonb_build_object(
    'summary', jsonb_build_object(
      'direct_grants', coalesce(gs.direct_grant_count, 0),
      'active_direct_grants', coalesce(gs.active_direct_grant_count, 0),
      'direct_funders', coalesce(gs.direct_funder_count, 0),
      'grant_recipients', coalesce(gs.recipient_count, 0),
      'direct_countries', coalesce(gs.direct_country_count, 0),
      'award_entities', coalesce(a.award_count, 0),
      'acknowledgement_funders', coalesce(a.funder_count, 0),
      'linked_publications', coalesce(p.linked_publication_count, 0),
      'linked_universities', coalesce(i.institution_count, 0),
      'acknowledgement_countries', coalesce(i.country_count, 0),
      'first_publication_date', a.first_publication_date,
      'latest_publication_date', a.latest_publication_date,
      'latest_direct_activity_at', gs.latest_direct_activity_at,
      'top_five_acknowledgement_share_pct', case when coalesce(a.award_count, 0) > 0
        then round(100.0 * coalesce(af.top_five_awards, 0) / a.award_count, 1) else null end
    ),
    'reported_amounts', coalesce(am.amounts, '[]'::jsonb),
    'direct_funders', coalesce(df.funders, '[]'::jsonb),
    'acknowledgement_funders', coalesce(af.funders, '[]'::jsonb),
    'universities', coalesce(ij.institutions, '[]'::jsonb),
    'acknowledgement_countries', coalesce(ac.countries, '[]'::jsonb),
    'direct_countries', coalesce(dc.countries, '[]'::jsonb),
    'acknowledgement_years', coalesce(ay.years, '[]'::jsonb),
    'direct_grant_years', coalesce(gy.years, '[]'::jsonb),
    'recent_direct_grants', coalesce(rg.grants, '[]'::jsonb),
    'recent_awards', coalesce(ra.awards, '[]'::jsonb),
    'related_topics', coalesce(rt.topics, '[]'::jsonb),
    'direct_sources', coalesce(ds.sources, '[]'::jsonb)
  ), now()
  from enabled_topics t
  left join award_summary a on a.topic_slug = t.slug
  left join publication_summary p on p.topic_slug = t.slug
  left join institution_summary i on i.topic_slug = t.slug
  left join grant_summary gs on gs.topic_slug = t.slug
  left join amount_json am on am.topic_slug = t.slug
  left join award_funder_json af on af.topic_slug = t.slug
  left join direct_funder_json df on df.topic_slug = t.slug
  left join institution_json ij on ij.topic_slug = t.slug
  left join acknowledgement_country_json ac on ac.topic_slug = t.slug
  left join direct_country_json dc on dc.topic_slug = t.slug
  left join acknowledgement_year_json ay on ay.topic_slug = t.slug
  left join direct_grant_year_json gy on gy.topic_slug = t.slug
  left join recent_grant_json rg on rg.topic_slug = t.slug
  left join recent_award_json ra on ra.topic_slug = t.slug
  left join related_topic_json rt on rt.topic_slug = t.slug
  left join direct_source_json ds on ds.topic_slug = t.slug
  on conflict (topic_slug) do update set
    dossier = excluded.dossier,
    refreshed_at = excluded.refreshed_at;

  get diagnostics refreshed_rows = row_count;
  delete from public.topic_funding_dossier_cache c
  where not exists (select 1 from public.intelligence_topics t where t.slug = c.topic_slug and t.enabled);
  return refreshed_rows;
end;
$$;

create or replace function public.get_topic_funding_dossier(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dossier || jsonb_build_object('refreshed_at', refreshed_at)
  from public.topic_funding_dossier_cache
  where topic_slug = requested_topic;
$$;

alter table public.topic_funding_dossier_cache enable row level security;
revoke all on table public.topic_funding_dossier_cache from public, anon, authenticated;
grant all on table public.topic_funding_dossier_cache to service_role;
revoke all on function public.refresh_topic_funding_dossier_cache(),
  public.get_topic_funding_dossier(text) from public, anon, authenticated;
grant execute on function public.refresh_topic_funding_dossier_cache(),
  public.get_topic_funding_dossier(text) to service_role;

select public.refresh_topic_funding_dossier_cache();

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'immortal-life-topic-funding-cache' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-funding-cache', '27 */6 * * *',
    $job$select public.refresh_topic_funding_dossier_cache()$job$
  );
end
$schedule$;
