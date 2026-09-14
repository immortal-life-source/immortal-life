-- Autonomous longevity intelligence portal.
-- Public clients never access these tables directly; the public-intelligence
-- Edge Function exposes a deliberately limited, read-only representation.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.content_sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('literature', 'trial_registry', 'regulatory')),
  homepage_url text not null,
  api_url text not null,
  terms_url text not null,
  update_cadence text not null,
  enabled boolean not null default true,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_topics (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique,
  description text not null,
  literature_query text not null,
  trials_query text not null,
  sort_order integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_items (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id),
  external_id text not null,
  title text not null,
  authors text,
  journal text,
  published_on date,
  doi text,
  publication_type text,
  evidence_level text not null check (
    evidence_level in ('human-synthesis', 'randomized-human', 'human-study', 'preclinical', 'preprint', 'research-record')
  ),
  source_url text not null,
  is_open_access boolean,
  cited_by_count integer check (cited_by_count is null or cited_by_count >= 0),
  editorial_summary text not null,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'published' check (status in ('published', 'corrected', 'retracted', 'withdrawn')),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create index if not exists research_items_published_on_idx
  on public.research_items (published_on desc nulls last, id desc);
create index if not exists research_items_doi_idx
  on public.research_items (doi) where doi is not null;

create table if not exists public.research_item_topics (
  research_item_id bigint not null references public.research_items(id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  matched_by text not null default 'source-query' check (matched_by in ('source-query', 'identifier', 'curated-rule')),
  created_at timestamptz not null default now(),
  primary key (research_item_id, topic_slug)
);

create index if not exists research_item_topics_topic_idx
  on public.research_item_topics (topic_slug, research_item_id desc);

create table if not exists public.clinical_trials (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id),
  external_id text not null,
  title text not null,
  brief_summary text,
  overall_status text not null,
  phases text[] not null default '{}',
  study_type text,
  sponsor text,
  enrollment integer check (enrollment is null or enrollment >= 0),
  countries text[] not null default '{}',
  start_date date,
  completion_date date,
  last_update_date date,
  source_url text not null,
  editorial_summary text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create index if not exists clinical_trials_updated_idx
  on public.clinical_trials (last_update_date desc nulls last, id desc);
create index if not exists clinical_trials_status_idx
  on public.clinical_trials (overall_status, last_update_date desc nulls last);

create table if not exists public.clinical_trial_topics (
  clinical_trial_id bigint not null references public.clinical_trials(id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  matched_by text not null default 'source-query' check (matched_by in ('source-query', 'identifier', 'curated-rule')),
  created_at timestamptz not null default now(),
  primary key (clinical_trial_id, topic_slug)
);

create index if not exists clinical_trial_topics_topic_idx
  on public.clinical_trial_topics (topic_slug, clinical_trial_id desc);

create table if not exists public.ingestion_jobs (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id),
  topic_slug text not null references public.intelligence_topics(slug),
  window_start timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'retry', 'succeeded', 'dead')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  items_seen integer not null default 0 check (items_seen >= 0),
  items_written integer not null default 0 check (items_written >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, topic_slug, window_start)
);

create index if not exists ingestion_jobs_work_idx
  on public.ingestion_jobs (status, available_at, created_at);

create table if not exists public.ingestion_runs (
  id bigint generated always as identity primary key,
  trigger_kind text not null check (trigger_kind in ('schedule', 'manual', 'recovery')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  jobs_processed integer not null default 0,
  items_seen integer not null default 0,
  items_written integer not null default 0,
  errors integer not null default 0,
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.intelligence_runtime_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $setup$
declare
  generated_token text;
begin
  if not exists (
    select 1 from public.intelligence_runtime_config where key = 'sync_secret_sha256'
  ) then
    generated_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      generated_token,
      'intelligence_sync_secret',
      'Generated credential for the autonomous longevity intelligence scheduler'
    );
    insert into public.intelligence_runtime_config (key, value)
    values ('sync_secret_sha256', encode(extensions.digest(generated_token, 'sha256'), 'hex'));
  end if;
end
$setup$;

create or replace function public.get_intelligence_topic_counts()
returns table (
  slug text,
  name text,
  description text,
  sort_order integer,
  research_count bigint,
  trial_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    topic.slug,
    topic.name,
    topic.description,
    topic.sort_order,
    (select count(*) from public.research_item_topics rit where rit.topic_slug = topic.slug) as research_count,
    (select count(*) from public.clinical_trial_topics ctt where ctt.topic_slug = topic.slug) as trial_count
  from public.intelligence_topics topic
  where topic.enabled = true
  order by topic.sort_order;
$$;

revoke all on function public.get_intelligence_topic_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_counts() to service_role;

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence)
values
  (
    'europe-pmc',
    'Europe PMC',
    'literature',
    'https://europepmc.org/',
    'https://www.ebi.ac.uk/europepmc/webservices/rest/',
    'https://europepmc.org/RestfulWebService',
    'Every 6 hours'
  ),
  (
    'clinicaltrials-gov',
    'ClinicalTrials.gov',
    'trial_registry',
    'https://clinicaltrials.gov/',
    'https://clinicaltrials.gov/api/v2/',
    'https://clinicaltrials.gov/about-site/terms-conditions',
    'Every 6 hours; source refreshes on business days'
  )
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  homepage_url = excluded.homepage_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  update_cadence = excluded.update_cadence,
  updated_at = now();

insert into public.intelligence_topics
  (slug, name, description, literature_query, trials_query, sort_order)
values
  ('rapamycin', 'Rapamycin', 'Research concerning mTOR inhibition, rapalogs, ageing biology, and human translation.', '(rapamycin OR sirolimus OR everolimus) AND (aging OR ageing OR longevity)', '(rapamycin OR sirolimus OR everolimus) AND (aging OR ageing OR longevity)', 10),
  ('senolytics', 'Senolytics', 'Compounds and strategies intended to target senescent cells.', '(senolytic* OR cellular senescence) AND (aging OR ageing OR longevity)', '(senolytic OR cellular senescence) AND (aging OR ageing)', 20),
  ('partial-reprogramming', 'Partial reprogramming', 'Transient cellular reprogramming and epigenetic rejuvenation research.', '(partial reprogramming OR epigenetic reprogramming OR Yamanaka factor*) AND (aging OR ageing OR rejuvenation)', '(partial reprogramming OR epigenetic reprogramming OR Yamanaka factors) AND (aging OR ageing)', 30),
  ('metformin', 'Metformin', 'Human and preclinical research connecting metformin with ageing-related outcomes.', 'metformin AND (aging OR ageing OR longevity OR healthspan)', 'metformin AND (aging OR ageing OR longevity OR healthspan)', 40),
  ('glp-1-therapies', 'GLP-1 therapies', 'Research on GLP-1 receptor agonists and ageing-related health outcomes.', '(GLP-1 OR semaglutide OR tirzepatide) AND (aging OR ageing OR longevity OR healthspan)', '(GLP-1 OR semaglutide OR tirzepatide) AND (aging OR ageing OR longevity)', 50),
  ('exercise', 'Exercise', 'Evidence on physical activity, fitness, healthspan, and ageing outcomes.', '(exercise OR physical activity OR cardiorespiratory fitness) AND (aging OR ageing OR longevity OR healthspan)', '(exercise OR physical activity) AND (aging OR ageing OR longevity OR frailty)', 60),
  ('caloric-restriction', 'Caloric restriction', 'Research on energy restriction, fasting, dietary patterns, and ageing biology.', '(caloric restriction OR calorie restriction OR intermittent fasting) AND (aging OR ageing OR longevity OR healthspan)', '(caloric restriction OR calorie restriction OR intermittent fasting) AND (aging OR ageing)', 70),
  ('sleep', 'Sleep', 'Research connecting sleep duration, quality, timing, and ageing-related outcomes.', 'sleep AND (aging OR ageing OR longevity OR healthspan)', 'sleep AND (aging OR ageing OR longevity OR frailty)', 80),
  ('epigenetic-clocks', 'Epigenetic clocks', 'Biological-age measurements based on DNA methylation and related signals.', '(epigenetic clock* OR DNA methylation age OR biological age clock*)', '(epigenetic clock OR DNA methylation age OR biological age) AND (aging OR ageing)', 90),
  ('plasma-exchange', 'Plasma exchange', 'Research involving plasma exchange, plasma dilution, and ageing-related outcomes.', '(plasma exchange OR plasmapheresis OR plasma dilution) AND (aging OR ageing OR rejuvenation)', '(plasma exchange OR plasmapheresis OR plasma dilution) AND (aging OR ageing)', 100),
  ('stem-cells', 'Stem cells', 'Stem-cell research relevant to ageing, regeneration, and age-associated disease.', '(stem cell* OR progenitor cell*) AND (aging OR ageing OR longevity OR rejuvenation)', '(stem cell OR progenitor cell) AND (aging OR ageing OR longevity OR rejuvenation)', 110),
  ('gene-therapy', 'Gene therapy', 'Gene-transfer and genome-editing research relevant to ageing biology.', '(gene therapy OR genome editing OR CRISPR) AND (aging OR ageing OR longevity OR rejuvenation)', '(gene therapy OR genome editing OR CRISPR) AND (aging OR ageing OR longevity)', 120)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  literature_query = excluded.literature_query,
  trials_query = excluded.trials_query,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.content_sources enable row level security;
alter table public.intelligence_topics enable row level security;
alter table public.research_items enable row level security;
alter table public.research_item_topics enable row level security;
alter table public.clinical_trials enable row level security;
alter table public.clinical_trial_topics enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.intelligence_runtime_config enable row level security;

revoke all on table public.content_sources from anon, authenticated;
revoke all on table public.intelligence_topics from anon, authenticated;
revoke all on table public.research_items from anon, authenticated;
revoke all on table public.research_item_topics from anon, authenticated;
revoke all on table public.clinical_trials from anon, authenticated;
revoke all on table public.clinical_trial_topics from anon, authenticated;
revoke all on table public.ingestion_jobs from anon, authenticated;
revoke all on table public.ingestion_runs from anon, authenticated;
revoke all on table public.intelligence_runtime_config from anon, authenticated;

-- Run hourly so retryable jobs recover promptly. The Edge Function itself creates
-- only one idempotent source/topic job for each six-hour content window.
do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'immortal-life-intelligence-sync'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'immortal-life-intelligence-sync',
    '17 * * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-intelligence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'intelligence_sync_secret'
            order by created_at desc
            limit 1
          )
        ),
        body := '{"source":"all","trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
