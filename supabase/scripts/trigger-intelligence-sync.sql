-- Safe manual/recovery trigger. The credential never leaves Supabase Vault.
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
  body := '{"source":"all","trigger":"manual"}'::jsonb,
  timeout_milliseconds := 150000
) as request_id;
