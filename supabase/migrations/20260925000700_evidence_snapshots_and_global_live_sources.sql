-- Evidence snapshots are source-field summaries, never inferred clinical claims.
-- Two additional global feeds are enabled only within their published reuse grants:
-- ISRCTN registry contributions (CC BY / metadata CC0) and DOAJ metadata (CC0).

alter table public.research_items
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb
  check (jsonb_typeof(evidence_snapshot) = 'object');

alter table public.clinical_trials
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb
  check (jsonb_typeof(evidence_snapshot) = 'object');

create or replace function public.build_research_evidence_snapshot(item public.research_items)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'status', 'metadata-only',
    'evidence_stage', case item.evidence_level
      when 'human-synthesis' then 'Evidence synthesis'
      when 'randomized-human' then 'Randomized human study'
      when 'human-study' then 'Human study'
      when 'preclinical' then 'Preclinical research'
      when 'preprint' then 'Preprint — not peer reviewed'
      else 'Research record' end,
    'study_design', item.publication_type,
    'subject_scope', case
      when item.evidence_level = 'preclinical' then 'Preclinical (laboratory or animal research)'
      when item.evidence_level in ('human-synthesis', 'randomized-human', 'human-study') then 'Human evidence'
      when item.evidence_level = 'preprint' then 'Not established from reusable metadata'
      else 'Not reported in reusable metadata' end,
    'participants', null,
    'population', null,
    'duration', null,
    'intervention', '[]'::jsonb,
    'comparator', null,
    'outcomes_measured', '[]'::jsonb,
    'reported_outcome', null,
    'main_limitation', case
      when item.evidence_level = 'preclinical' then 'Preclinical findings may not apply to people; the reusable source metadata does not provide enough detail to assess the result.'
      when item.evidence_level = 'preprint' then 'This record has not completed peer review, and the reusable source metadata does not support a finding-level summary.'
      else 'Bibliographic metadata identifies the record but does not provide enough reusable detail to summarize its population, comparison, findings, or effect size.' end,
    'safety_context', 'This index record does not establish safety, effectiveness, dose, or suitability for any person.',
    'regulatory_context', 'A publication record is not a regulatory approval or treatment recommendation.',
    'source_support', 'Bibliographic citation metadata and controlled indexing terms only. Read the linked source for methods and results.',
    'confidence', 'metadata-limited',
    'generated_at', now(),
    'provenance', jsonb_build_object(
      'evidence_stage', 'evidence_level',
      'study_design', 'publication_type',
      'source_support', 'content source reuse policy'
    )
  );
$$;

create or replace function public.build_trial_evidence_snapshot(item public.clinical_trials)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'status', 'structured',
    'evidence_stage', case when cardinality(item.phases) > 0 then array_to_string(item.phases, ', ') else 'Phase not reported' end,
    'study_design', coalesce(nullif(item.metadata->>'design_description', ''), item.study_type),
    'subject_scope', 'Human clinical study registration',
    'participants', item.enrollment,
    'population', nullif(concat_ws(' · ', nullif(item.metadata->>'sex', ''), nullif(item.metadata->>'age_range', '')), ''),
    'duration', case
      when item.start_date is not null and item.completion_date is not null then item.start_date::text || ' to ' || item.completion_date::text
      when item.start_date is not null then 'From ' || item.start_date::text
      when item.completion_date is not null then 'Until ' || item.completion_date::text
      else null end,
    'intervention', coalesce(item.metadata->'interventions', '[]'::jsonb),
    'comparator', nullif(item.metadata->>'comparator', ''),
    'outcomes_measured', coalesce(item.metadata->'outcome_measures', '[]'::jsonb),
    'reported_outcome', nullif(item.metadata->>'result_summary', ''),
    'main_limitation', case when nullif(item.metadata->>'result_summary', '') is not null
      then 'Registry results are sponsor-submitted and should be checked against the full source record and any peer-reviewed publication.'
      else 'This is a study registration. No reusable structured result is available here, so it cannot show whether the intervention worked or was safe.' end,
    'safety_context', 'Eligibility, adverse-event details, and clinical decisions must be checked in the official registry and with qualified clinicians.',
    'regulatory_context', 'Trial registration is not regulatory approval and does not establish that an intervention is available.',
    'source_support', case when nullif(item.metadata->>'result_summary', '') is not null
      then 'Structured registry metadata with a source-supplied result summary.'
      else 'Structured registry protocol metadata; no finding-level conclusion is generated.' end,
    'confidence', 'structured-source',
    'generated_at', now(),
    'provenance', jsonb_build_object(
      'evidence_stage', 'phases',
      'study_design', 'study_type and registry design fields',
      'participants', 'enrollment',
      'population', 'registry eligibility fields',
      'duration', 'start_date and completion_date',
      'intervention', 'registry intervention fields',
      'comparator', 'registry arm fields',
      'outcomes_measured', 'registry outcome-measure fields',
      'reported_outcome', case when nullif(item.metadata->>'result_summary', '') is not null then 'registry structured result summary' else 'not available' end
    )
  );
$$;

create or replace function public.refresh_research_evidence_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.evidence_snapshot = '{}'::jsonb or new.evidence_snapshot is null then
    new.evidence_snapshot := public.build_research_evidence_snapshot(new);
  end if;
  return new;
end;
$$;

create or replace function public.refresh_trial_evidence_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.evidence_snapshot = '{}'::jsonb or new.evidence_snapshot is null then
    new.evidence_snapshot := public.build_trial_evidence_snapshot(new);
  end if;
  return new;
end;
$$;

drop trigger if exists research_evidence_snapshot_before_write on public.research_items;
create trigger research_evidence_snapshot_before_write
before insert or update of evidence_level, publication_type, metadata on public.research_items
for each row execute function public.refresh_research_evidence_snapshot();

drop trigger if exists trial_evidence_snapshot_before_write on public.clinical_trials;
create trigger trial_evidence_snapshot_before_write
before insert or update of phases, study_type, enrollment, start_date, completion_date, metadata on public.clinical_trials
for each row execute function public.refresh_trial_evidence_snapshot();

create or replace function public.backfill_evidence_snapshots(batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  research_updated integer := 0;
  trials_updated integer := 0;
  backfill_job_id bigint;
begin
  with targets as (
    select id from public.research_items
    where evidence_snapshot = '{}'::jsonb order by id limit greatest(1, least(batch_size, 2000))
  )
  update public.research_items item
  set evidence_snapshot = public.build_research_evidence_snapshot(item)
  from targets where item.id = targets.id;
  get diagnostics research_updated = row_count;

  with targets as (
    select id from public.clinical_trials
    where evidence_snapshot = '{}'::jsonb order by id limit greatest(1, least(batch_size, 2000))
  )
  update public.clinical_trials item
  set evidence_snapshot = public.build_trial_evidence_snapshot(item)
  from targets where item.id = targets.id;
  get diagnostics trials_updated = row_count;

  if research_updated = 0 and trials_updated = 0 then
    select jobid into backfill_job_id from cron.job where jobname = 'immortal-life-evidence-snapshot-backfill' limit 1;
    if backfill_job_id is not null then perform cron.unschedule(backfill_job_id); end if;
  end if;
  return jsonb_build_object('research', research_updated, 'trials', trials_updated);
end;
$$;

create or replace function public.get_topic_evidence_snapshot(requested_topic text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'research_total', (select count(*) from public.research_items item join public.research_item_topics rel on rel.research_item_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published'),
    'research_by_stage', coalesce((select jsonb_object_agg(stage, amount) from (
      select item.evidence_level stage, count(*) amount
      from public.research_items item join public.research_item_topics rel on rel.research_item_id = item.id
      where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published'
      group by item.evidence_level order by item.evidence_level
    ) stages), '{}'::jsonb),
    'trial_total', (select count(*) from public.clinical_trials item join public.clinical_trial_topics rel on rel.clinical_trial_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published'),
    'recruiting_trials', (select count(*) from public.clinical_trials item join public.clinical_trial_topics rel on rel.clinical_trial_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published' and item.overall_status in ('Recruiting','Not Yet Recruiting','Enrolling By Invitation','Active Not Recruiting')),
    'trials_with_results', (select count(*) from public.clinical_trials item join public.clinical_trial_topics rel on rel.clinical_trial_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published' and coalesce((item.metadata->>'source_has_results')::boolean, false)),
    'source_count', (select count(distinct source_id) from (
      select item.source_id from public.research_items item join public.research_item_topics rel on rel.research_item_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published'
      union all
      select item.source_id from public.clinical_trials item join public.clinical_trial_topics rel on rel.clinical_trial_id = item.id where rel.topic_slug = requested_topic and rel.is_published and item.publication_state = 'published'
    ) sources),
    'generated_at', now()
  );
$$;

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence, enabled,
   rights_class, automated_ingestion_allowed, public_display_allowed,
   paid_distribution_allowed, permitted_content_scope, attribution_text,
   rights_basis, rights_reviewed_at)
values
  ('isrctn', 'ISRCTN Registry', 'trial_registry', 'https://www.isrctn.com/',
   'https://www.isrctn.com/api/query/format/default', 'https://www.isrctn.com/page/terms',
   'Every 6 hours', true, 'commercial', true, true, true,
   'Structured registry contribution data and metadata only; excludes contact details, participant-level data, attached files and third-party publications.',
   'Source: ISRCTN Registry; record identifier and retrieval date retained with each record.',
   'ISRCTN states that contribution content is CC BY 4.0, registration metadata is CC0, commercial reuse is permitted with attribution, and a public XML API is provided.', current_date),
  ('doaj', 'Directory of Open Access Journals', 'literature', 'https://doaj.org/',
   'https://doaj.org/api/search/articles/', 'https://doaj.org/terms/',
   'Every 6 hours', true, 'commercial', true, true, true,
   'Article-level bibliographic metadata, authors, journal, identifiers and keywords only; excludes abstracts, full text and publisher media.',
   'Source: Directory of Open Access Journals (DOAJ) metadata.',
   'DOAJ article-level metadata is made available under the CC0 waiver through its public API.', current_date)
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
  rights_reviewed_at = excluded.rights_reviewed_at, updated_at = now();

update public.global_resources set
  data_url = 'https://www.isrctn.com/api/query/format/default',
  access_mode = 'api', reuse_status = 'open', integration_status = 'live',
  content_source_id = 'isrctn', update_cadence = 'Every 6 hours',
  healthcheck_url = 'https://www.isrctn.com/api/query/format/default?q=aging&limit=1',
  rights_class = 'commercial', automated_ingestion_allowed = true,
  paid_distribution_allowed = true,
  permitted_content_scope = 'Structured registry contribution data and metadata only; excludes contact details, participant-level data, attached files and third-party publications.',
  rights_basis = 'ISRCTN contribution content is CC BY 4.0 and registration metadata is CC0; commercial reuse is permitted with attribution.',
  rights_reviewed_at = current_date, updated_at = now()
where id = 'isrctn';

insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name,
   region, authority_tier, description, limitations, homepage_url, data_url,
   terms_url, access_mode, reuse_status, integration_status, content_source_id,
   update_cadence, healthcheck_url, rights_class, automated_ingestion_allowed,
   paid_distribution_allowed, permitted_content_scope, rights_basis, rights_reviewed_at)
values
  ('doaj', 'Directory of Open Access Journals', 'evidence_infrastructure', 'global', 'INT', 'International',
   'Global', 1,
   'Global directory of peer-reviewed open-access journals and article metadata across countries, languages, and disciplines.',
   'Indexing and open access do not establish study quality or clinical usefulness. immortal.life uses bibliographic metadata and links, not publisher full text.',
   'https://doaj.org/', 'https://doaj.org/api/search/articles/', 'https://doaj.org/terms/',
   'api', 'open', 'live', 'doaj', 'Every 6 hours', 'https://doaj.org/api/search/articles/aging?pageSize=1',
   'commercial', true, true,
   'Article-level bibliographic metadata, authors, journal, identifiers and keywords only; excludes abstracts, full text and publisher media.',
   'DOAJ article-level metadata is made available under the CC0 waiver through its public API.', current_date)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, limitations = excluded.limitations,
  homepage_url = excluded.homepage_url, data_url = excluded.data_url,
  terms_url = excluded.terms_url, access_mode = excluded.access_mode,
  reuse_status = excluded.reuse_status, integration_status = excluded.integration_status,
  content_source_id = excluded.content_source_id, update_cadence = excluded.update_cadence,
  healthcheck_url = excluded.healthcheck_url, rights_class = excluded.rights_class,
  automated_ingestion_allowed = excluded.automated_ingestion_allowed,
  paid_distribution_allowed = excluded.paid_distribution_allowed,
  permitted_content_scope = excluded.permitted_content_scope,
  rights_basis = excluded.rights_basis, rights_reviewed_at = excluded.rights_reviewed_at,
  updated_at = now();

insert into public.ingestion_jobs
  (source_id, topic_slug, job_key, window_start, sync_mode, status, available_at)
select source.id, topic.slug, topic.slug || ':history', '1800-01-01 00:00:00+00',
       'history', 'pending', now()
from public.content_sources source
cross join public.intelligence_topics topic
where source.id in ('isrctn', 'doaj') and source.enabled and topic.enabled
on conflict (source_id, job_key, window_start) do nothing;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-evidence-snapshot-backfill' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('immortal-life-evidence-snapshot-backfill', '* * * * *', 'select public.backfill_evidence_snapshots(500);');
end
$schedule$;

select public.backfill_evidence_snapshots(500);

select public.refresh_global_resource_eligibility();

revoke all on function public.build_research_evidence_snapshot(public.research_items), public.build_trial_evidence_snapshot(public.clinical_trials), public.refresh_research_evidence_snapshot(), public.refresh_trial_evidence_snapshot(), public.backfill_evidence_snapshots(integer), public.get_topic_evidence_snapshot(text) from public, anon, authenticated;
grant execute on function public.build_research_evidence_snapshot(public.research_items), public.build_trial_evidence_snapshot(public.clinical_trials), public.refresh_research_evidence_snapshot(), public.refresh_trial_evidence_snapshot(), public.backfill_evidence_snapshots(integer), public.get_topic_evidence_snapshot(text) to service_role;
