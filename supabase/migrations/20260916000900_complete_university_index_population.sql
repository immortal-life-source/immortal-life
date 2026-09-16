-- Complete the bootstrap after aligning the institution fields with OpenAlex.
select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"openalex-compatible-bootstrap"}'::jsonb,
  timeout_milliseconds := 150000
);
