-- Senolytics is the first versioned, claim-level Living Evidence Dossier.
-- New source records update the live facts immediately, but a material event
-- never silently rewrites the published interpretation. Instead it creates a
-- visible reassessment candidate and preserves the previous version.

create table if not exists public.topic_dossier_versions (
  id bigint generated always as identity primary key,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('current', 'superseded')),
  conclusions jsonb not null check (jsonb_typeof(conclusions) = 'array'),
  evidence_state jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_state) = 'object'),
  evidence_fingerprint text not null,
  change_summary text not null,
  published_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (topic_slug, version_number)
);

create unique index if not exists topic_dossier_one_current_version_idx
  on public.topic_dossier_versions (topic_slug)
  where status = 'current';

create table if not exists public.topic_dossier_change_candidates (
  id bigint generated always as identity primary key,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  event_id bigint not null references public.intelligence_change_events(id) on delete cascade,
  materiality text not null check (materiality in ('meaningful', 'critical')),
  reason text not null,
  previous_fingerprint text not null,
  current_fingerprint text not null,
  evidence_state jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_state) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (topic_slug, event_id)
);

create index if not exists topic_dossier_pending_changes_idx
  on public.topic_dossier_change_candidates (topic_slug, created_at desc)
  where status = 'pending';

alter table public.topic_dossier_versions enable row level security;
alter table public.topic_dossier_change_candidates enable row level security;
revoke all on table public.topic_dossier_versions, public.topic_dossier_change_candidates from public, anon, authenticated;
grant all on table public.topic_dossier_versions, public.topic_dossier_change_candidates to service_role;

create or replace function public.topic_dossier_evidence_fingerprint(evidence jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(jsonb_build_object(
    'research_total', coalesce(evidence->'research_total', '0'::jsonb),
    'human_evidence_total', coalesce(evidence->'human_evidence_total', '0'::jsonb),
    'randomized_human_total', coalesce(evidence->'randomized_human_total', '0'::jsonb),
    'human_synthesis_total', coalesce(evidence->'human_synthesis_total', '0'::jsonb),
    'preclinical_total', coalesce(evidence->'preclinical_total', '0'::jsonb),
    'trial_total', coalesce(evidence->'trial_total', '0'::jsonb),
    'trials_with_results', coalesce(evidence->'trials_with_results', '0'::jsonb),
    'trials_by_phase', coalesce(evidence->'trials_by_phase', '{}'::jsonb),
    'regulatory_total', coalesce(evidence->'regulatory_total', '0'::jsonb),
    'integrity_total', coalesce(evidence->'integrity_total', '0'::jsonb)
  )::text);
$$;

do $$
declare
  snapshot jsonb;
begin
  if not exists (
    select 1 from public.topic_dossier_versions
    where topic_slug = 'senolytics' and status = 'current'
  ) then
    snapshot := public.get_topic_evidence_snapshot('senolytics');
    insert into public.topic_dossier_versions (
      topic_slug, version_number, status, conclusions, evidence_state,
      evidence_fingerprint, change_summary
    ) values (
      'senolytics',
      1,
      'current',
      jsonb_build_array(
        jsonb_build_object(
          'id', 'human-benefit',
          'label', 'Human benefit',
          'state', 'Not established',
          'assessment', 'The indexed evidence does not justify a general claim that senolytic interventions extend human lifespan or provide a proven routine longevity benefit.',
          'basis', 'Human studies and trial registrations are shown separately below. Registration, recruitment, and participant counts are not results.',
          'changes_if', 'Replicated, adequately controlled human trials report clinically meaningful benefits with an acceptable safety profile.',
          'href', '#dossier-human-evidence'
        ),
        jsonb_build_object(
          'id', 'translation',
          'label', 'Translation from laboratory evidence',
          'state', 'Still uncertain',
          'assessment', 'Targeting cellular senescence is an active biological research strategy, but laboratory and animal findings cannot by themselves establish benefit in people.',
          'basis', 'Preclinical evidence can support a mechanism and justify human research; it does not establish clinical efficacy or safety.',
          'changes_if', 'Human studies reproduce the proposed effect using meaningful health outcomes rather than only laboratory or biomarker endpoints.',
          'href', '#dossier-preclinical'
        ),
        jsonb_build_object(
          'id', 'safety',
          'label', 'Safety',
          'state', 'Intervention-specific',
          'assessment', 'A general safety conclusion is not supported. Safety depends on the compound or strategy, dose, population, duration, indication, and measured adverse events.',
          'basis', 'The absence of a matched regulatory notice is not evidence of safety, and one intervention cannot establish the safety of an entire class.',
          'changes_if', 'Larger and longer human studies provide consistent intervention-specific adverse-event data and regulators publish applicable assessments.',
          'href', '#dossier-safety'
        ),
        jsonb_build_object(
          'id', 'regulation',
          'label', 'Regulatory position',
          'state', 'No general longevity approval inferred',
          'assessment', 'Research activity and trial registration must not be interpreted as regulatory approval for longevity use.',
          'basis', 'Regulatory status is product-, indication-, jurisdiction-, formulation-, and date-specific.',
          'changes_if', 'A competent authority publishes an approval, safety restriction, recall, or other decision that explicitly applies to the intervention and use described.',
          'href', '#dossier-regulation'
        )
      ),
      snapshot,
      public.topic_dossier_evidence_fingerprint(snapshot),
      'Initial conservative evidence boundary for the Senolytics pilot.'
    );
  end if;
end;
$$;

create or replace function public.hydrate_change_event_topics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(new.topic_slugs), 0) > 0 then return new; end if;
  if new.record_type = 'research' then
    select coalesce(array_agg(distinct topic_slug), '{}') into new.topic_slugs
    from public.research_item_topics
    where research_item_id = new.record_id and is_published;
  elsif new.record_type = 'trials' then
    select coalesce(array_agg(distinct topic_slug), '{}') into new.topic_slugs
    from public.clinical_trial_topics
    where clinical_trial_id = new.record_id and is_published;
  elsif new.record_type = 'integrity' then
    select coalesce(array_agg(distinct relation.topic_slug), '{}') into new.topic_slugs
    from public.research_integrity_events integrity_event
    join public.research_item_topics relation
      on relation.research_item_id = integrity_event.research_item_id
     and relation.is_published
    where integrity_event.id = new.record_id;
  end if;
  return new;
end;
$$;

drop trigger if exists hydrate_intelligence_change_topics on public.intelligence_change_events;
create trigger hydrate_intelligence_change_topics
before insert on public.intelligence_change_events
for each row execute function public.hydrate_change_event_topics();

create or replace function public.assess_senolytics_material_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  materiality text;
  reason text;
  level text;
  record_status text;
  phases text[];
  has_results boolean := false;
  snapshot jsonb;
  current_fingerprint text;
  next_fingerprint text;
begin
  if not ('senolytics' = any(coalesce(new.topic_slugs, '{}'))) then return new; end if;
  if new.event_type = 'quality_state_changed' then return new; end if;

  if new.record_type = 'integrity' then
    materiality := 'critical';
    reason := 'A correction, retraction, withdrawal, or expression of concern can change how previously indexed evidence should be read.';
  elsif new.record_type = 'regulatory' then
    materiality := 'critical';
    reason := 'A new official notice can materially change the safety or regulatory context.';
  elsif new.record_type = 'research' then
    select evidence_level, status into level, record_status
    from public.research_items where id = new.record_id;
    if lower(coalesce(record_status, '')) = 'retracted' then
      materiality := 'critical';
      reason := 'A matched research record was retracted.';
    elsif level in ('human-synthesis', 'randomized-human') then
      materiality := 'meaningful';
      reason := 'A new human evidence synthesis or randomized human study may affect the current evidence boundary.';
    elsif level = 'human-study' and new.event_type = 'new_research' then
      materiality := 'meaningful';
      reason := 'A new human study may affect the current evidence boundary.';
    else
      return new;
    end if;
  elsif new.record_type = 'trials' then
    select clinical_trials.phases, coalesce((clinical_trials.metadata->>'source_has_results')::boolean, false)
      into phases, has_results
    from public.clinical_trials where id = new.record_id;
    if has_results then
      materiality := 'meaningful';
      reason := 'A matched trial now reports posted results.';
    elsif new.event_type = 'trial_status_changed' then
      materiality := 'meaningful';
      reason := 'A material registry status change may alter how mature the clinical evidence appears.';
    elsif phases && array['PHASE2', 'PHASE3', 'PHASE4']::text[] then
      materiality := 'meaningful';
      reason := 'A newly indexed later-phase trial may alter the clinical-development picture.';
    else
      return new;
    end if;
  else
    return new;
  end if;

  snapshot := public.get_topic_evidence_snapshot('senolytics');
  next_fingerprint := public.topic_dossier_evidence_fingerprint(snapshot);
  select evidence_fingerprint into current_fingerprint
  from public.topic_dossier_versions
  where topic_slug = 'senolytics' and status = 'current';
  current_fingerprint := coalesce(current_fingerprint, next_fingerprint);

  insert into public.topic_dossier_change_candidates (
    topic_slug, event_id, materiality, reason, previous_fingerprint,
    current_fingerprint, evidence_state
  ) values (
    'senolytics', new.id, materiality, reason, current_fingerprint,
    next_fingerprint, snapshot
  ) on conflict (topic_slug, event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists assess_senolytics_change on public.intelligence_change_events;
create trigger assess_senolytics_change
after insert or update of topic_slugs, event_type, importance on public.intelligence_change_events
for each row execute function public.assess_senolytics_material_change();

create or replace function public.get_topic_dossier_pilot(requested_topic text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_version jsonb;
  pending jsonb;
  snapshot jsonb;
begin
  if requested_topic <> 'senolytics' then return null; end if;
  snapshot := public.get_topic_evidence_snapshot(requested_topic);
  select to_jsonb(version_row) - 'status' - 'created_at'
    into current_version
  from public.topic_dossier_versions version_row
  where topic_slug = requested_topic and status = 'current';
  select coalesce(jsonb_agg(to_jsonb(change_row) - 'evidence_state' order by created_at desc), '[]'::jsonb)
    into pending
  from (
    select candidate.id, candidate.materiality, candidate.reason, candidate.created_at,
           event.event_type, event.record_type, event.record_id, event.title,
           event.source_url, event.occurred_at
    from public.topic_dossier_change_candidates candidate
    join public.intelligence_change_events event on event.id = candidate.event_id
    where candidate.topic_slug = requested_topic and candidate.status = 'pending'
    order by candidate.created_at desc
    limit 8
  ) change_row;
  return jsonb_build_object(
    'enabled', true,
    'version', current_version,
    'pending_changes', pending,
    'has_material_change', jsonb_array_length(pending) > 0,
    'live_evidence', snapshot,
    'live_fingerprint', public.topic_dossier_evidence_fingerprint(snapshot),
    'method', 'New facts update immediately. Material human, trial-result, regulatory, or integrity events open a reassessment without silently rewriting the published interpretation.'
  );
end;
$$;

create or replace function public.publish_topic_dossier_version(
  requested_topic text,
  requested_conclusions jsonb,
  requested_change_summary text,
  applied_candidate_ids bigint[] default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot jsonb;
  next_version integer;
  inserted_id bigint;
begin
  if requested_topic <> 'senolytics' then raise exception 'Pilot is limited to senolytics'; end if;
  if jsonb_typeof(requested_conclusions) <> 'array' or jsonb_array_length(requested_conclusions) = 0 then
    raise exception 'Conclusions must be a non-empty array';
  end if;
  perform 1 from public.topic_dossier_versions where topic_slug = requested_topic and status = 'current' for update;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.topic_dossier_versions where topic_slug = requested_topic;
  snapshot := public.get_topic_evidence_snapshot(requested_topic);
  update public.topic_dossier_versions
    set status = 'superseded', superseded_at = now()
    where topic_slug = requested_topic and status = 'current';
  insert into public.topic_dossier_versions (
    topic_slug, version_number, status, conclusions, evidence_state,
    evidence_fingerprint, change_summary
  ) values (
    requested_topic, next_version, 'current', requested_conclusions, snapshot,
    public.topic_dossier_evidence_fingerprint(snapshot), left(trim(requested_change_summary), 1000)
  ) returning id into inserted_id;
  update public.topic_dossier_change_candidates
    set status = 'applied', resolved_at = now()
    where topic_slug = requested_topic and id = any(coalesce(applied_candidate_ids, '{}'));
  return inserted_id;
end;
$$;

revoke all on function public.topic_dossier_evidence_fingerprint(jsonb),
  public.hydrate_change_event_topics(), public.assess_senolytics_material_change(),
  public.get_topic_dossier_pilot(text),
  public.publish_topic_dossier_version(text, jsonb, text, bigint[]) from public, anon, authenticated;
grant execute on function public.topic_dossier_evidence_fingerprint(jsonb),
  public.hydrate_change_event_topics(), public.assess_senolytics_material_change(),
  public.get_topic_dossier_pilot(text),
  public.publish_topic_dossier_version(text, jsonb, text, bigint[]) to service_role;
