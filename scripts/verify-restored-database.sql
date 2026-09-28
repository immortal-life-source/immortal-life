\set ON_ERROR_STOP on

do $$
declare
  topic_count bigint;
  research_count bigint;
  trial_count bigint;
  university_count bigint;
begin
  if to_regclass('public.intelligence_topics') is null
     or to_regclass('public.research_items') is null
     or to_regclass('public.clinical_trials') is null
     or to_regclass('public.university_research_institutions') is null then
    raise exception 'Restore is missing one or more critical tables';
  end if;

  select count(*) into topic_count from public.intelligence_topics;
  select count(*) into research_count from public.research_items;
  select count(*) into trial_count from public.clinical_trials;
  select count(*) into university_count from public.university_research_institutions;

  if topic_count < 180 then
    raise exception 'Restore has only % topics; expected at least 180', topic_count;
  end if;
  if research_count = 0 then
    raise exception 'Restore contains no research records';
  end if;
  if trial_count = 0 then
    raise exception 'Restore contains no trial records';
  end if;
  if university_count = 0 then
    raise exception 'Restore contains no university records';
  end if;

  raise notice 'Restore verified: % topics, % research records, % trials, % universities',
    topic_count, research_count, trial_count, university_count;
end
$$;

