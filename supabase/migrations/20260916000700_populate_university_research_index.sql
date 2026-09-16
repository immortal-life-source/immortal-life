-- Start the initial population after the schema and Edge Function are both live.
select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/sync-university-index',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"post-deploy-bootstrap"}'::jsonb,
  timeout_milliseconds := 150000
);
