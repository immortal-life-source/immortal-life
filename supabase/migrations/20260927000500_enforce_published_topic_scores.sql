-- A public topic relationship is never valid below the documented 60% match
-- threshold. Repair legacy flags and make the rule structural so neither an
-- interrupted worker nor an old ingestion path can publish a zero-score link.

create temporary table invalid_public_research_topics on commit drop as
select distinct research_item_id
from public.research_item_topics
where is_published and relevance_score < 60;

create temporary table invalid_public_trial_topics on commit drop as
select distinct clinical_trial_id
from public.clinical_trial_topics
where is_published and relevance_score < 60;

update public.research_item_topics
set is_published = false, evaluated_at = now()
where is_published and relevance_score < 60;

update public.clinical_trial_topics
set is_published = false, evaluated_at = now()
where is_published and relevance_score < 60;

do $$
declare research_ids bigint[];
declare trial_ids bigint[];
begin
  select array_agg(distinct research_item_id) into research_ids
  from invalid_public_research_topics;
  if coalesce(array_length(research_ids, 1), 0) > 0 then
    perform public.refresh_research_quality(research_ids);
  end if;

  select array_agg(distinct clinical_trial_id) into trial_ids
  from invalid_public_trial_topics;
  if coalesce(array_length(trial_ids, 1), 0) > 0 then
    perform public.refresh_trial_quality(trial_ids);
  end if;
end;
$$;

alter table public.research_item_topics
  drop constraint if exists research_item_topics_published_score_check;
alter table public.research_item_topics
  add constraint research_item_topics_published_score_check
  check (not is_published or relevance_score >= 60);

alter table public.clinical_trial_topics
  drop constraint if exists clinical_trial_topics_published_score_check;
alter table public.clinical_trial_topics
  add constraint clinical_trial_topics_published_score_check
  check (not is_published or relevance_score >= 60);

notify pgrst, 'reload schema';
