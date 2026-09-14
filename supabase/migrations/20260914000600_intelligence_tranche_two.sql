-- Tranche two: research integrity, regulatory monitoring, member watchlists,
-- generated weekly briefings, evidence graph support, and project news.

alter table public.content_sources drop constraint if exists content_sources_kind_check;
alter table public.content_sources add constraint content_sources_kind_check
  check (kind in ('literature', 'trial_registry', 'integrity', 'regulatory'));

alter table public.research_items add column if not exists integrity_checked_at timestamptz;

create table if not exists public.research_integrity_events (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id),
  external_id text not null,
  research_item_id bigint references public.research_items(id) on delete cascade,
  event_type text not null check (event_type in ('retraction', 'withdrawal', 'correction', 'expression-of-concern', 'update')),
  title text not null,
  summary text not null,
  source_url text not null,
  announced_on date,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create index if not exists research_integrity_events_detected_idx
  on public.research_integrity_events (detected_at desc, id desc);

create table if not exists public.regulatory_events (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id),
  external_id text not null,
  jurisdiction text not null,
  category text not null default 'Regulatory update',
  title text not null,
  summary text not null,
  published_at timestamptz,
  source_url text not null,
  matched_topics text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create index if not exists regulatory_events_published_idx
  on public.regulatory_events (published_at desc nulls last, id desc);

alter table public.ingestion_jobs add column if not exists job_key text;
update public.ingestion_jobs set job_key = topic_slug where job_key is null;
alter table public.ingestion_jobs alter column job_key set not null;
alter table public.ingestion_jobs alter column topic_slug drop not null;
alter table public.ingestion_jobs drop constraint if exists ingestion_jobs_source_id_topic_slug_window_start_key;
create unique index if not exists ingestion_jobs_source_key_window_key
  on public.ingestion_jobs (source_id, job_key, window_start);

create table if not exists public.member_topic_watches (
  member_id bigint not null references public.members(id) on delete cascade,
  topic_slug text not null references public.intelligence_topics(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, topic_slug)
);

create table if not exists public.member_briefing_preferences (
  member_id bigint primary key references public.members(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.member_briefings (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (member_id, period_start)
);

create index if not exists member_briefings_member_date_idx
  on public.member_briefings (member_id, period_start desc);

create table if not exists public.project_news (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  content text not null,
  published_at timestamptz not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence)
values
  ('crossref', 'Crossref and Retraction Watch', 'integrity', 'https://www.crossref.org/', 'https://api.crossref.org/', 'https://www.crossref.org/terms/', 'Every 6 hours'),
  ('ema', 'European Medicines Agency', 'regulatory', 'https://www.ema.europa.eu/', 'https://www.ema.europa.eu/en/news.xml', 'https://www.ema.europa.eu/en/about-us/legal-notice', 'Every 6 hours'),
  ('sukl', 'Czech State Institute for Drug Control (SÚKL)', 'regulatory', 'https://sukl.gov.cz/', 'https://sukl.gov.cz/feed/', 'https://sukl.gov.cz/en/legal-notice/', 'Every 6 hours')
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  homepage_url = excluded.homepage_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  update_cadence = excluded.update_cadence,
  enabled = true,
  updated_at = now();

insert into public.project_news (id, title, content, published_at)
values
  ('autonomous-intelligence-live', 'Autonomous evidence intelligence is live', 'immortal.life now continuously indexes longevity literature and registered clinical trials across twelve tracked topics. Every record links back to its source and carries explicit evidence context.', '2026-09-14T08:00:00+02:00'),
  ('trial-radar-index-launch', 'Trial Radar and the Immortal Index launched', 'The portal now connects hundreds of research and trial records into source-backed topic dossiers that refresh automatically throughout the day.', '2026-09-14T10:00:00+02:00'),
  ('integrity-regulatory-release', 'Integrity and regulatory monitoring enters production', 'Crossref retraction monitoring, European and Czech regulatory feeds, member watchlists, weekly briefings, and the visual evidence graph are being added as the next autonomous product layer.', '2026-09-14T14:00:00+02:00'),
  ('secure-member-platform', 'The member platform is ready for the next chapter', 'Signed sessions, referrals, member ranks, daily activity, and account controls now run on the production backend, creating a secure foundation for personalised intelligence.', '2026-09-13T16:00:00+02:00')
on conflict (id) do update set
  title = excluded.title,
  content = excluded.content,
  published_at = excluded.published_at,
  is_published = true,
  updated_at = now();

alter table public.research_integrity_events enable row level security;
alter table public.regulatory_events enable row level security;
alter table public.member_topic_watches enable row level security;
alter table public.member_briefing_preferences enable row level security;
alter table public.member_briefings enable row level security;
alter table public.project_news enable row level security;

revoke all on table public.research_integrity_events from public, anon, authenticated;
revoke all on table public.regulatory_events from public, anon, authenticated;
revoke all on table public.member_topic_watches from public, anon, authenticated;
revoke all on table public.member_briefing_preferences from public, anon, authenticated;
revoke all on table public.member_briefings from public, anon, authenticated;
revoke all on table public.project_news from public, anon, authenticated;
grant all on table public.research_integrity_events, public.regulatory_events,
  public.member_topic_watches, public.member_briefing_preferences,
  public.member_briefings, public.project_news to service_role;

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-weekly-briefings' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'immortal-life-weekly-briefings',
    '12 6 * * 1',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/generate-briefings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'intelligence_sync_secret'
            order by created_at desc limit 1
          )
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
