-- Very large funders need a complete headline plus a bounded relationship
-- sample. Reuse the already-refreshed Funding Radar cache for complete leading
-- publication totals and keep the exploratory sections responsive.

create or replace function public.get_funder_page(p_funder_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select * from public.funding_funders where funder_id = p_funder_id
  ), award_summary as (
    select count(*)::bigint award_count,
      min(first_publication_date) first_publication_date,
      max(latest_publication_date) latest_publication_date
    from public.funding_awards
    where funder_id = p_funder_id
  ), cached_summary as (
    select (entry->>'awards')::bigint award_count,
      (entry->>'publications')::bigint linked_publication_count
    from public.funding_radar_overview_cache c
    cross join lateral jsonb_array_elements(coalesce(c.overview->'leading_funders', '[]'::jsonb)) entry
    where c.id and entry->>'funder_id' = p_funder_id
    limit 1
  ), sample_awards as materialized (
    select a.openalex_award_id, a.award_identifier, a.title, a.source_url,
      a.first_publication_date, a.latest_publication_date
    from public.funding_awards a
    where a.funder_id = p_funder_id
    order by a.latest_publication_date desc nulls last, a.openalex_award_id
    limit 2500
  ), sample_work_summary as (
    select count(distinct aw.openalex_work_id)::bigint linked_publication_count
    from sample_awards a
    join public.funding_award_works aw using (openalex_award_id)
  ), sample_topic_summary as (
    select count(distinct fat.topic_slug)::bigint topic_count
    from sample_awards a
    join public.funding_award_topics fat using (openalex_award_id)
  ), sample_institution_summary as (
    select count(distinct fai.openalex_id)::bigint institution_count
    from sample_awards a
    join public.funding_award_institutions fai using (openalex_award_id)
  ), summary as (
    select a.award_count,
      coalesce(c.linked_publication_count, w.linked_publication_count)::bigint linked_publication_count,
      t.topic_count, i.institution_count,
      a.first_publication_date, a.latest_publication_date,
      (c.linked_publication_count is not null or a.award_count <= 2500) as linked_publication_count_complete
    from award_summary a
    cross join sample_work_summary w
    cross join sample_topic_summary t
    cross join sample_institution_summary i
    left join cached_summary c on true
  ), scope as (
    select least(a.award_count, 2500)::bigint sampled_awards,
      a.award_count::bigint total_awards,
      (a.award_count <= 2500) as relationships_complete
    from award_summary a
  ), cohorts as (
    select extract(year from a.latest_publication_date)::integer as "year",
      count(*)::bigint awards
    from sample_awards a
    where a.latest_publication_date is not null
    group by 1 order by 1 desc limit 20
  ), topics as (
    select t.slug, t.name, count(*)::bigint awards
    from sample_awards a
    join public.funding_award_topics fat using (openalex_award_id)
    join public.intelligence_topics t on t.slug = fat.topic_slug
    group by t.slug, t.name order by awards desc, t.name limit 18
  ), institutions as (
    select i.slug, i.name, i.country_code, i.country_name,
      count(*)::bigint awards
    from sample_awards a
    join public.funding_award_institutions fai using (openalex_award_id)
    join public.university_research_institutions i
      on i.openalex_id = fai.openalex_id and i.is_eligible
    group by i.slug, i.name, i.country_code, i.country_name
    order by awards desc, i.name limit 18
  ), recent_awards as (
    select a.*,
      (select count(*)::bigint from public.funding_award_works x
        where x.openalex_award_id = a.openalex_award_id) as publication_count,
      coalesce((select jsonb_agg(to_jsonb(w) order by w.publication_date desc nulls last)
        from (select uw.title, uw.publication_date, uw.source_url
          from public.funding_award_works x
          join public.university_research_works uw using (openalex_work_id)
          where x.openalex_award_id = a.openalex_award_id
          order by uw.publication_date desc nulls last limit 3) w), '[]'::jsonb) as publications
    from (select * from sample_awards limit 30) a
  )
  select case when exists(select 1 from target) then jsonb_build_object(
    'profile', (select to_jsonb(t) from target t),
    'summary', (select to_jsonb(s) from summary s),
    'scope', (select to_jsonb(s) from scope s),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c) order by c.year desc) from cohorts c), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(t)) from topics t), '[]'::jsonb),
    'institutions', coalesce((select jsonb_agg(to_jsonb(i)) from institutions i), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(to_jsonb(a)) from recent_awards a), '[]'::jsonb)
  ) else null end;
$$;

revoke all on function public.get_funder_page(text) from public, anon, authenticated;
grant execute on function public.get_funder_page(text) to service_role;
