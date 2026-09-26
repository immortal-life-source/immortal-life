-- Enrich every topic's public Living Evidence Dossier with transparent,
-- source-derived coverage signals. These are record counts, not clinical
-- conclusions or systematic-review judgments.

create or replace function public.get_topic_evidence_snapshot(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  topic_research as materialized (
    select item.*
    from public.research_items item
    join public.research_item_topics rel on rel.research_item_id = item.id
    where rel.topic_slug = requested_topic
      and rel.is_published
      and item.publication_state = 'published'
  ),
  research_rollup as (
    select
      count(*) research_total,
      count(*) filter (where evidence_level in ('human-synthesis', 'randomized-human', 'human-study')) human_evidence_total,
      count(*) filter (where evidence_level = 'randomized-human') randomized_human_total,
      count(*) filter (where evidence_level = 'human-synthesis') human_synthesis_total,
      count(*) filter (where evidence_level = 'preclinical') preclinical_total
    from topic_research
  ),
  research_stages as (
    select coalesce(jsonb_object_agg(stage, amount), '{}'::jsonb) research_by_stage
    from (
      select coalesce(evidence_level, 'research-record') stage, count(*) amount
      from topic_research
      group by coalesce(evidence_level, 'research-record')
    ) grouped
  ),
  topic_trials as materialized (
    select item.*
    from public.clinical_trials item
    join public.clinical_trial_topics rel on rel.clinical_trial_id = item.id
    where rel.topic_slug = requested_topic
      and rel.is_published
      and item.publication_state = 'published'
  ),
  trial_rollup as (
    select
      count(*) trial_total,
      count(*) filter (where overall_status in ('Recruiting', 'Not Yet Recruiting', 'Enrolling By Invitation', 'Active Not Recruiting')) recruiting_trials,
      count(*) filter (where coalesce((metadata->>'source_has_results')::boolean, false)) trials_with_results,
      coalesce(sum(greatest(coalesce(enrollment, 0), 0)), 0) registered_enrollment
    from topic_trials
  ),
  trial_phases as (
    select coalesce(jsonb_object_agg(phase, amount), '{}'::jsonb) trials_by_phase
    from (
      select phase, count(distinct trial.id) amount
      from topic_trials trial
      cross join lateral unnest(coalesce(trial.phases, array[]::text[])) phase
      group by phase
    ) grouped
  ),
  topic_regulatory as (
    select count(*) regulatory_total
    from public.regulatory_events event
    where event.publication_state = 'published'
      and requested_topic = any(coalesce(event.matched_topics, array[]::text[]))
  ),
  topic_integrity as (
    select count(distinct event.id) integrity_total
    from public.research_integrity_events event
    join topic_research research on research.id = event.research_item_id
    where event.event_type in ('retraction', 'withdrawal', 'correction', 'expression-of-concern')
  ),
  topic_sources as (
    select count(distinct source_id) source_count
    from (
      select source_id from topic_research
      union all
      select source_id from topic_trials
    ) sources
  ),
  topic_changes as (
    select max(event.occurred_at) last_meaningful_update
    from public.intelligence_change_events event
    where event.event_type <> 'quality_state_changed'
      and event.topic_slugs @> array[requested_topic]::text[]
  )
  select jsonb_build_object(
    'research_total', research_rollup.research_total,
    'research_by_stage', research_stages.research_by_stage,
    'human_evidence_total', research_rollup.human_evidence_total,
    'randomized_human_total', research_rollup.randomized_human_total,
    'human_synthesis_total', research_rollup.human_synthesis_total,
    'preclinical_total', research_rollup.preclinical_total,
    'trial_total', trial_rollup.trial_total,
    'recruiting_trials', trial_rollup.recruiting_trials,
    'trials_with_results', trial_rollup.trials_with_results,
    'trials_by_phase', trial_phases.trials_by_phase,
    'registered_enrollment', trial_rollup.registered_enrollment,
    'regulatory_total', topic_regulatory.regulatory_total,
    'integrity_total', topic_integrity.integrity_total,
    'source_count', topic_sources.source_count,
    'last_meaningful_update', topic_changes.last_meaningful_update,
    'generated_at', now()
  )
  from research_rollup
  cross join research_stages
  cross join trial_rollup
  cross join trial_phases
  cross join topic_regulatory
  cross join topic_integrity
  cross join topic_sources
  cross join topic_changes;
$$;

revoke all on function public.get_topic_evidence_snapshot(text) from public, anon, authenticated;
grant execute on function public.get_topic_evidence_snapshot(text) to service_role;
