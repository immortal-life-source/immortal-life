-- Retry Europe PMC pages after reducing the resumable API/database page from
-- 1,000 to 250 records. Preserve the cursor so no completed range is repeated.

update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  last_error = null, updated_at = now()
where source_id = 'europe-pmc'
  and status = 'retry'
  and last_error like 'research page upsert: canceling statement due to statement timeout%';
