-- Retry the initial population with the paced, rate-limit-aware importer.
select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"rate-limit-aware-bootstrap"}'::jsonb,
  timeout_milliseconds := 150000
);
