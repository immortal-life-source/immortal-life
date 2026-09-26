-- Private daily management reporting. Search and operational data stay behind
-- service-role access and are delivered only to the requested owner address.

alter table public.university_research_works
  add column if not exists first_seen_at timestamptz;

create or replace function public.set_university_work_first_seen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.first_seen_at is null then new.first_seen_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists university_work_first_seen_before_insert on public.university_research_works;
create trigger university_work_first_seen_before_insert
before insert on public.university_research_works
for each row execute function public.set_university_work_first_seen();

create index if not exists university_research_works_first_seen_idx
  on public.university_research_works(first_seen_at desc)
  where first_seen_at is not null;

create table if not exists public.daily_management_reports (
  id bigint generated always as identity primary key,
  report_date date not null,
  destination text not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  provider_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists daily_management_reports_sent_day_idx
  on public.daily_management_reports(report_date)
  where status = 'sent';

alter table public.daily_management_reports enable row level security;
revoke all on table public.daily_management_reports from public, anon, authenticated;
grant all on table public.daily_management_reports to service_role;
revoke all on function public.set_university_work_first_seen() from public, anon, authenticated;
grant execute on function public.set_university_work_first_seen() to service_role;

-- pg_cron is UTC. Calling at 17:00 and 18:00 UTC covers both Prague daylight
-- and standard time; the Edge Function sends only when Prague local time is 19.
do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-daily-management-report' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-daily-management-report',
    '0 17,18 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/daily-management-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;
