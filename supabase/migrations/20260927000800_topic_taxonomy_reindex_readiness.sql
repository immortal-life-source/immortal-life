-- A topic can receive a maintained interpretation only after the retained
-- corpus has been re-evaluated against the complete taxonomy and every
-- approved historical stream has finished. The work is deliberately bounded,
-- resumable, private, and scheduled outside the main visitor traffic window.

create table if not exists public.topic_taxonomy_reindex_runs (
  taxonomy_version text not null,
  entity_kind text not null check (entity_kind in ('research', 'trials')),
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  cursor_id bigint not null default 0 check (cursor_id >= 0),
  upper_bound_id bigint not null default 0 check (upper_bound_id >= 0),
  records_processed bigint not null default 0 check (records_processed >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (taxonomy_version, entity_kind)
);

create table if not exists public.topic_coverage_readiness (
  topic_slug text primary key references public.intelligence_topics(slug) on delete cascade,
  taxonomy_version text not null,
  research_reindexed boolean not null default false,
  trials_reindexed boolean not null default false,
  research_history_expected integer not null default 0,
  research_history_complete integer not null default 0,
  trial_history_expected integer not null default 0,
  trial_history_complete integer not null default 0,
  university_history_complete boolean not null default false,
  failed_history_streams integer not null default 0,
  invalid_public_matches integer not null default 0,
  ready boolean not null default false,
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  checked_at timestamptz not null default now()
);

create index if not exists topic_coverage_readiness_ready_idx
  on public.topic_coverage_readiness (ready, checked_at desc);

alter table public.topic_taxonomy_reindex_runs enable row level security;
alter table public.topic_coverage_readiness enable row level security;
revoke all on table public.topic_taxonomy_reindex_runs, public.topic_coverage_readiness from public, anon, authenticated;
grant all on table public.topic_taxonomy_reindex_runs, public.topic_coverage_readiness to service_role;

create or replace function public.topic_normalize_match_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(regexp_replace(regexp_replace(
    regexp_replace(lower(coalesce(value, '')), '[‐‑‒–—]', '-', 'g'),
    '[^a-z0-9+ -]+', ' ', 'g'
  ), '\s+', ' ', 'g'));
$$;

create or replace function public.topic_match_assessment(
  requested_topic text,
  record_title text,
  record_body text,
  record_terms text,
  record_study_type text default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  topic public.intelligence_topics%rowtype;
  title_text text := public.topic_normalize_match_text(record_title);
  body_text text := public.topic_normalize_match_text(record_body);
  terms_text text := public.topic_normalize_match_text(record_terms);
  study_text text := public.topic_normalize_match_text(record_study_type);
  title_terms text[] := '{}';
  body_terms text[] := '{}';
  controlled_terms text[] := '{}';
  matched_fields text[] := '{}';
  reasons jsonb := '[]'::jsonb;
  title_context boolean;
  body_context boolean;
  controlled_context boolean;
  score integer := 0;
begin
  select * into topic from public.intelligence_topics
  where slug = requested_topic and enabled;
  if not found or cardinality(topic.matching_terms) = 0 then
    return jsonb_build_object('score', 0, 'publish', false, 'matched_fields', '[]'::jsonb,
      'reasons', jsonb_build_array('No controlled terminology profile exists for this topic.'));
  end if;

  select coalesce(array_agg(term), '{}') into title_terms
  from unnest(topic.matching_terms) term
  where position(public.topic_normalize_match_text(term) in title_text) > 0;
  select coalesce(array_agg(term), '{}') into body_terms
  from unnest(topic.matching_terms) term
  where position(public.topic_normalize_match_text(term) in body_text) > 0;
  select coalesce(array_agg(term), '{}') into controlled_terms
  from unnest(topic.matching_terms) term
  where position(public.topic_normalize_match_text(term) in terms_text) > 0;

  title_context := title_text ~ '(aging|ageing|longevity|lifespan|healthspan|rejuvenation|senescence|frailty|biological age|age-related|age associated|geroscience|older adult|older people|elderly|centenarian|geriatric|progeria)';
  body_context := body_text ~ '(aging|ageing|longevity|lifespan|healthspan|rejuvenation|senescence|frailty|biological age|age-related|age associated|geroscience|older adult|older people|elderly|centenarian|geriatric|progeria)';
  controlled_context := terms_text ~ '(aging|ageing|longevity|lifespan|healthspan|rejuvenation|senescence|frailty|biological age|age-related|age associated|geroscience|older adult|older people|elderly|centenarian|geriatric|progeria)';

  if cardinality(title_terms) > 0 then
    score := score + 55;
    matched_fields := array_append(matched_fields, 'title');
    reasons := reasons || jsonb_build_array('Title contains controlled topic terminology.');
  end if;
  if cardinality(body_terms) > 0 then
    score := score + 32;
    matched_fields := array_append(matched_fields, 'abstract');
    reasons := reasons || jsonb_build_array('Summary contains controlled topic terminology.');
  end if;
  if cardinality(controlled_terms) > 0 then
    score := score + 45;
    matched_fields := array_append(matched_fields, 'controlled terminology');
    reasons := reasons || jsonb_build_array('Source terminology contains a controlled topic term.');
  end if;
  if title_context then
    score := score + 20;
    matched_fields := array_append(matched_fields, 'title context');
    reasons := reasons || jsonb_build_array('Title supplies ageing or longevity context.');
  elsif body_context then
    score := score + 12;
    matched_fields := array_append(matched_fields, 'abstract context');
    reasons := reasons || jsonb_build_array('Summary supplies ageing or longevity context.');
  elsif controlled_context then
    score := score + 10;
    matched_fields := array_append(matched_fields, 'controlled context');
    reasons := reasons || jsonb_build_array('Source terminology supplies ageing or longevity context.');
  end if;
  if study_text ~ '(randomized|randomised|clinical trial|systematic review|meta-analysis|observational|cohort|interventional)' then
    score := score + 5;
    matched_fields := array_append(matched_fields, 'study type');
  end if;
  if ((cardinality(title_terms) > 0)::integer + (cardinality(body_terms) > 0)::integer + (cardinality(controlled_terms) > 0)::integer) >= 2 then
    score := score + 8;
  end if;
  if cardinality(title_terms) + cardinality(body_terms) + cardinality(controlled_terms) = 0 then
    score := 0;
    reasons := reasons || jsonb_build_array('No controlled topic term is present in the retained metadata.');
  elsif topic.requires_ageing_context and (not title_context or cardinality(title_terms) = 0) then
    score := least(score, 45);
    reasons := reasons || jsonb_build_array('This broad topic requires both its topic term and clear ageing context in the title.');
  end if;
  score := greatest(0, least(100, score));
  return jsonb_build_object(
    'score', score,
    'publish', score >= 60,
    'matched_fields', to_jsonb(matched_fields),
    'reasons', reasons
  );
end;
$$;

create or replace function public.start_topic_taxonomy_reindex(requested_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(requested_version), '') is null then raise exception 'A taxonomy version is required'; end if;
  insert into public.topic_taxonomy_reindex_runs(taxonomy_version, entity_kind, upper_bound_id)
  values
    (requested_version, 'research', coalesce((select max(id) from public.research_items), 0)),
    (requested_version, 'trials', coalesce((select max(id) from public.clinical_trials), 0))
  on conflict (taxonomy_version, entity_kind) do update set
    status = 'pending', cursor_id = 0,
    upper_bound_id = excluded.upper_bound_id,
    records_processed = 0, started_at = now(), completed_at = null,
    last_error = null, updated_at = now();
end;
$$;

-- Newly ingested pages receive the same all-taxonomy treatment immediately,
-- so completion of the historical pass does not create a stale boundary.
create or replace function public.reindex_research_source_records(p_source_id text, p_external_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare record_ids bigint[]; affected integer := 0;
begin
  select coalesce(array_agg(id), '{}') into record_ids from public.research_items
  where source_id = p_source_id and external_id = any(coalesce(p_external_ids, '{}'));
  affected := coalesce(cardinality(record_ids), 0);
  if affected = 0 then return 0; end if;
  delete from public.research_item_topics relation
  where relation.research_item_id = any(record_ids) and relation.matched_by <> 'curated-rule';
  insert into public.research_item_topics(
    research_item_id, topic_slug, matched_by, relevance_score,
    match_reasons, matched_fields, is_published, evaluated_at
  )
  select item.id, topic.slug, 'source-query', (assessment->>'score')::smallint,
    assessment->'reasons', array(select jsonb_array_elements_text(assessment->'matched_fields')),
    (assessment->>'publish')::boolean, now()
  from public.research_items item
  cross join public.intelligence_topics topic
  cross join lateral public.topic_match_assessment(
    topic.slug, item.title, item.abstract_text,
    array_to_string(item.controlled_terms, ' '), item.publication_type
  ) as matched(assessment)
  where item.id = any(record_ids) and topic.enabled and (assessment->>'publish')::boolean
  on conflict (research_item_id, topic_slug) do update set
    matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
    match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
    is_published = excluded.is_published, evaluated_at = excluded.evaluated_at;
  perform public.refresh_research_quality(record_ids);
  update public.research_items item set
    relevance_confidence = 0, publication_state = 'quarantined',
    match_explanation = 'Quarantined automatically because no publishable relationship remained after the complete taxonomy evaluation.',
    quality_checked_at = now()
  where item.id = any(record_ids)
    and not exists (select 1 from public.research_item_topics relation where relation.research_item_id = item.id and relation.is_published);
  return affected;
end;
$$;

create or replace function public.reindex_trial_source_records(p_source_id text, p_external_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare record_ids bigint[]; affected integer := 0;
begin
  select coalesce(array_agg(id), '{}') into record_ids from public.clinical_trials
  where source_id = p_source_id and external_id = any(coalesce(p_external_ids, '{}'));
  affected := coalesce(cardinality(record_ids), 0);
  if affected = 0 then return 0; end if;
  delete from public.clinical_trial_topics relation
  where relation.clinical_trial_id = any(record_ids) and relation.matched_by <> 'curated-rule';
  insert into public.clinical_trial_topics(
    clinical_trial_id, topic_slug, matched_by, relevance_score,
    match_reasons, matched_fields, is_published, evaluated_at
  )
  select trial.id, topic.slug, 'source-query', (assessment->>'score')::smallint,
    assessment->'reasons', array(select jsonb_array_elements_text(assessment->'matched_fields')),
    (assessment->>'publish')::boolean, now()
  from public.clinical_trials trial
  cross join public.intelligence_topics topic
  cross join lateral public.topic_match_assessment(
    topic.slug, trial.title, trial.brief_summary,
    array_to_string(trial.controlled_terms, ' '), trial.study_type
  ) as matched(assessment)
  where trial.id = any(record_ids) and topic.enabled and (assessment->>'publish')::boolean
  on conflict (clinical_trial_id, topic_slug) do update set
    matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
    match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
    is_published = excluded.is_published, evaluated_at = excluded.evaluated_at;
  perform public.refresh_trial_quality(record_ids);
  update public.clinical_trials trial set
    relevance_confidence = 0, publication_state = 'quarantined',
    match_explanation = 'Quarantined automatically because no publishable relationship remained after the complete taxonomy evaluation.',
    quality_checked_at = now()
  where trial.id = any(record_ids)
    and not exists (select 1 from public.clinical_trial_topics relation where relation.clinical_trial_id = trial.id and relation.is_published);
  return affected;
end;
$$;

create or replace function public.refresh_topic_coverage_readiness()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  active_version text;
  research_done boolean := false;
  trials_done boolean := false;
  updated_count integer;
begin
  select taxonomy_version into active_version
  from public.topic_taxonomy_reindex_runs
  order by started_at desc limit 1;
  active_version := coalesce(active_version, 'not-started');
  select coalesce(bool_and(status = 'complete'), false) into research_done
  from public.topic_taxonomy_reindex_runs where taxonomy_version = active_version and entity_kind = 'research';
  select coalesce(bool_and(status = 'complete'), false) into trials_done
  from public.topic_taxonomy_reindex_runs where taxonomy_version = active_version and entity_kind = 'trials';

  insert into public.topic_coverage_readiness(
    topic_slug, taxonomy_version, research_reindexed, trials_reindexed,
    research_history_expected, research_history_complete,
    trial_history_expected, trial_history_complete,
    university_history_complete, failed_history_streams,
    invalid_public_matches, ready, blockers, checked_at
  )
  select topic.slug, active_version, research_done, trials_done,
    history.research_expected, history.research_complete,
    history.trial_expected, history.trial_complete,
    coalesce(university.phase = 'complete' and university.last_error is null, false),
    history.failed_streams, quality.invalid_matches,
    research_done and trials_done
      and history.research_expected > 0 and history.research_complete = history.research_expected
      and history.trial_expected > 0 and history.trial_complete = history.trial_expected
      and coalesce(university.phase = 'complete' and university.last_error is null, false)
      and history.failed_streams = 0 and quality.invalid_matches = 0,
    to_jsonb(array_remove(array[
      case when not research_done then 'Research corpus taxonomy reindex is incomplete.' end,
      case when not trials_done then 'Trial corpus taxonomy reindex is incomplete.' end,
      case when history.research_expected = 0 then 'No approved live research history source is configured.'
           when history.research_complete < history.research_expected then format('%s of %s approved research history streams are incomplete.', history.research_expected - history.research_complete, history.research_expected) end,
      case when history.trial_expected = 0 then 'No approved live trial history source is configured.'
           when history.trial_complete < history.trial_expected then format('%s of %s approved trial history streams are incomplete.', history.trial_expected - history.trial_complete, history.trial_expected) end,
      case when not coalesce(university.phase = 'complete' and university.last_error is null, false) then 'University history for this topic is incomplete.' end,
      case when history.failed_streams > 0 then format('%s approved historical streams require recovery.', history.failed_streams) end,
      case when quality.invalid_matches > 0 then format('%s public relationships failed the match-quality rule.', quality.invalid_matches) end
    ], null)), now()
  from public.intelligence_topics topic
  left join public.university_topic_sync_state university on university.topic_slug = topic.slug
  cross join lateral (
    select
      count(*) filter (where source.kind = 'literature')::integer research_expected,
      count(*) filter (where source.kind = 'literature' and job.status = 'succeeded')::integer research_complete,
      count(*) filter (where source.kind = 'trial_registry')::integer trial_expected,
      count(*) filter (where source.kind = 'trial_registry' and job.status = 'succeeded')::integer trial_complete,
      count(*) filter (where job.status = 'dead')::integer failed_streams
    from public.content_sources source
    left join public.ingestion_jobs job
      on job.source_id = source.id and job.topic_slug = topic.slug and job.sync_mode = 'history'
    where source.enabled and source.automated_ingestion_allowed and source.public_display_allowed
      and source.id in ('pubmed', 'europe-pmc', 'doaj', 'clinicaltrials-gov', 'isrctn')
  ) history
  cross join lateral (
    select (
      select count(*) from public.research_item_topics relation
      where relation.topic_slug = topic.slug and relation.is_published and relation.relevance_score < 60
    ) + (
      select count(*) from public.clinical_trial_topics relation
      where relation.topic_slug = topic.slug and relation.is_published and relation.relevance_score < 60
    ) invalid_matches
  ) quality
  where topic.enabled
  on conflict (topic_slug) do update set
    taxonomy_version = excluded.taxonomy_version,
    research_reindexed = excluded.research_reindexed,
    trials_reindexed = excluded.trials_reindexed,
    research_history_expected = excluded.research_history_expected,
    research_history_complete = excluded.research_history_complete,
    trial_history_expected = excluded.trial_history_expected,
    trial_history_complete = excluded.trial_history_complete,
    university_history_complete = excluded.university_history_complete,
    failed_history_streams = excluded.failed_history_streams,
    invalid_public_matches = excluded.invalid_public_matches,
    ready = excluded.ready,
    blockers = excluded.blockers,
    checked_at = excluded.checked_at;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.process_topic_taxonomy_reindex(requested_batch_size integer default 150)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_row public.topic_taxonomy_reindex_runs%rowtype;
  record_ids bigint[];
  batch_count integer := 0;
  batch_last_id bigint := 0;
  current_max bigint := 0;
  batch_size integer := greatest(10, least(coalesce(requested_batch_size, 150), 500));
begin
  select * into run_row
  from public.topic_taxonomy_reindex_runs
  where status in ('pending', 'running')
  order by case entity_kind when 'research' then 0 else 1 end, updated_at
  limit 1 for update skip locked;
  if not found then
    perform public.refresh_topic_coverage_readiness();
    return jsonb_build_object('status', 'idle');
  end if;
  update public.topic_taxonomy_reindex_runs
  set status = 'running', updated_at = now(), last_error = null
  where taxonomy_version = run_row.taxonomy_version and entity_kind = run_row.entity_kind;

  if run_row.entity_kind = 'research' then
    select coalesce(array_agg(id order by id), '{}'), count(*), coalesce(max(id), run_row.cursor_id)
      into record_ids, batch_count, batch_last_id
    from (
      select id from public.research_items
      where id > run_row.cursor_id and id <= run_row.upper_bound_id
      order by id limit batch_size
    ) batch;
    if batch_count > 0 then
      delete from public.research_item_topics relation
      where relation.research_item_id = any(record_ids) and relation.matched_by <> 'curated-rule';
      insert into public.research_item_topics(
        research_item_id, topic_slug, matched_by, relevance_score,
        match_reasons, matched_fields, is_published, evaluated_at
      )
      select item.id, topic.slug, 'source-query', (assessment->>'score')::smallint,
        assessment->'reasons', array(select jsonb_array_elements_text(assessment->'matched_fields')),
        (assessment->>'publish')::boolean, now()
      from public.research_items item
      cross join public.intelligence_topics topic
      cross join lateral public.topic_match_assessment(
        topic.slug, item.title, item.abstract_text,
        array_to_string(item.controlled_terms, ' '), item.publication_type
      ) as matched(assessment)
      where item.id = any(record_ids) and topic.enabled
        and (assessment->>'publish')::boolean
      on conflict (research_item_id, topic_slug) do update set
        matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
        match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
        is_published = excluded.is_published, evaluated_at = excluded.evaluated_at;
      perform public.refresh_research_quality(record_ids);
      update public.research_items item set
        relevance_confidence = 0, publication_state = 'quarantined',
        match_explanation = 'Quarantined automatically because no publishable relationship remained after the complete taxonomy reindex.',
        quality_checked_at = now()
      where item.id = any(record_ids)
        and not exists (select 1 from public.research_item_topics relation where relation.research_item_id = item.id and relation.is_published);
    end if;
  else
    select coalesce(array_agg(id order by id), '{}'), count(*), coalesce(max(id), run_row.cursor_id)
      into record_ids, batch_count, batch_last_id
    from (
      select id from public.clinical_trials
      where id > run_row.cursor_id and id <= run_row.upper_bound_id
      order by id limit batch_size
    ) batch;
    if batch_count > 0 then
      delete from public.clinical_trial_topics relation
      where relation.clinical_trial_id = any(record_ids) and relation.matched_by <> 'curated-rule';
      insert into public.clinical_trial_topics(
        clinical_trial_id, topic_slug, matched_by, relevance_score,
        match_reasons, matched_fields, is_published, evaluated_at
      )
      select trial.id, topic.slug, 'source-query', (assessment->>'score')::smallint,
        assessment->'reasons', array(select jsonb_array_elements_text(assessment->'matched_fields')),
        (assessment->>'publish')::boolean, now()
      from public.clinical_trials trial
      cross join public.intelligence_topics topic
      cross join lateral public.topic_match_assessment(
        topic.slug, trial.title, trial.brief_summary,
        array_to_string(trial.controlled_terms, ' '), trial.study_type
      ) as matched(assessment)
      where trial.id = any(record_ids) and topic.enabled
        and (assessment->>'publish')::boolean
      on conflict (clinical_trial_id, topic_slug) do update set
        matched_by = excluded.matched_by, relevance_score = excluded.relevance_score,
        match_reasons = excluded.match_reasons, matched_fields = excluded.matched_fields,
        is_published = excluded.is_published, evaluated_at = excluded.evaluated_at;
      perform public.refresh_trial_quality(record_ids);
      update public.clinical_trials trial set
        relevance_confidence = 0, publication_state = 'quarantined',
        match_explanation = 'Quarantined automatically because no publishable relationship remained after the complete taxonomy reindex.',
        quality_checked_at = now()
      where trial.id = any(record_ids)
        and not exists (select 1 from public.clinical_trial_topics relation where relation.clinical_trial_id = trial.id and relation.is_published);
    end if;
  end if;

  if batch_count > 0 then
    update public.topic_taxonomy_reindex_runs set
      cursor_id = batch_last_id,
      records_processed = records_processed + batch_count,
      status = 'pending', updated_at = now()
    where taxonomy_version = run_row.taxonomy_version and entity_kind = run_row.entity_kind;
  else
    if run_row.entity_kind = 'research' then select coalesce(max(id), 0) into current_max from public.research_items;
    else select coalesce(max(id), 0) into current_max from public.clinical_trials; end if;
    if current_max > run_row.upper_bound_id then
      update public.topic_taxonomy_reindex_runs
      set upper_bound_id = current_max, status = 'pending', updated_at = now()
      where taxonomy_version = run_row.taxonomy_version and entity_kind = run_row.entity_kind;
    else
      update public.topic_taxonomy_reindex_runs
      set status = 'complete', completed_at = now(), updated_at = now()
      where taxonomy_version = run_row.taxonomy_version and entity_kind = run_row.entity_kind;
    end if;
  end if;
  perform public.refresh_topic_coverage_readiness();
  return jsonb_build_object(
    'status', case when batch_count > 0 then 'processed' else 'checkpoint' end,
    'taxonomy_version', run_row.taxonomy_version,
    'entity_kind', run_row.entity_kind,
    'records_processed', batch_count,
    'cursor_id', batch_last_id
  );
exception when others then
  update public.topic_taxonomy_reindex_runs set status = 'failed', last_error = sqlerrm, updated_at = now()
  where taxonomy_version = run_row.taxonomy_version and entity_kind = run_row.entity_kind;
  raise;
end;
$$;

create or replace function public.get_topic_readiness_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'taxonomy_version', coalesce((select taxonomy_version from public.topic_taxonomy_reindex_runs order by started_at desc limit 1), 'not-started'),
    'ready_topics', count(*) filter (where ready),
    'total_topics', count(*),
    'reindex_runs', coalesce((select jsonb_agg(to_jsonb(run_row) order by entity_kind) from (
      select taxonomy_version, entity_kind, status, cursor_id, upper_bound_id,
             records_processed, started_at, completed_at, last_error, updated_at
      from public.topic_taxonomy_reindex_runs
      where taxonomy_version = (select taxonomy_version from public.topic_taxonomy_reindex_runs order by started_at desc limit 1)
    ) run_row), '[]'::jsonb),
    'topics', coalesce(jsonb_agg(jsonb_build_object(
      'slug', topic_slug, 'ready', ready, 'blockers', blockers,
      'research_history', jsonb_build_object('complete', research_history_complete, 'expected', research_history_expected),
      'trial_history', jsonb_build_object('complete', trial_history_complete, 'expected', trial_history_expected),
      'university_history_complete', university_history_complete,
      'checked_at', checked_at
    ) order by ready desc, topic_slug), '[]'::jsonb)
  ) from public.topic_coverage_readiness;
$$;

-- Generalize the material-change watcher to every topic that has a published,
-- versioned interpretation. Readiness controls publication; new facts never
-- silently overwrite a conclusion.
create or replace function public.assess_topic_dossier_material_change()
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
  dossier_topic text;
begin
  if coalesce(cardinality(new.topic_slugs), 0) = 0 or new.event_type = 'quality_state_changed' then return new; end if;
  if new.record_type = 'integrity' then
    materiality := 'critical'; reason := 'A correction, retraction, withdrawal, or expression of concern can change how indexed evidence should be read.';
  elsif new.record_type = 'regulatory' then
    materiality := 'critical'; reason := 'A new official notice can materially change the safety or regulatory context.';
  elsif new.record_type = 'research' then
    select evidence_level, status into level, record_status from public.research_items where id = new.record_id;
    if lower(coalesce(record_status, '')) = 'retracted' then materiality := 'critical'; reason := 'A matched research record was retracted.';
    elsif level in ('human-synthesis', 'randomized-human', 'human-study') then materiality := 'meaningful'; reason := 'New human evidence may affect the current evidence boundary.';
    else return new; end if;
  elsif new.record_type = 'trials' then
    select clinical_trials.phases, coalesce((clinical_trials.metadata->>'source_has_results')::boolean, false)
      into phases, has_results from public.clinical_trials where id = new.record_id;
    if has_results then materiality := 'meaningful'; reason := 'A matched trial now reports posted results.';
    elsif new.event_type = 'trial_status_changed' then materiality := 'meaningful'; reason := 'A material registry status change may alter the clinical-development picture.';
    elsif phases && array['PHASE2', 'PHASE3', 'PHASE4']::text[] then materiality := 'meaningful'; reason := 'A newly indexed later-phase trial may alter the clinical-development picture.';
    else return new; end if;
  else return new;
  end if;

  for dossier_topic in
    select distinct candidate.topic_slug from unnest(new.topic_slugs) candidate(topic_slug)
    where exists (select 1 from public.topic_dossier_versions version where version.topic_slug = candidate.topic_slug and version.status = 'current')
  loop
    snapshot := public.get_topic_evidence_snapshot(dossier_topic);
    next_fingerprint := public.topic_dossier_evidence_fingerprint(snapshot);
    select evidence_fingerprint into current_fingerprint from public.topic_dossier_versions
    where topic_slug = dossier_topic and status = 'current';
    insert into public.topic_dossier_change_candidates(
      topic_slug, event_id, materiality, reason, previous_fingerprint, current_fingerprint, evidence_state
    ) values (
      dossier_topic, new.id, materiality, reason, coalesce(current_fingerprint, next_fingerprint), next_fingerprint, snapshot
    ) on conflict (topic_slug, event_id) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists assess_senolytics_change on public.intelligence_change_events;
drop trigger if exists assess_topic_dossier_change on public.intelligence_change_events;
drop function if exists public.assess_senolytics_material_change();
create trigger assess_topic_dossier_change
after insert or update of topic_slugs, event_type, importance on public.intelligence_change_events
for each row execute function public.assess_topic_dossier_material_change();

create or replace function public.get_topic_dossier_pilot(requested_topic text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare current_version jsonb; pending jsonb; snapshot jsonb;
begin
  select to_jsonb(version_row) - 'status' - 'created_at' into current_version
  from public.topic_dossier_versions version_row
  where topic_slug = requested_topic and status = 'current';
  if current_version is null then return null; end if;
  snapshot := public.get_topic_evidence_snapshot(requested_topic);
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
declare snapshot jsonb; next_version integer; inserted_id bigint;
begin
  if not coalesce((select ready from public.topic_coverage_readiness where topic_slug = requested_topic), false) then
    raise exception 'Topic % is not ready for a published interpretation', requested_topic;
  end if;
  if jsonb_typeof(requested_conclusions) <> 'array' or jsonb_array_length(requested_conclusions) = 0 then
    raise exception 'Conclusions must be a non-empty array';
  end if;
  perform pg_advisory_xact_lock(hashtext('topic-dossier:' || requested_topic));
  select coalesce(max(version_number), 0) + 1 into next_version from public.topic_dossier_versions where topic_slug = requested_topic;
  snapshot := public.get_topic_evidence_snapshot(requested_topic);
  update public.topic_dossier_versions set status = 'superseded', superseded_at = now()
  where topic_slug = requested_topic and status = 'current';
  insert into public.topic_dossier_versions(
    topic_slug, version_number, status, conclusions, evidence_state, evidence_fingerprint, change_summary
  ) values (
    requested_topic, next_version, 'current', requested_conclusions, snapshot,
    public.topic_dossier_evidence_fingerprint(snapshot), left(trim(requested_change_summary), 1000)
  ) returning id into inserted_id;
  update public.topic_dossier_change_candidates set status = 'applied', resolved_at = now()
  where topic_slug = requested_topic and id = any(coalesce(applied_candidate_ids, '{}'));
  return inserted_id;
end;
$$;

revoke all on function public.topic_normalize_match_text(text),
  public.topic_match_assessment(text,text,text,text,text),
  public.start_topic_taxonomy_reindex(text),
  public.reindex_research_source_records(text,text[]),
  public.reindex_trial_source_records(text,text[]),
  public.refresh_topic_coverage_readiness(),
  public.process_topic_taxonomy_reindex(integer),
  public.get_topic_readiness_report(),
  public.assess_topic_dossier_material_change(),
  public.get_topic_dossier_pilot(text),
  public.publish_topic_dossier_version(text,jsonb,text,bigint[]) from public, anon, authenticated;
grant execute on function public.topic_normalize_match_text(text),
  public.topic_match_assessment(text,text,text,text,text),
  public.start_topic_taxonomy_reindex(text),
  public.reindex_research_source_records(text,text[]),
  public.reindex_trial_source_records(text,text[]),
  public.refresh_topic_coverage_readiness(),
  public.process_topic_taxonomy_reindex(integer),
  public.get_topic_readiness_report(),
  public.assess_topic_dossier_material_change(),
  public.get_topic_dossier_pilot(text),
  public.publish_topic_dossier_version(text,jsonb,text,bigint[]) to service_role;

select public.start_topic_taxonomy_reindex('longevity-taxonomy-180-v1');
select public.refresh_topic_coverage_readiness();

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-taxonomy-reindex' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-taxonomy-reindex',
    '* 0-5 * * *',
    $job$select public.process_topic_taxonomy_reindex(150);$job$
  );
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-topic-readiness-refresh' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-topic-readiness-refresh',
    '*/15 * * * *',
    $job$select public.refresh_topic_coverage_readiness();$job$
  );
end
$schedule$;

notify pgrst, 'reload schema';
