-- Return compact country facets with the university coverage snapshot. Public
-- requests must not transfer every institution merely to count countries.
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
    'method_version', max(ranking_method_version) filter (where is_eligible),
    'country_directory', coalesce((
      select jsonb_agg(to_jsonb(country_row) order by country_row.name)
      from (
        select country_code as code, max(country_name) as name,
          max(continent) as continent, count(*)::integer as universities
        from public.university_research_institutions
        where is_eligible and country_code is not null
        group by country_code
      ) country_row
    ), '[]'::jsonb)
  )
  from public.university_research_institutions;
$$;

revoke all on function public.get_university_index_coverage() from public, anon, authenticated;
grant execute on function public.get_university_index_coverage() to service_role;

notify pgrst, 'reload schema';
