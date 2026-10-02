-- Keep the full ingestion corpus moving while the complete research taxonomy
-- rebuild is active. PubMed and Europe PMC retain their schedules and their
-- incremental jobs; this small expiring lease only prevents their largest
-- database write slices from overlapping. The lease is self-healing if an
-- Edge invocation terminates unexpectedly.

alter table public.ingestion_jobs
  add column if not exists database_timeout_count integer not null default 0;

alter table public.ingestion_jobs
  drop constraint if exists ingestion_jobs_database_timeout_count_check;
alter table public.ingestion_jobs
  add constraint ingestion_jobs_database_timeout_count_check
  check (database_timeout_count between 0 and 20);

create table if not exists public.ingestion_worker_leases (
  lease_key text primary key,
  holder text not null,
  source_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint ingestion_worker_leases_key_check check (length(lease_key) between 1 and 120),
  constraint ingestion_worker_leases_holder_check check (length(holder) between 1 and 240)
);

alter table public.ingestion_worker_leases enable row level security;
revoke all on table public.ingestion_worker_leases from public, anon, authenticated;
grant all on table public.ingestion_worker_leases to service_role;

create or replace function public.try_acquire_ingestion_worker_lease(
  p_lease_key text,
  p_holder text,
  p_source_id text,
  p_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
  safe_ttl integer := greatest(30, least(coalesce(p_ttl_seconds, 180), 600));
begin
  if nullif(btrim(p_lease_key), '') is null
    or nullif(btrim(p_holder), '') is null
    or nullif(btrim(p_source_id), '') is null then
    raise exception 'lease key, holder, and source are required';
  end if;

  insert into public.ingestion_worker_leases (
    lease_key, holder, source_id, expires_at, updated_at
  ) values (
    btrim(p_lease_key),
    btrim(p_holder),
    btrim(p_source_id),
    now() + make_interval(secs => safe_ttl),
    now()
  )
  on conflict (lease_key) do update
    set holder = excluded.holder,
        source_id = excluded.source_id,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.ingestion_worker_leases.expires_at <= now()
       or public.ingestion_worker_leases.holder = excluded.holder
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_ingestion_worker_lease(
  p_lease_key text,
  p_holder text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released boolean := false;
begin
  update public.ingestion_worker_leases
  set expires_at = now(), updated_at = now()
  where lease_key = btrim(p_lease_key)
    and holder = btrim(p_holder)
  returning true into released;
  return coalesce(released, false);
end;
$$;

revoke all on function public.try_acquire_ingestion_worker_lease(text, text, text, integer),
  public.release_ingestion_worker_lease(text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_ingestion_worker_lease(text, text, text, integer),
  public.release_ingestion_worker_lease(text, text) to service_role;

comment on table public.ingestion_worker_leases is
  'Private, expiring coordination leases for ingestion workers; never stores source records.';
comment on column public.ingestion_jobs.database_timeout_count is
  'Consecutive database statement timeouts for the current durable page; controls timeout-specific batch reduction.';

notify pgrst, 'reload schema';
