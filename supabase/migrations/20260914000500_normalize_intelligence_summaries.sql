-- Summaries must remain stable when one record matches multiple topics. Topic
-- associations are displayed as separate tags rather than embedded in a field
-- that can be overwritten by the last source job.

update public.research_items
set editorial_summary =
  case evidence_level
    when 'human-synthesis' then 'Evidence synthesis'
    when 'randomized-human' then 'Randomized human study'
    when 'human-study' then 'Human study'
    when 'preclinical' then 'Preclinical research'
    when 'preprint' then 'Preprint — not peer reviewed'
    else 'Research record'
  end
  || case when journal is not null and btrim(journal) <> '' then ' published by ' || left(journal, 120) else '' end
  || ', indexed because it matched monitored longevity research terms. Inclusion in this index does not establish that an intervention is effective or safe.';

update public.clinical_trials
set
  phases = array_remove(phases, 'NA'),
  editorial_summary =
    'A registered '
    || case
      when cardinality(array_remove(phases, 'NA')) > 0
        then array_to_string(array_remove(phases, 'NA'), ', ') || ' '
      else ''
    end
    || 'study indexed because it matched monitored longevity research terms. Registry status: '
    || overall_status
    || '. Registration does not establish safety or effectiveness.';
