-- Rights expiry must withdraw previously published material as well as stop
-- future ingestion. Records remain recoverable internally for a later review.
create or replace function public.expire_unreviewed_source_rights()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_ids text[];
  expired_count integer := 0;
begin
  with expired as (
    update public.content_sources
    set automated_ingestion_allowed = false,
        public_display_allowed = false,
        paid_distribution_allowed = false,
        enabled = false,
        updated_at = now()
    where (automated_ingestion_allowed or public_display_allowed or paid_distribution_allowed)
      and (rights_review_due_at is null or rights_review_due_at < current_date)
    returning id
  )
  select coalesce(array_agg(id), '{}'::text[]) into expired_ids from expired;

  expired_count := coalesce(array_length(expired_ids, 1), 0);
  if expired_count > 0 then
    update public.research_items set publication_state = 'quarantined'
      where source_id = any(expired_ids) and publication_state = 'published';
    update public.clinical_trials set publication_state = 'quarantined'
      where source_id = any(expired_ids) and publication_state = 'published';
    update public.regulatory_events set publication_state = 'quarantined'
      where source_id = any(expired_ids) and publication_state = 'published';
    update public.research_integrity_events set publication_state = 'quarantined'
      where source_id = any(expired_ids) and publication_state = 'published';
    delete from public.intelligence_change_events where source_id = any(expired_ids);
  end if;

  update public.global_resources resource
  set integration_status = 'directory',
      automated_ingestion_allowed = false,
      paid_distribution_allowed = false,
      rights_review_due_at = source.rights_review_due_at,
      updated_at = now()
  from public.content_sources source
  where resource.content_source_id = source.id
    and not source.automated_ingestion_allowed;

  return expired_count;
end;
$$;

revoke all on function public.expire_unreviewed_source_rights() from public, anon, authenticated;
grant execute on function public.expire_unreviewed_source_rights() to service_role;
