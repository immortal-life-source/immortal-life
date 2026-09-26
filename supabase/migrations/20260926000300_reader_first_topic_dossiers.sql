-- Reader-first topic dossier support.
-- One set-based call supplies the top research-active universities and an
-- eight-year publication history without making every browser scan raw rows.

create or replace function public.get_topic_reader_overview(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  year_range as (
    select generate_series(
      extract(year from current_date)::integer - 7,
      extract(year from current_date)::integer
    ) as publication_year
  ),
  research_years as (
    select extract(year from item.published_on)::integer as publication_year, count(*)::integer amount
    from public.research_items item
    join public.research_item_topics relation on relation.research_item_id = item.id
    where relation.topic_slug = requested_topic
      and relation.is_published
      and item.publication_state = 'published'
      and item.published_on >= make_date(extract(year from current_date)::integer - 7, 1, 1)
    group by extract(year from item.published_on)::integer
  ),
  annual_history as (
    select jsonb_agg(
      jsonb_build_object('year', years.publication_year, 'count', coalesce(research.amount, 0))
      order by years.publication_year
    ) history
    from year_range years
    left join research_years research on research.publication_year = years.publication_year
  ),
  comparison as (
    select
      coalesce(sum(amount) filter (
        where publication_year between extract(year from current_date)::integer - 3
                       and extract(year from current_date)::integer - 1
      ), 0)::integer recent_total,
      coalesce(sum(amount) filter (
        where publication_year between extract(year from current_date)::integer - 6
                       and extract(year from current_date)::integer - 4
      ), 0)::integer prior_total
    from research_years
  ),
  university_rows as (
    select
      institution.slug,
      institution.name,
      institution.city,
      institution.country_name,
      institution.country_code,
      metric.works_all_time,
      metric.works_five_year,
      metric.works_two_year,
      metric.representative_citations,
      row_number() over (
        order by metric.works_all_time desc,
                 metric.works_five_year desc,
                 metric.works_two_year desc,
                 institution.name
      ) rank
    from public.university_research_topic_metrics metric
    join public.university_research_institutions institution
      on institution.openalex_id = metric.openalex_id
    where metric.topic_slug = requested_topic
      and institution.is_eligible
      and metric.works_all_time > 0
  ),
  leading_universities as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'slug', slug,
        'name', name,
        'city', city,
        'country_name', country_name,
        'country_code', country_code,
        'works_all_time', works_all_time,
        'works_five_year', works_five_year,
        'works_two_year', works_two_year,
        'representative_citations', representative_citations
      ) order by rank
    ), '[]'::jsonb) universities
    from university_rows
    where rank <= 6
  )
  select jsonb_build_object(
    'research_by_year', annual_history.history,
    'trend_recent_total', comparison.recent_total,
    'trend_prior_total', comparison.prior_total,
    'trend_direction', case
      when comparison.recent_total + comparison.prior_total < 5 then 'limited'
      when comparison.prior_total = 0 and comparison.recent_total > 0 then 'growing'
      when comparison.recent_total > comparison.prior_total * 1.20 then 'growing'
      when comparison.recent_total < comparison.prior_total * 0.80 then 'slowing'
      else 'steady'
    end,
    'universities', leading_universities.universities,
    'generated_at', now()
  )
  from annual_history
  cross join comparison
  cross join leading_universities;
$$;

revoke all on function public.get_topic_reader_overview(text) from public, anon, authenticated;
grant execute on function public.get_topic_reader_overview(text) to service_role;
