-- Keep reader-facing topic dossiers and the university directory fast as the
-- uncapped historical corpus grows. These indexes and narrow aggregates avoid
-- materialising full research/trial rows for simple public counts.

create index if not exists research_item_topics_public_topic_parent_idx
  on public.research_item_topics (topic_slug, research_item_id)
  where is_published;

create index if not exists clinical_trial_topics_public_topic_parent_idx
  on public.clinical_trial_topics (topic_slug, clinical_trial_id)
  where is_published;

create index if not exists research_items_public_journal_recent_idx
  on public.research_items (journal, published_on desc nulls last, id desc)
  where publication_state = 'published' and journal is not null;

create index if not exists research_items_public_source_recent_idx
  on public.research_items (source_id, published_on desc nulls last, id desc)
  where publication_state = 'published';

create index if not exists clinical_trials_public_sponsor_recent_idx
  on public.clinical_trials (sponsor, last_update_date desc nulls last, id desc)
  where publication_state = 'published' and sponsor is not null;

create index if not exists clinical_trials_public_source_recent_idx
  on public.clinical_trials (source_id, last_update_date desc nulls last, id desc)
  where publication_state = 'published';

create index if not exists university_topic_public_activity_idx
  on public.university_research_topic_metrics
  (topic_slug, works_all_time desc, works_five_year desc, works_two_year desc, openalex_id)
  where works_all_time > 0;

create index if not exists university_topic_positive_five_year_idx
  on public.university_research_topic_metrics (topic_slug, openalex_id)
  where works_five_year > 0;

create table if not exists public.university_index_coverage_cache (
  singleton boolean primary key default true check (singleton),
  payload jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

revoke all on table public.university_index_coverage_cache from public, anon, authenticated;
grant all on table public.university_index_coverage_cache to service_role;

create or replace function public.refresh_university_index_coverage_cache()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
as $$
declare coverage jsonb;
begin
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
  ) into coverage
  from public.university_research_institutions;

  insert into public.university_index_coverage_cache(singleton, payload, refreshed_at)
  values (true, coverage, now())
  on conflict (singleton) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
end;
$$;

create or replace function public.get_university_index_coverage()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select payload || jsonb_build_object('cache_refreshed_at', refreshed_at)
  from public.university_index_coverage_cache
  where singleton;
$$;

revoke all on function public.refresh_university_index_coverage_cache(), public.get_university_index_coverage() from public, anon, authenticated;
grant execute on function public.refresh_university_index_coverage_cache(), public.get_university_index_coverage() to service_role;

select public.refresh_university_index_coverage_cache();

create or replace function public.get_topic_evidence_snapshot(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  topic_research as materialized (
    select item.id, item.source_id, item.evidence_level
    from public.research_item_topics rel
    join public.research_items item on item.id = rel.research_item_id
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
    select item.id, item.source_id, item.overall_status, item.phases, item.enrollment,
      coalesce(item.metadata->>'source_has_results', 'false') = 'true' source_has_results
    from public.clinical_trial_topics rel
    join public.clinical_trials item on item.id = rel.clinical_trial_id
    where rel.topic_slug = requested_topic
      and rel.is_published
      and item.publication_state = 'published'
  ),
  trial_rollup as (
    select
      count(*) trial_total,
      count(*) filter (where overall_status in ('Recruiting', 'Not Yet Recruiting', 'Enrolling By Invitation', 'Active Not Recruiting')) recruiting_trials,
      count(*) filter (where source_has_results) trials_with_results,
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

create or replace function public.get_topic_dossier_pilot(requested_topic text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare current_version jsonb; pending jsonb;
begin
  select to_jsonb(version_row) - 'status' - 'created_at' into current_version
  from public.topic_dossier_versions version_row
  where topic_slug = requested_topic and status = 'current';
  if current_version is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(change_row) - 'evidence_state' order by created_at desc), '[]'::jsonb) into pending
  from (
    select candidate.id, candidate.materiality, candidate.reason, candidate.created_at,
           event.event_type, event.record_type, event.record_id, event.title, event.source_url, event.occurred_at
    from public.topic_dossier_change_candidates candidate
    join public.intelligence_change_events event on event.id = candidate.event_id
    where candidate.topic_slug = requested_topic and candidate.status = 'pending'
    order by candidate.created_at desc limit 8
  ) change_row;
  return jsonb_build_object(
    'enabled', true, 'version', current_version, 'pending_changes', pending,
    'has_material_change', jsonb_array_length(pending) > 0,
    'method', 'New facts update immediately. Material human, trial-result, regulatory, or integrity events open a reassessment without silently rewriting the published interpretation.'
  );
end;
$$;

revoke all on function public.get_topic_evidence_snapshot(text), public.get_topic_dossier_pilot(text) from public, anon, authenticated;
grant execute on function public.get_topic_evidence_snapshot(text), public.get_topic_dossier_pilot(text) to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-university-coverage-cache' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-university-coverage-cache',
    '11 * * * *',
    'select public.refresh_university_index_coverage_cache();'
  );
end
$schedule$;

notify pgrst, 'reload schema';
