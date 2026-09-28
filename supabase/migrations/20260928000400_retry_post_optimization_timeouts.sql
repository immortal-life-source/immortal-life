-- A small number of pages timed out between the first retry reset and the
-- deployment that removed inline consolidated-quality work. Give exactly
-- those transient pages an immediate clean retry under the optimized path.

update public.ingestion_jobs set
  status = 'pending', attempts = 0, available_at = now(), locked_at = null,
  last_error = null, updated_at = now()
where status = 'retry'
  and last_error like 'canceling statement due to statement timeout%';
