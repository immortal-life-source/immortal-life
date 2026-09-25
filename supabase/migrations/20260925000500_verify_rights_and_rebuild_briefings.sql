-- Production assertions make the policy deploy fail rather than silently expose
-- a source outside its approved use. Rebuild generated briefings after the
-- pre-policy cache was cleared by the preceding migration.

do $$
begin
  if exists (
    select 1 from public.content_sources
    where paid_distribution_allowed
      and (rights_class <> 'commercial' or not automated_ingestion_allowed or not public_display_allowed)
  ) then raise exception 'Invalid paid-distribution source policy'; end if;

  if exists (
    select 1 from public.global_resources
    where id = 'who-ictrp'
      and (automated_ingestion_allowed or paid_distribution_allowed or integration_status = 'live')
  ) then raise exception 'WHO ICTRP must remain directory-only'; end if;

  if exists (
    select 1 from public.research_items item join public.content_sources source on source.id = item.source_id
    where item.publication_state = 'published' and not source.public_display_allowed
  ) or exists (
    select 1 from public.clinical_trials item join public.content_sources source on source.id = item.source_id
    where item.publication_state = 'published' and not source.public_display_allowed
  ) or exists (
    select 1 from public.regulatory_events item join public.content_sources source on source.id = item.source_id
    where item.publication_state = 'published' and not source.public_display_allowed
  ) or exists (
    select 1 from public.research_integrity_events item join public.content_sources source on source.id = item.source_id
    where item.publication_state = 'published' and not source.public_display_allowed
  ) then raise exception 'A non-cleared source still has a published record'; end if;
end
$$;

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/generate-public-briefing',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"rights-policy-rebuild"}'::jsonb,
  timeout_milliseconds := 150000
);

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/generate-briefings',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"rights-policy-rebuild"}'::jsonb,
  timeout_milliseconds := 150000
);
