-- Aggregate, identifier-free product analytics. These events describe which
-- public paths and features are used; they do not store visitor identifiers,
-- cookies, IP addresses, user agents, referrers, or search text.

alter table public.utility_event_daily
  drop constraint if exists utility_event_daily_event_name_check;

alter table public.utility_event_daily
  add constraint utility_event_daily_event_name_check check (event_name in (
    'page_view', 'site_search', 'filter_used', 'dossier_opened',
    'comparison_started', 'comparison_completed',
    'open_source', 'create_watch', 'remove_watch', 'open_change',
    'download_dataset', 'copy_embed', 'subscribe_briefing', 'share_record'
  ));

create or replace function public.increment_utility_event(p_event_name text, p_page_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_name not in (
    'page_view', 'site_search', 'filter_used', 'dossier_opened',
    'comparison_started', 'comparison_completed',
    'open_source', 'create_watch', 'remove_watch', 'open_change',
    'download_dataset', 'copy_embed', 'subscribe_briefing', 'share_record'
  ) then
    raise exception 'invalid event';
  end if;
  if p_page_path !~ '^/[a-zA-Z0-9/_\-\.]{0,240}$' then raise exception 'invalid path'; end if;
  insert into public.utility_event_daily (metric_date, event_name, page_path, event_count)
  values (current_date, p_event_name, p_page_path, 1)
  on conflict (metric_date, event_name, page_path) do update
    set event_count = public.utility_event_daily.event_count + 1, updated_at = now();
end;
$$;

revoke all on function public.increment_utility_event(text, text) from public, anon, authenticated;
grant execute on function public.increment_utility_event(text, text) to service_role;

